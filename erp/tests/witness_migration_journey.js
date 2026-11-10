#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-MIGRATION-JOURNEY (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md RESUME §2 R1 + R2). READ THE LOG after every run: every verdict is a §JRN line and the page's own
//   §MIG-* / §AD-FORM-GENERIC lines are printed; the exit code is not the evidence. INCONCLUSIVE when nothing was judged. No screenshots: every claim is a number read from the tenant's rows.
// THE ISSUE it proves/disproves: can a stranger move a company the way docs/MigrationGuide.md says ("the same three steps"), on the REAL page (headless Chromium, the shipped idempiere.html,
//   no GPU), ONE file (odoo_export.json) WITH open balances — and what happens on a refused / repeated / second run (R2)? Expected values come from the RAW rows of odoo_export.json
//   and from cited legacy rules, never from the loader under test.
// GUIDE STEPS (N): the guide's "same three steps" broken into the numbered actions below. Each prints §JRN-STEP n/N ... WITNESSED, or UNWITNESSED <step> (honest).
// R2 (state the OBSERVED rule per case; where behaviour is wrong or unclear it is reported as a finding §JRN-FINDING, never papered over):
//   (a) stage 2 refuses (a source line missing -> clearing account does not zero) -> is the tenant stuck half-migrated; can the tenant's role finish with Import GL Journal / Import Invoice
//   (b) a second Process on the same file     (c) a second file for the same tenant     (d) the already-there pass on a re-run
// Command: node erp/tests/witness_migration_journey.js 2>&1 | tee /tmp/count_logs/mig_migration_journey.log
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

