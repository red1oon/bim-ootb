#!/usr/bin/env node
// witness_batch_bucket_class_paint.js — §BATCH_BUCKET_CLASS_PAINT
// Spec: bim-compiler prompts/4D_MODEL_INTEGRITY.md §O (§O.2 "WHY IT IS BLUE", §FIX-O.2, §PREDICTION).
//
// ISSUE THIS WITNESS PROVES OR DISPROVES:
//   Does the BatchedMesh/merge bucket key (viewer/streaming.js, the `const key = (el.storey…` line)
//   separate elements by `ifc_class`, given that the bucket's ONE material is built from
//   `items[0].el.ifcClass`? If it does not, every member of a class-mixed bucket is painted with
//   whatever class happened to land first — e.g. a plasterboard IfcCovering painted with
//   IfcBuildingElementProxy's teal (streaming.js STD_MAT `IfcBuildingElementProxy {r:0,g:.78,b:.78}`).
//
// THE FILM EVIDENCE, so nobody has to re-watch a bake to know why this matters (§O.0/§O.1):
//   out/HHS_lingerfit2_854x480.mp4, frames 3-36 (t=0.20-2.40s, Day 1-5) show ONE isolated teal
//   rectangle floating in the air. Camera recovered from the bake's own logged constants (fov=60,
//   §OFFSET, the first-op ground slab outline); all 6,880 element bboxes projected in 3 frames;
//   worst-frame-IoU winner 0.464 vs 0.327 runner-up:
//     3XrBtx9eX7mQE6EqWHPeEe  IfcCovering  "Compound Ceiling:Abgehängte Decke 5.0cm - 600 x 600:580730"
//     Level 3 / ARC / material_rgba NULL / 5.89 x 7.33 x 0.05 m at ifc z = 9.78 m
//   It is NOT §N's Stahlbalkon (7.07m vertical blade, best IoU 0.144) — see §O.4.
//
// ⚠ THE KEY IS SLICED OUT OF viewer/streaming.js AND EVALUATED, NEVER RE-TYPED HERE (W-BBCP-5).
//   A re-typed copy would drift and this witness would then be testing itself, not the shipped code.
//   Same discipline as witness_curtain_wall_opening.js's source-slice loading.
//
// ⚠ SCOPE — WHAT THIS WITNESS DOES **NOT** CLAIM: it says nothing about WHEN that ceiling panel is
//   revealed. §O.3 measured, from the played kernel_ops layer, that it is drawn ~49 project-days
//   before its own op starts; that half is UNATTRIBUTED and UNFIXED and needs an instrumented bake.
//   A green run here means "no element is painted with another class's material", nothing more.
//
// Command:  node viewer/tests/witness_batch_bucket_class_paint.js
//           (optionally: ... <path-to-a.db> to run one DB instead of the shipped set)
// Read the § log lines, not the exit code alone.
'use strict';
var fs = require('fs');
var path = require('path');
var initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');
var SQLJS_DIST = '/home/red1/bim-ootb/node_modules/sql.js/dist';
var VIEWER = path.join(__dirname, '..');
// Absolute, not __dirname-relative — same convention as witness_true_orphan_floating.js: the
// extracted DBs are large dev-machine-local fixtures shared by every worktree.
var BUILDINGS_DIR = '/home/red1/bim-ootb/buildings';
var STREAMING = path.join(VIEWER, 'streaming.js');

// The element the HHS bake showed floating (§O.1), and the class it must end up painted with.
var SIGHTING_GUID = '3XrBtx9eX7mQE6EqWHPeEe';
var SIGHTING_CLASS = 'IfcCovering';
var SIGHTING_DB = 'HHS_Office_Federated_extracted.db';

var pass = 0, fail = 0;
function ok(label, detail) { pass++; console.log('  PASS ' + label + (detail ? ' — ' + detail : '')); }
function bad(label, detail) { fail++; console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); }

// ── slice the shipped source ────────────────────────────────────────────────────────────────────
var SRC = fs.readFileSync(STREAMING, 'utf8');

function sliceBlock(startMarker) {
  var i = SRC.indexOf(startMarker);
  if (i < 0) throw new Error('§SLICE_MISS marker not found in streaming.js: ' + startMarker);
  var b = SRC.indexOf('{', i);
  if (b < 0) throw new Error('§SLICE_MISS no block after ' + startMarker);
  var depth = 0, j = b;
  for (; j < SRC.length; j++) {
    if (SRC[j] === '{') depth++;
    else if (SRC[j] === '}') { depth--; if (depth === 0) break; }
  }
  return SRC.slice(i, j + 1) + ';';
}
function sliceKeyExpr(startMarker) {
  var i = SRC.indexOf(startMarker);
  if (i < 0) throw new Error('§SLICE_MISS key expression not found: ' + startMarker);
  var eq = SRC.indexOf('=', i);
  var semi = SRC.indexOf(';', eq);           // no ';' occurs inside these string literals
  if (eq < 0 || semi < 0) throw new Error('§SLICE_MISS malformed key statement: ' + startMarker);
  return SRC.slice(eq + 1, semi).trim();
}

