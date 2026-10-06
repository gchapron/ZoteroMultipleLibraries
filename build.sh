#!/bin/bash
#
# Build the XPI: build/zotero-multiple-libraries-<version>.xpi
#
set -euo pipefail
cd "$(dirname "$0")"
# Refuse to package invalid JSON (Zotero silently refuses to load such a plugin)
for f in manifest.json updates.json; do
	python3 -m json.tool "$f" > /dev/null || { echo "invalid JSON: $f" >&2; exit 1; }
done
VERSION=$(python3 -c 'import json; print(json.load(open("manifest.json"))["version"])')
NAME="zotero-multiple-libraries"
OUT="build/$NAME-$VERSION.xpi"
mkdir -p build
rm -f "$OUT"
zip -q -r -X "$OUT" manifest.json bootstrap.js prefs.js src content locale LICENSE README.md -x '*.DS_Store'
echo "built $OUT"
unzip -l "$OUT" | tail -1
