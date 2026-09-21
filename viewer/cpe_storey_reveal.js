/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// cpe_storey_reveal.js — §STOREY_HIGHLIGHT_REVEAL (bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md,
// 2026-09-06 spec + addendum + mid-session user correction). Window is the LAST 5 REAL SECONDS of
// the `pullback` beat, ending exactly where the `orbit` beat begins (plan.beats.rise) — NOT the
// orbit beat itself (a first cut used beats.rise..1, corrected after the user clarified "final 5
// seconds ending before orbit" and a second feature — MEP_CLASH_REVEAL_MOVIE.md's discipline-pair
// clash highlight — claimed the rest of `pullback`). §CINEMA_PACING on a real Hospital bake: natural
// 195.8s = dive 7.9 + spin 0.0 + walk 75.0 + pullout 1.5 + flyback 19.8 + round2 56.0 + tail 10.0 +
// pullback 17.6 + orbit 8.0 — `plan.beats.rise` (fraction 0.9591) is the pullback→orbit boundary
// (effects.js's own `tR = tV + _riseFolded/_shapeTotal`, where the OWN comment names it "orbit
// start"); `plan.storeyReveal.windowFrac` (also computed in effects.js, from `_useSec.rise`, the
// UNFOLDED pullback seconds — not `_riseFolded`, which also contains the tail — so this window can
// never bleed into the tail's own disc-parade caption zone) is the fraction-width of the last 5s of
// that 17.6s pullback. This file fills exactly that narrow window: each storey highlights in
// sequence (a repeating blue/green/yellow/orange tint cycle) while a HUD card shows that storey's
// REAL door count (a complete elements_meta census — always shown, 0 is a genuine fact) and, only
// when the data genuinely exists, a labeled footprint-bbox estimate and a compiled room count
// (room count omitted at 0 — §VACUOUS convention, prompts/4D_MODEL_INTEGRITY.md §E: a 0 that means
// "not measured for this storey" is not a metric worth showing, unlike the door census's real 0s).
//
// NON-INVENT: every number in the stat card is a live query against A.db (elements_meta,
// element_transforms, spatial_structure) — nothing here is computed or guessed. The storey LIST
// itself is not baked into the plan; it is queried live and cached per building, same as
// cpe_room_title.js's own _storeyLadderForGroups().
//
// ONE PURE FUNCTION, TWO CALLERS (this lane's own established discipline — see cpeRevealVisualAt in
// effects.js): A.storeyRevealVisualAt(plan, tNorm) is read identically by the bake loop
// (cinema_maxq.js) and the editor's live preview tick (cinema_path_editor.js's _previewFly step()),
// so bake and preview can never disagree about which storey/color is active at a given film fraction.
function setupCpeStoreyReveal(A) {
  // §129.60 (2026-09-20) — THIS FILE IS DUAL-MODE ON PURPOSE (see its own `module.exports` at the
  // bottom: "lets witness_storey_reveal_list.js exercise A.storeyRevealList against a real
  // in-memory sql.js DB in Node"), but ~20 sites inside this function read `window.` bare while
  // the top-level lines guard with `typeof window !== 'undefined'`. In Node the first such read —
  // `window.__srForceLabelLadder` in _regroupByRung — threw ReferenceError before any assertion
  // ran, so witness_storey_reveal_list.js AND witness_storey_cut.js have both been ABORTING, not
  // passing. Neither has ever been able to go green.
  //
  // One shadowing declaration fixes all of them instead of twenty edits. In a browser this binds
  // the REAL window (identical behaviour, same object, writes still land on it); in Node it binds
  // an empty object, so every `window.__sr*` debug/control lever reads undefined, which is exactly
  // what "no lever set" means. It is the first statement in the function so hoisting cannot leave
  // it undefined at any use site.
  var window = (typeof globalThis !== 'undefined' && globalThis.window) ? globalThis.window : {};
  // Blue -> green -> yellow -> orange -> blue (repeats every 4 storeys) — the user's own words,
  // generalized past exactly 5 storeys since real buildings rarely have exactly 5 (Hospital has 8
  // countable levels once Ceiling/TOS pseudo-storeys are excluded — see storeyRevealList below).
  var COLORS = [0x2979ff, 0x00c853, 0xffd600, 0xff6d00];   // blue, green, yellow, orange
  // §13-adjacent: the SAME lift cpe_load_path.js:508 uses for its own coloured clones
  // (SHINE_EMISSIVE_LIFT = 0.35, "solid rainbow with a slight emissive lift"). One number, taken
  // from the lane that already solved this on the same kind of geometry, not a second guess at it.
  var TINT_EMISSIVE_LIFT = 0.35;
  // §FINDINGS_HUD_CLEAR — seconds of visibly cleared frame before the storey reveal opens (red1:
  // "give 2 more secs back to see other overlays going off"). Seconds, never a film fraction.
  var FINDINGS_CLEAR_LEAD_SEC = 2;
  // …and the tail they are allowed when there is NO storey reveal to cease at (red1: "IF the
  // storey reveal check is not on, the M/C/S overlays may linger at most 2 s, no more for
  // graceful ending"). Measured from the closing orbit's own start.
  var FINDINGS_OFF_TAIL_SEC = 2;
  // ══ §129.59 (2026-09-20) — THE TINT IS BACK, WHOLE-STOREY, WITH NO X-RAY ═════════════════════
  // red1, on ~/Downloads/allon_storeyreveal_to_end_1080p24.mp4: "Look at the more cool impact" —
  // the tint-era beat lights a whole level and reads as an event; the section cut does not.
  //
  // TWO THINGS WERE RETIRED TOGETHER IN §108 AND THEY ARE NOT THE SAME THING:
  //
  //  1. §93.4, MEASURED and STILL TRUE — `_applyTint` only touched the FACADE SUBSET
  //     (`_facadeGuidsFor`, gating all three branches). That set is 2-51 meshes per storey and its
  //     legibility tracks PROJECTED AREA, which nothing computes: Level 4 (51) read as broad bands,
  //     Level 5 (44) only as parapet lines, Levels 1/7A/7 (19/2/6) NOT AT ALL. That is the real
  //     defect, and simply flipping the old flag back on would bring every bit of it with it.
  //  2. THE X-RAY, which is what made the tint read as a whole glowing volume in the old films, and
  //     which costs 2.6x-3.0x (storey window 4.13 s/frame with it, orbit 1.57 without; a dedicated
  //     88-frame A/B 4.24 vs 1.40). It stays OFF. `A.toggleXray` sets opacity 0.3 PER SURFACE with
  //     DoubleSide, so the eye gets ~0.7^n through n surfaces — about 3% through ten — which is why
  //     red1's ruling on the A/B clips was "u can see x-ray has no effect". ⚠ Those A/B clips are
  //     the ESCAPE ROUTE beat, not this one (red1 confirmed); they prove x-ray is dead weight in
  //     the orbit, NOT that a facade-only tint reads without it.
  //
  // So the fix is the SCOPE, not the flag: tint every mesh on the level and it reads as a coloured
  // mass from outside — floor plate edges, exposed structure and facade together — with no x-ray.
  //
  // ONE MODE, NOT TWO FLAGS. §108's own post-mortem is why: the tint "was still running underneath
  // the section cut", and because the ground-slab pass and Level 1's pass are two slots on the SAME
  // storey, that storey got painted twice — "one cause, two symptoms". A single mode makes that
  // state unrepresentable instead of merely discouraged. The cut is NOT deleted: every §98/§102/
  // §110 timing constant below is untouched and 'cut' restores it in one word.
  var STOREY_REVEAL_MODE = 'tint';           // 'tint' | 'cut'
  var STOREY_REVEAL_TINT = (STOREY_REVEAL_MODE === 'tint');
  // 'storey' = every mesh on the level (§129.59). 'facade' = §93.4's original subset, kept so its
  // measurements stay reproducible — the same reason §108 left the whole path intact behind a flag.
  var STOREY_REVEAL_TINT_SCOPE = 'storey';   // 'storey' | 'facade'
  var EMOJI  = ['🔵', '🟢', '🟡', '🟠'];  // 🔵 🟢 🟡 🟠
  // Fade in/out fraction of each storey's own slot — same shape as cpe_resource_panel.js's
  // A.bigStatsAt fade (`min(u,1-u)/0.12`), slightly wider here because a slot can be sub-second
  // (see the spec addendum's dwell-scaling note) and a hard cut reads worse than a fast crossfade.
  var FADE_FRAC = 0.15;
  // §STOREY_REVEAL_FIT (2026-09-06, user ruling: "HUD cards for the last part is at best effort.
  // Been too fast is fine. Need not add more secs to it. We can forego top floors if the time frame
  // does not allow. Qualitative above quantitative.") — the window is FIXED at 5 real seconds and is
  // never widened to fit more storeys. Instead the sequence is TRUNCATED so each storey it does show
  // gets at least MIN_SLOT_SEC of screen time. Hospital measures 8 physical storeys; at 5s that would
  // be 0.63s each, of which FADE_FRAC eats 30% — a colour strobe, not a readable card. Capped at
  // 1.0s minimum the sequence shows the BOTTOM 5 (which is also exactly the blue/green/yellow/orange/
  // blue cycle originally asked for). Dropped from the TOP, per the user's own "forego top floors":
  // the lower storeys are the ones the camera has actually been inside during the film.
  var MIN_SLOT_SEC = 1.0;
  // §103.2 — a band carrying below this fraction of the MEDIAN band's DOOR count is a pseudo storey.
  // 0.10 sits in a wide measured gap on both fleet buildings: Hospital's occupied storeys run
  // 56-114 doors (median 64.5, so the line is at 6.45) against Level 6's 5, Level 7A's 0 and
  // Level 7's 1; HHS runs 34-43 (line at 3.65) against Roof Level's 0. Nothing sits near the line.
  var PSEUDO_FRAC = 0.10;
  // Fraction of each storey's slot the tint is actually LIT (the rest is the dark rest phase above).
  var LIT_FRAC = 0.72;

  // §STOREY_REVEAL_LIST — the real, ordered set of physical storeys. Excludes ' Ceiling'/' TOS'
  // pseudo-storeys and 'Unknown' (same exclusion elements_meta's own storey column needs elsewhere,
  // e.g. cpe_resource_panel.js's NOT_PLACEHOLDER guard) so the sequence names only storeys a BIM user
  // would call a storey. Ordered by mean element Z — the same real-Z-ladder cpe_room_title.js's
  // _storeyLadderForGroups() already builds (not re-derived differently here; this is a query against
  // the same two tables, kept local because that function is private to cpe_room_title.js).
  // §STOREY_REVEAL_REAL_STOREYS_ONLY (2026-09-11, MEP_CLASH_REVEAL_MOVIE.md §60.1 — user: the reveal
  // highlights are "still not satisfactory"). The three string filters above are NECESSARY but not
  // SUFFICIENT: `elements_meta.storey` is a free-text label an exporter writes per element, not the
  // IFC spatial hierarchy. MEASURED on the canonical ~/Downloads/HHS_Office_Federated_silent.db —
  // `spatial_structure` holds exactly 3 `IfcBuildingStorey` rows (Level 1/2/3) while `elements_meta`
  // also carries `storey='Roof Level'` on 45 elements (22 IfcFlowSegment, 10 IfcFlowFitting, 7
  // IfcSlab, 5 IfcBuildingElementProxy, 1 IfcEnergyConversionDevice — ZERO walls, ZERO doors, ZERO
  // IfcSpace, no storey_walkable_raster row). That is rooftop MEP, not an occupiable storey, and it
  // was taking a full reveal slot: on the 2026-09-11 HHS bake that is 1.01s of a 4.03s window (25%)
  // spent on `§STOREY_REVEAL_TINT storey="Roof Level" meshesTouched=0` — a card reading "0 doors"
  // over a building with nothing lit (0 tinted pixels on screen, every frame of the slot, measured).
  // It also silently defeated §STOREY_REVEAL_LAST_STAYS_LIT, whose whole purpose is that the window
  // must not END dark: the storey it kept "lit" lit nothing.
  // So: intersect with the names the model ITSELF calls `IfcBuildingStorey`. Same table/type predicate
  // cpe_storey_reveal.js's own room-count query already trusts (`bs.type='IfcBuildingStorey'` in
  // storeyRevealStatsFor below) — EXTRACT, don't invent a second notion of "is a storey".
  // DEGRADE, DON'T DISABLE, twice over: a DB whose `spatial_structure` declares NO storey at all (an
  // older export) keeps the pre-fix list untouched, and a cross-check that would empty the list
  // entirely (label/name drift between the two tables) is REFUSED and falls back to the full list —
  // a silent zero-storey reveal is never an acceptable outcome of a filter. Both cases are logged.
  // CROSS-BUILDING SAFETY, checked before writing this: ~/Downloads/Hospital_silent.db declares 64
  // `IfcBuildingStorey` rows covering Level 1..7A, so every storey Hospital shows today survives.
  // §STOREY_RUNG_LADDER (2026-09-15, MEP_CLASH_REVEAL_MOVIE.md §128.10 item 14 — Fable's root cause).
  // A federated export carries ONE NAMING SYSTEM PER SUB-MODEL: LTU_AHouse declares 43 storey rows —
  // six sub-models x "Plan 1-4", plus VÅN 1-5, Storey 1-3, VÅNING 1-4, TAKPLAN, Ref. — for 5 PHYSICAL
  // levels. The list above groups by LABEL, so a per-label ceiling (next label's slab bottom)
  // interleaves naming systems in Z order and is not monotone by construction: §STOREY_CUT_BOUNDS
  // measured base=0.81 tops=[0.70,0.70,4.39,4.65,2.70,...] on LTU, real arithmetic on a broken
  // premise, not a bug in the arithmetic. THE FIX: the reveal's ruler must be the PHYSICAL LEVEL
  // LADDER, with storey labels folded in as aliases of whichever rung their elements actually sit on
  // — never a list of labels. Both halves already have owners:
  //   ladder    = ScheduleAuthor._chooseStoreyDatum(_storeyDatumCandidates(db), elementBaseZs) —
  //               already runs for the 4D schedule and prints §STOREY_DATUM ladder=5 on LTU; picks
  //               between `elevation`/`center_z` candidates by checking which is IN FRAME (its span
  //               contains the element base-Z median), so LTU's 38 bogus center_z=0.00 federated rows
  //               never win over the 5 real compiled rows (VÅNING 1-4, TAKPLAN).
  //   which rung = each LABEL (not each element — _objStorey() only ever returns a label, the scene
  //               graph carries no per-member geometry cheap enough to re-derive here) maps to the
  //               ladder rung nearest its own mean-Z (LevelDeriver.nearestIdx, the same nearest-band
  //               verb the 4D level axis already uses, gate-passed on 7 fleet buildings) — matches
  //               Fable's measurement that every naming system's "N" labels cluster at the same
  //               physical band (VÅNING 1/VÅN 1/Storey 1/Plan 1 all 2.7-5.3m, etc).
  // DEGRADE, DON'T DISABLE (same discipline as the cross-check above): a building with no usable datum
  // frame (`_chooseStoreyDatum` returns INFERRED — no spatial_structure elevation/center_z in frame
  // with the elements, e.g. a bare `_extracted.db`) or fewer than 2 rungs keeps the pre-existing
  // per-label list untouched. `deriveStoreyMergeMap` is NOT used — Fable measured it runs on nothing
  // in the fleet (no caller ever wires it up); do not resurrect it here.
  var _rungKey = null, _rungFrame = null;
  function _chooseRungFrame() {
    var key = (A.activeBuilding || A.currentBuilding || 'bld') + '|' + (A._metaGen || 0);
    if (_rungFrame !== null && _rungKey === key) return _rungFrame || null;
    _rungKey = key;
    _rungFrame = null;
    try {
      var SA = window.ScheduleAuthor, LD = window.LevelDeriver;
      if (!SA || !SA._chooseStoreyDatum || !SA._storeyDatumCandidates || !SA._ladderBandIndex || !LD || !LD.nearestIdx) {
        console.log('§STOREY_RUNG_LADDER unavailable=' + (SA ? 'LevelDeriver' : 'ScheduleAuthor') +
          ' not loaded — keeping the per-label list (§60.1 pre-fix behaviour)');
        return null;
      }
      // Same population §STOREY_DATUM's own frame test uses: real geometry, no openings/spaces/no-geo.
      var ezs = [];
      (A.dbQuery(
        "SELECT t.center_x, t.center_y, t.center_z, t.bbox_x, t.bbox_y, t.bbox_z " +
        "FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid " +
        "WHERE m.ifc_class != 'IfcOpeningElement' AND m.ifc_class != 'IfcSpace'") || []).forEach(function (r) {
        var cx = +r[0] || 0, cy = +r[1] || 0, cz = +r[2] || 0, bx = +r[3] || 0, by = +r[4] || 0, bz = +r[5] || 0;
        if (cx === 0 && cy === 0 && cz === 0 && bx === 0 && by === 0 && bz === 0) return;   // §4D_NOGEO
        ezs.push(cz - bz / 2);
      });
      var frame = SA._chooseStoreyDatum(SA._storeyDatumCandidates(A.db), ezs);
      if (frame.mode !== 'DECLARED' || frame.ladder.length < 2) {
        console.log('§STOREY_RUNG_LADDER mode=' + frame.mode + ' reason=' + (frame.reason || 'n/a') +
          ' rungs=' + frame.ladder.length +
          ' — no usable physical-level datum, keeping the per-label list (degrade, don\'t disable)');
        return null;
      }
      var ladderZs = frame.ladder.map(function (r) { return r.z; });
      console.log('§STOREY_RUNG_LADDER mode=DECLARED source=' + frame.source + ' rungs=' + frame.ladder.length +
        ' ladder=[' + frame.ladder.map(function (r) { return r.name + '@' + r.z.toFixed(2); }).join(',') + ']');
      _rungFrame = { ladder: frame.ladder, ladderZs: ladderZs, nearestIdx: LD.nearestIdx,
        ladderBandIndex: SA._ladderBandIndex };
    } catch (e) {
      console.warn('§STOREY_RUNG_LADDER_ERR ' + e.message + ' — keeping the per-label list');
      _rungFrame = null;
    }
    return _rungFrame;
  }
  // §STOREY_RUNG_VOTE (2026-09-15, Fable's review of item 15) — a label's RUNG is not its aggregate
  // mean-Z. MEASURED on LTU: "Plan 1" (mean-Z 5.26, physically level 1) sits closer to VÅNING 2's
  // datum (6.35) than VÅNING 1's (3.04), so nearest-idx-on-the-mean books 105k of LTU's 122k elements
  // (the Plan 1-4 label family alone) one rung high — a federated label's mean drifts across a rung
  // boundary whenever its own members are unevenly distributed above the floor line, which is the
  // common case, not the exception. Fix: vote PER ELEMENT instead of testing the aggregate once.
  // `_ladderBandIndex` is the SAME "last rung at or below" verb schedule_author.js already uses to
  // decide which rungs are populated (own function, not re-derived — §STOREY_RUNG_LADDER's own
  // comment above); apply it to every element's own base-Z and let the label's rung be whichever
  // index most of its members actually stand on — one label can never be split by this, and a handful
  // of boundary-straddling members no longer outvotes the rest.
  function _labelRungVotes(rf) {
    var votes = {};
    try {
      (A.dbQuery(
        "SELECT m.storey, t.center_z - t.bbox_z/2 FROM elements_meta m " +
        "JOIN element_transforms t ON t.guid = m.guid " +
        "WHERE m.storey IS NOT NULL AND m.storey NOT IN ('','Unknown')") || []).forEach(function (r) {
        var name = String(r[0]), bz = +r[1];
        if (!isFinite(bz)) return;
        var idx = rf.ladderBandIndex(rf.ladder, bz);
        var v = votes[name] || (votes[name] = {});
        v[idx] = (v[idx] || 0) + 1;
      });
    } catch (e) { votes = {}; }
    return votes;
  }
  // Regroup a per-label list (§STOREY_REVEAL_LIST's `all`, before §103's pseudo/roof pass) into one
  // entry PER PHYSICAL RUNG. `tapForceLabelLadder` (control, §STOREY_RUNG_CONTROL) skips regrouping
  // so the pre-fix behaviour can be reproduced on demand — the falsifiability control this fix needs.
  function _regroupByRung(all) {
    if (window.__srForceLabelLadder) {
      console.log('§STOREY_RUNG_CONTROL tap=__srForceLabelLadder active — regrouping SKIPPED, per-label list forced');
      return all;
    }
    var rf = _chooseRungFrame();
    if (!rf) return all;
    var byRung = {};
    // §125.1 — a label whose name literally IS the ladder's own declared name is force-matched to
    // that rung FIRST, bypassing the vote: it is the authoritative source of the rung's OWN datum
    // (_storeyDatumCandidates read this exact row), so it must never be voted away from its own rung.
    // Every OTHER label (no exact name match anywhere in the ladder) goes by the per-element vote;
    // `__srMeanNearestRung` (control) forces the pre-review nearest-idx-on-mean test instead, so
    // Fable's exact finding (Plan 1/Plan 2 one rung high on LTU) can be reproduced on demand.
    var ladderNameToIdx = {};
    rf.ladder.forEach(function (r, i) { ladderNameToIdx[r.name] = i; });
    var votes = window.__srMeanNearestRung ? {} : _labelRungVotes(rf);
    var corrected = 0, voteMisses = 0;
    all.forEach(function (s) {
      var idx;
      if (ladderNameToIdx[s.name] !== undefined) {
        idx = ladderNameToIdx[s.name];
      } else if (!window.__srMeanNearestRung && votes[s.name]) {
        var v = votes[s.name], bestIdx = 0, bestCt = -1;
        Object.keys(v).forEach(function (k) { if (v[k] > bestCt) { bestCt = v[k]; bestIdx = +k; } });
        idx = bestIdx;
        if (idx !== rf.nearestIdx(rf.ladderZs, s.z)) corrected++;
      } else {
        if (!window.__srMeanNearestRung) voteMisses++;   // no element rows recovered — degrade, never silent
        idx = rf.nearestIdx(rf.ladderZs, s.z);
      }
      (byRung[idx] = byRung[idx] || []).push(s);
    });
    console.log('§STOREY_RUNG_VOTE mode=' + (window.__srMeanNearestRung ? 'CONTROL(meanNearest)' : 'perElementVote') +
      ' labels=' + all.length + ' correctedVsMeanNearest=' + corrected + ' voteMisses=' + voteMisses +
      ' (correctedVsMeanNearest is 0 only when the mean-Z test already agreed with every element vote —' +
      ' nonzero is the fix doing real work, same falsifiability shape as naiveInversions below)');
    var out = [];
    Object.keys(byRung).map(Number).sort(function (a, b) { return a - b; }).forEach(function (idx) {
      var members = byRung[idx], rung = rf.ladder[idx];
      var n = members.reduce(function (a, s) { return a + s.n; }, 0);
      var doors = members.reduce(function (a, s) { return a + s.doors; }, 0);
      // The rung's own declared name is the caption when one of the grouped labels actually IS it
      // (forced above, so this always finds it when such a label exists at all); otherwise the label
      // nearest the rung's z stands in, so a caption is never invented. Every other grouped label is
      // an alias, riding the SAME `.absorbs` mechanism §103 already uses (_storeyGroupIndex maps
      // every alias to this group with zero further changes).
      var primary = members.filter(function (s) { return s.name === rung.name; })[0] ||
        members.slice().sort(function (a, b) { return Math.abs(a.z - rung.z) - Math.abs(b.z - rung.z); })[0];
      var aliases = members.filter(function (s) { return s !== primary; }).map(function (s) { return s.name; });
      out.push({ name: primary.name, z: rung.z, n: n, doors: doors, absorbs: aliases.length ? aliases : undefined,
                 rungAliasCount: aliases.length });
      if (n === 0) console.log('§STOREY_REVEAL_RUNG_EMPTY rung="' + rung.name + '" aliases=[' + aliases.join(',') +
        '] => FAIL (a rung with zero members is not a reveal group; check the ladder/grouping)');
    });
    console.log('§STOREY_RUNG_GROUPED labels=' + all.length + '->' + 'rungs=' + out.length +
      ' groups=[' + out.map(function (g) { return g.name + (g.absorbs ? '+{' + g.absorbs.join(',') + '}' : ''); }).join(',') + ']');
    return out;
  }

  var _list = null, _listKey = null;
  A.storeyRevealList = function () {
    var key = (A.activeBuilding || A.currentBuilding || 'bld') + '|' + (A._metaGen || 0);
    if (_list && _listKey === key) return _list;
    var rows = [];
    try {
      rows = A.dbQuery(
        "SELECT m.storey, AVG(COALESCE(t.center_z,0)), COUNT(*), " +
        "SUM(CASE WHEN m.ifc_class='IfcDoor' THEN 1 ELSE 0 END) FROM elements_meta m " +
        "JOIN element_transforms t ON t.guid=m.guid " +
        "WHERE m.storey IS NOT NULL AND m.storey NOT IN ('','Unknown') " +
        "AND m.storey NOT LIKE '% Ceiling' AND m.storey NOT LIKE '% TOS' " +
        "GROUP BY m.storey");
    } catch (e) { rows = []; }
    var all = (rows || []).map(function (r) { return { name: String(r[0]), z: +r[1], n: +r[2] || 0, doors: +r[3] || 0 }; });
    all.sort(function (a, b) { return a.z - b.z; });
    var declared = null;
    try {
      var sr = A.dbQuery(
        "SELECT name FROM spatial_structure WHERE type='IfcBuildingStorey' " +
        "AND name IS NOT NULL AND name <> ''") || [];
      if (sr.length) { declared = {}; sr.forEach(function (r) { declared[String(r[0])] = true; }); }
    } catch (eS) { declared = null; }
    var dropped = [], note = '';
    if (declared) {
      var kept = all.filter(function (s) {
        if (declared[s.name]) return true;
        dropped.push(s.name); return false;
      });
      if (kept.length) { _list = kept; }
      else {
        _list = all; dropped = [];
        note = ' — CROSS-CHECK REFUSED: spatial_structure declares storeys but none matches an' +
               ' elements_meta storey label (name drift); keeping the full list rather than' +
               ' emptying the reveal';
      }
    } else {
      _list = all;
      note = ' (spatial_structure declares no IfcBuildingStorey — no cross-check, pre-§60.1 behaviour)';
    }
    // §STOREY_RUNG_LADDER (item 14) — regroup the cross-checked LABEL list into PHYSICAL RUNGS before
    // §103's pseudo/roof pass runs, so that pass (and every consumer of `_list` after it: _cutBounds,
    // _storeyGroupIndex, the stat card) sees one entry per real level with a monotone Z, aliases
    // riding the existing `.absorbs` mechanism. No-op (returns `_list` unchanged) when the building has
    // no usable datum frame — degrade, don't disable.
    _list = _regroupByRung(_list);
    // §103 (user, 2026-09-13): "Group pseudo storeys into real storeys to reduce passes." A plant
    // deck / partial roof level is a declared IfcBuildingStorey, so §60.1's cross-check keeps it and
    // it buys a whole 2.0s pass to reveal ~100 elements. DERIVED, not a name list: a band carrying
    // less than PSEUDO_FRAC of the MEDIAN band's element count is not a storey the eye reads as one,
    // so it is ABSORBED into the nearest real storey BELOW it — the group keeps the lower storey's
    // name (what the stat card names) and its members ride that storey's sweep.
    // Measured 2026-09-13: Hospital counts [8485,6364,10578,11470,7940,1487,155,114], median 7152 —
    // Level 7A (155 = 2.2%) and Level 7 (114 = 1.6%) absorb into Level 6, 8 passes -> 6. Level 6
    // (1487 = 20.8%) is well clear and stays its own pass. HHS [1505,1783,1427] — nothing absorbs,
    // the rule is a no-op there, which is the check that it is not tuned to one building.
    if (_list.length > 1) {
      // §103.2 (user, 2026-09-13): "I suspect 0 doors is the pseudo floor thus has to combine with
      // another." Right, and doors are a much sharper predicate than element count — a storey people
      // occupy has doors; a plant deck or roof does not. MEASURED on both fleet buildings, and the
      // gap is not marginal: Hospital's occupied storeys carry 56/73/88/96/114 doors while Level 6
      // carries 5, Level 7A 0 and Level 7 1; HHS carries 34/39/43 against Roof Level's 0. Element
      // count could not see Level 6 at all (1,487 elements = 20.8% of median, comfortably "real"),
      // which is exactly the floor the user spotted on the card. Same median-fraction shape as
      // before, applied to doors.
      var _ns = _list.map(function (x) { return x.doors; }).slice().sort(function (a, b) { return a - b; });
      var _med = _ns.length % 2 ? _ns[(_ns.length - 1) / 2] : (_ns[_ns.length / 2 - 1] + _ns[_ns.length / 2]) / 2;
      if (_med > 0) {
        // §103.1 (user, 2026-09-13): "Since roof is highly visible, it can be accepted as a last
        // single pass." The TRAILING run of pseudo bands is the roof/plant deck — the most visible
        // thing in the silhouette — so it is NOT absorbed downward. It becomes ONE final pass of its
        // own, however many thin bands it contains. Only INTERIOR pseudo bands absorb into the storey
        // below them, where nothing is lost to the eye. Hospital: Level 7A + Level 7 are the trailing
        // run, so 8 passes -> 7, the last being the roof; HHS has no pseudo band at all and is
        // untouched, which is the check that the rule is derived rather than fitted to one model.
        var _tail = _list.length;
        while (_tail > 0 && (_list[_tail - 1].doors / _med) < PSEUDO_FRAC) _tail--;
        var roofRun = (_tail > 0 && _tail < _list.length) ? _list.slice(_tail) : [];
        var body = roofRun.length ? _list.slice(0, _tail) : _list;
        var grouped = [], absorbed = [];
        body.forEach(function (st) {
          var isPseudo = (st.doors / _med) < PSEUDO_FRAC;
          if (isPseudo && grouped.length) {                 // nothing below to absorb into = keep it
            var host = grouped[grouped.length - 1];
            host.absorbs = (host.absorbs || []).concat([st.name]);
            host.zTop = st.z;                                // the group now reaches this band's height
            absorbed.push(st.name + '(' + st.doors + ' doors=' + (100 * st.doors / _med).toFixed(1) + '% of median)');
          } else grouped.push(st);
        });
        if (roofRun.length) {
          var roof = { name: roofRun[0].name, z: roofRun[0].z,
                       n: roofRun.reduce(function (a, x) { return a + x.n; }, 0), isRoofPass: true };
          if (roofRun.length > 1) {
            roof.absorbs = roofRun.slice(1).map(function (x) { return x.name; });
            roof.zTop = roofRun[roofRun.length - 1].z;
          }
          grouped.push(roof);
          console.log('§STOREY_REVEAL_ROOF_PASS bands=[' +
            roofRun.map(function (x) { return x.name + '(' + x.doors + ' doors,' + x.n + ' elements)'; }).join(',') +
            '] elements=' + roof.n + ' keptAsOneFinalPass name="' + roof.name +
            '" (§103.1 — the roof is the most visible band in the silhouette, so it gets its own' +
            ' pass instead of being absorbed downward)');
        }
        if (absorbed.length || roofRun.length) {
          console.log('§STOREY_REVEAL_GROUP medianDoors=' + _med + ' pseudoFrac=' + PSEUDO_FRAC +
            ' passes=' + _list.length + '->' + grouped.length +
            ' absorbedDownward=[' + (absorbed.join(',') || 'none') + ']' +
            ' roofPass=' + (roofRun.length ? roofRun.length + ' band(s) kept as the last pass' : 'none') +
            ' groups=[' + grouped.map(function (g) {
              return g.name + (g.absorbs ? '+{' + g.absorbs.join(',') + '}' : '');
            }).join(',') + '] (§103 — derived from element counts, not a name list)');
          _list = grouped;
        } else {
          console.log('§STOREY_REVEAL_GROUP medianDoors=' + _med + ' pseudoFrac=' + PSEUDO_FRAC +
            ' passes=' + _list.length + ' absorbed=none (every band is >= ' + (100 * PSEUDO_FRAC) +
            '% of the median — no pseudo storey in this building)');
        }
      }
    }
    _listKey = key;
    console.log('§STOREY_REVEAL_LIST n=' + _list.length +
      ' storeys=[' + _list.map(function (s) { return s.name; }).join(',') + ']' +
      (dropped.length ? ' dropped=[' + dropped.join(',') + ']' +
        ' (§60.1 — labelled on elements but NOT an IfcBuildingStorey in spatial_structure,' +
        ' so not a reveal slot)' : '') + note +
      (_list.length ? '' : ' — VACUOUS: no non-pseudo storey found, reveal will stay off'));
    return _list;
  };

  // §STOREY_REVEAL_STATS — real per-storey queries, cached per (building, storey name). Door count is
  // a COMPLETE census (elements_meta covers every element) so 0 is shown as a genuine fact; footprint
  // is a labeled bbox ESTIMATE (max IfcSlab bbox_x/bbox_y on that storey, same proxy + caveat
  // MEP_CLASH_REVEAL_MOVIE.md's §STOREY_HIGHLIGHT_REVEAL spec already names for the slab footprint);
  // room count comes from the injected/compiled spatial_structure rows (ROOM_INJECTOR_NEEDLE.md) and
  // is OMITTED from the card at 0 — a 0 there means "no room compiled for this storey", not "measured
  // zero rooms", the §VACUOUS distinction the spec addendum draws out explicitly.
  var _stats = {}, _statsKey = null;
  A.storeyRevealStatsFor = function (name) {
    var bkey = (A.activeBuilding || A.currentBuilding || 'bld');
    if (_statsKey !== bkey) { _stats = {}; _statsKey = bkey; }
    if (_stats[name]) return _stats[name];
    var doorCount = 0, bx = null, by = null, roomCount = 0;
    var d = A.dbQueryFirst("SELECT COUNT(*) FROM elements_meta WHERE ifc_class='IfcDoor' AND storey=?", [name]);
    if (d && d[0] != null) doorCount = +d[0];
    var f = A.dbQueryFirst(
      "SELECT MAX(et.bbox_x), MAX(et.bbox_y) FROM elements_meta em " +
      "JOIN element_transforms et ON em.guid=et.guid " +
      "WHERE em.ifc_class='IfcSlab' AND em.storey=?", [name]);
    if (f && f[0] != null && f[1] != null) { bx = +f[0]; by = +f[1]; }
    var r = A.dbQueryFirst(
      "SELECT COUNT(*) FROM spatial_structure sp " +
      "JOIN spatial_structure bs ON bs.guid=sp.parent_guid AND bs.type='IfcBuildingStorey' " +
      "WHERE sp.type='IfcSpace' AND bs.name=?", [name]);
    if (r && r[0] != null) roomCount = +r[0];
    // §37.1 (MEP_CLASH_REVEAL_MOVIE.md W6) — the walkable area, from the same storey_walkable_raster §29's hall uses:
    // mesh-derived, absent from the IFC, the figure a BIM audience leans in at. null when the storey has no raster.
    var walk = null;
    try {
      var FM = window.FlythruMaths, SR = window.StoreyRaster;
      if (FM && SR && typeof A.dbQuery === 'function') {
        var wr = A.dbQuery('SELECT storey,res,x0,y0,cols,rows,bits FROM storey_walkable_raster WHERE storey=?', [name]) || [];
        if (wr.length) walk = FM.ftRasterArea(SR.fromRow(wr[0]));
      }
    } catch (eW) { walk = null; }
    var out = { doorCount: doorCount, bx: bx, by: by, roomCount: roomCount, walk: walk };
    _stats[name] = out;
    console.log('§STOREY_REVEAL_STATS storey="' + name + '" doors=' + doorCount +
      ' walkable=' + (walk != null ? walk.toFixed(0) + 'm2 (storey_walkable_raster)' : 'n/a (no raster — clause omitted)') +
      ' footprint=' + (bx != null ? bx.toFixed(1) + 'x' + by.toFixed(1) + 'm(estimate,IfcSlab bbox)' : 'n/a') +
      ' rooms=' + roomCount + (roomCount === 0 ? ' (0 — VACUOUS, card omits the room clause)' : ' compiled'));
    return out;
  };

  // §STOREY_REVEAL_FIT — the storeys this plan actually has room to show, longest-readable-first.
  // DEGRADE, DON'T DISABLE: with no durationSec on the plan (an older cached plan) the window's real
  // seconds are unknowable, so the full list is used unchanged — the previous behaviour, never a
  // silent empty sequence. Logged once per (plan, list) so a truncation is never invisible.
  var _fitLogged = null, _slotSec = 0, _fitted = null, _slotBounds = null, _drawn = null, _drawnOrder = [];
  var _fitMemo = null, _fitMemoKey = null;   // §119 — the fit is per (list, window), not per frame
  function _fitList(plan, sr) {
    var full = A.storeyRevealList();
    if (!full.length) return full;
    var winSec = (plan && plan.durationSec > 0) ? sr.windowFrac * plan.durationSec : 0;
    if (!(winSec > 0)) return full;
    // §104 (user, 2026-09-13) set the 1.5s sweep as the target per storey; §128.8 (user, 2026-09-14)
    // then ruled that a window too short for it compresses the sweeps rather than dropping storeys, so
    // there is no slot count here any more — every storey is in the list, and the fit below scales.
    // §106 (user, 2026-09-13): "Floor slabs after the ground one goes along with its storey it's
    // supporting. 1. Ground floor slab. 2. 1st storey. 3. Floor slab together with its 2nd storey..."
    // A slab supports the storey ABOVE it, and §99.2 already bands from real slab bottoms, so every
    // slab from the 2nd up arrives with the storey it carries. The GROUND slab is the exception: it
    // supports Level 1 and has nothing below it, so it gets a pass of its own at the front and
    // Level 1's own pass then lays the storey onto a plate the eye has already read. One extra slot.
    // §119 — MEMOIZE. _fitList is called from storeyRevealVisualAt, i.e. EVERY FRAME, and everything
    // below it (the weights, _slotBounds, the clone of the list, §109's _drawn flags and the
    // §STOREY_REVEAL_SLOTS line) was being rebuilt each time: 1,460 duplicate log lines on one
    // 414-frame clip, and _drawn reset every frame so §109's "already drawn" flag could never fire.
    // The fit depends only on (list, window), so compute it once per key and hand back the same array.
    var _memoKey = full.length + '|' + winSec.toFixed(4) + '|' + (full[0] && full[0].name);
    if (_fitMemo && _fitMemoKey === _memoKey) return _fitMemo;
    var out = full;                                  // §128.8 — no storey is ever dropped; a short window compresses the sweeps
    out = [{ name: full[0].name, z: full[0].z, n: full[0].n, doors: full[0].doors, isGroundSlab: true }].concat(out);
    // §107 (user, 2026-09-13: "This gives more time slots to each storey not to rush, is needs > 2s
    // due to its qty") — the slots are no longer equal. A storey's sweep is scaled by HOW MUCH
    // ARRIVES in it, against the median storey, and floored at CUT_SWEEP_SEC so 1.5s stays the
    // minimum rather than the target. The ground-slab pass carries only its plate, so it takes the
    // floor. Weights come from the same element counts §103's grouping already reads — derived.
    var _cnt = out.map(function (e) { return e.isGroundSlab ? 0 : (e.n || 0); }).filter(function (x) { return x > 0; }).sort(function (a, b) { return a - b; });
    var _cMed = _cnt.length ? (_cnt.length % 2 ? _cnt[(_cnt.length - 1) / 2] : (_cnt[_cnt.length / 2 - 1] + _cnt[_cnt.length / 2]) / 2) : 0;
    // §110 (user, 2026-09-13: "Make each slab+storey reveal to enjoy as much slot time as it helps
    // in cinematic effect") — the base sweep is no longer pinned at the 1.5s FLOOR. It is SOLVED from
    // the window the film can afford: take the pauses off the top, divide what is left by the sum of
    // the quantity weights, and let every slot breathe at that rate. Clamped to [CUT_SWEEP_SEC,
    // CUT_SWEEP_MAX] so 1.5s stays the guaranteed minimum (§104) and no single storey can sit long
    // enough to stall the beat.
    out.forEach(function (e) { e.qtyRatio = (_cMed > 0 && !e.isGroundSlab) ? (e.n || 0) / _cMed : 1; });
    // §120 — CLAMP PER SLOT, THEN SOLVE. The first version clamped the BASE to
    // [CUT_SWEEP_SEC, CUT_SWEEP_MAX] and multiplied each slot by its weight afterwards, so a heavy
    // storey got base x ratio and escaped the ceiling entirely, while the rescale that made the sum
    // fit pushed the light ones under §104's mandatory floor. Hospital and HHS both sit near ratio
    // 1.0 and never showed it; Terminal measured sweeps of 5.83s (ceiling 3.0) and 1.37s (floor 1.5)
    // in the same window. Every slot is now clamped INDIVIDUALLY, and the base is solved so the
    // clamped total fits — bisection, because the clamps make the total a non-linear function of the
    // base. The floor is never traded away: if even an all-floor fit is too long the slot count is
    // what gives (the §104 rule), not the speed.
    var _forPauses = out.length * CUT_PAUSE_SEC;
    function _totalAt(base) {
      var t = 0;
      for (var i = 0; i < out.length; i++) {
        t += Math.max(CUT_SWEEP_SEC, Math.min(CUT_SWEEP_MAX, base * out[i].qtyRatio));
      }
      return t + _forPauses;
    }
    var _base;
    if (_totalAt(CUT_SWEEP_MAX) <= winSec) _base = CUT_SWEEP_MAX;      // everything can breathe
    else if (_totalAt(CUT_SWEEP_SEC) >= winSec) _base = CUT_SWEEP_SEC; // already at the floor
    else {
      var _lo = CUT_SWEEP_SEC, _hi = CUT_SWEEP_MAX;
      for (var _it = 0; _it < 40; _it++) {
        var _mid = (_lo + _hi) / 2;
        if (_totalAt(_mid) > winSec) _hi = _mid; else _lo = _mid;
      }
      _base = _lo;
    }
    out.forEach(function (e) {
      e.sweepSec = Math.max(CUT_SWEEP_SEC, Math.min(CUT_SWEEP_MAX, _base * e.qtyRatio));
      e.slotSec = e.sweepSec + CUT_PAUSE_SEC;
    });
    var _wantSec = out.reduce(function (a, e) { return a + e.slotSec; }, 0);
    // The plan's window is what it is; if it came back short of what the weights want, everything
    // scales down together and the 1.5s floor is reported as missed rather than silently broken.
    // §120 — the residual scale only ever SHRINKS, and only when the floor fit is still too long for
    // the window the plan handed back. It is reported, never silent.
    var _scale = _wantSec > 0 ? Math.min(1, winSec / _wantSec) : 1;
    // §128.8 (user, 2026-09-14): a short runway speeds up the SWEEPS; the pause that signals each
    // storey keeps its full length for as long as the window can hold the pauses alone. Only when it
    // cannot does everything scale together. Never a dropped storey.
    var _pauseAll = out.length * CUT_PAUSE_SEC;
    var _sweepAll = out.reduce(function (a, e) { return a + e.sweepSec; }, 0);
    var _sweepScale = 1, _pauseScale = 1;
    if (_scale < 1) {
      if (winSec > _pauseAll && _sweepAll > 0) _sweepScale = Math.min(1, (winSec - _pauseAll) / _sweepAll);
      else { _sweepScale = _scale; _pauseScale = _scale; }
    }
    _slotBounds = []; var _acc = 0;
    out.forEach(function (e) {
      e.sweepSec = e.sweepSec * _sweepScale;
      e.slotSec = e.sweepSec + CUT_PAUSE_SEC * _pauseScale;
      _acc += e.slotSec; _slotBounds.push(_acc / winSec);
    });
    _slotBounds[_slotBounds.length - 1] = 1;
    // §109 (user, 2026-09-13: "Use good array flags to mark once drawn") — one flag per slot, set the
    // first time that slot is entered. A slot that is entered a SECOND time after another slot has
    // run in between is a real defect (a storey rebuilt, the thing §97.4 was fixed for once already),
    // so it is logged loudly rather than absorbed. Reset whenever the fit is recomputed.
    _drawn = out.map(function () { return false; });
    _drawnOrder = [];
    console.log('§STOREY_REVEAL_SLOTS medianCount=' + _cMed + ' wantSec=' + _wantSec.toFixed(2) +
      ' windowSec=' + winSec.toFixed(2) + ' scale=' + _scale.toFixed(3) + ' sweepScale=' + _sweepScale.toFixed(3) + ' pauseScale=' + _pauseScale.toFixed(3) +
      (_scale < 0.999 ? ' SHORT — the window could not hold the weighted slots, every sweep is below its target'
                      : ' (weights fit)') +
      ' baseSweepSec=' + _base.toFixed(2) + '(floor ' + CUT_SWEEP_SEC + ', ceiling ' + CUT_SWEEP_MAX +
      ', solved by bisection §120)' +
      ' sweepRange=' + Math.min.apply(null, out.map(function (e) { return e.sweepSec; })).toFixed(2) +
      '..' + Math.max.apply(null, out.map(function (e) { return e.sweepSec; })).toFixed(2) +
      ' slots=[' + out.map(function (e) {
        return e.name + (e.isGroundSlab ? '(slab)' : '') + ':' + e.n + 'el x' + e.qtyRatio.toFixed(2) +
               '=' + e.sweepSec.toFixed(2) + 's+' + (e.slotSec - e.sweepSec).toFixed(2) + 's';
      }).join(' ') + '] (§107 — sweep scales with what arrives in the slot, floor ' + CUT_SWEEP_SEC + 's)');
    // The sweep is then pinned to CUT_SWEEP_SEC in wall-clock (storeyRevealCutAt reads this), so a
    // window that divides to MORE than 2.0s per slot spends the surplus on the PAUSE, never on a
    // slower sweep. 1.5s is a floor and a target, not a ratio.
    _slotSec = winSec / out.length;
    var key = full.length + '/' + out.length + '/' + winSec.toFixed(2);
    _fitted = out; _fitMemo = out; _fitMemoKey = _memoKey;
    if (_fitLogged !== key) {
      _fitLogged = key;
      console.log('§STOREY_REVEAL_FIT windowSec=' + winSec.toFixed(2) + ' minSlotSec=' + MIN_SLOT_SEC +
        ' storeysAvailable=' + full.length + ' shown=' + out.length +
        ' slotSec=' + (winSec / out.length).toFixed(2) +
        ' sweepSec=' + Math.min(CUT_SWEEP_SEC, winSec / out.length).toFixed(2) +
        ' pauseSec=' + Math.max(0, (winSec / out.length) - CUT_SWEEP_SEC).toFixed(2) + ' (§104)' +
        (out.length < full.length
          ? ' TRUNCATED dropped=[' + full.slice(out.length).map(function (x) { return x.name; }).join(',') +
            '] (top floors foregone — window is fixed, best effort)'
          : ' (all storeys fit)'));
    }
    return out;
  }

  // §STOREY_REVEAL_VISUAL — pure function of (plan, tNorm). CORRECTED WINDOW (user, 2026-09-06,
  // relayed mid-session): NOT the orbit beat (beats.rise..1) — the LAST `plan.storeyReveal.windowFrac`
  // of the PRECEDING `pullback` beat, ending exactly at beats.rise (orbit start). `windowFrac` is
  // precomputed at plan-build time (effects.js §STOREY_REVEAL_WINDOW, from the real `pullback`
  // seconds measured off §CINEMA_PACING) so this function never needs the film's total seconds.
  // Null everywhere outside that narrow window or when the flag/list is absent — DEGRADE, DON'T
  // DISABLE: an older cached plan with no `storeyReveal` field simply never enters this branch, same
  // contract §CPE_GHOST_GROUND/§CPE_DISCIPLINE_REVEAL already hold themselves to.
  // §128.10 — the Time Machine is a visibility OWNER during a buildup film: an element whose op has
  // not ended at the cursor, or that has no op at all, is legitimately hidden by it. Both witnesses
  // consult this so a row the owner holds is counted as held, never as a defect.
  function _tmHeld() {
    try {
      if (typeof window.tmGetState !== 'function' || typeof window.tmGuidEndTs !== 'function') return null;
      var st = window.tmGetState(); if (!st || !st.active) return null;
      var end = window.tmGuidEndTs(); var cur = st.cursor;
      return function (guid) { if (guid == null) return false; var e = end[String(guid)]; return (e == null) || !(e <= cur); };
    } catch (eT) { return null; }
  }
  var _paradeWaitLogged = false, _paradeWaitFrames = 0;   // first firing is logged; every firing is counted (§STOREY_CUT_CLEAR paradeWaitFrames=)
  A.storeyRevealVisualAt = function (plan, tNorm) {
    var b = plan && plan.beats, sr = plan && plan.storeyReveal;
    if (!plan || !sr || !sr.on || !(sr.windowFrac > 0) || !b || !(b.rise > 0) || !(b.rise < 1)) return null;
    var winStart = b.rise - sr.windowFrac;
    if (tNorm == null || tNorm <= winStart || tNorm > b.rise) return null;
    // §128.8 — the reveal does not open while the discipline parade still holds the scene. The plan
    // lays the window after the parade's tail (effects.js §STOREY_REVEAL_RUNWAY); this is the leg's
    // own guard for the boundary frame and for any future plan that overlaps them again. Logged
    // once if it ever fires. `window.__srIgnoreRunway` bypasses it for the falsifiability control.
    if (!window.__srIgnoreRunway && typeof A.cpeRevealVisualAt === 'function') {
      var _par = null; try { _par = A.cpeRevealVisualAt(plan, tNorm); } catch (eP) { _par = null; }
      if (_par) {
        _paradeWaitFrames++;
        if (!_paradeWaitLogged) { _paradeWaitLogged = true; console.log('§STOREY_REVEAL_WAIT_PARADE tNorm=' + tNorm.toFixed(4) + ' winStart=' + winStart.toFixed(4) + ' paradePhase=' + _par.phase + ' — the window opened while the discipline parade was still applied; the reveal waits for its restore'); }
        return null;
      }
    }
    var list = _fitList(plan, sr);
    if (!list.length) return null;
    var span = sr.windowFrac;
    var w = Math.min(0.999999, Math.max(0, (tNorm - winStart) / span));   // 0..1 across the whole window
    // §107 — slots are WEIGHTED, so the boundaries come from _slotBounds (cumulative fractions of
    // the window) rather than from an equal division. Falls back to equal slots if the weights
    // could not be computed, which is the pre-§107 behaviour exactly.
    var idx, u;
    if (_slotBounds && _slotBounds.length === list.length) {
      idx = 0;
      while (idx < _slotBounds.length - 1 && w >= _slotBounds[idx]) idx++;
      var lo0 = idx > 0 ? _slotBounds[idx - 1] : 0, hi0 = _slotBounds[idx];
      u = (hi0 > lo0) ? (w - lo0) / (hi0 - lo0) : 0;
      u = Math.max(0, Math.min(0.999999, u));
    } else {
      var slot = 1 / list.length;
      idx = Math.min(list.length - 1, Math.floor(w / slot));
      u = (w - idx * slot) / slot;                                     // 0..1 within this storey's slot
    }
    var opacity = Math.max(0, Math.min(1, Math.min(u, 1 - u) / FADE_FRAC));
    // §STOREY_REVEAL_PULSE (2026-09-06, user: "it should be shine thru and then cease, not persist")
    // — each storey OWNS its slot but only GLOWS for the first LIT_FRAC of it; the tail of the slot is
    // dark, so the sequence reads as a series of separate pulses instead of one colour handing
    // straight over to the next with the building never returning to rest. The card/caption keep
    // running through the dark part (the stats are what the beat is for), only the 3D tint ceases.
    // §STOREY_REVEAL_LAST_STAYS_LIT (2026-09-10, user: "at the end of highlight it seems to color
    // dark over whole building or parts. IT should not, or retain its coloring to original.") — the
    // §STOREY_REVEAL_PULSE cease-per-slot above is right for storey N handing over to storey N+1 (a
    // dark beat reads as a beat, not a fault), but the LAST storey has no next colour to hand over to
    // — its own dark tail was the whole building sitting in the x-ray wash with nothing lit, right
    // before the hard cut to orbit. The final storey simply never enters its dark phase, so the glow
    // (and the x-ray shine-through it needs) carries straight through to the window's end.
    var isLast = idx === list.length - 1;
    return { idx: idx, n: list.length, storey: list[idx].name,
             color: COLORS[idx % COLORS.length], emoji: EMOJI[idx % EMOJI.length],
             u: u, opacity: opacity, dark: (!isLast && u > LIT_FRAC) };
  };

  // §STOREY_REVEAL_CAPTION — replaces the room-title/disc-parade caption for exactly this window;
  // returns null everywhere else so the normal room-title lookup (or the disc-parade override, which
  // by construction never overlaps this window — it lives entirely inside b.reveal..b.rise) runs
  // untouched. Drawn through the SAME A.roomTitleCompositeOntoCanvas the bake/preview already use —
  // no new text-rendering code (cpe_room_title.js header's own rule: one draw routine, WYSIWYG).
  var _lastLoggedIdx = null;
  A.storeyRevealCaptionAt = function (plan, tNorm) {
    var vis = A.storeyRevealVisualAt(plan, tNorm);
    if (!vis) { _lastLoggedIdx = null; return null; }
    if (_lastLoggedIdx !== vis.idx) {
      _lastLoggedIdx = vis.idx;
      console.log('§STOREY_REVEAL_TIMING storey=' + vis.storey.replace(/\s+/g, '_') +
        ' idx=' + vis.idx + '/' + vis.n + ' tNorm=' + tNorm.toFixed(4) +
        ' color=#' + vis.color.toString(16).padStart(6, '0'));
    }
    // §108 — the ground-slab pass is a slot on Level 1 but is NOT Level 1 arriving, so it must not
    // print the same caption the next slot prints, or the beat reads as a storey drawn twice.
    var entC = _fitted && _fitted[vis.idx];
    var capName = (entC && entC.isGroundSlab) ? 'Ground slab' : vis.storey;
    return { name: vis.emoji + ' ' + capName, opacity: vis.opacity };
  };

  // §STOREY_REVEAL_STATCARD — shaped exactly like cpe_resource_panel.js's `shown` (the `A.tailPanelAt`
  // return value), so it composites through the SAME A.bigStatsCompositeOntoCanvas the highlight-cards
  // rotation already uses — including that function's own progress dots, which double for free as
  // "storey N of M" here. Replaces the normal highlight-card rotation for this window only (the
  // caller nulls the normal statInfo/resInfo when this returns non-null — see cinema_maxq.js).
  A.storeyRevealStatCardAt = function (plan, tNorm) {
    var vis = A.storeyRevealVisualAt(plan, tNorm);
    if (!vis) return null;
    var st = A.storeyRevealStatsFor(vis.storey);
    var subParts = [];
    if (st.walk != null && st.walk > 0) subParts.push('walkable ' + Math.round(st.walk).toLocaleString('en-US') + ' m²');   // §37.1 — first, it is the figure the IFC lacks
    if (st.bx != null) subParts.push(st.bx.toFixed(1) + '×' + st.by.toFixed(1) + ' m footprint (estimate)');
    if (st.roomCount > 0) subParts.push(st.roomCount + ' room' + (st.roomCount === 1 ? '' : 's') + ' compiled');
    var entS = _fitted && _fitted[vis.idx];
    // §STOREY_CARD_INK (2026-09-21, red1: "make the storey by storey reveal HUD box same coloring to
    // fall on the 'Level 1' rather, or swap places with number of rooms, which is not the highlight
    // but the storey value") — the STOREY takes `big` and the door count drops to `label`. `big` is
    // the only string `ink` colours (cpe_resource_panel.js's plain-card branch sets the fill for it
    // alone; the label below is a hard-coded white), so the swap is what puts the tint on the storey
    // AND what makes the storey the emphatic slot — one change answering both halves of his sentence,
    // with no new drawing path in a compositor four other cards share.
    var card = (entS && entS.isGroundSlab)
      ? { big: 'Ground slab',
          label: (st.bx != null ? st.bx.toFixed(0) + '×' + st.by.toFixed(0) + ' m footprint'
                                : st.doorCount + ' door' + (st.doorCount === 1 ? '' : 's')) }
      : { big: vis.storey, label: st.doorCount + ' door' + (st.doorCount === 1 ? '' : 's') };
    if (subParts.length) card.sub = subParts.join(' · ');
    // ══ THE CARD WEARS THE STOREY'S OWN COLOUR ═══════════════════════════════════════════════
    // red1, 2026-09-20: "it be good if the HUD storey info is same color as the tint."
    // `vis.color` is the SAME value _applyTint is handed for this slot, read from the same visual
    // record — not a parallel table keyed off the storey name, which could drift from the building
    // the moment COLORS or the slot order changes. `ink` is bigStatsCompositeOntoCanvas's existing
    // §59 category-ink hook, so this is a value on a card, not a new drawing path.
    card.ink = '#' + vis.color.toString(16).padStart(6, '0');
    return { card: card, idx: vis.idx, n: vis.n, opacity: vis.opacity };
  };

  // ══ 3D "lights up" tint — the actual per-storey glow. Mirrors hba_lens.js's proven MeshPort
  // pattern verbatim (setColorAt/getColorAt for Instanced/BatchedMesh diffuse, emissive save/restore
  // for regular meshes, a touched[] list for exact restore) rather than inventing a second tint
  // mechanism — see MEP_CLASH_REVEAL_MOVIE.md's addendum for why this was chosen over a fork of
  // A.filterStorey's hide/show (isolating would hide the "shine THROUGH the whole building" read the
  // spec asks for; a tint keeps the whole building visible while one storey glows the cycle color).
  var _C = (typeof THREE !== 'undefined' && THREE.Color) ? new THREE.Color() : null;
  var _touched = [], _curIdx = null, _clones = [];
  var _lastTn = null;   // §STOREY_REVEAL_TINT_RESTORE — the film fraction the last applyVisual call carried, so the restore line can say WHEN

  // §FACADE_ONLY_TINT (2026-09-10, user: "Yes. My original request prior" — confirming: tint just
  // the storey's FACADE, no x-ray, no dimming, no see-through of the rest of the building). An
  // orbiting exterior camera already sees a storey's exterior wall directly — nothing needs to
  // become transparent for that. NON-INVENT: facade membership is a live geometric test (does the
  // wall's own bbox touch the building's own overall footprint boundary), not a guessed IFC flag —
  // this DB has no IsExternal property to read (checked: 0 hits for IsExternal/is_external in the
  // whole viewer). Reuses the SAME structural-class set flythruDatumBuild's own footprint query uses,
  // so the "outer edge" this measures against is the one already accepted as this building's extent.
  var _facadeGuids = {}, _facadeKey = null;
  // §FACADE_RASTER_BOUNDARY (2026-09-11, user: "still not highlighting much to be seen" — §55.6/
  // §56.2/§57.2, reinforced three times) — MEASURED DEFECT #3 with the AABB-edge method below: even
  // after §FACADE_PER_STOREY_FIX and §FACADE_WALL_ONLY_FOOTPRINT, it only ever catches walls sitting
  // flush with the storey's own bounding RECTANGLE's four flat sides — on Hospital's real (tapering,
  // non-rectangular) footprint this measured 1.8-8.4% of a main floor's own wall AREA (Level 1: 3
  // walls / 260 m² of 14,328 m²) — a bounding box is a poor proxy for an irregular perimeter.
  // FIX: reuse `storey_walkable_raster` (§29's own hall raster, already built and shipped — EXTRACT,
  // don't invent a second geometry pass) to find the TRUE walkable/outside boundary. Flood-fill the
  // raster's NON-walkable cells starting from the grid's own border (standard "outside vs enclosed
  // hole" technique) to separate genuine exterior void from interior voids (shafts, wall cores) —
  // then a wall is facade if a small neighbourhood (±FACADE_RASTER_MARGIN cells) around its centre
  // touches BOTH a walkable cell and an "outside" cell, i.e. it sits exactly on that boundary.
  // MEASURED (Hospital, offline replay of this exact algorithm before shipping it): Level 1
  // 3->27 walls / 260->2,673 m² (1.8%->18.7%), Level 3 10->23 walls (8.4%->7.7% area, same order —
  // MORE of the true perimeter, spread across more, smaller real segments). Level 7 (a tiny
  // penthouse) REGRESSED on its own (78.3%->19.7%) — its raster reads ~60% "walkable" over a grid
  // far larger than the room itself, a data quirk in that one storey's raster, not a bug in this
  // algorithm — so the two methods are UNIONED, never one replacing the other: this can only ADD
  // real coverage the AABB method misses, and can never lose coverage the AABB method already had,
  // regardless of a given storey's raster quality. DEGRADE, DON'T DISABLE: no raster for a storey
  // (or no window.StoreyRaster loaded) falls back to the AABB method alone, byte-identical to before.
  var FACADE_RASTER_MARGIN = 2;   // cells either side of a wall's centre (~0.5m at the shipped 0.25m res)
  function _facadeAabbEdgeGuids(storeyName) {
    var set = {};
    var TOL = 0.5;   // metres — construction tolerance only, now that the footprint is wall-derived
    var rows = A.dbQuery(
      "WITH footprint AS (" +
      "  SELECT MIN(t.center_x-t.bbox_x/2) minX, MAX(t.center_x+t.bbox_x/2) maxX," +
      "         MIN(t.center_y-t.bbox_y/2) minY, MAX(t.center_y+t.bbox_y/2) maxY" +
      "  FROM element_transforms t JOIN elements_meta m ON m.guid=t.guid" +
      "  WHERE m.storey=? AND m.ifc_class IN ('IfcWall','IfcWallStandardCase','IfcCurtainWall')" +
      ")" +
      "SELECT m.guid FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid, footprint f " +
      "WHERE m.storey=? AND m.ifc_class IN ('IfcWall','IfcWallStandardCase','IfcCurtainWall') AND (" +
      "  ABS((t.center_x-t.bbox_x/2)-f.minX) < ? OR ABS((t.center_x+t.bbox_x/2)-f.maxX) < ? OR" +
      "  ABS((t.center_y-t.bbox_y/2)-f.minY) < ? OR ABS((t.center_y+t.bbox_y/2)-f.maxY) < ?" +
      ")", [storeyName, storeyName, TOL, TOL, TOL, TOL]) || [];
    rows.forEach(function (r) { set[r[0]] = true; });
    return set;
  }
  function _outsideMaskFor(raster) {
    var SR = window.StoreyRaster, cols = raster.cols, rows = raster.rows;
    var outside = new Uint8Array(cols * rows), q = [];
    function tryPush(c, r) {
      if (c < 0 || r < 0 || c >= cols || r >= rows) return;
      var idx = r * cols + c;
      if (outside[idx] || SR.getBit(raster.bits, cols, c, r)) return;   // walkable — not "outside"
      outside[idx] = 1; q.push([c, r]);
    }
    for (var c = 0; c < cols; c++) { tryPush(c, 0); tryPush(c, rows - 1); }
    for (var r = 0; r < rows; r++) { tryPush(0, r); tryPush(cols - 1, r); }
    var head = 0;
    while (head < q.length) { var p = q[head++]; tryPush(p[0] + 1, p[1]); tryPush(p[0] - 1, p[1]); tryPush(p[0], p[1] + 1); tryPush(p[0], p[1] - 1); }
    return outside;
  }
  function _facadeRasterGuids(storeyName, raster) {
    var SR = window.StoreyRaster, set = {};
    var outside = _outsideMaskFor(raster);
    var walls = A.dbQuery(
      "SELECT m.guid, t.center_x, t.center_y FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid " +
      "WHERE m.storey=? AND m.ifc_class IN ('IfcWall','IfcWallStandardCase','IfcCurtainWall')", [storeyName]) || [];
    walls.forEach(function (w) {
      var guid = w[0], cx = +w[1], cy = +w[2];
      var cc = Math.floor((cx - raster.x0) / raster.res), rr = Math.floor((cy - raster.y0) / raster.res);
      var hasWalkable = false, hasOutside = false;
      for (var dr = -FACADE_RASTER_MARGIN; dr <= FACADE_RASTER_MARGIN && !(hasWalkable && hasOutside); dr++) {
        for (var dc = -FACADE_RASTER_MARGIN; dc <= FACADE_RASTER_MARGIN && !(hasWalkable && hasOutside); dc++) {
          var c = cc + dc, r = rr + dr;
          if (c < 0 || r < 0 || c >= raster.cols || r >= raster.rows) { hasOutside = true; continue; }
          if (SR.getBit(raster.bits, raster.cols, c, r)) hasWalkable = true;
          else if (outside[r * raster.cols + c]) hasOutside = true;
        }
      }
      if (hasWalkable && hasOutside) set[guid] = true;
    });
    return set;
  }
  function _facadeGuidsFor(storeyName) {
    var bkey = (A.activeBuilding || A.currentBuilding || 'bld');
    if (_facadeKey !== bkey) { _facadeGuids = {}; _facadeKey = bkey; }
    if (_facadeGuids[storeyName]) return _facadeGuids[storeyName];
    var set = {}, aabbN = 0, rasterN = 0, method = 'aabb-only';
    try {
      var aabbSet = _facadeAabbEdgeGuids(storeyName);
      aabbN = Object.keys(aabbSet).length;
      Object.keys(aabbSet).forEach(function (g) { set[g] = true; });
      var SR = window.StoreyRaster;
      if (SR && typeof SR.getBit === 'function') {
        var wr = A.dbQuery('SELECT storey,res,x0,y0,cols,rows,bits FROM storey_walkable_raster WHERE storey=?', [storeyName]) || [];
        if (wr.length) {
          var rasterSet = _facadeRasterGuids(storeyName, SR.fromRow(wr[0]));
          rasterN = Object.keys(rasterSet).length;
          Object.keys(rasterSet).forEach(function (g) { set[g] = true; });
          method = 'aabb-union-raster';
        }
      }
    } catch (e) { console.log('§FACADE_ONLY_TINT query failed for storey="' + storeyName + '": ' + e.message); }
    var n = Object.keys(set).length;
    console.log('§FACADE_ONLY_TINT storey="' + storeyName + '" method=' + method + ' facadeWalls=' + n +
      ' (aabb=' + aabbN + ' raster=' + rasterN + ')' +
      (n === 0 ? ' — VACUOUS: no wall on this storey touches the building footprint edge, nothing will tint' : ''));
    _facadeGuids[storeyName] = set;
    return set;
  }
  function _restoreTint() {
    // ══ §STOREY_REVEAL_TINT_RESTORE (2026-09-20) — SAY THAT THE TINT CAME OFF ════════════════
    // §130 could not tell whether the yellow-olive wash on the building during the escape beat was
    // the last storey deliberately staying lit or a restore that never ran, because NOTHING in the
    // bake said the tint had come off. Reading the code said this path runs; a log line is what
    // proves it FIRED. Counted by kind, because the three branches fail independently: a regular
    // mesh gets its original material object back, an instanced and a batched entry get their
    // colour written back, and only the regular branch has clones to dispose.
    var _nMesh = 0, _nInst = 0, _nBatch = 0;
    _touched.forEach(function (s) {
      if (s.inst != null && s.m.instanceColor && _C) { s.m.setColorAt(s.inst, _C.setHex(s.c)); s.m.instanceColor.needsUpdate = true; _nInst++; }
      else if (s.batch != null && s.m.setColorAt && _C) { try { s.m.setColorAt(s.batch, _C.setHex(s.c)); _nBatch++; } catch (e) {} }
      else if (s.mat) { s.m.material = s.mat; _nMesh++; }   // regular mesh: put the ORIGINAL material object back
    });
    var _nWas = _touched.length, _nClones = _clones.length;
    _touched = [];
    _clones.forEach(function (c) { try { c.dispose(); } catch (e) {} });
    _clones = [];
    if (_nWas > 0 || _lastTn != null) {
      console.log('§STOREY_REVEAL_TINT_RESTORE tNorm=' + (_lastTn == null ? 'n/a' : _lastTn.toFixed(4)) +
        ' touched=' + _nWas + ' restored=' + (_nMesh + _nInst + _nBatch) +
        ' (mesh=' + _nMesh + ' instanced=' + _nInst + ' batched=' + _nBatch + ')' +
        ' clonesDisposed=' + _nClones +
        (_nWas === 0 ? ' — nothing was tinted at this call' :
         (_nMesh + _nInst + _nBatch) < _nWas ? ' ⚠ FEWER RESTORED THAN TOUCHED — that difference is still wearing the tint' : ''));
    }
  }
  // Published for §GLOW_CENSUS, which asks every sample how many meshes are still wearing the tint.
  // Read-only, same test-seam convention as storeyRevealTintFor/storeyRevealTintRestore below.
  A.storeyRevealTintTouched = function () { return _touched.length; };
  function _applyTint(storeyName, hex) {
    if (!_C) return 0;   // node-without-THREE (witness harness) — visual is inert, pacing still testable
    var n = 0;
    // Regular meshes — EXACT same predicate panels.js's A.filterStorey uses (§NAV_FIND_002), so this
    // can never pick up an Instanced/BatchedMesh container by accident (those do not carry a single
    // userData.storey — their per-instance storey lives in A._instanceMeta/_batchMeta instead).
    // §STOREY_REVEAL_TINT_SHARED_MATERIAL (2026-09-06 — the bug the user saw: "not marking by storey
    // but whole building"). Materials in this viewer are SHARED and cached (A._matCache; A.toggleXray
    // walks that same cache), so writing `o.material.emissive` for one storey's meshes repainted every
    // OTHER mesh using the same material — the whole building. It also made the restore a no-op: the
    // second mesh sharing a material saved the ALREADY-TINTED value as its "original", so the last
    // write on restore put the tint back and the colour persisted.
    // Fix: give the storey its OWN material. Cloned ONCE PER DISTINCT MATERIAL (not per mesh — that
    // would be thousands of clones), assigned to just this storey's meshes, disposed on restore, and
    // the original material object put straight back. Per-object, exactly like the partition
    // A.filterStorey uses (obj.visible / filterInstancedMesh / filterBatchedMesh, panels.js:711) —
    // which never had this problem precisely because visibility is per-object and emissive is not.
    // opacity=1 on the clone keeps the lit facade SOLID and fully opaque — §FACADE_ONLY_TINT means
    // the rest of the building needs no special treatment at all (no x-ray, no dim); it is simply
    // left alone, already visible or occluded exactly like any other geometry in the film.
    var facadeGuids = _facadeGuidsFor(storeyName);
    // §129.59 — `inScope` replaces the bare `facadeGuids[guid]` gate in all three branches below.
    // Under the new default every mesh ON THIS STOREY qualifies; 'facade' reproduces §93.4 exactly.
    var _facadeOnly = (STOREY_REVEAL_TINT_SCOPE === 'facade');
    var inScope = function (guid) { return _facadeOnly ? !!facadeGuids[guid] : true; };
    var _facadeN = 0;   // counted alongside, so one log line states how much wider the new scope is
    // ══ §STOREY_REVEAL_TINT_SKIPS (2026-09-20) — COUNT WHAT THIS DOES NOT PAINT ═════════════════
    // red1: the beat "keeps missing some parts of the facade or whole level see thru".
    // Every `return` below drops a mesh or a whole instanced bucket, and until now NONE of them was
    // counted: the line at the foot reported meshesTouched and called FAIL only at zero, so a storey
    // that painted 8,810 meshes and silently dropped 3,000 printed exactly like a complete one.
    // That is §129.53's rule biting — a green line covering an unmeasured area.
    // WHY IT READS AS SEE-THROUGH, not just as missing: the clone below sets transparent=false and
    // opacity=1, so a mesh that IS tinted goes solid. A mesh skipped here keeps its original
    // material, and if that is glazing it stays transparent. On a level whose facade is mostly glass
    // or multi-material, the painted parts go solid and the skipped parts stay see-through, and the
    // level reads as half-there.
    // COUNTING ONLY. Nothing here changes what is painted — the skip conditions are untouched, so
    // this bake is comparable with every bake before it.
    var _skipNoMat = 0, _skipArrayMat = 0, _skipNoEmissive = 0, _skipNoClone = 0;
    var _skipNoInstMeta = 0, _skipNoBatchMeta = 0, _skipNoSetColor = 0;
    var _matMap = (typeof Map !== 'undefined') ? new Map() : null;
    A.collectMeshes(function (o) { return o.isMesh && o.userData.storey === storeyName && inScope(o.userData.guid); }).forEach(function (o) {
      if (facadeGuids[o.userData.guid]) _facadeN++;
      if (!o.material) { _skipNoMat++; return; }
      if (Array.isArray(o.material)) { _skipArrayMat++; return; }
      if (!o.material.emissive) { _skipNoEmissive++; return; }
      if (!o.material.clone) { _skipNoClone++; return; }
      var orig = o.material, cl = _matMap ? _matMap.get(orig) : null;
      if (!cl) {
        cl = orig.clone();
        // ══ BOTH CHANNELS, OR THE STOREY IS PAINTED TWO DIFFERENT WAYS AT ONCE ═══════════════
        // red1, 2026-09-20 on the clip: "It is not lighting thruout."
        // ROOT CAUSE, and it is not scope — §129.59's scope fix works, §TINT_SCOPE 18/18 and
        // meshesTouched 1,551-11,737 per storey prove the geometry is reached. It is CHANNEL:
        // this branch wrote `emissive` only, while the instanced and batched branches below write
        // DIFFUSE via setColorAt. So within one storey the instanced and batched parts went fully
        // coloured and the regular meshes kept their original grey diffuse with a faint emissive
        // add on top — patchiness BY MESH TYPE, which is exactly what "not throughout" looks like.
        // Worse, `emissive.setHex` does not touch emissiveIntensity, so any source material sitting
        // at 0 showed NOTHING from the tint at all.
        // The in-project precedent is cpe_load_path.js:507-508, whose own comment calls the result
        // "solid rainbow with a slight emissive lift" — colour AND emissive AND the lift. Extracted
        // here rather than invented.
        // ⚠ This is also why main's version LOOKED better without being better: main runs with
        // x-ray ON, so the emissive-only interior read as a glowing volume through the envelope.
        // With x-ray off (red1's call, not reopened) you only ever see the outer surface, and on a
        // regular mesh that surface was diffuse-unchanged.
        if (cl.color) cl.color.setHex(hex);
        cl.emissive.setHex(hex);
        cl.emissiveIntensity = TINT_EMISSIVE_LIFT;
        cl.transparent = false; cl.opacity = 1;
        if (_matMap) _matMap.set(orig, cl);
        _clones.push(cl);
      }
      _touched.push({ m: o, mat: orig });
      o.material = cl; n++;
    });
    A.collectMeshes(function (o) { return o.isInstancedMesh; }).forEach(function (mesh) {
      var meta = A._instanceMeta && A._instanceMeta[mesh.id];
      if (!meta) { _skipNoInstMeta++; return; }          // a whole bucket, silently, until now
      if (!mesh.setColorAt) { _skipNoSetColor++; return; }
      var any = false;
      for (var i = 0; i < meta.length; i++) {
        if (meta[i].storey !== storeyName || !inScope(meta[i].guid)) continue;
        if (facadeGuids[meta[i].guid]) _facadeN++;
        var had = !!mesh.instanceColor, prev = 0xffffff;
        if (had) { mesh.getColorAt(i, _C); prev = _C.getHex(); }
        _touched.push({ m: mesh, inst: i, c: prev });
        mesh.setColorAt(i, _C.setHex(hex)); n++; any = true;
      }
      if (any && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
    A.collectMeshes(function (o) { return o.isBatchedMesh; }).forEach(function (mesh) {
      var meta = A._batchMeta && A._batchMeta[mesh.id];
      if (!meta) { _skipNoBatchMeta++; return; }         // likewise
      if (!mesh.setColorAt) { _skipNoSetColor++; return; }
      for (var i = 0; i < meta.length; i++) {
        if (meta[i].storey !== storeyName || !inScope(meta[i].guid)) continue;
        if (facadeGuids[meta[i].guid]) _facadeN++;
        var pb = 0xffffff;
        try { mesh.getColorAt(meta[i].slotId, _C); pb = _C.getHex(); } catch (e) {}
        _touched.push({ m: mesh, batch: meta[i].slotId, c: pb });
        try { mesh.setColorAt(meta[i].slotId, _C.setHex(hex)); n++; } catch (e2) {}
      }
    });
    // §129.59 — `scope` and `facadeMeshes` beside the existing count, so ONE bake line says directly
    // how much wider this is than the 2-51 facade set §93.4 measured as unreadable. meshesTouched=0
    // on a storey is the FAIL signal, not a quiet non-event.
    var _skipMesh = _skipNoMat + _skipArrayMat + _skipNoEmissive + _skipNoClone;
    var _skipBucket = _skipNoInstMeta + _skipNoBatchMeta + _skipNoSetColor;
    console.log('§STOREY_REVEAL_TINT storey="' + storeyName + '" color=#' + hex.toString(16).padStart(6, '0') +
      ' scope=' + STOREY_REVEAL_TINT_SCOPE + ' meshesTouched=' + n + ' facadeMeshes=' + _facadeN +
      ' clonedMaterials=' + _clones.length +
      ' skippedMeshes=' + _skipMesh +
      ' (noMaterial=' + _skipNoMat + ' arrayMaterial=' + _skipArrayMat +
      ' noEmissive=' + _skipNoEmissive + ' noClone=' + _skipNoClone + ')' +
      ' skippedBuckets=' + _skipBucket +
      ' (noInstanceMeta=' + _skipNoInstMeta + ' noBatchMeta=' + _skipNoBatchMeta +
      ' noSetColorAt=' + _skipNoSetColor + ')' +
      (n === 0 ? ' => FAIL nothing marked on this storey' :
       _skipMesh + _skipBucket > 0
         ? ' => PARTIAL — these are the parts that stay unpainted, and a glazed one stays see-through'
         : ' => WHOLE'));
    return n;
  }

  // §FACADE_ONLY_REVERT_XRAY (2026-09-10, user, after seeing the darken-above approach fail on
  // lighting-direction unevenness: "Yes. My original request prior" — confirming the ORIGINAL ask
  // was always just "highlight the storey's facade", not "reveal it through the rest of the
  // building"). Both x-ray (§STOREY_REVEAL_XRAY, tried first) and darken-above
  // (§STOREY_REVEAL_DIM_ABOVE, tried second) existed ONLY to make an otherwise-hidden storey visible
  // from outside a solid building. Neither is needed once the tint is scoped to facade/exterior-wall
  // elements (§FACADE_ONLY_TINT above): a storey's exterior wall is already the outermost, camera-
  // visible surface on any exterior orbit shot — nothing needs to become see-through or dimmed for
  // it to be seen. So: no x-ray, no darkening, no transparency, no per-pixel/per-triangle cost during
  // this window at all — it now runs at the SAME cost as any other beat. Normal occlusion applies
  // like anywhere else in the film: if a facade happens to be hidden from a given camera angle, it
  // is simply hidden, the same as any other geometry — no special-casing.
  var _markersHidden = false;
  function _hideMarkers() {
    if (!_markersHidden && A.clashFilm && A.clashFilm.setVisible) {
      if (A.clashFilm.setVisible(false)) {
        _markersHidden = true;
        console.log('§STOREY_REVEAL_MARKERS_OFF clash markers hidden — stats own the closing beats');
      }
    }
  }
  function _restoreMarkers() {
    if (_markersHidden && A.clashFilm && A.clashFilm.setVisible) {
      A.clashFilm.setVisible(true);
      console.log('§STOREY_REVEAL_MARKERS_OFF clash markers restored (bake/preview exit)');
    }
    _markersHidden = false;
  }

  // ══ §STOREY_SECTION_CUT (MEP_CLASH_REVEAL_MOVIE.md §92 design, §94 spec) ══════════════════════
  // A rising horizontal clip plane replaces "tint a facade subset nobody can see" as the way each
  // storey is shown. §93.4 measured why: the facade set is 2-51 meshes per storey and its legibility
  // tracks PROJECTED AREA, which nothing computes — Level 4 (51) reads as broad bands, Level 5 (44)
  // only as parapet lines, Levels 1/7A/7 (19/2/6) not at all. A cut plate is the storey's whole
  // footprint (L1 = 98.6x90.3 m), so the failure mode is removed rather than tuned around.
  // NON-INVENT: the cut elevations are `A.storeyRevealList()`'s own AVG(center_z) per storey — the
  // same rows the slots are built from — and the scene conversion is the one grid_views.js:193 uses.
  // §98 (user, settled): "X or Y storey by storey reverse section cut in 1.5s, then .5s pause, then
  // the next upper storey does the axis section reverse cut." So a slot is SWEEP + PAUSE = 2.0s and
  // the split is 0.75. NOTE: that lands as literally 1.5s/0.5s only when the fitted slot IS 2.0s;
  // today the window is sized by STOREY_REVEAL_WINDOW_SEC=10 (effects.js:8078) so HHS's slot is
  // 1.92s -> 1.44s/0.48s. Making it exact needs the window sized as n x CUT_SLOT_SEC, which is a
  // change in effects.js, not here.
  var CUT_SWEEP_SEC = 1.5, CUT_PAUSE_SEC = 0.5;
  // §110 — the ceiling on one storey's sweep. Twice the mandated floor: enough for a heavy storey to
  // read as an event, short enough that the beat never stalls on one plate. The base sweep floats
  // between the two, solved from whatever window the film can afford (see _fitList).
  var CUT_SWEEP_MAX = 2 * CUT_SWEEP_SEC;
  var CUT_RISE_FRAC = CUT_SWEEP_SEC / (CUT_SWEEP_SEC + CUT_PAUSE_SEC);
  var CUT_PITCH_DEG = 25;     // §94.4 — DEAD. §102 replaced the pitch test, the X/Y snap and the Z
                              // branch with ONE rule: the plane faces the camera. Kept only because
                              // §STOREY_CUT_AXIS still prints it. Original note: steeper than this
                              // and the camera is looking DOWN, where a
                              // horizontal cut exposes floor plates. Shallower and it sees facades,
                              // where a horizontal cut shows nothing — take the camera-facing one.
  var _cutSlab = null, _cutRest = null, _cutGlobal = [], _cutMats = [], _cutArmed = false, _cutAxisLogged = null, _cutLogIdx = null;
  var _modeLogged = false;   // §129.59 — say the mode ONCE per bake, not per frame
  var _cutObjs = [], _cutHidden = [], _cutClones = [];   // §105 — building-scoped arming bookkeeping
  var _planeCeil = null, _planeSweepSlab = null, _planeSweepRest = null, _matVariants = null;  // §112
  // §98.1 (user: "HHS was starting on one axis when it switched to another. Perhaps it just persist?
  // ... the angle became sharper but it is still consistent and that is more important optics").
  // The axis decision is LATCHED for the whole window. Both halves of it were being recomputed every
  // frame — the Z-vs-XY pitch test and the world X-vs-Y snap — so a camera that rotates during the
  // beat flipped the cut 90deg mid-sweep. Consistency beats picking the locally-better angle, and a
  // latched axis also keeps the sweep direction from reversing if the camera crosses the diagonal.
  // §99.1 (user: "the floor slab to cut first too ... this lends to visual cognition well") — within
  // a storey's sweep the SLAB leads and everything else follows, so the floor plate lands first and
  // the rest of the storey builds onto a ground the eye can already read. Separable because the batch
  // bucket key carries ifcClass (streaming.js:2210, §BATCH_BUCKET_CLASS_PAINT), so a BatchedMesh holds
  // exactly one class and its material can take its own plane.
  // §100 (user: "the upper sweep begins when the storey is about to reach its full end") — THE RAKE.
  // Two storeys sweeping at once means the reveal threshold varies with HEIGHT, which is not a step
  // function needing separate planes (the shared-material wall that killed the fade, §92.2) but simply
  // a TILTED plane: f.p - k*y >= c. One plane, one extra term. The bottom leads, the top lags, and k
  // IS the stagger, derived from the building rather than tuned:
  //     k = (1 - overlap) * (n - 1) * D / H      D = sweep span along the axis, H = band height
  // Measured: Hospital (D~100, H~47, n=8) gives k~11.9, a plane 5deg off horizontal; HHS (D~68, H~20,
  // n=3) gives k~5.4, about 10deg. So the staggered horizontal sweep converges on a near-horizontal
  // cut with a slight rake — the two axes stop being different shapes at these tilts.
  // With the rake on there are no per-slot pauses and no band planes: the tilt alone gives every
  // storey its turn, so the motion never stops. CUT_RAKE_OVERLAP = null disables it and restores the
  // per-storey banded behaviour with its 1.5s/0.5s slots.
  // VERDICT 2026-09-13, user, LOCKED: "The rake seems ugly and cheap or done the way i meant. Drop
  // that for simplicity." Measured on HHS (k=7.14, 8.0deg off horizontal, derived): the mechanism
  // works but it dissolves the thing the beat is for — at prog 0.34 the card read "Level 2" while the
  // frame was one diagonal slice through the whole building, and the opening frames were near-empty
  // because a single sweep spread across the window takes most of the beat to arrive. It also slices
  // the context city diagonally. The tilt IS what removes the discreteness, so one plane cannot give
  // overlap AND storey identity. Do not re-enable without a new user ask; the code path stays only so
  // the finding is reproducible.
  var CUT_RAKE_OVERLAP = null;
  var SLAB_LEAD_FRAC = 0.35;   // slab completes in the first 35% of the sweep; the rest uses the other 65%
  // §99.8 — the slab class set is DERIVED per building, not a fixed vocabulary: the fleet does not
  // agree on one. The regex is only the seed; _cutBounds asks the DB which of these classes this
  // model actually carries, and both the band boundaries and the material split use that same set so
  // they can never disagree. A model with none degrades to storey-mean midpoints and "nothing leads".
  var SLAB_RE = /IfcSlab|IfcFloor|IfcPlate/i;
  var _slabClasses = [];   // the classes this building actually uses, filled by _cutBounds
  var _axisLatch = null, _boundsLogged = false, _rakeLogged = null;

  // Per-storey cut boundaries, derived from the SAME list the slots use. The top of storey i is the
  // next storey's elevation; the last storey has no next, so it is extrapolated by the MEDIAN storey
  // spacing of this building (derived, not a constant). The base sits half a spacing below storey 0.
  function _cutBounds() {
    var list = A.storeyRevealList() || [];
    if (list.length < 2) return null;
    var gaps = [];
    for (var i = 1; i < list.length; i++) gaps.push(list[i].z - list[i - 1].z);
    gaps.slice().sort(function (a, b) { return a - b; });
    var med = gaps[gaps.length >> 1] || 1;
    // §99.4 — THE BOUNDARY IS THE REAL SLAB, not the midpoint of two storey means. §94.2 predicted
    // this refinement would be needed if frames showed the plane slicing mid-storey; the user saw
    // worse than that ("The top roof came first before the storey in it"), and the data says why.
    // Measured on HHS: Level 1's band by midpoint ran 0.74..4.30, while Level 2's floor slab sits at
    // 3.50..3.98 — INSIDE Level 1's band. Since slabs lead (§99.1), the storey above's floor slab
    // arrived first and capped Level 1 from above. Real slab bottoms are Level 1 -0.21, Level 2 3.50,
    // Level 3 7.00, Roof 10.59, so banding on them puts each storey's own slab at the FLOOR of its
    // band and the slab above in the NEXT band, which is what "storey by storey" means.
    var slabBottom = {};
    _slabClasses = [];
    try {
      // Which classes actually carry this building's plates? Ask the DB, do not assume a vocabulary.
      var cls = A.dbQuery("SELECT DISTINCT ifc_class FROM elements_meta WHERE ifc_class IS NOT NULL") || [];
      cls.forEach(function (r) { if (SLAB_RE.test(String(r[0]))) _slabClasses.push(String(r[0])); });
      if (_slabClasses.length) {
        var marks = _slabClasses.map(function () { return '?'; }).join(',');
        var sb = A.dbQuery(
          "SELECT m.storey, MIN(t.center_z - t.bbox_z/2.0) FROM elements_meta m " +
          "JOIN element_transforms t ON t.guid=m.guid WHERE m.ifc_class IN (" + marks + ") " +
          "AND m.storey IS NOT NULL AND m.storey NOT IN ('','Unknown') GROUP BY m.storey",
          _slabClasses) || [];
        sb.forEach(function (r) { if (r[1] != null) slabBottom[String(r[0])] = +r[1]; });
      }
    } catch (eSB) { slabBottom = {}; }
    // §STOREY_RUNG_LADDER (item 14) — a rung's slab-bottom is the MIN across its own name AND every
    // aliased label riding it (`.absorbs`, set by _regroupByRung): only SOME of a federated model's
    // naming systems own slab rows (LTU: VÅN/VÅNING and TAKPLAN do, Plan 1-4/Storey 1-3 do not), so
    // checking the rung's primary name alone would miss a real slab bottom booked under an alias.
    function _rungSlabBottom(entry) {
      var names = [entry.name].concat(entry.absorbs || []);
      var best = null;
      for (var k = 0; k < names.length; k++) {
        var v = slabBottom[names[k]];
        if (v != null && (best == null || v < best)) best = v;
      }
      return best;
    }
    // The LAST top must clear the real model, not an extrapolation. Measured on Hospital: the top
    // storey's mean is 200.40 while the model reaches 203.65, so `z + med/2` = 202.66 would leave the
    // final ~1 m of parapet and roof plant permanently sliced off at the window's end — the beat would
    // finish on a decapitated building. One cached query fixes it; it is the same shape the stat
    // card's footprint estimate already runs.
    var top = null;
    try {
      var tr = A.dbQuery('SELECT MAX(center_z + bbox_z/2.0) FROM element_transforms');
      if (tr && tr.length && tr[0][0] != null) top = +tr[0][0];
    } catch (eT) { top = null; }
    // Horizontal extent, for the XY sweep's depth span (§96.4 fix). Same one cached query shape.
    var plan = null;
    try {
      var hr = A.dbQuery('SELECT MIN(center_x), MAX(center_x), MIN(center_y), MAX(center_y) FROM element_transforms');
      if (hr && hr.length && hr[0][0] != null) plan = { x0: +hr[0][0], x1: +hr[0][1], y0: +hr[0][2], y1: +hr[0][3] };
    } catch (eH) { plan = null; }
    // The base is this storey's OWN slab bottom where we know it, so the first band opens on its plate.
    var base0 = _rungSlabBottom(list[0]);
    if (base0 == null) base0 = list[0].z - med / 2;
    // §STOREY_CUT_BOUNDS_MONOTONE (item 14) — MONOTONE BY CONSTRUCTION, not just detected: a real
    // slab-bottom row can itself be bad data (measured on LTU: TAKPLAN's own slab-bottom reads 2.99m,
    // a slab-on-grade the groundwork rule reclassified onto the roof's label — the RUNG GROUPING
    // above is correct, the one DB row is not). §122's premise is that the ceiling always ascends, so
    // a slab candidate that would violate it is REJECTED the same way "no slab found" already is —
    // degrade to the midpoint, which is guaranteed to ascend because the ladder itself does.
    // `naive*` tracks what §99.4's ORIGINAL formula alone would have produced (slab-if-present-else-
    // midpoint, no rejection) — kept ONLY so the witness stays falsifiable (§STATUS standing
    // instrument rule: a check that cannot fail is not a check). The RENDERED `tops` below always
    // applies the rejection guard; `naiveInversions` is what proves the guard is doing real work
    // (measured on the pre-fix per-label list via the `__srForceLabelLadder` control: naiveInversions
    // is nonzero there) rather than silently no-op'ing on data that was already fine.
    var tops = [], naiveTops = [], usedSlab = 0, usedMid = 0, rejectedBad = 0, prior = base0, naivePrior = base0;
    for (var j = 0; j < list.length; j++) {
      var t, naiveT;
      if (j + 1 < list.length) {
        var nb = _rungSlabBottom(list[j + 1]);
        var mid = (list[j].z + list[j + 1].z) / 2;
        naiveT = (nb != null) ? nb : mid;
        // `__srDisableRejectGuard` (control, Fable's review) — take the slab bottom even when it
        // would break monotonicity, so `inversions` (computed from the RENDERED tops below, not
        // `naiveInversions`) can actually go nonzero. Without this the guard could never be shown
        // doing anything: `naiveInversions` alone proves the OLD formula was capable of failing, not
        // that today's rejection is the reason it no longer does.
        if (nb != null && (nb > prior || window.__srDisableRejectGuard)) { t = nb; usedSlab++; }
        else {
          if (nb != null) {
            rejectedBad++;
            if (!_boundsLogged) console.log('§STOREY_CUT_BOUNDS_REJECT rung="' + list[j + 1].name + '" slabBottom=' + nb.toFixed(2) +
              ' <= prior=' + prior.toFixed(2) + ' — rejected (would break monotonicity), using midpoint=' + mid.toFixed(2));
          }
          t = Math.max(mid, prior + 1e-6); usedMid++;
        }
      } else {
        naiveT = Math.max(list[j].z + med / 2, top == null ? -Infinity : top);
        t = Math.max(naiveT, prior + 1e-6);
      }
      tops.push(t); prior = t;
      naiveTops.push(naiveT); naivePrior = naiveT;
    }
    var inversions = 0; prior = base0;
    for (var iv = 0; iv < tops.length; iv++) { if (tops[iv] <= prior) inversions++; prior = tops[iv]; }
    var naiveInversions = 0; naivePrior = base0;
    for (var niv = 0; niv < naiveTops.length; niv++) { if (naiveTops[niv] <= naivePrior) naiveInversions++; naivePrior = naiveTops[niv]; }
    if (!_boundsLogged) {
      _boundsLogged = true;
      console.log('§STOREY_CUT_BOUNDS' + (window.__srDisableRejectGuard ? ' CONTROL(__srDisableRejectGuard)' : '') +
        ' base=' + base0.toFixed(2) + ' tops=[' +
        tops.map(function (t) { return t.toFixed(2); }).join(',') + '] fromSlab=' + usedSlab +
        ' fromMidpointFallback=' + usedMid + ' rejectedBadSlab=' + rejectedBad +
        ' slabClasses=[' + _slabClasses.join(',') + ']' +
        ' inversions=' + inversions + ' naiveInversions=' + naiveInversions +
        ' => ' + (inversions === 0 ? 'PASS' : 'FAIL') +
        ' (§99.4 — real slab bottoms, not storey-mean midpoints; classes derived from this DB, §99.8;' +
        ' §122 — the ceiling must strictly ascend, base < tops[0] < tops[1] < ...; naiveInversions is' +
        ' what §99.4\'s formula alone would produce with no rejection guard — nonzero there is the' +
        ' guard doing real work, zero there means this building never needed it)');
    }
    return { list: list, tops: tops, base: base0, med: med, modelTop: top, plan: plan,
             inversions: inversions, naiveInversions: naiveInversions };
  }

  // PURE (§ the file's own one-function/two-callers rule) — the cut state for a film fraction.
  A.storeyRevealCutAt = function (plan, tNorm) {
    var vis = A.storeyRevealVisualAt(plan, tNorm);
    if (!vis) return null;
    var b = _cutBounds();
    if (!b) return null;
    // vis.idx indexes the FITTED (possibly truncated) slot list; map it back onto the full storey
    // list by name so a truncated reveal still cuts at the right elevations.
    var si = -1;
    for (var i = 0; i < b.list.length; i++) if (b.list[i].name === vis.storey) { si = i; break; }
    if (si < 0) return null;
    var from = si === 0 ? b.base : b.tops[si - 1];
    var to = b.tops[si];
    // §104 — the sweep is CUT_SWEEP_SEC of wall-clock, so the rising fraction of the slot is derived
    // from the slot's REAL length rather than the fixed 0.75 that assumed a 2.0s slot.
    var entF = _fitted && _fitted[vis.idx];
    var riseFrac = (entF && entF.slotSec > 0) ? Math.min(1, entF.sweepSec / entF.slotSec)
                 : ((_slotSec > 0) ? Math.min(1, CUT_SWEEP_SEC / _slotSec) : CUT_RISE_FRAC);
    var k = Math.min(1, vis.u / riseFrac);              // 0..1 rising, then pinned at 1 = held
    // §106 — three kinds of slot. The ground-slab pass sweeps the SLAB alone and leaves the storey
    // hidden; Level 1's pass then sweeps the REST with its plate already down; every storey above
    // sweeps its own floor slab in front of its contents, which is §99.1's lead unchanged.
    var ent = _fitted && _fitted[vis.idx];
    var slabK, restK;
    if (ent && ent.isGroundSlab) { slabK = k; restK = 0; }
    else if (si === 0)           { slabK = 1; restK = k; }
    // §106.1 (user, 2026-09-13: "I see the floors still not accompanying 2nd storey onwards") —
    // ACCOMPANYING, not leading. §99.1's SLAB_LEAD_FRAC put the plate down over the first 35% of the
    // slot and only then swept the storey onto it, which was right while the storey's own band began
    // at its floor; now that the ground plate has its own pass (§106) every remaining slab belongs to
    // the storey it supports and travels on the SAME plane as it. One sweep per storey, slab included.
    else { slabK = k; restK = k; }
    return { cutZ: from + (to - from) * k, floorZ: from, ceilZ: to, k: k, u: vis.u,
             slabK: slabK, restK: restK, isGroundSlab: !!(ent && ent.isGroundSlab),
             // §106 — the slot index is NO LONGER the group index: the ground-slab pass occupies
             // slot 0 without being a group. si is the band this slot cuts in, resolved by name, so
             // it IS the group index and is what the hide-above test must use.
             si: si,
             slotSec: entF ? entF.slotSec : _slotSec, sweepSec: entF ? entF.sweepSec : 0,
             storey: vis.storey, idx: vis.idx, n: vis.n,
             phase: vis.u < riseFrac ? 'rise' : 'hold' };
  };

  // Which plane set this camera can actually read (§94.4), and how to combine them (§96.4).
  // Returns { planes: [...], intersection: bool } — never a bare plane, because the eye-level case
  // needs three.
  function _cutPlanesFor(cut) {
    var T = window.THREE, cam = A.camera;
    if (!T || !cam) return null;
    var off = A.modelOffset ? A.modelOffset.z : 0;
    var tgt = A.controls && A.controls.target ? A.controls.target : null;
    var fwd = new T.Vector3();
    if (tgt) fwd.subVectors(tgt, cam.position).normalize();
    else cam.getWorldDirection(fwd);
    var pitchDeg = Math.asin(Math.max(-1, Math.min(1, -fwd.y))) * 180 / Math.PI;
    if (!_axisLatch) {
      // §99.9 — axis OVERRIDE, for comparing the two on the same camera without editing code:
      //   window.__storeyCutAxis = 'XY' | 'Z'   (anything else, or unset, derives it from pitch)
      // The open question it exists to answer is whether a vertical cut also reads under an OVERHEAD
      // rig; if it does, the Z branch has no reason to exist and this becomes a fixed choice.
      var forced = (typeof window !== 'undefined' && window.__storeyCutAxis) || null;
      var derived = pitchDeg >= CUT_PITCH_DEG ? 'Z' : 'XY';
      _axisLatch = { axis: (forced === 'XY' || forced === 'Z') ? forced : derived,
                     forced: (forced === 'XY' || forced === 'Z') ? forced : null,
                     derived: derived, pitchAtLatch: pitchDeg };
      if (_axisLatch.axis === 'XY') {
        _axisLatch.useX = Math.abs(fwd.x) >= Math.abs(fwd.z);
        _axisLatch.sign = _axisLatch.useX ? (fwd.x >= 0 ? 1 : -1) : (fwd.z >= 0 ? 1 : -1);
      }
      // §102 (user, 2026-09-13): the cut is no longer a world axis at all — "not to be XYZ but simply
      // from afar towards cam pov. This also ensure standard code applicable irrespective of angle."
      // The plane FACES THE CAMERA and sweeps from the far side toward it, so there is no X-vs-Y snap,
      // no CUT_PITCH_DEG test and no Z branch — one rule for every building and every rig. This
      // SUPERSEDES §98.3's world-axis snap ("just X or Y depending on angle of cam"), on the user's
      // own later ruling; do not re-snap to X/Y without a new ask. Two readings of "towards cam pov":
      // The pitch is DISCARDED, so the plane is vertical and reads as a section: taking the full
      // camera vector instead tilts it by the rig's pitch (45.7deg on Hospital), which is
      // geometrically the rake already dropped in §100.6. Baked both ways 2026-09-13 to be sure.
      // Latched for the whole window, exactly as §98.3 demanded of the axis it replaces — the bearing
      // is a camera quantity, so a rotating camera would otherwise rotate the cut mid-beat.
      var bf = fwd.clone();
      bf.y = 0;                                      // pitch discarded: the plane stays VERTICAL
      if (bf.lengthSq() < 1e-9) bf.set(0, 0, 1);     // camera dead vertical: fall back to +Z
      bf.normalize();
      _axisLatch.axis = 'XY';                        // the banded construction, always
      _axisLatch.bearing = bf;
      _axisLatch.bearingTiltDeg = Math.asin(Math.max(-1, Math.min(1, -bf.y))) * 180 / Math.PI;
    }
    var axis = _axisLatch.axis, out;
    if (CUT_RAKE_OVERLAP != null && CUT_RAKE_OVERLAP > 0) {
      var rb = _cutBounds();
      if (rb && rb.plan && typeof A.ifc2three === 'function') {
        // horizontal sweep direction: the same snapped world axis, so the rake degrades gracefully
        var rf = new T.Vector3();
        if (_axisLatch.useX == null) { _axisLatch.useX = Math.abs(fwd.x) >= Math.abs(fwd.z); _axisLatch.sign = _axisLatch.useX ? (fwd.x >= 0 ? 1 : -1) : (fwd.z >= 0 ? 1 : -1); }
        if (_axisLatch.useX) rf.set(_axisLatch.sign, 0, 0); else rf.set(0, 0, _axisLatch.sign);
        var H = (rb.tops[rb.tops.length - 1] - rb.base) || 1;
        var nS = cut.n || 1;
        // span of the model along rf, from its own bbox corners
        var zsR = [rb.base, rb.tops[rb.tops.length - 1]];
        var dLo = null, dHi = null;
        for (var xr = 0; xr < 2; xr++) for (var yr = 0; yr < 2; yr++) for (var zr = 0; zr < 2; zr++) {
          var qr = A.ifc2three(xr ? rb.plan.x1 : rb.plan.x0, yr ? rb.plan.y1 : rb.plan.y0, zsR[zr]);
          var pv = rf.dot(new T.Vector3(qr.x, 0, qr.z));
          if (dLo === null || pv < dLo) dLo = pv;
          if (dHi === null || pv > dHi) dHi = pv;
        }
        var D = (dHi - dLo) || 1;
        var k = (1 - CUT_RAKE_OVERLAP) * (nS - 1) * D / H;
        var nrm = new T.Vector3(rf.x, -k, rf.z);
        var len = nrm.length() || 1;
        nrm.multiplyScalar(1 / len);
        // c sweeps the full range of (rf.p - k*y) over the model, so the plane starts clear of it and
        // finishes past it. Progress is the WHOLE window, continuous — no per-slot restart.
        var offR = A.modelOffset ? A.modelOffset.z : 0;
        var yLo = rb.base - offR, yHi = rb.tops[rb.tops.length - 1] - offR;
        var cHi = dHi - k * yLo, cLo = dLo - k * yHi;
        var prog = (cut.idx + cut.u) / nS;
        var cLead = cHi - (cHi - cLo) * Math.min(1, prog / (1 - 0.15));      // slab runs slightly ahead
        var cTrail = cHi - (cHi - cLo) * prog;
        if (_rakeLogged !== cut.idx) {
          _rakeLogged = cut.idx;
          console.log('§STOREY_CUT_RAKE k=' + k.toFixed(2) + ' tiltFromHorizontalDeg=' +
            (Math.atan2(1, k) * 180 / Math.PI).toFixed(1) + ' overlap=' + CUT_RAKE_OVERLAP +
            ' D=' + D.toFixed(1) + ' H=' + H.toFixed(1) + ' n=' + nS + ' storey="' + cut.storey +
            '" prog=' + prog.toFixed(3) + ' — one raked plane, no bands, no pauses (§100)');
        }
        return { slab: [new T.Plane(nrm.clone(), -cLead / len)],
                 rest: [new T.Plane(nrm.clone(), -cTrail / len)],
                 intersection: false, global: [], axisName: _axisLatch.useX ? 'X' : 'Y' };
      }
    }
    if (axis === 'Z') {
      // Looking down: one plane, keep everything BELOW the rising cut. Intersection semantics are
      // irrelevant with a single plane. Same plane grid_views.js:195 builds.
      // slab leads, rest follows (§99.1): two cut heights from the same slot progress
      var kL = (cut.slabK != null) ? cut.slabK : Math.min(1, cut.k / SLAB_LEAD_FRAC);
      var kR = (cut.restK != null) ? cut.restK : Math.max(0, (cut.k - SLAB_LEAD_FRAC) / (1 - SLAB_LEAD_FRAC));
      var zFrom = cut.floorZ, zTo = cut.ceilZ;
      var cutY = (zFrom + (zTo - zFrom) * kL) - off;
      var cutYr = (zFrom + (zTo - zFrom) * kR) - off;
      out = { slab: [new T.Plane(new T.Vector3(0, -1, 0), cutY)],
              rest: [new T.Plane(new T.Vector3(0, -1, 0), cutYr)],
              intersection: false, global: [], axisName: null };
    } else {
      // Eye level (§96.4). A depth sweep alone peels the WHOLE building open, which is a fine section
      // but is not a storey reveal — the card would name one level while three are on screen. Fix:
      // peel only INSIDE the named storey's own band and leave the rest of the building solid, using
      // UNION semantics (clipIntersection = true, already used in this build at navigate_find.js:1818
      // for §ROOM-CLIP). Keep a point if it is beyond the sweep OR above the storey's ceiling OR
      // below its floor — so within the band only what is past the sweep survives, and outside the
      // band nothing is touched.
      var axisName = null;
      // §98 — PER STOREY, not one sweep across the building. For the storey in this slot:
      //   storeys ABOVE it are hidden outright, the storey itself sweeps in from the far face toward
      //   the camera, and every storey BELOW is already solid. That is
      //      keep = (y <= ceil) AND ( (y <= floor) OR (f.p >= d) )
      //   which is an AND over an OR, so it cannot be one plane array in either mode. THREE's two
      //   clipping levels express it exactly: renderer.clippingPlanes is ALWAYS intersected with the
      //   material's, so the ceiling goes global and the (floor OR sweep) pair goes on the material
      //   with clipIntersection = true. Nothing else in this viewer sets the global array.
      // §96.9 (user): snap to ONE world axis — "just X or Y depending on angle of cam" — rather than
      // the camera-forward diagonal. DB X/Y map to scene x/z (the loader's axis swap sends iy -> -z).
      var f = new T.Vector3();
      if (_axisLatch.bearing) {
        f.copy(_axisLatch.bearing);                       // §102 — faces the camera, sweeps toward it
        axisName = 'CAM';
      } else if (_axisLatch.useX) { f.set(_axisLatch.sign, 0, 0); axisName = 'X'; }
      else { f.set(0, 0, _axisLatch.sign); axisName = 'Y'; }
      var b = _cutBounds();
      var lo = null, hi = null;
      if (b && b.plan && typeof A.ifc2three === 'function') {
        var zs = [b.base, b.tops[b.tops.length - 1]];
        for (var xi = 0; xi < 2; xi++) for (var yi = 0; yi < 2; yi++) for (var zi = 0; zi < 2; zi++) {
          var q = A.ifc2three(xi ? b.plan.x1 : b.plan.x0, yi ? b.plan.y1 : b.plan.y0, zs[zi]);
          // §102 — with a pitched normal the corner's HEIGHT is part of its projection, so the span
          // must be taken in 3D. y follows the same convention as the band planes below: ifc z - off.
          var pr = f.dot(new T.Vector3(q.x, f.y ? (zs[zi] - off) : 0, q.z));
          if (lo === null || pr < lo) lo = pr;
          if (hi === null || pr > hi) hi = pr;
        }
      }
      if (lo === null) { lo = f.dot(new T.Vector3(cam.position.x, f.y ? cam.position.y : 0, cam.position.z)); hi = lo + 100; }
      // PER-SLOT k (not cumulative): each storey runs its own full far->near sweep, then holds for
      // the pause while the next storey waits its turn. d = hi hides the storey; d = lo completes it.
      var kL2 = (cut.slabK != null) ? cut.slabK : Math.min(1, cut.k / SLAB_LEAD_FRAC);
      var kR2 = (cut.restK != null) ? cut.restK : Math.max(0, (cut.k - SLAB_LEAD_FRAC) / (1 - SLAB_LEAD_FRAC));
      var d = hi - (hi - lo) * kL2;          // slab: leading plane (the edge rides this one)
      var dRest = hi - (hi - lo) * kR2;      // everything else: trailing
      var floorY = cut.floorZ - off, ceilY = cut.ceilZ - off;
      // perpendicular horizontal extent, from the same 8 projected corners
      var pa = null, pbb = null;
      if (b && b.plan && typeof A.ifc2three === 'function') {
        var perp = new T.Vector3(-f.z, 0, f.x);
        var zs2 = [b.base, b.tops[b.tops.length - 1]];
        for (var xj = 0; xj < 2; xj++) for (var yj = 0; yj < 2; yj++) {
          var qq = A.ifc2three(xj ? b.plan.x1 : b.plan.x0, yj ? b.plan.y1 : b.plan.y0, zs2[0]);
          var pp = perp.dot(new T.Vector3(qq.x, 0, qq.z));
          if (pa === null || pp < pa) pa = pp;
          if (pbb === null || pp > pbb) pbb = pp;
        }
      }
      out = { slab: [new T.Plane(new T.Vector3(0, -1, 0), floorY), new T.Plane(f.clone(), -d)],
              rest: [new T.Plane(new T.Vector3(0, -1, 0), floorY), new T.Plane(f.clone(), -dRest)],
              intersection: true,
              global: [new T.Plane(new T.Vector3(0, -1, 0), ceilY)],  // storeys above: not yet
              axisName: axisName };
    }
    var _logKey = axis + '/' + (out.axisName || '-');
    if (_axisLatch.bearing && _cutAxisLogged !== _logKey) {
      var _bg = _axisLatch.bearing;
      console.log('§STOREY_CUT_BEARING normal=' +
        _bg.x.toFixed(3) + ',' + _bg.y.toFixed(3) + ',' + _bg.z.toFixed(3) +
        ' tiltFromVerticalPlaneDeg=' + _axisLatch.bearingTiltDeg.toFixed(1) +
        ' camPitchDeg=' + pitchDeg.toFixed(1) +
        ' (§102 — plane faces the camera and sweeps toward it; worldAxis snap and the Z branch are' +
        ' both bypassed, so this is the SAME code on every building and every rig)');
    }
    if (_cutAxisLogged !== _logKey) {
      _cutAxisLogged = _logKey;
      console.log('§STOREY_CUT_AXIS axis=' + axis + ' pitchDeg=' + pitchDeg.toFixed(1) +
        (out.axisName ? ' worldAxis=' + out.axisName : '') +
        ' latchedAtPitch=' + _axisLatch.pitchAtLatch.toFixed(1) +
        (_axisLatch.forced ? ' FORCED=' + _axisLatch.forced + ' (derived would be ' + _axisLatch.derived + ')' : '') +
        ' threshold=' + CUT_PITCH_DEG + ' planes=' + out.slab.length + ' slabLead=' + SLAB_LEAD_FRAC +
        ' clipIntersection=' + out.intersection + ' — ' + (axis === 'Z'
          ? 'camera looks down, horizontal cut exposes floor plates'
          : 'camera near eye level; full-depth section sweeping toward the viewer (§96.6)'));
    }
    return out;
  }

  // §105 (user, 2026-09-13): "Silhouette background buildings still got cut scoped into action."
  // The cut was SCENE-scoped, not BUILDING-scoped, at BOTH levels: renderer.clippingPlanes is global
  // to everything drawn, and _armCut walked A.collectMeshes, which traverses the whole scene
  // (helpers.js:20, excluding only A.ground) — so the context city took the sweep plane AND was
  // beheaded by the ceiling. HHS showed it because its bands are low (tops=[3.50,7.00,15.07], so
  // storeys 1-2 put the ceiling at 3.50m/7.00m and cut the city off there); Hospital's sit at
  // 164-204m, above its context, which is exactly why the same code looked building-specific.
  //
  // The storey an object belongs to. Subject-building geometry carries one (§S260's _batchMeta, the
  // merged path's _mergedMeta, _instanceMeta, or plain userData); context city, ground, sky, markers
  // and decoration carry none — and "has no storey" IS the test for "not the building being revealed".
  function _objStorey(o) {
    if (o.userData && o.userData.storey) return String(o.userData.storey);
    var m = (A._batchMeta && A._batchMeta[o.id]) || (A._mergedMeta && A._mergedMeta[o.id]) ||
            (A._instanceMeta && A._instanceMeta[o.id]);
    if (m && m.length && m[0] && m[0].storey) return String(m[0].storey);
    return null;
  }

  // Which band an object sits in, from its own world bounding box. The LAST band is open-topped so
  // roof plant above the extrapolated top still lands on the top group rather than falling out.
  // §111 DIAGNOSTIC — how many BANDS does this object's own geometry cover? Visibility can only ever
  // show or hide a whole object, so any object spanning more than one band is one the ceiling used to
  // clip and that visibility CANNOT express: showing it reveals every storey it touches at once.
  function _bandSpanOf(o, b) {
    if (!b || !b.tops || !b.tops.length) return 0;
    var T = window.THREE;
    if (!T || !o.geometry) return 0;
    try {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      var bb = o.geometry.boundingBox;
      if (!bb) return 0;
      o.updateWorldMatrix(true, false);
      var off = A.modelOffset ? A.modelOffset.z : 0;
      var lo = new T.Vector3(0, bb.min.y, 0).applyMatrix4(o.matrixWorld).y + off;
      var hi = new T.Vector3(0, bb.max.y, 0).applyMatrix4(o.matrixWorld).y + off;
      var nb = 0;
      for (var i = 0; i < b.tops.length; i++) {
        var f = i === 0 ? b.base : b.tops[i - 1], c = b.tops[i];
        if (hi > f && lo < c) nb++;
      }
      return nb;
    } catch (e) { return 0; }
  }

  // §111 — the band of EACH INSTANCE of a multi-band object. §105 replaced the global ceiling plane
  // with whole-object visibility, which is exact only while an object belongs to one storey. It does
  // not: HHS measures 120 of 411 armed objects spanning 2-3 bands (the 629 storey='Unknown' IfcPlates
  // run z 0.15..10.55, the full height), because the InstancedMesh path buckets by GEOMETRY HASH
  // ALONE (streaming.js ~L2220) and carries the same plate on every floor. Showing such an object
  // shows every storey it touches — the "still showing 2 storeys at once" report. Both container
  // types can hide a single member, so the ceiling is enforced per instance instead.
  // §112 — a multi-band container cannot wear the 'current' material (its already-revealed members
  // would be swept a second time) so it wears 'revealed' and its members are gated INDIVIDUALLY:
  // a member shows when its band is below the one being revealed, or when its band IS the one being
  // revealed and the sweep has reached it. That is the same far->near order the plane draws, at
  // member granularity. This is the projection each member is compared on, taken once at arm time.
  function _perInstanceProj(o, f) {
    var T = window.THREE;
    if (!T || !f) return null;
    var out = [], box = new T.Box3(), m = new T.Matrix4(), v = new T.Vector3();
    try {
      o.updateWorldMatrix(true, false);
      if (o.isInstancedMesh) {
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        var gc = o.geometry.boundingBox.getCenter(new T.Vector3());
        for (var i = 0; i < o.count; i++) {
          o.getMatrixAt(i, m);
          v.copy(gc).applyMatrix4(m).applyMatrix4(o.matrixWorld);
          out.push(f.x * v.x + f.z * v.z);
        }
        return out;
      }
      if (o.isBatchedMesh && typeof o.getBoundingBoxAt === 'function') {
        var n = (A._batchMeta && A._batchMeta[o.id] && A._batchMeta[o.id].length) || o.maxInstanceCount || 0;
        for (var j = 0; j < n; j++) {
          if (!o.getBoundingBoxAt(j, box)) { out.push(null); continue; }
          box.getCenter(v).applyMatrix4(o.matrixWorld);
          out.push(f.x * v.x + f.z * v.z);
        }
        return out.length ? out : null;
      }
    } catch (e) { return null; }
    return null;
  }

  // §127 — an element's elevation comes from the MODEL, not from the scene graph. Deriving it from
  // container transforms was wrong twice over on Terminal: InstancedMesh instances all reported the
  // SAME height (the per-instance matrices do not carry the placement this code assumed), and the
  // value itself — 17.50 — matches ZERO elements in the DB, whose Unknown-ARC elevations cluster at
  // 18.7 / 20.8 / 22.3-22.6. element_transforms.center_z is the number the census already uses, so
  // banding on it makes the scene and the witness agree by construction instead of by coincidence.
  var _zByGuid = null, _zByGuidKey = null;
  function _elevationByGuid() {
    var key = (A.activeBuilding || A.currentBuilding || 'bld');
    if (_zByGuid && _zByGuidKey === key) return _zByGuid;
    var map = {};
    try {
      var rows = A.dbQuery('SELECT guid, center_z FROM element_transforms WHERE center_z IS NOT NULL') || [];
      for (var i = 0; i < rows.length; i++) map[String(rows[i][0])] = +rows[i][1];
      console.log('§STOREY_ELEV_BY_GUID n=' + rows.length +
        ' (§127 — per-element elevations straight from element_transforms; the reveal and the' +
        ' §121 census now band on the same number)');
    } catch (e) { map = {}; }
    _zByGuid = map; _zByGuidKey = key;
    return _zByGuid;
  }

  function _perInstanceBands(o, b) {
    var T = window.THREE;
    if (!T || !b || !b.tops || !b.tops.length) return null;
    var off = A.modelOffset ? A.modelOffset.z : 0;
    var out = [], box = new T.Box3(), m = new T.Matrix4(), v = new T.Vector3();
    function bandOfZ(z) {
      for (var i = 0; i < b.tops.length; i++) if (z < b.tops[i]) return i;
      return b.tops.length - 1;
    }
    // §127 — authoritative path: the container's own member list carries a guid per member.
    var _meta = (A._batchMeta && A._batchMeta[o.id]) || (A._mergedMeta && A._mergedMeta[o.id]) ||
                (A._instanceMeta && A._instanceMeta[o.id]) || null;
    if (_meta && _meta.length) {
      // §128.9 (user, 2026-09-14): the storey LABEL is the ruler — a member whose label names a reveal
      // pass is booked into that pass, so the picture matches the storey the caption describes.
      // Elevation is the fallback for a member with no usable label (Unknown, or a label that is not
      // a declared storey), banded by its own centre against the slab-bottom tops so a floor slab
      // still travels with the storey it carries. `window.__srElevationOnly` is the control only.
      var _zmap = _elevationByGuid(), _hit = 0, _gm = _storeyGroupIndex(b);
      for (var _k = 0; _k < _meta.length; _k++) {
        var _lg = (_meta[_k] && _meta[_k].storey != null && !window.__srElevationOnly) ? _gm[String(_meta[_k].storey)] : undefined;
        if (_lg != null) { _hit++; _bandFromLabel++; out.push(_lg); continue; }
        var _z = _meta[_k] && _meta[_k].guid != null ? _zmap[String(_meta[_k].guid)] : undefined;
        if (_z == null) { out.push(-1); continue; }
        _hit++; out.push(bandOfZ(_z));
      }
      if (_hit) { _elevFromDb += _hit; return out; }
      out.length = 0;                                   // no guids resolved — fall through
    }
    try {
      o.updateWorldMatrix(true, false);
      if (o.isInstancedMesh) {
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        var gc = o.geometry.boundingBox.getCenter(new T.Vector3());
        var _dbgY = [];
        for (var i = 0; i < o.count; i++) {
          o.getMatrixAt(i, m);
          v.copy(gc).applyMatrix4(m).applyMatrix4(o.matrixWorld);
          if (_dbgY.length < 6) _dbgY.push((v.y + off).toFixed(2));
          out.push(bandOfZ(v.y + off));
        }
        if (o.count > 2000 && _instDbg.length < 3) {
          var _meta2 = A._instanceMeta && A._instanceMeta[o.id];
          _instDbg.push('id' + o.id + ' count=' + o.count + ' metaLen=' + (_meta2 ? _meta2.length : 'none') +
            ' outLen=' + out.length + ' firstZ=[' + _dbgY.join(',') + ']' +
            ' offset=' + off.toFixed(2) + ' tops=[' + b.tops.map(function (t) { return t.toFixed(1); }).join(',') + ']');
        }
        return out;
      }
      if (o.isBatchedMesh && typeof o.getBoundingBoxAt === 'function') {
        // §124 — index by the batch's OWN slot id, not by the position of the entry in _batchMeta.
        // §S260 stores {guid, storey, disc, ifcClass, slotId} and slotId is what BatchedMesh knows;
        // the two are not the same number. Passing the array position made getBoundingBoxAt fail,
        // every band came back -1, and the tally then fell back to the container's single band —
        // which is why Terminal booked all 33,406 of its unlabelled ARC elements to one storey even
        // though the DB spreads them 12,588 / 18,224 / 2,522 across bands 3/4/5.
        var _bm = (A._batchMeta && A._batchMeta[o.id]) || null;
        var n = (_bm && _bm.length) || o.maxInstanceCount || 0;
        var _im = new T.Matrix4();
        for (var j = 0; j < n; j++) {
          var _sid = (_bm && _bm[j] && _bm[j].slotId != null) ? _bm[j].slotId : j;
          if (!o.getBoundingBoxAt(_sid, box)) { out.push(-1); continue; }
          // §125 — getBoundingBoxAt returns the GEOMETRY's box, NOT the placed instance's. Without
          // the per-instance matrix every instance sharing a geometry reports the same height, so a
          // whole batch collapses onto one band. MEASURED on Terminal: 34,655 ARC elements went
          // through the per-element path and still all landed in band 3, while the DB spreads them
          // 12,588 / 18,224 / 2,522 across bands 3/4/5. Apply the instance matrix, then the object's.
          box.getCenter(v);
          if (typeof o.getMatrixAt === 'function') { o.getMatrixAt(_sid, _im); v.applyMatrix4(_im); }
          v.applyMatrix4(o.matrixWorld);
          out.push(bandOfZ(v.y + off));
        }
        return out.length ? out : null;
      }
    } catch (e) { return null; }
    return null;
  }

  // Hide or show ONE member of a container. BatchedMesh has setVisibleAt; InstancedMesh has no such
  // API, so it uses this codebase's own zero-scale convention (helpers.js A.filterInstancedMesh).
  function _setInstanceVisible(rec, i, on) {
    var o = rec.o, T = window.THREE;
    if (o.isBatchedMesh && typeof o.setVisibleAt === 'function') {
      var _bm = A._batchMeta && A._batchMeta[o.id];       // §124 — slot id, not array position
      var _sid = (_bm && _bm[i] && _bm[i].slotId != null) ? _bm[i].slotId : i;
      o.setVisibleAt(_sid, on);
      return;
    }
    if (o.isInstancedMesh && rec.imat0) {
      var m = new T.Matrix4();
      if (on) m.fromArray(rec.imat0, i * 16);
      else m.makeScale(0, 0, 0);
      o.setMatrixAt(i, m);
      rec.dirty = true;
    }
  }

  function _bandOf(o, b) {
    if (!b || !b.tops || !b.tops.length) return -1;
    var T = window.THREE;
    if (!T || !o.geometry) return -1;
    try {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      var bb = o.geometry.boundingBox;
      if (!bb) return -1;
      var c = bb.getCenter(new T.Vector3());
      o.updateWorldMatrix(true, false);
      c.applyMatrix4(o.matrixWorld);
      var off = A.modelOffset ? A.modelOffset.z : 0;
      var z = c.y + off;                       // back to the ifc elevations the bands are stated in
      for (var i = 0; i < b.tops.length; i++) if (z < b.tops[i]) return i;
      return b.tops.length - 1;                // above the top band: it belongs to the top group
    } catch (e) { return -1; }
  }

  // name -> group index, absorbed pseudo storeys (§103) resolving to their host group.
  function _storeyGroupIndex(b) {
    var map = {};
    (b.list || []).forEach(function (g, i) {
      map[g.name] = i;
      (g.absorbs || []).forEach(function (nm) { map[nm] = i; });
    });
    return map;
  }

  // The class of a mesh or a (single-class) batch, for the slab/rest split.
  function _meshClass(o) {
    if (o.userData && o.userData.ifcClass) return o.userData.ifcClass;
    var meta = A._batchMeta && A._batchMeta[o.id];
    return (meta && meta.length && meta[0].ifcClass) || '';
  }

  // Arm ONCE per window (§94.3): walk the materials and attach the plane. Per frame we only mutate
  // plane.normal/constant, so there is no material walk and no needsUpdate in the frame loop.
  function _armCut(set) {
    if (_cutArmed) return;
    _cutSlab = set.slab; _cutRest = set.rest;
    _cutGlobal = [];
    var _T = window.THREE;
    _planeCeil = new _T.Plane(new _T.Vector3(0, -1, 0), 0);
    _planeSweepSlab = new _T.Plane(new _T.Vector3(1, 0, 0), 0);
    _planeSweepRest = new _T.Plane(new _T.Vector3(1, 0, 0), 0);
    _matVariants = new Map();
    // §105 — the renderer's GLOBAL array is never used again. It is the one clipping level that cannot
    // be scoped to an object, so the "storeys above are not yet built" half of §98.2's
    //   keep = (y <= ceil) AND ((y <= floor) OR (f.p >= d))
    // is expressed with VISIBILITY instead (_applyHideAbove below). That is exact rather than
    // approximate here: the batch bucket key LEADS with el.storey (streaming.js:2210), so every batch
    // holds exactly one storey and can be hidden whole. What is left on the material is the union
    // ((y <= floor) OR (f.p >= d)), which needs no ceiling — storeys above are simply not drawn.
    if (A.renderer) A.renderer.clippingPlanes = [];
    _cutMats = []; _cutObjs = []; _cutHidden = [];
    var seen = (typeof Set !== 'undefined') ? new Set() : null;
    var b = _cutBounds();
    var gmap = b ? _storeyGroupIndex(b) : {};
    // §128.9 label witness tallies — the pass each labelled element is booked into, against the pass
    // its own storey label names; plus every element the arm loop never books anywhere.
    var _lw = { den: 0, other: 0, up: 0, down: 0, byDisc: {}, skipObjs: 0, skipEls: 0, ctxLabelled: 0, route: {}, mixed: 0, mixedType: {}, mixedEls: 0, ctxByDisc: {}, ctxObjs: 0 };
    var nSlab = 0, nRest = 0, nSubj = 0, nCtx = 0, noStorey = 0, byHeight = 0, _spanners = 0, _spanEx = [], _perInstObjs = 0, _spanUnhandled = 0;
    _armedDisc = []; _perInstBadBands = 0; _elevFromDb = 0; _bandFromLabel = 0;
    var _attrPerEl = 0, _attrByObj = 0, _arcPerEl = 0, _arcByObj = 0, _arcTop = [], _bigARC = {};
    var subjMats = (typeof Set !== 'undefined') ? new Set() : null;
    var ctxObjs = [];
    A.collectMeshes(function (o) { return o.isMesh || o.isBatchedMesh || o.isInstancedMesh; }).forEach(function (o) {
      var m = o.material;
      if (!m || Array.isArray(m)) {
        _lw.skipObjs++;
        var _sm = (A._batchMeta && A._batchMeta[o.id]) || (A._instanceMeta && A._instanceMeta[o.id]) || (A._mergedMeta && A._mergedMeta[o.id]) || null;
        _lw.skipEls += (_sm && _sm.length) ? _sm.length : 1;
        return;
      }
      var st = _objStorey(o);
      if (st == null) {                                        // context city / ground / markers: untouched
        nCtx++; ctxObjs.push(o);
        var _cm = (A._batchMeta && A._batchMeta[o.id]) || (A._instanceMeta && A._instanceMeta[o.id]) || (A._mergedMeta && A._mergedMeta[o.id]) || null;
        if (_cm) for (var _ck = 0; _ck < _cm.length; _ck++) {
          if (_cm[_ck] && _cm[_ck].storey != null && gmap[String(_cm[_ck].storey)] != null) _lw.ctxLabelled++;
          var _cd = (_cm[_ck] && _cm[_ck].disc) || '?'; _lw.ctxByDisc[_cd] = (_lw.ctxByDisc[_cd] || 0) + 1;
        }
        if (_cm && _cm.length) _lw.ctxObjs++;
        return;
      }
      nSubj++;
      var gi = gmap[st];
      var _byHeightThisObj = false;
      if (gi == null) {
        // A storey label that is not a reveal group — §60.1 drops any elements_meta storey that
        // spatial_structure does not declare (HHS's "Roof Level", 45 elements). The global ceiling
        // plane used to clip those anyway; with it gone they would float above an unrevealed
        // building, so resolve them BY ELEVATION against the same bands: the object's own world
        // bbox centre picks the group whose band contains it. Derived from the geometry, no names.
        gi = _bandOf(o, b);
        if (gi < 0) noStorey++; else { byHeight++; _byHeightThisObj = true; }
      }
      var _span = _bandSpanOf(o, b);
      var _rec = { o: o, gi: gi, vis0: o.visible, span: _span, mat0: o.material };
      // §121's per-discipline tally runs AFTER the span block below — it needs _rec.perInst.
      // §123 — PER-ELEMENT BANDING FOR UNLABELLED GEOMETRY. A container whose elements carry no
      // storey cannot be placed by name, and banding the whole container by its bbox centre books
      // every element it holds to one storey. MEASURED on Terminal: 33,406 of its 35,552 ARC
      // elements are storey='Unknown' (94%), so that one decision moved essentially all of the
      // building's architecture into a single pass — the "storeys missing ARCH" report. Whenever the
      // label is missing, band each element by its OWN elevation, whatever the container's span.
      // §128.9 — every container with a member list goes per member. The span test measured an
      // InstancedMesh by its base geometry at the container's own transform (never where the
      // instances are), so instanced containers always read as one band and were booked wholesale
      // to their first member's storey: 672 of HHS's 762 mis-booked elements. `window.__srContainerRoute`
      // restores the old gate for the falsifiability control only.
      var _metaEarly = (A._batchMeta && A._batchMeta[o.id]) || (A._mergedMeta && A._mergedMeta[o.id]) || (A._instanceMeta && A._instanceMeta[o.id]) || null;
      var _perMember = !!(_metaEarly && _metaEarly.length && !window.__srContainerRoute);
      if (_perMember || _span > 1 || _byHeightThisObj) {
        if (_span > 1) _spanners++;
        if (o.isInstancedMesh && o.instanceMatrix && o.instanceMatrix.array) {
          _rec.imat0 = o.instanceMatrix.array.slice(0);     // §111 zero-scale restore (NOT mat0 — that is the material)
        }
        _rec.perInst = _perInstanceBands(o, b);
        if (_rec.perInst) {
          var _bad = 0;
          for (var _pb = 0; _pb < _rec.perInst.length; _pb++) if (_rec.perInst[_pb] < 0) _bad++;
          if (_bad) _perInstBadBands += _bad;
          if (_bad === _rec.perInst.length) _rec.perInst = null;   // no usable per-element band
        }
        _rec.perProj = _axisLatch && _axisLatch.bearing ? _perInstanceProj(o, _axisLatch.bearing) : null;
        if (_rec.perInst) _perInstObjs++; else _spanUnhandled++;
      }
      // §121 — count the ELEMENTS this object carries, per discipline, against the group it will be
      // revealed in. An object is a container: one batch can hold hundreds of elements, so counting
      // objects would never line up with the DB census.
      try {
        var _meta = (A._batchMeta && A._batchMeta[o.id]) || (A._mergedMeta && A._mergedMeta[o.id]) ||
                    (A._instanceMeta && A._instanceMeta[o.id]) || null;
        if (_meta && _meta.length) {
          var _mixedHere = 0;
          for (var _mi = 0; _mi < _meta.length; _mi++) {
            var _gi2 = gi;
            if (_rec.perInst && _rec.perInst[_mi] != null && _rec.perInst[_mi] >= 0) {
              _gi2 = _rec.perInst[_mi]; _attrPerEl++;
            } else _attrByObj++;
            var _lbl = (_meta[_mi] && _meta[_mi].storey != null) ? gmap[String(_meta[_mi].storey)] : null;
            if (_lbl != null) {
              _lw.den++;
              if (_gi2 !== _lbl) {
                _lw.other++; if (_gi2 > _lbl) _lw.up++; else _lw.down++;
                var _ld = (_meta[_mi].disc || '?'); _lw.byDisc[_ld] = (_lw.byDisc[_ld] || 0) + 1;
                var _rt = (_rec.perInst && _rec.perInst[_mi] != null && _rec.perInst[_mi] >= 0) ? 'perElementZ' : (_byHeightThisObj ? 'containerHeight' : 'containerLabel');
                _lw.route[_rt] = (_lw.route[_rt] || 0) + 1;
              }
            }
            if (_meta[_mi] && _meta[_mi].disc === 'ARC' && _meta.length > 2000) {
              if (!_bigARC[o.id]) _bigARC[o.id] = {
                type: (o.isBatchedMesh ? 'Batched' : o.isInstancedMesh ? 'Instanced' : 'Mesh'),
                n: _meta.length, gi: gi, span: _span, hasPerInst: !!_rec.perInst,
                hasGetMatrixAt: (typeof o.getMatrixAt === 'function'),
                slotIdSample: (_meta[0] && _meta[0].slotId), bands: {} };
              var _bk = _bigARC[o.id].bands;
              _bk[_gi2] = (_bk[_gi2] || 0) + 1;
            }
            if (_meta[_mi] && _meta[_mi].disc === 'ARC') {
              if (_rec.perInst) _arcPerEl++; else { _arcByObj++;
                if (_arcTop.length < 5) _arcTop.push((o.isBatchedMesh ? 'B' : o.isInstancedMesh ? 'I' : 'M') +
                  ':' + _meta.length + 'el:gi' + gi + ':span' + _span + ':st=' + (st || '?')); }
            }
            var _d = (_meta[_mi] && _meta[_mi].disc) || '?';
            if (!_armedDisc[_gi2]) _armedDisc[_gi2] = {};
            _armedDisc[_gi2][_d] = (_armedDisc[_gi2][_d] || 0) + 1;
            if (!_rec.perInst && _meta[_mi] && _meta[_mi].storey != null && String(_meta[_mi].storey) !== st) _mixedHere++;
          }
          if (_mixedHere) { _lw.mixed++; _lw.mixedEls += _mixedHere; var _ty = o.isInstancedMesh ? 'I' : o.isBatchedMesh ? 'B' : 'M'; _lw.mixedType[_ty] = (_lw.mixedType[_ty] || 0) + 1; }
        } else {
          var _d1 = (o.userData && o.userData.disc) || '?';
          if (!_armedDisc[gi]) _armedDisc[gi] = {};
          _armedDisc[gi][_d1] = (_armedDisc[gi][_d1] || 0) + 1;
          var _lbl1 = (o.userData && o.userData.storey != null) ? gmap[String(o.userData.storey)] : null;
          if (_lbl1 != null) {
            _lw.den++;
            if (gi !== _lbl1) { _lw.other++; if (gi > _lbl1) _lw.up++; else _lw.down++; _lw.byDisc[_d1] = (_lw.byDisc[_d1] || 0) + 1; }
          }
        }
      } catch (eD) {}
      _cutObjs.push(_rec);
      if (seen) seen.add(m);
      if (subjMats) subjMats.add(m);
      var isSlab = false;
      try {
        var mc = _meshClass(o);
        isSlab = _slabClasses.length ? _slabClasses.indexOf(mc) >= 0 : SLAB_RE.test(mc);
      } catch (eC) { isSlab = false; }
      // §112 — TWO VARIANTS PER MATERIAL, and which one an object wears says what role it is playing
      // this slot. Both use INTERSECTION (AND) semantics, so the ceiling is always in force:
      //     revealed : [ceil]          — solid up to the ceiling, protrusions wait their turn
      //     current  : [ceil, sweep]   — only what is inside the band AND past the sweep
      // The union form this replaces needed one material to serve both roles, which is the only
      // reason the ceiling had to live on the renderer's global array in the first place.
      _rec.isSlab = isSlab; _rec.mat = m;
      if (!_matVariants.has(m)) {
        var rv = m.clone(), cu = m.clone();
        rv.clippingPlanes = [_planeCeil]; rv.clipIntersection = false; rv.clipShadows = true; rv.needsUpdate = true;
        cu.clippingPlanes = [_planeCeil, isSlab ? _planeSweepSlab : _planeSweepRest];
        cu.clipIntersection = false; cu.clipShadows = true; cu.needsUpdate = true;
        _matVariants.set(m, { revealed: rv, current: cu });
        _cutMats.push(rv); _cutMats.push(cu);
      }
      if (isSlab) nSlab++; else nRest++;
    });
    // every armed object remembers the material it came in wearing, so _clearCut can put it back
    _cutObjs.forEach(function (e) { if (!e.mat0) e.mat0 = e.o.material; });
    // A material SHARED between the building and something that is not it would leak the sweep plane
    // back into the context through A._matCache (§90.3, the same sharing that killed the fade in
    // §92.2). Clone it for the CONTEXT side — always the smaller set — so the building keeps the
    // shared instance and nothing else is clipped. Logged, because a nonzero count means the scene
    // does share materials across that boundary and the count is the cost.
    var leaked = 0;
    if (subjMats) ctxObjs.forEach(function (o) {
      if (o.material && !Array.isArray(o.material) && subjMats.has(o.material)) {
        var c = o.material.clone();
        c.clippingPlanes = null; c.clipIntersection = false; c.clipShadows = false;
        _cutClones.push({ o: o, m0: o.material });
        o.material = c; leaked++;
      }
    });
    _cutArmed = true;
    // §121 ARCH WITNESS — per group, what the DB says the storey holds against what the reveal
    // actually armed. A shortfall means those elements are in NO pass and never appear: the
    // "storeys missing ARCH" report. Reported for every discipline, not just ARC, because a
    // shortfall in any of them is the same defect.
    try {
      var _cen = _discCensusFor(b);
      var _lines = [], _anyShort = 0;
      for (var _ci = 0; _ci < _cen.length; _ci++) {
        var _want = _cen[_ci] || {}, _got = _armedDisc[_ci] || {};
        var _parts = [];
        Object.keys(_want).sort().forEach(function (d) {
          var w = _want[d] || 0, g = _got[d] || 0;
          if (g < w) _anyShort += (w - g);
          _parts.push(d + ' ' + g + '/' + w + (g < w ? ' SHORT' : ''));
        });
        _lines.push(b.list[_ci].name + '[' + _parts.join(' ') + ']');
      }
      console.log('§STOREY_ARCH_WITNESS ' + _lines.join(' ') + ' => ' +
        (_anyShort === 0 ? 'PASS (every element the DB places on a storey is armed into that storey\'s pass)'
                         : 'FAIL — ' + _anyShort + ' element(s) are on a storey but in another pass or in none (§STOREY_LABEL_WITNESS says which), so they' +
                           ' never appear during the reveal'));
    } catch (eAW) { console.log('§STOREY_ARCH_WITNESS unavailable: ' + (eAW && eAW.message)); }
    console.log('§STOREY_CUT_ARM materials=' + _cutMats.length + ' slab=' + nSlab + ' rest=' + nRest +
      ' leadFrac=' + SLAB_LEAD_FRAC + ' subjectObjs=' + nSubj + ' contextObjsUntouched=' + nCtx +
      ' storeyByHeight=' + byHeight + ' unresolved=' + noStorey + ' contextClonesForSharedMat=' + leaked +
      ' multiBandObjs=' + _spanners + ' perInstanceCeiling=' + _perInstObjs +
      ' perElementBandLookupFailures=' + _perInstBadBands +
      ' elementsBandedFromLabel=' + _bandFromLabel + ' elementsBandedFromDbElevation=' + _elevFromDb +
      ' attribution{perElement=' + _attrPerEl + ' byContainer=' + _attrByObj +
      ' ARC:perElement=' + _arcPerEl + ' byContainer=' + _arcByObj +
      ' biggestARCbyContainer=[' + _arcTop.join(' ') + ']}' +
      ' spanUnhandled=' + _spanUnhandled + ' (§111 — a multi-band object gets its ceiling per INSTANCE;' +
      ' spanUnhandled>0 would mean some container can still show two storeys at once)' +
      ' globalPlanes=0 (§105 — the cut is scoped to the building that carries storeys; the renderer' +
      ' global array is empty, so nothing in the background is clipped)');
    // §128.9 WITNESS — every element whose storey label names a reveal pass must be booked into THAT
    // pass; and every element the building carries must be booked somewhere. Label side from the
    // member's own label, pass side from the assignment the loop above just made; both over their
    // denominators. Elements the loop never books (no material, array material, context container)
    // are counted separately, since the discipline census cannot tell 'in another pass' from 'in none'.
    var _lwNoPass = _lw.skipEls + _lw.ctxLabelled;
    console.log('§STOREY_LABEL_WITNESS labelledElements=' + _lw.den + ' bookedToOwnStorey=' + (_lw.den - _lw.other) + '/' + _lw.den +
      ' bookedElsewhere=' + _lw.other + ' (storeyAbove=' + _lw.up + ' storeyBelow=' + _lw.down + ')' +
      ' byDisc={' + Object.keys(_lw.byDisc).sort().map(function (d) { return d + ':' + _lw.byDisc[d]; }).join(' ') + '}' +
      ' bookedNowhere=' + _lwNoPass + ' (skippedContainers=' + _lw.skipObjs + ' holding ' + _lw.skipEls + ' elements, labelledInsideContext=' + _lw.ctxLabelled + ')' +
      ' contextContainersWithElements=' + _lw.ctxObjs + ' contextElementsByDisc={' + Object.keys(_lw.ctxByDisc).sort().map(function (k) { return k + ':' + _lw.ctxByDisc[k]; }).join(' ') + '}' +
      ' byRoute={' + Object.keys(_lw.route).sort().map(function (k) { return k + ':' + _lw.route[k]; }).join(' ') + '}' +
      ' singleBandContainersWithMixedLabels=' + _lw.mixed + '{' + Object.keys(_lw.mixedType).sort().map(function (k) { return k + ':' + _lw.mixedType[k]; }).join(' ') + '} holding ' + _lw.mixedEls + ' off-label elements' +
      ' => ' + ((_lw.other === 0 && _lwNoPass === 0) ? 'PASS (every labelled element is revealed with its own storey)'
        : 'DISAGREE — ' + _lw.other + ' labelled element(s) are revealed in a different storey\'s pass and ' + _lwNoPass + ' in none'));
    _armBaselineWitness();
  }

  // §128.1c WITNESS A — the baseline this module snapshots at arm is what its restore writes back,
  // so it must be the RESTING scene, not another system's transient. Two counts that must be zero:
  // armed objects captured OFF, and instance rows captured at zero scale. Read from the scene, not
  // from any variable the reveal derives; printed over their denominators; the discipline-reveal
  // key and the discipline filter set are printed alongside so the log names the foreign owner.
  function _armBaselineWitness() {
    try {
      var offObjs = 0, byDisc = {}, rows = 0, zeroRows = 0, instObjs = 0, tmHeldRows = 0, guids = [], held = _tmHeld();
      _cutObjs.forEach(function (e) {
        var o = e.o;
        if (e.vis0 === false) {
          offObjs++;
          var meta = (A._instanceMeta && A._instanceMeta[o.id]) || (A._batchMeta && A._batchMeta[o.id]) || null;
          var d = (o.userData && o.userData.disc) || (meta && meta[0] && meta[0].disc) || '?';
          byDisc[d] = (byDisc[d] || 0) + 1;
        }
        if (o.isInstancedMesh && o.instanceMatrix && o.instanceMatrix.array) {
          instObjs++;
          var a = o.instanceMatrix.array, n = o.count != null ? o.count : (a.length / 16);
          for (var i = 0; i < n; i++) {
            rows++;
            if (a[i * 16] === 0 && a[i * 16 + 5] === 0 && a[i * 16 + 10] === 0) {
              var _mA = A._instanceMeta && A._instanceMeta[o.id] && A._instanceMeta[o.id][i];
              var _gA = _mA && _mA.guid;
              if (held && held(_gA)) { tmHeldRows++; continue; }
              zeroRows++; if (guids.length < 12) guids.push(String(_gA) + ':' + ((_mA && _mA.disc) || '?') + ':' + ((_mA && _mA.storey) || '?'));
            }
          }
        }
      });
      var hid = (A.hiddenDiscs && typeof A.hiddenDiscs.forEach === 'function') ? [] : null;
      if (hid) A.hiddenDiscs.forEach(function (d) { hid.push(d); });
      // §129.51 (2026-09-19, red1: "the storey by storey stacking lost its animation reveal from
      // afar to cam pov ... It was there before and is in HHS still") — PUBLISH THE ARMED WINDOW.
      // This baseline exists because arming inside another system's transient state poisons the
      // restore: whatever is hidden NOW is what this leg writes back when it ends. On Hospital it
      // armed with 2,674 instance rows already zero-scaled by the DLOD proxy and duly handed back
      // 2,981 members switched off (§STOREY_CUT_RESTORE_WITNESS membersLeftOff=2981/63182 => FAIL),
      // so the storeys it was meant to stack were partly missing. HHS arms clean (0/411, 0/3135)
      // because the proxy never engages there, which is exactly why the animation survived on one
      // building and not the other. §129.50 stood the proxy down for the DISCIPLINE reveal; this
      // flag lets it stand down for the STOREY reveal too, from arm to restore.
      // §129.51b — the flag is now raised AHEAD of the window by storeyRevealApplyVisual, not here.
      // Setting it at this point was the original mistake: this runs after the arm loop has already
      // snapshotted the scene, so it stood the proxy down one moment too late to matter.
      console.log('§STOREY_ARM_BASELINE armedObjsOff=' + offObjs + '/' + _cutObjs.length +
        ' byDisc={' + Object.keys(byDisc).sort().map(function (d) { return d + ':' + byDisc[d]; }).join(' ') + '}' +
        ' zeroScaleRows=' + zeroRows + '/' + rows + ' (over ' + instObjs + ' instanced containers) heldByTimeMachine=' + tmHeldRows + (held ? '' : ' (TM inactive)') +
        (guids.length ? ' foreignRows=[' + guids.join(' ') + ']' : '') +
        ' discRevealKey="' + (A._cpeRevealVisualKey || '') + '" hiddenDiscs=[' + (hid ? hid.join(',') : '?') + ']' +
        ' => ' + ((offObjs === 0 && zeroRows === 0) ? 'PASS (the baseline is the resting scene)'
          : 'FAIL — the reveal armed inside another system\'s transient state; that state is what its restore will write back'));
    } catch (eB) { console.log('§STOREY_ARM_BASELINE unavailable: ' + (eB && eB.message)); }
  }

  // §105 — the ceiling half of the predicate, as visibility. Storeys ABOVE the group being revealed
  // are not drawn at all; the group itself and everything below stay on and let the material planes
  // decide. Only objects this module armed are touched, and every one is restored in _clearCut.
  // §121 — the per-(group, discipline) CENSUS straight from the DB, so "this storey is missing its
  // ARCH" is answerable against a number the reveal did not produce. Queried once per building.
  var _discCensus = null, _discCensusKey = null, _armedDisc = [], _perInstBadBands = 0, _instDbg = [], _elevFromDb = 0, _bandFromLabel = 0;
  function _discCensusFor(b) {
    var key = (A.activeBuilding || A.currentBuilding || 'bld') + '|' + (b.list || []).length;
    if (_discCensus && _discCensusKey === key) return _discCensus;
    // §126 — the census must be built the SAME WAY the reveal assigns elements, or the comparison is
    // meaningless. An element whose storey label is a reveal group is counted there; an element whose
    // label is missing or was dropped by §60.1 is counted into the band its OWN center_z falls in,
    // exactly as _perInstanceBands does in the scene. Comparing armed-including-unlabelled against a
    // declared-labels-only census is what produced "ARC 33814/67": a denominator that never included
    // Terminal's 33,406 unlabelled ARC elements at all.
    var byStorey = {}, byBand = [];
    var _names = {};
    (b.list || []).forEach(function (g) {
      _names[g.name] = true;
      (g.absorbs || []).forEach(function (nm) { _names[nm] = true; });
    });
    function _bandOfZ(z) {
      for (var i = 0; i < b.tops.length; i++) if (z < b.tops[i]) return i;
      return b.tops.length - 1;
    }
    try {
      var rows = A.dbQuery("SELECT m.storey, m.discipline, COUNT(*) FROM elements_meta m " +
        "WHERE m.storey IS NOT NULL AND m.discipline IS NOT NULL GROUP BY m.storey, m.discipline") || [];
      rows.forEach(function (r) {
        var st = String(r[0]), d = String(r[1]);
        if (!_names[st]) return;                      // handled by the elevation pass below
        (byStorey[st] || (byStorey[st] = {}))[d] = +r[2] || 0;
      });
      var namesList = Object.keys(_names).map(function (n) { return "'" + n.replace(/'/g, "''") + "'"; }).join(',');
      var rows2 = A.dbQuery("SELECT m.discipline, t.center_z, COUNT(*) FROM elements_meta m " +
        "JOIN element_transforms t ON t.guid=m.guid " +
        "WHERE m.discipline IS NOT NULL AND (m.storey IS NULL OR m.storey NOT IN (" + namesList + ")) " +
        "GROUP BY m.discipline, t.center_z") || [];
      rows2.forEach(function (r) {
        var d = String(r[0]), bi = _bandOfZ(+r[1]), n = +r[2] || 0;
        if (!byBand[bi]) byBand[bi] = {};
        byBand[bi][d] = (byBand[bi][d] || 0) + n;
      });
    } catch (e) { byStorey = {}; byBand = []; }
    // fold the absorbed pseudo storeys (§103) into their host group, same as the bands
    _discCensus = (b.list || []).map(function (g, gi) {
      var agg = {};
      [g.name].concat(g.absorbs || []).forEach(function (nm) {
        var m = byStorey[nm]; if (!m) return;
        Object.keys(m).forEach(function (d) { agg[d] = (agg[d] || 0) + m[d]; });
      });
      var bb = byBand[gi];                                   // §126 — unlabelled, banded by height
      if (bb) Object.keys(bb).forEach(function (d) { agg[d] = (agg[d] || 0) + bb[d]; });
      return agg;
    });
    _discCensusKey = key;
    console.log('§STOREY_DISC_CENSUS ' + _discCensus.map(function (agg, i) {
      return (b.list[i].name) + '{' + Object.keys(agg).sort().map(function (d) {
        return d + ':' + agg[d]; }).join(',') + '}';
    }).join(' ') + ' (§121 — from elements_meta.discipline, the number the ARCH witness checks against)');
    return _discCensus;
  }

  var _hideCount = 0, _hideInstCount = 0, _lastHideGi = null, _roleCount = '';
  // §112 — ROLES, every frame. The role assignment itself only changes on a slot boundary; the
  // per-member sweep gate for multi-band containers has to run every frame, because d moves.
  function _applyRoles(gi, dSlab, dRest) {
    if (!_cutObjs.length) return;
    var roleChanged = (_lastHideGi !== gi);
    if (roleChanged) { _lastHideGi = gi; _hideCount = 0; _hideInstCount = 0; }
    var nRev = 0, nCur = 0, nHid = 0;
    for (var i = 0; i < _cutObjs.length; i++) {
      var e = _cutObjs[i], v = _matVariants && _matVariants.get(e.mat);
      if (e.perInst) {
        // multi-band: always 'revealed' (ceiling only), gated member by member
        if (roleChanged && v && e.o.material !== v.revealed) e.o.material = v.revealed;
        if (e.o.visible !== true) e.o.visible = true;      // §122 — container on, members gate
        var d = e.isSlab ? dSlab : dRest;
        e.dirty = false;
        for (var j = 0; j < e.perInst.length; j++) {
          var bj = e.perInst[j], pj = e.perProj ? e.perProj[j] : null;
          var on;
          if (bj < 0) on = true;
          else if (bj < gi) on = true;                              // already revealed, stays
          else if (bj > gi) on = false;                             // not yet built
          else on = (pj == null) ? true : (pj >= d);                // this slot: the sweep decides
          if (e.instOn == null) e.instOn = [];
          if (e.instOn[j] !== on) { _setInstanceVisible(e, j, on); e.instOn[j] = on; }
          if (!on) _hideInstCount++;
        }
        if (e.dirty && e.o.instanceMatrix) e.o.instanceMatrix.needsUpdate = true;
        nRev++;
        continue;
      }
      if (!roleChanged) continue;
      // §122 — a revealed/current storey is ON, full stop. This used to restore e.vis0, the
      // visibility captured at ARM time, which froze whatever transient state the Time Machine was
      // in on the window's first frame: measured 556 already-revealed objects dark by the last slot
      // on Terminal, growing every slot. vis0 survives only for _clearCut's restore.
      if (e.gi < 0) {                                               // labelled but off the ladder
        if (v && e.o.material !== v.revealed) e.o.material = v.revealed;
        if (e.o.visible !== true) e.o.visible = true;
        nRev++;
      } else if (e.gi < gi) {
        if (v && e.o.material !== v.revealed) e.o.material = v.revealed;
        if (e.o.visible !== true) e.o.visible = true;
        nRev++;
      } else if (e.gi === gi) {
        if (v && e.o.material !== v.current) e.o.material = v.current;
        if (e.o.visible !== true) e.o.visible = true;
        nCur++;
      } else {
        // §113 — a hidden object still gets the ceiling-clipped variant. It is not drawn, so this
        // changes nothing on screen; it means the invariant "everything armed is ceiling-clipped"
        // holds unconditionally, so anything that turns an object back on by some other path
        // (x-ray, a panel filter, the buildup schedule) cannot reintroduce the protrusion leak.
        if (v && e.o.material !== v.revealed) e.o.material = v.revealed;
        if (e.o.visible !== false) e.o.visible = false;
        nHid++; _hideCount++;
      }
    }
    if (roleChanged) _roleCount = 'revealed=' + nRev + ' current=' + nCur + ' hidden=' + nHid;
    if (roleChanged) _witness(gi);
  }

  // §113 WITNESS — the two defects this beat actually had, each expressed as a number that must be
  // zero, computed from the live scene rather than inferred from the slot arithmetic.
  //   A) "2 storeys at once"  — nothing from a band ABOVE the one being revealed may be drawable,
  //      and every armed material in use must carry the CEILING plane (whole-object visibility
  //      cannot clip inside an object, which is what let protrusions through).
  //   B) "the upper storey cut again" — an object's role must be MONOTONE: hidden(0) -> current(1)
  //      -> revealed(2), never backwards. A backwards step IS a second draw.
  function _witness(gi) {
    var aboveVisible = 0, aboveInst = 0, ceilMissing = 0, roleRegress = 0, belowInstOff = 0;
    // §122 PERSISTENCE — a storey that has had its pass must STAY on screen for the rest of the beat.
    // Role monotonicity (§113) does not prove that: an object can hold the `revealed` role and still
    // be invisible, or be cut away by the very ceiling plane that role carries. Three ways it can
    // vanish, each counted from the live scene:
    //   gone     — role says revealed, object.visible is false
    //   wrongMat — wearing something other than its `revealed` variant, so the ceiling is not what
    //              the role thinks it is
    //   ceilCut  — its geometry reaches ABOVE the current ceiling, so the plane clips part of a
    //              storey that was already fully shown
    var persistGone = 0, persistWrongMat = 0, persistCeilCut = 0;
    var _T = window.THREE, _ceilY = _planeCeil ? _planeCeil.constant : null;
    var RANK = { hidden: 0, current: 1, revealed: 2 };
    for (var i = 0; i < _cutObjs.length; i++) {
      var e = _cutObjs[i];
      var role = e.perInst ? 'revealed'
               : (e.gi < 0 || e.gi < gi) ? 'revealed'
               : (e.gi === gi) ? 'current' : 'hidden';
      if (!e.perInst && e.gi > gi && e.o.visible) aboveVisible++;
      var r = RANK[role];
      if (e.rolePrev != null && r < e.rolePrev) roleRegress++;
      e.rolePrev = r;
      var mm = e.o.material;
      if (mm && !Array.isArray(mm)) {
        var pl = mm.clippingPlanes;
        if (!pl || pl.indexOf(_planeCeil) < 0) ceilMissing++;
      }
      // §122 — only objects that have ALREADY had their pass are checked for persistence.
      if (role === 'revealed' && e.gi >= 0 && e.gi < gi) {
        if (!e.o.visible) persistGone++;
        var _v = _matVariants && _matVariants.get(e.mat);
        if (_v && e.o.material !== _v.revealed) persistWrongMat++;
        if (_T && _ceilY != null && e.o.geometry) {
          try {
            if (!e.o.geometry.boundingBox) e.o.geometry.computeBoundingBox();
            var _bb = e.o.geometry.boundingBox;
            if (_bb) {
              e.o.updateWorldMatrix(true, false);
              var _topY = new _T.Vector3(0, _bb.max.y, 0).applyMatrix4(e.o.matrixWorld).y;
              if (_topY > _ceilY + 1e-3) persistCeilCut++;
            }
          } catch (eP) {}
        }
      }
      if (e.perInst && e.instOn) {
        for (var j = 0; j < e.perInst.length; j++) {
          var bj = e.perInst[j];
          if (bj > gi && e.instOn[j]) aboveInst++;
          if (bj >= 0 && bj < gi && !e.instOn[j]) belowInstOff++;
        }
      }
    }
    // persistCeilCut is INFORMATIONAL. The ceiling is monotone — cut.ceilZ is tops[si] and si only
    // advances — so it can never clip something it previously allowed. A tall element straddling two
    // bands is SUPPOSED to arrive in two pieces; counting that as a failure would make the witness
    // unsatisfiable on any building with a double-height space.
    var ok = (aboveVisible === 0 && aboveInst === 0 && ceilMissing === 0 &&
              roleRegress === 0 && belowInstOff === 0 &&
              persistGone === 0 && persistWrongMat === 0);
    console.log('§STOREY_CUT_WITNESS slot=' + gi +
      ' aboveVisible=' + aboveVisible + ' aboveInstVisible=' + aboveInst +
      ' ceilPlaneMissing=' + ceilMissing + ' roleRegressions=' + roleRegress +
      ' revealedInstTurnedOff=' + belowInstOff +
      ' persistGone=' + persistGone + ' persistWrongMat=' + persistWrongMat +
      ' persistCeilCut=' + persistCeilCut + '(informational)' +
      ' => ' + (ok ? 'PASS (nothing above the cut is drawable; every armed material carries the' +
                     ' ceiling; no object or member was drawn twice)'
                   : 'FAIL — above* means two storeys show at once; roleRegressions means' +
                     ' something is drawn twice; persist* means a storey that already had its pass' +
                     ' has stopped being fully drawn (§122)'));
  }

  function _clearCut() {
    if (!_cutArmed) return;
    if (A.renderer) A.renderer.clippingPlanes = [];
    // §112 — _cutMats now holds CLONES only; the originals were never mutated, so there is nothing
    // to undo on them. The clones are disposed below once every object is off them.

    // §105 — every visibility flip and every context clone this module made is undone here. The
    // reveal must leave the scene exactly as it found it: this is the path every bake/preview exit
    // takes, including the throw path.
    var nVis = 0, nInst = 0;
    var nMat = 0;
    _cutObjs.forEach(function (e) {
      if (e.perInst) {                                     // §111 — every member back on
        for (var j = 0; j < e.perInst.length; j++) _setInstanceVisible(e, j, true);
        if (e.o.instanceMatrix) e.o.instanceMatrix.needsUpdate = true;
        e.instOn = null;
        nInst++;
      }
      if (e.mat0 && e.o.material !== e.mat0) { e.o.material = e.mat0; nMat++; }   // §112
      if (e.o.visible !== e.vis0) { e.o.visible = e.vis0; nVis++; }
    });
    // §128.8 EXIT HAND-BACK — the snapshot above undoes only what this module wrote; the scene's
    // visibility then goes back to its OWNERS rather than to whatever this module found at arm time:
    // the discipline/storey filter re-applies its own state to every mesh, instance row and batch
    // slot, and the Time Machine is asked for one full pass on its next tick so the schedule's placed
    // state is re-asserted instead of skipped by its incremental mode. `window.__srReplaySnapshot`
    // keeps the snapshot-only restore for the falsifiability control.
    var _handed = 'snapshotOnly';
    if (!window.__srReplaySnapshot) {
      try {
        if (typeof A._applyDiscVisibility === 'function') { A._applyDiscVisibility(); _handed = 'discFilter'; }
        if (typeof window.tmSetCursor === 'function') { window.__forceFull = true; _handed += '+tmFullPassNextTick'; }
      } catch (eH) { _handed = 'failed:' + (eH && eH.message); }
    }
    A._storeyCutCeilY = null;                                  // §115 — lights unrestricted again
    if (_matVariants) _matVariants.forEach(function (v) {
      try { v.revealed.dispose(); } catch (e1) {}
      try { v.current.dispose(); } catch (e2) {}
    });
    _matVariants = null; _planeCeil = null; _planeSweepSlab = null; _planeSweepRest = null;
    _cutClones.forEach(function (c) { if (c.o.material && c.o.material !== c.m0) { try { c.o.material.dispose(); } catch (eD) {} c.o.material = c.m0; } });
    console.log('§STOREY_CUT_CLEAR materials=' + _cutMats.length + ' visibilityRestored=' + nVis +
      ' perInstanceObjsRestored=' + nInst + ' materialsRestored=' + nMat +
      ' contextClonesReverted=' + _cutClones.length + ' handedBackTo=' + _handed +
      ' paradeWaitFrames=' + _paradeWaitFrames + ' restored');
    _paradeWaitFrames = 0; _paradeWaitLogged = false;
    _restoreWitness();
    _cutMats = []; _cutObjs = []; _cutHidden = []; _cutClones = [];
    _cutSlab = null; _cutRest = null; _cutGlobal = []; _cutArmed = false; _cutAxisLogged = null; _axisLatch = null; _boundsLogged = false; _rakeLogged = null;
  }

  // §128.1c WITNESS B — after the restore, nothing this module armed may be left OFF that the scene's
  // own visibility owners (the discipline filter and the storey filter) would show. Checked per
  // object and per member from the live scene: a whole object off, an instance row at zero scale, a
  // batch slot flagged invisible. Each count must be zero and is printed over its denominator.
  function _restoreWitness() {
    try {
      var expects = function (disc, storey) {
        if (A.hiddenDiscs && typeof A.hiddenDiscs.has === 'function' && disc != null && A.hiddenDiscs.has(disc)) return false;
        if (typeof A._storeyVisible === 'function' && storey != null && !A._storeyVisible(storey)) return false;
        return true;
      };
      var objOff = 0, objDen = 0, rowOff = 0, rowDen = 0, byDisc = {}, tmHeld = 0, guids = [], held = _tmHeld();
      _cutObjs.forEach(function (e) {
        var o = e.o; objDen++;
        var meta = (A._instanceMeta && A._instanceMeta[o.id]) || (A._batchMeta && A._batchMeta[o.id]) || null;
        var anyExpected = false;
        if (o.isInstancedMesh && meta && o.instanceMatrix && o.instanceMatrix.array) {
          var a = o.instanceMatrix.array;
          for (var i = 0; i < meta.length; i++) {
            if (!expects(meta[i].disc, meta[i].storey)) continue;
            if (held && held(meta[i].guid)) { tmHeld++; continue; }
            anyExpected = true; rowDen++;
            if (a[i * 16] === 0 && a[i * 16 + 5] === 0 && a[i * 16 + 10] === 0) { rowOff++; byDisc[meta[i].disc || '?'] = (byDisc[meta[i].disc || '?'] || 0) + 1; if (guids.length < 12) guids.push(String(meta[i].guid) + ':' + (meta[i].disc || '?') + ':' + (meta[i].storey || '?')); }
          }
        } else if (o.isBatchedMesh && meta && typeof o.getVisibleAt === 'function') {
          for (var j = 0; j < meta.length; j++) {
            if (!expects(meta[j].disc, meta[j].storey)) continue;
            if (held && held(meta[j].guid)) { tmHeld++; continue; }
            anyExpected = true; rowDen++;
            var sid = meta[j].slotId != null ? meta[j].slotId : j;
            if (o.getVisibleAt(sid) === false) { rowOff++; byDisc[meta[j].disc || '?'] = (byDisc[meta[j].disc || '?'] || 0) + 1; }
          }
        } else {
          anyExpected = expects(o.userData && o.userData.disc, o.userData && o.userData.storey);
        }
        if (anyExpected && o.visible === false) {
          objOff++;
          var d = (o.userData && o.userData.disc) || (meta && meta[0] && meta[0].disc) || '?';
          byDisc[d] = (byDisc[d] || 0) + 1;
        }
      });
      A._storeyRevealArmed = false;   // §129.51 — armed window closed; the proxy may engage again
      console.log('§STOREY_CUT_RESTORE_WITNESS objsLeftOff=' + objOff + '/' + objDen +
        ' membersLeftOff=' + rowOff + '/' + rowDen + ' heldByTimeMachine=' + tmHeld + (held ? '' : ' (TM inactive)') +
        (guids.length ? ' leftOff=[' + guids.join(' ') + ']' : '') +
        ' byDisc={' + Object.keys(byDisc).sort().map(function (d) { return d + ':' + byDisc[d]; }).join(' ') + '}' +
        ' discRevealKey="' + (A._cpeRevealVisualKey || '') + '"' +
        ' => ' + ((objOff === 0 && rowOff === 0) ? 'PASS (the leg left the scene as its owners want it)'
          : 'FAIL — the restore wrote back a state the scene\'s owners do not hold, and nothing downstream re-asserts it'));
    } catch (eW) { console.log('§STOREY_CUT_RESTORE_WITNESS unavailable: ' + (eW && eW.message)); }
  }

  // EVERY FRAME (unlike storeyRevealApplyVisual, which is key-gated on the slot): the plane constant
  // moves continuously, so this cannot ride the slot key.
  A.storeyRevealApplyCut = function (plan, tNorm) {
    // §129.59 — ONE mode. §108's post-mortem is the reason this guard exists rather than a comment
    // asking callers to be careful: the tint "was still running underneath the section cut" and
    // painted the same storey twice. With the guard here, no caller can produce that state, and
    // `A.storeyRevealApplyCut(null, 0)` still runs its restore path in either mode (below) so a
    // mode flipped mid-session can never strand an armed cut.
    if (STOREY_REVEAL_MODE !== 'cut') {
      if (plan === null) { try { _applyCutInner(null, 0); } catch (eR) {} }   // restore only
      if (!_modeLogged) {
        _modeLogged = true;
        console.log('§STOREY_REVEAL_MODE ' + STOREY_REVEAL_MODE + ' — the section cut stands down;' +
          ' the beat is carried by the whole-storey tint (§129.59, scope=' + STOREY_REVEAL_TINT_SCOPE + ')');
      }
      return;
    }
    try { _applyCutInner(plan, tNorm); } catch (e) {
      if (!_cutFailWarned) {
        _cutFailWarned = true;
        console.log('§STOREY_CUT_FAIL ' + (e && e.message) + ' | stack: ' + String(e && e.stack).split('\n').slice(0, 4).join(' <- '));
      }
      throw e;
    }
  };
  var _cutFailWarned = false;
  function _applyCutInner(plan, tNorm) {
    if (!plan) { _clearCut(); return; }
    var cut = A.storeyRevealCutAt(plan, tNorm);
    if (!cut) { _clearCut(); return; }
    var set = _cutPlanesFor(cut);
    if (!set) return;
    // A change of axis changes the PLANE COUNT and the combine mode, so it must re-arm, not update.
    if (_cutArmed && _cutSlab.length !== set.slab.length) _clearCut();
    if (!_cutArmed) _armCut(set);
    else {
      for (var i = 0; i < set.slab.length; i++) {
        _cutSlab[i].normal.copy(set.slab[i].normal); _cutSlab[i].constant = set.slab[i].constant;
        _cutRest[i].normal.copy(set.rest[i].normal); _cutRest[i].constant = set.rest[i].constant;
      }
    }
    // §112 — the three planes every armed material shares. The ceiling is BACK (it was never
    // optional: it clips WITHIN an object, which visibility cannot do — that is why protrusions were
    // revealed early and then re-swept), and it lives on the materials, not on the renderer's global
    // array, so the background is still untouched.
    var _T2 = window.THREE, _sd = null, _sr = null;
    if (_planeCeil && set.global && set.global.length) {
      _planeCeil.normal.copy(set.global[0].normal); _planeCeil.constant = set.global[0].constant;
    }
    if (_planeSweepSlab && set.slab.length > 1) {
      _planeSweepSlab.normal.copy(set.slab[1].normal); _planeSweepSlab.constant = set.slab[1].constant;
      _sd = -set.slab[1].constant;
    }
    if (_planeSweepRest && set.rest.length > 1) {
      _planeSweepRest.normal.copy(set.rest[1].normal); _planeSweepRest.constant = set.rest[1].constant;
      _sr = -set.rest[1].constant;
    }
    // §115 — publish the ceiling the cut is at, in WORLD y, so the interior-light selection can gate
    // on it (tools.js §STOREY_CUT_LIGHT_GATE). A PointLight is not a mesh and can never be reached by
    // this module's clipping planes or visibility, so the one number is the whole interface.
    A._storeyCutCeilY = cut.ceilZ - (A.modelOffset ? A.modelOffset.z : 0);
    _applyRoles(cut.si != null ? cut.si : cut.idx, _sd, _sr);
    if (_cutLogIdx !== cut.idx) {
      _cutLogIdx = cut.idx;
      // §109 — mark once drawn, and shout if a slot is re-entered out of order.
      if (_drawn && cut.idx < _drawn.length) {
        if (_drawn[cut.idx] && _drawnOrder[_drawnOrder.length - 1] !== cut.idx) {
          console.log('§STOREY_REVEAL_REDRAW slot=' + cut.idx + ' storey="' + cut.storey +
            '" order=[' + _drawnOrder.join(',') + '] — this slot has already been drawn once and is' +
            ' being swept AGAIN; the reveal must be one arrival per group (§97.4)');
        }
        _drawn[cut.idx] = true;
        if (_drawnOrder[_drawnOrder.length - 1] !== cut.idx) _drawnOrder.push(cut.idx);
      }
      console.log('§STOREY_CUT storey="' + cut.storey + '" slot=' + (cut.idx + 1) + '/' + cut.n +
        ' cutZ=' + cut.cutZ.toFixed(2) + ' phase=' + cut.phase +
        ' slotSec=' + (cut.slotSec || 0).toFixed(2) + ' sweepSec=' + (cut.sweepSec || 0).toFixed(2) +
        ' roles(' + _roleCount + ') of ' + _cutObjs.length +
        ' instancesHiddenAbove=' + _hideInstCount +
        ' slabK=' + cut.slabK.toFixed(2) + ' restK=' + cut.restK.toFixed(2) +
        (cut.isGroundSlab ? ' GROUND_SLAB_PASS(§106)' : '') +
        ' (boundary=midpoint of adjacent AVG(center_z) — a labelled slab-level ESTIMATE, §94.2)');
    }
  }

  // §129.59 — published so W-STOREY-TINT-SCOPE can judge the REAL selection predicate in node
  // instead of re-implementing it in the test (the project's own witness rule: slice the predicate,
  // do not restate it). Same read-only test-seam convention as A._loadPathStackWitness /
  // A._loadPathRevealStackStep in cpe_load_path.js. Nothing in the film calls these.
  A.storeyRevealTintFor = _applyTint;
  A.storeyRevealTintRestore = _restoreTint;
  A.storeyRevealMode = function () { return { mode: STOREY_REVEAL_MODE, scope: STOREY_REVEAL_TINT_SCOPE, tint: STOREY_REVEAL_TINT }; };
  A.storeyRevealApplyVisual = function (plan, tNorm) {
    if (typeof tNorm === 'number') _lastTn = tNorm;   // §STOREY_REVEAL_TINT_RESTORE — stamped before any early return below
    // plan===null is the FORCED restore (every bake/preview exit path, including the throw path).
    // It must run unconditionally: by the time it arrives the film has normally already left the
    // window, so _curIdx is null and the key check below would return early — leaving the clash
    // markers hidden for the NEXT bake. Restore first, then fall through to the normal no-op.
    // §129.51 — the forced-restore path must clear the armed flag too, or a bake that exits
    // through it (including the throw path this comment describes) leaves the DLOD proxy
    // permanently stood down for the rest of the session. Failing that way is safe rather
    // than wrong — no proxy means the correct picture, just slower — but it is still a leak.
    if (!plan) { A._storeyRevealArmed = false; _restoreTint(); _curIdx = null; _restoreMarkers(); return; }
    // §129.51b (2026-09-19) — SET THE STAND-DOWN FLAG AHEAD OF THE WINDOW, not at arm.
    // red1: "your fix was in there?" It was, and it was too late. §129.51 raised the flag inside
    // _armBaselineWitness(), which REPORTS the baseline after the arm loop has already walked the
    // scene — so the proxy stood down only after the poisoned snapshot was taken. Worse, even the
    // top of the arm would be too late: the rows are still zero-scaled at that instant, and the
    // Time Machine needs a tick or more to write them back once the proxy lets go.
    // So the flag goes up LEAD ahead of the window's own start (b.rise - windowFrac, the same
    // arithmetic storeyRevealVisualAt uses), giving the TM many ticks to restore before the arm
    // reads anything. 2% of the film is ~56 frames at 10fps on Hospital — generous on purpose,
    // and it costs only the proxy's help over those frames, which is the pull-back's tail where
    // the camera is already backing off.
    // It is also self-healing: computed from (plan, tNorm) every frame, so it cannot be left
    // stranded true by an exit path the way a set-once flag can.
    try {
      var _srB = plan.beats, _srS = plan.storeyReveal;
      if (_srB && _srS && _srS.on && _srS.windowFrac > 0 && _srB.rise > 0 && _srB.rise < 1) {
        var _srWin = _srB.rise - _srS.windowFrac, _srLead = 0.02;
        A._storeyRevealArmed = (tNorm != null && tNorm >= _srWin - _srLead && tNorm <= _srB.rise);
        // ══ §FINDINGS_HUD_CLEAR — the Sanity chips and clash labels stand down for the rest of
        // the film, from two seconds before the storey reveal opens ══════════════════════════
        // red1, 2026-09-20: "the other overlays have to cease. Their work is sufficient and allowed
        // full focus" — then, naming them: "I meant the Sanity and clashes" — then "give 2 more
        // secs back to see other overlays going off".
        // THE LEAD IS IN SECONDS, NOT A FILM FRACTION, because what he asked for is a viewing
        // moment: two seconds where the frame has visibly cleared BEFORE the beat's own content
        // arrives, so the clearing reads as something that happened rather than as a cut. A
        // fraction would be 2 s on this film and 6 s on a three-times-longer one.
        // NO UPPER BOUND, on purpose. `_storeyRevealArmed` ends at beats.rise, and the escape
        // route's own window does not open until 0.9651 — gating on the two flags separately would
        // flash every chip back on for the ~1.2 s between them. From the reveal to the end of the
        // film is one continuous beat as far as this signage is concerned.
        // Computed from (plan, tNorm) every frame like the flag above, so it is self-healing and
        // cannot be left stranded true by an exit path the way a latch can.
        var _clearLead = (plan.durationSec > 0) ? (FINDINGS_CLEAR_LEAD_SEC / plan.durationSec) : 0.01;
        A._findingsHudSuppress = (tNorm != null && tNorm >= _srWin - _clearLead);
      } else {
        A._storeyRevealArmed = false;
        // ── NO STOREY REVEAL, SO NO ONSET TO CEASE AT — a bounded tail instead ──
        // red1: "IF the storey reveal check is not on, the M/C/S overlays may linger at most 2 s,
        // no more for graceful ending."
        // Without a reveal there is no beat whose start says "their work is sufficient", so the
        // bound is the closing ORBIT's own start plus that tail. Same rule, same seconds-not-
        // fractions reasoning as the lead above, and it exists in code rather than being true by
        // accident on a film that happens to have the reveal switched on.
        var _orbit = _srB && _srB.rise;
        A._findingsHudSuppress = !!(_orbit > 0 && _orbit < 1 && tNorm != null && plan.durationSec > 0 &&
          tNorm >= _orbit + (FINDINGS_OFF_TAIL_SEC / plan.durationSec));
      }
    } catch (eSA) { A._storeyRevealArmed = false; A._findingsHudSuppress = false; }
    var vis = A.storeyRevealVisualAt(plan, tNorm);
    // A dark slot keeps its own key so the tint is actually taken DOWN between storeys (the "cease").
    // The last storey never reports dark (§STOREY_REVEAL_LAST_STAYS_LIT), so this key never flips to
    // its 'd' form for it — the tint rides to the window's end instead of ceasing.
    var key = vis ? (vis.idx + (vis.dark ? 'd' : 'l')) : null;
    if (key === _curIdx) return;
    _restoreTint();
    _curIdx = key;
    // §108 (user, 2026-09-13: "Why is there lingering blue tint? Remove any stale effects") — the
    // TINT AND THE MARKER HIDE ARE BOTH DEAD and were still running underneath the section cut.
    // COLORS[0] is 0x2979ff, so every slot was still painting its storey's facade subset blue over
    // a beat whose whole mechanism is now geometric; and because the ground-slab pass and Level 1's
    // pass are both slots on the SAME storey, that storey got tinted twice in a row, which is the
    // "2nd floor got drawn twice" report — one cause, two symptoms. Both contradict the locked
    // verdict this file's preamble carries: "no tint, no fade, no darkening, no lit edge, no rake,
    // clash/Sanity layers stay on". _restoreTint() above STAYS — it is the restore path for any
    // tint a previous build left applied, and it is a no-op when nothing is touched.
    if (vis && STOREY_REVEAL_TINT) {
      _hideMarkers();
      if (!vis.dark) _applyTint(vis.storey, vis.color);
    }
    // vis===null but plan truthy: the film simply moved on to the orbit. No action needed — the
    // tint block above already restored on its own key change, and markers intentionally STAY
    // hidden (only the forced-restore path above un-hides them) — that is the whole point of
    // §STOREY_REVEAL_MARKERS_OFF: once hidden, they stay hidden for the rest of the film.
  };
}
if (typeof window !== 'undefined') window.setupCpeStoreyReveal = setupCpeStoreyReveal;
// Dual-mode, same convention rule_findings_film.js already uses — lets witness_storey_reveal_list.js
// exercise A.storeyRevealList against a real in-memory sql.js DB in Node. The browser path is
// unchanged: `window.setupCpeStoreyReveal` above is still what viewer/main.js loads.
if (typeof module !== 'undefined' && module.exports) module.exports = setupCpeStoreyReveal;
