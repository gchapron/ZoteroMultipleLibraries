# Zotero Multiple Libraries

A Zotero plugin that gives you several personal libraries in one Zotero,
side by side in the collection tree: "My Library", "Personal Reading",
"Teaching", … Each extra library works like My Library: its own collections,
saved searches, tags, Duplicate Items, Unfiled Items, Retracted Items, Trash,
notes, attachments, reader tabs, full-text search, and drag and drop between
libraries.

![Two extra libraries next to My Library](docs/screenshot.png)

## Why not multiple profiles?

Zotero's documented workaround for separate libraries is a second profile with
its own data directory. That means restarting Zotero to switch, no drag and
drop or "Add to Collection" across libraries, and plugins, preferences, Word
integration, and the browser connector all tied to one profile at a time.
Group libraries are the other option, but they must be created on zotero.org,
sync only to Zotero storage, and sit under "Group Libraries".

This plugin instead uses what Zotero already has: its database is
multi-library by design (My Library, groups, feeds). An extra library is an
additional library in that database, local only, shown and managed as a
first-class library. [docs/DESIGN.md](docs/DESIGN.md) explains the choice in
detail, including what was ruled out and why.

## Install

1. Download the `.xpi` from the releases page (or build it with `./build.sh`).
2. In Zotero: Tools → Plugins → gear icon → Install Plugin From File…

Requires Zotero 10 (developed and tested on 10.0.4).

## Use

- **New library**: File → New Library…, or right-click anywhere in the
  collection tree → New Library…
- **Rename**: right-click the library → Rename Library…, or double-click it.
- **Delete**: right-click the library → Delete Library… (asks for
  confirmation; deletes the library, its items, and attachment files stored in
  Zotero).
- Everything else is plain Zotero: create collections and saved searches in
  the library, drag items between libraries, import files into it, save from
  the browser connector while it is selected, cite from it in Word.

Preference (Settings → Advanced → Config Editor):
`extensions.zotero.multipleLibraries.separators` draws a thin line between
libraries in the tree (default: on).

## What happens if the plugin is disabled or removed

Nothing is lost. The extra libraries are ordinary editable libraries in your
Zotero database; without the plugin they are listed under "Group Libraries"
with their names and stay fully usable. The plugin also registers them in
Zotero's own "libraries to skip" sync preference, so Zotero never tries to
sync them or offers to delete them, with or without the plugin. Enable the
plugin again and they return to the top level.

## Sync

Extra libraries are not synced at the moment: they are deliberately kept out
of your Zotero account's sync. Giving each library its own sync settings
(another Zotero account and/or a WebDAV server) is the planned next step; the
design keeps that possible (see the roadmap in `docs/DESIGN.md`).

## Limitations

- Linked files (attachments that point to files outside the Zotero data
  directory) cannot be added to extra libraries, the same restriction Zotero
  applies to group libraries. Stored files work normally.
- My Publications exists only in My Library.
- If you are signed in to a Zotero account, items and annotations you create
  in an extra library record your account's user ID, as in group libraries.

## Development

```bash
tools/test-profile.sh          # start a throwaway Zotero with the plugin (never touches your real library)
tools/zml-exec.sh -f tests/02-tree.js   # run a smoke test inside it
tools/snapshot.sh out.png      # screenshot of the test window
./build.sh                     # build/zotero-multiple-libraries-<version>.xpi
```

The test instance has its own profile and data directory under
`tools/.test/`, runs Zotero's HTTP server on port 23129, and installs the
plugin unpacked from the source tree together with `tools/dev-bridge`, a
development-only plugin that runs JavaScript posted to
`/zml-dev/exec`. Never install the dev bridge in a real profile.

Source layout:

- `bootstrap.js` — plugin lifecycle
- `src/zml.js` — main object, loads the modules below
- `src/libraries.js` — create / rename / delete / list local libraries
- `src/core.js` — keeps local libraries out of the Group Libraries section and out of sync
- `src/tree.js` — shows them at the top level of the collection tree
- `src/ui.js` — menus and dialogs
- `locale/en-US/` — Fluent strings
- `tests/` — smoke tests run through the dev bridge

## License

MIT, see [LICENSE](LICENSE).
