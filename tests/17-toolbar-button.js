// Smoke test: a "New Library…" button sits just before Zotero's New Collection
// button, and makes a library — run with tools/zml-exec.sh -f tests/17-toolbar-button.js
const ZML = Zotero.MultipleLibraries;
const NAME = "Toolbar Library";
let out = {};
let doc = window.document;
for (let l of ZML.Libraries.getAll().filter(l => l.name == NAME)) {
	await ZML.Libraries.erase(l);
}
let button = doc.getElementById("zml-tb-library-add");
let collectionButton = doc.getElementById("zotero-tb-collection-add");
out.present = !!button;
out.beforeNewCollection = !!button && button.nextElementSibling == collectionButton;
out.onlyOne = doc.querySelectorAll("#zml-tb-library-add").length == 1;
if (button) {
	out.tooltip = button.getAttribute("tooltiptext");
	out.className = button.className;
	out.icon = window.getComputedStyle(button).listStyleImage;
	out.contextProps = window.getComputedStyle(button.querySelector(".toolbarbutton-icon") || button).getPropertyValue("-moz-context-properties");

	// Clicking asks for a name (answered here by a stub) and makes the library
	let original = ZML.UI._askName;
	ZML.UI._askName = () => NAME;
	try {
		button.doCommand();
		out.created = await (async () => {
			for (let i = 0; i < 50; i++) {
				if (ZML.Libraries.getAll().some(l => l.name == NAME)) {
					return true;
				}
				await Zotero.Promise.delay(100);
			}
			return false;
		})();
		let lib = ZML.Libraries.getAll().find(l => l.name == NAME);
		out.selected = !!lib && window.ZoteroPane.getSelectedLibraryID() == lib.libraryID;
	}
	finally {
		ZML.UI._askName = original;
		for (let l of ZML.Libraries.getAll().filter(l => l.name == NAME)) {
			await ZML.Libraries.erase(l);
		}
	}
}
out.pass = out.present && out.beforeNewCollection && out.onlyOne && out.tooltip == "New Library…"
	&& /^url\("chrome:\/\/zotero-multiple-libraries\/content\/add-library\.svg/.test(out.icon) && out.created && out.selected;
return out;
