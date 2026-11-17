#!/usr/bin/env node
// # ⚠ DO NOT REMOVE — scope: the ASSEMBLY-ORDER witness for the Time Machine build-up, PER CLASS.
// Spec: bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.9.3 items 2 + 3, §Q.11. Read the log after every run.
//
// THE ISSUE THIS PROVES OR DISPROVES: "a change to the 4D rules made one class of element play out of
// order, or dropped it out of the judged population, without anyone seeing it". One fleet total hid
// both: a beam fix behind 2,000 pipes, and D2's beams that simply stopped being judged (§Q.9 F3).
//
// It reads ONLY the persisted run (scripts/cache_4d_run.js, PRIMAL LAW 5) on the PLAYED layer and calls
// the OWNERS (§I): SupportSweep.contactGraph / designatedSupport / midairAudit, ScheduleGate.supportPool.
// Nothing is re-derived. Claims, per building:
//   A0  self-check — the recount equals the run's own playStats.midairPlayed, else nothing below is quoted
//   A1  per class: midair does not RISE above its locked number            (viewer/tests/baselines/assembly_order.json)
//   A2  per class: structural elements with NO elected support (unjudged) do not RISE
//   A3  filing parity: elements whose elected support's TASK starts at/after their own task ENDS do not RISE
// A number that FELL is printed as IMPROVED with the line to re-lock; it is never silently absorbed.
// A cache miss, an absent layer or an absent lock prints INCONCLUSIVE, never PASS. IfcBeam / IfcColumn
// absent from a building prints VACUOUS.
//
// usage: node viewer/tests/witness_tm_assembly_order.js [Building ...]
//        LOCK=1 … writes the lock from THIS run (measured, never typed) — only with a written reason in §Q.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SG = require(path.join(ROOT, 'viewer', 'schedule_gate.js')); global.ScheduleGate = SG;
require(path.join(ROOT, 'viewer', 'cpm_schedule.js'));
const SS = require(path.join(ROOT, 'viewer', 'support_sweep.js'));
const CACHE = require(path.join(ROOT, 'scripts', 'cache_4d_run.js'));
const { Witness } = require(path.join(ROOT, 'witness_kit', 'contract.js'));

const LOCK_FILE = path.join(__dirname, 'baselines', 'assembly_order.json');
const BUILDINGS = process.argv.slice(2).filter(a => a[0] !== '-').length
  ? process.argv.slice(2).filter(a => a[0] !== '-') : ['Hospital', 'Terminal', 'Duplex', 'HHS_Office_Federated'];
const NAMED = ['IfcBeam', 'IfcColumn'];                    // the classes the lane is named after: absent ⇒ VACUOUS, said aloud
const lock = fs.existsSync(LOCK_FILE) ? JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8')) : { buildings: {} };
const quiet = fn => { const l = console.log; console.log = () => {}; try { return fn(); } finally { console.log = l; } };   // the owners' own § lines are in witness.log already