// ── the ORACLE, from the raw rows only ──
var acct = {}; EXP.sets['account.account'].forEach(function (a) { acct[a.id] = a; });
var KCLS = { asset_receivable: 'AR', liability_payable: 'AP', asset_cash: 'BANK' }, SRC = { plain: {}, cls: { AR: 0, AP: 0, BANK: 0 }, tbSum: 0 };
EXP.sets.tb.forEach(function (r) { var c = cents(r.balance), kc = KCLS[acct[r.account_id].account_type]; SRC.tbSum += c; if (!c) return; if (kc) SRC.cls[kc] += c; else SRC.plain[acct[r.account_id].code] = c; });
var INVT = { out_invoice: 'ARI', out_refund: 'ARC', in_invoice: 'API', in_refund: 'APC' }, SIGN = { ARI: 1, ARC: -1, API: 1, APC: -1 }, SRCDOC = {}, SRCSIDE = { AR: 0, AP: 0 };
EXP.sets.open_lines.forEach(function (l) { var b = INVT[l.move_type]; if (!b) return; SRCDOC[l.move_name] = 1; SRCSIDE[b[1] === 'R' ? 'AR' : 'AP'] += cents(l.amount_residual); });
var NDOC = Object.keys(SRCDOC).length;
// products / partners the file brings = rows of the raw sets (the guide: "your records are there")
var RAW = { products: EXP.sets['product.product'].length, accounts: EXP.sets['account.account'].length };

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

  try {
    // ═══ STEPS 2-4: System starts the two plugins, Initial Tenant Setup (the wizard, by its fields), the roles get the screens ═══
    var pg = await open();
    await login(pg, 'System', 'System', 0);
    var dup0 = await dupScan(pg); say('§JRN-DUP baseline (fresh page, before any company) tables with a repeated primary id: ' + J(dup0));
    // the wizard: menu leaf "Initial Tenant Setup" (AD_Process 53161), the fields, Create tenant
    await pg.evaluate(function () { document.querySelectorAll('#idmp-tree .idmp-row:not(.leaf)').forEach(function (r) { if (!r.parentElement.classList.contains('open')) r.click(); }); });
    var leaf = await pg.evaluate(function () { var lf = Array.prototype.slice.call(document.querySelectorAll('#idmp-tree .idmp-row.leaf')).filter(function (r) { var nm = r.querySelector('.nm'); return nm && nm.textContent.trim() === 'Initial Tenant Setup'; })[0]; if (!lf) return false; var n = lf.parentElement; while (n && n.id !== 'idmp-tree') { if (n.style) n.style.display = ''; n = n.parentElement; } lf.click(); return true; });
    await pg.waitForSelector('[data-genesis-create]', { timeout: 20000 }).catch(function () {});
    await pg.waitForSelector('[data-genesis-name]', { timeout: 15000 }).catch(function () {});
    await pg.fill('[data-genesis-name]', 'Journey Co'); await pg.fill('[data-genesis-admin]', 'jrnAdmin'); await pg.evaluate(function () { document.querySelector('[data-genesis-create]').click(); });   // the Plugins & Releases pane still floats over the wizard in headless: click the button itself
    await pg.waitForSelector('[data-genesis-enter]', { timeout: 120000 }).catch(function () {});
    var made = await pg.$('[data-genesis-enter]');
    var cid = await Q(pg, "SELECT ad_client_id AS n FROM ad_client WHERE name='Journey Co'");
    var C1 = Array.isArray(cid) && cid[0] ? cid[0].n : null;
    check('wizard', !!leaf && !!made && C1 != null && logs.some(function (l) { return /§W-GENESIS-SYSADMIN-LIVE created client=\d+ rows=\d+ persisted=true/.test(l); }), 'the menu leaf Initial Tenant Setup opens the wizard; filling the company + administrator and pressing Create tenant births + persists a company', { leaf: leaf, made: !!made, C1: C1 });
    step(3, 'S2.2 Initial Tenant Setup -> company created', !!leaf && !!made && C1 != null);
    // more tenants for the R1/R2 cases (the same shipped verbs the wizard calls: Genesis.birthTenant + idmpInstallGenesis), born while System is logged in
    async function birthTenant(name, admin, dateAcct) { return pg.evaluate(async function (a) { var b = window.Genesis.birthTenant({ clientName: a[0], currencyId: 100, currencyIso: 'USD', currencyPrecision: 2, adminUser: a[1], dateAcct: a[2], countryId: 100 }); var r = await window.idmpInstallGenesis(b); return { ok: r && r.ok, clientId: r && r.clientId }; }, [name, admin, dateAcct]); }
    var T2 = await birthTenant('Falsify Co', 'fAdmin', CUT), T3 = await birthTenant('Stale Co', 'sAdmin', '2025-06-15');
    var T4 = await birthTenant('Reload Co', 'rAdmin', CUT);
    say('§JRN-TENANTS journey=' + C1 + ' falsify=' + J(T2) + ' stale=' + J(T3) + ' reload=' + J(T4));
    var roleOf = {}; for (var cc of [C1, T2.clientId, T3.clientId, T4.clientId]) { var rr = await Q(pg, "SELECT ad_role_id AS r FROM ad_role WHERE ad_client_id=? AND name LIKE '%Admin'", [cc]); roleOf[cc] = Array.isArray(rr) && rr[0] ? rr[0].r : null; }
    // ORDER (control run, no reload): the companies are born FIRST, then System starts the plugins, so every company's roles get the screens at Start (guide Step 2.3) and the page needs no reload.
    //   The guide's own order (plugins first, company second) needs the reload the guide asks for; Phase 2 below runs exactly that path and judges it.
    await pg.evaluate(function () { window.PluginRelease.open(); }); await pg.waitForSelector('#pr-osgi table.oc-t', { timeout: 15000 }); await sleep(800);
    for (var id of ['org.idempiere.ninja.migrate', 'org.kernel.odoo.migrate']) { var has = await pg.$('[data-oc-start="' + id + '"]'); if (has) { await pg.click('[data-oc-start="' + id + '"]'); await sleep(2500); } }
    var st = await pg.evaluate(function () { var R = window.PluginEngine && window.PluginEngine._reg && window.PluginEngine._reg(), o = {}; ['org.idempiere.ninja.migrate', 'org.kernel.odoo.migrate'].forEach(function (id) { var b = R && R.list().filter(function (x) { return x.id === id; })[0]; o[id] = b ? b.state : 'NOT-INSTALLED'; }); return o; });
    var s2 = st['org.idempiere.ninja.migrate'] === 'ACTIVE' && st['org.kernel.odoo.migrate'] === 'ACTIVE';
    await pg.evaluate(function () { var x = document.querySelector('[data-pr-close]'); if (x) x.click(); }); await sleep(500);   // close the Plugins & Releases pane (its × button)
    check('plugins', s2, 'Plugins & Releases -> Start on both migration bundles makes both ACTIVE', st); step(2, 'S2.1 System starts the two plugins', s2);
    // ═══ T1 — the journey (Phase 1: same page, switch user with the log-out button, no reload) ═══
    await sw(pg, 'Journey Co', 'jrnAdmin', roleOf[C1]);
    var acc = await Q(pg, "SELECT (SELECT count(*) FROM ad_form_access fa JOIN ad_form f ON f.ad_form_id=fa.ad_form_id WHERE fa.ad_role_id=? AND f.classname='org.kernel.odoo.MigrateFromOdoo') AS formacc, (SELECT count(*) FROM ad_process_access WHERE ad_role_id=? AND ad_process_id IN (220,207)) AS procacc", [roleOf[C1], roleOf[C1]]);
    say('§JRN-ROLE-ACCESS client=' + C1 + ' role=' + roleOf[C1] + ' ' + J(acc));
    var opened = await openForm(pg), shown = await pg.waitForSelector(FORM + ' [data-gform-param="Files"]', { timeout: 20000 }).then(function () { return true; }, function () { return false; });
    check('menu', opened && shown && Array.isArray(acc) && acc[0].formacc >= 1, 'the new company\'s administrator sees the menu leaf "Migrate from Odoo" (9542001) after a reload (plugins restored), it opens the form, and the role holds ad_form_access to the form', { opened: opened, shown: shown, acc: acc });
    step(4, 'S2.3 the new company\'s roles hold the migration screens', Array.isArray(acc) && acc[0].formacc >= 1); step(5, 'S3.1 log in as the administrator -> menu leaf -> form', opened && shown);
    var baseSnap = await snap(pg, C1);
    var asked = await pick(pg, path.join(FIXD, 'odoo_export.json'));
    var filesLog = logs.some(function (l) { return /§AD-FORM-GENERIC file class=org\.kernel\.odoo\.MigrateFromOdoo param=Files files=\["odoo_export\.json/.test(l); });
    check('onefile', filesLog, 'ONE file (odoo_export.json) is picked and read on the page', logs.filter(function (l) { return /§AD-FORM-GENERIC file/.test(l); }));
    step(6, 'S3.2 pick odoo_export.json (the form asks for no cut-over date: it is in the file, ' + CUT + ')', filesLog);
    check('units', asked.length === 3 && asked.every(function (a) { return ANS[a]; }), 'the units the products use are asked (3), answered from the pick list', asked); step(7, 'S3.3 units answered from the pick list', asked.length === 3);
    var S1 = await refresh(pg), srow = function (S, n) { return S.rows.filter(function (r) { return r.item === n; })[0]; };
    var gj = srow(S1, 'I_GLJournal'), iv = srow(S1, 'I_Invoice');
    say('§JRN-SUMMARY ' + S1.sum.slice(0, 300) + ' | GLJ=' + J(gj) + ' INV=' + J(iv));
    check('summary', /summary ok=true/.test(S1.sum) && gj && Number(gj.infile) === EXP.sets.tb.length && Number(gj.will) === Number(gj.infile) && iv && Number(iv.infile) === NDOC && Number(iv.will) === NDOC,
      'the summary (dry run, nothing written) predicts the opening journal (' + EXP.sets.tb.length + ' trial-balance lines in the raw file) and ' + NDOC + ' open documents (distinct invoice-type move names of open_lines)', { gj: gj, iv: iv });
    var wrote0 = await snap(pg, C1);
    check('summary-readonly', JSON.stringify(wrote0) === JSON.stringify(baseSnap), 'Refresh wrote nothing (the tenant\'s row counts are the same before and after)', { before: baseSnap, after: wrote0 });
    step(8, 'S3.4 Refresh -> summary before anything is written', /summary ok=true/.test(S1.sum) && JSON.stringify(wrote0) === JSON.stringify(baseSnap));
    var P1 = await runProc(pg); show('PROCESS-1', P1);
    check('process', /Migrated from Odoo/.test(P1.msg) && /Open balances completed/.test(P1.msg) && /committed=true/.test(P1.commit) && /verifyChain=ok/.test(P1.commit) && /verdict=PASS judged=[1-9]/.test(P1.ver),
      'Process commits one signed group, stage 2 completes the open balances, the loader\'s own §MIG-VERIFY says PASS with > 0 checks (shipped log is primary evidence)', P1);
    step(9, 'S3.5 Process: one signed change set + stage 2 + the loader\'s own check', /verdict=PASS judged=[1-9]/.test(P1.ver) && /Open balances completed/.test(P1.msg));
    // read the tenant's rows back and compare with the RAW rows
    var a1 = await snap(pg, C1), B1 = await books(pg, C1), plainOk = Object.keys(SRC.plain).every(function (c) { return B1.by[c] === SRC.plain[c]; });
    var clrZero = ['AR', 'AP', 'BANK'].every(function (k) { return (B1.by[CLR[k]] || 0) === 0; }), dc = await docs(pg, C1), dcOk = Array.isArray(dc) && dc.length === NDOC && dc.every(function (d) { return d.s === 'CO' && d.p === 'Y' && d.paid !== 'Y'; });
    var openSide = { AR: 0, AP: 0 }; (Array.isArray(dc) ? dc : []).forEach(function (d) { openSide[d.b[1] === 'R' ? 'AR' : 'AP'] += cents(d.t) * (SIGN[d.b] || 0); });
    // the raw files' sign: Odoo residual of receivable is +, payable is - (credit); the ERP documents are positive grandtotal per base type, so compare the absolute net per side
    var rawNet = { AR: Math.abs(SRCSIDE.AR), AP: Math.abs(SRCSIDE.AP) };
    say('§JRN-READBACK counts=' + J(a1) + ' tb_sum=' + money(B1.sum) + ' plain_accounts=' + Object.keys(SRC.plain).length + ' plain_match=' + plainOk + ' clearing_zero=' + clrZero + ' documents=' + (Array.isArray(dc) ? dc.length : dc) + ' open=' + J(openSide) + ' raw_open=' + J(rawNet));
    check('rows-products', a1.m_product - baseSnap.m_product >= 0 && a1.m_product >= RAW.products - 0, 'the tenant holds at least the ' + RAW.products + ' products of the raw file (product.product rows; "already there" keys are the tenant\'s own)', { before: baseSnap.m_product, after: a1.m_product });
    check('rows-accounts', a1.c_elementvalue - baseSnap.c_elementvalue === RAW.accounts + 3, 'accounts grew by the ' + RAW.accounts + ' account.account rows + the 3 clearing accounts the open balances create (§MIG-PREREQ)', { before: baseSnap.c_elementvalue, after: a1.c_elementvalue });
    check('books-tb', plainOk && Object.keys(SRC.plain).length > 0 && B1.sum === 0, 'Fact_Acct of the tenant: every non-receivable/payable/bank account equals the raw trial-balance balance (' + Object.keys(SRC.plain).length + ' accounts) and the books sum to 0.00', { plain: SRC.plain, got: B1.by, sum: B1.sum });
    check('books-clearing', clrZero, 'AR, AP and Bank Clearing end at 0.00 (the cut-over method\'s own proof)', { clr: CLR, got: B1.by });
    check('open-docs', dcOk, NDOC + ' open documents, every one Completed, Posted, not paid', Array.isArray(dc) ? dc.filter(function (d) { return d.s !== 'CO' || d.p !== 'Y' || d.paid === 'Y'; }).slice(0, 3) : dc);
    check('open-amount', openSide.AR === rawNet.AR && openSide.AP === rawNet.AP, 'the open amount per side (AR ' + money(rawNet.AR) + ', AP ' + money(rawNet.AP) + ' net of credit notes, from open_lines.amount_residual) is what the tenant\'s documents hold', { openSide: openSide, rawNet: rawNet });
    var strayInv = await Q(pg, 'SELECT i.documentno AS no, i.grandtotal AS t, i.docstatus AS s, i.posted AS p, i.ispaid AS paid FROM c_invoice i WHERE i.ad_client_id=? AND i.c_doctype_id IS NULL', [C1]);
    say('§JRN-STRAY invoices of the new company that are not from the file: ' + J(strayInv));
    if (Array.isArray(strayInv) && strayInv.length) finding('F-WIZARD-SAMPLE-INVOICE', 'Initial Tenant Setup puts a "G7 sample invoice" (' + J(strayInv) + ') into every new company (idempiere.html renderGenesisWizard); legacy Initial Client Setup creates none. It is not in the file, is unpaid and Completed, and sits in the migrated company\'s receivables/Invoice window next to the real open items.');
    // S3.6 the guide: "open Business Partner and Product from the menu (the Find window opens first: press OK)"
    var winOK = await pg.evaluate(function () { var out = {}; ['Business Partner', 'Product'].forEach(function (nm) { var lf = Array.prototype.slice.call(document.querySelectorAll('#idmp-tree .idmp-row.leaf .nm')).filter(function (r) { return r.textContent.trim() === nm; })[0]; out[nm] = !!lf; }); return out; });
    say('§JRN-WINDOWS menu leaves for the guide step 6 present=' + J(winOK));
    step(10, 'S3.6 open Business Partner / Product windows from the menu (Find opens first, OK): the rows are in the tables (counts asserted above); the WINDOW itself is not driven here', null);

    // ═══ R2 (b) a second Process on the same file; (d) the already-there pass on that re-run ═══
    await openForm(pg); await pg.waitForSelector(FORM + ' [data-gform-param="Files"]', { timeout: 20000 });
    await pick(pg, path.join(FIXD, 'odoo_export.json'));
    var S2 = await refresh(pg), alreadyN = S2.rows.reduce(function (n, r) { return n + (Number(r.already) || 0); }, 0), willN = S2.rows.reduce(function (n, r) { return n + (Number(r.will) || 0); }, 0), refN = S2.rows.reduce(function (n, r) { return n + (Number(r.refused) || 0); }, 0);
    var alreadyLog = (logs.filter(function (l) { return /§ODOO-FORM already-there rows=/.test(l); }).pop() || '').slice(0, 260);
    say('§JRN-R2d re-run summary: ' + S2.sum.slice(0, 160) + ' already_total=' + alreadyN + ' will_total=' + willN + ' refused_total=' + refN + ' | ' + alreadyLog);
    var firstReasons = S2.rows.filter(function (r) { return Number(r.refused) > 0; }).map(function (r) { return r.item + ': ' + String(r.reason).slice(0, 110); }).slice(0, 6);
    say('§JRN-R2d refused rows (first 6): ' + J(firstReasons));
    var b4 = await snap(pg, C1), P2 = await runProc(pg); show('PROCESS-2', P2); var b5 = await snap(pg, C1);
    check('R2b-refused-whole', !/Migrated from Odoo/.test(P2.msg) && JSON.stringify(b4) === JSON.stringify(b5), 'a second Process of the same file is refused and changes nothing (row counts of 12 tables identical before/after)', { msg: P2.msg, before: b4, after: b5 });
    say('§JRN-R2b OBSERVED RULE: second Process on the same file -> ' + (JSON.stringify(b4) === JSON.stringify(b5) ? 'refused, tenant unchanged' : 'CHANGED THE TENANT') + '; message="' + String(P2.msg).slice(0, 220) + '"');
    var B1b = await books(pg, C1);
    check('R2b-books-same', JSON.stringify(B1b.by) === JSON.stringify(B1.by), 'the books are untouched by the refused second Process', { a: B1.by, b: B1b.by });
    var msgPlain = /already (migrated|there|loaded)|nothing (left )?to (do|migrate|load)/i.test(String(P2.msg));
    if (!msgPlain) finding('F-R2b-MSG', 'the refusal of a second Process says "Nothing migrated: N row error(s) ... C_Location_UU: 2 C_Location rows have ... (ambiguous)" (' + String(P2.msg).slice(0, 140) + '), not "already migrated - nothing to do": the guide promises only "refused" and the user cannot tell a finished migration from a broken one (R7 class)');
    check('R2d-already', alreadyN > 0, 'the re-run summary counts rows under "Already there" (the first run\'s rows hold the keys) instead of silently dropping them', { alreadyN: alreadyN, willN: willN, refN: refN });
    if (willN === 0 && refN === 0 && !/ok=true/.test(S2.sum)) finding('F-R2d-OK', 're-run summary says ok=false although every row is "already there" and none is refused: the user gets no "nothing to do" message');
    say('§JRN-R2d OBSERVED RULE: re-run summary -> ' + S2.sum.slice(0, 90) + ' (already=' + alreadyN + ', will=' + willN + ', refused=' + refN + ')');

    // ═══ R2 (c) a second file for the same tenant: the other Odoo company (new partners / products / document numbers, same chart) ═══
    var E2 = clone(EXP); E2.manifest.company_id = 2; E2.manifest.company_name = 'My Company (Chicago)';
    E2.sets['res.partner'].forEach(function (p) { p.name = p.name + ' CHI'; if (p.ref) p.ref = p.ref + 'C'; });
    E2.sets['product.product'].forEach(function (p) { if (p.default_code) p.default_code = p.default_code + 'C'; p.name = p.name + ' CHI'; });
    E2.sets['open_lines'].forEach(function (l) { l.move_name = l.move_name + '/C'; l['move_id__name'] = l.move_name; });
    E2.sets['open_moves'].forEach(function (m) { m.name = m.name + '/C'; });
    await openForm(pg); await pg.waitForSelector(FORM + ' [data-gform-param="Files"]', { timeout: 20000 });
    await pick(pg, wf('odoo_export_company2.json', E2));
    var S3 = await refresh(pg), c0 = await snap(pg, C1), B2a = await books(pg, C1);
    say('§JRN-R2c second-file summary: ' + S3.sum.slice(0, 200) + ' problems=' + J(S3.rows.filter(function (r) { return /^⚠/.test(r.item); }).map(function (r) { return r.item.slice(0, 160); })));
    var P3 = await runProc(pg); show('PROCESS-3', P3); var c1 = await snap(pg, C1), B2b = await books(pg, C1), d3 = await docs(pg, C1);
    var refused3 = !/Migrated from Odoo/.test(P3.msg), whole = JSON.stringify(c0) === JSON.stringify(c1);
    var sumBothTb = Object.keys(SRC.plain).every(function (c) { return B2b.by[c] === 2 * SRC.plain[c]; });
    say('§JRN-R2c OBSERVED RULE: second file (same chart, new partners/products/documents) -> ' + (refused3 ? 'REFUSED' + (whole ? ' whole (tenant unchanged)' : ' BUT THE TENANT CHANGED') : 'LOADED') + '; documents=' + (Array.isArray(d3) ? d3.length : d3) + ' tb_sum=' + money(B2b.sum) + ' books_are_twice_the_source=' + sumBothTb + ' verify=' + P3.ver.slice(0, 80) + ' msg=' + J(String(P3.msg).slice(0, 300)));
    check('R2c-consistent', (refused3 && whole) || (!refused3 && /verdict=PASS judged=[1-9]/.test(P3.ver) && B2b.sum === 0 && (B2b.by[CLR.AR] || 0) === 0 && (B2b.by[CLR.AP] || 0) === 0 && (B2b.by[CLR.BANK] || 0) === 0 && Array.isArray(d3) && d3.length === 2 * NDOC && sumBothTb),
      'a second file is either refused whole (tenant unchanged) or loads completely (documents = 2 x ' + NDOC + ', books = both sources added, clearing at 0.00, §MIG-VERIFY PASS) — never a half-loaded tenant', { refused: refused3, whole: whole, docs: Array.isArray(d3) ? d3.length : d3, sum: B2b.sum, before: c0, after: c1 });
    if (refused3) finding('F-R2c-SECOND-COMPANY', 'a second file for a tenant that already migrated one (e.g. the other Odoo company; the guide says "Each one becomes its own ERP company") is ' + (whole ? 'refused whole' : 'REFUSED BUT LEFT PARTIAL ROWS') + ': ' + String(P3.msg).slice(0, 200));
    // ═══ T3 — the period gate, on the page: a company whose year is not the cut-over's ═══
    await sw(pg, 'Stale Co', 'sAdmin', roleOf[T3.clientId]); await openForm(pg); await pg.waitForSelector(FORM + ' [data-gform-param="Files"]', { timeout: 20000 });
    var t3base = await snap(pg, T3.clientId); await pick(pg, path.join(FIXD, 'odoo_export.json'));
    var S4 = await refresh(pg), pr = S4.rows.filter(function (r) { return /^⚠ Open balances: the period/.test(r.item); });
    say('§JRN-PERIOD-GATE summary problem rows=' + J(pr.map(function (r) { return r.item.slice(0, 330); })));
    check('period-summary', pr.length === 1 && pr[0].item.indexOf(CUT) > 0 && /Automatic Period Control/.test(pr[0].item), 'a company whose periods do not cover the cut-over date ' + CUT + ' gets ONE problem row naming the date and the step (untick Automatic Period Control, open the period)', pr.map(function (r) { return r.item; }));
    var PG = await runProc(pg); show('PROCESS-PERIOD', PG); var t3after = await snap(pg, T3.clientId);
    check('period-refused', !/Migrated from Odoo/.test(PG.msg) && /Not migrated/.test(PG.msg) && JSON.stringify(t3base) === JSON.stringify(t3after), 'Process on that company is refused ("Not migrated ...") before anything is written (12 row counts unchanged)', { msg: PG.msg, base: t3base, after: t3after });
    step(11, 'OB the guide: "Open the period first" -> refusal on the page, nothing written', pr.length === 1 && JSON.stringify(t3base) === JSON.stringify(t3after));
    // ═══ T2 — R2(a): stage 2 refuses (one open invoice missing from the file; the agent counted 21 lines, the file holds 20) ═══
    await sw(pg, 'Falsify Co', 'fAdmin', roleOf[T2.clientId]); await openForm(pg); await pg.waitForSelector(FORM + ' [data-gform-param="Files"]', { timeout: 20000 });
    var CF = T2.clientId, EF = clone(EXP), gone = EF.sets.open_lines.filter(function (l) { return l.move_type === 'out_invoice'; }).pop();
    EF.sets.open_lines = EF.sets.open_lines.filter(function (l) { return l !== gone; });
    var shortFile = await (async function () { await pick(pg, wf('odoo_export_short.json', EF)); var r = await refresh(pg); return r; })();
    var shortProb = shortFile.rows.filter(function (r) { return /^⚠/.test(r.item); }).map(function (r) { return r.item.slice(0, 200); });
    say('§JRN-R2a file with a line dropped but the agent\'s count kept -> problems=' + J(shortProb));
    check('R2a-short-file', shortProb.some(function (t) { return /open_lines/.test(t) && /counted/.test(t); }), 'a file whose open_lines holds one row less than Odoo counted is refused BEFORE anything runs, naming the set and both numbers (the integrity check works)', shortProb);
    EF.manifest.sets.open_lines.count -= 1;   // the falsifier of witness_open_balances: the agent itself missed the line, so only the books can tell
    await pick(pg, wf('odoo_export_short2.json', EF)); var S5 = await refresh(pg);
    var f0 = await snap(pg, CF), PA = await runProc(pg); show('PROCESS-FALSIFY', PA); var f1 = await snap(pg, CF), goneAmt = money(Math.abs(cents(gone.amount_residual)));
    say('§JRN-R2a removed=' + gone.move_name + ' amount=' + goneAmt + ' counts_before=' + J(f0) + ' counts_after=' + J(f1));
    check('R2a-refused', /Migrated from Odoo/.test(PA.msg) && !/Open balances completed/.test(PA.msg) && PA.msg.indexOf(goneAmt) >= 0 && /AR clearing/.test(PA.msg), 'stage 2 is refused and the form message NAMES the amount (' + goneAmt + ') left on AR Clearing; stage 1 (the masters) stays committed', { msg: PA.msg, cls: PA.cls });
    check('R2a-nothing-posted', f1.gl_journal === 0 && f1.c_invoice === 0 && f1.fact_acct === 0 && f1.c_bpartner > f0.c_bpartner, 'the refused stage 2 left no journal, no invoice and no Fact_Acct (rolled back whole); the masters are loaded', { f0: f0, f1: f1 });
    step(12, 'OB the guide: "if anything differs it says which account and by how much" -> named on the page', PA.msg.indexOf(goneAmt) >= 0 && /AR clearing/.test(PA.msg));
    // is the tenant stuck? what remains, what can the role do
    var pend = await Q(pg, 'SELECT (SELECT count(*) FROM i_gljournal WHERE ad_client_id=? AND i_isimported<>\'Y\') AS glj, (SELECT count(*) FROM i_invoice WHERE ad_client_id=? AND i_isimported<>\'Y\') AS inv, (SELECT count(*) FROM i_bankstatement WHERE ad_client_id=? AND i_isimported<>\'Y\') AS bst, (SELECT count(*) FROM i_inventory WHERE ad_client_id=? AND i_isimported<>\'Y\') AS stk', [CF, CF, CF, CF]);
    var racc = await Q(pg, 'SELECT ad_process_id AS p FROM ad_process_access WHERE ad_role_id=? AND ad_process_id IN (220,207,221,167)', [roleOf[CF]]);
    var wacc = await Q(pg, "SELECT w.name AS n FROM ad_window_access wa JOIN ad_window w ON w.ad_window_id=wa.ad_window_id WHERE wa.ad_role_id=? AND w.name IN ('Import GL Journal','Import Invoice','Import Bank Statement')", [roleOf[CF]]);
    var leafs = await pg.evaluate(function () { var o = {}; ['Import GL Journal', 'Import Invoice'].forEach(function (nm) { o[nm] = !!Array.prototype.slice.call(document.querySelectorAll('#idmp-tree .idmp-row.leaf .nm')).filter(function (r) { return r.textContent.trim() === nm; })[0]; }); return o; });
    say('§JRN-R2a state after the refusal: pending_import_rows=' + J(pend) + ' role_process_access(220,207,221,167)=' + J(racc) + ' role_window_access=' + J(wacc) + ' menu_leaves=' + J(leafs));
    check('R2a-pending-kept', Array.isArray(pend) && pend[0].glj > 0 && pend[0].inv > 0, 'the import rows stage 1 wrote are still pending (I_IsImported=N) so legacy\'s own Import GL Journal / Import Invoice can be run again', pend);
    var roleCan = Array.isArray(racc) && racc.length >= 2 && Array.isArray(wacc) && wacc.length >= 2;
    check('R2a-role-reach', roleCan && leafs['Import GL Journal'] && leafs['Import Invoice'], 'the tenant\'s administrator role holds the access to Import GL Journal and Import Invoice (process 220 / 207 and their windows) and sees their menu leaves — "run it again" is reachable', { racc: racc, wacc: wacc, leafs: leafs });
    if (!(roleCan && leafs['Import GL Journal'] && leafs['Import Invoice'])) finding('F-R2a-ROLE', 'after a refused stage 2 the tenant\'s admin role does NOT reach Import GL Journal / Import Invoice (process access ' + J(racc) + ', window access ' + J(wacc) + ', leaves ' + J(leafs) + '): the refusal text says "run Import GL Journal again" but the user cannot');
    // finish by hand: run the two shipped processes in the tenant's session, the way the windows' process buttons do (AdProcess.runInTrx over the tip, one committed group)
    var fin = await pg.evaluate(function (a) { return new Promise(function (resolve) { var C = a[0], out = {};
      window.__crud.modelRun({ table: 'c_bpartner', timing: 'PROCESS', fn: function (trx) { var AP = window.AdProcess, as = trx.q('SELECT c_acctschema1_id AS id FROM ad_clientinfo WHERE ad_client_id=?', [C])[0];
        var r1 = AP.runInTrx(trx, 220, { params: { AD_Client_ID: C, AD_Org_ID: Number(trx.env.org || 0), C_AcctSchema_ID: as && as.id, IsValidateOnly: 'N', IsImportOnlyNoErrors: 'Y', DeleteOldImported: 'N' } });
        var r2 = AP.runInTrx(trx, 207, { params: { AD_Client_ID: C, AD_Org_ID: Number(trx.env.org || 0), DocAction: 'CO', DeleteOldImported: 'N' } });
        out.r1 = { ok: !!(r1 && r1.ok), s: String(r1 && r1.summary || '').slice(0, 200) }; out.r2 = { ok: !!(r2 && r2.ok), s: String(r2 && r2.summary || '').slice(0, 200) }; return { ok: true, msg: 'x' }; } },
        function (r) { out.ops = r && r.ops ? r.ops.length : -1; out.ok = !!(r && r.ok); out.msg = r && r.msg; if (r && r.ok && r.ops && r.ops.length) window.__crud.applyOpGroup(r.ops, function (cr) { out.committed = !!(cr && cr.committed); resolve(out); }, r.observed); else resolve(out); }); }); }, [CF]).catch(function (e) { return { err: String(e.message) }; });
    say('§JRN-R2a finishing by hand (Import GL Journal 220 + Import Invoice 207 as the tenant) -> ' + J(fin));
    var f2 = await snap(pg, CF), B3 = await books(pg, CF), dc3 = await docs(pg, CF), batches = await Q(pg, 'SELECT docstatus AS s, count(*) AS n FROM gl_journalbatch WHERE ad_client_id=? GROUP BY 1', [CF]);
    var clrAR = B3.by[CLR.AR] || 0;
    say('§JRN-R2a after finishing by hand: counts=' + J(f2) + ' journal_batches=' + J(batches) + ' documents=' + (Array.isArray(dc3) ? dc3.length : dc3) + ' AR_clearing=' + money(clrAR) + ' (the amount the verifier refused was ' + goneAmt + ') tb_sum=' + money(B3.sum));
    var finished = f2.gl_journal > 0 && f2.c_invoice > 0;
    var batchDraft = Array.isArray(batches) && batches.some(function (b) { return b.s !== 'CO'; });
    check('R2a-finish-observed', fin && !fin.err, 'the two shipped import processes can be run in the stuck tenant\'s session (they ran; their result is reported as a finding below)', fin);
    if (finished) finding('F-R2a-NO-VERIFY', 'after the verifier refused stage 2 the tenant CAN be finished by running Import GL Journal (220) and Import Invoice (207) by hand, but then nothing re-runs the cut-over check: the journal batch is ' + (batchDraft ? 'left Drafted (the user must Complete it)' : 'Completed') + ', the AR Clearing account stays at ' + money(clrAR) + ' (expected 0.00 only after the missing ' + goneAmt + ' invoice is also imported) and no message says the books still differ from the source. The refused file also cannot simply be corrected and re-Processed (see R2b: masters are "already there", the import rows would double).');
    else finding('F-R2a-STUCK', 'after the verifier refused stage 2 the pending import rows could NOT be finished by the shipped processes (journal/invoice counts ' + f2.gl_journal + '/' + f2.c_invoice + '): the tenant is stuck half-migrated; ' + J(fin));
    // and the corrected file, Processed on the same tenant
    await openForm(pg); await pg.waitForSelector(FORM + ' [data-gform-param="Files"]', { timeout: 20000 }); await pick(pg, path.join(FIXD, 'odoo_export.json'));
    var S6 = await refresh(pg), g0 = await snap(pg, CF), PC = await runProc(pg); show('PROCESS-CORRECTED', PC); var g1 = await snap(pg, CF);
    var okC = /Migrated from Odoo/.test(PC.msg) && /Open balances completed/.test(PC.msg);
    say('§JRN-R2a OBSERVED RULE: after a refused stage 2 the user fixes the source and Processes the corrected file -> ' + (okC ? 'LOADED' : 'REFUSED') + ' msg=' + J(String(PC.msg).slice(0, 300)) + ' counts_before=' + J(g0) + ' counts_after=' + J(g1) + ' summary=' + S6.sum.slice(0, 100));
    if (!okC) finding('F-R2a-CORRECTED-FILE', 'the corrected file cannot be Processed on a tenant whose stage 2 was refused (' + String(PC.msg).slice(0, 200) + '): the only way out is to discard the company and migrate into a new one — the guide and the refusal text do not say so.');
    check('R2a-corrected-consistent', okC ? (/verdict=PASS judged=[1-9]/.test(PC.ver)) : JSON.stringify(g0) === JSON.stringify(g1), 'the corrected file either loads completely with §MIG-VERIFY PASS, or is refused whole (no partial change)', { msg: PC.msg, g0: g0, g1: g1, ver: PC.ver });
    // ═══ PHASE 2 — the guide's own path: the company exists, the page is RELOADED (the guide asks for a reload when the company was created with the plugins running; a user returning on any later day does the same) ═══
    await pg.close(); pg = await open(); await login(pg, 'Reload Co', 'rAdmin', roleOf[T4.clientId]);
    var dup1 = await dupScan(pg), CR = T4.clientId, dupNew = dup1.filter(function (t) { return dup0.indexOf(t) < 0; });
    say('§JRN-DUP after the reload: ' + dup1.length + ' tables with a repeated primary id: ' + J(dup1));
    check('reload-no-duplicates', dupNew.length === 0, 'after a company exists and the page is reloaded the System dictionary is what it was on a fresh page (no table has a primary id twice; fresh baseline: ' + dup0.length + ' such tables)', dupNew);
    await openForm(pg); await pg.waitForSelector(FORM + ' [data-gform-param="Files"]', { timeout: 20000 }); await pick(pg, path.join(FIXD, 'odoo_export.json')); var SR = await refresh(pg);
    var PR2 = await runProc(pg); show('PROCESS-AFTER-RELOAD', PR2); var rdk = await snap(pg, CR), BR = await books(pg, CR);
    check('reload-process', /Open balances completed/.test(PR2.msg) && /verdict=PASS judged=[1-9]/.test(PR2.ver), 'on the reloaded page the same one-file migration completes stage 2 with §MIG-VERIFY PASS (the Phase-1 result)', { msg: String(PR2.msg).slice(0, 400), counts: rdk });
    if (!(/Open balances completed/.test(PR2.msg))) finding('F-RELOAD-DUP', 'AFTER ANY RELOAD OF A PAGE THAT HOLDS A COMPANY, Open balances stage 2 is refused: ' + dupNew.length + ' System tables (' + dupNew.slice(0, 6).join(', ') + ' ...) hold every row twice, so Import GL Journal\'s scalar subquery on c_conversiontype returns 2 rows ("more than one row returned by a subquery used as an expression", logged as §PROC-SQL-ERROR) and the importer reports "Invalid CurrencyType / No ConversionType / Period Closed". Cause (read): patches/ad_seed.db.sql creates c_conversiontype WITHOUT a primary key (:584) and fills it with INSERT OR IGNORE (:849), which dedups nothing without a key, and idempiere.html (patch loop, ~:1161) re-applies the patch on EVERY load, cache hit included; a company persists the patched DB to the cache, so the next load doubles the rows.');
    await pg.close();

    var real = errs.filter(function (e) { return !/ResizeObserver/.test(e); });
    check('errors', real.length === 0, 'no page errors during the journey', real.slice(0, 3));
  } catch (e) { check('crash', false, 'the run completed', e && (e.stack || e.message)); }
  step(1, 'S1 get your data out of Odoo (the agent) — witnessed elsewhere (poc_odoo_owndb / the byte-identical live re-run), not driven from this page', null);
  var wit = Object.keys(STEPS).filter(function (k) { return STEPS[k] === 'WITNESSED'; }).length, un = Object.keys(STEPS).filter(function (k) { return STEPS[k] === 'UNWITNESSED'; }).length, bad = Object.keys(STEPS).filter(function (k) { return STEPS[k] === 'FAILED'; }).length;
  say('§JRN-STEPS witnessed=' + wit + ' unwitnessed=' + un + ' failed=' + bad + ' of N=' + N);
  logs.filter(function (l) { return /§NINJA-ERR|§MODEL-ERR/.test(l); }).slice(0, 8).forEach(function (l) { say('   page: ' + l.slice(0, 300)); });
  await browser.close(); server.close();
  say('§JRN-VERDICT ' + (!judged ? 'INCONCLUSIVE' : fails || bad ? 'FAIL' : 'PASS') + ' judged=' + judged + ' failed=' + (fails + bad));
  process.exit(!judged ? 3 : fails || bad ? 1 : 0);
})();
