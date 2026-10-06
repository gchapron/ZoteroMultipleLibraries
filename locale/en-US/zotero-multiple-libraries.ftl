## ZoteroMultipleLibraries — English (US)
## Message IDs are prefixed with "zml-" to avoid clashes with Zotero's own strings.

zml-plugin-name = ZoteroMultipleLibraries

## Menus

zml-menu-new-library =
    .label = New Library…
zml-menu-rename-library =
    .label = Rename Library…
zml-menu-delete-library =
    .label = Delete Library…

## Dialogs

zml-new-library-title = New Library
zml-new-library-text = Name of the new library:
zml-new-library-default-name = My Second Library

zml-rename-library-title = Rename Library
zml-rename-library-text = New name for “{ $name }”:

zml-delete-library-title = Delete Library
zml-delete-library-text =
    Delete the library “{ $name }” and everything in it?

    { $count ->
        [0] It contains no items.
        [one] It contains { $count } item.
       *[other] It contains { $count } items.
    } Items, collections, saved searches, notes, and attachment files stored in Zotero will be deleted permanently. This cannot be undone.
zml-delete-library-button = Delete Library

zml-error-name-empty = The library name cannot be empty.
zml-error-name-exists = A library named “{ $name }” already exists.

zml-menu-library-settings =
    .label = Library Settings…

zml-delete-linked-library-text =
    Remove the library “{ $name }” from this computer?

    { $count ->
        [0] It contains no items.
        [one] It contains { $count } item.
       *[other] It contains { $count } items.
    } Its local copy, including attachment files stored in Zotero, is deleted. The zotero.org group it is linked to is not deleted: unless you leave the group, Zotero downloads it again as an ordinary group library at the next sync.

## Preferences pane

zml-prefpane-label = ZoteroMultipleLibraries

zml-prefs-libraries-heading = Libraries
zml-prefs-library-label =
    .value = Library:
zml-prefs-new-button =
    .label = New…
zml-prefs-rename-button =
    .label = Rename…
zml-prefs-delete-button =
    .label = Delete…
zml-prefs-no-libraries = No extra libraries yet.
zml-prefs-new-explanation = New… creates an extra library on this computer. It stays private to this computer until you enable syncing below.
zml-prefs-adopt-label =
    .value = Group library:
zml-prefs-adopt-button =
    .label = Show as Extra Library
zml-prefs-adopt-explanation = Or turn one of your group libraries into an extra library: it moves to the top level of the tree and gets its own file syncing settings. This is also how a library that is already synced on another computer is set up here.

zml-prefs-sync-heading = Syncing “{ $name }”
zml-prefs-status-local = Not synced: this library exists only on this computer and does not count against your Zotero storage.
zml-prefs-status-linked = Synced with your Zotero account as zotero.org group { $groupID }.
zml-prefs-link-explanation = A Zotero account has a single personal library, so an extra library is synced as a private group of your account (only you are a member). Three steps:
zml-prefs-step1 =
    .value = 1. Create a private group on zotero.org
zml-prefs-open-groups-button =
    .label = Open zotero.org…
zml-prefs-step2 =
    .value = 2. Sync, so that the new group appears here
zml-prefs-sync-now-button =
    .label = Sync Now
zml-prefs-sync-now-running = Syncing…
zml-prefs-sync-now-done =
    { $count ->
        [0] Done. No empty group library found yet; it can take a moment to appear after creating it on zotero.org.
        [one] Done. { $count } empty group library found.
       *[other] Done. { $count } empty group libraries found.
    }
zml-prefs-step3 =
    .value = 3. Choose that group:
zml-prefs-group-select-placeholder = Choose a group…
zml-prefs-no-group-yet = No empty group library on this computer yet.
zml-prefs-group-id-label =
    .value = or enter its numeric ID (the number in its web address):
zml-prefs-enable-sync-button =
    .label = Enable Syncing
zml-prefs-sync-enabled =
    .label = Sync this library with my Zotero account (uncheck to pause)
zml-prefs-release-button =
    .label = Show under Group Libraries…
zml-prefs-release-explanation = Turns it back into an ordinary group library.

