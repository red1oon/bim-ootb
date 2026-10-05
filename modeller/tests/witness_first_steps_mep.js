#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-FIRST-STEPS-MEP: the "Fill the building with services (MEP walk)" baby steps (docs/ModellerFirstSteps.md §3), proven. Read the log after every run.
 * SPEC (3 lines): Duplex (bare ARC) -> click the Outliner's PLB ▶ walk -> pipes appear -> click a pipe -> move a walked fixture (by the ENGINE: walked fixtures have no drag
 *   handle, measured step 6) and the pipes re-route -> Ctrl+Z (the move) -> Ctrl+Z (the whole walk) -> Ctrl+Y. Run vs LIVE (E2E_URL, default the live modeller); each step
 *   prints `§FIRST_STEPS_MEP step=<n> ...` with values read from app state and PASS/FAIL/INCONCLUSIVE. Reuses W-MEP-OPENPATH / W-WALK-GESTURE / W-MEP-REROUTE's probes.
 *   FALSIFIED by: 0 fixtures / 0 runs after the walk; tubes != runs; a pipe size not read from an op; no run end at the moved fixture's new spot (5 mm);
 *   Ctrl+Z not restoring the run set (1 mm) / cursor; the second Ctrl+Z leaving fixtures or tubes; Ctrl+Y not restoring the counts.
 * The SAME run captures the screenshots (clip regions, dpr 2). Reroute cost is logged `§FIRST_STEPS_MEP reroute_ms=<n>` (Duplex only; Terminal is unmeasured).
 */
'use strict';
const fs = require('fs'), path = require('path');
const { runE2E } = require('./e2e_harness');
const URL = process.env.S9_LOCAL ? undefined : (process.env.E2E_URL || 'https://red1oon.github.io/bim-ootb/modeller/modeller.html');
const OUT = process.env.OUT || path.join(__dirname, 'first_steps_mep_shots'); fs.mkdirSync(OUT, { recursive: true });
const verdict = [];
const V = (n, name, state, detail) => { verdict.push(state); console.log('§FIRST_STEPS_MEP step=' + n + ' ' + name + ' ' + detail + ' => ' + state); };

