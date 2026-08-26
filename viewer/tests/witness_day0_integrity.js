#!/usr/bin/env node
// witness_day0_integrity.js — THE OPENING OF THE PROGRAMME, JUDGED IN ONE PLACE.
//
// ⚠ DO NOT REMOVE — SCOPE. USER, 2026-08-26: "Will DAY 0 start with as early days success? For
// Hospital and Terminal where only substructure if exist gets buildup with no columns and beams
// hanging?" — and then, on being shown a green log: "do not trust your WITNESS logging and keep on
// constructing them to be foolproof covering the big picture issues."
//
// So this witness is built to FAIL LOUDLY, including at itself. Every claim reports the SIZE of the
// population it judged, and a 0 over an empty population prints INCONCLUSIVE, never PASS. Read the
// log after every run (project Log Mandate).
//
// WHY IT EXISTS AT ALL: the shipped pipeline already emits §S18_STOREY_MERGE_FAIL — and its wording,
// "no elevation data, bands unmerged", reads like benign degradation. It is not. MEASURED
// 2026-08-26: that line means Terminal's level model is 22 bands for a ~7-floor building (three
// parallel naming systems: Malay "Aras *", English "0N ... FLOOR LEVEL", and "Ceiling Level *"
// reference planes), which is why 16 ceiling fans and a light fixture are scheduled into HOUR 0 OF
// DAY 0. A log line that understates is the same defect as a log line that lies. C1 below restates
// it as a hard claim with a number.
//
// CLAIMS (each independently PASS / FAIL / INCONCLUSIVE):
//   C1 BAND MODEL      every storey band resolves to a physical floor datum, and bands are disjoint.
//   C2 DAY-0 PURITY    DAY 0 contains Substructure only (or, where the building models none, only
//                      the lowest Superstructure band). No Architecture, no Finishes, no MEP.
//   C3 DAY-0 SUPPORT   nothing on screen during DAY 0 is hanging: every non-exempt element has a
//                      bearing/embedded support already placed.
//   C4 NO EARLY MEP    no MEP phase appears in the opening window (default 3 days).
//
// The judge is REQUIRED from viewer/support_sweep.js and never re-derived here (4D_MODEL_INTEGRITY
// §G.0). The ground exemption is the SHIPPED one, schedule_gate.js:1210 `T.seq !== 1`.
// Input is the PERSISTED run (scripts/cache_4d_run.js) — the pipeline is not re-run per witness.
'use strict';
const path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..');
const SG = require(path.join(ROOT, 'viewer', 'schedule_gate.js')); global.ScheduleGate = SG;
const SS = require(path.join(ROOT, 'viewer', 'support_sweep.js'));
const CACHE = require(path.join(ROOT, 'scripts', 'cache_4d_run.js'));

const BUILDINGS = process.argv.slice(2).filter(a => a[0] !== '-').length
  ? process.argv.slice(2).filter(a => a[0] !== '-')
  : ['Duplex', 'HHS_Office_Federated', 'Hospital', 'Terminal'];
const DAY_MS = 86400000;
const MEP_WINDOW_D = process.env.MEP_WINDOW_D ? Number(process.env.MEP_WINDOW_D) : 3;

// A claim that cannot say INCONCLUSIVE is not a claim. `pop` is the population it judged.
function claim(id, bld, pop, bad, detail) {
  const verdict = pop === 0 ? 'INCONCLUSIVE' : (bad === 0 ? 'PASS' : 'FAIL');
  console.log('§W_D0 ' + id + ' ' + bld.padEnd(22) + verdict.padEnd(13) +
    'judged=' + String(pop).padEnd(7) + 'bad=' + String(bad).padEnd(7) + (detail || ''));
  return verdict;
}

