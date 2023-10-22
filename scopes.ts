import * as estree from 'estree'
type Statement = estree.Statement | estree.Declaration | estree.ModuleDeclaration;

// A source function is any JS property or function that accepts user input from
// somewhere on the page. An example of a source is the location.search
// property because it reads input from the query string.
// BASE_SOURCES stores js variables that are attacker controlled by nature
const BASE_SOURCES = ['document.URL', 'document.documentURI', 'document.URLUnencoded',
    'document.baseURI', 'location.search', 'document.cookie', 'document.referrer']

const isBaseSource = (id: string): boolean => {
    return BASE_SOURCES.includes(id);
}

export type Sinked = {
    source: string,
    sink: string,
    node: Statement | estree.Expression,
}

export type Variable = {
    identifier: string,
    isSource: boolean,
    controllers: string[],
    isFunctionArg: boolean,
    node?: Statement | estree.Expression
}

export default class Scope {
    // Variables which can be controlled by attacker
    variables: Map<string, Variable> = new Map();

    // 'sinks' stores the defined functions which are potential sinks
    // For example : 
    // function doSearchQuery(query) {
    //     run(query)
    //     document.getElementById('searchMessage').innerHTML = query;
    // }
    // Here query is passed to innerHTML, which is a sink.
    // Hence the function doSearchQuery also becomes a sink
    // The map stores the function name as the key
    // And the value is an array of positions of arguments that are sinked inside the functions body
    // In the above example, the sink function would stored in the map with the key 'doSearchQuery'
    // And the value being [0]
    // As the pos of 'query' in the params list is 0
    sinks: Map<string, boolean[]> = new Map();
    // Stores the sources that were sinked
    // The key is the source string and the value is the sink string
    // sinked: Map<string, Sinked> = new Map();
    sinked: string[] = [];

    parent?: Scope;
    children: Scope[] = [];

    constructor(parent?: Scope) {
        this.parent = parent;
        this.parent?.children.push(this);
    }

    isSource(id: string): boolean {
        // TODO: Seperate check isBaseSource from the logic of checking if it is a source 
        // which was defined in current or parent scopes
        // The call to isBaseSource() should not take part in the recursion, it only needs to be 
        // checked once
        if (isBaseSource(id)) {
            return true;
        }
        
        const variable = this.variables.get(id);
        if (variable) {
            return variable.isSource;
        }

        else if (this.parent) {
            return this.parent.isSource(id);
        }
        return false;
    }

    markSource(id: string, sources: string[], node: Statement | estree.Expression, isArg: boolean) {
        const variable = this.variables.get(id);
        if(variable) {
            this.variables.set(id,{
                ...variable,
                isSource:true,
                node,
                controllers: sources,
                isFunctionArg:isArg
            });
        } else if(this.parent) {
            this.parent.markSource(id,sources,node,isArg);
        }
    }

    markSinked(id: string) {
        const variable = this.variables.get(id);
        if(variable && variable.isSource) {
            this.sinked.push(id)
        } else if(this.parent) {
            this.parent.markSinked(id)
        }
    }

    markSink(id: string, argList: boolean[]) {
        this.sinks.set(id, argList);
    }

    findSink(id: string): boolean[] {
        if (this.sinks.has(id)) {
            return this.sinks.get(id) as boolean[];
        }
        if (this.parent) {
            return this.parent.findSink(id);
        }
        return [];
    }

    createVariable(identifier:string,isFunctionArg:boolean) {
        this.variables.set(identifier,{
            identifier,
            isSource:false,
            controllers:[],
            isFunctionArg
        })
    }
}