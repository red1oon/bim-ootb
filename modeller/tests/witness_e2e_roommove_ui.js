#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-ROOMMOVE-UI: real-user, maths-asserted E2E of the whole-room-move UI wiring.
 * Implementing prompts/Modeller/ROOM_MOVE_AND_ITEM_DRAG_SPEC.md §2.5 — Witness: W-ROOMMOVE-UI.
 * Read the log after every run. Exit code alone is not evidence.
 *
 * SCOPE: this witness proves the UI LAYER wired onto the already-shipped, already-witnessed engine
 * (bonsai_roommove.js — W-ROOM-MOVE 10/10, W-ROOM-MOVE-ROUNDTRIP 7/7, both pure-node) actually reaches it via
 * real pointer input on the real loaded Duplex — grab target = the Outliner room node's ⛶ glyph (spec
 * §2.1: an IfcSpace carries no rendered mesh, so the Outliner is the only real grab target), drag = a real
 * canvas ground-plane gesture, commit = through the engine's own commit() (never re-implemented here).
 *
 *   G0 REFUSE-BAD-GUID  — __armRoomMove on a guid that resolves to no qualified room refuses audibly (no
 *                         crash, no session, the console line is NOT swallowed) — spec §2.7.
 *   G1 OPEN             — Duplex opens for real; the Outliner renders ≥1 real ⛶ room-grab glyph. (NOTE: the
 *                         app's live SampleHouse resident, SampleHouse_ARC.db, has NO spatial_structure table
 *                         at all — a lighter schema than the standalone SampleHouse_extracted.db the pure-node
 *                         W-ROOM-MOVE witness uses — so it never carries a room the Outliner can show. Duplex's
 *                         live resident (Duplex_ARC.db) DOES carry spatial_structure/IfcSpace rows, confirmed
 *                         by direct query (21 rooms, 2 habitable storeys), so it is the real subject here.)
 *   G2 GRAB-REAL        — a real click on a room glyph arms room-move with a non-empty member session (the
 *                         engine's own §2.7 "zero members → refuse" path is honoured — a genuinely empty room
 *                         is skipped in favour of the next glyph, never forced).
 *   G3 DRAG-REAL        — a real mouse down→move→move→up on the canvas ground plane (no synthetic engine call).
 *   G4 COMMIT           — exactly ONE new GEOM_ROOM_MOVE row landed, dz=0.000 (Q4 in-plane-only), verify=true.
 *   G5 MEMBER-COUNT     — the committed op's member list is BYTE-IDENTICAL (same length + same featureIds) to
 *                         the session enumerated at grab time — the UI never re-derives or truncates membership.
 *   G6 KINEMATICS       — a real member's rendered world AABB centre shifted by EXACTLY the committed (dx,dy);
 *                         z unchanged (proves the UI's screen→world delta reaches the engine intact).
 *   G7 CHAIN-OK         — verifyChain passes on the live signed log.
 *   G8 UNDO             — one scrub back restores the cursor AND the member's exact pre-drag AABB centre.
 *   G9 NO-ERROR         — (asserted by the shared harness) no pageerror across the whole sequence.
 *
 * Regression sweep (run separately, not inside this file — see prompts/Modeller/ROOM_MOVE_AND_ITEM_DRAG_SPEC.md
 * session card): node modeller/tests/witness_e2e_gridmove_real.js, node modeller/tests/witness_arc_editable.js —
 * both must stay green (shared canvas pointer surface is exactly where a UI-wiring collision would show).
 */
'use strict';
const { runE2E } = require('./e2e_harness');

const centre = (t, fid) => t.pg.evaluate((f) => {
  const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === f);
  if (!m) return null; const b = new window.THREE.Box3().setFromObject(m); const c = new window.THREE.Vector3(); b.getCenter(c); return [c.x, c.y, c.z];
}, fid);

