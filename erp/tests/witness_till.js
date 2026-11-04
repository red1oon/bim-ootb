#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-TILL (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §15 + §15.8): W-TILL-PAD, W-TILL-DEPOSIT, W-TILL-OFFLINE, W-TILL-UNICENTA-PARITY for erp/till.html (the Unicenta-alike till, slice 1).
//   READ THE LOG after every run: every verdict is a § line, the exit code is not the evidence. A mutant that CRASHES is NOT a kill. INCONCLUSIVE when nothing was judged.
// ISSUES (each check names the one it proves or disproves):
//   PAD      the number-pad grammar of uniCenta (JPanelTicket.java:1027-1291) is a transcription that can drift: one case per transition, expected values written HERE from the Java lines, not read from till_pad.js.
//   DEPOSIT  a till sale must reach head office as ONE completed order with receipts, to the cent, while the till itself completes nothing: the page is driven by real clicks, the rows it deposited are replayed in the node kernel
//            and run through the shipped "Import POS Sales" process; receipt total == imported GrandTotal; the till wrote 0 core-document rows; DocumentNo identical + contiguous; PriceActual == the price paid; card-number columns empty;
//            change is never deposited.
//   OFFLINE  tickets rung with the network off are on the device, survive a reload, are numbered without reuse (none lost, none doubled); delivery at a Visit needs the two-device harness of witness_mf_seed.js (INCONCLUSIVE here).
//   PARITY   "Unicenta-alike" is a count: X of N (N from the registry, §14A.6) judged against the live DOM; INCONCLUSIVE x/N while x<N.
// Mutants (TILL_MUT=1; copies served in place of the real file, each proven applied exactly once, a crash is NOT a kill): price not carried, split ticket DocumentNo, till completes the order, pad '.' dropped.
// Run: node erp/tests/witness_till.js 2>&1 | tee /tmp/till_logs/witness_till.log      (TILL_ARMS=pad,parity,deposit,offline picks arms; TILL_MUT_ONE=<name> is the mutant child mode)
'use strict';
var path = require('path'), http = require('http'), fs = require('fs'), cp = require('child_process'), url = require('url');
var ROOT = path.join(__dirname, '..', '..'), ERP = path.join(ROOT, 'erp');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css' };
var SQLJS_DIR = process.env.SQLJS_DIR || '/home/red1/bim-ootb/tests/node_modules/sql.js';
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var ARMS = (process.env.TILL_ARMS || 'pad,deposit,offline,bar,held,edit,refund,custpay,panels,rest,parity').split(','), CHILD = process.env.TILL_MUT_ONE || '';
var J = JSON.stringify, sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
var V = {};   // verdict counters per arm
function check(arm, key, ok, label, info) { var c = V[arm] = V[arm] || { judged: 0, failed: 0 }; c.judged++; if (!ok) c.failed++; console.log('  §TILL_CHECK arm=' + arm + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' ' + label + (ok ? '' : ' got=' + J(info))); return ok; }
function verdict(arm, name) { var c = V[arm] || { judged: 0, failed: 0 }; var v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; console.log('§' + name + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed + (CHILD ? ' mutant=' + CHILD : '')); return v; }
function inconclusive(arm, name, why) { console.log('§' + name + ' verdict=INCONCLUSIVE ' + why); }

// ═══ PAD: the cases. State = {st, price, por, inV, porV}; st numbering = JPanelTicket.java:87-94. Expected effects are written from the Java line cited.
var Z = { st: 0, price: '', por: '', inV: 0, porV: 0 };
function S(st, price, por, inV, porV) { return { st: st, price: price, por: por, inV: inV, porV: porV }; }
var SEL = { selected: true, lines: 2, canEdit: true, type: 'S' }, SELR = { selected: true, lines: 2, canEdit: true, type: 'R' }, NOSEL = { selected: false, lines: 2, canEdit: true, type: 'S' }, NOLINES = { selected: false, lines: 0, canEdit: true, type: 'S' };
var PAD_CASES = [   // [line, name, start, key, ctx, expect{st,price,por,inV,porV,effect}]
  [1026, 'zero stays zero', Z, '0', SEL, S(0, '0', '', 0, 0), 'none'],
  [1028, 'first nonzero digit starts an integer', Z, '5', SEL, S(2, '5', '', 1, 0), 'none'],
  [1039, 'digit appends to integer', S(2, '12', '', 1, 0), '3', SEL, S(2, '123', '', 1, 0), 'none'],
  [1039, 'zero appends to integer', S(2, '12', '', 1, 0), '0', SEL, S(2, '120', '', 1, 0), 'none'],
  [1048, 'dot at zero starts a decimal', Z, '.', SEL, S(1, '0.', '', 0, 0), 'none'],
  [1054, 'dot after integer', S(2, '12', '', 1, 0), '.', SEL, S(3, '12.', '', 1, 0), 'none'],
  [1066, 'zero after 0.', S(1, '0.', '', 0, 0), '0', SEL, S(1, '0.0', '', 0, 0), 'none'],
  [1066, 'zero after decimal digits', S(3, '1.5', '', 1, 0), '0', SEL, S(3, '1.50', '', 1, 0), 'none'],
  [1074, 'nonzero after 0. makes it valid', S(1, '0.', '', 0, 0), '7', SEL, S(3, '0.7', '', 1, 0), 'none'],
  [1074, 'nonzero digit appends to decimal', S(3, '1.5', '', 1, 0), '2', SEL, S(3, '1.52', '', 1, 0), 'none'],
  [1080, '* after integer opens the factor', S(2, '12', '', 1, 0), '*', SEL, S(4, '12', 'x', 1, 0), 'none'],
  [1080, '* after decimal opens the factor', S(3, '1.5', '', 1, 0), '*', SEL, S(4, '1.5', 'x', 1, 0), 'none'],
  [1083, '* at zero makes price 0', Z, '*', SEL, S(4, '0', 'x', 0, 0), 'none'],
  [1083, '* after 0. makes price 0', S(1, '0.', '', 0, 0), '*', SEL, S(4, '0', 'x', 0, 0), 'none'],
  [1088, 'zero factor', S(4, '12', 'x', 1, 0), '0', SEL, S(4, '12', 'x0', 1, 0), 'none'],
  [1090, 'first nonzero factor digit is valid', S(4, '12', 'x', 1, 0), '4', SEL, S(6, '12', 'x4', 1, 1), 'none'],
  [1095, 'factor digit appends', S(6, '12', 'x4', 1, 1), '2', SEL, S(6, '12', 'x42', 1, 1), 'none'],
  [1095, 'factor zero appends', S(6, '12', 'x4', 1, 1), '0', SEL, S(6, '12', 'x40', 1, 1), 'none'],
  [1100, 'dot at zero factor', S(4, '12', 'x', 1, 0), '.', SEL, S(5, '12', 'x0.', 1, 0), 'none'],
  [1108, 'dot after factor integer', S(6, '12', 'x4', 1, 1), '.', SEL, S(7, '12', 'x4.', 1, 1), 'none'],
  [1115, 'zero after x0.', S(5, '12', 'x0.', 1, 0), '0', SEL, S(5, '12', 'x0.0', 1, 0), 'none'],
  [1115, 'zero after factor decimal', S(7, '12', 'x4.', 1, 1), '0', SEL, S(7, '12', 'x4.0', 1, 1), 'none'],
  [1118, 'nonzero after x0. makes the factor valid', S(5, '12', 'x0.', 1, 0), '5', SEL, S(7, '12', 'x0.5', 1, 1), 'none'],
  [1118, 'nonzero appends to factor decimal', S(7, '12', 'x4.', 1, 1), '5', SEL, S(7, '12', 'x4.5', 1, 1), 'none'],
  [1123, 'scale key with no scale device beeps', S(2, '12', '', 1, 0), '§', SEL, S(2, '12', '', 1, 0), 'beep'],
  [1174, '+ with nothing typed: one unit more on the selected line', Z, '+', SEL, Z, 'incLine'],
  [1174, '+ with nothing typed and no selected line beeps (state kept)', S(0, '0', '', 0, 0), '+', NOSEL, S(0, '0', '', 0, 0), 'beep'],
  [1191, '- with nothing typed: one unit less on the selected line', Z, '-', SEL, Z, 'decLine'],
  [1191, '- with nothing typed and no selected line beeps', Z, '-', NOSEL, Z, 'beep'],
  [1220, '+ after a factor: set n units on the selected line', S(6, '', 'x3', 0, 1), '+', SEL, Z, 'setLine'],
  [1220, '+ after a factor and no selected line beeps', S(6, '', 'x3', 0, 1), '+', NOSEL, S(6, '', 'x3', 0, 1), 'beep'],
  [1686, '5.0: - after a factor on a SALE: n units, price made positive (the 3.81 negation is gone)', S(6, '', 'x3', 0, 1), '-', SEL, Z, 'setLine'],
  [1686, '5.0: - after a factor on a REFUND: n units taken as -n', S(6, '', 'x3', 0, 1), '-', SELR, Z, 'setLine'],
  [1642, '5.0: + after a factor on a REFUND: -n units', S(6, '', 'x3', 0, 1), '+', SELR, Z, 'setLine'],
  [1550, '5.0: + with nothing typed on a REFUND line: one more refunded unit (qty -1)', Z, '+', SELR, Z, 'incLine'],
  [1589, '5.0: - with nothing typed on a REFUND line: also qty -1 (3.81 went toward 0)', Z, '-', SELR, Z, 'incLine'],
  [1258, '+ after a price: one free-price product', S(3, '2.5', '', 1, 0), '+', SEL, Z, 'addFree'],
  [1266, '- after a price: one negative-price product', S(3, '2.5', '', 1, 0), '-', SEL, Z, 'addFree'],
  [1273, '+ after price and factor: n free-price products', S(6, '2.5', 'x3', 1, 1), '+', SEL, Z, 'addFree'],
  [1280, '- after price and factor: n negative-price products', S(6, '2.5', 'x3', 1, 1), '-', SEL, Z, 'addFree'],
  [1285, '= with lines goes to payment (state kept until the host resets)', Z, '=', SEL, Z, 'pay'],
  [1285, 'space with lines goes to payment', Z, ' ', SEL, Z, 'pay'],
  [1285, '= with no lines beeps', Z, '=', NOLINES, Z, 'beep'],
  [1024, 'delete key clears the entry', S(6, '12', 'x4', 1, 1), '\u007f', SEL, Z, 'clear'],
  [890, 'Enter with a typed barcode looks the code up', null, '\n', SEL, Z, 'barcode'],
  [890, 'Enter with an empty barcode beeps', Z, '\n', SEL, Z, 'beep'],
  [1021, 'a second dot in a decimal matches no branch', S(3, '1.5', '', 1, 0), '.', SEL, S(3, '1.5', '', 1, 0), 'none']
];
function runPad(P) {
  var n = 0, ok = 0;
  PAD_CASES.forEach(function (c) {
    var start = c[2], s0;
    if (start === null) { s0 = P.zero(); s0.barcode = '12345'; } else { s0 = P.zero(); s0.st = start.st; s0.price = start.price; s0.por = start.por; s0.inValid = start.inV; s0.porValid = start.porV; }
    var r = P.press(s0, c[3], c[4]), s = r.state, e = c[5], eff = r.effect && r.effect.type;
    var good = s.st === e.st && s.price === e.price && s.por === e.por && s.inValid === e.inV && s.porValid === e.porV && eff === c[6];
    n++; if (good) ok++; check('pad', 'L' + c[0] + '-' + n, good, 'JPanelTicket.java:' + c[0] + ' ' + c[1], { got: { st: s.st, price: s.price, por: s.por, inV: s.inValid, porV: s.porValid, eff: eff }, want: { st: e.st, price: e.price, por: e.por, inV: e.inV, porV: e.porV, eff: c[6] } });
  });
  // payload checks the effect carries what the Java reads (getPorValue/getInputValue)
  var sFree = P.press(Object.assign(P.zero(), { st: 6, price: '2.5', por: 'x3', inValid: 1, porValid: 1 }), '+', SEL).effect;
  check('pad', 'payload-free', sFree.qty === 3 && sFree.price === 2.5, 'n free-price products carries qty 3 price 2.5', sFree);
  var pq = function (type, key) { return P.press(Object.assign(P.zero(), { st: 6, price: '', por: 'x3', inValid: 0, porValid: 1 }), key, Object.assign({}, SEL, { type: type })).effect; };
  check('pad', 'q-sale-minus', pq('S', '-').qty === 3, 'JPanelTicket.java:1686 5.0 n - on a sale line sets qty 3', pq('S', '-'));
  check('pad', 'q-refund-minus', pq('R', '-').qty === -3, 'JPanelTicket.java:1686 5.0 n - on a refund line sets qty -3', pq('R', '-'));
  check('pad', 'q-refund-plus', pq('R', '+').qty === -3, 'JPanelTicket.java:1642 5.0 n + on a refund line sets qty -3', pq('R', '+'));
  check('pad', 'q-sale-plus', pq('S', '+').qty === 3, 'JPanelTicket.java:1642 n + on a sale line sets qty 3', pq('S', '+'));
  var dR = P.press(P.zero(), '-', SELR).effect, iR = P.press(P.zero(), '+', SELR).effect;
  check('pad', 'delta-refund', dR.delta === -1 && iR.delta === -1, 'JPanelTicket.java:1550,1589 5.0 + and - on a refund line both add -1 to the qty', { dR: dR, iR: iR });
  var sNeg = P.press(Object.assign(P.zero(), { st: 3, price: '2.5', por: '', inValid: 1, porValid: 0 }), '-', SEL).effect;
  check('pad', 'payload-neg', sNeg.price === -2.5, 'negative-price product carries -2.5', sNeg);
  var pa = P.product(Z, {}), pb = P.product(Object.assign(P.zero(), { st: 2, price: '3', inValid: 1 }), {}), pc = P.product(Object.assign(P.zero(), { st: 6, price: '3', por: 'x2', inValid: 1, porValid: 1 }), {});
  check('pad', 'product-1', pa.effect.type === 'addProduct' && pa.effect.qty === 1, 'JPanelTicket.java:873 a product button with nothing typed adds one unit', pa.effect);
  check('pad', 'product-n', pb.effect.type === 'addProduct' && pb.effect.qty === 3, 'JPanelTicket.java:875 a number typed before a product button is its quantity', pb.effect);
  check('pad', 'product-factor', pc.effect.type === 'beep', 'JPanelTicket.java:879 price and factor typed before a fixed-price product beeps', pc.effect);
  console.log('§TILL_PAD transitions ' + ok + '/' + n + ' judged=' + V.pad.judged);
}

