#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-INSTHIDE scope (read this block first)
 * SCOPE: real-user witness for §I5 per-instance hide (prompts/SPEC_INSTANCE_HIDE.md; FABLE5_WRAPUP Item 5).
 *   Real production path: open Duplex → production discWalk('ELEC') → real eye-glyph clicks on the NEW
 *   "Walked Fixtures" Outliner rows; the pure-instanced leg renders assembly parts through the production
 *   seam __dwRender.assembly (W-E2E-INSTPICK P2b precedent) and eye-clicks THEIR rows.
 *   Claims are readPixels block hashes (fixed camera), instance-matrix float equality and real mouse
 *   pick/hover behaviour — maths, not eyes. Read the log after every run; exit code is not evidence.
 *
 * Issues under test (each names what it proves):
 *   H0 NO-DEAD-HEADER — hideWhenEmpty: before any walk the category contributes NO header; after the walk
 *                      the "Walked Fixtures" header + dwp rows exist (§I5d).
 *   H1 HIDE-ONE      — eye on ONE walked-placement row removes its pixels (instance zero-basis §I5b + the
 *                      folded authored _dw twin §I5b-TWIN — measured: instance-only changes NOTHING,
 *                      build/probe_pixels.log 0/12); a sibling placement's 24px block AND a keeper's block
 *                      stay BYTE-IDENTICAL (siblings in the SAME InstancedMesh survive).
 *   H2 ZERO-BASIS    — the hidden instance's matrix: rotation/scale columns (e[0..11]) all 0, translation
 *                      (e[12..14]) preserved verbatim.
 *   H3 WALK-UNPICK   — a real mouse click at the hidden placement's spot never re-identifies it (neither
 *                      its authored twin fid nor an instance pick of its record).
 *   H4 ROUND-TRIP    — eye again: instance matrix byte-equals the pre-hide 16 floats AND the pixel block
 *                      byte-equals the pre-hide read (twin visible again).
 *   H5 ASM-PIXELS    — pure-instanced leg (assembly bucket, NO twin): eye on a part row alone removes its
 *                      pixels; the sibling part's block is byte-identical — per-instance hide inside a
 *                      single InstancedMesh proven with zero mesh-twin help.
 *   H6 ASM-CONTROL   — pre-hide control: real hover tints the instance (0x9be7ff at instanceId), real
 *                      click identifies it (__instPickActive guid) — so H7's negatives are meaningful.
 *   H7 ASM-UNPICK    — hidden instance: real click at its spot never identifies it; real hover never
 *                      tints it (§I5c — invisible ≠ unpickable was §V1's lesson, extended per-instance).
 *   H8 ASM-ROUNDTRIP — eye again: matrix byte-equals + pixel block byte-equals the pre-hide read.
 *   H9 MULTI         — 3 placements hidden in the SAME InstancedMesh: all zero-basis, all pixel-gone,
 *                      keeper block byte-identical; none re-identifies on a real click; show-all restores
 *                      every matrix + every block byte-identically (dwHidden empty).
 *   H10 WINDOWED     — with OL_CHUNK=50 the big class renders EXACTLY 50 dwp rows + one "… show N more"
 *                      row (never the full list); every RENDERED dwp row carries a live eye (§I5d/§V4).
 */
'use strict';
const { runE2E } = require('./e2e_harness');

runE2E('W-E2E-INSTHIDE', async (t) => {
  const pg = t.pg;
  await t.open('Duplex');

  // H0a — pre-walk: hideWhenEmpty category contributes no header
  const pre = await pg.evaluate(() => !!document.querySelector('[data-tcat="dwinst"]'));

  await pg.evaluate(() => window.discWalk('ELEC', { building: 'Duplex' }));
  await pg.waitForFunction(() => window.__dwLastCommitDisc === 'ELEC', { timeout: 60000 }).catch(() => {});
  await t.sleep(3000);   // batched commitSeedGroup fold settles

  // rig: expand everything + paint (P4 idiom), install helpers
  const post = await pg.evaluate(() => {
    const ol = window.Bonsai.outliner; ol._collapsed = {}; ol._paint();
    window.__ih = {
      im: null,   // the big ELEC bucket (set by discover)
      block(x, y, z) {   // 24x24 readPixels hash at the projected world point — fixed camera contract
        const r = window.A.renderer; r.render(window.A.scene, window.A.camera);
        const gl = r.getContext(); const bw = gl.drawingBufferWidth, bh = gl.drawingBufferHeight;
        const v = new window.THREE.Vector3(x, y, z).project(window.A.camera);
        const gx = Math.round((v.x * 0.5 + 0.5) * bw), gy = Math.round((v.y * 0.5 + 0.5) * bh);
        const px = new Uint8Array(24 * 24 * 4);
        gl.readPixels(Math.max(0, gx - 12), Math.max(0, gy - 12), 24, 24, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let h = 0; for (let k = 0; k < px.length; k++) h = (h * 31 + px[k]) >>> 0;
        return h;
      },
      spot(x, y, z) {    // client px of a world point (for real mouse gestures)
        const v = new window.THREE.Vector3(x, y, z).project(window.A.camera);
        const rect = window.A.renderer.domElement.getBoundingClientRect();
        return [(v.x * 0.5 + 0.5) * rect.width + rect.left, (-v.y * 0.5 + 0.5) * rect.height + rect.top];
      },
      mat(im, i) { const m = new window.THREE.Matrix4(); im.getMatrixAt(i, m); return Array.from(m.elements); },
      asmIm() { const g = window.Bonsai.group(); const root = g.children.find(o => o.userData && o.userData.dwRoot);
        return root.children.find(o => o.isInstancedMesh && o.userData.dwAsm === 'ASMH'); },
      twinsOf(rec) {
        const ops = window.Bonsai.oplog._geomOps() || [];
        const kx = (+rec.x).toFixed(4), ky = (+rec.y).toFixed(4), kz = (+rec.z).toFixed(4);
        return ops.filter(o => { const pm = o.parameters;
          return pm && pm._dw && pm._dw.disc === 'ELEC' && pm.placement &&
            (+pm.placement.x).toFixed(4) === kx && (+pm.placement.y).toFixed(4) === ky &&
            (+pm.placement.z).toFixed(4) === kz; }).map(o => o.id);
      },
      // Find a FIXED camera pose + 5 walked placements (same big InstancedMesh) whose authored twin is the
      // frontmost raycast hit at its own projected spot (⇒ hiding the placement must change those pixels),
      // pairwise ≥70px apart on screen. Camera is LEFT at the successful pose.
      discover() {
        const g = window.Bonsai.group(); const root = g.children.find(o => o.userData && o.userData.dwRoot);
        const im = root.children.filter(o => o.isInstancedMesh && o.userData.dwDisc === 'ELEC' && o.userData.dwSub)
          .sort((a, b) => b.count - a.count)[0];
        if (!im) return null;
        this.im = im;
        const sub = im.userData.dwSub, W = window.__dwWalks.ELEC;
        const cam = window.A.camera, ctl = window.A.controls, r = window.A.renderer;
        const rc = new window.THREE.Raycaster();
        for (let a = 0; a < sub.length; a += 7) {
          const anc = sub[a]; if (!anc || anc.gated || anc.clash) continue;
          cam.position.set(anc.x + 2.4, anc.y - 2.4, anc.z + 1.4); ctl.target.set(anc.x, anc.y, anc.z); ctl.update();
          r.render(window.A.scene, window.A.camera);
          const rect = r.domElement.getBoundingClientRect();
          const found = [];
          for (let i = 0; i < sub.length; i++) {
            const p = sub[i]; if (!p || p.gated || p.clash) continue;
            const idx = W.indexOf(p); if (idx < 0) continue;
            const tf = this.twinsOf(p); if (!tf.length) continue;
            const v = new window.THREE.Vector3(p.x, p.y, p.z).project(cam); if (v.z > 1) continue;
            const sx = (v.x * 0.5 + 0.5) * rect.width + rect.left, sy = (-v.y * 0.5 + 0.5) * rect.height + rect.top;
            if (sx < rect.left + 40 || sx > rect.right - 40 || sy < rect.top + 40 || sy > rect.bottom - 40) continue;
            rc.setFromCamera(new window.THREE.Vector2(v.x, v.y), cam);
            const list = g.children.filter(o => o.isMesh && o.visible)
              .concat(root.children.filter(o => (o.isInstancedMesh || o.isMesh) && o.visible));
            const hits = rc.intersectObjects(list, false);
            if (!hits.length) continue;
            const h0 = hits[0];
            if (!(h0.object.userData && tf.includes(h0.object.userData.featureId))) continue;
            // reject co-located foreign geometry near the front (a 2nd fixture at the same xyz — measured
            // probe_frontmost.log idx=129 — would keep the pixels alive and fake a RED)
            let clean = true;
            for (let k = 1; k < hits.length && hits[k].distance - h0.distance < 0.2; k++) {
              const o = hits[k];
              const own = (o.object === im && im.userData.dwSub[o.instanceId] === p) ||
                          (o.object.userData && tf.includes(o.object.userData.featureId));
              if (!own) { clean = false; break; }
            }
            if (!clean) continue;
            if (found.some(f => Math.hypot(f.sx - sx, f.sy - sy) < 70)) continue;
            found.push({ idx, i, sx, sy, x: p.x, y: p.y, z: p.z, twins: tf });
            if (found.length >= 5) break;
          }
          if (found.length >= 5) return { found, count: im.count };
        }
        return null;
      }
    };
    return { header: !!document.querySelector('[data-tcat="dwinst"]'),
      rows: document.querySelectorAll('[data-bnode^="dwp|ELEC|"]').length };
  });
  t.assert('H0 NO-DEAD-HEADER (no header pre-walk; header + dwp rows post-walk)',
    pre === false && post.header === true && post.rows > 0, 'pre=' + pre + ' post=' + JSON.stringify(post));

  const eye = async (rowId) => {   // the REAL user gesture: scroll the row into view, click ITS eye glyph
    await pg.evaluate(id => { const d = document.querySelector('[data-bnode="' + id + '"]'); if (d) d.scrollIntoView({ block: 'center' }); }, rowId);
    await pg.click('[data-bnode="' + rowId + '"] .bn-eye'); await t.sleep(300);
  };

  // ── H1..H4: the WALK leg (placement = instance twin + folded authored _dw twin) ────────────────
  const dset = await pg.evaluate(() => window.__ih.discover());
  console.log('  §IH-DISCOVER ' + JSON.stringify(dset && dset.found.map(f => ({ idx: f.idx, i: f.i, twins: f.twins }))));
  t.assert('H1-rig discovery found 5 twin-frontmost placements in ONE InstancedMesh (count=' + (dset && dset.count) + ')',
    !!dset && dset.found.length === 5, dset ? '' : 'no pose found');
  if (!dset) return;
  const [T, S, K, M2, M3] = dset.found;

  const b0 = await pg.evaluate((T2, S2, K2) => ({
    t: window.__ih.block(T2.x, T2.y, T2.z), s: window.__ih.block(S2.x, S2.y, S2.z), k: window.__ih.block(K2.x, K2.y, K2.z),
    mat: window.__ih.mat(window.__ih.im, T2.i)
  }), T, S, K);

  await eye('dwp|ELEC|' + T.idx);   // HIDE — real eye click on the Walked Fixtures row

  const h1 = await pg.evaluate((T2, S2, K2) => ({
    t: window.__ih.block(T2.x, T2.y, T2.z), s: window.__ih.block(S2.x, S2.y, S2.z), k: window.__ih.block(K2.x, K2.y, K2.z),
    mat: window.__ih.mat(window.__ih.im, T2.i),
    hidden: window.Bonsai.isInstanceHidden(window.__ih.im, T2.i)
  }), T, S, K);
  t.assert('H1 HIDE-ONE (target block CHANGED; sibling + keeper blocks byte-identical; siblings survive)',
    h1.t !== b0.t && h1.s === b0.s && h1.k === b0.k,
    'T ' + b0.t + '→' + h1.t + ' S ' + b0.s + '→' + h1.s + ' K ' + b0.k + '→' + h1.k);
  t.assert('H2 ZERO-BASIS (e[0..11]=0, translation e[12..14] preserved verbatim)',
    h1.hidden && h1.mat.slice(0, 12).every(v => v === 0) &&
    h1.mat[12] === b0.mat[12] && h1.mat[13] === b0.mat[13] && h1.mat[14] === b0.mat[14],
    'mat=' + JSON.stringify(h1.mat.map(v => +v.toFixed(3))));

  // H3 — real mouse click at the hidden placement's spot: never re-identifies it
  await pg.mouse.move(T.sx, T.sy); await t.sleep(80);
  await pg.mouse.down(); await t.sleep(50); await pg.mouse.up(); await t.sleep(300);
  const h3 = await pg.evaluate((T2) => {
    const sel = Array.from(window.Bonsai._selSet || []);
    const ip = window.__instPickActive || null;
    const rec = window.__dwWalks.ELEC[T2.idx];
    return { selHitTwin: sel.some(f => T2.twins.includes(f)),
      ipHitRec: !!(ip && ip.disc === 'ELEC' && Math.abs(ip.x - rec.x) < 1e-6 && Math.abs(ip.y - rec.y) < 1e-6 && Math.abs(ip.z - rec.z) < 1e-6),
      sel, ip };
  }, T);
  t.assert('H3 WALK-UNPICK (hidden placement: click never re-identifies twin fid nor instance record)',
    !h3.selHitTwin && !h3.ipHitRec, JSON.stringify({ sel: h3.sel, ip: h3.ip && h3.ip.i }));
  // cleanup: deselect whatever the fall-through ray hit, park the mouse OFF the canvas (outliner strip)
  await pg.evaluate(() => window.Bonsai.selectMany([]));
  await pg.keyboard.press('Escape'); await pg.mouse.move(60, 8); await t.sleep(250);

  // H4 — SHOW: eye again → matrix + pixels byte-equal the pre-hide reads
  await eye('dwp|ELEC|' + T.idx);
  const h4 = await pg.evaluate((T2, S2, K2) => ({
    t: window.__ih.block(T2.x, T2.y, T2.z), s: window.__ih.block(S2.x, S2.y, S2.z), k: window.__ih.block(K2.x, K2.y, K2.z),
    mat: window.__ih.mat(window.__ih.im, T2.i),
    hidden: window.Bonsai.isInstanceHidden(window.__ih.im, T2.i)
  }), T, S, K);
  t.assert('H4 ROUND-TRIP (matrix 16/16 byte-equal + target block byte-equals pre-hide read)',
    !h4.hidden && h4.mat.length === 16 && h4.mat.every((v, j) => v === b0.mat[j]) && h4.t === b0.t && h4.s === b0.s && h4.k === b0.k,
    'matEq=' + h4.mat.every((v, j) => v === b0.mat[j]) + ' T ' + h1.t + '→' + h4.t + ' (pre ' + b0.t + ')');

  // ── H9: MULTI — 3 placements hidden in the SAME InstancedMesh ──────────────────────────────────
  const m0 = await pg.evaluate((T2, M2b, M3b, K2) => ({
    t: window.__ih.block(T2.x, T2.y, T2.z), m2: window.__ih.block(M2b.x, M2b.y, M2b.z),
    m3: window.__ih.block(M3b.x, M3b.y, M3b.z), k: window.__ih.block(K2.x, K2.y, K2.z),
    mats: [T2.i, M2b.i, M3b.i].map(i => window.__ih.mat(window.__ih.im, i))
  }), T, M2, M3, K);
  await eye('dwp|ELEC|' + T.idx); await eye('dwp|ELEC|' + M2.idx); await eye('dwp|ELEC|' + M3.idx);
  const m1 = await pg.evaluate((T2, M2b, M3b, K2) => ({
    t: window.__ih.block(T2.x, T2.y, T2.z), m2: window.__ih.block(M2b.x, M2b.y, M2b.z),
    m3: window.__ih.block(M3b.x, M3b.y, M3b.z), k: window.__ih.block(K2.x, K2.y, K2.z),
    zero: [T2.i, M2b.i, M3b.i].every(i => window.__ih.mat(window.__ih.im, i).slice(0, 12).every(v => v === 0)),
    nHidden: window.__ih.im.userData.dwHidden.size
  }), T, M2, M3, K);
  // pick-exclusion at all 3 spots (real clicks), then deterministic cleanup
  let noneIdent = true;
  for (const C of [T, M2, M3]) {
    await pg.mouse.move(C.sx, C.sy); await t.sleep(60);
    await pg.mouse.down(); await t.sleep(40); await pg.mouse.up(); await t.sleep(250);
    const r = await pg.evaluate((C2) => {
      const sel = Array.from(window.Bonsai._selSet || []); const ip = window.__instPickActive || null;
      const rec = window.__dwWalks.ELEC[C2.idx];
      return sel.some(f => C2.twins.includes(f)) ||
        !!(ip && ip.disc === 'ELEC' && Math.abs(ip.x - rec.x) < 1e-6 && Math.abs(ip.y - rec.y) < 1e-6 && Math.abs(ip.z - rec.z) < 1e-6);
    }, C);
    if (r) noneIdent = false;
    await pg.evaluate(() => window.Bonsai.selectMany([]));
    await pg.keyboard.press('Escape');
  }
  await pg.mouse.move(60, 8); await t.sleep(250);
  await eye('dwp|ELEC|' + T.idx); await eye('dwp|ELEC|' + M2.idx); await eye('dwp|ELEC|' + M3.idx);   // show-all
  const m2r = await pg.evaluate((T2, M2b, M3b, K2) => ({
    t: window.__ih.block(T2.x, T2.y, T2.z), m2: window.__ih.block(M2b.x, M2b.y, M2b.z),
    m3: window.__ih.block(M3b.x, M3b.y, M3b.z), k: window.__ih.block(K2.x, K2.y, K2.z),
    mats: [T2.i, M2b.i, M3b.i].map(i => window.__ih.mat(window.__ih.im, i)),
    nHidden: window.__ih.im.userData.dwHidden.size
  }), T, M2, M3, K);
  const matsEq = m2r.mats.every((m, j) => m.every((v, k2) => v === m0.mats[j][k2]));
  t.assert('H9 MULTI (3 hidden in ONE InstancedMesh: pixels gone ×3, zero-basis ×3, keeper identical, ' +
    'none re-identifies, show-all restores every matrix + block; dwHidden 3→0)',
    m1.t !== m0.t && m1.m2 !== m0.m2 && m1.m3 !== m0.m3 && m1.k === m0.k && m1.zero && m1.nHidden === 3 &&
    noneIdent && matsEq && m2r.t === m0.t && m2r.m2 === m0.m2 && m2r.m3 === m0.m3 && m2r.k === m0.k && m2r.nHidden === 0,
    'hidden=' + m1.nHidden + '→' + m2r.nHidden + ' noneIdent=' + noneIdent + ' matsEq=' + matsEq +
    ' blocks T ' + m0.t + '→' + m1.t + '→' + m2r.t);

  // ── H5..H8: the pure-instanced ASSEMBLY leg (no authored twin — W-E2E-INSTPICK P2b precedent) ───
  await pg.evaluate(() => {
    const parts = [0, 1, 2, 3].map(i => ({ disc: 'ASMH', guid: 'ASMH_PART_' + i, ifc_class: 'IfcDuctSegment',
      piece_type: 'run', pos: [30 + i * 1.5, -30, 1.2], dir: [0, 0, 1], diameter_mm: 300, length_mm: 600 }));
    window.__dwRender.assembly('ASMH', parts);
    const c = window.A.camera, ct = window.A.controls;
    c.position.set(30 + 1.8, -30 - 1.8, 2.1); ct.target.set(30 + 0.75, -30, 1.2); ct.update();
    window.A.renderer.render(window.A.scene, window.A.camera);
    const ol = window.Bonsai.outliner; ol._collapsed = {}; ol._paint();
  });
  await t.sleep(300);
  const P0 = [30, -30, 1.2], P1 = [31.5, -30, 1.2];
  const a0 = await pg.evaluate((p0, p1) => ({
    b0: window.__ih.block(p0[0], p0[1], p0[2]), b1: window.__ih.block(p1[0], p1[1], p1[2]),
    mat: window.__ih.mat(window.__ih.asmIm(), 0),
    spot0: window.__ih.spot(p0[0], p0[1], p0[2]),
    rowThere: !!document.querySelector('[data-bnode="dwa|ASMH|0"]')
  }), P0, P1);

  // H6 — controls: hover tints instance 0, click identifies it (so H7's negatives mean something)
  await pg.mouse.move(a0.spot0[0], a0.spot0[1]); await t.sleep(250);
  const hov = await pg.evaluate(() => { const im = window.__ih.asmIm();
    return im.instanceColor ? [im.instanceColor.getX(0), im.instanceColor.getY(0), im.instanceColor.getZ(0)] : null; });
  await pg.mouse.down(); await t.sleep(50); await pg.mouse.up(); await t.sleep(250);
  const pick = await pg.evaluate(() => window.__instPickActive || null);
  await pg.keyboard.press('Escape'); await pg.mouse.move(60, 8); await t.sleep(250);
  const HOVER = [0x9b / 255, 0xe7 / 255, 1];
  const hovOn = hov && hov.every((v, j) => Math.abs(v - HOVER[j]) < 0.02);
  t.assert('H6 ASM-CONTROL (visible instance: hover tint 0x9be7ff at i=0 + click identifies guid)',
    !!(hovOn && pick && pick.disc === 'ASMH' && pick.i === 0 && pick.guid === 'ASMH_PART_0'),
    'hov=' + JSON.stringify(hov && hov.map(v => +v.toFixed(3))) + ' pick=' + JSON.stringify(pick && { disc: pick.disc, i: pick.i, guid: pick.guid }));

  // H5 — eye on the assembly part row: pixels gone with NO twin help; sibling part byte-identical
  t.assert('H5-rig assembly row dwa|ASMH|0 rendered in the Outliner', a0.rowThere, '');
  await eye('dwa|ASMH|0');
  const a1 = await pg.evaluate((p0, p1) => { const im = window.__ih.asmIm(); return {
    b0: window.__ih.block(p0[0], p0[1], p0[2]), b1: window.__ih.block(p1[0], p1[1], p1[2]),
    mat: window.__ih.mat(im, 0), hidden: window.Bonsai.isInstanceHidden(im, 0) }; }, P0, P1);
  t.assert('H5 ASM-PIXELS (pure instance hide: part0 block CHANGED, sibling part1 byte-identical, zero-basis)',
    a1.hidden && a1.b0 !== a0.b0 && a1.b1 === a0.b1 && a1.mat.slice(0, 12).every(v => v === 0),
    'b0 ' + a0.b0 + '→' + a1.b0 + ' b1 ' + a0.b1 + '→' + a1.b1);

  // H7 — hidden instance: real click never identifies, real hover never tints
  await pg.mouse.move(a0.spot0[0], a0.spot0[1]); await t.sleep(250);
  const hov2 = await pg.evaluate(() => { const im = window.__ih.asmIm();
    return im.instanceColor ? [im.instanceColor.getX(0), im.instanceColor.getY(0), im.instanceColor.getZ(0)] : [1, 1, 1]; });
  await pg.mouse.down(); await t.sleep(50); await pg.mouse.up(); await t.sleep(250);
  const pick2 = await pg.evaluate(() => window.__instPickActive || null);
  const hov2On = hov2.every((v, j) => Math.abs(v - HOVER[j]) < 0.02);
  t.assert('H7 ASM-UNPICK (hidden instance: click never identifies it, hover never tints it)',
    !hov2On && !(pick2 && pick2.guid === 'ASMH_PART_0'),
    'hov=' + JSON.stringify(hov2.map(v => +v.toFixed(3))) + ' pick=' + JSON.stringify(pick2 && pick2.guid));
  await pg.mouse.move(60, 8); await t.sleep(250);

  // H8 — show again: matrix + block byte-equal
  await eye('dwa|ASMH|0');
  const a2 = await pg.evaluate((p0) => { const im = window.__ih.asmIm(); return {
    b0: window.__ih.block(p0[0], p0[1], p0[2]), mat: window.__ih.mat(im, 0),
    hidden: window.Bonsai.isInstanceHidden(im, 0) }; }, P0);
  t.assert('H8 ASM-ROUNDTRIP (matrix 16/16 + pixel block byte-equal pre-hide)',
    !a2.hidden && a2.mat.every((v, j) => v === a0.mat[j]) && a2.b0 === a0.b0,
    'b0 ' + a1.b0 + '→' + a2.b0 + ' (pre ' + a0.b0 + ')');

  // ── H10: WINDOWED — OL_CHUNK=50 renders EXACTLY the window for the big class, every row has an eye ─
  const win = await pg.evaluate(() => {
    window.OL_CHUNK = 50;
    const ol = window.Bonsai.outliner; ol._chunkWin = {}; ol._paint();
    const W = window.__dwWalks.ELEC;
    const byCls = {}; W.forEach(p => { const c = (p && p.ifc_class) || 'Unknown'; byCls[c] = (byCls[c] || 0) + 1; });
    const big = Object.keys(byCls).sort((a, b) => byCls[b] - byCls[a])[0];
    const idxBig = new Set(); W.forEach((p, i) => { if (((p && p.ifc_class) || 'Unknown') === big) idxBig.add(i); });
    const rows = Array.from(document.querySelectorAll('[data-bnode^="dwp|ELEC|"]'));
    const bigRows = rows.filter(r => idxBig.has(+r.getAttribute('data-bnode').split('|')[2]));
    const res = {
      big: big, bigCount: byCls[big], bigRows: bigRows.length,
      more: !!document.querySelector('[data-more="dwc|ELEC|' + big + '"]'),
      eyes: rows.every(r => !!r.querySelector('.bn-eye')), totalRows: rows.length
    };
    window.OL_CHUNK = 250; ol._chunkWin = {}; ol._paint();   // restore
    return res;
  });
  t.assert('H10 WINDOWED (OL_CHUNK=50: big class ' + win.big + ' (' + win.bigCount + ') renders EXACTLY 50 rows + "… show more"; every rendered row has an eye)',
    win.bigCount > 50 && win.bigRows === 50 && win.more === true && win.eyes === true,
    JSON.stringify(win));

  t.slog.filter(l => /^§(INSTHIDE|OLEYE|DWINST)/.test(l)).slice(0, 14).forEach(l => console.log('  ' + l));
}, { width: 1280, height: 860, dpr: 1 });
