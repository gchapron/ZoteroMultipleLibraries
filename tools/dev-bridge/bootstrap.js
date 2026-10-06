/* global Zotero */
/*
 * ZML Dev Bridge — DEVELOPMENT ONLY
 *
 * Registers POST /zml-dev/exec on Zotero's local HTTP server (127.0.0.1 only).
 * The request body is JavaScript, run as the body of an async function with
 * `Zotero`, `ZoteroPane` and `window` (the main window) in scope. The response is
 * JSON: {ok: true, result} or {ok: false, error, stack}.
 *
 * This is remote code execution on localhost. It exists so that the smoke tests
 * in tests/ can drive a throwaway Zotero instance (tools/test-profile.sh).
 * Never install it in a profile you care about.
 */

const ENDPOINT = "/zml-dev/exec";

function startup() {
	const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

	function safeStringify(obj) {
		const seen = new WeakSet();
		return JSON.stringify(obj, (key, value) => {
			if (typeof value == "bigint") {
				return value.toString();
			}
			if (value && typeof value == "object") {
				if (seen.has(value)) {
					return "[circular]";
				}
				seen.add(value);
			}
			return value;
		});
	}

	function Exec() {}
	Exec.prototype = {
		supportedMethods: ["POST"],
		supportedDataTypes: ["text/plain", "application/json"],
		permitBookmarklet: false,

		init: async function (req) {
			let code = typeof req.data == "string" ? req.data : (req.data && req.data.code) || "";
			try {
				let win = Zotero.getMainWindow();
				let fn = new AsyncFunction("Zotero", "ZoteroPane", "window", code);
				let result = await fn(Zotero, win && win.ZoteroPane, win);
				return [200, "application/json", safeStringify({ ok: true, result })];
			}
			catch (e) {
				return [200, "application/json", safeStringify({
					ok: false,
					error: String(e),
					stack: e && e.stack,
				})];
			}
		},
	};

	Zotero.Server.Endpoints[ENDPOINT] = Exec;
	Zotero.debug("ZML Dev Bridge: registered " + ENDPOINT);
}

function shutdown() {
	delete Zotero.Server.Endpoints[ENDPOINT];
}

function install() {}
function uninstall() {}
