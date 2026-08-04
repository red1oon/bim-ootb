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
const HallwayBackbone = require('../hallway_backbone.js');

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

// §CORRIDOR-OVERLAP-FRACTION (2026-07-14): re-derive with the room's own FOOTPRINT, not just its
// centroid — a room only counts as "on the corridor" if >=50% of its own area sits inside the
// bucket rect (see common/hallway_backbone.js classifyCorridorRooms). Centroid-inside alone is no
// longer sufficient ground truth (that was the false-positive bug this fix closes: a large room's
// centroid can drift inside an oversized rect while its own body sits mostly outside it).
const hasRoomGuid = dbQuery('PRAGMA table_info(spatial_structure)').some(c => c[1] === 'room_guid');
const spaceRows = dbQuery("SELECT s.guid, p.name" + (hasRoomGuid ? ', s.room_guid' : ', NULL') +
  ", s.center_x, s.center_y, s.size_x, s.size_y " +
  "FROM spatial_structure s LEFT JOIN spatial_structure p ON p.guid = s.parent_guid " +
  "WHERE s.type='IfcSpace' AND s.center_x IS NOT NULL AND s.size_x IS NOT NULL");
const roomByGuid = {}; // logicalGuid -> {storey, ownRects: [{x0,x1,y0,y1,area}], cx, cy}
spaceRows.forEach(r => {
  const lg = r[2] || r[0];
  if (!roomByGuid[lg]) roomByGuid[lg] = { storey: r[1], ownRects: [], sumX: 0, sumY: 0, n: 0 };
  const g = roomByGuid[lg];
  const sx = r[5], sy = r[6];
  g.ownRects.push({ x0: r[3] - sx / 2, x1: r[3] + sx / 2, y0: r[4] - sy / 2, y1: r[4] + sy / 2, area: sx * sy });
  g.sumX += r[3]; g.sumY += r[4]; g.n++;
});
function rectOverlapArea(a, c) {
  const ox = Math.max(0, Math.min(a.x1, c.x1) - Math.max(a.x0, c.x0));
  const oy = Math.max(0, Math.min(a.y1, c.y1) - Math.max(a.y0, c.y0));
  return ox * oy;
}
function bestOverlapFraction(g, rects) {
  const totalArea = g.ownRects.reduce((s, rr) => s + rr.area, 0);
  if (totalArea <= 0) return 0;
  let best = 0;
  rects.forEach(rc => {
    const ov = g.ownRects.reduce((s, rr) => s + rectOverlapArea(rr, rc), 0);
    best = Math.max(best, ov / totalArea);
  });
  return best;
}
const MIN_OVERLAP_FRACTION = 0.5;
// §CORRIDOR-SHAPE (2026-07-14): ground truth also requires the shape bound now — a room must be
// BOTH >=50% overlapping AND elongated enough (see common/hallway_backbone.js's
// DEFAULT_PROFILE.minAspectRatio) to independently re-verify as "should be classified corridor".
const MIN_ASPECT_RATIO = HallwayBackbone.DEFAULT_PROFILE.minAspectRatio;

// §CORRIDOR-DISTINCT-NEIGHBORS (2026-07-15): independently re-derive distinct-other-room door
// adjacency from scratch (same door-to-2-nearest-rooms resolution room_graph.js's own E1 edges
// use) — a room must ALSO connect to >=minDistinctNeighborRooms DIFFERENT rooms via a real door to
// count, not just satisfy shape+overlap. Reused ground truth, not trusting classifyCorridorRooms'
// own internal computation of the same thing.
const RoomGraph = require('../room_graph.js');
const MIN_NEIGHBORS = HallwayBackbone.DEFAULT_PROFILE.minDistinctNeighborRooms;
const doorRows = dbQuery("SELECT m.guid, m.element_name, m.storey, t.center_x, t.center_y, t.bbox_x, t.bbox_y" +
  " FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid" +
  " WHERE m.ifc_class LIKE 'IfcDoor%' AND m.discipline='ARC' AND t.center_x IS NOT NULL");
