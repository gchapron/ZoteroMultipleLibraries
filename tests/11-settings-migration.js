// Smoke test: settings rows written by 0.1.1/0.1.2 (no schema version, file
// mode "none" by default) are migrated to Zotero's normal group file syncing —
// run with tools/zml-exec.sh -f tests/11-settings-migration.js
const ZML = Zotero.MultipleLibraries;
const SETTING = ZML.Settings.SETTING;
let out = {};

let put = (id, value) => Zotero.DB.queryAsync(
	"REPLACE INTO settings (setting, key, value) VALUES (?, ?, ?)", [SETTING, "L" + id, JSON.stringify(value)]
);
// Legacy row: default "none" without a version → becomes "zotero"
await put(999001, { linked: true, fileSync: { mode: "none", scheme: "https", url: "", username: "", verified: false } });
// Current row: explicit "none" with a version → stays "none"
await put(999002, { version: ZML.Settings.SCHEMA_VERSION, linked: true, fileSync: { mode: "none" } });
// Legacy row with WebDAV → untouched apart from the version
await put(999003, { linked: true, fileSync: { mode: "webdav", scheme: "http", url: "example.invalid/x/", username: "u", verified: true } });

await ZML.Settings.load();
let stored = async id => JSON.parse(await Zotero.DB.valueQueryAsync(
	"SELECT value FROM settings WHERE setting=? AND key=?", [SETTING, "L" + id]
));
out.legacyNone = { mode: ZML.Settings.get(999001).fileSync.mode, version: ZML.Settings.get(999001).version, persistedMode: (await stored(999001)).fileSync.mode, persistedVersion: (await stored(999001)).version };
out.explicitNone = { mode: ZML.Settings.get(999002).fileSync.mode, version: ZML.Settings.get(999002).version };
out.legacyWebdav = { mode: ZML.Settings.get(999003).fileSync.mode, url: ZML.Settings.get(999003).fileSync.url, verified: ZML.Settings.get(999003).fileSync.verified, persistedVersion: (await stored(999003)).version };
out.defaults = ZML.Settings.defaults();

for (let id of [999001, 999002, 999003]) {
	await ZML.Settings.remove(id);
}
await ZML.Settings.load();
out.cleanedUp = ![999001, 999002, 999003].some(id => ZML.Settings.has(id));
return out;
