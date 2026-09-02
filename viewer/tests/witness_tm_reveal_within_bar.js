#!/usr/bin/env node
// WITNESS — W-RWB — §TM_REVEAL_TILED: WHERE inside its bar each element PLAYS (the kernel_ops layer).
// Spec: bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §FUTURE item 2, "2026-09-02 — §TM_REVEAL_SHIPPED"
// §D (the fix) and §E (these claims, written before the code).
//
// ISSUE THIS PROVES OR DISPROVES (user, 2026-09-02: "the sub structure and floor slabs are appearing
// all one shot instead of nicer progressive animation"): the timestamps the Time Machine scrubber and
// the film play were written by injectGantt's per-task AFFINE (_tmRescaleToTaskWindow), which
// preserves the CPM group's absolute spacing — and CPM's global crew pools give a task's members a raw
// span of up to 434 d for a 35-day bar, so the group's core mass landed in a sliver of the bar and the
// rest was dead air (measured mean 44-71% of every bar, 4 buildings; Hospital footings on 200 distinct
// instants in the first half of an 11-day bar). Every earlier reveal-spread number in this lane
// (§TPL_REVEAL_SPREAD, the cache, witness_day0_integrity) judged `displaySchedule` — a map
// time_machine.js never reads.
//
// WHICH LAYER THIS PROVES: the PLAYED layer — the interval _tmRescaleToTaskWindow hands the kernel_ops
// INSERT — produced by the SHIPPED functions sliced out of time_machine.js by brace matching (the
// witness_tm_element_window_bind.js discipline) and driven by REAL buildings through the real chain
// (_buildScheduleElements → computeSchedule → _tmDisplayRemap/_displayTimeline (CpmSchedule, CELL
// gate live) → template tasks → _tmTilePlayWithinTasks → _tmRescaleToTaskWindow). No browser, no
// bake. It says nothing about pixels or the film cursor (out of this lane).
//
// Every claim reports the population it judged; a claim over an empty population prints INCONCLUSIVE,
// never PASS (PRIMAL LAW clause 4). Read the log after every run.
//
//   W-RWB-R  redControl: with the tiling DISABLED (the pre-fix affine), this input shows the defect —
//            mean dead air > 0 and at least one (task,class) group with >50% of its members in one
//            decile of its bar. Proves W-RWB-1/5 are not vacuous.
//   W-RWB-1  no dead air: with the shipped tiling, every task (n>=2) has a dead-air share of 0 (tolerance
//            1 ms of rounding per element).
//   W-RWB-2  inside window: every tiled element satisfies wS <= start < end <= wE.
//   W-RWB-3  order preserved: within each task, starts are non-decreasing in CPM-start order (ties on
//            guid) — the monotone property the affine was chosen for survives.
//   W-RWB-4  contiguous tiles: first start == wS, last end == wE, each start == the previous end (±1 ms).
//   W-RWB-5  the acceptance shape ("a whole floor slab should not appear all at once"): every
//            (task,class) group (n>=5) has distinctStarts == n, and the number of groups with one decile
//            holding >50% of the group is <= the affine's count (both reported).
//   W-RWB-6  fallback: an unmapped guid gets the affine result unchanged; displayAuthored=false returns
//            null and logs the §TM_REVEAL_TILED skip.
//   W-RWB-7  wiring (source text): injectGantt calls _tmTilePlayWithinTasks before the write loop;
//            _tmRescaleToTaskWindow consults _tiledPlay before the affine; _GANTT_CACHE_VERSION >= 38;
//            §TM_ELEMENT_WINDOW_BIND reports tiled=.
//   Reported, not gated (no threshold exists that is not invented): the three judges injectGantt runs
//   (auditFloating / midair / cjpJudgeParity) on the affine map and on the tiled map, per building.
//
// Command: node viewer/tests/witness_tm_reveal_within_bar.js [Building ...]
//          (default Duplex HHS_Office_Federated Hospital; env DB_KIND=extracted to force *_extracted.db)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os');
const HOME = os.homedir();
const V = path.join(__dirname, '..');
const BLD_DIR = process.env.BLD_DIR || path.join(HOME, 'bim-ootb', 'buildings');
const DAY_MS = 86400000, START = '2026-01-01';

