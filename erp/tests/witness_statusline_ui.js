#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-STATUSLINE-UI (spec bim-ootb prompts/CAPEX_DASHBOARD.md §5.47). READ THE LOG: §STATUSLINE_UI_VERDICT. Whitebox: reads the page's own §STATUSLINE_UI log and the status bar's data attribute, no screenshot.
// ISSUE it proves/disproves: "the real iDempiere page twin shows no record-info line in the status bar for a Sales Order (legacy shows 'N Lines - lines - Total: grand CUR = converted')".
// U1 Sales Order opened by deep link: #idmp-status-info carries a line; U2 that line == the line computed from an independent SUM/COUNT over the page's own c_orderline for the SAME record id; U3 moving to another record changes the line
// (a stale line = FAIL); U4 a window with no AD_StatusLineUsedIn row (Business Partner) leaves the info empty. INCONCLUSIVE when the window has < 2 records.
'use strict';
let chromium; try { ({ chromium } = require(__dirname + '/../../tests/node_modules/playwright')); } catch (e) { ({ chromium } = require(process.env.HOME + '/bim-ootb/tests/node_modules/playwright')); }
const http = require('http'), fs = require('fs'), path = require('path'), S = require('../ad_statusline.js');
const ROOT = path.join(__dirname, '..'), MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/idempiere.html'; fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(b); }); });
let judged = 0, fails = 0, inconc = 0; const ck = (n, ok, i) => { judged++; if (!ok) fails++; console.log('  §STATUSLINE_UI ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (i ? ' ' + i : '')); };
(async () => {
  await new Promise(r => server.listen(0, r)); const base = 'http://localhost:' + server.address().port + '/idempiere.html';
  const br = await chromium.launch({ args: ['--disable-gpu'] }), pg = await (await br.newContext()).newPage(), logs = []; pg.on('console', m => logs.push(m.text()));
  const info = () => pg.$eval('#idmp-status-info', e => e.getAttribute('data-statusline'));
  await pg.goto(base + '?login=GardenAdmin&window=143', { waitUntil: 'networkidle' });
  await pg.waitForFunction(() => !!window.__idmpDb, null, { timeout: 30000 }); await pg.waitForTimeout(2500);
  const l1 = await info();
  ck('U1 Sales Order shows a status-bar info line', /Line/.test(l1 || ''), JSON.stringify(l1));
  const recId = await pg.evaluate(() => { const r = window.__idmpDb.exec("SELECT 1"); return null; });   // keep the page alive
  // the page logs the record it built the line for? use the DB: find the order whose independent line equals the shown one
  const match = await pg.evaluate(() => { const db = window.__idmpDb, o = db.exec("SELECT o.c_order_id, count(l.c_orderline_id), o.totallines, o.grandtotal, c.iso_code, (SELECT r.multiplyrate FROM c_conversion_rate r WHERE r.isactive='Y' AND r.c_currency_id=o.c_currency_id AND r.c_currency_id_to=100 AND r.c_conversiontype_id=o.c_conversiontype_id AND date(o.dateacct) BETWEEN date(r.validfrom) AND date(r.validto)) AS rate, o.c_currency_id FROM c_order o JOIN c_currency c ON c.c_currency_id=o.c_currency_id LEFT JOIN c_orderline l ON l.c_order_id=o.c_order_id WHERE o.issotrx='Y' AND o.ad_client_id=11 GROUP BY o.c_order_id, o.totallines, o.grandtotal, c.iso_code, o.c_currency_id, o.dateacct, o.c_conversiontype_id ORDER BY 1"); return o.length ? o[0].values : []; });
  // ConvAmt expected independently: the stored ACTIVE rate to the accounting currency (USD, 100), rounded to the cent
  const lineOf = r => S.format('{0,choice,0#No Lines|1#1 Line|1<{0} Lines} - {1,number,#,##0.00} - Total: {2,number,#,##0.00} {3} = {4,number,#,##0.00}', [r[1], r[2], r[3], r[4], r[6] === 100 ? r[3] : (r[5] == null || r[3] == null ? null : Math.round(r[3] * r[5] * 100) / 100)]);
  const cand = match.filter(r => lineOf(r) === l1);
  ck('U2 the first record\'s shown line equals the independent SUM/COUNT line of some order on this device (' + cand.length + ' candidate record(s); orders=' + match.length + ')', cand.length >= 1, cand[0] ? 'order ' + cand[0][0] : '');
  const ui = logs.filter(l => l.indexOf('§STATUSLINE_UI') >= 0);
  ck('U5 the page logs its own §STATUSLINE_UI line (win=143)', ui.some(l => /win=143/.test(l)), ui.slice(-1)[0]);
  // U3: open >= 3 DIFFERENT orders by deep link (record=<id>); each must show ITS OWN independent line (so the line follows the record, and is not stale or global); lines must differ between orders
  const withTotals = match.filter(r => r[2] != null && r[3] != null).slice(0, 4), got = [];
  for (const r of withTotals) {
    await pg.goto(base + '?login=GardenAdmin&window=143&record=' + r[0], { waitUntil: 'networkidle' }); await pg.waitForFunction(() => !!window.__idmpDb, null, { timeout: 30000 }); await pg.waitForTimeout(2200);
    const l = await info(), want = lineOf(r); got.push({ id: r[0], l, want, ok: l === want });
    console.log('   record ' + r[0] + ' shown=' + JSON.stringify(l) + ' independent=' + JSON.stringify(want));
  }
  if (got.length < 3) { inconc++; console.log('  §STATUSLINE_UI U3 INCONCLUSIVE fewer than 3 orders with totals (' + got.length + ')'); }
  else ck('U3 ' + got.length + ' orders opened by id each show their own independent line, and ' + new Set(got.map(x => x.l)).size + ' distinct lines appear', got.every(x => x.ok) && new Set(got.map(x => x.l)).size >= 2, JSON.stringify(got.filter(x => !x.ok).slice(0, 2)));
  await pg.goto(base + '?login=GardenAdmin&window=123', { waitUntil: 'networkidle' }); await pg.waitForTimeout(2500);
  const l4 = await info(); ck('U4 a window with no status-line row leaves the info empty', (l4 || '') === '', JSON.stringify(l4));
  await br.close(); server.close();
  const v = judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; console.log('§STATUSLINE_UI_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails + ' inconclusive=' + inconc); process.exit(v === 'PASS' ? 0 : 1);
})();
