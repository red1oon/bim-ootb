#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/**
 * witness_comm_cl3_folder.js — W-FOLDER-2CTX. Spec: bim-compiler prompts/TEAMWORK_FRAMEWORK.md §12.4 (CL3).
 *
 * Two REAL Playwright BrowserContexts (separate storage — the S5 setting where today's sidecars fork for good),
 * each on common/comm/comm_poc.html with its OWN WebCrypto device key and comm.db. Their ONLY channel is one folder,
 * reached through a dumb file server (PUT/GET a name, list a prefix — no ids, no order, no auth, no merge).
 * Driven through the POC page's API via page.evaluate: an engine-in-real-browser test, not a UI test (UI = CL-P).
 *
 * Arms (each names the issue it proves or disproves):
 *   §2CTX-ISOLATED — before any visit each context holds only its own ops (no hidden shared storage doing the work).
 *   §2CTX-CONVERGE — after visits both hold the same ops in the same order.
 *   §2CTX-FOLD     — the REAL erp/kernel_ops.js + erp/crud_core.js listTip fold both to identical c_order rows,
 *                    each order carrying its OWN edit (the CL1 defect scenario, across two real browsers).
 *   §2CTX-RECEIPT  — each context's ops are SEEN by the other (proven by the other's signed head).
 *   §2CTX-PIPE     — the folder holds only o/ h/ objects (the pipe stored bytes and nothing else; keys ride in ENROLL ops).
 *   §2CTX-ROSTER   — trust is the CL4 roster: A founds the space (genesis = the invite), enrols B (role 103) from B's code;
 *                    writes are judged by the real MRole.canUpdate port on the browser's ad_seed.db — B's org-12 order is
 *                    REFUSED in BOTH browsers (role 103 has no org-12 access), never folded.
 *
 * Run: node common/tests/witness_comm_cl3_folder.js 2>&1 | tee /tmp/witness_comm_cl3_folder.log
 */
'use strict';
var path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
var ROOT = path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }

var fails = 0, judged = 0, inconclusive = [];
function verdict(ok, label, detail) { judged++; if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }

function walk(d, rel, out) { if (!fs.existsSync(d)) return out; fs.readdirSync(d).forEach(function (n) { var p = path.join(d, n), r = rel ? rel + '/' + n : n;
  if (fs.statSync(p).isDirectory()) walk(p, r, out); else out.push(r); }); return out; }

