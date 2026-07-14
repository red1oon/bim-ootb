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
      ['L1', 8, 2.0, 20, 0.2],
      // end-cap walls (wide-in-y, perpendicular to the x-run bucket) just past the outermost doors
      // on each side — needed so isGrounded()/distanceToEnclosure() accept this as a real, walled
      // walkway rather than a floating door alignment (§COMMON-SENSE-FILTER).
      ['L1', 0, 1.0, 0.2, 4],
      ['L1', 16, 1.0, 0.2, 4]
    ],
    spaces: [
      // ROOM_CORRIDOR: fully inside the resulting corridor strip (y in [-1.2(default lo), 2.0])
      ['S_CORR', 'L1', null, 8, 0.5, 12, 1.5],
      // ROOM_BIG: centroid (8, 1.5) sits inside the corridor strip's y-range, but the room's own
      // 6x10 body extends far beyond it (y:[-3.5,6.5]) — most of its area is OUTSIDE the strip (a
      // real room bordering the corridor, not part of it)
      ['S_BIG', 'L1', null, 8, 1.5, 6, 10],
      // ROOM_SQUARE: small (1.0x1.0), fully inside the strip (100% overlap fraction — would have
      // passed the OLD overlap-only guard) but near-square (aspect 1.0) — the exact real-world
      // shape found on Clinic (e.g. "First Floor R10", 2.4x2.2m, aspect 1.09): a closet/small-room
      // whose small size lets it hide entirely inside an oversized corridor rect, not a corridor.
      ['S_SQUARE', 'L1', null, 5, 0.3, 1.0, 1.0]
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
  chk('D3 ROOM_SQUARE (100% overlap but near-square, aspect~1.0) REJECTED by shape guard', !labels['S_SQUARE'], JSON.stringify(labels));
}

// ── Test I: unionAspectRatio — the shape primitive, tested directly ──
{
  chk('I1 a long thin rect (12x1.5) measures a high aspect ratio', Math.abs(HB.unionAspectRatio([{ x0: 0, x1: 12, y0: 0, y1: 1.5 }]) - 8) < 0.01);
  chk('I2 a near-square rect (2.4x2.2) measures aspect close to 1.0',
    Math.abs(HB.unionAspectRatio([{ x0: 0, x1: 2.4, y0: 0, y1: 2.2 }]) - (2.4 / 2.2)) < 0.01);
  chk('I3 a multi-rect (§MULTI-RECT) room unions across ALL its sub-rects, not just the first',
    HB.unionAspectRatio([{ x0: 0, x1: 1, y0: 0, y1: 1 }, { x0: 1, x1: 10, y0: 0, y1: 1 }]) === 10);
}

// ── Test E: wallLiesFlatAgainst / distanceToEnclosure / isGrounded — unit-level, no DB needed ──
{
  chk('E1 wallLiesFlatAgainst: offset inside [min,max] returns the offset', HB.wallLiesFlatAgainst(1.4, 0.5, 3.0) === 1.4);
  chk('E2 wallLiesFlatAgainst: offset below min (self-match shape) rejected', HB.wallLiesFlatAgainst(0.05, 0.5, 3.0) === null);
  chk('E3 wallLiesFlatAgainst: offset above max (cross-building shape) rejected', HB.wallLiesFlatAgainst(40, 0.5, 3.0) === null);
  chk('E4 wallLiesFlatAgainst: min=0 disables the "too close" half (growToWall use)', HB.wallLiesFlatAgainst(0.01, 0, 8) === 0.01);

  const env = { x0: 0, x1: 20, y0: 0, y1: 10 };
  chk('E5 distanceToEnclosure: point well inside returns 0', HB.distanceToEnclosure(10, 5, env) === 0);
  chk('E6 distanceToEnclosure: point just past the boundary (within tolerance) still 0', HB.distanceToEnclosure(20.3, 5, env) === 0);
  chk('E7 distanceToEnclosure: point clearly outside returns a positive distance', HB.distanceToEnclosure(25, 5, env) > 0, 'd=' + HB.distanceToEnclosure(25, 5, env));
  chk('E8 distanceToEnclosure: no envelope data never false-flags', HB.distanceToEnclosure(999, 999, null) === 0);

  chk('E9 isGrounded: both ends wall-capped -> grounded', HB.isGrounded({ openLo: false, openHi: false }));
  chk('E10 isGrounded: one end open but stair-anchored -> still grounded', HB.isGrounded({ openLo: true, stairLo: 'S1', openHi: false }));
  chk('E11 isGrounded: BOTH ends open with no stair anchor -> floating, rejected', !HB.isGrounded({ openLo: true, openHi: true, stairLo: null, stairHi: null }));
}

