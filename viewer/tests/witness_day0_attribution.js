#!/usr/bin/env node
// witness_day0_attribution.js — §W_D0A: THE EIGHT DAY-0 FAILS, EACH PINNED TO ITS CAUSE.
//
// ⚠ DO NOT REMOVE — SCOPE. bim-compiler prompts/AGENT_QUEUE.md item B-1, written up as
// prompts/4D_MODEL_INTEGRITY.md §J.6. Read the log after every run (project Log Mandate).
//
// WHY IT EXISTS. §W_D0 says `claims=16 PASS=5 FAIL=8 INCONCLUSIVE=3 RED` on the played layer. Those
// eight FAILs were attributed by hand: 3 witness defects (fixed in witness_day0_integrity.js), 3
// modelling facts, 1 real defect whose fix sits on an unmerged PR, 1 absolute-threshold scope limit.
// **An attribution written only in prose decays into a claim nobody can re-check** — which is the
// exact failure this lane keeps paying for (§J.2's three retractions were all prose). So every
// attribution that can be stated as a number is a CLAIM here, judged off the persisted cache.
//
// This witness does NOT re-assert that the eight FAILs exist (that is §W_D0's job and duplicating it
// would be two judges of one fact). It asserts the CAUSES, so that the day a cause stops being true
// — a rates.js override lands, the source IFC is re-extracted, §GROUNDWORK_SLAB changes — the
// attribution in §J.6 goes red instead of quietly becoming fiction.
//
// CLAIMS (each independently PASS / FAIL / INCONCLUSIVE; a 0 over an empty population is never PASS):
//   A1 GROUNDWORK OWNS THE SEQ SPLIT  every day-0 element with phase='Substructure' and seq!==1 is a
//      §GROUNDWORK_SLAB promotion (ScheduleGate.groundworkSlabs, the shipped owner). If one is not,
//      C2's seq-vs-phase disagreement has a SECOND cause and §J.6.1 #4 is incomplete.
//   A2 #1551 OWNS DUPLEX'S DAY-0 DEFECT  Duplex's day-0 by-phase intruders and its hanging element
//      are all matched by the three name-override patterns PR #1551 declares, AND those patterns hit
//      exactly the fleet counts §J.6 records. A rates.js edit that moves either fails here.
//   A3 HHS's OPENING IS A MODEL FACT  HHS models ZERO seq-1 elements, and every element §W_D0 C3
//      calls hanging on it is waiting on a support in a LATER phase that lives in a DIFFERENT task —
//      i.e. §F's class, outside §TPL_LAYER_ORDER's within-task scope (§H.3). Not a solvable ordering.
//   A4 TERMINAL'S OPENING MEP IS A PHANTOM STOREY  the band carrying Terminal's early MEP is a
//      4-element band sitting below the model's own 1st-percentile base_z, and Substructure is a
//      building-scope phase, so it instantiates there and that band's MEP Final follows it.
//   A5 C1 HAS NO IFC-DECLARED BASELINE  every IfcBuildingStorey row in every cached DB that has any
//      is object_type='COMPILED'. C1 therefore compares the schedule against a DERIVED storey set on
//      every building in the fleet, and deriveStoreyMergeMap cannot run on any of them.
//   A6 DUPLEX'S EARLY MEP IS UNDER-SLAB WORK ON A SHORT PROGRAMME  every in-window MEP element is on
//      the foundation storey, and the 3-day window is a double-digit percentage of the programme.
//
// Reads the persisted cache (scripts/cache_4d_run.js) and selects the PLAYED layer through
// CACHE.layerOf(). No pipeline re-run, no browser, no bake.
//
// RED CONTROL: `W_D0A_RED=1 node viewer/tests/witness_day0_attribution.js` corrupts A1's population
// (one promoted element removed from the owner's answer) and the run MUST go RED. A witness that
// cannot be made to fail has not been shown to be able to fail.
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SG = require(path.join(ROOT, 'viewer', 'schedule_gate.js')); global.ScheduleGate = SG;
const SS = require(path.join(ROOT, 'viewer', 'support_sweep.js'));
const CACHE = require(path.join(ROOT, 'scripts', 'cache_4d_run.js'));

const DAY_MS = 86400000;
const RED = !!process.env.W_D0A_RED;
const BUILDINGS = ['Duplex', 'HHS_Office_Federated', 'Hospital', 'Terminal'];

