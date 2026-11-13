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
		let existing = Zotero.Groups.get(groupID);
		if (existing) {
			if (this.isManagedLibrary(existing)) {
				let e = new Error(`Group ${groupID} is already an extra library`);
				e.code = "group-managed";
				throw e;
			}
			if (await this.hasContent(existing.libraryID)) {
				let e = new Error(`Group ${groupID} ("${existing.name}") already exists on this computer and is not empty`);
				e.code = "group-not-empty";
				e.groupName = existing.name;
				throw e;
			}
			// Zotero's sync already downloaded the (still empty) group, which is the
			// normal case right after creating it on zotero.org: replace that empty
			// local copy with this library. The next sync re-downloads the group's
			// metadata and uploads the library's content.
			ZML.Util.log(`replacing empty group library ${existing.libraryID} (group ${groupID}) with library ${library.libraryID}`);
			await existing.eraseTx();
		}

		let libraryID = library.libraryID;
		let oldGroupID = library.groupID;
		// Where its files go: what the user chose beforehand or, without a
		// choice, My Library's WebDAV server if it has one, else Zotero storage
		let planned = ZML.Storage.getPlannedFileSync(libraryID);

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
			c.pendingLink = null;
			let fs = c.fileSync;
			if (fs.mode != planned.mode || !!fs.useMain != !!planned.useMain) {
				fs.mode = planned.mode;
				fs.useMain = planned.useMain;
				fs.verified = false;
			}
		});
		// Let Zotero sync it (the user can opt out again in the settings pane)
		this.unskip(oldGroupID);
		this.unskip(groupID);
		// Tell other computers that this group is an extra library, with the
		// file syncing choice
		await ZML.Shared.publish(libraryID);
		this._needsChoice.delete(libraryID);
		// Zotero skips an unchecked WebDAV server, and checking it makes the
		// library's folder: do it now rather than at the next start
		if (ZML.Settings.get(libraryID).fileSync.mode == "webdav") {
			ZML.Storage.verifyQuietly(libraryID).catch(e => ZML.Util.error(e));
		}

		ZML.Util.log(`linked library ${libraryID} to zotero.org group ${groupID} (was ${oldGroupID})`);
		await ZML.Tree.reloadAll();
		for (let fn of this._linkListeners) {
			try {
				fn(library);
			}
			catch (e) {
				ZML.Util.error(e);
			}
		}
	},

	//
	// One-tick syncing: the user asks to sync a local library, makes a private
	// group on zotero.org, and the group Zotero downloads next is linked here
	//

	/**
	 * Wait for a new group for this local library. Empty groups already on this
	 * computer are remembered so that they are never taken for the new one.
	 *
	 * @param {Zotero.Group} library
	 */
	async requestLink(library) {
		const ZML = ZoteroMultipleLibraries;
		if (!this.isLocalLibrary(library)) {
			let e = new Error("Only a local library can be linked to a group");
			e.code = "not-local";
			throw e;
		}
		let known = (await this.getLinkableGroups()).map(g => g.groupID);
		await ZML.Settings.update(library.libraryID, (c) => {
			c.pendingLink = { since: Date.now(), knownGroupIDs: known };
		});
		this._needsChoice.delete(library.libraryID);
		ZML.Util.log(`library ${library.libraryID} waits for a new group (${known.length} empty groups already here)`);
	},

	async cancelLink(library) {
		const ZML = ZoteroMultipleLibraries;
		if (library && ZML.Settings.has(library.libraryID)) {
			await ZML.Settings.update(library.libraryID, (c) => {
				c.pendingLink = null;
			});
		}
		if (library) {
			this._needsChoice.delete(library.libraryID);
		}
	},

	isLinkPending(library) {
		const Settings = ZoteroMultipleLibraries.Settings;
		return !!library && this.isLocalLibrary(library) && Settings.has(library.libraryID)
			&& !!Settings.get(library.libraryID).pendingLink;
	},

	/**
	 * New, empty, editable groups that arrived since libraries started waiting
	 * (empty groups already here at that time are never candidates)
	 *
	 * @return {Promise<Zotero.Group[]>}
	 */
	async getPendingCandidates() {
		const Settings = ZoteroMultipleLibraries.Settings;
		let known = new Set();
		for (let library of this.getAll().filter(l => this.isLinkPending(l))) {
			for (let id of Settings.get(library.libraryID).pendingLink.knownGroupIDs || []) {
				known.add(id);
			}
		}
		return (await this.getLinkableGroups())
			.filter(g => !known.has(g.groupID) && g.editable && g.filesEditable);
	},

	_linkListeners: new Set(),

	/**
	 * Called with (library) after any library is linked, e.g. by itself in
	 * the background, so that an open settings pane can show it
	 */
	addLinkListener(fn) {
		this._linkListeners.add(fn);
	},

	removeLinkListener(fn) {
		this._linkListeners.delete(fn);
	},

	// Libraries for which linking by itself gave up: the user chooses
	_needsChoice: new Set(),

	/**
	 * Where a waiting library stands, for the settings pane:
	 * "waiting" (no new group yet), "choose" (not linked by itself; the user
	 * picks the group), or "existing" (nothing new, but an empty group that was
	 * already here may be the one, e.g. made before ticking)
	 *
	 * @return {Promise<String|null>} - null if the library is not waiting
	 */
	async getPendingState(library) {
		if (!this.isLinkPending(library)) {
			return null;
		}
		if (this._needsChoice.has(library.libraryID)) {
			return "choose";
		}
		let pendingCount = this.getAll().filter(l => this.isLinkPending(l)).length;
		let candidates = await this.getPendingCandidates();
		if (candidates.length && (pendingCount != 1 || candidates.length != 1)) {
			return "choose";
		}
		if (!candidates.length && (await this.getLinkableGroups()).length) {
			return "existing";
		}
		return "waiting";
	},

	/**
	 * Group details from zotero.org ({data: {owner, type}, meta: {numItems,
	 * created}}), or null; on its own so that tests can stand in for the server
	 */
	async _fetchGroupInfo(groupID) {
		let apiKey = await Zotero.Sync.Data.Local.getAPIKey();
		if (!apiKey) {
			return null;
		}
		return (await Zotero.Sync.Runner.getAPIClient({ apiKey }).getGroup(groupID)) || null;
	},

	/**
	 * Whether a new group is surely the one the user made for a waiting
	 * library: a private group they own, with nothing in it, created after
	 * (or just before) they ticked Sync, and not a library of theirs elsewhere
	 */
	async isOwnNewGroup(group, since) {
		const ZML = ZoteroMultipleLibraries;
		if (ZML.Shared.read(group.libraryID)) {
			return false;
		}
		let info;
		try {
			info = await this._fetchGroupInfo(group.groupID);
		}
		catch (e) {
			ZML.Util.log(`could not ask zotero.org about group ${group.groupID}: ${e}`);
			return false;
		}
		if (!info) {
			return false;
		}
		let data = info.data || {};
		let meta = info.meta || {};
		let userID = Zotero.Users.getCurrentUserID();
		if (!userID || data.owner != userID || data.type != "Private") {
			return false;
		}
		if (meta.numItems !== undefined && meta.numItems != 0) {
			return false;
		}
		// Ten minutes' grace for clocks that disagree
		if (meta.created && since && Date.parse(meta.created) < since - 10 * 60 * 1000) {
			return false;
		}
		return true;
	},

	_resolving: null,

	/**
	 * Link a pending library to its new group, but only when there is no
	 * doubt: exactly one library waiting, exactly one new, empty group that the
	 * user can edit, and zotero.org confirms it is their own new private group.
	 * Otherwise nothing is linked and the settings pane asks. Calls while one
	 * is running share it.
	 *
	 * @return {Promise<{linked: Object[], ambiguous: Boolean, candidates: Integer[]}>}
	 */
	resolvePendingLinks() {
		if (!this._resolving) {
			this._resolving = this._resolvePendingLinks().finally(() => {
				this._resolving = null;
			});
		}
		return this._resolving;
	},

	async _resolvePendingLinks() {
		const ZML = ZoteroMultipleLibraries;
		let result = { linked: [], ambiguous: false, candidates: [] };
		let pending = this.getAll().filter(l => this.isLinkPending(l));
		if (!pending.length) {
			return result;
		}
		let candidates = await this.getPendingCandidates();
		result.candidates = candidates.map(g => g.groupID);
		if (!candidates.length) {
			return result;
		}
		let giveUp = (why) => {
			result.ambiguous = true;
			for (let library of pending) {
				this._needsChoice.add(library.libraryID);
			}
			ZML.Util.log(`not linking by itself: ${why}`);
			return result;
		};
		if (pending.length != 1 || candidates.length != 1) {
			return giveUp(`${pending.length} libraries waiting, ${candidates.length} new groups`);
		}
		let library = pending[0];
		let group = candidates[0];
		// Linking erases this (empty) group object: keep its ID
		let groupID = group.groupID;
		let since = ZML.Settings.get(library.libraryID).pendingLink.since;
		if (!(await this.isOwnNewGroup(group, since))) {
			return giveUp(`group ${groupID} is not surely the user's new private group`);
		}
		// Things may have moved on while zotero.org was asked
		if (!this.isLinkPending(library) || !Zotero.Groups.get(groupID)) {
			return result;
		}
		if (Zotero.Sync.Runner.syncInProgress) {
			this.scheduleResolve();
			return result;
		}
		ZML.Util.log(`linking library ${library.libraryID} to its new group ${groupID}`);
		await this.linkToGroup(library, groupID);
		result.linked.push({ libraryID: library.libraryID, groupID });
		return result;
	},

	_resolveTimer: null,
	// Set by tests that call resolvePendingLinks() themselves
	_autoResolveDisabled: false,

	/**
	 * Run resolvePendingLinks() shortly, once no sync is running: linking
	 * rewrites the group's ID, which must not happen while sync works on it
	 */
	scheduleResolve(delay = 1000) {
		if (this._autoResolveDisabled) {
			return;
		}
		if (this._resolveTimer) {
			clearTimeout(this._resolveTimer);
		}
		this._resolveTimer = setTimeout(() => {
			this._resolveTimer = null;
			if (this._autoResolveDisabled) {
				return;
			}
			if (Zotero.Sync.Runner.syncInProgress) {
				this.scheduleResolve(delay);
				return;
			}
			this.resolvePendingLinks().catch(e => ZoteroMultipleLibraries.Util.error(e));
		}, delay);
	},

	cancelScheduledResolve() {
		if (this._resolveTimer) {
			clearTimeout(this._resolveTimer);
			this._resolveTimer = null;
		}
	},

	/**
	 * Real group libraries on this computer that are not managed, whatever their
	 * content: a group linked to an extra library on another computer shows up
	 * here as an ordinary group library until it is adopted
	 *
	 * @return {Zotero.Group[]}
	 */
	getAdoptableGroups() {
		return this._sorted(Zotero.Libraries.getAll().filter(
			l => l.libraryType == "group" && !this.isManagedLibrary(l)
		));
	},

	/**
	 * Show an existing group library as an extra (top-level) library and allow
	 * per-library file syncing for it. This is the second-computer counterpart
	 * of linkToGroup(): the group already holds the content.
	 *
	 * @param {Zotero.Group} library
	 */
	async adoptGroup(library) {
		const ZML = ZoteroMultipleLibraries;
		if (!library || library.libraryType != "group" || this.isLocalLibrary(library)) {
			let e = new Error("Not a group library");
			e.code = "not-group";
			throw e;
		}
		if (this.isManagedLibrary(library)) {
			let e = new Error("Already an extra library");
			e.code = "group-managed";
			throw e;
		}
		let libraryID = library.libraryID;
		let shared = ZML.Shared.read(libraryID);
		await ZML.Settings.update(libraryID, (c) => {
			c.linked = true;
			c.released = false;
			// Without a choice shared from another computer, no file syncing until
			// the user chooses deliberately (it must match the other computers)
			if (!shared) {
				c.fileSync.mode = "unset";
			}
		});
		// Files Zotero could not fetch from Zotero storage were marked in sync
		// without a file; start the file sync history afresh so they are fetched
		// once file syncing (e.g., WebDAV) is set up for this library
		try {
			await Zotero.Sync.Storage.Local.resetAllSyncStates(libraryID);
		}
		catch (e) {
			ZML.Util.error(e);
		}
		if (shared) {
			await ZML.Shared.apply(libraryID, shared);
		}
		ZML.Util.log(`adopted group library ${libraryID} (group ${library.groupID})`
			+ (shared ? " with shared settings" : ""));
		await ZML.Tree.reloadAll();
	},

	/**
	 * Stop managing a linked library: it becomes an ordinary group library again
	 * (its per-library file sync settings and password are dropped)
	 *
	 * @param {Zotero.Group} library
	 */
	async releaseGroup(library) {
		const ZML = ZoteroMultipleLibraries;
		if (!this.isLinkedLibrary(library)) {
			let e = new Error("Not a linked library");
			e.code = "not-linked";
			throw e;
		}
		let libraryID = library.libraryID;
		let wasWebDAV = ZML.Settings.get(libraryID).fileSync.mode == "webdav";
		await ZML.Shared.unpublish(libraryID);
		// Keep a tombstone so the shared marker does not adopt it again here
		await ZML.Settings.set(libraryID, { released: true });
		await ZML.Storage.removePassword(libraryID);
		ZML.Storage.resetController(libraryID);
		if (wasWebDAV) {
			// Files now follow Zotero's rule for group libraries (Zotero storage).
			// As Zotero does when My Library switches storage modes, start the file
			// sync history afresh: files on this computer get uploaded there (if
			// group file syncing is on), missing ones fetched from there. Files that
			// exist only on the WebDAV server are not transferred.
			try {
				await Zotero.Sync.Storage.Local.resetAllSyncStates(libraryID);
			}
			catch (e) {
				ZML.Util.error(e);
			}
		}
		ZML.Util.log(`released group library ${libraryID} (group ${library.groupID})`);
		await ZML.Tree.reloadAll();
	},

	/**
	 * Whether a library holds any items (including trashed), collections or searches
	 */
	async hasContent(libraryID) {
		for (let table of ["items", "collections", "savedSearches"]) {
			let count = await Zotero.DB.valueQueryAsync(
				`SELECT COUNT(*) FROM ${table} WHERE libraryID=?`, libraryID
			);
			if (count) {
				return true;
			}
		}
		return false;
	},

	/**
	 * Real group libraries on this computer that are empty and not managed:
	 * typically groups just created on zotero.org and downloaded by sync,
	 * i.e. candidates for linking
	 *
	 * @return {Promise<Zotero.Group[]>}
	 */
	async getLinkableGroups() {
		let groups = Zotero.Libraries.getAll().filter(
			l => l.libraryType == "group" && !this.isManagedLibrary(l)
		);
		let result = [];
		for (let group of groups) {
			if (!(await this.hasContent(group.libraryID))) {
				result.push(group);
			}
		}
		return this._sorted(result);
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
