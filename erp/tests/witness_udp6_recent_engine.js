#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-UDP6-ENGINE (bim-compiler prompts/ERP_DEPTH_FILM.md §UDP-6). READ THE LOG: §UDP6E lines; exit code is not evidence.
// THE ISSUE: does the twin keep a user's recent items like legacy - which rows exist, in which order, with which label - after the
//   same sequence of saves (MRecentItem.addModifiedField / touchUpdatedRecord, incl. the trim to RecentItems_MaxSaved)?
//   Legacy = the real MRecentItem in the pilot JVM (oracle op `recentitems`); twin = AdRecent replayed on rows, labels from the pilot's
//   records. RecentItems_MaxSaved is set to 3 for GardenWorld on the pilot for the run (a throwaway AD_SysConfig row, removed after,
//   as are the user's AD_RecentItem rows; the pilot has none before). Several sequences, each judged entry by entry.
// Run: NODE_PATH=/home/red1/bim-compiler/node_modules node erp/tests/witness_udp6_recent_engine.js   (pilot postgres + oracle up)
'use strict';
var path = require('path'), cp = require('child_process'), http = require('http');
var ERP = path.join(__dirname, '..'), log = console.log, PGDB = process.env.UDP6_PG_DB || 'idempiere_pilot', R = require(path.join(ERP, 'ad_recent.js'));
var USER = 101, ROLE = 102, CLIENT = 11, MAX = 3;
function psql(sql) {
  return cp.execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', PGDB, '-tAq'],
    { input: 'SET search_path=adempiere;\n' + sql, encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
}
function pgRows(sql) { return JSON.parse(psql("SELECT coalesce(json_agg(t),'[]') FROM (" + sql + ') t')); }
function oracle(body) {
  return new Promise(function (res, rej) {
    var data = JSON.stringify(body), rq = http.request({ host: '127.0.0.1', port: 8097, method: 'POST', headers: { 'Content-Length': Buffer.byteLength(data) } }, function (r) {
      var b = ''; r.on('data', function (c) { b += c; }); r.on('end', function () { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
    });
    rq.on('error', rej); rq.setTimeout(120000, function () { rq.destroy(new Error('oracle timeout')); }); rq.end(data);
  });
}
var sysId = null;
async function cleanup() {
  if (sysId) psql('DELETE FROM ad_sysconfig WHERE ad_sysconfig_id=' + sysId);   // first, so the cache reset below forgets the throwaway value
  try { await oracle({ op: 'recentitems', reset: true, steps: [], ctx: { client: CLIENT, user: USER, role: ROLE, org: 11 } }); } catch (e) {}   // rows through the model + MRecentItem/MSysConfig caches reset
  log('§UDP6E cleanup: recent rows left=' + psql('SELECT count(*) FROM ad_recentitem WHERE ad_user_id=' + USER) + (sysId ? ' sysconfig ' + sysId + ' removed' : '')); sysId = null;
}
process.on('exit', function () { if (sysId) try { psql('DELETE FROM ad_sysconfig WHERE ad_sysconfig_id=' + sysId); } catch (e) {} });
(async function () {
  var before = +psql('SELECT count(*) FROM ad_recentitem WHERE ad_user_id=' + USER);
  if (before) { log('§UDP6E-VERDICT INCONCLUSIVE the pilot user ' + USER + ' already has ' + before + ' recent items (would be lost by cleanup)'); process.exitCode = 3; return; }
  sysId = +psql('SELECT max(ad_sysconfig_id)+1000 FROM ad_sysconfig');
  psql("INSERT INTO ad_sysconfig (ad_sysconfig_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, name, value, configurationlevel, entitytype, ad_sysconfig_uu) VALUES (" +
    sysId + ',' + CLIENT + ",0,'Y',now(),100,now(),100,'RecentItems_MaxSaved','" + MAX + "','C','U',gen_random_uuid())");
  // records the steps touch: (table, record, window, tab) - real pilot rows, windows whose header tab is that table
  var pick = function (tn, win) {
    var t = pgRows("SELECT t.ad_tab_id, tb.ad_table_id FROM ad_tab t JOIN ad_table tb USING (ad_table_id) WHERE t.ad_window_id=" + win + " AND t.tablevel=0 AND t.isactive='Y' ORDER BY t.seqno LIMIT 1")[0];
    var r = pgRows('SELECT ' + tn + '_id AS id FROM ' + tn + ' WHERE ad_client_id=' + CLIENT + ' ORDER BY ' + tn + '_id LIMIT 2');
    return r.map(function (x) { return { tn: tn, table: t.ad_table_id, record: x.id, window: win, tab: t.ad_tab_id }; });
  };
  var SO = pick('c_order', 143), BP = pick('c_bpartner', 123), PR = pick('m_product', 140), INV = pick('c_invoice', 167), PO = pick('c_order', 181);
  var A = function (x) { return { op: 'add', table: x.table, record: x.record, window: x.window, tab: x.tab, tn: x.tn }; }, T = function (x) { return { op: 'touch', table: x.table, record: x.record, window: x.window, tab: x.tab, tn: x.tn }; };
  var SEQS = {
    'new records listed newest first': [A(SO[0]), A(BP[0]), A(PR[0])],
    're-save moves a record to the top (touch)': [A(SO[0]), A(BP[0]), A(PR[0]), A(SO[0]), T(SO[0])],
    'same record from another window updates window/tab': [A(SO[0]), A(BP[0]), A(PO[0])].map(function (s, i) { return i === 2 ? { op: 'add', table: SO[0].table, record: SO[0].record, window: PO[0].window, tab: PO[0].tab, tn: 'c_order' } : s; }),
    'more than MaxSaved: add keeps them, touch trims to MaxSaved': [A(SO[0]), A(BP[0]), A(PR[0]), A(INV[0]), A(SO[1]), T(SO[1])],
    'add alone never trims': [A(SO[0]), A(BP[0]), A(PR[0]), A(INV[0]), A(BP[1])]
  };
  var win = {}; pgRows("SELECT ad_window_id::text id, name, titlelogic FROM ad_window").forEach(function (w) { win[w.id] = w; });
  var resolve = function (tbl, col, id, sub) { var r = pgRows('SELECT "' + sub.toLowerCase() + '" AS v FROM ' + tbl + ' WHERE ' + col + '=' + Number(id))[0]; return r ? r.v : null; };
  var judged = 0, same = 0, bad = [];
  try {
    for (var name in SEQS) {
      var steps = SEQS[name];
      var o = await oracle({ op: 'recentitems', reset: true, steps: steps.map(function (s) { return { op: s.op, table: s.table, record: s.record, window: s.window, tab: s.tab, sleepMs: 40 }; }), ctx: { client: CLIENT, user: USER, role: ROLE, org: 11 } });
      if (!o.ok) { bad.push(name + ' ORACLE ' + o.error); judged++; continue; }
      // twin replay: rows + intents, Updated = a strictly increasing clock (legacy: getDate() at each step, 40 ms apart)
      var rows = [], seq = 1, clock = 0, ts = function () { clock++; return '2026-01-01 00:00:' + String(clock).padStart(2, '0') + '.000'; };
      steps.forEach(function (s) {
        var a = { table: s.table, record: s.record, uu: null, user: USER, role: ROLE, window: s.window, tab: s.tab, client: CLIENT }, now = ts();
        var intents = s.op === 'touch' ? R.touchUpdated(rows, a, MAX, now) : R.addModified(rows, a, MAX);
        intents.forEach(function (it) {
          if (it.op === 'create') { var f = it.fields; f.ad_recentitem_id = seq++; f.ad_client_id = CLIENT; f.isactive = 'Y'; f.updated = now; rows.push(f); }
          else if (it.op === 'update') rows.forEach(function (r) { if (r.ad_recentitem_id === it.id) { Object.assign(r, it.changes); r.updated = now; } });
          else if (it.op === 'touch') rows.forEach(function (r) { if (r.ad_recentitem_id === it.id) r.updated = now; });
          else if (it.op === 'delete') rows = rows.filter(function (r) { return r.ad_recentitem_id !== it.id; });
        });
      });
      var tnOf = {}; steps.forEach(function (s) { tnOf[s.table] = s.tn; });
      var twin = R.listFor(rows, USER, CLIENT).map(function (r) {
        var w = win[String(r.ad_window_id)] || {}, tn = tnOf[r.ad_table_id];
        var po = pgRows('SELECT * FROM ' + tn + ' WHERE ' + tn + '_id=' + Number(r.record_id))[0] || null; if (po) po.__id = r.record_id;
        return r.ad_table_id + '/' + r.record_id + '/w' + r.ad_window_id + '/t' + r.ad_tab_id + ' "' + R.label(w.name, w.titlelogic, po, resolve) + '"';
      });
      var leg = o.list.map(function (x) { return x.table + '/' + x.record + '/w' + x.window + '/t' + x.tab + ' "' + x.label + '"'; });
      judged++;
      if (leg.join(' | ') === twin.join(' | ')) { same++; log('§UDP6E SAME "' + name + '" [' + leg.join(' | ') + ']'); }
      else bad.push('"' + name + '" java=[' + leg.join(' | ') + '] twin=[' + twin.join(' | ') + ']');
    }
  } finally { await cleanup(); }
  bad.forEach(function (l) { log('§UDP6E DIFF ' + l); });
  log('§UDP6E sequences judged=' + judged + ' same=' + same);
  if (!judged) { log('§UDP6E-VERDICT INCONCLUSIVE nothing judged'); process.exitCode = 3; return; }
  log('§UDP6E-VERDICT ' + (same === judged ? 'PASS' : 'FAIL') + ' ' + same + '/' + judged);
  if (same !== judged) process.exitCode = 1;
})().catch(function (e) { log('§UDP6E-VERDICT INCONCLUSIVE ' + (e.stack || e)); process.exitCode = 3; });
