#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — W-IFC-GUID. SCOPE: prompts/VIEWER_IFC_EXPORT_GUID.md. Read the log after every run; exit code is not evidence.
// ISSUE IT EXPOSES: the Viewer's Save as IFC gave different elements the SAME GlobalId (only the first 11 hex digits
// of an id counted, non-hex letters were dropped) or an invalid one (first digit above 3). Does every product now get
// a unique, valid, stable GlobalId, and does a UUID keep its identity?
// Usage: node viewer/tests/witness_ifc_export_guid.js        IFC_GUID_BREAK=1 → pre-fix converter, G1 must FAIL.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'ifc_export_worker.js'), 'utf8');
let pass = 0, fail = 0, skip = 0;
const chk = (id, ok, d) => { console.log('§W-IFC-GUID ' + id + ' ' + (ok ? 'PASS' : 'FAIL') + ' ' + (d || '')); ok ? pass++ : fail++; };
const skp = (id, d) => { console.log('§W-IFC-GUID ' + id + ' SKIP ' + d); skip++; };

// The pre-fix converter, verbatim from origin/main 6322071d, used only by the break switch.
const PRE_FIX = `function toIfcGuid(guid) {
  if (!guid) return newGuid();
  if (guid.length === 22 && /^[0-9A-Za-z_$]+$/.test(guid)) return guid;
  var result = '';
  for (var i = 0; i < guid.length && result.length < 22; i++) {
    var v = parseInt(guid[i], 16);
    if (!isNaN(v)) result += IFC64[v] + IFC64[(v * 7 + i) % 64];
  }
  while (result.length < 22) result += IFC64[result.length % 64];
  return result.substring(0, 22);
}
function uniqueGuid(g) { return g; }`;

function run() {
  const logs = [];
  const ctx = { self: {}, postMessage() {}, TextEncoder, console: { log: (s) => logs.push(String(s)) } };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  if (process.env.IFC_GUID_BREAK === '1') vm.runInContext(PRE_FIX, ctx);
  const ids = [
    'GEN-CR-0001-PL', 'GEN-CR-0002-PL', 'GEN-CR-0003-BG', 'GEN-CR-0004-WD',               // 4 generated part ids
    '01234567-89ab-4000-8000-000000000001',                                                  // 3 UUIDs, same first 11 hex
    '01234567-89ab-4000-8000-000000000002',
    '01234567-89ab-4000-8000-000000000003',
    'ffffffffffffffffffffffffffffff01', 'ffffffffffffffffffffffffffffff02',                 // 2 bare hex, differ at end
    '2O2Fr$t4X7Zf8NOew3FLOH',                                                               // 1 valid GlobalId
    '',                                                                                     // 1 with no id
    'GEN-DUP-1', 'GEN-DUP-1',                                                               // 2 with the same id
    'WXYZ-PQRS-TUVW',                                                                       // 1 non-hex letters only
  ];
  const uuids = ids.slice(4, 9);
  const elements = ids.map((g, i) => ({ guid: g, name: 'E' + i, ifcClass: 'IfcPlate', storey: 'L1' }));
  const guidHashMap = {}; ids.forEach(g => { guidHashMap[g] = 'h1'; });
  // typed arrays made INSIDE the vm realm: the worker's `instanceof Float32Array` is per-realm
  const geometries = [{ hash: 'h1', vertices: vm.runInContext('new Float32Array([0,0,0,1,0,0,0,1,0])', ctx), faces: vm.runInContext('new Int32Array([0,1,2])', ctx) }];
  const text = ctx.buildIFC({ elements, transforms: [], geometries, guidHashMap, meta: { buildingName: 'W' } });
  const prod = {}; const all = [];
  text.split('\n').forEach(l => {
    let m = /^#\d+=IFC\w+\('([^']*)',#\d+,/.exec(l); if (m) all.push(m[1]);   // IfcRoot: (GlobalId, #OwnerHistory, ...)
    m = /^#\d+=IFCPLATE\('([^']*)',#\d+,'(E\d+)'/.exec(l); if (m) prod[m[2]] = m[1];
  });
  return { ids, uuids, prod, all, logs };
}

const A = run(), B = run();
const n = Object.keys(A.prod).length;
console.log('§W-IFC-GUID fixture elements=' + A.ids.length + ' products=' + n + (process.env.IFC_GUID_BREAK === '1' ? ' (BREAK: pre-fix converter)' : ''));
if (!n) { console.log('§W-IFC-GUID VERDICT INCONCLUSIVE (0 products judged)'); process.exit(2); }

const vals = Object.values(A.prod), distinct = new Set(vals).size;
chk('G1 UNIQUE', n === 14 && distinct === 14, 'products=' + n + ' distinct=' + distinct);

const RE = /^[0-3][0-9A-Za-z_$]{21}$/, bad = A.all.filter(g => !RE.test(g));
let g2 = bad.length === 0, g2d = 'all=' + A.all.length + ' badForm=' + bad.length + (bad.length ? ' e.g. ' + bad[0] : '');
let py = null;
try {
  const req = JSON.stringify({ all: A.all, uuids: A.uuids.map(u => u.replace(/-/g, '')) });
  py = JSON.parse(cp.execFileSync('python3', ['-c',
    'import sys,json,ifcopenshell.guid as g\nd=json.load(sys.stdin)\nrt=[x for x in d["all"] if g.compress(g.expand(x))!=x]\n' +
    'print(json.dumps({"rt":rt,"c":[g.compress(h) for h in d["uuids"]]}))'], { input: req, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }));
} catch (e) { py = null; }
if (py) { g2 = g2 && py.rt.length === 0; g2d += ' ifcopenshell_roundtrip_bad=' + py.rt.length; } else g2d += ' (ifcopenshell half SKIPPED: python ifcopenshell absent)';
chk('G2 VALID', g2, g2d);

if (py) {
  const mine = [4, 5, 6, 7, 8].map(i => A.prod['E' + i]);
  const ok = mine.every((g, i) => g === py.c[i]);
  chk('G3 UUID-FAITHFUL', ok, 'ours=' + mine.join(',') + ' ifcopenshell=' + py.c.join(','));
} else skp('G3 UUID-FAITHFUL', 'python ifcopenshell absent');

const withId = A.ids.map((g, i) => 'E' + i).filter((e, i) => A.ids[i]);
const moved = withId.filter(e => A.prod[e] !== B.prod[e]);
chk('G4 STABLE', moved.length === 0, 'elements_with_id=' + withId.length + ' changed_between_exports=' + moved.length);

chk('G5 PASSTHROUGH', A.prod.E9 === '2O2Fr$t4X7Zf8NOew3FLOH', 'E9=' + A.prod.E9);

const line = A.logs.find(s => s.indexOf('§IFC_EXPORT_GUID') >= 0) || '';
const want = 'elements=14 unique=14 passthrough=1 uuid=5 hashed=7 random=1 rederived=1';
chk('G6 LOGGED', line.indexOf(want) >= 0, line ? line.replace(/^.*§IFC_EXPORT_GUID /, '') : 'no §IFC_EXPORT_GUID line');

console.log('§W-IFC-GUID VERDICT ' + (fail ? 'FAIL' : 'PASS') + ' pass=' + pass + ' fail=' + fail + ' skip=' + skip);
process.exit(fail ? 1 : 0);
