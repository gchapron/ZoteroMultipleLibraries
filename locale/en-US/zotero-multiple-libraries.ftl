## Zotero Multiple Libraries — English (US)
## Message IDs are prefixed with "zml-" to avoid clashes with Zotero's own strings.

zml-plugin-name = Zotero Multiple Libraries

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
