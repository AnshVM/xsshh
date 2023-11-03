import { generate } from "escodegen";
import { parseScript } from "esprima";
import * as estree from "estree";
import Scope from "./scopes";
import highlight from "cli-highlight";

type Statement = estree.Statement | estree.Declaration | estree.ModuleDeclaration;


// A sink is a potentially dangerous JavaScript function that can cause
// undesirable effects if attacker controlled data is passed to it. Basically, if the
// function returns input back to the screen as output without security checks,
// it’s considered a sink. An example of this would be the “innerHTML”
// property as that changes the contents of the HTML page to
// whatever is given to it.
// The goal is to detect any sources being passed to sinks
const SINK_VARIABLE = /(?:document\.domain|innerHTML|outerHTML|insertAdjacentHTML|onevent)$/;
const isSinkVariable = (input: string) => {
    return SINK_VARIABLE.test(input)
}
const SINK_FUNCTION = /document\.write(In)?/;
const isSinkFunction = (input: string) => {
    return SINK_FUNCTION.test(input)
}

export class Analyzer {

    program: Statement[];
    scope: Scope;

    constructor(source: string) {
        this.program = parseScript(source).body;
        this.scope = new Scope();
    }

    run() {
        this.program.forEach(stmt => {
            this.statement(stmt)
        })
    }

    private statement(stmt: Statement) {
        switch (stmt.type) {
            case 'ExpressionStatement':
                this.expression(stmt.expression);
                break;
            case 'BlockStatement':
                this.blockStatement(stmt)
                break;
            case 'FunctionDeclaration':
                this.functionDeclaration(stmt);
                break;
            case 'DoWhileStatement':
                this.doWhileStatement(stmt);
                break;
            case 'ForStatement':
                this.forStatement(stmt);
                break;
            case 'ForOfStatement':
                this.statement(stmt.body);
                break;
            case 'ForInStatement':
                this.statement(stmt.body);
                break;
            case 'IfStatement':
                this.ifStatement(stmt);
                break;
            case 'LabeledStatement':
                this.statement(stmt.body);
                break;
            case 'SwitchStatement':
                this.switchStatement(stmt);
                break;
            case 'TryStatement':
                this.tryStatement(stmt);
                break;
            case 'VariableDeclaration':
                this.variableDeclaration(stmt);
                break;
        }
    }

    private variableDeclaration(stmt: estree.VariableDeclaration) {
        stmt.declarations.forEach(declaration => {
            if (declaration.id.type === 'Identifier') {
                const id = declaration.id.name;

                let sources: string[] = []
                if (declaration.init) {
                    sources = this.expression(declaration.init)
                }

                this.scope.createVariable(id, false);
                if (sources.length !== 0) {
                    this.scope.markSource(id, sources, stmt, false);
                }
            }
        })
    }

    private tryStatement(stmt: estree.TryStatement) {
        this.blockStatement(stmt.block);
        stmt.handler && this.statement(stmt.handler?.body);
        stmt.finalizer && this.statement(stmt.finalizer);
    }

    private switchStatement(stmt: estree.SwitchStatement) {
        stmt.cases.forEach(c => {
            c.consequent.forEach(cons => {
                this.statement(cons);
            })
        })
    }

    private ifStatement(stmt: estree.IfStatement) {
        stmt.consequent && this.statement(stmt.consequent);
        stmt.alternate && this.statement(stmt.alternate);
    }

    private forStatement(stmt: estree.ForStatement) {
        if (stmt.init) {
            if (stmt.init.type === 'VariableDeclaration') {
                this.variableDeclaration(stmt.init)
            } else {
                this.expression(stmt.init)
            }
        }

        if (stmt.test) {
            this.expression(stmt.test);
        }

        if (stmt.update) {
            this.expression(stmt.update);
        }

        this.statement(stmt.body);

    }

    private doWhileStatement(stmt: estree.DoWhileStatement) {
        this.expression(stmt.test);
        this.statement(stmt.body);
    }

    private functionDeclaration(stmt: estree.FunctionDeclaration) {
        const id = stmt.id?.name;

        const args = stmt.params.map(param => generate(param))

        const sinked = this.blockStatement(stmt.body, stmt, args);

        if (id) {
            const argList = args.map(arg => {
                return sinked.includes(arg)
            })
            this.scope.markSink(id, argList);
        }
    }

    private blockStatement(stmt: estree.BlockStatement, node?: estree.Expression | Statement, args?: string[]): string[] {
        const prevScope = this.scope;

        this.scope = new Scope(this.scope);

        if (args && node) {
            args?.forEach(arg => {
                this.scope.createVariable(arg, true)
                this.scope.markSource(arg, [], node, true)
            })
        }

        stmt.body.forEach(stmt => {
            this.statement(stmt);
        })

        const sinked = this.scope.sinked;

        this.scope = prevScope;

        return sinked;
    }

