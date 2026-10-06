/* global Zotero, ZoteroMultipleLibraries */
/*
 * Patches to Zotero core (window-independent) that keep local libraries out of
 * everything group-specific: the "Group Libraries" section and sync.
 */

ZoteroMultipleLibraries.Core = {
	_notifierID: null,

	init() {
		const ZML = ZoteroMultipleLibraries;
		const Patches = ZML.Util.Patches;

		// Zotero.Groups.getAll() feeds the "Group Libraries" section of the
		// collection tree and the sync runner's group reconciliation. Local
		// libraries are not groups for either purpose. (Zotero.Libraries.getAll()
		// and Zotero.Groups.get(id) still return them.)
		Patches.wrap(Zotero.Groups, "getAll", original => function () {
			return original.call(this).filter(group => !ZML.Libraries.isLocalLibrary(group));
		});

		// Belt and braces for sync: never let a local library reach the engine,
		// whether the whole account or specific libraries are being synced.
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
				let result = await original.call(this, client, options, keyInfo, libraries);
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
			const Libraries = ZoteroMultipleLibraries.Libraries;
			for (let id of ids) {
				if (!Libraries.isLocalGroupID(id)) {
					continue;
				}
				if (action == "add") {
					Libraries.ensureSkipped(id);
				}
				else if (action == "delete") {
					Libraries.unskip(id);
				}
			}
		},
	},
};