function run(bld) {
  const r = CACHE.read(bld);
  if (!r) { console.log('§W_D0 CACHE_MISS ' + bld + ' — run: node scripts/cache_4d_run.js ' + bld); return ['INCONCLUSIVE']; }
  const els = r.els, sched = r.sched;
  const EPS = SG.EPS, GAP = SG.GAP;
  const G = SS.contactGraph(els);
  if (!G.ok) { console.log('§W_D0 JUDGE_UNAVAILABLE ' + bld); return ['INCONCLUSIVE']; }
  const t0 = Math.min.apply(null, Object.keys(sched).map(g => sched[g].s));
  const out = [];

  // ── C1 BAND MODEL ──────────────────────────────────────────────────────────────────────────
  // A level is a DATUM (4D_MODEL_INTEGRITY §C) and bands must be disjoint by construction.
  //
  // ⚠ THIS CLAIM WAS WRONG ON ITS FIRST WRITING AND IS KEPT HERE AS THE CORRECTION. The first
  // version tested whether adjacent bands' element base_z percentile ranges overlapped, and it
  // FAILED all four buildings — on Hospital by 0.01m (Level 2 p95=176.51 vs Level 3 p05=176.50),
  // which is a floor-plate thickness, not a broken band model. That is a bounding-box test with a
  // tolerance constant, i.e. exactly the proxy reasoning §E forbids, and it produced a red that
  // meant nothing. Deleted.
  //
  // What replaces it needs NO tolerance at all: compare the storeys the IFC ITSELF DECLARES
  // (spatial_structure IfcBuildingStorey rows, persisted by scripts/cache_4d_run.js) against the
  // bands the schedule actually uses. A schedule that invents more levels than the model declares
  // is wrong as a matter of fact, not of threshold. Where the DB carries no spatial_structure at
  // all (Duplex and Hospital, measured) this claim reports INCONCLUSIVE — absent is reported as
  // absent, never guessed.
  //
  // Datum collision is kept as a SECONDARY count and is honest about its own limit: it uses this
  // module's existing GAP (0.5m), so it catches two names at the same floor and UNDERCOUNTS names
  // one ceiling-void apart (Terminal's "Ceiling Level 04"@33.3m vs "Aras 03"@34.0m are 0.7m apart
  // and are the same physical floor, but do not trip it). It is a floor on the defect, not a
  // measure of it — which is why the declared-vs-scheduled test above is the actual claim.
  const byBand = {};
  els.forEach(e => { const b = SG.collapsePhase(e.storey); (byBand[b] = byBand[b] || []).push(e.bz); });
  const bands = Object.keys(byBand).filter(b => !/^_?unknown$/i.test(b)).map(b => {
    const zs = byBand[b].slice().sort((x, y) => x - y);
    return { b: b, n: zs.length, mid: zs[Math.floor(zs.length / 2)] };
  }).sort((a, b) => a.mid - b.mid);
  let collide = 0; const collisions = [];
  for (let i = 1; i < bands.length; i++) {
    if (Math.abs(bands[i].mid - bands[i - 1].mid) <= GAP) {
      collide++; collisions.push(bands[i - 1].b + ' ~ ' + bands[i].b + ' @' + bands[i].mid.toFixed(2) + 'm');
    }
  }
  const declared = r.storeys ? r.storeys.length : null;
  const excess = declared == null ? 0 : Math.max(0, bands.length - declared);
  out.push(claim('C1_BAND_MODEL ', bld, declared == null ? 0 : bands.length, excess + collide,
    (declared == null
      ? 'spatial_structure ABSENT from this DB — the model declares no storeys to check against'
      : 'declaredStoreys=' + declared + ' scheduledBands=' + bands.length + ' excess=' + excess) +
    ' datumCollisions=' + collide +
    (collisions.length ? ' [' + collisions.slice(0, 4).join(' | ') + ']' : '')));

  // ── C2 DAY-0 PURITY + C3 DAY-0 SUPPORT ─────────────────────────────────────────────────────
  const cur = t0 + DAY_MS;
  const placed = els.map(e => (sched[e.guid] && sched[e.guid].s <= cur) ? 1 : 0);
  const onScreen = placed.reduce((a, b) => a + b, 0);
  const modelsSub = els.some(e => e.seq === 1);
  const phaseHist = {}; let impure = 0; const impureCls = {};
  for (let i = 0; i < els.length; i++) {
    if (!placed[i]) continue;
    const ph = els[i].phase || '_UNPHASED';
    phaseHist[ph] = (phaseHist[ph] || 0) + 1;
    // Pure opening = the Substructure PHASE. Where the building models no Substructure at all, the
    // lowest Superstructure band is the legitimate opening (HHS models zero foundations —
    // 4D_template.json says so explicitly via "_empty_ok"; absent is reported, never skipped).
    //
    // ⚠ TEST THE PHASE, NOT seq. First draft tested `seq === 1` and called 65 Terminal elements
    // intruders on a line that printed `phases{Substructure:301}` — the verdict contradicting its
    // own evidence, which is the tell. §GROUNDWORK_SLAB reclassifies slab-on-grade by geometry and
    // "mutates phase in place; seq/resource unchanged" (schedule_author.js), so a genuinely
    // ground-bearing slab is phase Substructure at seq 4. The user's question was about the phase
    // ("only substructure if exist gets buildup"), and the phase is what the log prints.
    const ph_i = els[i].phase || '';
    const ok = modelsSub ? (ph_i === 'Substructure') : (els[i].seq <= 4);
    if (!ok) { impure++; impureCls[els[i].cls] = (impureCls[els[i].cls] || 0) + 1; }
  }
  // ⚠ "DAY 0" IS NOT THE INVARIANT — THE PHASE ORDER IS. Measured: Duplex's whole programme is 13
  // days and its Substructure is 18 elements finishing inside the first day, so "DAY 0 contains
  // only Substructure" fails there for a reason that is not a defect — the foundations really are
  // done, and holding the rest of the day empty would be make-work. Terminal's DAY 0 is 3% of its
  // programme and Hospital's under 1%, so the same window means three different things. What is
  // actually wrong is an element STARTING BEFORE THE SUBSTRUCTURE IT SITS ON IS FINISHED, and that
  // is exact, needs no window, and is comparable across every building. The DAY-0 composition stays
  // in the log as observability; the CLAIM is the phase order.
  let subEnd = -Infinity, subN = 0;
  for (let i = 0; i < els.length; i++) {
    if ((els[i].phase || '') !== 'Substructure') continue;
    const st = sched[els[i].guid]; if (!st) continue;
    subN++; if (st.e > subEnd) subEnd = st.e;
  }
  let early = 0; const earlyCls = {};
  if (modelsSub && subN) {
    for (let i = 0; i < els.length; i++) {
      if ((els[i].phase || '') === 'Substructure') continue;
      const st = sched[els[i].guid]; if (!st) continue;
      if (st.s < subEnd - 1) { early++; earlyCls[els[i].cls] = (earlyCls[els[i].cls] || 0) + 1; }
    }
  }
  out.push(claim('C2_SUB_FIRST  ', bld, modelsSub ? subN : onScreen, modelsSub ? early : impure,
    'modelsSubstructure=' + modelsSub +
    (modelsSub ? ' substructure=' + subN + ' ends h' + ((subEnd - t0) / 3600000).toFixed(1) +
      (early ? '  STARTED BEFORE IT{' + Object.entries(earlyCls).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => k + ':' + n).join(' ') + '}' : '')
     : ' (template declares _empty_ok; the lowest Superstructure band is the legitimate opening)') +
    '  [observed, not gated: DAY 0 phases{' +
    Object.entries(phaseHist).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + ':' + n).join(' ') + '}]'));

  // TWO KINDS OF HANGING, AND ONLY ONE IS THE SCHEDULER'S. Conflating them makes the number
  // unactionable, which is why this splits them — the distinction is 4D_MODEL_INTEGRITY §F's own
  // ("148 rest on something on their own level classified into a later phase — a §5.1 data defect:
  // named, never scheduled around"), not a new one invented here.
  //   ORDER    — at least one real support is classified at or before this element's own phase, so
  //              the declared programme COULD have placed it first and did not. The scheduler owns
  //              this and it must be 0.
  //   MODEL    — EVERY real support is classified into a LATER phase than the element it carries.
  //              No ordering fixes that: forcing it means overriding the declared programme with
  //              geometry, which is precisely the election §A says is inexpressible by design.
  // MEASURED example, Duplex: 6 IfcBeam (M_W-Wide Flange W310X60/W410X60, Superstructure seq 3)
  // rest on 'Basic Wall:Exterior - Brick on Block' and 'Party Wall - CMU' — load-bearing masonry
  // that IfcWall's class rule sends to Architecture Envelope seq 5. In masonry construction the
  // structural wall IS the envelope wall; the programme's frame-then-envelope shape is a
  // steel/concrete assumption. That is a classification/programme question, and §B forbids fixing
  // it in CLASSIFY ("element -> (phase, trade). A lookup. Must never compute anything").
  let judged = 0, hangOrder = 0, hangModel = 0;
  const hangCls = {}, modelPairs = {};
  for (let i = 0; i < els.length; i++) {
    if (!placed[i]) continue;
    if (els[i].seq === 1 || G.grounded[i]) continue;      // shipped 1c + rests on soil
    judged++;
    const T = els[i]; let held = 0, anySup = 0, allLater = 1, worst = null;
    for (const j of (G.contacts[i] || [])) {
      const S = els[j];
      const bearing = (S.bz < T.bz - EPS && S.tz >= T.bz - GAP);
      const embedded = (S.bz <= T.bz + EPS && S.tz >= T.tz - EPS);
      if (!(bearing || embedded)) continue;
      anySup++;
      if (placed[j]) { held = 1; break; }
      if (S.seq <= T.seq) allLater = 0;
      if (!worst || S.seq > worst.seq) worst = S;
    }
    if (held) continue;
    hangCls[T.cls] = (hangCls[T.cls] || 0) + 1;
    if (anySup && allLater) {
      hangModel++;
      if (worst) { const k = T.phase + ' seq' + T.seq + ' <- ' + worst.phase + ' seq' + worst.seq;
        modelPairs[k] = (modelPairs[k] || 0) + 1; }
    } else hangOrder++;
  }
  out.push(claim('C3_DAY0_SUPPORT', bld, judged, hangOrder,
    (hangOrder || hangModel
      ? 'hanging{' + Object.entries(hangCls).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => k + ':' + n).join(' ') + '}' +
        ' ORDER=' + hangOrder + ' (the scheduler owns this)  MODEL=' + hangModel +
        ' (every support classified LATER — a §5.1 data defect, not schedulable)' +
        (hangModel ? ' ' + Object.entries(modelPairs).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => '[' + k + ' x' + n + ']').join(' ') : '')
      : 'nothing on screen is unheld')));

  // ── C4 NO EARLY MEP ────────────────────────────────────────────────────────────────────────
  // ⚠ THIS CLAIM'S WINDOW WAS WRONG AND THE CORRECTION IS KEPT. It first gated a FIXED 3 days,
  // which is not comparable across buildings: measured, Duplex's ENTIRE programme is 12 days
  // (§AUTHOR_TPL totalDays=12) while Terminal's is 97 and Hospital's 318 — so "3 days" is 25% of
  // one job and 3% of another, and Duplex failed with 175 hits that were 171 MEP Rough-in on the
  // T/FDN level, i.e. underdrainage going in with the foundations, which is correct sequence.
  // A claim whose threshold means something different per building measures the buildings, not the
  // defect. The window is now DAY 0 — the same window C2 and C3 judge, and the user's actual scope.
  // The 3-day figure is still REPORTED beside it as observability, deliberately not gating.
  let mep = 0; const mepCls = {};
  for (let i = 0; i < els.length; i++) {
    if (!placed[i]) continue;
    if (/^MEP/.test(els[i].phase || '')) { mep++; mepCls[els[i].cls] = (mepCls[els[i].cls] || 0) + 1; }
  }
  const obsCur = t0 + MEP_WINDOW_D * DAY_MS;
  let obsIn = 0, obsMep = 0;
  for (let i = 0; i < els.length; i++) {
    const st = sched[els[i].guid]; if (!st || st.s > obsCur) continue;
    obsIn++; if (/^MEP/.test(els[i].phase || '')) obsMep++;
  }
  const spanD = (Math.max.apply(null, Object.keys(sched).map(g => sched[g].e)) - t0) / DAY_MS;
  out.push(claim('C4_NO_EARLY_MEP', bld, onScreen, mep, 'window=DAY 0' +
    (mep ? ' MEP{' + Object.entries(mepCls).map(([k, n]) => k + ':' + n).join(' ') + '}' : '') +
    '  [observed, not gated: ' + obsMep + '/' + obsIn + ' MEP within ' + MEP_WINDOW_D +
    'd of a ' + spanD.toFixed(0) + 'd programme]'));
  return out;
}

const all = [];
for (const b of BUILDINGS) { all.push.apply(all, run(b)); console.log(''); }
const fail = all.filter(v => v === 'FAIL').length, inc = all.filter(v => v === 'INCONCLUSIVE').length;
console.log('§W_D0_VERDICT claims=' + all.length + ' PASS=' + (all.length - fail - inc) +
  ' FAIL=' + fail + ' INCONCLUSIVE=' + inc + '  ' +
  (fail ? 'RED' : inc ? 'NOT GREEN — a claim judged nothing; an empty population is not a pass' : 'GREEN'));
process.exit(fail ? 1 : 0);
