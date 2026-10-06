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
		"settings.js",
		"libraries.js",
		"core.js",
		"tree.js",
		"ui.js",
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

		// Public handle (Run JavaScript, other plugins, tests)
		Zotero.MultipleLibraries = this;

		await Zotero.uiReadyPromise;
		await this.Settings.load();

		// Make sure Zotero core never syncs local libraries, even without us
		this.Libraries.ensureAllSkipped();
		this.Core.init();
		this.UI.init();
		this.Tree.startWindowWatcher();


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
		this.UI.attachWindow(window);
		this.Tree.attach(window).catch(e => this.Util.error(e));
		this.Util.log("attached to main window");
	},

	onMainWindowUnload(window) {
		this._windows.delete(window);
		this.Tree.forget(window);
	},

	async shutdown(reason) {
		this.Util.log(`shutting down (reason ${reason})`);
		this.Tree.stopWindowWatcher();
		this.UI.uninit();
		this.Core.uninit();
		this.Util.Patches.unwrapAll();
		// With the patches gone, redraw so local libraries show under Group Libraries
		await this.Tree.detachAll();
		this._windows.clear();
		if (Zotero.MultipleLibraries === this) {
			delete Zotero.MultipleLibraries;
		}
		this.started = false;
	},
};
