// Smoke test: ticking Sync on a local library makes its link pending, and the
// new empty group Zotero downloads next is linked by itself — run with
// tools/zml-exec.sh -f tests/15-auto-link.js
const ZML = Zotero.MultipleLibraries;
const NAMES = ["Auto A", "Auto B", "Auto C", "Auto D", "Auto E", "Auto F", "Auto H", "Auto I"];
const IDS = [7654351, 7654352, 7654353, 7654354, 7654355, 7654356, 7654357, 7654358, 7654359, 7654360];
let out = {};

async function clean() {
	for (let l of ZML.Libraries.getAll().filter(l => NAMES.includes(l.name))) {
		await ZML.Libraries.erase(l);
	}
	for (let id of IDS) {
		let g = Zotero.Groups.get(id);
		if (g) {
			await g.eraseTx();
		}
	}
}
let makeGroup = async (id, name) => {
	let g = new Zotero.Group({ groupID: id, name, description: "", version: 3, editable: true, filesEditable: true });
	await g.saveTx();
	return g;
};
let waitFor = async (fn, ms) => {
	for (let t = 0; t < ms; t += 100) {
		if (fn()) {
			return true;
		}
		await Zotero.Promise.delay(100);
	}
	return fn();
};
let summary = (r, lib) => ({
	linked: r.linked.length, ambiguous: r.ambiguous, candidates: r.candidates,
	groupID: lib && Zotero.Libraries.exists(lib.libraryID) ? lib.groupID : null,
	pending: lib && Zotero.Libraries.exists(lib.libraryID) ? ZML.Libraries.isLinkPending(lib) : null,
});
let runner = Zotero.Sync.Runner;
let syncDesc = Object.getOwnPropertyDescriptor(runner, "syncInProgress");
out.syncInProgressType = typeof runner.syncInProgress;

// zotero.org's answer about a group, as a stand-in: the user's own new
// private group unless listed in NOT_MINE
const NOT_MINE = new Set();
let origFetch = ZML.Libraries._fetchGroupInfo;
ZML.Libraries._fetchGroupInfo = async (groupID) => ({
	data: { owner: NOT_MINE.has(groupID) ? 999999 : Zotero.Users.getCurrentUserID(), type: "Private" },
	meta: { numItems: 0, created: new Date().toISOString() },
});
if (!Zotero.Users.getCurrentUserID()) {
	await Zotero.Users.setCurrentUserID(1);
}

