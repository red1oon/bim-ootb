// ⚠ DO NOT REMOVE — the `_2d.db` sidecar (prompts/DXF2BIM_FOUNDATION_LANE.md F7, W-2D-SIDECAR). The Viewer's building db carries none of the six tables the 2D writer reads and comes from
// another extraction than the writer's (the OCI Duplex has 1,122 elements, the writer's extraction of it 289: reading the two together is the orphan-meta bug). So the sidecar is the
// writer's WHOLE input from ONE extraction: the six tables plus the drawable classes' rows, transforms, instances and the geometries those use. The Viewer opens it ON ITS OWN, on its
// first 2D press (never at load). Pure: works on sql.js Database objects (browser and Node), no DOM, no fs.
//   build(SQL, db) -> {bytes: Uint8Array of the sidecar, missing: [tables the source lacks]}
// Nothing is guessed: a table the source lacks is reported in `missing`, never invented.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.Std2dSidecar = factory();
})(this, function () {
  'use strict';
  const SIX = ['element_world_bbox', 'door_operation', 'rel_fills_host', 'storey_elevation', 'element_type', 'element_pset_common'];
  // the classes the writer's loadModel reads (std2d.js loadModel) and the curtain-wall parts it adds
  const CLASSES = ['IfcWall', 'IfcWallStandardCase', 'IfcDoor', 'IfcWindow', 'IfcSlab', 'IfcRoof', 'IfcFooting', 'IfcColumn', 'IfcOpeningElement', 'IfcStair', 'IfcStairFlight'];
  const IN = "('" + CLASSES.join("','") + "')";
  const PARTS = "(SELECT child_guid FROM element_parts WHERE parent_class = 'IfcCurtainWall' AND child_class IN ('IfcPlate','IfcMember'))";
  const all = (db, sql, p) => { const st = db.prepare(sql); const out = []; try { if (p) st.bind(p); while (st.step()) out.push(st.getAsObject()); } finally { st.free(); } return out; };
  const has = (db, name) => all(db, "SELECT 1 x FROM sqlite_master WHERE type='table' AND name=?", [name]).length > 0;
  function build(SQL, db) {
    const out = new SQL.Database(), missing = [], hasParts = has(db, 'element_parts');
    const drawable = "SELECT guid FROM elements_meta WHERE ifc_class IN " + IN + (hasParts ? " OR guid IN " + PARTS : '');
    // [table, WHERE over the source (null = whole table)]; elements_meta also keeps the curtain-wall parents (the writer reads their names, std2d.js loadModel)
    const plan = [
      ['elements_meta', 'guid IN (' + drawable + ") OR ifc_class = 'IfcCurtainWall'"], ['element_transforms', 'guid IN (' + drawable + ')'], ['element_instances', 'guid IN (' + drawable + ')'],
      ['component_geometries', 'geometry_hash IN (SELECT geometry_hash FROM element_instances WHERE guid IN (' + drawable + '))'],
      ['spatial_structure', null], ['element_parts', "parent_class = 'IfcCurtainWall'"]].concat(SIX.map(t => [t, null]));
    plan.forEach(([name, where]) => {
      if (!has(db, name)) { if (name !== 'element_parts') missing.push(name); return; }
      const sql = all(db, "SELECT sql FROM sqlite_master WHERE type='table' AND name=?", [name])[0].sql; out.run(sql);
      const rows = all(db, 'SELECT * FROM ' + name + (where ? ' WHERE ' + where : '')); if (!rows.length) return;
      const cols = Object.keys(rows[0]), ins = out.prepare('INSERT INTO ' + name + ' (' + cols.join(',') + ') VALUES (' + cols.map(() => '?').join(',') + ')');
      out.run('BEGIN'); try { rows.forEach(r => ins.run(cols.map(c => r[c]))); out.run('COMMIT'); } catch (e) { out.run('ROLLBACK'); throw e; } finally { ins.free(); }
    });
    const bytes = out.export(); out.close(); return { bytes, missing };
  }
  return { SIX, CLASSES, build };
});
