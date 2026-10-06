// Smoke test: the preferences pane opens, lists libraries, and shows the
// right sections — run with tools/zml-exec.sh -f tests/08-prefpane.js
const ZML = Zotero.MultipleLibraries;
let out = {};

for (let l of ZML.Libraries.getAll().filter(l => l.name == "Prefs Library")) {
	await ZML.Libraries.erase(l);
}
let lib = await ZML.Libraries.create("Prefs Library");

// "Library Settings…" path: pref + open preferences at our pane
ZML.UI.openSettings(window, lib);
let prefWin = null;
for (let i = 0; i < 100 && !prefWin; i++) {
	await Zotero.Promise.delay(100);
	prefWin = Services.wm.getMostRecentWindow("zotero:pref");
}
if (!prefWin) {
	return { error: "preferences window did not open" };
}
let doc = prefWin.document;
let ready = false;
for (let i = 0; i < 100 && !ready; i++) {
	await Zotero.Promise.delay(100);
	let menulist = doc.getElementById("zml-library");
	ready = !!menulist && menulist.itemCount > 0 && prefWin.ZoteroMultipleLibrariesPrefs
		&& prefWin.ZoteroMultipleLibrariesPrefs._libraryID == lib.libraryID;
}
await Zotero.Promise.delay(300);
let $ = id => doc.getElementById(id);
out.pane = {
	ready,
	paneID: ZML.prefPaneID,
	selectedPane: prefWin.Zotero_Preferences && prefWin.Zotero_Preferences.navigation.value,
	libraries: Array.from($("zml-library").querySelectorAll("menuitem")).map(i => i.getAttribute("label")),
	selected: $("zml-library").value,
	heading: $("zml-prefs-root").querySelector("h2").textContent,
	status: $("zml-sync-status").textContent,
	linkBoxVisible: !$("zml-link-box").hidden,
	syncCheckboxVisible: !$("zml-sync-enabled").hidden,
	fileUnavailableVisible: !$("zml-file-unavailable").hidden,
	fileSettingsVisible: !$("zml-file-settings").hidden,
	linkButtonLabel: $("zml-link").getAttribute("label"),
	selectPrefCleared: ZML.Util.getPref("selectLibrary"),
};

// Rejected group IDs never get past model validation
out.validation = {};
for (let bad of ["abc", "-5", "1000000005", "0"]) {
	try {
		await ZML.Libraries.linkToGroup(lib, bad);
		out.validation[bad] = "accepted";
	}
	catch (e) {
		out.validation[bad] = e.code;
	}
}

// Deleting from the pane refreshes the list
await ZML.Libraries.erase(lib);
await Zotero.Promise.delay(500);
out.afterDelete = {
	libraries: Array.from($("zml-library").querySelectorAll("menuitem")).map(i => i.getAttribute("label")),
	noLibrariesVisible: !$("zml-no-libraries").hidden,
};
prefWin.close();
return out;
