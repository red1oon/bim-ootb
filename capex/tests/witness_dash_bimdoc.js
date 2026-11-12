#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-DASH-BIMDOC (spec prompts/CAPEX_DASHBOARD.md §5.36B). READ THE LOG: verdict = §DASH_BIMDOC_VERDICT; the exit code is not evidence.
// THE ISSUE it proves/disproves: "the dashboard has no tile that reads BIM Document, and legacy iDempiere has no read type for it, so the twin and legacy cannot be compared on documents".
// Runs against the TEST instance ~/idempiere-bimdoc (:8108, DB idempiere_bimdoc; NEVER the pilot). It COMMITS a fixture (BIM_Document ids 9000001+, name prefix 'W-DASH-BIMDOC') through psql, reads it
// through the real web service, builds the same rows in an in-memory SQLite twin, and always deletes the fixture. Expected values are recounted from the raw rows here, independently of tiles.js.
//   D1 the read type answers and returns exactly the fixture rows (count == psql COUNT)   D2 twin tile == legacy tile for the same rows (TWIN)   D3 supersession: a deliverable with rev 1 CO and rev 2 CO counts once;
//   an inactive row and a superseded (RE) row are not deliverables   D4 tile == independent recount   D5 an entity that is unavailable prints 'no data (not installed)' (the sample snapshot, on the real page)
//   D6 VACUOUS: a project with no deliverables prints 'no data', and says INCONCLUSIVE, never 0 %.   Break: BIMDOC_BREAK=1 makes the EXPECTED count ignore supersession → D3/D4 must FAIL.
// Usage: NODE_PATH=<bim-ootb>/node_modules node capex/tests/witness_dash_bimdoc.js
'use strict';
require('./_setup_gate.js')('§DASH_BIMDOC_VERDICT');
const fs = require('fs'), path = require('path'), http = require('http'), { execFileSync } = require('child_process'), { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');
const ROOT = path.join(__dirname, '..', '..'), A = require('../adapters.js'), T = require('../tiles.js'), BREAK = process.env.BIMDOC_BREAK === '1';
const BASE = process.env.BRIDGE_BASE || 'http://localhost:8108', DB = 'idempiere_bimdoc', TODAY = '2026-11-11', log = console.log;
let judged = 0, fails = 0, inconc = 0;
const ck = (n, ok, i) => { judged++; if (!ok) fails++; log('  §DASH_BIMDOC_W ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (i !== undefined ? ' ' + JSON.stringify(i) : '')); };
const inc = (n, why) => { inconc++; log('  §DASH_BIMDOC_W ' + n + ' INCONCLUSIVE ' + why); };
const psql = (sql) => execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-U', 'adempiere', '-d', DB, '-v', 'ON_ERROR_STOP=1', '-qtA'], { input: 'SET search_path=adempiere;\n' + sql }).toString().trim();
const finish = () => { const v = judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; log('§DASH_BIMDOC_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails + ' inconclusive=' + inc_n() + (BREAK ? ' (BREAK switch ON: FAIL expected)' : '')); process.exit(v === 'PASS' ? 0 : 1); };
const inc_n = () => inconc;
// fixture: [id, project, deliverable, revision, docstatus, isactive]. Project 100 has deliverables; project 101 has none (D6).
const FIX = [[9000001, 100, 'D-001', 1, 'CO', 'Y'], [9000002, 100, 'D-001', 2, 'CO', 'Y'], [9000003, 100, 'D-002', 1, 'DR', 'Y'], [9000004, 100, 'D-003', 1, 'IP', 'Y'],
  [9000005, 100, 'D-004', 1, 'CO', 'Y'], [9000006, 100, 'D-004', 2, 'DR', 'Y'], [9000007, 100, 'D-005', 1, 'CO', 'Y'], [9000008, 100, 'D-006', 1, 'CO', 'N'], [9000009, 100, 'D-007', 1, 'RE', 'Y'], [9000010, 100, 'D-007', 2, 'CO', 'Y']];
// independent recount (the plugin's rule, bim_document.mjs computeProgress): latest revision per (project, deliverable) among active rows; issued = latest is CO. BREAK: every active row is a deliverable.
function recount(rows, proj) {
  const act = rows.filter(r => r[5] !== 'N' && r[1] === proj); if (BREAK) return { total: act.length, issued: act.filter(r => r[4] === 'CO').length };
  const lat = {}; act.forEach(r => { const c = lat[r[2]]; if (!c || r[3] > c[3] || (r[3] === c[3] && r[0] > c[0])) lat[r[2]] = r; });
  const ks = Object.keys(lat); return { total: ks.length, issued: ks.filter(k => lat[k][4] === 'CO').length };
}
(async () => {
  // a BIM_Document row must point at a real project task (FK cprojecttask_bimdocument): the fixture owns one phase + task per project, removed with the rows
  const clean = () => psql("DELETE FROM bim_document WHERE name LIKE 'W-DASH-BIMDOC%'; DELETE FROM c_projecttask WHERE name LIKE 'W-DASH-BIMDOC%'; DELETE FROM c_projectphase WHERE name LIKE 'W-DASH-BIMDOC%'");
  let legacy, twinData;
  try {
    clean();
    const dt = psql('SELECT c_doctype_id FROM c_doctype WHERE ad_client_id=11 ORDER BY 1 LIMIT 1');
    psql([100, 101].map(p => "INSERT INTO c_projectphase (c_projectphase_id,ad_client_id,ad_org_id,createdby,updatedby,c_project_id,name,seqno) VALUES (" + (9100000 + p) + ",11,11,100,100," + p + ",'W-DASH-BIMDOC phase',10);" +
      "INSERT INTO c_projecttask (c_projecttask_id,ad_client_id,ad_org_id,createdby,updatedby,c_projectphase_id,name,seqno) VALUES (" + (9200000 + p) + ",11,11,100,100," + (9100000 + p) + ",'W-DASH-BIMDOC task',10);").join('\n'));
    psql(FIX.map(r => "INSERT INTO bim_document (bim_document_id,ad_client_id,ad_org_id,isactive,created,createdby,updated,updatedby,c_doctype_id,c_project_id,c_projecttask_id,deliverableno,revision,name,docstatus,docaction,processed,hoursbudget) VALUES (" +
      [r[0], 11, 11, "'" + r[5] + "'", 'now()', 100, 'now()', 100, dt, r[1], 9200000 + r[1], "'" + r[2] + "'", r[3], "'W-DASH-BIMDOC " + r[2] + " r" + r[3] + "'", "'" + r[4] + "'", "'--'", "'N'", 10].join(',') + ');').join('\n'));
    const n = +psql("SELECT COUNT(*) FROM bim_document WHERE name LIKE 'W-DASH-BIMDOC%'"); log('§DASH_BIMDOC_W fixture committed rows=' + n);
    // ── legacy (Source B) through the real web service
    const cfg = { base: BASE, login: { user: 'GardenAdmin', pass: 'GardenAdmin', lang: 'en_US', ClientID: 11, RoleID: 102, OrgID: 11, WarehouseID: 103, stage: 0 } };
    try { legacy = await A.loadLegacy(cfg); } catch (e) { legacy = null; log('§DASH_BIMDOC_W legacy read failed: ' + e.message); }
    const have = legacy && !legacy.unavailable.includes('bimdocs') && Array.isArray(legacy.bimdocs);
    log('§DASH_BIMDOC_W legacy unavailable=[' + (legacy ? legacy.unavailable.join(',') : 'ALL') + '] bimdocs=' + (have ? legacy.bimdocs.length : 'n/a'));
    ck('D1 the read type QueryBIMDocument answers on the test instance and returns every fixture row', have && legacy.bimdocs.filter(r => /^W-DASH-BIMDOC/.test(r.Name)).length === n, { got: have ? legacy.bimdocs.length : null, want: n });
    // ── twin (Source A): the same rows in SQLite
    const SQL = await require('sql.js')();
    const db = new SQL.Database();
    db.run('CREATE TABLE C_Project (C_Project_ID INTEGER, AD_Org_ID INTEGER, Value TEXT, Name TEXT, C_Currency_ID INTEGER, IsActive TEXT, Processed TEXT)');
    db.run("INSERT INTO C_Project VALUES (100,11,'Standard','Standard',100,'Y','N'),(101,11,'Landscape','Landscape',100,'Y','N')");
    db.run('CREATE TABLE bim_document (bim_document_id INTEGER, c_project_id INTEGER, c_projectphase_id INTEGER, c_projecttask_id INTEGER, deliverableno TEXT, revision NUMERIC, docstatus TEXT, isactive TEXT, name TEXT, discipline TEXT, hoursbudget NUMERIC)');
    FIX.forEach(r => db.run('INSERT INTO bim_document VALUES (?,?,NULL,0,?,?,?,?,?,NULL,10)', [r[0], r[1], r[2], r[3], r[4], r[5], 'W-DASH-BIMDOC ' + r[2] + ' r' + r[3]]));
    twinData = A.fromSqlite(db, {});
    const f = (p) => ({ status: 'all', project: p, today: TODAY });
    const tile = (d, p) => { const x = T.compute(d, f(p)).tiles.bim_documents, fl = T.flatten(T.compute(d, f(p)).tiles).bim_documents; return { x, fl }; };
    const want = recount(FIX, 100);
    log('§DASH_BIMDOC_W independent recount project=Standard deliverables=' + want.total + ' issued=' + want.issued + (BREAK ? ' (BREAK: supersession ignored)' : ''));
    const tw = tile(twinData, 'Standard'); log('§DASH_BIMDOC twin project=Standard flat=' + tw.fl);
    ck('D4 twin tile == independent recount ' + want.issued + '/' + want.total, tw.fl === want.issued + '/' + want.total, { tile: tw.fl });
    ck('D3 supersession: D-001 (rev1 CO, rev2 CO) and D-004 (rev1 CO, rev2 DR) and D-007 (rev1 RE, rev2 CO) count once each at their LATEST revision; inactive D-006 is not a deliverable', tw.fl === '3/6' && want.total === 6 && want.issued === 3, { tile: tw.fl, recount: want.issued + '/' + want.total, want: '3/6' });
    if (have) { const lg = tile(legacy, 'Standard'); log('§DASH_BIMDOC legacy project=Standard flat=' + lg.fl); ck('D2 twin tile == legacy tile for the same rows (TWIN)', lg.fl === tw.fl, { twin: tw.fl, legacy: lg.fl }); }
    else ck('D2 twin tile == legacy tile for the same rows (TWIN)', false, 'legacy has no bimdocs');
    // D6 vacuous: project 101 has no deliverables
    const v = tile(twinData, 'Landscape'); log('§DASH_BIMDOC twin project=Landscape flat=' + v.fl);
    if (want.total === 0) inc('D4/D3', 'the fixture has no deliverables: nothing judged'); if (v.fl === 'no data') { ck('D6 an empty population prints no data, not 0/0', v.x.vacuous === true, { tile: v.fl }); } else ck('D6 an empty population prints no data, not 0/0', false, { tile: v.fl });
    // D5 unavailable entity (sample snapshot has no bimdocs): the tile says not installed
    const snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'capex/sample/pilot_snapshot.json'), 'utf8')); log('§DASH_BIMDOC_W sample snapshot has bimdocs=' + (snap.bimdocs ? snap.bimdocs.length : 'absent'));
    const sn = tile(snap, ''); log('§DASH_BIMDOC sample snapshot flat=' + sn.fl);
    ck('D5 an entity that is unavailable prints "no data (not installed)"', sn.fl === 'no data (not installed)', { tile: sn.fl });
    // D7/D5p on the REAL page (headless CPU Chromium): the tile's data-value is what the engine computes; the sample page (no BIM Document entity) says not installed
    const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream' };
    const server = http.createServer((q, r) => { if (q.url.split('?')[0].endsWith('__snap.json')) { r.writeHead(200, { 'Content-Type': 'application/json' }); return r.end(JSON.stringify(have ? legacy : {})); }
      fs.readFile(path.join(ROOT, decodeURIComponent(q.url.split('?')[0])), (e, b) => { if (e) { r.writeHead(404); return r.end('404'); } r.writeHead(200, { 'Content-Type': MIME[path.extname(q.url.split('?')[0])] || 'application/octet-stream' }); r.end(b); }); });
    await new Promise(r => server.listen(0, r)); const br = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] }), cx = await br.newContext();
    const pg = async (snap, extra) => { const p = await cx.newPage(); p.on('pageerror', e => log('§DASH_BIMDOC_W pageerror ' + String(e).slice(0, 200))); p.on('console', m => /§DASH_(SOURCE|NODATA)|rror/.test(m.text()) && log('  [console] ' + m.text().slice(0, 200))); await p.goto('http://localhost:' + server.address().port + '/capex/index.html?snapshot=' + snap + '&source=legacy&today=' + TODAY + (extra || ''), { waitUntil: 'load' }); await p.waitForFunction(() => window.__capex && window.__capex.rendered, null, { timeout: 30000 }).catch(async e => { log('§DASH_BIMDOC_W page log tail: ' + JSON.stringify(((await p.evaluate(() => window.__capexLog || [])).slice(-4)).map(x => x.slice(0, 160)))); throw e; }); await p.waitForTimeout(300); return p; };
    const tileOf = (p) => p.evaluate(() => { const e = document.querySelector('#view [data-flat="bim_documents"]'); return e ? { v: e.getAttribute('data-value'), t: e.textContent } : null; });
    let p = await pg('sample/pilot_snapshot.json'); let t = await tileOf(p);
    ck('D5p the page on a server with no BIM Document says "not installed", not 0', t && t.v === 'no data (not installed)' && /not installed/.test(t.t), t);
    if (have) { p = await pg('__snap.json', '&status=all'); await p.selectOption('#fStatus', 'all'); await p.selectOption('#fProject', 'Standard'); await p.waitForTimeout(500); t = await tileOf(p);
      ck('D7 the page tile for project Standard on the real WS data == the independent recount ' + want.issued + '/' + want.total, t && t.v === want.issued + '/' + want.total && t.t.indexOf(want.issued + ' / ' + want.total) >= 0, t); }
    await br.close(); server.close();
  } catch (e) { ck('D0 the run', false, String(e).slice(0, 200)); }
  finally { try { clean(); log('§DASH_BIMDOC_W fixture removed rows=' + psql("SELECT COUNT(*) FROM bim_document WHERE name LIKE 'W-DASH-BIMDOC%'")); } catch (e) { log('§DASH_BIMDOC_W cleanup failed ' + e.message); } }
  finish();
})();
