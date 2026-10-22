// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — scope: W-VIEWERDB (prompts/DXF2BIM_FOUNDATION_LANE.md §D43, Export ▸ Viewer database). Read the § lines after EVERY run; exit code alone is not evidence.
// Issues proved/disproved: V1 the exported DB equals the Node extractor's on the same IFC (every table's row count); V2 its elements = the Convert's body count; V3 the VIEWER opens it
// ("DONE ... N elements"); V4 falsifier: the Modeller's native op-log DB of the same model does NOT (so V3 is not vacuous). Local material: the CLI-marked shed set (SHED_MARKED_DIR); absent -> SKIP / INCONCLUSIVE.
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), http = require('http');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const ROOT = path.join(__dirname, '..', '..'), BC = path.join(process.env.HOME, 'bim-compiler'), NM = path.join(BC, 'node_modules');
const MARKED = process.env.SHED_MARKED_DIR || path.join(process.env.HOME, 'Videos/dxf2bim_film_work/why/cli/marked');
let fails = 0, judged = 0; const ok = (id, c, m) => { judged++; console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.db': 'application/octet-stream' };
(async () => {
  if (!fs.existsSync(MARKED) || fs.readdirSync(MARKED).filter(f => /\.dxf$/i.test(f)).length !== 9) { console.log('§SKIP W-VIEWERDB  the marked shed set is absent (INCONCLUSIVE: nothing judged): ' + MARKED); console.log('§W-VIEWERDB INCONCLUSIVE'); process.exit(0); }
  const files = fs.readdirSync(MARKED).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(MARKED, f)), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vdb-'));
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 810 }); const errs = []; pg.on('pageerror', e => { errs.push(String(e).slice(0, 200)); console.log('§PAGEERR ' + String(e).slice(0, 200)); });
  const vlog = []; pg.on('console', m => { const t = m.text(); if (/§VIEWERDB/.test(t)) { vlog.push(t); console.log('  ' + t.slice(0, 260)); } });
  await pg.goto(base + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 }); await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.Bonsai && window.Bonsai.exportViewerDb', { timeout: 120000 });
  await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
  const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
  await pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length===9 && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict', { timeout: 240000 }); await sleep(2500);
  await pg.evaluate(() => { const c = document.getElementById('dxf-complete'); if (c && !c.checked) c.click(); }); await sleep(800);
  await pg.click('#dxf-convert'); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 240000 }); await sleep(1500);
  const nBodies = await pg.evaluate(() => window.DxfImportUI.state.last.nInserts);
  // the menu path (a real click on Export ▸ Viewer database) must be wired; the bytes come through the seam
  const menu = await pg.evaluate(() => { document.getElementById('b-export').click(); const r = document.querySelector('#m-export-panel .me-row[data-key="vdb"]'); const has = !!r; document.getElementById('b-export').click(); return has; });
  const R = await pg.evaluate(async () => { const r = await window.Bonsai.exportViewerDb({ download: false }); const nat = await window.Bonsai.exportDb({ download: false });
    const enc = b => { let s = ''; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768)); return s; };
    return { elements: r.elements, counts: r.counts, db: enc(r.bytes), ifc: enc(r.ifcBytes), native: enc(nat.bytes) }; });
  const vdb = path.join(tmp, 'viewer.db'), ifc = path.join(tmp, 'shed.ifc'), nat = path.join(tmp, 'native.db'); fs.writeFileSync(vdb, Buffer.from(R.db, 'latin1')); fs.writeFileSync(ifc, Buffer.from(R.ifc, 'latin1')); fs.writeFileSync(nat, Buffer.from(R.native, 'latin1'));
  // V1: an independent oracle: the Node extractor's DB of the SAME model made before this export existed (the 2026-10-19 shed film: ShedFilm3_extracted.db, 512 bodies). Every table's row count must match;
  // the one allowed difference is a table the extractor core gained since (door_operation: the 4 doors), where new >= old.
  const ORACLE = process.env.VDB_ORACLE || path.join(process.env.HOME, 'Videos/dxf2bim_film_work/shed/rec9/ShedFilm3_extracted.db');
  const Database = require(path.join(NM, 'better-sqlite3')), cnt = f => { const d = new Database(f, { readonly: true }), t = d.prepare("select name from sqlite_master where type='table'").all().map(r => r.name), o = {}; t.forEach(n => { try { o[n] = d.prepare('select count(*) c from "' + n + '"').get().c; } catch (e) { } }); d.close(); return o; };
  const a = cnt(vdb);
  if (fs.existsSync(ORACLE)) { const b = cnt(ORACLE), keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])), diff = keys.filter(k => a[k] !== b[k] && !(k === 'door_operation' && a[k] >= (b[k] || 0)));
    ok('V1 the exported Viewer DB equals the Node extractor\'s DB of the same shed (made before this export existed): every table, the same row count (door_operation is newer: new >= old)', keys.length > 15 && diff.length === 0, 'tables=' + keys.length + ' elements_meta=' + a.elements_meta + '/' + b.elements_meta + ' element_dxf2bim=' + a.element_dxf2bim + '/' + b.element_dxf2bim + ' door_operation=' + a.door_operation + '/' + b.door_operation + (diff.length ? ' DIFF ' + diff.map(k => k + ':' + a[k] + '/' + b[k]).join(',') : '')); }
  else console.log('§SKIP V1  the oracle DB is absent (INCONCLUSIVE for V1): ' + ORACLE);
  ok('V2 the exported DB holds the Convert\'s bodies and the menu has the item', R.elements === nBodies && a.elements_meta === nBodies && menu, 'converted=' + nBodies + ' elements_meta=' + a.elements_meta + ' menuItem=' + menu);
  // V3 / V4: the Viewer
  const dst = path.join(ROOT, 'viewer', 'buildings'), fv = path.join(dst, '_w_vdb_test.db'), fn = path.join(dst, '_w_vdb_native.db');
  fs.copyFileSync(vdb, fv); fs.copyFileSync(nat, fn);
  const viewerText = async (name, wait) => { const p = await br.newPage(); await p.setViewport({ width: 1280, height: 720 }); await p.goto(base + '/viewer/viewer.html?db=buildings/' + name, { waitUntil: 'load', timeout: 120000 }); let t = ''; for (let i = 0; i < wait; i++) { await sleep(1000); t = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 200)); if (/DONE/.test(t)) break; } await p.close(); return t; };
  const t3 = await viewerText('_w_vdb_test.db', 90), t4 = await viewerText('_w_vdb_native.db', 25);
  try { fs.unlinkSync(fv); fs.unlinkSync(fn); } catch (e) { }
  ok('V3 the Viewer opens the exported database as the building', new RegExp('DONE.*' + nBodies + ' elements').test(t3), t3.slice(0, 120));
  ok('V4 falsifier: the native op-log DB of the same model does NOT open as a building in the Viewer (V3 is not vacuous)', !/DONE/.test(t4), t4.slice(0, 120));
  console.log('  page errors=' + errs.length); await br.close(); srv.close();
  console.log('§W-VIEWERDB ' + (fails ? 'FAIL ' + fails : judged ? 'PASS' : 'INCONCLUSIVE')); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('§FAIL W-VIEWERDB crashed ' + (e && e.stack || e)); process.exit(1); });
