// ⚠ DO NOT REMOVE — the `_2d.db` sidecar (prompts/DXF2BIM_FOUNDATION_LANE.md F7, W-2D-SIDECAR). The Viewer's building db carries none of the six tables the 2D writer reads;
// they travel in a small sidecar fetched on the first press of the 2D button. Pure: works on sql.js Database objects (browser and Node), no DOM, no fs.
//   build(SQL, db)   -> Uint8Array of a new sqlite file holding exactly the six tables of `db` (their CREATE text and rows)
//   merge(dst, side) -> copies the six tables of `side` into `dst` (the Viewer's loaded db, in memory only); returns {tables, rows}
// Nothing is guessed: a table missing from the source is reported in `missing`, never invented.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.Std2dSidecar = factory();
})(this, function () {
  'use strict';
  const TABLES = ['element_world_bbox', 'door_operation', 'rel_fills_host', 'storey_elevation', 'element_type', 'element_pset_common'];
  const all = (db, sql, p) => { const st = db.prepare(sql); const out = []; try { if (p) st.bind(p); while (st.step()) out.push(st.getAsObject()); } finally { st.free(); } return out; };
  function dump(db) {
    const t = [], missing = [];
    TABLES.forEach(name => {
      const m = all(db, "SELECT sql FROM sqlite_master WHERE type='table' AND name=?", [name]);
      if (!m.length) { missing.push(name); return; }
      const rows = all(db, 'SELECT * FROM ' + name), cols = rows.length ? Object.keys(rows[0]) : all(db, 'PRAGMA table_info(' + name + ')').map(c => c.name);
      t.push({ name, sql: m[0].sql, cols, rows });
    });
    return { tables: t, missing };
  }
  function fill(dst, d) {
    let n = 0;
    d.tables.forEach(t => {
      dst.run('DROP TABLE IF EXISTS ' + t.name); dst.run(t.sql);
      const ins = dst.prepare('INSERT INTO ' + t.name + ' (' + t.cols.join(',') + ') VALUES (' + t.cols.map(() => '?').join(',') + ')');
      dst.run('BEGIN'); try { t.rows.forEach(r => { ins.run(t.cols.map(c => r[c])); n++; }); dst.run('COMMIT'); } catch (e) { dst.run('ROLLBACK'); throw e; } finally { ins.free(); }
    });
    return { tables: d.tables.length, rows: n, missing: d.missing };
  }
  function build(SQL, db) { const d = dump(db), out = new SQL.Database(); fill(out, d); const b = out.export(); out.close(); return { bytes: b, missing: d.missing }; }
  function merge(dst, side) { return fill(dst, dump(side)); }
  return { TABLES, build, merge, dump };
});
