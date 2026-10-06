// Smoke test: collection trees in dialog windows show local libraries at the
// top level too (run with tools/zml-exec.sh -f tests/06-dialogs.js)
const ZML = Zotero.MultipleLibraries;
let out = {};
const dump = view => view._rows.map(r => r.level + ":" + r.type + ":" + (r.ref && (r.ref.name || r.ref.label) || ""));

// Outside a patched refresh, Zotero.Groups.getAll() still returns local libraries
out.groupsGetAllOutside = Zotero.Groups.getAll().map(g => g.name);
out.groupsGetAllInside = await ZML.Core.withManagedGroupsHidden(async () => Zotero.Groups.getAll().map(g => g.name));

// Non-modal Select Items dialog
let io = { dataIn: null, dataOut: null, deferred: Zotero.Promise.defer() };
let dialog = window.openDialog("chrome://zotero/content/selectItemsDialog.xhtml", "", "chrome,dialog=no,resizable,centerscreen", io);
let view = null;
for (let i = 0; i < 100 && !view; i++) {
	await Zotero.Promise.delay(100);
	view = dialog.collectionsView;
}
// give the plugin's window watcher time to patch and reload
for (let i = 0; i < 40; i++) {
	await Zotero.Promise.delay(100);
	if (view && view._rows.some(r => r.type == "group" && r.level == 0)) break;
}
out.dialogRows = view ? dump(view) : null;
out.dialogPatched = view ? Object.getPrototypeOf(view).refresh.toString().includes("_insertLocalLibraries") : null;
dialog.close();
await Zotero.Promise.delay(300);
out.mainRows = ZoteroPane.collectionsView._rows.filter(r => r.level == 0).map(r => r.type + ":" + (r.ref && (r.ref.name || r.ref.label) || ""));
return out;
