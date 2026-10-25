#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope: W-PLAN-ERP, bim-compiler prompts/TEAMWORK_FRAMEWORK.md §25 (step 5b: the ERP adapter's table scope is read from the compiled plan, BEHAVIOUR-PRESERVING).
//   READ THE LOG after every run — the exit code is not evidence. The REAL erp/idempiere.html in headless Chromium (--disable-gpu), opened with ?team=1; every number is read from the live
//   page (TeamSync.scopeOf over the live ad_table + sqlite_master, the §TEAM_PLAN console line). Every arm names the issue it proves or disproves.
//   §E1 equivalence  — over EVERY table of the live dictionary (N) the plan differs from the old rule `!STATION_LOCAL[t]` on exactly the unreached dictionary VIEWS (absent from the database), and no AD window (X of N) loses a table (§31).
//   §E2 non-AD names — what the old rule shared by default and the new one does not: LISTED, not hidden ("the default-share universe was larger than the dictionary").
//   §E3 fail closed  — no plan => nothing shared + a visible line.   §E4 plan decides — +table, table->local, hub-audience flow ignored, adapter byte-identical.
//   §E5 provenance   — the §TEAM_PLAN line carries the header hash.   §E6 0 page errors.   §MUTANTS — the adapter is served with one rule broken; each must turn >= 1 arm red.
// Run: node erp/tests/witness_team_plan.js 2>&1 | tee /tmp/witness_team_plan_erp.log
'use strict';
var path = require('path'), http = require('http'), fs = require('fs'), crypto = require('crypto'), vm = require('vm');
var ROOT = path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css', '.db': 'application/octet-stream', '.sql': 'text/plain' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var OLD_LOCAL = ['ad_changelog', 'ad_recentitem', 'ad_sequence', 'ad_sequence_no', 'ad_session'];   // the literal at origin/main 4e95b393 erp/team_sync.js:36 — the old rule shared EVERYTHING ELSE
var fails = 0, judged = 0, errors = 0, open = [];
function verdict(ok, label, detail) { judged++; if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); return ok; }
function sha(b) { return crypto.createHash('sha256').update(b).digest('hex').slice(0, 12); }
var PLAN_SRC = fs.readFileSync(path.join(ROOT, 'erp', 'team_plan.js'), 'utf8'), ADAPTER = fs.readFileSync(path.join(ROOT, 'erp', 'team_sync.js'), 'utf8');
var PLAN = (function () { var g = {}; vm.runInNewContext(PLAN_SRC, { window: g, globalThis: g }); return g.TEAM_PLAN; })();
var HDR_HASH = /Plan sha256 ([0-9a-f]{64})/.exec(PLAN_SRC)[1];
function planJs(o) { return '(function (g) { g.TEAM_PLAN = ' + JSON.stringify(o) + '; })(typeof window !== \'undefined\' ? window : globalThis);\n'; }
function variant(fn) { var o = JSON.parse(JSON.stringify(PLAN)); fn(o); return planJs(o); }
var VARIANTS = {
  committed: null,
  plus: variant(function (o) { o.flows.push({ name: 'T9999 x_widget', table: 'X_Widget', dir: 'BOTH', audience: 'space' }); }),
  tolocal: variant(function (o) { o.flows = o.flows.filter(function (f) { return f.table.toLowerCase() !== 'c_order'; }); o.local.push('C_Order'); }),
  hubonly: variant(function (o) { o.flows.forEach(function (f) { f.audience = 'hub'; }); }),
  missing: 404
};
var READER = fs.readFileSync(path.join(ROOT, 'common', 'comm', 'team_scope.js'), 'utf8');
var MUTANTS = [   // [label, adapter source, reader source] — one broken rule each
  ['plan ignored (old rule reinstated in the reader)', ADAPTER, READER.replace(/scopeOf: function \(table\) \{[^\n]*\n/, "scopeOf: function (table) { return ['ad_changelog', 'ad_recentitem', 'ad_sequence', 'ad_sequence_no', 'ad_session'].indexOf(lc(table)) >= 0 ? 'station-local' : 'share'; },\n")],
  ['audience ignored', ADAPTER, READER.replace("f.audience === 'space' && ", '')],
  ['plan hash not logged', ADAPTER.replace("'§TEAM_PLAN hash=' + PLAN_SUM.hash.slice(0, 12) + ' tables='", "'§TEAM_PLAN tables='"), READER],
  ['unplanned treated as share', ADAPTER, READER.replace("I.flows[lc(table)] ? 'share' : 'unplanned'", "'share'")]];

(async function () {
  console.log('═══ W-PLAN-ERP — the ERP adapter reads its table scope from the compiled plan, behaviour-preserving (TEAMWORK_FRAMEWORK §25) ═══\n');
  var cur = { plan: null, adapter: null, reader: null };
  var server = http.createServer(function (req, res) {
    var p = decodeURIComponent(new URL(req.url, 'http://x').pathname), f = path.join(ROOT, p === '/' ? '/erp/idempiere.html' : p);
    if (p === '/erp/team_plan.js' && cur.plan !== null) { if (cur.plan === 404) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(cur.plan); return; }
    if (p === '/common/comm/team_scope.js' && cur.reader) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(cur.reader); return; }
    if (p === '/erp/team_sync.js' && cur.adapter) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(cur.adapter); return; }
    if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + server.address().port;
  var browser = await reqPw().chromium.launch({ args: ['--disable-gpu'] });
  async function load(key, adapterSrc, readerSrc) {                                          // -> { dec, wins, nonAd, logs, errs, served }
    cur.plan = VARIANTS[key]; cur.adapter = adapterSrc || null; cur.reader = readerSrc || null;
    var ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } }), pg = await ctx.newPage(), logs = [], errs = [], served = null;
    pg.on('console', function (m) { logs.push(m.text()); }); pg.on('pageerror', function (e) { errs.push(e.message); errors++; });
    pg.on('response', function (r) { if (/\/erp\/team_sync\.js/.test(r.url())) r.body().then(function (b) { served = sha(b); }).catch(function () {}); });
    await pg.goto(base + '/erp/idempiere.html?login=GardenAdmin&window=143&team=1', { waitUntil: 'load' });
    await pg.waitForFunction(function () { return window.TeamSync && typeof window.TeamSync.scopeOf === 'function' && window.__idmpDb && window.__idmpDb.exec("SELECT count(*) FROM ad_table")[0].values[0][0] > 0; }, null, { timeout: 90000 });
    await new Promise(function (r) { setTimeout(r, 400); });
    var out = await pg.evaluate(function () {
      var db = window.__idmpDb, q = function (s) { var r = db.exec(s); return r.length ? r[0].values : []; };
      var ad = q("SELECT lower(tablename) FROM ad_table WHERE isactive='Y'").map(function (r) { return r[0]; }), adSet = {}; ad.forEach(function (t) { adSet[t] = 1; });
      var sm = q("SELECT lower(name) FROM sqlite_master WHERE type='table'").map(function (r) { return r[0]; }), nonAd = sm.filter(function (t) { return !adSet[t]; });
      var dec = {}; ad.forEach(function (t) { dec[t] = window.TeamSync.scopeOf(t); });
      var meta = {}; ad.forEach(function (t) { if (dec[t] === 'unplanned') { var r = q("SELECT isview FROM ad_table WHERE lower(tablename)='" + t + "'"); meta[t] = { isview: r.length ? r[0][0] : null, exists: q("SELECT 1 FROM sqlite_master WHERE lower(name)='" + t + "'").length > 0, type: (q("SELECT type FROM sqlite_master WHERE lower(name)='" + t + "'")[0] || [null])[0] }; } });
      var triggers = q("SELECT COUNT(*) FROM sqlite_master WHERE type='trigger'")[0][0];
      var nd = {}; nonAd.forEach(function (t) { var r = q("SELECT ad_table_id, isactive FROM ad_table WHERE lower(tablename)='" + t + "'"); nd[t] = { scope: window.TeamSync.scopeOf(t), inAd: r.length ? r[0][1] : null, tabs: r.length ? q("SELECT count(*) FROM ad_tab WHERE ad_table_id=" + r[0][0] + " AND isactive='Y'")[0][0] : null }; });
      var wins = q("SELECT ad_window_id FROM ad_window WHERE isactive='Y'").map(function (r) { return Number(r[0]); }), wdec = {};
      wins.forEach(function (w) { wdec[w] = q("SELECT DISTINCT lower(t.tablename) FROM ad_tab tb JOIN ad_table t ON t.ad_table_id=tb.ad_table_id WHERE tb.ad_window_id=" + w + " AND tb.isactive='Y'").map(function (r) { return r[0]; }); });
      return { ad: ad.length, dec: dec, meta: meta, triggers: triggers, nd: nd, wdec: wdec, extra: window.TeamSync.scopeOf('x_widget') };
    });
    await ctx.close(); return { out: out, logs: logs.filter(function (l) { return /§TEAM_PLAN/.test(l); }), errs: errs, served: served };
  }
  async function arms(adapterSrc, quiet, readerSrc) {
    var red = [], R = {};
    function A(name, ok, label, detail) { if (!ok) red.push(name); if (!quiet) verdict(ok, label, detail); return ok; }
    for (var k of Object.keys(VARIANTS)) R[k] = await load(k, adapterSrc, readerSrc);
    var c = R.committed.out, oldShared = function (t) { return OLD_LOCAL.indexOf(t) < 0; }, newShared = function (t) { return c.dec[t] === 'share'; };
    if (!quiet) console.log('§E1 equivalence');
    var tabs = Object.keys(c.dec), diff = tabs.filter(function (t) { return oldShared(t) !== newShared(t); });
    var notView = diff.filter(function (t) { return !c.meta[t] || c.meta[t].isview !== 'Y'; }), present = diff.filter(function (t) { return c.meta[t] && c.meta[t].exists; });
    A('E1', tabs.length > 900 && diff.length > 0 && notView.length === 0, 'over all N=' + tabs.length + ' live dictionary tables the plan differs from the old rule on EXACTLY ' + diff.length + ' tables, and every one is a dictionary VIEW (IsView=Y)', notView.length ? 'NOT VIEWS: ' + notView.slice(0, 10).join(',') : diff.length + ' differ, all views; shared ' + tabs.filter(newShared).length + ' (old rule ' + tabs.filter(oldShared).length + ')');
    var asTable = diff.filter(function (t) { return c.meta[t] && c.meta[t].type === 'table'; }), asView = diff.filter(function (t) { return c.meta[t] && c.meta[t].type === 'view'; });
    A('E1', diff.length > 0 && asTable.length === 0 && c.triggers === 0, 'in the LIVE database (shipped seed + self-heal patches) none of those ' + diff.length + ' views is a TABLE (nothing can store a record in it) and there are ' + c.triggers + ' triggers (no INSTEAD OF write path): ' + asView.length + ' exist as read-only SQL views, ' + (diff.length - asView.length) + ' do not exist at all', asTable.length ? 'ARE TABLES: ' + asTable.slice(0, 10).join(',') : 'views=' + asView.length + ' absent=' + (diff.length - asView.length) + ' tables=0');
    var wins = Object.keys(c.wdec), wdiff = wins.filter(function (w) { var ts = c.wdec[w]; return ts.filter(oldShared).length !== ts.filter(newShared).length; });
    A('E1', wins.length > 100 && wdiff.length === 0, 'X of N AD windows: every window has the same number of shared tab-tables under both rules (N=' + wins.length + ') — no window loses a table', wdiff.length ? 'DIFFER windows: ' + wdiff.slice(0, 8).join(',') : '0 differ');
    A('E1', c.dec.ad_sequence === 'station-local' && c.dec.ad_recentitem === 'station-local' && Object.keys(c.dec).filter(function (t) { return c.dec[t] === 'station-local'; }).length === 5, 'the 5 station-owned tables are station-local, nothing else is', Object.keys(c.dec).filter(function (t) { return c.dec[t] === 'station-local'; }).join(','));
    if (!quiet) console.log('§E2 names that are not active AD tables');
    var nd = Object.keys(c.nd), inDict = nd.filter(function (t) { return c.nd[t].inAd !== null; });
    A('E2', nd.length > 0 && nd.every(function (t) { return c.nd[t].scope === 'unplanned'; }), 'every sqlite table that is not an active AD table is unplanned under the new rule (old rule: shared) — ' + nd.length + ' names', nd.length + ' names');
    A('E2', inDict.length === 0, 'none of them has a row in the live ad_table, so no AD window tab can reference it: a user cannot author an op on them through any window (they are cm_*/k_* module tables, working tables and sqlite internals)', inDict.length ? 'IN DICTIONARY: ' + inDict.join(',') : '0 of ' + nd.length + ' in ad_table');
    if (!quiet) open.push(nd.length + ' tables outside the live dictionary were shared by the old default and are now local-only: ' + nd.join(',') + ' (no ops on them appeared in any team witness run: grep table-not-in-plan = 0)');
    if (!quiet) console.log('§E3 fail closed');
    var m = R.missing;
    A('E3', Object.keys(m.out.dec).every(function (t) { return m.out.dec[t] === 'unplanned'; }) && m.logs.some(function (l) { return /missing — nothing is shared/.test(l); }), 'no plan => every table unplanned (0 shared) and a visible log line', 'shared=' + Object.keys(m.out.dec).filter(function (t) { return m.out.dec[t] === 'share'; }).length + ' log=' + JSON.stringify(m.logs));
    if (!quiet) console.log('§E4 the plan decides');
    A('E4', R.plus.out.extra === 'share' && c.extra === 'unplanned', 'a plan with one more table shares it (x_widget unplanned -> share) with no adapter change', c.extra + ' -> ' + R.plus.out.extra);
    A('E4', R.tolocal.out.dec.c_order === 'station-local' && R.tolocal.out.dec.c_orderline === 'share', 'a plan that moves c_order to local silences it; c_orderline stays shared', R.tolocal.out.dec.c_order + ' / ' + R.tolocal.out.dec.c_orderline);
    A('E4', Object.keys(R.hubonly.out.dec).filter(function (t) { return R.hubonly.out.dec[t] === 'share'; }).length === 0, 'hub-audience flows share nothing in the team ERP (only audience space)', 'shared=' + Object.keys(R.hubonly.out.dec).filter(function (t) { return R.hubonly.out.dec[t] === 'share'; }).length);
    A('E4', !!R.plus.served && R.plus.served === R.committed.served, 'team_sync.js served byte-identical in both runs (no adapter change)', R.committed.served + ' = ' + R.plus.served);
    if (!quiet) console.log('§E5 provenance');
    A('E5', R.committed.logs.some(function (l) { return l.indexOf('hash=' + HDR_HASH.slice(0, 12)) !== -1 && /tables=857 local=5/.test(l); }), 'the §TEAM_PLAN line states the header hash, 857 tables, 5 local', JSON.stringify(R.committed.logs) + ' header=' + HDR_HASH.slice(0, 12));
    var errN = Object.keys(R).reduce(function (n, k) { return n + R[k].errs.length; }, 0);
    if (!quiet) console.log('§E6 page errors');
    A('E6', errN === 0, 'zero page errors across all ' + Object.keys(R).length + ' loads', 'errors=' + errN);
    return red;
  }
  try {
    await arms(null, false);
    console.log('§MUTANTS (the adapter is served with one rule broken; each must turn at least one arm red)');
    for (var m of MUTANTS) { var red = await arms(m[1], true, m[2]); var applied = m[1] !== ADAPTER || m[2] !== READER; verdict(applied && red.length > 0, m[0] + (applied ? '' : ' (MUTATION DID NOT APPLY: stale anchor)') + ' -> red arms: ' + (red.length ? Array.from(new Set(red)).join(', ') : 'NONE (survivor = hole)')); }
  } finally { await browser.close(); server.close(); }
  open.forEach(function (o) { console.log('   🟡 OPEN — ' + o); });
  console.log('\n§W-PLAN-ERP ' + (fails ? 'FAIL' : judged ? 'PASS' : 'INCONCLUSIVE') + ' judged=' + judged + ' fails=' + fails + ' open=' + open.length + ' pageerrors=' + errors + '  (plan unsigned: §16.13 Q1)');
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.error('🔴 witness crashed', e); process.exit(2); });
