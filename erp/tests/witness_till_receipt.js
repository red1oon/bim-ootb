#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-TILL-RECEIPT-FORMAT + W-TILL-RECEIPT-COMPANY(no-company arm) (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §39). READ THE LOG (/tmp/receipt_logs/): exit code is not evidence.
// THE ISSUE (owner 2026-11-05: "the receipt is not well standard design and format"): the receipt must be uniCenta's Printer.Ticket.xml on a 42-column grid, not a list of fields. The layout table LAYOUT below is typed HERE from the XML
// lengths (Printer.Ticket.xml:36-247), INDEPENDENTLY of erp/till_core.js, and cross-checked against the XML itself when the file is reachable (UNICENTA_TICKET_XML or the scratchpad copy; else the xml check prints INCONCLUSIVE).
// Judged on the real till page: real clicks, the rendered .rf/.rb text grid and DOM, emulated print media. Never a screenshot. Zero lines judged = INCONCLUSIVE.
// Mutants (RCPT_MUT=<name>; a COPY of the file is served, proven applied exactly once, a crash is NOT a kill): qtyleft (Qty column left aligned), order (Subtotal printed again after Balance Due: blocks out of template order), cardleak (a card number line).
'use strict';
var http = require('http'), fs = require('fs'), path = require('path');
var ROOT = process.env.RCPT_ROOT || path.join(__dirname, '..', '..'), MUT = process.env.RCPT_MUT || '';
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };
var MUTS = {
  qtyleft: ['erp/till_core.js', "C(x[3], 'r', 7)", "C(x[3], 'l', 7)"],
  order: ['erp/till_core.js', "    var tls = m.filter(function (x) { return x[0] === 'taxline'; });", "    if (st) lab('Subtotal', 'Subtotal', st[1], 16, 26, true);\n    var tls = m.filter(function (x) { return x[0] === 'taxline'; });"],
  cardleak: ['erp/till_core.js', "Z('Tranx ID', g('Tranx ID')", "Z('Card', '4111111111111111', [C('Card # 4111111111111111', 'l', 0)]); Z('Tranx ID', g('Tranx ID')"]
};
var OVER = {};
if (MUT) { var m = MUTS[MUT], orig = fs.readFileSync(path.join(ROOT, m[0]), 'utf8'), n = orig.split(m[1]).length - 1; console.log('§RCPT_MUT ' + MUT + ' applied=' + n); if (n !== 1) { console.log('§RCPT_CRASH mutation did not apply exactly once'); process.exit(2); } OVER['/' + m[0]] = orig.replace(m[1], function () { return m[2]; }); }
var J = JSON.stringify, V = { j: 0, f: 0 };
function check(ok, label, info) { V.j++; if (!ok) V.f++; console.log('  §RCPT_CHECK ' + (ok ? 'OK' : 'FAIL') + ' ' + label + (ok ? '' : ' got=' + J(info).slice(0, 300))); }
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }

