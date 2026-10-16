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
  // Only what erp_rest_push.js actually sends: single/AND-ed "Col='val'" or "Col=NNN" clauses.
  function matchFilter(row, filter) {
    if (!filter) return true;
    return filter.split(/\s+AND\s+/i).every(function (clause) {
      var m = clause.match(/^\s*([\w_]+)\s*=\s*'?([^']*)'?\s*$/);
      if (!m) return false;
      return String(row[m[1]]) === String(m[2]);
    });
  }

  function xmlResponse(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/xml' });
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

      if (op === 'query_data') {
        var rows = table(tableName).filter(function (r) { return matchFilter(r, filter); });
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
