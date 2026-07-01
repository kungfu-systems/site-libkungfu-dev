#!/bin/bash
set -eu

repo_root=$(cd "$(dirname "$0")/.." && pwd)
cd "$repo_root"

if grep -RInE 'mailto:|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' \
  README.md docs public; then
  echo "error: email address or mailto link found" >&2
  exit 1
fi

test -f public/dev/index.html
grep -q 'libkungfu dev' public/dev/index.html
grep -q 'Technical release surface' public/dev/index.html
grep -q 'github.com/kungfu-systems/kungfu' public/dev/index.html

if [ -d dist ]; then
  test -f dist/dev/index.html
  grep -q 'libkungfu dev' dist/dev/index.html
  grep -q 'Technical release surface' dist/dev/index.html
fi

echo "site-libkungfu-dev checks passed"
