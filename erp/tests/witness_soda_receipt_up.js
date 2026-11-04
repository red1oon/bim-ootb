#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-SODA-RECEIVE / W-SODA-UPDOWN / W-SODA-EODA-CARRY: the receipt UP on REAL devices (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §28.2). READ THE LOG after every run: every verdict is a § line; the exit code is not the evidence.
//   An empty population prints INCONCLUSIVE; a mutant is a COPY served by the harness, proven applied exactly once; a crash is not a kill. Logs /tmp/soda2_logs/.
// HARNESS (copied from erp/tests/witness_eoda.js): head office A (founder), the branch POS admin D (erp/branch_admin.html), tills T1 T2 T3 (erp/till.html), signed POS plan, ONE dumb folder pipe; every request is attributed to its device.
// WHAT IS REAL: HQ's movement is a real draft MMM made by the model layer's Prepare/Complete (the in-transit doctype creates the confirm), shipped DOWN by the plan (S3-S5, F2); the branch admin's Receive stock + EODA send; the UP of
//   the confirm's own rows (S6/S7) inside that ONE send; HQ's replica step (MMovementConfirm applyIt) completing the movement, the difference documents and the storage at both warehouses; the E3 refusal of a non-executor's UP.
// WHAT IS SIMULATED (named): the non-executor is a device enrolled with role 103 that AUTHORS the hostile op directly on its comm store (a conforming client would keep it local, translate says not-declared-for-role).
// Arms: SODA2_ARMS=receive,updown.  Mutant: SODA2_MUT=<name>.  Run: node erp/tests/witness_soda_receipt_up.js 2>&1 | tee /tmp/soda2_logs/receipt_up.log
'use strict';
var path = require('path'), http = require('http'), fs = require('fs'), os = require('os'), vm = require('vm'), nodeCrypto = require('crypto'), cp = require('child_process');
var ROOT = process.env.SODA_ROOT || path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var subtle = nodeCrypto.webcrypto.subtle, J = JSON.stringify, sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
var ARMS = (process.env.SODA2_ARMS || 'receive,updown').split(','), MUTNAME = process.env.SODA2_MUT || '', LOGS = process.env.SODA2_LOGS || '/tmp/soda2_logs';
var V = { receive: { judged: 0, failed: 0 }, updown: { judged: 0, failed: 0 } }, errors = [], ARM = 'receive';
function check(key, ok, label, info) { var v = V[ARM]; v.judged++; if (!ok) v.failed++; console.log('  §SODA2_CHECK arm=' + ARM + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' ' + label + (ok ? '' : ' got=' + J(info).slice(0, 600))); return ok; }
function walk(d, rel, out) { if (!fs.existsSync(d)) return out; fs.readdirSync(d).forEach(function (n) { var p = path.join(d, n), r = rel ? rel + '/' + n : n; if (fs.statSync(p).isDirectory()) walk(p, r, out); else out.push(r); }); return out; }
function canon(o) { if (o === null || typeof o !== 'object') return J(o); if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']'; return '{' + Object.keys(o).sort().map(function (k) { return J(k) + ':' + canon(o[k]); }).join(',') + '}'; }
async function mkKey() { var kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']), j = await subtle.exportKey('jwk', kp.publicKey); return { priv: kp.privateKey, pub: { kty: j.kty, crv: j.crv, x: j.x, y: j.y } }; }
async function signObj(obj, key) { var b = JSON.parse(J(obj)); delete b.sig; delete b.signer; var s = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.priv, new TextEncoder().encode(canon(b))); var o = JSON.parse(J(b)); o.signer = key.pub; o.sig = Buffer.from(s).toString('hex'); return o; }
function loadPlan(file, g) { var o = {}; vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window: o, globalThis: o }); return o[g]; }
var planJs = function (name, o) { return '(function (g) { g.' + name + ' = ' + J(o) + '; })(typeof window !== \'undefined\' ? window : globalThis);\n'; };
var money = function (c) { return (Number(c) / 100).toFixed(2); }, toCents = function (s) { return Math.round(Number(s) * 100); };

var MUTS = {   // [file, anchor (exactly once), replacement, arm that must go red]
  'admission-off': ['/common/comm/team_scope.js', "if (ar !== hubR) return { ok: false, why: 'not-executor' };", "if (false) return { ok: false, why: 'not-executor' };", 'updown'],
  'confirm-own-send': ['/erp/branch_admin.js', "saveSet(); msg(n + ' movement(s) received;", "saveSet(); if (n) { var mo = []; for (var qi = 0; qi < S.set.receipts.length; qi++) { if (!S.set.receipts[qi].sent) { (await receiptOps(S.set.receipts[qi])).forEach(function (o) { mo.push(o); }); S.set.receipts[qi].sent = true; } } await depositGroup(mo); await E.TeamSync.visit(); } msg(n + ' movement(s) received;", 'receive'],
  'apply-off': ['/erp/model_movement.js', "if (!trx || !cf || !iAmProcessor()) return null;", "return null;", 'receive'],
  'apply-ignores-scrap': ['/erp/model_movement.js', "if (scr.signum() !== 0) {   ", "if (false) {   ", 'receive']
};

