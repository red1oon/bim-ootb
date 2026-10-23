// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* team_sync.js — the real ERP window in TEAM MODE: crud_overlay's commit funnel <-> the local comm layer.
 * Implementing bim-compiler prompts/TEAMWORK_FRAMEWORK.md §13.1 (W1) — Witness: W-TEAM-SO (erp/tests/witness_team_so.js).
 *
 * GENERIC (AD-LAYER LAW): nothing here names a window or a business table. It sits on two seams only:
 *   OUT  crud_overlay._sidePersist → TeamSync.onCommit(rows, db): each committed kernel CRUD row becomes a v3 envelope.
 *   IN   a Visit = store.sync(pipe) → store.foldable() → __crud.teamRebuild(): the sidecar is rebuilt as a PROJECTION of the
 *        comm log (the comm log is the truth). Written through crud_overlay's existing append-only `ops` store.
 * Inert unless the page is opened with ?team=1 (the loader in idempiere.html writes the <script> tags only then).
 * Identity/space/token are read from the same-origin IndexedDB 'comm_phone' written by common/comm/comm_phone.html; this
 * page keeps its OWN comm store bytes under a separate key ('erp_db'), seeded once from the phone page's store.
 *
 * W2 (TEAMWORK_FRAMEWORK §13.7): the document's SET_STATUS is shared as an envelope (intent K4) and every op of a doc-action group carries `grp`
 * (the kernel gid); a group with a docstatus conflict is left out of the projection WHOLE (all-or-none).
 *
 * Named limits (see TEAMWORK_FRAMEWORK §13.3, §13.7): an UPDATE/DELETE of a seeded record
 * (positive pk) is local-only because the comm layer admits an op only against the scope of the record's CREATE;
 * station-owned bookkeeping tables (STATION_LOCAL) are never shared; a Visit renumbers synthetic pks (-kernelRowId).
 */
