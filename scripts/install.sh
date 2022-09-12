#!/bin/bash

MAJOR="0"
MINOR="1"
PATCH="0"

echo "Starting install..."

echo "curl echo.sh"
bash <( curl -s https://raw.githubusercontent.com/oxgr/ofpkg/main/scripts/echo.sh )

echo "curl release"
curl -o ofpkg https://github.com/oxgr/ofpkg/releases/download/v${MAJOR}.${MINOR}.${PATCH}/ofpkg-osx-x64