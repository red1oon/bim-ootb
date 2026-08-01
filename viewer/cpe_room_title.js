/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// cpe_room_title.js — §CPE_ROOM_TITLE (prompts/RESUME_CPE_ROOM_TITLE.md): a room-name title card
// that appears as the Film-Maker's camera enters each room, behind a checkbox, OFF by default.
// Naming is NOT reinvented here — every title runs through A.friendlyName, the same verb the Find
// panel and §HOVER_NAME use (HOVER_NAME.md's own coverage sweep is what proved that pipeline).
// The one real problem this file solves: cinema_maxq.js's _captureFrame grabs the renderer CANVAS
// only, so an HTML caption would be invisible in the exported video (HOVER_NAME.md's DOM label
// trick does NOT transfer here). Titles are composited onto a 2D context directly — either the
// bake's captured frame, or a live overlay canvas positioned over the WebGL canvas for editing —
// through the SAME draw routine, so the preview can never look different from what actually bakes.
function setupCpeRoomTitle(A) {
  var SAMPLE_DT = 0.15;   // seconds between coarse room-at-time samples when building the timeline
  // §CPE_ROOM_TITLE_DWELL_FLOOR (2026-08-02) — was 1.4s, "so six small rooms in four seconds must
  // not strobe six titles". That reasoning predates §CPE_ROOM_TITLE_LEAD, which now enforces the
  // SAME property downstream and better: `show < lastShow + MIN_HOLD` already guarantees captions
  // are >= 3s apart no matter how many rooms the walk crosses. Two independent strobe-limiters meant
  // the first one was silently LOSING rooms the second would have captioned correctly — a room
  // genuinely visited for 1.2s was binned even though LEAD+HOLD would have given it a readable 3s
  // caption opening 2s before the doorway. The floor now only rejects a GRAZE (a sample or two of
  // clipping a corner), which is a data-quality test, not a legibility one — legibility is MIN_HOLD's
  // job and it is guaranteed there. 3 samples at SAMPLE_DT=0.15.
  var MIN_DWELL = 0.45;
  var FADE = 0.4;         // seconds — fade in/out
  // §CPE_ROOM_TITLE_HOLD (user, 2026-08-01: "give it 3 secs, because user will know u just passed
  // that room, and of course, if another room cuts in by 2 secs, then it can replace so").
  // A caption used to vanish the instant the camera left the room, so a 1.5s crossing produced a
  // 1.5s label — measured on their own Hospital film: four of six labels were under 2 seconds and
  // they could not read them. The label now stays up for at least MIN_HOLD, which is what makes it
  // legible; it is CUT SHORT only by the next room's caption, because the newer room is what the
  // viewer is actually in.
  var MIN_HOLD = 3.0;     // seconds — floor on how long a caption stays readable
  // §CPE_ROOM_TITLE_LEAD (user, 2026-08-01: "room labelling ... should not wait to be in the room but
  // as it is heading towards a room, about 2 secs before will be view point friendly", then "for every
  // room too... not wait till inside room it can be too late as 3 secs optimum label appearance", then
  // "even though just left room,.. but when new room appears, it tries to show also up to 3 secs.. and
  // if misses, then skips"). A caption is a 3-SECOND SLOT THAT OPENS 2s BEFORE THE DOORWAY: the name
  // arrives as a documentary lower-third does, just before its subject. It is a lead-in — it names the
  // room being ENTERED, which is why it may never be described as "where the camera is".
  var LEAD = 2.0;         // seconds — how early a caption appears, ahead of the room it names

  // Point-in-room via the shared room graph (A.getRoomGraph — the ONE cache per building every
  // other room consumer already shares, FLY_TOUR_CORRIDOR_GRAPH.md §S2). Only 'room'-kind nodes
  // carry a rect footprint (real IfcSpace + synthesized corridors both do; stair/circulation
  // waypoint nodes are points, not polygons, and simply produce no title — same scope CINEMA_DIVE's
  // own room search already accepts). z-closest match disambiguates stacked floors whose plan
  // rects overlap.
  // §CPE_ROOM_TITLE_HEIGHT_BLIND (user, 2026-07-31: "u can see the room labels are Level 2 two rooms
  // when we are flying quite high"). The storey pitch this building states about ITSELF: the median
  // gap between the distinct storey z values already in the graph. No constant is invented — a
  // bungalow and a hospital get their own band. Cached per graph object; the graph is one-per-
  // building (FLY_TOUR_CORRIDOR_GRAPH.md §S2) so identity is a safe cache key.
  var _pitchGraph = null, _pitchM = 0;
  function _storeyPitch(g) {
    if (g === _pitchGraph) return _pitchM;
    var zs = [], seen = {};
    for (var k in g.nodesByGuid) {
      var n = g.nodesByGuid[k];
      if (!n || n.kind !== 'room' || n.cz == null) continue;
      var key = Math.round(n.cz * 10) / 10;
      if (!seen[key]) { seen[key] = 1; zs.push(n.cz); }
    }
    zs.sort(function(a, b) { return a - b; });
    var gaps = [];
    for (var i = 1; i < zs.length; i++) { var d = zs[i] - zs[i - 1]; if (d > 0.5) gaps.push(d); }
    gaps.sort(function(a, b) { return a - b; });
    // Single-storey building (or one z cluster): no pitch is derivable from the data, so the height
    // test is DISABLED rather than guessed at — 0 means "no band", and _roomAtIfcPoint falls back to
    // exactly today's behaviour. A wrong invented pitch would suppress real titles.
    _pitchGraph = g;
    _pitchM = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
    return _pitchM;
  }

  // Set by the timeline build so the console can say WHY a film had few titles.
  var _rejectedByHeight = 0;

  function _roomAtIfcPoint(ix, iy, iz) {
    var g = (typeof A.getRoomGraph === 'function') ? A.getRoomGraph() : null;
    if (!g || !g.nodesByGuid) return null;
    // §CPE_ROOM_TITLE_HEIGHT_BLIND: z used to RANK candidates and never REJECT one, so a camera 40 m
    // above the roof still resolved to whatever footprint it was flying over and the tie-break
    // handed it the nearest storey. Half a pitch is "inside this room's slice of the building";
    // beyond it there is no title at all, same as anywhere else with no room (never a fabricated one).
    // MEASURED, not tuned (Duplex, 2026-07-31): room datums sit at z = -0.63 / 1.62 / 4.63 / 6.40,
    // pitch 2.25 m, and the building's OWN derived walk climbs through z 2.09 -> 4.92, spending its
    // middle 1.2-1.5 m above Level 1's datum. A half-pitch band deleted that entirely legitimate
    // caption (witness_cpe_room_title_timing.js went 3/3 -> 1/2). ONE pitch is the defensible line
    // and states something true about buildings: a room stops claiming you when you are a full floor
    // away from its datum. The user's case is rejected by ~6x margin, not by 1 m of tuning.
    var pitch = _storeyPitch(g), band = pitch > 0 ? pitch : Infinity;
    var best = null, bestDz = Infinity, hadPlanHit = false;
    for (var k in g.nodesByGuid) {
      var n = g.nodesByGuid[k];
      if (!n || n.kind !== 'room' || !n.rects || !n.rects.length) continue;
      for (var i = 0; i < n.rects.length; i++) {
        var r = n.rects[i];
        if (ix < r.x0 || ix > r.x1 || iy < r.y0 || iy > r.y1) continue;
        hadPlanHit = true;
        var dz = Math.abs((n.cz || 0) - iz);
        if (dz > band) break;                       // over it, not in it
        if (dz < bestDz) { bestDz = dz; best = n; }
        break;
      }
    }
    if (!best && hadPlanHit) _rejectedByHeight++;
    return best;
  }

  // §CPE_ROOM_TITLE_GAZE (user ruling 2026-08-01, on the measured §CPE_ROOM_TITLE_FLYOVER_BLIND —
  // "Label what the camera looks at"): a caption names the room the camera is LOOKING INTO, not the
  // one it is standing in. A 147.9s Hospital flyover produced ONE caption under containment, because
  // 31% of its samples were over a room's footprint but a full storey above its datum — the camera
  // is simply never inside anything.
  //
  // Ray vs. room AABB, exact, no marching. A step size would be an invented constant that either
  // skips through small rooms or costs hundreds of steps a sample; the slab test needs none and is
  // the same O(rooms) per sample the point test already pays. The room's box is the one it already
  // has: `rects` for x/y, and the SAME storey band `_roomAtIfcPoint` uses for z — reused, never
  // relaxed, so a ray passing 20 m above a room still misses it and §CPE_ROOM_TITLE_HEIGHT_BLIND
  // (PR #1108) stays closed. Nearest positive hit wins.
  var _gazeMissedAll = 0;
  function _roomAlongGaze(ox, oy, oz, dx, dy, dz) {
    var g = (typeof A.getRoomGraph === 'function') ? A.getRoomGraph() : null;
    if (!g || !g.nodesByGuid) return null;
    var L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!(L > 1e-9)) return null;
    dx /= L; dy /= L; dz /= L;
    var pitch = _storeyPitch(g), band = pitch > 0 ? pitch : Infinity;
    var best = null, bestT = Infinity, bestDz = Infinity;
    for (var k in g.nodesByGuid) {
      var n = g.nodesByGuid[k];
      if (!n || n.kind !== 'room' || !n.rects || !n.rects.length) continue;
      // An infinite band (single-storey building, no pitch derivable) makes the z slab a no-op —
      // the same disabling _roomAtIfcPoint already does rather than guess a height.
      var z0 = (n.cz || 0) - band, z1 = (n.cz || 0) + band;
      for (var i = 0; i < n.rects.length; i++) {
        var r = n.rects[i];
        var tN = -Infinity, tF = Infinity, s;
        // x slab
        if (Math.abs(dx) < 1e-12) { if (ox < r.x0 || ox > r.x1) continue; }
        else {
          var ax = (r.x0 - ox) / dx, bx = (r.x1 - ox) / dx;
          if (ax > bx) { s = ax; ax = bx; bx = s; }
          if (ax > tN) tN = ax; if (bx < tF) tF = bx;
        }
        // y slab
        if (Math.abs(dy) < 1e-12) { if (oy < r.y0 || oy > r.y1) continue; }
        else {
          var ay = (r.y0 - oy) / dy, by = (r.y1 - oy) / dy;
          if (ay > by) { s = ay; ay = by; by = s; }
          if (ay > tN) tN = ay; if (by < tF) tF = by;
        }
        // z slab — the storey band, identical to the point test's
        if (isFinite(band)) {
          if (Math.abs(dz) < 1e-12) { if (oz < z0 || oz > z1) continue; }
          else {
            var az = (z0 - oz) / dz, bz = (z1 - oz) / dz;
            if (az > bz) { s = az; az = bz; bz = s; }
            if (az > tN) tN = az; if (bz < tF) tF = bz;
          }
        }
        if (tF < 0 || tN > tF) continue;          // behind the camera, or no overlap
        var tHit = tN < 0 ? 0 : tN;               // inside the box already -> hit at the camera
        // ⚠ Ties are NOT hash order. Stacked storeys share x/y, so a camera standing inside one room
        // is inside several room BOXES at once and every one of them hits at t=0 — whichever the
        // `for..in` reached first would win, and witness_cpe_room_title.js caught exactly that
        // (segment 2 came back as "≈ Level 1 R2" instead of the room the camera was in). The point
        // test has always broken this tie by NEAREST STOREY DATUM; the ray must do the same, or the
        // gaze rule silently loses §CPE_ROOM_TITLE's floor disambiguation.
        var dzHit = Math.abs((n.cz || 0) - (oz + dz * tHit));
        if (tHit < bestT - 1e-6 || (Math.abs(tHit - bestT) <= 1e-6 && dzHit < bestDz)) {
          bestT = tHit; bestDz = dzHit; best = n;
        }
        break;
      }
    }
    if (!best) _gazeMissedAll++;
    _lastGazeT = best ? bestT : null;
    return best;
  }
  var _lastGazeT = null;

  // Exposed so witness_cpe_room_title_gaze.js gates THIS ray, not a re-implementation of it, and can
  // recompute the hit point itself to prove the captioned room really contains it (G-GZ-2).
  // The rule this REPLACES, exposed so G-GZ-1's baseline is the real previous behaviour rather than a
  // number copied out of an old log or re-implemented in the gate.
  A.roomTitleContainProbe = function(ix, iy, iz) {
    var n = _roomAtIfcPoint(ix, iy, iz);
    return n ? { guid: n.guid, name: _titleFor(n).name } : null;
  };

  A.roomTitleGazeProbe = function(ox, oy, oz, dx, dy, dz) {
    var n = _roomAlongGaze(ox, oy, oz, dx, dy, dz);
    if (!n) return null;
    var g = A.getRoomGraph(), pitch = _storeyPitch(g);
    return { guid: n.guid, name: _titleFor(n).name, t: _lastGazeT, cz: n.cz,
             band: pitch > 0 ? pitch : null, rects: n.rects };
  };

  // ⚠ HOVER_NAME.md §1 / this feature's own scope note: consume A.friendlyName, never a second
  // naming path. A room's stored name is already human-authored or compiler-synthesized-friendly
  // (e.g. "≈ Roof R1") — friendlyName is a no-op passthrough for those, but running every title
  // through it is what the witness asserts and what keeps this in lockstep with the Find panel if
  // friendlyName is ever improved.
  function _titleFor(n) {
    if (!n) return null;
    var name = (typeof A.friendlyName === 'function') ? A.friendlyName(n.name, null) : n.name;
    return { guid: n.guid, name: name };
  }

  // Coarse-samples the whole (or clipped) film ONCE, collapses into room-dwell segments, and drops
  // any segment shorter than MIN_DWELL. Cheap: a few hundred samples, each one THREE→IFC conversion
  // plus a linear scan of a few hundred room rects — §CPE_BUILDUP_FOLLOW_TM measured this class of
  // per-t lookup as trivial next to a bake's real cost (a full still-refine per frame).
  A.roomTitleBuildTimeline = function(plan, totalSec) {
    var t0 = performance.now();
    _rejectedByHeight = 0; _gazeMissedAll = 0;
    var samples = [], rule = 'gaze', noTarget = 0;
    for (var t = 0; t <= totalSec + 1e-6; t += SAMPLE_DT) {
      var tn = totalSec > 0 ? Math.min(1, t / totalSec) : 0;
      var p = plan.poseAt(tn);
      var ifcP = A.three2ifc ? A.three2ifc(p.x, p.y, p.z) : null;
      var room = null;
      // §CPE_ROOM_TITLE_GAZE: the room the LOOK DIRECTION enters. `poseAt` already carries the look
      // target beside the position, so the gaze needs no new machinery — and because the ray starts
      // AT the camera, a camera standing inside a room still resolves to that room (nearest hit,
      // t=0). Walk films therefore do not regress; only the flyover case changes.
      // DEGRADE, DON'T DISABLE: a plan whose poseAt returns no target (an older cached effects.js)
      // falls back to the containment test and the log says so, rather than captioning nothing.
      if (ifcP && p.tx != null) {
        var ifcT = A.three2ifc(p.tx, p.ty, p.tz);
        if (ifcT) room = _roomAlongGaze(ifcP.ix, ifcP.iy, ifcP.iz,
                                        ifcT.ix - ifcP.ix, ifcT.iy - ifcP.iy, ifcT.iz - ifcP.iz);
      } else if (ifcP) {
        noTarget++; rule = 'containment(no poseAt target)';
        room = _roomAtIfcPoint(ifcP.ix, ifcP.iy, ifcP.iz);
      }
      samples.push({ t: t, guid: room ? room.guid : null, node: room });
    }
    // §CPE_ROOM_TITLE_HYSTERESIS (2026-08-02) — a run is contiguous same-guid samples, so ONE stray
    // sample (a gaze clipping a wall, a ray slipping through a doorway) used to split a single 2s
    // dwell into two ~1s fragments and BOTH died to the dwell floor: the room vanished from the film
    // entirely, and nothing in the log said why. A single-sample dropout is sensor noise, not the
    // camera leaving the room, so it is bridged. Two samples in a row is a real departure and is
    // left alone — the bridge must not be able to glue two genuinely different rooms together.
    var raw = [], bridged = 0;
    samples.forEach(function(s) {
      var last = raw[raw.length - 1];
      if (last && last.guid === s.guid) { last.tEnd = s.t; return; }
      // one-sample dropout: ...A, X, A... -> the X is noise, keep the A run going
      var prev = raw[raw.length - 2];
      if (last && prev && prev.guid === s.guid && (last.tEnd - last.tStart) < 1e-9) {
        raw.pop(); prev.tEnd = s.t; bridged++; return;
      }
      raw.push({ guid: s.guid, node: s.node, tStart: s.t, tEnd: s.t });
    });
    var kept = [], suppressed = 0;
    raw.forEach(function(seg) {
      if (!seg.guid) return; // no room here — no title, never a fabricated one
      if ((seg.tEnd - seg.tStart) < MIN_DWELL) { suppressed++; return; }
      var title = _titleFor(seg.node);
      kept.push({ guid: seg.guid, name: title.name, tStart: seg.tStart, tEnd: seg.tEnd });
    });
    // §CPE_ROOM_TITLE_HEIGHT_BLIND: `rejectedByHeight` counts samples that were over a room's
    // FOOTPRINT but outside its storey band — i.e. flying over it, not in it. With `storeyPitch`
    // beside it, "why did my film have so few captions" is answerable from the console: high
    // `suppressed` = rooms crossed too fast (MIN_DWELL), high `rejectedByHeight` = the camera spent
    // its time above the building, `storeyPitch=0.0` = single-storey, height test disabled.
    var g0 = (typeof A.getRoomGraph === 'function') ? A.getRoomGraph() : null;
    // §CPE_ROOM_TITLE_LEAD: where the dive ends, so the film's FIRST caption is not thrown up over
    // empty sky. `plan.beats` is the plan's own §CINEMA_BEATS fractions — read, never re-derived.
    // DEGRADE, DON'T DISABLE (this lane's own lesson from §CPE_GHOST_GROUND): a re-opened authored
    // path or a stale cached effects.js has no `beats`, and that must cost the dive clip only — the
    // captions still lead. Silence is what made that bug expensive last time, so it is logged either way.
    var diveEndSec = 0, diveSrc = 'none(no dive clip)';
    if (plan && plan.beats && plan.beats.dive > 0) {
      diveEndSec = plan.beats.dive * totalSec;
      diveSrc = 'plan.beats';
    }
    console.log('§CPE_ROOM_TITLE_DIVE src=' + diveSrc + ' diveEndSec=' + diveEndSec.toFixed(2));
    // §CPE_ROOM_TITLE_LEAD: open each caption LEAD early, drop the ones that cannot get their full
    // MIN_HOLD, and let the newer room replace the older. Exposed (below) so the witness gates this
    // exact function rather than a re-implementation.
    var held = A.roomTitleApplyLead(kept, totalSec, diveEndSec);
    var led = 0;
    for (var h = 0; h < held.length; h++) if (held[h].entry > held[h].tStart + 1e-9) led++;

    // §CPE_ROOM_TITLE_LEAD, the FIRST caption only: the dive clamp can truncate its 2s lead to
    // nothing (show collapses to tStart when the dive ends after the doorway), which is the "too
    // late" the lead exists to kill, reintroduced for caption #1 alone. NOT silently changed here —
    // whether that caption should be shown on-the-nose or SKIPPED per the user's own "if misses,
    // then skips" is their call, not a guess to bury in a constant. Measured and printed so the
    // next bake says whether it even happens on a real film.
    var lead0 = held.length ? (held[0].entry - held[0].tStart) : null;
    console.log('§CPE_ROOM_TITLE_TIMELINE rule=' + rule + ' segments=' + held.length + '/' + kept.length +
      ' suppressed=' + suppressed + ' bridged=' + bridged +
      ' dwellFloor=' + MIN_DWELL + 's' +
      (lead0 == null ? '' : ' firstLead=' + lead0.toFixed(2) + 's/' + LEAD + 's' +
        (lead0 < LEAD - 0.01 ? ' (TRUNCATED by the dive clamp)' : '')) +
      ' gazeMissedAll=' + _gazeMissedAll + '/' + samples.length +
      ' rejectedByHeight=' + _rejectedByHeight +
      ' storeyPitch=' + (g0 ? _storeyPitch(g0).toFixed(1) : '?') + 'm' +
      ' lead=' + led + '/' + held.length + '@' + LEAD + 's' +
      ' held=' + (held._held || 0) + '/' + held.length + '@' + MIN_HOLD + 's' +
      ' skipped=' + (held._skipped || 0) + '(<' + MIN_HOLD + 's)' +
      ' totalSec=' + totalSec.toFixed(1) + ' ms=' + (performance.now() - t0).toFixed(1));
    return held;
  };

  // §CPE_ROOM_TITLE_HOLD — pure, and deliberately separate from the sampling above so it can be
  // gated on synthetic segment lists with exact durations. Two rules, both the user's own words:
  //   "give it 3 secs"                        -> every caption lasts at least MIN_HOLD
  //   "if another room cuts in ... it replace" -> unless the next caption starts first, which wins
  // A caption is never shortened below what it earned, and never runs past the film.
  // §CPE_ROOM_TITLE_LEAD — the arbitration, and the ONLY place caption times are decided. Pure, so
  // the witness gates it at exact times instead of hoping a camera path produces them. Input is the
  // room-dwell list (tStart = the sample the camera ENTERED on, tEnd = the sample it LEFT on); output
  // is the captions actually shown, each carrying `entry` so a caller — and the gate — can still see
  // the doorway the caption is leading into.
  //
  // Four rules, all the user's own words:
  //   "about 2 secs before"                  -> a caption OPENS at tStart - LEAD
  //   "clipped to dive end" (their ruling)   -> ...but the film's first caption never opens over the dive
  //   "tries to show up to 3 secs.. if misses, then skips"
  //                                          -> a caption that cannot get its full MIN_HOLD is DROPPED,
  //                                             never shown for less. This is what retires the flash.
  //   "when new room appears" / "it can replace so"
  //                                          -> the next caption's APPEARANCE ends this one, even
  //                                             though the camera may still be inside the old room.
  // Skipped, never DELAYED: pushing a missed caption later would put the name on screen after the
  // camera is already through the door — the exact failure the lead exists to kill.
  A.roomTitleApplyLead = function(segs, totalSec, diveEndSec) {
    if (!segs || !segs.length) return segs || [];
    var sel = [], skipped = 0, lastShow = -Infinity, i;
    for (i = 0; i < segs.length; i++) {
      var s = segs[i];
      var show = Math.max(0, s.tStart - LEAD);
      // The first caption of the film only. `Math.min(s.tStart, ...)` is load-bearing: the dive clip
      // may push a caption LATER, but never past its own doorway — that would be the "too late" the
      // user is complaining about, reintroduced by the fix for it.
      if (!sel.length && diveEndSec > 0) show = Math.max(show, Math.min(s.tStart, diveEndSec));
      if (sel.length && show < lastShow + MIN_HOLD - 1e-9) { skipped++; continue; }
      sel.push({ guid: s.guid, name: s.name, entry: s.tStart, tStart: show, tEnd: s.tEnd });
      lastShow = show;
    }
    // Pre-clip the earned dwell at the NEXT caption's appearance, then hand the list to the shipped
    // hold. That composition is deliberate: `roomTitleApplyHold` keeps its own rule ("never shorten
    // what the camera actually dwelt") intact and stays gated by its own witness, while the user's
    // replacement ruling — the newer room wins even mid-dwell — is applied HERE, where it belongs.
    for (i = 0; i < sel.length - 1; i++) {
      if (sel[i].tEnd > sel[i + 1].tStart) sel[i].tEnd = sel[i + 1].tStart;
    }
    var held = A.roomTitleApplyHold(sel, totalSec), extended = 0;
    for (i = 0; i < held.length; i++) {
      held[i].entry = sel[i].entry;
      if (held[i].tEnd > sel[i].tEnd + 1e-9) extended++;   // the hold did real work on this one
    }
    held._skipped = skipped;
    held._held = extended;
    return held;
  };

  A.roomTitleApplyHold = function(segs, totalSec) {
    if (!segs || !segs.length) return segs || [];
    var out = [], i;
    for (i = 0; i < segs.length; i++) {
      var s0 = segs[i];
      var want = s0.tStart + MIN_HOLD;
      var cap = (i + 1 < segs.length) ? segs[i + 1].tStart : (isFinite(totalSec) ? totalSec : want);
      var end = Math.max(s0.tEnd, want);
      if (end > cap) end = cap;
      if (end < s0.tEnd) end = s0.tEnd;   // never shorten what the camera actually dwelt
      out.push({ guid: s0.guid, name: s0.name, tStart: s0.tStart, tEnd: end });
    }
    return out;
  };

  // Opacity/text for whichever segment is active (or fading) at absolute time t. Two segments can
  // both claim a moment during a crossfade — the higher-opacity one wins, so the reveal reads as
  // one continuous crossfade rather than a flicker between two half-visible captions.
  A.roomTitleOpacityAt = function(segs, t) {
    var best = null;
    (segs || []).forEach(function(s) {
      if (t < s.tStart - FADE || t > s.tEnd + FADE) return;
      var op = (t < s.tStart) ? (t - (s.tStart - FADE)) / FADE :
               (t > s.tEnd) ? 1 - (t - s.tEnd) / FADE : 1;
      if (!best || op > best.opacity) best = { name: s.name, guid: s.guid, opacity: op };
    });
    return best;
  };

  // Shared draw routine — the ONLY place title text is ever drawn, so the live preview and the
  // baked video can never disagree about how a title looks (same font, size, band, fade). A lower-
  // third caption band, documentary-style — screen POSITION is the one open detail RESUME_CPE_
  // ROOM_TITLE.md left for the user; this is the placeholder until told otherwise.
  A.roomTitleCompositeOntoCanvas = function(ctx, w, h, text, opacity) {
    if (!ctx || !text || !(opacity > 0)) return;
    ctx.save();
    var fontPx = Math.max(18, Math.round(h * 0.032));
    var bandH = fontPx * 2.2;
    var y = h - bandH * 1.4;
    ctx.globalAlpha = opacity;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, y, w, bandH);
    ctx.fillStyle = '#fff';
    ctx.font = '600 ' + fontPx + 'px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, y + bandH / 2);
    ctx.restore();
  };

  // ══ Live editor preview — an overlay canvas positioned exactly over the WebGL canvas, drawn
  // through the SAME roomTitleCompositeOntoCanvas the bake uses. Never a DOM label: the point is
  // WYSIWYG with what the export will actually produce, not just "something readable on screen"
  // (the exact trap this file's own header warns about).
  var _liveCanvas = null, _liveSegs = null;

  function _ensureLiveCanvas() {
    if (_liveCanvas && _liveCanvas.isConnected) return _liveCanvas;
    if (!A.renderer || !A.renderer.domElement) return null;
    var c = document.createElement('canvas');
    c.id = 'cpe-room-title-overlay';
    c.style.cssText = 'position:fixed;pointer-events:none;z-index:50;';
    document.body.appendChild(c);
    _liveCanvas = c;
    return c;
  }

  // Called once when a preview rehearsal starts (cinema_path_editor.js's _previewFly).
  A.roomTitleLiveStart = function(plan, totalSec) {
    _liveSegs = A.roomTitleBuildTimeline(plan, totalSec);
  };

  // Called every preview frame with the ABSOLUTE seconds along the (unclipped) film timeline.
  A.roomTitleLiveTick = function(tSec) {
    var c = _ensureLiveCanvas();
    if (!c) return;
    var src = A.renderer.domElement, r = src.getBoundingClientRect();
    c.style.left = r.left + 'px'; c.style.top = r.top + 'px';
    if (c.width !== r.width) c.width = r.width;
    if (c.height !== r.height) c.height = r.height;
    c.style.width = r.width + 'px'; c.style.height = r.height + 'px';
    var ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    var info = A.roomTitleOpacityAt(_liveSegs, tSec);
    if (info) A.roomTitleCompositeOntoCanvas(ctx, c.width, c.height, info.name, info.opacity);
  };

  A.roomTitleLiveStop = function() {
    if (!_liveCanvas) return;
    var ctx = _liveCanvas.getContext('2d');
    ctx.clearRect(0, 0, _liveCanvas.width, _liveCanvas.height);
  };
}
