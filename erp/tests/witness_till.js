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
var ARMS = (process.env.TILL_ARMS || 'pad,parity,deposit,offline').split(','), CHILD = process.env.TILL_MUT_ONE || '';
var J = JSON.stringify, sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
var V = {};   // verdict counters per arm
function check(arm, key, ok, label, info) { var c = V[arm] = V[arm] || { judged: 0, failed: 0 }; c.judged++; if (!ok) c.failed++; console.log('  §TILL_CHECK arm=' + arm + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' ' + label + (ok ? '' : ' got=' + J(info))); return ok; }
function verdict(arm, name) { var c = V[arm] || { judged: 0, failed: 0 }; var v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; console.log('§' + name + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed + (CHILD ? ' mutant=' + CHILD : '')); return v; }
function inconclusive(arm, name, why) { console.log('§' + name + ' verdict=INCONCLUSIVE ' + why); }

// ═══ PAD: the cases. State = {st, price, por, inV, porV}; st numbering = JPanelTicket.java:87-94. Expected effects are written from the Java line cited.
var Z = { st: 0, price: '', por: '', inV: 0, porV: 0 };
function S(st, price, por, inV, porV) { return { st: st, price: price, por: por, inV: inV, porV: porV }; }
var SEL = { selected: true, lines: 2, canEdit: true, type: 'S' }, NOSEL = { selected: false, lines: 2, canEdit: true, type: 'S' }, NOLINES = { selected: false, lines: 0, canEdit: true, type: 'S' };
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
  [1239, '- after a factor: n units at a negative price', S(6, '', 'x3', 0, 1), '-', SEL, Z, 'negateLine'],
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
async function openTill(ctx, base) {
  var pg = await ctx.newPage(); pg.__logs = [];
  pg.on('console', function (m) { var t = m.text(); pg.__logs.push(t); if (/^§TILL_(COST|BOOT|DEPOSIT|Z|CLOSE|ZREPRINT|MSG)|🔴/.test(t)) console.log('   [page] ' + t.slice(0, 300)); });
  pg.on('pageerror', function (e) { ERRS.push(e.message); console.log('   [pageerror] ' + e.message); });
  await pg.goto(base + '/erp/till.html', { waitUntil: 'load' });
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
async function prepare(pg, screen) {   // put the live page on the screen a registry row talks about, by the cashier's own clicks
  if (screen === 'login') { await pg.evaluate(function () { window.Till.go('login'); }); return; }
  if (!LOGGED) { await pg.evaluate(function () { window.Till.go('login'); }); await pg.click('#u1 .u-user:has-text("GardenAdmin")'); LOGGED = true; }
  if (screen === 'menu' || screen === 'close') { await pg.evaluate(function (s) { window.Till.go(s); }, screen); return; }
  await pg.evaluate(function () { window.Till.go('sales'); });
  if (!(await pg.$('#products .prod'))) { var c = await pg.$('#cats [data-cat]'); if (c) await c.click(); }
  if (screen === 'sales') return;
  if (!(await pg.$('#tl tr.line'))) await pg.click('#products .prod');
  if (!(await pg.$('#u8.on'))) { await pg.click('#east .key[data-key="="]'); await pg.waitForSelector('#u8.on'); }
  if (screen === 'pay') return;
  await pg.click('#pay-ok'); await pg.waitForSelector('#u9.on', { timeout: 20000 });
}
// ═══ PARITY: X of N from the registry against the live DOM
async function runParity(pg) {
  var R = await pg.evaluate(function () { return window.Till.registry.ROWS; }), x = 0, N = R.length, detail = [];
  for (var row of R) {
    var ok = false, why = '';
    if (['login', 'menu', 'sales', 'pay', 'receipt', 'close'].indexOf(row.screen) < 0) { why = 'no such screen in the page (registry status ' + row.status + ')'; }
    else {
      try {
        await prepare(pg, row.screen);
        ok = true;
        for (var sel of row.sels || []) {
          // pay/receipt screens only exist during a sale: open them for the check
          if (!(await pg.$(sel))) { ok = false; why += ' missing ' + sel; }
        }
        var ords = ['order', 'order2', 'order3'].map(function (k) { return row[k]; }).filter(Boolean);
        for (var o of ords) {
          var texts = await pg.$$eval(o.container + ' ' + (o.item.indexOf(':scope') === 0 ? '' : o.item), function (els) { return els.map(function (e) { return e.textContent.trim().replace(/\s+[\d.,?-]+$/, ''); }); }).catch(function () { return []; });
          if (o.item.indexOf(':scope') === 0) texts = await pg.$$eval(o.container + ' > [data-btn]', function (els) { return els.map(function (e) { return e.getAttribute('data-btn'); }); });
          if (J(texts) !== J(o.texts)) { ok = false; why += ' order ' + o.container + ' got ' + J(texts); }
        }
        if (row.tile) { var tl = await pg.evaluate(function () { var c = document.querySelector('#products .prod'); if (!c) return null; var cs = getComputedStyle(c); return [cs.width, cs.height]; }); if (!tl) { why += ' no tile on screen'; } else if (tl[0] !== row.tile.w + 'px' || tl[1] !== row.tile.h + 'px') { ok = false; why += ' tile ' + tl; } }
      } catch (e) { ok = false; why = 'threw ' + e.message; }
    }
    if (ok) x++; detail.push(row.w + (ok ? '+' : '-'));
    if (ok && row.status !== 'built') console.log('  §TILL_PARITY_STALE w=' + row.w + ' registry says ' + row.status + ' but the DOM has it');
    console.log('  §TILL_PARITY_ROW w=' + row.w + ' ' + row.u + ' "' + row.label + '" status=' + row.status + ' ' + (ok ? 'PRESENT' : 'MISSING') + (why ? ' (' + why.trim() + ')' : ''));
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
  await pg.evaluate(function (rate) { return new Promise(function (res) { window.Till.engine().__crud.applyOp({ op_type: 'CRUD_UPDATE', key: 'c_tax', table: 'c_tax', verb: 'update', id: 104, changes: { rate: rate } }); setTimeout(res, 1500); }); }, TAX);
  await pg.close(); pg = await openTill(ctx, base);
  var trate = (await rowsOf(pg, 'SELECT rate FROM c_tax WHERE c_tax_id=104'))[0];
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

// ═══ mutants: each child serves ONE broken copy; a kill = the child ran to its own verdict, FAILED on the named check, and did not crash
var MUTANTS = [
  { name: 'price-not-carried', arms: 'deposit', expect: 'price-carried', edit: { file: 'erp/till_core.js', from: 'qtyordered: l.qty, priceactual: l.price,', to: 'qtyordered: l.qty,' } },
  { name: 'ticket-split-documentno', arms: 'deposit', expect: 'contiguous', edit: { file: 'erp/till_core.js', from: 'documentno: key, m_product_id: l.pid,', to: "documentno: key + (l.pid === 129 ? 'x' : ''), m_product_id: l.pid," } },
  { name: 'till-completes-the-order', arms: 'deposit', expect: 'zero-core-docs', edit: { file: 'erp/till.js', from: 'var res = await depositGroup(ops);', to: "ops.push({ op_type: 'CRUD_CREATE', key: 'c_order', table: 'c_order', verb: 'create', fields: { ad_client_id: S.cfg.client, ad_org_id: S.cfg.org, documentno: key, docstatus: 'CO' } }); var res = await depositGroup(ops);" } },
  { name: 'tax-left-out-of-total', arms: 'deposit', expect: 'T1-to-the-cent', edit: { file: 'erp/till_core.js', from: 'gross: r.grandTotal, rows: r.rows', to: 'gross: r.totalLines, rows: r.rows' } },
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
      if (ARMS.indexOf('parity') >= 0) {
        ctx = await newCtx(); var pg = await openTill(ctx, sv.base);
        var pr = await runParity(pg); console.log('§TILL_PARITY ' + pr.x + ' of ' + pr.N + ' ' + J(pr.detail));
        check('parity', 'non-vacuous', pr.N === 22 && pr.x > 0, 'N is the registry (22, §14A.6) and at least one row was judged present', pr);
        console.log(pr.x < pr.N ? '§TILL_UNICENTA_PARITY_VERDICT W-TILL-UNICENTA-PARITY verdict=INCONCLUSIVE ' + pr.x + '/' + pr.N : '§TILL_UNICENTA_PARITY_VERDICT W-TILL-UNICENTA-PARITY verdict=PASS ' + pr.x + '/' + pr.N);
        await pg.close();
      }
      if (ARMS.indexOf('deposit') >= 0) { ctx = await newCtx(); await runDeposit(ctx, sv.base); verdict('deposit', 'TILL_DEPOSIT_VERDICT W-TILL-DEPOSIT'); }
      if (ARMS.indexOf('offline') >= 0) {
        ctx = await newCtx(); await runOffline(ctx, sv.base); var off = verdict('offline', 'TILL_OFFLINE_VERDICT W-TILL-OFFLINE (local half)');
        inconclusive('offline', 'TILL_OFFLINE_DELIVERY W-TILL-OFFLINE (Visit delivery)', 'needs the two-device pipe harness of witness_mf_seed.js; not judged in slice 1');
      }
      console.log('§TILL_PAGE_ERRORS n=' + ERRS.length + (ERRS.length ? ' ' + J(ERRS.slice(0, 3)) : ''));
    } finally { await browser.close(); sv.server.close(); }
  } else if (browserArms.length) { console.log('§TILL_PAGE erp/till.html absent: browser arms not judged'); browserArms.forEach(function (a) { check(a, 'page', false, 'erp/till.html exists', null); }); }
  var failed = Object.keys(V).reduce(function (a, k) { return a + V[k].failed; }, 0);
  console.log('§TILL_SUMMARY failed=' + failed + ' arms=' + J(V));
  process.exit(failed ? 1 : 0);
})().catch(function (e) { console.log('§TILL_CRASH ' + (e && e.stack || e)); process.exit(3); });
