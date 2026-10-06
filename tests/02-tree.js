// Smoke test: collection tree integration (run with tools/zml-exec.sh -f tests/02-tree.js)
const ZML = Zotero.MultipleLibraries;
const view = ZoteroPane.collectionsView;
let out = {};
const dump = () => view._rows.map((r, i) => i + ":" + r.level + ":" + r.type + ":" + (r.ref && (r.ref.name || r.ref.label) || "") + (r.type == "group" ? ":icon=" + view.getIconName(i) : ""));

out.rowsAtStart = dump();

// Leftovers from previous runs
for (let l of ZML.Libraries.getAll().filter(l => l.name == "Third Library")) {
	await ZML.Libraries.erase(l);
}
let lib = await ZML.Libraries.create("Third Library");
await ZML.Tree.selectLibrary(window, lib.libraryID);
await Zotero.Promise.delay(300);
out.rowsAfterCreate = dump();
out.selectedAfterCreate = view.getRow(view.selection.focused).id;
out.selectedLibraryID = ZoteroPane.getSelectedLibraryID();
out.canEdit = ZoteroPane.canEdit();
out.canEditFiles = ZoteroPane.canEditFiles();

// Context menu for the selected local library
await ZoteroPane.buildCollectionContextMenu();
let menu = window.document.getElementById("zotero-collectionmenu");
out.contextMenu = Array.from(menu.children)
	.filter(el => el.getAttribute("hidden") != "true" && !el.hidden)
	.map(el => el.tagName + ":" + (el.id || "") + ":" + (el.getAttribute("label") || el.getAttribute("data-l10n-id") || ""));

// Rename updates the tree via the notifier
await ZML.Libraries.rename(lib, "Third Library (renamed)");
await Zotero.Promise.delay(500);
out.rowsAfterRename = dump().filter(r => r.includes("Third"));

// Add a collection and check it appears under the library
let coll = new Zotero.Collection();
coll.libraryID = lib.libraryID;
coll.name = "Third Coll";
await coll.saveTx();
await Zotero.Promise.delay(300);
out.rowsAfterCollection = dump().filter(r => r.includes("Third"));

// Delete: rows disappear
await view.selectLibrary(Zotero.Libraries.userLibraryID);
await ZML.Libraries.erase(lib);
await Zotero.Promise.delay(500);
out.rowsAfterDelete = dump();
out.groupHeaderPresent = view._rows.some(r => r.type == "header");
return out;
