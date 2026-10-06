# Zotero Multiple Libraries

A Zotero plugin that lets you have several personal libraries in one Zotero,
side by side in the collection tree: "My Library", "My second library", and
so on. Each extra library works like My Library (collections, saved searches,
tags, duplicates, unfiled items, trash, notes, attachments, reader, drag and
drop between libraries).

Status: in development. See [docs/DESIGN.md](docs/DESIGN.md) for the design
and the alternatives that were considered (including Zotero's multiple-profile
workaround).

## Requirements

- Zotero 10 (developed and tested on 10.0.4).

## Development

```bash
tools/test-profile.sh      # start a throwaway Zotero instance with the plugin
```

The plugin is installed unpacked from this directory, so edits only need a
restart of the test instance. The production profile is never touched.
