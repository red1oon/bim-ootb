// tm_played_layer.js — THE PLAYED LAYER, IN NODE. ONE OWNER, NO SECOND COPY.
//
// ⚠ DO NOT REMOVE — SCOPE (bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §FUTURE item 2,
// 2026-09-02 §CACHE_PLAYED_LAYER §H). Read the log after every run (project Log Mandate).
//
// WHAT "PLAYED" MEANS, AND WHY IT NEEDS A MODULE.
// materializeZones returns `displaySchedule` (= ScheduleAuthor.remapSolveToTasks,
// schedule_author.js:965) and scripts/cache_4d_run.js used to persist ONLY that — but
// viewer/time_machine.js has ZERO readers of it (grep: the only reference repo-wide is its own
// return statement, schedule_author.js:1476). The instants the Time Machine scrubber and the baked
// film actually reveal an element at (`op.start_ts <= cursor`, time_machine.js:169-170, 2576) are
// written by injectGantt from
//     _displayTimeline(_twItems)                (CpmSchedule.run, time_machine.js ~4838)
//     -> _tmTilePlayWithinTasks(...)            (§TM_REVEAL_TILED, ~4254, PR #1605)
//     -> _tmRescaleToTaskWindow(guid, s)        (affine fallback, ~4971)
//     -> kernel_ops.timestamp / _end_ts
// scripts/probe_tm_reveal_shipped.js (PR #1605) proved this chain can be replicated in node by
// SLICING the live functions out of time_machine.js — no browser, no bake, nothing re-typed. That
// slicing + mirror lives HERE now, so the probe and the cache cannot drift apart: two independent
// replications of the played layer would be the same defect class this whole section exists to
// remove. time_machine.js is READ, never edited.
//
// ══ §TM_PLAYED_LAYER_MIDAIR (2026-09-04, bim-compiler prompts/4D_MODEL_INTEGRITY.md §M.5 item 2) ══
// The §TM_PLAYED_LAYER line used to print `midair=` from `dt.midair` — the CPM-DISPLAY judge's count
// (the §CPM_DISPLAY number) — on the line that says "these are the instants kernel_ops carries". It
// was the wrong layer's number: re-judged by the OWNER on the played instants, Hospital META 539 (line
// said 583), Duplex 257 (line said 0), HHS 152 (line said 0), Terminal META 3133 (said 911). Two
// buildings reported a clean zero while carrying hundreds — a witness lying about its own subject
// (PRIMAL LAW clause 4). Now: `midairPlayed=` is the OWNER (SupportSweep.midairAudit, §I "is anything
// floating?") called over the played map — exactly what probe_tm_reveal_shipped.js judge() does —
// and `midairCpmDisplay=` is the old number, NAMED. There is no bare `midair=` token on that line any
// more, so the ambiguity cannot return. When the owner is not in the sandbox the line says UNJUDGED;
// when the population is empty it says VACUOUS — never a 0 that means nothing.
// Witness: viewer/tests/witness_tm_played_layer_midair.js.
//
// EXPORTS
//   sliceFn(src, name)          brace-matched source slice, by function name
//   buildSandbox(deps)          a vm context holding the live TM functions
//   mirrorInjectGantt(opts)     the injectGantt write-path mirror -> { play, disp, cap, ... }
//   judgePlayedMidair(sb, twItems, map, guidTask)   the OWNER over a played map (§TM_PLAYED_LAYER_MIDAIR)
//   describeMidair(mj)          the token the § line prints for that verdict (N | UNJUDGED | VACUOUS)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

const DAY_MS = 86400000;

// The exact set injectGantt's play path depends on. Sliced verbatim; if time_machine.js renames one
// of these the slice throws by name instead of silently producing a different map.
const TM_FNS = ['_tukeyBound', '_displayTimelineRemember', '_displayTimeline', '_tmDisplayRemap',
                '_tmRescaleToTaskWindow'];

