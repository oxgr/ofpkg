const fs = require( 'fs-extra' );
const path = require( 'path' );
const commandLineArgs = require( 'command-line-args' );
const chalk = require( 'chalk' );
const archiver = require( 'archiver' );
const replace = require( 'replace-in-file' )

// import * as fs from 'fs' ;
// import * as path from 'path'
// import commandLineArgs from 'command-line-args';
// const __dirname = new URL('.', import.meta.url).pathname;

init();

async function init() {

    // console.log( 'Hi ofpkg!' );
    console.log( `   
    ┌─┐┌─┐┌─┐┬┌─┌─┐
    │ │├┤ ├─┘├┴┐│ ┬
    └─┘└  ┴  ┴ ┴└─┘
    `);

    // Global paths
    const CWD = process.cwd();
    const EXEC_DIR = path.dirname( path.dirname( process.execPath ) );

    // Get config
    const configPath = path.join( __dirname, '..', 'ofpkg.config.json' );
    const { OF_PATH } = getConfig( configPath );

    // Process arguments
    const ARGS = getArgs();

    if ( ARGS.verbose )
        console.log( {
            CWD: CWD,
            __dirname: __dirname,
            EXEC_DIR: EXEC_DIR,
            OF_PATH: OF_PATH,
            ARGS: ARGS,
        } )

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
        path.basename( ARGS.output ) || 
        path.basename( OF_PATH ) + '-ofpkg' ||
        TARGETS.length == 1 ?
            TARGETS[ 0 ].NAME + '-ofpkg' :
            'ofpkg'

    const OUTPUT_PATH = ARGS.output || path.join( CWD, OUTPUT_NAME );
    fs.ensureDirSync( OUTPUT_PATH );

    const TEMP_OUTPUT_PATH = path.join( EXEC_DIR, 'temp' );
    fs.ensureDirSync( TEMP_OUTPUT_PATH );

    /********************* Start process **************************/

    
    TARGETS.forEach( ( target ) => {
        
        console.log( '\n', chalk.bold.yellow( target.NAME ) );
        
        // Copy whole project directory to output directory
        console.log( chalk.bold( 'Copying directory...' ) );
        const targetOutputPath = path.join( TEMP_OUTPUT_PATH, target.NAME )
        try {
            copyTargetDirectory( target.PATH, targetOutputPath );
        } catch ( e ) {
            console.log( chalk.red.bold( e.message ) );
            if ( fs.pathExistsSync( TEMP_OUTPUT_PATH ) ) fs.rmSync( TEMP_OUTPUT_PATH, { recursive: true } )
            return;
        }

        // Scan addons from addons.make
        const addonsMakePath = path.join( targetOutputPath, 'addons.make' )
        const addons = getAddons( addonsMakePath );

        // Generate array of objects with addon data
        const processedAddons = processAddons( addons, targetOutputPath );
        
        // Copy global addon if found in local global folder.
        console.log( chalk.bold( 'Copying global addons...') );
        const copiedAddons = copyAddons( processedAddons, targetOutputPath );

        // Replace text in addons.make
        console.log( chalk.bold( 'Updating addons.make...') );
        updateAddonsMake( copiedAddons, addonsMakePath )

    } )

    console.log();

    console.log( chalk.bold( 'Moving temp to output directory...' ) );
    fs.moveSync( TEMP_OUTPUT_PATH, OUTPUT_PATH, { overwrite: true } );

    if ( !!ARGS.compress ) {

        console.log( chalk.bold( 'Compressing ofpkg...' ) );
        await compressDirectory( OUTPUT_PATH, OUTPUT_NAME )

        console.log( chalk.bold( 'Removing temp directories...' ) );
        fs.rmSync( OUTPUT_PATH, { recursive: true } )

    }

    console.log( chalk.bold( 'Done!' ) );

    /*************** Convenience functions *****************/

    function updateAddonsMake( copiedAddons, addonsMakePath ) {

        const replaceFrom = copiedAddons.map( addon => addon.name );
        const replaceTo = copiedAddons.map( addon => addon.text );
        
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

    function copyAddons( addons, targetOutputPath ) {

        addons.forEach( ( addon ) => {
            
            if ( !addon.found || addon.local ) return;

            const src = addon.src;
            const dest = path.join( targetOutputPath, 'local_addons', addon.name );
            fs.copySync( src, dest );
            addon.text = path.join( 'local_addons', addon.name );

        } )

        return addons.filter( addon => addon.found && !addon.local )

    }

    async function compressDirectory( path, name = 'ofpkg' ) {

        const output = fs.createWriteStream( name + '.zip' );
        const archive = archiver( 'zip' );

        output.on( 'close', () => {
            if ( ARGS.verbose )
                console.log( 'Total compressed size: %s\n', formatBytes( archive.pointer() ) )
        } );
        archive.on( 'error', ( err ) => { throw err } );

        archive.pipe( output );
        archive.directory( path, name );
        await archive.finalize();

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

    function copyTargetDirectory( srcPath, destPath ) {

        const srcExists = fs.pathExistsSync( srcPath );

        if ( !srcExists )
            throw new Error( 'Could not find target directory!\nYou can also target the current directory by running ofpkg without any arguments.' );

        // Set up directory for ofpkg
        fs.ensureDirSync( destPath );
        fs.emptyDirSync( destPath );

        // Copy project into pkg directory
        fs.copySync( srcPath, destPath, { filter: ( e ) => !e.includes( 'ofpkg' ) } );

        // Move if destPath == srcPath || '.'
        // fs.moveSync( srcPath, destPath, { overwrite: true } )

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
            { name: 'include', alias: 'i', type: String, multiple: true },
            { name: 'output', alias: 'o', type: String },
            { name: 'compress', alias: 'c', type: Boolean },
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
