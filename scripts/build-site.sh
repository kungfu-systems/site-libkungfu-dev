#!/bin/bash
set -eu

repo_root=$(cd "$(dirname "$0")/.." && pwd)
cd "$repo_root"

test -d public

rm -rf dist
mkdir -p dist
cp -R public/. dist/

test -f dist/dev/index.html

echo "site-libkungfu-dev built dist/"
