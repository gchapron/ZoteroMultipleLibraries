/* global Zotero, ZoteroMultipleLibraries */
/*
 * Library model.
 *
 * An extra ("local") library is a Zotero group library whose groupID lies in a
 * reserved range that zotero.org will never hand out. It is created, renamed and
 * deleted through Zotero's own Zotero.Group class, so every core code path
 * (caches, notifier, data loading, cascading deletes) behaves exactly as for a
 * real group. See docs/DESIGN.md.
 */

ZoteroMultipleLibraries.Libraries = {
	// zotero.org group IDs are in the low millions; this range is ours.
	GROUP_ID_BASE: 1000000000,
	GROUP_ID_MAX: 2000000000, // exclusive

	SKIP_PREF: "sync.librariesToSkip", // Zotero's own pref (extensions.zotero. branch)

	isLocalGroupID(groupID) {
		groupID = parseInt(groupID);
		return Number.isInteger(groupID)
			&& groupID >= this.GROUP_ID_BASE
			&& groupID < this.GROUP_ID_MAX;
	},

	/**
	 * @param {Zotero.Library|Integer} libraryOrID - Library object or libraryID
	 * @return {Boolean}
	 */
	isLocalLibrary(libraryOrID) {
		let library = libraryOrID;
		if (typeof libraryOrID != "object") {
			library = Zotero.Libraries.get(libraryOrID);
		}
		if (!library || library.libraryType != "group") {
			return false;
		}
		try {
			return this.isLocalGroupID(library.groupID);
		}
		catch (e) {
			return false;
		}
	},

	/**
	 * All local libraries, sorted by name
	 *
	 * Uses Zotero.Libraries (not Zotero.Groups.getAll(), which the plugin filters).
	 *
	 * @return {Zotero.Group[]}
	 */
	getAll() {
		let libraries = Zotero.Libraries.getAll().filter(l => this.isLocalLibrary(l));
		let collation = Zotero.getLocaleCollation();
		libraries.sort((a, b) => collation.compareString(1, a.name, b.name));
		return libraries;
	},

	/**
	 * Case-insensitive lookup among all libraries (My Library, groups, feeds, local)
	 */
	nameExists(name, exceptLibraryID) {
		let lower = name.trim().toLowerCase();
		return Zotero.Libraries.getAll().some(
			l => l.libraryID != exceptLibraryID && l.name.trim().toLowerCase() == lower
		);
	},

	_validateName(name, exceptLibraryID) {
		name = (name || "").trim();
		if (!name) {
			let e = new Error("Library name cannot be empty");
			e.code = "empty";
			throw e;
		}
		if (this.nameExists(name, exceptLibraryID)) {
			let e = new Error(`A library named "${name}" already exists`);
			e.code = "exists";
			throw e;
		}
		return name;
	},

	_nextGroupID() {
		let max = this.GROUP_ID_BASE - 1;
		for (let library of this.getAll()) {
			max = Math.max(max, library.groupID);
		}
		let id = max + 1;
		while (Zotero.Groups.exists(id)) {
			id++;
		}
		if (!this.isLocalGroupID(id)) {
			throw new Error("Local group ID range exhausted");
		}
		return id;
	},

	/**
	 * Create a new local library
	 *
	 * @param {String} name
	 * @return {Promise<Zotero.Group>}
	 */
	async create(name) {
		name = this._validateName(name);
		let groupID = this._nextGroupID();
		let group = new Zotero.Group({
			groupID,
			name,
			description: "",
			version: 0,
			editable: true,
			filesEditable: true,
		});
		// Inserts into `libraries` and `groups`, registers the caches, loads data,
		// and fires the 'add' 'group' notifier event (which refreshes the tree)
		await group.saveTx();
		this.ensureSkipped(groupID);
		ZoteroMultipleLibraries.Util.log(
			`created local library "${name}" (libraryID ${group.libraryID}, groupID ${groupID})`
		);
		return group;
	},

	/**
	 * @param {Zotero.Group} library
	 * @param {String} newName
	 */
	async rename(library, newName) {
		if (!this.isLocalLibrary(library)) {
			throw new Error("Not a local library");
		}
		newName = this._validateName(newName, library.libraryID);
		if (newName == library.name) {
			return;
		}
		library.name = newName;
		await library.saveTx();
	},

	/**
	 * Permanently delete a local library with everything in it
	 *
	 * @param {Zotero.Group} library
	 */
	async erase(library) {
		if (!this.isLocalLibrary(library)) {
			throw new Error("Not a local library");
		}
		let groupID = library.groupID;
		let name = library.name;
		// Deletes attachment files, the library row (cascading to groups, items,
		// collections, searches, settings…) and fires 'delete' 'group'
		await library.eraseTx();
		this.unskip(groupID);
		ZoteroMultipleLibraries.Util.log(`deleted local library "${name}" (groupID ${groupID})`);
	},

	/**
	 * Number of items (including notes, attachments, trashed items) in a library
	 */
	countItems(libraryID) {
		return Zotero.DB.valueQueryAsync("SELECT COUNT(*) FROM items WHERE libraryID=?", libraryID);
	},

	//
	// Zotero's "libraries to skip" sync preference. Zotero core honours it even
	// when this plugin is not running, so local libraries are never synced nor
	// reported as "groups you are no longer a member of".
	//
	_getSkipList() {
		try {
			let list = JSON.parse(Zotero.Prefs.get(this.SKIP_PREF) || "[]");
			return Array.isArray(list) ? list : [];
		}
		catch (e) {
			return [];
		}
	},

	_setSkipList(list) {
		Zotero.Prefs.set(this.SKIP_PREF, JSON.stringify(list));
	},

	ensureSkipped(groupID) {
		let key = "G" + groupID;
		let list = this._getSkipList();
		if (!list.includes(key)) {
			list.push(key);
			this._setSkipList(list);
		}
	},

	unskip(groupID) {
		let key = "G" + groupID;
		let list = this._getSkipList();
		if (list.includes(key)) {
			this._setSkipList(list.filter(x => x != key));
		}
	},

	ensureAllSkipped() {
		for (let library of this.getAll()) {
			this.ensureSkipped(library.groupID);
		}
	},
};
