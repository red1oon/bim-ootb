#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-EODA-AGG / W-EODA-GATE / W-EODA-PARTIAL / W-EODA-RELAY (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §26.6). READ THE LOG after every run: every verdict is a § line, the exit code is not the evidence.
// THE ISSUES: (AGG) three tills of ONE branch must reach head office as ONE batch that holds every ticket key exactly once, with a statement whose totals equal the sum of the tills' own Z;
//   (GATE) an open till must block "Send EODA" unless an override reason is given, and the override must be recorded where head office can read it; (PARTIAL) "Send status now" sends what is closed so far, marked PARTIAL, and a later
//   EODA must not double it; (RELAY) a till never writes anything head office reads, only the branch POS admin's send crosses, and its request count does not grow with tickets. Mutants: a till sends to HQ directly, a send per ticket.
// HARNESS (copied from erp/tests/witness_kds.js): FIVE real devices in headless Chromium on one dumb folder pipe, signed POS plan: head office A (founder), the branch POS admin D (erp/branch_admin.html), tills T1 T2 T3 (erp/till.html),
//   D and the tills are role 50004 Bound to the branch Org. Every pipe request is attributed to its device. Mutants are COPIES served by the harness, each proven applied exactly once; a crash is not a kill.
// Head office's Branch Day Close over the dumped batch is judged by witness_eoda_close.js (W-DAYCLOSE-EODA, W-EODA-PARTIAL import side), which this file spawns on the dump: EODA_DUMP=<file>.
// §38 (main till + branch relay): the tills' ONLY pipe is the REAL erp/branch_relay.py (LAN); the branch admin device D is the flagged MAIN till (flag seeded in its device store, as a SODA kind-M row sets it on a real till) and alone holds the internet pipe, routed so the branch mailbox stays on the LAN; D bridges the shared stream. The checks that counted a till's INTERNET traffic now assert 0.
// Arms: EODA_ARMS=agg,gate,partial,relay (default all).  Mutant: EODA_MUT=<name>.  Run: node erp/tests/witness_eoda.js 2>&1 | tee /tmp/eoda_logs/eoda.log
'use strict';
var path = require('path'), http = require('http'), fs = require('fs'), os = require('os'), vm = require('vm'), nodeCrypto = require('crypto'), cp = require('child_process');
var ROOT = process.env.EODA_ROOT || path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var subtle = nodeCrypto.webcrypto.subtle, J = JSON.stringify, sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
var ARMS = (process.env.EODA_ARMS || 'agg,gate,partial,relay').split(','), MUTNAME = process.env.EODA_MUT || '', LOGS = process.env.EODA_LOGS || '/tmp/eoda_logs';
var V = { agg: { judged: 0, failed: 0 }, gate: { judged: 0, failed: 0 }, partial: { judged: 0, failed: 0 }, relay: { judged: 0, failed: 0 } }, errors = [], ARM = 'agg';
function check(key, ok, label, info) { var v = V[ARM]; v.judged++; if (!ok) v.failed++; console.log('  §EODA_CHECK arm=' + ARM + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' ' + label + (ok ? '' : ' got=' + J(info).slice(0, 600))); return ok; }
function walk(d, rel, out) { if (!fs.existsSync(d)) return out; fs.readdirSync(d).forEach(function (n) { var p = path.join(d, n), r = rel ? rel + '/' + n : n; if (fs.statSync(p).isDirectory()) walk(p, r, out); else out.push(r); }); return out; }
function canon(o) { if (o === null || typeof o !== 'object') return J(o); if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']'; return '{' + Object.keys(o).sort().map(function (k) { return J(k) + ':' + canon(o[k]); }).join(',') + '}'; }
async function mkKey() { var kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']), j = await subtle.exportKey('jwk', kp.publicKey); return { priv: kp.privateKey, pub: { kty: j.kty, crv: j.crv, x: j.x, y: j.y } }; }
async function signObj(obj, key) { var b = JSON.parse(J(obj)); delete b.sig; delete b.signer; var s = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.priv, new TextEncoder().encode(canon(b))); var o = JSON.parse(J(b)); o.signer = key.pub; o.sig = Buffer.from(s).toString('hex'); return o; }
function loadPlan(file, g) { var o = {}; vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window: o, globalThis: o }); return o[g]; }
var planJs = function (name, o) { return '(function (g) { g.' + name + ' = ' + J(o) + '; })(typeof window !== \'undefined\' ? window : globalThis);\n'; };
var money = function (c) { return (Number(c) / 100).toFixed(2); }, toCents = function (s) { return Math.round(Number(s) * 100); };

