#!/usr/bin/env node
// probe_tm_reveal_shipped.js — WHAT THE MOVIE ACTUALLY PLAYS, measured on the SHIPPED path.
//
// ⚠ DO NOT REMOVE — SCOPE (bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §FUTURE item 2,
// 2026-09-02 §TM_REVEAL_SHIPPED). User: "the sub structure and floor slabs are appearing all one
// shot instead of nicer progressive animation." Read the log after every run.
//
// WHY A NEW PROBE. Every reveal-spread number this lane has (§TPL_REVEAL_SPREAD, cache_4d_run.js,
// witness_day0_integrity.js) reads materializeZones' `displaySchedule` = remapSolveToTasks()
// (schedule_author.js:965). That map has ZERO readers in time_machine.js — the kernel_ops
// timestamps the Time Machine and the film play are written by injectGantt from
//   _displayTimeline(_twItems)          (CpmSchedule.run, time_machine.js ~4838)
//   -> _tmRescaleToTaskWindow(guid, s)  (per-task AFFINE onto the template window, ~4880)
//   -> kernel_ops.timestamp / _end_ts   (~4900)
// and the viewer reveals an element at op.start_ts <= cursor (time_machine.js:169-170, 2576).
// So this probe mirrors THAT chain, slicing the live functions out of time_machine.js by brace
// matching (same discipline as witness_tm_element_window_bind.js) — never re-typed.
//
// Per task it prints: the decile histogram of op.start inside the task's own window (the film's
// reveal distribution), the CPM group's raw span vs its Tukey-fenced core span (how much of the
// window the outlier-free mass is squashed into), and the outliers by name.
//
// Usage: node scripts/probe_tm_reveal_shipped.js [Building ...]   (default Duplex)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os');
const HOME = os.homedir();
const V = path.join(__dirname, '..', 'viewer');
const BLD_DIR = process.env.BLD_DIR || path.join(HOME, 'bim-ootb', 'buildings');
const DAY_MS = 86400000;
const START = '2026-01-01';
// Film arithmetic (§3 of the brief): the real Hospital bake was 2,027 frames (PR #1602 §CLI_BAKE);
// FRAMES/FPS are only used to translate "elements per calendar day" into "elements per frame".
const FRAMES = process.env.FRAMES ? Number(process.env.FRAMES) : 2027;
const FPS = process.env.FPS ? Number(process.env.FPS) : 15;

const SG = require(path.join(V, 'schedule_gate.js')); global.ScheduleGate = SG;
const SA = require(path.join(V, 'schedule_author.js'));
const SS = require(path.join(V, 'support_sweep.js')); global.SupportSweep = SS;
const CP = require(path.join(V, 'cpm_schedule.js')); global.CpmSchedule = CP;
const GM = require(path.join(V, 'gantt_model.js')); global.GanttModel = GM;
// §S50: the CELL gate resolves these on globalThis exactly like a browser window would.
globalThis.RoomWalker = require(path.join(V, 'lib', 'room_walker.js'));
globalThis.LevelDeriver = require(path.join(V, 'lib', 'level_deriver.js'));
globalThis.LocationAxis = require(path.join(V, 'location_axis.js'));
const T = JSON.parse(fs.readFileSync(path.join(V, 'rates', '4D_template.json'), 'utf8'));
const tmSrc = fs.readFileSync(path.join(V, 'time_machine.js'), 'utf8');

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
function executedRules() {
  const sb = { console: { log() {}, warn() {}, error() {} } };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(V, 'rates.js'), 'utf8'), sb);
  return sb;
}
// §S39/§S37-A2 rule (witness_midair_zero.js): prefer <bld>_meta.db, fall back to _extracted.db.
function resolveDbFile(bld) {
  const meta = path.join(BLD_DIR, bld + '_meta.db');
  const ext = path.join(BLD_DIR, bld + '_extracted.db');
  if (process.env.DB_KIND === 'extracted' && fs.existsSync(ext)) return { path: ext, kind: 'extracted' };
  if (fs.existsSync(meta)) return { path: meta, kind: 'meta' };
  return { path: ext, kind: 'extracted' };
}
function deciles(vals) {
  const h = new Array(10).fill(0);
  vals.forEach(p => { let b = Math.floor(Math.max(0, Math.min(1, p)) * 10); if (b > 9) b = 9; h[b]++; });
  return h.map(c => +(100 * c / Math.max(1, vals.length)).toFixed(1));
}

