const fs = require( 'fs-extra' );
const path = require( 'path' );
const { spawn } = require( 'child_process' );
const commandLineArgs = require( 'command-line-args' );
const commandLineUsage = require( 'command-line-usage' );
const chalk = require( 'chalk' );
const archiver = require( 'archiver' );
const replace = require( 'replace-in-file' );
const klawSync = require( 'klaw-sync' );
const levCompare = require( 'js-levenshtein' );

init();

async function init() {

    // if ( ARGS.verbose ) console.log( chalk.bold( ) );

    // Process arguments
    const ARGS = getArgs();

    if ( Object.entries( ARGS ) == 0 ) {
        console.log( 'No arguments entered.\n' );
        console.log( 'To package this directory, run', chalk.bold( 'ofpkg .\n' ) );
        console.log( 'For more information, run', chalk.bold( 'ofpkg --help\n' ) );
        return;
    }

    if ( ARGS.verbose ) console.log( { ARGS: ARGS } );

    if ( ARGS.help ) {
        printUsageGuide();
        return;
    }

    if ( ARGS.verbose ) console.log( chalk.bold( 'Setting global paths...' ) );

    let TEMP_PATH;

    // Global paths
    const CWD = process.cwd();
    // const EXEC_PATH = panicIfNotExists( path.dirname( path.dirname( process.execPath ) ) );
    const APP_PATH = panicIfNotExists( path.join( process.env.HOME, '.ofpkg' ) );

    const configPath = panicIfNotExists( path.join( APP_PATH, 'data', 'ofpkg.config.json' ) );
    const { OF_PATH,
        SERVER_OF_VERSIONS_PATH,
        NANCARROW_IP } = getConfig( configPath );

    const VERSION = require( path.join( __dirname, '..', 'package.json' ) ).version;

    if ( ARGS.version ) {
        console.log( `v${VERSION}` );
        return;
    }

    if ( ARGS.update ) {
        console.log( chalk.bold( 'Updating ofpkg...' ) );
        runInstallScript();
        return;
    }

    if ( ARGS.verbose ) console.log( chalk.bold( 'Mapping targets...' ) );

    const TARGETS = ARGS.targets.map( target => {

        const PATH = path.resolve( target && target != '.' ? target : CWD );
        const NAME = ( path.basename( PATH ) );

        panicIfNotExists( PATH );

        const OF = ( () => {

            const configMakePath = path.join( PATH, 'config.make' );
            const targetOfPath = path.resolve( PATH, getOfPath( configMakePath ) );
            const ofVersion = targetOfPath.match( new RegExp( /(v\d+\.\d+.\d+)/g ) )[ 0 ];

            return {
                NAME: path.basename( targetOfPath ),
                VERSION: ofVersion,
                PATH: targetOfPath
            }

        } )()

        return {
            PATH: PATH,
            NAME: NAME,
            OF: OF
        }

    } )

    if ( ARGS.verbose ) console.log( TARGETS );

    if ( ARGS.verbose ) console.log( chalk.bold( 'Setting output name and path.basename...' ) );

    /**
     * By order of priority:
     * 1. Basename of output path provided as argument with --output or -o flag
     * 2. If there is only one target, "<targetName>-ofpkg"
     * 3. ofpkg
     */
    const OUTPUT_NAME = ( () => {
        return ARGS.output ?
            fs.pathExistsSync( ARGS.output ) ?
                path.basename( ARGS.output ) + '-ofpkg' :
                path.basename( ARGS.output ) :
            TARGETS.length == 1 ?
                TARGETS[ 0 ].NAME + '-ofpkg' :
                'ofpkg'
    } )()

    const OUTPUT_PATH = ( () => {
        return ARGS.output ?
            fs.pathExistsSync( ARGS.output ) ?
                ARGS.replace ?
                    ARGS.output :
                    path.join( ARGS.output, OUTPUT_NAME ) :
                ARGS.output :
            path.join( CWD, OUTPUT_NAME );
    } )()

    TEMP_PATH = path.join( APP_PATH, 'temp' );
    fs.ensureDirSync( TEMP_PATH );

    const TEMP_OUTPUT_PATH = path.join( TEMP_PATH, OUTPUT_NAME );
    fs.ensureDirSync( TEMP_OUTPUT_PATH );

    const TEMP_OF_PATH = path.join( TEMP_OUTPUT_PATH, path.basename( OF_PATH ) );

    if ( ARGS.verbose ) {
        console.log( {
            CWD: CWD,
            __dirname: __dirname,
            APP_PATH: APP_PATH,
            OF_PATH: OF_PATH,
            OUTPUT_PATH: OUTPUT_PATH,
            OUTPUT_NAME: OUTPUT_NAME,
            TEMP_PATH: TEMP_PATH,
        } )
    }

    /********************* Start process **************************/

    // Library

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

    // Server 

    if ( ARGS.server && !ARGS.library ) {

        const ofVersionsUsed = TARGETS.map( target => target.OF )
        const existingVersions = fs.readdirSync( SERVER_OF_VERSIONS_PATH );
        const ofVersionsToCopy = ofVersionsUsed
            // Remove duplicates
            .reduce( ( prev, curr ) => {
                if ( !prev.some( of => of.VERSION === curr.VERSION ) ) {
                    prev.push( curr );
                }
                return prev;
            }, [] )
            // Filter existing
            .filter( of => {
                const versionExists = existingVersions.some( existingName => existingName.includes( of.VERSION ) )
                if ( !versionExists ) {
                    console.log( of.VERSION, 'does not exist in server.' )
                    return true;
                }
                return false;
            } );

        if ( ofVersionsToCopy.length > 0 ) {

            if ( ARGS.verbose ) console.log( ofVersionsToCopy );

            ofVersionsToCopy.forEach( of => {
                console.log(
                    'Copying', chalk.bold( of.NAME ),
                    '\nFrom', chalk.bold.yellow( path.dirname( of.PATH ) ),
                    '\nTo', chalk.bold.green( SERVER_OF_VERSIONS_PATH )
                );
                fs.copySync( of.PATH, path.join( SERVER_OF_VERSIONS_PATH, of.NAME ) )
            } );

            if ( ARGS.verbose ) console.log( chalk.bold( 'Done copying oF folders.' ) );

        }


        // ofVersionsToCheck.push( ofVersion );
    }

    // Projects

    const PROJECTS_PATH = ( () => {
        return ARGS.library ?
            path.join( TEMP_OF_PATH, 'apps', OUTPUT_NAME ) :
            TEMP_OUTPUT_PATH
    } )()

    TARGETS.forEach( ( target ) => {

        console.log( '\n', chalk.bold.yellow( target.NAME ) );

        // Copy whole project directory to output directory
        console.log( chalk.bold( 'Copying project...' ) );
        const targetOutputPath = path.join( PROJECTS_PATH, target.NAME );
        const serverOfPath = path.join( SERVER_OF_VERSIONS_PATH, target.OF.NAME )

        try {
            copyTargetDirectory( target.PATH, targetOutputPath );
        } catch ( err ) {
            panic( err );
        }

        // Update OF_ROOT in config.make file
        const configMakePath = path.join( targetOutputPath, 'config.make' );
        const configMakeStr = updateConfigMake( configMakePath );

        // Scan addons from addons.make
        const addonsMakePath = path.join( targetOutputPath, 'addons.make' )
        const addonStrings = getAddons( addonsMakePath );

        // Generate array of objects with addon data
        const processedAddons = processAddons( addonStrings, targetOutputPath );

        if ( ARGS.verbose ) {
            const foundAddons = processedAddons.filter( e => e.found );
            const missingAddons = processedAddons.filter( e => !e.found );

            if ( !!ARGS.verbose ) {

                console.log( chalk.bold( 'Found addons:' ) );
                foundAddons.forEach( e => console.log( chalk.green( e.name ) ) );

                console.log( chalk.bold( 'Missing addons:' ) );
                missingAddons.forEach( e => console.log( chalk.red( e.name ) ) );

            } else {

                if ( missingAddons.length > 0 )
                    console.log( 'Missing ' + chalk.red( missingAddons.length ) + ' addons!' );

            }
        }

        // Find which addons to copy.
        const addonsToCopy = ( () => {
            if ( ARGS.server ) {
                // For server, find which addons exist in server oF version, then compare files to see if different.
                console.log( chalk.bold( 'Comparing addons with server oF...' ) );
                const serverOfAddonsPath = path.join( serverOfPath, 'addons' );
                const serverAddons = fs.readdirSync( serverOfAddonsPath )
                    .map( serverAddon => {
                        return {
                            name: serverAddon,
                            path: path.join( serverOfAddonsPath, serverAddon )
                        }
                    } )
                console.log( serverAddons );
                const { modifiedAddons, missingServerAddons } = compareAddons( processedAddons, serverAddons );
                return {
                    local: modifiedAddons,
                    global: missingServerAddons
                };
            }
            return processedAddons.filter( addon => addon.found && !addon.local )
        } )()

        console.log( 'addonsToCopy', addonsToCopy );

        console.log( chalk.bold( 'Copying addons...' ) );
        // Strip .git files first...
        if ( ARGS.server ) {

            addonsToCopy.local.forEach( addon => {

            } )

            addonsToCopy.global.forEach( addon => {

            } )

        } else {

            const addonsDestPath =
                !!ARGS.library ?
                    path.join( TEMP_OF_PATH, 'addons' ) :
                    path.join( targetOutputPath, 'local_addons' );
            // Compare addons to server addons to see if they match?
            const copiedAddons = copyAddons( addonsToCopy, addonsDestPath );

            if ( !ARGS.library ) {
                // Replace text in addons.make
                console.log( chalk.bold( 'Updating addons.make...' ) );
                updateAddonsMake( copiedAddons, addonsMakePath )
            }

        }


    } )

    console.log();

    // Compression

    let moveSrc = TEMP_OUTPUT_PATH;
    let moveDest = OUTPUT_PATH;

    if ( !!ARGS.compress ) {

        console.log( chalk.bold( 'Compressing ofpkg...' ) );
        const zipPath = await compressDirectory(
            // path.join( ARGS.library ? TEMP_OF_PATH : PROJECTS_PATH ),
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

    // Finalise

    console.log( chalk.bold( 'Moving to output...\n' ), moveDest );
    fs.moveSync( moveSrc, moveDest, { overwrite: ARGS.replace || moveDest.includes( 'ofpkg' ) } );

    console.log( chalk.bold( 'Cleaning up...' ) );
    cleanUp( TEMP_PATH );

    console.log( chalk.bold( 'Done!' ) );

    /*************** Convenience functions *****************/

    function getOfPath( configMakePath ) {

        const buf = fs.readFileSync( configMakePath, { encoding: 'utf8' } )

        // First try to match OF_ROOT at beginning of string ( uncommented setting ).
        // If that is undefined, match the first instance of OF_ROOT ( default ).
        const regexMatches =
            buf.match( new RegExp( /(?<=(^OF_ROOT\ \=\ )).+/, 'm' ) ) ||
            buf.match( new RegExp( /(?<=(OF_ROOT\ \=\ )).+/, 'm' ) );
        const result = regexMatches[ 0 ].trim();

        return result;

    }

    function updateAddonsMake( copiedAddons, addonsMakePath ) {

        const replaceFrom = copiedAddons.map( addon => addon.name );
        const replaceTo = copiedAddons.map( addon => path.join( 'local_addons', addon.name ) );

        try {
            const results = replace.sync( {
                files: addonsMakePath,
                from: replaceFrom,
                to: replaceTo
            } )
            // if ( !!ARGS.verbose ) console.log( 'Replacement results:', results );
        } catch ( error ) {
            console.error( 'Error occurred:', error );
        }

        return false;

    }

    function updateConfigMake( configMakePath ) {

        const results = replace.sync( {
            files: configMakePath,
            from: new RegExp( /(?<=(^OF_ROOT\ \=\ )).+/, 'm' ),
            to: path.join( '..', '..', '..' )
        } )

        return false;

    }

    function getAddons( addonPath ) {

        const buf = check( () => fs.readFileSync( addonPath, { encoding: 'utf8' } ) );
        const addons = buf.trim().split( '\n' );

        return addons;

    }

    function copyAddons( addonsToCopy, destPath ) {

        addonsToCopy.forEach( ( addon ) => copyAddon( addon, path.join( destPath, addon.name ) ) );

        return addonsToCopy;

    }

    function copyAddon( addon, destPath ) {

        const src = addon.path;
        const dest = path.join( destPath, addon.name );
        fs.copySync( src, dest );

        return addon;

    }

    function processAddons( addons, targetPath ) {

        // if ( ARGS.forceLocal || !ARGS.library ) {
        //     // Create local_addons if it doesn't exist.

        //     fs.ensureDirSync( outputLocalAddonsPath );
        // }

        const results = addons.map( addon => {

            let name = addon;
            let found = false;
            let src = '';
            let local = false;
            let text = addon;

            if ( name.includes( 'local_addons' ) ) {

                const outputLocalAddonsPath = path.join( targetPath, 'local_addons' );

                const tokens = name.split( '#' );
                const localAddonPath = tokens[ 0 ].trim();
                const localAddonUrl = tokens[ 1 ].trim();

                name = localAddonPath.split( path.sep )[ 1 ];

                // Check copied local_addons folder to see if the addon already exists and copied.
                found = fs.pathExistsSync( path.join( outputLocalAddonsPath, name ) )
                src = found ? localAddonPath : '';
                local = true;

            } else {

                let globalAddonPath = path.join( OF_PATH, 'addons', name );

                found = fs.pathExistsSync( globalAddonPath )
                src = found ? globalAddonPath : '';
                local = false;

            }

            return {
                name: name,
                found: found,
                path: src,
                local: local,
                text: text
            }

        } )

        return results;

    }

    function compareAddons( addons, serverAddons ) {

        // const missingServerAddons = addons.filter( ( addon ) => {

        //     if ( serverAddons.some( serverAddon => serverAddon.name == addon.name ) )
        //         return false;

        //     return true;

        // } );

        const differences = [];

        let matchedFilesCount = 0;

        const missingServerAddons = [];

        const modifiedAddons = addons.filter( ( addon ) => {

            const foundServerAddon = serverAddons.find( serverAddon => serverAddon.name === addon.name )

            if ( !foundServerAddon ) {
                missingServerAddons.push( addon );
                return false;
            }

            const addonFiles =
                klawSync(
                    addon.path,
                    { nodir: true, filter: file => !file.path.includes( 'example' ) }
                )
                    .map( file => file.path );

            const foundServerAddonFiles =
                klawSync(
                    foundServerAddon.path,
                    { nodir: true, filter: file => !file.path.includes( 'example' ) }
                )
                    .map( file => file.path );

            console.log( chalk.bold( 'Finding files...' ) );

            addonFiles.forEach( filePath => {

                // print "dir/filename"
                console.log( chalk.blue( path.join( path.basename( path.dirname( filePath ) ), path.basename( filePath ) ) ) );

                const matchedFileIndex = foundServerAddonFiles.findIndex( serverFilePath => { 
                    const fpName = path.basename( filePath ) ;
                    const servfpName = path.basename( serverFilePath );
                    // servfpName === fpname;
                    const diff = levCompare( fpName, servfpName );
                    
                    console.log(
                        diff, 
                        chalk.yellow( path.join( path.basename( path.dirname( serverFilePath ) ),
                        path.basename( serverFilePath ) ) ) );
                    const match =  diff == 0 ;
                    return match;
                } );

                let matchedFile = '';

                if ( matchedFileIndex == -1 ) {
                    console.log( chalk.red( matchedFileIndex ) );
                    return;
                } else {
                    matchedFile = foundServerAddonFiles[ matchedFileIndex ];
                    console.log( 'Matched file:', chalk.green( matchedFile ) )
                }


                // Compare the two text files here ////////
                const fileStr = fs.readFileSync( filePath, { encoding: 'utf8' } );
                const matchedFileStr = fs.readFileSync( matchedFile, { encoding: 'utf8' } );

                // console.log( { types: {
                //     filePath: typeof filePath,
                //     matchedFile: typeof matchedFile,
                //     fileStr: fileStr,
                //     matchedFileStr: matchedFileStr,
                // }});

                const diff = levCompare( fileStr, matchedFileStr );

                
                foundServerAddonFiles.splice( matchedFileIndex, 1 );
                
                matchedFilesCount++;
            } )

            console.log( 
                'Total files:',
                addonFiles.length,
                'Matched files:',
                matchedFilesCount
            );
            // console.dir( differences );
            // console.log( files );
            // console.log( 'files in', foundServerAddon );

        } );

        // Iterate through addons
        // Attempt match with server version folder name
        // If no match, push to missingServerAddons
        // If match,
        // get list of filenames
        // filter example files
        // iterate through remaining files
        // compare with server addon version with same filename
        // if same, continue,
        // if not same, push to modifiedAddons
        // ( maybe have a tolerance value? idk )

        return {
            modifiedAddons: modifiedAddons,
            missingServerAddons: missingServerAddons
        }

    }

    function copyTargetDirectory( srcPath, destPath, opts ) {

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
            { name: 'forceLocal', alias: 'f', type: Boolean },
            { name: 'library', alias: 'l', type: Boolean },
            { name: 'compress', alias: 'c', type: Boolean },
            { name: 'projgen', alias: 'p', type: Boolean },
            { name: 'server', alias: 's', type: Boolean },
            { name: 'output', alias: 'o', type: String },
            { name: 'replace', alias: 'r', type: Boolean },
            { name: 'verbose', alias: 'v', type: Boolean },
            { name: 'version', alias: 'V', type: Boolean },
            { name: 'update', alias: 'u', type: Boolean },
            { name: 'help', alias: 'h', type: Boolean },
        ]

        return commandLineArgs( claOptions );

    }

    async function compressDirectory( srcPath, destPath, name = 'ofpkg' ) {

        const zipPath = path.join( destPath, name + '.zip' );
        const output = fs.createWriteStream( zipPath );
        const archive = archiver( 'zip' );

        output.on( 'close', () => {
            if ( ARGS.verbose )
                console.log( 'Total compressed size: %s\n', formatBytes( archive.pointer() ) )
        } );
        archive.on( 'error', ( err ) => { panic( err ) } );

        archive.pipe( output );
        archive.directory( srcPath, name );
        await archive.finalize();

        return zipPath;

    }

    function printUsageGuide() {

        const header = `
            ┌─┐┌─┐┌─┐┬┌─┌─┐
            │ │├┤ ├─┘├┴┐│ ┬
            └─┘└  ┴  ┴ ┴└─┘`

        const sections = [
            {
                content: chalk.red( header ),
                raw: true
            },
            {
                header: '',
                content: 'A CLI tool to package an openFrameworks project along with necessary addons and optionally, the whole openFrameworks library.'
            },
            {
                header: 'Examples',
                content: [
                    '$ ofpkg [{bold --options}] {underline targets} ...   # Basic format.',
                    '$ ofpkg {bold --library} {underline ./project}       # Include the library.',
                    '$ ofpkg {bold -lcv} {underline ./foo} {underline ./bar}          # Use multiple flags and targets.',
                    '$ ofpkg {underline .} {bold -o} {underline ./baz}                # Pass the current dir and output dir.',
                    '$ ofpkg {bold --help}                    # Pass flags without arguments.'
                ]
            },
            {
                header: 'Options',
                optionList: [
                    {
                        name: 'targets',
                        alias: 't',
                        type: String,
                        typeLabel: '{underline path} ...',
                        description: 'The directory to package. Multiple allowed. (Default)'
                    },
                    {
                        name: 'library',
                        alias: 'l',
                        type: Boolean,
                        description: 'Include the oF library essentials defined in ~/.ofpkg/ofpkg.config.json.'
                    },
                    {
                        name: 'compress',
                        alias: 'c',
                        type: Boolean,
                        description: 'Compresses the final output to ~40% of the original size.'
                    },
                    {
                        name: 'projgen',
                        alias: 'p',
                        type: Boolean,
                        description: 'Includes the oF Project Generator source files (excluded by default).'
                    },
                    {
                        name: 'output',
                        alias: 'o',
                        type: String,
                        typeLabel: '{underline path}',
                        description: 'The directories to package.'
                    },
                    {
                        name: 'replace',
                        alias: 'r',
                        type: Boolean,
                        description: 'Force replaces all contents of the output directory.'
                    },
                    {
                        name: 'verbose',
                        alias: 'v',
                        type: Boolean,
                        description: 'Run with a verbose command line output.'
                    },
                    {
                        name: 'version',
                        alias: 'V',
                        type: Boolean,
                        description: 'Print the version number.'
                    },
                    {
                        name: 'update',
                        alias: 'u',
                        type: Boolean,
                        description: 'Update ofpkg to the latest version available.'
                    },
                    {
                        name: 'help',
                        alias: 'h',
                        type: Boolean,
                        description: 'Print this usage guide.'
                    }
                ]
            }
        ]

        const usage = commandLineUsage( sections );
        console.log( usage );

    }

    function runInstallScript() {

        // const sh = exec( 'curl -s https://raw.githubusercontent.com/oxgr/ofpkg/main/scripts/install.sh | sh', ( err, stdout, stderr ) => {
        //     if ( err ) panic( err );
        //     console.log( stdout );
        //     console.error( stderr )
        // } );

        const curl = spawn( 'curl', [ '-s', 'https://raw.githubusercontent.com/oxgr/ofpkg/main/scripts/install.sh', '|', 'sh' ], { encoding: 'utf-8' } );
        const sh = spawn( 'sh', [], { encoding: 'utf-8' } );

        curl.stdout.on( 'data', data => sh.stdin.write( data.toString() ) );
        curl.stderr.on( 'data', data => console.error( data.toString() ) );
        // curl.on( 'close', data => console.log( chalk.bold( 'curl done' ) ) );

        sh.stdout.on( 'data', data => {
            const str = data.toString();
            console.log( str );
            if ( str.includes( 'Done' ) ) sh.kill();
        } );
        sh.stderr.on( 'data', data => console.error( data.toString() ) );
        // sh.on( 'close', data => console.log( chalk.bold( 'sh done' ) ) );

        return;

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

    function panicIfNotExists( pathToCheck, message = '' ) {
        if ( !fs.pathExistsSync( pathToCheck ) ) {
            // ( err, e ) => {
            //     if ( err ) panic( err.message + '\n' + message )
            //     if ( !e ) 
            // panic( `${chalk.bold.yellow( path.basename( pathToCheck ) )} not found at path: ${chalk.bold( pathToCheck )}\n${message}` )
            panic( `File or directory does not exist:\n${chalk.bold( pathToCheck )}\n${message}` )
            // }
        }
        return pathToCheck;
    }

    function panic( err ) {
        console.error( chalk.bold.red( 'Error: ' ) + ( err.message || err ) );
        if ( TEMP_PATH ) cleanUp( TEMP_PATH );
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
