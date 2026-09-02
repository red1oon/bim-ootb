#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>. SPDX-License-Identifier: MIT
//
// extract_model.js — the Odoo DICTIONARY extractor (renderer #2 increment 2, prompts/RENDERER2_ODOO.md §1).
//   Sibling of agent.js (which folds the O2C *data* chain → odoo_chain.json). This pulls the *structure*:
//   Odoo's dictionary is ir.ui.menu (menus), ir.model (windows/tables), ir.model.fields (fields). It connects
//   LIVE to the running Odoo (default odoodemo, Odoo 17, :8069) via JSON-RPC and EMITS ./odoo_model.json — the
//   Odoo analog of ad_seed.db's dictionary — which odoo_descriptor.js reads to drive the UNCHANGED iDempiere
//   chrome via the descriptor seam. NON-INVENT: every menu label, field type and record value is a pulled row.
//
//   The CURATION (which models/fields make the demo slice) is honest selection — the AD renderer curates 7
//   windows the same way (manifest.json). What is NEVER invented: the field TYPES (← ir.model.fields.ttype),
//   the menu LABELS (← ir.ui.menu.name + parent chain), the selection labels (← fields_get), the record VALUES
//   (← search_read). "folded from odoodemo (Odoo 17) via odoo_agent" — selection, not a server.
//   Run:  node extract_model.js              # → ./odoo_model.json     (override creds via env, see README)
'use strict';
var path = require('path'), fs = require('fs'), http = require('http');

var HOST = process.env.ODOO_HOST || 'localhost', PORT = Number(process.env.ODOO_PORT || 8069);
var DB = process.env.ODOO_DB || 'odoodemo', LOGIN = process.env.ODOO_LOGIN || 'admin', PASSWORD = process.env.ODOO_PASSWORD || 'admin';
var OUT = path.join(process.cwd(), 'odoo_model.json');

