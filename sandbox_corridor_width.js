#!/usr/bin/env node
/**
 * SANDBOX (not a witness) — synthetic geometry, known expected values, isolates the two formula
 * fixes in common/hallway_backbone.js (§CORRIDOR-WIDTH-BOUNDS, §CORRIDOR-OVERLAP-FRACTION) from
 * any real building's data noise. Run: node sandbox_corridor_width.js
 */
'use strict';
const HB = require('./common/hallway_backbone.js');
let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  OK ' + n); } else { fail++; console.log('  FAIL ' + n + '  ' + (x || '')); } };

// ── Test A: bucketWidth rejects a host-wall self-match (offset ~0) ──
// A bucket of x-run doors at runCoord y=0, span x:[0,10]. Two walls:
//  W1: the door-hosting wall itself, runs along x, centered AT y=0 (offset ~0 from rc) — must be
//      rejected as a flanking candidate (too close — this is the same wall the doors sit in).
//  W2: the REAL opposite corridor wall, 2.0m away at y=2.0 — must be the one actually picked.
{
  const bucket = { axis: 'x', runCoord: 0, span: { lo: 0, hi: 10 } };
  const walls = [
    { cx: 5, cy: 0.05, bx: 10, by: 0.2 },   // host wall: centered almost on rc, thin
    { cx: 5, cy: 2.0, bx: 10, by: 0.2 }     // real flanking wall, 2.0m away (net offset ~1.9)
  ];
  HB.bucketWidth(bucket, walls);
  chk('A1 host-wall self-match (offset~0) NOT accepted as flanking wall',
    bucket.halfWidthHi > 1.0, 'halfWidthHi=' + bucket.halfWidthHi);
  chk('A2 real flanking wall at ~1.9m net offset IS the accepted width',
    Math.abs(bucket.halfWidthHi - 1.9) < 0.01, 'halfWidthHi=' + bucket.halfWidthHi);
}

// ── Test B: bucketWidth rejects an implausibly-far same-axis wall, falls back to default ──
{
  const bucket = { axis: 'x', runCoord: 0, span: { lo: 0, hi: 10 } };
  const walls = [
    { cx: 5, cy: 40, bx: 10, by: 0.2 }   // 40m away — a coincidentally-aligned cross-building wall
  ];
  HB.bucketWidth(bucket, walls);
  chk('B1 implausibly-far wall (40m) rejected, falls back to DEFAULT_HALF_WIDTH',
    bucket.halfWidthHi === 1.2, 'halfWidthHi=' + bucket.halfWidthHi);
}

// ── Test C: bucketWidth accepts a wall right at the edge of the plausible window ──
{
  const bucket = { axis: 'x', runCoord: 0, span: { lo: 0, hi: 10 } };
  const walls = [
    { cx: 5, cy: 1.5, bx: 10, by: 0.2 }   // net offset 1.4 — inside [0.5, 3.0]
  ];
  HB.bucketWidth(bucket, walls);
  chk('C1 wall within [MIN,MAX] window accepted at its real measured offset',
    Math.abs(bucket.halfWidthHi - 1.4) < 0.01, 'halfWidthHi=' + bucket.halfWidthHi);
}

// ── Test D: classifyCorridorRooms overlap-fraction guard ──
// Fake dbQuery: one joined-worthy door cluster (>=3 doors along x at y=0, spanning x:[0,20]) plus a
// wide flanking wall each side so bucketWidth gives a real ~2m-total corridor width. Two IfcSpace
// rows: ROOM_CORRIDOR sits fully inside the corridor strip (must classify); ROOM_BIG is a large
// room whose centroid drifts just inside the strip but whose own body sits mostly outside it (must
// NOT classify — this is the exact HHS false-positive shape: R18, 242m², frac=0.570 -> now testing
// a deliberately LOW-fraction case to confirm the guard actually rejects it).
{
  const rows = {
    doors: [
      // 3 doors along x, all with cy~0 (their host wall run), wide-in-X bbox -> axis 'x'
      ['D1','Door1','L1', 2, 0, 1.0, 0.2],
      ['D2','Door2','L1', 8, 0, 1.0, 0.2],
      ['D3','Door3','L1', 14, 0, 1.0, 0.2]
    ],
    // wallRows column order (see buildBackbone): storey, center_x, center_y, bbox_x, bbox_y
    walls: [
      // host wall (must be excluded from width calc — offset ~0 on the "below" side)
      ['L1', 8, 0.0, 20, 0.2],
      // real opposite flanking wall, 2.0m north of the doors' wall
      ['L1', 8, 2.0, 20, 0.2]
    ],
    spaces: [
      // ROOM_CORRIDOR: fully inside the resulting corridor strip (y in [-1.2(default lo), 2.0])
      ['S_CORR', 'L1', null, 8, 0.5, 12, 1.5],
      // ROOM_BIG: centroid (8, 1.5) sits inside the corridor strip's y-range, but the room's own
      // 6x10 body extends far beyond it (y:[-3.5,6.5]) — most of its area is OUTSIDE the strip (a
      // real room bordering the corridor, not part of it)
      ['S_BIG', 'L1', null, 8, 1.5, 6, 10]
    ]
  };
  function dbQuery(sql) {
    if (/IfcDoor/.test(sql)) return rows.doors;
    if (/IfcWall/.test(sql)) return rows.walls;
    if (/PRAGMA table_info/.test(sql)) return [[0,'guid'],[1,'name'],[2,'room_guid']];
    if (/IfcSpace/.test(sql)) return rows.spaces;
    return [];
  }
  const backbone = HB.buildBackbone(dbQuery, { log: () => {} });
  chk('D0 sandbox door cluster actually joined into a bucket', backbone.joined.length === 1, 'joined=' + backbone.joined.length);
  if (backbone.joined.length) {
    const b = backbone.joined[0];
    console.log('  sandbox bucket halfWidthLo=' + b.halfWidthLo + ' halfWidthHi=' + b.halfWidthHi + ' span=' + JSON.stringify(b.span));
  }
  const labels = HB.classifyCorridorRooms(dbQuery, { log: () => {} });
  chk('D1 ROOM_CORRIDOR (fully inside strip) classified as corridor', !!labels['S_CORR'], JSON.stringify(labels));
  chk('D2 ROOM_BIG (centroid-only drift, body mostly outside) REJECTED by overlap-fraction guard', !labels['S_BIG'], JSON.stringify(labels));
}

console.log('\n§SANDBOX_CORRIDOR_WIDTH DONE pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