try {
	await clean();
	// Calls below use resolvePendingLinks() directly; the notifier path is
	// tested on its own in f and g, so keep it quiet until then
	ZML.Libraries._autoResolveDisabled = true;

	// a. one pending library, one new empty group
	let a = await ZML.Libraries.create("Auto A");
	await ZML.Libraries.requestLink(a);
	out.aPendingAfterRequest = ZML.Libraries.isLinkPending(a);
	await makeGroup(IDS[0], "New group A");
	let ra = await ZML.Libraries.resolvePendingLinks();
	out.a = summary(ra, a);
	out.a.isLinked = ZML.Libraries.isLinkedLibrary(a);

	// b. an empty group already there before the tick is never a candidate
	await makeGroup(IDS[1], "Old empty group");
	let b = await ZML.Libraries.create("Auto B");
	await ZML.Libraries.requestLink(b);
	let rb = await ZML.Libraries.resolvePendingLinks();
	out.b = summary(rb, b);
	out.b.state = await ZML.Libraries.getPendingState(b);

	// c. two new groups: ask, link nothing
	await makeGroup(IDS[2], "New group C1");
	await makeGroup(IDS[3], "New group C2");
	let rc = await ZML.Libraries.resolvePendingLinks();
	out.c = summary(rc, b);
	out.c.state = await ZML.Libraries.getPendingState(b);
	// tidy up c: B stays pending with two candidates; cancel it
	await ZML.Libraries.cancelLink(b);
	out.cCancelled = !ZML.Libraries.isLinkPending(b);

	// d. cancelled: a new group is left alone
	await makeGroup(IDS[4], "New group D");
	let rd = await ZML.Libraries.resolvePendingLinks();
	out.d = summary(rd, b);

	// e. pending library deleted before its group arrives
	let e = await ZML.Libraries.create("Auto E");
	await ZML.Libraries.requestLink(e);
	await ZML.Libraries.erase(e);
	await makeGroup(IDS[5], "New group E");
	let re = await ZML.Libraries.resolvePendingLinks();
	out.e = summary(re, null);

	// h. a new group that zotero.org says is not the user's: ask instead
	let h = await ZML.Libraries.create("Auto H");
	await ZML.Libraries.requestLink(h);
	NOT_MINE.add(IDS[8]);
	await makeGroup(IDS[8], "Someone else's group");
	let rh = await ZML.Libraries.resolvePendingLinks();
	out.h = summary(rh, h);
	out.h.state = await ZML.Libraries.getPendingState(h);
	await ZML.Libraries.cancelLink(h);

	// i. two resolve runs at once link once, without errors
	let i2 = await ZML.Libraries.create("Auto I");
	await ZML.Libraries.requestLink(i2);
	await makeGroup(IDS[9], "New group I");
	let [ri1, ri2] = await Promise.all([ZML.Libraries.resolvePendingLinks(), ZML.Libraries.resolvePendingLinks()]);
	out.i = { sameRun: ri1 === ri2, linked: ri1.linked.length, groupID: i2.groupID };

	// Groups left from b–i are now "old"; start the notifier cases afresh
	ZML.Libraries._autoResolveDisabled = false;

	// f. through Zotero's notifier, no direct call
	let f = await ZML.Libraries.create("Auto F");
	await ZML.Libraries.requestLink(f);
	await makeGroup(IDS[6], "New group F");
	out.f = { linkedByNotifier: await waitFor(() => !ZML.Libraries.isLinkPending(f) && f.groupID == IDS[6], 5000) };

	// g. waits while a sync is running
	let g = await ZML.Libraries.create("Auto C");
	await ZML.Libraries.requestLink(g);
	Object.defineProperty(runner, "syncInProgress", { value: true, configurable: true, writable: true });
	await makeGroup(IDS[7], "New group G");
	await Zotero.Promise.delay(2000);
	out.g = { pendingDuringSync: ZML.Libraries.isLinkPending(g) };
	runner.syncInProgress = false;
	out.g.linkedAfterSync = await waitFor(() => !ZML.Libraries.isLinkPending(g) && g.groupID == IDS[7], 5000);

	out.pass = out.aPendingAfterRequest
		&& out.a.linked == 1 && out.a.groupID == IDS[0] && out.a.pending === false && out.a.isLinked
		&& out.b.linked == 0 && !out.b.candidates.includes(IDS[1]) && out.b.pending === true && out.b.state == "existing"
		&& out.c.linked == 0 && out.c.ambiguous && out.c.pending === true && out.c.state == "choose"
		&& out.h.linked == 0 && out.h.ambiguous && out.h.pending === true && out.h.state == "choose"
		&& out.i.sameRun && out.i.linked == 1 && out.i.groupID == IDS[9]
		&& out.cCancelled && out.d.linked == 0
		&& out.e.linked == 0
		&& out.f.linkedByNotifier
		&& out.g.pendingDuringSync && out.g.linkedAfterSync;
}
catch (e) {
	out.error = String(e) + "\n" + e.stack;
}
finally {
	ZML.Libraries._fetchGroupInfo = origFetch;
	ZML.Libraries._autoResolveDisabled = false;
	if (syncDesc) {
		Object.defineProperty(runner, "syncInProgress", syncDesc);
	}
	else {
		delete runner.syncInProgress;
	}
	await clean();
}
return out;