// ── the template, typed from Printer.Ticket.xml: block id -> cells [align, length] (length 0 = printed as is). Sources are the XML line numbers.
var W = 42;
var LAYOUT = {
  header: [['c', 42]],                                   // :36-53
  Receipt: [['l', 15], ['l', 0]], Refund: [['l', 15], ['l', 0]], Date: [['l', 15], ['l', 0]], Terminal: [['l', 15], ['l', 0]], 'Served by': [['l', 15], ['l', 0]], Customer: [['l', 15], ['l', 0]], Table: [['l', 15], ['l', 0]],   // :57-81
  Item: [['l', 17], ['r', 8], ['r', 7], ['r', 10]],      // :83-88
  sep: [['l', 42]],                                      // :89, :134
  line: [['l', 17], ['r', 8], ['r', 7], ['r', 10]],      // :91-117
  'Items count': [['l', 13], ['l', 14]],                  // :135
  Subtotal: [['l', 16], ['r', 26]], Tax: [['l', 16], ['r', 26]], Total: [['l', 16], ['r', 26]],   // :137-150
  taxline: [['l', 18], ['r', 12], ['r', 12]],            // :152-158
  Cash: [['l', 0]], Tendered: [['l', 22], ['r', 20]], Change: [['l', 22], ['r', 20]],             // :160-164
  Cheque: [['l', 22], ['r', 20]], Bank: [['l', 22], ['r', 20]],                                    // :168-190
  footer: [['c', 42]], 'footer-rule': [['l', 0]],        // :198-216
  'CARD SALE': [['c', 42]], AMOUNT: [['l', 10], ['r', 32]], 'Tranx ID': [['l', 0], ['l', 0]], 'Auth Code': [['l', 0], ['l', 0]], 'card-total': [['l', 16], ['r', 26]]   // :219-247
};
var BOLD = { Subtotal: 1, Total: 1, Cash: 1, 'CARD SALE': 1, 'card-total': 1, Tendered: 0 }, SIZE1 = { Total: 1, 'CARD SALE': 1, AMOUNT: 1, 'card-total': 1 };
// template block order (a sequence of ids; '*' repeatable, '?' optional)
var ORDER = ['header-logo?', 'blank', 'header*', 'blank', 'Receipt|Refund', 'Date', 'Terminal', 'Served by', 'Customer?', 'Table?', 'blank', 'Item', 'sep', 'line+', 'sep', 'Items count', 'blank', 'Subtotal', 'Tax', 'blank', 'Total', 'blank', 'taxline*', 'blank?',
  'Cash?', 'Tendered?', 'Change?', 'Cheque?', 'Bank?', 'footer-block?', 'blank', 'card-block*'];
function orderRegex() {
  var tok = ORDER.map(function (o) {
    if (o === 'footer-block?') return '(?:(?:blank,footer+,footer-rule,)(?:footer,)*)?';
    if (o === 'card-block*') return '(?:CARD (?:SALE|REFUND),blank,AMOUNT,Tranx ID,Auth Code,card-total,)*';
    var q = /[?*+]$/.test(o) ? o.slice(-1) : '', b = q ? o.slice(0, -1) : o;
    return '(?:(?:' + b + '),)' + q;
  });
  return new RegExp('^' + tok.join('') + '$');
}
function cellsOf(text, spec) {   // slice a rendered line into the template's cells; a length-0 cell takes the rest
  var out = [], off = 0; spec.forEach(function (c) { var len = c[1] || (text.length - off); out.push({ a: c[0], len: c[1], s: text.substr(off, len), off: off }); off += len; }); return out;
}
function alignOk(c) {   // the cell text sits where its alignment says
  if (!c.len) return true; var s = c.s; if (s.length !== c.len) return false;
  var l = s.length - s.replace(/^ +/, '').length, r = s.length - s.replace(/ +$/, '').length;
  if (s.trim() === '') return true;
  if (c.a === 'l') return l === 0; if (c.a === 'r') return r === 0; return Math.abs(l - r) <= 1;
}
var cents = function (s) { return Math.round(Number(s) * 100); };

