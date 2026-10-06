/* global Zotero, ZoteroMultipleLibraries */
/*
 * Patches to Zotero core (window-independent) that keep managed libraries out
 * of the "Group Libraries" section and local libraries out of sync.
 */

ZoteroMultipleLibraries.Core = {
	_notifierID: null,
	// > 0 while Zotero.Groups.getAll() must leave managed libraries out
	_hideManagedGroups: 0,

	/**
	 * Run fn() with managed libraries hidden from Zotero.Groups.getAll()
	 *
	 * Used around a patched collection tree refresh (the tree inserts them
	 * itself) and around the sync runner's library check. Everywhere else, e.g.
	 * an unpatched collection tree in a dialog or the local API, they stay
	 * visible as group libraries.
	 */
	async withManagedGroupsHidden(fn) {
		this._hideManagedGroups++;
		try {
			return await fn();
		}
		finally {
			this._hideManagedGroups--;
		}
	},

	init() {
		const ZML = ZoteroMultipleLibraries;
		const Patches = ZML.Util.Patches;

		Patches.wrap(Zotero.Groups, "getAll", original => function () {
			let groups = original.call(this);
			if (ZML.Core._hideManagedGroups > 0) {
				groups = groups.filter(group => !ZML.Libraries.isManagedLibrary(group));
			}
			return groups;
		});

		// Never let a local (unsynced) library reach the sync engine, whether the
		// whole account or specific libraries are being synced. Linked libraries
		// are real groups and sync normally. Hiding managed groups during the
		// check keeps the original from reporting local libraries as groups the
		// user "is no longer a member of".
		if (Zotero.Sync && Zotero.Sync.Runner) {
			Patches.wrap(Zotero.Sync.Runner, "checkLibraries", original => async function (client, options, keyInfo, libraries = []) {
				if (libraries && libraries.length) {
					libraries = libraries.filter(id => !ZML.Libraries.isLocalLibrary(id));
					if (!libraries.length) {
						// Only local libraries were requested: nothing to sync (an empty
						// list would mean "all libraries" to the original)
						return [];
					}
				}
				let result = await ZML.Core.withManagedGroupsHidden(
					() => original.call(this, client, options, keyInfo, libraries)
				);
				return result.filter(id => !ZML.Libraries.isLocalLibrary(id));
			});
		}

		this._notifierID = Zotero.Notifier.registerObserver(this._observer, ["group"], "zotero-multiple-libraries");
	},

	uninit() {
		if (this._notifierID) {
			Zotero.Notifier.unregisterObserver(this._notifierID);
			this._notifierID = null;
		}
	},

	_observer: {
		notify(action, type, ids, extraData) {
			if (type != "group") {
				return;
			}
			const ZML = ZoteroMultipleLibraries;
			for (let id of ids) {
				if (action == "add" && ZML.Libraries.isLocalGroupID(id)) {
					ZML.Libraries.ensureSkipped(id);
				}
				else if (action == "delete") {
					if (ZML.Libraries.isLocalGroupID(id)) {
						ZML.Libraries.unskip(id);
					}
					// Clean up after deletions we didn't perform ourselves (e.g., Zotero
					// removing a group during sync)
					let libraryID = extraData && extraData[id] && extraData[id].libraryID;
					if (libraryID && ZML.Settings.has(libraryID)) {
						ZML.Settings.remove(libraryID).catch(e => ZML.Util.error(e));
						ZML.Storage.removePassword(libraryID).catch(e => ZML.Util.error(e));
						ZML.Storage.resetController(libraryID);
					}
				}
			}
			if (action == "delete") {
				// The tree only removes the deleted library's own rows, leaving our
				// separator (or Zotero's "Group Libraries" header) behind: rebuild it
				ZML.Tree.reloadAll().catch(e => ZML.Util.error(e));
			}
		},
	},
};
