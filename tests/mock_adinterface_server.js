/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// mock_adinterface_server.js — a faithful stand-in for iDempiere's ADInterface REST webservices,
// used ONLY because no real iDempiere is reachable from this dev machine (private-LAN target,
// prompts/BIM_OOTB_LEGACY_IDEMPIERE_INTEGRATION.md §3 "Testing without a reachable real server").
// Implements exactly the contract read from real source (org.idempiere.webservices,
// ModelADServiceImpl.java + idempiere-schema.xsd) — including the field-whitelist rejection
// (scanFields "input column X not allowed") so that failure path is exercised too, not just the
// happy path. This is NOT a real iDempiere — it proves the CLIENT's request/response handling and
// sequencing, not that a real server will accept it.
'use strict';
var http = require('http');

// Per-table column whitelist — stands in for a real WS_WebServiceType + WS_WebServiceFieldInput
// registration (§5 cheatsheet #2). Mirrors exactly the columns erp_rest_push.js writes.
var WHITELIST = {
  C_Project: ['Value', 'Name'],
  C_ProjectPhase: ['C_Project_ID', 'Name', 'SeqNo', 'StartDate', 'EndDate'],
  C_ProjectTask: ['C_ProjectPhase_ID', 'Name'],
  M_Product_Category: ['Name'],
  M_Product: ['Value', 'Name', 'M_Product_Category_ID'],
  C_ProjectLine: ['C_ProjectPhase_ID', 'C_Project_ID', 'M_Product_ID', 'PlannedQty', 'PlannedPrice', 'PlannedAmt']
};

// Per-table QUERY input whitelist — stands in for WS_WebServiceFieldInput rows on the QUERY type (queryData :1470-1500: a DataRow column that is not whitelisted → "input column X not allowed").
// These are exactly the natural keys erp_rest_push.js looks rows up by (the pilot's Query* types carry the same list: capex/legacy/ws/migration/iD13/postgresql/202611042300_CAPEX-WS-READ.sql).
var QUERY_KEYS = {
  C_Project: ['Value', 'C_Project_ID'],
  C_ProjectPhase: ['C_Project_ID', 'Name', 'C_ProjectPhase_ID'],
  C_ProjectTask: ['C_ProjectPhase_ID', 'Name'],
  M_Product_Category: ['Name'],
  M_Product: ['Value'],
  C_ProjectLine: ['C_ProjectPhase_ID', 'M_Product_ID', 'C_ProjectTask_ID'],
  C_UOM: ['X12DE355']
};
// Postgres LIKE with the default escape: `_` = any one char, `%` = any run, `\x` = literal x. (queryData binds CHAR columns with LIKE, :1488-1490.)
function likeMatch(value, pattern) {
  var re = '', i, c;
  for (i = 0; i < pattern.length; i++) {
    c = pattern[i];
    if (c === '\\' && i + 1 < pattern.length) { re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); continue; }
    re += c === '_' ? '.' : c === '%' ? '.*' : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$').test(String(value));
}

