// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* team_sync.js — the real ERP window in TEAM MODE: crud_overlay's commit funnel <-> the local comm layer.
 * Implementing bim-compiler prompts/TEAMWORK_FRAMEWORK.md §13.1 (W1) — Witness: W-TEAM-SO (erp/tests/witness_team_so.js).
 *
 * GENERIC (AD-LAYER LAW): nothing here names a window or a business table. It sits on two seams only:
 *   OUT  an OBSERVER on the bus topic twin/trx/afterCommit (ad_modelval deliverCommitted, delivered by crud_overlay._sidePersist; study §13.2): each committed kernel CRUD row becomes a v3 envelope.
 *   IN   a Visit = store.sync(pipe) → store.foldable() → __crud.teamRebuild(): the sidecar is rebuilt as a PROJECTION of the
 *        comm log (the comm log is the truth). Written through crud_overlay's existing append-only `ops` store.
 * Inert unless the page is opened with ?team=1 (the loader in idempiere.html writes the <script> tags only then).
 * Identity/space/token are read from the same-origin IndexedDB 'comm_phone' written by common/comm/comm_phone.html; this
 * page keeps its OWN comm store bytes under a separate key ('erp_db'), seeded once from the phone page's store.
 *
 * W2 (TEAMWORK_FRAMEWORK §13.7): the document's SET_STATUS is shared as an envelope (intent K4) and every op of a doc-action group carries `grp`
 * (the kernel gid); a group with a docstatus conflict is left out of the projection WHOLE (all-or-none).
 *
 * BASE (§13.12.I.1/.2, Witness: W-BASE-EDIT erp/tests/witness_team_base.js): a space founded here pins the SHIPPED seed file (erp/ad_seed.db) by sha256 in its genesis.
 * A device whose file hashes differently never folds (plain message on the chip). In such a space an UPDATE/DELETE/SET_STATUS of a seeded record (positive pk) is shared
 * when the record has a <table>_uu: the engine judges it by the scope of the BASE ROW, read from a pristine copy of the verified file (never the live, patched dictionary).
 *
 * Named limits (see TEAMWORK_FRAMEWORK §13.3, §13.7): in a space WITHOUT a base (founded before this, or from the phone page) an UPDATE/DELETE of a seeded record
 * (positive pk) stays local-only because the comm layer admits an op only against the scope of the record's CREATE; a seeded row with no <table>_uu cannot be
 * addressed either way; station-owned bookkeeping tables (declared LOCAL in the plan) are never shared; a Visit renumbers synthetic pks (-kernelRowId).
 */
