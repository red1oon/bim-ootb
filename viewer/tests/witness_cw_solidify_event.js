// ⚠ DO NOT REMOVE — Scope: node witness for §CW_SOLIDIFY_EVENT (bim-compiler prompts/CWRoadBakeIssues.md Issue A).
// Issue it proves/disproves: on a CIVIL model a staged slot's reveal time (_tmXraySolidifyTs) was not an event of its mesh, so the
// Time Machine delta skip passed over the mesh and the slot stayed hidden ("road portions not there", film v6 55 s).
// Claims:
//   W-CWS-1 GATE ON REAL DATA: the shipped isCivilModel() SQL (sliced from streaming.js) is false on every fleet building DB and
//           true on CivilWorksPath.db. VACUOUS if no fleet DB is found.
//   W-CWS-2 BUILDINGS UNCHANGED: with isCivilModel()=false the new _tmBuildEventIndex (sliced from time_machine.js) builds an index
//           byte-identical to origin/main's, on the same inputs including staged elements.
//   W-CWS-3 BUG REPRODUCED + FIXED: civil, a staged slot whose solidify time falls in a tick with no own event —
//           origin/main's index says "skip" (the bug), the new index says "visit".
// Run: cd <wt>/viewer && node tests/witness_cw_solidify_event.js   — READ tests/witness_cw_solidify_event.log.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const V = path.join(__dirname, '..');
const log = []; let fails = 0, vac = 0;
const S = m => { log.push(m); console.log(m); };
const ok = (c, l, d) => { if (!c) fails++; S('   ' + (c ? 'OK  ' : 'FAIL') + ' ' + l + (d ? ' — ' + d : '')); };
function slice(src, name) {
  const i = src.indexOf('function ' + name + '('); if (i < 0) throw new Error('slice miss ' + name);
  let d = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1); }
  throw new Error('slice unbalanced ' + name);
}
function makeIndexer(src) {
  const body = slice(src, '_tmBuildEventIndex') + '\n' + slice(src, '_tmHasEventIn');
  return new Function('st', `var _ops = st.ops, _tmXraySolidifyTs = st.sol, _evMesh, _evSig, _incrPrimed;
    var performance = { now: function () { return 0; } }; var console = { log: function (m) { st.logs.push(m); } };
    function _tmSceneSig() { return 'sig'; }
    ${body}
    _tmBuildEventIndex(st.app, st.linger); return { ev: _evMesh, has: _tmHasEventIn };`);
}
const cur = fs.readFileSync(path.join(V, 'time_machine.js'), 'utf8');
const old = cp.execSync('git show origin/main:viewer/time_machine.js', { cwd: V, maxBuffer: 64 << 20 }).toString();
S('§W-CWS — civil-only solidify events in the Time Machine delta index');

// W-CWS-1 — real gate
const stream = fs.readFileSync(path.join(V, 'streaming.js'), 'utf8');
const rates = fs.readFileSync(path.join(V, 'rates.js'), 'utf8');
let CIV = null;
try { CIV = Object.keys(new Function(rates.slice(rates.indexOf('var SEQUENCE_CIVIL'), rates.indexOf('};', rates.indexOf('var SEQUENCE_CIVIL')) + 2) + '; return SEQUENCE_CIVIL;')()); } catch (e) { S('   SEQUENCE_CIVIL slice failed ' + e.message); }
ok(!!CIV && CIV.length > 0, 'SEQUENCE_CIVIL sliced from rates.js', CIV && CIV.join(','));
ok(/SELECT COUNT\(\*\) FROM elements_meta WHERE discipline IN/.test(stream), 'isCivilModel() SQL shape present in streaming.js');
const home = require('os').homedir();
const fleet = ['Hospital_extracted.db', 'Duplex_extracted.db', 'LTU_AHouse_extracted.db', 'Terminal_extracted.db', 'Clinic_extracted.db']
  .map(f => [path.join(home, 'bim-ootb/buildings', f), path.join(home, 'bim-ootb/viewer/buildings', f)].find(p => fs.existsSync(p))).filter(Boolean);
const civilDb = path.join(V, 'buildings/CivilWorksPath.db');
const q = db => { try { return +cp.execSync(`sqlite3 -readonly "${db}" "SELECT COUNT(*) FROM elements_meta WHERE discipline IN ('${CIV.join("','")}')"`).toString().trim(); } catch (e) { return 'ERR ' + e.message.split('\n')[0]; } };
if (!fleet.length) { vac++; S('   VACUOUS no fleet DB found'); }
fleet.forEach(db => { const n = q(db); ok(n === 0, 'building gate false: ' + path.basename(db), 'civilRows=' + n); });
if (fs.existsSync(civilDb)) { const n = q(civilDb); ok(n > 0, 'civil gate true: CivilWorksPath.db', 'civilRows=' + n); } else { vac++; S('   VACUOUS CivilWorksPath.db absent'); }

// shared synthetic scene: mesh 7 holds A (own events days 1–2) and B (own events days 1–2, staged until day 5 by a carrier in mesh 9)
const D = 86400000, linger = 1000;
const ops = [{ output_guid: 'A', start_ts: 1 * D, end_ts: 2 * D }, { output_guid: 'B', start_ts: 1 * D, end_ts: 2 * D },
             { output_guid: 'C', start_ts: 3 * D, end_ts: 5 * D }];
const sol = { B: 5 * D };
const meta = { _batchMeta: { 7: [{ guid: 'A' }, { guid: 'B' }], 9: [{ guid: 'C' }] }, _instanceMeta: {} };
const run = (src, civil) => { const st = { ops, sol, linger, logs: [], app: Object.assign({ isCivilModel: () => civil }, meta) };
  const r = makeIndexer(src)(st); r.logs = st.logs; return r; };
const ser = ev => JSON.stringify(Object.keys(ev).sort().map(k => [k, Array.from(ev[k])]));

// W-CWS-2 — building identical
const bNew = run(cur, false), bOld = run(old, false);
ok(ser(bNew.ev) === ser(bOld.ev), 'building index byte-identical to origin/main', ser(bNew.ev));
ok(bNew.logs.some(l => /§CW_SOLIDIFY_EVENT civil=false added=0/.test(l)), 'building logs civil=false added=0', bNew.logs.join(' | '));

// W-CWS-3 — the tick (4.9 d, 5.1 d] contains only B's reveal
const cNew = run(cur, true), cOld = run(old, true), lo = 4.9 * D, hi = 5.1 * D;
const oldVisit = cOld.has(cOld.ev[7], lo, hi), newVisit = cNew.has(cNew.ev[7], lo, hi);
ok(oldVisit === false, 'origin/main skips mesh 7 at B\'s reveal tick (bug reproduced)', 'visit=' + oldVisit);
ok(newVisit === true, 'fix visits mesh 7 at B\'s reveal tick', 'visit=' + newVisit);
ok(cNew.logs.some(l => /§CW_SOLIDIFY_EVENT civil=true added=1/.test(l)), 'civil logs civil=true added=1');

const v = fails ? 'FAIL (fails=' + fails + ')' : vac ? 'INCONCLUSIVE (vacuous=' + vac + ')' : 'PASS';
S('\n§W-CWS ' + v);
fs.writeFileSync(path.join(__dirname, 'witness_cw_solidify_event.log'), log.join('\n'));
process.exit(fails ? 1 : vac ? 2 : 0);
