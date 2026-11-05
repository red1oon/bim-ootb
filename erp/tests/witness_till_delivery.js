#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// CHANGED BY DESIGN 2026-11-04 (prompts §26): the till no longer delivers to head office; D2/D3 now prove that, the delivery proofs moved to witness_eoda.js / witness_eoda_close.js.
// ⚠ DO NOT REMOVE — W-TILL-OFFLINE, the VISIT-DELIVERY half (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §17.5; slice 1 left it INCONCLUSIVE, §16). READ THE LOG after every run: every verdict is a § line, the exit code is not the evidence.
// THE ISSUE: tickets rung while the till has no network must reach head office at the NEXT Visit, each ticket key once (none lost, none doubled, a second Visit adds 0), and head office's "Import POS Sales" must make exactly ONE order per key.
// HARNESS (copied from erp/tests/witness_mf_seed.js, which owns it): two real devices, headless Chromium, one dumb folder pipe, signed plans:
//   head office  = erp/idempiere.html?login=GardenAdmin&team=1&teamplan=pos   (the founder of the team; Import POS Sales runs on its replica in the node kernel below)
//   the till     = erp/till.html (a thin page over its own engine frame, role 50004 Web Service Execution, Bound to = its branch Org, as W-TEAM-UI-POS U2)
// Every other host is aborted and counted (no live network). OFFLINE = the browser context's network is cut (pipe included), not a flag.
// §D0 setup   §D1 offline: 2 tickets on the device, a Visit attempt delivers nothing   §D2 online Visit: HQ holds each key once with its lines and tenders   §D3 a second Visit adds 0   §D4 a key that went out is no longer editable on the till
// §D5 head office Import POS Sales on HQ's own delivered rows: ONE order per key, a second run adds 0   §D6 0 page errors   §MUT delivery mutants (a copy, proven applied once; a crash is not a kill): TILL_DELIV_MUT=<name>
// Run: node erp/tests/witness_till_delivery.js 2>&1 | tee /tmp/till_logs/s2_delivery.log
'use strict';
var path = require('path'), http = require('http'), fs = require('fs'), os = require('os'), vm = require('vm'), url = require('url'), nodeCrypto = require('crypto');
var ROOT = path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css' };
var SQLJS_DIR = process.env.SQLJS_DIR || '/home/red1/bim-ootb/tests/node_modules/sql.js';
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var subtle = nodeCrypto.webcrypto.subtle, J = JSON.stringify, sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
var judged = 0, failed = 0, errors = [], MUTNAME = process.env.TILL_DELIV_MUT || '';
function check(key, ok, label, info) { judged++; if (!ok) failed++; console.log('  §TILL_DELIV_CHECK key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' ' + label + (ok ? '' : ' got=' + J(info).slice(0, 400))); return ok; }
function walk(d, rel, out) { if (!fs.existsSync(d)) return out; fs.readdirSync(d).forEach(function (n) { var p = path.join(d, n), r = rel ? rel + '/' + n : n; if (fs.statSync(p).isDirectory()) walk(p, r, out); else out.push(r); }); return out; }
function canon(o) { if (o === null || typeof o !== 'object') return J(o); if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']'; return '{' + Object.keys(o).sort().map(function (k) { return J(k) + ':' + canon(o[k]); }).join(',') + '}'; }
async function mkKey() { var kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']), j = await subtle.exportKey('jwk', kp.publicKey); return { priv: kp.privateKey, pub: { kty: j.kty, crv: j.crv, x: j.x, y: j.y } }; }
async function signObj(obj, key) { var b = JSON.parse(J(obj)); delete b.sig; delete b.signer; var s = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.priv, new TextEncoder().encode(canon(b))); var o = JSON.parse(J(b)); o.signer = key.pub; o.sig = Buffer.from(s).toString('hex'); return o; }
function loadPlan(file, g) { var o = {}; vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window: o, globalThis: o }); return o[g]; }
var planJs = function (name, o) { return '(function (g) { g.' + name + ' = ' + J(o) + '; })(typeof window !== \'undefined\' ? window : globalThis);\n'; };