(function (global) {
  'use strict';
  var _on = /[?&]team=1(&|$)/.test(String(global.location && global.location.search)); try { _on = _on || global.localStorage.getItem('teamMode') === '1'; } catch (e) {}
  if (!_on) return;   // without ?team=1 (or the Team panel's switch) nothing changes
  // OUT on the bus (TEAM_REPLICATION_PLUGIN_STUDY §13.2, 2.4): subscribed at load, before any commit can run (this file is parser-blocking); OBSERVE class - it can never veto or join a save
  if (global.AdModelVal && typeof global.AdModelVal.subscribe === 'function') global.AdModelVal.subscribe('twin/trx/afterCommit', '*', 'TeamSync.out', function (c, v) { return onCommit(v.rows, v.db); }, { observe: true });
  else console.log('🔴 §TEAM_BOOT no model-validation bus (ad_modelval.js) — nothing this device commits is shared');

  var OWNER = 'red1oon', REPO = 'bim-teams-pipe';
  // the core's message (TEAM_REPLICATION_PLUGIN_STUDY §8.3 A4, §12.4): Msg.getMsg over AD_Message (ad_callout.js; patches/ad_seed.db.sql ships CurrentRecordModified) - never a copy of its text here
  function coreMsg(key) { var M = global.AdCallout && global.AdCallout.Msg; try { return M ? M.getMsg(null, key) : key; } catch (e) { return key; } }
  // The table scope is DATA, not a list in this file: the compiled plan (erp/team_plan.js, GENERATED from flow rows by bim-compiler build/scriptor/emit_erp_plan.js, TEAMWORK_FRAMEWORK §25),
  // read through the one shared reader TeamScope (common/comm/team_scope.js): 'share' (a FACT/BOTH/space row), 'station-local' (a declared LOCAL row: per-station numbering, the user's recent items,
  // session/audit rows - sharing them would make every document save a spurious crossed edit) or 'unplanned' (no row => local-only, never shared by default). No plan => nothing is shared.
  // §32: verified (a no-op without a trust list) BEFORE `ready` resolves, so no commit is judged against an unverified plan.
  async function verifyPlan(why) {                                     // -> the verdict; prints the plan line and the verdict (the app's own evidence)
    var T = global.TeamScope, st = T ? await T.verify(global.crypto && global.crypto.subtle) : 'missing', PLAN_SUM = T && T.summary();
    console.log(PLAN_SUM ? '§TEAM_PLAN hash=' + PLAN_SUM.hash.slice(0, 12) + ' tables=' + PLAN_SUM.tables + ' local=' + PLAN_SUM.local : '§TEAM_PLAN missing — nothing is shared');
    console.log('§TEAM_PLAN_SIG state=' + st + (why ? ' ' + why : ''));
    return st;
  }
  var planVerified = verifyPlan().catch(function (e) { console.log('🔴 §TEAM_PLAN_SIG ' + (e && e.message)); });
  // §33.2: the trust list a space pinned in its GENESIS replaces the deployment's window.TEAM_PLAN_TRUST (the space decides); the plan is re-verified under it. No genesis list => the deployment list stays.
  // §16.35: adopt the upcaster sets the POLICY in force carries (verified like config sets); a refold follows when any was newly loaded
  async function adoptSets() { if (global.TeamVersions && global.TeamVersions.adopt && S) { try { await global.TeamVersions.adopt(S); } catch (e) { log('🔴 §TEAM_VERSIONS adopt ' + (e && e.message)); } } }
  async function pinTrust(st) {
    st = st || S; if (!st || !st.planTrust) return;
    var gt = await st.planTrust(); if (!gt) return;
    if (JSON.stringify(gt) === JSON.stringify(global.TEAM_PLAN_TRUST || [])) return;
    global.TEAM_PLAN_TRUST = gt; await verifyPlan('trust=genesis(' + gt.length + ')');
  }
  // §44 C1: WHICH plans this page can found a team on = the plan files it loaded (the office plan; a plan whose own `kind` names another topology). The panel offers exactly these; `?teamplan=` only PRE-SELECTS one.
  var PLAN_TEXT = { office: ['Office team', 'everyone shares the same records'], pos: ['Point-of-sale team', 'tills and phones send up what the plan declares and receive only what is addressed to them'] };
  function planChoices() {
    var ids = [], P = global.TEAM_PLAN_POS, pre = new URLSearchParams(global.location.search).get('teamplan');
    if (global.TEAM_PLAN) ids.push('office'); if (P && P.kind && ids.indexOf(P.kind) < 0) ids.push(P.kind);
    var sel = ids.indexOf(pre) >= 0 ? pre : 'office';
    return ids.map(function (id) { var t = PLAN_TEXT[id] || [id, '']; return { id: id, label: t[0], hint: t[1], selected: id === sel }; });
  }
  function spaceOpts(bi, plan) {                                       // what a founder pins in the genesis: the shared base, the deployment's plan trust list (public keys) and the plan the founder chose
    var o = {}, t = global.TEAM_PLAN_TRUST, pc = plan || new URLSearchParams(global.location.search).get('teamplan'); if (bi) o.base = bi; if (Array.isArray(t) && t.length) o.planTrust = t;
    if (pc && pc !== 'office' && planChoices().some(function (c) { return c.id === pc; })) o.plan = pc;   // §38.15: absent = the office plan, so every existing space reads as before
    return Object.keys(o).length ? o : undefined;
  }
  // §38.15 (G-6): WHICH plan this space reads (the genesis' `plan`) and WHO this device is in it (its role, its person). 'office' (the default) is the mesh plan as always; 'pos' is the star plan whose hub rows
  // carry a direction per role. Refreshed before every commit and projection; the roster is the same on every device, so the verdicts are too.
  var scopeCtx = { kind: 'office', role: null, person: null };
  async function refreshScope(st) {
    st = st || S; if (!st) return scopeCtx;
    var R = (await st.order()).roster, kind = R && R.ok && R.plan === 'pos' ? 'pos' : 'office';
    if (R && R.ok && kind !== global.TeamScope.kind()) { global.TeamScope.setKind(kind); await verifyPlan('plan=' + kind); }
    var d = dev && R && R.ok ? R.devices[dev.kid] : null;
    scopeCtx = { kind: global.TeamScope.kind(), role: d ? R.roleAt(dev.kid, Infinity).ad_role_id : null, person: d ? d.person : null };
    if (d && !docnoOn) docnoOverlay();
    return scopeCtx;
  }
  // TEAMWORK §48.11b/§48.11c — LOCAL NUMBERING switched on with Team: once this device is enrolled (more than one device can number documents), the boot overlay gives every
  // un-prefixed DocType sequence the OrgValue-UserValue- prefix on the LIVE database (not an op, not sent; the base hash does not move). A solo device never reaches here.
  var docnoOn = false;
  function docnoOverlay() {
    var db = adDb(); if (!db || !global.TeamDocNo) return;
    try { global.TeamDocNo.ensure(function (sql, a) { return bq(db, sql, a); }, function (sql, a) { db.run(sql, a || []); }, log); docnoOn = true; }   // re-applied on every boot (idempotent), so nothing to persist
    catch (e) { log('🔴 §TEAM_DOCNO_PREFIX ' + (e && e.message)); }
  }
  // the fold rule (opts.docno): judged against the PRISTINE base (the same rows on every device), never this device's live dictionary; a space without a verified base is not judged
  async function hostDocNo(o) {
    if (!global.TeamDocNo) return null;
    if (baseSt.state !== 'ok') return { unjudged: 'base-' + baseSt.state };
    return global.TeamDocNo.judge(Object.assign({}, o, { baseQ: async function (sql, a) { return bq(await pristine(), sql, a); } }));
  }
  // §48.13 Seatbelt: a READ-ONLY view of the counters the chip already shows + the base, roster, version parks and local numbering. Nothing here changes state.
  async function seatbeltState() {
    await ready; if (!S) return { paired: false };
    var L = await S.order(), dl = S.delivery(), d = dev ? L.roster.devices[dev.kid] : null, vs = S.versionState ? await S.versionState() : null, cf = await S.conflicts(), pol = L.roster.policy;
    var refused = {}; dl.forEach(function (x) { if (x.verdict === 'REFUSED') refused[x.reason || '?'] = (refused[x.reason || '?'] || 0) + 1; });
    var parked = {}, pb = (vs && vs.parked_by_reason) || {}; Object.keys(pb).forEach(function (k) { if (/^needs-/.test(k)) parked[k] = pb[k]; });
    var dn = { bound: false, userValue: null, sharedValue: 0 }, db = adDb();
    if (db) { try {
      if (d && d.person) dn.bound = bq(db, 'SELECT 1 AS x FROM ad_user WHERE lower(ad_user_uu)=?', [String(d.person).toLowerCase()]).length > 0;
      var me = global.APP && global.APP.actor != null ? bq(db, 'SELECT ad_client_id AS c, value AS v FROM ad_user WHERE ad_user_id=?', [Number(global.APP.actor)])[0] : null;
      if (me) { dn.userValue = me.v || null; if (me.v) dn.sharedValue = bq(db, "SELECT count(*) AS n FROM ad_user WHERE ad_client_id=? AND value=? AND isactive='Y' AND ad_user_id<>?", [me.c, me.v, Number(global.APP.actor)])[0].n; }
    } catch (e) { log('🔴 §TEAM_SEATBELT state ' + (e && e.message)); } }
    return { paired: true, enrolled: !!d, base: baseSt.state, now: Date.now(), lastVisitAt: lastVisitAt, visit_ms: pol && pol.params && pol.params.visit_ms || null,
             unsent: dl.filter(function (x) { return x.state === 'SAVED'; }).length, refusedReasons: refused, gaps: S.gaps().length, parked: parked, conflicts: cf.length, localOnly: Object.keys(localOnly).length, docno: dn };
  }
  var KERNEL_STAMPS = { _sigv: 1, signed_by: 1, _sv: 1 };   // kernel-local artefacts, re-stamped by whoever commits

  var SQL = null, dev = null, cfg = null, S = null, pipe = null, sent = {}, localOnly = {}, lastRefused = 0, lastVisitAt = null, lastSyncRep = null, fired = {}, replExc = [];
  var baseSt = { state: 'unknown' }, loadedP = null, pristineP = null, storeOpts = null, bmemo = {}, bcols = {};
  var _resolveReady, readyBoot = new Promise(function (r) { _resolveReady = r; }), ready = readyBoot.then(function (v) { return planVerified.then(function () { return v; }); });
  var $ = function (id) { return document.getElementById(id); };
  function log(m) { console.log(m); }

  // ── this browser's storage: the phone page's IndexedDB 'comm_phone' (same schema, version 1) ──
  function idb() { return new Promise(function (res, rej) { var r = indexedDB.open('comm_phone', 1); r.onupgradeneeded = function () { r.result.createObjectStore('kv'); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
  async function kvGet(k) { var d = await idb(); return new Promise(function (res) { var q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = function () { res(q.result); }; q.onerror = function () { res(undefined); }; }); }
  async function kvPut(k, v) { var d = await idb(); return new Promise(function (res, rej) { var t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = function () { rej(t.error); }; }); }
  async function persist() { if (S) await kvPut('erp_db', S.db.export()); await kvPut('erp_sent', sent); await kvPut('erp_localonly', localOnly); await kvPut('erp_replfired', fired); }

  // ── the AD layer's canUpdate over this page's own dictionary (same adapter as comm_phone.html) ──
  function adDb() { return global.__idmpDb; }
  function shim(sdb) { return { prepare: function (sql) { return {
    get: function () { var st = sdb.prepare(sql); st.bind([].slice.call(arguments)); var r = st.step() ? st.getAsObject() : undefined; st.free(); return r; },
    all: function () { var st = sdb.prepare(sql); st.bind([].slice.call(arguments)); var o = []; while (st.step()) o.push(st.getAsObject()); st.free(); return o; } }; } }; }
  var roles = {};
  function access(roleId, client, org, table) {
    var t = shim(adDb()).prepare('SELECT ad_table_id AS id, accesslevel AS lvl FROM ad_table WHERE lower(tablename)=?').get(String(table).toLowerCase());
    if (!t) return { allowed: false, reason: 'no-table' };
    var r = roles[roleId]; if (r === undefined) { try { r = global.AdAccess.buildRole(shim(adDb()), roleId); } catch (e) { r = null; } roles[roleId] = r; }
    return r ? r.canUpdate(client, org, Number(t.id), t.lvl) : { allowed: false, reason: 'no-role' };
  }
  function tableId(n) { var t = shim(adDb()).prepare('SELECT ad_table_id AS id FROM ad_table WHERE lower(tablename)=?').get(String(n).toLowerCase()); return t ? Number(t.id) : null; }
  // ═══ BASE (TEAMWORK_FRAMEWORK §13.12.I.1 + §13.12.I.2) ═══════════════════════════════════════════════════════════════════════════
  // The base of an ERP team space is what the shipped build loads: the seed file (erp/ad_seed.db, or ?seed=) PLUS the self-heal patch texts idempiere.html applies on
  // every load (patches/<seed>.sql, patches/mfg.sql). MEASURED (W-BASE-EDIT first run): the reservation row a Complete updates lives in patches/ad_seed.db.sql, not in
  // the file - hashing the file alone would have left it "in neither the log nor the base". The live __idmpDb is that PLUS device-local overlays (BIM project orders,
  // system tenant, installed shards, plugins) which differ between devices; two devices judging one op against different rows would fold differently. So base rows are
  // read from a PRISTINE second database = the file with the same patches applied, nothing else - opened lazily from bytes that hash EXACTLY as the team's did
  // (a device that never edits a seeded record never pays the extra ~file-size heap).
  // state: unknown (no store) · pending (genesis not seen yet) · none (space without base) · ok · mismatch (never folds) · error (could not read own copy)
  function seedFile() { var q = new URLSearchParams(global.location.search).get('seed'); return (q && /^[\w.-]+\.db$/.test(q)) ? q : 'ad_seed.db'; }
  async function fetchBase() {           // the same files, in the same order, that idempiere.html loads
    var r = await fetch(seedFile()); if (!r.ok) throw new Error('seed fetch HTTP ' + r.status);
    var bytes = new Uint8Array(await r.arrayBuffer()), patches = [];
    for (var pf of [seedFile() + '.sql', 'mfg.sql']) { var text = null; try { var pr = await fetch('patches/' + pf, { cache: 'no-cache' }); if (pr.ok) text = await pr.text(); } catch (e) { /* offline and not cached: MISSING, which hashes differently */ } patches.push({ name: pf, text: text }); }
    return { bytes: bytes, patches: patches };
  }
  async function hashBase(fb) {          // sha256 over: the seed file's sha256 and size, then each patch (position + text, or MISSING). Reproducible by any tool: see witness_team_base.js
    var f = await global.CommStore.baseFromBytes('seed', fb.bytes), man = 'seed ' + f.sha256 + ' ' + f.bytes + '\n', n = f.bytes;
    fb.patches.forEach(function (p, i) { man += '--patch ' + i + (p.text == null ? ' MISSING' : '\n' + p.text) + '\n'; if (p.text != null) n += new TextEncoder().encode(p.text).length; });      // by POSITION, not file name: a ?seed= copy keeps the same patches
    var h = await global.CommStore.baseFromBytes(seedFile() + '+patches', new TextEncoder().encode(man), global.__adSeedFingerprint); h.bytes = n; return h;
  }
  function loadedBase() {                // {name, sha256, bytes, version} of what this page loaded; once per page (the bytes are dropped; the pristine copy re-reads them)
    if (!loadedP) loadedP = (async function () { return hashBase(await fetchBase()); })().catch(function (e) { loadedP = null; throw e; });
    return loadedP;
  }
  function pristine() {                  // the second database, from files that hash EXACTLY as loadedBase() did (else they changed under the page: throw, never guess)
    if (!pristineP) pristineP = (async function () {
      var t0 = Date.now(), lb = await loadedBase(), fb = await fetchBase(), again = await hashBase(fb);
      if (again.sha256 !== lb.sha256) throw new Error('the seed or its patches changed while the page was open (' + lb.sha256.slice(0, 8) + ' -> ' + again.sha256.slice(0, 8) + ') - reload');
      var d = new SQL.Database(fb.bytes), ok = 0, bad = 0;
      fb.patches.forEach(function (p) { if (p.text == null) return;      // = idempiere.html §FS-15: statements one by one, comments stripped, a failing statement never blocks
        p.text.split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { d.run(st); ok++; } catch (e) { bad++; } }); });
      log('§TEAM_BASE pristine opened ' + lb.name + ' bytes=' + lb.bytes + ' sha=' + lb.sha256.slice(0, 12) + ' patch statements ok=' + ok + ' failed=' + bad + ' ms=' + (Date.now() - t0) + ' (+~' + Math.round(fb.bytes.length / 1048576) + ' MB wasm heap; base rows are read from this copy, not from the live dictionary)'); return d;
    })().catch(function (e) { pristineP = null; throw e; });
    return pristineP;
  }
  function bq(db, sql, args) { var st = db.prepare(sql); st.bind(args || []); var o = []; while (st.step()) o.push(st.getAsObject()); st.free(); return o; }
  async function baseCols(table) {     // lower-cased column name -> real name; {} if the table is not in the base
    var t = String(table).toLowerCase(); if (!/^[a-z][a-z0-9_]*$/.test(t)) return {};
    if (bcols[t]) return bcols[t];
    var set = {}; bq(await pristine(), 'PRAGMA table_info("' + t + '")').forEach(function (r) { set[String(r.name).toLowerCase()] = String(r.name); }); return (bcols[t] = set);
  }
  // opts.baseRow for the engine: {client, org} of the base row with that <table>_uu, or null (the base has no such row). A base that cannot be opened THROWS: a failed
  // lookup must fail the fold loudly, never turn into a silent refusal. A mismatching device never folds, so it does not open a second copy of a wrong file.
  async function hostBaseRow(table, uu) {
    if (baseSt.state === 'mismatch') return null;
    var t = String(table).toLowerCase(), cols = await baseCols(t), uc = cols[t + '_uu']; if (!uc) return null;
    var k = t + '|' + uu; if (bmemo[k] !== undefined) return bmemo[k];
    var rows = bq(await pristine(), 'SELECT ' + (cols.ad_client_id ? '"' + cols.ad_client_id + '"' : 'NULL') + ' AS c, ' + (cols.ad_org_id ? '"' + cols.ad_org_id + '"' : 'NULL') + ' AS o FROM "' + t + '" WHERE lower("' + uc + '")=?', [String(uu).toLowerCase()]);
    return (bmemo[k] = rows.length ? { client: rows[0].c, org: rows[0].o } : null);
  }
  // how a base record is addressed on THIS device's kernel: {pk} when the table has <table>_id, {pk:null} when only <table>_uu (composite-key tables: idCol addressing, as the model layer does), null = not in the base
  async function baseKeyOf(table, uu) {
    var t = String(table).toLowerCase(), cols = await baseCols(t), uc = cols[t + '_uu']; if (!uc) return null;
    var idc = cols[t + '_id'], rows = bq(await pristine(), 'SELECT ' + (idc ? '"' + idc + '"' : '1') + ' AS k FROM "' + t + '" WHERE lower("' + uc + '")=?', [String(uu).toLowerCase()]);
    return rows.length ? { pk: idc ? Number(rows[0].k) : null } : null;
  }
  async function baseUuOf(table, id) {   // a seeded record's <table>_uu from its integer key (OUT side), or null
    var t = String(table).toLowerCase(), cols = await baseCols(t), uc = cols[t + '_uu'], idc = cols[t + '_id']; if (!uc || !idc) return null;
    var rows = bq(await pristine(), 'SELECT "' + uc + '" AS u FROM "' + t + '" WHERE "' + idc + '"=?', [Number(id)]);
    return rows.length && rows[0].u ? String(rows[0].u).toLowerCase() : null;
  }
  function baseOn() { return baseSt.state === 'ok'; }
  function baseBlocked() { return baseSt.state === 'mismatch' || baseSt.state === 'error'; }
  async function verifyBase() {          // verify-then-fold (§13.12.I rule 3): called after every sync and at boot, BEFORE anything is projected
    var prev = baseSt.state;
    if (!S) { baseSt = { state: 'unknown' }; return baseSt; }
    if (!(await S.order()).roster.ok) { baseSt = { state: 'pending' }; return baseSt; }
    var info = await S.baseInfo();
    if (!info) { baseSt = { state: 'none' }; if (prev !== 'none') log('§TEAM_BASE state=none (this space has no base: unchanged behaviour, seeded edits stay local-only)'); return baseSt; }
    var loaded; try { loaded = await loadedBase(); } catch (e) {
      baseSt = { state: 'error', info: info, message: 'Cannot read this device\'s copy of ' + info.name + ' to check it against the team\'s base (' + (e && e.message) + ').' };
      if (prev !== 'error') log('🔴 §TEAM_BASE state=error ' + baseSt.message); return baseSt; }
    if (storeOpts) storeOpts.baseSha256 = loaded.sha256;           // ops authored here carry the hash of the DB this device REALLY has
    var ck = global.CommStore.checkBase(info, loaded);
    baseSt = ck.ok ? { state: 'ok', info: info, loaded: loaded } : { state: 'mismatch', info: info, loaded: loaded, message: ck.message, have: ck.have, want: ck.want };
    if (prev !== baseSt.state) log('§TEAM_BASE state=' + baseSt.state + ' name=' + info.name + ' want=' + info.sha256.slice(0, 12) + ' have=' + loaded.sha256.slice(0, 12) + ' bytes=' + loaded.bytes +
      (ck.ok ? ' (verified: seeded-record edits are shared, judged by the base row)' : ' - ' + ck.message + ' (NOT folded)'));
    return baseSt;
  }
  function codeOf(kid) { return kid.slice(0, 4).toUpperCase() + '-' + kid.slice(4, 8).toUpperCase(); }
  function uuidFromHash(h) { return h.slice(0, 8) + '-' + h.slice(8, 12) + '-4' + h.slice(13, 16) + '-8' + h.slice(17, 20) + '-' + h.slice(20, 32); }
  function isNeg(v) { return (typeof v === 'number' && Number.isInteger(v) && v < 0) || (typeof v === 'string' && /^-\d+$/.test(v)); }

  // ═══ OUT: kernel row → v3 envelope ═══════════════════════════════════════════════════════════════════════════════
  // The CREATE row that minted a device-local pk (-k): its op_uuid IS that record's <table>_uu (crud_core.js:475-477).
  function createRowOf(db, negPk) {
    var k = -Number(negPk), r = db.exec('SELECT op_type, op_uuid, parameters, user_tag FROM kernel_ops WHERE id=' + k);
    if (!r.length || !r[0].values.length) return null;
    var v = r[0].values[0], p; try { p = JSON.parse(v[2]); } catch (e) { return null; }
    return v[0] === 'CRUD_CREATE' ? { uu: String(v[1] || '').toLowerCase(), table: String((p && p.table) || '').toLowerCase(), team: v[3] === 'team', fields: (p && p.fields) || {} } : null;
  }
  // §41.2 L1 CATCH-UP ON BIND, derived not remembered. When the roster gains a person, the hub looks at ITS OWN unsent rows of every flow that is addressed `by` an entity (marked 'no-addressee' when they were made) and
  // sends - through the SAME translate (same carries, same admission), oldest first, once (`sent`) - those whose entity now has a bound person. Nothing is stored for a record nobody binds (a cash sale costs nothing),
  // nothing is capped, and a restart changes nothing: the rows, `sent` and `localOnly` are the device's persisted state. Bind-first stays the procedure; this is the bank showing a late-enrolled customer the accounts they hold.
  var personsSeen = -1, relPersons = null, passDepth = 0;           // relPersons: the roster's persons, read ONCE per translate pass (S.order() refolds the whole log after every author; HS2, TEAMWORK_FRAMEWORK §45.7)
  async function rosterPersons() { if (!passDepth) return (await S.order()).roster.persons; return relPersons || (relPersons = (await S.order()).roster.persons); }   // outside a pass: a fresh read, nothing kept
  async function withRoster(fn) { passDepth++; try { return await fn(); } finally { if (--passDepth === 0) relPersons = null; } }   // a translate pass (onCommit's batch, the release pass, a host's batch of replies): ONE roster snapshot for all its rows
  function rowsDb(rows) { var by = {}; rows.forEach(function (r) { by[r.id] = r; }); return { exec: function (sql) { var m = /WHERE id=(\d+)/.exec(sql), x = m && by[m[1]]; return x ? [{ values: [[x.op_type, x.op_uuid, x.parameters, x.user_tag]] }] : []; } }; }
  async function releaseFor(oldRows, force) {
    var out = { n: 0, ids: {} }; if (!S || scopeCtx.kind !== 'pos') return out;
    var R = (await S.order()).roster, np = Object.keys(R.persons).length; if (!force && np === personsSeen) return out; personsSeen = np;
    var cands = oldRows.filter(function (r) { if (r.user_tag === 'team' || r.undone || !r.op_uuid || sent[r.op_uuid] || !/^no-addressee/.test(localOnly[r.op_uuid] || '')) return false;
      try { return global.TeamScope.scopeOf(JSON.parse(r.parameters).table, scopeCtx.role) === 'down'; } catch (e) { return false; } }).sort(function (a, b) { return Number(a.id) - Number(b.id); });
    if (!cands.length) return out; var db = rowsDb(oldRows); passDepth++; relPersons = R.persons;
    var ms = { translate: 0, author: 0 }, tq = Date.now(), batch = [];
    try { for (var r of cands) { var t0 = Date.now(), t = await translate(r, db); ms.translate += Date.now() - t0;
        if (!t.body) continue;                                         // its entity is still unbound (or the record is no longer sendable): left exactly as it was
        sent[r.op_uuid] = 'pending';                                   // so a later row of this pass that points at it (a schedule at its invoice) finds it shared
        batch.push({ row: r, spec: { target: t.target, body: stamped(t.body), refs: t.refs, intent: r.op_type === 'SET_STATUS' ? 'K4' : 'K2', ts: r.timestamp } }); }
    } finally { if (--passDepth === 0) relPersons = null; }
    var t1 = Date.now(), ar = await S.authorMany(batch.map(function (b) { return b.spec; })); ms.author = Date.now() - t1;       // ONE read of the log's versions for the whole pass (author() would walk the log once per record)
    batch.forEach(function (b, k) { var a = ar.done[k], r2 = b.row;
      if (a) { sent[r2.op_uuid] = a.hash; delete localOnly[r2.op_uuid]; out.n++; out.ids[r2.id] = 1; if (out.n <= 20) log('§TEAM_CATCHUP op=' + r2.op_type + ' table=' + b.spec.target.table + ' uu=' + b.spec.target.uu.slice(0, 8) + ' seq=' + a.env.seq + ' hash=' + a.hash.slice(0, 12) + ' (held until its entity was bound)'); }
      else delete sent[r2.op_uuid]; });
    if (ar.error) log('🔴 §TEAM_CATCHUP author-failed after ' + ar.done.length + ' of ' + batch.length + ': ' + (ar.error && ar.error.message));
    if (out.n) log('§TEAM_CATCHUP released=' + out.n + ' of ' + cands.length + ' candidates (persons now ' + np + ') ms total=' + (Date.now() - tq) + ' translate=' + ms.translate + ' author=' + ms.author);       // per-phase ms: translate is linear; author is the engine's (versions() walks the whole log per op)
    return out;
  }
  function normNeg(db, fields, fo, depth) {            // a copy of the fields with every device-local FK (-k) replaced by {uu} of its CREATE; that record's fields are kept in fo (for the entity path)
    var out = {}; Object.keys(fields || {}).forEach(function (c) { var v = fields[c];
      if (isNeg(v) && /_id$/i.test(c) && depth < 3) { var row = createRowOf(db, v); if (row) { fo[row.uu] = normNeg(db, row.fields, fo, depth + 1); out[c] = { uu: row.uu }; return; } }
      out[c] = v; });
    return out;
  }
  function isShared(row) { return !!row && (row.team || !!sent[row.uu]); }
  // CL1b — a field <x>_id holding a NEGATIVE integer (device-local synthetic pk) becomes {uu:<x>_uu}; positive ids (seeded
  // masters, identical on every device) stay. Anything not resolvable is a refusal with its reason, never a guess.
  function rewriteFk(db, col, v, refs) {
    if (!isNeg(v)) return { v: v };
    var m = /^(.+)_id$/i.exec(col); if (!m) return { err: 'local-pk-in-non-fk-column ' + col };
    var row = createRowOf(db, v), x = m[1].toLowerCase();
    if (!row) return { err: 'fk-target-not-found ' + col + '=' + v };
    if (row.table !== x) return { err: 'fk-table-mismatch ' + col + ' points at ' + row.table };
    if (!isShared(row)) return { err: 'fk-target-not-shared ' + col + '=' + v };
    if (refs.indexOf(row.uu) < 0) refs.push(row.uu);
    return { v: { uu: row.uu } };
  }
  function rewriteMap(db, map, refs, isChange) {
    var out = {}, err = null;
    Object.keys(map || {}).forEach(function (c) {
      if (err) return; var v = map[c];
      if (isChange && v && typeof v === 'object' && !Array.isArray(v) && (Object.prototype.hasOwnProperty.call(v, 'new') || Object.prototype.hasOwnProperty.call(v, 'old'))) {
        var o = rewriteFk(db, c, v.old, refs), n = rewriteFk(db, c, v.new, refs); if (o.err || n.err) { err = o.err || n.err; return; }
        out[c] = { old: o.v === undefined ? null : o.v, new: n.v === undefined ? null : n.v };
      } else { var r = rewriteFk(db, c, v, refs); if (r.err) { err = r.err; return; } out[c] = r.v === undefined ? null : r.v; }
    });
    return err ? { err: err } : { map: out };
  }
  function uuOf(db) { return function (table, id) {          // an UPDATE/DELETE target: only a TEAM-created record is shareable (scope = its CREATE)
    if (!isNeg(id)) return null;
    var row = createRowOf(db, id); return row && row.table === table && isShared(row) ? row.uu : null; }; }

  // §16.33: an op authored by an app whose shape version is above 1 says so (`sv`); at shape 1 the body is byte-identical to what it always was.
  function stamped(body) { var TV = global.TeamVersions, v = TV ? TV.appV(body.op_type) : 1; if (!(v > 1)) return body; var o = {}; Object.keys(body).forEach(function (k) { o[k] = body[k]; }); o.sv = v; return o; }

  async function translate(r, db) {
    var p; try { p = JSON.parse(r.parameters); } catch (e) { return { skip: 'unparseable' }; }
    var table = String((p && p.table) || '').toLowerCase();
    if (!/^(CRUD_(CREATE|UPDATE|DELETE)|SET_STATUS)$/.test(r.op_type)) return { local: 'op-type ' + r.op_type, table: table };
    var scope = global.TeamScope.scopeOf(table, scopeCtx.role), pos = scopeCtx.kind === 'pos', ship = null;
    if (scope === 'station-local') return { quiet: 'station-owned ' + table };
    if (scope === 'up' || scope === 'down') ship = global.TeamScope.ship(table);               // §38.15: a declared flow - only its carried columns leave (FL-1)
    else if (scope !== 'share') return { local: (pos ? 'not-declared-for-role ' : 'table-not-in-plan ') + table, table: table, undeclared: pos };
    if (scope === 'down' && global.TeamScope.by(table)) {            // §38.15: a record addressed to ONE entity is sent only when that entity has a bound person in the roster (else nobody could take it in: it would only fatten the pipe)
      var fo = {}, base = r.op_type === 'CRUD_CREATE' ? p.fields : (isNeg(p.id) ? ((createRowOf(db, p.id) || {}).fields) : seedRow(table, Number(p.id))), ad = await entityUu(global.TeamScope.by(table), normNeg(db, base || {}, fo, 0), fo, table);
      if (!ad || !(await rosterPersons())[ad]) return { local: 'no-addressee ' + table, table: table, undeclared: true };
    }
    var clean = {}; Object.keys(p).forEach(function (k) { if (!KERNEL_STAMPS[k]) clean[k] = p[k]; });
    var refs = [], rw;
    if (r.gid) clean.grp = r.gid;                                      // §13.7: the doc-action group this op belongs to (all-or-none on a docstatus conflict)
    if (r.op_type === 'SET_STATUS') {                                  // the status mirrors as a docstatus column write so the comm layer's per-column conflict judges it
      if (clean.from == null || clean.to == null) return { local: 'set-status-without-from/to', table: table };
      clean.changes = { docstatus: { old: clean.from, new: clean.to } };
    }
    if (ship) {                                                        // the carries rule, outbound: a column the flow does not declare is dropped BEFORE anything is sealed
      if (!ship.length) return { local: 'declared-without-columns ' + table, table: table };
      var only = function (m) { var o = {}; Object.keys(m || {}).forEach(function (k) { if (ship.indexOf(k.toLowerCase()) >= 0) o[k] = m[k]; }); return o; };
      if (clean.fields) clean.fields = only(clean.fields);
      if (clean.changes) { clean.changes = only(clean.changes); if (!Object.keys(clean.changes).length) return { local: 'no-declared-column-changed ' + table, table: table }; }
    }
    if (clean.fields) { rw = rewriteMap(db, clean.fields, refs, false); if (rw.err) return { local: rw.err, table: table }; clean.fields = rw.map; }
    if (clean.changes) { rw = rewriteMap(db, clean.changes, refs, true); if (rw.err) return { local: rw.err, table: table }; clean.changes = rw.map; }
    // BASE (§13.12.I.2): a seeded record (positive pk) is addressable by the <table>_uu its row carries in the verified base
    var bu = null, seeded = r.op_type !== 'CRUD_CREATE' && p.id != null && !isNeg(p.id) && !p.idCol;
    if (baseOn() && seeded && table) { try { bu = await baseUuOf(table, p.id); } catch (e) { return { local: 'base-unavailable (' + (e && e.message) + ')', table: table }; } }
    var w = CommEnvelope.wrapKernelOp({ op_type: r.op_type, op_uuid: r.op_uuid, parameters: clean }, function (t, id) { return bu && !isNeg(id) ? bu : uuOf(db)(t, id); });
    if (!w.ok) return { local: /uu-unresolved/.test(w.reason) ? (baseOn() && seeded ? 'seeded-row-has-no-uu (' + w.reason + ') — the base row cannot be addressed' : 'target-not-a-team-record (' + w.reason + ') — the comm layer admits an op only against its record\'s CREATE scope') : w.reason, table: table };
    return { target: w.target, body: w.body, refs: refs, table: table };
  }

  async function onCommit(rows, db) {
    await ready; if (!S) return;                                      // paired later from the Team panel (§13.9) works too: S is set then
    await refreshScope();
    // §48.13 Seatbelt: the state AT Process time; a DocAction under ADVISE is LOGGED (never stopped, owner 2026-10-30) — read here, before this batch changes the counters
    var sbm = (global.TeamSeatbelt && rows.some(function (x) { return x.op_type === 'SET_STATUS' && !x.undone; })) ? global.TeamSeatbelt.model(await seatbeltState()) : null;
    var n = 0, trial = null, undecl = {}, undeclN = 0;
    if (cfg && cfg.trial && global.TeamTrial) { var D = global.TeamDefaults || {};     // §13.8 T4: judged once per commit batch, so a whole Complete group is never cut in half
      trial = global.TeamTrial.status((await S.placedEnvelopes()).map(function (x) { return x.env; }), { trial: true, cycles: D.trialCycles, cap: D.trialOpCap });
      if (trial.finished) log('§TEAM_TRIAL ' + trial.reason + ' cycles=' + trial.cycles + ' businessOps=' + trial.businessOps + ' (new business ops stay on this device)'); }
    passDepth++;                                                       // one roster snapshot for the whole batch (HS2): S.order() is not refolded per DOWN row
    try {
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.undone || !r.op_uuid || sent[r.op_uuid] || localOnly[r.op_uuid] || r.user_tag === 'team') continue;   // undo/redo snapshots, replays, projected rows
      var t = await translate(r, db);
      if (sbm && r.op_type === 'SET_STATUS') { var sp = (t.body && t.body.params) || {}; global.TeamSeatbelt.noteCommit(sbm, { op_type: 'SET_STATUS', from: sp.from, to: sp.to || sp.action, table: t.table || (t.target && t.target.table) }, log); }
      if (!t.quiet && trial && trial.finished) { localOnly[r.op_uuid] = trial.reason; log('§TEAM_LOCALONLY op=' + r.op_type + ' table=' + (t.table || '?') + ' uuid=' + String(r.op_uuid).slice(0, 8) + ' reason=' + trial.reason + ' (NOT SENT)'); continue; }
      if (t.quiet) { log('§TEAM_STATION_LOCAL op=' + r.op_type + ' ' + t.quiet + ' (not shared by design)'); continue; }
      if (baseBlocked()) { localOnly[r.op_uuid] = 'base-mismatch'; log('§TEAM_LOCALONLY op=' + r.op_type + ' table=' + (t.table || '?') + ' uuid=' + String(r.op_uuid).slice(0, 8) + ' reason=base-mismatch (NOT SENT — this copy is not the team\'s base)'); continue; }
      if (t.undeclared) { localOnly[r.op_uuid] = t.local; undecl[t.table] = (undecl[t.table] || 0) + 1; undeclN++; continue; }     // pos plan: counted, one line per batch (below)
      if (t.local || t.skip) { localOnly[r.op_uuid] = t.local || t.skip; log('§TEAM_LOCALONLY op=' + r.op_type + ' table=' + (t.table || '?') + ' uuid=' + String(r.op_uuid).slice(0, 8) + ' reason=' + (t.local || t.skip) + ' (NOT SENT)'); continue; }
      try {
        var a = await S.author({ target: t.target, body: stamped(t.body), refs: t.refs, intent: r.op_type === 'SET_STATUS' ? 'K4' : 'K2', ts: r.timestamp });
        sent[r.op_uuid] = a.hash; n++;
        log('§TEAM_OUT op=' + r.op_type + ' table=' + t.target.table + ' uu=' + t.target.uu.slice(0, 8) + ' seq=' + a.env.seq + ' refs=' + t.refs.length + ' hash=' + a.hash.slice(0, 12));
      } catch (e) { localOnly[r.op_uuid] = 'author-failed ' + (e && e.message); log('§TEAM_LOCALONLY op=' + r.op_type + ' table=' + t.table + ' reason=author-failed ' + (e && e.message) + ' (NOT SENT)'); }
    }
    } finally { if (--passDepth === 0) relPersons = null; }
    if (undeclN) log('§TEAM_NOT_DECLARED plan=pos role=' + scopeCtx.role + ' ops=' + undeclN + ' tables=' + JSON.stringify(undecl) + ' (stay on this device: the plan declares no flow for them from this role - FL-8 e)');
    await persist(); await render();
    return n;
  }

  // ═══ IN: comm log → sidecar projection ═══════════════════════════════════════════════════════════════════════════
  function rewriteIn(map, uuToPk, isChange) {            // {uu:x} → the local pk of that row (built earlier in the SAME rebuild)
    var out = {}, miss = null;
    function one(v) { if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.uu === 'string' && Object.keys(v).length === 1) { if (uuToPk[v.uu] == null) { miss = v.uu; return null; } return uuToPk[v.uu]; } return v; }
    Object.keys(map || {}).forEach(function (c) { var v = map[c];
      if (isChange && v && typeof v === 'object' && !Array.isArray(v) && (Object.prototype.hasOwnProperty.call(v, 'new') || Object.prototype.hasOwnProperty.call(v, 'old'))) out[c] = { old: one(v.old), new: one(v.new) };
      else out[c] = one(v); });
    return miss ? { miss: miss } : { map: out };
  }
  // project(oldRows) → the full kernel_ops row list of the rebuilt sidecar. Rows this device never shared (local-only,
  // station-owned, pre-team) are kept verbatim at their ids; everything the comm log placed is regenerated after them.
  // §38.15 inbound: who may THIS device take in? admitAll decides every placed op once, in fold order. In the office plan nothing is decided here (returns null: the projection is exactly what it was).
  function pick(f, c) { var k = Object.keys(f || {}).filter(function (x) { return x.toLowerCase() === c.toLowerCase(); })[0]; return k === undefined ? undefined : f[k]; }
  async function seedUu(tbl, id) {                                     // the _uu of a SEEDED record (positive id: identical on every device, FL-5) - the pinned base when there is one
    if (!/^[a-z][a-z0-9_]*$/.test(tbl)) return null;
    if (baseOn()) { try { return await baseUuOf(tbl, id); } catch (e) { return null; } }
    try { var r = bq(adDb(), 'SELECT "' + tbl + '_uu" AS u FROM "' + tbl + '" WHERE "' + tbl + '_id"=?', [id]); return r.length && r[0].u ? String(r[0].u).toLowerCase() : null; } catch (e) { return null; }
  }
  function seedRow(tbl, id) { try { var r = bq(adDb(), 'SELECT * FROM "' + tbl + '" WHERE "' + tbl + '_id"=?', [id])[0], o = {}; Object.keys(r || {}).forEach(function (k) { o[k.toLowerCase()] = r[k]; }); return r ? o : null; } catch (e) { return null; } }
  // the entity a record is addressed to: follow the FK path (each hop a <x>_id column; a hop through a team-made record reads its CREATE fields, through a seeded one its dictionary row) and return the _uu of the last one
  // the table a FK column points at, from the dictionary: its AD_Reference_Value's AD_Ref_Table when it has one (M_MovementLine.M_LocatorTo_ID -> M_Locator), else the column name minus _ID
  var fkMemo = {};
  function fkTarget(table, col) {
    var k = table + '.' + col.toLowerCase(); if (fkMemo[k] !== undefined) return fkMemo[k]; var t = null;
    try { var r = bq(adDb(), 'SELECT c.ad_reference_value_id AS v FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)=? AND lower(c.columnname)=?', [table, col.toLowerCase()]);
      if (r.length && r[0].v != null) { var q = bq(adDb(), 'SELECT lower(t.tablename) AS n FROM ad_ref_table rt JOIN ad_table t ON t.ad_table_id=rt.ad_table_id WHERE rt.ad_reference_id=?', [r[0].v]); if (q.length) t = q[0].n; } } catch (e) { t = null; }
    if (!t) { var m = /^(.+)_id$/i.exec(col); t = m ? m[1].toLowerCase() : null; }
    return (fkMemo[k] = t);
  }
  async function entityUu(path, fields, fieldsOf, startTable) {
    var f = fields, tbl = String(startTable || '').toLowerCase(), v;
    for (var i = 0; i < path.length; i++) {
      if (!/_id$/i.test(path[i])) return null; var from = tbl; tbl = fkTarget(from, path[i]); if (!tbl) return null; v = f ? pick(f, path[i]) : undefined; if (v === undefined || v === null) return null;
      if (i === path.length - 1) break;
      if (v && typeof v === 'object' && typeof v.uu === 'string') f = fieldsOf[v.uu.toLowerCase()] || null;
      else if (Number(v) > 0 && /^[a-z][a-z0-9_]*$/.test(tbl)) f = seedRow(tbl, Number(v));
      else return null;
    }
    if (v && typeof v === 'object' && typeof v.uu === 'string') return v.uu.toLowerCase();
    return Number(v) > 0 ? seedUu(tbl, Number(v)) : null;
  }
  async function admitAll(fold, sc) {
    var R = (await S.order()).roster, refuse = {}, st = { placed: fold.length, accepted: 0, refused: 0, bytesAccepted: 0, bytesRefused: 0, byTable: {} }, addrOf = {}, fieldsOf = {};
    for (var p of fold) {
      var e = p.env, b = e.body, t = e.target.table, uu = String(e.target.uu).toLowerCase(), by = global.TeamScope.by(t), params = b.params || {}, addr = null;
      if (b.op_type === 'CRUD_CREATE') { fieldsOf[uu] = params.fields || {}; if (by) addr = addrOf[uu] = await entityUu(by, params.fields, fieldsOf, t); }
      else if (by) addr = addrOf[uu] || null;
      var ad = R.devices[e.author], v = global.TeamScope.admits(t, sc.role, { self: e.author === (dev && dev.kid), authorRole: R.roleAt(e.author, e.seq).ad_role_id, authorPerson: ad && ad.person, myPerson: sc.person, addr: addr }), n = JSON.stringify(e).length;
      if (v.ok) { st.accepted++; st.bytesAccepted += n; } else { refuse[p.hash] = v.why; st.refused++; st.bytesRefused += n; st.byTable[t] = (st.byTable[t] || 0) + 1; }
    }
    st.refuse = refuse; return st;
  }

  async function project(oldRows) {
    var fold = await S.foldable(), sc = await refreshScope(), baseKeys = {}, thin = sc.kind === 'pos' ? await admitAll(fold, sc) : null, rel = sc.kind === 'pos' ? await releaseFor(oldRows) : { n: 0, ids: {} };
    if (baseOn()) {                                                 // §13.12.I.2: targets that live in the base (no CREATE in the log) -> how THIS device addresses them
      var made = {}; fold.forEach(function (q) { if (q.env.body.op_type === 'CRUD_CREATE') made[q.env.target.uu] = 1; });
      for (var q of fold) { var qe = q.env; if (qe.body.op_type === 'CRUD_CREATE' || made[qe.target.uu]) continue;
        var kk = qe.target.table + '|' + qe.target.uu; if (!(kk in baseKeys)) baseKeys[kk] = await baseKeyOf(qe.target.table, qe.target.uu); }
    }
    // POS plan: an op THIS device authored on a flow it declares left with only its carried columns (FL-1); projecting it back would strip the device's OWN record of everything else. Its full local row is kept as it is.
    var ownFull = {}, ownIds = {};
    if (thin) { var byHash = {}; oldRows.forEach(function (r) { if (r.user_tag !== 'team' && sent[r.op_uuid]) byHash[sent[r.op_uuid]] = r; });
      fold.forEach(function (p) { var sc2 = byHash[p.hash] && p.env.author === (dev && dev.kid) ? global.TeamScope.scopeOf(p.env.target.table, sc.role) : null;
        if (sc2 === 'up' || sc2 === 'down') { ownFull[p.hash] = byHash[p.hash]; ownIds[byHash[p.hash].id] = 1; } }); }
    var keep = oldRows.filter(function (r) { return r.user_tag !== 'team' && (!sent[r.op_uuid] || ownIds[r.id] || rel.ids[r.id]); }).map(function (r) {
      var c = {}; Object.keys(r).forEach(function (k) { c[k] = r[k]; });
      if (!/"_sigv":2/.test(String(c.parameters))) c.sig = null;       // a v1 signature attests the chain hash, which this rebuild changes: re-sign
      return c; });
    // §13.7 all-or-none: a doc-action group with ANY write held back on docstatus is left out whole (the document keeps its last agreed status AND no consequences)
    var heldGrp = {}; fold.forEach(function (p) { var g = p.env.body.params && p.env.body.params.grp; if (g && p.held && p.held.indexOf('docstatus') >= 0) heldGrp[g] = 1; });
    var groupHeld = 0;
    var base = keep.reduce(function (m, r) { return Math.max(m, Number(r.id)); }, 0), uuToPk = {}, out = keep.slice(), skipped = 0, byTable = {}, received = [];
    fold.forEach(function (p) {
      var e = p.env, b = e.body, t = e.target.table, uu = e.target.uu, params = b.params || {}, kp, op_uuid;
      if (thin && thin.refuse[p.hash]) return;                         // §38.15: refused locally (not-addressed) - never projected, never fired
      if (ownFull[p.hash]) { if (b.op_type === 'CRUD_CREATE') uuToPk[uu] = -Number(ownFull[p.hash].id); return; }       // my own declared op: the full local row stays (above)
      if (params.grp && heldGrp[params.grp]) { groupHeld++; log('§TEAM_GROUP_HELD grp=' + String(params.grp).slice(0, 8) + ' ' + b.op_type + ' ' + t + ' ' + uu.slice(0, 8) + ' (docstatus conflict — whole group left out)'); return; }
      if (b.op_type === 'CRUD_CREATE') {
        var rw = rewriteIn(params.fields, uuToPk, false);
        if (rw.miss) { skipped++; log('§TEAM_PROJECT_SKIP ' + t + ' ' + uu.slice(0, 8) + ' fk-uu-unknown ' + rw.miss.slice(0, 8)); return; }
        kp = { table: t, id: null, fields: rw.map, cas: params.cas || null }; if (params.stdDefaults) kp.stdDefaults = params.stdDefaults; op_uuid = uu;
      } else if (b.op_type === 'CRUD_UPDATE' || b.op_type === 'CRUD_DELETE') {
        var pk = uuToPk[uu], bk = pk == null ? baseKeys[t + '|' + uu] : null, byUu = !!bk && bk.pk == null;     // a base record: its integer key, or <table>_uu addressing for a composite-key table
        if (pk == null && !bk) { skipped++; log('§TEAM_PROJECT_SKIP ' + t + ' ' + uu.slice(0, 8) + ' target-unknown'); return; }
        if (pk == null && bk) pk = bk.pk;
        if (b.op_type === 'CRUD_UPDATE') {
          var rc = rewriteIn(params.changes, uuToPk, true);
          if (rc.miss) { skipped++; log('§TEAM_PROJECT_SKIP ' + t + ' ' + uu.slice(0, 8) + ' fk-uu-unknown ' + rc.miss.slice(0, 8)); return; }
          if (!Object.keys(rc.map).length) return;                     // every column of this write was held back by a conflict
          kp = byUu ? { table: t, id: uu, idCol: t + '_uu', changes: rc.map } : { table: t, id: pk, changes: rc.map }; if (params.actor != null) kp.actor = params.actor;
        } else kp = byUu ? { table: t, id: uu, idCol: t + '_uu', tombstone: true, reversible: true } : { table: t, id: pk, tombstone: true, reversible: true };
        op_uuid = uuidFromHash(p.hash);
      } else if (b.op_type === 'SET_STATUS') {
        var pk2 = uuToPk[uu], bk2 = pk2 == null ? baseKeys[t + '|' + uu] : null; if (pk2 == null && bk2 && bk2.pk != null) pk2 = bk2.pk;
        if (pk2 == null) { skipped++; log('§TEAM_PROJECT_SKIP ' + t + ' ' + uu.slice(0, 8) + ' target-unknown (SET_STATUS)'); return; }
        kp = { table: t, id: pk2, action: params.action, from: params.from, to: params.to, oracle: params.oracle || null }; op_uuid = uuidFromHash(p.hash);
      } else { skipped++; log('§TEAM_PROJECT_SKIP ' + t + ' op-type ' + b.op_type); return; }
      var id = ++base; if (b.op_type === 'CRUD_CREATE') uuToPk[uu] = -id;
      if (e.author !== (dev && dev.kid) && (b.op_type === 'CRUD_CREATE' || (b.op_type === 'CRUD_UPDATE' && !kp.idCol))) received.push({ hash: p.hash, table: t, pk: b.op_type === 'CRUD_CREATE' ? -id : kp.id, isNew: b.op_type === 'CRUD_CREATE' });   // §13.2 2.6: a row another device authored
      out.push({ id: id, op_uuid: op_uuid, timestamp: e.ts, op_type: b.op_type, parameters: JSON.stringify(kp), input_guids: null, output_guid: null, undone: 0,
                 prev_hash: null, op_hash: null, sig: null, gid: null, branch_id: null, user_tag: 'team' });   // NOT params.grp: a kept local-only member of the same group would be separated from it and the kernel reports group-torn (found on film footage 2026-10-24)
      byTable[t] = (byTable[t] || 0) + 1;
    });
    // old synthetic pk → new, per table (the open window re-keys its current record)
    var remap = {};
    oldRows.forEach(function (r) { if (r.op_type !== 'CRUD_CREATE' || !r.op_uuid) return; var np = uuToPk[String(r.op_uuid).toLowerCase()];
      if (np == null || np === -Number(r.id)) return; var t; try { t = String(JSON.parse(r.parameters).table).toLowerCase(); } catch (e) { return; }
      (remap[t] = remap[t] || {})[-Number(r.id)] = np; });
    if (thin) log('§TEAM_THIN plan=pos role=' + sc.role + ' placed=' + thin.placed + ' accepted=' + thin.accepted + ' refused=' + thin.refused + ' bytes_accepted=' + thin.bytesAccepted + ' bytes_refused=' + thin.bytesRefused +
                  ' refused_tables=' + JSON.stringify(thin.byTable) + ' (REFUSED not-addressed: this role is not the recipient of those flows; they are never projected)');
    project.last = { released: rel.n, thin: thin ? { placed: thin.placed, accepted: thin.accepted, refused: thin.refused, bytesAccepted: thin.bytesAccepted, bytesRefused: thin.bytesRefused, byTable: thin.byTable } : null, kept: keep.length, placed: fold.length, projected: out.length - keep.length, skipped: skipped, groupHeld: groupHeld, byTable: byTable, remap: remap, received: received };
    return out;
  }

  // ═══ FL-8 E2 (TEAMWORK_FRAMEWORK §38.5; study §12.2 2.5): the in-log executor map (E3) as legacy DATA - Document Action Access rows ═══ Witness: W-UPS-E2-HOST (erp/tests/witness_team_executors.js), W-HOSTS G8
  // The executor of a table is a ROLE (the map, owner-signed, enforced by every fold: comm_store E3). Here Team states the SAME map the way legacy states "this role may not run this action":
  // every ACTIVE AD_Document_Action_Access row of a role other than the executor, on the doctypes of that table, is set IsActive='N'. The host's DocAction list is then MRole.checkActionAccess over
  // the LOGIN role's rows and nothing else (idempiere.html _docActionAccess has no team branch). Owned by Team, in memory (the precedent: plugin_registry ctx.dict): the previous IsActive of each row it flipped
  // returns when the map changes, is removed, or the device is unpaired - nothing is written to the op log, so the rule vanishes with the policy. The doctypes of a table are read from its records
  // (C_DocType_ID / C_DocTypeTarget_ID -> every doctype of the same DocBaseType): no table name here. Login role != team role (M4): legacy judges the login role; E3 still refuses at fold.
  var exe = { map: null, role: null, kid: null }, execRows = {}, mismatchSeen = {};
  function projectExecutorRows(map) {
    var db = adDb(); if (!db) return 0;
    var want = {}, flipped = 0, restored = 0;
    try {
      Object.keys(map || {}).forEach(function (t) {
        if (!/^[a-z][a-z0-9_]*$/.test(t)) return;
        var cols = bq(db, 'PRAGMA table_info("' + t + '")').map(function (c) { return String(c.name).toLowerCase(); }).filter(function (c) { return c === 'c_doctype_id' || c === 'c_doctypetarget_id'; });
        if (!cols.length) return;                                    // no doctype on this table: legacy checks nothing (WDocActionPanel.java:197); E3 still refuses at fold
        var used = cols.map(function (c) { return 'SELECT ' + c + ' FROM "' + t + '"'; }).join(' UNION ');
        bq(db, 'SELECT ad_role_id AS r, c_doctype_id AS d, ad_ref_list_id AS l, isactive AS a FROM ad_document_action_access WHERE ad_role_id<>? AND c_doctype_id IN ' +
               '(SELECT c_doctype_id FROM c_doctype WHERE docbasetype IN (SELECT docbasetype FROM c_doctype WHERE c_doctype_id IN (' + used + ')))', [Number(map[t])]).forEach(function (x) { want[x.r + '|' + x.d + '|' + x.l] = x; });
      });
      Object.keys(execRows).forEach(function (k) { if (want[k]) return; var p = k.split('|'); db.run('UPDATE ad_document_action_access SET isactive=? WHERE ad_role_id=? AND c_doctype_id=? AND ad_ref_list_id=?', [execRows[k], Number(p[0]), Number(p[1]), Number(p[2])]); delete execRows[k]; restored++; });
      Object.keys(want).forEach(function (k) { var x = want[k]; if (execRows[k] === undefined) { if (x.a !== 'Y') return; execRows[k] = x.a; }
        if (x.a !== 'N') { db.run("UPDATE ad_document_action_access SET isactive='N' WHERE ad_role_id=? AND c_doctype_id=? AND ad_ref_list_id=?", [Number(x.r), Number(x.d), Number(x.l)]); flipped++; } });
    } catch (e) { log('🔴 §TEAM_EXEC_ROWS ' + (e && e.message)); return 0; }
    if (flipped || restored) { log('§TEAM_EXEC_ROWS map=' + (map && Object.keys(map).length ? JSON.stringify(map) : 'none') + " set IsActive='N' on " + flipped + ' Document Action Access rows, restored ' + restored + ' (owned ' + Object.keys(execRows).length + ')');
      try { global.dispatchEvent(new CustomEvent('ad:access-changed', { detail: { table: 'ad_document_action_access' } })); } catch (e) {} }          // the host drops its cached role context (MRole cache reset)
    return flipped + restored;
  }
  async function refreshExecutors(st, kid) {
    st = st || S; kid = kid || (dev && dev.kid) || null;
    var R = st ? (await st.order()).roster : null, map = R && R.ok && R.executors && Object.keys(R.executors).length ? R.executors : null;
    var nx = { map: map, role: map && kid ? R.roleAt(kid, Infinity).ad_role_id : null, kid: kid }, was = JSON.stringify([exe.map, exe.role]);
    exe = nx; if (JSON.stringify([nx.map, nx.role]) !== was) log('§TEAM_EXECUTORS map=' + (map ? JSON.stringify(map) : 'none') + ' myRole=' + nx.role);
    projectExecutorRows(map);
    var login = global.APP && global.APP.roleId != null ? Number(global.APP.roleId) : null;          // M4: the rows are judged on the LOGIN role; say once when it is not the team role
    if (map && nx.role != null && login != null && login !== Number(nx.role) && !mismatchSeen[login + '|' + nx.role]) { mismatchSeen[login + '|' + nx.role] = 1;
      log('§TEAM_ROLE_MISMATCH login=' + login + ' team=' + nx.role + ' (the DocAction list follows the login role as in legacy; a DocAction the team role may not run is refused at fold: not-executor)'); }
    return exe;
  }

  // ═══ IN, part 2 (bim-compiler prompts/TEAM_REPLICATION_PLUGIN_STUDY.md §13.2, sub-step 2.6): the CORE fires the replica timing of each newly received row ═══
  // After the projection committed, every CREATE/UPDATE another device authored that this device has not fired before runs through ModelLayer.fireReplica in ONE model group (fold order):
  // validators, client validators, AD_Table_ScriptValidator rows (e.g. the POS chain: I_Order TANR -> twin:process:206) and handlers - the twin of legacy po.saveReplica's afterNewReplication.
  // What the listeners write commits through the normal funnel and is shared as THIS device's own ops (the processor is the executor, FL-8). A listener error drops only that row's writes
  // (savepoint) and is recorded (§TEAM_REPLICA_EXCEPTION): the received fact stays (§9.3 item 1). `fired` (envelope hashes) is persisted, so a refold or the next Visit never fires twice.
  async function fireReceived(pj) {
    var todo = ((pj && pj.received) || []).filter(function (x) { return !fired[x.hash]; });
    if (!todo.length) return { received: 0, fired: 0, exceptions: 0, ops: 0 };
    var C = global.__crud, ML = global.ModelLayer;
    if (!C || typeof C.modelRun !== 'function' || typeof C.applyOpGroup !== 'function' || !ML || typeof ML.fireReplica !== 'function') { log('🔴 §TEAM_REPLICA_IN the core seam is missing (modelRun / applyOpGroup / fireReplica): ' + todo.length + ' received row(s) fired nothing'); return null; }
    var exc = [];
    var r = await new Promise(function (res) { C.modelRun({ table: todo[0].table, timing: 'PROCESS', fn: function (trx) {
      todo.forEach(function (x) {
        var row = trx.get(x.table, x.pk); if (!row) { exc.push({ x: x, error: 'the received row is not in the projection' }); return; }
        var sp = trx.setSavepoint(), f = ML.fireReplica(trx, x.table, row, { isNew: x.isNew });
        if (!f.ok) { trx.rollbackTo(sp); exc.push({ x: x, error: f.error }); }
      });
      return { ok: true };
    } }, res); });
    if (!r) { log('🔴 §TEAM_REPLICA_IN the model run failed: ' + todo.length + ' received row(s) left to fire at the next Visit'); return null; }
    todo.forEach(function (x) { fired[x.hash] = 1; });
    exc.forEach(function (e) { replExc.push({ table: e.x.table, pk: e.x.pk, hash: e.x.hash, error: String(e.error) });
      log('§TEAM_REPLICA_EXCEPTION table=' + e.x.table + ' pk=' + e.x.pk + ' op=' + e.x.hash.slice(0, 12) + ' error=' + String(e.error).slice(0, 160) + ' (the received row stays; only this listener\'s writes were dropped)'); });
    var ops = (r.ok !== false && r.ops) || [], cr = null;
    if (ops.length) cr = await new Promise(function (res) { C.applyOpGroup(ops, res, r.observed); });
    log('§TEAM_REPLICA_IN received=' + todo.length + ' new=' + todo.filter(function (x) { return x.isNew; }).length + ' fired=' + (todo.length - exc.length) + ' exceptions=' + exc.length + ' listenerOps=' + ops.length +
        (ops.length ? ' committed=' + !!(cr && cr.committed) + ' gid=' + (cr && cr.gid) : ''));
    await persist();
    return { received: todo.length, fired: todo.length - exc.length, exceptions: exc.length, ops: ops.length, committed: !!(cr && cr.committed) };
  }

  var visiting = false;
  async function visit() {
    if (!S || visiting) return null; visiting = true;
    try {
      var rep = await S.sync(pipe); lastSyncRep = rep; lastVisitAt = Date.now();
      await verifyBase();                                           // verify-then-fold: a copy that is not the team's base never projects anything
      await pinTrust();                                             // a joiner learns the pinned plan trust list when the genesis arrives
      await refreshScope();                                         // ... and which plan (office | pos) the genesis names
      await adoptSets();
      if (baseBlocked()) {
        log('§TEAM_VISIT sent=' + rep.sent + ' fetched=' + rep.fetched + ' received=' + rep.received + ' placed=' + rep.placed + ' | BASE ' + baseSt.state + ' — NOTHING FOLDED: ' + baseSt.message);
        await persist(); await render(); return { rep: rep, res: { ok: false, reason: 'base-' + baseSt.state }, pj: {} };
      }
      var res = await global.__crud.teamRebuild(project), pj = project.last || {};
      if (pj.released) { var rep2 = await S.sync(pipe); rep.sent += rep2.sent; }       // §41.2 L1: the records the projection just released go out in this Visit
      var rin = res && res.ok ? await fireReceived(pj) : null;        // §13.2 2.6: only on a committed projection
      await peopleRound();                                          // §13.12.G.1: publish my focus, collect the others', rank, heads-up (never throws into the Visit)
      var dirty = false; try { dirty = !!(global.__crud.inlineDirty && global.__crud.inlineDirty()); } catch (e) {}
      log('§TEAM_VISIT sent=' + rep.sent + ' fetched=' + rep.fetched + ' received=' + rep.received + ' placed=' + rep.placed + ' parked=' + rep.parked + ' refused=' + rep.refused +
          ' gaps=' + rep.gaps + ' | projection kept=' + pj.kept + ' projected=' + pj.projected + ' skipped=' + pj.skipped + ' groupHeld=' + pj.groupHeld + ' rebuild=' + (res && res.ok ? 'ok verifyChain=' + (res.verify && res.verify.ok ? 'ok' : 'FAIL') : 'FAILED ' + (res && res.reason)) +
          ' refresh=' + (dirty ? 'DEFERRED(form has unsaved edits)' : 'sent') + ' replicaIn=' + (rin ? rin.fired + '/' + rin.received : 'none'));
      await persist();
      await render().catch(function (e) { log('🔴 §TEAM_RENDER ' + (e && e.message)); });   // first: it refreshes the executor map and its Document Action Access rows, so the refold below builds the DocAction bar from them
      if (res && res.ok && !dirty) global.dispatchEvent(new CustomEvent('overlay:committed', { detail: { table: null, op_type: 'TEAM_VISIT', id: null, remap: pj.remap || {} } }));
      return { rep: rep, res: res, pj: pj, replicaIn: rin };
    } catch (e) { log('🔴 §TEAM_VISIT error ' + (e && e.stack || e)); await render(); return null; }
    finally { visiting = false; }
  }

  // ═══ UI: one chip in the status bar + conflicts (iDempiere CurrentRecordModified) ════════════════════════════════
  function ensureChip() {
    var host = $('idmp-status'); if (!host) return null;
    var c = $('team-chip'); if (c) return c;
    c = document.createElement('span'); c.id = 'team-chip'; c.style.cssText = 'margin-left:12px;padding:1px 8px;border:1px solid #1f5fd6;border-radius:10px;font-size:12px;color:#1f5fd6;white-space:nowrap';
    c.innerHTML = '<span id="team-label">Team</span> <button id="team-visit" type="button" style="cursor:pointer;margin-left:6px;font:inherit;padding:0 8px;border:1px solid #1f5fd6;border-radius:8px;background:#1f5fd6;color:#fff">Visit</button> <span id="team-delivery"></span> <span id="team-warn" style="color:#b3261e"></span>';
    var main = $('idmp-status-main'); if (main && main.parentNode === host) host.insertBefore(c, main.nextSibling); else host.appendChild(c);
    $('team-visit').addEventListener('click', function () { visit(); });
    var box = document.createElement('div'); box.id = 'team-conflicts'; box.style.cssText = 'font-size:12px;color:#b3261e;padding:0 12px';
    host.parentNode.insertBefore(box, host.nextSibling);
    return c;
  }
  async function render() {
    try { await refreshExecutors(); } catch (eX) { log('🔴 §TEAM_EXECUTORS ' + (eX && eX.message)); }
    var c = ensureChip(); if (!c) return;
    if (!S) { $('team-label').textContent = 'Team · not paired — open the Team pill to start or join a team'; $('team-visit').disabled = true; c.setAttribute('data-team', 'unpaired'); return; }
    $('team-visit').disabled = false;                       // it was disabled while unpaired; pairing from the panel happens in this session (§13.9)
    var L = await S.order(), dl = S.delivery(), gaps = S.gaps().length, cf = await S.conflicts();
    var devs = Object.keys(L.roster.devices).length, mine = L.roster.devices[dev.kid];
    var lo = Object.keys(localOnly).length;
    $('team-label').textContent = 'Team · ' + codeOf(dev.kid) + ' · team devices ' + devs + (mine ? '' : ' · waiting for approval — press Visit');
    $('team-delivery').textContent = 'my ops ' + dl.length + ' · seen ' + dl.filter(function (x) { return x.state === 'SEEN'; }).length + ' · refused ' + dl.filter(function (x) { return x.verdict === 'REFUSED'; }).length +
      ' · waiting on ' + gaps + ' · last visit ' + (lastVisitAt ? new Date(lastVisitAt).toLocaleTimeString() : 'never');
    var tr = (cfg && cfg.trial && global.TeamTrial) ? global.TeamTrial.status((await S.placedEnvelopes()).map(function (x) { return x.env; }), { trial: true, cycles: (global.TeamDefaults || {}).trialCycles, cap: (global.TeamDefaults || {}).trialOpCap }) : null;
    c.setAttribute('data-trial', tr ? (tr.finished ? 'finished' : 'open') : 'none');
    var bmsg = baseBlocked() ? baseSt.message : '';
    c.setAttribute('data-base', baseSt.state);
    $('team-warn').textContent = (bmsg ? '⚠ ' + bmsg + ' ' : '') + (tr && tr.finished ? 'Trial cycle finished — use your own repo and key to continue. ' : '') + (lo ? '⚠ ' + lo + ' local-only (not shared)' : '');
    $('team-warn').title = Object.keys(localOnly).map(function (u) { return u.slice(0, 8) + ': ' + localOnly[u]; }).join('\n');
    if (global.TeamVersions && global.TeamVersions.paint) global.TeamVersions.paint(c, $('team-warn'), L.verdict);          // §16.34: "N changes wait — update this app" (the words live in team_versions.js)
    var box = $('team-conflicts'), byUu = {};
    // name the record: its documentno when the projection carries it (the log's CREATE), else its uu
    (await S.placedEnvelopes()).forEach(function (p) { if (p.env.body.op_type === 'CRUD_CREATE') byUu[p.env.target.uu] = (p.env.body.params.fields || {}).documentno || null; });
    if (box) box.innerHTML = cf.map(function (k) {
      return '<div class="team-conflict" data-uu="' + k.uu + '" data-table="' + k.table + '" data-col="' + k.col + '">⚠ ' + k.table + ' ' + (byUu[k.uu] ? '<b>' + byUu[k.uu] + '</b> ' : '') + '(' + k.uu.slice(0, 8) + ') · ' + k.col + ': values ' +
        k.candidates.map(function (x) { return JSON.stringify(x.value); }).join(' / ') + ', kept ' + JSON.stringify(k.before) + ' — ' + esc(coreMsg('CurrentRecordModified')) + '</div>'; }).join('');
    c.setAttribute('data-team', 'ready'); c.setAttribute('data-conflicts', String(cf.length)); c.setAttribute('data-localonly', String(lo));
    lastRefused = dl.filter(function (x) { return x.verdict === 'REFUSED'; }).length;
  }

  // ═══ PEOPLE STRIP (TEAMWORK_FRAMEWORK §13.12.G.1 + §13.12.H uses 1,2) — Witnesses: W-PEOPLE-STRIP, W-SCOPE-STRIP, W-SCOPE-INBOX (erp/tests/witness_people_strip.js) ═══
  // GENERIC: nothing here names a window or a table. Seams: the page's `idmp:record` event (idempiere.html refreshForm) IN, the Visit OUT (focus board over the pipe).
  var TP = global.TeamPeople, TFo = global.TeamFocus, tfBoard = null, tfPipe = null, focusOwn = [], focusSince = null, savedAt = {}, lastSeam = null,
      focusObjs = [], headsArr = [], peopleList = [], inboxList = [], pview = null, dictC = null, clock = function () { return Date.now(); }, lastHuKey = '';
  function peopleDict() { if (dictC) return dictC; try { if (adDb() && global.AdAccess && TP) dictC = TP.dictFromDb(shim(adDb()), global.AdAccess); } catch (e) { log('🔴 §PEOPLE_DICT ' + (e && e.message)); } return dictC; }
  function board() { if (!TFo || !S || !pipe) return null; if (!tfBoard || tfPipe !== pipe) { tfPipe = pipe; tfBoard = TFo.create({ pipe: pipe, self: dev, space: cfg.space, person: dev.person_uu, log: log }); } return tfBoard; }
  function onSeam(d) {
    lastSeam = d || {}; var now = Date.now(), cur = focusOwn.length ? focusOwn[0] : null;
    if (d && d.view === 'form' && d.uu) {
      if (savedAt[d.table] && now - savedAt[d.table] < 2000) { if (focusOwn.length) { focusOwn = []; focusSince = now; } }                 // just saved on this table: the form re-mounts (or shows the new record) by itself; "clear on save"
      else if (!cur || cur.uu !== d.uu) { focusOwn = [{ table: d.table, uu: d.uu, label: d.label, since: now }]; focusSince = now; log('§PEOPLE_FOCUS_OWN open table=' + d.table + ' uu=' + d.uu.slice(0, 8) + ' label=' + d.label); }
      else cur.label = d.label || cur.label;
    } else if (cur) { focusOwn = []; focusSince = now; log('§PEOPLE_FOCUS_OWN closed (view=' + (d && d.view) + ')'); }
    paintHeadsUp();
  }
  global.addEventListener('idmp:record', function (e) { onSeam(e.detail); });
  global.addEventListener('overlay:committed', function (e) {                       // "clear on save": a write to a table drops the focus on it, and the form that re-mounts right after (or shows the NEW record) must not re-add it (2 s, named L5)
    var d = e.detail || {}, t = String(d.table || '').toLowerCase(), cur = focusOwn.length ? focusOwn[0] : null;
    if (!t || !/^(CRUD_(CREATE|UPDATE|DELETE)|DOC_ACTION)$/.test(String(d.op_type)) || /^ad_/.test(t)) return;
    savedAt[t] = Date.now();
    if (cur && cur.table === t) { log('§PEOPLE_FOCUS_OWN saved table=' + t + ' uu=' + cur.uu.slice(0, 8) + ' (focus cleared on save)'); focusOwn = []; focusSince = Date.now(); }
  });
  function allEnvs() { return S.query('SELECT envelope FROM cl_op').map(function (r) { return JSON.parse(r.envelope); }); }
  async function refreshPeople() {
    if (!S || !TP || !dev) return null;
    var L = await S.order(), R = L.roster, dict = peopleDict(), dirc = TP.directoryFrom(R, dict ? dict.roleName : null), me = dirc.filter(function (p) { return p.kids.indexOf(dev.kid) >= 0; })[0] || null;
    var memo = {}, scopeOf = function (rid) { if (rid == null || !dict) return null; return memo[rid] || (memo[rid] = TP.roleScope(rid, dict)); };
    var myScope = me ? scopeOf(me.role) : null, pref = (cfg && cfg.peopleMode) || 'scope', mode = myScope && pref === 'scope' ? 'scope' : 'all';
    var envs = allEnvs(), D = global.TeamDefaults || {};
    peopleList = TP.rank(envs, headsArr, focusObjs, clock(), { directory: dirc, ttlMs: D.focusTtlMs, mode: mode, scope: myScope, scopeOf: scopeOf, selfPerson: me && me.person });
    await refreshScope(); var bm = {}; bindTypes().forEach(function (t) { recordsOf(t.table, peopleList.map(function (p) { return p.person; })).forEach(function (r) { bm[r.uu] = r.label; }); });   // §44: a person bound to a record shows it by name
    peopleList.forEach(function (p) { if (bm[String(p.person).toLowerCase()]) p.boundTo = bm[String(p.person).toLowerCase()]; });
    if (cfg && cfg.avatar) peopleList.forEach(function (p) { if (p.self) p.avatar = cfg.avatar; });   // my own choice shows at once; the others get it at my next Visit (§15.15.2)
    var kidP = {}, kidR = {}; dirc.forEach(function (p) { p.kids.forEach(function (k) { kidP[k] = p; }); });
    var placed = (await S.placedEnvelopes()).map(function (x) { return x.env; });
    inboxList = TP.inboxFor(myScope, placed, { selfPerson: me && me.person, roleOfKid: function (k) { return kidP[k] ? kidP[k].role : null; }, personOfKid: function (k) { return kidP[k] ? kidP[k].person : null; }, nameOfKid: function (k) { return kidP[k] ? kidP[k].name : k.slice(0, 8); } });
    var col = TP.collapse(peopleList, mode);
    pview = { me: me, mode: pref, effectiveMode: mode, hide: !!(cfg && cfg.hideFocus), people: peopleList, shown: col.shown, others: col.others, inbox: inboxList, scope: myScope, scopeAvailable: !!myScope, directory: dirc, unsupported: board() && board().unsupported() };
    log('§PEOPLE_VIEW mode=' + mode + ' people=' + peopleList.length + ' shown=' + col.shown.length + ' others=' + col.others.length + ' focusObjs=' + focusObjs.length + ' heads=' + headsArr.length + ' inbox=' + inboxList.length +
        ' order=[' + peopleList.map(function (p) { return p.name + (p.self ? '*' : '') + ':' + (p.ageMs == null ? '-' : Math.round(p.ageMs / 1000) + 's') + ':' + p.focus.length; }).join(', ') + ']');
    paintHeadsUp(); try { global.dispatchEvent(new CustomEvent('team:people')); } catch (e) {}
    return pview;
  }
  async function peopleRound() {
    try {
      var L = await S.order(), R = L.roster; if (!R.devices[dev.kid]) return;                // an un-approved device has nothing to publish or verify against
      var b = board(); if (!b) return;
      await b.publish(focusOwn, { off: !!cfg.hideFocus, since: focusSince, avatar: cfg.avatar });
      var col = await b.collect(R); focusObjs = col.focus; headsArr = col.heads;
      await refreshPeople();
    } catch (e) { log('🔴 §PEOPLE_ROUND ' + (e && e.stack || e)); }
  }
  function paintHeadsUp() {
    var host = $('idmp-content'), old = $('team-headsup'); if (old) old.remove();
    var me = pview && pview.me; if (!host || !me || !lastSeam || lastSeam.view !== 'form' || !lastSeam.uu) { lastHuKey = ''; return; }
    var hu = TP.headsUpFor(lastSeam.uu, me.person, peopleList); if (!hu.length) { if (lastHuKey) log('§PEOPLE_HEADSUP uu=' + lastSeam.uu.slice(0, 8) + ' none'); lastHuKey = ''; return; }
    var div = document.createElement('div'); div.id = 'team-headsup'; div.setAttribute('role', 'status'); div.setAttribute('data-uu', lastSeam.uu);
    div.style.cssText = 'margin:0 0 8px;padding:8px 12px;min-height:44px;box-sizing:border-box;border:1px solid #b36b00;border-radius:8px;background:#fff4e0;color:#5a3600;font:14px/1.4 system-ui,sans-serif';
    div.innerHTML = hu.map(function (h) { return '<div class="team-headsup-line" data-person="' + h.person + '" style="display:flex;align-items:center;gap:8px">' + avatarOfPerson(h.person, 28) + '<span><b>' + esc(h.name) + '</b> is editing this (' + TP.ageText(h.ageMs) + ')</span></div>'; }).join('');
    host.insertBefore(div, host.firstChild);
    var key = lastSeam.uu + '|' + hu.map(function (h) { return h.person; }).join(','); if (key !== lastHuKey) log('§PEOPLE_HEADSUP uu=' + lastSeam.uu.slice(0, 8) + ' by=[' + hu.map(function (h) { return h.name + ':' + TP.ageText(h.ageMs); }).join(', ') + ']'); lastHuKey = key;
  }
  function avatarOfPerson(person, px) { var AV = global.TeamAvatars; if (!AV) return ''; var row = peopleList.filter(function (p) { return p.person === person; })[0]; return '<span class="tp-avatar" data-avatar="' + AV.resolve(row && row.avatar, person) + '" style="flex:0 0 ' + px + 'px;width:' + px + 'px;height:' + px + 'px;border-radius:50%;overflow:hidden;display:block">' + AV.svg(AV.resolve(row && row.avatar, person), px) + '</span>'; }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  async function cfgSet(k, v) { var c = (await kvGet('cfg')) || {}; c[k] = v; await kvPut('cfg', c); if (cfg) cfg[k] = v; }
  async function setAvatar(id) { if (!(global.TeamAvatars && global.TeamAvatars.valid(id))) throw new Error('unknown avatar ' + id); await cfgSet('avatar', id); log('§PEOPLE_AVATAR chosen=' + id + ' (the others see it after my next Visit)'); await refreshPeople(); }
  async function setHide(on) { await cfgSet('hideFocus', !!on); log('§PEOPLE_SWITCH hideFocus=' + !!on + ' (applies from the next Visit)'); }
  async function setMode(m) { await cfgSet('peopleMode', m === 'all' ? 'all' : 'scope'); log('§PEOPLE_SWITCH peopleMode=' + (m === 'all' ? 'all' : 'scope')); await refreshPeople(); }
  function history(person, n) { return pview ? TP.historyOf(person, allEnvs(), n == null ? 10 : n, { directory: pview.directory }) : []; }

  // ═══ boot ═══════════════════════════════════════════════════════════════════════════════════════════════════════
  async function boot() {
    // §41.2 L4b (J's seam): the executor rows Team flips to IsActive='N' are a PROJECTION of the policy, not base data - a snapshot of the resident bundle must persist the base. projectExecutorRows(null) restores every row Team owns; (exe.map) puts them back.
    if (global.BundleProjection && typeof global.BundleProjection.register === 'function') global.BundleProjection.register({ name: 'team-executors', unproject: function () { projectExecutorRows(null); }, reproject: function () { projectExecutorRows(exe.map); } });
    for (var i = 0; i < 600 && !(global.__crud && global.__idmpDb && global.KernelOps && global.CrudCore && global.initSqlJs && global.AdAccess && global.CommStore && document.getElementById('idmp-status')); i++) await new Promise(function (r) { setTimeout(r, 100); });
    if (!(global.__crud && global.CommStore && global.__idmpDb)) { log('🔴 §TEAM_BOOT prerequisites missing'); _resolveReady(false); return; }
    if (global.TeamVersions) await global.TeamVersions.ready;      // §16.33: signed upcaster sets are verified and loaded BEFORE the first fold
    SQL = await global.initSqlJs({ locateFile: function (f) { return 'sqljs/' + f; } });
    dev = await kvGet('device'); cfg = (await kvGet('cfg')) || {};
    // CL8 (encryption): an older device object gets its ECDH key from the comm layer's own helper, and the SAME object is written back so the
    // phone page and this page keep ONE identity. Absent helper (pre-CL8 comm layer) = no-op.
    if (dev && global.CommStore.ensureDh && !dev.dhPrivateKey) { try { await global.CommStore.ensureDh(dev); await kvPut('device', dev); log('§TEAM_BOOT dh key ensured for ' + dev.kid); } catch (e) { log('§TEAM_BOOT ensureDh failed ' + (e && e.message)); } }
    applySystemDefault();
    if (!dev) { await newDevice(); log('§TEAM_BOOT new device ' + dev.kid + ' (no phone page needed — pair from the Team panel)'); }
    if (!cfg.space) { log('§TEAM_BOOT not paired — device=' + !!dev + ' space=false (open the Team pill: Start a team or Join)'); _resolveReady(false); await render(); return; }
    var own = await kvGet('erp_db'), seed = own ? null : await kvGet('db');
    await openStore(own || seed || undefined);
    sent = (await kvGet('erp_sent')) || {}; localOnly = (await kvGet('erp_localonly')) || {};
    var fr = await kvGet('erp_replfired');                         // §13.2 2.6: a device upgrading to replica firing takes what it ALREADY holds as fired (never re-runs a trigger on old history)
    if (fr) fired = fr; else { fired = {}; (await S.placedEnvelopes()).forEach(function (p) { if (p.env.author !== dev.kid) fired[p.hash] = 1; }); log('§TEAM_REPLICA_BASELINE already-received=' + Object.keys(fired).length + ' (taken as fired: replica timings run only for rows received from now on)'); await kvPut('erp_replfired', fired); }
    log('§TEAM_BOOT device=' + dev.kid + ' space=' + cfg.space.slice(0, 12) + ' store=' + (own ? 'own(erp_db)' : seed ? 'seeded-from-phone-page' : 'new') + ' pipe=' + pipe.id + ' sent=' + Object.keys(sent).length + ' localOnly=' + Object.keys(localOnly).length);
    if (!own) await persist();
    try { await verifyBase(); } catch (e) { log('🔴 §TEAM_BASE verify failed at boot ' + (e && e.stack || e)); }
    try { await pinTrust(); } catch (e) { log('🔴 §TEAM_PLAN_SIG pin failed at boot ' + (e && e.stack || e)); }   // before ready: no commit is judged under a trust list the space did not pin
    await adoptSets();                                            // §16.35: sets an admin published in the POLICY are adopted before the first fold
    _resolveReady(true); await render();
  }

  // ═══ PAIRING from the Team panel (§13.9) — ported from common/comm/comm_phone.html, same CommStore calls ═══
  function applySystemDefault() {          // no key of its own yet → the system default (trial) setup, as the phone page does
    var D = global.TeamDefaults; if (cfg && !cfg.token && D && D.token) { cfg.owner = D.owner; cfg.repo = D.repo; cfg.token = D.token; cfg.trial = true; log('§TEAM_BOOT system-default setup applied repo=' + cfg.owner + '/' + cfg.repo + ' trial=true'); }
  }
  async function newDevice() { dev = await global.CommStore.newDevice(); dev.person_uu = global.crypto.randomUUID(); await kvPut('device', dev); }
  async function openStore(bytes) {
    baseSt = { state: 'unknown' }; bmemo = {};
    storeOpts = { SQL: SQL, space: cfg.space, self: dev, access: access, tableId: tableId, log: log, messageText: coreMsg, baseRow: hostBaseRow, docno: hostDocNo, versions: global.TeamVersions && global.TeamVersions.registry };    // baseRow: asked only in a space that has a base; versions (§16.33): shape-version judgement, nothing judged differently at shape 1 with no sets
    S = global.CommStore.open(new SQL.Database(bytes), storeOpts);
    var pu = new URLSearchParams(global.location.search).get('pipe');
    pipe = pu ? global.CommPipe.httpPipe(pu) : global.CommPipe.ghPipe({ owner: cfg.owner || OWNER, repo: cfg.repo || REPO, token: cfg.token, self: dev.kid, minGapMs: Number(new URLSearchParams(global.location.search).get('gap') || 10000) });
  }
  function needKey() { var pu = new URLSearchParams(global.location.search).get('pipe'); if (!pu && !cfg.token) throw new Error('No key: open the Team panel and use the system default, or save your own repository and key'); }
  async function fresh() { sent = {}; localOnly = {}; fired = {}; replExc = []; await kvPut('erp_db', null); await kvPut('erp_sent', {}); await kvPut('erp_localonly', {}); await kvPut('erp_replfired', {}); }
  async function found(plan) {
    await ready; needKey(); await fresh();
    var bi = null; try { bi = await loadedBase(); } catch (e) { log('§TEAM_BASE none reason=' + (e && e.message) + ' (space founded WITHOUT a base)'); }
    var sp = await global.CommStore.newSpace('team-poc', dev, dev.person_uu, 'founder', 102, spaceOpts(bi, plan));
    cfg.space = sp.space; cfg.founder = true; await kvPut('cfg', cfg); await openStore(undefined); await S.genesis(sp.params); await pinTrust();
    log('§TEAM_PAIR founded space ' + sp.space.slice(0, 12) + (bi ? ' base=' + bi.name + ' sha=' + bi.sha256.slice(0, 12) + ' bytes=' + bi.bytes : ' (no base)')); await verifyBase(); await visit(); await persist(); await render(); return sp.space;
  }
  async function join(inv) {
    await ready; needKey(); inv = String(inv || '').trim().toLowerCase(); if (!/^[0-9a-f]{64}$/.test(inv)) throw new Error('An invite is 64 characters 0-9 a-f');
    await fresh(); cfg.space = inv; cfg.founder = false; await kvPut('cfg', cfg); await openStore(undefined);
    var rqName = 's/' + cfg.space + '/r/' + dev.kid, rqBytes = new TextEncoder().encode(JSON.stringify({ space: cfg.space, kid: dev.kid, jwk: dev.pubJwk, dh_jwk: dev.dhPubJwk, person_uu: dev.person_uu, name: 'device ' + codeOf(dev.kid) }));
    if (pipe.putMany) await pipe.putMany([{ name: rqName, bytes: rqBytes }]); else await pipe.put(rqName, rqBytes);   // folder pipe has put only; the GitHub pipe batches
    log('§TEAM_PAIR join request posted, code ' + codeOf(dev.kid)); await persist(); await render();
  }
  async function leave() {
    await ready; delete cfg.space; delete cfg.founder; await kvPut('cfg', cfg); await fresh(); S = null; pipe = null; baseSt = { state: 'unknown' }; bmemo = {}; lastVisitAt = null; tfBoard = null; tfPipe = null; focusObjs = []; headsArr = []; peopleList = []; inboxList = []; pview = null;
    log('§TEAM_PAIR left the team — same device ' + codeOf(dev.kid)); await render();
  }
  async function requests() {
    if (!S) return []; var L = await S.order(), names = await pipe.list('s/' + cfg.space + '/r/'), out = [];
    for (var n of names) { var b = await pipe.get(n); if (!b) continue; var rq = JSON.parse(new TextDecoder().decode(b));
      if (rq.space !== cfg.space || L.roster.devices[rq.kid] || rq.kid !== await global.CommStore.kidOf(rq.jwk)) continue; out.push({ rq: rq, code: codeOf(rq.kid) }); }
    log('§TEAM_PAIR requests listed: ' + names.length + ' pending=' + out.length); return out;
  }
  // §44 C2: what a device approved at `roleId` can be BOUND to. The record types are the terminal FK targets of the plan's DOWN rows that address one entity (`by`) for that role, named by the dictionary;
  // the records are read through the host's ONE tip reader (a record made this session is offered). Nothing here names a table: an office plan, or a role with no `by` row, has no types.
  var colMemo = {};
  function colsOf(tbl) { return colMemo[tbl] || (colMemo[tbl] = (function () { var o = {}; try { bq(adDb(), 'SELECT lower(c.columnname) AS n FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)=?', [tbl]).forEach(function (r) { o[r.n] = 1; }); } catch (e) {} return o; })()); }
  function bindTypes(roleId) {
    var seen = {}, out = [];
    global.TeamScope.downBy(roleId).forEach(function (r) { var t = String(r.table).toLowerCase(); r.by.forEach(function (c) { t = t && fkTarget(t, c); });
      if (t && !seen[t] && /^[a-z][a-z0-9_]*$/.test(t)) { seen[t] = 1; var n = bq(adDb(), 'SELECT name AS n FROM ad_table WHERE lower(tablename)=?', [t]); out.push({ table: t, label: n.length && n[0].n ? n[0].n : t }); } });
    // TEAMWORK §48.13/§48.11c: a plan with nothing to bind (the office plan) offers the USER — a device approved as its login user carries that AD_User_UU as its roster person,
    // which is what the fold reads to check the station prefix of the numbers it sends (docno-station). A plan that binds records (POS tills, borrowers) is unchanged.
    if (!out.length && global.TeamScope.kind() === 'office') { var un = bq(adDb(), "SELECT name AS n FROM ad_table WHERE lower(tablename)='ad_user'"); out.push({ table: 'ad_user', label: un.length && un[0].n ? un[0].n : 'ad_user', optional: true }); }
    return out;
  }
  function recordsOf(tbl, uus) {                                       // [{uu, label}] - the tip's records of `tbl`: the active ones of this client (the picker), or exactly these _uu (the names on the people strip)
    var rd = global.__tipRead, cols = colsOf(tbl); if (!rd || !cols[tbl + '_uu']) return [];
    var ic = rd.ident(tbl).filter(function (c) { return !/_id$/i.test(c); }), cid = global.__idmpClient && Number(global.__idmpClient.id);
    var w = tbl + '_id<>0 AND ' + tbl + '_uu IS NOT NULL' + (uus ? ' AND ' + tbl + "_uu IN ('" + uus.filter(function (u) { return /^[0-9a-f-]{8,40}$/i.test(u); }).join("','") + "')" : (cols.isactive ? " AND isactive='Y'" : '') + (cols.ad_client_id && cid ? ' AND ad_client_id IN (0,' + cid + ')' : ''));
    return rd.rows('SELECT ' + tbl + '_uu AS uu' + ic.map(function (c) { return ', ' + c; }).join('') + ' FROM ' + tbl + ' WHERE ' + w + ' ORDER BY ' + (ic.length ? ic.join(', ') : tbl + '_id')).map(function (r) {
      return { uu: String(r.uu).toLowerCase(), label: ic.map(function (c) { return r[c.toLowerCase()]; }).filter(function (x) { return x != null && x !== ''; }).join(' ') || String(r.uu).slice(0, 8) }; });
  }
  async function bindingFor(roleId) {                                  // -> null (nothing to bind at this role) | { types: [{table, label, options: [{uu, label}]}] }
    await refreshScope(); var ts = bindTypes(roleId); if (!ts.length) return null;
    return { optional: ts.every(function (t) { return !!t.optional; }), types: ts.map(function (t) { return { table: t.table, label: t.label, options: recordsOf(t.table) }; }) };
  }
  function roleList() { return shim(adDb()).prepare("SELECT ad_role_id AS id, name FROM ad_role WHERE ad_client_id IN (0, 11) ORDER BY ad_role_id").all(); }
  // entityUu (optional, §38.15): the device is bound to a RECORD - the person is created with person_uu = that record's _uu (a borrower's C_BPartner_UU, a till's AD_Org_UU), signed by this admin in the roster;
  // a second device of the same record is enrolled onto the person that already exists. Without it: exactly as before.
  async function approve(rq, roleId, entityUu) {
    var pu = entityUu ? String(entityUu).toLowerCase() : rq.person_uu;
    if (!entityUu || !(await S.order()).roster.persons[pu]) await S.addPerson({ person_uu: pu, name: rq.name, ad_role_id: Number(roleId), comm_admin: false });
    await S.enroll(rq.kid, rq.jwk, pu, rq.dh_jwk);
    log('§TEAM_PAIR approved ' + codeOf(rq.kid) + ' as role ' + roleId); await visit(); await render();
  }
  async function pairState() {
    await ready; var st = { device: dev ? dev.kid : null, code: dev ? codeOf(dev.kid) : null, space: cfg && cfg.space || null, founder: !!(cfg && cfg.founder), enrolled: false, devices: 0 };
    if (S) { var L = await S.order(); st.devices = Object.keys(L.roster.devices).length; st.enrolled = !!L.roster.devices[dev.kid]; st.plan = L.roster.ok ? L.roster.plan : null; } return st;
  }

  global.TeamSync = { seatbeltState: seatbeltState, publishUpcasters: async function (sets) { await ready; var op = await global.TeamVersions.publish(S, sets); await visit(); return op; },
                      // §38.10 (G-8): an owner-signed statement (executors map / plan-trust rotation) signed offline with build/scriptor/sign_plan.js stmt — the engine judges it
                      publishStatement: async function (stmt) { await ready; if (!S) return { ok: false, reason: 'not-paired' }; var r = await S.publishStatement(stmt); if (r.hash) await visit();
                        log('§TEAM_POLICY_PUBLISH kind=' + (stmt && stmt.kind) + ' ok=' + r.ok + ' verdict=' + (r.verdict || r.reason)); return r; }, onCommit: onCommit, visit: visit, ready: ready, found: found, join: join, leave: leave, requests: requests, approve: approve, roles: roleList, planChoices: planChoices, bindingFor: bindingFor, pairState: pairState,
                      inviteLink: function () { var u = new URL(global.location.href); u.searchParams.set('team', '1'); u.hash = 'join=' + (cfg && cfg.space || ''); return u.toString(); }, store: function () { return S; }, versionState: function () { return S && S.versionState ? S.versionState() : Promise.resolve(null); }, render: render, baseState: function () { return baseSt; }, verifyBase: verifyBase, baseRow: hostBaseRow,
                      stationLocal: global.TeamScope.locals, scopeOf: global.TeamScope.scopeOf, sent: function () { return sent; }, localOnly: function () { return localOnly; }, replicaFired: function () { return fired; }, replicaExceptions: function () { return replExc.slice(); },
                      peopleView: function () { return pview; }, refreshPeople: refreshPeople, setAvatar: setAvatar, avatarOf: function () { return cfg && cfg.avatar || null; }, history: history, setHide: setHide, setMode: setMode, focusOwn: function () { return focusOwn.slice(); },
                      _setClock: function (f) { clock = f || function () { return Date.now(); }; }, _pinTrust: pinTrust, _spaceOpts: spaceOpts, _refreshExecutors: refreshExecutors, _attach: async function (st, d) { S = st; dev = d; return refreshScope(); }, localOnly: function () { return localOnly; }, _release: releaseFor, _localOnly: function () { return localOnly; }, _sentMap: function () { return sent; }, _state: function () { return JSON.parse(JSON.stringify({ sent: sent, localOnly: localOnly })); }, _restore: function (x) { sent = x.sent; localOnly = x.localOnly; }, _translate: translate, _withRoster: withRoster, _project: project, _scopeCtx: function () { return scopeCtx; }, _resetDict: function () { dictC = null; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { boot().catch(function (e) { log('🔴 §TEAM_BOOT ' + (e && e.stack || e)); _resolveReady(false); }); });
  else boot().catch(function (e) { log('🔴 §TEAM_BOOT ' + (e && e.stack || e)); _resolveReady(false); });
})(typeof window !== 'undefined' ? window : globalThis);
