// Smoke test: a real (zotero.org-style) group library coexists with local ones
// (run with tools/zml-exec.sh -f tests/05-real-groups.js)
const ZML = Zotero.MultipleLibraries;
const view = ZoteroPane.collectionsView;
let out = {};
const dump = () => view._rows.map((r, i) => r.level + ":" + r.type + ":" + (r.ref && (r.ref.name || r.ref.label) || ""));

let existing = Zotero.Groups.get(12345);
if (existing) {
	await existing.eraseTx();
}
let group = new Zotero.Group({ groupID: 12345, name: "Real Group", description: "", version: 0, editable: true, filesEditable: true });
await group.saveTx();
await Zotero.Promise.delay(500);
out.isLocal = ZML.Libraries.isLocalLibrary(group);
out.groupsGetAll = Zotero.Groups.getAll().map(g => g.name);
out.localAll = ZML.Libraries.getAll().map(l => l.name);
out.skipPref = Zotero.Prefs.get("sync.librariesToSkip");
out.rowsWithRealGroup = dump();
await group.eraseTx();
await Zotero.Promise.delay(500);
out.rowsAfter = dump();
return out;
