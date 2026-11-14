// Smoke test: a newly linked library follows My Library's WebDAV by default
// (tools/webdav-server.sh start) — run with
// tools/zml-exec.sh -f tests/14-default-main-webdav.js
//
// "My Library's WebDAV settings" here are those of the throwaway test profile,
// pointed at the local test server; nothing of the user's is involved.
const ZML = Zotero.MultipleLibraries;
const DAV = { scheme: "http", host: "127.0.0.1:8089", username: "zml", password: "zml-test-password" };
const GROUP_A = 7654341; // linked while My Library uses WebDAV
const GROUP_B = 7654342; // linked while My Library does not
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

let prefsBefore = {};
for (let pref of ["sync.storage.protocol", "sync.storage.scheme", "sync.storage.url", "sync.storage.username"]) {
	prefsBefore[pref] = Zotero.Prefs.get(pref);
}
let Base = Zotero.Sync.Storage.Mode.WebDAV.prototype;
let origGetPassword = Base.getPassword;
Base.getPassword = async function () { return DAV.password; };

async function clean() {
	for (let l of ZML.Libraries.getAll().filter(l => /^Default DAV [AB]$/.test(l.name))) {
		await ZML.Libraries.erase(l);
	}
	for (let id of [GROUP_A, GROUP_B]) {
		let g = Zotero.Groups.get(id);
		if (g) {
			await g.eraseTx();
		}
	}
}

try {
	await clean();
	let authBase = `${DAV.scheme}://${encodeURIComponent(DAV.username)}:${encodeURIComponent(DAV.password)}@${DAV.host}`;
	await Zotero.HTTP.request("MKCOL", authBase + "/main/", { successCodes: [201, 405], errorDelayMax: 0 });

	// A: My Library syncs files over WebDAV
	Zotero.Prefs.set("sync.storage.protocol", "webdav");
	Zotero.Prefs.set("sync.storage.scheme", DAV.scheme);
	Zotero.Prefs.set("sync.storage.url", DAV.host + "/main/");
	Zotero.Prefs.set("sync.storage.username", DAV.username);
	let a = await ZML.Libraries.create("Default DAV A");
	out.beforeLink = { ...ZML.Settings.get(a.libraryID).fileSync };
	await ZML.Libraries.linkToGroup(a, GROUP_A);
	let fsA = ZML.Settings.get(a.libraryID).fileSync;
	out.A = {
		mode: fsA.mode, useMain: fsA.useMain,
		zoteroMode: Zotero.Sync.Storage.Local.getModeForLibrary(a.libraryID),
		displayURL: ZML.Storage.getDisplayRootURL(a.libraryID),
		shared: ZML.Shared.read(a.libraryID),
	};
	// Linking checks the server by itself (which makes the folder)
	for (let i = 0; i < 50 && !ZML.Settings.get(a.libraryID).fileSync.verified; i++) {
		await Zotero.Promise.delay(100);
	}
	out.A.verifiedByItself = !!ZML.Settings.get(a.libraryID).fileSync.verified;
	let controller = ZML.Storage.getController(a.libraryID, {});
	let item = new Zotero.Item("book");
	item.libraryID = a.libraryID;
	item.setField("title", "Default DAV book");
	await item.saveTx();
	let tmp = PathUtils.join(PathUtils.tempDir, "zml-default-dav.txt");
	await IOUtils.writeUTF8(tmp, "default dav file");
	let att = await Zotero.Attachments.importFromFile({ file: tmp, libraryID: a.libraryID, parentItemID: item.id });
	let errors = [];
	let engine = new Zotero.Sync.Storage.Engine({ libraryID: a.libraryID, controller, stopOnError: true, onError: e => errors.push(String(e)) });
	await engine.start();
	out.A.uploadErrors = errors;
	out.A.uploaded = att.attachmentSyncState == Zotero.Sync.Storage.Local.SYNC_STATE_IN_SYNC;
	let probe = await Zotero.HTTP.request("GET", `${authBase}/main/ZoteroMultipleLibraries/${GROUP_A}/zotero/${att.key}.zip`, { successCodes: false, errorDelayMax: 0 });
	out.A.zipOnServerStatus = probe.status;

	// B: My Library does not use WebDAV → Zotero storage, as before
	Zotero.Prefs.set("sync.storage.protocol", "zotero");
	let b = await ZML.Libraries.create("Default DAV B");
	await ZML.Libraries.linkToGroup(b, GROUP_B);
	let fsB = ZML.Settings.get(b.libraryID).fileSync;
	out.B = { mode: fsB.mode, useMain: fsB.useMain };

	out.pass = out.beforeLink.mode == "zotero"
		&& out.A.mode == "webdav" && out.A.useMain === true && out.A.zoteroMode == "webdav"
		&& out.A.shared && out.A.shared.fileSync.mode == "webdav" && out.A.shared.fileSync.useMain === true
		&& out.A.verifiedByItself && out.A.uploaded && out.A.uploadErrors.length == 0 && out.A.zipOnServerStatus == 200
		&& out.B.mode == "zotero" && out.B.useMain === false;
}
finally {
	Base.getPassword = origGetPassword;
	for (let [pref, value] of Object.entries(prefsBefore)) {
		if (value === undefined || value === null) {
			Zotero.Prefs.clear(pref);
		}
		else {
			Zotero.Prefs.set(pref, value);
		}
	}
	await clean();
}
return out;
