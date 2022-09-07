const fs = require( 'fs-extra' );
const path = require( 'path' );
const commandLineArgs = require( 'command-line-args' );
const chalk = require( 'chalk' );

// import * as fs from 'fs' ;
// import * as path from 'path'
// import commandLineArgs from 'command-line-args';
// const __dirname = new URL('.', import.meta.url).pathname;

init();

function init() {

    // console.log( 'Hi ofpkg!' );
    console.log( `   
        ┌─┐┌─┐┌─┐┬┌─┌─┐┌┐
        │ │├┤ ├─┘├┴┐│ ┬├┴┐
        └─┘└  ┴  ┴ ┴└─┘┴ ┴ 
    `);


    // Global paths
    const CWD = process.cwd();
    const EXEC_DIR = path.dirname( process.execPath );

    console.log( 'CWD:', CWD );
    console.log( '__dirname:', __dirname );
    console.log( 'EXEC_DIR:', EXEC_DIR )

    // Get config
    const configPath = path.join( __dirname, '..', 'ofpkg.config.json' );
    const config = getConfig( configPath );
    console.log( 'config:', config );
    const OF_DIR = config.ofPath;

    // Process arguments
    const ARGS = getArgs();
    console.log( 'ARGS:', ARGS );

    // const TARGET_PATH = ARGS.target || CWD;
    const TARGET_PATH = ARGS.target && ARGS.target != '.' ? ARGS.target : CWD;
    const OUTPUT_PATH = ARGS.output || path.join( path.dirname( TARGET_PATH ), ( path.basename( TARGET_PATH ) + '-ofpkg' ) );

    console.log( `
    TARGET_PATH: ${TARGET_PATH}
    OUTPUT_PATH: ${OUTPUT_PATH}
    `)

    try {
        copyTargetDirectory( TARGET_PATH, OUTPUT_PATH );
    } catch ( e ) {
        console.log( chalk.red.bold( e.message ) );
        return;
    }

    // Scan addons
    const addonsMakePath = path.join( OUTPUT_PATH, 'addons.make' )
    const addons = getAddons( addonsMakePath );
    console.log( addons )

    // Create local_addons if it doesn't exist.
    const outputLocalAddonsPath = path.join( OUTPUT_PATH, 'local_addons' );
    fs.ensureDirSync( outputLocalAddonsPath );

    const results = addons.map( addon => {

        let addonName = addon;
        const addonFound = ( () => {

            if ( addonName.includes( 'local_addons' ) ) {

                const tokens = addonName.split( '#' );
                const addonPath = tokens[ 0 ].trim();
                const addonUrl = tokens[ 1 ].trim();

                addonName = addonPath.split( '/' )[ 1 ];
                // console.log( 'localAddon', localAddonName, 'addonFound:', localAddonFound)

                if ( !!fs.pathExistsSync( path.join( outputLocalAddonsPath, addonName ) ) ) return true;

                console.log( 'Local addon %s not addonFound, have to download from URL.', addonName );
                return false;

                // try {
                //     console.log( `Cloning ${addonName}...`);
                //     process.spawn( `cd git clone ${url}` );
                // } catch ( err ) {
                //     console.log( err );
                // }

                // TODO: git clone addon from localAddonURL. Gotta test this. (Is this even in scope or should we delegate this to package manager?)

            } else {

                const pathSrc = path.join( OF_DIR, 'addons', addonName );
                if ( !fs.pathExistsSync( pathSrc ) ) return false;

                const pathDest = path.join( outputLocalAddonsPath, addonName );
                fs.copy( pathSrc, pathDest, ( err ) => {
                    if ( err ) {
                        // console.error( '%s does not exist in %s/addons/ directory.', addon, OF_DIR )
                    }
                } );
                return true;

                // TODO: Write to addons.make to add local_addons/ path

            }

        } )();

        return {
            name: addonName,
            found: addonFound
        }

    } );

    console.log( 'results:', results );

    console.log( chalk.bold( 'Found addons:' ) );
    results.filter( e => e.found ).forEach( e => {
        console.log( chalk.green( e.name ) );
    } )

    console.log();
    console.log( chalk.bold( 'Missing addons:' ) );
    results.filter( e => !e.found ).forEach( e => {
        console.log( chalk.red( e.name ) );
    } )

}

function copyTargetDirectory( srcPath, destPath ) {

    const srcExists = fs.pathExistsSync( srcPath );

    if ( !srcExists )
        throw new Error( 'Could not find target directory!\nYou can also target the current directory by running ofpkg without any arguments.' );

    // Set up directory for ofpkg
    console.log( 'destPath:', destPath )
    check( () => fs.ensureDirSync( destPath ) );
    fs.emptyDirSync( destPath );

    // Copy project into pkg directory
    fs.copySync( srcPath, destPath, { filter: ( e ) => !e.includes( 'ofpkg' ) } );
    // fs.moveSync( destPath_tempParent, srcPath, { overwrite: true } )

    return false;

}

function getConfig( configPath ) {

    const configBuf = check( () => fs.readFileSync( configPath ) );
    const config = check( () => JSON.parse( configBuf ) );

    return config;

}

function getArgs() {

    const claOptions = [
        { name: 'target', alias: 't', type: String, defaultOption: true },
        { name: 'verbose', alias: 'v', type: Boolean },
        { name: 'include', alias: 'i', type: String, multiple: true },
        { name: 'output', alias: 'o', type: String }
    ]

    const ARGS = commandLineArgs( claOptions );

    return ARGS;

}

function getAddons( addonPath ) {

    const buf = check( () => fs.readFileSync( addonPath, { encoding: 'utf8' } ) );
    const addons = buf.split( '\n' );

    return addons;

}

function check( func ) {

    try {
        const result = func();
        return result;
    } catch ( err ) {
        if ( ARGS.verbose ) console.log( err );
        return err;
    }

}
