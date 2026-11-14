// Smoke test: steps in Zotero that must not break or empty a library whose
// files are on WebDAV (tools/webdav-server.sh start) — run with
// tools/zml-exec.sh -f tests/20-webdav-safety.js
//
// A. Zotero's purge of "orphaned" server files leaves the library's files alone
// B. File editing turned off for the group never leads to local files being deleted
// C. My Library's WebDAV folder changes: libraries sharing that server follow it
// D. The group disappears from zotero.org: the library says so
// E. Files are fetched by My Library's download setting, not the groups one
// F. A password left under a reused library ID is not sent to another server
//
// "My Library's WebDAV settings" here are those of the throwaway test profile.
const ZML = Zotero.MultipleLibraries;
const Local = Zotero.Sync.Storage.Local;
const DAV = { scheme: "http", host: "127.0.0.1:8089", username: "zml", password: "zml-test-password" };
const NAMES = ["Safety Own", "Safety Shared"];
const GROUPS = [7654411, 7654412];
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
async function clean() {
	for (let l of ZML.Libraries.getAll().filter(l => NAMES.includes(l.name))) {
		await ZML.Libraries.erase(l);
	}
	for (let id of GROUPS) {
		let g = Zotero.Groups.get(id);
		if (g) {
			await g.eraseTx();
		}
	}
}
const PREFS = ["sync.storage.protocol", "sync.storage.scheme", "sync.storage.url", "sync.storage.username",
	"lastWebDAVOrphanPurge", "sync.storage.downloadMode.personal", "sync.storage.downloadMode.groups"];
let prefsBefore = {};
for (let pref of PREFS) {
	prefsBefore[pref] = Zotero.Prefs.get(pref);
}
let Base = Zotero.Sync.Storage.Mode.WebDAV.prototype;
let origGetPassword = Base.getPassword;
let Utilities = Zotero.Sync.Storage.Utilities;
let origPrompt = Utilities.showFileWriteAccessLostPrompt;
let origNotify = ZML.Libraries._notifyGroupMissing;
let prefWin = null;
let auth = `${DAV.scheme}://${DAV.username}:${DAV.password}@${DAV.host}`;
let mkcol = path => Zotero.HTTP.request("MKCOL", auth + path, { successCodes: [201, 405], errorDelayMax: 0 });
let serverDir = (...parts) => PathUtils.join(PathUtils.parent(Zotero.DataDirectory.dir), "webdav", "data", ...parts);
let list = async dir => (await IOUtils.exists(dir)) ? (await IOUtils.getChildren(dir)).map(p => PathUtils.filename(p)).sort() : null;
let addFile = async (lib, name) => {
	let item = new Zotero.Item("book");
	item.libraryID = lib.libraryID;
	item.setField("title", name);
	await item.saveTx();
	let tmp = PathUtils.join(PathUtils.tempDir, "zml-safety-" + name + ".txt");
	await IOUtils.writeUTF8(tmp, "content of " + name);
	return Zotero.Attachments.importFromFile({ file: tmp, libraryID: lib.libraryID, parentItemID: item.id });
};
let fileSync = async (lib) => {
	let errors = [];
	let controller = Zotero.Sync.Runner.getStorageController("webdav", { libraryID: lib.libraryID });
	await new Zotero.Sync.Storage.Engine({ libraryID: lib.libraryID, controller, stopOnError: true, onError: e => errors.push(String(e)) }).start();
	return errors;
};

