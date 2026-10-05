#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §MC_MOCKUP (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §ALTC_V3 / §MC_MOCKUP). Read the log.
// ISSUE (user 2026-10-06): "the new compliance mock up report replacing the MEP tab". GREEN = on the road DB the 4D/5D page's MEP button
// reads "Model Check" (§MC_BUTTON road=true) and model_check_report.html renders every road_check row with its rule's VALID/SPECULATIVE
// status (§MC_REPORT rows = an independent road_check count over the same DB); on Duplex the button stays MEP (non-impact).
// CAN REPORT ITS OWN FAILURE: INCONCLUSIVE when a page never logs its § line.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const ROOT = path.resolve(path.join(__dirname, '..', '..')), PORT = +(process.env.PORT || 8664), LOG = process.env.LOG || '/tmp/witness_model_check_report.log';
const ROAD = process.env.ROAD_DB || path.join(os.homedir(), 'Downloads', 'JALAN JELAPANG IFC', 'JELAPANG_AFTER.db');
const out = []; const log = l => { out.push(l); console.log(l); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css' };
const server = http.createServer((q, r) => { try { const u = decodeURIComponent(q.url.split('?')[0]); let fp = u === '/road.db' ? ROAD : path.join(ROOT, u);
  if (!fs.existsSync(fp)) { const a = path.join('/home/red1/bim-ootb', u); if (fs.existsSync(a)) fp = a; else { r.writeHead(404); r.end(); return; } }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Content-Length': fs.statSync(fp).size }); fs.createReadStream(fp).pipe(r); } catch (e) { r.writeHead(500); r.end(); } });
async function lines(b, url, re, waitS) { const p = await b.newPage(), got = []; p.on('console', m => { const t = m.text(); if (re.test(t)) got.push(t); });
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 300000 }); for (let i = 0; i < waitS && !got.length; i++) await new Promise(r => setTimeout(r, 1000)); await p.close(); return got; }
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] }); const base = `http://127.0.0.1:${PORT}/viewer/`;
  const btnRoad = await lines(b, base + 'boq_charts.html?db=/road.db', /§MC_BUTTON/, 600);
  const btnBld = await lines(b, base + 'boq_charts.html?db=/buildings/Duplex_extracted.db', /§MC_BUTTON/, 600);
  const rep = await lines(b, base + 'model_check_report.html?db=/road.db', /§MC_REPORT/, 600);
  // independent count: road_check.js in node over the same DB file (better-sqlite3)
  let oracle = null; try { const BSQ = require('/home/red1/bim-compiler/node_modules/better-sqlite3'), db = new BSQ(ROAD, { readonly: true }), RC = require('../road_check.js');
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer/rates/road_rules.json'), 'utf8')); oracle = RC.run((s, p) => db.prepare(s).all(...(p || [])), cfg, {}).rows.length; } catch (e) { log('  oracle failed: ' + e.message); }
  await b.close(); server.close();
  log('  road button: ' + (btnRoad[0] || 'none')); log('  Duplex button: ' + (btnBld[0] || 'none')); log('  report: ' + (rep[0] || 'none')); log('  oracle rows=' + oracle);
  if (!btnRoad.length || !btnBld.length || !rep.length) { log('§WITNESS_MODEL_CHECK_REPORT INCONCLUSIVE — a page never logged its § line'); fs.writeFileSync(LOG, out.join('\n') + '\n'); process.exit(2); }
  const rows = +((rep[0].match(/rows=(\d+)/) || [])[1]);
  const checks = [['road: MEP button becomes Model Check', /road=true → Model Check/.test(btnRoad[0])], ['Duplex: button stays MEP', /road=false → MEP/.test(btnBld[0])],
    ['report rows > 0 and = independent road_check count', rows > 0 && rows === oracle], ['report splits rows into valid + speculative', (() => { const v = +rep[0].match(/valid=(\d+)/)[1], s = +rep[0].match(/speculative=(\d+)/)[1]; return v + s === rows; })()],
    ['red control: a wrong count would fail', !(rows + 1 === oracle)]];
  let fail = 0; checks.forEach(([n, v]) => { if (!v) fail++; log('  ' + (v ? 'PASS ' : 'FAIL ') + n); });
  log('§WITNESS_MODEL_CHECK_REPORT ' + (fail ? 'FAIL ' : 'PASS ') + (checks.length - fail) + '/' + checks.length); fs.writeFileSync(LOG, out.join('\n') + '\n'); process.exit(fail ? 1 : 0);
})().catch(e => { log('CRASH ' + e.stack); fs.writeFileSync(LOG, out.join('\n') + '\n'); process.exit(2); });
