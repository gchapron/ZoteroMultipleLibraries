## ZoteroMultipleLibraries — English (US)
## Message IDs are prefixed with "zml-" to avoid clashes with Zotero's own strings.

zml-plugin-name = ZoteroMultipleLibraries

## Menus

zml-menu-new-library =
    .label = New Library…
zml-menu-new-library-from-file =
    .label = New Library from File…
zml-menu-rename-library =
    .label = Rename Library…
zml-menu-delete-library =
    .label = Delete Library…

## Dialogs

zml-new-library-title = New Library
zml-new-library-text = Name of the new library:
zml-new-library-default-name = My Second Library

zml-new-library-from-file-title = New Library from File
zml-new-library-from-file-unsupported = Zotero can’t read this file as a bibliography, so no library was made. To bring in a library from another app, use File → Import….
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

zml-tb-new-library = New Library…
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
zml-prefs-no-libraries = No libraries yet besides My Library.
zml-prefs-new-explanation = New… makes a library on this computer. Tick “Sync with my other computers” to have it everywhere.

zml-prefs-sync-heading = “{ $name }”
zml-prefs-sync-enabled =
    .label = Sync with my other computers
zml-prefs-status-local = Only on this computer.
zml-prefs-status-pending = Waiting for the new group…
zml-prefs-status-ambiguous = Zotero isn’t sure which group to use: choose it under More options.
zml-prefs-status-existing = Waiting for the new group… If you made it before ticking, choose it under More options.
zml-prefs-status-linked = ✓ Synced with your Zotero account (group { $groupID }).
zml-prefs-status-group-missing = Not syncing: zotero.org no longer lists group { $groupID } for your account (it was deleted, or you are no longer a member). The library and its files are still on this computer.
zml-group-missing-headline = Library No Longer Syncing
zml-group-missing-text = “{ $name }” is no longer syncing: its group was not found on zotero.org. Nothing on this computer was removed.
zml-prefs-status-paused = Paused: not syncing for now (group { $groupID }). Tick to resume.
zml-prefs-pending-text = Zotero keeps each synced library in a private group of your Zotero account. Make one on zotero.org (any name, “Private”), then come back: Zotero finds it and connects it by itself.
zml-prefs-open-groups-button =
    .label = Make the Group on zotero.org…
zml-prefs-sync-now-button =
    .label = Check Now
zml-prefs-sync-now-running = Checking…
zml-prefs-check-not-yet = Not there yet. It can take a moment after making the group.
zml-prefs-files-main =
    { $state ->
        [local] If you sync it, files go to the same place as My Library (WebDAV).
        [pending] Files will go to the same place as My Library (WebDAV).
       *[synced] Files: same place as My Library (WebDAV)
    }
zml-prefs-files-custom =
    { $state ->
        [local] If you sync it, files go to your own WebDAV server.
        [pending] Files will go to your own WebDAV server.
       *[synced] Files: your own WebDAV server
    }
zml-prefs-files-zotero =
    { $state ->
        [local] If you sync it, files go to Zotero storage.
        [pending] Files will go to Zotero storage.
       *[synced] Files: Zotero storage
    }
zml-prefs-files-none =
    { $state ->
        [local] If you sync it, its files stay on this computer.
        [pending] Files will stay on this computer.
       *[synced] Files: not synced
    }
zml-prefs-files-unset = Files: choose where they go
zml-prefs-files-change-button =
    .label = Change…
zml-prefs-more-closed = More options ▸
zml-prefs-more-open = More options ▾

zml-prefs-link-heading = Use a group by number
zml-prefs-link-explanation = Choose an empty group of your Zotero account, or type its number (the number in its web address).
zml-prefs-group-select-placeholder = Choose a group…
zml-prefs-no-group-yet = No empty group on this computer yet.
zml-prefs-group-id-label =
    .value = Group number:
zml-prefs-enable-sync-button =
    .label = Link
zml-prefs-release-button =
    .label = Move to Group Libraries…
zml-prefs-release-explanation = Makes it an ordinary group library again.
zml-prefs-adopt-heading = Use a library from another computer
zml-prefs-adopt-label =
    .value = Group library:
zml-prefs-adopt-button =
    .label = Show Next to My Library
zml-prefs-adopt-explanation = A library made on another computer usually appears here by itself. If it shows under Group Libraries instead, choose it here.

