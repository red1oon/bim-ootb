#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-EDIT-REPORT-SHAPES (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §20.2.10). READ THE §-LOG after every run
 * (`node modeller/tests/witness_edit_shapes.js > build/edit_shapes.log 2>&1`, then read it; the exit code is not evidence).
 * ISSUE: the edit report's overlap row counts bounding boxes, so a pair whose shapes never touch stopped an edit. Each claim names what it proves or disproves:
 *   N1  a box-only pair still stops an edit, or a pair is dropped from the count (gy10 +1.49: 25 box pairs, the stop must read the clash + not-judged share)
 *   N2  a witness that cannot tell a working narrow phase from a broken one (stub CLEAR-for-all must flip N1; a throwing stub must keep every pair as a stop)
 *   N3  boxes mistaken for shapes (an L-profile and a block in its notch)
 *   N4  a forked narrow phase (clash_narrow.js unchanged, no second intersectsGeometry in modeller/)
 *   N5  a silent fallback or a vacuous PASS (BVH file blocked: box stop and a stated reason; zero pairs: the module is not called)
 *   N6  non-determinism (two fresh Opens give identical shape records; undo then the same edit gives the same verdicts)
 *   N7  PERF BUDGET and BVH leak (cost line fields, shape_ms <= 150, heap flat after dispose)
 *   N8  boot weight (module absent at open, present after the first grid move)
 *   N9  "works offline" claimed by a run that still reached the network (every non-localhost request aborted and counted; falsifier: vendored file blocked)
 *   N10 the Viewer's BVH repoint broke the Viewer (local file, no CDN request)
 * Public buildings only (HospitalGarage). Headless SwiftShader, no GPU. Geometry is served from ~/.cache/bim-modeller-geo (the file the OCI URL serves) in every run.
 * Every verdict line prints INCONCLUSIVE when nothing was judged.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), { execSync } = require('child_process');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const ROOT = path.join(__dirname, '..', '..'), sleep = (ms) => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream' };
const GEO = path.join(process.env.HOME, '.cache', 'bim-modeller-geo', 'v3_HospitalGarage_geo.db');
const L = (s) => console.log(s);
let pass = 0, fail = 0, inconclusive = 0;
function claim(id, name, cond, detail) { if (cond === null) { inconclusive++; L('§W-EDIT-SHAPES ' + id + ' INCONCLUSIVE ' + name + ' :: ' + detail); return; } if (cond) pass++; else fail++; L('§W-EDIT-SHAPES ' + id + (cond ? ' PASS ' : ' FAIL ') + name + ' :: ' + detail); }

const reqLog = [];
let serverBlock = [];   // files the server refuses (404) for the whole browser: a service worker cannot serve what it never fetched
const server = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); reqLog.push(p);
  if (serverBlock.some(b => p.indexOf(b) >= 0)) { r.writeHead(404); r.end('blocked by the witness'); return; }
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); }); });
let br = null;
const LAUNCH = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'];

