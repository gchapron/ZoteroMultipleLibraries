// Smoke test: everyday operations inside a local library + dialog flows with
// stubbed prompts (run with tools/zml-exec.sh -f tests/04-operations.js)
const ZML = Zotero.MultipleLibraries;
const view = ZoteroPane.collectionsView;
let out = {};

for (let name of ["Ops Library", "Ops Library (renamed)", "Dialog Library"]) {
	for (let l of ZML.Libraries.getAll().filter(l => l.name == name)) {
		await ZML.Libraries.erase(l);
	}
}
let lib = await ZML.Libraries.create("Ops Library");
await ZML.Tree.selectLibrary(window, lib.libraryID);
await Zotero.Promise.delay(300);
out.tabTitle = window.Zotero_Tabs._tabs.find(t => t.id == "zotero-pane").title;

// New item through the pane (goes to the selected library)
let item = await ZoteroPane.newItem(Zotero.ItemTypes.getID("journalArticle"), { title: "Article in Ops Library" }, null, true);
await Zotero.Promise.delay(500);
out.newItem = { libraryID: item.libraryID, inLib: item.libraryID == lib.libraryID };
await ZoteroPane.itemsView.waitForLoad();
out.itemTreeRows = ZoteroPane.itemsView.rowCount;

// Stored file attachment
let tmpPath = PathUtils.join(PathUtils.tempDir, "zml-test-attachment.txt");
await IOUtils.writeUTF8(tmpPath, "hello from the second library");
let attachment = await Zotero.Attachments.importFromFile({ file: tmpPath, libraryID: lib.libraryID, parentItemID: item.id });
let attPath = await attachment.getFilePathAsync();
out.attachment = { libraryID: attachment.libraryID, fileExists: attPath ? await IOUtils.exists(attPath) : false, inStorage: !!attPath && attPath.includes("/storage/") };

// Move an item from My Library into the local library (the API used for drag and drop)
let userItem = new Zotero.Item("book");
userItem.libraryID = Zotero.Libraries.userLibraryID;
userItem.setField("title", "Moved book");
await userItem.saveTx();
let moved = await userItem.moveToLibrary(lib.libraryID);
out.moved = { newLibraryID: moved.libraryID, originalGone: !Zotero.Items.exists(userItem.id), title: moved.getField("title") };
// And back
let movedBack = await moved.moveToLibrary(Zotero.Libraries.userLibraryID);
out.movedBack = { libraryID: movedBack.libraryID };
await movedBack.eraseTx();

// Dialog flows with stubbed prompts
let origAsk = ZML.UI._askName;
let origConfirm = Zotero.Prompt.confirm;
try {
	ZML.UI._askName = () => "Dialog Library";
	let created = await ZML.UI.newLibrary(window);
	await Zotero.Promise.delay(300);
	out.dialogNew = { name: created && created.name, selected: view.getRow(view.selection.focused).id == "L" + created.libraryID };

	ZML.UI._askName = () => "Ops Library (renamed)";
	await ZML.UI.renameLibrary(window, lib);
	out.dialogRename = Zotero.Libraries.get(lib.libraryID).name;

	Zotero.Prompt.confirm = () => 0;
	await ZML.UI.deleteLibrary(window, created);
	await Zotero.Promise.delay(500);
	out.dialogDelete = { gone: !Zotero.Libraries.exists(created.libraryID), selected: view.getRow(view.selection.focused).id };
}
finally {
	ZML.UI._askName = origAsk;
	Zotero.Prompt.confirm = origConfirm;
}

// Fluent strings used from JS
out.strings = {
	defaultName: ZML.Util.getString("zml-new-library-default-name"),
	deleteText: ZML.Util.getString("zml-delete-library-text", { name: "X", count: 2 }),
	renameText: ZML.Util.getString("zml-rename-library-text", { name: "X" }),
};

// File menu gets "New Library…"
let popup = window.document.getElementById("menu_FilePopup");
popup.dispatchEvent(new window.Event("popupshowing"));
await Zotero.Promise.delay(200);
out.fileMenuHasNewLibrary = !!popup.querySelector('[data-l10n-id="zml-menu-new-library"]');

// Sync shield: a sync restricted to a local library syncs nothing
out.checkLibrariesLocalOnly = await Zotero.Sync.Runner.checkLibraries(null, {}, { access: {} }, [lib.libraryID]);

out.rows = view._rows.map((r, i) => r.level + ":" + r.type + ":" + (r.ref && (r.ref.name || r.ref.label) || ""));
return out;
