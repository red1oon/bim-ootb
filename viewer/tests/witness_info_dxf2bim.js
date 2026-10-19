#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-INFO-DXF2BIM (prompts/DXF2BIM_MODELLER_LANE.md §L28). Scope: the Viewer info panel's `#info-dxf2bim` block. READ THE LOG: exit code alone is not evidence.
// Issue it proves/disproves: per-mesh provenance (element_dxf2bim) is visible on pick for every shed element, and a DB without those rows (Duplex) shows no empty box.
// usage: SHED_DB=<a shed *_extracted.db with element_dxf2bim rows; default SYSNOVA/DXF2BIM/ShedDrawing/model/ShedDrawing_512_extracted.db> NODE_PATH=~/bim-compiler/node_modules node viewer/tests/witness_info_dxf2bim.js   (SKIP without the shed DB)
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..');
const Database = require('better-sqlite3');
const SHED = process.env.SHED_DB || path.join(process.env.HOME, 'Projects/SYSNOVA/DXF2BIM/ShedDrawing/model/ShedDrawing_512_extracted.db')   // the finished model (build_model.sh rebuilds it);
const DUP = path.join(ROOT, 'modeller', 'Duplex_extracted.db');
let fails = 0; const ck = (id, ok, msg) => { console.log((ok ? '§PASS ' : '§FAIL ') + id + ' ' + msg); if (!ok) fails++; };
if (!fs.existsSync(SHED)) { console.log('§SKIP W-INFO-DXF2BIM no shed DB at ' + SHED); process.exit(0); }
const box = { style: { display: 'none' }, innerHTML: '' };
global.document = { getElementById: id => id === 'info-dxf2bim' ? box : null };
const P = require(path.join(ROOT, 'viewer', 'info_dxf2bim.js'));
const A = db => ({ dbQuery: (sql, p) => db.prepare(sql).raw().all(...(p || [])) });
const log = console.log; console.log = (...a) => { if (!/^§DXF2BIM_INFO/.test(String(a[0]))) log(...a); };
const sh = new Database(SHED, { readonly: true }), a = A(sh);
const picks = sh.prepare("select m.guid g, m.ifc_class c from elements_meta m where m.ifc_class in ('IfcColumn','IfcWall','IfcBeam') group by m.ifc_class").all();
for (const p of picks) { const ok = P.render(a, p.g), row = sh.prepare("select value v from element_dxf2bim where guid=? and name='Provenance'").get(p.g);
  const sheet = sh.prepare("select value v from element_dxf2bim where guid=? and name='SourceSheet'").get(p.g);
  ck('I1', ok && box.style.display === 'block' && box.innerHTML.includes('>' + row.v + '<') && box.innerHTML.includes(String(sheet.v).replace(/&/g, '&amp;')), p.c + ' visible, Provenance=' + row.v + ' SourceSheet=' + sheet.v); }
const all = sh.prepare('select guid g from elements_meta').all(); let okn = 0, bad = 0;
for (const e of all) { const r = P.render(a, e.g), v = sh.prepare("select value v from element_dxf2bim where guid=? and name='Provenance'").get(e.g); if (r && v && box.innerHTML.includes('>' + v.v + '<')) okn++; else bad++; }
ck('I2', all.length === 512 && okn === 512 && bad === 0, 'rendered ' + okn + '/' + all.length + ' (bad ' + bad + ')');
const dp = new Database(DUP, { readonly: true }), da = A(dp), dg = dp.prepare('select guid g from elements_meta limit 3').all(); let hid = 0;
for (const e of dg) { const r = P.render(da, e.g); if (!r && box.style.display === 'none') hid++; }
ck('I3', hid === 3, 'Duplex (no element_dxf2bim rows) block hidden for ' + hid + '/3 picks');
// I4 real page
(async () => {
  const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const VDB = path.join(ROOT, 'viewer', 'buildings', 'WitnessShed_extracted.db'); fs.copyFileSync(SHED, VDB);
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    const pg = await br.newPage(); await pg.setViewport({ width: 1600, height: 900 });
    pg.on('pageerror', e => log('§PAGEERR ' + String(e).slice(0, 200)));
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/viewer/viewer.html?db=buildings/WitnessShed_extracted.db', { waitUntil: 'load', timeout: 120000 });
    await pg.waitForFunction('window.APP && window.APP.db && window.APP.dbQuery && window.ProjFold', { timeout: 240000 });
    await pg.waitForFunction(() => /DONE/.test(document.body.innerText || ''), { timeout: 240000 });
    await pg.evaluate(() => window.APP.openFindPanel('IfcWall')); await new Promise(r => setTimeout(r, 3000));
    await pg.evaluate(() => { const r = document.querySelector('.find-result-item'); if (r) r.click(); }); await new Promise(r => setTimeout(r, 3500));
    const t = await pg.evaluate(() => { const b = document.getElementById('info-dxf2bim'); return b ? { vis: getComputedStyle(b).display !== 'none', text: (b.innerText || '').replace(/\s+/g, ' ') } : null; });
    ck('I4', !!t && t.vis && /Provenance/.test(t.text) && /SourceSheet/.test(t.text), 'page Find pick: ' + JSON.stringify(t));
  } finally { await br.close(); srv.close(); try { fs.unlinkSync(VDB); } catch (e) {} }
  log('§W-INFO-DXF2BIM ' + (fails ? 'FAIL ' + fails : 'PASS'));
  process.exit(fails ? 1 : 0);
})().catch(e => { log('§FAIL I4 ' + (e && e.stack || e)); try { fs.unlinkSync(path.join(ROOT, 'viewer', 'buildings', 'WitnessShed_extracted.db')); } catch (x) {} process.exit(1); });