// The three patterns PR #1551 declares (viewer/rates.js SEQUENCE_NAME_OVERRIDES on
// refs/pull/1551/head). Reproduced here as the WITNESS's own reference copy, deliberately: this file
// must be able to say "the defect #1551 targets is still live" while #1551 is unmerged, and it must
// go red if a LATER edit changes which elements those patterns reach. Not an executed rule table.
const PR1551 = [
  { id: 'foundation_wall_substructure', classes: ['IfcWall', 'IfcWallStandardCase'], re: /\bfoundation\b/i },
  { id: 'stair_member_architecture', classes: ['IfcMember'], re: /^\s*stair\b/i },
  { id: 'finish_floor_finishes', classes: ['IfcSlab'], re: /\bfinish(ed)?[ _-]?floor\b/i },
];
// MEASURED 2026-09-02 off this cache and recorded in §J.6.1 #3. Locked so a rates.js change that
// moves any of them fails loudly rather than silently invalidating the attribution.
const PR1551_FLEET = {
  foundation_wall_substructure: { Duplex: 7, HHS_Office_Federated: 0, Hospital: 28, Terminal: 0 },
  stair_member_architecture: { Duplex: 4, HHS_Office_Federated: 0, Hospital: 0, Terminal: 0 },
  finish_floor_finishes: { Duplex: 14, HHS_Office_Federated: 0, Hospital: 0, Terminal: 0 },
};

const verdicts = [];
function claim(id, scope, pop, bad, detail, layer) {
  const v = pop === 0 ? 'INCONCLUSIVE' : (bad === 0 ? 'PASS' : 'FAIL');
  verdicts.push(v);
  console.log('§W_D0A ' + id + ' ' + String(scope).padEnd(22) + v.padEnd(13) +
    'layer=' + String(layer).padEnd(9) + 'judged=' + String(pop).padEnd(7) +
    'bad=' + String(bad).padEnd(6) + (detail || ''));
  return v;
}

// load(bld) — the cache, the played layer, and the day-0 slice, in one place.
function load(bld) {
  const r = CACHE.read(bld);
  if (!r) { console.log('§W_D0A CACHE_MISS ' + bld + ' — run: node scripts/cache_4d_run.js ' + bld); return null; }
  const L = CACHE.layerOf(r);
  if (L.missing) {
    console.log('§W_D0A CACHE_LAYER_MISSING ' + bld + ' layer=' + L.id +
      ' — rebuild: node scripts/cache_4d_run.js --force ' + bld + '. Not substituting the other layer.');
    return null;
  }
  const sched = L.map, els = r.els;
  const t0 = Math.min.apply(null, Object.keys(sched).map(g => sched[g].s));
  const day0 = els.filter(e => sched[e.guid] && sched[e.guid].s <= t0 + DAY_MS);
  return { r: r, els: els, sched: sched, t0: t0, day0: day0, layer: L.id };
}

const D = {};
BUILDINGS.forEach(b => { D[b] = load(b); });
const have = BUILDINGS.filter(b => D[b]);
console.log('§W_D0A_INPUT buildings=' + have.length + '/' + BUILDINGS.length +
  ' elements=' + have.reduce((a, b) => a + D[b].els.length, 0) +
  ' layer=' + (have.length ? D[have[0]].layer : 'none') + (RED ? '  ⚠ RED CONTROL ARMED' : ''));

