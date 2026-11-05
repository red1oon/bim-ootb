#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-BRANCH-COUNT (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §37; owner D7 blind stock, D10 ad hoc). READ THE LOG after every run: every verdict is a § line, the exit code is not the evidence.
// THE ISSUES: (BLIND) the branch POS admin's stock count screen, its DB and its stored state never hold or show a book quantity; (ADHOC) a count is kept at the branch and only a count the supervisor ticked "Include this count in tonight's EODA"
//   reaches head office, as I_Inventory rows inside the ONE EODA send; (RELAY) a count never makes a send of its own: saving makes 0 pipe requests and the EODA's hub-lane writes / requests are the same with a count as without one;
//   (CLOSE) head office's Branch Day Close with ImportInventory=Y stamps the book from ITS storage, runs Import Inventory and completes: M_StorageOnHand == the counted quantities and the difference documents == count - book.
// HARNESS: erp/tests/witness_eoda.js (head office A, branch POS admin D, tills T1 T2 T3, signed POS plan, ONE dumb folder pipe, every request attributed to its device). Stage 2 (this file with BCNT_STAGE=close) runs Day Close on a head-office kernel over the dump.
// Arms: count (blind + ad hoc), relay, close.  Mutants (copies, each proven applied exactly once; a crash is not a kill): book-shown, extra-visit, tick-ignored (stage 1); hq-no-import (stage 2).
// Run: node erp/tests/witness_branch_count.js 2>&1 | tee /tmp/count_logs/branch_count.log        mutant: BCNT_MUT=<name>
'use strict';
var path = require('path'), http = require('http'), fs = require('fs'), os = require('os'), vm = require('vm'), nodeCrypto = require('crypto'), cp = require('child_process'), url = require('url');
var ROOT = process.env.BCNT_ROOT || path.join(__dirname, '..', '..'), ERP = path.join(ROOT, 'erp');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var subtle = nodeCrypto.webcrypto.subtle, J = JSON.stringify, sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
var MUTNAME = process.env.BCNT_MUT || '', LOGS = process.env.BCNT_LOGS || '/tmp/count_logs', DUMP = path.join(LOGS, 'bcnt_hq_batch' + (MUTNAME ? '_' + MUTNAME : '') + '.json');
var ARMS = ['count', 'relay', 'close'], V = { count: { judged: 0, failed: 0 }, relay: { judged: 0, failed: 0 }, close: { judged: 0, failed: 0 } }, errors = [], ARM = 'count';
function check(key, ok, label, info) { var v = V[ARM]; v.judged++; if (!ok) v.failed++; console.log('  §BCNT_CHECK arm=' + ARM + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' ' + label + (ok ? '' : ' got=' + J(info).slice(0, 700))); return ok; }
function walk(d, rel, out) { if (!fs.existsSync(d)) return out; fs.readdirSync(d).forEach(function (n) { var p = path.join(d, n), r = rel ? rel + '/' + n : n; if (fs.statSync(p).isDirectory()) walk(p, r, out); else out.push(r); }); return out; }
function canon(o) { if (o === null || typeof o !== 'object') return J(o); if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']'; return '{' + Object.keys(o).sort().map(function (k) { return J(k) + ':' + canon(o[k]); }).join(',') + '}'; }
async function mkKey() { var kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']), j = await subtle.exportKey('jwk', kp.publicKey); return { priv: kp.privateKey, pub: { kty: j.kty, crv: j.crv, x: j.x, y: j.y } }; }
async function signObj(obj, key) { var b = JSON.parse(J(obj)); delete b.sig; delete b.signer; var s = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.priv, new TextEncoder().encode(canon(b))); var o = JSON.parse(J(b)); o.signer = key.pub; o.sig = Buffer.from(s).toString('hex'); return o; }
function loadPlan(file, g) { var o = {}; vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window: o, globalThis: o }); return o[g]; }
var planJs = function (name, o) { return '(function (g) { g.' + name + ' = ' + J(o) + '; })(typeof window !== \'undefined\' ? window : globalThis);\n'; };
var money = function (c) { return (Number(c) / 100).toFixed(2); }, toCents = function (s) { return Math.round(Number(s) * 100); };
var AZ = 128, HO = 129, LOC = 102, BOOK0 = { 128: 47, 129: 53 };     // HQ's stock of the two products at the branch's sales-floor locator before the day (a fixture of stage 2); the branch is never told
var COUNT_A = { 'Azalea Bush': 30 }, COUNT_B = { 'Azalea Bush': 36, 'Holly Bush': 45 };   // A: an abandoned spot check (kept at the branch); B: the supervisor's count (included in the EODA). Sold today: 9 x Azalea, 5 x Holly -> HQ book 38 / 48
// mutants: [file, anchor (must occur exactly once), replacement, arm that must go red]
var MUTS = {
  'book-shown': ['/erp/branch_admin.js', "/*BOOK-ANCHOR*/", "rows('SELECT COALESCE(SUM(qtyonhand),0) AS s FROM m_storageonhand').then(function (r) { var e = document.createElement('p'); e.setAttribute('data-book', '1'); e.textContent = 'Book quantity ' + r[0].s; $('#a-count').appendChild(e); });", 'count'],
  'extra-visit': ['/erp/branch_admin.js', "S.set.counts.push(c); S.set.draft = []; saveSet(); renderCount();", "S.set.counts.push(c); S.set.draft = []; saveSet(); renderCount(); if (c.include) { await depositGroup(countRows(c).map(function (r) { return create('i_inventory', r); })); c.sent = true; await E.TeamSync.visit(); }", 'relay'],
  'tick-ignored': ['/erp/branch_admin.js', "include: include === undefined ? !!$('#c-include').checked : !!include,", "include: true,", 'count'],
  'hq-no-import': ['/erp/plugins/friendly_ops.mjs', "const ri = ap.runInTrx(trx, P_IMPORT_INVENTORY, { params: { AD_Client_ID: C, AD_Org_ID: org, DocAction: 'CO', DeleteOldImported: 'N' } });", "const ri = { ok: true, summary: 'mutant: Import Inventory skipped' };", 'close']
};

