// Smoke test: link a library to a (fake) zotero.org group and sync its files to
// a local WebDAV server (tools/webdav-server.sh start) — run with
// tools/zml-exec.sh -f tests/07-storage.js
//
// Nothing here contacts zotero.org, and Zotero's own WebDAV settings and
// credentials are neither read for use nor written: the test snapshots them
// only to prove they are untouched.
const ZML = Zotero.MultipleLibraries;
const DAV = { scheme: "http", host: "127.0.0.1:8089", username: "zml", password: "zml-test-password" };
const FAKE_GROUP_ID = 7654321;
let out = {};

try {
	await Zotero.HTTP.request("OPTIONS", `${DAV.scheme}://${DAV.host}/`, { successCodes: [200, 401], errorDelayMax: 0 });
}
catch (e) {
	return { skipped: "WebDAV test server not running: tools/webdav-server.sh start" };
}

const snapshotZoteroWebDAV = async () => ({
	protocol: Zotero.Prefs.get("sync.storage.protocol"),
	url: Zotero.Prefs.get("sync.storage.url"),
	username: Zotero.Prefs.get("sync.storage.username"),
	verified: Zotero.Prefs.get("sync.storage.verified"),
	logins: (await Services.logins.searchLoginsAsync({ origin: "chrome://zotero", httpRealm: "Zotero Storage Server (encrypted)" })).length,
});
const before = await snapshotZoteroWebDAV();

// Zotero only syncs files once an account has synced; a fake local user ID
// satisfies that check without any server contact (throwaway profile only)
if (!Zotero.Users.getCurrentUserID()) {
	await Zotero.Users.setCurrentUserID(1);
}

// Idempotent
for (let l of ZML.Libraries.getAll().filter(l => l.name == "Synced Library")) {
	await ZML.Libraries.erase(l);
}
let existingGroup = Zotero.Groups.get(FAKE_GROUP_ID);
if (existingGroup) {
	await existingGroup.eraseTx();
}

// --- Link a local library to a group -------------------------------------
let lib = await ZML.Libraries.create("Synced Library");
let oldGroupID = lib.groupID;
let item = new Zotero.Item("book");
item.libraryID = lib.libraryID;
item.setField("title", "Synced book");
await item.saveTx();
// A relation from My Library pointing at an item in this library
let pointer = new Zotero.Item("book");
pointer.libraryID = Zotero.Libraries.userLibraryID;
pointer.setField("title", "Pointer");
pointer.addRelation("owl:sameAs", Zotero.URI.getItemURI(item));
await pointer.saveTx();
let oldURI = Zotero.URI.getItemURI(item);

await ZML.Libraries.linkToGroup(lib, FAKE_GROUP_ID);
out.linked = {
	groupID: lib.groupID,
	isLinked: ZML.Libraries.isLinkedLibrary(lib),
	isLocal: ZML.Libraries.isLocalLibrary(lib),
	isManaged: ZML.Libraries.isManagedLibrary(lib),
	newGroupRegistered: Zotero.Groups.exists(FAKE_GROUP_ID) && Zotero.Groups.getLibraryIDFromGroupID(FAKE_GROUP_ID) == lib.libraryID,
	oldGroupGone: !Zotero.Groups.exists(oldGroupID),
	dbGroupID: await Zotero.DB.valueQueryAsync("SELECT groupID FROM groups WHERE libraryID=?", lib.libraryID),
	oldURI,
	newURI: Zotero.URI.getItemURI(item),
	relationInMemory: Zotero.Items.get(pointer.id).getRelations()["owl:sameAs"],
	relationInDB: await Zotero.DB.valueQueryAsync("SELECT object FROM itemRelations WHERE itemID=?", pointer.id),
	syncEnabled: ZML.Libraries.isSyncEnabled(lib),
	skipPref: Zotero.Prefs.get("sync.librariesToSkip"),
	topRows: ZoteroPane.collectionsView._rows.filter(r => r.level == 0).map(r => r.type + ":" + (r.ref && r.ref.name || "")),
	groupsGetAllOutsideRefresh: Zotero.Groups.getAll().map(g => g.name),
};
ZML.Libraries.setSyncEnabled(lib, false);
out.syncToggle = { off: ZML.Libraries.isSyncEnabled(lib), skipPref: Zotero.Prefs.get("sync.librariesToSkip") };
ZML.Libraries.setSyncEnabled(lib, true);
out.syncToggle.on = ZML.Libraries.isSyncEnabled(lib);

// --- Per-library WebDAV ----------------------------------------------------
await ZML.Settings.update(lib.libraryID, (c) => {
	c.fileSync.mode = "webdav";
	c.fileSync.scheme = DAV.scheme;
	c.fileSync.url = DAV.host + "/synced/";
	c.fileSync.username = DAV.username;
});
await ZML.Storage.setPassword(lib.libraryID, DAV.username, DAV.password);
out.modes = {
	mode: Zotero.Sync.Storage.Local.getModeForLibrary(lib.libraryID),
	enabled: Zotero.Sync.Storage.Local.getEnabledForLibrary(lib.libraryID),
	userLibraryMode: Zotero.Sync.Storage.Local.getModeForLibrary(Zotero.Libraries.userLibraryID),
	userLibraryEnabled: Zotero.Sync.Storage.Local.getEnabledForLibrary(Zotero.Libraries.userLibraryID),
};

