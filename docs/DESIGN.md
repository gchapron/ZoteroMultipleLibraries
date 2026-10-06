# Design: multiple libraries in one Zotero

This document records why the plugin works the way it does. All source
references are to Zotero 10.0.4 (the version the plugin was developed and
tested against); the relevant code has been stable since Zotero 7.

## Goal

Have more than one *personal* library in a single Zotero installation, shown
side by side in the collection tree on the left ("My Library", "My second
library", …), each behaving exactly like My Library: its own collections,
saved searches, tags, Duplicate Items, Unfiled Items, Retracted Items, Trash,
notes, attachments, reader, full-text search, drag and drop between libraries.
Later, each extra library should be able to sync on its own (different Zotero
account and/or WebDAV server).

## Approaches that were considered

### 1. Multiple profiles (the approach suggested in the forums / KB)

Zotero's knowledge base (`kb/multiple_profiles`) and the forum thread
*Multiple local libraries* (discussion/104385) suggest creating a second
profile with its own data directory and starting Zotero with `-P` (and
`-no-remote` to run two instances).

What you get: complete separation, including separate sync settings.

What you do not get:

- Both libraries are never visible in the same window. Switching means
  quitting and restarting Zotero (or juggling two instances that cannot
  see each other).
- No drag and drop, copy, or "Add to collection" between the libraries.
- Plugins, preferences, styles, translators, and the word-processor
  integration are all per profile. Word only talks to one instance.
- The browser connector talks to one running instance only.

Verdict: a workaround, not a solution. It does not meet the "seamless, in the
same tree" requirement.

### 2. Group libraries

Group libraries are real separate libraries in the tree, but they must be
created on zotero.org, require an account, sync only through Zotero storage
(no WebDAV), count against the storage quota, do not allow linked files, and
sit under the "Group Libraries" header. Verdict: not local, not private.

### 3. Top-level collections

Collections do not separate tags, duplicates, unfiled items, trash, or sync
scope. Verdict: not a library.

### 4. A new library type (`type = 'local'` in the `libraries` table)

Zotero's data layer is multi-library already: the `libraries` table has a
`type` column and every item, collection, search, tag, and setting carries a
`libraryID`. Adding a new type looks like the cleanest design, but
`Zotero.Libraries.init()` (`xpcom/data/libraries.js`) throws
`Unhandled library type` for anything other than `user`, `group`, and
`feed`, and plugins are only started *after* that
(`Zotero.initComplete()` → `Zotero.Plugins.init()` in `xpcom/zotero.js`).
If the plugin were ever disabled, uninstalled, or blocked by a Zotero update,
Zotero would fail to start. Verdict: unacceptable failure mode.

### 5. A second row of type `user`

`Zotero.Libraries.init()` sets `userLibraryID` to the *last* `user` row it
reads, so a second `user` row would silently turn the new library into
"My Library" (and sync it to the account) when the plugin is not running.
Verdict: unacceptable.

### 6. A separate SQLite database per library

Would require re-implementing the entire data layer (`Zotero.Items`,
`Zotero.Collections`, search, full text, reader, …) which is keyed by
`libraryID` inside one database. Verdict: out of scope and fragile.

### 7. Chosen: a local library is a `group` library that never existed on zotero.org

Zotero already supports several editable, non-user libraries in one database:
group libraries. A group library is a row in `libraries` (`type = 'group'`,
`editable`, `filesEditable`) plus a row in `groups` (`groupID`, `name`,
`description`, `version`). Everything a library needs works per `libraryID`
and is already exercised by groups: collections, searches, tags, trash,
duplicates, unfiled, retracted, virtual collection preferences, the reader,
full-text indexing, import/export, citations, drag and drop, the connector,
and the local API.

The plugin therefore creates an extra library through Zotero's own
`Zotero.Group` class with:

- a **synthetic groupID** in a reserved range starting at `1 000 000 000`
  (zotero.org group IDs are in the low millions after fifteen years), so it
  can never collide with a real group and stays a positive integer (needed
  because `Zotero.URI` parses `groups/(\w+)` for item URIs, relations, and
  word-processor field codes);
- `editable = true`, `filesEditable = true`;
- the user's chosen name stored in `groups.name`.

No schema changes. No new tables. Zotero's integrity check, upgrades, and
backups see an ordinary group library.

While the plugin is running it re-presents these libraries:

- **Collection tree**: the plugin wraps `CollectionTree.prototype.refresh()`.
  While Zotero's own `refresh()` runs, `Zotero.Groups.getAll()` (also wrapped)
  leaves local libraries out, so they never land under "Group Libraries"
  (and that header disappears when no real groups exist). The wrapper then
  inserts each local library as a **level-0 row right after My Library**,
  expanded with Zotero's own `_expandRow`, which adds Duplicate Items,
  Unfiled Items, Retracted Items, and Trash exactly as for My Library.
  Row indentation in Zotero's virtualized table is derived from the parent
  chain, so the rows render like My Library on every platform.
  `getIconName()` returns the plain library icon instead of the group icon,
  and double-click renames the library instead of opening zotero.org.
  Every window loads its own copy of the tree module, so the main window is
  patched on load and a window watcher patches the trees of the Select
  Items, Edit Bibliography, and citation dialogs when they open. Outside a
  patched refresh (local API, an unpatched tree) `Zotero.Groups.getAll()` is
  untouched, so local libraries are never invisible: at worst they appear
  as group libraries.
- **Sync**: `Zotero.Sync.Runner.checkLibraries()` is wrapped to drop local
  libraries from the list of libraries to sync (local groups are also hidden
  from `Zotero.Groups.getAll()` while it runs, so it cannot report them as
  groups the user "is no longer a member of"). In addition every local
  library's `G<groupID>` is written to Zotero's own
  `extensions.zotero.sync.librariesToSkip` preference, which Zotero core
  honours even when the plugin is not loaded: it will neither sync them nor
  show the "You are no longer a member of the group" prompt.
- **Menus**: New Library…, Rename Library…, Delete Library… in the collection
  context menu and New Library… in the File menu, through Zotero's
  `MenuManager` plugin API. The per-library "Sync" context-menu entry is
  hidden for local libraries.

### Behaviour when the plugin is not running

This is the key property of the design. If the plugin is disabled,
uninstalled, or incompatible with a future Zotero version:

- the libraries and all their content remain in the database and in the
  tree, listed under "Group Libraries" with their names, fully editable;
- sync ignores them (skip-list preference) instead of offering to delete
  them;
- nothing else in Zotero changes.

Enabling the plugin again moves them back to the top level.

## Known limitations (inherited from group-library semantics)

- **Linked files** (`linkMode = linked_file`) are refused by Zotero core for
  any non-user library in three places (`Zotero.Item` attachment-path setter
  and `_saveData`, `ZoteroPane.addAttachmentFromDialog`). Extra libraries
  therefore store attachment files inside the Zotero data directory, like
  groups. Linked-file support would need the plugin to lie about the library
  type during saves; it is deliberately not done in the first version.
- Items created while signed in to a Zotero account record the account's
  `createdByUserID` (group semantics). Annotations created under one account
  are read-only if you later sign in with a different account.
- "Recently Read" for extra libraries is stored, as for groups, in the user
  library's synced settings.
- My Publications exists only in My Library.

## Syncing an extra library with the same account

### The constraint

The Zotero server knows two kinds of library per account: the one personal
library (`users/<userID>`) and group libraries (`groups/<groupID>`). There is
no way to attach a second personal library to an account. The only container
the same account offers for an extra library's items is therefore a group,
in practice a private, members-only group the user creates on zotero.org.

### Linking

A local library already *is* a group library with a synthetic ID, so
"linking" it to a zotero.org group is an ID change
(`Libraries.linkToGroup()`):

- `groups.groupID` is updated to the real ID inside a transaction, and every
  relation URI that mentions the old ID (`owl:sameAs` links created by drag
  and drop, related items) is rewritten in `itemRelations` and
  `collectionRelations`, with the in-memory relation registry and loaded
  objects refreshed on commit (the same approach as
  `Zotero.Relations.updateUser()`);
- the `Zotero.Groups` cache is re-registered and the group object's ID
  changed in place; `libraryVersion` and `groups.version` stay 0;
- the plugin records `linked: true` for the library in Zotero's `settings`
  table (`setting = 'multipleLibraries'`, `key = 'L<libraryID>'`), which is
  what makes it "managed" (shown at the top level) now that its ID is no
  longer in the reserved range;
- the group ID is removed from the "libraries to skip" preference.

From here on Zotero's own sync does everything: `checkLibraries()` finds the
group in the account's group list, sees local version 0, downloads the group
metadata (name, permissions), and the data engine uploads the local objects,
which all carry `synced = 0`. The plugin's sync shield only ever excludes
local (synthetic-ID) libraries. Unlinking is not offered: the group ID is
baked into item URIs, and word-processor field codes created before linking
may need a reselect, which the link confirmation says.

### Second computer: adopting

On another computer the group is downloaded by Zotero's sync as an ordinary
group library, content included, so there is nothing to link: "Show as Extra
Library" (`Libraries.adoptGroup()`) only records `linked: true` for that
library in the settings table, which makes it managed (top level, per-library
file syncing). Because Zotero may already have tried to fetch the files from
Zotero storage, found none, and marked the attachments as in sync without a
file, adopting also calls Zotero's `resetAllSyncStates()` for the library so
missing files are fetched once file syncing is set up. "Show under Group
Libraries" (`releaseGroup()`) removes the settings row and the password.
Linking a local library to a group that already contains items is refused and
offers adopting instead.

### Per-library WebDAV files

Zotero chooses a library's file-sync mode in
`Zotero.Sync.Storage.Local.getModeForLibrary()`: WebDAV or Zotero storage for
My Library from one global preference, always Zotero storage for groups. The
sync runner then keeps one controller per mode, built from the global WebDAV
preferences, and the data engine includes a file's `md5`/`mtime` in uploads
only when the library's mode is exactly `'webdav'` (that is how other clients
learn that a file is available on WebDAV).

