#!/bin/bash
#
# Build the XPI: build/zotero-multiple-libraries-<version>.xpi
#
set -euo pipefail
cd "$(dirname "$0")"
VERSION=$(python3 -c 'import json; print(json.load(open("manifest.json"))["version"])')
NAME="zotero-multiple-libraries"
OUT="build/$NAME-$VERSION.xpi"
mkdir -p build
rm -f "$OUT"
zip -q -r -X "$OUT" manifest.json bootstrap.js prefs.js src locale LICENSE README.md -x '*.DS_Store'
echo "built $OUT"
unzip -l "$OUT" | tail -1