const SG = require(path.join(V, 'schedule_gate.js')); global.ScheduleGate = SG;
const SA = require(path.join(V, 'schedule_author.js'));
const SS = require(path.join(V, 'support_sweep.js')); global.SupportSweep = SS;
const CP = require(path.join(V, 'cpm_schedule.js')); global.CpmSchedule = CP;
const GM = require(path.join(V, 'gantt_model.js')); global.GanttModel = GM;
globalThis.RoomWalker = require(path.join(V, 'lib', 'room_walker.js'));
globalThis.LevelDeriver = require(path.join(V, 'lib', 'level_deriver.js'));
globalThis.LocationAxis = require(path.join(V, 'location_axis.js'));
const T = JSON.parse(fs.readFileSync(path.join(V, 'rates', '4D_template.json'), 'utf8'));
const tmSrc = fs.readFileSync(path.join(V, 'time_machine.js'), 'utf8');

let pass = 0, fail = 0, inconclusive = 0;
function claim(id, pop, bad, detail) {
  const v = pop === 0 ? 'INCONCLUSIVE' : (bad === 0 ? 'PASS' : 'FAIL');
  if (v === 'PASS') pass++; else if (v === 'FAIL') fail++; else inconclusive++;
  console.log('§W_RWB ' + id.padEnd(9) + v.padEnd(13) + 'judged=' + String(pop).padEnd(7) + 'bad=' + String(bad).padEnd(6) + (detail || ''));
  return v;
}
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
  vm.createContext(sb); vm.runInContext(fs.readFileSync(path.join(V, 'rates.js'), 'utf8'), sb);
  return sb;
}
function resolveDbFile(bld) {
  const meta = path.join(BLD_DIR, bld + '_meta.db'), ext = path.join(BLD_DIR, bld + '_extracted.db');
  if (process.env.DB_KIND === 'extracted' && fs.existsSync(ext)) return ext;
  // *_meta.db is the viewer's file where it exists, but a split without elements_meta (Duplex) is not usable here
  if (fs.existsSync(meta)) { try { const b = fs.readFileSync(meta); if (b.length > 100 && b.indexOf('elements_meta') > 0) return meta; } catch (e) {} }
  return ext;
}
function buildSandbox(R, logSink) {
  const sb = {
    window: { LABOR_RATES: R.LABOR_RATES, GanttModel: GM, ScheduleAuthor: SA },
    ScheduleGate: SG, CpmSchedule: CP, GanttModel: GM, ScheduleAuthor: SA,
    _midairAudit: SS.midairAudit,
    console: { log: (...a) => logSink.push(a.join(' ')), warn: (...a) => logSink.push(a.join(' ')), error: (...a) => logSink.push(a.join(' ')) },
    _cap: null, _winGroups: {}, _tiledPlay: null, _rawScheduleRemember: null, isFinite, Math, Date, Infinity,
  };
  vm.createContext(sb);
  vm.runInContext(['var _CPM_DISPLAY = true;', sliceFn(tmSrc, '_tukeyBound'), sliceFn(tmSrc, '_displayTimelineRemember'),
    sliceFn(tmSrc, '_displayTimeline'), sliceFn(tmSrc, '_tmDisplayRemap'), sliceFn(tmSrc, '_tmTilePlayWithinTasks'),
    sliceFn(tmSrc, '_tmRescaleToTaskWindow'),
    'this._tmDisplayRemap = _tmDisplayRemap; this._displayTimeline = _displayTimeline;',
    'this._tmTilePlayWithinTasks = _tmTilePlayWithinTasks; this._tmRescaleToTaskWindow = _tmRescaleToTaskWindow;',
    'this.__getRaw = function () { return _rawScheduleRemember; };'].join('\n'), sb);
  return sb;
}
function deciles(pos) { const h = new Array(10).fill(0); pos.forEach(p => { let b = Math.floor(Math.max(0, Math.min(1, p)) * 10); if (b > 9) b = 9; h[b]++; }); return h; }

// ── W-RWB-7 wiring, source text (no DB needed) ────────────────────────────────────────────────
{
  const ig = tmSrc.indexOf('async function injectGantt(') >= 0 ? tmSrc.slice(tmSrc.indexOf('async function injectGantt(')) : tmSrc.slice(tmSrc.indexOf('function injectGantt('));
  const iCall = ig.indexOf('var _tiledPlay = _tmTilePlayWithinTasks(_disp, _cap, _playDisplayAuthored);');
  const iBound = ig.indexOf('var bound = _tmRescaleToTaskWindow(el.guid, s);');
  const rs = sliceFn(tmSrc, '_tmRescaleToTaskWindow');
  const iConsult = rs.indexOf('if (_tiledPlay && _tiledPlay[guid])'), iAffine = rs.indexOf('if (!_cap) return s;');
  const ver = (tmSrc.match(/var _GANTT_CACHE_VERSION = (\d+);/) || [])[1];
  const bindLine = /'§TM_ELEMENT_WINDOW_BIND total=' \+ elements\.length \+ ' clamped=' \+ _windowClamped \+\s*' tiled=' \+ _windowTiled/.test(tmSrc);
  let bad = 0;
  if (!(iCall > 0 && iBound > iCall)) bad++;
  if (!(iConsult >= 0 && iAffine > iConsult)) bad++;
  if (!(Number(ver) >= 38)) bad++;
  if (!bindLine) bad++;
  claim('W-RWB-7', 4, bad, 'call-before-write=' + (iCall > 0 && iBound > iCall) + ' consult-before-affine=' + (iConsult >= 0 && iAffine > iConsult) +
    ' _GANTT_CACHE_VERSION=' + ver + ' bindLogsTiled=' + bindLine);
}

