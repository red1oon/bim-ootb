#!/usr/bin/env node
/* ⚠ WITNESS — W-LOADPATH-BEARING, §129.40 (bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §129.40).
 *
 * THE ISSUE IT PROVES OR DISPROVES:
 *   The freeze beat drew a "load path" that does not carry load. On the HHS bake of 2026-09-19 the
 *   winning chain was Slab L3 -> Slab L3 -> Slab L1 -> Column L1 -> Slab L1, with 6.76 m of clear
 *   air between hop 2 and hop 3 (their centres are 6.98 m apart) and nothing in it — a stack of floor plates with Level 2 missing.
 *   `_chainDescendInfo` passed it (monotone=true, descents=4, ascents=0) because it counts steps in
 *   the SUPPORT GRAPH and never measures how far apart the members are. A better chain existed in
 *   the same bake and lost, because the ranker is `visibleHopsMajority, depth, score` and a floor
 *   plate is always more visible than a column.
 *
 *   A LOAD PATH IS THE ORDERED SET OF MEMBERS THAT CARRY A LOAD TO THE GROUND, EACH BEARING
 *   DIRECTLY ON THE NEXT. This proves the gate enforces that before any ranking sees a candidate.
 *
 * WHAT MAKES IT A WITNESS AND NOT A SMOKE TEST (it must be able to say NO-OP, VACUOUS and WRONG):
 *   - CONTROL / WRONG: the REAL rejected chain (fixture A) must FAIL and the REAL accepted chain
 *     (fixture B) must PASS. Both are verbatim from the 2026-09-19 HHS bake log and that DB's own
 *     element_transforms — not invented geometry, not a hand-made pair chosen to separate cleanly.
 *     A gate that rejected everything would fail B; one that accepted everything would fail A.
 *   - NO-OP: fixture C is B with one member lifted by exactly the tolerance plus a millimetre, so a
 *     gate wired up but never actually consulted cannot pass it.
 *   - VACUOUS: if the module does not publish the gate, it prints INCONCLUSIVE and exits 2.
 *
 * RUN: node viewer/tests/witness_loadpath_bearing.js [path/to/cpe_load_path.js]
 */
const fs = require('fs'), vm = require('vm');
const SRC = process.argv[2] || require('path').join(__dirname, '..', 'cpe_load_path.js');
const src = fs.readFileSync(SRC, 'utf8');

// ── Fixtures. bz/tz derived from the shipped DB's centre_z +/- bbox_z/2, plan rects wide enough to
//    overlap (both real chains sit on one column line / one footprint, verified in the same bake).
const plan = { x0: 0, x1: 10, y0: 0, y1: 10 };
const m = (name, cz, hgt) => Object.assign({ guid: name, cls: name, storey: '', bz: cz - hgt / 2, tz: cz + hgt / 2 }, plan);

// A — THE CHAIN THAT WON AND SHOULD NOT HAVE. 6.98 m of nothing between hop 2 and hop 3.
const A_CHAIN = [m('Slab:L3', 7.425, 0.10), m('Slab:L3', 7.150, 0.30), m('Slab:L1', 0.169, 0.15),
                 m('Column:L1', 1.750, 3.50), m('Slab:L1', -0.056, 0.30)];
// B — THE CHAIN THAT LOST AND SHOULD HAVE WON. Every column's base meets the one below's top.
const B_CHAIN = [m('Column:L3', 8.950, 3.30), m('Column:L2', 5.550, 3.50), m('Column:L1', 1.797, 3.406),
                 m('Column:L1', 1.750, 3.50), m('Slab:L1', -0.056, 0.30)];
// C — B with its second column dropped just past the tolerance: the smallest break the gate must
//     still catch. B's own Column L2 -> Column L1 pair already carries a real 0.30 m gap (the floor
//     construction between them), so this also proves the tolerance is not simply "large".
const C_CHAIN = B_CHAIN.map((it, i) => i === 1 ? Object.assign({}, it, { bz: it.bz + 1.06, tz: it.tz - 1.06 }) : it);

const win = {}; win.window = win; win.APP = {};
// Seed the real intrinsics: the catch-all proxy below answers for EVERY name, so without this
// `Math.min` inside the module resolves to a proxy and the gate silently computes nonsense.
['Math','JSON','Date','Object','Array','Number','String','Boolean','isFinite','isNaN','parseInt','parseFloat','Error','TypeError']
  .forEach(function (n) { win[n] = globalThis[n]; });
const mk = () => new Proxy(function () {}, { get: (t, k) => k === 'then' ? undefined : mk(), set: () => true, apply: () => mk(), construct: () => mk() });
const ctx = vm.createContext(new Proxy(win, { has: () => true, get: (t, k) => (k in t) ? t[k] : (k === 'window' ? win : mk()), set: (t, k, v) => { t[k] = v; return true; } }));
const logs = [];
ctx.console = { log: (...a) => logs.push(a.join(' ')), warn: () => {}, error: () => {} };
try { vm.runInContext(src, ctx, { filename: 'cpe_load_path.js' }); } catch (e) { console.log('§LP_BEARING load-threw:', e.message); }
if (typeof ctx.setupCpeLoadPath === 'function') { try { ctx.setupCpeLoadPath(win.APP); } catch (e) {} }