// ═══ the page harness (served from this tree; TILL_MUT = [{file, from, to}] serves a COPY with one rule broken, proven applied exactly once)
var MUT = process.env.TILL_MUT ? JSON.parse(process.env.TILL_MUT) : null;
var OVER = {};
if (MUT) MUT.forEach(function (e) {
  var orig = fs.readFileSync(path.join(ROOT, e.file), 'utf8'); if (orig.split(e.from).length !== 2) { console.log('§TILL_CRASH MUTATION DID NOT APPLY (anchor not found exactly once) ' + e.file + ' :: ' + e.from.slice(0, 60)); process.exit(2); }
  OVER['/' + e.file] = orig.replace(e.from, function () { return e.to; });
});
async function startServer() {
  var server = http.createServer(function (req, res) {
    var u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
    if (OVER[p] != null) { res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(OVER[p]); return; }
    var f = path.join(ROOT, p); if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  return { server: server, base: 'http://127.0.0.1:' + server.address().port };
}
var ERRS = [];
async function openTill(ctx, base, qs) {
  var pg = await ctx.newPage(); pg.__logs = [];
  pg.on('console', function (m) { var t = m.text(); pg.__logs.push(t); if (/^§TILL_(COST|BOOT|DEPOSIT|Z|CLOSE|ZREPRINT|MSG|ES|HELD|REFUND|EDIT|DISCOUNT|TABLE|CASHIO|PRESENCE|PICKUP|VOUCHER|REPRINT|LINEREMOVED|QUICKLOGOFF|EXT)|🔴/.test(t)) console.log('   [page] ' + t.slice(0, 300)); });
  pg.on('pageerror', function (e) { ERRS.push(e.message); console.log('   [pageerror] ' + e.message); });
  await pg.goto(base + '/erp/till.html' + (qs || ''), { waitUntil: 'load' });
  await pg.waitForFunction(function () { return window.Till && window.Till.ready; }, null, { timeout: 170000 });
  return pg;
}
var rowsOf = function (pg, sql) { return pg.evaluate(function (q) { return window.Till.rows(q); }, sql); };
async function loginSales(pg) {
  await pg.click('#u1 .u-user:has-text("GardenAdmin")'); await pg.click('#u2 [data-panel="Sales"]');
}
async function typeNum(pg, n) { for (var ch of String(n)) await pg.click('#east .key[data-key="' + ch + '"]'); }
async function clickProduct(pg, pid) {   // walk the catalog like a cashier: root categories -> product tile
  async function visible() { return (await pg.$('#products .prod[data-pid="' + pid + '"]')) !== null; }
  if (await visible()) { await pg.click('#products .prod[data-pid="' + pid + '"]'); return true; }
  var cats = await pg.$$eval('#cats [data-cat]', function (b) { return b.map(function (x) { return x.getAttribute('data-cat'); }); });
  for (var c of cats) {
    await pg.click('#cats [data-cat="' + c + '"]');
    if (await visible()) { await pg.click('#products .prod[data-pid="' + pid + '"]'); return true; }
    if (await clickProduct(pg, pid)) return true;
    if (await pg.$('#cats [data-cat-up]')) await pg.click('#cats [data-cat-up]');
  }
  return false;
}
async function pay(pg, parts) {   // parts [{tab, amount, ref, auth}] then OK
  await pg.click('#east .key[data-key="="]'); await pg.waitForSelector('#u8.on');
  for (var p of parts) {
    await pg.click('#tabs [data-tab="' + p.tab + '"]');
    if (p.amount != null) await pg.fill('#tender-amount', String(p.amount));
    if (p.ref) { await pg.fill('#card-ref', p.ref); await pg.fill('#card-auth', p.auth); }
    if (p !== parts[parts.length - 1]) await pg.click('#addpart');
  }
  await pg.click('#pay-ok'); await pg.waitForSelector('#u9.on', { timeout: 20000 });
}
var num = function (x) { return x == null ? null : Number(x); };

var LOGGED = false;
async function runKdsChild() {   // W-KDS-BRANCH + W-KDS-REPLACE as a child process; TILL_KDS_LOG=<file> reads an existing log of the SAME tree instead (named in the run)
  var out = ''; var cp = require('child_process');
  if (process.env.TILL_KDS_LOG) out = fs.readFileSync(process.env.TILL_KDS_LOG, 'utf8');
  else { var r = cp.spawnSync('node', [path.join(ERP, 'tests', 'witness_kds.js')], { env: Object.assign({}, process.env, { KDS_ARMS: 'branch,replace', KDS_ROOT: ROOT }), encoding: 'utf8', timeout: 1200000, maxBuffer: 64 * 1024 * 1024 }); out = (r.stdout || '') + (r.stderr || ''); }
  var judged = 0, failed = 0, n = 0; out.split('\n').forEach(function (l) { var m = /^§KDS_VERDICT (W-KDS-(?:BRANCH|REPLACE)) verdict=(\w+) judged=(\d+) failed=(\d+)/.exec(l); if (m) { n++; judged += Number(m[3]); failed += Number(m[4]); if (m[2] !== 'PASS') failed += 1; } });
  return { judged: n === 2 ? judged : 0, failed: failed, note: 'verdict lines read=' + n + (process.env.TILL_KDS_LOG ? ' (from ' + process.env.TILL_KDS_LOG + ')' : ' (child run)') };
}
// ═══ PARITY: X of N from the registry against the live DOM. A row whose source asserts BEHAVIOUR is present only if the arm that walks that behaviour has judged > 0 and failed 0 in this run (ROWARM); parity runs last.
var ROWARM = { 15: 'kds', 20: 'kds', 6: 'bar', 7: 'held', 10: 'edit', 11: 'refund', 12: 'custpay', 13: 'panels', 16: 'rest', 17: 'rest', 18: 'panels', 19: 'panels', 21: 'panels', 22: 'panels' };
async function prepare(pg, screen) {   // put the live page on the screen a registry row talks about, by the cashier's own clicks
  if (screen === 'login') { await pg.evaluate(function () { window.Till.go('login'); }); return; }
  if (!LOGGED) { await pg.evaluate(function () { window.Till.go('login'); }); await pg.click('#u1 .u-user:has-text("GardenAdmin")'); LOGGED = true; }
  if (['menu', 'close', 'editsales', 'refund', 'custpay', 'payments', 'vouchers', 'presence', 'pickup', 'floors', 'reservations'].indexOf(screen) >= 0) { await pg.evaluate(function (s) { window.Till.go(s); }, screen); return; }
  await pg.evaluate(function () { window.Till.go('sales'); });
  if (!(await pg.$('#products .prod'))) { var c = await pg.$('#cats [data-cat]'); if (c) await c.click(); }
  if (screen === 'sales') return;
  if (!(await pg.$('#tl tr.line'))) await pg.click('#products .prod');
  if (!(await pg.$('#u8.on'))) { await pg.click('#east .key[data-key="="]'); await pg.waitForSelector('#u8.on'); }
  if (screen === 'pay') return;
  await pg.click('#pay-ok'); await pg.waitForSelector('#u9.on', { timeout: 20000 });
}
async function runParity(pg, pgRest, pgKit) {
  var R = await pg.evaluate(function () { return window.Till.registry.ROWS; }), x = 0, N = R.length, detail = [];
  var SCREENS = ['login', 'menu', 'sales', 'pay', 'receipt', 'close', 'editsales', 'refund', 'custpay', 'payments', 'vouchers', 'presence', 'pickup', 'floors', 'reservations', 'kitchen'];
  for (var row of R) {
    var ok = false, why = '', page = row.page === 'kitchen.html' ? pgKit : row.mode === 'restaurant' ? pgRest : pg;
    if (row.status !== 'built' || SCREENS.indexOf(row.screen) < 0) { why = 'no such screen in the page (registry status ' + row.status + ')'; }
    else {
      try {
        if (!page) { why = 'its page (' + row.page + ') did not open'; throw new Error(why); }
        if (row.page) { /* a separate page (the kitchen screen): nothing to prepare */ } else if (page === pgRest) { await page.evaluate(function (s) { window.Till.go(s); }, row.screen); } else await prepare(page, row.screen);
        ok = true;
        for (var sel of row.sels || []) { if (!(await page.$(sel))) { ok = false; why += ' missing ' + sel; } }
        var ords = ['order', 'order2', 'order3'].map(function (k) { return row[k]; }).filter(Boolean);
        for (var o of ords) {
          var texts = await page.$$eval(o.container + ' ' + (o.item.indexOf(':scope') === 0 ? '' : o.item), function (els) { return els.map(function (e) { return e.textContent.trim().replace(/\s+[\d.,?-]+$/, ''); }); }).catch(function () { return []; });
          if (o.item.indexOf(':scope') === 0) texts = await page.$$eval(o.container + ' > [data-btn]', function (els) { return els.map(function (e) { return e.getAttribute('data-btn'); }); });
          if (J(texts) !== J(o.texts)) { ok = false; why += ' order ' + o.container + ' got ' + J(texts); }
        }
        if (row.btns) { var bs = await page.$$eval(row.btns.container + ' [data-btn]', function (b) { return b.map(function (e) { return [e.getAttribute('data-btn'), e.disabled]; }); }); if (J(bs.map(function (e) { return e[0]; })) !== J(row.btns.texts) || (row.btns.enabled && bs.some(function (e) { return e[1]; }))) { ok = false; why += ' buttons ' + J(bs); } }
        if (row.absent) { var pres = []; for (var an of row.absent) if (await page.$('#scriptbar [data-btn="' + an + '"]')) pres.push(an); if (pres.length) { ok = false; why += ' present but commented out in Ticket.Buttons.xml: ' + pres; } }
        if (row.optionTexts) { var ot = await page.$$eval(row.optionTexts.sel, function (o) { return o.map(function (x) { return x.textContent; }); }); if (J(ot) !== J(row.optionTexts.texts)) { ok = false; why += ' options ' + J(ot); } }
        if (row.count) { var cn = (await page.$$(row.count.sel)).length; if (cn !== row.count.n) { ok = false; why += ' count ' + row.count.sel + '=' + cn; } }
        if (row.tile) { var tl = await page.evaluate(function () { var c = document.querySelector('#products .prod'); if (!c) return null; var cs = getComputedStyle(c); return [cs.width, cs.height]; }); if (!tl) { why += ' no tile on screen'; ok = false; } else if (tl[0] !== row.tile.w + 'px' || tl[1] !== row.tile.h + 'px') { ok = false; why += ' tile ' + tl; } }
        if (row.padWitness && !(V.pad && V.pad.judged > 0 && V.pad.failed === 0)) { ok = false; why += ' pad witness not PASS in this run'; }
        var arm = ROWARM[row.w]; if (ok && arm && !(V[arm] && V[arm].judged > 0 && V[arm].failed === 0)) { ok = false; why += ' behaviour arm "' + arm + '" not PASS in this run (' + J(V[arm] || null) + ')'; }
      } catch (e) { ok = false; why = 'threw ' + e.message; }
    }
    if (ok) x++; detail.push(row.w + (ok ? '+' : '-'));
    if (ok && row.status !== 'built') console.log('  §TILL_PARITY_STALE w=' + row.w + ' registry says ' + row.status + ' but the DOM has it');
    console.log('  §TILL_PARITY_ROW w=' + row.w + ' ' + row.u + ' "' + row.label + '" status=' + row.status + (row.partial ? ' PARTIAL' : '') + ' ' + (ok ? 'PRESENT' : 'MISSING') + (why ? ' (' + why.trim() + ')' : ''));
  }
  return { x: x, N: N, detail: detail };
}

// ═══ the node kernel for DEPOSIT (the witness_pos_sales.js harness: shipped plugin + shipped processes)
async function nodeHead(taxRate) {
  if (!global.window) global.window = {}; if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
  if (!process.env.SQLJS) process.env.SQLJS = SQLJS_DIR;
  var initSqlJs = require(SQLJS_DIR), SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIR, 'dist', f); } });
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); } catch (e) { /* as the loader */ } });
  var rq = function (n) { return require(path.join(ERP, n)); };
  rq('ad_import_tables.js').ensure(db); try { rq('ad_rule.js').ensure(db); } catch (e) { /* idem */ }
  db.run('UPDATE c_tax SET rate=? WHERE c_tax_id=104', [taxRate]);                     // the same tax edit the page got (applyOp), so rounding is exercised
  function q0(sql, params) { var st = db.prepare(sql), out = []; try { if (params && params.length) st.bind(params); while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } } finally { st.free(); } return out; }
  var K = rq('ws_kernel.js'), k = K.build(db), ML = k.ML, AP = rq('ad_process.js'), PR = rq('plugin_registry.js');
  var S0 = { clientId: 11, orgId: 11, userId: 100, roleId: 102, warehouseId: 103, actor: 'witness:till' };
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

