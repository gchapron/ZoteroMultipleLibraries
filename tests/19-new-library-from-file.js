// Smoke test: "New Library from File…" imports a file into a new library of
// its own — run with tools/zml-exec.sh -f tests/19-new-library-from-file.js
const ZML = Zotero.MultipleLibraries;
const NAMES = ["From File Library", "Should Not Exist"];
let out = {};
async function clean() {
	for (let l of ZML.Libraries.getAll().filter(l => NAMES.includes(l.name))) {
		await ZML.Libraries.erase(l);
	}
}
let ris = PathUtils.join(PathUtils.tempDir, "zml-from-file.ris");
let junk = PathUtils.join(PathUtils.tempDir, "zml-from-file.xyz");
let origAsk = ZML.UI._askName;
let origAlert = ZML.UI._alert;
let asked = [];
let alerts = [];
try {
	await clean();
	await IOUtils.writeUTF8(ris, "TY  - BOOK\nTI  - Imported book one\nAU  - Author, Ann\nPY  - 2020\nKW  - imported-tag\nER  - \n\nTY  - JOUR\nTI  - Imported article two\nER  - \n");
	await IOUtils.writeUTF8(junk, "this is not a bibliography\n\u0000\u0001\u0002");
	ZML.UI._alert = (_w, _title, msg) => alerts.push(msg);
	let before = ZML.Libraries.getAll().length;
	let myLibraryBefore = (await Zotero.Items.getAll(Zotero.Libraries.userLibraryID, true)).length;

	// The menu items exist
	out.menuStrings = ZML.Util.getString("zml-new-library-from-file-title");

	// A file Zotero can import
	ZML.UI._askName = (_w, _t, _text, initial) => {
		asked.push(initial);
		return NAMES[0];
	};
	let lib = await ZML.UI.newLibraryFromFile(window, ris);
	let items = lib ? await Zotero.Items.getAll(lib.libraryID, true) : [];
	out.imported = {
		created: !!lib,
		suggestedName: asked[0],
		titles: items.map(i => i.getField("title")).sort(),
		collections: lib ? Zotero.Collections.getByLibrary(lib.libraryID, true).length : null,
		tags: lib ? (await Zotero.Tags.getAll(lib.libraryID)).map(t => t.tag) : null,
		selected: !!lib && window.ZoteroPane.getSelectedLibraryID() == lib.libraryID,
		myLibraryUntouched: (await Zotero.Items.getAll(Zotero.Libraries.userLibraryID, true)).length == myLibraryBefore,
	};

	// A file Zotero cannot import: nothing is created, and the name is never asked
	asked.length = 0;
	ZML.UI._askName = (_w, _t, _text, initial) => {
		asked.push(initial);
		return NAMES[1];
	};
	let none = await ZML.UI.newLibraryFromFile(window, junk);
	out.unsupported = {
		returned: none,
		asked: asked.length,
		alerts: alerts.length,
		libraries: ZML.Libraries.getAll().length - before,
	};

	// Cancelling at the name: nothing is created
	ZML.UI._askName = () => null;
	let cancelled = await ZML.UI.newLibraryFromFile(window, ris);
	out.cancelled = { returned: cancelled, libraries: ZML.Libraries.getAll().length - before };

	out.pass = out.imported.created && out.imported.suggestedName == "zml-from-file"
		&& out.imported.titles.join("|") == "Imported article two|Imported book one"
		&& out.imported.collections == 0 && out.imported.tags.includes("imported-tag")
		&& out.imported.selected && out.imported.myLibraryUntouched
		&& out.unsupported.returned === null && out.unsupported.asked == 0 && out.unsupported.alerts == 1
		&& out.unsupported.libraries == 1
		&& out.cancelled.returned === null && out.cancelled.libraries == 1;
}
catch (e) {
	out.error = String(e) + "\n" + (e.stack || "").slice(0, 500);
}
finally {
	ZML.UI._askName = origAsk;
	ZML.UI._alert = origAlert;
	await clean();
	await IOUtils.remove(ris, { ignoreAbsent: true });
	await IOUtils.remove(junk, { ignoreAbsent: true });
}
return out;
