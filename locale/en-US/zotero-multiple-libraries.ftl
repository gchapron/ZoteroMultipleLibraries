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
zml-prefs-link-explanation = A Zotero account has a single personal library, so an extra library can only sync as a private group of that account. Create a private group at zotero.org/groups/new, then enter its numeric ID (the number in the group’s web address). On the next sync, everything in this library is uploaded to the group and the library takes the group’s name.
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
    .label = Zotero storage
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
zml-error-group-exists = Group { $groupID } is already on this computer as a group library.
zml-error-not-local = Only a library that is not yet linked can be linked to a group.
zml-error-url-same-as-main = This is the WebDAV folder My Library syncs to. Use a different folder for this library.
zml-error-url-same-as-other = The library “{ $name }” already syncs to this WebDAV folder. Use a different folder.