var CORE = ['c_order', 'c_orderline', 'm_inout', 'm_inoutline', 'c_invoice', 'c_invoiceline', 'c_payment', 'c_allocationhdr', 'fact_acct'];
async function coreCounts(pg) { var o = {}; for (var t of CORE) { try { o[t] = num((await rowsOf(pg, 'SELECT count(*) AS n FROM ' + t))[0].n); } catch (e) { o[t] = -1; } } return o; }
var money2 = function (n) { return (Math.round(n * 100) / 100).toFixed(2); };

// ═══ DEPOSIT
async function runDeposit(ctx, base) {
  var TAX = 7.25;
  var pg = await openTill(ctx, base);
  // a non-zero tax so the rounding is exercised (the seed's Standard tax is 0%): the same edit on the device (an op) and on the head-office replica
  var taxWritten = await pg.evaluate(function (rate) { return new Promise(function (res) { var E = window.Till.engine(); var once = function (e) { if (e.detail && String(e.detail.table).toLowerCase() === 'c_tax') { E.removeEventListener('overlay:committed', once); res(true); } }; E.addEventListener('overlay:committed', once); E.__crud.applyOp({ op_type: 'CRUD_UPDATE', key: 'c_tax', table: 'c_tax', verb: 'update', id: 104, changes: { rate: rate } }); setTimeout(function () { res(false); }, 10000); }); }, TAX);
  check('deposit', 'tax-edit-committed', taxWritten === true, 'the tax edit (Standard 0% -> ' + TAX + '%) committed on the device before the page is reopened', taxWritten);
  await pg.close(); pg = await openTill(ctx, base);
  var trate = (await rowsOf(pg, 'SELECT rate FROM c_tax WHERE c_tax_id=104'))[0];
  console.log('§TILL_TAXLIVE arm=deposit rate=' + (trate && trate.rate) + ' expect=' + TAX + ' (first tip read after reopen; sidecar must be hydrated before it, crud_overlay §TIP_READ_HYDRATED)');
  check('deposit', 'tax-live', num(trate.rate) === TAX, 'the device sees Standard tax at ' + TAX + '% (non-vacuous: the seed has 0%)', trate);
  var before = await coreCounts(pg);
  await loginSales(pg);
  // ticket 1: 3 lines through the pad (quantity typed before the product tile), cash + card
  var PIDS = [[128, 2], [129, 1], [127, 3]];
  for (var pr of PIDS) { if (pr[1] > 1) await typeNum(pg, pr[1]); check('deposit', 'tile-' + pr[0], await clickProduct(pg, pr[0]), 'catalog reaches product ' + pr[0], null); }
  var domLines = await pg.$$eval('#tl tr.line', function (trs) { return trs.map(function (t) { var c = t.querySelectorAll('td'); return { name: c[0].textContent, price: c[1].textContent, qty: c[2].textContent, value: c[3].textContent }; }); });
  check('deposit', 'lines', domLines.length === 3 && domLines[0].qty === 'x2' && domLines[2].qty === 'x3', '3 ticket lines with the typed quantities', domLines);
  var tot = await pg.$eval('#t-tot', function (e) { return e.textContent; }), sub = await pg.$eval('#t-sub', function (e) { return e.textContent; }), taxs = await pg.$eval('#t-tax', function (e) { return e.textContent; });
  console.log('§TILL_TICKET1 lines=3 subtotal=' + sub + ' tax=' + taxs + ' total=' + tot);
  var cashAmt = Math.floor(Number(tot) / 2);
  await pay(pg, [{ tab: 'cash', amount: cashAmt }, { tab: 'magcard', amount: money2(Number(tot) - cashAmt), ref: 'TRX-T1-0001', auth: 'AUTH-T1' }]);
  var rc1 = await pg.$$eval('#receipt .rf', function (e) { return e.map(function (x) { return x.getAttribute('data-f'); }); });
  var rcTotal1 = await pg.$eval('#receipt .rf[data-f="Total"]', function (e) { return e.textContent; });
  var key1 = await pg.$eval('#receipt .rf[data-f="Receipt"]', function (e) { return e.textContent.split('  ')[1]; });
  var changeHidden1 = await pg.$eval('#changepop', function (e) { return e.hidden; });
  await pg.click('#rc-ok');
  // ticket 2: one line, cash over-tendered -> change pop-up, change NOT deposited
  await clickProduct(pg, 128); var tot2 = await pg.$eval('#t-tot', function (e) { return e.textContent; }); var tend2 = Math.ceil(Number(tot2)) + 20;
  await pay(pg, [{ tab: 'cash', amount: tend2 }]);
  var pop2 = await pg.$eval('#changepop', function (e) { return { hidden: e.hidden, text: e.textContent }; });
  var key2 = await pg.$eval('#receipt .rf[data-f="Receipt"]', function (e) { return e.textContent.split('  ')[1]; });
  await pg.click('#rc-ok');
  console.log('§TILL_TICKET2 total=' + tot2 + ' tendered=' + tend2 + ' popup=' + J(pop2));
  check('deposit', 'receipt-order', J(rc1.slice(0, 5)) === J(['Receipt', 'Date', 'Terminal', 'Served by', 'Item']) && rc1.indexOf('Items count') > 0 && rc1.indexOf('Total') > rc1.indexOf('Items count'), 'receipt fields follow Printer.Ticket.xml order', rc1);
  check('deposit', 'change-pop', changeHidden1 === true && pop2.hidden === false && pop2.text === 'Change: ' + money2(tend2 - Number(tot2)), 'change pop-up only for a cash first tender with change (ticket 1 none, ticket 2 "Change: ' + money2(tend2 - Number(tot2)) + '")', { changeHidden1: changeHidden1, pop2: pop2 });
  // the deposited rows, as the device holds them
  var orders = await rowsOf(pg, 'SELECT * FROM i_order ORDER BY ABS(i_order_id)'), pays = await rowsOf(pg, 'SELECT * FROM i_payment ORDER BY ABS(i_payment_id)');
  var after = await coreCounts(pg);
  var o1 = orders.filter(function (r) { return r.documentno === key1; }), o2 = orders.filter(function (r) { return r.documentno === key2; }), p1 = pays.filter(function (r) { return r.documentno === key1; }), p2 = pays.filter(function (r) { return r.documentno === key2; });
  console.log('§TILL_DEPOSIT_ROWS ticket1 key=' + key1 + ' i_order=' + o1.length + ' i_payment=' + p1.length + ' | ticket2 key=' + key2 + ' i_order=' + o2.length + ' i_payment=' + p2.length);
  check('deposit', 'rows-present', o1.length === 3 && p1.length === 2 && o2.length === 1 && p2.length === 1, 'ticket 1 = 3 I_Order + 2 I_Payment, ticket 2 = 1 + 1 (one DocumentNo each)', { o1: o1.length, p1: p1.length, o2: o2.length, p2: p2.length });
  check('deposit', 'key-shape', /^Store Central-webserv-S\d+$/.test(key1) && key1 !== key2, 'DocumentNo = <Org>-<TillUser>-S<n> (till + type + number) and differs per ticket', { key1: key1, key2: key2 });
  var idsO = o1.map(function (r) { return Math.abs(num(r.i_order_id)); }), contiguous = idsO.every(function (v, i) { return i === 0 || v === idsO[i - 1] + 1; });
  check('deposit', 'contiguous', contiguous && new Set(o1.map(function (r) { return r.documentno; })).size === 1, 'the ticket\'s I_Order rows are contiguous with ONE DocumentNo', idsO);
  var priceOK = o1.every(function (r, i) { return money2(num(r.priceactual)) === domLines[i].price; });
  check('deposit', 'price-carried', priceOK, 'I_Order.PriceActual == the price paid shown on the ticket, every line', { rows: o1.map(function (r) { return r.priceactual; }), dom: domLines.map(function (l) { return l.price; }) });
  check('deposit', 'qty-carried', J(o1.map(function (r) { return num(r.qtyordered); })) === J([2, 1, 3]), 'I_Order.QtyOrdered == typed quantities 2,1,3', o1.map(function (r) { return r.qtyordered; }));
  var cardCols = pays.every(function (r) { return !r.creditcardnumber && !r.creditcardvv && !r.creditcardexpmm && !r.creditcardexpyy; });
  check('deposit', 'no-card-number', pays.length === 3 && cardCols, 'card-number columns (CreditCardNumber/VV/ExpMM/ExpYY) are empty on every deposited tender (n=' + pays.length + ')', null);
  var tt = p1.map(function (r) { return r.tendertype; }).sort().join('');
  check('deposit', 'tender-types', tt === 'CX' && p1.filter(function (r) { return r.tendertype === 'C'; })[0].r_pnref === 'TRX-T1-0001' && p1.filter(function (r) { return r.tendertype === 'C'; })[0].r_authcode === 'AUTH-T1', 'cash -> X, card -> C with the terminal reference in R_PnRef / R_AuthCode', p1.map(function (r) { return [r.tendertype, r.r_pnref, r.r_authcode]; }));
  check('deposit', 'change-not-deposited', num(p2[0].payamt) === num(Number(tot2)), 'ticket 2 tendered ' + tend2 + ' but the deposited PayAmt is the amount applied ' + tot2 + ' (change is never deposited)', p2[0].payamt);
  var dl = Object.keys(after).filter(function (t) { return after[t] !== before[t]; });
  check('deposit', 'zero-core-docs', Object.keys(before).every(function (t) { return before[t] >= 0; }) && dl.length === 0, 'the till wrote ZERO rows of ' + CORE.join('/') + ' (FL-8) (before=' + J(before) + ')', { before: before, after: after, changed: dl });
  console.log('§TILL_CORE_DOCS before=' + J(before) + ' after=' + J(after));
  // head office: replay the exact rows, run the SHIPPED Import POS Sales
  var H = await nodeHead(TAX);
  check('deposit', 'plugin-up', H.started === 'ACTIVE', 'the pos-integration bundle is ACTIVE on the head-office replica', H.started);
  var d = H.commit(function (trx, ML) { orders.concat([]).forEach(function () {}); var all = orders.map(function (r) { return { t: 'i_order', f: clean(r) }; }).concat(pays.map(function (r) { return { t: 'i_payment', f: clean(r) }; }));
    for (var i = 0; i < all.length; i++) { var sv = ML.save(trx, all[i].t, null, ML.newPO(trx, all[i].t, all[i].f)); if (!sv.ok) return { ok: false, error: all[i].t + ' #' + i + ': ' + sv.error }; } return { ok: true }; });
  check('deposit', 'replay', d.ok, 'the deposited rows are accepted by the head-office kernel as they stand', d.error);
  var run = H.commit(function (trx) { var r0 = H.AP.runInTrx(trx, 9538001, { params: { C_BankAccount_ID: 100, AD_Client_ID: 11 } }); return { ok: r0.ok, r: r0, error: r0.summary }; }, { ws: 'import_pos_sales' });
  (run.log || []).filter(function (l) { return /^§POSS/.test(l); }).forEach(function (l) { console.log('   [head office] ' + l.slice(0, 260)); });
  var one = function (sql, p) { return H.q0(sql, p || [])[0] || null; };
  var res = {};
  [[key1, 'T1', Number(tot), 3, 2], [key2, 'T2', Number(tot2), 1, 1]].forEach(function (t) {
    var key = t[0], ords = H.q0('SELECT * FROM c_order WHERE documentno=?', [key]), ord = ords[0], invs = ord ? H.q0('SELECT * FROM c_invoice WHERE c_order_id=?', [ord.c_order_id]) : [], inv = invs[0];
    var rec = H.q0('SELECT * FROM c_payment WHERE documentno=?', [key]), allocs = inv ? H.q0("SELECT COALESCE(SUM(l.amount+l.discountamt+l.writeoffamt),0) AS s FROM c_allocationline l JOIN c_allocationhdr h ON h.c_allocationhdr_id=l.c_allocationhdr_id WHERE l.c_invoice_id=? AND h.docstatus IN ('CO','CL')", [inv.c_invoice_id])[0].s : null;
    var open = inv ? Math.round((Number(inv.grandtotal) - Number(allocs)) * 100) / 100 : null;
    check('deposit', t[1] + '-one-order', ords.length === 1 && ord.docstatus === 'CO', t[1] + ': ONE completed order from the ticket (' + ords.length + ')', ords.map(function (o) { return o.docstatus; }));
    check('deposit', t[1] + '-lines', ord && H.q0('SELECT count(*) AS n FROM c_orderline WHERE c_order_id=?', [ord.c_order_id])[0].n === t[3], t[1] + ': ' + t[3] + ' order lines', null);
    check('deposit', t[1] + '-invoice', invs.length === 1 && inv.docstatus === 'CO', t[1] + ': ONE completed invoice', invs.length);
    check('deposit', t[1] + '-receipts', rec.length === t[4] && rec.every(function (p) { return p.docstatus === 'CO'; }), t[1] + ': ' + t[4] + ' completed receipt(s)', rec.length);
    check('deposit', t[1] + '-open-0', open === 0, t[1] + ': invoice open amount (independent allocation oracle) = 0', open);
    check('deposit', t[1] + '-to-the-cent', inv && Math.round(Number(inv.grandtotal) * 100) === Math.round(t[2] * 100), t[1] + ': receipt total ' + money2(t[2]) + ' == imported GrandTotal ' + (inv && money2(Number(inv.grandtotal))) + ' to the cent', { receipt: t[2], grand: inv && inv.grandtotal });
    res[t[1]] = { grand: inv && Number(inv.grandtotal), receipt: t[2] };
  });
  console.log('§TILL_TOTALS ' + J(res) + ' tax_rate=' + TAX);
  var cards = H.q0("SELECT creditcardnumber AS n FROM c_payment WHERE documentno IN (?,?) AND creditcardnumber IS NOT NULL AND creditcardnumber<>''", [key1, key2]);
  check('deposit', 'no-card-on-c_payment', cards.length === 0, 'card-number columns still empty on the imported C_Payment rows', cards);
  // U14 Close Cash: the Z is re-derived from the shift's deposited rows; compare with the head-office books as the independent oracle
  await pg.evaluate(function () { window.Till.go('close'); }); await sleep(800);
  var zdom = await pg.evaluate(function () { function t(id) { return document.getElementById(id).textContent; } return { seq: t('z-seq'), tickets: t('z-tickets'), units: t('z-units'), gross: t('z-gross'), payments: t('z-payments'), net: t('z-net'), bytender: [].map.call(document.querySelectorAll('#z-bytender [data-tender]'), function (e) { return e.getAttribute('data-tender') + ' ' + e.textContent.split(' ').pop(); }), taxes: [].map.call(document.querySelectorAll('#z-taxes [data-tax]'), function (e) { return e.textContent; }) }; });
  var inv = H.q0('SELECT SUM(grandtotal) AS g, SUM(totallines) AS n FROM c_invoice WHERE c_order_id IN (SELECT c_order_id FROM c_order WHERE documentno IN (?,?))', [key1, key2])[0];
  var cashSum = H.q0("SELECT SUM(payamt) AS s FROM c_payment WHERE documentno IN (?,?) AND tendertype='X'", [key1, key2])[0].s, cardSum = H.q0("SELECT SUM(payamt) AS s FROM c_payment WHERE documentno IN (?,?) AND tendertype='C'", [key1, key2])[0].s;
  var taxOracle = H.q0('SELECT SUM(taxamt) AS t, SUM(taxbaseamt) AS b FROM c_invoicetax WHERE c_invoice_id IN (SELECT c_invoice_id FROM c_invoice WHERE c_order_id IN (SELECT c_order_id FROM c_order WHERE documentno IN (?,?)))', [key1, key2])[0];
  console.log('§TILL_Z_DOM ' + J(zdom) + ' oracle gross=' + inv.g + ' net=' + inv.n + ' cash=' + cashSum + ' card=' + cardSum + ' tax=' + J(taxOracle));
  check('deposit', 'z-totals', zdom.tickets === '2' && zdom.units === '7' && zdom.payments === '3' && zdom.gross === money2(Number(inv.g)) && zdom.net === money2(Number(inv.n)), 'Close Cash: tickets 2, units 7, payments 3, Sales == head-office invoices (' + money2(Number(inv.g)) + '), Net == invoice lines (' + money2(Number(inv.n)) + ')', zdom);
  check('deposit', 'z-by-tender', zdom.bytender.indexOf('cash ' + money2(Number(cashSum))) >= 0 && zdom.bytender.indexOf('magcard ' + money2(Number(cardSum))) >= 0, 'Close Cash: per-tender sums == head-office receipts (cash ' + money2(Number(cashSum)) + ', card ' + money2(Number(cardSum)) + ')', zdom.bytender);
  check('deposit', 'z-taxes', zdom.taxes.length === 1 && zdom.taxes[0] === 'base ' + money2(Number(taxOracle.b)) + ' tax ' + money2(Number(taxOracle.t)), 'Close Cash: tax base+amount == head-office C_InvoiceTax (' + money2(Number(taxOracle.b)) + ' / ' + money2(Number(taxOracle.t)) + ')', zdom.taxes);
  await pg.click('#zclose'); await pg.click('#zconfirm'); await sleep(800);
  var after1 = await pg.evaluate(function () { return { done: document.getElementById('zdone').textContent, seq: document.getElementById('z-seq').textContent, tickets: document.getElementById('z-tickets').textContent, past: [].map.call(document.querySelectorAll('#zpast option'), function (o) { return o.value; }) }; });
  check('deposit', 'close-next-shift', after1.done === 'Cash Closed OK' && after1.seq === '2' && after1.tickets === '0' && J(after1.past) === '["1"]', 'Close Cash: "Cash Closed OK", the next shift is 2 with 0 tickets, shift 1 is listed for reprint', after1);
  await pg.selectOption('#zpast', '1'); await pg.click('#zreprint'); await sleep(800);
  var rep = await pg.$eval('#zdone', function (e) { return e.textContent; });
  check('deposit', 'z-reprint', rep.indexOf('tickets 2') > 0 && rep.indexOf('sales ' + money2(Number(inv.g))) > 0, 'a past Z reprinted from its own shift\'s deposited rows: ' + rep, rep);
  await pg.close();
  return { key1: key1, key2: key2 };
}

