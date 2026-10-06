/* global Zotero, Services, APP_SHUTDOWN */
/*
 * ZoteroMultipleLibraries — bootstrap
 *
 * Zotero calls these functions (see Zotero.Plugins in Zotero's xpcom/plugins.js).
 * All real work lives in src/, loaded into this sandbox with loadSubScript so that
 * the whole plugin shares one scope and can be unloaded cleanly.
 */

var ZoteroMultipleLibraries; // defined by src/zml.js

function log(msg) {
	Zotero.debug("ZoteroMultipleLibraries [bootstrap]: " + msg);
}

function install(_data, _reason) {}

async function startup({ id, version, rootURI }, reason) {
	log(`startup (reason ${reason})`);
	// Plugins start after Zotero finished initializing, but be defensive.
	await Zotero.initializationPromise;
	Services.scriptloader.loadSubScript(rootURI + "src/zml.js");
	await ZoteroMultipleLibraries.startup({ id, version, rootURI, reason });
}

function onMainWindowLoad({ window }, _reason) {
	if (ZoteroMultipleLibraries) {
		ZoteroMultipleLibraries.onMainWindowLoad(window);
	}
}

function onMainWindowUnload({ window }, _reason) {
	if (ZoteroMultipleLibraries) {
		ZoteroMultipleLibraries.onMainWindowUnload(window);
	}
}

async function shutdown(_data, reason) {
	log(`shutdown (reason ${reason})`);
	if (reason === APP_SHUTDOWN) {
		return;
	}
	if (ZoteroMultipleLibraries) {
		await ZoteroMultipleLibraries.shutdown(reason);
		ZoteroMultipleLibraries = undefined;
	}
}

function uninstall(_data, _reason) {}
