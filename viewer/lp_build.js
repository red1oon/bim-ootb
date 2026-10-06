// cpe_load_path family — part `build` (original cpe_load_path.js lines 2256–2832).
// Split mechanically from the single file (bim-compiler prompts/VIEWER_FILE_SPLIT_PLAN.md §5, 2026-10-06). The only edits:
// names shared across parts are reached through LP (the one shared object setupCpeLoadPath creates), and top-level
// `var` statements run as assignments in phase 2 (their names are hoisted to this part, as before). Load order and the
// two-phase setup live in cpe_load_path.js. Witness: viewer/tests/witness_cpe_load_path_surface.js (W-LP-SURFACE).
(typeof window !== 'undefined' ? window : globalThis).__cpeLoadPathParts = (typeof window !== 'undefined' ? window : globalThis).__cpeLoadPathParts || {};
(typeof window !== 'undefined' ? window : globalThis).__cpeLoadPathParts.build = function __lpPart_build(A, LP) {
  'use strict';
  // literal-valued constants, verbatim (evaluating a literal earlier changes nothing)
  // §129.8 item 3 — one stack's own bottom-up reveal step, driven by `stackElapsed` (seconds since
  // THIS stack's own turn began — 0 at its own arm, capped at its own durSec). Shine mode toggles
  // `mesh.visible` (opacity stays 1 always, see _buildChainClones); ghost mode animates
  // opacity/transparent/depthWrite exactly as §129.7's own v10 LOOK did. No-ops once fully revealed
  // (idempotent — safe to call every frame with a clamped `stackElapsed`).
  // §132 §LOADPATH_TWINS — pick up to N chains with the near stack's SIGNATURE (hop sequence of IFC class @ storey, top-down), spaced
  // >= TWIN_MIN_SEP m apart (IFC plan x/y of the chains' members) and in view of the arm camera widened for the pan (|ndc.x| <= 1.6).
  // Clones are built here (their REAL world boxes decide the view test, never DB boxes — ROUND 5's rule); rejects are disposed at once.
  var TWIN_MIN_SEP = 6, TWIN_NDC_X = 0.95, TWIN_NDC_Y = 0.95;


  // v8b HARDENED AGAIN (review, 2026-09-15, after a real HHS bake showed __lpFrameOff making
  // buildingInFrame WORSE — 1.000, up from the normal run's 0.500 — not zero): the shift direction
  // came from a WITHDRAWN fixed constant, (0.5,0.5,0.7), utterly unrelated to the actual live shot;
  // by pure chance it moved the boxes further INTO frame instead of out of it, on top of a magnitude
  // (2.5x the building diagonal) that the prior review round never actually needed to increase — the
  // DIRECTION was the whole defect. That constant is now GONE from this function entirely (nothing
  // in v8b references it). The shift direction is the camera's OWN real right vector — perpendicular
  // to its ACTUAL view direction (`A.camera.getWorldDirection`), never a guess — and the magnitude is
  // 50x the building's diagonal: large enough that no perspective camera, at any FOV or distance,
  // could still keep the shifted box's own projection inside NDC [-1,1]. Applied identically to
  // EVERY box this witness projects — each hop AND the building box (buildingInFrame) AND the chain
  // box (stackInFrame, for consistency: leaving it unshifted next to a shifted hopsIntersecting would
  // print a self-contradicting line). `f`/`g`/`hopsIntersecting` are ALL still the TRUE geometry when
  // the control is off; the shift is applied identically to the real, live boxes, never a separate guess.
  // §129.8 item 3 — `stack` ({name, hopsUp, pickItem, memberVis}) replaces the implicit `_lp` read
  // so the SAME witness serves both FAR and NEAR; `_lp.buildingBox` stays a global read (one
  // building, shared by both stacks' framing fractions).
  function _framingWitness(stack, stackName) {
    if (!A.camera || typeof THREE === 'undefined') { console.log('§LOADPATH_FRAMING INCONCLUSIVE reason=no-camera'); return; }
    // ROUND 8 (2026-09-16) DIAGNOSTIC — force=true, explicitly, right before anything reads the
    // camera's matrices, and say so (`camMatrixAge=`) — ruling out "the witness read a stale
    // matrixWorldInverse" as the cause of PICK/FRAMING disagreeing, rather than assuming it.
    var camMatrixAge = 'stale';
    if (A.camera.updateMatrixWorld) { A.camera.updateMatrixWorld(true); camMatrixAge = 'fresh'; }
    // ROUND 6 — NO pose is pushed and NOTHING is re-aimed: the camera is already at its real, held
    // pose (item 1's arm/hold fix keeps it there) — projecting with _projectAABBLive reads that
    // pose's OWN current matrices directly. A.controls.target is never consulted for orientation
    // here any more (that was the whole defect: a stale/wrong target aimed the TEST camera away
    // from the building while the real, rendered camera was pointed correctly the whole time).
    var camDirVec = (typeof A.camera.getWorldDirection === 'function') ? A.camera.getWorldDirection(new THREE.Vector3()) : null;
    var off = { x: 0, y: 0, z: 0 };
    var frameOffActive = !!(window.__lpFrameOff && LP._lp.buildingBox && typeof A.camera.getWorldDirection === 'function');
    if (frameOffActive) {
      var fwd = A.camera.getWorldDirection(new THREE.Vector3());
      var camUp = (A.camera.up && A.camera.up.clone) ? A.camera.up.clone() : new THREE.Vector3(0, 1, 0);
      var right = new THREE.Vector3().crossVectors(fwd, camUp).normalize();
      var bSize = { x: LP._lp.buildingBox.maxX - LP._lp.buildingBox.minX, y: LP._lp.buildingBox.maxY - LP._lp.buildingBox.minY,
                    z: LP._lp.buildingBox.maxZ - LP._lp.buildingBox.minZ };
      var offMag = 50 * Math.hypot(bSize.x, bSize.y, bSize.z);   // no camera keeps this in NDC [-1,1]
      off = { x: right.x * offMag, y: right.y * offMag, z: right.z * offMag };
    }
    function shiftBox(box) {
      if (!box || (off.x === 0 && off.y === 0 && off.z === 0)) return box;
      return { minX: box.minX + off.x, maxX: box.maxX + off.x, minY: box.minY + off.y, maxY: box.maxY + off.y,
               minZ: box.minZ + off.z, maxZ: box.maxZ + off.z };
    }
    var fBox = shiftBox(LP._lp.buildingBox);
    var fRes = fBox ? LP._projectAABBLive(fBox, A.camera) : null;
    var f = fRes ? fRes.fraction : null;
    var chainBox = LP._chainWorldBBox(stack.hopsUp);
    var gBox = chainBox ? shiftBox({ minX: chainBox.min.x, maxX: chainBox.max.x, minY: chainBox.min.y,
      maxY: chainBox.max.y, minZ: chainBox.min.z, maxZ: chainBox.max.z }) : null;
    var gRes = gBox ? LP._projectAABBLive(gBox, A.camera) : null;
    var g = gRes ? gRes.fraction : null;
    var hopsN = stack.hopsUp.length, hopsIntersecting = 0, memberPx = [];
    // ROUND 4 item 1c (2026-09-16, real Terminal bake: memberPx=[1383.1] printed for a hop this
    // SAME witness itself found hopsIntersecting=0 for) — PICK's own minMemberPxOf (shotPose + the
    // item's DB-metadata AABB) and this witness's own hopsIntersecting (the LIVE hold pose + the
    // REAL clone mesh's box) are two independent computations that can legitimately disagree.
    // Fixed by computing memberPx HERE, from the EXACT SAME box/pose/frustum-test this witness's
    // own hopsIntersecting already uses — one computation, one pose, one box source, feeding both
    // numbers, so they can never again print a contradiction: a hop this test finds NOT intersecting
    // contributes nothing to memberPx (never a giant, meaningless height for an off-frustum member).
    stack.hopsUp.forEach(function (h) {
      if (!h._cloneMesh) return;
      h._cloneMesh.updateMatrixWorld(true);
      var b = new THREE.Box3().setFromObject(h._cloneMesh);
      var box = shiftBox({ minX: b.min.x, maxX: b.max.x, minY: b.min.y, maxY: b.max.y, minZ: b.min.z, maxZ: b.max.z });
      var r = LP._projectAABBLive(box, A.camera);
      if (r && r.intersects) { hopsIntersecting++; memberPx.push(LP._memberPxHeightLive(box, A.camera, LP._lp.outH)); }
    });
    var ok = hopsIntersecting >= 1;
    // ══ ROUND 8 (2026-09-16) DIAGNOSTIC ONLY, for hop 0 (_lp.hopsUp[0]) — the two boxes PICK and
    // FRAMING each actually use, and whether the LIVE frustum (a fresh, LOCAL Frustum built here
    // ONLY for this print — never substituted for the real one `_projectAABBLive` builds internally,
    // so this cannot change any decision) agrees or disagrees with each of them independently. A
    // fresh Frustum for the SAME matrices `_frustumTestAtCurrentPose` just used above (camMatrixAge
    // already forced fresh) — if hop0Dot is negative, the clone centre is literally behind the
    // camera; if frustumSrc/frustumClone disagree with each other, the boxes themselves differ; if
    // both agree and both say "in", but hopsIntersecting still read 0 for a DIFFERENT hop, the cause
    // is per-hop, not systemic. ═══════════════════════════════════════════════════════════════════
    var hop0Src = null, hop0Clone = null, hop0Dot = null, hop0NDC = null, frustumSrc = null, frustumClone = null;
    if (stack.hopsUp.length) {
      var hop0 = stack.hopsUp[0];
      var srcBox0 = LP._instanceWorldBox(hop0.guid);
      if (srcBox0) hop0Src = { x: (srcBox0.minX + srcBox0.maxX) / 2, y: (srcBox0.minY + srcBox0.maxY) / 2, z: (srcBox0.minZ + srcBox0.maxZ) / 2 };
      if (hop0._cloneMesh) {
        hop0._cloneMesh.updateMatrixWorld(true);
        var cb0 = new THREE.Box3().setFromObject(hop0._cloneMesh);
        hop0Clone = cb0.getCenter(new THREE.Vector3());
      }
      var camPosNow = { x: A.camera.position.x, y: A.camera.position.y, z: A.camera.position.z };
      if (hop0Clone && camDirVec) {
        hop0Dot = (hop0Clone.x - camPosNow.x) * camDirVec.x + (hop0Clone.y - camPosNow.y) * camDirVec.y + (hop0Clone.z - camPosNow.z) * camDirVec.z;
      }
      if (hop0Clone) { var p0 = hop0Clone.clone().project(A.camera); hop0NDC = { x: p0.x, y: p0.y, z: p0.z }; }
      if (typeof THREE.Frustum === 'function' && typeof THREE.Matrix4 === 'function' && A.camera.matrixWorldInverse) {
        var frMat0 = new THREE.Matrix4().multiplyMatrices(A.camera.projectionMatrix, A.camera.matrixWorldInverse);
        var fr0 = new THREE.Frustum().setFromProjectionMatrix(frMat0);
        if (hop0Src) frustumSrc = fr0.containsPoint(hop0Src);
        if (hop0Clone) frustumClone = fr0.containsPoint(hop0Clone);
      }
    }
    function fmtV(v) { return v ? '[' + v.x.toFixed(3) + ',' + v.y.toFixed(3) + ',' + v.z.toFixed(3) + ']' : '?'; }
    // §129.8 item 2 — memberVis (unoccluded)/underHud, per hop, REUSING the arm-time occlusion
    // scoring `_pickTwoStacks`/`_scoreChain` already computed ONCE (never re-raycast per frame —
    // the spec's own cost discipline): `stack.memberVis` is that pick's own `perHop` array (chain/
    // top-down order, by guid), remapped here onto `stack.hopsUp`'s own bottom-up order so every
    // printed array lines up hop-for-hop with `hex`/`memberPx`/every other per-hop field.
    var visByGuid = {};
    (stack.memberVis || []).forEach(function (m) { visByGuid[m.guid] = m; });
    var memberVis = [], underHud = [];
    stack.hopsUp.forEach(function (h) {
      var m = visByGuid[h.guid];
      // ROUND 18 — `unoccluded` reads `null` when the arm-time pick skipped raycasting entirely
      // (`pickSource=frustum-fallback reason=raycast-universe-too-large`, ~`_pickTwoStacks`'s own
      // size gate): print the honest `n/a`, never a fabricated 0/1 fed straight into `.toFixed(2)`.
      memberVis.push(m ? (m.unoccluded == null ? 'n/a' : +m.unoccluded.toFixed(2)) : 0);
      underHud.push(!!(m && m.underHud));
    });
    // ROUND 9 CHAIN-PRINT GAP — `guid=` names WHICH pick is being framed: `stack.pickItem`/
    // `stack.hopsUp` are already the FINAL (live, occlusion-scored) winner by the time this fires
    // (mid-hold), never a stale probe pick.
    console.log('§LOADPATH_FRAMING stack=' + (stackName || stack.name) + ' guid=' + (stack.pickItem ? stack.pickItem.guid : '?') +
      ' buildingInFrame=' + (f == null ? '?' : f.toFixed(3)) +
      ' stackInFrame=' + (g == null ? '?' : g.toFixed(3)) + ' hopsIntersecting=' + hopsIntersecting + '/' + hopsN +
      ' memberPx=[' + memberPx.map(function (m) { return m.toFixed(1); }).join(',') + ']' +
      ' memberVis=[' + memberVis.join(',') + ']' + ' underHud=[' + underHud.join(',') + ']' +
      ' camDir=' + (camDirVec ? '[' + camDirVec.x.toFixed(3) + ',' + camDirVec.y.toFixed(3) + ',' + camDirVec.z.toFixed(3) + ']' : '?') +
      ' camMatrixAge=' + camMatrixAge +
      ' hop0Src=' + fmtV(hop0Src) + ' hop0Clone=' + fmtV(hop0Clone) +
      ' hop0Dot=' + (hop0Dot == null ? '?' : hop0Dot.toFixed(3)) + ' hop0NDC=' + fmtV(hop0NDC) +
      ' frustumSrc=' + (frustumSrc == null ? '?' : frustumSrc) + ' frustumClone=' + (frustumClone == null ? '?' : frustumClone) +
      (frameOffActive ? ' frameOff=true offset=[' + off.x.toFixed(2) + ',' + off.y.toFixed(2) + ',' + off.z.toFixed(2) + ']' : '') +
      ' => ' + (ok ? 'PASS' : 'FAIL'));
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // A.loadPathApplyVisual(plan, tNorm) — every frame; (null, 0) forces a restore.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // v10 LOOK — "a solid layer must never sit above a ghost one": which hopsUp indices (ground-up,
  // index 0 = ground) are solid once `revealed` steps have landed. Normal = bottom-up [0..revealed).
  // Control window.__lpTopDown=1 makes it the TOP `revealed` layers instead — deliberately inverted,
  // to prove §LOADPATH_STACK catches the very first violation (step 1: the top layer alone is solid
  // while everything below it, including ground, is still ghost).
  function _solidSetFor(K, revealed) {
    var set = {};
    if (window.__lpTopDown) { for (var i = K - revealed; i < K; i++) set[i] = true; }
    else { for (var j = 0; j < revealed; j++) set[j] = true; }
    return set;
  }
  // §LOADPATH_STACK — measures ACTUAL material state (_isSolid), never trusts the intended index:
  // finds the highest solid index, then checks every index below it is ALSO solid. Any ghost found
  // below the highest solid layer is the "solid above a ghost" inversion the witness exists to catch.
  // §129.8 item 3 — `stack` ({name, hopsUp}) replaces the implicit `_lp` read, so the SAME function
  // serves both FAR and NEAR; prints `stack=far|near` and `step=j/K` per the spec's own line shape.
  function _stackWitness(stack, revealed) {
    var K = stack.hopsUp.length, solidCount = 0, highestSolid = -1;
    for (var idx = 0; idx < K; idx++) { if (LP._isSolid(stack.hopsUp[idx])) { solidCount++; if (idx > highestSolid) highestSolid = idx; } }
    var broken = false;
    for (var idx2 = 0; idx2 <= highestSolid; idx2++) if (!LP._isSolid(stack.hopsUp[idx2])) broken = true;
    console.log('§LOADPATH_STACK stack=' + stack.name + ' order=bottomUp step=' + revealed + '/' + K +
      ' solid=' + solidCount + '/' + K + ' ghostAbove=' + (K - solidCount) + ' => ' + (broken ? 'FAIL' : 'PASS'));
    return !broken;
  }   // inside the frozen frame (no pan by default)
  function _twinsWanted() {
    var m = /[?&]lptwins=(\d+)/.exec(location.search), v = m ? +m[1] : (typeof A._lpTwins === 'number' ? A._lpTwins : 3);
    return Math.max(0, Math.min(8, v | 0));
  }
  function _sigOf(hopsUp) { return hopsUp.map(function (h) { return h.cls + '@' + h.storey; }).join('>'); }
  function _planCentre(hopsUp) {
    var x = 0, y = 0; hopsUp.forEach(function (h) { var it = LP._lp.items[h.idx]; x += (it.x0 + it.x1) / 2; y += (it.y0 + it.y1) / 2; });
    return { x: x / hopsUp.length, y: y / hopsUp.length };
  }
  function _pickTwins() {
    var want = _twinsWanted();
    if (!want || !LP._lp || !LP._lp.hopsUp || !LP._lp.hopsUp.length || !LP._lp.validCandidates || !A.camera || typeof THREE === 'undefined') {
      console.log('§LOADPATH_TWINS picked=0 reason=' + (!want ? 'off (&lptwins=0)' : 'no-near-or-camera')); return [];
    }
    var t0 = performance.now(), sig = _sigOf(LP._lp.hopsUp), nearIdx = LP._lp.pickItem ? LP._lp.items.indexOf(LP._lp.pickItem) : -1;
    var taken = [_planCentre(LP._lp.hopsUp)]; if (LP._lp.far) taken.push(_planCentre(LP._lp.far.hopsUp));
    var usedGuids = {}; LP._lp.hopsUp.forEach(function (h) { usedGuids[h.guid] = 1; }); if (LP._lp.far) LP._lp.far.hopsUp.forEach(function (h) { usedGuids[h.guid] = 1; });
    var same = [];
    LP._lp.validCandidates.forEach(function (c) {
      if (c.idx === nearIdx || !c.chain || c.chain.length < 2) return;
      var d = LP._chainDrawnInfo(c.chain); if (!d || !d.drawnIdx || d.drawnIdx.length !== LP._lp.hopsUp.length) return;
      var up = d.drawnIdx.slice().reverse().map(function (i, k) { return { guid: LP._lp.items[i].guid, cls: LP._lp.items[i].cls, storey: LP._lp.items[i].storey, idx: i, k: k }; });
      if (_sigOf(up) !== sig) return;
      if (up.some(function (h) { return usedGuids[h.guid]; })) return;
      var pc = _planCentre(up), n0 = taken[0];
      same.push({ c: c, up: up, pc: pc, dNear: Math.hypot(pc.x - n0.x, pc.y - n0.y) });
    });
    same.sort(function (a, b) { return a.dNear - b.dNear; });   // nearest same-signature stacks first: most likely inside the pan
    var out = [], rej = { spacing: 0, offView: 0, noClone: 0 }, ndcs = [], seps = [];
    var cam = A.camera; cam.updateMatrixWorld(); var v = new THREE.Vector3();
    for (var j = 0; j < same.length && out.length < want; j++) {
      var s0 = same[j], sep = Math.min.apply(null, taken.map(function (t) { return Math.hypot(s0.pc.x - t.x, s0.pc.y - t.y); }));
      if (sep < TWIN_MIN_SEP) { rej.spacing++; continue; }
      s0.up.forEach(function (h, k) { h.hex = LP._hexForHop(k, s0.up.length); });
      var n = LP._buildChainClones(s0.up); if (!n) { rej.noClone++; continue; }
      var box = LP._chainWorldBBox(s0.up); if (!box) { LP._disposeChainClones(s0.up); rej.noClone++; continue; }
      box.getCenter(v); v.project(cam);
      if (!(v.z > -1 && v.z < 1 && Math.abs(v.x) <= TWIN_NDC_X && Math.abs(v.y) <= TWIN_NDC_Y)) { LP._disposeChainClones(s0.up); rej.offView++; continue; }
      taken.push(s0.pc); s0.up.forEach(function (h) { usedGuids[h.guid] = 1; });
      out.push({ name: 'twin' + (out.length + 1), pickItem: LP._lp.items[s0.c.idx], hopsUp: s0.up, chainBox: box, revealedHops: 0, stackOk: undefined, durSec: LP._lp.durSec, twin: true });
      ndcs.push(v.x.toFixed(2)); seps.push(sep.toFixed(1));
      LP._clonesWitness(s0.up, LP._lp.items[s0.c.idx], 'twin' + out.length);
    }
    console.log('§LOADPATH_TWINS sig=' + LP._lp.hopsUp.length + 'hops want=' + want + ' sameSig=' + same.length + ' picked=' + out.length +
      ' guids=[' + out.map(function (t) { return t.pickItem.guid; }).join(',') + '] sepM=[' + seps.join(',') + '] ndcX=[' + ndcs.join(',') + ']' +
      (out.length < want ? ' short reason=' + (same.length ? 'spacing:' + rej.spacing + ',offView:' + rej.offView + ',noClone:' + rej.noClone : 'no-same-signature') : '') +
      ' ms=' + Math.round(performance.now() - t0) + ' (same load path as the near stack, rising with it; no panels/labels)');
    return out;
  }
  function _revealStackStep(stack, stackElapsed) {
    var K = stack.hopsUp.length;
    var revealed = Math.max(0, Math.min(K, Math.floor(stackElapsed) + 1));
    if (revealed === stack.revealedHops) return;
    stack._rowT = stack._rowT || []; for (var _rk = (stack.revealedHops || 0); _rk < revealed; _rk++) stack._rowT[_rk] = (LP._lp && LP._lp.holdElapsed != null) ? LP._lp.holdElapsed : 0;   // §FREEZE_ANIM: when each row appeared
    stack.revealedHops = revealed;
    // §129.57 (2026-09-20) — bumped HERE, past the early return, so it counts only frames this
    // function genuinely changed something on. cinema_maxq.js's frame-reuse key reads it and
    // re-renders whenever it moves.
    //
    // ⚠ THE POINT OF A COUNTER RATHER THAN A LIST. The measured reason 199 freeze frames come out
    // byte-identical is the early return one line above: the landing-glow lerp below
    // (`1 - age / GLOW_SEC`, GLOW_SEC = 1.0) is only ever evaluated on a step frame, so the glow
    // is a one-frame flash instead of the second-long fade it reads as. If that is ever fixed,
    // this function will mutate every frame, bump this counter every frame, and frame reuse will
    // switch ITSELF off — no edit to the bake loop, and no frozen animation. A hand-written list
    // of "things that change during the hold" would have silently frozen it.
    A._loadPathVisualRev = (A._loadPathVisualRev || 0) + 1;
    var solidSet = _solidSetFor(K, revealed);
    var landingIdx = window.__lpTopDown ? (K - revealed) : (revealed - 1);
    var ghostLook = LP._lookGhost();
    stack.hopsUp.forEach(function (h, k) {
      if (!h._cloneMesh) return;
      var makeSolid = !!solidSet[k];
      var age = stackElapsed - (revealed - 1);
      var hex = (k === landingIdx && age >= 0 && age < LP.GLOW_SEC && typeof THREE !== 'undefined')
        ? new THREE.Color(h.hex).lerp(new THREE.Color(0xffffff), 1 - age / LP.GLOW_SEC).getHex() : h.hex;
      if (ghostLook) {
        if (!h._cloneMat) return;
        h._cloneMat.transparent = !makeSolid; h._cloneMat.opacity = makeSolid ? 1 : LP.GHOST_OPACITY;
        h._cloneMat.depthWrite = makeSolid;
        if (h._cloneMat.color) h._cloneMat.color.setHex(hex);
      } else {
        h._cloneMesh.visible = makeSolid;   // §129.8 item 1 — shine-through: visibility IS solidity
        if (h._cloneMat && h._cloneMat.color) h._cloneMat.color.setHex(hex);
      }
    });
    stack.stackOk = _stackWitness(stack, revealed) && (stack.stackOk !== false);
  }

  // phase-1 exports: other parts reach these through LP (same function objects, same identity)
  LP._framingWitness = _framingWitness;
  LP._solidSetFor = _solidSetFor;
  LP._pickTwins = _pickTwins;
  LP._revealStackStep = _revealStackStep;

  return function () {   // phase 2: this part's setup statements, in original order

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // A.loadPathBuild(plan, filmSecFull, topoutU, db) — once, before the frame loop.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // §129.7 item 3 — `outW`/`outH` (optional, defaults 1920x1080 — the reference resolution ranking
  // was disclosed against; RANK ORDER among candidates is scale-invariant so this default never
  // changes WHICH candidate wins, only the printed px number's units) are the render canvas size,
  // needed to convert the ranking's own NDC projections to real pixels for `minMemberPx`.
  // `fps` (optional, default 24) — §129.7 item 6's own §LOADPATH_BACKDROP witness needs it to
  // report `fadeInFrames`/`fadeOutFrames` as real frame counts, never a guessed constant.
  A.loadPathBuild = function (plan, filmSecFull, topoutU, db, outW, outH, fps) {
    LP._lp = null; A._loadPathWindow = null;
    // ROUND 9 item 1 — fresh per build, so a bake with no hold this time (or the
    // __lpNoClockFreeze control) never carries a PREVIOUS hold's armTnMatch into §LOADPATH_HOLD.
    A._loadPathArmFrameTn = null; A._loadPathArmTnMatch = true;
    LP._lpLabelsWitnessFiredThisHold = {};   // §LOADPATH_LABELS — re-arm for this (possibly new) hold, per stack
    LP._lpCardWitnessFired = false;   // ROUND 13 / §LOADPATH_CARD — re-arm for this (possibly new) hold
    try {
      db = db || A.db;
      if (!db) { console.log('§LOADPATH_BUILD INCONCLUSIVE reason=no-db'); return; }
      if (!window.SupportSweep || !window.SupportSweep.contactGraph || !window.SupportSweep.designatedSupport) {
        console.log('§LOADPATH_BUILD INCONCLUSIVE reason=no-SupportSweep'); return;
      }
      if (topoutU == null) { console.log('§LOADPATH_BUILD INCONCLUSIVE reason=no-topout (no buildup on this bake)'); return; }
      var items = LP._buildItems();
      if (!items.length) { console.log('§LOADPATH_BUILD INCONCLUSIVE reason=no-geometry'); return; }
      var G = window.SupportSweep.contactGraph(items);
      if (!G.ok) { console.log('§LOADPATH_BUILD INCONCLUSIVE reason=contactGraph-not-ok (no ScheduleGate on this page)'); return; }
      var des = window.SupportSweep.designatedSupport(items, G);
      var info = LP._resolveChainInfo(items, des, G.groundConnected);
      var pick = LP._pick(items, info, des);
      if (!pick) { console.log('§LOADPATH_BUILD INCONCLUSIVE reason=empty-pick (no monotone-descending, load-bearing, labelled, ground-ending candidate)'); return; }

      // v8 HOLD-POINT SEARCH — building-only, independent of which candidate eventually wins.
      // ROUND 7 — `items`/`pick.valid` are passed so the search's own fallback criterion (no sample
      // reached 80%) can land on the sample where SOME candidate chain shows the most hops.
      // §PREBAKE PB1 (bim-compiler prompts/ALTC_FOUNDATION.md "§PREBAKE spec"): buildingBox + hold-point search + candidate ranking
      // are pure data (path x geometry) — 155 s on Hospital_silent. Reused from patches/<db>.prebake.json when the key matches.
      var _pbT0 = performance.now(), _pbKey = null, _pbRec = null, _pbWhy = '';
      try {
        var _pf = (typeof A._bakeCameraPoseAt === 'function') ? A._bakeCameraPoseAt : (plan && typeof plan.poseAt === 'function') ? plan.poseAt : null;
        var _ps = _pf ? [0, 0.25, 0.5, 0.75, 1].map(function (t) { var p = _pf(t); return p ? [p.x, p.y, p.z, p.tx, p.ty, p.tz].map(function (v) { return (+v).toFixed(3); }).join(',') : '-'; }).join(';') : 'nopose';
        var _bs = 0; items.forEach(function (it) { _bs += it.x0 + it.x1 + it.y0 + it.y1 + it.bz + it.tz; });
        var _src = function (n) { var e = document.querySelector('script[src*="' + n + '"]'); return e ? e.getAttribute('src') : '-'; };
        var _chainH = A._prebakeFnv ? A._prebakeFnv(pick.valid.map(function (c) { return c.idx + ':' + c.chain.join('.'); }).join('|')) : '-';
        _pbKey = [_src('cpe_load_path.js'), _src('cinema_maxq.js'), items.length, _bs.toFixed(2), items[0].guid, items[items.length - 1].guid, _ps,
          (+filmSecFull).toFixed(3), (+topoutU).toFixed(5), JSON.stringify(plan && plan.beats || null), A.camera ? A.camera.fov : '-', outW + 'x' + outH,
          pick.valid.length, _chainH, window.__lpPickThinnest ? 'thin' : 'thick'].join('|');
        if (A._prebakeFnv) _pbKey = A._prebakeFnv(_pbKey);
        var _pr = A._prebake && A._prebake.loadPath;
        if (!A._prebake) _pbWhy = 'no-sidecar';
        else if (!_pr) _pbWhy = 'no-loadPath-part';
        else if (_pr.key !== _pbKey) _pbWhy = 'key-mismatch';
        else if (!_pr.cand || _pr.cand.length !== pick.valid.length) _pbWhy = 'candidate-count';
        else if (!pick.valid[_pr.winPos] || items[pick.valid[_pr.winPos].idx].guid !== _pr.winGuid) _pbWhy = 'winner-guid';
        else _pbRec = _pr;
      } catch (ePB) { _pbRec = null; _pbWhy = 'error ' + (ePB && ePB.message); }
      var _pbCheck = /[?&]prebakecheck=1/.test(location.search);
      var buildingBox, shot, _pbResolved = null;
      if (_pbRec) {
        buildingBox = _pbRec.buildingBox; shot = _pbRec.shot;
        pick.valid.forEach(function (c, k) { var r = _pbRec.cand[k]; c.visibleHops = r[0]; c.footprint = r[1]; c.minMemberPx = r[2]; c.memberPx = r[3]; });
        var _w = pick.valid[_pbRec.winPos];
        _pbResolved = { idx: _w.idx, chain: _w.chain, depth: _w.depth, visibleHops: _w.visibleHops, footprint: _w.footprint, minMemberPx: _w.minMemberPx, memberPx: _w.memberPx, rule: _pbRec.rule };
        console.log('§PREBAKE loadPath src=sidecar key=' + _pbKey + ' shotTn=' + shot.tNorm.toFixed(4) + ' winner=' + _pbRec.winGuid + ' ms=' + Math.round(performance.now() - _pbT0));
      }
      if (!_pbRec || _pbCheck) {
        buildingBox = _pbRec && !_pbCheck ? buildingBox : LP._buildingWorldBBox(items);
        var _shotC = LP._searchHoldPoint(plan, topoutU, filmSecFull, buildingBox, items, pick.valid);
        if (!_pbRec) shot = _shotC; else A._pbShotCheck = _shotC;
      }

      // §129.7 item 3 — rank every MONOTONE-DESCENDING, >=1-visible-hop candidate by minMemberPx
      // DESC FIRST ("a thicker member or a nearer one both raise it"), then hops-in-the-shot, then
      // depth, footprint, guid.
      // ROUND 5 item 4 (2026-09-16, real Terminal bake: PICK's own DB-metadata boxes said
      // visibleHops=7/7 while the real clone meshes' own frustum test found 0/7) — visibility and
      // memberPx are now measured against `_instanceWorldBox(guid)`, the SAME source-instance world
      // box `_buildChainClones`'s clones are placed at (never `_worldAABBFromItem`'s DB-coordinate
      // math again for this): PICK and FRAMING read the identical geometry, so they can no longer
      // disagree. A guid with no resolvable source instance counts as NOT visible for that hop
      // (never a silent fallback to the old, disagreeing math).
      // ROUND 7 item 2 (2026-09-16, real Terminal bake: PICK still disagreed with FRAMING even after
      // Round 5's fix, because `plan.poseAt(shot.tNorm)` is the RAW, un-blended plan pose — a camera
      // orientation the bake never actually renders; the frame loop ALSO gaze-blends the look target
      // (§57.5) before it ever reaches the real camera) — `shotPose` now comes from
      // `A._bakeCameraPoseAt(shot.tNorm)` (the exact pose the frame loop builds), never the raw plan
      // pose, so PICK evaluates the SAME orientation FRAMING will later see live.
      var shotPose = (typeof A._bakeCameraPoseAt === 'function') ? A._bakeCameraPoseAt(shot.tNorm)
        : (plan && typeof plan.poseAt === 'function') ? plan.poseAt(shot.tNorm) : null;
      var _outH = outH || 1080;
      function visibleHopsOf(chainIdxForV) {
        if (!shotPose || !A.camera) return 0;
        var vis = 0;
        chainIdxForV.forEach(function (i) {
          var box = LP._instanceWorldBox(items[i].guid);
          if (!box) return;
          var r = LP._projectAABB(box, shotPose, A.camera);
          if (r && r.intersects) vis++;
        });
        return vis;
      }
      // Per VISIBLE hop only (item 7a/c's own convention — off-screen hops are never measured, only
      // coloured): the smallest projected bbox height is the candidate's minMemberPx.
      function minMemberPxOf(chainIdxForV) {
        if (!shotPose || !A.camera) return { minMemberPx: 0, memberPx: [] };
        var memberPx = [];
        chainIdxForV.forEach(function (i) {
          var box = LP._instanceWorldBox(items[i].guid);
          if (!box) return;
          var r = LP._projectAABB(box, shotPose, A.camera);
          if (r && r.intersects) memberPx.push(LP._memberPxHeight(box, shotPose, A.camera, _outH));
        });
        return { minMemberPx: memberPx.length ? Math.min.apply(null, memberPx) : 0, memberPx: memberPx };
      }
      var resolved = _pbResolved;
      if (!_pbResolved || _pbCheck) {
        var _resC = LP._rankValid(items, pick.valid, visibleHopsOf, minMemberPxOf, !!window.__lpPickThinnest);
        if (!_pbResolved) {
          resolved = _resC;
          try {   // record what was COMPUTED for --write-prebake (never a sidecar-sourced result)
            if (A._prebakeOut && _pbKey) {
              var _wp = pick.valid.findIndex(function (c) { return c.idx === resolved.idx; });
              A._prebakeOut.loadPath = { key: _pbKey, buildingBox: buildingBox, shot: shot, winPos: _wp, winGuid: items[resolved.idx].guid, rule: resolved.rule,
                cand: pick.valid.map(function (c) { return [c.visibleHops, c.footprint, c.minMemberPx, c.memberPx]; }) };
            }
          } catch (eRec) { console.warn('§PREBAKE loadPath record failed ' + (eRec && eRec.message)); }
          console.log('§PREBAKE loadPath src=computed reason=' + _pbWhy + ' key=' + _pbKey + ' ms=' + Math.round(performance.now() - _pbT0));
        } else {
          var _sc = A._pbShotCheck, okT = _sc && Math.abs(_sc.tNorm - shot.tNorm) < 1e-9, okW = items[_resC.idx].guid === items[_pbResolved.idx].guid;
          console.log('§PREBAKE_CHECK loadPath ' + (okT && okW ? 'PASS' : 'FAIL') + ' shotTn sidecar/computed=' + shot.tNorm.toFixed(6) + '/' + (_sc ? _sc.tNorm.toFixed(6) : '?') +
            ' winner sidecar/computed=' + items[_pbResolved.idx].guid + '/' + items[_resC.idx].guid + ' — issue it proves: the cached hold point + pick equal a fresh computation');
        }
      }
      var pickItem = items[resolved.idx];
      // stackInFrame — informational only (never gates PICK/ranking since v9 item 7): the winning
      // chain's own union-bbox corner fraction at the hold point, unchanged v8 metric.
      var stackBox = null;
      resolved.chain.forEach(function (i) { stackBox = LP._unionAABB(stackBox, LP._worldAABBFromItem(items[i])); });
      var stackInFrameRes = (stackBox && shotPose && A.camera) ? LP._projectAABB(stackBox, shotPose, A.camera) : null;
      var stackInFrame = stackInFrameRes ? stackInFrameRes.fraction : 0;
      console.log('§LOADPATH_SHOT tNorm=' + shot.tNorm.toFixed(4) +
        ' buildingInFrame=' + (shot.buildingInFrame == null ? '?' : shot.buildingInFrame.toFixed(3)) +
        ' stackInFrame=' + stackInFrame.toFixed(3) + ' best=' + shot.best +
        ' bestVisibleHops=' + (shot.bestVisibleHops == null ? '?' : shot.bestVisibleHops) +
        (shot.reason ? ' reason=' + shot.reason : ''));
      // ROUND 7 item 4 (2026-09-16) — at the CHOSEN hold pose, if no candidate chain has even one
      // hop in the frustum (resolved.visibleHops===0 — _rankValid's own ">=1 visible hop" filter
      // could only fall back to the full, unfiltered pool), there is nothing to hold on: print
      // INCONCLUSIVE and skip the beat rather than draw/arm an off-screen stack. Gated on
      // `shotPose && A.camera` — visibleHops is UNCONDITIONALLY 0 whenever there was no camera/pose
      // to test against at all (visibleHopsOf's own `if (!shotPose||!A.camera) return 0`), which is
      // "we could not judge", never "we judged and saw nothing" — only the latter should skip.
      if (shotPose && A.camera && resolved.visibleHops === 0) {
        console.log('§LOADPATH_PICK INCONCLUSIVE reason=no-stack-in-shot');
        return;
      }
      // §129.8 item 3 — PROVISIONAL two-stack estimate, at BUILD time, off the CHEAP probe-based
      // ranking (never raycasting here — raycasting happens exactly once, at ARM, on the live
      // camera, see the FINAL pick in loadPathApplyVisual). This exists ONLY to size `durSec`
      // (frames are spliced into the timeline before arm ever fires — see cinema_maxq.js's own
      // `_lpHoldFrameStart`/`_lpFramesInserted`, computed immediately after this function returns —
      // so the hop counts for BOTH stacks must be known now). The arm-time occlusion-scored pick is
      // the one that actually decides which guids light up; a mismatch in hop COUNT between this
      // estimate and the final pick only shortens/lengthens that stack's own reveal cadence by a
      // step or two — the same tolerated approximation ROUND 9 already accepted for the single-stack
      // case (a live re-pick with a different hop count than the probe's own guess).
      var nearProvisionalHops = resolved.chain.length;
      var farProvisionalHops = 0;
      if (!window.__lpOneStack) {
        var nearDist = 0;
        if (shotPose && stackBox) {
          var nbc = { x: (stackBox.minX + stackBox.maxX) / 2, y: (stackBox.minY + stackBox.maxY) / 2, z: (stackBox.minZ + stackBox.maxZ) / 2 };
          nearDist = Math.hypot(nbc.x - shotPose.x, nbc.y - shotPose.y, nbc.z - shotPose.z);
        }
        var shotDir = shotPose ? (function () {
          var dx = shotPose.tx - shotPose.x, dy = shotPose.ty - shotPose.y, dz = shotPose.tz - shotPose.z, dl = Math.hypot(dx, dy, dz) || 1;
          return { x: dx / dl, y: dy / dl, z: dz / dl };
        })() : { x: 0, y: 0, z: -1 };
        var extentEstimate = shotPose ? LP._extentAlongDir(buildingBox, shotPose, shotDir) : 0;
        var farCandidates = pick.valid.filter(function (c) {
          if (c.idx === resolved.idx) return false;
          var cb = null; c.chain.forEach(function (i) { cb = LP._unionAABB(cb, LP._worldAABBFromItem(items[i])); });
          if (!cb || !shotPose) return false;
          var cc = { x: (cb.minX + cb.maxX) / 2, y: (cb.minY + cb.maxY) / 2, z: (cb.minZ + cb.maxZ) / 2 };
          var d = Math.hypot(cc.x - shotPose.x, cc.y - shotPose.y, cc.z - shotPose.z);
          return (d - nearDist) >= extentEstimate;
        });
        if (farCandidates.length) {
          var farResolved = LP._rankValid(items, farCandidates, visibleHopsOf, minMemberPxOf, !!window.__lpPickThinnest);
          farProvisionalHops = farResolved.chain.length;
        }
      }
      var nearDurEst = Math.min(LP.HOLD_CAP_SEC, nearProvisionalHops * 1 + 1);
      var farDurEst = farProvisionalHops ? Math.min(LP.HOLD_CAP_SEC, farProvisionalHops * 1 + 1) : 0;
      var durSec = nearDurEst + farDurEst;
      if (durSec > LP.HOLD_CAP_SEC) {
        var _scale = LP.HOLD_CAP_SEC / durSec;
        nearDurEst *= _scale; farDurEst *= _scale; durSec = LP.HOLD_CAP_SEC;
      }

      var chainIdx = resolved.chain;     // ground-truth, NEVER touched by the tap — already validated monotone in _pick
      // v10 CHAIN MUST DESCEND — re-print the ALREADY-validated descent info (computed once in
      // _pick, never re-derived) so a log reader sees the proof on the same line as the chain
      // itself. `ascents` is always 0 here BY CONSTRUCTION (an ascending chain is never a candidate
      // in the first place, see _pick) — the control/dry-run proof that ascending chains are
      // REJECTED, not silently accepted, lives in the node dry run, not a live toggle on this line.
      // Drawn-hop bookkeeping + the print itself go through `_chainDrawnInfo`/`_printChainWitness`
      // (ROUND 9 CHAIN-PRINT GAP) — this build-time call is unchanged (no `pickSource=`, byte-
      // identical to the pre-gap-fix line); the arm-time re-pick below prints it again for the
      // FINAL (possibly live-switched) winner, tagged `pickSource=`.
      var drawnInfo = LP._chainDrawnInfo(chainIdx);
      var drawnIdx = drawnInfo.drawnIdx;
      LP._printChainWitness(items, pickItem, chainIdx, drawnInfo, null);

      // Ground-up for the visual (label k/N lands bottom-first): reverse the drawn (top-down) walk.
      var hopsUp = drawnIdx.slice().reverse().map(function (i, k) {
        return { guid: items[i].guid, cls: items[i].cls, storey: items[i].storey, idx: i, k: k };
      });
      hopsUp.forEach(function (h, k) { h.hex = LP._hexForHop(k, hopsUp.length); });
      console.log('§LOADPATH_PICK guid=' + pickItem.guid + ' cls=' + pickItem.cls + ' storey=' + pickItem.storey +
        ' hops=' + resolved.depth + ' candidates=' + pick.candidates + ' rejectedAscending=' + pick.rejectedAscending +
        ' rejectedSingleHop=' + pick.rejectedSingleHop +
        ' skippedNonStructural=' + info.skipCount[resolved.idx] + ' visibleHops=' + resolved.visibleHops + '/' + resolved.chain.length +
        ' minMemberPx=' + resolved.minMemberPx.toFixed(1) +
        ' stackInFrame=' + stackInFrame.toFixed(3) + ' rule=' + resolved.rule +
        ' (provisional — see §LOADPATH_PICK stacks= at arm for the FINAL, occlusion-scored pick)');

      var holdStartSec = shot.tNorm * filmSecFull;   // v8: the SEARCHED point, not raw topoutU
      var holdEndSec = holdStartSec + durSec;
      var durU = filmSecFull > 0 ? Math.max(0, Math.min(1 - topoutU, (holdEndSec / filmSecFull) - topoutU)) : 0;
      // ROUND 13 / §129.8 item 6 — the BUILD-TIME PROBE pick's own guid(s), stashed ONLY for
      // window.__lpCardWrongStack's own control (_cardAssemble's wrongStackControl branch); the
      // real card and its witness always read the LIVE, arm-time re-pick (_lp.pickItem/_lp.far.
      // pickItem) instead. `farResolved` is function-scoped (var-hoisted) and stays undefined when
      // no far candidate was ever found at build time — never re-derived here.
      var buildFarGuid = (typeof farResolved !== 'undefined' && farResolved) ? items[farResolved.idx].guid : null;

      LP._lp = {
        ok: true, items: items, pickItem: pickItem, buildingBox: buildingBox,
        buildNearGuid: pickItem.guid, buildFarGuid: buildFarGuid,
        hopsUp: hopsUp, filmSecFull: filmSecFull, holdStartSec: holdStartSec, holdEndSec: holdEndSec,
        midSec: (holdStartSec + holdEndSec) / 2, midFired: false, ghostResult: null, armPose: null,
        chainBox: null, lastHoldPose: null, fps: fps || 24, outH: outH || 1080, outW: outW || 1920,
        backdropWitnessFired: false, hudFadeWitnessFired: false,   // §129.7 item 6 / §129.8 item 4b — fresh per build/hold
        // ROUND 8 (2026-09-16) DIAGNOSTICS ONLY — PICK's own probe pose and its own visibleHops
        // count, stashed so the ARM-time diagnostic print below can compare them against the LIVE
        // camera without re-deriving or re-guessing either one.
        shotPose: shotPose, pickVisibleHops: resolved.visibleHops,
        // ROUND 9 item 2 / §129.8 item 3 — every valid (monotone-descending, ground-ending, >=2-hop)
        // candidate from THIS build's own `_pick`, stashed so the ARM-time FINAL PICK below can
        // score the SAME pool against the live camera (occlusion, item 2) instead of only re-testing
        // the probe's already-chosen chain.
        validCandidates: pick.valid,
        // §129.8 item 3 — TWO STACKS. `far` is null until/unless arm actually picks one; durSec
        // fields are the BUILD-TIME ESTIMATE (frame count is already committed by the time arm
        // runs) — arm may reveal a different hop count per stack without changing these.
        nearDurSec: nearDurEst, farDurSec: farDurEst,
        far: null, lookMode: LP._lookGhost() ? 'ghost' : 'shine', armHudRects: null,
        durSec: durSec, armed: false, cursorAtEntry: null, holdBroke: false, revealedHops: 0,
        name: 'near'   // §129.8 item 3 — _lp itself doubles as the NEAR stack object (minimal-diff
                        // reuse of every existing per-hop function); `_lp.far` is the other one.
      };
      A._loadPathBackdropAppliedBlackOnce = false;   // §129.7 item 6 — fresh per build, for the __lpBackdropNoRestore control
      // §LOADPATH_BACKDROP generalized population (2026-09-16) — fresh per build, the ONE safe reset
      // point (well before any fade begins this hold — see `_bd`'s own comment for why this is never
      // folded into the ARM-time `_resetRayCache()` a few lines below/elsewhere in this function).
      LP._bd = null; LP._blackSample = null;
      A._loadPathFocusLastResult = null;   // §LOADPATH_CONTEXT_OFF — fresh per build, never a stale prior hold's FOCUS verdict
      A._loadPathWindow = { durU: durU, durSec: durSec, holdStartSec: holdStartSec, holdEndSec: holdEndSec };
      LP._resetRayCache();   // §129.8 item 2 — fresh raycast universe for this (possibly new) hold
      console.log('§LOADPATH_BUILD ok hops=' + hopsUp.length + ' durSec=' + durSec.toFixed(2) +
        ' window=[' + holdStartSec.toFixed(2) + 's,' + holdEndSec.toFixed(2) + 's] topoutU=' + topoutU.toFixed(4) +
        ' holdPointTNorm=' + shot.tNorm.toFixed(4));
    } catch (e) { LP._err('BUILD', e); LP._lp = null; A._loadPathWindow = null; }
  };
  A._loadPathStackWitness = _stackWitness; A._loadPathRevealStackStep = _revealStackStep;
  A._loadPathSolidSetFor = _solidSetFor; A._loadPathIsSolid = LP._isSolid;
  };
};
