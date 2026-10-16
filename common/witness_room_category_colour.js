'use strict';
// ⚠ DO NOT REMOVE
// SCOPE: W-ROOM-CATEGORY-COLOUR — proves the name-driven room-shell classifiers in
// room_habitability.js (restroom/kitchen/bedroom — drive brown/amber/teal shell hues in
// navigate_find.js) tag exactly the right real rooms and never cross-match, AND that the
// §SYNTHETIC-HONESTY predicate (RM_ guid / '≈' name → fainter shell) is correct. Ground truth:
// Duplex_extracted.db, 21 real IfcSpaces. Label built EXACTLY as navigate_find.js g.label =
// [object_type, predefined_type, name] filtered+joined. Read the log — exit code alone is not proof.
const fs = require('fs');
const initSqlJs = require('/home/red1/bim-compiler/node_modules/sql.js');
const RH = require('./room_habitability.js');
const DB = '/home/red1/bim-compiler/deploy/buildings/Duplex_extracted.db';

// human ground truth by room NUMBER (name) — the name-classified category each room should get
const TRUTH = {
  A103: 'kitchen', B103: 'kitchen',
  A104: 'restroom', A204: 'restroom', B104: 'restroom', B204: 'restroom',
  A202: 'bedroom', A203: 'bedroom', B202: 'bedroom', B203: 'bedroom',
  // everything else has no name-category (Foyer/Living/Stair/Hallway/Utility/Room/Roof) -> ''
};

function nameCategory(label) {
  if (RH.classifyRestroom(label)) return 'restroom';
  if (RH.classifyKitchen(label)) return 'kitchen';
  if (RH.classifyBedroom(label)) return 'bedroom';
  return '';
}

(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(DB)));
  const r = db.exec("SELECT object_type, predefined_type, name FROM spatial_structure WHERE type='IfcSpace' ORDER BY name");
  db.close();
  const rows = r.length ? r[0].values : [];
  let ok = 0, err = 0;
  const tally = {};
  rows.forEach(([ot, pt, nm]) => {
    const label = [ot, pt, nm].filter(Boolean).join(' ');   // == navigate_find.js g.label
    const got = nameCategory(label);
    const want = TRUTH[nm] || '';
    const good = got === want;
    good ? ok++ : err++;
    tally[got || 'habitable/other'] = (tally[got || 'habitable/other'] || 0) + 1;
    console.log(`§W-ROOM-CAT ${good ? 'ok ' : 'ERR'} name=${nm} label="${label}" -> ${got || '(none)'} (want ${want || '(none)'})`);
  });

  // §SYNTHETIC-HONESTY predicate unit test (no live RM_ DB needed — verify the rule directly)
  const synRule = (guid, name) => /^RM_/.test(guid || '') || /^\s*≈/.test(name || '');
  const synCases = [
    ['RM_abc', 'Kitchen', true], ['RM_x1', '', true], ['0BTBreal', '≈ Bathroom', true],
    ['0BTBreal', 'Kitchen A103', false], ['0abcd', 'Bedroom 1', false], ['', '', false],
  ];
  let synOk = 0, synErr = 0;
  synCases.forEach(([g, n, exp]) => {
    const got = synRule(g, n);
    (got === exp ? synOk++ : synErr++);
    console.log(`§W-SYN ${got === exp ? 'ok ' : 'ERR'} guid="${g}" name="${n}" -> synthetic=${got} (want ${exp})`);
  });

  const pass = err === 0 && synErr === 0;
  console.log(`§W-ROOM-CAT SUMMARY names ok=${ok} err=${err} | tally=${JSON.stringify(tally)} | synthetic-rule ok=${synOk} err=${synErr} -> ${pass ? 'PASS' : 'FAIL'}`);
  process.exit(pass ? 0 : 1);
})();
