// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// open_building_db.js — the ONE reader of the open building's database (prompts/DXF2BIM_ARCHITECT_REVIEW.md U7, W-PROPS-PANEL P6-P8). Read the log after every run.
// get(): the open building's own DB (window.__dwBuf), one sql.js handle cached on the buffer (edit_delta_ui.js and proj_order_ui.js read it here; nobody closes it).
// partOf(db, guid): what the DB states about one element — elements_meta, element_type, element_pset_common (the standard Pset_*Common sets, occurrence over type);
// a table the DB lacks is null, never filled. partFor(guid): the part from the open DB. Since P-X (### P-X SPEC, W-IFC-OPEN-ONE) a raw .ifc opened in the Modeller is
// converted by the shared extractor itself (ifc_open_db.js), so its DB holds element_pset_common like every resident: U7's second conversion of that file is gone.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OpenBuildingDb = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var _db = null, _buf = null, _ifc = { file: null, p: null };
  function has(db, t) { try { return db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='" + t + "'").length > 0; } catch (e) { return false; } }
  function q(db, sql, args) { var st = db.prepare(sql), out = []; st.bind(args || []); while (st.step()) out.push(st.getAsObject()); st.free(); return out; }
  function partOf(db, guid) {
    if (!db || !guid || !has(db, 'elements_meta')) return null;
    var m = q(db, 'SELECT * FROM elements_meta WHERE guid = ?', [guid])[0]; if (!m) return null;
    var t = has(db, 'element_type') ? (q(db, 'SELECT type_name, source FROM element_type WHERE guid = ?', [guid])[0] || null) : null;
    var ps = has(db, 'element_pset_common') ? q(db, 'SELECT pset, name, value, source FROM element_pset_common WHERE guid = ? ORDER BY pset, name', [guid]) : null;
    return { guid: guid, meta: m, type: t, psets: ps };
  }
  // ---- browser only below ----
  async function sql() { return window.SQL || await window.initSqlJs({ locateFile: function (f) { return new URL('lib/' + f, location.href).href; } }); }
  async function get() {
    var b = window.__dwBuf; if (!b) return null; if (_db && _buf === b) return _db;
    var SQL = await sql(); _db = new SQL.Database(b instanceof Uint8Array ? b : new Uint8Array(b)); _buf = b; return _db;
  }
  // the element's facts: the open building's DB (resident, local .db or a raw .ifc — all made by the shared extractor)
  async function partFor(guid) { return { part: partOf(await get(), guid) }; }
  return { get: get, partOf: partOf, partFor: partFor, has: has };
});
