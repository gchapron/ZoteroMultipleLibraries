/* global Zotero, ZoteroMultipleLibraries */
/*
 * Library model.
 *
 * Two kinds of extra libraries, both group libraries in Zotero's database:
 *
 * - local: groupID in a reserved range that zotero.org never hands out; never
 *   synced. Created, renamed and deleted through Zotero's own Zotero.Group
 *   class, so every core code path (caches, notifier, data loading, cascading
 *   deletes) behaves exactly as for a real group.
 * - linked: a real zotero.org group (the account's only way to hold a second
 *   library) that the plugin keeps presenting as a top-level library and whose
 *   files can sync to a WebDAV server of its own. A local library becomes a
 *   linked one through linkToGroup().
 *
 * "Managed" means either. See docs/DESIGN.md.
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

	_asLibrary(libraryOrID) {
		if (typeof libraryOrID == "object") {
			return libraryOrID;
		}
		return Zotero.Libraries.get(libraryOrID);
	},

	/**
	 * A never-synced extra library (synthetic group ID)
	 *
	 * @param {Zotero.Library|Integer} libraryOrID - Library object or libraryID
	 * @return {Boolean}
	 */
	isLocalLibrary(libraryOrID) {
		let library = this._asLibrary(libraryOrID);
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
	 * A real zotero.org group that the plugin manages as a top-level library
	 */
	isLinkedLibrary(libraryOrID) {
		let library = this._asLibrary(libraryOrID);
		if (!library || library.libraryType != "group" || this.isLocalLibrary(library)) {
			return false;
		}
		const Settings = ZoteroMultipleLibraries.Settings;
		return Settings.has(library.libraryID) && !!Settings.get(library.libraryID).linked;
	},

	isManagedLibrary(libraryOrID) {
		return this.isLocalLibrary(libraryOrID) || this.isLinkedLibrary(libraryOrID);
	},

	_sorted(libraries) {
		let collation = Zotero.getLocaleCollation();
		libraries.sort((a, b) => collation.compareString(1, a.name, b.name));
		return libraries;
	},

	/**
	 * All managed (local and linked) libraries, sorted by name
	 *
	 * Uses Zotero.Libraries, not Zotero.Groups.getAll(), which the plugin filters
	 * while the collection tree refreshes.
	 *
	 * @return {Zotero.Group[]}
	 */
	getAll() {
		return this._sorted(Zotero.Libraries.getAll().filter(l => this.isManagedLibrary(l)));
	},

	/**
	 * Local (never-synced) libraries only
	 */
	getLocal() {
		return this._sorted(Zotero.Libraries.getAll().filter(l => this.isLocalLibrary(l)));
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
		for (let library of this.getLocal()) {
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
		if (!this.isManagedLibrary(library)) {
			throw new Error("Not a managed library");
		}
		newName = this._validateName(newName, library.libraryID);
		if (newName == library.name) {
			return;
		}
		library.name = newName;
		await library.saveTx();
	},

	/**
	 * Permanently delete a library from this computer with everything in it.
	 * (For a linked library the zotero.org group itself is not touched.)
	 *
	 * @param {Zotero.Group} library
	 */
	async erase(library) {
		if (!this.isManagedLibrary(library)) {
			throw new Error("Not a managed library");
		}
		const ZML = ZoteroMultipleLibraries;
		let libraryID = library.libraryID;
		let groupID = library.groupID;
		let name = library.name;
		// Deletes attachment files, the library row (cascading to groups, items,
		// collections, searches, settings…) and fires 'delete' 'group'
		await library.eraseTx();
		this.unskip(groupID);
		await ZML.Settings.remove(libraryID);
		await ZML.Storage.removePassword(libraryID);
		ZML.Storage.resetController(libraryID);
		ZML.Util.log(`deleted library "${name}" (libraryID ${libraryID}, groupID ${groupID})`);
	},

	/**
	 * Number of items (including notes, attachments, trashed items) in a library
	 */
	countItems(libraryID) {
		return Zotero.DB.valueQueryAsync("SELECT COUNT(*) FROM items WHERE libraryID=?", libraryID);
	},

	/**
	 * Turn a local library into a linked one: give it the ID of a real
	 * zotero.org group so that Zotero's own sync uploads its content there.
	 *
	 * The group must exist on zotero.org and the account must be a member
	 * (typically a private group the user just created). Nothing is contacted
	 * here; Zotero's next sync does the work, and takes the group's name and
	 * permissions from the server.
	 *
	 * @param {Zotero.Group} library
	 * @param {Integer} groupID
	 */
	async linkToGroup(library, groupID) {
		const ZML = ZoteroMultipleLibraries;
		if (!this.isLocalLibrary(library)) {
			let e = new Error("Only a local library can be linked to a group");
			e.code = "not-local";
			throw e;
		}
		groupID = parseInt(groupID);
		if (!Number.isInteger(groupID) || groupID <= 0 || this.isLocalGroupID(groupID)) {
			let e = new Error("Invalid group ID");
			e.code = "invalid-group";
			throw e;
		}
		if (Zotero.Groups.exists(groupID)) {
			let e = new Error(`Group ${groupID} already exists on this computer`);
			e.code = "group-exists";
			throw e;
		}

		let libraryID = library.libraryID;
		let oldGroupID = library.groupID;

		await Zotero.DB.executeTransaction(async () => {
			await Zotero.DB.queryAsync(
				"UPDATE groups SET groupID=? WHERE libraryID=?", [groupID, libraryID]
			);
			await this._rewriteGroupURIs(oldGroupID, groupID);
		});

		// In-memory state
		Zotero.Groups.unregister(oldGroupID);
		library._groupID = groupID;
		Zotero.Groups.register(library);

		await ZML.Settings.update(libraryID, (c) => {
			c.linked = true;
		});
		// Let Zotero sync it (the user can opt out again in the settings pane)
		this.unskip(oldGroupID);
		this.unskip(groupID);

		ZML.Util.log(`linked library ${libraryID} to zotero.org group ${groupID} (was ${oldGroupID})`);
		await ZML.Tree.reloadAll();
	},

	/**
	 * Rewrite relation URIs (owl:sameAs links created by drag and drop, related
	 * items, …) after a group ID change. Modelled on Zotero.Relations.updateUser().
	 */
	async _rewriteGroupURIs(fromGroupID, toGroupID) {
		Zotero.DB.requireTransaction();
		let fromPrefix = "http://zotero.org/groups/" + fromGroupID + "/";
		let toPrefix = "http://zotero.org/groups/" + toGroupID + "/";

		for (let type of ["item", "collection"]) {
			let objects = await Zotero.DB.columnQueryAsync(
				`SELECT DISTINCT object FROM ${type}Relations WHERE object LIKE ?`,
				fromPrefix + "%"
			);
			if (!objects.length) {
				continue;
			}
			await Zotero.DB.queryAsync(
				`UPDATE ${type}Relations SET object=REPLACE(object, ?, ?) WHERE object LIKE ?`,
				[fromPrefix, toPrefix, fromPrefix + "%"]
			);
			Zotero.DB.addCurrentCallback("commit", async () => {
				for (let object of objects) {
					let subPrefs = await Zotero.Relations.getByObject(type, object);
					let newObject = object.replace(fromPrefix, toPrefix);
					for (let subPref of subPrefs) {
						Zotero.Relations.unregister(type, subPref.subject.id, subPref.predicate, object);
						Zotero.Relations.register(type, subPref.subject.id, subPref.predicate, newObject);
					}
				}
				let objectsClass = Zotero.DataObjectUtilities.getObjectsClassForObjectType(type);
				for (let object of objectsClass.getLoaded()) {
					await object.reload(["relations"], true);
				}
			});
		}
	},

	//
	// Zotero's "libraries to skip" sync preference. Zotero core honours it even
	// when this plugin is not running, so local libraries are never synced nor
	// reported as "groups you are no longer a member of". For linked libraries
	// it is the per-library "sync this library" switch.
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

	isSkipped(groupID) {
		return this._getSkipList().includes("G" + groupID);
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
		for (let library of this.getLocal()) {
			this.ensureSkipped(library.groupID);
		}
	},

	/**
	 * Whether Zotero syncs a linked library's data (local libraries: always false)
	 */
	isSyncEnabled(library) {
		return this.isLinkedLibrary(library) && !this.isSkipped(library.groupID);
	},

	setSyncEnabled(library, enabled) {
		if (!this.isLinkedLibrary(library)) {
			throw new Error("Not a linked library");
		}
		if (enabled) {
			this.unskip(library.groupID);
		}
		else {
			this.ensureSkipped(library.groupID);
		}
	},
};
