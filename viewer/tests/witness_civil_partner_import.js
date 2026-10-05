#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §PARTNER_DISCS D1/D4/D5/D8 (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md). Read the log.
// ISSUE (user 2026-10-06): the BIM partner's new files would import with NO civil discipline, and a DB saved that way keeps it.
// GREEN = every partner file name maps to its code (shipped discFromFilename sliced from import_worker.js); each new code has a crew, an
// UNPRICED CIVIL_RATES line (so it can never fall back to a building class rate) and a colour; SEQUENCE_CIVIL is NOT changed here (the build
// order lives on the held WIP branch feat/civil-partner-discs — it tipped the road schedule onto the cell path). RED: unchanged main fails.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'); const V = path.join(__dirname, '..');
const checks = []; const ok = (n, v, d) => { checks.push(!!v); console.log('  ' + (v ? 'PASS ' : 'FAIL ') + n + (d ? '  ' + d : '')); };
const iw = fs.readFileSync(path.join(V, 'import_worker.js'), 'utf8'), pick = (src, a0, e) => { const a = src.indexOf(a0); return src.slice(a, src.indexOf(e, a) + e.length); };
const ctx = {}; vm.createContext(ctx); vm.runInContext(pick(iw, 'var VALID_DISCS', '];') + '\n' + pick(iw, 'var CIVIL_DISCS', '];') + '\n' + pick(iw, 'function discFromFilename', '\n}\n'), ctx);
const want = { 'JELAPANG_GEOTECH.ifc': 'GEOTECH', 'JELAPANG_GABION MATTRESS.ifc': 'GABION', 'JELAPANG_CHAINAGE.ifc': 'CHAINAGE', 'JELAPANG_ROW.ifc': 'ROW', 'JELAPANG_EARTHWORK.ifc': 'EARTHWORK',
  'JELAPANG_ROAD.ifc': 'ROAD', 'JELAPANG_ROAD LIGHTING.ifc': 'LIGHTING', 'JELAPANG_DRAINAGE.ifc': 'DRAINAGE', 'BR1-001-002.ifc': null, 'LTU_AHouse_HEAT.ifc': 'HEAT' };
const bad = Object.keys(want).filter(f => vm.runInContext('discFromFilename(' + JSON.stringify(f) + ')', ctx) !== want[f]);
ok('file names → codes (partner files mapped; bridge + building names unchanged)', bad.length === 0, JSON.stringify(bad));
const R = {}; vm.createContext(R); vm.runInContext(fs.readFileSync(path.join(V, 'rates.js'), 'utf8') + '\nthis.S=SEQUENCE_CIVIL;this.C=CIVIL_RATES;this.L=LABOR_RATES;this.D=DISC_COLORS;', R);
const NEW = ['GEOTECH', 'GABION', 'CHAINAGE', 'ROW'];
ok('each new code: crew + unpriced CIVIL_RATES line + colour', NEW.every(k => R.C[k] && R.C[k].rate === null && R.L[R.C[k].trade] && R.D[k]));
ok('SEQUENCE_CIVIL unchanged here (7 road codes, EARTHWORK=1 … MARKING=7)', Object.keys(R.S).length === 7 && R.S.EARTHWORK.sequence === 1 && R.S.MARKING.sequence === 7);
const f = checks.filter(x => !x).length; console.log('§WITNESS_CIVIL_PARTNER_IMPORT ' + (f ? 'FAIL ' : 'PASS ') + (checks.length - f) + '/' + checks.length); process.exit(f ? 1 : 0);
