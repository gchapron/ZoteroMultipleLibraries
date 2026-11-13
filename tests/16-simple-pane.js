// Smoke test: the simple settings page — one Sync tick, a waiting state that
// turns into "Synced" by itself, a files line, and the rest folded under
// More options — run with tools/zml-exec.sh -f tests/16-simple-pane.js
//
// "My Library's WebDAV settings" here are those of the throwaway test profile.
const ZML = Zotero.MultipleLibraries;
const GROUP_ID = 7654361;
let out = {};

async function clean() {
	for (let l of ZML.Libraries.getAll().filter(l => l.name == "Simple Pane Library")) {
		await ZML.Libraries.erase(l);
	}
	let g = Zotero.Groups.get(GROUP_ID);
	if (g) {
		await g.eraseTx();
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
let origFetch = ZML.Libraries._fetchGroupInfo;
ZML.Libraries._fetchGroupInfo = async () => ({
	data: { owner: Zotero.Users.getCurrentUserID(), type: "Private" },
	meta: { numItems: 0, created: new Date().toISOString() },
});
if (!Zotero.Users.getCurrentUserID()) {
	await Zotero.Users.setCurrentUserID(1);
}
let prefWin = null;
try {
	await clean();
	Zotero.Prefs.set("sync.storage.protocol", "webdav");
	Zotero.Prefs.set("sync.storage.scheme", "http");
	Zotero.Prefs.set("sync.storage.url", "127.0.0.1:8089/main/");
	Zotero.Prefs.set("sync.storage.username", "zml");

	let lib = await ZML.Libraries.create("Simple Pane Library");
	ZML.UI.openSettings(window, lib);
	for (let i = 0; i < 100 && !prefWin; i++) {
		await Zotero.Promise.delay(100);
		prefWin = Services.wm.getMostRecentWindow("zotero:pref");
	}
	let doc = prefWin.document;
	let $ = id => doc.getElementById(id);
	let shown = id => {
		// Visible: neither it nor an ancestor is hidden
		for (let el = $(id); el && el != doc.documentElement; el = el.parentElement) {
			if (el.hidden) {
				return false;
			}
		}
		return true;
	};
	await waitFor(() => prefWin.ZoteroMultipleLibrariesPrefs && prefWin.ZoteroMultipleLibrariesPrefs._libraryID == lib.libraryID, 10000);
	await Zotero.Promise.delay(300);
	let P = prefWin.ZoteroMultipleLibrariesPrefs;

	out.local = {
		checkboxShown: shown("zml-sync-enabled"),
		checkboxLabel: $("zml-sync-enabled").getAttribute("label"),
		checked: $("zml-sync-enabled").checked,
		status: $("zml-sync-status").textContent,
		pendingShown: shown("zml-pending-box"),
		moreOpen: shown("zml-more-box"),
		moreLabel: $("zml-more-toggle").getAttribute("label"),
		filesRowShown: shown("zml-files-row"),
		files: $("zml-files-summary").textContent,
		stepsGone: !doc.querySelector(".zml-steps"),
	};

	// Tick (as the confirm's "Sync" would): waiting state
	await ZML.Libraries.requestLink(lib);
	await P.render();
	out.pending = {
		checked: $("zml-sync-enabled").checked,
		status: $("zml-sync-status").textContent,
		pendingShown: shown("zml-pending-box"),
		openGroupsLabel: $("zml-open-groups").getAttribute("label"),
		checkNowLabel: $("zml-sync-now").getAttribute("label"),
	};

	// The fold opens and closes
	$("zml-more-toggle").doCommand();
	out.foldOpens = shown("zml-more-box") && shown("zml-link-box");
	$("zml-more-toggle").doCommand();
	out.foldCloses = !shown("zml-more-box");

	// The group made on zotero.org arrives: the page turns to Synced by itself
	let g = new Zotero.Group({ groupID: GROUP_ID, name: "Made on zotero.org", description: "", version: 3, editable: true, filesEditable: true });
	await g.saveTx();
	out.syncedByItself = await waitFor(() => $("zml-sync-status").textContent.startsWith("✓"), 8000);
	out.synced = {
		status: $("zml-sync-status").textContent,
		checked: $("zml-sync-enabled").checked,
		pendingShown: shown("zml-pending-box"),
		filesRowShown: shown("zml-files-row"),
		files: $("zml-files-summary").textContent,
	};

	// Unticking a synced library pauses it
	$("zml-sync-enabled").checked = false;
	$("zml-sync-enabled").doCommand();
	await Zotero.Promise.delay(300);
	out.paused = { enabled: ZML.Libraries.isSyncEnabled(lib), status: $("zml-sync-status").textContent };
	$("zml-sync-enabled").checked = true;
	$("zml-sync-enabled").doCommand();
	await Zotero.Promise.delay(300);
	out.resumed = ZML.Libraries.isSyncEnabled(lib);

	// "Change…" opens the fold at the file settings
	$("zml-files-change").doCommand();
	out.changeOpens = shown("zml-more-box") && shown("zml-file-settings") && shown("zml-release-box");

	out.pass = out.local.checkboxShown && !out.local.checked && out.local.status == "Only on this computer."
		&& !out.local.pendingShown && !out.local.moreOpen && out.local.stepsGone
		&& out.local.filesRowShown && /^If you sync it/.test(out.local.files)
		&& out.pending.checked && out.pending.pendingShown && out.pending.status.startsWith("Waiting")
		&& out.foldOpens && out.foldCloses
		&& out.syncedByItself && out.synced.checked && !out.synced.pendingShown
		&& out.synced.filesRowShown && /My Library/.test(out.synced.files)
		&& out.paused.enabled === false && /^Paused/.test(out.paused.status) && out.resumed
		&& out.changeOpens;
}
catch (e) {
	out.error = String(e) + "\n" + e.stack;
}
finally {
	ZML.Libraries._fetchGroupInfo = origFetch;
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
