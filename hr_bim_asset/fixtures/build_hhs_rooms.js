// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — one-time EXTRACTOR for the HHS room fixture (§RESUME NEXT#1 — bind a lease to a REAL
//   IfcSpace guid). NON-INVENT: every room guid/name/centre/occupancy is READ from the real building DB
//   (buildings/HHS_Office_Federated_extracted.db, gitignored 73MB blob) — nothing is fabricated. Output
//   hhs_rooms.json is a small committed provenance-stamped fixture the witness joins leases against, so
//   the witness does NOT depend on the 73MB blob being present. Re-run to refresh:
//     node hr_bim_asset/fixtures/build_hhs_rooms.js
'use strict';
var cp = require('child_process'), fs = require('fs'), path = require('path'), crypto = require('crypto');

var DB = path.resolve(__dirname, '../../buildings/HHS_Office_Federated_extracted.db');
if (!fs.existsSync(DB)) { console.error('§HHS-ROOMS SKIP — building DB absent: ' + DB); process.exit(2); }

var sha = crypto.createHash('sha256').update(fs.readFileSync(DB)).digest('hex').slice(0, 16);
var sql = "SELECT s.guid AS guid, s.name AS name, s.center_x AS cx, s.center_y AS cy, s.center_z AS cz, "
        + "(SELECT count(*) FROM rel_contained_in_space r WHERE r.space_guid=s.guid) AS contained "
        + "FROM spatial_structure s WHERE s.type='IfcSpace' ORDER BY s.guid;";
var raw = cp.execFileSync('sqlite3', ['-json', DB, sql], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
var rows = JSON.parse(raw).map(function (r) {
  return { guid: r.guid, name: r.name,
           center: [+r.cx.toFixed(3), +r.cy.toFixed(3), +r.cz.toFixed(3)],
           contained: r.contained };   // # of building elements rel_contained_in_space → real occupancy proxy
});

var fixture = {
  _provenance: { source: 'buildings/HHS_Office_Federated_extracted.db', source_sha16: sha,
                 table: 'spatial_structure WHERE type=IfcSpace', extracted_by: 'fixtures/build_hhs_rooms.js',
                 note: 'EXTRACTED not invented — real IfcSpace rooms of HHS_Office_Federated' },
  count: rows.length,
  rooms: rows
};
var out = path.join(__dirname, 'hhs_rooms.json');
fs.writeFileSync(out, JSON.stringify(fixture, null, 2) + '\n');
console.log('§HHS-ROOMS PASS — wrote ' + rows.length + ' real IfcSpace rooms → ' + path.relative(process.cwd(), out) + ' (src sha16 ' + sha + ')');
