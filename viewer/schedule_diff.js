// schedule_diff.js — §4D_SCHEDULE_DIFF (CPM_FLOAT_GAP.md, user's own words: "our 4D schedule diff and
// show them their variance - ie correcting theirs!"). Grades an imported P6/MSP schedule against the
// SAME real-quantity/labor-productivity model materializeDefault already uses to generate a schedule
// from geometry alone — surfaces where a human planner's activity durations are unrealistic (too fast
// for the real quantity + crew-count math, or unusually slow) versus what THIS building's own extracted
// elements/rates say is physically achievable.
//
// NOT the "bind P6 to model elements for animation" feature (that's foreign_schedule.js's separate,
// still-open task_elements binding gap — CPM_FLOAT_GAP.md Gap 2). This is COARSE phase/trade-level
// matching only — an imported activity is matched to one of OUR phase buckets (Substructure/
// Superstructure/MEP Rough-in/Architecture/MEP Final/Finishes), never to an individual model element.
//
// NON-INVENT: "our" duration comes straight from ScheduleAuthor.materializeDefault's already-proven
// labor-rate x real-quantity / max_crews math (same function Terminal_extracted.db's 111d Superstructure
// / 221d MEP Rough-in numbers come from — CPM_FLOAT_GAP.md). "their" duration comes straight from the
// imported file's own activity start/finish dates (real elapsed calendar days — sidesteps the P6
// working-calendar-vs-our-calendar-day unit mismatch CPM_FLOAT_GAP.md's real-XER witness already named,
// by comparing DATE WINDOWS, not summed hour-derived durations). The flag thresholds below are a coarse,
// clearly-logged classification rule (same class of transparent constant as materializeDefault's own
// FRAGMENT_M2_FLOOR), not an invented duration number.
//
// Matching reuses schedule_author.js's matchRule (unmodified, literal call) over a keyword dictionary
// DERIVED (not invented) from three already-real sources: (1) the phase names SEQUENCE_RULES itself
// uses, (2) SEQUENCE_RULES' own IfcClass keys humanized into words ("IfcDuctSegment" -> "duct segment"),
// (3) LABOR_RATES' own trade descriptions ("Steel Erector (Skilled)" -> "steel erector"). rates.js's
// existing SEQUENCE_NAME_OVERRIDES regex list is reused as-is (its `classes` gate is skipped — a P6
// activity carries no ifc_class to gate on, but the pattern/phase pair is the SAME curated rule). A
// small set of well-known, real construction-industry terms (first fix/second fix, rough-in, envelope —
// standard trade vocabulary, not fabricated data values) rounds out the phase-classification vocabulary;
// per this project's own scope note (Prime Rule = data, not presentation), a text-classification
// heuristic is presentation-layer, not an invented number — every DURATION/QUANTITY compared downstream
// still traces to real extracted/rate data only.
//
// Pure, DOM-free, node-testable (mirrors schedule_author.js's own module shape).

