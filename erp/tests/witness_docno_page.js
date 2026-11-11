#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-DOCNO-PAGE (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §DOCNO-SPEC). READ THE LOG after every run (§DOCNOPG lines). The page's own path: Payment window, New (the DocumentNo PREVIEW), Save, twice, on a MIGRATED tenant.
//   Cause it guards: crud_overlay _previewDocNo / _allocDocNo read `DocumentNo_<table>` BY NAME WITHOUT AD_Client_ID, so a tenant with no sequence of its own previewed (and saved) GardenWorld's 10000007 for every payment.
//   Expected (legacy MSequence.get :864-890 client filter + createTableSequence initial CurrentNext 1000000): the tenant's payments draw 1000000, 1000001 ...; GardenWorld's sequence does not move.
'use strict';
var path = require('path'), http = require('http'), fs = require('fs'), url = require('url');
var ROOT = path.join(__dirname, '..', '..'), FIXD = path.join(__dirname, 'fixtures', 'odoo_export_2026-11-10'), TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'jrn-'));
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css', '.svg': 'image/svg+xml' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var judged = 0, fails = 0, J = JSON.stringify, STEPS = {}, N = 12;
function say(s) { console.log(s); }
function check(key, ok, rule, info) { judged++; if (!ok) fails++; say('  §JRN-CHECK key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + String(J(info)).slice(0, 1500))); return ok; }
function finding(id, text) { say('§JRN-FINDING ' + id + ' ' + text); }
function step(n, name, ok) { STEPS[n] = ok === null ? 'UNWITNESSED' : ok ? 'WITNESSED' : 'FAILED'; say(ok === null ? '§JRN-STEP ' + n + '/' + N + ' UNWITNESSED ' + name : '§JRN-STEP ' + n + '/' + N + ' ' + name + ' ' + STEPS[n]); }
var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
var cents = function (v) { return Math.round(Number(v || 0) * 100); }, money = function (c) { return (c / 100).toFixed(2); };
var EXP = JSON.parse(fs.readFileSync(path.join(FIXD, 'odoo_export.json'), 'utf8')), CUT = EXP.manifest.cutover;
var clone = function (o) { return JSON.parse(JSON.stringify(o)); };

(async function () {
  var OCV = await import(url.pathToFileURL(path.join(ROOT, 'erp', 'plugins', 'odoo_migrate_convert.mjs')).href), VARS = OCV.TEMPLATE.variables, CLR = { AR: VARS.AR_CLEARING, AP: VARS.AP_CLEARING, BANK: VARS.BANK_CLEARING };
  var server = http.createServer(function (req, res) {
    var u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname), f = path.join(ROOT, p === '/' ? '/erp/idempiere.html' : p);
    if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + server.address().port, browser = await reqPw().chromium.launch({ args: ['--disable-gpu'] });
  var ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } }), logs = [], errs = [];
  try { await ctx.clock.setFixedTime(new Date(CUT + 'T09:00:00')); } catch (e) { say('§JRN-CLOCK not fixed: ' + e.message); }   // the page's "today" = the cut-over day, so the witness does not age
  if (process.env.DOCNO_PAGE_MUT === 'preview') await ctx.addInitScript(function () { window.__docnoOldPreview = true; });   // MUTANT: the old preview (bundle row, not the tip)   // MUTANT: the old by-name lookup without AD_Client_ID
  async function open() {
    var pg = await ctx.newPage(); pg.on('console', function (m) { logs.push(m.text()); }); pg.on('pageerror', function (e) { errs.push(e.message); });
    await pg.goto(base + '/erp/idempiere.html?lang=en_US', { waitUntil: 'load' });
    await pg.waitForFunction(function () { return !!window.__idmpDb && document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0; }, null, { timeout: 120000 });
    await sleep(2500); return pg;
  }
  async function login(pg, client, user, role) {
    var clickNm = function (sel, nm) { return pg.evaluate(function (a) { var el = Array.prototype.slice.call(document.querySelectorAll(a[0])).filter(function (r) { var n = r.querySelector('.nm'); return n && n.textContent.trim() === a[1]; })[0]; if (el) el.click(); return !!el; }, [sel, nm]); };
    if (!await clickNm('#idmp-login-clients .idmp-login-user', client)) throw new Error('login: no company "' + client + '" on the login screen');
    await pg.waitForSelector('#idmp-login-users .idmp-login-user', { timeout: 15000 });
    if (!await clickNm('#idmp-login-users .idmp-login-user', user)) throw new Error('login: no user "' + user + '"'); await pg.waitForSelector('#idmp-login-step2:visible');
    if (role != null) { try { await pg.selectOption('#idmp-login-role', String(role)); } catch (e) {} }
    await pg.evaluate(function () { document.getElementById('idmp-login-ok').click(); });
    await pg.waitForFunction(function () { return document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0 && document.getElementById('idmp-login').style.display === 'none'; }, null, { timeout: 60000 }); await sleep(1500);
  }
  function dupScan(pg) { return pg.evaluate(function () { var out = []; var ts = window.__idmpDb.exec("SELECT name FROM sqlite_master WHERE type='table'")[0].values.map(function (v) { return v[0]; });
    ts.forEach(function (t) { try { var cols = window.__idmpDb.exec('PRAGMA table_info(' + t + ')')[0].values.map(function (v) { return v[1]; }), pk = t + '_id'; if (cols.indexOf(pk) < 0) return;
      var r = window.__idmpDb.exec('SELECT count(*), count(DISTINCT ' + pk + ') FROM ' + t)[0].values[0]; if (r[0] !== r[1]) out.push(t + ':' + r[0] + '/' + r[1]); } catch (e) {} }); return out; }); }
  async function sw(pg, client, user, role) { await pg.evaluate(function () { document.getElementById('idmp-switch-btn').click(); }); await pg.waitForSelector('#idmp-login-clients .idmp-login-user', { timeout: 20000 }); await sleep(1200); await login(pg, client, user, role); await sleep(2500); }
  // read the tenant's rows back: ModelLayer.run over the tip (bundle + this session's committed op groups), the same read OFL uses
  function Q(pg, sql, p) { return pg.evaluate(function (a) { return new Promise(function (res) { window.__crud.modelRun({ table: 'c_bpartner', timing: 'PROCESS', fn: function (trx) { try { res(trx.q(a[0], a[1] || [])); } catch (e) { res({ err: String(e.message) }); } return { ok: true }; } }, function () {}); }); }, [sql, p || []]); }
  async function N1(pg, sql, p) { var r = await Q(pg, sql, p); return Array.isArray(r) && r[0] ? r[0].n : r; }
  async function snap(pg, C) { var o = {}; for (var t of ['c_bpartner', 'm_product', 'c_elementvalue', 'i_gljournal', 'i_invoice', 'i_bankstatement', 'gl_journalbatch', 'gl_journal', 'c_invoice', 'fact_acct', 'c_charge', 'c_bankstatement']) o[t] = await N1(pg, 'SELECT count(*) AS n FROM ' + t + ' WHERE ad_client_id=?', [C]); return o; }
  function openForm(pg) { return pg.evaluate(function () { var lf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="9542001"]'); if (!lf) return false; var n = lf.parentElement; while (n && n.id !== 'idmp-tree') { if (n.style) n.style.display = ''; n = n.parentElement; } lf.click(); return true; }); }
  var FORM = '[data-gform="org.kernel.odoo.MigrateFromOdoo"]', ANS = { 'Unit: Units': 'Each', 'Unit: Days': 'Day', 'Unit: Hours': 'Hour' };
  async function pick(pg, file) {   // pick the file(s), answer the units, Refresh; returns the summary rows
    await pg.setInputFiles('[data-gform-param="Files"]', file);
    await pg.waitForFunction(function () { return document.querySelectorAll('[data-gform-row]').length > 10; }, null, { timeout: 60000 }).catch(function () {});
    return pg.evaluate(function (A) { var asked = []; document.querySelectorAll('[data-gform-row]').forEach(function (tr) { var it = tr.children[1] && tr.children[1].innerText.trim(), inp = tr.querySelector('[data-gform-cell="erpunit"]'); if (inp) { asked.push(it); if (A[it]) inp.value = A[it]; } }); return asked; }, ANS);
  }
  async function refresh(pg) {
    var mark = logs.length; await pg.click(FORM + ' [data-gform-refresh]');
    await pg.waitForFunction(function () { return !Array.prototype.some.call(document.querySelectorAll('[data-gform-row]'), function (t) { return /Answer the unit/.test(t.innerText); }); }, null, { timeout: 90000 }).catch(function () {});
    for (var i = 0; i < 120 && !logs.slice(mark).some(function (l) { return /§ODOO-FORM summary/.test(l); }); i++) await sleep(500);
    await sleep(800);
    var sum = logs.slice(mark).filter(function (l) { return /§ODOO-FORM summary/.test(l); }).pop() || '';
    var rows = await pg.evaluate(function () { return Array.prototype.map.call(document.querySelectorAll('[data-gform-row]'), function (tr) { var c = Array.prototype.map.call(tr.children, function (td) { return td.innerText.trim(); }); return { item: c[1], odoo: c[2], infile: c[3], will: c[6], already: c[7], refused: c[8], reason: c[9] }; }); });
    return { sum: sum, rows: rows };
  }
  async function runProc(pg) {   // press Process; wait until stage 1 AND stage 2 are settled; returns the form message and the shipped lines
    var mark = logs.length; await pg.click(FORM + ' [data-gform-run]');
    for (var i = 0; i < 480; i++) { var L = logs.slice(mark);
      if (L.some(function (l) { return /§AD-FORM-GENERIC run class=org\.kernel\.odoo\.MigrateFromOdoo ok=false/.test(l); })) break;
      if (L.some(function (l) { return /§AD-FORM-GENERIC (commit-after|after) class=org\.kernel\.odoo\.MigrateFromOdoo ok=false/.test(l); })) break;
      if (L.some(function (l) { return /§AD-FORM-GENERIC commit-after class=org\.kernel\.odoo\.MigrateFromOdoo/.test(l); })) break;
      await sleep(500); }
    await sleep(1500);
    var msg = await pg.evaluate(function () { var m = document.querySelector('[data-gform-msg]'); return m ? { t: m.innerText, c: m.className } : { t: '', c: '' }; });
    var L = logs.slice(mark);
    return { msg: msg.t, cls: msg.c, run: L.filter(function (l) { return /§AD-FORM-GENERIC run class=org\.kernel\.odoo/.test(l); }).pop() || '', commit: L.filter(function (l) { return /§AD-FORM-GENERIC commit class=org\.kernel\.odoo/.test(l); }).pop() || '',
      after: L.filter(function (l) { return /§AD-FORM-GENERIC after class=org\.kernel\.odoo/.test(l); }).pop() || '', ver: L.filter(function (l) { return /^§MIG-VERIFY/.test(l); }).pop() || '', dbg: L.filter(function (l) { return /IMPORT_GLJ|§PROC-(SQL|UNPORTED)|MODEL-(ERR|WARN)|Invalid CurrencyType|ConversionType|PeriodClosed|Period Closed/.test(l); }).slice(0, 60), mig: L.filter(function (l) { return /^§MIG-(TB|CLEAR|OPEN|BANK|OPENBAL)/.test(l); }) };
  }
  function show(tag, r) { say('§JRN-' + tag + ' msg=' + J(String(r.msg).slice(0, 420)) + ' | ' + String(r.run).slice(0, 200) + ' | ' + String(r.after).slice(0, 260)); (r.mig || []).forEach(function (l) { say('   shipped> ' + l.slice(0, 260)); }); if (r.ver) say('   shipped> ' + r.ver); (r.dbg || []).forEach(function (l) { say('   trxlog> ' + l.slice(0, 300)); }); }
  function wf(name, data) { var f = path.join(TMP, name); fs.writeFileSync(f, JSON.stringify(data)); return f; }
  async function books(pg, C) {   // the tenant's books, read back, by account value (ALL Fact_Acct of the tenant)
    var fa = await Q(pg, 'SELECT ev.value AS v, SUM(f.amtacctdr) AS dr, SUM(f.amtacctcr) AS cr FROM fact_acct f JOIN c_elementvalue ev ON ev.c_elementvalue_id=f.account_id WHERE f.ad_client_id=? GROUP BY ev.value', [C]), o = {}, sum = 0;
    (Array.isArray(fa) ? fa : []).forEach(function (r) { o[r.v] = cents(r.dr) - cents(r.cr); sum += o[r.v]; }); return { by: o, sum: sum };
  }
  async function docs(pg, C) { return Q(pg, 'SELECT i.documentno AS no, i.docstatus AS s, i.posted AS p, i.ispaid AS paid, i.grandtotal AS t, dt.docbasetype AS b FROM c_invoice i JOIN c_doctype dt ON dt.c_doctype_id=i.c_doctype_id WHERE i.ad_client_id=?', [C]); }

  var W = '#idmp-content', ALL = { judged: 0, failed: 0 };
    async function setCol(col, want, mode) {   // like a user: Playwright selectOption / fill / check on the real control
      var sel = W + ' [data-col="' + col + '"]:not(span)', info = await pg.evaluate(function (a) { var e = document.querySelector(a); return e ? { tag: e.tagName, type: e.type, opts: e.tagName === 'SELECT' ? Array.prototype.map.call(e.options, function (x) { return [x.value, x.text]; }) : null } : null; }, sel);
      if (!info) return 'NOFIELD';
      if (info.tag === 'SELECT') { var o = info.opts.filter(function (x) { return mode === 'first' ? x[0] !== '' : (x[1].indexOf(want) >= 0 || x[0] === want); })[0]; if (!o) return 'NOOPT ' + J(info.opts.slice(0, 8)); await pg.selectOption(sel, o[0]); await sleep(700); return 'SEL ' + o[1] + ' now=' + await pg.$eval(sel, function (e) { return e.value; }); }
      if (info.type === 'checkbox') { await pg.setChecked(sel, !!want); return 'CHK'; } await pg.fill(sel, String(want)); await pg.press(sel, 'Tab'); await sleep(500); return 'VAL ' + await pg.$eval(sel, function (e) { return e.value; });
    }
    async function tb(prefix) { var ok = await pg.evaluate(function (p) { var b = Array.prototype.slice.call(document.querySelectorAll('button, [role=button]')).filter(function (x) { return (x.getAttribute('title') || '').indexOf(p) === 0 && !x.disabled; })[0]; if (!b) return false; b.click(); return true; }, prefix); await sleep(2500); return ok; }
    async function status() { return pg.evaluate(function () { var t = []; document.querySelectorAll('.idmp-toast, [class*=toast], [class*=status], #idmp-status').forEach(function (e) { var x = (e.innerText || '').trim(); if (x) t.push(x.slice(0, 200)); }); return t.slice(-4); }); }
  function check(key, rule, ok, info) { ALL.judged++; if (!ok) ALL.failed++; say('  §DOCNOPG-CHECK key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + String(J(info)).slice(0, 1200))); }
  try {
    var pg = await open(); await login(pg, 'System', 'System', 0);
    var TM = await pg.evaluate(async function (a) { var b = window.Genesis.birthTenant({ clientName: a[0], currencyId: 100, currencyIso: 'USD', currencyPrecision: 2, adminUser: a[1], dateAcct: a[2], countryId: 100 }); var r = await window.idmpInstallGenesis(b); return { ok: r && r.ok, clientId: r && r.clientId }; }, ['Mig Co', 'migAdmin', CUT]);
    var TB = await pg.evaluate(async function (a) { var b = window.Genesis.birthTenant({ clientName: a[0], currencyId: 100, currencyIso: 'USD', currencyPrecision: 2, adminUser: a[1], dateAcct: a[2], countryId: 100 }); var r = await window.idmpInstallGenesis(b); return { ok: r && r.ok, clientId: r && r.clientId }; }, ['Born Co', 'bornAdmin', CUT]);
    var rr = await Q(pg, "SELECT ad_role_id AS r FROM ad_role WHERE ad_client_id=? AND name LIKE '%Admin'", [TM.clientId]), role = rr[0].r, rb = await Q(pg, "SELECT ad_role_id AS r FROM ad_role WHERE ad_client_id=? AND name LIKE '%Admin'", [TB.clientId]), roleB = rb[0].r;
    await pg.evaluate(function () { window.PluginRelease.open(); }); await pg.waitForSelector('#pr-osgi table.oc-t', { timeout: 15000 }); await sleep(800);
    for (var id of ['org.idempiere.ninja.migrate', 'org.kernel.odoo.migrate']) { if (await pg.$('[data-oc-start="' + id + '"]')) { await pg.click('[data-oc-start="' + id + '"]'); await sleep(2500); } }
    await pg.evaluate(function () { var x = document.querySelector('[data-pr-close]'); if (x) x.click(); }); await sleep(500);
    var gw0 = await Q(pg, "SELECT currentnext AS n FROM ad_sequence WHERE ad_client_id=11 AND name='DocumentNo_C_Payment'");
    await sw(pg, 'Mig Co', 'migAdmin', role); await openForm(pg, 9542001); await pg.waitForSelector(FORM + ' [data-gform-param="Files"]', { timeout: 20000 });
    await pick(pg, path.join(FIXD, 'odoo_export.json')); await refresh(pg); var R = await runProc(pg);
    check('migrated', 'control: the Odoo fixture is migrated on the page', /Open balances completed/.test(R.msg) && /PASS/.test(R.ver), { msg: R.msg.slice(0, 160), ver: R.ver });
    check('premise', 'control: the tenant has NO DocumentNo_C_Payment of its own and GardenWorld has one at 10000007 (the setup that produced the duplicate)', (await Q(pg, "SELECT count(*) AS n FROM ad_sequence WHERE ad_client_id=? AND name='DocumentNo_C_Payment'", [TM.clientId]))[0].n === 0 && Array.isArray(gw0) && gw0[0] && Number(gw0[0].n) === 10000007, { gw0: gw0 });
    var nos = [], prev = [];
    for (var k = 0; k < 3; k++) {
      var opn = await pg.evaluate(function () { var lf = Array.prototype.slice.call(document.querySelectorAll('#idmp-tree .idmp-row.leaf')).filter(function (r) { var nm = r.querySelector('.nm'); return nm && nm.textContent.trim() === 'Payment and Receipt'; })[0]; if (!lf) return false; var n = lf.parentElement; while (n && n.id !== 'idmp-tree') { if (n.style) n.style.display = ''; n = n.parentElement; } lf.click(); return true; });
      await sleep(5000); say('§DOCNOPG-OPEN payment window=' + opn); await tb('New'); await sleep(2500);
      say('§DOCNOPG-SET ' + J([await setCol('c_doctype_id', 'AR Receipt'), await setCol('c_bpartner_id', 'Gemini Furniture'), await setCol('c_bankaccount_id', '', 'first'), await setCol('payamt', String(10 + k))]));
      prev.push(await pg.evaluate(function () { var e = document.querySelector('#idmp-content [data-col="documentno"]:not(span)'); return e ? e.value : null; }));
      say('§DOCNOPG-SAVE ' + await tb('Save'));
      var rows = await Q(pg, "SELECT documentno AS no, payamt AS a FROM c_payment WHERE ad_client_id=? ORDER BY ABS(c_payment_id)", [TM.clientId]); nos = Array.isArray(rows) ? rows.map(function (r) { return r.no; }) : rows;
    }
    say('§DOCNOPG-NOS previews=' + J(prev) + ' stored=' + J(nos));
    var gw1 = await Q(pg, "SELECT currentnext AS n FROM ad_sequence WHERE ad_client_id=11 AND name='DocumentNo_C_Payment'");
    check('saved-three', 'three payments are SAVED in the Payment window on the migrated tenant', Array.isArray(nos) && nos.length === 3, nos);
    check('distinct', 'the payments carry DISTINCT DocumentNos', Array.isArray(nos) && nos.length === 3 && new Set(nos).size === 3 && nos[0] != null, nos);
    check('legacy', 'they are the legacy first numbers of a client\'s new DocumentNo_C_Payment: 1000000, 1000001, 1000002 (MSequence.createTableSequence initial CurrentNext 1000000, +IncrementNo)', J(nos) === J(['1000000', '1000001', '1000002']), nos);
    check('preview-eq-saved', 'the Document No field SHOWS the number the save assigns, for the 1st, 2nd and 3rd payment of the session (preview == saved)', J(prev) === J(nos), { prev: prev, nos: nos });
    check('not-gardenworld', 'none is GardenWorld\'s 10000007 (previews either)', nos.indexOf('10000007') < 0 && prev.indexOf('10000007') < 0, { nos: nos, prev: prev });
    check('gw-untouched', 'GardenWorld\'s DocumentNo_C_Payment did not move (10000007)', Array.isArray(gw1) && gw1[0] && Number(gw1[0].n) === 10000007, gw1);
    var tseq = await Q(pg, "SELECT currentnext AS n FROM ad_sequence WHERE ad_client_id=? AND name='DocumentNo_C_Payment'", [TM.clientId]);
    check('tenant-seq', 'the tenant\'s own DocumentNo_C_Payment stands at 1000003', Array.isArray(tseq) && tseq.length === 1 && Number(tseq[0].n) === 1000003, tseq);
    // after a RELOAD: the preview of the next payment is the sequence's next number (1000003), then it saves as 1000003
    await pg.close(); pg = await open(); await login(pg, 'Mig Co', 'migAdmin', role); await sleep(2000);
    var opn2 = await pg.evaluate(function () { var lf = Array.prototype.slice.call(document.querySelectorAll('#idmp-tree .idmp-row.leaf')).filter(function (r) { var nm = r.querySelector('.nm'); return nm && nm.textContent.trim() === 'Payment and Receipt'; })[0]; if (!lf) return false; var n = lf.parentElement; while (n && n.id !== 'idmp-tree') { if (n.style) n.style.display = ''; n = n.parentElement; } lf.click(); return true; });
    await sleep(5000); await tb('New'); await sleep(2500);
    say('§DOCNOPG-SET ' + J([await setCol('c_doctype_id', 'AR Receipt'), await setCol('c_bpartner_id', 'Gemini Furniture'), await setCol('c_bankaccount_id', '', 'first'), await setCol('payamt', '14')]));
    var prevR = await pg.evaluate(function () { var e = document.querySelector('#idmp-content [data-col="documentno"]:not(span)'); return e ? e.value : null; }); say('§DOCNOPG-SAVE ' + await tb('Save'));
    var rowsR = await Q(pg, "SELECT documentno AS no FROM c_payment WHERE ad_client_id=? ORDER BY ABS(c_payment_id)", [TM.clientId]);
    check('reload', 'after a page reload the next payment previews 1000003 and saves as 1000003 (opened=' + opn2 + ')', prevR === '1000003' && Array.isArray(rowsR) && rowsR.length === 4 && rowsR[3].no === '1000003', { prevR: prevR, rows: rowsR });
    // sales orders: the number comes from the order DocType's sequence; preview (after the DocType is chosen) == saved, twice
    var op = await pg.evaluate(function () { var lf = Array.prototype.slice.call(document.querySelectorAll('#idmp-tree .idmp-row.leaf')).filter(function (r) { var nm = r.querySelector('.nm'); return nm && nm.textContent.trim() === 'Sales Order'; })[0]; if (!lf) return false; var n = lf.parentElement; while (n && n.id !== 'idmp-tree') { if (n.style) n.style.display = ''; n = n.parentElement; } lf.click(); return true; });
    var soSeq = await Q(pg, "SELECT s.currentnext AS n FROM c_doctype d JOIN ad_sequence s ON s.ad_sequence_id=d.docnosequence_id WHERE d.ad_client_id=? AND d.docbasetype='SOO' AND d.docsubtypeso='SO'", [TM.clientId]);
    var oprev = [], onos = [];
    for (var j = 0; j < 3; j++) {
      await sleep(j ? 1500 : 5000); await tb('New'); await sleep(2500);
      say('§DOCNOPG-SET ' + J([await setCol('c_doctypetarget_id', 'Standard Order'), await setCol('c_bpartner_id', 'Gemini Furniture')])); await sleep(1500);
      say('§DOCNOPG-SET ' + J([await setCol('c_bpartner_location_id', '', 'first'), await setCol('m_warehouse_id', '', 'first'), await setCol('m_pricelist_id', '', 'first')]));
      oprev.push(await pg.evaluate(function () { var e = document.querySelector('#idmp-content [data-col="documentno"]:not(span)'); return e ? e.value : null; }));
      say('§DOCNOPG-SAVE order ' + await tb('Save'));
      var orr = await Q(pg, "SELECT documentno AS no FROM c_order WHERE ad_client_id=? ORDER BY ABS(c_order_id)", [TM.clientId]); onos = Array.isArray(orr) ? orr.map(function (r) { return r.no; }) : orr;
    }
    var start = Array.isArray(soSeq) && soSeq[0] ? Number(soSeq[0].n) : NaN;
    say('§DOCNOPG-ORDERS start=' + start + ' previews=' + J(oprev) + ' stored=' + J(onos));
    check('orders', 'three sales orders: stored DocumentNo = the order DocType sequence from its start (' + start + '..' + (start + 2) + ') and the field showed exactly that (as legacy\'s <n> preview) before Save', J(onos) === J([String(start), String(start + 1), String(start + 2)]) && J(oprev.map(function (x) { return String(x).replace(/^<|>$/g, ''); })) === J(onos), { start: start, oprev: oprev, onos: onos });
    // BORN tenant: the order window previews its DocType sequence's next number
    await sw(pg, 'Born Co', 'bornAdmin', roleB); await sleep(1500);
    await pg.evaluate(function () { var lf = Array.prototype.slice.call(document.querySelectorAll('#idmp-tree .idmp-row.leaf')).filter(function (r) { var nm = r.querySelector('.nm'); return nm && nm.textContent.trim() === 'Sales Order'; })[0]; if (lf) { var n = lf.parentElement; while (n && n.id !== 'idmp-tree') { if (n.style) n.style.display = ''; n = n.parentElement; } lf.click(); } });
    await sleep(5000); await tb('New'); await sleep(2500); await setCol('c_doctypetarget_id', 'Standard Order'); await sleep(1500);
    var bprev = await pg.evaluate(function () { var e = document.querySelector('#idmp-content [data-col="documentno"]:not(span)'); return e ? e.value : null; }), bseq = await Q(pg, "SELECT s.currentnext AS n FROM c_doctype d JOIN ad_sequence s ON s.ad_sequence_id=d.docnosequence_id WHERE d.ad_client_id=? AND d.docbasetype='SOO' AND d.docsubtypeso='SO'", [TB.clientId]);
    check('born-order-preview', 'born tenant: the Sales Order window previews its DocType sequence\'s next number (' + (bseq[0] && bseq[0].n) + ')', String(bprev).replace(/^<|>$/g, '') === String(bseq[0] && bseq[0].n), { bprev: bprev, bseq: bseq });
    var V = !ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS';
    say('§DOCNOPG-VERDICT ' + V + ' judged=' + ALL.judged + ' failed=' + ALL.failed); process.exitCode = V === 'PASS' ? 0 : 1;
  } catch (e) { say('§DOCNOPG-CRASH ' + (e && e.stack || e)); say('§DOCNOPG-VERDICT FAIL judged=' + ALL.judged + ' failed=' + (ALL.failed + 1) + ' crashed'); process.exitCode = 1; }
  await browser.close(); server.close();
})();
