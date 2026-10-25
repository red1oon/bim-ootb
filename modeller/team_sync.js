// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* team_sync.js (MODELLER) — the Modeller's signed GEOM op-log in TEAM MODE: the OpLog <-> the local comm layer.
 * Implementing bim-compiler prompts/TEAMWORK_FRAMEWORK.md §15 (Modeller case) — Witness: W-TEAM-MODELLER (modeller/tests/witness_team_modeller.js).
 * The ERP twin is erp/team_sync.js (§13.1); this file copies its shape and none of its table logic.
 *
 * GENERIC: no per-element-type branches. One named op-class table (CLASS below, §15.2) says which GEOM ops are a record CREATE and which is a MOVE;
 * every other GEOM op stays on the device as a visible "local-only" with its reason. Nothing in bonsai_oplog.js is edited: the adapter listens
 * to the OpLog's own commit funnel (the 'bonsai:oplog' event dispatched by OpLog._emit) and installs a rebuilt model through OpLog.importBytes.
 *   OUT  scan(): every kernel_ops GEOM row not yet shared -> v3 envelope (table 'bim_element', target uu = the row's op_uuid; a move = per-axis
 *        absolute offset change pos_x|pos_y|pos_z {old,new}, so the comm layer's per-column conflict rule judges it, §15.3-15.4).
 *   IN   visit(): store.sync(pipe) -> store.foldable() -> rebuild the kernel_ops table = kept local rows + the projection of the comm log -> importBytes.
 * Inert unless the page is opened with ?team=1 or localStorage.teamMode==='1' (the ERP's switch; the ONE Team icon's panel turns it on, §15.15.1). Identity/space/token are read from the
 * same-origin IndexedDB 'comm_phone' (written by the pairing page OR by this adapter's own in-panel pairing); this page keeps its OWN comm store bytes under 'modeller_db'.
 */
(function (global) {
  'use strict';
  var _on = /[?&]team=1(&|$)/.test(String(global.location && global.location.search)); try { _on = _on || global.localStorage.getItem('teamMode') === '1'; } catch (e) {}
  if (!_on) return;   // without ?team=1 (or the Team panel's switch) nothing changes

  var OWNER = 'red1oon', REPO = 'bim-teams-pipe';
  var MSG_CRM = 'Current record was changed by another user, please ReQuery';      // AD_Message CurrentRecordModified (same text as the ERP twin)
  var TABLE = 'bim_element';                                                       // the pseudo-table every element lives in (§15.2)
  var AX = ['x', 'y', 'z'];
  // THE one op-class list, DERIVED from the scriptor's compiled plan through the shared reader TeamScope (TEAMWORK_FRAMEWORK §24, §25.1) — never a literal. Every value of the plan's
  // geom_op column is a CREATE; GEOM_MOVE is a MOVE iff the plan carries pos_x|y|z. No plan / no matching flow / a plan whose signature a configured trust list rejects => {} : nothing is shared.
  function classFromPlan() {
    var c = {}, T = global.TeamScope, vals = T && T.values(TABLE, 'geom_op');
    if (!vals) return c;
    vals.forEach(function (v) { c[v] = 'create'; });
    if (AX.every(function (a) { return T.carries(TABLE, 'pos_' + a); })) c.GEOM_MOVE = 'move';
    return c;
  }
  var CLASS = classFromPlan();
  // §32: the plan is verified (a no-op without a trust list) BEFORE `ready` resolves, so no scan can judge an op against an unverified plan and mark it local-only for good.
  async function verifyPlan(why) {                                     // -> the verdict; recomputes the op list and prints the plan line and the verdict (the app's own evidence)
    var T = global.TeamScope, st = T ? await T.verify(global.crypto && global.crypto.subtle) : 'missing';
    CLASS = classFromPlan();
    var n = Object.keys(CLASS).filter(function (k) { return CLASS[k] === 'create'; }).length;
    var sm = T && T.summary();
    if (!n || !sm) console.log('§TEAM_PLAN missing — nothing is shared');
    else console.log('§TEAM_PLAN hash=' + sm.hash.slice(0, 12) + ' creates=' + n + ' move=' + (CLASS.GEOM_MOVE ? AX.map(function (a) { return 'pos_' + a; }).join('|') : 'none'));
    console.log('§TEAM_PLAN_SIG state=' + st + (why ? ' ' + why : ''));
    return st;
  }
  var planVerified = verifyPlan().catch(function (e) { console.log('🔴 §TEAM_PLAN_SIG ' + (e && e.message)); });
  // §33.2: the trust list a space pinned in its GENESIS replaces the deployment's window.TEAM_PLAN_TRUST (the space decides); the plan is re-verified under it. No genesis list => the deployment list stays.
  async function pinTrust(st) {
    st = st || S; if (!st || !st.planTrust) return;
    var gt = await st.planTrust(); if (!gt) return;
    if (JSON.stringify(gt) === JSON.stringify(global.TEAM_PLAN_TRUST || [])) return;
    global.TEAM_PLAN_TRUST = gt; await verifyPlan('trust=genesis(' + gt.length + ')');
  }
  function spaceOpts() { var t = global.TEAM_PLAN_TRUST; return Array.isArray(t) && t.length ? { planTrust: t } : undefined; }   // what a founder pins in the genesis: the deployment's plan trust list (public keys)

  var SQLm = null, dev = null, cfg = null, S = null, pipe = null, sent = {}, localOnly = {}, lastVisitAt = null, lastSyncRep = null, catchup = null, enrolled = false, attached = false;
  var _resolveReady, readyBoot = new Promise(function (r) { _resolveReady = r; }), ready = readyBoot.then(function (v) { return planVerified.then(function () { return v; }); });
  var chain = Promise.resolve();                                                   // scan / visit are serialised (one writer of the model at a time)
  var $ = function (id) { return document.getElementById(id); };
  function log(m) { console.log(m); }
  function exclusive(fn) { var p = chain.then(fn, fn); chain = p.catch(function () {}); return p; }

  // ── this browser's storage: the phone page's IndexedDB 'comm_phone' (same schema, version 1) ──
  function idb() { return new Promise(function (res, rej) { var r = indexedDB.open('comm_phone', 1); r.onupgradeneeded = function () { r.result.createObjectStore('kv'); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
  async function kvGet(k) { var d = await idb(); return new Promise(function (res) { var q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = function () { res(q.result); }; q.onerror = function () { res(undefined); }; }); }
  async function kvPut(k, v) { var d = await idb(); return new Promise(function (res, rej) { var t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = function () { rej(t.error); }; }); }
  async function persist() { if (S) await kvPut('modeller_db', S.db.export()); await kvPut('modeller_sent', sent); await kvPut('modeller_localonly', localOnly); }

  // §15.5: open by design for any enrolled role (the roster already refused a device with no role) — there is no discipline x zone claim yet.
  function access(roleId, client, org, table) { return table === TABLE ? { allowed: true, reason: 'modeller-open (no discipline x zone claims yet)' } : { allowed: false, reason: 'not-a-modeller-table' }; }
  function codeOf(kid) { return kid.slice(0, 4).toUpperCase() + '-' + kid.slice(4, 8).toUpperCase(); }
  function uuidFromHash(h) { return h.slice(0, 8) + '-' + h.slice(8, 12) + '-4' + h.slice(13, 16) + '-8' + h.slice(17, 20) + '-' + h.slice(20, 32); }
  function r6(x) { var r = Math.round(Number(x) * 1e6) / 1e6; return r === 0 ? 0 : r; }

  // F7 (§15.1): the comm envelope refuses ANY negative integer in params as a device-local pk. A geometry value is not one: encode it, decode it back.
  function encV(v) {
    if (typeof v === 'number') return (Number.isInteger(v) && v < 0) ? { $n: String(v) } : v;
    if (Array.isArray(v)) return v.map(encV);
    if (v && typeof v === 'object') { var o = {}; Object.keys(v).forEach(function (k) { o[k] = encV(v[k]); }); return o; }
    return v;
  }
  function decV(v) {
    if (Array.isArray(v)) return v.map(decV);
    if (v && typeof v === 'object') { var ks = Object.keys(v); if (ks.length === 1 && ks[0] === '$n' && typeof v.$n === 'string') return Number(v.$n); var o = {}; ks.forEach(function (k) { o[k] = decV(v[k]); }); return o; }
    return v;
  }

  // ═══ OUT ═════════════════════════════════════════════════════════════════════════════════════════════════════════
  var COLS = 'id, op_uuid, op_type, parameters, input_guids, output_guid, undone, gid, user_tag, timestamp';
  function readRows(db, where) {
    var r = db.exec('SELECT ' + COLS + ' FROM kernel_ops' + (where ? ' WHERE ' + where : '') + ' ORDER BY id'), out = [];
    if (!r.length) return out;
    r[0].values.forEach(function (v) { var P = null; try { P = JSON.parse(v[3]); } catch (e) {}
      out.push({ id: v[0], uu: String(v[1] || '').toLowerCase(), type: v[2], P: P, params: v[3], input_guids: v[4], output_guid: v[5], undone: v[6], gid: v[7], tag: v[8], ts: v[9] }); });
    return out;
  }
  function isSeedRow(row) { return /^arcseed-/.test(String(row.gid || '')); }

  // translate one unsent GEOM row -> {local|quiet|skip} or {target, body}; `byId` holds the rows seen so far this scan (id -> rec with .shared and .off)
  function translate(row, byId) {
    if (!row.P) return { skip: 'unparseable' };
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(row.uu)) return { local: 'no-op_uuid' };
    var cls = CLASS[row.type];
    if (!cls) return { local: 'op-class ' + row.type + ' not shared in this slice (§15.2)' };
    if (cls === 'create') {
      if (row.P.parent != null) return { local: 'create-with-parent' };
      var f = { geom_op: row.type, geom: encV(row.P), pos_x: 0, pos_y: 0, pos_z: 0, ad_client_id: 0, ad_org_id: 0 };
      if (row.output_guid) f.output_guid = String(row.output_guid);
      if (row.input_guids) { try { f.input_guids = encV(JSON.parse(row.input_guids)); } catch (e) { f.input_guids = String(row.input_guids); } }
      return { target: { table: TABLE, uu: row.uu }, body: { op_type: 'CRUD_CREATE', params: { fields: f } }, intent: 'K6' };
    }
    var par = byId[row.P.parent];                                                 // move
    if (!par) return { local: 'parent-row-not-found' };
    if (!par.shared) return { local: 'target-not-a-team-record (parent row ' + row.P.parent + ' was never shared: seed or local-only)' };
    var ch = {}, n = 0;
    AX.forEach(function (a, i) { var d = r6(row.P['d' + a] || 0); if (d === 0) return; ch['pos_' + a] = { old: encV(r6(par.off[i])), new: encV(r6(par.off[i] + d)) }; n++; });
    if (!n) return { quiet: 'zero-move' };
    var p = { changes: ch }; if (row.P.induced != null) p.induced = String(row.P.induced);
    return { target: { table: TABLE, uu: par.uu }, body: { op_type: 'CRUD_UPDATE', params: p }, intent: 'K6' };
  }

  // §16.32: an op authored by an app whose shape version is above 1 says so (`sv`); at shape 1 the body is byte-identical to what it always was.
  function stamped(body) { var TV = global.TeamVersions, v = TV ? TV.appV(body.op_type) : 1; if (!(v > 1)) return body; var o = {}; Object.keys(body).forEach(function (k) { o[k] = body[k]; }); o.sv = v; return o; }

  async function scanInner() {
    await ready; if (!S) return 0;   // ready resolves once, at boot (false when unpaired); founding or joining later from the panel opens the store, so "is there a store" is the live test
    var O = global.Bonsai && global.Bonsai.oplog; if (!O || !O.db) return 0;
    var rows = readRows(O.db, "op_type LIKE 'GEOM%'"), byId = {}, n = 0, trial = null, fresh = 0;
    if (cfg && cfg.trial && global.TeamTrial) { var D = global.TeamDefaults || {};   // §13.8 T4 cap, judged once per scan
      trial = global.TeamTrial.status((await S.placedEnvelopes()).map(function (x) { return x.env; }), { trial: true, cycles: D.trialCycles, cap: D.trialOpCap });
      if (trial.finished) log('§TEAM_TRIAL ' + trial.reason + ' cycles=' + trial.cycles + ' businessOps=' + trial.businessOps + ' (new ops stay on this device)'); }
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i], rec = { id: row.id, uu: row.uu, shared: false, off: [0, 0, 0] }; byId[row.id] = rec;
      var known = row.tag === 'team' || !!sent[row.uu] || !!localOnly[row.uu] || isSeedRow(row);
      if (known) rec.shared = (row.tag === 'team' || !!sent[row.uu]) && CLASS[row.type] === 'create';
      else if (!row.undone) {                                                       // unsent + active: share it (an undone one waits: it may be redone)
        fresh++;
        var t = translate(row, byId);
        if (t.quiet) log('§TEAM_QUIET op=' + row.type + ' ' + t.quiet);
        else if (t.local || t.skip) { localOnly[row.uu] = t.local || t.skip; log('§TEAM_LOCALONLY op=' + row.type + ' row=' + row.id + ' uuid=' + row.uu.slice(0, 8) + ' reason=' + (t.local || t.skip) + ' (NOT SENT)'); }
        else if (trial && trial.finished) { localOnly[row.uu] = trial.reason; log('§TEAM_LOCALONLY op=' + row.type + ' row=' + row.id + ' reason=' + trial.reason + ' (NOT SENT)'); }
        else {
          try {
            var a = await S.author({ target: t.target, body: stamped(t.body), refs: [], intent: t.intent, ts: Date.now() });   // wall clock: the kernel rows carry deterministic synthetic timestamps (2023-11 + n s), useless for "active N min ago" (§13.12.G.1); ts is display-only, never ordering (§15.3)
            sent[row.uu] = a.hash; n++; rec.shared = CLASS[row.type] === 'create';
            log('§TEAM_OUT op=' + row.type + ' as=' + t.body.op_type + ' table=' + t.target.table + ' uu=' + t.target.uu.slice(0, 8) + ' seq=' + a.env.seq + ' cols=' + Object.keys(t.body.params.fields || t.body.params.changes).join(',') + ' hash=' + a.hash.slice(0, 12));
          } catch (e) { localOnly[row.uu] = 'author-failed ' + (e && e.message); log('§TEAM_LOCALONLY op=' + row.type + ' row=' + row.id + ' reason=author-failed ' + (e && e.message) + ' (NOT SENT)'); }
        }
      }
      if (!row.undone && row.type === 'GEOM_MOVE' && row.P && byId[row.P.parent]) AX.forEach(function (a, k) { byId[row.P.parent].off[k] += Number(row.P['d' + a] || 0); });   // running net offsets, as moveDeltaFor
    }
    if (catchup == null) { catchup = fresh; if (fresh) log('§TEAM_CATCHUP rows=' + fresh + ' (model already held features when team mode started: they are shared now)'); }
    if (n || fresh) { await persist(); await render(); }
    return n;
  }
  function scan() { return exclusive(scanInner); }

  // ═══ IN ══════════════════════════════════════════════════════════════════════════════════════════════════════════
  // The projected rows: CREATE -> the original GEOM op (op_uuid = the record uu); MOVE -> GEOM_MOVE with delta = new - current projected offset (a held axis yields none).
  function planProjection(fold, firstId, quiet) {
    var plan = [], uuToNew = {}, cur = {}, next = firstId, skipped = 0, held = 0, qlog = quiet ? function () {} : log;
    fold.forEach(function (p) {
      var e = p.env, b = e.body, params = b.params || {}, uu = e.target.uu;
      if (e.target.table !== TABLE) { skipped++; qlog('§TEAM_PROJECT_SKIP ' + e.target.table + ' ' + uu.slice(0, 8) + ' not-a-modeller-table'); return; }
      if (p.held && p.held.length) held += p.held.length;
      if (b.op_type === 'CRUD_CREATE') {
        var f = params.fields || {}, gp = decV(f.geom);
        if (!f.geom_op || !gp) { skipped++; qlog('§TEAM_PROJECT_SKIP create ' + uu.slice(0, 8) + ' no-geom'); return; }
        uuToNew[uu] = next; cur[uu] = [0, 0, 0];
        plan.push({ id: next++, op_uuid: uu, op_type: f.geom_op, params: gp, output_guid: f.output_guid || null, input_guids: f.input_guids != null ? JSON.stringify(decV(f.input_guids)) : null });
      } else if (b.op_type === 'CRUD_UPDATE') {
        var pid = uuToNew[uu]; if (pid == null) { skipped++; qlog('§TEAM_PROJECT_SKIP move ' + uu.slice(0, 8) + ' target-unknown'); return; }
        var ch = params.changes || {}, d = [0, 0, 0];
        AX.forEach(function (a, i) { var c = ch['pos_' + a]; if (!c) return; var nv = r6(decV(c.new)); d[i] = r6(nv - cur[uu][i]); cur[uu][i] = nv; });
        if (!d[0] && !d[1] && !d[2]) return;                                          // every axis of this write was held back by a conflict (or is a no-change)
        var mp = { parent: pid, dx: d[0], dy: d[1], dz: d[2] }; if (params.induced != null) mp.induced = params.induced;
        plan.push({ id: next++, op_uuid: uuidFromHash(p.hash), op_type: 'GEOM_MOVE', params: mp, output_guid: null, input_guids: null });
      } else { skipped++; qlog('§TEAM_PROJECT_SKIP ' + b.op_type + ' ' + uu.slice(0, 8) + ' op-type'); }
    });
    return { plan: plan, uuToNew: uuToNew, skipped: skipped, held: held };
  }

  async function rebuildInner() {
    var O = global.Bonsai.oplog; await O._ensureDb();
    var KO = global.KernelOps, old = readRows(O.db), fold = await S.foldable();
    var keep = old.filter(function (r) { return r.tag !== 'team' && !sent[r.uu]; });
    var oldUu = {}; old.forEach(function (r) { oldUu[r.id] = r.uu; });
    // A kept local row whose parent is a PROJECTED element (or such a row) must come AFTER the projection, or the fold would see a forward reference
    // and skip it. Everything else keeps its place BEFORE the projection. Within each class the original order is kept.
    var projUu = planProjection(fold, 1, true).uuToNew, depOn = {}, indep = [], dep = [];
    keep.forEach(function (r) {
      var par = r.P && r.P.parent != null ? r.P.parent : null, onProj = par != null && (projUu[oldUu[par]] != null || depOn[par]);
      if (!onProj && r.P && Array.isArray(r.P.commands)) onProj = r.P.commands.some(function (c) { return c && c.featureId != null && (projUu[oldUu[c.featureId]] != null || depOn[c.featureId]); });
      if (onProj) { depOn[r.id] = true; dep.push(r); } else indep.push(r);
    });
    var pj = planProjection(fold, indep.length + 1);
    var newOfKept = {}; indep.forEach(function (r, i) { newOfKept[r.id] = i + 1; }); dep.forEach(function (r, i) { newOfKept[r.id] = indep.length + pj.plan.length + i + 1; });
    var remapped = 0, missed = 0;
    function mapId(oid) { if (newOfKept[oid] != null) return newOfKept[oid]; var u = oldUu[oid]; if (u && pj.uuToNew[u] != null) return pj.uuToNew[u]; return null; }
    var sdb = new SQLm.Database(); KO.ensureTable(sdb);
    var seen = {}, undoneNew = [];
    async function commitKept(list) {
      var i = 0;
      while (i < list.length) {                                                     // kept rows verbatim, in order, grouped by their own gid
        var g = list[i].gid, j = i; while (j < list.length && list[j].gid === g) j++;
        var gid = g || ('kept-' + list[i].id); if (seen[gid]) { log('§TEAM_GID_SPLIT ' + gid); gid = gid + '~' + i; } seen[gid] = 1;
        var ops = [];
        for (var k = i; k < j; k++) {
          var r = list[k], P = r.P, text = r.params;
          if (P && typeof P === 'object') {
            var ch = false;
            if (P.parent != null) { var np = mapId(P.parent); if (np == null) { missed++; log('§TEAM_REMAP_MISS row=' + r.id + ' op=' + r.type + ' parent=' + P.parent + ' (vanished; left as is)'); } else { if (np !== P.parent) { ch = true; remapped++; } P = Object.assign({}, P, { parent: np }); } }
            if (Array.isArray(P.commands)) P = Object.assign({}, P, { commands: P.commands.map(function (c) { if (c && c.featureId != null) { var nf = mapId(c.featureId); if (nf == null) { missed++; log('§TEAM_REMAP_MISS row=' + r.id + ' op=' + r.type + ' featureId=' + c.featureId); return c; } if (nf !== c.featureId) { ch = true; remapped++; return Object.assign({}, c, { featureId: nf }); } } return c; }) });
            if (ch) text = JSON.stringify(P);
          }
          ops.push({ op_type: r.type, params: text, op_uuid: r.uu || undefined, output_guid: r.output_guid, input_guids: r.input_guids });
          if (r.undone) undoneNew.push(newOfKept[r.id]);
        }
        var cg = await KO.commitGroup(sdb, ops, { gid: gid, baseTs: list[i].ts || 1700000000000 });
        if (!cg.committed) throw new Error('kept group rejected: ' + cg.reason);
        i = j;
      }
    }
    await commitKept(indep);
    if (pj.plan.length) {
      var cp = await KO.commitGroup(sdb, pj.plan.map(function (p) { return { op_type: p.op_type, params: p.params, op_uuid: p.op_uuid, output_guid: p.output_guid, input_guids: p.input_guids }; }), { gid: 'team-proj', baseTs: 1700000000000 + indep.length * 1000 });
      if (!cp.committed) throw new Error('projection rejected: ' + cp.reason);
      sdb.run("UPDATE kernel_ops SET user_tag='team' WHERE gid='team-proj'");
    }
    await commitKept(dep);
    if (undoneNew.length) sdb.run('UPDATE kernel_ops SET undone=1 WHERE id IN (' + undoneNew.join(',') + ')');
    var res = await O.importBytes(sdb.export()); sdb.close();
    return { kept: keep.length, afterProjection: dep.length, projected: pj.plan.length, placed: fold.length, skipped: pj.skipped, held: pj.held, remapped: remapped, missed: missed, verify: res && res.verify };
  }

  var visiting = false;
  async function visit() {
    if (!S || visiting) return null; visiting = true;
    try {
      return await exclusive(async function () {
        await scanInner();                                                           // anything committed but not yet authored goes out in THIS visit
        updateFocus();                                                               // what is selected NOW is what the Visit advertises (a rebuild may renumber rows and drop the selection)
        var rep = await S.sync(pipe); lastSyncRep = rep; lastVisitAt = Date.now();
        await pinTrust();                                                            // a joiner learns the pinned plan trust list when the genesis arrives
        var pj = await rebuildInner();
        await peopleRound();                                                         // §13.12.G.1: publish my focus, collect the others', rank, heads-up (never throws into the Visit)
        log('§TEAM_VISIT sent=' + rep.sent + ' fetched=' + rep.fetched + ' received=' + rep.received + ' placed=' + rep.placed + ' parked=' + rep.parked + ' refused=' + rep.refused + ' gaps=' + rep.gaps +
            ' | projection kept=' + pj.kept + ' (after=' + pj.afterProjection + ') projected=' + pj.projected + ' skipped=' + pj.skipped + ' heldCols=' + pj.held + ' remapped=' + pj.remapped + ' remapMiss=' + pj.missed + ' rebuild=ok verifyChain=' + (pj.verify ? 'ok' : 'FAIL'));
        await persist(); await render();
        return { rep: rep, pj: pj };
      });
    } catch (e) { log('🔴 §TEAM_VISIT error ' + (e && e.stack || e)); await render(); return null; }
    finally { visiting = false; }
  }

  // ═══ UI: one chip + the conflicts (iDempiere CurrentRecordModified text) ═════════════════════════════════════════
  function ensureChip() {
    var c = $('team-chip'); if (c) return c;
    if (!document.body) return null;
    c = document.createElement('div'); c.id = 'team-chip';
    c.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:41;max-width:70vw;padding:3px 10px;border:1px solid #1f5fd6;border-radius:12px;font:12px system-ui;color:#cfe0ff;background:#10131c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    c.innerHTML = '<span id="team-label">Team</span> <button id="team-visit" type="button" style="cursor:pointer;margin-left:6px;font:inherit;padding:0 8px;border:1px solid #1f5fd6;border-radius:8px;background:#1f5fd6;color:#fff">Visit</button> <span id="team-delivery"></span> <span id="team-warn" style="color:#ff8a80"></span>';
    document.body.appendChild(c);
    $('team-visit').addEventListener('click', function () { visit(); });
    var box = document.createElement('div'); box.id = 'team-conflicts'; box.style.cssText = 'position:fixed;left:8px;bottom:40px;z-index:41;max-width:70vw;font:12px system-ui;color:#ff8a80;background:#10131c;padding:0 8px';
    document.body.appendChild(box);
    return c;
  }
  // §15.15.1 the ONE Team icon (#b-teams in the top pill): its state is read from the live adapter, never remembered — off | pending | on
  function paintIcon(state) {
    var b = $('b-teams'); if (!b) return; b.disabled = false;
    b.setAttribute('data-team-state', state); b.setAttribute('aria-pressed', state === 'on' ? 'true' : 'false'); b.classList.toggle('on', state === 'on'); b.classList.toggle('pending', state === 'pending');
    b.style.outline = state === 'pending' ? '2px solid #e0a000' : '';
    b.title = state === 'on' ? 'Team — who is on what (click to open the People list)' : state === 'pending' ? 'Team — waiting for approval: press Visit, then click again' : 'Team — click to start or join a team';
  }
  async function render() {
    var c = ensureChip(); if (!c) return;
    if (!S) { $('team-label').textContent = 'Team · not in a team yet — click the Team icon'; $('team-visit').disabled = true; c.setAttribute('data-team', 'unpaired'); enrolled = false; paintIcon('off'); return; }
    $('team-visit').disabled = false;                                               // (it is disabled while unpaired; joining or founding from the panel makes it live)
    var L = await S.order(), dl = S.delivery(), gaps = S.gaps().length, cf = await S.conflicts();
    var devs = Object.keys(L.roster.devices).length, mine = L.roster.devices[dev.kid], lo = Object.keys(localOnly).length;
    $('team-label').textContent = 'Team · ' + codeOf(dev.kid) + ' · team devices ' + devs + (mine ? '' : ' · waiting for approval — press Visit');
    $('team-delivery').textContent = 'my ops ' + dl.length + ' · seen ' + dl.filter(function (x) { return x.state === 'SEEN'; }).length + ' · refused ' + dl.filter(function (x) { return x.verdict === 'REFUSED'; }).length +
      ' · waiting on ' + gaps + ' · last visit ' + (lastVisitAt ? new Date(lastVisitAt).toLocaleTimeString() : 'never');
    $('team-warn').textContent = lo ? '⚠ ' + lo + ' local-only (not shared)' : '';
    $('team-warn').title = Object.keys(localOnly).map(function (u) { return u.slice(0, 8) + ': ' + localOnly[u]; }).join('\n');
    if (global.TeamVersions && global.TeamVersions.paint) global.TeamVersions.paint(c, $('team-warn'), L.verdict);          // §16.34: "N changes wait — update this app" (the words live in team_versions.js)
    var box = $('team-conflicts'), byUu = {};
    (await S.placedEnvelopes()).forEach(function (p) { if (p.env.body.op_type === 'CRUD_CREATE') byUu[p.env.target.uu] = (p.env.body.params.fields || {}).geom_op || null; });
    if (box) box.innerHTML = cf.map(function (k) {
      return '<div class="team-conflict" data-uu="' + k.uu + '" data-table="' + k.table + '" data-col="' + k.col + '">⚠ ' + k.table + ' ' + (byUu[k.uu] ? '<b>' + byUu[k.uu] + '</b> ' : '') + '(' + k.uu.slice(0, 8) + ') · ' + k.col + ': values ' +
        k.candidates.map(function (x) { return JSON.stringify(decV(x.value)); }).join(' / ') + ', kept ' + JSON.stringify(decV(k.before)) + ' — ' + MSG_CRM + '</div>'; }).join('');
    c.setAttribute('data-team', 'ready'); c.setAttribute('data-conflicts', String(cf.length)); c.setAttribute('data-localonly', String(lo));
    enrolled = !!mine; paintIcon(mine ? 'on' : 'pending');
    ensurePeopleUi();
  }

  // ═══ PEOPLE STRIP (TEAMWORK_FRAMEWORK §13.12.G.1) — Witness: W-PEOPLE-MODELLER (modeller/tests/witness_people_modeller.js) ═══
  // Seam: the Modeller's own `dagevu:select` event (setSelectionIds fires it on every selection change) + Bonsai._selSet. Focus = the SHARED team elements currently selected (max 5).
  // NAMED LIMITS: L2 no badge on the 3D mesh / outliner row (no overlay hook) — the heads-up is the label #team-headsup, the list is #team-people; no role scope here (no AD dictionary).
  var TP = global.TeamPeople, TFo = global.TeamFocus, tfBoard = null, tfPipe = null, focusOwn = [], focusSince = null, focusObjs = [], headsArr = [], peopleList = [], pview = null,
      clock = function () { return Date.now(); }, lastHuKey = '', peopleBox = null;
  function board() { if (!TFo || !S || !pipe) return null; if (!tfBoard || tfPipe !== pipe) { tfPipe = pipe; tfBoard = TFo.create({ pipe: pipe, self: dev, space: cfg.space, person: dev.person_uu, log: log }); } return tfBoard; }
  function selectedShared() {
    var O = global.Bonsai && global.Bonsai.oplog; if (!O || !O.db || !global.Bonsai._selSet) return [];
    var ids = Array.from(global.Bonsai._selSet).map(Number).filter(function (n) { return isFinite(n); }); if (!ids.length) return [];
    return readRows(O.db, 'id IN (' + ids.join(',') + ')').filter(function (r) { return CLASS[r.type] === 'create' && (r.tag === 'team' || !!sent[r.uu]); })
      .map(function (r) { return { table: TABLE, uu: r.uu, label: String(r.type).replace(/^GEOM_/, '').toLowerCase() + ' ' + r.uu.slice(0, 8) }; });
  }
  function updateFocus() {
    var now = Date.now(), keep = {}; focusOwn.forEach(function (e) { keep[e.uu] = e; });
    var nxt = selectedShared().slice(0, 5).map(function (e) { return { table: e.table, uu: e.uu, label: e.label, since: keep[e.uu] ? keep[e.uu].since : now }; });
    if (nxt.map(function (e) { return e.uu; }).join() !== focusOwn.map(function (e) { return e.uu; }).join()) { focusSince = now; log('§PEOPLE_FOCUS_OWN ' + (nxt.length ? 'selected ' + nxt.map(function (e) { return e.label; }).join(', ') : 'none selected')); }
    focusOwn = nxt; paintHeadsUp();
  }
  function allEnvs() { return S.query('SELECT envelope FROM cl_op').map(function (r) { return JSON.parse(r.envelope); }); }
  async function refreshPeople() {
    if (!S || !TP || !dev) return null;
    var L = await S.order(), dirc = TP.directoryFrom(L.roster, null), me = dirc.filter(function (p) { return p.kids.indexOf(dev.kid) >= 0; })[0] || null, D = global.TeamDefaults || {};
    peopleList = TP.rank(allEnvs(), headsArr, focusObjs, clock(), { directory: dirc, ttlMs: D.focusTtlMs, mode: 'all', selfPerson: me && me.person });
    if (cfg && cfg.avatar) peopleList.forEach(function (p) { if (p.self) p.avatar = cfg.avatar; });   // my own choice shows at once; the others get it at my next Visit (§15.15.2)
    var col = TP.collapse(peopleList, 'all');
    pview = { me: me, mode: 'all', effectiveMode: 'all', hide: !!(cfg && cfg.hideFocus), people: peopleList, shown: col.shown, others: [], inbox: [], scope: null, scopeAvailable: false, directory: dirc, unsupported: board() && board().unsupported() };
    log('§PEOPLE_VIEW mode=all people=' + peopleList.length + ' focusObjs=' + focusObjs.length + ' heads=' + headsArr.length + ' order=[' + peopleList.map(function (p) { return p.name + (p.self ? '*' : '') + ':' + (p.ageMs == null ? '-' : Math.round(p.ageMs / 1000) + 's') + ':' + p.focus.length; }).join(', ') + ']');
    var lab = $('team-label'); if (lab) lab.title = peopleList.map(function (p) { return p.name + ' — ' + (p.lastActive == null ? 'no activity yet' : 'active ' + TP.ageText(p.ageMs)) + (p.focus.length ? ' — on ' + p.focus.map(function (f) { return f.label; }).join(', ') : ''); }).join('\n');
    paintHeadsUp(); renderPeoplePanel(); try { global.dispatchEvent(new CustomEvent('team:people')); } catch (e) {}
    return pview;
  }
  async function peopleRound() {
    try {
      var L = await S.order(), R = L.roster; if (!R.devices[dev.kid]) return;
      var b = board(); if (!b) return;
      await b.publish(focusOwn, { off: !!cfg.hideFocus, since: focusSince, avatar: cfg.avatar });
      var col = await b.collect(R); focusObjs = col.focus; headsArr = col.heads;
      await refreshPeople();
    } catch (e) { log('🔴 §PEOPLE_ROUND ' + (e && e.stack || e)); }
  }
  function paintHeadsUp() {
    var old = $('team-headsup'); if (old) old.remove();
    var me = pview && pview.me; if (!me || !focusOwn.length || !document.body) { lastHuKey = ''; return; }
    var lines = []; focusOwn.forEach(function (f) { TP.headsUpFor(f.uu, me.person, peopleList).forEach(function (h) { lines.push({ person: h.person, name: h.name, uu: f.uu, ageMs: h.ageMs }); }); });
    if (!lines.length) { if (lastHuKey) log('§PEOPLE_HEADSUP none'); lastHuKey = ''; return; }
    var div = document.createElement('div'); div.id = 'team-headsup'; div.setAttribute('role', 'status');
    div.style.cssText = 'position:fixed;left:8px;bottom:84px;z-index:42;max-width:70vw;min-height:44px;box-sizing:border-box;padding:8px 12px;border:1px solid #b36b00;border-radius:8px;background:#fff4e0;color:#5a3600;font:14px/1.4 system-ui,sans-serif';
    div.innerHTML = lines.map(function (h) { return '<div class="team-headsup-line" data-person="' + h.person + '" data-uu="' + h.uu + '" style="display:flex;align-items:center;gap:8px">' + avatarOfPerson(h.person, 30) + '<span><b>' + global.TeamPeopleUI.esc(h.name) + '</b> is editing this element (' + TP.ageText(h.ageMs) + ')</span></div>'; }).join('');
    document.body.appendChild(div);
    var key = lines.map(function (h) { return h.uu + ':' + h.person; }).join(','); if (key !== lastHuKey) log('§PEOPLE_HEADSUP by=[' + lines.map(function (h) { return h.name + ' on ' + h.uu.slice(0, 8) + ':' + TP.ageText(h.ageMs); }).join(', ') + ']'); lastHuKey = key;
  }
  function avatarOfPerson(person, px) { var AV = global.TeamAvatars; if (!AV) return ''; var row = peopleList.filter(function (p) { return p.person === person; })[0], id = AV.resolve(row && row.avatar, person); return '<span class="tp-avatar" data-avatar="' + id + '" style="flex:0 0 ' + px + 'px;width:' + px + 'px;height:' + px + 'px;border-radius:50%;overflow:hidden;display:block">' + AV.svg(id, px) + '</span>'; }
  async function cfgSet(k, v) { var c = (await kvGet('cfg')) || {}; c[k] = v; await kvPut('cfg', c); if (cfg) cfg[k] = v; }
  async function setAvatar(id) { if (!(global.TeamAvatars && global.TeamAvatars.valid(id))) throw new Error('unknown avatar ' + id); await cfgSet('avatar', id); log('§PEOPLE_AVATAR chosen=' + id + ' (the others see it after my next Visit)'); await refreshPeople(); }
  async function setHide(on) { await cfgSet('hideFocus', !!on); log('§PEOPLE_SWITCH hideFocus=' + !!on + ' (applies from the next Visit)'); }
  function elLabel(o) { var f = (o.body.params && o.body.params.fields) || {}; return f.geom_op ? String(f.geom_op).replace(/^GEOM_/, '').toLowerCase() + ' ' + o.target.uu.slice(0, 8) : null; }
  function history(person, n) { return pview ? TP.historyOf(person, allEnvs(), n == null ? 10 : n, { directory: pview.directory, labelOf: elLabel }) : []; }
  var PEOPLE_API = { peopleView: function () { return pview; }, history: history, setHide: setHide, setMode: function () {}, refreshPeople: refreshPeople };
  function renderPeoplePanel() { if (peopleBox && peopleBox.style.display !== 'none' && global.TeamPeopleUI) { global.TeamPeopleUI.render(peopleBox, PEOPLE_API); peopleBox.insertAdjacentHTML('beforeend', '<div style="margin-top:8px"><a id="tp-settings" href="#" style="line-height:44px">Team settings (avatar, setup)</a></div>'); var a = peopleBox.querySelector('#tp-settings'); if (a) a.onclick = function (e) { e.preventDefault(); peopleBox.style.display = 'none'; if (global.TeamPanel) global.TeamPanel.open(); }; } }
  function ensurePeopleUi() {
    if ($('team-people') || !document.body) return;
    var b = document.createElement('div'); b.id = 'team-people'; b.style.cssText = 'position:fixed;top:64px;left:8px;z-index:42;width:min(360px,92vw);max-height:60vh;overflow:auto;box-sizing:border-box;padding:12px;border-radius:12px;background:#fff;color:#1d1d1f;font:14px/1.45 system-ui,sans-serif;display:none';
    peopleBox = b; document.body.appendChild(b);
  }
  // the People popover hangs under the Team icon (§15.15.1); a "Team settings" link reaches the panel (start / join / avatar / setup)
  async function togglePeople() {
    ensurePeopleUi(); var b = peopleBox; if (!b) return;
    if (b.style.display !== 'none') { b.style.display = 'none'; return; }
    var ic = $('b-teams'), r = ic ? ic.getBoundingClientRect() : { left: 8, bottom: 56, width: 0 }, w = Math.min(360, global.innerWidth * 0.92);
    b.style.top = Math.round(r.bottom + 8) + 'px'; b.style.left = Math.max(8, Math.min(global.innerWidth - w - 8, Math.round(r.left + r.width / 2 - w / 2))) + 'px'; b.style.display = 'block';
    try { await refreshPeople(); } catch (e) {} if (!pview) b.innerHTML = '<div style="color:#666">Press Visit first — people appear after your first Visit.</div>';
    if (!b.querySelector('#tp-settings')) b.insertAdjacentHTML('beforeend', '<div style="margin-top:8px"><a id="tp-settings" href="#" style="line-height:44px">Team settings (avatar, setup)</a></div>');
    var a = b.querySelector('#tp-settings'); if (a) a.onclick = function (e) { e.preventDefault(); b.style.display = 'none'; if (global.TeamPanel) global.TeamPanel.open(); };
  }
  global.addEventListener('dagevu:select', function () { if (S) updateFocus(); });

  // ═══ boot ═══════════════════════════════════════════════════════════════════════════════════════════════════════
  function applySystemDefault() {          // no key of its own yet -> the system default (trial) setup, as the phone page and the ERP do
    var D = global.TeamDefaults; if (cfg && !cfg.token && D && D.token) { cfg.owner = D.owner; cfg.repo = D.repo; cfg.token = D.token; cfg.trial = true; log('§TEAM_BOOT system-default setup applied repo=' + cfg.owner + '/' + cfg.repo + ' trial=true'); }
  }
  async function newDevice() { dev = await global.CommStore.newDevice(); dev.person_uu = global.crypto.randomUUID(); await kvPut('device', dev); }
  function openStore(bytes) {
    S = global.CommStore.open(new SQLm.Database(bytes), { SQL: SQLm, space: cfg.space, self: dev, access: access, tableId: function () { return null; }, log: log, messageText: function () { return MSG_CRM; }, versions: global.TeamVersions && global.TeamVersions.registry });   // §16.32: shape-version judgement (a shape-1 app with no sets judges nothing differently)
    var qp = new URLSearchParams(global.location.search), pu = qp.get('pipe');
    pipe = pu ? global.CommPipe.httpPipe(pu) : global.CommPipe.ghPipe({ owner: cfg.owner || OWNER, repo: cfg.repo || REPO, token: cfg.token, self: dev.kid, minGapMs: Number(qp.get('gap') || 10000) });
  }
  function attach() {      // listen to the OpLog's commit funnel once, as soon as there is a store to author into
    if (attached) return; attached = true;
    global.addEventListener('bonsai:oplog', function () { scan().catch(function (e) { log('🔴 §TEAM_SCAN ' + (e && e.stack || e)); }); });   // OpLog._emit(): every mutation and every load
  }
  async function boot() {
    for (var i = 0; i < 600 && !(global.Bonsai && global.Bonsai.oplog && global.KernelOps && global.initSqlJs && global.CommStore && global.CommPipe && document.body); i++) await new Promise(function (r) { setTimeout(r, 100); });
    if (!(global.Bonsai && global.Bonsai.oplog && global.CommStore)) { log('🔴 §TEAM_BOOT prerequisites missing'); _resolveReady(false); return; }
    await global.Bonsai.oplog._ensureDb();
    if (global.TeamVersions) await global.TeamVersions.ready;      // §16.32: the signed upcaster sets are verified and loaded BEFORE the first fold, so no op is judged against a half-loaded registry
    SQLm = await global.initSqlJs({ locateFile: function (f) { return 'lib/' + f; } });
    dev = await kvGet('device'); cfg = (await kvGet('cfg')) || {};
    if (dev && global.CommStore.ensureDh && !dev.dhPrivateKey) { try { await global.CommStore.ensureDh(dev); await kvPut('device', dev); log('§TEAM_BOOT dh key ensured for ' + dev.kid); } catch (e) { log('§TEAM_BOOT ensureDh failed ' + (e && e.message)); } }
    applySystemDefault();
    if (!dev) { await newDevice(); log('§TEAM_BOOT new device ' + dev.kid + ' (no phone page needed — pair from the Team icon)'); }
    if (!cfg.space) { log('§TEAM_BOOT not paired — device=' + !!dev + ' space=false (click the Team icon: Start a team or Join)'); _resolveReady(false); await render(); return; }
    var own = await kvGet('modeller_db'), seed = own ? null : await kvGet('db');
    openStore(own || seed || undefined);
    sent = (await kvGet('modeller_sent')) || {}; localOnly = (await kvGet('modeller_localonly')) || {};
    log('§TEAM_BOOT device=' + dev.kid + ' space=' + cfg.space.slice(0, 12) + ' store=' + (own ? 'own(modeller_db)' : seed ? 'seeded-from-phone-page' : 'new') + ' pipe=' + pipe.id + ' sent=' + Object.keys(sent).length + ' localOnly=' + Object.keys(localOnly).length);
    if (!own) await persist();
    try { await pinTrust(); } catch (e) { log('🔴 §TEAM_PLAN_SIG pin failed at boot ' + (e && e.stack || e)); }   // before ready: no scan is judged under a trust list the space did not pin
    _resolveReady(true); await render(); attach();
    scan().catch(function (e) { log('🔴 §TEAM_SCAN ' + (e && e.stack || e)); });
  }

  // ═══ PAIRING from the Team panel (§15.15.1) — the same CommStore calls as erp/team_sync.js (§13.9) and common/comm/comm_phone.html; no engine file is edited ═══
  function needKey() { var pu = new URLSearchParams(global.location.search).get('pipe'); if (!pu && !(cfg && cfg.token)) throw new Error('No key: open the Team panel and use the system default, or save your own repository and key'); }
  async function fresh() { sent = {}; localOnly = {}; catchup = null; await kvPut('modeller_db', null); await kvPut('modeller_sent', {}); await kvPut('modeller_localonly', {}); }
  async function found() {
    await ready; needKey(); await fresh();
    var sp = await global.CommStore.newSpace('team-poc', dev, dev.person_uu, 'founder', 102, spaceOpts());
    cfg.space = sp.space; cfg.founder = true; await kvPut('cfg', cfg); openStore(undefined); attach(); await S.genesis(sp.params); await pinTrust();
    log('§TEAM_PAIR founded space ' + sp.space.slice(0, 12) + ' (no base: the Modeller\'s spaces have none, §15.8)'); _resolveReady(true);
    await visit(); await persist(); await render(); return sp.space;
  }
  async function join(inv) {
    await ready; needKey(); inv = String(inv || '').trim().toLowerCase(); if (!/^[0-9a-f]{64}$/.test(inv)) throw new Error('An invite is 64 characters 0-9 a-f');
    await fresh(); cfg.space = inv; cfg.founder = false; await kvPut('cfg', cfg); openStore(undefined); attach();
    var rqName = 's/' + cfg.space + '/r/' + dev.kid, rqBytes = new TextEncoder().encode(JSON.stringify({ space: cfg.space, kid: dev.kid, jwk: dev.pubJwk, dh_jwk: dev.dhPubJwk, person_uu: dev.person_uu, name: 'device ' + codeOf(dev.kid) }));
    if (pipe.putMany) await pipe.putMany([{ name: rqName, bytes: rqBytes }]); else await pipe.put(rqName, rqBytes);   // the folder pipe has put only; the GitHub pipe batches
    log('§TEAM_PAIR join request posted, code ' + codeOf(dev.kid)); _resolveReady(true); await persist(); await render();
  }
  async function leave() {
    await ready; delete cfg.space; delete cfg.founder; await kvPut('cfg', cfg); await fresh(); S = null; pipe = null; lastVisitAt = null; tfBoard = null; tfPipe = null; focusObjs = []; headsArr = []; peopleList = []; pview = null; enrolled = false;
    log('§TEAM_PAIR left the team — same device ' + codeOf(dev.kid)); await render();
  }
  async function requests() {
    if (!S) return []; var L = await S.order(), names = await pipe.list('s/' + cfg.space + '/r/'), out = [];
    for (var n of names) { var b = await pipe.get(n); if (!b) continue; var rq = JSON.parse(new TextDecoder().decode(b));
      if (rq.space !== cfg.space || L.roster.devices[rq.kid] || rq.kid !== await global.CommStore.kidOf(rq.jwk)) continue; out.push({ rq: rq, code: codeOf(rq.kid) }); }
    log('§TEAM_PAIR requests listed: ' + names.length + ' pending=' + out.length); return out;
  }
  function roleList() { return [{ id: 102, name: 'Team member' }]; }   // the Modeller has no AD dictionary and access() is open (§15.5): one role, the same id the ERP film used
  async function approve(rq, roleId) {
    await S.addPerson({ person_uu: rq.person_uu, name: rq.name, ad_role_id: Number(roleId), comm_admin: false }); await S.enroll(rq.kid, rq.jwk, rq.person_uu, rq.dh_jwk);
    log('§TEAM_PAIR approved ' + codeOf(rq.kid) + ' as role ' + roleId); await visit(); await render();
  }
  async function pairState() {
    await ready; var st = { device: dev ? dev.kid : null, code: dev ? codeOf(dev.kid) : null, space: cfg && cfg.space || null, founder: !!(cfg && cfg.founder), enrolled: false, devices: 0 };
    if (S) { var L = await S.order(); st.devices = Object.keys(L.roster.devices).length; st.enrolled = !!L.roster.devices[dev.kid]; } return st;
  }

  global.TeamSyncModeller = { scan: scan, visit: visit, ready: ready, settle: function () { return chain; }, store: function () { return S; }, render: render,
                              classes: function () { return JSON.parse(JSON.stringify(CLASS)); }, versionState: function () { return S && S.versionState ? S.versionState() : Promise.resolve(null); }, sent: function () { return sent; }, localOnly: function () { return localOnly; }, encV: encV, decV: decV,
                              peopleView: PEOPLE_API.peopleView, refreshPeople: refreshPeople, history: history, setHide: setHide, focusOwn: function () { return focusOwn.slice(); }, updateFocus: updateFocus,
                              found: found, join: join, leave: leave, requests: requests, approve: approve, roles: roleList, pairState: pairState,
                              inviteLink: function () { var u = new URL(global.location.href); u.searchParams.set('team', '1'); u.hash = 'join=' + (cfg && cfg.space || ''); return u.toString(); },
                              setAvatar: setAvatar, avatarOf: function () { return cfg && cfg.avatar || null; }, togglePeople: togglePeople, isEnrolled: function () { return enrolled; },
                              _setClock: function (f) { clock = f || function () { return Date.now(); }; }, _pinTrust: pinTrust, _spaceOpts: spaceOpts };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { boot().catch(function (e) { log('🔴 §TEAM_BOOT ' + (e && e.stack || e)); _resolveReady(false); }); });
  else boot().catch(function (e) { log('🔴 §TEAM_BOOT ' + (e && e.stack || e)); _resolveReady(false); });
})(typeof window !== 'undefined' ? window : globalThis);
