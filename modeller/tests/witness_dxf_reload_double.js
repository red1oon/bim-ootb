#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-DXF-RELOAD-DOUBLE (prompts/DXF2BIM_MODELLER_LANE.md §L35). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: a reload lost a converted model (op-log restored, scene empty, only a console warning), and a second Convert built a second identical building exactly on top of the first.
//   R1 reload: the same mesh count, no restore failure, the status says restored      R2 the IFC after the reload = before it
//   G1 Convert again in the session: refused, oplog stays, the status says how to go on      G2 reload, reopen, Convert: refused      G3 Ctrl+Z after a reload removes the Convert whole; Convert builds it once
//   N a Native .db taken to a fresh profile: the model appears      O a model saved before the fix (no geom_assets): the failure is stated, Ctrl+Z clears it, Convert works
// Must fail R1 and G1 on a tree without the fix (run with WITNESS_ROOT=<old tree>). VACUOUS (exit 2) when the shed sheets are missing, or the first Convert builds nothing. CPU GL only.
// usage: NODE_PATH=~/bim-compiler/node_modules [WITNESS_ROOT=<tree>] node modeller/tests/witness_dxf_reload_double.js
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const ROOT = process.env.WITNESS_ROOT || path.join(__dirname, '..', '..'), SHED = process.env.SHED_MARKED_DIR || path.join(os.homedir(), 'Videos', 'dxf2bim_film_work', 'why', 'cli', 'marked');
let fails = 0, judged = 0; const ok = (id, c, m) => { judged++; console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms)), list = d => fs.readdirSync(d).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(d, f));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const GL = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
(async () => {
  if (!fs.existsSync(SHED) || list(SHED).length !== 9) { console.log('§VACUOUS the 9 marked shed sheets are missing: ' + SHED); process.exit(2); }
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); }); await new Promise(z => srv.listen(0, '127.0.0.1', z));
  const U = 'http://127.0.0.1:' + srv.address().port + '/modeller/modeller.html', errs = [], logs = [];
  const profile = async () => { const UDD = fs.mkdtempSync(path.join(process.env.WITNESS_TMP || os.tmpdir(), 'reload-')); const br = await puppeteer.launch({ headless: 'new', userDataDir: UDD, protocolTimeout: 600000, args: GL }); const pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 810 }); pg.on('pageerror', e => errs.push(String(e).slice(0, 200))); pg.on('console', m => { const t = m.text(); logs.push(t); if (/GEOM-ASSETS|restore fail|REFUSED already|§OPLOG restored/.test(t)) console.log('  ' + t.slice(0, 170)); }); return { br, pg, done: async () => { await br.close(); fs.rmSync(UDD, { recursive: true, force: true }); } }; };
  const ready = async pg => { await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.Bonsai && window.__restoreDone===true', { timeout: 180000 }); await sleep(2500); };
  const go = async pg => { await pg.goto(U, { waitUntil: 'load', timeout: 120000 }); await ready(pg); };
  const reload = async pg => { await pg.reload({ waitUntil: 'load', timeout: 120000 }); await ready(pg); };
  const open = async pg => { await pg.evaluate(() => { window.DxfImportUI.state.arrangeOnOpen = false; document.getElementById('b-open').click(); }); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true }); const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(list(SHED)); await pg.waitForFunction('window.DxfImportUI.state.gate && window.DxfMetaEditor && !window.DxfMetaEditor.state.busy && document.getElementById("dxf-convert")', { timeout: 180000 }); await sleep(1200); };
  const convert = async pg => { await pg.evaluate(() => { window.__l0 = window.DxfImportUI.state.last; document.getElementById('dxf-convert').click(); }); await pg.waitForFunction(() => { const U = window.DxfImportUI.state, s = document.getElementById('dxf-status'); return (U.last && U.last !== window.__l0) || (s && /Convert (failed|refused)/.test(s.textContent)); }, { timeout: 240000 }).catch(() => {}); await sleep(2500); };
  const st = pg => pg.evaluate(() => { let n = 0; window.A.scene.traverse(o => { if (o.isMesh && o.geometry && o.visible && o.type === 'Mesh') n++; }); return { oplog: window.Bonsai.oplog.length, meshes: n, status: ((document.getElementById('dxf-status') || {}).textContent || '').slice(0, 130), stat: ((document.getElementById('stat') || {}).textContent || '').slice(0, 110) }; });
  const ifc = async pg => { await pg.evaluate(() => { document.getElementById('stat').textContent = ''; document.getElementById('b-export').click(); }); await pg.waitForSelector('.me-row[data-key="ifc"]', { visible: true }); await pg.evaluate(() => document.querySelector('.me-row[data-key="ifc"]').click()); await pg.waitForFunction(() => /IFC exported|FAIL /.test(document.getElementById('stat').textContent), { timeout: 240000 }).catch(() => {}); return pg.evaluate(() => document.getElementById('stat').textContent.slice(0, 100)); };
  // ---- one profile: R, G
  let P = await profile(), pg = P.pg; await go(pg); await open(pg); await convert(pg); const a = await st(pg); console.log('§FIRST ' + JSON.stringify(a));
  if (a.oplog !== 446) { console.log('§VACUOUS the first Convert did not build the shed'); process.exit(2); }
  const i0 = await ifc(pg);
  await convert(pg); const g1 = await st(pg); ok('G1 Convert again in the session is refused, the model stays one building, the status says how to go on', g1.oplog === 446 && g1.meshes === a.meshes && /already in the model/.test(g1.status) && /Ctrl\+Z/.test(g1.status), JSON.stringify(g1));
  logs.length = 0; await reload(pg); const r = await st(pg), failed = logs.some(l => /restore fail/.test(l));
  ok('R1 a reload brings the converted model back: same meshes, no restore failure, the status says restored', r.oplog === 446 && r.meshes === a.meshes && !failed && /restored 446/.test(r.stat), JSON.stringify(r) + ' restoreFail=' + failed);
  const i1 = await ifc(pg); const sz = t => (t.match(/(\d+) bytes/) || [])[1]; ok('R2 the IFC after the reload is the same size as before it', sz(i0) && sz(i0) === sz(i1), i0 + ' | ' + i1);
  await open(pg); await convert(pg); const g2 = await st(pg); ok('G2 reload, reopen, Convert: refused, one building', g2.oplog === 446 && /already in the model/.test(g2.status), JSON.stringify(g2));
  await pg.keyboard.down('Control'); await pg.keyboard.press('z'); await pg.keyboard.up('Control'); await sleep(3000); const z = await st(pg); await pg.keyboard.down('Control'); await pg.keyboard.press('y'); await pg.keyboard.up('Control'); await sleep(3000); const y = await st(pg); await pg.keyboard.down('Control'); await pg.keyboard.press('z'); await pg.keyboard.up('Control'); await sleep(3000); await convert(pg); const g3 = await st(pg);
  ok('G3 after a reload Ctrl+Z removes the Convert whole, Ctrl+Y brings it back; Ctrl+Z and Convert build it once', z.oplog === 0 && y.oplog === 446 && y.meshes === a.meshes && g3.oplog === 446 && g3.meshes === a.meshes, 'after undo ' + z.oplog + ' redo ' + y.oplog + '/' + y.meshes + ' after convert ' + JSON.stringify(g3));
  // ---- Native .db to a fresh profile
  const b64 = await pg.evaluate(async () => { const r = await window.Bonsai.exportDb({ download: false }); let s = ''; const B = r.bytes, C = 0x8000; for (let i = 0; i < B.length; i += C) s += String.fromCharCode.apply(null, B.subarray(i, i + C)); return btoa(s); }); await P.done();
  P = await profile(); pg = P.pg; await go(pg); const n = await pg.evaluate(async b => { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); const r = await window.Bonsai.oplog.importBytes(u); return r; }, b64); await sleep(2500); const ns = await st(pg);
  ok('N a Native .db in a fresh profile: the model appears, with its chain verified', n.verify && ns.oplog === 446 && ns.meshes === a.meshes, JSON.stringify(n) + ' ' + JSON.stringify(ns) + ' db bytes=' + Math.round(b64.length * 0.75)); 
  // ---- a model saved before the fix: no geom_assets
  await pg.evaluate(() => { const O = window.Bonsai.oplog; O.db.run('DROP TABLE geom_assets'); O._save(); }); logs.length = 0; await reload(pg); const o1 = await st(pg);
  await pg.keyboard.down('Control'); await pg.keyboard.press('z'); await pg.keyboard.up('Control'); await sleep(3000); const o2 = await st(pg); await open(pg); await convert(pg); const o3 = await st(pg);
  ok('O a model saved before the fix: the failure is on screen, Ctrl+Z clears it, Convert builds it', /could not be rebuilt/.test(o1.stat) && o2.oplog === 0 && o3.oplog === 446 && o3.meshes === a.meshes, JSON.stringify([o1.stat, o2.oplog, o3.oplog, o3.meshes])); await P.done();
  ok('E 0 page errors', errs.length === 0, errs.join(' | ').slice(0, 300));
  console.log('§RESULT judged=' + judged + ' fails=' + fails + ' ' + (fails ? 'FAIL' : 'PASS')); srv.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('§ERROR ' + String(e && e.stack || e).slice(0, 500)); process.exit(3); });
