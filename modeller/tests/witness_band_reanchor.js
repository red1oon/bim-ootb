#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — W-BAND-REANCHOR, prompts/DISC_WALK_BAND_NO_HOST.md §12. Read the log after every run; exit code is not evidence.
// ISSUE IT PROVES OR DISPROVES: a band row borrowed from another building (FP from terminal_rules.db, WalkerDoctrine §2) kept that building's storey
// ladder, so on a different building its devices sat at the source's absolute heights (measured on a private set: 939 of 1,772 heads > 3 m above any
// slab/roof). The fix re-anchors by storey ORDER from data (rule_storey_floor, a self-heal patch) and places a re-anchored device only on a host.
//   R1 the patch applies and rule_storey_floor = a fresh mine of buildings/Terminal_extracted.db (RED: no patch -> rule off, logged)
//   R2 Terminal on its own rules: the rule does not fire, FP placements identical with and without the patch
//   R3 hand-built 2-level building: every re-anchored band = target floor + (band - source floor); multi-storey scope not placed; storeys past the
//      target's levels map to none (RED: patch off -> absolute bands, nothing re-anchored)
//   R4 re-anchored + no host -> refused (reanchorNoHost); the SAME devices without the mark keep §10 (unhosted, kept); bound ones take the host's storey
//   R5 accounting per class: input = bound + unhosted + notJudged + refused
// A claim prints INCONCLUSIVE, never PASS, when nothing was judged. Node only, no browser. Usage: node modeller/tests/witness_band_reanchor.js > log 2>&1
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const M = path.join(__dirname, '..'), H = require(path.join(__dirname, 'walk_node_harness.js'));
const initSqlJs = require(require.resolve('sql.js', { paths: [path.join(os.homedir(), 'bim-compiler', 'node_modules'), path.join(os.homedir(), 'bim-ootb', 'node_modules')] }));
let pass = 0, fail = 0, inc = 0; const L = [];
const ok = (id, c, m) => { console.log('§' + (c ? 'PASS' : 'FAIL') + ' ' + id + ' | ' + (m || '')); c ? pass++ : fail++; };
const incon = (id, w) => { console.log('§INCONCLUSIVE ' + id + ' | ' + w); inc++; };
const rows = (db, s) => { const r = db.exec(s); return r.length ? r[0].values.map(v => Object.fromEntries(r[0].columns.map((c, i) => [c, v[i]]))) : []; };
const capture = fn => { const o = console.log; const buf = []; console.log = (...a) => { buf.push(a.join(' ')); }; try { return { r: fn(), log: buf }; } finally { console.log = o; } };
const RULES = path.join(M, 'terminal_rules.db'), PATCH = path.join(M, 'patches', 'terminal_rules.db.sql');
const TERM_X = [path.join(M, '..', 'buildings', 'Terminal_extracted.db'), path.join(os.homedir(), 'bim-ootb', 'buildings', 'Terminal_extracted.db')].find(f => fs.existsSync(f) && fs.statSync(f).size > 1e6);