(async function main() {
  if (process.env.BCNT_STAGE === 'close') return closeStage();
  console.log('═══ W-BRANCH-COUNT — the branch blind stocktake from the main till (prompts/POS_PLUGIN_LOCAL_FIRST.md §37) ═══' + (MUTNAME ? ' MUTANT=' + MUTNAME : ''));
  fs.mkdirSync(LOGS, { recursive: true });
  var POSPLAN = loadPlan(path.join(ROOT, 'erp', 'team_plan_pos.js'), 'TEAM_PLAN_POS'), OFFICE = loadPlan(path.join(ROOT, 'erp', 'team_plan.js'), 'TEAM_PLAN');
  var FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'bcnt-')), cur = { plans: {}, over: {} };
  if (MUTNAME) { var m = MUTS[MUTNAME]; if (!m) { console.log('§BCNT_CRASH unknown mutant'); process.exit(2); }
    var orig = fs.readFileSync(path.join(ROOT, m[0]), 'utf8'); if (orig.split(m[1]).length !== 2) { console.log('§BCNT_CRASH MUTATION DID NOT APPLY exactly once ' + m[0]); process.exit(2); }
    if (MUTNAME !== 'hq-no-import') { cur.over[m[0]] = orig.replace(m[1], function () { return m[2]; }); ARMS = [m[3]]; } else ARMS = ['close'];
    console.log('§BCNT_MUTANT applied ' + MUTNAME + ' in ' + m[0] + ' (anchor found exactly once)'); }
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
    pg.on('console', function (m) { var t = m.text(); logs.push(t); if (/^§(EODA|TEAM_HELD|TEAM_HOLD)|🔴/.test(t)) console.log('   [' + name + '] ' + t.slice(0, 300)); });
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
    visit: function (d) { var done = false; return Promise.race([eng(d, async function (W) { var v = await W.TeamSync.visit(); return v && v.replicaIn; }).then(function (v) { done = true; return v; }), sleep(120000).then(function () { if (!done) console.log('   §BCNT_STEP visit on ' + d.name + ' did not return in 120 s'); return null; })]); },
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
  var haveAdmin = true, D = haveAdmin ? await open('D', '/erp/branch_admin.html?login=50001' + qsMain, function () { return window.BranchAdmin && window.BranchAdmin.ready; }).catch(function (e) { console.log('§BCNT_PAGE branch_admin.html did not boot: ' + String(e && e.message).slice(0, 160)); return null; }) : null;
  if (!D) console.log('§BCNT_PAGE erp/branch_admin.html is ' + (haveAdmin ? 'present but did not boot' : 'ABSENT') + ' (RED: the branch POS admin is not built)');
  var tillLogins = [50001, 102, 101], TL = [];
  for (var i = 0; i < 3; i++) TL.push(await open('T' + (i + 1), '/erp/till.html?login=' + tillLogins[i] + qsBase, function () { return window.Till && window.Till.ready; }).catch(function (e) { console.log('§BCNT_PAGE till T' + (i + 1) + ' did not boot: ' + String(e && e.message).slice(0, 160)); return null; }));
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


  // ═══ the day, then the count (stage 1: real devices)
  var admin = null, SEND = {}, REQDEV = function (arr, dev) { return arr.filter(function (r) { return r.dev === dev; }); };
  if (setupOk) {
    admin = D.pg;
    for (var ti = 0; ti < 3; ti++) { await pgs[ti].click('#u1 .u-user:has-text("GardenAdmin")'); await pgs[ti].click('#u2 [data-panel="Sales"]'); }
    console.log('§BCNT_DAY three tills ring 9 tickets (9 x Azalea Bush, 5 x Holly Bush), all three Close Cash; the branch POS admin holds the hand-offs');
    await ring(0, 3); await ring(1, 2, 1); await ring(2, 4);
    for (var cs = 0; cs < 3; cs++) await closeShift(cs);
    await visitAll([A, D, A]);
    await admin.fill('#a-tills', tillKeys.join(', ')); await admin.dispatchEvent('#a-tills', 'change'); await sleep(400); await admin.evaluate(function () { return window.BranchAdmin.refresh(); });
    var gx = await admin.$eval('#a-send', function (b) { return [b.disabled, b.getAttribute('data-needs-override')]; });
    ARM = 'count'; check('d0-all-closed', gx[0] === false && gx[1] === '0' && rung[0].length + rung[1].length + rung[2].length === 9, 'precondition: 9 tickets rung, every till closed (Send EODA enabled, no override needed)', gx);
    var KEYQ = async function (name, qty) { await admin.fill('#c-find', name); await admin.fill('#c-qty', String(qty)); await admin.click('#c-add'); await admin.waitForFunction(function (n) { return !!document.querySelector('#c-draft tr[data-cline="' + n + '"]'); }, name, { timeout: 10000 }); };
    var SAVE = async function (tick) { var n0 = await admin.$$eval('#c-saved tr', function (t) { return t.length; }); await admin.setChecked('#c-include', !!tick); var mk = mark(); await admin.click('#c-save');
      await admin.waitForFunction(function (n) { return document.querySelectorAll('#c-saved tr').length > n; }, n0, { timeout: 15000 }); await sleep(500); return REQDEV(since(mk), 'D'); };
    var scr0 = await admin.evaluate(function () { return window.BranchAdmin.salesLocator(); });
    // count A: an abandoned spot check, tick OFF
    await KEYQ('Azalea Bush', COUNT_A['Azalea Bush']); var reqA = await SAVE(false);
    var cntA = await admin.evaluate(function () { return window.BranchAdmin.state().set.counts[0]; });
    // EODA #1: no count included
    var mk1 = mark(); var s1 = await admin.evaluate(function () { return window.BranchAdmin.send(false); }); await visitAll([A]); SEND.s1 = REQDEV(since(mk1), 'D');
    var hqInv1 = await T.rows(A, 'SELECT * FROM i_inventory');
    // count B: the supervisor's count, tick ON
    await KEYQ('Azalea Bush', COUNT_B['Azalea Bush']); await KEYQ('Holly Bush', COUNT_B['Holly Bush']); var reqB = await SAVE(true);
    var cntB = await admin.evaluate(function () { return window.BranchAdmin.state().set.counts[1]; });
    var hqInvBeforeSend2 = await T.rows(A, 'SELECT * FROM i_inventory');
    var mk2 = mark(); var s2 = await admin.evaluate(function () { return window.BranchAdmin.send(false); }); await visitAll([A]); SEND.s2 = REQDEV(since(mk2), 'D');
    var hqInv2 = await T.rows(A, 'SELECT * FROM i_inventory ORDER BY ABS(i_inventory_id)');
    var mk3 = mark(); var s3 = await admin.evaluate(function () { return window.BranchAdmin.send(false); }); await visitAll([A]); SEND.s3 = REQDEV(since(mk3), 'D');
    var hqInv3 = await T.rows(A, 'SELECT * FROM i_inventory ORDER BY ABS(i_inventory_id)');

    // ── BLIND + AD HOC
    ARM = 'count';
    check('c0-locator', !!scr0 && scr0.value === 'Default Store Locator' && !!cntA && cntA.locator === scr0.value, 'the count is of the branch sales-floor locator (the c_pos warehouse default locator "Default Store Locator"), not typed by the counter', { scr0: scr0, cntA: cntA && cntA.locator });
    check('c1-adhoc-not-in-eoda', s1 && s1.tickets === 9 && hqInv1.length === 0, 'an ad hoc count (tick OFF) is NOT part of the EODA: send #1 carried the 9 tickets (' + (s1 && s1.tickets) + ') and head office holds ' + hqInv1.length + ' I_Inventory rows', { s1: s1, n: hqInv1.length });
    check('c2-save-is-local', cntA && cntA.include === false && cntA.sent === false && cntB && cntB.include === true && hqInvBeforeSend2.length === 0, 'saving a count (either way) writes nothing to head office: A include=false, B include=true, head office still holds ' + hqInvBeforeSend2.length + ' rows before the next EODA', { cntA: cntA, cntB: cntB && [cntB.include, cntB.sent], n: hqInvBeforeSend2.length });
    var byDesc = {}; hqInv2.forEach(function (r) { (byDesc[r.description] = byDesc[r.description] || []).push(r); });
    check('c3-tick-rides-eoda', s2 && hqInv2.length === 2 && Object.keys(byDesc).join() === cntB.id && hqInv2.every(function (r) { return r.i_isimported === 'N' && r.doctypename === 'Material Physical Inventory' && r.locatorvalue === 'Default Store Locator' && Number(r.ad_org_id) === 12; }) &&
      ['Azalea Bush', 'Holly Bush'].every(function (v) { return hqInv2.some(function (r) { return r.value === v && Number(r.qtycount) === COUNT_B[v]; }); }), 'the ticked count B reaches head office in the EODA as 2 I_Inventory declarations (Azalea Bush 36, Holly Bush 45, locator Default Store Locator, doctype Material Physical Inventory), and only B', { n: hqInv2.length, desc: Object.keys(byDesc), rows: hqInv2.map(function (r) { return [r.value, r.qtycount, r.locatorvalue]; }) });
    var stF = await admin.evaluate(function () { return window.BranchAdmin.state().set.counts.map(function (c) { return [c.id, c.include, c.sent]; }); });
    var domF = await admin.$$eval('#c-saved tr', function (t) { return t.map(function (r) { return [r.getAttribute('data-count'), r.getAttribute('data-include'), r.getAttribute('data-sent')]; }); });
    check('c4-adhoc-stays-at-branch', hqInv3.length === 2 && !hqInv3.some(function (r) { return r.description === cntA.id; }) && J(stF) === J([[cntA.id, false, false], [cntB.id, true, true]]) && J(domF) === J([[cntA.id, '0', '0'], [cntB.id, '1', '1']]), 'count A never leaves the branch (not at head office after three sends; the screen lists it "kept at the branch": include=0 sent=0) and B is marked sent', { stF: stF, domF: domF, n: hqInv3.length });
    check('c5-no-resend', hqInv3.length === 2, 'a third EODA does not send B again (head office still 2 rows)', hqInv3.length);
    var gl = D.logs.filter(function (l) { return /^§COUNT_GATHER /.test(l); });
    check('c6-gather-seam', gl.length === 2 && gl.every(function (l) { return /reached=3 notReached=0/.test(l); }), 'the LAN gather seam (wired to the branch relay by §38) is called once per saved count and reports the 3 tills the main till collected (reached=3 notReached=0); it never blocks', gl);
    // BLIND: the screen, the stored state and the branch DBs never hold a book quantity
    var scrTxt = await admin.$eval('#a-count', function (e) { return e.innerText + ' ' + [].map.call(e.querySelectorAll('[data-book]'), function (x) { return x.outerHTML; }).join(' '); }), stateJson = await admin.evaluate(function () { return JSON.stringify(window.BranchAdmin.state().set); });
    var BOOKNUM = /\b(47|53|38|48)\b/;
    check('b1-no-book-on-screen', !/book|on.?hand|stock level/i.test(scrTxt) && !BOOKNUM.test(scrTxt), 'the count screen text has no "book"/"on hand" label and none of the HQ book numbers (47, 53, 38, 48)', scrTxt.slice(0, 400));
    check('b2-no-book-in-state', !/book/i.test(stateJson) && !BOOKNUM.test(J(JSON.parse(stateJson).counts)), 'the admin\'s stored state (counts, draft) has no book field and no book number', stateJson.slice(0, 300));
    var dInv = await T.rows(D, 'SELECT count(*) AS n, SUM(CASE WHEN qtybook IS NOT NULL THEN 1 ELSE 0 END) AS withbook FROM i_inventory'), hqBook = await T.rows(A, 'SELECT SUM(CASE WHEN qtybook IS NOT NULL THEN 1 ELSE 0 END) AS withbook FROM i_inventory');
    check('b3-no-qtybook-column-value', Number(dInv[0].n) === 2 && Number(dInv[0].withbook || 0) === 0 && Number(hqBook[0].withbook || 0) === 0, 'non-vacuous: the branch DB holds the 2 count rows and neither it nor head office\'s copy has a QtyBook value (the plan row does not carry it)', { dInv: dInv, hqBook: hqBook });
    var seedSane = Number((await T.rows(D, 'SELECT count(*) AS n FROM m_storageonhand WHERE m_locator_id=' + LOC))[0].n) >= 1, stor = [];
    for (var dv of [D].concat(TL)) stor.push(Number((await T.rows(dv, 'SELECT count(*) AS n FROM m_storageonhand WHERE m_locator_id=' + LOC + ' AND m_product_id IN (' + AZ + ',' + HO + ')'))[0].n));
    check('b4-branch-db-has-no-stock-rows', seedSane && stor.every(function (n) { return n === 0; }), 'non-vacuous (the query works: the seed holds a row at the locator): the branch admin and all three tills hold 0 M_StorageOnHand rows for the counted products at the sales-floor locator', { seedSane: seedSane, stor: stor });

    // ── RELAY
    ARM = 'relay';
    var P = function (a) { return { n: a.length, hub: puts(a, null, 'hub'), all: puts(a) }; }, Q1 = P(SEND.s1), Q2 = P(SEND.s2), Q3 = P(SEND.s3);
    console.log('§BCNT_RELAY save A requests=' + reqA.length + ' | save B requests=' + reqB.length + ' | EODA#1 (9 tickets, no count) requests=' + Q1.n + ' hubPuts=' + Q1.hub + ' | EODA#2 (count B, 0 new tickets) requests=' + Q2.n + ' hubPuts=' + Q2.hub + ' | EODA#3 (nothing new, no count) requests=' + Q3.n + ' hubPuts=' + Q3.hub);
    check('r1-save-makes-no-request', reqA.length === 0 && reqB.length === 0, 'saving a count (tick OFF or ON) makes 0 pipe requests: a count is never a send of its own (A ' + reqA.length + ', B ' + reqB.length + ')', { reqA: reqA.length, reqB: reqB.length });
    check('r2-count-adds-no-request', Q2.hub > 0 && Q2.n === Q3.n && Q2.hub === Q3.hub && Q2.all === Q3.all, 'the EODA that carries the count (' + Q2.n + ' requests, ' + Q2.hub + ' hub puts) equals an EODA without one (' + Q3.n + ', ' + Q3.hub + '): the count rides the ONE send', { Q2: Q2, Q3: Q3 });
    check('r3-same-as-ticket-eoda', Q1.hub === Q2.hub && Q1.hub <= 2, 'EODA #1 (9 tickets, no count) and EODA #2 (count only) both write the same hub-lane puts (' + Q1.hub + ' / ' + Q2.hub + '), at most 2 (ONE Visit)', { Q1: Q1, Q2: Q2 });
    check('r4-count-in-send-log', D.logs.some(function (l) { return /^§EODA_SEND batch=\S+ .* counts=2 /.test(l); }) && D.logs.filter(function (l) { return /^§EODA_SEND /.test(l); }).length === 3, 'non-vacuous: the admin\'s own log says the second send carried counts=2 and only 3 sends were made', D.logs.filter(function (l) { return /^§EODA_SEND /.test(l); }));

    // the dump for stage 2
    var dump = { day: null, org: 12, tills: tillKeys, keys: rung, i_order: await T.rows(A, 'SELECT * FROM i_order ORDER BY ABS(i_order_id)'), i_payment: await T.rows(A, 'SELECT * FROM i_payment ORDER BY ABS(i_payment_id)'), stmt: await T.rows(A, 'SELECT * FROM pos_branchdaystatement ORDER BY seq, kind, tillkey'),
      i_inventory: hqInv3, countA: cntA && cntA.id, countB: cntB && cntB.id, book0: BOOK0, locator: LOC, warehouse: 104, products: { 'Azalea Bush': AZ, 'Holly Bush': HO }, counts: COUNT_B };
    dump.day = String((dump.i_order[0] || {}).dateordered || '').slice(0, 10);
    fs.writeFileSync(DUMP, J(dump)); console.log('§BCNT_DUMP ' + DUMP + ' i_order=' + dump.i_order.length + ' i_payment=' + dump.i_payment.length + ' i_inventory=' + dump.i_inventory.length + ' day=' + dump.day);
  }
  console.log('§BCNT_PAGE_ERRORS n=' + errors.length + (errors.length ? ' ' + J(errors.slice(0, 3)) : ''));
  ARM = ARMS[0]; V[ARM].judged++; if (errors.length) V[ARM].failed++; console.log('  §BCNT_CHECK arm=' + ARM + ' key=page-errors ' + (errors.length ? 'FAIL' : 'OK') + ' 0 page errors on the five pages');
  await browser.close(); server.close(); relayProc.kill('SIGTERM');
  // ═══ stage 2: head office's Day Close over the dump, in its own process
  if (ARMS.indexOf('close') >= 0) {
    ARM = 'close'; var envc = Object.assign({}, process.env, { BCNT_STAGE: 'close', BCNT_DUMP: DUMP }), tmpPlug = null;
    if (MUTNAME === 'hq-no-import') { var mm = MUTS[MUTNAME], src0 = fs.readFileSync(path.join(ROOT, mm[0]), 'utf8'); tmpPlug = path.join(ERP, 'plugins', 'zz_mut_friendly_ops.mjs'); fs.writeFileSync(tmpPlug, src0.replace(mm[1], function () { return mm[2]; })); envc.BCNT_PLUGIN = tmpPlug; }
    var r = cp.spawnSync('node', [__filename], { env: envc, encoding: 'utf8', maxBuffer: 1 << 28, timeout: 600000 }); if (tmpPlug) try { fs.unlinkSync(tmpPlug); } catch (e) { /* gone */ }
    fs.writeFileSync(path.join(LOGS, 'bcnt_close_stage' + (MUTNAME ? '_' + MUTNAME : '') + '.log'), (r.stdout || '') + (r.stderr ? '\n--stderr--\n' + r.stderr : ''));
    String(r.stdout || '').split('\n').filter(function (l) { return /§BCNT_CHECK|§DAYCLOSE-(BOOK|STEP|RESULT)|§BCNT_CLOSE|§IMPORT_INVENTORY/.test(l); }).forEach(function (l) { console.log(l.slice(0, 480)); });
    var mv = /§BCNT_CLOSE_VERDICT judged=(\d+) failed=(\d+)/.exec(r.stdout || ''); if (mv) { V.close.judged += Number(mv[1]); V.close.failed += Number(mv[2]); } else { V.close.judged++; V.close.failed++; console.log('  §BCNT_CHECK arm=close key=stage2-ran FAIL the close stage printed no verdict (crash is not a kill): ' + String(r.stderr || '').slice(0, 300)); }
  }
  var names = { count: 'W-BRANCH-COUNT-BLIND+ADHOC', relay: 'W-BRANCH-COUNT-RELAY', close: 'W-BRANCH-COUNT-CLOSE' }, bad = 0;
  ARMS.forEach(function (a) { var v = V[a], verdict = !v.judged ? 'INCONCLUSIVE' : v.failed ? 'FAIL' : 'PASS'; if (verdict !== 'PASS') bad++; console.log('§BCNT_VERDICT ' + names[a] + ' verdict=' + verdict + ' judged=' + v.judged + ' failed=' + v.failed + (MUTNAME ? ' mutant=' + MUTNAME : '')); });
  process.exit(bad ? 1 : 0);
})().catch(function (e) { console.log('§BCNT_CRASH ' + (e && e.stack || e)); process.exit(3); });

