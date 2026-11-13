// Smoke test: where a library's files will go can be seen and chosen before
// it syncs, and the choice survives turning syncing on — run with
// tools/zml-exec.sh -f tests/18-files-before-sync.js
//
// "My Library's WebDAV settings" here are those of the throwaway test profile.
const ZML = Zotero.MultipleLibraries;
const NAMES = ["Files First A", "Files First B", "Files First C"];
const GROUPS = [7654391, 7654392, 7654393];
let out = {};

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
let waitFor = async (fn, ms) => {
	for (let t = 0; t < ms; t += 100) {
		if (fn()) {
			return true;
		}
		await Zotero.Promise.delay(100);
	}
	return fn();
};
let prefsBefore = {};
for (let pref of ["sync.storage.protocol", "sync.storage.scheme", "sync.storage.url", "sync.storage.username"]) {
	prefsBefore[pref] = Zotero.Prefs.get(pref);
}
// Linking checks a WebDAV library's server; keep that quiet here
let origVerify = ZML.Storage.verifyQuietly;
ZML.Storage.verifyQuietly = async () => false;
let prefWin = null;
try {
	await clean();
	if (!Zotero.Users.getCurrentUserID()) {
		await Zotero.Users.setCurrentUserID(1);
	}
	Zotero.Prefs.set("sync.storage.protocol", "webdav");
	Zotero.Prefs.set("sync.storage.scheme", "http");
	Zotero.Prefs.set("sync.storage.url", "127.0.0.1:8089/main/");
	Zotero.Prefs.set("sync.storage.username", "zml");

	let a = await ZML.Libraries.create("Files First A");
	let planned = ZML.Storage.getPlannedFileSync(a.libraryID);
	out.planned = { mode: planned.mode, useMain: planned.useMain, storedMode: ZML.Settings.get(a.libraryID).fileSync.mode };

	ZML.UI.openSettings(window, a);
	for (let i = 0; i < 100 && !prefWin; i++) {
		await Zotero.Promise.delay(100);
		prefWin = Services.wm.getMostRecentWindow("zotero:pref");
	}
	let doc = prefWin.document;
	let $ = id => doc.getElementById(id);
	let shown = (id) => {
		for (let el = $(id); el && el != doc.documentElement; el = el.parentElement) {
			if (el.hidden) {
				return false;
			}
		}
		return true;
	};
	let P = null;
	let select = async (lib) => {
		await waitFor(() => prefWin.ZoteroMultipleLibrariesPrefs && prefWin.ZoteroMultipleLibrariesPrefs._initialized
			&& doc.getElementById("zml-library") && doc.getElementById("zml-library").itemCount > 0, 15000);
		P = prefWin.ZoteroMultipleLibrariesPrefs;
		await P.refreshList();
		await P.selectLibrary(lib.libraryID);
		await Zotero.Promise.delay(200);
	};
	await select(a);

	// Not synced: the files line is there, and so are the settings under More options
	out.local = {
		filesRowShown: shown("zml-files-row"),
		summary: $("zml-files-summary").textContent,
	};
	$("zml-files-change").doCommand();
	out.local.settingsShown = shown("zml-file-settings");
	out.local.mode = $("zml-file-mode").value;
	out.local.source = $("zml-webdav-source").value;
	// My Library's server is not touched before the library has its group
	out.local.verifyShown = shown("zml-verify");
	out.local.folderText = $("zml-webdav-folder").textContent;

	// A. The user picks Zotero storage before syncing: it is kept when syncing starts
	$("zml-file-mode").value = "zotero";
	await P.changeFileMode();
	let fsA = ZML.Settings.get(a.libraryID).fileSync;
	out.choseZotero = { mode: fsA.mode, chosen: fsA.chosen, summary: $("zml-files-summary").textContent };
	out.notPublishedWhileLocal = ZML.Shared.read(a.libraryID) === null;
	await ZML.Libraries.linkToGroup(a, GROUPS[0]);
	fsA = ZML.Settings.get(a.libraryID).fileSync;
	out.afterLinkA = { mode: fsA.mode, useMain: fsA.useMain };

	// B. The user picks a different server before syncing
	let b = await ZML.Libraries.create("Files First B");
	await select(b);
	P.setMoreOpen(true);
	$("zml-webdav-source").value = "custom";
	await P.changeWebDAVSource();
	out.choseCustom = {
		customBoxShown: shown("zml-webdav-custom-box"),
		verifyShown: shown("zml-verify"),
		stored: (({ mode, useMain, chosen }) => ({ mode, useMain, chosen }))(ZML.Settings.get(b.libraryID).fileSync),
	};
	$("zml-scheme").value = "http";
	$("zml-url").value = "127.0.0.1:8089/files-first-b/";
	$("zml-username").value = "zml";
	$("zml-password").value = "zml-test-password";
	await P.saveWebDAVFields();
	await ZML.Libraries.linkToGroup(b, GROUPS[1]);
	let fsB = ZML.Settings.get(b.libraryID).fileSync;
	out.afterLinkB = { mode: fsB.mode, useMain: fsB.useMain, url: fsB.url, password: !!(await ZML.Storage.getPassword(b.libraryID)) };
	out.sharedB = ZML.Shared.read(b.libraryID);

	// C. Nothing chosen: My Library's WebDAV, as before
	let c = await ZML.Libraries.create("Files First C");
	await ZML.Libraries.linkToGroup(c, GROUPS[2]);
	let fsC = ZML.Settings.get(c.libraryID).fileSync;
	out.afterLinkC = { mode: fsC.mode, useMain: fsC.useMain };

	out.pass = out.planned.mode == "webdav" && out.planned.useMain === true && out.planned.storedMode == "zotero"
		&& out.local.filesRowShown && /If you sync it/.test(out.local.summary) && /My Library/.test(out.local.summary)
		&& out.local.settingsShown
		&& out.local.mode == "webdav" && out.local.source == "main" && !out.local.verifyShown
		&& !/1000000/.test(out.local.folderText)
		&& out.choseZotero.mode == "zotero" && out.choseZotero.chosen === true && /Zotero storage/.test(out.choseZotero.summary)
		&& out.notPublishedWhileLocal
		&& out.afterLinkA.mode == "zotero"
		&& out.choseCustom.customBoxShown && out.choseCustom.verifyShown
		&& out.choseCustom.stored.mode == "webdav" && out.choseCustom.stored.useMain === false && out.choseCustom.stored.chosen === true
		&& out.afterLinkB.mode == "webdav" && out.afterLinkB.useMain === false
		&& out.afterLinkB.url == "127.0.0.1:8089/files-first-b/" && out.afterLinkB.password
		&& out.sharedB && out.sharedB.fileSync.url == "127.0.0.1:8089/files-first-b/"
		&& out.afterLinkC.mode == "webdav" && out.afterLinkC.useMain === true;
}
catch (e) {
	out.error = String(e) + "\n" + (e.stack || "").slice(0, 500);
}
finally {
	ZML.Storage.verifyQuietly = origVerify;
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
