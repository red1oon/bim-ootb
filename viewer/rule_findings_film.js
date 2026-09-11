/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * rule_findings_film.js — §59 (bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md): bakes Structural
 * Sanity + Egress findings into the film, riding the Measure checkbox alongside the other 5 Build/
 * At(filmSeconds) module pairs cinema_maxq.js already gates on `_measure`.
 *
 * ZERO DUPLICATED RULE LOGIC — calls StructuralSanity.evaluate()/EgressSanity.evaluate(), the SAME
 * evaluators the Alt-C Sanity/Egress panels use (viewer/rule_checklist.js A.showStructuralSanity/
 * A.showEgressSanity). This file only decides WHEN/WHERE to show a finding in the film, never what
 * counts as one.
 *
 * SCHEDULING — rides the EXISTING storey-reveal window (cpe_storey_reveal.js), not a new dive-through
 * beat: each storey already owns a real, computed on-screen slot (`plan.storeyReveal.windowFrac *
 * plan.durationSec / storeys-shown`) during the closing reveal sequence. A finding is only scheduled
 * into a storey whose OWN real slot duration is >= ENV_SPAN (2.2s, this project's own established
 * "one cue's readable dwell" span — §14, shared by every other Measure beat, not invented here) —
 * this satisfies the "chase only clear opportunities, that can stay for >2s" requirement by real
 * per-storey arithmetic, never a guessed dwell number.
 *
 * ONE-OF-EACH — if both Structural and Egress have at least one finding anywhere, both get a slot
 * (preferring two DIFFERENT storeys so their Measure-box postings don't collide in the same frame;
 * falls back to sharing one storey only if it is the sole eligible one). A category with zero real
 * findings gets no slot and no card — vacuous, never faked.
 *
 * VISUAL — static solid colour, never pulsing (see §59.4's own rationale: no existing "rapid pulse"
 * rate to extract from this codebase, and the user offered static as an explicitly sufficient
 * fallback). CATEGORY_COLOR reuses rule_checklist.js's own severity hexes on a different axis
 * (category, not severity) rather than inventing new swatches.
 */
