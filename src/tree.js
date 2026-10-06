/* global Zotero, ZoteroMultipleLibraries */
/*
 * Collection tree integration.
 *
 * Zotero's CollectionTree.refresh() builds My Library, then (via
 * Zotero.Groups.getAll(), which core.js filters) the Group Libraries section,
 * then Feeds. We wrap refresh() and insert every local library as a level-0
 * row right after My Library, expanded with Zotero's own _expandRow() so it gets
 * the same virtual collections (Duplicate Items, Unfiled Items, Retracted Items,
 * Trash) and persisted open/closed state as any library.
 *
 * Rows for local libraries keep Zotero's 'group' row type: that is what makes
 * editing permissions, drag and drop, context menus and the item pane treat them
 * as editable libraries without further patches. Only the icon and the
 * double-click action are changed.
 */

ZoteroMultipleLibraries.Tree = {
	// window -> CollectionTree instance
	_views: new Map(),

	/**
	 * Patch the collection tree of a main window and redraw it
	 */
	async attach(window) {
		const ZML = ZoteroMultipleLibraries;
		let view = await this._waitForView(window);
		if (!view) {
			ZML.Util.warn("collection tree not found in main window");
			return;
		}
		this._views.set(window, view);
		this._patchPrototype(Object.getPrototypeOf(view));
		this._patchInstance(view);
		await this.reload(view);
	},

	forget(window) {
		this._views.delete(window);
	},

	/**
	 * Called after the patches have been removed: redraw so local libraries fall
	 * back to Zotero's default presentation (under Group Libraries)
	 */
	async detachAll() {
		for (let view of this._views.values()) {
			try {
				await this.reload(view);
			}
			catch (e) {
				ZoteroMultipleLibraries.Util.error(e);
			}
		}
		this._views.clear();
	},

	async reloadAll() {
		for (let view of this._views.values()) {
			try {
				await this.reload(view);
			}
			catch (e) {
				ZoteroMultipleLibraries.Util.error(e);
			}
		}
	},

	/**
	 * Rebuild the tree and restore the selection (refresh() clears it and
	 * suppresses selection events; see CollectionTree.refresh())
	 */
	async reload(view) {
		let selectedID = null;
		if (view.selection && view.selection.focused >= 0) {
			let row = view.getRow(view.selection.focused);
			selectedID = row ? row.id : null;
		}
		await view.reload();
		if (selectedID) {
			try {
				await view.selectByID(selectedID);
			}
			catch (e) {
				ZoteroMultipleLibraries.Util.error(e);
			}
		}
		view.forceUpdate();
		view.selection.selectEventsSuppressed = false;
	},

	/**
	 * Select a library row, waiting briefly for it to appear (e.g., right after
	 * creation, when the notifier-driven reload may still be running)
	 */
	async selectLibrary(window, libraryID) {
		let view = this._views.get(window);
		if (!view) {
			return;
		}
		let id = "L" + libraryID;
		for (let i = 0; i < 20; i++) {
			if (id in view._rowMap) {
				await view.selectByID(id);
				return;
			}
			await Zotero.Promise.delay(100);
		}
		await this.reload(view);
		if (id in view._rowMap) {
			await view.selectByID(id);
		}
	},

	async _waitForView(window) {
		// ZoteroPane.collectionsView is set once the React tree is mounted; then
		// wait for the initial load to have selected something
		for (let i = 0; i < 300; i++) {
			if (window.closed) {
				return null;
			}
			let view = window.ZoteroPane && window.ZoteroPane.collectionsView;
			if (view && view.selection && view.selection.count > 0) {
				return view;
			}
			await Zotero.Promise.delay(100);
		}
		return (window.ZoteroPane && window.ZoteroPane.collectionsView) || null;
	},

	_patchPrototype(proto) {
		const ZML = ZoteroMultipleLibraries;
		const Patches = ZML.Util.Patches;
		const Tree = this;
		if (Patches.isWrapped(proto, "refresh")) {
			return;
		}

		Patches.wrap(proto, "refresh", original => async function (...args) {
			await original.apply(this, args);
			try {
				await Tree._insertLocalLibraries(this);
			}
			catch (e) {
				ZML.Util.error(e);
			}
		});

		Patches.wrap(proto, "getIconName", original => function (index) {
			let row = this.getRow(index);
			if (row && row.type == "group" && ZML.Libraries.isLocalLibrary(row.ref)) {
				return "library";
			}
			return original.call(this, index);
		});
	},

	_patchInstance(view) {
		const ZML = ZoteroMultipleLibraries;
		const Patches = ZML.Util.Patches;
		if (Patches.isWrapped(view, "handleActivate")) {
			return;
		}
		// Double-click / Enter: Zotero opens the group's zotero.org page for group
		// rows. For a local library, rename it instead.
		Patches.wrap(view, "handleActivate", original => (event, indices) => {
			if (indices && indices.length == 1) {
				let row = view.getRow(indices[0]);
				if (row && row.type == "group" && ZML.Libraries.isLocalLibrary(row.ref)) {
					let window = view.props.domEl ? view.props.domEl.ownerGlobal : null;
					ZML.UI.renameLibrary(window, row.ref);
					return undefined;
				}
			}
			return original(event, indices);
		});
	},

	/**
	 * Insert local libraries (and their expanded children) into view._rows
	 * right after My Library's subtree
	 */
	async _insertLocalLibraries(view) {
		const ZML = ZoteroMultipleLibraries;
		let libraries = ZML.Libraries.getAll();
		if (!libraries.length) {
			return;
		}
		let rows = view._rows;

		let insertAt = 0;
		if (rows.length && rows[0].type == "library") {
			insertAt = 1;
			while (insertAt < rows.length && rows[insertAt].level > 0) {
				insertAt++;
			}
		}

		let separators = ZML.Util.getPref("separators");
		let added = 0;
		for (let library of libraries) {
			// Honours filterLibraryIDs (collection pickers) and the search filter
			if (!view._includedInTree(library)) {
				continue;
			}
			let block = [];
			if (separators && insertAt + added > 0) {
				block.push(new Zotero.CollectionTreeRow(view, "separator", false, 0));
			}
			block.push(new Zotero.CollectionTreeRow(view, "group", library, 0));
			await view._expandRow(block, block.length - 1);
			rows.splice(insertAt + added, 0, ...block);
			added += block.length;
		}
		if (added) {
			view._refreshRowMap();
		}
	},
};