function createMockServer(opts) {
  opts = opts || {};
  var db = {}; // tableName -> array of row objects
  var nextId = {};
  var log = []; // every call, for the POC's own assertions

  function table(name) { return db[name] || (db[name] = []); }
  function allocId(name) { nextId[name] = (nextId[name] || 1000) + 1; return nextId[name]; }

  function readBody(req, cb) {
    var chunks = [];
    req.on('data', function (c) { chunks.push(c); });
    req.on('end', function () { cb(Buffer.concat(chunks).toString('utf8')); });
  }
  function tagAll(xml, name) {
    var re = new RegExp('<' + name + '\\b([^>]*)>([\\s\\S]*?)</' + name + '>', 'g');
    var out = [], m;
    while ((m = re.exec(xml))) out.push({ attrs: m[1], body: m[2] });
    return out;
  }
  function tag(xml, name) {
    var m = xml.match(new RegExp('<' + name + '[^>]*>([\\s\\S]*?)</' + name + '>'));
    return m ? m[1] : null;
  }
  function parseFields(dataRowXml) {
    if (!dataRowXml) return [];
    return tagAll(dataRowXml, 'field').map(function (f) {
      var col = (f.attrs.match(/column="([^"]*)"/) || [])[1];
      var val = tag(f.body, 'val');
      return { column: col, val: val };
    });
  }
  // DataRow key binding, as queryData does: *_ID columns `=?`, every other (CHAR) column `LIKE ?` — so `_`/`%` in a key are wildcards.
  function matchKeys(row, fields) {
    return fields.every(function (f) {
      var v = row[f.column];
      if (v == null) return false;
      return /_ID$/.test(f.column) ? String(v) === String(f.val) : likeMatch(v, String(f.val));
    });
  }

  function xmlResponse(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/xml' });
    // opts.nsPrefix — the reply shape a REAL iDempiere sends: every element namespace-prefixed (`<_0:StandardResponse IsError="true" xmlns:_0="…">`, measured on the local pilot 2026-11-02,
    //   prompts/CAPEX_DASHBOARD.md §12.1 D3). Off by default (the original stand-in replied unprefixed).
    if (opts.nsPrefix) body = '<?xml version="1.0" encoding="UTF-8"?>\n' + body.replace(/<(\/?)(\w+)/g, '<$1_0:$2').replace(/^<_0:(\w+)/, '<_0:$1 xmlns:_0="http://idempiere.org/ADInterface/1_0"');
    res.end(body);
  }
  function standardResponse(res, isError, recordId, error) {
    xmlResponse(res, 200,
      '<StandardResponseDocument><StandardResponse IsError="' + (isError ? 'true' : 'false') + '"' +
      (recordId != null ? ' RecordID="' + recordId + '"' : '') + '>' +
      (error ? '<Error>' + error + '</Error>' : '') +
      '</StandardResponse></StandardResponseDocument>');
  }
  function windowTabData(res, rows, error) {
    var dataRows = rows.map(function (r) {
      return '<DataRow>' + Object.keys(r).map(function (k) {
        return '<field column="' + k + '"><val>' + r[k] + '</val></field>';
      }).join('') + '</DataRow>';
    }).join('');
    xmlResponse(res, 200,
      '<WindowTabDataDocument><WindowTabData>' +
      (error ? ('<Error>' + error + '</Error>') : ('<DataSet>' + dataRows + '</DataSet>' +
        '<RowCount>' + rows.length + '</RowCount><Success>true</Success>')) +
      '</WindowTabData></WindowTabDataDocument>');
  }

  var server = http.createServer(function (req, res) {
    if (req.method !== 'POST') { res.writeHead(404); return res.end(); }
    readBody(req, function (body) {
      var m = req.url.match(/\/model_adservice\/(\w+)/);
      var op = m ? m[1] : null;
      var tableName = tag(body, 'TableName');
      var filter = tag(body, 'Filter');
      var action = tag(body, 'Action');
      var loginOk = /<ADLoginRequest>/.test(body) && tag(body, 'user');
      log.push({ op: op, tableName: tableName, filter: filter, action: action });
      console.log('§MOCK_ADINTERFACE op=' + op + ' table=' + tableName + ' action=' + action + (filter ? ' filter=' + filter : ''));

      if (!loginOk) return standardResponse(res, true, null, 'No login credentials');
      // opts.methodOf = { serviceType: 'query_data'|'create_data' } — legacy binds a WS type to ONE method (AbstractService.authenticate :223-252:
      //   WS_WebServiceMethod_ID=? AND Value=? → "Service type X not configured"). Off by default (the original stand-in accepted any pairing).
      var st = tag(body, 'serviceType');
      if (opts.methodOf && opts.methodOf[st] !== op) {
        var err = 'Service type ' + st + ' not configured';
        console.log('§MOCK_ADINTERFACE_REJECT op=' + op + ' serviceType=' + st + ' (' + err + ')');
        return op === 'query_data' ? windowTabData(res, [], err) : standardResponse(res, true, null, err);
      }

      if (op === 'query_data') {
        // legacy, validateCRUD → validateParameter(:307-338): a type with no Filter parameter refuses ANY request Filter → IdempiereServiceFault → HTTP 500, empty body (measured on the pilot)
        if (filter != null && filter.length > 0) {
          console.log('§MOCK_ADINTERFACE_REJECT op=query_data table=' + tableName + ' (Web service type ' + st + ': invalid parameter Filter)');
          res.writeHead(500); return res.end();
        }
        var qf = parseFields(tag(body, 'DataRow')), qAllowed = (opts.queryKeys || QUERY_KEYS)[tableName] || [];
        for (var qi = 0; qi < qf.length; qi++) {
          if (qAllowed.indexOf(qf[qi].column) === -1) {
            console.log('§MOCK_ADINTERFACE_REJECT op=query_data table=' + tableName + ' (Web service type ' + st + ': input column ' + qf[qi].column + ' not allowed)');
            res.writeHead(500); return res.end();
          }
        }
        var rows = table(tableName).filter(function (r) { return matchKeys(r, qf); });
        return windowTabData(res, rows);
      }
      if (op === 'create_data') {
        var fields = parseFields(tag(body, 'DataRow'));
        var allowed = WHITELIST[tableName] || [];
        for (var i = 0; i < fields.length; i++) {
          if (allowed.indexOf(fields[i].column) === -1) {
            console.log('§MOCK_ADINTERFACE_REJECT table=' + tableName + ' column=' + fields[i].column);
            return standardResponse(res, true, null,
              'Web service type BIMOOTB: input column ' + fields[i].column + ' not allowed');
          }
        }
        var row = {}; fields.forEach(function (f) { row[f.column] = f.val; });
        var id = allocId(tableName);
        row[tableName + '_ID'] = id;
        table(tableName).push(row);
        return standardResponse(res, false, id, null);
      }
      return standardResponse(res, true, null, 'Unknown op ' + op);
    });
  });

  return {
    listen: function (port, cb) { server.listen(port, cb); },
    close: function (cb) { server.close(cb); },
    address: function () { return server.address(); },
    db: db,
    callLog: log
  };
}

module.exports = { createMockServer: createMockServer };
