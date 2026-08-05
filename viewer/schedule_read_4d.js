// schedule_read_4d.js — prompts/4D_SCHEDULE_PERFECTION.md §GANTT_EDIT / BOQ4D (B2/B3).
//
// READ-ONLY view of the REAL persisted 4D schedule (`schedules` / `tasks` / `task_elements` /
// `task_sequences`) shaped into the row objects boq_charts.html's charts, audit and 4D export
// already consume. It computes NOTHING about when work happens — every date, every member element
// and every dependency is read back from a record `schedule_author.js` wrote.
//
// WHY THIS IS A MODULE AND NOT INLINE IN boq_charts.html:
//   a witness cannot require() an HTML file. Inlining would force witness_boq_charts_real_schedule.js
//   to re-implement the reader, i.e. exactly the "copy it rather than import it" convention this
//   project already identified as the reason one support-predicate bug had to be found and fixed
//   three separate times (4D_SCHEDULE_PERFECTION.md, "Architectural finding"). The shipped page and
//   the witness run THIS file.
//
// Pure, DOM-free, node-testable. No THREE, no document, no fetch.
(function (global) {
  'use strict';

  // ── phaseOrder(rules) ────────────────────────────────────────────────────────────────────────
  // The construction phase order, DERIVED from SEQUENCE_RULES' own sequence numbers (minimum
  // sequence over every class of a phase) — the identical derivation proj_fold.js:140 and
  // time_machine.js _ROW_PHASE_ORDER already use.
  //
  // ⚠ NEVER hardcode a copy of the result. Three hardcoded copies inside boq_charts.html alone
  // (generateSchedule, audit4DSchedule, buildScheduleFromOps) all still read
  //   Substructure, Superstructure, MEP Rough-in, Architecture, MEP Final, Finishes
  // i.e. MEP rough-in BEFORE the building envelope — the ordering PR #1165 corrected across all 18
  // rate-template sources and which these copies never received. The derived truth is
  //   Substructure(1) → Superstructure(2) → Architecture(5) → MEP Rough-in(7) → MEP Final(9) → Finishes(10)
  //
  // Derived on EVERY call, deliberately not cached: initRateTemplate() mutates SEQUENCE_RULES in
  // place at runtime (rates.js "Apply IN PLACE so existing window.SEQUENCE_RULES references stay
  // valid"), so a load-time snapshot would silently go stale under a regional rate template.
  function phaseOrder(rules) {
    rules = rules || global.SEQUENCE_RULES;
    if (!rules) return [];
    var minSeq = {};
    for (var k in rules) {
      var r = rules[k];
      if (!r || !r.phase || r.sequence == null) continue;
      if (minSeq[r.phase] == null || r.sequence < minSeq[r.phase]) minSeq[r.phase] = r.sequence;
    }
    return Object.keys(minSeq).sort(function (a, b) {
      if (minSeq[a] !== minSeq[b]) return minSeq[a] - minSeq[b];
      return a < b ? -1 : a > b ? 1 : 0;      // stable, deterministic tie-break
    });
  }

  // Discipline label from a SEQUENCE_RULES resource — the SAME mapping boq_charts.html's
  // buildScheduleFromOps() applies to kernel_ops, kept identical so a task's discipline does not
  // change meaning depending on which source the page happened to read.
  function discOfResource(res) {
    if (res === 'HVAC_TECH' || res === 'PLUMBER' || res === 'ELECTRICIAN') return 'MEP';
    if (res === 'STEEL_ERECTOR' || res === 'CONCRETE_GANG') return 'STR';
    return 'ARC';
  }

  // 'YYYY-MM-DD' → whole day number (UTC). Parsed as UTC on purpose: a local-time parse shifts the
  // day boundary by the runner's timezone and would move dates by ±1 day between machines.
  function dayNum(s) {
    if (!s) return null;
    var t = Date.parse(String(s).slice(0, 10) + 'T00:00:00Z');
    return isNaN(t) ? null : Math.round(t / 86400000);
  }

  function execRows(db, sql, params) {
    var r;
    try { r = params ? db.exec(sql, params) : db.exec(sql); } catch (e) { return null; }
    if (!r || !r.length || !r[0].values) return [];
    return r[0].values;
  }

  // ── readTasks(db, opts) ──────────────────────────────────────────────────────────────────────
  // opts: { rules, laborRates, equipmentAllocation, equipmentRates, scheduleAuthor, quiet }
  // Returns null when there is no real schedule to read (no ScheduleAuthor, no active schedule, no
  // DATED leaf tasks) — the caller then keeps whatever it was doing before. Never fabricates a
  // schedule to have something to return.
  function readTasks(db, opts) {
    opts = opts || {};
    if (!db) return null;
    var SA = opts.scheduleAuthor || global.ScheduleAuthor;
    if (!SA || !SA.activeSchedule) {
      console.log('§4D_REAL_TASKS schedule=none reason=ScheduleAuthor_not_loaded');
      return null;
    }
    var sched = null;
    try { sched = SA.activeSchedule(db); } catch (e) { sched = null; }
    if (!sched || !sched.id) {
      console.log('§4D_REAL_TASKS schedule=none reason=no_active_schedule');
      return null;
    }

    var rules = opts.rules || global.SEQUENCE_RULES || {};
    var laborRates = opts.laborRates || global.LABOR_RATES || {};
    var equipAlloc = opts.equipmentAllocation || global.EQUIPMENT_ALLOCATION || {};
    var equipRates = opts.equipmentRates || global.EQUIPMENT_RATES || {};
    var hierarchy = opts.hierarchy || global.IFC_SCHEMA_HIERARCHY || {};
    var dflt = opts.defaultRule || global.SEQUENCE_DEFAULT || { phase: 'Architecture', sequence: 6, resource: null };
    var order = phaseOrder(rules);
    var knownPhase = {};
    order.forEach(function (p) { knownPhase[p] = true; });

    // §EXACT_LOOKUP_BLINDSPOT P4 — was a raw rules[cls] exact-key lookup below (missed tier 1
    // substring matches like IfcDoorType, tier 2 schema-hierarchy inheritance like IfcTank). Routes
    // through the real matchRule tier 1->2->3; genuine tier 3 (no own/substring match, no classified
    // ancestor) returns null here, NOT the generic default — so callers below keep today's exact
    // "skip, don't count toward this tally" behavior for truly unclassified classes, the same
    // distinction P2 preserved for proj_fold.js's 'Unsequenced' bucket and P3 for export_5d.js's
    // OTHER package.
    function classifyCls(cls) {
      var warned = null, orig = console.warn;
      console.warn = function (m) { warned = m; orig(m); };
      var rule = SA.classify(cls, hierarchy, rules, dflt);
      console.warn = orig;
      var isTier3 = warned && warned.indexOf('§CLASS_UNMATCHED_INHERITED') !== 0 && warned.indexOf('§CLASS_UNMATCHED') === 0;
      return isTier3 ? null : rule;
    }

    // ---- leaf tasks of the active schedule (summaries are WBS containers, not work) -------------
    var trows = execRows(db,
      'SELECT task_id, name, schedule_start, schedule_finish, resource, total_float, is_critical ' +
      'FROM tasks WHERE schedule_id=? AND (is_summary IS NULL OR is_summary=0)', [sched.id]);
    if (trows === null) { console.log('§4D_REAL_TASKS schedule=' + sched.id + ' reason=tasks_query_failed'); return null; }

    var byId = {}, undated = 0, ids = [];
    trows.forEach(function (r) {
      if (!r[2] || !r[3]) { undated++; return; }      // §MI-FLOW blank-start tasks: real rows, no dates yet
      byId[r[0]] = {
        taskId: r[0], name: r[1] || r[0], startDate: String(r[2]).slice(0, 10),
        finishDate: String(r[3]).slice(0, 10), resourceCol: r[4],
        totalFloat: r[5], isCritical: r[6],
        guids: [], classes: {}, storeys: {}, resources: {}, disciplines: {}
      };
      ids.push(r[0]);
    });
    if (!ids.length) {
      console.log('§4D_REAL_TASKS schedule=' + sched.id + ' reason=no_dated_leaf_tasks undated=' + undated);
      return null;
    }

    // ---- member elements, joined by GUID (never by storey/phase name) ---------------------------
    // K0's measured finding: deriveZones keys a zone on collapsePhase(e.storey) while other code
    // reads the raw storey, so a name join genuinely mis-associates rows (Hospital: 60 groups for
    // 35 real tasks). elements_meta is LEFT-joined so a task_elements row whose element is missing
    // from elements_meta still counts as real work, it just contributes no class/storey.
    var erows = execRows(db,
      'SELECT te.task_id, te.guid, em.ifc_class, em.storey FROM task_elements te ' +
      'JOIN tasks t ON t.task_id = te.task_id LEFT JOIN elements_meta em ON em.guid = te.guid ' +
      'WHERE t.schedule_id=?', [sched.id]) || [];
    var noMeta = 0;
    erows.forEach(function (r) {
      var t = byId[r[0]]; if (!t) return;              // belongs to a summary/undated task
      t.guids.push(r[1]);
      var cls = r[2];
      if (!cls) { noMeta++; }
      else {
        t.classes[cls] = (t.classes[cls] || 0) + 1;
        var rule = classifyCls(cls);
        if (rule) {
          if (rule.resource) t.resources[rule.resource] = 1;
          t.disciplines[discOfResource(rule.resource)] = 1;
        }
      }
      if (r[3]) t.storeys[r[3]] = (t.storeys[r[3]] || 0) + 1;
    });

    // ---- real dependency edges -----------------------------------------------------------------
    var srows = execRows(db,
      'SELECT s.predecessor_id, s.successor_id, s.sequence_type, s.lag_days FROM task_sequences s ' +
      'JOIN tasks t ON t.task_id = s.successor_id WHERE t.schedule_id=?', [sched.id]) || [];
    var edgeN = 0;
    srows.forEach(function (r) {
      var t = byId[r[1]]; if (!t) return;
      (t.predecessors = t.predecessors || []).push({ id: r[0], type: r[2] || 'FS', lag: r[3] == null ? 0 : r[3] });
      edgeN++;
    });

    // ---- day numbers, relative to the schedule's OWN earliest start -----------------------------
    var minDay = null;
    ids.forEach(function (id) {
      var d = dayNum(byId[id].startDate);
      if (d != null && (minDay === null || d < minDay)) minDay = d;
    });
    if (minDay === null) {
      console.log('§4D_REAL_TASKS schedule=' + sched.id + ' reason=unparseable_dates');
      return null;
    }

    // ---- phase / storey identity ----------------------------------------------------------------
    // materializeZones writes `name = phase + ' — ' + storey` (schedule_author.js:376) — that string
    // IS the persisted decomposition, so it is read, not re-derived. Only when the name does not
    // parse to a KNOWN phase (a captured IfcWorkSchedule, an imported P6 name, a renamed task) does
    // the reader fall back to the majority phase of the task's own elements. Both are real; the
    // counts of each are logged so the split is visible rather than assumed.
    var fromName = 0, fromElements = 0, unphased = 0;
    function identify(t) {
      var i = t.name.indexOf(' — ');
      if (i > 0) {
        var p = t.name.slice(0, i).trim(), s = t.name.slice(i + 3).trim();
        if (knownPhase[p]) { fromName++; return { phase: p, storey: s || majority(t.storeys) || 'Unknown' }; }
      }
      var maj = null, best = 0;
      for (var cls in t.classes) {
        var rule = classifyCls(cls); if (!rule || !rule.phase) continue;
        if (t.classes[cls] > best) { best = t.classes[cls]; maj = rule.phase; }
      }
      if (maj) { fromElements++; return { phase: maj, storey: majority(t.storeys) || 'Unknown' }; }
      unphased++;
      return { phase: 'Unsequenced', storey: majority(t.storeys) || 'Unknown' };
    }
    function majority(m) {
      var best = null, n = 0;
      for (var k in m) if (m[k] > n) { n = m[k]; best = k; }
      return best;
    }

    var out = [];
    ids.forEach(function (id) {
      var t = byId[id];
      var idn = identify(t);
      var sd = dayNum(t.startDate) - minDay, fd = dayNum(t.finishDate) - minDay;
      var classes = Object.keys(t.classes);
      var resources = Object.keys(t.resources);
      var crew = 0;
      resources.forEach(function (r) { crew += (laborRates[r] && laborRates[r].crew_size) || 0; });
      var equip = {};
      classes.forEach(function (c) {
        var a = equipAlloc[c];
        if (a && equipRates[a.equipment]) equip[equipRates[a.equipment].desc] = 1;
      });
      var qty = t.guids.length;
      var dur = fd - sd;
      out.push({
        taskId: t.taskId, scheduleId: sched.id,
        name: t.name,
        ifcClasses: classes,
        phase: idn.phase,
        discipline: Object.keys(t.disciplines).join('/') || 'GEN',
        storey: idn.storey,
        qty: qty, uom: 'EA',
        productivity: (qty > 0 && dur > 0) ? Math.round(qty / dur) : 0,
        duration: dur,
        crews: 1,                                  // the model records no crew split (see B3)
        startDate: t.startDate, finishDate: t.finishDate,
        resource: t.resourceCol || resources.join(','),
        crew: crew,
        equipment: Object.keys(equip).join(', '),
        startDay: sd, finishDay: fd,
        guids: t.guids,
        predecessors: t.predecessors || [],
        totalFloat: t.totalFloat, isCritical: t.isCritical
      });
    });

    // ---- P6 row order: phase in real construction sequence, then start, then storey -------------
    // Same convention as §GANTT_ROW_ORDER (K1) in the Time Machine drawer — one ordering rule for
    // the whole product, both derived from SEQUENCE_RULES.
    function rank(p) { var i = order.indexOf(p); return i < 0 ? order.length : i; }
    out.sort(function (a, b) {
      var ra = rank(a.phase), rb = rank(b.phase);
      if (ra !== rb) return ra - rb;
      if (ra === order.length && a.phase !== b.phase) return a.phase < b.phase ? -1 : 1;
      return (a.startDay - b.startDay) || (a.storey < b.storey ? -1 : a.storey > b.storey ? 1 : 0);
    });
    out.forEach(function (t, i) { t.id = i + 1; t.wbs = '1.' + (rank(t.phase) + 1) + '.' + (i + 1); });

    if (!opts.quiet) {
      var totalGuids = 0;
      out.forEach(function (t) { totalGuids += t.guids.length; });
      console.log('§4D_REAL_TASKS schedule=' + sched.id + ' captured=' + !!sched.captured +
        ' tasks=' + out.length + ' elements=' + totalGuids + ' edges=' + edgeN +
        ' undatedSkipped=' + undated + ' guidsWithoutMeta=' + noMeta +
        ' phaseFromName=' + fromName + ' phaseFromElements=' + fromElements + ' unphased=' + unphased +
        ' days=' + (out.length ? Math.max.apply(null, out.map(function (t) { return t.finishDay; })) : 0));
      console.log('§4D_REAL_TASKS_ORDER phases=' + JSON.stringify(out.map(function (t) { return t.phase; })
        .filter(function (p, i, arr) { return i === 0 || arr[i - 1] !== p; })));
    }
    return out;
  }

  var API = { phaseOrder: phaseOrder, readTasks: readTasks, discOfResource: discOfResource, dayNum: dayNum };
  if (typeof window !== 'undefined') window.ScheduleRead4D = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.ScheduleRead4D = API;
})(typeof self !== 'undefined' ? self : this);