// the node kernel (witness_till.js nodeHead): the shipped pos-integration bundle on a seed replica
async function nodeHead(taxRate) {
  if (!global.window) global.window = {}; if (!global.crypto || !global.crypto.subtle) global.crypto = nodeCrypto.webcrypto;
  if (!process.env.SQLJS) process.env.SQLJS = SQLJS_DIR;
  var initSqlJs = require(SQLJS_DIR), SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIR, 'dist', f); } });
  var ERP = path.join(ROOT, 'erp'), db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); } catch (e) { /* as the loader */ } });
  var rq = function (n) { return require(path.join(ERP, n)); };
  rq('ad_import_tables.js').ensure(db); try { rq('ad_rule.js').ensure(db); } catch (e) { /* idem */ }
  db.run('UPDATE c_tax SET rate=? WHERE c_tax_id=104', [taxRate]);
  function q0(sql, params) { var st = db.prepare(sql), out = []; try { if (params && params.length) st.bind(params); while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } } finally { st.free(); } return out; }
  var K = rq('ws_kernel.js'), k = K.build(db), ML = k.ML, AP = rq('ad_process.js'), PR = rq('plugin_registry.js');
  var S0 = { clientId: 11, orgId: 11, userId: 100, roleId: 102, warehouseId: 103, actor: 'witness:till-delivery' };
  function commit(fn, meta) { var trx = new ML.Trx(k.q, k.env(S0)), r; try { r = fn(trx, ML) || { ok: true }; } catch (ex) { r = { ok: false, error: 'model threw: ' + (ex && ex.message) }; }
    var ok = r.ok !== false, ops = ok ? trx.groupOps() : [], ids = []; if (ok && ops.length) ids = k.commit(S0, ops, meta); return Object.assign({}, r, { ok: ok, ops: ops, ids: ids, log: trx.log }); }
  var hostDb = { query: function (sql, p) { return q0(sql, p); }, run: function (sql, p) { db.run(sql, p || []); } };
  var host = { engineVersion: '1.0.0', db: hostDb, ops: { append: function () { return 1; } }, process: AP, docAction: ML, import: function (u) { return import(url.pathToFileURL(path.resolve(path.join(ERP, 'plugins'), u)).href); } };
  var reg = PR.create(host), mod = await import(url.pathToFileURL(path.join(ERP, 'plugins', 'pos_integration.mjs')).href);
  await reg.installBundle(mod); var st = await reg.startBundle('org.kernel.pos-integration');
  return { q0: q0, k: k, ML: ML, AP: AP, commit: commit, started: st && st.state };
}
var DROP = /^(i_order_id|i_payment_id|.*_uu|created|createdby|updated|updatedby|processed|processing|i_errormsg)$/;
function clean(r) { var o = {}; Object.keys(r).forEach(function (c) { if (r[c] != null && !DROP.test(c)) o[c] = r[c]; }); return o; }

