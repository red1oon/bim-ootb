#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-PATTERN-DECOR-REFOLD scope (read the log after every run)
 * SCOPE: bim-compiler prompts/Modeller/PATTERN_REVIEW_2026-09-27.md §B1-ROW1.
 * ISSUE UNDER TEST: a re-fold (bonsai_kernel.foldChainToScene) rebuilds every mesh with default material and
 * visible=true. Selection tint, shadows and x-ray each re-apply themselves on 'bonsai:refold'; the Outliner eye-hide
 * and the find-box dim do NOT — so after a history scrub the Outliner still says "hidden"/"filtered" while the scene
 * shows the element visible and undimmed. The UI and the scene disagree.
 * Real user path: Open panel → Duplex (e2e_harness t.open); the real Outliner eye glyph (.bn-eye); typing in the real
 * #bo-find box; the re-fold is bonsai_oplog.scrubTo — the call the #hist-slider handler makes.
 * CLAIMS (RED on the pre-fix code for H1 and D1):
 *   H0 HIDE-APPLIED   — eye click hid mesh T (visible=false), Outliner _hidden holds T.
 *   H1 HIDE-SURVIVES  — after scrubTo(cur-1)→scrubTo(cur), T's NEW mesh is still visible=false while the Outliner
 *                       still marks it hidden (scene == UI).
 *   H2 SHOW-WORKS     — eye click again → T visible=true (the re-apply never leaves an element stuck hidden).
 *   D0 DIM-APPLIED    — typing a term that matches P ghosts control mesh C (opacity 0.15), P keeps its opacity.
 *   D1 DIM-SURVIVES   — after the same re-fold, with the find box still holding the term, C's NEW material is still
 *                       0.15/transparent and P's is not dimmed.
 *   D2 RESTORE        — clearing the box restores C to its pre-dim opacity/transparent exactly.
 *   A0 ANCHORS-HIDDEN — no invisible ride anchor became visible through any re-apply (count of visible anchors = 0).
 */
'use strict';
const { runE2E } = require('./e2e_harness');

const meshState = (t, fids) => t.pg.evaluate((fids) => {
  const g = window.Bonsai.group(), out = {};
  fids.forEach(f => { const m = g.children.find(o => o.isMesh && o.userData.featureId === f);
    out[f] = m ? { vis: m.visible, op: m.material.opacity, tr: m.material.transparent, uuid: m.uuid } : null; });
  out.anchorsVisible = g.children.filter(o => o.isMesh && o.userData.anchor && o.visible).length;
  return out;
}, fids);

const refold = async (t) => {
  const o = await t.oplog();
  await t.pg.evaluate(c => window.Bonsai.oplog.scrubTo(c), Math.max(0, o.cur - 1));
  await t.pg.evaluate(c => window.Bonsai.oplog.scrubTo(c), o.cur);
  await t.sleep(600);
  const o2 = await t.oplog();
  return o.cur + '→' + (o.cur - 1) + '→' + o2.cur;
};

