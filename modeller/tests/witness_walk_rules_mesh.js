#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-WALK-RULES-MESH (rule D61, prompts/DXF2BIM_FOUNDATION_LANE.md §D61). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: walking services (the left DISC rows) on a building opened from disk, e.g. a DXF2BIM convert saved as a Viewer DB, placed NOTHING: every placement was refused
 * "no LOD400 mesh" because the walk resolved meshes only against the opened building's own _geo.db, which such a building does not have (shed: 188 planned, 0 placed, 241 s).
 *   M1 PLACED    — an ARC building db opened from disk (Clinic_ARC.db, no _geo.db of its own), DISC ELEC and FP walked: placements kept with real meshes from the rules' source (lod200=0, lod300=0), committed.
 *   (the shed: MEASURED, not judged: its bands do not reconcile with any existing reference: farm reference pending, §D61)
 *   M2 STATED    — one §DW-RULES-REF line names the rules file, its standard and built_from, "not measured on this building".
 *   M3 NO WAIT   — each walk returns in < 60 s (no wait for a geometry file a local open never has).
 *   M4 FALSIFIER — (the M1 Clinic) the rules' source geometry turned off (__dwRulesMeshOff): ELEC refuses as before, 0 kept, never a box.
 *   M5 RESIDENT  — (Duplex resident) its walk does not fetch the rules' source for meshes it holds itself (no §DW-RULES-MESH line).
 * Input: the CLI-marked shed set (SHED_MARKED_DIR, local; absent -> INCONCLUSIVE). Software GL, headless.
 * Usage: NODE_PATH=<dir with better-sqlite3> node modeller/tests/witness_walk_rules_mesh.js
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer')), ROOT = path.join(__dirname, '..', '..');
const MARKED = process.env.SHED_MARKED_DIR || path.join(process.env.HOME, 'Videos/dxf2bim_film_work/why/cli/marked');
let fail = 0, judged = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { judged++; if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.db': 'application/octet-stream' };
const ARGS = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
(async () => {
  if (!fs.existsSync(MARKED) || fs.readdirSync(MARKED).filter(f => /\.dxf$/i.test(f)).length !== 9) { say('INCONCLUSIVE | the marked shed set is absent: ' + MARKED); say('SUMMARY fail=0 judged=0'); process.exit(0); }
  const files = fs.readdirSync(MARKED).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(MARKED, f)), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrm-'));
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const open = async (br, logs) => { const pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 810 }); pg.errs = [];
    pg.on('pageerror', e => { pg.errs.push(String(e).slice(0, 200)); say('§PAGEERR ' + String(e).slice(0, 200)); });
    pg.on('console', m => { const t = m.text(); if (/§DW-RULES-REF|§DW-RULES-MESH|§DW-PRIM-LOD disc=|§DW-LOD400-REFUSE|§DISC-WALK|§DW-PROV|§DW-/.test(t)) { logs.push(t); say('  ' + t.slice(0, 230)); } });
    await pg.goto(base + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 }); await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.Bonsai && window.Bonsai.exportViewerDb', { timeout: 120000 }); return pg; };
  const walk = (pg, disc) => pg.evaluate(async (disc) => { window.__dwLastCommitDisc = null; const t0 = Date.now(), n0 = window.Bonsai.oplog.length; window.discWalk(disc);
    await new Promise(r => setTimeout(r, 50)); while (window.__dwLastDoneDisc !== disc && Date.now() - t0 < 300000) await new Promise(r => setTimeout(r, 300));
    await new Promise(r => setTimeout(r, 1500)); return { ms: Date.now() - t0, ops: window.Bonsai.oplog.length - n0, committed: window.__dwLastCommitDisc === disc }; }, disc);
  // 1. the shed: convert, export the Viewer DB
  const br = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000, args: ARGS });
  let vdb;
  try { const pg = await open(br, []); await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
    const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
    await pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length===9 && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict', { timeout: 240000 }); await new Promise(r => setTimeout(r, 2500));
    await pg.evaluate(() => { const c = document.getElementById('dxf-complete'); if (c && !c.checked) c.click(); }); await new Promise(r => setTimeout(r, 800));
    await pg.click('#dxf-convert'); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 240000 }); await new Promise(r => setTimeout(r, 1500));
    const D = await pg.evaluate(async () => { const r = await window.Bonsai.exportViewerDb({ download: false }); let s = ''; for (let i = 0; i < r.bytes.length; i += 32768) s += String.fromCharCode.apply(null, r.bytes.subarray(i, i + 32768)); return s; });
    vdb = path.join(dir, 'shed_viewer.db'); fs.writeFileSync(vdb, Buffer.from(D, 'latin1')); say('INFO shed Viewer DB ' + fs.statSync(vdb).size + ' bytes');
  } finally { await br.close(); }
  // 2. a fresh profile: open it from disk, walk ELEC then FP (the DISC rows' own path), then the falsifier
  const br2 = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000, args: ARGS });
  try { const logs = [], p2 = await open(br2, logs); await p2.click('#b-open'); await p2.waitForSelector('#m-open-panel .mo-row[data-key="__local"]', { visible: true });
    const [c2] = await Promise.all([p2.waitForFileChooser(), p2.click('#m-open-panel .mo-row[data-key="__local"]')]); await c2.accept([vdb]);
    await p2.waitForFunction('!!window.__dwBuf && !!window.__arcSeedReady', { timeout: 240000 }); await p2.evaluate(async () => { await window.__arcSeedReady; }); await new Promise(r => setTimeout(r, 2000));
    const res = {}; for (const d of ['ELEC', 'FP']) res[d] = await walk(p2, d);
    say('INFO shed (measured, not judged): ELEC ' + JSON.stringify(res.ELEC) + ' FP ' + JSON.stringify(res.FP) + ' | ' + (logs.filter(t => /DATUM/.test(t)).pop() || '').slice(0, 160));
    const ref = logs.filter(t => /§DW-RULES-REF/.test(t));
    check('M2', 'the reference is stated: rules file, standard, built_from, not measured on this building', ref.length > 0 && /rules=terminal_rules\.db/.test(ref[0]) && /standard=large-complex/.test(ref[0]) && /built_from=\S/.test(ref[0]) && /not measured on this building/.test(ref[0]), (ref[0] || '(none)').slice(0, 220));
    check('M3', 'each walk returns in < 60 s (no wait for a geometry file a local open never has)', res.ELEC.ms < 60000 && res.FP.ms < 60000, `ELEC ${res.ELEC.ms} ms, FP ${res.FP.ms} ms`);
  } finally { await br2.close(); }
  // 2b. M1: an ARC building db opened from disk whose bands reconcile (Clinic_ARC.db: 7 shared frame classes) and that has no _geo.db of its own
  const brC = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000, args: ARGS });
  try { const logs = [], pc = await open(brC, logs), cdb = path.join(dir, 'clinic_local.db'); fs.copyFileSync(path.join(ROOT, 'modeller', 'Clinic_ARC.db'), cdb);
    await pc.click('#b-open'); await pc.waitForSelector('#m-open-panel .mo-row[data-key="__local"]', { visible: true });
    const [cc] = await Promise.all([pc.waitForFileChooser(), pc.click('#m-open-panel .mo-row[data-key="__local"]')]); await cc.accept([cdb]);
    await pc.waitForFunction('!!window.__dwBuf && !!window.__arcSeedReady', { timeout: 240000 }); await pc.evaluate(async () => { await window.__arcSeedReady; }); await new Promise(r => setTimeout(r, 2000));
    const res = {}; for (const d of ['ELEC', 'FP']) res[d] = await walk(pc, d);
    const lod = d => { const l = logs.filter(t => new RegExp('§DW-PRIM-LOD disc=' + d + ' ').test(t)).pop() || ''; const m = /lod400=(\d+) lod300=(\d+) lod200=(\d+)/.exec(l); return m ? { lod400: +m[1], lod300: +m[2], lod200: +m[3] } : null; };
    const L = { ELEC: lod('ELEC'), FP: lod('FP') }, mesh = logs.filter(t => /§DW-RULES-MESH/.test(t) && /resolved=[1-9]/.test(t)).length;
    check('M1', 'an ARC db opened from disk (no _geo.db): DISC ELEC and FP place real-mesh fixtures from the rules\' source (lod400 > 0, lod300 = lod200 = 0), committed as ops', ['ELEC', 'FP'].every(d => L[d] && L[d].lod400 > 0 && !L[d].lod300 && !L[d].lod200 && res[d].ops > 0) && mesh > 0 && !pc.errs.length,
      `ELEC=${JSON.stringify(Object.assign({}, res.ELEC, L.ELEC))} FP=${JSON.stringify(Object.assign({}, res.FP, L.FP))} rules_mesh_lines=${mesh} page_errors=${pc.errs.length}`);
    const n0 = logs.length; await pc.evaluate(() => { window.__dwRulesMeshOff = true; }); const off = await walk(pc, 'ELEC');
    const refused = logs.slice(n0).filter(t => /§DW-LOD400-REFUSE disc=ELEC/.test(t)).pop() || '', kept = /kept=(\d+)/.exec(refused);
    check('M4', 'falsifier (the same Clinic): the rules\' source geometry off -> ELEC refuses as before the rule (kept 0, never a box)', !!kept && +kept[1] === 0 && off.ops === 0, (refused || '(no refuse line)').slice(0, 200) + ' ' + JSON.stringify(off));
  } finally { await brC.close(); }
  // 3. a resident (Duplex): its own meshes, the rules' source never fetched for them
  const br3 = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000, args: ARGS });
  try { const logs = [], p3 = await open(br3, logs); await p3.evaluate(() => window.STRWalkerOutliner._openResident(window.STRWalkerOutliner._residents.find(r => r.key === 'Duplex')));
    await p3.waitForFunction('!!window.__dwGeoBuf', { timeout: 240000 }).catch(() => {}); await p3.evaluate(async () => { if (window.__arcSeedReady) await window.__arcSeedReady; }); await new Promise(r => setTimeout(r, 2000));
    const r3 = await walk(p3, 'ELEC'), l3 = logs.filter(t => /§DW-PRIM-LOD disc=ELEC /.test(t)).pop() || '';
    check('M5', 'a resident walks on its own meshes: no §DW-RULES-MESH fetch, real meshes placed', !logs.some(t => /§DW-RULES-MESH/.test(t)) && /lod400=[1-9]/.test(l3) && /lod200=0/.test(l3), l3.slice(0, 200) + ' ' + JSON.stringify(r3));
  } finally { await br3.close(); srv.close(); }
  say('SUMMARY fail=' + fail + ' judged=' + judged); process.exit(fail ? 1 : 0);
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