(async function main() {
  console.log('═══ W-TILL-OFFLINE delivery — a till offline, tickets arrive at the next Visit once each (prompts §17.5) ═══' + (MUTNAME ? ' MUTANT=' + MUTNAME : ''));
  var POSPLAN = loadPlan(path.join(ROOT, 'erp', 'team_plan_pos.js'), 'TEAM_PLAN_POS'), OFFICE = loadPlan(path.join(ROOT, 'erp', 'team_plan.js'), 'TEAM_PLAN');
  var FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'till-deliv-')), cur = { plans: {}, over: {} };
  if (MUTNAME) { var MUTS = {   /* retired 2026-11-04: its delivery mutants moved with the proofs to witness_eoda.js (till-sends-direct, send-per-ticket) */ }, m = MUTS[MUTNAME]; if (!m) { console.log('§TILL_CRASH unknown mutant'); process.exit(2); }
    var orig = fs.readFileSync(path.join(ROOT, m[0]), 'utf8'); if (orig.split(m[1]).length !== 2) { console.log('§TILL_CRASH MUTATION DID NOT APPLY ' + m[0]); process.exit(2); } cur.over[m[0]] = orig.replace(m[1], function () { return m[2]; }); }
  var relay = { n: 0, put: 0, hubPut: 0 };
  var server = http.createServer(function (req, res) {
    var u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
    if (p.indexOf('/pipe/') === 0) { relay.n++; if (req.method === 'PUT') { relay.put++; if (/\/o\//.test(p) && !/\/m\/b_/.test(p)) relay.hubPut++; } }
    if (p === '/pipe/list') { var pre = u.searchParams.get('prefix') || ''; res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(J(walk(FOLDER, '', []).filter(function (n) { return n.indexOf(pre) === 0; }))); return; }
    if (p.indexOf('/pipe/f/') === 0) { var fp = path.join(FOLDER, p.slice(8)); if (fp.indexOf(FOLDER) !== 0) { res.writeHead(400); res.end(); return; }
      if (req.method === 'PUT') { var ch = []; req.on('data', function (c) { ch.push(c); }); req.on('end', function () { fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, Buffer.concat(ch)); res.writeHead(200); res.end('ok'); }); return; }
      if (!fs.existsSync(fp)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); return; }
    var over = { '/erp/team_plan.js': cur.plans.office, '/erp/team_plan_pos.js': cur.plans.pos }[p] || cur.over[p];
    if (over) { res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(over); return; }
    var f = path.join(ROOT, p === '/' ? '/erp/idempiere.html' : p);
    if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + server.address().port, PIPE = base + '/pipe';
  var browser = await reqPw().chromium.launch({ args: ['--disable-gpu'] });
  if (process.env.TILL_DELIV_PLAN === 'widened') {   // DIAGNOSTIC copy of the plan (the brief forbids changing team_plan_pos.js): ship the columns the till deposits
    var widen = function (flow, cols) { cols.forEach(function (c) { if (flow.ship.indexOf(c[0]) < 0) { flow.ship.push(c[0]); flow.payload.push({ col: c[0], cls: c[1] }); } }); };
    POSPLAN.flows.forEach(function (f) {
      if (f.table === 'I_Order' && f.dir === 'UP') widen(f, [['PriceActual', 'MEASURE'], ['Description', 'TEXT'], ['LineDescription', 'TEXT']]);
      if (f.table === 'I_Payment' && f.dir === 'UP') widen(f, [['DocumentNo', 'TEXT'], ['TenderType', 'TEXT'], ['IsReceipt', 'FLAG'], ['BPartnerValue', 'TEXT'], ['Description', 'TEXT']]);
    });
    console.log('§TILL_DELIV_PLAN widened (diagnostic copy of the POS plan)');
  }
  var owner = await mkKey(); cur.plans.office = planJs('TEAM_PLAN', await signObj(OFFICE, owner)); cur.plans.pos = planJs('TEAM_PLAN_POS', await signObj(POSPLAN, owner));
  var xcfg = encodeURIComponent(Buffer.from(J({ trust: [owner.pub] })).toString('base64')), NET = { aborted: [] };
  async function open(name, urlPath, ready) {
    var ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } }), pg = await ctx.newPage(), logs = [];
    pg.on('console', function (m) { logs.push(m.text()); }); pg.on('pageerror', function (e) { errors.push(name + ': ' + e.message); });
    await ctx.route('**/*', function (route) { var u = new URL(route.request().url()); if (u.hostname === '127.0.0.1') return route.continue(); NET.aborted.push(u.host); return route.abort('blockedbyclient'); });
    await pg.addInitScript(function () { var q = new URLSearchParams(location.search).get('xcfg'); if (q) { var c = JSON.parse(atob(q)); window.TEAM_PLAN_TRUST = c.trust; } });
    await pg.goto(base + urlPath, { waitUntil: 'load' }); await pg.waitForFunction(ready, null, { timeout: 240000 });
    return { name: name, pg: pg, logs: logs, ctx: ctx };
  }
  var qsBase = '&team=1&pipe=' + encodeURIComponent(PIPE) + '&xcfg=' + xcfg;
  var eng = function (d, fn, arg) { return d.pg.evaluate('(function(){ var W = window.Till ? window.Till.engine() : window; return (' + fn.toString() + ')(W, ' + J(arg === undefined ? null : arg) + '); })()'); };
  var T = {
    found: function (d) { return eng(d, function (W) { return W.TeamSync.found(); }); },
    join: function (d, sp) { return eng(d, function (W, s) { return W.TeamSync.join(s); }, sp); },
    kid: function (d) { return eng(d, async function (W) { return (await W.TeamSync.pairState()).device; }); },
    enrolled: function (d) { return eng(d, async function (W) { return (await W.TeamSync.pairState()).enrolled; }); },
    approve: function (a, kid, role, uu) { return eng(a, async function (W, x) { var r = await W.TeamSync.requests(); for (var q of r) if (q.rq.kid === x.kid) { await W.TeamSync.approve(q.rq, x.role, x.uu); return true; } return false; }, { kid: kid, role: role, uu: uu }); },
    visit: function (d) { var done = false; return Promise.race([eng(d, async function (W) { var v = await W.TeamSync.visit(); return v && v.replicaIn; }).then(function (v) { done = true; return v; }), sleep(120000).then(function () { if (!done) console.log('   §TILL_DELIV_STEP visit on ' + d.name + ' did not return in 120 s'); return null; })]); },
    rows: function (d, sql) { return eng(d, function (W, q) { return new Promise(function (res) { W.__crud.modelRun({ table: 'c_order', timing: 'PROCESS', fn: function (trx) { res(trx.q(q)); return { ok: true }; } }, function () {}); }); }, sql); }
  };
  async function visitAll(devs, rounds) { for (var r = 0; r < (rounds || 1); r++) for (var i = 0; i < devs.length; i++) await T.visit(devs[i]); }

  // ═══ §D0 setup
  console.log('§D0 head office A (founder, POS plan) + the till; the till is approved as 50004 Bound to its branch Org');
  var A = await open('A', '/erp/idempiere.html?login=GardenAdmin&window=281' + qsBase + '&teamplan=pos', function () { return window.TeamSync && window.__idmpDb && window.__crud && window.__idmpDb.exec('SELECT count(*) FROM ad_table')[0].values[0][0] > 0 && document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0; });
  await A.pg.evaluate(function () { return window.TeamSync.ready; });
  var C = await open('T', '/erp/till.html?login=50001' + qsBase + '&teamplan=pos', function () { return window.Till && window.Till.ready; });
  var space = await T.found(A), org = (await T.rows(A, 'SELECT ad_org_uu AS uu FROM ad_org WHERE ad_org_id=12'))[0];
  await T.join(C, space);
  for (var k = 0; k < 6; k++) { await T.approve(A, await T.kid(C), 50004, org.uu); await visitAll([C, A]); if (await T.enrolled(C)) break; await sleep(300); }
  await visitAll([C, A], 2);
  var enrolled = await T.enrolled(C);
  check('D0-enrolled', enrolled === true, 'the till is enrolled in the team (role 50004, Bound to Org 12) so its Visit can deliver', enrolled);
  var a0 = (await T.rows(A, 'SELECT (SELECT count(*) FROM i_order) AS o, (SELECT count(*) FROM i_payment) AS p'))[0], c0 = (await T.rows(C, 'SELECT (SELECT count(*) FROM i_order) AS o, (SELECT count(*) FROM i_payment) AS p'))[0];
  check('D0-empty-start', Number(a0.o) === 0 && Number(a0.p) === 0 && Number(c0.o) === 0, 'non-vacuous: head office and the till start with 0 I_Order / 0 I_Payment rows', { a0: a0, c0: c0 });

  // ═══ §D1..§D3 shifts. relay = the pipe requests (list/get/put) the server saw; the owner's rule (2026-11-03): messages are batched, a Visit carries the shift's pending rows, central usage must not grow with the number of tickets
  var pg = C.pg; await pg.click('#u1 .u-user:has-text("GardenAdmin")'); await pg.click('#u2 [data-panel="Sales"]');
  async function clickProduct(pid) { async function vis() { return (await pg.$('#products .prod[data-pid="' + pid + '"]')) !== null; } if (await vis()) { await pg.click('#products .prod[data-pid="' + pid + '"]'); return true; }
    var cats = await pg.$$eval('#cats [data-cat]', function (b) { return b.map(function (x) { return x.getAttribute('data-cat'); }); });
    for (var c of cats) { await pg.click('#cats [data-cat="' + c + '"]'); if (await vis()) { await pg.click('#products .prod[data-pid="' + pid + '"]'); return true; } if (await pg.$('#cats [data-cat-up]')) await pg.click('#cats [data-cat-up]'); } return false; }
  async function payCash() { var tot = await pg.$eval('#t-tot', function (e) { return e.textContent; }); await pg.click('#east .key[data-key="="]'); await pg.waitForSelector('#u8.on'); await pg.click('#tabs [data-tab="cash"]'); await pg.fill('#tender-amount', tot); await pg.click('#pay-ok'); await pg.waitForSelector('#u9.on', { timeout: 20000 });
    var key = await pg.$eval('#receipt .rf[data-f="Receipt"]', function (e) { return e.getAttribute('data-v'); }); await pg.click('#rc-ok'); return key; }
  var keys = [], shape = {};
  async function ringShift(n) { var ks = []; for (var i = 0; i < n; i++) { await clickProduct(128); if (i % 2 === 0) await clickProduct(129); var k = await payCash(); ks.push(k); shape[k] = { lines: i % 2 === 0 ? 2 : 1, tenders: 1 }; keys.push(k); } return ks; }
  async function tillVisit() { var r0 = relay.n, p0 = relay.put, h0 = relay.hubPut; await pg.evaluate(function () { return window.Till.visit(); }); relay.tillHub = (relay.tillHub || 0) + relay.hubPut - h0; return { n: relay.n - r0, put: relay.put - p0 }; }
  var counts = {};
  console.log('§D1 the till is offline and rings a shift of 2 tickets');
  await C.ctx.setOffline(true);
  var k2 = await ringShift(2), onl = await pg.evaluate(function () { return navigator.onLine; });
  var localO = Number((await T.rows(C, 'SELECT count(*) AS n FROM i_order'))[0].n);
  check('D1-offline-and-local', onl === false && localO === 3 && k2.length === 2 && k2[0] !== k2[1], 'offline (navigator.onLine false); 2 tickets under 2 keys are on the device (3 I_Order rows)', { onl: onl, localO: localO, keys: k2 });
  var vOff = await tillVisit();
  var aMid = Number((await T.rows(A, 'SELECT count(*) AS n FROM i_order'))[0].n), sentOff = await pg.evaluate(function () { return Object.keys(window.Till.state().store.sent || {}).length; });
  check('D1-nothing-delivered-offline', aMid === 0 && sentOff === 0, 'while the till is offline a Visit delivers nothing (head office 0 I_Order rows) and the till does NOT mark the keys as sent', { aMid: aMid, sentOff: sentOff });

  console.log('§D2 the network returns; ONE Visit delivers the shift');
  await C.ctx.setOffline(false); counts[2] = await tillVisit(); await visitAll([A, C, A], 1);
  console.log('§D2b a second shift of 5 tickets, rung offline, ONE Visit');
  await C.ctx.setOffline(true); var k5 = await ringShift(5); await C.ctx.setOffline(false); counts[5] = await tillVisit(); await visitAll([A, C, A], 1);
  console.log('§D2c a shift of 3 tickets rung ONLINE: no relay request while ringing, then ONE Visit');
  var rr0 = relay.n; var k3 = await ringShift(3); var ringing = relay.n - rr0; await sleep(1500); ringing = relay.n - rr0; counts[3] = await tillVisit(); await visitAll([A, C, A], 1);
  console.log('§TILL_RELAY ring_online_3_tickets_requests=' + ringing + ' | one Visit after 2 tickets: requests=' + counts[2].n + ' (put ' + counts[2].put + ') | after 5 tickets: requests=' + counts[5].n + ' (put ' + counts[5].put + ') | after 3 tickets: requests=' + counts[3].n + ' (put ' + counts[3].put + ')');
  check('D2-relay-no-visit-per-ticket', ringing === 0, 'ringing 3 tickets while ONLINE makes 0 relay requests: the till does not Visit per ticket (measured ' + ringing + ')', ringing);
  check('D2-relay-not-growing-with-N', counts[5].n <= counts[2].n && counts[3].n <= counts[2].n, 'the relay requests of ONE Visit do not grow with the number of tickets: 2 tickets -> ' + counts[2].n + ', 5 tickets -> ' + counts[5].n + ', 3 tickets -> ' + counts[3].n, counts);
  // CHANGED BY DESIGN (POS_PLUGIN_LOCAL_FIRST.md §26, branch POS admin + EODA): a till no longer delivers its tickets to head office, at a Visit or at Close Cash. It holds i_order / i_payment
  //   (TeamSync.hold) and hands a CLOSED shift to its branch POS admin on the branch lane; the admin makes the ONE send. What this file proved before (each key once, price intact, a second Visit adds 0,
  //   Import POS Sales one order per key) is now proved on the admin's send by witness_eoda.js (W-EODA-AGG) and witness_eoda_close.js (W-DAYCLOSE-EODA). Here the same shifts prove the NEW till contract.
  var ao = Number((await T.rows(A, 'SELECT count(*) AS n FROM i_order'))[0].n), ap = Number((await T.rows(A, 'SELECT count(*) AS n FROM i_payment'))[0].n);
  check('D2-till-visits-deliver-nothing-to-hq', ao === 0 && ap === 0, 'after 3 Visits of the till (2, 5 and 3 tickets on the device) head office holds 0 I_Order and 0 I_Payment rows: a till never sends tickets to head office (measured ' + ao + ' / ' + ap + ')', { ao: ao, ap: ap });
  var tillRows = Number((await T.rows(C, 'SELECT count(*) AS n FROM i_order'))[0].n), sent = await pg.evaluate(function () { return Object.keys(window.Till.state().store.sent || {}).length; });
  check('D2-till-keeps-its-rows-and-marks-nothing', tillRows >= 16 && sent === 0, 'non-vacuous: the till still holds its ' + tillRows + ' I_Order rows and, its shift being open, marks 0 keys as handed (' + sent + ')', { tillRows: tillRows, sent: sent });
  var hub = relay.tillHub || 0;
  check('D3-no-hub-data-written', hub === 0, 'no op bundle was written outside the branch lane during the Visits of the till (hub-lane op-bundle puts ' + hub + ')', hub);
  check('D6-page-errors', errors.length === 0, '0 page errors on head office and the till', errors.slice(0, 3));
  check('D6-no-live-network', NET.aborted.filter(function (h) { return h !== 'www.idempiere.org'; }).length === 0, 'no request left 127.0.0.1 (aborted hosts: ' + J(NET.aborted.slice(0, 3)) + ')', NET.aborted.slice(0, 5));
  await browser.close(); server.close();
  var v = !judged ? 'INCONCLUSIVE' : failed ? 'FAIL' : 'PASS';
  console.log('§TILL_DELIVERY_VERDICT W-TILL-OFFLINE (Visit delivery) verdict=' + v + ' judged=' + judged + ' failed=' + failed + (MUTNAME ? ' mutant=' + MUTNAME : ''));
  process.exit(failed ? 1 : 0);
})().catch(function (e) { console.log('§TILL_CRASH ' + (e && e.stack || e)); process.exit(3); });