// mutants: [file, anchor (must occur exactly once), replacement, arm that must go red]
var MUTS = {
  'till-on-internet': ['/erp/tests/witness_eoda.js', "qsBase = '&team=1&pipe=' + encodeURIComponent(LAN)", "qsBase = '&team=1&pipe=' + encodeURIComponent(PIPE)", 'relay'],   // §38: the §26 'till-sends-direct' mutant is gone with the path it modelled; this one puts the tills on the INTERNET relay (harness-level, applied once to this file's own text)
  'send-per-ticket': ['/erp/branch_admin.js', "var res = await depositGroup(ops);", "var res = { committed: true, gid: 'mut' }, by = {}; ops.forEach(function (o) { var k = (o.fields && o.fields.documentno) || '~stmt'; (by[k] = by[k] || []).push(o); }); var ks = Object.keys(by); for (var mi = 0; mi < ks.length; mi++) { await depositGroup(by[ks[mi]]); await E.TeamSync.visit(); }", 'relay'],
  'send-without-gate': ['/erp/branch_admin.js', "if (!partial && !v.allClosed && !ov) {", "if (false) {", 'gate'],
  'override-not-recorded': ['/erp/branch_admin.js', "override: partial ? '' : (v.allClosed ? '' : ov),", "override: '',", 'gate'],
  'partial-sent-as-final': ['/erp/branch_admin.js', "partial: !!partial, override:", "partial: false, override:", 'partial'],
  'statement-not-summed-from-z': ['/erp/eoda_core.js', "d.tickets += z.tickets; d.gross += z.gross;", "d.tickets += z.tickets; d.gross += z.gross + 1;", 'agg']
};

