/* global Zotero, Services */
/*
 * Zotero Multiple Libraries — main object
 *
 * Loaded by bootstrap.js. Sub-modules (src/*.js) attach themselves to this object.
 */

var ZoteroMultipleLibraries = {
	id: null,
	version: null,
	rootURI: null,
	started: false,

	// Sub-module files, in load order
	_modules: [
		"util.js",
	],

	_windows: new Set(),

	async startup({ id, version, rootURI, reason }) {
		if (this.started) {
			return;
		}
		this.id = id;
		this.version = version;
		this.rootURI = rootURI;

		for (let file of this._modules) {
			Services.scriptloader.loadSubScript(rootURI + "src/" + file);
		}
		this.Util.log(`starting version ${version} (reason ${reason})`);

		await Zotero.uiReadyPromise;

		// Windows that are already open don't get onMainWindowLoad
		for (let win of Zotero.getMainWindows()) {
			this.onMainWindowLoad(win);
		}

		this.started = true;
		this.Util.log("started");
	},

	onMainWindowLoad(window) {
		if (this._windows.has(window)) {
			return;
		}
		this._windows.add(window);
		// Make our Fluent strings available to this window's document
		window.MozXULElement.insertFTLIfNeeded("zotero-multiple-libraries.ftl");
		this.Util.log("attached to main window");
	},

	onMainWindowUnload(window) {
		this._windows.delete(window);
	},

	async shutdown(reason) {
		this.Util.log(`shutting down (reason ${reason})`);
		for (let win of Array.from(this._windows)) {
			this.onMainWindowUnload(win);
		}
		this.Util.Patches.unwrapAll();
		this.started = false;
	},
};
