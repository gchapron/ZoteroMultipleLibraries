#!/bin/bash
#
# Save a PNG screenshot of the test instance's main window (via the dev bridge).
# Usage: tools/snapshot.sh out.png
#
set -euo pipefail
OUT="${1:?usage: tools/snapshot.sh out.png}"
PORT="${ZML_TEST_PORT:-23129}"
JS='let win = Zotero.getMainWindow();
let bitmap = await win.browsingContext.currentWindowGlobal.drawSnapshot(null, 1, "white");
let canvas = win.document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
canvas.width = bitmap.width; canvas.height = bitmap.height;
canvas.getContext("2d").drawImage(bitmap, 0, 0);
return canvas.toDataURL("image/png");'
curl -s -X POST -H 'Content-Type: text/plain' --data-binary "$JS" "http://127.0.0.1:$PORT/zml-dev/exec" \
	| python3 -c '
import sys, json, base64
d = json.load(sys.stdin)
if not d.get("ok"):
    sys.exit("snapshot failed: %s" % d.get("error"))
open(sys.argv[1], "wb").write(base64.b64decode(d["result"].split(",", 1)[1]))
print("saved", sys.argv[1])
' "$OUT"