function buildSandbox(R) {
  const sb = {
    window: { LABOR_RATES: R.LABOR_RATES, GanttModel: GM, ScheduleAuthor: SA },
    ScheduleGate: SG, CpmSchedule: CP, GanttModel: GM, ScheduleAuthor: SA,
    _midairAudit: SS.midairAudit,
    console: console,
    // _tiledPlay stays null here so `_tmRescaleToTaskWindow` yields the PRE-FIX affine map (the
    // "SHIPPED-affine" label below = what played before §TM_REVEAL_TILED); the CANDIDATE map is the
    // shipped tiling function itself when the revision has it.
    _cap: null, _winGroups: {}, _tiledPlay: null, _rawScheduleRemember: null,
  };
  vm.createContext(sb);
  const code = [
    'var _CPM_DISPLAY = true;',
    sliceFn(tmSrc, '_tukeyBound'),
    sliceFn(tmSrc, '_displayTimelineRemember'),
    sliceFn(tmSrc, '_displayTimeline'),
    sliceFn(tmSrc, '_tmDisplayRemap'),
    sliceFn(tmSrc, '_tmRescaleToTaskWindow'),
    // §TM_REVEAL_TILED — optional so the probe still runs against a pre-fix revision (then the
    // CANDIDATE is computed by calling the verb directly, which is what the shipped function does).
    (tmSrc.indexOf('function _tmTilePlayWithinTasks(') >= 0 ? sliceFn(tmSrc, '_tmTilePlayWithinTasks') : 'var _tmTilePlayWithinTasks = null;'),
    'this._tmDisplayRemap = _tmDisplayRemap; this._displayTimeline = _displayTimeline;',
    'this._tmRescaleToTaskWindow = _tmRescaleToTaskWindow; this._tmTilePlayWithinTasks = _tmTilePlayWithinTasks;',
    'this.__getRaw = function () { return _rawScheduleRemember; };',
  ].join('\n');
  vm.runInContext(code, sb);
  return sb;
}