try {
	await clean();

	// ---------------------------------------------------------------- A
	let own = await ZML.Libraries.create(NAMES[0]);
	await ZML.Libraries.linkToGroup(own, GROUPS[0]);
	await ZML.Settings.update(own.libraryID, (c) => {
		c.fileSync.mode = "webdav";
		c.fileSync.useMain = false;
		c.fileSync.scheme = DAV.scheme;
		c.fileSync.url = DAV.host + "/safety-own/";
		c.fileSync.username = DAV.username;
	});
	await ZML.Storage.setPassword(own.libraryID, DAV.username, DAV.password);
	ZML.Storage.resetController(own.libraryID);
	await mkcol("/safety-own/");
	await mkcol("/safety-own/zotero/");
	let attA = await addFile(own, "A");
	let errorsA = await fileSync(own);
	let ownDir = serverDir("safety-own", "zotero");
	let uploaded = await list(ownDir);
	// On the server for ten days; My Library and this library synced just now;
	// no purge has run lately
	let tenDaysAgo = Date.now() - 10 * 24 * 3600 * 1000;
	for (let p of await IOUtils.getChildren(ownDir)) {
		await IOUtils.setModificationTime(p, tenDaysAgo);
	}
	for (let l of [Zotero.Libraries.userLibrary, own]) {
		l.updateLastSyncTime();
		await l.saveTx();
	}
	Zotero.Prefs.clear("lastWebDAVOrphanPurge");
	let controllerA = Zotero.Sync.Runner.getStorageController("webdav", { libraryID: own.libraryID });
	let purgeResult = await controllerA.purgeOrphanedStorageFiles(own.libraryID);
	// …and through a whole file sync, which is where Zotero calls it
	let errorsA2 = await fileSync(own);
	out.A = {
		uploadErrors: errorsA.concat(errorsA2),
		uploaded,
		purgeResult,
		afterPurge: await list(ownDir),
		purgePrefUntouched: Zotero.Prefs.get("lastWebDAVOrphanPurge") === undefined,
	};
	// A deleted item's files are still removed from the server
	let keyA = attA.key;
	await attA.eraseTx();
	await fileSync(own);
	out.A.afterItemDeleted = await list(ownDir);
	out.A.pass = out.A.uploadErrors.length == 0 && uploaded.length == 2 && purgeResult === false
		&& out.A.afterPurge.join() == uploaded.join() && out.A.purgePrefUntouched
		&& !out.A.afterItemDeleted.some(f => f.startsWith(keyA));

	// ---------------------------------------------------------------- B
	let attB = await addFile(own, "B"); // waiting for upload
	let prompts = 0;
	Utilities.showFileWriteAccessLostPrompt = () => {
		prompts++;
		return 0; // "Reset Group Files and Sync"
	};
	let keepGoing = await Zotero.Sync.Data.Local.checkLibraryForAccess(null, own.libraryID, true, false);
	out.B = {
		keepGoing,
		prompts,
		fileStillThere: await attB.fileExists(),
		itemStillThere: !!(await Zotero.Items.getByLibraryAndKeyAsync(own.libraryID, attB.key)),
	};
	// The settings pane says why nothing uploads
	own.filesEditable = false;
	await own.saveTx();
	ZML.UI.openSettings(window, own);
	for (let i = 0; i < 100 && !prefWin; i++) {
		await Zotero.Promise.delay(100);
		prefWin = Services.wm.getMostRecentWindow("zotero:pref");
	}
	for (let i = 0; i < 100; i++) {
		await Zotero.Promise.delay(100);
		let P = prefWin.ZoteroMultipleLibrariesPrefs;
		if (P && P._libraryID == own.libraryID && prefWin.document.getElementById("zml-file-not-editable")) {
			break;
		}
	}
	await Zotero.Promise.delay(400);
	out.B.warningShown = !prefWin.document.getElementById("zml-file-not-editable").hidden;
	own.filesEditable = true;
	await own.saveTx();
	out.B.pass = keepGoing === true && prompts == 0 && out.B.fileStillThere && out.B.itemStillThere && out.B.warningShown;

	// ---------------------------------------------------------------- F
	let pwBefore = await ZML.Storage.getPassword(own.libraryID);
	await ZML.Settings.update(own.libraryID, (c) => {
		c.fileSync.username = "someone-else";
	});
	let pwOtherUser = await ZML.Storage.getPassword(own.libraryID);
	await ZML.Settings.update(own.libraryID, (c) => {
		c.fileSync.username = DAV.username;
	});
	out.F = { before: !!pwBefore, otherUsername: pwOtherUser, pass: !!pwBefore && pwOtherUser === "" };

	// ---------------------------------------------------------------- E
	Zotero.Prefs.set("sync.storage.downloadMode.personal", "on-sync");
	Zotero.Prefs.set("sync.storage.downloadMode.groups", "on-demand");
	out.E = { onSync: Local.downloadOnSync(own.libraryID), asNeeded: Local.downloadAsNeeded(own.libraryID) };
	Zotero.Prefs.set("sync.storage.downloadMode.personal", "on-demand");
	Zotero.Prefs.set("sync.storage.downloadMode.groups", "on-sync");
	out.E.onSyncSwapped = Local.downloadOnSync(own.libraryID);
	out.E.pass = out.E.onSync === true && out.E.asNeeded === false && out.E.onSyncSwapped === false;

	// ---------------------------------------------------------------- C
	Zotero.Prefs.set("sync.storage.protocol", "webdav");
	Zotero.Prefs.set("sync.storage.scheme", DAV.scheme);
	Zotero.Prefs.set("sync.storage.url", DAV.host + "/safety-main-a");
	Zotero.Prefs.set("sync.storage.username", DAV.username);
	Base.getPassword = async function () {
		return DAV.password;
	};
	await mkcol("/safety-main-a/");
	await mkcol("/safety-main-b/");
	let shared = await ZML.Libraries.create(NAMES[1]);
	await ZML.Libraries.linkToGroup(shared, GROUPS[1]);
	await ZML.Settings.update(shared.libraryID, (c) => {
		c.fileSync.mode = "webdav";
		c.fileSync.useMain = true;
		c.fileSync.verified = false;
	});
	ZML.Storage.resetController(shared.libraryID);
	let attC = await addFile(shared, "C");
	let errorsC = await fileSync(shared);
	let dirA = serverDir("safety-main-a", ZML.Storage.MAIN_SUBFOLDER, String(GROUPS[1]), "zotero");
	let dirB = serverDir("safety-main-b", ZML.Storage.MAIN_SUBFOLDER, String(GROUPS[1]), "zotero");
	let fsC = () => ZML.Settings.get(shared.libraryID).fileSync;
	out.C = {
		errors: errorsC,
		inA: await list(dirA),
		verified: fsC().verified,
		recorded: fsC().mainLocation,
		inSync: attC.attachmentSyncState == Local.SYNC_STATE_IN_SYNC,
	};
	let controllerBefore = ZML.Storage.getController(shared.libraryID, {});
	// The user points My Library at another folder (pref observers do the rest)
	Zotero.Prefs.set("sync.storage.url", DAV.host + "/safety-main-b");
	for (let i = 0; i < 50 && fsC().verified; i++) {
		await Zotero.Promise.delay(100);
	}
	out.C.afterChange = {
		verified: fsC().verified,
		toUpload: attC.attachmentSyncState == Local.SYNC_STATE_TO_UPLOAD,
		newController: ZML.Storage.getController(shared.libraryID, {}) !== controllerBefore,
	};
	let errorsC2 = await fileSync(shared);
	out.C.afterSync = { errors: errorsC2, inB: await list(dirB), verified: fsC().verified, recorded: fsC().mainLocation };
	// A password-only change reaches Zotero as a controller reset
	ZML.Storage.getController(shared.libraryID, {});
	Zotero.Sync.Runner.resetStorageController("webdav");
	out.C.controllerDroppedOnReset = !ZML.Storage._controllers.has(shared.libraryID);
	out.C.pass = errorsC.length == 0 && out.C.inA && out.C.inA.includes(attC.key + ".zip") && out.C.verified && out.C.inSync
		&& out.C.recorded.endsWith("/safety-main-a")
		&& out.C.afterChange.verified === false && out.C.afterChange.toUpload && out.C.afterChange.newController
		&& errorsC2.length == 0 && out.C.afterSync.inB && out.C.afterSync.inB.includes(attC.key + ".zip")
		&& out.C.afterSync.verified && out.C.afterSync.recorded.endsWith("/safety-main-b")
		&& out.C.controllerDroppedOnReset;

	// ---------------------------------------------------------------- D
	let notified = [];
	ZML.Libraries._notifyGroupMissing = library => notified.push(library.name);
	let realGroups = () => Zotero.Groups.getAll().filter(g => !ZML.Libraries.isLocalLibrary(g));
	let remoteWithout = (groupID) => {
		let versions = {};
		for (let g of realGroups()) {
			if (g.groupID != groupID) {
				versions[g.groupID] = g.version;
			}
		}
		return versions;
	};
	let keyInfo = { userID: Zotero.Users.getCurrentUserID(), access: { user: { library: true, files: true }, groups: { all: { library: true, write: true } } } };
	// Built beforehand: during the check the plugin hides its groups from Zotero.Groups.getAll()
	let withoutOwn = remoteWithout(GROUPS[0]);
	let withAll = remoteWithout(-1);
	let getGroupVersions = async () => withoutOwn;
	let client = { getGroupVersions };
	let result = await Zotero.Sync.Runner.checkLibraries(client, {}, keyInfo, []);
	out.D = {
		missingFlag: ZML.Settings.get(own.libraryID).groupMissing,
		otherNotFlagged: !ZML.Settings.get(shared.libraryID).groupMissing,
		notified: notified.slice(),
		notInSyncList: !result.includes(own.libraryID),
		clientRestored: client.getGroupVersions === getGroupVersions,
	};
	let P = prefWin.ZoteroMultipleLibrariesPrefs;
	await P.selectLibrary(own.libraryID);
	out.D.status = prefWin.document.getElementById("zml-sync-status").textContent;
	// Listed again (e.g. the user was re-added): back to normal, no second notice
	client = { getGroupVersions: async () => withAll };
	await Zotero.Sync.Runner.checkLibraries(client, {}, keyInfo, []);
	out.D.clearedWhenListed = ZML.Settings.get(own.libraryID).groupMissing === false;
	out.D.pass = out.D.missingFlag === true && out.D.otherNotFlagged && out.D.notified.join() == NAMES[0]
		&& out.D.notInSyncList && out.D.clientRestored && /^Not syncing/.test(out.D.status)
		&& out.D.clearedWhenListed && notified.length == 1;

	out.pass = ["A", "B", "C", "D", "E", "F"].every(k => out[k] && out[k].pass);
}
catch (e) {
	out.error = String(e) + "\n" + (e.stack || "").slice(0, 600);
}
finally {
	Base.getPassword = origGetPassword;
	Utilities.showFileWriteAccessLostPrompt = origPrompt;
	ZML.Libraries._notifyGroupMissing = origNotify;
	if (prefWin) {
		prefWin.close();
	}
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
