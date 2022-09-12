#!/bin/bash

MAJOR="0"
MINOR="1"
PATCH="0"
PWD=$(pwd)
DIST="ofpkg-macos-x64"

if [ ! -d ${HOME}/.ofpkg/ ]
then
    echo "Installing at ${HOME}/.ofpkg"
    mkdir ${HOME}/.ofpkg
else
    echo "~/.ofpkg already exists. Updating..."
fi

cd ${HOME}/.ofpkg

echo "Downloading ofpkg..."
curl -LOks https://github.com/oxgr/ofpkg/releases/download/v${MAJOR}.${MINOR}.${PATCH}/${DIST}.zip

mkdir tmp
unzip -qq ${DIST}.zip -d ./tmp
cp -n ./tmp/ofpkg.config.json .
cp -r ./tmp/bin .
rm ${DIST}.zip
rm -rf tmp

cd ${PWD}

echo "Done!"

if [[ $PATH != *"ofpkg"* ]]; then
    echo ""
    echo "Please manually add ofpkg to your PATH variable by appending the following line to your shell profile."
    echo ""
    echo "PATH=\$PATH:\$HOME/.ofpkg/bin"
    echo ""
fi