runE2E('W-PATTERN-DECOR-REFOLD', async (t) => {
  await t.open('Duplex');
  await t.pg.evaluate(() => Promise.race([window.__arcSeedReady || Promise.resolve(), new Promise(r => setTimeout(r, 120000))]));
  await t.pg.waitForFunction(() => !!window.__arcFidByGuid && Object.keys(window.__arcFidByGuid).length > 0, { timeout: 60000 }).catch(() => {});
  await t.sleep(1000);

  // T = a leaf with an eye in the Outliner DOM; P = a find-box match; C = a control that does not match P's term.
  const pick = await t.pg.evaluate(() => {
    const byFid = window.__arcGuidByFid || {}, g = window.Bonsai.group();
    const meshes = g.children.filter(o => o.isMesh && o.userData.featureId != null && !o.userData.anchor && byFid[o.userData.featureId] != null);
    const T = meshes.find(m => { const row = document.querySelector('[data-bnode="' + byFid[m.userData.featureId] + '"]'); return row && row.querySelector('.bn-eye'); });
    if (!T) return null;
    const P = meshes.find(m => m !== T), term = String(byFid[P.userData.featureId]).slice(0, 8).toLowerCase();
    const C = meshes.find(m => m !== T && m !== P && !String(byFid[m.userData.featureId]).toLowerCase().includes(term));
    return C ? { T: T.userData.featureId, tGuid: byFid[T.userData.featureId], P: P.userData.featureId, C: C.userData.featureId, term,
      c0: { op: C.material.opacity, tr: C.material.transparent } } : null;
  });
  if (!pick) { t.assert('H0 HIDE-APPLIED (a target with an eye exists)', false, 'no target — INCONCLUSIVE'); return; }
  console.log('  §DECOR-PICK ' + JSON.stringify(pick));

  // ── H: eye-hide across a re-fold
  await t.pg.evaluate(g => { const d = document.querySelector('[data-bnode="' + g + '"]'); if (d) d.scrollIntoView({ block: 'center' }); }, pick.tGuid);
  await t.pg.click('[data-bnode="' + pick.tGuid + '"] .bn-eye'); await t.sleep(300);
  const h0 = await meshState(t, [pick.T]);
  const ui0 = await t.pg.evaluate(g => !!(window.Bonsai.outliner && window.Bonsai.outliner._hidden[g]), pick.tGuid);
  t.assert('H0 HIDE-APPLIED (eye → visible=false, Outliner holds it hidden)', h0[pick.T] && h0[pick.T].vis === false && ui0, JSON.stringify(h0[pick.T]) + ' ui=' + ui0);
  const path1 = await refold(t);
  const h1 = await meshState(t, [pick.T]);
  const ui1 = await t.pg.evaluate(g => !!(window.Bonsai.outliner && window.Bonsai.outliner._hidden[g]), pick.tGuid);
  console.log('  §DECOR-HIDE refold ' + path1 + ' T=' + JSON.stringify(h1[pick.T]) + ' outlinerHidden=' + ui1 + ' newMesh=' + (h1[pick.T] && h0[pick.T] && h1[pick.T].uuid !== h0[pick.T].uuid));
  t.assert('H1 HIDE-SURVIVES (new mesh still hidden while the Outliner still marks it hidden)', !!h1[pick.T] && h1[pick.T].uuid !== h0[pick.T].uuid && ui1 && h1[pick.T].vis === false,
    'vis=' + (h1[pick.T] && h1[pick.T].vis) + ' outlinerHidden=' + ui1);
  await t.pg.evaluate(g => { const d = document.querySelector('[data-bnode="' + g + '"]'); if (d) d.scrollIntoView({ block: 'center' }); }, pick.tGuid);
  await t.pg.click('[data-bnode="' + pick.tGuid + '"] .bn-eye'); await t.sleep(300);
  const h2 = await meshState(t, [pick.T]);
  t.assert('H2 SHOW-WORKS (eye again → visible=true)', h2[pick.T] && h2[pick.T].vis === true, JSON.stringify(h2[pick.T]));

  // ── D: find-box dim across a re-fold
  await t.pg.click('#bo-find'); await t.pg.type('#bo-find', pick.term, { delay: 20 }); await t.sleep(500);
  const d0 = await meshState(t, [pick.P, pick.C]);
  t.assert('D0 DIM-APPLIED (control ghosts to 0.15, match keeps opacity)', d0[pick.C].op === 0.15 && d0[pick.C].tr === true && d0[pick.P].op !== 0.15, JSON.stringify(d0));
  const path2 = await refold(t);
  const d1 = await meshState(t, [pick.P, pick.C]);
  const box = await t.pg.evaluate(() => document.getElementById('bo-find').value);
  console.log('  §DECOR-DIM refold ' + path2 + ' box="' + box + '" P=' + JSON.stringify(d1[pick.P]) + ' C=' + JSON.stringify(d1[pick.C]) + ' newMesh=' + (d1[pick.C].uuid !== d0[pick.C].uuid));
  t.assert('D1 DIM-SURVIVES (box still holds the term; the new control material is still dimmed)', box === pick.term && d1[pick.C].uuid !== d0[pick.C].uuid && d1[pick.C].op === 0.15 && d1[pick.C].tr === true && d1[pick.P].op !== 0.15,
    'C op=' + d1[pick.C].op + ' tr=' + d1[pick.C].tr + ' P op=' + d1[pick.P].op);
  await t.pg.click('#bo-find', { clickCount: 3 }); await t.pg.keyboard.press('Backspace'); await t.sleep(500);
  const d2 = await meshState(t, [pick.C]);
  t.assert('D2 RESTORE (clear box → control back to its pre-dim opacity/transparent)', d2[pick.C].op === pick.c0.op && d2[pick.C].tr === pick.c0.tr, JSON.stringify(d2[pick.C]) + ' want ' + JSON.stringify(pick.c0));
  t.assert('A0 ANCHORS-HIDDEN (no ride anchor revealed by any re-apply)', d2.anchorsVisible === 0 && d1.anchorsVisible === 0 && h1.anchorsVisible === 0, 'visible anchors h1/d1/d2=' + h1.anchorsVisible + '/' + d1.anchorsVisible + '/' + d2.anchorsVisible);
  t.slog.filter(l => /§DECOR|§SEL-TINT-REFOLD|§XRAY-REFOLD|§OLEYE|§OLFILTER/.test(l)).slice(-12).forEach(l => console.log('    ' + l.slice(0, 180)));
});