function rpc(service, method, args) {
  return new Promise(function (resolve, reject) {
    var body = JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service: service, method: method, args: args } });
    var req = http.request({ host: HOST, port: PORT, path: '/jsonrpc', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, function (res) {
      var d = ''; res.on('data', function (c) { d += c; }); res.on('end', function () {
        try { var j = JSON.parse(d); if (j.error) return reject(new Error(JSON.stringify(j.error.data && j.error.data.message || j.error))); resolve(j.result); }
        catch (e) { reject(e); } });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}

// ── the CURATED slice (selection, like AD's manifest of 7 windows). model → window meta + the displayed
// fields (by Odoo field name). TYPES/VALUES are pulled, never hardcoded — these names just pick the columns.
var SLICE = [
  { wid: 1001, model: 'res.partner',      window: 'Customers',     order: 'name', app: 'Sales',      menu: 'Customer',
    where: [['customer_rank', '>', 0]], fields: ['name', 'email', 'phone', 'city', 'country_id', 'customer_rank'] },
  { wid: 1002, model: 'product.template', window: 'Products',      order: 'name', app: 'Sales',      menu: 'Product',
    where: [['sale_ok', '=', true]],    fields: ['name', 'default_code', 'list_price', 'type', 'categ_id'] },
  { wid: 1003, model: 'sale.order',       window: 'Sales Orders',  order: 'name', app: 'Sales',      menu: 'Order',
    where: [],                          fields: ['name', 'partner_id', 'date_order', 'state', 'amount_untaxed', 'amount_total'] },
  { wid: 1004, model: 'account.move',     window: 'Invoices',      order: 'name', app: 'Invoicing',  menu: 'Invoice',
    where: [['move_type', '=', 'out_invoice'], ['state', '=', 'posted']], fields: ['name', 'partner_id', 'invoice_date', 'state', 'payment_state', 'amount_total'] }
];

// Odoo ir.model.fields.ttype → the chrome's referenceType (the SAME shape AD's REF_TYPES yields).
var TTYPE = { char: 'string', text: 'text', html: 'text', integer: 'integer', float: 'number',
  monetary: 'amount', boolean: 'yesno', date: 'date', datetime: 'datetime',
  many2one: 'tableDirect', selection: 'list', binary: 'string', reference: 'string' };

function sani(model) { return model.replace(/\./g, '_'); }   // res.partner → res_partner (a SQLite-safe table name)

(async function () {
  var fails = 0; function ok(c, m, d) { if (!c) fails++; console.log('   ' + (c ? '🟢' : '🔴') + ' ' + m + (d ? ' — ' + d : '')); }
  console.log('\n══ ODOO-MODEL — extract the dictionary slice from the RUNNING odoo (' + DB + ' @ ' + HOST + ':' + PORT + ') ══\n');

  var uid = await rpc('common', 'login', [DB, LOGIN, PASSWORD]);
  ok(!!uid, 'authenticated to live odoo', 'uid=' + uid);
  if (!uid) { console.log('\n§ODOO-MODEL FAIL auth\n'); process.exit(1); }
  var ver = await rpc('common', 'version', []);
  var ex = function (model, method, args, kw) { return rpc('object', 'execute_kw', [DB, uid, PASSWORD, model, method, args, kw || {}]); };

  // ── (1) identity: tenant (res.company) + admin user (res.users) — the Odoo login context (one tenant) ──
  var company = (await ex('res.company', 'search_read', [[]], { fields: ['id', 'name'], limit: 1 }))[0];
  var admin = (await ex('res.users', 'search_read', [[['id', '=', uid]]], { fields: ['id', 'name', 'login'] }))[0];
  ok(!!company && !!admin, 'tenant + user pulled', company && (company.name + ' / ' + admin.name));

  // ── (2) per-model: ir.model (table) + ir.model.fields (types) + records (values) ──
  var windows = {}, records = {}, modelMeta = {};
  for (var i = 0; i < SLICE.length; i++) {
    var s = SLICE[i], tbl = sani(s.model);
    var im = (await ex('ir.model', 'search_read', [[['model', '=', s.model]]], { fields: ['id', 'name', 'model'] }))[0];
    // field metadata (ttype/label/required/readonly) for exactly the displayed columns — types are Odoo's
    var fm = await ex('ir.model.fields', 'search_read',
      [[['model', '=', s.model], ['name', 'in', s.fields]]], { fields: ['name', 'field_description', 'ttype', 'required', 'readonly', 'relation', 'size'] });
    var byName = {}; fm.forEach(function (f) { byName[f.name] = f; });
    // selection labels (fields_get) so a 'list' field shows the friendly value, not the stored key
    var selFields = s.fields.filter(function (fn) { return byName[fn] && byName[fn].ttype === 'selection'; });
    var fg = selFields.length ? await ex(s.model, 'fields_get', [selFields], { attributes: ['selection'] }) : {};
    var selMap = {};
    selFields.forEach(function (fn) {
      var m = {}; ((fg[fn] && fg[fn].selection) || []).forEach(function (kv) { m[kv[0]] = kv[1]; }); selMap[fn] = m;
    });

    // build the field defs (contract shape) — an 'id' key field (hidden) + the displayed columns
    var fields = [{ columnName: 'id', name: 'ID', referenceType: 'id', isKey: true, isIdentifier: false,
      isDisplayed: false, isMandatory: false, isReadOnly: true, defaultValue: null, displayLogic: null, fieldLength: null }];
    s.fields.forEach(function (fn, idx) {
      var f = byName[fn] || { field_description: fn, ttype: 'char' };
      fields.push({
        columnName: fn, name: f.field_description || fn,
        referenceType: TTYPE[f.ttype] || 'string',
        isKey: false, isIdentifier: (idx === 0),     // first displayed field = the record identifier (card title)
        isDisplayed: true, isMandatory: !!f.required, isReadOnly: !!f.readonly,
        defaultValue: null, displayLogic: null, fieldLength: f.size || null,
        odooType: f.ttype, relation: f.relation || null
      });
    });

    windows[s.wid] = { id: s.wid, name: s.window, model: s.model, table: tbl,
      tabs: [{ name: s.window, tableName: tbl, tabLevel: 0, isSingleRow: false,
        whereClause: null, orderByClause: s.order, fk: null, fields: fields }] };

    // records — search_read the displayed fields; flatten m2o [id,label] → label, map selection → label
    var raw = await ex(s.model, 'search_read', [s.where], { fields: s.fields, order: s.order, limit: 500 });
    var rows = raw.map(function (r) {
      var o = { id: r.id };
      s.fields.forEach(function (fn) {
        var v = r[fn], ft = byName[fn] && byName[fn].ttype;
        if (ft === 'many2one') o[fn] = (v && v.length === 2) ? v[1] : (v || '');   // [id,label] → label
        else if (ft === 'selection') o[fn] = (selMap[fn] && selMap[fn][v]) || v;   // key → friendly label
        else if (v === false || v == null) o[fn] = '';                            // Odoo false = empty
        else o[fn] = v;
      });
      return o;
    });
    records[tbl] = rows;
    modelMeta[s.model] = { irModelName: im ? im.name : s.window, table: tbl, records: rows.length };
    ok(rows.length > 0, 'window ' + s.window + ' (' + s.model + ') pulled', 'fields=' + s.fields.length + ' rows=' + rows.length + ' table=' + tbl);
  }

  // ── (3) the menu subtree — REAL ir.ui.menu labels + parent chain leading to each slice window ──
  // Pull all menus + their act_window targets; for each slice model find the menu that opens it and rebuild
  // its parent path. The labels/hierarchy are Odoo's; we only PRUNE to the slice (faithful subtree, NON-INVENT).
  var allMenus = await ex('ir.ui.menu', 'search_read', [[]], { fields: ['id', 'name', 'parent_id', 'action'], limit: 4000 });
  var menuById = {}; allMenus.forEach(function (m) { menuById[m.id] = m; });
  // resolve act_window → res_model for the actions referenced by menus
  var awIds = {};
  allMenus.forEach(function (m) { if (m.action && /ir\.actions\.act_window,(\d+)/.test(m.action)) awIds[RegExp.$1] = 1; });
  var aw = await ex('ir.actions.act_window', 'read', [Object.keys(awIds).map(Number)], { fields: ['id', 'res_model'] });
  var modelByAw = {}; aw.forEach(function (a) { modelByAw[a.id] = a.res_model; });
  function menuModel(m) { var mm = String(m.action || '').match(/ir\.actions\.act_window,(\d+)/); return mm ? modelByAw[Number(mm[1])] : null; }

  // node registry keyed by Odoo menu id → our menu node (built lazily up the parent chain)
  var nodeById = {}, roots = [];
  function ensureNode(menuId) {
    if (nodeById[menuId]) return nodeById[menuId];
    var m = menuById[menuId]; if (!m) return null;
    var node = { id: m.id, name: (m.name || '').trim(), action: 'X', children: [] };  // folder until proven a leaf
    nodeById[menuId] = node;
    var parentId = m.parent_id && m.parent_id.length ? m.parent_id[0] : 0;
    if (parentId && menuById[parentId]) { var p = ensureNode(parentId); if (p && p.children.indexOf(node) < 0) p.children.push(node); }
    else if (roots.indexOf(node) < 0) roots.push(node);
    return node;
  }
  function depth(m) { var d = 0, cur = m; while (cur && cur.parent_id && cur.parent_id.length) { d++; cur = menuById[cur.parent_id[0]]; } return d; }
  function rootName(m) { var cur = m; while (cur && cur.parent_id && cur.parent_id.length && menuById[cur.parent_id[0]]) cur = menuById[cur.parent_id[0]]; return (cur && cur.name) || ''; }
  var leafCount = 0;
  SLICE.forEach(function (s) {
    // the menu whose action opens this model — prefer the one whose leaf name + app root match the slice
    // intent (so res.partner lands on "Customers", not "Vendors"), then fall back to the shallowest.
    var cands = allMenus.filter(function (m) { return menuModel(m) === s.model; });
    function score(m) {
      var nm = (m.name || ''), rt = rootName(m), sc = 0;
      if (s.menu && nm.toLowerCase().indexOf(s.menu.toLowerCase()) >= 0) sc -= 100;     // leaf name matches hint
      if (s.app && rt.toLowerCase().indexOf(s.app.toLowerCase()) >= 0) sc -= 50;        // under the preferred app
      return sc + depth(m);                                                             // tie-break: shallowest
    }
    cands.sort(function (a, b) { return score(a) - score(b); });
    var leaf = cands[0];
    if (!leaf) { console.log('§ODOO-MODEL no-menu model=' + s.model + ' (synthesising leaf under root)'); return; }
    var node = ensureNode(leaf.id);
    node.action = 'W'; node.windowId = s.wid; node.children = [];   // it is a window leaf, not a folder
    leafCount++;
  });
  // prune folders that ended up empty (no slice leaf underneath)
  function prune(n) { if (n.action === 'W') return n; n.children = n.children.map(prune).filter(Boolean); return n.children.length ? n : null; }
  roots = roots.map(prune).filter(Boolean);
  ok(leafCount === SLICE.length, 'menu leaves bound to windows', leafCount + '/' + SLICE.length + ' roots=' + roots.length);

  // winSet = every slice window id (the Odoo "role" can open them all — single demo tenant)
  var winIds = SLICE.map(function (s) { return s.wid; });

  var model = {
    meta: { source: 'odoodemo (Odoo ' + (ver.server_version || '17') + ') via odoo_agent/extract_model.js',
      host: HOST + ':' + PORT, db: DB, note: 'curated slice — selection, not a server; types/labels/values pulled live' },
    tenant: { id: company ? company.id : 0, name: company ? company.name : 'Odoo' },
    user: { id: admin ? admin.id : uid, name: admin ? admin.name : 'admin', clientId: company ? company.id : 0 },
    role: { id: 9001, name: 'Odoo Admin', clientId: company ? company.id : 0 },
    org: { id: 0, name: '* (All accessible)' },
    winSet: winIds,
    menu: roots,
    windows: windows,
    records: records,
    modelMeta: modelMeta
  };
  fs.writeFileSync(OUT, JSON.stringify(model, null, 2));
  var recTotal = Object.keys(records).reduce(function (a, t) { return a + records[t].length; }, 0);
  console.log('\n§ODOO-MODEL windows=' + Object.keys(windows).length + ' menuRoots=' + roots.length +
    ' records=' + recTotal + ' tenant=' + model.tenant.name + ' wrote ' + path.relative(process.cwd(), OUT) + ' bytes=' + fs.statSync(OUT).size);
  console.log('\n§ODOO-MODEL ' + (fails === 0 ? 'PASS' : 'FAIL') + ' (' + fails + ' fails)\n');
  process.exit(fails === 0 ? 0 : 1);
})().catch(function (e) { console.error('§ODOO-MODEL ERROR', e.message, e.stack); process.exit(2); });
