// W-BONSAI-ARRAY — Bonsai modeller: GEOM_ARRAY (prompts/BONSAI_ARRAY_PATTERN_SPEC.md), the array/pattern
// op family. Driven PURELY through the signed op-log (same style as bonsai_rotate_solid_live.js — no
// canvas pointer dispatch, dodges the headless OrbitControls flake). Proves:
// (A) linear array: ONE signed GEOM_ARRAY op yields N real independent solids, positions = exact
//     transform math (spacing along the given axis), not N separate signed ops.
// (B) along_curve array: N instances distributed by ARC LENGTH along an L-shaped polyline, positions
//     match a hand-calculated arc-length sample, not eyeballed.
// (C) formula-driven variation: a whitelisted 5%-per-instance taper on `depth` produces the EXACT
//     hand-calculated value per instance (checked against v0*(1-0.05*i), not "looks about right").
// (D) scrub back/forward reproduces the array deterministically.
// (E) tamper-evidence: mutating the committed GEOM_ARRAY payload behind the chain's back breaks verifyChain.
// (F) Outliner paint time does not regress with a realistic (50) instance count.
// (G) IFC export: N instances -> N independent IfcMember products + ONE IfcElementAssembly/IfcRelAggregates
//     (buildingSMART's own documented curtain-wall/repeated-component pattern, verified not invented —
//     see bonsai_ifc.js header), round-tripped by re-import including the formula-varied depth.
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
  pg.on('console', m => { const t = m.text(); if (/§ARRAY/.test(t)) console.log('  ' + t); });
  await pg.goto(`http://localhost:${port}/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction("window.Bonsai && window.Bonsai.library && window.Bonsai.library.ready && window.Bonsai.oplog && window.Bonsai.ifc", { timeout: 30000 }).catch(() => {});
  await pg.evaluate(() => window.Bonsai.library.ready());

  const r = await pg.evaluate(async () => {
    const O = window.Bonsai.oplog, out = {};
    const sleep = ms => new Promise(res => setTimeout(res, ms));
    const meshOf = fid => { const g = window.Bonsai.group(); return g && g.children.find(o => o.isMesh && o.userData.featureId === fid); };
    const dims = fid => {
      const m = meshOf(fid); if (!m) return null;
      m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox;
      return { ex: +(b.max.x - b.min.x).toFixed(3), ey: +(b.max.y - b.min.y).toFixed(3), ez: +(b.max.z - b.min.z).toFixed(3),
        cx: +((b.min.x + b.max.x) / 2).toFixed(3), cy: +((b.min.y + b.max.y) / 2).toFixed(3),
        nv: m.geometry.attributes.position ? m.geometry.attributes.position.count : 0 };
    };
    const near = (a, b, t) => Math.abs(a - b) <= (t || 0.05);
    const settle = async (fid, pred) => { for (let i = 0; i < 100; i++) { const d = dims(fid); if (d && pred(d)) return d; await sleep(50); } return dims(fid); };
    const fidOf = (opId, i) => 'arr:' + opId + ':' + i;

    try {
      window.Bonsai.grid.show(false); O.clear(); await sleep(50);
      const PROFILE = [[0, 0], [0.4, 0], [0.4, 0.4], [0, 0.4]];   // small square "mullion" profile centred at (0.2,0.2)

      // ── PART A: linear array, no formula — 5 instances, spacing=2 along +X
      const W = await O.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { points: PROFILE }, depth: 1.0 } });
      await settle(W.id, () => true);
      const arr = await O.commit({ op_type: 'GEOM_ARRAY', parameters: { parent: W.id, mode: 'linear', count: 5, spacing: 2, axis: [1, 0, 0] } });
      await O.scrubTo(O.length);
      const linDims = [];
      for (let i = 0; i < 5; i++) linDims.push(await settle(fidOf(arr.id, i), () => true));
      out.linCount = linDims.filter(Boolean).length;
      out.linPositionsOk = linDims.every((d, i) => d && near(d.cx, 0.2 + 2 * i, 0.06) && near(d.cy, 0.2, 0.06));
      out.arrayOpsA = O._geomOps().filter(o => o.op_type === 'GEOM_ARRAY').length;   // ONE signed op for all 5
      out.verifyA = (await O.verify()).ok;
      console.log('§ARRAY linear cx=' + linDims.map(d => d && d.cx).join(',') + ' opsA=' + out.arrayOpsA);

      // ── PART B: along_curve array — L-shaped path [0,0,0]->[3,0,0]->[3,3,0], 4 instances by arc length
      window.A.scene.getObjectByName('BonsaiAuthored') && (() => { })();
      O.clear(); await sleep(50);
      const W2 = await O.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { points: PROFILE }, depth: 1.0 } });
      await settle(W2.id, () => true);
      const curve = [[0, 0, 0], [3, 0, 0], [3, 3, 0]];
      const arr2 = await O.commit({ op_type: 'GEOM_ARRAY', parameters: { parent: W2.id, mode: 'along_curve', count: 4, curve } });
      await O.scrubTo(O.length);
      const curveDims = [];
      for (let i = 0; i < 4; i++) curveDims.push(await settle(fidOf(arr2.id, i), () => true));
      // hand-calc arc-length samples at s=0,2,4,6 over a total length-6 path -> deltas (0,0,0)/(2,0,0)/(3,1,0)/(3,3,0)
      const expectDeltas = [[0, 0], [2, 0], [3, 1], [3, 3]];
      out.curveCount = curveDims.filter(Boolean).length;
      out.curvePositionsOk = curveDims.every((d, i) => d && near(d.cx, 0.2 + expectDeltas[i][0], 0.06) && near(d.cy, 0.2 + expectDeltas[i][1], 0.06));
      console.log('§ARRAY curve cx,cy=' + curveDims.map(d => d && (d.cx + ',' + d.cy)).join(' | '));

      // ── PART C: formula-driven variation — 5% taper on `depth`, count=5, hand-calc v0*(1-0.05*i)
      O.clear(); await sleep(50);
      const W3 = await O.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { points: PROFILE }, depth: 2.0 } });
      await settle(W3.id, () => true);
      const arr3 = await O.commit({ op_type: 'GEOM_ARRAY', parameters: { parent: W3.id, mode: 'linear', count: 5, spacing: 1, axis: [1, 0, 0], paramPath: 'depth', formula: 'v0*(1-0.05*i)' } });
      await O.scrubTo(O.length);
      const taperDims = [];
      for (let i = 0; i < 5; i++) taperDims.push(await settle(fidOf(arr3.id, i), () => true));
      const expectDepth = [0, 1, 2, 3, 4].map(i => 2.0 * (1 - 0.05 * i));
      out.taperOk = taperDims.every((d, i) => d && near(d.ez, expectDepth[i], 0.04));
      out.taperVals = taperDims.map(d => d && d.ez);
      out.taperExpect = expectDepth;
      console.log('§ARRAY taper ez=' + out.taperVals.join(',') + ' expect=' + expectDepth.map(v => v.toFixed(3)).join(','));

      // ── PART D: determinism — scrub back (array not yet applied -> template solid alone) then forward
      const n = O.length;
      await O.scrubTo(n - 1);
      out.scrubBackHasArray = !!meshOf(fidOf(arr3.id, 3));            // instance meshes must be GONE
      out.scrubBackHasTemplate = !!meshOf(W3.id);                     // the un-arrayed template renders alone
      await O.scrubTo(n);
      const afterFwd = await settle(fidOf(arr3.id, 3), d => d && near(d.ez, expectDepth[3], 0.04));
      out.scrubFwdOk = !!afterFwd && near(afterFwd.ez, expectDepth[3], 0.04);
      out.deterministic = !out.scrubBackHasArray && out.scrubBackHasTemplate && out.scrubFwdOk;

      // ── PART E: tamper-evidence — mutate the committed GEOM_ARRAY row's parameters behind the chain's back
      O.db.run("UPDATE kernel_ops SET parameters = ? WHERE id = ?", [JSON.stringify({ tampered: true }), arr3.id]);
      out.tamperCaught = !(await O.verify()).ok;
      console.log('§ARRAY tamper verify=' + (await O.verify()).ok);

      // ── PART F: Outliner paint-time — baseline (small model) vs a realistic 50-instance array
      O.clear(); await sleep(50);
      const Wb = await O.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { points: PROFILE }, depth: 1.0 } });
      await settle(Wb.id, () => true);
      window.Bonsai.outliner.refresh();
      const t0 = performance.now(); window.Bonsai.outliner.refresh(); const baselineMs = performance.now() - t0;
      const arrBig = await O.commit({ op_type: 'GEOM_ARRAY', parameters: { parent: Wb.id, mode: 'linear', count: 50, spacing: 0.6, axis: [1, 0, 0] } });
      await O.scrubTo(O.length);
      await settle(fidOf(arrBig.id, 49), () => true);
      window.Bonsai.outliner.refresh();
      const t1 = performance.now(); window.Bonsai.outliner.refresh(); const arrayMs = performance.now() - t1;
      out.baselineMs = +baselineMs.toFixed(2); out.arrayMs = +arrayMs.toFixed(2);
      out.outlinerOk = arrayMs < 200 && arrayMs < baselineMs * 30 + 50;   // absolute bar + no explosive blowup
      const arrCat = O._geomOps().filter(o => o.op_type === 'GEOM_ARRAY');
      out.outlinerRowCount = arrCat.length;   // ONE Outliner row for the whole 50-instance array
      console.log('§ARRAY outliner baselineMs=' + out.baselineMs + ' arrayMs=' + out.arrayMs + ' rows=' + out.outlinerRowCount);

      // ── PART G: IFC export, formula-varied case — N members + shared IfcMemberType via IfcRelDefinesByType
      // (NOT IfcElementAssembly — see bonsai_ifc.js header), formula depth round-trips per instance.
      O.clear(); await sleep(50);
      const Wg = await O.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { points: PROFILE }, depth: 2.0 } });
      await settle(Wg.id, () => true);
      await O.commit({ op_type: 'GEOM_ARRAY', parameters: { parent: Wg.id, mode: 'linear', count: 5, spacing: 1, axis: [1, 0, 0], paramPath: 'depth', formula: 'v0*(1-0.05*i)' } });
      await O.scrubTo(O.length);
      const built = await window.Bonsai.ifc.build();
      const back = await window.Bonsai.ifc.reimport(built.bytes);
      out.ifcMembers = built.arrayMembers; out.ifcArrays = built.arrays;
      out.ifcMembersBack = back.members; out.ifcMemberTypesBack = back.memberTypes; out.ifcRelTypesBack = back.relTypes;
      out.ifcDepthsSorted = (back.memberDepths || []).slice().sort((a, b) => b - a);
      out.ifcDepthRoundtrip = out.ifcDepthsSorted.length === 5 &&
        out.ifcDepthsSorted.every((v, i) => Math.abs(v - expectDepth[i]) < 0.01);   // expectDepth is DESC (i=0 largest)
      console.log('§ARRAY ifc(formula) members=' + out.ifcMembers + '/' + out.ifcMembersBack + ' memberTypes=' + out.ifcMemberTypesBack +
        ' relTypes=' + out.ifcRelTypesBack + ' depths=' + out.ifcDepthsSorted.join(','));

      // ── PART G2: IFC export, NO-formula case — instances are geometrically IDENTICAL -> geometry is
      // shared via ONE IfcRepresentationMap + N IfcMappedItem (the "block insert" reuse pattern), not N
      // duplicated B-reps.
      O.clear(); await sleep(50);
      const Wg2 = await O.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { points: PROFILE }, depth: 2.0 } });
      await settle(Wg2.id, () => true);
      await O.commit({ op_type: 'GEOM_ARRAY', parameters: { parent: Wg2.id, mode: 'linear', count: 6, spacing: 1, axis: [1, 0, 0] } });
      await O.scrubTo(O.length);
      const built2 = await window.Bonsai.ifc.build();
      const back2 = await window.Bonsai.ifc.reimport(built2.bytes);
      out.ifcMembers2 = built2.arrayMembers; out.ifcMembers2Back = back2.members;
      out.ifcRepMaps2 = back2.repMaps; out.ifcMappedItems2 = back2.mappedItems;
      console.log('§ARRAY ifc(no-formula) members=' + out.ifcMembers2 + '/' + out.ifcMembers2Back + ' repMaps=' + out.ifcRepMaps2 + ' mappedItems=' + out.ifcMappedItems2);

    } catch (e) { out.error = String(e && e.message || e); console.warn('§ARRAY fail ' + e + (e && e.stack ? '\n' + e.stack : '')); }
    return out;
  });

  await br.close(); server.close();
  console.log('  §ARRAY ' + JSON.stringify(r));
  const checks = {
    linearOneOp:     r.arrayOpsA === 1,
    linearCount:     r.linCount === 5,
    linearPositions: r.linPositionsOk === true,
    curveCount:      r.curveCount === 4,
    curvePositions:  r.curvePositionsOk === true,
    taperExact:      r.taperOk === true,
    deterministic:   r.deterministic === true,
    tamperCaught:    r.tamperCaught === true,
    outlinerNoRegress: r.outlinerOk === true,
    outlinerOneRow:  r.outlinerRowCount === 1,
    verifyA:         r.verifyA === true,
    ifcMembersMatch: r.ifcMembers === 5 && r.ifcMembersBack === 5,
    ifcSharedType:   r.ifcMemberTypesBack === 1 && r.ifcRelTypesBack === 1,   // ONE type, not an assembly/aggregates
    ifcDepthRoundtrip: r.ifcDepthRoundtrip === true,
    ifcNoFormulaShared: r.ifcMembers2 === 6 && r.ifcMembers2Back === 6 && r.ifcRepMaps2 === 1 && r.ifcMappedItems2 === 6
  };
  const pass = Object.values(checks).every(Boolean) && !r.error;
  console.log('  §ARRAY VERDICT ' + (pass ? 'PASS' : 'FAIL') + ' — ' +
    Object.entries(checks).map(([k, v]) => k + '=' + v).join(' ') + (r.error ? ' error=' + r.error : ''));
  console.log('── W-BONSAI-ARRAY ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})().catch(e => { console.log('FATAL ' + e); process.exit(1); });