// ── A1 §GROUNDWORK_SLAB OWNS THE ENTIRE seq-vs-phase SPLIT ────────────────────────────────────────
// The owner is ScheduleGate.groundworkSlabs (schedule_gate.js:201) — called, never re-derived (§I).
{
  let pop = 0, bad = 0; const detail = [], off = {};
  have.forEach(b => {
    const els = D[b].els;
    // groundworkSlabs takes the gate's own element shape: it reads cls/phase/seq/base_z + bbox.
    const items = els.map(e => ({ guid: e.guid, cls: e.cls, seq: e.seq, phase: e.phase,
      base_z: e.bz, top_z: e.tz, x0: e.x0, x1: e.x1, y0: e.y0, y1: e.y1 }));
    // §GROUNDWORK_SLAB runs on the PRE-promotion phases; the cache stores the POST-promotion ones.
    // Re-deriving the pre-state would be inventing an input, so the membership question is asked the
    // only honest way available from the persisted run: an element is a promotion iff its phase is
    // Substructure while its class rule's own sequence is not 1. groundworkSlabs is still CALLED, on
    // the post-state, as the corroborating owner — an element it still elects is unambiguous.
    const gw = SG.groundworkSlabs(items.map(x => x.phase === 'Substructure' && x.seq !== 1
      ? Object.assign({}, x, { phase: 'Superstructure' }) : x));
    // RED CONTROL: drop ONE real member from the owner's answer. If the claim still passes, it is
    // not actually reading the owner and the PASS above means nothing.
    if (RED) { const k = D[b].day0.filter(e => e.phase === 'Substructure' && e.seq !== 1 && gw[e.guid])[0]; if (k) delete gw[k.guid]; }
    D[b].day0.forEach(e => {
      if (!(e.phase === 'Substructure' && e.seq !== 1)) return;
      pop++;
      if (!gw[e.guid]) { bad++; off[b + '/' + e.cls] = (off[b + '/' + e.cls] || 0) + 1; }
    });
    const n = D[b].day0.filter(e => e.phase === 'Substructure' && e.seq !== 1).length;
    if (n) detail.push(b + ':' + n);
  });
  claim('A1_GROUNDWORK_OWNS_SEQ_SPLIT', 'fleet', pop, bad,
    'day0 elements with phase=Substructure & seq!==1 {' + detail.join(' ') + '}' +
    ' — every one must be elected by ScheduleGate.groundworkSlabs (§I owner)' +
    (bad ? '  NOT_ELECTED{' + Object.entries(off).map(([k, n]) => k + ':' + n).join(' ') + '}' : ''),
    have.length ? D[have[0]].layer : 'n/a');
}

// ── A2 PR #1551 OWNS DUPLEX'S DAY-0 DEFECT, AND STILL HITS THE SAME FLEET POPULATION ──────────────
{
  const dx = D.Duplex;
  let pop = 0, bad = 0; const unmatched = [], counts = [];
  if (dx) {
    // (a) every Duplex day-0 element that is impure BY PHASE, plus the one §W_D0 C3 calls hanging,
    //     must be matched by one of #1551's three patterns under its class gate.
    const G = SS.contactGraph(dx.els), DES = SS.designatedSupport(dx.els, G);
    const placed = {}; dx.day0.forEach(e => placed[e.guid] = 1);
    const idx = {}; dx.els.forEach((e, i) => idx[e.guid] = i);
    const targets = dx.day0.filter(e => e.phase !== 'Substructure');
    dx.day0.forEach(e => {
      const i = idx[e.guid];
      if (e.seq === 1 || G.grounded[i]) return;
      const d = DES[i];
      if (d >= 0 && !placed[dx.els[d].guid] && targets.indexOf(e) < 0) targets.push(e);
    });
    targets.forEach(e => {
      pop++;
      const hit = PR1551.some(p => p.classes.indexOf(e.cls) >= 0 && p.re.test(e.name || ''));
      if (!hit) { bad++; unmatched.push(e.cls + ' "' + (e.name || '').slice(0, 40) + '"'); }
    });
    // (b) the fleet population those three patterns reach must still be what §J.6 recorded.
    PR1551.forEach(p => {
      have.forEach(b => {
        const n = D[b].els.filter(e => p.classes.indexOf(e.cls) >= 0 && p.re.test(e.name || '')).length;
        const want = PR1551_FLEET[p.id][b];
        pop++;
        if (n !== want) { bad++; unmatched.push(p.id + '@' + b + ' ' + n + '!=' + want); }
        if (n) counts.push(p.id.slice(0, 14) + '@' + b.slice(0, 8) + '=' + n);
      });
    });
  }
  claim('A2_PR1551_OWNS_DUPLEX  ', 'Duplex+fleet', pop, bad,
    'Duplex day0 defects matched by #1551 patterns; fleet reach locked {' + counts.join(' ') + '}' +
    (bad ? '  MISMATCH[' + unmatched.slice(0, 6).join(' | ') + ']' : ''),
    dx ? dx.layer : 'n/a');
}

