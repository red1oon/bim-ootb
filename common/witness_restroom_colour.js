'use strict';
// ⚠ DO NOT REMOVE
// SCOPE: W-RESTROOM-COLOUR — proves RH.classifyRestroom() (room_habitability.js, drives the new
// brown 'restroom' shell hue in navigate_find.js §RESTROOM-CLASS) tags exactly the real wet
// sanitary rooms and nothing else. Ground truth: Duplex_extracted.db has 4 bathroom IfcSpaces
// (object_type 'Bathroom 1'/'Bathroom 2' on A104/A204/B104/B204); Kitchen/Bedroom/Living/Foyer/
// Hallway/Utility/Stair/Roof must NOT match. Label is built EXACTLY as navigate_find.js builds
// g.label: [object_type, predefined_type, name] filtered+joined. Read the log — exit code alone is
// not evidence.
const fs = require('fs');
const initSqlJs = require('/home/red1/bim-compiler/node_modules/sql.js');
const RH = require('./room_habitability.js');
const DB = '/home/red1/bim-compiler/deploy/buildings/Duplex_extracted.db';

// human ground truth: which room NUMBERS (name) are real restrooms
const TRUTH_RESTROOM = new Set(['A104', 'A204', 'B104', 'B204']); // the 4 Bathroom rooms

(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(DB)));
  const r = db.exec("SELECT object_type, predefined_type, name FROM spatial_structure WHERE type='IfcSpace' ORDER BY name");
  db.close();
  const rows = r.length ? r[0].values : [];
  let tp = 0, fp = 0, fn = 0, tn = 0;
  rows.forEach(([ot, pt, nm]) => {
    const label = [ot, pt, nm].filter(Boolean).join(' ');   // == navigate_find.js g.label
    const got = RH.classifyRestroom(label);
    const truth = TRUTH_RESTROOM.has(nm);
    const mark = got === truth ? 'ok ' : 'ERR';
    if (got && truth) tp++; else if (got && !truth) fp++; else if (!got && truth) fn++; else tn++;
    console.log(`§W-RESTROOM ${mark} name=${nm} label="${label}" -> restroom=${got} (truth=${truth})`);
  });
  const pass = fp === 0 && fn === 0 && tp === TRUTH_RESTROOM.size;
  console.log(`§W-RESTROOM SUMMARY restrooms=${tp} falsePos=${fp} falseNeg=${fn} clean=${tn} -> ${pass ? 'PASS' : 'FAIL'}`);
  process.exit(pass ? 0 : 1);
})();