var BATCH_KEY_MARK = 'const key = (el.storey';
var CONSOLIDATE_KEY_MARK = "var key = (storey || '_')";
var batchKeyExpr, consolidateKeyExpr, entourageSrc, mepHintSrc, hexSrc, mepClassesSrc, lowMax;
try {
  batchKeyExpr = sliceKeyExpr(BATCH_KEY_MARK);
  consolidateKeyExpr = sliceKeyExpr(CONSOLIDATE_KEY_MARK);
  entourageSrc = sliceBlock('A._entourageVariant = function');
  hexSrc = sliceBlock('function _hexToRgb(');
  mepHintSrc = sliceBlock('A._mepNameHint = function');
  mepClassesSrc = sliceBlock('var MEP_HUE_CLASSES =');
  var m = SRC.match(/var\s+LOW_INSTANCE_BATCH_MAX\s*=\s*(\d+)\s*;/);
  if (!m) throw new Error('§SLICE_MISS LOW_INSTANCE_BATCH_MAX');
  lowMax = parseInt(m[1], 10);
} catch (e) {
  console.log('§WITNESS_BATCH_BUCKET_CLASS_PAINT SLICE_FAILED ' + e.message);
  console.log('§WITNESS_BATCH_BUCKET_CLASS_PAINT pass=0 fail=1 — could not read the shipped key; ' +
              'this is a REAL failure, not a skip (the witness must never silently test nothing)');
  process.exit(1);
}

// Rebuild just enough of the streaming module's surface for the sliced code to run.
var A = {};
var shim = new Function('A', entourageSrc + '\n' + hexSrc + '\n' + mepHintSrc + '\n' + mepClassesSrc +
  '\n A._mepHueClasses = MEP_HUE_CLASSES; return { MEP_HUE_CLASSES: MEP_HUE_CLASSES };');
shim(A);
var batchKeyOf = new Function('el', 'A', 'return (' + batchKeyExpr + ');');
var consolidateKeyOf = new Function('storey', 'disc', 'rgba', 'matVariant', 'mepHint', 'ifcClass', 'A',
  'return (' + consolidateKeyExpr + ');');

console.log('§BBCP_SLICE lowInstanceBatchMax=' + lowMax);
console.log('§BBCP_SLICE batchKeyExpr=' + batchKeyExpr.replace(/\s+/g, ' '));
console.log('§BBCP_SLICE consolidateKeyExpr=' + consolidateKeyExpr.replace(/\s+/g, ' '));

// ── THE MEASURE — counts what the shipped material assignment would mispaint ────────────────────
// streaming.js gives the whole bucket ONE material from items[0].el.ifcClass, so every member whose
// own class differs from items[0]'s is painted with a foreign class's material.
function mispaintedIn(bucketMembers) {
  var cls0 = bucketMembers[0].ifcClass;
  var n = 0;
  for (var i = 0; i < bucketMembers.length; i++) if (bucketMembers[i].ifcClass !== cls0) n++;
  return n;
}

