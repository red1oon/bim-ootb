#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-DASH-LEGACY-LINK (spec prompts/CAPEX_DASHBOARD.md §5.79). READ THE LOG: verdict = §DASH_LEGACY_LINK_VERDICT; the exit code alone is not evidence; 0 links judged = INCONCLUSIVE.
// ISSUE it proves/disproves: "on the legacy source every 'ERP ↗' / document link opens http://localhost:8088 (the developer's pilot), whatever server the rows were read from" (found by the UAT dry run, §5.78 D5:
// the read job ran against :8108 and the drill rows still pointed at :8088). The older witnesses (W-DASH-DRILL K5c, W-CHAIN C5, W-PROJECT-PAGE P9) judge only the query part of the link, never its host: scope-blind for this.
//   L1 a snapshot whose meta.base is X: every project link in the drill panel starts with X/webui/index.zul?Action=Zoom&TableName=C_Project&Record_ID=<that row's id>
//   L2 the same on a project page: its "ERP ↗" link and every Supply chain document link start with X (INCONCLUSIVE when the sample has no project with documents)
//   L3 an explicit CAPEX_CFG.legacyUi wins over the snapshot's base
//   L4 a snapshot with no meta.base keeps the default (the page still gives a link; §DASH_LEGACY_UI names from=default)
// LINK_BREAK=1 gives the page a snapshot with NO meta.base while still expecting X: L1 must FAIL.
// The real page (capex/index.html?source=legacy) in a throw-away headless profile, software GL; the snapshot is the committed sample with its meta.base replaced, served by request interception. Nothing is written.
// Usage: node capex/tests/witness_dash_legacy_link.js   (puppeteer from ~/bim-compiler/node_modules)
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require(path.join(os.homedir(), 'bim-compiler', 'node_modules', 'puppeteer'));
const ROOT = path.join(__dirname, '..', '..'), BREAK = process.env.LINK_BREAK === '1', X = 'http://erp.client.invalid:8443', CFGUI = 'http://configured.invalid/webui/index.zul', log = console.log;
let judged = 0, fails = 0, inc = 0;
const ck = (n, ok, i) => { judged++; if (!ok) fails++; log('  §DASH_LEGACY_LINK ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (i !== undefined ? ' ' + JSON.stringify(i) : '')); };
const skip = (n, w) => { inc++; log('  §DASH_LEGACY_LINK ' + n + ' INCONCLUSIVE ' + w); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.db': 'application/octet-stream', '.png': 'image/png', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const sample = JSON.parse(fs.readFileSync(path.join(ROOT, 'capex/sample/pilot_snapshot.json'), 'utf8'));
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'wdll-')), br = await puppeteer.launch({ headless: 'new', userDataDir: prof, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  // one page per case: the snapshot the page fetches is the sample with meta.base set (or removed); cfg = an explicit CAPEX_CFG.legacyUi
  const open = async (metaBase, cfg, hash, docs) => { const pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 900 }); const lines = []; pg.on('pageerror', e => log('  §PAGEERR ' + String(e.message).slice(0, 160))); pg.on('console', m => { const t = m.text(); if (/§DASH_LEGACY_UI|§DASH_SOURCE legacy/.test(t)) lines.push(t); });
    if (cfg) await pg.evaluateOnNewDocument(u => { window.CAPEX_CFG = { legacyUi: u }; }, cfg);
    await pg.setRequestInterception(true); pg.on('request', r => { if (/\/capex\/legacy_snapshot\.json/.test(r.url())) { const j = JSON.parse(JSON.stringify(sample)); j.meta = Object.assign({}, j.meta); if (metaBase) j.meta.base = metaBase; else delete j.meta.base; if (docs) Object.assign(j, docs); r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(j) }); } else r.continue(); });
    await pg.goto(base + '/capex/index.html?source=legacy' + (hash || ''), { waitUntil: 'networkidle2', timeout: 120000 }); await sleep(2500); return { pg, lines }; };
  const drillLinks = async pg => { await pg.waitForSelector('[data-drill="total_projects"]', { timeout: 30000 }); await pg.click('[data-drill="total_projects"]'); await sleep(1200); return pg.$$eval('#drill tbody tr', trs => trs.map(tr => { const a = tr.querySelector('a.erp'), p = tr.querySelector('a[href^="#project/"]'); return a && p ? [p.getAttribute('href').replace('#project/', ''), a.getAttribute('href')] : null; }).filter(Boolean)); };
  // L1
  const c1 = await open(BREAK ? null : X), l1 = await drillLinks(c1.pg), bad1 = l1.filter(l => l[1] !== X + '/webui/index.zul?Action=Zoom&TableName=C_Project&Record_ID=' + l[0]);
  log('  ' + (c1.lines.find(t => /§DASH_LEGACY_UI/.test(t)) || '(no §DASH_LEGACY_UI line)'));
  if (!l1.length) skip('L1', 'the drill panel listed no project link'); else ck('L1 every project link in the drill opens the server the snapshot was read from (' + l1.length + ' links' + (BREAK ? ', BREAK: the snapshot carries no base' : '') + ')', bad1.length === 0, bad1.slice(0, 2));
  // L2: the sample holds no purchase documents, so one order with its receipt, invoice and payment is put on its first project (row shapes = the read job's, capex/adapters.js COLS)
  const pid = sample.projects[0].C_Project_ID, docs = { orders: [{ C_Order_ID: 9000001, C_Project_ID: pid, GrandTotal: 100, C_Currency_ID: sample.projects[0].C_Currency_ID, IsSOTrx: 'N', DocStatus: 'CO' }], receipts: [{ M_InOut_ID: 9000002, C_Project_ID: pid, C_Order_ID: 9000001, IsSOTrx: 'N', DocStatus: 'CO', MovementDate: '2026-11-14 00:00:00' }],
    vinvoices: [{ C_Invoice_ID: 9000003, C_Project_ID: pid, C_Order_ID: 9000001, GrandTotal: 100, C_Currency_ID: sample.projects[0].C_Currency_ID, IsSOTrx: 'N', DocStatus: 'CO' }], payments: [{ C_Payment_ID: 9000004, C_Project_ID: pid, C_Order_ID: null, C_Invoice_ID: 9000003, PayAmt: 100, C_Currency_ID: sample.projects[0].C_Currency_ID, IsReceipt: 'N', DocStatus: 'CO' }] };
  { const c2 = await open(X, null, '#project/' + pid, docs); await sleep(1500); await c2.pg.evaluate(() => { const e = document.querySelector('[data-tab="procurement"]'); if (e) e.click(); }); await sleep(1200);
    const hrefs = await c2.pg.$$eval('a[href*="Action=Zoom"]', a => a.map(x => x.getAttribute('href'))), bad2 = hrefs.filter(h => h.indexOf(X + '/webui/index.zul?Action=Zoom&TableName=') !== 0), tabs = Array.from(new Set(hrefs.map(h => (h.match(/TableName=([A-Za-z_]+)/) || [])[1])));
    if (tabs.length < 4) skip('L2', 'the project page showed links for ' + tabs.join(',') + ' only (' + hrefs.length + ' links)'); else ck('L2 the project page: every record and document link opens that server (' + hrefs.length + ' links, tables ' + tabs.join(',') + ')', bad2.length === 0, bad2.slice(0, 2)); await c2.pg.close(); }
  // L3
  const c3 = await open(X, CFGUI), l3 = await drillLinks(c3.pg), bad3 = l3.filter(l => l[1].indexOf(CFGUI + '?Action=Zoom') !== 0);
  if (!l3.length) skip('L3', 'no link'); else ck('L3 an explicit CAPEX_CFG.legacyUi wins over the snapshot base (' + l3.length + ' links)', bad3.length === 0 && c3.lines.some(t => /from=config/.test(t)), bad3.slice(0, 1));
  // L4
  const c4 = await open(null), l4 = await drillLinks(c4.pg);
  if (!l4.length) skip('L4', 'no link'); else ck('L4 a snapshot with no base keeps the default and says so', l4.every(l => /^https?:\/\/[^/]+\/webui\/index\.zul\?Action=Zoom/.test(l[1])) && c4.lines.some(t => /from=default/.test(t)), [l4[0][1].slice(0, 60), (c4.lines.find(t => /§DASH_LEGACY_UI/.test(t)) || '').slice(0, 80)]);
  await br.close(); srv.close(); try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {}
  log('§DASH_LEGACY_LINK_VERDICT ' + (fails ? 'FAIL' : judged ? 'PASS' : 'INCONCLUSIVE') + ' judged=' + judged + ' fail=' + fails + ' inconclusive=' + inc + (BREAK ? ' (BREAK)' : '')); process.exit(fails || !judged ? 1 : 0);
})().catch(e => { log('§DASH_LEGACY_LINK harness ' + (e && e.stack || e)); process.exit(1); });
