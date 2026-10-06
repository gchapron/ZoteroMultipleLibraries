// Smoke test: disable/enable the plugin through the add-on manager
// (run with tools/zml-exec.sh -f tests/03-lifecycle.js)
const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
const ID = "zotero-multiple-libraries@local.zotero.plugins";
const view = ZoteroPane.collectionsView;
const dump = () => view._rows.map((r, i) => i + ":" + r.level + ":" + r.type + ":" + (r.ref && (r.ref.name || r.ref.label) || ""));
let out = {};

let addon = await AddonManager.getAddonByID(ID);
out.addonFound = !!addon;
await addon.disable();
await Zotero.Promise.delay(1500);
out.afterDisable = {
	handle: typeof Zotero.MultipleLibraries,
	groupsGetAll: Zotero.Groups.getAll().map(g => g.name),
	skipPref: Zotero.Prefs.get("sync.librariesToSkip"),
	rows: dump(),
	refreshPatched: Object.getPrototypeOf(view).refresh.toString().includes("_insertLocalLibraries"),
};

await addon.enable();
await Zotero.Promise.delay(2500);
out.afterEnable = {
	handle: typeof Zotero.MultipleLibraries,
	groupsGetAll: Zotero.Groups.getAll().map(g => g.name),
	rows: dump(),
	refreshPatched: Object.getPrototypeOf(view).refresh.toString().includes("_insertLocalLibraries"),
	selected: view.getRow(view.selection.focused).id,
};
return out;
