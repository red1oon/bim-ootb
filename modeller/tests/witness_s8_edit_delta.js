#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-S8-EDIT-DELTA (bim-compiler prompts/TM_4D5D_VARIANCE_LANE.md §S8-WITNESS). Read the log after every run.
 * SPEC: a wall with NO hosted door/window is stretched with the REAL scale cube; hovering / clicking it shows the material-cost + labour Δ
 *   of that edit; Ctrl+Z returns the Δ to 0. Run vs LIVE by default (E2E_URL, default the live modeller) — RED on a build without §S8.
 *   D0 BASELINE     before any edit, hover/click on the wall shows NO Δ (and prints no §S8-DELTA) — proves the Δ is caused by the edit.
 *   D1 SCALE-COMMIT one GEOM_SCALE on the wall's longest local axis lands (else INCONCLUSIVE — nothing to judge).
 *   D2 COST-EXACT   displayed costDelta == rate x (area(dims*fx,fy,fz) - area(dims)) recomputed HERE from the DB record + the op's own factors
 *                   (independent of edit_delta.js: own SQL, own BigDecimal). Falsifies a wrong quantity/rate/rounding.
 *   D3 COST-FOLD    the same Δ agrees (rel 2e-3) with the area change of the REAL folded mesh bbox (float32) — falsifies netEdits drifting from the fold.
 *   D4 SCHED        the labour Δ equals the value asserted for a flat M2 wall: 0 and basis 'flat per element' (the shipped rule; nothing invented).
 *   D5 HOVER+CLICK  the on-screen text (#s8-delta-label on hover, #s8-delta-pin on selection) contains the costDelta from the log line.
 *   D6 UNDO         Ctrl+Z -> hover -> §S8-DELTA costDelta=0.00 and the label says the edit was undone.
 *   D7 MOVE         a pure GEOM_MOVE on the same wall prints costDelta=0.00 ("a move changes no quantity").
 *   D8 LAZY         nothing of the Viewer's owners is loaded before the first hover of an edited element (Open time unchanged).
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { runE2E } = require('./e2e_harness');
const ROOT = path.join(__dirname, '..', '..');
const URL = process.env.S8_LOCAL ? undefined : (process.env.E2E_URL || 'https://red1oon.github.io/bim-ootb/modeller/modeller.html');
const OUT = process.env.OUT || path.join(__dirname, 's8_shots'); fs.mkdirSync(OUT, { recursive: true });
const BigDecimal = require(path.join(ROOT, 'erp', 'bigdecimal.js'));
const initSqlJs = require(path.join(ROOT, 'modeller', 'lib', 'sql-wasm.js'));
const rt = {}; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'viewer', 'rates.js'), 'utf8') + '\n;__o.RATES=RATES;', { __o: rt, console, window: undefined });
const shotRects = async (pg, label, rects, pad) => {   // guide shot: clip = union of viewport rects (+pad), dpr comes from the page
  rects = rects.filter(Boolean); const vp = pg.viewport(); pad = pad == null ? 14 : pad;
  const x0 = Math.max(0, Math.min(...rects.map(r => r.x)) - pad), y0 = Math.max(0, Math.min(...rects.map(r => r.y)) - pad), x1 = Math.min(vp.width, Math.max(...rects.map(r => r.x + r.w)) + pad), y1 = Math.min(vp.height, Math.max(...rects.map(r => r.y + r.h)) + pad);
  await pg.screenshot({ path: path.join(OUT, label + '.png'), clip: { x: Math.round(x0), y: Math.round(y0), width: Math.round(x1 - x0), height: Math.round(y1 - y0) } });
  console.log('  §SHOTCLIP ' + label + ' ' + [x0, y0, x1 - x0, y1 - y0].map(Math.round));
};
const rectSel = (pg, sel) => pg.evaluate(s => { const e = document.querySelector(s); if (!e || e.style.display === 'none') return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, sel);
const verdict = [];
const V = (n, s, d) => { verdict.push(s); console.log('§S8_EDIT_DELTA ' + n + ' ' + d + ' => ' + s); };
const area = (d) => { const s = d.slice().sort((a, b) => b - a); return s[0] * s[1]; };

runE2E('W-S8-EDIT-DELTA', async (t) => {
  const pg = t.pg;
  const s8lines = () => t.slog.filter(l => /^§S8-DELTA /.test(l));
  const kv = (l, k) => { const m = l.match(new RegExp(k + '=([^ ]+)')); return m ? m[1] : null; };
  await t.open('Duplex');
  const owners0 = await pg.evaluate(() => ({ ED: !!window.EditDelta, SA: !!window.ScheduleAuthor, RATES: typeof window.RATES !== 'undefined', BD: !!window.BigDecimal, ui: !!window.EditDeltaUI }));
  // a wall with no hosted filling, axis-safe, visible
  // walls a user can see from outside: an ABOVE-GRADE wall op (placement.z + bbox zmin >= 0), axis-safe, NO hosted filling (finding #1 not built on), highest first
  const walls = await pg.evaluate(() => { const O = window.Bonsai.oplog, ops = O._geomOps(), out = [];
    for (const o of ops) { const P = o.parameters || {}; if (!/Wall/i.test(P.ifc_class || '') || !P.bbox) continue; const pl = P.placement || {}; if (!(Math.abs(pl.rotX || 0) < 1e-6 && Math.abs(pl.rotY || 0) < 1e-6)) continue;
      const z0 = (pl.z || 0), z1 = z0 + (P.bbox[5] - P.bbox[4]); if (z0 < -0.01) continue;
      if (window.SdgCascade.ridersFor([o.id], window.__arcGuidByFid, window.__arcFidByGuid, window.swXEdges.fills, new Set([o.id])).length) continue;
      out.push({ f: o.id, z1: z1, len: Math.max(P.bbox[1] - P.bbox[0], P.bbox[3] - P.bbox[2]) }); }
    out.sort((a, b) => (b.z1 - a.z1) || (b.len - a.len)); return out.map(x => x.f); });
  console.log('  §S8_WALLS n=' + walls.length + ' fids=' + walls.slice(0, 10));
  let fid = null;
  for (const wf of walls) {
    const pt = await pg.evaluate(f => window.__e2e.clickPointFor(f), wf); if (!pt) continue;
    await pg.mouse.move(pt[0], pt[1]); await t.sleep(300);
    // D0 (hover baseline) is taken on the first reachable wall
    fid = wf; break;
  }
  if (fid == null) { V('D1', 'INCONCLUSIVE', 'no reachable wall without hosted fillings'); return; }
  const guid = await pg.evaluate(f => window.__arcGuidByFid[f], fid);
  const opBbox = await pg.evaluate(f => window.Bonsai.oplog._geomOps().find(o => o.id === f).parameters.bbox, fid);
  const ldims = [opBbox[1] - opBbox[0], opBbox[3] - opBbox[2], opBbox[5] - opBbox[4]];
  const axis = ['scaleX', 'scaleY', 'scaleZ'][ldims.indexOf(Math.max.apply(null, ldims))];
  console.log('  §S8_SUBJECT fid=' + fid + ' guid=' + guid + ' localDims=' + ldims.map(v => v.toFixed(3)) + ' stretchAxis=' + axis);

  // D0 — baseline: hover + click the unedited wall
  { const pt = await pg.evaluate(f => window.__e2e.clickPointFor(f), fid);
    await pg.mouse.move(pt[0] + 2, pt[1] + 2); await pg.mouse.move(pt[0], pt[1]); await t.sleep(700);
    const lab = await pg.evaluate(() => { const e = document.getElementById('s8-delta-label'); return e && e.style.display !== 'none' ? e.textContent : null; });
    await pg.mouse.click(pt[0], pt[1]); await t.sleep(900);
    const pin = await pg.evaluate(() => { const e = document.getElementById('s8-delta-pin'); return e && e.style.display !== 'none' ? e.textContent : null; });
    V('D0 BASELINE', lab == null && pin == null && s8lines().length === 0 ? 'PASS' : 'FAIL', 'hoverLabel=' + JSON.stringify(lab) + ' pin=' + JSON.stringify(pin) + ' s8lines=' + s8lines().length);
  }
  // D8 — LAZY: after Open + a hover/click of an UNEDITED element, the owners are still not loaded
  { const o = await pg.evaluate(() => ({ ED: !!window.EditDelta, SA: !!window.ScheduleAuthor, BD: !!window.BigDecimal, RATES: typeof window.RATES !== 'undefined' }));
    V('D8 LAZY', (!o.ED && !o.SA && !o.BD && !o.RATES) ? 'PASS' : 'FAIL', 'afterOpen=' + JSON.stringify(owners0) + ' afterUneditedHoverClick=' + JSON.stringify(o)); }

  // before-state of the REAL fold
  const meshDims = () => pg.evaluate(f => { const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === f); if (!m) return null; const b = new window.THREE.Box3().setFromObject(m), s = b.getSize(new window.THREE.Vector3()); return [s.x, s.y, s.z]; }, fid);
  const m0 = await meshDims();

  // D1 — real scale-cube drag on the longest local axis
  await t.flySettle();
  await pg.click('#b-move'); await t.sleep(700);
  const giz = await pg.evaluate((ax) => { const gz = window.A.scene.getObjectByName('MoveGizmo'); if (!gz) return null; let cube = null; gz.traverse(o => { if (o.userData && o.userData.moveAxis === ax) cube = o; }); if (!cube) return null;
    const w = new window.THREE.Vector3(); cube.getWorldPosition(w); const c = new window.THREE.Vector3(); gz.getWorldPosition(c); return { cube: [w.x, w.y, w.z], centre: [c.x, c.y, c.z] }; }, axis);
  if (!giz) { V('D1 SCALE-COMMIT', 'INCONCLUSIVE', 'no ' + axis + ' cube on the gizmo'); return; }
  await t.frameElement(fid, 0.3);
  const ext = Math.max.apply(null, ldims);
  const od = [giz.cube[0] - giz.centre[0], giz.cube[1] - giz.centre[1], giz.cube[2] - giz.centre[2]], oL = Math.hypot(od[0], od[1], od[2]) || 1, dW = 0.3 * ext;
  const down = await t.proj(giz.cube[0], giz.cube[1], giz.cube[2]), up = await t.proj(giz.cube[0] + od[0] / oL * dW, giz.cube[1] + od[1] / oL * dW, giz.cube[2] + od[2] / oL * dW);
  const before = await t.oplog();
  await t.drag(down, up, 10); await t.sleep(1800);
  const after = await t.oplog(); const last = await t.lastOp();
  const factors = last && last.parameters ? [last.parameters.fx || 1, last.parameters.fy || 1, last.parameters.fz || 1] : null;
  const landed = last && last.op_type === 'GEOM_SCALE' && after.len === before.len + 1 && factors && factors.some(f => Math.abs(f - 1) > 1e-4);
  V('D1 SCALE-COMMIT', landed ? 'PASS' : 'INCONCLUSIVE', 'oplog ' + before.len + '->' + after.len + ' op=' + (last && last.op_type) + ' factors=' + JSON.stringify(factors));
  if (!landed) return;
  let m1 = await meshDims(); for (let i = 0; i < 60 && (!m1 || (m0 && Math.abs(area(m1) - area(m0)) < 1e-9)); i++) { await t.sleep(400); m1 = await meshDims(); }   // the re-fold replaces the mesh asynchronously: wait until it HAS changed (or give up honestly)

  // leave Move mode (hover is suppressed in a tool mode), hover + click the edited wall
  await pg.keyboard.press('Escape'); await t.sleep(500);
  const nBefore = s8lines().length;
  let pt = null; for (let i = 0; i < 10 && !pt; i++) { pt = await pg.evaluate(f => window.__e2e.clickPointFor(f), fid); if (!pt) await t.sleep(400); }
  if (!pt) { V('D5 HOVER+CLICK', 'INCONCLUSIVE', 'edited wall not reachable from this camera'); return; }
  await pg.mouse.move(pt[0] + 3, pt[1] + 3); await pg.mouse.move(pt[0], pt[1]);
  const readLab = () => pg.evaluate(() => { const e = document.getElementById('s8-delta-label'); return e && e.style.display !== 'none' ? e.textContent : null; });
  let lab = null; for (let i = 0; i < 40 && !lab; i++) { await t.sleep(250); lab = await readLab(); }
  if (!lab) { await pg.mouse.move(2, 2); await t.sleep(400); await pg.mouse.move(pt[0] + 3, pt[1] + 3); await pg.mouse.move(pt[0], pt[1]); for (let i = 0; i < 30 && !lab; i++) { await t.sleep(250); lab = await readLab(); } console.log('  §S8_HOVER_RETRY the first hover showed nothing; re-entered the wall, label=' + !!lab); }
  const hoverLine = s8lines().slice(nBefore).pop();
  await pg.mouse.click(pt[0], pt[1]); await t.sleep(1200);
  const pin = await pg.evaluate(() => { const e = document.getElementById('s8-delta-pin'); return e && e.style.display !== 'none' ? e.textContent : null; });
  await shotRects(pg, 's8-1-hover-label', [await rectSel(pg, '#s8-delta-label'), { x: pt[0] - 90, y: pt[1] - 60, w: 180, h: 120 }], 10);
  await shotRects(pg, 's8-2-click-line', [await rectSel(pg, '#s8-delta-pin'), await rectSel(pg, '#s9-erp-btn')], 16);
  const lastLine = s8lines().filter(l => kv(l, 'guid') === guid).pop();
  console.log('  §S8_LINES ' + s8lines().length + ' last=' + (lastLine || '').slice(0, 260));
  const owners1 = await pg.evaluate(() => ({ ED: !!window.EditDelta, SA: !!window.ScheduleAuthor }));
  if (!lastLine) { V('D2 COST-EXACT', 'INCONCLUSIVE', 'no §S8-DELTA line for guid=' + guid + ' (Δ never computed)'); V('D5 HOVER+CLICK', 'FAIL', 'hoverLabel=' + JSON.stringify(lab) + ' pin=' + JSON.stringify(pin)); return; }
  const shownCost = kv(lastLine, 'costDelta');

  // D2 — independent recompute from the DB record + the op's own factors
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ROOT, 'modeller', 'lib', 'sql-wasm.wasm')) });
  const db = new SQL.Database(fs.readFileSync(path.join(ROOT, 'modeller', 'Duplex_extracted.db')));
  const rec = db.exec("SELECT m.ifc_class, t.bbox_x, t.bbox_y, t.bbox_z FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.guid='" + guid.replace(/'/g, "''") + "'")[0].values[0];
  const r4 = x => Math.round(x * 1e4) / 1e4, dims = [r4(rec[1]), r4(rec[2]), r4(rec[3])], scaled = [dims[0] * factors[0], dims[1] * factors[1], dims[2] * factors[2]];
  const pr = await pg.evaluate(c => ({ r: (window.RATES[c] || {}), locale: (window._TRL_LOADER && window._TRL_LOADER.detectLocale()) }), rec[0]);   // the ACTIVE rate (rates.js + the user's locale pack, as the Viewer prices) — quantity and arithmetic below stay independent
  const rate = pr.r.rate, unit = pr.r.unit; console.log('  §S8_RATE_SOURCE locale=' + pr.locale + ' ' + rec[0] + '=' + rate + '/' + unit);
  const expA = BigDecimal.of(String(rate)).multiply(BigDecimal.of(area(scaled).toFixed(6)));
  const expB = BigDecimal.of(String(rate)).multiply(BigDecimal.of(area(dims).toFixed(6)));
  const exp = expA.subtract(expB).setScale(2, BigDecimal.RoundingMode.HALF_UP).toString();
  V('D2 COST-EXACT', unit === 'M2' && shownCost === exp && +exp > 0 ? 'PASS' : (+exp === 0 ? 'INCONCLUSIVE' : 'FAIL'), 'cls=' + rec[0] + ' unit=' + unit + ' rate=' + rate + ' area ' + area(dims).toFixed(3) + '->' + area(scaled).toFixed(3) + ' shown=' + shownCost + ' independent=' + exp);
  // D3 — vs the real fold
  if (!m0 || !m1) V('D3 COST-FOLD', 'INCONCLUSIVE', 'mesh bbox unavailable');
  else { const fa = area(m1) - area(m0), qa = kv(lastLine, 'qty').split('->').map(Number), da = qa[1] - qa[0];
    V('D3 COST-FOLD', Math.abs(fa - da) <= 2e-3 * Math.max(1, Math.abs(fa)) ? 'PASS' : 'FAIL', 'foldedMeshAreaDelta=' + fa.toFixed(4) + ' displayedAreaDelta=' + da.toFixed(4) + ' meshDims ' + m0.map(v => v.toFixed(3)) + '->' + m1.map(v => v.toFixed(3))); }
  // D4 — schedule
  V('D4 SCHED', kv(lastLine, 'schedDelta').startsWith('0s') && kv(lastLine, 'basis') === 'flat' ? 'PASS' : (/^flat/.test(lastLine.split('basis=')[1] || '') && kv(lastLine, 'schedDelta').startsWith('0s') ? 'PASS' : 'FAIL'), 'schedDelta=' + kv(lastLine, 'schedDelta') + ' ' + (lastLine.match(/basis=(.*?) finish=/) || [])[0]);
  // D5
  V('D5 HOVER+CLICK', lab && pin && lab.indexOf(shownCost) >= 0 && pin.indexOf(shownCost) >= 0 ? 'PASS' : 'FAIL', 'hoverLabel=' + JSON.stringify(lab) + ' pin=' + JSON.stringify(pin) + ' owners=' + JSON.stringify(owners1));

  // D6 — undo
  await pg.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
  await pg.keyboard.down('Control'); await pg.keyboard.press('KeyZ'); await pg.keyboard.up('Control'); await t.sleep(2000);
  const u = await t.oplog();
  await pg.mouse.move(pt[0] + 3, pt[1] + 3); await pg.mouse.move(pt[0], pt[1]); await t.sleep(1200);
  const zeroLine = s8lines().filter(l => kv(l, 'guid') === guid).pop();
  const pin2 = await pg.evaluate(() => { const e = document.getElementById('s8-delta-pin'); return e && e.style.display !== 'none' ? e.textContent : null; });
  V('D6 UNDO', u.len === before.len || u.cur === before.cur ? (kv(zeroLine || '', 'costDelta') === '0.00' && /undone/.test(pin2 || '') ? 'PASS' : 'FAIL') : 'INCONCLUSIVE', 'oplog cursor=' + u.cur + ' (want ' + before.cur + ') costDelta=' + kv(zeroLine || '', 'costDelta') + ' pin=' + JSON.stringify(pin2));

  // D7 — a pure move on the same wall
  await t.flySettle(); await pg.click('#b-move'); await t.sleep(700);
  const g2 = await pg.evaluate(() => { const gz = window.A.scene.getObjectByName('MoveGizmo'); if (!gz) return null; let h = null; gz.traverse(o => { if (o.userData && o.userData.moveAxis === 'x' && !h) h = o; }); if (!h) return null; const w = new window.THREE.Vector3(); h.getWorldPosition(w); return [w.x, w.y, w.z]; });
  if (!g2) { V('D7 MOVE', 'INCONCLUSIVE', 'no move gizmo'); return; }
  const pts = []; for (let i = 0; i <= 8; i++) pts.push(await t.proj(g2[0] + 0.5 * i / 8, g2[1], g2[2]));
  const b2 = await t.oplog(); const n2 = s8lines().length;   // any §S8-DELTA after this point belongs to the move
  await pg.mouse.move(pts[0][0], pts[0][1]); await t.sleep(60); await pg.mouse.down(); await t.sleep(60); for (let i = 1; i < pts.length; i++) { await pg.mouse.move(pts[i][0], pts[i][1], { steps: 3 }); await t.sleep(30); } await pg.mouse.up(); await t.sleep(1800);
  const a2 = await t.oplog(); const l2 = await t.lastOp();
  await pg.keyboard.press('Escape'); await t.sleep(500);
  let pt2 = null; for (let i = 0; i < 10 && !pt2; i++) { pt2 = await pg.evaluate(f => window.__e2e.clickPointFor(f), fid); if (!pt2) await t.sleep(400); }
  if (pt2) { await pg.mouse.move(pt2[0] + 3, pt2[1] + 3); await pg.mouse.move(pt2[0], pt2[1]); await t.sleep(1500); }
  const mvLine = s8lines().slice(n2).filter(l => kv(l, 'guid') === guid).pop();
  V('D7 MOVE', !(l2 && l2.op_type === 'GEOM_MOVE' && a2.len === b2.len + 1) ? 'INCONCLUSIVE' : (mvLine && kv(mvLine, 'costDelta') === '0.00' ? 'PASS' : 'FAIL'), 'lastOp=' + (l2 && l2.op_type) + ' costDelta=' + (mvLine ? kv(mvLine, 'costDelta') : 'no line'));
}, { width: 1200, height: 850, dpr: 2, url: URL, noExit: true }).then(r => {
  const c = s => verdict.filter(v => v === s).length;
  console.log('§S8_EDIT_DELTA SUMMARY ' + c('PASS') + ' PASS / ' + c('FAIL') + ' FAIL / ' + c('INCONCLUSIVE') + ' INCONCLUSIVE (harness ' + JSON.stringify(r) + ')');
  process.exit(c('FAIL') || c('INCONCLUSIVE') || r.fail ? 1 : 0);
});
