// W-BONSAI-TIER1 — Bonsai modeller: Tier 1 kernel shoulders (prompts/BONSAI_KERNEL_RESEARCH.md
// §GAP-TO-COMPETITIVE Tier 1): GEOM_REVOLVE / GEOM_SHELL / GEOM_OFFSET / GEOM_FILLET_VARIABLE /
// GEOM_CHAMFER_DIST_ANGLE / GEOM_DRAFT. Same recipe + witness style as bonsai_loft_live.js — driven
// PURELY through the signed op-log (O.commit()), no canvas pointer dispatch. Per-op checks: real solid
// (non-zero triangles, via the AUTHORITATIVE commit()/scrub() return value — never a scene-mesh lookup
// across an oplog.clear(), which (unlike the real bClear button — see modeller.html bClear.onclick,
// which empties the THREE group BEFORE calling oplog.clear()) does not itself wipe stale meshes; this
// witness mirrors that same clearAll() discipline explicitly, see helper below), determinism (scrub
// back/fwd + COLD cache re-fold reproduces identical tris), tamper-evidence (verifyChain fails), and —
// where the op has a real second parameter (angle/radius range/distance) — a comparative check that the
// parameter ACTUALLY changes the result (not a no-op wrapper). Outliner: one row per op-type category.
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
  pg.on('console', m => { const t = m.text(); if (/§TIER1|§KRN|§OPLOG/.test(t)) console.log('  ' + t); });
  await pg.goto(`http://localhost:${port}/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction("window.Bonsai && window.Bonsai.library && window.Bonsai.library.ready && window.Bonsai.oplog", { timeout: 30000 }).catch(() => {});
  await pg.evaluate(() => window.Bonsai.library.ready());

  const r = await pg.evaluate(async () => {
    const O = window.Bonsai.oplog, out = {};
    const sleep = ms => new Promise(res => setTimeout(res, ms));
    // clearAll() mirrors the REAL bClear button (modeller.html bClear.onclick): empty the THREE group
    // FIRST, then oplog.clear() — oplog.clear() alone does not wipe scene meshes (LEAF ops optimistically
    // APPEND, never remove), so a bare O.clear() between two LEAF commits leaves a stale mesh with the
    // SAME reused featureId (ids restart at 1 on every fresh empty db) sitting in the group.
    function clearAll() { const g = window.Bonsai.group(); if (g) { while (g.children.length) g.remove(g.children[0]); } O.clear(); }
    const meshOf = fid => { const g = window.Bonsai.group(); return g && g.children.find(o => o.isMesh && o.userData.featureId === fid); };
    const dims = fid => {
      const m = meshOf(fid); if (!m) return null;
      m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox;
      const nv = m.geometry.attributes.position ? m.geometry.attributes.position.count : 0;
      const tris = m.geometry.index ? m.geometry.index.count / 3 : nv / 3;
      return { ex: +(b.max.x - b.min.x).toFixed(3), ey: +(b.max.y - b.min.y).toFixed(3), ez: +(b.max.z - b.min.z).toFixed(3),
        minx: +b.min.x.toFixed(3), miny: +b.min.y.toFixed(3), minz: +b.min.z.toFixed(3), nv, tris };
    };
    const settle = async (fid, pred) => { for (let i = 0; i < 100; i++) { const d = dims(fid); if (d && pred(d)) return d; await sleep(50); } return dims(fid); };
    const WALLPTS = [[0, 0], [2, 0], [2, 2], [0, 2]];   // a 2x2x2 cube (depth 2) — shared parent for every parent-mutating op below
    const BOX_CENTROID = [1, 1, 1];   // WALLPTS extruded depth 2 -> a 2x2x2 cube centred here
    // GEOM_DRAFT's verified real convention (see bonsai_kernel_worker.js GEOM_DRAFT comment): `direction`
    // must be the picked face's OWN outward normal for a real taper on a side face. For our axis-aligned
    // box, the outward normal is the axis of largest |mid - centroid|, signed by that difference.
    function faceNormalOf(face) {
      const d = [face.mid[0] - BOX_CENTROID[0], face.mid[1] - BOX_CENTROID[1], face.mid[2] - BOX_CENTROID[2]];
      const a = d.map(Math.abs); const axis = a[0] >= a[1] && a[0] >= a[2] ? 0 : (a[1] >= a[2] ? 1 : 2);
      const n = [0, 0, 0]; n[axis] = d[axis] > 0 ? 1 : -1;
      return { x: n[0], y: n[1], z: n[2] };
    }

    // Common determinism+tamper harness for a NON-LEAF parent-mutating op (SHELL/OFFSET/FILLET_VARIABLE/
    // CHAMFER_DIST_ANGLE/DRAFT): commit a fresh wall, apply the op, prove (1) real solid (tris>0, != plain
    // box's 12), (2) scrub back (op undone -> plain box, 12 tris) -> forward (op back, SAME tris),
    // (3) COLD cache re-fold (clearKernelCache + scrub to tip) reproduces the identical tris, (4) tamper
    // caught. Returns the raw numbers for the CALLER to add op-specific comparative assertions.
    async function testParentOp(label, opType, buildParams) {
      clearAll(); await sleep(50);
      const wall = await O.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { points: WALLPTS }, depth: 2 } }, { color: 0x9fb4c8 });
      const wd = await settle(wall.id, x => x && x.nv > 0);
      const baseTris = wd ? wd.tris : null;   // 12 (plain box)
      let edges = null, faces = null;
      if (buildParams.length >= 3) edges = (await window.Bonsai.queryEdges(wall.id)).edges;
      if (buildParams.length >= 4) faces = (await window.Bonsai.queryFaces(wall.id)).faces;
      const params = buildParams(wall.id, wd, edges, faces);
      const res = await O.commit({ op_type: opType, parameters: params }, { color: 0xd08a3e });
      const d = await settle(wall.id, x => x && x.tris === res.triangleCount);
      const tris = d ? d.tris : null;

      const n = O.length;   // 2: [wall, op]
      await O.scrubTo(n - 1);
      const backTris = (dims(wall.id) || {}).tris;
      await O.scrubTo(n);
      const fwd = await settle(wall.id, x => x && x.tris === tris);
      const fwdTris = fwd ? fwd.tris : null;

      await window.Bonsai.clearKernelCache();
      await O.scrubTo(O.length);
      const coldRebuilt = (window.Bonsai._lastRegenStats && window.Bonsai._lastRegenStats.rebuilt) || 0;
      const cold = await settle(wall.id, x => x && x.tris === tris);
      const coldTris = cold ? cold.tris : null;

      O.db.run("UPDATE kernel_ops SET parameters = ? WHERE id = ?", [JSON.stringify({ tampered: true }), res.id]);
      const tamperCaught = !(await O.verify()).ok;

      console.log('§TIER1 ' + label + ' baseTris=' + baseTris + ' tris=' + tris + ' backTris=' + backTris +
        ' fwdTris=' + fwdTris + ' coldRebuilt=' + coldRebuilt + ' coldTris=' + coldTris + ' tamperCaught=' + tamperCaught +
        ' verify=' + res.verify + ' signed=' + res.signed + ' dbbox=' + JSON.stringify(d ? [d.ex, d.ey, d.ez] : null));
      return { label, wallId: wall.id, opId: res.id, edges, faces, baseTris, tris, backTris, fwdTris, coldRebuilt, coldTris,
        tamperCaught, verify: res.verify, signed: res.signed, ex: d && d.ex, ey: d && d.ey, ez: d && d.ez };
    }

    try {
      window.Bonsai.grid.show(false);

      // ══════════ PART A — GEOM_REVOLVE (LEAF, highest-value Tier 1 op) ══════════
      // Axis IN the profile's own plane (z=0, axis=X — a Z axis would keep every point in its own z=const
      // plane = a degenerate flat annulus, NOT a solid; an in-plane axis genuinely sweeps the profile
      // through 3D). Profile = radius-1..2, length-0..2 rectangle -> a hollow tube/column when revolved.
      clearAll(); await sleep(50);
      const TUBE = [[0, 1], [2, 1], [2, 2], [0, 2]];
      const AXIS_X = { point: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } };
      const fullRev = await O.commit({ op_type: 'GEOM_REVOLVE',
        parameters: { profile: { points: TUBE, z: 0 }, axis: AXIS_X, angleRad: 2 * Math.PI } }, { color: 0xd08a3e });
      await settle(fullRev.id, x => x && x.nv > 0);
      out.revolveFullTris = fullRev.triangleCount; out.revolveFullLeaf = fullRev.appended === true;
      console.log('§TIER1 revolve-full tris=' + out.revolveFullTris + ' leafAppended=' + out.revolveFullLeaf + ' signed=' + fullRev.signed + ' verify=' + fullRev.verify);

      clearAll(); await sleep(50);
      const halfRev = await O.commit({ op_type: 'GEOM_REVOLVE',
        parameters: { profile: { points: TUBE, z: 0 }, axis: AXIS_X, angleRad: Math.PI / 2 } }, { color: 0xd08a3e });
      await settle(halfRev.id, x => x && x.nv > 0);
      out.revolveHalfTris = halfRev.triangleCount;   // angleRad actually changes the result — the "not a no-op wrapper" proof
      console.log('§TIER1 revolve-quarter tris=' + out.revolveHalfTris);

      // determinism (COLD cache re-fold) + tamper, on a fresh single-op chain
      clearAll(); await sleep(50);
      const revA = await O.commit({ op_type: 'GEOM_REVOLVE', parameters: { profile: { points: TUBE, z: 0 }, axis: AXIS_X, angleRad: 2 * Math.PI } });
      await settle(revA.id, x => x && x.nv > 0);
      await window.Bonsai.clearKernelCache();
      await O.scrubTo(O.length);
      out.revolveColdRebuilt = (window.Bonsai._lastRegenStats && window.Bonsai._lastRegenStats.rebuilt) || 0;
      const revCold = await settle(revA.id, x => x && x.nv > 0);
      out.revolveColdMatch = revCold && revCold.tris === out.revolveFullTris;
      O.db.run("UPDATE kernel_ops SET parameters = ? WHERE id = ?", [JSON.stringify({ tampered: true }), revA.id]);
      out.revolveTamperCaught = !(await O.verify()).ok;
      console.log('§TIER1 revolve-determinism coldRebuilt=' + out.revolveColdRebuilt + ' coldMatch=' + out.revolveColdMatch + ' tamperCaught=' + out.revolveTamperCaught);

      // ══════════ PART B — GEOM_SHELL (non-LEAF, face-pick) ══════════
      // Remove the TOP face (highest mid.z) of the 2x2x2 box, thickness 0.3 -> an open-top hollow box.
      const shellR = await testParentOp('shell', 'GEOM_SHELL', (parentId, wd, edges, faces) => {
        const top = faces.slice().sort((a, b) => b.mid[2] - a.mid[2])[0];
        out._shellFaceCount = faces.length;   // a box has 6 faces
        return { parent: parentId, faces: [top.i], thickness: 0.3, tolerance: 1e-3 };
      });
      out.shell = shellR;

      // ══════════ PART C — GEOM_OFFSET (non-LEAF, whole-solid, no pick device) ══════════
      const offsetGrow = await testParentOp('offset-grow', 'GEOM_OFFSET', (parentId) => ({ parent: parentId, distance: 0.3, tolerance: 1e-3 }));
      out.offsetGrow = offsetGrow;
      const offsetShrink = await testParentOp('offset-shrink', 'GEOM_OFFSET', (parentId) => ({ parent: parentId, distance: -0.3, tolerance: 1e-3 }));
      out.offsetShrink = offsetShrink;

      // ══════════ PART D — GEOM_FILLET_VARIABLE (non-LEAF, single-edge-pick) ══════════
      // Vary radius 0.05->0.4 along the LONGEST (vertical, length=2) edge; compare against a plain
      // constant-radius GEOM_FILLET on the SAME edge to prove the variable-radius result is genuinely
      // different topology (not silently collapsing to one of the two constants).
      const filletVarR = await testParentOp('fillet-variable', 'GEOM_FILLET_VARIABLE', (parentId, wd, edges) => {
        const longest = edges.slice().sort((a, b) => b.len - a.len)[0];
        out._fvEdgeLen = longest.len; out._fvEdgeIdx = longest.i;
        return { parent: parentId, edges: [longest.i], startRadius: 0.05, endRadius: 0.4 };
      });
      out.filletVariable = filletVarR;
      // comparison: same edge, CONSTANT radius 0.4 (the variable's own end radius) via the EXISTING GEOM_FILLET
      clearAll(); await sleep(50);
      const cwall = await O.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { points: WALLPTS }, depth: 2 } });
      await settle(cwall.id, x => x && x.nv > 0);
      const constFillet = await O.commit({ op_type: 'GEOM_FILLET', parameters: { parent: cwall.id, edges: [out._fvEdgeIdx], radius: 0.4, kind: 'fillet' } });
      const cd = await settle(cwall.id, x => x && x.tris === constFillet.triangleCount);
      out.constFilletTris = cd ? cd.tris : null;
      console.log('§TIER1 fillet-variable-vs-constant varTris=' + out.filletVariable.tris + ' constTris=' + out.constFilletTris);

      // ══════════ PART E — GEOM_CHAMFER_DIST_ANGLE (non-LEAF, edge-pick) ══════════
      // Same longest edge, distance 0.3 @ angle 30° — proves a real, non-degenerate chamfered solid
      // (tris grows from the plain box's 12). HONEST CAVEAT (probed directly, not guessed): a single
      // new planar bevel face on a symmetric corner edge keeps the SAME triangle COUNT regardless of
      // the exact angle value (topology is angle-invariant here; only vertex positions shift), so a
      // tris-based "vs a 45°-equivalent symmetric chamfer" comparison is NOT a valid oracle for this
      // simple box+single-edge case — dropped rather than forced; the angle-sensitivity proof for this
      // Tier lives in PART A (revolve angleRad) and PART D (fillet_variable start/end radius) instead.
      const chamferDAR = await testParentOp('chamfer-dist-angle', 'GEOM_CHAMFER_DIST_ANGLE', (parentId, wd, edges) => {
        const longest = edges.slice().sort((a, b) => b.len - a.len)[0];
        out._cdaEdgeIdx = longest.i;
        return { parent: parentId, edges: [longest.i], distance: 0.3, angleDeg: 30 };
      });
      out.chamferDistAngle = chamferDAR;

      // ══════════ PART F — GEOM_DRAFT (non-LEAF, single-face-pick) ══════════
      // Pull a SIDE face (mid.z near mid-height, i.e. NOT top/bottom) by 0.5 rad, direction = that
      // face's OWN outward normal (the verified-real convention — see bonsai_kernel_worker.js's GEOM_DRAFT
      // comment and faceNormalOf() above; an arbitrary vertical "pull vector" was directly probed and
      // found to be a silent geometric no-op on a side face, and horizontal top/bottom faces throw).
      const draftR = await testParentOp('draft', 'GEOM_DRAFT', (parentId, wd, edges, faces) => {
        const side = faces.filter(f => Math.abs(f.mid[2] - 1) < 0.1)[0] || faces.find(f => Math.abs(f.mid[2] - 0) > 0.1 && Math.abs(f.mid[2] - 2) > 0.1);
        out._draftFaceIdx = side ? side.i : 0;
        const dir = faceNormalOf(side);
        out._draftDir = dir;
        return { parent: parentId, faces: [side ? side.i : 0], angleRad: 0.5, direction: dir };
      });
      out.draft = draftR;

      // ══════════ PART G — OUTLINER: one row per Tier 1 op-type category, no paint regression ══════════
      // A SEPARATE wall per op (not one wall chained through all 6) — each parent-mutating op invalidates the
      // PRIOR edge/face index resolution of its own parent (shell/offset change the solid's topology, so an
      // edge index resolved before them may no longer be valid after — exactly the failure PART G hit before
      // this fix), so a real building models each feature on its OWN geometry, same as PARTs B-F's isolation.
      clearAll(); await sleep(50);
      window.Bonsai.outliner.refresh();
      const t0 = performance.now(); window.Bonsai.outliner.refresh(); const baselineMs = performance.now() - t0;
      await O.commit({ op_type: 'GEOM_REVOLVE', parameters: { profile: { points: TUBE, z: 0 }, axis: AXIS_X, angleRad: 2 * Math.PI } });
      async function freshWall() { const w = await O.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { points: WALLPTS }, depth: 2 } }); await settle(w.id, x => x && x.nv > 0); return w; }
      const wShell = await freshWall();
      const topF = (await window.Bonsai.queryFaces(wShell.id)).faces.slice().sort((a, b) => b.mid[2] - a.mid[2])[0];
      await O.commit({ op_type: 'GEOM_SHELL', parameters: { parent: wShell.id, faces: [topF.i], thickness: 0.2, tolerance: 1e-3 } });
      const wOffset = await freshWall();
      await O.commit({ op_type: 'GEOM_OFFSET', parameters: { parent: wOffset.id, distance: 0.1, tolerance: 1e-3 } });
      const wFV = await freshWall();
      const fvE = (await window.Bonsai.queryEdges(wFV.id)).edges.slice().sort((a, b) => b.len - a.len)[0];
      await O.commit({ op_type: 'GEOM_FILLET_VARIABLE', parameters: { parent: wFV.id, edges: [fvE.i], startRadius: 0.02, endRadius: 0.1 } });
      const wCDA = await freshWall();
      const cdaE = (await window.Bonsai.queryEdges(wCDA.id)).edges.slice().sort((a, b) => b.len - a.len)[0];
      await O.commit({ op_type: 'GEOM_CHAMFER_DIST_ANGLE', parameters: { parent: wCDA.id, edges: [cdaE.i], distance: 0.1, angleDeg: 20 } });
      const wDraft = await freshWall();
      const sideF = (await window.Bonsai.queryFaces(wDraft.id)).faces.filter(f => Math.abs(f.mid[2] - 1) < 0.1)[0];
      await O.commit({ op_type: 'GEOM_DRAFT', parameters: { parent: wDraft.id, faces: [sideF.i], angleRad: 0.5, direction: faceNormalOf(sideF) } });
      window.Bonsai.outliner.refresh();
      const t1 = performance.now(); window.Bonsai.outliner.refresh(); const tier1Ms = performance.now() - t1;
      out.outlinerBaselineMs = +baselineMs.toFixed(2); out.outlinerTier1Ms = +tier1Ms.toFixed(2);
      out.outlinerOk = tier1Ms < 200;
      const grps = Array.from(document.querySelectorAll('#bonsai-outliner [data-grp]')).map(d => d.getAttribute('data-grp'));
      out.categoriesPresent = ['revolves', 'shells', 'offsets', 'filletvars', 'chamferdas', 'drafts'].every(k => grps.includes(k));
      console.log('§TIER1 outliner baselineMs=' + out.outlinerBaselineMs + ' tier1Ms=' + out.outlinerTier1Ms + ' categoriesPresent=' + out.categoriesPresent + ' grps=' + JSON.stringify(grps));

    } catch (e) { out.error = String(e && e.message || e); console.warn('§TIER1 fail ' + e + (e && e.stack ? '\n' + e.stack : '')); }
    return out;
  });

  await br.close(); server.close();
  console.log('  §TIER1 ' + JSON.stringify(r));
  const P = r;
  // parentOpOk = the PLUMBING invariant every non-LEAF Tier 1 op must satisfy (real solid, deterministic
  // scrub/cold-refold, tamper-evident) — deliberately does NOT require "tris != baseTris" here, since a
  // real geometric change is not always tri-count-visible (offset-shrink keeps the same box topology;
  // a single-face chamfer/draft bevel can too) — see the per-op "actually changed" checks below instead.
  const parentOpOk = (o) => o && o.tris > 0 && o.backTris === o.baseTris &&
    o.fwdTris === o.tris && o.coldRebuilt > 0 && o.coldTris === o.tris && o.tamperCaught === true && o.verify === true;
  const checks = {
    revolveReal:        P.revolveFullTris > 0,
    revolveLeaf:         P.revolveFullLeaf === true,
    revolveAngleMatters: P.revolveHalfTris > 0 && P.revolveFullTris !== P.revolveHalfTris,
    revolveColdRebuiltReal: P.revolveColdRebuilt > 0,
    revolveColdMatch:    P.revolveColdMatch === true,
    revolveTamperCaught: P.revolveTamperCaught === true,
    shellOk:             parentOpOk(P.shell),
    shellChanged:        P.shell && P.shell.tris !== P.shell.baseTris,          // 12 -> 28 (opened+hollowed)
    offsetGrowOk:        parentOpOk(P.offsetGrow),
    offsetShrinkOk:      parentOpOk(P.offsetShrink),
    offsetGrowVsShrink:  P.offsetGrow && P.offsetShrink && P.offsetGrow.ex > P.offsetShrink.ex,   // distance sign actually matters
    filletVariableOk:    parentOpOk(P.filletVariable),
    filletVariableChanged: P.filletVariable && P.filletVariable.tris !== P.filletVariable.baseTris,
    filletVariableDistinctFromConstant: P.filletVariable && P.filletVariable.tris !== P.constFilletTris,
    chamferDistAngleOk:  parentOpOk(P.chamferDistAngle),
    chamferDistAngleChanged: P.chamferDistAngle && P.chamferDistAngle.tris !== P.chamferDistAngle.baseTris,   // 12 -> 16 (real bevel)
    draftOk:             parentOpOk(P.draft),
    draftChanged:        P.draft && (P.draft.ex !== 2 || P.draft.ey !== 2 || P.draft.ez !== 2),   // real bbox shift (see PART F caveat)
    outlinerNoRegress:   P.outlinerOk === true,
    outlinerCategories:  P.categoriesPresent === true
  };
  const pass = Object.values(checks).every(Boolean) && !r.error;
  console.log('  §TIER1 VERDICT ' + (pass ? 'PASS' : 'FAIL') + ' — ' +
    Object.entries(checks).map(([k, v]) => k + '=' + v).join(' ') + (r.error ? ' error=' + r.error : ''));
  console.log('── W-BONSAI-TIER1 ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})().catch(e => { console.log('FATAL ' + e); process.exit(1); });