// ═══ OFFLINE
async function runOffline(ctx, base) {
  var pg = await openTill(ctx, base);
  await loginSales(pg);
  var keys0 = await pg.evaluate(function () { return window.Till.depositedDocNos(); });
  await ctx.setOffline(true);
  var onl = await pg.evaluate(function () { return navigator.onLine; });
  check('offline', 'network-off', onl === false, 'the browser context is offline (navigator.onLine false)', onl);
  var rung = [];
  for (var i = 0; i < 2; i++) { await clickProduct(pg, 128); await pay(pg, [{ tab: 'cash', amount: 100 }]); rung.push(await pg.$eval('#receipt .rf[data-f="Receipt"]', function (e) { return e.textContent.split('  ')[1]; })); await pg.click('#rc-ok'); }
  var keys1 = await pg.evaluate(function () { return window.Till.depositedDocNos(); });
  var newKeys = keys1.filter(function (k) { return keys0.indexOf(k) < 0; });
  check('offline', 'rung-offline', newKeys.length === 2 && J(newKeys.sort()) === J(rung.slice().sort()), '2 tickets rung offline are on the device under their keys', { rung: rung, newKeys: newKeys });
  await ctx.setOffline(false);
  await pg.close(); pg = await openTill(ctx, base);                                                   // reload: the device must still hold them
  var keys2 = await pg.evaluate(function () { return window.Till.depositedDocNos(); });
  var n1 = rung.map(function (k) { return Number(k.replace(/^.*-S/, '')); });
  check('offline', 'survive-reload', rung.every(function (k) { return keys2.indexOf(k) >= 0; }) && new Set(keys2).size === keys2.length, 'after a reload every offline ticket is still on the device, each key once (none lost, none doubled)', { rung: rung, keys2: keys2 });
  await loginSales(pg); await clickProduct(pg, 128); await pay(pg, [{ tab: 'cash', amount: 100 }]);
  var k3 = await pg.$eval('#receipt .rf[data-f="Receipt"]', function (e) { return e.textContent.split('  ')[1]; }), n3 = Number(k3.replace(/^.*-S/, ''));
  check('offline', 'no-number-reuse', n3 === Math.max.apply(null, n1) + 1, 'the next ticket continues the numbering (' + k3 + ' follows ' + rung[rung.length - 1] + ')', { k3: k3, n1: n1 });
  var z = await pg.evaluate(function () { return window.Till.zFromRows(); });
  console.log('§TILL_OFFLINE keys=' + J(rung) + ' next=' + k3 + ' z_tickets=' + z.tickets);
  await pg.close();
}


// ═══ slice 2 (prompts §17): helpers shared by the arms
var TAX2 = 7.25;
async function withTax(ctx, base, qs) {   // the seed's Standard tax is 0%: the same edit on the device (an op) so rounding is exercised; the head-office replica gets it in nodeHead
  var pg = await openTill(ctx, base, qs);
  var ok = await pg.evaluate(function (rate) { return new Promise(function (res) { var E = window.Till.engine(); var once = function (e) { if (e.detail && String(e.detail.table).toLowerCase() === 'c_tax') { E.removeEventListener('overlay:committed', once); res(true); } }; E.addEventListener('overlay:committed', once); E.__crud.applyOp({ op_type: 'CRUD_UPDATE', key: 'c_tax', table: 'c_tax', verb: 'update', id: 104, changes: { rate: rate } }); setTimeout(function () { res(false); }, 10000); }); }, TAX2);
  await pg.close(); pg = await openTill(ctx, base, qs);
  var tr = (await rowsOf(pg, 'SELECT rate FROM c_tax WHERE c_tax_id=104'))[0];
  console.log('§TILL_TAXLIVE arm=' + (qs || 'withTax') + ' rate=' + (tr && tr.rate) + ' expect=' + TAX2);
  return ok && num(tr.rate) === TAX2 ? pg : null;
}
async function ring(pg, items) { for (var it of items) { if (it[1] > 1) await typeNum(pg, it[1]); await clickProduct(pg, it[0]); } }
async function totalOf(pg) { return pg.$eval('#t-tot', function (e) { return e.textContent; }); }
async function payExact(pg) { var t = await totalOf(pg); await pay(pg, [{ tab: 'cash', amount: t }]); return t; }
async function receiptKey(pg) { return pg.$eval('#receipt .rf[data-f="Receipt"], #receipt .rf[data-f="Refund"]', function (e) { return e.textContent.split('  ')[1]; }); }
async function domLines(pg) { return pg.$$eval('#tl tr.line', function (trs) { return trs.map(function (t) { var c = t.querySelectorAll('td'); return { name: c[0].textContent, price: c[1].textContent, qty: c[2].textContent, value: c[3].textContent }; }); }); }
async function importDevice(pg) {   // the device's deposited rows replayed in the node kernel, then the SHIPPED Import POS Sales
  var orders = await rowsOf(pg, 'SELECT * FROM i_order ORDER BY ABS(i_order_id)'), pays = await rowsOf(pg, 'SELECT * FROM i_payment ORDER BY ABS(i_payment_id)');
  return importRows(orders, pays);
}
async function importRows(orders, pays, only) {
  var H = await nodeHead(TAX2);
  var d = H.commit(function (trx, ML) { var all = orders.map(function (r) { return { t: 'i_order', f: clean(r) }; }).concat(pays.map(function (r) { return { t: 'i_payment', f: clean(r) }; }));
    for (var i = 0; i < all.length; i++) { var sv = ML.save(trx, all[i].t, null, ML.newPO(trx, all[i].t, all[i].f)); if (!sv.ok) return { ok: false, error: all[i].t + ' #' + i + ': ' + sv.error }; } return { ok: true }; });
  var run = H.commit(function (trx) { var r0 = H.AP.runInTrx(trx, 9538001, { params: { C_BankAccount_ID: 100, AD_Client_ID: 11 } }); return { ok: r0.ok, error: r0.summary }; }, { ws: 'import_pos_sales' });
  var logs = (run.log || []).filter(function (l) { return /^§POSS/.test(l); }); logs.forEach(function (l) { console.log('   [head office] ' + l.slice(0, 300)); });
  return { H: H, replay: d, run: run, logs: logs, orders: orders, pays: pays };
}
function orderOf(H, key) { var o = H.q0('SELECT * FROM c_order WHERE documentno=?', [key])[0] || null; return { order: o, invoice: o ? H.q0('SELECT * FROM c_invoice WHERE c_order_id=?', [o.c_order_id])[0] || null : null, receipts: H.q0('SELECT * FROM c_payment WHERE documentno=?', [key]) }; }
var imported = function (R, key) { return R.logs.some(function (l) { return l.indexOf('key=' + key + ' ') >= 0 && l.indexOf('result=IMPORTED') >= 0; }); };