    // returns controlled sources in an expression
    private expression(expr: estree.Expression): string[] {
        switch (expr.type) {
            case 'Identifier':
                return this.identifier(expr);
            case 'AssignmentExpression':
                return this.assignment(expr);
            case 'CallExpression':
                return this.callExpression(expr);
            case 'NewExpression':
                return this.newExpression(expr);
            case 'TemplateLiteral':
                return this.templateLiteral(expr);
            case 'MemberExpression':
                return this.memberExpression(expr);
            case 'UpdateExpression':
                return this.expression(expr.argument);
            case 'AwaitExpression':
                return this.expression(expr.argument);
            case 'UnaryExpression':
                return this.expression(expr.argument);
            case 'BinaryExpression':
            case 'LogicalExpression':
                return this.binaryExpression(expr);
            case 'ConditionalExpression':
                return this.conditionalExpression(expr);
            case 'SequenceExpression':
                return this.sequenceExpression(expr);
            default:
                return [];
        }
    }

    private sequenceExpression(expr: estree.SequenceExpression): string[] {
        return expr.expressions
            .map(seq => this.expression(seq))
            .flat();
    }

    private conditionalExpression(expr: estree.ConditionalExpression) {
        const consequent = this.expression(expr.consequent);
        const alternate = this.expression(expr.alternate);
        return [...consequent, ...alternate];
    }

    private binaryExpression(expr: estree.BinaryExpression | estree.LogicalExpression): string[] {
        const left = this.expression(expr.left);
        const right = this.expression(expr.right);
        return [...left, ...right];
    }

    private newExpression(expr: estree.NewExpression): string[] {
        const sources = [];
        for (const arg of expr.arguments) {
            if (arg.type != 'SpreadElement') {
                sources.push(...this.expression(arg))
            }
        }
        return sources;
    }

    private memberExpression(expr: estree.MemberExpression): string[] {

        let sources: string[] = [];
        if (expr.object.type !== 'Super') {
            sources.push(...this.expression(expr.object));
        }
        if (expr.property.type !== 'PrivateIdentifier') {
            sources.push(...this.expression(expr.property));
        }
        
        const str = generate(expr);
        if(this.isSource(str)) {
            sources.push(str);
        }

        return sources;
    }

    private templateLiteral(expr: estree.TemplateLiteral): string[] {
        return expr.expressions
            .map(e => this.expression(e))
            .flat()
    }

    private callExpression(expr: estree.CallExpression): string[] {

        const sources = expr.arguments.map(arg => {
            if(arg.type !== 'SpreadElement')  {
                const sourcesInArg = this.expression(arg)
                return sourcesInArg
            }
            return []
        }).flat()


        if(expr.callee.type !== 'Identifier' && expr.callee.type !== 'Super') {
            sources.push(...this.expression(expr.callee))
        }
        const callee = generate(expr.callee);

        if (isSinkFunction(callee)) {
            this.report(sources, callee, expr);
            return sources;
        }

        const markedArgs = this.scope.findSink(callee);

        if (markedArgs) {
            expr.arguments.forEach((arg, i) => {
                if(arg.type === 'SpreadElement') return;

                const sourcesInArg = this.expression(arg)
                if (markedArgs[i] === true && sourcesInArg.length > 0 ) {
                    this.report(sourcesInArg, callee, expr);
                }
            })
        }

        return sources;
    }

    private assignment(expr: estree.AssignmentExpression): string[] {
        const left = generate(expr.left)
        const sources = this.expression(expr.right);

        if (sources.length === 0) return [];

        if (isSinkVariable(left)) {
            this.report(sources, left, expr);
            return [];
        }

        this.scope.markSource(left, sources, expr, false);
        return [left]
    }

    private identifier(expr: estree.Identifier): string[] {
        const id = expr.name;
        if (this.isSource(id)) {
            return [id];
        }
        return [];
    }

    private isSource(id: string): boolean {
        return this.scope.isSource(id);
    }

    private report(sources: string[], sink: string, node: Statement | estree.Expression) {
        sources.forEach(source => {
            this.scope.markSinked(source);
        })
        console.log('--------------------------------')
        logNode(node)
        console.log('Controlled sources: ',sources.join(','));
        console.log('Sink: ', sink);
    }

}

function logNode(node: Statement | estree.Expression) {
    const code = generate(node);

    const config = {
        language: 'javascript',
        ignoreIllegals: true
    }

    const highlighted = highlight(code,config)

    console.log(highlighted)
}