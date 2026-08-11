#!/usr/bin/env node
// probe_midair_census.js — the USER'S acceptance bar, measured directly (2026-08-12,
// bim-compiler prompts/4D_SCHEDULE_PERFECTION.md "not a single item hanging in midair").
//
// ISSUE this probe exposes: auditFloating() counts an element as "floating" ONLY when a support
// it KNOWS about finishes after it starts. Two populations it can never flag are exactly what a
// viewer sees as hanging in midair:
//   (a) MIDAIR   — real supporters exist in the model, but NONE of them is even visible yet at the
//                  moment this element appears (auditFloating's structGrid pools exclude most
//                  classes, and seq<=4 structure-pool members are never support-checked at all).
//   (b) ORPHAN   — nothing in the whole model touches this element anywhere. No schedule change
//                  can ever fix it; it hangs forever. A data/extraction fact, reported not gated.
// Everything is measured against the DISPLAY timeline (the shipped two-tier remap) — the times the
// movie actually plays — not the raw generative schedule.
//
// Command (from viewer/):  BLD_DIR=~/bim-ootb/buildings node tests/probe_midair_census.js
// Read the log, not the exit code.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const initSqlJs = require(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.js'));
const ScheduleGate = require(path.join(__dirname, '..', 'schedule_gate.js'));
const ScheduleAuthor = require(path.join(__dirname, '..', 'schedule_author.js'));
const tmSrc = fs.readFileSync(path.join(__dirname, '..', 'time_machine.js'), 'utf8');
const gateSrc = fs.readFileSync(path.join(__dirname, '..', 'schedule_gate.js'), 'utf8');

// constants EXTRACTED from the shipped module (never re-typed here — they must not drift)
const CELL = ScheduleGate.CELL;
const EPS = parseFloat(/var EPS\s*=\s*([0-9.]+)/.exec(gateSrc)[1]);
const GAP = parseFloat(/var GAP\s*=\s*([0-9.]+)/.exec(gateSrc)[1]);

function sliceFn(src, name) {
  const idx = src.indexOf('function ' + name + '(');
  if (idx < 0) throw new Error(name + ' not found');
  let depth = 0, i = idx, seenOpen = false;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; seenOpen = true; }
    else if (src[i] === '}') { depth--; if (seenOpen && depth === 0) return src.slice(idx, i + 1); }
  }
  throw new Error('unbalanced braces for ' + name);
}
const tierOrderLine = "var _TIER1_ORDER = ['Substructure', 'Superstructure', 'Architecture'];";
const sliced = [tierOrderLine,
  sliceFn(tmSrc, '_promoteRoofLoadPath'), sliceFn(tmSrc, '_buildXrayElements'),
  sliceFn(tmSrc, '_tier1Extents'), sliceFn(tmSrc, '_tier1Serialize'),
  sliceFn(tmSrc, '_tier1Protrusion'), sliceFn(tmSrc, '_tierAuditRegate'),
  sliceFn(tmSrc, '_twoTierRemap')].join('\n');

function loadRatesTable() {
  const txt = fs.readFileSync(path.join(__dirname, '..', 'rates.js'), 'utf8');
  const start = txt.indexOf('var RATES = {');
  const defIdx = txt.indexOf('var SEQUENCE_DEFAULT');
  return (new Function(txt.slice(start, txt.indexOf('};', defIdx) + 2) + '\n return RATES;'))();
}

const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');
const DB_FILE = { LTU_AHouse: 'LTU_AHouse_meta.db' };
const BUILDINGS = (process.env.ONLY || 'Terminal,Hospital,Duplex,HHS_Office_Federated,Clinic,LTU_AHouse,JKR').split(',');
const D = 86400000;

function cellsOf(e) {
  const o = [];
  for (let i = Math.floor(e.x0 / CELL); i <= Math.floor(e.x1 / CELL); i++)
    for (let j = Math.floor(e.y0 / CELL); j <= Math.floor(e.y1 / CELL); j++) o.push(i + ',' + j);
  return o;
}
const overlap = (a, b) => a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;

