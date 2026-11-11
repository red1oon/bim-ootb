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
  var W = '#idmp-content';
    async function setCol(col, want, mode) {   // like a user: Playwright selectOption / fill / check on the real control
      var sel = W + ' [data-col="' + col + '"]:not(span)', info = await pg.evaluate(function (a) { var e = document.querySelector(a); return e ? { tag: e.tagName, type: e.type, opts: e.tagName === 'SELECT' ? Array.prototype.map.call(e.options, function (x) { return [x.value, x.text]; }) : null } : null; }, sel);
      if (!info) return 'NOFIELD';
      if (info.tag === 'SELECT') { var o = info.opts.filter(function (x) { return mode === 'first' ? x[0] !== '' : (x[1].indexOf(want) >= 0 || x[0] === want); })[0]; if (!o) return 'NOOPT ' + J(info.opts.slice(0, 8)); await pg.selectOption(sel, o[0]); await sleep(700); return 'SEL ' + o[1] + ' now=' + await pg.$eval(sel, function (e) { return e.value; }); }
      if (info.type === 'checkbox') { await pg.setChecked(sel, !!want); return 'CHK'; } await pg.fill(sel, String(want)); await pg.press(sel, 'Tab'); await sleep(500); return 'VAL ' + await pg.$eval(sel, function (e) { return e.value; });
    }
    async function tb(prefix) { var ok = await pg.evaluate(function (p) { var b = Array.prototype.slice.call(document.querySelectorAll('button, [role=button]')).filter(function (x) { return (x.getAttribute('title') || '').indexOf(p) === 0 && !x.disabled; })[0]; if (!b) return false; b.click(); return true; }, prefix); await sleep(2500); return ok; }
    async function status() { return pg.evaluate(function () { var t = []; document.querySelectorAll('.idmp-toast, [class*=toast], [class*=status], #idmp-status').forEach(function (e) { var x = (e.innerText || '').trim(); if (x) t.push(x.slice(0, 200)); }); return t.slice(-4); }); }
  var W = '#idmp-content';
    async function setCol(col, want, mode) {   // like a user: Playwright selectOption / fill / check on the real control
      var sel = W + ' [data-col="' + col + '"]:not(span)', info = await pg.evaluate(function (a) { var e = document.querySelector(a); return e ? { tag: e.tagName, type: e.type, opts: e.tagName === 'SELECT' ? Array.prototype.map.call(e.options, function (x) { return [x.value, x.text]; }) : null } : null; }, sel);
      if (!info) return 'NOFIELD';
      if (info.tag === 'SELECT') { var o = info.opts.filter(function (x) { return mode === 'first' ? x[0] !== '' : (x[1].indexOf(want) >= 0 || x[0] === want); })[0]; if (!o) return 'NOOPT ' + J(info.opts.slice(0, 8)); await pg.selectOption(sel, o[0]); await sleep(700); return 'SEL ' + o[1] + ' now=' + await pg.$eval(sel, function (e) { return e.value; }); }
      if (info.type === 'checkbox') { await pg.setChecked(sel, !!want); return 'CHK'; } await pg.fill(sel, String(want)); await pg.press(sel, 'Tab'); await sleep(500); return 'VAL ' + await pg.$eval(sel, function (e) { return e.value; });
    }
    async function tb(prefix) { var ok = await pg.evaluate(function (p) { var b = Array.prototype.slice.call(document.querySelectorAll('button, [role=button]')).filter(function (x) { return (x.getAttribute('title') || '').indexOf(p) === 0 && !x.disabled; })[0]; if (!b) return false; b.click(); return true; }, prefix); await sleep(2500); return ok; }
    async function status() { return pg.evaluate(function () { var t = []; document.querySelectorAll('.idmp-toast, [class*=toast], [class*=status], #idmp-status').forEach(function (e) { var x = (e.innerText || '').trim(); if (x) t.push(x.slice(0, 200)); }); return t.slice(-4); }); }
  var ITEM = EXP.sets['product.product'].filter(function (p) { return p.default_code === 'E-COM08'; })[0], LISTP = cents(ITEM.list_price), ITEMQTY = EXP.sets['stock.quant'].filter(function (x) { return String(x.product_id__name).indexOf('[E-COM08]') === 0; }).reduce(function (a, x) { return a + Number(x.quantity || 0); }, 0);   // raw rows: the stocked item and its price
  var ALL = { judged: 0, failed: 0 }, CASES = {};
  function check(cs, key, rule, ok, info) { var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
    say('  §LOOKUP-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + String(J(info)).slice(0, 1500))); }
  async function openSO(pg) {
    var opn = await pg.evaluate(function () { var lf = Array.prototype.slice.call(document.querySelectorAll('#idmp-tree .idmp-row.leaf')).filter(function (r) { var nm = r.querySelector('.nm'); return nm && nm.textContent.trim() === 'Sales Order'; })[0]; if (!lf) return false; var n = lf.parentElement; while (n && n.id !== 'idmp-tree') { if (n.style) n.style.display = ''; n = n.parentElement; } lf.click(); return true; });
    await sleep(5000); return opn;
  }
  async function offered(pg) {   // the options the REAL window's selects offer right now (blank excluded): value list per column
    return pg.evaluate(function () { var o = {}; document.querySelectorAll('#idmp-content select[data-col]:not(span)').forEach(function (s) { o[s.getAttribute('data-col')] = Array.prototype.filter.call(s.options, function (x) { return x.value !== ''; }).map(function (x) { return x.value; }); }); return o; });
  }
  // expected counts: independent SQL on the tenant's rows read through the tip (bundle + committed op groups), the legacy rule text of AD_Val_Rule 133 / 189 / 230 / 271 written out by hand
  async function expected(pg, C) {
    var org = (await Q(pg, "SELECT ad_org_id AS o FROM ad_org WHERE ad_client_id=? AND ad_org_id>0 ORDER BY ad_org_id", [C]).then(function (r) { return r; }))[0];
    var one = async function (sql, p) { var r = await Q(pg, sql, p); return Array.isArray(r) && r[0] ? Number(r[0].n) : r; };
    return {
      org: org && org.o,
      c_doctypetarget_id: await one("SELECT count(*) AS n FROM c_doctype WHERE ad_client_id IN (0,?) AND isactive='Y' AND docbasetype IN ('SOO','POO') AND issotrx='Y' AND COALESCE(docsubtypeso,' ')<>'RM' AND ad_client_id=?", [C, C]),
      m_warehouse_id: await one("SELECT count(*) AS n FROM m_warehouse WHERE ad_client_id=? AND isactive='Y' AND ad_org_id=?", [C, org && org.o]),
      c_bpartner_id: await one("SELECT count(*) AS n FROM c_bpartner WHERE ad_client_id=? AND isactive='Y' AND issummary='N'", [C]),
      m_pricelist_id: await one("SELECT count(*) AS n FROM m_pricelist p WHERE p.ad_client_id=? AND p.isactive='Y' AND p.issopricelist='Y' AND (SELECT count(*) FROM m_pricelist_version v WHERE v.m_pricelist_id=p.m_pricelist_id AND v.isactive='Y')>0", [C]),
      neg: await one("SELECT (SELECT count(*) FROM m_pricelist WHERE ad_client_id=? AND m_pricelist_id<0)+(SELECT count(*) FROM m_pricelist_version WHERE ad_client_id=? AND m_pricelist_version_id<0)+(SELECT count(*) FROM c_bpartner WHERE ad_client_id=? AND c_bpartner_id<0)+(SELECT count(*) FROM m_product WHERE ad_client_id=? AND m_product_id<0)+(SELECT count(*) FROM m_warehouse WHERE ad_client_id=? AND m_warehouse_id<0)+(SELECT count(*) FROM c_doctype WHERE ad_client_id=? AND c_doctype_id<0) AS n", [C, C, C, C, C, C]) };
  }
  var COLS = ['c_doctypetarget_id', 'c_bpartner_id', 'm_warehouse_id', 'm_pricelist_id'];
  async function judgeSelects(pg, label, C, cs) {
    var ex = await expected(pg, C), of = await offered(pg), cnt = {}; COLS.forEach(function (c) { cnt[c] = (of[c] || []).length; });
    say('§LOOKUP-COUNTS ' + label + ' client=' + C + ' offered=' + J(cnt) + ' expected=' + J({ c_doctypetarget_id: ex.c_doctypetarget_id, c_bpartner_id: ex.c_bpartner_id, m_warehouse_id: ex.m_warehouse_id, m_pricelist_id: ex.m_pricelist_id }) + ' negative_id_rows_behind_these_selects=' + ex.neg);
    COLS.forEach(function (c) { check(cs, c, label + ': the Sales Order window offers ' + c + ' ' + ex[c] + ' row(s) = the tenant rows the legacy rule admits (independent SQL)', cnt[c] === ex[c], { offered: cnt[c], expected: ex[c] }); });
    return { ex: ex, of: of, cnt: cnt };
  }
  try {
    var pg = await open(); await login(pg, 'System', 'System', 0);
    async function birthTenant(name, admin, dateAcct) { return pg.evaluate(async function (a) { var b = window.Genesis.birthTenant({ clientName: a[0], currencyId: 100, currencyIso: 'USD', currencyPrecision: 2, adminUser: a[1], dateAcct: a[2], countryId: 100 }); var r = await window.idmpInstallGenesis(b); return { ok: r && r.ok, clientId: r && r.clientId }; }, [name, admin, dateAcct]); }
    var TB = await birthTenant('Born Co', 'bornAdmin', CUT), TM = await birthTenant('Mig Co', 'migAdmin', CUT), roleOf = {};
    for (var cc of [TB.clientId, TM.clientId]) { var rr = await Q(pg, "SELECT ad_role_id AS r FROM ad_role WHERE ad_client_id=? AND name LIKE '%Admin'", [cc]); roleOf[cc] = rr[0].r; }
    await pg.evaluate(function () { window.PluginRelease.open(); }); await pg.waitForSelector('#pr-osgi table.oc-t', { timeout: 15000 }); await sleep(800);
    for (var id of ['org.idempiere.ninja.migrate', 'org.kernel.odoo.migrate']) { if (await pg.$('[data-oc-start="' + id + '"]')) { await pg.click('[data-oc-start="' + id + '"]'); await sleep(2500); } }
    await pg.evaluate(function () { var x = document.querySelector('[data-pr-close]'); if (x) x.click(); }); await sleep(500);
    say('§LOOKUP-TENANTS born=' + J(TB) + ' mig=' + J(TM));
    // ── BORN tenant (Initial Tenant Setup): legacy MSetup makes ONE price list and it is NOT a sales list (MPriceList.setInitialDefaults), so a Sales Order offers 0 there - the expectation says so
    await sw(pg, 'Born Co', 'bornAdmin', roleOf[TB.clientId]); check('BORN', 'opens', 'the Sales Order window opens on the born tenant', await openSO(pg), null); await tb('New'); await sleep(2500);
    var B = await judgeSelects(pg, 'born', TB.clientId, 'BORN');
    check('BORN', 'nonvacuous', 'control: the born tenant has bpartner/warehouse/doctype rows to offer (expected counts > 0) so the comparison is not vacuous', B.ex.c_bpartner_id > 0 && B.ex.m_warehouse_id > 0 && B.ex.c_doctypetarget_id > 0, B.ex);
    // ── MIGRATED tenant (Odoo one-file flow: price list, partners, products, warehouse made through the op log = negative synthetic pks)
    await sw(pg, 'Mig Co', 'migAdmin', roleOf[TM.clientId]); await openForm(pg, 9542001); await pg.waitForSelector(FORM + ' [data-gform-param="Files"]', { timeout: 20000 });
    await pick(pg, path.join(FIXD, 'odoo_export.json')); await refresh(pg); var R = await runProc(pg); say('§LOOKUP-MIGRATED ' + J(R.msg).slice(0, 160) + ' ' + R.ver);
    check('MIG', 'migrated', 'control: the Odoo fixture is migrated on the page (stage 2 completed, §MIG-VERIFY PASS)', /Open balances completed/.test(R.msg) && /PASS/.test(R.ver), { msg: R.msg.slice(0, 200), ver: R.ver });
    check('MIG', 'opens', 'the Sales Order window opens on the migrated tenant', await openSO(pg), null); await tb('New'); await sleep(2500);
    var M = await judgeSelects(pg, 'migrated', TM.clientId, 'MIG');
    check('MIG', 'negative-premise', 'control: the rows behind these selects carry NEGATIVE ids on this tenant (' + M.ex.neg + ' rows: price list, version, partners, products, warehouse)', M.ex.neg > 0 && M.ex.m_pricelist_id >= 1, M.ex);
    // product select on the line tab is judged below with the order
    // ── MUTANT: the old lookup (only the picker's own table folded) offers the reported 0 price lists
    await pg.evaluate(function () { window.__fkNoShadow = true; }); await openSO(pg); await tb('New'); await sleep(2500);
    var MU = await offered(pg); check('MUTANT', 'old-fold-fails', 'MUTANT: with the sub-select shadowing switched off (the old lookup) the Price List offers 0 rows although the tenant holds ' + M.ex.m_pricelist_id + ' sales list(s)', (MU.m_pricelist_id || []).length === 0 && M.ex.m_pricelist_id >= 1, { offered: (MU.m_pricelist_id || []).length });
    await pg.evaluate(function () { window.__fkNoShadow = false; });
    // ── the real window: new Sales Order -> header -> line -> complete
    await openSO(pg); say('§LOOKUP-NEW ' + await tb('New'));
    var of0 = await offered(pg), labels = await pg.evaluate(function () { var o = {}; ['c_doctypetarget_id', 'c_bpartner_id'].forEach(function (c) { var s = document.querySelector('#idmp-content select[data-col="' + c + '"]'); o[c] = s ? Array.prototype.map.call(s.options, function (x) { return x.text; }) : []; }); return o; });
    var dt = labels.c_doctypetarget_id.filter(function (t) { return /Standard Order/.test(t); })[0] ? 'Standard Order' : '';
    say('§LOOKUP-SET doctype=' + await setCol('c_doctypetarget_id', dt || '', dt ? undefined : 'first') + ' bp=' + await setCol('c_bpartner_id', 'Gemini Furniture'));
    await sleep(1500); say('§LOOKUP-SET loc=' + await setCol('c_bpartner_location_id', '', 'first') + ' wh=' + await setCol('m_warehouse_id', '', 'first') + ' pl=' + await setCol('m_pricelist_id', '', 'first'));
    say('§LOOKUP-SAVE header=' + await tb('Save'));
    var ord = await Q(pg, "SELECT c_order_id AS id, documentno AS no, docstatus AS s, m_pricelist_id AS pl, c_bpartner_id AS bp FROM c_order WHERE ad_client_id=? ORDER BY ABS(c_order_id) DESC LIMIT 1", [TM.clientId]);
    check('ORDER', 'header-saved', 'the order header SAVES in the real window on the migrated tenant with the offered migrated Price List (C_Order row exists, M_PriceList_ID = the tenant sales list ' + J((await Q(pg, "SELECT m_pricelist_id AS id FROM m_pricelist WHERE ad_client_id=? AND issopricelist='Y'", [TM.clientId]))[0]) + ')', Array.isArray(ord) && ord.length === 1 && ord[0].pl === (await Q(pg, "SELECT m_pricelist_id AS id FROM m_pricelist WHERE ad_client_id=? AND issopricelist='Y'", [TM.clientId]))[0].id, ord);
    await pg.getByText('Order Line', { exact: true }).first().click({ timeout: 8000, force: true }).catch(function () {}); await sleep(2500); await tb('New'); await sleep(2000);
    var ofl = await offered(pg), expProd = await Q(pg, "SELECT count(*) AS n FROM m_product WHERE ad_client_id=? AND isactive='Y' AND issummary='N'", [TM.clientId]);
    say('§LOOKUP-COUNTS migrated product offered=' + (ofl.m_product_id || []).length + ' expected=' + expProd[0].n);
    check('ORDER', 'product-select', 'the Order Line product select offers every active non-summary tenant product (' + expProd[0].n + ', negative ids included)', (ofl.m_product_id || []).length === Number(expProd[0].n), { offered: (ofl.m_product_id || []).length, expected: expProd[0].n });
    say('§LOOKUP-SET prod=' + await setCol('m_product_id', ITEM.name + ' (') + ' qty=' + await setCol('qtyentered', '2')); await sleep(1500);
    say('§LOOKUP-SAVE line=' + await tb('Save'));
    say('§LOOKUP-PAGEERRORS ' + J(errs.slice(0, 6)) + ' sqlfnFns=' + J(await pg.evaluate(function () { try { var o = {}; window.AdCallout.RUNTIME.registerSqlFunctions(function (n) { o[n] = 1; }); return Object.keys(o).length + ':' + (o.bompricestd ? 'has' : 'no-bompricestd'); } catch (e) { return 'ERR ' + e.message; } })));
    say('§LOOKUP-UDFDIAG ' + J(await pg.evaluate(function () { var o = {}; try { o.idmpDb = window.__idmpDb.exec('SELECT bompricestd(-240,-387)')[0].values[0][0]; } catch (e) { o.idmpDb = 'ERR ' + e.message; }
      try { window.__crud.withModelTrx(function (q) { try { o.modelTrx = q('SELECT bompricestd(-240,-387) AS v')[0].v; } catch (e) { o.modelTrx = 'ERR ' + e.message; } }); } catch (e) { o.modelTrx = 'THROW ' + e.message; } try { window.__crud.bindUdf(window.__idmpDb); o.afterBind = window.__idmpDb.exec('SELECT bompricestd(-240,-387)')[0].values[0][0]; } catch (e) { o.afterBind = 'ERR ' + e.message; } try { window.AdCallout.RUNTIME.registerSqlFunctions(function (n, f) { window.__idmpDb.create_function(n, f); }); o.afterManual = window.__idmpDb.exec('SELECT bompricestd(-240,-387)')[0].values[0][0]; } catch (e) { o.afterManual = 'ERR ' + e.message; } o.udfBound = !!window.__idmpDb.__udfBound; return o; })) + ' udflogs=' + J(logs.filter(function (l) { return /UDF/.test(l); }).slice(-4)));
    say('§LOOKUP-PRICEDIAG order=' + J(await Q(pg, 'SELECT c_order_id AS id, m_pricelist_id AS pl, dateordered AS d, c_doctypetarget_id AS dt, issotrx AS so FROM c_order WHERE c_order_id=?', [ord[0] && ord[0].id])) + ' versions=' + J(await Q(pg, 'SELECT m_pricelist_version_id AS id, m_pricelist_id AS pl, validfrom AS vf, isactive AS a FROM m_pricelist_version WHERE ad_client_id=?', [TM.clientId])) + ' prodprice=' + J(await Q(pg, 'SELECT count(*) AS n, MIN(pricestd) AS mn FROM m_productprice WHERE m_product_id=-240')) + ' pp_versions=' + J(await Q(pg, 'SELECT m_pricelist_version_id AS v, pricestd AS p FROM m_productprice WHERE m_product_id=-240')));
    logs.filter(function (l) { return /SEVERE|ProductNotOnPriceList|MODEL-(ERR|WARN)|§PRICING|§CALLOUT-CHANGE col=(m_product_id|qtyentered)/.test(l); }).slice(-12).forEach(function (l) { say('   page> ' + l.slice(0, 260)); });
    var ln = await Q(pg, "SELECT count(*) AS n, SUM(linenetamt) AS net FROM c_orderline WHERE ad_client_id=? AND c_order_id=?", [TM.clientId, ord[0] && ord[0].id]);
    check('ORDER', 'line-saved', 'the line SAVES (no ProductNotOnPriceList): 1 C_OrderLine of the new order, net = 2 x the raw list_price ' + money(LISTP) + ' = ' + money(2 * LISTP) + '', Array.isArray(ln) && ln[0].n === 1 && cents(ln[0].net) === 2 * LISTP, ln);
    logs.filter(function (l) { return /ProductNotOnPriceList/.test(l); }).slice(-2).forEach(function (l) { say('   page> ' + l.slice(0, 240)); });
    await pg.getByText('Order', { exact: true }).first().click({ timeout: 8000, force: true }).catch(function () {}); await sleep(2500);
    say('§LOOKUP-SET complete=' + await setCol('docstatus', 'CO') + ' save=' + await tb('Save'));
    var done = await Q(pg, "SELECT docstatus AS s, grandtotal AS t FROM c_order WHERE c_order_id=?", [ord[0] && ord[0].id]);
    check('ORDER', 'completed', 'the order COMPLETES in the window (DocStatus CO, GrandTotal > 0)', Array.isArray(done) && done[0] && done[0].s === 'CO' && Number(done[0].t) > 0, done);
    // ── ship, invoice, pay: the shipped Generate Shipments (118) / Generate Invoices (119) and the Payment document action, run in the page over the same tip the window wrote
    async function pageTx(label, src, arg) {   // src = function (trx, ML, AP, a) {...} -> {ok, ...}; the op group is committed like a window Save / button
      var r = await pg.evaluate(function (z) { return new Promise(function (res) { var fn = new Function('trx', 'ML', 'AP', 'a', 'return (' + z.src + ')(trx, ML, AP, a);');
        var pend = null; window.__crud.modelRun({ table: 'c_order', timing: 'PROCESS', fn: function (trx) { var o; try { o = fn(trx, window.ModelLayer, window.AdProcess, z.arg); } catch (e) { o = { ok: false, error: 'threw: ' + e.message }; } if (o && o.ok === false) { res({ out: o, committed: false }); return { ok: false, msg: o.error }; } pend = o; return { ok: true }; } },
          function (m) { if (!m || !m.ops || !m.ops.length) { res({ out: { ok: false, error: 'no ops ' + (m && m.error) }, committed: false }); return; } window.__crud.applyOpGroup(m.ops, function (cr) { res({ out: pend, committed: !!(cr && cr.committed), ops: m.ops.length }); }, m.observed); }); }); }, { src: src.toString(), arg: arg });
      say('§LOOKUP-STEP ' + label + ' ' + J(r)); return r; }
    var OID = ord[0] && ord[0].id, WH1 = (await Q(pg, "SELECT m_warehouse_id AS w FROM c_order WHERE c_order_id=?", [OID]))[0].w, ORG1 = (await Q(pg, "SELECT ad_org_id AS o FROM c_order WHERE c_order_id=?", [OID]))[0].o;
    var onh0 = (await Q(pg, "SELECT COALESCE(SUM(s.qtyonhand),0) AS q FROM m_storageonhand s WHERE s.ad_client_id=? AND s.m_product_id=(SELECT m_product_id FROM c_orderline WHERE c_order_id=?)", [TM.clientId, OID]))[0].q;
    var S1 = await pageTx('ship', function (trx, ML, AP, a) { var r = AP.runInTrx(trx, 118, { params: { AD_Client_ID: a.c, AD_Org_ID: a.o, M_Warehouse_ID: a.w, DocAction: 'CO', ConsolidateDocument: 'Y' } }); return { ok: !!(r && r.ok), error: r && (r.msg || r.error) }; }, { c: TM.clientId, o: ORG1, w: WH1 });
    var ios = await Q(pg, "SELECT docstatus AS s FROM m_inout WHERE c_order_id=?", [OID]);
    var onh1 = (await Q(pg, "SELECT COALESCE(SUM(s.qtyonhand),0) AS q FROM m_storageonhand s WHERE s.ad_client_id=? AND s.m_product_id=(SELECT m_product_id FROM c_orderline WHERE c_order_id=?)", [TM.clientId, OID]))[0].q;
    check('CYCLE', 'shipped', 'Generate Shipments makes ONE Completed shipment of the window order and on-hand of the product falls by 2 (' + onh0 + ' -> ' + (onh0 - 2) + ')', S1.committed && ios.length === 1 && ios[0].s === 'CO' && Number(onh1) === Number(onh0) - 2, { s1: S1, ios: ios, onh0: onh0, onh1: onh1 });
    var S2 = await pageTx('invoice', function (trx, ML, AP, a) { var r = AP.runInTrx(trx, 119, { params: { AD_Client_ID: a.c, AD_Org_ID: a.o, DocAction: 'CO', ConsolidateDocument: 'Y', DateInvoiced: a.d } }); return { ok: !!(r && r.ok), error: r && (r.msg || r.error) }; }, { c: TM.clientId, o: ORG1, d: CUT });
    await sleep(4000);   // the post-commit observers (Doc.post) run after the group is sealed
    logs.slice(-40).filter(function (l) { return /post|POST|Posting|fact/i.test(l); }).slice(-8).forEach(function (l) { say('   page-post> ' + l.slice(0, 240)); });
    var ivs = await Q(pg, "SELECT c_invoice_id AS id, docstatus AS s, posted AS p, grandtotal AS g, c_bpartner_id AS bp FROM c_invoice WHERE c_order_id=?", [OID]);
    check('CYCLE', 'invoiced', 'Generate Invoices makes ONE Completed, Posted invoice of the order (TotalLines = 2 x raw price + tax)', S2.committed && ivs.length === 1 && ivs[0].s === 'CO' && ivs[0].p === 'Y' && Number(ivs[0].g) * 100 >= 2 * LISTP, { s2: S2, ivs: ivs });
    var G = ivs[0] ? Number(ivs[0].g) : 0;
    var S3 = await pageTx('pay-save', function (trx, ML, AP, a) { var p = ML.newPO(trx, 'c_payment', { ad_org_id: a.o, c_doctype_id: trx.q("SELECT c_doctype_id AS d FROM c_doctype WHERE ad_client_id=? AND docbasetype='ARR' ORDER BY isdefault DESC", [a.c])[0].d, c_bankaccount_id: trx.q("SELECT c_bankaccount_id AS b FROM c_bankaccount WHERE ad_client_id=? AND accountno='BNK1'", [a.c])[0].b, c_bpartner_id: a.bp, c_invoice_id: a.inv, payamt: a.g, isreceipt: 'Y', c_currency_id: 100, datetrx: a.d, dateacct: a.d, docstatus: 'DR', docaction: 'CO' }); var sv = ML.save(trx, 'c_payment', null, p); return sv.ok ? { ok: true } : { ok: false, error: sv.error }; }, { c: TM.clientId, o: ORG1, bp: ivs[0] && ivs[0].bp, inv: ivs[0] && ivs[0].id, g: G, d: CUT });
    var PID = (await Q(pg, "SELECT c_payment_id AS id FROM c_payment WHERE ad_client_id=? ORDER BY ABS(c_payment_id) DESC LIMIT 1", [TM.clientId]))[0];
    var S4 = PID ? await pageTx('pay-complete', function (trx, ML, AP, a) { var r = ML.processIt(trx, 'c_payment', a.id, 'CO'); return { ok: !!r.ok, error: r.msg || r.status }; }, { id: PID.id }) : { committed: false };
    var inv1 = await Q(pg, "SELECT ispaid AS paid FROM c_invoice WHERE c_invoice_id=?", [ivs[0] && ivs[0].id]);
    var tbs = await Q(pg, "SELECT c_acctschema_id AS s, SUM(amtacctdr)-SUM(amtacctcr) AS b, count(*) AS n FROM fact_acct WHERE ad_client_id=? GROUP BY c_acctschema_id", [TM.clientId]);
    check('CYCLE', 'paid', 'the Payment SAVES against the migrated bank account and COMPLETES: the invoice is Paid (IsPaid Y)', S3.committed && S4.committed && inv1[0] && inv1[0].paid === 'Y', { s3: S3, s4: S4, inv1: inv1 });
    check('CYCLE', 'books', 'the books balance per accounting schema after the whole cycle (sum Dr - Cr = 0.00, facts > 0)', Array.isArray(tbs) && tbs.length > 0 && tbs.every(function (x) { return cents(x.b) === 0 && x.n > 0; }), tbs);
    Object.keys(CASES).forEach(function (c) { var x = CASES[c]; say('§LOOKUP-' + c + ' verdict=' + (!x.judged ? 'INCONCLUSIVE' : x.failed ? 'FAIL' : 'PASS') + ' judged=' + x.judged + ' failed=' + x.failed); });
    var V = !ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS';
    say('§LOOKUP-VERDICT ' + V + ' judged=' + ALL.judged + ' failed=' + ALL.failed); process.exitCode = V === 'PASS' ? 0 : 1;
  } catch (e) { say('§LOOKUP-CRASH ' + (e && e.stack || e)); say('§LOOKUP-VERDICT FAIL judged=' + ALL.judged + ' failed=' + (ALL.failed + 1) + ' crashed'); process.exitCode = 1; }
  await browser.close(); server.close();
})();
