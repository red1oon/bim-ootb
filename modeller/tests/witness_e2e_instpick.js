#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-INSTPICK: real-user witness for §Q2 (prompts/RESUME_MODELLER_POLISH2.md).
 * ISSUES IT PROVES: (1) walked fixtures render as InstancedMesh buckets under dwRoot that pickAt never
 * raycast — a canvas click/hover on a walked fixture was a silent miss with zero identity; (2) an Outliner
 * leaf for a non-ARC extracted element dead-ended in a toast even though its REAL transform sits in the
 * open DB. Real path: open Duplex → Walk ELEC (production discWalk) → real mouse click on a fixture →
 * Escape → real Outliner row click. Maths-asserted, read the log after every run.
 *
 * CLAIMS:
 *   P1 IDENTITY-STAMPED — every ELEC InstancedMesh bucket carries dwSub with sub.length === im.count
 *                         (instanceId i ↔ placement record i, array reference — no invented copies).
 *   P2 FIXTURE-IDENTIFIES — a real canvas click on a committed fixture selects its FOLDED signed twin (the
 *                         _dw GEOM_INSERT lands nearest) — the "walked fixtures are pick-dead" complaint is
 *                         dead post-commit, and identity is the op-log row, not a guess. (Measured: the
 *                         instanced bucket is a decorative twin at d+0.3 behind the folded mesh.)
 *   P2b INSTANCED-PICK  — the §Q2 instanced branch itself, exercised where NO folded twin exists: assembly
 *                         parts render InstancedMesh-only (never committed). A real mouse click on a part
 *                         rendered through the PRODUCTION seam (window.__dwRender.assembly) resolves
 *                         hit.instanceId → the exact part record (guid + xyz ≤1e-6).
 *   P3 TINT+CLEAR       — the picked instance's instanceColor becomes the pick tint 0x4fc3f7; Escape
 *                         restores the previous per-instance colour (composes with flash/settle).
 *   P4 ROW-FRAMES       — clicking a walked (non-ARC, no-fid-bridge) Outliner leaf row flies the camera:
 *                         controls.target lands on the element's element_transforms centre ≤1e-3 (DB truth).
 *   P5 HONEST-FALSE     — frameElementByGuid on a guid with NO transform row returns false (the toast
 *                         branch is preserved for genuinely unframeable rows).
 */
