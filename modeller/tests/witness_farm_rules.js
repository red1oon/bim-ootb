#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-FARM-RULES (rule D62, prompts/DXF2BIM_FOUNDATION_LANE.md §D62). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: a farm shed had no walker reference (the Terminal's and the Duplex's place nothing on it), so the left DISC rows could not put lights or sprinklers in it.
 *   F1 CHOSEN    — the shed's Viewer DB (a DXF2BIM convert) opened from disk walks with farm_rules.db, and the reference is stated (standard=farming-shed).
 *   F2 LIGHTS    — DISC ELEC: real-mesh lights only (lod400), count = the walker's round(footprint / (10 ft)^2) (NOSPACES ratio), every light inside the cited band (7-8 ft above the floor).
 *   F3 SPRINKLER — DISC FP: real-mesh sprinklers, count = round(footprint / 225 ft2), every one 1-12 in below the reference ceiling; the farm reference's own FP rule (not borrowed).
 *   F4 DATUM     — the frame reconciles by the walker's own measurement (>= 3 classes, |zOff| < 0.05 m on the shed).
 *   F5 UNCHANGED — Duplex (no FP rule of its own) still borrows FP from the Terminal.
 * Input: the CLI-marked shed set (SHED_MARKED_DIR, local; absent -> INCONCLUSIVE). Software GL, headless.
 * Usage: NODE_PATH=<dir with better-sqlite3> node modeller/tests/witness_farm_rules.js
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
    pg.on('console', m => { const t = m.text(); if (/§DW-RULES-REF|§DW-RULES-MESH|§DW-PRIM-LOD disc=|§DW-LOD400-REFUSE|§DISC-WALK|§DW-PROV|§DW-|§NOSPACES-ZONE/.test(t)) { logs.push(t); say('  ' + t.slice(0, 230)); } });
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
  // 2. a fresh profile: open it from disk, walk ELEC then FP from the DISC path
  const br2 = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000, args: ARGS });
  try { const logs = [], p2 = await open(br2, logs); await p2.click('#b-open'); await p2.waitForSelector('#m-open-panel .mo-row[data-key="__local"]', { visible: true });
    const [c2] = await Promise.all([p2.waitForFileChooser(), p2.click('#m-open-panel .mo-row[data-key="__local"]')]); await c2.accept([vdb]);
    await p2.waitForFunction('!!window.__dwBuf && !!window.__arcSeedReady', { timeout: 240000 }); await p2.evaluate(async () => { await window.__arcSeedReady; }); await new Promise(r => setTimeout(r, 2000));
    const res = {}; for (const d of ['ELEC', 'FP']) res[d] = await walk(p2, d);
    const W = await p2.evaluate(() => ({ ELEC: (window.__dwWalks.ELEC || []).map(p => p.z), FP: (window.__dwWalks.FP || []).map(p => p.z), loaded: window.DiscWalker.loadedFile(), ownFP: window.DiscWalker.hasRules('FP'),
      borrowed: Object.keys(window.DiscWalker.dwBorrow('__probe', null)), meta: window.DiscWalker.rulesMeta() }));
    const ref = logs.filter(t => /§DW-RULES-REF/.test(t)).pop() || '';
    check('F1', 'the shed opened from disk walks with farm_rules.db and the reference is stated', W.loaded === 'farm_rules.db' && /rules=farm_rules\.db/.test(ref) && /standard=farming-shed/.test(ref), `loaded=${W.loaded} ${ref.slice(0, 160)}`);
    const lod = d => { const l = logs.filter(t => new RegExp('§DW-PRIM-LOD disc=' + d + ' ').test(t)).pop() || ''; const m = /lod400=(\d+) lod300=(\d+) lod200=(\d+)/.exec(l); return m ? { lod400: +m[1], lod300: +m[2], lod200: +m[3] } : null; };
    const zone = cls => { const l = logs.filter(t => new RegExp('§NOSPACES-ZONE \\w+/' + cls + ' ').test(t)).pop() || ''; const m = /band=\[([-\d.]+),([-\d.]+)\].*ratio=([\d.]+) placed=(\d+)/.exec(l); return m ? { lo: +m[1], hi: +m[2], ratio: +m[3], placed: +m[4] } : null; };
    const FT = 0.3048, fl = +W.meta.reference_floor_z, ce = +W.meta.reference_ceiling_z, t = 1e-6;
    const zL = zone('IfcLightFixture'), zS = zone('IfcFireSuppressionTerminal'), LE = lod('ELEC'), LF = lod('FP');
    const inL = W.ELEC.length && W.ELEC.every(z => z >= fl + 7 * FT - t && z <= fl + 8 * FT + t), inS = W.FP.length && W.FP.every(z => z >= ce - 12 * 0.0254 - t && z <= ce - 1 * 0.0254 + t);
    check('F2', 'DISC ELEC: real-mesh lights, count = round(footprint / (10 ft)^2), every light 7-8 ft above the reference floor', !!zL && !!LE && LE.lod400 === W.ELEC.length && !LE.lod200 && !LE.lod300 && zL.placed === Math.round(zL.ratio) && W.ELEC.length === zL.placed && inL && res.ELEC.ops > 0,
      `lights=${W.ELEC.length} ratio=${zL && zL.ratio} lod=${JSON.stringify(LE)} band=[${(fl + 7 * FT).toFixed(3)},${(fl + 8 * FT).toFixed(3)}] z=${JSON.stringify(Array.from(new Set(W.ELEC.map(z => z.toFixed(3)))))}`);
    check('F3', 'DISC FP: real-mesh sprinklers, count = round(footprint / 225 ft2), 1-12 in below the reference ceiling, the farm reference\'s own FP rule (no borrow)', !!zS && !!LF && LF.lod400 === W.FP.length && !LF.lod200 && zS.placed === Math.round(zS.ratio) && W.FP.length === zS.placed && inS && W.ownFP && W.borrowed.indexOf('FP') < 0 && res.FP.ops > 0,
      `sprinklers=${W.FP.length} ratio=${zS && zS.ratio} lod=${JSON.stringify(LF)} ownFP=${W.ownFP} borrowed=${JSON.stringify(W.borrowed)} z=${JSON.stringify(Array.from(new Set(W.FP.map(z => z.toFixed(3)))))}`);
    const dat = logs.filter(t => /§DW-DATUM (ELEC|FP) zOff=/.test(t)).map(t => /zOff=([-\d.]+) measured from walked substrate \((\d+) ref classes/.exec(t)).filter(Boolean);
    check('F4', 'the frame reconciles by measurement (>= 3 classes, |zOff| < 0.05 m)', dat.length >= 2 && dat.every(m => +m[2] >= 3 && Math.abs(+m[1]) < 0.05), JSON.stringify(dat.map(m => m[1] + '@' + m[2])));
    say('INFO walk times ELEC ' + res.ELEC.ms + ' ms, FP ' + res.FP.ms + ' ms');
  } finally { await br2.close(); }
  // 3. Duplex (no FP rule of its own) still borrows FP from the Terminal
  const br3 = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000, args: ARGS });
  try { const p3 = await open(br3, []); await p3.evaluate(() => window.STRWalkerOutliner._openResident(window.STRWalkerOutliner._residents.find(r => r.key === 'Duplex')));
    await p3.waitForFunction('!!window.__dwBuf', { timeout: 240000 }); await p3.evaluate(async () => { await window.__ensureDiscWalker(); });
    const st = await p3.evaluate(() => ({ loaded: window.DiscWalker.loadedFile(), ownFP: window.DiscWalker.hasRules('FP'), borrowed: Object.keys(window.DiscWalker.dwBorrow('__probe', null)) }));
    check('F5', 'Duplex (no FP rule of its own) still borrows FP from the Terminal', st.loaded === 'duplex_rules.db' && !st.ownFP && st.borrowed.indexOf('FP') >= 0, JSON.stringify(st));
  } finally { await br3.close(); srv.close(); }
  say('SUMMARY fail=' + fail + ' judged=' + judged); process.exit(fail ? 1 : 0);
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