zml-prefs-file-heading = Where files of “{ $name }” go
zml-prefs-file-not-editable = Files are not being uploaded: file editing is turned off for this group on zotero.org. Turn it on in the group’s Library Settings there. Nothing on this computer is removed.
zml-prefs-file-deliberate = No choice yet for this library on this computer, and none came from your other computers. Choose below; your other computers will use the same.
zml-prefs-shared-note = This choice (including a WebDAV server’s address and username, never its password) is kept with the library on zotero.org, so your other computers use the same.
zml-prefs-password-required = Password needed on this computer: the settings came from another computer, and passwords are never shared.
zml-prefs-file-mode-zotero =
    .label = Zotero storage
zml-prefs-zotero-storage-note = Files are synced through Zotero storage, whatever Zotero’s Sync setting for group libraries says. They count against your Zotero storage.
zml-prefs-zotero-storage-note-inactive = Files will be synced through Zotero storage once this Zotero is signed in to a Zotero account and has synced.
zml-prefs-file-mode-webdav =
    .label = WebDAV
zml-prefs-webdav-main =
    .label = Same server and account as My Library (a folder of its own)
zml-prefs-webdav-main-unavailable = My Library does not sync its files to a WebDAV server (see Settings → Sync).
zml-prefs-webdav-custom =
    .label = A different server:
zml-prefs-url-label =
    .value = URL:
zml-prefs-username-label =
    .value = Username:
zml-prefs-password-label =
    .value = Password:
zml-prefs-webdav-folder = Files go to { $url }
zml-prefs-webdav-main-later = A folder of its own is made on My Library’s server when syncing starts.
zml-prefs-webdav-folder-unknown = Each library needs a folder of its own; Zotero keeps the files in a “zotero” subfolder of the URL.
zml-prefs-verify-button =
    .label = Check Server
zml-prefs-verifying = Checking…
zml-prefs-verified = Server checked.
zml-prefs-not-verified = Not checked yet.
zml-prefs-file-mode-none =
    .label = Don’t sync files

## Dialogs of the pane and menus

zml-sync-confirm-title = Sync with My Other Computers
zml-sync-confirm-text =
    Sync “{ $name }” with your other computers?

    Its content is uploaded to a private group of your Zotero account. This cannot be undone from within Zotero.
zml-sync-confirm-button = Sync
zml-link-confirm-title = Link to a Group
zml-link-confirm-text =
    Sync “{ $name }” with your Zotero account as zotero.org group { $groupID }?

    On the next sync, everything in this library is uploaded to that group, and the library takes the group’s name from zotero.org. Items from this library already cited in word-processor documents may need to be reselected once. This cannot be undone from within Zotero.
zml-link-confirm-replace = The empty group library “{ $name }” already on this computer is replaced by this library.
zml-link-confirm-button = Link
zml-error-group-id-invalid = Enter the number of a zotero.org group, for example 1234567, or choose a group from the list.
zml-error-group-not-empty = Group { $groupID } (“{ $name }”) is already on this computer and contains items, so it cannot be linked. Make a new, empty private group on zotero.org for this library.
zml-error-group-managed = Group { $groupID } is already one of your libraries.
zml-error-not-local = Only a library that is not yet synced can be linked to a group.
zml-error-url-same-as-main = This is the WebDAV folder My Library syncs to. Choose “Same server and account as My Library” instead, which keeps this library’s files in a folder of their own.
zml-error-url-same-as-other = The library “{ $name }” already syncs to this WebDAV folder. Use a different folder.

## Libraries from another computer

zml-menu-adopt-group =
    .label = Show Next to My Library
zml-menu-release-group =
    .label = Move to Group Libraries
zml-adopt-title = Show Next to My Library
zml-adopt-button = Show Next to My Library
zml-adopt-instead-text =
    Group { $groupID } (“{ $groupName }”) already contains items, so “{ $name }” cannot be linked to it.

    If that group is a library you made on another computer, show it next to My Library here instead, with its content, and set up its files. “{ $name }” stays as it is.
zml-release-title = Move to Group Libraries
zml-release-button = Move to Group Libraries
zml-release-text =
    Move “{ $name }” to Group Libraries?

    It becomes an ordinary group library. Its files then follow Zotero’s rule for group libraries (Zotero storage, if turned on in Settings → Sync): files already on this computer are kept and marked for upload there; files that exist only on a WebDAV server are not transferred. The group and its content on zotero.org are not affected, and you can show it next to My Library again later.
