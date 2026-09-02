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
// §CACHE_PLAYED_LAYER (2026-09-02, queue item A-9): that slicing + mirror now lives in
// scripts/lib/tm_played_layer.js and is SHARED with scripts/cache_4d_run.js, which persists the
// played layer into ~/.cache/bim4d. Two independent node replications of the played layer would be
// the same defect class this section exists to remove, so there is exactly one.
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
// §CACHE_PLAYED_LAYER — the ONE owner of "the played layer, in node" (slicing + injectGantt mirror).
const TMP = require(path.join(__dirname, 'lib', 'tm_played_layer.js'));

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

async function runBuilding(bld, SQL, R) {
  const dbf = resolveDbFile(bld);
  if (!fs.existsSync(dbf.path)) { console.log('§TM_REVEAL_SHIPPED_SKIP ' + bld + ' — no db'); return null; }
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(dbf.path)));
  const sb = TMP.buildSandbox({ tmSrc: tmSrc, SA: SA, SG: SG, CP: CP, GM: GM, SS: SS,
    LABOR_RATES: R.LABOR_RATES, console: console });
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

  // ── injectGantt mirror — scripts/lib/tm_played_layer.js, the SHARED owner (§CACHE_PLAYED_LAYER).
  // wantAffine:true gives BOTH columns off ONE run: `affine` = the pre-#1605 per-task affine (the A
  // column and the red control), `play` = the shipped path with §TM_REVEAL_TILED applied. The CPM
  // display pass runs once and is shared by both, which is the only way this A/B is honest.
  const baseMs = Date.parse(START);
  const mp = TMP.mirrorInjectGantt({ sb: sb, elements: elements, tasks: res.tasks, db: db,
    startISO: START, applyTiling: true, wantAffine: true, log: console.log });
  delete globalThis.APP;
  if (!mp.ok) { console.log('§TM_REVEAL_SHIPPED_FAIL ' + bld + ' ' + mp.reason); db.close(); return null; }
  const disp = mp.disp, win = mp.win, guidTask = mp.guidTask, twItems = mp.twItems, winGroups = mp.winGroups;
  const op = mp.affine, opFix = mp.play, tiled = mp.tiledMap;
  console.log('§TM_REVEAL_SHIPPED_DISPLAY ' + bld + ' cpm=' + mp.stats.cpm + ' midair=' + mp.stats.midair +
    ' (cpm=reuse means injectGantt replayed the hook\'s CPM timeline, exactly as the browser cold-open does)');
  console.log('§TM_REVEAL_SHIPPED_BIND ' + bld + ' total=' + mp.stats.total + ' clamped=' + mp.stats.clamped +
    ' uncovered=' + mp.stats.uncovered + ' tiled=' + mp.stats.tiled + ' display_authored=' + mp.stats.displayAuthored +
    ' (mirrors §TM_ELEMENT_WINDOW_BIND)');
  console.log('§TM_REVEAL_SHIPPED_CANDIDATE ' + bld + ' source=' +
    (mp.stats.tilingAvailable ? 'time_machine.js _tmTilePlayWithinTasks (shipped)'
      : '⛔ NONE — this revision has no _tmTilePlayWithinTasks, so the CANDIDATE column equals the affine'));
  const capTasks = res.tasks.map(t => ({ id: t.id, sDays: t.sDays, eDays: t.eDays, guids: t.guids.filter(g => guidTask[g] === t.id) }));
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
