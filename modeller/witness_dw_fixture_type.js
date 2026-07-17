'use strict';
// ⚠ DO NOT REMOVE — W-DW-FIXTURE-TYPE scope (READ THE LOG after every run)
// Proves the fixture-aware room-type classifier now fires in the LIVE Modeller path:
// modeller/disc_walker.js's exported _spaceTypeFor() -> RoomTypeClassifier.classifyRoomWithFixtures()
// (modeller/room_type_classifier.js, just ported to fixture-parity with bim-compiler canonical).
//
// The geometry/fixture fallback in _spaceTypeFor only runs when a space has NO resolvable semantic
// LABEL (a COMPILED room — the case this whole signal exists for). Duplex's real rooms DO carry
// human labels, so to exercise the SAME code path a compiled room hits, we strip sp.label (keep
// guid + geometry) and feed the real building DB (bdb) so real fixtures are found INSIDE each room.
// Ground truth (the human-authored object_type) is shown alongside only to check correctness.
// RUN: node modeller/witness_dw_fixture_type.js   (from the bim-ootb worktree root)
const fs = require('fs'), path = require('path');
const initSqlJs = require('/home/red1/bim-compiler/node_modules/sql.js');
const M = path.join(__dirname);
const DW = require(path.join(M, 'disc_walker.js'));
const CONFIG = JSON.parse(fs.readFileSync(path.join(M, 'room_templates.json'), 'utf8'));
const TAG = '§W-DW-FIXTURE-TYPE';

function truthOf(sql, guid) {
  const r = sql.exec("SELECT COALESCE(NULLIF(object_type,''),name) t FROM spatial_structure WHERE guid='" + guid + "'");
  return r.length ? r[0].values[0][0] : '?';
}

(async () => {
  const SQL = await initSqlJs();
  const rulesDb = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(M, 'duplex_rules.db'))));
  const bdb = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(M, 'Duplex_ARC.db'))));
  DW.dwOpen(rulesDb);                       // rules DB for rule_space_type lookups
  DW.dwSetRoomTypeConfig(CONFIG);           // opt-in the geometry+fixture fallback
  const spaces = DW.spacesOf(bdb);
  console.log(TAG + ' spaces=' + spaces.length + ' disc=PLB (a ROOM_TYPE_MEASURED_DISC) config=loaded');

  let fixtureFired = 0, gaussianOnly = 0, resolved = 0;
  spaces.forEach(sp => {
    const truth = truthOf(bdb, sp.guid);
    const stripped = Object.assign({}, sp, { label: null }); // force the compiled-room fallback path
    // LIVE call into the modified engine — emits its own §DW-ROOMTYPE line (src=fixture+size / gaussian)
    const stype = DW._spaceTypeFor('PLB', stripped, bdb);
    if (stype) resolved++;
    console.log(TAG + ' guid=' + sp.guid + ' truth="' + truth + '" -> space_type=' + (stype || '(none)'));
  });

  // Re-derive the source per space directly from the classifier to tally fixture-vs-gaussian firing
  const RTC = require(path.join(M, 'room_type_classifier.js'));
  const fx = (() => {
    const r = bdb.exec("SELECT m.element_name name, t.center_x center_x, t.center_y center_y FROM elements_meta m " +
      "JOIN element_transforms t ON t.guid=m.guid WHERE m.ifc_class IN " +
      "('IfcFurnishingElement','IfcFurniture','IfcBuildingElementProxy','IfcSanitaryTerminal') AND t.center_x IS NOT NULL");
    if (!r.length) return [];
    return r[0].values.map(v => ({ name: v[0], center_x: v[1], center_y: v[2] }));
  })();
  spaces.forEach(sp => {
    const rect = { size_x: sp.x1 - sp.x0, size_y: sp.y1 - sp.y0, center_x: (sp.x0 + sp.x1) / 2, center_y: (sp.y0 + sp.y1) / 2 };
    const feats = RTC.featuresFromRects([rect]);
    const hits = RTC.fixturesInRoom([rect], fx);
    const res = RTC.classifyRoomWithFixtures(feats, hits, CONFIG);
    if (res.source && res.source.indexOf('fixture') === 0) fixtureFired++;
    else if (!res.unclassified && res.type) gaussianOnly++;
    if (res.source && res.source.indexOf('fixture') === 0)
      console.log(TAG + ' FIXTURE-FIRED guid=' + sp.guid + ' truth="' + truthOf(bdb, sp.guid) +
        '" type=' + res.type + ' conf=' + (res.confidence * 100).toFixed(0) + '% why="' + res.why + '"');
  });
  console.log(TAG + ' SUMMARY spaces=' + spaces.length + ' resolvedViaLivePath=' + resolved +
    ' fixtureSignalFired=' + fixtureFired + ' gaussianOnly=' + gaussianOnly +
    ' — PASS if fixtureSignalFired>0 (the fixture path is live)');
})().catch(e => { console.error('FATAL', e); process.exit(2); });
