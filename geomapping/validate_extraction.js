#!/usr/bin/env node
// validate_extraction.js — extraction-correctness sweep (bim-compiler RESUME_IFC_BOM_GEOMAPPING.md
// §WIRE-SPEC deliverable 4; witness W-GEOMAP-WIRE W6). Read the §-log, not the exit code alone.
//
// ISSUE THIS PROVES/EXPOSES: an extracted element whose MEASURED dims sit outside its OWN class's
// measured band is real data-integrity signal (broken extraction, wrong units, corrupted transform) —
// the mechanism that would have caught the 2026-07-01 furniture-floating bug (bad center_z/bbox_z)
// BEFORE it ever hit a screenshot. Measured expectation: own-class in-band 93-96% (geomap_rules.json
// per-building `measured`), so a healthy db flags ~5%; a gross extraction fault flags far more.
//
// Usage: node geomapping/validate_extraction.js <path/to/X_extracted.db> <buildingKeyOrTag> [--cap N]
//   e.g.: node geomapping/validate_extraction.js modeller/Duplex_extracted.db Duplex
// Accepts either a modeller resident key (Duplex) or a raw geomap tag (DX). Honest-refuse on unknown.
'use strict';
var fs = require('fs'), path = require('path');
var Bridge = require('./geomap_bridge.js');
var CG = require('./classify_geom.js');

var TAG = '§GEOMAP-SWEEP';
var argv = process.argv.slice(2);
var capIdx = argv.indexOf('--cap');
var CAP = capIdx > -1 ? (parseInt(argv[capIdx + 1], 10) || 20) : 20;
var args = argv.filter(function (a, i) { return !a.startsWith('--') && (capIdx === -1 || i !== capIdx + 1); });

if (args.length < 2) {
  console.log('usage: node geomapping/validate_extraction.js <X_extracted.db> <buildingKeyOrTag> [--cap N]');
  process.exit(2);
}
var dbPath = args[0];
var KNOWN_TAGS = ['SH', 'DX', 'SC', 'Terminal'];
var tag = Bridge.gmTag(args[1]) || (KNOWN_TAGS.indexOf(args[1]) > -1 ? args[1] : null);
if (!tag) {
  console.log(TAG + ' REFUSE: "' + args[1] + '" is neither a known resident key nor a mined geomap tag — no bands to validate against, refusing to guess');
  process.exit(2);
}

var MODLIB = path.join(__dirname, '..', 'modeller', 'lib');
var initSqlJs = require(path.join(MODLIB, 'sql-wasm.js'));
var wasmBinary = fs.readFileSync(path.join(MODLIB, 'sql-wasm.wasm'));

initSqlJs({ wasmBinary: wasmBinary }).then(function (SQL) {
  var db = new SQL.Database(fs.readFileSync(dbPath));
  var r = db.exec(
    'SELECT m.guid, m.ifc_class, t.bbox_x, t.bbox_y, t.bbox_z FROM elements_meta m ' +
    'JOIN element_transforms t ON t.guid = m.guid ORDER BY m.guid');
  var rows = r.length ? r[0].values : [];
  var checked = 0, flagged = [], noBand = 0, noDims = 0;
  rows.forEach(function (v) {
    var guid = v[0], cls = v[1], bx = v[2], by = v[3], bz = v[4];
    if (!(bx > 0) || !(by > 0) || !(bz > 0)) { noDims++; return; } // degenerate/NULL bbox — not validatable, not a band flag
    // tag already resolved above (resident key OR raw tag) — call the classifier on the tag directly.
    var res = CG.classify({ building: tag, dims: [bx, by, bz], ifc_class: cls });
    if (res.tier === 2) {
      checked++;
      if (!res.class_or_fact.in_band) flagged.push({ guid: guid, ifc_class: cls, z: res.class_or_fact.z, dims: [bx, by, bz] });
    } else noBand++; // class has <3 samples / no band in the artifact — honest refuse, NOT a flag
  });
  flagged.slice(0, CAP).forEach(function (f) {
    console.log(TAG + ' FLAG guid=' + f.guid + ' class=' + f.ifc_class + ' z=' + f.z +
      ' dims=' + f.dims.map(function (d) { return d.toFixed(3); }).join('x') + 'm outside own-class measured band');
  });
  if (flagged.length > CAP) console.log(TAG + ' ...' + (flagged.length - CAP) + ' more flag(s), re-run with --cap to see all');
  var rate = checked ? Math.round(1000 * flagged.length / checked) / 1000 : null;
  console.log(TAG + ' SUMMARY db=' + dbPath + ' tag=' + tag + ' rows=' + rows.length +
    ' checked=' + checked + ' flagged=' + flagged.length + ' (flag-rate ' + rate + ')' +
    ' noBand=' + noBand + ' noDims=' + noDims +
    ' — measured own-class in-band expectation ~93-96% ⇒ healthy flag-rate ~0.04-0.07; well above that = real extraction signal');
  db.close();
  process.exit(0);
}).catch(function (e) {
  console.log(TAG + ' ERROR ' + (e && e.message));
  process.exit(1);
});
