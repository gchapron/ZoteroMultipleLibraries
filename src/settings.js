/* global Zotero, ZoteroMultipleLibraries */
/*
 * Per-library configuration, stored in Zotero's own `settings` table (the table
 * Zotero uses for values that must live with the database rather than the
 * profile). One row per library: setting = 'multipleLibraries', key = 'L<libraryID>',
 * value = JSON. Passwords never go here (see storage.js: login manager).
 */

ZoteroMultipleLibraries.Settings = {
	SETTING: "multipleLibraries",
	// Bumped when the meaning of stored values changes (see _merge())
	SCHEMA_VERSION: 2,

	_cache: new Map(), // libraryID -> config
	loaded: false,

	defaults() {
		return {
			version: this.SCHEMA_VERSION,
			// True once the library has been linked to a real zotero.org group
			linked: false,
			fileSync: {
				// zotero: Zotero's normal behaviour for group libraries (Zotero storage,
				//   following the Sync preference for group files) — the default
				// webdav: this library's own WebDAV server
				// none: never sync this library's files
				mode: "zotero",
				// webdav: reuse My Library's WebDAV server and account (in a
				// subfolder of its own) instead of the custom server below
				useMain: false,
				scheme: "https",
				url: "",
				username: "",
				verified: false,
			},
		};
	},

	_merge(partial) {
		let config = this.defaults();
		if (partial && typeof partial == "object") {
			for (let key of Object.keys(partial)) {
				if (key == "fileSync" && partial.fileSync && typeof partial.fileSync == "object") {
					Object.assign(config.fileSync, partial.fileSync);
				}
				else {
					config[key] = partial[key];
				}
			}
			// Rows written by 0.1.1/0.1.2 (no version) defaulted to "none" without
			// the user choosing, which blocked all file downloads for the library;
			// Zotero's normal group behaviour is the intended default
			if (partial.version === undefined && config.fileSync.mode == "none") {
				config.fileSync.mode = "zotero";
			}
		}
		config.version = this.SCHEMA_VERSION;
		return config;
	},

	async load() {
		this._cache.clear();
		let rows = await Zotero.DB.queryAsync(
			"SELECT key, value FROM settings WHERE setting=?", this.SETTING
		);
		let migrated = [];
		for (let row of rows) {
			let matches = /^L(\d+)$/.exec(row.key);
			if (!matches) {
				continue;
			}
			try {
				let libraryID = parseInt(matches[1]);
				let stored = JSON.parse(row.value);
				this._cache.set(libraryID, this._merge(stored));
				if (!stored || stored.version !== this.SCHEMA_VERSION) {
					migrated.push(libraryID);
				}
			}
			catch (e) {
				ZoteroMultipleLibraries.Util.error(e);
			}
		}
		for (let libraryID of migrated) {
			await this.set(libraryID, this._cache.get(libraryID));
		}
		this.loaded = true;
	},

	has(libraryID) {
		return this._cache.has(libraryID);
	},

	/**
	 * Current config (the cached object itself; use update() to change it)
	 */
	get(libraryID) {
		return this._cache.get(libraryID) || this.defaults();
	},

	async set(libraryID, config) {
		config = this._merge(config);
		this._cache.set(libraryID, config);
		await Zotero.DB.queryAsync(
			"REPLACE INTO settings (setting, key, value) VALUES (?, ?, ?)",
			[this.SETTING, "L" + libraryID, JSON.stringify(config)]
		);
		return config;
	},

	/**
	 * @param {Integer} libraryID
	 * @param {Function} fn - Receives a copy of the config to modify in place
	 */
	async update(libraryID, fn) {
		let config = this._merge(this.get(libraryID));
		fn(config);
		return this.set(libraryID, config);
	},

	/**
	 * Synchronous variant for callers that cannot await (e.g., property setters):
	 * the cache is updated immediately and the write happens in the background
	 */
	updateSync(libraryID, fn) {
		let config = this._merge(this.get(libraryID));
		fn(config);
		this._cache.set(libraryID, config);
		Zotero.DB.queryAsync(
			"REPLACE INTO settings (setting, key, value) VALUES (?, ?, ?)",
			[this.SETTING, "L" + libraryID, JSON.stringify(config)]
		).catch(e => ZoteroMultipleLibraries.Util.error(e));
		return config;
	},

	async remove(libraryID) {
		this._cache.delete(libraryID);
		await Zotero.DB.queryAsync(
			"DELETE FROM settings WHERE setting=? AND key=?", [this.SETTING, "L" + libraryID]
		);
	},
};