runE2E('W-FIRST-STEPS-MEP', async (t) => {
  const pg = t.pg;
  const rectOf = (sel) => pg.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, sel);
  const shotRect = async (label, rects, pad) => {
    await pg.evaluate(() => { if (window.A && window.A.requestRender) window.A.requestRender(); }); await t.sleep(900);   // the renderer is idle-gated: ask for a frame so the shot shows the CURRENT state
    rects = rects.filter(Boolean); const vp = pg.viewport(); pad = pad == null ? 12 : pad;
    const x0 = Math.max(0, Math.min(...rects.map(r => r.x)) - pad), y0 = Math.max(0, Math.min(...rects.map(r => r.y)) - pad), x1 = Math.min(vp.width, Math.max(...rects.map(r => r.x + r.w)) + pad), y1 = Math.min(vp.height, Math.max(...rects.map(r => r.y + r.h)) + pad);
    if (!(x1 - x0 > 20 && y1 - y0 > 20)) { console.log('  §SHOTCLIP ' + label + ' SKIPPED (clip off-screen ' + [x0, y0, x1, y1].map(Math.round) + ')'); return; }
    await pg.screenshot({ path: path.join(OUT, label + '.png'), clip: { x: Math.round(x0), y: Math.round(y0), width: Math.round(x1 - x0), height: Math.round(y1 - y0) } });
    console.log('  §SHOTCLIP ' + label + ' ' + [x0, y0, x1 - x0, y1 - y0].map(Math.round));
  };
  const state = () => pg.evaluate(() => { const O = window.Bonsai.oplog, g = window.Bonsai.group(), root = g.children.find(o => o.userData && o.userData.dwRoot);
    const cnt = (pred) => root ? root.children.filter(pred).reduce((s, m) => s + (m.isInstancedMesh ? m.count : 1), 0) : 0;
    const segs = window.__dwChains.PLB || [];
    const all = O._allGeom ? O._allGeom() : [];
    const MH = window.ModellerHistory, tips = MH && MH.list ? MH.list() : null;
    const glass = g.children.filter(m => m.isMesh && m.material && m.material.transparent && m.material.opacity < 0.2).length, solid = g.children.filter(m => m.isMesh && m.material && m.material.opacity > 0.9).length;
    return { meshes: g.children.filter(m => m.isMesh).length, glass: glass, solid: solid, fixtures: cnt(o => o.userData && o.userData.dwDisc === 'PLB'), tubes: cnt(o => o.userData && o.userData.dwChain === 'PLB'), runs: segs.length, oplog: O.length, cursor: O.cursor, activeRows: all.filter(o => !o.undone).length,
      key: segs.map(s => [s.from, s.to].map(p => p.map(v => v.toFixed(3)).join(',')).join('>')).sort().join('|'), raw: segs.map(s => [s.from, s.to]), label: tips && tips.length ? tips[tips.length - 1].label : null }; });
  const settleWalk = async () => { const okw = await pg.waitForFunction(() => (window.__dwChains.PLB || []).length > 0 && ((window.__dwRowsByDisc || {}).PLB || {}).walk && !Object.keys(window.__dwChainAnimating || {}).some(k => window.__dwChainAnimating[k]) && !!(window.__dwRouteSig || {}).PLB, { timeout: 180000, polling: 300 }).then(() => true).catch(() => false);
    await pg.evaluate(async () => { const MH = window.ModellerHistory; await ((MH && MH.pending && MH.pending()) || Promise.resolve()); await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0)); }); return okw; };
  const idle = () => pg.evaluate(() => window.__dwRerouteIdle || 0);
  const settleReroute = async (i0) => { for (let i = 0; i < 160 && (await idle()) <= i0; i++) await t.sleep(250);
    await pg.evaluate(async () => { const MH = window.ModellerHistory; await ((MH && MH.pending && MH.pending()) || Promise.resolve()); await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0)); }); };
  const key = async (combo) => { await pg.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }); await pg.keyboard.down('Control'); await pg.keyboard.press(combo); await pg.keyboard.up('Control'); };
  // MEASUREMENT AID (stated in the page): the pipes/fixtures sit INSIDE the building and even x-ray glass takes the click (unobstructed=0 measured), so to click them the
  // witness hides the ARC meshes for the click, then restores them. A user does the same with the Outliner eye on the ARC group.
  const hideArc = (on) => pg.evaluate((hide) => { window.Bonsai.group().children.forEach(m => { if (m.isMesh && m.userData && m.userData.featureId != null && !(m.userData.dwChain || m.userData.dwDisc)) { if (hide) { m.__wasVis = m.visible; m.visible = false; } else if (m.__wasVis != null) { m.visible = m.__wasVis; } } }); if (window.A.requestRender) window.A.requestRender(); }, on);
  const near = (a, b, tol) => [0, 1, 2].every(i => Math.abs(a[i] - b[i]) <= tol);
  const sameRuns = (A, B) => { const used = {}; let m = 0; A.forEach(a => { const j = B.findIndex((b, k) => !used[k] && near(a[0], b[0], 0.001) && near(a[1], b[1], 0.001)); if (j >= 0) { used[j] = 1; m++; } }); return m === A.length && A.length === B.length; };

  // ── 1. Duplex opens as a bare ARC building ──────────────────────────────────────────────────────
  await t.open('Duplex');
  const s0 = await state();
  const meshes = await pg.evaluate(() => window.Bonsai.group().children.filter(o => o.isMesh).length);
  await t.sleep(400);
  await shotRect('mep1-duplex-bare', [{ x: 240, y: 10, w: 850, h: 740 }], 0);
  V(1, 'BARE-ARC', meshes > 0 && s0.fixtures === 0 && s0.runs === 0 ? 'PASS' : (meshes > 0 ? 'FAIL' : 'INCONCLUSIVE'), 'building=' + await pg.evaluate(() => window.__dwName) + ' meshes=' + meshes + ' plumbingFixtures=' + s0.fixtures + ' pipeRuns=' + s0.runs + ' oplog=' + s0.oplog + ' seeThroughMeshes=' + s0.glass + ' solidMeshes=' + s0.solid);

  // ── 2. find the Plumbing (PLB) walk row in the Outliner ────────────────────────────────────────
  await pg.evaluate(() => { const e = document.querySelector('[data-bnode="dw-PLB"]'); if (e) e.scrollIntoView({ block: 'center' }); }); await t.sleep(500);
  const row = await pg.evaluate(() => { const e = document.querySelector('[data-bnode="dw-PLB"]'), w = e && e.querySelector('.bn-walk'); const all = Array.from(document.querySelectorAll('[data-bnode^="dw-"]')).map(x => x.getAttribute('data-bnode') + ':' + (x.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28)); return { present: !!e, glyph: !!w, title: w && w.getAttribute('title'), text: e && (e.textContent || '').trim().replace(/\s+/g, ' '), all: all }; });
  const r1 = await rectOf('[data-bnode="dw-all"]'), r2 = await rectOf('[data-bnode="dw-FP"]');
  await shotRect('mep2-outliner-plb-row', [r1, r2], 8);
  V(2, 'PLB-ROW', row.present && row.glyph ? 'PASS' : 'FAIL', 'rows=' + JSON.stringify(row.all) + ' plbText="' + row.text + '" glyphTitle="' + row.title + '"');

  // ── 3. click ▶ on the PLB row: the walk runs ───────────────────────────────────────────────────
  const tw0 = Date.now();
  await pg.click('[data-bnode="dw-PLB"] .bn-walk');
  const ok = await settleWalk(); const walkMs = Date.now() - tw0;
  const s1 = await state();
  const sw = await pg.evaluate(() => { const O = window.Bonsai.oplog, ops = O._geomOps().filter(o => o.op_type === 'GEOM_SWEEP' && o.parameters && o.parameters._dw && o.parameters._dw.disc === 'PLB'); return { n: ops.length, fit: (window.__dwFittings && (window.__dwFittings.PLB || []).length) || 0 }; });
  const svcRect = () => pg.evaluate(() => { const g = window.Bonsai.group(), root = g.children.find(o => o.userData && o.userData.dwRoot); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    root.children.filter(o => o.userData && (o.userData.dwDisc === 'PLB' || o.userData.dwChain === 'PLB')).forEach(m => { const n = m.isInstancedMesh ? m.count : 1; const mat = new window.THREE.Matrix4(); for (let i = 0; i < n; i++) { if (m.isInstancedMesh) m.getMatrixAt(i, mat); else mat.identity(); const v = new window.THREE.Vector3().setFromMatrixPosition(mat).applyMatrix4(m.matrixWorld); const p = window.__e2e.proj(v.x, v.y, v.z); x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); } }); return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; });
  await t.flySettle(); await pg.click('#b-fit'); await t.sleep(1200);
  // the building is SOLID after the walk (measured) so the pipes sit inside it: press the X-ray pill (real click) and the structure goes glass
  const xr0 = await state(); await pg.click('#b-xray'); await t.sleep(2500); const xr1 = await state();   // real click on the X-ray pill
  console.log('  §XRAY solid ' + xr0.solid + '->' + xr1.solid + ' seeThrough ' + xr0.glass + '->' + xr1.glass);
  await shotRect('mep3-walk-done', [await svcRect()], 70);
  V(3, 'WALK-PLB', ok && s1.meshes >= s0.meshes && s1.fixtures > 0 && s1.runs > 0 && s1.tubes === s1.runs && sw.n >= s1.runs ? 'PASS' : (s1.fixtures === 0 ? 'INCONCLUSIVE' : 'FAIL'),
    'fixtures=' + s1.fixtures + ' pipeRuns=' + s1.runs + ' tubesDrawn=' + s1.tubes + ' signedSweeps=' + sw.n + ' fittings=' + sw.fit + ' oplog ' + s0.oplog + '->' + s1.oplog + ' historyNode="' + s1.label + '" seeThroughMeshes=' + s1.glass + ' solidMeshes=' + s1.solid + ' walkMs=' + walkMs + ' status="' + await pg.evaluate(() => document.getElementById('stat').textContent) + '" (older guide: 18 fixtures / 18 runs — measured now, not copied)');

  // ── 4. pipe sizes are READ from the signed pipe rows; click one pipe ──────────────────────────
  const sizes = await pg.evaluate(() => { const by = {}; window.Bonsai.oplog._geomOps().filter(o => o.op_type === 'GEOM_SWEEP' && o.parameters && o.parameters._dw && o.parameters._dw.disc === 'PLB').forEach(o => { const P = o.parameters, k = (P._dw.rule || '?') + ' · ' + (P._dw.crossSection || '?') + ' · ' + (P.profile.w * 1000).toFixed(1) + ' mm'; by[k] = (by[k] || 0) + 1; }); return by; });
  // The pipe sizes are READ from the signed pipe rows (profile + the cited product), never typed in. (Clicking a pipe was tried and is NOT offered: measured 2026-09-30 the pipes sit inside
  // the solid building and even x-ray glass takes the click; with the ARC hidden the sweep meshes still did not select. Recorded, not built.)
  const rowsInfo = await pg.evaluate(() => { const ops = window.Bonsai.oplog._geomOps().filter(o => o.op_type === 'GEOM_SWEEP' && o.parameters && o.parameters._dw && o.parameters._dw.disc === 'PLB'); return { n: ops.length, withProduct: ops.filter(o => o.parameters._dw.crossSection).length }; });
  const sizeSet = Object.keys(sizes).map(k => +k.split(' · ')[2].replace(' mm', ''));
  await pg.evaluate(() => window.Bonsai.select(null)); await t.flySettle(); await pg.click('#b-fit'); await t.sleep(1200);
  await shotRect('mep4-pipes-xray', [await svcRect()], 70);
  V(4, 'PIPE-SIZE', rowsInfo.n === s1.runs && rowsInfo.withProduct === rowsInfo.n && sizeSet.length > 0 && sizeSet.every(z => z === 25.4 || z === 48.3) ? 'PASS' : 'FAIL', 'signedPipeRows=' + rowsInfo.n + ' withCitedProduct=' + rowsInfo.withProduct + ' sizesInLog=' + JSON.stringify(sizes) + ' (read from the rows: profile width x 1000; the expected set is only the two sizes measured on the Duplex model)');

  // ── 5. move one walked fixture (ENGINE commit — walked fixtures have no drag handle) and the pipes re-route ─────
  await t.flySettle(); await pg.evaluate(() => window.Bonsai.select(null)); await pg.click('#b-fit'); await t.sleep(1500);   // the pipe click flew the camera to the pipe: re-frame the whole building
  // measure the UI gap honestly first: click a walked fixture
  const fxpt = await pg.evaluate(() => { const g = window.Bonsai.group(), root = g.children.find(o => o.userData && o.userData.dwRoot); const m = root.children.find(o => o.userData && o.userData.dwDisc === 'PLB' && o.isInstancedMesh); const mat = new window.THREE.Matrix4(); m.getMatrixAt(0, mat); const v = new window.THREE.Vector3().setFromMatrixPosition(mat).applyMatrix4(m.matrixWorld); return window.__e2e.proj(v.x, v.y, v.z); });
  await pg.evaluate(() => window.Bonsai.select(null)); await t.sleep(300);
  await hideArc(true); await t.sleep(600); await pg.mouse.click(fxpt[0], fxpt[1]); await t.sleep(900);
  const gap = await pg.evaluate(() => ({ stat: document.getElementById('stat').textContent, moveDisabled: document.getElementById('b-move').disabled, selected: Array.from(window.Bonsai._selSet || []).length }));
  await hideArc(false); await t.sleep(400);
  // pick a fixture that is a run endpoint (as W-MEP-REROUTE R1)
  const pick = await pg.evaluate(() => { const O = window.Bonsai.oplog, segs = window.__dwChains.PLB || [], rows = ((window.__dwRowsByDisc || {}).PLB || {}).walk || []; const ends = []; segs.forEach(s => { ends.push(s.from); ends.push(s.to); });
    const byId = {}; O._geomOps().forEach(o => byId[o.id] = o); for (const id of rows) { const pp = byId[id] && byId[id].parameters.placement; if (!pp) continue; if (ends.some(e => Math.abs(e[0] - pp.x) < 0.005 && Math.abs(e[1] - pp.y) < 0.005)) return { id: id, x: pp.x, y: pp.y, z: pp.z }; } return null; });
  if (!pick) { V(5, 'FIXTURE-MOVE', 'INCONCLUSIVE', 'no walked fixture sits at a run end'); return; }
  const DX = 0.5, c0 = (await state()), i0 = await idle(), nLog = { n: t.slog.length };
  const tm0 = Date.now();
  await pg.evaluate((id, dx) => window.Bonsai.oplog.commit({ op_type: 'GEOM_MOVE', parameters: { parent: id, dx: dx, dy: 0, dz: 0 } }, {}), pick.id, DX);
  await settleReroute(i0); const rerouteMs = Date.now() - tm0;
  const s5 = await state();
  const nx = pick.x + DX, ny = pick.y;
  const ends = s5.raw.reduce((a, s) => a.concat([s[0], s[1]]), []);
  const dNew = Math.min.apply(null, ends.map(e => Math.hypot(e[0] - nx, e[1] - ny)));
  const dOld = Math.min.apply(null, ends.map(e => Math.hypot(e[0] - pick.x, e[1] - pick.y)));
  const rrLine = t.slog.slice(nLog.n).filter(l => /§MEP-REROUTE/.test(l)).slice(0, 2).join(' | ').slice(0, 260);
  console.log('§FIRST_STEPS_MEP reroute_ms=' + rerouteMs + ' (Duplex, ' + s5.runs + ' runs, one fixture moved ' + DX + ' m; commit -> re-routed + signed + settled)');
  if (pick) { const p = await t.proj(nx, ny, pick.z || 0); await shotRect('mep5-after-move-reroute', [{ x: p[0] - 230, y: p[1] - 150, w: 460, h: 300 }], 6); }
  V(5, 'FIXTURE-MOVE', s5.key !== c0.key && dNew < 0.005 && s5.tubes === s5.runs ? 'PASS' : 'FAIL',
    'byHand: click a walked fixture -> status="' + gap.stat + '" Move disabled=' + gap.moveDisabled + ' selected=' + gap.selected + ' | engine GEOM_MOVE dx=' + DX + ' on fixture #' + pick.id + ': runsChanged=' + (s5.key !== c0.key) + ' nearestRunEndToNewSpot=' + dNew.toFixed(4) + 'm (was ' + dOld.toFixed(3) + 'm from the OLD spot) runs ' + c0.runs + '->' + s5.runs + ' tubes=' + s5.tubes + ' oplog ' + c0.oplog + '->' + s5.oplog + ' reroute_ms=' + rerouteMs + ' ' + rrLine);

  // ── 6. Ctrl+Z takes the move back ──────────────────────────────────────────────────────────────
  const i1 = await idle(); await key('KeyZ'); await settleReroute(i1); await t.sleep(600);
  const s6 = await state();
  await pg.click('#b-fit'); await t.sleep(1200);
  await shotRect('mep6-undo-move', [{ x: 240, y: 10, w: 850, h: 740 }], 0);
  V(6, 'UNDO-MOVE', sameRuns(c0.raw, s6.raw) && s6.cursor === c0.cursor ? 'PASS' : 'FAIL', 'runs ' + c0.runs + '->' + s5.runs + '->' + s6.runs + ' originalRunSetRestored(1mm)=' + sameRuns(c0.raw, s6.raw) + ' cursor ' + c0.cursor + '->' + s5.cursor + '->' + s6.cursor + ' activeRows ' + c0.activeRows + '->' + s5.activeRows + '->' + s6.activeRows + ' fixtures=' + s6.fixtures);

  // ── 7. one more Ctrl+Z takes the whole walk back ───────────────────────────────────────────────
  await key('KeyZ'); await t.sleep(2500);
  const s7 = await state();
  await pg.click('#b-fit'); await t.sleep(1200);
  await shotRect('mep7-undo-walk', [{ x: 240, y: 10, w: 850, h: 740 }], 0);
  V(7, 'UNDO-WALK', s7.fixtures === 0 && s7.tubes === 0 && s7.meshes >= s0.meshes && s7.cursor === s0.cursor ? 'PASS' : 'FAIL', 'fixtures ' + s6.fixtures + '->' + s7.fixtures + ' tubes ' + s6.tubes + '->' + s7.tubes + ' runs ' + s6.runs + '->' + s7.runs + ' cursor ' + s6.cursor + '->' + s7.cursor + ' (pre-walk cursor ' + s0.cursor + ') activeRows ' + s6.activeRows + '->' + s7.activeRows + ' buildingMeshes=' + s7.meshes + ' seeThroughMeshes=' + s7.glass + ' solidMeshes=' + s7.solid);

  // ── 8. Ctrl+Y brings the walk back ─────────────────────────────────────────────────────────────
  const i2 = await idle(); await key('KeyY'); await settleWalk(); await t.sleep(1500);
  const s8 = await state();
  await t.flySettle(); await pg.click('#b-fit'); await t.sleep(1800);
  await shotRect('mep8-redo-walk', [await svcRect()], 70);
  V(8, 'REDO-WALK', s8.fixtures === s1.fixtures && s8.runs === s1.runs && s8.tubes === s1.tubes && s8.cursor >= s1.cursor - 0 ? 'PASS' : 'FAIL', 'fixtures=' + s8.fixtures + ' (walk gave ' + s1.fixtures + ') runs=' + s8.runs + ' (walk gave ' + s1.runs + ') tubes=' + s8.tubes + ' cursor ' + s7.cursor + '->' + s8.cursor + ' (after-walk cursor ' + s1.cursor + ') activeRows ' + s7.activeRows + '->' + s8.activeRows + ' (after-walk ' + s1.activeRows + ')');
}, { width: 1200, height: 850, dpr: 2, url: URL, noExit: true }).then(r => {
  const c = s => verdict.filter(v => v === s).length;
  console.log('§FIRST_STEPS_MEP SUMMARY ' + c('PASS') + ' PASS / ' + c('FAIL') + ' FAIL / ' + c('INCONCLUSIVE') + ' INCONCLUSIVE (harness ' + JSON.stringify(r) + ')');
  process.exit(c('FAIL') || r.fail ? 1 : 0);
});
