const fs = require( 'fs' );
const path = require( 'path' );
const commandLineArgs = require( 'command-line-args' );
// import * as fs from 'fs' ;
// import * as path from 'path'
// import commandLineArgs from 'command-line-args';
// const __dirname = new URL('.', import.meta.url).pathname;

init();

export default function init() {

    console.log( 'Hi ofpkg!' );

    const CWD = process.cwd();
    const EXEC_DIR = path.dirname( process.execPath );

    console.log( 'CWD:', CWD );
    console.log( '__dirname:', __dirname );
    console.log( 'EXEC_DIR:', EXEC_DIR )

    const configPath = path.join( __dirname, '../ofpkg.config.json' );
    const config = getConfig( configPath );
    console.log( 'config:', config );

    const args = getArgs();
    console.log( 'args:', args );

}

function getConfig( configPath ) {

    const configBuf = check( () => fs.readFileSync( configPath ) );
    const configs = check( () => JSON.parse( configBuf ) );

    return configs;

}

function getArgs() {
 
    const claOptions = [
        { name: 'path', type: String, defaultOption: true },
        { name: 'verbose', alias: 'v', type: Boolean },
        { name: 'include', alias: 'i', type: String, multiple: true },
        { name: 'out', alias: 'o', type: String }
    ]
    
    const args = commandLineArgs( claOptions );

    return args;

}

function check( func ) {

    try {
        const result = func();
        return result;
    } catch ( err ) {
        console.log( err );
        return undefined;
    }

}
