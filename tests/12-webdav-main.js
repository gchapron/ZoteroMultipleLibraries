// Smoke test: an extra library reusing My Library's WebDAV server and account,
// in a subfolder of its own (tools/webdav-server.sh start) — run with
// tools/zml-exec.sh -f tests/12-webdav-main.js
//
// "My Library's WebDAV settings" here are those of the throwaway test profile,
// pointed at the local test server; nothing of the user's is involved.
const ZML = Zotero.MultipleLibraries;
const DAV = { scheme: "http", host: "127.0.0.1:8089", username: "zml", password: "zml-test-password" };
const GROUP_ID = 7654326;
let out = {};

try {
	await Zotero.HTTP.request("OPTIONS", `${DAV.scheme}://${DAV.host}/`, { successCodes: [200, 401], errorDelayMax: 0 });
}
catch (e) {
	return { skipped: "WebDAV test server not running: tools/webdav-server.sh start" };
}
if (!Zotero.Users.getCurrentUserID()) {
	await Zotero.Users.setCurrentUserID(1);
}

// Point the test profile's My Library at the local server. The password is
// served by a temporary stub of Zotero's own WebDAV password getter so that no
// OS keychain is touched in automation.
let prefsBefore = {};
for (let pref of ["sync.storage.protocol", "sync.storage.scheme", "sync.storage.url", "sync.storage.username"]) {
	prefsBefore[pref] = Zotero.Prefs.get(pref);
}
Zotero.Prefs.set("sync.storage.protocol", "webdav");
Zotero.Prefs.set("sync.storage.scheme", DAV.scheme);
Zotero.Prefs.set("sync.storage.url", DAV.host + "/main/");
Zotero.Prefs.set("sync.storage.username", DAV.username);
let Base = Zotero.Sync.Storage.Mode.WebDAV.prototype;
let origGetPassword = Base.getPassword;
Base.getPassword = async function () { return DAV.password; };

try {
	for (let l of ZML.Libraries.getAll().filter(l => l.name == "Shared DAV Library")) {
		await ZML.Libraries.erase(l);
	}
	let g = Zotero.Groups.get(GROUP_ID);
	if (g) {
		await g.eraseTx();
	}
	let authBase = `${DAV.scheme}://${encodeURIComponent(DAV.username)}:${encodeURIComponent(DAV.password)}@${DAV.host}`;
	await Zotero.HTTP.request("MKCOL", authBase + "/main/", { successCodes: [201, 405], errorDelayMax: 0 });

	let lib = await ZML.Libraries.create("Shared DAV Library");
	await ZML.Libraries.linkToGroup(lib, GROUP_ID);
	await ZML.Settings.update(lib.libraryID, (c) => {
		c.fileSync.mode = "webdav";
		c.fileSync.useMain = true;
	});
	out.mainAvailable = ZML.Storage.mainWebDAVAvailable();
	out.displayURL = ZML.Storage.getDisplayRootURL(lib.libraryID);
	out.mode = Zotero.Sync.Storage.Local.getModeForLibrary(lib.libraryID);

	let controller = ZML.Storage.getController(lib.libraryID, {});
	out.controller = { usesMain: controller.usesMain, username: controller.username, name: controller.name };
	// Verification creates ZoteroMultipleLibraries/<groupID>/zotero/ under the main folder
	await controller.checkServer();
	out.verified = { verified: controller.verified, rootURI: Zotero.HTTP.getDisplayURI(controller.rootURI, true).spec };

	// Round trip through Zotero's storage engine
	let item = new Zotero.Item("book");
	item.libraryID = lib.libraryID;
	item.setField("title", "Shared DAV book");
	await item.saveTx();
	let tmp = PathUtils.join(PathUtils.tempDir, "zml-webdav-main-test.txt");
	let content = "main-server file " + Date.now();
	await IOUtils.writeUTF8(tmp, content);
	let attachment = await Zotero.Attachments.importFromFile({ file: tmp, libraryID: lib.libraryID, parentItemID: item.id });
	let errors = [];
	let engine = new Zotero.Sync.Storage.Engine({ libraryID: lib.libraryID, controller, stopOnError: true, onError: e => errors.push(String(e)) });
	await engine.start();
	let davRoot = PathUtils.join(PathUtils.parent(Zotero.DataDirectory.dir), "webdav", "data", "main");
	let libDir = PathUtils.join(davRoot, ZML.Storage.MAIN_SUBFOLDER, String(GROUP_ID), "zotero");
	out.upload = {
		errors,
		filesInLibraryFolder: (await IOUtils.getChildren(libDir)).map(p => PathUtils.filename(p)).sort(),
		expected: [attachment.key + ".prop", attachment.key + ".zip"],
		mainZoteroFolderUntouched: !(await IOUtils.exists(PathUtils.join(davRoot, "zotero"))),
	};
	let path = await attachment.getFilePathAsync();
	await IOUtils.remove(path);
	await Zotero.Sync.Storage.Local.updateSyncStates([attachment], "to_download");
	errors = [];
	engine = new Zotero.Sync.Storage.Engine({ libraryID: lib.libraryID, controller, stopOnError: true, onError: e => errors.push(String(e)) });
	await engine.start();
	out.download = { errors, restored: await IOUtils.exists(path), contentMatches: (await IOUtils.exists(path)) && (await IOUtils.readUTF8(path)) == content };

	// No copy of the main password is stored under the library's own realm
	out.noPasswordCopy = (await Services.logins.searchLoginsAsync({ origin: "chrome://zotero", httpRealm: ZML.Storage.loginRealm(lib.libraryID) })).length == 0;

	// Releasing a WebDAV-synced library resets its file sync history (local file → to upload)
	await ZML.Libraries.releaseGroup(lib);
	out.released = { managed: ZML.Libraries.isManagedLibrary(lib), attachmentState: attachment.attachmentSyncState, toUploadConstant: Zotero.Sync.Storage.Local.SYNC_STATE_TO_UPLOAD };

	await lib.eraseTx();
}
finally {
	Base.getPassword = origGetPassword;
	for (let pref in prefsBefore) {
		if (prefsBefore[pref] === undefined || prefsBefore[pref] === null) {
			Zotero.Prefs.clear(pref);
		}
		else {
			Zotero.Prefs.set(pref, prefsBefore[pref]);
		}
	}
}
out.mainPrefsRestored = Zotero.Prefs.get("sync.storage.protocol") == (prefsBefore["sync.storage.protocol"] || "zotero");
return out;
