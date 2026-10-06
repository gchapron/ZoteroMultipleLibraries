/* global Zotero, Services, window, document, MozXULElement */
/*
 * Preferences pane: Zotero → Settings → ZoteroMultipleLibraries
 *
 * Loaded by Zotero into a sandbox whose prototype is the preferences window,
 * before the pane markup (content/preferences.xhtml) is inserted.
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

	async init() {
		if (this._initialized || !this.$("zml-prefs-root")) {
			return;
		}
		this._initialized = true;

		this.$("zml-library").addEventListener("command", () => {
			this.selectLibrary(parseInt(this.$("zml-library").value));
		});
		this.$("zml-new").addEventListener("command", () => this.newLibrary());
		this.$("zml-rename").addEventListener("command", () => this.renameLibrary());
		this.$("zml-delete").addEventListener("command", () => this.deleteLibrary());
		this.$("zml-link").addEventListener("command", () => this.linkLibrary());
		this.$("zml-adopt").addEventListener("command", () => this.adoptGroup());
		this.$("zml-release").addEventListener("command", () => this.releaseGroup());
		this.$("zml-group-select").addEventListener("command", () => {
			let value = this.$("zml-group-select").value;
			if (value) {
				this.$("zml-group-id").value = value;
			}
		});
		this.$("zml-sync-enabled").addEventListener("command", () => this.toggleSync());
		this.$("zml-file-mode").addEventListener("command", () => this.changeFileMode());
		for (let id of ["zml-scheme"]) {
			this.$(id).addEventListener("command", () => this.saveWebDAVFields());
		}
		for (let id of ["zml-url", "zml-username", "zml-password"]) {
			this.$(id).addEventListener("change", () => this.saveWebDAVFields());
		}
		this.$("zml-verify").addEventListener("command", () => this.verifyServer());

		// Keep the list in step with libraries created/renamed/deleted elsewhere
		this._notifierID = Zotero.Notifier.registerObserver({
			notify: (action, type) => {
				if (type == "group") {
					this.refreshList();
				}
			},
		}, ["group"], "zotero-multiple-libraries-prefs");
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

	get library() {
		return this._libraryID ? Zotero.Libraries.get(this._libraryID) : null;
	},

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

	async selectLibrary(libraryID) {
		this._libraryID = libraryID || null;
		let menulist = this.$("zml-library");
		menulist.value = libraryID ? String(libraryID) : "";
		await this.render();
	},

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
		this.$("zml-sync-status").textContent = linked
			? this.getString("zml-prefs-status-linked", { groupID: String(library.groupID) })
			: this.getString("zml-prefs-status-local");
		this.$("zml-link-box").hidden = linked;
		if (!linked) {
			await this.refreshLinkableGroups();
		}
		this.$("zml-sync-enabled").hidden = !linked;
		this.$("zml-sync-enabled").checked = linked && ZML.Libraries.isSyncEnabled(library);
		this.$("zml-release-box").hidden = !linked;

		this.$("zml-file-unavailable").hidden = linked;
		this.$("zml-file-settings").hidden = !linked;
		if (linked) {
			let config = ZML.Settings.get(library.libraryID).fileSync;
			this.$("zml-file-mode").value = config.mode || "none";
			this.$("zml-webdav-box").hidden = config.mode != "webdav";
			this.$("zml-scheme").value = config.scheme || "https";
			this.$("zml-url").value = config.url || "";
			this.$("zml-username").value = config.username || "";
			this.$("zml-password").value = await ZML.Storage.getPassword(library.libraryID);
			this.updateVerifyStatus();
		}
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

	async releaseGroup() {
		if (this.library && await this.ZML.UI.releaseGroup(window, this.library)) {
			this._libraryID = null;
			await this.refreshList();
		}
	},

	/**
	 * Empty, not yet managed group libraries (e.g., a group just created on
	 * zotero.org and downloaded by sync) that can be linked without typing an ID
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
	},

	updateVerifyStatus(text) {
		if (text === undefined) {
			let verified = this.ZML.Settings.get(this._libraryID).fileSync.verified;
			text = this.getString(verified ? "zml-prefs-verified" : "zml-prefs-not-verified");
		}
		this.$("zml-verify-status").textContent = text;
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

	async linkLibrary() {
		if (!this.library) {
			return;
		}
		let result = await this.ZML.UI.linkLibrary(window, this.library, this.$("zml-group-id").value);
		if (result == "adopted") {
			// The existing group was adopted instead; show it
			let groupID = parseInt(String(this.$("zml-group-id").value).trim());
			let adopted = Zotero.Groups.get(groupID);
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

	async changeFileMode() {
		if (!this.library) {
			return;
		}
		let mode = this.$("zml-file-mode").value;
		let previous = this.ZML.Settings.get(this._libraryID).fileSync.mode;
		await this.ZML.Settings.update(this._libraryID, (c) => {
			c.fileSync.mode = mode;
		});
		this.ZML.Storage.resetController(this._libraryID);
		this.$("zml-webdav-box").hidden = mode != "webdav";
		// Switching where files live: start the file sync history afresh so files
		// present here are uploaded and missing ones fetched from the new place
		if (mode != "none" && mode != previous) {
			try {
				await Zotero.Sync.Storage.Local.resetAllSyncStates(this._libraryID);
			}
			catch (e) {
				this.ZML.Util.error(e);
			}
		}
	},

	/**
	 * @return {Boolean} - False if the URL was rejected
	 */
	_checkURL(url) {
		const ZML = this.ZML;
		let normalize = u => (u || "").trim().replace(/\/+$/, "").toLowerCase();
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
			if (config.mode == "webdav" && normalize(config.url) == mine) {
				Services.prompt.alert(window, this.getString("zml-prefpane-label"),
					this.getString("zml-error-url-same-as-other", { name: other.name }));
				return false;
			}
		}
		return true;
	},

	/**
	 * Persist URL/scheme/username/password; any change unverifies the server
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
		this.$("zml-url").value = url;
		this.updateVerifyStatus();
		return true;
	},

	async verifyServer() {
		if (!this.library) {
			return;
		}
		if (!(await this.saveWebDAVFields())) {
			return;
		}
		const ZML = this.ZML;
		let libraryID = this._libraryID;
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
		if (success) {
			Zotero.alert(
				window,
				Zotero.getString("sync.storage.serverConfigurationVerified"),
				Zotero.getString("sync.storage.fileSyncSetUp")
			);
		}
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