(async function main() {
  console.log('═══ W-EODA — the branch POS admin and the one-batch EODA (prompts/POS_PLUGIN_LOCAL_FIRST.md §26) ═══ arms=' + ARMS.join(',') + (MUTNAME ? ' MUTANT=' + MUTNAME : ''));
  fs.mkdirSync(LOGS, { recursive: true });
  var POSPLAN = loadPlan(path.join(ROOT, 'erp', 'team_plan_pos.js'), 'TEAM_PLAN_POS'), OFFICE = loadPlan(path.join(ROOT, 'erp', 'team_plan.js'), 'TEAM_PLAN');
  var FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'eoda-')), cur = { plans: {}, over: {} };
  var haveAdmin = fs.existsSync(path.join(ROOT, 'erp', 'branch_admin.html'));
  if (MUTNAME === 'till-on-internet') ARMS = ['relay'];
  else if (MUTNAME) { var m = MUTS[MUTNAME]; if (!m) { console.log('§EODA_CRASH unknown mutant'); process.exit(2); }
    var orig = fs.readFileSync(path.join(ROOT, m[0]), 'utf8'); if (orig.split(m[1]).length !== 2) { console.log('§EODA_CRASH MUTATION DID NOT APPLY exactly once ' + m[0]); process.exit(2); }
    cur.over[m[0]] = orig.replace(m[1], function () { return m[2]; }); console.log('§EODA_MUTANT applied ' + MUTNAME + ' in ' + m[0] + ' (anchor found exactly once)'); ARMS = [m[3]]; }
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
  var RPORT = 19000 + Math.floor(Math.random() * 900), RBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'eoda-box-')), RELAY = 'http://127.0.0.1:' + RPORT, LANREQ = [], relayProc = cp.spawn('python3', [path.join(ROOT, 'erp', 'branch_relay.py'), '--port', String(RPORT), '--dir', RBOX, '--bind', '127.0.0.1'], { stdio: ['ignore', 'ignore', 'pipe'] });
  await new Promise(function (res) { relayProc.stderr.on('data', function (d) { if (String(d).indexOf('§RELAY_UP') >= 0) res(); }); });
  var LAN = RELAY + '/pipe';
  var browser = await reqPw().chromium.launch({ args: ['--disable-gpu'] });
  var owner = await mkKey(); cur.plans.office = planJs('TEAM_PLAN', await signObj(OFFICE, owner)); cur.plans.pos = planJs('TEAM_PLAN_POS', await signObj(POSPLAN, owner));
  var xcfg = encodeURIComponent(Buffer.from(J({ trust: [owner.pub] })).toString('base64')), NET = { aborted: [] };
  async function open(name, urlPath, ready) {
    var ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } }), pg = await ctx.newPage(), logs = [];
    pg.on('console', function (m) { var t = m.text(); logs.push(t); if (/^§(EODA|TEAM_HELD|TEAM_HOLD)|🔴/.test(t)) console.log('   [' + name + '] ' + t.slice(0, 300)); });
    pg.on('pageerror', function (e) { errors.push(name + ': ' + e.message); });
    await ctx.route('**/*', function (route) { var u = new URL(route.request().url()); if (u.hostname !== '127.0.0.1') { NET.aborted.push(u.host); return route.abort('blockedbyclient'); }
      if (u.port === String(RPORT) && u.pathname.indexOf('/pipe/') === 0) LANREQ.push({ dev: name, m: route.request().method(), p: u.pathname, q: u.searchParams.get('prefix') || '' });
      else if (u.pathname.indexOf('/pipe/') === 0) REQ.push({ dev: name, m: route.request().method(), p: u.pathname, q: u.searchParams.get('prefix') || '' }); return route.continue(); });
    await pg.addInitScript(function () { var q = new URLSearchParams(location.search).get('xcfg'); if (q) { var c = JSON.parse(atob(q)); window.TEAM_PLAN_TRUST = c.trust; } });
    if (name === 'D') await pg.addInitScript(function () { localStorage.setItem('tilllan.v1:12-MAIN', JSON.stringify({ main: { on: true } })); });
    await pg.goto(base + urlPath, { waitUntil: 'load' }); await pg.waitForFunction(ready, null, { timeout: 240000 });
    return { name: name, pg: pg, logs: logs, ctx: ctx };
  }
  var TILLPIPE = MUTNAME === 'till-on-internet' ? PIPE : LAN; if (MUTNAME === 'till-on-internet') console.log('§EODA_MUTANT applied till-on-internet: the tills are given the INTERNET relay pipe (harness-level, once)');
  var qsNet = '&team=1&pipe=' + encodeURIComponent(PIPE) + '&xcfg=' + xcfg + '&teamplan=pos&poll=3600';   // head office A: the internet relay
  var qsBase = '&team=1&pipe=' + encodeURIComponent(TILLPIPE) + '&relay=' + encodeURIComponent(RELAY) + '&xcfg=' + xcfg + '&teamplan=pos&poll=3600';   // an ordinary till: the branch relay ONLY
  var qsMain = qsNet + '&lan=' + encodeURIComponent(LAN) + '&relay=' + encodeURIComponent(RELAY);   // the main till: internet relay + branch relay, routed
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
  var D = haveAdmin ? await open('D', '/erp/branch_admin.html?login=50001' + qsMain, function () { return window.BranchAdmin && window.BranchAdmin.ready; }).catch(function (e) { console.log('§EODA_PAGE branch_admin.html did not boot: ' + String(e && e.message).slice(0, 160)); return null; }) : null;
  if (!D) console.log('§EODA_PAGE erp/branch_admin.html is ' + (haveAdmin ? 'present but did not boot' : 'ABSENT') + ' (RED: the branch POS admin is not built)');
  var tillLogins = [50001, 102, 101], TL = [];
  for (var i = 0; i < 3; i++) TL.push(await open('T' + (i + 1), '/erp/till.html?login=' + tillLogins[i] + qsBase, function () { return window.Till && window.Till.ready; }).catch(function (e) { console.log('§EODA_PAGE till T' + (i + 1) + ' did not boot: ' + String(e && e.message).slice(0, 160)); return null; }));
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
    var key = await pg.$eval('#receipt .rf[data-f="Receipt"]', function (e) { return e.getAttribute('data-v'); }); await pg.click('#rc-ok'); return key; }
  var rung = [[], [], []], SHAPE = {};
  async function ring(ti, n, bankIdx) { var pg = pgs[ti]; for (var i = 0; i < n; i++) { await clickProduct(pg, 128); if (i % 2 === 0) await clickProduct(pg, 129); var key = await pay(pg, i === bankIdx ? 'bank' : 'cash'); rung[ti].push(key); SHAPE[key] = i % 2 === 0 ? 2 : 1; } }
  async function closeShift(ti) { var pg = pgs[ti], mk = mark(); await pg.evaluate(function () { window.Till.go('close'); }); await sleep(400); await pg.click('#zclose'); await pg.click('#zconfirm'); await pg.waitForFunction(function () { return /Cash Closed OK/.test(document.querySelector('#zdone').textContent); }, null, { timeout: 30000 }); await sleep(1500); return since(mk); }
  function zOf(t) {   // the till's OWN Z line (§TILL_Z, printed by renderClose before the close): the oracle independent of the hand-off rows
    var ci = -1; t.logs.forEach(function (l, i) { if (/^§TILL_CLOSE closed=/.test(l)) ci = i; });
    for (var i = ci; i >= 0; i--) { var mm = /^§TILL_Z seq=(\d+) tickets=(\d+) units=\S+ gross=(\S+) net=(\S+) payments=(\d+) bytender=(\{.*?\}) removed=/.exec(t.logs[i]); if (mm) return { tickets: Number(mm[2]), gross: toCents(mm[3]), net: toCents(mm[4]), tenders: JSON.parse(mm[6]) }; }
    return null; }

  var stage = {}, sortO = function (o) { var r = {}; Object.keys(o).sort().forEach(function (k) { r[k] = o[k]; }); return r; };
  if (setupOk) {
    var admin = D.pg;
    for (var ti = 0; ti < 3; ti++) { await pgs[ti].click('#u1 .u-user:has-text("GardenAdmin")'); await pgs[ti].click('#u2 [data-panel="Sales"]'); }
    // ═══ the day: each till works alone
    console.log('§E1 the day: T1 rings 3 tickets, T2 rings 2 (the second paid by Bank), T3 rings 4; no till writes anything to the pipe');
    var mkDay = mark();
    await ring(0, 3); await ring(1, 2, 1); await ring(2, 4);
    var dayReq = since(mkDay).filter(function (r) { return /^T/.test(r.dev); });
    console.log('§EODA_RELAY the day: till requests while ringing 9 tickets=' + dayReq.length + ' (puts ' + puts(dayReq) + ')');
    stage.day = dayReq.length;
    // close T1 and T2 (T3 stays open)
    console.log('§E2 T1 and T2 Close Cash; each hands its shift to the branch admin; T3 stays open');
    var closeReq = []; closeReq[0] = await closeShift(0); closeReq[1] = await closeShift(1);
    var tillZ = [zOf(TL[0]), zOf(TL[1])];
    var tillHub = puts(closeReq[0].concat(closeReq[1]), null, 'hub'), tillBranch = puts(closeReq[0].concat(closeReq[1]), null, 'branch');
    console.log('§EODA_RELAY close: T1 requests=' + closeReq[0].length + ' (puts hub ' + puts(closeReq[0], null, 'hub') + ' branch ' + puts(closeReq[0], null, 'branch') + ') T2 requests=' + closeReq[1].length + ' (puts hub ' + puts(closeReq[1], null, 'hub') + ' branch ' + puts(closeReq[1], null, 'branch') + ')');
    await visitAll([A, D, A]);
    var hqAfterClose = Number((await T.rows(A, 'SELECT (SELECT count(*) FROM i_order) + (SELECT count(*) FROM i_payment) + (SELECT count(*) FROM pos_branchdaystatement) AS n'))[0].n);
    await bridge(); var hnd = await D.pg.evaluate(function () { var g = {}; window.BranchAdmin.lan().handoffRows().forEach(function (r) { var k = r.tillkey + '|' + r.kind; g[k] = (g[k] || 0) + 1; }); return Object.keys(g).sort().map(function (k) { return { tillkey: k.split('|')[0], kind: k.split('|')[1], n: g[k] }; }); });
    console.log('§EODA_STATE after T1 and T2 closed: head office holds ' + hqAfterClose + ' tickets/statement rows; the admin holds hand-offs ' + J(hnd));
    // the admin screen: expected tills = the three
    await admin.fill('#a-tills', tillKeys.join(', ')); await admin.dispatchEvent('#a-tills', 'change'); await sleep(500);
    await admin.evaluate(function () { return window.BranchAdmin.refresh(); });
    var scr = await admin.$$eval('#a-rows tr', function (tr) { return tr.map(function (r) { return { till: r.getAttribute('data-till'), closed: r.getAttribute('data-closed'), cells: [].map.call(r.cells, function (c) { return c.textContent; }) }; }); });
    var tot = await admin.$eval('#t-state', function (e) { return e.textContent; });
    console.log('§EODA_SCREEN_SEEN ' + J(scr.map(function (r) { return [r.till, r.closed, r.cells[2], r.cells[3]]; })) + ' total=' + tot);

    // ═══ AGG part 1 + GATE: screen
    ARM = 'gate';
    var st1 = scr.map(function (r) { return r.closed; }).join(''), byT = {}; scr.forEach(function (r) { byT[r.till] = r; });
    check('g1-screen-closed-open', scr.length === 3 && byT[tillKeys[0]] && byT[tillKeys[0]].closed === '1' && byT[tillKeys[1]].closed === '1' && byT[tillKeys[2]].closed === '0', 'the EODA screen shows T1 and T2 closed and T3 open (rows ' + st1 + ' in till-key order ' + J(scr.map(function (r) { return r.till; })) + ')', scr);
    var gx = await admin.$eval('#a-send', function (b) { return [b.disabled, b.getAttribute('data-needs-override')]; });
    check('g2-send-disabled-while-open', gx[0] === true && gx[1] === '1', 'with T3 open the "Send EODA" button is disabled and says it needs an override reason', gx);
    ARM = 'agg';
    var byTill = {}; scr.forEach(function (r) { byTill[r.till] = r.cells; });
    check('a1-screen-ranges', tillKeys.slice(0, 2).every(function (k, i) { var c = byTill[k]; return c && Number(c[2]) === rung[i].length && new RegExp('S 1\\.\\.' + rung[i].length + ' x' + rung[i].length).test(c[3]) && c[4].trim() === ''; }), 'T1 shows S 1..3 x3 and T2 S 1..2 x2 with no gaps', byTill);
    check('a2-screen-z-matches-till', [0, 1].every(function (i) { var c = byTill[tillKeys[i]]; return tillZ[i] && c && c[7] === money(tillZ[i].gross) && Object.keys(tillZ[i].tenders).every(function (n) { return c[5].indexOf(n + ' ' + money(tillZ[i].tenders[n])) >= 0; }); }), 'each closed till\'s row shows the Z the till itself printed (gross and tender totals): ' + J(tillZ), { byTill: byTill, tillZ: tillZ });
    ARM = 'relay';
    var tillNetAll = REQ.filter(function (r) { return /^T/.test(r.dev); }).length, tillLanDay = LANREQ.filter(function (r) { return /^T/.test(r.dev); }).length;
    check('r1-day-nothing-travels', stage.day === 0, 'while 9 tickets are rung, the tills make 0 INTERNET-relay requests (their lines go to the branch relay: ' + tillLanDay + ' LAN requests so far)', stage.day);
    check('r2-till-writes-only-branch-lane', tillHub === 0 && tillBranch === 0 && LANREQ.some(function (r) { return /^T/.test(r.dev) && r.m === 'PUT' && /\/h\//.test(r.p); }), 'at Close Cash the tills put the shift on the BRANCH RELAY (LAN, a /h/ file) and make 0 internet-relay writes: hub ' + tillHub + ', branch box on the internet ' + tillBranch, { tillHub: tillHub, tillBranch: tillBranch });
    check('r3-hq-holds-nothing-yet', hqAfterClose === 0 && zero[0] === 0, 'head office holds 0 ticket rows and 0 statement rows after two tills closed and every device Visited', hqAfterClose);
    check('r3b-hand-offs-reached-admin', hnd.length >= 4 && hnd.filter(function (x) { return x.kind === 'T'; }).reduce(function (a, x) { return a + Number(x.n); }, 0) === 5, 'non-vacuous: the admin holds the 5 hand-off ticket rows (3 + 2) and 2 Z rows', hnd);

    // ═══ PARTIAL: Send status now (T1 + T2)
    ARM = 'partial'; console.log('§E3 "Send status now": T1 and T2 so far, marked PARTIAL');
    var mk1 = mark(); var s1 = await admin.evaluate(function () { return window.BranchAdmin.send(true); }); await visitAll([A]);
    var sreq1 = since(mk1).filter(function (r) { return r.dev === 'D'; });
    var hq1 = { o: await T.rows(A, 'SELECT documentno, count(*) AS n FROM i_order GROUP BY documentno'), p: await T.rows(A, 'SELECT documentno, count(*) AS n FROM i_payment GROUP BY documentno'), st: await T.rows(A, 'SELECT * FROM pos_branchdaystatement ORDER BY seq, kind, tillkey') };
    var k12 = rung[0].concat(rung[1]);
    check('p1-partial-rows-arrived', s1 && s1.partial === true && s1.tickets === 5 && hq1.o.length === 5 && k12.every(function (k) { return hq1.o.some(function (x) { return x.documentno === k && Number(x.n) === SHAPE[k]; }); }), 'the partial send carried the 5 closed tickets of T1 and T2 to head office, each once with its lines; T3\'s 4 tickets are not there', { s1: s1, o: hq1.o });
    check('p2-partial-marked', hq1.st.length === 3 && hq1.st.every(function (r) { return r.partial === 'Y' && Number(r.seq) === 1; }), 'the statement rows of that send (2 tills + the branch row) are all marked Partial=Y, seq 1', hq1.st.map(function (r) { return [r.kind, r.tillkey, r.partial, r.seq]; }));

    // ═══ GATE: refused without override, recorded with one
    ARM = 'gate'; console.log('§E4 Send EODA with T3 still open: refused without a reason; accepted with one and the reason is recorded');
    var before = Number((await T.rows(A, 'SELECT count(*) AS n FROM pos_branchdaystatement'))[0].n);
    await admin.fill('#a-override', ''); var r0 = await admin.evaluate(function () { return window.BranchAdmin.send(false, ''); }); await visitAll([A]);
    var after0 = Number((await T.rows(A, 'SELECT count(*) AS n FROM pos_branchdaystatement'))[0].n);
    check('g3-refused-without-override', r0 && r0.refused === 'open-till' && after0 === before, 'Send EODA with T3 open and no reason is REFUSED (refused=' + (r0 && r0.refused) + ') and head office gets nothing (' + before + ' -> ' + after0 + ' statement rows)', { r0: r0, before: before, after0: after0 });
    var REASON = 'T3 cashier is still serving; sending the other two tills';
    await admin.fill('#a-override', REASON); var gx2 = await admin.$eval('#a-send', function (b) { return b.disabled; });
    var mk2 = mark(); var r1 = await admin.evaluate(function (rs) { return window.BranchAdmin.send(false, rs); }, REASON); await visitAll([A]);
    var sreq2 = since(mk2).filter(function (r) { return r.dev === 'D'; });
    var br2 = (await T.rows(A, "SELECT * FROM pos_branchdaystatement WHERE kind='B' AND seq=2"))[0], store = await admin.evaluate(function () { return window.BranchAdmin.state().set.overrides; });
    var ovLog = D.logs.filter(function (l) { return /^§EODA_OVERRIDE /.test(l); });
    check('g4-override-enables-and-is-recorded', gx2 === false && r1 && r1.batch && br2 && br2.override === REASON && store.length === 1 && store[0].reason === REASON && ovLog.length === 1, 'with a reason the button enables, the send goes (batch ' + (r1 && r1.batch) + ') and the reason is recorded in the statement\'s branch row at head office, in the admin\'s store and in one §EODA_OVERRIDE line', { gx2: gx2, br2: br2 && br2.override, store: store, ovLog: ovLog });
    check('g5-override-names-open-till', store[0] && store[0].open.length === 1 && store[0].open[0] === tillKeys[2], 'the recorded override names the open till (' + tillKeys[2] + ')', store);

    // ═══ T3 closes; the final EODA needs no override
    ARM = 'agg'; console.log('§E5 T3 closes; the admin sends the final EODA with no override');
    closeReq[2] = await closeShift(2); tillZ[2] = zOf(TL[2]);
    await visitAll([A, D, A]); await admin.evaluate(function () { return window.BranchAdmin.refresh(); });
    await admin.fill('#a-override', ''); await admin.dispatchEvent('#a-override', 'input'); await sleep(300);
    var gx3 = await admin.$eval('#a-send', function (b) { return [b.disabled, b.getAttribute('data-needs-override')]; });
    ARM = 'gate'; check('g6-enabled-when-all-closed', gx3[0] === false && gx3[1] === '0', 'once T3 has closed the "Send EODA" button is enabled with no reason typed', gx3);
    ARM = 'agg';
    var mk3 = mark(); var r3 = await admin.evaluate(function () { return window.BranchAdmin.send(false); }); await visitAll([A]);
    var sreq3 = since(mk3).filter(function (r) { return r.dev === 'D'; });
    var all = rung[0].concat(rung[1], rung[2]);
    var hq = { o: await T.rows(A, 'SELECT documentno, count(*) AS n, sum(qtyordered*priceactual) AS v FROM i_order GROUP BY documentno'), p: await T.rows(A, 'SELECT documentno, count(*) AS n, sum(payamt) AS a FROM i_payment GROUP BY documentno'),
      oAll: await T.rows(A, 'SELECT count(*) AS n FROM i_order'), pAll: await T.rows(A, 'SELECT count(*) AS n FROM i_payment'), st: await T.rows(A, 'SELECT * FROM pos_branchdaystatement ORDER BY seq, kind, tillkey') };
    var expLines = all.reduce(function (a, k) { return a + SHAPE[k]; }, 0);
    check('a3-every-key-once', r3 && r3.tickets === 4 && hq.o.length === 9 && all.every(function (k) { return hq.o.some(function (x) { return x.documentno === k && Number(x.n) === SHAPE[k]; }) && hq.p.some(function (x) { return x.documentno === k && Number(x.n) === 1; }); }) && Number(hq.oAll[0].n) === expLines && Number(hq.pAll[0].n) === 9,
      'after partial + override + final, head office holds all 9 ticket keys exactly once (' + expLines + ' I_Order lines, 9 I_Payment): the final send carried only T3\'s 4 new tickets', { r3: r3, o: hq.o.length, oAll: hq.oAll, pAll: hq.pAll });
    var fin = hq.st.filter(function (r) { return Number(r.seq) === 3; }), fl = fin.filter(function (r) { return r.kind === 'L'; }), fb = fin.filter(function (r) { return r.kind === 'B'; })[0];
    var sumZ = tillZ.reduce(function (a, z) { a.gross += z.gross; a.tickets += z.tickets; Object.keys(z.tenders).forEach(function (n) { a.tenders[n] = (a.tenders[n] || 0) + z.tenders[n]; }); return a; }, { gross: 0, tickets: 0, tenders: {} });
    var stT = fb ? JSON.parse(fb.tenders) : {};
    check('a4-statement-totals-equal-sum-of-z', fl.length === 3 && fb && fb.partial === 'N' && Number(fb.gross) === sumZ.gross && Number(fb.tickets) === sumZ.tickets && J(Object.keys(stT).sort().map(function (n) { return [n, stT[n]]; })) === J(Object.keys(sumZ.tenders).sort().map(function (n) { return [n, sumZ.tenders[n]]; })),
      'the final statement (seq 3, Partial N) has 3 till lines and a branch row whose gross ' + (fb && fb.gross) + ', tickets ' + (fb && fb.tickets) + ' and tender totals ' + J(stT) + ' equal the SUM of the three tills\' own Z ' + J(sumZ), { fb: fb && [fb.gross, fb.tickets, fb.tenders], sumZ: sumZ });
    check('a5-lines-equal-each-z', fl.every(function (r) { var i = tillKeys.indexOf(r.tillkey); return i >= 0 && tillZ[i] && Number(r.gross) === tillZ[i].gross && Number(r.tickets) === tillZ[i].tickets && J(sortO(JSON.parse(r.tenders))) === J(sortO(tillZ[i].tenders)); }), 'each till line of the statement equals that till\'s own Z (tickets, gross, tenders by name)', fl.map(function (r) { return [r.tillkey, r.gross, r.tickets, r.tenders]; }));
    var ser = fl.map(function (r) { return JSON.parse(r.series).S; });
    check('a6-ranges', ser.length === 3 && fl.every(function (r, i) { var ti = tillKeys.indexOf(r.tillkey), s = JSON.parse(r.series).S; return s && s.first === 1 && s.last === rung[ti].length && s.count === rung[ti].length; }), 'the declared ticket ranges are S 1..n with count n per till (3, 2, 4)', fl.map(function (r) { return [r.tillkey, r.series]; }));
    // the values at head office agree with the statement: independent recompute of the held rows
    var heldGross = 0; hq.o.forEach(function (x) { heldGross += Math.round(Number(x.v) * 100); });
    console.log('§EODA_AGG tickets_at_hq=' + hq.o.length + ' i_order_lines=' + hq.oAll[0].n + ' i_payment=' + hq.pAll[0].n + ' statement_gross=' + (fb && fb.gross) + ' sum_of_till_z_gross=' + sumZ.gross + ' held_lines_value=' + heldGross + ' tills=' + fl.map(function (r) { return r.tillkey + ':' + r.tickets + '/' + r.gross; }).join(' '));
    ARM = 'partial';
    var nStmt = await T.rows(A, 'SELECT seq, partial, count(*) AS n FROM pos_branchdaystatement GROUP BY seq, partial ORDER BY seq');
    check('p3-final-supersedes-partial', J(nStmt.map(function (x) { return [Number(x.seq), x.partial]; })) === J([[1, 'Y'], [2, 'N'], [3, 'N']]) && Number(hq.oAll[0].n) === expLines, 'head office holds batches 1 (PARTIAL), 2, 3; the final send did not double the rows sent earlier', nStmt);

    // ═══ RELAY
    ARM = 'relay';
    var rr = function (a) { return { n: a.length, puts: puts(a), hubPuts: puts(a, null, 'hub'), brPuts: puts(a, null, 'branch') }; }, R1 = rr(sreq1), R2 = rr(sreq2), R3 = rr(sreq3);
    console.log('§EODA_RELAY sends (admin D): partial 5 tickets -> requests=' + R1.n + ' puts=' + R1.puts + ' (hub ' + R1.hubPuts + ' branch ' + R1.brPuts + ') | override send 0 new tickets -> requests=' + R2.n + ' puts=' + R2.puts + ' (hub ' + R2.hubPuts + ') | final 4 tickets -> requests=' + R3.n + ' puts=' + R3.puts + ' (hub ' + R3.hubPuts + ')');
    var allTill = REQ.filter(function (r) { return /^T/.test(r.dev); }), tillHubAll = puts(allTill, null, 'hub');
    console.log('§EODA_RELAY tills over the whole run after setup: hub-lane puts=' + puts(REQ.slice(mkDay).filter(function (r) { return /^T/.test(r.dev); }), null, 'hub') + ' (3 tills, 9 tickets, 3 shifts)');
    var tillHubRun = puts(REQ.slice(mkDay).filter(function (r) { return /^T/.test(r.dev); }), null, 'hub');
    check('r4-tills-never-write-to-hub', tillHubRun === 0 && REQ.filter(function (r) { return /^T/.test(r.dev); }).length === 0, 'W-TILL-AIRGAP: over the whole run (setup included) the three tills made ' + REQ.filter(function (r) { return /^T/.test(r.dev); }).length + ' internet-relay requests (hub-lane puts ' + tillHubRun + '); D (main) made ' + REQ.filter(function (r) { return r.dev === 'D'; }).length, tillHubRun);
    check('r5-only-admin-send-crosses', R1.hubPuts > 0 && R3.hubPuts > 0 && Number(hq1.o.length) === 5, 'non-vacuous: the admin\'s sends DID write to the hub lane (partial ' + R1.hubPuts + ', final ' + R3.hubPuts + ') and that is how the rows reached head office', { R1: R1, R3: R3 });
    check('r6-send-requests-not-growing-with-tickets', R3.n <= R1.n + 2 && R2.n <= R1.n + 2 && R1.hubPuts === R3.hubPuts, 'requests per send do not grow with tickets: 5 tickets -> ' + R1.n + ', 4 tickets -> ' + R3.n + ', 0 new tickets -> ' + R2.n + '; hub-lane puts equal (' + R1.hubPuts + ' / ' + R3.hubPuts + ')', { R1: R1, R2: R2, R3: R3 });
    check('r7-one-visit-per-send', R1.hubPuts <= 2 && R3.hubPuts <= 2, 'a send is ONE Visit: at most 2 hub-lane puts for any size of batch (measured ' + R1.hubPuts + ' and ' + R3.hubPuts + ')', { R1: R1, R3: R3 });
    var scale = R3.hubPuts <= R1.hubPuts + 0;     // the old path: every till Visits at Close Cash (3 tills = 3 hub-lane Visits); baseline on origin/main in witness_till_delivery §TILL_RELAY
    console.log('§EODA_RELAY hub-lane writes for the whole branch day: tills=' + tillHubRun + ' admin=' + (R1.hubPuts + R2.hubPuts + R3.hubPuts) + ' (3 sends: partial, override, final); old path = one till Visit per Close Cash per till (see §TILL_RELAY of witness_till_delivery on origin/main)');

    // dump head office's batch for the Day Close witness (witness_eoda_close.js)
    var dump = { day: null, tills: tillKeys, keys: rung, shape: SHAPE, i_order: await T.rows(A, 'SELECT * FROM i_order ORDER BY ABS(i_order_id)'), i_payment: await T.rows(A, 'SELECT * FROM i_payment ORDER BY ABS(i_payment_id)'), stmt: await T.rows(A, 'SELECT * FROM pos_branchdaystatement ORDER BY seq, kind, tillkey'), tillZ: tillZ, org: 12 };
    dump.day = String((dump.i_order[0] || {}).dateordered || '').slice(0, 10);
    var dumpFile = process.env.EODA_DUMP || path.join(LOGS, 'hq_batch.json'); fs.writeFileSync(dumpFile, J(dump)); console.log('§EODA_DUMP ' + dumpFile + ' i_order=' + dump.i_order.length + ' i_payment=' + dump.i_payment.length + ' statement=' + dump.stmt.length + ' day=' + dump.day);
  }

  console.log('§EODA_PAGE_ERRORS n=' + errors.length + (errors.length ? ' ' + J(errors.slice(0, 3)) : ''));
  ARM = ARMS[0]; V[ARM].judged++; if (errors.length) V[ARM].failed++; console.log('  §EODA_CHECK arm=' + ARM + ' key=page-errors ' + (errors.length ? 'FAIL' : 'OK') + ' 0 page errors on the five pages');
  console.log('§EODA_NETREQ internet-relay requests per device: ' + J(REQ.reduce(function (a, r) { a[r.dev] = (a[r.dev] || 0) + 1; return a; }, {})) + ' | branch-relay requests per device: ' + J(LANREQ.reduce(function (a, r) { a[r.dev] = (a[r.dev] || 0) + 1; return a; }, {})));
  await browser.close(); server.close(); relayProc.kill('SIGTERM');
  var names = { agg: 'W-EODA-AGG', gate: 'W-EODA-GATE', partial: 'W-EODA-PARTIAL', relay: 'W-EODA-RELAY' }, bad = 0;
  ARMS.forEach(function (a) { var v = V[a], verdict = !v.judged ? 'INCONCLUSIVE' : v.failed ? 'FAIL' : 'PASS'; if (verdict !== 'PASS') bad++; console.log('§EODA_VERDICT ' + names[a] + ' verdict=' + verdict + ' judged=' + v.judged + ' failed=' + v.failed + (MUTNAME ? ' mutant=' + MUTNAME : '')); });
  process.exit(bad ? 1 : 0);
})().catch(function (e) { console.log('§EODA_CRASH ' + (e && e.stack || e)); process.exit(3); });
