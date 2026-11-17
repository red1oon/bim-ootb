#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — W-PARTS-VIEW, prompts/VIEWER_ELEMENT_PARTS.md. Read the log after every run; exit code is not evidence.
// ISSUE IT EXPOSES: "a host and its parts are drawn in the same place, so the parts are invisible" (the viewer never read element_parts).
// P1 HIDE (hosts out of the keep set, parts + unrelated in) · P2 ORPHAN (child absent -> parent stays, orphanLinks) · P3 VACUOUS (no table -> says so, hides nothing)
// P4 RESTORE (partsView(false) returns the previous isolate object) · P5 REAL ($PARTS_REAL_DB, read-only, optional).
// PARTS_VIEW_BREAK=1 puts the hosts back into the keep set: P1 (and P5) must FAIL. Node only, no browser. Verdict is INCONCLUSIVE, never PASS, when a leg judged nothing.
// Usage: NODE_PATH=~/bim-compiler/node_modules node viewer/tests/witness_parts_view.js > log 2>&1
'use strict';
const path = require('path'), fs = require('fs');
const NM = path.join(process.env.HOME, 'bim-compiler', 'node_modules');
const initSqlJs = require(path.join(NM, 'sql.js')), Database = require(path.join(NM, 'better-sqlite3'));
const PV = require(path.join(__dirname, '..', 'parts_view.js'));
const BREAK = process.env.PARTS_VIEW_BREAK === '1';
let pass = 0, fail = 0, inc = 0;
const ok = (id, cond, msg) => { console.log('§' + (cond ? 'PASS' : 'FAIL') + ' ' + id + ' | ' + (msg || '')); cond ? pass++ : fail++; return cond; };
const incon = (id, why) => { console.log('§INCONCLUSIVE ' + id + ' | ' + why); inc++; };
// the break: the shipped keep set, with every host put back in (what a viewer that ignored the rule would draw)
const keepSet = (rows, all) => { const r = PV.partsKeepSet(rows, all); if (BREAK) rows.forEach(x => { if (all.has(x.parent_guid)) r.keep.add(x.parent_guid); }); return r; };
const eqSet = (s, arr) => s.size === arr.length && arr.every(g => s.has(g));

