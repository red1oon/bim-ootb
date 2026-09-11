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
  var CATEGORY_COLOR = { structural: '#ffaa33', egress: '#e57373' };
  var SEV_RANK = { CRITICAL: 2, WARNING: 1 };

  // ── §RULE_FILM_CLASH_MODEL (MEP_CLASH_REVEAL_MOVIE.md §70, 2026-09-11) ─────────────────────────
  // User: "Isn't it supposed to appear during movie similar to clash?" It is. §59.3 tied findings to
  // the storey-reveal window only to avoid building a screen-time metric, and that one shortcut
  // caused the 2-finding cap, §59.8's NOFIT and §60.5's caption/tint mismatch. These four constants
  // are clash_labels.js's OWN values, reused verbatim rather than a second ranking scheme invented
  // here — including the clutter tradeoff the user already accepted for clash in §P2.1.
  var TOP_N = 8;               // the N nearest findings carry a label; no distance cutoff
  var RANK_MARGIN_M = 0.6;     // hysteresis against the moving Nth-nearest boundary
  var FADE_S = 0.5;            // film seconds to fade a label in/out — a fade, never a switch
  var LABEL_PLATE = 'rgba(0,0,0,0.85)';   // §68's measured-legible plate

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
  var _marks = [], _near = null, _fade = null, _lastFilmS = null, _lastLog = -1;   // §70
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

      // §70 — EVERY finding becomes world content, not one per storey. The label text is §63's
      // settled messaging; `title`/`rows` keep their shape so the closing cards and any Measure-box
      // caller are unaffected.
      _marks = rowsS.map(function (r) { return { row: r, category: 'structural' }; })
        .concat(rowsE.map(function (r) { return { row: r, category: 'egress' }; }));
      _marks.forEach(function (m) {
        var r = m.row;
        m.guid = r.guid;
        m.ink = CATEGORY_COLOR[m.category];
        m.title = (m.category === 'structural' ? 'Structural — ' : 'Safety — ') + r.rule.replace(/_/g, ' ');
        m.rows = [shortName(r.name) || r.ifc_class, r.storey, valueRow(_ruleDefs[r.rule], r.ratio, r.severity)];
      });
      _picks = _marks;   // the closing cards and stats read this; every finding now qualifies

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
        structuralPicked: rowsS.length > 0, egressPicked: rowsE.length > 0,   // §70 — all findings marked, not one per storey
        maxExitDistM: maxDist,
        // A.WALK_SPEED (config.js) is an EXISTING constant, currently used for tour-camera pacing —
        // repurposed here for a time estimate, not invented. STEP_M has no codebase precedent (see
        // file header) and is reported as an estimate, never a measured fact.
        maxExitDistSec: maxDist != null ? maxDist / (A.WALK_SPEED || 1.2) : null,
        maxExitDistSteps: maxDist != null ? Math.round(maxDist / STEP_M) : null
      };
      log('§RULE_FILM marked=' + _marks.length + ' structuralTotal=' + rowsS.length + ' egressTotal=' + rowsE.length +
          ' bothCategories=' + (rowsS.length && rowsE.length ? 'yes' : 'no') +
          (maxDist != null ? ' maxExitDistM=' + maxDist.toFixed(1) : ' maxExitDistM=none') +
          ' — §70: every finding is world content for the whole film, labels ranked per frame');

      // §70 — the 3-D wireframe tint now covers EVERY finding, not 1-2. Cost is one InstancedMesh per
      // colour regardless of count (rule_checklist.js), so 509 markers cost what 2 did. Still static,
      // never animated: §59.4's "one attention-getter, everything else static" applies to motion, and
      // the per-frame LABEL ranking below is what now decides where attention goes.
      if (_picks.length && typeof A.showRuleModeTint === 'function') {
        var guidCat = {}; _picks.forEach(function (p) { guidCat[p.guid] = p.category; });
        try { A.showRuleModeTint(guidCat, CATEGORY_COLOR, { shineThrough: true }); }   // §62
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
  // §70 — clash_labels.js's algorithm, applied to findings: rank every marker by camera distance,
  // admit the TOP_N nearest with RANK_MARGIN_M hysteresis, drop anything outside the frustum, walk the
  // rest rejecting screen-space overlaps, fade each over FADE_S. No window, no storey slot, no cap at 2.
  function overlaps(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }

  A.ruleFindingsFilmCompositeOntoCanvas = function (ctx, w, h, filmSec) {
    var cam = A.camera, at = A._ruleTintAt;
    if (!ctx || !_marks.length || !cam || !at || !(w > 0) || !(h > 0)) return 0;
    if (!_near || _near.length !== _marks.length) { _near = new Uint8Array(_marks.length); _fade = new Float32Array(_marks.length); _lastFilmS = null; }
    var fs = filmSec || 0;
    var dt = (_lastFilmS == null) ? FADE_S : Math.max(0, fs - _lastFilmS);
    _lastFilmS = fs;
    cam.updateMatrixWorld(true);
    var cx = cam.matrixWorld.elements[12], cy = cam.matrixWorld.elements[13], cz = cam.matrixWorld.elements[14];

    var all = [], i, m, pt;
    for (i = 0; i < _marks.length; i++) {
      pt = at[_marks[i].guid]; if (!pt) continue;
      var dx = pt.x - cx, dy = pt.y - cy, dz = pt.z - cz;
      all.push({ i: i, d: Math.sqrt(dx * dx + dy * dy + dz * dz), pt: pt });
    }
    all.sort(function (a, b) { return a.d - b.d; });
    var cutoff = all.length >= TOP_N ? all[TOP_N - 1].d : Infinity;
    var elig = [];
    for (var ai = 0; ai < all.length; ai++) {
      i = all[ai].i;
      if (!_near[i] && all[ai].d <= cutoff) _near[i] = 1;
      else if (_near[i] && all[ai].d > cutoff + RANK_MARGIN_M) _near[i] = 0;
      _fade[i] = Math.max(0, Math.min(1, _fade[i] + (_near[i] ? dt : -dt) / FADE_S));
      if (_near[i] || _fade[i] > 0) elig.push(all[ai]);
    }

    // §70.6 — the MARKERS follow this same ranking, not just the labels. 215 room/element bboxes with
    // depthTest off filled the frame (real bake, t=48s/92s); the nearest-N alone reads cleanly.
    if (typeof A.ruleTintShowOnly === 'function') {
      var vis = {};
      for (var vi = 0; vi < elig.length; vi++) vis[_marks[elig[vi].i].guid] = 1;
      A.ruleTintShowOnly(vis);
    }

    var placed = [], skippedFrustum = 0, skippedOverlap = 0, labelled = 0;
    var V = (typeof THREE !== 'undefined' && THREE.Vector3) ? new THREE.Vector3() : null;
    for (var k = 0; k < elig.length && V; k++) {
      i = elig[k].i; m = _marks[i]; pt = elig[k].pt;
      V.set(pt.x, pt.y, pt.z).applyMatrix4(cam.matrixWorldInverse);
      var behind = V.z > 0;
      V.set(pt.x, pt.y, pt.z).project(cam);
      if (behind || Math.abs(V.x) > 1 || Math.abs(V.y) > 1) { skippedFrustum++; continue; }
      var sx = (V.x + 1) / 2 * w, sy = (1 - V.y) / 2 * h;
      var px = Math.max(10, Math.round(h * 0.016)), pad = Math.round(px * 0.5), lh = Math.round(px * 1.35);
      ctx.font = '700 ' + px + 'px BlinkMacSystemFont,"Segoe UI",Roboto,-apple-system,sans-serif';
      var lines = [m.title, m.rows[0], m.rows[1] + ' · ' + m.rows[2]];
      var bw = pad * 2, li;
      for (li = 0; li < lines.length; li++) bw = Math.max(bw, pad * 2 + Math.ceil(ctx.measureText(lines[li]).width));
      var bh = pad * 2 + lh * lines.length;
      var box = { x: Math.min(w - bw - 4, sx + 12), y: Math.max(4, sy - 12 - bh), w: bw, h: bh };
      var clash = false;
      for (var q = 0; q < placed.length; q++) if (overlaps(box, placed[q])) { clash = true; break; }
      if (clash) { skippedOverlap++; continue; }
      placed.push(box);
      ctx.save();
      ctx.globalAlpha = _fade[i];
      ctx.fillStyle = LABEL_PLATE;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(box.x, box.y, bw, bh, Math.round(px * 0.4)); ctx.fill(); }
      else ctx.fillRect(box.x, box.y, bw, bh);
      ctx.strokeStyle = 'rgba(255,255,255,0.20)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      for (li = 0; li < lines.length; li++) {
        ctx.fillStyle = li === 0 ? m.ink : '#fff';
        ctx.fillText(lines[li], box.x + pad, box.y + pad + lh * (li + 0.5));
      }
      ctx.restore();
      labelled++;
    }
    if (Math.floor(fs) !== _lastLog) {
      _lastLog = Math.floor(fs);
      log('§RULE_FILM_LABELS filmSec=' + fs.toFixed(1) + ' marks=' + _marks.length +
          ' eligible=' + elig.length + ' labelled=' + labelled +
          ' skippedOverlap=' + skippedOverlap + ' skippedFrustum=' + skippedFrustum +
          ' markersShown=' + elig.length + '/' + _marks.length + ' topN=' + TOP_N);
    }
    return labelled;
  };

  A.ruleFindingsFilm = A.ruleFindingsFilm || {};
  A.ruleFindingsFilm.stats = function () { return _stats; };
  A.ruleFindingsFilmReport = function () { return _report; };
  A.ruleFindingsFilmDispose = function () { _built = false; _report = null; _picks = []; _stats = null; };
  log('§RULE_FILM_INIT wired (Structural Sanity + Egress findings as world content for the whole film, clash model — §70)');
}
if (typeof window !== 'undefined') window.setupRuleFindingsFilm = setupRuleFindingsFilm;
if (typeof module !== 'undefined' && module.exports) module.exports = setupRuleFindingsFilm;