// The parent folder must exist (Zotero's verifier would otherwise ask, with a
// dialog, to create the "zotero" subfolder; it creates that one itself)
let authBase = `${DAV.scheme}://${encodeURIComponent(DAV.username)}:${encodeURIComponent(DAV.password)}@${DAV.host}`;
await Zotero.HTTP.request("MKCOL", authBase + "/synced/", { successCodes: [201, 405], errorDelayMax: 0 });
await Zotero.HTTP.request("MKCOL", authBase + "/synced/zotero/", { successCodes: [201, 405], errorDelayMax: 0 });

let controller = Zotero.Sync.Runner.getStorageController("webdav", { libraryID: lib.libraryID });
out.controller = {
	boundToLibrary: controller.libraryID == lib.libraryID,
	name: controller.name,
	verifiedBefore: controller.verified,
	sameInstanceOnSecondCall: Zotero.Sync.Runner.getStorageController("webdav", { libraryID: lib.libraryID }) === controller,
	classForLibraryIsOurs: new (Zotero.Sync.Storage.Local.getClassForLibrary(lib.libraryID))({}).libraryID == lib.libraryID,
	mainControllerUntouched: Zotero.Sync.Runner.getStorageController("webdav", {}).libraryID === undefined,
};
await controller.checkServer();
out.verified = {
	after: controller.verified,
	persisted: ZML.Settings.get(lib.libraryID).fileSync.verified,
	rootURI: Zotero.HTTP.getDisplayURI(controller.rootURI, true).spec,
};

// Upload a stored attachment through Zotero's storage engine
let tmp = PathUtils.join(PathUtils.tempDir, "zml-webdav-test.txt");
let content = "file content for WebDAV " + Date.now();
await IOUtils.writeUTF8(tmp, content);
let attachment = await Zotero.Attachments.importFromFile({ file: tmp, libraryID: lib.libraryID, parentItemID: item.id });
let errors = [];
let engine = new Zotero.Sync.Storage.Engine({ libraryID: lib.libraryID, controller, stopOnError: true, onError: e => errors.push(String(e)) });
let uploadResult = await engine.start();
let davDir = PathUtils.join(PathUtils.parent(Zotero.DataDirectory.dir), "webdav", "data", "synced", "zotero");
out.upload = {
	result: uploadResult,
	errors,
	syncState: attachment.attachmentSyncState,
	syncedHash: attachment.attachmentSyncedHash,
	filesOnServer: (await IOUtils.getChildren(davDir)).map(p => PathUtils.filename(p)).sort(),
	expected: [attachment.key + ".prop", attachment.key + ".zip"],
};

// Download round trip: remove the local file, mark it for download, run again
let path = await attachment.getFilePathAsync();
await IOUtils.remove(path);
await Zotero.Sync.Storage.Local.updateSyncStates([attachment], "to_download");
errors = [];
engine = new Zotero.Sync.Storage.Engine({ libraryID: lib.libraryID, controller, stopOnError: true, onError: e => errors.push(String(e)) });
let downloadResult = await engine.start();
out.download = {
	result: downloadResult,
	errors,
	fileRestored: await IOUtils.exists(path),
	contentMatches: (await IOUtils.exists(path)) && (await IOUtils.readUTF8(path)) == content,
	syncState: attachment.attachmentSyncState,
};

// --- Isolation ---------------------------------------------------------------
const after = await snapshotZoteroWebDAV();
out.isolation = {
	zoteroWebDAVUntouched: JSON.stringify(before) == JSON.stringify(after),
	before,
	ourLoginRealm: ZML.Storage.loginRealm(lib.libraryID),
	ourLogins: (await Services.logins.searchLoginsAsync({ origin: "chrome://zotero", httpRealm: ZML.Storage.loginRealm(lib.libraryID) })).map(l => l.username),
};

// Settings survive a reload of the store
await ZML.Settings.load();
out.reloaded = { linked: ZML.Libraries.isLinkedLibrary(lib), fileSync: ZML.Settings.get(lib.libraryID).fileSync };

// Erase cleans up settings and credentials
await ZML.Libraries.erase(lib);
out.erased = {
	libraryGone: !Zotero.Libraries.exists(lib.libraryID),
	settingsGone: !ZML.Settings.has(lib.libraryID),
	loginsGone: (await Services.logins.searchLoginsAsync({ origin: "chrome://zotero", httpRealm: ZML.Storage.loginRealm(lib.libraryID) })).length == 0,
};
await pointer.eraseTx();
return out;
