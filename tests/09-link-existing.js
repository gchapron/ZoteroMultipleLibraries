// Smoke test: linking to a group that Zotero's sync already downloaded
// (the normal case right after creating it on zotero.org) — run with
// tools/zml-exec.sh -f tests/09-link-existing.js
const ZML = Zotero.MultipleLibraries;
const EMPTY_GROUP_ID = 7654322;
const FULL_GROUP_ID = 7654323;
let out = {};

// Cleanup from previous runs
for (let name of ["Takeover Library", "Other Library"]) {
	for (let l of ZML.Libraries.getAll().filter(l => l.name == name)) {
		await ZML.Libraries.erase(l);
	}
}
for (let id of [EMPTY_GROUP_ID, FULL_GROUP_ID]) {
	let g = Zotero.Groups.get(id);
	if (g) {
		await g.eraseTx();
	}
}

// Simulate groups downloaded by sync: one empty, one with an item
let makeGroup = async (id, name) => {
	let g = new Zotero.Group({ groupID: id, name, description: "", version: 3, editable: true, filesEditable: true });
	await g.saveTx();
	return g;
};
let emptyGroup = await makeGroup(EMPTY_GROUP_ID, "Downloaded Empty Group");
let emptyGroupLibraryID = emptyGroup.libraryID;
let fullGroup = await makeGroup(FULL_GROUP_ID, "Downloaded Full Group");
let groupItem = new Zotero.Item("book");
groupItem.libraryID = fullGroup.libraryID;
groupItem.setField("title", "Already in the group");
await groupItem.saveTx();

let lib = await ZML.Libraries.create("Takeover Library");
let other = await ZML.Libraries.create("Other Library");
let item = new Zotero.Item("book");
item.libraryID = lib.libraryID;
item.setField("title", "Local book");
await item.saveTx();

out.linkable = (await ZML.Libraries.getLinkableGroups()).map(g => g.name + ":" + g.groupID);
out.hasContent = { empty: await ZML.Libraries.hasContent(emptyGroup.libraryID), full: await ZML.Libraries.hasContent(fullGroup.libraryID) };

// The pane lists the empty group for a local library
ZML.UI.openSettings(window, lib);
let prefWin = null;
for (let i = 0; i < 100 && !prefWin; i++) { await Zotero.Promise.delay(100); prefWin = Services.wm.getMostRecentWindow("zotero:pref"); }
for (let i = 0; i < 60; i++) {
	await Zotero.Promise.delay(100);
	let p = prefWin.ZoteroMultipleLibrariesPrefs;
	if (p && p._libraryID == lib.libraryID && prefWin.document.querySelectorAll("#zml-group-select menuitem").length > 1) break;
}
let doc = prefWin.document;
out.pane = {
	selectBoxVisible: !doc.getElementById("zml-group-select-box").hidden,
	options: Array.from(doc.querySelectorAll("#zml-group-select menuitem")).map(i => i.getAttribute("label") + "=" + i.getAttribute("value")),
};
prefWin.close();

// Refusals
try { await ZML.Libraries.linkToGroup(lib, FULL_GROUP_ID); out.fullGroup = "accepted"; }
catch (e) { out.fullGroup = { code: e.code, groupName: e.groupName }; }
await ZML.Libraries.linkToGroup(other, EMPTY_GROUP_ID); // takes over the empty group
try { await ZML.Libraries.linkToGroup(lib, EMPTY_GROUP_ID); out.managedGroup = "accepted"; }
catch (e) { out.managedGroup = e.code; }

out.takeover = {
	otherGroupID: other.groupID,
	otherLinked: ZML.Libraries.isLinkedLibrary(other),
	emptyGroupLibraryGone: !Zotero.Libraries.exists(emptyGroupLibraryID),
	groupResolvesToOther: Zotero.Groups.getLibraryIDFromGroupID(EMPTY_GROUP_ID) == other.libraryID,
	otherName: other.name,
	linkableNow: (await ZML.Libraries.getLinkableGroups()).map(g => g.name),
	topRows: ZoteroPane.collectionsView._rows.filter(r => r.level == 0).map(r => r.type + ":" + (r.ref && (r.ref.name || r.ref.label) || "")),
	groupRows: ZoteroPane.collectionsView._rows.filter(r => r.level == 1 && r.type == "group").map(r => r.ref.name),
};

// Cleanup
await ZML.Libraries.erase(lib);
await ZML.Libraries.erase(other);
await fullGroup.eraseTx();
out.cleanup = { groupsLeft: [EMPTY_GROUP_ID, FULL_GROUP_ID].filter(id => Zotero.Groups.exists(id)) };
return out;
