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
 * Inert unless the page is opened with ?team=1 or localStorage.teamMode==='1' (the ERP's switch). Identity/space/token are read from the
 * same-origin IndexedDB 'comm_phone' written by common/comm/comm_phone.html; this page keeps its OWN comm store bytes under 'modeller_db'.
 */
(function (global) {
  'use strict';
  var _on = /[?&]team=1(&|$)/.test(String(global.location && global.location.search)); try { _on = _on || global.localStorage.getItem('teamMode') === '1'; } catch (e) {}
  if (!_on) return;   // without ?team=1 (or the Team panel's switch) nothing changes

  var OWNER = 'red1oon', REPO = 'bim-teams-pipe';
  var MSG_CRM = 'Current record was changed by another user, please ReQuery';      // AD_Message CurrentRecordModified (same text as the ERP twin)
  var TABLE = 'bim_element';                                                       // the pseudo-table every element lives in (§15.2)
  // THE one op-class list (§15.2). No AD dictionary exists for the Modeller to read it from; it equals the LEAF fold class of bonsai_oplog.js commit() + GEOM_INSERT.
  var CLASS = { GEOM_INSERT: 'create', GEOM_EXTRUDE: 'create', GEOM_EXTRUDE_POLY: 'create', GEOM_SWEEP: 'create', GEOM_LOFT: 'create', GEOM_REVOLVE: 'create', GEOM_MOVE: 'move' };
  var AX = ['x', 'y', 'z'];

  var SQLm = null, dev = null, cfg = null, S = null, pipe = null, sent = {}, localOnly = {}, lastVisitAt = null, lastSyncRep = null, catchup = null;
  var _resolveReady, ready = new Promise(function (r) { _resolveReady = r; });
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

  async function scanInner() {
    if (!(await ready)) return 0;
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
            var a = await S.author({ target: t.target, body: t.body, refs: [], intent: t.intent, ts: row.ts });
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
        var rep = await S.sync(pipe); lastSyncRep = rep; lastVisitAt = Date.now();
        var pj = await rebuildInner();
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
  async function render() {
    var c = ensureChip(); if (!c) return;
    if (!S) { $('team-label').textContent = 'Team · not paired (pair this browser on comm_phone.html)'; $('team-visit').disabled = true; c.setAttribute('data-team', 'unpaired'); return; }
    var L = await S.order(), dl = S.delivery(), gaps = S.gaps().length, cf = await S.conflicts();
    var devs = Object.keys(L.roster.devices).length, mine = L.roster.devices[dev.kid], lo = Object.keys(localOnly).length;
    $('team-label').textContent = 'Team · ' + codeOf(dev.kid) + ' · team devices ' + devs + (mine ? '' : ' · waiting for approval — press Visit');
    $('team-delivery').textContent = 'my ops ' + dl.length + ' · seen ' + dl.filter(function (x) { return x.state === 'SEEN'; }).length + ' · refused ' + dl.filter(function (x) { return x.verdict === 'REFUSED'; }).length +
      ' · waiting on ' + gaps + ' · last visit ' + (lastVisitAt ? new Date(lastVisitAt).toLocaleTimeString() : 'never');
    $('team-warn').textContent = lo ? '⚠ ' + lo + ' local-only (not shared)' : '';
    $('team-warn').title = Object.keys(localOnly).map(function (u) { return u.slice(0, 8) + ': ' + localOnly[u]; }).join('\n');
    var box = $('team-conflicts'), byUu = {};
    (await S.placedEnvelopes()).forEach(function (p) { if (p.env.body.op_type === 'CRUD_CREATE') byUu[p.env.target.uu] = (p.env.body.params.fields || {}).geom_op || null; });
    if (box) box.innerHTML = cf.map(function (k) {
      return '<div class="team-conflict" data-uu="' + k.uu + '" data-table="' + k.table + '" data-col="' + k.col + '">⚠ ' + k.table + ' ' + (byUu[k.uu] ? '<b>' + byUu[k.uu] + '</b> ' : '') + '(' + k.uu.slice(0, 8) + ') · ' + k.col + ': values ' +
        k.candidates.map(function (x) { return JSON.stringify(decV(x.value)); }).join(' / ') + ', kept ' + JSON.stringify(decV(k.before)) + ' — ' + MSG_CRM + '</div>'; }).join('');
    c.setAttribute('data-team', 'ready'); c.setAttribute('data-conflicts', String(cf.length)); c.setAttribute('data-localonly', String(lo));
  }

  // ═══ boot ═══════════════════════════════════════════════════════════════════════════════════════════════════════
  async function boot() {
    for (var i = 0; i < 600 && !(global.Bonsai && global.Bonsai.oplog && global.KernelOps && global.initSqlJs && global.CommStore && global.CommPipe && document.body); i++) await new Promise(function (r) { setTimeout(r, 100); });
    if (!(global.Bonsai && global.Bonsai.oplog && global.CommStore)) { log('🔴 §TEAM_BOOT prerequisites missing'); _resolveReady(false); return; }
    await global.Bonsai.oplog._ensureDb();
    SQLm = await global.initSqlJs({ locateFile: function (f) { return 'lib/' + f; } });
    dev = await kvGet('device'); cfg = (await kvGet('cfg')) || {};
    if (dev && global.CommStore.ensureDh && !dev.dhPrivateKey) { try { await global.CommStore.ensureDh(dev); await kvPut('device', dev); log('§TEAM_BOOT dh key ensured for ' + dev.kid); } catch (e) { log('§TEAM_BOOT ensureDh failed ' + (e && e.message)); } }
    if (!dev || !cfg.space) { log('§TEAM_BOOT not paired — device=' + !!dev + ' space=' + !!cfg.space + ' (pair this browser on common/comm/comm_phone.html first)'); _resolveReady(false); await render(); return; }
    var own = await kvGet('modeller_db'), seed = own ? null : await kvGet('db');
    S = global.CommStore.open(new SQLm.Database(own || seed || undefined), { SQL: SQLm, space: cfg.space, self: dev, access: access, tableId: function () { return null; }, log: log, messageText: function () { return MSG_CRM; } });
    sent = (await kvGet('modeller_sent')) || {}; localOnly = (await kvGet('modeller_localonly')) || {};
    var qp = new URLSearchParams(global.location.search), pu = qp.get('pipe');
    pipe = pu ? global.CommPipe.httpPipe(pu) : global.CommPipe.ghPipe({ owner: cfg.owner || OWNER, repo: cfg.repo || REPO, token: cfg.token, self: dev.kid, minGapMs: Number(qp.get('gap') || 10000) });
    log('§TEAM_BOOT device=' + dev.kid + ' space=' + cfg.space.slice(0, 12) + ' store=' + (own ? 'own(modeller_db)' : seed ? 'seeded-from-phone-page' : 'new') + ' pipe=' + pipe.id + ' sent=' + Object.keys(sent).length + ' localOnly=' + Object.keys(localOnly).length);
    if (!own) await persist();
    _resolveReady(true); await render();
    global.addEventListener('bonsai:oplog', function () { scan().catch(function (e) { log('🔴 §TEAM_SCAN ' + (e && e.stack || e)); }); });   // OpLog._emit(): every mutation and every load
    scan().catch(function (e) { log('🔴 §TEAM_SCAN ' + (e && e.stack || e)); });
  }

  global.TeamSyncModeller = { scan: scan, visit: visit, ready: ready, settle: function () { return chain; }, store: function () { return S; }, render: render,
                              classes: function () { return JSON.parse(JSON.stringify(CLASS)); }, sent: function () { return sent; }, localOnly: function () { return localOnly; }, encV: encV, decV: decV };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { boot().catch(function (e) { log('🔴 §TEAM_BOOT ' + (e && e.stack || e)); _resolveReady(false); }); });
  else boot().catch(function (e) { log('🔴 §TEAM_BOOT ' + (e && e.stack || e)); _resolveReady(false); });
})(typeof window !== 'undefined' ? window : globalThis);