// measure(bld) — one row per class, plus the building's filing-parity count. Null when nothing can be judged.
function measure(bld) {
  const r = CACHE.read(bld);
  if (!r) { console.log('§ASM ' + bld + ' CACHE_MISS — run: node scripts/cache_4d_run.js ' + bld + '  INCONCLUSIVE'); return null; }
  const L = CACHE.layerOf(r, 'played');
  if (L.missing) { console.log('§ASM ' + bld + ' layer=played ABSENT from this cache  INCONCLUSIVE'); return null; }
  const taskOf = {}, T = {};
  (r.tasks || []).forEach(t => { T[t.id] = t; t.guids.forEach(g => { taskOf[g] = t.id; }); });
  const items = r.els.filter(e => L.map[e.guid]).map(e => Object.assign({}, e, { s: L.map[e.guid].s, e: L.map[e.guid].e }));
  const G = quiet(() => SS.contactGraph(items));
  if (!G.ok) { console.log('§ASM ' + bld + ' JUDGE_UNAVAILABLE  INCONCLUSIVE'); return null; }
  const des = quiet(() => SS.designatedSupport(items, G)), ma = quiet(() => SS.midairAudit(items));
  const mid = new Set(ma.guids), noSup = new Set(des.structNoSupport || []);
  const persisted = r.playStats ? r.playStats.midairPlayed : null;
  const by = {}; let parity = 0;
  const row = c => by[c] || (by[c] = { bld: bld, cls: c, total: 0, midair: 0, sameTask: 0, crossTask: 0, unjudgedStruct: 0 });
  items.forEach((x, i) => {
    const o = row(x.cls || '?'); o.total++;
    if (noSup.has(i)) o.unjudgedStruct++;
    const a = des[i]; if (a < 0) return;
    const A = items[a], tx = taskOf[x.guid], ta = taskOf[A.guid];
    if (mid.has(x.guid)) { o.midair++; if (tx === ta) o.sameTask++; else o.crossTask++; }
    if (tx !== ta && T[tx] && T[ta] && T[ta].sDays >= T[tx].eDays) parity++;   // §FILING_PARITY — judged over ALL elected edges, midair or not
  });
  return { bld: bld, dbFile: r.dbFile, dbKind: r.dbKind, dir: r.dir, judged: items.length, midair: ma.midair, persisted: persisted,
           match: persisted === ma.midair, rows: Object.keys(by).sort().map(k => by[k]), parity: parity };
}

const measured = BUILDINGS.map(measure).filter(Boolean);
const verdicts = [];
const say = (bld, claim, verdict, text) => { verdicts.push(verdict); console.log('  ' + verdict + ' ' + claim + ' ' + bld + ' — ' + text); };

if (process.env.LOCK === '1') {
  measured.forEach(m => {
    if (!m.match) { console.log('§ASM_LOCK ' + m.bld + ' REFUSED — self-check MISMATCH, a lock is never taken from a run that does not recount'); return; }
    const cls = {}; m.rows.forEach(o => { if (o.midair || o.unjudgedStruct) cls[o.cls] = { midair: o.midair, unjudgedStruct: o.unjudgedStruct }; });
    lock.buildings[m.bld] = { dbFile: m.dbFile, codeKey: path.basename(m.dir).split('_')[0], midair: m.midair, filingParity: m.parity, classes: cls };
    console.log('§ASM_LOCK ' + m.bld + ' locked midair=' + m.midair + ' filingParity=' + m.parity + ' classes=' + Object.keys(cls).length);
  });
  fs.writeFileSync(LOCK_FILE, JSON.stringify(lock, null, 1) + '\n');
}