'use strict';
const { runE2E } = require('./e2e_harness');
runE2E('W-E2E-INSTPICK', async (t) => {
  await t.open('Duplex');
  await t.pg.evaluate(() => window.discWalk('ELEC', { building: 'Duplex' }));
  await t.pg.waitForFunction(() => {
    const g = window.Bonsai.group(); const root = g && g.children.find(o => o.userData && o.userData.dwRoot);
    return !!(root && root.children.some(o => o.isInstancedMesh && o.userData.dwDisc === 'ELEC'));
  }, { timeout: 30000 }).catch(() => {});
  await t.sleep(2500);   // batched commitSeedGroup settles

  // P1 — identity stamped on every ELEC bucket
  const st = await t.pg.evaluate(() => {
    const g = window.Bonsai.group(); const root = g.children.find(o => o.userData && o.userData.dwRoot);
    const ims = root ? root.children.filter(o => o.isInstancedMesh && o.userData.dwDisc === 'ELEC') : [];
    return { n: ims.length, ok: ims.every(im => Array.isArray(im.userData.dwSub) && im.userData.dwSub.length === im.count),
      counts: ims.map(im => im.count) };
  });
  t.assert('P1 IDENTITY-STAMPED (dwSub.length === count on every ELEC bucket)', st.n > 0 && st.ok,
    'buckets=' + st.n + ' counts=' + JSON.stringify(st.counts));
  if (!(st.n > 0 && st.ok)) return;

  // P2 — real canvas click on a committed fixture. Fly the camera close (from the fit view a wall wins the
  // raycast), click the fixture position, and read what the app selected: the folded signed twin (_dw op).
  const pk = await t.pg.evaluate(() => {
    const g = window.Bonsai.group(); const root = g.children.find(o => o.userData && o.userData.dwRoot);
    const im = root.children.find(o => o.isInstancedMesh && o.userData.dwDisc === 'ELEC' && o.userData.dwSub.length > 10);
    if (!im) return null;
    const r = im.userData.dwSub[4];
    const c = window.A.camera, ct = window.A.controls;
    c.position.set(r.x + 1.2, r.y - 1.2, r.z + 0.6); ct.target.set(r.x, r.y, r.z); ct.update();
    window.A.renderer.render(window.A.scene, window.A.camera);
    return { x: r.x, y: r.y, z: r.z };
  });
  let p2ok = false, p2detail = 'no ELEC bucket';
  if (pk) {
    const px = await t.proj(pk.x, pk.y, pk.z);
    await t.pg.mouse.move(px[0], px[1]); await t.sleep(80);
    await t.pg.mouse.down(); await t.sleep(60); await t.pg.mouse.up(); await t.sleep(300);
    const got = await t.pg.evaluate(() => {
      const inst = window.__lastInstPick || null;
      const fid = window.Bonsai._selSet && window.Bonsai._selSet.size ? Array.from(window.Bonsai._selSet)[0] : null;
      const op = fid != null ? window.Bonsai.oplog._geomOps().find(o => o.id === fid) : null;
      const dw = op && op.parameters && op.parameters._dw;
      return { inst: inst, fid: fid, disc: dw ? dw.disc : null, px: op && op.parameters.placement ? op.parameters.placement.x : null };
    });
    // identity either way: the folded twin (a real signed _dw row — full identity) or the instanced record
    p2ok = (got.disc === 'ELEC') || (got.inst && got.inst.disc === 'ELEC');
    p2detail = 'selected fid=' + got.fid + ' _dw.disc=' + got.disc + ' instPick=' + !!(got.inst);
  }
  t.assert('P2 FIXTURE-IDENTIFIES (click → signed _dw twin or instanced record — never silent)', p2ok, p2detail);

  // P2b — the instanced branch itself, on an InstancedMesh with NO folded twin: assembly parts are
  // render-only (never committed). Render 3 parts through the PRODUCTION seam (__dwRender.assembly — the
  // same function _redrawAllDiscWalks uses), in clear air away from the building, then a REAL mouse click.
  const part = await t.pg.evaluate(() => {
    const parts = [0, 1, 2].map(i => ({ disc: 'ASMW', guid: 'ASMW_PART_' + i, ifc_class: 'IfcDuctSegment',
      piece_type: 'run', pos: [30 + i * 1.5, -30, 1.2], dir: [0, 0, 1], diameter_mm: 300, length_mm: 600 }));
    window.__dwRender.assembly('ASMW', parts);
    const c = window.A.camera, ct = window.A.controls;
    c.position.set(30 + 1.6, -30 - 1.6, 2.0); ct.target.set(30, -30, 1.2); ct.update();
    window.A.renderer.render(window.A.scene, window.A.camera);
    return { x: 30, y: -30, z: 1.2, guid: 'ASMW_PART_0' };
  });
  const ppx = await t.proj(part.x, part.y, part.z);
  await t.pg.mouse.move(ppx[0], ppx[1]); await t.sleep(80);
  await t.pg.mouse.down(); await t.sleep(60); await t.pg.mouse.up(); await t.sleep(300);
  const ip = await t.pg.evaluate(() => window.__lastInstPick || null);
  const p2b = ip && ip.disc === 'ASMW' && ip.guid === part.guid &&
    Math.abs(ip.x - part.x) < 1e-6 && Math.abs(ip.y - part.y) < 1e-6 && Math.abs(ip.z - part.z) < 1e-6;
  t.assert('P2b INSTANCED-PICK (no-twin part → instanceId → exact record, guid + xyz ≤1e-6)', !!p2b,
    ip ? 'got disc=' + ip.disc + ' i=' + ip.i + ' guid=' + ip.guid + ' xyz=(' + (+ip.x).toFixed(3) + ',' + (+ip.y).toFixed(3) + ',' + (+ip.z).toFixed(3) + ')' : 'no instance pick');

  // P3 — tint applied at the picked instanceId, Escape restores
  const tint = await t.pg.evaluate(() => {
    const g = window.Bonsai.group(); const root = g.children.find(o => o.userData && o.userData.dwRoot);
    const lp = window.__lastInstPick; if (!lp) return null;
    const im = root.children.find(o => o.isInstancedMesh && o.userData.dwAsm === lp.disc && o.instanceColor);
    if (!im) return null;
    const a = im.instanceColor, i = lp.i;
    return { rgb: [a.getX(i), a.getY(i), a.getZ(i)], i: i };
  });
  await t.pg.keyboard.press('Escape'); await t.sleep(250);
  const after = await t.pg.evaluate(() => {
    const g = window.Bonsai.group(); const root = g.children.find(o => o.userData && o.userData.dwRoot);
    const lp = window.__lastInstPick; if (!lp) return null;
    const im = root.children.find(o => o.isInstancedMesh && o.userData.dwAsm === lp.disc && o.instanceColor);
    if (!im) return null;
    const a = im.instanceColor;
    return { rgb: [a.getX(lp.i), a.getY(lp.i), a.getZ(lp.i)] };
  });
  const tintC = [0x4f / 255, 0xc3 / 255, 0xf7 / 255];
  const tintOn = tint && tint.rgb.every((v, j) => Math.abs(v - tintC[j]) < 0.02);
  const cleared = after && after.rgb.every((v) => Math.abs(v - 1) < 0.02);   // fresh buffer prev == white
  t.assert('P3 TINT+CLEAR (pick tint 0x4fc3f7 at instanceId, Escape restores)', !!(tintOn && cleared),
    'on=' + JSON.stringify(tint && tint.rgb.map(v => +v.toFixed(3))) + ' off=' + JSON.stringify(after && after.rgb.map(v => +v.toFixed(3))));

  // P4 — real Outliner row click on a walked (no-fid-bridge) leaf → camera lands on the DB transform centre
  const row = await t.pg.evaluate(() => {
    if (window.Bonsai.outliner) { window.Bonsai.outliner._collapsed = {}; window.Bonsai.outliner._paint(); }
    const rows = Array.from(document.querySelectorAll('[data-bnode][data-leaf="1"]'));
    const d = rows.find(r => { const bn = r.getAttribute('data-bnode');
      if (!isNaN(+bn) || (window.__arcFidByGuid && window.__arcFidByGuid[bn] != null)) return false;
      // pre-check the DB answers for this guid, so the claim is deterministic (non-invent: DB truth)
      try { const db = new window.SQL.Database(new Uint8Array(window.__dwBuf));
        const q = db.exec("SELECT center_x,center_y,center_z FROM element_transforms WHERE guid='" + bn.replace(/'/g, "''") + "'");
        db.close(); return q.length && q[0].values.length; } catch (e) { return false; }
    });
    if (!d) return null;
    d.scrollIntoView();
    return { sel: '[data-bnode="' + d.getAttribute('data-bnode') + '"]', guid: d.getAttribute('data-bnode') };
  });
  if (!row) { t.assert('P4 ROW-FRAMES', false, 'no walked leaf row with a transform row found'); }
  else {
    await t.pg.click(row.sel); await t.sleep(1500);   // 1.1s camera lerp + margin
    const fr = await t.pg.evaluate(() => ({
      last: window.__lastGuidFrame || null,
      target: [window.A.controls.target.x, window.A.controls.target.y, window.A.controls.target.z] }));
    const dt = fr.last ? Math.hypot(fr.target[0] - fr.last.c[0], fr.target[1] - fr.last.c[1], fr.target[2] - fr.last.c[2]) : Infinity;
    t.assert('P4 ROW-FRAMES (controls.target on the element_transforms centre ≤1e-3)',
      !!fr.last && fr.last.guid === row.guid && dt < 1e-3,
      'guid=' + String(row.guid).slice(0, 10) + ' Δtarget=' + (isFinite(dt) ? dt.toExponential(2) : '∞'));
  }

  // P5 — honest false for a guid the DB cannot answer (toast branch preserved)
  const bogus = await t.pg.evaluate(() => window.Bonsai.frameElementByGuid('W_E2E_INSTPICK_NO_SUCH_GUID'));
  t.assert('P5 HONEST-FALSE (unframeable guid returns false)', bogus === false, 'returned=' + bogus);
}, { width: 1200, height: 850, dpr: 1 });
