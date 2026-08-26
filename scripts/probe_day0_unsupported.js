#!/usr/bin/env node
// probe_day0_unsupported.js — Implementing bim-compiler prompts/4D_MODEL_INTEGRITY.md §G.3 item 1.
//
// ⚠ DO NOT REMOVE — SCOPE. One question, no other: on the TEMPLATE timeline the movie plays, at
// DAY 0 | HR <HR>, how many Substructure+Superstructure elements are on screen with nothing under
// them that is also on screen — after the footprint-local ground exemption — and WHICH CLASSES.
// §G's headline (Hospital 0 · HHS 1 · Duplex 2 · Terminal 5, "all remaining are IfcMember") was
// measured once and never committed as a script, so it could not be re-run. This is that script.
// Read the §D0 log after every run. MEP is out of scope by the user's own ruling (§G.1).
//
// RULES THIS FILE OBEYS (each one is a defect this lane already paid for):
//  - The judge is REQUIRED from viewer/support_sweep.js. The contact relation is NEVER re-derived
//    here (4D_MODEL_INTEGRITY §G.0 / 4D_BAR_MODEL §10.1 rule 1 — wrong four times in one session).
//  - Ground exemption is `G.grounded[i]`, the footprint-local test: nothing beneath me in my own
//    column ⇒ I rest on soil. `min(bz)` over the whole building is NOT the ground datum (§G.0 —
//    one deep outlier put every HHS ground-floor column 4.70m "in the air").
//  - ANY-OF, not all-of: an element needs ONE support up, not all of them (1961 → 95).
//  - No class whitelist decides what is structural. `seq` is the classifier's OUTPUT (§G.0 — a
//    class-based structural pool re-admits HHS's 438 curtain-wall glazing panels as load-bearing).
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os');
const HOME = os.homedir();
const initSqlJs = require(path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const SQLJS_DIST = path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js', 'dist');
const V = path.join(__dirname, '..', 'viewer');
const ScheduleGate = require(path.join(V, 'schedule_gate.js'));
global.ScheduleGate = ScheduleGate;                       // support_sweep resolves it bare at call time
const ScheduleAuthor = require(path.join(V, 'schedule_author.js'));
const SupportSweep = require(path.join(V, 'support_sweep.js'));

const BLD = process.env.BLD_DIR || path.join(HOME, 'bim-ootb', 'buildings');
const BUILDINGS = process.argv.slice(2).length ? process.argv.slice(2)
  : ['Duplex', 'HHS_Office_Federated', 'Hospital', 'Terminal'];
const START = '2026-01-01';
const DAY = process.env.DAY != null ? Number(process.env.DAY) : 0;
const HR  = process.env.HR  != null ? Number(process.env.HR)  : 3;
const DAY_MS = 86400000;
const T = JSON.parse(fs.readFileSync(path.join(V, 'rates', '4D_template.json'), 'utf8'));
// SCOPE = the user's, §G.1: "Do not report lesser issues. Their scope is DAY 0,
// Substructure/Superstructure, no MEP." Read off the template, never typed as a number here.
const SCOPE_SEQ = {};
T.phases.filter(p => p.id === 'substructure' || p.id === 'superstructure')
        .forEach(p => { SCOPE_SEQ[p.sequence] = p.name; });

function executedRules() {                                 // viewer/rates.js IS the executed table
  const sb = { console: { log() {}, warn() {}, error() {} } };
  vm.createContext(sb); vm.runInContext(fs.readFileSync(path.join(V, 'rates.js'), 'utf8'), sb);
  return sb;
}
const quiet = fn => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.log = l; console.warn = w; } };

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.join(SQLJS_DIST, f) });
  const R = executedRules();
  const SHIFT = T.calendar.hours_per_shift;
  const EPS = ScheduleGate.EPS, GAP = ScheduleGate.GAP;
  const rows = [];

  for (const bld of BUILDINGS) {
    const file = path.join(BLD, bld + '_extracted.db');
    if (!fs.existsSync(file)) { console.log('§D0_SKIP ' + bld); continue; }
    const db = new SQL.Database(new Uint8Array(fs.readFileSync(file)));
    const base = { start: START, laborRates: R.LABOR_RATES, rates: R.RATES,
      nameOverrides: R.SEQUENCE_NAME_OVERRIDES, defaultRule: R.SEQUENCE_DEFAULT,
      scheduleGate: ScheduleGate, shiftHours: SHIFT, template: T };
    const els = ScheduleAuthor._buildScheduleElements(db, R.SEQUENCE_RULES, base)
      .map(e => Object.assign({}, e, { bz: e.base_z, tz: e.top_z }));
    let res = null;
    try { res = quiet(() => ScheduleAuthor.materializeZones(db, R.SEQUENCE_RULES, base)); }
    catch (e) { console.log('§D0_THREW ' + bld + ' ' + e.message); db.close(); continue; }
    db.close();
    const sched = res && res.displaySchedule;
    if (!sched) { console.log('§D0_NO_SCHEDULE ' + bld); continue; }

    // THE JUDGE, verbatim. Geometry only — times are read after, never inside.
    const G = SupportSweep.contactGraph(els);
    if (!G.ok) { console.log('§D0_JUDGE_UNAVAILABLE ' + bld); continue; }

    // ── THE ANSWER IS AN INTERVAL, NOT A SAMPLE ────────────────────────────────────────────────
    // First draft of this probe sampled ONE cursor (DAY 0 HR 3) and read 0 on all four buildings,
    // because at that instant every in-scope element on screen was exempt. A green number from a
    // cursor that has nothing to judge is the failure this file exists to kill. So compute the
    // thing exactly instead: element i is unsupported over [start_i, firstSupportStart_i), which
    // is empty when a support is already up and UNBOUNDED when it has no support at all. Max
    // concurrency over those intervals is the worst-case count, and it needs no cursor.
    //
    // EXEMPTION — the SHIPPED rule, not a re-derived one. schedule_gate.js:1210 `T.seq !== 1`:
    // "1c exemption: seq===1 (phase==='Substructure') legitimately rests on unmodeled soil, never
    // flagged." An earlier draft here used only `G.grounded[i]`, the footprint-local test, and so
    // flagged Duplex's 2 'Floor:150mm Exterior Slab on Grade' (bz=-0.137) as unsupported: their
    // only neighbour is an IfcFooting whose TOP is 1.113m below them (fill in between), so nothing
    // bears them AND grounded is 0. rates.js's own §SLAB_ON_GRADE_RECLASS already names exactly
    // that case. Both exemptions are reported SEPARATELY below so the log says how much of the
    // population the exemption absorbs — a metric must be able to tell you it has gone vacuous.
    const startOf = g => (sched[g] || {}).start;
    const t0 = Math.min.apply(null, els.map(e => startOf(e.guid)).filter(Number.isFinite));
    let inScopeTotal = 0, exemptSeq1 = 0, exemptGrounded = 0, judged = 0;
    const spans = [];                       // [from, to) in ms, to = Infinity when never held
    const byCls = {}, detail = [];
    for (let i = 0; i < els.length; i++) {
      const Tt = els[i];
      if (!SCOPE_SEQ[Tt.seq]) continue;
      const st = startOf(Tt.guid); if (!Number.isFinite(st)) continue;
      inScopeTotal++;
      if (Tt.seq === 1) { exemptSeq1++; continue; }          // shipped 1c, schedule_gate.js:1210
      if (G.grounded[i]) { exemptGrounded++; continue; }     // footprint-local: rests on soil
      judged++;
      const list = G.contacts[i] || [];
      let first = Infinity, bearingAny = 0, embeddedAny = 0, carrierAny = 0;
      for (const j of list) {
        const S = els[j];
        const bearing  = (S.bz < Tt.bz - EPS && S.tz >= Tt.bz - GAP);
        const embedded = (S.bz <= Tt.bz + EPS && S.tz >= Tt.tz - EPS);
        if (bearing) bearingAny++; else if (embedded) embeddedAny++; else { carrierAny++; continue; }
        const ss = startOf(S.guid);
        if (Number.isFinite(ss) && ss < first) first = ss;
      }
      if (first <= st) continue;                              // a support is already up: held
      spans.push([st, first]);
      byCls[Tt.cls] = (byCls[Tt.cls] || 0) + 1;
      if (detail.length < 40) detail.push({ cls: Tt.cls, guid: Tt.guid, name: Tt.name || '',
        phase: SCOPE_SEQ[Tt.seq], storey: Tt.storey, bz: Tt.bz, tz: Tt.tz,
        startH: ((st - t0) / 3600000).toFixed(2),
        heldH: first === Infinity ? 'never' : ((first - t0) / 3600000).toFixed(2),
        contacts: list.length, bearingAny, embeddedAny, carrierAny });
    }
    // ── §D0_TOPBOUND — BLAST RADIUS OF THE ONE INCONSISTENCY, measured, not shipped ────────────
    // The shipped judge holds TWO copies of "S bears T" and they disagree on the upper bound:
    //   _contactGraph (support_sweep.js:411)   S.bz < T.bz - EPS && S.tz >= T.bz - GAP     <- no top bound
    //   auditFloating wall pool (schedule_gate.js:1195, §S64)  ... && S.top_z <= T.base_z + GAP
    // §S64's own comment says the wall pool needed the bound because without it "a wall carries a
    // promoted slab AT ITS TOP, never one embedded metres below its crown" — 73 fleet-wide false
    // verdicts. _contactGraph's clause never got it, and that is measurably admitting supports
    // whose top is metres above the base they supposedly carry (Hospital: 11.4m). Bounding it does
    // NOT reduce the unsupported count — it REMOVES FALSE SUPPORTS, so the count can only rise.
    // That is the point: the current number is flattered by contacts that are not carrying anything.
    // Reported here as a measurement. Changing _contactGraph is a construct change across the
    // scheduler, the lock gate and the audit, and is not made from inside a probe.
    let bearingTotal = 0, bearingOverTop = 0, boundedUnsupported = 0, boundedJudged = 0;
    for (let i = 0; i < els.length; i++) {
      const Tt = els[i];
      if (!SCOPE_SEQ[Tt.seq] || Tt.seq === 1 || G.grounded[i]) continue;
      const st = startOf(Tt.guid); if (!Number.isFinite(st)) continue;
      boundedJudged++;
      let firstB = Infinity;
      for (const j of (G.contacts[i] || [])) {
        const S = els[j];
        const bearing  = (S.bz < Tt.bz - EPS && S.tz >= Tt.bz - GAP);
        const embedded = (S.bz <= Tt.bz + EPS && S.tz >= Tt.tz - EPS);
        if (bearing) {
          bearingTotal++;
          if (!(S.tz <= Tt.bz + GAP)) { bearingOverTop++; continue; }   // §S64 bound applied
        } else if (!embedded) continue;
        const ss = startOf(S.guid);
        if (Number.isFinite(ss) && ss < firstB) firstB = ss;
      }
      if (firstB > st) boundedUnsupported++;
    }
    console.log('   §D0_TOPBOUND bearingContacts=' + bearingTotal + ' droppedByS64TopBound=' +
      bearingOverTop + ' (' + (bearingTotal ? (100 * bearingOverTop / bearingTotal).toFixed(1) : '0') +
      '%)  unsupportedWouldBecome=' + boundedUnsupported + '/' + boundedJudged +
      ' — a support whose TOP is above the base it carries is not carrying it');

    // max concurrency by sweep-line over the interval endpoints — exact, no sampling
    const evts = [];
    spans.forEach(([a, b]) => { evts.push([a, 1]); if (b !== Infinity) evts.push([b, -1]); });
    evts.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    let cur = 0, peak = 0, peakAt = t0;
    for (const [tt, d] of evts) { cur += d; if (cur > peak) { peak = cur; peakAt = tt; } }
    const everUnsupported = spans.length;
    const neverHeld = spans.filter(s => s[1] === Infinity).length;

    console.log('§D0 ' + bld + ' n=' + els.length + ' inScope(sub+super)=' + inScopeTotal +
      ' exemptSeq1=' + exemptSeq1 + ' exemptGrounded=' + exemptGrounded + ' judged=' + judged +
      '  UNSUPPORTED ever=' + everUnsupported + ' neverHeld=' + neverHeld +
      ' peakConcurrent=' + peak + ' peakAtH=' + ((peakAt - t0) / 3600000).toFixed(2));
    if (judged === 0) console.log('   §D0_VACUOUS ' + bld +
      ' — every in-scope element is exempt; this building\'s 0 means the judge had nothing to judge, not that the model is right');
    const hist = Object.entries(byCls).sort((a, b) => b[1] - a[1]);
    if (hist.length) console.log('   §D0_CLASS ' + hist.map(([c, n]) => c + '=' + n).join(' '));
    detail.forEach(d => console.log('      §D0_ELEM ' + d.cls + ' ' + d.guid + ' phase=' + d.phase +
      ' storey=' + d.storey + ' bz=' + d.bz.toFixed(3) + ' tz=' + d.tz.toFixed(3) +
      ' startH=' + d.startH + ' heldH=' + d.heldH + ' contacts=' + d.contacts +
      ' (bearing=' + d.bearingAny + ' embedded=' + d.embeddedAny + ' carrier=' + d.carrierAny + ')' +
      ' name=' + JSON.stringify(d.name)));
    rows.push({ bld, unsupported: everUnsupported, peak, judged, byCls });
  }

  const total = rows.reduce((a, r) => a + r.unsupported, 0);
  const vac = rows.filter(r => r.judged === 0).map(r => r.bld);
  console.log('§D0_VERDICT ' + rows.map(r => r.bld + '=' + r.unsupported + '/' + r.judged).join(' · ') +
    ' total=' + total + (vac.length ? '  VACUOUS(nothing judged)=' + vac.join(',') : '') + ' ' +
    (vac.length ? 'INCONCLUSIVE — a 0 over an empty population is not a pass'
     : total === 0 ? 'PASS' : 'WORK REMAINS'));
  process.exit(0);
})().catch(e => { console.error('§D0_ERROR ' + (e && e.stack || e)); process.exit(2); });
