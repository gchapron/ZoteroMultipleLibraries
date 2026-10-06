// Smoke test: adopting an existing group library (the second-computer case,
// where the group already holds the content) — run with
// tools/zml-exec.sh -f tests/10-adopt.js
const ZML = Zotero.MultipleLibraries;
const GROUP_ID = 7654324;
let out = {};
const topRows = () => ZoteroPane.collectionsView._rows.filter(r => r.level == 0).map(r => r.type + ":" + (r.ref && (r.ref.name || r.ref.label) || ""));
const groupRows = () => ZoteroPane.collectionsView._rows.filter(r => r.level == 1 && r.type == "group").map(r => r.ref.name);

// Cleanup
for (let l of ZML.Libraries.getAll().filter(l => l.name == "Adopt Local")) {
	await ZML.Libraries.erase(l);
}
let g = Zotero.Groups.get(GROUP_ID);
if (g) {
	await g.eraseTx();
}

// A group "downloaded by sync" that already holds an item and an attachment
// whose file Zotero storage could not provide (marked in sync without a file)
let group = new Zotero.Group({ groupID: GROUP_ID, name: "Synced Elsewhere", description: "", version: 3, editable: true, filesEditable: true });
await group.saveTx();
let item = new Zotero.Item("book");
item.libraryID = group.libraryID;
item.setField("title", "Uploaded from computer A");
await item.saveTx();
let attachment = new Zotero.Item("attachment");
attachment.libraryID = group.libraryID;
attachment.parentID = item.id;
attachment.attachmentLinkMode = Zotero.Attachments.LINK_MODE_IMPORTED_FILE;
attachment.attachmentContentType = "text/plain";
attachment.attachmentPath = "storage:missing.txt";
attachment.attachmentSyncState = Zotero.Sync.Storage.Local.SYNC_STATE_IN_SYNC;
await attachment.saveTx();

out.before = {
	adoptable: ZML.Libraries.getAdoptableGroups().map(x => x.name),
	managed: ZML.Libraries.isManagedLibrary(group),
	groupRows: groupRows(),
	attachmentState: attachment.attachmentSyncState,
};

// The link flow offers adoption when the chosen group is not empty (confirm stubbed to "adopt")
let local = await ZML.Libraries.create("Adopt Local");
let origConfirm = Zotero.Prompt.confirm;
let confirmTexts = [];
Zotero.Prompt.confirm = (opts) => { confirmTexts.push(opts.text); return 0; };
let linkResult;
try {
	linkResult = await ZML.UI.linkLibrary(window, local, String(GROUP_ID));
}
finally {
	Zotero.Prompt.confirm = origConfirm;
}
out.linkFlow = {
	result: linkResult,
	offeredAdoption: confirmTexts.some(t => t.includes("already contains items")),
	groupManaged: ZML.Libraries.isLinkedLibrary(group),
	localStillLocal: ZML.Libraries.isLocalLibrary(local) && Zotero.Libraries.exists(local.libraryID),
	topRows: topRows(),
	groupRows: groupRows(),
	attachmentStateAfterAdopt: attachment.attachmentSyncState,
	toDownloadConstant: Zotero.Sync.Storage.Local.SYNC_STATE_TO_DOWNLOAD,
	fileSyncMode: ZML.Storage.getFileSyncMode(group.libraryID),
	adoptableNow: ZML.Libraries.getAdoptableGroups().map(x => x.name),
};

// Pane: adopted library selectable, release button visible; adopt box hidden when nothing to adopt
ZML.UI.openSettings(window, group);
let prefWin = null;
for (let i = 0; i < 100 && !prefWin; i++) { await Zotero.Promise.delay(100); prefWin = Services.wm.getMostRecentWindow("zotero:pref"); }
for (let i = 0; i < 60; i++) {
	await Zotero.Promise.delay(100);
	let p = prefWin.ZoteroMultipleLibrariesPrefs;
	if (p && p._libraryID == group.libraryID) break;
}
await Zotero.Promise.delay(300);
let doc = prefWin.document;
out.pane = {
	selected: doc.getElementById("zml-library").value == String(group.libraryID),
	status: doc.getElementById("zml-sync-status").textContent,
	releaseVisible: !doc.getElementById("zml-release-box").hidden,
	adoptBoxVisible: !doc.getElementById("zml-adopt-box").hidden,
	fileSettingsVisible: !doc.getElementById("zml-file-settings").hidden,
};
prefWin.close();

// Release: back under Group Libraries, settings gone
await ZML.Settings.update(group.libraryID, c => { c.fileSync.mode = "webdav"; c.fileSync.url = "example.invalid/x/"; });
await ZML.Storage.setPassword(group.libraryID, "u", "p");
await ZML.Libraries.releaseGroup(group);
out.released = {
	managed: ZML.Libraries.isManagedLibrary(group),
	settingsGone: !ZML.Settings.has(group.libraryID),
	loginsGone: (await Services.logins.searchLoginsAsync({ origin: "chrome://zotero", httpRealm: ZML.Storage.loginRealm(group.libraryID) })).length == 0,
	groupRows: groupRows(),
	adoptable: ZML.Libraries.getAdoptableGroups().map(x => x.name),
};

// Direct adopt (context menu path), then cleanup
await ZML.Libraries.adoptGroup(group);
out.adoptedAgain = ZML.Libraries.isLinkedLibrary(group);
await ZML.Libraries.erase(local);
await ZML.Libraries.erase(group);
out.cleanup = { groupGone: !Zotero.Groups.exists(GROUP_ID) };
return out;