// ── A3 HHS's OPENING IS A MODEL FACT, NOT AN ORDERING THE SCHEDULER COULD FIX ─────────────────────
{
  const h = D.HHS_Office_Federated;
  let pop = 0, bad = 0; const why = [];
  if (h) {
    const seq1 = h.els.filter(e => e.seq === 1).length;
    pop++;
    if (seq1 !== 0) { bad++; why.push('HHS models ' + seq1 + ' seq-1 elements, so the ground exemption CAN fire — §J.6.1 #6 is wrong'); }
    else why.push('seq1=0 (no substructure modelled: the shipped `T.seq !== 1` exemption can never fire)');
    // every hanging element must be waiting on a LATER-phase support in a DIFFERENT task
    const G = SS.contactGraph(h.els), DES = SS.designatedSupport(h.els, G);
    const placed = {}; h.day0.forEach(e => placed[e.guid] = 1);
    const taskOf = {};
    (h.r.tasks || []).forEach(t => t.guids.forEach(g => {
      if (taskOf[g] == null || t.sDays < taskOf[g].s) taskOf[g] = { id: t.id, s: t.sDays };
    }));
    h.els.forEach((e, i) => {
      if (!placed[e.guid] || e.seq === 1 || G.grounded[i]) return;
      const d = DES[i]; if (d < 0 || placed[h.els[d].guid]) return;
      pop++;
      const S = h.els[d];
      const later = S.seq > e.seq;
      const crossTask = taskOf[e.guid] && taskOf[S.guid] && taskOf[e.guid].id !== taskOf[S.guid].id;
      if (!(later && crossTask)) { bad++; why.push(e.cls + '<-' + S.cls + ' later=' + later + ' crossTask=' + crossTask); }
      else why.push(e.cls + '(seq' + e.seq + ')<-' + S.cls + '(seq' + S.seq + ') across ' +
        taskOf[e.guid].id + '->' + taskOf[S.guid].id);
    });
  }
  claim('A3_HHS_OPENING_IS_MODEL', 'HHS_Office_Fed', pop, bad,
    why.slice(0, 4).join(' | '), h ? h.layer : 'n/a');
}

// ── A4 TERMINAL'S EARLY MEP SITS ON A PHANTOM STOREY ──────────────────────────────────────────────
{
  const t = D.Terminal;
  let pop = 0, bad = 0; const why = [];
  if (t) {
    const win = t.t0 + 3 * DAY_MS;
    const earlyMep = t.els.filter(e => /^MEP/.test(e.phase || '') && t.sched[e.guid] && t.sched[e.guid].s <= win);
    const storeys = {}; earlyMep.forEach(e => storeys[SG.collapsePhase(e.storey)] = 1);
    const names = Object.keys(storeys);
    pop++;
    if (names.length !== 1) { bad++; why.push('early MEP spans ' + names.length + ' bands ' + JSON.stringify(names)); }
    else {
      const band = names[0];
      const members = t.els.filter(e => SG.collapsePhase(e.storey) === band);
      const zs = t.els.map(e => e.bz).sort((a, b) => a - b);
      const p01 = zs[Math.floor(zs.length * 0.01)];
      const bandMin = Math.min.apply(null, members.map(e => e.bz));
      pop += 2;
      if (members.length !== earlyMep.length) { bad++; why.push('band "' + band + '" holds ' + members.length + ' elements but only ' + earlyMep.length + ' are the early MEP — it is not a phantom band of exactly those'); }
      if (!(bandMin < p01)) { bad++; why.push('band min base_z ' + bandMin.toFixed(2) + ' is NOT below the model p01 ' + p01.toFixed(2) + ' — it is not below the building'); }
      why.push('band "' + band + '" n=' + members.length + ' = the whole early-MEP set; minBaseZ=' +
        bandMin.toFixed(3) + 'm vs model p01=' + p01.toFixed(2) + 'm p50=' + zs[Math.floor(zs.length / 2)].toFixed(2) + 'm');
      const subTask = (t.r.tasks || []).filter(x => x.phase === 'Substructure' && x.storey === band)[0];
      if (subTask) why.push('building-scope Substructure instantiated HERE: ' + subTask.id + ' guids=' + subTask.guids.length + ' days ' + subTask.sDays + '-' + subTask.eDays);
    }
  }
  claim('A4_TERMINAL_PHANTOM_LVL ', 'Terminal', pop, bad, why.join(' | '), t ? t.layer : 'n/a');
}

