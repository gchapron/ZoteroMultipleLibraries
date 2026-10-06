/* global Zotero, ZoteroMultipleLibraries */
/*
 * Patches to Zotero core (window-independent) that keep local libraries out of
 * everything group-specific: the "Group Libraries" section and sync.
 */

ZoteroMultipleLibraries.Core = {
	_notifierID: null,
	// > 0 while Zotero.Groups.getAll() must leave local libraries out
	_hideLocalGroups: 0,

	/**
	 * Run fn() with local libraries hidden from Zotero.Groups.getAll()
	 *
	 * Used around a patched collection tree refresh (the tree inserts them
	 * itself) and around the sync runner's library check. Everywhere else, e.g.
	 * an unpatched collection tree in a dialog or the local API, local libraries
	 * stay visible as group libraries.
	 */
	async withLocalGroupsHidden(fn) {
		this._hideLocalGroups++;
		try {
			return await fn();
		}
		finally {
			this._hideLocalGroups--;
		}
	},

	init() {
		const ZML = ZoteroMultipleLibraries;
		const Patches = ZML.Util.Patches;

		Patches.wrap(Zotero.Groups, "getAll", original => function () {
			let groups = original.call(this);
			if (ZML.Core._hideLocalGroups > 0) {
				groups = groups.filter(group => !ZML.Libraries.isLocalLibrary(group));
			}
			return groups;
		});

		// Never let a local library reach the sync engine, whether the whole
		// account or specific libraries are being synced. Hiding local groups
		// during the check also keeps the original from reporting them as groups
		// the user "is no longer a member of".
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
				let result = await ZML.Core.withLocalGroupsHidden(
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
		notify(action, type, ids, _extraData) {
			if (type != "group") {
				return;
			}
			const ZML = ZoteroMultipleLibraries;
			for (let id of ids) {
				if (!ZML.Libraries.isLocalGroupID(id)) {
					continue;
				}
				if (action == "add") {
					ZML.Libraries.ensureSkipped(id);
				}
				else if (action == "delete") {
					ZML.Libraries.unskip(id);
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