(async () => {
  console.log('§W-PARTS-VIEW start break=' + BREAK);
  const SQL = await initSqlJs();
  // a stub of the one thing parts_view.js needs from the viewer: A.db, A.filterByGuids, A.activeGuidFilter (filterByGuids sets it, as panels.js:862-863 does)
  const mk = (db) => { const A = { db, activeGuidFilter: null, calls: [] }; A.filterByGuids = g => { A.activeGuidFilter = g; A.calls.push(g); }; PV.setupPartsView(A); return A; };
  const logs = []; const _l = console.log; const cap = fn => { console.log = (...a) => { logs.push(a.join(' ')); _l(...a); }; try { return fn(); } finally { console.log = _l; } };
  const build = (elems, parts) => {
    const db = new SQL.Database();
    db.run('CREATE TABLE elements_meta (guid TEXT, ifc_class TEXT)');
    elems.forEach(e => db.run('INSERT INTO elements_meta VALUES (?,?)', e));
    if (parts) { db.run('CREATE TABLE element_parts (parent_guid TEXT, child_guid TEXT, parent_class TEXT, child_class TEXT)'); parts.forEach(p => db.run('INSERT INTO element_parts VALUES (?,?,?,?)', p)); }
    return db;
  };
  // fixture: 3 hosts (2,3,1 parts) + 2 unrelated = 11 elements
  const E = [['H1', 'IfcWall'], ['H2', 'IfcWall'], ['H3', 'IfcSlab'], ['a1', 'IfcBuildingElementPart'], ['a2', 'IfcBuildingElementPart'], ['b1', 'IfcBuildingElementPart'], ['b2', 'IfcBuildingElementPart'], ['b3', 'IfcBuildingElementPart'], ['c1', 'IfcBuildingElementPart'], ['U1', 'IfcDoor'], ['U2', 'IfcWindow']];
  const P = [['H1', 'a1', 'IfcWall', 'IfcBuildingElementPart'], ['H1', 'a2', 'IfcWall', 'IfcBuildingElementPart'], ['H2', 'b1', 'IfcWall', 'IfcBuildingElementPart'], ['H2', 'b2', 'IfcWall', 'IfcBuildingElementPart'], ['H2', 'b3', 'IfcWall', 'IfcBuildingElementPart'], ['H3', 'c1', 'IfcSlab', 'IfcBuildingElementPart']];

  // P1 HIDE — through the A.partsView wiring (reads the DB, calls the generic isolate, logs)
  { const A = mk(build(E, P)); const all = new Map(E);
    const r = PV.partsKeepSet(P.map(p => ({ parent_guid: p[0], child_guid: p[1], parent_class: p[2] })), all);
    if (BREAK) { P.forEach(p => r.keep.add(p[0])); }   // the break, same as keepSet()
    let res; cap(() => { res = A.partsView(true); });
    const used = BREAK ? r.keep : A.calls[0];
    ok('P1 HIDE', !!used && !['H1', 'H2', 'H3'].some(h => used.has(h)) && ['a1', 'a2', 'b1', 'b2', 'b3', 'c1', 'U1', 'U2'].every(g => used.has(g)) && used.size === 8,
      'keep=' + (used ? used.size : 'none') + ' (want 8: 6 parts + 2 others, 0 hosts) hosts-in-keep=' + (used ? ['H1', 'H2', 'H3'].filter(h => used.has(h)).join(',') || 'none' : '?') + (BREAK ? ' [BREAK: hosts re-added]' : ''));
    const line = logs.find(l => l.startsWith('§PARTS_VIEW '));
    ok('P1 LOG', line === '§PARTS_VIEW hostsHidden=3 partsShown=6 elements=11 byHostClass={"IfcWall":2,"IfcSlab":1}', 'line=' + line);
    ok('P1 ISOLATE-USED', A.calls.length === 1 && A.activeGuidFilter instanceof Set, 'filterByGuids calls=' + A.calls.length);
  }

  // P2 ORPHAN
  { const A = mk(build([['H1', 'IfcWall'], ['H2', 'IfcWall'], ['a1', 'IfcBuildingElementPart']], [['H1', 'a1', 'IfcWall', 'x'], ['H2', 'gone', 'IfcWall', 'x']]));
    logs.length = 0; cap(() => A.partsView(true)); const r = keepSet([{ parent_guid: 'H1', child_guid: 'a1' }, { parent_guid: 'H2', child_guid: 'gone' }], new Map([['H1', 'IfcWall'], ['H2', 'IfcWall'], ['a1', 'x']]));
    const k = BREAK ? r.keep : A.activeGuidFilter;
    ok('P2 ORPHAN', k && k.has('H2') && !k.has('H1') && k.has('a1') && r.orphanLinks === 1 && /orphanLinks=1/.test(logs.join('\n')), 'H2 (child absent) kept=' + (k && k.has('H2')) + ' H1 hidden=' + (k && !k.has('H1')) + ' orphanLinks=' + r.orphanLinks);
  }

  // P3 VACUOUS
  { const A = mk(build([['U1', 'IfcDoor']], null)); logs.length = 0; let res; cap(() => { res = A.partsView(true); });
    ok('P3 VACUOUS', logs.some(l => l === '§PARTS_VIEW VACUOUS (no element_parts rows: nothing hidden)') && A.calls.length === 0 && res === null, 'calls=' + A.calls.length + ' log=' + logs[0]);
    const A2 = mk(build([['U1', 'IfcDoor']], [])); logs.length = 0; cap(() => A2.partsView(true));
    ok('P3 VACUOUS-EMPTY-TABLE', logs.some(l => /^§PARTS_VIEW VACUOUS/.test(l)) && A2.calls.length === 0, 'empty table: calls=' + A2.calls.length);
  }

  // P4 RESTORE
  { const A = mk(build(E, P)); const prev = new Set(['U1']); A.activeGuidFilter = prev; cap(() => { A.partsView(true); A.partsView(true); }); const during = A.activeGuidFilter;
    cap(() => A.partsView(false));
    ok('P4 RESTORE', during !== prev && A.activeGuidFilter === prev && A.calls.length === 2 /* on once (2nd on ignored) + off */, 'restored the SAME previous object=' + (A.activeGuidFilter === prev) + ' calls=' + A.calls.length);
    const B = mk(build(E, P)); cap(() => { B.partsView(true); B.partsView(false); }); ok('P4 RESTORE-ALL', B.activeGuidFilter === null, 'no previous isolate -> null (all)');
  }

  // P5 REAL (optional)
  if (!process.env.PARTS_REAL_DB) { incon('P5 REAL', 'PARTS_REAL_DB not set (optional leg skipped; nothing judged)'); }
  else {
    const db = new Database(process.env.PARTS_REAL_DB, { readonly: true, fileMustExist: true });
    const rows = db.prepare('SELECT parent_guid, child_guid, parent_class FROM element_parts').all();
    const all = new Map(db.prepare('SELECT guid, ifc_class FROM elements_meta').all().map(r => [r.guid, r.ifc_class]));
    const expHosts = db.prepare('SELECT COUNT(DISTINCT p.parent_guid) n FROM element_parts p WHERE p.parent_guid IN (SELECT guid FROM elements_meta) AND p.child_guid IN (SELECT guid FROM elements_meta)').get().n;
    const expParts = db.prepare('SELECT COUNT(DISTINCT p.child_guid) n FROM element_parts p WHERE p.child_guid IN (SELECT guid FROM elements_meta)').get().n;
    db.close();
    const r = keepSet(rows, all);
    const hostsInKeep = rows.filter(x => all.has(x.parent_guid) && r.keep.has(x.parent_guid)).length;
    console.log('§P5 real db: element_parts rows=' + rows.length + ' elements=' + r.elements + ' hostsHidden=' + r.hostsHidden + ' partsShown=' + r.partsShown + ' orphanLinks=' + r.orphanLinks + ' byHostClass=' + JSON.stringify(r.byHostClass) + ' hostsStillInKeep=' + hostsInKeep + ' (SQL says hosts=' + expHosts + ' parts=' + expParts + ')');
    if (!rows.length) incon('P5 REAL', 'element_parts empty: nothing judged');
    else ok('P5 REAL', r.hostsHidden === expHosts && r.partsShown === expParts && hostsInKeep === 0, 'keep-set counts == independent SQL counts; hostsStillInKeep=' + hostsInKeep);
  }

  console.log('§W-PARTS-VIEW ' + (fail ? 'FAIL' : (inc ? 'INCONCLUSIVE-PARTIAL' : 'PASS')) + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('§W-PARTS-VIEW ERROR ' + e.stack); process.exit(2); });
