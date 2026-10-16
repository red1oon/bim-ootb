// W-ROOM-OCCL support (Node): proves the §13 _makeJoinKey hoist in room_walker.js did NOT change
// writeRooms() output (issue: a botched refactor of the containment join would silently shift
// rel_contained_in_space rows — §11.2's validated LTU number is 30,409 rows / 24.2%), and that
// buildCameraRoomIndex.roomAt() agrees with the walker's own containment (issue: a naive Z-join
// gives cross-floor mispicks — §11.2 Q2).
const fs = require('fs');
const path = require('path');
const initSqlJs = require(path.join(__dirname, '..', 'tests', 'node_modules', 'sql.js'));

const SRC_DB = '/home/red1/bim-compiler/deploy/buildings/LTU_AHouse_extracted.db';
const TMP_DB = path.join(__dirname, 'ltu_copy.db');

(async () => {
  fs.copyFileSync(SRC_DB, TMP_DB);
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(TMP_DB));
  global.window = undefined;
  const RW = require(path.join(__dirname, '..', 'viewer', 'lib', 'room_walker.js'));

  const t0 = Date.now();
  const res = RW.walk(db, { write: true });
  console.log('§JOINKEY_WALK rooms=' + res.roomsWritten + ' rects=' + res.rectRowsWritten +
    ' rel=' + res.relWritten + ' ms=' + (Date.now() - t0));
  // §11.2 harness validation numbers: 30,409 rel rows on LTU. Refactor must reproduce EXACTLY.
  const EXPECT_REL = 30409;
  console.log('§JOINKEY_EQUIV rel=' + res.relWritten + ' expect=' + EXPECT_REL +
    ' verdict=' + (res.relWritten === EXPECT_REL ? 'PASS' : 'FAIL'));

  const idx = RW.buildCameraRoomIndex(db);
  console.log('§CAMIDX rects=' + idx.rects + ' floors=' + idx.anchorNames.length +
    ' anchors=' + JSON.stringify(idx.anchors));

  // roomAt(room rect center) must return that room's logical guid, per floor (rect math identity)
  let rows = [];
  const q = db.exec("SELECT guid, room_guid, center_x, center_y, center_z, size_x, size_y, predefined_type " +
    "FROM spatial_structure WHERE type='IfcSpace' AND guid LIKE 'RM\\_%' ESCAPE '\\' " +
    "AND center_x IS NOT NULL AND (predefined_type IS NULL OR predefined_type NOT LIKE 'SUSPECT%')");
  if (q.length) rows = q[0].values;
  let ok = 0, bad = 0;
  for (const r of rows) {
    const got = idx.roomAt(r[2], r[3], r[4]);
    // center can land in an overlapping earlier rect only if rooms overlap — walker invariant says
    // they don't; got must be this room's logical guid
    if (got === (r[1] || r[0])) ok++; else { bad++; if (bad <= 5) console.log('  §CAMIDX_MISS rect=' + r[0] + ' got=' + got); }
  }
  console.log('§CAMIDX_SELF rectCenters=' + rows.length + ' ok=' + ok + ' miss=' + bad +
    ' verdict=' + (bad === 0 ? 'PASS' : 'CHECK'));

  // Cross-floor guard: same XY as a floor-1 room center but at floor-2's anchor Z must NOT
  // resolve to the floor-1 room (the exact mispick class §11.2 Q2 measured).
  const names = idx.anchorNames;
  let xfTested = 0, xfWrong = 0;
  if (names.length >= 2 && rows.length) {
    for (const r of rows.slice(0, 200)) {
      const homeKey = names.reduce((b, n) => Math.abs(r[4] - idx.anchors[n]) < Math.abs(r[4] - idx.anchors[b]) ? n : b, names[0]);
      for (const n of names) {
        if (n === homeKey) continue;
        const got = idx.roomAt(r[2], r[3], idx.anchors[n]);
        xfTested++;
        if (got === (r[1] || r[0])) xfWrong++;
      }
    }
  }
  console.log('§CAMIDX_XFLOOR tested=' + xfTested + ' wrongFloorPick=' + xfWrong +
    ' verdict=' + (xfWrong === 0 ? 'PASS' : 'FAIL'));

  // Agreement with walker containment on a sample of contained elements (camera-style join vs
  // the element's storey-labeled join): report the rate — informational, drives no threshold.
  const s = db.exec("SELECT r.element_guid, r.space_guid, t.center_x, t.center_y, t.center_z " +
    "FROM rel_contained_in_space r JOIN element_transforms t ON t.guid = r.element_guid " +
    "WHERE r.space_guid LIKE 'RM\\_%' ESCAPE '\\' LIMIT 5000");
  let agree = 0, disagree = 0, nullPick = 0;
  if (s.length) for (const v of s[0].values) {
    const got = idx.roomAt(v[2], v[3], v[4]);
    if (got === v[1]) agree++; else if (got === null) nullPick++; else disagree++;
  }
  console.log('§CAMIDX_AGREE sample=5000 agree=' + agree + ' otherRoom=' + disagree + ' null=' + nullPick);

  fs.unlinkSync(TMP_DB);
})().catch(e => { console.log('§JOINKEY_ERR ' + e.stack); process.exit(1); });
