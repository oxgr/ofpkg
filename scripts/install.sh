#!/bin/bash

MAJOR="0"
MINOR="1"
PATCH="6"
VERSION=$(curl https://raw.githubusercontent.com/oxgr/ofpkg/main/package.json | grep -o '"version": "[^"]*' | grep -o '[^"]*$')
PWD=$(pwd)
DIST="ofpkg-macos-x64-v${VERSION}"

if [ ! -d ${HOME}/.ofpkg/ ]
then
    mkdir ${HOME}/.ofpkg
fi

cd ${HOME}/.ofpkg

echo "Downloading ofpkg@v${VERSION}..."
curl -LOks https://github.com/oxgr/ofpkg/releases/download/v${VERSION}/${DIST}.zip

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