function fixture(SQL, names) {   // 2 levels, floors 0 and 3.5 m, 20 x 20 m; walls, slabs; ceiling L0 covers x<10 only, ceiling L1 covers all
  const db = new SQL.Database();
  db.run('CREATE TABLE elements_meta(guid TEXT PRIMARY KEY, ifc_class TEXT, storey TEXT, discipline TEXT, element_name TEXT, material_name TEXT, material_rgba TEXT, building TEXT)');
  db.run('CREATE TABLE element_transforms(guid TEXT PRIMARY KEY, center_x REAL, center_y REAL, center_z REAL, rotation_x REAL, rotation_y REAL, rotation_z REAL, bbox_x REAL, bbox_y REAL, bbox_z REAL, transform_source TEXT)');
  db.run('CREATE TABLE storey_elevation(name TEXT, placement_z_m REAL)');
  db.run('CREATE TABLE element_instances(guid TEXT PRIMARY KEY, geometry_hash TEXT)');   // as every extracted DB has it; empty = no mesh at hand (host shape test by box)
  let n = 0; const add = (cls, st, c, b) => { const g = 'G' + String(++n).padStart(4, '0'); db.run('INSERT INTO elements_meta VALUES(?,?,?,?,?,?,?,?)', [g, cls, st, 'ARC', cls + n, null, null, 'FIX']); db.run('INSERT INTO element_transforms VALUES(?,?,?,?,?,?,?,?,?,?,?)', [g, c[0], c[1], c[2], 0, 0, 0, b[0], b[1], b[2], 'fixture']); return g; };
  [[names[0], 0, 3.4], [names[1], 3.5, 3.5]].forEach(([st, z0, h]) => {
    add('IfcWall', st, [10, 0, z0 + h / 2], [20, 0.2, h]); add('IfcWall', st, [10, 20, z0 + h / 2], [20, 0.2, h]); add('IfcWall', st, [0, 10, z0 + h / 2], [0.2, 20, h]); add('IfcWall', st, [20, 10, z0 + h / 2], [0.2, 20, h]);
    add('IfcSlab', st, [10, 10, z0 - 0.1], [20, 20, 0.2]); db.run('INSERT INTO storey_elevation VALUES(?,?)', [st, z0]);
  });
  add('IfcCovering', names[0], [5, 10, 3.0], [10, 20, 0.05]);    // L0 ceiling, half the plan
  add('IfcCovering', names[1], [10, 10, 6.6], [20, 20, 0.05]);   // L1 ceiling, the whole plan
  return db;
}
(async () => {
  const SQL = await initSqlJs();
  // ── R1: the patch = a fresh mine
  if (!TERM_X) incon('R1', 'buildings/Terminal_extracted.db absent: cannot mine to compare');
  else {
    const fresh = cp.execFileSync('node', [path.join(M, 'tools', 'mine_storey_floor.js'), TERM_X, RULES], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const a = new SQL.Database(), b = new SQL.Database(); a.run(fresh); b.run(fs.readFileSync(PATCH, 'utf8'));
    const A = rows(a, 'SELECT storey, floor_z FROM rule_storey_floor ORDER BY storey'), B = rows(b, 'SELECT storey, floor_z FROM rule_storey_floor ORDER BY storey');
    ok('R1 the shipped patch equals a fresh mine of Terminal_extracted.db (per-row floor)', A.length > 0 && JSON.stringify(A) === JSON.stringify(B), A.length + ' rows: ' + A.map(r => r.storey + '=' + r.floor_z).join(', '));
  }
  const stack = await H.loadStack(SQL), DW = stack.DW;
  const openRules = (patched) => { const db = new SQL.Database(new Uint8Array(fs.readFileSync(RULES))); db._dwFile = 'terminal_rules.db'; if (patched) capture(() => DW.applyRulesPatch(db, 'terminal_rules.db', fs.readFileSync(PATCH, 'utf8'))); return db; };
  // ── R3: hand-built two-level building, foreign storey names
  const floors = {}; rows(openRules(true), 'SELECT storey, floor_z FROM rule_storey_floor').forEach(r => { floors[r.storey] = r.floor_z; });
  const srcRows = rows(openRules(false), "SELECT storey_scope s, ifc_class c, z_band_lo lo, z_band_hi hi FROM rule_placement WHERE disc='FP'");
  const run = (patched, names) => { DW.dwOpen(openRules(patched)); DW.dwBorrow('FP', null); const bdb = fixture(SQL, names); return Object.assign(capture(() => DW.__test.placeMeasured('FP', bdb, {})), { bdb }); };
  const on = run(true, ['L0', 'L1']), off = run(false, ['L0', 'L1']);
  const raRows = on.log.filter(l => /§BAND-REANCHOR-ROW /.test(l)), map = (on.log.find(l => /§BAND-REANCHOR FP /.test(l)) || '');
  console.log('  ' + map.slice(0, 600)); raRows.forEach(l => console.log('  ' + l.slice(0, 260)));
  const ra = (on.r.placements || []).filter(p => p.reanchor);
  if (!ra.length) incon('R3', 'no re-anchored placement on the fixture: nothing judged');
  else {
    const tgt = { L0: 0, L1: 3.5 }; let worst = 0, bad = 0;
    ra.forEach(p => { const s = srcRows.find(r => r.s === p.reanchor.from && r.c === p.ifc_class); if (!s) { bad++; return; }
      const exp = tgt[p.storey] + ((s.lo + s.hi) / 2 - floors[p.reanchor.src]); worst = Math.max(worst, Math.abs(p.z - exp)); });
    ok('R3a every re-anchored device sits at target floor + (band mid - source floor)', bad === 0 && worst < 1e-6, ra.length + ' devices, worst |dz|=' + worst.toExponential(2) + ', unmatched=' + bad);
    const multi = raRows.filter(l => /reason=multi-storey/.test(l)).length, none = raRows.filter(l => /reason=no storey of this building/.test(l)).length;
    ok('R3b a multi-storey scope is not placed; storeys past the target\'s two levels map to none', multi >= 1 && none >= 1 && /Aras 02->none/.test(map), 'multi=' + multi + ' noTarget=' + none);
    ok('R3c RED: patch off -> rule off, logged, nothing re-anchored', /§BAND-REANCHOR FP off reason=no-source-floors/.test(off.log.join('\n')) && !(off.r.placements || []).some(p => p.reanchor), 'off placements=' + (off.r.placements || []).length);
  }
  // ── R4 + R5: the host pass on the same devices
  DW.dwOpen(openRules(true)); DW.dwBorrow('FP', null);
  const shims = rows(openRules(true), "SELECT * FROM rule_shim WHERE disc='FP'");
  if (!ra.length) incon('R4', 'no re-anchored devices to host');
  else {
    const h1 = capture(() => DW.__test.bandHostPass('FP', JSON.parse(JSON.stringify(on.r.placements)), on.bdb, shims, null, null, {}, 'fixture'));
    const h0 = capture(() => DW.__test.bandHostPass('FP', JSON.parse(JSON.stringify(on.r.placements)).map(p => { delete p.reanchor; return p; }), on.bdb, shims, null, null, {}, 'fixture'));
    const a1 = h1.r.refusedNoHost, a0 = h0.r.refusedNoHost, sum = a => a.bound + a.unhosted + a.notJudged + a.refused;
    console.log('  ' + (h1.log.find(l => /§WALK-BAND-NOHOST/.test(l)) || '').slice(0, 400)); console.log('  ' + (h0.log.find(l => /§WALK-BAND-NOHOST/.test(l)) || '').slice(0, 400));
    ok('R4a re-anchored + no host -> refused, counted as reanchorNoHost; none left unhosted', (a1.reanchorNoHost || 0) > 0 && a1.unhosted === 0, 'reanchorNoHost=' + a1.reanchorNoHost + ' unhosted=' + a1.unhosted + ' bound=' + a1.bound);
    // without the mark, §10 holds: ceiling-hosted devices with no host become 'unhosted' (kept); wall-hosted ones are refused as before (§10 rule 3)
    ok('R4b the same devices WITHOUT the mark keep §10: ceiling ones unhosted and kept, wall ones refused as before', a0.unhosted > 0 && a0.unhosted === (a1.reanchorNoHost || 0) - a0.refused && !(a0.reanchorNoHost) && a0.bound === a1.bound, 'unhosted=' + a0.unhosted + ' refused=' + a0.refused + ' (with mark: reanchorNoHost=' + a1.reanchorNoHost + ') bound=' + a0.bound);
    const bst = h1.r.placements.filter(p => p.hostState === 'bound' && p.reanchor), okSt = bst.every(p => p.storey === 'L0' || p.storey === 'L1');
    ok('R4c a bound re-anchored device takes its host\'s storey (this building\'s)', bst.length > 0 && okSt, bst.length + ' bound, storeys=' + JSON.stringify([...new Set(bst.map(p => p.storey))]));
    ok('R5 accounting: input = bound + unhosted + notJudged + refused (both runs)', a1.input === sum(a1) && a0.input === sum(a0), 'with=' + a1.input + '=' + sum(a1) + ' without=' + a0.input + '=' + sum(a0));
  }
  // ── R2: Terminal on its own rules: the rule does not fire, placements identical
  const TA = path.join(M, 'Terminal_ARC.db');
  if (!fs.existsSync(TA) || fs.statSync(TA).size < 1e6) incon('R2', 'modeller/Terminal_ARC.db absent or a stub');
  else {
    const buf = new Uint8Array(fs.readFileSync(TA)), w = patched => { DW.dwOpen(openRules(patched)); DW.dwBorrow('FP', null); return capture(() => H.walkLive(SQL, stack, 'FP', buf, 'Terminal', [])); };
    const a = w(true), b = w(false), key = x => JSON.stringify((x.r.placements || []).map(p => [p.ifc_class, +(+p.x).toFixed(6), +(+p.y).toFixed(6), +(+p.z).toFixed(6), p.prov, p.storey, p.hostState]));
    const off2 = a.log.find(l => /§BAND-REANCHOR FP /.test(l)) || 'no §BAND-REANCHOR line';
    ok('R2 Terminal on its own rules: rule off (own storeys), FP placements byte-identical with and without the patch', /off reason=own-storeys/.test(off2) && key(a) === key(b) && (a.r.placements || []).length > 0, (a.r.placements || []).length + ' placements; ' + off2.slice(0, 140));
  }
  const v = fail ? 'FAIL' : (pass ? (inc ? 'PASS-WITH-INCONCLUSIVE' : 'PASS') : 'INCONCLUSIVE');
  console.log('§W-BAND-REANCHOR ' + v + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc);
})().catch(e => { console.log('§W-BAND-REANCHOR CRASH ' + (e.stack || e)); process.exit(2); });
