// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// odoo_descriptor.js — RENDERER #2: the Odoo descriptor (prompts/RENDERER2_ODOO.md, docs/IDEMPIERE_2.md
// §pivot "one renderer, N dictionaries"). Registers a SECOND ErpDescriptor whose three facets
// {structure, data, session} satisfy the SAME contract AD does (see erp_descriptor.js header), so
// `?erp=odoo` drives the UNCHANGED iDempiere chrome over an Odoo model with ZERO per-model chrome code.
//
// NON-INVENT: every menu label, field type and record value comes from odoo_model.json — extracted LIVE
// from a running Odoo (odoodemo, Odoo 17) by odoo_agent/extract_model.js via JSON-RPC. odoo_chain.json
// (the folded SO→invoice→payment slice) rides along as provenance. The browser NEVER reaches Odoo; this
// is a SELECTION of pulled rows, not a server (the AD renderer curates ad_seed.db the same way).
//
// HOW THE SEAM HOLDS WITH NO CHROME CHANGE: the chrome's render path reads rows from the sql.js `db` it
// loaded (its _tableExists/readRecords/_colExists all hit that db). So structure.init(db) INJECTS the Odoo
// slice as REAL tables into that same db — then the unchanged chrome reads Odoo rows exactly as it reads
// AD rows. The AD seed tables coexist untouched (Odoo menus/windows only ever name the injected tables);
// loading ?erp=ad never calls odoo.structure.init, so the AD path is byte-identical (regression gate).
(function (global) {
  'use strict';

  if (!global.ErpDescriptor) { console.warn('§ODOO-DESCRIPTOR ErpDescriptor absent — load erp_descriptor.js first'); return; }

  var _model = null;       // odoo_model.json (dictionary + records)
  var _chain = null;       // odoo_chain.json (provenance — the folded O2C chain)
  var _injected = false;   // tables created in the chrome db?

  // ── synchronous one-time load of the pulled artifacts (script runs in <head> before boot; the files are
  // small same-origin JSON). Sync so structure.init(db) — called un-awaited at boot — has data in hand.
  // A deprecation notice is not a pageerror; on any failure the facets degrade to an empty (honest) fold.
  function _get(url) {
    try { var x = new XMLHttpRequest(); x.open('GET', url, false); x.send(null);
      return (x.status >= 200 && x.status < 300) ? JSON.parse(x.responseText) : null; }
    catch (e) { console.warn('§ODOO-DESCRIPTOR load failed ' + url + ' — ' + e.message); return null; }
  }
  function _load() {
    if (_model) return _model;
    _model = _get('odoo_model.json') || { menu: [], windows: {}, records: {}, winSet: [],
      tenant: { id: 0, name: 'Odoo' }, user: { id: 0, name: 'admin', clientId: 0 }, role: { id: 0, name: 'Odoo', clientId: 0 }, org: { id: 0, name: '*' } };
    _chain = _get('odoo_chain.json') || null;
    var nWin = Object.keys(_model.windows || {}).length;
    var nRec = Object.keys(_model.records || {}).reduce(function (a, t) { return a + (_model.records[t] || []).length; }, 0);
    console.log('§ODOO-DESCRIPTOR loaded windows=' + nWin + ' records=' + nRec +
      ' tenant=' + (_model.tenant && _model.tenant.name) + ' chain=' + (_chain ? _chain.meta.so : 'none') + ' source=' + (_model.meta && _model.meta.source));
    return _model;
  }

  function _esc(t) { return '"' + String(t).replace(/"/g, '""') + '"'; }

  // ── STRUCTURE facet (← AD ADParser) ───────────────────────────────────────────────────────────────
  // init(db): inject the Odoo slice as real tables into the chrome's db (idempotent — DROP then CREATE),
  // so the unchanged render path reads Odoo rows through its normal SELECTs. Columns = the window's fields.
  function init(db) {
    _load();
    if (_injected || !db) return;
    try {
      var wins = _model.windows || {}, recs = _model.records || {}, made = 0, rows = 0;
      Object.keys(wins).forEach(function (wid) {
        var tab = (wins[wid].tabs || [])[0]; if (!tab) return;
        var table = tab.tableName, cols = (tab.fields || []).map(function (f) { return f.columnName; });
        if (cols.indexOf('id') < 0) cols.unshift('id');
        db.run('DROP TABLE IF EXISTS ' + _esc(table));
        db.run('CREATE TABLE ' + _esc(table) + ' (' + cols.map(_esc).join(',') + ')');
        var ins = 'INSERT INTO ' + _esc(table) + ' (' + cols.map(_esc).join(',') + ') VALUES (' + cols.map(function () { return '?'; }).join(',') + ')';
        (recs[table] || []).forEach(function (r) {
          db.run(ins, cols.map(function (c) { var v = r[c]; return (v === undefined || v === null) ? null : (typeof v === 'boolean' ? (v ? 1 : 0) : v); }));
          rows++;
        });
        made++;
      });
      _injected = true;
      console.log('§ODOO-DESCRIPTOR init tables=' + made + ' rows=' + rows + ' (injected into chrome db)');
    } catch (e) { console.warn('§ODOO-DESCRIPTOR init failed — ' + e.message); }
  }
  function getMenuTree(db) {
    _load();
    var roots = _model.menu || [];
    console.log('§ODOO-DESCRIPTOR getMenuTree roots=' + roots.length + ' source=ir.ui.menu(folded)');
    return JSON.parse(JSON.stringify(roots));   // clone — scopeMenu must not mutate the cache
  }
  function getWindow(db, windowId) {
    _load();
    var w = (_model.windows || {})[windowId] || (_model.windows || {})[String(windowId)];
    if (!w) { console.log('§ODOO-DESCRIPTOR getWindow id=' + windowId + ' not-in-fold'); return null; }
    console.log('§ODOO-DESCRIPTOR getWindow id=' + windowId + ' name=' + w.name + ' tabs=' + (w.tabs ? w.tabs.length : 0) + ' model=' + w.model);
    return JSON.parse(JSON.stringify(w));
  }

  // ── DATA facet (← AD ADData) ──────────────────────────────────────────────────────────────────────
  // readRecords: the Odoo slice is real tables in db, so this is the SAME generic SELECT the AD path runs.
  function readRecords(db, tableName, where, orderBy) {
    if (!db) return [];
    var sql = 'SELECT * FROM ' + _esc(tableName);
    if (where) sql += ' WHERE ' + where;
    if (orderBy) sql += ' ORDER BY ' + orderBy;
    try {
      var r = db.exec(sql); if (!r.length) { console.log('§ODOO-DESCRIPTOR readRecords table=' + tableName + ' count=0'); return []; }
      var cols = r[0].columns;
      var rows = r[0].values.map(function (row) { var o = {}; for (var i = 0; i < cols.length; i++) o[cols[i]] = row[i]; return o; });
      console.log('§ODOO-DESCRIPTOR readRecords table=' + tableName + ' where=' + (where || '*') + ' count=' + rows.length);
      return rows;
    } catch (e) { console.log('§ODOO-DESCRIPTOR readRecords ERROR table=' + tableName + ' err=' + e.message); return []; }
  }
  // resolveFK: Odoo many2one values are flattened to their display label at extract time (name_get), so the
  // cell already holds the human label — return it as-is (the contract: a display string for an FK value).
  function resolveFK(db, columnName, value) { return (value == null || value === '') ? null : String(value); }

  // ── SESSION facet (← AD IdmpSession) ────────────────────────────────────────────────────────────────
  // One Odoo tenant (res.company) · one user (res.users admin) · one role. winSet = every slice window.
  // scopeMenu is reused VERBATIM from IdmpSession (a pure tree-prune — model-agnostic). NON-INVENT: the
  // tenant/user names are pulled rows; the single-role grant mirrors Odoo's superuser opening every menu.
  function _tenant() { _load(); return _model.tenant || { id: 0, name: 'Odoo' }; }
  function _user() { _load(); return _model.user || { id: 0, name: 'admin', clientId: 0 }; }
  function _role() { _load(); return _model.role || { id: 0, name: 'Odoo', clientId: 0 }; }
  function _org() { _load(); return _model.org || { id: 0, name: '* (All accessible)' }; }
  function _winSet() { _load(); var s = {}; (_model.winSet || []).forEach(function (id) { s[Number(id)] = true; }); return s; }

  function listClients(db) { var t = _tenant(); console.log('§ODOO-DESCRIPTOR listClients tenant=' + t.name); return [{ id: t.id, name: t.name, users: 1 }]; }
  function listUsers(db) { var u = _user(); return [{ id: u.id, name: u.name, clientId: u.clientId, hasRoles: true }]; }
  function usersForClient(db, clientId) { return listUsers(db); }
  function rolesForUser(db, userId) { var r = _role(); return [{ id: r.id, name: r.name, clientId: r.clientId }]; }
  function clientFor(db, roleId) { var t = _tenant(); return { id: t.id, name: t.name }; }
  function orgsForRole(db, roleId) { var o = _org(); return [{ id: o.id, name: o.name }]; }
  function deleteClient(db, clientId) { console.log('§ODOO-DESCRIPTOR deleteClient REFUSED (Odoo fold is read-only)'); return { ok: false, protected: true, deleted: 0, tables: 0 }; }
  function scopeMenu(roots, winSet, procSet, formSet) {
    if (global.IdmpSession && global.IdmpSession.scopeMenu) return global.IdmpSession.scopeMenu(roots, winSet, procSet, formSet);
    return { tree: roots || [], visible: 0, total: 0 };   // fallback (never expected — idmp_session.js loads first)
  }
  function buildContext(db, userId, opts) {
    opts = opts || {};
    var u = _user(), r = _role(), t = _tenant(), o = _org();
    var ctx = { user: { id: u.id, name: u.name }, role: r, client: { id: t.id, name: t.name }, org: o,
      roles: [r], orgs: [o], winSet: _winSet(), procSet: {}, formSet: {} };
    console.log('§ODOO-DESCRIPTOR buildContext user=' + u.name + ' role=' + r.name + ' client=' + t.name + ' winSet=' + Object.keys(ctx.winSet).length);
    return ctx;
  }

  global.OdooStructure = { init: init, getMenuTree: getMenuTree, getWindow: getWindow };
  global.OdooData = { readRecords: readRecords, resolveFK: resolveFK };
  global.OdooSession = { listClients: listClients, listUsers: listUsers, usersForClient: usersForClient,
    rolesForUser: rolesForUser, clientFor: clientFor, orgsForRole: orgsForRole, deleteClient: deleteClient,
    scopeMenu: scopeMenu, buildContext: buildContext };

  global.ErpDescriptor.register('odoo', {
    id: 'odoo', label: 'Odoo',
    structure: global.OdooStructure,
    data: global.OdooData,
    session: global.OdooSession
  });
  console.log('§ODOO-DESCRIPTOR registered=odoo (renderer #2 — one renderer, N dictionaries)');

  if (typeof module !== 'undefined' && module.exports) module.exports = { OdooStructure: global.OdooStructure, OdooData: global.OdooData, OdooSession: global.OdooSession };
})(typeof window !== 'undefined' ? window : this);