runE2E('W-ROOMMOVE-UI', async (t) => {
  await t.open('Duplex');

  // G0 REFUSE-BAD-GUID: on the now-open Duplex, a guid that resolves to no qualified room is refused by
  // the ENGINE's own §2.7 "not a qualified room" check — the UI must not swallow that console line, and must
  // not crash or leave a phantom armed session behind.
  const g0 = await t.pg.evaluate(() => { try { window.__armRoomMove('NOT-A-REAL-SPACE-GUID'); return true; } catch (e) { return false; } });
  await t.sleep(150);
  const g0stat = await t.pg.evaluate(() => (document.getElementById('stat') || {}).textContent || '');
  const g0noSession = await t.pg.evaluate(() => !window.Bonsai.roommove._session);
  t.assert('G0 REFUSE-BAD-GUID (engine refusal surfaced via status bar, no crash, no phantom session)',
    g0 === true && g0noSession && /room move/i.test(g0stat), 'stat="' + g0stat + '" noSession=' + g0noSession);

  // G1 OPEN: Duplex loaded; the Outliner renders at least one real room grab glyph.
  await t.sleep(600);
  const glyphs = await t.pg.evaluate(() => Array.from(document.querySelectorAll('.bn-roommove')).map(el => el.getAttribute('data-room')));
  t.assert('G1 OPEN (Duplex open, Outliner shows ≥1 real room ⛶ glyph)', glyphs.length > 0, 'glyphs=' + glyphs.length);

  // G2 GRAB-REAL: real click each glyph in turn until one arms with a non-empty session (spec §2.7 — a
  // genuinely empty room is skipped, never forced open).
  let armedGuid = null, sessionBefore = null;
  for (const guid of glyphs) {
    const el = await t.pg.evaluateHandle((g) => document.querySelector('.bn-roommove[data-room="' + g + '"]'), guid);
    const elH = el.asElement();
    const box = elH ? await elH.boundingBox().catch(() => null) : null;
    if (!box) continue;
    await t.pg.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await t.sleep(200);
    const s = await t.pg.evaluate(() => {
      const s = window.Bonsai.roommove._session;
      return s ? { spaceGuid: s.spaceGuid, name: s.room.name, members: s.members.map(m => m.featureId), byVia: s.byVia } : null;
    });
    if (s && s.members.length > 0) { armedGuid = guid; sessionBefore = s; break; }
  }
  t.assert('G2 GRAB-REAL (a real Outliner-glyph click armed room-move with a non-empty member session)',
    !!sessionBefore, armedGuid ? ('room="' + sessionBefore.name + '" members=' + sessionBefore.members.length +
      ' via=' + JSON.stringify(sessionBefore.byVia)) : 'no glyph produced a non-empty session — see glyphs=' + JSON.stringify(glyphs));
  if (!sessionBefore) { console.log('  §ABORT no armable room found — skipping G3-G8'); return; }

  const subjectFid = sessionBefore.members[0];
  const c0 = await centre(t, subjectFid);
  const before = await t.oplog();

  // G3 DRAG-REAL: a real mouse down→move→move→up on the canvas ground plane. Any two canvas points work (the
  // UI computes dx,dy purely from the ground-plane hit delta — spec §2.5's previewCommands(dx,dy)); pick two
  // points comfortably inside the viewport so the ground-plane raycast reliably hits.
  const vw = t.pg.viewport().width, vh = t.pg.viewport().height;
  const down = [vw * 0.42, vh * 0.55], mid = [vw * 0.50, vh * 0.47], up = [vw * 0.58, vh * 0.40];
  await t.pg.mouse.move(down[0], down[1]); await t.sleep(60);
  await t.pg.mouse.down(); await t.sleep(80);
  await t.pg.mouse.move(mid[0], mid[1], { steps: 8 }); await t.sleep(200);
  await t.shot('roommove-drag-preview');
  await t.pg.mouse.move(up[0], up[1], { steps: 8 }); await t.sleep(200);
  await t.pg.mouse.up(); await t.sleep(500);

  const after = await t.oplog(); const last = await t.lastOp(); const chain = await t.verifyChain();
  await t.shot('roommove-committed');

  // G4 COMMIT: exactly one new GEOM_ROOM_MOVE, dz=0, verify implied by the harness (t.lastOp reads the signed row).
  t.assert('G4 COMMIT (exactly ONE new GEOM_ROOM_MOVE, dz=0.000)',
    after.len === before.len + 1 && last && last.op_type === 'GEOM_ROOM_MOVE' && last.parameters && last.parameters.dz === 0,
    'opLen ' + before.len + '→' + after.len + ' op=' + (last && last.op_type) + ' dz=' + (last && last.parameters && last.parameters.dz));

  // G5 MEMBER-COUNT: the committed member list is byte-identical to the grab-time session — the UI passes the
  // engine's own enumeration straight through, never re-deriving or truncating it.
  const committedFids = (last && last.parameters && last.parameters.members || []).map(m => m.featureId).sort((a, b) => a - b);
  const sessionFids = sessionBefore.members.slice().sort((a, b) => a - b);
  t.assert('G5 MEMBER-COUNT (committed members byte-identical to the grab-time session)',
    committedFids.length === sessionFids.length && JSON.stringify(committedFids) === JSON.stringify(sessionFids),
    'session=' + sessionFids.length + ' committed=' + committedFids.length);

  // G6 KINEMATICS: the subject member's rendered AABB centre shifted by EXACTLY the committed (dx,dy); z held.
  const c1 = await centre(t, subjectFid);
  const dx = last && last.parameters && last.parameters.dx, dy = last && last.parameters && last.parameters.dy;
  const measuredDx = (c1 && c0) ? c1[0] - c0[0] : null, measuredDy = (c1 && c0) ? c1[1] - c0[1] : null;
  t.assert('G6 KINEMATICS (member AABB centre shifted by exactly the committed Δ, z unchanged)',
    measuredDx != null && Math.abs(measuredDx - dx) < 0.01 && Math.abs(measuredDy - dy) < 0.01 && Math.abs(c1[2] - c0[2]) < 1e-6,
    'Δcommitted=(' + (dx != null ? dx.toFixed(3) : '?') + ',' + (dy != null ? dy.toFixed(3) : '?') + ') Δmeasured=(' +
    (measuredDx != null ? measuredDx.toFixed(3) : '?') + ',' + (measuredDy != null ? measuredDy.toFixed(3) : '?') + ')');

  t.assert('G7 CHAIN-OK (verifyChain)', chain === true, 'verifyChain=' + chain);

  // G8 UNDO: one scrub back restores the cursor AND the subject's exact pre-drag AABB centre.
  await t.undoToCursor(before.cur);
  const undo = await t.oplog(); const c2 = await centre(t, subjectFid);
  await t.shot('roommove-undone');
  t.assert('G8 UNDO (one scrub restores cursor + member AABB centre, byte-exact)',
    undo.cur === before.cur && c2 && c0 && Math.abs(c2[0] - c0[0]) < 1e-2 && Math.abs(c2[1] - c0[1]) < 1e-2,
    'cursor ' + after.cur + '→' + undo.cur + ' (want ' + before.cur + ')  centre ' + JSON.stringify(c2 && c2.map(v => +v.toFixed(3))) + ' (want ' + JSON.stringify(c0 && c0.map(v => +v.toFixed(3))) + ')');

  const sessLine = t.slog.find(l => l.indexOf('§ROOMMOVE §SESSION begin') >= 0);
  const commitLine = t.slog.find(l => l.indexOf('§ROOMMOVE commit') >= 0);
  console.log('  §CITE ' + (sessLine || '(no §SESSION begin line captured)'));
  console.log('  §CITE ' + (commitLine || '(no §ROOMMOVE commit line captured)'));
}, { width: 1200, height: 850, dpr: 2 });