(async () => {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.wasm')) });
  const rulesJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rates', 'sequence_rules.json'), 'utf8'));
  const SR = rulesJson.SEQUENCE_RULES, SD = rulesJson.SEQUENCE_DEFAULT, LR = rulesJson.LABOR_RATES;
  const NO = rulesJson.NAME_OVERRIDES || [];
  const RATES = loadRatesTable();

  for (const bld of BUILDINGS) {
    const dbPath = path.join(BLD_DIR, DB_FILE[bld] || (bld + '_extracted.db'));
    if (!fs.existsSync(dbPath)) { console.log('§MIDAIR ' + bld + ' fixture missing: ' + dbPath); continue; }
    const db = new SQL.Database(fs.readFileSync(dbPath));
    const sandbox = { console: { log: () => {}, warn: () => {} }, performance: { now: () => Date.now() },
      window: { SEQUENCE_RULES: SR, SEQUENCE_DEFAULT: SD, SEQUENCE_NAME_OVERRIDES: NO },
      ScheduleGate: ScheduleGate, Math: Math, A: () => ({ db: db }) };
    vm.createContext(sandbox);
    vm.runInContext(sliced + '\nthis.__bxe = _buildXrayElements; this.__remap = _twoTierRemap;', sandbox);
    const els = sandbox.__bxe();
    if (!els || !els.length) { console.log('§MIDAIR ' + bld + ' element build produced nothing'); db.close(); continue; }

    const nameOf = {};
    const nr = db.exec("SELECT guid, ifc_class, COALESCE(element_name,'') FROM elements_meta");
    if (nr.length) nr[0].values.forEach(v => { nameOf[v[0]] = v[2]; });

    const frag = ScheduleAuthor._classFragmentation(db, RATES);
    const lin = ScheduleAuthor._linearWeighting(db, RATES);
    const geoEls = els.filter(e => !(e.x0 === e.x1 && e.y0 === e.y1 && e.base_z === e.top_z));
    geoEls.forEach(e => {
      const rule = ScheduleAuthor.matchNameOverride(e.cls, nameOf[e.guid] || '', NO) || ScheduleAuthor.matchRule(e.cls, SR, SD);
      if (!e.phase) e.phase = rule.phase;
      e.resource = rule.resource || '_DEFAULT';
      const realQty = (frag.fragmented[e.cls] && frag.area[e.guid] != null) ? frag.area[e.guid] : null;
      const span = Math.max(e.x1 - e.x0, e.y1 - e.y0, e.top_z - e.base_z);
      const avgLen = lin.avgLength[e.cls];
      const lengthRatio = (realQty == null && span > 0 && avgLen > 0) ? span / avgLen : null;
      e.installSecs = ScheduleAuthor._installSecs(e.cls, rule, LR, realQty, lengthRatio);
    });
    db.close();
    const maxCrews = {};
    for (const rk in LR) if (LR[rk].max_crews) maxCrews[rk] = LR[rk].max_crews;

    const quiet = console.log; console.log = () => {};
    let sched;
    try { sched = ScheduleGate.computeSchedule(geoEls, 0, 1, maxCrews); } finally { console.log = quiet; }

    // DISPLAY timeline — what the movie plays (shipped two-tier remap, sliced not reimplemented)
    const items = geoEls.map(e => ({ guid: e.guid, s: sched[e.guid].start, e: sched[e.guid].end,
      bz: e.base_z, tz: e.top_z, x0: e.x0, x1: e.x1, y0: e.y0, y1: e.y1, cls: e.cls, seq: e.seq, phase: e.phase }));
    sandbox.console = { log: () => {}, warn: () => {} };
    sandbox.__items = items;
    vm.runInContext('this.__remap(this.__items);', sandbox);
    const disp = {};
    items.forEach(it => { disp[it.guid] = { start: it.s, end: it.e }; });

    // ── spatial index over EVERY element (no class/pool filter — this is the physical world) ──
    const grid = {};
    geoEls.forEach(e => { cellsOf(e).forEach(c => (grid[c] = grid[c] || []).push(e)); });

    let nMidair = 0, nOrphan = 0, nGrounded = 0, nOk = 0, nStrict = 0;
    const midairBy = {}, orphanBy = {}, worst = [];
    for (const T of geoEls) {
      const cs = cellsOf(T);
      let localMinBase = Infinity, earliestSupportStart = Infinity, earliestSupportEnd = Infinity, supporters = 0, hostLater = 0;
      const seen = {};
      for (const c of cs) {
        const arr = grid[c]; if (!arr) continue;
        for (const S of arr) {
          if (S.guid === T.guid || seen[S.guid]) continue;
          if (!overlap(S, T)) continue;
          seen[S.guid] = 1;
          if (S.base_z < localMinBase) localMinBase = S.base_z;
          // physical contact, direction-blind (bearing below | carrier above | side-embedded host)
          const bearing = S.base_z < T.base_z - EPS && S.top_z >= T.base_z - GAP;
          const carrier = S.base_z >= T.top_z - GAP && S.top_z > T.top_z + EPS;
          const sideHost = S.base_z <= T.base_z + EPS && S.top_z >= T.top_z - EPS;   // T embedded in S
          if (!bearing && !carrier && !sideHost) continue;
          supporters++;
          const ds = disp[S.guid].start;
          if (ds < earliestSupportStart) earliestSupportStart = ds;
          const de = disp[S.guid].end;
          if (de < earliestSupportEnd) earliestSupportEnd = de;
        }
      }
      // grounded = nothing in my own XY footprint starts lower than I do (I AM the ground layer here)
      const grounded = !(localMinBase < T.base_z - GAP);
      const myStart = disp[T.guid].start;
      if (supporters === 0) {
        if (grounded) { nGrounded++; } else { nOrphan++; orphanBy[T.cls] = (orphanBy[T.cls] || 0) + 1; }
        continue;
      }
      // stricter bar, measured alongside: nothing I touch is even FINISHED when I appear
      if (!grounded && earliestSupportEnd > myStart + 1) nStrict++;
      if (earliestSupportStart <= myStart + 1) { nOk++; continue; }
      if (grounded) { nGrounded++; continue; }
      nMidair++;
      midairBy[T.cls] = (midairBy[T.cls] || 0) + 1;
      worst.push({ guid: T.guid, cls: T.cls, seq: T.seq, phase: T.phase, name: nameOf[T.guid] || '',
        bz: T.base_z, start: myStart / D, supFirst: earliestSupportStart / D, gapD: (earliestSupportStart - myStart) / D });
      void hostLater;
    }
    worst.sort((a, b) => b.gapD - a.gapD);
    const top = k => Object.keys(k).sort((a, b) => k[b] - k[a]).slice(0, 6).map(c => c + ':' + k[c]).join(' ');
    console.log('§MIDAIR ' + bld + ' total=' + geoEls.length + ' midair=' + nMidair + ' orphan=' + nOrphan +
      ' grounded=' + nGrounded + ' ok=' + nOk + ' strictBar_noFinishedContact=' + nStrict);
    if (nMidair) console.log('  §MIDAIR_CLASSES ' + bld + ' ' + top(midairBy));
    if (nOrphan) console.log('  §ORPHAN_CLASSES ' + bld + ' ' + top(orphanBy));
    if (process.env.HIST) {   // where on the played timeline the hangings actually land
      let dMin = Infinity, dMax = -Infinity;
      geoEls.forEach(e => { const d = disp[e.guid]; if (d.start < dMin) dMin = d.start; if (d.end > dMax) dMax = d.end; });
      const span = (dMax - dMin) / D;
      const buckets = new Array(20).fill(0);
      worst.forEach(w => { const pct = (w.start * D - dMin) / (dMax - dMin); buckets[Math.min(19, Math.floor(pct * 20))]++; });
      console.log('  §MIDAIR_WHEN ' + bld + ' totalDays=' + span.toFixed(1) + ' by 5%-bucket: ' +
        buckets.map((n, i) => n ? (i * 5) + '%(d' + (span * i / 20).toFixed(0) + ')=' + n : null).filter(Boolean).join(' '));
    }
    worst.slice(0, 8).forEach(w => console.log('  §MIDAIR_WORST ' + bld + ' ' + w.cls + ' seq=' + w.seq +
      ' phase=' + w.phase + ' bz=' + w.bz.toFixed(2) + ' start=' + w.start.toFixed(1) + 'd firstSupport=' +
      w.supFirst.toFixed(1) + 'd early=' + w.gapD.toFixed(1) + 'd "' + w.name.slice(0, 46) + '"'));
  }
})();
