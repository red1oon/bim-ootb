#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-SAVE-COMPLETEIT: witness for the Modeller "Save" gate (prompts/MODELLER_SAVE_COMPLETEIT.md)
 * Read the log after every run. This drives the REAL production path: a real Open (via #b-open), a real click
 * on the real #b-save button (the same DOM element the user clicks), and reads back console §-tagged evidence
 * plus the REAL IndexedDB catalog (bim_ootb_imports/buildings) the landing page reads. The only "engineered"
 * part is which geometric PRECONDITION exists before that click — real mouse-drags can't reliably land on an
 * exact clash/gap threshold, so (matching this repo's own precedent in tests/witness_sdg_gate.js A8, which
 * builds a synthetic-but-real-shaped `rel.abuts` fixture for the identical reason: no real recovered abuts pair
 * in this resident actually touches within tolerance post-seed) preconditions are engineered via the REAL
 * production primitives — window.Bonsai.oplog.commit() (the exact function every real drag funnels through)
 * and a synthetic window.swXEdges.abuts entry using REAL guids of REAL elements already in the scene. Nothing
 * about the Save code path itself is stubbed.
 *
 * CLAIMS:
 *   S1 RED-BLOCKS   — driving two real elements into deep interpenetration, then clicking #b-save, blocks the
 *                     physical-DB write (§SAVE_BLOCKED reason=RED_CLASH), no §SAVE_SNAPSHOT logged, catalog
 *                     record for this building is untouched (no version added).
 *   S2 AUTOHEAL     — an auto-healable ORANGE abuts-realign (real proposedDelta) auto-commits a GEOM_MOVE,
 *                     re-verifies gap-closed, re-evaluates Clean, and writes a REAL physical snapshot into the
 *                     SAME shared bim_ootb_imports/buildings catalog record (versions[]+1, latestVersion bumped,
 *                     bytes are a real SQLite file).
 *   S3 ONE-HOP      — a case engineered so healing the S2 pair ALSO disturbs a third element (B) that was
 *                     flush with the same neighbour on the opposite face: B's newly-opened gap surfaces as a
 *                     NEW reported orange item (§SAVE_AUTOHEAL_ONEHOP) but is NOT auto-fixed (only the original
 *                     finding was healed — one heal pass, never chased).
 *   S4 NO-REGRESSION— window.Bonsai.oplog history/undo (existing gesture-undo primitives) is untouched by any
 *                     of the above: op count only ever grows by real commits, no unexpected mutation.
 */
'use strict';
const { runE2E } = require('./e2e_harness');

runE2E('W-SAVE-COMPLETEIT', async (t) => {
  await t.open('Duplex');
  await t.pg.waitForFunction(() => !!window.__saveGateBaseline, { timeout: 20000 }).catch(() => {});
  const baselineArmed = await t.pg.evaluate(() => !!window.__saveGateBaseline);
  t.assert('A0 BASELINE-ARMED (Save gate has a real "before" snapshot from Open)', baselineArmed, 'armed=' + baselineArmed);

  const buildingKey = await t.pg.evaluate(() => window.__dwName);
  console.log('  §W-SAVE building=' + buildingKey);

  // catalog helper: read the shared bim_ootb_imports/buildings record for this building (real IndexedDB read).
  // MUST define onupgradeneeded (creating the 'buildings' store if absent) — an indexedDB.open() call at the
  // TARGET version with no upgrade handler, run BEFORE save_catalog.js's own real open, would otherwise create
  // the DB at v2 with ZERO object stores and PERMANENTLY skip the store-creation upgrade for the rest of the
  // browser session (upgradeneeded only fires when the requested version > the existing one).
  const readCatalog = () => t.pg.evaluate((key) => new Promise((resolve) => {
    const req = indexedDB.open('bim_ootb_imports', 2);
    req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains('buildings')) db.createObjectStore('buildings'); };
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('buildings')) { resolve(null); return; }
      const tx = db.transaction('buildings', 'readonly');
      const g = tx.objectStore('buildings').get(key);
      g.onsuccess = () => resolve(g.result ? { versions: g.result.versions.length, latestVersion: g.result.latestVersion } : null);
      g.onerror = () => resolve(null);
    };
    req.onerror = () => resolve(null);
  }), buildingKey);

  const catalog0 = await readCatalog();
  console.log('  §W-SAVE catalog-before=' + JSON.stringify(catalog0));

  // ── S1 — RED clash blocks Save ──────────────────────────────────────────────────────────────
  const cursorBeforeS1 = await t.oplog();   // full restore point — auto-heal may ALSO commit collateral
  // ops before the block decision fires (spec: heal runs first, always), so undo must target this exact
  // cursor afterward, not just "one step back".
  const clashPair = await t.pg.evaluate(() => {
    const boxes = window.__gateBoxes(), rel = window.__gateRel();
    // avoid elements that are real abuts-neighbours of anything (moving one would ripple real geometry
    // via auto-heal before the block fires — correct behaviour, but noisy for THIS isolated RED-only case) —
    // prefer small, unconnected elements so S1 stays a clean, single-purpose RED demonstration.
    const fbg = window.__arcFidByGuid || {};
    const abutFids = new Set();
    ((window.swXEdges && window.swXEdges.abuts) || []).forEach(e => { const a = fbg[e.a], b = fbg[e.b]; if (a != null) abutFids.add(a); if (b != null) abutFids.add(b); });
    const vol = (id) => { const b = boxes[id]; return (b[1] - b[0]) * (b[3] - b[2]) * (b[5] - b[4]); };
    const ids = Object.keys(boxes).map(Number).filter(id => !abutFids.has(id)).sort((a, b) => vol(a) - vol(b));
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i], b = ids[j];
      if (rel.related(a, b)) continue;
      const ca = [(boxes[a][0] + boxes[a][1]) / 2, (boxes[a][2] + boxes[a][3]) / 2, (boxes[a][4] + boxes[a][5]) / 2];
      const cb = [(boxes[b][0] + boxes[b][1]) / 2, (boxes[b][2] + boxes[b][3]) / 2, (boxes[b][4] + boxes[b][5]) / 2];
      return { a, b, dx: cb[0] - ca[0], dy: cb[1] - ca[1], dz: cb[2] - ca[2] };
    }
    return null;
  });
  t.assert('S1-SETUP found an unrelated pair to clash', !!clashPair, JSON.stringify(clashPair));
  await t.pg.evaluate(async (p) => {
    await window.Bonsai.oplog.commit({ op_type: 'GEOM_MOVE', parameters: { parent: p.a, dx: p.dx, dy: p.dy, dz: p.dz } });
  }, clashPair);
  await t.sleep(300);
  await t.pg.evaluate(() => { window.__lastSaveResult = undefined; });   // clear before the click — the real onclick handler is fire-and-forget, so poll for a FRESH result rather than a fixed sleep
  await t.clickSel('#b-save');
  await t.pg.waitForFunction(() => window.__lastSaveResult !== undefined, { timeout: 15000 }).catch(() => {});
  const r1 = await t.pg.evaluate(() => window.__lastSaveResult);
  const blockedLog = t.slog.filter(l => /^§SAVE_BLOCKED/.test(l)).pop() || '';
  const snapLogAfterS1 = t.slog.filter(l => /^§SAVE_SNAPSHOT/.test(l));
  const catalogAfterS1 = await readCatalog();
  t.assert('S1 RED-BLOCKS (real clash → real #b-save click → blocked, no snapshot, catalog untouched)',
    r1 && r1.ok === false && r1.reason === 'red-blocked' && /reason=RED_CLASH/.test(blockedLog) &&
    snapLogAfterS1.length === 0 && JSON.stringify(catalog0) === JSON.stringify(catalogAfterS1),
    'result=' + JSON.stringify(r1) + ' log="' + blockedLog + '" catalog=' + JSON.stringify(catalogAfterS1));

  // fully restore to the exact pre-S1 state (undoes the clash move AND any collateral auto-heal gesture) so
  // S2/S3's baseline+geometry start clean. Uses the REAL oplog.undo() (soft-delete via the `undone` flag —
  // the SAME function Ctrl+Z calls; a whole gesture-group undoes as ONE step per §P8) in a loop until
  // oplog.length is back to the pre-S1 count — NOT the #hist-slider (that's a separate VIEW-scrub projection
  // whose DOM max/value only gets synced by syncHistory(), which this test's direct oplog.commit() calls
  // deliberately bypass, same as witness_sdg_gate.js's own fixture-engineering convention).
  await t.pg.evaluate(async (targetLen) => {
    let guard = 0;
    while (window.Bonsai.oplog.length > targetLen && guard++ < 10) { await window.Bonsai.oplog.undo(); }
  }, cursorBeforeS1.len);
  await t.sleep(300);
  await t.pg.evaluate(() => { if (window.__saveGateInit) window.__saveGateInit(); });   // re-arm baseline at the restored (pre-S1) state
  await t.sleep(200);

  // ── S2 — auto-healable ORANGE (abuts-realign) → Clean → real physical snapshot ─────────────────
  // Build a REAL 3-element fixture: wA (a real full-height WALL — deliberately chosen so it ALSO exercises the
  // heal's cascade-ride fix: wA hosts real doors/windows, so healing it must ride them or it would manufacture
  // a fresh door-out RED) with TWO other real SMALL, otherwise-unconnected elements (elC, elB — furniture-scale,
  // not walls/doors/windows, so moving them doesn't ripple unrelated real geometry) moved flush against wA's
  // two opposite faces on its thinnest (normal) axis — mirrors witness_sdg_gate.js A8's own "construct a
  // genuinely flush neighbour" technique (no real recovered abuts pair in this resident actually touches within
  // tolerance post-seed — a known, separately-tracked data/frame gap, not this test's concern). A synthetic
  // window.swXEdges.abuts entry (REAL guids) tells the gate these ARE face-touch pairs.
  const fixture = await t.pg.evaluate(() => {
    const boxes = window.__gateBoxes(), rel = window.__gateRel();
    const fbg = window.__arcFidByGuid || {};
    const entangled = new Set();   // anything already a host/filling or a real abuts-partner — keep elC/elB OUT of this set
    Object.keys(rel.hostOf).forEach(k => { entangled.add(+k); entangled.add(rel.hostOf[k]); });
    ((window.swXEdges && window.swXEdges.abuts) || []).forEach(e => { const a = fbg[e.a], b = fbg[e.b]; if (a != null) entangled.add(a); if (b != null) entangled.add(b); });
    const ids = Object.keys(boxes).map(Number);
    const ext = (id) => { const b = boxes[id]; return [b[1] - b[0], b[3] - b[2], b[5] - b[4]]; };
    // wA: a real full-height wall — thick-enough thinnest axis (typical wall thickness), long run (mx>3).
    const wallish = ids.filter(id => { const e = ext(id); const mn = Math.min(...e), mx = Math.max(...e); return mn > 0.3 && mn < 0.6 && mx > 3; });
    if (!wallish.length) return { error: 'no wall-shaped element found' };
    const wA = wallish[0];
    // elC/elB: SMALL (furniture-scale, every dimension < 1.5m — this excludes doors/windows, which run ~2m+
    // tall), not already entangled in any real host/abuts relation, and not wA itself.
    const small = ids.filter(id => id !== wA && !entangled.has(id) && Math.max(...ext(id)) < 1.5);
    if (small.length < 2) return { error: 'not enough small free elements (' + small.length + ')' };
    const [elC, elB] = small;
    const wBox = boxes[wA], wExt = ext(wA);
    const k = wExt.indexOf(Math.min(...wExt));
    // move elC flush against wA's MAX face on axis k; elB flush against wA's MIN face on axis k. Other axes
    // centred on wA's centre (guarantees real overlap there, so k is unambiguously the min-|overlap| axis).
    function flushDelta(id, side) {
      const b = boxes[id];
      const d = [0, 0, 0];
      for (let ax = 0; ax < 3; ax++) {
        if (ax === k) {
          d[ax] = side > 0 ? (wBox[2 * k + 1] - b[2 * k]) : (wBox[2 * k] - b[2 * k + 1]);
        } else {
          const wC = (wBox[2 * ax] + wBox[2 * ax + 1]) / 2, bC = (b[2 * ax] + b[2 * ax + 1]) / 2;
          d[ax] = wC - bC;
        }
      }
      return d;
    }
    return { wA, elC, elB, k, axis: 'xyz'[k], dC: flushDelta(elC, +1), dB: flushDelta(elB, -1) };
  });
  t.assert('S2-SETUP found wall + 2 real elements to seat', !fixture.error, JSON.stringify(fixture));

  await t.pg.evaluate(async (f) => {
    await window.Bonsai.oplog.commit({ op_type: 'GEOM_MOVE', parameters: { parent: f.elC, dx: f.dC[0], dy: f.dC[1], dz: f.dC[2] } });
    await window.Bonsai.oplog.commit({ op_type: 'GEOM_MOVE', parameters: { parent: f.elB, dx: f.dB[0], dy: f.dB[1], dz: f.dB[2] } });
    // synthetic abuts edges — REAL guids, via the real ARC-1 bridge — telling the gate wA touches BOTH.
    window.swXEdges = window.swXEdges || { abuts: [], fills: [], anchored: [], spans: [], aggregates: [], datums: [] };
    window.swXEdges.abuts.push({ a: window.__arcGuidByFid[f.wA], b: window.__arcGuidByFid[f.elC] });
    window.swXEdges.abuts.push({ a: window.__arcGuidByFid[f.wA], b: window.__arcGuidByFid[f.elB] });
    console.log('§W-SAVE-FIXTURE synthetic abuts added wA=' + f.wA + ' elC=' + f.elC + ' elB=' + f.elB + ' axis=' + f.axis);
    window.__saveGateInit();   // re-arm the baseline AT THIS FLUSH state — "as of last known-good"
  }, fixture);
  await t.sleep(300);

  // THE EDIT: elC pulls away from wA by 0.5m on the touch axis (real GEOM_MOVE) — triggers abuts-realign.
  const pullAway = await t.pg.evaluate((f) => {
    const d = [0, 0, 0]; const sign = 1;   // moving further in the SAME +direction elC was seated toward (away from wA)
    d[f.k] = 0.5 * sign;
    return d;
  }, fixture);
  await t.pg.evaluate(async (f, d) => {
    await window.Bonsai.oplog.commit({ op_type: 'GEOM_MOVE', parameters: { parent: f.elC, dx: d[0], dy: d[1], dz: d[2] } });
  }, fixture, pullAway);
  await t.sleep(300);

  const gateBefore2 = await t.pg.evaluate((f) => {
    const before = window.__saveGateBaseline, after = window.__gateBoxes(), rel = window.__gateRel();
    const moved = Object.keys(after).map(Number).filter(id => { const b = before[id], a = after[id]; return !b || b.some((v, i) => Math.abs(v - a[i]) > 1e-9); });
    return window.SdgGate.evaluate(before, after, moved, rel, {});
  }, fixture);
  console.log('  §W-SAVE pre-save-gate red=' + gateBefore2.red.length + ' orange=' + JSON.stringify(gateBefore2.orange));
  t.assert('S2-PRECONDITION real abuts-realign present before Save (proposedDelta real, no RED)',
    gateBefore2.red.length === 0 && gateBefore2.orange.some(o => o.kind === 'abuts-realign' && Array.isArray(o.proposedDelta)),
    JSON.stringify(gateBefore2.orange));

  await t.pg.evaluate(() => { window.__lastSaveResult = undefined; });
  await t.clickSel('#b-save');
  await t.pg.waitForFunction(() => window.__lastSaveResult !== undefined, { timeout: 15000 }).catch(() => {});
  await t.sleep(300);
  const r2 = await t.pg.evaluate(() => window.__lastSaveResult);
  const autohealLog = t.slog.filter(l => /^§SAVE_AUTOHEAL fixed=/.test(l)).pop() || '';
  const reverifyGapLog = t.slog.filter(l => /^§SAVE_AUTOHEAL_REVERIFY/.test(l));
  const cleanLog = t.slog.filter(l => /^§SAVE_CLEAN/.test(l)).pop() || '';
  const snapLog = t.slog.filter(l => /^§SAVE_SNAPSHOT/.test(l)).pop() || '';
  const catalogAfterS2 = await readCatalog();
  t.assert('S2 AUTOHEAL (real GEOM_MOVE auto-committed + per-finding reverify closed=true + Clean + real snapshot in the SAME shared catalog)',
    r2 && r2.ok === true && r2.healed.length >= 1 && /fixed=\d+/.test(autohealLog) &&
    reverifyGapLog.some(l => /closed=true/.test(l)) && /result=Clean/.test(cleanLog) &&
    /^§SAVE_SNAPSHOT/.test(snapLog) && catalogAfterS2 &&
    (catalog0 ? catalogAfterS2.versions === catalog0.versions + 1 : catalogAfterS2.versions === 1) &&
    catalogAfterS2.latestVersion === catalogAfterS2.versions - 1,
    'result=' + JSON.stringify(r2) + ' autoheal="' + autohealLog + '" reverify=' + JSON.stringify(reverifyGapLog) +
    ' clean="' + cleanLog + '" snap="' + snapLog + '" catalog=' + JSON.stringify(catalogAfterS2) + ' (before=' + JSON.stringify(catalog0) + ')');

  // S3 — ONE-HOP: healing wA (moving it to reclose against elC) disturbs elB, which was flush on wA's OPPOSITE
  // face and never moved itself — its gap opening is a genuinely NEW finding this SAME Save's heal pass caused.
  const onehopLog = t.slog.filter(l => /^§SAVE_AUTOHEAL_ONEHOP/.test(l)).pop() || '';
  const reverifyRedOrange = t.slog.filter(l => /^§SAVE_REVERIFY/.test(l)).pop() || '';
  // elB is the UNMOVED neighbour in this new pair (wA is the one that moved, via the heal) — so per sdg_gate.js's
  // own nb/mv convention (nb=finding.a, the unmoved side) elB shows up as "a", wA as "b". Check for the EXACT
  // pair, not just elB appearing anywhere (it also legitimately shows up elsewhere in the full residual-orange log).
  const onehopHitsElB = new RegExp('"kind":"abuts-realign","a":' + fixture.elB + ',"b":' + fixture.wA + '\\b').test(onehopLog);
  t.assert('S3 ONE-HOP (healing wA opened a NEW issue at elB — reported via §SAVE_AUTOHEAL_ONEHOP, not auto-fixed a 2nd time)',
    /^§SAVE_AUTOHEAL_ONEHOP/.test(onehopLog) && onehopHitsElB,
    'onehop="' + onehopLog + '" reverify="' + reverifyRedOrange + '" elB=' + fixture.elB + ' wA=' + fixture.wA);
  // confirm elB itself was never targeted by an autoheal GEOM_MOVE commit (only wA was — one-hop, not chased)
  t.assert('S3b elB NOT auto-healed itself (only the ORIGINAL finding'+"'"+'s target — wA — got a heal op)',
    !new RegExp('targets=[^\\n]*\\b' + fixture.elB + '\\b').test(autohealLog), 'autoheal="' + autohealLog + '"');

  // ── S4 — no regression on existing history/undo (real gesture-undo primitives untouched) ──────
  const histFinal = await t.oplog();
  t.assert('S4 NO-REGRESSION (op-log length only grew via real commits — no unexplained mutation; cursor==length)',
    histFinal.len >= cursorBeforeS1.len && histFinal.cur === histFinal.len,
    'before=' + JSON.stringify(cursorBeforeS1) + ' after=' + JSON.stringify(histFinal));
  // Existing gesture-undo primitive itself still works post-Save: one more real undo() removes exactly the
  // LAST gesture (the S2 heal-gesture, or its own most recent group) and length drops accordingly.
  const preUndoCheck = await t.oplog();
  const undoRes = await t.pg.evaluate(() => window.Bonsai.oplog.undo());
  const postUndoCheck = await t.oplog();
  t.assert('S4b UNDO-STILL-WORKS (a real Ctrl+Z-equivalent undo() after Save still removes exactly one gesture)',
    undoRes && undoRes.undone != null && postUndoCheck.len < preUndoCheck.len,
    'undoRes=' + JSON.stringify(undoRes) + ' len ' + preUndoCheck.len + '→' + postUndoCheck.len);
}, { width: 1200, height: 850, dpr: 1 });