function sliceFn(src, name) {
  const idx = src.indexOf('function ' + name + '(');
  if (idx < 0) throw new Error(name + ' not found in time_machine.js');
  let d = 0, open = false;
  for (let i = idx; i < src.length; i++) {
    if (src[i] === '{') { d++; open = true; }
    else if (src[i] === '}') { d--; if (open && d === 0) return src.slice(idx, i + 1); }
  }
  throw new Error('unbalanced braces for ' + name);
}

// buildSandbox({ tmSrc, SA, SG, CP, GM, SS, LABOR_RATES, console })
// `window` is supplied because the shipped `_tmTilePlayWithinTasks` resolves ScheduleAuthor through
// `window` only — the same seam every real UI call site in time_machine.js uses.
function buildSandbox(d) {
  const sb = {
    window: { LABOR_RATES: d.LABOR_RATES, GanttModel: d.GM, ScheduleAuthor: d.SA },
    ScheduleGate: d.SG, CpmSchedule: d.CP, GanttModel: d.GM, ScheduleAuthor: d.SA,
    _midairAudit: d.SS && d.SS.midairAudit,
    console: d.console || console,
    // Free variables `_tmRescaleToTaskWindow` closes over inside injectGantt. `_tiledPlay` is set by
    // mirrorInjectGantt when applyTiling is on; left null it yields the PRE-#1605 affine, which is
    // what the A/B probe's red control needs.
    _cap: null, _winGroups: {}, _tiledPlay: null, _rawScheduleRemember: null,
  };
  vm.createContext(sb);
  const missing = [];
  const code = ['var _CPM_DISPLAY = true;']
    .concat(TM_FNS.map(n => sliceFn(d.tmSrc, n)))
    .concat([
      // Optional so this module still runs against a pre-#1605 revision (then applyTiling is a no-op
      // and says so, rather than pretending the tiling ran).
      (d.tmSrc.indexOf('function _tmTilePlayWithinTasks(') >= 0
        ? sliceFn(d.tmSrc, '_tmTilePlayWithinTasks')
        : (missing.push('_tmTilePlayWithinTasks'), 'var _tmTilePlayWithinTasks = null;')),
      'this._tmDisplayRemap = _tmDisplayRemap; this._displayTimeline = _displayTimeline;',
      'this._tmRescaleToTaskWindow = _tmRescaleToTaskWindow; this._tmTilePlayWithinTasks = _tmTilePlayWithinTasks;',
      'this.__getRaw = function () { return _rawScheduleRemember; };',
    ]).join('\n');
  vm.runInContext(code, sb);
  sb.__missing = missing;
  return sb;
}

// judgePlayedMidair(sb, twItems, map, guidTask) — §TM_PLAYED_LAYER_MIDAIR. THE one place "midair on
// the played instants" is asked in node. Calls the OWNER — SupportSweep.midairAudit, reached through
// the sandbox's `_midairAudit` (the same seam injectGantt's own §CPM_DISPLAY audit uses) — over the
// items injectGantt built, with s/e replaced by the map under judgement. Nothing re-derived: the
// support relation, the election and the "appears before its support" test are all the owner's.
// Returns { midair, orphans, guids, judged } or, honestly, { unjudged: reason } / { vacuous: true }.
function judgePlayedMidair(sb, twItems, map, guidTask) {
  if (!sb || typeof sb._midairAudit !== 'function')
    return { midair: null, judged: 0, unjudged: 'SupportSweep.midairAudit not in sandbox — buildSandbox({SS}) was not given support_sweep.js' };
  const its = [];
  (twItems || []).forEach(it => {
    const p = map && map[it.guid]; if (!p) return;
    its.push(Object.assign({}, it, { s: p.s, e: p.e, task: guidTask ? guidTask[it.guid] : it.task }));
  });
  if (!its.length) return { midair: 0, orphans: 0, guids: [], judged: 0, vacuous: true };
  const ma = sb._midairAudit(its);
  return { midair: ma.midair, orphans: ma.orphans, guids: ma.guids || [], judged: its.length, ok: ma.ok };
}
// describeMidair(mj) — the exact token the § line carries, so a reader can grep ONE spelling.
function describeMidair(mj) {
  if (!mj) return 'UNJUDGED';
  if (mj.unjudged) return 'UNJUDGED';
  if (mj.vacuous) return 'VACUOUS';
  return String(mj.midair);
}

