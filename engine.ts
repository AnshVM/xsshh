import { generate } from "escodegen";
import { parseScript } from "esprima";
import * as estree from "estree";
import { readFileSync } from "fs";
import Scope, { Sinked } from "./scopes";
import { ExternalModuleReference, forEachChild } from "typescript";

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

class Analyzer {

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
        }
    }


    private functionDeclaration(stmt: estree.FunctionDeclaration) {
        const id = stmt.id?.name;

        const args = stmt.params.map(param => generate(param))

        const sinked = this.blockStatement(stmt.body, stmt, args);

        if (id) {
            const argList = args.map(arg => {
                return sinked.includes(arg)
            })
            this.scope.markSink(id,argList);
        }
    }

    private blockStatement(stmt: estree.BlockStatement, node?: estree.Expression | Statement, args?: string[]): string[] {
        const prevScope = this.scope;
        this.scope = new Scope(this.scope);

        if (args && node) {
            args?.forEach(arg => {
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
            default:
                return [];
        }
    }

    private callExpression(expr: estree.CallExpression): string[] {
        const args = expr.arguments.map(arg => generate(arg));
        const sources = args.filter(arg => this.isSource(arg));

        if(sources.length === 0) return [];

        const callee = generate(expr.callee);
       
        if(isSinkFunction(callee)) {
            this.report(sources,callee,expr);
            return sources;
        }        

        const markedArgs = this.scope.findSink(callee);

        if(markedArgs) {
            args.forEach((arg,i) => {
                if(markedArgs[i] === true && this.isSource(arg)) {
                    this.report([arg],callee,expr);
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
        console.log(`Sources:${sources.join(',')} | -> | Sink: ${sink}`);
        console.log(`At: ${generate(node)}`);
    }

}


const sample = readFileSync('./samples/sample1.js').toString();
const analyzer = new Analyzer(sample);
analyzer.run()