A linked library's file mode defaults to Zotero storage. The per-library
choice is authoritative: files sync through Zotero storage even when
Zotero's Sync preference for group files is off (an extra library is
presented as a personal library, so that group-wide preference should not
silently disable it); "none" turns file syncing off for that library,
including on-demand downloads.
For a linked library whose file mode is WebDAV the plugin therefore:

- returns `'webdav'` from `getModeForLibrary()` and the library's own
  enabled state from `getEnabledForLibrary()`;
- returns, from `getClassForLibrary()` and from the runner's
  `getStorageController()` (called with `options.libraryID`), a controller
  bound to that library: a subclass of `Zotero.Sync.Storage.Mode.WebDAV`
  whose `verified` flag, username, scheme and URL come from the library's
  settings row, whose password lives in the login manager under the realm
  `ZoteroMultipleLibraries WebDAV L<libraryID>`, and whose `_init()` builds
  the URIs from those values. Everything else (verification, `.prop`/`.zip`
  upload and download, purging) is Zotero's code unchanged.

Zotero's own WebDAV preferences and the "Zotero Storage Server" login
entries are never read for use nor written; the only read is the URL, to
refuse a folder that My Library already syncs to (two libraries in one
`zotero/` folder would collide).

### What was and was not tested

Linking, the tree, the settings pane, and file syncing (verify, upload,
download round trip through `Zotero.Sync.Storage.Engine`) were exercised
against a local Apache WebDAV server (`tools/webdav-server.sh`) in a
throwaway profile with no Zotero account. The data sync of a linked group
against zotero.org is Zotero's unmodified code path and was not run.

## Development notes

- Zotero 7+ bootstrap plugin, plain JavaScript, no build step.
- `tools/test-profile.sh` starts a second Zotero instance with a throwaway
  profile and data directory, with the plugin installed from the source tree,
  so the production library is never touched during development.
- `tools/dev-bridge/` is a tiny development-only plugin that exposes an HTTP
  endpoint for running JavaScript inside that test instance (used by the
  smoke tests in `tests/`). Never install it in a real profile.
- `tools/webdav-server.sh` runs the macOS-bundled Apache with `mod_dav` on
  127.0.0.1 with throwaway credentials for the file-sync test.
