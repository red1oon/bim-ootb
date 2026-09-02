#!/usr/bin/env node
// witness_cache_layer_attribution.js — W-CLA. EVERY JUDGE NAMES THE LAYER IT JUDGES.
//
// ⚠ DO NOT REMOVE — SCOPE (bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §FUTURE item 2,
// 2026-09-02 §CACHE_PLAYED_LAYER §I; queue item A-9). Read the log after every run (Log Mandate).
//
// THE DEFECT THIS EXISTS TO KEEP DEAD. §TM_REVEAL_SHIPPED measured that viewer/time_machine.js has
// ZERO readers of materializeZones' `displaySchedule` — the film and the Time Machine scrubber play
// kernel_ops timestamps written by injectGantt. scripts/cache_4d_run.js nevertheless persisted only
// that unplayed map, under the neutral key `sched`, and every cache reader inherited it silently.
// Same task, same run: the cache read [9.8,10.1,10,9.7,10.5,10.2,9.5,10.2,9.9,10] while the played
// layer was [18.4,17.8,17.8,18.4,17.5,8.8,1.1,0,0,0.2]. Four weeks of measurement judged a map
// nobody plays, and NOT ONE of those judges printed which map that was. The anonymity is the
// defect (PRIMAL LAW clause 4): a judge that cannot name its own input cannot report being pointed
// at the wrong one. C4 below is the claim that actually holds that line.
//
// CLAIMS (each independently PASS / FAIL / INCONCLUSIVE; a 0 over an empty population is never a PASS):
//   C1 BOTH LAYERS      every current-code cached run carries `play` AND `sched`, same guid coverage.
//   C2 NOT THE SAME MAP the two layers genuinely differ (anti-vacuous: if they were equal,
//                       re-pointing every judge would be a no-op dressed as a fix).
//   C3 PLAYED IN WINDOW every played interval lies inside the task window that claims it — the
//                       invariant _tmRescaleToTaskWindow exists to hold.
//   C4 READERS NAME IT  every file that calls CACHE.read( either selects through layerOf( or
//                       explicitly declares `layer=NONE` (it judges no schedule map), AND emits
//                       `layer=` on a § line. A new reader that does neither FAILS here.
//   C5 NO SILENT DEFAULT layerOf throws on an unknown id, and reports MISSING on a pre-§CACHE_
//                       PLAYED_LAYER cache instead of substituting the other layer.
//
// Reads the persisted cache and the repo's own source text. No pipeline re-run, no browser, no bake.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const CACHE = require(path.join(ROOT, 'scripts', 'cache_4d_run.js'));

const BUILDINGS = process.argv.slice(2).filter(a => a[0] !== '-').length
  ? process.argv.slice(2).filter(a => a[0] !== '-')
  : ['Duplex', 'HHS_Office_Federated', 'Hospital', 'Terminal'];
const DAY_MS = 86400000;

const verdicts = [];
function claim(id, scope, pop, bad, detail) {
  const v = pop === 0 ? 'INCONCLUSIVE' : (bad === 0 ? 'PASS' : 'FAIL');
  verdicts.push(v);
  console.log('§W_CLA ' + id.padEnd(20) + scope.padEnd(24) + v.padEnd(13) +
    'judged=' + String(pop).padEnd(8) + 'bad=' + String(bad).padEnd(6) + (detail || ''));
  return v;
}
function deciles(vals) {
  const h = new Array(10).fill(0);
  vals.forEach(p => { let b = Math.floor(Math.max(0, Math.min(1, p)) * 10); if (b > 9) b = 9; h[b]++; });
  return h.map(c => +(100 * c / Math.max(1, vals.length)).toFixed(1));
}

// ── the cached runs actually available ──────────────────────────────────────────────────────────
const runs = [];
for (const b of BUILDINGS) {
  const r = CACHE.read(b);
  if (!r) { console.log('§W_CLA CACHE_MISS       ' + b.padEnd(24) + '— run: node scripts/cache_4d_run.js ' + b); continue; }
  runs.push({ bld: b, r: r });
}
console.log('§W_CLA_POPULATION cachedRuns=' + runs.length + '/' + BUILDINGS.length +
  ' [' + runs.map(x => x.bld).join(', ') + ']  codeKey=' + CACHE.codeKey());