// ── A5 C1 HAS NO IFC-DECLARED BASELINE ANYWHERE IN THE FLEET ──────────────────────────────────────
{
  let pop = 0, bad = 0; const why = [];
  have.forEach(b => {
    const st = D[b].r.storeys;
    if (!st || !st.length) { why.push(b + ':spatial_structure ABSENT'); return; }
    pop += st.length;
    const comp = st.filter(s => s.object_type === 'COMPILED').length;
    if (comp !== st.length) { bad += (st.length - comp); why.push(b + ':' + (st.length - comp) + ' of ' + st.length + ' NOT compiled — an IFC-declared baseline exists here'); }
    else why.push(b + ':' + comp + '/' + st.length + ' COMPILED');
    // corroboration from the run's OWN log — deriveStoreyMergeMap could not run
    if (D[b].r.log.indexOf('§S18_STOREY_MERGE_FAIL') < 0) { pop++; bad++; why.push(b + ':§S18_STOREY_MERGE_FAIL ABSENT from the log — the merge DID run, contradicting §J.6.3'); }
  });
  claim('A5_C1_BASELINE_COMPILED ', 'fleet', pop, bad,
    why.join(' | ') + ' — C1 compares scheduled bands against compile_rooms.py output, not an IFC declaration',
    have.length ? D[have[0]].layer : 'n/a');
}

// ── A6 DUPLEX'S EARLY MEP IS UNDER-SLAB WORK ON A SHORT PROGRAMME ─────────────────────────────────
{
  const dx = D.Duplex;
  let pop = 0, bad = 0; const why = [];
  if (dx) {
    const win = dx.t0 + 3 * DAY_MS;
    const early = dx.els.filter(e => /^MEP/.test(e.phase || '') && dx.sched[e.guid] && dx.sched[e.guid].s <= win);
    const st = {}; early.forEach(e => st[e.storey || '_'] = (st[e.storey || '_'] || 0) + 1);
    const bands = Object.keys(st);
    pop++;
    if (bands.length !== 1) { bad++; why.push('spans ' + bands.length + ' storeys ' + JSON.stringify(st)); }
    else why.push('all ' + early.length + ' on storey "' + bands[0] + '"');
    // the foundation storey is the LOWEST band by median base_z — extracted, not named by hand
    const byBand = {};
    dx.els.forEach(e => { const k = e.storey || '_'; (byBand[k] = byBand[k] || []).push(e.bz); });
    const mids = Object.keys(byBand).map(k => {
      const z = byBand[k].slice().sort((a, b) => a - b); return { k: k, mid: z[Math.floor(z.length / 2)] };
    }).sort((a, b) => a.mid - b.mid);
    pop++;
    if (bands.length === 1 && bands[0] !== mids[0].k) { bad++; why.push('storey "' + bands[0] + '" is NOT the lowest band (that is "' + mids[0].k + '")'); }
    else why.push('which IS the lowest band (median base_z ' + mids[0].mid.toFixed(3) + 'm)');
    let end = dx.t0; for (const g in dx.sched) if (dx.sched[g].e > end) end = dx.sched[g].e;
    const prog = (end - dx.t0) / DAY_MS;
    pop++;
    if (!(prog < 20)) { bad++; why.push('programme is ' + prog.toFixed(2) + 'd — no longer short, the scope argument in §J.6.1 #7 must be re-measured'); }
    else why.push('programme=' + prog.toFixed(2) + 'd so the 3d window is ' + (3 / prog * 100).toFixed(1) + '% of it');
    why.push('belowGrade(base_z<0)=' + early.filter(e => e.bz < 0).length + '/' + early.length);
  }
  claim('A6_DUPLEX_UNDERSLAB_MEP ', 'Duplex', pop, bad, why.join(' | '), dx ? dx.layer : 'n/a');
}

const fail = verdicts.filter(v => v === 'FAIL').length;
const inc = verdicts.filter(v => v === 'INCONCLUSIVE').length;
console.log('§W_D0A_VERDICT layer=' + (process.env.LAYER || 'played') +
  ' claims=' + verdicts.length + ' PASS=' + (verdicts.length - fail - inc) +
  ' FAIL=' + fail + ' INCONCLUSIVE=' + inc + '  ' +
  (fail ? 'RED' : inc ? 'NOT GREEN — a claim judged nothing; an empty population is not a pass' : 'GREEN'));
process.exit(fail ? 1 : 0);
