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
 *
 * RIG REDESIGN 2026-09-30 (MODELLER_MASTER §RESUME 2026-09-30 known-red "W-E2E-INSTHIDE H1-rig"; RED on main 8311ba5f:
 * discovery null → INCONCLUSIVE, so H1–H9 never ran since §NET-AUDIT 2026-09-26):
 *   §IH-ISOLATE — the authored ARC (walls/slabs) is not the subject and occluded every twin; it is hidden for the walk
 *     leg (same A/B isolation as __dwOcclusionProbe) and restored before the assembly leg. Discovery then finds 5.
 *   §IH-FRONT  — the 24px readPixels hashes are REPORT-ONLY now (§IH-PIX): two reads with no scene change differed
 *     (frame-to-frame non-determinism), which is §MODELLER-NET-AUDIT class 5 PIXEL-AS-PROOF. The verdict is the
 *     frontmost VISIBLE object under the placement's projected point by raycast over visible objects only — no hidden
 *     flag consulted: a zero-basis instance collapses to a point and a visible=false twin leaves the list, the same two
 *     facts the GPU draws. H1-pre / H5-pre are the controls (frontmost IS the twin/part before any hide).
 *   FALSIFY=1 — puts the matrix + twin back behind the real eye click (a hide the scene never saw): H1 + H2 must go RED.
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
      // §IH-FRONT (2026-09-30): the NUMERIC "is it drawn there" — the frontmost VISIBLE object under the projected point,
      // by geometry alone (no hidden-flag consulted: a zero-basis instance collapses to a point and a twin with
      // visible=false leaves the list — the same two facts the GPU draws). Replaces the 24px readPixels hashes as the
      // verdict (§MODELLER-NET-AUDIT class 5 PIXEL-AS-PROOF: frames differed between two reads with no scene change).
      front(x, y, z) {
        const g = window.Bonsai.group(); const root = g.children.find(o => o.userData && o.userData.dwRoot);
        const v = new window.THREE.Vector3(x, y, z).project(window.A.camera);
        const rc = new window.THREE.Raycaster(); rc.setFromCamera(new window.THREE.Vector2(v.x, v.y), window.A.camera);
        const list = g.children.filter(o => o.isMesh && o.visible && !o.userData.anchor)
          .concat(root.children.filter(o => (o.isInstancedMesh || o.isMesh) && o.visible));
        const h = rc.intersectObjects(list, false)[0]; if (!h) return null;
        if (h.object.isInstancedMesh) return { im: h.object === this.im ? 'main' : (h.object.userData.dwAsm || 'other'), i: h.instanceId };
        return { fid: h.object.userData && h.object.userData.featureId };
      },
      own(f, P) { return !!f && ((f.fid != null && P.twins.includes(f.fid)) || (f.im === 'main' && f.i === P.i)); },
      asmFront(p, i) { const f = this.front(p[0], p[1], p[2]); return !!f && f.im === 'ASMH' && f.i === i; },
      asmIm() { const g = window.Bonsai.group(); const root = g.children.find(o => o.userData && o.userData.dwRoot);
        return root.children.find(o => o.isInstancedMesh && o.userData.dwAsm === 'ASMH'); },
      twinsOf(rec) {
        const ops = window.Bonsai.oplog._geomOps() || [];
        const kx = (+rec.x).toFixed(4), ky = (+rec.y).toFixed(4), kz = (+rec.z).toFixed(4);
        return ops.filter(o => { const pm = o.parameters;
          // §NET-AUDIT (2026-09-26): the rendered record's z is the fixture CENTRE; the signed op keeps the BASE in
          // placement.z and the centre in _dw.cz (measured: all 40 outlets dz=-0.05718 = half the 0.1143 m mesh). The
          // old exact placement.z match found 0 of 480 twins. Match the centre field.
          const cz = pm && pm._dw && pm._dw.cz != null ? pm._dw.cz : (pm && pm.placement ? pm.placement.z : NaN);
          return pm && pm._dw && pm._dw.disc === 'ELEC' && pm.placement &&
            (+pm.placement.x).toFixed(4) === kx && (+pm.placement.y).toFixed(4) === ky &&
            (+cz).toFixed(4) === kz; }).map(o => o.id);
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
        // §IH-ISOLATE (2026-09-30 rig redesign — MODELLER_MASTER §RESUME 2026-09-30 known-red H1-rig): the subject is the
        // WALKED layer (instance + its folded _dw twin); the authored ARC walls/slabs are not, yet they occluded every twin
        // (best pose found 2 of 5 on main 8311ba5f). Hide the ARC meshes for the discovery + pixel/pick reads — the same
        // A/B isolation __dwOcclusionProbe uses — and restore them before the assembly leg. The claims are unchanged: a
        // hidden placement's 24px block changes and its siblings' blocks stay byte-identical; FALSIFY=1 proves they can fail.
        const dwF = new Set((window.Bonsai.oplog._geomOps() || []).filter(o => o.parameters && o.parameters._dw).map(o => o.id));
        this.arcHidden = g.children.filter(o => o.isMesh && !o.isInstancedMesh && o.visible && !dwF.has(o.userData && o.userData.featureId));
        this.arcHidden.forEach(o => { o.visible = false; });
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
          if (found.length >= 5) { this.savePose(); return { found, count: im.count, arcHidden: this.arcHidden.length }; }
        }
        this.restoreArc();
        return null;
      },
      // every Outliner eye click runs _applyHidden → Bonsai.setAllVisible() (reset ALL, then re-apply ITS hidden set) — the
      // ARC isolation is not in that set, so the rig re-applies it after each eye gesture (measured 2026-09-30: after one
      // eye click front(T) was ARC fid 43 and S/K were no longer frontmost — the walls were back, not the fixtures).
      rehideArc() { (this.arcHidden || []).forEach(o => { o.visible = false; }); return (this.arcHidden || []).length; },
      restoreArc() { (this.arcHidden || []).forEach(o => { o.visible = true; }); this.arcHidden = []; },
      // fixed-camera contract: a real canvas click that selects a twin starts the app's §ZOOM-SEL fly (_frameTo, 1.1 s lerp),
      // which moved the camera under the later reads (measured 2026-09-30: after H3's click, S's spot no longer mapped to S
      // and M2 was no longer frontmost). The rig saves the pose it discovered from and puts it back after every real click.
      savePose() { this.pose = { p: window.A.camera.position.toArray(), t: window.A.controls.target.toArray() }; },
      repose() { if (!this.pose) return false; window.A.camera.position.fromArray(this.pose.p); window.A.controls.target.fromArray(this.pose.t); window.A.controls.update(); return true; }
    };
    return { header: !!document.querySelector('[data-tcat="dwinst"]'),
      rows: document.querySelectorAll('[data-bnode^="dwp|ELEC|"]').length };
  });
  t.assert('H0 NO-DEAD-HEADER (no header pre-walk; header + dwp rows post-walk)',
    pre === false && post.header === true && post.rows > 0, 'pre=' + pre + ' post=' + JSON.stringify(post));

  const eye = async (rowId) => {   // the REAL user gesture: scroll the row into view, click ITS eye glyph
    await pg.evaluate(id => { const d = document.querySelector('[data-bnode="' + id + '"]'); if (d) d.scrollIntoView({ block: 'center' }); }, rowId);
    await pg.click('[data-bnode="' + rowId + '"] .bn-eye'); await t.sleep(300);
    await pg.evaluate(() => window.__ih.rehideArc());   // §IH-ISOLATE survives the app's own reset-then-reapply (see rehideArc)
  };
  const click = async (sx, sy) => {   // a REAL canvas click, then the fixed-camera contract restored (see savePose/repose)
    await pg.mouse.move(sx, sy); await t.sleep(80);
    await pg.mouse.down(); await t.sleep(50); await pg.mouse.up(); await t.sleep(300);
    if (t.flySettle) await t.flySettle(3000);
    await pg.evaluate(() => window.__ih.repose());
  };

  // ── H1..H4: the WALK leg (placement = instance twin + folded authored _dw twin) ────────────────
  const dset = await pg.evaluate(() => window.__ih.discover());
  console.log('  §IH-DISCOVER ' + JSON.stringify(dset && dset.found.map(f => ({ idx: f.idx, i: f.i, twins: f.twins }))) + ' arcHidden=' + (dset && dset.arcHidden));
  t.assert('H1-rig discovery found 5 twin-frontmost placements in ONE InstancedMesh (count=' + (dset && dset.count) + ', ARC isolated §IH-ISOLATE)',
    !!dset && dset.found.length === 5, dset ? '' : 'INCONCLUSIVE — fixture absent: no pose shows 5 twin-frontmost placements ≥70px apart even with the ARC isolated (pre-2026-09-30 rig: best=2 with walls/slabs occluding).');
  if (!dset) return;
  const [T, S, K, M2, M3] = dset.found;
  const FALSIFY = process.env.FALSIFY === '1';   // rig falsifier: a hide that never reaches the scene must turn H1/H2 RED

  const b0 = await pg.evaluate((T2, S2, K2) => ({
    t: window.__ih.block(T2.x, T2.y, T2.z), s: window.__ih.block(S2.x, S2.y, S2.z), k: window.__ih.block(K2.x, K2.y, K2.z),
    ft: window.__ih.own(window.__ih.front(T2.x, T2.y, T2.z), T2), fs: window.__ih.own(window.__ih.front(S2.x, S2.y, S2.z), S2), fk: window.__ih.own(window.__ih.front(K2.x, K2.y, K2.z), K2),
    mat: window.__ih.mat(window.__ih.im, T2.i)
  }), T, S, K);
  t.assert('H1-pre (control: before any hide the frontmost object at T, S, K is each its own twin)', b0.ft && b0.fs && b0.fk, JSON.stringify({ ft: b0.ft, fs: b0.fs, fk: b0.fk }));

  await eye('dwp|ELEC|' + T.idx);   // HIDE — real eye click on the Walked Fixtures row
  if (FALSIFY) await pg.evaluate((T2, pre) => {   // §IH-FALSIFY: put the matrix + twin back = a hide the scene never saw
    const im = window.__ih.im; im.setMatrixAt(T2.i, new window.THREE.Matrix4().fromArray(pre)); im.instanceMatrix.needsUpdate = true;
    window.Bonsai.group().traverse(o => { if (o.isMesh && o.userData && T2.twins.includes(o.userData.featureId)) o.visible = true; });
    console.log('§IH-FALSIFY matrix + twin restored behind the eye click (expect H1 + H2 RED)');
  }, T, b0.mat);

  const h1 = await pg.evaluate((T2, S2, K2) => ({
    t: window.__ih.block(T2.x, T2.y, T2.z), s: window.__ih.block(S2.x, S2.y, S2.z), k: window.__ih.block(K2.x, K2.y, K2.z),
    ft: window.__ih.own(window.__ih.front(T2.x, T2.y, T2.z), T2), fs: window.__ih.own(window.__ih.front(S2.x, S2.y, S2.z), S2), fk: window.__ih.own(window.__ih.front(K2.x, K2.y, K2.z), K2),
    frontT: window.__ih.front(T2.x, T2.y, T2.z),
    mat: window.__ih.mat(window.__ih.im, T2.i),
    hidden: window.Bonsai.isInstanceHidden(window.__ih.im, T2.i)
  }), T, S, K);
  console.log('  §IH-PIX report-only T ' + b0.t + '→' + h1.t + ' S ' + b0.s + '→' + h1.s + ' K ' + b0.k + '→' + h1.k);
  t.assert('H1 HIDE-ONE (T no longer frontmost at its own spot — twin gone + instance collapsed; sibling S + keeper K still frontmost = siblings in the SAME InstancedMesh survive)',
    !h1.ft && h1.fs && h1.fk,
    'frontT=' + JSON.stringify(h1.frontT) + ' S own=' + h1.fs + ' K own=' + h1.fk);
  t.assert('H2 ZERO-BASIS (e[0..11]=0, translation e[12..14] preserved verbatim)',
    h1.hidden && h1.mat.slice(0, 12).every(v => v === 0) &&
    h1.mat[12] === b0.mat[12] && h1.mat[13] === b0.mat[13] && h1.mat[14] === b0.mat[14],
    'mat=' + JSON.stringify(h1.mat.map(v => +v.toFixed(3))));

  // H3 — real mouse click at the hidden placement's spot: never re-identifies it
  await click(T.sx, T.sy);
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
  // H3-ctl — the SAME real click on a VISIBLE sibling's spot DOES identify it (twin fid or instance record), so H3's
  // negative is load-bearing and not "nothing is pickable from this pose" (§IH-ISOLATE control, 2026-09-30).
  await click(S.sx, S.sy);
  const h3c = await pg.evaluate((S2) => {
    const sel = Array.from(window.Bonsai._selSet || []); const ip = window.__instPickActive || null; const rec = window.__dwWalks.ELEC[S2.idx];
    return { selHitTwin: sel.some(f => S2.twins.includes(f)),
      ipHitRec: !!(ip && ip.disc === 'ELEC' && Math.abs(ip.x - rec.x) < 1e-6 && Math.abs(ip.y - rec.y) < 1e-6 && Math.abs(ip.z - rec.z) < 1e-6), sel };
  }, S);
  t.assert('H3-ctl VISIBLE-PICK (control: a real click at a visible sibling identifies its twin/record)', h3c.selHitTwin || h3c.ipHitRec, JSON.stringify(h3c));
  await pg.evaluate(() => window.Bonsai.selectMany([]));
  await pg.keyboard.press('Escape'); await pg.mouse.move(60, 8); await t.sleep(250);

  // H4 — SHOW: eye again → matrix + pixels byte-equal the pre-hide reads
  await eye('dwp|ELEC|' + T.idx);
  const h4 = await pg.evaluate((T2, S2, K2) => ({
    ft: window.__ih.own(window.__ih.front(T2.x, T2.y, T2.z), T2), fs: window.__ih.own(window.__ih.front(S2.x, S2.y, S2.z), S2), fk: window.__ih.own(window.__ih.front(K2.x, K2.y, K2.z), K2),
    mat: window.__ih.mat(window.__ih.im, T2.i),
    hidden: window.Bonsai.isInstanceHidden(window.__ih.im, T2.i)
  }), T, S, K);
  t.assert('H4 ROUND-TRIP (matrix 16/16 byte-equal + T frontmost at its own spot again; S, K untouched)',
    !h4.hidden && h4.mat.length === 16 && h4.mat.every((v, j) => v === b0.mat[j]) && h4.ft && h4.fs && h4.fk,
    'matEq=' + h4.mat.every((v, j) => v === b0.mat[j]) + ' front T/S/K=' + h4.ft + '/' + h4.fs + '/' + h4.fk);

  // ── H9: MULTI — 3 placements hidden in the SAME InstancedMesh ──────────────────────────────────
  const m0 = await pg.evaluate((T2, M2b, M3b, K2) => ({
    f: [T2, M2b, M3b, K2].map(P => window.__ih.own(window.__ih.front(P.x, P.y, P.z), P)),
    mats: [T2.i, M2b.i, M3b.i].map(i => window.__ih.mat(window.__ih.im, i))
  }), T, M2, M3, K);
  await eye('dwp|ELEC|' + T.idx); await eye('dwp|ELEC|' + M2.idx); await eye('dwp|ELEC|' + M3.idx);
  const m1 = await pg.evaluate((T2, M2b, M3b, K2) => ({
    f: [T2, M2b, M3b, K2].map(P => window.__ih.own(window.__ih.front(P.x, P.y, P.z), P)),
    zero: [T2.i, M2b.i, M3b.i].every(i => window.__ih.mat(window.__ih.im, i).slice(0, 12).every(v => v === 0)),
    nHidden: window.__ih.im.userData.dwHidden.size
  }), T, M2, M3, K);
  // pick-exclusion at all 3 spots (real clicks), then deterministic cleanup
  let noneIdent = true;
  for (const C of [T, M2, M3]) {
    await click(C.sx, C.sy);
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
    f: [T2, M2b, M3b, K2].map(P => window.__ih.own(window.__ih.front(P.x, P.y, P.z), P)),
    mats: [T2.i, M2b.i, M3b.i].map(i => window.__ih.mat(window.__ih.im, i)),
    nHidden: window.__ih.im.userData.dwHidden.size
  }), T, M2, M3, K);
  const matsEq = m2r.mats.every((m, j) => m.every((v, k2) => v === m0.mats[j][k2]));
  t.assert('H9 MULTI (3 hidden in ONE InstancedMesh: none frontmost ×3, zero-basis ×3, keeper still frontmost, ' +
    'none re-identifies, show-all restores every matrix + all 3 frontmost again; dwHidden 3→0)',
    m0.f.every(Boolean) && !m1.f[0] && !m1.f[1] && !m1.f[2] && m1.f[3] && m1.zero && m1.nHidden === 3 &&
    noneIdent && matsEq && m2r.f.every(Boolean) && m2r.nHidden === 0,
    'hidden=' + m1.nHidden + '→' + m2r.nHidden + ' noneIdent=' + noneIdent + ' matsEq=' + matsEq +
    ' front[T,M2,M3,K] ' + JSON.stringify(m0.f) + '→' + JSON.stringify(m1.f) + '→' + JSON.stringify(m2r.f));

  // ── H5..H8: the pure-instanced ASSEMBLY leg (no authored twin — W-E2E-INSTPICK P2b precedent) ───
  await pg.evaluate(() => window.__ih.restoreArc());   // §IH-ISOLATE ends with the walk leg; the ARC is back for the rest
  await pg.evaluate(() => {
    // §WALK-LOD400-ONLY (2026-09-27): an assembly part renders ONLY from a real mesh — give the parts the REAL mesh hash of
    // this building's own ELEC walk (resolved from Duplex_geo.db by the production renderer); hashless parts are refused.
    const gh = (function () { const W = (window.__dwWalks && window.__dwWalks.ELEC) || []; const p = W.find(q => q.geometry_hash); return p ? p.geometry_hash : null; })();
    const parts = [0, 1, 2, 3].map(i => ({ disc: 'ASMH', guid: 'ASMH_PART_' + i, ifc_class: 'IfcDuctSegment', geometry_hash: gh,
      piece_type: 'run', pos: [30 + i * 1.5, -30, 1.2], dir: [0, 0, 1], diameter_mm: 300, length_mm: 600 }));
    window.__dwRender.assembly('ASMH', parts);
    const c = window.A.camera, ct = window.A.controls;
    c.position.set(30 + 1.8, -30 - 1.8, 2.1); ct.target.set(30 + 0.75, -30, 1.2); ct.update();
    window.__ih.savePose();   // the assembly leg's own fixed pose
    window.A.renderer.render(window.A.scene, window.A.camera);
    const ol = window.Bonsai.outliner; ol._collapsed = {}; ol._paint();
  });
  await t.sleep(300);
  const P0 = [30, -30, 1.2], P1 = [31.5, -30, 1.2];
  const a0 = await pg.evaluate((p0, p1) => ({
    f0: window.__ih.asmFront(p0, 0), f1: window.__ih.asmFront(p1, 1), front0: window.__ih.front(p0[0], p0[1], p0[2]),
    mat: window.__ih.mat(window.__ih.asmIm(), 0),
    spot0: window.__ih.spot(p0[0], p0[1], p0[2]), cam: window.A.camera.position.toArray().map(v => +v.toFixed(2)),
    rowThere: !!document.querySelector('[data-bnode="dwa|ASMH|0"]')
  }), P0, P1);
  console.log('  §IH-ASM pre front0=' + JSON.stringify(a0.front0) + ' f0=' + a0.f0 + ' f1=' + a0.f1 + ' spot0=' + JSON.stringify(a0.spot0.map(v => +v.toFixed(0))) + ' cam=' + JSON.stringify(a0.cam));
  t.assert('H5-pre (control: assembly parts 0 and 1 are each frontmost at their own node)', a0.f0 && a0.f1, 'f0=' + a0.f0 + ' f1=' + a0.f1);

  // H6 — controls: hover tints instance 0, click identifies it (so H7's negatives mean something)
  await pg.mouse.move(a0.spot0[0], a0.spot0[1]); await t.sleep(250);
  const hov = await pg.evaluate(() => { const im = window.__ih.asmIm();
    return im.instanceColor ? [im.instanceColor.getX(0), im.instanceColor.getY(0), im.instanceColor.getZ(0)] : null; });
  await pg.mouse.down(); await t.sleep(50); await pg.mouse.up(); await t.sleep(250);
  const pick = await pg.evaluate(() => window.__instPickActive || null);
  await pg.keyboard.press('Escape'); await pg.mouse.move(60, 8); await t.sleep(250);
  if (t.flySettle) await t.flySettle(3000);
  await pg.evaluate(() => window.__ih.repose());
  const HOVER = [0x9b / 255, 0xe7 / 255, 1];
  const hovOn = hov && hov.every((v, j) => Math.abs(v - HOVER[j]) < 0.02);
  t.assert('H6 ASM-CONTROL (visible instance: hover tint 0x9be7ff at i=0 + click identifies guid)',
    !!(hovOn && pick && pick.disc === 'ASMH' && pick.i === 0 && pick.guid === 'ASMH_PART_0'),
    'hov=' + JSON.stringify(hov && hov.map(v => +v.toFixed(3))) + ' pick=' + JSON.stringify(pick && { disc: pick.disc, i: pick.i, guid: pick.guid }));

  // H5 — eye on the assembly part row: pixels gone with NO twin help; sibling part byte-identical
  t.assert('H5-rig assembly row dwa|ASMH|0 rendered in the Outliner', a0.rowThere, '');
  await eye('dwa|ASMH|0');
  const a1 = await pg.evaluate((p0, p1) => { const im = window.__ih.asmIm(); return {
    f0: window.__ih.asmFront(p0, 0), f1: window.__ih.asmFront(p1, 1), front0: window.__ih.front(p0[0], p0[1], p0[2]),
    mat: window.__ih.mat(im, 0), hidden: window.Bonsai.isInstanceHidden(im, 0) }; }, P0, P1);
  t.assert('H5 ASM-HIDE (pure instance hide, no twin: part0 no longer frontmost at its node, sibling part1 still is, zero-basis)',
    a1.hidden && !a1.f0 && a1.f1 && a1.mat.slice(0, 12).every(v => v === 0),
    'front0=' + JSON.stringify(a1.front0) + ' f1=' + a1.f1 + ' hidden=' + a1.hidden);

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
  if (t.flySettle) await t.flySettle(3000);
  await pg.evaluate(() => window.__ih.repose());

  // H8 — show again: matrix + block byte-equal
  await eye('dwa|ASMH|0');
  const a2 = await pg.evaluate((p0) => { const im = window.__ih.asmIm(); return {
    f0: window.__ih.asmFront(p0, 0), mat: window.__ih.mat(im, 0),
    hidden: window.Bonsai.isInstanceHidden(im, 0) }; }, P0);
  t.assert('H8 ASM-ROUNDTRIP (matrix 16/16 byte-equal + part0 frontmost at its node again)',
    !a2.hidden && a2.mat.every((v, j) => v === a0.mat[j]) && a2.f0,
    'matEq=' + a2.mat.every((v, j) => v === a0.mat[j]) + ' f0=' + a2.f0);

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
