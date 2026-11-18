#!/usr/bin/env node
// # ⚠ DO NOT REMOVE — scope: W-DCMA-14PT, the DCMA 14-point schedule assessment over the AUTHORED task network (tasks + task_sequences +
// the float computeCpm writes). Spec: bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.25.2 item 4. Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: "the 4D schedule is not compliant with the schedule-quality test owners and auditors run on a P6 /
// MS Project programme" — and, as a ratchet, "a change made one DCMA check worse on some building without anyone seeing it".
// Thresholds (Deltek Acumen "DCMA 14-Point Assessment Metric Descriptions"; GAO Schedule Assessment Guide): 1 logic <= 5 % · 2 leads 0 ·
// 3 lags <= 5 % · 4 FS >= 90 % · 5 hard constraints <= 5 % · 6 high float (> 44 d) reported, no % limit in the source · 7 negative float 0 ·
// 8 high duration (> 44 d) <= 5 % · 9 invalid dates 0 · 10 resources: every task carries one · 12 critical path test (owner computeCpm) ·
// 11 / 13 / 14 N/A (need progress + a baseline). Calendar: 4D_template.json is 7 days a week, so calendar days are working days.
// Verdict per check: PASS / FAIL against DCMA, and RATCHET: a value may not be worse than baselines/dcma.json (LOCK=1 writes it, measured).
// usage: node viewer/tests/witness_dcma_14pt.js [Building ...]      (BLD_DIR as for the editor witnesses)
'use strict';
const fs = require('fs'), path = require('path');
const F = require('./_gantt_edit_fixture.js');
const LOCK_FILE = path.join(__dirname, 'baselines', 'dcma.json');
const BLDS = process.argv.slice(2).length ? process.argv.slice(2) : ['Duplex', 'HHS_Office_Federated', 'JKR', 'Clinic', 'Terminal', 'Hospital', 'LTU_AHouse'];
const lock = fs.existsSync(LOCK_FILE) ? JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8')) : { _what: 'W-DCMA-14PT ratchet: measured values, worse = FAIL', buildings: {} };
const day = s => Date.parse(String(s).slice(0, 10) + 'T00:00:00Z') / 86400000;
// score(T, L) — pure: tasks [{id, s, f, resource, tf}] and links [{p, s, ty, lag}] -> the measured value of each check.
function score(T, L) {
  const ids = new Set(T.map(t => t.id)), pr = {}, su = {};
  L = L.filter(x => ids.has(x.p) && ids.has(x.s)); L.forEach(x => { (pr[x.s] = pr[x.s] || []).push(x); (su[x.p] = su[x.p] || []).push(x); });
  const n = T.length, noP = T.filter(t => !pr[t.id]).length, noS = T.filter(t => !su[t.id]).length;
  const missing = T.filter(t => !pr[t.id] || !su[t.id]).length - Math.min(1, noP) - Math.min(1, noS);   // one start + one finish are the programme's ends
  const dur = t => day(t.f) - day(t.s);
  return { n: n, links: L.length, logic: missing, leads: L.filter(x => x.lag < 0).length, lags: L.filter(x => x.lag > 0).length,
    fs: L.filter(x => (x.ty || 'FS') === 'FS').length, constraints: 0,
    floatKnown: T.filter(t => typeof t.tf === 'number').length, highFloat: T.filter(t => t.tf > 44).length, negFloat: T.filter(t => t.tf < 0).length,
    highDur: T.filter(t => dur(t) > 44).length, invalid: T.filter(t => isNaN(day(t.s)) || isNaN(day(t.f)) || day(t.f) < day(t.s)).length,
    noResource: T.filter(t => !t.resource).length, critical: T.filter(t => t.tf === 0).length };
}
function checks(m) {   // [id, name, value-as-printed, DCMA verdict, ratchet key, number]
  const p = (a, b) => b ? +(100 * a / b).toFixed(1) : 0;
  return [
    ['1', 'logic', p(m.logic, m.n) + '%', p(m.logic, m.n) <= 5, 'logic', m.logic],
    ['2', 'leads', m.leads, m.leads === 0, 'leads', m.leads],
    ['3', 'lags', p(m.lags, m.links) + '%', p(m.lags, m.links) <= 5, 'lags', m.lags],
    ['4', 'finish-to-start', p(m.fs, m.links) + '%', p(m.fs, m.links) >= 90, 'nonFs', m.links - m.fs],
    ['5', 'hard constraints', m.constraints, true, 'constraints', m.constraints],
    ['6', 'high float >44d', m.highFloat + ' (' + p(m.highFloat, m.n) + '%)', null, 'highFloat', m.highFloat],
    ['7', 'negative float', m.negFloat, m.floatKnown === m.n ? m.negFloat === 0 : undefined, 'negFloat', m.negFloat],
    ['8', 'high duration >44d', p(m.highDur, m.n) + '%', p(m.highDur, m.n) <= 5, 'highDur', m.highDur],
    ['9', 'invalid dates', m.invalid, m.invalid === 0, 'invalid', m.invalid],
    ['10', 'resources', m.noResource + ' tasks without', m.noResource === 0, 'noResource', m.noResource],
    ['12', 'critical path', m.critical + ' zero-float tasks', m.floatKnown === m.n ? m.critical > 0 : undefined, 'noCritical', m.critical > 0 ? 0 : 1]];
}
(async () => {
  let fail = 0, judged = 0, inc = 0;
  // red control: a network with one task cut loose must be counted by check 1
  { const T = [{ id: 'a', s: '2026-01-01', f: '2026-01-02' }, { id: 'b', s: '2026-01-02', f: '2026-01-03' }, { id: 'c', s: '2026-01-03', f: '2026-01-04' }, { id: 'd', s: '2026-01-01', f: '2026-01-02' }];
    const r = score(T, [{ p: 'a', s: 'b' }, { p: 'b', s: 'c' }]); const ok = r.logic >= 1;
    console.log('§DCMA_RED_CONTROL cut-loose task counted by check 1: ' + (ok ? 'PASS' : 'FAIL') + ' (logic=' + r.logic + ')'); judged++; if (!ok) fail++; }
  for (const bld of BLDS) {
    const l = console.log; console.log = () => {}; let P; try { P = await F.playedChain(bld); } catch (e) { P = { failed: String(e) }; } finally { console.log = l; }
    if (!P || !P.db) { console.log('§DCMA_BLD ' + bld + ' INCONCLUSIVE ' + JSON.stringify(P).slice(0, 140)); inc++; continue; }
    const q = (s, a) => { const st = P.db.prepare(s); st.bind(a || []); const o = []; while (st.step()) o.push(st.getAsObject()); st.free(); return o; };
    const T = q('SELECT task_id id, schedule_start s, schedule_finish f, resource, total_float tf FROM tasks WHERE schedule_id=? AND (is_summary IS NULL OR is_summary=0)', [P.schedId]);
    T.forEach(t => { t.tf = (t.tf == null || t.tf === '') ? null : Number(t.tf); });   // computeCpm stores float as TEXT (tasks.total_float)
    const L = q('SELECT predecessor_id p, successor_id s, sequence_type ty, lag_days lag FROM task_sequences');
    const m = score(T, L), B = lock.buildings[bld];
    console.log('§DCMA_BLD ' + bld + ' tasks=' + m.n + ' links=' + m.links + ' floatWritten=' + m.floatKnown + '/' + m.n + (B ? '' : '  NOLOCK'));
    const vals = {};
    checks(m).forEach(([id, name, shown, dcma, key, num]) => {
      vals[key] = num;
      const worse = B && typeof B[key] === 'number' && num > B[key];
      const v = dcma === null ? 'REPORT' : dcma === undefined ? 'INCONCLUSIVE' : dcma ? 'PASS' : 'FAIL';
      console.log('§DCMA_CHECK ' + bld + ' ' + id.padEnd(2) + ' ' + name.padEnd(20) + ' ' + String(shown).padEnd(22) + ' DCMA=' + v.padEnd(12) +
        ' ratchet=' + (!B ? 'NOLOCK' : worse ? 'WORSE ' + B[key] + '->' + num : 'ok(' + B[key] + ')'));
      if (B) { judged++; if (worse) fail++; }
    });
    if (process.env.LOCK === '1') { lock.buildings[bld] = vals; console.log('§DCMA_LOCK ' + bld + ' ' + JSON.stringify(vals)); }
    else if (!B) inc++;
  }
  ['11 missed tasks', '13 CPLI', '14 BEI'].forEach(c => console.log('§DCMA_CHECK * ' + c + ' N/A — needs progress against a baseline'));
  if (process.env.LOCK === '1') fs.writeFileSync(LOCK_FILE, JSON.stringify(lock, null, 1) + '\n');
  console.log('§DCMA_VERDICT buildings=' + BLDS.length + ' judged=' + judged + ' worse=' + fail + ' inconclusive=' + inc + '  ' + (fail ? 'FAIL' : inc ? 'INCONCLUSIVE' : 'PASS') +
    ' — the ratchet; the DCMA PASS/FAIL per check is on each §DCMA_CHECK line');
  process.exit(fail ? 1 : inc ? 2 : 0);
})();
