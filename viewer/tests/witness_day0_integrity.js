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
//
// ⚠ §W_D0_ATTRIBUTION (2026-09-02, queue item B-1; bim-compiler prompts/4D_MODEL_INTEGRITY.md §J.6).
// The eight played-layer FAILs were attributed one by one and THREE OF THEM WERE THIS FILE'S OWN
// DEFECTS, each against a row of the §I ownership table. Fixed here, and every fix is ADDITIVE —
// the four buildings' verdict letters are unchanged by all three (measured A/B before writing):
//   W1  C2 judged `seq === 1` while its own detail line printed `phase`. Those are different
//       relations by construction: §GROUNDWORK_SLAB (schedule_gate.js:201) promotes an element's
//       PHASE to Substructure and deliberately leaves its seq — 236 elements fleet-wide (Terminal
//       233, Hospital 2, Duplex 1). Terminal's 9 "intruders" are 9 of those, in the FIRST task,
//       with day-0 phase purity 245/245. C2 now reports BOTH relations and fails on EITHER, so
//       Duplex's genuinely-misclassified 13mm ceramic tile is still counted and Terminal's
//       foundation beams are NAMED as promotions instead of appearing as anonymous intruders.
//   W2  C3 elected its own support — §I says the OWNER is support_sweep.js:432 _designatedSupport
//       and the "never" column is literally "elect a support yourself". Walking raw contacts let a
//       waste pipe count as a stair stringer's bearing (Duplex: all 3 of its bearing candidates are
//       IfcFlowSegment at bz -0.47/-0.63 — §S26.2's own worked example). Now calls the owner, and
//       PRINTS which element was elected, so a hanging is self-attributing. The old inline count is
//       kept and printed beside it: a future divergence between the two must be visible, not silent.
//   W3  C1's "declared" side is not declared. 6 of 6 Terminal and 3 of 3 HHS IfcBuildingStorey rows
//       carry object_type='COMPILED' with STC_* guids — compile_rooms.py output, not an IFC
//       declaration — and NEITHER DB has an `elevation` column, so deriveStoreyMergeMap (the §I
//       owner of "are two storey names one floor?") cannot run on any building in the fleet.
//       ⚠ C1's VERDICT LOGIC IS DELIBERATELY UNTOUCHED (it was verified valid and layer-independent
//       and this change does not re-litigate it). Only the DETAIL gained `declaredBy=`, so the claim
//       can state the limit of its own input without changing what it judges.
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
  // §W_D0_ATTRIBUTION W3 — PROVENANCE, DETAIL ONLY. The verdict math above and below is unchanged.
  // A row written by compile_rooms.py (object_type='COMPILED', STC_* guid) is a DERIVED artifact,
  // not something "the IFC declares", and this claim's whole premise is the latter. It cannot say
  // that unless it prints it. Measured 2026-09-02: Terminal 6/6 and HHS 3/3 are COMPILED.
  const compiled = r.storeys ? r.storeys.filter(s => s.object_type === 'COMPILED').length : 0;
  const provenance = declared == null ? '' :
    ' declaredBy=' + (compiled === declared
      ? 'COMPILED:' + compiled + '/' + declared + '(compile_rooms.py, NOT an IFC declaration — this claim is judged against a DERIVED storey set; §J.6.2 W3)'
      : compiled ? 'MIXED:' + compiled + '/' + declared + '-compiled' : 'IFC:' + declared + '/' + declared);
  out.push(claim('C1_BAND_MODEL ', bld, declared == null ? 0 : bands.length, excess + collide,
    (declared == null
      ? 'spatial_structure ABSENT from this DB — the model declares no storeys to check against'
      : 'declaredStoreys=' + declared + ' scheduledBands=' + bands.length + ' excess=' + excess) +
    ' datumCollisions=' + collide + provenance +
    (collisions.length ? ' [' + collisions.slice(0, 4).join(' | ') + ']' : ''), 'n/a-geometry'));

  // ── C2 DAY-0 PURITY + C3 DAY-0 SUPPORT ─────────────────────────────────────────────────────
  const cur = t0 + DAY_MS;
  const placed = els.map(e => (sched[e.guid] && sched[e.guid].s <= cur) ? 1 : 0);
  const onScreen = placed.reduce((a, b) => a + b, 0);
  const modelsSub = els.some(e => e.seq === 1);
  // §W_D0_ATTRIBUTION W1 — TWO RELATIONS, BOTH JUDGED, NEITHER ASSUMED TO BE THE OTHER.
  // This claim used to read `seq === 1` and print `phase`, and those disagree BY CONSTRUCTION:
  // §GROUNDWORK_SLAB (schedule_gate.js:201) is the shipped owner of "is this slab/beam groundwork"
  // and it promotes PHASE to Substructure while deliberately leaving seq ("seq/resource unchanged").
  // 236 elements fleet-wide are in that state. Reading only `seq` made Terminal's 9 promoted
  // foundation beams look like intruders in a day 0 that is 245/245 Substructure by phase; reading
  // only `phase` would have HIDDEN Duplex's 13mm "Finish Floor - Ceramic Tile", which §GROUNDWORK_SLAB
  // promoted by mistake and PR #1551's finish_floor_finishes override exists to fix. So BOTH are
  // judged and EITHER fails — the counts are reported separately so the log says which objected.
  const phaseHist = {}; let impure = 0, promoted = 0; const impureCls = {}, promoCls = {};
  for (let i = 0; i < els.length; i++) {
    if (!placed[i]) continue;
    const ph = els[i].phase || '_UNPHASED';
    phaseHist[ph] = (phaseHist[ph] || 0) + 1;
    // Pure opening = Substructure. Where the building models NO Substructure at all, the lowest
    // Superstructure band is the legitimate opening (HHS models zero foundations — 4D_template.json
    // says so explicitly and "_empty_ok": absent must be reported, never silently skipped). In that
    // branch the two relations coincide by definition and the split below reads 0/0, correctly.
    const okSeq = modelsSub ? (els[i].seq === 1) : (els[i].seq <= 4);
    const okPhase = modelsSub ? (ph === 'Substructure') : (els[i].seq <= 4);
    if (!okPhase) { impure++; impureCls[els[i].cls] = (impureCls[els[i].cls] || 0) + 1; }
    else if (!okSeq) { promoted++; promoCls[els[i].cls + '(seq' + els[i].seq + '/' + els[i].resource + ')'] =
      (promoCls[els[i].cls + '(seq' + els[i].seq + '/' + els[i].resource + ')'] || 0) + 1; }
  }
  out.push(claim('C2_DAY0_PURITY', bld, onScreen, impure + promoted,
    'modelsSubstructure=' + modelsSub + ' byPhase=' + impure + ' bySeqOnly=' + promoted + ' phases{' +
    Object.entries(phaseHist).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + ':' + n).join(' ') + '}' +
    (impure ? '  INTRUDERS{' + Object.entries(impureCls).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => k + ':' + n).join(' ') + '}' : '') +
    (promoted ? '  §GROUNDWORK_SLAB-PROMOTED(phase=Substructure, seq left behind){' +
      Object.entries(promoCls).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => k + ':' + n).join(' ') + '}' : ''), LAY));

  // §W_D0_ATTRIBUTION W2 — CALL THE OWNER. §I: "which ONE thing supports T?" -> support_sweep.js:432
  // _designatedSupport; the "never" column is "elect a support yourself". This claim used to walk raw
  // contacts and accept ANY bearing/embedded one, which is how Duplex's day-0 stair stringer came to
  // be judged against three waste/cold-water IfcFlowSegment at bz -0.47/-0.63 — §S26.2's own worked
  // example of "an IfcFlowSegment under a wall bore that wall". _designatedSupport's pool election
  // (schedule_gate.js:1323 supportPool) rejects exactly that and elects the IfcSlab instead.
  // The old inline test is KEPT and PRINTED as a cross-check, never as the verdict: two judges of one
  // physics that quietly diverge is the defect class this whole file exists to catch, so a divergence
  // must be a number on the line. Measured 2026-09-02, they agree on all four (1/3/0/0).
  const DES = SS.designatedSupport(els, G);
  let judged = 0, hanging = 0, inlineHang = 0, desNone = 0, heldByCarrier = 0;
  const hangCls = {}, hangBy = {};
  for (let i = 0; i < els.length; i++) {
    if (!placed[i]) continue;
    if (els[i].seq === 1 || G.grounded[i]) continue;      // shipped 1c + rests on soil
    judged++;
    const T = els[i];
    let inlineHeld = 0;
    for (const j of (G.contacts[i] || [])) {
      const S = els[j];
      const bearing = (S.bz < T.bz - EPS && S.tz >= T.bz - GAP);
      const embedded = (S.bz <= T.bz + EPS && S.tz >= T.tz - EPS);
      if ((bearing || embedded) && placed[j]) { inlineHeld = 1; break; }
    }
    if (!inlineHeld) inlineHang++;
    const d = DES[i];
    if (d < 0) { desNone++; continue; }   // §MIDAIR_DIRECTIONAL: nothing it depends on. Counted, so it is never silent.
    const S = els[d];
    const carrier = (S.bz >= T.tz - GAP && S.tz > T.tz + EPS);
    if (!placed[d]) {
      hanging++;
      hangCls[T.cls] = (hangCls[T.cls] || 0) + 1;
      const k = T.cls + '<-' + S.cls + '|seq' + S.seq + '|' + (S.phase || '_UNPHASED');
      hangBy[k] = (hangBy[k] || 0) + 1;
    } else if (carrier) heldByCarrier++;   // the owner says held, by something ABOVE. Reported, not hidden.
  }
  out.push(claim('C3_DAY0_SUPPORT', bld, judged, hanging,
    (hanging
      ? 'hanging{' + Object.entries(hangCls).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => k + ':' + n).join(' ') + '}' +
        ' waitingOn{' + Object.entries(hangBy).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => k + ':' + n).join(' ') + '}'
      : 'nothing on screen is unheld') +
    ' judge=_designatedSupport(§I owner) inlineAnyContact=' + inlineHang +
    (inlineHang !== hanging ? ' ⚠ JUDGES DIVERGE' : '') +
    ' desNone=' + desNone + ' heldByCarrierAbove=' + heldByCarrier, LAY));

  // ── C4 NO EARLY MEP ────────────────────────────────────────────────────────────────────────
  const mepCur = t0 + MEP_WINDOW_D * DAY_MS;
  let inWin = 0, mep = 0, firstMep = Infinity; const mepCls = {}, mepStorey = {};
  let progEnd = t0;
  for (const g in sched) if (sched[g].e > progEnd) progEnd = sched[g].e;
  for (let i = 0; i < els.length; i++) {
    const st = sched[els[i].guid]; if (!st) continue;
    if (/^MEP/.test(els[i].phase || '') && st.s < firstMep) firstMep = st.s;
    if (st.s > mepCur) continue;
    inWin++;
    if (/^MEP/.test(els[i].phase || '')) {
      mep++; mepCls[els[i].cls] = (mepCls[els[i].cls] || 0) + 1;
      mepStorey[els[i].storey || '_'] = (mepStorey[els[i].storey || '_'] || 0) + 1;
    }
  }
  // §W_D0_ATTRIBUTION: MEP_WINDOW_D is an ABSOLUTE constant judged against programmes that span
  // 13 -> 318 days across this fleet, so 3 days is 23.1% of Duplex and 0.9% of Hospital. That is not
  // a reason to invent a proportional threshold (§J.0: a metric invented to fill a hole where a RULE
  // should be is the square peg) — it is a reason for the claim to PRINT the scale it is judging at,
  // so a reader can see whether a FAIL means "MEP is early" or "the programme is short".
  const progDays = (progEnd - t0) / DAY_MS;
  out.push(claim('C4_NO_EARLY_MEP', bld, inWin, mep, 'window=' + MEP_WINDOW_D + 'd' +
    ' programmeDays=' + progDays.toFixed(2) + ' windowIs=' + (MEP_WINDOW_D / progDays * 100).toFixed(1) + '%ofProgramme' +
    ' firstMEP=+' + (firstMep === Infinity ? 'none' : ((firstMep - t0) / DAY_MS).toFixed(2) + 'd') +
    (mep ? ' MEP{' + Object.entries(mepCls).map(([k, n]) => k + ':' + n).join(' ') + '}' +
      ' onStorey{' + Object.entries(mepStorey).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => k + ':' + n).join(' ') + '}' : ''), LAY));
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
