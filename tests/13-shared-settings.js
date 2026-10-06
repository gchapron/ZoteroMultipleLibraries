// Smoke test: file syncing settings shared between computers through the
// group's synced settings — run with tools/zml-exec.sh -f tests/13-shared-settings.js
//
// "Another computer" is simulated by writing the marker into a group's synced
// settings the way Zotero's sync would after downloading it.
const ZML = Zotero.MultipleLibraries;
const KEY = ZML.Shared.KEY;
const IDS = { source: 7654327, withMarker: 7654328, withoutMarker: 7654329 };
let out = {};

if (!Zotero.Users.getCurrentUserID()) {
	await Zotero.Users.setCurrentUserID(1);
}
for (let name of ["Source Library"]) {
	for (let l of ZML.Libraries.getAll().filter(l => l.name == name)) {
		await ZML.Libraries.erase(l);
	}
}
for (let id of Object.values(IDS)) {
	let g = Zotero.Groups.get(id);
	if (g) {
		await g.eraseTx();
	}
}
let makeGroup = async (id, name) => {
	let g = new Zotero.Group({ groupID: id, name, description: "", version: 3, editable: true, filesEditable: true });
	await g.saveTx();
	let item = new Zotero.Item("book");
	item.libraryID = g.libraryID;
	item.setField("title", "Item in " + name);
	await item.saveTx();
	return g;
};

// --- First computer: linking publishes the marker; file settings changes update it
let source = await ZML.Libraries.create("Source Library");
await ZML.Libraries.linkToGroup(source, IDS.source);
out.afterLink = Zotero.SyncedSettings.get(source.libraryID, KEY);
await ZML.Settings.update(source.libraryID, (c) => {
	c.fileSync.mode = "webdav";
	c.fileSync.scheme = "http";
	c.fileSync.url = "127.0.0.1:8089/shared-a/";
	c.fileSync.username = "zml";
});
await ZML.Storage.setPassword(source.libraryID, "zml", "zml-test-password");
await ZML.Shared.publish(source.libraryID);
let marker = Zotero.SyncedSettings.get(source.libraryID, KEY);
out.published = { marker, noPassword: !JSON.stringify(marker).includes("zml-test-password"), unsynced: Object.keys((await Zotero.SyncedSettings.getUnsynced(source.libraryID)) || {}).includes(KEY) };
out.publishIdempotent = !(await ZML.Shared.publish(source.libraryID));

// --- Second computer: a group arrives with the marker → adopted automatically with the same choice
let withMarker = await makeGroup(IDS.withMarker, "Arrived With Marker");
await Zotero.SyncedSettings.set(withMarker.libraryID, KEY, marker, 5, true);
for (let i = 0; i < 50; i++) {
	await Zotero.Promise.delay(100);
	if (ZML.Libraries.isLinkedLibrary(withMarker)
			&& ZML.Settings.get(withMarker.libraryID).fileSync.url == marker.fileSync.url
			&& ZoteroPane.collectionsView._rows.some(r => r.level == 0 && r.type == "group" && r.ref.libraryID == withMarker.libraryID)) {
		break;
	}
}
let cfg = ZML.Settings.get(withMarker.libraryID).fileSync;
out.autoAdopted = {
	linked: ZML.Libraries.isLinkedLibrary(withMarker),
	mode: cfg.mode, url: cfg.url, username: cfg.username, useMain: cfg.useMain, verified: cfg.verified,
	passwordLocal: await ZML.Storage.getPassword(withMarker.libraryID),
	enabled: Zotero.Sync.Storage.Local.getEnabledForLibrary(withMarker.libraryID),
	storageMode: Zotero.Sync.Storage.Local.getModeForLibrary(withMarker.libraryID),
	topLevel: ZoteroPane.collectionsView._rows.some(r => r.level == 0 && r.type == "group" && r.ref.libraryID == withMarker.libraryID),
};

// Pane on that library: WebDAV selected, custom server fields filled, password hint
ZML.UI.openSettings(window, withMarker);
let prefWin = null;
for (let i = 0; i < 100 && !prefWin; i++) { await Zotero.Promise.delay(100); prefWin = Services.wm.getMostRecentWindow("zotero:pref"); }
for (let i = 0; i < 60; i++) {
	await Zotero.Promise.delay(100);
	let p = prefWin.ZoteroMultipleLibrariesPrefs;
	if (p && p._libraryID == withMarker.libraryID && prefWin.document.getElementById("zml-url").value) break;
}
await Zotero.Promise.delay(300);
let doc = prefWin.document;
out.pane = {
	mode: doc.getElementById("zml-file-mode").value,
	source: doc.getElementById("zml-webdav-source").value,
	url: doc.getElementById("zml-url").value,
	username: doc.getElementById("zml-username").value,
	verifyStatus: doc.getElementById("zml-verify-status").textContent,
	sharedNoteVisible: !doc.getElementById("zml-shared-note").hidden,
};

