#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-S9-IFC-KEY (bim-compiler prompts/TM_4D5D_VARIANCE_LANE.md §S9, red1 Q3 2026-09-30: "any user IFC ARC loaded can do so"). Read the log after every run.
 * SPEC: a NON-resident model opened through the local-IFC open path (SampleHouse · ARC.ifc, the same openIfcFile() a user's own .ifc takes) can Generate a Project Order:
 *   K1 NO-RESIDENT-KEY  the model opened from the .ifc is named by its file ('SampleHouse_ARC'), which is neither a resident key nor in the alias table; its key source must be 'model-name'.
 *                       (measured: the direct-IFC DB has no spatial_structure names; if a DB ever lacks element_transforms the op-log fallback prices from the signed seed rows — not exercised here.)
 *   K2 GENERATE         Generate -> ONE C_Project whose Value == that key; plannedAmt == the sum recomputed HERE from the op-log bboxes x the ACTIVE rates (independent: own arithmetic, BigDecimal).
 *   K3 EDIT-VARIANT     stretch one wall: the read is a variant (A and B offered) and the VO == amount(edited) - the order line; PO + VO == a fresh fold of the edited part.
 * INCONCLUSIVE when nothing was judged. Default target LIVE (E2E_URL); S9_LOCAL=1 = worktree.
 */
'use strict';
const fs = require('fs'), path = require('path');
const { runE2E } = require('./e2e_harness');
const ROOT = path.join(__dirname, '..', '..');
const BigDecimal = require(path.join(ROOT, 'erp', 'bigdecimal.js'));
const LIVE = 'https://red1oon.github.io/bim-ootb';
const verdict = []; const V = (n, s, d) => { verdict.push(s); console.log('§S9_IFC_KEY ' + n + ' ' + d + ' => ' + s); };
const HU = BigDecimal.RoundingMode.HALF_UP;
runE2E('W-S9-IFC-KEY', async (t) => {
  const pg = t.pg, kv = (l, k) => { const m = l.match(new RegExp(k + '=([^ ]+)')); return m ? m[1] : null; }, slog = () => t.slog;
  await t.open(null, { rowText: 'SampleHouse . ARC\\.ifc' });   // the SAME chooser row a user takes for an .ifc (harness open + helpers)
  await pg.waitForFunction(() => window.__dwBuf && window.Bonsai.oplog.length > 0 && window.__arcFidByGuid, { timeout: 300000, polling: 500 }).catch(() => { });
  await t.sleep(4000);
  const info = await pg.evaluate(() => { const b = window.__dwBuf, db = new window.SQL.Database(b instanceof Uint8Array ? b : new Uint8Array(b)); let et = true; try { db.exec('select 1 from element_transforms limit 1'); } catch (e) { et = false; } return { name: window.__dwName, ops: window.Bonsai.oplog.length, elementTransforms: et }; });
  // two walls by real clicks
  await pg.click('#b-fit'); await t.sleep(1000);
  const walls = await pg.evaluate(() => window.Bonsai.oplog._geomOps().filter(o => /Wall/i.test((o.parameters || {}).ifc_class || '') && o.parameters.bbox).map(o => o.id));
  const pick = async (fid, shift) => { const pt = await pg.evaluate(f => window.__e2e.clickPointFor(f), fid); if (!pt) return false; await pg.mouse.move(pt[0], pt[1]); await t.sleep(80); if (shift) await pg.keyboard.down('Shift'); await pg.mouse.click(pt[0], pt[1]); if (shift) await pg.keyboard.up('Shift'); await t.sleep(500); return true; };
  await pg.evaluate(() => { const s = window.__e2e; }).catch(() => { });
  // __e2e helpers are injected by t.open(); inject the minimum here (proj + clickPointFor) by opening nothing: use the harness injector through a no-op
  let A = null, B = null;
  for (const wf of walls) { if (A == null) { if (await pick(wf, false)) { const s = await pg.evaluate(() => Array.from(window.Bonsai._selSet || [])); if (s.length === 1) A = wf; } } else { await t.flySettle(); if (!B) await t.dolly(2.4); if (await pick(wf, true)) { const s = await pg.evaluate(() => Array.from(window.Bonsai._selSet || [])); if (s.length === 2) { B = wf; break; } } } }
  if (A == null || B == null) { V('K1 NO-RESIDENT-KEY', 'INCONCLUSIVE', 'could not select two walls (A=' + A + ' B=' + B + ')'); return; }
  V('K1 NO-RESIDENT-KEY', info.name === 'SampleHouse_ARC' ? 'PASS' : 'FAIL', 'loadedName=' + info.name + ' (the .ifc file base name; NOT the resident key SampleHouse, NOT in the alias table) element_transforms=' + info.elementTransforms + ' ops=' + info.ops);
  const guids = await pg.evaluate(() => Array.from(window.Bonsai._selSet).map(f => window.__arcGuidByFid[f]));
  const n0 = slog().length; await pg.click('#s9-erp-btn'); for (let i = 0; i < 240 && !/§S9-STATE/.test(slog().slice(n0).join('\n')); i++) await t.sleep(500);
  const RATES = await pg.evaluate(() => JSON.parse(JSON.stringify(window.RATES)));
  const dimsOf = (fids, f) => pg.evaluate((fids, f) => fids.map(fid => { const o = window.Bonsai.oplog._geomOps().find(x => x.id === fid), b = o.parameters.bbox; return { cls: o.parameters.ifc_class, d: [(b[1] - b[0]) * (f && f.fid === fid ? f.f[0] : 1), (b[3] - b[2]) * (f && f.fid === fid ? f.f[1] : 1), (b[5] - b[4]) * (f && f.fid === fid ? f.f[2] : 1)] }; }), fids, f || null);
  const area = d => { const s = d.slice().sort((a, b) => b - a); return s[0] * s[1]; };
  const amount = (recs) => { const by = {}; recs.forEach(r => { (by[r.cls] = by[r.cls] || []).push(r.d); }); let tot = BigDecimal.ZERO; Object.keys(by).forEach(c => { const rt = RATES[c] || { rate: 0, unit: 'EA' }; const q = by[c].reduce((s, d) => s + (rt.unit === 'M2' ? area(d) : rt.unit === 'M' ? Math.max(...d) : rt.unit === 'M3' ? d[0] * d[1] * d[2] : 1), 0); tot = tot.add(BigDecimal.of(String(rt.rate)).multiply(BigDecimal.of(String(q))).setScale(0, HU)); }); return tot.toString(); };
  const exp0 = amount(await dimsOf([A, B]));
  const n1 = slog().length; await pg.click('#s9-generate'); for (let i = 0; i < 120 && !/§S9-GENERATE/.test(slog().slice(n1).join('\n')); i++) await t.sleep(400); await t.sleep(800);
  const gen = slog().slice(n1).filter(l => /^§S9-GENERATE/.test(l)).pop() || '', bk = slog().filter(l => /^§S9-BUILDING/.test(l)).pop() || '';
  const nProj = await pg.evaluate(async () => { const s = await window.ProjOrderUI.store(); return window.ProjOrderState.countProjects(s.db, window.ProjOrderState.projectKey(window.__dwName, await (async () => { const b = window.__dwBuf; return new window.SQL.Database(b instanceof Uint8Array ? b : new Uint8Array(b)); })())); });
  V('K2 GENERATE', gen && kv(gen, 'building') === info.name && nProj === 1 && kv(gen, 'plannedAmt') === exp0 && exp0 !== '0' ? 'PASS' : (gen ? 'FAIL' : 'INCONCLUSIVE'), gen.slice(0, 170) + ' | key source: ' + bk.slice(0, 110) + ' | independent(op bboxes x active rates)=' + exp0 + ' projectRows=' + nProj);
  // K3 — stretch wall A (longest local axis), then the variant read + VO
  await pg.evaluate(() => window.Bonsai.select(null)); await t.sleep(300); await t.flySettle(); await pg.click('#b-fit'); await t.sleep(900); await pick(A, false); await t.flySettle(); await t.sleep(500);
  const ld = (await dimsOf([A]))[0].d, axis = ['scaleX', 'scaleY', 'scaleZ'][ld.indexOf(Math.max(...ld))];
  await pg.click('#b-move'); await t.sleep(700);
  const giz = await pg.evaluate(ax => { const gz = window.A.scene.getObjectByName('MoveGizmo'); if (!gz) return null; let c = null; gz.traverse(o => { if (o.userData && o.userData.moveAxis === ax) c = o; }); if (!c) return null; const w = new window.THREE.Vector3(); c.getWorldPosition(w); const g = new window.THREE.Vector3(); gz.getWorldPosition(g); return { cube: [w.x, w.y, w.z], centre: [g.x, g.y, g.z] }; }, axis);
  if (!giz) { V('K3 EDIT-VARIANT', 'INCONCLUSIVE', 'no ' + axis + ' cube'); return; }
  await t.frameElement(A, 0.3);
  const od = giz.cube.map((v, i) => v - giz.centre[i]), oL = Math.hypot(...od) || 1, dW = 0.3 * Math.max(...ld);
  const down = await t.proj(...giz.cube), up = await t.proj(giz.cube[0] + od[0] / oL * dW, giz.cube[1] + od[1] / oL * dW, giz.cube[2] + od[2] / oL * dW);
  const b0 = await t.oplog(); await t.drag(down, up, 10); await t.sleep(2200); const a0 = await t.oplog(), l = await t.lastOp();
  await pg.keyboard.press('Escape'); await t.sleep(400);
  if (!(l && l.op_type === 'GEOM_SCALE' && a0.len === b0.len + 1)) { V('K3 EDIT-VARIANT', 'INCONCLUSIVE', 'scale did not land'); return; }
  const f = [l.parameters.fx || 1, l.parameters.fy || 1, l.parameters.fz || 1];
  const n2 = slog().length; await pg.click('#s9-erp-btn'); for (let i = 0; i < 80 && !/§S9-STATE/.test(slog().slice(n2).join('\n')); i++) await t.sleep(400); await t.sleep(600);
  const st = slog().slice(n2).filter(l2 => /^§S9-STATE/.test(l2)).pop() || '';
  const poNow = kv(gen, 'plannedAmt');   // the order holds A+B; the selection is A alone -> scope note; the VO base is the order LINE, so select BOTH for a whole-line VO: reselect A+B edited
  await pg.evaluate(() => window.Bonsai.select(null)); await t.sleep(300); await t.flySettle(); await pg.click('#b-fit'); await t.sleep(900);
  await pick(A, false); await t.flySettle(); await t.dolly(2.4); await t.sleep(400); await pick(B, true);
  const n3 = slog().length; await pg.click('#s9-erp-btn'); for (let i = 0; i < 80 && !/§S9-STATE/.test(slog().slice(n3).join('\n')); i++) await t.sleep(400); await t.sleep(600);
  const st2 = slog().slice(n3).filter(l2 => /^§S9-STATE/.test(l2)).pop() || '';
  const n4 = slog().length; await pg.click('#s9-b'); for (let i = 0; i < 120 && !/§S9-VO /.test(slog().slice(n4).join('\n')); i++) await t.sleep(400); await t.sleep(800);
  const vo = slog().slice(n4).filter(l2 => /^§S9-VO /.test(l2)).pop() || '';
  const freshEdited = amount(await dimsOf([A, B], { fid: A, f: f }));
  const expVO = BigDecimal.of(freshEdited).subtract(BigDecimal.of(poNow)).toString();
  const inv = vo && BigDecimal.of(poNow).add(BigDecimal.of(kv(vo, 'grandTotal'))).compareTo(BigDecimal.of(freshEdited)) === 0;
  V('K3 EDIT-VARIANT', /kind=variant/.test(st2) && /issueVO/.test(kv(st2, 'actions') || '') && vo && BigDecimal.of(kv(vo, 'grandTotal')).compareTo(BigDecimal.of(expVO)) === 0 && Number(expVO) > 0 && inv ? 'PASS' : (st2 ? 'FAIL' : 'INCONCLUSIVE'),
    'variant read: ' + st2.slice(0, 200) + ' | ' + vo.slice(0, 150) + ' | independent fresh(edited A+B)=' + freshEdited + ' order=' + poNow + ' expVO=' + expVO + ' INVARIANT PO+VO==fresh: ' + inv);
}, { width: 1200, height: 850, dpr: 1, url: process.env.S9_LOCAL ? undefined : LIVE + '/modeller/modeller.html', noExit: true }).then(r => {
  const c = s => verdict.filter(v => v === s).length;
  console.log('§S9_IFC_KEY SUMMARY ' + c('PASS') + ' PASS / ' + c('FAIL') + ' FAIL / ' + c('INCONCLUSIVE') + ' INCONCLUSIVE (harness ' + JSON.stringify(r) + ')');
  process.exit(c('FAIL') || c('INCONCLUSIVE') || r.fail ? 1 : 0);
});
