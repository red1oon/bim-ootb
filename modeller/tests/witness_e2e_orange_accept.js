#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-ORANGE-ACCEPT: an edit-time ORANGE suggestion can be ACCEPTED (MODELLER_MASTER §OPEN LIST row 9).
 * SCOPE: BIMCompiler prompts/Modeller/NEXT_0926/SPEC_ORANGE_ACCEPT.md. Read the log after every run.
 * ISSUE: _runGate toasted "accept or ignore" but nothing accepted — the finding list was dropped (RED on main 9bc2d3c8:
 *   no Accept control exists). Fixture = W-SAVE-BLOCKED-HEAL-INDUCED's real-element recipe (wall + unrelated small
 *   neighbour placed flush, a registered abuts edge) minus its swept third element; the pull-away goes through the move
 *   tool's commit path (__commitMove) so the real gate runs.
 *   A1 PRE      — the pulled pair is a healable abuts-realign and the toast has an Accept button (else VOID). Every Duplex
 *                 element has recovered edges (§XEDGE-3AXIS), so the pull may raise a few more; Accept applies them all.
 *   A2 ONE-OP   — clicking Accept (real DOM click) adds ONE history node / one signed gesture; chain verifies.
 *   A3 CLOSED   — every accepted pair re-verifies closed and the pulled pair's gap is back within the abuts tolerance.
 *   A4 ONE-UNDO — one Ctrl+Z restores the pre-accept boxes (±1 mm); the pull-away edit itself stays.
 *   A5 NO-ERROR
 */
'use strict';
const { runE2E } = require('./e2e_harness');