// ── C1 BOTH LAYERS ──────────────────────────────────────────────────────────────────────────────
{
  let bad = 0; const detail = [];
  runs.forEach(x => {
    const P = CACHE.layerOf(x.r, 'played'), D = CACHE.layerOf(x.r, 'display');
    const nP = P.map ? Object.keys(P.map).length : 0, nD = D.map ? Object.keys(D.map).length : 0;
    if (!P.map || !D.map || nP !== nD) { bad++; detail.push(x.bld + ' played=' + (P.map ? nP : 'MISSING') + ' display=' + (D.map ? nD : 'MISSING')); }
    else detail.push(x.bld + ' ' + nP);
  });
  claim('C1_BOTH_LAYERS', 'cached runs', runs.length, bad, detail.join(' | '));
}

// ── C2 NOT THE SAME MAP (anti-vacuous) ──────────────────────────────────────────────────────────
{
  let judged = 0, bad = 0;
  runs.forEach(x => {
    const P = CACHE.layerOf(x.r, 'played').map, D = CACHE.layerOf(x.r, 'display').map;
    if (!P || !D || !x.r.tasks) return;
    judged++;
    const base = Date.parse('2026-01-01');
    let shared = 0, differ = 0;
    const posP = [], posD = [];
    x.r.tasks.forEach(t => {
      const wS = base + t.sDays * DAY_MS, wE = base + t.eDays * DAY_MS, span = wE - wS;
      t.guids.forEach(g => {
        if (!P[g] || !D[g]) return;
        shared++;
        if (P[g].s !== D[g].s) differ++;
        if (span > 0) { posP.push((P[g].s - wS) / span); posD.push((D[g].s - wS) / span); }
      });
    });
    const dP = deciles(posP), dD = deciles(posD);
    const sameVec = JSON.stringify(dP) === JSON.stringify(dD);
    const pct = shared ? 100 * differ / shared : 0;
    const isBad = shared === 0 || pct < 1 || sameVec;
    if (isBad) bad++;
    console.log('§W_CLA_LAYER_DIFF ' + x.bld.padEnd(24) + 'sharedGuids=' + shared +
      ' differentStart=' + differ + ' (' + pct.toFixed(1) + '%)' +
      ' played.decilePct=[' + dP.join(',') + ']' +
      ' display.decilePct=[' + dD.join(',') + ']' +
      (isBad ? '  ⛔ the two layers are indistinguishable here — re-pointing the judges would be a no-op'
             : '  — these are different maps; a judge reading the wrong one gets different answers'));
  });
  claim('C2_LAYERS_DIFFER', 'runs with both layers', judged, bad,
    'a same-map result would make every re-pointing vacuous — this is the claim that refuses that');
}

// ── C3 PLAYED IS IN-WINDOW ──────────────────────────────────────────────────────────────────────
{
  let judged = 0, bad = 0; const detail = [];
  runs.forEach(x => {
    const P = CACHE.layerOf(x.r, 'played').map;
    if (!P || !x.r.tasks) return;
    const base = Date.parse('2026-01-01');
    let n = 0, out = 0, worst = 0;
    x.r.tasks.forEach(t => {
      const wS = base + t.sDays * DAY_MS, wE = base + t.eDays * DAY_MS;
      t.guids.forEach(g => {
        const p = P[g]; if (!p) return;
        n++;
        const off = Math.max(wS - p.s, p.e - wE, 0);
        if (off > 1) { out++; if (off > worst) worst = off; }   // >1ms: float rounding is not a defect
      });
    });
    judged += n; bad += out;
    detail.push(x.bld + ' ' + (n - out) + '/' + n + (out ? ' worstOffsetDays=' + (worst / DAY_MS).toFixed(3) : ''));
  });
  claim('C3_PLAYED_IN_WIN', 'element-task pairs', judged, bad, detail.join(' | '));
}

