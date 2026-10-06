/* global Zotero, Services, Components, ZoteroMultipleLibraries */
/*
 * Per-library file syncing.
 *
 * Zotero decides how a library's attachment files are synced in
 * Zotero.Sync.Storage.Local.getModeForLibrary(): WebDAV or Zotero storage for
 * My Library (one global setting), always Zotero storage for groups. The sync
 * runner then keeps one controller per mode, configured from the global
 * WebDAV preferences.
 *
 * For a linked library the plugin reports mode 'webdav' (so the sync engine
 * publishes the files' md5/mtime, exactly as for a WebDAV-synced My Library)
 * and hands the runner a controller of its own: a subclass of Zotero's WebDAV
 * controller whose URL, username, "verified" flag, and password come from this
 * library's settings and from a login-manager entry under the library's own
 * realm. Zotero's own WebDAV preferences and credentials are never read or
 * written.
 */

ZoteroMultipleLibraries.Storage = {
	MODES: ["none", "zotero", "webdav"],
	LOGIN_HOST: "chrome://zotero",

	LibraryWebDAV: null,
	_classes: new Map(), // libraryID -> constructor
	_controllers: new Map(), // libraryID -> controller instance

	init() {
		const ZML = ZoteroMultipleLibraries;
		const Patches = ZML.Util.Patches;
		const Local = Zotero.Sync.Storage.Local;

		this.LibraryWebDAV = this._defineClass();

		Patches.wrap(Local, "getModeForLibrary", original => function (libraryID) {
			if (ZML.Storage.isWebDAVLibrary(libraryID)) {
				return "webdav";
			}
			return original.call(this, libraryID);
		});

		Patches.wrap(Local, "getEnabledForLibrary", original => function (libraryID) {
			let mode = ZML.Storage.getFileSyncMode(libraryID);
			if (mode === null) {
				return original.call(this, libraryID);
			}
			// Zotero's own rule: no file syncing before the account has synced once
			return mode != "none" && !!Zotero.Users.getCurrentUserID();
		});

		Patches.wrap(Local, "getClassForLibrary", original => function (libraryID) {
			if (ZML.Storage.isWebDAVLibrary(libraryID)) {
				return ZML.Storage.getClass(libraryID);
			}
			return original.call(this, libraryID);
		});

		if (Zotero.Sync && Zotero.Sync.Runner) {
			// Called from the runner's file-sync loop with options.libraryID set
			Patches.wrap(Zotero.Sync.Runner, "getStorageController", original => function (mode, options) {
				let libraryID = options && options.libraryID;
				if (libraryID && ZML.Storage.isWebDAVLibrary(libraryID)) {
					return ZML.Storage.getController(libraryID, options);
				}
				return original.call(this, mode, options);
			});
		}
	},

	uninit() {
		this._classes.clear();
		this._controllers.clear();
	},

	/**
	 * @return {String|null} - 'none', 'zotero', or 'webdav' for a managed library;
	 *     null for any other library (Zotero's own rules apply)
	 */
	getFileSyncMode(libraryID) {
		const Libraries = ZoteroMultipleLibraries.Libraries;
		if (Libraries.isLocalLibrary(libraryID)) {
			// Never synced, so never any file syncing either
			return "none";
		}
		if (Libraries.isLinkedLibrary(libraryID)) {
			let mode = ZoteroMultipleLibraries.Settings.get(libraryID).fileSync.mode;
			return this.MODES.includes(mode) ? mode : "none";
		}
		return null;
	},

	isWebDAVLibrary(libraryID) {
		return this.getFileSyncMode(libraryID) == "webdav";
	},

	/**
	 * Constructor bound to one library, usable like Zotero.Sync.Storage.Mode.WebDAV
	 */
	getClass(libraryID) {
		let cls = this._classes.get(libraryID);
		if (!cls) {
			let LibraryWebDAV = this.LibraryWebDAV;
			cls = function (options) {
				LibraryWebDAV.call(this, options, libraryID);
			};
			cls.prototype = LibraryWebDAV.prototype;
			this._classes.set(libraryID, cls);
		}
		return cls;
	},

	getController(libraryID, options) {
		let controller = this._controllers.get(libraryID);
		if (!controller) {
			let Cls = this.getClass(libraryID);
			controller = new Cls(options || {});
			this._controllers.set(libraryID, controller);
		}
		return controller;
	},

	/**
	 * Drop the cached controller after settings changed
	 */
	resetController(libraryID) {
		let controller = this._controllers.get(libraryID);
		if (controller) {
			try {
				controller.clearCachedCredentials();
			}
			catch (e) {}
			this._controllers.delete(libraryID);
		}
	},

	//
	// Credentials: one login-manager entry per library, under a realm of our own
	//
	loginRealm(libraryID) {
		return "Zotero Multiple Libraries WebDAV L" + libraryID;
	},

	async getPassword(libraryID) {
		let logins = await Services.logins.searchLoginsAsync({
			origin: this.LOGIN_HOST,
			httpRealm: this.loginRealm(libraryID),
		});
		return logins.length ? logins[0].password : "";
	},

	async setPassword(libraryID, username, password) {
		await this.removePassword(libraryID);
		if (!password) {
			return;
		}
		let nsLoginInfo = new Components.Constructor(
			"@mozilla.org/login-manager/loginInfo;1", Components.interfaces.nsILoginInfo, "init"
		);
		let loginInfo = new nsLoginInfo(
			this.LOGIN_HOST, null, this.loginRealm(libraryID), username || "", password, "", ""
		);
		await Services.logins.addLoginAsync(loginInfo);
	},

	async removePassword(libraryID) {
		let logins = await Services.logins.searchLoginsAsync({
			origin: this.LOGIN_HOST,
			httpRealm: this.loginRealm(libraryID),
		});
		for (let login of logins) {
			Services.logins.removeLogin(login);
		}
	},

	/**
	 * Subclass of Zotero's WebDAV controller reading everything from one library's
	 * settings instead of the global preferences
	 */
	_defineClass() {
		const ZML = ZoteroMultipleLibraries;
		const Base = Zotero.Sync.Storage.Mode.WebDAV;

		function LibraryWebDAV(options, libraryID) {
			Base.call(this, options || {});
			this.libraryID = libraryID;
			// Used by inherited code paths that look at these; our own password
			// methods below use ZML.Storage.loginRealm()
			this._loginManagerRealm = ZML.Storage.loginRealm(libraryID);
			this._loginManagerRealmLegacy = this._loginManagerRealm + " (unused)";
		}

		LibraryWebDAV.prototype = Object.create(Base.prototype);
		Object.defineProperties(LibraryWebDAV.prototype, {
			constructor: { value: LibraryWebDAV },

			name: {
				get() {
					let library = Zotero.Libraries.get(this.libraryID);
					return "WebDAV" + (library ? ` (${library.name})` : "");
				},
			},

			verified: {
				get() {
					return !!ZML.Settings.get(this.libraryID).fileSync.verified;
				},
				set(val) {
					ZML.Settings.updateSync(this.libraryID, (c) => {
						c.fileSync.verified = !!val;
					});
				},
			},

			username: {
				get() {
					return ZML.Settings.get(this.libraryID).fileSync.username || "";
				},
			},
		});

		LibraryWebDAV.prototype.getPassword = async function () {
			return ZML.Storage.getPassword(this.libraryID);
		};

		LibraryWebDAV.prototype.setPassword = async function (username, password) {
			this._basicAuthHeader = false;
			this._digestParams = null;
			await ZML.Storage.setPassword(this.libraryID, username, password);
		};

		// Same as Zotero's _init(), with the library's settings instead of prefs
		LibraryWebDAV.prototype._init = async function () {
			if (this._rootURI) {
				return;
			}
			this._rootURI = false;
			this._parentURI = false;

			let { scheme, url } = ZML.Settings.get(this.libraryID).fileSync;
			if (scheme != "http" && scheme != "https") {
				throw new Error("Invalid WebDAV scheme '" + scheme + "'");
			}
			if (!url) {
				throw new this.VerificationError("NO_URL");
			}
			let username = this.username;
			let password = await this.getPassword();
			if (!username) {
				throw new this.VerificationError("NO_USERNAME");
			}
			if (!password) {
				throw new this.VerificationError("NO_PASSWORD");
			}

			let spec = scheme + "://"
				+ encodeURIComponent(username) + ":" + encodeURIComponent(password) + "@"
				+ url + (url.endsWith("/") ? "" : "/");
			try {
				this._parentURI = Services.io.newURI(spec);
			}
			catch (e) {
				if (e.message && e.message.includes("NS_ERROR_MALFORMED_URI")) {
					let displayURL = scheme + "://" + url + (url.endsWith("/") ? "" : "/");
					throw new this.VerificationError("INVALID_URL", displayURL);
				}
				throw e;
			}
			this._rootURI = Services.io.newURI(spec + "zotero/");
			Zotero.HTTP.CookieBlocker.addURL(this._rootURI.spec);
		};

		// Zotero's handler writes the global "verified" pref in one branch; keep
		// that away from the user's own WebDAV settings
		LibraryWebDAV.prototype.handleVerificationError = async function (err, window, skipSuccessMessage) {
			if (err instanceof this.VerificationError && err.error == "FILE_MISSING_AFTER_UPLOAD") {
				this.verified = true;
				let msg = Zotero.getString("sync.storage.error.webdav.fileMissingAfterUpload");
				Zotero.logError(msg);
				if (!skipSuccessMessage) {
					Zotero.Utilities.Internal.errorPrompt(
						Zotero.getString("general.warning"),
						{ message: msg, dialogButtonText: null }
					);
				}
				return false;
			}
			return Base.prototype.handleVerificationError.call(this, err, window, skipSuccessMessage);
		};

		return LibraryWebDAV;
	},
};
