// witness_meshfit_thirdtier.js -- SPEC_MESH_FIT_GRAFT_HEAL_ENGINE.md §1: proves real_geometry.js's
// buildGeometryIndex(db, geoDb, templateIndex) third argument is a real, additive contract change --
// (a) EVERY existing call site (arc_editable.js, cross_edges.js) omits it -> byte-identical resolved set,
//     now additionally carrying source_status:'MEASURED' on every already-resolved hash (pure addition,
//     no existing consumer reads that field today so nothing downstream changes behaviour),
// (b) when a caller DOES opt in with a templateIndex, a hash that the real pass left unresolved gets ONE
//     more honest chance to resolve as GRAFTED (never overriding a real MEASURED hit),
// (c) a hash neither tier can resolve stays fully unresolved -- the caller's existing hardfail/refuse path
//     is untouched, per WalkerDoctrine.md §11 (refuse, never invent).
// Pure node, no browser -- this is a pure-function contract, the right level for this kind of proof
// (feedback_whitebox_not_playwright.md: value verification via §-log, not a browser harness).
const initSqlJs = require('sql.js');
const RealGeometry = require('../real_geometry.js');

function f32(arr) { return new Float32Array(arr); }
function u32(arr) { return new Uint32Array(arr); }

(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run("CREATE TABLE element_instances (guid TEXT, geometry_hash TEXT)");
  db.run("CREATE TABLE component_geometries (geometry_hash TEXT PRIMARY KEY, vertices BLOB, faces BLOB, vertex_count INTEGER, face_count INTEGER)");

  // guid A -> hash-measured (resolvable from component_geometries -- the real/MEASURED tier)
  // guid B -> hash-graftable (NOT in component_geometries -- only resolvable via templateIndex)
  // guid C -> hash-unresolvable (in neither -- must stay unresolved, honest refuse)
  const cube = f32([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0, 1, 0, 1]);
  const tris = u32([0, 1, 2, 3, 4, 5]);
  const insGeom = db.prepare("INSERT INTO component_geometries VALUES (?,?,?,?,?)");
  insGeom.run(['hash-measured', Buffer.from(cube.buffer), Buffer.from(tris.buffer), 6, 2]);
  insGeom.free();
  const insInst = db.prepare("INSERT INTO element_instances VALUES (?,?)");
  insInst.run(['guid-A', 'hash-measured']);
  insInst.run(['guid-B', 'hash-graftable']);
  insInst.run(['guid-C', 'hash-unresolvable']);
  insInst.free();

  // (a) default call — no templateIndex — must be byte-identical in shape to the pre-existing contract,
  // plus the new additive source_status field.
  const idxDefault = RealGeometry.buildGeometryIndex(db, db);
  const measuredOk = !!idxDefault.resolved['hash-measured'] && idxDefault.resolved['hash-measured'].source_status === 'MEASURED';
  const graftableAbsent = !idxDefault.resolved['hash-graftable'];
  const unresolvableAbsent = !idxDefault.resolved['hash-unresolvable'];
  console.log('§W-MESHFIT-3TIER default-call measuredOk=' + measuredOk + ' graftableAbsent(no-templateIndex)=' + graftableAbsent +
    ' unresolvableAbsent=' + unresolvableAbsent);

  // (b) opt-in call — templateIndex resolves 'hash-graftable' only, never touches 'hash-measured' or
  // 'hash-unresolvable'.
  const templateIndex = {
    resolveGrafted: function (hash) {
      if (hash !== 'hash-graftable') return null;
      return {
        positions: f32([0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 2, 2, 0, 2, 0, 2]),
        faces: tris, bbox: [-1, 1, -1, 1, -1, 1], anchorOffset: [0, 0, 0],
        source_status: 'GRAFTED', source_template_hash: 'hash-measured', source_building: 'SJTII_Terminal'
      };
    }
  };
  const idxGrafted = RealGeometry.buildGeometryIndex(db, db, templateIndex);
  const measuredStillOk = idxGrafted.resolved['hash-measured'] && idxGrafted.resolved['hash-measured'].source_status === 'MEASURED';
  const g = idxGrafted.resolved['hash-graftable'];
  const graftedOk = g && g.source_status === 'GRAFTED' && g.source_template_hash === 'hash-measured' && g.source_building === 'SJTII_Terminal';
  const unresolvableStillAbsent = !idxGrafted.resolved['hash-unresolvable'];
  console.log('§W-MESHFIT-3TIER opt-in-call measuredStillOk=' + measuredStillOk + ' graftedOk=' + graftedOk +
    ' unresolvableStillAbsent(honest-refuse-preserved)=' + unresolvableStillAbsent);

  // (c) a templateIndex that (incorrectly) tried to override an already-MEASURED hash must be ignored --
  // MEASURED always wins, per §1's "never merged into a MEASURED bucket" rule.
  const hostileIndex = { resolveGrafted: function () { return { source_status: 'GRAFTED', source_template_hash: 'x', source_building: null }; } };
  const idxHostile = RealGeometry.buildGeometryIndex(db, db, hostileIndex);
  const measuredNeverOverridden = idxHostile.resolved['hash-measured'].source_status === 'MEASURED';
  console.log('§W-MESHFIT-3TIER measured-precedence measuredNeverOverridden=' + measuredNeverOverridden);

  const pass = measuredOk && graftableAbsent && unresolvableAbsent && measuredStillOk && graftedOk && unresolvableStillAbsent && measuredNeverOverridden;
  console.log('§W-MESHFIT-3TIER RESULT ' + (pass ? 'PASS' : 'FAIL'));
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('§W-MESHFIT-3TIER FATAL', e); process.exit(1); });
