#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-ACCT-VIEWER (bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §ACCT-VIEWER: the Posted view reaches every accounting schema, as
//   legacy's Account Viewer does). READ THE LOG after every run: every verdict is a §ACCTV line; the exit code is not the evidence.
//   INCONCLUSIVE when nothing was judged (no browser = nothing of the page is judged). A mutant that makes its named case THROW is CRASHED, not a kill.
// SPEC (claims written before the code, each names the issue it exposes):
//   V1 SWEEP       for every posting table that holds Fact_Acct rows of the login's tenant in the seed (N from ad_seed.db: a Posted column, not a view, joined to Fact_Acct): on the real
//                  page, real login, the record's own Posted button; schema by schema through the selector + Refresh the rows the USER sees == an independent SQL
//                  read of Fact_Acct for table + record + schema (count, account, debit, credit, Fact_Acct_ID order); total row == the SQL sums; debit = credit;
//                  the union over the selector == every row of the record; the page's §POSTED-FACTS line == what is on screen
//                                                                        -> entries of the second schema cannot be reached; a row missing, doubled or of another schema
//   V2 DEFAULT     the view opens on the client's primary schema; the selector holds the client's schemas and no "all" entry; picking a schema WITHOUT Refresh
//                  changes no row and runs no query                      -> the twin shows what legacy never shows (all at once, or a query on select)
//   V3 ONE-SCHEMA  a GL Journal of the client's NON-primary schema: the selector offers that schema only and the view opens on its rows
//                                                                        -> a second schema is invented for a document that posts in one
//   V5 NOT-POSTED  posting tables with no Fact_Acct row in the seed are listed, not judged: INCONCLUSIVE, never PASS
//   V6 NODE        acctSchemas / factQuery (erp/accts_posted.js) on the seed by node == hand SQL: primary first also when it is not the lowest id, inactive
//                  schema left out, a journal's own schema, one schema's rows in Fact_Acct_ID order, null for a record with no row
//                                                                        -> the list order is by id; the order is only right because of the demo's ids
//   (V4 FILED, the invoice filed from the sheet, 3 + 3 = 6 of 6, is W-DOOR-ERP E2 key=posting.)
// FIXTURE: in the seed NO GardenWorld record carries Posted = 'Y': its 8 tables hold Fact_Acct rows beside Posted = 'N', and the button on 'N' does not open the
//   viewer. The witness sets Posted = 'Y' on the ONE record it judges, in the page's memory, before login; each case line says fixture=posted-flag.
//   Fact_Acct is never written. The record posted by the page's own poster (no fixture) is V4, in W-DOOR-ERP.
// Browser: headless Chromium (puppeteer, ACCTV_PUPPETEER or ~/bim-compiler/node_modules/puppeteer) on the REAL erp/idempiere.html served from this tree; the page's
//   own login card (GardenWorld / GardenAdmin); one browser context per record. Mutants (ACCTV_MUTANTS=1): the server (and the node loader) hand out a rewritten
//   file (the text must match exactly once, else NOT-APPLIED); a mutant child runs its killing case on 2 tables.
// Command: env -u DBUS_SESSION_BUS_ADDRESS node erp/tests/witness_acct_viewer.js      (ACCTV_MUTANTS=1 adds the mutant sweep; ACCTV_TABLES=A,B narrows the sweep;
//   ACCTV_BASE=https://host/path/ judges a deployed site instead of this tree: no mutants, V6 still from this tree)
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), http = require('http');
var ERP = path.join(__dirname, '..'), ROOT = path.join(ERP, '..');
var MUTANT = process.env.ACCTV_MUTANT || '', ONLY = process.env.ACCTV_ONLY || '', LIVE = process.env.ACCTV_BASE || '';
var say = console.log.bind(console);
var CASES = {}, ALL = { judged: 0, failed: 0 };
function J(x) { return JSON.stringify(x); }
function check(cs, key, rule, ok, info) {
  var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0, threw: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §ACCTV-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + String(J(info)).slice(0, 1100)));
  return ok;
}
async function guard(cs, key, rule, fn) { try { await fn(); } catch (e) { check(cs, key, rule, false, 'threw: ' + (e && (e.stack || e.message) || String(e))); CASES[cs].threw++; } }
function verdict(cs, extra) { var c = CASES[cs] || { judged: 0, failed: 0, threw: 0 }; var v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§ACCTV-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed + ' threw=' + c.threw + (extra ? ' ' + extra : '') + (MUTANT ? ' mutant=' + MUTANT : '')); return v; }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function cents(x) { return Math.round(Number(String(x).replace(/,/g, '')) * 100); }
function want(cs) { return !ONLY || ONLY === cs; }