zml-prefs-file-heading = Files of “{ $name }”
zml-prefs-file-sync-unavailable = Attachment files can be synced once syncing is enabled for this library.
zml-prefs-file-deliberate = No file syncing choice has been made for this library on this computer, and none was found from your other computers. Choose below; the choice must be the same on every computer that syncs this library, and it is shared with them from now on.
zml-prefs-shared-note = The file syncing choice (including a WebDAV server’s address and username, never its password) is stored in the group’s settings on zotero.org, so that your other computers use the same.
zml-prefs-password-required = Password required on this computer: the settings came from another computer, and passwords are never shared.
zml-prefs-file-mode-zotero =
    .label = Zotero storage
zml-prefs-zotero-storage-note = Files are synced through Zotero storage, whatever Zotero’s Sync setting for group libraries says. They count against the storage quota of the group’s owner (you).
zml-prefs-zotero-storage-note-inactive = Files will be synced through Zotero storage once this Zotero is signed in to a Zotero account and has synced.
zml-prefs-file-mode-webdav =
    .label = WebDAV
zml-prefs-webdav-main =
    .label = Use My Library’s WebDAV server and account
zml-prefs-webdav-main-unavailable = My Library does not sync its files to a WebDAV server (see Settings → Sync).
zml-prefs-webdav-custom =
    .label = Use a different server:
zml-prefs-url-label =
    .value = URL:
zml-prefs-username-label =
    .value = Username:
zml-prefs-password-label =
    .value = Password:
zml-prefs-webdav-folder = Files go to { $url }
zml-prefs-webdav-folder-unknown = Each library needs a folder of its own; Zotero keeps the files in a “zotero” subfolder of the URL.
zml-prefs-verify-button =
    .label = Verify Server
zml-prefs-verifying = Verifying…
zml-prefs-verified = Server verified.
zml-prefs-not-verified = Not verified yet.
zml-prefs-file-mode-none =
    .label = Don’t sync files

## Dialogs of the pane and menus

zml-link-confirm-title = Enable Syncing
zml-link-confirm-text =
    Sync “{ $name }” with your Zotero account as zotero.org group { $groupID }?

    On the next sync, everything in this library is uploaded to that group, and the library takes the group’s name from zotero.org. Items from this library already cited in word-processor documents may need to be reselected once. This cannot be undone from within Zotero.
zml-link-confirm-replace = The empty group library “{ $name }” already on this computer is replaced by this library.
zml-link-confirm-button = Enable Syncing
zml-error-group-id-invalid = Enter the numeric ID of a zotero.org group, for example 1234567, or choose a group from the list.
zml-error-group-not-empty = Group { $groupID } (“{ $name }”) is already on this computer and contains items, so it cannot be linked. Create a new, empty private group on zotero.org for this library.
zml-error-group-managed = Group { $groupID } is already an extra library.
zml-error-not-local = Only a library that is not yet synced can be linked to a group.
zml-error-url-same-as-main = This is the WebDAV folder My Library syncs to. Choose “Use My Library’s WebDAV server and account” instead, which keeps this library’s files in a folder of their own.
zml-error-url-same-as-other = The library “{ $name }” already syncs to this WebDAV folder. Use a different folder.

## Adopting existing group libraries

zml-menu-adopt-group =
    .label = Show as Extra Library
zml-menu-release-group =
    .label = Show under Group Libraries
zml-adopt-title = Show as Extra Library
zml-adopt-button = Show as Extra Library
zml-adopt-instead-text =
    Group { $groupID } (“{ $groupName }”) already contains items, so “{ $name }” cannot be linked to it.

    If that group is an extra library on another computer, show it as an extra library here instead: it then appears next to My Library with its content, and you can set up its file syncing. “{ $name }” stays as it is.
zml-release-title = Show under Group Libraries
zml-release-button = Show under Group Libraries
zml-release-text =
    Show “{ $name }” under Group Libraries again?

    It becomes an ordinary group library. Its files then follow Zotero’s rule for group libraries (Zotero storage, if enabled in Settings → Sync): files already on this computer are kept and marked for upload there; files that exist only on a WebDAV server are not transferred. The group and its content on zotero.org are not affected, and you can show it as an extra library again later.
