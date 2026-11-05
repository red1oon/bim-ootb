#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-LAN-CORS / W-TILL-AIRGAP / W-MAIN-COLLECT / W-STOCK-QUERY / W-MAIN-FLAG / W-BRANCH-RELAY-DOWN (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §38.3). READ THE LOG after every run: every verdict is a § line.
// THE ISSUES: (CORS) can a page at http://localhost call a plain-http LAN relay? (AIRGAP) do ordinary tills make ZERO internet-relay requests over a branch day, and the main till only the EODA send + SODA pull?
//   (COLLECT) is each order line stored once across repeated passes, the watermark advancing, a restart losing nothing? (QUERY) does the dumb till's answer equal SODA - collected + received, naming a till not reached, and keep no qty?
//   (FLAG) are LAN ops refused on a non-main till? (DOWN) with the relay stopped do tills keep selling and the collection catches up with nothing lost or doubled?
// HARNESS: the REAL erp/branch_relay.py as a child process; a counting fake internet relay (path /<device>/pipe/...); each "till PC" is a Chromium context on http://localhost:<port>/erp/tests/lan_harness.html (real browser fetches).
// LIMIT: one machine, loopback. A real multi-PC shop LAN (AP isolation, firewall) is NOT proven here.  Mutants are COPIES served by the harness, each proven applied once.
// Arms: BR_ARMS=cors,airgap,collect,query,flag,down  Mutant: BR_MUT=<name>.  Run: node erp/tests/witness_branch_relay.js 2>&1 | tee /tmp/branch_logs/relay.log
'use strict';
var path = require('path'), http = require('http'), fs = require('fs'), os = require('os'), cp = require('child_process');
var ROOT = process.env.BR_ROOT || path.join(__dirname, '..', '..'), LOGS = process.env.BR_LOGS || '/tmp/branch_logs';
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var ARMS = (process.env.BR_ARMS || 'cors,airgap,collect,query,flag,down,mirror').split(','), MUTNAME = process.env.BR_MUT || '';
var MUTS = {
  'till-uses-internet': [[['/erp/till_lan.js', "if (!o.isMain && o.net) throw new Error('TillLan: an ordinary till is built with the branch relay only');", ''],
    ['/erp/till_lan.js', "var sent = 0, left = st.out;", "if (o.net) { try { await o.net.put('x/' + o.tillKey, J({ ping: 1 })); } catch (e) {} } var sent = 0, left = st.out;"]], 'airgap'],
  'flag-check-off': [[['/erp/till_lan.js', "if (M.on) return null;", "if (true) return null;"]], 'flag']
};
function walkDir(d, rel, out) { if (!fs.existsSync(d)) return out; fs.readdirSync(d).forEach(function (n) { var p = path.join(d, n), r = rel ? rel + '/' + n : n; if (fs.statSync(p).isDirectory()) walkDir(p, r, out); else out.push(r); }); return out; }
var V = {}, ARM = '', J = JSON.stringify, sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
function check(key, ok, label, info) { var v = V[ARM] = V[ARM] || { judged: 0, failed: 0 }; v.judged++; if (!ok) v.failed++; console.log('  §BR_CHECK arm=' + ARM + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' ' + label + (ok ? '' : ' got=' + J(info).slice(0, 500))); return ok; }