// ── mutants: a rewritten copy of ONE file reaches the browser (and the node loader) ──
var AP_JS = 'erp/accts_posted.js', PAGE = 'erp/idempiere.html';
var MUT = [
  { name: 'M1-first-schema-only-no-selector', kills: 'V1', file: AP_JS, from: 'if (vm.schemas && vm.schemas.length) bd.appendChild(schemaBar(doc, vm, opts));', to: 'if (vm.schemas && vm.schemas.length > 99) bd.appendChild(schemaBar(doc, vm, opts));' },
  { name: 'M2-refresh-reads-the-first-schema-again', kills: 'V1', file: AP_JS, from: 'var sch = schemaId != null ? Number(schemaId) : (', to: "var sch = schemaId === 'never' ? Number(schemaId) : (" },
  { name: 'M3-rows-of-a-schema-shown-twice', kills: 'V1', file: AP_JS, from: 'var lines = rows.filter(function (r) { return Number(r.sch) === sch; }).map(', to: 'var lines = rows.concat(rows).filter(function (r) { return Number(r.sch) === sch; }).map(' },
  { name: 'M4-all-schemas-under-one', kills: 'V1', file: AP_JS, from: 'var lines = rows.filter(function (r) { return Number(r.sch) === sch; }).map(', to: 'var lines = rows.filter(function () { return true; }).map(' },
  { name: 'M5-invoice-table-only', kills: 'V1', file: PAGE, from: "    if (tid == null) return null;\n    var AP = window.AcctsPosted, cl = ", to: "    if (tid == null || ref.table !== 'C_Invoice') return null;\n    var AP = window.AcctsPosted, cl = " },
  { name: 'M11-rows-of-another-tenant-shown', kills: 'V1', file: AP_JS, from: "(a.clientId != null ? ' AND f.ad_client_id IN (0,' + Number(a.clientId) + ')' : '')", to: "(a.clientId === 'never' ? ' AND f.ad_client_id IN (0,' + Number(a.clientId) + ')' : '')" },
  { name: 'M6-total-row-of-the-first-schema', kills: 'V1', file: AP_JS, from: 'mine = by[sch] || { dr: 0, cr: 0 };', to: 'mine = all[0];' },
  { name: 'M7-select-queries-without-refresh', kills: 'V2', file: AP_JS, from: '    bar.appendChild(sel);\n', to: "    bar.appendChild(sel); sel.addEventListener('change', function () { if (opts.onRefresh) opts.onRefresh(Number(sel.value)); });\n" },
  { name: 'M8-journal-offers-every-schema', kills: 'V3', file: AP_JS, from: 'if (own.length) return [{ id: Number(own[0].id), name: own[0].name }];', to: 'if (own.length > 9) return [{ id: Number(own[0].id), name: own[0].name }];' },
  { name: 'M9-selector-ordered-by-id', kills: 'V6', file: AP_JS, from: "q(S + 'ad_clientinfo ci JOIN c_acctschema s ON s.c_acctschema_id=ci.c_acctschema1_id WHERE ci.ad_client_id=?', [Number(clientId)])\n      .concat(", to: '[].concat(' },
  { name: 'M10-inactive-schema-offered', kills: 'V6', file: AP_JS, from: "c_acctschema s WHERE s.isactive='Y' AND s.ad_client_id=?", to: "c_acctschema s WHERE s.isactive IS NOT NULL AND s.ad_client_id=?" }
];
var ACTIVE = MUT.filter(function (m) { return m.name === MUTANT; })[0] || null, APPLIED = null;
function served(rel, body) {   // the file as the browser / node gets it
  if (!ACTIVE || rel !== ACTIVE.file) return body;
  var txt = body.toString('utf8'), n = txt.split(ACTIVE.from).length - 1;
  APPLIED = n;
  return n === 1 ? Buffer.from(txt.replace(ACTIVE.from, ACTIVE.to)) : body;
}
var TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.sql': 'text/plain; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
function serve() {
  return new Promise(function (res) {
    var srv = http.createServer(function (req, rsp) {
      var rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, ''), f = path.join(ROOT, rel);
      if (req.method !== 'GET' || f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || !fs.statSync(f).isFile()) { rsp.writeHead(404); rsp.end(); return; }
      var body = served(rel, fs.readFileSync(f));
      rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'no-cache' }); rsp.end(body);
    });
    srv.listen(0, '127.0.0.1', function () { res({ srv: srv, base: 'http://127.0.0.1:' + srv.address().port + '/' }); });
  });
}

