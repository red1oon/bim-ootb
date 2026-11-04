#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-SODA-UI: the SODA down path on REAL devices (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §28.4). READ THE LOG after every run: every verdict is a § line; the exit code is not the evidence.
//   An empty population prints INCONCLUSIVE; a mutant is a COPY served by the harness, proven applied exactly once; a crash is not a kill. Logs /tmp/soda_logs/.
// HARNESS (copied from erp/tests/witness_eoda.js): head office A (founder), the branch POS admin D (erp/branch_admin.html), tills T1 T2 T3 (erp/till.html), signed POS plan, ONE dumb folder pipe; every request is attributed to its device.
// WHAT IS REAL: the plan routing of the SODA rows and the movement rows (flows S1..S6, F2), the admin's fan-out (branch lane), the tills' apply, the receive-stock receipt riding the EODA send, the relay counts.
// WHAT IS SIMULATED (named): the HQ batch ROWS are computed by erp/soda_core.js refDelta over HQ's own rows after a real CRUD edit at HQ, and written as ONE op group (the output of the FO_Branch_SODA process,
//   judged in the kernel by erp/tests/witness_soda.js); HQ's movement + confirm rows are written by CRUD ops (the Replenish create / Prepare, judged by witness_movement_confirm.js / witness_soda.js).
// Arms: SODA_ARMS=fan,relay (the receipt UP is judged by witness_soda_receipt_up.js).  Mutant: SODA_MUT=<name>.  Run: node erp/tests/witness_soda_ui.js 2>&1 | tee /tmp/soda_logs/soda_ui.log
'use strict';
var path = require('path'), http = require('http'), fs = require('fs'), os = require('os'), vm = require('vm'), nodeCrypto = require('crypto'), cp = require('child_process');
var ROOT = process.env.SODA_ROOT || path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var subtle = nodeCrypto.webcrypto.subtle, J = JSON.stringify, sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
var ARMS = (process.env.SODA_ARMS || 'fan,relay').split(','), MUTNAME = process.env.SODA_MUT || '', LOGS = process.env.SODA_LOGS || '/tmp/soda_logs';
var V = { fan: { judged: 0, failed: 0 }, relay: { judged: 0, failed: 0 } }, errors = [], ARM = 'fan';
function check(key, ok, label, info) { var v = V[ARM]; v.judged++; if (!ok) v.failed++; console.log('  §SODA_UI_CHECK arm=' + ARM + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' ' + label + (ok ? '' : ' got=' + J(info).slice(0, 600))); return ok; }
function walk(d, rel, out) { if (!fs.existsSync(d)) return out; fs.readdirSync(d).forEach(function (n) { var p = path.join(d, n), r = rel ? rel + '/' + n : n; if (fs.statSync(p).isDirectory()) walk(p, r, out); else out.push(r); }); return out; }
function canon(o) { if (o === null || typeof o !== 'object') return J(o); if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']'; return '{' + Object.keys(o).sort().map(function (k) { return J(k) + ':' + canon(o[k]); }).join(',') + '}'; }
async function mkKey() { var kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']), j = await subtle.exportKey('jwk', kp.publicKey); return { priv: kp.privateKey, pub: { kty: j.kty, crv: j.crv, x: j.x, y: j.y } }; }
async function signObj(obj, key) { var b = JSON.parse(J(obj)); delete b.sig; delete b.signer; var s = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.priv, new TextEncoder().encode(canon(b))); var o = JSON.parse(J(b)); o.signer = key.pub; o.sig = Buffer.from(s).toString('hex'); return o; }
function loadPlan(file, g) { var o = {}; vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window: o, globalThis: o }); return o[g]; }
var planJs = function (name, o) { return '(function (g) { g.' + name + ' = ' + J(o) + '; })(typeof window !== \'undefined\' ? window : globalThis);\n'; };
var money = function (c) { return (Number(c) / 100).toFixed(2); }, toCents = function (s) { return Math.round(Number(s) * 100); };

