/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// provisional_totals.js — §11 P7 (prompts/DISC_WALK_BAND_NO_HOST.md "§11 P7 SPEC"). Owner 2026-11-08: "Leave them out".
// A walked device the Modeller marks provisional (borrowed density: a count, not a location) is carried into an exported
// Viewer DB as element_pset_common(pset='BIMOOTB_Walk', name='Provisional', value='TRUE'). The Viewer's class, room,
// storey and discipline totals and its quantities leave such rows out; the devices stay drawn, listed and labelled.
// ONE owner of the predicate: a count site swaps its COUNT(*) / SUM(expr) for ProvTotals.count / .sum and never writes it.
// A DB with no provisional row gets the literal COUNT(*) / SUM(expr) back, so its SQL (and totals) are byte-identical.
// Red control: window.__vwCountProvisional = true counts them again. Dual-mode: browser global + require().
(function (root) {
  'use strict';
  var PRED = "pset='BIMOOTB_Walk' AND name='Provisional' AND value='TRUE'";
  var SUB = 'SELECT guid FROM element_pset_common WHERE ' + PRED;
  var cache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  var sites = {};

  function _state(db) {
    if (!db || typeof db.exec !== 'function') return { n: 0, set: null };
    var s = cache && cache.get(db);
    if (s) return s;
    s = { n: 0, set: null };
    try {
      var t = db.exec("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='element_pset_common'");
      if (t.length && +t[0].values[0][0] > 0) {
        var c = db.exec('SELECT COUNT(*) FROM element_pset_common WHERE ' + PRED);
        s.n = c.length ? +c[0].values[0][0] : 0;
      }
    } catch (e) { s.n = 0; s.err = e.message; }
    if (cache) cache.set(db, s);
    console.log('§PROV-TOTALS provisional=' + s.n + (s.n ? ' rule=leave-out' : ' totals unchanged') + (s.err ? ' err=' + s.err : ''));
    return s;
  }
  function _on(db) {
    if (root.__vwCountProvisional === true) return false;   // red control: count them, as before P7
    return _state(db).n > 0;
  }
  function _hit(site) { var k = site || '?'; sites[k] = (sites[k] || 0) + 1; }
  function _cond(col) { return (col || 'guid') + ' NOT IN (' + SUB + ')'; }

  var PT = {
    PRED: PRED,
    sites: sites,
    // COUNT(*) or its provisional-free form. Keeps every group (an all-provisional class counts 0, it does not vanish).
    count: function (db, col, site) {
      if (!_on(db)) return 'COUNT(*)';
      _hit(site);
      return 'COALESCE(SUM(CASE WHEN ' + _cond(col) + ' THEN 1 ELSE 0 END),0)';
    },
    // SUM(expr) or the same sum over non-provisional rows only.
    sum: function (db, expr, col, site) {
      if (!_on(db)) return 'SUM(' + expr + ')';
      _hit(site);
      return 'SUM(CASE WHEN ' + _cond(col) + ' THEN (' + expr + ') ELSE 0 END)';
    },
    // How many provisional rows the DB holds (0 = no walk set, or the red switch is on).
    provisional: function (db) { return _on(db) ? _state(db).n : 0; },
    // One cached set per DB, for labelling list rows. Labels show whatever the switch says.
    isProvisional: function (db, guid) {
      var s = _state(db);
      if (!s.n || guid == null) return false;
      if (!s.set) {
        s.set = new Set();
        try { var r = db.exec(SUB); (r.length ? r[0].values : []).forEach(function (v) { s.set.add(String(v[0])); }); } catch (e) { /* stays empty */ }
      }
      return s.set.has(String(guid));
    },
    reset: function (db) { if (cache && db) cache.delete(db); }
  };

  root.ProvTotals = PT;
  if (typeof module !== 'undefined' && module.exports) module.exports = PT;
})(typeof window !== 'undefined' ? window : globalThis);