// ═══ stage 2: head office's Branch Day Close with ImportInventory=Y over what head office received (the dump)
async function closeStage() {
  var dump = JSON.parse(fs.readFileSync(process.env.BCNT_DUMP, 'utf8')), DAY = dump.day, ORG = dump.org, LOC = dump.locator, WH = dump.warehouse;
  if (!global.window) global.window = {}; if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
  var SQLJS_DIR = process.env.SQLJS_DIR || '/home/red1/bim-ootb/tests/node_modules/sql.js'; if (!process.env.SQLJS) process.env.SQLJS = SQLJS_DIR;
  var initSqlJs = require(SQLJS_DIR), _log = console.log, SEEN = []; console.log = function () { SEEN.push(Array.prototype.join.call(arguments, ' ')); };
  var say = function (s) { _log(s); }, res = { judged: 0, failed: 0 };
  function chk(cs, key, label, ok, info) { res.judged++; if (!ok) res.failed++; say('  §BCNT_CHECK arm=close case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' ' + label + (ok ? '' : ' got=' + J(info).slice(0, 700))); }
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIR, 'dist', f); } });
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) { try { db.run(st); } catch (e) { /* the loader's own tolerance */ } } });
  function q0(sql, params) { var st = db.prepare(sql), o = []; try { if (params && params.length) st.bind(params); while (st.step()) { var r = st.getAsObject(), l = {}; for (var k in r) l[k.toLowerCase()] = r[k]; o.push(l); } } finally { st.free(); } return o; }
  var IT = require(path.join(ERP, 'ad_import_tables.js')); IT.ensure(db); require(path.join(ERP, 'ad_rule.js')).ensure(db); IT.ensurePos(db);
  global.ERPEngine = require(path.join(ERP, 'erp_engine.js'));
  var K = require(path.join(ERP, 'ws_kernel.js')), k = K.build(db), ML = k.ML, AP = require(path.join(ERP, 'ad_process.js')), PR = require(path.join(ERP, 'plugin_registry.js')); require(path.join(ERP, 'model_inventory.js'));
  db.run('UPDATE c_tax SET rate=0 WHERE c_tax_id=104'); db.run('UPDATE ad_orginfo SET c_location_id=114 WHERE ad_org_id=?', [ORG]);
  var S = { clientId: 11, orgId: 11, userId: 100, roleId: 102, warehouseId: 103, actor: 'witness:branch-count' }, one = function (sql, p) { return k.q(sql, p || [])[0] || null; };
  function commit(fn, meta) { var trx = new ML.Trx(k.q, k.env(S)), r; try { r = fn(trx, ML) || { ok: true }; } catch (ex) { r = { ok: false, error: 'model threw: ' + (ex && ex.message) }; trx.say('§MODEL-ERR ' + (ex && ex.stack || ex)); } var ok = r.ok !== false, ops = ok ? trx.groupOps() : [], ids = []; if (ok && ops.length) ids = k.commit(S, ops, meta); return Object.assign({}, r, { ok: ok, ops: ops, ids: ids, log: trx.log, trx: trx }); }
  var IDROP = /^(i_order_id|i_payment_id|i_inventory_id|.*_uu|created|createdby|updated|updatedby|processed|processing|i_errormsg|c_order_id|c_orderline_id|c_payment_id|c_invoice_id|m_inventory_id|m_inventoryline_id)$/;
  var clean = function (r) { var o = {}; Object.keys(r).forEach(function (c) { if (r[c] != null && !IDROP.test(c)) o[c] = r[c]; }); return o; };
  var saveAll = function (all) { return function (trx) { for (var i = 0; i < all.length; i++) { var sv = ML.save(trx, all[i].t, null, ML.newPO(trx, all[i].t, clean(all[i].f))); if (!sv.ok) return { ok: false, error: all[i].t + ' #' + i + ': ' + sv.error }; } return { ok: true }; }; };
  // the book before the day: HQ's own stock at the branch's sales-floor locator (the branch is never told)
  Object.keys(dump.book0).forEach(function (p) { db.run("INSERT INTO m_storageonhand (ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, m_locator_id, m_product_id, m_attributesetinstance_id, qtyonhand, datelastinventory, datematerialpolicy, m_storageonhand_uu) VALUES (11, ?, 'Y', '2026-11-01 00:00:00', 100, '2026-11-01 00:00:00', 100, ?, ?, 0, ?, NULL, '2026-11-01 00:00:00', ?)", [ORG, LOC, Number(p), dump.book0[p], 'bcnt-fix-' + p]); });
  var onhand = function (p) { return Number((one('SELECT COALESCE(SUM(qtyonhand),0) AS s FROM m_storageonhand WHERE m_locator_id=? AND m_product_id=?', [LOC, p]) || {}).s); };
  var oRows = dump.i_order, pRows = dump.i_payment, stmt = dump.stmt, invRows = dump.i_inventory;
  var dep = commit(saveAll(oRows.map(function (r) { return { t: 'i_order', f: r }; }).concat(pRows.map(function (r) { return { t: 'i_payment', f: r }; })).concat(invRows.map(function (r) { return { t: 'i_inventory', f: r }; }))), { ws: 'deposit' });
  var sCols = ['ad_client_id', 'ad_org_id', 'isactive', 'batchid', 'businessday', 'partial', 'seq', 'kind', 'tillkey', 'series', 'tickets', 'gross', 'net', 'tax', 'tenders', 'taxes', 'override'];
  stmt.forEach(function (r, i) { var f = {}; sCols.forEach(function (c) { if (r[c] != null) f[c] = r[c]; }); f.pos_branchdaystatement_id = 900 + i; var cols = Object.keys(f); db.run('INSERT INTO pos_branchdaystatement (' + cols.join(',') + ') VALUES (' + cols.map(function () { return '?'; }).join(',') + ')', cols.map(function (c) { return f[c]; })); });
  var pend0 = k.q("SELECT * FROM i_inventory WHERE i_isimported='N'");
  chk('FIX', 'rows-as-received', 'head office accepts what it received: ' + oRows.length + ' I_Order, ' + pRows.length + ' I_Payment, ' + pend0.length + ' pending I_Inventory (the branch\'s count B only), none carrying QtyBook', dep.ok && oRows.length === 9 + 5 && pend0.length === 2 && pend0.every(function (r) { return r.qtybook == null && r.description === dump.countB; }), { ok: dep.ok, err: dep.error, o: oRows.length, p: pend0.length });
  var sold = {}; oRows.forEach(function (r) { sold[r.m_product_id] = (sold[r.m_product_id] || 0) + Number(r.qtyordered); });   // independent oracle: the book after today's sales = HQ's stock - what the tills sold
  var exp = {}; Object.keys(dump.products).forEach(function (n) { var p = dump.products[n]; exp[n] = { p: p, book: dump.book0[p] - (sold[p] || 0), count: dump.counts[n] }; });
  say('§BCNT_FIXTURE book before the day=' + J(dump.book0) + ' sold today=' + J(sold) + ' expected book after sales=' + J(exp));
  var hostDb = { query: function (sql, p) { return q0(sql, p); }, run: function (sql, p) { db.run(sql, p || []); } }, host = { engineVersion: '1.0.0', db: hostDb, ops: { append: function () { return 1; } }, process: AP, docAction: ML, lens: { register: function () {}, removeOwner: function () {} }, import: function (u) { return import(url.pathToFileURL(path.resolve(path.join(ERP, 'plugins'), u)).href); } };
  var reg = PR.create(host), pm = await import(url.pathToFileURL(path.join(ERP, 'plugins', 'pos_integration.mjs')).href); await reg.installBundle(pm); await reg.startBundle('org.kernel.pos-integration');
  var fm = await import(url.pathToFileURL(process.env.BCNT_PLUGIN || path.join(ERP, 'plugins', 'friendly_ops.mjs')).href); await reg.installBundle(fm); var st2 = await reg.startBundle('org.kernel.friendly-ops');
  chk('PLUG', 'started', 'friendly-ops ACTIVE' + (process.env.BCNT_PLUGIN ? ' (MUTANT copy)' : ''), st2.state === 'ACTIVE', st2);
  var params = { BusinessDay: DAY, C_BankAccount_ID: 100, ImportInventory: 'Y' };
  var rc = commit(function (trx) { var r0 = AP.runInTrx(trx, 53405, { params: params }); return { ok: r0.ok, r: r0, error: r0.summary }; }, { ws: 'day_close' });
  var L = rc.log.filter(function (l) { return /^§(DAYCLOSE|POSS-TICKET|IMPORT_INVENTORY)/.test(l); }); L.forEach(function (l) { if (/^§(DAYCLOSE-(BOOK|STEP|RESULT)|IMPORT_INVENTORY )/.test(l)) say('  ' + l.slice(0, 420)); });
  var T = L.join('\n'), msg = String((rc.r && rc.r.summary) || rc.error || '');
  chk('CLOSE', 'closes', 'Branch Day Close with ImportInventory=Y finishes: ' + msg.slice(0, 120), rc.ok && /done/.test(msg) && !/STOPPED/.test(T), { msg: msg });
  var iPos = T.indexOf('step="Import POS Sales"'), iInv = T.indexOf('step="Import Inventory"'), iRep = T.indexOf('step="Replenish Report"');
  chk('CLOSE', 'order', 'legacy order: Import POS Sales, then Import Inventory, then the Replenish Report (log positions ' + [iPos, iInv, iRep] + ')', iPos >= 0 && iInv > iPos && iRep > iInv, { iPos: iPos, iInv: iInv, iRep: iRep });
  Object.keys(exp).forEach(function (n) {
    var e = exp[n], bl = new RegExp('§DAYCLOSE-BOOK org=' + ORG + ' row=\\d+ product=' + n + ' locator=Default Store Locator book=' + e.book + ' counted=' + e.count + ' difference=' + (e.count - e.book)).test(T);
    chk('BOOK', n, n + ': HQ stamped the book from ITS storage = ' + e.book + ' (stock ' + dump.book0[e.p] + ' - sold ' + (sold[e.p] || 0) + ', recomputed from the received tickets) against the count ' + e.count, bl, { e: e, log: T.split('\n').filter(function (l) { return l.indexOf('DAYCLOSE-BOOK') >= 0; }) });
    chk('STORAGE', n, n + ': M_StorageOnHand at the sales-floor locator == the counted quantity ' + e.count + ' (now ' + onhand(e.p) + ')', onhand(e.p) === e.count, { now: onhand(e.p) });
    var ir = one("SELECT * FROM i_inventory WHERE value=? AND description=?", [n, dump.countB]) || {}, ln = ir.m_inventoryline_id ? one('SELECT * FROM m_inventoryline WHERE m_inventoryline_id=?', [ir.m_inventoryline_id]) : null, hd = ir.m_inventory_id ? one('SELECT * FROM m_inventory WHERE m_inventory_id=?', [ir.m_inventory_id]) : null;
    var tr = ln ? k.q('SELECT SUM(movementqty) AS q, count(*) AS n FROM m_transaction WHERE m_inventoryline_id=?', [ln.m_inventoryline_id])[0] : null;
    chk('DIFFDOC', n, n + ': the Physical Inventory line has QtyBook ' + e.book + ' / QtyCount ' + e.count + ', header Completed, and the stock transaction == count - book = ' + (e.count - e.book), !!ln && !!hd && Number(ln.qtybook) === e.book && Number(ln.qtycount) === e.count && hd.docstatus === 'CO' && !!tr && Number(tr.q) === e.count - e.book && ir.i_isimported === 'Y',
      { ln: ln && [ln.qtybook, ln.qtycount], hd: hd && hd.docstatus, tr: tr, row: ir.i_isimported });
  });
  var h0 = one('SELECT count(*) AS n FROM m_inventory').n, l0 = one('SELECT count(*) AS n FROM m_inventoryline').n, t0 = one('SELECT count(*) AS n FROM m_transaction').n, s0 = [onhand(128), onhand(129)];
  var rc2 = commit(function (trx) { var r0 = AP.runInTrx(trx, 53405, { params: params }); return { ok: r0.ok, r: r0, error: r0.summary }; }, { ws: 'day_close2' });
  chk('RERUN', 'nothing-new', 'a second Day Close makes nothing new: physical inventories, lines, transactions and storage are unchanged', one('SELECT count(*) AS n FROM m_inventory').n === h0 && one('SELECT count(*) AS n FROM m_inventoryline').n === l0 && one('SELECT count(*) AS n FROM m_transaction').n === t0 && J([onhand(128), onhand(129)]) === J(s0), { ok: rc2.ok, now: [onhand(128), onhand(129)], s0: s0 });
  chk('ADHOC', 'A-not-at-hq', 'the abandoned count A never existed at head office: no I_Inventory row with its id and no Azalea line of 30', !one('SELECT 1 AS x FROM i_inventory WHERE description=?', [dump.countA]), { A: dump.countA });
  say('§BCNT_CLOSE_VERDICT judged=' + res.judged + ' failed=' + res.failed + ' verdict=' + (!res.judged ? 'INCONCLUSIVE' : res.failed ? 'FAIL' : 'PASS'));
  process.exit(res.failed ? 1 : 0);
}
