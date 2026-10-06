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
zml-prefs-no-libraries = No extra libraries yet. Click New… to create one.

zml-prefs-sync-heading = Syncing
zml-prefs-status-local = This library exists only on this computer. It is not synced and does not count against your Zotero storage.
zml-prefs-status-linked = Synced with your Zotero account as zotero.org group { $groupID }.
zml-prefs-link-explanation = A Zotero account has a single personal library, so an extra library can only sync as a private group of that account. Create a private group at zotero.org/groups/new and sync: the new, empty group then appears in the list below. You can also enter the group’s numeric ID (the number in its web address) directly. On the next sync, everything in this library is uploaded to the group and the library takes the group’s name.
zml-prefs-group-select-label =
    .value = Empty groups on this computer:
zml-prefs-group-select-placeholder = Choose a group…
zml-prefs-group-id-label =
    .value = zotero.org group ID:
zml-prefs-link-button =
    .label = Link to Group
zml-prefs-sync-enabled =
    .label = Sync this library with my Zotero account

zml-prefs-file-heading = File Syncing
zml-prefs-file-sync-unavailable = Attachment files can be synced once the library is linked to a zotero.org group.
zml-prefs-file-mode-label =
    .value = Sync attachment files using:
zml-prefs-file-mode-none =
    .label = Don’t sync files
zml-prefs-file-mode-zotero =
    .label = Zotero storage (as for group libraries)
zml-prefs-zotero-storage-note = Files are synced through Zotero storage, following Zotero’s Sync setting “Sync attachment files in group libraries using Zotero storage” (currently { $state }).
zml-prefs-state-on = on
zml-prefs-state-off = off
zml-prefs-file-mode-webdav =
    .label = WebDAV
zml-prefs-url-label =
    .value = URL:
zml-prefs-username-label =
    .value = Username:
zml-prefs-password-label =
    .value = Password:
zml-prefs-verify-button =
    .label = Verify Server
zml-prefs-verifying = Verifying…
zml-prefs-verified = Server verified.
zml-prefs-not-verified = Not verified yet.
zml-prefs-webdav-note = Use a different folder than the one My Library syncs to: Zotero keeps each library’s files in a “zotero” subfolder of its URL, and two libraries must not share one.

zml-link-confirm-title = Link to zotero.org Group
zml-link-confirm-text =
    Link “{ $name }” to zotero.org group { $groupID }?

    On the next sync, everything in this library is uploaded to that group, and the library takes the group’s name from zotero.org. Items from this library already cited in word-processor documents may need to be reselected once. This cannot be undone from within Zotero.
zml-link-confirm-button = Link
zml-error-group-id-invalid = Enter the numeric ID of a zotero.org group, for example 1234567.
zml-link-confirm-replace = The empty group library “{ $name }” already on this computer is replaced by this library.
zml-error-group-not-empty = Group { $groupID } (“{ $name }”) is already on this computer and contains items, so it cannot be linked. Create a new, empty private group on zotero.org for this library.
zml-error-group-managed = Group { $groupID } is already an extra library.
zml-error-not-local = Only a library that is not yet linked can be linked to a group.
zml-error-url-same-as-main = This is the WebDAV folder My Library syncs to. Use a different folder for this library.
zml-error-url-same-as-other = The library “{ $name }” already syncs to this WebDAV folder. Use a different folder.

## Adopting existing group libraries (second computer)

zml-menu-adopt-group =
    .label = Show as Extra Library
zml-menu-release-group =
    .label = Show under Group Libraries
zml-prefs-adopt-explanation = A group that is an extra library on another computer appears here as an ordinary group library after syncing. Showing it as an extra library moves it to the top level of the tree and lets you set up its file syncing.
zml-prefs-adopt-label =
    .value = Group libraries on this computer:
zml-prefs-adopt-button =
    .label = Show as Extra Library
zml-prefs-release-button =
    .label = Show under Group Libraries
zml-prefs-release-explanation = Makes this an ordinary group library again. Its file syncing settings here are removed; the group and its content are not affected.
zml-adopt-title = Show as Extra Library
zml-adopt-button = Show as Extra Library
zml-adopt-instead-text =
    Group { $groupID } (“{ $groupName }”) already contains items, so “{ $name }” cannot be linked to it.

    If that group is an extra library on another computer, show it as an extra library here instead: it then appears next to My Library with its content, and you can set up its file syncing. “{ $name }” stays as it is.
zml-release-title = Show under Group Libraries
zml-release-button = Show under Group Libraries
zml-release-text =
    Show “{ $name }” under Group Libraries again?

    Its file syncing settings in ZoteroMultipleLibraries are removed. The group and its content are not affected, and you can show it as an extra library again later.
