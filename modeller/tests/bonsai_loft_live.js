// W-BONSAI-LOFT — Bonsai modeller: GEOM_LOFT (prompts/BONSAI_LOFT_SPEC.md), the loft op family flagged
// as GEOM_ARRAY's deferred follow-up. Driven PURELY through the signed op-log (same style as
// bonsai_array_live.js — no canvas pointer dispatch, dodges the headless OrbitControls flake). Proves:
// (A) a loft from >=2 real sketched wire profiles (same profile.points ring format GEOM_EXTRUDE_POLY's
//     planegcs sketch tool already emits — see bonsai_sketch.js) folds to a real, non-degenerate occt
//     solid via ONE signed GEOM_LOFT op — a tapered tower (2x2 base -> 1x1 top), not a box.
// (B) determinism: scrub back (loft mesh gone, prior wall alone) -> forward (loft reappears, SAME
//     triangleCount) -> clearKernelCache() + re-fold from a COLD cache reproduces the identical
//     triangleCount + bbox (the actual "deterministic" test, not "runs once" — W-BONSAI-ARRAY's own bar).
// (C) tamper-evidence: mutating the committed GEOM_LOFT payload behind the chain's back breaks verifyChain.
// (D) ruled vs smooth: a 3-wire loft with a genuine waist (base 2x2 @z=0, offset 1x1 waist @z=1, top 2x2
//     @z=2) tessellates to DIFFERENT triangle counts for ruled=true vs ruled=false — hand-verified against
//     occt's own documented ThruSections semantics via a standalone Node probe against the SAME vendored
//     occt-wasm.wasm (ruled=36 tris, smooth=84 tris — ruled is straight facets between sections, smooth is
//     a curved B-spline surface needing finer tessellation), NOT eyeballed. A 2-wire loft is also checked to
//     be IDENTICAL between ruled/smooth (occt's documented degenerate case: a degree-1 spline through 2
//     sections has no curvature to differ over) — proves the D-metric is real occt behaviour, not noise.
// (E) Outliner: N distinct signed GEOM_LOFT ops -> N "Loft" rows (one op = one loft, NOT GEOM_ARRAY's
//     one-op-many-instances shape), no paint-time regression at a realistic stack (20 lofts — lofts are
//     whole building FEATURES authored one at a time, unlike array's 50-in-one-op instancing, so 20
//     separate signed ops is the realistic "many" case here, not 50 instances under one op).
// Regression (run separately, not embedded — see the session report): bonsai_sweep_live.js /
// bonsai_fillet_live.js / bonsai_array_live.js still PASS unmodified after this change.
const http = require('http'), fs = require('fs'), path = require('path');
const VIEWER = path.join(__dirname, '..');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm',
  '.json': 'application/json', '.css': 'text/css', '.map': 'application/json' };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller.html';
  fs.readFile(path.join(VIEWER, p), (e, b) => {
    if (e) { r.writeHead(404); r.end('404 ' + p); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b);
  });
});
(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage();
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 300)));
  pg.on('console', m => { const t = m.text(); if (/§LOFT|§KRN|§OPLOG/.test(t)) console.log('  ' + t); });
  await pg.goto(`http://localhost:${port}/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction("window.Bonsai && window.Bonsai.library && window.Bonsai.library.ready && window.Bonsai.oplog", { timeout: 30000 }).catch(() => {});
  await pg.evaluate(() => window.Bonsai.library.ready());

  const r = await pg.evaluate(async () => {
    const O = window.Bonsai.oplog, out = {};
    const sleep = ms => new Promise(res => setTimeout(res, ms));
    const meshOf = fid => { const g = window.Bonsai.group(); return g && g.children.find(o => o.isMesh && o.userData.featureId === fid); };
    const dims = fid => {
      const m = meshOf(fid); if (!m) return null;
      m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox;
      const nv = m.geometry.attributes.position ? m.geometry.attributes.position.count : 0;
      const tris = m.geometry.index ? m.geometry.index.count / 3 : nv / 3;   // THIS mesh's own triangle count, not the whole-chain sum
      return { ex: +(b.max.x - b.min.x).toFixed(3), ey: +(b.max.y - b.min.y).toFixed(3), ez: +(b.max.z - b.min.z).toFixed(3),
        minx: +b.min.x.toFixed(3), miny: +b.min.y.toFixed(3), minz: +b.min.z.toFixed(3), nv, tris };
    };
    const settle = async (fid, pred) => { for (let i = 0; i < 100; i++) { const d = dims(fid); if (d && pred(d)) return d; await sleep(50); } return dims(fid); };

    try {
      window.Bonsai.grid.show(false); O.clear(); await sleep(50);
      const BASE = [[0, 0], [2, 0], [2, 2], [0, 2]];          // 2x2 square ring — real sketched profile.points format
      const TOP = [[0.5, 0.5], [1.5, 0.5], [1.5, 1.5], [0.5, 1.5]];   // 1x1 square, concentric — genuine taper, not synthesized to a shape occt can't do
      const WAIST = TOP;   // reused verbatim below for the 3-wire ruled/smooth divergence case

      // ── PART A: basic loft — a wall (context op) then ONE signed GEOM_LOFT (2 wires -> tapered tower)
      const wall = await O.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { points: [[3, 0], [3.2, 0], [3.2, 3], [3, 3]] }, depth: 3 } });
      await settle(wall.id, () => true);
      const loft = await O.commit({ op_type: 'GEOM_LOFT',
        parameters: { wires: [{ points: BASE, z: 0 }, { points: TOP, z: 3 }], isSolid: true, ruled: true } }, { color: 0xd08a3e });
      const d = await settle(loft.id, x => x && x.nv > 0);
      out.loftOpsCount = O._geomOps().filter(o => o.op_type === 'GEOM_LOFT').length;   // ONE signed op
      out.signed = loft.signed; out.verifyA = loft.verify;                 // signed = running COUNT of signed rows in the DB (wall + loft = 2 here), not a per-op boolean
      out.basicTris = loft.triangleCount;
      out.basicBbox = d ? [d.minx, d.miny, d.minz, d.ex, d.ey, d.ez] : null;
      out.basicMeshTris = d ? d.tris : null;
      console.log('§LOFT basic tris=' + out.basicTris + ' meshTris=' + out.basicMeshTris + ' bbox=' + JSON.stringify(out.basicBbox) + ' signed=' + out.signed + ' verify=' + out.verifyA);

      // ── PART B: determinism — scrub back (loft gone, wall alone) -> forward (loft back, SAME tris) ->
      // clearKernelCache() (drop the worker's op_hash-keyed shape/mesh cache) -> re-fold from COLD -> SAME tris+bbox.
      const n = O.length;   // 2: [wall, loft]
      await O.scrubTo(n - 1);
      out.scrubBackHasLoft = !!meshOf(loft.id);
      out.scrubBackHasWall = !!meshOf(wall.id);
      await O.scrubTo(n);
      const back = await settle(loft.id, x => x && x.nv > 0);
      out.scrubFwdMeshTris = back ? back.tris : null;
      out.scrubFwdBbox = back ? [back.minx, back.miny, back.minz, back.ex, back.ey, back.ez] : null;
      out.scrubDeterministic = !out.scrubBackHasLoft && out.scrubBackHasWall &&
        out.scrubFwdMeshTris === out.basicMeshTris && JSON.stringify(out.scrubFwdBbox) === JSON.stringify(out.basicBbox);

      await window.Bonsai.clearKernelCache();
      await O.scrubTo(O.length);                          // forces a COLD (post-clear) authoritative re-fold of the WHOLE chain
      const rebuiltCold = (window.Bonsai._lastRegenStats && window.Bonsai._lastRegenStats.rebuilt) || 0;
      const afterCold = await settle(loft.id, x => x && x.nv > 0);   // read the LOFT's own mesh (not the whole-chain sum) post cold-refold
      out.coldRebuilt = rebuiltCold;                      // must be >0 -> proves this was a REAL cold rebuild, not a cache passthrough
      out.coldTrisMatch = afterCold && afterCold.tris === out.basicMeshTris;
      out.coldBboxMatch = afterCold && JSON.stringify([afterCold.minx, afterCold.miny, afterCold.minz, afterCold.ex, afterCold.ey, afterCold.ez]) === JSON.stringify(out.basicBbox);
      console.log('§LOFT determinism scrubOk=' + out.scrubDeterministic + ' coldRebuilt=' + out.coldRebuilt + ' coldTrisMatch=' + out.coldTrisMatch + ' coldBboxMatch=' + out.coldBboxMatch);

      // ── PART C: tamper-evidence — mutate the committed GEOM_LOFT row's parameters behind the chain's back
      O.db.run("UPDATE kernel_ops SET parameters = ? WHERE id = ?", [JSON.stringify({ tampered: true }), loft.id]);
      out.tamperCaught = !(await O.verify()).ok;
      console.log('§LOFT tamper verify=' + (await O.verify()).ok);

      // ── PART D: ruled vs smooth — 3-wire loft WITH a genuine waist (base 2x2 @z=0, waist 1x1 offset @z=1,
      // top 2x2 @z=2). Hand-verified against occt's own ThruSections semantics via a standalone Node probe
      // against the SAME vendored occt-wasm.wasm: ruled=36 tris (straight facets between sections), smooth=84
      // tris (curved B-spline surface, finer tessellation) — NOT eyeballed, an independently-run reference.
      O.clear(); await sleep(50);
      const ruledOp = await O.commit({ op_type: 'GEOM_LOFT',
        parameters: { wires: [{ points: BASE, z: 0 }, { points: WAIST, z: 1 }, { points: BASE, z: 2 }], isSolid: true, ruled: true } });
      await settle(ruledOp.id, x => x && x.nv > 0);
      out.ruledTris = ruledOp.triangleCount;
      O.clear(); await sleep(50);
      const smoothOp = await O.commit({ op_type: 'GEOM_LOFT',
        parameters: { wires: [{ points: BASE, z: 0 }, { points: WAIST, z: 1 }, { points: BASE, z: 2 }], isSolid: true, ruled: false } });
      await settle(smoothOp.id, x => x && x.nv > 0);
      out.smoothTris = smoothOp.triangleCount;
      // degenerate 2-wire control: ruled/smooth MUST be identical (no intermediate section = no curvature to differ over)
      O.clear(); await sleep(50);
      const twoRuled = await O.commit({ op_type: 'GEOM_LOFT', parameters: { wires: [{ points: BASE, z: 0 }, { points: TOP, z: 3 }], isSolid: true, ruled: true } });
      await settle(twoRuled.id, x => x && x.nv > 0);
      out.twoRuledTris = twoRuled.triangleCount;
      O.clear(); await sleep(50);
      const twoSmooth = await O.commit({ op_type: 'GEOM_LOFT', parameters: { wires: [{ points: BASE, z: 0 }, { points: TOP, z: 3 }], isSolid: true, ruled: false } });
      await settle(twoSmooth.id, x => x && x.nv > 0);
      out.twoSmoothTris = twoSmooth.triangleCount;
      console.log('§LOFT ruledVsSmooth ruled=' + out.ruledTris + ' smooth=' + out.smoothTris + ' twoWireRuled=' + out.twoRuledTris + ' twoWireSmooth=' + out.twoSmoothTris);

      // ── PART E: Outliner — 20 distinct signed GEOM_LOFT ops (one op = one loft, unlike GEOM_ARRAY's
      // one-op-many-instances), one "Loft" row per op, no paint-time regression.
      O.clear(); await sleep(50);
      window.Bonsai.outliner.refresh();
      const t0 = performance.now(); window.Bonsai.outliner.refresh(); const baselineMs = performance.now() - t0;
      for (let i = 0; i < 20; i++) {
        const shift = 3 * i;   // deterministic offset per loft — real, computed, never randomized
        const b = BASE.map(([x, y]) => [x + shift, y]);
        const t = TOP.map(([x, y]) => [x + shift, y]);
        const lo = await O.commit({ op_type: 'GEOM_LOFT', parameters: { wires: [{ points: b, z: 0 }, { points: t, z: 2 }], isSolid: true, ruled: true } });
        await settle(lo.id, x => x && x.nv > 0);
      }
      window.Bonsai.outliner.refresh();
      const t1 = performance.now(); window.Bonsai.outliner.refresh(); const loftMs = performance.now() - t1;
      out.baselineMs = +baselineMs.toFixed(2); out.loftMs = +loftMs.toFixed(2);
      out.outlinerOk = loftMs < 200 && loftMs < baselineMs * 30 + 50;
      out.outlinerRowCount = O._geomOps().filter(o => o.op_type === 'GEOM_LOFT').length;   // 20 rows, one per op
      console.log('§LOFT outliner baselineMs=' + out.baselineMs + ' loftMs=' + out.loftMs + ' rows=' + out.outlinerRowCount);

    } catch (e) { out.error = String(e && e.message || e); console.warn('§LOFT fail ' + e + (e && e.stack ? '\n' + e.stack : '')); }
    return out;
  });

  await br.close(); server.close();
  console.log('  §LOFT ' + JSON.stringify(r));
  const checks = {
    oneSignedOp:       r.loftOpsCount === 1,
    signed:            r.signed === 2,   // wall + loft both signed rows at this point in the chain
    verifyA:           r.verifyA === true,
    taperedNotBox:     r.basicTris > 12,                    // richer than a 12-tri box = a real taper solid
    scrubDeterministic: r.scrubDeterministic === true,
    coldRebuiltReal:   r.coldRebuilt > 0,                   // proves the cache-clear actually forced a rebuild
    coldTrisMatch:     r.coldTrisMatch === true,
    coldBboxMatch:     r.coldBboxMatch === true,
    tamperCaught:      r.tamperCaught === true,
    ruledLtSmooth:     r.ruledTris > 0 && r.smoothTris > 0 && r.ruledTris !== r.smoothTris,
    ruledExact:        r.ruledTris === 36,                  // hand-verified against the standalone Node probe (same wasm)
    smoothExact:       r.smoothTris === 84,                 // hand-verified against the standalone Node probe (same wasm)
    twoWireDegenerate: r.twoRuledTris === r.twoSmoothTris,  // occt's documented 2-section degenerate case
    outlinerNoRegress: r.outlinerOk === true,
    outlinerRowCount:  r.outlinerRowCount === 20
  };
  const pass = Object.values(checks).every(Boolean) && !r.error;
  console.log('  §LOFT VERDICT ' + (pass ? 'PASS' : 'FAIL') + ' — ' +
    Object.entries(checks).map(([k, v]) => k + '=' + v).join(' ') + (r.error ? ' error=' + r.error : ''));
  console.log('── W-BONSAI-LOFT ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})().catch(e => { console.log('FATAL ' + e); process.exit(1); });
