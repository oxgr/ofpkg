# ofpkg
A CLI tool to package an openFrameworks project along with necessary addons and optionally, the whole openFrameworks library.

## Install

```
bash <( curl -s https://raw.githubusercontent.com/oxgr/ofpkg/main/scripts/install.sh )
```

You can also download [compiled binaries](https://github.com/oxgr/ofpkg/releases/).

## Usage
```
ofpkg <input> [options]

  ofpkg ./project         # Default passed arguments are directories to package.
  ofpkg ./foo ./bar       # You can also package multiple related projects together.
  ofpkg .                 # Easily package the current working directory.
  ofpkg . -o ./output     # Define the output directory with the --output flag.
  
  Options:
  --library    #    -l    # Includes the oF library essentials defined in ~/.ofpkg/ofpkg.config.json.
  --compress   #    -c    # Compresses the final output to ~40% of the original size.
  --projgen    #    -p    # Includes the oF Project Generator source files (excluded by default).
  --output     #    -o    # Next argument determines path for output directory.
  --replace    #    -r    # Force replaces all contents of the output directory.
  --verbose    #    -v    # Run with a verbose command line output.
  --help       #    -h    # Prints a usage guide.
```

## Why?
Primarily, ofpkg makes it easy to archive openFrameworks projects. When juggling openFrameworks versions, edited addons, and operating systems, a binary file may not be as portable as it was when it was first compiled ten years ago. By consolidating all the source files a project needs into one single directory, recompiling archived artworks become a lot easier to manage.

## Details
ofpkg scans the `addons.make` file of the project(s) to determine which addons to include. By default, these addons are moved to a local_addons folder and the `addons.make` file is updated to point to this directory. If the --library flag is passed, addons are consolidated into the openFrameworks/addons folder as used conventionally.

The --library flag copies the openFrameworks directory defined in `.ofpkg/ofpkg/config.json`, but omits some unnecessary subdirectories to save space. By default, the directories that are avoided are:
- `examples/`
- `projectGenerator/` (included with the --projgen flag)
- `apps/` (except for directories passed as input)
- `addons/` (except for addons found in addons.make files)