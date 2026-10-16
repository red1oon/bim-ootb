// witness_containment_alias_js.js — parity check for the room_walker.js port of
// bim-compiler's CONTAINMENT_LTU_STOREY_ALIAS.md fix (§CONTAINMENT-ALIAS).
// Mirrors bim-compiler/scripts/witness_containment_alias.py exactly, against the JS engine
// that actually runs client-side. PASS = same shape as the Python result: total containment
// rows increase, MEP disciplines that were zero become non-zero, room rect count unchanged,
// zero SUSPECT-room leakage.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');

const SRC = process.argv[2] || '/home/red1/bim-compiler/deploy/buildings/LTU_AHouse_extracted.db';
const BASE_REF = process.argv[3] || 'origin/main';

function byDiscipline(db) {
  const q = (sql) => db.exec(sql);
  const rows = q(`SELECT m.discipline, COUNT(*) c FROM rel_contained_in_space rcs
                  JOIN elements_meta m ON m.guid = rcs.element_guid GROUP BY m.discipline`);
  const byDisc = {};
  if (rows.length) rows[0].values.forEach(([d, c]) => { byDisc[d] = c; });
  const total = q(`SELECT COUNT(*) FROM rel_contained_in_space`)[0].values[0][0];
  const rects = q(`SELECT COUNT(*) FROM spatial_structure WHERE type='IfcSpace' AND guid LIKE 'RM\\_%' ESCAPE '\\'`)[0].values[0][0];
  const suspectLeak = q(`SELECT COUNT(*) FROM rel_contained_in_space rcs
                          JOIN spatial_structure ss ON ss.room_guid = rcs.space_guid
                          WHERE ss.predefined_type LIKE 'SUSPECT_%'`)[0].values[0][0];
  return { total, rects, suspectLeak, byDisc };
}

(async () => {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync(SRC);

  // ORIGINAL: fetch pre-fix room_walker.js from BASE_REF, load into an isolated vm-like require
  const tmp = '/tmp/wt-containment-alias-js/.witness-scratch';
  fs.mkdirSync(tmp, { recursive: true });
  const origPath = path.join(tmp, 'room_walker_ORIGINAL.js');
  execSync(`git -C /home/red1/bim-ootb show ${BASE_REF}:viewer/lib/room_walker.js > ${origPath}`);
  delete require.cache[require.resolve(origPath)];
  const RoomWalkerOriginal = require(origPath);

  delete require.cache[require.resolve('/tmp/wt-containment-alias-js/viewer/lib/room_walker.js')];
  const RoomWalkerCurrent = require('/tmp/wt-containment-alias-js/viewer/lib/room_walker.js');

  const dbBefore = new SQL.Database(new Uint8Array(buf));
  RoomWalkerOriginal.walk(dbBefore, { write: true });
  const b = byDiscipline(dbBefore);

  const dbAfter = new SQL.Database(new Uint8Array(buf));
  RoomWalkerCurrent.walk(dbAfter, { write: true });
  const a = byDiscipline(dbAfter);

  console.log('BEFORE: total=' + b.total + ' rects=' + b.rects + ' suspectLeak=' + b.suspectLeak + ' byDisc=' + JSON.stringify(b.byDisc));
  console.log('AFTER:  total=' + a.total + ' rects=' + a.rects + ' suspectLeak=' + a.suspectLeak + ' byDisc=' + JSON.stringify(a.byDisc));

  const wasZero = Object.keys(a.byDisc).filter(d => !b.byDisc[d]);
  const newNonzeroMep = wasZero.filter(d => a.byDisc[d] > 0 && d !== 'ARC' && d !== 'STR');

  const pass = a.total > b.total && newNonzeroMep.length > 0 &&
               a.rects === b.rects && a.suspectLeak === 0 && b.suspectLeak === 0;

  if (pass) {
    console.log(`PASS — containment rows ${b.total} -> ${a.total}, newly-covered: ${JSON.stringify(newNonzeroMep)}, rects unchanged (${a.rects}), zero suspect leakage`);
  } else {
    console.log(`FAIL — total ${b.total}->${a.total}, newNonzeroMep=${JSON.stringify(newNonzeroMep)}, rects ${b.rects}->${a.rects}, suspectLeak b=${b.suspectLeak} a=${a.suspectLeak}`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(pass ? 0 : 1);
})().catch(e => { console.log('CRASH: ' + (e.stack || e.message)); process.exit(1); });
