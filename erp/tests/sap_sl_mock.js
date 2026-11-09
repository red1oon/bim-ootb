// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — sap_sl_mock.js: a local stand-in for an SAP Business One Service Layer, for W-SAP-MIGRATE (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §SAP-SPEC).
//   It answers only what the agent asks, the way SAP's guide says the Service Layer does: POST Login → B1SESSION + ROUTEID cookies (§3.1); every other call needs them;
//   GET $metadata (§3.3); GET <set>/$count (§3.7 table); GET <set>?$select= with Prefer: odata.maxpagesize and odata.nextLink "/b1s/v1/<set>?…&$skip=n" (§3.7 pagination);
//   POST Logout (§3.1). Its $metadata is GENERATED from the fixture (each type lists only the fields the fixture rows carry, plus its key) — it is NOT SAP's metadata,
//   which is not ours to ship. Every request is recorded (method + path) so the witness can check the agent is read-only.
'use strict';
var http = require('http');
function start(fixture, opts) {
  opts = opts || {}; var calls = [], SESSION = 'B1SESSION=mock-' + Date.now().toString(36), drop = opts.dropField || null;
  var TYPES = { UnitOfMeasurements: 'UnitOfMeasurement', PaymentTermsTypes: 'PaymentTermsType', ItemGroups: 'ItemGroups', ChartOfAccounts: 'ChartOfAccount', BusinessPartners: 'BusinessPartner',
    Items: 'Item', PriceLists: 'PriceList', Warehouses: 'Warehouse', BinLocations: 'BinLocation' };
  function props(set) { var p = {}; p[fixture.keys[set]] = 1; (fixture.sets[set] || []).forEach(function (r) { Object.keys(r).forEach(function (k) { if (k !== '_src') p[k] = 1; }); });
    if (drop && drop.set === set) delete p[drop.field]; return Object.keys(p); }
  function metadata() {
    var x = '<?xml version="1.0" encoding="utf-8"?>\n<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"><edmx:DataServices><Schema Namespace="SAPB1" xmlns="http://docs.oasis-open.org/odata/ns/edm">\n';
    Object.keys(TYPES).forEach(function (s) { x += '<EntityType Name="' + TYPES[s] + '"><Key><PropertyRef Name="' + fixture.keys[s] + '"/></Key>' + props(s).map(function (p) { return '<Property Name="' + p + '" Type="Edm.String"/>'; }).join('') + '</EntityType>\n'; });
    x += '<EntityContainer Name="ServiceLayer">' + Object.keys(TYPES).map(function (s) { return '<EntitySet EntityType="SAPB1.' + TYPES[s] + '" Name="' + s + '"/>'; }).join('') + '</EntityContainer></Schema></edmx:DataServices></edmx:Edmx>\n';
    return x;
  }
  var srv = http.createServer(function (req, res) {
    var u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname); calls.push(req.method + ' ' + p + (u.search ? decodeURIComponent(u.search) : ''));
    function send(code, body, type, extra) { res.writeHead(code, Object.assign({ 'Content-Type': type || 'application/json' }, extra || {})); res.end(typeof body === 'string' ? body : JSON.stringify(body)); }
    var body = ''; req.on('data', function (c) { body += c; }); req.on('end', function () {
      if (req.method === 'POST' && p === '/b1s/v1/Login') { var j = {}; try { j = JSON.parse(body); } catch (e) {}
        if (!j.CompanyDB || !j.UserName || !j.Password) return send(401, { error: { code: -1, message: { lang: 'en-us', value: 'mock: CompanyDB, UserName and Password are required' } } });
        return send(200, { 'odata.metadata': '/b1s/v1/$metadata#B1Sessions/@Element', SessionId: SESSION.split('=')[1], Version: '1000000', SessionTimeout: 30 }, null, { 'Set-Cookie': [SESSION + ';HttpOnly;', 'ROUTEID=.node1; path=/b1s'] }); }
      if (String(req.headers.cookie || '').indexOf(SESSION) < 0) return send(401, { error: { code: 301, message: { lang: 'en-us', value: 'Invalid session.' } } });
      if (req.method === 'POST' && p === '/b1s/v1/Logout') return send(204, '');
      if (req.method === 'GET' && p === '/b1s/v1/$metadata') return send(200, metadata(), 'application/xml');
      var m = /^\/b1s\/v1\/([A-Za-z]+)(\/\$count)?$/.exec(p); if (req.method !== 'GET' || !m || !TYPES[m[1]]) return send(404, { error: { code: -1, message: { lang: 'en-us', value: 'mock: not served ' + req.method + ' ' + p } } });
      var rows = (fixture.sets[m[1]] || []).map(function (r) { var o = {}; Object.keys(r).forEach(function (k) { if (k !== '_src') o[k] = r[k]; }); return o; });
      if (m[2]) return send(200, String(rows.length), 'text/plain');
      var sel = (u.searchParams.get('$select') || '').split(',').filter(Boolean), have = props(m[1]), bad = sel.filter(function (f) { return have.indexOf(f) < 0; });
      if (bad.length) return send(400, { error: { code: -1000, message: { lang: 'en-us', value: 'Property \'' + bad[0] + '\' of \'' + TYPES[m[1]] + '\' is invalid' } } });
      var size = Number((/odata\.maxpagesize=(\d+)/.exec(String(req.headers.prefer || '')) || [])[1] || 20), skip = Number(u.searchParams.get('$skip') || 0), page = rows.slice(skip, skip + size);
      var out = { 'odata.metadata': '/b1s/v1/$metadata#' + m[1], value: page.map(function (r) { if (!sel.length) return r; var o = {}; sel.forEach(function (f) { if (r[f] !== undefined) o[f] = r[f]; }); return o; }) };
      if (skip + size < rows.length) out['odata.nextLink'] = '/b1s/v1/' + m[1] + '?$select=' + sel.join(',') + '&$skip=' + (skip + size);
      send(200, out, null, { 'Preference-Applied': 'odata.maxpagesize=' + size });
    });
  });
  return new Promise(function (resolve) { srv.listen(0, '127.0.0.1', function () { resolve({ url: 'http://127.0.0.1:' + srv.address().port, calls: calls, close: function () { srv.close(); } }); }); });
}
module.exports = { start: start };