// readDisplayAuthored(db) — the SAME query injectGantt runs (time_machine.js:4967). Never assumed:
// a schedule whose windows we did not author keeps the affine, and this must be able to say so.
function readDisplayAuthored(db) {
  try {
    const r = db.exec('SELECT 1 FROM schedules WHERE display_authored=1 LIMIT 1');
    return !!(r.length && r[0].values.length);
  } catch (e) { return false; }   // legacy DB without the column — affine stays, reported by caller
}

// mirrorInjectGantt({ sb, elements, tasks, db, startISO, applyTiling, log })
//
// Verbatim mirror of injectGantt's write path (time_machine.js ~4930-5010), in order:
//   _twItems (from the raw schedule the displayRemap hook remembered)
//   -> _displayTimeline  -> _cap {win, guidTask}  -> _winGroups
//   -> _tmTilePlayWithinTasks(disp, cap, display_authored)
//   -> _tmRescaleToTaskWindow per element   == the instants kernel_ops carries
//
// Returns { play, disp, win, guidTask, stats }. `play`/`disp` are guid -> {s,e} (ms epoch).
function mirrorInjectGantt(o) {
  const sb = o.sb, elements = o.elements, baseMs = Date.parse(o.startISO);
  const log = o.log || function () {};
  const raw = sb.__getRaw();
  if (!raw || !raw.map) return { ok: false, reason: 'displayRemap hook did not remember a raw schedule — was opts.displayRemap passed to materializeZones?' };

  const twItems = elements.map(el => {
    const ts = raw.map[el.guid];
    return { guid: el.guid, s: ts ? ts.start : baseMs, e: ts ? ts.end : baseMs + 60000,
      bz: el.base_z != null ? el.base_z : el.bz, tz: el.top_z != null ? el.top_z : el.tz,
      x0: el.x0, x1: el.x1, y0: el.y0, y1: el.y1,
      cls: el.cls, seq: el.seq, phase: el.phase, storey: el.storey, resource: el.resource };
  });
  const dt = sb._displayTimeline(twItems);   // mutates .s/.e in place, exactly as injectGantt relies on
  const disp = {};
  twItems.forEach(it => { disp[it.guid] = { start: it.s, end: it.e }; });
  let schedEnd = baseMs;
  for (const g in disp) if (disp[g].end > schedEnd) schedEnd = disp[g].end;

  // _cap mirror: the persisted task rows, guid -> its EARLIEST claiming task (injectGantt's rule)
  const win = {}, guidTask = {};
  const tasks = o.tasks;
  if (!Array.isArray(tasks) || !tasks.length)
    return { ok: false, reason: 'no task grid — materializeZones returned no res.tasks, so no element has a dated window' };
  {
    tasks.forEach(t => {
      win[t.id] = { s: baseMs + t.sDays * DAY_MS, e: baseMs + t.eDays * DAY_MS, name: t.id,
        sDays: t.sDays, eDays: t.eDays, phase: t.phase, storey: t.storey };
      t.guids.forEach(g => { if (!guidTask[g] || win[t.id].s < win[guidTask[g]].s) guidTask[g] = t.id; });
    });
    const winGroups = {};
    elements.forEach(el => {
      const s = disp[el.guid] || { start: schedEnd, end: schedEnd + 60000 };
      const tid = guidTask[el.guid];
      if (tid == null || !win[tid]) return;
      const g = winGroups[tid] || (winGroups[tid] = { min: Infinity, max: -Infinity });
      if (s.start < g.min) g.min = s.start;
      if (s.end > g.max) g.max = s.end;
    });
    sb._cap = { base: baseMs, win: win, guidTask: guidTask };
    sb._winGroups = winGroups;

    const displayAuthored = o.db ? readDisplayAuthored(o.db) : false;
    let tiledMap = null;
    if (o.applyTiling) {
      if (typeof sb._tmTilePlayWithinTasks === 'function') {
        tiledMap = sb._tmTilePlayWithinTasks(disp, sb._cap, displayAuthored);
      } else {
        log('§TM_PLAYED_LAYER tiling UNAVAILABLE — this time_machine.js revision has no ' +
            '_tmTilePlayWithinTasks (pre-#1605); the played layer below is the affine, not the tiling');
      }
    }
    // bind(tiles) — the write loop, verbatim. Run once per variant; the CPM display pass above is
    // NOT repeated (it is one-shot: _displayTimeline._last is consumed), so the A/B columns are two
    // views of ONE run, which is the only way an A/B here is honest.
    function bind(tiles) {
      sb._tiledPlay = tiles;
      const map = {}; let clamped = 0, tiled = 0, uncovered = 0;
      elements.forEach(el => {
        const s = disp[el.guid] || { start: schedEnd, end: schedEnd + 60000 };
        const b = sb._tmRescaleToTaskWindow(el.guid, s);
        if (b.clamped) clamped++; else if (guidTask[el.guid] == null) uncovered++;
        if (b.tiled) tiled++;
        map[el.guid] = { s: b.start, e: b.end };
      });
      return { map: map, clamped: clamped, tiled: tiled, uncovered: uncovered };
    }
    // The AFFINE column (pre-#1605 behaviour) is only produced on request — an A/B probe needs it,
    // the cache does not.
    const affine = o.wantAffine ? bind(null) : null;
    const r = bind(tiledMap);
    // §TM_PLAYED_LAYER_MIDAIR — judge THIS map (the instants kernel_ops carries), via the owner. The
    // CPM-display count is kept, under its own name, so a reader can see both and neither is anonymous.
    const mj = judgePlayedMidair(sb, twItems, r.map, guidTask);
    const stats = { total: elements.length, clamped: r.clamped, tiled: r.tiled, uncovered: r.uncovered,
      displayAuthored: displayAuthored, cpm: dt && dt.cpm,
      midairPlayed: mj.unjudged ? null : mj.midair, midairPlayedJudged: mj.judged,
      midairPlayedGuids: mj.guids || [], midairPlayedStatus: describeMidair(mj),
      midairCpmDisplay: dt && dt.midair,
      applyTiling: !!o.applyTiling, tilingAvailable: typeof sb._tmTilePlayWithinTasks === 'function' };
    log('§TM_PLAYED_LAYER total=' + stats.total + ' clamped=' + r.clamped + ' tiled=' + r.tiled +
        ' uncovered=' + r.uncovered + ' display_authored=' + displayAuthored +
        ' cpm=' + stats.cpm +
        ' midairPlayed=' + describeMidair(mj) + ' judged=' + mj.judged + '/' + stats.total +
        ' layer=played owner=SupportSweep.midairAudit' +
        ' midairCpmDisplay=' + stats.midairCpmDisplay + ' (=§CPM_DISPLAY, the CPM-display times, NOT this layer)' +
        (mj.unjudged ? ' ⛔ ' + mj.unjudged : '') +
        ' (mirrors §TM_ELEMENT_WINDOW_BIND — these are the instants kernel_ops carries)');
    return { ok: true, play: r.map, affine: affine ? affine.map : null, tiledMap: tiledMap,
      disp: disp, win: win, guidTask: guidTask, winGroups: winGroups, twItems: twItems, stats: stats,
      midairPlayed: mj };
  }
}

module.exports = { sliceFn, buildSandbox, mirrorInjectGantt, readDisplayAuthored, judgePlayedMidair, describeMidair, TM_FNS, DAY_MS };