(async function main() {
  console.log('═══ W-SODA-RECEIVE/UPDOWN/CARRY — the receipt UP on real devices (prompts/POS_PLUGIN_LOCAL_FIRST.md §28.2) ═══ arms=' + ARMS.join(',') + (MUTNAME ? ' MUTANT=' + MUTNAME : ''));
  fs.mkdirSync(LOGS, { recursive: true });
  var POSPLAN = loadPlan(path.join(ROOT, 'erp', 'team_plan_pos.js'), 'TEAM_PLAN_POS'), OFFICE = loadPlan(path.join(ROOT, 'erp', 'team_plan.js'), 'TEAM_PLAN');
  var FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'eoda-')), cur = { plans: {}, over: {} };
  
  if (MUTNAME) { var m = MUTS[MUTNAME]; if (!m) { console.log('§SODA2_CRASH unknown mutant'); process.exit(2); }
    var orig = fs.readFileSync(path.join(ROOT, m[0]), 'utf8'); if (orig.split(m[1]).length !== 2) { console.log('§SODA2_CRASH MUTATION DID NOT APPLY exactly once ' + m[0]); process.exit(2); }
    cur.over[m[0]] = orig.replace(m[1], function () { return m[2]; }); console.log('§SODA2_MUTANT applied ' + MUTNAME + ' in ' + m[0] + ' (anchor found exactly once)'); ARMS = [m[3]]; }
  var REQ = [];
  var server = http.createServer(function (req, res) {
    var u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
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
  var owner = await mkKey(); cur.plans.office = planJs('TEAM_PLAN', await signObj(OFFICE, owner)); cur.plans.pos = planJs('TEAM_PLAN_POS', await signObj(POSPLAN, owner));
  var xcfg = encodeURIComponent(Buffer.from(J({ trust: [owner.pub] })).toString('base64')), NET = { aborted: [] };
  async function open(name, urlPath, ready) {
    var ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } }), pg = await ctx.newPage(), logs = [];
    pg.on('console', function (m) { var t = m.text(); logs.push(t); if (/^§(SODA|EODA|TEAM_HELD|TEAM_HOLD|TEAM_VISIT|TEAM_THIN|TEAM_OUT|TEAM_LOCALONLY|TEAM_NOT_DECLARED|TEAM_REPLICA|MV-TIP-SHADOW|BUS_REPLICA)|🔴/.test(t)) console.log('   [' + name + '] ' + t.slice(0, 300)); });
    pg.on('pageerror', function (e) { errors.push(name + ': ' + e.message); });
    await ctx.route('**/*', function (route) { var u = new URL(route.request().url()); if (u.hostname !== '127.0.0.1') { NET.aborted.push(u.host); return route.abort('blockedbyclient'); }
      if (u.pathname.indexOf('/pipe/') === 0) REQ.push({ dev: name, m: route.request().method(), p: u.pathname, q: u.searchParams.get('prefix') || '' }); return route.continue(); });
    await pg.addInitScript(function () { var q = new URLSearchParams(location.search).get('xcfg'); if (q) { var c = JSON.parse(atob(q)); window.TEAM_PLAN_TRUST = c.trust; } });
    await pg.goto(base + urlPath, { waitUntil: 'load' }); await pg.waitForFunction(ready, null, { timeout: 240000 });
    return { name: name, pg: pg, logs: logs, ctx: ctx };
  }
  var qsBase = '&team=1&pipe=' + encodeURIComponent(PIPE) + '&xcfg=' + xcfg + '&teamplan=pos&poll=3600';
  var eng = function (d, fn, arg) { return d.pg.evaluate('(function(){ var W = window.Till ? window.Till.engine() : window.BranchAdmin ? window.BranchAdmin.engine() : window; return (' + fn.toString() + ')(W, ' + J(arg === undefined ? null : arg) + '); })()'); };
  var T = {
    found: function (d) { return eng(d, function (W) { return W.TeamSync.found(); }); }, join: function (d, sp) { return eng(d, function (W, s) { return W.TeamSync.join(s); }, sp); },
    kid: function (d) { return eng(d, async function (W) { return (await W.TeamSync.pairState()).device; }); }, enrolled: function (d) { return eng(d, async function (W) { return (await W.TeamSync.pairState()).enrolled; }); },
    approve: function (a, kid, role, uu) { return eng(a, async function (W, x) { var r = await W.TeamSync.requests(); for (var q of r) if (q.rq.kid === x.kid) { await W.TeamSync.approve(q.rq, x.role, x.uu); return true; } return false; }, { kid: kid, role: role, uu: uu }); },
    visit: function (d) { var done = false; return Promise.race([eng(d, async function (W) { var v = await W.TeamSync.visit(); return v && v.replicaIn; }).then(function (v) { done = true; return v; }), sleep(120000).then(function () { if (!done) console.log('   §EODA_STEP visit on ' + d.name + ' did not return in 120 s'); return null; })]); },
    rows: function (d, sql) { return eng(d, function (W, q) { return new Promise(function (res) { W.__crud.modelRun({ table: 'c_order', timing: 'PROCESS', fn: function (trx) { try { res(trx.q(q)); } catch (e) { res({ error: String(e && e.message) }); } return { ok: true }; } }, function () {}); }); }, sql); }
  };
  async function visitAll(devs, rounds) { for (var r = 0; r < (rounds || 1); r++) for (var i = 0; i < devs.length; i++) await T.visit(devs[i]); }
  var mark = function () { return REQ.length; }, since = function (mk) { return REQ.slice(mk); };
  // lanes of a PUT: 'branch' = the branch box m/b_<org>/ (head office never reads it); 'hub' = an op bundle (/o/) outside it = DATA head office reads; 'house' = heartbeat / frontier / receipt files (h, f, r), carry no ticket
  var lane = function (r) { return /\/m\/b_/.test(r.p + r.q) ? 'branch' : /\/o\//.test(r.p + r.q) ? 'hub' : 'house'; };
  var puts = function (arr, dev, ln) { return arr.filter(function (r) { return r.m === 'PUT' && (!dev || r.dev === dev) && (!ln || lane(r) === ln); }).length; };


  // ═══ setup: head office A, the branch POS admin D, one till T1, and X (a device that is neither the hub nor the branch role)
  console.log('§E0 setup: head office A (founder, POS plan, role 102), the branch POS admin D and a till T1 (role 50004, Bound to the branch Org 12), X (role 103)');
  var A = await open('A', '/erp/idempiere.html?login=GardenAdmin&window=281' + qsBase, function () { return window.TeamSync && window.__idmpDb && window.__crud && window.__idmpDb.exec('SELECT count(*) FROM ad_table')[0].values[0][0] > 0 && document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0; });
  await A.pg.evaluate(function () { return window.TeamSync.ready; });
  var D = await open('D', '/erp/branch_admin.html?login=50001' + qsBase, function () { return window.BranchAdmin && window.BranchAdmin.ready; }).catch(function (e) { console.log('§SODA2_PAGE branch_admin.html did not boot: ' + String(e && e.message).slice(0, 160)); return null; });
  var T1 = await open('T1', '/erp/till.html?login=50001' + qsBase, function () { return window.Till && window.Till.ready; }).catch(function (e) { console.log('§SODA2_PAGE till did not boot: ' + String(e && e.message).slice(0, 160)); return null; });
  var X = await open('X', '/erp/till.html?login=102' + qsBase, function () { return window.Till && window.Till.ready; }).catch(function (e) { console.log('§SODA2_PAGE X did not boot: ' + String(e && e.message).slice(0, 160)); return null; });
  var TL = [T1], setupOk = !!(D && T1 && X);
  if (!setupOk) { ARMS.forEach(function (a) { ARM = a; check('e0-devices-boot', false, 'the admin, a till and X boot', { admin: !!D, till: !!T1, x: !!X }); }); }
  var space = await T.found(A), org = (await T.rows(A, 'SELECT ad_org_uu AS uu FROM ad_org WHERE ad_org_id=12'))[0];
  var devs = setupOk ? [D, T1, X] : [], roleOf = { D: 50004, T1: 50004, X: 103 };
  for (var d of devs) await T.join(d, space);
  for (var k = 0; k < 10 && setupOk; k++) { for (var d of devs) await T.approve(A, await T.kid(d), roleOf[d.name], d.name === 'X' ? null : org.uu); await visitAll(devs.concat([A])); var en = []; for (var d of devs) en.push(await T.enrolled(d)); if (en.every(Boolean)) break; await sleep(300); }
  if (setupOk) await visitAll(devs.concat([A]), 2);
  var tillKeys = [], pgs = [T1 && T1.pg];
  if (setupOk) {
    var enr = []; for (var d of devs) enr.push(await T.enrolled(d)); ARM = ARMS[0];
    check('e0-enrolled', enr.every(Boolean), 'the admin, the till and X are enrolled (50004, 50004, 103)', enr);
    tillKeys.push(await T1.pg.evaluate(function () { return window.Till.state().cfg.tillKey; }));
  }
  // ── till helpers (the delivery witness' UI path)
  async function clickProduct(pg, pid) { async function vis() { return (await pg.$('#products .prod[data-pid="' + pid + '"]')) !== null; } if (await vis()) { await pg.click('#products .prod[data-pid="' + pid + '"]'); return true; }
    var cats = await pg.$$eval('#cats [data-cat]', function (b) { return b.map(function (x) { return x.getAttribute('data-cat'); }); });
    for (var c of cats) { await pg.click('#cats [data-cat="' + c + '"]'); if (await vis()) { await pg.click('#products .prod[data-pid="' + pid + '"]'); return true; } if (await pg.$('#cats [data-cat-up]')) await pg.click('#cats [data-cat-up]'); } return false; }
  async function pay(pg, tab) { var tot = await pg.$eval('#t-tot', function (e) { return e.textContent; }); await pg.click('#east .key[data-key="="]'); await pg.waitForSelector('#u8.on'); await pg.click('#tabs [data-tab="' + tab + '"]'); await pg.fill('#tender-amount', tot); await pg.click('#pay-ok'); await pg.waitForSelector('#u9.on', { timeout: 20000 });
    var key = await pg.$eval('#receipt .rf[data-f="Receipt"]', function (e) { return e.textContent.split('  ')[1]; }); await pg.click('#rc-ok'); return key; }
  var rung = [[], [], []], SHAPE = {};
  async function ring(ti, n, bankIdx) { var pg = pgs[ti]; for (var i = 0; i < n; i++) { await clickProduct(pg, 128); if (i % 2 === 0) await clickProduct(pg, 129); var key = await pay(pg, i === bankIdx ? 'bank' : 'cash'); rung[ti].push(key); SHAPE[key] = i % 2 === 0 ? 2 : 1; } }
  async function closeShift(ti) { var pg = pgs[ti], mk = mark(); await pg.evaluate(function () { window.Till.go('close'); }); await sleep(400); await pg.click('#zclose'); await pg.click('#zconfirm'); await pg.waitForFunction(function () { return /Cash Closed OK/.test(document.querySelector('#zdone').textContent); }, null, { timeout: 30000 }); await sleep(1500); return since(mk); }
  function zOf(t) {   // the till's OWN Z line (§TILL_Z, printed by renderClose before the close): the oracle independent of the hand-off rows
    var ci = -1; t.logs.forEach(function (l, i) { if (/^§TILL_CLOSE closed=/.test(l)) ci = i; });
    for (var i = ci; i >= 0; i--) { var mm = /^§TILL_Z seq=(\d+) tickets=(\d+) units=\S+ gross=(\S+) net=(\S+) payments=(\d+) bytender=(\{.*?\}) removed=/.exec(t.logs[i]); if (mm) return { tickets: Number(mm[2]), gross: toCents(mm[3]), net: toCents(mm[4]), tenders: JSON.parse(mm[6]) }; }
    return null; }


  var cr = function (table, f) { return { op_type: 'CRUD_CREATE', key: table, table: table, verb: 'create', fields: f }; };
  var rowsOf = async function (d, sql) { var r = await T.rows(d, sql); return Array.isArray(r) ? r : []; };
  var hqW = function (ops) { return eng(A, function (W, o) { return new Promise(function (res) { var t = setTimeout(function () { res({ committed: false, reason: 'timeout' }); }, 60000); W.__crud.applyOpGroup(o, function (r) { clearTimeout(t); res(r); }); }); }, ops); };
  // HQ runs a DocAction through the model layer (ModelLayer.processIt in a PROCESS model run) and commits what it wrote as one group, as the window's DocAction bar does
  var hqDoc = function (table, id, act) { return eng(A, function (W, x) { return new Promise(function (res) { var out = null;
    W.__crud.modelRun({ table: x.table, timing: 'PROCESS', fn: function (trx) { var r = W.ModelLayer.processIt(trx, x.table, x.id, x.act); out = { ok: !!r.ok, status: r.status, msg: r.msg || trx._msg || null }; return { ok: true }; } }, function (r) {
      if (!r || r.ok === false || !r.ops || !r.ops.length) return res({ out: out, committed: false, err: r && (r.error || r.msg) });
      W.__crud.applyOpGroup(r.ops, function (g) { res({ out: out, committed: !!(g && g.committed), ops: r.ops.length }); }, r.observed); }); }); }, { table: table, id: id, act: act }); };
  if (process.env.SODA2_DEBUG) console.log('§DBG ' + J(await eng(A, function (W) { return { kind: W.TeamScope.kind(), role: W.TeamSync.role(), hub: W.TeamScope.hub(), mv: W.TeamScope.scopeOf('m_movement', 102), mvf: W.TeamScope.hubFlow('m_movement'), cfd: W.TeamScope.dual('m_movementconfirm'), st: W.TeamScope.state() }; })));
  var HQL = 101, STL = 102, HQO = 11, PA = null, STAMP = '2026-11-04 00:00:00';
  var onhand = async function (loc) { return Number((await rowsOf(A, 'SELECT COALESCE(SUM(qtyonhand),0) AS s FROM m_storageonhand WHERE m_locator_id=' + loc + ' AND m_product_id=' + PA))[0].s); };
  var mkMovement = async function (no, qty) {   // a draft MMM for the branch warehouse (what Replenish create makes), then HQ's real Prepare (creates the confirm) and Complete (stays In Progress)
    var base = { ad_client_id: 11, ad_org_id: HQO, isactive: 'Y' };
    var w = await hqW([cr('m_movement', Object.assign({ documentno: no, movementdate: STAMP, c_doctype_id: 143, docstatus: 'DR', docaction: 'CO', isintransit: 'N', processed: 'N', description: 'SODA2 receipt witness' }, base)),
      cr('m_movementline', Object.assign({ m_movement_id: { __opRef: 0 }, line: 10, m_product_id: PA, m_locator_id: HQL, m_locatorto_id: STL, movementqty: qty, qtyentered: qty, c_uom_id: 100 }, base))]);
    var id = (await rowsOf(A, "SELECT m_movement_id AS id FROM m_movement WHERE documentno='" + no + "'"))[0];
    var pr = id ? await hqDoc('m_movement', id.id, 'PR') : null, co = id ? await hqDoc('m_movement', id.id, 'CO') : null;
    var mv = id ? (await rowsOf(A, 'SELECT docstatus FROM m_movement WHERE m_movement_id=' + id.id))[0] : null, cf = id ? (await rowsOf(A, 'SELECT m_movementconfirm_id AS id, documentno AS dn, m_movementconfirm_uu AS uu, docstatus AS st FROM m_movementconfirm WHERE m_movement_id=' + id.id)) : [];
    return { created: w, id: id && id.id, pr: pr, co: co, status: mv && mv.docstatus, confirms: cf };
  };
  if (setupOk) {
    ARM = ARMS[0];
    PA = Number((await rowsOf(A, 'SELECT m_product_id AS p FROM m_productprice ORDER BY m_product_id LIMIT 1'))[0].p);
    // the fixture HQ needs: an in-transit Material Movement doctype and stock at the source (an admin's own setup through the window; HQ-local, not in the POS plan)
    var dt = (await rowsOf(A, 'SELECT isintransit FROM c_doctype WHERE c_doctype_id=143'))[0];
    if (dt && dt.isintransit !== 'Y') await hqW([{ op_type: 'CRUD_UPDATE', key: 'c_doctype', table: 'c_doctype', verb: 'update', id: 143, changes: { isintransit: { old: dt.isintransit, new: 'Y' } } }]);
    if ((await onhand(HQL)) < 20) await hqW([cr('m_storageonhand', { ad_client_id: 11, ad_org_id: HQO, isactive: 'Y', m_locator_id: HQL, m_product_id: PA, m_attributesetinstance_id: 0, qtyonhand: 20, datematerialpolicy: STAMP })]);
  }
  if (setupOk && ARMS.indexOf('receive') >= 0) {
    ARM = 'receive'; console.log('§U1 RECEIVE end to end: HQ movement (real Prepare) -> branch confirm SHORT (3 of 5, 1 scrapped) -> ONE EODA send -> HQ applies');
    var QTY = 5, CONF = 3, SCR = 1, DIFF = QTY - CONF, s0 = { hq: await onhand(HQL), st: await onhand(STL) };
    if (process.env.SODA2_DEBUG) await eng(A, function (W) { W.__sc = []; var o = W.TeamScope.scopeOf; W.TeamScope.scopeOf = function (t, r) { var v = o.apply(this, arguments); if (/m_movement/.test(t)) W.__sc.push([t, r, v]); return v; }; });
    var m1 = await mkMovement('SODA2-MV-1', QTY);
    if (process.env.SODA2_DEBUG) console.log('§DBG5 ' + J(await eng(A, function (W) { return W.__sc; })).slice(0, 800));
    if (process.env.SODA2_DEBUG) console.log('§DBG2 ' + J(await eng(A, function (W) { return W.TeamSync.localOnly(); })).slice(0, 1500));
    if (process.env.SODA2_DEBUG) console.log('§DBG3 ' + J(await eng(A, async function (W) { var r = W.TeamSync.role(); return { role: r, sc: W.TeamSync.scopeOf('m_movement', r), sc2: W.TeamScope.scopeOf('m_movement', 102), kind: W.TeamScope.kind(), hubFlows: !!W.TeamScope.hubFlow('m_movement') }; })));
    if (process.env.SODA2_DEBUG) console.log('§DBG4 ' + J(await eng(A, async function (W) { var rows = await new Promise(function (res) { W.__crud.modelRun({ table: 'c_order', timing: 'PROCESS', fn: function (trx) { res(trx.q("SELECT id, op_type, op_uuid, user_tag, parameters FROM kernel_ops WHERE parameters LIKE '%SODA2-MV-1%' LIMIT 3")); return { ok: true }; } }, function () {}); }); var o = []; for (var r of rows) { var t = await W.TeamSync._translate(r, W.__idmpDb); o.push({ op: r.op_type, tag: r.user_tag, t: Object.keys(t), local: t.local }); } return o; })));
    console.log('§SODA2_HQ_MOVEMENT ' + J({ id: m1.id, status: m1.status, confirms: m1.confirms, pr: m1.pr && m1.pr.out, co: m1.co && m1.co.out, s0: s0 }));
    check('R0-setup', !!m1.id && m1.status === 'IP' && m1.confirms.length === 1 && s0.hq >= 20 && QTY > 0, 'HQ made a draft in-transit MMM, Prepare created the confirm, Complete left it In Progress (goods in transit; source stock ' + s0.hq + ')', m1);
    await visitAll([A, D, A, D], 1);
    var cnt = async function (sql) { var r = await rowsOf(D, sql); return r.length ? Number(r[0].n) : -1; };
    var seenD = { mv: await cnt("SELECT count(*) AS n FROM m_movement WHERE documentno='SODA2-MV-1'"), line: await cnt("SELECT count(*) AS n FROM m_movementline l JOIN m_movement m ON m.m_movement_id=l.m_movement_id WHERE m.documentno='SODA2-MV-1'"),
      cf: await cnt('SELECT count(*) AS n FROM m_movementconfirm'), lc: await cnt('SELECT count(*) AS n FROM m_movementlineconfirm') };
    check('R1-reaches-admin', seenD.mv === 1 && seenD.line === 1 && seenD.cf === 1 && seenD.lc === 1, 'the movement, its line, the confirm and its line confirm reached the branch POS admin through the plan (S3/S4/S5/F2)', seenD);
    var cfD = (await rowsOf(D, 'SELECT documentno AS dn, docstatus AS st, processed AS pr FROM m_movementconfirm'))[0] || {};
    var sentN0 = Object.keys(await eng(D, function (W) { return W.TeamSync.sent(); })).length;
    var mkR = mark(), rc = await D.pg.evaluate(function (x) { return window.BranchAdmin.receiveStock(x); }, (function () { var o = {}; o[cfD.dn] = [{ line: 10, confirmed: CONF, scrapped: SCR }]; return o; })()); var reqR = since(mkR);
    var sentN1 = Object.keys(await eng(D, function (W) { return W.TeamSync.sent(); })).length;
    check('C1-receive-authors-nothing-sends-nothing', rc && rc.received === 1 && puts(reqR, 'D') === 0 && sentN1 === sentN0, 'Receive stock makes 0 admin puts and authors 0 ops (' + puts(reqR, 'D') + ' puts, sent ops ' + sentN0 + ' -> ' + sentN1 + ')', { rc: rc, puts: puts(reqR, 'D'), sent: [sentN0, sentN1] });
    await visitAll([D, A]);
    var hq1 = (await rowsOf(A, 'SELECT docstatus AS st, processed AS pr FROM m_movementconfirm WHERE m_movement_id=' + m1.id))[0], mvq1 = (await rowsOf(A, 'SELECT docstatus AS st FROM m_movement WHERE m_movement_id=' + m1.id))[0], s1 = { hq: await onhand(HQL), st: await onhand(STL) };
    check('C2-nothing-travels-before-the-eoda', hq1.st === 'DR' && hq1.pr === 'N' && mvq1.st === 'IP' && s1.hq === s0.hq && s1.st === s0.st, 'after the receipt and a round of Visits HQ still holds the confirm as it made it (DR, not processed), the movement In Progress and unmoved stock', { hq1: hq1, mv: mvq1, s0: s0, s1: s1 });
    // one till rings and closes, then the admin makes its ONE send
    var pgT = pgs[0]; await pgT.click('#u1 .u-user:has-text("GardenAdmin")'); await pgT.click('#u2 [data-panel="Sales"]'); await ring(0, 1); await closeShift(0); await visitAll([D, A, D]);
    await D.pg.fill('#a-tills', tillKeys[0]); await D.pg.dispatchEvent('#a-tills', 'change'); await sleep(400);
    var mkS = mark(), sr = await D.pg.evaluate(function () { return window.BranchAdmin.send(false); }); var reqS = since(mkS); await visitAll([D, A, D, A]);
    console.log('§SODA2_RELAY eoda_send=' + J(sr) + ' admin requests=' + reqS.length + ' hub puts=' + puts(reqS, 'D', 'hub') + ' branch puts=' + puts(reqS, 'D', 'branch') + ' receive-step puts=' + puts(reqR, 'D'));
    var hq2 = (await rowsOf(A, 'SELECT docstatus AS st, processed AS pr, documentno AS dn FROM m_movementconfirm WHERE m_movement_id=' + m1.id))[0] || {}, mv2 = (await rowsOf(A, 'SELECT docstatus AS st FROM m_movement WHERE m_movement_id=' + m1.id))[0] || {};
    var lc2 = (await rowsOf(A, 'SELECT lc.targetqty AS t, lc.confirmedqty AS c, lc.scrappedqty AS s, lc.differenceqty AS d, lc.processed AS p FROM m_movementlineconfirm lc JOIN m_movementconfirm c ON c.m_movementconfirm_id=lc.m_movementconfirm_id WHERE c.m_movement_id=' + m1.id))[0] || {};
    var ml2 = (await rowsOf(A, 'SELECT movementqty AS q, confirmedqty AS c, scrappedqty AS s FROM m_movementline WHERE m_movement_id=' + m1.id))[0] || {}, s2 = { hq: await onhand(HQL), st: await onhand(STL) };
    var invs = await rowsOf(A, "SELECT m_warehouse_id AS wh, docstatus AS st FROM m_inventory WHERE description LIKE '%" + (hq2.dn || 'NONE') + "%'");
    var wantHq = s0.hq - CONF - DIFF, wantSt = s0.st + CONF - SCR;
    console.log('§SODA2_APPLIED confirm=' + J(hq2) + ' line=' + J(lc2) + ' movement=' + J(mv2) + ' movementline=' + J(ml2) + ' inventory=' + J(invs) + ' source ' + s0.hq + '->' + s2.hq + ' (want ' + wantHq + ') target ' + s0.st + '->' + s2.st + ' (want ' + wantSt + ')');
    check('R2-eoda-carries-the-confirm', sr && sr.batch && hq2.st === 'CO' && hq2.pr === 'Y' && Number(lc2.c) === CONF && Number(lc2.s) === SCR && Number(lc2.d) === DIFF && lc2.p === 'Y', 'the executor\'s outcome arrived at HQ in the EODA batch on the confirm\'s own rows: DocStatus CO, Processed Y, line confirmed ' + CONF + ' scrapped ' + SCR + ' difference ' + DIFF, { sr: sr, hq2: hq2, lc2: lc2 });
    check('R3-hq-completes-the-movement', mv2.st === 'CO' && Number(ml2.q) === CONF && Number(ml2.s) === SCR, 'HQ completed the movement as legacy does after its confirmation (MMovement.java:427-430 guard lifted; processLine copied Confirmed to MovementQty ' + CONF + ')', { mv2: mv2, ml2: ml2 });
    check('R4-difference-docs', invs.length === 2 && invs.every(function (i) { return i.st === 'CO'; }) && invs.map(function (i) { return Number(i.wh); }).sort().join() === '103,104', 'two completed inventory documents: Difference at the source warehouse (103), Scrapped at the target warehouse (104)', invs);
    check('R5-storage-both-warehouses', s2.hq === wantHq && s2.st === wantSt, 'storage at BOTH warehouses = the legacy arithmetic of the Java: source ' + s0.hq + ' -> ' + wantHq + ', Store Central ' + s0.st + ' -> ' + wantSt, { s0: s0, s2: s2, want: { hq: wantHq, st: wantSt } });
    var aLogs = A.logs.filter(function (l) { return /^§SODA_APPLY /.test(l); });
    check('R6-apply-logged', aLogs.length === 1 && /result=CO/.test(aLogs[0]), 'HQ logged exactly one §SODA_APPLY with result=CO (idempotent: later Visits did not re-apply)', aLogs);
    check('C3-one-send', puts(reqS, 'D', 'hub') <= 2 && puts(reqS, 'D', 'hub') >= 1, 'the EODA send that carried the confirm is ONE Visit: ' + puts(reqS, 'D', 'hub') + ' hub-lane puts (an own send for the confirm would add more)', puts(reqS, 'D', 'hub'));
    await visitAll([D, A, D]);
    if (process.env.SODA2_DEBUG) console.log('§DBG8 ' + J(await eng(D, function (W) { var l = W.TeamSync._project.last; return { skipped: l.skipped, groupHeld: l.groupHeld, byTable: l.byTable, kept: l.kept, projected: l.projected }; })));
    var mvD = (await rowsOf(D, "SELECT docstatus AS st FROM m_movement WHERE documentno='SODA2-MV-1'"))[0] || {}, cfD2 = (await rowsOf(D, 'SELECT docstatus AS st, processed AS pr FROM m_movementconfirm'))[0] || {};
    check('R7-branch-mirrors-the-result', mvD.st === 'CO' && cfD2.st === 'CO' && cfD2.pr === 'Y', 'the branch\'s copy shows the movement Completed (HQ\'s DOWN status) and its own confirm Completed', { mvD: mvD, cfD2: cfD2 });
    var again = await D.pg.evaluate(function () { return window.BranchAdmin.soda().then(function (s) { return s.confirms.length; }); });
    check('R8-not-offered-twice', again === 0, 'a received movement is not offered again', again);
  }
  if (setupOk && ARMS.indexOf('updown') >= 0) {
    ARM = 'updown'; console.log('§U2 UPDOWN (E3): X (role 103) authors an UP update of a confirm; every device must refuse it not-executor');
    var m2 = await mkMovement('SODA2-MV-2', 2); await visitAll([A, D, X, A, D, X], 1);
    var cfA = m2.confirms[0] || {}, vA0 = (await rowsOf(A, 'SELECT docstatus AS st, processed AS pr FROM m_movementconfirm WHERE m_movementconfirm_id=' + cfA.id))[0] || {};
    check('U0-non-vacuous', !!cfA.uu && vA0.st === 'DR' && m2.status === 'IP', 'a second confirm is pending at HQ (DR, movement In Progress): the hostile op has something to change', { m2: m2, vA0: vA0 });
    var hostile = await eng(X, async function (W, x) { var S = W.TeamSync.store(); var a = await S.author({ target: { table: 'm_movementconfirm', uu: x.uu }, body: { op_type: 'CRUD_UPDATE', params: { changes: { docstatus: { old: 'DR', new: 'CO' }, processed: { old: 'N', new: 'Y' } } } }, refs: [], intent: 'K2' }); return { hash: a.hash, role: a.env.seq !== undefined ? 'authored' : '?' }; }, { uu: cfA.uu });
    await visitAll([X, A, D, A, D, X], 1);
    var fold = {}; for (var dv of [A, D]) fold[dv.name] = await eng(dv, async function (W, x) { var v = (await W.TeamSync.store().order()).verdict[x.h]; return v ? v.verdict + ':' + v.reason : 'none'; }, { h: hostile.hash });
    var vA1 = (await rowsOf(A, 'SELECT docstatus AS st, processed AS pr FROM m_movementconfirm WHERE m_movementconfirm_id=' + cfA.id))[0] || {}, vD1 = (await rowsOf(D, "SELECT docstatus AS st, processed AS pr FROM m_movementconfirm WHERE m_movementconfirm_uu='" + cfA.uu + "'"))[0] || {};
    var mv2q = (await rowsOf(A, 'SELECT docstatus AS st FROM m_movement WHERE m_movement_id=' + m2.id))[0] || {};
    var refA = A.logs.filter(function (l) { return /^§TEAM_THIN/.test(l) && /reasons=\{[^}]*"not-executor"/.test(l); }), refD = D.logs.filter(function (l) { return /^§TEAM_THIN/.test(l) && /reasons=\{[^}]*"not-executor"/.test(l); });
    console.log('§SODA2_UPDOWN hostile=' + J(hostile) + ' fold=' + J(fold) + ' hq confirm=' + J(vA1) + ' branch confirm=' + J(vD1) + ' hq movement=' + J(mv2q) + ' refusedLogs A=' + refA.length + ' D=' + refD.length);
    check('U1-op-was-admitted-by-the-fold', /^MERGED/.test(fold.A) && /^MERGED/.test(fold.D), 'non-vacuous: the hostile op passed signature, role access and scope on both devices (fold ' + J(fold) + '), so only the plan\'s E3 can stop it', fold);
    check('U2-refused-on-every-device', vA1.st === 'DR' && vA1.pr === 'N' && vD1.st === 'DR' && vD1.pr === 'N' && refA.length >= 1 && refD.length >= 1, 'the non-executor\'s UP was REFUSED not-executor on HQ and on the branch admin: the confirm stays DR / not processed on both, and both logged the refusal', { vA1: vA1, vD1: vD1, refA: refA.slice(0, 1), refD: refD.slice(0, 1) });
    check('U3-nothing-applied', mv2q.st === 'IP', 'the movement was not completed by the refused outcome (still In Progress)', mv2q);
  }

  console.log('§SODA2_PAGE_ERRORS n=' + errors.length + (errors.length ? ' ' + J(errors.slice(0, 3)) : ''));
  ARM = ARMS[0]; V[ARM].judged++; if (errors.length) V[ARM].failed++; console.log('  §SODA2_CHECK arm=' + ARM + ' key=page-errors ' + (errors.length ? 'FAIL' : 'OK') + ' 0 page errors on the pages');
  await browser.close(); server.close();
  var bad = 0; ARMS.forEach(function (a) { var v = V[a], verdict = !v.judged ? 'INCONCLUSIVE' : v.failed ? 'FAIL' : 'PASS'; if (verdict !== 'PASS') bad++; console.log('§SODA2_VERDICT arm=' + a + ' verdict=' + verdict + ' judged=' + v.judged + ' failed=' + v.failed + (MUTNAME ? ' mutant=' + MUTNAME : '')); });
  process.exit(bad ? 1 : 0);
})().catch(function (e) { console.log('§SODA2_CRASH ' + (e && e.stack || e)); process.exit(3); });
