#!/usr/bin/env node
// # ⚠ DO NOT REMOVE — W-RULES-FLEET, prompts/MODELLER_RULES_EDITOR.md §CLASS-SHARED (c2). Read the log after every run; exit code is not evidence.
// ISSUE IT EXPOSES: a rules edit made on one building was never walked on the other buildings that read the same file, so nobody
// could say what it moves. The fleet check must (F1) move nothing for an empty edit on either shared file, (F2) move exactly the
// devices of the edited row on the building it was made on, list every reader and fill checkedOn, and (F3) count a stale cell as
// skipped while moving nothing for it (F2 and F3 run as one edit: the real cell + a cell on a row that does not exist).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const CHECK = path.join(__dirname, 'rules_edit_fleet_check.js'), TAG = '§W-RULES-FLEET';
let fail = 0, judged = 0; const ok = (id, c, m) => { judged++; if (!c) fail++; console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wrfleet-'));
const run = (doc, name) => { const f = path.join(tmp, name + '.json'); fs.writeFileSync(f, JSON.stringify(doc));
  const r = cp.spawnSync(process.execPath, [CHECK, f], { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 3600000 });
  (r.stdout || '').split('\n').filter(l => /§RULES-FLEET (done|FAIL|ERROR|skip)/.test(l)).forEach(l => console.log('  ' + l.slice(0, 300)));
  const out = path.join(tmp, name + '.checked.json'); return fs.existsSync(out) ? JSON.parse(fs.readFileSync(out)) : null; };

(async () => {
  // F1 — empty edit on each shared file
  for (const file of ['duplex_rules.db', 'terminal_rules.db']) {
    const o = run({ rulesFile: file, checkedOn: [], cells: {} }, 'empty_' + file.replace('.db', ''));
    const rows = o ? o.fleet : [], placed = rows.reduce((s, r) => s + r.placedBefore, 0), mv = rows.reduce((s, r) => s + r.moved, 0);
    console.log(TAG + ' F1 ' + file + ' readers=' + (o ? o.checkedOn.join(',') : '-') + ' roles=' + JSON.stringify(Array.from(new Set(rows.map(r => r.building + ':' + r.role)))) + ' walks=' + rows.length + ' placed=' + placed);
    if (!o || !placed) { console.log(TAG + ' F1 ' + file + ' VACUOUS (no walk placed anything)'); continue; }
    ok('F1 EMPTY-EDIT ' + file + ' (every reader walked, nothing moved)', mv === 0 && rows.every(r => !r.err) && o.checkedOn.length > 0, 'readers=' + o.checkedOn.length + ' walks=' + rows.length + ' moved=' + mv);
  }

  // F2/F3 — pick the one schedule row behind a placed Duplex ELEC device (same pick as W-E2E-RULES-EDIT), +0.5 m, plus a stale cell
  const initSqlJs = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'sql.js')), H = require('./walk_node_harness.js');
  const SQL = await initSqlJs(), stack = await H.loadStack(SQL), real = console.log; console.log = () => {};
  H.openBuildingRules(SQL, stack, 'Duplex'); const raw = new Uint8Array(fs.readFileSync(path.join(__dirname, '..', 'Duplex_ARC.db')));
  const w = H.walkLive(SQL, stack, 'ELEC', raw, 'Duplex', [], {}); console.log = real;
  const db = stack.DW.rulesDb(); let pick = null;
  for (const p of (w.placements || [])) { if (!p.device || !/^sched:space-schedule:/.test(p.prov || '')) continue; const rule = p.prov.split(':').pop();
    const rs = db.exec("SELECT rowid, z_offset_m FROM rule_space_schedule WHERE disc='ELEC' AND device_id='" + p.device + "' AND placement_rule='" + rule + "'");
    if (rs.length && rs[0].values.length === 1) { pick = { rowid: rs[0].values[0][0], z0: rs[0].values[0][1], device: p.device, rule }; break; } }
  if (!pick) { console.log(TAG + ' F2 INCONCLUSIVE no placed Duplex ELEC device maps to one schedule row'); }
  else {
    const expect = (w.placements || []).filter(p => p.device === pick.device && (p.prov || '').split(':').pop() === pick.rule).length;
    const stale = 'rule_space_schedule:' + (db.exec('SELECT MAX(rowid) FROM rule_space_schedule')[0].values[0][0] + 1000);
    const cells = { ['rule_space_schedule:' + pick.rowid]: { z_offset_m: +(pick.z0 + 0.5).toFixed(6) }, [stale]: { z_offset_m: 9 } };
    console.log(TAG + ' F2 pick ' + JSON.stringify(pick) + ' expectMoved=' + expect + ' stale=' + stale);
    const o = run({ rulesFile: 'duplex_rules.db', buildingClass: 'residential', checkedOn: [], cells }, 'one_cell');
    const rows = o ? o.fleet : [], dx = rows.filter(r => r.building === 'Duplex'), elec = dx.find(r => r.disc === 'ELEC') || {};
    rows.filter(r => r.moved).forEach(r => console.log(TAG + ' F2 moved building=' + r.building + ' role=' + r.role + ' disc=' + r.disc + ' moved=' + r.moved + ' of ' + r.placedBefore));
    ok('F2 ONE-CELL (Duplex ELEC moves exactly the devices of that row, its other services none; checkedOn = the readers walked)',
      !!o && elec.moved === expect && expect > 0 && dx.filter(r => r.disc !== 'ELEC').every(r => r.moved === 0) && o.checkedOn.length === new Set(rows.map(r => r.building)).size && o.checkedOn.indexOf('Duplex') >= 0,
      'ELEC moved=' + elec.moved + ' expect=' + expect + ' readers=' + (o ? o.checkedOn.join(',') : '-') + ' movedRows=' + rows.filter(r => r.moved).length);
    ok('F3 STALE-CELL (the row that does not exist is counted skipped; applied = 1 on every reader)', rows.length > 0 && rows.every(r => r.skipped === 1 && r.cellsApplied >= 1), 'skipped=' + JSON.stringify(Array.from(new Set(rows.map(r => r.skipped)))) + ' applied=' + JSON.stringify(Array.from(new Set(rows.map(r => r.cellsApplied)))));
  }
  console.log(TAG + ' SUMMARY fail=' + fail + ' judged=' + judged);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(TAG + ' ERROR ' + (e && e.stack || e)); process.exit(1); });