(async function () {
  console.log('═══ W-FOLDER-2CTX — two real browser contexts, one folder, no relay logic (TEAMWORK_FRAMEWORK §12.4) ═══\n');
  var FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'comm-2ctx-'));
  var server = http.createServer(function (req, res) {
    var u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
    if (p === '/pipe/list') {                                   // the dumb folder: list a prefix
      var pre = u.searchParams.get('prefix') || '';
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(walk(FOLDER, '', []).filter(function (n) { return n.indexOf(pre) === 0; }))); return;
    }
    if (p.indexOf('/pipe/f/') === 0) {                          // the dumb folder: put / get a name
      var fp = path.join(FOLDER, p.slice(8)); if (fp.indexOf(FOLDER) !== 0) { res.writeHead(400); res.end(); return; }
      if (req.method === 'PUT') { var chunks = []; req.on('data', function (c) { chunks.push(c); });
        req.on('end', function () { fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, Buffer.concat(chunks)); res.writeHead(200); res.end('ok'); }); return; }
      if (!fs.existsSync(fp)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); return;
    }
    var f = path.join(ROOT, p);
    if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + server.address().port;
  var browser = await reqPw().chromium.launch({ args: ['--disable-gpu'] });
  try {
    var ctxA = await browser.newContext(), ctxB = await browser.newContext();
    var A = await ctxA.newPage(), Bp = await ctxB.newPage();
    [['A', A], ['B', Bp]].forEach(function (x) { x[1].on('console', function (m) { if (/§/.test(m.text())) console.log('     [' + x[0] + '] ' + m.text()); });
      x[1].on('pageerror', function (e) { console.log('     [' + x[0] + '] 🔴 pageerror ' + e.message); fails++; }); });
    for (var pg of [A, Bp]) { await pg.goto(base + '/common/comm/comm_poc.html', { waitUntil: 'load' }); }
    var idA = await A.evaluate(function (b) { return CommPOC.init(b); }, base + '/pipe');
    var idB = await Bp.evaluate(function (b) { return CommPOC.init(b); }, base + '/pipe');
    var kidA = idA.kid, kidB = idB.kid;
    var space = await A.evaluate(function () { return CommPOC.found('cl3-2ctx', 102); });
    await Bp.evaluate(function (s) { return CommPOC.join(s); }, space);
    await A.evaluate(function (peer) { return CommPOC.enrollPeer(peer, 'B', 103); }, idB);
    console.log('   §2CTX devices A=' + kidA + ' B=' + kidB + ' space=' + space.slice(0, 12) + ' folder=' + FOLDER);

    var uuA = await A.evaluate(async function () { var u = await CommPOC.createOrder('A-1', 100); await CommPOC.editOrder(u, 100, 111); return u; });
    var uuB = await Bp.evaluate(async function () { var u = await CommPOC.createOrder('B-1', 200); await CommPOC.editOrder(u, 200, 222); return u; });
    await Bp.evaluate(function () { return CommPOC.createOrder('B-12', 300, 12); });   // role 103 has no org-12 access
    console.log('\n§2CTX-ISOLATED');
    var sA0 = await A.evaluate(function () { return CommPOC.state(); }), sB0 = await Bp.evaluate(function () { return CommPOC.state(); });
    verdict(sA0.ops === 5 && sB0.ops === 3, 'each context holds only its own ops before any visit (A: genesis+person+enrol+2, B: 3)', 'A=' + sA0.ops + ' B=' + sB0.ops);

    console.log('\n§2CTX visits A, B, A, B');
    for (var round = 0; round < 2; round++) { await A.evaluate(function () { return CommPOC.visit(); }); await Bp.evaluate(function () { return CommPOC.visit(); }); }

    console.log('\n§2CTX-CONVERGE');
    var sA = await A.evaluate(function () { return CommPOC.state(); }), sB = await Bp.evaluate(function () { return CommPOC.state(); });
    console.log('   §2CTX state A ops=' + sA.ops + ' placed=' + sA.placed + ' order=' + sA.orderHash + '   B ops=' + sB.ops + ' placed=' + sB.placed + ' order=' + sB.orderHash);
    verdict(sA.business === 4 && sB.business === 4 && sA.parked === 0 && sB.parked === 0, 'the 4 allowed business ops placed in both', sA.business + '/' + sB.business);
    console.log('\n§2CTX-ROSTER');
    verdict(sA.rosterOk && sB.rosterOk && sA.devices === 2 && sB.devices === 2, 'both browsers fold the same roster (2 devices, trusted genesis)');
    verdict(sA.refused === 1 && sB.refused === 1, "B's org-12 order is REFUSED in both browsers (real canUpdate, role 103)", 'refused A/B=' + sA.refused + '/' + sB.refused);
    verdict(sA.orderHash === sB.orderHash, 'same order in both contexts');

    console.log('\n§2CTX-FOLD (real kernel_ops + crud_core.listTip)');
    var fA = await A.evaluate(function () { return CommPOC.fold(); }), fB = await Bp.evaluate(function () { return CommPOC.fold(); });
    if (!fA.length) inconclusive.push('fold returned no rows');
    var byDoc = {}; fA.forEach(function (r) { byDoc[r.documentno] = r; });
    verdict(JSON.stringify(fA) === JSON.stringify(fB), 'both contexts fold identical rows', JSON.stringify(fA));
    verdict(fA.length === 2 && (byDoc['A-1'] || {}).grandtotal === 111 && (byDoc['B-1'] || {}).grandtotal === 222, 'each order carries its own edit (A-1=111, B-1=222)');
    verdict((byDoc['A-1'] || {}).c_order_uu === uuA && (byDoc['B-1'] || {}).c_order_uu === uuB, 'each row keeps the UU its own browser minted');

    console.log('\n§2CTX-RECEIPT');
    function show(d) { return d.map(function (x) { return x.seq + ':' + x.state; }).join(' '); }
    console.log('   §2CTX delivery A: ' + show(sA.delivery) + '   B: ' + show(sB.delivery));
    verdict(sA.delivery.every(function (x) { return x.state === 'SEEN' && x.seenBy.indexOf(kidB) >= 0; }), "A's ops SEEN by B (B's signed head)");
    if (!sA.delivery.length || !sB.delivery.length) inconclusive.push('no delivery rows to judge');
    var b3 = sB.delivery.filter(function (x) { return x.seq === 3; })[0] || {};
    console.log('   §2CTX B seq3 (org 12) delivery=' + b3.state + ' verdict=' + b3.verdict + ' reason=' + b3.reason);
    verdict(b3.state === 'SEEN' && b3.verdict === 'REFUSED' && /^access:/.test(b3.reason || ''), "B is told its org-12 order was delivered AND refused, with the AD reason");
    verdict(sB.delivery.every(function (x) { return x.state === 'SEEN' && x.seenBy.indexOf(kidA) >= 0; }), "B's ops SEEN by A (A's signed head)");

    console.log('\n§2CTX-PIPE');
    var names = walk(FOLDER, '', []), stray = names.filter(function (n) { return !/^(o|h)\//.test(n); });
    console.log('   §2CTX folder objects=' + names.length + ': ' + names.map(function (n) { return n.replace(/\.[0-9a-f]{12}\.bimpack$/, '.…bimpack'); }).join(' '));
    verdict(names.length > 0 && !stray.length, 'the folder holds only o/ h/ objects');
    verdict(sA.storage.cl_tables.length >= 7, 'comm.db tables present in the browser', sA.storage.cl_tables.join(','));
  } finally { await browser.close(); server.close(); }

  console.log('\n──────────────────────────────────────────────');
  if (inconclusive.length || judged === 0) console.log('§W-FOLDER-2CTX INCONCLUSIVE judged=' + judged + ' fails=' + fails + ' — ' + inconclusive.join(' | '));
  else console.log('§W-FOLDER-2CTX ' + (fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' fails=' + fails);
  process.exit(fails || inconclusive.length ? 1 : 0);
})().catch(function (e) { console.log('🔴 CRASH ' + (e && e.stack || e)); process.exit(2); });
