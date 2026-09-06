// ══ §FLYTHRU_DIMENSIONS — measured spans marked in 3D during the fly-through ═════════════════════
// bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §FLYTHRU_DIMENSIONS / §FLYTHRU_SELECTION.
//
// USER'S FRAMING (2026-09-06), which decides the whole design:
//   "not showing the classic measures but again demonstrative of capability - we look for good
//    opportunity ie distance between the two wing blocks as the cam swing them into view, the height
//    of a floor, height of a part of the stairs to the floor. In short any measure that stands out in
//    the scene. Any that is not visible or confusing to note need not be it."
// So the selection criterion is SCREEN-SPACE LEGIBILITY, not how much a coordinator cares about the
// number. A technically valuable measure that reads as a dot is worse than a plain one that reads as
// a big clean line. This supersedes ranking candidates by coordination value.
//
// AND the correction that made this feature possible at all (same user, same day): "there is a lack
// of measures, it is not correct as the Measure blue dots are able to extract lengths." The blue dots
// raycast onto MESH, not onto IfcSpace — Hospital has ZERO extracted IfcSpace rows yet every corridor
// width in it is measurable. A missing semantic entity is not a missing measurement. Everything here
// measures geometry; the schema is only ever used to NAME what was measured.
//
// ONE MECHANISM, every case — "gap casts". THREE.Raycaster.intersectObjects returns EVERY hit along
// the ray, sorted by distance (measure.js:1272 only ever reads hits[0], but the whole list is there).
// Walk consecutive hits; a large empty interval between two of them is a real void with two real
// endpoints. Horizontal across the view = the gap between two wing blocks, or a corridor width.
// Vertical = floor-to-floor, or head clearance under MEP. Same code, different direction.
//
// This also sidesteps the floor-to-floor HOLD in the spec's availability table: deriving it from
// element_transforms columns is untrustworthy (mean-Z and min-Z disagree on Hospital's storey ORDER),
// but MEASURING slab-to-slab off the mesh has no such problem.
function setupCpeFlythruDims(A) {
  'use strict';
  {
    // ── Tunables. Named, not magic: each one implements a clause of the user's own sentence. ──
    // §FLYTHRU_SCALE — MIN is anthropometric and stays absolute; MAX is BUILDING-scale and must not be.
    // MIN_SPAN_M: a void narrower than this is a construction joint or a gap between two adjacent
    // elements, in a duplex as much as in a terminal — it does not scale with the building.
    // MAX_SPAN_M: purely "did the ray escape the building into open sky", which is entirely a function
    // of how big the building IS. Hardcoding 120 m was wrong even for the building it was written
    // against: Hospital's own envelope measures 115.8 x 164.8 x 47.0 m, so a genuine wing-to-wing span
    // along the long axis would have been rejected as "escaped". It is now derived from the real
    // envelope via setScale(), with the 120 m literal kept ONLY as the pre-scale default so a caller
    // that never sets a scale still behaves, rather than admitting spans of any length.
    var MIN_SPAN_M      = 1.2;   // VOIDS only — below this a gap is a joint, not a feature
    var ELEMENT_MIN_M   = 0.5;   // named elements: a 1,083mm door is a real measure (see §FLYTHRU_ELEMENT_FLOOR)
    var MAX_SPAN_M      = 120;
    var _scaled = false;
    // Call once per building with the element_transforms envelope extents (metres). Nothing inside a
    // building can be longer than its own diagonal, so that — plus a small margin for a ray leaving at
    // an angle — is the real ceiling. DEGRADE, DON'T DISABLE: a bad/absent envelope leaves the default.
    A.flythruSetScale = function (dx, dy, dz) {
      if (!(dx > 0 && dy > 0 && dz > 0)) {
        console.log('§FLYTHRU_SCALE INCONCLUSIVE reason=bad-envelope — keeping default maxSpan=' + MAX_SPAN_M + 'm');
        return null;
      }
      var diag = Math.sqrt(dx * dx + dy * dy + dz * dz);
      MAX_SPAN_M = diag * 1.05;
      _scaled = true;
      console.log('§FLYTHRU_SCALE envelope=' + dx.toFixed(1) + 'x' + dy.toFixed(1) + 'x' + dz.toFixed(1) +
        'm diag=' + diag.toFixed(1) + 'm maxSpan=' + MAX_SPAN_M.toFixed(1) + 'm minSpan=' + MIN_SPAN_M +
        'm (min is anthropometric, not building-scaled)');
      return { minSpanM: MIN_SPAN_M, maxSpanM: MAX_SPAN_M, diagM: diag };
    };
    A.flythruScaleState = function () { return { scaled: _scaled, minSpanM: MIN_SPAN_M, maxSpanM: MAX_SPAN_M }; };
    var MIN_SCREEN_FRAC = 0.15;   // "stands out": the drawn line must cross >15% of frame width
    var MAX_ALIGN       = 0.80;   // "not confusing": |cos(span, viewDir)| above this reads as a dot
    var EDGE_MARGIN     = 0.06;   // both ends must sit this far inside the frame, in NDC units
    var OCCL_TOL_M      = 0.25;   // camera->endpoint may hit something this much nearer (surface bias)

    // §FLYTHRU_ONE_PER_CLASS (2026-09-07, user: "Again, we need not take on all ie storeys. Just pick
    // one, outline it, shine thru, gives the labels.")
    //
    // THE SIMPLIFICATION THAT RETIRES MOST OF THE SELECTION PROBLEM. One storey demonstrates that the
    // model understands storeys; eight demonstrate an inventory, which is the thing "capability not
    // quantity" rules out. The same holds for every class — one room, one duct, one opening, one hall.
    // So the film needs roughly ONE CUE PER CAPABILITY, not a ranked list of hundreds.
    //
    // What this makes unnecessary: tuning a gap to land 30-50 cues, dedupe across hundreds of repeats
    // (440 identical doors cannot compete when only the best door is eligible), and the tier WEIGHTS —
    // tiers become an ORDER of appearance rather than a scoring thumb. It also rescues a thin model:
    // if only a handful of candidates survive the gate, one-per-class still yields a complete film,
    // where a 30-cue target would have failed.
    //
    // `classOf` extracts the capability a candidate demonstrates (caller-supplied, since only it knows
    // whether "Level 1 — 15,072 m²" and "Level 3 — 15,246 m²" are the same capability — they are).
    // Ties break on score, so each class is represented by its best-framed instance.
    A.flythruBestPerClass = function (cands, classOf) {
      if (!cands || !cands.length) return [];
      var key = classOf || function (c) { return c.cueClass || c.tier || '?'; };
      var best = {}, i, c, k;
      for (i = 0; i < cands.length; i++) {
        c = cands[i]; k = String(key(c));
        if (!best[k] || (c.score || 0) > (best[k].score || 0)) best[k] = c;
      }
      var out = Object.keys(best).map(function (k2) { return best[k2]; });
      out.sort(function (a, b) { return (a.startSec || 0) - (b.startSec || 0); });   // play order
      console.log('§FLYTHRU_ONE_PER_CLASS in=' + cands.length + ' classes=' + out.length +
        ' [' + out.map(function (x) { return String(key(x)); }).join(', ') + ']');
      return out;
    };

    // §FLYTHRU_SCHEDULE (2026-09-07, user: "Let's list all qualified candidates. U can recursively
    // check to tune the list to say 30-50 measures.")
    //
    // Ranking alone is NOT a schedule. The first build pass proved it: 447 unique measures, and the
    // top of the list all began at 18.4s — the walk's first frame — because a window that opens early
    // scores as well as any other and nothing stopped them stacking. A film cannot show six cues at
    // once, and "capability not quantity" means spacing as much as it means count.
    //
    // So selection is GREEDY WITH SPACING: take the best, then refuse anything whose window starts
    // within `gapSec` of one already taken. That spreads the schedule across the beat instead of
    // crowding its opening, and it enforces the one-at-a-time rule structurally rather than by luck.
    //
    // The gap is TUNED, not guessed: a wide gap yields too few, a narrow one too many, and the right
    // value depends on the film's length and how rich the model is. Bisect it until the count lands in
    // the target band — the "recursive check" the user asked for. Converges in ~12 passes over an
    // already-small list, so it is free relative to the pass that produced the candidates.
    A.flythruSchedule = function (cands, opts) {
      opts = opts || {};
      var lo = opts.minCount == null ? 30 : opts.minCount;
      var hi = opts.maxCount == null ? 50 : opts.maxCount;
      if (!cands || !cands.length) return { picked: [], gapSec: null, note: 'no candidates' };
      var sorted = cands.slice().sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
      var pick = function (gap) {
        var out = [], i, j, ok;
        for (i = 0; i < sorted.length; i++) {
          ok = true;
          for (j = 0; j < out.length; j++) {
            if (Math.abs((sorted[i].startSec || 0) - (out[j].startSec || 0)) < gap) { ok = false; break; }
          }
          if (ok) out.push(sorted[i]);
        }
        return out;
      };
      // Bisect the gap. Larger gap -> fewer picks, so the count is monotonic in the gap.
      var gLo = 0.1, gHi = 60, best = null, bestGap = null, it, g, got;
      for (it = 0; it < 24; it++) {
        g = (gLo + gHi) / 2;
        got = pick(g);
        if (!best || (got.length >= lo && got.length <= hi)) { best = got; bestGap = g; }
        if (got.length > hi) gLo = g;          // too many -> widen the gap
        else if (got.length < lo) gHi = g;     // too few  -> narrow it
        else { best = got; bestGap = g; break; }
      }
      if (!best) { best = pick(gLo); bestGap = gLo; }
      best.sort(function (a, b) { return (a.startSec || 0) - (b.startSec || 0); });   // play order
      console.log('§FLYTHRU_SCHEDULE candidates=' + cands.length + ' picked=' + best.length +
        ' gapSec=' + (bestGap == null ? '?' : bestGap.toFixed(2)) +
        ' target=' + lo + '-' + hi + (best.length < lo ? ' UNDER-TARGET (not enough spread-out candidates)' : ''));
      return { picked: best, gapSec: bestGap };
    };

    // §FLYTHRU_EASE (2026-09-07, user: "The measure can appear by the cam path easing into it, so that
    // length becomes apparent as what happens at that seconds 19-22.")
    //
    // A length "becomes apparent" when the camera SETTLES on it. Slowing is the film's own way of
    // saying look here, and a cue that lands on a decelerating shot reads as intentional; the same cue
    // on a fast sweep reads as clutter, even when it technically holds 2 seconds. So a window that
    // coincides with the camera easing in is PREFERRED — and this pairs with the 0.5s draw-across:
    // the line completes just as the shot settles.
    //
    // Derived from the path alone (speed between consecutive samples), so it carries no knowledge of
    // any building or beat. Returns 0..1 where 1 is a full stop and 0 is the fastest the camera moves
    // anywhere on the sampled path — a RELATIVE measure, because "slow" only means anything against
    // how fast this particular film travels elsewhere.
    // A PREFERENCE, never a veto: a measure that only ever appears mid-sweep is still worth showing if
    // nothing better competes for that moment.
    A.flythruEaseScore = function (path, startSec, endSec) {
      if (!path || path.length < 3) return null;
      var i, sp = [], dt, dx, dy, dz;
      for (i = 1; i < path.length; i++) {
        dt = path[i].t - path[i - 1].t; if (!(dt > 0)) { sp.push(0); continue; }
        dx = path[i].pos.x - path[i - 1].pos.x;
        dy = path[i].pos.y - path[i - 1].pos.y;
        dz = path[i].pos.z - path[i - 1].pos.z;
        sp.push(Math.sqrt(dx * dx + dy * dy + dz * dz) / dt);
      }
      var vMax = 0; for (i = 0; i < sp.length; i++) if (sp[i] > vMax) vMax = sp[i];
      if (!(vMax > 0)) return { ease: 1, meanSpeed: 0, decel: 0 };   // a static camera is maximally settled
      var sum = 0, n = 0, first = null, last = null;
      for (i = 1; i < path.length; i++) {
        var t = path[i].t;
        if (t < startSec || t > endSec) continue;
        var v = sp[i - 1];
        if (first === null) first = v;
        last = v; sum += v; n++;
      }
      if (!n) return null;
      var mean = sum / n;
      // Slow across the window, and slowing further through it, both count.
      var slow = 1 - Math.min(1, mean / vMax);
      var decel = (first != null && last != null && first > 0) ? Math.max(0, Math.min(1, (first - last) / first)) : 0;
      return { ease: Math.max(0, Math.min(1, slow * 0.7 + decel * 0.3)), meanSpeed: mean, decel: decel, vMax: vMax };
    };

    // §FLYTHRU_DEPTH_SPAN (2026-09-07, user: "Even the whole length of a hallway, can appear from
    // camera position to the end of pov.")
    //
    // The corridor shot: a dimension running INTO the screen along the view axis. It looks like the
    // case §FLYTHRU_ANGLE_OK rejects, and it is not — the difference is WHERE THE NEAR END SITS.
    // Two far-away endpoints on the view axis do collapse to one screen point. But a near end a few
    // metres ahead projects LOW in frame while the far end sits at the vanishing point, so the drawn
    // line has real screen length and the existing size test judges it correctly with no exception.
    //
    // The near end must not be the camera itself: at eye height 1.6m a floor point 2m ahead projects
    // 38.7 degrees below centre, outside a 60 degree frame. This picks the nearest floor point that is
    // still comfortably inside, so the cue starts at the viewer's feet rather than off-screen.
    //   angle below centre = atan(camHeight / d)  =>  d = camHeight / tan(angleLimit)
    // MEASURED for a 1.6m eye height in a 60 degree frame: a 4m near point sits 21.8 degrees down and a
    // 30m far point 3.1 degrees down — about 31% of frame height apart, comfortably over the 15% floor.
    //
    // Returns the two WORLD points for the floor run, or null when the corridor is too short to read.
    A.flythruDepthSpan = function (camPos, fwd, camHeight, farDistM, opts) {
      if (!camPos || !fwd || !(farDistM > 0)) return null;
      opts = opts || {};
      var h = (camHeight == null) ? 1.6 : camHeight;
      var fovDeg = opts.fovDeg || 60;
      // Keep the near end inside the frame with a margin, so it is never clipped at the bottom edge.
      var limitDeg = (fovDeg / 2) * (opts.edgeKeep == null ? 0.75 : opts.edgeKeep);
      var nearD = h / Math.tan((limitDeg * Math.PI) / 180);
      if (!(farDistM > nearD + 1)) return null;           // corridor too short to draw into
      var flat = { x: fwd.x, y: 0, z: fwd.z };
      var L = Math.sqrt(flat.x * flat.x + flat.z * flat.z);
      if (!(L > 0.001)) return null;                       // looking straight up or down: no floor run
      flat.x /= L; flat.z /= L;
      var floorY = camPos.y - h;
      return {
        near: { x: camPos.x + flat.x * nearD, y: floorY, z: camPos.z + flat.z * nearD },
        far:  { x: camPos.x + flat.x * farDistM, y: floorY, z: camPos.z + flat.z * farDistM },
        nearD: nearD, spanM: farDistM - nearD, fullRunM: farDistM
      };
    };

    // §FLYTHRU_SEMANTICS (2026-09-07, user: "Once the numbers and candidates comes in, i am thinking
    // it can then undergo a 2nd round of extraction ie the semantics of that measure such as 'duct
    // height', 'staircase height', 'window width', 'wing length', 'beam bounding perimeter'.")
    //
    // A SECOND PASS, deliberately after selection. Stage 1 stays geometry-only — "how long", no class
    // knowledge, cheap, and identical on any building (§FLYTHRU_GEOMETRY_ONLY). Only a handful of spans
    // survive it, so naming them costs nothing and cannot bias what was chosen. Semantics as a FILTER
    // was what produced today's failures (slabs omitted because unlisted, elevators unreachable because
    // this model has no such class); semantics as a LABEL has none of that exposure.
    //
    // The noun is DERIVED, never guessed: the class comes from metadata the element already carries,
    // and the dimension word comes from which axis was measured relative to the element's own extents.
    //   - span near world-up            -> "height"
    //   - span along the longest extent -> "length"
    //   - otherwise                     -> "width"
    // DEGRADE, DON'T DISABLE: with no class, the cue shows the number alone — which is all it ever
    // promised. Nothing is invented to fill the gap.
    A.flythruSemantics = function (info) {
      if (!info) return null;
      var cls = (info.ifcClass || '').replace(/^Ifc/, '');
      var e = info.extents || null;                 // [bx, by, bz] in the element's own frame
      var upDot = (info.dirWorld && info.dirWorld.y != null) ? Math.abs(info.dirWorld.y) : null;
      // §FLYTHRU_NOUN (user, 2026-09-07): "if it is horizontal it is a length. Vertical is a height."
      // DIRECTION ALONE decides — no comparison against the element's other extents. This replaces an
      // earlier three-way height/length/width rule that had to know which extent was longest, and so
      // could disagree with itself when two extents were close. A viewer reading a cue on screen has
      // no idea which axis of a duct is "longest"; they can see whether the line is upright or flat.
      // The word should describe what is DRAWN, not what the model happens to hold.
      var word = null;
      if (info.perimeter) word = 'bounding perimeter';
      else if (upDot != null) word = (upDot > 0.8) ? 'height' : 'length';
      // A void has no owning element; name it by what the cast was, if the caller knows.
      if (!cls && info.voidRole) return { label: info.voidRole, source: 'void' };
      if (!cls) return null;                        // number alone — never a fabricated noun
      // Friendly nouns for the handful of classes whose IFC name reads badly on screen. Anything not
      // listed falls through to its own stripped class name, so an unseen class still labels correctly.
      var NICE = { DuctSegment:'Duct', DuctFitting:'Duct', PipeSegment:'Pipe', PipeFitting:'Pipe',
                   StairFlight:'Staircase', Stair:'Staircase', WallStandardCase:'Wall',
                   CableCarrierSegment:'Cable tray', BuildingElementProxy:'' };
      var noun = (NICE[cls] != null) ? NICE[cls] : cls;
      if (!noun) return null;                       // deliberately unnamed classes stay unnamed
      return { label: word ? (noun + ' ' + word) : noun, noun: noun, word: word, source: 'element' };
    };

    // §FLYTHRU_FRAME_MAP (2026-09-07, user: "THus the RTree should be good enough to pick out
    // candidates, and apply them. The algorithm can determine the length of scene, and its physical
    // obscurity.")
    //
    // Using elements_rtree needs ONE thing solved first: it is indexed in DB coordinates
    // (measure.js:164 inserts center_x +/- bbox_x/2 straight from element_transforms), while the
    // camera lives in SCENE coordinates. On Hospital the scene box measures 115.8 x 47.2 x 164.8
    // against a DB envelope of 115.8 x 164.8 x 47.0 — DB is Z-up, the scene is Y-up, so scene-Y is
    // DB-Z. Querying the index with a scene-space point returned ZERO candidates earlier today; this
    // is that bug, solved once instead of worked around.
    //
    // DERIVED, never hardcoded: match the two envelopes by EXTENT to find which DB axis feeds which
    // scene axis, then take the offset from the centres. Works on any building, any exporter datum,
    // and degrades to identity if the envelopes cannot be matched rather than inventing a mapping.
    // `dbEnv` = {minx,maxx,miny,maxy,minz,maxz} from element_transforms.
    // `sceneBox` = {min:{x,y,z}, max:{x,y,z}} from the loaded scene.
    A.flythruFrameMap = function (dbEnv, sceneBox) {
      if (!dbEnv || !sceneBox) return null;
      var dSize = [dbEnv.maxx - dbEnv.minx, dbEnv.maxy - dbEnv.miny, dbEnv.maxz - dbEnv.minz];
      var sSize = [sceneBox.max.x - sceneBox.min.x, sceneBox.max.y - sceneBox.min.y, sceneBox.max.z - sceneBox.min.z];
      var dCtr = [(dbEnv.minx + dbEnv.maxx) / 2, (dbEnv.miny + dbEnv.maxy) / 2, (dbEnv.minz + dbEnv.maxz) / 2];
      var sCtr = [(sceneBox.min.x + sceneBox.max.x) / 2, (sceneBox.min.y + sceneBox.max.y) / 2,
                  (sceneBox.min.z + sceneBox.max.z) / 2];
      // Which DB axis matches each scene axis by extent? Greedy, each DB axis used once.
      var used = [false, false, false], axis = [0, 0, 0], si, di, best, bestD, rel;
      for (si = 0; si < 3; si++) {
        best = -1; bestD = Infinity;
        for (di = 0; di < 3; di++) {
          if (used[di] || !(dSize[di] > 0)) continue;
          rel = Math.abs(dSize[di] - sSize[si]) / Math.max(dSize[di], sSize[si]);
          if (rel < bestD) { bestD = rel; best = di; }
        }
        if (best < 0 || bestD > 0.02) {   // no confident match -> DEGRADE, don't invent
          console.log('§FLYTHRU_FRAME_MAP INCONCLUSIVE — envelopes do not match by extent; using identity');
          return { axis: [0, 1, 2], offset: [0, 0, 0], identity: true };
        }
        used[best] = true; axis[si] = best;
      }
      var offset = [sCtr[0] - dCtr[axis[0]], sCtr[1] - dCtr[axis[1]], sCtr[2] - dCtr[axis[2]]];
      console.log('§FLYTHRU_FRAME_MAP sceneAxis<-dbAxis [' + axis.join(',') + '] offset [' +
        offset.map(function (v) { return v.toFixed(2); }).join(',') + '] (derived from envelopes, not assumed)');
      return { axis: axis, offset: offset, identity: false };
    };
    // Scene point -> DB point, so a scene-space camera can query an index built in DB space.
    A.flythruSceneToDb = function (map, p) {
      if (!map) return null;
      var s = [p.x - map.offset[0], p.y - map.offset[1], p.z - map.offset[2]];
      var out = [0, 0, 0];
      for (var i = 0; i < 3; i++) out[map.axis[i]] = s[i];
      return { x: out[0], y: out[1], z: out[2] };
    };

    // §FLYTHRU_PRECUE (2026-09-07, user: "even precue the viewer eyes as a shine thru appears before
    // the element does, as long its label is legible enough").
    //
    // Because the cue shines through, it can be on screen while the thing it measures is still hidden
    // — leading the eye to where the reveal will happen, so the element arrives into an expectation
    // instead of being noticed late. This INVERTS the occlusion rule for the START of a window: being
    // fully hidden at t0 is no longer a defect, it is the pre-cue.
    //
    // The condition the user attached is the one that keeps it honest: "as long its label is legible
    // enough". So the lead-in is only granted while the span is ALREADY in range and facing — i.e.
    // inside its path window, where apparent size is sufficient by construction. A cue is never shown
    // for something too small or too far to read, hidden or not.
    //
    // Capped, because a lead that outlives the viewer's attention stops being a cue and becomes a
    // floating annotation with no referent — the same failure the both-ends-hidden rule guards.
    var PRECUE_MAX_SEC = 1.2;
    // `pathWin` — when the span is in range and facing (from flythruPathWindows).
    // `firstVisibleSec` — when it actually becomes unoccluded; null/undefined means never.
    A.flythruPreCue = function (pathWin, firstVisibleSec, opts) {
      if (!pathWin || !(pathWin.durSec > 0)) return null;
      opts = opts || {};
      var cap = (opts.maxLeadSec == null) ? PRECUE_MAX_SEC : opts.maxLeadSec;
      // Never visible at all -> no cue. A measurement of something the viewer never sees is an
      // annotation floating in space, which is exactly what this must not produce.
      if (firstVisibleSec == null) return null;
      // Already visible when the window opens -> no lead needed, nothing to pre-empt.
      if (firstVisibleSec <= pathWin.startSec) {
        return { startSec: pathWin.startSec, endSec: pathWin.endSec, leadSec: 0,
                 durSec: pathWin.endSec - pathWin.startSec };
      }
      // Visible later: start the cue early, but only as far back as the cap and never before the span
      // is legible (the path window's own start).
      var start = Math.max(pathWin.startSec, firstVisibleSec - cap);
      if (firstVisibleSec > pathWin.endSec) return null;   // emerges after the window closes
      return { startSec: start, endSec: pathWin.endSec, leadSec: firstVisibleSec - start,
               durSec: pathWin.endSec - start, firstVisibleSec: firstVisibleSec };
    };

    // §FLYTHRU_DRAW_CONTRACT (2026-09-07, user: "Make the measure a shine thru also, as it makes sense
    // to give attention to a set that may be obscured midway, the overall sense will give visual
    // sense.")
    //
    // THE WHOLE CUE shines through, not just the box: dimension line, arrow heads, extension ticks,
    // leader and value. Two things make that true, and it is worth being precise about which is which:
    //
    //  1. DRAWN IN THE 2D PASS -> shine-through is automatic. The cue is screen-space, composited
    //     after the 3D render exactly like clash_labels, so nothing in the scene can occlude it. This
    //     is the shipped path and it needs no depth flags at all.
    //  2. ANY 3D PART (a preview built from scene objects, e.g. measureGroup) must carry the flags
    //     below — the same combination measure.js:717 and clash_film.js use. Recorded so a future
    //     3D-side preview cannot silently reintroduce z-fighting the bake path does not have.
    //
    // WHY IT MATTERS BEYOND TIDINESS — it fixes a case the occlusion test cannot even see. The gate
    // only tests the two ENDPOINTS. A span whose ENDS are both visible but whose MIDDLE passes behind
    // a column or a duct passes the gate, and without shine-through the line would be chopped in two
    // with the value stranded on a fragment. That is the "obscured midway" case, and it is invisible
    // to any endpoint check. Drawing the whole cue on top makes the measurement read as ONE object
    // spanning the obstruction, which is the "overall visual sense" the user is after — and it is why
    // no mid-span occlusion sampling is needed.
    A.FLYTHRU_DRAW_CONTRACT = { depthTest: false, depthWrite: false, renderOrder: 900, screenSpace: true };

    // §FLYTHRU_PATH_WINDOWS (2026-09-07, user: "can cam path to elements mete out >2s rule?")
    //
    // YES — and this is the cheapest filter in the whole system, because it needs neither projection
    // nor a single raycast. The apparent-size condition rearranges into a pure DISTANCE threshold:
    //     frac = (L/d) / (2*tan(fov/2))  >=  MIN_SCREEN_FRAC
    //   =>  d <= L / (MIN_SCREEN_FRAC * 2*tan(fov/2))  =  dMax(L)
    // So "can this span read?" is "is the camera inside a sphere of radius dMax around it?", and
    // "does it hold 2 seconds?" is "how long does the path spend inside that sphere while facing it".
    // Both are arithmetic on a path that is KNOWN IN CLOSED FORM before any frame renders.
    //
    // The saving is structural, not incremental: an element is rejected by two dot products per
    // sample, before it ever costs a projection (cheap) or an occlusion ray (expensive) or a
    // background probe (very expensive). Only survivors reach those stages.
    //
    // `path` = [{ t, pos:{x,y,z}, fwd:{x,y,z} }] sampled once for the whole beat and REUSED by every
    // element. `point` is the span's midpoint; `spanM` its length. Returns the qualifying windows.
    // This is a NECESSARY condition, never a sufficient one — it cannot see occlusion or backdrop, so
    // a survivor must still face the real gate. It must therefore never reject something that could
    // pass, which is why the facing test carries a margin for the span's own angular width.
    A.flythruPathWindows = function (path, point, spanM, opts) {
      if (!path || !path.length || !point || !(spanM > 0)) return [];
      opts = opts || {};
      var fovDeg = opts.fovDeg || 60;
      var fov = (fovDeg * Math.PI) / 180;
      var dMax = spanM / (MIN_SCREEN_FRAC * 2 * Math.tan(fov / 2));
      var minHold = (opts.minHoldSec == null) ? MIN_HOLD_SEC : opts.minHoldSec;
      var halfFov = fov / 2, i, runStart = -1, out = [];
      for (i = 0; i <= path.length; i++) {
        var ok = false;
        if (i < path.length) {
          var s = path[i];
          var dx = point.x - s.pos.x, dy = point.y - s.pos.y, dz = point.z - s.pos.z;
          var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d > 0 && d <= dMax) {
            // Facing test, with a margin for the span's own angular half-width so a large object
            // straddling the frame edge is not rejected while plainly in view.
            var cosA = (dx * s.fwd.x + dy * s.fwd.y + dz * s.fwd.z) / d;
            var margin = Math.atan2(spanM / 2, d);
            ok = Math.acos(Math.max(-1, Math.min(1, cosA))) <= (halfFov + margin);
          }
        }
        if (ok && runStart < 0) runStart = i;
        if (!ok && runStart >= 0) {
          var t0 = path[runStart].t, t1 = path[i - 1].t;
          if (t1 - t0 >= minHold) out.push({ startSec: t0, endSec: t1, durSec: t1 - t0 });
          runStart = -1;
        }
      }
      return out;
    };
    A.flythruMaxDist = function (spanM, fovDeg) {
      var fov = ((fovDeg || 60) * Math.PI) / 180;
      return spanM / (MIN_SCREEN_FRAC * 2 * Math.tan(fov / 2));
    };

    // §FLYTHRU_PERIMETER_LOOP (2026-09-07, user: "even giving the other perimeter is also easy, as we
    // are drawing cue points, then line arrows with number in middle, it be clearly discernible").
    //
    // A perimeter is a CLOSED LOOP, not a span — so it gets its own cue form: the four base corners as
    // cue points, the four sides drawn as arrowed segments, and the total in the middle. That reads as
    // "the distance around this", which a single straight dimension line cannot express. Everything
    // else is unchanged — same ink rules, same shine-through, same buildup drawing the loop round.
    //
    // Returns the base rectangle in traversal order (so consecutive points are real sides, never a
    // diagonal) plus the total. The value is the BOX's perimeter and the box is drawn, so nothing is
    // claimed about a real footprint outline — §FLYTHRU_BOX_CUE's honesty argument applies unchanged.
    A.flythruPerimeterLoop = function (center, half, quat, V3) {
      if (!center || !half || !(half.x > 0) || !(half.z > 0)) return null;
      var sx = [-1, 1, 1, -1], sz = [-1, -1, 1, 1];   // traversal order, not corner-index order
      var pts = [], i, p;
      for (i = 0; i < 4; i++) {
        p = new V3(sx[i] * half.x, -half.y, sz[i] * half.z);
        if (quat && p.applyQuaternion) p.applyQuaternion(quat);
        pts.push({ x: p.x + center.x, y: p.y + center.y, z: p.z + center.z });
      }
      var per = 0, j;
      for (i = 0; i < 4; i++) {
        j = (i + 1) % 4;
        per += Math.sqrt(Math.pow(pts[j].x - pts[i].x, 2) + Math.pow(pts[j].y - pts[i].y, 2) +
                         Math.pow(pts[j].z - pts[i].z, 2));
      }
      return { points: pts, closed: true, perimeterM: per,
               sides: [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 3 }, { a: 3, b: 0 }],
               note: 'bounding-box footprint perimeter' };
    };

    // §FLYTHRU_UNIQUE (2026-09-07, user: "and we do not create redundant measures by having a list of
    // candiates that are unique").
    //
    // Hospital carries 440 doors that are all 1,083mm wide. That is ONE measure, not 440 — showing it
    // twice teaches the viewer nothing new and is precisely the "quantity" the user ruled against.
    // Redundancy arrives in two shapes and both are removed here:
    //   1. GEOMETRIC — two candidates spanning effectively the same two points (the same element found
    //      by an extent and again by a gap cast, or two poses discovering one span).
    //   2. NUMERIC — different objects that yield the same length. A second 1,083mm reading is not a
    //      second fact.
    // The survivor of each group is the highest-SCORING one, so dedupe never costs the best framing of
    // a measure — only its repeats. Order out is by score, so a caller taking the top N gets N
    // genuinely different numbers.
    //
    // `valueTolM` is what counts as "the same length" (default 10mm — below a millimetre-labelled
    // cue's own readable resolution). `pointTolM` is what counts as "the same place".
    A.flythruDedupe = function (cands, opts) {
      if (!cands || !cands.length) return [];
      opts = opts || {};
      var vTol = (opts.valueTolM == null) ? 0.01 : opts.valueTolM;
      var pTol = (opts.pointTolM == null) ? 0.25 : opts.pointTolM;
      var sorted = cands.slice().sort(function (x, y) { return (y.score || 0) - (x.score || 0); });
      var kept = [], i, j, c, k, dup;
      var near = function (p, q) {
        return p && q && Math.abs(p.x - q.x) <= pTol && Math.abs(p.y - q.y) <= pTol && Math.abs(p.z - q.z) <= pTol;
      };
      for (i = 0; i < sorted.length; i++) {
        c = sorted[i]; dup = false;
        for (j = 0; j < kept.length; j++) {
          k = kept[j];
          // same length, whatever it belongs to
          if (Math.abs((c.span || 0) - (k.span || 0)) <= vTol) { dup = true; break; }
          // same place, whichever way round the endpoints were found
          if ((near(c.a, k.a) && near(c.b, k.b)) || (near(c.a, k.b) && near(c.b, k.a))) { dup = true; break; }
        }
        if (!dup) kept.push(c);
      }
      console.log('§FLYTHRU_UNIQUE in=' + cands.length + ' unique=' + kept.length +
        ' dropped=' + (cands.length - kept.length) + ' (repeat lengths and co-located spans)');
      return kept;
    };

    // §FLYTHRU_BOX_CUE (2026-09-07, user: "Since bbox is cheap, then do as such a box line measure,
    // user will know it is measuring a bbox").
    //
    // THIS RESOLVES THE CIRCUMFERENCE PROBLEM BY DISPLAY RATHER THAN BY INFERENCE. A bounding box
    // cannot distinguish a round duct from a square one — both give w ~= h — so printing "circumference
    // = pi*d" would be a 21% error stated as a measured fact whenever the duct is actually square.
    // Drawing the BOX makes the number self-evidently the box's: the viewer sees what was measured, so
    // nothing is claimed about the true section, and no roundness detection is needed. Honest by
    // construction, and cheap — 8 corners and 12 edges, no mesh inspection.
    //
    // Returns the 8 corners in WORLD space plus the 12 edge pairs. `half` is the box's half-extents in
    // its own local frame; `quat` orients it. Pure apart from needing a Vector3/Quaternion constructor,
    // which is injected so the witness can drive it without THREE.
    A.flythruBoxCorners = function (center, half, quat, V3) {
      if (!center || !half) return null;
      var out = [], sx, sy, sz;
      for (sx = -1; sx <= 1; sx += 2) for (sy = -1; sy <= 1; sy += 2) for (sz = -1; sz <= 1; sz += 2) {
        var p = new V3(sx * half.x, sy * half.y, sz * half.z);
        if (quat && p.applyQuaternion) p.applyQuaternion(quat);
        out.push({ x: p.x + center.x, y: p.y + center.y, z: p.z + center.z });
      }
      return out;
    };
    // Corner order above is (sx,sy,sz) with sz fastest, so index = 4*i + 2*j + k for signs (i,j,k).
    // These 12 pairs are the box edges — each joins corners differing in exactly one sign.
    A.FLYTHRU_BOX_EDGES = [[0,1],[2,3],[4,5],[6,7],   // along z
                           [0,2],[1,3],[4,6],[5,7],   // along y
                           [0,4],[1,5],[2,6],[3,7]];  // along x
    // The box's own perimeter measures, stated as BOX facts — never as a claim about the real section.
    // A rectangular section's perimeter is exact; a round one inscribed in the box is smaller, and the
    // drawn box is what tells the viewer which they are looking at.
    A.flythruBoxPerimeter = function (w, h) {
      if (!(w > 0) || !(h > 0)) return null;
      return { perimeterM: 2 * (w + h), w: w, h: h, note: 'bounding-box perimeter' };
    };

    // §FLYTHRU_EARLY_OUT (2026-09-07, user: "To avoid cost, the algorithm can pick those out early
    // decisively but remain abstract so it applies to any building.")
    //
    // THE COST IS NOT THE GATE, IT IS THE ORDER THE TESTS RUN IN. Per candidate per sample the work
    // ranks: distance arithmetic (free) << projection (cheap) << occlusion raycasts (expensive) <<
    // background probes (very expensive, 6 rays). The first implementation computed occlusion BEFORE
    // calling the gate, so every candidate paid the expensive test even when a single division would
    // have rejected it. These two stages let a caller reject decisively, in order, and pay for a
    // raycast only on a candidate that has already earned it.
    //
    // Both stages are pure trigonometry and carry NO knowledge of any building — no class names, no
    // sizes, no storey conventions. They work on a duplex and a terminal identically.

    // STAGE 0 — free. Can a span of this length at this distance POSSIBLY reach the minimum apparent
    // size? Angular size is 2*atan(span/2d); as a fraction of the frame that is roughly
    // (span/d) / (2*tan(fov/2)). This is the SUPREMUM — it assumes the span lies perpendicular to the
    // view, so anything it rejects could never pass at any orientation. No projection, no scene.
    A.flythruCouldRead = function (spanM, distM, fovDeg) {
      if (!(spanM > 0) || !(distM > 0)) return false;
      var fov = ((fovDeg || 60) * Math.PI) / 180;
      var frac = (spanM / distM) / (2 * Math.tan(fov / 2));
      return frac >= MIN_SCREEN_FRAC;
    };

    // STAGE 1 — cheap: everything decidable from the PROJECTED endpoints alone. No raycasting. A
    // caller runs this first and only casts occlusion/background rays for survivors. Occlusion and
    // backdrop are left unset here and judged by the full gate afterwards.
    A.flythruGateCheap = function (c) {
      return A.flythruGate({ a: c.a, b: c.b, lengthM: c.lengthM, kind: c.kind,
                             alignToView: c.alignToView, occludedA: false, occludedB: false });
    };

    // §FLYTHRU_GATE — the four tests, PURE (no scene, no THREE beyond vector maths on plain objects),
    // so the witness can sweep thousands of candidate spans without a GPU or a bake. Returns a score
    // in 0..1 with `pass`, and a `why` naming the FIRST clause that failed — a rejection must be
    // explainable, not a silent drop (§4 of the witness law: a check that cannot say why is not a
    // check). `project` is injected so the test can drive it with a known projection instead of a
    // live camera.
    //   1. on screen   — both endpoints inside the frame with margin
    //   2. long enough — drawn length > MIN_SCREEN_FRAC of frame width
    //   3. unoccluded  — caller supplies hit distances from camera to each endpoint
    //   4. not foreshortened — a span pointing at the camera is a dot, and this kills most bad ones
    A.flythruGate = function (c) {
      var s = { pass: false, score: 0, why: null };
      if (!c || !c.a || !c.b) { s.why = 'no-span'; return s; }
      // §FLYTHRU_ELEMENT_FLOOR (2026-09-07, measured) — MIN_SPAN_M is a VOID rule: a gap narrower than
      // ~1.2m is a construction joint or the space between two adjacent parts, not a feature worth
      // marking. It must NOT filter a NAMED element. Applying it to elements rejected 3,857 door-width
      // candidates on the real catalogue for the crime of being 1,083mm — a perfectly good measure, and
      // one the user has already seen and approved in a still. An element is identified, not
      // discovered, so its own extent is the fact; the only floor it needs is "big enough to draw".
      var lenM = c.lengthM;
      var floorM = (c.kind === 'element') ? ELEMENT_MIN_M : MIN_SPAN_M;
      if (!(lenM >= floorM)) { s.why = 'too-short:' + (lenM || 0).toFixed(2) + 'm'; return s; }
      if (lenM > MAX_SPAN_M) { s.why = 'too-long:' + lenM.toFixed(1) + 'm (ray likely escaped the building)'; return s; }
      // 1. ONE endpoint may leave the frame. (User, 2026-09-07: "the distance between block wings,
      //    even though one side will go out of frame but the length can remain floating in stride.")
      //    This RELAXES the original both-ends-inside rule, which would have thrown away exactly the
      //    showpiece measure — a wing-to-wing span is at its most impressive precisely when it is too
      //    big to fit. Both ends off-frame is still rejected: nothing anchors the cue then. The
      //    MIDPOINT must be comfortably on screen, because that is where the value sits and a label
      //    floating off the edge is the "confusing to note" case.
      var m = EDGE_MARGIN;
      if (c.a.z < 0 && c.b.z < 0) { s.why = 'behind-camera'; return s; }
      var offA = (c.a.z < 0) || Math.abs(c.a.x) > 1 - m || Math.abs(c.a.y) > 1 - m;
      var offB = (c.b.z < 0) || Math.abs(c.b.x) > 1 - m || Math.abs(c.b.y) > 1 - m;
      if (offA && offB) { s.why = 'both-ends-off-screen'; return s; }
      s.oneEndOff = (offA || offB);
      var midX = (c.a.x + c.b.x) / 2, midY = (c.a.y + c.b.y) / 2;
      if (Math.abs(midX) > 0.85 || Math.abs(midY) > 0.85) { s.why = 'label-off-screen'; return s; }
      // 2. long enough on screen to read. NDC is -1..1, so an NDC delta of 2 spans the full width.
      var dx = (c.b.x - c.a.x) / 2, dy = (c.b.y - c.a.y) / 2;
      var screenFrac = Math.sqrt(dx * dx + dy * dy);
      // Report the MEASURED value on the result, pass or fail. A rejection that only says "too small"
      // cannot be used to judge whether the threshold itself is right — which is exactly the question
      // a first run on a new building asks. §4 of the witness law: a check must be able to explain
      // itself with numbers, not just a verdict.
      s.screenFrac = screenFrac; s.lengthM = lenM; s.align = Math.abs(c.alignToView || 0);
      if (screenFrac < MIN_SCREEN_FRAC) { s.why = 'too-small-on-screen:' + screenFrac.toFixed(3); return s; }
      // 3. §FLYTHRU_SHINE_THROUGH (2026-09-07, user: "Wonder if the whole box line shines thru can
      //    help"). It does, and it SOFTENS this rule. The cue is drawn with depthTest:false,
      //    depthWrite:false at a high renderOrder — the exact combination measure.js:717 uses for its
      //    clash-overlap highlight and clash_film.js for its markers (§CLASH_FILM_SHINE_THROUGH). The
      //    project's own rule is to retain that shine-through exactly, not reinvent it.
      //    Consequence: a PARTLY hidden span is no longer fatal — the box reads through the wall in
      //    front of it, which is the capability demo rather than a defect. It is penalised, not
      //    rejected, mirroring the one-end-off-frame rule.
      //    BOTH ends hidden is still rejected: a box floating with no visible referent reads as a
      //    glitch, not a measurement.
      var occN = (c.occludedA ? 1 : 0) + (c.occludedB ? 1 : 0);
      if (occN === 2) { s.why = 'occluded'; return s; }
      s.partlyHidden = (occN === 1);
      // 4. §FLYTHRU_ANGLE_OK (2026-09-07, user: "Even if a door is at an angle, as long that holds").
      //    The foreshortening VETO is REMOVED — it was redundant with test 2 and only ever cost real
      //    cues. A span's projected length is its true length times sin(angle to view), so anything
      //    genuinely end-on already collapses to a tiny screenFrac and is rejected there, by
      //    MEASUREMENT rather than by an angle threshold. An angled door still reads perfectly well
      //    and, if it holds, is exactly what the user asked to keep. Alignment survives only as a
      //    mild score preference: square-on ranks higher, angled is not disqualified.
      var align = Math.abs(c.alignToView == null ? 0 : c.alignToView);
      // §FLYTHRU_SKY_BACKDROP (user: the wing sighting has "open sky as backdrop and still within its
      // fly thru") — the discriminator that tells the SHOWPIECE from an ordinary interior void. A gap
      // cast alone cannot: a corridor and the gap between two wings are both empty intervals. But a
      // ray from the camera THROUGH the span's midpoint that hits nothing means you are looking
      // through the gap at open sky, and an interior void always has a wall behind it. The caller
      // measures it (it needs the scene); the gate only scores it. It is a PREFERENCE, never an
      // admission rule — head clearance and stair height are interior cues with solid backdrops and
      // must still pass on their own merits.
      var centred = 1 - Math.min(1, (Math.abs(c.a.x + c.b.x) / 2 + Math.abs(c.a.y + c.b.y) / 2) / 2);
      // §FLYTHRU_CLEAR_BG (user: "First it has to have a clear background so that its graphics which
      // has to be black"). The cue is drawn BLACK, so it needs a plain, light-ish area behind the
      // value or it is unreadable. The caller samples the rendered frame behind the label box and
      // reports bgClear; the gate scores it. Weighted heavily — a black cue on busy geometry is the
      // exact "not visible or confusing to note" case, so this is the strongest single preference.
      // §FLYTHRU_MOSAIC_VETO (2026-09-07, user: "Those that can be obscured or has contrast issues with
      // mosaic looking background can be avoided .. it is the outside walls midflight that poses the
      // most opportunities, thus there can have the most.") Busy-ness is now THREE-state, not binary,
      // because the two ends mean different things and a boolean conflated them:
      //   'clear' — one surface behind the whole label, or open sky. Ideal, and what an exterior wall
      //             midflight gives for free.
      //   'mixed' — a couple of surfaces. Tolerated: this is where head clearance under a cable tray
      //             lives, and the user asked for that cue explicitly.
      //   'mosaic' — many distinct surfaces (a curtain-wall grid, a mullion array). REJECTED. Adaptive
      //             ink cannot rescue this: flipping black to white fixes DARKNESS, not busy-ness, and
      //             a cue lost in a mosaic is exactly the "confusing to note" case.
      // Rejecting it is affordable precisely because the user is right about supply — exterior walls
      // midflight offer far more than we need, so there is no reason to keep a marginal one.
      s.skyBehind = !!c.skyBehind;
      s.bg = c.bg || (c.bgClear === true ? 'clear' : (c.bgClear === false ? 'mixed' : null));
      if (s.bg === 'mosaic') { s.why = 'mosaic-background'; return s; }
      s.bgClear = (s.bg === 'clear');
      s.score = Math.min(1, screenFrac / 0.5) * 0.34 + (1 - align) * 0.20 + centred * 0.13
              + (c.skyBehind ? 0.12 : 0) + (s.bgClear ? 0.21 : 0) - (s.partlyHidden ? 0.10 : 0);
      s.pass = true;
      return s;
    };

    // §FLYTHRU_GAPS — the void intervals along one ray. PURE: takes the sorted hit distances the
    // raycaster already produced, returns every gap wide enough to be a feature. Separated from the
    // scene so the witness can prove the interval logic (the part that is actually easy to get wrong)
    // without a renderer. `hits` = ascending distances in metres from the ray origin.
    // `fromOrigin` includes the origin->first-hit interval, which is what head clearance IS (the
    // camera stands in the void; the first thing above is the ceiling or the duct).
    A.flythruGapsAlong = function (hits, fromOrigin) {
      var out = [], i, d0, d1;
      if (!hits || !hits.length) return out;
      if (fromOrigin && hits[0] >= MIN_SPAN_M) out.push({ from: 0, to: hits[0], lengthM: hits[0], kind: 'origin' });
      for (i = 0; i < hits.length - 1; i++) {
        d0 = hits[i]; d1 = hits[i + 1];
        if (d1 - d0 >= MIN_SPAN_M) out.push({ from: d0, to: d1, lengthM: d1 - d0, kind: 'between' });
      }
      return out;
    };

    // §FLYTHRU_CUE_INK (2026-09-07, user: "Another idea will be where the background is dark, simply
    // reverse the coloring ie white on dark"). This turns contrast from an ADMISSION problem into a
    // RENDERING one, and simplifies §FLYTHRU_CLEAR_BG with it: what the backdrop must be is UNIFORM
    // (so the cue is not lost in busy geometry) — not light. Lightness merely picks the ink.
    //
    // Luminance is Rec.709 on the backdrop's own sampled colour, so this is a measurement, not a
    // guess. The threshold sits at 0.45 rather than 0.5 because a mid-grey wall reads better with
    // black on it than white. Both inks carry the OPPOSITE colour as a thin outline, so a cue that
    // straddles a light/dark boundary stays legible on both halves instead of vanishing on one.
    // §FLYTHRU_INK_YELLOW (2026-09-07, user: "Internal been dark, i reckoned the light color we can use
    // should be yellow.") Interiors in this film are genuinely dark — the buildup schedule keeps most
    // of the walk unlit — and pure white on a dark grey wall reads as a blown highlight, indistinct
    // from the specular hits already in the scene. Yellow is unmistakably an ANNOTATION: nothing else
    // in the palette is that hue, so the eye separates it from the building instantly. On a light
    // backdrop black still wins, since yellow on pale concrete is the one place yellow fails.
    var INK_DARK_BG = '#ffd600';   // annotation yellow, reads as "not part of the building"
    var INK_LIGHT_BG = '#000000';
    A.flythruCueInk = function (bgLuminance) {
      var lum = (bgLuminance == null) ? 1 : Math.max(0, Math.min(1, bgLuminance));
      var dark = lum < 0.45;
      // The outline stays a thin contrasting halo, NOT a filled box — see flythruLabelPlace.
      return { ink: dark ? INK_DARK_BG : INK_LIGHT_BG,
               outline: dark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.9)',
               onDark: dark, lum: lum };
    };

    // §FLYTHRU_LABEL_FREE (2026-09-07, user: "The label be just a number without its box border because
    // we do not want to obscure details in the scene ... that numbering can be positioned freely rather
    // than fixed along the line, facing cam for max clarity.")
    //
    // Two changes from the first cut, both about not hiding the building:
    //  - NO filled plate behind the value. A box is opaque by definition and blots out exactly the
    //    detail the measurement is meant to draw attention to. Legibility comes from a thin outline on
    //    the glyphs instead, which costs a 1px halo rather than a rectangle.
    //  - The value is NOT pinned to the line's midpoint. It sits offset to one side, so the line stays
    //    unbroken and the number never covers what is being measured. Screen-space text always faces
    //    the camera, which is the "facing cam for max clarity" part — no 3D billboard needed.
    //
    // PURE: screen coordinates in, screen coordinates out. `preferSide` (+1/-1) lets the caller put the
    // number on whichever side has the calmer backdrop; the default picks the side with more room on
    // screen, so the label drifts inward near a frame edge instead of falling off it.
    A.flythruLabelPlace = function (ax, ay, bx, by, w, h, opts) {
      opts = opts || {};
      var offset = (opts.offsetPx == null) ? 26 : opts.offsetPx;
      var mx = (ax + bx) / 2, my = (ay + by) / 2;
      var dx = bx - ax, dy = by - ay, L = Math.sqrt(dx * dx + dy * dy);
      if (!(L > 0.001)) return { x: mx, y: my, side: 1, leader: null };
      var nx = -dy / L, ny = dx / L;                       // unit normal to the dimension line
      var side = opts.preferSide;
      if (side !== 1 && side !== -1) {
        // No steer from the caller: choose the side with more screen room, measured from the frame
        // centre, so a label near an edge moves inward rather than off.
        var d1 = Math.hypot((mx + nx * offset) - w / 2, (my + ny * offset) - h / 2);
        var d2 = Math.hypot((mx - nx * offset) - w / 2, (my - ny * offset) - h / 2);
        side = (d1 <= d2) ? 1 : -1;
      }
      // §FLYTHRU_AVOID_LABELS (2026-09-07, user: "and to avoid the other labels ie clashes"). During
      // the WALK both label systems are live — clash_labels only stops at beats.reveal
      // (§CLASH_LABELS_STOP) — so a dimension value can land straight on a [tol/clash mm] box. Two
      // numbers overlapping is worse than either alone: neither reads, and a viewer cannot tell which
      // figure belongs to what.
      // The caller passes the rectangles already claimed this frame (clash_labels' own `placed` list,
      // the HUD column, the caption). We try the preferred side, then the opposite, then progressively
      // further out, and return null if nothing is free — DECLINING to draw beats drawing on top of
      // another label, and this cue has no shortage of other moments.
      var pad = 8, labelW = opts.labelW || 90, labelH = opts.labelH || 22;
      var avoid = opts.avoid || [];
      var hits = function (x, y) {
        var i, r, ax0 = x - labelW / 2, ay0 = y - labelH / 2, ax1 = x + labelW / 2, ay1 = y + labelH / 2;
        for (i = 0; i < avoid.length; i++) {
          r = avoid[i];
          if (ax0 < r.x + r.w && r.x < ax1 && ay0 < r.y + r.h && r.y < ay1) return true;
        }
        return false;
      };
      var tries = [], mult;
      for (mult = 1; mult <= 3; mult++) {
        tries.push([side, offset * mult]);
        tries.push([-side, offset * mult]);
      }
      var t, lx, ly, chosenSide = side, found = false;
      for (t = 0; t < tries.length; t++) {
        var sgn = tries[t][0], off = tries[t][1];
        lx = mx + nx * off * sgn; ly = my + ny * off * sgn;
        lx = Math.max(pad, Math.min(w - pad, lx));
        ly = Math.max(pad, Math.min(h - pad, ly));
        if (!hits(lx, ly)) { chosenSide = sgn; found = true; break; }
      }
      if (!found) return null;   // every position collides — decline rather than overlap another label
      // A short leader from the line to the number, so an offset value still reads as belonging to it.
      return { x: lx, y: ly, side: chosenSide, leader: { x1: mx, y1: my, x2: lx, y2: ly } };
    };
    // Rec.709 luminance of an sRGB triple in 0..1 — the standard weighting, not an average.
    A.flythruLuminance = function (r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

    // §FLYTHRU_OUTDOORS (2026-09-07, user: "it is the outside walls midflight that poses the most
    // opportunities, thus there can have the most.") A cheap, exact test for whether the camera is
    // outside the building at this instant: cast straight UP. Nothing overhead means open sky, which
    // means an exterior wall is available to measure against a uniform backdrop with no occluders in
    // front of it. `hitsAbove` is supplied by the caller (it needs the scene); this stays pure.
    // Used to WEIGHT the search — sample exterior stretches of the walk more densely, since that is
    // where the good cues are — never to reject interior ones, which the user still wants
    // (head clearance, hall breadth) just in smaller number.
    A.flythruIsOutdoors = function (hitsAbove) { return !hitsAbove || hitsAbove.length === 0; };

    // §FLYTHRU_HOLD (2026-09-07, user: "Rather than distance, we should use a criteria of 2 sec hold.
    // If a blue-dots measure can be on frame for at least 2 seconds then it can be marked, drawn. I
    // wonder if it can take a half secound ie 7-12 frames of buildup, so user will notice a length or
    // breadth been drawn across.")
    //
    // THIS REPLACES PROXIMITY as the selection criterion. "Near the camera" says nothing about whether
    // a viewer can read the number; "stays on frame 2 seconds" says exactly that. It also kills
    // flicker structurally rather than by patching: a span is chosen ONCE for a window it is known to
    // survive, instead of being re-judged every frame at a threshold it may be sitting on.
    //
    // Everything here is in FILM SECONDS, never frames and never performance.now() — the same rule
    // clash_film.js's pulse envelope already follows, so a 15 fps and a 24 fps bake of the same film
    // animate identically. The user's "7-12 frames" IS 0.5s at 15 and 24 fps respectively; expressing
    // it in seconds is what makes both true at once.
    var MIN_HOLD_SEC = 2.0;     // must survive this long on frame to be worth drawing at all
    var BUILDUP_SEC  = 0.5;     // the line draws ACROSS so the viewer notices it being measured
    var FADEOUT_SEC  = 0.35;

    // PURE. `samples` = ascending film seconds at which this ONE span was tested; `passed` = the gate
    // verdict at each. Returns the first run of consecutive passes long enough to use, or null.
    // Separated from the scene so the witness can prove the windowing without a GPU.
    A.flythruHoldWindow = function (samples, passed) {
      if (!samples || !passed || samples.length !== passed.length || !samples.length) return null;
      var i, runStart = -1, best = null;
      for (i = 0; i <= samples.length; i++) {
        var ok = (i < samples.length) && !!passed[i];
        if (ok && runStart < 0) runStart = i;
        if (!ok && runStart >= 0) {
          var t0 = samples[runStart], t1 = samples[i - 1];
          var dur = t1 - t0;
          if (dur >= MIN_HOLD_SEC && (!best || dur > best.durSec)) best = { startSec: t0, endSec: t1, durSec: dur };
          runStart = -1;
        }
      }
      if (!best) return null;
      // The buildup must fit INSIDE the window — a cue that is still drawing itself when it vanishes
      // is worse than one that never appeared. With MIN_HOLD 2.0s and BUILDUP 0.5s this always holds,
      // but it is asserted rather than assumed so a future retune cannot silently break it.
      best.buildupSec = Math.min(BUILDUP_SEC, best.durSec * 0.25);
      best.fadeSec = Math.min(FADEOUT_SEC, best.durSec * 0.2);
      return best;
    };

    // The draw envelope at one instant: how much of the line is drawn, and the label's opacity.
    // 0 -> 1 over buildupSec (the "drawn across" reveal), then solid, then a short fade.
    // Returns null outside the window so the caller draws nothing at all.
    // §FLYTHRU_REENTRY (2026-09-07, user: "just reflect if this disturbs the whole movie. Even if they
    // remain shine thru. We just let them appear when near enough.")
    //
    // IT WOULD HAVE DISTURBED IT. Persistence plus shine-through means a cue ignores occlusion, so a
    // LARGE span stays eligible long after it is meaningful: the building envelope's dMax is ~950m, so
    // it would qualify from anywhere in the film, permanently, drawn through the building. The 58m wall
    // and 50m slab are nearly as bad. The accumulation would not be a few familiar marks — it would be
    // a scaffold of big lines over every later shot.
    //
    // So RE-ENTRY IS STRICTER THAN INTRODUCTION. A cue is introduced when it merely reads
    // (MIN_SCREEN_FRAC); it RETURNS only when it is prominent — near enough that the viewer is plainly
    // being shown it again, not merely within range of it. Everything else about persistence stands:
    // the measure is remembered, it just does not follow you around.
    //
    // Expressed as a multiple of the introduction threshold so it scales with any retune of the gate,
    // and applied to APPARENT SIZE rather than raw distance, so a big span must genuinely fill frame
    // rather than being waved at from across the site.
    var REENTRY_MULT = 2.2;   // ~33% of frame width against the 15% introduction floor
    A.flythruReentryFrac = function () { return MIN_SCREEN_FRAC * REENTRY_MULT; };
    // `screenFrac` at this instant; `isFirstShowing` distinguishes the introduction from a return.
    A.flythruShouldShow = function (screenFrac, isFirstShowing) {
      if (!(screenFrac > 0)) return false;
      return isFirstShowing ? (screenFrac >= MIN_SCREEN_FRAC)
                            : (screenFrac >= MIN_SCREEN_FRAC * REENTRY_MULT);
    };
    // A cue whose whole purpose is the opening statement should not persist at all — it would dominate
    // every later frame by sheer size. The caller marks those one-shot.
    A.flythruIsStatementCue = function (spanM, buildingDiagM) {
      if (!(spanM > 0) || !(buildingDiagM > 0)) return false;
      return spanM >= buildingDiagM * 0.5;   // half the building or more: a statement, not a detail
    };

    // §FLYTHRU_PERSIST (2026-09-07, user: "WE can let all these measures stay thruout the movie, so
    // that incidental catching sight again, there be familiarity where they come from ... At first
    // viewer may wonder where is it, upon next reveal round they understood it.")
    //
    // A measure is INTRODUCED once, with its draw-across, and then STAYS for the rest of the film —
    // drawn whenever it happens to be on screen. This changes what the cue is: not a caption that
    // appears and goes, but an annotation the model keeps. The payoff is on the SECOND sighting. The
    // reveal round retraces ground already walked, so a figure that was puzzling in a corridor becomes
    // legible when the same span is seen from outside with the building open — the viewer places it.
    // That recognition is impossible if the cue expires.
    //
    // `opts.persist` selects it. The window's END no longer ends the cue; it only ends the guarantee
    // that it is worth showing. Whether a persisting cue actually draws on a given frame is decided by
    // the cheap gate at that frame (on screen, big enough, label has room) — so it costs a projection
    // per introduced cue per frame, no raycasting, and it self-limits: when the frame is crowded,
    // flythruLabelPlace declines rather than overlapping.
    A.flythruDrawStateAt = function (win, filmSec, opts) {
      if (!win) return null;
      var persist = !!(opts && opts.persist);
      if (filmSec < win.startSec) return null;                 // not yet introduced
      if (!persist && filmSec > win.endSec) return null;        // one-shot: over
      var u = filmSec - win.startSec;
      var draw = (win.buildupSec > 0) ? Math.min(1, u / win.buildupSec) : 1;
      var op = 1;
      if (!persist) {
        var left = win.endSec - filmSec;
        op = (win.fadeSec > 0) ? Math.min(1, left / win.fadeSec) : 1;
      }
      // The value only appears once the line has finished drawing across — the number lands as the
      // arrow heads meet, which is what makes the measurement read as an action rather than a caption.
      return { lineFrac: draw, labelOpacity: (draw >= 1 ? Math.min(1, op) : 0), opacity: Math.min(1, op),
               persisting: persist && filmSec > win.endSec };
    };

    console.log('§FLYTHRU_DIMS_INIT wired (gate + gap finder; no allocation until a cast runs)');
  }
}
if (typeof window !== 'undefined') window.setupCpeFlythruDims = setupCpeFlythruDims;
