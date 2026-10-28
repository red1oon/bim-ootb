#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope: W-MF-SEED, bim-compiler prompts/TEAMWORK_FRAMEWORK.md §40, §40.1, §40.2 (Micro Finance on the REAL GardenWorld seed) and §41 agent F2. READ THE LOG after every run — the exit code is not evidence.
//   THE ISSUE: the Micro Finance mock was retired (§40). Until this witness nothing proved that two real GardenWorld customers, each on a phone that is a Team device, can pay an instalment loan by bank-transfer slip: the phone checks the
//   slip with a slip-verify service behind ONE standard interface, writes ONE I_Payment row in legacy's processor-response columns, shows "payment received" at once, copes with an unreachable service by the standard offline
//   acknowledgement handling (row written anyway + a ToDo), and head office turns the deposited rows into allocated receipts through the dictionary's own Import Payment window, after which the borrower's NEXT Visit shows a DERIVED
//   open balance, while the other borrower received nothing of it.
//   REAL erp/borrower.html (a thin page over the device's own engine frame) on 2 phones + erp/idempiere.html?team=1&teamplan=pos as head office, headless Chromium, one dumb folder pipe. The slip-verify service is NEVER called live: every
//   reply is a RECORDED STUB (erp/tests/fixtures/mf/*.json, shaped like SlipOK's documented API; a provider's reply is served by the browser context's network layer, the adapter code is the shipped file).
//   §S0  two borrowers = two GardenWorld customers (Patio Fun, Inc. 121, Agri-Tech 200000: GardenWorld customers with no invoice in the seed); each phone is bound to ITS C_BPartner_UU by the admin's signed person BEFORE any loan exists; each phone has the slip-verify service set up
//        (two local rows, key = a test string); no live network call is possible (everything but 127.0.0.1 and the stub host is aborted and counted).
//   §S1  the admin (GardenAdmin, role 102) issues one invoice per borrower on payment term 108 "50% Immediate - 50% in 30 days" (Complete -> 2 C_InvoicePaySchedule rows summing to the grand total) and validates the schedule with
//        AD_Process 242 (InvoicePayScheduleValidate: IsValid=Y). The phone shows ITS loan (total, 2 instalments) after a Visit.
//   §V1  approved slip -> ONE I_Payment row (IsApproved=Y, R_PnRef = the bank reference, R_AuthCode, R_Result, R_RespMsg, InvoiceDocumentNo, DocTypeName) and the page says "Payment received" BEFORE any Visit (head office holds 0 I_Payment rows,
//        the phone ran no Visit between the click and the banner).
//   §V2  service unreached (phone offline): the row is written anyway (IsApproved=N, R_Result empty, R_RespMsg = "SlipOK has not acknowledged this slip"), a ToDo is listed that names the service and says what happens when online;
//        back online the page re-checks by itself -> the row becomes approved (R_* set), the ToDo is gone, all before any Visit sent it. V2b: unreached then REFUSED on the re-check -> the row never leaves the phone, the ToDo says to resend.
//   §V3  refused slip -> the service's own message is shown, nothing is shown as paid, no I_Payment row is made (a refused slip never becomes a receipt).
//   §V4  a second provider ("OtherVerifier", a test double with a different API) swapped in: ONE adapter file + a changed pair of rows, the page/core files byte-identical, the stub of THAT provider is the one called, the row is approved.
//   §D1  the same bank reference twice (a different QR text answering the same reference) is refused ON THE PHONE; the same QR text twice too; no second row.
//   §I1  Visit -> head office runs Import Payment (AD_Process 343) through the page's own menu -> window -> gear -> dialog (C_BankAccount_ID=100, DocAction=CO), as W-HQ-CLERK does: ONE completed receipt per deposited slip,
//        allocated to ITS invoice (C_AllocationLine), the I_Payment rows imported (Y); the refused / retracted slips are not among them.
//   §I2  R_PnRef / R_AuthCode reached C_Payment (legacy ImportPayment copies the processor response).
//   §B1  the borrower's next Visit: the page shows the open balance DERIVED from the allocations that arrived (grand total minus allocations; independent oracle at head office), the first borrower's open = the second instalment;
//        nothing stored: the phone holds no balance (local storage keys listed).
//   §B2  borrower 2 received 0 ops of borrower 1: no invoice / instalment / allocation of borrower 1 in its tables, and (non-vacuous) borrower 1 did take in its own.
//   §R   (agent F1, branch feat/mf-ports) a renewed certificate = an invoice raised by legacy Recurring (AD_Process 213 / 200074)   §P  end of day: the Tenant Accounting Processor (53187) posts the receipt (Posted=Y, Fact_Acct balanced).
//        Both print INCONCLUSIVE "needs F1" while the process class is absent from the page's AdProcess registry.
//   §E0  0 page errors on every page and frame.
//   §MUTANTS  the page served with one rule broken (a COPY, proven applied exactly once; a crashed child is NOT a kill): scope off (reader), local dedup off, balance copied instead of derived, ToDo not cleared, adapter class hardcoded.
// Every check names the issue it proves. INCONCLUSIVE when nothing was judged. Run: node erp/tests/witness_mf_seed.js 2>&1 | tee /tmp/witness_mf_seed.log   (MFS_NO_MUT=1 skips the mutants; MFS_ROOT=<dir> tests another tree (RED run on the base);
// MFS_ONLY_ARMS=1 is the mutant child mode)
'use strict';
var path = require('path'), http = require('http'), fs = require('fs'), os = require('os'), vm = require('vm'), nodeCrypto = require('crypto');
var ROOT = process.env.MFS_ROOT || path.join(__dirname, '..', '..');
var HERE = path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var subtle = nodeCrypto.webcrypto.subtle, fails = 0, judged = 0, errors = 0, ARMS = {}, QUIET = !!process.env.MFS_ONLY_ARMS, INCONC = [];
function verdict(arm, ok, label, detail) { judged++; ARMS[arm] = ARMS[arm] || 0; if (!ok) { fails++; ARMS[arm]++; } if (!QUIET) console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + arm + ' ' + label + (detail ? ' — ' + detail : '')); return ok; }
function inconclusive(arm, label) { INCONC.push(arm); if (!QUIET) console.log('   ⚪ ' + arm + ' INCONCLUSIVE — ' + label); }
function say(s) { if (!QUIET) console.log(s); }
var SEQ = 0;   // FILM EVIDENCE (film6/FILM_EVT.md §6): §FILM_EVT lines, printed only while no arm has failed, never in a mutant child; test-only, no product code
function evt(o) { if (QUIET || MUT || fails) return; console.log('§FILM_EVT ' + Object.entries(Object.assign({ seq: ++SEQ, ts: Date.now() }, o)).map(function (kv) { return kv[0] + '=' + (/[\s"]/.test(String(kv[1])) ? JSON.stringify(String(kv[1])) : kv[1]); }).join(' ')); }
function walk(d, rel, out) { if (!fs.existsSync(d)) return out; fs.readdirSync(d).forEach(function (n) { var p = path.join(d, n), r = rel ? rel + '/' + n : n; if (fs.statSync(p).isDirectory()) walk(p, r, out); else out.push(r); }); return out; }
function canon(o) { if (o === null || typeof o !== 'object') return JSON.stringify(o); if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']'; return '{' + Object.keys(o).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(o[k]); }).join(',') + '}'; }
async function mkKey() { var kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']), j = await subtle.exportKey('jwk', kp.publicKey); return { priv: kp.privateKey, pub: { kty: j.kty, crv: j.crv, x: j.x, y: j.y } }; }
async function signObj(obj, key) { var b = JSON.parse(JSON.stringify(obj)); delete b.sig; delete b.signer; var s = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.priv, new TextEncoder().encode(canon(b))); var o = JSON.parse(JSON.stringify(b)); o.signer = key.pub; o.sig = Buffer.from(s).toString('hex'); return o; }
function loadPlan(file, g) { var o = {}; vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window: o, globalThis: o }); return o[g]; }
var planJs = function (name, o) { return '(function (g) { g.' + name + ' = ' + JSON.stringify(o) + '; })(typeof window !== \'undefined\' ? window : globalThis);\n'; };
var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
var sha = function (f) { return nodeCrypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 12); };

// MFS_MUT = JSON {"file":"/erp/borrower.js","edits":[[from,to],...]} - the page served with that file changed (mutant child mode only)
var MUT = process.env.MFS_MUT ? JSON.parse(process.env.MFS_MUT) : null;
var FIX = path.join(HERE, 'erp', 'tests', 'fixtures', 'mf');
var APPROVED = JSON.parse(fs.readFileSync(path.join(FIX, 'slipok_approved.json'), 'utf8')), REFUSED = JSON.parse(fs.readFileSync(path.join(FIX, 'slipok_refused_1013.json'), 'utf8'));
var TAG = String(Math.floor(Math.random() * 9000) + 1000), KEY_TEST = 'TEST-NOT-A-KEY-' + TAG;
var BORROWERS = [121, 200000], SHIPPED_ROLE = 50004, TILL_ROLE = Number(process.env.MFS_BOR_ROLE || 50004), HQ_BANK = 100, STUB_HOST = 'api.slipok.com', OTHER_HOST = 'verify.other.example';

(async function () {
  say('═══ W-MF-SEED — Micro Finance on the GardenWorld seed: slip check behind one interface, offline acknowledgement, Import Payment, derived balance (§40/§40.2) ═══  tag=' + TAG + (MUT ? '  MUTANT=' + JSON.stringify(MUT).slice(0, 140) : '') + '\n');
  var POSPLAN = loadPlan(path.join(ROOT, 'erp', 'team_plan_pos.js'), 'TEAM_PLAN_POS'), OFFICE = loadPlan(path.join(ROOT, 'erp', 'team_plan.js'), 'TEAM_PLAN');
  var missing = ['erp/borrower.html', 'erp/borrower.js', 'erp/slipverify/slipverify.js', 'erp/slipverify/slipok.js'].filter(function (f) { return !fs.existsSync(path.join(ROOT, f)); });
  var hasSlipRow = (POSPLAN.flows || []).some(function (f) { return f.table === 'I_Payment' && f.dir === 'UP'; });
  if (missing.length || !hasSlipRow) {          // RED on a tree without the feature: judged, FAIL, no browser needed
    verdict('S0', false, 'the borrower page, the slip-verify interface + SlipOK adapter and the POS plan\'s I_Payment UP row exist in the tree under test', 'missing files=[' + missing.join(',') + '] I_Payment-UP-row=' + hasSlipRow);
    console.log('§MFS_VERDICT FAIL judged=' + judged + ' fails=' + fails + ' (RED: the tree under test (' + ROOT + ') does not have the feature)'); process.exit(1);
  }
  var FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-seed-')), cur = { plans: {}, over: {}, serveOther: false };
  if (MUT) cur.over[MUT.file] = null;
  var server = http.createServer(function (req, res) {
    var u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
    if (p === '/pipe/list') { var pre = u.searchParams.get('prefix') || ''; res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(walk(FOLDER, '', []).filter(function (n) { return n.indexOf(pre) === 0; }))); return; }
    if (p.indexOf('/pipe/f/') === 0) { var fp = path.join(FOLDER, p.slice(8)); if (fp.indexOf(FOLDER) !== 0) { res.writeHead(400); res.end(); return; }
      if (req.method === 'PUT') { var ch = []; req.on('data', function (c) { ch.push(c); }); req.on('end', function () { fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, Buffer.concat(ch)); res.writeHead(200); res.end('ok'); }); return; }
      if (!fs.existsSync(fp)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); return; }
    if (p === '/erp/slipverify/otherverifier.js' && cur.serveOther) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(fs.readFileSync(path.join(FIX, 'otherverifier.js'))); return; }
    var over = { '/erp/team_plan.js': cur.plans.office, '/erp/team_plan_pos.js': cur.plans.pos }[p] || cur.over[p];
    if (over) { res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(over); return; }
    var f = path.join(ROOT, p === '/' ? '/erp/idempiere.html' : p);
    if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  if (MUT) {
    var orig = fs.readFileSync(path.join(ROOT, MUT.file), 'utf8'), txt = orig;
    for (var ei = 0; ei < MUT.edits.length; ei++) { if (txt.split(MUT.edits[ei][0]).length !== 2) { console.log('§MFS_CRASH MUTATION DID NOT APPLY (anchor ' + ei + ' not found exactly once) ' + MUT.file); process.exit(2); } txt = txt.replace(MUT.edits[ei][0], function () { return MUT.edits[ei][1]; }); }   // edits chain on ONE text (two edits to one file are both kept)
    cur.over[MUT.file] = txt;
  }
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + server.address().port, PIPE = base + '/pipe';
  var browser = await reqPw().chromium.launch({ args: ['--disable-gpu'] });
  // The shipped POS plan now names the borrower rows on role 50004 'Web Service Execution' (user level ' CO', legacy's external depositor; TEAMWORK §41.2): nothing is patched here. MFS_BOR_ROLE=103 still reproduces the old
  // REFUSED access:missing=T (I_Payment is AccessLevel 2) by moving the rows back, as §MFS_EVIDENCE shows.
  if (TILL_ROLE !== SHIPPED_ROLE) POSPLAN.flows.forEach(function (f) { if (f.role === SHIPPED_ROLE) f.role = TILL_ROLE; });
  var owner = await mkKey(); cur.plans.office = planJs('TEAM_PLAN', await signObj(OFFICE, owner)); cur.plans.pos = planJs('TEAM_PLAN_POS', await signObj(POSPLAN, owner));
  var xcfg = encodeURIComponent(Buffer.from(JSON.stringify({ trust: [owner.pub] })).toString('base64'));

  // ── the recorded stubs: what each (fake) provider answers for a QR text. NEVER a live call: the context aborts everything that is not 127.0.0.1 or a stub host. ──
  var SLIPS = {};                       // qr -> { ref, amount, mode: 'ok'|'refuse' }
  var NET = { stubHits: {}, aborted: [], homeFrame: [], keys: [], otherHits: 0, offline: {} };
  function stubBody(qr, amount) {
    var s = SLIPS[qr]; if (!s) return { code: 1007, message: 'QR code is not a slip we know (recorded stub: unknown QR)' };
    if (s.mode === 'refuse' || (amount != null && Number(amount) !== Number(s.amount))) { var r = JSON.parse(JSON.stringify(REFUSED)); delete r._comment; r.data.transRef = s.ref; r.data.amount = s.amount; return r; }
    var a = JSON.parse(JSON.stringify(APPROVED)); delete a._comment; a.data.transRef = s.ref; a.data.amount = s.amount; a.data.transDate = '20261028'; a.data.transTime = '10:15:30'; a.data.transTimestamp = '2026-10-28T10:15:30+07:00'; return a;
  }
  async function wireNet(ctx, name) {
    await ctx.route('**/*', async function (route) {
      var u = new URL(route.request().url());
      if (u.hostname === '127.0.0.1') return route.continue();
      if (u.hostname === STUB_HOST || u.hostname === OTHER_HOST) {
        var req = route.request(), body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (e) { /* not json */ }
        if (NET.offline[name]) { return route.abort('internetdisconnected'); }
        NET.stubHits[u.hostname] = (NET.stubHits[u.hostname] || 0) + 1;
        var hdrs = await req.allHeaders();
        if (u.hostname === STUB_HOST) { NET.keys.push(hdrs['x-authorization']);
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(stubBody(body.data, body.amount)) }); }
        NET.otherHits++; NET.keys.push(hdrs['x-verifier-key']);
        var s = SLIPS[body.qr]; if (!s || Number(body.amount) !== Number(s.amount)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'amount does not match the slip' }) });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, reference: s.ref, approval: 'OV-OK', paid: { amount: s.amount }, when: '2026-10-28T11:00:00+07:00' }) });
      }
      (u.host === 'www.idempiere.org' ? NET.homeFrame : NET.aborted).push(u.host); return route.abort('blockedbyclient');   // www.idempiere.org = the seed's own Donate gadget (an HTML frame legacy draws on the Home since W-MF-LENS), a page-load request, not part of any verify call; still aborted, counted apart
    });
  }

  async function open(name, url, ready) {
    var ctx = await browser.newContext({ viewport: { width: 900, height: 1000 } }), pg = await ctx.newPage(), logs = [], errs = [];
    pg.on('console', function (m) { logs.push(m.text()); }); pg.on('pageerror', function (e) { errs.push(e.message); errors++; });
    await wireNet(ctx, name);
    await pg.addInitScript(function () { var q = new URLSearchParams(location.search).get('xcfg'); if (q) { var c = JSON.parse(atob(q)); window.TEAM_PLAN_TRUST = c.trust; } });
    await pg.goto(base + url, { waitUntil: 'load' });
    await pg.waitForFunction(ready, null, { timeout: 240000 });
    return { name: name, pg: pg, logs: logs, errs: errs, ctx: ctx };
  }
  var qsBase = '&team=1&pipe=' + encodeURIComponent(PIPE) + '&xcfg=' + xcfg;
  var hqDevice = function () { return open('A', '/erp/idempiere.html?login=GardenAdmin&window=281' + qsBase + '&teamplan=pos', function () { return window.TeamSync && window.__idmpDb && window.__crud && window.__idmpDb.exec('SELECT count(*) FROM ad_table')[0].values[0][0] > 0 && document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0; }).then(async function (d) { await d.pg.evaluate(function () { return window.TeamSync.ready; }); return d; }); };
  var phone = function (name) { return open(name, '/erp/borrower.html?login=GardenAdmin' + qsBase, function () { return window.Borrower && window.Borrower.ready; }); };
  // E(d) runs a function in the device's ENGINE window (HQ: the page itself; a phone: the hidden frame of borrower.html)
  var eng = function (d, fn, arg) { return d.pg.evaluate('(function(){ var W = window.Borrower ? window.Borrower.engine() : window; return (' + fn.toString() + ')(W, ' + JSON.stringify(arg === undefined ? null : arg) + '); })()'); };
  var T = {
    found: function (d) { return eng(d, function (W) { return W.TeamSync.found(); }); },
    join: function (d, sp) { return eng(d, function (W, s) { return W.TeamSync.join(s); }, sp); },
    kid: function (d) { return eng(d, async function (W) { return (await W.TeamSync.pairState()).device; }); },
    enrolled: function (d) { return eng(d, async function (W) { return (await W.TeamSync.pairState()).enrolled; }); },
    approve: function (a, kid, role, uu) { return eng(a, async function (W, x) { var r = await W.TeamSync.requests(); for (var q of r) if (q.rq.kid === x.kid) { await W.TeamSync.approve(q.rq, x.role, x.uu); return true; } return false; }, { kid: kid, role: role, uu: uu }); },
    visit: function (d) { var done = false; return Promise.race([eng(d, async function (W) { var v = await W.TeamSync.visit(); return v && v.replicaIn; }).then(async function (v) { if (/borrower/.test(d.pg.url())) await d.pg.evaluate(function () { return window.Borrower.render(); }); done = true; return v; }), sleep(120000).then(function () { if (!done) console.log('   §MFS_STEP visit on ' + d.name + ' did not return in 120 s; last logs: ' + d.logs.slice(-8).map(function (l) { return l.slice(0, 160); }).join(' || ')); return null; })]); },
    rows: function (d, sql) { return eng(d, function (W, q) { return new Promise(function (res) { W.__crud.modelRun({ table: 'c_order', timing: 'PROCESS', fn: function (trx) { res(trx.q(q)); return { ok: true }; } }, function () {}); }); }, sql); },
    create: function (d, table, fields) { return eng(d, function (W, a) { return new Promise(function (res) { var once = function (e) { if (e.detail && String(e.detail.table).toLowerCase() === a.t) { W.removeEventListener('overlay:committed', once); res(e.detail.createdId); } }; W.addEventListener('overlay:committed', once); W.__crud.applyOp({ op_type: 'CRUD_CREATE', key: a.t, table: a.t, verb: 'create', fields: a.f }); setTimeout(function () { res(null); }, 8000); }); }, { t: table, f: fields }); },
    complete: function (d, table, id) { return eng(d, function (W, a) { return new Promise(function (res) { var once = function (e) { if (e.detail && String(e.detail.table).toLowerCase() === a.t) { /* keep waiting for the commit log */ } }; W.__crud.process(a.t, a.id, 'CO', { from: 'DR', to: 'CO', outcome: 'success' }); setTimeout(function () { res(true); }, 6000); }); }, { t: table, id: id }); },
    count: function (d, re) { return d.logs.filter(function (l) { return re.test(l); }).length; },
    measure: function (d) { return eng(d, async function (W) { var S = W.TeamSync.store(), kid = (await W.TeamSync.pairState()).device, f = await S.foldable(), m = { delivered: 0, ownPlaced: 0 }, tabs = {};
      f.forEach(function (p) { if (p.env.author === kid) m.ownPlaced++; else { m.delivered++; tabs[p.env.target.table] = (tabs[p.env.target.table] || 0) + 1; } });
      var last = W.TeamSync._project.last || {}; m.projected = last.projected; m.thin = last.thin || null; m.deliveredTables = tabs; m.byTable = last.byTable || {}; return m; }); },
    bor: function (d, expr) { return d.pg.evaluate(expr); }
  };
  async function visitAll(devs, rounds) { for (var r = 0; r < (rounds || 1); r++) for (var i = 0; i < devs.length; i++) await T.visit(devs[i]); }
  var money = function (n) { return Number(n).toFixed(2); };
  var out = function (d) { return d.pg.evaluate(function () { return { banner: (document.getElementById('b-banner') || {}).textContent, bannerKind: (document.getElementById('b-banner') || { getAttribute: function () { return null; } }).getAttribute('data-banner'), todo: Array.prototype.map.call(document.querySelectorAll('#b-todo li'), function (l) { return { kind: l.getAttribute('data-todo'), text: l.textContent }; }), slips: Array.prototype.map.call(document.querySelectorAll('#b-slips li'), function (l) { return { state: l.getAttribute('data-slip-state'), text: l.textContent }; }), loans: Array.prototype.map.call(document.querySelectorAll('#b-loans [data-loan]'), function (l) { return { no: l.getAttribute('data-loan'), open: (l.querySelector('[data-open]') || {}).textContent, due: Array.prototype.map.call(l.querySelectorAll('[data-due]'), function (x) { return x.textContent; }) }; }), who: document.getElementById('b-who').textContent, pair: document.getElementById('b-pair').textContent, net: document.getElementById('b-net').textContent }; }); };
  async function waitFor(fn, ms) { var t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)) { var v = await fn(); if (v) return v; await sleep(250); } return null; }
  async function submitSlip(d, invoice, qr, amount) {
    await d.pg.evaluate(function () { var b = document.getElementById('b-banner'); b.textContent = ''; b.removeAttribute('data-banner'); });   // a stale banner must not read as this click's answer
    await d.pg.selectOption('#b-invoice', invoice); await d.pg.fill('#b-qr', qr); await d.pg.fill('#b-amount', String(amount));
    await d.pg.click('#b-submit'); await waitFor(async function () { return (await out(d)).banner; }, 15000); await sleep(600); return out(d);
  }
  var slipRows = function (d) { return T.rows(d, "SELECT i_payment_id AS id, invoicedocumentno AS inv, payamt, isapproved, r_pnref, r_authcode, r_result, r_respmsg, doctypename, i_isimported FROM i_payment ORDER BY i_payment_id"); };

  // ═══ §S0 ═══
  say('§S0 head office A (founder, POS plan) + phone C1 + phone C2 (two GardenWorld customers); each bound to its C_BPartner_UU BEFORE any loan');
  var A = await hqDevice(), C1 = await phone('C1'), C2 = await phone('C2'), space = await T.found(A);
  var bps = await T.rows(A, "SELECT c_bpartner_id AS id, c_bpartner_uu AS uu, name FROM c_bpartner WHERE c_bpartner_id IN (" + BORROWERS.join(',') + ") ORDER BY c_bpartner_id");
  var preInv = await T.rows(A, "SELECT count(*) AS n FROM c_invoice WHERE c_bpartner_id IN (" + BORROWERS.join(',') + ")");
  await T.join(C1, space); await T.join(C2, space);
  for (var k = 0; k < 6; k++) { await T.approve(A, await T.kid(C1), TILL_ROLE, bps[0].uu); await T.approve(A, await T.kid(C2), TILL_ROLE, bps[1].uu); await visitAll([C1, C2, A]); if ((await T.enrolled(C1)) && (await T.enrolled(C2))) break; await sleep(300); }
  await visitAll([C1, C2, A], 2);
  var persons = await Promise.all([C1, C2].map(function (d) { return eng(d, function (W) { return W.TeamSync._scopeCtx(); }); }));
  var o1 = await waitFor(async function () { var o = await out(C1); return /Patio Fun/.test(o.pair) ? o : null; }, 15000), o2 = await waitFor(async function () { var o = await out(C2); return /Agri-Tech/.test(o.pair) ? o : null; }, 15000);
  verdict('S0', persons[0].kind === 'pos' && persons[0].role === TILL_ROLE && persons[1].role === TILL_ROLE && String(persons[0].person).toLowerCase() === String(bps[0].uu).toLowerCase() && String(persons[1].person).toLowerCase() === String(bps[1].uu).toLowerCase() && persons[0].person !== persons[1].person, 'two borrowers = two GardenWorld customers (' + bps.map(function (b) { return b.id + ' ' + b.name; }).join(' / ') + '): each phone is a role-103 device bound to ITS BP\'s _uu, in a POS space', JSON.stringify(persons.map(function (p) { return p.kind + ':' + p.role + ':' + String(p.person).slice(0, 8); })));
  verdict('S0', !!o1 && !!o2, 'each phone\'s page knows whose phone it is (header names the customer)', (o1 && o1.pair) + ' | ' + (o2 && o2.pair));
  var tFlows = {}; (POSPLAN.flows || []).forEach(function (f) { tFlows[f.name] = f.table + ':' + f.dir; });
  verdict('S0', preInv && Number(preInv[0].n) === Number((await T.rows(A, "SELECT count(*) AS n FROM c_invoice WHERE c_bpartner_id IN (" + BORROWERS.join(',') + ")"))[0].n) && Object.keys(tFlows).some(function (n) { return tFlows[n] === 'I_Payment:UP'; }) && Object.keys(tFlows).some(function (n) { return tFlows[n] === 'C_AllocationLine:DOWN'; }), 'the POS plan carries the slip row UP (I_Payment) and the allocations DOWN (C_AllocationLine); both borrowers are bound while no loan of theirs exists yet', JSON.stringify(tFlows).slice(0, 200));
  // set up the slip-verify service on each phone through the page's own set-up form (two local rows; the key is a test string)
  for (var ci = 0; ci < 2; ci++) { var Ph = [C1, C2][ci]; await Ph.pg.evaluate(function () { document.querySelector('details').open = true; });
    await Ph.pg.fill('#cfg-name', 'SlipOK'); await Ph.pg.fill('#cfg-class', 'org.kernel.slipverify.SlipOK'); await Ph.pg.fill('#cfg-host', STUB_HOST); await Ph.pg.fill('#cfg-branch', 'BRANCH-' + TAG); await Ph.pg.fill('#cfg-key', KEY_TEST); await Ph.pg.click('#cfg-save'); await sleep(1200); }
  var st1 = await C1.pg.evaluate(function () { return document.getElementById('cfg-state').textContent; });
  verdict('S0', /Using SlipOK \(org\.kernel\.slipverify\.SlipOK\)/.test(st1), 'the slip-verify service is two local rows (C_PaymentProcessor names the adapter class, C_BankAccount_Processor holds branch id + key); the page reads them back', st1);

  ['clerk', 'phone1', 'phone2', 'verifier'].forEach(function (a) { evt({ actor: a, kind: 'online', step: 'S0' }); });
  // ═══ §S1 ═══
  say('§S1 the admin issues one invoice per borrower on term 108 and validates the schedule with AD_Process 242');
  var loans = [];
  for (var bi = 0; bi < 2; bi++) {
    var price = bi === 0 ? 200 : 100, docno = 'MFL-' + (bi + 1) + '-' + TAG;
    var inv = await T.create(A, 'c_invoice', { ad_client_id: 11, ad_org_id: 11, c_doctype_id: 116, c_doctypetarget_id: 116, c_bpartner_id: bps[bi].id, c_paymentterm_id: 108, m_pricelist_id: 103, c_currency_id: 100, issotrx: 'Y', isactive: 'Y', docstatus: 'DR', docaction: 'CO', dateinvoiced: '2026-10-28 00:00:00', dateacct: '2026-10-28 00:00:00', paymentrule: 'P', processed: 'N', documentno: docno, description: 'micro loan ' + (bi + 1) });
    await T.create(A, 'c_invoiceline', { ad_client_id: 11, ad_org_id: 11, c_invoice_id: inv, line: 10, m_product_id: 124, qtyinvoiced: 1, qtyentered: 1, c_uom_id: 100, priceentered: price, priceactual: price, pricelist: price, c_tax_id: 105, linenetamt: price, isdescription: 'N', isactive: 'Y' });
    var n0 = A.logs.length; await eng(A, function (W, id) { W.__crud.process('c_invoice', id, 'CO', { from: 'DR', to: 'CO', outcome: 'success' }); return true; }, inv);
    await waitFor(async function () { return A.logs.slice(n0).some(function (l) { return /§CRUD process committed key=c_invoice/.test(l); }); }, 30000); await sleep(1500);
    loans.push({ id: inv, docno: docno, bp: bps[bi] });
  }
  var sch = [];
  for (var li = 0; li < 2; li++) {
    var ih = (await T.rows(A, 'SELECT docstatus AS ds, grandtotal AS gt, c_paymentterm_id AS pt FROM c_invoice WHERE c_invoice_id=' + loans[li].id))[0] || {};
    var ss = await T.rows(A, 'SELECT c_invoicepayschedule_id AS id, dueamt, duedate, isvalid FROM c_invoicepayschedule WHERE c_invoice_id=' + loans[li].id + ' ORDER BY duedate');
    loans[li].gt = Number(ih.gt); loans[li].sched = ss; sch.push({ ds: ih.ds, pt: ih.pt, n: ss.length });
  }
  verdict('S1', sch.every(function (s) { return s.ds === 'CO' && Number(s.pt) === 108 && s.n === 2; }) && loans.every(function (l) { return Math.abs(l.sched[0].dueamt + l.sched[1].dueamt - l.gt) < 0.015 && l.gt > 0; }), 'each loan is a COMPLETED customer invoice on payment term 108 with 2 C_InvoicePaySchedule rows that sum to its grand total', JSON.stringify(loans.map(function (l) { return { no: l.docno, gt: l.gt, due: l.sched.map(function (s) { return s.dueamt; }) }; })));
  // ── S1 (cont.) AD_Process 242 through the page's own window: Sales Invoice -> Find -> Payment Schedule tab -> the Validate button -> dialog -> OK. First the schedule is marked NOT valid (an operator edit), so the process has something to do.
  var update = function (d, table, id, changes) { return eng(d, function (W, a) { return new Promise(function (res) { var once = function (e) { if (e.detail && String(e.detail.table).toLowerCase() === a.t) { W.removeEventListener('overlay:committed', once); res(true); } }; W.addEventListener('overlay:committed', once); W.__crud.applyOp({ op_type: 'CRUD_UPDATE', key: a.t, table: a.t, verb: 'update', id: a.id, changes: a.c }); setTimeout(function () { res(null); }, 8000); }); }, { t: table, id: id, c: changes }); };
  var clickLeaf = function (pg, id) { return pg.evaluate(function (id) { var leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); if (!leaf) return false; var n = leaf.parentElement; while (n && n.id !== 'idmp-tree') { if (n.classList && n.classList.contains('idmp-node')) n.classList.add('open'); n = n.parentElement; } leaf.click(); return true; }, id); };
  var valLog = [];
  for (var vi = 0; vi < 2; vi++) {
    for (var sj = 0; sj < loans[vi].sched.length; sj++) await update(A, 'c_invoicepayschedule', loans[vi].sched[sj].id, { isvalid: 'N' });
    var preValid = (await T.rows(A, 'SELECT isvalid AS v FROM c_invoicepayschedule WHERE c_invoice_id=' + loans[vi].id)).map(function (r) { return r.v; });
    var nv = A.logs.length;
    await clickLeaf(A.pg, 178); await A.pg.waitForSelector('#idmp-toolbar [data-tb="toggle"]', { timeout: 30000 }); await sleep(1500);
    // the window opens on a blank record; switch to the grid and choose the loan's row (the Find overlay does not narrow tip-created records)
    var inForm = await A.pg.evaluate(function () { return !document.querySelector('#idmp-content .idmp-grid'); });
    if (inForm) { await A.pg.click('#idmp-toolbar [data-tb="toggle"]'); await sleep(1200); }
    await A.pg.evaluate(function (id) { var tr = Array.prototype.filter.call(document.querySelectorAll('.idmp-grid tbody tr[data-ad-record]'), function (x) { return Number(x.getAttribute('data-ad-record')) === id; })[0]; if (tr) tr.click(); }, loans[vi].id); await sleep(1500);
    console.log('   §MFS_DEBUG grid rows=' + await A.pg.evaluate(function () { return Array.prototype.map.call(document.querySelectorAll('.idmp-grid tbody tr[data-ad-record]'), function (x) { return x.getAttribute('data-ad-record'); }).join(','); }));
    await A.pg.click('#idmp-tabstrip >> text=Invoice Line'); await sleep(900); await A.pg.click('#idmp-tabstrip >> text=Payment Schedule'); await sleep(2000);
    var formInv = await A.pg.evaluate(function () { return document.getElementById('idmp-content').innerText.replace(/\s+/g, ' ').slice(0, 120); });
    await A.pg.click('#idmp-content button[data-proc-btn="Processing"]');
    // a record-launched process with no parameters runs at once (§PROC-COMMIT); if the page shows its dialog, press OK on it
    await waitFor(async function () { return A.logs.slice(nv).some(function (l) { return /§AD-PROC-LIVE proc=242 /.test(l); }) || !!(await A.pg.$('#idmp-procdlg [data-proc-run]')); }, 30000);
    if (!A.logs.slice(nv).some(function (l) { return /§AD-PROC-LIVE proc=242 /.test(l); })) { await A.pg.click('#idmp-procdlg [data-proc-run]'); await waitFor(async function () { return A.logs.slice(nv).some(function (l) { return /§AD-PROC-LIVE proc=242 /.test(l); }); }, 30000); }
    await sleep(1200);
    try { await A.pg.click('#idmp-procdlg [data-procdlg-ok]'); await A.pg.waitForSelector('#idmp-procdlg', { state: 'detached', timeout: 10000 }); } catch (e) { /* dialog already closed */ }
    var postValid = (await T.rows(A, 'SELECT isvalid AS v FROM c_invoicepayschedule WHERE c_invoice_id=' + loans[vi].id)).map(function (r) { return r.v; });
    console.log('   §MFS_DEBUG validate ' + loans[vi].docno + ' (id ' + loans[vi].id + ') form=' + formInv + ' line=' + (A.logs.slice(nv).filter(function (l) { return /§AD-PROC-LIVE proc=242 /.test(l); }).pop() || '').slice(100));
    valLog.push({ pre: preValid, post: postValid, line: A.logs.slice(nv).filter(function (l) { return /§AD-PROC-LIVE proc=242 /.test(l); }).pop() || '' });
  }
  verdict('S1', valLog.every(function (v) { return v.pre.every(function (x) { return x === 'N'; }) && v.post.length === 2 && v.post.every(function (x) { return x === 'Y'; }) && /ok=Y/.test(v.line); }), 'AD_Process 242 (InvoicePayScheduleValidate), run from the invoice window\'s Validate button, turned the schedule rows N -> Y on both loans (non-vacuous: they were N before)', JSON.stringify(valLog.map(function (v) { return v.pre.join('') + '->' + v.post.join('') + ' ' + v.line.slice(0, 90); })));
  await visitAll([A, C1, C2], 3);
  var v1 = await out(C1), v2 = await out(C2);
  console.log('   §MFS_DEBUG C1 tables delivered=' + JSON.stringify((await T.measure(C1)).deliveredTables) + ' thin=' + JSON.stringify((await T.measure(C1)).thin) + ' invoices on C1=' + JSON.stringify(await T.rows(C1, "SELECT c_invoice_id AS id, documentno, grandtotal, c_bpartner_id AS bp FROM c_invoice WHERE documentno LIKE 'MFL-%'")));
  verdict('S1', v1.loans.length === 1 && v1.loans[0].no === loans[0].docno && Number(v1.loans[0].open) === loans[0].gt && v1.loans[0].due.length === 2 && v2.loans.length === 1 && v2.loans[0].no === loans[1].docno && Number(v2.loans[0].open) === loans[1].gt && v2.loans[0].due.length === 2, 'after a Visit each phone shows ITS loan only (document no, total = open, 2 instalments)', JSON.stringify([v1.loans, v2.loans]).slice(0, 260));
  var rawOf = function (d, docno) { return T.rows(d, "SELECT (SELECT count(*) FROM c_invoice WHERE documentno='" + docno + "') AS inv, (SELECT count(*) FROM c_invoicepayschedule s JOIN c_invoice i ON i.c_invoice_id=s.c_invoice_id WHERE i.documentno='" + docno + "') AS sch"); };
  var raw1 = await rawOf(C1, loans[0].docno), raw2x = await rawOf(C2, loans[0].docno), raw2 = await rawOf(C2, loans[1].docno);
  verdict('S1', Number(raw1[0].inv) === 1 && Number(raw1[0].sch) === 2 && Number(raw2[0].inv) === 1 && Number(raw2x[0].inv) === 0 && Number(raw2x[0].sch) === 0, 'in the phones\' TABLES (not the page\'s view): borrower 1 holds its invoice + 2 instalments, borrower 2 holds its own and NONE of borrower 1\'s', JSON.stringify([raw1[0], raw2[0], raw2x[0]]));
  var SL = function (n, amt, ref, mode) { var qr = 'MFQR:' + TAG + ':' + n; SLIPS[qr] = { ref: ref, amount: amt, mode: mode || 'ok' }; return qr; };
  var ref = function (t) { return ('MF' + TAG + t + '000000000000').slice(0, 20); };
  var P1 = loans[0].sched[0].dueamt, P2 = loans[1].sched[0].dueamt, Q2 = loans[1].sched[1].dueamt;
  if (process.env.MFS_STOP === 'S1') { await finish(); }

  evt({ actor: 'clerk', kind: 'run', process: 'Validate', text: 'payment schedule validated', step: 'S1' }); evt({ actor: 'clerk', kind: 'send', label: 'loan', step: 'S1' }); evt({ actor: 'clerk', kind: 'send', label: 'loan', step: 'S1' }); evt({ actor: 'phone1', kind: 'deliver', from: 'relay', label: 'loan', step: 'S1' }); evt({ actor: 'phone2', kind: 'deliver', from: 'relay', label: 'loan', step: 'S1' });
  // ═══ §V1 approved slip ═══
  say('§V1 C1 pays the first instalment: approved slip');
  var visitsBefore = T.count(C1, /§TEAM_VISIT /), aBefore = Number((await T.rows(A, 'SELECT count(*) AS n FROM i_payment'))[0].n);
  var qr1 = SL('C1-1', P1, ref('C1A')), r1 = await submitSlip(C1, loans[0].docno, qr1, P1);
  var rows1 = await slipRows(C1), aAfter = Number((await T.rows(A, 'SELECT count(*) AS n FROM i_payment'))[0].n);
  verdict('V1', rows1.length === 1 && rows1[0].isapproved === 'Y' && rows1[0].r_pnref === ref('C1A') && rows1[0].r_authcode === '014-004' && rows1[0].r_result === 'approved' && !!rows1[0].r_respmsg && rows1[0].inv === loans[0].docno && rows1[0].doctypename === 'AR Receipt' && Number(rows1[0].payamt) === P1, 'ONE I_Payment row in legacy\'s processor-response columns: IsApproved=Y, R_PnRef = the bank reference, R_AuthCode, R_Result, R_RespMsg, InvoiceDocumentNo, DocTypeName, PayAmt', JSON.stringify(rows1[0]));
  verdict('V1', r1.bannerKind === 'ok' && /Payment received/.test(r1.banner) && r1.slips.length === 1 && r1.slips[0].state === 'received' && aBefore === 0 && aAfter === 0 && T.count(C1, /§TEAM_VISIT /) === visitsBefore, '"Payment received" is on the phone BEFORE any Visit: head office holds 0 I_Payment rows, the phone ran no Visit between the click and the banner', r1.banner + ' | A rows ' + aBefore + '->' + aAfter + ' visits ' + visitsBefore + '->' + T.count(C1, /§TEAM_VISIT /));
  verdict('V1', NET.stubHits[STUB_HOST] === 1 && NET.keys[0] === KEY_TEST && NET.aborted.length === 0, 'the verify call went to the recorded stub only, once, with the phone\'s own key (a test string); no other host was reached', 'hits=' + JSON.stringify(NET.stubHits) + ' aborted=' + NET.aborted.length);
  evt({ actor: 'phone1', kind: 'verify', to: 'verifier', label: 'slip', step: 'V1' }); evt({ actor: 'verifier', kind: 'ack', to: 'phone1', status: 'approved', label: 'slip', step: 'V1' }); evt({ actor: 'phone1', kind: 'local', queue: 1, slip: 'received', text: 'payment received', step: 'V1' });
  // ── D1 ──
  say('§D1 the same bank reference twice, and the same QR twice');
  var hitsD = NET.stubHits[STUB_HOST], qr1b = SL('C1-1b', P1, ref('C1A')), d1a = await submitSlip(C1, loans[0].docno, qr1b, P1), rowsD1 = await slipRows(C1);
  verdict('D1', /already on this phone/.test(d1a.banner || '') && d1a.bannerKind === 'bad' && rowsD1.length === 1 && NET.stubHits[STUB_HOST] === hitsD + 1, 'a DIFFERENT QR text answering the SAME bank reference is refused on the phone ("already on this phone"); still ONE row (the service was asked, the phone refused its answer)', d1a.banner + ' rows=' + rowsD1.length);
  var hitsD2 = NET.stubHits[STUB_HOST], d1b = await submitSlip(C1, loans[0].docno, qr1, P1), rowsD1b = await slipRows(C1);
  verdict('D1', /already on this phone/.test(d1b.banner || '') && rowsD1b.length === 1 && NET.stubHits[STUB_HOST] === hitsD2, 'the SAME QR text twice is refused before the service is asked (no second call), still ONE row', d1b.banner + ' calls ' + hitsD2 + '->' + NET.stubHits[STUB_HOST]);
  if (process.env.MFS_DEBUG_VISIT) { say('   §MFS_STEP debug visit C1'); await T.visit(C1); say('   §MFS_STEP debug visit A'); await T.visit(A); say('   §MFS_STEP done'); console.log(JSON.stringify(await T.rows(A, 'SELECT count(*) AS n FROM i_payment'))); console.log('   §MFS_DBG verdicts ' + JSON.stringify(await eng(C1, async function (W) { var L = await W.TeamSync.store().order(), o = {}; Object.keys(L.verdict || {}).forEach(function (h) { var v = L.verdict[h]; if (v.verdict !== 'MERGED') o[h.slice(0, 8)] = v.verdict + ':' + v.reason; }); return { keys: Object.keys(L).join(','), refused: o }; }))); console.log(C1.logs.filter(function (l) { return /§TEAM_(OUT|LOCALONLY|NOT_DECLARED|SKIP|VISIT|REFUS)|refus|REFUS|admit|ADMIT/.test(l) && !/TIP-SHADOW/.test(l); }).slice(-10).map(function (l) { return '   §MFS_DBG ' + l.slice(0, 260); }).join('\n')); }
  if (process.env.MFS_STOP === 'V1') { await finish(); }

  // ═══ §V3 refused ═══
  say('§V3 C2: a refused slip');
  var qrBad = SL('C2-bad', P2, ref('C2X'), 'refuse'), r3 = await submitSlip(C2, loans[1].docno, qrBad, P2), rows3 = await slipRows(C2);
  verdict('V3', r3.bannerKind === 'bad' && r3.banner === REFUSED.message && r3.slips.length === 1 && r3.slips[0].state === 'refused' && !r3.slips.some(function (x) { return x.state === 'received'; }) && rows3.length === 0, 'refused: the service\'s own message is shown as is, nothing is shown as paid, no I_Payment row exists (a refused slip never becomes a receipt)', r3.banner + ' | rows=' + rows3.length + ' | ' + JSON.stringify(r3.slips));

  evt({ actor: 'phone2', kind: 'verify', to: 'verifier', label: 'slip', step: 'V3' }); evt({ actor: 'verifier', kind: 'ack', to: 'phone2', status: 'refused', label: 'slip', step: 'V3' }); evt({ actor: 'phone2', kind: 'local', slip: 'refused', text: 'refused, nothing paid', step: 'V3' }); evt({ actor: 'phone2', kind: 'note', cls: 'bad', text: String(r3.banner).slice(0, 95), step: 'V3' });
  // ═══ §V2 unreached ═══
  say('§V2 C2: the service is unreachable (phone offline), then comes back');
  async function setOffline(d, on) { NET.offline[d.name] = on; await d.ctx.setOffline(on); await sleep(500); }
  var aV2 = Number((await T.rows(A, 'SELECT count(*) AS n FROM i_payment'))[0].n), visV2 = T.count(C2, /§TEAM_VISIT /);
  await setOffline(C2, true);
  var qr2 = SL('C2-2', P2, ref('C2A')), r2 = await submitSlip(C2, loans[1].docno, qr2, P2), rows2 = await slipRows(C2);
  verdict('V2', rows2.length === 1 && rows2[0].isapproved === 'N' && !rows2[0].r_result && rows2[0].r_respmsg === 'SlipOK has not acknowledged this slip' && !rows2[0].r_pnref, 'unreached: the row is written ANYWAY (local first) with IsApproved=N, R_Result empty, R_RespMsg = "SlipOK has not acknowledged this slip"', JSON.stringify(rows2[0]));
  verdict('V2', r2.bannerKind === 'warn' && /SlipOK has not acknowledged this slip/.test(r2.banner) && r2.todo.length === 1 && r2.todo[0].kind === 'wait' && /SlipOK has not acknowledged this slip/.test(r2.todo[0].text) && /online/.test(r2.todo[0].text) && /checks the slip again by itself/.test(r2.todo[0].text) && /Visit/.test(r2.todo[0].text) && r2.net === 'offline' && !r2.slips.some(function (x) { return x.state === 'received'; }), 'the phone says WHICH service has not acknowledged and WHAT HAPPENS when online (checks again by itself, then goes up at the next Visit); a ToDo is listed; it is not shown as paid; the chip says offline', JSON.stringify(r2.todo) + ' net=' + r2.net);
  await setOffline(C2, false);
  var okAgain = await waitFor(async function () { var rr = await slipRows(C2); return rr.length === 1 && rr[0].isapproved === 'Y' ? rr[0] : null; }, 30000); await waitFor(async function () { return (await out(C2)).todo.length === 0; }, 15000); var r2b = await out(C2);
  verdict('V2', !!okAgain && okAgain.r_pnref === ref('C2A') && okAgain.r_authcode === '014-004' && okAgain.r_result === 'approved' && r2b.todo.length === 0 && r2b.slips.length >= 1 && r2b.slips.some(function (x) { return x.state === 'received'; }), 'back online the phone re-checks BY ITSELF: the row is updated (IsApproved=Y, R_PnRef, R_AuthCode, R_Result) and the ToDo is gone', JSON.stringify(okAgain) + ' todo=' + r2b.todo.length);
  verdict('V2', Number((await T.rows(A, 'SELECT count(*) AS n FROM i_payment'))[0].n) === aV2 && T.count(C2, /§TEAM_VISIT /) === visV2, 'all of this happened BEFORE any Visit sent the row (head office still holds the same number of I_Payment rows; the phone ran no Visit)', 'A rows ' + aV2 + '; visits ' + visV2);
  evt({ actor: 'phone2', kind: 'offline', step: 'V2' }); evt({ actor: 'phone2', kind: 'local', queue: 1, todo: 'set', text: 'no acknowledgement yet', step: 'V2' }); evt({ actor: 'phone2', kind: 'note', cls: 'bad', text: String(r2.todo[0].text).replace(/\s*\([^)]*\)/, '').split('. ')[0].slice(0, 95), step: 'V2' }); evt({ actor: 'phone2', kind: 'online', step: 'V2' }); evt({ actor: 'phone2', kind: 'verify', to: 'verifier', label: 'slip', step: 'V2' }); evt({ actor: 'verifier', kind: 'ack', to: 'phone2', status: 'approved', label: 'slip', step: 'V2' }); evt({ actor: 'phone2', kind: 'local', todo: 'clear', slip: 'received', text: 'row updated before send', step: 'V2' });
  // V2b: unreached, then REFUSED on the re-check
  say('§V2b C2: unreached, then refused on the re-check');
  await setOffline(C2, true);
  var qr3 = SL('C2-3', Q2, ref('C2Z')), r2c = await submitSlip(C2, loans[1].docno, qr3, Q2);
  var wait3 = (await slipRows(C2)).filter(function (r) { return r.isapproved === 'N'; });
  SLIPS[qr3].mode = 'refuse'; await setOffline(C2, false);
  var gone = await waitFor(async function () { var o = await out(C2); return o.todo.some(function (t) { return t.kind === 'resend'; }) ? o : null; }, 30000), rows2c = await slipRows(C2);
  verdict('V2', wait3.length === 1 && !!gone && rows2c.length === 1 && rows2c[0].isapproved === 'Y' && gone.todo.length === 1 && gone.todo[0].kind === 'resend' && gone.todo[0].text.indexOf(REFUSED.message) === 0 && /send a correct slip/.test(gone.todo[0].text), 'unreached then REFUSED on the re-check: the waiting row is withdrawn (it never left the phone), the ToDo now says what the borrower must do ("Please send a correct slip") with the service\'s own message', JSON.stringify(gone && gone.todo));
  await C2.pg.click('#b-todo [data-dismiss]'); await sleep(900);
  verdict('V2', (await out(C2)).todo.length === 0, 'the borrower marks the resend ToDo done: it is gone', '');
  if (process.env.MFS_STOP === 'V2') { await finish(); }

  // ═══ §V4 a second provider ═══
  say('§V4 C2 swaps its provider to OtherVerifier: one adapter file + the rows');
  var core = ['erp/borrower.html', 'erp/borrower.js', 'erp/slipverify/slipverify.js', 'erp/slipverify/slipok.js'], h0 = core.map(function (f) { return sha(path.join(ROOT, f)); });
  var otherBefore = fs.existsSync(path.join(ROOT, 'erp/slipverify/otherverifier.js')); cur.serveOther = true;
  await C2.pg.evaluate(function () { document.querySelector('details').open = true; });
  await C2.pg.fill('#cfg-name', 'OtherVerifier'); await C2.pg.fill('#cfg-class', 'org.kernel.slipverify.OtherVerifier'); await C2.pg.fill('#cfg-host', OTHER_HOST); await C2.pg.fill('#cfg-branch', 'B-OTHER'); await C2.pg.fill('#cfg-key', KEY_TEST + '-OV'); await C2.pg.click('#cfg-save'); await sleep(1500);
  var slipokHits = NET.stubHits[STUB_HOST], qr4 = SL('C2-4', Q2, ref('C2B')), r4 = await submitSlip(C2, loans[1].docno, qr4, Q2), rows4 = await slipRows(C2);
  var h1 = core.map(function (f) { return sha(path.join(ROOT, f)); });
  verdict('V4', JSON.stringify(h0) === JSON.stringify(h1) && !otherBefore && NET.otherHits === 1 && NET.stubHits[STUB_HOST] === slipokHits && r4.bannerKind === 'ok' && /OtherVerifier confirmed/.test(r4.banner) && rows4.length === 2 && rows4.filter(function (r) { return r.r_pnref === ref('C2B') && r.r_authcode === 'OV-OK' && r.isapproved === 'Y'; }).length === 1, 'a second provider is swapped in with ZERO code change outside the adapter: the page + core files are byte-identical (sha256 before = after), the new adapter file is the only addition, the OTHER provider\'s stub was called (1 hit), SlipOK\'s was not, the row is approved with that provider\'s reference', 'files same=' + (JSON.stringify(h0) === JSON.stringify(h1)) + ' other_before=' + otherBefore + ' otherHits=' + NET.otherHits + ' slipokHits ' + slipokHits + '->' + NET.stubHits[STUB_HOST] + ' banner=' + r4.bannerKind + ' ' + r4.banner + ' rows=' + JSON.stringify(rows4.map(function (r) { return r.r_pnref + '/' + r.r_authcode + '/' + r.isapproved; })));
  verdict('V4', NET.keys.indexOf(KEY_TEST + '-OV') >= 0 && NET.keys.indexOf(KEY_TEST) >= 0 && !core.some(function (f) { return fs.readFileSync(path.join(ROOT, f), 'utf8').indexOf('TEST-NOT-A-KEY') >= 0; }), 'each provider got ITS OWN key from the phone\'s local rows; no key or branch id is in any shipped file', 'keys seen: ' + NET.keys.map(function (k) { return String(k).replace(TAG, '<tag>'); }).filter(function (x, i, a) { return a.indexOf(x) === i; }).join(','));
  evt({ actor: 'verifier', kind: 'note', cls: 'n', text: 'second provider row, no code change', step: 'V4' });
  if (process.env.MFS_STOP === 'V4') { await finish(); }

  // ═══ §I1 / §I2 head office imports ═══
  say('§I1 Visit, then head office runs Import Payment through the menu -> window -> gear -> dialog');
  await visitAll([C1, C2, A], 3); say('   §MFS_STEP visited');
  for (var rd of [C1, C2]) console.log('   §MFS_EVIDENCE ' + rd.name + ' refused-at-fold=' + JSON.stringify(await eng(rd, async function (W) { var L = await W.TeamSync.store().order(), o = {}; Object.keys(L.verdict || {}).forEach(function (h) { var v = L.verdict[h]; if (v.verdict !== 'MERGED') o[h.slice(0, 8)] = v.verdict + ':' + v.reason; }); return o; })));
  [C1, C2, A].forEach(function (d) { var ls = d.logs.filter(function (l) { return /§TEAM_VISIT /.test(l); }); console.log('   §MFS_EVIDENCE ' + d.name + ' out(i_payment)=' + d.logs.filter(function (l) { return /§TEAM_OUT .*i_payment/.test(l); }).length + ' notDeclared=' + JSON.stringify(d.logs.filter(function (l) { return /§TEAM_NOT_DECLARED/.test(l); }).map(function (l) { return l.slice(0, 200); }).slice(-2)) + ' lastVisits=' + JSON.stringify(ls.slice(-2).map(function (l) { return l.slice(0, 220); }))); });
  var ipA = await T.rows(A, "SELECT i_payment_id AS id, invoicedocumentno AS inv, payamt, isapproved, r_pnref, r_authcode, i_isimported FROM i_payment ORDER BY r_pnref");
  var expectRefs = [ref('C1A'), ref('C2A'), ref('C2B')].sort();
  verdict('I1', ipA.length === 3 && JSON.stringify(ipA.map(function (r) { return r.r_pnref; })) === JSON.stringify(expectRefs) && ipA.every(function (r) { return r.isapproved === 'Y' && r.i_isimported === 'N'; }), 'head office holds exactly the 3 approved slips the phones declared (the refused slip and the withdrawn one never left their phones); all I_IsImported=N', JSON.stringify(ipA.map(function (r) { return r.inv + ':' + r.payamt + ':' + r.r_pnref; })));
  var reg = await eng(A, function (W) { return W.AdProcess.registeredClassnames().concat(Object.keys(W.AdProcess.JAVA || {})); });   // legacy-verbatim ports live in AdProcess.JAVA (defineProcess)
  var hasRec = reg.indexOf('org.compiere.process.Recurring') >= 0 && reg.indexOf('org.idempiere.process.RecurringRun') >= 0, hasAcct = reg.indexOf('org.adempiere.process.ClientAcctProcessor') >= 0;
  if (hasAcct) {    // end of day: head office queues the books (legacy CLIENT_ACCOUNTING = Q, a client row of AD_SysConfig, MClient.isClientAccountingImmediate) so the receipts are NOT posted at Complete; the Tenant Accounting Processor posts them below
    var swId = await T.create(A, 'ad_sysconfig', { ad_client_id: 11, ad_org_id: 0, isactive: 'Y', name: 'CLIENT_ACCOUNTING', value: 'Q', description: 'MF-SEED: the books are posted by the Tenant Accounting Processor at end of day' });
    say('   §MFS_STEP CLIENT_ACCOUNTING=Q row ' + swId);
  }
  var nI = A.logs.length, opened = await clickLeaf(A.pg, 374); say('   §MFS_STEP import window opened=' + opened);
  await A.pg.waitForSelector('#idmp-toolbar [data-tb="process"]', { timeout: 30000 }); await sleep(2500);
  await A.pg.waitForFunction(function () { var b = document.querySelector('#idmp-toolbar [data-tb="process"]'); return b && !b.disabled; }, null, { timeout: 20000 }).catch(function () {});
  say('   §MFS_STEP gear'); await A.pg.click('#idmp-toolbar [data-tb="process"]'); await A.pg.waitForSelector('#idmp-proc-ov', { timeout: 10000 });
  var items = await A.pg.$$eval('#idmp-proc-ov [data-tbb]', function (e) { return e.map(function (x) { return x.getAttribute('data-tbb') + '=' + x.textContent.trim(); }); });
  await A.pg.click('#idmp-proc-ov [data-tbb="Processing"]'); await A.pg.waitForSelector('#idmp-procdlg [data-proc-run]', { timeout: 20000 }); await sleep(800);
  var paras = await A.pg.$$eval('#idmp-procdlg [data-proc-param]', function (els) { return els.map(function (e) { return e.getAttribute('data-proc-param'); }); });
  var setP = async function (col, v) { await A.pg.selectOption('#idmp-procdlg [data-proc-param="' + col + '"]', String(v)); await sleep(300); };
  await setP('AD_Org_ID', 11); await setP('C_BankAccount_ID', HQ_BANK); await setP('DocAction', 'CO');
  await A.pg.click('#idmp-procdlg [data-proc-run]'); await waitFor(async function () { return A.logs.slice(nI).some(function (l) { return /§AD-PROC-LIVE proc=343 /.test(l); }); }, 90000); await sleep(2500);
  var impLine = A.logs.slice(nI).filter(function (l) { return /§AD-PROC-LIVE proc=343 /.test(l); }).pop() || '';
  var dlgText = await A.pg.evaluate(function () { return (document.getElementById('idmp-procdlg') || { innerText: '' }).innerText.replace(/\s+/g, ' ').slice(0, 240); });
  try { await A.pg.click('#idmp-procdlg [data-procdlg-ok]'); } catch (e) { /* closed */ }
  var inv2 = loans.map(function (l) { return l.id; }).join(',');
  var pays = await T.rows(A, "SELECT p.c_payment_id AS id, p.c_invoice_id AS inv, p.payamt, p.docstatus AS ds, p.r_pnref, p.r_authcode, p.posted, (SELECT count(*) FROM c_allocationline al WHERE al.c_payment_id=p.c_payment_id AND al.c_invoice_id=p.c_invoice_id) AS nal FROM c_payment p WHERE p.c_invoice_id IN (" + inv2 + ") ORDER BY p.r_pnref");
  var impRows = await T.rows(A, "SELECT i_isimported AS imp, c_payment_id AS pid FROM i_payment");
  console.log('   §MFS_IMPORT menu=' + opened + ' gear=' + JSON.stringify(items) + ' paras=' + JSON.stringify(paras) + ' ' + impLine.slice(0, 160) + ' | ' + dlgText);
  verdict('I1', pays.length === 3 && pays.every(function (p) { return p.ds === 'CO' && Number(p.nal) >= 1; }) && impRows.every(function (r) { return r.imp === 'Y' && r.pid != null; }) && /ok=Y/.test(impLine) && JSON.stringify(paras.slice().sort()) === JSON.stringify(['AD_Org_ID', 'C_BankAccount_ID', 'DeleteOldImported', 'DocAction'].sort()), 'Import Payment (AD_Process 343) run from the menu -> window -> gear -> dialog: ONE completed receipt per deposited slip (3), each ALLOCATED to its invoice, the 3 I_Payment rows imported (Y)', JSON.stringify(pays.map(function (p) { return p.inv + ':' + p.payamt + ':' + p.ds + ':al' + p.nal; })) + ' ' + impLine.slice(0, 100));
  verdict('I2', pays.length === 3 && JSON.stringify(pays.map(function (p) { return p.r_pnref; })) === JSON.stringify(expectRefs) && pays.every(function (p) { return p.r_authcode === '014-004' || p.r_authcode === 'OV-OK'; }), 'R_PnRef / R_AuthCode (the service\'s answer) reached the C_Payment receipts (legacy ImportPayment copies the processor response)', JSON.stringify(pays.map(function (p) { return p.r_pnref + '/' + p.r_authcode; })));
  console.log('   §MFS_NOTE posted-at-import=' + JSON.stringify(pays.map(function (p) { return p.posted; })) + ' (the twin posts on Complete unless F1\'s queued path is in)');
  // oracle at head office: open = grand total - what was allocated (independent SQL over C_AllocationLine)
  var oracle = {};
  for (var oi = 0; oi < 2; oi++) { var al = await T.rows(A, 'SELECT COALESCE(SUM(COALESCE(amount,0)+COALESCE(discountamt,0)+COALESCE(writeoffamt,0)),0) AS a FROM c_allocationline WHERE c_invoice_id=' + loans[oi].id); oracle[loans[oi].docno] = Math.round((loans[oi].gt - Number(al[0].a)) * 100) / 100; }
  verdict('I1', oracle[loans[0].docno] === loans[0].sched[1].dueamt && oracle[loans[1].docno] === 0, 'at head office the first borrower\'s open amount is the SECOND instalment and the second borrower\'s is 0 (independent oracle over C_AllocationLine)', JSON.stringify(oracle));
  evt({ actor: 'phone1', kind: 'send', label: 'I_Payment', step: 'I1' }); evt({ actor: 'phone2', kind: 'send', label: 'I_Payment', step: 'I1' }); evt({ actor: 'phone2', kind: 'send', label: 'I_Payment', step: 'I1' }); for (var di = 0; di < 3; di++) evt({ actor: 'clerk', kind: 'deliver', from: 'relay', label: 'I_Payment', step: 'I1' }); evt({ actor: 'clerk', kind: 'run', process: 'Import Payment', text: 'a receipt per slip, allocated', step: 'I1' });
  if (process.env.MFS_STOP === 'I1') { await finish(); }

  // ═══ §B1 / §B2 ═══
  say('§B1 the borrower\'s next Visit shows the derived balance; §B2 the other borrower received nothing of it');
  await visitAll([C1, C2, A], 3);
  var b1 = await out(C1), b2 = await out(C2);
  var keys1 = await C1.pg.evaluate(function () { try { return Object.keys(localStorage); } catch (e) { return ['(no storage)']; } });
  verdict('B1', b1.loans.length === 1 && Number(b1.loans[0].open) === oracle[loans[0].docno] && Number(b1.loans[0].open) === loans[0].sched[1].dueamt && b2.loans.length === 1 && Number(b2.loans[0].open) === 0, 'the next Visit shows the new balance on each phone, DERIVED (grand total minus the allocations that arrived): borrower 1 open ' + (b1.loans[0] && b1.loans[0].open) + ' = the second instalment ' + loans[0].sched[1].dueamt + ', borrower 2 open ' + (b2.loans[0] && b2.loans[0].open), JSON.stringify([b1.loans, b2.loans]).slice(0, 220));
  verdict('B1', keys1.filter(function (k) { return k.indexOf('mf.') === 0; }).every(function (k) { return k.indexOf('mf.refused.v1') === 0; }) && !keys1.some(function (k) { return /open|balance/i.test(k); }), 'FL-2: the phone stores no balance (the page\'s only local-storage keys are the refused-slip log; the engine\'s other keys: ' + keys1.filter(function (k) { return k.indexOf('mf.') !== 0; }).join(',') + ')', JSON.stringify(keys1));
  var mC1 = await T.measure(C1), mC2 = await T.measure(C2);
  var viaDoc = function (docno) { return "(SELECT count(*) FROM c_invoice WHERE documentno='" + docno + "') AS inv, (SELECT count(*) FROM c_invoicepayschedule s JOIN c_invoice i ON i.c_invoice_id=s.c_invoice_id WHERE i.documentno='" + docno + "') AS sch, (SELECT count(*) FROM c_allocationline a JOIN c_invoice i ON i.c_invoice_id=a.c_invoice_id WHERE i.documentno='" + docno + "') AS al"; };
  var foreign = await T.rows(C2, 'SELECT ' + viaDoc(loans[0].docno)), own1 = await T.rows(C1, 'SELECT ' + viaDoc(loans[0].docno));
  var tabs2 = Object.keys(mC2.byTable).filter(function (t) { return mC2.byTable[t] > 0; }).sort();
  verdict('B2', Number(own1[0].inv) === 1 && Number(own1[0].sch) === 2 && Number(own1[0].al) >= 1 && (mC1.thin.accepted - mC1.ownPlaced) > 0 && Number(foreign[0].inv) === 0 && Number(foreign[0].sch) === 0 && Number(foreign[0].al) === 0 && mC2.thin.refused > 0, 'borrower 2 received 0 ops of borrower 1: none of its invoice / instalments / allocations is in borrower 2\'s tables, although the relay delivered ' + mC2.delivered + ' ops and borrower 2 refused ' + mC2.thin.refused + ' locally (non-vacuous: borrower 1 holds its own ' + own1[0].sch + ' instalments and ' + own1[0].al + ' allocation)', JSON.stringify(foreign[0]) + ' projected by C2: ' + tabs2.map(function (t) { return t + ':' + mC2.byTable[t]; }).join(','));

  // ═══ §R / §P (agent F1's ports: Recurring 213 / 200074, Tenant Accounting Processor 53187) ═══
  var inv2 = loans.map(function (l) { return l.id; }).join(',');
  evt({ actor: 'phone1', kind: 'deliver', from: 'relay', label: 'balance', step: 'B1' }); evt({ actor: 'phone2', kind: 'deliver', from: 'relay', label: 'balance', step: 'B1' }); evt({ actor: 'phone2', kind: 'refuse', cls: 'n', text: 'not addressed to this phone: refused here', step: 'B2' });
  async function runMenuProcess(procId, label) {            // menu -> process dialog -> OK, as the clerk does; -> the §AD-PROC-LIVE line
    var mid = await T.rows(A, "SELECT ad_menu_id AS id FROM ad_menu WHERE ad_process_id=" + procId + " AND isactive='Y'"), n0 = A.logs.length;
    if (!mid.length || !(await clickLeaf(A.pg, mid[0].id))) return { line: '', note: 'no menu leaf for ' + label };
    await sleep(2500);
    try { await A.pg.waitForSelector('#idmp-content [data-proc-run]', { timeout: 20000 }); await A.pg.click('#idmp-content [data-proc-run]'); } catch (e) { return { line: '', note: 'no dialog for ' + label }; }
    await waitFor(async function () { return A.logs.slice(n0).some(function (l) { return new RegExp('§AD-PROC-LIVE proc=' + procId + ' ').test(l); }); }, 120000); await sleep(2500);
    return { line: A.logs.slice(n0).filter(function (l) { return new RegExp('§AD-PROC-LIVE proc=' + procId + ' ').test(l); }).pop() || '', note: '' };
  }
  if (!hasRec) inconclusive('R', 'needs F1: Recurring (213 / 200074) is not registered in this tree (feat/mf-ports not merged) - no renewal invoice can be judged');
  else {
    // the seed's own C_Recurring 100 'Monthy Invoice' has no invoice (legacy RecurringRun would fail on it and roll the whole run back: 'Fill mandatory fields: Invoice'); the operator pauses it first
    var seedRec = await T.rows(A, 'SELECT c_recurring_id AS id, c_invoice_id AS inv, isactive FROM c_recurring WHERE c_recurring_id=100'); if (seedRec.length && seedRec[0].isactive === 'Y') await update(A, 'c_recurring', 100, { isactive: 'N' });
    var before = await T.rows(A, 'SELECT documentno AS d FROM c_invoice WHERE c_bpartner_id=' + bps[0].id);
    await T.create(A, 'c_recurring', { ad_client_id: 11, ad_org_id: 11, isactive: 'Y', name: 'MF renewal ' + TAG, recurringtype: 'I', c_invoice_id: loans[0].id, frequencytype: 'M', frequency: 1, runsmax: 3, runsremaining: 3, datenextrun: '2026-10-28 00:00:00' });
    var nRR = A.logs.length, rr = await runMenuProcess(200074, 'Recurring Run');
    console.log('   §MFS_NOTE recurring-run ' + A.logs.slice(nRR).filter(function (l) { return /RECUR|Recurring|PROC-|Error|error|🔴/.test(l); }).slice(-8).map(function (l) { return l.slice(0, 260); }).join(' || '));
    var after = await T.rows(A, 'SELECT documentno AS d, grandtotal AS gt, docstatus AS ds, (SELECT count(*) FROM c_invoicepayschedule s WHERE s.c_invoice_id=i.c_invoice_id) AS ns FROM c_invoice i WHERE c_bpartner_id=' + bps[0].id);
    var fresh = after.filter(function (x) { return !before.some(function (b) { return b.d === x.d; }); });
    await visitAll([A, C1, C2], 3); var rb = await out(C1), rb2 = await out(C2);
    verdict('R', /ok=Y/.test(rr.line) && fresh.length === 1 && fresh[0].ds === 'CO' && Number(fresh[0].gt) === loans[0].gt && Number(fresh[0].ns) === 2 && rb.loans.length === 2 && rb.loans.some(function (l) { return l.no === fresh[0].d && Number(l.open) === loans[0].gt; }) && rb2.loans.length === 1, 'a renewed certificate = a NEW invoice raised by legacy Recurring Run (menu -> dialog -> OK): completed, same total, 2 instalments; it reaches the borrower\'s phone as a second loan (open = its total) and not the other borrower\'s', rr.note + ' ' + rr.line.slice(0, 110) + ' fresh=' + JSON.stringify(fresh) + ' phone1 loans=' + JSON.stringify(rb.loans.map(function (l) { return l.no + ':' + l.open; })) + ' phone2 loans=' + rb2.loans.length);
    evt({ actor: 'clerk', kind: 'run', process: 'Recurring Run', text: 'renewal invoice raised', step: 'R' });
  }
  if (!hasAcct) inconclusive('P', 'needs F1: Tenant Accounting Processor (53187) is not registered in this tree - no end-of-day posting can be judged');
  else {
    var idsP = pays.map(function (x) { return x.id; }).join(',');
    var factsOf = "SELECT p.c_payment_id AS id, p.posted, (SELECT COALESCE(SUM(amtacctdr),0) FROM fact_acct f WHERE f.ad_table_id=335 AND f.record_id=p.c_payment_id) AS dr, (SELECT COALESCE(SUM(amtacctcr),0) FROM fact_acct f WHERE f.ad_table_id=335 AND f.record_id=p.c_payment_id) AS cr FROM c_payment p WHERE p.c_payment_id IN (" + idsP + ") ORDER BY p.c_payment_id";
    var pre = await T.rows(A, factsOf);
    var pr = await runMenuProcess(53187, 'Tenant Accounting Processor'), post = await T.rows(A, factsOf);
    console.log('   §MFS_NOTE queued-before=' + JSON.stringify(pre.map(function (x) { return x.posted + ':' + x.dr; })) + ' after=' + JSON.stringify(post.map(function (x) { return x.posted + ':' + x.dr + '/' + x.cr; })) + ' ' + pr.line.slice(0, 120));
    verdict('P', pre.length === 3 && pre.every(function (x) { return x.posted !== 'Y' && Number(x.dr) === 0; }) && /ok=Y/.test(pr.line) && post.length === 3 && post.every(function (x) { return x.posted === 'Y' && Number(x.dr) > 0 && Math.abs(Number(x.dr) - Number(x.cr)) < 0.005; }), 'end of day the Tenant Accounting Processor (from the menu) posts the QUEUED receipts: before it Posted<>Y and no Fact_Acct (non-vacuous), after it Posted=Y and Fact_Acct balanced (dr = cr) for each of the 3', pr.note + ' ' + pr.line.slice(0, 100));
    evt({ actor: 'clerk', kind: 'run', process: 'Tenant Accounting Processor', text: 'receipts posted at close', step: 'P' });
  }

  await finish();

  // ═══ end of run ═══
  async function finish() {
    verdict('E0', errors === 0, '0 page errors on every page and frame (head office + 2 phones)', 'errors=' + errors + (errors ? ' ' + [A, C1, C2].map(function (d) { return d.errs[0]; }).filter(Boolean).slice(0, 2).join(' | ') : ''));
    var red = Object.keys(ARMS).filter(function (k) { return ARMS[k]; });
    console.log('§MFS_ARMS red=' + (red.length ? red.join(',') : 'none') + ' judged=' + judged + ' inconclusive=' + (INCONC.join(',') || 'none'));
    await browser.close(); server.close();
    if (QUIET || process.env.MFS_STOP) process.exit(red.length ? 1 : 0);
    if (!judged) { console.log('§MFS_VERDICT INCONCLUSIVE nothing was judged'); process.exit(2); }
    if (red.length) { console.log('§MFS_VERDICT FAIL judged=' + judged + ' fails=' + fails + ' red=' + red.join(',') + ' mutants=NOT RUN (the base run is red) pageerrors=' + errors); process.exit(1); }
    if (process.env.MFS_NO_MUT) { console.log('§MFS_VERDICT PASS judged=' + judged + ' fails=0 inconclusive=' + (INCONC.join(',') || 'none') + ' mutants=skipped pageerrors=' + errors); process.exit(0); }
    var M = [
      ['scope off: a DOWN row is addressed by role alone (borrower 2 receives borrower 1\'s ops)', '/common/comm/team_scope.js', [['if (!by || !by.length) return { ok: true };', 'if (true) return { ok: true };']], ['B2', 'S1'], 'S1'],
      ['local dedup off: the same bank reference / the same QR are written again', '/erp/borrower.js', [['if (await rowFor(binding, null, ans.ref)) {', 'if (false) {'], ['if (await rowFor(binding, qr, null) || seenRefused(qr)) {', 'if (false) {']], ['D1'], 'V1'],
      ['the balance is copied (remembered at first sight) instead of derived on every render', '/erp/borrower.js', [['var open = round2(Number(inv[i].grandtotal) - alloc);', "var open = (function () { var k = 'mf.open.' + inv[i].id, v = null; try { v = localStorage.getItem(k); if (v == null) { v = String(round2(Number(inv[i].grandtotal) - alloc)); localStorage.setItem(k, v); } } catch (e) { v = String(round2(Number(inv[i].grandtotal) - alloc)); } return Number(v); })();"]], ['B1'], null],
      ['the ToDo is not cleared when the service acknowledges (a waiting row is anything with a service message)', '/erp/borrower.js', [["function waiting(list) { return list.filter(function (r) { return r.isapproved === 'N' && !r.r_result; }); }", 'function waiting(list) { return list.filter(function (r) { return !!r.r_respmsg; }); }']], ['V2'], 'V2'],
      ['the adapter class is hardcoded in the page (the row is ignored)', '/erp/borrower.js', [['var cls = binding.payprocessorclass;', "var cls = 'org.kernel.slipverify.SlipOK';"]], ['V4'], 'V4']];
    var cp = require('child_process'), muts = [];
    for (var m of M) {
      var env = Object.assign({}, process.env, { MFS_ONLY_ARMS: '1', MFS_MUT: JSON.stringify({ file: m[1], edits: m[2] }) }); if (m[4]) env.MFS_STOP = m[4];
      var kk = cp.spawnSync(process.execPath, [__filename], { encoding: 'utf8', timeout: 1500000, env: env }), mm = /§MFS_ARMS red=(\S+)/.exec(kk.stdout || '');
      muts.push(mm ? { name: m[0], expect: m[3], red: mm[1] !== 'none' ? mm[1].split(',') : [] } : { name: m[0], error: 'CRASHED or NOT APPLIED (not a kill) ' + String((kk.stdout || '') + String(kk.stderr || '')).split('\n').filter(Boolean).slice(-3).join(' ') });
    }
    console.log('\n§MFS_MUTANTS');
    var killed = 0; muts.forEach(function (m) { var ok = !m.error && m.expect.some(function (e) { return m.red.indexOf(e) !== -1; }); if (ok) killed++; else fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + m.name + ' -> ' + (m.error || 'red arms: ' + (m.red.join(', ') || 'NONE (survivor = hole)'))); });
    console.log('§MFS_VERDICT ' + (fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' fails=' + fails + ' inconclusive=' + (INCONC.join(',') || 'none') + ' mutants_killed=' + killed + '/' + muts.length + ' pageerrors=' + errors);
    process.exit(fails ? 1 : 0);
  }
})().catch(function (e) { console.log('§MFS_CRASH ' + (e && e.stack || e)); process.exit(2); });