// ── node side: the seed, read by sql.js (the independent reader of N and of V6) ──
var SQLJS = process.env.SQLJS || process.env.SQLJS_DIR || path.join(os.homedir(), 'bim-ootb/tests/node_modules/sql.js');
function rowsOf(db, sql, params) { var st = db.prepare(sql), out = []; try { if (params && params.length) st.bind(params); while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } } finally { st.free(); } return out; }
function loadAP() { var m = { exports: {} }; new Function('module', 'exports', served(AP_JS, fs.readFileSync(path.join(ROOT, AP_JS))).toString('utf8'))(m, m.exports); return m.exports; } 
function denominators(db) {
  var CL = rowsOf(db, "SELECT ad_client_id AS c FROM ad_client WHERE name='GardenWorld'")[0].c;   // the tenant of the login: the denominator is ITS books
  var tabs = rowsOf(db, "SELECT t.ad_table_id AS tid, t.tablename AS tn, t.ad_window_id AS win, t.po_window_id AS powin FROM ad_table t WHERE t.isview='N' AND EXISTS (SELECT 1 FROM ad_column c WHERE c.ad_table_id=t.ad_table_id AND c.columnname='Posted') ORDER BY t.tablename");
  var withRows = [], without = [];
  tabs.forEach(function (t) {
    var n = rowsOf(db, 'SELECT count(*) AS n, count(DISTINCT record_id) AS recs, count(DISTINCT c_acctschema_id) AS sch FROM fact_acct WHERE ad_table_id=? AND ad_client_id=?', [t.tid, CL])[0];
    if (!n.n) { without.push(t.tn); return; }
    var key = t.tn.toLowerCase() + '_id', hasSo = rowsOf(db, "SELECT count(*) AS n FROM pragma_table_info('" + t.tn.toLowerCase() + "') WHERE lower(name)='issotrx'")[0].n > 0;
    // the record judged: a Posted = 'Y' record first, then the one with the most schemas, then the lowest id
    var rec = rowsOf(db, 'SELECT x.' + key + ' AS id, x.posted AS posted' + (hasSo ? ', x.issotrx AS so' : '') + ', (SELECT count(DISTINCT c_acctschema_id) FROM fact_acct f WHERE f.ad_table_id=? AND f.record_id=x.' + key + ') AS ns FROM ' + t.tn.toLowerCase() +
      ' x WHERE x.ad_client_id=? AND x.' + key + ' IN (SELECT record_id FROM fact_acct WHERE ad_table_id=?) ORDER BY (x.posted=\'Y\') DESC, ns DESC, x.' + key + ' LIMIT 1', [t.tid, CL, t.tid])[0];
    var postedY = rowsOf(db, 'SELECT count(*) AS n FROM ' + t.tn.toLowerCase() + " x WHERE x.ad_client_id=? AND x.posted='Y' AND x." + key + ' IN (SELECT record_id FROM fact_acct WHERE ad_table_id=?)', [CL, t.tid])[0].n;
    withRows.push({ tn: t.tn, tid: t.tid, cl: CL, key: key, rows: n.n, recs: n.recs, sch: n.sch, postedY: postedY, rec: rec, win: (rec && rec.so === 'N' && t.powin) ? t.powin : t.win });
  });
  return { all: tabs.length, client: CL, withRows: withRows, without: without };
}

// ── browser side ──
var PUP = null; try { PUP = require(process.env.ACCTV_PUPPETEER || path.join(os.homedir(), 'bim-compiler/node_modules/puppeteer')); } catch (e) { PUP = null; }
var B = { browser: null, base: null, pageErrors: [] };
async function newPage(ctx, rel) {
  var page = await ctx.newPage(); await page.setViewport({ width: 1440, height: 810 }); page.__log = [];
  page.on('console', function (m) { var t = m.text(); if (/^§/.test(t)) page.__log.push(t); });
  page.on('pageerror', function (e) { B.pageErrors.push(String(e && e.message).slice(0, 200)); });
  await page.setRequestInterception(true);
  page.on('request', function (rq) { var u = rq.url(); if (u.indexOf(B.base) !== 0 && !/^(data|blob):/.test(u)) return rq.abort(); rq.continue(); });   // nothing leaves for another host
  await page.goto(B.base + rel, { waitUntil: 'load', timeout: 180000 });
  return page;
}
function logOf(page, re, from) { return page.__log.slice(from || 0).filter(function (l) { return re.test(l); }); }
async function waitLog(page, re, from, ms) { var t0 = Date.now(); while (Date.now() - t0 < (ms || 120000)) { var l = logOf(page, re, from); if (l.length) return l[l.length - 1]; await sleep(100); } return null; }
function erpQ(page) { return function (sql, params) { return page.evaluate(function (s, p) { var st = window.__idmpDb.prepare(s), out = []; try { if (p && p.length) st.bind(p); while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } } finally { st.free(); } return out; }, sql, params || []); }; }
async function erpLogin(page) {   // the page's own login card: tenant (when the page asks), user, role / org as offered, Log In
  var pick = function (list, nm) { return page.evaluate(function (l, n) { var e = Array.prototype.filter.call(document.querySelectorAll(l + ' .idmp-login-user'), function (x) { var m = x.querySelector('.nm'); return m && m.textContent.trim() === n; })[0]; if (e) e.click(); return !!e; }, list, nm); };
  await page.waitForFunction(function () { return document.getElementById('idmp-login').style.display === 'flex'; }, { timeout: 60000 });
  if (await pick('#idmp-login-clients', 'GardenWorld')) await sleep(300);
  await page.waitForFunction(function () { return document.querySelectorAll('#idmp-login-users .idmp-login-user').length > 0; }, { timeout: 30000 });
  if (!(await pick('#idmp-login-users', 'GardenAdmin'))) throw new Error('GardenAdmin is not on the login card');
  await page.waitForFunction(function () { var e = document.getElementById('idmp-login-step2'); return e && e.style.display !== 'none'; }, { timeout: 30000 });
  await page.click('#idmp-login-ok');
  await page.waitForFunction(function () { var t = document.getElementById('idmp-tree'); return t && t.children.length > 0; }, { timeout: 60000 });
}
// what the user sees in the Posted view
function view(page) {
  return page.evaluate(function () {
    var o = document.getElementById('posted-overlay'); if (!o) return { open: false, options: [], lines: [], total: null, text: null };
    var g = function (l, c) { var e = l.querySelector(c); return e ? e.textContent.trim() : null; }, sel = o.querySelector('.posted-schema-sel'), t = o.querySelector('.posted-total');
    return { open: true, text: o.textContent, refresh: !!o.querySelector('.posted-refresh'),
      options: sel ? Array.prototype.map.call(sel.options, function (x) { return { v: x.value, t: x.textContent, sel: x.selected }; }) : [],
      lines: Array.prototype.map.call(o.querySelectorAll('.posted-line'), function (l) { return [g(l, '.posted-acct'), g(l, '.posted-dr'), g(l, '.posted-cr')]; }),
      total: t ? [g(t, '.posted-dr'), g(t, '.posted-cr')] : null };
  });
}
function pickSchema(page, v) { return page.evaluate(function (x) { var s = document.querySelector('#posted-overlay .posted-schema-sel'); if (!s) return false; s.value = String(x); s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); return s.value === String(x); }, v); }
function clickRefresh(page) { return page.evaluate(function () { var b = document.querySelector('#posted-overlay .posted-refresh'); if (b) b.click(); return !!b; }); }
function factsOf(line) { var m = {}; String(line || '').replace(/(\w+)=(\S+)/g, function (_, k, v) { m[k] = v; return _; }); return m; }

