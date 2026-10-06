/* global Zotero, ZoteroMultipleLibraries */
/*
 * Settings shared between computers.
 *
 * Zotero syncs per-library "synced settings" through zotero.org for group
 * libraries (that is how tag colours travel between computers). The plugin
 * stores, in the group's own synced settings, a marker saying "this group is
 * an extra library" together with the file syncing choice: mode, whether My
 * Library's WebDAV server is reused, scheme, server address and username.
 * The password is never shared.
 *
 * Another computer that syncs the group then adopts it automatically with the
 * same choice (a custom server's password still has to be entered there), and
 * later changes made on any computer propagate to the others.
 *
 * The setting's name: zotero.org only accepts a fixed list of setting names
 * plus a few per-item patterns, and rejects anything else with "Invalid
 * setting". Of those, lastReadAloudPosition_g<groupID>_<itemKey> takes an
 * arbitrary object as value, and Zotero's client only ever reads such a
 * setting for the item with that key. With a fixed pseudo key that no item can
 * have (item keys are random), the slot is unused by everything else, so the
 * marker is stored there.
 */

ZoteroMultipleLibraries.Shared = {
	// Setting names zotero.org rejected in 0.2.1; purged at startup
	LEGACY_KEY: "zoteroMultipleLibraries",
	PSEUDO_ITEM_KEY: "ZMLSETTG",
	VERSION: 1,

	/**
	 * Name of the group's synced setting holding the marker
	 */
	key(libraryID) {
		let library = Zotero.Libraries.get(libraryID);
		if (!library || library.libraryType != "group") {
			return null;
		}
		return "lastReadAloudPosition_g" + library.groupID + "_" + this.PSEUDO_ITEM_KEY;
	},

	isKey(key) {
		return typeof key == "string"
			&& key.startsWith("lastReadAloudPosition_g")
			&& key.endsWith("_" + this.PSEUDO_ITEM_KEY);
	},

	/**
	 * Remove the settings rows 0.2.1 created under a name zotero.org rejects;
	 * every sync retried them and failed. Direct SQL so that nothing is queued
	 * for upload or deletion again.
	 */
	async purgeLegacy() {
		const ZML = ZoteroMultipleLibraries;
		try {
			let libraryIDs = await Zotero.DB.columnQueryAsync(
				"SELECT DISTINCT libraryID FROM syncedSettings WHERE setting=?", this.LEGACY_KEY
			);
			let deleteLogIDs = await Zotero.DB.columnQueryAsync(
				"SELECT DISTINCT libraryID FROM syncDeleteLog WHERE key=? AND syncObjectTypeID IN "
				+ "(SELECT syncObjectTypeID FROM syncObjectTypes WHERE name='setting')",
				this.LEGACY_KEY
			);
			if (!libraryIDs.length && !deleteLogIDs.length) {
				return 0;
			}
			await Zotero.DB.executeTransaction(async () => {
				await Zotero.DB.queryAsync("DELETE FROM syncedSettings WHERE setting=?", this.LEGACY_KEY);
				await Zotero.DB.queryAsync(
					"DELETE FROM syncDeleteLog WHERE key=? AND syncObjectTypeID IN "
					+ "(SELECT syncObjectTypeID FROM syncObjectTypes WHERE name='setting')",
					this.LEGACY_KEY
				);
			});
			for (let libraryID of libraryIDs) {
				if (Zotero.Libraries.exists(libraryID)) {
					await Zotero.SyncedSettings.loadAll(libraryID);
				}
			}
			ZML.Util.log(`purged legacy shared-settings rows (${libraryIDs.length} libraries)`);
			return libraryIDs.length + deleteLogIDs.length;
		}
		catch (e) {
			ZML.Util.error(e);
			return 0;
		}
	},

	_notifierID: null,

	init() {
		this._notifierID = Zotero.Notifier.registerObserver(
			this._observer, ["setting"], "zotero-multiple-libraries-shared"
		);
	},

	uninit() {
		if (this._notifierID) {
			Zotero.Notifier.unregisterObserver(this._notifierID);
			this._notifierID = null;
		}
	},

	/**
	 * The marker stored in the group's synced settings, or null
	 */
	read(libraryID) {
		let key = this.key(libraryID);
		if (!key) {
			return null;
		}
		let value = Zotero.SyncedSettings.get(libraryID, key);
		if (!value || typeof value != "object" || !value.extraLibrary) {
			return null;
		}
		return value;
	},

	_normalize(value) {
		let fs = (value && value.fileSync) || {};
		return {
			mode: fs.mode || "",
			useMain: !!fs.useMain,
			scheme: fs.scheme || "https",
			url: fs.url || "",
			username: fs.username || "",
		};
	},

	fromLocal(libraryID) {
		let fs = ZoteroMultipleLibraries.Settings.get(libraryID).fileSync;
		return {
			version: this.VERSION,
			extraLibrary: true,
			fileSync: {
				mode: fs.mode,
				useMain: !!fs.useMain,
				scheme: fs.scheme || "https",
				url: fs.url || "",
				username: fs.username || "",
			},
		};
	},

	/**
	 * Store this computer's choice for a linked library in the group's synced
	 * settings (uploaded by Zotero's next sync). No-op if nothing changed or no
	 * choice has been made yet.
	 *
	 * @return {Promise<Boolean>} - Whether the marker was written
	 */
	async publish(libraryID) {
		const ZML = ZoteroMultipleLibraries;
		if (!ZML.Libraries.isLinkedLibrary(libraryID)) {
			return false;
		}
		let value = this.fromLocal(libraryID);
		if (!ZML.Storage.MODES.includes(value.fileSync.mode)) {
			return false;
		}
		let current = this.read(libraryID);
		if (current && JSON.stringify(this._normalize(current)) == JSON.stringify(this._normalize(value))) {
			return false;
		}
		await Zotero.SyncedSettings.set(libraryID, this.key(libraryID), value);
		ZML.Util.log(`published shared settings for library ${libraryID}`);
		return true;
	},

	async unpublish(libraryID) {
		let key = this.key(libraryID);
		if (key && Zotero.SyncedSettings.get(libraryID, key) !== null) {
			await Zotero.SyncedSettings.clear(libraryID, key);
			ZoteroMultipleLibraries.Util.log(`removed shared settings of library ${libraryID}`);
		}
	},

	/**
	 * Take the shared choice over into this computer's settings for a linked
	 * library
	 *
	 * @return {Promise<Boolean>} - Whether anything changed locally
	 */
	async apply(libraryID, shared) {
		const ZML = ZoteroMultipleLibraries;
		if (!shared || !shared.fileSync) {
			return false;
		}
		let incoming = this._normalize(shared);
		if (!ZML.Storage.MODES.includes(incoming.mode)) {
			return false;
		}
		let local = this._normalize({ fileSync: ZML.Settings.get(libraryID).fileSync });
		if (JSON.stringify(local) == JSON.stringify(incoming)) {
			return false;
		}
		let modeChanged = local.mode != incoming.mode;
		await ZML.Settings.update(libraryID, (c) => {
			c.fileSync.mode = incoming.mode;
			c.fileSync.useMain = incoming.useMain;
			c.fileSync.scheme = incoming.scheme;
			c.fileSync.url = incoming.url;
			c.fileSync.username = incoming.username;
			c.fileSync.verified = false;
		});
		ZML.Storage.resetController(libraryID);
		if (modeChanged && incoming.mode != "none") {
			try {
				await Zotero.Sync.Storage.Local.resetAllSyncStates(libraryID);
			}
			catch (e) {
				ZML.Util.error(e);
			}
		}
		ZML.Util.log(`applied shared settings to library ${libraryID} (${incoming.mode})`);
		// Verify the server here if we can (reused My Library server, or a
		// custom one whose password is already stored on this computer)
		ZML.Storage.verifyQuietly(libraryID).catch(e => ZML.Util.error(e));
		return true;
	},

	/**
	 * At startup: adopt group libraries that carry the marker (unless they were
	 * deliberately shown under Group Libraries on this computer), apply the
	 * shared choice to linked libraries, and publish for linked libraries that
	 * have none yet.
	 */
	async scanAll() {
		const ZML = ZoteroMultipleLibraries;
		for (let library of Zotero.Libraries.getAll()) {
			if (library.libraryType != "group" || ZML.Libraries.isLocalLibrary(library)) {
				continue;
			}
			try {
				let libraryID = library.libraryID;
				let shared = this.read(libraryID);
				if (ZML.Libraries.isLinkedLibrary(library)) {
					if (shared) {
						await this.apply(libraryID, shared);
					}
					else {
						await this.publish(libraryID);
					}
				}
				else if (shared && !ZML.Settings.get(libraryID).released) {
					ZML.Util.log(`group ${library.groupID} is an extra library elsewhere -- adopting`);
					await ZML.Libraries.adoptGroup(library);
				}
			}
			catch (e) {
				ZML.Util.error(e);
			}
		}
	},

	_observer: {
		notify(action, type, ids, _extraData) {
			if (type != "setting") {
				return;
			}
			const Shared = ZoteroMultipleLibraries.Shared;
			for (let id of ids) {
				let [libraryID, key] = String(id).split("/");
				if (!Shared.isKey(key)) {
					continue;
				}
				Shared._onSettingChanged(parseInt(libraryID), action)
					.catch(e => ZoteroMultipleLibraries.Util.error(e));
			}
		},
	},

	async _onSettingChanged(libraryID, action) {
		const ZML = ZoteroMultipleLibraries;
		if (action == "delete") {
			// Removed on another computer: that computer stopped managing the
			// library; this one keeps its own state
			return;
		}
		let library = Zotero.Libraries.get(libraryID);
		if (!library || library.libraryType != "group" || ZML.Libraries.isLocalLibrary(library)) {
			return;
		}
		let shared = this.read(libraryID);
		if (!shared) {
			return;
		}
		if (ZML.Libraries.isLinkedLibrary(library)) {
			await this.apply(libraryID, shared);
		}
		else if (!ZML.Settings.get(libraryID).released) {
			ZML.Util.log(`group ${library.groupID} became an extra library elsewhere -- adopting`);
			await ZML.Libraries.adoptGroup(library);
		}
	},
};
