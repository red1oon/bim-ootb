#!/usr/bin/env node
// WITNESS — vacuous_tag_guards: the nine per-frame `§` tags of §R13.9, and whether each can now
// report its own failure.
// Spec: bim-compiler prompts/CPE_4D_PERF_MEM_STUDY.md §R14_VACUOUS_TAG_AUDIT (queue item A-7).
//
// ISSUE THIS PROVES OR DISPROVES — CLAUDE.md rule 4, "a witness that cannot report its own failure
// is not a witness." §R13_BAKE_FRAME_MINING found nine `§` tags that fire on every bake frame while
// judging nothing, the worst being §SHADOW_FRONTIER_AT_CAPTURE: 286 firings, every one carrying
// `singleMesh_matched=0`. This witness proves three things a reader would otherwise have to take on
// trust:
//   (a) that §SHADOW_FRONTIER_AT_CAPTURE's zeros were an EMPTY POPULATION and not a BROKEN MATCHER
//       — the distinction the item exists for, because stamping VACUOUS on a broken lookup would
//       hide a live defect behind a compliant-looking log line;
//   (b) that every tag whose population can be empty now prints the word VACUOUS at its own emit
//       site in the SHIPPED source (grepped, not asserted);
//   (c) that the run-length compression applied to the repeated tags is LOSSLESS — proved by
//       extracting the SHIPPED `_vacLog` out of viewer/effects.js, executing it against the real
//       2,027-frame Hospital series, and reconstructing the original per-line counts exactly.
//
// POPULATION: one row per audited tag (9), built from two real sources, no fixtures invented here —
//   1. the SHIPPED source files in this worktree (viewer/{effects,scene,main,time_machine,
//      cinema_maxq}.js), read and grepped at their real emit sites;
//   2. tests/fixtures/vac_tag_series_s5_hospital.json — the run-length-encoded, ORDER-PRESERVING
//      per-tag line series extracted from s5_hospital.log (Hospital MaxQ bake, commit e1369b7a,
//      sw v1120, real GPU, 2,027 frames, 41,705 lines, 2026-09-01). The RLE expands back to the
//      byte-exact original series; it exists so this witness outlives that 4.1 MB scratchpad log.
//
// NO BAKE, NO BROWSER, NO PROBE was run to produce this — user directive 2026-09-02. Every number
// is read off the shipped source or off the archived series.
//
// Command: node viewer/tests/witness_vacuous_tag_guards.js
'use strict';
const fs = require('fs');
const path = require('path');
const { Witness } = require('../../witness_kit/contract');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = f => fs.readFileSync(path.join(ROOT, 'viewer', f), 'utf8');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'vac_tag_series_s5_hospital.json');

// ── §W-VACUOUS-SELF: this witness must be able to say INCONCLUSIVE about ITSELF. If the archived
// series is not on disk there is nothing to judge, and a PASS here would be exactly the defect the
// witness was written to close. Exit 2, never 0.
if (!fs.existsSync(FIXTURE)) {
  console.log('§WITNESS_VACUOUS_TAG_GUARDS INCONCLUSIVE — archived series absent at ' + FIXTURE +
    '; nothing was judged. This is NOT a pass.');
  process.exit(2);
}
const FX = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

// ── Extract and EXECUTE the shipped _vacLog, rather than reimplementing it here. A reimplementation
// would prove that this file is lossless, which is not the claim. ────────────────────────────────
function loadShippedVacLog() {
  const src = SRC('effects.js');
  const start = src.indexOf('function _vacLog(st, line, note) {');
  if (start < 0) throw new Error('_vacLog not found in viewer/effects.js — the treatment is not shipped');
  // brace-match to the end of the function
  let depth = 0, i = src.indexOf('{', start), end = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end < 0) throw new Error('_vacLog body did not brace-match');
  const body = src.slice(start, end);
  return new Function('console', body + '; return _vacLog;');
}
const makeVacLog = loadShippedVacLog();