async function runBuilding(bld, SQL, R) {
  const dbf = resolveDbFile(bld);
  if (!fs.existsSync(dbf.path)) { console.log('§TM_REVEAL_SHIPPED_SKIP ' + bld + ' — no db'); return null; }
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(dbf.path)));
  const sb = buildSandbox(R);
  const SHIFT = T.calendar.hours_per_shift;
  const base = { start: START, laborRates: R.LABOR_RATES, rates: R.RATES,
    nameOverrides: R.SEQUENCE_NAME_OVERRIDES, defaultRule: R.SEQUENCE_DEFAULT,
    scheduleGate: SG, shiftHours: SHIFT, template: T, displayRemap: sb._tmDisplayRemap };
  const t0 = Date.now();
  const elements = SA._buildScheduleElements(db, R.SEQUENCE_RULES, base);
  globalThis.APP = { db: db };
  let res;
  try { res = SA.materializeZones(db, R.SEQUENCE_RULES, base); }
  finally { /* db stays open through the injectGantt mirror below */ }
  if (!res || !res.ok || !res.tasks) { console.log('§TM_REVEAL_SHIPPED_FAIL ' + bld + ' materializeZones ' + JSON.stringify(res && res.reason)); db.close(); delete globalThis.APP; return null; }
  console.log('§TM_REVEAL_SHIPPED_DB ' + bld + ' file=' + path.basename(dbf.path) + ' kind=' + dbf.kind +
    ' elements=' + elements.length + ' tasks=' + res.tasks.length + ' totalDays=' + res.totalDays +
    ' materializeMs=' + (Date.now() - t0));

  // ── injectGantt mirror: _twItems -> _displayTimeline (REUSE branch replays the hook's CPM) ──
  const raw = sb.__getRaw();
  if (!raw || !raw.map) { console.log('§TM_REVEAL_SHIPPED_FAIL ' + bld + ' hook did not remember the raw schedule'); db.close(); delete globalThis.APP; return null; }
  const baseMs = Date.parse(START);
  const twItems = elements.map(el => {
    const ts = raw.map[el.guid];
    return { guid: el.guid, s: ts ? ts.start : baseMs, e: ts ? ts.end : baseMs + 60000,
      bz: el.base_z, tz: el.top_z, x0: el.x0, x1: el.x1, y0: el.y0, y1: el.y1,
      cls: el.cls, seq: el.seq, phase: el.phase, storey: el.storey, resource: el.resource };
  });
  const dt = sb._displayTimeline(twItems);
  delete globalThis.APP;
  console.log('§TM_REVEAL_SHIPPED_DISPLAY ' + bld + ' cpm=' + (dt && dt.cpm) + ' midair=' + (dt && dt.midair) +
    ' (cpm=reuse means injectGantt replayed the hook\'s CPM timeline, exactly as the browser cold-open does)');
  const disp = {};
  twItems.forEach(it => { disp[it.guid] = { start: it.s, end: it.e }; });
  let schedEnd = baseMs;
  for (const g in disp) if (disp[g].end > schedEnd) schedEnd = disp[g].end;

  // ── _cap mirror: template task windows (the persisted `tasks` rows), guid -> earliest task ──
  const win = {}, guidTask = {};
  res.tasks.forEach(t => {
    win[t.id] = { s: baseMs + t.sDays * DAY_MS, e: baseMs + t.eDays * DAY_MS, name: t.id, sDays: t.sDays, eDays: t.eDays,
      phase: t.phase, storey: t.storey };
    t.guids.forEach(g => { if (!guidTask[g] || win[t.id].s < win[guidTask[g]].s) guidTask[g] = t.id; });
  });
  sb._cap = { win: win, guidTask: guidTask };
  // _winGroups — verbatim shape of time_machine.js injectGantt (~4872-4880)
  const winGroups = {};
  elements.forEach(el => {
    const s = disp[el.guid] || { start: schedEnd, end: schedEnd + 60000 };
    const tid = guidTask[el.guid];
    if (tid == null || !win[tid]) return;
    const g = winGroups[tid] || (winGroups[tid] = { min: Infinity, max: -Infinity });
    if (s.start < g.min) g.min = s.start;
    if (s.end > g.max) g.max = s.end;
  });
  sb._winGroups = winGroups;
  const op = {};
  let clamped = 0, uncovered = 0;
  elements.forEach(el => {
    const s = disp[el.guid] || { start: schedEnd, end: schedEnd + 60000 };
    const b = sb._tmRescaleToTaskWindow(el.guid, s);
    if (b.clamped) clamped++; else if (guidTask[el.guid] == null) uncovered++;
    op[el.guid] = { s: b.start, e: b.end };
  });
  console.log('§TM_REVEAL_SHIPPED_BIND ' + bld + ' total=' + elements.length + ' clamped=' + clamped + ' uncovered=' + uncovered +
    ' (mirrors §TM_ELEMENT_WINDOW_BIND)');

  // ── CANDIDATE (A/B): the tiling verb schedule_author already owns, applied in CPM order ──
  // ScheduleAuthor.remapSolveToTasks(solve, tasks, startISO, layerOf=null): one band per task, members
  // ordered by the solve's own start (here: the CPM display time the movie plays TODAY, so every
  // ordering CPM established survives — monotone, ties on guid), each element's width = its own CPM
  // duration, tiled edge-to-edge across the task's window. No number invented; no window moved.
  const capTasks = res.tasks.map(t => ({ id: t.id, sDays: t.sDays, eDays: t.eDays, guids: t.guids.filter(g => guidTask[g] === t.id) }));
  // Prefer the SHIPPED function (sliced out of time_machine.js) so the CANDIDATE column measures the
  // code that ships, not a re-derivation; a pre-fix revision falls back to calling the verb directly.
  const tiled = (typeof sb._tmTilePlayWithinTasks === 'function')
    ? sb._tmTilePlayWithinTasks(disp, { base: baseMs, win: win, guidTask: guidTask }, true)
    : SA.remapSolveToTasks(disp, capTasks, START, null).schedule;
  console.log('§TM_REVEAL_SHIPPED_CANDIDATE ' + bld + ' source=' + (typeof sb._tmTilePlayWithinTasks === 'function' ? 'time_machine.js _tmTilePlayWithinTasks (shipped)' : 'ScheduleAuthor.remapSolveToTasks (direct call, pre-fix revision)'));
  const opFix = {};
  elements.forEach(el => { const t = tiled[el.guid]; opFix[el.guid] = t ? { s: t.start, e: t.end } : op[el.guid]; });
  let pStart0 = Infinity, pEnd0 = -Infinity;
  elements.forEach(e => { if (op[e.guid].s < pStart0) pStart0 = op[e.guid].s; if (op[e.guid].e > pEnd0) pEnd0 = op[e.guid].e; });

  // ── judges on BOTH played maps (impact numbers, not opinions) ──
  function judge(map, label) {
    const m = {}; elements.forEach(e => { m[e.guid] = { start: map[e.guid].s, end: map[e.guid].e }; });
    const q = console.log; console.log = () => {};
    let fl, ma, cjp;
    try {
      fl = SG.auditFloating(elements, m, null, null, null);
      const its = twItems.map(it => Object.assign({}, it, { s: map[it.guid].s, e: map[it.guid].e, task: guidTask[it.guid] }));
      ma = SS.midairAudit(its);
      cjp = SS.cjpJudgeParity(its.map(it => Object.assign({}, it)), win);
    } finally { console.log = q; }
    console.log('§TM_REVEAL_JUDGE ' + bld + ' map=' + label + ' auditFloating=' + fl + '/' + elements.length +
      ' midair=' + ma.midair + ' orphans=' + ma.orphans + ' cjpFloating=' + cjp.floating + ' windowBlocked=' + cjp.windowBlocked +
      ' cjpPushed=' + cjp.pushed + ' (same judges injectGantt runs: §SUPPORT_CHECK / §CPM_DISPLAY midair / §CROSSTASK_JUDGE_PARITY)');
  }
  // ── DAY-0 purity on the PLAYED layer (witness_day0_integrity C2 judges displaySchedule, not this) ──
  function day0(map, label) {
    let t0 = Infinity; elements.forEach(e => { if (map[e.guid].s < t0) t0 = map[e.guid].s; });
    const hist = {}; let n = 0, impure = 0; const modelsSub = elements.some(e => e.seq === 1);
    elements.forEach(e => { if (map[e.guid].s <= t0 + DAY_MS) { n++; hist[e.phase] = (hist[e.phase] || 0) + 1; if (modelsSub ? e.seq !== 1 : e.seq > 4) impure++; } });
    console.log('§TM_REVEAL_DAY0 ' + bld + ' map=' + label + ' onScreenDay0=' + n + ' impure=' + impure + ' phases=' + JSON.stringify(hist));
  }
  // ── (task, class) concentration — the acceptance shape: "a whole floor slab should not appear all at once" ──
  function groupConc(map, label) {
    const groups = {};
    elements.forEach(e => { const t = guidTask[e.guid]; if (!t) return; const k = t + '||' + e.cls; (groups[k] = groups[k] || []).push(e.guid); });
    const rows = [];
    for (const k in groups) {
      const gs = groups[k]; if (gs.length < 5) continue;
      const tid = k.split('||')[0], cls = k.split('||')[1]; const w = win[tid], span = w.e - w.s;
      const pos = gs.map(g => (map[g].s - w.s) / span);
      const dec = deciles(pos); const maxDec = Math.max.apply(null, dec);
      const starts = gs.map(g => map[g].s).sort((a, b) => a - b);
      const gSpanD = (starts[starts.length - 1] - starts[0]) / DAY_MS;
      const distinct = new Set(starts).size;
      // "one shot" = the densest 1% of the window (1.35 s of a 135 s film on Hospital's 318 d)
      const bins = new Array(100).fill(0); pos.forEach(p => { bins[Math.floor(Math.max(0, Math.min(0.999, p)) * 100)]++; });
      const max1 = Math.max.apply(null, bins);
      rows.push({ task: tid, cls, n: gs.length, days: +(span / DAY_MS).toFixed(1), maxDecilePct: maxDec, max1pctBinPct: +(100 * max1 / gs.length).toFixed(1),
        distinctStarts: distinct, groupSpanDays: +gSpanD.toFixed(2),
        groupSpanFilmSec: +((gSpanD / ((pEnd0 - pStart0) / DAY_MS)) * (FRAMES / FPS)).toFixed(2), deciles: dec });
    }
    rows.sort((a, b) => b.maxDecilePct - a.maxDecilePct);
    rows.filter(r => /IfcSlab|IfcFooting/.test(r.cls)).forEach(r => console.log('§TM_REVEAL_GROUP ' + bld + ' map=' + label + ' ' + r.task + ' ' + r.cls +
      ' n=' + r.n + ' taskDays=' + r.days + ' maxDecile=' + r.maxDecilePct + '% max1pctBin=' + r.max1pctBinPct + '% distinctStarts=' + r.distinctStarts +
      ' groupSpan=' + r.groupSpanDays + 'd=' + r.groupSpanFilmSec + 's-of-film deciles=[' + r.deciles.join(',') + ']'));
    const worst = rows.slice(0, 6).map(r => r.task + '/' + r.cls + ' n=' + r.n + ' maxDecile=' + r.maxDecilePct + '% max1pct=' + r.max1pctBinPct + '%');
    const over50 = rows.filter(r => r.maxDecilePct > 50).length;
    console.log('§TM_REVEAL_GROUP_SUMMARY ' + bld + ' map=' + label + ' groups(n>=5)=' + rows.length + ' groupsWithOneDecileOver50pct=' + over50 +
      ' worst=' + JSON.stringify(worst));
  }
  // dead air (no member in progress) + pile-up per task, both maps
  function deadAir(map, label) {
    let worst = { pct: -1 }, sumPct = 0, nT = 0, maxBin = { pct: -1 };
    capTasks.forEach(t => { const w = win[t.id], span = w.e - w.s; const gs = t.guids; if (gs.length < 2) return;
      const iv = gs.map(g => [map[g].s, map[g].e]).sort((a, b) => a[0] - b[0]);
      let cov = 0, cur = w.s; iv.forEach(([s, e]) => { const a = Math.max(s, cur), b = Math.min(e, w.e); if (b > a) cov += b - a; if (e > cur) cur = e; });
      const pct = 100 * (1 - cov / span); sumPct += pct; nT++; if (pct > worst.pct) worst = { pct, id: t.id, n: gs.length };
      const bins = new Array(100).fill(0); gs.forEach(g => { bins[Math.floor(Math.max(0, Math.min(0.999, (map[g].s - w.s) / span)) * 100)]++; });
      const m = Math.max.apply(null, bins) / gs.length * 100; if (gs.length >= 20 && m > maxBin.pct) maxBin = { pct: m, id: t.id, n: gs.length }; });
    console.log('§TM_REVEAL_DEADAIR ' + bld + ' map=' + label + ' tasks=' + nT + ' meanDeadAirPct=' + (sumPct / Math.max(1, nT)).toFixed(1) +
      ' worst=' + worst.pct.toFixed(1) + '%@' + worst.id + '(n=' + worst.n + ')' +
      ' | pileup: max share of a task(n>=20) starting inside one 1%-of-window bin=' + maxBin.pct.toFixed(1) + '%@' + maxBin.id + '(n=' + maxBin.n + ')');
  }
  // ── REPORT-ONLY (axis B is out of this lane): §CPE_BUILDUP_ONSET_BLEND cursor over the played ops ──
  function onset(map, label) {
    const ends = elements.map(e => map[e.guid].e).sort((a, b) => a - b);
    const ps = Math.min.apply(null, elements.map(e => map[e.guid].s)), pe = ends[ends.length - 1];
    const totalSec = FRAMES / FPS, onsetU = Math.min(0.5, 10 / totalSec);
    const subG = elements.filter(e => /Substructure/.test(guidTask[e.guid] || ''));
    const subN = subG.length; if (!subN) return;
    function placedAt(c) { let n = 0; subG.forEach(e => { if (map[e.guid].s <= c) n++; }); return n; }
    function cursor(t, blend) { const cal = ps + t * (pe - ps); if (!blend || t >= onsetU) return cal;
      const k = Math.max(1, Math.min(ends.length, Math.round(t * ends.length))); const el = ends[k - 1]; return el + (cal - el) * (t / onsetU); }
    const out = {};
    [false, true].forEach(bl => { const r = []; [0.5, 0.9, 1.0].forEach(m => { for (let f = 0; f < FRAMES; f++) { if (placedAt(cursor(f / FRAMES, bl)) >= m * subN) { r.push(m + '@f' + f + '=' + (f / FPS).toFixed(1) + 's'); break; } } }); out[bl ? 'onsetBlend' : 'calendarLinear'] = r.join(' '); });
    let maxPerFrame = 0, prev = 0; for (let f = 1; f < 200; f++) { const c = placedAt(cursor(f / FRAMES, true)); if (c - prev > maxPerFrame) maxPerFrame = c - prev; prev = c; }
    console.log('§TM_REVEAL_ONSET_REPORT ' + bld + ' map=' + label + ' substructure n=' + subN + ' film=' + totalSec.toFixed(1) + 's onsetU=' + onsetU.toFixed(4) +
      ' calendarLinear{' + out.calendarLinear + '} onsetBlend{' + out.onsetBlend + '} maxSubstructurePlacedPerFrame(onsetBlend,first200f)=' + maxPerFrame +
      ' — REPORT ONLY: the film cursor is out of this lane (coordinator scope correction 2026-09-02)');
  }
  judge(op, 'SHIPPED-affine'); judge(opFix, 'CANDIDATE-tiled');
  day0(op, 'SHIPPED-affine'); day0(opFix, 'CANDIDATE-tiled');
  groupConc(op, 'SHIPPED-affine'); groupConc(opFix, 'CANDIDATE-tiled');
  deadAir(op, 'SHIPPED-affine'); deadAir(opFix, 'CANDIDATE-tiled');
  { let viol = 0, pairs = 0;
    capTasks.forEach(t => { const gs = t.guids.slice().sort((a, b) => disp[a].start - disp[b].start || (a < b ? -1 : 1));
      for (let i = 1; i < gs.length; i++) { pairs++; if (opFix[gs[i]].s < opFix[gs[i - 1]].s) viol++; } });
    console.log('§TM_REVEAL_ORDER ' + bld + ' candidate order-vs-CPM violations=' + viol + '/' + pairs + ' adjacent pairs (0 = every CPM ordering survives)'); }
  onset(op, 'SHIPPED-affine'); onset(opFix, 'CANDIDATE-tiled');

  // ── per-task reveal distribution of what PLAYS, vs what the cache measured (displaySchedule) ──
  const elBy = {}; elements.forEach(e => { elBy[e.guid] = e; });
  const rows = [];
  const aggPlay = [], aggDisp = [];
  res.tasks.forEach(t => {
    const w = win[t.id], span = w.e - w.s;
    const members = t.guids.filter(g => guidTask[g] === t.id && disp[g]);
    if (!members.length) return;
    const posPlay = members.map(g => (op[g].s - w.s) / span);
    const posDisp = members.map(g => res.displaySchedule[g] ? (res.displaySchedule[g].start - w.s) / span : 0);
    posPlay.forEach(p => aggPlay.push(p)); posDisp.forEach(p => aggDisp.push(p));
    const g = winGroups[t.id];
    const starts = members.map(g2 => disp[g2].start), ends = members.map(g2 => disp[g2].end);
    const lo = GM.tukeyBound(starts, true), hi = GM.tukeyBound(ends, false);
    const rawSpan = g.max - g.min, coreSpan = Math.max(0, hi - lo);
    const outl = members.filter(g2 => disp[g2].start < lo || disp[g2].end > hi);
    const first1 = posPlay.filter(p => p < 0.01).length, firstHour = members.filter(g2 => op[g2].s - w.s < 3600000).length;
    // outliers by name — the elements whose CPM time stretches the group's raw span
    const outlDesc = outl.slice().sort((a, b) => disp[b].end - disp[a].end).slice(0, 3).map(g2 => {
      const e = elBy[g2];
      return e.cls + '@' + (e.storey || '?') + ' cpm=[' + ((disp[g2].start - g.min) / DAY_MS).toFixed(1) + 'd,' + ((disp[g2].end - g.min) / DAY_MS).toFixed(1) + 'd]';
    });
    rows.push({ id: t.id, n: members.length, days: t.eDays - t.sDays,
      playDeciles: deciles(posPlay), dispDeciles: deciles(posDisp),
      first1pct: +(100 * first1 / members.length).toFixed(1), firstHourPct: +(100 * firstHour / members.length).toFixed(1),
      rawSpanDays: +(rawSpan / DAY_MS).toFixed(2), coreSpanDays: +(coreSpan / DAY_MS).toFixed(2),
      coreFracOfWindow: +(rawSpan > 0 ? coreSpan / rawSpan : 1).toFixed(4),
      outliers: outl.length, outlierDesc: outlDesc });
  });
  rows.sort((a, b) => b.playDeciles[0] - a.playDeciles[0]);
  rows.forEach(r => {
    console.log('§TM_REVEAL_SHIPPED_TASK ' + bld + ' ' + r.id + ' n=' + r.n + ' days=' + r.days +
      ' PLAY.deciles=[' + r.playDeciles.join(',') + '] first1pct=' + r.first1pct + '% firstHour=' + r.firstHourPct + '%' +
      ' | cpmRawSpan=' + r.rawSpanDays + 'd coreSpan=' + r.coreSpanDays + 'd coreFracOfWindow=' + r.coreFracOfWindow +
      ' outliers=' + r.outliers + (r.outlierDesc.length ? ' [' + r.outlierDesc.join(' | ') + ']' : '') +
      ' | displaySchedule.deciles=[' + r.dispDeciles.join(',') + '] (the layer the cache measured — NOT played)');
  });
  const aggP = deciles(aggPlay), aggD = deciles(aggDisp);
  console.log('§TM_REVEAL_SHIPPED_AGG ' + bld + ' n=' + aggPlay.length + ' PLAY.decilePct=[' + aggP.join(',') + ']' +
    ' displaySchedule.decilePct=[' + aggD.join(',') + ']' +
    ' — PLAY is what kernel_ops carries (the film + scrubber); displaySchedule is remapSolveToTasks, unread by time_machine.js');
  const sub = rows.filter(r => /Substructure/.test(r.id));
  const slabTasks = res.tasks.map(t => ({ id: t.id, slabs: t.guids.filter(g => elBy[g] && elBy[g].cls === 'IfcSlab' && guidTask[g] === t.id).length }))
    .filter(x => x.slabs > 0).sort((a, b) => b.slabs - a.slabs).slice(0, 5);
  console.log('§TM_REVEAL_SHIPPED_SLABS ' + bld + ' IfcSlab total=' + elements.filter(e => e.cls === 'IfcSlab').length +
    ' topTasks=' + JSON.stringify(slabTasks));

  // ── film arithmetic: elements placed per FRAME on a calendar-linear cursor (§CPE_BUILDUP_EVEN_TEMPO) ──
  const starts = elements.map(e => op[e.guid].s).sort((a, b) => a - b);
  const pStart = starts[0], pEnd = Math.max.apply(null, elements.map(e => op[e.guid].e));
  const stepMs = (pEnd - pStart) / FRAMES;
  const perFrame = new Array(FRAMES).fill(0);
  starts.forEach(s => { let f = Math.floor((s - pStart) / stepMs); if (f >= FRAMES) f = FRAMES - 1; perFrame[f]++; });
  const worst = perFrame.reduce((m, c, i) => c > m.c ? { c, i } : m, { c: -1, i: -1 });
  const first30 = perFrame.slice(0, 30);
  const subRow = sub[0];
  const subFrames = subRow ? Math.round((subRow.days * DAY_MS) / stepMs) : 0;
  console.log('§TM_REVEAL_SHIPPED_FILM ' + bld + ' frames=' + FRAMES + ' fps=' + FPS + ' projectDays=' + ((pEnd - pStart) / DAY_MS).toFixed(1) +
    ' daysPerFrame=' + (stepMs / DAY_MS).toFixed(3) + ' meanPerFrame=' + (elements.length / FRAMES).toFixed(1) +
    ' worstFrame=' + worst.c + '@f' + worst.i + ' first30frames=[' + first30.join(',') + ']' +
    (subRow ? ' substructure: n=' + subRow.n + ' window=' + subRow.days + 'd=' + subFrames + ' frames (' + (subFrames / FPS).toFixed(1) + 's of film)' +
      ' evenWouldBe=' + (subRow.n / Math.max(1, subFrames)).toFixed(1) + '/frame' : ''));
  db.close();
  return { bld, rows, aggP, aggD, perFrame };
}

(async () => {
  const initSqlJs = require(path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js'));
  const SQL = await initSqlJs({ locateFile: f => path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js', 'dist', f) });
  const R = executedRules();
  const list = process.argv.slice(2).filter(a => a[0] !== '-');
  for (const b of (list.length ? list : ['Duplex'])) await runBuilding(b, SQL, R);
})().catch(e => { console.error('§TM_REVEAL_SHIPPED_ERROR ' + (e && e.stack || e)); process.exit(2); });
