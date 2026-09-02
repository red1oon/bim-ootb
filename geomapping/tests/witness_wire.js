#!/usr/bin/env node
// witness_wire.js — W-GEOMAP-WIRE (bim-compiler prompts/RESUME_IFC_BOM_GEOMAPPING.md §WIRE-SPEC).
// PURE NODE (sql.js, real modeller/Duplex_extracted.db). Read the §-log, not the exit code alone.
//
// ISSUES PROVED (each check names the failure it would expose):
//   W1 ops-untouched   audit layer present vs absent → op arrays DEEP-EQUAL. Exposes: the geomap wiring
//                      perturbing the signed op substrate (the one thing §WIRE-SPEC forbids).
//   W2 audit-honest    checked+noBand == seeded ops; every flag carries guid+z+why. Exposes: silent
//                      double-count / uncited flags.
//   W3 test-bites      ONE in-memory corrupted bbox → that guid IS flagged. Exposes: a validator that
//                      never fires (the furniture-floating mechanism must actually bite).
//   W4 signal-mapping  wcGeomapSignal maps tier1→1.0 / tier2→measured / tier0→0, why non-empty always.
//                      Exposes: fabricated confidence where the artifact refused.
//   W5 honest-tag      unknown building key → null tag + tier-0 refuse. Exposes: guessed tags.
//   W6 sweep-runs      CLI sweep on the real repo Duplex db: checked>0, flag-rate ≤ 0.15 (measured
//                      own-class in-band 93-96% ⇒ ~5% expected; the LOG carries the exact number).
'use strict';
var fs = require('fs'), path = require('path'), cp = require('child_process');

global.window = global.window || {};
global.fetch = undefined;
if (typeof global.crypto === 'undefined') global.crypto = require('crypto').webcrypto;

var GROOT = path.join(__dirname, '..');            // geomapping/
var REPO = path.join(GROOT, '..');                 // repo root
var MOD = path.join(REPO, 'modeller');

var Bridge = require(path.join(GROOT, 'geomap_bridge.js'));
var CG = require(path.join(GROOT, 'classify_geom.js'));
var ArcEditable = require(path.join(MOD, 'arc_editable.js'));
var WC = require(path.join(MOD, 'walker_confidence.js'));

var initSqlJs = require(path.join(MOD, 'lib', 'sql-wasm.js'));
var wasmBinary = fs.readFileSync(path.join(MOD, 'lib', 'sql-wasm.wasm'));
var DBPATH = path.join(MOD, 'Duplex_extracted.db');

var pass = 0, fail = 0;
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('§W-GEOMAP-WIRE PASS: ' + name + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('§W-GEOMAP-WIRE FAIL: ' + name + (extra ? '  ' + extra : '')); }
}

