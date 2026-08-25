// bar_model.js — THE 4D MODEL. Spec: bim-compiler prompts/4D_BAR_MODEL.md.
//
// WHY THIS EXISTS (§1 of the spec, and §S68/§S71 of 4D_SCHEDULE_PERFECTION.md):
// midair, phase stacking, zero-minute bars and movie-vs-bars disagreement are NOT four bugs. They
// are four symptoms of ONE structural defect — element time and task time were stored separately,
// in two modules, with no shared type, so every crossing needed a translator, and every translator
// is where a hell got in. There were five: deriveZones (task times as an envelope),
// _writeTemplateSchedule (task times as a window), remapSolveToTasks (element times, rewritten to
// match the windows), the §DEQ_REPAIR sweep loop, and the §CREW_CAP_FINAL re-pack. Each existed
// only to keep two stored copies of one fact in agreement.
//
// THE ONE RULE: only leaves store time. Every group DERIVES it.
// GroupBar.start/stop are getters, never fields. With one stored timeline there is nothing to
// reconcile, so no translator can exist, so no hell can enter through one. `contains()` stops being
// a test and becomes a tautology; the movie and the bars stop being two things.
//
// This module owns the TYPES and the SINGLE PASS. It deliberately does NOT build edges — `needs()`
// is injected (see viewer/bar_needs.js), so adding a new physical rule is adding a provider and the
// scheduler never changes. That is the open/closed fix for schedule_gate.js placeNonst's
// `Math.max(gg, wg, hangGate, openingGate, hostGate, tg, bg, slot.time)` — eight terms, edited by
// every rule ever added.
'use strict';
(function (root) {

  // ══ Bar — the root Object. Everything in 4D is one. ═════════════════════════════════════════
  function Bar() { this._s = null; this._e = null; }
  Bar.prototype.duration = function () {
    var s = this.start, e = this.stop;
    return (s == null || e == null) ? 0 : e - s;
  };
  Bar.prototype.contains = function (b) {
    return this.start != null && b.start != null && b.start >= this.start && b.stop <= this.stop;
  };
  Bar.prototype.overlaps = function (b) {
    return this.start != null && b.start != null && this.start < b.stop && b.start < this.stop;
  };
  Object.defineProperty(Bar.prototype, 'start', { get: function () { return this._s; }, configurable: true });
  Object.defineProperty(Bar.prototype, 'stop', { get: function () { return this._e; }, configurable: true });

  // ══ ElementBar — the LEAF. The only place a time is ever stored. ════════════════════════════
  function ElementBar(e) { Bar.call(this); this.e = e; this.guid = e.guid; this.needs = []; this.grounded = false; }
  ElementBar.prototype = Object.create(Bar.prototype);
  ElementBar.prototype.constructor = ElementBar;
  ElementBar.prototype.work = function () { return this.e.installSecs || 120; };
  ElementBar.prototype.trade = function () { return this.e.resource || '_DEFAULT'; };
  ElementBar.prototype.children = function () { return EMPTY; };
  ElementBar.prototype.place = function (startMs, durMs) { this._s = startMs; this._e = startMs + durMs; };
  var EMPTY = [];

  // ══ GroupBar — the COMPOSITE. start/stop are GETTERS over its children, never fields. ═══════
  // witness_bar_composite.js asserts in SOURCE that no assignment to _s/_e exists on this
  // prototype — a stored group time is the defect this whole model removes, and a comment saying
  // "don't store it" is not a gate.
  function GroupBar(name) { Bar.call(this); this.name = name; this._kids = []; this.needs = []; }
  GroupBar.prototype = Object.create(Bar.prototype);
  GroupBar.prototype.constructor = GroupBar;
  GroupBar.prototype.add = function (c) { this._kids.push(c); return c; };
  GroupBar.prototype.children = function () { return this._kids; };
  Object.defineProperty(GroupBar.prototype, 'start', {
    get: function () {
      var m = Infinity;
      for (var i = 0; i < this._kids.length; i++) { var s = this._kids[i].start; if (s != null && s < m) m = s; }
      return m === Infinity ? null : m;
    }, configurable: true });
  Object.defineProperty(GroupBar.prototype, 'stop', {
    get: function () {
      var m = -Infinity;
      for (var i = 0; i < this._kids.length; i++) { var e = this._kids[i].stop; if (e != null && e > m) m = e; }
      return m === -Infinity ? null : m;
    }, configurable: true });
  GroupBar.prototype.work = function () {
    var w = 0; for (var i = 0; i < this._kids.length; i++) w += this._kids[i].work(); return w;
  };
  GroupBar.prototype.trade = function () { return null; };   // a group has no single trade

  // ══ phaseOrder — EXTRACTED, never authored (spec §4). ═══════════════════════════════════════
  // A phase's rank is the MINIMUM sequence its own classes carry in sequence_rules.json. The old
  // 4D_template.json copied these numbers out and then gated the copy against its source; the copy
  // is deleted and this reads the source.
  function phaseOrder(sequenceRules) {
    var min = {};
    for (var cls in sequenceRules) {
      var r = sequenceRules[cls];
      if (!r || !r.phase || r.sequence == null) continue;
      if (min[r.phase] == null || r.sequence < min[r.phase]) min[r.phase] = r.sequence;
    }
    return Object.keys(min).sort(function (a, b) { return min[a] - min[b]; });
  }

  // ══ buildTree — Project > Level > Task(phase x level) > Element ═════════════════════════════
  // policy: { phase_link, level_link, building_scope[] } — viewer/rates/4D_policy.json.
  // collapse(storey) and bandRank come from ScheduleGate, so a level means the same thing here as
  // it does in the band gate.
  function buildTree(elements, policy, collapse, bandRank, order) {
    var project = new GroupBar('Project');
    var levels = {}, tasks = {}, buildingScope = {};
    (policy.building_scope || []).forEach(function (p) { buildingScope[p] = 1; });

    var leaves = [];
    for (var i = 0; i < elements.length; i++) {
      var e = elements[i], b = new ElementBar(e);
      leaves.push(b);
      var ph = e.phase || '_UNPHASED';
      var lv = collapse(e.storey);
      var isBuilding = !!buildingScope[ph];
      var key = ph + '||' + (isBuilding ? '*' : lv);
      var t = tasks[key];
      if (!t) {
        t = new GroupBar(ph + ' — ' + (isBuilding ? 'building' : lv));
        t.phase = ph; t.level = isBuilding ? null : lv;
        // A building-scope task hangs off the PROJECT, never off one LevelBar. Putting it under a
        // level made its bar span every storey and overlap that level's own tasks — measured as 2
        // of 34 false phase-stacking pairs on Duplex in the 2026-08-25 prototype.
        t.rank = isBuilding ? -1 : (bandRank[lv] != null ? bandRank[lv] : 1e9);
        tasks[key] = t;
        if (isBuilding) project.add(t);
        else {
          var L = levels[lv];
          if (!L) { L = levels[lv] = new GroupBar(lv); L.level = lv; L.rank = t.rank; project.add(L); }
          L.add(t);
        }
      }
      t.add(b);
    }

    // Task ordering + PhaseNeeds/LadderNeeds, both from POLICY (spec §3).
    var taskList = Object.keys(tasks).map(function (k) { return tasks[k]; })
      .sort(function (a, b) { return (a.rank - b.rank) || (order.indexOf(a.phase) - order.indexOf(b.phase)); });
    var prevOnLevel = {}, prevOfPhase = {};
    taskList.forEach(function (t) {
      var lk = t.level == null ? '*' : t.level;
      // phase_link=serial: FS+0 after the previous phase that actually instantiated on this level.
      // A dropped phase BRIDGES — prevOnLevel is only advanced by a task that exists.
      if (policy.phase_link === 'serial' && prevOnLevel[lk]) t.needs.push(prevOnLevel[lk]);
      // level_link=self: §4D_BAND_MONOTONIC, a phase waits for itself one level below.
      if (policy.level_link === 'self' && prevOfPhase[t.phase]) t.needs.push(prevOfPhase[t.phase]);
      prevOnLevel[lk] = t; prevOfPhase[t.phase] = t;
    });

    return { project: project, tasks: taskList, levels: levels, leaves: leaves };
  }

  // ══ attachNeeds — inject the physical edges (viewer/bar_needs.js builds them) ════════════════
  // edges: [{ from, to, kind }] by GUID. from must finish before to.
  function attachNeeds(leaves, edges) {
    var byGuid = {}, i;
    for (i = 0; i < leaves.length; i++) byGuid[leaves[i].guid] = leaves[i];
    var attached = 0, dangling = 0;
    for (i = 0; i < edges.length; i++) {
      var f = byGuid[edges[i].from], t = byGuid[edges[i].to];
      if (!f || !t || f === t) { dangling++; continue; }
      t.needs.push(f); attached++;
      if (edges[i].kind === 'support') t.grounded = false;
    }
    return { attached: attached, dangling: dangling };
  }

  // ══ schedule — THE SINGLE PASS (spec §5) ════════════════════════════════════════════════════
  // Tasks in topological order over PhaseNeeds+LadderNeeds; within a task, elements in support
  // order; crews capped per trade. Groups need no pass at all — their span is their children's.
  //
  // §5.1 A support edge pointing backwards against phase order is a CYCLE: the thing holding this
  // element up is scheduled in a LATER task. That is a CLASSIFICATION defect in the model, not a
  // scheduling problem, and it is REPORTED by name rather than scheduled around. Measured
  // backwards-support today: Terminal 27, Hospital 38, HHS 35, Duplex 8 — e.g. an Architecture
  // IfcWall holding up a Superstructure IfcMember.
  function schedule(tree, opts) {
    opts = opts || {};
    var laborRates = opts.laborRates || {};
    var baseMs = opts.baseMs || 0;
    var crews = {}, cycles = [], placed = 0;

    function cap(tr) { return (laborRates[tr] && laborRates[tr].max_crews) || 1; }
    function claim(tr, notBefore) {
      var n = cap(tr), slots = crews[tr] || (crews[tr] = new Array(n).fill(baseMs)), k = 0;
      for (var i = 1; i < slots.length; i++) if (slots[i] < slots[k]) k = i;
      return { at: Math.max(notBefore, slots[k]), commit: function (end) { slots[k] = end; } };
    }
    function put(b, at) {
      var s = claim(b.trade(), at), dur = Math.round(b.work() * 1000);
      b.place(s.at, dur); s.commit(s.at + dur); placed++;
    }

    tree.tasks.forEach(function (t) {
      var gate = baseMs;
      t.needs.forEach(function (p) { var e = p.stop; if (e != null && e > gate) gate = e; });

      var pending = t.children().slice(), guard = 0;
      while (pending.length && guard++ <= pending.length + 2) {
        var again = [];
        for (var i = 0; i < pending.length; i++) {
          var b = pending[i], at = gate, sawPlaced = false, earliest = Infinity;
          if (!b.grounded && b.needs.length) {
            for (var j = 0; j < b.needs.length; j++) {
              var st = b.needs[j].stop;
              if (st != null) { sawPlaced = true; if (st < earliest) earliest = st; }
            }
            // Nothing this element rests on has been placed yet — defer it one round.
            if (!sawPlaced) { again.push(b); continue; }
            if (earliest > at) at = earliest;
          }
          put(b, at);
        }
        if (again.length === pending.length) {          // a full round with nothing placeable
          for (var k = 0; k < again.length; k++) {
            var c = again[k];
            cycles.push({ guid: c.guid, cls: c.e.cls, phase: c.e.phase, task: t.name });
            put(c, gate);                                // placed anyway, but REPORTED
          }
          break;
        }
        pending = again;
      }
    });
    return { placed: placed, cycles: cycles };
  }

  // §BAR_CYCLE — aggregated per (predClass -> succPhase/succClass), never one line per element:
  // §CLASS_UNMATCHED's per-element warn alone overflowed run_witness_suite.js's 1MB spawnSync
  // maxBuffer on Hospital (WITNESS_INTERFACE_FRAMEWORK.md §6).
  function reportCycles(cycles, log) {
    log = log || (typeof console !== 'undefined' ? console.log : function () {});
    var by = {};
    cycles.forEach(function (c) {
      var k = (c.phase || '?') + '/' + c.cls;
      by[k] = (by[k] || 0) + 1;
    });
    var keys = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; });
    log('§BAR_CYCLE n=' + cycles.length + ' kinds=' + keys.length +
      ' — support scheduled in a LATER task than the element it holds up. This is a CLASSIFICATION ' +
      'defect in the model, not a scheduling problem; it is reported, never scheduled around.');
    keys.slice(0, 8).forEach(function (k) { log('   §BAR_CYCLE ' + k + ' x' + by[k]); });
    return by;
  }

  var API = { Bar: Bar, ElementBar: ElementBar, GroupBar: GroupBar,
              phaseOrder: phaseOrder, buildTree: buildTree, attachNeeds: attachNeeds,
              schedule: schedule, reportCycles: reportCycles };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.BarModel = API;
  if (typeof console !== 'undefined' && console.log) console.log('§BAR_MODEL_LOADED v1');
})(typeof self !== 'undefined' ? self : this);