(function (global) {
  'use strict';
  var _on = /[?&]team=1(&|$)/.test(String(global.location && global.location.search)); try { _on = _on || global.localStorage.getItem('teamMode') === '1'; } catch (e) {}
  if (!_on) return;   // without ?team=1 (or the Team panel's switch) nothing changes

  var OWNER = 'red1oon', REPO = 'bim-teams-pipe';
  var MSG_CRM = 'Current record was changed by another user, please ReQuery';   // AD_Message CurrentRecordModified (ad_full.db; the browser seed has no ad_message table)
  // Station/user-owned bookkeeping: per-station numbering (TEAMWORK_FRAMEWORK §11.1 "DocumentNo = an ownership fact"), the
  // user's own recent-items list and session/audit rows. Sharing them would make every document save a spurious crossed edit.
  // No AD column marks this (AD_Table.ReplicationType = 'L' on all 1003 tables), so it is a named list — the ONE table list in
  // this file, not window behaviour.
  var STATION_LOCAL = { ad_sequence: 1, ad_sequence_no: 1, ad_recentitem: 1, ad_session: 1, ad_changelog: 1 };
  var KERNEL_STAMPS = { _sigv: 1, signed_by: 1, _sv: 1 };   // kernel-local artefacts, re-stamped by whoever commits

  var SQL = null, dev = null, cfg = null, S = null, pipe = null, sent = {}, localOnly = {}, lastRefused = 0, lastVisitAt = null, lastSyncRep = null;
  var _resolveReady, ready = new Promise(function (r) { _resolveReady = r; });
  var $ = function (id) { return document.getElementById(id); };
  function log(m) { console.log(m); }

  // ── this browser's storage: the phone page's IndexedDB 'comm_phone' (same schema, version 1) ──
  function idb() { return new Promise(function (res, rej) { var r = indexedDB.open('comm_phone', 1); r.onupgradeneeded = function () { r.result.createObjectStore('kv'); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
  async function kvGet(k) { var d = await idb(); return new Promise(function (res) { var q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = function () { res(q.result); }; q.onerror = function () { res(undefined); }; }); }
  async function kvPut(k, v) { var d = await idb(); return new Promise(function (res, rej) { var t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = function () { rej(t.error); }; }); }
  async function persist() { if (S) await kvPut('erp_db', S.db.export()); await kvPut('erp_sent', sent); await kvPut('erp_localonly', localOnly); }

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
  function codeOf(kid) { return kid.slice(0, 4).toUpperCase() + '-' + kid.slice(4, 8).toUpperCase(); }
  function uuidFromHash(h) { return h.slice(0, 8) + '-' + h.slice(8, 12) + '-4' + h.slice(13, 16) + '-8' + h.slice(17, 20) + '-' + h.slice(20, 32); }
  function isNeg(v) { return (typeof v === 'number' && Number.isInteger(v) && v < 0) || (typeof v === 'string' && /^-\d+$/.test(v)); }

  // ═══ OUT: kernel row → v3 envelope ═══════════════════════════════════════════════════════════════════════════════
  // The CREATE row that minted a device-local pk (-k): its op_uuid IS that record's <table>_uu (crud_core.js:475-477).
  function createRowOf(db, negPk) {
    var k = -Number(negPk), r = db.exec('SELECT op_type, op_uuid, parameters, user_tag FROM kernel_ops WHERE id=' + k);
    if (!r.length || !r[0].values.length) return null;
    var v = r[0].values[0], p; try { p = JSON.parse(v[2]); } catch (e) { return null; }
    return v[0] === 'CRUD_CREATE' ? { uu: String(v[1] || '').toLowerCase(), table: String((p && p.table) || '').toLowerCase(), team: v[3] === 'team' } : null;
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

  async function translate(r, db) {
    var p; try { p = JSON.parse(r.parameters); } catch (e) { return { skip: 'unparseable' }; }
    var table = String((p && p.table) || '').toLowerCase();
    if (!/^(CRUD_(CREATE|UPDATE|DELETE)|SET_STATUS)$/.test(r.op_type)) return { local: 'op-type ' + r.op_type, table: table };
    if (STATION_LOCAL[table]) return { quiet: 'station-owned ' + table };
    var clean = {}; Object.keys(p).forEach(function (k) { if (!KERNEL_STAMPS[k]) clean[k] = p[k]; });
    var refs = [], rw;
    if (r.gid) clean.grp = r.gid;                                      // §13.7: the doc-action group this op belongs to (all-or-none on a docstatus conflict)
    if (r.op_type === 'SET_STATUS') {                                  // the status mirrors as a docstatus column write so the comm layer's per-column conflict judges it
      if (clean.from == null || clean.to == null) return { local: 'set-status-without-from/to', table: table };
      clean.changes = { docstatus: { old: clean.from, new: clean.to } };
    }
    if (clean.fields) { rw = rewriteMap(db, clean.fields, refs, false); if (rw.err) return { local: rw.err, table: table }; clean.fields = rw.map; }
    if (clean.changes) { rw = rewriteMap(db, clean.changes, refs, true); if (rw.err) return { local: rw.err, table: table }; clean.changes = rw.map; }
    var w = CommEnvelope.wrapKernelOp({ op_type: r.op_type, op_uuid: r.op_uuid, parameters: clean }, uuOf(db));
    if (!w.ok) return { local: /uu-unresolved/.test(w.reason) ? 'target-not-a-team-record (' + w.reason + ') — the comm layer admits an op only against its record\'s CREATE scope' : w.reason, table: table };
    return { target: w.target, body: w.body, refs: refs, table: table };
  }

  async function onCommit(rows, db) {
    await ready; if (!S) return;                                      // paired later from the Team panel (§13.9) works too: S is set then
    var n = 0, trial = null;
    if (cfg && cfg.trial && global.TeamTrial) { var D = global.TeamDefaults || {};     // §13.8 T4: judged once per commit batch, so a whole Complete group is never cut in half
      trial = global.TeamTrial.status((await S.placedEnvelopes()).map(function (x) { return x.env; }), { trial: true, cycles: D.trialCycles, cap: D.trialOpCap });
      if (trial.finished) log('§TEAM_TRIAL ' + trial.reason + ' cycles=' + trial.cycles + ' businessOps=' + trial.businessOps + ' (new business ops stay on this device)'); }
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.undone || !r.op_uuid || sent[r.op_uuid] || localOnly[r.op_uuid] || r.user_tag === 'team') continue;   // undo/redo snapshots, replays, projected rows
      var t = await translate(r, db);
      if (!t.quiet && trial && trial.finished) { localOnly[r.op_uuid] = trial.reason; log('§TEAM_LOCALONLY op=' + r.op_type + ' table=' + (t.table || '?') + ' uuid=' + String(r.op_uuid).slice(0, 8) + ' reason=' + trial.reason + ' (NOT SENT)'); continue; }
      if (t.quiet) { log('§TEAM_STATION_LOCAL op=' + r.op_type + ' ' + t.quiet + ' (not shared by design)'); continue; }
      if (t.local || t.skip) { localOnly[r.op_uuid] = t.local || t.skip; log('§TEAM_LOCALONLY op=' + r.op_type + ' table=' + (t.table || '?') + ' uuid=' + String(r.op_uuid).slice(0, 8) + ' reason=' + (t.local || t.skip) + ' (NOT SENT)'); continue; }
      try {
        var a = await S.author({ target: t.target, body: t.body, refs: t.refs, intent: r.op_type === 'SET_STATUS' ? 'K4' : 'K2', ts: r.timestamp });
        sent[r.op_uuid] = a.hash; n++;
        log('§TEAM_OUT op=' + r.op_type + ' table=' + t.target.table + ' uu=' + t.target.uu.slice(0, 8) + ' seq=' + a.env.seq + ' refs=' + t.refs.length + ' hash=' + a.hash.slice(0, 12));
      } catch (e) { localOnly[r.op_uuid] = 'author-failed ' + (e && e.message); log('§TEAM_LOCALONLY op=' + r.op_type + ' table=' + t.table + ' reason=author-failed ' + (e && e.message) + ' (NOT SENT)'); }
    }
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
  async function project(oldRows) {
    var fold = await S.foldable();
    var keep = oldRows.filter(function (r) { return r.user_tag !== 'team' && !sent[r.op_uuid]; }).map(function (r) {
      var c = {}; Object.keys(r).forEach(function (k) { c[k] = r[k]; });
      if (!/"_sigv":2/.test(String(c.parameters))) c.sig = null;       // a v1 signature attests the chain hash, which this rebuild changes: re-sign
      return c; });
    // §13.7 all-or-none: a doc-action group with ANY write held back on docstatus is left out whole (the document keeps its last agreed status AND no consequences)
    var heldGrp = {}; fold.forEach(function (p) { var g = p.env.body.params && p.env.body.params.grp; if (g && p.held && p.held.indexOf('docstatus') >= 0) heldGrp[g] = 1; });
    var groupHeld = 0;
    var base = keep.reduce(function (m, r) { return Math.max(m, Number(r.id)); }, 0), uuToPk = {}, out = keep.slice(), skipped = 0, byTable = {};
    fold.forEach(function (p) {
      var e = p.env, b = e.body, t = e.target.table, uu = e.target.uu, params = b.params || {}, kp, op_uuid;
      if (params.grp && heldGrp[params.grp]) { groupHeld++; log('§TEAM_GROUP_HELD grp=' + String(params.grp).slice(0, 8) + ' ' + b.op_type + ' ' + t + ' ' + uu.slice(0, 8) + ' (docstatus conflict — whole group left out)'); return; }
      if (b.op_type === 'CRUD_CREATE') {
        var rw = rewriteIn(params.fields, uuToPk, false);
        if (rw.miss) { skipped++; log('§TEAM_PROJECT_SKIP ' + t + ' ' + uu.slice(0, 8) + ' fk-uu-unknown ' + rw.miss.slice(0, 8)); return; }
        kp = { table: t, id: null, fields: rw.map, cas: params.cas || null }; if (params.stdDefaults) kp.stdDefaults = params.stdDefaults; op_uuid = uu;
      } else if (b.op_type === 'CRUD_UPDATE' || b.op_type === 'CRUD_DELETE') {
        var pk = uuToPk[uu]; if (pk == null) { skipped++; log('§TEAM_PROJECT_SKIP ' + t + ' ' + uu.slice(0, 8) + ' target-unknown'); return; }
        if (b.op_type === 'CRUD_UPDATE') {
          var rc = rewriteIn(params.changes, uuToPk, true);
          if (rc.miss) { skipped++; log('§TEAM_PROJECT_SKIP ' + t + ' ' + uu.slice(0, 8) + ' fk-uu-unknown ' + rc.miss.slice(0, 8)); return; }
          if (!Object.keys(rc.map).length) return;                     // every column of this write was held back by a conflict
          kp = { table: t, id: pk, changes: rc.map }; if (params.actor != null) kp.actor = params.actor;
        } else kp = { table: t, id: pk, tombstone: true, reversible: true };
        op_uuid = uuidFromHash(p.hash);
      } else if (b.op_type === 'SET_STATUS') {
        var pk2 = uuToPk[uu]; if (pk2 == null) { skipped++; log('§TEAM_PROJECT_SKIP ' + t + ' ' + uu.slice(0, 8) + ' target-unknown (SET_STATUS)'); return; }
        kp = { table: t, id: pk2, action: params.action, from: params.from, to: params.to, oracle: params.oracle || null }; op_uuid = uuidFromHash(p.hash);
      } else { skipped++; log('§TEAM_PROJECT_SKIP ' + t + ' op-type ' + b.op_type); return; }
      var id = ++base; if (b.op_type === 'CRUD_CREATE') uuToPk[uu] = -id;
      out.push({ id: id, op_uuid: op_uuid, timestamp: e.ts, op_type: b.op_type, parameters: JSON.stringify(kp), input_guids: null, output_guid: null, undone: 0,
                 prev_hash: null, op_hash: null, sig: null, gid: null, branch_id: null, user_tag: 'team' });   // NOT params.grp: a kept local-only member of the same group would be separated from it and the kernel reports group-torn (found on film footage 2026-10-24)
      byTable[t] = (byTable[t] || 0) + 1;
    });
    // old synthetic pk → new, per table (the open window re-keys its current record)
    var remap = {};
    oldRows.forEach(function (r) { if (r.op_type !== 'CRUD_CREATE' || !r.op_uuid) return; var np = uuToPk[String(r.op_uuid).toLowerCase()];
      if (np == null || np === -Number(r.id)) return; var t; try { t = String(JSON.parse(r.parameters).table).toLowerCase(); } catch (e) { return; }
      (remap[t] = remap[t] || {})[-Number(r.id)] = np; });
    project.last = { kept: keep.length, placed: fold.length, projected: out.length - keep.length, skipped: skipped, groupHeld: groupHeld, byTable: byTable, remap: remap };
    return out;
  }

  var visiting = false;
  async function visit() {
    if (!S || visiting) return null; visiting = true;
    try {
      var rep = await S.sync(pipe); lastSyncRep = rep; lastVisitAt = Date.now();
      var res = await global.__crud.teamRebuild(project), pj = project.last || {};
      var dirty = false; try { dirty = !!(global.__crud.inlineDirty && global.__crud.inlineDirty()); } catch (e) {}
      log('§TEAM_VISIT sent=' + rep.sent + ' fetched=' + rep.fetched + ' received=' + rep.received + ' placed=' + rep.placed + ' parked=' + rep.parked + ' refused=' + rep.refused +
          ' gaps=' + rep.gaps + ' | projection kept=' + pj.kept + ' projected=' + pj.projected + ' skipped=' + pj.skipped + ' groupHeld=' + pj.groupHeld + ' rebuild=' + (res && res.ok ? 'ok verifyChain=' + (res.verify && res.verify.ok ? 'ok' : 'FAIL') : 'FAILED ' + (res && res.reason)) +
          ' refresh=' + (dirty ? 'DEFERRED(form has unsaved edits)' : 'sent'));
      await persist();
      if (res && res.ok && !dirty) global.dispatchEvent(new CustomEvent('overlay:committed', { detail: { table: null, op_type: 'TEAM_VISIT', id: null, remap: pj.remap || {} } }));
      await render();
      return { rep: rep, res: res, pj: pj };
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
    $('team-warn').textContent = (tr && tr.finished ? 'Trial cycle finished — use your own repo and key to continue. ' : '') + (lo ? '⚠ ' + lo + ' local-only (not shared)' : '');
    $('team-warn').title = Object.keys(localOnly).map(function (u) { return u.slice(0, 8) + ': ' + localOnly[u]; }).join('\n');
    var box = $('team-conflicts'), byUu = {};
    // name the record: its documentno when the projection carries it (the log's CREATE), else its uu
    (await S.placedEnvelopes()).forEach(function (p) { if (p.env.body.op_type === 'CRUD_CREATE') byUu[p.env.target.uu] = (p.env.body.params.fields || {}).documentno || null; });
    if (box) box.innerHTML = cf.map(function (k) {
      return '<div class="team-conflict" data-uu="' + k.uu + '" data-table="' + k.table + '" data-col="' + k.col + '">⚠ ' + k.table + ' ' + (byUu[k.uu] ? '<b>' + byUu[k.uu] + '</b> ' : '') + '(' + k.uu.slice(0, 8) + ') · ' + k.col + ': values ' +
        k.candidates.map(function (x) { return JSON.stringify(x.value); }).join(' / ') + ', kept ' + JSON.stringify(k.before) + ' — ' + MSG_CRM + '</div>'; }).join('');
    c.setAttribute('data-team', 'ready'); c.setAttribute('data-conflicts', String(cf.length)); c.setAttribute('data-localonly', String(lo));
    lastRefused = dl.filter(function (x) { return x.verdict === 'REFUSED'; }).length;
  }

  // ═══ boot ═══════════════════════════════════════════════════════════════════════════════════════════════════════
  async function boot() {
    for (var i = 0; i < 600 && !(global.__crud && global.__idmpDb && global.KernelOps && global.CrudCore && global.initSqlJs && global.AdAccess && global.CommStore && document.getElementById('idmp-status')); i++) await new Promise(function (r) { setTimeout(r, 100); });
    if (!(global.__crud && global.CommStore && global.__idmpDb)) { log('🔴 §TEAM_BOOT prerequisites missing'); _resolveReady(false); return; }
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
    log('§TEAM_BOOT device=' + dev.kid + ' space=' + cfg.space.slice(0, 12) + ' store=' + (own ? 'own(erp_db)' : seed ? 'seeded-from-phone-page' : 'new') + ' pipe=' + pipe.id + ' sent=' + Object.keys(sent).length + ' localOnly=' + Object.keys(localOnly).length);
    if (!own) await persist();
    _resolveReady(true); await render();
  }

  // ═══ PAIRING from the Team panel (§13.9) — ported from common/comm/comm_phone.html, same CommStore calls ═══
  function applySystemDefault() {          // no key of its own yet → the system default (trial) setup, as the phone page does
    var D = global.TeamDefaults; if (cfg && !cfg.token && D && D.token) { cfg.owner = D.owner; cfg.repo = D.repo; cfg.token = D.token; cfg.trial = true; log('§TEAM_BOOT system-default setup applied repo=' + cfg.owner + '/' + cfg.repo + ' trial=true'); }
  }
  async function newDevice() { dev = await global.CommStore.newDevice(); dev.person_uu = global.crypto.randomUUID(); await kvPut('device', dev); }
  async function openStore(bytes) {
    S = global.CommStore.open(new SQL.Database(bytes), { SQL: SQL, space: cfg.space, self: dev, access: access, tableId: tableId, log: log, messageText: function () { return MSG_CRM; } });
    var pu = new URLSearchParams(global.location.search).get('pipe');
    pipe = pu ? global.CommPipe.httpPipe(pu) : global.CommPipe.ghPipe({ owner: cfg.owner || OWNER, repo: cfg.repo || REPO, token: cfg.token, self: dev.kid, minGapMs: Number(new URLSearchParams(global.location.search).get('gap') || 10000) });
  }
  function needKey() { var pu = new URLSearchParams(global.location.search).get('pipe'); if (!pu && !cfg.token) throw new Error('No key: open the Team panel and use the system default, or save your own repository and key'); }
  async function fresh() { sent = {}; localOnly = {}; await kvPut('erp_db', null); await kvPut('erp_sent', {}); await kvPut('erp_localonly', {}); }
  async function found() {
    await ready; needKey(); await fresh();
    var sp = await global.CommStore.newSpace('team-poc', dev, dev.person_uu, 'founder', 102);
    cfg.space = sp.space; cfg.founder = true; await kvPut('cfg', cfg); await openStore(undefined); await S.genesis(sp.params);
    log('§TEAM_PAIR founded space ' + sp.space.slice(0, 12)); await visit(); await persist(); await render(); return sp.space;
  }
  async function join(inv) {
    await ready; needKey(); inv = String(inv || '').trim().toLowerCase(); if (!/^[0-9a-f]{64}$/.test(inv)) throw new Error('An invite is 64 characters 0-9 a-f');
    await fresh(); cfg.space = inv; cfg.founder = false; await kvPut('cfg', cfg); await openStore(undefined);
    var rqName = 's/' + cfg.space + '/r/' + dev.kid, rqBytes = new TextEncoder().encode(JSON.stringify({ space: cfg.space, kid: dev.kid, jwk: dev.pubJwk, dh_jwk: dev.dhPubJwk, person_uu: dev.person_uu, name: 'device ' + codeOf(dev.kid) }));
    if (pipe.putMany) await pipe.putMany([{ name: rqName, bytes: rqBytes }]); else await pipe.put(rqName, rqBytes);   // folder pipe has put only; the GitHub pipe batches
    log('§TEAM_PAIR join request posted, code ' + codeOf(dev.kid)); await persist(); await render();
  }
  async function leave() {
    await ready; delete cfg.space; delete cfg.founder; await kvPut('cfg', cfg); await fresh(); S = null; pipe = null; lastVisitAt = null;
    log('§TEAM_PAIR left the team — same device ' + codeOf(dev.kid)); await render();
  }
  async function requests() {
    if (!S) return []; var L = await S.order(), names = await pipe.list('s/' + cfg.space + '/r/'), out = [];
    for (var n of names) { var b = await pipe.get(n); if (!b) continue; var rq = JSON.parse(new TextDecoder().decode(b));
      if (rq.space !== cfg.space || L.roster.devices[rq.kid] || rq.kid !== await global.CommStore.kidOf(rq.jwk)) continue; out.push({ rq: rq, code: codeOf(rq.kid) }); }
    log('§TEAM_PAIR requests listed: ' + names.length + ' pending=' + out.length); return out;
  }
  function roleList() { return shim(adDb()).prepare("SELECT ad_role_id AS id, name FROM ad_role WHERE ad_client_id IN (0, 11) ORDER BY ad_role_id").all(); }
  async function approve(rq, roleId) {
    await S.addPerson({ person_uu: rq.person_uu, name: rq.name, ad_role_id: Number(roleId), comm_admin: false }); await S.enroll(rq.kid, rq.jwk, rq.person_uu, rq.dh_jwk);
    log('§TEAM_PAIR approved ' + codeOf(rq.kid) + ' as role ' + roleId); await visit(); await render();
  }
  async function pairState() {
    await ready; var st = { device: dev ? dev.kid : null, code: dev ? codeOf(dev.kid) : null, space: cfg && cfg.space || null, founder: !!(cfg && cfg.founder), enrolled: false, devices: 0 };
    if (S) { var L = await S.order(); st.devices = Object.keys(L.roster.devices).length; st.enrolled = !!L.roster.devices[dev.kid]; } return st;
  }

  global.TeamSync = { onCommit: onCommit, visit: visit, ready: ready, found: found, join: join, leave: leave, requests: requests, approve: approve, roles: roleList, pairState: pairState,
                      inviteLink: function () { var u = new URL(global.location.href); u.searchParams.set('team', '1'); u.hash = 'join=' + (cfg && cfg.space || ''); return u.toString(); }, store: function () { return S; }, render: render,
                      stationLocal: function () { return Object.keys(STATION_LOCAL); }, sent: function () { return sent; }, localOnly: function () { return localOnly; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { boot().catch(function (e) { log('🔴 §TEAM_BOOT ' + (e && e.stack || e)); _resolveReady(false); }); });
  else boot().catch(function (e) { log('🔴 §TEAM_BOOT ' + (e && e.stack || e)); _resolveReady(false); });
})(typeof window !== 'undefined' ? window : globalThis);