function setupRuleFindingsFilm(A) {
  if (!A) return;

  var ENV_SPAN = 2.2;                 // §14 — same "readable dwell" every other Measure cue uses
  var MIN_SLOT_SEC = 1.0;             // MUST match cpe_storey_reveal.js's own _fitList truncation floor
  var STEP_M = 0.75;                  // external ergonomic convention (no codebase precedent) — labelled as an estimate, never presented as measured
  // §68 — egress was #cc4444 (rule_checklist's CRITICAL hex). Measured: it fails WCAG 4.5 against the
  // HUD plate at EVERY alpha up to 0.90, so it can never be made legible by darkening the plate.
  // #e57373 is the same red family, lighter, and clears 4.5 with margin. Structural #ffaa33 passes
  // unchanged. The interactive Rule panel keeps #cc4444 — different surface, not this change.
  // §73.2 §HUD_MEDIA_SCHEMA — four identities that separate at a glance. Clash owns red and blue
  // (clash_labels.js:93 COL_A rgb(255,133,129), COL_B light blue) and they are not this feature's to
  // move. §68's egress #e57373 = rgb(229,115,115) was THE SAME SALMON as clash's A-side — chosen on
  // contrast maths alone, never checked against the palette already on screen, so a Safety finding
  // read as a clash element. Amber for structural (load/caution, far from clash red); magenta for
  // safety, deliberately NOT red. #d500f9 was CHOSEN BY MEASUREMENT, not taste: of ten candidates
  // it maximises the minimum CIE-Lab dE to everything already on screen (clash A, clash B, structural
  // amber, scene green) at dE 60+. The old #e57373 scored 8.1 against clash A — perceptually the
  // same colour, which is exactly why nothing separated at a glance.
  var CATEGORY_COLOR = { structural: '#ffb300', egress: '#ea80fc' };
  var SEV_RANK = { CRITICAL: 2, WARNING: 1 };

  // ── §RULE_FILM_CLASH_MODEL (MEP_CLASH_REVEAL_MOVIE.md §70, 2026-09-11) ─────────────────────────
  // User: "Isn't it supposed to appear during movie similar to clash?" It is. §59.3 tied findings to
  // the storey-reveal window only to avoid building a screen-time metric, and that one shortcut
  // caused the 2-finding cap, §59.8's NOFIT and §60.5's caption/tint mismatch. These four constants
  // are clash_labels.js's OWN values, reused verbatim rather than a second ranking scheme invented
  // here — including the clutter tradeoff the user already accepted for clash in §P2.1.
  // ── §77 §RULE_FILM_SET_PULSE ────────────────────────────────────────────────────────────────────
  // The unit is the SET (one rule's flagged elements), not the element. 509 Hospital findings are six
  // rules; 215 HHS findings are three. §70's per-element labels repeated the same handful of sentences
  // hundreds of times — which is why the film read as spam. §70's TOP_N/RANK_MARGIN_M ranking, §71's
  // visible-first pass, §73.4/§74's TTL ageing and §72's Measure echo are RETIRED with it: all of them
  // managed crowding that one-box-per-rule does not create.
  var DWELL_MIN_S = 2.0;       // §77.2 — a newly-visible member must stay this long to trigger a pulse
  // §78 (user: "Hope the pulse out is dramatic, not pops, but wave out, remaining in pulse, before
  // fade out"). Four phases, not two. The first cut faded each member as soon as the front passed it,
  // so the near end was dark before the far end lit — a travelling blip, not a wave. Now the wave
  // FILLS the set outward, everything it has reached HOLDS lit, and then the whole set releases
  // together. That is what makes it read as one body of findings rather than scattered flickers.
  var WAVE_S = 1.4;            // front travel time, nearest member to farthest
  var ATTACK_S = 0.18;         // per-member ramp up as the front arrives — a swell, not a switch
  var HOLD_S = 1.2;            // the whole set stays lit after the front completes
  // §79 (user: "the release should also directional wave out, so the optics gives cognition") — the
  // release TRAVELS too, near member letting go first, far last, on the same axis as the fill. A
  // simultaneous fade threw the direction away at the end and left the eye with only half a motion;
  // two directional fronts, in and out, is what makes the depth legible rather than decorative.
  var RELEASE_S = 0.9;         // travel time of the release front, nearest to farthest
  var FADE_OUT_S = 0.6;        // each member's own fade once the release front reaches it
  var PULSE_S = WAVE_S + HOLD_S + RELEASE_S + FADE_OUT_S;
  var BOX_LINGER_S = 2.0;      // §77.2 — the box stays this long after the wave ends
  // ── §82 §RULE_FILM_SET_QUEUE ────────────────────────────────────────────────────────────────────
  // Baking a THIRD building found the defect §77 did not anticipate: nothing capped how many SETS
  // pulse at once. `Terminal_silent.db` is the first model where all eight rules fire, and it put
  // 7-8 set boxes on screen for 29 of ~53 seconds — §77 cut hundreds of per-element labels down to a
  // handful of set boxes and then hit crowding again from the other direction. HHS never exceeded 2
  // sets and Hospital 6, so this could not appear until an unfamiliar building was baked on purpose.
  // The user's fix, verbatim: "it is simply a matter of sequencing what comes on the scene, require a
  // simple routine of which can be delayed to later or if all seems equal appearance slots, just
  // stagger along consecutively with a 5 sec slot each. This is for earnest effort, some maybe missed."
  // EARNEST EFFORT, NOT A GUARANTEE — a set whose members never come back into frame is simply never
  // shown. The camera is never bent and no shot is held to fit a set in, and nothing is hidden by the
  // omission: the closing cards (cpe_resource_panel.js:342) carry every set's total from the build-time
  // evaluation, so the film under-SHOWS without ever under-REPORTING.
  var SET_SLOT_S = 5.0;        // §82.1 the user's own number; §82.2 — one 4.1s pulse with room to breathe
  var DWELL_SAMPLE_S = 0.25;   // §77.3 — pose sampling step for the exact dwell precompute
  var FOV_DEG = 60;            // viewer/scene.js:139 — the bake's own fov, read not guessed
  var LABEL_PLATE = 'rgba(0,0,0,0.45)';   // §73.3 — same family as the cam-path box (cpe_path_overview.js:208)
  var EDGE_BAR_PX = 3;         // §73.2 — category edge bar: a SHAPE cue, since hue alone is unreliable

  // ── §RULE_FILM_MESSAGING (MEP_CLASH_REVEAL_MOVIE.md §63, 2026-09-11) ───────────────────────────
  // §63.1 `ratio` is an OVERLOADED field on the evaluator rows: metres for door_clear_width
  // (egress_sanity.js:80) and circulation_distance (:116), a real dimensionless ratio for
  // span_depth_* (structural_sanity.js:219). Printing 'ratio N' for all three told the viewer
  // "ratio 0.8" about a door that is 0.80 m wide. The unit is already declared by the RULE
  // DEFINITION — warning_m/critical_m vs warning_ratio/critical_ratio — so read it from there;
  // never keep a hardcoded list of rule names, and never guess a unit that isn't declared.
  function valueRow(ruleDef, ratio, severity) {
    if (ratio == null) return severity;              // §63.1 — the box ink is CATEGORY, not severity,
                                                     // so this is the only place severity is stated
    if (!ruleDef) return String(ratio);
    if (ruleDef.warning_m != null || ruleDef.critical_m != null) return ratio.toFixed(2) + ' m';
    if (ruleDef.warning_ratio != null || ruleDef.critical_ratio != null) return 'ratio ' + ratio.toFixed(1);
    return String(ratio);                            // declared neither — bare number, NO unit word
  }
  // §63.2 element_name follows Revit's `family:type:type:id` export convention — 5,303 of 6,880 rows
  // in HHS match `%:%:%:%`. Drop a segment identical to the one before it, and a trailing all-digits
  // id; join with ' · '. Deterministic, no lookup table, and lossless for identity — the guid is on
  // the pick and in the log. A name with no ':' comes back unchanged.
  function shortName(name) {
    if (!name) return '';
    var seg = String(name).split(':'), out = [];
    for (var i = 0; i < seg.length; i++) {
      var last = i === seg.length - 1;
      if (last && out.length && /^\d+$/.test(seg[i])) continue;
      if (out.length && seg[i] === out[out.length - 1]) continue;
      out.push(seg[i]);
    }
    return out.length ? out.join(' · ') : String(name);
  }

  // Copied verbatim from rule_checklist.js's own hardcoded fallbacks (never invented numbers) — used
  // only when the live fetch fails, same discipline A.showStructuralSanity/A.showEgressSanity apply.
  var STRUCTURAL_RULES_FALLBACK = {
    structural_rules: [
      { name: 'floating_member', applies_to: ['IfcBeam'], tolerance_m: 0.15, framing_dz_m: 0.4 },
      { name: 'span_depth_steel', applies_to: ['IfcBeam'], material: 'steel',
        name_hints: ['UB', 'UC', 'Channel', 'HSS'], cantilever: false,
        warning_ratio: 24, critical_ratio: 30, max_severity: 'WARNING' },
      { name: 'span_depth_concrete', applies_to: ['IfcBeam'], material: 'concrete',
        name_hints: ['Concrete', 'RC'], cantilever: false,
        warning_ratio: 20, critical_ratio: 26, max_severity: 'WARNING' },
      { name: 'span_depth_cantilever', applies_to: ['IfcBeam'], cantilever: true,
        warning_ratio: 12, critical_ratio: 16, max_severity: 'WARNING' },
      { name: 'column_continuity', applies_to: ['IfcColumn'], tolerance_m: 0.3 }
    ]
  };
  var EGRESS_RULES_FALLBACK = {
    egress_rules: [
      { name: 'door_clear_width', applies_to: ['IfcDoor'],
        warning_m: 0.85, critical_m: 0.80, max_severity: 'WARNING' },
      { name: 'circulation_distance', applies_to: ['room_graph_node'],
        target: 'exit_or_own_storey_circ', warning_m: 30, critical_m: 45, max_severity: 'WARNING' },
      { name: 'isolated_room', applies_to: ['room_graph_node'], target: 'own_storey_circ' }
    ]
  };

  var _built = false, _report = null, _picks = [], _stats = null;
  var _sets = [], _lastFilmS = null, _lastLog = -1;   // §77 — one entry per RULE, not per element
  // §82 — exactly one set holds the scene; the rest wait their turn in `_queue`, never dropped.
  var _queue = [], _active = null, _exitStatLogged = false, _hudReserveLogged = false;
  // §82 vs §78.3 — THE SLOT ONLY EXPIRES WHEN SOMEONE IS ACTUALLY WAITING. Queueing exists to cut
  // crowding, and with an empty queue there is no crowding to cut; §78.3's held box is a direct user
  // instruction ("Keeping the same box until end of pulsing helps eyeballing it well"). So a lone set
  // keeps the scene and behaves exactly as it did before §82 — P8 is unchanged, not weakened.
  function _anyWaitingVisible(byRuleFrame) {
    for (var i = 0; i < _queue.length; i++) {
      var f = byRuleFrame[_queue[i].rule];
      if (f && f.vis.length) return true;
    }
    return false;
  }
  // §82.1 — order by OPPORTUNITY where there is one to judge: the set whose members leave frame
  // soonest goes FIRST, because the one with a long dwell can still be shown later. §77.3's exact
  // dwell (from plan.poseAt, known before rendering) is what makes that a judgement rather than a
  // guess. "When they look equal, just take turns" — ties fall back to the order they queued in, and
  // each then holds one consecutive SET_SLOT_S slot. No cleverness.
  // A queued set with nothing on screen right now is SKIPPED, never discarded (§82 Q2): it keeps its
  // place and takes the next free slot it is visible for. If it never returns it is never shown, and
  // that is the accepted cost (§82 Q5).
  function _takeNextSet(byRuleFrame) {
    var best = -1, bestDwell = Infinity, bestQ = Infinity;
    for (var i = 0; i < _queue.length; i++) {
      var f = byRuleFrame[_queue[i].rule];
      if (!f || !f.vis.length) continue;
      var d = f.dwell, q = _queue[i]._queuedAt;
      if (d < bestDwell - 1e-6 || (Math.abs(d - bestDwell) <= 1e-6 && q < bestQ)) { best = i; bestDwell = d; bestQ = q; }
    }
    if (best < 0) return null;
    var st = _queue.splice(best, 1)[0];
    st._queued = false;
    return st;
  }

  // ── §77.3 EXACT DWELL, only possible in a bake ─────────────────────────────────────────────────
  // The whole camera path exists before the first frame renders (plan.poseAt(tNorm), the same
  // function cinema_maxq.js:1202 drives the bake with), so "will this member stay in frame 2 seconds?"
  // is a LOOKUP, not an estimate. Sample the path, frustum-test every marked element at each sample,
  // and keep each element's visible intervals. A live viewer could not do this; the film can.
  // Cost is one pass at build: 509 elements x ~780 samples is a few hundred thousand dot products.
  function _visibleIntervals(plan, durationSec, at, guids) {
    var out = {}, i, g;
    for (i = 0; i < guids.length; i++) out[guids[i]] = [];
    if (!plan || typeof plan.poseAt !== 'function' || !(durationSec > 0)) return out;
    var halfFov = (FOV_DEG * Math.PI / 180) / 2;
    var cosLimit = Math.cos(Math.min(1.45, halfFov * 1.35));   // widened for aspect; conservative
    var nSteps = Math.max(2, Math.ceil(durationSec / DWELL_SAMPLE_S));
    var openAt = {};
    for (var sIdx = 0; sIdx <= nSteps; sIdx++) {
      var tSec = Math.min(durationSec, sIdx * DWELL_SAMPLE_S);
      var pose;
      try { pose = plan.poseAt(tSec / durationSec); } catch (e) { return out; }
      if (!pose) continue;
      var fx = pose.tx - pose.x, fy = pose.ty - pose.y, fz = pose.tz - pose.z;
      var fl = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
      fx /= fl; fy /= fl; fz /= fl;
      for (i = 0; i < guids.length; i++) {
        g = guids[i];
        var pt = at[g]; if (!pt) continue;
        var dx = pt.x - pose.x, dy = pt.y - pose.y, dz = pt.z - pose.z;
        var dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        var vis = ((dx * fx + dy * fy + dz * fz) / dl) >= cosLimit;
        if (vis && openAt[g] === undefined) openAt[g] = tSec;
        else if (!vis && openAt[g] !== undefined) { out[g].push([openAt[g], tSec]); delete openAt[g]; }
      }
    }
    for (g in openAt) out[g].push([openAt[g], durationSec]);
    return out;
  }
  // How long g stays continuously visible from tSec on — 0 if not visible at tSec.
  function _dwellFrom(iv, tSec) {
    var a = iv || [];
    for (var k = 0; k < a.length; k++) if (tSec >= a[k][0] && tSec < a[k][1]) return a[k][1] - tSec;
    return 0;
  }
  var _shown = null, _retired = null, _resets = 0;   // §73.4 — per-mark time on screen, and its turn
  function log(s) { console.log(s); }

  function fetchRules(url, fallback) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).catch(function (e) {
      log('§RULE_FILM_RULES_JSON loaded=fallback source=' + url + ' error=' + e.message);
      return fallback;
    });
  }

  function bestPerStorey(rows) {
    var by = {};
    rows.forEach(function (r) {
      var cur = by[r.storey];
      if (!cur || (SEV_RANK[r.severity] || 0) > (SEV_RANK[cur.severity] || 0)) by[r.storey] = r;
    });
    return by;
  }

  A.ruleFindingsFilmBuild = function (dbQuery, plan) {
    if (_built) return Promise.resolve(_report);
    _built = true;
    _report = { state: 'INCONCLUSIVE', why: null, picks: [] };
    function fail(state, why) {
      _report.state = state; _report.why = why;
      log('§RULE_FILM ' + state + ' — ' + why);
      _stats = { built: false };
      return Promise.resolve(_report);
    }
    if (typeof dbQuery !== 'function') return fail('INCONCLUSIVE', 'no dbQuery');
    // §70 — the storey-reveal window is NO LONGER consulted. Findings are world content for the whole
    // film (clash's model), so a plan without a storey-reveal lane is not a failure any more.
    if (typeof StructuralSanity === 'undefined' && typeof EgressSanity === 'undefined') {
      return fail('INCONCLUSIVE', 'neither StructuralSanity nor EgressSanity is loaded');
    }


    function go(structRules, egressRules) {
      var rowsS = [], rowsE = [];
      try { if (typeof StructuralSanity !== 'undefined') rowsS = StructuralSanity.evaluate(dbQuery, structRules, { log: log }) || []; }
      catch (e) { log('§RULE_FILM_STRUCT_ERR ' + e.message); }
      try { if (typeof EgressSanity !== 'undefined') rowsE = EgressSanity.evaluate(dbQuery, egressRules, { log: log }) || []; }
      catch (e) { log('§RULE_FILM_EGRESS_ERR ' + e.message); }

      // §63.1 — the unit comes from the rule definitions actually passed to the evaluators above,
      // so a fetched rules file and the fallback behave identically and cannot drift apart.
      var _ruleDefs = {};
      ((structRules && structRules.structural_rules) || []).forEach(function (r) { _ruleDefs[r.name] = r; });
      ((egressRules && egressRules.egress_rules) || []).forEach(function (r) { _ruleDefs[r.name] = r; });

      // §77 — group by RULE into SETS. One box per set, never one per element.
      var allRows = rowsS.map(function (r) { return { row: r, category: 'structural' }; })
        .concat(rowsE.map(function (r) { return { row: r, category: 'egress' }; }));
      var byRule = {}, ruleOrder = [];
      allRows.forEach(function (m) {
        var k = m.row.rule;
        if (!byRule[k]) { byRule[k] = { rule: k, category: m.category, members: [] }; ruleOrder.push(k); }
        byRule[k].members.push(m.row);
      });
      // §59 user addition — the Safety card's own "longest distance to exit" stat, real graph-
      // measured metres (RoomGraph.escapeRoute()/shortestPath(), egress_sanity.js's own `ratio`),
      // never a fabricated figure. Independent of which storey got the BEAT above.
      var maxDist = null;
      rowsE.forEach(function (r) { if (r.rule === 'circulation_distance' && r.ratio != null && (maxDist == null || r.ratio > maxDist)) maxDist = r.ratio; });
      // §84 §SANITY_EXIT_STAT — ONE conversion, read by both the closing card (_stats below) and the
      // in-film box. §84.4: `0.75` and this rounding already exist a second time in rule_checklist.js
      // on feat/structural-sanity (PR #1715); do not add a THIRD expression of it here. When that
      // branch merges, extract one helper and have all three surfaces call it (§65).
      var maxSteps = maxDist != null ? Math.round(maxDist / STEP_M) : null;
      _sets = ruleOrder.map(function (k) {
        var st = byRule[k];
        st.ink = CATEGORY_COLOR[st.category];
        st.title = (st.category === 'structural' ? 'Structural — ' : 'Safety — ') + k.replace(/_/g, ' ');
        // §77.2 — the box states the set TOTAL outright, not the visible share. The user's ruling:
        // "a grasp of total outright is more important than to await whole film revealing the total."
        st.total = st.members.length;
        st.rows = [st.total + ' flagged', st.members.length === 1 ? shortName(st.members[0].name) : ''];
        // §84 §SANITY_EXIT_STAT (user: "the main BIM View session has taken on the 'Longest path to
        // exit - ## steps' which originated in specs here, so put that in also for next task when
        // Sanity HUD is flashing messages"). §84.2 — ONLY on circulation_distance: that rule owns the
        // number (the worst `ratio` across its own rows). On any other set's box it would be a true
        // number attached to the wrong finding. A LINE, never a ninth box — §82 has just cut the box
        // count from 8 to 2 and a new box would hand that straight back.
        // §84.1 — the live panel's wording verbatim (rule_checklist.js `_rcShowLongestExitStatus`,
        // feat/structural-sanity), NOT the closing card's richer seconds/metres form. The card is a
        // held still; this box flashes for one 5s slot on a moving frame. §73.0 ruled that axis
        // already: a film is not a web page. The user kept the card rich and this short.
        // §84.3 — the `~` is MANDATORY: STEP_M has no precedent in this codebase (see the file
        // header), so dropping it would state an estimate as a measurement. Null — never "0 steps" —
        // when no circulation_distance row exists, same contract both other surfaces hold.
        st.exitLine = (k === 'circulation_distance' && maxSteps != null)
          ? 'Longest path to exit — ~' + maxSteps + ' steps' : null;
        st.guids = st.members.map(function (r) { return r.guid; });
        st.pulseStart = -Infinity; st.seen = {};
        st.slotStart = -Infinity; st.slotEndSec = null; st._queued = false; st._queuedAt = 0;   // §82
        return st;
      }).filter(function (st) { return st.total > 0; });
      _queue = []; _active = null; _exitStatLogged = false; _hudReserveLogged = false;   // §82/§84/§85 — a rebuild starts the queue empty
      _picks = _sets;   // stats + the closing cards read this


      _report.state = _picks.length ? 'BEAT' : 'VACUOUS';
      _report.picks = _picks;
      _stats = {
        built: true,
        structuralTotal: rowsS.length, egressTotal: rowsE.length,
        structuralPicked: rowsS.length > 0, egressPicked: rowsE.length > 0,   // §70 — all findings marked, not one per storey
        maxExitDistM: maxDist,
        // A.WALK_SPEED (config.js) is an EXISTING constant, currently used for tour-camera pacing —
        // repurposed here for a time estimate, not invented. STEP_M has no codebase precedent (see
        // file header) and is reported as an estimate, never a measured fact.
        maxExitDistSec: maxDist != null ? maxDist / (A.WALK_SPEED || 1.2) : null,
        maxExitDistSteps: maxSteps                                   // §84.4 — one conversion, shared
      };
      log('§RULE_FILM sets=' + _sets.length + ' marked=' + allRows.length + ' structuralTotal=' + rowsS.length + ' egressTotal=' + rowsE.length +
          ' bothCategories=' + (rowsS.length && rowsE.length ? 'yes' : 'no') +
          (maxDist != null ? ' maxExitDistM=' + maxDist.toFixed(1) : ' maxExitDistM=none') +
          ' exitStat=' + (maxSteps != null ? '~' + maxSteps + ' steps' : 'none — no circulation_distance row (§84.3: dropped, never "0 steps")') +
          ' — §77: one box per rule; ' + _sets.map(function (t) { return t.rule + '=' + t.total; }).join(' '));

      // §70 — the 3-D wireframe tint now covers EVERY finding, not 1-2. Cost is one InstancedMesh per
      // colour regardless of count (rule_checklist.js), so 509 markers cost what 2 did. Still static,
      // never animated: §59.4's "one attention-getter, everything else static" applies to motion, and
      // the per-frame LABEL ranking below is what now decides where attention goes.
      if (_sets.length && typeof A.showRuleModeTint === 'function') {
        var guidCat = {};
        _sets.forEach(function (st) { st.guids.forEach(function (g) { guidCat[g] = st.category; }); });
        try { A.showRuleModeTint(guidCat, CATEGORY_COLOR, { shineThrough: true, filled: true }); }   // §62
        catch (e) { log('§RULE_FILM_TINT_ERR ' + e.message); }
        // §77.3 — precompute every member's visible intervals from the plan's own camera path.
        var _at = A._ruleTintAt || {};
        var _dur = (plan && plan.durationSec) || 0;
        var _allGuids = [];
        _sets.forEach(function (st) { st.guids.forEach(function (g) { if (_at[g]) _allGuids.push(g); }); });
        var _t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
        var _iv = _visibleIntervals(plan, _dur, _at, _allGuids);
        _sets.forEach(function (st) { st.iv = _iv; });
        var _withAny = _allGuids.filter(function (g) { return (_iv[g] || []).length; }).length;
        log('§RULE_FILM_DWELL members=' + _allGuids.length + ' everVisible=' + _withAny +
            ' sampleStep=' + DWELL_SAMPLE_S + 's durationSec=' + _dur.toFixed(1) +
            ' ms=' + (((typeof performance !== 'undefined' && performance.now) ? performance.now() : 0) - _t0).toFixed(0) +
            ' — exact, from plan.poseAt (§77.3)');
      }
      return _report;
    }

    return Promise.all([
      fetchRules('rates/structural_rules.json', STRUCTURAL_RULES_FALLBACK),
      fetchRules('rates/egress_rules.json', EGRESS_RULES_FALLBACK)
    ]).then(function (r) {
      // RoomGraph lazy-load, same convention A.showEgressSanity uses (viewer/rule_checklist.js).
      // `window` itself may not exist here (a Node witness constructs A directly, no DOM) — guarded,
      // not assumed, same defensiveness egress_sanity.js's own dual Node/browser require applies.
      var hasWindow = typeof window !== 'undefined';
      if ((hasWindow && window.RoomGraph) || !A.loadNavigate) return go(r[0], r[1]);
      return A.loadNavigate().then(function () { return go(r[0], r[1]); })
        .catch(function (e) { log('§RULE_FILM_ROOMGRAPH_LOAD_FAIL ' + (e && e.message)); return go(r[0], r[1]); });
    });
  };

  // 2D pass — called from cinema_maxq's _captureFrame chain beside the other Measure beats, so the
  // posting lands INSIDE the frame's Measure queue (same convention cpe_slab_beat.js's own
  // CompositeOntoCanvas comment documents: the queue is reset at the top of that function).
  // §70 — clash_labels.js's algorithm, applied to findings: rank every marker by camera distance,
  // admit the TOP_N nearest with RANK_MARGIN_M hysteresis, drop anything outside the frustum, walk the
  // rest rejecting screen-space overlaps, fade each over FADE_S. No window, no storey slot, no cap at 2.
  function overlaps(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }

  A.ruleFindingsFilmCompositeOntoCanvas = function (ctx, w, h, filmSec) {
    var cam = A.camera, at = A._ruleTintAt;
    if (!ctx || !_sets.length || !cam || !at || !(w > 0) || !(h > 0)) return 0;
    var fs = filmSec || 0;
    _lastFilmS = fs;
    cam.updateMatrixWorld(true);
    var cx = cam.matrixWorld.elements[12], cy = cam.matrixWorld.elements[13], cz = cam.matrixWorld.elements[14];
    var V = (typeof THREE !== 'undefined' && THREE.Vector3) ? new THREE.Vector3() : null;
    if (!V) return 0;
    // camera forward, for view-DEPTH ordering (§77.2: not straight-line distance — down a corridor or
    // a long span, depth along the view axis is what reads as depth)
    var e = cam.matrixWorld.elements;
    var fwdX = -e[8], fwdY = -e[9], fwdZ = -e[10];

    // ── PASS 1 — who is on screen, how deep, who just gained a qualifying member, how long the set
    // has left in frame. Every set is measured every frame; §82's queue only decides who gets SHOWN.
    var visSet = {}, frame = [], byRuleFrame = {};
    for (var si = 0; si < _sets.length; si++) {
      var st = _sets[si];
      var vis = [], minD = Infinity, maxD = -Infinity, gained = 0, dwell = 0;
      for (var gi = 0; gi < st.guids.length; gi++) {
        var g = st.guids[gi], pt = at[g]; if (!pt) continue;
        V.set(pt.x, pt.y, pt.z).applyMatrix4(cam.matrixWorldInverse);
        var behind = V.z > 0;
        V.set(pt.x, pt.y, pt.z).project(cam);
        if (behind || Math.abs(V.x) > 1 || Math.abs(V.y) > 1) { st.seen[g] = 0; continue; }
        var dx = pt.x - cx, dy = pt.y - cy, dz = pt.z - cz;
        var depth = dx * fwdX + dy * fwdY + dz * fwdZ;          // §77.2 view-direction depth
        if (depth < minD) minD = depth;
        if (depth > maxD) maxD = depth;
        vis.push({ g: g, depth: depth, sx: (V.x + 1) / 2 * w, sy: (1 - V.y) / 2 * h });
        // §77.2 — the DWELL is the gate, not turnover. A member counts as a trigger only if it is
        // NEW on screen and will stay >= DWELL_MIN_S, which §77.3 makes a lookup rather than a guess.
        // §82.1 — the same lookup answers the QUEUE's question too: how much longer does this set
        // have an opportunity at all? That is what lets order-by-opportunity be judged, not guessed.
        var dw = _dwellFrom(st.iv && st.iv[g], fs);
        if (dw > dwell) dwell = dw;
        if (!st.seen[g] && dw >= DWELL_MIN_S) gained++;
        st.seen[g] = 1;
      }
      var f = { st: st, vis: vis, minD: minD, maxD: maxD, gained: gained, dwell: dwell };
      frame.push(f); byRuleFrame[st.rule] = f;
      if (vis.length) visSet[st.rule] = vis.length;
    }

    // ── PASS 2 — §82 THE QUEUE. One set holds the scene; the rest wait their turn. ──
    for (var qi = 0; qi < frame.length; qi++) {
      var qf = frame[qi];
      if (!qf.gained || qf.st === _active || qf.st._queued) continue;
      qf.st._queued = true; qf.st._queuedAt = fs;
      _queue.push(qf.st);
    }
    if (_active) {
      var af = byRuleFrame[_active.rule];
      var goneFor = (_active.lastSeenSec == null) ? Infinity : (fs - _active.lastSeenSec);
      var spent = (fs - _active.slotStart) >= SET_SLOT_S;
      // §82.1 "earnest effort" cuts both ways — do not spend the scene on a set that has left frame
      // and is not coming back into this slot. Handing over early is not bending the film; it is
      // declining to hold a shot for a set that is gone, which §82.1 forbids doing.
      var abandoned = (!af || !af.vis.length) && goneFor >= BOX_LINGER_S;
      if ((spent && _anyWaitingVisible(byRuleFrame)) || abandoned) { _active.slotEndSec = fs; _active = null; }
    }
    if (!_active) {
      var nxt = _takeNextSet(byRuleFrame);
      if (nxt) { _active = nxt; nxt.slotStart = fs; nxt.pulseStart = fs; nxt.slotEndSec = null; }
    }
    // §82 debug surface — the queue is the thing under test, so it is observable. Nothing in the film
    // reads this; the witness asserts Q1-Q4 against it (§78.1's lesson: a computed value with no
    // consumer is worth nothing, and a queue no test can see is exactly that).
    var _dbgDwell = {};
    frame.forEach(function (d) { if (d.vis.length) _dbgDwell[d.st.rule] = Math.round(d.dwell * 100) / 100; });
    A._ruleFilmQueue = { active: _active ? _active.rule : null,
                         slotStart: _active ? _active.slotStart : null,
                         queued: _queue.map(function (s) { return s.rule; }),
                         dwell: _dbgDwell };

    // ── PASS 3 — the wave, for the set holding the scene, and the boxes. ──
    var boxes = [], pulsing = 0, activeWave = null;
    for (var pi = 0; pi < frame.length; pi++) {
      var pf = frame[pi], ps = pf.st;
      if (!pf.vis.length) {
        // §78 — off screen: hold the box for the linger, then drop it. The set keeps its pulse clock,
        // so returning to view re-queues through the normal gained>0 path rather than snapping on.
        var offSince = (ps.slotEndSec != null) ? Math.min(fs - ps.slotEndSec, ps.lastSeenSec != null ? fs - ps.lastSeenSec : Infinity)
                                               : (ps.lastSeenSec != null ? fs - ps.lastSeenSec : Infinity);
        if (ps.pulseStart > -Infinity && offSince < BOX_LINGER_S) ps.fadingOut = 1 - offSince / BOX_LINGER_S;
        else { ps.fadingOut = 0; ps.boxPin = null; }
        continue;
      }
      ps.lastSeenSec = fs;                                // members are on screen this frame
      if (ps !== _active) {
        // §82 — this set does not hold the scene. Either it is waiting its turn (no box, no glow) or
        // it has just handed over, in which case its box fades across BOX_LINGER_S instead of
        // snapping off. That overlap is the only time two boxes coexist, and the §77.2 collision
        // nudge below still handles it.
        if (ps.pulseStart > -Infinity && ps.slotEndSec != null && (fs - ps.slotEndSec) < BOX_LINGER_S) {
          ps.fadingOut = 1 - (fs - ps.slotEndSec) / BOX_LINGER_S;
          boxes.push({ st: ps, since: fs - ps.pulseStart, waveRunning: false, alpha: ps.fadingOut,
                       anchor: pf.vis.reduce(function (a, b) { return a.depth < b.depth ? a : b; }) });
        } else { ps.fadingOut = 0; ps.boxPin = null; }
        continue;
      }
      ps.fadingOut = 0;
      // §77.2 — a set cannot restart while its own pulse is still running: wave + linger is the only
      // rate limit, ~3s, structural rather than a tuned cooldown constant.
      // §78 (user: "the same Sanity message box need not renew while they remain or repulse on screen.
      // Keeping the same box until end of pulsing helps eyeballing it well"). The BOX and the PULSE are
      // separate lifetimes. The pulse is the wave, and re-fires on a new qualifying member; the box is
      // held for as long as the set holds the scene, so it never blinks out and back while the viewer
      // is still reading it.
      var waveRunning = (fs - ps.pulseStart) < PULSE_S;
      if (pf.gained > 0 && !waveRunning) { ps.pulseStart = fs; waveRunning = true; }
      if (ps.pulseStart === -Infinity) continue;         // never pulsed: no box yet
      pulsing++;
      var since = fs - ps.pulseStart;
      var span = (pf.maxD - pf.minD) || 1;
      // the wave: each member lights when the front reaches its own depth, then decays
      for (var vi = 0; vi < pf.vis.length; vi++) {
        var arrive = ((pf.vis[vi].depth - pf.minD) / span) * WAVE_S;   // the front reaches this depth here
        var gl;
        if (since < arrive) gl = 0;                                    // not reached yet
        else if (since < arrive + ATTACK_S) gl = (since - arrive) / ATTACK_S;   // swell in
        else {
          // §79 — the release front travels outward on the SAME axis, so near lets go first.
          var releaseAt = WAVE_S + HOLD_S + ((pf.vis[vi].depth - pf.minD) / span) * RELEASE_S;
          gl = (since < releaseAt) ? 1 : Math.max(0, 1 - (since - releaseAt) / FADE_OUT_S);
        }
        pf.vis[vi].glow = gl;
      }
      // §77.5 P6 — expose the wave's per-member glow so a witness can assert the DEPTH ORDER rather
      // than merely that a box appeared. Debug surface only; nothing in the film reads it.
      A._ruleFilmLastWave = A._ruleFilmLastWave || {};
      activeWave = pf.vis.map(function (v) { return { g: v.g, depth: v.depth, glow: v.glow }; });
      A._ruleFilmLastWave[ps.rule] = activeWave;
      boxes.push({ st: ps, since: since, waveRunning: waveRunning, alpha: 1,
                   anchor: pf.vis.reduce(function (a, b) { return a.depth < b.depth ? a : b; }) });
    }

    // §77.2 — only the set that holds the scene keeps its markers lit; everything else is off.
    if (typeof A.ruleTintShowOnly === 'function') {
      // §78 — hand the WAVE's per-member glow through, not a boolean. This is what makes the outward
      // pulse visible; before, every member of a pulsing set was simply shown at once. §82 narrows it
      // to the one active set: a queued set is not lit either, or the 3D would crowd where the HUD no
      // longer does.
      var show = {};
      (activeWave || []).forEach(function (v) { show[v.g] = Math.max(show[v.g] || 0, 0.15 + 0.85 * (v.glow || 0)); });
      A.ruleTintShowOnly(show);
    }

    // ── §85 §RULE_FILM_HUD_CLEARANCE (user: "the pop up messages have to avoid been obscured by
    // other HUDs") ────────────────────────────────────────────────────────────────────────────────
    // cpe_film_boxes.js ALREADY owns the three fixed HUD rectangles and already exports a rect test.
    // They are armed once per bake and cannot move afterwards (§38.1b: "a day counter that drops out
    // for a stretch must not move the boxes underneath it"), so reserving them is just seeding the
    // SAME `placed` list the §77.2 collision nudge already walks — no second placement algorithm, no
    // copy of the layout maths, nothing new to keep in step. §65: share the implementation.
    // Absent (a Node witness, or a film with no boxes armed) it is simply not seeded, and placement
    // is byte-for-byte what it was.
    var placed = [], drawn = 0;
    var _hudL = (typeof A.filmBoxesLayoutOf === 'function') ? A.filmBoxesLayoutOf() : null;
    if (_hudL) {
      [_hudL.hud, _hudL.status, _hudL.measure].forEach(function (r) {
        if (r && r.w > 0 && r.h > 0) placed.push({ x: r.x, y: r.y, w: r.w, h: r.h });
      });
      if (!_hudReserveLogged) {
        _hudReserveLogged = true;
        log('§RULE_FILM_HUD_RESERVE n=' + placed.length + ' rects=' +
            placed.map(function (r) { return r.x + ',' + r.y + ' ' + r.w + 'x' + r.h; }).join(' · ') +
            ' — set boxes are nudged clear of these (§85)');
      }
    }
    for (var bi = 0; bi < boxes.length; bi++) {
      var b = boxes[bi], set = b.st;
      var px = Math.max(10, Math.round(h * 0.016)), pad = Math.round(px * 0.6), lh = Math.round(px * 1.4);
      ctx.font = '700 ' + px + 'px BlinkMacSystemFont,"Segoe UI",Roboto,-apple-system,sans-serif';
      var lines = [set.title, set.total + ' flagged'];
      if (set.exitLine) lines.push(set.exitLine);   // §84 — its own line: the total is a COUNT, this is a MAX

      var bw = pad * 2 + EDGE_BAR_PX, li;
      for (li = 0; li < lines.length; li++) bw = Math.max(bw, pad * 2 + EDGE_BAR_PX + Math.ceil(ctx.measureText(lines[li]).width));
      var bh = pad * 2 + lh * lines.length;
      // §80 (user: "The pop up Sanity message box still renew instead of staying"). It WAS drawn every
      // frame — but ANCHORED to the set's nearest visible member, which changes as the camera moves, so
      // it hopped around the frame and read as a new box each time. The position is PINNED when the box
      // first appears and kept while the set stays on screen; it re-places only if the frame size
      // changes. Staying put is the point: "Keeping the same box until end of pulsing helps eyeballing
      // it well."
      if (!set.boxPin || set.boxPin.fw !== w || set.boxPin.fh !== h) {
        set.boxPin = { x: Math.max(4, Math.min(w - bw - 4, b.anchor.sx + 14)),
                       y: Math.max(4, Math.min(h - bh - 4, b.anchor.sy - 14 - bh)), fw: w, fh: h };
      }
      var bx = set.boxPin.x, by = set.boxPin.y;
      // §77.2 — if a set box collides, MOVE it into free space; never suppress it. §85 seeds `placed`
      // with the fixed HUD rects, so the same loop clears those too.
      // §85 — the step used to be one BOX-HEIGHT at a time, which needs 8 hops to clear a 392px HUD
      // column and ran out of tries first: measured at 1280x720, the box landed ON the status box on
      // the frame it appeared and only escaped on the NEXT one. Jump straight past whatever was hit
      // instead — it converges in one or two moves regardless of how tall the obstacle is.
      for (var tries = 0; tries < 12; tries++) {
        var hit = null;
        for (var q = 0; q < placed.length; q++) {
          var o = placed[q];
          if (bx < o.x + o.w && o.x < bx + bw && by < o.y + o.h && o.y < by + bh) { hit = o; break; }
        }
        if (!hit) break;
        by = hit.y + hit.h + 8;                                   // straight below what it hit
        if (by + bh > h - 4) { by = 4; bx = hit.x - bw - 12; }     // out of height: the column beside it
        if (bx < 4) { bx = 4; by = Math.max(4, Math.min(h - bh - 4, by)); break; }
        // nowhere free left: it is still DRAWN, clamped in frame. §77.2 — suppressing a box would
        // make the film lie by omission, which is worse than an overlap the viewer can still read.
      }
      if (bx !== set.boxPin.x || by !== set.boxPin.y) {
        log('§RULE_FILM_HUD_NUDGE rule=' + set.rule + ' from=' + set.boxPin.x + ',' + set.boxPin.y +
            ' to=' + bx + ',' + by + ' filmSec=' + fs.toFixed(1) + ' — moved clear, never suppressed (§77.2/§85)');
      }
      set.boxPin.x = bx; set.boxPin.y = by;
      A._ruleFilmLastBoxPin = { x: bx, y: by };   // §80.5 — debug surface so a witness can assert the pin   // §80 — a collision nudge sticks, never re-nudged each frame
      placed.push({ x: bx, y: by, w: bw, h: bh });
      var op = (b.alpha == null) ? 1 : b.alpha;   // §78 held at full while the set holds the scene; §82 fades it on handover
      ctx.save();
      ctx.globalAlpha = op;
      ctx.fillStyle = LABEL_PLATE;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, Math.round(px * 0.4)); ctx.fill(); }
      else ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = 'rgba(255,255,255,0.20)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = set.ink; ctx.fillRect(bx, by, EDGE_BAR_PX, bh);
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.shadowColor = 'rgba(0,0,0,0.95)'; ctx.shadowBlur = Math.max(2, Math.round(px * 0.35)); ctx.shadowOffsetY = 1;
      for (li = 0; li < lines.length; li++) {
        ctx.fillStyle = li === 0 ? set.ink : '#fff';
        ctx.fillText(lines[li], bx + pad + EDGE_BAR_PX, by + pad + lh * (li + 0.5));
      }
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.restore();
      drawn++;
      // §84 — a GREPPABLE proof that the exit line reached the canvas on a real bake, not merely that
      // it was computed at build. One line per film. "The fix is in" is not the same claim as "the fix
      // fires" (§80.1), and this lane has shipped a no-op on that exact confusion before.
      if (set.exitLine && !_exitStatLogged) {
        _exitStatLogged = true;
        log('§RULE_FILM_EXIT_STAT drawn filmSec=' + fs.toFixed(1) + ' rule=' + set.rule + ' line="' + set.exitLine + '"');
      }
      // §82 — the Measure echo follows the scene-holder, not whichever box happened to be drawn first
      if (A.filmBoxesMeasurePost && set === _active) A.filmBoxesMeasurePost(set.title, set.rows, set.ink);
    }
    if (Math.floor(fs) !== _lastLog) {
      _lastLog = Math.floor(fs);
      log('§RULE_FILM_SETS filmSec=' + fs.toFixed(1) + ' sets=' + _sets.length +
          ' pulsing=' + pulsing + ' boxes=' + drawn + ' heldBoxes=' + boxes.filter(function (b) { return !b.waveRunning; }).length +
          ' active=' + (_active ? _active.rule : 'none') + ' queued=' + _queue.length +
          (_queue.length ? ' waiting=' + _queue.map(function (s) { return s.rule; }).join(',') : '') +
          ' visible=' + JSON.stringify(visSet));
    }
    return drawn;
  };

  A.ruleFindingsFilm = A.ruleFindingsFilm || {};
  A.ruleFindingsFilm.stats = function () { return _stats; };
  A.ruleFindingsFilmReport = function () { return _report; };
  A.ruleFindingsFilmDispose = function () { _built = false; _report = null; _picks = []; _stats = null; _queue = []; _active = null; _exitStatLogged = false; _hudReserveLogged = false; };
  log('§RULE_FILM_INIT wired (Structural Sanity + Egress findings as world content for the whole film, clash model — §70)');
}
if (typeof window !== 'undefined') window.setupRuleFindingsFilm = setupRuleFindingsFilm;
if (typeof module !== 'undefined' && module.exports) module.exports = setupRuleFindingsFilm;
