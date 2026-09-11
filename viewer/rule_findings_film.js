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
  var CATEGORY_COLOR = { structural: '#ffaa33', egress: '#cc4444' };   // reuses rule_checklist.js's WARNING/CRITICAL hexes, category axis not severity
  var SEV_RANK = { CRITICAL: 2, WARNING: 1 };

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
    if (typeof A.storeyRevealList !== 'function') return fail('INCONCLUSIVE', 'cpe_storey_reveal.js not loaded');
    if (!plan || !plan.beats || !(plan.beats.rise > 0) || !plan.storeyReveal || !plan.storeyReveal.on ||
        !(plan.storeyReveal.windowFrac > 0) || !(plan.durationSec > 0)) {
      return fail('INCONCLUSIVE', 'no storey-reveal window on this plan — nothing to schedule a finding against');
    }
    if (typeof StructuralSanity === 'undefined' && typeof EgressSanity === 'undefined') {
      return fail('INCONCLUSIVE', 'neither StructuralSanity nor EgressSanity is loaded');
    }
    var fullList = A.storeyRevealList();
    if (!fullList.length) return fail('VACUOUS', 'no storeys');

    // SAME window/truncation arithmetic cpe_storey_reveal.js's own _fitList uses — read here, not
    // re-derived differently, so this can never disagree with which storey is actually on screen.
    var winSec = plan.storeyReveal.windowFrac * plan.durationSec;
    var winStartSec = (plan.beats.rise - plan.storeyReveal.windowFrac) * plan.durationSec;
    var room = Math.max(1, Math.floor(winSec / MIN_SLOT_SEC));
    var list = fullList.length > room ? fullList.slice(0, room) : fullList;
    var slotSec = winSec / list.length;
    // §RULE_FILM_LINGER_FIT (MEP_CLASH_REVEAL_MOVIE.md §59.8, 2026-09-11, user: "Even if 1.1s, let the
    // message linger 3 secs etc. Outlier edge cases."). The old gate compared slotSec alone against
    // ENV_SPAN, as though the Measure box cleared the instant a storey's slot ended. It does not:
    // cpe_film_boxes.js holds the last posted entry for a further LINGER_S (§MEASURE_BOX_LINGER), so
    // a finding posted inside HHS's real 1.01s slot is already on screen ~3.21s. Read the LIVE value
    // rather than hardcode a second 2.2 — if cpe_film_boxes.js ever retunes its linger, this follows.
    // Absent (no Measure box wired) ⇒ 0 ⇒ the original slotSec-only test, so the NOFIT branch stays.
    var lingerSec = (typeof A.filmBoxesMeasureLingerS === 'number') ? A.filmBoxesMeasureLingerS : 0;
    var effectiveSec = slotSec + lingerSec;
    log('§RULE_FILM_WINDOW winSec=' + winSec.toFixed(2) + ' storeys=' + list.length +
        ' slotSec=' + slotSec.toFixed(2) + ' lingerSec=' + lingerSec.toFixed(2) +
        ' effectiveSec=' + effectiveSec.toFixed(2) +
        ' eligible(>=' + ENV_SPAN + 's)=' + (effectiveSec >= ENV_SPAN));

    function pickFor(byStorey, category, excludeStorey) {
      for (var i = 0; i < list.length; i++) {
        var name = list[i].name;
        if (excludeStorey && name === excludeStorey) continue;
        var row = byStorey[name];
        if (!row) continue;
        var startSec = winStartSec + i * slotSec;
        return {
          category: category, guid: row.guid, ifc_class: row.ifc_class, name: row.name,
          storey: row.storey, rule: row.rule, severity: row.severity, ratio: row.ratio,
          startSec: startSec, endSec: startSec + ENV_SPAN, ink: CATEGORY_COLOR[category]
        };
      }
      return null;
    }

    function go(structRules, egressRules) {
      var rowsS = [], rowsE = [];
      try { if (typeof StructuralSanity !== 'undefined') rowsS = StructuralSanity.evaluate(dbQuery, structRules, { log: log }) || []; }
      catch (e) { log('§RULE_FILM_STRUCT_ERR ' + e.message); }
      try { if (typeof EgressSanity !== 'undefined') rowsE = EgressSanity.evaluate(dbQuery, egressRules, { log: log }) || []; }
      catch (e) { log('§RULE_FILM_EGRESS_ERR ' + e.message); }

      if (effectiveSec < ENV_SPAN) {
        log('§RULE_FILM NOFIT slotSec=' + slotSec.toFixed(2) + 's + lingerSec=' + lingerSec.toFixed(2) +
            's = ' + effectiveSec.toFixed(2) + 's < ' + ENV_SPAN + 's — not on screen long enough even with the Measure box linger, nothing scheduled');
        _report.state = 'NOFIT';
        _stats = { built: true, structuralTotal: rowsS.length, egressTotal: rowsE.length, structuralPicked: false, egressPicked: false };
        return _report;
      }

      // §59.8 honest cost — when the slot alone was too short, the caption outlives its OWN storey
      // tint by this much: for that long the box names a finding on storey N while N+1 is tinted.
      // §59.3's "scheduled while its own storey is reveal-active" is relaxed here, never silently.
      if (slotSec < ENV_SPAN) {
        log('§RULE_FILM_LINGER_FIT slotSec=' + slotSec.toFixed(2) + 's < ' + ENV_SPAN +
            's but lingerSec=' + lingerSec.toFixed(2) + 's carries it to ' + effectiveSec.toFixed(2) +
            's — admitted; caption outlives its own storey tint by overrunSec=' + (ENV_SPAN - slotSec).toFixed(2) + 's');
      }

      var byStoreyS = bestPerStorey(rowsS), byStoreyE = bestPerStorey(rowsE);
      var pickS = pickFor(byStoreyS, 'structural', null);
      var pickE = pickFor(byStoreyE, 'egress', pickS ? pickS.storey : null);
      if (!pickE && pickS) pickE = pickFor(byStoreyE, 'egress', null);   // only eligible storey also has egress — share it rather than drop the category

      _picks = [pickS, pickE].filter(Boolean);
      _picks.forEach(function (p) {
        p.title = (p.category === 'structural' ? 'Structural — ' : 'Safety — ') + p.rule.replace(/_/g, ' ');
        p.rows = [p.name || p.ifc_class, p.storey, p.ratio != null ? 'ratio ' + p.ratio.toFixed(1) : p.severity];
      });

      // §59 user addition — the Safety card's own "longest distance to exit" stat, real graph-
      // measured metres (RoomGraph.escapeRoute()/shortestPath(), egress_sanity.js's own `ratio`),
      // never a fabricated figure. Independent of which storey got the BEAT above.
      var maxDist = null;
      rowsE.forEach(function (r) { if (r.rule === 'circulation_distance' && r.ratio != null && (maxDist == null || r.ratio > maxDist)) maxDist = r.ratio; });

      _report.state = _picks.length ? 'BEAT' : 'VACUOUS';
      _report.picks = _picks;
      _stats = {
        built: true,
        structuralTotal: rowsS.length, egressTotal: rowsE.length,
        structuralPicked: !!pickS, egressPicked: !!pickE,
        maxExitDistM: maxDist,
        // A.WALK_SPEED (config.js) is an EXISTING constant, currently used for tour-camera pacing —
        // repurposed here for a time estimate, not invented. STEP_M has no codebase precedent (see
        // file header) and is reported as an estimate, never a measured fact.
        maxExitDistSec: maxDist != null ? maxDist / (A.WALK_SPEED || 1.2) : null,
        maxExitDistSteps: maxDist != null ? Math.round(maxDist / STEP_M) : null
      };
      log('§RULE_FILM picks=' + _picks.length + ' structuralTotal=' + rowsS.length + ' egressTotal=' + rowsE.length +
          ' oneOfEach=' + (pickS && pickE ? 'yes' : 'no') +
          (maxDist != null ? ' maxExitDistM=' + maxDist.toFixed(1) : ' maxExitDistM=none'));

      // Static 3D wireframe tint — ONLY the picked guids (1-2 elements: "chase only clear
      // opportunities" means a demonstration, not a flood), shown for the whole bake, never
      // animated. Explicit divergence from clash_film.js's shared-breathing-phase convention — see
      // §59.4: the requirement here is the opposite (one attention-getter, everything else static).
      if (_picks.length && typeof A.showRuleModeTint === 'function') {
        var guidCat = {}; _picks.forEach(function (p) { guidCat[p.guid] = p.category; });
        try { A.showRuleModeTint(guidCat, CATEGORY_COLOR); }
        catch (e) { log('§RULE_FILM_TINT_ERR ' + e.message); }
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
  A.ruleFindingsFilmCompositeOntoCanvas = function (ctx, w, h, filmSec) {
    if (!_picks.length || !A.filmBoxesMeasurePost) return 0;
    var drawn = 0;
    _picks.forEach(function (p) {
      if (filmSec < p.startSec || filmSec >= p.endSec) return;
      if (A.filmBoxesMeasurePost(p.title, p.rows, p.ink)) drawn++;
    });
    return drawn;
  };

  A.ruleFindingsFilm = A.ruleFindingsFilm || {};
  A.ruleFindingsFilm.stats = function () { return _stats; };
  A.ruleFindingsFilmReport = function () { return _report; };
  A.ruleFindingsFilmDispose = function () { _built = false; _report = null; _picks = []; _stats = null; };
  log('§RULE_FILM_INIT wired (Structural Sanity + Egress findings baked into the storey-reveal window, rides Measure)');
}
if (typeof window !== 'undefined') window.setupRuleFindingsFilm = setupRuleFindingsFilm;
if (typeof module !== 'undefined' && module.exports) module.exports = setupRuleFindingsFilm;