(function (global) {
  'use strict';

  // Node's top-level `this` (this IIFE's `global` param when neither `self` nor a real global scope
  // is present) is `module.exports`, NOT the process-wide `global` object — same gap schedule_sync.js
  // already hit and fixed (its own SA() helper). Mirror that fallback for every global lookup here.
  function G(name) { return global[name] || (typeof globalThis !== 'undefined' ? globalThis[name] : undefined); }
  var SA = function () { return G('ScheduleAuthor'); };

  // ── phase-classification keyword dictionary (derived, not invented — see header) ─────────────────
  var STOP_WORDS = { 'case': 1, 'type': 1, 'part': 1, 'unit': 1, 'with': 1, 'from': 1, 'into': 1,
    'device': 1, 'skilled': 1, 'mixed': 1, 'laborers': 1, 'laborer': 1, 'general': 1 };

  function _humanize(cls) {
    return String(cls).replace(/^Ifc/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  }

  // Real, standard construction-industry trade vocabulary (see header §NON-INVENT) mapped onto the
  // phase names THIS project's own SEQUENCE_RULES already uses — added only when that phase name is
  // actually present in the caller's rules (never invents a phase that doesn't exist here).
  var _SYNONYMS = {
    'Substructure': ['substructure', 'foundation', 'foundations', 'footing', 'footings', 'piling', 'piles', 'excavation'],
    'Superstructure': ['superstructure', 'structural frame', 'structural framing', 'structural steel', 'steel erection', 'concrete frame'],
    'MEP Rough-in': ['mep rough-in', 'mep first fix', 'first fix', 'rough-in', 'roughin', 'containment'],
    'Architecture': ['building envelope', 'envelope', 'fenestration', 'cladding', 'blockwork', 'masonry', 'waterproofing'],
    'MEP Final': ['mep final', 'second fix', 'final fix', 'trim-out', 'fit-off', 'mep commissioning', 'testing and commissioning'],
    'Finishes': ['finishes', 'fit-out', 'fitout', 'flooring', 'painting', 'joinery'],
  };

  // buildMatcher(rules, laborRates, nameOverrides) — index built ONCE per computeScheduleDiff call.
  function buildMatcher(rules, laborRates, nameOverrides) {
    rules = rules || {};
    laborRates = laborRates || {};
    nameOverrides = nameOverrides || [];
    var phaseSet = {};
    for (var k in rules) phaseSet[rules[k].phase] = true;

    var dict = {}, source = {};
    function addKey(key, phase, why) {
      key = String(key || '').trim().toLowerCase();
      if (!key || dict[key]) return;   // first writer wins (deterministic insertion order)
      dict[key] = { phase: phase };
      source[key] = why;
    }

    // (1) exact phase names — the strongest, most specific signal, naturally long so matchRule's
    // longest-key-wins already prioritizes these over a single generic word.
    Object.keys(phaseSet).forEach(function (p) { addKey(p, p, 'exact_phase'); });

    // (2) IfcClass keys humanized into words/phrases.
    for (var cls in rules) {
      var phase = rules[cls].phase;
      var humanized = _humanize(cls);
      addKey(humanized, phase, 'class:' + cls);
      humanized.split(' ').forEach(function (w) {
        if (w.length >= 4 && !STOP_WORDS[w]) addKey(w, phase, 'class:' + cls);
      });
    }

    // (3) LABOR_RATES trade descriptions -> majority phase among the classes assigned that resource.
    var resourcePhaseCounts = {};
    for (var c2 in rules) {
      var r = rules[c2].resource;
      if (!r) continue;
      resourcePhaseCounts[r] = resourcePhaseCounts[r] || {};
      resourcePhaseCounts[r][rules[c2].phase] = (resourcePhaseCounts[r][rules[c2].phase] || 0) + 1;
    }
    for (var resKey in laborRates) {
      var counts = resourcePhaseCounts[resKey];
      if (!counts) continue;
      var bestPhase = null, bestN = 0;
      for (var ph in counts) if (counts[ph] > bestN) { bestN = counts[ph]; bestPhase = ph; }
      if (!bestPhase) continue;
      var tradeLabel = String(laborRates[resKey].trade || '').replace(/\([^)]*\)/g, '').replace(/\+.*/, '').trim().toLowerCase();
      if (!tradeLabel) continue;
      addKey(tradeLabel, bestPhase, 'trade:' + resKey);
      tradeLabel.split(' ').forEach(function (w) {
        if (w.length >= 4 && !STOP_WORDS[w]) addKey(w, bestPhase, 'trade:' + resKey);
      });
    }

    // (4) real construction-industry synonyms, only for phases that actually exist in `rules`.
    Object.keys(_SYNONYMS).forEach(function (p) {
      if (!phaseSet[p]) return;
      _SYNONYMS[p].forEach(function (kw) { addKey(kw, p, 'synonym'); });
    });

    return { dict: dict, source: source, nameOverrides: nameOverrides };
  }

  // matchActivityToPhase(text, matcher) — text = activity name (+ its WBS ancestor names, joined).
  // Returns {phase, tier, key} or null (unmatched — reported, never silently dropped).
  function matchActivityToPhase(text, matcher) {
    if (!text) return null;
    var lower = String(text).toLowerCase();
    // pass 1 — reuse rates.js's own curated SEQUENCE_NAME_OVERRIDES regex list AS-IS (the `classes`
    // gate is skipped: a P6 activity carries no ifc_class to gate against — same list, same pattern).
    var ov = matcher.nameOverrides || [];
    for (var i = 0; i < ov.length; i++) {
      var o = ov[i];
      if (!o._re) { try { o._re = new RegExp(o.pattern, o.flags || 'i'); } catch (e) { o._re = null; } }
      if (o._re && o._re.test(text)) return { phase: o.phase, tier: 'name_override', key: o.id };
    }
    // pass 2 — SA().matchRule, called UNMODIFIED (literal reuse, not reimplemented) against the
    // derived keyword dictionary. Sentinel dflt lets us tell "matched the default" from "no match".
    var matchRule = SA() && SA().matchRule;
    if (!matchRule) return null;
    var NOMATCH = { __nomatch: true };
    var res = matchRule(lower, matcher.dict, NOMATCH);
    if (res.__nomatch) return null;
    // recover which key actually hit (matchRule doesn't return it) by re-running its own longest-match rule.
    var bestKey = null, bestLen = 0;
    for (var key in matcher.dict) {
      if (lower.indexOf(key) >= 0 && key.length > bestLen) { bestKey = key; bestLen = key.length; }
    }
    return { phase: res.phase, tier: matcher.source[bestKey] || 'keyword', key: bestKey };
  }

  // ── date helpers (elapsed CALENDAR days between two YYYY-MM-DD dates — real, not derived-from-hours) ─
  function _daysSpan(startStr, finishStr) {
    if (!startStr || !finishStr) return null;
    var s = Date.parse(startStr + 'T00:00:00Z'), f = Date.parse(finishStr + 'T00:00:00Z');
    if (isNaN(s) || isNaN(f)) return null;
    return Math.max(0, Math.round((f - s) / 86400000));
  }

  // normalize an imported schedule into a flat leaf-activity array, from EITHER a live-adopted db
  // schedule_id OR a not-yet-adopted ForeignSchedule.toScheduleData() result — same shape either way.
  function _readForeignTasks(db, foreignData, importedScheduleId) {
    var wbsName = {}, out = [];
    if (foreignData) {
      foreignData.tasks.forEach(function (t) { if (t.isSummary) wbsName[t.id] = t.name; });
      foreignData.tasks.forEach(function (t) {
        if (t.isSummary) return;
        var parentName = t.wbsParent && wbsName[t.wbsParent] ? wbsName[t.wbsParent] : '';
        out.push({ id: t.id, name: t.name, text: (parentName ? parentName + ' ' : '') + t.name,
          start: t.scheduleStart, finish: t.scheduleFinish });
      });
      return out;
    }
    if (db && importedScheduleId) {
      var r = db.exec('SELECT task_id, wbs_parent, name, is_summary, schedule_start, schedule_finish FROM tasks WHERE schedule_id=?', [importedScheduleId]);
      if (!r.length || !r[0].values.length) return out;
      r[0].values.forEach(function (row) { if (row[3] === 1) wbsName[row[0]] = row[2]; });
      r[0].values.forEach(function (row) {
        if (row[3] === 1) return;
        var parentName = row[1] && wbsName[row[1]] ? wbsName[row[1]] : '';
        out.push({ id: row[0], name: row[2], text: (parentName ? parentName + ' ' : '') + row[2],
          start: row[4], finish: row[5] });
      });
    }
    return out;
  }

  // computeScheduleDiff(db, foreignData, opts) — the main entry point.
  //   db: sql.js Database with elements_meta (drives OUR estimate — real building, no invention).
  //   foreignData: ForeignSchedule.toScheduleData() output, OR null if opts.importedScheduleId names an
  //                already-adopted schedule_id inside `db` instead.
  //   opts: { importedScheduleId, start, rules, laborRates, nameOverrides, rates, defaultRule,
  //           shadowScheduleId, optimisticRatio(0.8), slowRatio(1.2) }
  function computeScheduleDiff(db, foreignData, opts) {
    opts = opts || {};
    if (!db) return { error: 'no_db' };
    var rules = opts.rules || G('SEQUENCE_RULES') || {};
    var laborRates = opts.laborRates || G('LABOR_RATES') || {};
    var nameOverrides = opts.nameOverrides || G('SEQUENCE_NAME_OVERRIDES') || [];
    var qsRates = opts.rates || G('RATES') || {};
    var dflt = opts.defaultRule || G('SEQUENCE_DEFAULT') || { phase: 'Architecture', sequence: 6, resource: null };
    var optimisticRatio = opts.optimisticRatio || 0.8;   // theirs <=80% of ours -> flagged optimistic
    var slowRatio = opts.slowRatio || 1.2;                // theirs >=120% of ours -> flagged slow

    if (!SA() || !SA().materializeDefault) return { error: 'no_engine' };

    // ── OUR estimate: the EXACT already-proven per-phase labor-rate x real-quantity / max_crews math
    // materializeDefault computes for a from-scratch generated schedule. Written to a throwaway
    // schedule_id (never SCH_AUTHORED, never the imported schedule) so this diff is non-destructive —
    // same idempotent-shadow-schedule convention this file's own rebuild-on-every-call already uses.
    var shadowId = opts.shadowScheduleId || 'SCH_DIFF_SHADOW';
    var ours = SA().materializeDefault(db, rules, {
      scheduleId: shadowId, start: opts.start || '2026-01-01',
      defaultRule: dflt, laborRates: laborRates, rates: qsRates, nameOverrides: nameOverrides,
    });
    var ourPhases = {};
    ours.phases.forEach(function (p) { ourPhases[p.name] = p; });

    // ── THEIR activities, matched to OUR phase buckets.
    var theirTasks = _readForeignTasks(db, foreignData, opts.importedScheduleId);
    var matcher = buildMatcher(rules, laborRates, nameOverrides);
    var byPhase = {};   // phaseName -> { minStart, maxFinish, activities:[] }
    var unmatched = [];
    theirTasks.forEach(function (t) {
      var m = matchActivityToPhase(t.text, matcher);
      if (!m) { unmatched.push({ id: t.id, name: t.name }); console.log('§4D_DIFF_UNMATCHED activity=' + t.id + ' name="' + t.name + '"'); return; }
      var b = byPhase[m.phase] || (byPhase[m.phase] = { minStart: null, maxFinish: null, activities: [] });
      b.activities.push({ id: t.id, name: t.name, tier: m.tier, key: m.key, start: t.start, finish: t.finish });
      if (t.start && (!b.minStart || t.start < b.minStart)) b.minStart = t.start;
      if (t.finish && (!b.maxFinish || t.finish > b.maxFinish)) b.maxFinish = t.finish;
      console.log('§4D_DIFF_MATCH activity=' + t.id + ' name="' + t.name + '" -> phase=' + m.phase + ' tier=' + m.tier + ' key=' + m.key);
    });

    // ── diff rows: every phase where BOTH sides have data.
    var rows = [], ourOnly = [];
    ours.phases.forEach(function (p) {
      var b = byPhase[p.name];
      if (!b || !b.activities.length) { ourOnly.push(p.name); return; }
      var theirDays = _daysSpan(b.minStart, b.maxFinish);
      if (theirDays == null) { ourOnly.push(p.name); return; }   // matched activities but no usable dates
      var ourDays = p.durationDays;
      var deltaDays = theirDays - ourDays;
      var deltaPct = ourDays > 0 ? Math.round((deltaDays / ourDays) * 1000) / 10 : null;
      var ratio = ourDays > 0 ? theirDays / ourDays : null;
      var flag = 'realistic';
      var flagMsg = 'within ' + Math.round((1 - optimisticRatio) * 100) + '% band of the achievable estimate';
      if (ratio != null && ratio <= optimisticRatio) {
        flag = 'optimistic';
        var factor = theirDays > 0 ? (ourDays / theirDays).toFixed(1) + 'x' : 'zero-duration (no time budgeted at all)';
        flagMsg = 'flagged optimistic — ' + factor + (theirDays > 0 ? ' faster than' : ' vs') + ' the real quantity + crew-count minimum';
      } else if (ratio != null && ratio >= slowRatio) {
        flag = 'slow';
        flagMsg = 'flagged slow — ' + (theirDays / ourDays).toFixed(1) + 'x longer than necessary given the real quantity + crew count';
      }
      var row = { phase: p.name, ourDays: ourDays, ourElements: p.count, theirDays: theirDays,
        theirStart: b.minStart, theirFinish: b.maxFinish, theirActivities: b.activities.length,
        deltaDays: deltaDays, deltaPct: deltaPct, flag: flag, flagMsg: flagMsg };
      rows.push(row);
      console.log('§4D_DIFF phase=' + p.name + ' ours=' + ourDays + 'd theirs=' + theirDays + 'd delta=' +
        deltaDays + 'd (' + deltaPct + '%) flag=' + flag + ' — ' + flagMsg);
    });

    var summary = {
      ourPhases: ours.phases.length, matchedPhases: rows.length, ourOnlyPhases: ourOnly.length,
      theirActivities: theirTasks.length, matchedActivities: theirTasks.length - unmatched.length,
      unmatchedActivities: unmatched.length,
    };
    console.log('§4D_DIFF_COVERAGE ourPhases=' + summary.ourPhases + ' matchedPhases=' + summary.matchedPhases +
      ' ourOnlyPhases=' + summary.ourOnlyPhases + ' theirActivities=' + summary.theirActivities +
      ' matchedActivities=' + summary.matchedActivities + ' unmatchedActivities=' + summary.unmatchedActivities);

    return { ourScheduleId: shadowId, phases: rows, ourOnlyPhases: ourOnly, unmatchedActivities: unmatched, summary: summary };
  }

  var API = { computeScheduleDiff: computeScheduleDiff, matchActivityToPhase: matchActivityToPhase, buildMatcher: buildMatcher };
  if (typeof window !== 'undefined') window.ScheduleDiff = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.ScheduleDiff = API;

  console.log('§SCHEDULE_DIFF_LOADED v1');
})(typeof self !== 'undefined' ? self : this);