(async function main() {
  console.log('═══ W-TILL-RECEIPT-FORMAT (prompts/POS_PLUGIN_LOCAL_FIRST.md §39) ═══' + (MUT ? ' MUTANT=' + MUT : '') + ' root=' + ROOT);
  // xml cross-check
  var xmlPath = process.env.UNICENTA_TICKET_XML || (fs.readdirSync('/tmp/claude-1000').map(function (d) { return path.join('/tmp/claude-1000', d); }).map(function (d) { try { return fs.readdirSync(d).map(function (e) { return path.join(d, e, 'scratchpad/unicenta5_src/src/main/resources/com/unicenta/pos/templates/Printer.Ticket.xml'); }); } catch (e) { return []; } }).reduce(function (a, b) { return a.concat(b); }, []).filter(fs.existsSync)[0]);
  if (xmlPath && fs.existsSync(xmlPath)) {
    var xml = fs.readFileSync(xmlPath, 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/[\s\S]*<ticket>/, '').replace(/<\/ticket>[\s\S]*/, ''), seen = {}; (xml.match(/<text [^>]*length="\d+"[^>]*>/g) || []).forEach(function (t) { var a = (/align\s*=\s*"(\w+)"/.exec(t) || [0, 'left'])[1][0], l = /length="(\d+)"/.exec(t)[1]; seen[a + l] = 1; });
    var mine = {}; Object.keys(LAYOUT).forEach(function (k) { LAYOUT[k].forEach(function (c) { if (c[1]) mine[c[0] + c[1]] = 1; }); });
    var missing = Object.keys(seen).filter(function (k) { return !mine[k]; });
    console.log('§RCPT_XML ' + xmlPath + ' align/length pairs in the XML=' + Object.keys(seen).length + ' missing from LAYOUT=' + J(missing));
    check(missing.length === 0, 'every align/length pair of Printer.Ticket.xml is in the witness layout table', missing);
  } else console.log('§RCPT_XML INCONCLUSIVE: Printer.Ticket.xml not reachable (set UNICENTA_TICKET_XML); layout table is unverified against the source');
  var sv = http.createServer(function (req, res) {
    var p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (OVER[p] != null) { res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] }); return res.end(OVER[p]); }
    var f = path.join(ROOT, p); if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(function (r) { sv.listen(0, '127.0.0.1', r); }); var base = 'http://127.0.0.1:' + sv.address().port;
  var browser = await reqPw().chromium.launch({ args: ['--disable-gpu'] }), errs = [];
  async function open(theme, setup) {
    var ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 }), pg = await ctx.newPage();
    pg.on('console', function (m) { var t = m.text(); if (/^§TILL_RECEIPT_GRID|🔴/.test(t)) console.log('   [page] ' + t.slice(0, 250)); }); pg.on('pageerror', function (e) { errs.push(e.message); console.log('   [pageerror] ' + e.message); });
    await pg.goto(base + '/erp/till.html', { waitUntil: 'load' }); await pg.waitForFunction('window.Till && window.Till.ready', null, { timeout: 170000 });
    if (theme || setup) await pg.evaluate(function (a) { var S = Till.state(); S.store.setup = Object.assign(S.store.setup || {}, a.setup || {}); if (a.theme) S.store.setup['ui.theme'] = a.theme; if (window.TillTheme && TillTheme.apply) TillTheme.apply(a.theme || S.store.setup['ui.theme']); }, { theme: theme, setup: setup });
    await pg.click('#u1 .u-user:has-text("GardenAdmin")'); await pg.click('#u2 [data-panel="Sales"]'); return pg;
  }
  async function clickProduct(pg, pid) {
    async function vis() { return (await pg.$('#products .prod[data-pid="' + pid + '"]')) !== null; }
    if (await vis()) { await pg.click('#products .prod[data-pid="' + pid + '"]'); return true; }
    var cats = await pg.$$eval('#cats [data-cat]', function (b) { return b.map(function (x) { return x.getAttribute('data-cat'); }); });
    for (var c of cats) { await pg.click('#cats [data-cat="' + c + '"]'); if (await vis()) { await pg.click('#products .prod[data-pid="' + pid + '"]'); return true; } if (await clickProduct(pg, pid)) return true; if (await pg.$('#cats [data-cat-up]')) await pg.click('#cats [data-cat-up]'); }
    return false;
  }
  async function typeNum(pg, n) { for (var ch of String(n)) await pg.click('#east .key[data-key="' + ch + '"]'); }
  async function pidOf(pg, name) { return pg.evaluate(function (n) { var p = Till.state().prods.filter(function (x) { return x.name === n; })[0]; return p ? p.pid : null; }, name); }
  async function sale(pg, split) {
    var rose = await pidOf(pg, 'Rose Bush'), hoe = await pidOf(pg, 'Hoe 4 ft'), chair = await pidOf(pg, 'Patio Chair');
    check(rose && hoe && chair, 'the three sample products exist in the seed (Rose Bush, Hoe 4 ft, Patio Chair)', { rose: rose, hoe: hoe, chair: chair });
    var reset = function () { return pg.evaluate(function () { var S = Till.state(); S.catPath = []; Till.go('sales'); }); };
    await typeNum(pg, 2); await reset(); check(await clickProduct(pg, rose), 'ring Rose Bush x2', null); await reset(); check(await clickProduct(pg, hoe), 'ring Hoe 4 ft', null); await reset(); check(await clickProduct(pg, chair), 'ring Patio Chair', null);
    var dom = await pg.evaluate(function () { var t = function (s) { return document.querySelector(s).textContent; }; return { lines: Array.prototype.map.call(document.querySelectorAll('#tl tr.line'), function (r) { var c = r.querySelectorAll('td'); return [c[0].textContent, c[1].textContent, c[2].textContent, c[3].textContent]; }), sub: t('#t-sub'), tax: t('#t-tax'), tot: t('#t-tot') }; });
    var tot = Number(dom.tot), cash = Math.floor(tot / 2);
    await pg.click('#east .key[data-key="="]'); await pg.waitForSelector('#u8.on');
    await pg.click('#tabs [data-tab="cash"]'); await pg.fill('#tender-amount', String(cash)); await pg.click('#addpart');
    await pg.click('#tabs [data-tab="magcard"]'); await pg.fill('#tender-amount', (tot - cash).toFixed(2)); await pg.fill('#card-ref', 'TRX-RC-0001'); await pg.fill('#card-auth', 'AUTH-RC');
    await pg.click('#pay-ok'); await pg.waitForSelector('#u9.on', { timeout: 20000 });
    return { dom: dom, cash: cash, tot: tot };
  }
  var grid = function (pg) { return pg.evaluate(function () { return Array.prototype.map.call(document.querySelectorAll('#receipt > *'), function (e) { return { f: e.classList.contains('rb') ? 'blank' : e.getAttribute('data-f'), t: e.classList.contains('rb') ? '' : e.textContent, bold: !!e.querySelector('b'), sz1: e.classList.contains('sz1'), v: e.getAttribute('data-v') }; }); }); };

  // ═══ arm 1: the sample ticket, classic theme (default)
  var pg = await open(null, null), s = await sale(pg), G = await grid(pg);
  fs.writeFileSync('/tmp/receipt_logs/receipt_grid.txt', G.map(function (g) { return '|' + g.t + '|'; }).join('\n') + '\n');
  console.log('§RCPT_GRID lines=' + G.length + ' (full text grid: /tmp/receipt_logs/receipt_grid.txt)'); G.forEach(function (g, i) { console.log('   ' + ('0' + i).slice(-2) + ' ' + (g.f + '        ').slice(0, 11) + '|' + g.t + '|'); });
  check(G.length > 10, 'the receipt rendered a grid (lines judged > 10)', G.length);
  check(G.every(function (g) { return g.t.length <= W; }), 'every rendered line is <= ' + W + ' columns wide', G.filter(function (g) { return g.t.length > W; }).map(function (g) { return g.t.length + ':' + g.t; }));
  // per-line columns
  var bad = [], judged = 0;
  G.forEach(function (g) {
    var key = g.f === 'Refund' ? 'Refund' : g.f, spec = LAYOUT[key] || (g.f === 'Cheque' || g.f === 'Bank' ? LAYOUT.Cheque : null);
    if (g.f === 'blank') { if (g.t !== '') bad.push(['blank-not-empty', g.t]); return; }
    if (g.f === 'header-logo') return;
    if (!spec) { bad.push(['no-template-row-for', g.f]); return; }
    judged++;
    var cs = cellsOf(g.t, spec);
    if (key !== 'Items count' && key !== 'Cash' && key !== 'Tranx ID' && key !== 'Auth Code' && key !== 'footer-rule' && !/^Receipt|Refund|Date|Terminal|Served by|Customer|Table$/.test(key)) { if (g.t.length !== spec.reduce(function (a, c) { return a + c[1]; }, 0)) bad.push(['width', g.f, g.t.length]); }
    cs.forEach(function (c) { if (!alignOk(c)) bad.push(['align', g.f, c.a + c.len, c.s]); });
    if (key === 'sep' && g.t !== new Array(43).join('-')) bad.push(['sep-not-42-dashes', g.t]);
    if (key === 'footer-rule' && g.t !== new Array(43).join('=')) bad.push(['rule-not-42-equals', g.t]);
    if (/^(Receipt|Refund|Date|Terminal|Served by|Customer|Table)$/.test(key) && !/^.{15}\S/.test(g.t)) bad.push(['label-column-15', g.t]);
    if (BOLD[g.f] && !g.bold) bad.push(['not-bold', g.f]); if (SIZE1[g.f] && !g.sz1) bad.push(['not-size1', g.f]); if (!SIZE1[g.f] && g.sz1) bad.push(['unexpected-size1', g.f]);
  });
  console.log('§RCPT_COLUMNS judged=' + judged + ' bad=' + J(bad));
  check(judged > 10 && bad.length === 0, 'every line starts each column at the template offset with the template alignment (' + judged + ' lines), bold + size-1 lines marked', bad.slice(0, 6));
  // order
  var ids = G.map(function (g) { return g.f; }).join(',') + ',', re = orderRegex(), okOrder = re.test(ids);
  console.log('§RCPT_ORDER ' + ids.slice(0, 400) + ' match=' + okOrder);
  check(okOrder, 'the blocks follow Printer.Ticket.xml order (logo, header, Receipt/Date/Terminal/Served by, Item header, lines, Items count, Subtotal, Tax, Balance Due, tax lines, tenders, footer, card block)', ids);
  // content = the till's own numbers
  var T = function (f) { return G.filter(function (g) { return g.f === f; }); }, cellv = function (g, i) { return cellsOf(g.t, LAYOUT[g.f])[i].s.trim(); };
  var lines = T('line');
  check(lines.length === 3 && s.dom.lines.length === 3, 'one printed line per ticket line (3)', { printed: lines.length, ticket: s.dom.lines.length });
  var lok = lines.length === s.dom.lines.length && lines.every(function (g, i) { var d = s.dom.lines[i]; return cellv(g, 0) === d[0].slice(0, 17).trim() && cellv(g, 1) === d[1] && cellv(g, 2) === d[2] && cellv(g, 3) === d[3]; });
  check(lok, 'name (cut to 17), price, "x"qty and value of every line equal the ticket on the till', { printed: lines.map(function (g) { return g.t; }), ticket: s.dom.lines });
  var sub = cents(cellv(T('Subtotal')[0] || { f: 'Subtotal', t: '' + new Array(43).join(' ') }, 1)), tax = cents(cellv(T('Tax')[0] || { f: 'Tax', t: new Array(43).join(' ') }, 1)), bd = cents(cellv(T('Total')[0] || { f: 'Total', t: new Array(43).join(' ') }, 1));
  check(T('Subtotal').length === 1 && sub === cents(s.dom.sub) && tax === cents(s.dom.tax) && bd === cents(s.dom.tot) && sub + tax === bd, 'Subtotal ' + s.dom.sub + ' + Tax ' + s.dom.tax + ' = Balance Due ' + s.dom.tot + ' to the cent, equal to the till\'s totals', { sub: sub, tax: tax, bd: bd, till: s.dom });
  var tl = T('taxline'), tb = tl.reduce(function (a, g) { return a + cents(cellv(g, 1)); }, 0), tt = tl.reduce(function (a, g) { return a + cents(cellv(g, 2)); }, 0);
  check(tl.length >= 1 && tb === sub && tt === tax, 'tax lines: base ' + (tb / 100) + ' = Subtotal, tax ' + (tt / 100) + ' = Tax', { tl: tl.map(function (g) { return g.t; }) });
  var ten = T('Tendered')[0], chg = T('Change')[0], card = T('card-total')[0], amt = T('AMOUNT')[0];
  check(ten && chg && card && cents(cellv(ten, 1)) - cents(cellv(chg, 1)) + cents(cellv(card, 1)) === bd && cents(cellv(amt, 1)) === cents(cellv(card, 1)) && cents(cellv(card, 1)) === bd - cents(s.cash), 'tenders: cash tendered - change + card amount = Balance Due; the card block carries only its own part (' + (bd - cents(s.cash)) / 100 + ')', { ten: ten && ten.t, chg: chg && chg.t, card: card && card.t });
  var trx = T('Tranx ID')[0], au = T('Auth Code')[0];
  check(trx && trx.t === 'Tranx ID        : TRX-RC-0001' && au && au.t === 'Auth Code       : AUTH-RC', 'card block prints the terminal reference and approval exactly as the template (Tranx ID / Auth Code)', { trx: trx && trx.t, au: au && au.t });
  var all = G.map(function (g) { return g.t; }).join('\n');
  check(!/\d{12,19}/.test(all.replace(/[-\s]/g, '')) || !/\d{12,19}/.test(all), 'NO card number anywhere in the receipt (no 12-19 digit run)', all.match(/\d{12,19}/));
  check(!/card\s*#|card number|expir/i.test(all), 'no card number / expiry line (PCI)', all.match(/.*(card\s*#|card number|expir).*/i));
  check(!/^Printer\.Ticket/m.test(all), 'the template\'s resource-key literal "Printer.Ticket" is not printed', null);
  // ── print view: emulate print media, measure the paper
  await pg.emulateMedia({ media: 'print' });
  var pr = await pg.evaluate(function () {
    var r = document.querySelector('#receipt'), bb = r.getBoundingClientRect(), cs = getComputedStyle(r), vis = Array.prototype.filter.call(document.body.children, function (e) { return getComputedStyle(e).display !== 'none' && e.tagName !== 'SCRIPT'; }).map(function (e) { return e.id; });
    var mm = document.createElement('div'); mm.style.cssText = 'position:absolute;width:100mm;height:1px'; r.parentNode.appendChild(mm); var pxmm = mm.getBoundingClientRect().width / 100; mm.remove();
    var rf = document.querySelector('#receipt .rf'); var line = Array.prototype.reduce.call(document.querySelectorAll('#receipt .rf'), function (a, e) { var w = e.scrollWidth; return Math.max(a, w); }, 0);
    return { widthMm: Math.round(bb.width / pxmm * 10) / 10, color: cs.color, bg: cs.backgroundColor, visible: vis, widestLineMm: Math.round(line / pxmm * 10) / 10, clipped: Array.prototype.some.call(document.querySelectorAll('#receipt .rf'), function (e) { return e.scrollWidth > e.clientWidth + 1; }), changepop: getComputedStyle(document.querySelector('#changepop')).display, fs: cs.fontSize };
  });
  console.log('§RCPT_PRINT ' + J(pr));
  check(pr.widthMm >= 70 && pr.widthMm <= 80.5 && pr.visible.length === 1 && pr.visible[0] === 'u9' && !pr.clipped && pr.changepop === 'none', 'print media: only the receipt prints; its box is <= 80 mm (' + pr.widthMm + ' mm); no line is clipped; the change pop-up is hidden', pr);
  check(pr.color === 'rgb(0, 0, 0)' && pr.bg === 'rgb(255, 255, 255)', 'print: black on white', pr);
  await pg.emulateMedia({ media: 'screen' });
  var scr = await pg.evaluate(function () { var r = document.querySelector('#receipt'), cs = getComputedStyle(r); return { color: cs.color, bg: cs.backgroundColor, ff: cs.fontFamily, w: Math.round(r.getBoundingClientRect().width), chW: (function () { var c = document.createElement('span'); c.style.cssText = 'font:' + cs.font + ';position:absolute;white-space:pre'; c.textContent = new Array(43).join('0'); document.body.appendChild(c); var w = c.getBoundingClientRect().width; c.remove(); return w; })(), line: Math.max.apply(null, Array.prototype.map.call(document.querySelectorAll('#receipt .rf'), function (e) { return e.scrollWidth; })) }; });
  console.log('§RCPT_SCREEN ' + J(scr));
  check(scr.color === 'rgb(0, 0, 0)' && scr.bg === 'rgb(255, 255, 255)' && /mono/i.test(scr.ff) && scr.line <= Math.ceil(scr.chW) + 1, 'screen preview: the same render, black on white, monospace, 42 columns fit (widest line ' + scr.line + 'px <= 42 chars ' + Math.round(scr.chW) + 'px)', scr);
  // the Print button is wired (window.print called)
  await pg.evaluate(function () { window.__printed = 0; window.print = function () { window.__printed++; }; }); await pg.click('#rc-print');
  check(await pg.evaluate(function () { return window.__printed; }) === 1, 'the Print button calls the browser print once', null);
  await pg.click('#rc-ok');
  // reprint last ticket = same render
  var key1 = G.filter(function (g) { return g.f === 'Receipt'; })[0].v;
  await pg.click('#north [data-btn="Reprint Last Ticket"]'); await pg.waitForSelector('#u9.on'); var G2 = await grid(pg);
  var rk = G2.filter(function (g) { return g.f === 'Receipt'; })[0];
  check(rk && rk.v === key1 && G2.every(function (g) { return g.t.length <= W; }) && G2.filter(function (g) { return g.f === 'line'; }).length === 3, 'Reprint Last Ticket renders the same 42-column receipt for ' + key1, { key: rk && rk.v });
  await pg.close(); await pg.context().close();
  // ═══ arm 2: both themes - the paper is the same
  for (var th of ['modern', 'classic']) {
    var pt = await open(th, null); await sale(pt); var tc = await pt.evaluate(function () { var r = document.querySelector('#receipt'), cs = getComputedStyle(r), x = document.querySelector('#receipt .rf'); return { theme: document.documentElement.getAttribute('data-theme'), color: cs.color, bg: cs.backgroundColor, rf: getComputedStyle(x).color }; });
    console.log('§RCPT_THEME ' + J(tc)); check(tc.theme === th && tc.color === 'rgb(0, 0, 0)' && tc.bg === 'rgb(255, 255, 255)' && tc.rf === 'rgb(0, 0, 0)', 'theme ' + th + ': the receipt is black on white (theme-neutral like paper)', tc); await pt.context().close();
  }
  // ═══ arm 3 (W-TILL-RECEIPT-COMPANY, degrade): no company, no typed header -> no header lines, no logo, starts at Receipt:
  var p0 = await open(null, null); await sale(p0); var G0 = await grid(p0), ids0 = G0.map(function (g) { return g.f; });
  check(ids0.indexOf('header') < 0 && ids0.indexOf('header-logo') < 0 && ids0.filter(function (f) { return f !== 'blank'; })[0] === 'Receipt', 'no company, no typed header: no header lines, no logo; the first printed line is Receipt:', ids0.slice(0, 6));
  await p0.context().close();
  var p1 = await open(null, { 'tkt.header1': 'My Corner Shop', 'tkt.footer1': 'Thank you, come again', 'tkt.footer2': 'No refund without receipt' }); await sale(p1); var G1 = await grid(p1);
  var h1 = G1.filter(function (g) { return g.f === 'header'; }), fo = G1.filter(function (g) { return g.f === 'footer'; });
  check(h1.length === 1 && h1[0].t.length === 42 && h1[0].t.trim() === 'My Corner Shop' && Math.abs((h1[0].t.length - h1[0].t.trimStart().length) - (h1[0].t.length - h1[0].t.trimEnd().length)) <= 1, 'a typed Setup header line prints centred in 42', h1.map(function (g) { return g.t; }));
  check(fo.length === 2 && fo[0].t.trim() === 'Thank you, come again' && fo[0].t.length === 42 && fo[1].t === 'No refund without receipt' && G1.some(function (g) { return g.f === 'footer-rule' && g.t === new Array(43).join('='); }), 'footer1 centred + a 42 "=" rule, footer2 plain (template :198-205)', fo.map(function (g) { return g.t; }));
  await p1.context().close();
  check(errs.length === 0, '0 page errors', errs);
  await browser.close(); sv.close();
  var v = !V.j ? 'INCONCLUSIVE' : V.f ? 'FAIL' : 'PASS';
  console.log('§RCPT_VERDICT W-TILL-RECEIPT-FORMAT verdict=' + v + ' judged=' + V.j + ' failed=' + V.f + (MUT ? ' mutant=' + MUT : ''));
  process.exit(v === 'PASS' ? 0 : 1);
})().catch(function (e) { console.log('§RCPT_CRASH ' + (e && e.stack || e)); process.exit(3); });