(async function main() {
  console.log('═══ W-BRANCH-RELAY — main till + branch relay (prompts/POS_PLUGIN_LOCAL_FIRST.md §38) ═══ arms=' + ARMS.join(',') + (MUTNAME ? ' MUTANT=' + MUTNAME : ''));
  fs.mkdirSync(LOGS, { recursive: true });
  var over = {}, MUT = MUTS[MUTNAME];
  if (MUTNAME) { if (!MUT) { console.log('§BR_CRASH unknown mutant'); process.exit(2); }
    MUT[0].forEach(function (m) { var src = over[m[0]] || fs.readFileSync(path.join(ROOT, m[0]), 'utf8'); if (src.split(m[1]).length !== 2) { console.log('§BR_CRASH MUTATION DID NOT APPLY exactly once ' + m[1].slice(0, 50)); process.exit(2); } over[m[0]] = src.replace(m[1], function () { return m[2]; }); });
    console.log('§BR_MUTANT applied ' + MUTNAME + ' (' + MUT[0].length + ' anchors, each found exactly once)'); ARMS = [MUT[1]]; }
  // static server for the till PCs (localhost) with the mutant overrides
  var NETREQ = {}, PREFLIGHT = {};   // device -> count (the fake internet relay)
  var netFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'br-net-'));
  var app = http.createServer(function (req, res) {
    var u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
    var m = /^\/net\/([^/]+)\/pipe\/(.*)$/.exec(p);   // the internet relay stand-in, counted per device
    if (m) { var dev = m[1], rest = m[2]; if (req.method === 'OPTIONS') PREFLIGHT[dev] = (PREFLIGHT[dev] || 0) + 1; else NETREQ[dev] = (NETREQ[dev] || 0) + 1; res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', '*'); res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      if (rest.indexOf('list') === 0) { var pre = new URL(req.url, 'http://x').searchParams.get('prefix') || ''; res.writeHead(200); res.end(J(walkDir(netFolder, '', []).filter(function (n) { return n.indexOf(pre) === 0; }))); return; }
      var fp = path.join(netFolder, rest.replace(/^f\//, '')); if (req.method === 'PUT') { var ch = []; req.on('data', function (c) { ch.push(c); }); req.on('end', function () { fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, Buffer.concat(ch)); res.writeHead(200); res.end('ok'); }); return; }
      if (!fs.existsSync(fp)) { res.writeHead(404); res.end(); return; } res.writeHead(200); res.end(fs.readFileSync(fp)); return; }
    if (over[p]) { res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'text/plain' }); res.end(over[p]); return; }
    var f = path.join(ROOT, p); if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(function (r) { app.listen(0, '127.0.0.1', r); });
  var APP = 'http://localhost:' + app.address().port, NET = 'http://127.0.0.1:' + app.address().port + '/net';

  // the REAL branch relay (python3), its own request log is the count
  var RPORT = 18000 + Math.floor(Math.random() * 1000), BOX = fs.mkdtempSync(path.join(os.tmpdir(), 'br-box-')), relayLog = [], relay = null;
  function startRelay() { return new Promise(function (res, rej) { relay = cp.spawn('python3', [path.join(ROOT, 'erp', 'branch_relay.py'), '--port', String(RPORT), '--dir', BOX, '--bind', '127.0.0.1'], { stdio: ['ignore', 'ignore', 'pipe'] });
    relay.stderr.on('data', function (d) { String(d).split('\n').forEach(function (l) { if (l) { relayLog.push(l); if (l.indexOf('§RELAY_UP') === 0) res(); } }); }); relay.on('error', rej); }); }
  function stopRelay() { return new Promise(function (r) { if (!relay) return r(); relay.once('exit', function () { relay = null; r(); }); relay.kill('SIGTERM'); }); }
  await startRelay(); var RELAY = 'http://127.0.0.1:' + RPORT;
  var br = await reqPw().chromium.launch({ headless: true }), pcs = {}, logs = [];
  async function pc(till, extra) {   // a till PC: its own context (own localStorage), the page at http://localhost
    var ctx = pcs[till + (extra && extra.tag || '')] && pcs[till + (extra && extra.tag || '')].ctx || await br.newContext(); var page = await ctx.newPage();
    page.on('console', function (m) { var t = m.text(); logs.push(till + ' ' + t); if (/§(LAN|MAIN|STOCK)/.test(t)) console.log('  ' + till + ' ' + t); });
    page.on('pageerror', function (e) { console.log('§BR_PAGEERR ' + till + ' ' + e.message); });
    var q = new URLSearchParams(Object.assign({ till: till, relay: RELAY, expected: 'T1,T2,T3,M' }, extra && extra.q || {}));
    await page.goto(APP + '/erp/tests/lan_harness.html?' + q.toString()); await page.evaluate(function () { return window.mk(); });
    pcs[till + (extra && extra.tag || '')] = { ctx: ctx, page: page }; return page; }
  function wipe() { fs.readdirSync(BOX).forEach(function (n) { fs.rmSync(path.join(BOX, n), { recursive: true, force: true }); }); }
  var ev = function (page, fn, arg) { return page.evaluate(fn, arg); };
  var ORD = function (key, pid, qty) { return [{ documentno: key, m_product_id: pid, qtyordered: qty, priceactual: 1 }]; };
  var relayReqs = function (pre) { return relayLog.filter(function (l) { return l.indexOf('§RELAY ') === 0 && (!pre || l.indexOf(pre) >= 0); }).length; };
  var SUP = { supervisor: true, name: 'sup' };   // D13: the branch supervisor sets the flag (TillLan.setMain), no HQ row
  var sodaRow = function () { return SUP; };
  var stockRows = [{ kind: 'S', m_product_id: 100, detail: JSON.stringify({ qty: 50 }) }, { kind: 'S', m_product_id: 200, detail: JSON.stringify({ qty: 30 }) }];

  try {
    if (ARMS.indexOf('cors') >= 0) { ARM = 'cors';
      var p = await pc('T1'); var r = await ev(p, async function () { try { var ok = await LANPIPE.put('c/x', new TextEncoder().encode('hi')); var g = await LANPIPE.get('c/x'); var l = await LANPIPE.list('c/'); var a1 = await LANPIPE.putIfAbsent('c/x', new TextEncoder().encode('z')); return { origin: location.origin, secure: isSecureContext, ok: ok, got: g && new TextDecoder().decode(g), list: l, absent: a1 }; } catch (e) { return { err: String(e) }; } });
      check('cors-origin', /^http:\/\/localhost:/.test(r.origin || '') && r.secure === true, 'page is http://localhost and a secure context', r);
      check('cors-put-get-list', r.ok === true && r.got === 'hi' && J(r.list) === J(['c/x']), 'PUT/GET/list on a plain-http cross-origin relay, no mixed-content block', r);
      check('cors-absent', r.absent === false, 'PUT ?absent=1 on an existing name answers 412 (false)', r);
      var o = relayLog.filter(function (l) { return /OPTIONS/.test(l); }).length; check('cors-preflight', o > 0, 'a preflight was exercised (relay saw OPTIONS)', { options: o });
      console.log('§BR_VERDICT W-LAN-CORS ' + (V.cors.failed ? 'FAIL' : 'PASS') + ' judged=' + V.cors.judged); }

    if (ARMS.indexOf('collect') >= 0) { ARM = 'collect';
      var T1 = await pc('T1'), T2 = await pc('T2'), M = await pc('M', { q: { main: '1' } });
      await ev(M, function (rows) { L.setMain(true, rows); }, sodaRow('M'));
      await ev(T1, function (a) { return L.deposit('O-T1-S1', a.o1, []); }, { o1: ORD('O-T1-S1', 100, 2) });
      await ev(T2, function (a) { return L.deposit('O-T2-S1', a.o1.concat(a.o2), []); }, { o1: ORD('O-T2-S1', 100, 1), o2: ORD('O-T2-S1', 200, 4) });
      var c1 = await ev(M, function () { return L.collect(); }), c2 = await ev(M, function () { return L.collect(); });
      check('first-pass', c1.newLines === 3 && c1.newFiles === 2, 'pass 1 stores 3 lines from 2 files', c1);
      check('repass-nothing-new', c2.newLines === 0 && c2.newFiles === 0, 'pass 2 over the same relay stores nothing new (watermark)', c2);
      await ev(T1, function (a) { return L.deposit('O-T1-S2', a.o, []); }, { o: ORD('O-T1-S2', 200, 3) });
      var c3 = await ev(M, function () { return L.collect(); }); check('incremental', c3.newLines === 1 && c3.newFiles === 1, 'a new ticket adds exactly its 1 line', c3);
      var st0 = await ev(M, function () { return { wm: ST.main.wm, n: Object.keys(ST.main.lines).length }; });
      check('watermark', st0.wm.T1 === 2 && st0.wm.T2 === 1 && st0.n === 4, 'watermark T1=2 T2=1, 4 lines stored once', st0);
      // a re-deposit of an existing file name (same seq) must not double a line
      await ev(T1, function () { ST.seq = 0; return L.deposit('O-T1-S1', [{ documentno: 'O-T1-S1', m_product_id: 100, qtyordered: 2 }], []); });
      var c4 = await ev(M, function () { return L.collect(); }); var n4 = await ev(M, function () { return Object.keys(ST.main.lines).length; });
      check('no-double', n4 === 4, 'a re-sent deposit of the same ticket key does not double a line (key ticket#line)', { n4: n4, c4: c4 });
      // restart the main till: a NEW page, same context storage
      var before = await ev(M, function () { return JSON.stringify(ST.main); }); await M.close(); var M2 = await pc('M', { q: { main: '1' }, tag: '' });
      var after = await ev(M2, function () { return JSON.stringify(ST.main); }); check('restart-keeps', before === after && JSON.parse(after).on === true, 'restart: collected lines, watermark and flag persisted unchanged', { b: before.length, a: after.length });
      var c5 = await ev(M2, function () { return L.collect(); }); check('restart-nothing-redone', c5.newLines === 0, 'after restart a pass stores nothing already held', c5);
      console.log('§BR_COLLECT lines=4 files=4 passes=5 doubled=0'); console.log('§BR_VERDICT W-MAIN-COLLECT ' + (V.collect.failed ? 'FAIL' : 'PASS') + ' judged=' + V.collect.judged); }

    if (ARMS.indexOf('query') >= 0) { ARM = 'query'; wipe();
      var XQ = { expected: 'Q1,Q2,Q3,QM' }, D = await pc('Q3', { q: XQ }), Q1 = await pc('Q1', { q: XQ }), Q2 = await pc('Q2', { q: XQ }), Mq = await pc('QM', { q: Object.assign({ main: '1' }, XQ) });
      await ev(Mq, function (a) { L.setMain(true, a.m); L.applySodaStock(a.s); L.received(100, 5); return true; }, { m: sodaRow('QM'), s: stockRows });
      await ev(Q1, function (a) { return L.deposit('O-Q1-1', a.o, []); }, { o: ORD('O-Q1-1', 100, 4) }); await ev(Q2, function (a) { return L.deposit('O-Q2-1', a.o, []); }, { o: ORD('O-Q2-1', 100, 3) });
      for (var pg of [Q1, Q2, D, Mq]) await ev(pg, function () { return L.beat(); });
      var ansP = ev(D, function () { return L.ask(100, { tries: 40 }); }); await sleep(300); await ev(Mq, function () { return L.answerQueries(); }); var ans = await ansP; var stq = await ev(Mq, function () { return L.stock(100); });
      var exp = 50 - stq.sold + 5; check('answer-formula', ans.qty === exp && stq.sold === 7 && ans.qty === 48, 'answer == SODA 50 - collected ' + stq.sold + ' (4+3 rung at Q1,Q2) + received 5 = ' + exp, { ans: ans, stq: stq });
      check('answer-all-reached', ans.notReached.length === 0 && ans.atMost === false, 'all tills reached: exact figure', ans);
      // one till offline: advance the main till's clock beyond the heartbeat window
      await ev(Mq, function () { var t = Date.now() + 10 * 60000; window.NOW = function () { return t; }; return true; }); await ev(Mq, function () { window.NOW = function () { return Date.now() + 10 * 60000; }; return L.beat(); });
      await ev(Q1, function () { window.NOW = function () { return Date.now() + 10 * 60000; }; return L.beat(); });   // only Q1 and the main are alive 10 minutes on; Q2 and Q3 went quiet
      var ansP2 = ev(D, function () { return L.ask(100, { tries: 40 }); }); await sleep(300); await ev(Mq, function () { return L.answerQueries(); }); var ans2 = await ansP2;
      check('at-most-names-till', ans2.atMost === true && J(ans2.notReached) === J(['Q2', 'Q3']) && J(ans2.reached) === J(['Q1', 'QM']), 'stale heartbeats: "at most", the tills not reached are named', ans2);
      var dstate = await ev(D, function () { return JSON.stringify(ST) + JSON.stringify(Object.assign({}, localStorage)); });
      check('dumb-till-keeps-no-qty', dstate.indexOf('"qty"') < 0 && dstate.indexOf('qtyordered') < 0 && dstate.indexOf('"qn":2') >= 0, 'the asking till stores the question counter only: no quantity (D7)', dstate.slice(0, 300));
      var dumbAsMain = await ev(D, function () { return L.answerQueries(); }); check('dumb-cannot-answer', dumbAsMain.refused === 'not-main', 'a dumb till cannot run the answer pass', dumbAsMain);
      console.log('§BR_QUERY example product=100 soda=50 sold=' + stq.sold + ' received=5 answer=' + ans.qty + ' | stale: qty=' + ans2.qty + ' atMost=' + ans2.atMost + ' notReached=' + ans2.notReached.join(','));
      console.log('§BR_VERDICT W-STOCK-QUERY ' + (V.query.failed ? 'FAIL' : 'PASS') + ' judged=' + V.query.judged); }

    if (ARMS.indexOf('flag') >= 0) { ARM = 'flag';
      var Td = await pc('T9'); 
      var res = await ev(Td, async function () { var out = {}; ['collect', 'answerQueries'].forEach(function (k) { out[k] = null; }); try { out.collect = await L.collect(); } catch (e) { out.collect = { ranOnNonMain: String(e.message) }; } try { out.answer = await L.answerQueries(); } catch (e) { out.answer = { ranOnNonMain: String(e.message) }; } try { out.recv = L.received(1, 1); } catch (e) { out.recv = { ranOnNonMain: String(e.message) }; } out.setOther = L.setMain(true, { supervisor: false }).refused === 'not-supervisor' ? false : true; out.on = L.isMain(); return out; });
      check('collect-refused', res.collect && res.collect.refused === 'not-main' && /not the branch main till/.test(res.collect.message), 'collect refused with a clear message on a non-main till', res.collect);
      check('answer-refused', res.answer && res.answer.refused === 'not-main', 'stock check refused', res.answer);
      check('receive-refused', res.recv && res.recv.refused === 'not-main', 'receive stock refused', res.recv);
      check('flag-only-supervisor', res.setOther === false && res.on === false, 'a non-supervisor cannot make this till main', res);
      var self = await ev(Td, function (a) { return L.setMain(true, a).on; }, SUP); check('flag-from-supervisor', self === true, 'the supervisor sets the flag on this till', self);
      var ctor = await ev(Td, function () { try { TillLan.create({ tillKey: 'X', isMain: false, net: {}, lan: {}, state: {} }); return 'built'; } catch (e) { return String(e.message); } });
      check('ordinary-has-no-net', /relay only/.test(ctor), 'an ordinary till cannot even be constructed with an internet pipe', ctor);
      console.log('§BR_VERDICT W-MAIN-FLAG ' + (V.flag.failed ? 'FAIL' : 'PASS') + ' judged=' + V.flag.judged); }

    if (ARMS.indexOf('airgap') >= 0) { ARM = 'airgap'; wipe(); NETREQ = {}; var base = relayReqs();
      var tills = {}; for (var t of ['A1', 'A2', 'A3']) tills[t] = await pc(t, { q: Object.assign({ expected: 'A1,A2,A3,AM' }, MUTNAME ? { net: NET + '/' + t + '/pipe' } : {}) });
      var AM = await pc('AM', { q: { main: '1', expected: 'A1,A2,A3,AM', net: NET + '/AM/pipe' } });
      await ev(AM, function (a) { L.setMain(true, a.m); }, { m: sodaRow('AM') });
      var soda = await ev(AM, async function (s) { var b = await NET.get('soda/' + 'latest'); return b === null ? 'none' : 'got'; }, null);   // the ONE SODA pull
      var n = 0; for (var d = 0; d < 3; d++) for (var t2 of ['A1', 'A2', 'A3']) { n++; await ev(tills[t2], function (a) { return L.deposit(a.k, a.o, []); }, { k: 'O-' + t2 + '-' + d, o: ORD('O-' + t2 + '-' + d, 100, 1) }); }
      await ev(AM, function () { return L.collect(); });
      for (var t3 of ['A1', 'A2', 'A3']) await ev(tills[t3], function (a) { return L.depositShift(1, [{ kind: 'T' }]); });
      var cc = await ev(AM, function () { return L.collect(); });
      await ev(AM, async function () { await NET.put('hub/eoda/batch1', new TextEncoder().encode('{"eoda":1}')); return true; });   // the ONE EODA send
      var lanReq = relayReqs() - base;
      check('tills-zero-internet', ['A1', 'A2', 'A3'].every(function (t) { return !NETREQ[t]; }), 'ordinary tills made 0 internet-relay requests over the day (relay requests seen: ' + lanReq + ')', NETREQ);
      check('main-exactly-two', NETREQ['AM'] === 2, 'the main till made exactly the SODA pull + the EODA send = 2 internet-relay requests', NETREQ);
      check('day-collected', cc.ok && n === 9, '9 tickets rung, collected over the LAN', { n: n, cc: cc });
      console.log('§BR_NETREQ ' + J(NETREQ) + ' preflightsNotCounted=' + J(PREFLIGHT) + ' lanRequests=' + lanReq);
      console.log('§BR_VERDICT W-TILL-AIRGAP ' + (V.airgap.failed ? 'FAIL' : 'PASS') + ' judged=' + V.airgap.judged); }

    if (ARMS.indexOf('down') >= 0) { ARM = 'down'; wipe();
      var B1 = await pc('B1', { q: { expected: 'B1,B2,BM' } }), B2 = await pc('B2', { q: { expected: 'B1,B2,BM' } }), BM = await pc('BM', { q: { main: '1', expected: 'B1,B2,BM' } });
      await ev(BM, function (a) { L.setMain(true, a.m); }, { m: sodaRow('BM') });
      await ev(B1, function (a) { return L.deposit('O-B1-1', a.o, []); }, { o: ORD('O-B1-1', 100, 1) });
      await stopRelay();
      var dn = await ev(B1, async function (a) { var r1 = await L.deposit('O-B1-2', a.o, []); var r2 = await L.depositShift(1, [{ kind: 'T' }]); return { r1: r1, r2: r2, queued: ST.out.length }; }, { o: ORD('O-B1-2', 100, 2) });
      var dn2 = await ev(B2, function (a) { return L.deposit('O-B2-1', a.o, []); }, { o: ORD('O-B2-1', 200, 1) });
      check('keeps-selling', dn.r1.sent === 0 && dn.queued === 2 && dn2.queued === 1, 'relay down: deposits queue on the till, nothing thrown, selling continues', { dn: dn, dn2: dn2 });
      var cd = await ev(BM, function () { return L.collect(); }); check('collect-relay-down', cd.ok === false && cd.reason === 'relay-down', 'main collect says relay-down, loses nothing', cd);
      var ask = await ev(B2, function () { return L.ask(100, { tries: 2, gapMs: 10 }); }); check('ask-unreachable', ask.unreachable === true && /not reachable/.test(ask.message), 'stock query: "main till not reachable", till unaffected', ask);
      await startRelay();
      var f1 = await ev(B1, function () { return L.flush(); }), f2 = await ev(B2, function () { return L.flush(); }); check('flush-catches-up', f1.sent === 2 && f2.sent === 1 && f1.queued === 0, 'relay back: queues flush in order', { f1: f1, f2: f2 });
      var cu = await ev(BM, function () { return L.collect(); }), cu2 = await ev(BM, function () { return L.collect(); });
      var tot = await ev(BM, function () { return Object.keys(ST.main.lines).length; });
      check('catch-up-no-loss-no-double', tot === 3 && cu2.newLines === 0, 'after catch-up the main holds all 3 lines (1 before + 2 queued), a second pass adds none', { tot: tot, cu: cu, cu2: cu2 });
      console.log('§BR_VERDICT W-BRANCH-RELAY-DOWN ' + (V.down.failed ? 'FAIL' : 'PASS') + ' judged=' + V.down.judged); }

    if (ARMS.indexOf('mirror') >= 0) { ARM = 'mirror'; wipe(); NETREQ = {};
      var MM = await pc('MM', { q: { main: '1', expected: 'MM,MT', net: NET + '/MM/pipe' } }), MT = await pc('MT', { q: { expected: 'MM,MT' } });
      await ev(MM, function (a) { L.setMain(true, a.m); }, { m: sodaRow('MM') });
      var SP = 's/' + 'ab'.repeat(32) + '/';
      await ev(MM, async function (a) { var e = function (x) { return new TextEncoder().encode(x); }; await NET.put(a.sp + 'o/hubkid/1', e('ROSTER')); await NET.put(a.sp + 'h/hubkid', e('HEAD1')); await NET.put(a.sp + 'm/p_x/o/hubkid/1', e('P')); return true; }, { sp: SP });
      await ev(MT, async function (a) { var e = function (x) { return new TextEncoder().encode(x); }; await LANPIPE.put(a.sp + 'o/tillkid/1', e('ENROLL')); await LANPIPE.put(a.sp + 'm/b_shop/o/hubkid/1', e('SODA-LAN-ONLY')); return true; }, { sp: SP });
      var m1 = await ev(MM, function () { return L.mirror(NET, LANPIPE); });
      var onLan = await ev(MT, function (a) { return LANPIPE.list(a.sp); }, { sp: SP }), onNet = await ev(MM, function (a) { return NET.list(a.sp); }, { sp: SP });
      check('down-copied', ['o/hubkid/1', 'h/hubkid', 'm/p_x/o/hubkid/1'].every(function (n) { return onLan.indexOf(SP + n) >= 0; }), 'roster, head and the hub mail reach the LAN (an ordinary till sees them through the branch relay alone)', onLan);
      check('up-copied', onNet.indexOf(SP + 'o/tillkid/1') >= 0, 'the till\'s enrolment request reaches the internet relay through the main till', onNet);
      check('branch-box-stays-on-lan', onNet.indexOf(SP + 'm/b_shop/o/hubkid/1') < 0 && onLan.indexOf(SP + 'm/b_shop/o/hubkid/1') >= 0, 'the branch mailbox (m/b_*) never leaves the LAN', { onNet: onNet });
      await ev(MM, function (a) { return NET.put(a.sp + 'h/hubkid', new TextEncoder().encode('HEAD2-LONGER')); }, { sp: SP });
      var m2 = await ev(MM, function () { return L.mirror(NET, LANPIPE); }), hd = await ev(MT, async function (a) { return new TextDecoder().decode(await LANPIPE.get(a.sp + 'h/hubkid')); }, { sp: SP });
      var m3 = await ev(MM, function () { return L.mirror(NET, LANPIPE); });
      check('mutable-head-refreshed', hd === 'HEAD2-LONGER' && m2.down === 1, 'a changed head is re-copied once', { hd: hd, m2: m2 });
      check('idempotent', m3.down === 0 && m3.up === 0, 'a mirror pass with nothing new copies nothing', m3);
      var refused = await ev(MT, function () { return L.mirror(LANPIPE, LANPIPE); }); check('mirror-main-only', refused.refused === 'not-main', 'a non-main till cannot bridge', refused);
      console.log('§BR_VERDICT W-MIRROR ' + (V.mirror.failed ? 'FAIL' : 'PASS') + ' judged=' + V.mirror.judged); }
  } catch (e) { console.log('§BR_CRASH ' + (e && e.stack || e)); }
  await br.close(); await stopRelay(); app.close();
  var bad = Object.keys(V).filter(function (k) { return V[k].failed; }), empty = ARMS.filter(function (a) { return !V[a]; });
  console.log('§BR_SUMMARY arms=' + J(V) + (empty.length ? ' INCONCLUSIVE(no checks): ' + empty.join(',') : '') + (MUTNAME ? ' mutant=' + MUTNAME + (bad.length ? ' KILLED' : ' SURVIVED') : ''));
  process.exit(MUTNAME ? (bad.length ? 0 : 1) : (bad.length || empty.length ? 1 : 0));
})();
