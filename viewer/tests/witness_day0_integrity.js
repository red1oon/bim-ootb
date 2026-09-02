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
//
// ⚠ WHICH LAYER (§CACHE_PLAYED_LAYER, 2026-09-02, queue item A-9). C2/C3/C4 are questions about
// WHEN AN ELEMENT APPEARS ON SCREEN, so they must be asked of the map the screen actually plays.
// Until this date they read the cache's `sched` key = materializeZones' displaySchedule, and
// §TM_REVEAL_SHIPPED measured that viewer/time_machine.js has ZERO readers of that map. Those
// verdicts described a layer nobody plays: the fleet table `claims=13 PASS=4 FAIL=5 INCONCLUSIVE=4`
// is VOID as a statement about the film (queue item A-0). The layer is now selected through
// CACHE.layerOf() and PRINTED ON EVERY LINE — `LAYER=display` re-points this witness at the old map
// deliberately, and it still says so. C1 is band geometry and is layer-independent by construction.
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
// `layer` is the map it judged it ON — a claim that cannot name its own input cannot report being
// pointed at the wrong one (§CACHE_PLAYED_LAYER).
function claim(id, bld, pop, bad, detail, layer) {
  const verdict = pop === 0 ? 'INCONCLUSIVE' : (bad === 0 ? 'PASS' : 'FAIL');
  console.log('§W_D0 ' + id + ' ' + bld.padEnd(22) + verdict.padEnd(13) +
    'layer=' + String(layer).padEnd(9) +
    'judged=' + String(pop).padEnd(7) + 'bad=' + String(bad).padEnd(7) + (detail || ''));
  return verdict;
}

function run(bld) {
  const r = CACHE.read(bld);
  if (!r) { console.log('§W_D0 CACHE_MISS ' + bld + ' — run: node scripts/cache_4d_run.js ' + bld); return ['INCONCLUSIVE']; }
  const L = CACHE.layerOf(r);
  console.log('§W_D0_LAYER ' + bld.padEnd(22) + 'layer=' + L.id + ' key=' + L.key +
    ' — ' + L.desc + (L.missing ? '  ⛔ ABSENT from this cache' : ''));
  if (L.missing) {
    console.log('§W_D0 CACHE_LAYER_MISSING ' + bld + ' layer=' + L.id +
      ' — this cache predates §CACHE_PLAYED_LAYER. Rebuild: node scripts/cache_4d_run.js --force ' + bld +
      '. NOT falling back to the other layer: that substitution is the defect A-9 removed.');
    return ['INCONCLUSIVE'];
  }
  const els = r.els, sched = L.map, LAY = L.id;
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
    (collisions.length ? ' [' + collisions.slice(0, 4).join(' | ') + ']' : ''), 'n/a-geometry'));

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
    // Pure opening = Substructure. Where the building models NO Substructure at all, the lowest
    // Superstructure band is the legitimate opening (HHS models zero foundations — 4D_template.json
    // says so explicitly and "_empty_ok": absent must be reported, never silently skipped).
    const ok = modelsSub ? (els[i].seq === 1) : (els[i].seq <= 4);
    if (!ok) { impure++; impureCls[els[i].cls] = (impureCls[els[i].cls] || 0) + 1; }
  }
  out.push(claim('C2_DAY0_PURITY', bld, onScreen, impure,
    'modelsSubstructure=' + modelsSub + ' phases{' +
    Object.entries(phaseHist).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + ':' + n).join(' ') + '}' +
    (impure ? '  INTRUDERS{' + Object.entries(impureCls).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => k + ':' + n).join(' ') + '}' : ''), LAY));

  let judged = 0, hanging = 0; const hangCls = {};
  for (let i = 0; i < els.length; i++) {
    if (!placed[i]) continue;
    if (els[i].seq === 1 || G.grounded[i]) continue;      // shipped 1c + rests on soil
    judged++;
    const T = els[i]; let held = 0;
    for (const j of (G.contacts[i] || [])) {
      const S = els[j];
      const bearing = (S.bz < T.bz - EPS && S.tz >= T.bz - GAP);
      const embedded = (S.bz <= T.bz + EPS && S.tz >= T.tz - EPS);
      if ((bearing || embedded) && placed[j]) { held = 1; break; }
    }
    if (!held) { hanging++; hangCls[T.cls] = (hangCls[T.cls] || 0) + 1; }
  }
  out.push(claim('C3_DAY0_SUPPORT', bld, judged, hanging,
    (hanging ? 'hanging{' + Object.entries(hangCls).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => k + ':' + n).join(' ') + '}' : 'nothing on screen is unheld'), LAY));

  // ── C4 NO EARLY MEP ────────────────────────────────────────────────────────────────────────
  const mepCur = t0 + MEP_WINDOW_D * DAY_MS;
  let inWin = 0, mep = 0; const mepCls = {};
  for (let i = 0; i < els.length; i++) {
    const st = sched[els[i].guid]; if (!st || st.s > mepCur) continue;
    inWin++;
    if (/^MEP/.test(els[i].phase || '')) { mep++; mepCls[els[i].cls] = (mepCls[els[i].cls] || 0) + 1; }
  }
  out.push(claim('C4_NO_EARLY_MEP', bld, inWin, mep, 'window=' + MEP_WINDOW_D + 'd' +
    (mep ? ' MEP{' + Object.entries(mepCls).map(([k, n]) => k + ':' + n).join(' ') + '}' : ''), LAY));
  return out;
}

const all = [];
for (const b of BUILDINGS) { all.push.apply(all, run(b)); console.log(''); }
const fail = all.filter(v => v === 'FAIL').length, inc = all.filter(v => v === 'INCONCLUSIVE').length;
console.log('§W_D0_VERDICT layer=' + (process.env.LAYER || 'played') +
  ' claims=' + all.length + ' PASS=' + (all.length - fail - inc) +
  ' FAIL=' + fail + ' INCONCLUSIVE=' + inc + '  ' +
  (fail ? 'RED' : inc ? 'NOT GREEN — a claim judged nothing; an empty population is not a pass' : 'GREEN'));
process.exit(fail ? 1 : 0);
