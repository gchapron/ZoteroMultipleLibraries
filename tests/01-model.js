// Smoke test: library model (run with tools/zml-exec.sh -f tests/01-model.js)
const ZML = Zotero.MultipleLibraries;
let out = {};

// Idempotent: remove leftovers from a previous run
for (let name of ["Test Library", "Second Library", "Temp"]) {
	for (let l of ZML.Libraries.getAll().filter(l => l.name == name)) {
		await ZML.Libraries.erase(l);
	}
}

let lib = await ZML.Libraries.create("Test Library");
out.created = { libraryID: lib.libraryID, groupID: lib.groupID, name: lib.name, editable: lib.editable, filesEditable: lib.filesEditable, isLocal: ZML.Libraries.isLocalLibrary(lib) };
out.inLibrariesGetAll = Zotero.Libraries.getAll().map(l => l.name);
out.inGroupsGetAll = Zotero.Groups.getAll().map(g => g.name);
out.localAll = ZML.Libraries.getAll().map(l => l.name);
out.skipPref = Zotero.Prefs.get("sync.librariesToSkip");
out.dbRows = (await Zotero.DB.queryAsync("SELECT L.libraryID, L.type, L.editable, L.filesEditable, G.groupID, G.name FROM libraries L LEFT JOIN groups G USING (libraryID)"))
	.map(r => ({ libraryID: r.libraryID, type: r.type, editable: r.editable, filesEditable: r.filesEditable, groupID: r.groupID, name: r.name }));

try { await ZML.Libraries.create("  "); out.emptyErr = "no error"; } catch (e) { out.emptyErr = e.code; }
try { await ZML.Libraries.create("test library"); out.dupErr = "no error"; } catch (e) { out.dupErr = e.code; }
try { await ZML.Libraries.create("My Library"); out.dupUserErr = "no error"; } catch (e) { out.dupUserErr = e.code; }

await ZML.Libraries.rename(lib, "Second Library");
out.renamed = Zotero.Libraries.get(lib.libraryID).name;

let item = new Zotero.Item("book");
item.libraryID = lib.libraryID;
item.setField("title", "A book in the second library");
await item.saveTx();
let coll = new Zotero.Collection();
coll.libraryID = lib.libraryID;
coll.name = "Collection A";
await coll.saveTx();
out.itemCount = await ZML.Libraries.countItems(lib.libraryID);
out.collections = Zotero.Collections.getByLibrary(lib.libraryID).map(c => c.name);
out.itemURI = Zotero.URI.getItemURI(item);
let back = await Zotero.URI.getURIItem(out.itemURI);
out.uriRoundTrip = back && back.id == item.id;

out.checkLibrariesWrapped = Zotero.Sync.Runner.checkLibraries.toString().includes("isLocalLibrary");

let tmp = await ZML.Libraries.create("Temp");
let tmpID = tmp.libraryID, tmpGroupID = tmp.groupID;
await ZML.Libraries.erase(tmp);
out.erased = { libraryExists: Zotero.Libraries.exists(tmpID), groupExists: Zotero.Groups.exists(tmpGroupID), skipPref: Zotero.Prefs.get("sync.librariesToSkip") };

out.treeRows = ZoteroPane.collectionsView._rows.map(r => r.level + ":" + r.type + ":" + (r.ref && (r.ref.name || r.ref.label) || ""));
return out;