const DOOR_BUF_SLACK = 0.20;
function rd(rc, px, py) {
  const dx = Math.max(rc.x0 - px, 0, px - rc.x1), dy = Math.max(rc.y0 - py, 0, py - rc.y1);
  return Math.hypot(dx, dy);
}
const neighborsByGuid = {};
doorRows.forEach(d => {
  const dname = d[1] || '', dstorey = d[2] || '', dx = d[3], dy = d[4], bx = d[5] || 0, by = d[6] || 0;
  if (!RoomGraph.isRoomDoor(dname)) return;
  const buf = Math.max(bx, by) / 2 + DOOR_BUF_SLACK;
  const cands = [];
  Object.keys(roomByGuid).forEach(lg => {
    const g = roomByGuid[lg];
    if (g.storey !== dstorey) return;
    let best = Infinity;
    g.ownRects.forEach(rr => { best = Math.min(best, rd(rr, dx, dy)); });
    if (best <= buf) cands.push({ lg, dist: best });
  });
  if (cands.length < 2) return;
  cands.sort((p, q) => p.dist - q.dist);
  const a = cands[0].lg, b = cands[1].lg;
  (neighborsByGuid[a] = neighborsByGuid[a] || new Set()).add(b);
  (neighborsByGuid[b] = neighborsByGuid[b] || new Set()).add(a);
});
function meetsCorridorBar(g, rects, lg) {
  const neighborCount = neighborsByGuid[lg] ? neighborsByGuid[lg].size : 0;
  return bestOverlapFraction(g, rects) >= MIN_OVERLAP_FRACTION &&
    HallwayBackbone.unionAspectRatio(g.ownRects) >= MIN_ASPECT_RATIO &&
    neighborCount >= MIN_NEIGHBORS;
}

let allVerified = true, checkedCount = 0;
guids.forEach(lg => {
  const g = roomByGuid[lg];
  if (!g) { allVerified = false; return; }
  const rects = bucketsByStorey[g.storey] || [];
  if (!meetsCorridorBar(g, rects, lg)) allVerified = false;
  checkedCount++;
});
chk('G2 every classified room independently re-verified to meet ALL THREE bars — overlap-fraction (>=' +
  MIN_OVERLAP_FRACTION + '), shape (aspect>=' + MIN_ASPECT_RATIO + '), and distinct-neighbor-rooms (>=' +
  MIN_NEIGHBORS + ') — not just centroid', allVerified, 'checked=' + checkedCount);

// Rooms that were NOT classified as corridor must genuinely NOT meet BOTH bars either — confirms
// the classifier isn't under- or over-matching against its own stated rule.
const nonMatched = Object.keys(roomByGuid).filter(g => !result[g]);
let overMatchFound = false;
nonMatched.slice(0, 40).forEach(lg => {
  const g = roomByGuid[lg];
  const rects = bucketsByStorey[g.storey] || [];
  if (meetsCorridorBar(g, rects, lg)) overMatchFound = true;
});
chk('G3 no false negatives in a 40-room sample (a room meeting ALL THREE bars was not silently skipped)', !overMatchFound, 'sampled=' + Math.min(40, nonMatched.length));

console.log('§SAMPLE classified=' + guids.length + ' total=' + Object.keys(roomByGuid).length +
  ' chains touched=' + new Set(guids.map(g => result[g].chain)).size);

// §CORRIDOR-DISTINCT-NEIGHBORS regression guard (2026-07-15): before this fix, Clinic classified 9
// rooms via shape+overlap alone — 6 of those had 0-1 distinct neighboring rooms (narrow slivers,
// e.g. "First Floor R22" 1.4x5.4m connecting to nothing), confirmed false positives. This asserts
// the fix's actual effect: strictly fewer classified than the shape+overlap-only count, and none of
// the survivors are zero-neighbor dead ends.
const shapeOverlapOnlyCount = Object.keys(roomByGuid).filter(lg => {
  const g = roomByGuid[lg];
  const rects = bucketsByStorey[g.storey] || [];
  return bestOverlapFraction(g, rects) >= MIN_OVERLAP_FRACTION &&
    HallwayBackbone.unionAspectRatio(g.ownRects) >= MIN_ASPECT_RATIO;
}).length;
chk('G4 distinct-neighbor gate actually prunes false positives (fewer classified than shape+overlap alone would give)',
  guids.length < shapeOverlapOnlyCount, 'withGate=' + guids.length + ' shapeOverlapOnly=' + shapeOverlapOnlyCount);
chk('G5 no classified room is a zero/one-neighbor dead end (the exact false-positive shape this gate targets)',
  guids.every(lg => (neighborsByGuid[lg] ? neighborsByGuid[lg].size : 0) >= MIN_NEIGHBORS));

console.log('\n§W-CORRIDOR-TYPE-LABEL DONE pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