const rows = [];
measured.forEach(m => {
  const B = lock.buildings[m.bld];
  console.log('§ASM ' + m.bld + ' db=' + m.dbFile + ' layer=played judged=' + m.judged + ' midair=' + m.midair + ' persisted=' + m.persisted +
    ' selfcheck=' + (m.match ? 'MATCH' : 'MISMATCH') + ' filingParity=' + m.parity);
  if (!m.match) { say(m.bld, 'A0', 'FAIL', 'recount ' + m.midair + ' != persisted ' + m.persisted + ' — nothing below may be quoted'); return; }
  say(m.bld, 'A0', 'PASS', 'recount equals the run (' + m.midair + ')');
  NAMED.forEach(c => { if (!m.rows.some(o => o.cls === c)) console.log('  VACUOUS ' + c + ' ' + m.bld + ' — the building has none; nothing judged for this class'); });
  if (!B) { say(m.bld, 'A1-A3', 'INCONCLUSIVE', 'no lock for this building in baselines/assembly_order.json'); return; }
  if (B.dbFile !== m.dbFile) { say(m.bld, 'A1-A3', 'INCONCLUSIVE', 'lock was taken on ' + B.dbFile + ', this run is ' + m.dbFile); return; }
  const rose = [], fell = [], roseU = [], fellU = [];
  const names = new Set(m.rows.map(o => o.cls).concat(Object.keys(B.classes)));
  names.forEach(c => {
    const o = m.rows.find(x => x.cls === c) || { bld: m.bld, cls: c, total: 0, midair: 0, sameTask: 0, crossTask: 0, unjudgedStruct: 0 };
    const b = B.classes[c] || { midair: 0, unjudgedStruct: 0 };
    rows.push(Object.assign({}, o, { lockMidair: b.midair, lockUnjudged: b.unjudgedStruct }));
    if (o.midair > b.midair) rose.push(c + ' ' + b.midair + '->' + o.midair); else if (o.midair < b.midair) fell.push(c + ' ' + b.midair + '->' + o.midair);
    if (o.unjudgedStruct > b.unjudgedStruct) roseU.push(c + ' ' + b.unjudgedStruct + '->' + o.unjudgedStruct);
    else if (o.unjudgedStruct < b.unjudgedStruct) fellU.push(c + ' ' + b.unjudgedStruct + '->' + o.unjudgedStruct);
  });
  const top = m.rows.filter(o => o.midair).sort((a, b) => b.midair - a.midair).slice(0, 8)
    .map(o => o.cls + ' ' + o.midair + ' (same ' + o.sameTask + ' / cross ' + o.crossTask + ')').join(' · ') || 'none';
  console.log('  midair by class: ' + top);
  say(m.bld, 'A1', rose.length ? 'FAIL' : 'PASS', rose.length ? 'midair ROSE: ' + rose.join(' · ') : 'no class rose above its lock');
  say(m.bld, 'A2', roseU.length ? 'FAIL' : 'PASS', roseU.length ? 'unjudged structural ROSE: ' + roseU.join(' · ')
    : 'unjudged structural did not rise (' + (m.rows.filter(o => o.unjudgedStruct).map(o => o.cls + ' ' + o.unjudgedStruct).join(' · ') || '0') + ')');
  say(m.bld, 'A3', m.parity > B.filingParity ? 'FAIL' : 'PASS', '§FILING_PARITY ' + B.filingParity + ' -> ' + m.parity);
  if (fell.length || fellU.length || m.parity < B.filingParity)
    console.log('  IMPROVED ' + m.bld + ' — ' + fell.concat(fellU.map(x => 'unjudged ' + x)).concat(m.parity < B.filingParity ? ['filingParity ' + B.filingParity + '->' + m.parity] : []).join(' · ') +
      ' — re-lock with LOCK=1 and a written reason');
});

// The contract (population / schema / redControl): the per-class rows are real, shaped, and the witness CAN fail.
Witness('tm_assembly_order')
  .population(() => rows)
  .schema({ type: 'object', required: ['bld', 'cls', 'total', 'midair', 'unjudgedStruct', 'lockMidair', 'lockUnjudged'],
    properties: { bld: { type: 'string', minLength: 1 }, cls: { type: 'string', minLength: 1 }, total: { type: 'integer', minimum: 0 },
      midair: { type: 'integer', minimum: 0 }, unjudgedStruct: { type: 'integer', minimum: 0 },
      lockMidair: { type: 'integer', minimum: 0 }, lockUnjudged: { type: 'integer', minimum: 0 } } })
  .invariant('no class above its lock (midair, unjudged structural)', rs => rs.every(o => o.midair <= o.lockMidair && o.unjudgedStruct <= o.lockUnjudged))
  .invariant('a class never has more midair than members', rs => rs.every(o => o.midair <= o.total || o.total === 0))
  .redControl(rs => { if (rs.length) rs[0].midair = rs[0].lockMidair + 1; return rs; })
  .run();

const f = verdicts.filter(v => v === 'FAIL').length, inc = verdicts.filter(v => v === 'INCONCLUSIVE').length + (BUILDINGS.length - measured.length);
console.log('§ASM_VERDICT buildings=' + BUILDINGS.length + ' judged=' + measured.length + ' claims=' + verdicts.length +
  ' PASS=' + verdicts.filter(v => v === 'PASS').length + ' FAIL=' + f + ' INCONCLUSIVE=' + inc + '  ' +
  (f ? 'FAIL' : (inc || !measured.length ? 'INCONCLUSIVE' : 'PASS')));
if (f) process.exitCode = 1; else if (inc || !measured.length) process.exitCode = process.exitCode || 2;
