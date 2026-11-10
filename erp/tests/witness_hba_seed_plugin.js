// ⚠ DO NOT REMOVE - W-HBA-SEED-PLUGIN (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §HBA-SEED-SPEC). READ THE LOG (/tmp/count_logs/hba_seed.log): the exit code is not evidence.
// THE ISSUE: ad_seed.db carried the HBA demo's 6 business partners (+30 rows hanging on them) in GardenWorld: 24 vs legacy 18 (TWIN CARDINAL RULE). Proves: base page = 18 and none of the cluster;
//   the plugin org.kernel.hba.demo brings back EXACTLY the raw seed's rows with every FK resolving (the HBA demo keeps its data); Stop removes them; a persisted start survives a reload.
// Expected values: legacy 18 (idempiere_test, read once); cluster counts from the RAW ad_seed.db via sqlite3 - not from the code under test.
// ERP_DIR=<old checkout/erp> runs it on old code = the mutant. HBA_DROP=1 points one payroll movement at a missing partner (falsifier for P2c).
'use strict';
var http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process');
var { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');
var ROOT = process.env.ERP_DIR || path.join(__dirname, '..'), J = JSON.stringify, res = [];
var LEGACY_GW_BP = 18;
var CLUSTER = ['c_bpartner', 'ad_user', 's_resource', 's_resourceassignment', 's_resourceunavailable', 'hr_employee', 'hr_movement', 'c_subscription'];
function uuOf(t) { return cp.execFileSync('sqlite3', [path.join(ROOT, 'ad_seed.db'), "SELECT name FROM pragma_table_info('" + t + "') WHERE lower(name) LIKE '%\\_uu' ESCAPE '\\'"], { encoding: 'utf8' }).trim().split('\n')[0]; }
var RAW = {}; CLUSTER.forEach(function (t) { RAW[t] = Number(cp.execFileSync('sqlite3', [path.join(ROOT, 'ad_seed.db'), 'SELECT COUNT(*) FROM ' + t + " WHERE " + uuOf(t) + " LIKE 'hba-%'"], { encoding: 'utf8' }).trim()); });
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream' };
var server = http.createServer(function (req, rsp) {
  var rel = decodeURIComponent(req.url.split('?')[0]), f = path.join(ROOT, rel);
  if (!fs.existsSync(f) && /^\/common\//.test(rel)) f = path.join(ROOT, '..', rel);
  fs.readFile(f, function (e, buf) { if (e) { rsp.writeHead(404); return rsp.end('404'); }
    if (process.env.HBA_DROP && /hba_demo\.mjs$/.test(f)) { var tx = String(buf), at = tx.indexOf('"table": "hr_movement"'); buf = Buffer.from(tx.slice(0, at) + tx.slice(at).replace(/("c_bpartner_id":\s*)1001/, '$11999'), 'utf8'); }   // falsifier: a movement points at a partner the plugin does not carry -> P2c
    rsp.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); rsp.end(buf); });
});
function counts() {   // in-page
  function one(sql) { try { var r = window.__idmpDb.exec(sql); return r.length ? r[0].values[0][0] : null; } catch (e) { return 'ERR:' + e.message; } }
  var out = { gw: one('SELECT COUNT(*) FROM c_bpartner WHERE ad_client_id=11'), t: {} };
  ['c_bpartner', 'ad_user', 's_resource', 's_resourceassignment', 's_resourceunavailable', 'hr_employee', 'hr_movement', 'c_subscription'].forEach(function (t) {
    var u = window.__idmpDb.exec("SELECT name FROM pragma_table_info('" + t + "') WHERE lower(name) LIKE '%\\_uu' ESCAPE '\\'")[0].values[0][0];
    out.t[t] = one("SELECT COUNT(*) FROM " + t + " WHERE " + u + " LIKE 'hba-%'"); });
  out.values = window.__idmpDb.exec("SELECT value FROM c_bpartner WHERE c_bpartner_uu LIKE 'hba-%' ORDER BY value")[0] ? window.__idmpDb.exec("SELECT value FROM c_bpartner WHERE c_bpartner_uu LIKE 'hba-%' ORDER BY value")[0].values.map(function (v) { return v[0]; }) : [];
  out.fk = {
    empBp: one("SELECT COUNT(*) FROM hr_employee e WHERE e.c_bpartner_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM c_bpartner b WHERE b.c_bpartner_id=e.c_bpartner_id)"),
    movBp: one("SELECT COUNT(*) FROM hr_movement m WHERE m.c_bpartner_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM c_bpartner b WHERE b.c_bpartner_id=m.c_bpartner_id)"),
    subBp: one("SELECT COUNT(*) FROM c_subscription s WHERE s.c_bpartner_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM c_bpartner b WHERE b.c_bpartner_id=s.c_bpartner_id)"),
    userBp: one("SELECT COUNT(*) FROM ad_user u WHERE u.c_bpartner_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM c_bpartner b WHERE b.c_bpartner_id=u.c_bpartner_id)"),
    resUser: one("SELECT COUNT(*) FROM s_resource r WHERE r.ad_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ad_user u WHERE u.ad_user_id=r.ad_user_id)"),
    asgRes: one("SELECT COUNT(*) FROM s_resourceassignment a WHERE NOT EXISTS (SELECT 1 FROM s_resource r WHERE r.s_resource_id=a.s_resource_id)"),
    unavRes: one("SELECT COUNT(*) FROM s_resourceunavailable a WHERE a.s_resource_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM s_resource r WHERE r.s_resource_id=a.s_resource_id)") };
  return out;
}
function check(id, ok, msg, ev) { res.push(ok === null ? null : !!ok); console.log('§HBASEED ' + id + ' ' + (ok === null ? 'INCONCLUSIVE' : ok ? 'PASS' : 'FAIL') + ' ' + msg + ' :: ' + J(ev)); }
(async function () {
  await new Promise(function (r) { server.listen(0, r); });
  var base = 'http://localhost:' + server.address().port, browser = await chromium.launch({ args: ['--no-sandbox'] }), page = await browser.newPage();
  var errs = []; page.on('pageerror', function (e) { errs.push(String(e)); }); page.on('console', function (m) { var t = m.text(); if (/§HBA|§PLUGIN-BOOT|§PLUGIN-BUILTIN.*hba/.test(t)) console.log('   ' + t); });
  var boot = async function () { await page.goto(base + '/idempiere.html', { waitUntil: 'networkidle' }); await page.waitForFunction(function () { return !!window.__idmpDb && !!window.PluginEngine && window.PluginEngine._reg; }, null, { timeout: 40000 }); await page.waitForTimeout(1500); };
  await page.goto(base + '/idempiere.html', { waitUntil: 'networkidle' });
  await page.evaluate(function () { return new Promise(function (r) { var q = indexedDB.deleteDatabase('erp_cache'); q.onsuccess = q.onerror = q.onblocked = function () { r(); }; }); });
  await boot();
  console.log('§HBASEED RAW seed cluster counts (expected) ' + J(RAW) + ' legacy GW BPartners ' + LEGACY_GW_BP);
  var total = CLUSTER.reduce(function (s, t) { return s + RAW[t]; }, 0);
  if (!total) { check('P0', null, 'the raw seed holds no HBA rows - nothing to compare', RAW); console.log('§HBASEED-VERDICT INCONCLUSIVE judged=0'); process.exit(1); }
  var c1 = await page.evaluate(counts);
  check('P1', c1.gw === LEGACY_GW_BP && CLUSTER.every(function (t) { return c1.t[t] === 0; }), 'base page: GardenWorld C_BPartner == legacy 18 and the HBA cluster rows are absent', { gw: c1.gw, cluster: c1.t });
  var inst = await page.evaluate(async function (u) { var r = window.PluginEngine._reg(); var has = r.get && r.get('org.kernel.hba.demo'); var seen = !!has; if (!has) await r.system.installBundle(u); var st0 = r.get('org.kernel.hba.demo'); return { preinstalled: seen, state0: st0 && st0.state }; }, base + '/plugins/hba_demo.mjs');
  check('P1b', inst.state0 !== 'ACTIVE', 'the plugin is installed and NOT started by default (state ' + inst.state0 + ', preinstalled by the builtin pass=' + inst.preinstalled + ')', inst);
  var st = await page.evaluate(async function () { var r = window.PluginEngine._reg(); var b = await r.system.startBundle('org.kernel.hba.demo'); return b && b.state; });
  var c2 = await page.evaluate(counts), codes = ['BP-OWN-1', 'BP-TEN-1', 'BP-TEN-5', 'BP-TEN-6', 'EMP001', 'EMP002'];
  check('P2a', st === 'ACTIVE' && CLUSTER.every(function (t) { return c2.t[t] === RAW[t]; }), 'started: every cluster table holds exactly the raw seed count', { state: st, got: c2.t, want: RAW });
  check('P2b', J(c2.values) === J(codes) && c2.gw === LEGACY_GW_BP + 6, 'the 6 partners are present by Value and GardenWorld = 18 + 6', { values: c2.values, gw: c2.gw });
  check('P2c', Object.keys(c2.fk).every(function (k) { return c2.fk[k] === 0; }), 'every foreign key of the cluster resolves (no dangling partner / user / resource)', c2.fk);
  await page.evaluate(async function () { await window.PluginEngine.persist(); });
  await boot();
  var c4 = await page.evaluate(counts);
  check('P4', CLUSTER.every(function (t) { return c4.t[t] === RAW[t]; }) && c4.gw === LEGACY_GW_BP + 6, 'persisted start: after a reload the plugin restores the rows (overlay removed the baked copies first)', { gw: c4.gw, t: c4.t });
  var c3 = await page.evaluate(async function () { var r = window.PluginEngine._reg(); await r.system.stopBundle('org.kernel.hba.demo'); await window.PluginEngine.persist(); return null; }).then(function () { return page.evaluate(counts); });
  check('P3', c3.gw === LEGACY_GW_BP && CLUSTER.every(function (t) { return c3.t[t] === 0; }), 'Stop: back to legacy 18, cluster rows removed', { gw: c3.gw, t: c3.t });
  await boot(); var c5 = await page.evaluate(counts);
  check('P3b', c5.gw === LEGACY_GW_BP && CLUSTER.every(function (t) { return c5.t[t] === 0; }), 'stopped plugin stays out after a reload', { gw: c5.gw });
  var gen; try { gen = cp.execFileSync('node', [path.join(ROOT, 'tools', 'gen_hba_demo_plugin.js'), '--check'], { encoding: 'utf8' }); } catch (e) { gen = String(e.stdout || e.message); }
  check('P5', /SAME/.test(gen) || /keeping the committed/.test(gen), 'the committed plugin equals what the seed yields', gen.trim());
  check('P6', errs.length === 0, 'no page errors', errs.slice(0, 2));
  var judged = res.filter(function (x) { return x !== null; }).length, failed = res.filter(function (x) { return x === false; }).length;
  console.log('§HBASEED-VERDICT ' + (judged === 0 ? 'INCONCLUSIVE' : failed ? 'FAIL' : 'PASS') + ' judged=' + judged + ' failed=' + failed);
  await browser.close(); server.close(); process.exit(failed || !judged ? 1 : 0);
})().catch(function (e) { console.log('§HBASEED-VERDICT FAIL judged=0 error=' + (e && e.message)); try { server.close(); } catch (x) {} process.exit(1); });
