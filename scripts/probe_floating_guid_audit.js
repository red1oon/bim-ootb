#!/usr/bin/env node
// probe_floating_guid_audit.js — Implementing bim-compiler prompts/4D_BAR_MODEL.md §12.3 / §13.4 step 1.
//
// ⚠ DO NOT REMOVE — SCOPE: reproduce the PHOTOGRAPH numerically. Take HHS_Office_Federated at
// DAY 0 | HR 3 on the timeline the browser actually PLAYS (kernel_ops start_ts), find the MEP
// elements that are visibly floating (nothing under them is on screen yet), and print, for one of
// them, exactly what the judge (_contactGraph + _designatedSupport + _midairAudit) thinks supports
// it and WHEN that support appears. Read the log after every run.
//
// The judge is REQUIRED from viewer/support_sweep.js — never re-derived here (§10.1 rule 1, the
// retraction this lane already paid for). Every stage below mirrors a named live function:
//   materializeZones (schedule_author.js)  -> task windows, via _tmDisplayRemap's Tukey clip
//   _displayTimeline (time_machine.js)     -> CpmSchedule.run, the times the movie plays
//   _tmRescaleToTaskWindow (time_machine.js) -> kernel_ops start_ts (the DAY/HR clock's own source)
'use strict';
const fs = require('fs');
const path = require('path');
const initSqlJs = require(path.join(__dirname, '..', 'modeller', 'lib', 'sql-wasm.js'));
const ScheduleGate = require(path.join(__dirname, '..', 'viewer', 'schedule_gate.js'));
const ScheduleAuthor = require(path.join(__dirname, '..', 'viewer', 'schedule_author.js'));
const CpmSchedule = require(path.join(__dirname, '..', 'viewer', 'cpm_schedule.js'));
const SupportSweep = require(path.join(__dirname, '..', 'viewer', 'support_sweep.js'));
global.ScheduleGate = ScheduleGate;   // support_sweep resolves it as a bare identifier at call time

const _contactGraph = SupportSweep.contactGraph;
const _designatedSupport = SupportSweep.designatedSupport;
const _midairAudit = SupportSweep.midairAudit;

const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');
const NAME = process.env.ONLY || 'HHS_Office_Federated_extracted';
const SHIFT_HOURS = process.env.SHIFT_HOURS ? Number(process.env.SHIFT_HOURS) : 24;
const HR = process.env.HR != null ? Number(process.env.HR) : 3;
const DAY = process.env.DAY != null ? Number(process.env.DAY) : 0;
const START = process.env.START || '2026-01-01';
const DAY_MS = 86400000;

function _slug(n) { return String(n).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }
function _addDays(iso, d) { const t = Date.parse(iso + 'T00:00:00Z') + d * DAY_MS; return new Date(t).toISOString().slice(0, 10); }
// §TUKEY_BOUND — gantt_model.js's formula, same percentile convention (sorted[floor(n*p)]).
function tukeyBound(arr, lowSide) {
  const s = arr.slice().sort((a, b) => a - b);
  const n = s.length, q1 = s[Math.floor(n * 0.25)], q3 = s[Math.floor(n * 0.75)], iqr = q3 - q1;
  return lowSide ? Math.max(s[0], q1 - 1.5 * iqr) : Math.min(s[n - 1], q3 + 1.5 * iqr);
}
// MEP = the flow/terminal/fitting family the §DEQ_V1 note names; class-prefix only, no invention.
const MEP_RE = /^Ifc(Flow|Distribution|Pipe|Duct|Cable|Energy|Electric|Air|Valve|Pump|Fan|Sanitary|Fire|Junction|Protective|Controller|Actuator|Alarm|Light|Outlet|Switch)/;

