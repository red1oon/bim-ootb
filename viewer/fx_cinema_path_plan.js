// effects family — part `cinema_path_plan` (original effects.js lines 7758–10599).
// GENERATED move-only by scripts/split_closure.js (config scripts/split_configs/effects.json). Below the `yield` every
// statement is the original text; the only edit is that a name owned by ANOTHER part is reached as FXS.name.
// Edit this file normally from now on; regenerate only to re-split a branch that still edits the old single file.
(typeof window !== 'undefined' ? window : globalThis).__effectsParts = (typeof window !== 'undefined' ? window : globalThis).__effectsParts || {};
(typeof window !== 'undefined' ? window : globalThis).__effectsParts.cinema_path_plan = function* __split_effects_cinema_path_plan(FXS, A, renderer, scene, camera) {
  // phase 1 — publish this part's names that other parts use (same function objects; vars as live accessors)
  FXS._cinemaPathPlan = _cinemaPathPlan;
  FXS._cpeSet = _cpeSet;
  Object.defineProperty(FXS, '_CPE_KEYS', { get: function () { return _CPE_KEYS; }, set: function (v) { _CPE_KEYS = v; }, enumerable: true });
  yield;   // phase 2 resumes here, in this same scope: the original statements, in original order


  function _cinemaPathPlan(durationSec) {
    var _planT0 = (typeof performance !== 'undefined') ? performance.now() : 0;
    // §ALTC_HIGHWAY pace: CINEMA_WALK_MPS (2.3, interior walking) priced a 2.1 km road drive at ~920 s and the pull-back to
    // a 2 km site's orbit at 6.5 m/s — a ~21-minute film (measured naturalTotal 1243 s). A road is driven/flown at the Fly
    // tour's speed. Buildings: both constants unchanged.
    var _civilPace = !!(A.isCivilModel && A.isCivilModel());
    var _walkMps = _civilPace ? FXS.CIVIL_FILM_SPEED : FXS.CINEMA_WALK_MPS, _pullMps = _civilPace ? FXS.CIVIL_FILM_SPEED : FXS.CINEMA_PULLBACK_MPS;
    var _diveMps = _civilPace ? FXS.CIVIL_FILM_SPEED : FXS.CINEMA_DIVE_MPS;   // §ALTC_ONEWAY: the road fly-in at the film's cruise too
    var arcBboxRaw = FXS._buildingBBoxArc();
    var arcBbox = arcBboxRaw || FXS._buildingBBoxIfc();
    var envelope = arcBbox ? Math.max(arcBbox.xMax - arcBbox.xMin, arcBbox.yMax - arcBbox.yMin, 50) : 100;
    var boundingRadius = arcBbox
      ? 0.5 * Math.hypot(arcBbox.xMax - arcBbox.xMin, arcBbox.yMax - arcBbox.yMin, arcBbox.zMax - arcBbox.zMin)
      : envelope * 0.6;
    var radiusMin = envelope * FXS.CINEMA_RADIUS_MIN_FACTOR, radiusMax = envelope * FXS.CINEMA_RADIUS_MAX_FACTOR;
    var tiltMin = FXS.CINEMA_TILT_MIN_DEG * Math.PI / 180, tiltMax = FXS.CINEMA_TILT_MAX_DEG * Math.PI / 180;

    // ══ §CINEMA_PIVOT — MUST-FIX-FIRST (2026-07-19 root cause under every other symptom) ═══════
    // WAS: `var tgt = A.controls.target;` UNCONDITIONALLY. After any precision-pivot navigation
    // (`§precision RESET — target replanted 10 units ahead`, fires on the `a` key) the orbit target
    // is a point floating ~1.4m in front of the camera, so the whole film orbited THAT instead of
    // the building — live Terminal evidence: `r0=1.4`, `§MAXQ_START radius=0.3 height=1.4`. Every
    // other number in this plan ("largest space at building CENTRE", the orbit band, the fill
    // distance) is meaningless while the pivot is wrong.
    // NOW: the pivot is the ARC bbox centre. controls.target is accepted ONLY when it is plausibly
    // on/near the building AND not simply parked on the camera's own nose — i.e. it must sit within
    // half the bounding radius of the real centre and be at least a quarter-envelope away from the
    // camera. A replanted 10-units-ahead target fails the second test by construction.
    var camPos0 = { x: A.camera.position.x, y: A.camera.position.y, z: A.camera.position.z };
    var pivot = null, pivotSrc = 'controls-target';
    if (arcBbox && A.ifc2three) {
      var cLo = A.ifc2three(arcBbox.xMin, arcBbox.yMin, arcBbox.zMin);
      var cHi = A.ifc2three(arcBbox.xMax, arcBbox.yMax, arcBbox.zMax);
      pivot = { x: (cLo.x + cHi.x) / 2,
                y: Math.min(cLo.y, cHi.y) + Math.abs(cHi.y - cLo.y) * 0.35,
                z: (cLo.z + cHi.z) / 2 };
      pivotSrc = 'arc-bbox-centre';
    }
    var tgtRaw = A.controls.target;
    var tgtOffCentre = pivot ? Math.hypot(tgtRaw.x - pivot.x, tgtRaw.y - pivot.y, tgtRaw.z - pivot.z) : 0;
    var tgtOffCam = Math.hypot(tgtRaw.x - camPos0.x, tgtRaw.y - camPos0.y, tgtRaw.z - camPos0.z);
    if (!pivot) { pivot = { x: tgtRaw.x, y: tgtRaw.y, z: tgtRaw.z }; pivotSrc = 'controls-target(no-bbox)'; }
    else if (tgtOffCentre < boundingRadius * 0.5 && tgtOffCam > envelope * 0.25) {
      pivot = { x: tgtRaw.x, y: tgtRaw.y, z: tgtRaw.z }; pivotSrc = 'controls-target(plausible)';
    }
    console.log('§CINEMA_PIVOT src=' + pivotSrc + ' pivot=(' + pivot.x.toFixed(1) + ',' + pivot.y.toFixed(1) +
      ',' + pivot.z.toFixed(1) + ') targetOffCentre=' + tgtOffCentre.toFixed(1) +
      ' targetOffCam=' + tgtOffCam.toFixed(1) + ' boundingR=' + boundingRadius.toFixed(1) +
      ' envelope=' + envelope.toFixed(1));

    var dx0 = camPos0.x - pivot.x, dy0 = camPos0.y - pivot.y, dz0 = camPos0.z - pivot.z;
    var horizR0 = Math.hypot(dx0, dz0);
    var base = {
      tx: pivot.x, ty: pivot.y, tz: pivot.z,
      startRadius: Math.hypot(dx0, dy0, dz0),
      startTilt: Math.atan2(dy0, horizR0),
      startAzimuth: Math.atan2(dz0, dx0)
    };
    // Fill-frame distance: real perspective-camera trigonometry, not a guessed constant. Biased to
    // the LOOSER of the vertical/horizontal half-FOV per the original §CINEMA_PUSHIN spec, so the
    // subject genuinely fills the frame rather than sitting comfortably contained.
    var vFovRad = THREE.MathUtils.degToRad(A.camera.fov || 50);
    var aspect = A.camera.aspect || (window.innerWidth / Math.max(1, window.innerHeight));
    var hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * aspect);
    var looseTan = Math.max(Math.tan(vFovRad / 2), Math.tan(hFovRad / 2));
    var fillDistance = (boundingRadius / Math.max(looseTan, 1e-3)) * FXS.CINEMA_FILL_MARGIN;
    var pushInRadius = Math.min(base.startRadius, fillDistance);

    // ══ The user's ACTUAL view at t=0 — §CINEMA_POV continuity ════════════════════════════════
    // The film must begin exactly where the camera is, looking exactly where it looks. Read the
    // camera's real world direction (NOT controls.target, which the pivot fix just proved may be
    // nonsense). yaw0 is load-bearing: it SURVIVES the whole dive (see the ease below).
    var _dir0 = new THREE.Vector3();
    A.camera.getWorldDirection(_dir0);
    if (!isFinite(_dir0.x) || (!_dir0.x && !_dir0.z)) _dir0.set(Math.cos(base.startAzimuth + Math.PI), 0, Math.sin(base.startAzimuth + Math.PI));
    var yaw0 = Math.atan2(_dir0.z, _dir0.x);
    var pitch0 = Math.asin(Math.max(-1, Math.min(1, _dir0.y)));

    // §CPE_REPLAN_LAZY — prefix cache key + hit test (see the module-scope comment at
    // _cinemaPrefixCache). Everything from here to just past `outWp.push(exitOuter)` is the
    // cacheable prefix; the restore branch is at the end of that span.
    var _ppT0 = (typeof performance !== 'undefined') ? performance.now() : 0;
    var _ppKey = (A.activeBuilding || '') + '|' + (A._metaGen || 0) + '|' +
      [camPos0.x, camPos0.y, camPos0.z, yaw0, pitch0].map(function (v) { return v.toFixed(4); }).join(',');
    var _ppHit = !!(FXS._cinemaPrefixCache && FXS._cinemaPrefixCache.key === _ppKey);
    var _ppc = null;
    if (_ppHit) _ppc = JSON.parse(FXS._cinemaPrefixCache.json);
    if (!_ppHit) {

    // ══ §CINEMA_SPACE — largest interior space, ALWAYS searched (2026-07-20 user ruling: "abandon
    // the 'next largest room' idea... It is disastrous for sure. Just back to original 'go to
    // largest space within 4 sec'. Let user play with it"). No floor-level weighting, no multi-
    // candidate iteration — rank ALL real rooms once by the ORIGINAL area/centrality formula
    // ("largest space NEAREST TO the centre" beats the strict geometric centre — the centroid can
    // land in a service core on a big building), take the single top-ranked room, one enclosure
    // sanity check (never dive into literal open sky, e.g. a roof terrace), fall straight to
    // bbox-centre if that fails — no search through alternates. If the camera happens to already be
    // standing in the chosen room, the ease-in below is naturally a near-no-op: no special
    // "already inside" branch is needed, it falls out of the general case for free (this is also
    // WHY "already inside" and "go to the largest space" are not in tension, despite reading that
    // way at first — settling in place is just what "go to the largest space" does when you're
    // already there).
    var roomGraph = null;
    try { roomGraph = (typeof A.getRoomGraph === 'function') ? A.getRoomGraph() : null; } catch (eG) { roomGraph = null; }
    var spaceCands = [];
    if (roomGraph && roomGraph.nodesByGuid && arcBbox) {
      var ctrIx = (arcBbox.xMin + arcBbox.xMax) / 2, ctrIy = (arcBbox.yMin + arcBbox.yMax) / 2;
      for (var rk in roomGraph.nodesByGuid) {
        var rn = roomGraph.nodesByGuid[rk];
        if (!rn || rn.kind !== 'room' || !rn.rects || !rn.rects.length) continue;
        var ar = 0;
        for (var ri = 0; ri < rn.rects.length; ri++)
          ar += Math.abs(rn.rects[ri].x1 - rn.rects[ri].x0) * Math.abs(rn.rects[ri].y1 - rn.rects[ri].y0);
        if (!(ar > 0)) continue;
        var dCtr = Math.hypot(rn.cx - ctrIx, rn.cy - ctrIy);
        spaceCands.push({ guid: rn.guid, name: rn.name || rn.guid, area: ar, dCtr: dCtr,
                          ifc: { ix: rn.cx, iy: rn.cy, iz: rn.cz },
                          score: ar / (1 + dCtr / Math.max(1, envelope * 0.5)) });
      }
      spaceCands.sort(function(a, b) { return b.score - a.score; });
    }
    var bboxCentre = arcBbox ? { guid: 'bbox-centre', name: 'bbox-centre', area: 0, dCtr: 0, score: -1,
      ifc: { ix: (arcBbox.xMin + arcBbox.xMax) / 2, iy: (arcBbox.yMin + arcBbox.yMax) / 2,
             iz: arcBbox.zMin + (arcBbox.zMax - arcBbox.zMin) * 0.15 } } : null;
    var topCand = spaceCands.length ? spaceCands[0] : bboxCentre;

    var diveIfc = null, diveName = 'centre', diveArea = 0, diveSrc = 'bbox-centre';
    var dive3 = null, floorY = null, settle = null, fan = null, nudgeL = 0, enclosedFrac = 0;

    function _cinemaEvalCand(cand) {
      var c3 = A.ifc2three(cand.ifc.ix, cand.ifc.iy, cand.ifc.iz);
      var fy = FXS._cinemaFloorY(c3.x, c3.z, c3.y + 2.5);
      if (fy === null) fy = FXS._cinemaFloorY(c3.x, c3.z, c3.y + 25);
      if (fy === null && arcBbox) fy = A.ifc2three(0, 0, arcBbox.zMin).y;
      var st = { x: c3.x, y: (fy === null ? c3.y : fy) + FXS.CINEMA_EYE_M, z: c3.z };
      var f = FXS._cinemaFan(st, FXS.CINEMA_FAN_RAYS);
      var hit = 0;
      for (var fi = 0; fi < f.free.length; fi++) if (f.free[fi] < FXS.CINEMA_FAN_FAR - 0.01) hit++;
      return { c3: c3, fy: fy, st: st, f: f, frac: hit / f.free.length };
    }

    // §CINEMA_SPACE_ENCLOSED_SKIP (2026-07-21, user ruling: keep the #925 any-floor "largest space"
    // ranking EXACTLY as-is — no floor weighting, no re-ranking — but stop letting a single
    // disqualified top candidate fall straight to bbox-centre. Real bug, DB-confirmed live on
    // Terminal/Hospital: the #1 candidate can be a SUSPECT_OPEN/genuinely-unenclosed space (measured
    // enclosed=0%), and bbox-centre itself then measured enclosed=0% too — landing the dive nowhere
    // real. This is NOT the "next largest room" iteration the user called disastrous and abandoned in
    // #925 (that combined iteration WITH floor-level re-scoring, so which room won jumped around
    // unpredictably floor to floor). Here the order never changes — same area/centrality score, same
    // sort — this only SKIPS a candidate that fails the existing enclosure sanity check, same threshold
    // that already existed. Bounded to the top 6 (same cap R2 used before #925 removed floor-weighting,
    // reused here for its own sake, not because floor-weighting is back).
    // §CINEMA_SPACE_MEP_SKIP (2026-07-21, user report + DB-confirmed live on Hospital: dive landed
    // in RM_Level_2_20, 270m^2, 97% "enclosed" by the ray-fan — but it's a rooftop MECHANICAL PLANT
    // room, not a habitable space. rel_contained_in_space: 304 IfcPipeFitting + 290 IfcPipeSegment +
    // 49 IfcDuctFitting + 14 IfcDistributionControlElement + 11 IfcFireSuppressionTerminal of ~858
    // total contained (78%), with only 2 IfcSlab elements found anywhere above its footprint — an
    // open plant yard screened by walls, not a real room. §CINEMA_SPACE_ENCLOSED_SKIP's ray-fan is
    // horizontal-only (_cinemaFan: dir.set(cos,0,sin) — no vertical component), so it structurally
    // cannot see "no roof," only "no walls" — walls-for-screening pass it fine. Area/centrality
    // ranking alone can't tell a plant room from a ward either — MEP rooms are often large. This is
    // a SEPARATE disqualifier, same "skip and keep looking" pattern as the enclosure check, not a
    // replacement for it — both must pass.
    var CINEMA_MEP_CLASSES = { IfcPipeFitting: 1, IfcPipeSegment: 1, IfcDuctFitting: 1, IfcDuctSegment: 1,
      IfcDistributionControlElement: 1, IfcFireSuppressionTerminal: 1, IfcFlowTerminal: 1,
      IfcFlowController: 1, IfcFlowFitting: 1, IfcFlowSegment: 1, IfcFlowStorageDevice: 1,
      IfcFlowTreatmentDevice: 1, IfcFlowMovingDevice: 1, IfcEnergyConversionDevice: 1,
      IfcCableSegment: 1, IfcCableFitting: 1, IfcCableCarrierSegment: 1, IfcCableCarrierFitting: 1,
      IfcTank: 1, IfcBoiler: 1, IfcChiller: 1, IfcCompressor: 1, IfcCondenser: 1, IfcCoolingTower: 1,
      IfcPump: 1, IfcFan: 1 };
    var CINEMA_MEP_SKIP_MIN_TOTAL = 20;  // guard against tiny-sample false positives
    var CINEMA_MEP_SKIP_FRACTION = 0.5;  // majority of contained elements are plant/services classes
    function _cinemaMepFraction(guid) {
      var rows = A.dbQuery ? A.dbQuery(
        "SELECT m.ifc_class, COUNT(*) FROM rel_contained_in_space r " +
        "JOIN elements_meta m ON m.guid=r.element_guid WHERE r.space_guid=? GROUP BY m.ifc_class",
        [guid]) : [];
      if (!rows.length) return 0;
      var total = 0, mep = 0;
      for (var i = 0; i < rows.length; i++) {
        total += rows[i][1];
        if (CINEMA_MEP_CLASSES[rows[i][0]]) mep += rows[i][1];
      }
      return total >= CINEMA_MEP_SKIP_MIN_TOTAL ? mep / total : 0;
    }

    var CINEMA_SPACE_TRY_MAX = 6;
    var chosenCand = null, chosenEv = null;
    for (var sci = 0; sci < Math.min(spaceCands.length, CINEMA_SPACE_TRY_MAX); sci++) {
      var sc = spaceCands[sci];
      var scEv = _cinemaEvalCand(sc);
      var mepFrac = _cinemaMepFraction(sc.guid);
      var mepSkip = mepFrac >= CINEMA_MEP_SKIP_FRACTION;
      var okCand = scEv.frac >= FXS.CINEMA_ENCLOSED_THRESHOLD && !mepSkip;
      console.log('§CINEMA_SPACE cand=' + sc.guid + ' area=' + sc.area.toFixed(1) +
        ' enclosed=' + (scEv.frac * 100).toFixed(0) + '%' +
        ' mep=' + (mepFrac * 100).toFixed(0) + '% chosen=' + okCand +
        (sci > 0 ? ' (rank=' + (sci + 1) + ', skipped ' + sci + ' disqualified above)' : ''));
      if (okCand) { chosenCand = sc; chosenEv = scEv; break; }
    }
    if (chosenCand) {
      diveIfc = chosenCand.ifc; diveName = chosenCand.name; diveArea = chosenCand.area;
      diveSrc = 'room-graph';
      dive3 = chosenEv.c3; floorY = chosenEv.fy; settle = { x: chosenEv.st.x, y: chosenEv.st.y, z: chosenEv.st.z };
      fan = chosenEv.f; enclosedFrac = chosenEv.frac;
    } else if (bboxCentre) {
      // Every real candidate tried failed enclosure (or none existed) — fall to bbox-centre, same
      // last-resort this always had.
      var evB = _cinemaEvalCand(bboxCentre);
      diveIfc = bboxCentre.ifc; diveName = 'bbox-centre'; diveArea = 0;
      diveSrc = 'bbox-centre (no enclosed candidate among top ' + Math.min(spaceCands.length, CINEMA_SPACE_TRY_MAX) + ')';
      dive3 = evB.c3; floorY = evB.fy; settle = { x: evB.st.x, y: evB.st.y, z: evB.st.z }; fan = evB.f; enclosedFrac = evB.frac;
      console.log('§CINEMA_SPACE cand=bbox-centre area=0.0 enclosed=' + (evB.frac * 100).toFixed(0) + '% chosen=true (fallback)');
    }
    if (!settle) { settle = { x: pivot.x, y: pivot.y, z: pivot.z }; fan = FXS._cinemaFan(settle, FXS.CINEMA_FAN_RAYS); }
    // BVH fan nudge: slide toward the open side so we land in the MIDDLE of the space rather than
    // against a wall. Bounded, so it can never wander out of the room. When the pose is nose-to-a-
    // wall this IS the "backing away" the spec asks for.
    // §CINEMA_SPIN_GLAZING (2026-07-22, §Issue 2 spin-at-wall): the 3m cap can leave `settle` still
    // close to geometry in a large/elongated room (root cause named in the spec). Per the user's
    // own words, being close to GLAZING is fine as-is — only extend the nudge when what's actually
    // nearby is opaque (a real wall) AND the true open point is farther than the normal cap allows.
    var nudgeCap = FXS.CINEMA_FAN_NUDGE_MAX;
    if (fan.min < FXS.CINEMA_FAN_NUDGE_MAX && !fan.minGlazing) nudgeCap = FXS.CINEMA_FAN_NUDGE_MAX * 3;
    nudgeL = Math.hypot(fan.openDir.x, fan.openDir.z);
    if (nudgeL > 0.01) {
      var nk = Math.min(1, nudgeCap / nudgeL);
      settle.x += fan.openDir.x * nk; settle.z += fan.openDir.z * nk;
    }
    // "Facing a wall" is not a branch — it is just a short free-distance along yaw0, reported so a
    // pasted console shows WHY the opening backed away. The nudge above IS the backing-away.
    var wallIdx = Math.round(((yaw0 % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI) * fan.rays) % fan.rays;
    // §CINEMA_TRAVEL_CLASS (2026-07-20 user spec, Phase 2): whether a real dive happened (settle far
    // from where the camera started) governs the exit-choice mood downstream — "for those just
    // rushing to it... short of time" (nearest, quick) vs "already there... you have time" (graceful,
    // prefer the facing-matched exit). A near-zero diveDist means "already there" for free — no
    // special-case detection needed, see the §CINEMA_SPACE comment above.
    var diveDist = Math.hypot(settle.x - camPos0.x, settle.y - camPos0.y, settle.z - camPos0.z);
    var CINEMA_TRAVEL_THRESHOLD_M = 3;
    var hadToTravel = diveDist > CINEMA_TRAVEL_THRESHOLD_M;
    var _ppDiveLine = '§CINEMA_DIVE src=' + diveSrc + ' space="' + diveName + '" areaM2=' + diveArea.toFixed(1) +
      ' settle=(' + settle.x.toFixed(1) + ',' + settle.y.toFixed(1) + ',' + settle.z.toFixed(1) + ')' +
      ' floorY=' + (floorY === null ? 'n/a' : floorY.toFixed(2)) + ' eye=' + FXS.CINEMA_EYE_M +
      ' fanMin=' + fan.min.toFixed(1) + ' fanMax=' + fan.max.toFixed(1) + ' fanMean=' + fan.mean.toFixed(1) +
      ' openBearing=' + (fan.maxBearing * 180 / Math.PI).toFixed(0) + '°' +
      ' facingFree=' + fan.free[wallIdx].toFixed(1) + ' nudge=' + Math.min(nudgeL, nudgeCap).toFixed(2) + 'm' +
      ' fanMinGlazing=' + fan.minGlazing + ' nudgeCap=' + nudgeCap +
      ' enclosed=' + (enclosedFrac * 100).toFixed(0) + '%' +
      ' yaw0=' + (yaw0 * 180 / Math.PI).toFixed(1) + '° pitch0=' + (pitch0 * 180 / Math.PI).toFixed(1) + '°' +
      ' diveDist=' + diveDist.toFixed(1) + 'm';
    console.log(_ppDiveLine);

    // ══ §CINEMA_EXIT — chosen at the 4-second mark by POSITION **and** FACING ══════════════════
    // WAS: one global `entrance = widest-ground-door` for the whole building — every film on a
    // building took the same door, which is exactly what collapsed "a myriad of paths" into one.
    // NOW: per-run, from the REAL door set the room graph already exposes ('exit' nodes = the
    // name-filtered non-room doors, i.e. the ways OUT), scored against where we are standing and
    // which way we are looking at t=4s. Falls back to the DB's IfcDoor rows if a building has no
    // graph. Logged in full so a pasted console explains why a film went the way it did — the user
    // is learning this lever, so the cause must be visible.
    var exitCands = [];
    if (roomGraph && roomGraph.nodesByGuid) {
      for (var ek in roomGraph.nodesByGuid) {
        var en = roomGraph.nodesByGuid[ek];
        if (!en || en.kind !== 'exit' || en.cx == null) continue;
        exitCands.push({ guid: en.guid, name: en.name || en.guid, ifc: { ix: en.cx, iy: en.cy, iz: en.cz } });
      }
    }
    var exitSrc = exitCands.length ? 'room-graph-exit-nodes' : 'db-doors';
    if (!exitCands.length && A.dbQuery) {
      try {
        var drows = A.dbQuery(
          "SELECT et.guid, em.element_name, et.center_x, et.center_y, et.center_z " +
          "FROM element_transforms et JOIN elements_meta em ON et.guid = em.guid " +
          "WHERE em.ifc_class LIKE 'IfcDoor%' AND et.center_x IS NOT NULL ORDER BY et.center_z ASC LIMIT 400") || [];
        for (var dj = 0; dj < drows.length; dj++)
          exitCands.push({ guid: drows[dj][0], name: drows[dj][1] || drows[dj][0],
                           ifc: { ix: drows[dj][2], iy: drows[dj][3], iz: drows[dj][4] } });
      } catch (eD) { /* no doors — the facade fallback below covers it */ }
    }
    var chosenExit = null, exitScored = [];
    for (var xi = 0; xi < exitCands.length; xi++) {
      var xp = A.ifc2three(exitCands[xi].ifc.ix, exitCands[xi].ifc.iy, exitCands[xi].ifc.iz);
      var xd = Math.hypot(xp.x - settle.x, xp.z - settle.z);
      if (!(xd > 0.01)) continue;
      var xb = Math.atan2(xp.z - settle.z, xp.x - settle.x);
      var facingDot = Math.cos(xb - yaw0);
      // A door is a way OUT to the degree it sits on the building's PERIMETER — measured, not
      // guessed: distance from the door's own centre to the nearest edge of the real ARC footprint,
      // as a fraction of the footprint's half-width. Deep-interior doors (Duplex's fallback set is
      // all M_Single-Flush room doors) are penalised so the film leaves the building rather than
      // stepping into the next room. Room-graph 'exit' nodes are already the non-room doors, so
      // this only ever refines the DB fallback set.
      var perim = 1;
      if (arcBbox) {
        var eIfc = exitCands[xi].ifc;
        var edge = Math.min(eIfc.ix - arcBbox.xMin, arcBbox.xMax - eIfc.ix,
                            eIfc.iy - arcBbox.yMin, arcBbox.yMax - eIfc.iy);
        var half = Math.max(1, Math.min(arcBbox.xMax - arcBbox.xMin, arcBbox.yMax - arcBbox.yMin) / 2);
        perim = 1 + Math.max(0, Math.min(1, edge / half));   // on the edge → 1.0, dead centre → 2.0
      }
      var faceGain = hadToTravel ? FXS.CINEMA_EXIT_FACE_GAIN_RUSHED : FXS.CINEMA_EXIT_FACE_GAIN_GRACEFUL;
      var cost = xd * (1 - faceGain * facingDot) * perim;
      var rec = { guid: exitCands[xi].guid, name: exitCands[xi].name, p: xp, dist: xd,
                  bearing: xb, facingDot: facingDot, perim: perim, cost: cost };
      exitScored.push(rec);
      if (!chosenExit || cost < chosenExit.cost) chosenExit = rec;
    }
    if (!chosenExit) {
      // No door data at all → leave through the nearest facade, still from where we settled.
      var fx = (settle.x < pivot.x) ? -1 : 1, fz = (settle.z < pivot.z) ? -1 : 1;
      var useX = Math.abs(settle.x - pivot.x) >= Math.abs(settle.z - pivot.z);
      var fp = { x: useX ? pivot.x + fx * envelope * 0.5 : settle.x, y: settle.y,
                 z: useX ? settle.z : pivot.z + fz * envelope * 0.5 };
      chosenExit = { guid: 'nearest-facade', name: 'nearest-facade', p: fp,
                     dist: Math.hypot(fp.x - settle.x, fp.z - settle.z),
                     bearing: Math.atan2(fp.z - settle.z, fp.x - settle.x), facingDot: 0, cost: 0 };
      exitSrc = 'facade-fallback';
    }
    exitScored.sort(function(a, b) { return a.cost - b.cost; });
    var _ppExitLine = '§CINEMA_EXIT chosen=' + chosenExit.guid + ' name="' + chosenExit.name + '" dist=' +
      chosenExit.dist.toFixed(1) + ' facingDot=' + chosenExit.facingDot.toFixed(3) +
      ' perimFactor=' + (chosenExit.perim || 1).toFixed(2) + ' cost=' +
      chosenExit.cost.toFixed(1) + ' src=' + exitSrc + ' candidates=' + exitScored.length +
      ' runnerUp=' + (exitScored[1] ? exitScored[1].guid + '@' + exitScored[1].cost.toFixed(1) : 'none') +
      ' hadToTravel=' + hadToTravel + ' diveDist=' + diveDist.toFixed(1) + 'm mood=' + (hadToTravel ? 'rushed' : 'graceful');
    console.log(_ppExitLine);

    // Route out: ride the building's OWN room/corridor graph when it has one (wall-legal, the same
    // RoomGraph the Fly tour uses); straight line otherwise — then a wall clip is the model's data
    // gap, not the orbit's (settled user doctrine).
    var outWp = [{ x: settle.x, y: settle.y, z: settle.z }], outRoute = 'line';
    try {
      var RG2 = window.RoomGraph;
      if (roomGraph && roomGraph.nodesByGuid && RG2 && RG2.shortestPath && chosenExit.guid.indexOf('EXIT::') === 0) {
        var nearN = null, nearD = 1e18;
        for (var nk2 in roomGraph.nodesByGuid) {
          var nn2 = roomGraph.nodesByGuid[nk2];
          if (!nn2 || nn2.cx == null || (nn2.kind !== 'room' && nn2.kind !== 'circ')) continue;
          var np = A.ifc2three(nn2.cx, nn2.cy, nn2.cz);
          var nd = Math.hypot(np.x - settle.x, np.z - settle.z);
          if (nd < nearD) { nearD = nd; nearN = nn2; }
        }
        if (nearN) {
          var sp2 = RG2.shortestPath(roomGraph, nearN.guid, chosenExit.guid);
          if (sp2 && sp2.path && sp2.path.length) {
            for (var pi = 0; pi < sp2.path.length; pi++) {
              var pn = roomGraph.nodesByGuid[sp2.path[pi]];
              if (!pn || pn.cx == null) continue;
              var pp = A.ifc2three(pn.cx, pn.cy, pn.cz);
              outWp.push({ x: pp.x, y: pp.y + FXS.CINEMA_EYE_M, z: pp.z });
            }
            if (outWp.length > 1) outRoute = 'graph';
          }
        }
      }
    } catch (eR) { console.warn('§CINEMA_EXIT route failed: ' + eR.message); }
    outWp.push({ x: chosenExit.p.x, y: chosenExit.p.y + FXS.CINEMA_EYE_M * 0.5, z: chosenExit.p.z });
    // Push past the doorway, outward from the pivot, so we genuinely emerge into open air.
    var odx = chosenExit.p.x - pivot.x, odz = chosenExit.p.z - pivot.z;
    var odL = Math.hypot(odx, odz) || 1; odx /= odL; odz /= odL;
    var exitOuter = { x: chosenExit.p.x + odx * Math.max(8, envelope * 0.15),
                      y: chosenExit.p.y + FXS.CINEMA_EYE_M,
                      z: chosenExit.p.z + odz * Math.max(8, envelope * 0.15) };
    outWp.push(exitOuter);
    // §CPE_REPLAN_LAZY — store the freshly-computed prefix. JSON round-trip so every later replan
    // gets fresh copies (the suffix mutates outWp; a shared reference would corrupt the cache).
    FXS._cinemaPrefixCache = { key: _ppKey,
      prefixMs: ((typeof performance !== 'undefined') ? performance.now() : 0) - _ppT0,
      json: JSON.stringify({ settle: settle, fan: fan, diveDist: diveDist, hadToTravel: hadToTravel,
        chosenExit: chosenExit, exitSrc: exitSrc, exitScored: exitScored, outWp: outWp,
        outRoute: outRoute, exitOuter: exitOuter, spaceCandsLen: spaceCands.length,
        odx: odx, odz: odz,
        diveLine: _ppDiveLine, exitLine: _ppExitLine }) };
    console.log('§CPE_REPLAN_LAZY miss=1 prefixMs=' + FXS._cinemaPrefixCache.prefixMs.toFixed(1) + ' key=' + _ppKey.slice(0, 40));
    } else {
      // §CPE_REPLAN_LAZY — cache hit: restore every prefix output the suffix consumes and replay
      // the §CINEMA_DIVE/§CINEMA_EXIT lines VERBATIM (identical by construction — the cache key
      // pins every input the prefix reads; witness_cpe_preview_divergence.js keeps parsing them).
      var settle = _ppc.settle, fan = _ppc.fan, diveDist = _ppc.diveDist,
          hadToTravel = _ppc.hadToTravel, chosenExit = _ppc.chosenExit, exitSrc = _ppc.exitSrc,
          exitScored = _ppc.exitScored, outWp = _ppc.outWp, outRoute = _ppc.outRoute,
          exitOuter = _ppc.exitOuter, spaceCands = new Array(_ppc.spaceCandsLen),
          odx = _ppc.odx, odz = _ppc.odz;   // Beat 3/4 outward-push fallback — read by the suffix's
          // gaze fallback and the §Beat-4 seam measurement; the ONE prefix output the first cut of
          // this cache missed (found by witness G-RL-EQUIV at 0.098m divergence, fixed same day).
      console.log(_ppc.diveLine);
      console.log(_ppc.exitLine);
      console.log('§CPE_REPLAN_LAZY hit=1 savedMs=' + FXS._cinemaPrefixCache.prefixMs.toFixed(1) + ' key=' + _ppKey.slice(0, 40));
    }
    // ══ §CINEMA_PATH_EDITOR (prompts/CINEMA_PATH_EDITOR.md §CINEMA_PATH_EDITOR_MODEL item 1):
    // AUTHORED waypoints replace the derived walk-out wholesale. Waypoints are the ONLY authored
    // data in this whole feature — position plus camera height, nothing else. The camera ANGLE is
    // never authored (item 2): it stays LOS toward the next waypoint, which is exactly what _outPos
    // and the existing §CINEMA_TURN_SLERP already derive. That is WHY this feature cannot weaken
    // §CINEMA_TURN_SLERP's witness (item 4) — it changes that law's inputs, never the law.
    var cpeOrbitScale = 1, cpeOrbitDY = 0, cpeFlow = null;
    // §CPE_BANDS: authored BANDS expand to waypoints here — the plan below never needs to know a
    // band existed. Everything downstream (LOS aim, spin bearing, orbit elasticity, the walk-out
    // itself) reads `outWp` exactly as it did for loose waypoints, so bands add a control model
    // without adding a second code path through the plan.
    if (FXS._cpeBands && FXS._cpeBands.length >= 2) {
      FXS._cpeWp = FXS._cinemaBandWaypoints(FXS._cpeBands);
      // §CPE_HOSE applies to the FLOWN polyline, after the bands have produced it: the bands stay
      // rigid (§CPE_BANDS rule 2, settled and untouched) and the hose deforms the curve BETWEEN and
      // AROUND them. `outWp` — the authored control points the rest of the plan reasons about — is
      // deliberately NOT hosed, so routing, the exit choice and the orbit elasticity all still read
      // the authored intent rather than a deformed copy of it.
      cpeFlow = FXS._cinemaHoseApply(FXS._cinemaBandFlow(FXS._cpeBands), FXS._cpeHose);
    }
    if (FXS._cpeWp && FXS._cpeWp.length >= 2) {
      // ══ The LAST waypoint is the orbit's control point, and it acts ELASTICALLY (user, 2026-07-26:
      // "that curve remains static, it is just its waypoint that gets adjusted... it is elastic,
      // relative to its original orbit"). The orbit KEEPS ITS SHAPE — ellipse, Sun-glint swoop, flat
      // hold, decelerating ending, all formula-driven and all already witnessed. The stop row only
      // stretches it: a RATIO on radius and an OFFSET on height, both measured against the derived
      // orbit rather than replacing it.
      // Relative, not absolute, on purpose: a stored path is re-applied later against a plan that
      // may have been derived from a different start pose (hence a different fillDistance). A ratio
      // still means "a bit wider than this building's natural orbit" then; an absolute radius in
      // metres would not.
      // The third lever needs no code at all: `exitAz` below is measured off exitOuter, and it is
      // what decides where the Sun crossing falls in the loop — whether the film catches the
      // reflection early and then rises, or rises into it at the end. Reassigning exitOuter is
      // enough for the stop row to re-shape the orbit's whole mood through existing code.
      var derivedOuter = exitOuter;
      var derivedR = Math.hypot(derivedOuter.x - pivot.x, derivedOuter.z - pivot.z);
      outWp = FXS._cpeWp.map(function(w) { return { x: w.x, y: w.y, z: w.z }; });
      outRoute = 'authored';
      exitOuter = outWp[outWp.length - 1];
      // ── Two things downstream still pointed at the DERIVED route and had to be re-aimed at the
      // authored one. Both were caught by witness numbers, not by reading the code:
      //
      // (a) `settle` — Beats 1-2 (dive, spin) fly to `settle`, which came from the §CINEMA_SPACE
      //     pick, while Beat 3 starts from outWp[0]. Authoring row 0 without this moved only the
      //     walk, so the camera teleported at the beat seam. G3 measured it exactly: a 1.5m
      //     height edit produced dy over the walk-out of [0.000, 1.508] — the 0.000 IS the seam.
      //     Mutated in place because the beat closures captured this object.
      // (b) `odx/odz` — the outward push direction past the doorway. Beat 3's gaze falls back to it
      //     whenever the look-ahead point collapses onto the position (the last half-metre of the
      //     walk, line ~4146), and Beat 4 assumes "(odx,odz) IS the direction Beat 3 ends on". With
      //     an authored path that was still the derived exit's bearing, so the gaze SNAPPED onto it
      //     at the end of the walk: G7 measured 115.2 deg in a single frame — six times worse than
      //     the 19.8 deg/frame whip this feature set out to retire.
      settle.x = outWp[0].x; settle.y = outWp[0].y; settle.z = outWp[0].z;
      var lastLeg = outWp[outWp.length - 1], prevLeg = outWp[outWp.length - 2];
      var lgx = lastLeg.x - prevLeg.x, lgz = lastLeg.z - prevLeg.z;
      var lgL = Math.hypot(lgx, lgz);
      if (lgL > 1e-4) { odx = lgx / lgL; odz = lgz / lgL; }
      var authoredR = Math.hypot(exitOuter.x - pivot.x, exitOuter.z - pivot.z);
      if (derivedR > 0.01) cpeOrbitScale = authoredR / derivedR;
      cpeOrbitDY = exitOuter.y - derivedOuter.y;
      console.log('§CINEMA_PATH_EDIT authored waypoints=' + outWp.length + ' (derived route replaced)' +
        ' orbitScale=' + cpeOrbitScale.toFixed(3) + ' orbitDY=' + cpeOrbitDY.toFixed(2) + 'm');
    }
    // §ALTC_V2 V4 (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §ALTC_V2): a road film's only orbit is a close-up at the
    // junction the drive ENDS at — pivot = that junction's signal-head centroid, radius = its own r (orbitRadius below) —
    // not the whole-site ARC bbox centre. Junctions come from the route (tour.js §CIVIL_ROUTE_JUNCTION). Buildings: no-op.
    var _civJ = null;
    if (_civilPace) {
      var _cfo = FXS._civilFilmOv(), _js = (_cfo && _cfo.junctions) || [], _jd = Infinity;
      _js.forEach(function(j) { var d = Math.hypot(j.x - exitOuter.x, j.z - exitOuter.z); if (d < _jd) { _jd = d; _civJ = j; } });
      if (_civJ) {
        pivot = { x: _civJ.x, y: _civJ.y, z: _civJ.z }; pivotSrc = 'civil-junction';
        cpeOrbitScale = 1; cpeOrbitDY = 0;
        console.log('§ALTC_V2 orbit pivot=junction heads=' + _civJ.n + ' r=' + _civJ.r.toFixed(1) + 'm driveEndToJunction=' + _jd.toFixed(1) + 'm');
      } else console.log('§ALTC_V2 orbit pivot=site (no junction on the route) VACUOUS');
    }
    // ══ §CINEMA_PATH_EDITOR_MODEL items 5-7: the waypoints are CONTROL points, not corners. The
    // flown curve CUTS INSIDE every corner (user: "yes cut inside"), so a sharp corner is not a
    // state this path can reach — user: "that means there are no 'sharp' corners." The cut is
    // bounded by MEASURED clearance at each waypoint (_cinemaFan.min, this project's single source
    // for "how much open space is here", already trusted by §CINEMA_SPACE), never by a guessed
    // fillet constant: tight room → tight curve, open hall → wide graceful arc.
    // This retires the ungated "D2 walk-out corner whip" (19.8°/frame) the user reported as "about
    // 2 jerks, fast jump at least a frame" — tolerable while the route was derived-and-tame, trivial
    // to hit once waypoints are user-draggable. Gated by G7 (°/frame cap) and G8 (deviation ≤ the
    // measured clearance). `outWp` stays the authored control points (the editor's table and the
    // LOS derivation both read it); `flowWp` is what is actually flown.
    // Bands bring their own flown geometry (straight bands + tangent-matched connectors) and must
    // NOT be run through the corner rounder — rounding a band's interior is exactly the morphing
    // §CPE_BANDS rule 2 forbids. The rounder stays in force for the derived and loose-waypoint
    // paths, which is what keeps G1's byte-identity intact.
    var flowWp = cpeFlow || FXS._cinemaRoundCorners(outWp);
    var segLen = [0];
    for (var wi = 1; wi < flowWp.length; wi++)
      segLen.push(segLen[wi - 1] + Math.hypot(flowWp[wi].x - flowWp[wi - 1].x,
                                              flowWp[wi].y - flowWp[wi - 1].y,
                                              flowWp[wi].z - flowWp[wi - 1].z));
    var totalLen = segLen[segLen.length - 1] || 1;
    function _outPos(f) {
      var want = Math.max(0, Math.min(1, f)) * totalLen;
      for (var i2 = 1; i2 < flowWp.length; i2++) {
        if (want <= segLen[i2] || i2 === flowWp.length - 1) {
          var seg = (segLen[i2] - segLen[i2 - 1]) || 1;
          var lf = Math.max(0, Math.min(1, (want - segLen[i2 - 1]) / seg));
          return { x: flowWp[i2 - 1].x + (flowWp[i2].x - flowWp[i2 - 1].x) * lf,
                   y: flowWp[i2 - 1].y + (flowWp[i2].y - flowWp[i2 - 1].y) * lf,
                   z: flowWp[i2 - 1].z + (flowWp[i2].z - flowWp[i2 - 1].z) * lf };
        }
      }
      return flowWp[flowWp.length - 1];
    }

    // ══ §CPE_AIM_PIN — click-to-pin explicit look-target ═══════════════════════════════════════
    // Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md Part C. A band can now carry `lookAt:
    // {x,y,z}|null`. `_cpeBands` (module scope, set by the A.cinemaPathPlan wrapper above) is
    // fully flattened into `flowWp` by `_cinemaBandFlow` before it ever reaches this closure — no
    // band identity survives that flattening (comment at _cinemaBandFlow's own header) — so there
    // is no existing "which band is e3 in" mapping to reuse. Built once per plan, lazily, the same
    // nearest-point technique `_bandArcS`/`_hitTestPath` already use client-side (cinema_path_
    // editor.js) for the identical question, just run here against the SAME `flowWp` the walk is
    // actually sampled from (so a pin's zone is defined on the exact curve `_outPos` reads, hose
    // pulls and all — not a second, unhosed notion of "where band i is").
    //
    // Zone = the arc-fraction stretch nearer to band i's own centre than to any neighbour's — i.e.
    // the Voronoi partition of the walk by band-centre arc-fraction. This is what makes "the pin
    // always wins locally at its own band, with LOS/density resuming immediately after, no bleed
    // into neighbours" (spec's own recommendation, Part C open question 1) true by CONSTRUCTION:
    // every e3 belongs to exactly one zone, and a zone's aim is decided ONLY by its own band.
    var _pinZones = null;
    function _buildPinZones() {
      _pinZones = [];
      if (!FXS._cpeBands || !FXS._cpeBands.length) return;
      var fracs = FXS._cpeBands.map(function(b) {
        var best = 0, bd = Infinity;
        for (var pi = 0; pi < flowWp.length; pi++) {
          var dx = flowWp[pi].x - b.c.x, dy = flowWp[pi].y - b.c.y, dz = flowWp[pi].z - b.c.z;
          var d = dx * dx + dy * dy + dz * dz;
          if (d < bd) { bd = d; best = pi; }
        }
        return segLen[best] / totalLen;
      });
      for (var bi = 0; bi < FXS._cpeBands.length; bi++) {
        var lo = bi === 0 ? 0 : (fracs[bi - 1] + fracs[bi]) / 2;
        var hi = bi === FXS._cpeBands.length - 1 ? 1 : (fracs[bi] + fracs[bi + 1]) / 2;
        _pinZones.push({ lo: lo, hi: hi, lookAt: FXS._cpeBands[bi].lookAt || null, b: bi });
      }
    }
    // Read-only: the world point a pinned band at this e3 wants looked at, or null when e3 falls in
    // an unpinned band's zone (or there are no bands at all — the derived/loose-waypoint route).
    function _pinLookAtAt(e3) {
      if (_pinZones === null) _buildPinZones();
      for (var zi = 0; zi < _pinZones.length; zi++) {
        var z = _pinZones[zi];
        if (e3 >= z.lo && e3 <= z.hi) return z.lookAt;
      }
      return null;
    }
    A._cpePinZonesDebug = function() { if (_pinZones === null) _buildPinZones(); return _pinZones; };   // witness hook, read-only

    // ══ §CPE_CONE_ORIENT_ADJUST — anchored gaze corrections (2026-08-27) ═══════════════════════════
    // Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_CONE_ORIENT_ADJUST. Studied `_pinLookAtAt`
    // above before writing this: deliberately a DIFFERENT code path, not a reuse of it, because a
    // correction's anchor is NOT band-indexed — the POV cone's position is scrub-driven and may sit
    // anywhere along the walk, not necessarily at a band centre. Same NEAREST-POINT-ON-`flowWp`
    // technique `_buildPinZones` uses for a band's centre, applied to each correction's own captured
    // world anchor instead, so a correction is defined against the SAME real, hosed curve the walk is
    // actually sampled from (never a second, unhosed notion of "where along the path this is").
    //
    // Unlike a pin (a look-AT POINT, recomputed fresh every frame relative to the moving camera), a
    // correction stores a fixed captured DIRECTION — the cone's rotation at the moment the user let
    // go — and is blended in/out by an ASYMMETRIC, ARC-LENGTH-anchored envelope (spec item 5, user's
    // own design): a short ease-in ramp BEHIND the anchor, held at full strength FORWARD from the
    // anchor, then eased back down over a further decay length. Ramp/hold/decay ride on EACH entry
    // (spec item 4's own field list), copied from cinema_path_editor.js's authoring-time constants at
    // commit time — the fallbacks below only cover a malformed/pre-this-feature record.
    var _corrArc = null;
    // §CPE_CORR_BRANCH: non-null ONLY while _resolveCorrBranch() reads a stroke's entry gaze. While it
    // is set, _beat3Pose fills it with the UNCORRECTED look direction and returns immediately — which
    // is both how the probe gets the exact vector _cpeCorrDirBlend will be handed, and how the
    // re-entrant call is stopped from reaching _cpeCorrectionAt again.
    var _corrRefProbe = null;
    function _buildCpeCorrArc() {
      _corrArc = [];
      _corrSorted = null;   // §CPE_CORR_BRUSH_STROKE: the ordered view is derived from _corrArc, so a
                            // re-plan must invalidate it or a stale stroke order would outlive its edit
      if (!FXS._cpeCorrections || !FXS._cpeCorrections.length || !flowWp.length) return;
      for (var ci = 0; ci < FXS._cpeCorrections.length; ci++) {
        var c = FXS._cpeCorrections[ci];
        if (!c || !c.pos || !c.dir) continue;
        var best = 0, bd = Infinity;
        for (var pi = 0; pi < flowWp.length; pi++) {
          var dx = flowWp[pi].x - c.pos.x, dy = flowWp[pi].y - c.pos.y, dz = flowWp[pi].z - c.pos.z;
          var d = dx * dx + dy * dy + dz * dz;
          if (d < bd) { bd = d; best = pi; }
        }
        var sArc = segLen[best] / totalLen;
        // §CPE_CORR_FRACTION — reach is a SHARE OF THE WALK (rampF/holdF/decayF on the record).
        // LEGACY: records authored before 2026-09-01 carry metres (ramp/hold/decay) and are still
        // honoured by converting against this plan's own totalLen — DEGRADE, DON'T DISABLE, so a
        // saved plan keeps working without a migration. Defaults match the editor's constants.
        var L = Math.max(1e-3, totalLen);
        function _frac(fv, mv, dflt) {
          if (fv != null && isFinite(fv)) return fv;
          if (mv != null && isFinite(mv)) return mv / L;      // legacy metres
          return dflt;
        }
        _corrArc.push({ s: sArc, dir: c.dir,
          rampFrac: Math.min(0.45, _frac(c.rampF, c.ramp, 0.04)),
          holdFrac: _frac(c.holdF, c.hold, 0.12),
          decayFrac: _frac(c.decayF, c.decay, 0.18),
          refD: 0 });                       // §CPE_CORR_BRANCH — resolved just below, once per stroke
      }
      _resolveCorrBranch();
    }
    // ══ §CPE_CORR_BRANCH (2026-09-01) — PORT of §CINEMA_GAZE_SENSE onto the correction blend.
    // Implementing prompts/CINEMA_PATH_EDITOR.md §CPE_CORR_BRANCH — Witness: witness_cpe_corr_brush.js
    // G-BR-6.
    //
    // MEASURED DEFECT (Hospital, 39.43 m walk, 900 arc samples, anchor s=0.4387, ramp 4%): the naive
    // short-way yaw in _cpeCorrDirBlend below picks its 2*pi branch with round(raw / 2pi), and `raw`
    // is yawB (the authored, FIXED correction) minus yawA (the underlying pin/depth/path-follow gaze,
    // which MOVES every sample). round() is therefore a STEP FUNCTION of yawA: the sample raw crosses
    // +-pi, dYaw moves by 2*pi, and the blended yaw moves by 2*pi*w in ONE sample. Two such crossings
    // land inside the ramp on the reference plan — at w=0.1309 (predicted 47.11 deg, measured 42.16)
    // and at w=0.3424 (predicted 123.28 deg, measured 110.44). That second one IS the 111 deg snap
    // that held this branch at 6/7, against a walk whose own peak is 13.28 deg/sample. Prediction and
    // measurement differ only by the cos(pitch) foreshortening of a yaw step read as a 3-D angle.
    // The trigger is a correction authored NEAR-ANTIPODAL IN YAW to the gaze underneath it (|raw|
    // within 2 deg of 180 for ~40 consecutive samples) — precisely the case _cpeCorrDirBlend's own
    // comment declared out of scope ("never expected to be near-antipodal"). That assumption is false.
    //
    // THE FIX, identical in kind to §CINEMA_GAZE_SENSE's: resolve the branch ONCE per stroke, from the
    // geometry at the moment that stroke's blend STARTS, and then take each per-sample `raw` as the
    // representative NEAREST that reference. Constant branch => no step function => no snap. A plain
    // great-circle slerp also removes it (11.982 deg/sample measured) but was REJECTED on the numbers:
    // it swings the pitch 4.8 deg past what the uncorrected walk itself reaches in that span
    // (-81.10 vs -76.32), where this port stays inside the base envelope (-71.19). See the spec.
    //
    // The reference is the UNCORRECTED gaze at e3 = s - rampFrac, i.e. the very vector
    // _cpeCorrDirBlend is handed there — read through a one-shot re-entrant _beat3Pose probe that
    // returns BEFORE the correction step (see _corrRefProbe in _beat3Pose). Plan-time and
    // order-independent: a witness may sample e3 in any order and get the same curve.
    function _resolveCorrBranch() {
      if (!_corrArc.length) return;
      var lines = [];
      for (var i = 0; i < _corrArc.length; i++) {
        var c = _corrArc[i];
        var e3 = Math.max(0, Math.min(1, c.s - c.rampFrac));
        var probe = { x: 0, y: 0, z: 0, hit: false };
        _corrRefProbe = probe;
        try { _beat3Pose(e3); } catch (e) { probe.hit = false; } finally { _corrRefProbe = null; }
        if (!probe.hit) { c.refD = 0; lines.push(i + ':NO-PROBE'); continue; }   // degrades to the old short way
        // §CPE_AIM_DEPTH_FREEZE (2026-09-01, prompts/CINEMA_PATH_EDITOR.md §CPE_AIM_DEPTH_FREEZE):
        // KEEP the probed entry VECTOR, not just its yaw — it is the frozen from-direction for the
        // ramp+hold — and probe the window EXIT the same way for the decay's frozen target. The
        // decay then lands bit-exactly on the live gaze at the window's end (the vector was probed
        // AT that e3), so the freeze introduces no seam. MEASURED need (probe_aim_freeze.js,
        // Hospital): the live from-direction re-aims 126-140 deg INSIDE one ramp (§CPE_AIM_DEPTH
        // reacting to 0.1-0.4 m forward clearance), leaking a 13.114 deg/sample wobble through
        // (1-w); frozen fixed-to-fixed the worst step is the crossfade's own 7.79.
        c.entryDir = { x: probe.x, y: probe.y, z: probe.z };
        var e3x = Math.max(0, Math.min(1, c.s + c.holdFrac + c.decayFrac));
        var probeX = { x: 0, y: 0, z: 0, hit: false };
        _corrRefProbe = probeX;
        try { _beat3Pose(e3x); } catch (ex) { probeX.hit = false; } finally { _corrRefProbe = null; }
        c.exitDir = probeX.hit ? { x: probeX.x, y: probeX.y, z: probeX.z } : null;
        // Witness-only A/B (default OFF, same read-only-hook precedent as A._cpeCorrectionsDebug):
        // refD=0 is exactly the pre-fix naive short way, so witness_cpe_corr_brush.js can measure the
        // defect and the fix in ONE run instead of asserting a fix against a number from an older
        // session. CLAUDE.md: "every test must name the issue it proves or disproves."
        if (A._cpeCorrBranchOff) { c.refD = 0; lines.push(i + ':BRANCH-OFF(witness A/B)'); continue; }
        var yawA = Math.atan2(probe.z, probe.x), yawB = Math.atan2(c.dir.z, c.dir.x);
        var d = yawB - yawA;
        c.refD = d - 2 * Math.PI * Math.round(d / (2 * Math.PI));
        lines.push(i + ':s=' + c.s.toFixed(4) + ' entryE3=' + e3.toFixed(4) +
          ' refDeltaDeg=' + (c.refD * 180 / Math.PI).toFixed(2) +
          ' nearAntipodal=' + (Math.abs(Math.abs(c.refD) - Math.PI) < 0.35));
      }
      console.log('§CPE_CORR_BRANCH strokes=' + _corrArc.length +
        ' (branch chosen ONCE per stroke; per-sample deltas taken as the representative NEAREST it) ' +
        lines.join(' | '));
      // §CPE_AIM_DEPTH_FREEZE — the runtime's own statement of what got frozen, per stroke. A
      // stroke reporting entry=MISS (or exit=MISS) blends from the LIVE base in that phase, i.e.
      // pre-freeze behaviour — that is the degrade path, and this line is how a log reader sees it.
      var frz = [];
      for (var fi = 0; fi < _corrArc.length; fi++) {
        var fc = _corrArc[fi];
        var span = (fc.entryDir && fc.exitDir)
          ? (Math.acos(Math.max(-1, Math.min(1, fc.entryDir.x * fc.exitDir.x +
              fc.entryDir.y * fc.exitDir.y + fc.entryDir.z * fc.exitDir.z))) * 180 / Math.PI).toFixed(2)
          : 'n/a';
        frz.push(fi + ':entry=' + (fc.entryDir ? 'ok' : 'MISS') + ' exit=' + (fc.exitDir ? 'ok' : 'MISS') +
          ' entryVsExitDeg=' + span);
      }
      console.log('§CPE_AIM_DEPTH_FREEZE strokes=' + _corrArc.length +
        ' (blend-from FROZEN at the window edges: entry gaze through ramp+hold, exit gaze through decay) ' +
        frz.join(' | '));
    }
    // Read-only: the corrected DIRECTION and blend WEIGHT (0..1) in force at this e3, or null when no
    // correction's window reaches this far. §CPE_CONE_ORIENT_ADJUST item 6 (multiple overlapping
    // corrections — not user-decided): simplest reasonable MVP picked here, flagged for review — the
    // NEAREST anchor (by |e3 - s|) wins outright where more than one window covers the same e3, no
    // cross-correction blending.
    // §CPE_CORR_BRUSH_STROKE (2026-08-30 — USER RULING, replaces the decaying envelope above).
    // User: "once dragged to face an angle, its forward path should persist uniformly and gracefully
    // overriding previous cam face values… It is like a new brush stroke over an old one. 'Staying'
    // POV certainty is thus important for user to plan out an intended path."
    //
    // WHY THE OLD MODEL COULD NOT STAY, structurally rather than as a tuning miss: each correction
    // was ramp(2m) -> hold(8m) -> decay(5m), so it governed ~15m and then FADED BACK to the
    // path-follow gaze it had just been used to overrule. On the user's own 89.5m Hospital walk
    // (§CPE_WALK_BUDGET totalLen=89.53m) that is ~17% of the route; the other 83% silently reverted.
    // No hold/decay value fixes that — a decay term means "return to the old value" by definition,
    // which is the opposite of a brush stroke.
    //
    // THE MODEL NOW: strokes, ordered along the path. The LAST anchor at or before e3 owns the gaze
    // and holds it FORWARD INDEFINITELY — to the next stroke, or to the end of the walk. Arriving at
    // a stroke crossfades from whatever was in force (the previous stroke's direction, or the
    // path-follow gaze for the first one) over that stroke's own ramp, so an override is graceful
    // rather than a snap. `hold` and `decay` are therefore no longer consulted; they are left on the
    // records because saved plans carry them and a future model may want them again.
    var _corrSorted = null;
    // §CPE_CORR_BOUNDED (2026-09-01 — USER RULING, supersedes the unbounded stroke above).
    // User: "you probably can see my concern is during such editing, how to gracefully not overwrite
    // too far out. So, if u agree, we can return to before, just that it should smoothen out more
    // gracefully as it was abit abruptive before."
    //
    // So: BOUNDED again — ramp in, hold, decay out, then the gaze is path-follow's again and the
    // rest of the walk is untouched. That is what makes a correction an EDIT rather than a takeover,
    // which is the whole point while authoring.
    //
    // WHAT ACTUALLY MADE THE OLD ONE ABRUPT — the mechanism, not the tuning. Both edges were already
    // smoothstepped, and a smoothstep's peak slope is 1.5/L, so the old exit (1.5/5m = 0.30 per m)
    // was GENTLER in weight than its own entry (1.5/2m = 0.75 per m). The abruptness is not in w at
    // all: during `hold` the gaze is PINNED to a fixed world direction while the camera keeps
    // walking, so the path-follow gaze underneath drifts away the whole time. The decay then has to
    // give back every degree of that accumulated divergence over its own length. Longer hold => more
    // to undo => a harsher exit, at any decay value. Decay therefore has to scale with hold, not sit
    // at a constant, and DECAY_M is raised to match (see cinema_path_editor.js's constants).
    //
    // `hold` and `decay` are read off each record again — they were kept on the records through the
    // unbounded era precisely so this could come back without a migration.
    function _cpeCorrectionAt(e3) {
      if (_corrArc === null) _buildCpeCorrArc();
      if (!_corrArc.length) return null;
      if (_corrSorted === null) {
        _corrSorted = _corrArc.slice().sort(function (a, b) { return a.s - b.s; });
      }
      // Nearest anchor wins where two windows overlap — unchanged MVP rule from
      // §CPE_CONE_ORIENT_ADJUST item 6, still flagged as not user-decided.
      var best = null, bestD = Infinity, i, c, ramp, hold, decay, w, t;
      for (i = 0; i < _corrSorted.length; i++) {
        c = _corrSorted[i];
        ramp = Math.max(1e-9, c.rampFrac);
        hold = Math.max(0, c.holdFrac);
        decay = Math.max(1e-9, c.decayFrac);
        if (e3 < c.s - ramp || e3 > c.s + hold + decay) continue;   // outside this stroke's window
        var d = Math.abs(e3 - c.s);
        if (d < bestD) { bestD = d; best = c; }
      }
      if (!best) return null;                    // outside every window — path-follow, untouched
      ramp = Math.max(1e-9, best.rampFrac);
      hold = Math.max(0, best.holdFrac);
      decay = Math.max(1e-9, best.decayFrac);
      if (e3 < best.s) {                          // ease IN
        t = (e3 - (best.s - ramp)) / ramp;
        w = FXS._cinemaSmoothstep(Math.min(1, Math.max(0, t)));
      } else if (e3 <= best.s + hold) {           // HOLD at full authority
        w = 1;
      } else {                                    // ease OUT, back to path-follow
        t = (e3 - (best.s + hold)) / decay;
        w = 1 - FXS._cinemaSmoothstep(Math.min(1, Math.max(0, t)));
      }
      // §CPE_AIM_DEPTH_FREEZE: the frozen from-direction for this phase — entry gaze through
      // ramp+hold, exit gaze through the decay. The switch between the two happens at the hold
      // boundary, where the from-weight is zero (w=1 → the blend returns the authored direction
      // regardless), so it is continuous by construction. null → live base (edge probe failed, or
      // the witness A/B switch A._cpeAimFreezeOff is on) — exactly the pre-freeze behaviour.
      var from = null;
      if (!A._cpeAimFreezeOff) {
        from = (e3 <= best.s + hold) ? (best.entryDir || null) : (best.exitDir || null);
      }
      return { dir: best.dir, w: w, refD: best.refD || 0, from: from };   // §CPE_CORR_BRANCH: the stroke's own branch
    }
    // Generic yaw/pitch-lerp direction blend — same technique _dirBlend/_cinemaGazeBlend already use
    // in this file (linear pitch), simplified to return just a unit direction (no pivot).
    // ⚠ The original comment here claimed no antipodal bookkeeping was needed because "a corrected
    // gaze and the underlying path-follow gaze are never expected to be near-antipodal". MEASURED
    // FALSE, 2026-09-01 — that is exactly what happened, and it cost 110.44 deg in one sample. The
    // branch is now supplied by the caller as `refD`, resolved once per stroke by _resolveCorrBranch
    // above (§CPE_CORR_BRANCH). refD=0 reproduces the old plain short-way behaviour exactly, which is
    // the correct degradation for a stroke whose entry gaze could not be probed.
    function _cpeCorrDirBlend(ax, ay, az, bx, by, bz, w, refD) {
      if (w <= 0) return { x: ax, y: ay, z: az };
      if (w >= 1) return { x: bx, y: by, z: bz };
      refD = (refD != null && isFinite(refD)) ? refD : 0;
      var yawA = Math.atan2(az, ax), pitA = Math.atan2(ay, Math.hypot(ax, az));
      var yawB = Math.atan2(bz, bx), pitB = Math.atan2(by, Math.hypot(bx, bz));
      var raw = yawB - yawA;
      // §CPE_CORR_BRANCH: the representative of `raw` NEAREST this stroke's fixed reference — NOT the
      // short way, which is a step function of yawA and snaps by 2*pi*w the sample raw crosses +-pi.
      var dYaw = raw - 2 * Math.PI * Math.round((raw - refD) / (2 * Math.PI));
      var yaw = yawA + dYaw * w, pit = pitA + (pitB - pitA) * w, cp = Math.cos(pit);
      return { x: Math.cos(yaw) * cp, y: Math.sin(pit), z: Math.sin(yaw) * cp };
    }
    A._cpeCorrectionsDebug = function() { if (_corrArc === null) _buildCpeCorrArc(); return _corrArc; };   // witness hook, read-only
    // Witness hook, read-only: samples the REAL `_beat3Pose(e3)` at an arbitrary arc-fraction —
    // exactly the product function §CPE_CONE_ORIENT_ADJUST's envelope blend runs inside (same
    // precedent as `A._cpePinZonesDebug` above). Lets a witness sample the corrected region's gaze
    // SHAPE directly in the arc-fraction space the envelope is actually defined in, without needing
    // to invert tNorm -> e3 through _evenTurnRemap/_holdMap (private to this closure).
    A._cpeBeat3PoseDebug = function(e3) { return _beat3Pose(e3); };
    // §CPE_CORR_BOUNDED witness hook, read-only: the camera POSITION and its look-AT target at the
    // same e3, so a witness can measure the real gaze ANGLE in degrees — a target-point delta alone
    // cannot tell a small turn far away from a big turn nearby. Same precedent as the hook above.
    // `arcLen` lets the witness convert arc-fraction into METRES, which is the unit the ramp/hold/
    // decay constants are actually authored in.
    // _beat3Pose returns _cinemaGazeBlend's shape: POSITION in x/y/z and the look-at TARGET in
    // tx/ty/tz. Reading t.x/t.y/t.z as the target yields position === target — a zero-length gaze —
    // which is exactly the trap this hook's first cut fell into.
    A._cpeBeat3GazeDebug = function(e3) {
      var t = _beat3Pose(e3);
      // `turnOverlap`: §CINEMA_BEAT_OVERLAP's own constant, read-only — the walk's last fraction
      // blends the gaze toward the orbit AFTER the correction step, so a witness judging the pure
      // correction curve must know where that zone begins instead of hardcoding a copy of it
      // (§CPE_AIM_DEPTH_FREEZE G-FRZ-1 measured 7.48 deg of "non-constancy" on Duplex that was
      // really this hand-off, because that walk's decay tail crosses e3 = 1 - overlap).
      return { pos: { x: t.x, y: t.y, z: t.z },
               target: { x: t.tx, y: t.ty, z: t.tz }, arcLen: totalLen,
               turnOverlap: FXS.CINEMA_TURN_OVERLAP };
    };
    // §CPE_AIM_DEPTH_FREEZE witness hook, read-only: metres of clearance along the COMPOSED gaze at
    // e3 — the same ray a viewer would look along — using the product's own fan raycaster and mesh
    // set (`_cinemaFanMeshes`, "the ONLY where-is-open-space source"). This is what lets a witness
    // assert the nose-against-the-wall claim from product state instead of a witness-side mesh
    // approximation. Returns CINEMA_FAN_FAR when nothing is hit, null when it cannot judge (no
    // meshes / degenerate gaze) — a caller must treat null as INCONCLUSIVE, never as "clear".
    A._cpeGazeClearDebug = function(e3) {
      var t = _beat3Pose(e3);
      var dx = t.tx - t.x, dy = t.ty - t.y, dz = t.tz - t.z, dL = Math.hypot(dx, dy, dz);
      if (!(dL > 1e-9)) return null;
      var meshes = FXS._cinemaFanMeshes();
      if (!meshes.length) return null;
      if (!FXS._cineFanRay) { FXS._cineFanRay = new THREE.Raycaster(); FXS._cineFanRay.firstHitOnly = true; }
      FXS._cineFanRay.set(new THREE.Vector3(t.x, t.y, t.z), new THREE.Vector3(dx / dL, dy / dL, dz / dL));
      FXS._cineFanRay.far = FXS.CINEMA_FAN_FAR;
      var hits = null;
      try { hits = FXS._cineFanRay.intersectObjects(meshes, true); } catch (e) { return null; }
      return (hits && hits.length) ? hits[0].distance : FXS.CINEMA_FAN_FAR;
    };
    // ══ §CINEMA_GAZE_SENSE (2026-07-27) — decide the look-back's turn DIRECTION ONCE per plan.
    // _cinemaGazeBlend used to make this choice PER FRAME: if |dYaw| crossed CINEMA_TURN_ANTIPODAL_RAD
    // it switched from the short way to the +2π way. That test is a step function of the walk
    // direction, so the frame it flips, dYaw moves by 2π and the gaze snaps by 2π × w.
    // MEASURED, not theorised: on a 6-waypoint path the flip lands at e3=0.906, where turnW3=0.341,
    // predicting 2π × 0.341 = 123° in one frame — against 118°/frame actually measured. A latent
    // defect in shipped code that the derived 3-waypoint route simply never reached, because its
    // walk direction never crosses the threshold inside the blend window.
    // Resolving it once, from the geometry at the moment the blend STARTS, keeps the intent (a radial
    // walk-out has no defined short way, so turn the way the orbit itself turns) while making the
    // choice constant for the whole blend — which is what removes the snap.
    var _gzP = _outPos(1 - FXS.CINEMA_TURN_OVERLAP);
    var _gzA = _outPos(Math.min(1, (1 - FXS.CINEMA_TURN_OVERLAP) + 0.15));
    var _gzRaw = Math.atan2(pivot.z - _gzP.z, pivot.x - _gzP.x) -
                 Math.atan2(_gzA.z - _gzP.z, _gzA.x - _gzP.x);
    var _gzD = _gzRaw;
    while (_gzD > Math.PI) _gzD -= 2 * Math.PI;
    while (_gzD < -Math.PI) _gzD += 2 * Math.PI;
    // The reference delta: short way, with the original antipodal rule applied ONCE here.
    var _gazeRefD = (Math.abs(_gzD) >= FXS.CINEMA_TURN_ANTIPODAL_RAD)
      ? ((_gzRaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
      : _gzD;
    console.log('§CINEMA_GAZE_SENSE refDeltaDeg=' + (_gazeRefD * 180 / Math.PI).toFixed(1) +
      ' antipodal=' + (Math.abs(_gzD) >= FXS.CINEMA_TURN_ANTIPODAL_RAD) +
      ' (branch chosen once; per-frame deltas are taken as the representative NEAREST this)');

    // The spin's destination bearing: the FIRST leg of the route out, so the spin ends looking
    // exactly where the walk begins (no seam between the two beats).
    var firstLeg = outWp.length > 1 ? outWp[1] : exitOuter;
    // §CINEMA_SPIN_BASELINE (2026-07-27): a BEARING needs a horizontal baseline. The next waypoint
    // is normally the door, metres away across the floor, so this is fine — but with §CPE_BANDS the
    // next waypoint is the settle band's own far end, which can be short and near-vertical. Measured
    // on Terminal, whose walk-out climbs ~17m with x/z barely moving: the spin ended on a bearing
    // derived from a ~0m horizontal baseline, disagreeing with the bearing Beat 3 immediately adopts,
    // and the Beat2→3 seam jumped 27 deg in one frame at e3=0.011.
    // Same guard, same 0.5m, same meaning as the look-ahead collapse test below — when there is no
    // horizontal baseline, aim at the point the walk actually looks at as it begins, which makes the
    // seam continuous by construction rather than by tuning. A normal door-length first leg is
    // untouched, so the derived film is unchanged.
    if (Math.hypot(firstLeg.x - settle.x, firstLeg.z - settle.z) < 0.5) {
      firstLeg = _outPos(0.15);
      console.log('§CINEMA_SPIN_BASELINE first leg has no horizontal baseline — spin aims at the ' +
        'walk-start look-ahead instead (' + firstLeg.x.toFixed(2) + ',' + firstLeg.z.toFixed(2) + ')');
    }
    var spinTo = Math.atan2(firstLeg.z - settle.z, firstLeg.x - settle.x);
    // §CPE_SEAM_CONTINUOUS — the direction the walk opens on, sampled here (before the beat
    // seconds) because _openDir/_openDeg below are derived from it. Same look-ahead point and same
    // 0.5m collapse guard Beat 3 itself uses at e3=0, so this is the walk's real opening gaze, not
    // a second guess at it (asserted below against _beat3Pose(0), the pose that actually flies).
    // NOTE: the spin does NOT pay for the pitch — see the _spinDeg comment below for why that was
    // tried, measured, and reverted.
    var _wkP0 = _outPos(0), _wkA0 = _lookAhead(_wkP0, 0);   // ONE look-ahead rule, shared with Beat 3
    var _wkDy = _wkA0.y - _wkP0.y;
    var _wkL = Math.hypot(_wkA0.x - _wkP0.x, _wkDy, _wkA0.z - _wkP0.z) || 1;
    var dYaw = spinTo - yaw0;
    while (dYaw > Math.PI) dYaw -= 2 * Math.PI;
    while (dYaw < -Math.PI) dYaw += 2 * Math.PI;
    // §CINEMA_SPIN_MOTIVATED (2026-07-20 Phase 2 spec — replaces the old "always extend small
    // angles into a full lap" rule): a turn must be MOTIVATED, never forced. User: "if it is facing
    // the nearest exit, [skip the spin, glide straight there]... if the nearest is behind then turn
    // around to it, helps shows around the place." Three cases, by how far off yaw0 already is from
    // the exit's own approach bearing:
    //   - already facing it (within CINEMA_FACING_SKIP_DEG) → no turn at all, dYaw=0. Beat 2 still
    //     plays for its time budget but with no rotation — a graceful settle, not a forced spin.
    //   - roughly BEHIND (beyond CINEMA_BEHIND_DEG) → turn the LONG way around, since a longer sweep
    //     IS what "helps shows around the place" for this case.
    //   - anywhere in between → turn directly, no artificial extension.
    //
    // §CPE_SPIN_WHIP (2026-08-01, user: "reduce the spin whip in the end to be not more than 360
    // degrees") — the behind branch USED to read `dYaw += sign(dYaw) * 2*PI`, i.e. the short way
    // PLUS a whole extra lap: |raw| + 360, which for this class (|raw| in (120,180]) is 480..540
    // degrees. That is the measured 523/534 whip, and it is what the DIVE->SPIN seam report ("it was
    // coming out of the dive towards the edge") localised to. The genuine long way around is the
    // OPPOSITE DIRECTION, not one more lap: |360 - raw|, which lands in [180,240) for this class.
    // Three properties, all checked by witness_cpe_spin_whip.js:
    //   - it ends on the IDENTICAL bearing (yaw0+dYaw === spinTo mod 2PI), so _handYaw/_handDir —
    //     both of which go through cos/sin — are unchanged and Beat 3 still starts exactly where it
    //     did. This is a whip fix, NOT a re-aim (G-SW-3).
    //   - it is still LONGER than the short way for every angle in the class, so
    //     §CINEMA_SPIN_MOTIVATED's "if the nearest is behind then turn around to it" survives
    //     intact — the fix must not degrade into the short turn (G-SW-2).
    //   - the 360 ceiling is now STRUCTURAL, not a clamp: no branch can emit more. `capped` below
    //     is an assertion that cannot trip, printed so the invariant is visible rather than assumed.
    var CINEMA_FACING_SKIP_DEG = 20, CINEMA_BEHIND_DEG = 120;
    var _dYawRawSigned = dYaw;                       // the short way, before any class rewrites it
    var dYawAbsDeg = Math.abs(dYaw) * 180 / Math.PI;
    if (dYawAbsDeg < CINEMA_FACING_SKIP_DEG) {
      dYaw = 0;
    } else if (dYawAbsDeg > CINEMA_BEHIND_DEG) {
      dYaw -= (dYaw >= 0 ? 1 : -1) * 2 * Math.PI;
    }
    var _spinCapped = Math.abs(dYaw) > 2 * Math.PI + 1e-9;
    // The SIGNED short-way angle is logged alongside the unsigned one so "the fix did not move the
    // end bearing" is directly checkable from the log: (rawSigned - final) must be an exact multiple
    // of 360 in every class that spins at all (G-SW-3).
    console.log('§CINEMA_SPIN dYawRawSignedDeg=' + (_dYawRawSigned * 180 / Math.PI).toFixed(1) +
      ' dYawRawDeg=' + dYawAbsDeg.toFixed(1) + ' class=' +
      (dYawAbsDeg < CINEMA_FACING_SKIP_DEG ? 'already-facing(no-spin)' : dYawAbsDeg > CINEMA_BEHIND_DEG ? 'behind(long-way)' : 'direct-turn') +
      ' finalSpinDeg=' + (dYaw * 180 / Math.PI).toFixed(1) +
      ' ceilingDeg=360 capped=' + _spinCapped);

    // ══ The exterior act — SHAPE depends on whether the Sun-crossing falls in the first or second
    // half of the loop (2026-07-20 Phase 3 spec, user): "a different angle outside will determine
    // if the Sun reflect is happening first or last. If first stay eye level to catch the reflect.
    // Then raise cam to see from above the closing sec rotation of the building. If last, then rise
    // gracefully but catch the reflecting Sun to end, which last 2 sec should slow down not abrupt
    // stop." exitAz (hence swoopU) is an emergent consequence of the chosen exit, itself driven by
    // where the user started/faced — this IS the "angle of start correlates dynamically" lever. ══
    var exitAz = Math.atan2(exitOuter.z - pivot.z, exitOuter.x - pivot.x);
    var sunAz = A.sun ? Math.atan2(A.sun.position.z - pivot.z, A.sun.position.x - pivot.x) : exitAz + Math.PI;
    var lookdownTilt = Math.max(tiltMin, Math.min(tiltMax, FXS.CINEMA_LOOKDOWN_DEG * Math.PI / 180));
    var flatTiltRad = THREE.MathUtils.degToRad(FXS.CINEMA_FLAT_TILT_DEG);
    // §CINEMA_PATH_EDITOR: the stop row stretches the orbit elastically. The radius band still
    // clamps the result — that band is what keeps the building framed at all (too close clips, too
    // far is a speck), so a stretch is honoured WITHIN it, never in place of it. Both the requested
    // and the granted value are logged, so a clamp is visible in the log instead of silently
    // swallowing what the user dragged.
    var orbitRadiusWant = fillDistance * cpeOrbitScale;
    var orbitRadius = Math.max(radiusMin, Math.min(radiusMax, orbitRadiusWant));
    if (_civJ) orbitRadius = _civJ.r;   // §ALTC_V2 V4: the junction's own radius (heads' spread + 15 m), a close-up
    if (cpeOrbitScale !== 1 || cpeOrbitDY !== 0)
      console.log('§CINEMA_ORBIT_ELASTIC scale=' + cpeOrbitScale.toFixed(3) +
        ' requested=' + orbitRadiusWant.toFixed(1) + ' granted=' + orbitRadius.toFixed(1) +
        ' band=[' + radiusMin.toFixed(1) + ',' + radiusMax.toFixed(1) + ']' +
        ' clamped=' + (Math.abs(orbitRadius - orbitRadiusWant) > 0.05) + ' dY=' + cpeOrbitDY.toFixed(2) + 'm');

    // ══ Beat boundaries, in normalized time. Fixed SECONDS, so a longer film gets a longer orbit,
    // never a longer dive (§CINEMA_SIMPLE: the dive is time-boxed at 4s and must not be clamped).
    // Computed BEFORE _orbitPose because loopSec (needed to convert the swoop/hold/descent SECONDS
    // constants into this act's own u-domain) depends on tR, and _orbitPose(0) is called immediately
    // after to seed the Beat 4 handoff target. ═══════════════════════════════════════════════════
    // ══ §CPE_PACING — every beat's length is a measured distance or angle over a stated rate.
    // The pull-back is the recede from where the walk ends to the final orbit radius, which is the
    // "pull back from near to the final orbit distance" the user asked for — paced by that real
    // distance instead of a fixed 2s.
    var _pullNearR = Math.hypot(exitOuter.x - pivot.x, exitOuter.z - pivot.z);
    var _pullDist = Math.max(0, orbitRadius - _pullNearR);
    // ⚠ diveDist and dYaw are properties of WHERE THE USER WAS STANDING, not of the building —
    // measured LTU_AHouse: a 746m approach and a 522° spin, because the camera happened to be far
    // out and facing away. Pacing them raw made the runtime depend on the user's pose (LTU came out
    // at 93.6s, of which 37.3s was dive and 11.6s spin), which contradicts the whole point: the
    // total is supposed to fall out of the BUILDING's size. So both are bounded by building-derived
    // quantities — the approach is capped at the envelope, the spin at a half turn (the most that is
    // ever needed to face anywhere) — and only then converted at their stated rates.
    // §CPE_TURN_BUDGET (user, 2026-07-27: "where sudden diff is adverse noise impact and introduce
    // frames to smoothen"). The walk's seconds were derived from DISTANCE alone, so a route that
    // turns 496 deg and one that turns 90 deg over the same metres got the same frame count.
    //
    // Why redistribution alone could never fix this: with N frames fixed, mean turn per frame is
    // Θ/N whatever the parameterization does — §CPE_EVEN_TURN can move WHERE the turning falls but
    // not how much there is per frame on average. MEASURED on Hospital: 495.8 deg over ~122 walk
    // frames = 4 deg/frame mean against a peak of 20, with the speed function already saturated at
    // both rails. Redistribution cannot beat its own mean; only more frames can.
    //
    // So the same noise ratio pays twice: it sets speed WITHIN the walk (the cost parameterization)
    // and it buys the walk's TIME here. Sudden difference ⇒ more frames to smooth it, which is the
    // user's rule stated directly. No new constant — rotation is charged at CINEMA_TURN_DPS, the
    // rate the spin and the orbit lap already turn at, so a degree of turning costs the same
    // wherever it occurs.
    function _walkTurnDeg() {
      var N = 60, prev = null, prevD = null, deg = 0;
      for (var q = 0; q <= N; q++) {
        var p = _outPos(q / N);
        if (prev) {
          var dx = p.x - prev.x, dy = p.y - prev.y, dz = p.z - prev.z;
          var L = Math.hypot(dx, dy, dz);
          if (L > 1e-6) {
            var d = { x: dx / L, y: dy / L, z: dz / L };
            if (prevD) deg += Math.acos(Math.max(-1, Math.min(1,
              d.x * prevD.x + d.y * prevD.y + d.z * prevD.z))) * 180 / Math.PI;
            prevD = d;
          }
        }
        prev = p;
      }
      return deg;
    }
    var _diveEff = Math.min(diveDist, envelope);
    // §ALTC_V3 (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §ALTC_V3): a road film's approach is a fast fly-in, not 25 s over a
    // finished road (measured v2: picture change ~3.5 for 0-25 s, 0 pieces added) — its SECONDS are capped at CIVIL_DIVE_MAX_M of travel.
    if (_civilPace && _diveEff > FXS.CIVIL_DIVE_MAX_M) { console.log('§ALTC_V3 approach capped ' + _diveEff.toFixed(0) + 'm → ' + FXS.CIVIL_DIVE_MAX_M + 'm of seconds'); _diveEff = FXS.CIVIL_DIVE_MAX_M; }
    // ══ §CPE_NOISE_LAW (user, 2026-07-27: "the speed of dive to the wp1 is still not using noise
    // ratio" / "it governs thrughout"). The noise ratio is not a walk feature — it is the film's
    // one pacing law, and until now Beat 3 was the only beat that obeyed it. Measured before this
    // change: Hospital's dive/orbit cover 253 m in a 2 s window while its walk covers 1.0 m
    // (witness_cpe_gaze_spin S3), i.e. the beats OUTSIDE the walk ran on a clock with no noise term
    // at all.
    //
    // Busyness = the fraction of the fan that hits ANYTHING within its own range. Open sky reads 0,
    // a room reads 1. It is a DENSITY, not the fan MIN that was retired for the courtyard bug, and
    // it introduces NO new constant: the rays and the range are _cinemaFan's own.
    //
    // ⚠ NOT the ray fan. Two measured reasons, both from this session:
    //   1. The fan is HORIZONTAL only (`_cinemaFan`: dir.set(cos,0,sin)) — a camera 100 m up has
    //      nothing beside it, so a descent reads as empty however busy the building below is.
    //   2. It can be BLIND. On Terminal in the headless rig `_cinemaFanMeshes()` returns ZERO
    //      meshes, so every ray reports the CINEMA_FAN_FAR sentinel and the whole dive measured
    //      0.000 — and §CINEMA_SPACE fell back to bbox-centre for the same reason. A no-hit is not
    //      a measurement (§CPE_LIVE's standing rule).
    // The user's own answer (2026-07-27): "isnt it best to use the bbxes to smell out the frame
    // rate". `element_transforms` is DB truth, always loaded, deterministic on every machine, and
    // it cannot go blind. Counted in IFC space so the 48k rows are never converted — one sample
    // point is converted instead (A.three2ifc).
    var _densPts = null;
    function _densPoints() {
      if (_densPts) return _densPts;
      _densPts = [];
      try {
        // guid appended as a 4th element (index 3) — every existing reader only ever indexes 0/1/2,
        // so this is additive. §CPE_AIM_DEPTH_BUILDUP candidate 2 was its only reader (cross-
        // referencing a point against §CPE_BUILDUP's per-element completion time, tmGuidEndTs()) and
        // is gone with §CPE_AIM_DEPTH_RETIRED, 2026-09-02. The column is KEPT rather than dropped:
        // it costs one extra SELECT column on a query that already runs once per plan, and removing
        // it would change the row SHAPE that §CPE_NOISE_LAW's readers index into.
        var rows = A.dbQuery('SELECT center_x, center_y, center_z, guid FROM element_transforms');
        for (var i = 0; i < rows.length; i++) _densPts.push(rows[i]);
      } catch (e) {}
      return _densPts;
    }
    // How many elements are within one fan-horizon of this point. CINEMA_FAN_FAR is reused as the
    // neighbourhood radius rather than inventing a second range constant.
    // The radius must be commensurate with how far the BEAT travels. MEASURED: a fixed
    // CINEMA_FAN_FAR (60m) neighbourhood is constant across a 12-36m walk — the walk's noise series
    // came out maxChange=0 on BOTH buildings, i.e. the term was inert and Terminal's 2.27s crawl
    // was untouched. Half the beat's own travel is the natural scale (the neighbourhood turns over
    // roughly once across the beat), capped at the fan horizon so a 250m dive does not read the
    // whole site as one blur. Derived from the path, not picked.
    function _noiseRadius(travel) { return Math.max(3, Math.min(FXS.CINEMA_FAN_FAR, travel / 2)); }
    function _densityAt(p, R) {
      var pts = _densPoints();
      if (!pts.length || typeof A.three2ifc !== 'function') return 0;
      var rr = R || FXS.CINEMA_FAN_FAR;
      var q = A.three2ifc(p.x, p.y, p.z), R2 = rr * rr, n = 0;
      for (var i = 0; i < pts.length; i++) {
        var dx = pts[i][0] - q.ix, dy = pts[i][1] - q.iy, dz = pts[i][2] - q.iz;
        if (dx * dx + dy * dy + dz * dz < R2) n++;
      }
      return n;
    }

    // ══ §CPE_AIM_DEPTH_RETIRED (2026-09-02) — path-follow is now the ONLY automatic gaze rule ═══
    // Spec: bim-compiler prompts/RESUME_2026-09-02_FILM_REVIEW.md §AIM_DEPTH_RETIREMENT (the spec
    // and the quantified loss are written there; this is the marker, not a re-derivation).
    //
    // REMOVED, not disabled: _aimCells/_aimGridFrom/_aimGrid (§CPE_AIM_GRID), _bkGuidEnds/
    // _aimGuidEnds/_aimPlacedPoints/_aimBuildupCursorAt (§CPE_AIM_DEPTH_BUILDUP candidate 2),
    // _AIM_DEPTH_* constants, _aimForwardClear, _aimDepthWeight, _aimDepthSubject (with its
    // §CPE_AIM_DEPTH_VERTICALITY zSpan test), _aimLatch (§CPE_AIM_LATCH), _aimDepthSeries/
    // _aimDepthBuild/_aimDepthAt (§CPE_AIM_DEPTH_SERIES), A._probeAimDepth, _aimDepthApply (with
    // §CPE_AIM_DEPTH_OPEN_TAPER and §CPE_AIM_DEPTH_SCALE). `_densPoints`/`_densityAt`/`_noiseRadius`
    // above STAY — §CPE_NOISE_LAW is their real owner and never depended on this rule.
    //
    // USER DIRECTIVE, twice, verbatim (2026-09-02): "its best to leave alone its pointing along its
    // path as more intuitive when pathing and user change of head at intended better angles is all
    // needed, to stay simple and predictable" and "I prefer the previous ... as it follows path
    // direction."
    //
    // ⚠ THIS IS A POLICY CHANGE WITH A KNOWN COST, NOT A CLEANUP. §CPE_AIM_DEPTH was the SOLE
    // exception to path-follow from 2026-08-14 (§CPE_AIM_SIMPLIFY, PR #1344, which retired
    // §CPE_AIM_DENSITY). What is lost: at a genuine dead end the camera now faces the wall instead
    // of turning toward the open space. That tail is real but it is the SMALL part of what the rule
    // did — from its own shipped formula, clearM = clamp(envelope*0.06, 3, 8) = 8.0 m on Hospital
    // and w = 1 - smoothstep(fwdClear/clearM), so HALF the rule's authority was already spent at
    // 4 m of forward clearance, i.e. in an ordinary corridor. Measured before removal: Hospital
    // 28/91 probes firing, gaze turned 83.45 deg; HHS_Office 65/65 probes active, maxBlend 0.74,
    // 478/487 samples with blend > 0. It was a "something within 8 m" rule, and indoors almost
    // everything is within 8 m — which is exactly the deviation from path direction the user
    // objected to. This SUPERSEDES the standing "KEEP, but freeze inside a correction window"
    // recommendation at prompts/CINEMA_PATH_EDITOR.md §CPE_AIM_DEPTH.
    //
    // §CPE_AIM_DEPTH_FREEZE (#1598) and §CPE_CORR_BRANCH (#1597) are DELIBERATELY KEPT — both
    // REDUCE camera movement (110.44 deg single-frame snap fixed; in-window motion 13.114 -> 7.791
    // deg/sample) and neither is an aim rule of its own. The freeze becomes a near-no-op on a pure
    // path-follow base but still guards a moving from-direction where a correction window overlaps
    // a pinned Voronoi zone or the §CPE_SEAM_CONTINUOUS _openU blend. Do not remove it as "dead".
    //
    // What still moves the gaze, in the order _beat3Pose applies it: (1) path-follow, the walk's own
    // arc-length look-ahead (_lookAhead, _AH_FRAC = 0.15); (2) §CPE_SEAM_CONTINUOUS's _openU blend
    // off the spin; (3) §CPE_AIM_PIN, a pinned band's Voronoi zone, which overrides path-follow
    // outright — the user's own authored head-turn, and the mechanism they named as "all needed";
    // (4) the authored correction window (§CPE_CONE_ORIENT_ADJUST ramp/hold/decay); (5)
    // §CINEMA_BEAT_OVERLAP's hand-off to the orbit. Beats 1/2 and the closing orbit are untouched
    // by construction — they never called this rule.

    // ⚖ USER RULING 2026-07-27, SETTLED — do not re-derive, do not reintroduce a density term:
    //   "20% density, 80% noise ie rate of change"  →  then, final: "i would say its 100% rate of
    //   change of bbxes".
    // Their reason, verbatim: "because if frame not changing, not matter how dense the animation is
    // not moving makes a boring show". Density is NOT the signal: a dense corridor the camera
    // slides along without the view changing is a still, and lingering on it is the boredom, not
    // the craft. The signal is how fast the bbox neighbourhood CHANGES along the path — so the
    // brake fires at a roofline, a doorway, a wall crossing, and releases on a static frame however
    // full it is. Charging cost by it makes metres-per-frame fall exactly where the change is, so
    // the content crossing the frame per frame comes out EVEN: change is the integrand, even noise
    // is the invariant.
    // ⚖ And the saturation question, asked and answered by the user in the same breath: "when
    // outside building it changes as the building is far off, or it hits the max ... the
    // surrounding panaroma rate of change is consistent for formula. We are in a range, thus no
    // worry." Outside, the signal either flattens (nothing entering the neighbourhood) or pins at
    // the max — and BOTH are harmless because the cost multiplier is bounded by PACE_SWING either
    // way. So there is deliberately NO outside/inside special case, no panorama branch, and no
    // clamp beyond the one the range already provides. Do not add one.
    var NOISE_W_DENSITY = 0, NOISE_W_CHANGE = 1;
    // The dive is a straight LERP, so its arc and its gaze turn are both uniform in e — the blended
    // distance+turn cost that paces the walk is the IDENTITY here and can do nothing. Busyness is
    // the only term that varies along a dive, which is exactly why the user could still see this
    // beat ignoring the law. Cost per metre = 1 + (SWING-1)·busy, so the emptiest stretch runs at
    // most PACE_SWING times the speed of the busiest: the same single dial, the same provable
    // bound, no second knob.
    var _DV_N = 64, _dvC = null, _diveBusy = 0;
    (function _diveNoiseBuild() {
      var i, j, dens = [], series = [];
      var _dvR = _noiseRadius(Math.hypot(settle.x - camPos0.x, settle.y - camPos0.y, settle.z - camPos0.z));
      for (i = 0; i < _DV_N; i++) {
        var e = (i + 0.5) / _DV_N;
        dens.push(_densityAt({ x: camPos0.x + (settle.x - camPos0.x) * e,
                               y: camPos0.y + (settle.y - camPos0.y) * e,
                               z: camPos0.z + (settle.z - camPos0.z) * e }));
      }
      // Rate of change = the central difference of the density series. Both channels are
      // normalised by their OWN maximum, which is what makes this a RATIO (the user's word) rather
      // than a count with a machine-dependent scale — an empty dive and a dense one both span 0..1.
      var chg = [], dMax = 0, cMax = 0;
      for (i = 0; i < _DV_N; i++) {
        var a = dens[Math.max(0, i - 1)], b = dens[Math.min(_DV_N - 1, i + 1)];
        chg.push(Math.abs(b - a));
        if (dens[i] > dMax) dMax = dens[i];
        if (chg[i] > cMax) cMax = chg[i];
      }
      var c = [0], sum = 0, ns = 0, nMax = 0, nMin = 1;
      for (i = 0; i < _DV_N; i++) {
        var noise = NOISE_W_DENSITY * (dMax > 0 ? dens[i] / dMax : 0) +
                    NOISE_W_CHANGE  * (cMax > 0 ? chg[i] / cMax : 0);
        if (i % 8 === 0 || i === _DV_N - 1) series.push(((i + 0.5) / _DV_N).toFixed(2) + ':' + noise.toFixed(2));
        ns += noise; if (noise > nMax) nMax = noise; if (noise < nMin) nMin = noise;
        sum += 1 + (FXS.CINEMA_PACE_SWING - 1) * noise;
        c.push(sum);
      }
      if (sum > 1e-9) for (j = 0; j <= _DV_N; j++) c[j] /= sum;
      _dvC = c; _diveBusy = ns / _DV_N;
      var bMin = nMin, bMax = nMax;
      // The delivered speed ratio along the dive, stated as a number rather than claimed: the
      // emptiest sample runs (1+(SWING-1)·bMax)/(1+(SWING-1)·bMin) times faster than the busiest.
      // meshes= is the first thing to read when meanBusy is 0.000: MEASURED on Terminal in the
// headless rig, _cinemaFanMeshes() returns ZERO meshes, so every fan reports the CINEMA_FAN_FAR
      // sentinel, every §CINEMA_SPACE candidate reads enclosed=0%, and the settle falls back to
      // bbox-centre. A busyness of 0 then means "the fan is blind", NOT "the scene is empty" —
      // exactly the §CPE_LIVE rule that a no-hit is not a measurement. The law is inert there by
      // construction (a flat cost table is the identity remap), which is the correct behaviour, but
      // it must be visible rather than look like a passing measurement.
      console.log('§CPE_NOISE_LAW beat=dive src=bbox elems=' + _densPoints().length +
        ' w=' + NOISE_W_DENSITY + '/' + NOISE_W_CHANGE + ' (density/change)' +
        ' meanNoise=' + _diveBusy.toFixed(3) +
        ' busy=' + bMin.toFixed(2) + '..' + bMax.toFixed(2) + ' samples=' + _DV_N +
        ' swing=' + FXS.CINEMA_PACE_SWING +
        ' deliveredRange=' + ((1 + (FXS.CINEMA_PACE_SWING - 1) * bMax) / (1 + (FXS.CINEMA_PACE_SWING - 1) * bMin)).toFixed(2) + 'x' +
        ' series=[' + series.join(' ') + ']' +
        ' — frames spaced by busyness-weighted distance; the dive seconds below are bought by the same number');
    })();
    // Monotone inverse of the dive's cost table — same shape as _evenTurnRemap, one table each.
    function _diveRemap(u) {
      if (!_dvC) return u;
      u = Math.max(0, Math.min(1, u));
      var lo = 0, hi = _DV_N;
      while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (_dvC[mid] <= u) lo = mid; else hi = mid; }
      var c0 = _dvC[lo], c1 = _dvC[hi], f = (c1 - c0 > 1e-12) ? (u - c0) / (c1 - c0) : 0;
      return (lo + Math.max(0, Math.min(1, f))) / _DV_N;
    }
    // §CPE_WALK_BUDGET_NOISE_BLIND (2026-08-01, user: "it shuld be controlled by that noise-speed
    // ratio we setup before to govern thruout"). The walk's SECONDS must see the same content-change
    // signal §CPE_NOISE_LAW already computes for the walk's FRAME SPACING (_evenTurnBuild below) —
    // not a new probe, the SAME central-difference-of-density measurement _densityAt/_noiseRadius
    // already give the dive, just evaluated here because _natSec (next block) needs the scalar
    // before it exists anywhere else.
    //
    // ⚠ Cannot call _beat3Pose(e) directly for this, despite it being the primitive named in the
    // correction — MEASURED by reading, not in the debugger: _beat3Pose reads _openU and _handDir,
    // and both are assigned INSIDE the block this IIFE runs before (_natSec needs _useSec.out, which
    // needs _natSec.out, which is what this scalar feeds). Calling it early would run its gaze blend
    // against two undefined values. It is not needed anyway: _cinemaGazeBlend returns x/y/z UNCHANGED
    // from the position it was given (see its `return { x: px, y: py, z: pz, ... }`), so
    // _beat3Pose(e).x/y/z is byte-identical to _outPos(e).x/y/z for every e — _outPos alone gives the
    // same positions this probe needs, and it has no such dependency (defined at L5005, before any of
    // this). Radius uses `totalLen` (the walk's own travel, already computed) rather than the 240-
    // sample arc length _evenTurnBuild measures later — the same choice the dive already makes
    // (_diveNoiseBuild above uses ITS OWN straight-line travel, not a beat-later refinement of it).
    var _wnkN = 32, _walkBusy = 0, _walkBusyProbes = null;
    (function _walkNoiseBuild() {
      var q, nz = [], nzC = [], nzMax = 0, rad = _noiseRadius(totalLen), _wpPos = [];
      for (q = 0; q <= _wnkN; q++) { var _wp = _outPos(q / _wnkN); _wpPos.push({ x: _wp.x, z: _wp.z }); nz.push(_densityAt(_wp, rad)); }
      for (q = 0; q <= _wnkN; q++) {
        var lo = nz[Math.max(0, q - 1)], hi = nz[Math.min(_wnkN, q + 1)];
        nzC.push(Math.abs(hi - lo));
        if (nzC[q] > nzMax) nzMax = nzC[q];
      }
      if (nzMax > 0) {
        var sum = 0;
        for (q = 0; q < nzC.length; q++) sum += nzC[q];
        _walkBusy = (sum / nzC.length) / nzMax;
      }
      // §ALTC_PANELS: the same probes, exported per position (0..1), so the road panels read THIS busyness, not a second one
      _walkBusyProbes = { pos: _wpPos, v: nzC.map(function(c) { return nzMax > 0 ? c / nzMax : 0; }) };
      console.log('§CPE_NOISE_LAW beat=walk-budget src=bbox probes=' + (_wnkN + 1) +
        ' radius=' + rad.toFixed(1) + 'm elems=' + _densPoints().length +
        ' meanBusy=' + _walkBusy.toFixed(3) + ' maxChange=' + nzMax +
        ' swing=' + FXS.CINEMA_PACE_SWING +
        ' — the walk SECONDS below are bought by this number, the same signal that already spaces its frames');
    })();
    // ⚠ §CPE_SEAM_CONTINUOUS — DO NOT add a pitch term to _spinDeg. It was tried this session and
    // reverted: pricing the walk's opening pitch into the spin makes the spin's DURATION depend on
    // the authored path, which shifts every beat fraction before it and breaks G2's "an edit
    // changes nothing before it". _spinDeg stays yaw-only, and the pitch handoff is paid inside the
    // WALK instead (see _beat3Pose's opening blend). This comment previously described the reverted
    // version as if it had shipped — it had not.
    // §CPE_SEAM_CONTINUOUS — the direction the walk WANTS to open on, and the direction the spin
    // actually hands over (level, on the spin's final bearing). The gap between them was being paid
    // in ONE frame at the Beat2->3 seam: MEASURED 81 deg on Terminal, and it did NOT shrink when
    // sampled at 100x density, so it was a true discontinuity that no pacing could ever spread.
    // It is closed inside the WALK (see _beat3Pose) rather than inside the spin, because the walk
    // already owns thousands of frames while the spin's length is derived from its own yaw — paying
    // for it in the spin would make the spin's DURATION depend on the authored path, which shifts
    // every beat fraction before it and breaks G2's "an edit changes nothing before it".
    var _openDir = { x: (_wkA0.x - _wkP0.x) / _wkL, y: _wkDy / _wkL, z: (_wkA0.z - _wkP0.z) / _wkL };
    // §CPE_SPIN_WHIP defect 2 — this used to read `Math.min(180, ...)`. The cap WAS the defect: the
    // spin flew 523 degrees and was billed for 180, the fourth instance of the budget-on-one-number /
    // motion-on-another family (§CPE_HOSE_LENGTH_BLIND, §CPE_WALK_BUDGET_NOISE_BLIND, the dive's
    // envelope cap). Removing it cannot produce a runaway now that defect 1 bounds the motion at 360
    // structurally: the old worst case was 523/45 = 11.6s, the new one is 240/45 = 5.3s.
    var _spinDeg = Math.abs(dYaw) * 180 / Math.PI;
    // §CPE_SPIN_WHIP defect 3 — the spin was the LAST beat with no noise term, in a law the user
    // settled as "it governs thrughout" (§CPE_NOISE_LAW). The dive and the walk below both carry
    // `* (1 + (SWING-1)*busy)`; the spin did not.
    //
    // The measurement problem this solves: the spin TRANSLATES ZERO METRES, so _densityAt(settle) is
    // a constant and the dive's line-probe shape cannot be reused as-is — sampling the same point 32
    // times reads maxChange=0 and the term is inert (the exact failure _noiseRadius' own comment
    // records for the walk at a fixed 60m radius). What DOES change is the neighbourhood the gaze
    // sweeps THROUGH. So probe the ARC exactly as the dive probes its line: points on a ring around
    // `settle` at the bearings the spin actually passes through, same _densityAt, same normalised
    // mean |central difference|, same CINEMA_PACE_SWING dial. No new constant.
    //
    // The radius is the EXISTING rule (_noiseRadius = half the beat's own travel, capped at the fan
    // horizon) applied to the spin's own travel — the arc the gaze sweeps at the fan horizon,
    // |dYaw| * CINEMA_FAN_FAR. Derived from the beat, not picked: a 20-degree turn reads a tight
    // neighbourhood, a 240-degree sweep reads out to the horizon.
    var _SPN_N = 32, _spinBusy = 0, _spinRad = _noiseRadius(Math.abs(dYaw) * FXS.CINEMA_FAN_FAR);
    (function _spinNoiseBuild() {
      if (Math.abs(dYaw) < 1e-6) return;   // no-spin class: no arc to probe, busy stays 0
      var q, nz = [], nzC = [], nzMax = 0;
      for (q = 0; q <= _SPN_N; q++) {
        var th = yaw0 + dYaw * (q / _SPN_N);
        nz.push(_densityAt({ x: settle.x + Math.cos(th) * _spinRad, y: settle.y,
                             z: settle.z + Math.sin(th) * _spinRad }, _spinRad));
      }
      for (q = 0; q <= _SPN_N; q++) {
        var lo = nz[Math.max(0, q - 1)], hi = nz[Math.min(_SPN_N, q + 1)];
        nzC.push(Math.abs(hi - lo));
        if (nzC[q] > nzMax) nzMax = nzC[q];
      }
      if (nzMax > 0) {
        var sum = 0;
        for (q = 0; q < nzC.length; q++) sum += nzC[q];
        _spinBusy = (sum / nzC.length) / nzMax;
      }
      console.log('§CPE_NOISE_LAW beat=spin-budget src=bbox-arc probes=' + (_SPN_N + 1) +
        ' radius=' + _spinRad.toFixed(1) + 'm elems=' + _densPoints().length +
        ' meanBusy=' + _spinBusy.toFixed(3) + ' maxChange=' + nzMax +
        ' swing=' + FXS.CINEMA_PACE_SWING +
        ' — the spin translates 0m, so its rate-of-change is read along the ARC the gaze sweeps');
    })();
    var _spinBusyMult = 1 + (FXS.CINEMA_PACE_SWING - 1) * _spinBusy;
    // ══ §CPE_STICK_HOLD — a per-stick dwell, in seconds ═════════════════════════════════════════
    // User, 2026-08-01: "putting hold at 1 sec (put that as default for the last stick) will teach
    // them 'ah, it slows a sec stop a sec, then ease out while the cam is turning to the building'".
    //
    // AUTHORED TIME. Collected here, BEFORE the noise multiplier is applied to the walk below, and
    // added AFTER it — a hold is a number the user typed, so scaling it by measured busyness would
    // make the panel lie about its own field. This is the §CPE_HOSE_LENGTH_BLIND family's rule
    // (budget one number, motion another) applied before it can bite a fifth time.
    // §CPE_SETTLE_HOLD (2026-08-04): band 0 ("settle" — where the dive lands, before the walk
    // begins) is excluded here and read separately below for the SPIN beat instead. It used to be
    // swept into this loop like every other band, which put its typed seconds into `out` (the
    // WALK's duration) — a number added somewhere the camera never visibly pauses, while the
    // ACTUAL settle pause was a fixed, unconfigurable floor (CINEMA_SPIN_MIN_SEC) the user's Hold
    // field had no effect on at all. `_holds`/`_holdTotal` now cover only the interior walk
    // (bands 1..N-1, including "stop" — the walk's own end point, unlike "settle").
    var _holds = [], _holdTotal = 0;
    if (FXS._cpeBands && FXS._cpeBands.length >= 2) {
      for (var _hb = 1; _hb < FXS._cpeBands.length; _hb++) {
        var _hv = +(FXS._cpeBands[_hb].hold || 0);
        if (isFinite(_hv) && _hv > 0.01) {
          _holds.push({ band: _hb, sec: _hv, c: FXS._cpeBands[_hb].c });
          _holdTotal += _hv;
        }
      }
    }
    var _settleHoldSec = (FXS._cpeBands && FXS._cpeBands.length && isFinite(+FXS._cpeBands[0].hold)) ? Math.max(0, +FXS._cpeBands[0].hold) : 0;
    var _walkTurnDegVal = _walkTurnDeg();
    // ══ §CPE_DISCIPLINE_REVEAL_PULLOUT — the pull-out + repeated-lap restructure (2026-08-14) ═════
    // Spec: bim-compiler prompts/CINEMA_DISCIPLINE_REVEAL.md, dated section "pull-out restructure".
    // Supersedes the there-and-back Mechanism C shape: NO backward retrace. Camera arrives at the
    // last stick (tO, end of round 1), does a brief pull-out (tP), then flies the SAME path again
    // forward (round 2, tV), then the disc-parade tail — folded into the EXISTING rise beat's own
    // time budget, not a separate beat (see _natSec.rise below and poseAt). A.cpeRevealDiscsPresent
    // (outer scope) is shared with cinema_path_editor.js's own duration estimate (_naturalDuration)
    // — one discipline-count implementation, not two kept in sync by hand.
    var _revealPulloutSec = 0, _revealFlybackSec = 0, _revealRoundSec = 0, _revealTailSec = 0, _revealDiscs = [], _revealQtyCost = {};
    if (FXS._cpeReveal) {
      _revealDiscs = A.cpeRevealDiscsPresent();
      if (_revealDiscs.length) {
        // Pull-out: fixed 1.5s (CINEMA_REVEAL_PULLOUT_SEC, author's call — see the constant's own
        // comment). §CPE_DISCIPLINE_REVEAL_FLYBACK (2026-08-16, bim-compiler prompts/
        // CINEMA_DISCIPLINE_REVEAL.md's dated section): retraces the SAME walked path backward
        // (f:1->0) at CINEMA_PULLBACK_MPS ("flying, not walking" — reused, not a new speed invented)
        // to smooth the old teleport-cut back onto the first stick. Round 2: same pace as the
        // outbound walk, ONE lap forward only — no there-and-back, no authored holds replayed
        // (matches the original Mechanism C's own "not requested" note). Tail: ~2s/discipline + a
        // final 2s all-together — KEPT (see spec file's dated section for why the all-together slot
        // was kept rather than dropped: the user asked for it repeatedly elsewhere in this file's
        // own history, e.g. the ORIGIN ask and the Mechanism B pacing quote).
        // §ALTC_ONEWAY (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md 2g, user 2026-10-05: "one way where buildup then reveal
        // same … below 3 mins and 3 hrs"): a road film is ONE drive — no pull-out, no fly-back, no second lap (zero-width
        // tP=tF=tV=tO, the shipped reveal-off geometry). The disc-parade tail below stays (rise beat). Buildings unchanged.
        _revealPulloutSec = _civilPace ? 0 : FXS.CINEMA_REVEAL_PULLOUT_SEC;
        _revealFlybackSec = _civilPace ? 0 : totalLen / _pullMps;
        _revealRoundSec = _civilPace ? 0 : totalLen / _walkMps;
        if (_civilPace) console.log('§ALTC_ONEWAY reveal one-way (civil): pullout/flyback/round2 = 0, tail kept');
        _revealTailSec = _civilPace ? 0 : 2 * _revealDiscs.length + 2;   // §ALTC_V2 V6: the road's parade plays IN the drive
        _revealQtyCost = A.cpeRevealDiscQtyCost ? A.cpeRevealDiscQtyCost(_revealDiscs) : {};
        console.log('§CPE_REVEAL_ROUND on pulloutSec=' + _revealPulloutSec.toFixed(1) + ' flybackSec=' +
          _revealFlybackSec.toFixed(1) + ' round2Sec=' + _revealRoundSec.toFixed(1) + ' tailSec=' +
          _revealTailSec.toFixed(1) + ' discs=[' + _revealDiscs.join(',') + '] shell=[' + A.cpeRevealShellDiscs().join(',') + '] totalSec=' +
          (_revealPulloutSec + _revealFlybackSec + _revealRoundSec + _revealTailSec).toFixed(1));
      } else {
        console.log('§CPE_REVEAL_ROUND skipped — no discipline outside the shell [' + A.cpeRevealShellDiscs().join(',') + '] present in this building');
      }
    }
    var _natSec = {
      // §CPE_NOISE_LAW, second half — the same ratio that spaces the frames also BUYS the seconds
      // ("where sudden diff is adverse noise impact and introduce frames to smoothen", the user's
      // rule). A dive that ends deep inside a busy building buys up to PACE_SWING times the seconds
      // of one that drops into an empty yard; redistribution alone could never do this, because with
      // the frame count fixed the mean speed is fixed whatever the parameterization does.
      // §CPE_WALK_BUDGET_NOISE_BLIND CORRECTION (2026-08-01) — this used to say the walk already got
      // this treatment "via _walkTurnDeg". It did not: _walkTurnDeg prices GEOMETRY (degrees turned),
      // not CONTENT (rate of change), so two equal-length equal-turning walks through empty and dense
      // areas billed identically. `out` below now carries the same `* (1 + (SWING-1)*busy)` factor
      // the dive uses, with busy = _walkBusy from _walkNoiseBuild above.
      dive:  Math.max(FXS.CINEMA_DIVE_MIN_SEC, _diveEff / _diveMps * (1 + (FXS.CINEMA_PACE_SWING - 1) * _diveBusy)),
      // §CPE_SPIN_WHIP — the angle ACTUALLY flown (no 180 cap), at the same rate every other turn in
      // the film is charged, times the same noise multiplier the dive and walk carry.
      // §CPE_SETTLE_HOLD (2026-08-04, corrected): no floor at all — real turn time plus whatever the
      // user typed into the Settle band's Hold field (`_settleHoldSec` above). Both zero -> 0s beat.
      spin:  (_spinDeg / FXS.CINEMA_TURN_DPS * _spinBusyMult) + _settleHoldSec,
      // §CPE_WALK_BUDGET_NOISE_BLIND — same shape as the dive above, one law every beat. The `/3`
      // that used to inflate the turn charge as a stand-in for busyness is GONE: a degree now costs
      // CINEMA_TURN_DPS, exactly as the comment above _walkTurnDeg already claims, and busyness
      // (measured, not assumed) does the job the `/3` was faking.
      // §CPE_STICK_HOLD: `+ _holdTotal` sits OUTSIDE the multiplier on purpose — travel is priced by
      // the noise law, a typed hold is priced at face value. Amends §CINEMA_PATH_EDITOR_MODEL rule 9
      // ("constant speed"): speed is constant EXCEPT at authored holds, which is the point of them.
      out:   (totalLen / _walkMps + _walkTurnDegVal / FXS.CINEMA_TURN_DPS) *
             (1 + (FXS.CINEMA_PACE_SWING - 1) * _walkBusy) + _holdTotal,
      // §CPE_DISCIPLINE_REVEAL_PULLOUT: none of pullout/flyback/reveal(round2)/tail are ever part
      // of the user-typed total-seconds override system (no field for any of them in the panel) —
      // always these measured values, computed just above, 0 when off/empty.
      pullout: _revealPulloutSec,
      flyback: _revealFlybackSec,       // §CPE_DISCIPLINE_REVEAL_FLYBACK: retrace back to the first stick
      reveal: _revealRoundSec,          // round 2's own seconds — the repeated forward lap only
      tail:   _revealTailSec,           // folded into `rise` below, not its own beat boundary
      rise:  Math.max(0.5, _pullDist / _pullMps),
      orbit: 360 / FXS.CINEMA_TURN_DPS
    };
    var _natTotal = _natSec.dive + _natSec.spin + _natSec.out + _natSec.pullout + _natSec.flyback +
                    _natSec.reveal + _natSec.tail + _natSec.rise + _natSec.orbit;
    // Whitebox proof for §CPE_WALK_BUDGET_NOISE_BLIND — every term the formula reads, printed
    // together so a witness can recompute `out` from this line alone and compare against
    // _natSec.out, rather than trusting the arithmetic happened as claimed.
    console.log('§CPE_WALK_BUDGET_NOISE_BLIND totalLen=' + totalLen.toFixed(2) + 'm walkMps=' + _walkMps +
      ' turnDeg=' + _walkTurnDegVal.toFixed(1) + ' turnDps=' + FXS.CINEMA_TURN_DPS +
      ' travelSec=' + (totalLen / _walkMps).toFixed(3) + ' turnSec=' + (_walkTurnDegVal / FXS.CINEMA_TURN_DPS).toFixed(3) +
      ' rawSec=' + (totalLen / _walkMps + _walkTurnDegVal / FXS.CINEMA_TURN_DPS).toFixed(3) +
      ' busy=' + _walkBusy.toFixed(3) + ' swing=' + FXS.CINEMA_PACE_SWING +
      ' busyMult=' + (1 + (FXS.CINEMA_PACE_SWING - 1) * _walkBusy).toFixed(4) +
      ' outSec=' + _natSec.out.toFixed(3));
    // §CPE_SPIN_WHIP — the same whitebox treatment the walk got: every term the spin's budget reads,
    // printed together, so a witness recomputes spinSec from THIS LINE ALONE and compares against
    // _natSec.spin rather than trusting the arithmetic happened as claimed. `flownDeg` is the angle
    // the camera actually turns (was capped at 180 while the motion ran to 523 — the whole defect),
    // so `flownDeg == |finalSpinDeg| from §CINEMA_SPIN` is itself a checkable invariant.
    console.log('§CPE_SPIN_WHIP flownDeg=' + _spinDeg.toFixed(1) + ' ceilingDeg=360' +
      ' turnDps=' + FXS.CINEMA_TURN_DPS + ' rawSec=' + (_spinDeg / FXS.CINEMA_TURN_DPS).toFixed(3) +
      ' busy=' + _spinBusy.toFixed(3) + ' swing=' + FXS.CINEMA_PACE_SWING +
      ' busyMult=' + _spinBusyMult.toFixed(4) + ' minSec=0(no-floor) settleHoldSec=' + _settleHoldSec.toFixed(3) +
      ' spinSec=' + _natSec.spin.toFixed(3));
    // An explicit override (the editor's "set the total") scales the whole film uniformly; the SHAPE
    // is geometric either way, so the beat fractions are derived-seconds over the natural total and
    // do not depend on durationSec at all. That is what makes "key 20s and everything speeds up
    // uniformly" true by construction.
    var _useSec = FXS._cpeSecOverride
      ? { dive: FXS.CINEMA_DIVE_SEC, spin: FXS.CINEMA_SPIN_SEC, out: FXS.CINEMA_OUT_SEC, rise: FXS.CINEMA_RISE_SEC,
          orbit: _natSec.orbit, reveal: _natSec.reveal, pullout: _natSec.pullout,
          flyback: _natSec.flyback, tail: _natSec.tail }
      : _natSec;
    // The pose Beat 2 ends on: level, on the spin's final bearing. Beat 3 must START here.
    var _handYaw = yaw0 + dYaw;
    var _handDir = { x: Math.cos(_handYaw), y: 0, z: Math.sin(_handYaw) };
    var _openDeg = Math.acos(Math.max(-1, Math.min(1,
      _handDir.x * _openDir.x + _handDir.y * _openDir.y + _handDir.z * _openDir.z))) * 180 / Math.PI;
    // How much of the walk the handoff needs, at the project's OWN established turn rate
    // (CINEMA_TURN_DPS — the rate the spin and the orbit lap already use). Not a new constant, and
    // not a fraction picked to make a gate green: it is "how long a graceful turn of this size
    // takes", expressed as a share of the walk's own seconds.
    var _openU = Math.min(1, (_openDeg / FXS.CINEMA_TURN_DPS) / Math.max(1e-6, _useSec.out));
    console.log('§CPE_SEAM_CONTINUOUS openDeg=' + _openDeg.toFixed(1) + ' openU=' + _openU.toFixed(4) +
      ' (~' + (_openU * _useSec.out).toFixed(2) + 's of the ' + _useSec.out.toFixed(1) +
      's walk) handoffYawDeg=' + (_handYaw * 180 / Math.PI).toFixed(1));
    // §CPE_DISCIPLINE_REVEAL_PULLOUT — the tail's seconds fold into the RISE beat's SHAPE budget
    // (`_riseFolded`, used only for `_shapeTotal`/tR below) without ever mutating `_useSec.rise`
    // itself. This is what makes the tail's slow-down "blend into" the EXISTING pull-back/rise
    // motion (spec's own words) instead of inventing a second camera behaviour: poseAt's Beat 4
    // branch runs the SAME unmodified _beat4Pose/_cinemaEaseFloored formula across the now-larger
    // [tV,tR] span, so the SAME pull-back distance is covered over MORE time — average speed is
    // measurably, continuously lower for exactly as long as captions are cycling (never frozen —
    // "not pause"), then the beat naturally regains its normal pace for the true rise/orbit hand-off.
    // ⚠ BUG FOUND WHILE TRACING THIS (not shipped): mutating `_useSec.rise` in place — the first cut
    // of this fold — silently poisoned the round-trip the editor depends on. `plan.sec.rise` feeds
    // cinema_path_editor.js's `s.baseSec.rise`, which `_buildOverride()` echoes straight back as the
    // NEXT plan's `riseSec` override; on every REOPEN of an already-saved reveal=ON path (the plan
    // handed to the editor already has _cpeReveal true, per `A._cinemaPathEdit`), that echoed value
    // would already be folded, and folding it AGAIN here double-counts the tail — measurably growing
    // the rise beat on every re-edit. `_riseFolded` keeps the fold entirely local to `_shapeTotal`/tR;
    // `_useSec.rise` (and therefore `sec.rise`/`naturalSec.rise`) stays the TRUE unfolded pull-back
    // budget always, safe to round-trip through the override channel any number of times.
    var _riseFolded = _useSec.rise + (_useSec.tail || 0);
    // §107.1 (user, 2026-09-13: "Push back the path time range if not sufficient within the lull") —
    // GROW THE PULL-BACK when the lull in front of the orbit cannot hold the weighted reveal slots.
    // Stealing from the neighbouring beats was tried first and does not generalise: HHS's reveal,
    // flyback and pullout budgets are ALL 0s, so there was nothing behind the pull-back to take.
    // The pull-back's own share of the film is what has to grow. Solving
    //     rise / (shapeWithoutRise + rise) = wantRealSec / durationSec
    // for rise gives rise = k*S0/(1-k), which lands the window on exactly wantRealSec of film. The
    // film's total length does not change — the other beats keep their shape seconds and therefore
    // play proportionally faster, which is the trade this ruling accepts. Capped at RISE_GROW_MAX of
    // the shape so a building with many storeys cannot swallow the film, and logged either way.
    var RISE_GROW_MAX = 0.45;
    var _riseGrown = null, _riseKept = null, _stealSec = 0;
    try {
      var _rl = (typeof A.storeyRevealList === 'function' && A.storeyRevealList()) || [];
      if (_civilPace && _rl.length) { console.log('§ALTC_V2 storey pull-back growth skipped (road film: the bridge storeys are not the subject) storeys=' + _rl.length); _rl = []; }
      if (_rl.length && durationSec > 0) {
        var _cn = _rl.map(function (x) { return x.n || 0; }).filter(function (x) { return x > 0; }).sort(function (a, b) { return a - b; });
        var _cm = _cn.length ? (_cn.length % 2 ? _cn[(_cn.length - 1) / 2] : (_cn[_cn.length / 2 - 1] + _cn[_cn.length / 2]) / 2) : 0;
        // §110 — ask for the GENEROUS window: the base sweep at its ceiling (2 x the 1.5s floor),
        // scaled by each storey's quantity weight. _fitList then solves the actual base down from
        // this if the film could not afford all of it, so this is a request, not a promise.
        var _SWEEP_MAX = 3.0;
        var _W = _SWEEP_MAX + 0.5;                                 // the ground-slab pass
        _rl.forEach(function (g) { _W += Math.max(1.5, _SWEEP_MAX * (_cm > 0 ? (g.n || 0) / _cm : 1)) + 0.5; });
        // §107.2 (user, 2026-09-13: "if U can steal time from prior to the lull ie mid pull out, it
        // be good effect for smoothness" + "Taking up path time as it is, not lengthening the movie
        // duration") — STEAL BEFORE GROWING. The window may run back through the beats that feed the
        // orbit (reveal, then flyback, then pullout) at no cost to anything: those seconds are
        // already in the film and the camera is already drifting through them, so the reveal simply
        // starts earlier inside the same pull-out. Only the SHORTFALL past that lull is taken by
        // growing the pull-back's share, which is the part that makes every other beat play faster.
        // Hospital has a real pullout+flyback and so pays little or nothing; HHS measures 0s for all
        // three, which is why it still has to grow.
        // §128.8 (user, 2026-09-14): the window may not reach back past the pull-back proper. The
        // parade's tail and the round-2 lap are another system's time, so NOTHING is taken from the
        // lull any more: the pull-back's own share grows (film length unchanged, the other beats play
        // proportionally faster, capped), and whatever still does not fit is met by compressing the
        // sweeps in _fitList — never by truncating storeys. `window.__srIgnoreRunway` restores the
        // pre-ruling reach for the falsifiability control only.
        var _lullAll = (_useSec.reveal || 0) + (_useSec.flyback || 0) + (_useSec.pullout || 0);
        var _lull = window.__srIgnoreRunway ? _lullAll : 0;
        var _S0 = _useSec.dive + _useSec.spin + _useSec.out + _useSec.orbit +
                  (_riseFolded - _useSec.rise) + (window.__srIgnoreRunway ? 0 : _lullAll);
        var _k = Math.min(RISE_GROW_MAX, _W / durationSec);
        var _extWant = _k * _S0 / (1 - _k);          // total extendable seconds the window needs
        var _riseWant = _extWant - _lull;            // what is left once the lull is spent
        _stealSec = Math.min(_lull, Math.max(0, _extWant - _useSec.rise));
        if (_riseWant > _useSec.rise) {
          _riseGrown = { from: _useSec.rise, to: _riseWant, wantRealSec: _W, lull: _lull, steal: _stealSec };
          _riseFolded += (_riseWant - _useSec.rise);
          _useSec.rise = _riseWant;
        } else if (_stealSec > 0) {
          _riseKept = { rise: _useSec.rise, lull: _lull, steal: _stealSec, wantRealSec: _W };
        }
      }
    } catch (eRG) { _riseGrown = null; }
    var _shapeTotal = _useSec.dive + _useSec.spin + _useSec.out + _useSec.pullout + _useSec.flyback +
                       _useSec.reveal + _riseFolded + _useSec.orbit;
    if (_riseKept) {
      console.log('§STOREY_REVEAL_STEAL pullbackShapeSec=' + _riseKept.rise.toFixed(2) +
        ' lullBehindSec=' + _riseKept.lull.toFixed(2) + '(reveal+flyback+pullout)' +
        ' stolenSec=' + _riseKept.steal.toFixed(2) + ' wantRealSec=' + _riseKept.wantRealSec.toFixed(2) +
        ' pullbackGrewBy=0.00 (§107.2 — the window runs back into the pull-out; no other beat is' +
        ' sped up, the film keeps its length and its pacing)');
    }
    if (_riseGrown) {
      console.log('§STOREY_REVEAL_RISE_GROW lullBehindSec=' + _riseGrown.lull.toFixed(2) +
        '(reveal+flyback+pullout, all spent first) stolenSec=' + _riseGrown.steal.toFixed(2) +
        ' pullbackShapeSec=' + _riseGrown.from.toFixed(2) + '->' +
        _riseGrown.to.toFixed(2) + ' wantRealSec=' + _riseGrown.wantRealSec.toFixed(2) +
        ' durationSec=' + durationSec.toFixed(1) + ' shapeTotal=' + _shapeTotal.toFixed(2) +
        ' newRiseFrac=' + (_useSec.rise / _shapeTotal).toFixed(4) + ' cap=' + RISE_GROW_MAX +
        ' (§107.1 — the pull-back grows so the reveal gets its weighted slots; the film keeps its' +
        ' length, the other beats play proportionally faster)');
    }
    var tD = _useSec.dive / _shapeTotal;
    var tS = tD + _useSec.spin / _shapeTotal;
    var tO = tS + _useSec.out / _shapeTotal;
    // §CPE_DISCIPLINE_REVEAL_PULLOUT: tP is the pull-out sub-beat's own end boundary.
    // §CPE_DISCIPLINE_REVEAL_FLYBACK (2026-08-16): tF is the fly-back's own end boundary — the
    // instant the camera is back on the first stick, replacing the old teleport cut that used to
    // sit right at tP. tV is round 2's own end boundary (the SECOND arrival at the last stick — the
    // real "STOP", per the spec). useSec.pullout/flyback/reveal are all 0 when off or when the
    // building has no non-ARC/STR discipline, which makes tP===tF===tV===tO exactly — every poseAt
    // branch below becomes zero-width and unreachable, and tR (below) folds in a 0 tail too, so an
    // off/empty-building film is byte-identical to before this feature existed (Guardrail 2).
    var tP = tO + _useSec.pullout / _shapeTotal;
    var tF = tP + _useSec.flyback / _shapeTotal;
    var tV = tF + _useSec.reveal / _shapeTotal;
    var tR = tV + _riseFolded / _shapeTotal;   // folded (includes the tail) — see _riseFolded above
    // §STOREY_HIGHLIGHT_REVEAL (bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md, 2026-09-06, user
    // correction) — CORRECTED WINDOW. First cut of this feature filled the whole `orbit` beat
    // (tR..1); the user's actual instruction is "final 5 seconds ending before orbit", i.e. the
    // LAST 5 REAL SECONDS of the `pullback` beat (`_useSec.rise`, the un-folded pull-back budget —
    // NOT `_riseFolded`, which also contains the disc-parade tail; using the folded value would let
    // the window bleed into the tail's own caption/visual zone). `_shapeTotal` is the SAME
    // denominator tD/tS/.../tR are all computed against, so dividing by it turns "5 real seconds"
    // into a fraction that stays correct under any user re-timing (§CPE_SEC_OVERRIDE) without this
    // function ever needing `durationSec` again downstream. `Math.min(_useSec.rise, ...)` clamps to
    // the whole pullback beat on a building whose pullback is naturally shorter than 5s, so the
    // window can never bleed backward into the tail beat either.
    // §STOREY_REVEAL_WINDOW_SEC widened 5->10 (2026-09-10, user: "seems to wait too long...
    // rather uneventful or redundant repeat" / "they enjoy a bit more stay rather than rush
    // thru"). MEASURED on Hospital: the authored pullback beat is 30.8s, so a 5s window left
    // ~25.8s of pullback playing before any highlight started, and truncated the 8 real storeys
    // down to 5 (MIN_SLOT_SEC=1.0 in cpe_storey_reveal.js). 10s halves the dead lead-in and, at
    // 1.0s/storey minimum, comfortably fits all 8 without truncation (1.25s each) — still clamped
    // to the whole pullback beat below on a building whose pullback is naturally shorter.
    var STOREY_REVEAL_WINDOW_SEC = 10;
    // §104 (user, 2026-09-13: "Too fast, mandatory 1.5s to reveal each storey") — the window is now
    // SIZED BY THE BUILDING rather than fixed. A storey's slot is 1.5s sweep + 0.5s pause = 2.0s, so
    // the window it needs is groups x 2.0 REAL FILM seconds, and §103's grouping is what makes that
    // affordable (Hospital 8 passes -> 6). Fixed 10s was the §92.4 defect twice over: at 8 storeys it
    // gave 1.25s slots (1.13s sweeps, the "too fast"), and once the slot budget became a real 2.0s it
    // TRUNCATED the top group away instead — dropping Level 6+{7A,7}, so the building never topped
    // out. Converted back into SHAPE seconds via _shapeTotal/durationSec, the same two quantities
    // §STOREY_REVEAL_WINDOW_REAL_SEC below already reconciles, and still clamped to the pullback beat
    // so it can never bleed into the tail. Hospital: 6 x 2.0 = 12.0s real out of a 30.8s pullback.
    var _revealSlotSec = 2.0;                       // CUT_SWEEP_SEC + CUT_PAUSE_SEC, cpe_storey_reveal.js
    var _revealGroups = 0, _revealList = [];
    try { _revealList = (typeof A.storeyRevealList === 'function' && A.storeyRevealList()) || []; _revealGroups = _revealList.length; } catch (eG) { _revealGroups = 0; }
    // §106 — one extra slot at the front for the ground slab's own pass.
    // §107 — and the slots are WEIGHTED by element quantity, so the window has to ask for the same
    // sum cpe_storey_reveal.js's _fitList will compute: each storey's sweep is CUT_SWEEP_SEC scaled
    // by its element count against the median, floored at CUT_SWEEP_SEC, plus a pause each. Asking
    // for a flat (n+1) x 2.0 here would hand _fitList a window it then has to shrink every sweep to
    // fit, which is exactly the "rushed" symptom the weights exist to remove.
    var _revealSweepSec = 1.5, _revealPauseSec = 0.5;
    var _cnts = _revealList.map(function (x) { return x.n || 0; }).filter(function (x) { return x > 0; }).sort(function (a, b) { return a - b; });
    var _cMedE = _cnts.length ? (_cnts.length % 2 ? _cnts[(_cnts.length - 1) / 2] : (_cnts[_cnts.length / 2 - 1] + _cnts[_cnts.length / 2]) / 2) : 0;
    // §110 — the SAME generous request the rise-grow block above solved for, or the window frac ends
    // up sized off the old 1.5s-floor figure and the grown pull-back is wasted. One base, both places.
    var _revealSweepMax = 2 * _revealSweepSec;
    var _wantRealSec = STOREY_REVEAL_WINDOW_SEC;
    if (_revealGroups > 0) {
      _wantRealSec = _revealSweepMax + _revealPauseSec;                 // the ground-slab pass
      _revealList.forEach(function (g) {
        var r = _cMedE > 0 ? (g.n || 0) / _cMedE : 1;
        _wantRealSec += Math.max(_revealSweepSec, _revealSweepMax * r) + _revealPauseSec;
      });
    }
    var _wantShapeSec = (durationSec > 0 && _shapeTotal > 0) ? _wantRealSec * (_shapeTotal / durationSec) : _wantRealSec;
    // §107.1 (user, 2026-09-13: "Push back the path time range if not sufficient within the lull") —
    // the window may now extend EARLIER than the pull-back beat when the pull-back alone cannot hold
    // the weighted slots, eating backward into the `reveal` beat rather than truncating storeys or
    // rushing every sweep. HHS is the case that needs it: a 2.7s(shape) pull-back cannot hold four
    // passes at any speed. Still bounded — it can reach back through `reveal` and no further, so the
    // beats before it keep their own captions and visuals.
    // HHS measured 2026-09-13: its `reveal` beat is 0s, so rise+reveal gave nothing to push back into
    // and Level 3 truncated anyway. The lull in front of the orbit is the pull-back AND the beats
    // that feed it — reveal, then flyback, then pullout — so the window may reach back through all
    // three. It still stops before the round-2 walk, which has its own captions and cues.
    // §107.2 — the window may reach back through the lull that feeds the orbit, on top of whatever
    // the pull-back itself holds. _riseFolded/_shapeTotal above have already settled by this point.
    var _revealCap = window.__srIgnoreRunway
      ? _useSec.rise + (_useSec.reveal || 0) + (_useSec.flyback || 0) + (_useSec.pullout || 0)
      : _useSec.rise;                                   // §128.8 — the pull-back proper, nothing behind it
    var _storeyRevealWindowSec = Math.min(_revealCap, _wantShapeSec);
    console.log('§STOREY_REVEAL_RUNWAY pullbackShapeSec=' + _useSec.rise.toFixed(2) +
      ' paradeTailShapeSec=' + (_useSec.tail || 0).toFixed(2) + ' wantShapeSec=' + _wantShapeSec.toFixed(2) +
      ' usedShapeSec=' + _storeyRevealWindowSec.toFixed(2) +
      ' startsAfterParadeTail=' + (_storeyRevealWindowSec <= _useSec.rise + 1e-9) +
      ' compressBy=' + (_wantShapeSec > 0 ? Math.min(1, _storeyRevealWindowSec / _wantShapeSec).toFixed(3) : '1.000') +
      (window.__srIgnoreRunway ? ' CONTROL(__srIgnoreRunway: pre-ruling reach into the parade)' : '') +
      ' (§128.8 — the reveal opens only after the parade has restored; a short runway compresses the sweeps, it never lengthens the film)');
    if (_storeyRevealWindowSec > _useSec.rise) {
      console.log('§STOREY_REVEAL_PUSHBACK pullbackSec=' + _useSec.rise.toFixed(2) +
        '(shape) wantShapeSec=' + _wantShapeSec.toFixed(2) + ' capShapeSec=' + _revealCap.toFixed(2) +
        ' usedShapeSec=' + _storeyRevealWindowSec.toFixed(2) +
        ' extendsBackBy=' + (_storeyRevealWindowSec - _useSec.rise).toFixed(2) + 's(shape)' +
        ' beatsBehind=reveal:' + (_useSec.reveal || 0).toFixed(2) + ' flyback:' + (_useSec.flyback || 0).toFixed(2) +
        ' pullout:' + (_useSec.pullout || 0).toFixed(2) +
        ' (§107.1 — the pull-back alone could not hold the weighted slots)');
    }
    console.log('§STOREY_REVEAL_WINDOW_FIT groups=' + _revealGroups + ' slotSec=' + _revealSlotSec +
      ' wantRealSec=' + _wantRealSec.toFixed(2) + ' wantShapeSec=' + _wantShapeSec.toFixed(2) +
      ' pullbackSec=' + _useSec.rise.toFixed(1) + ' usedShapeSec=' + _storeyRevealWindowSec.toFixed(2) +
      (_wantShapeSec > _revealCap ? ' CLAMPED at the pull-back — the sweeps compress to fit (§128.8), no storey is dropped'
                                  : ' fits, no compression') +
      ' (§104 — the window is sized by the building, not a constant)');
    var _storeyRevealWindowFrac = _shapeTotal > 0 ? _storeyRevealWindowSec / _shapeTotal : 0;
    // §STOREY_REVEAL_WINDOW_REAL_SEC (2026-09-11, MEP_CLASH_REVEAL_MOVIE.md §60.2). `windowSec` above
    // is in SHAPE seconds (`_useSec.rise`, whose denominator is `_shapeTotal`) — it is NOT the number
    // of film seconds the window occupies once the plan is re-paced to `durationSec`. On the real
    // 2026-09-11 HHS bake those two disagreed by 49%: this line printed `windowSec=2.7` while
    // cpe_storey_reveal.js's own `§STOREY_REVEAL_FIT windowSec=4.03` (windowFrac x durationSec) was
    // the one the film actually played — confirmed frame-by-frame, 4 slots of 1.01s. Under this
    // lane's Log Mandate that is a real defect: §STOREY_REVEAL_WINDOW is the FIRST line a session
    // reads about this feature (§59.6c had to go find the FIT number instead). So print the real
    // film seconds too, from the same `durationSec` the very next console.log already uses.
    var _storeyRevealRealSec = _storeyRevealWindowFrac * durationSec;
    console.log('§STOREY_REVEAL_WINDOW pullbackSec=' + _useSec.rise.toFixed(1) +
      ' windowSec=' + _storeyRevealWindowSec.toFixed(1) + '(shape)' +
      ' realWindowSec=' + _storeyRevealRealSec.toFixed(2) + '(film, =windowFrac*durationSec ' +
      durationSec.toFixed(1) + 's — THIS is the one §STOREY_REVEAL_FIT slices into slots)' +
      ' windowFrac=' + _storeyRevealWindowFrac.toFixed(4) +
      ' orbitStartFrac(rise)=' + tR.toFixed(4) +
      ' windowStartFrac=' + (tR - _storeyRevealWindowFrac).toFixed(4) +
      ' — last ' + _storeyRevealWindowSec.toFixed(1) + 's(shape) of pullback, ending exactly where orbit begins');
    console.log('§CINEMA_PACING natural=' + _natTotal.toFixed(1) + 's = dive ' + _natSec.dive.toFixed(1) +
      ' + spin ' + _natSec.spin.toFixed(1) + ' + walk ' + _natSec.out.toFixed(1) +
      ' + pullout ' + _natSec.pullout.toFixed(1) + ' + flyback ' + _natSec.flyback.toFixed(1) +
      ' + round2 ' + _natSec.reveal.toFixed(1) + ' + tail ' + _natSec.tail.toFixed(1) +
      ' + pullback ' + _natSec.rise.toFixed(1) + ' + orbit ' + _natSec.orbit.toFixed(1) +
      '  (walk ' + totalLen.toFixed(1) + 'm @' + _walkMps + 'm/s, dive ' + diveDist.toFixed(1) +
      'm @' + _diveMps + 'm/s, pullback ' + _pullDist.toFixed(1) + 'm @' + _pullMps +
      'm/s, dive raw ' + diveDist.toFixed(0) + 'm capped to envelope ' + _diveEff.toFixed(0) +
      'm, spin ' + _spinDeg.toFixed(0) + 'deg flown @' + FXS.CINEMA_TURN_DPS + 'deg/s x' +
      _spinBusyMult.toFixed(2) + ' busy)' +
      ' override=' + FXS._cpeSecOverride + ' running=' + durationSec.toFixed(1) + 's');
    console.log('§CINEMA_BEATS dive=' + tD.toFixed(3) + ' spin=' + tS.toFixed(3) + ' out=' + tO.toFixed(3) +
      ' pullout=' + tP.toFixed(3) + ' flyback=' + tF.toFixed(3) + ' round2=' + tV.toFixed(3) +
      ' rise=' + tR.toFixed(3) + ' turnOverlap=' + FXS.CINEMA_TURN_OVERLAP +
      ' (dur=' + durationSec.toFixed(1) + 's) route=' + outRoute +
      ' waypoints=' + outWp.length + ' pathLen=' + totalLen.toFixed(1) +
      ' spinDeg=' + Math.round(dYaw * 180 / Math.PI));

    var loopSec = Math.max(1e-3, (1 - tR) * durationSec);
    var swoopU = (((sunAz - exitAz) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI);
    var sunFirst = swoopU < 0.5;
    var flatHoldU = Math.min(0.45, FXS.CINEMA_FLAT_HOLD_SEC / loopSec);
    var descentMinU = Math.min(0.30, FXS.CINEMA_DESCENT_MIN_SEC / loopSec);
    var climbMinU = Math.min(0.30, FXS.CINEMA_CLIMB_MIN_SEC / loopSec);
    var entryTilt, holdU = 0, descentStartU = 1, holdStartU = 1, climbStartU = 0, climbEndU = 0, caughtSun;

    if (sunFirst) {
      // Start FLAT (catch the reflection right away — the camera is flat from u=0 straight through
      // the crossing, not just an instant), THEN climb once to the look-down for the remainder,
      // ending ELEVATED. No flat-ending descent in this branch; the "flat" beat already happened
      // at the OPENING instead of the close.
      entryTilt = flatTiltRad;
      climbStartU = swoopU;
      climbEndU = Math.min(0.95, climbStartU + climbMinU);
      caughtSun = true;
    } else {
      // Rise gracefully early (the original sun-hold logic: don't climb into the look-down while
      // the Sun sits near the EXIT heading, take it right after), cruise at look-down, then glide
      // back DOWN to flat at the Sun-crossing as the finale (§CINEMA_FLAT_ENDING, R3 redesign —
      // replaces the old dip-and-recover swoop; a SINGLE monotonic glide, never a dip that climbs
      // back up). The descent starts AT the crossing when there's room for both the minimum glide
      // and the mandated hold afterward; otherwise as late as that room allows — still monotonic,
      // still ends flat with the full hold, just without the Sun necessarily lining up ("Catch the
      // Sun is luck", per the user's own framing).
      var sunDelta = exitAz - sunAz;
      while (sunDelta > Math.PI) sunDelta -= 2 * Math.PI;
      while (sunDelta < -Math.PI) sunDelta += 2 * Math.PI;
      var sunGuardRad = FXS.CINEMA_SUN_GUARD_DEG * Math.PI / 180;
      var sunHold = Math.abs(sunDelta) < sunGuardRad;
      holdU = sunHold ? Math.min(0.35, (sunGuardRad - Math.abs(sunDelta) + sunGuardRad) / (2 * Math.PI)) : 0;
      entryTilt = sunHold ? Math.max(tiltMin, lookdownTilt * 0.35) : lookdownTilt;
      holdStartU = 1 - flatHoldU;
      var latestDescentStartU = Math.max(holdU, holdStartU - descentMinU);
      descentStartU = Math.max(holdU, Math.min(swoopU, latestDescentStartU));
      caughtSun = Math.abs(swoopU - descentStartU) < 1e-6;
    }
    console.log('§CINEMA_SUN_ORDER exitAzDeg=' + (exitAz * 180 / Math.PI).toFixed(1) + ' sunAzDeg=' +
      (sunAz * 180 / Math.PI).toFixed(1) + ' swoopU=' + swoopU.toFixed(3) + ' (~' + (swoopU * loopSec).toFixed(1) +
      's) sunFirst=' + sunFirst + ' loopSec=' + loopSec.toFixed(1) + ' caughtSun=' + caughtSun +
      ' entryTiltDeg=' + (entryTilt * 180 / Math.PI).toFixed(1) + ' lookdownDeg=' + (lookdownTilt * 180 / Math.PI).toFixed(1));
    if (sunFirst) {
      console.log('§CINEMA_RISE_ENDING climbStartU=' + climbStartU.toFixed(3) + ' (~' + (climbStartU * loopSec).toFixed(1) +
        's) climbEndU=' + climbEndU.toFixed(3) + ' (~' + (climbEndU * loopSec).toFixed(1) + 's)');
    } else {
      console.log('§CINEMA_FLAT_ENDING descentStartU=' + descentStartU.toFixed(3) + ' (~' + (descentStartU * loopSec).toFixed(1) +
        's) holdStartU=' + holdStartU.toFixed(3) + ' (~' + (holdStartU * loopSec).toFixed(1) +
        's) flatTiltDeg=' + FXS.CINEMA_FLAT_TILT_DEG);
    }

    // §CINEMA_END_DECEL (2026-07-20, overall "no abruptness" rule): the film just CUTS at u=1 while
    // the camera is still actively orbiting at a constant angular rate — that reads as the recording
    // being cut off mid-move, not a deliberate close. Ease the azimuthal rate to zero over the final
    // CINEMA_END_DECEL_SEC instead, so the whole camera motion (not just tilt) settles before the
    // cut. f(t)=t+t^2-t^3 is the unique cubic with f(0)=0, f(1)=1, f'(0)=1, f'(1)=0 — it matches the
    // constant rate=1 coming in from the linear portion and eases exactly to rate=0 by the end, so
    // there is no kink at the window boundary, only at the (now motionless) very end.
    // §CINEMA_TIMING_672 (2026-07-24, user: "ensure last 3 sec is a roll to stop"... "in short, all
    // throughout must be smooth, no jerks"): ONE symmetric ease, same CINEMA_END_DECEL_SEC duration
    // used at BOTH ends — not two separately-tuned mechanisms. Without the start half, Beat 4's
    // straight-line glide (rate=0) handed off directly into Beat 5's constant rotation (rate=1) with
    // an actual instantaneous jump in angular velocity — a real jerk at the orbit's own start, same
    // class of abruptness as the cut this was already built to avoid at the end. Cap raised 0.25→0.4
    // so the full 3s survives now that the orbit itself is shorter (~8s, dive/out grew and the
    // exterior orbit gives way to them — see CINEMA_N_FRAMES above); at loopSec=8, 3/8=0.375 would
    // otherwise get truncated by the old 0.25 ceiling.
    var easeU = Math.min(0.4, FXS.CINEMA_END_DECEL_SEC / loopSec);
    function _cinemaEaseCubic(t) { return t + t * t - t * t * t; }  // f(0)=0,f(1)=1,f'(0)=1,f'(1)=0 — no kink against a slope-1 linear run
    function _cinemaAzU(u) {
      if (easeU > 0 && u < easeU) {
        var s = u / easeU;
        return easeU * (1 - _cinemaEaseCubic(1 - s));  // mirror of the cubic below: rate ramps 0→1 into the linear middle
      }
      var u0 = 1 - easeU;
      if (easeU <= 0 || u <= u0) return u;
      var t = (u - u0) / easeU;
      return u0 + easeU * _cinemaEaseCubic(t);  // rate ramps 1→0, the roll to a stop
    }
    console.log('§CINEMA_SMOOTH_ORBIT easeU=' + easeU.toFixed(3) + ' (~' + (easeU * loopSec).toFixed(1) +
      's each end) loopSec=' + loopSec.toFixed(1));

    // ══ The standard ending: one plain orbit off the side we emerged on, with the classic wide
    // pull-back flourish. Same close for EVERY film (§CINEMA_SIMPLE decision 2 — the reciprocal
    // ending is retired). No handoff branch, hence no ~10.8m step. ═══════════════════════════════
    function _orbitPose(u) {
      u = Math.max(0, Math.min(1, u));
      var az = exitAz + _cinemaAzU(u) * Math.PI * 2;
      var tilt, ellOut = 1;
      if (sunFirst) {
        if (u <= climbStartU) {
          tilt = entryTilt;
        } else if (u <= climbEndU) {
          var climbW = FXS._cinemaSmoothstep((u - climbStartU) / Math.max(1e-6, climbEndU - climbStartU));
          tilt = entryTilt + (lookdownTilt - entryTilt) * climbW;
        } else {
          tilt = lookdownTilt;
        }
      } else {
        tilt = entryTilt + (lookdownTilt - entryTilt) * (holdU > 0 ? FXS._cinemaSmoothstep(u / holdU) : 1);
        // §CINEMA_FLAT_ENDING: past descentStartU, ease MONOTONICALLY toward flat and hold — never a
        // separate dip-and-recover. u<descentStartU is untouched; u>=holdStartU is exactly flatTiltRad.
        if (u > descentStartU) {
          var descentW = FXS._cinemaSmoothstep(Math.min(1, (u - descentStartU) / Math.max(1e-6, holdStartU - descentStartU)));
          tilt = tilt + (flatTiltRad - tilt) * descentW;
          ellOut = 1 - descentW;   // the radius wobble ramps OUT across the same glide, dead calm by the hold
        }
      }
      // Ellipse ramps in from exactly 0 at u=0 so the orbit begins precisely where the rise ended,
      // ramps back OUT (ellOut) across the flat-ending glide (sunLast only — sunFirst has no
      // equivalent damping need, its ending is elevated and the end-decel window below already
      // calms the sweep), and is further damped by the universal end-deceleration window.
      var endW = (u > 1 - easeU) ? Math.max(0, 1 - (u - (1 - easeU)) / easeU) : 1;
      var ell = 1 + FXS.CINEMA_ELLIPTICITY * FXS._cinemaSmoothstep(u / 0.15) * ellOut * endW * Math.cos(2 * (az - exitAz));
      var radius = orbitRadius * ell;
      if (u > FXS.CINEMA_PULLBACK_START) {
        var pb = FXS._cinemaSmoothstep((u - FXS.CINEMA_PULLBACK_START) / (1 - FXS.CINEMA_PULLBACK_START));
        radius *= 1 + (FXS.CINEMA_PULLBACK_SCALE - 1) * pb;
      }
      var hr = radius * Math.cos(tilt);
      // cpeOrbitDY: the elastic height offset from the authored stop row (§CINEMA_PATH_EDITOR).
      // Additive on the whole loop, so the orbit rides higher or lower while keeping every shape
      // rule above — tilt easing, flat ending, pull-back — exactly as derived. Zero when nothing is
      // authored, so this line is a no-op on the default path.
      return { x: pivot.x + hr * Math.cos(az), y: pivot.y + radius * Math.sin(tilt) + cpeOrbitDY,
               z: pivot.z + hr * Math.sin(az), tx: pivot.x, ty: pivot.y, tz: pivot.z };
    }
    var orbitStart = _orbitPose(0);

    // §CINEMA_TURN_SLERP (2026-07-26 — PHOTOREAL_STILL_RENDER.md §CINEMA_TURN_SLERP). Implementing
    // §CINEMA_TURN_SLERP "the fix" — Witness: witness_cinema_exit_breathe.js G3.
    // Both look-back blends used to LERP THE LOOK-AT POINT from "20m ahead" toward the pivot. On a
    // straight walk-out the pivot sits exactly 180° BEHIND, so that segment runs back THROUGH the
    // camera. Measured on Duplex: the gaze azimuth held 132.3° dead flat all the way in while the
    // gaze distance collapsed 20m → 1.5m, then INVERTED to −47.7° in a single frame. The camera
    // never turned — it snapped, and that one frame is the user's "the camera rush and turns too
    // rapidly". §CINEMA_TIMING_672's wider lookahead spread the CORNER whip; it could not touch
    // this one, because this one is not a corner — it is the look-at point crossing the camera.
    // Rotating the DIRECTION at a fixed 20m range cannot do it: the target never approaches the
    // camera, so there is no singularity left to whip through.
    function _cinemaGazeBlend(px, py, pz, dx, dy, dz, w) {
      var pdx = pivot.x - px, pdy = pivot.y - py, pdz = pivot.z - pz;
      var yawA = Math.atan2(dz, dx),   pitA = Math.atan2(dy, Math.hypot(dx, dz));
      var yawB = Math.atan2(pdz, pdx), pitB = Math.atan2(pdy, Math.hypot(pdx, pdz));
      var raw = yawB - yawA;
      // Dead-antipodal leaves the short way undefined, and on a radial walk-out that is the NORMAL
      // case. Take the + way, which is the direction the exterior orbit itself turns
      // (az = exitAz + _cinemaAzU(u)*2π), so look-back and orbit rotate together. Kept as a modulo
      // of the RAW delta, not a hardcoded +π, so w=1 still lands EXACTLY on the pivot bearing —
      // that exactness is what keeps the Beat 4 → _orbitPose(0) handoff free of a kink.
      // §CINEMA_GAZE_SENSE: take the representative of `raw` NEAREST the per-plan reference delta,
      // rather than wrapping to (-π,π] and then step-testing for antipodal. Wrapping is
      // discontinuous wherever yawB-yawA crosses ±π, and the step test is discontinuous at its own
      // threshold — either one snaps the gaze by 2π × w on the frame it flips. Choosing the nearest
      // representative is continuous as long as the walk direction moves less than π within the
      // blend, which it always does, and it still lands EXACTLY on the pivot bearing at w=1
      // (yawA + (yawB - yawA + 2πk) = yawB modulo a full turn) — the exactness Beat 4's handoff
      // to _orbitPose(0) depends on.
      var dYaw = raw - 2 * Math.PI * Math.round((raw - _gazeRefD) / (2 * Math.PI));
      var yaw = yawA + dYaw * w, pit = pitA + (pitB - pitA) * w, cp = Math.cos(pit);
      return { x: px, y: py, z: pz,
               tx: px + Math.cos(yaw) * 20 * cp, ty: py + Math.sin(pit) * 20, tz: pz + Math.sin(yaw) * 20 * cp };
    }

    function poseAt(tNorm) {
      tNorm = Math.max(0, Math.min(1, tNorm));
      if (tNorm <= tD) {
        // ── Beat 1: the 4s ease IN. Position → the settle point; PITCH → level; HEIGHT → eye
        // level; HEADING **UNTOUCHED**. That last one is load-bearing (§CINEMA_SIMPLE call 1): the
        // exit is chosen at t=4s by position AND facing, so if the ease were free to re-aim you at
        // the space centre, every film on a building would face the same way here, pick the same
        // door, and the whole feature would collapse to one film per building.
        // §CPE_NOISE_LAW: the dive's progress is the eased time fraction run through the busyness
        // cost table, exactly as Beat 3's is run through _evenTurnRemap. Empty sky is crossed fast,
        // the arrival into the building slows — without either end of the beat losing its ease, so
        // the seams stay as smooth as they were.
        var e = _diveRemap(FXS._cinemaEaseFloored(tD > 0 ? tNorm / tD : 1));
        var px = camPos0.x + (settle.x - camPos0.x) * e;
        var py = camPos0.y + (settle.y - camPos0.y) * e;
        var pz = camPos0.z + (settle.z - camPos0.z) * e;
        var pit = pitch0 * (1 - e);                       // upside-down / looking-down → upright
        var cp = Math.cos(pit);
        return { x: px, y: py, z: pz,
                 tx: px + Math.cos(yaw0) * 20 * cp, ty: py + Math.sin(pit) * 20, tz: pz + Math.sin(yaw0) * 20 * cp };
      }
      if (tNorm <= tS) {
        // ── Beat 2: the clock is up. Spin in place — the SEARCH for the way out.
        var e2 = FXS._cinemaSmoothstep((tNorm - tD) / Math.max(1e-6, tS - tD));
        var yaw = yaw0 + dYaw * e2;
        return { x: settle.x, y: settle.y, z: settle.z,
                 tx: settle.x + Math.cos(yaw) * 20, ty: settle.y, tz: settle.z + Math.sin(yaw) * 20 };
      }
      if (tNorm <= tO) {
        // ── Beat 3: walk it out through the door the pose chose.
        // §CPE_EVEN_TURN: the frame's progress along the walk is no longer the eased TIME fraction
        // — it is that fraction run through _evenTurnRemap, which spaces frames evenly in the
        // blended distance+turn metric instead of evenly in distance. See the remap's own comment.
        // §CPE_STICK_HOLD: _holdMap converts the beat's own time fraction (which now INCLUDES the
        // authored dwell) into the travel-time fraction the existing chain expects. Identity when
        // no hold is set, so this is a no-op on every path that has none.
        var w3 = (tNorm - tS) / Math.max(1e-6, tO - tS);
        var e3 = _evenTurnRemap(FXS._cinemaEaseFloored(_holdMap(w3)));
        var p3f = _beat3Pose(e3, w3);
        // §CPE_GAZE_CONSTANT_RATE: position is whatever the walk says; the DIRECTION is the
        // rate-limited one. Splitting them here (rather than inside _beat3Pose) keeps that function
        // the raw signal the cost table samples, so §CPE_EVEN_TURN still measures turn DEMAND.
        var g3 = _gazeRateAt(_spanFracOf(tNorm));
        if (!g3) return p3f;
        return { x: p3f.x, y: p3f.y, z: p3f.z,
                 tx: p3f.x + g3.x * 20, ty: p3f.y + g3.y * 20, tz: p3f.z + g3.z * 20 };
      }
      if (tNorm <= tP) {
        // ── §CPE_DISCIPLINE_REVEAL_PULLOUT: the brief pull-out/dolly-back sub-beat, ONLY when
        // _cpeReveal is on. tP===tO (zero-width, unreachable — the tNorm<=tO branch above already
        // caught everything up to here) whenever reveal is off or the building has no non-ARC/STR
        // discipline, so an off/empty-building film never enters this branch and is byte-identical
        // to before this feature existed.
        return _pullOutPose((tNorm - tO) / Math.max(1e-6, tP - tO));
      }
      if (tNorm <= tF) {
        // ── §CPE_DISCIPLINE_REVEAL_FLYBACK (2026-08-16): fast eased retrace back onto the first
        // stick, replacing the old teleport cut that used to sit right here. tF===tP (zero-width,
        // unreachable) under the same off/empty conditions as tP above.
        return _flyBackPose((tNorm - tP) / Math.max(1e-6, tF - tP));
      }
      if (tNorm <= tV) {
        // ── §CPE_DISCIPLINE_REVEAL_PULLOUT: round 2 — the SAME path flown again, forward only, no
        // retrace. Now starts CLEAN (the fly-back above already put the camera on the first stick),
        // no cut. tV===tF (zero-width, unreachable) under the same off/empty conditions as tP above.
        return _revealPose((tNorm - tF) / Math.max(1e-6, tV - tF));
      }
      if (tNorm <= tR) {
        // ── Beat 4: turn around to face the building and rise onto the orbit band. Ends EXACTLY
        // on _orbitPose(0), which is what keeps the handoff continuous (the old Act III handoff
        // did not, and measured a ~10.8m single-frame step at t≈0.80). The look-at picks up from
        // CINEMA_TURN_OVERLAP_MAX (where Beat 3 left it) rather than restarting at 0 — see above.
        // Boundary is tV, not tO — tV===tO when the reveal round is off/empty, so this formula
        // reduces to today's exactly when there's nothing inserted before it. §CPE_DISCIPLINE_
        // REVEAL_PULLOUT (2026-08-14): this code is UNCHANGED from before the restructure — the
        // disc-parade tail is folded into [tV,tR]'s own (now larger) time budget rather than a new
        // beat, so the SAME e4/_beat4Pose formula covers the same pull-back distance over more
        // seconds, which is the tail's entire "slows down" effect (see _useSec.rise's own comment
        // above — no new camera motion invented for the tail).
        var e4 = FXS._cinemaEaseFloored((tNorm - tV) / Math.max(1e-6, tR - tV));
        var p4f = _beat4Pose(e4);
        // §CPE_GAZE_CONSTANT_RATE spans Beat 3 AND Beat 4 — see _gazeRateBuild. MEASURED: limiting
        // only the walk moved the whip rather than removing it (Terminal 4.1 -> 34.9 deg/frame at
        // u=0.645, which is just past `out` — i.e. INSIDE Beat 4). Beat 4 is where the gaze swings
        // from wherever the aim left it onto the pivot bearing, so it needs the same bound.
        var g4 = _gazeRateAt(_spanFracOf(tNorm));
        if (!g4) return p4f;
        return { x: p4f.x, y: p4f.y, z: p4f.z,
                 tx: p4f.x + g4.x * 20, ty: p4f.y + g4.y * 20, tz: p4f.z + g4.z * 20 };
      }
      return _tailPose(tNorm);
    }
    // ══ §CPE_DISCIPLINE_REVEAL_PULLOUT — pull-out + repeated forward lap (2026-08-14) ══════════════
    // Spec: bim-compiler prompts/CINEMA_DISCIPLINE_REVEAL.md, dated "pull-out restructure" section.
    // Supersedes the old Mechanism C there-and-back: no backward retrace exists any more. Position
    // reuses _outPos(f) — the SAME curve Beat 3 walks. Deliberately does NOT reuse _beat3Pose's
    // hold/pin/aim-depth machinery — kept isolated per this file's header rule ("touches
    // _cinemaPathPlan as little as possible"), same reasoning the original build already established.
    // Generic gaze-blend helper (same yaw/pitch-lerp technique _cinemaGazeBlend already uses,
    // generalized to an explicit target direction instead of always the pivot — this round looks
    // along the WALK, not at the building centre).
    function _dirBlend(px, py, pz, axd, ayd, azd, bxd, byd, bzd, w) {
      var yawA = Math.atan2(azd, axd), pitA = Math.atan2(ayd, Math.hypot(axd, azd));
      var yawB = Math.atan2(bzd, bxd), pitB = Math.atan2(byd, Math.hypot(bxd, bzd));
      var raw = yawB - yawA;
      var dYaw = raw - 2 * Math.PI * Math.round(raw / (2 * Math.PI));
      var yaw = yawA + dYaw * w, pit = pitA + (pitB - pitA) * w, cp = Math.cos(pit);
      return { x: px, y: py, z: pz,
               tx: px + Math.cos(yaw) * 20 * cp, ty: py + Math.sin(pit) * 20, tz: pz + Math.sin(yaw) * 20 * cp };
    }
    function _revealTravelDir(f, dir) {
      var eps = 1 / 64;
      var pA = _outPos(Math.max(0, f - eps)), pB = _outPos(Math.min(1, f + eps));
      var vx = (pB.x - pA.x) * dir, vy = (pB.y - pA.y) * dir, vz = (pB.z - pA.z) * dir;
      var vL = Math.hypot(vx, vy, vz);
      if (vL < 1e-6) return { x: _beat3EndDir.x, y: _beat3EndDir.y, z: _beat3EndDir.z };
      return { x: vx / vL, y: vy / vL, z: vz / vL };
    }
    // §CPE_GAZE_CONSTANT_RATE interaction (found while witnessing the original build, real MEASURED
    // jump — not assumed): Beat 3/4's ACTUAL rendered gaze at a beat boundary is the RATE-LIMITED
    // signal (_gazeRateAt(_spanFracOf(tNorm))), not the raw _beat3EndDir — the limiter can lag behind
    // the raw signal on a fast turn. Anchoring seam blends to raw _beat3EndDir measured a 63deg
    // instantaneous jump at the tO seam on Duplex (witness_cpe_reveal_round.js). Anchor to what is
    // ACTUALLY on screen at that instant instead.
    function _revealSeamDir(tNorm) {
      var g = _gazeRateAt(_spanFracOf(tNorm));
      return g || _beat3EndDir;
    }
    // First-guess tuning knob (flagged in the original spec, not re-measured for this restructure) —
    // the fraction of round 2 spent blending across its END seam (travel-tangent -> Beat 4's actual
    // e4=0 gaze) instead of pure travel-tangent gaze, so Beat 4's hand-off picks up with zero kink.
    var CPE_REVEAL_SEAM_FRAC = 0.08;
    // §CPE_DISCIPLINE_REVEAL_PULLOUT: the pull-out sub-beat (tO..tP). Author's own call (documented
    // in the spec file, not user-dictated): a straight dolly-back along the NEGATIVE of the "angle of
    // attack" — with gaze held CONSTANT (still looking forward along that same direction, i.e. toward
    // where round 2 will re-enter). No gaze blend: this is the simplest defensible pull-out (position
    // retreats, look direction doesn't change). §CPE_DISCIPLINE_REVEAL_FLYBACK (2026-08-16,
    // bim-compiler prompts/CINEMA_DISCIPLINE_REVEAL.md's dated section) SUPERSEDES the note that
    // used to be here about round 2 starting with "a clean CUT back to the first stick" — user
    // feedback on a live bake found that cut read as an abrupt, jarring switch. The pull-out itself
    // is UNCHANGED (still gaze-constant, still no blend) — see `_flyBackPose` below for the new
    // sub-beat that now bridges from here to the first stick.
    // ⚠ BUG FOUND BY THE WITNESS (not assumed correct on paper, same discipline the original build's
    // own comments describe): the "angle of attack" direction is the RATE-LIMITED gaze Beat 3 ACTUALLY
    // renders at tO (_revealSeamDir(tO)), not the raw _beat3EndDir — witness_cpe_reveal_pullout.js
    // measured a 78.85deg gap between them on HHS_Office_Federated (the limiter had visibly lagged the
    // raw signal on the walk's final turn). Anchoring to raw _beat3EndDir would have opened the
    // pull-out on a direction that instantly snaps away from what was actually on screen the frame
    // before — exactly the class of bug §CPE_GAZE_CONSTANT_RATE and _revealSeamDir already exist to
    // prevent elsewhere in this same file. Fixed before this was ever shipped.
    function _pullOutPose(w) {
      w = Math.max(0, Math.min(1, w));
      var pt = _outPos(1);                      // the last stick — where round 1 arrives
      var dir = _revealSeamDir(tO);              // the "angle of attack" — the gaze ACTUALLY on screen at tO
      var dist = FXS.CINEMA_REVEAL_PULLOUT_SEC * FXS.CINEMA_PULLBACK_MPS;   // derived, reuses the pull-back rate
      var e = FXS._cinemaEaseFloored(w);
      var px = pt.x - dir.x * dist * e, py = pt.y - dir.y * dist * e, pz = pt.z - dir.z * dist * e;
      return { x: px, y: py, z: pz, tx: px + dir.x * 20, ty: py + dir.y * 20, tz: pz + dir.z * 20 };
    }
    // §CPE_DISCIPLINE_REVEAL_FLYBACK (2026-08-16) — the sub-beat between the pull-out (tP) and round
    // 2's forward lap (tF), replacing the old teleport cut. Retraces the SAME `_outPos(f)` curve the
    // walk itself already validated as collision-free, backward (f: 1->0) — NOT a straight line
    // between the pull-out's retreated point and the first stick, which would risk clipping through
    // walls at any turn the corridor takes (exactly the class of bug `_revealSeamDir`/
    // §CPE_GAZE_CONSTANT_RATE already exist to prevent elsewhere in this file). Paced at
    // CINEMA_PULLBACK_MPS ("flying, not walking" — reused, not a new speed invented), so this is
    // "fast" relative to round 2's own CINEMA_WALK_MPS retrace, not instant. Position blends from the
    // pull-out's actual final (off-path) point onto the path's f=1 point over the first
    // CPE_REVEAL_SEAM_FRAC width (same seam-blend idiom `_revealPose`'s own ending already uses),
    // then retraces the path for the remainder. Gaze holds at the pull-out's own "angle of attack"
    // (`_revealSeamDir(tO)` — matches pull-out's own constant-gaze choice, no reason to start turning
    // the head before the camera is even back on the path) through the position blend, then blends
    // into the forward travel tangent at f=0 over the FINAL CPE_REVEAL_SEAM_FRAC width, so round 2's
    // own opening gaze picks up with zero kink — same contract _revealPose's own end seam keeps at
    // the Beat 4 handoff.
    // ══ §CPE_FLYBACK_FACE_TRAVEL (2026-09-04, user) ═══════════════════════════════════════════
    // USER, on a real bake: "During Reveal fly back from last stick back to first, the cam head
    // angle seems to face sideways all the way instead of direction of flight."
    // CAUSE, read straight out of the code below as it stood: the gaze HELD `_revealSeamDir(tO)` —
    // the angle of attack at the LAST stick — for the entire retrace, while the body flew backward
    // along a corridor that turns. A fixed head on a turning path reads as sideways, and wherever
    // the path doubles back it reads as backwards. The hold was a deliberate choice ("no reason to
    // start turning the head before the camera is even back on the path"), but that reasoning only
    // ever covered the short position-blend seam at the start — not the 12+ seconds of travel after
    // it. This is the same class of defect §CPE_AIM_DEPTH_RETIRED settled elsewhere: path-follow is
    // the automatic gaze rule, and this sub-beat was the one place still ignoring it.
    // FIX: the gaze TRACKS THE DIRECTION OF FLIGHT — `_revealTravelDir(f, -1)`, the SAME helper
    // round 2 already uses with dir=+1, evaluated at the retrace's own f. No new tangent maths, no
    // new constant.
    // THE TWO TURNS THIS CREATES ARE SIZED BY THE REAL ANGLE, not by a fixed fraction. Turning into
    // the travel direction at the start and out of it into round 2's forward gaze at the end are
    // both close to 180deg on a path that ends where it began. The reveal sub-beats are NOT covered
    // by §CPE_GAZE_CONSTANT_RATE's limiter (that spans Beats 3-4 only — see _gazeRateAt's call
    // sites), so a fixed 8% seam across a reversal would whip at roughly 180 deg/s against a film
    // whose every other turn is charged at CINEMA_TURN_DPS. Each window is therefore
    // angle/CINEMA_TURN_DPS seconds expressed as a fraction of this beat, floored at the existing
    // seam width and capped so the two can never overlap. When the cap bites, the §-line SAYS SO
    // rather than hiding a whip behind a smooth-looking curve.
    function _flyBackAngDeg(a, b) {
      var d = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));
      return Math.acos(d) * 180 / Math.PI;
    }
    function _flyBackTurnWindow(angDeg) {
      var sec = _useSec && _useSec.flyback > 0 ? _useSec.flyback : 0;
      if (!(sec > 0)) return CPE_REVEAL_SEAM_FRAC;
      return Math.max(CPE_REVEAL_SEAM_FRAC, Math.min(0.45, (angDeg / FXS.CINEMA_TURN_DPS) / sec));
    }
    var _flyBackLogged = false;
    function _flyBackPose(w) {
      w = Math.max(0, Math.min(1, w));
      var e = FXS._cinemaEaseFloored(w);
      var holdDir = _revealSeamDir(tO);           // same "angle of attack" the pull-out opened on
      var pOut = _pullOutPose(1);                 // the pull-out's own final point — this beat's start
      var f = 1 - e;                              // the retrace parameter: 1 -> 0
      var onPath = _outPos(f);                    // retrace target at this instant
      var travelDir = _revealTravelDir(f, -1);    // §CPE_FLYBACK_FACE_TRAVEL — where it is GOING
      var endDir = _revealTravelDir(0, 1);        // round 2's own opening gaze
      var inW = _flyBackTurnWindow(_flyBackAngDeg(holdDir, _revealTravelDir(1, -1)));
      var outW = _flyBackTurnWindow(_flyBackAngDeg(_revealTravelDir(0, -1), endDir));
      if (!_flyBackLogged) {
        _flyBackLogged = true;
        var inAng = _flyBackAngDeg(holdDir, _revealTravelDir(1, -1));
        var outAng = _flyBackAngDeg(_revealTravelDir(0, -1), endDir);
        var sec = _useSec && _useSec.flyback > 0 ? _useSec.flyback : 0;
        console.log('§CPE_FLYBACK_FACE_TRAVEL gaze=travel-tangent(dir=-1) flybackSec=' + sec.toFixed(1) +
          ' turnIn=' + inAng.toFixed(1) + 'deg over ' + (inW * sec).toFixed(2) + 's (' +
          (inAng / Math.max(0.001, inW * sec)).toFixed(1) + ' deg/s)' +
          ' turnOut=' + outAng.toFixed(1) + 'deg over ' + (outW * sec).toFixed(2) + 's (' +
          (outAng / Math.max(0.001, outW * sec)).toFixed(1) + ' deg/s)' +
          ' rate=' + FXS.CINEMA_TURN_DPS + 'deg/s' +
          ((inW >= 0.45 || outW >= 0.45)
            ? ' ⚠ CAPPED at 0.45 of the beat — this fly-back is too short to turn at the film rate;' +
              ' the turn is faster than every other turn in the film'
            : ''));
      }
      var pos;
      if (w < CPE_REVEAL_SEAM_FRAC) {
        var s = FXS._cinemaSmoothstep(w / CPE_REVEAL_SEAM_FRAC);
        pos = { x: pOut.x + (onPath.x - pOut.x) * s, y: pOut.y + (onPath.y - pOut.y) * s,
                z: pOut.z + (onPath.z - pOut.z) * s };
      } else {
        pos = onPath;
      }
      // Turn INTO the direction of flight, off the pull-out's held angle of attack. Anchoring to
      // holdDir (not the raw tangent) keeps the tP seam kink-free — the same rule _revealSeamDir
      // exists to enforce at every other seam in this file.
      if (w < inW) {
        return _dirBlend(pos.x, pos.y, pos.z, holdDir.x, holdDir.y, holdDir.z,
          travelDir.x, travelDir.y, travelDir.z, FXS._cinemaSmoothstep(w / inW));
      }
      // Turn OUT of it into round 2's opening gaze, so the forward lap starts with zero kink.
      if (w > 1 - outW) {
        return _dirBlend(pos.x, pos.y, pos.z, travelDir.x, travelDir.y, travelDir.z,
          endDir.x, endDir.y, endDir.z,
          FXS._cinemaSmoothstep((w - (1 - outW)) / outW));
      }
      return { x: pos.x, y: pos.y, z: pos.z,
               tx: pos.x + travelDir.x * 20, ty: pos.y + travelDir.y * 20, tz: pos.z + travelDir.z * 20 };
    }
    // §CPE_DISCIPLINE_REVEAL_PULLOUT: round 2 (tF..tV) — the SAME path flown again, forward only
    // (0->1), no there-and-back. Starts CLEAN now — the fly-back above already puts the camera on
    // the first stick with the correct opening gaze, so no cut happens here any more. Only the END
    // is seam-blended, into Beat 4's actual e4=0 gaze, matching every other beat seam in this file
    // (§CPE_GAZE_CONSTANT_RATE).
    function _revealPose(w) {
      w = Math.max(0, Math.min(1, w));
      var e = FXS._cinemaEaseFloored(w);
      var p = _outPos(e), dv = _revealTravelDir(e, 1);
      if (w > 1 - CPE_REVEAL_SEAM_FRAC) {
        var endDir = _revealSeamDir(tV);
        return _dirBlend(p.x, p.y, p.z, dv.x, dv.y, dv.z, endDir.x, endDir.y, endDir.z,
          FXS._cinemaSmoothstep((w - (1 - CPE_REVEAL_SEAM_FRAC)) / CPE_REVEAL_SEAM_FRAC));
      }
      return { x: p.x, y: p.y, z: p.z, tx: p.x + dv.x * 20, ty: p.y + dv.y * 20, tz: p.z + dv.z * 20 };
    }
    function _beat4Pose(e4) {
        var turnW4 = FXS.CINEMA_TURN_OVERLAP_MAX + (1 - FXS.CINEMA_TURN_OVERLAP_MAX) * FXS._cinemaSmoothstep(e4);
        // (odx,odz) IS the direction Beat 3 ends on — its last route leg is the outward push past
        // the doorway — so e4=0 continues Beat 3's final gaze exactly. At e4=1, turnW4=1 yields the
        // camera→pivot bearing, which is the same orientation _orbitPose(0) produces by aiming at
        // pivot: both seams are continuous by construction, not by tuning.
        // §CPE_BEAT3_END_DIR: opens on _beat3EndDir (Beat 3's measured final gaze) rather than the
        // hardcoded outward push — see that block's comment. At e4=1, turnW4=1 still yields the
        // camera→pivot bearing, so the Beat 4→5 seam is unchanged.
        return _cinemaGazeBlend(exitOuter.x + (orbitStart.x - exitOuter.x) * e4,
                                exitOuter.y + (orbitStart.y - exitOuter.y) * e4,
                                exitOuter.z + (orbitStart.z - exitOuter.z) * e4,
                                _beat3EndDir.x, _beat3EndDir.y, _beat3EndDir.z, turnW4);
    }
    // ── Beat 5: the standard ending.
    function _tailPose(tNorm) {
      return _orbitPose((tNorm - tR) / Math.max(1e-6, 1 - tR));
    }

    // ══ Where the walk is LOOKING at progress u — the one rule, used everywhere. ═══════════════
    // The look-ahead means "where does the path go next". The old guard answered a collapsed
    // look-ahead by SUBSTITUTING a level (odx,odz) bearing 20m out — a different vector, switched
    // to in a single frame. MEASURED on Hospital: the gaze went (-0.230,0.973,-0.019) → (-0.733,
    // 0.000,0.680), 81.0 deg in ONE frame at u=0.312, and it did NOT shrink at 100x sampling
    // density (ratio 1.0x) — a true discontinuity, exactly what §CPE_JERK_DEFINITION item 3 calls
    // a step. The `y` of exactly 0.000 is the substitution's fingerprint.
    //
    // The problem is the THRESHOLD, not the window size. Any rule of the form "if the look-ahead
    // is too close, use something else" has a switch in it, and a switch is a step. Searching
    // forward for the first point clearing a radius is still such a rule — it only made the step
    // smaller (MEASURED: 81.0 → 21.3 deg/frame, still ratio 1.4x at 100x density, still a step),
    // because on a path that folds the first-clearing point can itself jump.
    //
    // So there is no threshold. The look-ahead is the point a fixed ARC LENGTH further along the
    // path. That point always exists and always moves continuously with u, on any path shape,
    // because arc length is monotone in u — a fold-back cannot collapse it and there is nothing to
    // substitute. L is derived, not picked: the same 0.15 of the walk the fraction window meant,
    // now measured in metres so it stops depending on how the parameter happens to be spaced.
    //
    // The (odx,odz) fallback survives for exactly one case: a walk with no length at all, where
    // there is no path to read a direction from. Beat 4 opens on (odx,0,odz), so it is the
    // continuous answer there rather than a substitution.
    var _AH_FRAC = 0.15, _ahN = 240, _ahS = null, _ahL = 0;
    function _ahBuild() {                      // cumulative arc length of the walk, sampled once
      _ahS = [0];
      var prev = _outPos(0), s = 0;
      for (var i = 1; i <= _ahN; i++) {
        var q = _outPos(i / _ahN);
        s += Math.hypot(q.x - prev.x, q.y - prev.y, q.z - prev.z);
        _ahS.push(s); prev = q;
      }
      _ahL = s;
    }
    function _ahArcAt(u) {                     // arc length travelled by parameter u
      if (!_ahS) _ahBuild();
      var t = Math.max(0, Math.min(1, u)) * _ahN, i = Math.min(_ahN - 1, Math.floor(t));
      return _ahS[i] + (_ahS[i + 1] - _ahS[i]) * (t - i);
    }
    function _ahAtArc(s) {                     // the inverse: parameter u at arc length s
      if (!_ahS) _ahBuild();
      if (s <= 0) return 0;
      if (s >= _ahL) return 1;
      var lo = 0, hi = _ahN;
      while (hi - lo > 1) { var m = (lo + hi) >> 1; if (_ahS[m] <= s) lo = m; else hi = m; }
      var d = _ahS[hi] - _ahS[lo];
      return (lo + (d > 1e-12 ? (s - _ahS[lo]) / d : 0)) / _ahN;
    }
    function _lookAhead(p, u) {
      if (!_ahS) _ahBuild();
      if (_ahL < 1e-6) return { x: p.x + odx * 20, y: p.y, z: p.z + odz * 20 };
      return _outPos(_ahAtArc(_ahArcAt(u) + _AH_FRAC * _ahL));
    }

    // The walk-out pose as a pure function of its OWN progress e3 ∈ [0,1]. Extracted verbatim out of
    // poseAt so §CPE_EVEN_TURN's cost table can sample the REAL poses — sampling a re-implementation
    // of the gaze rule would let the table and the film drift apart silently.
    // §CPE_AIM_DEPTH_RETIRED (2026-09-02): `w3` — the beat's TIME fraction, as opposed to e3 which
    // is TRAVEL — is now UNUSED and kept only so every existing call site stays valid. Its sole
    // reader was `_holdBoostAt`, which existed only to feed `_aimDepthApply`'s `boost` argument; see
    // the §CPE_STICK_HOLD_AIM_RETIRED marker where that function used to live for what a held beat
    // does instead. Do not delete the parameter: `_beat3Pose(e3)` (one arg) and `_beat3Pose(e3, w3)`
    // are both live call shapes, and dropping it would silently change the second into the first.
    function _beat3Pose(e3, w3) {
        var p3 = _outPos(e3);
        // §CINEMA_TIMING_672 (2026-07-24, user: "no chasing interim targets when exiting building
        // mostly"): 0.06→0.15. Position already moves at constant speed along the route; this
        // lookahead point only steers where the camera LOOKS. On a multi-waypoint room-graph route
        // (a corridor with turns), the instant this window crosses a corner the look-at direction
        // swung hard onto the next segment — a real gaze snap, not just position. A wider window
        // means the look-at is further past any given corner while still approaching it, so the
        // direction change is spread out instead of happening in one frame.
        // §CINEMA_LOOKAHEAD_VERTICAL (2026-07-27): this collapse test used to measure HORIZONTAL
        // distance only, so any near-vertical stretch of path tripped it even though the look-ahead
        // point was metres away — it was simply above rather than ahead. The gaze then snapped from
        // looking up the shaft to the flat (odx,odz) bearing. MEASURED on Terminal, whose walk-out
        // climbs 17m with x/z barely moving: target jumped (-0.80,-6.19,-1.14) → (-21.82,-25.65,
        // -1.67), a 113 deg/frame whip at t=0.411. A 3D test is what the guard actually meant —
        // "has the look-ahead collapsed onto me", not "has it collapsed horizontally".
        var ah = _lookAhead(p3, e3);
        var ad = Math.hypot(ah.x - p3.x, ah.y - p3.y, ah.z - p3.z) || 1;
        // §CPE_SEAM_CONTINUOUS: at e3=0 look EXACTLY where the spin left off, then ease onto the
        // walk's own aim across _openU. Smoothstep, so the rate is zero at the seam and there is no
        // kink against Beat 2's own eased ending. Past _openU this is the untouched walk gaze.
        var _lx = (ah.x - p3.x) / ad, _ly = (ah.y - p3.y) / ad, _lz = (ah.z - p3.z) / ad;
        if (_openU > 1e-6 && e3 < _openU) {
          var wOpen = FXS._cinemaSmoothstep(e3 / _openU);
          _lx = _handDir.x + (_lx - _handDir.x) * wOpen;
          _ly = _handDir.y + (_ly - _handDir.y) * wOpen;
          _lz = _handDir.z + (_lz - _handDir.z) * wOpen;
          var _ll = Math.hypot(_lx, _ly, _lz) || 1;
          _lx /= _ll; _ly /= _ll; _lz /= _ll;
        }
        // §CPE_AIM_PIN: a pin at THIS e3's band wins outright over path-follow. Spec Part C open
        // question 1's own recommendation, built as the default (flagged in the DONE block as not
        // explicitly user-confirmed, same treatment §CPE_VIEWFINDER's fps question got): "the pin
        // always wins locally at its own band, resuming immediately after, no bleed into
        // neighbours." The "no bleed" guarantee comes from `_pinLookAtAt` itself (a Voronoi
        // partition by band, see its own comment), not from a blend weight here.
        // §CPE_AIM_DEPTH_RETIRED (2026-09-02): this used to be the `if` half of an if/else whose
        // `else` ran §CPE_AIM_DEPTH. With depth retired there is no else — an UNpinned stretch of
        // the walk is now plain path-follow, which is the whole point of the change. The pin is
        // therefore the ONLY thing in this function that can take the gaze off the path, and it is
        // the user's own authored head-turn.
        var _pin = _pinLookAtAt(e3);
        if (_pin) {
          var _pdx = _pin.x - p3.x, _pdy = _pin.y - p3.y, _pdz = _pin.z - p3.z;
          var _pdL = Math.hypot(_pdx, _pdy, _pdz) || 1;
          _lx = _pdx / _pdL; _ly = _pdy / _pdL; _lz = _pdz / _pdL;
        }
        // §CPE_CONE_ORIENT_ADJUST: a user-dragged correction is the LAST word on the gaze at its own
        // arc-length window, applied AFTER the pin/depth/path-follow chain above — a judgment call,
        // not user-confirmed: the cone shows whatever the CURRENT combined gaze is (pin included), so
        // dragging it corrects whatever is currently there, even inside an already-pinned zone. Zero
        // cost/no-op on every plan with no corrections authored (_cpeCorrectionAt returns null
        // instantly once `_corrArc` is built empty).
        // §CPE_CORR_BRANCH probe tap. `_corrRefProbe` is non-null ONLY inside _resolveCorrBranch, so
        // this is dead weight (one null test) on every normal frame. It sits HERE, immediately before
        // the correction, because the vector the probe must return is precisely the `a` argument
        // _cpeCorrDirBlend receives — reading it any later would fold in the correction being resolved,
        // and reading it via the returned pose would fold in the turnW3 hand-off blend below.
        if (_corrRefProbe) {
          _corrRefProbe.x = _lx; _corrRefProbe.y = _ly; _corrRefProbe.z = _lz; _corrRefProbe.hit = true;
          return null;                        // never reaches a caller: only _resolveCorrBranch sets the probe
        }
        var _corr = _cpeCorrectionAt(e3);
        if (_corr && _corr.w > 0) {
          // §CPE_AIM_DEPTH_FREEZE (2026-09-01): blend from the FIXED gaze captured at the window's
          // own edge instead of the live one — inside the window §CPE_AIM_DEPTH kept re-aiming the
          // from-direction (measured 126-140 deg inside one ramp on Hospital) and that motion
          // leaked through (1-w) as a 13.114 deg/sample wobble. With `from` the window is a
          // fixed-to-fixed crossfade; from=null degrades to the live base (pre-freeze behaviour).
          var _cfx = _lx, _cfy = _ly, _cfz = _lz;
          if (_corr.from) { _cfx = _corr.from.x; _cfy = _corr.from.y; _cfz = _corr.from.z; }
          var _cb = _cpeCorrDirBlend(_cfx, _cfy, _cfz, _corr.dir.x, _corr.dir.y, _corr.dir.z, _corr.w, _corr.refD);
          _lx = _cb.x; _ly = _cb.y; _lz = _cb.z;
        }
        // §CINEMA_BEAT_OVERLAP (2026-07-20, "no abruptness... even the path when reaching outside
        // should not be robotic abrupt stop and turn, it can play while doing both"): start blending
        // the look-at toward the pivot in the LAST CINEMA_TURN_OVERLAP fraction of the walk-out, so
        // Beat 4's turn is a CONTINUATION picked up mid-blend, not a fresh spin starting from zero.
        // Both this ramp-in and Beat 4's ramp-out use smoothstep, so the blend weight is continuous
        // AND has matching (zero) slope at the tO boundary — no kink in the gaze direction.
        var turnW3 = (e3 > 1 - FXS.CINEMA_TURN_OVERLAP)
          ? FXS._cinemaSmoothstep((e3 - (1 - FXS.CINEMA_TURN_OVERLAP)) / FXS.CINEMA_TURN_OVERLAP) * FXS.CINEMA_TURN_OVERLAP_MAX
          : 0;
        // turnW3=0 reproduces the old pure-walk target exactly (p3 + aheadDir*20) — the walk-out
        // itself is untouched; only the blend that follows changed shape.
        return _cinemaGazeBlend(p3.x, p3.y, p3.z, _lx, _ly, _lz, turnW3);
    }

    // ══ §CPE_EVEN_TURN — the even-out. ═══════════════════════════════════════════════════════════
    // User, 2026-07-27: "no jerk, no cam pos/pov jump.. but even out".
    //
    // What every earlier attempt got wrong: they kept frames evenly spaced in TIME and tried to fix
    // the corner by MULTIPLYING the speed there. deg/frame = (deg/metre) × (metres/frame), and a
    // multiplier bounded by the user's own PACE_SWING can only ever divide the peak by 1.6 — the
    // measured peak was 29.1 deg/frame against a 12 cap, so a 2.4× reduction was needed and no
    // tuning of a bounded multiplier could reach it. That is why H3 moved 29.1 → 29.4: not a bug,
    // an arithmetic ceiling. The three dead ends are recorded in prompts/CINEMA_PATH_EDITOR.md.
    //
    // The fix is to stop treating pace as a correction and make it the PARAMETERIZATION. Step the
    // frames at equal increments of a blended cost
    //
    //     dc = (1-w)·(ds/S) + w·(dθ/Θ)
    //
    // where S is the walk's arc length and Θ its total gaze turn. If frames advanced by a constant
    // Δc, each term would be bounded on its own by construction:
    //
    //     Δθ ≤ Θ/(w·N)         — turn per frame, at most 1/w × the perfectly-even Θ/N
    //     Δs ≤ S/((1-w)·N)     — distance per frame, at most 1/(1-w) × the nominal speed
    //
    // ⚠ Δc IS NOT CONSTANT HERE, and the bounds above are the per-cost-step ones, not what the film
    // delivers. Beat 3 feeds the remap an EASED time fraction — _evenTurnRemap(_cinemaSmoothstep(t))
    // — and smoothstep's derivative peaks at 1.5 at its midpoint, so cost advances at up to 1.5/N
    // per frame and every bound above carries a ×1.5:
    //
    //     Δθ ≤ 1.5·Θ/(w·N)     Δs ≤ 1.5·S/((1-w)·N)
    //
    // So the DELIVERED speed range is 1.5/(1-w) ≈ 2.4×, not 1/(1-w) = 1.6×: against a nominal
    // CINEMA_WALK_MPS of 2.3 the walk peaks near 5.5 m/s, and §CPE_WALK's "2.3 m/s pace" is a MEAN,
    // not the pace. The ease is deliberate (zero rate at both beat seams, so the walk does not start
    // or stop abruptly) — the ×1.5 is the price of it, and it is stated here rather than left for a
    // reader to derive from the fact that the two do not agree.
    //
    // w itself is still not tuned: PACE_SWING = 1.6 is the user's own dial ("have a speed range…
    // don't overdo it") and fixes w = 1 - 1/1.6 = 0.375 exactly. What is NOT yet settled is whether
    // 2.4× is inside what they meant by "don't overdo it" — the gaze half passes comfortably (7.3
    // measured against a 12 cap) but the POSITION half of §CPE_JERK_DEFINITION is still ungated, and
    // gating it is what would turn this from an argument into a measurement.
    // Slow-in-the-turn and pick-up-in-the-open are not imposed by a brake — they are what equal
    // cost stepping DOES, and the brake releases in open space for free because there is no dθ to
    // pay for there.
    // CINEMA_PACE_SWING now lives at module scope (§CPE_NOISE_LAW) — one dial for every beat.
    var _etW = 1 - 1 / FXS.CINEMA_PACE_SWING;
    var _etN = 240, _etC = null;
    // §CPE_PACE_FLOOR — a SEPARATE concern from the cost function, and kept separate.
    // _evenTurnBuild decides WHERE the film should slow (the blended cost). This decides HOW SLOW
    // it is ever allowed to get. Mixing them made one loop answer two questions; it is a pure
    // transform on a finished cost table now, testable and removable on its own.
    //
    // The blended cost bounds the fast side and the turn, and stalls on the slow side: MEASURED
    // 5-8% of the ease's own prediction, which is the "2 secs pausing there" the user reported.
    // Rule: cost may not accumulate faster than PACE_SWING x uniform-per-arc — the same statement
    // as "the walk may not run slower than nominal/PACE_SWING".
    // Clamp-then-renormalise does NOT work: rescaling by the shrunk span multiplies every slope by
    // 1/span > 1 and restores exactly what was removed. The removed cost must go to the segments
    // NOT at the cap: water-filling, bisect k with sum(min(k*raw, SWING*dArc)) = 1.
    function _paceFloor(c, ss, S) {
      var n = c.length - 1, raw = [], dA = [], i;
      for (i = 1; i <= n; i++) { raw.push(c[i] - c[i - 1]); dA.push((ss[i] - ss[i - 1]) / S); }
      var sumAt = function (k) {
        var t = 0;
        for (var j = 0; j < raw.length; j++) t += Math.min(k * raw[j], FXS.CINEMA_PACE_SWING * dA[j]);
        return t;
      };
      if (sumAt(1e9) < 1) return c;                    // infeasible — leave the cost untouched
      var lo = 0, hi = 1;
      while (sumAt(hi) < 1 && hi < 1e9) hi *= 2;
      for (var it = 0; it < 60; it++) {
        var m = 0.5 * (lo + hi);
        if (sumAt(m) < 1) lo = m; else hi = m;
      }
      var out = [0];
      for (i = 0; i < raw.length; i++) out.push(out[i] + Math.min(hi * raw[i], FXS.CINEMA_PACE_SWING * dA[i]));
      var sp = out[n];
      if (sp > 1e-9) for (i = 0; i <= n; i++) out[i] /= sp;
      return out;
    }
    function _evenTurnBuild() {
      var ss = [], ts = [], prev = null, prevD = null, s = 0, th = 0;
      for (var i = 0; i <= _etN; i++) {
        var e = i / _etN, ps = _beat3Pose(e);
        var gx = ps.tx - ps.x, gy = ps.ty - ps.y, gz = ps.tz - ps.z;
        var gl = Math.hypot(gx, gy, gz) || 1; gx /= gl; gy /= gl; gz /= gl;
        if (prev) {
          s += Math.hypot(ps.x - prev.x, ps.y - prev.y, ps.z - prev.z);
          // Angle between successive gaze DIRECTIONS — the full 3D turn, so a pitch whip costs the
          // same as a yaw whip. Measuring yaw alone would leave §CINEMA_LOOKAHEAD_VERTICAL's class
          // of jump unpriced.
          th += Math.acos(Math.max(-1, Math.min(1, gx * prevD.x + gy * prevD.y + gz * prevD.z)));
        }
        ss.push(s); ts.push(th);
        prev = { x: ps.x, y: ps.y, z: ps.z }; prevD = { x: gx, y: gy, z: gz };
      }
      // A walk with no turn in it has no turn to even out: fall back to pure arc length, which is
      // byte-for-byte today's behaviour. Guards ts[i]/Θ against dividing by ~0.
      var w = (th > 1e-3) ? _etW : 0;
      var S = s || 1, T = th || 1;
      // The blended cost — RESTORED after measuring its replacement. A speed heuristic
      // v=f(noise) has no bound on turn-per-frame; this form does, by construction:
      //     dc = (1-w)(ds/S) + w(dθ/Θ)   ⇒   Δθ ≤ Θ/(w·N),  Δs ≤ S/((1-w)·N)
      // The noise-speed version was tried in both per-segment and windowed forms and MEASURED
      // WORSE on the metric that matters (Hospital 11.2 → 16.5 → 18.3 deg/frame), because
      // smoothing the noise removes the slowdown exactly at the corner that needed it. Keep the
      // provable bound; buy the headroom with FRAMES instead (§CPE_TURN_BUDGET).
      // §CPE_NOISE_LAW, the walk's share (user, 2026-07-27: "i thnk the stalls are ok, it may mean
      // a sec or two pause which is fine in the film" ... "but if the noise ratio tempers it a bit
      // also ok"). The stall is ACCEPTED, so this does not remove it — it TEMPERS it, and it does
      // so by finishing the law rather than by adding a second mechanism.
      //
      // The crawl happens where dθ dominates a cost step: the camera turns hard, cost runs out, and
      // metres-per-frame collapses. But a hard turn whose CONTENT is not changing is precisely the
      // "not moving makes a boring show" case — so weight each cost increment by the same bbox rate
      // of change the dive uses. A corner with little change stays cheap (the film keeps moving);
      // a corner where the scene really is turning over still pays. 32 density probes, interpolated
      // across the 240 cost samples — measured at ~15ms on Terminal's 48k rows, against a plan
      // budget already in the hundreds.
      var _nk = 32, nz = [], nzMax = 0, q;
      for (q = 0; q <= _nk; q++) {
        var pq = _beat3Pose(q / _nk);
        nz.push(_densityAt({ x: pq.x, y: pq.y, z: pq.z }, _noiseRadius(s)));
      }
      var nzC = [];
      for (q = 0; q <= _nk; q++) {
        var lo = nz[Math.max(0, q - 1)], hi = nz[Math.min(_nk, q + 1)];
        nzC.push(Math.abs(hi - lo));
        if (nzC[q] > nzMax) nzMax = nzC[q];
      }
      var noiseAt = function (e) {
        var x = Math.max(0, Math.min(_nk, e * _nk)), j = Math.min(_nk - 1, Math.floor(x)), f = x - j;
        return nzMax > 0 ? (nzC[j] * (1 - f) + nzC[j + 1] * f) / nzMax : 0;
      };
      var c = [0], acc = 0;
      for (i = 1; i <= _etN; i++) {
        var dRaw = (1 - w) * ((ss[i] - ss[i - 1]) / S) + w * ((ts[i] - ts[i - 1]) / T);
        acc += dRaw * (1 + (FXS.CINEMA_PACE_SWING - 1) * noiseAt((i - 0.5) / _etN));
        c.push(acc);
      }
      if (acc > 1e-9) for (i = 0; i <= _etN; i++) c[i] /= acc;
      c = _paceFloor(c, ss, S);
      _etC = c;
      console.log('§CPE_NOISE_LAW beat=walk src=bbox probes=' + (_nk + 1) +
        ' maxChange=' + nzMax + ' radius=' + _noiseRadius(s).toFixed(1) + 'm elems=' + _densPoints().length +
        ' — tempers the turn-driven crawl: a corner whose CONTENT is not changing stays cheap');
      console.log('§CPE_EVEN_TURN blended-cost, PACE_SWING=' + FXS.CINEMA_PACE_SWING +
        ' walkLen=' + s.toFixed(2) + 'm totalTurn=' + (th * 180 / Math.PI).toFixed(1) +
        'deg samples=' + (_etN + 1) +
        ' boundPerFrameTurn=' + (w > 0 ? (th * 180 / Math.PI / w).toFixed(1) + 'deg/N' : 'n/a') +
        ' speedRange=' + (1 / (1 - w)).toFixed(2) + 'x' +
        ' x1.5 more from the smoothstep ease at the beat midpoint');
    }
    // Monotone inverse of the cost table: given uniform progress in cost, return the walk fraction.
    function _evenTurnRemap(u) {
      if (!_etC) return u;
      u = Math.max(0, Math.min(1, u));
      var lo = 0, hi = _etN;
      while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (_etC[mid] <= u) lo = mid; else hi = mid; }
      var c0 = _etC[lo], c1 = _etC[hi], f = (c1 - c0 > 1e-12) ? (u - c0) / (c1 - c0) : 0;
      return (lo + Math.max(0, Math.min(1, f))) / _etN;
    }
    // Assert the seam is actually closed, on the poses that FLY: the angle between Beat 2's last
    // gaze and Beat 3's first. Logged rather than assumed — if a future change reopens it, the
    // number moves off zero here instead of surfacing as a jerk nobody can locate.
    (function () {
      var p0 = _beat3Pose(0);
      var dl = Math.hypot(p0.tx - p0.x, p0.ty - p0.y, p0.tz - p0.z) || 1;
      var d = (p0.tx - p0.x) / dl * _handDir.x + (p0.ty - p0.y) / dl * _handDir.y + (p0.tz - p0.z) / dl * _handDir.z;
      console.log('§CPE_SEAM_CONTINUOUS seamGapDeg=' +
        (Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI).toFixed(3) +
        ' (beat2 end -> beat3 start; must be ~0)');
    })();
    _evenTurnBuild();

    // ══ §CPE_STICK_HOLD, motion half — a raised-cosine RATE DIP, never a flat freeze ════════════
    // A hold must not be a piecewise-flat segment in the time map: that stops the camera with a
    // velocity STEP, which is precisely the discontinuity §CPE_JERK_DEFINITION and §CPE_EVEN_TURN
    // exist to kill, and no amount of pacing downstream can smooth a step. Instead the walk's rate
    // of travel-time consumption r(τ) DIPS smoothly to exactly zero and comes back:
    //
    //     plateau  P = h/2   at r = 0        (the genuine "stop a sec")
    //     ramps    R = h/2   each side, raised cosine
    //     ∫dip     = P + R   = h  EXACTLY    (the hold costs precisely its authored seconds)
    //     window   = 1.5h    total           ("slows a sec, stop a sec, then ease out")
    //
    // No new constant — the shape is fixed by h alone. Velocity is continuous, reaches zero across
    // the plateau, and the cost identity is exact rather than tuned, so G-SH-2/G-SH-3 can both be
    // asserted from the same number.
    //
    // Centring, derived not guessed: the dip is symmetric, so half its integral falls before the
    // centre. For the stop to land ON the stick's midpoint, the centre in BEAT-seconds must be
    //     c_i = u_i·T + Σ_{j<i} h_j + h_i/2
    // where u_i is the travel-time fraction at which the walk reaches that stick. That makes
    // travelElapsed(c_i) = u_i·T identically.
    var _holdMapTab = null, _holdBeatSec = 0, _holdTravelSec = 0;
    function _holdBuild() {
      if (!_holds.length) return;
      // The editor scales TRAVEL by the user's total and leaves the hold authored (_buildOverride),
      // so this subtraction is exact on that path. A hand-written override could still ask for a
      // walk shorter than its own holds; rather than produce negative travel, shrink the holds to
      // fit and SAY SO — a silently-clamped budget is the failure mode this lane keeps re-learning.
      if (_holdTotal >= _useSec.out * 0.9) {
        var _hs = (_useSec.out * 0.9) / _holdTotal;
        console.warn('§CPE_STICK_HOLD holds ' + _holdTotal.toFixed(2) + 's exceed 90% of the ' +
          _useSec.out.toFixed(2) + 's walk — scaled by ' + _hs.toFixed(3) + ' to keep travel positive');
        for (var _hq = 0; _hq < _holds.length; _hq++) _holds[_hq].sec *= _hs;
        _holdTotal *= _hs;
      }
      _holdTravelSec = Math.max(1e-6, _useSec.out - _holdTotal);   // travel only
      _holdBeatSec = _holdTravelSec + _holdTotal;
      // u_i: invert the walk's OWN chain. e3(w) = _evenTurnRemap(_cinemaEaseFloored(w)) is the arc
      // fraction actually flown at time fraction w, and it is monotone — so sample it once and read
      // the inverse off the same table the film uses. Sampling the real chain (not a re-derivation
      // of it) is the same discipline _beat3Pose's own comment records for the cost table.
      var NS = 512, e3s = [], q;
      for (q = 0; q <= NS; q++) e3s.push(_evenTurnRemap(FXS._cinemaEaseFloored(q / NS)));
      for (var i = 0; i < _holds.length; i++) {
        // f: arc fraction of this stick's midpoint, found by search against the flown curve rather
        // than by index arithmetic over outWp — corner rounding and §CPE_HOSE both mean band index
        // and arc position are not the same thing.
        var best = 0, bestD = Infinity;
        for (q = 0; q <= NS; q++) {
          var pf = _outPos(q / NS);
          var dd = Math.hypot(pf.x - _holds[i].c.x, pf.y - _holds[i].c.y, pf.z - _holds[i].c.z);
          if (dd < bestD) { bestD = dd; best = q / NS; }
        }
        _holds[i].f = best; _holds[i].fitM = bestD;
        // w such that e3(w) = f, off the same sampled chain.
        var wq = NS;
        for (q = 0; q <= NS; q++) if (e3s[q] >= best) { wq = q; break; }
        _holds[i].u = wq / NS;
      }
      _holds.sort(function(a, b) { return a.u - b.u; });
      var acc = 0;
      for (i = 0; i < _holds.length; i++) {
        _holds[i].c_beat = _holds[i].u * _holdTravelSec + acc + _holds[i].sec / 2;
        acc += _holds[i].sec;
      }
      // Integrate r = 1 - Σdip over beat-seconds into a monotone table: beat fraction → travel
      // fraction, which is exactly what the chain below wants as its input.
      var NT = 2048, tab = [0], travel = 0, dt = _holdBeatSec / NT;
      for (q = 1; q <= NT; q++) {
        var tau = (q - 0.5) * dt, dip = 0;
        for (i = 0; i < _holds.length; i++) {
          var h = _holds[i].sec, a = Math.abs(tau - _holds[i].c_beat);
          if (a <= h / 4) dip += 1;
          else if (a <= 3 * h / 4) dip += 0.5 * (1 + Math.cos(Math.PI * (a - h / 4) / (h / 2)));
        }
        travel += Math.max(0, 1 - Math.min(1, dip)) * dt;
        tab.push(travel);
      }
      var span = tab[NT] || 1;
      for (q = 0; q <= NT; q++) tab[q] /= span;                    // → [0,1] travel fraction
      _holdMapTab = tab;
      console.log('§CPE_STICK_HOLD holds=' + _holds.length + ' totalSec=' + _holdTotal.toFixed(2) +
        ' travelSec=' + _holdTravelSec.toFixed(2) + ' beatSec=' + _holdBeatSec.toFixed(2) +
        ' stops=[' + _holds.map(function(o) {
          return 'band' + o.band + '@u=' + o.u.toFixed(3) + '/' + o.sec.toFixed(2) + 's(fit' +
                 o.fitM.toFixed(2) + 'm)'; }).join(' ') + ']' +
        ' — plateau h/2 at zero rate, cosine ramps h/2, integral == authored seconds');
    }
    // ══ §CPE_STICK_HOLD_AIM_RETIRED (2026-09-02) — the aim half is REMOVED with §CPE_AIM_DEPTH ═══
    // ⚠ THIS IS THE KNOWN COST OF §CPE_AIM_DEPTH_RETIRED, decided here rather than discovered later.
    //
    // What used to be here: `_holdBoostAt(w3)`, a monotone smoothstep on the beat's TIME fraction
    // that ramped to 1 across a hold. Its ONLY consumer was `_aimDepthApply`'s `boost` argument, and
    // its only gate was `_aimDepthSeries.has` — both gone. It cannot be re-pointed at anything: the
    // subject it strengthened the aim TOWARD was §CPE_AIM_DEPTH's far-facade centroid, and that
    // subject no longer exists.
    //
    // THE RULING: a held beat is now a PURE RATE DIP. The motion half (`_holdBuild`/`_holdMap`,
    // above) is untouched and still integrates to exactly the authored seconds. During the plateau
    // travel stops, e3 is constant, and every surviving gaze rule is indexed by e3 — so the gaze is
    // constant across the stop unless a pin or a correction window covers that arc position.
    //
    // WHY NOT REPLACE IT WITH SOMETHING. The original defect it fixed was real (measured 0.02 deg of
    // rotation across a parked 18-sample stop, G-SH-5) and the user's words were "it slows a sec
    // stop a sec, then ease out WHILE THE CAM IS TURNING TO THE BUILDING". But every candidate
    // replacement is a NEW automatic gaze rule with a NEW constant — how far to swing, toward what,
    // over how long — and that is precisely what the 2026-09-02 directive rules out: "its best to
    // leave alone its pointing along its path ... user change of head at intended better angles is
    // all needed, to stay simple and predictable." Inventing a rotation for a hold would reinstate
    // the class of thing being retired, and the PRIME RULE forbids inventing the constants it needs.
    //
    // WHAT THE USER USES INSTEAD, and it is a mechanism that already ships: §CPE_AIM_PIN. A pin on
    // the held band's own Voronoi zone points the gaze wherever the user chose, and because a hold
    // stops travel inside exactly that zone, the parked camera holds the authored angle for the
    // authored seconds. That is the "user change of head at intended better angles" the directive
    // names, and it is authored rather than guessed. A hold with no pin is now, by design, a
    // deliberate pause on the path-follow gaze — simple and predictable, which is the stated goal.
    //
    // `w3` is consequently dead as an input to `_beat3Pose` (see its own marker). The parameter is
    // kept, the boost is not.
    // Beat-time fraction → travel-time fraction. Identity when nothing is held, so a path with no
    // holds is byte-identical to before this feature existed (G-SH-8).
    function _holdMap(w) {
      if (!_holdMapTab) return w;
      var t = Math.max(0, Math.min(1, w)) * (_holdMapTab.length - 1);
      var i = Math.min(_holdMapTab.length - 2, Math.floor(t));
      return _holdMapTab[i] + (_holdMapTab[i + 1] - _holdMapTab[i]) * (t - i);
    }
    _holdBuild();

    // ══ §CPE_GAZE_CONSTANT_RATE — the gaze may never turn faster than the film's own turn rate ═══
    // MEASURED CAUSE (2026-08-01, G-SH-4): removing §CPE_AIM_LATCH's outgoing taper exposed a
    // 29.01 deg/sample gaze whip at w=0.850 on Hospital, against 2.62 there on origin/main. The
    // taper had been MASKING a fast swing inside the walk — not merely smoothing the Beat 4 hand-off
    // as its own comment claimed. Re-tapering would undo the user's "the turning should be thruout,
    // till the end of clip", so the swing is bounded at its cause instead.
    //
    // The law: the composed gaze — look-ahead, seam blend, §CPE_AIM_DEPTH's exception, all
    // of it — is sampled in TIME and rate-limited to CINEMA_TURN_DPS, the rate the spin, the orbit
    // lap and the walk's own turn charge are ALREADY priced at. Not a new constant, and not a new
    // opinion about how fast a camera should turn: it is the number this film already uses
    // everywhere else, finally applied to the thing that actually rotates.
    //
    // Sampled in TIME, not in e3 — with §CPE_STICK_HOLD a hold makes travel stop while time runs, so
    // a limit expressed per unit of travel would be unbounded exactly where the camera is parked and
    // turning, which is the one place this feature deliberately creates rotation.
    //
    // Forward-only, so it LAGS rather than anticipating; that is correct for a camera operator and
    // it is safe here because §CPE_BEAT3_END_DIR already made Beat 4 open on Beat 3's real final gaze,
    // so wherever the limiter leaves the gaze, the hand-off follows it. Pure function of w3 — no
    // per-frame state, so poseAt stays order-independent and replans stay byte-identical.
    // The limiter spans Beat 3 AND Beat 4 as ONE continuous stretch of film — [tS, tR]. Limiting
    // only the walk was measured to MOVE the whip rather than remove it: Terminal went 4.1 -> 34.9
    // deg/frame at u=0.645, and `out` there is 0.6442, so the peak had simply relocated into Beat 4,
    // which is exactly where the gaze swings from wherever the aim rule left it onto the pivot
    // bearing. One span, one bound, no seam for a whip to hide in.
    function _spanFracOf(tNorm) {
      return (tNorm - tS) / Math.max(1e-6, tR - tS);
    }
    var _gazeLim = null, _gazeLimN = 512;
    function _gazeRateBuild() {
      var i, raw = [], sp, tt, e, p, dx, dy, dz, L;
      for (i = 0; i <= _gazeLimN; i++) {
        sp = i / _gazeLimN;
        tt = tS + (tR - tS) * sp;
        if (tt <= tO) {
          var w3b = (tt - tS) / Math.max(1e-6, tO - tS);
          e = _evenTurnRemap(FXS._cinemaEaseFloored(_holdMap(w3b)));
          p = _beat3Pose(e, w3b);
        } else {
          // §CPE_DISCIPLINE_REVEAL: Beat 4's real boundary is tV (not tO) whenever the reveal round
          // is inserted — MUST match poseAt's own Beat 4 formula below or this table's Beat 4 portion
          // (the only portion _spanFracOf ever actually looks up above tO — see that function's own
          // comment) samples the wrong e4 entirely. tt in (tO,tV] clamps to e4=0 (_cinemaEaseFloored
          // clamps internally) — dead, never-queried table entries, not wrong ones, since _spanFracOf
          // only ever produces indices in [tS,tO] or [tV,tR], never inside the gap itself.
          p = _beat4Pose(FXS._cinemaEaseFloored((tt - tV) / Math.max(1e-6, tR - tV)));
        }
        dx = p.tx - p.x; dy = p.ty - p.y; dz = p.tz - p.z;
        L = Math.hypot(dx, dy, dz) || 1;
        raw.push({ x: dx / L, y: dy / L, z: dz / L });
      }
      var stepSec = Math.max(1e-6, (tR - tS) * durationSec) / _gazeLimN;
      var maxAng = FXS.CINEMA_TURN_DPS * stepSec * Math.PI / 180;
      var lim = [raw[0]], cur = raw[0], rawPeak = 0, limPeak = 0, acqPeakMult = 1;
      for (i = 1; i <= _gazeLimN; i++) {
        var rp = Math.acos(Math.max(-1, Math.min(1,
          raw[i].x * raw[i - 1].x + raw[i].y * raw[i - 1].y + raw[i].z * raw[i - 1].z))) * 180 / Math.PI;
        if (rp > rawPeak) rawPeak = rp;
        var _resid = Math.acos(Math.max(-1, Math.min(1,
          cur.x * raw[i].x + cur.y * raw[i].y + cur.z * raw[i].z)));
        var _cap = FXS._gazeAcquireCap(_resid, maxAng);
        if (_cap / maxAng > acqPeakMult) acqPeakMult = _cap / maxAng;
        var nxt = FXS._rotToward(cur, raw[i], _cap);
        var lp = Math.acos(Math.max(-1, Math.min(1,
          nxt.x * cur.x + nxt.y * cur.y + nxt.z * cur.z))) * 180 / Math.PI;
        if (lp > limPeak) limPeak = lp;
        cur = nxt; lim.push(cur);
      }
      _gazeLim = lim;
      console.log('§CPE_GAZE_CONSTANT_RATE probes=' + (_gazeLimN + 1) + ' spanSec=' + ((tR - tS) * durationSec).toFixed(2) +
        ' (beats 3+4) walkSec=' + _useSec.out.toFixed(2) +
        ' capDps=' + FXS.CINEMA_TURN_DPS + ' capPerProbeDeg=' + (maxAng * 180 / Math.PI).toFixed(3) +
        ' rawPeakDeg=' + rawPeak.toFixed(2) + ' limitedPeakDeg=' + limPeak.toFixed(2) +
        ' rawPeakDps=' + (rawPeak / stepSec).toFixed(1) + ' limitedPeakDps=' + (limPeak / stepSec).toFixed(1) +
        ' acquirePeakMult=' + acqPeakMult.toFixed(2) + 'x (max ' + FXS.GAZE_ACQUIRE_MAX + 'x)' +
        ' — the composed gaze, bounded at the rate the spin and orbit already turn at');
    }
    function _gazeRateAt(w) {
      if (!_gazeLim) return null;
      var t = Math.max(0, Math.min(1, w)) * _gazeLimN;
      var i = Math.min(_gazeLimN - 1, Math.floor(t)), f = t - i;
      var a = _gazeLim[i], b = _gazeLim[i + 1];
      // nlerp: adjacent samples are at most capPerProbeDeg apart by construction, so the chord error
      // is negligible and slerp would buy nothing but a trig call per frame.
      var x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f, z = a.z + (b.z - a.z) * f;
      var L = Math.hypot(x, y, z) || 1;
      return { x: x / L, y: y / L, z: z / L };
    }
    // §CPE_BEAT3_END_DIR — Beat 3's REAL final gaze direction, sampled from the pose that actually
    // flies. RENAMED from §CPE_AIM_LATCH 2026-09-02 (§CPE_AIM_DEPTH_RETIRED) and this is not
    // cosmetic: §CPE_AIM_LATCH named the running MAX over §CPE_AIM_DEPTH's weight field, which is
    // retired. Leaving the retired rule's tag on a surviving, unrelated mechanism would tell the
    // next session the latch is still alive — the exact ambiguity CLAUDE.md §0a warns about. The
    // line itself is NOT suppressed (rule 3): it is the same measurement under an accurate name.
    // Only witness_cpe_stick_hold.js read the old tag, and it is updated in the same commit.
    // Beat 4 used to open on the hardcoded (odx,0,odz) outward push, justified by the comment
    // "(odx,odz) IS the direction Beat 3 ends on". That was true only while the aim rules were
    // tapered to zero before e3=1; with the taper gone it is false, and believing it is exactly the
    // 88.4 deg/frame seam snap the taper was introduced to hide. Sampled, never assumed.
    // ⚠ This is the RAW Beat 3 ending, and it must be: _gazeRateBuild samples _beat4Pose, which reads
    // this, so it has to exist BEFORE the limiter is built (an earlier cut read the limited series
    // here and _beat3EndDir was `undefined` at build time). It is also the right value — its job is
    // to make Beat 4's RAW signal continuous with Beat 3's RAW signal, and the limiter, which now
    // spans both beats as one stretch, smooths the composition afterwards.
    var _b3e = _beat3Pose(1, 1);
    var _b3dx = _b3e.tx - _b3e.x, _b3dy = _b3e.ty - _b3e.y, _b3dz = _b3e.tz - _b3e.z;
    var _b3dL = Math.hypot(_b3dx, _b3dy, _b3dz) || 1;
    var _beat3EndDir = { x: _b3dx / _b3dL, y: _b3dy / _b3dL, z: _b3dz / _b3dL };
    var _b3Off = Math.acos(Math.max(-1, Math.min(1, _beat3EndDir.x * odx + _beat3EndDir.z * odz))) * 180 / Math.PI;
    console.log('§CPE_BEAT3_END_DIR beat3EndDir=(' + _beat3EndDir.x.toFixed(3) + ',' + _beat3EndDir.y.toFixed(3) +
      ',' + _beat3EndDir.z.toFixed(3) + ') offOutwardDeg=' + _b3Off.toFixed(1) +
      ' — Beat 4 opens on THIS, not on (odx,odz); offOutwardDeg is exactly the seam snap the old taper hid');
    _gazeRateBuild();

    // ══ §CPE_STICK_APPROACH — "which stick is the camera heading toward", for the MaxQ bake HUD ══
    // Implementing prompts/CINEMA_PATH_EDITOR.md §CPE_STICK_APPROACH. A "stick" is a band the user
    // explicitly dropped (`_stick===true`, §CPE_REOPEN_NODE's rule — settle/exit-door/stop bands are
    // never sticks even though they are also entries in `bands`). `_s` is each stick's arc-length
    // fraction along the WALK (0=settle end, 1=stop end), recorded at spawn time
    // (cinema_path_editor.js `hit.s`) and already carried through the override → plan round-trip
    // above — no new authored field, just reading what's already there.
    //
    // The position-in-the-walk a given frame is AT is `e3` — exactly the number Beat 3's own poseAt
    // branch computes at effects.js "var e3 = _evenTurnRemap(_cinemaEaseFloored(_holdMap(w3)));"
    // (the walk's live arc-fraction chain, holds included). Reusing that chain rather than a second
    // one is deliberate: a stick with a hold on it dwells in TIME without advancing arc, and only the
    // real chain (via `_holdMap`) knows that — a naive time-fraction estimate would report the camera
    // "past" a held stick while it is still parked in front of it.
    var _stickList = [];
    if (FXS._cpeBands) {
      for (var _sb = 0; _sb < FXS._cpeBands.length; _sb++) {
        if (FXS._cpeBands[_sb]._stick) _stickList.push({ index: _stickList.length + 1, s: +(FXS._cpeBands[_sb]._s || 0) });
      }
    }
    function _stickApproachAt(tNorm) {
      if (!_stickList.length) return null;
      tNorm = Math.max(0, Math.min(1, tNorm));
      var e3;
      if (tNorm <= tS) e3 = 0;          // dive/spin: still heading for the first stick
      else if (tNorm >= tO) e3 = 1;     // rise/orbit: the walk (and every stick on it) is behind us
      else {
        var w3 = (tNorm - tS) / Math.max(1e-6, tO - tS);
        e3 = _evenTurnRemap(FXS._cinemaEaseFloored(_holdMap(w3)));
      }
      for (var i = 0; i < _stickList.length; i++) {
        if (_stickList[i].s >= e3 - 1e-6) return { index: _stickList[i].index, count: _stickList.length, s: _stickList[i].s, e3: e3 };
      }
      return null; // past the last stick — nothing left to approach
    }
    if (_stickList.length) console.log('§CPE_STICK_APPROACH sticks=' + _stickList.length +
      ' s=[' + _stickList.map(function(o) { return o.s.toFixed(3); }).join(',') + ']');

    // Plan cost is dominated by the BVH fans + floor raycasts. Measured on this project's headless
    // ANGLE/SwiftShader rig: Duplex ~20-70ms, Terminal/Hospital ~500-750ms — a one-off cost at the
    // moment Alt+C is pressed, before a 24s recording. Logged so a regression is visible, not guessed.
    console.log('§CINEMA_PLAN_MS ' + (((typeof performance !== 'undefined') ? performance.now() : 0) - _planT0).toFixed(1) +
      ' (fanRays=' + FXS.CINEMA_FAN_RAYS + ' spaceCands=' + spaceCands.length + ' exitCands=' + exitScored.length + ')');
    return { base: base, envelope: envelope, arcOnly: !!arcBboxRaw, fillDistance: fillDistance,
             pushInRadius: pushInRadius, radiusMin: radiusMin, radiusMax: radiusMax,
             pivot: pivot, pivotSrc: pivotSrc, settle: settle, exit: chosenExit, orbitRadius: orbitRadius, walkBusy: _walkBusyProbes,
             beats: { dive: tD, spin: tS, out: tO, pullout: tP, flyback: tF, reveal: tV, rise: tR },
             // §CPE_DISCIPLINE_REVEAL_PULLOUT — the pacing info A.cpeRevealVisualAt(plan, tNorm) and
             // A.cpeRevealCaptionAt(plan, tNorm) need to compute which visual phase/caption a given
             // tNorm falls in, exposed here rather than recomputed (or duplicated) outside this
             // closure. `riseSec` is the UNFOLDED pull-back budget (matches beats.rise minus the
             // folded tail) — cpeRevealVisualAt needs it separately to find the tail/rise-proper split
             // inside the now-larger [tV,tR] span. `qtyCost` is the "good touch" nice-to-have (see
             // A.cpeRevealDiscQtyCost's own comment) — {} when the DB query is unavailable/failed.
             reveal: { discs: _revealDiscs, pulloutSec: _revealPulloutSec, roundSec: _revealRoundSec,
                       tailSec: _revealTailSec, riseSec: _useSec.rise, qtyCost: _revealQtyCost,
                       // §ALTC_V2 V5/V6: road film — build-up tops out at the drive's midpoint, the parade fills [a, b]
                       inDrive: (_civilPace && _revealDiscs.length) ? { a: FXS._civilTopoutU(tS, tO), b: tO } : null },
             // §STOREY_HIGHLIGHT_REVEAL — arms the LAST `windowFrac` of the `pullback` beat, ending
             // exactly at plan.beats.rise (orbit start) — see §STOREY_REVEAL_WINDOW above for the
             // corrected math (this is NOT the orbit beat itself). cpe_storey_reveal.js's
             // A.storeyRevealVisualAt reads `beats.rise - windowFrac .. beats.rise`; the storey
             // list/stats are queried live from A.db (cached), never baked in here.
             storeyReveal: { on: !!FXS._cpeStoreyReveal, windowFrac: FXS._cpeStoreyReveal ? _storeyRevealWindowFrac : 0 },
             // §CINEMA_PATH_EDITOR: the editor's table renders `waypoints` (authored control points,
             // NOT the rounded flown polyline) and re-times off `pathLen`. `sec` echoes the beat
             // seconds actually in force for this plan so the editor never has to guess them back
             // out of the normalized beat fractions.
             waypoints: outWp.map(function(w) { return { x: w.x, y: w.y, z: w.z }; }),
             // §CPE_REOPEN_NODE: `_stick`/`_s` ride along. The plan is what the editor RE-OPENS from
             // (cinema_path_editor.js:1454), so dropping them here made a re-opened path fall back to
             // "every middle band is a stick" — which mislabels seeded bands and, now that colour
             // follows provenance, would paint them as nodes the user never added. Measured RED by
             // witness_cpe_reopen_node.js G-RN-3 with only the editor side of this fix in place.
             bands: FXS._cpeBands ? FXS._cpeBands.map(function(b) {
               // §CPE_STICK_HOLD rides along for the same reason `_stick`/`_s` do (§CPE_REOPEN_NODE):
               // the plan is what the editor RE-OPENS from, so a dropped field silently resets the
               // user's typed hold to 0 on the next OK.
               // §CPE_AIM_PIN rides along for the same reason: the plan is what the editor
               // RE-OPENS from, so a dropped field would silently un-pin every band on the next OK.
               return { c: { x: b.c.x, y: b.c.y, z: b.c.z }, d: { x: b.d.x, y: b.d.y, z: b.d.z }, len: b.len,
                        hold: +(b.hold || 0), _stick: b._stick, _s: b._s,
                        lookAt: b.lookAt ? { x: b.lookAt.x, y: b.lookAt.y, z: b.lookAt.z } : null };
             }) : null,
             // §CPE_CONE_ORIENT_ADJUST rides along for the same §CPE_REOPEN_NODE reason as `bands`
             // above: the plan is what the editor RE-OPENS from, so a dropped field would silently
             // discard every corrected gaze on the next OK.
             aimCorrections: FXS._cpeCorrections ? FXS._cpeCorrections.map(function(c) {
               return { pos: { x: c.pos.x, y: c.pos.y, z: c.pos.z }, dir: { x: c.dir.x, y: c.dir.y, z: c.dir.z },
                        ramp: +(c.ramp != null ? c.ramp : 2), hold: +(c.hold != null ? c.hold : 5),
                        decay: +(c.decay != null ? c.decay : 4) };
             }) : null,
             flownPoints: flowWp.length, pathLen: totalLen, route: outRoute, authored: outRoute === 'authored',
             sec: { dive: _useSec.dive, spin: _useSec.spin, out: _useSec.out, pullout: _useSec.pullout,
                    flyback: _useSec.flyback, reveal: _useSec.reveal, rise: _useSec.rise },
             naturalSec: _natSec, naturalTotal: _natTotal,
             eyeM: FXS.CINEMA_EYE_M, lookdownDeg: FXS.CINEMA_LOOKDOWN_DEG, durationSec: durationSec,
             indoor: true, poseAt: poseAt,
             // §CPE_STICK_APPROACH: stickCount=0 (the common case — no editor bands, or bands with no
             // user-dropped sticks) means the bake HUD adds nothing; stickApproachAt(tNorm) returns
             // {index, count, s, e3} for the next stick ahead, or null once the walk is past all of them.
             stickCount: _stickList.length, stickApproachAt: _stickApproachAt };
  }
  // ══ §CINEMA_PATH_EDITOR — the override seam. Deliberately a THIN WRAPPER rather than edits inside
  // _cinemaPathPlan: the plan function is 600+ lines and its §CINEMA_SPACE block is another session's
  // working set (see the spec's DO-NOT-REMOVE header), so this feature touches it as little as
  // possible. The overridable inputs are module-level `var`s in this same IIFE, so they can be set,
  // the untouched plan called, and restored in `finally`.
  // Guardrail 2 falls out for free: with no override this calls _cinemaPathPlan(durationSec) with
  // every global at its original value — the same function with the same inputs, so "OK without an
  // edit is byte-identical to today" is a property of the code, not a hope pinned on a test.
  var _CPE_KEYS = [['diveSec', 'CINEMA_DIVE_SEC'], ['spinSec', 'CINEMA_SPIN_SEC'],
                   ['outSec', 'CINEMA_OUT_SEC'], ['riseSec', 'CINEMA_RISE_SEC'],
                   ['eyeM', 'CINEMA_EYE_M'], ['lookdownDeg', 'CINEMA_LOOKDOWN_DEG']];
  function _cpeSet(name, v) {
    if (name === 'CINEMA_DIVE_SEC') FXS.CINEMA_DIVE_SEC = v;
    else if (name === 'CINEMA_SPIN_SEC') FXS.CINEMA_SPIN_SEC = v;
    else if (name === 'CINEMA_OUT_SEC') FXS.CINEMA_OUT_SEC = v;
    else if (name === 'CINEMA_RISE_SEC') FXS.CINEMA_RISE_SEC = v;
    else if (name === 'CINEMA_EYE_M') FXS.CINEMA_EYE_M = v;
    else if (name === 'CINEMA_LOOKDOWN_DEG') FXS.CINEMA_LOOKDOWN_DEG = v;
  }
};