// open ONE record's window by the page's deep link, log in, press the record's own Posted button. Returns the page + what happened; never throws for "no button".
async function openPosted(t) {
  var ctx = await B.browser.createBrowserContext(), page = await newPage(ctx, 'erp/idempiere.html?window=' + t.win + '&record=' + t.rec.id), out = { ctx: ctx, page: page, fixture: 'none' };
  if (!(await waitLog(page, /^§IDEMPIERE boot db=/, 0, 180000))) { out.why = 'the page did not boot'; return out; }
  var q = erpQ(page); out.q = q;
  var cur = (await q('SELECT posted FROM ' + t.tn.toLowerCase() + ' WHERE ' + t.key + '=?', [t.rec.id]))[0];
  if (!cur) { out.why = 'the page DB has no ' + t.tn + ' ' + t.rec.id; return out; }
  if (cur.posted !== 'Y') { await page.evaluate(function (s, p) { window.__idmpDb.run(s, p); }, 'UPDATE ' + t.tn.toLowerCase() + " SET posted='Y' WHERE " + t.key + '=?', [t.rec.id]); out.fixture = 'posted-flag'; }
  await erpLogin(page);
  out.zoom = await waitLog(page, /^§ZOOM window=/, 0, 60000); await sleep(1200);
  var n0 = page.__log.length;
  out.button = await page.evaluate(function (id) {
    var b = document.querySelector('tr[data-ad-record="' + id + '"] .idmp-posted-btn') || document.querySelector('.idmp-posted-fld .idmp-posted-btn') || document.querySelector('.idmp-posted-btn');
    if (b) b.click(); return b ? b.textContent.trim() : null;
  }, t.rec.id);
  if (!out.button) { out.why = 'the window shows no Posted button for this record (zoom: ' + out.zoom + ')'; return out; }
  await sleep(900);
  out.route = logOf(page, /^§POSTED-COLUMN open /, n0)[0] || null;
  out.facts = logOf(page, /^§POSTED-FACTS/, n0);
  out.n0 = n0;
  return out;
}
// the independent read: Fact_Acct of the page DB for table + record (+ schema), and the schema list by hand SQL (primary first, then by id; a journal: its own)
async function sqlFacts(q, t, sch) {
  var r = await q('SELECT f.fact_acct_id, f.c_acctschema_id, f.amtacctdr, f.amtacctcr, ev.value, ev.name FROM fact_acct f JOIN c_elementvalue ev ON ev.c_elementvalue_id=f.account_id WHERE f.ad_client_id=? AND f.ad_table_id=? AND f.record_id=?' + (sch == null ? '' : ' AND f.c_acctschema_id=?') + ' ORDER BY f.fact_acct_id', sch == null ? [t.cl, t.tid, t.rec.id] : [t.cl, t.tid, t.rec.id, sch]);
  return r.map(function (f) { return [f.value + ' · ' + f.name, cents(f.amtacctdr), cents(f.amtacctcr), f.c_acctschema_id]; });
}
async function sqlSchemas(q, t) {
  if (t.tn === 'GL_Journal') return (await q('SELECT c_acctschema_id AS id FROM gl_journal WHERE gl_journal_id=?', [t.rec.id])).map(function (r) { return String(r.id); });
  var cl = (await q('SELECT ad_client_id AS c FROM ' + t.tn.toLowerCase() + ' WHERE ' + t.key + '=?', [t.rec.id]))[0].c;
  var first = (await q('SELECT c_acctschema1_id AS id FROM ad_clientinfo WHERE ad_client_id=?', [cl]))[0].id;
  var rest = await q("SELECT c_acctschema_id AS id FROM c_acctschema WHERE ad_client_id=? AND isactive='Y' AND c_acctschema_id<>? AND c_acctschema_id IN (SELECT c_acctschema_id FROM c_acctschema_gl) AND c_acctschema_id IN (SELECT c_acctschema_id FROM c_acctschema_default) ORDER BY c_acctschema_id", [cl, first]);
  return [String(first)].concat(rest.map(function (r) { return String(r.id); }));
}
function shownOf(v) { return v.lines.map(function (l) { return [l[0], cents(l[1]), cents(l[2])]; }); }
function strip(w) { return w.map(function (l) { return [l[0], l[1], l[2]]; }); }

