// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// rule_report.js — the Sanity/Egress findings WITHOUT the film (prompts/STRUCTURAL_SANITY.md T8,
// spec origin bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §87).
//
// PORTABLE by construction, same contract as viewer/structural_sanity.js and common/room_graph.js:
// plain data in, plain data out. No DOM, no THREE, no camera, no cinema `plan` — so the exact
// object the CLI writes is the object the panel downloads is the object the film's closing card
// reads. THREE SURFACES THAT CANNOT DISAGREE is the whole point (T8.2): `0.75` m/step is written
// twice across two branches today precisely because two surfaces each grew their own copy.
//
// ⚠ T8.3 — this file must NEVER reach for A.ruleFindingsFilmBuild. That needs a plan (§77.3's
// dwell precompute calls plan.poseAt), a tint and later a camera: everything findings-only exists
// to skip. Callers hand us rows from StructuralSanity.evaluate()/EgressSanity.evaluate() directly.
//
// ⚠ T8.5 — A ZERO IS A RESULT HERE, a DELIBERATE divergence from the film. The film drops a
// vacuous card ("never a fabricated zero"); a report states `door_clear_width: 0` outright,
// because "we checked and found none" is information on a page and noise on a moving card. That
// is why buildRuleReport takes `ruleDefs` (the rules we were ASKED to check) and not just rows.
// Do not "fix" this inconsistency — it is the difference between the two surfaces.
//
// Witness: tests/test_rule_report.js (R1-R8).

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.RuleReport = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var REPORT_SCHEMA = 'bim-ootb/rule-report@1';

  // ── T8.4: the `ratio` field on a finding row is OVERLOADED — metres for the two distance rules,
  // a dimensionless span/depth ratio for the three span_depth rules, and null where the rule is a
  // pure connectivity/geometry fact (floating_member, column_continuity, isolated_room). A report
  // that printed it bare would publish "0.75" and "27.3" in the same column and mean different
  // things by them. Mapping is by RULE NAME because that is where the meaning actually lives —
  // the evaluators put metres and ratios in one field by design, see egress_sanity.js's own rows.
  var RULE_UNITS = {
    door_clear_width: 'm',
    circulation_distance: 'm',
    span_depth_steel: 'ratio',
    span_depth_concrete: 'ratio',
    span_depth_cantilever: 'ratio',
    floating_member: null,
    column_continuity: null,
    isolated_room: null
  };

  // Metres/step. Read from rule_checklist.js's own longestExitSteps() when the caller passes it
  // (see meta.longestExitSteps below) — declared here ONLY so the report can DISCLOSE the
  // assumption as a field instead of burying it. A standard adult-stride ergonomic convention
  // from outside this project; no stride constant exists anywhere in this codebase to extract.
  var STEP_M = 0.75;

  function _num(v) { return (v == null || isNaN(v)) ? null : v; }

  // Panel parity: _rcRowHtml truncates the display name at 30 chars. The report carries BOTH the
  // full name and the same 30-char form, so a row in the file is recognisable as the row on screen.
  function shortName(s) { return String(s == null ? '' : s).substring(0, 30); }

  function valueOf(row) {
    var unit = Object.prototype.hasOwnProperty.call(RULE_UNITS, row.rule) ? RULE_UNITS[row.rule] : null;
    var v = _num(row.ratio);
    if (unit === null || v === null) return { value: null, unit: null };
    return { value: v, unit: unit };
  }

  // ── Pure: pull §ROOM_GRAPH_EXITS's own numbers out of captured log lines (T8.4).
  // egress_sanity.js calls RoomGraph.buildGraph(dbQuery, { log: function () {} }) — the graph's
  // log is SILENCED there, so these facts cannot reach us through the evaluator's own log sink.
  // The CALLER builds the graph once with a capturing log and hands the lines here. Returns null
  // when the line is absent — a stated absence, never a fabricated 0 (§59.7's two real defects,
  // `exits=0 noRaster=133/133`, are exactly the shape this surfaces without a bake).
  function parseRoomGraphExits(logLines) {
    var re = /§ROOM_GRAPH_EXITS exits=(\d+) noRaster=(\d+) of (\d+) doors/;
    var lines = logLines || [];
    for (var i = lines.length - 1; i >= 0; i--) {
      var m = re.exec(String(lines[i]));
      if (m) return { exits: +m[1], noRaster: +m[2], doors: +m[3] };
    }
    return null;
  }

  // ── Pure: rule NAMES a rules JSON asks us to check, in file order. The zero-is-a-result list.
  function ruleNamesOf(ruleDefs) {
    var out = [];
    (ruleDefs || []).forEach(function (defs) {
      if (!defs) return;
      ['structural_rules', 'egress_rules'].forEach(function (k) {
        (defs[k] || []).forEach(function (r) { if (r && r.name && out.indexOf(r.name) === -1) out.push(r.name); });
      });
    });
    return out;
  }

  // ══ T8.13 §RULE_FALLBACK_ONE_SOURCE — "which rules file actually ran", as DATA ═════════════
  // Handed over by the movie-bake session (2026-09-12): all three surfaces — panel, film, report
  // — need to state which thresholds they applied, and each had grown its own console.warn plus
  // its own copy of the fallback constant. A console line cannot reach the report's provenance
  // header, and copies drift: the film branch's copies ALREADY carried span_depth_concrete 20/26
  // and circulation_distance 30/45 where main carries the #1715 cited 16/21 and 45.7/60.96.
  //
  // ONE SHAPE, declared here: loadRules() -> Promise<{ rules, source, url, error }> where
  // `source` is 'fetched' | 'fallback'. The fallback object is NOT defined here — it comes from
  // the evaluator that owns the rule semantics (StructuralSanity.FALLBACK_RULES /
  // EgressSanity.FALLBACK_RULES), so this file adds a mechanism, not a fourth copy of the numbers.
  //
  // `fetchFn` is injected rather than reached for, so this stays DOM-free and Node-testable —
  // the same portability rule the rest of this file follows.
  function loadRules(fetchFn, url, fallback, opts) {
    opts = opts || {};
    var log = opts.log || function () {};

    function base() {
      if (typeof fetchFn !== 'function') {
        log('§RULE_RULES_SOURCE url=' + url + ' source=fallback reason=no-fetch');
        return Promise.resolve({ rules: fallback, source: 'fallback', url: url, error: 'no fetch available' });
      }
      return fetchFn(url).then(function (resp) {
        if (!resp || !resp.ok) throw new Error('HTTP ' + (resp && resp.status));
        return resp.json();
      }).then(function (json) {
        log('§RULE_RULES_SOURCE url=' + url + ' source=fetched');
        return { rules: json, source: 'fetched', url: url, error: null };
      })['catch'](function (err) {
        // Never a silent substitution: the caller gets the fallback AND the fact that it is one.
        log('§RULE_RULES_SOURCE url=' + url + ' source=fallback error=' + (err && err.message));
        return { rules: fallback, source: 'fallback', url: url, error: (err && err.message) || String(err) };
      });
    }

    return base().then(function (r) {
      // T8.14 — no overlay asked for is the ordinary case; say so as data, not by omission.
      if (!opts.overlayUrl) {
        r.overlay = { url: null, source: 'none', error: null, id: null };
        r.provenance = [];
        return r;
      }
      var oid = opts.overlayId || opts.overlayUrl;
      if (typeof fetchFn !== 'function') {
        log('§RULE_OVERLAY url=' + opts.overlayUrl + ' source=unavailable reason=no-fetch');
        r.overlay = { url: opts.overlayUrl, source: 'unavailable', error: 'no fetch available', id: oid };
        r.provenance = [];
        return r;
      }
      return fetchFn(opts.overlayUrl).then(function (resp) {
        // ⚠ A MISSING OVERLAY IS NOT A FAILURE. "This jurisdiction states no override" is the
        // normal case for most buildings, and must not degrade the base the way a failed BASE
        // fetch does. It is reported as `absent`, distinct from `error` (a file that exists but
        // would not parse) — conflating those would hide a broken regional file as "no override".
        if (resp && resp.status === 404) { var e = new Error('absent'); e._absent = true; throw e; }
        if (!resp || !resp.ok) throw new Error('HTTP ' + (resp && resp.status));
        return resp.json();
      }).then(function (ov) {
        var m = mergeRuleSets(r.rules, ov, { overlayId: oid });
        r.rules = m.rules;
        r.provenance = m.provenance;
        r.overlay = { url: opts.overlayUrl, source: 'fetched', error: null, id: oid };
        log('§RULE_OVERLAY url=' + opts.overlayUrl + ' source=fetched overrides=' + m.provenance.length +
          (m.provenance.length ? ' rules=' + m.provenance.map(function (x) { return x.rule; }).join(',') : ''));
        return r;
      })['catch'](function (err) {
        var absent = !!(err && err._absent);
        log('§RULE_OVERLAY url=' + opts.overlayUrl + ' source=' + (absent ? 'absent' : 'error') +
          (absent ? '' : ' error=' + (err && err.message)) + ' — base rules kept unchanged');
        r.overlay = { url: opts.overlayUrl, source: absent ? 'absent' : 'error', id: oid,
          error: absent ? null : ((err && err.message) || String(err)) };
        r.provenance = [];
        return r;
      });
    });
  }

  // ── T8.14 §RULE_OVERLAY — per-jurisdiction rules, merged the way rates.js already merges packs.
  // viewer/rates.js loadRateTemplate() has merged 16 jurisdiction packs per-key for months (JSON
  // wins, keys the pack omits keep their base value) — and 15 of those packs already carry 49
  // `sequence` entries each, so one rulebook is ALREADY regionalised through that mechanism.
  // Compliance never was. This is the same discipline, one level finer:
  //
  //   base:    { name: 'door_clear_width', applies_to: ['IfcDoor'], warning_m: 0.85, critical_m: 0.813, max_severity: 'WARNING' }
  //   overlay: { name: 'door_clear_width', critical_m: 1.054 }
  //   result:  { name: 'door_clear_width', applies_to: ['IfcDoor'], warning_m: 0.85, critical_m: 1.054, max_severity: 'WARNING' }
  //
  // That example is real and already documented in egress_sanity.js's own header: IBC 2021
  // requires 1.054 m (41.5in) for Group I-2 bed-movement egress doors, but applying it as a
  // blanket default would false-flag every non-bed-movement door, so main ships the general
  // §1010.1.1 figure. An overlay is how a jurisdiction (or an occupancy) states its own number
  // WITHOUT restating the seven rules it does not change.
  //
  // MERGE IS PER FIELD, not per rule: an overlay rule patches the fields it names and inherits
  // the rest. A rule the overlay does not mention is untouched. A rule ONLY in the overlay is
  // ADDED (a jurisdiction with an extra check). Arrays (applies_to, name_hints) are REPLACED
  // wholesale — there is no sensible element-wise merge for them, and silently unioning hints
  // would change which beams a rule claims.
  //
  // ⚠ PROVENANCE IS THE POINT, not a nicety. With two layers, `rulesSource: fetched|fallback` per
  // FILE stops being enough to answer "where did this threshold come from" — the question a
  // report exists to answer. mergeRuleSets returns, per overridden rule, exactly which fields the
  // overlay supplied and what the base said, so the report can show both.
  function mergeRuleSets(base, overlay, opts) {
    opts = opts || {};
    var overlayId = opts.overlayId || 'overlay';
    var provenance = [];
    if (!overlay) return { rules: base, provenance: provenance };

    var out = {}, KEYS = ['structural_rules', 'egress_rules'];
    KEYS.forEach(function (k) {
      var baseList = ((base || {})[k] || []);
      var overList = ((overlay || {})[k] || []);
      if (!baseList.length && !overList.length) return;

      var byName = {};
      overList.forEach(function (r) { if (r && r.name) byName[r.name] = r; });

      // Base order is preserved so the output is deterministic (T8.6) regardless of overlay order.
      var merged = baseList.map(function (b) {
        var o = byName[b.name];
        if (!o) return b;
        var copy = {}, changed = [];
        Object.keys(b).forEach(function (f) { copy[f] = b[f]; });
        Object.keys(o).forEach(function (f) {
          if (f === 'name') return;
          var was = copy[f], now = o[f];
          if (JSON.stringify(was) !== JSON.stringify(now)) {
            changed.push({ field: f, from: was === undefined ? null : was, to: now });
          }
          copy[f] = now;
        });
        if (changed.length) provenance.push({ rule: b.name, source: overlayId, changed: changed });
        delete byName[b.name];
        return copy;
      });

      // Anything left in the overlay is new — appended in the overlay's own order, after the base.
      overList.forEach(function (o) {
        if (!o || !o.name || !byName[o.name]) return;
        merged.push(o);
        provenance.push({ rule: o.name, source: overlayId, added: true });
        delete byName[o.name];
      });
      out[k] = merged;
    });

    // Carry through any non-rule keys the base had (meta, etc.) without inventing any.
    Object.keys(base || {}).forEach(function (k) { if (KEYS.indexOf(k) === -1 && !(k in out)) out[k] = base[k]; });
    return { rules: out, provenance: provenance };
  }

  // ── Pure: do two rule objects apply the same numbers? The cross-surface drift guard. Compares
  // by rule name + every numeric field, so a reordered file passes and a changed threshold does
  // not. Returns [] when they agree, else one entry per disagreement.
  function diffRuleThresholds(a, b) {
    function flat(o) {
      var out = {};
      ['structural_rules', 'egress_rules'].forEach(function (k) {
        ((o || {})[k] || []).forEach(function (r) {
          Object.keys(r).forEach(function (f) {
            if (typeof r[f] === 'number') out[r.name + '.' + f] = r[f];
          });
        });
      });
      return out;
    }
    var fa = flat(a), fb = flat(b), out = [];
    var keys = Object.keys(fa).concat(Object.keys(fb).filter(function (k) { return !(k in fa); }));
    keys.forEach(function (k) {
      if (fa[k] !== fb[k]) out.push({ field: k, a: fa[k] === undefined ? null : fa[k], b: fb[k] === undefined ? null : fb[k] });
    });
    return out;
  }

  // ══ T8.11 §RULE_SUFFICIENCY — the report reviews its own INPUT, not just its output ═══════
  // A findings file that does not say what it could not see invites the reader to read a metadata
  // gap as a structural defect. Every number below comes from a real query over the SAME
  // dbQuery(sql, params) -> rows contract the evaluators use — no new table, no sidecar.
  //
  // MEASURED, not hypothetical (2026-09-12, shipped evaluators run in Node over the bake DBs):
  //   - Terminal and HHS_Office_Federated carry 0 IfcFooting. HHS flags 131/131 of its Level 1
  //     columns on column_continuity — 61% of that building's whole finding count.
  //   - SUPPORT_CLASSES omits IfcWall. Of Hospital's 217 span_depth_cantilever findings (43% of
  //     its 509), not one has a genuinely free end: 121 sit on an IfcWall, 41 on an
  //     IfcWallStandardCase just outside the 0.15m tolerance, 33 on an IfcStair.
  //   - IfcSpace count in elements_meta is 0 in all three buildings; every room-rule finding is
  //     on a synthesized room, and the injection marks its own confidence in the NAME (≈/⚠).
  //
  // ⚠ SUFFICIENCY NEVER EDITS A FINDING. It sits beside the rows; it does not filter, reweight or
  // suppress them. The rules said what they said — the reader decides what that is worth.
  var _SUFF_UNAVAILABLE = 'unavailable';

  function _q1(dbQuery, sql) {
    var r = dbQuery(sql);
    return (r && r.length && r[0].length) ? +r[0][0] : 0;
  }

  // Each probe: run(dbQuery) -> { measured, verdict, consequence }. `verdict` is DERIVED from the
  // count by the threshold written in the probe itself, never an opinion typed into the report.
  var SUFFICIENCY_PROBES = [
    {
      check: 'footings_modelled',
      rules: ['column_continuity'],
      run: function (dbQuery) {
        var footings = _q1(dbQuery, "SELECT COUNT(*) FROM elements_meta WHERE ifc_class = 'IfcFooting'");
        var cols = _q1(dbQuery, "SELECT COUNT(*) FROM elements_meta WHERE ifc_class = 'IfcColumn'");
        return {
          measured: { IfcFooting: footings, IfcColumn: cols },
          verdict: cols === 0 ? 'ok' : (footings === 0 ? 'absent' : (footings < cols / 10 ? 'degraded' : 'ok')),
          consequence: footings === 0
            ? 'no footings exist in this model, so every lowest-storey column has nothing beneath it to find — column_continuity flags the absence of foundation geometry, not a broken load path'
            : 'footings are present; a column_continuity flag can mean a real gap in the load path'
        };
      }
    },
    {
      check: 'support_classes_present',
      rules: ['column_continuity', 'floating_member', 'span_depth_cantilever'],
      run: function (dbQuery) {
        // The evaluator's own lists: SUPPORT_CLASSES (beams) = IfcColumn, IfcWallStandardCase,
        // IfcFooting, IfcMember; COL_SUPPORT_CLASSES (columns) drops IfcMember. IfcWall and
        // IfcSlab are in NEITHER — a building that models its walls as IfcWall has no wall
        // support at all as far as these two rules are concerned.
        var rows = dbQuery("SELECT ifc_class, COUNT(*) FROM elements_meta " +
          "WHERE ifc_class IN ('IfcColumn','IfcWallStandardCase','IfcFooting','IfcMember','IfcWall','IfcSlab') GROUP BY ifc_class");
        var m = {};
        (rows || []).forEach(function (r) { m[r[0]] = +r[1]; });
        var unlisted = (m.IfcWall || 0) + (m.IfcSlab || 0);
        var listed = (m.IfcColumn || 0) + (m.IfcWallStandardCase || 0) + (m.IfcFooting || 0) + (m.IfcMember || 0);
        return {
          measured: m,
          verdict: unlisted > listed ? 'degraded' : 'ok',
          consequence: 'IfcWall and IfcSlab are in neither support list; ' + unlisted + ' such elements cannot support a beam end or a column here, while ' +
            listed + ' elements can. A beam bearing on an IfcWall reads as having one support, which routes it to span_depth_cantilever (ratio 12/16) instead of its material rule (steel 24/30)'
        };
      }
    },
    {
      check: 'beam_material_named',
      rules: ['span_depth_steel', 'span_depth_concrete'],
      run: function (dbQuery) {
        var beams = _q1(dbQuery, "SELECT COUNT(*) FROM elements_meta WHERE ifc_class = 'IfcBeam'");
        var named = _q1(dbQuery, "SELECT COUNT(*) FROM elements_meta WHERE ifc_class = 'IfcBeam' AND material_name IS NOT NULL AND material_name <> ''");
        return {
          measured: { IfcBeam: beams, withMaterialName: named },
          verdict: beams === 0 ? 'ok' : (named === 0 ? 'absent' : (named < beams ? 'degraded' : 'ok')),
          consequence: named === 0 && beams > 0
            ? 'no beam carries a material_name, so the steel/concrete split runs entirely on name_hints (UB/UC/Channel/HSS vs Concrete/RC) — a beam whose name matches neither is not scored at all (§MATERIAL_INFERRED unmatched)'
            : 'material_name is present on ' + named + ' of ' + beams + ' beams'
        };
      }
    },
    {
      check: 'cantilever_is_inferred',
      rules: ['span_depth_cantilever'],
      run: function (dbQuery) {
        // There is no cantilever flag anywhere in this schema. The rule infers it from
        // supportedCount === 1, and that inference PREEMPTS material classification. This probe
        // states the absence outright rather than letting the rule name imply a modelled fact.
        var named = _q1(dbQuery, "SELECT COUNT(*) FROM elements_meta WHERE ifc_class = 'IfcBeam' AND " +
          "(element_name LIKE '%antilever%' OR element_name LIKE '%CANT%')");
        return {
          measured: { beamsNamedCantilever: named },
          verdict: 'degraded',
          consequence: 'no cantilever attribute exists in elements_meta; span_depth_cantilever is inferred from "exactly one detected support" and is applied BEFORE the material rules, so a beam whose second support is an unlisted class is judged at 12/16 rather than its own material ratio'
        };
      }
    },
    {
      check: 'modelled_spaces',
      rules: ['circulation_distance', 'isolated_room'],
      run: function (dbQuery) {
        var spaces = _q1(dbQuery, "SELECT COUNT(*) FROM elements_meta WHERE ifc_class = 'IfcSpace'");
        return {
          measured: { IfcSpace_in_elements_meta: spaces },
          verdict: spaces === 0 ? 'absent' : 'ok',
          consequence: spaces === 0
            ? 'the model contains no modelled IfcSpace; every room-rule finding is measured on a room synthesized by the room-graph extraction, not on a space an author drew'
            : spaces + ' modelled spaces are available'
        };
      }
    },
    {
      check: 'room_confidence_sigils',
      rules: ['circulation_distance', 'isolated_room'],
      run: function (dbQuery) {
        // The extraction marks its own confidence in the room NAME: '≈' approximate, '⚠' suspect.
        // Neither evaluator reads that sigil, so it cannot reach a finding's severity — stating
        // it here is the only place a reader learns which rooms were guessed.
        var rows = dbQuery("SELECT name FROM spatial_structure WHERE type = 'IfcSpace'");
        var approx = 0, suspect = 0, plain = 0;
        (rows || []).forEach(function (r) {
          var n = String(r[0] == null ? '' : r[0]);
          if (n.charAt(0) === '\u2248') approx++;
          else if (n.charAt(0) === '\u26a0') suspect++;
          else plain++;
        });
        var total = approx + suspect + plain;
        return {
          measured: { approx: approx, suspect: suspect, plain: plain, total: total },
          verdict: total === 0 ? 'ok' : (plain === 0 ? 'degraded' : 'ok'),
          consequence: total === 0
            ? 'no IfcSpace rows in spatial_structure to assess'
            : approx + ' rooms are marked approximate and ' + suspect + ' suspect by the extraction itself (' + plain + ' plain); the egress evaluators do not read that mark, so a finding on a suspect room carries the same severity as one on a certain room'
        };
      }
    },
    {
      check: 'axis_aligned_bboxes',
      rules: ['floating_member', 'column_continuity', 'span_depth_steel', 'span_depth_concrete', 'span_depth_cantilever'],
      run: function (dbQuery) {
        // Every footprint and centreline test in structural_sanity.js is axis-aligned; a rotated
        // member would be tested against the wrong rectangle.
        //
        // ⚠ THE FIRST VERSION OF THIS PROBE WAS WRONG, and wrong in the direction that matters:
        // it counted beams/columns with rotation_z != 0, found none, and reported `ok` —
        // "every beam and column is axis-aligned". MEASURED afterwards: rotation_x, rotation_y
        // AND rotation_z are zero on ALL 118,490 element_transforms rows across Hospital_meta,
        // Terminal_meta and HHS_Office_Federated_silent — never non-zero, never null. The column
        // is present, typed and populated with a constant. It carries no information at all.
        //
        // "No element is rotated" and "rotation was never recorded" produce the identical query
        // result and mean opposite things, and only one of them justifies trusting an
        // axis-aligned test. A probe that cannot tell them apart must not say `ok`. So: look for
        // a non-zero rotation ANYWHERE in the table, across every class. If the whole column is
        // constant, the datum is uninformative and the verdict says so.
        var rotated = _q1(dbQuery, "SELECT COUNT(*) FROM element_transforms t JOIN elements_meta m ON m.guid = t.guid " +
          "WHERE m.ifc_class IN ('IfcBeam','IfcColumn') AND ABS(COALESCE(t.rotation_z, 0)) > 0.0001");
        var anyRot = _q1(dbQuery, "SELECT COUNT(*) FROM element_transforms WHERE " +
          "ABS(COALESCE(rotation_x, 0)) > 0.0001 OR ABS(COALESCE(rotation_y, 0)) > 0.0001 OR ABS(COALESCE(rotation_z, 0)) > 0.0001");
        var total = _q1(dbQuery, "SELECT COUNT(*) FROM element_transforms");
        if (anyRot === 0 && total > 0) {
          return {
            measured: { rotatedBeamsAndColumns: 0, anyRotatedElementInModel: 0, transformRows: total },
            verdict: 'uninformative',
            consequence: 'rotation_x/y/z are zero on ALL ' + total + ' transform rows, every class — the column is populated with a constant and records nothing. This is NOT evidence that the model is axis-aligned: a rotated member would look identical here. Every footprint and centreline test is axis-aligned, so any element that IS rotated in the real model is being tested against the wrong rectangle, silently'
          };
        }
        return {
          measured: { rotatedBeamsAndColumns: rotated, anyRotatedElementInModel: anyRot, transformRows: total },
          verdict: rotated === 0 ? 'ok' : 'degraded',
          consequence: rotated === 0
            ? 'rotation is genuinely recorded in this model (' + anyRot + ' rotated elements exist) and no beam or column is rotated, so the axis-aligned footprint and centreline tests apply'
            : rotated + ' beams/columns carry a non-zero rotation_z; their bbox is not the shape being tested, so support and continuity results for those elements are not reliable'
        };
      }
    },
    {
      check: 'door_width_is_nominal',
      rules: ['door_clear_width'],
      run: function (dbQuery) {
        var doors = _q1(dbQuery, "SELECT COUNT(*) FROM elements_meta WHERE ifc_class = 'IfcDoor'");
        var noBox = _q1(dbQuery, "SELECT COUNT(*) FROM elements_meta m LEFT JOIN element_transforms t ON t.guid = m.guid " +
          "WHERE m.ifc_class = 'IfcDoor' AND (t.guid IS NULL OR (COALESCE(t.bbox_x,0) = 0 AND COALESCE(t.bbox_y,0) = 0))");
        return {
          measured: { IfcDoor: doors, withoutBbox: noBox },
          verdict: doors === 0 ? 'ok' : (noBox > 0 ? 'degraded' : 'ok'),
          consequence: 'width is max(bbox_x, bbox_y) — the door\'s NOMINAL extent. Clear opening width (what IBC 2021 §1010.1.1 regulates) is narrower by the stop, the leaf thickness and the hardware, none of which this schema carries, so this rule under-flags rather than over-flags' +
            (noBox > 0 ? '; ' + noBox + ' doors have no bbox at all and are measured as 0 m wide' : '')
        };
      }
    }
  ];

  /**
   * Run every sufficiency probe. Portable: same dbQuery contract as the evaluators.
   * A probe whose table or column is missing reports 'unavailable' WITH the error — never a 0,
   * which a reader would mistake for a measured absence (T8.11).
   * @param {function} dbQuery - (sql, params?) -> array of row arrays
   * @param {object} [opts] - { log: fn(msg) }
   * @returns {Array<{check,rules,measured,verdict,consequence}>}
   */
  function runSufficiencyProbes(dbQuery, opts) {
    opts = opts || {};
    var log = opts.log || function () {};
    return SUFFICIENCY_PROBES.map(function (p) {
      var out;
      try {
        out = p.run(dbQuery);
      } catch (e) {
        out = { measured: null, verdict: _SUFF_UNAVAILABLE, consequence: 'probe could not run: ' + e.message };
      }
      log('§RULE_SUFFICIENCY check=' + p.check + ' verdict=' + out.verdict +
        ' measured=' + JSON.stringify(out.measured));
      return { check: p.check, rules: p.rules, measured: out.measured, verdict: out.verdict, consequence: out.consequence };
    });
  }

  // ══ T9.5 §ARTIFACT_RATE — the report grades its own findings ═════════════════════════════════
  // A finding is an ARTIFACT when the rule's own witness (T8.12) shows it rejected real
  // load-bearing geometry: a beam end touching a wall, a column standing on a slab, a room with
  // graph edges called isolated. This is the metric T9 drives to zero, and it belongs IN the
  // report because "how much of this should you believe" is the question a findings file exists
  // to answer.
  //
  // ⚠ ONLY LOAD-BEARING CLASSES COUNT AS EVIDENCE. The first version of this metric accepted any
  // nearby element and read 76% against a true 63% — it would have counted an IfcCovering, a duct,
  // a railing, and an IfcOpeningElement (a VOID) as proof that a beam was supported, and would
  // have justified exactly the wrong fix. A generous metric is worse than none: it licenses
  // changes that make a rule vacuous while the number improves.
  var LOAD_BEARING_CLASSES = ['IfcColumn', 'IfcWall', 'IfcWallStandardCase', 'IfcFooting',
                              'IfcMember', 'IfcBeam', 'IfcSlab', 'IfcPlate'];

  function _isLoadBearing(cls) { return LOAD_BEARING_CLASSES.indexOf(cls) !== -1; }

  // Can this neighbour bear the end vertically, by the test the RULE would apply to its class?
  // A column/wall/slab/footing/plate holds a beam by the z-bracket `gapVertM` measures. A BEAM
  // holds another beam only by framing: tops flush or bottoms flush within `framing_dz_m`.
  // Judging a beam by `gapVertM` is how a parallel precast beam running end-to-end half a metre
  // higher read as proof of support (T12.1 row 6).
  //
  // `framingDz` comes from the SAME parsed rules JSON the caller already hands us — T8.13's one
  // source. Two ways out, both of which must keep the OLD test rather than silently score a row
  // clean: a pre-T12 witness with no datums, and a rules file with no framing_dz_m.
  function _bearsVertically(nearest, tolerance_m, framingDz) {
    if (nearest.ifc_class !== 'IfcBeam') return nearest.gapVertM <= tolerance_m;
    if (framingDz == null) return nearest.gapVertM <= tolerance_m;
    if (nearest.topDzM == null && nearest.bottomDzM == null) return nearest.gapVertM <= tolerance_m;
    return (nearest.topDzM != null && nearest.topDzM <= framingDz) ||
           (nearest.bottomDzM != null && nearest.bottomDzM <= framingDz);
  }

  // Per rule: { rule, found, artifact, rate, basis }. `artifact` is null — never 0 — for a rule
  // with no artifact test, so "not measured" never reads as "measured clean". Requires rows
  // evaluated with witness:true; without it every rule reports null and says why.
  // `rules` (the parsed rules JSONs) is REQUIRED to classify honestly: without each rule's own
  // tolerance there is no line between "the rule looked and missed" and "something is nearby".
  function artifactRates(rows, rules) {
    var tol = {}, framingDz = null;
    (rules || []).forEach(function (d) {
      ['structural_rules', 'egress_rules'].forEach(function (k) {
        ((d || {})[k] || []).forEach(function (r) {
          if (r.tolerance_m != null) tol[r.name] = r.tolerance_m;
          if (r.name === 'floating_member' && r.framing_dz_m != null) framingDz = r.framing_dz_m;
        });
      });
    });
    // span_depth_cantilever has no tolerance of its own — its classification comes from
    // floating_member's support test, so it is judged by that rule's tolerance.
    if (tol.floating_member != null && tol.span_depth_cantilever == null) tol.span_depth_cantilever = tol.floating_member;
    var by = {};
    (rows || []).forEach(function (r) { (by[r.rule] = by[r.rule] || []).push(r); });
    return Object.keys(by).map(function (rule) {
      var rs = by[rule], art = null, basis = null, near = null;
      var hasWitness = rs.some(function (r) { return r.witness !== undefined; });
      if (!hasWitness) {
        return { rule: rule, found: rs.length, defect: null, nearMiss: null, rate: null,
                 basis: 'not measured — these rows were evaluated without witness:true' };
      }
      // ⚠ DEFECT vs NEAR-MISS. The witness deliberately searches WIDER than the rule (4x
      // tolerance horizontally, ~1 m vertically) so a near-miss is visible as one. Counting every
      // near-miss as an artifact inflates the number and, worse, points the fix at the wrong
      // thing: LTU_AHouse's 240 beam-at-free-end cases looked like rule failures until the pair
      // was checked properly — not one had a beam BOTH top-aligned and inside the footprint.
      // Those are threshold questions for an engineer, not logic to repair.
      //   defect   = load-bearing geometry INSIDE the rule's own tolerance — it looked and missed
      //   nearMiss = load-bearing geometry outside it — a threshold judgement, reported not fixed
      //
      // ══ T12.3 — THE EVIDENCE TEST MUST CARRY THE RULE'S OWN QUALIFYING CONDITIONS ═══════════
      // Not the rule's code (that would make this metric tautologically zero — trap 3), but the
      // conditions that decide whether a neighbour is CAPABLE of being the support the rule is
      // accused of missing. Three were absent at handover and produced all 8 remaining fleet
      // defects, every one on geometry the rule had judged correctly (T12.1):
      //   - proximity was compared at the witness's DISPLAY precision (3 dp), so a 0.300001621 m
      //     gap read as inside a 0.3 m tolerance. The witness now publishes 6 dp.
      //   - an `IfcBeam` was accepted on 3D proximity alone, though the rule admits one only by
      //     the §FRAMING_TOP_OF_STEEL datum test — top- or bottom-flush within framing_dz_m.
      //   - a column candidate ABOVE the column's base counted the same as one below it.
      var t = tol[rule];
      if (rule === 'floating_member' || rule === 'span_depth_cantilever') {
        basis = 'load-bearing geometry at an end the rule called unsupported, INSIDE tolerance ' + t + ' m' +
                (framingDz == null ? '' : ' (a beam candidate additionally top- or bottom-flush within ' + framingDz + ' m, per §FRAMING_TOP_OF_STEEL)');
        var hits = rs.filter(function (r) {
          return ((r.witness || {}).freeEnds || []).some(function (e) {
            return e.nearest && _isLoadBearing(e.nearest.ifc_class);
          });
        });
        art = hits.filter(function (r) {
          return (r.witness.freeEnds || []).some(function (e) {
            return e.nearest && _isLoadBearing(e.nearest.ifc_class) && t != null &&
                   e.nearest.gapHorizM <= t && _bearsVertically(e.nearest, t, framingDz);
          });
        }).length;
        near = hits.length - art;
      } else if (rule === 'column_continuity') {
        basis = 'load-bearing geometry directly below, INSIDE tolerance ' + t + ' m';
        var chits = rs.filter(function (r) {
          var b = (r.witness || {}).nearestBelow;
          // A candidate whose top reaches AS HIGH AS the column's own top is a co-located
          // duplicate, not something underneath — not a defect, and not a near-miss either,
          // because no threshold an engineer could pick turns a twin into a support.
          //
          // ⚠ THIS TEST, AND NOT THE OTHER ONE. `topBelowColumnBaseM >= -tolerance` reads as the
          // more natural phrasing of the same idea and was tried first. MEASURED over the fleet's
          // 549 column findings that have a load-bearing `nearestBelow`: it removes 51 of them —
          // the 4 real twins plus 47 deeper overlaps across EIGHT buildings, dropping the fleet
          // near-miss count 544 -> 498. `topAboveColumnTopM < 0` removes exactly the 4, and only
          // LTU_AHouse_extracted moves. The 47 are a separate question and answering it by
          // side-effect would have buried it.
          //
          // It is also the only comparison here not sitting on a knife edge: two of the four
          // twins measure 0.300000190 m against a 0.3 m tolerance, which no rounding decides
          // honestly, while all four share the column's top plane as the identical double.
          return b && _isLoadBearing(b.ifc_class) &&
                 (b.topAboveColumnTopM === undefined || b.topAboveColumnTopM < 0);
        });
        art = chits.filter(function (r) {
          var b = r.witness.nearestBelow;
          return t != null && b.centrelineOffsetM <= t && b.topToColumnBaseM <= t;
        }).length;
        near = chits.length - art;
      } else if (rule === 'isolated_room') {
        basis = 'the room\'s connected component holds an exit, or circulation on its own storey — a target the rule should have reached';
        // NOT `graphDegree > 0`: the rule does not claim the room has no edges, it claims no
        // route reaches an exit or this storey's circulation spine. A pair of rooms wired only to
        // each other, on a storey with no circulation node and in a model with zero exit nodes,
        // satisfies the rule's claim exactly — LTU_AHouse's two "defects" were that pair.
        art = rs.filter(function (r) {
          var w = r.witness || {};
          if (w.componentHasExitOrCirc === undefined) return (w.graphDegree || 0) > 0;   // pre-T12 witness
          return !!w.componentHasExitOrCirc;
        }).length;
      } else {
        // door_clear_width / circulation_distance / span_depth_* are threshold judgements with no
        // geometric contradiction to test. Saying so beats inventing a test that always passes.
        basis = 'no artifact test — this rule is a threshold judgement, not a geometric claim';
      }
      return { rule: rule, found: rs.length, defect: art, nearMiss: near,
               rate: art === null ? null : +(art / rs.length).toFixed(4), basis: basis };
    });
  }

  // ── Pure: flagged/population per rule (T8.11). A rule firing on ~90% of its population is not
  // discriminating on that building — the ratio is the whole argument, so the report states it
  // and says nothing more. `populations` is supplied by the caller (it needs the DB); a rule with
  // no known population reports null rather than a ratio against a guessed denominator.
  function flagRates(rules, populations) {
    populations = populations || {};
    return (rules || []).map(function (r) {
      var pop = Object.prototype.hasOwnProperty.call(populations, r.rule) ? populations[r.rule] : null;
      return {
        rule: r.rule, flagged: r.count, population: pop,
        rate: (pop === null || !pop) ? null : +(r.count / pop).toFixed(4)
      };
    });
  }

  // ── The populations each rule is actually drawn from, by the evaluators' own WHERE clauses.
  // Kept next to the probes so a rule added later has one obvious place to declare its denominator.
  function rulePopulations(dbQuery) {
    function n(sql) { try { return _q1(dbQuery, sql); } catch (e) { return null; } }
    var beams = n("SELECT COUNT(*) FROM elements_meta WHERE ifc_class = 'IfcBeam'");
    var cols = n("SELECT COUNT(*) FROM elements_meta WHERE ifc_class = 'IfcColumn'");
    var doors = n("SELECT COUNT(*) FROM elements_meta WHERE discipline = 'ARC' AND ifc_class = 'IfcDoor'");
    return {
      floating_member: beams, span_depth_steel: beams, span_depth_concrete: beams,
      span_depth_cantilever: beams, column_continuity: cols, door_clear_width: doors
      // circulation_distance / isolated_room are drawn from room-graph NODES, not a DB class —
      // the caller supplies that count from the graph it already built, or it stays unknown.
    };
  }

  /**
   * Build the report object. PURE — same inputs give the same bytes but for meta.generatedAt.
   * @param {object} p
   *   p.rowsS  {Array}  StructuralSanity.evaluate() rows (or [])
   *   p.rowsE  {Array}  EgressSanity.evaluate() rows (or [])
   *   p.ruleDefs {Array<object>} the parsed rules JSONs actually used — drives T8.5's zero rows
   *   p.meta   {object} { building, db, dbBytes, commit, swVersion, generatedAt,
   *                       rulesSource: { structural, egress }, roomGraph, longestExitSteps }
   * @returns {object} plain JSON-serialisable report
   */
  function buildRuleReport(p) {
    p = p || {};
    var rowsS = p.rowsS || [], rowsE = p.rowsE || [], meta = p.meta || {};
    // `rows` is the already-merged form the PANEL surface has (one panel holds one evaluator's
    // rows and must not mislabel them as the other's); the CLI passes rowsS/rowsE separately
    // because it runs both evaluators. Either way the builder works on one flat list.
    var all = p.rows ? p.rows.slice() : rowsS.concat(rowsE);

    // T8.5 — every rule we were ASKED to check, whether or not it fired.
    var names = ruleNamesOf(p.ruleDefs);
    // A rule that produced rows but is not in ruleDefs still gets listed (never hide a finding).
    all.forEach(function (r) { if (r && r.rule && names.indexOf(r.rule) === -1) names.push(r.rule); });

    var bySev = { CRITICAL: 0, WARNING: 0, OPTIMIZED: 0 };
    var rules = names.map(function (n) {
      var mine = all.filter(function (r) { return r.rule === n; });
      var sev = { CRITICAL: 0, WARNING: 0, OPTIMIZED: 0 };
      mine.forEach(function (r) {
        var s = (r.severity === 'CRITICAL' || r.severity === 'WARNING') ? r.severity : 'OPTIMIZED';
        sev[s]++; bySev[s]++;
      });
      return { rule: n, count: mine.length, severity: sev, unit: Object.prototype.hasOwnProperty.call(RULE_UNITS, n) ? RULE_UNITS[n] : null };
    });

    var findings = all.map(function (r) {
      var v = valueOf(r);
      return {
        guid: r.guid, ifc_class: r.ifc_class, name: r.name == null ? null : String(r.name),
        shortName: shortName(r.name), storey: r.storey == null ? null : String(r.storey),
        rule: r.rule, severity: r.severity,
        value: v.value, unit: v.unit,
        target: r.target == null ? null : r.target,  // egress rows label which target they measured
        // T8.12 — the evaluator's own evidence for THIS row, when it was run with witness:true.
        // Undefined (omitted from the JSON) rather than null when witness was off, so a report
        // without evidence is visibly different from one whose evidence came back empty.
        witness: r.witness === undefined ? undefined : r.witness
      };
    });

    // T8.4 egress stats. `steps` comes from the caller (rule_checklist.js's longestExitSteps) so
    // the arithmetic lives in ONE place; we only disclose the assumption behind it.
    var maxExitDistM = null;
    all.forEach(function (r) {
      if (r.rule !== 'circulation_distance') return;
      var v = _num(r.ratio); if (v === null) return;
      if (maxExitDistM === null || v > maxExitDistM) maxExitDistM = v;
    });
    var steps = (meta.longestExitSteps === undefined || meta.longestExitSteps === null)
      ? (maxExitDistM === null ? null : Math.round(maxExitDistM / STEP_M))
      : meta.longestExitSteps;

    var src = meta.rulesSource || {};
    return {
      schema: REPORT_SCHEMA,
      generatedAt: meta.generatedAt || new Date().toISOString(),
      building: meta.building == null ? null : String(meta.building),
      db: meta.db == null ? null : String(meta.db),
      dbBytes: _num(meta.dbBytes),
      commit: meta.commit == null ? null : String(meta.commit),
      swVersion: meta.swVersion == null ? null : String(meta.swVersion),
      // T8.4 — `fetched` vs `fallback` is the difference between the project's authored
      // thresholds and this repo's hardcoded copies. `unknown` when the caller cannot say;
      // never silently `fetched`.
      rulesSource: { structural: src.structural || 'unknown', egress: src.egress || 'unknown' },
      // T8.14 — with an overlay in play, one word per FILE no longer answers "where did this
      // threshold come from". These name the overlay and, per rule, exactly which fields it
      // changed and what the base said. Empty array = no override applied, which is not the same
      // as "not checked" — `rulesOverlay.source` says which.
      rulesOverlay: meta.rulesOverlay || null,
      rulesProvenance: meta.rulesProvenance || [],
      totals: { findings: all.length, rules: rules.length, severity: bySev,
        withWitness: all.filter(function (r) { return r.witness !== undefined; }).length },
      rules: rules,
      egressStats: {
        maxExitDistM: maxExitDistM,
        maxExitSteps: steps,
        stepMetres: STEP_M,
        estimate: true,          // the "~" on the panel's own status line — never a measured fact
        note: 'steps = round(metres / ' + STEP_M + ' m per stride); stride is an ergonomic convention from outside this project'
      },
      // T8.4 — absent means absent. A caller that did not capture the graph log gets null here
      // and a reason, not zeros that would read as "no exits found".
      roomGraph: meta.roomGraph || null,
      roomGraphNote: meta.roomGraph ? null : 'not captured — §ROOM_GRAPH_EXITS is emitted by RoomGraph.buildGraph(), whose log egress_sanity.js silences; the caller must build the graph with a capturing log to supply it',
      // ── T8.11 — the report's review of its OWN INPUT. Beside the findings, never over them:
      // nothing below changes a single row or total above. Null when the caller ran no probes
      // (a panel with no dbQuery, say) — stated as null, not as an empty "all clear".
      dataSufficiency: meta.sufficiency || null,
      flagRates: meta.sufficiency ? flagRates(rules, meta.populations || {}) : null,
      // T9.5 — how much of the above should be believed, measured from the findings' own evidence.
      artifactRates: artifactRates(all, p.ruleDefs),
      dataSufficiencyNote: meta.sufficiency
        ? 'Measured from this DB. A degraded or absent verdict means the rule could not see the datum it depends on — read its findings as questions, not defects. Findings above are untouched by this section.'
        : 'not run — the caller supplied no sufficiency probes',
      findings: findings
    };
  }

  // Stable JSON — key order is insertion order above, so the same rows give the same bytes (T8.6).
  function toJson(report) { return JSON.stringify(report, null, 2); }

  return {
    buildRuleReport: buildRuleReport,
    loadRules: loadRules,
    artifactRates: artifactRates,
    LOAD_BEARING_CLASSES: LOAD_BEARING_CLASSES,
    mergeRuleSets: mergeRuleSets,
    diffRuleThresholds: diffRuleThresholds,
    runSufficiencyProbes: runSufficiencyProbes,
    rulePopulations: rulePopulations,
    flagRates: flagRates,
    SUFFICIENCY_PROBES: SUFFICIENCY_PROBES,
    parseRoomGraphExits: parseRoomGraphExits,
    ruleNamesOf: ruleNamesOf,
    shortName: shortName,
    RULE_UNITS: RULE_UNITS,
    STEP_M: STEP_M,
    REPORT_SCHEMA: REPORT_SCHEMA,
    toJson: toJson
  };
});
