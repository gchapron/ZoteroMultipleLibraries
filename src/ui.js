/* global Zotero, Services, ZoteroMultipleLibraries */
/*
 * Menus and dialogs: New Library…, Rename Library…, Delete Library…
 */

ZoteroMultipleLibraries.UI = {
	_menuIDs: [],

	init() {
		const ZML = ZoteroMultipleLibraries;
		const libraryIcon = "chrome://zotero/skin/16/universal/library.svg";

		let isLocalRow = rows => rows && rows.length == 1
			&& rows[0].type == "group" && ZML.Libraries.isLocalLibrary(rows[0].ref);

		// Collection tree context menu
		this._menuIDs.push(Zotero.MenuManager.registerMenu({
			menuID: "zotero-multiple-libraries-collection",
			pluginID: ZML.id,
			target: "main/library/collection",
			menus: [
				{
					menuType: "menuitem",
					l10nID: "zml-menu-new-library",
					icon: libraryIcon,
					onCommand: (event, _context) => this.newLibrary(event.target.ownerGlobal),
				},
				{
					menuType: "menuitem",
					l10nID: "zml-menu-rename-library",
					onShowing: (_event, context) => context.setVisible(isLocalRow(context.collectionTreeRows)),
					onCommand: (event, context) => this.renameLibrary(
						event.target.ownerGlobal, context.collectionTreeRows[0].ref
					),
				},
				{
					menuType: "menuitem",
					l10nID: "zml-menu-delete-library",
					onShowing: (_event, context) => context.setVisible(isLocalRow(context.collectionTreeRows)),
					onCommand: (event, context) => this.deleteLibrary(
						event.target.ownerGlobal, context.collectionTreeRows[0].ref
					),
				},
			],
		}));

		// File menu
		this._menuIDs.push(Zotero.MenuManager.registerMenu({
			menuID: "zotero-multiple-libraries-file",
			pluginID: ZML.id,
			target: "main/menubar/file",
			menus: [
				{
					menuType: "menuitem",
					l10nID: "zml-menu-new-library",
					icon: libraryIcon,
					onCommand: (event, _context) => this.newLibrary(event.target.ownerGlobal),
				},
			],
		}));
	},

	uninit() {
		for (let id of this._menuIDs) {
			if (id) {
				Zotero.MenuManager.unregisterMenu(id);
			}
		}
		this._menuIDs = [];
	},

	/**
	 * Per-window tweaks to Zotero's own collection context menu
	 */
	attachWindow(window) {
		const ZML = ZoteroMultipleLibraries;
		const Patches = ZML.Util.Patches;
		let pane = window.ZoteroPane;
		if (!pane || Patches.isWrapped(pane, "buildCollectionContextMenu")) {
			return;
		}
		// A local library has nothing to sync: hide "Sync" (and the separator after it)
		Patches.wrap(pane, "buildCollectionContextMenu", original => async function (...args) {
			let result = await original.apply(this, args);
			try {
				let rows = this.getCollectionTreeRows();
				if (rows.length == 1 && rows[0].type == "group" && ZML.Libraries.isLocalLibrary(rows[0].ref)) {
					let menu = window.document.getElementById("zotero-collectionmenu");
					for (let id of ["sync", "sep1"]) {
						let item = menu.querySelector("#" + id);
						if (item) {
							item.setAttribute("hidden", true);
						}
					}
				}
			}
			catch (e) {
				ZML.Util.error(e);
			}
			return result;
		});
	},

	_getString(id, args) {
		return ZoteroMultipleLibraries.Util.getString(id, args);
	},

	/**
	 * Prompt for a library name until it is valid or the user cancels
	 *
	 * @return {String|null}
	 */
	_askName(window, titleID, text, initial, exceptLibraryID) {
		const Libraries = ZoteroMultipleLibraries.Libraries;
		let title = this._getString(titleID);
		let value = initial || "";
		while (true) {
			let result = { value };
			let ok = Services.prompt.prompt(window, title, text, result, null, {});
			if (!ok) {
				return null;
			}
			let name = result.value.trim();
			value = result.value;
			if (!name) {
				Services.prompt.alert(window, title, this._getString("zml-error-name-empty"));
				continue;
			}
			if (Libraries.nameExists(name, exceptLibraryID)) {
				Services.prompt.alert(window, title, this._getString("zml-error-name-exists", { name }));
				continue;
			}
			return name;
		}
	},

	async newLibrary(window) {
		const ZML = ZoteroMultipleLibraries;
		try {
			let name = this._askName(
				window,
				"zml-new-library-title",
				this._getString("zml-new-library-text"),
				this._getString("zml-new-library-default-name")
			);
			if (name === null) {
				return null;
			}
			let library = await ZML.Libraries.create(name);
			await ZML.Tree.selectLibrary(window, library.libraryID);
			return library;
		}
		catch (e) {
			ZML.Util.error(e);
			Services.prompt.alert(window, this._getString("zml-new-library-title"), String(e));
			return null;
		}
	},

	async renameLibrary(window, library) {
		const ZML = ZoteroMultipleLibraries;
		if (!ZML.Libraries.isLocalLibrary(library)) {
			return;
		}
		try {
			let name = this._askName(
				window,
				"zml-rename-library-title",
				this._getString("zml-rename-library-text", { name: library.name }),
				library.name,
				library.libraryID
			);
			if (name === null) {
				return;
			}
			await ZML.Libraries.rename(library, name);
		}
		catch (e) {
			ZML.Util.error(e);
			Services.prompt.alert(window, this._getString("zml-rename-library-title"), String(e));
		}
	},

	async deleteLibrary(window, library) {
		const ZML = ZoteroMultipleLibraries;
		if (!ZML.Libraries.isLocalLibrary(library)) {
			return;
		}
		try {
			let count = await ZML.Libraries.countItems(library.libraryID);
			let index = Zotero.Prompt.confirm({
				window,
				title: this._getString("zml-delete-library-title"),
				text: this._getString("zml-delete-library-text", { name: library.name, count }),
				button0: this._getString("zml-delete-library-button"),
				button1: Services.prompt.BUTTON_TITLE_CANCEL,
				defaultButton: 1,
				buttonDelay: true,
			});
			if (index !== 0) {
				return;
			}
			// Move the selection away from the library that is about to vanish
			let view = window.ZoteroPane && window.ZoteroPane.collectionsView;
			if (view) {
				await view.selectLibrary(Zotero.Libraries.userLibraryID);
			}
			await ZML.Libraries.erase(library);
		}
		catch (e) {
			ZML.Util.error(e);
			Services.prompt.alert(window, this._getString("zml-delete-library-title"), String(e));
		}
	},
};