async function main() {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, '..', 'modeller', 'lib', 'sql-wasm.wasm')) });
  const ratesSrc = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'rates.js'), 'utf8');
  const RATES = (new Function(ratesSrc +
    '\nreturn {SEQUENCE_RULES:SEQUENCE_RULES, SEQUENCE_DEFAULT:SEQUENCE_DEFAULT, ' +
    'SEQUENCE_NAME_OVERRIDES:SEQUENCE_NAME_OVERRIDES, LABOR_RATES:LABOR_RATES, RATES:RATES};'))();

  const db = new SQL.Database(fs.readFileSync(path.join(BLD_DIR, NAME + '.db')));
  const elements = ScheduleAuthor._buildScheduleElements(db, RATES.SEQUENCE_RULES, {
    laborRates: RATES.LABOR_RATES, rates: RATES.RATES,
    nameOverrides: RATES.SEQUENCE_NAME_OVERRIDES, defaultRule: RATES.SEQUENCE_DEFAULT
  });
  db.close();
  console.log('§FGA_BUILDING ' + NAME + ' elements=' + elements.length + ' shiftHours=' + SHIFT_HOURS);

  const maxCrews = {}, dtMaxCrews = {};
  for (const r in RATES.LABOR_RATES) {
    if (RATES.LABOR_RATES[r].max_crews) maxCrews[r] = RATES.LABOR_RATES[r].max_crews;
    if (RATES.LABOR_RATES[r].max_crews_fixed != null) dtMaxCrews[r] = RATES.LABOR_RATES[r].max_crews_fixed;
    else if (RATES.LABOR_RATES[r].max_crews) dtMaxCrews[r] = RATES.LABOR_RATES[r].max_crews;
  }

  // ── STAGE 1: raw solve (ScheduleGate.computeSchedule) ────────────────────────────────────────
  const raw = ScheduleGate.computeSchedule(elements, 0, 1, maxCrews, SHIFT_HOURS);

  // ── STAGE 2: _displayTimeline — CpmSchedule.run. THIS is what plays (§12.2). ──────────────────
  const items = [];
  elements.forEach(el => {
    const st = raw[el.guid]; if (!st) return;
    items.push({ guid: el.guid, s: st.start, e: st.end, bz: el.base_z, tz: el.top_z,
      x0: el.x0, x1: el.x1, y0: el.y0, y1: el.y1, cls: el.cls, seq: el.seq,
      phase: el.phase, storey: el.storey, resource: el.resource, name: el.name });
  });
  const r = CpmSchedule.run(items, { maxCrews: dtMaxCrews });
  if (!r || !r.ok) throw new Error('CpmSchedule.run failed');
  for (let i = 0; i < items.length; i++) { items[i].s = r.solution.times[i].s; items[i].e = r.solution.times[i].e; }
  const aud = _midairAudit(items);
  console.log('§FGA_CPM_DISPLAY midair=' + aud.midair + ' orphans=' + aud.orphans +
    ' stragglers=' + r.graph.counts.stragglers + ' (mirrors the live §CPM_DISPLAY line)');

  // ── STAGE 3: §ZONE_WINDOW_DAGWINS_CLIP — window-authoring map only (movie keeps true times) ───
  const gkOf = it => (it.phase || '_UNPHASED') + '||' + ScheduleGate.collapsePhase(it.storey);
  const groups = {};
  items.forEach(it => { const g = groups[gkOf(it)] || (groups[gkOf(it)] = { s: [], e: [] }); g.s.push(it.s); g.e.push(it.e); });
  const bar = {};
  Object.keys(groups).forEach(k => { const lo = tukeyBound(groups[k].s, true), hi = tukeyBound(groups[k].e, false); bar[k] = { lo, hi: Math.max(hi, lo) }; });
  const winAuthored = {};
  items.forEach(it => {
    const b = bar[gkOf(it)]; let st = it.s, en = it.e;
    if (b) { let ns = Math.min(Math.max(st, b.lo), b.hi), ne = Math.min(Math.max(en, b.lo), b.hi);
      if (ne <= ns) { ns = Math.max(b.lo, b.hi - 60000); ne = b.hi; } st = ns; en = ne; }
    winAuthored[it.guid] = { start: st, end: en };
  });

  // ── STAGE 4: materializeZones — zones → task windows (§ZONE_ENVELOPE_DAYS + COVERS_WORK) ──────
  const rolled = ScheduleGate.deriveZones(elements, winAuthored, null);   // no `elevation` column live (§12.4)
  const minStart = Math.min.apply(null, rolled.zones.map(z => z.start));
  const elByGuid = {}; elements.forEach(e => elByGuid[e.guid] = e);
  const shiftMs = SHIFT_HOURS * 3600 * 1000;
  const win = {}, guidTask = {};
  rolled.zones.forEach(z => {
    const tid = 'TASK_' + _slug(z.phase) + '_' + _slug(z.storey);
    let sDays = Math.floor((z.start - minStart) / DAY_MS);
    let eDays = Math.ceil((z.end - minStart) / DAY_MS);
    if (eDays <= sDays) eDays = sDays + 1;
    let wSecs = 0; const wTrades = {};
    z.guids.forEach(g => { const e = elByGuid[g]; if (!e) return; wSecs += e.installSecs || 0;
      if (e.resource && e.resource !== '_DEFAULT') wTrades[e.resource] = 1; });
    let wCrews = 0; for (const t in wTrades) wCrews += (RATES.LABOR_RATES[t] && RATES.LABOR_RATES[t].max_crews) || 1;
    if (!wCrews) wCrews = 1;
    const needDays = Math.ceil((wSecs * 1000) / (shiftMs * wCrews));
    if (eDays - sDays < needDays) eDays = sDays + needDays;
    const s = Date.parse(_addDays(START, sDays)), e = Date.parse(_addDays(START, eDays));
    win[tid] = { s, e, name: z.phase + ' — ' + z.storey };
    z.guids.forEach(g => { if (!guidTask[g] || win[tid].s < win[guidTask[g]].s) guidTask[g] = tid; });
  });
  const capBase = Math.min.apply(null, Object.keys(win).map(k => win[k].s));
  console.log('§FGA_TASK_WINDOWS zones=' + rolled.zones.length + ' base=' + new Date(capBase).toISOString());

  // ── STAGE 5: _tmRescaleToTaskWindow → kernel_ops start_ts (the DAY/HR clock's source) ─────────
  const winGroups = {};
  items.forEach(it => { const t = guidTask[it.guid]; if (t == null || !win[t]) return;
    const g = winGroups[t] || (winGroups[t] = { min: Infinity, max: -Infinity });
    if (it.s < g.min) g.min = it.s; if (it.e > g.max) g.max = it.e; });
  const op = {};   // guid -> {s,e} exactly as written into kernel_ops
  let uncovered = 0;
  items.forEach(it => {
    const tid = guidTask[it.guid], w = tid != null ? win[tid] : null, g = tid != null ? winGroups[tid] : null;
    if (!w || !g || !isFinite(g.min) || !isFinite(g.max)) { op[it.guid] = { s: it.s, e: it.e }; uncovered++; return; }
    const scale = Math.max(1, w.e - w.s) / Math.max(1, g.max - g.min);
    let st = w.s + (it.s - g.min) * scale, en = w.s + (it.e - g.min) * scale;
    st = Math.min(Math.max(st, w.s), w.e); en = Math.min(Math.max(en, w.s), w.e);
    if (en <= st) { st = Math.max(w.s, w.e - 60000); en = w.e; }
    op[it.guid] = { s: st, e: en };
  });
  const projectStart = Math.min.apply(null, items.map(it => op[it.guid].s));
  const cursor = projectStart + DAY * DAY_MS + HR * 3600000;
  const placedIdx = [], placedSet = {};
  items.forEach((it, i) => { if (op[it.guid].s <= cursor) { placedIdx.push(i); placedSet[it.guid] = 1; } });
  console.log('§FGA_CURSOR DAY=' + DAY + ' HR=' + HR + ' cursor=' + new Date(cursor).toISOString() +
    ' placed=' + placedIdx.length + '/' + items.length + ' windowUncovered=' + uncovered +
    ' (live HUD read "73 placed" at DAY 0 | HR 3)');

  // ── STAGE 6: THE JUDGE, verbatim from support_sweep.js ────────────────────────────────────────
  const G = _contactGraph(items);
  const des = _designatedSupport(items, G);
  const idxOf = {}; items.forEach((it, i) => idxOf[it.guid] = i);
  const EPS = ScheduleGate.EPS, GAP = ScheduleGate.GAP;
  const groundZ = Math.min.apply(null, items.map(it => it.bz));

  // THE EYE: at `cursor`, an element is on screen. Is anything holding it up ALSO on screen?
  // Uses _contactGraph's OWN contact list and its OWN three clauses — no second physics.
  function eyeReport(i) {
    const T = items[i], list = G.contacts[i] || [];
    let bearingPlaced = 0, embeddedPlaced = 0, carrierPlaced = 0, bearingAny = 0, embeddedAny = 0, carrierAny = 0;
    list.forEach(j => {
      const S = items[j], p = placedSet[S.guid] ? 1 : 0;
      if (S.bz < T.bz - EPS && S.tz >= T.bz - GAP) { bearingAny++; bearingPlaced += p; }
      else if (S.bz <= T.bz + EPS && S.tz >= T.tz - EPS) { embeddedAny++; embeddedPlaced += p; }
      else { carrierAny++; carrierPlaced += p; }
    });
    const onGround = T.bz <= groundZ + GAP;
    return { bearingPlaced, embeddedPlaced, carrierPlaced, bearingAny, embeddedAny, carrierAny, onGround,
      floatingToEye: !onGround && bearingPlaced === 0 && embeddedPlaced === 0 };
  }

  let eyeFloat = 0, eyeFloatMep = 0; const byCls = {}, mepFloat = [];
  placedIdx.forEach(i => {
    const rep = eyeReport(i);
    if (!rep.floatingToEye) return;
    eyeFloat++; byCls[items[i].cls] = (byCls[items[i].cls] || 0) + 1;
    if (MEP_RE.test(items[i].cls)) { eyeFloatMep++; mepFloat.push({ i, rep }); }
  });
  console.log('§FGA_EYE_FLOATING placed=' + placedIdx.length + ' floatingToEye=' + eyeFloat +
    ' ofWhichMEP=' + eyeFloatMep + ' byClass=' + JSON.stringify(byCls) +
    ' (rule: on screen, above ground, and NOT ONE bearing-below/embedded contact of its own is on screen yet)');

  // JUDGE VERDICT on exactly the same population.
  let judgeFlagged = 0;
  placedIdx.forEach(i => { const s = des[i]; if (s >= 0 && items[s].s > items[i].s + 1) judgeFlagged++; });
  console.log('§FGA_JUDGE_ON_SAME_POP placed=' + placedIdx.length + ' judgeCallsFloating=' + judgeFlagged +
    ' eyeCallsFloating=' + eyeFloat + ' DELTA=' + (eyeFloat - judgeFlagged));

  // Every eye-floater, named. HHS is a FEDERATED model: its MEP arrives as IfcBuildingElementProxy,
  // so the class prefix alone cannot identify a pipe — the extracted NAME and the rules-assigned
  // PHASE are the signals, both read from the DB, neither invented.
  const allFloat = [];
  placedIdx.forEach(idx => { const rp = eyeReport(idx); if (rp.floatingToEye) allFloat.push({ i: idx, rep: rp }); });
  allFloat.sort((a, b) => items[b.i].bz - items[a.i].bz).forEach(f => {
    const E = items[f.i];
    console.log('  §FGA_FLOATER guid=' + E.guid + ' cls=' + E.cls + ' phase=' + E.phase +
      ' storey=' + JSON.stringify(E.storey) + ' baseZ=' + E.bz.toFixed(2) + ' topZ=' + E.tz.toFixed(2) +
      ' des=' + des[f.i] + ' grounded=' + G.grounded[f.i] + ' contacts=' + ((G.contacts[f.i] || []).length) +
      ' name=' + JSON.stringify(E.name || ''));
  });

  // Class census of what is ON SCREEN at the cursor — so "no MEP among the floaters" can be read as
  // "no MEP on screen yet" rather than "MEP is on screen and supported".
  const placedCls = {};
  placedIdx.forEach(idx => { placedCls[items[idx].cls] = (placedCls[items[idx].cls] || 0) + 1; });
  console.log('§FGA_PLACED_CENSUS ' + JSON.stringify(placedCls));

  // Hour-by-hour sweep of DAY 0..DAY 2 — where the eye and the judge first diverge, and whether an
  // MEP-classed element is ever on screen and unsupported.
  for (let h = 0; h <= 72; h++) {
    const c = projectStart + h * 3600000;
    let np = 0, nf = 0, nm = 0, nj = 0;
    const pset = {};
    items.forEach((it, k) => { if (op[it.guid].s <= c) { pset[it.guid] = 1; np++; } });
    items.forEach((it, k) => {
      if (!pset[it.guid]) return;
      const sIdxH = des[k]; if (sIdxH >= 0 && items[sIdxH].s > items[k].s + 1) nj++;
      const T2 = it, lst = G.contacts[k] || [];
      let bp = 0, ep = 0;
      lst.forEach(j => { const S = items[j]; if (!pset[S.guid]) return;
        if (S.bz < T2.bz - EPS && S.tz >= T2.bz - GAP) bp++;
        else if (S.bz <= T2.bz + EPS && S.tz >= T2.tz - EPS) ep++; });
      if (T2.bz > groundZ + GAP && bp === 0 && ep === 0) { nf++; if (MEP_RE.test(T2.cls) || /MEP/i.test(T2.phase || '')) nm++; }
    });
    if (h % 6 === 0 || nm > 0) console.log('§FGA_HOUR h=' + h + ' (DAY ' + Math.floor(h / 24) + ' HR ' + (h % 24) +
      ') placed=' + np + ' eyeFloating=' + nf + ' ofWhichMEP=' + nm + ' judgeFloating=' + nj);
  }

  // ── THE TWO BLIND SPOTS, counted over the WHOLE model ────────────────────────────────────────
  // (a) des = -1: the judge's own exemptions. _midairAudit's first statement is `if (sIdx < 0)
  //     continue`, so every element here is uncountable at every instant, on every timeline.
  let blindOrphan = 0, blindGrounded = 0, blindAbove = 0;
  const blindClsO = {}, blindClsG = {};
  let hiOrphan = 0, hiGrounded = 0;
  for (let k = 0; k < items.length; k++) {
    if (des[k] >= 0) continue;
    const above = items[k].bz - groundZ;
    if (!G.contacts[k]) { blindOrphan++; blindClsO[items[k].cls] = (blindClsO[items[k].cls] || 0) + 1; if (above > GAP) { blindAbove++; hiOrphan = Math.max(hiOrphan, above); } }
    else { blindGrounded++; blindClsG[items[k].cls] = (blindClsG[items[k].cls] || 0) + 1; if (above > GAP) { blindAbove++; hiGrounded = Math.max(hiGrounded, above); } }
  }
  console.log('§FGA_JUDGE_BLIND total=' + (blindOrphan + blindGrounded) + '/' + items.length +
    ' orphan(noContactAnywhere)=' + blindOrphan + ' groundedExempt(carrier-above-only)=' + blindGrounded +
    ' ofThoseAboveGround=' + blindAbove + ' maxHeightOrphan=' + hiOrphan.toFixed(2) + 'm maxHeightGrounded=' + hiGrounded.toFixed(2) + 'm' +
    ' — every one of these is skipped by `if (sIdx < 0) continue`, so midair can never count them');
  console.log('§FGA_JUDGE_BLIND_ORPHAN_CLS ' + JSON.stringify(blindClsO));
  console.log('§FGA_JUDGE_BLIND_GROUNDED_CLS ' + JSON.stringify(blindClsG));

  // (b) the judge reads the CPM times; the movie plays the kernel_ops times (per-task affine
  //     rescale, §TM_ELEMENT_WINDOW_BIND). Same judge, same edges — re-run on what actually plays.
  let judgeCpm = 0, judgePlayed = 0, flipToBad = 0, flipToGood = 0;
  for (let k = 0; k < items.length; k++) {
    const sI = des[k]; if (sI < 0) continue;
    const badCpm = items[sI].s > items[k].s + 1;
    const badPlayed = op[items[sI].guid].s > op[items[k].guid].s + 1;
    if (badCpm) judgeCpm++;
    if (badPlayed) judgePlayed++;
    if (!badCpm && badPlayed) flipToBad++;
    if (badCpm && !badPlayed) flipToGood++;
  }
  console.log('§FGA_TIMELINE_MISMATCH judgedOnCPMtimes=' + judgeCpm + ' judgedOnPLAYEDtimes(kernel_ops)=' + judgePlayed +
    ' becameFloatingOnlyWhenPlayed=' + flipToBad + ' fixedByTheRescale=' + flipToGood +
    ' — the shipped midair number is the first column; the movie is the second');

  // The mechanism behind the 783: per-task affine rescale. Each task maps its OWN raw CPM span onto
  // its OWN authored window, so two tasks get two different scale factors and a support edge that
  // crosses a task boundary is re-ordered. Print the worst ten with both scales.
  {
    const scaleOf = {};
    Object.keys(winGroups).forEach(t => { const g = winGroups[t], w = win[t];
      scaleOf[t] = Math.max(1, w.e - w.s) / Math.max(1, g.max - g.min); });
    const rows = [];
    for (let k = 0; k < items.length; k++) {
      const sI = des[k]; if (sI < 0) continue;
      const late = op[items[sI].guid].s - op[items[k].guid].s;
      if (late > 1) rows.push({ k, sI, late });
    }
    rows.sort((a, b) => b.late - a.late).slice(0, 10).forEach(rw => {
      const T2 = items[rw.k], S2 = items[rw.sI], tT = guidTask[T2.guid], tS = guidTask[S2.guid];
      console.log('  §FGA_MISMATCH guid=' + T2.guid + ' cls=' + T2.cls + ' task=' + tT +
        ' scale=' + (scaleOf[tT] || 1).toFixed(3) + ' | support=' + S2.guid + ' cls=' + S2.cls +
        ' task=' + tS + ' scale=' + (scaleOf[tS] || 1).toFixed(3) +
        ' | cpmGapDays=' + ((T2.s - S2.s) / DAY_MS).toFixed(2) +
        ' playedGapDays=' + ((op[T2.guid].s - op[S2.guid].s) / DAY_MS).toFixed(2) +
        ' (negative played gap = it appears BEFORE its own support)');
    });
  }

  // The MEP elements the judge is structurally blind to — the ask's own subject class, dumped with
  // the same numbers even though none of them is on screen in the first 72h.
  {
    const mepBlind = [];
    for (let k = 0; k < items.length; k++) {
      if (des[k] >= 0) continue;
      if (!MEP_RE.test(items[k].cls)) continue;
      mepBlind.push(k);
    }
    console.log('§FGA_MEP_BLIND n=' + mepBlind.length);
    mepBlind.sort((a, b) => items[b].bz - items[a].bz).slice(0, 14).forEach(k => {
      const E = items[k];
      console.log('  §FGA_MEP_BLIND guid=' + E.guid + ' cls=' + E.cls + ' phase=' + E.phase +
        ' baseZ=' + E.bz.toFixed(2) + ' aboveGround=' + (E.bz - groundZ).toFixed(2) + 'm' +
        ' contacts=' + ((G.contacts[k] || []).length) + ' grounded=' + G.grounded[k] + ' des=-1' +
        ' opStart=DAY ' + Math.floor((op[E.guid].s - projectStart) / DAY_MS) +
        ' name=' + JSON.stringify(E.name || ''));
    });
  }

  // ── STAGE 7: ONE GUID, fully dumped ──────────────────────────────────────────────────────────
  // Prefer a floater the RULES already call MEP (phase), else an MEP-named one, else the highest.
  const mepish = allFloat.filter(f => /MEP/i.test(items[f.i].phase || '') ||
    /pipe|duct|conduit|sprinkler|valve|fitting|hvac|plumb|cable|tray|diffuser|radiator/i.test(items[f.i].name || ''));
  const pick = process.env.GUID ? { i: idxOf[process.env.GUID], rep: eyeReport(idxOf[process.env.GUID]) }
    : (mepFloat.sort((a, b) => items[b.i].bz - items[a.i].bz)[0] || mepish[0] || allFloat[0] || null);
  if (!pick || pick.i == null) { console.log('§FGA_NO_MEP_FLOATER nothing matched — nothing to dump'); process.exit(0); }
  const i = pick.i, T = items[i];
  console.log('');
  console.log('§FGA_SUBJECT guid=' + T.guid + ' cls=' + T.cls + ' name=' + JSON.stringify(T.name || '') +
    ' phase=' + T.phase + ' storey=' + JSON.stringify(T.storey) + ' seq=' + T.seq + ' resource=' + T.resource);
  console.log('§FGA_SUBJECT_BBOX x=[' + T.x0.toFixed(2) + ',' + T.x1.toFixed(2) + '] y=[' + T.y0.toFixed(2) + ',' +
    T.y1.toFixed(2) + '] baseZ=' + T.bz.toFixed(3) + ' topZ=' + T.tz.toFixed(3) +
    ' heightAboveModelGround=' + (T.bz - groundZ).toFixed(3) + 'm (groundZ=' + groundZ.toFixed(3) + ')');
  console.log('§FGA_SUBJECT_TIME opStart=' + new Date(op[T.guid].s).toISOString() +
    ' = DAY ' + Math.floor((op[T.guid].s - projectStart) / DAY_MS) +
    ' HR ' + Math.floor(((op[T.guid].s - projectStart) % DAY_MS) / 3600000) +
    ' task=' + guidTask[T.guid] + ' (' + (win[guidTask[T.guid]] ? win[guidTask[T.guid]].name : 'none') + ')');
  console.log('§FGA_SUBJECT_EYE ' + JSON.stringify(pick.rep));
  console.log('§FGA_JUDGE_GROUNDED grounded[' + i + ']=' + G.grounded[i] +
    ' (1 ⇒ _contactGraph found NOTHING in this footprint starting more than GAP=' + GAP + 'm below it, ' +
    'so it is treated as its own ground layer — the carrier-above clause is then discarded by ' +
    '_designatedSupport, and _midairAudit can never flag it)');
  const list = G.contacts[i] || [];
  console.log('§FGA_JUDGE_CONTACTS n=' + list.length);
  list.map(j => {
    const S = items[j];
    let kind, score;
    if (S.bz < T.bz - EPS && S.tz >= T.bz - GAP) { kind = 'bearing-below'; score = -S.tz; }
    else if (S.bz <= T.bz + EPS && S.tz >= T.tz - EPS) { kind = 'embedded'; score = Math.abs(S.bz - T.bz); }
    else { kind = 'carrier-above'; score = S.bz; }
    return { j, guid: S.guid, cls: S.cls, kind, score, inPool: !!ScheduleGate.supportPool(S),
      bz: S.bz, tz: S.tz, dz: S.bz - T.bz, opS: op[S.guid].s, placed: !!placedSet[S.guid] };
  }).sort((a, b) => a.opS - b.opS).slice(0, 25).forEach(c => {
    console.log('  §FGA_CONTACT ' + c.kind + ' guid=' + c.guid + ' cls=' + c.cls +
      ' pool=' + c.inPool + ' bz=' + c.bz.toFixed(2) + ' tz=' + c.tz.toFixed(2) + ' dz=' + c.dz.toFixed(2) + 'm' +
      ' opStart=DAY ' + Math.floor((c.opS - projectStart) / DAY_MS) +
      ' HR ' + Math.floor(((c.opS - projectStart) % DAY_MS) / 3600000) +
      ' onScreenAtCursor=' + c.placed);
  });
  const sIdx = des[i];
  if (sIdx < 0) {
    console.log('§FGA_JUDGE_SUPPORT designatedSupport=-1 — THE JUDGE BELIEVES THIS ELEMENT DEPENDS ON NOTHING. ' +
      '_midairAudit skips it unconditionally (`if (sIdx < 0) continue`). It cannot ever be counted midair, ' +
      'at any time, on any timeline.');
  } else {
    const S = items[sIdx];
    console.log('§FGA_JUDGE_SUPPORT guid=' + S.guid + ' cls=' + S.cls + ' bz=' + S.bz.toFixed(2) + ' tz=' + S.tz.toFixed(2) +
      ' dz=' + (S.bz - T.bz).toFixed(2) + 'm opStart=' + new Date(op[S.guid].s).toISOString() +
      ' = DAY ' + Math.floor((op[S.guid].s - projectStart) / DAY_MS) +
      ' HR ' + Math.floor(((op[S.guid].s - projectStart) % DAY_MS) / 3600000) +
      ' onScreenAtCursor=' + !!placedSet[S.guid]);
    console.log('§FGA_JUDGE_TEST cpmSupport.s=' + items[sIdx].s + ' cpmSelf.s=' + items[i].s +
      ' -> support.s > self.s+1 ? ' + (items[sIdx].s > items[i].s + 1) +
      ' (the judge reads CPM times, NOT the kernel_ops times the movie plays)');
  }
  process.exit(0);
}
main().catch(e => { console.error('§FGA_ERROR ' + (e && e.stack || e)); process.exit(2); });