initSqlJs({ wasmBinary: wasmBinary }).then(function (SQL) {
  console.log('═══ W-GEOMAP-WIRE — audit-first geomap wiring (node, REAL Duplex) ═══');
  var buf = fs.readFileSync(DBPATH);
  var classify = { validate: function (cls, dims) { return Bridge.gmValidate('Duplex', dims, cls); } };

  // ── W1: ops byte-identical with vs without the audit layer ──
  var dbA = new SQL.Database(buf);
  var plain = ArcEditable.buildSeedOps(dbA);
  dbA.close();
  var dbB = new SQL.Database(buf);
  var audited = ArcEditable.buildSeedOps(dbB, undefined, { classify: classify });
  dbB.close();
  chk('W1 ops deep-equal with/without classify (substrate untouched)',
    JSON.stringify(plain.ops) === JSON.stringify(audited.ops),
    '(' + plain.ops.length + ' ops)');
  chk('W1 plain run has NO geomap block (old callers see zero new surface)', plain.geomap == null);

  // ── W2: audit accounting is honest ──
  var g = audited.geomap;
  chk('W2 audit block present when classify injected', !!g);
  chk('W2 checked+noBand == seeded ops (every element accounted once)',
    !!g && g.checked + g.noBand === audited.ops.length,
    '(checked=' + (g && g.checked) + ' noBand=' + (g && g.noBand) + ' ops=' + audited.ops.length + ')');
  chk('W2 every flag carries guid+z+why (cited, never bare)',
    !!g && g.flagged.every(function (f) { return f.guid && typeof f.z === 'number' && f.why; }),
    '(flagged=' + (g && g.flagged.length) + ' inBandRate=' + (g && g.inBandRate) + ')');

  // ── W3: negative control — corrupt ONE element's bbox in-memory, it MUST get flagged ──
  var dbC = new SQL.Database(buf);
  // pick a seeded element of a banded class that is currently NOT flagged (so the corruption alone flips it)
  var target = null;
  var flaggedSet = {};
  g.flagged.forEach(function (f) { flaggedSet[f.guid] = 1; });
  for (var i = 0; i < audited.ops.length; i++) {
    var op = audited.ops[i];
    var cls = op.params.ifc_class;
    if (flaggedSet[op.outputGuid]) continue;
    var probe = Bridge.gmValidate('Duplex', [1, 1, 1], cls); // banded class? (dims irrelevant for tier check)
    if (probe.tier === 2) { target = op.outputGuid; break; }
  }
  chk('W3 fixture: found an unflagged banded-class element to corrupt', !!target, '(' + target + ')');
  dbC.run("UPDATE element_transforms SET bbox_x=bbox_x*100, bbox_y=bbox_y*100, bbox_z=bbox_z*100 WHERE guid='" + target + "'");
  var corrupted = ArcEditable.buildSeedOps(dbC, undefined, { classify: classify });
  dbC.close();
  var nowFlagged = corrupted.geomap.flagged.some(function (f) { return f.guid === target; });
  chk('W3 corrupted element IS flagged (the validator bites — furniture-floating mechanism)', nowFlagged,
    '(flagged ' + corrupted.geomap.flagged.length + ' vs baseline ' + g.flagged.length + ')');

  // ── W4: wcGeomapSignal maps each tier's measured number through, never fabricates ──
  var relDX = JSON.parse(fs.readFileSync(path.join(GROOT, 'data', 'relations_DX.json'), 'utf8'));
  var relGuid = Object.keys(relDX.elements).sort().find(function (gu) { return relDX.elements[gu].storey; });
  var s1 = WC.wcGeomapSignal(CG.classify({ building: 'DX', guid: relGuid }));
  chk('W4 tier1 → conf 1.0 + why', s1.tier === 1 && s1.conf === 1.0 && !!s1.why, '(' + relGuid + ')');
  var t2res = CG.classify({ building: 'DX', dims: [0.1, 0.9, 2.1] });
  var s2 = WC.wcGeomapSignal(t2res);
  chk('W4 tier2 → the result\'s own MEASURED confidence', s2.tier === 2 && s2.conf === t2res.confidence && s2.conf > 0 && s2.conf < 1,
    '(conf=' + s2.conf + ')');
  var s0 = WC.wcGeomapSignal(CG.classify({ building: 'DX', guid: 'no-such-guid-anywhere' }));
  chk('W4 tier0 refuse → conf 0 + the refusal\'s why', s0.tier === 0 && s0.conf === 0 && /refus/i.test(s0.why));

  // ── W5: honest tag mapping ──
  chk('W5 known keys map (Duplex→DX, SampleCastle-ARC→SC, Terminal→Terminal)',
    Bridge.gmTag('Duplex') === 'DX' && Bridge.gmTag('SampleCastle-ARC') === 'SC' && Bridge.gmTag('Terminal') === 'Terminal');
  var refuse = Bridge.gmValidate('NopeBuilding', [1, 1, 1], 'IfcWall');
  chk('W5 unknown key → null tag + tier-0 refuse (never a guessed tag)',
    Bridge.gmTag('NopeBuilding') === null && refuse.tier === 0 && /refus/i.test(refuse.why));

  // ── W6: the CLI sweep runs on the real repo db and reports a sane measured rate ──
  var out = cp.execFileSync('node', [path.join(GROOT, 'validate_extraction.js'), DBPATH, 'Duplex'], { encoding: 'utf8' });
  process.stdout.write(out);
  var m = out.match(/checked=(\d+) flagged=(\d+) \(flag-rate ([\d.]+)\)/);
  chk('W6 sweep SUMMARY present with checked>0', !!m && parseInt(m[1], 10) > 0, m && '(checked=' + m[1] + ')');
  chk('W6 flag-rate ≤ 0.15 (measured in-band 93-96% ⇒ expected ~5%; bound catches gross misuse)',
    !!m && parseFloat(m[3]) <= 0.15, m && '(rate=' + m[3] + ')');

  console.log('§W-GEOMAP-WIRE RESULT: ' + (fail ? 'RED' : 'GREEN') + ' (' + pass + ' pass, ' + fail + ' fail)');
  process.exit(fail ? 1 : 0);
}).catch(function (e) {
  console.log('§W-GEOMAP-WIRE FATAL ' + (e && e.stack));
  process.exit(1);
});
