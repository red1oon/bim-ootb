#!/usr/bin/env node
// witness_alias.js — W-GEOMAP-ALIAS runtime side (bim-compiler prompts/RESUME_IFC_BOM_GEOMAPPING.md
// §ALIAS-SPEC; the mining-side checks A1-A3/A5-mining live in bim-compiler
// scripts/witness_geomap_alias.py). Read the §-log, not the exit code alone.
//
// ISSUES PROVED:
//   A2r PROXY-RECOVERY  a REAL DX element re-labelled IfcBuildingElementProxy (the industry bad-annotation
//                       case, absent from our clean corpus) still validates: its REAL type_class routes
//                       through the mined map to a banded class; result carries alias_of/alias_why —
//                       never a silent substitution.
//   A3r AMBIGUITY       an ambiguous type_class result says so (alias_ambiguous:true + candidates in why).
//   A4  RENAME          IfcWallStandardCase<->IfcWall band lookups cross schema generations BOTH ways,
//                       citing the documented IFC4 fact (SH has IfcWall bands, DX has IfcWallStandardCase).
//   A5r NON-INVENT      no type relation + no rename + no band -> tier 0 refuse; and alias() itself
//                       returns null with nothing real to infuse from — never a dims-based guess.
'use strict';
var fs = require('fs'), path = require('path');
var GROOT = path.join(__dirname, '..');
var CG = require(path.join(GROOT, 'classify_geom.js'));

var pass = 0, fail = 0;
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('§W-GEOMAP-ALIAS PASS: ' + name + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('§W-GEOMAP-ALIAS FAIL: ' + name + (extra ? '  ' + extra : '')); }
}

var relDX = JSON.parse(fs.readFileSync(path.join(GROOT, 'data', 'relations_DX.json'), 'utf8'));
var rules = JSON.parse(fs.readFileSync(path.join(GROOT, 'data', 'geomap_rules.json'), 'utf8'));
var amap = JSON.parse(fs.readFileSync(path.join(GROOT, 'data', 'alias_map.json'), 'utf8'));

// ── A2r: real DX door re-labelled as proxy — its real IfcDoorStyle/IfcDoorType relation must recover it ──
// find a typed DX element whose type_class UNAMBIGUOUSLY maps to a banded class
var dxBands = rules.buildings.DX.classes;
var fixture = null;
Object.keys(relDX.elements).sort().forEach(function (g) {
  if (fixture) return;
  var e = relDX.elements[g];
  var row = e.type_class && amap.map[e.type_class];
  if (row && !row.ambiguous && dxBands[row.winner]) fixture = { guid: g, type_class: e.type_class, truth: row.winner };
});
chk('A2r fixture exists (typed DX element, unambiguous banded winner)', !!fixture,
  fixture && ('(' + fixture.type_class + ' -> ' + fixture.truth + ')'));
var med = dxBands[fixture.truth].med.map(Math.exp); // real median dims of the true class
var r = CG.classify({ building: 'DX', dims: med, ifc_class: 'IfcBuildingElementProxy', type_class: fixture.type_class });
chk('A2r proxy-labelled element validates via mined type alias', r.tier === 2 && r.class_or_fact.validate === fixture.truth,
  '(validate=' + (r.class_or_fact && r.class_or_fact.validate) + ')');
chk('A2r result carries alias_of + alias_why (never silent)', r.alias_of === 'IfcBuildingElementProxy' && /IfcRelDefinesByType/.test(r.alias_why || ''));

// ── A3r: ambiguous type_class says so ──
var ambTc = Object.keys(amap.map).sort().find(function (tc) {
  var row = amap.map[tc];
  return row.ambiguous && Object.keys(row.classes).some(function (c) { return dxBands[c]; });
});
chk('A3r fixture exists (ambiguous type_class with a banded candidate)', !!ambTc, '(' + ambTc + ')');
var ra = CG.classify({ building: 'DX', dims: med, ifc_class: 'IfcBuildingElementProxy', type_class: ambTc });
chk('A3r ambiguous alias is FLAGGED, not presented as certain',
  ra.tier === 2 ? ra.alias_ambiguous === true && /AMBIGUOUS/.test(ra.alias_why) : ra.tier === 0,
  '(tier=' + ra.tier + ')');

// ── A4: schema-generation rename, both directions, cited ──
// DX (IFC2x3 corpus) has IfcWallStandardCase bands but NO IfcWall band; SH (IFC4) has IfcWall.
chk('A4 fixture: DX bands have WallStandardCase not Wall; SH bands have Wall',
  !!dxBands.IfcWallStandardCase && !dxBands.IfcWall && !!rules.buildings.SH.classes.IfcWall);
var wmed = dxBands.IfcWallStandardCase.med.map(Math.exp);
var r4 = CG.classify({ building: 'DX', dims: wmed, ifc_class: 'IfcWall' }); // IFC4-named element vs 2x3 corpus
chk('A4 IfcWall validates against DX IfcWallStandardCase band via documented rename',
  r4.tier === 2 && r4.class_or_fact.validate === 'IfcWallStandardCase' && /IFC4/.test(r4.alias_why || ''),
  '(why=' + (r4.alias_why || '').slice(0, 60) + ')');
var shMed = rules.buildings.SH.classes.IfcWall.med.map(Math.exp);
var r4b = CG.classify({ building: 'SH', dims: shMed, ifc_class: 'IfcWallStandardCase' }); // 2x3-named vs IFC4 corpus
chk('A4 reverse: IfcWallStandardCase validates against SH IfcWall band',
  r4b.tier === 2 && r4b.class_or_fact.validate === 'IfcWall');

// ── A5r: nothing real to infuse from -> refuse ──
var r5 = CG.classify({ building: 'DX', dims: [1, 1, 1], ifc_class: 'IfcBuildingElementProxy' });
chk('A5r proxy with NO type relation and no rename -> tier 0 refuse (no dims-guessing)',
  r5.tier === 0 && /refus/i.test(r5.why));
chk('A5r alias() itself returns null with no real signal', CG.alias(null, 'IfcBuildingElementProxy') === null);

console.log('§W-GEOMAP-ALIAS RESULT: ' + (fail ? 'RED' : 'GREEN') + ' (' + pass + ' pass, ' + fail + ' fail)');
process.exit(fail ? 1 : 0);