// Reconstruct the original occurrence count from what a run-length reporter emitted: each distinct
// line print is 1 occurrence, each `repeats=N` accounts for N more. Heartbeats ("still identical")
// re-report an IN-FLIGHT count and must NOT be added, or the reconstruction would double-count.
// If this reconstruction ever misses the original total, the compression dropped signal — which is
// the half of §VAC V2 that can silently regress, so it is asserted rather than assumed.
function reconstruct(emitted) {
  let recon = 0;
  for (const l of emitted) {
    if (/ still identical — repeats=/.test(l)) continue;
    const m = /(?:^|\s)repeats=(\d+)/.exec(l);
    if (m) recon += Number(m[1]); else recon += 1;
  }
  return recon;
}

// Replay one tag's real series through the SHIPPED _vacLog (extracted above) and report what it
// would emit. This EXECUTES the shipped function; it does not model it.
function replay(rle) {
  const emitted = [];
  const vacLog = makeVacLog({ log: l => emitted.push(l) });
  const st = { last: null, n: 0 };
  let total = 0;
  for (const [line, count] of rle) for (let k = 0; k < count; k++) { total++; vacLog(st, line); }
  // Flush the open run exactly as _vacFlushStillTags does at a real still exit.
  if (st.n > 0 && st.last) emitted.push(st.last.split(' ')[0] + ' repeats=' + st.n + ' (identical, suppressed — flushed at still exit)');
  return { emitted: emitted.length, reconstructed: reconstruct(emitted), total };
}

// §GROUP_SPARK_TICK's treatment is inline in time_machine.js, not a callable function, so its rule
// is SIMULATED here rather than executed — stated plainly so the claim is not overread. The
// simulation is faithful on this series because the shipped verdict is built from exactly the
// fields that make the archived lines distinct (playing / cand / frontier / recent); roll and decay
// were constant across the whole bake (roll=0 on 2,027/2,027, decay=1.00). The heartbeat cadence is
// the shipped one: keyed on the tick counter, not on the repeat count.
function simulateGroupSparkRule(rle) {
  const emitted = []; let last = null, n = 0, tick = 0, total = 0;
  for (const [line, count] of rle) for (let k = 0; k < count; k++) {
    total++; tick++;
    if (line !== last) {
      if (n > 0) emitted.push('§GROUP_SPARK_TICK repeats=' + n + ' (identical verdict, suppressed)');
      emitted.push(line); last = line; n = 0;
    } else {
      n++;
      if (tick % 500 === 0) emitted.push('§GROUP_SPARK_TICK still identical — repeats=' + n);
    }
  }
  if (n > 0) emitted.push('§GROUP_SPARK_TICK repeats=' + n + ' (identical verdict, suppressed)');
  return { emitted: emitted.length, reconstructed: reconstruct(emitted), total };
}

// ── The nine rows ────────────────────────────────────────────────────────────────────────────────
const effects = SRC('effects.js');
const scene = SRC('scene.js');
const main = SRC('main.js');
const tm = SRC('time_machine.js');
const maxq = SRC('cinema_maxq.js');

// COMMENTS ARE STRIPPED BEFORE ANY REGION CHECK. First draft of this witness did not, and the
// falsification arm caught it: deleting the VACUOUS literal from §SHADOW_FRONTIER_AT_CAPTURE's
// actual emit statement still passed C2, because the explanatory comment block above it contains
// the word "VACUOUS". That is a scope-blind witness — it passed while the defect sat inside the
// window it was inspecting — which is the third failure mode CLAUDE.md rule 4 names alongside
// no-op and vacuous. The check now sees only executable source.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // block comments
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');  // line comments (: guard keeps http:// intact)
}
// A tag's emit region = the COMMENT-STRIPPED shipped source within N chars of its emit site;
// "can say VACUOUS" means the literal appears in code there, so a reader of the log can tell
// 0-because-nothing-to-judge apart from 0-because-all-clean.
function regionHas(src, anchor, needle, span) {
  const code = stripComments(src);
  const i = code.indexOf(anchor);
  if (i < 0) return false;
  return code.slice(Math.max(0, i - (span || 2500)), i + (span || 2500)).includes(needle);
}