// mutants: [file, anchor (must occur exactly once), replacement, arm that must go red]
var MUTS = {   // [file, anchor (exactly once), replacement, arm that must go red]
  'fan-per-row': ['/erp/branch_admin.js', "var res = await depositGroup(tr.map(function (r) { return create('pos_tillref', r); }));", "var res = { committed: true, gid: 'mut' }; for (var mi = 0; mi < tr.length; mi++) { await depositGroup([create('pos_tillref', tr[mi])]); await E.TeamSync.visit(); }", 'relay'],
  'till-no-apply': ['/erp/till.js', "if (ops.length) { var g = await depositGroup(ops);", "if (false) { var g = await depositGroup(ops);", 'fan']
};

(async function main() {
  console.log('═══ W-SODA-UI — SODA down on real devices (prompts/POS_PLUGIN_LOCAL_FIRST.md §28) ═══ arms=' + ARMS.join(',') + (MUTNAME ? ' MUTANT=' + MUTNAME : ''));
  fs.mkdirSync(LOGS, { recursive: true });
  var POSPLAN = loadPlan(path.join(ROOT, 'erp', 'team_plan_pos.js'), 'TEAM_PLAN_POS'), OFFICE = loadPlan(path.join(ROOT, 'erp', 'team_plan.js'), 'TEAM_PLAN');
  var FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'eoda-')), cur = { plans: {}, over: {} };
  var haveAdmin = fs.existsSync(path.join(ROOT, 'erp', 'branch_admin.html'));
  if (MUTNAME) { var m = MUTS[MUTNAME]; if (!m) { console.log('§SODA_UI_CRASH unknown mutant'); process.exit(2); }
    var orig = fs.readFileSync(path.join(ROOT, m[0]), 'utf8'); if (orig.split(m[1]).length !== 2) { console.log('§SODA_UI_CRASH MUTATION DID NOT APPLY exactly once ' + m[0]); process.exit(2); }
    cur.over[m[0]] = orig.replace(m[1], function () { return m[2]; }); console.log('§SODA_UI_MUTANT applied ' + MUTNAME + ' in ' + m[0] + ' (anchor found exactly once)'); ARMS = [m[3]]; }
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
  var RPORT = 19000 + Math.floor(Math.random() * 900), RBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'br-box-')), RELAY = 'http://127.0.0.1:' + RPORT, LAN = RELAY + '/pipe';   // §38: the REAL branch relay; tills use ONLY it, D is the main till
  var relayProc = require('child_process').spawn('python3', [path.join(ROOT, 'erp', 'branch_relay.py'), '--port', String(RPORT), '--dir', RBOX, '--bind', '127.0.0.1'], { stdio: ['ignore', 'ignore', 'pipe'] });
  await new Promise(function (res) { relayProc.stderr.on('data', function (d) { if (String(d).indexOf('§RELAY_UP') >= 0) res(); }); });
  var browser = await reqPw().chromium.launch({ args: ['--disable-gpu'] });
  var owner = await mkKey(); cur.plans.office = planJs('TEAM_PLAN', await signObj(OFFICE, owner)); cur.plans.pos = planJs('TEAM_PLAN_POS', await signObj(POSPLAN, owner));
  var xcfg = encodeURIComponent(Buffer.from(J({ trust: [owner.pub] })).toString('base64')), NET = { aborted: [] };
  async function open(name, urlPath, ready) {
    var ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } }), pg = await ctx.newPage(), logs = [];
    pg.on('console', function (m) { var t = m.text(); logs.push(t); if (/^§(SODA|EODA|TEAM_HELD|TEAM_HOLD|MV-TIP-SHADOW)|🔴/.test(t)) console.log('   [' + name + '] ' + t.slice(0, 300)); });
    pg.on('pageerror', function (e) { errors.push(name + ': ' + e.message); });
    await ctx.route('**/*', function (route) { var u = new URL(route.request().url()); if (u.hostname !== '127.0.0.1') { NET.aborted.push(u.host); return route.abort('blockedbyclient'); }
      if (u.port === String(RPORT)) return route.continue();
      if (u.pathname.indexOf('/pipe/') === 0) REQ.push({ dev: name, m: route.request().method(), p: u.pathname, q: u.searchParams.get('prefix') || '' }); return route.continue(); });
    await pg.addInitScript(function () { var q = new URLSearchParams(location.search).get('xcfg'); if (q) { var c = JSON.parse(atob(q)); window.TEAM_PLAN_TRUST = c.trust; } });
    if (name === 'D') await pg.addInitScript(function () { localStorage.setItem('tilllan.v1:12-MAIN', JSON.stringify({ main: { on: true } })); });   // §38: D is the flagged main till (a SODA kind-M row sets this on a real till)
    await pg.goto(base + urlPath, { waitUntil: 'load' }); await pg.waitForFunction(ready, null, { timeout: 240000 });
    return { name: name, pg: pg, logs: logs, ctx: ctx };
  }
  var qsNet = '&team=1&pipe=' + encodeURIComponent(PIPE) + '&xcfg=' + xcfg + '&teamplan=pos&poll=3600', qsBase = '&team=1&pipe=' + encodeURIComponent(LAN) + '&relay=' + encodeURIComponent(RELAY) + '&xcfg=' + xcfg + '&teamplan=pos&poll=3600', qsMain = qsNet + '&lan=' + encodeURIComponent(LAN) + '&relay=' + encodeURIComponent(RELAY);
  var eng = function (d, fn, arg) { return d.pg.evaluate('(function(){ var W = window.Till ? window.Till.engine() : window.BranchAdmin ? window.BranchAdmin.engine() : window; return (' + fn.toString() + ')(W, ' + J(arg === undefined ? null : arg) + '); })()'); };
  var T = {
    found: function (d) { return eng(d, function (W) { return W.TeamSync.found(); }); }, join: function (d, sp) { return eng(d, function (W, s) { return W.TeamSync.join(s); }, sp); },
    kid: function (d) { return eng(d, async function (W) { return (await W.TeamSync.pairState()).device; }); }, enrolled: function (d) { return eng(d, async function (W) { return (await W.TeamSync.pairState()).enrolled; }); },
    approve: function (a, kid, role, uu) { return eng(a, async function (W, x) { var r = await W.TeamSync.requests(); for (var q of r) if (q.rq.kid === x.kid) { await W.TeamSync.approve(q.rq, x.role, x.uu); return true; } return false; }, { kid: kid, role: role, uu: uu }); },
    visit: function (d) { var done = false; return Promise.race([eng(d, async function (W) { var v = await W.TeamSync.visit(); return v && v.replicaIn; }).then(function (v) { done = true; return v; }), sleep(120000).then(function () { if (!done) console.log('   §EODA_STEP visit on ' + d.name + ' did not return in 120 s'); return null; })]); },
    rows: function (d, sql) { return eng(d, function (W, q) { return new Promise(function (res) { W.__crud.modelRun({ table: 'c_order', timing: 'PROCESS', fn: function (trx) { try { res(trx.q(q)); } catch (e) { res({ error: String(e && e.message) }); } return { ok: true }; } }, function () {}); }); }, sql); }
  };
  async function bridge() { if (typeof D !== 'undefined' && D && D.pg) await D.pg.evaluate(function () { return window.BranchAdmin.lanCollect(); }); }   // §38: the main till mirrors the shared stream and collects over the LAN
  async function visitAll(devs, rounds) { for (var r = 0; r < (rounds || 1); r++) { for (var i = 0; i < devs.length; i++) { await bridge(); await T.visit(devs[i]); } await bridge(); } }
  var mark = function () { return REQ.length; }, since = function (mk) { return REQ.slice(mk); };
  // lanes of a PUT: 'branch' = the branch box m/b_<org>/ (head office never reads it); 'hub' = an op bundle (/o/) outside it = DATA head office reads; 'house' = heartbeat / frontier / receipt files (h, f, r), carry no ticket
  var lane = function (r) { return /\/m\/b_/.test(r.p + r.q) ? 'branch' : /\/o\//.test(r.p + r.q) ? 'hub' : 'house'; };
  var puts = function (arr, dev, ln) { return arr.filter(function (r) { return r.m === 'PUT' && (!dev || r.dev === dev) && (!ln || lane(r) === ln); }).length; };

  // ═══ setup: head office A, the branch POS admin D, tills T1 T2 T3 (distinct logins = distinct till keys)
  console.log('§E0 setup: head office A (founder, POS plan), the branch POS admin D and three tills (role 50004, Bound to the branch Org 12)');
  var A = await open('A', '/erp/idempiere.html?login=GardenAdmin&window=281' + qsNet, function () { return window.TeamSync && window.__idmpDb && window.__crud && window.__idmpDb.exec('SELECT count(*) FROM ad_table')[0].values[0][0] > 0 && document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0; });
  await A.pg.evaluate(function () { return window.TeamSync.ready; });
  var D = haveAdmin ? await open('D', '/erp/branch_admin.html?login=50001' + qsMain, function () { return window.BranchAdmin && window.BranchAdmin.ready; }).catch(function (e) { console.log('§SODA_UI_PAGE branch_admin.html did not boot: ' + String(e && e.message).slice(0, 160)); return null; }) : null;
  if (!D) console.log('§SODA_UI_PAGE erp/branch_admin.html is ' + (haveAdmin ? 'present but did not boot' : 'ABSENT') + ' (RED: the branch POS admin is not built)');
  var tillLogins = [50001, 102, 101], TL = [];
  for (var i = 0; i < 3; i++) TL.push(await open('T' + (i + 1), '/erp/till.html?login=' + tillLogins[i] + qsBase, function () { return window.Till && window.Till.ready; }).catch(function (e) { console.log('§SODA_UI_PAGE till T' + (i + 1) + ' did not boot: ' + String(e && e.message).slice(0, 160)); return null; }));
  var setupOk = !!D && TL.every(Boolean);
  if (!setupOk) { ARMS.forEach(function (a) { ARM = a; check('e0-devices-boot', false, 'the branch POS admin and 3 tills boot', { admin: !!D, tills: TL.map(Boolean) }); }); }
  var space = await T.found(A), org = (await T.rows(A, 'SELECT ad_org_uu AS uu FROM ad_org WHERE ad_org_id=12'))[0];
  var devs = setupOk ? [D].concat(TL) : [];
  for (var d of devs) await T.join(d, space);
  for (var k = 0; k < 10 && setupOk; k++) { for (var d of devs) await T.approve(A, await T.kid(d), 50004, org.uu); await visitAll(devs.concat([A])); var en = []; for (var d of devs) en.push(await T.enrolled(d)); if (en.every(Boolean)) break; await sleep(300); }
  if (setupOk) await visitAll(devs.concat([A]), 2);
  var tillKeys = [], pgs = TL.map(function (t) { return t && t.pg; });
  if (setupOk) {
    var enr = []; for (var d of devs) enr.push(await T.enrolled(d)); ARM = ARMS[0];
    check('e0-enrolled', enr.every(Boolean), 'the admin and the three tills are enrolled (role 50004, Bound to Org 12)', enr);
    for (var t of TL) tillKeys.push(await t.pg.evaluate(function () { return window.Till.state().cfg.tillKey; }));
    check('e0-distinct-tills', tillKeys.length === 3 && tillKeys.filter(function (x, i, a) { return a.indexOf(x) === i; }).length === 3, 'the three tills have three different till keys: ' + J(tillKeys), tillKeys);
    var zero = []; for (var d of [A, D]) zero.push(Number((await T.rows(d, 'SELECT (SELECT count(*) FROM i_order) + (SELECT count(*) FROM i_payment) AS n'))[0].n));
    check('e0-empty-start', zero[0] === 0 && zero[1] === 0, 'non-vacuous start: 0 I_Order / I_Payment rows at head office and at the admin', zero);
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

  var stage = {}, SC = (function () { try { return require(path.join(ROOT, 'erp', 'soda_core.js')); } catch (e) { return null; } })();
  var cr = function (table, f) { return { op_type: 'CRUD_CREATE', key: table, table: table, verb: 'create', fields: f }; };
  var rowsOf = async function (d, sql) { var r = await T.rows(d, sql); return Array.isArray(r) ? r : []; };
  if (!SC) { ARM = 'fan'; check('ABSENT', false, 'erp/soda_core.js is absent from this tree: there is no SODA to judge (RED)', { root: ROOT }); ARMS.forEach(function (a) { if (a !== 'fan') { V[a].judged++; V[a].failed++; } }); setupOk = false; }
  if (setupOk) {
    var admin = D.pg, VER = Number((await rowsOf(A, 'SELECT m_pricelist_version_id AS v FROM m_pricelist_version WHERE m_pricelist_id=(SELECT m_pricelist_id FROM c_pos WHERE ad_org_id=12) ORDER BY validfrom DESC, m_pricelist_version_id DESC LIMIT 1'))[0].v);
    var PQ = 'SELECT m_product_id AS p, pricestd AS s, pricelimit AS l, pricelist AS t FROM m_productprice WHERE m_pricelist_version_id=' + VER + ' ORDER BY m_product_id';
    var prices0 = await rowsOf(A, PQ), X = prices0[0].p, Y = prices0[1].p;
    var tillSnap = async function () { var o = []; for (var t of TL) o.push(J(await rowsOf(t, PQ))); return o; };
    var snap0 = await tillSnap();
    check('F0', prices0.length > 5 && snap0.every(function (s) { return s === J(prices0); }), 'non-vacuous start: HQ and all three tills hold the same ' + prices0.length + ' prices of version ' + VER, { n: prices0.length });
    var hq1 = async function (ops) { return eng(A, function (W, o) { return new Promise(function (res) { var t = setTimeout(function () { res({ committed: false, reason: 'timeout' }); }, 60000); W.__crud.applyOpGroup(o, function (r) { clearTimeout(t); res(r); }); }); }, ops); };
    // ═══ HQ edits ONE price, the batch is written as ONE group, ONE Visit
    console.log('§U1 HQ edits one price (' + X + '), writes the SODA batch as one group, Visits once');
    var pr = (await rowsOf(A, 'SELECT * FROM m_productprice WHERE m_pricelist_version_id=' + VER + ' AND m_product_id=' + X))[0], stamp = '2026-11-04 00:30:00';
    var up = await hq1([{ op_type: 'CRUD_UPDATE', key: 'm_productprice', table: 'm_productprice', verb: 'update', id: pr.m_productprice_uu, idCol: 'm_productprice_uu', changes: { pricestd: { old: pr.pricestd, new: Number(pr.pricestd) + 2.5 }, updated: { old: pr.updated, new: stamp } } }]);
    var prAfter = (await rowsOf(A, 'SELECT pricestd, updated, m_productprice_uu FROM m_productprice WHERE m_pricelist_version_id=' + VER + ' AND m_product_id=' + X))[0];
    console.log('§SODA_UI_EDIT before=' + J({ s: pr.pricestd, u: pr.updated, uu: pr.m_productprice_uu }) + ' after=' + J(prAfter) + ' committed=' + J(up));
    check('F1-edit', up && up.committed === true && Number(prAfter.pricestd) === Number(pr.pricestd) + 2.5 && String(prAfter.updated).slice(0, 19) === stamp, 'HQ price edit committed and READ BACK (price and Updated moved)', { up: up, after: prAfter });
    var batch = async function (seq, since, label) {
      var P = await rowsOf(A, 'SELECT * FROM m_productprice WHERE m_pricelist_version_id=' + VER), R = await rowsOf(A, "SELECT * FROM m_product WHERE ad_client_id IN (0,11)"), Tx = await rowsOf(A, 'SELECT * FROM c_tax');
      var d = SC.refDelta({ since: since, upto: stamp, batchId: 'S-' + label, seq: seq, client: 11, org: 12, version: VER, prices: P, products: R, taxes: Tx });
      var mk = mark(), g = await hq1(d.rows.map(function (r) { return cr('pos_sodaref', r); })); await T.visit(A); var req = since0(mk);
      return { d: d, group: g, req: req };
    };
    var since0 = since;
    var b1 = await batch(1, stamp, 'one');
    console.log('§SODA_UI_BATCH one-price batch rows=' + b1.d.rows.length + ' kinds=' + J(b1.d.counts) + ' hq requests=' + b1.req.length + ' hub puts=' + puts(b1.req, 'A', 'hub'));
    check('F2-delta-rows', b1.d.counts.prices === 1 && b1.d.counts.products === 0 && b1.d.counts.taxes === 0 && b1.group.committed === true, 'the batch computed over HQ\'s own rows holds exactly the one edited price (header + 1 row)', b1.d.counts);
    await visitAll([D, A, D], 1);
    var seenAdmin = Number((await rowsOf(D, 'SELECT count(*) AS n FROM pos_sodaref'))[0].n);
    check('F3-reaches-admin', seenAdmin === b1.d.rows.length, 'the batch rows reached the branch POS admin through the plan (S1, by Org): ' + seenAdmin + ' of ' + b1.d.rows.length, seenAdmin);
    // ═══ admin fans out on the branch lane; tills Visit and apply
    var mkF = mark(), fr = await admin.evaluate(function () { return window.BranchAdmin.fan(); }); var reqF = since0(mkF);
    console.log('§SODA_UI_FAN admin fan result=' + J(fr) + ' requests=' + reqF.length + ' hub puts=' + puts(reqF, 'D', 'hub') + ' branch puts=' + puts(reqF, 'D', 'branch'));
    check('F4-fan-one-group', fr && fr.rows === b1.d.rows.length, 'the admin passed the batch rows on in one call', fr);
    var mkT = mark(); for (var t of TL) { await t.pg.evaluate(function () { return window.Till.visit(); }).catch(function () {}); } var reqT = since0(mkT);
    var snap1 = await tillSnap(), hqP = await rowsOf(A, PQ), chg = [];
    snap1.forEach(function (s, i) { var a = JSON.parse(snap0[i]), b = JSON.parse(s); a.forEach(function (r, k) { if (J(r) !== J(b[k])) chg.push(i + ':' + r.p); }); });
    check('F5-only-the-edit-applied', chg.length === 3 && chg.every(function (c) { return c.split(':')[1] === String(X); }), 'every till changed exactly the one edited price (' + J(chg) + '), none of the other ' + (prices0.length - 1), chg);
    check('F6-value', snap1.every(function (s) { var r = JSON.parse(s).filter(function (x) { return String(x.p) === String(X); })[0]; return r && Number(r.s) === Number(Number(pr.pricestd) + 2.5); }), 'each till shows the HQ value for the edited price: ' + (Number(pr.pricestd) + 2.5), snap1.map(function (s) { return JSON.parse(s).filter(function (x) { return String(x.p) === String(X); })[0]; }));
    var tillHub = puts(reqT.concat(reqF), null, 'hub') - puts(reqF, 'D', 'hub');
    check('F7-tills-send-nothing-to-hub', puts(reqT, null, 'hub') === 0, 'the tills write nothing on the hub lane while applying (hub puts ' + puts(reqT, null, 'hub') + ')', puts(reqT, null, 'hub'));
    // ═══ IMG: only ImageURL of Y changes (through the real page's model layer: it must stamp Updated itself)
    console.log('§U2 IMG: HQ changes only the ImageURL of product ' + Y + ' through the model layer');
    var yRow = (await rowsOf(A, 'SELECT * FROM m_product WHERE m_product_id=' + Y))[0], IMGURL = 'https://img.example/' + Y + '.png';
    var ed = await eng(A, function (W, x) { return new Promise(function (res) { W.__crud.modelRun({ table: 'm_product', timing: 'SAVE', record: x.row, id: x.row.m_product_id, changes: { imageurl: x.url } }, function (r) { if (!r || !r.ops) return res({ ok: false, why: r && (r.error || r.msg) }); W.__crud.applyOpGroup(r.ops, function (g) { res({ ok: true, committed: g && g.committed, fields: Object.keys((r.ops[0] || {}).changes || {}) }); }); }); }); }, { row: yRow, url: IMGURL });
    var yAfter = (await rowsOf(A, 'SELECT imageurl, updated FROM m_product WHERE m_product_id=' + Y))[0];
    check('I1-model-layer-stamps-updated', ed && ed.ok && ed.committed === true && ed.fields.indexOf('updated') >= 0 && String(yAfter.updated) > String(yRow.updated || ''), 'a model-layer save of ImageURL also moves Updated (legacy PO.doUpdate), which is what the watermark reads', { ed: ed, before: yRow.updated, after: yAfter.updated });
    var b2 = await batch(2, String(yAfter.updated).replace('T', ' ').slice(0, 19), 'img');
    check('I2-one-product-row', b2.d.counts.products === 1 && b2.d.counts.prices === 0 && b2.d.counts.taxes === 0 && b2.d.rows.filter(function (r) { return r.kind === 'R'; })[0].imageurl === IMGURL, 'only ImageURL changed: exactly one R row, carrying the URL string (no price row)', b2.d.counts);
    await visitAll([D, A, D], 1); await admin.evaluate(function () { return window.BranchAdmin.fan(); }); for (var t of TL) await t.pg.evaluate(function () { return window.Till.visit(); }).catch(function () {});
    var yTill = []; for (var t of TL) yTill.push((await rowsOf(t, 'SELECT imageurl FROM m_product WHERE m_product_id=' + Y))[0].imageurl);
    check('I3-till-product-carries-url', yTill.every(function (u) { return u === IMGURL; }), 'each till\'s product row now carries the new URL (' + J(yTill) + ')', yTill);
    var snap2 = await tillSnap(); check('I4-prices-unmoved', snap2.every(function (s, i) { return s === snap1[i]; }), 'the IMG batch moved no price on any till', null);
    stage.small = { hub: puts(b1.req, 'A', 'hub'), n: b1.req.length, fanBr: puts(reqF, 'D', 'branch'), fanHub: puts(reqF, 'D', 'hub') };
    // ═══ RELAY: the same flow for ALL prices edited (a batch of many rows): HQ's and the admin's request counts must not grow with rows
    if (ARMS.indexOf('relay') >= 0) {
      ARM = 'relay'; console.log('§U3 RELAY: HQ edits ALL ' + prices0.length + ' prices; one batch, one fan-out');
      var allP = await rowsOf(A, 'SELECT m_productprice_uu AS uu, pricestd AS s, updated AS u FROM m_productprice WHERE m_pricelist_version_id=' + VER), st3 = '2026-11-04 01:30:00';
      var upAll = await hq1(allP.map(function (r) { return { op_type: 'CRUD_UPDATE', key: 'm_productprice', table: 'm_productprice', verb: 'update', id: r.uu, idCol: 'm_productprice_uu', changes: { pricestd: { old: r.s, new: Number(r.s) + 1 }, updated: { old: r.u, new: st3 } } }; }));
      var b3 = await batch(3, st3, 'all'); await visitAll([D, A, D], 1); var mkF2 = mark(), fr2 = await admin.evaluate(function () { return window.BranchAdmin.fan(); }); var reqF2 = since0(mkF2);
      var seenA3 = Number((await rowsOf(D, "SELECT count(*) AS n FROM pos_sodaref WHERE batchid='S-all'"))[0].n);
      console.log('§SODA_UI_RELAY small: rows=' + b1.d.rows.length + ' hq requests=' + b1.req.length + ' hq hub puts=' + puts(b1.req, 'A', 'hub') + ' | admin fan requests=' + reqF.length + ' branch puts=' + puts(reqF, 'D', 'branch') + ' hub puts=' + puts(reqF, 'D', 'hub'));
      console.log('§SODA_UI_RELAY large: rows=' + b3.d.rows.length + ' hq requests=' + b3.req.length + ' hq hub puts=' + puts(b3.req, 'A', 'hub') + ' | admin fan requests=' + reqF2.length + ' branch puts=' + puts(reqF2, 'D', 'branch') + ' hub puts=' + puts(reqF2, 'D', 'hub'));
      check('R1-large-batch', b3.d.counts.prices === prices0.length && upAll && upAll.committed === true && seenA3 === b3.d.rows.length, 'non-vacuous: the large batch holds all ' + prices0.length + ' prices (' + b3.d.rows.length + ' rows) and reached the admin (' + seenA3 + ')', { counts: b3.d.counts, seen: seenA3 });
      check('R2-hq-puts-constant', puts(b3.req, 'A', 'hub') === puts(b1.req, 'A', 'hub') && puts(b3.req, 'A', 'hub') <= 2, 'HQ hub-lane puts do not grow with rows: ' + b1.d.rows.length + ' rows -> ' + puts(b1.req, 'A', 'hub') + ', ' + b3.d.rows.length + ' rows -> ' + puts(b3.req, 'A', 'hub') + ' (one Visit)', { small: puts(b1.req, 'A', 'hub'), large: puts(b3.req, 'A', 'hub') });
      check('R3-fan-puts-constant', puts(reqF2, 'D', 'branch') === puts(reqF, 'D', 'branch') && puts(reqF2, 'D', 'branch') <= 2 && puts(reqF2, 'D', 'hub') === 0, 'the admin\'s fan-out is ONE branch-lane Visit whatever the rows: ' + puts(reqF, 'D', 'branch') + ' -> ' + puts(reqF2, 'D', 'branch') + ' puts, 0 hub puts', { small: puts(reqF, 'D', 'branch'), large: puts(reqF2, 'D', 'branch'), hub: puts(reqF2, 'D', 'hub') });
      check('R4-requests-not-growing', b3.req.length <= b1.req.length + 4 && reqF2.length <= reqF.length + 4, 'total requests per phase stay flat (HQ ' + b1.req.length + ' -> ' + b3.req.length + ', admin fan ' + reqF.length + ' -> ' + reqF2.length + ')', { hq: [b1.req.length, b3.req.length], fan: [reqF.length, reqF2.length] });
      for (var t of TL) await t.pg.evaluate(function () { return window.Till.visit(); }).catch(function () {});
      var snap3 = await tillSnap(), hq3 = await rowsOf(A, PQ);
      check('R5-tills-converge', snap3.every(function (s) { return s === J(hq3); }), 'after the large batch every till holds exactly HQ\'s ' + hq3.length + ' prices', null);
      var tillHubAll = puts(REQ.filter(function (r) { return /^T/.test(r.dev); }), null, 'hub');
      check('R6-tills-never-write-hub', tillHubAll === 0, 'across the whole SODA run no till wrote anything on the hub lane (' + tillHubAll + ')', tillHubAll);
    }
  }

  console.log('§SODA_UI_PAGE_ERRORS n=' + errors.length + (errors.length ? ' ' + J(errors.slice(0, 3)) : ''));
  ARM = ARMS[0]; V[ARM].judged++; if (errors.length) V[ARM].failed++; console.log('  §SODA_UI_CHECK arm=' + ARM + ' key=page-errors ' + (errors.length ? 'FAIL' : 'OK') + ' 0 page errors on the five pages');
  await browser.close(); server.close(); relayProc.kill('SIGTERM');
  var bad = 0; ARMS.forEach(function (a) { var v = V[a], verdict = !v.judged ? 'INCONCLUSIVE' : v.failed ? 'FAIL' : 'PASS'; if (verdict !== 'PASS') bad++; console.log('§SODA_UI_VERDICT arm=' + a + ' verdict=' + verdict + ' judged=' + v.judged + ' failed=' + v.failed + (MUTNAME ? ' mutant=' + MUTNAME : '')); });
  process.exit(bad ? 1 : 0);
})().catch(function (e) { console.log('§SODA_UI_CRASH ' + (e && e.stack || e)); process.exit(3); });
