#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — §PLACE_WITNESS (bim-compiler prompts/GEOREF_SUNPATH_COMPASS.md §13.6)
 *
 * ISSUE IT PROVES OR DISPROVES: does the place lookup ever state something the vendored table does
 * not say — a name it snapped to past the bound, a distance it got wrong, or an elevation it
 * reconciled on its own?
 *
 * ⚠ NO NETWORK ANYWHERE. W-PL-5 asserts that against the module's own bytes: the offline invariant
 * is the entire reason §13 supersedes §9's Open-Meteo answer, so it is tested, not assumed.
 *
 * RUN:  node witness_place_lookup.js
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX-License-Identifier: MIT
 */
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const PL = require('./viewer/place_lookup.js');

let pass = 0, fail = 0, incon = 0;
const ck = (n, c, x) => { if (c) { pass++; console.log('  §PLACE ok    ' + n + (x ? '   ' + x : '')); }
                          else { fail++; console.log('  §PLACE WRONG ' + n + (x ? '   ' + x : '')); } };
const note = (s) => console.log('  §PLACE note  ' + s);

const TBL = path.join(__dirname, 'viewer/rates/cities.tsv.gz');
if (!fs.existsSync(TBL)) {
  console.log('§PLACE_WITNESS INCONCLUSIVE — viewer/rates/cities.tsv.gz is absent. This witness' +
    ' judges a REAL vendored table; a synthetic one would prove the fixture, not the feature.');
  process.exit(2);
}
const text = zlib.gunzipSync(fs.readFileSync(TBL)).toString('utf8');
const table = PL.parse(text);

// ── W-PL-1 — the table parses, and it carries where it came from ────────────────────────────────
ck('W-PL-1 the table parses to exactly the row count its own header declares',
   !!table && table.rows.length === table.meta.rows,
   table ? table.rows.length + ' rows vs header ' + table.meta.rows : 'parse returned null');
ck('W-PL-1b …and it states its source, licence and download date — a number with no provenance is a guess',
   !!(table.meta.source && table.meta.licence && table.meta.downloaded && table.meta.sha256_16),
   [table.meta.source, table.meta.licence, table.meta.downloaded].join(' | '));
ck('W-PL-1c …and the delta-encoded latitudes reconstruct in order — a parse bug here silently moves every city',
   table.rows.every((r, i) => i === 0 || r.lat >= table.rows[i - 1].lat - 1e-9),
   'monotone across ' + table.rows.length + ' rows');

// ── W-PL-2 — THE ONLY CLEVER PART IS THE BAND PRUNE, SO IT IS CHECKED AGAINST BRUTE FORCE ───────
// A latitude-band search that is subtly wrong returns a plausible city, which is the worst kind of
// wrong. 300 probes, each compared to a full scan of all 69,735 rows.
{
  let agree = 0, probes = 0, worst = null;
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 300; i++) {
    const lat = -60 + rnd() * 130, lon = -180 + rnd() * 360;
    const got = PL.nearest(table, lat, lon, 50);
    let bk = Infinity, bn = null;
    for (const r of table.rows) {
      const km = PL.haversineKm(lat, lon, r.lat, r.lon);
      if (km < bk) { bk = km; bn = r; }
    }
    probes++;
    const brute = bk <= 50 ? bn.name : null;
    const mine = got && got.match ? got.name : null;
    if (mine === brute) agree++; else if (!worst) worst = { lat, lon, mine, brute, bk };
  }
  ck('W-PL-2 the latitude-band prune agrees with a full scan of every row, on 300 probes',
     agree === probes,
     agree + '/' + probes + (worst ? '  first divergence lat=' + worst.lat.toFixed(3) +
       ' lon=' + worst.lon.toFixed(3) + ' prune=' + worst.mine + ' bruteForce=' + worst.brute : ''));
}

// ── W-PL-3 — a row's own coordinate must return that row, at zero distance ──────────────────────
{
  const probes = [0, 1000, 20000, 40000, 69000].filter((i) => i < table.rows.length);
  const ok = probes.every((i) => {
    const r = table.rows[i], g = PL.nearest(table, r.lat, r.lon, 25);
    return g && g.match && g.km < 0.001 && g.cc === r.cc;
  });
  ck('W-PL-3 a row\'s own coordinate resolves to that row at ~0 km', ok,
     probes.map((i) => table.rows[i].name).join(', '));
}

