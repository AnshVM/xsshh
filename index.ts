import { readFileSync } from "fs";
import { Analyzer } from "./engine";


if (process.argv.length == 2) {
    console.log("Usage: bun index.ts [filenames]")
} else {

    for (let i = 2; i < process.argv.length; i++) {
        const filename = process.argv[i]
        if (!filename.endsWith('.js')) {
            console.log(`Invalid file: ${filename}. Only .js files are supported.`)
            continue;
        }
        try {
            const source = readFileSync(filename).toString()
            const analyzer = new Analyzer(source)
            console.log("")
            console.log(filename)
            analyzer.run()
        } catch (error) {
            console.log("Error while reading file: ", error)
        }
    }

}

