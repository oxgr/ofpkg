#!/bin/bash

MAJOR="0"
MINOR="1"
PATCH="6"
PWD=$(pwd)
DIST="ofpkg-macos-x64-v${MAJOR}.${MINOR}.${PATCH}"

if [ ! -d ${HOME}/.ofpkg/ ]
then
    mkdir ${HOME}/.ofpkg
fi

cd ${HOME}/.ofpkg

echo "Downloading ofpkg@v${MAJOR}.${MINOR}.${PATCH}..."
curl -LOks https://github.com/oxgr/ofpkg/releases/download/v${MAJOR}.${MINOR}.${PATCH}/${DIST}.zip

echo "Installing at ${HOME}/.ofpkg ..."

mkdir tmp
unzip -qq ${DIST}.zip -d ./tmp
mkdir -p ./data
cp -nv ./tmp/data/* ./data
cp -rv ./tmp/bin .
rm ${DIST}.zip
rm -rf tmp

cd ${PWD}

echo "Done!"

if ! command -V ofpkg &> /dev/null
then
    echo ""
    echo "Please manually add ofpkg to your PATH variable by appending the following line to your shell profile."
    echo ""
    echo "PATH=\$PATH:\$HOME/.ofpkg/bin"
    echo ""
    exit
fi

# if [[ $PATH != *"ofpkg"* ]]; then
#     echo ""
#     echo "Please manually add ofpkg to your PATH variable by appending the following line to your shell profile."
#     echo ""
#     echo "PATH=\$PATH:\$HOME/.ofpkg/bin"
#     echo ""
# fi