// A change made elsewhere propagates
let changed = JSON.parse(JSON.stringify(marker));
changed.fileSync.url = "127.0.0.1:8089/shared-b/";
await Zotero.SyncedSettings.set(withMarker.libraryID, KEY, changed, 6, true);
for (let i = 0; i < 50; i++) {
	await Zotero.Promise.delay(100);
	if (ZML.Settings.get(withMarker.libraryID).fileSync.url == changed.fileSync.url
			&& doc.getElementById("zml-url").value == changed.fileSync.url) {
		break;
	}
}
out.propagated = { url: ZML.Settings.get(withMarker.libraryID).fileSync.url, paneURL: doc.getElementById("zml-url").value };

// Adopting a group without marker: deliberate choice required (no default)
let withoutMarker = await makeGroup(IDS.withoutMarker, "Arrived Without Marker");
await ZML.Libraries.adoptGroup(withoutMarker);
await prefWin.ZoteroMultipleLibrariesPrefs.selectLibrary(withoutMarker.libraryID);
await Zotero.Promise.delay(300);
out.withoutMarker = {
	mode: ZML.Settings.get(withoutMarker.libraryID).fileSync.mode,
	enabled: Zotero.Sync.Storage.Local.getEnabledForLibrary(withoutMarker.libraryID),
	fileSyncModeReported: ZML.Storage.getFileSyncMode(withoutMarker.libraryID),
	paneRadioSelected: doc.getElementById("zml-file-mode").selectedIndex,
	deliberateNoteVisible: !doc.getElementById("zml-file-deliberate-note").hidden,
	markerAbsent: Zotero.SyncedSettings.get(withoutMarker.libraryID, KEY) === null,
};
// Choosing in the pane publishes
doc.getElementById("zml-file-mode").value = "zotero";
await prefWin.ZoteroMultipleLibrariesPrefs.changeFileMode();
await Zotero.Promise.delay(200);
out.choiceShared = { marker: Zotero.SyncedSettings.get(withoutMarker.libraryID, KEY), enabled: Zotero.Sync.Storage.Local.getEnabledForLibrary(withoutMarker.libraryID) };
prefWin.close();

// Release: marker removed, tombstone prevents re-adoption until adopted by hand
await ZML.Libraries.releaseGroup(withMarker);
out.released = {
	managed: ZML.Libraries.isManagedLibrary(withMarker),
	markerGone: Zotero.SyncedSettings.get(withMarker.libraryID, KEY) === null,
	tombstone: ZML.Settings.get(withMarker.libraryID).released,
};
await Zotero.SyncedSettings.set(withMarker.libraryID, KEY, marker, 7, true);
await Zotero.Promise.delay(500);
out.notReadopted = !ZML.Libraries.isManagedLibrary(withMarker);
await ZML.Libraries.adoptGroup(withMarker);
out.readoptedByHand = { linked: ZML.Libraries.isLinkedLibrary(withMarker), url: ZML.Settings.get(withMarker.libraryID).fileSync.url, released: ZML.Settings.get(withMarker.libraryID).released };

// Startup scan: a group with marker present before the plugin looks at it
ZML.Shared.uninit();
let g = Zotero.Groups.get(IDS.withMarker);
await ZML.Libraries.releaseGroup(g);
await ZML.Settings.update(g.libraryID, (c) => { c.released = false; });
await Zotero.SyncedSettings.set(g.libraryID, KEY, marker, 8, true);
await Zotero.Promise.delay(200);
out.beforeScan = ZML.Libraries.isManagedLibrary(g);
await ZML.Shared.scanAll();
out.afterScan = ZML.Libraries.isLinkedLibrary(g);
ZML.Shared.init();

// Cleanup
await ZML.Libraries.erase(source);
for (let id of Object.values(IDS)) {
	let grp = Zotero.Groups.get(id);
	if (grp) {
		await grp.eraseTx();
	}
}
out.cleanup = Object.values(IDS).filter(id => Zotero.Groups.exists(id));
return out;