async function runBuilding(bld, SQL, R) {
  const dbf = resolveDbFile(bld);
  if (!fs.existsSync(dbf)) { console.log('§W_RWB SKIP ' + bld + ' — no db'); return; }
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(dbf)));
  const sbLog = [];
  const sb = buildSandbox(R, sbLog);
  const base = { start: START, laborRates: R.LABOR_RATES, rates: R.RATES, nameOverrides: R.SEQUENCE_NAME_OVERRIDES,
    defaultRule: R.SEQUENCE_DEFAULT, scheduleGate: SG, shiftHours: T.calendar.hours_per_shift, template: T, displayRemap: sb._tmDisplayRemap };
  const quiet = console.log; const saLog = []; console.log = (...a) => saLog.push(a.join(' '));
  let elements, res, raw, twItems, dt;
  try {
    elements = SA._buildScheduleElements(db, R.SEQUENCE_RULES, base);
    globalThis.APP = { db };
    res = SA.materializeZones(db, R.SEQUENCE_RULES, base);
    raw = sb.__getRaw();
    const baseMs = Date.parse(START);
    twItems = elements.map(el => { const ts = raw && raw.map[el.guid];
      return { guid: el.guid, s: ts ? ts.start : baseMs, e: ts ? ts.end : baseMs + 60000, bz: el.base_z, tz: el.top_z,
        x0: el.x0, x1: el.x1, y0: el.y0, y1: el.y1, cls: el.cls, seq: el.seq, phase: el.phase, storey: el.storey, resource: el.resource }; });
    dt = sb._displayTimeline(twItems);
  } finally { console.log = quiet; delete globalThis.APP; }
  const cellLine = sbLog.find(l => l.indexOf('§CELL_GATE') === 0) || '';
  console.log('§W_RWB_BUILDING ' + bld + ' db=' + path.basename(dbf) + ' elements=' + elements.length + ' tasks=' + (res && res.tasks ? res.tasks.length : 0) +
    ' cpm=' + (dt && dt.cpm) + ' ' + (cellLine.match(/repr=[\d.]+% mark=\d+% promoted=\d+ path=\w+/) || [''])[0]);
  if (!res || !res.ok || !res.tasks || !(dt && (dt.cpm === 'reuse' || dt.cpm === true))) {
    claim('W-RWB-0', 0, 0, bld + ' chain did not produce a played timeline (materializeZones ok=' + (res && res.ok) + ', cpm=' + (dt && dt.cpm) + ')');
    db.close(); return;
  }
  const disp = {}; twItems.forEach(it => { disp[it.guid] = { start: it.s, end: it.e }; });
  let schedEnd = -Infinity; for (const g in disp) if (disp[g].end > schedEnd) schedEnd = disp[g].end;
  const baseMs = Date.parse(START), win = {}, guidTask = {};
  res.tasks.forEach(t => { win[t.id] = { s: baseMs + t.sDays * DAY_MS, e: baseMs + t.eDays * DAY_MS, name: t.id };
    t.guids.forEach(g => { if (!guidTask[g] || win[t.id].s < win[guidTask[g]].s) guidTask[g] = t.id; }); });
  const cap = { base: baseMs, win, guidTask, taskCount: res.tasks.length };
  const winGroups = {};
  elements.forEach(el => { const s = disp[el.guid] || { start: schedEnd, end: schedEnd + 60000 }; const tid = guidTask[el.guid];
    if (tid == null || !win[tid]) return; const g = winGroups[tid] || (winGroups[tid] = { min: Infinity, max: -Infinity });
    if (s.start < g.min) g.min = s.start; if (s.end > g.max) g.max = s.end; });
  sb._cap = cap; sb._winGroups = winGroups;
  const tasks = res.tasks.map(t => ({ id: t.id, guids: t.guids.filter(g => guidTask[g] === t.id && disp[g]) })).filter(t => t.guids.length);

  function playMap(tiled) {
    sb._tiledPlay = tiled;
    const m = {};
    elements.forEach(el => { const s = disp[el.guid] || { start: schedEnd, end: schedEnd + 60000 }; const b = sb._tmRescaleToTaskWindow(el.guid, s); m[el.guid] = { s: b.start, e: b.end, tiled: !!b.tiled }; });
    return m;
  }
  function deadAir(map) {
    let sum = 0, n = 0, badTasks = 0, worst = { pct: -1 };
    tasks.forEach(t => { if (t.guids.length < 2) return; const w = win[t.id], span = w.e - w.s;
      const iv = t.guids.map(g => [map[g].s, map[g].e]).sort((a, b) => a[0] - b[0]);
      let cov = 0, cur = w.s; iv.forEach(([s, e]) => { const a = Math.max(s, cur), b = Math.min(e, w.e); if (b > a) cov += b - a; if (e > cur) cur = e; });
      const deadMs = span - cov, pct = 100 * deadMs / span; sum += pct; n++;
      if (deadMs > t.guids.length) badTasks++;           // 1 ms of rounding per element is the only tolerance
      if (pct > worst.pct) worst = { pct, id: t.id, n: t.guids.length }; });
    return { mean: n ? sum / n : 0, n, badTasks, worst };
  }
  function groups(map) {
    const gr = {}; elements.forEach(e => { const t = guidTask[e.guid]; if (!t || !disp[e.guid]) return; (gr[t + '||' + e.cls] = gr[t + '||' + e.cls] || []).push(e.guid); });
    const rows = [];
    for (const k in gr) { const gs = gr[k]; if (gs.length < 5) continue; const tid = k.split('||')[0], w = win[tid], span = w.e - w.s;
      const dec = deciles(gs.map(g => (map[g].s - w.s) / span)); const maxDec = Math.max.apply(null, dec) / gs.length * 100;
      rows.push({ k, n: gs.length, maxDec, distinct: new Set(gs.map(g => map[g].s)).size }); }
    return rows;
  }
  function judges(map, label) {
    const m = {}; elements.forEach(e => { m[e.guid] = { start: map[e.guid].s, end: map[e.guid].e }; });
    const q = console.log; console.log = () => {};
    let fl, ma, cjp;
    try { fl = SG.auditFloating(elements, m, null, null, null);
      const its = twItems.map(it => Object.assign({}, it, { s: map[it.guid].s, e: map[it.guid].e, task: guidTask[it.guid] }));
      ma = SS.midairAudit(its); cjp = SS.cjpJudgeParity(its.map(it => Object.assign({}, it)), win);
    } finally { console.log = q; }
    console.log('§W_RWB_JUDGE ' + bld + ' map=' + label + ' auditFloating=' + fl + '/' + elements.length + ' midair=' + ma.midair +
      ' cjpFloating=' + cjp.floating + ' windowBlocked=' + cjp.windowBlocked + ' (reported, not gated)');
  }

  // ── W-RWB-R redControl: the affine alone (tiling disabled) ────────────────────────────────
  const affine = playMap(null);
  const daA = deadAir(affine), grA = groups(affine), over50A = grA.filter(r => r.maxDec > 50).length;
  claim('W-RWB-R', daA.n + grA.length, (daA.mean > 0 && over50A >= 1) ? 0 : 1, bld + ' affine-only: meanDeadAir=' + daA.mean.toFixed(1) +
    '% worst=' + daA.worst.pct.toFixed(1) + '%@' + daA.worst.id + ' groups>50%InOneDecile=' + over50A + '/' + grA.length + ' — the defect is present on this input');

  // ── the shipped tiling ────────────────────────────────────────────────────────────────────
  const before = sbLog.length;
  const tiled = sb._tmTilePlayWithinTasks(disp, cap, true);
  const tiledLine = sbLog.slice(before).find(l => l.indexOf('§TM_REVEAL_TILED') === 0) || '';
  console.log(tiledLine + '  [' + bld + ']');
  const map = playMap(tiled);
  const nTiled = elements.filter(e => map[e.guid].tiled).length;

  // W-RWB-1 no dead air
  const daT = deadAir(map);
  claim('W-RWB-1', daT.n, daT.badTasks, bld + ' tiled: meanDeadAir=' + daT.mean.toFixed(3) + '% tasksWithDeadAir>1ms/el=' + daT.badTasks + ' (was ' + daA.mean.toFixed(1) + '%) tiledElements=' + nTiled + '/' + elements.length);

  // W-RWB-2 inside window
  { let bad = 0, pop = 0; elements.forEach(e => { const t = guidTask[e.guid]; if (!t || !map[e.guid].tiled) return; pop++; const w = win[t], m = map[e.guid];
      if (!(w.s <= m.s && m.s < m.e && m.e <= w.e)) bad++; });
    claim('W-RWB-2', pop, bad, bld + ' every tiled element inside its own bar (wS <= start < end <= wE)'); }

  // W-RWB-3 order preserved (CPM start, ties on guid)
  { let bad = 0, pop = 0; tasks.forEach(t => { const gs = t.guids.slice().sort((a, b) => disp[a].start - disp[b].start || (a < b ? -1 : 1));
      for (let i = 1; i < gs.length; i++) { pop++; if (map[gs[i]].s < map[gs[i - 1]].s) bad++; } });
    claim('W-RWB-3', pop, bad, bld + ' adjacent CPM-ordered pairs whose played starts are non-decreasing'); }

  // W-RWB-4 contiguous tiles
  { let bad = 0, pop = 0; tasks.forEach(t => { const w = win[t.id]; const iv = t.guids.map(g => map[g]).sort((a, b) => a.s - b.s);
      pop += iv.length + 1;
      if (Math.abs(iv[0].s - w.s) > 1) bad++; if (Math.abs(iv[iv.length - 1].e - w.e) > 1) bad++;
      for (let i = 1; i < iv.length; i++) if (Math.abs(iv[i].s - iv[i - 1].e) > 1) bad++; });
    claim('W-RWB-4', pop, bad, bld + ' tile boundaries: first==wS, last==wE, each start==previous end (±1 ms)'); }

  // W-RWB-5 acceptance shape
  { const grT = groups(map); const over50T = grT.filter(r => r.maxDec > 50).length;
    let bad = 0; const offenders = []; grT.forEach(r => { if (r.distinct !== r.n) { bad++; offenders.push(r.k + ' n=' + r.n + ' distinct=' + r.distinct); } });
    if (over50T > over50A) bad++;
    const slabs = grT.filter(r => /IfcSlab|IfcFooting/.test(r.k)).map(r => r.k.replace('TASK_', '') + ' n=' + r.n + ' maxDecile=' + r.maxDec.toFixed(0) + '% distinct=' + r.distinct);
    claim('W-RWB-5', grT.length, bad, bld + ' (task,class) groups n>=5: distinctStarts==n for all (offenders=' + (offenders.length ? offenders.slice(0, 3).join('; ') : 'none') +
      ') groups>50%InOneDecile ' + over50A + ' -> ' + over50T + ' | slabs/footings: ' + slabs.join(' | ')); }

  // W-RWB-6 fallback
  { let bad = 0;
    const ghost = 'NOT_A_REAL_GUID_' + Date.now(); const sIn = { start: 12345, end: 23456 };
    const out = sb._tmRescaleToTaskWindow(ghost, sIn);
    if (!(out.start === sIn.start && out.end === sIn.end)) bad++;
    const g0 = elements.find(e => map[e.guid].tiled).guid; const t0 = tiled[g0]; delete tiled[g0];
    const fb = sb._tmRescaleToTaskWindow(g0, disp[g0]); tiled[g0] = t0;
    if (!(fb.start === affine[g0].s && fb.end === affine[g0].e && !fb.tiled)) bad++;
    const b2 = sbLog.length; const nul = sb._tmTilePlayWithinTasks(disp, cap, false);
    const skip = sbLog.slice(b2).find(l => l.indexOf('§TM_REVEAL_TILED skip reason=schedule not display-authored') === 0);
    if (!(nul === null && skip)) bad++;
    claim('W-RWB-6', 3, bad, bld + ' unmapped guid passes through; an element dropped from the map gets the affine result; displayAuthored=false -> null + skip log'); }

  judges(affine, 'affine'); judges(map, 'tiled');
  db.close();
}

(async () => {
  const initSqlJs = require(path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js'));
  const SQL = await initSqlJs({ locateFile: f => path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js', 'dist', f) });
  const R = executedRules();
  const list = process.argv.slice(2).filter(a => a[0] !== '-');
  for (const b of (list.length ? list : ['Duplex', 'HHS_Office_Federated', 'Hospital'])) await runBuilding(b, SQL, R);
  console.log('§W_RWB_SUMMARY pass=' + pass + ' fail=' + fail + ' inconclusive=' + inconclusive);
  if (fail) { console.error('FAIL — ' + fail + ' claim(s) failed'); process.exit(1); }
  console.log(pass ? 'PASS — every element plays its own CPM-duration share of its bar, in CPM order, with no dead air' : 'INCONCLUSIVE — nothing judged');
})().catch(e => { console.error('§W_RWB_ERROR ' + (e && e.stack || e)); process.exit(2); });
