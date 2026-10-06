/* global Zotero, ZoteroMultipleLibraries */
/*
 * Per-library configuration, stored in Zotero's own `settings` table (the table
 * Zotero uses for values that must live with the database rather than the
 * profile). One row per library: setting = 'multipleLibraries', key = 'L<libraryID>',
 * value = JSON. Passwords never go here (see storage.js: login manager).
 */

ZoteroMultipleLibraries.Settings = {
	SETTING: "multipleLibraries",

	_cache: new Map(), // libraryID -> config
	loaded: false,

	defaults() {
		return {
			// True once the library has been linked to a real zotero.org group
			linked: false,
			fileSync: {
				mode: "none", // none | zotero | webdav
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
		}
		return config;
	},

	async load() {
		this._cache.clear();
		let rows = await Zotero.DB.queryAsync(
			"SELECT key, value FROM settings WHERE setting=?", this.SETTING
		);
		for (let row of rows) {
			let matches = /^L(\d+)$/.exec(row.key);
			if (!matches) {
				continue;
			}
			try {
				this._cache.set(parseInt(matches[1]), this._merge(JSON.parse(row.value)));
			}
			catch (e) {
				ZoteroMultipleLibraries.Util.error(e);
			}
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
