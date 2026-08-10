#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — DIAGNOSTIC ONLY, not a committed witness.
 * Root-causing CUT_GATE_CSG_SPEC.md §10's named open gap: GEOM_FILLET on a layer-cut wall's edge throws
 * an OCCT WASM exception. witness_e2e_cut_layers.js's L3 SELECT step (raycast click-loop) is flaky in
 * this environment (reproducibly fails run 1 and 2, unrelated to fillet — box-path click-select via
 * t.pick() works fine in the same run). This script uses the SAME production selection entry point
 * (window.Bonsai.select(fid), the exact call modeller.html's own click handler + its own internal self
 * tests use at e.g. line 5270/5314/5395) to reach the wall directly, then drives the real #b-cut /
 * #b-fillet / #b-applyfillet UI buttons exactly as a user would. Captures the VERBATIM exception via
 * both the page's pageerror listener (t.errs) and a direct in-page try/catch around KernelOps' fillet
 * call path, whichever surfaces it — logs both, invents neither.
 */
'use strict';
const { runE2E } = require('./e2e_harness');

runE2E('DIAG-FILLET-REPRO', async (t) => {
  await t.open('Duplex');

  const report = await t.pg.evaluate(() => {
    const ops = window.Bonsai.oplog._geomOps();
    const out = { box: 0, layer: [], refused: 0 };
    ops.forEach(op => {
      if (op.op_type !== 'GEOM_INSERT') return;
      const P = op.parameters; if (!P || !P.ifc_class || !/Wall/i.test(P.ifc_class)) return;
      let boxOk = false, layerSeed = null;
      try { boxOk = !!window.Bonsai._insertCutBox(op); } catch (e) {}
      if (!boxOk) { try { layerSeed = window.Bonsai._insertCutLayerSeed(op); } catch (e) {} }
      if (boxOk) out.box++;
      else if (layerSeed) out.layer.push({ fid: op.id, nLayers: layerSeed.layers.length });
      else out.refused++;
    });
    return out;
  });
  console.log('  §POP box=' + report.box + ' layer=' + report.layer.length + ' refused=' + report.refused);

  // Target BOTH fid=87 (7-layer party wall, per §10) and fid=90 (17m 7-layer wall, per §10) — the same
  // 2 walls §10's own ad-hoc tries used, so this is a faithful re-run of the SAME repro, not a new one.
  for (const targetFid of [87, 90]) {
    const seedInfo = report.layer.find(l => l.fid === targetFid);
    console.log('  §TARGET fid=' + targetFid + ' seedInfo=' + JSON.stringify(seedInfo));
    if (!seedInfo) { console.log('  §SKIP fid=' + targetFid + ' not in layer population this run'); continue; }

    // Direct production select — the same window.Bonsai.select(fid) modeller.html's own click handler calls.
    const selRes = await t.pg.evaluate(f => { try { return window.Bonsai.select(f); } catch (e) { return 'ERR:' + e.message; } }, targetFid);
    await t.sleep(400);
    const selSet = await t.pg.evaluate(() => Array.from(window.Bonsai._selSet || []));
    console.log('  §SELECT fid=' + targetFid + ' selRes=' + JSON.stringify(selRes) + ' selSet=' + JSON.stringify(selSet));
    if (!selSet.includes(targetFid)) { console.log('  §ABORT fid=' + targetFid + ' select did not stick'); continue; }

    const beforeCut = await t.oplog();
    await t.clickSel('#b-cut');
    // Poll selectedId every 150ms for up to 5s, logging every transition — pins down EXACTLY when the
    // cut handler's trailing highlight(null) fires relative to oplog commit, instead of guessing at a
    // fixed sleep duration (found empirically: a blind sleep()+re-select() race lost the re-selection
    // to this handler's delayed deselect).
    const trace = [];
    for (let i = 0; i < 34; i++) {
      const s = await t.pg.evaluate(() => ({ sid: (typeof selectedId !== 'undefined' ? selectedId : 'N/A'), stat: document.getElementById('stat').textContent }));
      trace.push(s.sid + '@' + s.stat.slice(0, 20));
      await t.sleep(150);
    }
    console.log('  §CUT-SELID-TRACE fid=' + targetFid + ' ' + JSON.stringify(trace));
    const afterCut = await t.oplog(); const lastCut = await t.lastOp();
    console.log('  §CUT fid=' + targetFid + ' len ' + beforeCut.len + '->' + afterCut.len + ' op=' + (lastCut && lastCut.op_type) + ' parent=' + (lastCut && lastCut.parameters && lastCut.parameters.parent));
    const chain = await t.verifyChain();
    console.log('  §CHAIN fid=' + targetFid + ' verifyChain=' + chain);

    // Re-select (cut may have re-folded the mesh; select the parent wall again for the fillet tool).
    const reSelRes = await t.pg.evaluate(f => { try { return window.Bonsai.select(f); } catch (e) { return 'ERR:' + e.message; } }, targetFid);
    await t.sleep(400);
    const reSelSet = await t.pg.evaluate(() => Array.from(window.Bonsai._selSet || []));
    const meshFound = await t.pg.evaluate(f => { const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === f); return !!m; }, targetFid);
    console.log('  §RE-SELECT fid=' + targetFid + ' reSelRes=' + JSON.stringify(reSelRes) + ' reSelSet=' + JSON.stringify(reSelSet) + ' meshFound=' + meshFound);

    // Call the underlying production API directly first (window.Bonsai.queryEdges — exactly what
    // enterFillet() awaits internally) to decouple the RAW edge query result from any UI panel/camera-fly
    // timing. Logs the FULL result shape (not just .edges.length) so a thrown/rejected query is visible.
    const rawQuery = await t.pg.evaluate(async (f) => {
      try { const r = await window.Bonsai.queryEdges(f); return { ok: true, nEdges: (r.edges || []).length, keys: Object.keys(r || {}) }; }
      catch (e) { return { ok: false, err: String(e && e.message || e) }; }
    }, targetFid);
    console.log('  §RAW-QUERYEDGES fid=' + targetFid + ' result=' + JSON.stringify(rawQuery));

    const consoleBuf = [];
    const onConsole0 = msg => consoleBuf.push(msg.type() + ':' + msg.text());
    t.pg.on('console', onConsole0);
    await t.clickSel('#b-fillet'); await t.sleep(1000);
    t.pg.off('console', onConsole0);
    let edges = await t.pg.evaluate(() => (window._edgeList || []).map(e => ({ i: e.i, mid: e.mid })));
    const statText = await t.pg.evaluate(() => { const el = document.getElementById('stat'); return el ? el.textContent : null; });
    console.log('  §EDGES-FIRST-READ fid=' + targetFid + ' count=' + edges.length + ' statText=' + JSON.stringify(statText) + ' console=' + JSON.stringify(consoleBuf.slice(-8)));
    if (!edges.length) {
      // longer wait, same panel state, no extra click (a toggle button would exit fillet mode on a 2nd click).
      await t.sleep(1000);
      edges = await t.pg.evaluate(() => (window._edgeList || []).map(e => ({ i: e.i, mid: e.mid })));
      console.log('  §EDGES-RETRY-READ fid=' + targetFid + ' count=' + edges.length);
    }
    console.log('  §EDGES fid=' + targetFid + ' count=' + edges.length);
    if (!edges.length) { console.log('  §NO-EDGES fid=' + targetFid); continue; }

    // Try up to 3 distinct edges x 2 radii = up to 6 combos per wall, matching §10's sweep style.
    const radii = ['0.02', '0.003'];
    const sampleEdges = edges.slice(0, 3);
    for (const e0 of sampleEdges) {
      for (const rad of radii) {
        const epx = await t.proj(e0.mid[0], e0.mid[1], e0.mid[2]);
        await t.pg.mouse.click(epx[0], epx[1]); await t.sleep(300);
        const applyEnabled = await t.pg.evaluate(() => { const b = document.getElementById('b-applyfillet'); return b && !b.disabled; });
        const nPicked = await t.pg.evaluate(() => (window.pickedEdges ? window.pickedEdges.size : null));
        if (!applyEnabled) { console.log('  §PICK-MISS fid=' + targetFid + ' edgeIdx=' + e0.i + ' rad=' + rad + ' applyEnabled=false picked=' + nPicked); continue; }
        await t.pg.evaluate(r => { const el = document.getElementById('dim-rad'); if (el) el.value = r; }, rad);
        const beforeFillet = await t.oplog();
        t.errs.length = 0;  // reset page-error capture per attempt so we know which combo threw
        // Wrap the click handler's own async work: listen for a rejected promise / thrown error surfaced
        // via the SAME pageerror channel the harness already wires (t.errs), plus capture console errors.
        const consoleErrs = [];
        const onConsole = msg => { if (msg.type() === 'error') consoleErrs.push(msg.text()); };
        t.pg.on('console', onConsole);
        try { await t.clickSel('#b-applyfillet'); } catch (e) { console.log('  §CLICK-THREW fid=' + targetFid + ' edgeIdx=' + e0.i + ' rad=' + rad + ' err=' + e.message); }
        await t.sleep(1200);
        t.pg.off('console', onConsole);
        const afterFillet = await t.oplog(); const lastFillet = await t.lastOp();
        const filletOk = afterFillet.len === beforeFillet.len + 1 && lastFillet && lastFillet.op_type === 'GEOM_FILLET';
        console.log('  §FILLET-ATTEMPT fid=' + targetFid + ' edgeIdx=' + e0.i + ' rad=' + rad + ' filletOk=' + filletOk +
          ' opsLen ' + beforeFillet.len + '->' + afterFillet.len +
          ' pageErrs=' + JSON.stringify(t.errs) + ' consoleErrs=' + JSON.stringify(consoleErrs.slice(0, 5)));
      }
    }
  }
  console.log('  §DONE');
}, { width: 1200, height: 850, dpr: 2 });