const gate = win.APP._loadPathChainBears;
if (typeof gate !== 'function') {
  console.log('§LP_BEARING INCONCLUSIVE — cpe_load_path.js does not publish _loadPathChainBears; nothing judged.');
  process.exit(2);
}

let checks = 0, wrong = 0;
function truth(name, cond, detail) {
  checks++; if (!cond) wrong++;
  console.log('  §LPB ' + (cond ? 'ok   ' : 'WRONG') + ' ' + name + (detail ? '   ' + detail : ''));
}
function run(chain) { return gate(chain, chain.map((_, i) => i)); }

const a = run(A_CHAIN), b = run(B_CHAIN), c = run(C_CHAIN);
truth('CONTROL: the slab chain that won the 2026-09-19 bake is REJECTED', a.bears === false,
      'gaps=' + a.gaps + ' worstGapM=' + a.worstGapM.toFixed(2));
truth('       ...and for the right reason: the Level 3 -> Level 1 fall', a.worstGapM > 6.7 && a.worstGapM < 6.9,
      'worstGapM=' + a.worstGapM.toFixed(2) + ' (expected 6.76 = clear air between the two members)');
truth('the column chain that SHOULD have won is ACCEPTED', b.bears === true,
      'gaps=' + b.gaps + ' offsets=' + b.offsets);
truth('       ...despite a real 0.30 m floor gap on its own column line', b.gaps === 0,
      'the tolerance clears floor construction, not a storey');
truth('NO-OP GUARD: the same chain broken by tolerance+1mm is REJECTED', c.bears === false,
      'gaps=' + c.gaps + ' worstGapM=' + c.worstGapM.toFixed(2));

const off = B_CHAIN.map((it, i) => i === 1 ? Object.assign({}, it, { x0: 40, x1: 50 }) : it);
const o = run(off);
truth('a member standing clear in PLAN is REJECTED even when z lines up', o.bears === false && o.offsets > 0,
      'offsets=' + o.offsets);

console.log('§LOADPATH_BEARING_WITNESS ' + (wrong ? 'FAIL' : 'PASS') + ' checks=' + checks + ' wrong=' + wrong);
const bearingWrong = wrong;

// ── §129.42 STOREY SPAN, ranked ahead of visibility ─────────────────────────────────────────────
// THE ISSUE: the bearing gate made every candidate possible without making the WINNER a load path
// worth showing. On the 11:08 HHS bake the pick became four hops all on Level 1 while a chain
// walking Level 3 -> Level 2 -> Level 1 -> ground sat in the field and lost, because the first rank
// key was `visibleHopsMajority` and a floor plate is always more visible than a column.
// NO-OP / WRONG guards: the losing candidate here is given MORE visible hops and MORE depth than
// the winner, so a comparator that had not actually been re-keyed would still prefer it.
const span = win.APP._loadPathChainStoreySpan, cmp = win.APP._loadPathStackCmp;
if (typeof span !== 'function' || typeof cmp !== 'function') {
  console.log('§LP_SPAN INCONCLUSIVE — the span metric or the comparator is not published; nothing judged.');
  process.exit(2);
}
const it = [{ storey: 'Level 1' }, { storey: 'Level 1' }, { storey: 'Level 2' }, { storey: 'Level 3' }, { storey: '' }];
truth('span counts DISTINCT storeys, not hops', span(it, [0, 1]) === 1, 'two hops both on Level 1 => 1');
truth('span counts a chain that climbs', span(it, [0, 2, 3]) === 3, 'L1+L2+L3 => 3');
truth('an unlabelled member adds nothing rather than a guess', span(it, [0, 4]) === 1,
      'this fleet has unlabelled members; a chain must not win span by being badly tagged');

const groundOnly = { storeySpan: 1, visibleHopsMajority: 4, depth: 4, score: 900, idx: 1 };
const climbs     = { storeySpan: 3, visibleHopsMajority: 2, depth: 3, score: 100, idx: 2 };
truth('the chain that CLIMBS wins, though it is less visible and shallower',
      cmp(groundOnly, climbs, false, 'visibleHopsMajority') > 0,
      'span 3 beats span 1 despite 2 visible hops against 4');
truth('visibility still decides between chains of EQUAL span',
      cmp(Object.assign({}, climbs, { visibleHopsMajority: 1 }), climbs, false, 'visibleHopsMajority') > 0,
      'what visibility was always good for');
truth('CONTROL: the inverted comparator still prefers the worse candidate by the SAME first key',
      cmp(groundOnly, climbs, true, 'visibleHopsMajority') < 0,
      'or the falsifiability control would rank by a metric the real path no longer leads with');

console.log('§LOADPATH_SPAN_WITNESS ' + ((wrong - bearingWrong) ? 'FAIL' : 'PASS') + ' checks=' + (checks - 6) + ' wrong=' + (wrong - bearingWrong));
process.exit(wrong ? 1 : 0);
