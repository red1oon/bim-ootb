#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-STR-GIRDER-Z (rule D63, prompts/DXF2BIM_FOUNDATION_LANE.md §D63). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: the STR walk derived its girders at "mean column centre + half the median column height"; on a building with two column populations (the shed: piers + posts)
 * that put 46 girders at 1.00 m, a lattice through the middle of the shed, while the shed's own beams sit at 3.099 m.
 *   G1 SHED      — the reopened shed (its Viewer DB from disk): every derived girder's underside = 3.099 m (its beams' underside), §STRWALK-RENDER says snapped.
 *   G2 GARAGE    — HospitalGarage (resident, its own beams): girderZ = one of its beam undersides, the nearest to the rule (in-app 184.99 -> 185.07): a move of < 0.1 m.
 *   G3 NO BEAMS  — Hospital (349 STR columns, no source beams): the rule, unchanged ("rule: no source beams").
 *   G4 SAME      — the shed's girders keep their count (46), section (0.254 x 0.305) and provenance derived:str-walk.
 * Input: the CLI-marked shed set (SHED_MARKED_DIR, local; absent -> INCONCLUSIVE for G1/G4). Software GL, headless.
 * Usage: NODE_PATH=<dir with better-sqlite3> node modeller/tests/witness_str_girder_z.js
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer')), ROOT = path.join(__dirname, '..', '..');
const MARKED = process.env.SHED_MARKED_DIR || path.join(process.env.HOME, 'Videos/dxf2bim_film_work/why/cli/marked');
let fail = 0, judged = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { judged++; if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.db': 'application/octet-stream' };
const ARGS = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
(async () => {
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wgz-'));
  const open = async (br, logs) => { const pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 810 }); pg.errs = [];
    pg.on('pageerror', e => { pg.errs.push(String(e).slice(0, 200)); say('§PAGEERR ' + String(e).slice(0, 200)); }); pg.on('console', m => { const t = m.text(); if (/§STRWALK-RENDER|§STRWALK-INIT/.test(t)) { logs.push(t); say('  ' + t.slice(0, 220)); } });
    await pg.goto(base + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 }); await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.Bonsai && window.Bonsai.exportViewerDb', { timeout: 120000 }); return pg; };
  const girders = pg => pg.evaluate(() => { const G = window.Bonsai.group(), T = window.THREE, out = []; window.Bonsai.oplog._geomOps().forEach(o => { const P = o.params || (typeof o.parameters === 'string' ? JSON.parse(o.parameters) : o.parameters) || {};
      if (P.ifc_class !== 'IfcBeam' || P.provenance !== 'derived:str-walk') return; const m = G.children.find(x => x.isMesh && x.userData && x.userData.featureId === o.id); if (!m) return; const b = new T.Box3().setFromObject(m); out.push({ z0: b.min.z, z1: b.max.z }); }); return out; });
  const render = logs => { const l = logs.filter(t => /§STRWALK-RENDER columns=/.test(t)).pop() || ''; const m = /girders=(\d+) section=([\d.]+)×([\d.]+)m.*girderZ=([-\d.]+)/.exec(l); return m ? { n: +m[1], w: +m[2], d: +m[3], z: +m[4], snapped: /snapped/.test(l), rule: (/rule ([-\d.]+)/.exec(l) || [])[1], noBeams: /no source beams/.test(l), line: l.slice(0, 200) } : null; };
  // G1 / G4: the shed
  if (fs.existsSync(MARKED) && fs.readdirSync(MARKED).filter(f => /\.dxf$/i.test(f)).length === 9) {
    const files = fs.readdirSync(MARKED).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(MARKED, f)); let vdb;
    const br = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000, args: ARGS });
    try { const pg = await open(br, []); await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
      const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
      await pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length===9 && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict', { timeout: 240000 }); await new Promise(r => setTimeout(r, 2500));
      await pg.evaluate(() => { const c = document.getElementById('dxf-complete'); if (c && !c.checked) c.click(); }); await new Promise(r => setTimeout(r, 800));
      await pg.click('#dxf-convert'); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 240000 }); await new Promise(r => setTimeout(r, 1500));
      const D = await pg.evaluate(async () => { const r = await window.Bonsai.exportViewerDb({ download: false }); let s = ''; for (let i = 0; i < r.bytes.length; i += 32768) s += String.fromCharCode.apply(null, r.bytes.subarray(i, i + 32768)); return s; });
      vdb = path.join(dir, 'SHED_extracted.db'); fs.writeFileSync(vdb, Buffer.from(D, 'latin1'));
    } finally { await br.close(); }
    const Database = require(path.join(process.env.HOME, 'bim-compiler/node_modules/better-sqlite3')), d = new Database(vdb, { readonly: true });
    const under = d.prepare("SELECT t.center_z - t.bbox_z/2 z FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid WHERE m.discipline='STR' AND m.ifc_class='IfcBeam'").all().map(r => r.z); d.close();
    const br2 = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000, args: ARGS });
    try { const logs = [], p2 = await open(br2, logs); await p2.click('#b-open'); await p2.waitForSelector('#m-open-panel .mo-row[data-key="__local"]', { visible: true });
      const [c2] = await Promise.all([p2.waitForFileChooser(), p2.click('#m-open-panel .mo-row[data-key="__local"]')]); await c2.accept([vdb]);
      await p2.waitForFunction('!!window.__dwBuf && !!window.__arcSeedReady', { timeout: 240000 }); await p2.evaluate(async () => { await window.__arcSeedReady; }); await new Promise(r => setTimeout(r, 3000));
      const R = render(logs), g = await girders(p2), uMin = Math.min(...under), uMax = Math.max(...under);
      check('G1', 'the reopened shed: every derived girder\'s underside = the shed\'s own beam underside, snapped (not the 1.00 m rule)', !!R && R.snapped && g.length > 0 && g.every(x => x.z0 >= uMin - 0.01 && x.z0 <= uMax + 0.01) && Math.abs(R.z - 1.0) > 1,
        `girderZ=${R && R.z} rule=${R && R.rule} beam undersides ${uMin.toFixed(3)}..${uMax.toFixed(3)} girder z0 ${g.length ? Math.min(...g.map(x => x.z0)).toFixed(3) + '..' + Math.max(...g.map(x => x.z0)).toFixed(3) : 'none'}`);
      check('G4', 'count, section and provenance unchanged: 46 girders, 0.254 x 0.305, derived:str-walk', !!R && R.n === 46 && g.length === 46 && Math.abs(R.w - 0.254) < 0.001 && Math.abs(R.d - 0.305) < 0.001 && !p2.errs.length, (R && R.line) + ' meshes=' + g.length);
    } finally { await br2.close(); }
  } else say('INCONCLUSIVE G1/G4 | the marked shed set is absent');
  // G2 / G3: residents
  for (const [key, id] of [['HospitalGarage', 'G2'], ['Hospital', 'G3']]) {
    const br3 = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000, args: ARGS });
    try { const logs = [], p3 = await open(br3, logs); await p3.evaluate(k => window.STRWalkerOutliner._openResident(window.STRWalkerOutliner._residents.find(r => r.key === k)), key);
      await p3.waitForFunction(() => window.__dwBuf, { timeout: 300000 }); for (let g = 0; g < 120 && !render(logs); g++) await new Promise(r => setTimeout(r, 1000));
      const R = render(logs);
      if (id === 'G2') { const Database = require(path.join(process.env.HOME, 'bim-compiler/node_modules/better-sqlite3')), d = new Database(path.join(ROOT, 'modeller', 'Garage_ARC.db'), { readonly: true });
        const und = d.prepare("SELECT t.center_z - t.bbox_z/2 z FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid WHERE m.discipline='STR' AND m.ifc_class='IfcBeam'").all().map(r => r.z); d.close();
        const onLevel = R && und.some(z => Math.abs(z - R.z) < 0.006);
        check('G2', 'HospitalGarage: girderZ = one of its own beam undersides, the nearest to the rule: a move of < 0.1 m', !!R && R.snapped && onLevel && Math.abs(R.z - +R.rule) < 0.1, (R ? R.line : '(no render line)') + ' on_a_beam_level=' + onLevel); }
      else check('G3', 'Hospital (349 STR columns, no source beams): the rule, unchanged', !!R && !R.snapped && R.noBeams && R.n > 0, R ? R.line : '(no render line)');
    } finally { await br3.close(); }
  }
  srv.close(); say('SUMMARY fail=' + fail + ' judged=' + judged); process.exit(fail ? 1 : 0);
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
