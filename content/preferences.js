/* global Zotero, Services, window, document, MozXULElement */
/*
 * Preferences pane: Zotero → Settings → ZoteroMultipleLibraries
 *
 * Loaded by Zotero into a sandbox whose prototype is the preferences window,
 * before the pane markup (content/preferences.xhtml) is inserted.
 *
 * Sections: Libraries (pick / create / show a group library as extra library),
 * Syncing of the selected library (not synced: guided steps to a private
 * zotero.org group; synced: pause, or show under Group Libraries again), and
 * File syncing (Zotero storage, WebDAV reusing My Library's server or a
 * different one, or none).
 */

window.ZoteroMultipleLibrariesPrefs = {
	get ZML() {
		return Zotero.MultipleLibraries;
	},

	_libraryID: null,
	_initialized: false,
	_notifierID: null,

	$(id) {
		return document.getElementById(id);
	},

	getString(id, args) {
		return this.ZML.Util.getString(id, args);
	},

	get library() {
		return this._libraryID ? Zotero.Libraries.get(this._libraryID) : null;
	},

	async init() {
		if (this._initialized || !this.$("zml-prefs-root")) {
			return;
		}
		this._initialized = true;

		// Libraries
		this.$("zml-library").addEventListener("command", () => {
			this.selectLibrary(parseInt(this.$("zml-library").value));
		});
		this.$("zml-new").addEventListener("command", () => this.newLibrary());
		this.$("zml-rename").addEventListener("command", () => this.renameLibrary());
		this.$("zml-delete").addEventListener("command", () => this.deleteLibrary());
		this.$("zml-adopt").addEventListener("command", () => this.adoptGroup());

		// Syncing
		this.$("zml-open-groups").addEventListener("command", () => {
			Zotero.launchURL("https://www.zotero.org/groups/new");
		});
		this.$("zml-sync-now").addEventListener("command", () => this.syncNow());
		this.$("zml-group-select").addEventListener("command", () => {
			let value = this.$("zml-group-select").value;
			if (value) {
				this.$("zml-group-id").value = value;
			}
		});
		this.$("zml-group-id").addEventListener("input", () => {
			// Typing an ID takes precedence over the list
			this.$("zml-group-select").value = "";
		});
		this.$("zml-link").addEventListener("command", () => this.linkLibrary());
		this.$("zml-sync-enabled").addEventListener("command", () => this.toggleSync());
		this.$("zml-release").addEventListener("command", () => this.releaseGroup());

		// File syncing
		this.$("zml-file-mode").addEventListener("command", () => this.changeFileMode());
		this.$("zml-webdav-source").addEventListener("command", () => this.changeWebDAVSource());
		this.$("zml-scheme").addEventListener("command", () => this.saveWebDAVFields());
		for (let id of ["zml-url", "zml-username", "zml-password"]) {
			this.$(id).addEventListener("change", () => this.saveWebDAVFields());
		}
		this.$("zml-verify").addEventListener("command", () => this.verifyServer());

		// Keep the lists in step with libraries created/renamed/deleted/downloaded elsewhere
		this._notifierID = Zotero.Notifier.registerObserver({
			notify: (action, type, ids) => {
				if (type == "group") {
					this.refreshList();
				}
				else if (type == "setting" && this._libraryID) {
					// Shared settings arrived for the selected library
					let key = this.ZML.Shared.KEY;
					if (ids.some(id => String(id) == this._libraryID + "/" + key)) {
						// Give the plugin's own handler time to apply them first
						window.setTimeout(() => this.render(), 500);
					}
				}
			},
		}, ["group", "setting"], "zotero-multiple-libraries-prefs");
		window.addEventListener("unload", () => {
			if (this._notifierID) {
				Zotero.Notifier.unregisterObserver(this._notifierID);
			}
		}, { once: true });

		// "Library Settings…" while the pane is already open
		let container = this.$("zml-prefs-root").parentElement;
		if (container) {
			container.addEventListener("action", () => this.applyRequestedSelection());
		}

		await this.refreshList();
		await this.applyRequestedSelection();
	},

	/**
	 * Select the library named in the selectLibrary pref (set by "Library Settings…")
	 */
	async applyRequestedSelection() {
		let libraryID = this.ZML.Util.getPref("selectLibrary");
		if (libraryID) {
			this.ZML.Util.setPref("selectLibrary", 0);
			if (Zotero.Libraries.exists(libraryID)) {
				await this.selectLibrary(libraryID);
			}
		}
	},

	//
	// Libraries section
	//
	async refreshList() {
		let menulist = this.$("zml-library");
		let popup = menulist.menupopup || menulist.querySelector("menupopup");
		popup.replaceChildren();
		let libraries = this.ZML.Libraries.getAll();
		for (let library of libraries) {
			let item = document.createXULElement("menuitem");
			item.setAttribute("label", library.name);
			item.setAttribute("value", library.libraryID);
			popup.appendChild(item);
		}
		this.$("zml-no-libraries").hidden = libraries.length > 0;
		this.refreshAdoptableGroups();
		let current = libraries.find(l => l.libraryID == this._libraryID);
		await this.selectLibrary(current ? current.libraryID : (libraries[0] ? libraries[0].libraryID : null));
	},

	/**
	 * Ordinary group libraries on this computer that can be shown as extra
	 * libraries (e.g., a group linked to an extra library on another computer)
	 */
	refreshAdoptableGroups() {
		let groups = this.ZML.Libraries.getAdoptableGroups();
		let menulist = this.$("zml-adopt-select");
		let popup = menulist.menupopup || menulist.querySelector("menupopup");
		popup.replaceChildren();
		for (let group of groups) {
			let item = document.createXULElement("menuitem");
			item.setAttribute("label", `${group.name} (${group.groupID})`);
			item.setAttribute("value", String(group.libraryID));
			popup.appendChild(item);
		}
		menulist.value = groups.length ? String(groups[0].libraryID) : "";
		this.$("zml-adopt-box").hidden = groups.length == 0;
	},

	async selectLibrary(libraryID) {
		this._libraryID = libraryID || null;
		this.$("zml-library").value = libraryID ? String(libraryID) : "";
		await this.render();
	},

	async newLibrary() {
		let library = await this.ZML.UI.newLibrary(window);
		if (library) {
			this._libraryID = library.libraryID;
			await this.refreshList();
		}
	},

	async renameLibrary() {
		if (this.library) {
			await this.ZML.UI.renameLibrary(window, this.library);
			await this.refreshList();
		}
	},

	async deleteLibrary() {
		if (this.library) {
			await this.ZML.UI.deleteLibrary(window, this.library);
			await this.refreshList();
		}
	},

	async adoptGroup() {
		let libraryID = parseInt(this.$("zml-adopt-select").value);
		let library = libraryID ? Zotero.Libraries.get(libraryID) : null;
		if (!library) {
			return;
		}
		if (await this.ZML.UI.adoptGroup(window, library)) {
			this._libraryID = library.libraryID;
			await this.refreshList();
		}
	},

	//
	// Rendering of the selected library
	//
	async render() {
		const ZML = this.ZML;
		let library = this.library;
		let hasLibrary = !!library && ZML.Libraries.isManagedLibrary(library);
		for (let id of ["zml-rename", "zml-delete"]) {
			this.$(id).disabled = !hasLibrary;
		}
		this.$("zml-sync-box").hidden = !hasLibrary;
		this.$("zml-file-box").hidden = !hasLibrary;
		if (!hasLibrary) {
			return;
		}

		let linked = ZML.Libraries.isLinkedLibrary(library);
		this.$("zml-sync-heading").textContent = this.getString("zml-prefs-sync-heading", { name: library.name });
		this.$("zml-file-heading").textContent = this.getString("zml-prefs-file-heading", { name: library.name });

		// Syncing
		this.$("zml-sync-status").textContent = linked
			? this.getString("zml-prefs-status-linked", { groupID: String(library.groupID) })
			: this.getString("zml-prefs-status-local");
		this.$("zml-link-box").hidden = linked;
		this.$("zml-linked-box").hidden = !linked;
		if (linked) {
			this.$("zml-sync-enabled").checked = ZML.Libraries.isSyncEnabled(library);
		}
		else {
			await this.refreshLinkableGroups();
		}

		// Files
		this.$("zml-file-unavailable").hidden = linked;
		this.$("zml-file-settings").hidden = !linked;
		if (linked) {
			await this.renderFileSettings();
		}
	},

	/**
	 * Empty, not yet managed group libraries (e.g., a group just created on
	 * zotero.org and downloaded by sync) that can be chosen without typing an ID
	 */
	async refreshLinkableGroups() {
		let groups = await this.ZML.Libraries.getLinkableGroups();
		let menulist = this.$("zml-group-select");
		let popup = menulist.menupopup || menulist.querySelector("menupopup");
		popup.replaceChildren();
		let placeholder = document.createXULElement("menuitem");
		placeholder.setAttribute("label", this.getString("zml-prefs-group-select-placeholder"));
		placeholder.setAttribute("value", "");
		popup.appendChild(placeholder);
		for (let group of groups) {
			let item = document.createXULElement("menuitem");
			item.setAttribute("label", `${group.name} (${group.groupID})`);
			item.setAttribute("value", String(group.groupID));
			popup.appendChild(item);
		}
		menulist.value = "";
		this.$("zml-group-select-box").hidden = groups.length == 0;
		this.$("zml-no-group-yet").hidden = groups.length > 0;
	},

	async renderFileSettings() {
		const ZML = this.ZML;
		let libraryID = this._libraryID;
		let config = ZML.Settings.get(libraryID).fileSync;
		let unset = config.mode == "unset";
		let mode = ZML.Storage.MODES.includes(config.mode) ? config.mode : (unset ? "" : "zotero");
		this.$("zml-file-deliberate-note").hidden = !unset;
		let radiogroup = this.$("zml-file-mode");
		if (mode) {
			radiogroup.value = mode;
		}
		else {
			radiogroup.selectedIndex = -1;
		}

		// Zotero storage
		this.$("zml-zotero-note").hidden = mode != "zotero";
		if (mode == "zotero") {
			let active = !!Zotero.Users.getCurrentUserID();
			this.$("zml-zotero-note").textContent = this.getString(active
				? "zml-prefs-zotero-storage-note"
				: "zml-prefs-zotero-storage-note-inactive");
		}

		// WebDAV
		this.$("zml-webdav-box").hidden = mode != "webdav";
		if (mode == "webdav") {
			let mainAvailable = ZML.Storage.mainWebDAVAvailable();
			let useMain = !!config.useMain && mainAvailable;
			this.$("zml-webdav-main").disabled = !mainAvailable;
			this.$("zml-webdav-source").value = useMain ? "main" : "custom";
			this.$("zml-webdav-custom-box").hidden = useMain;
			this.$("zml-scheme").value = config.scheme || "https";
			this.$("zml-url").value = config.url || "";
			this.$("zml-username").value = config.username || "";
			this.$("zml-password").value = await ZML.Storage.getPassword(libraryID);
			this.updateWebDAVFolder();
			if (!useMain && config.url && config.username && !this.$("zml-password").value) {
				// Settings came from another computer; the password never travels
				this.updateVerifyStatus(this.getString("zml-prefs-password-required"));
			}
			else {
				this.updateVerifyStatus();
			}
		}
	},

	/**
	 * Where this library's files go on the WebDAV server
	 */
	updateWebDAVFolder() {
		const ZML = this.ZML;
		let config = ZML.Settings.get(this._libraryID).fileSync;
		let text;
		if (config.useMain && !ZML.Storage.mainWebDAVAvailable()) {
			text = this.getString("zml-prefs-webdav-main-unavailable");
		}
		else {
			let url = ZML.Storage.getDisplayRootURL(this._libraryID);
			text = url
				? this.getString("zml-prefs-webdav-folder", { url })
				: this.getString("zml-prefs-webdav-folder-unknown");
		}
		this.$("zml-webdav-folder").textContent = text;
	},

	updateVerifyStatus(text) {
		if (text === undefined) {
			let verified = this.ZML.Settings.get(this._libraryID).fileSync.verified;
			text = this.getString(verified ? "zml-prefs-verified" : "zml-prefs-not-verified");
		}
		this.$("zml-verify-status").textContent = text;
	},

	//
	// Syncing actions
	//
	async syncNow() {
		let button = this.$("zml-sync-now");
		let status = this.$("zml-sync-now-status");
		button.disabled = true;
		status.textContent = this.getString("zml-prefs-sync-now-running");
		try {
			// Same as the toolbar button; errors (e.g., no account) are shown by Zotero
			await Zotero.Sync.Runner.sync();
		}
		catch (e) {
			this.ZML.Util.error(e);
		}
		finally {
			button.disabled = false;
		}
		await this.refreshList();
		let count = (await this.ZML.Libraries.getLinkableGroups()).length;
		status.textContent = this.getString("zml-prefs-sync-now-done", { count });
	},

	async linkLibrary() {
		if (!this.library) {
			return;
		}
		let groupID = this.$("zml-group-id").value.trim() || this.$("zml-group-select").value;
		let result = await this.ZML.UI.linkLibrary(window, this.library, groupID);
		if (result == "adopted") {
			// The existing group was adopted instead; show it
			let adopted = Zotero.Groups.get(parseInt(groupID));
			if (adopted) {
				this._libraryID = adopted.libraryID;
			}
			this.$("zml-group-id").value = "";
			await this.refreshList();
		}
		else if (result) {
			this.$("zml-group-id").value = "";
			await this.render();
		}
	},

	toggleSync() {
		if (this.library && this.ZML.Libraries.isLinkedLibrary(this.library)) {
			this.ZML.Libraries.setSyncEnabled(this.library, this.$("zml-sync-enabled").checked);
		}
	},

	async releaseGroup() {
		if (this.library && await this.ZML.UI.releaseGroup(window, this.library)) {
			this._libraryID = null;
			await this.refreshList();
		}
	},

	//
	// File syncing actions
	//
	async changeFileMode() {
		if (!this.library) {
			return;
		}
		let mode = this.$("zml-file-mode").value;
		let previous = this.ZML.Settings.get(this._libraryID).fileSync.mode;
		if (mode == previous) {
			return;
		}
		await this.ZML.Settings.update(this._libraryID, (c) => {
			c.fileSync.mode = mode;
		});
		this.ZML.Storage.resetController(this._libraryID);
		// Switching where files live: start the file sync history afresh so files
		// present here are uploaded and missing ones fetched from the new place
		if (mode != "none") {
			try {
				await Zotero.Sync.Storage.Local.resetAllSyncStates(this._libraryID);
			}
			catch (e) {
				this.ZML.Util.error(e);
			}
		}
		await this.ZML.Shared.publish(this._libraryID);
		await this.renderFileSettings();
		if (mode == "webdav" && this.ZML.Settings.get(this._libraryID).fileSync.useMain
				&& this.ZML.Storage.mainWebDAVAvailable()) {
			await this.verifyServer({ silent: true });
		}
	},

	async changeWebDAVSource() {
		if (!this.library) {
			return;
		}
		let useMain = this.$("zml-webdav-source").value == "main";
		if (useMain && !this.ZML.Storage.mainWebDAVAvailable()) {
			Services.prompt.alert(window, this.getString("zml-prefpane-label"),
				this.getString("zml-prefs-webdav-main-unavailable"));
			this.$("zml-webdav-source").value = "custom";
			return;
		}
		let previous = !!this.ZML.Settings.get(this._libraryID).fileSync.useMain;
		if (useMain == previous) {
			return;
		}
		await this.ZML.Settings.update(this._libraryID, (c) => {
			c.fileSync.useMain = useMain;
			c.fileSync.verified = false;
		});
		this.ZML.Storage.resetController(this._libraryID);
		await this.ZML.Shared.publish(this._libraryID);
		await this.renderFileSettings();
		if (useMain) {
			// Creates the library's folder on My Library's server and checks it
			await this.verifyServer({ silent: true });
		}
	},

	/**
	 * @return {Boolean} - False if the URL was rejected
	 */
	_checkURL(url) {
		const ZML = this.ZML;
		let normalize = u => (u || "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase();
		let mine = normalize(url);
		if (!mine) {
			return true;
		}
		// Never share a folder with My Library's WebDAV sync…
		if (Zotero.Prefs.get("sync.storage.protocol") == "webdav"
				&& normalize(Zotero.Prefs.get("sync.storage.url")) == mine) {
			Services.prompt.alert(window, this.getString("zml-prefpane-label"),
				this.getString("zml-error-url-same-as-main"));
			return false;
		}
		// …nor with another extra library
		for (let other of ZML.Libraries.getAll()) {
			if (other.libraryID == this._libraryID) {
				continue;
			}
			let config = ZML.Settings.get(other.libraryID).fileSync;
			if (config.mode != "webdav") {
				continue;
			}
			let otherURL = config.useMain
				? (ZML.Storage.getDisplayRootURL(other.libraryID) || "").replace(/\/zotero\/?$/, "")
				: config.url;
			if (normalize(otherURL) == mine) {
				Services.prompt.alert(window, this.getString("zml-prefpane-label"),
					this.getString("zml-error-url-same-as-other", { name: other.name }));
				return false;
			}
		}
		return true;
	},

	/**
	 * Persist URL/scheme/username/password of a custom server; any change
	 * unverifies the server
	 *
	 * @return {Boolean} - False if a value was rejected
	 */
	async saveWebDAVFields() {
		if (!this.library) {
			return false;
		}
		const ZML = this.ZML;
		let libraryID = this._libraryID;
		let scheme = this.$("zml-scheme").value || "https";
		let url = this.$("zml-url").value.trim().replace(/^https?:\/\//i, "");
		let username = this.$("zml-username").value.trim();
		let password = this.$("zml-password").value;
		if (!this._checkURL(url)) {
			return false;
		}
		let config = ZML.Settings.get(libraryID).fileSync;
		let oldPassword = await ZML.Storage.getPassword(libraryID);
		let changed = config.scheme != scheme || config.url != url
			|| config.username != username || oldPassword != password;
		if (!changed) {
			return true;
		}
		await ZML.Settings.update(libraryID, (c) => {
			c.fileSync.scheme = scheme;
			c.fileSync.url = url;
			c.fileSync.username = username;
			c.fileSync.verified = false;
		});
		await ZML.Storage.setPassword(libraryID, username, password);
		ZML.Storage.resetController(libraryID);
		await ZML.Shared.publish(libraryID);
		this.$("zml-url").value = url;
		this.updateWebDAVFolder();
		this.updateVerifyStatus();
		return true;
	},

	async verifyServer({ silent = false } = {}) {
		if (!this.library) {
			return false;
		}
		const ZML = this.ZML;
		let libraryID = this._libraryID;
		let useMain = !!ZML.Settings.get(libraryID).fileSync.useMain;
		if (!useMain && !(await this.saveWebDAVFields())) {
			return false;
		}
		let button = this.$("zml-verify");
		button.disabled = true;
		this.updateVerifyStatus(this.getString("zml-prefs-verifying"));
		let success = false;
		try {
			ZML.Storage.resetController(libraryID);
			let controller = ZML.Storage.getController(libraryID, {});
			try {
				await controller.checkServer();
				success = true;
			}
			catch (e) {
				success = await controller.handleVerificationError(e, window);
			}
		}
		catch (e) {
			ZML.Util.error(e);
			Services.prompt.alert(window, Zotero.getString("general.error"), String(e));
		}
		finally {
			button.disabled = false;
		}
		this.updateVerifyStatus();
		if (success && !silent) {
			Zotero.alert(
				window,
				Zotero.getString("sync.storage.serverConfigurationVerified"),
				Zotero.getString("sync.storage.fileSyncSetUp")
			);
		}
		return success;
	},
};

// Our strings for data-l10n-id attributes in the pane markup
try {
	MozXULElement.insertFTLIfNeeded("zotero-multiple-libraries.ftl");
}
catch (e) {
	Zotero.logError(e);
}

// The markup is inserted after this script runs; initialize once it is there
(async function () {
	for (let i = 0; i < 200; i++) {
		if (document.getElementById("zml-prefs-root")) {
			try {
				await window.ZoteroMultipleLibrariesPrefs.init();
			}
			catch (e) {
				Zotero.logError(e);
			}
			return;
		}
		await new Promise(resolve => window.setTimeout(resolve, 50));
	}
})();
