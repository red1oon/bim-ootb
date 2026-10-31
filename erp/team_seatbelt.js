// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// team_seatbelt.js — the Seatbelt (bim-compiler prompts/TEAMWORK_FRAMEWORK.md §48.13; Witness: W-SEATBELT erp/tests/witness_team_seatbelt.js + witness_team_so §TEAM-SEATBELT).
// A pre-flight check in the Team chip: before you Process a document, will the result reach the team as you expect? It READS existing controls (base, roster, delivery,
// gaps, version parks, the stale-save conflicts, local-only ops, local numbering) and says OK or ADVISE per row. It never blocks: no BLOCK status exists, and a DocAction
// committed under ADVISE is only LOGGED (§TEAM_SEATBELT_OVERRIDE) — owner 2026-10-30: advisory + logged override, Process is never gated (twin rule). No acceptance is recorded.
'use strict';
(function (G) {
  var DEF_VISIT_MS = 900000;                 // the Visit contract's default when no policy in force names visit_ms (comm_store setPolicy, §13.12.1)
  var overrides = [];
  function ago(ms) { if (ms == null) return 'never'; var m = Math.round(ms / 60000); return m < 60 ? m + ' min ago' : Math.round(m / 60) + ' h ago'; }
  function row(id, check, ok, why, fix) { return { id: id, term: check, status: ok ? 'OK' : 'ADVISE', why: why, fix: ok ? null : fix }; }
  // pure: state -> rows. state = TeamSync.seatbeltState() (or a doctored copy in the witness)
  function model(st) {
    if (!st || !st.paired) return { verdict: 'INCONCLUSIVE', rows: [], why: 'this device is not in a team (nothing to check)' };
    var R = [], now = st.now || Date.now(), vms = st.visit_ms || DEF_VISIT_MS, age = st.lastVisitAt ? now - st.lastVisitAt : null;
    R.push(row('S1', 'shared base', st.base === 'ok' || st.base === 'none', 'base ' + st.base, 'this device\'s copy of the base differs from the team\'s: nothing it receives is folded — reload or re-found'));
    R.push(row('S2', 'enrolled', !!st.enrolled, st.enrolled ? 'approved in the roster' : 'not approved yet', 'press Visit after the admin approves this device'));
    var stale = st.unsent > 0 && (age == null || age > vms);
    R.push(row('S3', 'unsent changes', !stale, st.unsent + ' not sent · last Visit ' + ago(age) + ' (contract ' + Math.round(vms / 60000) + ' min)', 'press Visit to send them'));
    var rr = st.refusedReasons || {}, rn = Object.keys(rr).reduce(function (a, k) { return a + rr[k]; }, 0);
    R.push(row('S4', 'refused on my trail', rn === 0, rn ? rn + ' refused: ' + Object.keys(rr).map(function (k) { return k + '×' + rr[k]; }).join(', ') : 'none refused', 'open the refused claims: each names its reason'));
    R.push(row('S5', 'waiting on', !(st.gaps > 0), (st.gaps || 0) + ' gaps', 'press Visit: a peer\'s earlier op has not arrived'));
    var pk = st.parked || {}, pn = Object.keys(pk).reduce(function (a, k) { return a + pk[k]; }, 0);
    R.push(row('S6', 'parked for a version', pn === 0, pn ? pn + ' parked: ' + Object.keys(pk).map(function (k) { return k + '×' + pk[k]; }).join(', ') : 'none parked', 'update this app, or wait for the admin\'s translation rule'));
    R.push(row('S7', 'changed by another device', !(st.conflicts > 0), (st.conflicts || 0) + ' records', 'ReQuery the record before you Process it'));
    R.push(row('S8', 'local-only', !(st.localOnly > 0), (st.localOnly || 0) + ' ops not shared', 'these stay on this device: see the chip warning for why'));
    var dn = st.docno || {}, dOk = !!dn.bound && !!dn.userValue && !(dn.sharedValue > 0);
    R.push(row('S9', 'local numbering', dOk, (dn.bound ? 'device bound to a user' : 'device NOT bound to a user') + ' · login Search Key ' + (dn.userValue || '(none)') + (dn.sharedValue > 0 ? ' · shared by ' + (dn.sharedValue + 1) + ' users' : ''),
      'bind this device to its login user at approval, and give each station user its own Search Key (User window)'));
    var adv = R.filter(function (r) { return r.status !== 'OK'; }).map(function (r) { return r.id; });
    return { verdict: adv.length ? 'ADVISE' : 'CLEAR', advise: adv, rows: R };
  }
  // a commit was made; a DocAction (SET_STATUS) under ADVISE is logged, never stopped. Returns undefined always (nothing for a caller to cancel on).
  function noteCommit(m, op, log) {
    if (!m || m.verdict !== 'ADVISE' || !op || op.op_type !== 'SET_STATUS') return;
    var e = { at: new Date().toISOString(), action: (op.from || '?') + '→' + (op.to || op.action || '?'), table: op.table || '', advise: m.advise.slice() };
    overrides.unshift(e); overrides.length = Math.min(overrides.length, 20);
    (log || console.log)('§TEAM_SEATBELT_OVERRIDE action=' + e.action + ' table=' + e.table + ' advise=[' + e.advise.join(',') + '] (advisory: the DocAction went ahead)');
  }
  function exportJson(m) { return { schema: 'terms-v1', kind: 'seatbelt', at: new Date().toISOString(), verdict: m.verdict, rows: m.rows, overrides: overrides.slice() }; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function html(m) {
    var h = '<div style="font:12px sans-serif;padding:8px"><b>Seatbelt — before you Process</b> <span id="sb-verdict">' + esc(m.verdict) + '</span> <small>advisory: nothing is blocked</small>';
    if (m.verdict === 'INCONCLUSIVE') return h + '<p>' + esc(m.why) + '</p></div>';
    h += '<table style="border-collapse:collapse;margin-top:6px">';
    m.rows.forEach(function (r) { h += '<tr class="sb-row" data-id="' + r.id + '" data-status="' + r.status + '"><td style="padding:2px 6px">' + r.id + '</td><td style="padding:2px 6px">' + esc(r.term) + '</td><td style="padding:2px 6px;font-weight:bold;color:' + (r.status === 'OK' ? '#1b7f3b' : '#b26a00') + '">' + r.status + '</td><td style="padding:2px 6px">' + esc(r.why) + (r.fix ? '<br><small>' + esc(r.fix) + '</small>' : '') + '</td></tr>'; });
    h += '</table>';
    if (overrides.length) h += '<p><b>Processed under ADVISE</b> (logged, not blocked):<br>' + overrides.map(function (o) { return esc(o.at.slice(0, 19).replace('T', ' ') + ' ' + o.table + ' ' + o.action + ' [' + o.advise.join(',') + ']'); }).join('<br>') + '</p>';
    return h + '<p><button id="sb-export" type="button">Export JSON</button></p></div>';
  }
  async function open() {
    var TS = G.TeamSync, st = TS && TS.seatbeltState ? await TS.seatbeltState() : null, m = model(st), box = document.getElementById('team-seatbelt-panel');
    if (!box) { box = document.createElement('div'); box.id = 'team-seatbelt-panel'; box.style.cssText = 'position:fixed;right:12px;bottom:36px;max-width:min(900px,95vw);max-height:70vh;overflow:auto;background:#fff;border:1px solid #b26a00;border-radius:8px;box-shadow:0 4px 18px rgba(0,0,0,.2);z-index:9999'; document.body.appendChild(box); }
    box.innerHTML = html(m); box.setAttribute('data-verdict', m.verdict);
    var ex = document.getElementById('sb-export'); if (ex) ex.addEventListener('click', function () { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(exportJson(m), null, 1)], { type: 'application/json' })); a.download = 'seatbelt.json'; a.click(); });
    console.log('§TEAM_SEATBELT open verdict=' + m.verdict + ' advise=[' + (m.advise || []).join(',') + '] ' + (m.rows || []).map(function (r) { return r.id + '=' + r.status; }).join(' '));
    return m;
  }
  function ensureButton() {
    var c = document.getElementById('team-chip'); if (!c || document.getElementById('team-seatbelt')) return;
    var b = document.createElement('button'); b.id = 'team-seatbelt'; b.type = 'button'; b.textContent = 'Seatbelt'; b.title = 'Before you Process: will it reach the team as you expect? (advisory)';
    b.style.cssText = 'cursor:pointer;margin-left:6px;font:inherit;padding:0 8px;border:1px solid #b26a00;border-radius:8px;background:#fff;color:#b26a00';
    b.addEventListener('click', function () { var p = document.getElementById('team-seatbelt-panel'); if (p) p.remove(); else open(); }); c.appendChild(b);
  }
  var API = { model: model, noteCommit: noteCommit, exportJson: exportJson, html: html, open: open, ensureButton: ensureButton, overrides: function () { return overrides.slice(); }, DEF_VISIT_MS: DEF_VISIT_MS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else { G.TeamSeatbelt = API; if (G.document) setInterval(ensureButton, 1000); }
})(typeof window !== 'undefined' ? window : globalThis);