runE2E('W-ORANGE-ACCEPT', async (t) => {
  await t.open('Duplex');
  await t.pg.waitForFunction(() => !!window.__saveGateBaseline && Object.keys(window.__gateBoxes()).length > 0, { timeout: 30000 }).catch(() => {});
  const setup = await t.pg.evaluate(() => {
    const boxes = window.__gateBoxes(), rel = window.__gateRel();
    const entangled = new Set();
    Object.keys(rel.hostOf).forEach(k => { entangled.add(+k); entangled.add(rel.hostOf[k]); });
    (rel.abuts || []).forEach(e => { entangled.add(e.a); entangled.add(e.b); });
    const ids = Object.keys(boxes).map(Number);
    const ext = (id) => { const b = boxes[id]; return [b[1] - b[0], b[3] - b[2], b[5] - b[4]]; };
    const wallish = ids.filter(id => { const e = ext(id); const mn = Math.min(...e), mx = Math.max(...e); return mn > 0.05 && mn < 0.6 && mx > 1.5; });
    for (const wA of wallish) {
      const wExt = ext(wA), k = wExt.indexOf(Math.min(...wExt));
      if (k === 2) continue;
      // every Duplex element carries recovered edges since §XEDGE-3AXIS, so "unrelated" no longer exists: take the small
      // element with the FEWEST abuts partners (fewest extra suggestions when it is pulled away), never one hosted by wA.
      const deg = {}; (rel.abuts || []).forEach(e => { deg[e.a] = (deg[e.a] || 0) + 1; deg[e.b] = (deg[e.b] || 0) + 1; });
      const small = ids.filter(id => id !== wA && rel.hostOf[id] !== wA && Math.max(...ext(id)) < 2.0 && Math.min(...ext(id)) > 0.05)
        .sort((x, y) => (deg[x] || 0) - (deg[y] || 0));
      if (!small.length) continue;
      // choose with the REAL gate (pure SdgGate.evaluate over simulated boxes): the first neighbour whose flush placement +
      // 0.5 m pull-away raises this pair's abuts-realign and NO RED (a RED edit gets the error toast, not Accept).
      const shift = (bx, d) => [bx[0] + d[0], bx[1] + d[0], bx[2] + d[1], bx[3] + d[1], bx[4] + d[2], bx[5] + d[2]];
      for (const elC of small.slice(0, 40)) {
        const b = boxes[elC], wBox = boxes[wA], d = [0, 0, 0];
        d[k] = wBox[2 * k + 1] - b[2 * k];
        for (let ax = 0; ax < 3; ax++) { if (ax === k) continue; d[ax] = (wBox[2 * ax] + wBox[2 * ax + 1]) / 2 - (b[2 * ax] + b[2 * ax + 1]) / 2; }
        const placed = Object.assign({}, boxes); placed[elC] = shift(b, d);
        const pull = [0, 0, 0]; pull[k] = 0.5;
        const pulled = Object.assign({}, placed); pulled[elC] = shift(placed[elC], pull);
        const r2 = { related: (x, y) => rel.related(x, y) || (Math.min(x, y) === Math.min(wA, elC) && Math.max(x, y) === Math.max(wA, elC)),
          hostOf: rel.hostOf, abuts: (rel.abuts || []).concat([{ a: wA, b: elC }]) };
        const res = window.SdgGate.evaluate(placed, pulled, [elC], r2, {});
        if (!res.red.length && res.orange.some(o => o.kind === 'abuts-realign' && o.a === wA && o.b === elC)) return { wA, elC, k, dC: d, simOrange: res.orange.length };
      }
    }
    return null;
  });
  console.log('  §FIXTURE ' + JSON.stringify(setup));
  if (!setup) { t.assert('A1 PRE (fixture found)', false, 'VOID — no wall + unrelated small neighbour on Duplex'); return; }
  await t.pg.evaluate(async (s) => {
    window.swXEdges = window.swXEdges || { abuts: [], fills: [], anchored: [], spans: [], aggregates: [], datums: [] };
    await window.Bonsai.oplog.commit({ op_type: 'GEOM_MOVE', parameters: { parent: s.elC, dx: s.dC[0], dy: s.dC[1], dz: s.dC[2] } });
    window.swXEdges.abuts.push({ a: window.__arcGuidByFid[s.wA], b: window.__arcGuidByFid[s.elC] });
  }, setup);
  await t.sleep(300);
  // the pull-away, through the move tool's commit path (runs _runGate)
  await t.pg.evaluate(async (s) => { const d = [0, 0, 0]; d[s.k] = 0.5; window.Bonsai.select(s.elC); await window.__commitMove(d[0], d[1], d[2]); }, setup);
  await t.sleep(300);
  const pre = await t.pg.evaluate((s) => {
    const btn = Array.from(document.querySelectorAll('#toast-stack .toast-act')).find(b => b.textContent === 'Accept');
    return { healable: (window.__gateOrange || []).filter(o => o.kind === 'abuts-realign' && o.a === s.wA && o.b === s.elC).length,
      total: (window.__gateOrange || []).length, button: !!btn, gate: window.__lastGate || '',
      nodes: window.ModellerHistory.list().length, boxes: window.__gateBoxes() };
  }, setup);
  const ok1 = pre.healable === 1 && pre.button;
  t.assert('A1 PRE (the pulled pair is a healable abuts-realign, toast has Accept)', ok1, JSON.stringify({ healable: pre.healable, total: pre.total, button: pre.button, gate: pre.gate }));
  if (!ok1) { console.log('  ⚪ VOID — A2-A4 not judged'); return; }

  await t.pg.click('#toast-stack .toast-act');
  await t.pg.waitForFunction(() => Array.isArray(window.__gateOrange) && window.__gateOrange.length === 0, { timeout: 5000 }).catch(() => {});
  await t.sleep(800);
  const line = t.slog.find(l => /§ORANGE-ACCEPT /.test(l)) || '';
  const post = await t.pg.evaluate((s) => {
    const MH = window.ModellerHistory, nodes = MH.list(), b = window.__gateBoxes();
    const ov = window.SdgGate.overlaps(b[s.wA], b[s.elC])[s.k];
    return { nodes: nodes.length, last: JSON.stringify(nodes[nodes.length - 1]).slice(0, 140), gapAfter: ov < 0 ? -ov : 0, boxes: b };
  }, setup);
  t.assert('A2 ONE-OP (one history node for the accept)', post.nodes === pre.nodes + 1 && /"label":"Move"/.test(post.last) && await t.verifyChain(), 'nodes ' + pre.nodes + '→' + post.nodes + ' last=' + post.last);
  const closedArr = JSON.parse((line.match(/closed=(\[[^\]]*\])/) || [])[1] || '[]');
  t.assert('A3 CLOSED (every accepted gap re-verifies closed; the pulled pair ≤ 0.03 m)', closedArr.length === pre.total && closedArr.every(Boolean) && post.gapAfter <= 0.03, line.slice(0, 160) + ' gapAfter=' + post.gapAfter.toFixed(4));

  await t.pg.click('canvas').catch(() => {});
  await t.pg.keyboard.down('Control'); await t.pg.keyboard.press('z'); await t.pg.keyboard.up('Control');
  await t.pg.evaluate(async () => { const MH = window.ModellerHistory; await ((MH.pending && MH.pending()) || Promise.resolve()); });
  await t.sleep(500);
  const und = await t.pg.evaluate(() => window.__gateBoxes());
  const dev = (A, B, id) => Math.max(...A[id].map((v, i) => Math.abs(v - B[id][i])));
  const d1 = Math.max(dev(und, pre.boxes, setup.wA), dev(und, pre.boxes, setup.elC)), dMoved = dev(und, post.boxes, setup.wA) + dev(und, post.boxes, setup.elC);
  t.assert('A4 ONE-UNDO (Ctrl+Z restores pre-accept boxes ±1 mm; the pull-away stays)', d1 <= 0.001 && dMoved > 0.001, 'maxDevFromPreAccept=' + d1.toFixed(5) + ' changedFromPostAccept=' + dMoved.toFixed(4));
});