function measure(dbFile) {
  var db = new (measure.SQL).Database(fs.readFileSync(dbFile));
  // the streaming loader's own projection (streaming.js, the _rangeDb SELECT)
  var r = db.exec("SELECT m.guid, i.geometry_hash, m.material_rgba, m.discipline, m.storey, " +
                  "m.ifc_class, m.element_name FROM elements_meta m " +
                  "JOIN element_instances i ON m.guid = i.guid " +
                  "JOIN element_transforms t ON t.guid = m.guid " +
                  "WHERE i.geometry_hash IS NOT NULL AND m.ifc_class != 'IfcOpeningElement'");
  if (!r.length || !r[0].values.length) return null;
  var byHash = Object.create(null);
  r[0].values.forEach(function (row) {
    var el = { guid: row[0], hash: row[1], rgba: row[2], disc: row[3], storey: row[4],
               ifcClass: row[5], name: row[6] };
    el.matVariant = A._entourageVariant(el.ifcClass, el.name);
    el.mepHint = A._mepNameHint(el.name);
    (byHash[el.hash] || (byHash[el.hash] = [])).push(el);
  });

  var buckets = Object.create(null);       // shipped key -> members
  Object.keys(byHash).forEach(function (h) {
    var els = byHash[h];
    if (els.length > lowMax) return;       // > LOW_INSTANCE_BATCH_MAX goes to InstancedMesh, not here
    els.forEach(function (el) {
      var k = batchKeyOf(el, A);
      (buckets[k] || (buckets[k] = [])).push(el);
    });
  });

  // The pre-fix grouping, derived from the SHIPPED key rather than re-typed: streaming.js documents
  // its key as positional with parts[0..2] read by consumers and later fields appended, so the first
  // six fields are the key as it stood before the class term was added.
  var preFix = Object.create(null);
  Object.keys(buckets).forEach(function (k) {
    var p = k.split('|').slice(0, 6).join('|');
    (preFix[p] || (preFix[p] = [])).push.apply(preFix[p], buckets[k]);
  });

  var mispainted = 0, mixedShipped = 0;
  Object.keys(buckets).forEach(function (k) {
    var w = mispaintedIn(buckets[k]);
    if (w) { mispainted += w; mixedShipped++; }
  });
  var expectedExtra = 0, mixedPreFix = 0;
  Object.keys(preFix).forEach(function (p) {
    var seen = Object.create(null), n = 0;
    preFix[p].forEach(function (e) { if (!seen[e.ifcClass]) { seen[e.ifcClass] = 1; n++; } });
    if (n > 1) { mixedPreFix++; expectedExtra += (n - 1); }
  });

  var sighting = null;
  Object.keys(buckets).forEach(function (k) {
    buckets[k].forEach(function (e) {
      if (e.guid === SIGHTING_GUID) sighting = { key: k, paintedAs: buckets[k][0].ifcClass, own: e.ifcClass };
    });
  });
  return { buckets: Object.keys(buckets).length, preFixBuckets: Object.keys(preFix).length,
           mispainted: mispainted, mixedShipped: mixedShipped, mixedPreFix: mixedPreFix,
           expectedExtra: expectedExtra, sighting: sighting, elements: r[0].values.length,
           bucketsMap: buckets };
}

initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIST, f); } }).then(function (SQL) {
  measure.SQL = SQL;

  var files;
  if (process.argv[2]) files = [process.argv[2]];
  else files = fs.existsSync(BUILDINGS_DIR)
    ? fs.readdirSync(BUILDINGS_DIR).filter(function (f) { return /_extracted\.db$/.test(f); })
        .map(function (f) { return path.join(BUILDINGS_DIR, f); })
    : [];

  if (!files.length) {
    bad('population-nonempty', 'no buildings/*_extracted.db found — the witness measured NOTHING, which is a failure, not a pass');
  }

  var sightingSeen = false;
  files.forEach(function (file) {
    var name = path.basename(file).replace(/_extracted\.db$/, '');
    var m;
    try { m = measure(file); } catch (e) { bad(name + '-readable', e.message); return; }
    if (!m) { bad(name + '-elements-extracted', 'no rows'); return; }

    console.log('§BATCH_BUCKET_CLASS_PAINT ' + name + ' elements=' + m.elements +
      ' batchBuckets=' + m.buckets + ' (preFixGrouping=' + m.preFixBuckets + ')' +
      ' classMixedBuckets=' + m.mixedShipped +
      ' paintedWithForeignClassMaterial=' + m.mispainted);

    // ── W-BBCP-1 — THE DEFECT ─────────────────────────────────────────────────────────────────
    // ISSUE: is any element painted with another ifc_class's material because the bucket key does
    // not separate classes? Must be zero. Nonzero = the §O defect is live on this building.
    if (m.mispainted === 0) ok('W-BBCP-1-' + name + '-no-foreign-class-paint', 'paintedWithForeignClassMaterial=0');
    else bad('W-BBCP-1-' + name + '-no-foreign-class-paint',
      m.mispainted + ' elements in ' + m.mixedShipped + ' class-mixed buckets take items[0]\'s material (§O.2)');

    // ── W-BBCP-3 — THE COST, DECLARED NOT HIDDEN ──────────────────────────────────────────────
    // ISSUE: does putting the class in the key fragment MORE than the class-mixed buckets? The
    // bucket count must rise by exactly sum(distinctClasses-1) over the buckets that were mixed,
    // and class-pure buckets must not split at all.
    var delta = m.buckets - m.preFixBuckets;
    if (delta === m.expectedExtra)
      ok('W-BBCP-3-' + name + '-splits-only-mixed-buckets',
        'bucketDelta=' + delta + ' == sum(distinctClasses-1)=' + m.expectedExtra +
        ' over ' + m.mixedPreFix + ' previously-mixed buckets');
    else
      bad('W-BBCP-3-' + name + '-splits-only-mixed-buckets',
        'bucketDelta=' + delta + ' != sum(distinctClasses-1)=' + m.expectedExtra +
        ' — the key is not separating exactly the mixed buckets');

    // ── W-BBCP-2 — THE SIGHTING ───────────────────────────────────────────────────────────────
    // ISSUE: the specific element the HHS bake showed floating and teal — is it painted with its
    // own class now? Named so a green run answers the user's report directly.
    if (path.basename(file) === SIGHTING_DB) {
      sightingSeen = true;
      if (!m.sighting) bad('W-BBCP-2-sighting-element-present', SIGHTING_GUID + ' not in any batch bucket on ' + SIGHTING_DB);
      else {
        console.log('§BATCH_BUCKET_CLASS_PAINT SIGHTING guid=' + SIGHTING_GUID +
          ' ownClass=' + m.sighting.own + ' paintedAs=' + m.sighting.paintedAs +
          ' bucket="' + m.sighting.key + '"');
        if (m.sighting.own === SIGHTING_CLASS && m.sighting.paintedAs === SIGHTING_CLASS)
          ok('W-BBCP-2-sighting-painted-with-own-class',
            SIGHTING_GUID + ' (the floating plate, HHS_lingerfit2 frames 3-36) is painted ' + SIGHTING_CLASS);
        else
          bad('W-BBCP-2-sighting-painted-with-own-class',
            SIGHTING_GUID + ' own=' + m.sighting.own + ' but painted as ' + m.sighting.paintedAs +
            ' — this is the teal in the bake');
      }
    }
  });
  if (!sightingSeen && !process.argv[2])
    bad('W-BBCP-2-sighting-db-present', SIGHTING_DB + ' not in ' + BUILDINGS_DIR + ' — the sighting claim was not evaluated');

  // ── W-BBCP-5 — WIRING, BOTH KEY SITES ───────────────────────────────────────────────────────
  // ISSUE: does the SHIPPED key actually separate two elements that differ ONLY in ifc_class — at
  // BOTH sites that build it (the stream/flush key and the consolidate key)? If the consolidate
  // pass keeps the old key it re-merges what the batch key split and the foreign paint comes back.
  var elA = { storey: 'Level 3', disc: 'ARC', rgba: null, ifcClass: 'IfcCovering', name: 'Plain Name:1' };
  var elB = { storey: 'Level 3', disc: 'ARC', rgba: null, ifcClass: 'IfcDoor', name: 'Plain Name:1' };
  [elA, elB].forEach(function (e) {
    e.matVariant = A._entourageVariant(e.ifcClass, e.name);
    e.mepHint = A._mepNameHint(e.name);
  });
  var kA = batchKeyOf(elA, A), kB = batchKeyOf(elB, A);
  if (kA !== kB) ok('W-BBCP-5-batch-key-separates-classes', '"' + kA + '" != "' + kB + '"');
  else bad('W-BBCP-5-batch-key-separates-classes',
    'two elements differing only in ifc_class share bucket "' + kA + '" — one will take the other\'s material');
  var cA = consolidateKeyOf(elA.storey, elA.disc, elA.rgba, elA.matVariant, elA.mepHint, elA.ifcClass, A);
  var cB = consolidateKeyOf(elB.storey, elB.disc, elB.rgba, elB.matVariant, elB.mepHint, elB.ifcClass, A);
  if (cA !== cB) ok('W-BBCP-5-consolidate-key-separates-classes', '"' + cA + '" != "' + cB + '"');
  else bad('W-BBCP-5-consolidate-key-separates-classes',
    'the consolidate pass re-merges classes the batch key split — bucket "' + cA + '"');

  // ── W-BBCP-4 — RED CONTROL ──────────────────────────────────────────────────────────────────
  // ISSUE: can the measure fire at all? A green W-BBCP-1 must mean "no mixing", never "the counter
  // is broken". Hand-build a two-class bucket (bypassing the key) and require it to be counted.
  var planted = [{ ifcClass: 'IfcBuildingElementProxy' }, { ifcClass: 'IfcCovering' }, { ifcClass: 'IfcDoor' }];
  var got = mispaintedIn(planted);
  if (got === 2) ok('W-BBCP-4-redcontrol-measure-fires', 'planted 3-element / 3-class bucket counted 2 foreign-painted');
  else bad('W-BBCP-4-redcontrol-measure-fires', 'planted mixed bucket counted ' + got + ', expected 2 — the measure cannot fail, so W-BBCP-1 proves nothing');

  console.log('§WITNESS_BATCH_BUCKET_CLASS_PAINT pass=' + pass + ' fail=' + fail);
  process.exitCode = fail ? 1 : 0;
});