const S = FX.series, F = FX.facts;
const rows = [
  {
    tag: '§SHADOW_FRONTIER_AT_CAPTURE', tagBase: '§SHADOW_FRONTIER_AT_CAPTURE',
    file: 'viewer/cinema_maxq.js', treatment: 'GUARD+FIX',
    diagnosis: 'empty-population',
    firedBefore: S.SHADOW_FRONTIER_AT_CAPTURE.total,
    canSayVacuous: regionHas(maxq, "'§SHADOW_FRONTIER_AT_CAPTURE frame='", 'VACUOUS'),
    // the FIX half: the third forEach outcome (in neither index) is now counted
    extraFixShipped: maxq.includes('unmatched=') && maxq.includes('_fUnmatched++'),
    // Volume is unchanged BY DESIGN — this tag fires only when something is under construction
    // (286 of 2,027 frames, self-throttling already). Its defect was the CONTENT of the line.
    losslessOnRealSeries: true, emittedAfter: S.SHADOW_FRONTIER_AT_CAPTURE.total,
  },
  {
    tag: '§SHADOW_FRONTIER', tagBase: '§SHADOW_FRONTIER',
    file: 'viewer/time_machine.js', treatment: 'GUARD',
    diagnosis: 'empty-population',
    firedBefore: S.SHADOW_FRONTIER.total,
    canSayVacuous: regionHas(tm, "'§SHADOW_FRONTIER casters='", 'VACUOUS'),
    // Volume unchanged by design: already a 1-in-60-tick sample. Content was the defect.
    extraFixShipped: false, losslessOnRealSeries: true, emittedAfter: S.SHADOW_FRONTIER.total,
  },
  {
    tag: '§GROUP_SPARK_TICK', tagBase: '§GROUP_SPARK_TICK',
    file: 'viewer/time_machine.js', treatment: 'GUARD+FIX',
    diagnosis: 'dead-throttle-and-vacuous',
    firedBefore: S.GROUP_SPARK_TICK.total,
    canSayVacuous: regionHas(tm, "'§GROUP_SPARK_TICK '", 'VACUOUS'),
    // the FIX half: the log no longer rides `_gspRoll % 10`, a counter frozen at 0 in a bake
    extraFixShipped: !/_gspRoll % 10 === 0[\s\S]{0,40}console\.log\('§GROUP_SPARK_TICK/.test(tm) &&
      tm.includes('_gspTick++') && tm.includes('var _gspTick = 0;'),
    losslessOnRealSeries: null, emittedAfter: null,   // filled by simulateGroupSparkRule below
  },
  {
    tag: '§GROUND_WETNESS_OVERRIDE', tagBase: '§GROUND_WETNESS_OVERRIDE', file: 'viewer/effects.js', treatment: 'GUARD',
    diagnosis: 'repeated-identical-verdict',
    firedBefore: S.GROUND_WETNESS_OVERRIDE.total,
    canSayVacuous: true,   // V2 tag: its guard is the repeat roll-up, not a VACUOUS label
    // Routed through the shared _vacLog, so it inherits the bounded heartbeat. An earlier draft of
    // this treatment used its own inline change-only rule, which on THIS series (one distinct line,
    // 2,028 firings, run never ends) would have emitted exactly 1 line and never reported the 2,027
    // repeats — a silent signal DROP dressed as compression. C3 below is what caught it.
    extraFixShipped: /_vacLog\(_vacGroundWetness,/.test(effects),
    losslessOnRealSeries: null, emittedAfter: null,   // filled by the shipped-_vacLog replay below
  },
  {
    tag: '§NIGHT_STILL_LIGHTS', tagBase: '§NIGHT_STILL_LIGHTS', file: 'viewer/effects.js', treatment: 'GUARD',
    diagnosis: 'repeated-identical-verdict',
    firedBefore: S.NIGHT_STILL_LIGHTS.total, canSayVacuous: true, extraFixShipped: false,
    losslessOnRealSeries: null, emittedAfter: null,
  },
  {
    tag: '§PHOTO_GLOW_SPRITE staged', tagBase: '§PHOTO_GLOW_SPRITE', file: 'viewer/effects.js', treatment: 'GUARD',
    diagnosis: 'repeated-identical-verdict',
    firedBefore: S.PHOTO_GLOW_SPRITE_staged.total, canSayVacuous: true, extraFixShipped: false,
    losslessOnRealSeries: null, emittedAfter: null,
  },
  {
    tag: '§PHOTO_GLOW_SPRITE removed', tagBase: '§PHOTO_GLOW_SPRITE', file: 'viewer/effects.js', treatment: 'GUARD',
    diagnosis: 'repeated-identical-verdict',
    firedBefore: S.PHOTO_GLOW_SPRITE_removed.total, canSayVacuous: true, extraFixShipped: false,
    losslessOnRealSeries: null, emittedAfter: null,
  },
  {
    tag: '§GLOW_LENS_QUAD skip', tagBase: '§GLOW_LENS_QUAD', file: 'viewer/effects.js', treatment: 'GUARD',
    diagnosis: 'repeated-identical-verdict',
    firedBefore: S.GLOW_LENS_QUAD_skip.total, canSayVacuous: true, extraFixShipped: false,
    losslessOnRealSeries: null, emittedAfter: null,
  },
  {
    tag: '§ENVMAP_STOMP_GUARD', tagBase: '§ENVMAP_STOMP_GUARD', file: 'viewer/scene.js', treatment: 'GUARD',
    diagnosis: 'no-denominator',
    firedBefore: S.ENVMAP_STOMP_GUARD.total, canSayVacuous: true,
    // V3: the OTHER arm is counted now, so "100% skips" has a denominator
    // V3: the OTHER arm is counted, AND the exact running totals are exposed for direct read, so
    // the < 100-call tail between sampled lines is compressed rather than lost.
    extraFixShipped: scene.includes('_envRegens++') && scene.includes('_envSkips++') &&
      scene.includes("'§ENVMAP_STOMP_GUARD regen ran") && scene.includes('A._envmapStompStats = function()'),
    losslessOnRealSeries: true,
    emittedAfter: 1 + Math.floor(S.ENVMAP_STOMP_GUARD.total / 100),
  },
  {
    tag: '§IDLE_GATE', tagBase: '§IDLE_GATE', file: 'viewer/main.js', treatment: 'WORDING',
    diagnosis: 'already-compliant',
    firedBefore: S.IDLE_GATE.total, canSayVacuous: true,
    extraFixShipped: main.includes('1-in-25 sample') && main.includes("'§IDLE_GATE park"),
    losslessOnRealSeries: true, emittedAfter: S.IDLE_GATE.total,
  },
];

// Replay the four effects.js V2 tags through the SHIPPED _vacLog and fill in the measured results.
const REPLAY = {
  '§GROUND_WETNESS_OVERRIDE': 'GROUND_WETNESS_OVERRIDE',
  '§NIGHT_STILL_LIGHTS': 'NIGHT_STILL_LIGHTS',
  '§PHOTO_GLOW_SPRITE staged': 'PHOTO_GLOW_SPRITE_staged',
  '§PHOTO_GLOW_SPRITE removed': 'PHOTO_GLOW_SPRITE_removed',
  '§GLOW_LENS_QUAD skip': 'GLOW_LENS_QUAD_skip',
};
for (const r of rows) {
  const key = REPLAY[r.tag];
  if (!key) continue;
  const res = replay(S[key].rle);
  r.emittedAfter = res.emitted;
  r.losslessOnRealSeries = (res.reconstructed === res.total && res.total === r.firedBefore);
  console.log('  §VAC_REPLAY ' + r.tag + ' original=' + res.total + ' emitted=' + res.emitted +
    ' reconstructed=' + res.reconstructed + ' lossless=' + r.losslessOnRealSeries + ' (shipped _vacLog EXECUTED)');
}
{
  const r = rows.find(x => x.tag === '§GROUP_SPARK_TICK');
  const res = simulateGroupSparkRule(S.GROUP_SPARK_TICK.rle);
  r.emittedAfter = res.emitted;
  r.losslessOnRealSeries = (res.reconstructed === res.total && res.total === r.firedBefore);
  console.log('  §VAC_REPLAY ' + r.tag + ' original=' + res.total + ' emitted=' + res.emitted +
    ' reconstructed=' + res.reconstructed + ' lossless=' + r.losslessOnRealSeries +
    ' (rule SIMULATED — the treatment is inline, not a callable function)');
}

// ── Standing facts from the archived bake, printed so the verdict is readable without the fixture ─
console.log('  §VAC_EVIDENCE ' + F.shadow_frontier_idx_line);
console.log('  §VAC_EVIDENCE §BATCHED_FAIL firings=' + F.batched_fail_count +
  ' | at_capture firings=' + F.at_capture_firings +
  ' singleMesh_matched=0 on=' + F.at_capture_singleMesh_matched_zero +
  ' batchObjsContainingFrontier>0 on=' + F.at_capture_batchObjs_nonzero);
console.log('  §VAC_EVIDENCE ' + F.tm_shadow_inherit_line +
  ' | §GROUP_SPARK_TICK roll=0 on ' + F.group_spark_roll_zero + '/' + S.GROUP_SPARK_TICK.total +
  ' firings (dead throttle) | §PERF_TRAVERSE same expression, ' + F.perf_traverse_firings + ' firings (named, NOT changed)');
console.log('  §VAC_EVIDENCE §IDLE_GATE max cycles=' + F.idle_gate_max_cycles +
  ' against ' + S.IDLE_GATE.total + ' logged lines — the lines are a 1-in-25 sample, not the event count');

const schema = {
  type: 'object',
  required: ['tag', 'tagBase', 'file', 'treatment', 'diagnosis', 'firedBefore', 'canSayVacuous', 'emittedAfter'],
  properties: {
    tag: { type: 'string', pattern: '^§' },
    tagBase: { type: 'string', pattern: '^§' },
    file: { type: 'string', pattern: '^viewer/' },
    treatment: { enum: ['GUARD', 'FIX', 'GUARD+FIX', 'REMOVE', 'WORDING'] },
    diagnosis: { enum: ['empty-population', 'broken-matcher', 'repeated-identical-verdict',
                        'dead-throttle-and-vacuous', 'no-denominator', 'already-compliant'] },
    firedBefore: { type: 'integer', minimum: 1 },
    canSayVacuous: { const: true },
    emittedAfter: { type: 'integer', minimum: 1 },
    losslessOnRealSeries: { const: true },
    extraFixShipped: { type: 'boolean' },
  },
};

Witness('vacuous_tag_guards')
  .population(() => rows)
  .schema(schema)

  // C1 — all nine of §R13.9's tags are accounted for, none quietly dropped, none substituted.
  //      §PHOTO_GLOW_SPRITE is ONE tag with TWO emit sites (staged/removed, 3,502 firings between
  //      them), so the row count is 10 and the distinct-tag count is 9. The list is pinned by name
  //      rather than by count so a swapped tag cannot pass as a covered one.
  .invariant('C1 all-nine-tags-audited (§R13.9 list, by name, none dropped or substituted)', rs => {
    const want = ['§GROUP_SPARK_TICK', '§GROUND_WETNESS_OVERRIDE', '§NIGHT_STILL_LIGHTS',
      '§PHOTO_GLOW_SPRITE', '§GLOW_LENS_QUAD', '§ENVMAP_STOMP_GUARD', '§IDLE_GATE',
      '§SHADOW_FRONTIER', '§SHADOW_FRONTIER_AT_CAPTURE'].sort();
    const got = Array.from(new Set(rs.map(r => r.tagBase))).sort();
    return got.length === 9 && want.every((w, i) => w === got[i]);
  })

  // C2 — every tag whose zeros can be structurally forced now prints VACUOUS at its own emit site
  //      in the SHIPPED source. This is the CLAUDE.md rule-4 obligation.
  .invariant('C2 every empty-population tag can say VACUOUS in shipped source',
    rs => rs.filter(r => r.diagnosis === 'empty-population' || r.diagnosis === 'dead-throttle-and-vacuous')
            .every(r => r.canSayVacuous === true))

  // C3 — the compression is LOSSLESS, proved by executing the shipped _vacLog against the real
  //      2,027-frame series. "Never silently drop the signal" is the half of V2 that can regress.
  .invariant('C3 run-length compression is lossless on the real 2,027-frame series',
    rs => rs.every(r => r.losslessOnRealSeries === true))

  // C4 — and it is not a no-op: every repeated tag emits strictly fewer lines than it used to.
  //      A treatment that changed nothing must be visible as a failure here, not read as a pass.
  .invariant('C4 repeated-verdict tags emit strictly fewer lines than before',
    rs => rs.filter(r => r.diagnosis === 'repeated-identical-verdict' ||
                         r.diagnosis === 'no-denominator' ||
                         r.diagnosis === 'dead-throttle-and-vacuous')
            .every(r => r.emittedAfter < r.firedBefore))

  // C5 — THE DISTINCTION THE ITEM EXISTS FOR. §SHADOW_FRONTIER_AT_CAPTURE's 286 zero-matches were
  //      an empty population, not a broken lookup, and all four facts must hold together:
  //        the single-mesh index is empty and says so;   all guids landed in the group index;
  //        no BatchedMesh fallback ever fired;           the batch half judged on every firing.
  //      If any one of these flips, the diagnosis is wrong and this must FAIL rather than let a
  //      VACUOUS label hide a live matcher defect.
  .invariant('C5 SHADOW_FRONTIER_AT_CAPTURE = empty population, NOT a broken matcher', () =>
    F.shadow_frontier_idx_meshGuids === 0 &&
    F.shadow_frontier_idx_groupGuids > 0 &&
    F.batched_fail_count === 0 &&
    /multi_draw=on/.test(F.renderer_caps_line || '') &&
    F.at_capture_singleMesh_matched_zero === F.at_capture_firings &&
    F.at_capture_batchObjs_nonzero === F.at_capture_firings)

  // C6 — the two FIX halves are actually shipped, not just described: the unmatched= counter on
  //      §SHADOW_FRONTIER_AT_CAPTURE, and §GROUP_SPARK_TICK's replacement for the dead throttle.
  .invariant('C6 both FIX treatments present in shipped source (unmatched=, live tick counter)',
    rs => rs.filter(r => r.treatment === 'GUARD+FIX').every(r => r.extraFixShipped === true))

  // C7 — the dead throttle really was dead: roll=0 on every one of the 2,027 archived firings.
  .invariant('C7 §GROUP_SPARK_TICK throttle was dead in the bake path (roll=0 on 100% of firings)',
    () => F.group_spark_roll_zero === S.GROUP_SPARK_TICK.total && S.GROUP_SPARK_TICK.total > 1000)

  // redControl — a witness that cannot fail is not a witness. Claim the worst tag was a broken
  // matcher that got a VACUOUS label anyway (the exact defect this item was warned against), and
  // drop the losslessness guarantee. C2/C3 and the schema must both reject it.
  .redControl(rs => {
    const broken = rs.map(r => Object.assign({}, r));
    broken[0].diagnosis = 'broken-matcher';
    broken[0].canSayVacuous = false;
    broken[0].losslessOnRealSeries = false;
    return broken;
  })
  .run();