// ═══ BAR (U6) : the ticket button bar. ISSUES: the bar must be Ticket.Buttons.xml's enabled five and none of the commented ones; a discount must reach head office to the cent (Import Orders needs a product per line, so a Line Discount line travels FOLDED)
async function runBar(ctx, base) {
  var pg = await withTax(ctx, base); check('bar', 'tax-live', !!pg, 'Standard tax edited to ' + TAX2 + '% on the device (non-vacuous: seed 0%)', null); if (!pg) return;
  await loginSales(pg);
  var bt = await pg.$$eval('#scriptbar [data-btn]', function (b) { return b.map(function (x) { return [x.getAttribute('data-btn'), x.disabled]; }); });
  check('bar', 'bar-buttons', J(bt.map(function (x) { return x[0]; })) === J(['Total discount', 'Line discount', 'Print preview', 'Open drawer', 'Virtual Keyboard']) && bt.every(function (x) { return !x[1]; }), 'Ticket.Buttons.xml:39-54 enabled: Total discount, Line discount, Print preview, Open drawer, Virtual Keyboard', bt);
  var ab = []; for (var n of ['Refund item', 'Service charge', 'Line note', 'Set person', 'Send order']) if (await pg.$('#scriptbar [data-btn="' + n + '"]')) ab.push(n);
  check('bar', 'commented-absent', ab.length === 0, 'Ticket.Buttons.xml:30-46 commented buttons are absent', ab);
  // ticket A: 3 x product 128, line discount 10%
  await ring(pg, [[128, 3]]); await typeNum(pg, 10); await pg.click('#scriptbar [data-btn="Line discount"]'); var refused = (await domLines(pg)).length;
  check('bar', 'under-limit-refused', refused === 1, 'a 10% line discount takes product 128 (23.75, price limit 22.50) under its PriceLimit: refused on the till, because legacy Import Orders refuses it (UnderLimitPrice, seen in the first run)', refused);
  await typeNum(pg, 4); await pg.click('#scriptbar [data-btn="Line discount"]');
  var la = await domLines(pg), p0 = Number(la[0] && la[0].price);
  check('bar', 'line-discount-line', la.length === 2 && la[1].name === 'Line Discount 4%' && Number(la[1].value) < 0 && la[1].qty === la[0].qty, 'script.Linediscount.txt: a "Line Discount 4%" line follows the selected line with the same quantity and a negative value', la);
  var dv = Math.round(Math.abs(p0 * 0.04 * 100)) / 100 * 3;
  check('bar', 'line-discount-value', Math.abs(Math.abs(Number(la[1].value)) - dv) < 0.0101, 'the discount line value is price x 4% x qty (' + money2(dv) + ') to the cent', { dom: la[1].value, want: dv });
  var totA = await totalOf(pg); var keyA = null; await pay(pg, [{ tab: 'cash', amount: totA }]); keyA = await receiptKey(pg); await pg.click('#rc-ok');
  // ticket B: 128 + 2 x 129, select first line, 15, Total discount
  await ring(pg, [[128, 1], [129, 2]]); await pg.click('#tl tr.line:first-child'); await typeNum(pg, 3); var before = await domLines(pg);
  await pg.click('#scriptbar [data-btn="Total discount"]'); var lb = await domLines(pg);
  check('bar', 'total-discount-names', lb.length === 2 && lb.every(function (l) { return l.name.indexOf(' - Item Discount @  3%') > 0; }), 'script.Totaldiscount.txt: every line renamed "<name> - Item Discount @  3%"', lb);
  check('bar', 'total-discount-prices', lb.every(function (l, i) { var p = Number(before[i].price), want = p - Math.abs(p * 0.03 * 100) / 100; return Math.abs(Number(l.price) - want) < 0.0051; }), 'every line price lowered by abs(price x 3% x 100)/100', { before: before, after: lb });
  var totB = await totalOf(pg); await pay(pg, [{ tab: 'cash', amount: totB }]); var keyB = await receiptKey(pg); await pg.click('#rc-ok');
  // print preview does not save, does not clear
  await ring(pg, [[129, 1]]); await pg.click('#scriptbar [data-btn="Print preview"]'); await pg.waitForSelector('#u9.on');
  var pv = await pg.$eval('#receipt .rf[data-f="Receipt"]', function (e) { return e.textContent; }); await pg.click('#rc-ok'); var nAfter = (await domLines(pg)).length;
  check('bar', 'print-preview', /\(preview\)/.test(pv) && nAfter === 1, 'Print preview shows the open ticket as a receipt without a number and leaves it open', { pv: pv, n: nAfter });
  // drawer twice -> no-sale count in the Z
  await pg.click('#scriptbar [data-btn="Open drawer"]'); await pg.click('#scriptbar [data-btn="Open drawer"]');
  await pg.evaluate(function () { window.Till.go('close'); }); await sleep(600); var ns = await pg.$eval('#z-nosales', function (e) { return e.textContent; });
  check('bar', 'drawer-nosales', ns === '2', 'two Open drawer presses = "No Sale - Drawer Openings" 2 on the Z (PaymentsModel NOSALES)', ns);
  // virtual keyboard types into the focused input
  await pg.evaluate(function () { window.Till.go('editsales'); }); await pg.click('#scriptbar [data-btn="Virtual Keyboard"]').catch(function () {});
  await pg.evaluate(function () { document.querySelector('#scriptbar'); var k = document.getElementById('vkbd'); k.hidden = false; });
  var vk = await pg.evaluate(function () { return new Promise(function (res) { var t = window.Till; t.go('editsales'); var i = document.getElementById('es-number'); i.focus(); var b = document.querySelector('#vkbd .vk[data-vk="4"]'); if (!b) { res({ noKbd: true }); return; } b.click(); res({ v: i.value, shown: !document.getElementById('vkbd').hidden }); }); });
  check('bar', 'virtual-keyboard', vk.v === '4' && vk.shown, 'Virtual Keyboard: a key press lands in the focused input', vk);
  // head office: both discounted tickets import to the screen total, to the cent
  var rowsA = (await rowsOf(pg, 'SELECT * FROM i_order WHERE documentno=' + J(keyA).replace(/"/g, "'"))), rowsB = (await rowsOf(pg, 'SELECT * FROM i_order WHERE documentno=' + J(keyB).replace(/"/g, "'")));
  check('bar', 'discount-folded', rowsA.length === 1 && Math.abs(num(rowsA[0].priceactual) - p0 * 0.96) < 0.0051, 'the Line Discount line travels folded: ONE I_Order row, PriceActual = price - 4% (' + (p0 * 0.96) + ')', rowsA.map(function (r) { return r.priceactual; }));
  var R = await importDevice(pg);
  check('bar', 'plugin-up', R.H.started === 'ACTIVE' && R.replay.ok, 'head office up and the deposited rows accepted as they stand', R.replay.error);
  [[keyA, totA, 'A'], [keyB, totB, 'B']].forEach(function (t) {
    var o = orderOf(R.H, t[0]); check('bar', t[2] + '-imported', imported(R, t[0]) && o.order && o.order.docstatus === 'CO', 'ticket ' + t[2] + ' (discounted) imported as ONE completed order', o.order && o.order.docstatus);
    check('bar', t[2] + '-to-the-cent', o.invoice && Math.round(Number(o.invoice.grandtotal) * 100) === Math.round(Number(t[1]) * 100), 'ticket ' + t[2] + ': screen total ' + t[1] + ' == imported GrandTotal ' + (o.invoice && o.invoice.grandtotal) + ' to the cent', { screen: t[1], grand: o.invoice && o.invoice.grandtotal });
  });
  await pg.close();
}

// ═══ HELD (U7): shared tickets. ISSUES: a held ticket must survive a reload, a recalled ticket must leave the held list and deposit exactly once; Quick LogOff keeps the open ticket; Delete confirms
async function runHeld(ctx, base) {
  var pg = await openTill(ctx, base); await loginSales(pg);
  var bt = await pg.$$eval('#bag [data-btn]', function (b) { return b.map(function (x) { return [x.getAttribute('data-btn'), x.disabled]; }); });
  check('held', 'bag-buttons', J(bt.map(function (x) { return x[0]; })) === J(['Add New Ticket', 'Tickets awaiting completion', 'Delete', 'Reprint Ticket', 'Quick LogOff']) && bt.every(function (x) { return !x[1]; }), '5.0 JTicketsBagShared.java:255-331 five bag buttons, all enabled', bt);
  var keys0 = await pg.evaluate(function () { return window.Till.depositedDocNos(); });
  await ring(pg, [[128, 2], [129, 1]]); var hl1 = (await domLines(pg)).length; var tot1 = await totalOf(pg);
  await pg.click('#bag [data-btn="Add New Ticket"]');
  var cleared = (await domLines(pg)).length, hc = await pg.$eval('#heldcount', function (e) { return e.textContent; });
  check('held', 'add-new-holds', cleared === 0 && hc === '1', 'Add New Ticket keeps the open ticket (2 lines) as held and starts an empty one (held count ' + hc + ')', { cleared: cleared, hc: hc });
  await pg.click('#bag [data-btn="Add New Ticket"]'); var hc2 = await pg.$eval('#heldcount', function (e) { return e.textContent; });
  check('held', 'empty-not-held', hc2 === '1', 'Add New Ticket on an EMPTY ticket holds nothing (saveCurrentTicket drops a ticket with no lines)', hc2);
  await pg.close(); pg = await openTill(ctx, base); await loginSales(pg);
  var hc3 = await pg.$eval('#heldcount', function (e) { return e.textContent; });
  check('held', 'survives-reload', hc3 === '1', 'the held ticket survives a page reload (device store)', hc3);
  await ring(pg, [[127, 1]]); await pg.click('#bag [data-btn="Tickets awaiting completion"]'); await pg.waitForSelector('#u7.on');
  var items = await pg.$$eval('#hl-list [data-held]', function (b) { return b.length; }); await pg.click('#hl-list [data-held]'); await pg.waitForSelector('#u3.on');
  var rec = await domLines(pg), hc4 = await pg.$eval('#heldcount', function (e) { return e.textContent; });
  check('held', 'recall-lists-one', items === 1, 'Tickets awaiting completion lists the 1 held ticket', items);
  check('held', 'recalled-lines', rec.length === hl1 && rec[0].qty === 'x2', 'the recalled ticket shows its own 2 lines (x2 first)', rec);
  check('held', 'recall-removes-held-row', hc4 === '1', 'recall DELETES the held row (JTicketsBagShared.setActiveTicket) while the ticket that was open (1 line) is saved: held count stays 1', hc4);
  var totRec = await totalOf(pg); check('held', 'recalled-total', totRec === tot1, 'the recalled ticket total equals the total it had when held (' + tot1 + ')', { tot1: tot1, totRec: totRec });
  await pay(pg, [{ tab: 'cash', amount: totRec }]); var kRec = await receiptKey(pg); await pg.click('#rc-ok');
  var rowsRec = await rowsOf(pg, "SELECT * FROM i_order WHERE documentno='" + kRec + "'");
  check('held', 'deposits-once', rowsRec.length === hl1, 'the recalled ticket deposited exactly once: ' + hl1 + ' I_Order rows under ' + kRec, rowsRec.length);
  // the other held ticket (1 line) recalled via Quick LogOff path
  await pg.click('#bag [data-btn="Tickets awaiting completion"]'); await pg.click('#hl-list [data-held]'); await pg.waitForSelector('#u3.on');
  var hc5 = await pg.$eval('#heldcount', function (e) { return e.textContent; });
  check('held', 'held-list-empties', hc5 === '', 'after both held tickets were recalled the held count is empty', hc5);
  await pg.click('#bag [data-btn="Quick LogOff"]'); await pg.waitForSelector('#u1.on');
  var hc6 = await pg.evaluate(function () { return window.Till.state().store.held.length; });
  check('held', 'quick-logoff', hc6 === 1 && (await pg.$eval('#s-who', function (e) { return e.textContent; })) === '', 'Quick LogOff returns to Login (cashier cleared) and keeps the open ticket as held', hc6);
  await loginSales(pg); await pg.click('#bag [data-btn="Tickets awaiting completion"]'); await pg.click('#hl-list [data-held]'); await pg.waitForSelector('#u3.on'); var tot3 = await totalOf(pg); await pay(pg, [{ tab: 'cash', amount: tot3 }]); var kLast = await receiptKey(pg); await pg.click('#rc-ok');
  // Delete: confirm
  await ring(pg, [[129, 1]]); var rem0 = await pg.evaluate(function () { return window.Till.state().store.shift.removed || 0; });
  await pg.click('#bag [data-btn="Delete"]'); var cb = await pg.$eval('#confirmbox', function (e) { return { hidden: e.hidden, text: e.textContent }; }); await pg.click('#confirm-no');
  var stay = (await domLines(pg)).length; await pg.click('#bag [data-btn="Delete"]'); await pg.click('#confirm-yes'); var gone = (await domLines(pg)).length, rem1 = await pg.evaluate(function () { return window.Till.state().store.shift.removed || 0; });
  check('held', 'delete-confirm', cb.hidden === false && /Are you sure you want to Delete the current Order\?/.test(cb.text) && stay === 1 && gone === 0 && rem1 === rem0 + 1, 'Delete asks "Are you sure you want to Delete the current Order?"; No keeps the ticket; Yes clears it and logs one removed-line audit', { cb: cb, stay: stay, gone: gone, rem0: rem0, rem1: rem1 });
  // each key once
  var keys1 = (await pg.evaluate(function () { return window.Till.depositedDocNos(); })).filter(function (k) { return keys0.indexOf(k) < 0; });
  check('held', 'keys-once', keys1.length === 2 && new Set(keys1).size === 2, 'two tickets were paid in this arm: exactly 2 new keys, none doubled', keys1);
  // Reprint Ticket list + Reprint Last Ticket
  await pg.click('#bag [data-btn="Reprint Ticket"]'); await pg.waitForSelector('#u5r.on'); var rl = await pg.$$eval('#rl-list [data-reprint]', function (b) { return b.map(function (x) { return x.getAttribute('data-reprint'); }); });
  check('held', 'reprint-list', rl.indexOf(kRec) >= 0 && rl.indexOf(kLast) >= 0 && rl[0] === kLast, 'Reprint Ticket lists the saved tickets, newest first', rl.slice(0, 4));
  await pg.click('#rl-list [data-reprint="' + kRec + '"]'); await pg.waitForSelector('#u9.on'); var rp = await pg.$$eval('#receipt .rf', function (e) { return e.map(function (x) { return x.textContent; }); });
  check('held', 'reprint-same', rp.some(function (t) { return t.indexOf(kRec) > 0; }) && rp.some(function (t) { return t.indexOf('Total  ' + totRec) === 0; }), 'the reprinted receipt shows its own key and Total ' + totRec, rp.slice(0, 3)); await pg.click('#rc-ok');
  await pg.click('#north [data-btn="Reprint Last Ticket"]'); await pg.waitForSelector('#u9.on'); var rk = await receiptKey(pg);
  check('held', 'reprint-last', rk === kLast, 'Reprint Last Ticket prints lastticket (' + kLast + ')', rk); await pg.click('#rc-ok');
  await pg.close();
}

// ═══ EDIT (U10) : ISSUES: Edit must REPLACE the ticket's rows under the same key (old rows gone, not doubled), only in the open shift and only before a Visit sent the key; head office imports the edited ticket to the cent
async function runEdit(ctx, base) {
  var pg = await withTax(ctx, base); check('edit', 'tax-live', !!pg, 'tax edited on the device', null); if (!pg) return; await loginSales(pg);
  await ring(pg, [[128, 2], [129, 1]]); var tot0 = await payExact(pg); var key = await receiptKey(pg); await pg.click('#rc-ok');
  var n0 = (await rowsOf(pg, "SELECT * FROM i_order WHERE documentno='" + key + "'")).length;
  var num0 = key.replace(/^.*-S/, '');
  await pg.evaluate(function () { window.Till.go('editsales'); }); await pg.fill('#es-number', num0); await pg.click('#es-find'); await sleep(900);
  var txt = await pg.$eval('#es-ticket', function (e) { return e.textContent; }), dis = await pg.$$eval('#es-edit, #es-refund, #es-print', function (b) { return b.map(function (x) { return x.id + ':' + x.disabled; }); });
  check('edit', 'find-by-number', txt.indexOf(key) === 0 && txt.indexOf('Total  ' + tot0) > 0, 'Edit Sales finds ticket ' + num0 + ' by number and shows its lines and Total ' + tot0, txt.slice(0, 120));
  check('edit', 'buttons-enabled', J(dis) === J(['es-edit:false', 'es-refund:false', 'es-print:false']), 'a sale ticket in the open shift: Edit, Refund and Print are enabled', dis);
  await pg.fill('#es-number', '99999'); await pg.click('#es-find'); await sleep(500); var none = await pg.$eval('#es-ticket', function (e) { return e.textContent; });
  check('edit', 'unknown-number', none === '', 'an unknown number shows no ticket (message.notexiststicket)', none);
  await pg.fill('#es-number', num0); await pg.click('#es-find'); await sleep(700);
  await pg.click('#es-edit'); await pg.waitForSelector('#u3.on'); var el = await domLines(pg);
  check('edit', 'edit-loads-lines', el.length === 2 && el[0].qty === 'x2', 'Edit loads the ticket\'s 2 lines into the Sales screen', el);
  await clickProduct(pg, 127); var tot1 = await totalOf(pg); await pay(pg, [{ tab: 'cash', amount: tot1 }]); var key1 = await receiptKey(pg); await pg.click('#rc-ok');
  var o1 = await rowsOf(pg, "SELECT * FROM i_order WHERE documentno='" + key + "' ORDER BY ABS(i_order_id)"), p1 = await rowsOf(pg, "SELECT * FROM i_payment WHERE documentno='" + key + "'");
  check('edit', 'same-key', key1 === key, 'the edited ticket keeps its number (TicketInfo.copyTicket :183): ' + key, key1);
  check('edit', 'old-rows-gone', o1.length === 3 && p1.length === 1 && o1.every(function (r) { return num(r.qtyordered) > 0; }), 'the old rows are replaced, not doubled: 3 I_Order lines (was ' + n0 + ') and ONE I_Payment under ' + key, { o: o1.length, p: p1.length });
  check('edit', 'payment-new-total', Math.abs(num(p1[0].payamt) - Number(tot1)) < 0.0051, 'the I_Payment carries the NEW total ' + tot1, p1[0].payamt);
  check('edit', 'edited-keys-once', (await pg.evaluate(function () { return window.Till.depositedDocNos(); })).filter(function (k) { return k === key; }).length === 1, 'the key exists once among the till\'s deposited keys', null);
  // a key that went out in a Visit is not rewritten
  await pg.evaluate(function (k) { var s = window.Till.state(); s.store.sent = s.store.sent || {}; s.store.sent[k] = 1; }, key);
  await pg.evaluate(function () { window.Till.go('editsales'); }); await pg.fill('#es-number', num0); await pg.click('#es-find'); await sleep(700);
  var d2 = await pg.$$eval('#es-edit, #es-refund', function (b) { return b.map(function (x) { return x.id + ':' + x.disabled; }); }), st2 = await pg.$eval('#es-status', function (e) { return e.textContent; });
  check('edit', 'sent-refuses-edit', J(d2) === J(['es-edit:true', 'es-refund:false']) && /sent to head office/.test(st2), 'once the key is marked sent (a Visit took it) Edit is refused, Refund stays: "' + st2 + '"', { d2: d2, st2: st2 });
  // closed shift
  await ring(pg, [[129, 1]]); var t3 = await payExact(pg); var key3 = await receiptKey(pg); await pg.click('#rc-ok');
  await pg.evaluate(function () { window.Till.go('close'); }); await sleep(500); await pg.click('#zclose'); await pg.click('#zconfirm'); await sleep(800);
  await pg.evaluate(function () { window.Till.go('editsales'); }); await pg.fill('#es-number', key3.replace(/^.*-S/, '')); await pg.click('#es-find'); await sleep(700);
  var d3 = await pg.$eval('#es-edit', function (b) { return b.disabled; }), st3 = await pg.$eval('#es-status', function (e) { return e.textContent; });
  check('edit', 'closed-shift-refuses-edit', d3 === true && /Closed cash/.test(st3), 'after Close Cash the ticket of the closed shift cannot be edited (isCashActive): "' + st3 + '"', st3);
  var R = await importDevice(pg), o = orderOf(R.H, key);
  check('edit', 'edited-imports-to-the-cent', imported(R, key) && o.invoice && Math.round(Number(o.invoice.grandtotal) * 100) === Math.round(Number(tot1) * 100), 'the edited ticket imports as ONE order whose GrandTotal ' + (o.invoice && o.invoice.grandtotal) + ' == new screen total ' + tot1, { imported: imported(R, key), grand: o.invoice && o.invoice.grandtotal });
  await pg.close();
}

// ═══ REFUND (U11) : ISSUES: a refund deposits NEGATIVE quantities and NEGATIVE tenders under its own counter and head office imports it as the -1 line return of witness_pos_return.js; the pad follows 5.0 on a refund ticket; a ticket cannot be refunded twice
async function runRefund(ctx, base) {
  var pg = await withTax(ctx, base); check('refund', 'tax-live', !!pg, 'tax edited on the device', null); if (!pg) return; await loginSales(pg);
  await ring(pg, [[128, 2], [129, 1]]); var totS = await payExact(pg); var keyS = await receiptKey(pg); await pg.click('#rc-ok');
  await pg.evaluate(function () { window.Till.go('editsales'); }); await pg.fill('#es-number', keyS.replace(/^.*-S/, '')); await pg.click('#es-find'); await sleep(700); await pg.click('#es-refund'); await pg.waitForSelector('#u11.on');
  var rl = await pg.$$eval('#rf-lines [data-rf]', function (d) { return d.length; }); check('refund', 'lists-original-lines', rl === 2, 'the refund screen lists the 2 lines of the original ticket', rl);
  await pg.click('#rf-lines [data-rf-add="0"]'); await pg.click('#rf-go'); await pg.waitForSelector('#u3.on');
  var rt = await domLines(pg), tid = await pg.$eval('#tid', function (e) { return e.textContent; });
  check('refund', 'refund-ticket-negated', rt.length === 1 && rt[0].qty === 'x-2' && /Refund of /.test(tid), 'the refund ticket takes line 1 negated (x-2) and says "Refund of <key>"', { rt: rt, tid: tid });
  await pg.click('#tl tr.line'); await pg.click('#east .key[data-key="*"]'); await typeNum(pg, 1); await pg.click('#east .key[data-key="+"]'); var rt2 = await domLines(pg);
  check('refund', 'pad-refund-n-plus', rt2[0].qty === 'x-1', '5.0 JPanelTicket.java:1642: "1 +" on a refund line sets the quantity to -1', rt2);
  await pg.click('#east .key[data-key="-"]'); var rt3 = await domLines(pg);
  check('refund', 'pad-refund-minus', rt3[0].qty === 'x-2', '5.0 JPanelTicket.java:1589: "-" on a refund line adds -1 (x-2); 3.81 went toward 0', rt3);
  await pg.click('#east .key[data-key="*"]'); await typeNum(pg, 1); await pg.click('#east .key[data-key="-"]'); var rt4 = await domLines(pg);
  check('refund', 'pad-refund-n-minus', rt4[0].qty === 'x-1', '5.0 JPanelTicket.java:1686: "1 -" on a refund line sets -1', rt4);
  var totR = await totalOf(pg); check('refund', 'refund-total-negative', Number(totR) < 0, 'the ticket total is negative (' + totR + ')', totR);
  await pg.click('#east .key[data-key="="]'); await pg.waitForSelector('#u8.on');
  var tabs = await pg.$$eval('#tabs [data-tab]', function (b) { return b.map(function (x) { return [x.textContent, x.disabled]; }); });
  check('refund', 'refund-tabs', J(tabs.map(function (x) { return x[0]; })) === J(['Refund', 'Cheque', 'Voucher', 'Card']) && tabs[2][1] === true && tabs[0][1] === false, '5.0 JPaymentSelectRefund.java:67-70: tabs Refund, Cheque, Voucher (disabled: no 214 value), Card', tabs);
  var due = await pg.$eval('#paytotal', function (e) { return e.textContent; });
  await pg.fill('#tender-amount', due.replace('-', '')); await pg.click('#pay-ok'); await pg.waitForSelector('#u9.on', { timeout: 20000 });
  var keyR = await receiptKey(pg), rtot = await pg.$eval('#receipt .rf[data-f="Total"]', function (e) { return e.textContent; }); await pg.click('#rc-ok');
  check('refund', 'refund-key', /-R1$/.test(keyR) && /-S\d+$/.test(keyS), 'the refund has its own counter: ' + keyR + ' beside sale ' + keyS, { keyR: keyR, keyS: keyS });
  var orR = await rowsOf(pg, "SELECT * FROM i_order WHERE documentno='" + keyR + "'"), pyR = await rowsOf(pg, "SELECT * FROM i_payment WHERE documentno='" + keyR + "'");
  check('refund', 'rows-negative', orR.length === 1 && num(orR[0].qtyordered) === -1 && num(orR[0].priceactual) > 0 && pyR.length === 1 && num(pyR[0].payamt) < 0 && pyR[0].tendertype === 'X' && /^Refund of /.test(orR[0].linedescription), 'I_Order QtyOrdered -1 with positive PriceActual and "Refund of <key>"; I_Payment PayAmt negative, TenderType X', { o: orR[0] && [orR[0].qtyordered, orR[0].priceactual, orR[0].linedescription], p: pyR[0] && [pyR[0].payamt, pyR[0].tendertype] });
  check('refund', 'receipt-total-negative', rtot.indexOf('Total  -') === 0, 'the refund receipt prints a negative total: ' + rtot, rtot);
  // second refund of the same ticket
  await pg.evaluate(function () { window.Till.go('editsales'); }); await pg.fill('#es-number', keyS.replace(/^.*-S/, '')); await pg.click('#es-find'); await sleep(700);
  var d2 = await pg.$$eval('#es-edit, #es-refund', function (b) { return b.map(function (x) { return x.id + ':' + x.disabled; }); }), s2 = await pg.$eval('#es-status', function (e) { return e.textContent; });
  check('refund', 'no-second-refund', J(d2) === J(['es-edit:true', 'es-refund:true']) && /refunded/.test(s2), 'a refunded ticket allows neither Edit nor a second Refund: "' + s2 + '"', { d2: d2, s2: s2 });
  // the refund ticket itself is findable under the Refund radio
  await pg.click('#u10 input[name="es-kind"][value="R"]'); await pg.fill('#es-number', '1'); await pg.click('#es-find'); await sleep(700); var rtxt = await pg.$eval('#es-ticket', function (e) { return e.textContent; });
  check('refund', 'find-refund-ticket', rtxt.indexOf(keyR) === 0, 'Edit Sales with the Refund radio finds the refund ticket', rtxt.slice(0, 80));
  // head office
  var R = await importDevice(pg), os = orderOf(R.H, keyS), or = orderOf(R.H, keyR);
  check('refund', 'sale-imported', imported(R, keyS) && os.invoice && os.invoice.docstatus === 'CO', 'the sale imports as a completed order + invoice', os.invoice && os.invoice.docstatus);
  check('refund', 'refund-imported', imported(R, keyR) && or.order && or.order.docstatus === 'CO', 'the refund ticket IMPORTS through Import POS Sales (POS log: ' + (R.logs.filter(function (l) { return l.indexOf(keyR) >= 0; })[0] || 'none').slice(0, 160) + ')', or.order && or.order.docstatus);
  var rl2 = or.order ? R.H.q0('SELECT * FROM c_orderline WHERE c_order_id=?', [or.order.c_order_id]) : [];
  check('refund', 'refund-order-minus-one', rl2.length === 1 && num(rl2[0].qtyordered) === -1 && or.invoice && Number(or.invoice.grandtotal) < 0, 'witness_pos_return.js RET2: the refund is an order with a -1 line and a NEGATIVE invoice GrandTotal (' + (or.invoice && or.invoice.grandtotal) + ')', { lines: rl2.map(function (l) { return l.qtyordered; }), grand: or.invoice && or.invoice.grandtotal });
  check('refund', 'refund-to-the-cent', or.invoice && Math.round(Number(or.invoice.grandtotal) * 100) === Math.round(Number(totR) * 100), 'screen refund total ' + totR + ' == imported GrandTotal ' + (or.invoice && or.invoice.grandtotal) + ' to the cent', { screen: totR, grand: or.invoice && or.invoice.grandtotal });
  check('refund', 'refund-receipt-open-0', or.receipts.length === 1 && or.receipts[0].docstatus === 'CO' && Number(or.receipts[0].payamt) < 0 && or.invoice && or.invoice.ispaid === 'Y', 'the negative tender completes as ONE receipt and the invoice is settled (IsPaid)', { receipts: or.receipts.map(function (p) { return [p.docstatus, p.payamt]; }), paid: or.invoice && or.invoice.ispaid });
  var cp = R.H.q0('SELECT count(*) AS n FROM c_order WHERE documentno IN (?,?)', [keyS, keyR])[0].n; check('refund', 'two-orders', cp === 2, 'two tickets = exactly two orders at head office', cp);
  // the Z folds the refund in
  await pg.evaluate(function () { window.Till.go('close'); }); await sleep(900);
  var z = await pg.evaluate(function () { function t(id) { return document.getElementById(id).textContent; } return { tickets: t('z-tickets'), units: t('z-units'), gross: t('z-gross'), bytender: [].map.call(document.querySelectorAll('#z-bytender [data-tender]'), function (e) { return e.textContent; }) }; });
  var gs = Number(os.invoice.grandtotal), gr = Number(or.invoice.grandtotal);
  console.log('§TILL_REFUND_Z ' + J(z) + ' oracle sale=' + gs + ' refund=' + gr);
  check('refund', 'z-folds-refund', z.tickets === '2' && z.units === '2' && z.gross === money2(gs + gr) && z.bytender.indexOf('cash ' + money2(gs)) >= 0 && z.bytender.indexOf('cashrefund ' + money2(gr)) >= 0, 'Close Cash: 2 tickets, 2 units (3 sold, 1 refunded), Sales == sale + refund invoices (' + money2(gs + gr) + '), tenders cash ' + money2(gs) + ' and cashrefund ' + money2(gr), z);
  await pg.close();
}

// ═══ CUSTPAY (U12) : ISSUES: a customer payment deposits ONLY an I_Payment with the customer's Value; Import Payment (343) turns it into a receipt for THAT partner; Import POS Sales refuses it (no ticket lines) so the two imports cannot be confused
async function runCustPay(ctx, base) {
  var pg = await openTill(ctx, base); await loginSales(pg); await pg.evaluate(function () { window.Till.go('custpay'); }); await sleep(900);
  var cs = await pg.$$eval('#cp-list [data-cust]', function (b) { return b.map(function (x) { return [x.getAttribute('data-n'), x.getAttribute('data-v')]; }); });
  check('custpay', 'customers-listed', cs.length > 0, 'the customer list is filled from c_bpartner (IsCustomer) of the tenant (n=' + cs.length + ')', cs.length);
  await pg.fill('#cp-find', 'Patio'); await pg.click('#cp-search'); await sleep(500); var c1 = await pg.$$eval('#cp-list [data-cust]', function (b) { return b.map(function (x) { return [x.getAttribute('data-n'), x.getAttribute('data-v')]; }); });
  check('custpay', 'find-by-name', c1.length >= 1 && /Patio/.test(c1[0][0]), 'finding "Patio" lists Patio Fun', c1);
  await pg.click('#cp-list [data-cust]'); var card = await pg.evaluate(function () { return { name: document.getElementById('cp-name').textContent, max: document.getElementById('cp-max').textContent, debt: document.getElementById('cp-debt').textContent }; });
  check('custpay', 'card-fields', card.name === c1[0][0] && card.max !== '' && card.debt !== '', '5.0 CustomersPayment: Name, Credit Limit (label.maxdebt) and Current Debt (label.curdebt) are shown', card);
  await pg.fill('#cp-amount', '25.00'); await pg.click('#cp-pay'); await pg.waitForSelector('#u8.on');
  var tabs = await pg.$$eval('#tabs [data-tab]', function (b) { return b.map(function (x) { return [x.textContent, x.disabled]; }); });
  check('custpay', 'customer-tabs', J(tabs.map(function (x) { return x[0]; })) === J(['Cash', 'Cheque', 'Voucher', 'Bank', 'Card', 'Slip']), '5.0 JPaymentSelectCustomer.java:67-72: Cash, Cheque, Voucher, Bank, Card, Slip', tabs);
  await pg.click('#tabs [data-tab="cash"]'); await pg.fill('#tender-amount', '25.00'); await pg.click('#pay-ok'); await pg.waitForSelector('#u9.on', { timeout: 20000 }); var key = await receiptKey(pg);
  var o = await rowsOf(pg, "SELECT * FROM i_order WHERE documentno='" + key + "'"), p = await rowsOf(pg, "SELECT * FROM i_payment WHERE documentno='" + key + "'");
  check('custpay', 'deposit-shape', /-P1$/.test(key) && o.length === 0 && p.length === 1 && p[0].bpartnervalue === c1[0][1] && num(p[0].payamt) === 25 && p[0].tendertype === 'X' && p[0].isreceipt === 'Y', 'ONE I_Payment (no I_Order), key ' + key + ', BPartnerValue ' + c1[0][1] + ', 25.00 cash', { o: o.length, p: p[0] && [p[0].bpartnervalue, p[0].payamt, p[0].tendertype] });
  var orders = await rowsOf(pg, 'SELECT * FROM i_order'), pays = await rowsOf(pg, 'SELECT * FROM i_payment');
  var R = await importRows(orders, pays);
  check('custpay', 'pos-sales-refuses', R.logs.some(function (l) { return l.indexOf('key=' + key) >= 0 && l.indexOf('result=REFUSED') >= 0 && /no ticket lines/.test(l); }), 'Import POS Sales REFUSES a key without lines ("ERR=no ticket lines") : customer payments are not its job', R.logs.filter(function (l) { return l.indexOf(key) >= 0; }).map(function (l) { return l.slice(0, 160); }));
  var H = R.H; var run = H.commit(function (trx) { var r0 = H.AP.runInTrx(trx, 343, { params: { AD_Org_ID: 11, C_BankAccount_ID: 100, DocAction: 'CO', DeleteOldImported: 'N' } }); return { ok: r0.ok, error: r0.summary }; });
  var rc = H.q0('SELECT * FROM c_payment WHERE documentno=?', [key]), bp = H.q0('SELECT c_bpartner_id FROM c_bpartner WHERE value=?', [c1[0][1]])[0];
  check('custpay', 'import-payment-343', run.ok && rc.length === 1 && rc[0].docstatus === 'CO' && bp && String(rc[0].c_bpartner_id) === String(bp.c_bpartner_id) && Number(rc[0].payamt) === 25, 'Import Payment (343) makes ONE completed receipt of 25.00 for the partner ' + c1[0][1], { run: run.ok && run.error, rc: rc.map(function (r) { return [r.docstatus, r.payamt, r.c_bpartner_id]; }), bp: bp });
  await pg.close();
}

// ═══ PANELS (U13 / N18 / N19 / N21 / N22) : ISSUES: Payments in/out reach the Z under their own tender names; the voucher ledger is single-use; presence and pick-up behave as the 5.0 panels; none of it writes a deposit row
async function runPanels(ctx, base) {
  var pg = await openTill(ctx, base); await loginSales(pg); var before = await rowsOf(pg, 'SELECT (SELECT count(*) FROM i_order) AS o, (SELECT count(*) FROM i_payment) AS p');
  var pickups = []; for (var i = 0; i < 2; i++) { await ring(pg, [[129, 1]]); await payExact(pg); var k = await receiptKey(pg); pickups.push(await pg.evaluate(function (kk) { return window.Till.state().store.rcpt[kk].pickup; }, k)); await pg.click('#rc-ok'); }
  check('panels', 'pickup-increments', pickups[0] >= 1 && pickups[1] === pickups[0] + 1, 'each saved ticket takes the next pick-up number (' + pickups.join(',') + ')', pickups);
  await pg.evaluate(function () { window.Till.go('pickup'); }); await pg.click('#pu-reset'); var cf = await pg.$eval('#pu-confirm', function (e) { return { hidden: e.hidden, text: e.textContent }; });
  check('panels', 'pickup-confirm', cf.hidden === false && /reset the Order Pickup number to 0/.test(cf.text), 'Reset asks message.resetpickup before acting', cf);
  await pg.click('#pu-confirm'); var nx = await pg.$eval('#pu-next', function (e) { return e.textContent; }), dn = await pg.$eval('#pu-done', function (e) { return e.textContent; });
  await pg.evaluate(function () { window.Till.go('sales'); }); await ring(pg, [[129, 1]]); await payExact(pg); var k3 = await receiptKey(pg); var pk3 = await pg.evaluate(function (kk) { return window.Till.state().store.rcpt[kk].pickup; }, k3); await pg.click('#rc-ok');
  check('panels', 'pickup-reset', nx === '1' && dn === 'Reset complete.' && pk3 === 1, 'after Reset the next pick-up is 1 ("Reset complete.") and the next ticket takes 1', { nx: nx, dn: dn, pk3: pk3 });
  // Payments in/out
  await pg.evaluate(function () { window.Till.go('payments'); });
  var opts = await pg.$$eval('#pm-reason option', function (o) { return o.map(function (x) { return x.textContent; }); }); check('panels', 'reasons', J(opts) === J(['Cash (In)', 'Cash (Out)']), 'PaymentsEditor.java:59-60 reasons Cash (In), Cash (Out)', opts);
  await pg.selectOption('#pm-reason', 'cashin'); await pg.fill('#pm-amount', '50.00'); await pg.fill('#pm-notes', 'float'); await pg.click('#pm-save');
  await pg.selectOption('#pm-reason', 'cashout'); await pg.fill('#pm-amount', '20.00'); await pg.fill('#pm-notes', 'milk'); await pg.click('#pm-save');
  await pg.selectOption('#pm-reason', 'cashout'); await pg.fill('#pm-amount', '1.00'); await pg.click('#pm-save'); var n3 = (await pg.$$('#pm-list [data-cashio]')).length; await pg.locator('#pm-list [data-pm-del]').last().click(); var n2 = (await pg.$$('#pm-list [data-cashio]')).length;
  check('panels', 'payments-save-delete', n3 === 3 && n2 === 2, 'three Payments saved then one deleted leaves 2', { n3: n3, n2: n2 });
  await pg.evaluate(function () { window.Till.go('close'); }); await sleep(700);
  var z = await pg.evaluate(function () { return { bytender: [].map.call(document.querySelectorAll('#z-bytender [data-tender]'), function (e) { return e.textContent; }), payments: document.getElementById('z-payments').textContent }; });
  check('panels', 'z-cashio', z.bytender.indexOf('cashin 50.00') >= 0 && z.bytender.indexOf('cashout -20.00') >= 0, 'Close Cash shows cashin 50.00 and cashout -20.00 beside the tenders (PaymentsModel.java:201)', z);
  var after = await rowsOf(pg, 'SELECT (SELECT count(*) FROM i_order) AS o, (SELECT count(*) FROM i_payment) AS p');
  check('panels', 'cashio-not-deposited', num(after[0].p) - num(before[0].p) === 3, 'Payments in/out wrote no deposit row: I_Payment grew only by the 3 cash tenders of the 3 tickets (' + (num(after[0].p) - num(before[0].p)) + ')', { before: before[0], after: after[0] });
  // voucher
  await pg.evaluate(function () { window.Till.go('vouchers'); }); var vn = await pg.$eval('#vo-number', function (e) { return e.value; });
  await pg.fill('#vo-customer', 'Test'); await pg.fill('#vo-amount', '30'); await pg.click('#vo-issue'); var vl = await pg.$$eval('#vo-list [data-voucher]', function (d) { return d.map(function (x) { return x.getAttribute('data-voucher') + ':' + x.getAttribute('data-status'); }); });
  await pg.fill('#vo-redeem-number', vn); await pg.click('#vo-redeem'); var m1 = await pg.$eval('#vo-msg', function (e) { return e.textContent; }); await pg.click('#vo-redeem'); var m2 = await pg.$eval('#vo-msg', function (e) { return e.textContent; });
  check('panels', 'voucher-single-use', vl.length === 1 && vl[0] === vn + ':A' && /redeemed 30.00/.test(m1) && /already used/.test(m2), 'a voucher is issued (Active), redeems once ("' + m1 + '") and a second redeem is refused ("' + m2 + '")', { vl: vl, m1: m1, m2: m2 });
  // presence
  await pg.evaluate(function () { window.Till.go('presence'); }); var st0 = await pg.$$eval('#pr-in, #pr-out', function (b) { return b.map(function (x) { return x.id + ':' + x.disabled; }); });
  await pg.click('#pr-in'); var m3 = await pg.$eval('#pr-msg', function (e) { return e.textContent; }), st1 = await pg.$$eval('#pr-in, #pr-out', function (b) { return b.map(function (x) { return x.id + ':' + x.disabled; }); });
  await pg.click('#pr-out'); var m4 = await pg.$eval('#pr-msg', function (e) { return e.textContent; });
  check('panels', 'presence', /GardenAdmin has Checked In at \d{4}-/.test(m3) && /GardenAdmin has Checked Out at \d{4}-/.test(m4) && J(st1) === J(['pr-in:true', 'pr-out:false']), 'Check In then Check Out: "' + m3 + '" / "' + m4 + '", the buttons toggle (JPanelEmployeePresence)', { m3: m3, m4: m4, st1: st1 });
  // reprint last = the ticket just paid
  await pg.evaluate(function () { window.Till.go('sales'); }); await pg.click('#north [data-btn="Reprint Last Ticket"]'); await pg.waitForSelector('#u9.on'); var rk = await receiptKey(pg);
  check('panels', 'reprint-last', rk === k3, 'Reprint Last Ticket prints the last saved ticket ' + k3, rk);
  await pg.close();
}

// ═══ REST (U16 / U17) : mode=restaurant. ISSUES: the table map replaces the bag; a table\'s ticket is held under the table and comes back; a reservation checks in onto its table; the sale still deposits as an ordinary ticket
async function runRest(ctx, base) {
  var pg = await openTill(ctx, base, '?mode=restaurant'); await pg.click('#u1 .u-user:has-text("GardenAdmin")'); await pg.click('#u2 [data-panel="Sales"]'); await pg.waitForSelector('#u16.on');
  var np = (await pg.$$('#fl-map .place')).length, names = await pg.$$eval('#fl-map .place', function (b) { return [b[0].getAttribute('data-place'), b[23].getAttribute('data-place')]; }), bagHidden = await pg.$eval('#bag', function (e) { return e.hidden; });
  check('rest', 'table-map', np === 24 && J(names) === J(['Table 1', 'Table 24']) && bagHidden === true, 'SQLite-create.sql:652-683 seed: 24 tables on the floor; the 5-button bag is replaced by the map', { np: np, names: names, bagHidden: bagHidden });
  await pg.click('#fl-map [data-place="Table 3"]'); await pg.waitForSelector('#u3.on'); var tid = await pg.$eval('#tid', function (e) { return e.textContent; }), fb = await pg.$$eval('#floorbar [data-btn]', function (b) { return b.map(function (x) { return x.getAttribute('data-btn'); }); });
  check('rest', 'table-opens', /Table 3/.test(tid) && J(fb) === J(['Reload', 'Reservations', 'Tables']), 'a table click opens that table\'s ticket; the bar offers Reload, Reservations, Tables', { tid: tid, fb: fb });
  await ring(pg, [[129, 2]]); await pg.click('#floorbar [data-btn="Tables"]'); await pg.waitForSelector('#u16.on');
  var occ = await pg.$eval('#fl-map [data-place="Table 3"]', function (b) { return b.getAttribute('data-occupied'); }); check('rest', 'table-occupied', occ === '1', 'leaving a table with lines keeps its ticket and marks the table occupied', occ);
  await pg.click('#fl-map [data-place="Table 3"]'); await pg.waitForSelector('#u3.on'); var back = await domLines(pg); check('rest', 'table-recalled', back.length === 1 && back[0].qty === 'x2', 'the same table brings its ticket back (x2)', back);
  var tot = await payExact(pg); var key = await receiptKey(pg); await pg.click('#rc-ok'); await pg.waitForSelector('#u16.on');
  var occ2 = await pg.$eval('#fl-map [data-place="Table 3"]', function (b) { return b.getAttribute('data-occupied'); });
  check('rest', 'paid-frees-table', occ2 === '0', 'after payment the receipt returns to the map and the table is free', occ2);
  var ro = await rowsOf(pg, "SELECT * FROM i_order WHERE documentno='" + key + "'"); check('rest', 'deposits-as-ticket', ro.length === 1 && /-S\d+$/.test(key), 'the table sale deposits as an ordinary S ticket (1 I_Order row)', { n: ro.length, key: key });
  await pg.click('#fl-res'); await pg.waitForSelector('#u17.on');
  await pg.fill('#rs-customer', 'Ms Lee'); await pg.fill('#rs-chairs', '4'); await pg.fill('#rs-date', '2026-11-04T19:00'); await pg.selectOption('#rs-place', 'Table 7'); await pg.click('#rs-save');
  var rl = await pg.$$eval('#rs-list [data-res]', function (d) { return d.map(function (x) { return x.textContent; }); }); check('rest', 'reservation-saved', rl.length === 1 && /Ms Lee/.test(rl[0]) && /Table 7/.test(rl[0]), 'a reservation (person, 4 persons, booking time, table) is listed', rl);
  await pg.click('#rs-list [data-res-in]'); await pg.waitForSelector('#u3.on'); var tid2 = await pg.$eval('#tid', function (e) { return e.textContent; }); check('rest', 'check-in-now', /Table 7/.test(tid2), 'Check-In Now opens the reserved table', tid2);
  var hold = await pg.evaluate(function () { return window.Till.state().store.reservations[0].in; }); check('rest', 'check-in-marked', hold === true, 'the reservation is marked checked in', hold);
  await pg.close();
}

// ═══ mutants: each child serves ONE broken copy; a kill = the child ran to its own verdict, FAILED on the named check, and did not crash
var MUTANTS = [
  { name: 'price-not-carried', arms: 'deposit', expect: 'price-carried', edit: { file: 'erp/till_core.js', from: 'qtyordered: l.qty, priceactual: l.price,', to: 'qtyordered: l.qty,' } },
  { name: 'ticket-split-documentno', arms: 'deposit', expect: 'contiguous', edit: { file: 'erp/till_core.js', from: 'documentno: key, m_product_id: l.pid,', to: "documentno: key + (l.pid === 129 ? 'x' : ''), m_product_id: l.pid," } },
  { name: 'till-completes-the-order', arms: 'deposit', expect: 'zero-core-docs', edit: { file: 'erp/till.js', from: 'var res = await depositGroup(ops);', to: "ops.push({ op_type: 'CRUD_CREATE', key: 'c_order', table: 'c_order', verb: 'create', fields: { ad_client_id: S.cfg.client, ad_org_id: S.cfg.org, documentno: key, docstatus: 'CO' } }); var res = await depositGroup(ops);" } },
  { name: 'tax-left-out-of-total', arms: 'deposit', expect: 'T1-to-the-cent', edit: { file: 'erp/till_core.js', from: 'gross: r.grandTotal, rows: r.rows', to: 'gross: r.totalLines, rows: r.rows' } },
  { name: 'refund-sign-dropped', arms: 'refund', expect: 'rows-negative', edit: { file: 'erp/till_core.js', from: 'payamt: sgn * p.applied / 100,', to: 'payamt: p.applied / 100,' } },
  { name: 'recall-leaves-held-row', arms: 'held', expect: 'recall-removes-held-row', edit: { file: 'erp/till_ext.js', from: "st().held = (st().held || []).filter(function (y) { return y.id !== id; });", to: "(st().held = st().held || []).push(x);" } },
  { name: 'line-discount-not-folded', arms: 'bar', expect: 'discount-folded', edit: { file: 'erp/till_core.js', from: 'if (l.disc && last) {', to: 'if (false && l.disc && last) {' } },
  { name: 'edit-keeps-old-rows', arms: 'edit', expect: 'old-rows-gone', edit: { file: 'erp/till.js', from: 'if (t.old) {                                                                       // Edit:', to: 'if (false) {                                                                       // Edit:' } },
  { name: 'pad-dot-after-factor-integer', arms: 'pad', expect: 'L1108', edit: { file: 'erp/till_pad.js', from: "{ s.por += '.'; s.st = ST.PORDEC; }", to: "{ s.por += '.'; }" } }
];
function runMutants() {
  var kills = 0;
  MUTANTS.forEach(function (m) {
    var r = cp.spawnSync('node', [__filename], { env: Object.assign({}, process.env, { TILL_ARMS: m.arms, TILL_MUT: J([m.edit]), TILL_MUT_ONE: m.name, TILL_MUT_RUN: '' }), encoding: 'utf8', timeout: 600000, maxBuffer: 1 << 26 });
    var out = (r.stdout || '') + (r.stderr || ''), crashed = /§TILL_CRASH/.test(out) || r.status === 2 || r.status === 3 || r.status === null;
    var failed = out.split('\n').filter(function (l) { return /§TILL_CHECK .* FAIL /.test(l); }), hit = failed.some(function (l) { return l.indexOf('key=' + m.expect) >= 0 || (m.expect === 'L1108' && /key=L1108/.test(l)); });
    var killed = !crashed && hit; if (killed) kills++;
    console.log('§TILL_MUTANT ' + m.name + ' applied=' + !/DID NOT APPLY/.test(out) + ' crashed=' + crashed + ' exit=' + r.status + ' failed_checks=' + failed.map(function (l) { return /key=(\S+)/.exec(l)[1]; }).join(',') + ' expected=' + m.expect + ' -> ' + (killed ? 'KILLED' : 'SURVIVED'));
    fs.writeFileSync('/tmp/till_logs/mutant_' + m.name + '.log', out);
  });
  console.log('§TILL_MUTANTS killed ' + kills + ' of ' + MUTANTS.length);
  process.exit(kills === MUTANTS.length ? 0 : 1);
}
if (process.env.TILL_MUT_RUN !== undefined && !CHILD) runMutants();
else
// ═══ main
(async function main() {
  console.log('═══ W-TILL — the Unicenta-alike till, slice 1 (prompts/POS_PLUGIN_LOCAL_FIRST.md §15, §15.8) ═══ arms=' + ARMS.join(',') + (CHILD ? ' MUTANT=' + CHILD : ''));
  var P = null; try { if (OVER['/erp/till_pad.js']) { var mm = { exports: {} }; new Function('module', 'exports', OVER['/erp/till_pad.js'])(mm, mm.exports); P = mm.exports; } else P = require(path.join(ERP, 'till_pad.js')); } catch (e) { console.log('§TILL_PAD module till_pad.js absent: ' + e.message); }
  if (ARMS.indexOf('pad') >= 0) { if (P) runPad(P); else check('pad', 'module', false, 'erp/till_pad.js exists', null); verdict('pad', 'TILL_PAD_VERDICT W-TILL-PAD'); }
  var browserArms = ARMS.filter(function (a) { return a !== 'pad'; });
  if (browserArms.length && fs.existsSync(path.join(ERP, 'till.html'))) {
    var sv = await startServer(), browser = await reqPw().chromium.launch({ args: ['--disable-gpu'] });
    var newCtx = function () { return browser.newContext({ viewport: { width: 1400, height: 900 } }); }, ctx = null;
    try {
      if (ARMS.indexOf('deposit') >= 0) { ctx = await newCtx(); await runDeposit(ctx, sv.base); verdict('deposit', 'TILL_DEPOSIT_VERDICT W-TILL-DEPOSIT'); }
      if (ARMS.indexOf('offline') >= 0) {
        ctx = await newCtx(); await runOffline(ctx, sv.base); verdict('offline', 'TILL_OFFLINE_VERDICT W-TILL-OFFLINE (local half)');
        inconclusive('offline', 'TILL_OFFLINE_DELIVERY W-TILL-OFFLINE (Visit delivery)', 'judged by erp/tests/witness_till_delivery.js (the two-device pipe harness of witness_mf_seed.js), not in this file');
      }
      var NAMES = { bar: 'TILL_BAR_VERDICT W-TILL-BAR', held: 'TILL_HELD_VERDICT W-TILL-HELD', edit: 'TILL_EDIT_VERDICT W-TILL-EDIT', refund: 'TILL_REFUND_VERDICT W-TILL-REFUND', custpay: 'TILL_CUSTPAY_VERDICT W-TILL-CUSTPAY', panels: 'TILL_PANELS_VERDICT W-TILL-PANELS', rest: 'TILL_REST_VERDICT W-TILL-REST' };
      var FNS = { bar: runBar, held: runHeld, edit: runEdit, refund: runRefund, custpay: runCustPay, panels: runPanels, rest: runRest };
      for (var an of Object.keys(NAMES)) if (ARMS.indexOf(an) >= 0) { ctx = await newCtx(); try { await FNS[an](ctx, sv.base); } catch (e) { check(an, 'arm-threw', false, 'the arm ran to its end', String(e && e.stack || e).slice(0, 400)); } verdict(an, NAMES[an]); await ctx.close().catch(function () {}); }
      if (ARMS.indexOf('parity') >= 0) {
        // the kitchen rows (15, 20) are judged by what they DO: the three-device witness (erp/tests/witness_kds.js) runs as a child and its verdicts feed ROWARM 'kds'; a missing/failed child leaves both rows MISSING
        var kv = await runKdsChild(); V.kds = kv; console.log('§TILL_KDS_ARM judged=' + kv.judged + ' failed=' + kv.failed + ' ' + kv.note);
        ctx = await newCtx(); var pgp = await openTill(ctx, sv.base), ctx2 = await newCtx(), pgr = await openTill(ctx2, sv.base, '?mode=restaurant'); await pgr.click('#u1 .u-user:has-text("GardenAdmin")');
        var ctx3 = await newCtx(), pgk = null; if (fs.existsSync(path.join(ERP, 'kitchen.html'))) { pgk = await ctx3.newPage(); pgk.on('pageerror', function (e) { ERRS.push(e.message); }); await pgk.goto(sv.base + '/erp/kitchen.html?login=50001', { waitUntil: 'load' }); await pgk.waitForFunction(function () { return window.Kitchen && window.Kitchen.ready; }, null, { timeout: 170000 }).catch(function () { pgk = null; }); }
        var pr = await runParity(pgp, pgr, pgk); console.log('§TILL_PARITY ' + pr.x + ' of ' + pr.N + ' ' + J(pr.detail));
        check('parity', 'non-vacuous', pr.N === 22 && pr.x > 0, 'N is the registry (22, §14A.6) and at least one row was judged present', pr);
        console.log(pr.x < pr.N ? '§TILL_UNICENTA_PARITY_VERDICT W-TILL-UNICENTA-PARITY verdict=INCONCLUSIVE ' + pr.x + '/' + pr.N : '§TILL_UNICENTA_PARITY_VERDICT W-TILL-UNICENTA-PARITY verdict=PASS ' + pr.x + '/' + pr.N);
        await pgp.close(); await pgr.close(); if (pgk) await pgk.close();
      }
      console.log('§TILL_PAGE_ERRORS n=' + ERRS.length + (ERRS.length ? ' ' + J(ERRS.slice(0, 3)) : ''));
    } finally { await browser.close(); sv.server.close(); }
  } else if (browserArms.length) { console.log('§TILL_PAGE erp/till.html absent: browser arms not judged'); browserArms.forEach(function (a) { check(a, 'page', false, 'erp/till.html exists', null); }); }
  var failed = Object.keys(V).reduce(function (a, k) { return a + V[k].failed; }, 0);
  console.log('§TILL_SUMMARY failed=' + failed + ' arms=' + J(V));
  process.exit(failed ? 1 : 0);
})().catch(function (e) { console.log('§TILL_CRASH ' + (e && e.stack || e)); process.exit(3); });