// ── W-PL-4 — THE BOUND HOLDS. This is the claim that stops a rural site becoming a confident lie ─
{
  const pac = PL.nearest(table, -35.0, -140.0, 25);         // South Pacific, nothing for 1000s of km
  ck('W-PL-4 a coordinate with no settlement inside the bound reports NO MATCH, and says why',
     !!pac && pac.match === false && typeof pac.reason === 'string' && pac.boundKm === 25,
     pac ? pac.reason : 'returned null');
  // and the bound is a real gate, not decoration: the same point matches once the bound is huge
  const wide = PL.nearest(table, -35.0, -140.0, 6000);
  ck('W-PL-4b …and it IS the bound doing it — the same point matches when the bound is widened',
     !!wide && wide.match === true && wide.km > 25,
     wide && wide.match ? wide.name + ' at ' + wide.km.toFixed(0) + ' km' : 'still no match');
}

// ── W-PL-5 — OFFLINE, asserted against the module's own bytes ───────────────────────────────────
{
  const src = fs.readFileSync(path.join(__dirname, 'viewer/place_lookup.js'), 'utf8');
  const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const hits = ['fetch(', 'XMLHttpRequest', 'import(', "require('http", 'require("http', 'WebSocket']
    .filter((t) => code.indexOf(t) >= 0);
  ck('W-PL-5 the module makes no network call of any kind — the reason §13 supersedes §9',
     hits.length === 0, hits.length ? 'FOUND: ' + hits.join(' ') : 'no fetch, no XHR, no import(), no http');
}

// ── W-PL-6 — three elevations, none silently preferred, none averaged ───────────────────────────
{
  const e = PL.elevations(165.8112, 165.36, 5);
  const inputs = [165.8112, 165.36, 5];
  ck('W-PL-6 all three elevations are reported, and the quoted one is one of them — never an average',
     e.all.length === 3 && inputs.indexOf(e.quoted.m) >= 0,
     'quoted=' + e.quoted.src + ' ' + e.quoted.m + 'm  spread=' + e.spread_m.toFixed(2) + 'm');
  ck('W-PL-6b …and the spread is reported, because on Hospital it is the finding, not noise',
     Math.abs(e.spread_m - 160.8112) < 1e-6,
     'ifc_site 165.81 m and bake datum 165.36 m against a sea-level city = a project datum, not AMSL');
}

// ── W-PL-7 — the fleet's two real georefs, resolved and PRINTED, not asserted from memory ───────
{
  const fleet = [
    ['merged_federation (Penang, §10 T1 — a real surveyed site)', 5.96277289, 100.63712571],
    ['Hospital ARC (§12 — CONTESTED, see below)', 42.35842896, -71.05977631],
    ['Hospital MECH (§12 — the same building, per a different discipline file)', 43.1221, -77.6302],
  ];
  fleet.forEach(([label, lat, lon]) => {
    const g = PL.nearest(table, lat, lon, 25);
    note(label + ' -> ' + (g && g.match
      ? g.name + ', ' + g.cc + ' (' + g.km.toFixed(1) + ' km, elev ' + g.elevation_m + ' m src=' + g.elevSrc + ', ' + g.tz + ')'
      : 'NO MATCH — ' + (g ? g.reason : 'null')));
  });
  const arc = PL.nearest(table, 42.35842896, -71.05977631, 25);
  const mech = PL.nearest(table, 43.1221, -77.6302, 25);
  ck('W-PL-7 Hospital\'s two discipline files resolve to DIFFERENT cities — §12 is a real defect, not a rounding',
     !!(arc && mech && arc.match && mech.match && arc.name !== mech.name),
     arc && mech && arc.match && mech.match
       ? arc.name + ' vs ' + mech.name + ' — ' + PL.haversineKm(42.35842896, -71.05977631, 43.1221, -77.6302).toFixed(0) + ' km apart'
       : 'one of them did not resolve');
  note('⚠ THE GATE OF §13.5 IS NOT BUILT (that is T4). This module answers what the table says;');
  note('   nothing yet stops a caller drawing "' + (arc && arc.match ? arc.name : '?') + '" on a building whose own files disagree.');
}

console.log('§PLACE_WITNESS ' + (fail ? 'FAIL' : 'PASS') + ' pass=' + pass + ' fail=' + fail +
  ' rows=' + (table ? table.rows.length : 0) + ' source="' + (table ? table.meta.source : '?') + '"');
process.exit(fail ? 1 : 0);