// judge one record's view over every schema of its selector. cs = the case the checks belong to. Returns { ok, shown, of }
async function judge(cs, t, o) {
  var page = o.page, q = o.q, tag = t.tn + '#' + t.rec.id, ok = true, total = 0;
  var all = await sqlFacts(q, t, null), schemas = await sqlSchemas(q, t), v = await view(page);
  var foreign = (await q('SELECT count(*) AS n FROM fact_acct WHERE ad_table_id=? AND record_id=? AND ad_client_id NOT IN (0,?)', [t.tid, t.rec.id, t.cl]))[0].n;   // another tenant's rows under the same table + record id
  ok = check(cs, t.tn + ':route', tag + ': the record\'s own Posted button ("' + o.button + '") opened the accounting of THIS record', new RegExp('open rec=' + t.rec.id + ' posted=true').test(String(o.route)) && v.open, { route: o.route, open: v.open }) && ok;
  ok = check(cs, t.tn + ':selector', tag + ': the selector offers the schemas an independent read gives, in that order (' + schemas.join(',') + '), opens on the first, with a Refresh', J(v.options.map(function (x) { return x.v; })) === J(schemas) && !!v.options.length && v.options[0].sel && v.refresh, v.options) && ok;
  for (var i = 0; i < schemas.length; i++) {
    var sch = schemas[i], n0 = page.__log.length, line = null;
    if (i === 0) line = o.facts[o.facts.length - 1] || null;
    else { await pickSchema(page, sch); await clickRefresh(page); line = await waitLog(page, /^§POSTED-FACTS/, n0, 5000); await sleep(200); v = await view(page); }
    var wantRows = await sqlFacts(q, t, Number(sch)), shown = shownOf(v), dr = wantRows.reduce(function (a, l) { return a + l[1]; }, 0), cr = wantRows.reduce(function (a, l) { return a + l[2]; }, 0), f = factsOf(line);
    total += shown.length;
    say('  page: ' + line);
    ok = check(cs, t.tn + ':rows@' + sch, tag + ' schema ' + sch + ': the rows on screen == SQL (account, debit, credit, Fact_Acct_ID order), ' + wantRows.length + ' rows', J(shown) === J(strip(wantRows)), { shown: shown, want: strip(wantRows) }) && ok;
    ok = check(cs, t.tn + ':total@' + sch, tag + ' schema ' + sch + ': the total row == the SQL sums (' + dr / 100 + ' / ' + cr / 100 + ') and debit = credit', !!v.total && cents(v.total[0]) === dr && cents(v.total[1]) === cr && dr === cr, { total: v.total, dr: dr, cr: cr }) && ok;
    ok = check(cs, t.tn + ':log@' + sch, tag + ' schema ' + sch + ': the page\'s §POSTED-FACTS line says what is on screen (schema, lines, dr, cr, of = all rows of the record)', f.schema === String(sch) && Number(f.lines) === shown.length && cents(f.dr) === dr && cents(f.cr) === cr && Number(f.of) === all.length && f.selector === schemas.join(','), line) && ok;
  }
  var has = all.map(function (l) { return String(l[3]); }).filter(function (x, i2, a) { return a.indexOf(x) === i2; });
  ok = check(cs, t.tn + ':union', tag + ': every Fact_Acct row of the record was shown once over the selector (' + all.length + ' rows in ' + has.length + ' schema(s)), every schema that holds rows is offered, and none of the ' + foreign + ' rows another tenant holds under the same table + record id', total === all.length && all.length > 0 && has.every(function (x) { return schemas.indexOf(x) >= 0; }), { shownTotal: total, sql: all.length, has: has, offered: schemas }) && ok;
  return { ok: ok, shown: total, of: all.length, schemas: schemas };
}

