#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-WALK-BUILDUP (rule D64, prompts/DXF2BIM_FOUNDATION_LANE.md §D64). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: the farm lights were the Terminal's 1.4 m troffer (it read as an air-con panel), and a DISC walk showed every fixture in one frame (no build-up to follow).
 *   B1 PENDANT   — the shed's ELEC walk places the library pendant lamp (mesh 3258c4c591af8a44, from a named mesh source), lod400 only, 69 of them; the sprinklers still the Terminal's.
 *   B2 BUILD-UP  — during a fresh walk the drawn instances rise from below n to n in steps (sampled), the reveal front (__dwReveal) moves, and the end draws all n.
 *   B3 INSTANT   — a redraw after the reveal (the next walk re-renders every walked disc) keeps all n drawn at once.
 *   B4 SAME      — placements and committed ops are those of the walk without a reveal (69 lights / 30 sprinklers, ops > 0).
 *   B6 JOINTS BUILD UP (§D66.1) — the joint parts (drop / transition / tee) build up when they land (partial counts, monotonic), never ahead of their heads, all N at the end.
 *   B5 AFTER HEADS (§D64.1) — the FP pipework draws no segment while its heads build up, then rises in steps to N over clamp(60 ms x N, 2 s, 7 s) (it used to outrun the heads in a fixed 2 s).
 * Input: the CLI-marked shed set (SHED_MARKED_DIR, local; absent -> INCONCLUSIVE). Software GL, headless.
 * Usage: NODE_PATH=<dir with better-sqlite3> node modeller/tests/witness_walk_buildup.js
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
  // 2. a fresh profile: open it from disk, walk ELEC sampling the drawn instance count, then FP (a redraw of ELEC)
  const br2 = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000, args: ARGS });
  try { const logs = [], p2 = await open(br2, logs); await p2.click('#b-open'); await p2.waitForSelector('#m-open-panel .mo-row[data-key="__local"]', { visible: true });
    const [c2] = await Promise.all([p2.waitForFileChooser(), p2.click('#m-open-panel .mo-row[data-key="__local"]')]); await c2.accept([vdb]);
    await p2.waitForFunction('!!window.__dwBuf && !!window.__arcSeedReady', { timeout: 240000 }); await p2.evaluate(async () => { await window.__arcSeedReady; }); await new Promise(r => setTimeout(r, 2000));
    const S = await p2.evaluate(async () => { const drawn = d => { let n = 0, c = 0; window.A.scene.traverse(o => { if (o.isInstancedMesh && o.userData && o.userData.dwDisc === d && o.userData.dwSub) { n += o.userData.dwSub.length; c += o.count; } }); return [c, n]; };
      const samples = [], fronts = new Set(), n0 = window.Bonsai.oplog.length; window.__dwLastDoneDisc = null; window.discWalk('ELEC'); const t0 = Date.now();
      while (window.__dwLastDoneDisc !== 'ELEC' && Date.now() - t0 < 300000) { const d = drawn('ELEC'); if (d[1]) samples.push(d[0] + '/' + d[1]); const f = window.__dwReveal.ELEC; if (f) fronts.add(f.i); await new Promise(r => setTimeout(r, 120)); }
      for (let g = 0; g < 80 && !(window.__dwReveal.ELEC && window.__dwReveal.ELEC.done); g++) { const d = drawn('ELEC'); samples.push(d[0] + '/' + d[1]); const f = window.__dwReveal.ELEC; if (f) fronts.add(f.i); await new Promise(r => setTimeout(r, 120)); }
      const end = drawn('ELEC'), opsE = window.Bonsai.oplog.length - n0;
      const asmN = () => { let c = 0, n = 0; window.A.scene.traverse(o => { if (o.isInstancedMesh && o.userData && o.userData.dwAsm === 'FP' && o.userData.dwSub) { c += o.count; n += o.userData.dwSub.length; } }); return [c, n]; };   // §D66.1
      const chainN = () => { let c = -1, n = -1; window.A.scene.traverse(o => { if (o.isInstancedMesh && o.userData && o.userData.dwChain === 'FP') { c = o.count; n = o.instanceMatrix.count; } }); return [c, n]; }, fpS = [];
      window.__dwLastDoneDisc = null; window.discWalk('FP'); const t1 = Date.now();
      while (Date.now() - t1 < 300000 && !(window.__dwLastDoneDisc === 'FP' && window.__dwReveal.FP && window.__dwReveal.FP.done && !window.__dwChainAnimating.FP && !(window.__dwAsmRevealMeta || {}).FP && chainN()[1] > 0)) {
        const f = window.__dwReveal.FP; fpS.push([f ? f.i : 0, f ? f.n : 0, f ? !!f.done : false].concat(chainN(), [Date.now() - t1], asmN(), [drawn('FP')[0]])); await new Promise(r => setTimeout(r, 80)); }
      fpS.push([0, 0, true].concat(chainN(), [Date.now() - t1], asmN(), [drawn('FP')[0]]));
      await new Promise(r => setTimeout(r, 300)); const afterFP = drawn('ELEC');
      return { fpS, samples: samples.slice(0, 400), fronts: fronts.size, end, opsE, afterFP, lights: (window.__dwWalks.ELEC || []).length, sprinklers: (window.__dwWalks.FP || []).length,
        lightHash: Array.from(new Set((window.__dwWalks.ELEC || []).map(p => p.geometry_hash))), fpHash: Array.from(new Set((window.__dwWalks.FP || []).map(p => p.geometry_hash))) }; });
    const lod = logs.filter(t => /§DW-PRIM-LOD disc=ELEC /.test(t)).pop() || '', mesh = logs.filter(t => /§DW-RULES-MESH/.test(t)).map(t => t.slice(0, 160));
    check('B1', 'the shed\'s ELEC walk places the library pendant lamp (mesh 3258c4c591af8a44, from a named source), lod400 only; the sprinkler still the Terminal\'s', S.lights === 69 && /lod400=69 lod300=0 lod200=0/.test(lod) && S.lightHash.join() === '3258c4c591af8a44' && S.fpHash.join() === '0d509e532be0f5f2' && mesh.some(t => /resolved=1\/1/.test(t)),
      `lights=${S.lights} lightHash=${S.lightHash} fpHash=${S.fpHash} ${lod.slice(0, 50)} mesh=${JSON.stringify(mesh.map(t => (/source=\S+/.exec(t) || [''])[0]))}`);
    const parts = S.samples.map(x => x.split('/').map(Number)), partial = parts.filter(([c, n]) => n && c < n).length, distinct = new Set(parts.filter(([c, n]) => n && c < n).map(([c]) => c)).size;
    const mono = parts.every((p, i) => !i || p[0] >= parts[i - 1][0] || p[1] !== parts[i - 1][1]);
    check('B2', 'a fresh walk builds up: drawn instances rise in steps (partial frames seen, monotonic, the front moves), ending with all n', partial >= 5 && distinct >= 5 && mono && S.fronts >= 5 && S.end[0] === S.end[1] && S.end[1] > 0,
      `samples=${parts.length} partial=${partial} distinct_partial_counts=${distinct} monotonic=${mono} fronts=${S.fronts} end=${S.end.join('/')}`);
    check('B3', 'a redraw after the reveal (the FP walk re-renders ELEC) keeps all n drawn at once', S.afterFP[0] === S.afterFP[1] && S.afterFP[1] === S.end[1], `ELEC after FP ${S.afterFP.join('/')}`);
    { const early = S.fpS.filter(([i, n, d, c]) => !d && c > 0), part = S.fpS.filter(([, , d, c, N]) => d && c > 0 && c < N), dist = new Set(part.map(x => x[3])).size, last = S.fpS[S.fpS.length - 1];
      const mono = S.fpS.every((x, k) => !k || x[3] >= S.fpS[k - 1][3]), anim = logs.filter(t => /§DW-CHAIN-ANIM FP mode=animated/.test(t)).pop() || '', ms = +((/ms=(\d+)/.exec(anim) || [])[1] || 0), N = last[4], want = Math.max(2000, Math.min(7000, 60 * N));
      check('B5', 'the pipework draws no segment while its heads build up, then rises in steps to N over clamp(60 ms x N, 2 s, 7 s) (it outran the heads in a fixed 2 s)', N > 0 && !early.length && dist >= 5 && mono && last[3] === N && Math.abs(ms - want) < 600 && /EXACT==net/.test(anim),
        `samples=${S.fpS.length} segs_while_heads_building=${early.length} partial_after=${part.length} distinct=${dist} monotonic=${mono} end=${last[3]}/${N} anim_ms=${ms} want=${want} seq=${S.fpS.map(x => x[3]).filter((v, k, a) => !k || v !== a[k - 1]).join(',')}`); }
    { const sm = S.fpS.filter(x => x[7] > 0), amono = S.fpS.every((x, k) => !k || x[6] >= S.fpS[k - 1][6]), ahead = S.fpS.filter(x => x[6] > 3 * x[8]), part = new Set(S.fpS.filter(x => x[6] > 0 && x[6] < x[7]).map(x => x[6])).size, last = S.fpS[S.fpS.length - 1];
      check('B6', 'the joint parts build up when they land (partial counts, monotonic), never ahead of their heads (parts <= 3 x heads drawn), all N at the end (they landed in one frame)', sm.length > 0 && last[7] > 0 && !ahead.length && part >= 3 && amono && last[6] === last[7],
        `samples=${S.fpS.length} with_parts=${sm.length} monotonic=${amono} frames_parts_ahead_of_heads=${ahead.length} distinct_partial=${part} end=${last[6]}/${last[7]} heads_end=${last[8]}`); }
    check('B4', 'the walk itself is unchanged: 69 lights, 30 sprinklers, ops committed', S.lights === 69 && S.sprinklers === 30 && S.opsE > 0 && !p2.errs.length, `lights=${S.lights} sprinklers=${S.sprinklers} ELEC ops=${S.opsE} page_errors=${p2.errs.length}`);
  } finally { await br2.close(); srv.close(); }
  say('SUMMARY fail=' + fail + ' judged=' + judged); process.exit(fail ? 1 : 0);
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
