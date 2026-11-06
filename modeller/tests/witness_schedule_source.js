#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-SCHED-SOURCE, prompts/DISC_WALK_SCHEDULE_SOURCE.md. Read the log after every run.
// ISSUE THIS PROVES OR DISPROVES: a complex-class building's rules hold no room schedules, so room type never mattered in its walk. Reading schedules from a named set
// must serve typed rooms, must leave a building with nothing typed exactly as it walks today, must never fill a room twice, and must not move the class rules. Generic: no project's names.
// Runs the SHIPPED dwWalk on the real rules DBs and real buildings. Command: NODE_PATH=~/bim-compiler/node_modules node modeller/tests/witness_schedule_source.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const initSqlJs = require('sql.js');
const ROOT = path.join(__dirname, '..', '..'), DW = require(path.join(ROOT, 'modeller', 'disc_walker.js')), WR = require(path.join(ROOT, 'common', 'walk_rules.js'));
const B = path.join(process.env.DATA_ROOT || path.join(os.homedir(), 'bim-ootb'), 'buildings');
let fail = 0, pass = 0; const log0 = console.log; const say = (...a) => log0(...a);
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; say((ok ? '  PASS ' : '  ✗ FAIL ') + name + ' got=' + JSON.stringify(got) + (ok ? '' : ' want=' + JSON.stringify(want))); };
const inconclusive = m => { fail++; say('  ✗ FAIL INCONCLUSIVE: ' + m); };
const sig = w => JSON.stringify((w.placements || []).map(p => [p.device || p.ifc_class, +(+p.x).toFixed(3), +(+p.y).toFixed(3), +(+p.z).toFixed(3)]));
let lines = [];
const walk = (d, b, name) => { lines = []; console.log = (...x) => { const t = x.join(' '); if (/§DW-SCHED|§DW-SPACE-TYPE/.test(t)) lines.push(t); }; const r = DW.dwWalk(d, b, name, { schedule: true }); console.log = log0; return r; };
(async () => {
  const SQL = await initSqlJs(), load = f => new SQL.Database(new Uint8Array(fs.readFileSync(f)));
  const term = load(path.join(ROOT, 'modeller', 'terminal_rules.db')), dup = load(path.join(ROOT, 'modeller', 'duplex_rules.db')); dup._dwFile = 'duplex_rules.db'; term._dwFile = 'terminal_rules.db';
  const hold = n => { const p = path.join(B, n); return fs.existsSync(p) && fs.statSync(p).size > 1e5 ? load(p) : null; };
  DW.dwOpen(term); DW.dwScheduleSource(null);
  const DISC = ['ELEC', 'ACMV', 'PLB'];
  say('S1 no source: complex class measured; its rules hold no schedule tables');
  const hasT = term.exec("SELECT 1 FROM sqlite_master WHERE name='rule_space_schedule'").length; eq('primary has schedule tables', hasT, 0);
  const T = hold('Terminal_extracted.db'); if (!T) { inconclusive('no building without spaces held'); process.exit(1); }
  const base = {}; DISC.forEach(d => { base[d] = walk(d, T, 'Terminal'); say('  ' + d + ' mode=' + base[d].mode + ' placed=' + base[d].placed + ' refused=' + !!base[d].refused); });
  eq('ELEC measured', base.ELEC.mode, 'measured-band'); eq('walk judged something', base.ELEC.placed > 0, true);
  say('S2 source set, building with no spaces: identical');
  DW.dwScheduleSource(dup); DISC.forEach(d => { const r = walk(d, T, 'Terminal'); eq(d + ' identical, ' + (r.placed || 0), sig(r) === sig(base[d]), true); });
  say('S3 source set, spaces present but none typed: identical');
  DW.dwScheduleSource(null); const T3 = hold('Terminal_extracted.db');
  ['n1', 'n2', 'n3'].forEach((g, i) => { T3.run("INSERT INTO elements_meta (guid,ifc_class,element_name,discipline,storey) VALUES ('" + g + "','IfcSpace','01-1" + i + "','ARC','L1')"); T3.run("INSERT INTO element_transforms (guid,center_x,center_y,center_z,bbox_x,bbox_y,bbox_z) VALUES ('" + g + "'," + i * 20 + ",0,1.4,6,6,3)"); });
  const b3 = walk('ELEC', T3, 'Terminal'); DW.dwScheduleSource(dup); const c3 = walk('ELEC', T3, 'Terminal');
  eq('spaces judged', (lines.join(' ').match(/spaces=(\d+)/) || [])[1], '3'); eq('nothing typed, placements identical, ' + (c3.placed || 0), sig(c3) === sig(b3), true); eq('mode stays measured', c3.mode, b3.mode); T3.close();
  say('S4 a residence with its own schedules: the source is ignored');
  const DX = hold('Duplex_extracted.db');
  if (DX) { DW.dwOpen(dup); DW.dwScheduleSource(null); const a = walk('ACMV', DX, 'Duplex'); DW.dwScheduleSource(term); const b = walk('ACMV', DX, 'Duplex'); eq('identical, ' + (b.placed || 0), sig(a) === sig(b) && b.placed > 0, true); eq('no schedFrom', (b.placements || []).some(p => p.schedFrom), false); eq('residence keeps its 21 rooms', DW.placeSchedule('ACMV', DX).spaces, 21); DX.close(); } else inconclusive('residence not held');
  say('S5 a labelled complex building: typed rooms take the schedule, bands take the rest, never both');
  DW.dwOpen(term); const C = hold('Clinic_extracted.db');
  if (C) {
    const spaces = DW.spacesOf(C);
    DW.dwScheduleSource(null); const m0 = {}; ['ELEC', 'ACMV'].forEach(d => { m0[d] = walk(d, C, 'Clinic'); });
    DW.dwScheduleSource(dup);
    ['ELEC', 'ACMV'].forEach(d => {
      const r = walk(d, C, 'Clinic'), sch = r.placements.filter(p => p.schedFrom), band = r.placements.filter(p => !p.schedFrom);
      lines.filter(l => /§DW-SCHED-SOURCE disc|§DW-SCHED-MIXED/.test(l)).forEach(l => say('  ' + l.slice(0, 170)));
      say('  ' + d + ' before: ' + m0[d].mode + ' placed=' + m0[d].placed + '  after: ' + r.mode + ' placed=' + r.placed + ' schedule=' + sch.length + ' bands=' + band.length);
      eq(d + ' mode', r.mode, 'schedule+measured'); eq(d + ' has schedule placements', sch.length > 0, true); eq(d + ' keeps bands', band.length > 0, true);
      eq(d + ' every schedule placement names its source', sch.every(p => p.schedFrom === 'duplex_rules.db'), true);
      const served = new Set(sch.map(p => p.spaceGuid)), sv = spaces.filter(s => served.has(s.guid));
      const inRoom = band.filter(p => sv.some(s => p.x >= s.x0 && p.x <= s.x1 && p.y >= s.y0 && p.y <= s.y1 && p.z >= s.z0 && p.z <= s.z1) && !p.host && !p.hostGuid);
      eq(d + ' unbound band placements inside a served room', inRoom.length, 0);
      eq(d + ' every schedule placement inside its own room', sch.every(p => { const s = spaces.find(q => q.guid === p.spaceGuid); return s && p.x >= s.x0 - 1 && p.x <= s.x1 + 1 && p.y >= s.y0 - 1 && p.y <= s.y1 + 1; }), true);
    });
    say('S9 a federated room is served once');
    DW.dwScheduleSource(dup); const ps9 = (() => { console.log = () => {}; const r = DW.placeSchedule('ELEC', C); console.log = log0; return r; })();
    const box = q => [q.x0, q.y0, q.x1, q.y1, q.z0].map(v => Math.round(v * 2) / 2).join(','), rooms9 = new Set(ps9.served.map(box));
    eq('rows held', spaces.length > ps9.spaces, true); eq('served rooms have distinct boxes', rooms9.size, ps9.served.length); say('  rows=' + spaces.length + ' rooms=' + ps9.spaces + ' served=' + ps9.served.length);
    say('S7 red control: source cleared, the same building returns to its measured walk exactly');
    DW.dwScheduleSource(null); ['ELEC', 'ACMV'].forEach(d => { const r = walk(d, C, 'Clinic'); eq(d + ' back to measured, ' + (r.placed || 0), [r.mode, sig(r) === sig(m0[d])], ['measured-band', true]); });
    C.close();
  } else inconclusive('labelled complex building not held');
  say('S6 class rules unchanged with a source set');
  const prim = () => JSON.stringify([DW.repRules('ELEC').length, term.exec("SELECT COUNT(*) FROM rule_routing")[0].values[0][0], term.exec("SELECT COUNT(*) FROM rule_placement")[0].values[0][0]]);
  DW.dwScheduleSource(null); const p0 = prim(); DW.dwScheduleSource(dup); eq('primary reads', prim(), p0); DW.dwScheduleSource(null);
  say('S8 one owner');
  eq('complex takes the source', WR.scheduleDb('Clinic_ARC.db'), 'duplex_rules.db'); eq('any unnamed building too', WR.scheduleDb('Some Project'), 'duplex_rules.db'); eq('residence none', WR.scheduleDb('Duplex'), null); eq('farm none', WR.scheduleDb('Shed'), null);
  eq('class rules not switched', [WR.rulesDb('Some Project'), WR.rulesDb('Duplex'), WR.rulesDb('Shed')], ['terminal_rules.db', 'duplex_rules.db', 'farm_rules.db']);
  const html = fs.readFileSync(path.join(ROOT, 'modeller', 'modeller.html'), 'utf8');
  eq('walk loads the source through the owner', /dwScheduleSourceFile\(window\.SQL, window\._DW_BASE, window\.WalkRules\.scheduleDb\(/.test(html), true);
  eq('mesh path follows the source', /_DW_RULES_SOURCE\[window\.WalkRules\.scheduleDb\(window\.__dwName\)\]/.test(html), true);
  say('§W-SCHED-SOURCE ' + (fail ? 'FAIL' : 'PASS') + ' pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})();