// one fresh Open of HospitalGarage. opts: {offline, blockLocal:[substr], stub:'clear'|'throw'}. Returns {pg, slog, blocked, errs}.
async function openFresh(opts) {
  opts = opts || {}; serverBlock = opts.blockLocal || [];
  const bx = await puppeteer.launch({ protocolTimeout: 900000, headless: 'new', args: LAUNCH }), pg = await bx.newPage(); pg.close = () => bx.close();   // own browser = own IndexedDB, as edit_cli does: a shared one restores the last Open's edits (Before drifted 2186 -> 2202 -> 2218 in the probe)
  await pg.evaluateOnNewDocument(() => { window.__editShapesMeasure = true; }); await pg.setViewport({ width: 1280, height: 860 });
  const slog = [], errs = [], blocked = [], seen = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  pg.on('console', m => { const x = m.text(); if (/^§/.test(x)) slog.push(x); });
  await pg.setRequestInterception(true);
  const port = server.address().port;
  pg.on('request', rq => {
    const u = rq.url(); seen.push(u);
    if (/^data:|^blob:/.test(u)) return rq.continue();
    const local = u.startsWith('http://localhost:' + port + '/');
    if (local && (opts.blockLocal || []).some(s => u.indexOf(s) >= 0)) { blocked.push('BLOCKED-LOCAL ' + u); return rq.abort(); }
    if (local) return rq.continue();
    if (/objectstorage\..*oraclecloud\.com\/.*HospitalGarage_geo\.db/.test(u)) return rq.respond({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/octet-stream' }, body: fs.readFileSync(GEO) });
    blocked.push(u); return rq.abort();   // anything else that leaves the machine: counted and refused (an air-gapped run)
  });
  const url = 'http://localhost:' + port + '/modeller/modeller.html';
  await pg.goto(url, { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction('window.__sceneReady===true && !!window.THREE && !!window.A && !!window.Bonsai', { timeout: 60000 });
  await pg.click('#b-open'); await sleep(200);
  await pg.click('#m-open-panel .mo-row[data-key="HospitalGarage"]');
  await pg.waitForFunction(() => !!window.__dwBuf, { timeout: 120000 }).catch(() => {}); await sleep(2200);
  let settled = false;
  for (let i = 0; i < 480 && !settled; i++) { settled = await pg.evaluate(() => !!window.__saveGateBaseline && Object.keys(window.__saveGateBaseline).length > 0); if (!settled) await sleep(500); }
  if (!settled) throw new Error('building did not open');
  const framed = await pg.evaluate(() => { const i = window.swbGateInfo && window.swbGateInfo(); return !!(i && i.system === 'column-framed'); });
  if (framed) { for (let i = 0; i < 120 && !slog.some(l => /§STRWALK-OL §GEO-SERVED/.test(l)); i++) await sleep(500); await sleep(5000); await pg.click('#b-gridmove'); await sleep(600); } else await sleep(1500);
  return { pg, slog, blocked, errs, seen };
}
// a shift through the real commit path; returns the page's own report plus the gate verdict the CLI would read
async function doShift(s, grid, move) {
  L('  .. ' + new Date().toISOString().slice(11, 19) + ' shift ' + grid + ' ' + move);
  s.pg.on('console', m => { const x = m.text(); if (/EDIT_SHAPES|LOAD_FAIL|EDIT_REPORT /.test(x) && !/^§EDIT_REPORT \{/.test(x)) L('     page: ' + x.slice(0, 160)); });
  return s.pg.evaluate(async (grid, move) => {
    const before = window.__lastEditReport || null;
    await window.__gridShift(grid, move);
    const rep = window.__lastEditReport; if (!rep || rep === before) return { refused: ((document.getElementById('stat') || {}).textContent || 'no report') };
    await window.__ensureEditReport();
    return { rep, verdict: window.EditReport.gateVerdict(rep), cost: window.__editShapesCost || null };
  }, grid, move);
}
const clashRow = (rep) => rep.newRows.filter(r => r.id === 'clash')[0];
const sumTally = (t) => t.clash + t.touching + t['box only, shapes clear'] + t['not judged'];

(async () => {
  if (!fs.existsSync(GEO)) { L('§W-EDIT-SHAPES INCONCLUSIVE geometry cache ' + GEO + ' is missing: nothing was judged'); process.exit(4); }
  await new Promise(res => server.listen(0, res));
  br = await puppeteer.launch({ protocolTimeout: 900000, headless: 'new', args: LAUNCH });   // only the Viewer page (N10) uses this one
  let fatal = null; const costs = [];
  try {
    // ---- N8 + N1 + N6a + N7: a fresh Open, gy10 +1.49 ----
    const s1 = await openFresh();
    const atOpen = await s1.pg.evaluate(() => ({ shapes: typeof window.EditShapes, narrow: !!(window.A && window.A.clashNarrow), bvh: !!window._bvhReady }));
    const reqAtOpen = s1.seen.filter(u => /edit_shapes|clash_narrow|three-mesh-bvh/.test(u));
    claim('N8a', 'module absent at open (EditShapes, clashNarrow, BVH, and no request for them)', !atOpen.shapes.match(/object|function/) && !atOpen.narrow && !atOpen.bvh && reqAtOpen.length === 0, JSON.stringify(atOpen) + ' requests=' + reqAtOpen.length);
    const r1 = await doShift(s1, 'gy10', 1.49);
    if (r1.refused) { claim('N1', 'gy10 edit produced a report', null, r1.refused); } else {
      const sh = r1.rep.shapes, row = clashRow(r1.rep);
      const atMove = await s1.pg.evaluate(() => ({ shapes: typeof window.EditShapes, narrow: !!(window.A && window.A.clashNarrow && window.A.clashNarrow.testPair), bvh: !!window._bvhReady }));
      claim('N8b', 'module present after the first grid move', atMove.shapes === 'object' && atMove.narrow && atMove.bvh, JSON.stringify(atMove));
      if (sh.state !== 'JUDGED' || !sh.judged) claim('N1', 'shape record judged the gy10 pairs', null, 'shapes.state=' + sh.state + ' judged=' + sh.judged);
      else {
        const box = row.box_count, t = sh.tally, hasBoxOnly = t['box only, shapes clear'] > 0;
        L('§W-EDIT-SHAPES N1 data box_count=' + box + ' tally=' + JSON.stringify(t) + ' row.count(stop)=' + row.count + ' verdict.stop=' + r1.verdict.stop + ' reasons=' + JSON.stringify(r1.verdict.reasons));
        const n1 = (sumTally(t) === box) && (box === 25) && (row.count === t.clash + t['not judged']) && (row.count < box) && hasBoxOnly && r1.verdict.stop === true;
        claim('N1', 'gy10 +1.49 HospitalGarage: 25 box pairs = ' + sumTally(t) + ' judged; the stop reads ' + row.count + ' (clash ' + t.clash + ' + not judged ' + t['not judged'] + '), not 25; box-only ' + t['box only, shapes clear'] + ' no longer count', hasBoxOnly ? n1 : null, hasBoxOnly ? 'sum=' + sumTally(t) + ' box=' + box : 'no box-only pair: nothing proves the stop dropped one');
        // the fields §20.2.9 item 4 asks for, on every pair
        const p0 = sh.pairs[0], fieldsOk = sh.pairs.every(p => p.a && p.b && 'name' in p.a && 'cls' in p.a && 'disc' in p.a && 'storey' in p.a && typeof p.depth_mm === 'number' && p.tol_mm === 20 && p.verdict && (p.status === 'new' || p.status === 'deeper'));
        const named = sh.pairs.filter(p => p.a.name && p.b.name && p.a.cls && p.a.storey).length;
        claim('N1f', 'each pair carries elements (name, class, discipline), storey, depth in mm, tolerance, word, new/deeper; resolved and cleared totals present', fieldsOk && named > 0 && sh.resolved !== null && sh.cleared === t.touching + t['box only, shapes clear'], 'pairs=' + sh.pairs.length + ' named=' + named + ' resolved=' + (sh.resolved && sh.resolved.count) + ' cleared=' + sh.cleared + ' first=' + JSON.stringify(p0).slice(0, 260));
        // N7 cost
        const c = r1.cost; const costLine = s1.slog.filter(l => /^§EDIT_REPORT_SHAPES_COST/.test(l))[0], mainCost = s1.slog.filter(l => /^§EDIT_REPORT_COST/.test(l)).pop();
        L('§W-EDIT-SHAPES N7 data ' + (costLine || 'NO COST LINE') + ' | ' + (mainCost || ''));
        claim('N7a', 'cost line carries shape_ms, shape_pairs, bvh_heap_mb, verts on both log lines', !!costLine && ['shape_ms=', 'shape_pairs=', 'bvh_heap_mb=', 'verts='].every(k => costLine.indexOf(k) > 0 && mainCost.indexOf(k) > 0), (costLine || '').slice(0, 160));
        costs.push({ edit: 'gy10 +1.49', c });
        const N7b = () => claim('N7b', 'gy10: shape_ms <= 150 (best of the cold run and the repeat after undo; the machine is shared) and BVH heap not above before (+2 MB) after dispose', c ? (Math.min(c.shape_ms, c2 ? c2.shape_ms : 1e9) <= 150 && c.bvh_heap_mb <= 2 && (!c2 || c2.bvh_heap_mb <= 2)) : null, c ? 'cold shape_ms=' + c.shape_ms + ' repeat shape_ms=' + (c2 ? c2.shape_ms : 'n/a') + ' bvh_heap_mb=' + c.bvh_heap_mb + ' verts=' + c.verts + ' geoms=' + c.geoms + ' pairs=' + c.shape_pairs : 'no cost');
        let c2 = null;
        // N2: the same page, narrow phase stubbed. (Undo the real edit first; the stubs run the same edit again.)
        await s1.pg.evaluate(async () => { await window.Bonsai.oplog.undo(); });
        await sleep(1500);
        for (const kind of ['clear', 'throw']) {
          await s1.pg.evaluate((kind) => { const NT = window.A.clashNarrow; if (!NT.__real) NT.__real = NT.testPair;
            NT.testPair = kind === 'clear' ? function () { return { verdict: 'CLEAR', reason: 'MESH_NO_TRIANGLE_INTERSECTION' }; } : function () { throw new Error('stub failure'); }; }, kind);
          const rs = await doShift(s1, 'gy10', 1.49);
          if (rs.refused) { claim('N2-' + kind, 'stubbed edit produced a report', null, rs.refused); }
          else {
            const t2 = rs.rep.shapes.tally, row2 = clashRow(rs.rep);
            if (kind === 'clear') {
              const n1again = (row2.count === t.clash + t['not judged']) && row2.count < box;   // N1's own predicate, applied to the stubbed run
              claim('N2-clear', 'stub CLEAR-for-all: every pair "box only", stop count 0, box count unchanged, and N1\'s predicate now FAILS', t2['box only, shapes clear'] === row2.box_count && row2.count === 0 && row2.box_count === box && n1again === false && rs.verdict.stop === false, JSON.stringify(t2) + ' count=' + row2.count);
            } else {
              claim('N2-throw', 'stub that throws: every pair "not judged", never a number, and the stop count equals the box count (a not-judged pair still stops)', t2['not judged'] === row2.box_count && row2.count === row2.box_count && rs.verdict.stop === true && t2.clash === 0, JSON.stringify(t2) + ' count=' + row2.count + ' why0=' + rs.rep.shapes.pairs[0].why);
            }
          }
          await s1.pg.evaluate(async () => { await window.Bonsai.oplog.undo(); window.A.clashNarrow.testPair = window.A.clashNarrow.__real; }); await sleep(1500);
        }
        // N6b: undo then the same edit again, same verdict list
        const again = await doShift(s1, 'gy10', 1.49); c2 = again.cost; N7b();
        const key = (rep) => JSON.stringify(rep.shapes.pairs.map(p => [p.a.fid, p.b.fid, p.verdict, p.depth_mm]));
        claim('N6b', 'undo then the same edit again: same tally and same verdict per pair', !again.refused && JSON.stringify(again.rep.shapes.tally) === JSON.stringify(sh.tally) && key(again.rep) === key(r1.rep), again.refused || JSON.stringify(again.rep.shapes.tally));
        // N6a: a second fresh Open, same edit, identical shapes record
        await s1.pg.close();
        const s2 = await openFresh(); const r2 = await doShift(s2, 'gy10', 1.49);
        claim('N6a', 'two fresh Opens give a byte-identical shapes record', !r2.refused && JSON.stringify(r2.rep.shapes) === JSON.stringify(sh), r2.refused || ('bytes ' + JSON.stringify(sh).length + ' vs ' + JSON.stringify(r2.rep.shapes).length + ' box_count ' + box + ' vs ' + clashRow(r2.rep).box_count + ' moved ' + JSON.stringify(r1.rep.rows[0]) + ' vs ' + JSON.stringify(r2.rep.rows[0])));
        // G2's first try as the second cost point
        await s2.pg.evaluate(async () => { await window.Bonsai.oplog.undo(); }); await sleep(1500);
        const r3 = await doShift(s2, 'gy11', -1.49);
        if (!r3.refused && r3.cost) { costs.push({ edit: 'gy11 -1.49', c: r3.cost }); claim('N7c', 'gy11 -1.49: shape_ms <= 150, heap flat', r3.cost.shape_ms <= 150 && r3.cost.bvh_heap_mb <= 2, JSON.stringify(r3.cost)); }
        else claim('N7c', 'gy11 -1.49 cost', null, r3.refused || 'no cost (no clash pair to judge)');
        // ---- N5b zero pairs: a move with no box clash must not call the module's judge ----
        await s2.pg.evaluate(async () => { await window.Bonsai.oplog.undo(); }); await sleep(1500);
        let zero = null;
        for (const [g, m] of [['gy8', 1.5], ['gx2', 0.2], ['gy5', 0.1]]) {
          const rz = await doShift(s2, g, m); if (rz.refused) continue;
          if (clashRow(rz.rep).box_count === undefined && rz.rep.shapes.state === 'NOTHING_TO_JUDGE') { zero = { g, m, rz }; break; }
          await s2.pg.evaluate(async () => { await window.Bonsai.oplog.undo(); }); await sleep(1500);
        }
        claim('N5b', 'zero box pairs: shapes.state NOTHING_TO_JUDGE, judge not called (no cost), report says so, no stop', zero ? (zero.rz.cost === null && clashRow(zero.rz.rep).count === 0 && /not run/.test(clashRow(zero.rz.rep).shape_note) && zero.rz.verdict.stop === false) : null, zero ? zero.g + ' ' + zero.m + ' note=' + clashRow(zero.rz.rep).shape_note : 'no zero-clash edit found among the candidates: nothing judged');
        await s2.pg.close();
      }
    }
    // ---- N5a: the BVH file blocked (online otherwise) ----
    const s5 = await openFresh({ blockLocal: ['three-mesh-bvh.module.js'] });
    const r5 = await doShift(s5, 'gy10', 1.49);
    if (r5.refused) claim('N5a', 'BVH blocked: edit reported', null, r5.refused);
    else {
      const row5 = clashRow(r5.rep), sh5 = r5.rep.shapes;
      claim('N5a', 'BVH file blocked: the edit still reports, the row keeps the 25-pair box count, the report states "shape check unavailable", the box stop applies', sh5.state === 'FALLBACK' && row5.count === 25 && /shape check unavailable/.test(row5.shape_note) && r5.verdict.stop === true && /box stop apply/.test(r5.verdict.reasons.join(' ') + row5.shape_note) && s5.slog.some(l => /§EDIT_SHAPES LOAD_FAIL/.test(l)), 'state=' + sh5.state + ' count=' + row5.count + ' note=' + row5.shape_note + ' reasons=' + JSON.stringify(r5.verdict.reasons));
    }
    await s5.pg.close();
    // ---- N9: offline. Non-localhost refused and counted; the OCI geometry URL is answered from the local cache file ----
    const s9 = await openFresh({ offline: true });
    const r9 = await doShift(s9, 'gy10', 1.49);
    const leaks = s9.blocked.filter(u => !/^BLOCKED-LOCAL/.test(u)), cdn = s9.seen.filter(u => /jsdelivr|unpkg|cdnjs|esm\.sh/.test(u));
    L('§W-EDIT-SHAPES N9 data non-localhost refused=' + leaks.length + ' ' + JSON.stringify(leaks.slice(0, 5)) + ' cdnRequests=' + cdn.length);
    if (r9.refused) claim('N9', 'offline run produced a report', null, r9.refused);
    else claim('N9', 'OFFLINE: no request reached a CDN, the shape check still ran, tally equals the online run', cdn.length === 0 && r9.rep.shapes.state === 'JUDGED' && r9.rep.shapes.judged === 25 && clashRow(r9.rep).count === 5 && r9.rep.shapes.tally.clash === 5, 'cdn=' + cdn.length + ' refused=' + leaks.length + ' state=' + r9.rep.shapes.state + ' tally=' + JSON.stringify(r9.rep.shapes.tally));
    await s9.pg.close();
    const s9f = await openFresh({ offline: true, blockLocal: ['three-mesh-bvh.module.js'] });
    const r9f = await doShift(s9f, 'gy10', 1.49);
    claim('N9f', 'falsifier: offline with the vendored file blocked, the shape check does NOT run', !r9f.refused ? (r9f.rep.shapes.state === 'FALLBACK') : null, r9f.refused || r9f.rep.shapes.state);
    await s9f.pg.close();
    // ---- N3: synthetic shapes through the same path ----
    const s3 = await openFresh();
    await doShift(s3, 'gy10', 1.49);   // loads the module the way the app does
    const syn = await s3.pg.evaluate(() => {
      const T = window.THREE, ES = window.EditShapes, NT = window.A.clashNarrow;
      const boxes = (list) => { const pos = []; list.forEach(b => { const g = new T.BoxGeometry(b.w, b.h, b.d).toNonIndexed(); const p = g.attributes.position; for (let i = 0; i < p.count; i++) pos.push(p.getX(i) + b.x, p.getY(i) + b.y, p.getZ(i) + b.z); });
        const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(pos), 3)); return g; };
      const I = new T.Matrix4();
      const Lshape = boxes([{ w: 2, h: 1, d: 1, x: 1, y: 0.5, z: 0.5 }, { w: 1, h: 1, d: 1, x: 0.5, y: 1.5, z: 0.5 }]);                 // [0,2]x[0,1] + [0,1]x[1,2]
      const blockIn = boxes([{ w: 0.6, h: 0.6, d: 0.6, x: 1.5, y: 1.5, z: 0.5 }]);                                                   // inside the notch, clear of every face
      const blockFlush = boxes([{ w: 0.5, h: 0.6, d: 0.6, x: 1.25, y: 1.5, z: 0.5 }]);                                                 // x in [1,1.5]: one face flush on the notch wall x=1
      const cubeA = boxes([{ w: 1, h: 1, d: 1, x: 0.5, y: 0.5, z: 0.5 }]), cubeB = boxes([{ w: 1, h: 1, d: 1, x: 1.0, y: 0.5, z: 0.5 }]);   // overlap 0.5 m
      const run = (a, b) => { const r = NT.testPair(a, I, b, I, { ctx: { bvhReused: 0, bvhBuiltNew: 0 } }); const w = ES.word(r); return { word: w.word, reason: r.reason, flat: r.overlapFlat }; };
      const bb = (g) => { g.computeBoundingBox(); return g.boundingBox.clone(); };
      const boxOverlap = (a, b) => bb(a).intersectsBox(bb(b));
      const out = { notch: run(Lshape, blockIn), notchBox: boxOverlap(Lshape, blockIn), flush: run(Lshape, blockFlush), flushBox: boxOverlap(Lshape, blockFlush), cubes: run(cubeA, cubeB), cubesBox: boxOverlap(cubeA, cubeB) };
      [Lshape, blockIn, blockFlush, cubeA, cubeB].forEach(g => g.disposeBoundsTree && g.disposeBoundsTree());
      return out;
    });
    L('§W-EDIT-SHAPES N3 data ' + JSON.stringify(syn));
    claim('N3', 'L-profile + block in its notch: boxes overlap, word "box only, shapes clear"; two overlapping cubes: "clash"; block flush on the notch wall: "touching"; a boxes-only check would call all three overlaps', syn.notchBox && syn.flushBox && syn.cubesBox && syn.notch.word === 'box only, shapes clear' && syn.cubes.word === 'clash' && syn.flush.word === 'touching', JSON.stringify(syn));
    await s3.pg.close();
    // ---- N4 ----
    let diff = '?'; try { diff = execSync('git diff origin/main --stat -- viewer/clash_narrow.js', { cwd: ROOT }).toString().trim(); } catch (e) { diff = 'ERR ' + e.message.slice(0, 80); }
    let second = '?'; try { second = execSync("grep -rn 'intersectsGeometry' modeller --include=*.js --include=*.html | grep -v '^modeller/tests/' | grep -v '^modeller/lib/' || true", { cwd: ROOT }).toString().trim(); } catch (e) { second = 'ERR'; }
    claim('N4', 'clash_narrow.js has no diff against origin/main; no second intersectsGeometry/SAT in modeller/', diff === '' && second === '', 'diff="' + diff + '" otherUses="' + second + '"');
    // ---- N10: the Viewer's BVH from the local file ----
    const v = await br.newPage(); const vlog = [], vseen = []; v.on('console', m => { const x = m.text(); if (/BVH/.test(x)) vlog.push(x.slice(0, 200)); });
    await v.setRequestInterception(true); v.on('request', rq => { const u = rq.url(); vseen.push(u); if (u.startsWith('http://localhost:' + server.address().port + '/') || /^data:|^blob:/.test(u)) return rq.continue(); rq.abort(); });
    await v.goto('http://localhost:' + server.address().port + '/viewer/viewer.html', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    for (let i = 0; i < 60 && !vlog.some(l => /§BVH_INIT|§BVH_INIT_FAIL/.test(l)); i++) await sleep(500);
    L('§W-EDIT-SHAPES N10 data ' + JSON.stringify(vlog));
    const inited = vlog.some(l => /§BVH_INIT three-mesh-bvh v0.8.0/.test(l));
    claim('N10', 'Viewer boot: §BVH_INIT from the vendored file, the file was requested from localhost, no CDN request', vlog.length ? (inited && vseen.some(u => /common\/lib\/three-mesh-bvh\.module\.js/.test(u)) && !vseen.some(u => /jsdelivr/.test(u))) : null, vlog.length ? 'init=' + inited : 'no BVH line at all (the Viewer did not reach loader.js): nothing judged');
    await v.close();
  } catch (e) { fatal = String(e && e.stack || e); L('§W-EDIT-SHAPES FATAL ' + fatal); }
  await br.close().catch(() => {}); server.close();
  L('§W-EDIT-SHAPES SUMMARY pass=' + pass + ' fail=' + fail + ' inconclusive=' + inconclusive + (fatal ? ' FATAL' : '') + ' costs=' + JSON.stringify(costs));
  const verdict = fatal ? 'FAIL' : fail ? 'FAIL' : (pass === 0 || inconclusive) ? 'INCONCLUSIVE' : 'PASS';
  L('§W-EDIT-SHAPES VERDICT ' + verdict);
  process.exit(verdict === 'PASS' ? 0 : verdict === 'INCONCLUSIVE' ? 4 : 1);
})();
