const fs = require( 'fs-extra' );
const path = require( 'path' );
const commandLineArgs = require( 'command-line-args' );

// import * as fs from 'fs' ;
// import * as path from 'path'
// import commandLineArgs from 'command-line-args';
// const __dirname = new URL('.', import.meta.url).pathname;

init();

function init() {

    console.log( 'Hi ofpkg!' );
    console.log( `   
      ______       ____
     /      \\     /  _|
    |   |    |  _|  |_
    |   |    | |_    _|
    |   |    |   |  |
     \\      /    |  |
      \\____/     |__|
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
    const args = getArgs();
    console.log( 'args:', args );

    const TARGET_PATH = args.target || CWD;
    const OUTPUT_PATH = args.output || path.join( TARGET_PATH, '..', path.basename( TARGET_PATH ) ) + '-ofpkg';

    console.log( `
    TARGET_PATH: ${TARGET_PATH}
    TARGET_PATH_PARENT: ${path.dirname( TARGET_PATH )}
    `)

    copyTargetDirectory( TARGET_PATH, OUTPUT_PATH );

    // Create local_addons if it doesn't exist.
    const pkgLocalAddonsPath = path.join( OUTPUT_PATH, 'local_addons' );
    fs.ensureDirSync( pkgLocalAddonsPath );

    // Scan addons
    const addonPath = path.join( OUTPUT_PATH, 'addons.make' )
    const addons = getAddons( addonPath );
    console.log( addons )

    addons.forEach( addon => {

        let pathSrc = '';
        let pathDest = '';

        if ( addon.includes( 'local_addons' ) ) {

            const tokens = addon.split( '#' );
            const localAddonPath = tokens[ 0 ].trim();
            const localAddonURL = tokens[ 1 ].trim();
            const localAddonName = localAddonPath.split( '/' )[ 1 ];
            const localAddonFound = fs.pathExistsSync( path.join( pkgLocalAddonsPath, localAddonName ) )
            // console.log( 'localAddon', localAddonName, 'found:', localAddonFound)

            if( !!localAddonFound ) return;

            console.log( 'Local addon %s not found, have to download from URL.', localAddonName );

        } else {

            pathSrc = path.join( OF_DIR, 'addons', addon );
            pathDest = path.join( pkgLocalAddonsPath, addon );
            fs.ensureDirSync( pathDest );
            fs.copy( pathSrc, pathDest, ( err ) => {
                if ( err ) {
                    console.error( '%s does not exist in %s/addons/ directory.', addon, OF_DIR )
                } else {
                    console.log( addon, 'found!' );
                }
            });

        }
        
        // fs.copyFile( pathToCopy, )

    } );

}

function copyTargetDirectory
( srcPath, destPath ) {

    // Set up directory for ofpkg
    console.log( 'destPath:', destPath )
    check( () => fs.ensureDirSync( destPath ) );
    fs.emptyDirSync( destPath );

    // Copy project into pkg directory
    fs.copySync( srcPath, destPath, { filter: ( e ) => !e.includes( 'ofpkg' ) } );
    // fs.moveSync( destPath_tempParent, srcPath, { overwrite: true } )

    return destPath;

}

function getConfig( configPath ) {

    const configBuf = check( () => fs.readFileSync( configPath ) );
    const config = check( () => JSON.parse( configBuf ) );

    return config;

}

function getArgs() {

    const claOptions = [
        { name: 'path', type: String, defaultOption: true },
        { name: 'verbose', alias: 'v', type: Boolean },
        { name: 'include', alias: 'i', type: String, multiple: true },
        { name: 'output', alias: 'o', type: String }
    ]

    const args = commandLineArgs( claOptions );

    return args;

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
        console.log( err );
        return undefined;
    }

}
