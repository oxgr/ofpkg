const fs = require( 'fs-extra' );
const path = require( 'path' );
const commandLineArgs = require( 'command-line-args' );
const chalk = require( 'chalk' );
const archiver = require( 'archiver' );
const replace = require( 'replace-in-file' );

init();

async function init() {

    
    // Global paths
    const CWD = process.cwd();
    const EXEC_PATH = path.dirname( path.dirname( process.execPath ) );
    const OFPKG_PATH = path.join( process.env.HOME, '.ofpkg' );
    const TEMP_PATH = path.join( OFPKG_PATH, 'temp' );
    fs.ensureDirSync( TEMP_PATH );
    
    const VERSION = require( path.join( __dirname, '..', 'package.json' ) ).version;
    
    // Get config
    const configPath = path.join( OFPKG_PATH, 'ofpkg.config.json' );
    const { OF_PATH } = getConfig( configPath );

    // Process arguments
    const ARGS = getArgs();

    if ( Object.entries( ARGS ) == 0 ) {
        console.log( 'No arguments entered.\n');
        console.log( 'To package this directory, run', chalk.bold( 'ofpkg .\n' ));
        console.log( 'For more information, run', chalk.bold( 'ofpkg --help\n' ) );
        return
    }

    if ( ARGS.verbose ) {
    console.log( `   
    ┌─┐┌─┐┌─┐┬┌─┌─┐
    │ │├┤ ├─┘├┴┐│ ┬
    └─┘└  ┴  ┴ ┴└─┘
    `);
    }

    if ( ARGS.version ) {
        console.log( `v${VERSION}` );
        return;
    }

    const TARGETS = ARGS.targets.map( target => {

        const PATH = target && target != '.' ? target : CWD;
        const NAME = ( path.basename( PATH ) );

        if ( ARGS.verbose ) console.log( '%s: %s', NAME, PATH );

        return {
            PATH: PATH,
            NAME: NAME,
        }

    } )

    /**
     * By order of priority:
     * 1. Basename of output path provided as argument with --output or -o flag
     * 2. If there is only one target, "<targetName>-ofpkg"
     * 3. ofpkg
     */
    const OUTPUT_NAME =
        ARGS.output ? 
            fs.pathExistsSync( ARGS.output ) ?
                path.basename( ARGS.output ) + '-ofpkg' :    
                path.basename( ARGS.output ) :
            TARGETS.length == 1 ?
                TARGETS[ 0 ].NAME + '-ofpkg' :
                'ofpkg'

            // ARGS.output[ ARGS.output.length - 1 ] == path.sep ?

    const OUTPUT_PATH = 
        ARGS.output ?
            fs.pathExistsSync( ARGS.output ) ?
                ARGS.replace ?
                    ARGS.output :
                    path.join( ARGS.output, OUTPUT_NAME ) :
                ARGS.output :
            path.join( CWD, OUTPUT_NAME );
            
            // ARGS.output[ ARGS.output.length - 1 ] == path.sep ?
    // if ( !ARGS.replace && fs.pathExistsSync( ARGS.output ) ) {
    //     panic( Error(`
    // ${chalk.bold.red( 'Error: Output directory provided already exists!' ) }
    // Fixes:
    // - Set the --output to a new directory name.
    // - Use the --replace flag to overwrite an existing directory.
    //     `));
    // }
    // fs.ensureDirSync( OUTPUT_PATH );

    const TEMP_OUTPUT_PATH = path.join( TEMP_PATH, OUTPUT_NAME );
    fs.ensureDirSync( TEMP_OUTPUT_PATH );

    if ( ARGS.verbose )
        console.log( {
            CWD: CWD,
            __dirname: __dirname,
            OFPKG_PATH: OFPKG_PATH,
            OF_PATH: OF_PATH,
            OUTPUT_PATH: OUTPUT_PATH,
            OUTPUT_NAME: OUTPUT_NAME,
            TEMP_PATH: TEMP_PATH,
            ARGS: ARGS,
        } )

    /********************* Start process **************************/

    // Copy library here
    const TEMP_OF_PATH = path.join( TEMP_OUTPUT_PATH, path.basename( OF_PATH ) );
    if ( !!ARGS.library ) {
        console.log( chalk.bold( 'Copying openFrameworks library...' ) );
        
        const avoid = [
            'examples',
            'addons',
            'apps'
        ]

        if ( !ARGS.projgen ) avoid.push( 'projectGenerator' );

        // Copy all directories except ones in array.
        copyTargetDirectory( OF_PATH, TEMP_OF_PATH, { filter: dir => !avoid.some( e => dir.includes( e ) ) } );

    }

    //

    const PROJECT_PATH = ARGS.library ?
        path.join( TEMP_OF_PATH, 'apps', OUTPUT_NAME ) :
        TEMP_OUTPUT_PATH
    
    TARGETS.forEach( ( target ) => {
        
        console.log( '\n', chalk.bold.yellow( target.NAME ) );
        
        // Copy whole project directory to output directory
        console.log( chalk.bold( 'Copying project...' ) );
        const targetOutputPath = path.join( PROJECT_PATH, target.NAME )
        try {
            copyTargetDirectory( target.PATH, targetOutputPath );
        } catch ( e ) {
            console.log( chalk.red.bold( e.message ) );
            cleanUp( TEMP_PATH );
            return;
        }

        // Update OF_ROOT in config.make file
        const configMakePath = path.join( targetOutputPath, 'config.make' );
        const configMakeStr = updateConfigMake( configMakePath );

        // Scan addons from addons.make
        const addonsMakePath = path.join( targetOutputPath, 'addons.make' )
        const addons = getAddons( addonsMakePath );

        // Generate array of objects with addon data
        const processedAddons = processAddons( addons, targetOutputPath );
        
        // Copy global addon if found in local global folder.
        console.log( chalk.bold( 'Copying addons...') );
        const addonsToCopy = processedAddons.filter( addon => addon.found && !addon.local )
        const copiedAddons = copyAddons( addonsToCopy,
            !!ARGS.library ?
                path.join( TEMP_OF_PATH, 'addons' ) :
                path.join( targetOutputPath, 'local_addons' ) );

        if ( !ARGS.library ) {
            // Replace text in addons.make
            console.log( chalk.bold( 'Updating addons.make...') );
            updateAddonsMake( copiedAddons, addonsMakePath )
        }

    } )

    console.log();

    let moveSrc = TEMP_OUTPUT_PATH;
    let moveDest = OUTPUT_PATH;

    if ( !!ARGS.compress ) {

        console.log( chalk.bold( 'Compressing ofpkg...' ) );
        const zipPath = await compressDirectory(
            // path.join( ARGS.library ? TEMP_OF_PATH : PROJECT_PATH ),
            TEMP_OUTPUT_PATH,
            TEMP_PATH,
            OUTPUT_NAME
        )

        fs.emptyDirSync( TEMP_OUTPUT_PATH );
        // fs.moveSync( zipPath, path.join( TEMP_OUTPUT_PATH, path.basename( zipPath ) ) );

        moveSrc = zipPath;
        cleanUp( moveDest );
        moveDest = path.join( fs.pathExistsSync( moveDest ) ? moveDest : path.dirname( moveDest ), path.basename( zipPath ) );

    }
    
    console.log( chalk.bold( 'Moving to output...\n'), moveDest );
    fs.moveSync( moveSrc, moveDest, { overwrite: ARGS.replace || moveDest.includes( 'ofpkg' ) } );

    console.log( chalk.bold( 'Cleaning up...' ) );
    cleanUp( TEMP_PATH );

    console.log( chalk.bold( 'Done!' ) );

    /*************** Convenience functions *****************/

    function updateAddonsMake( copiedAddons, addonsMakePath ) {

        const replaceFrom = copiedAddons.map( addon => addon.name );
        const replaceTo = copiedAddons.map( addon => path.join( 'local_addons', addon.name ) );
        
        try {
            const results = replace.sync( {
                files: addonsMakePath,
                from: replaceFrom,
                to: replaceTo
            })
            // if ( !!ARGS.verbose ) console.log( 'Replacement results:', results );
        } catch (error) {
            console.error('Error occurred:', error);
        }

        return false;

    }

    function updateConfigMake( configMakePath ) {

        const results = replace.sync( {
            files: configMakePath,
            from: new RegExp( /(?<=(^OF_ROOT\ \=\ )).+/, 'm'),
            to: path.join( '..', '..', '..' )
        })

        return false;

    }

    function copyAddons( addonsToCopy, targetOutputPath ) {

        addonsToCopy.forEach( ( addon ) => {

            const src = addon.src;
            const dest = path.join( targetOutputPath, addon.name );
            fs.copySync( src, dest );
            

        } )

        return addonsToCopy

    }

    async function compressDirectory( srcPath, destPath, name = 'ofpkg' ) {

        const zipPath = path.join( destPath, name + '.zip' );
        const output = fs.createWriteStream( zipPath );
        const archive = archiver( 'zip' );

        output.on( 'close', () => {
            if ( ARGS.verbose )
                console.log( 'Total compressed size: %s\n', formatBytes( archive.pointer() ) )
        } );
        archive.on( 'error', ( err ) => { throw err } );

        archive.pipe( output );
        archive.directory( srcPath, name );
        await archive.finalize();

        return zipPath;

    }

    function processAddons( addons, targetPath ) {

        // Create local_addons if it doesn't exist.
        const outputLocalAddonsPath = path.join( targetPath, 'local_addons' );
        fs.ensureDirSync( outputLocalAddonsPath );

        const results = addons.map( addon => {

            let name = addon;
            let found = false;
            let src = '';
            let local = false;
            let text = addon;

            if ( name.includes( 'local_addons' ) ) {

                const tokens = name.split( '#' );
                const localAddonPath = tokens[ 0 ].trim();
                const localAddonUrl = tokens[ 1 ].trim();

                name = localAddonPath.split( path.sep )[ 1 ];

                // Check copied local_addons folder to see if the addon already exists and copied.
                found = fs.pathExistsSync( path.join( outputLocalAddonsPath, name ) )
                src = found ? localAddonPath : '';
                local = true;

                if ( !found && ARGS.verbose ) console.log( 'Local addon %s not addonFound, have to download from URL.', name );

                // try {
                //     console.log( `Cloning ${name}...`);
                //     process.spawn( `cd git clone ${url}` );
                // } catch ( err ) {
                //     console.log( err );
                // }

                // TODO: git clone addon from localAddonURL. Gotta test this. (Is this even in scope or should we delegate this to package manager?)

            } else {

                let globalAddonPath = path.join( OF_PATH, 'addons', name );

                found = fs.pathExistsSync( globalAddonPath )
                src = found ? globalAddonPath : '';
                local = false;

            }

            return {
                name: name,
                found: found,
                src: src,
                local: local,
                text: text
            }

        } )

        if ( !!ARGS.verbose ) {

            console.log( chalk.bold( 'Found addons:' ) );
            results.filter( e => e.found ).forEach( e => {
                console.log( chalk.green( e.name ) );
            } )
    
            console.log( chalk.bold( 'Missing addons:' ) );
            results.filter( e => !e.found ).forEach( e => {
                console.log( chalk.red( e.name ) );
            } )

        } else {

            const missingAddonsCount = results.filter( e => !e.found ).length;

            if ( missingAddonsCount > 0 )
                console.log( 'Missing ' + chalk.red( missingAddonsCount ) + ' addons!' );

        }

        return results;

    }

    function copyTargetDirectory( srcPath, destPath, opts ) {

        if ( !fs.pathExistsSync( srcPath ) )
            throw new Error( 'Could not find source directory!\nSource: ', srcPath );

        // Set up directory for ofpkg
        fs.ensureDirSync( destPath );
        fs.emptyDirSync( destPath );

        // Copy project into pkg directory
        fs.copySync( srcPath, destPath, opts );

        return false;

    }

    function getConfig( configPath ) {

        const configBuf = check( () => fs.readFileSync( configPath ) );
        const config = check( () => JSON.parse( configBuf ) );

        return config;

    }

    function getArgs() {

        const claOptions = [
            { name: 'targets', alias: 't', type: String, defaultOption: true, multiple: true },
            { name: 'verbose', alias: 'v', type: Boolean },
            { name: 'library', alias: 'l', type: Boolean },
            { name: 'projgen', alias: 'p', type: Boolean },
            { name: 'version', alias: 'V', type: Boolean },
            // { name: 'include', alias: 'i', type: String, multiple: true },
            { name: 'output', alias: 'o', type: String },
            { name: 'compress', alias: 'c', type: Boolean },
            { name: 'replace', alias: 'r', type: Boolean },
        ]

        return commandLineArgs( claOptions );

    }

    function getAddons( addonPath ) {

        const buf = check( () => fs.readFileSync( addonPath, { encoding: 'utf8' } ) );
        const addons = buf.trim().split( '\n' );

        return addons;

    }

    function check( func ) {

        try {
            const result = func();
            return result;
        } catch ( err ) {
            console.log( err );
            return err;
        }

    }

    function cleanUp( path ) {

        if ( fs.pathExistsSync( path ) ) fs.rmSync( path, { recursive: true } )

    }

    function panic( err ) {
        console.error( err.message );
        cleanUp( TEMP_PATH );
        process.exit();
    }

    // https://stackoverflow.com/questions/15900485/correct-way-to-convert-size-in-bytes-to-kb-mb-gb-in-javascript
    function formatBytes( bytes, decimals = 2 ) {
        if ( bytes === 0 ) return '0 Bytes';

        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = [ 'Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB' ];

        const i = Math.floor( Math.log( bytes ) / Math.log( k ) );

        return parseFloat( ( bytes / Math.pow( k, i ) ).toFixed( dm ) ) + ' ' + sizes[ i ];
    }

}
