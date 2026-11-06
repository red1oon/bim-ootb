#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-SPACE-TYPE-WORDS, prompts/DISC_WALK_SPACE_TYPE_WORDS.md. Read the log after every run.
// ISSUE THIS PROVES OR DISPROVES: a space named qualifier + type ("Staff Toilet") got no type, so the schedule walk silently placed nothing in it,
// and fixing that must not change any label typed today nor type a room wrongly by a loose word match. Generic: no project's names, every mapping is a rules-DB row.
// Runs the SHIPPED _spaceTypeFor / placeSchedule on the real duplex_rules.db. Fleet census over every labelled building DB held, so it cannot pass empty.
// Command: NODE_PATH=~/bim-compiler/node_modules node modeller/tests/witness_space_type_words.js   (EXTRA_DB=a.db:b.db adds private models to W8)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const initSqlJs = require('sql.js');
const ROOT = path.join(__dirname, '..', '..'), DW = require(path.join(ROOT, 'modeller', 'disc_walker.js'));
let fail = 0, pass = 0; const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; console.log((ok ? '  PASS ' : '  ✗ FAIL ') + name + ' got=' + JSON.stringify(got) + (ok ? '' : ' want=' + JSON.stringify(want))); };
const typeOf = (l, d) => DW._spaceTypeFor(d || 'ACMV', { label: l });
(async () => {
  const SQL = await initSqlJs();
  const load = f => new SQL.Database(new Uint8Array(fs.readFileSync(f)));
  const rdb = load(path.join(ROOT, 'modeller', 'duplex_rules.db')); DW.dwOpen(rdb);
  const both = (name, l, t, how) => { eq(name + ' "' + l + '"', [typeOf(l), DW._spaceTypeLastHow()], [t, how]); };
  console.log('W1 exact and alias labels unchanged, step named');
  both('type', 'Bathroom 1', 'BATHROOM', 'exact'); both('alias', 'Foyer', 'LOBBY', 'alias'); both('alias', 'Living Room', 'LIVING', 'alias'); both('alias code', 'MR', 'MASTER_BEDROOM', 'alias');
  console.log('W2 qualifier + type');
  both('qualifier', 'Staff Toilet', 'TOILET', 'word'); both('letter after', 'Stair A', 'STAIR', 'word'); both('numbered', 'Female WC #2', 'BATHROOM', 'word'); both('possessive', "Manager's Office", 'OFFICE', 'word'); both('slash', 'Receiving/Storage', 'STORAGE', 'word'); both('abbrev alias', 'Haz. Stor.', 'STORAGE', 'word');
  console.log('W3 longest run wins');
  both('run', 'Water Tank Pump Room', 'PUMP_ROOM', 'word'); both('run', 'Old Wet Kitchen', 'WET_KITCHEN', 'word');
  console.log('W4 generic noun loses to a specific word');
  both('specific', 'Main Mechanical Room', 'MECHANICAL', 'word'); both('generic alone', 'Meeting Room', 'ROOM', 'word');
  console.log('W5 refused as words: an alias that is the tail of its target, a short code');
  both('tail alias', 'Staff Lounge', null, 'none'); both('exact still works', 'Lounge', 'DEPARTURE_LOUNGE', 'alias'); both('code inside a name', 'MR Plant Area', 'PLANT', 'word'); both('code inside a name', 'CP Area', null, 'none');
  console.log('W6 no word found: untyped, never guessed');
  both('number only', '01-17', null, 'none'); both('unknown', 'Interaction Station', null, 'none'); both('punctuation', '-', null, 'none');
  const am = DW._spaceTypeFor('ACMV', { label: 'Kitchen / Office' }); eq('ambiguous picks the rightmost', am, 'OFFICE');
  both('real type, not generic', 'Staff Kitchen', 'KITCHEN', 'word'); eq('order decides between two real types', DW._spaceTypeFor('ACMV', { label: 'Office / Kitchen' }), 'KITCHEN');
  console.log('W7 red control: the step off restores the old table');
  DW._setSpaceTypeWordOff(true); both('off', 'Staff Toilet', null, 'none'); both('off exact', 'Bathroom 1', 'BATHROOM', 'exact');
  const offT = l => DW._spaceTypeFor('ACMV', { label: l }), census = [], dirs = path.join(process.env.DATA_ROOT || path.join(os.homedir(), 'bim-ootb'), 'buildings');
  DW._setSpaceTypeWordOff(false);
  console.log('W8 every labelled building held: nothing typed today changes');
  const dbs = fs.readdirSync(dirs).filter(f => /\.db$/.test(f)).map(f => path.join(dirs, f)).filter(p => fs.statSync(p).size > 1e5).concat((process.env.EXTRA_DB || '').split(':').filter(Boolean));
  const q = (db, sql) => { try { return cp.execFileSync('sqlite3', ['-readonly', db, sql], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n').filter(Boolean); } catch (e) { return []; } };
  let judged = 0, changed = 0, gained = 0, withL = 0;
  dbs.forEach(db => {
    let L = q(db, "select coalesce(m.element_name,m.guid) from elements_meta m join element_transforms t on m.guid=t.guid where m.ifc_class='IfcSpace' and t.bbox_x>0.1 and t.bbox_y>0.1");
    if (!L.length) L = q(db, "select coalesce(nullif(object_type,''),name) from spatial_structure where type='IfcSpace' and guid not like 'RM\\_%' escape '\\' and name not like '%≈%' and coalesce(size_x,0)>0.1 and coalesce(size_y,0)>0.1");
    if (!L.length) return; withL++;
    let g = 0, t0 = 0, none = 0;
    L.forEach(l => { DW._setSpaceTypeWordOff(true); const a = offT(l); DW._setSpaceTypeWordOff(false); const b = offT(l); judged++; if (a) { t0++; if (a !== b) { changed++; console.log('  CHANGED', l, a, b); } } else if (b) { g++; gained++; } else none++; });
    console.log('  §SPACE_TYPE_CENSUS spaces=' + L.length + ' typed_before=' + t0 + ' gained=' + g + ' none=' + none + (process.env.EXTRA_DB && process.env.EXTRA_DB.includes(db) ? ' (private)' : ' ' + path.basename(db)));
  });
  eq('labels that had a type and changed', changed, 0);
  if (!judged) { console.log('  W8 INCONCLUSIVE: no labelled building found'); fail++; } else console.log('  §SPACE_TYPE_CENSUS buildings=' + withL + ' labels=' + judged + ' gained=' + gained);
  console.log('W9 fully labelled residence: placements identical on and off');
  const dx = path.join(dirs, 'Duplex_extracted.db');
  if (fs.existsSync(dx) && fs.statSync(dx).size > 1e5) {
    const b = load(dx), sig = r => JSON.stringify(r.placements.map(p => [p.device_id || p.ifc_class, +p.x, +p.y, +p.z]));
    ['ACMV', 'ELEC', 'PLB'].forEach(d => { DW._setSpaceTypeWordOff(true); const a = DW.placeSchedule(d, b); DW._setSpaceTypeWordOff(false); const c = DW.placeSchedule(d, b); eq(d + ' placements on=off, ' + c.placements.length, sig(c) === sig(a) && c.placements.length > 0, true); });
    b.close();
  } else { console.log('  W9 INCONCLUSIVE: residence DB not held'); fail++; }
  console.log('W10 the report line adds up; empty building is VACUOUS');
  const s = new SQL.Database(); s.run("CREATE TABLE elements_meta (guid TEXT, ifc_class TEXT, element_name TEXT, discipline TEXT, storey TEXT); CREATE TABLE element_transforms (guid TEXT, center_x REAL, center_y REAL, center_z REAL, bbox_x REAL, bbox_y REAL, bbox_z REAL);");
  [['a', 'Bathroom 1'], ['b', 'Foyer'], ['c', 'Staff Toilet'], ['d', 'Interaction Station'], ['e', '01-17'], ['f', 'Kitchen / Office']].forEach((r, i) => { s.run("INSERT INTO elements_meta VALUES ('" + r[0] + "','IfcSpace','" + r[1] + "','ARC','L1')"); s.run("INSERT INTO element_transforms VALUES ('" + r[0] + "'," + i * 10 + ",0,1.4,4,4,2.6)"); });
  const log0 = console.log; let line = ''; console.log = (...x) => { const t = x.join(' '); if (t.includes('§DW-SPACE-TYPE')) line = t; };
  const rp = DW.placeSchedule('ACMV', s); console.log = log0; console.log('  ' + line);
  const st = rp.spaceTypes; eq('counts', [st.exact, st.alias, st.word, st.none, st.ambiguous], [1, 1, 2, 2, 1]); eq('sum = spaces', st.exact + st.alias + st.word + st.geometry + st.none, rp.spaces); eq('names what it left', rp.skippedSpaces.slice().sort(), ['01-17', 'Interaction Station']);
  const e = new SQL.Database(); e.run("CREATE TABLE elements_meta (guid TEXT, ifc_class TEXT, element_name TEXT, discipline TEXT, storey TEXT); CREATE TABLE element_transforms (guid TEXT, center_x REAL, center_y REAL, center_z REAL, bbox_x REAL, bbox_y REAL, bbox_z REAL);");
  console.log = (...x) => { const t = x.join(' '); if (t.includes('§DW-SPACE-TYPE')) line = t; }; DW.placeSchedule('ACMV', e); console.log = log0; eq('empty says VACUOUS', /VACUOUS/.test(line), true);
  console.log('§W-SPACE-TYPE-WORDS ' + (fail ? 'FAIL' : 'PASS') + ' pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})();
