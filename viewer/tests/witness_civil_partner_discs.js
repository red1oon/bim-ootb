#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §PARTNER_DISCS (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §PARTNER_DISCS). Read the log.
// ISSUE (user 2026-10-06): the BIM partner's new files (GEOTECH, GABION MATTRESS, CHAINAGE, ROW, EARTHWORK body) matched NO civil word and
// would import with no discipline / no phase. GREEN = every partner file name maps to its code; SEQUENCE_CIVIL gives the physical order
// (setting out < ground treatment < earthworks < drainage = gabion < pavement < finishing < marking, all ≤ 7); the civil template has a
// phase for every civil phase name and its logic is acyclic; CIVIL_RATES covers every civil code; the cpm graph on civil items chains phase
// GROUPS only (k → k+1, never inside a group); a building item set builds the IDENTICAL edge list with and without the civil table.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const V = path.join(__dirname, '..');
const checks = []; const ok = (n, v, d) => { checks.push([n, !!v]); console.log('  ' + (v ? 'PASS ' : 'FAIL ') + n + (d ? '  ' + d : '')); };
// 1. import word match — the shipped function sliced out of import_worker.js
const iw = fs.readFileSync(path.join(V, 'import_worker.js'), 'utf8');
const pick = (src, start, endTok) => { const a = src.indexOf(start); return src.slice(a, src.indexOf(endTok, a) + endTok.length); };
const ctx = {}; vm.createContext(ctx);
vm.runInContext(pick(iw, 'var VALID_DISCS', '];') + '\n' + pick(iw, 'var CIVIL_DISCS', '];') + '\n' + pick(iw, 'function discFromFilename', '\n}\n'), ctx);
const files = { 'JELAPANG_GEOTECH.ifc': 'GEOTECH', 'JELAPANG_GABION MATTRESS.ifc': 'GABION', 'JELAPANG_CHAINAGE.ifc': 'CHAINAGE', 'JELAPANG_ROW.ifc': 'ROW',
  'JELAPANG_EARTHWORK.ifc': 'EARTHWORK', 'JELAPANG_ROAD LIGHTING.ifc': 'LIGHTING', 'JELAPANG_ROAD.ifc': 'ROAD', 'JELAPANG_DRAINAGE.ifc': 'DRAINAGE',
  'JELAPANG_ROAD FURNITURE.ifc': 'FURNITURE', 'JELAPANG_ROAD MARKING.ifc': 'MARKING', 'JELAPANG_ROAD SIGNAGE.ifc': 'SIGNAGE' };
const got = Object.keys(files).map(f => [f, vm.runInContext('discFromFilename(' + JSON.stringify(f) + ')', ctx)]);
ok('every partner file name → its civil code', got.every(([f, c]) => c === files[f]), JSON.stringify(got.filter(([f, c]) => c !== files[f])));
// 2. rates.js in a vm (as cache_4d_run.js loads it)
const R = {}; vm.createContext(R); vm.runInContext(fs.readFileSync(path.join(V, 'rates.js'), 'utf8') + '\nthis.SEQUENCE_CIVIL=SEQUENCE_CIVIL;this.CIVIL_RATES=CIVIL_RATES;this.LABOR_RATES=LABOR_RATES;', R);
const S = R.SEQUENCE_CIVIL, q = k => S[k] && S[k].sequence;
ok('physical order: setting out < ground treatment < earthworks < drainage = gabion < pavement < finishing < marking (≤ 7)',
  q('CHAINAGE') === q('ROW') && q('ROW') < q('GEOTECH') && q('GEOTECH') < q('EARTHWORK') && q('EARTHWORK') < q('DRAINAGE') && q('DRAINAGE') === q('GABION') &&
  q('GABION') < q('ROAD') && q('ROAD') < q('FURNITURE') && q('FURNITURE') === q('SIGNAGE') && q('SIGNAGE') === q('LIGHTING') && q('LIGHTING') < q('MARKING') && q('MARKING') <= 7,
  JSON.stringify(Object.fromEntries(Object.keys(S).map(k => [k, S[k].sequence]))));
