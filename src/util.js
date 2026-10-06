/* global Zotero, Localization, ZoteroMultipleLibraries */
/*
 * Utilities: logging, localization, and a monkey-patch registry that can undo
 * every patch on shutdown.
 */

ZoteroMultipleLibraries.Util = {
	PREF_BRANCH: "extensions.zotero.multipleLibraries.",

	log(msg, level = 3) {
		Zotero.debug("ZoteroMultipleLibraries: " + msg, level);
	},

	warn(msg) {
		Zotero.warn("ZoteroMultipleLibraries: " + msg);
	},

	error(e) {
		Zotero.logError(e);
	},

	getPref(name) {
		return Zotero.Prefs.get(this.PREF_BRANCH + name, true);
	},

	setPref(name, value) {
		return Zotero.Prefs.set(this.PREF_BRANCH + name, value, true);
	},

	// Synchronous Fluent access for strings used from JS (dialogs, prompts)
	_l10n: null,
	getString(id, args) {
		if (!this._l10n) {
			this._l10n = new Localization(["zotero-multiple-libraries.ftl"], true);
		}
		let value = this._l10n.formatValueSync(id, args);
		if (value === null || value === undefined) {
			this.warn(`missing localized string ${id}`);
			return id;
		}
		return value;
	},

	/**
	 * Registry of monkey patches so that shutdown() can restore Zotero exactly.
	 *
	 * wrap(obj, prop, factory): factory(original) must return the replacement.
	 */
	Patches: {
		_patches: [],

		wrap(obj, prop, factory) {
			let original = obj[prop];
			let hadOwn = Object.prototype.hasOwnProperty.call(obj, prop);
			let replacement = factory(original);
			obj[prop] = replacement;
			this._patches.push({ obj, prop, original, hadOwn, replacement });
			return replacement;
		},

		isWrapped(obj, prop) {
			return this._patches.some(p => p.obj === obj && p.prop === prop);
		},

		unwrapAll() {
			let patches = this._patches.reverse();
			this._patches = [];
			for (let p of patches) {
				try {
					if (p.obj[p.prop] !== p.replacement) {
						ZoteroMultipleLibraries.Util.warn(
							`${p.prop} was re-patched by someone else after us; restoring our original anyway`
						);
					}
					if (p.hadOwn) {
						p.obj[p.prop] = p.original;
					}
					else {
						delete p.obj[p.prop];
					}
				}
				catch (e) {
					ZoteroMultipleLibraries.Util.error(e);
				}
			}
		},
	},
};