// ── Test F: growToWall rejects an implausibly-far end-cap wall (MAX_END_REACH), same shape as
// the width bug but along the corridor's own axis ("not in mid air", user's item 3) ──
{
  const bucket = { axis: 'x', runCoord: 0, doors: [{ alongCoord: 2 }, { alongCoord: 8 }, { alongCoord: 14 }] };
  const walls = [
    // a perpendicular (y-run) wall crossing rc=0, but 30m past the last door (14) — a
    // coincidentally cross-axis-aligned wall from an unrelated part of the building
    { cx: 44, cy: 1, bx: 0.2, by: 4 }
  ];
  HB.growToWall(bucket, walls);
  chk('F1 implausibly-far end-cap (30m past last door) rejected, end stays open',
    bucket.openHi === true && bucket.span.hi === 14, 'openHi=' + bucket.openHi + ' span.hi=' + bucket.span.hi);
}
{
  const bucket = { axis: 'x', runCoord: 0, doors: [{ alongCoord: 2 }, { alongCoord: 8 }, { alongCoord: 14 }] };
  const walls = [
    { cx: 17, cy: 1, bx: 0.2, by: 4 }   // 3m past the last door — well within MAX_END_REACH
  ];
  HB.growToWall(bucket, walls);
  chk('F2 plausible end-cap (3m past last door) accepted',
    bucket.openHi === false && bucket.span.hi === 17, 'openHi=' + bucket.openHi + ' span.hi=' + bucket.span.hi);
}

// ── Test G: commonSenseFilter — the composed (3)+(4) gate, tested as ONE unit ──
{
  const grounded = { storey: 'L1', openLo: false, openHi: false, runCoord: 0, span: { lo: 0, hi: 10 }, halfWidthLo: 1.2, halfWidthHi: 1.2 };
  const floating = { storey: 'L1', openLo: true, openHi: true, stairLo: null, stairHi: null, runCoord: 0, span: { lo: 0, hi: 10 }, halfWidthLo: 1.2, halfWidthHi: 1.2 };
  const outsideEnv = { storey: 'L1', openLo: false, openHi: false, runCoord: 100, span: { lo: 0, hi: 10 }, halfWidthLo: 1.2, halfWidthHi: 1.2 };
  const envelopeByStorey = { L1: { x0: -5, x1: 15, y0: -5, y1: 15 } };
  const result = HB.commonSenseFilter([grounded, floating, outsideEnv], envelopeByStorey);
  chk('G1 grounded + within-envelope bucket kept', result.kept.indexOf(grounded) >= 0);
  chk('G2 floating bucket (both ends open, no stair) dropped with reason=ungrounded',
    result.dropped.some(d => d.bucket === floating && d.reason === 'ungrounded'));
  chk('G3 bucket whose rect sits outside its storey envelope dropped with reason=outside-envelope',
    result.dropped.some(d => d.bucket === outsideEnv && d.reason === 'outside-envelope'));
  chk('G4 kept array excludes both rejected buckets', result.kept.length === 1);
}

// ── Test H: DEFAULT_PROFILE is a real, usable extension point — override without touching source ──
{
  const bucket = { axis: 'x', runCoord: 0, span: { lo: 0, hi: 10 } };
  const wideProfile = Object.assign({}, HB.DEFAULT_PROFILE, { maxSideOffset: 10 });
  const walls = [['ignored']]; // unused placeholder, bucketWidth reads wall objects not this
  const farWall = { cx: 5, cy: 6, bx: 10, by: 0.2 }; // 5.9m net offset — rejected by DEFAULT_PROFILE, accepted by wideProfile
  HB.bucketWidth(bucket, [farWall]); // default profile: 5.9m > maxSideOffset(3.0) -> falls back to default
  const defaultResultWidth = bucket.halfWidthHi;
  const bucket2 = { axis: 'x', runCoord: 0, span: { lo: 0, hi: 10 } };
  HB.bucketWidth(bucket2, [farWall], wideProfile);
  chk('H1 default profile rejects the far wall (falls back to defaultHalfWidth)', defaultResultWidth === HB.DEFAULT_PROFILE.defaultHalfWidth);
  chk('H2 override profile (maxSideOffset=10) accepts the SAME far wall at its real offset',
    Math.abs(bucket2.halfWidthHi - 5.9) < 0.01, 'halfWidthHi=' + bucket2.halfWidthHi);
}

console.log('\n§SANDBOX_CORRIDOR_WIDTH DONE pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