(async function main() {
  say('§ACCTV-LOAD tree=' + ROOT + ' mutant=' + (MUTANT || 'none') + ' only=' + (ONLY || 'all') + ' puppeteer=' + (PUP ? 'yes' : 'NO') + (LIVE ? ' site=' + LIVE : ''));
  var SQL = await require(SQLJS)(), seedBytes = fs.readFileSync(path.join(ERP, 'ad_seed.db')), seed = new SQL.Database(seedBytes), D = denominators(seed);
  var pickT = process.env.ACCTV_TABLES ? process.env.ACCTV_TABLES.split(',') : null, N = D.withRows.filter(function (t) { return !pickT || pickT.indexOf(t.tn) >= 0; });
  say('§ACCTV-DENOMINATOR posting tables in the dictionary=' + D.all + ' with Fact_Acct rows of GardenWorld (client ' + D.client + ') in the seed N=' + D.withRows.length + (pickT ? ' (this run: ' + N.length + ')' : '') + ' ' + D.withRows.map(function (t) { return t.tn + '(rows=' + t.rows + ',records=' + t.recs + ',schemas=' + t.sch + ',postedY=' + t.postedY + ')'; }).join(' '));

  // ═══ V6 NODE ═══
  if (want('V6')) {
    await guard('V6', 'node', 'acctSchemas / factQuery on the seed by node', async function () {
      var AP = loadAP(), db = new SQL.Database(seedBytes), q = function (s, p) { return rowsOf(db, s, p); }, inv = D.withRows.filter(function (t) { return t.tn === 'C_Invoice'; })[0], ids = function (a) { return a.map(function (s) { return s.id; }); };
      var cl = q('SELECT ad_client_id AS c FROM c_invoice WHERE c_invoice_id=?', [inv.rec.id])[0].c, prim = q('SELECT c_acctschema1_id AS id FROM ad_clientinfo WHERE ad_client_id=?', [cl])[0].id;
      var others = q("SELECT c_acctschema_id AS id FROM c_acctschema WHERE ad_client_id=? AND isactive='Y' AND c_acctschema_id<>? ORDER BY c_acctschema_id", [cl, prim]).map(function (r) { return r.id; });
      var acc = { clientId: cl, orgs: '*' }, s0 = AP.acctSchemas(q, cl, 'C_Invoice', inv.rec.id), names = q('SELECT name FROM c_acctschema WHERE c_acctschema_id=?', [prim])[0].name;
      check('V6', 'list', 'the list = the client\'s primary schema, then its other active schemas by id (' + [prim].concat(others).join(',') + '), each with its name', J(ids(s0)) === J([prim].concat(others)) && others.length > 0 && s0[0].name === names, s0);
      var other = others[others.length - 1];
      db.run('UPDATE ad_clientinfo SET c_acctschema1_id=? WHERE ad_client_id=?', [other, cl]);
      var s1 = AP.acctSchemas(q, cl, 'C_Invoice', inv.rec.id), exp1 = [other].concat([prim].concat(others).filter(function (x) { return x !== other; }).sort(function (a, b) { return a - b; }));
      check('V6', 'primary-first', 'with the client\'s primary set to ' + other + ' (not the lowest id) the list starts with it: ' + exp1.join(','), J(ids(s1)) === J(exp1), ids(s1));
      db.run('UPDATE ad_clientinfo SET c_acctschema1_id=? WHERE ad_client_id=?', [prim, cl]); db.run("UPDATE c_acctschema SET isactive='N' WHERE c_acctschema_id=?", [other]);
      var s2 = AP.acctSchemas(q, cl, 'C_Invoice', inv.rec.id);
      check('V6', 'inactive', 'a schema set inactive (' + other + ') is not offered', ids(s2).indexOf(other) < 0 && ids(s2)[0] === prim, ids(s2));
      db.run("UPDATE c_acctschema SET isactive='Y' WHERE c_acctschema_id=?", [other]);
      var js = q('SELECT gl_journal_id AS id, c_acctschema_id AS sch FROM gl_journal WHERE c_acctschema_id<>? ORDER BY gl_journal_id LIMIT 1', [prim])[0];
      check('V6', 'journal', 'a GL Journal (' + (js && js.id) + ') offers its own schema only (' + (js && js.sch) + ')', !!js && J(ids(AP.acctSchemas(q, cl, 'GL_Journal', js.id))) === J([js.sch]), js);
      var okRows = true, got = [];
      [prim].concat(others).forEach(function (sch) {
        var r = AP.factQuery(q, inv.tid, inv.rec.id, s0, sch, acc), w = q('SELECT fact_acct_id AS id, account_id AS a, amtacctdr AS d, amtacctcr AS c FROM fact_acct WHERE ad_client_id=? AND ad_table_id=? AND record_id=? AND c_acctschema_id=? ORDER BY fact_acct_id', [cl, inv.tid, inv.rec.id, sch]);
        var a = r ? r.lines.map(function (l) { return [l.fact_acct_id, l.account_id, cents(l.amtacctdr), cents(l.amtacctcr)]; }) : null, b = w.map(function (x) { return [x.id, x.a, cents(x.d), cents(x.c)]; });
        got.push([sch, a && a.length, b.length]);
        if (!r || J(a) !== J(b) || !b.length || r.schema !== sch || cents(r.totals.dr) !== b.reduce(function (s, l) { return s + l[2]; }, 0) || cents(r.totals.cr) !== b.reduce(function (s, l) { return s + l[3]; }, 0)) okRows = false;
      });
      check('V6', 'query', 'factQuery of C_Invoice ' + inv.rec.id + ' per schema == hand SQL (id, account, debit, credit, by Fact_Acct_ID) with its sums; with no schema asked it answers the list\'s first', okRows && got.length > 1 && AP.factQuery(q, inv.tid, inv.rec.id, s0, null, acc).schema === s0[0].id, got);
      check('V6', 'none', 'a record with no Fact_Acct row gives null (the view says absent, it draws no empty journal)', AP.factQuery(q, inv.tid, -987654, s0, null, acc) === null, null);
      var bs = D.withRows.filter(function (t) { return t.tn === 'C_BankStatement'; })[0] || inv, mineN = q('SELECT count(*) AS n FROM fact_acct WHERE ad_table_id=? AND record_id=? AND ad_client_id=?', [bs.tid, bs.rec.id, cl])[0].n, anyN = q('SELECT count(*) AS n FROM fact_acct WHERE ad_table_id=? AND record_id=?', [bs.tid, bs.rec.id])[0].n;
      var orgOf = q('SELECT DISTINCT ad_org_id AS o FROM fact_acct WHERE ad_table_id=? AND record_id=? AND ad_client_id=?', [bs.tid, bs.rec.id, cl]).map(function (r) { return r.o; });
      check('V6', 'access', bs.tn + ' ' + bs.rec.id + ': the query carries the role\'s read access: ' + mineN + ' rows of the client out of ' + anyN + ' under that table + record id; with an org list that leaves the record\'s orgs (' + orgOf.join(',') + ') out, none', AP.factQuery(q, bs.tid, bs.rec.id, s0, null, acc).of === mineN && mineN > 0 && AP.factQuery(q, bs.tid, bs.rec.id, s0, null, { clientId: cl, orgs: [-5] }) === null && AP.factQuery(q, bs.tid, bs.rec.id, s0, null, { clientId: cl, orgs: orgOf }).of === mineN, { mine: mineN, any: anyN });
    });
    verdict('V6');
  }

  // ═══ V5 NOT-POSTED ═══
  if (want('V5')) {
    say('§ACCTV-NOTJUDGED posting tables with no Fact_Acct row in the seed (' + D.without.length + '): ' + D.without.join(','));
    verdict('V5', 'tables=' + D.without.length + ' (nothing to compare: not judged)');
  }

  var srv = LIVE ? null : await serve(); B.base = LIVE || srv.base;
  if (PUP) B.browser = await PUP.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'], env: (function () { var e = Object.assign({}, process.env); delete e.DBUS_SESSION_BUS_ADDRESS; return e; })() });
  var X = 0, perTable = [];
  if (B.browser) {
    // ═══ V1 SWEEP (+ V2 DEFAULT on the first table whose record is Posted = 'Y' in the seed) ═══
    for (var i = 0; i < N.length && (want('V1') || want('V2')); i++) {
      var t = N[i], o = null, tv = 'INCONCLUSIVE', note = '';
      try {
        o = await openPosted(t);
        if (o.why) note = o.why;
        else {
          if (want('V2') && t.rec.ns > 1 && !CASES.V2) {
            await guard('V2', 'default', 'how the view opens', async function () {
              var v = await view(o.page), prim = String((await o.q('SELECT c_acctschema1_id AS id FROM ad_clientinfo WHERE ad_client_id=(SELECT ad_client_id FROM ' + t.tn.toLowerCase() + ' WHERE ' + t.key + '=?)', [t.rec.id]))[0].id);
              var first = await sqlFacts(o.q, t, Number(prim)), all = await sqlFacts(o.q, t, null);
              check('V2', 'opens-on-primary', t.tn + '#' + t.rec.id + ': the view opens on the client\'s primary schema (' + prim + '): its ' + first.length + ' rows and no row of another schema (' + all.length + ' in all)', (v.options.filter(function (x) { return x.sel; })[0] || {}).v === prim && J(shownOf(v)) === J(strip(first)) && first.length > 0 && all.length > first.length, { options: v.options, shown: shownOf(v) });
              check('V2', 'no-all-entry', 'the selector holds accounting schemas only: every entry is a C_AcctSchema of the page DB by id and name, none is blank or "all"', v.options.length > 1 && (await Promise.all(v.options.map(async function (x) { var r = (await o.q('SELECT name FROM c_acctschema WHERE c_acctschema_id=?', [Number(x.v) || -1]))[0]; return !!r && r.name === x.t; }))).every(Boolean), v.options);
              var n0 = o.page.__log.length, picked = await pickSchema(o.page, v.options[1].v); await sleep(700);
              var v2 = await view(o.page);
              check('V2', 'select-is-no-query', 'picking schema ' + v.options[1].v + ' WITHOUT Refresh: no row changes and no query runs (no §POSTED-FACTS line)', picked && J(v2.lines) === J(v.lines) && logOf(o.page, /^§POSTED-FACTS/, n0).length === 0, { lines: v2.lines, log: logOf(o.page, /^§POSTED-FACTS/, n0) });
              await pickSchema(o.page, v.options[0].v);
            });
            verdict('V2');
          }
          if (want('V1')) {
            var before = (CASES.V1 || { failed: 0 }).failed, r = null;
            await guard('V1', t.tn, 'the Posted view of ' + t.tn + ' over all schemas', async function () { r = await judge('V1', t, o); });
            tv = CASES.V1.failed > before ? 'FAIL' : 'PASS'; if (tv === 'PASS') X++;
            note = r ? 'shown=' + r.shown + ' of=' + r.of + ' schemas=' + r.schemas.join(',') : '';
          }
        }
      } catch (e) { note = 'threw: ' + String(e && e.message).slice(0, 300); if (want('V1')) { check('V1', t.tn + ':open', 'the window of ' + t.tn + ' opens on the record', false, note); CASES.V1.threw++; tv = 'FAIL'; } }
      if (want('V1')) { perTable.push(t.tn + '=' + tv); say('§ACCTV-TABLE table=' + t.tn + ' record=' + t.rec.id + ' window=' + t.win + ' seedPosted=' + t.rec.posted + ' fixture=' + (o ? o.fixture : '?') + ' verdict=' + tv + (note ? ' ' + note : '')); }
      if (o && o.ctx) await o.ctx.close();
    }
    if (want('V1')) verdict('V1', 'X=' + X + ' of N=' + N.length + ' ' + perTable.join(' '));
    if (want('V2') && !CASES.V2) verdict('V2');

    // ═══ V3 ONE-SCHEMA: a GL Journal of the non-primary schema ═══
    if (want('V3')) {
      await guard('V3', 'journal', 'a document that posts in one schema', async function () {
        var gl = D.withRows.filter(function (t) { return t.tn === 'GL_Journal'; })[0];
        var js = gl && rowsOf(seed, 'SELECT j.gl_journal_id AS id, j.posted AS posted, j.c_acctschema_id AS sch FROM gl_journal j WHERE j.c_acctschema_id<>(SELECT c_acctschema1_id FROM ad_clientinfo ci WHERE ci.ad_client_id=j.ad_client_id) AND j.gl_journal_id IN (SELECT record_id FROM fact_acct WHERE ad_table_id=?) ORDER BY j.gl_journal_id LIMIT 1', [gl.tid])[0];
        if (!js) { say('§ACCTV-NOTJUDGED V3: the seed has no GL Journal of a non-primary schema with Fact_Acct rows'); return; }
        var t = Object.assign({}, gl, { rec: js }), o = await openPosted(t);
        if (o.why) { say('§ACCTV-NOTJUDGED V3: ' + o.why); await o.ctx.close(); return; }
        var v = await view(o.page), w = await sqlFacts(o.q, t, js.sch), all = await sqlFacts(o.q, t, null), clientSchemas = (await o.q("SELECT count(*) AS n FROM c_acctschema WHERE ad_client_id=(SELECT ad_client_id FROM gl_journal WHERE gl_journal_id=?) AND isactive='Y'", [js.id]))[0].n;
        say('  page: ' + (o.facts[o.facts.length - 1] || null) + ' fixture=' + o.fixture);
        check('V3', 'one-entry', 'GL_Journal#' + js.id + ': the selector offers its own schema (' + js.sch + ') and nothing else, though the client has ' + clientSchemas + ' schemas', J(v.options.map(function (x) { return x.v; })) === J([String(js.sch)]) && clientSchemas > 1, v.options);
        check('V3', 'its-rows', 'the view opens on that schema\'s rows == SQL (' + w.length + '), which are ALL the record\'s rows (' + all.length + '): no row of a second schema exists or is shown; debit = credit', J(shownOf(v)) === J(strip(w)) && w.length > 0 && all.length === w.length && !!v.total && cents(v.total[0]) === cents(v.total[1]), { shown: shownOf(v), want: strip(w) });
        await o.ctx.close();
      });
      verdict('V3');
    }
    if (B.pageErrors.length) say('§ACCTV-PAGEERRORS n=' + B.pageErrors.length + ' ' + J(B.pageErrors.filter(function (e, i2, a) { return a.indexOf(e) === i2; }).slice(0, 5)));
    await B.browser.close();
  } else ['V1', 'V2', 'V3'].filter(want).forEach(function (c) { verdict(c); });
  if (srv) srv.srv.close();
  if (ACTIVE) say('§ACCTV-MUTANT-SERVED name=' + ACTIVE.name + ' file=' + ACTIVE.file + ' matches=' + APPLIED);

  // ═══ MUTANTS ═══
  var mutFail = false;
  if (process.env.ACCTV_MUTANTS === '1' && !MUTANT && !LIVE) {
    var killed = 0;
    MUT.forEach(function (m) {
      var env = Object.assign({}, process.env, { ACCTV_MUTANT: m.name, ACCTV_MUTANTS: '', ACCTV_ONLY: m.kills, ACCTV_TABLES: 'C_Invoice,M_InOut' }); delete env.DBUS_SESSION_BUS_ADDRESS;
      var out = cp.spawnSync(process.execPath, [__filename], { env: env, encoding: 'utf8', maxBuffer: 64 << 20 }).stdout || '';
      var line = (out.match(new RegExp('§ACCTV-' + m.kills + ' verdict=\\w+[^\\n]*')) || [''])[0], applied = (out.match(/§ACCTV-MUTANT-SERVED[^\n]*matches=(\w+)/) || [])[1];
      var state = applied !== '1' ? 'NOT-APPLIED' : !/verdict=FAIL/.test(line) ? 'SURVIVED' : !/threw=0/.test(line) ? 'CRASHED' : 'KILLED';
      if (state === 'KILLED') killed++;
      var first = (out.match(new RegExp('§ACCTV-CHECK case=' + m.kills + ' key=\\S+ FAIL')) || [''])[0];
      say('§ACCTV-MUTANT name=' + m.name + ' kills=' + m.kills + ' ' + state + ' matches=' + applied + ' child="' + line.slice(0, 200) + '" first="' + first + '"');
    });
    say('§ACCTV-MUTANTS killed=' + killed + '/' + MUT.length);
    mutFail = killed !== MUT.length;
  }
  var names = Object.keys(CASES), vs = names.map(function (c) { return CASES[c].failed ? 'FAIL' : 'PASS'; });
  var partial = want('V1') && B.browser && X !== N.length;
  var overall = ALL.failed || mutFail ? 'FAIL' : (!ALL.judged || !B.browser || partial) ? 'INCONCLUSIVE' : 'PASS';
  say('§ACCTV-VERDICT ' + overall + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' cases=' + J(names) + ' ' + J(vs) + (want('V1') ? ' sweep X=' + X + ' of N=' + N.length : '') + (B.browser ? ' (headless Chromium on the real idempiere.html, real login' + (LIVE ? ', deployed site ' + LIVE : '') + ')' : ' (no browser: nothing of the page was judged)'));
  process.exit(overall === 'PASS' ? 0 : 1);
})().catch(function (e) { say('§ACCTV-VERDICT FAIL crashed: ' + (e && e.stack || e)); process.exit(1); });