ok('every civil code has a crew in LABOR_RATES and a CIVIL_RATES line', Object.keys(S).every(k => R.LABOR_RATES[S[k].resource] && R.CIVIL_RATES[k]));
ok('every CIVIL_DISCS code is in SEQUENCE_CIVIL', vm.runInContext('CIVIL_DISCS', ctx).every(c => S[c]));
// 3. template
const T = JSON.parse(fs.readFileSync(path.join(V, 'rates/4D_template_civil.json'), 'utf8'));
const tNames = new Set(T.phases.map(p => p.name)), ids = new Set(T.phases.map(p => p.id));
ok('template has a phase for every civil phase name', [...new Set(Object.values(S).map(r => r.phase))].every(n => tNames.has(n)));
const deps = T.dependencies.within_level; const adj = {}; deps.forEach(d => (adj[d.pred] = adj[d.pred] || []).push(d.succ));
const seen = {}, stack = {}; let cyc = false; const dfs = n => { if (stack[n]) { cyc = true; return; } if (seen[n]) return; seen[n] = stack[n] = 1; (adj[n] || []).forEach(dfs); stack[n] = 0; };
ids.forEach(dfs);
ok('template logic acyclic, every dependency names real phases', !cyc && deps.every(d => ids.has(d.pred) && ids.has(d.succ)));
// 4. cpm graph — civil groups, and building identity with/without the civil table
const SG = require(path.join(V, 'schedule_gate.js')); global.ScheduleGate = SG;
function loadCpm(withCivil) { const k = require.resolve(path.join(V, 'cpm_schedule.js')); delete require.cache[k]; if (withCivil) global.SEQUENCE_CIVIL = S; else delete global.SEQUENCE_CIVIL; return require(k); }
const civItems = Object.keys(S).map((d, i) => ({ guid: 'c' + i, cls: 'IfcBuildingElementProxy', seq: S[d].sequence, phase: S[d].phase, storey: 'CH 00', lvlSec: 0, civil: true, disc: d,
  x0: i * 100, x1: i * 100 + 1, y0: 0, y1: 1, bz: 0, tz: 1, s: 0, e: 60000, resource: S[d].resource }));
const C1 = loadCpm(true), G1 = C1.buildGraph(civItems, C1.contactGraph(civItems));
const seqOf = ph => Object.values(S).find(r => r.phase === ph).sequence;
const groups = [...new Set(Object.values(S).map(r => r.sequence))].sort((a, b) => a - b);
let inGroup = 0, skip = 0, good = 0;
G1.out.forEach((es, u) => { if (!es || u < G1.nElements) return; const ms = G1.msMeta[u - G1.nElements]; if (!ms || !S[Object.keys(S).find(k => S[k].phase === ms.phase)]) return;
  es.forEach(e => { if (e.type !== 3 || e.to >= G1.nElements) return; const a = seqOf(ms.phase), b = civItems[e.to].seq; if (a === b) inGroup++; else if (groups.indexOf(b) !== groups.indexOf(a) + 1) skip++; else good++; }); });
ok('civil E3 chains group k → k+1 only (none inside a group, none skipping)', good > 0 && inGroup === 0 && skip === 0, 'good=' + good + ' inGroup=' + inGroup + ' skip=' + skip);
const bPh = ['Substructure', 'Superstructure', 'Architecture Envelope', 'MEP Rough-in', 'Finishes'];
const bItems = bPh.map((p, i) => ({ guid: 'b' + i, cls: 'IfcWall', seq: i + 1, phase: p, storey: 'L1', x0: i * 100, x1: i * 100 + 1, y0: 0, y1: 1, bz: 0, tz: 1, s: 0, e: 60000, resource: 'MASON' }));
const sig = C => { const G = C.buildGraph(bItems, C.contactGraph(bItems)); return JSON.stringify(G.out.map(es => (es || []).map(e => [e.to, e.type, e.kind]))) + JSON.stringify(G.counts); };
const withCiv = sig(loadCpm(true)), noCiv = sig(loadCpm(false));
ok('building item set: identical edge list with and without the civil table (NON-IMPACT)', withCiv === noCiv);
const fail = checks.filter(c => !c[1]).length;
console.log('§WITNESS_CIVIL_PARTNER_DISCS ' + (fail ? 'FAIL ' : 'PASS ') + (checks.length - fail) + '/' + checks.length);
process.exit(fail ? 1 : 0);
