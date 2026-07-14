#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-CORRIDOR-TYPE-LABEL scope (READ THE LOG after every run)
 * SCOPE: common/hallway_backbone.js's classifyCorridorRooms() — the Find panel's Type-grouped
 * room tree DISPLAY override (user ask, 2026-07-14: "long corridors well named under Type.Hall/
 * Corridor"). DOES NOT touch spatial_structure/predefined_type — display-time only, see
 * viewer/navigate_find.js's _corridorLabelsFor() wiring for the consumer.
 * RUN: node witness_corridor_type_label.js   (from the worktree root)
 */
'use strict';
const Database = require(require('path').join(process.env.HOME, 'bim-compiler', 'node_modules', 'better-sqlite3'));
const HallwayBackbone = require('./common/hallway_backbone.js');

const DB_PATH = '/home/red1/bim-ootb/buildings/Clinic_extracted.db';
let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

console.log('§W-CORRIDOR-TYPE-LABEL building=' + DB_PATH);
const db = new Database(DB_PATH, { readonly: true });
function dbQuery(sql) { return db.prepare(sql).raw(true).all(); }

const result = HallwayBackbone.classifyCorridorRooms(dbQuery, { log: (m) => console.log('  ' + m) });
const guids = Object.keys(result);
chk('G1 at least some real rooms classified as corridor', guids.length > 0, 'count=' + guids.length);

// Independent re-check: every classified room's own centroid must ACTUALLY fall inside a real
// joined bucket's measured rect — re-derive from scratch, don't just trust classifyCorridorRooms'
// own verdict.
const backbone = HallwayBackbone.buildBackbone(dbQuery, { log: () => {} });
const bucketsByStorey = {};
backbone.joined.forEach(b => { (bucketsByStorey[b.storey] = bucketsByStorey[b.storey] || []).push(HallwayBackbone.bucketRect(b)); });

const hasRoomGuid = dbQuery('PRAGMA table_info(spatial_structure)').some(c => c[1] === 'room_guid');
const spaceRows = dbQuery("SELECT s.guid, p.name" + (hasRoomGuid ? ', s.room_guid' : ', NULL') + ", s.center_x, s.center_y " +
  "FROM spatial_structure s LEFT JOIN spatial_structure p ON p.guid = s.parent_guid " +
  "WHERE s.type='IfcSpace' AND s.center_x IS NOT NULL");
const centroidByGuid = {};
spaceRows.forEach(r => { const lg = r[2] || r[0]; if (!centroidByGuid[lg]) centroidByGuid[lg] = { storey: r[1], cx: r[3], cy: r[4] }; });

let allVerified = true, checkedCount = 0;
guids.forEach(lg => {
  const c = centroidByGuid[lg];
  if (!c) { allVerified = false; return; }
  const rects = bucketsByStorey[c.storey] || [];
  const hit = rects.some(rc => c.cx >= rc.x0 && c.cx <= rc.x1 && c.cy >= rc.y0 && c.cy <= rc.y1);
  if (!hit) allVerified = false;
  checkedCount++;
});
chk('G2 every classified room independently re-verified to sit inside a real backbone rect', allVerified, 'checked=' + checkedCount);

// Rooms that were NOT classified as corridor must genuinely NOT sit in any bucket rect (no
// false-negative check needed for a display override, but confirm the classifier isn't
// over-matching — spot check a random non-classified room).
const nonMatched = Object.keys(centroidByGuid).filter(g => !result[g]);
let overMatchFound = false;
nonMatched.slice(0, 40).forEach(lg => {
  const c = centroidByGuid[lg];
  const rects = bucketsByStorey[c.storey] || [];
  const hit = rects.some(rc => c.cx >= rc.x0 && c.cx <= rc.x1 && c.cy >= rc.y0 && c.cy <= rc.y1);
  if (hit) overMatchFound = true;
});
chk('G3 no false negatives in a 40-room sample (a room truly inside a bucket rect was not silently skipped)', !overMatchFound, 'sampled=' + Math.min(40, nonMatched.length));

console.log('§SAMPLE classified=' + guids.length + ' total=' + Object.keys(centroidByGuid).length +
  ' chains touched=' + new Set(guids.map(g => result[g].chain)).size);

console.log('\n§W-CORRIDOR-TYPE-LABEL DONE pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