// ── C4 EVERY CACHE READER NAMES ITS LAYER (the actual DONE-WHEN) ─────────────────────────────────
{
  // Discover the readers by grep, not by a hand-maintained list — a list would go stale exactly when
  // it matters (a new probe added, never re-pointed), which is the failure mode this claim exists for.
  const dirs = [path.join(ROOT, 'scripts'), path.join(ROOT, 'viewer', 'tests')];
  const readers = [];
  dirs.forEach(d => {
    if (!fs.existsSync(d)) return;
    fs.readdirSync(d).filter(f => f.endsWith('.js')).forEach(f => {
      const p = path.join(d, f), src = fs.readFileSync(p, 'utf8');
      if (src.indexOf('CACHE.read(') < 0) return;
      if (f === 'cache_4d_run.js' || f === path.basename(__filename)) return;
      readers.push({ file: path.relative(ROOT, p), src: src });
    });
  });
  let bad = 0;
  readers.forEach(x => {
    const selects = /\.layerOf\(/.test(x.src);
    // A reader that genuinely judges NO schedule map (it reads only `els`/`log`) is not required to
    // select a layer — but it IS required to say so, out loud, in a § line: `layer=NONE`. Silence is
    // exactly what let a whole class of measurement judge the wrong map for four weeks, so an
    // abstention has to be stated, not inferred from the absence of a lookup.
    const abstains = /layer=NONE/.test(x.src);
    // "names it in the output" = a § line carrying layer= .
    const names = /§[A-Z0-9_]+[^\n]*layer=/i.test(x.src) || /'layer='/.test(x.src);
    const ok = (selects || abstains) && names;
    if (!ok) bad++;
    console.log('§W_CLA_READER ' + x.file.padEnd(48) + 'selectsViaLayerOf=' + (selects ? 'yes' : 'NO ') +
      ' declaresLayerNONE=' + (abstains ? 'yes' : 'NO ') + ' printsLayer=' + (names ? 'yes' : 'NO ') +
      (ok ? '' : '  ⛔ this judge cannot say which layer it judged'));
  });
  claim('C4_READERS_NAME_IT', 'cache-reading files', readers.length, bad,
    'discovered by grep for CACHE.read( over scripts/ + viewer/tests/ — a reader added later and ' +
    'neither re-pointed nor declaring layer=NONE fails here, which is the point');
}

// ── C5 NO SILENT DEFAULT ────────────────────────────────────────────────────────────────────────
{
  let n = 0, bad = 0;
  n++; try { CACHE.layerOf({ play: {}, sched: {} }, 'no-such-layer'); bad++; console.log('§W_CLA_DEFAULT unknown-id did NOT throw'); }
  catch (e) { console.log('§W_CLA_DEFAULT unknown-id throws: ' + e.message); }
  n++;
  const legacy = CACHE.layerOf({ sched: { g: { s: 1, e: 2 } } }, 'played');
  if (!legacy.missing || legacy.map !== null) { bad++; console.log('§W_CLA_DEFAULT legacy cache SUBSTITUTED a layer — ' + JSON.stringify(legacy)); }
  else console.log('§W_CLA_DEFAULT legacy cache (no `play` key) reports missing=true, map=null — no substitution');
  claim('C5_NO_SILENT_DEF', 'layerOf contract', n, bad, 'unknown id must throw; a missing layer must not fall back');
}

const fail = verdicts.filter(v => v === 'FAIL').length, inc = verdicts.filter(v => v === 'INCONCLUSIVE').length;
console.log('§W_CLA_SUMMARY claims=' + verdicts.length + ' PASS=' + (verdicts.length - fail - inc) +
  ' FAIL=' + fail + ' INCONCLUSIVE=' + inc + '  ' +
  (fail ? 'RED' : inc ? 'NOT GREEN — a claim judged nothing; an empty population is not a pass' : 'GREEN'));
process.exit(fail ? 1 : 0);
