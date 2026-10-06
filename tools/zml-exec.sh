#!/bin/bash
#
# Run JavaScript inside the test Zotero instance started by tools/test-profile.sh
# (requires the development bridge, which that script installs).
#
# Usage:
#   tools/zml-exec.sh 'return Zotero.version'
#   tools/zml-exec.sh -f tests/some-script.js
#
# The code runs as the body of an async function with Zotero, ZoteroPane and
# window in scope; `return` a JSON-serializable value to see it.
#
set -euo pipefail
PORT="${ZML_TEST_PORT:-23129}"
if [ "${1:-}" = "-f" ]; then
	curl -s -X POST -H 'Content-Type: text/plain' --data-binary "@$2" "http://127.0.0.1:$PORT/zml-dev/exec"
else
	curl -s -X POST -H 'Content-Type: text/plain' --data-binary "${1:-return null}" "http://127.0.0.1:$PORT/zml-dev/exec"
fi
echo
