// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// ws_adinterface.js - the SERVER side of iDempiere's ADInterface web service (org.idempiere.webservices ModelADServiceImpl) over the Kernel ERP's own dictionary DB.
// bim-compiler prompts/ERP_WS_API.md S1 (read side: login, authenticate, read_data, query_data). Wire contract = idempiere-schema.xsd as used by bim-ootb viewer/erp_rest_push.js and
// bim-compiler scripts/pilot/pilot_ref.js: POST /ADInterface/services/rest/model_adservice/<method>, XML body ModelCRUDRequest{ModelCRUD, ADLoginRequest}, stateless login in every call.
// TWIN CARDINAL RULE: every error string below is the legacy string, cited to its Java file:line; a request legacy answers one way is answered the same way here (witness: W-WS-DIFF-READ).
// NAMED, not faked: password hashing/salt (plain compare only), role inclusion (AD_Role_Included), ad_role_orgaccess edge cases, MRole.addAccessSQL beyond client/org, IWSValidator hooks,
// the PG text collation of a Filter such as name>'S' (SQLite compares bytes).
// Pure module: no I/O. The host gives { q(sql, params) -> [rows with lower-case keys] }.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WsAdInterface = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var WS_ID = 50001;   // ModelADService (AD seed: ws_webservice 50001)
  var METHOD = { createData: 50024, updateData: 50025, deleteData: 50026, readData: 50027, queryData: 50028, setDocAction: 50021, runProcess: 50022, getList: 50023 };
  var NS = 'http://idempiere.org/ADInterface/1_0';

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function unesc(s) { return String(s == null ? '' : s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'); }
  function tag(xml, name) { var m = new RegExp('<(?:\\w+:)?' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?' + name + '>').exec(xml); return m ? unesc(m[1]) : null; }

  // ModelCRUDRequest -> { crud:{serviceType,tableName,recordId,filter,action,offset,limit,fields[]}, login:{...} }
  function parseRequest(xml) {
    var crudX = (/<(?:\w+:)?ModelCRUD>([\s\S]*?)<\/(?:\w+:)?ModelCRUD>/.exec(xml) || [])[1] || '', loginX = (/<(?:\w+:)?ADLoginRequest>([\s\S]*?)<\/(?:\w+:)?ADLoginRequest>/.exec(xml) || [])[1] || '';
    var fields = [], re = /<(?:\w+:)?field\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?field>/g, m;
    while ((m = re.exec(crudX))) { var col = (/column="([^"]*)"/.exec(m[1]) || [])[1]; if (col != null) fields.push({ column: col, val: tag(m[2], 'val') }); }
    var num = function (n) { var v = tag(crudX, n); return v == null || v === '' ? 0 : parseInt(v, 10); };
    return {
      crud: { serviceType: tag(crudX, 'serviceType'), tableName: tag(crudX, 'TableName'), recordId: num('RecordID'), filter: tag(crudX, 'Filter'), action: tag(crudX, 'Action'), offset: num('Offset'), limit: num('Limit'), fields: fields, hasDataRow: /<(?:\w+:)?DataRow/.test(crudX) },
      login: { user: tag(loginX, 'user'), pass: tag(loginX, 'pass'), lang: tag(loginX, 'lang'), clientId: parseInt(tag(loginX, 'ClientID') || '0', 10), roleId: parseInt(tag(loginX, 'RoleID') || '0', 10), orgId: parseInt(tag(loginX, 'OrgID') || '0', 10), warehouseId: parseInt(tag(loginX, 'WarehouseID') || '0', 10), stage: parseInt(tag(loginX, 'stage') || '0', 10) }
    };
  }

  function create(host) {
    var q = host.q;
    var one = function (sql, p) { return (q(sql, p) || [])[0] || null; };

    // AbstractService.login :91-209 + Login.getClients/getRoles/getOrgs/getWarehouses (messages verbatim)
    function login(l) {
      var user = l.user ? one("SELECT ad_user_id, name, password FROM ad_user WHERE isactive='Y' AND (name=? OR email=?)", [l.user, l.user]) : null;
      if (!user || user.password == null || String(user.password) !== String(l.pass)) return { error: 'Error login - User invalid' };                              // :117-118
      var roles = q("SELECT DISTINCT r.ad_role_id AS id, r.ad_client_id AS client, r.isaccessallorgs AS allorgs FROM ad_user_roles ur JOIN ad_role r ON r.ad_role_id=ur.ad_role_id JOIN ad_client c ON c.ad_client_id=r.ad_client_id " +
        "WHERE ur.ad_user_id=? AND ur.isactive='Y' AND r.isactive='Y' AND c.isactive='Y' AND (r.roletype IS NULL OR r.roletype='WS')", [user.ad_user_id]);                  // ROLE_TYPES_WEBSERVICE = NULL,WS (AbstractService.java:71)
      if (!roles.length) return { error: 'Error login - User invalid' };
      if (!roles.some(function (r) { return Number(r.client) === l.clientId; })) return { error: 'Error logging in - tenant not allowed for this user' };            // :132-134
      var role = roles.filter(function (r) { return Number(r.client) === l.clientId && Number(r.id) === l.roleId; })[0];
      if (!role) return { error: 'Error logging in - role not allowed for this user' };                                                                                // :155-156
      var orgs = (role.allorgs === 'Y') ? q("SELECT ad_org_id AS id FROM ad_org WHERE isactive='Y' AND ad_client_id IN (0, ?)", [l.clientId]) : q("SELECT ad_org_id AS id FROM ad_role_orgaccess WHERE ad_role_id=? AND isactive='Y'", [role.id]);
      if (!orgs.length) return { error: 'Error logging in - no organizations for this role' };                                                                          // :160-161
      if (!orgs.some(function (o) { return Number(o.id) === l.orgId; })) return { error: 'Error logging in - org not allowed for this role' };                          // :172-173
      var whs = q("SELECT m_warehouse_id AS id FROM m_warehouse WHERE isactive='Y' AND ad_org_id=?", [l.orgId]);
      if (whs.length) { if (!whs.some(function (w) { return Number(w.id) === l.warehouseId; })) return { error: 'Error logging in - warehouse not allowed for this org' }; }   // :185-186
      else if (l.warehouseId > 0) return { error: 'Error logging in - warehouse not allowed for this org' };                                                          // :188-189
      return { session: { userId: Number(user.ad_user_id), roleId: l.roleId, clientId: l.clientId, orgId: l.orgId, warehouseId: l.warehouseId, allOrgs: role.allorgs === 'Y' } };
    }

    // AbstractService.authenticate :221-285
    function authenticate(session, methodValue, serviceTypeValue) {
      var mid = METHOD[methodValue]; if (!mid) return { error: 'Method ' + methodValue + ' not registered' };                                                           // :228-229
      var t = one("SELECT * FROM ws_webservicetype WHERE ad_client_id IN (0, ?) AND ws_webservice_id=? AND ws_webservicemethod_id=? AND value=? AND isactive='Y' ORDER BY ad_client_id DESC",
        [session.clientId, WS_ID, mid, serviceTypeValue]);
      if (!t) return { error: 'Service type ' + serviceTypeValue + ' not configured' };                                                                                  // :248
      var acc = one("SELECT isactive FROM ws_webservicetypeaccess WHERE ad_role_id=? AND ws_webservicetype_id=?", [session.roleId, t.ws_webservicetype_id]);          // ROLE_ACCESS_SQL (included roles: named)
      if (!acc || acc.isactive !== 'Y') return { error: "Web Service Error: Login role does not have access to the service type '" + serviceTypeValue + "'" };         // :270
      return { type: t };
    }

    // ModelADServiceImpl.validateParameter :307-340 (constant parameters override; unconfigured + given = fault)
    function validateParam(type, name, value) {
      var para = one("SELECT parametertype, constantvalue FROM ws_webservice_para WHERE ws_webservicetype_id=? AND parametername=? AND isactive='Y'", [type.ws_webservicetype_id, name]);
      var s = value == null ? null : String(value);
      if (!para && (s == null || s.length === 0)) return { v: null };
      if (!para) return { fault: 'Web service type ' + type.value + ': invalid parameter ' + name };                                                                    // :313-316
      if (para.parametertype === 'C') { if (s == null || s.length === 0) return { v: para.constantvalue }; if (para.constantvalue !== s) return { v: para.constantvalue }; }
      return { v: s };
    }
    function validateCRUD(type, c) {                                                                                                                                       // :739-744
      var out = {};
      var t = validateParam(type, 'TableName', c.tableName); if (t.fault) return t; out.tableName = t.v;
      var r = validateParam(type, 'RecordID', String(c.recordId || 0)); if (r.fault) return r; out.recordId = r.v == null || r.v === '0' ? -1 : parseInt(r.v, 10); if (r.v === String(c.recordId || 0)) out.recordId = c.recordId || 0;
      var f = validateParam(type, 'Filter', c.filter); if (f.fault) return f; out.filter = f.v;
      var a = validateParam(type, 'Action', c.action); if (a.fault) return a; out.action = a.v;
      return { crud: out };
    }

    // POInfo column order (org.compiere.model.POInfo.java:172 ORDER BY c.AD_Column_ID) restricted to the type's output whitelist (MWebServiceType.isOutputColumnNameAllowed)
    function outputColumns(type, tableName) {
      var t = one("SELECT ad_table_id FROM ad_table WHERE lower(tablename)=lower(?)", [tableName]); if (!t) return null;
      var allowed = {}; q("SELECT c.columnname FROM ws_webservicefieldoutput f JOIN ad_column c ON c.ad_column_id=f.ad_column_id WHERE f.ws_webservicetype_id=? AND f.isactive='Y'", [type.ws_webservicetype_id]).forEach(function (r) { allowed[r.columnname] = 1; });
      return q("SELECT columnname FROM ad_column WHERE ad_table_id=? AND isactive='Y' AND columnsql IS NULL ORDER BY ad_column_id", [t.ad_table_id])
        .map(function (r) { return r.columnname; }).filter(function (c) { return allowed[c]; });
    }
    function cell(v) { return v == null ? '<_0:val xsi:nil="true" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/>' : '<_0:val>' + esc(v) + '</_0:val>'; }
    function wtd(attrs, inner) { return '<?xml version="1.0" encoding="UTF-8"?>\n<_0:WindowTabData' + (attrs ? ' ' + attrs : '') + ' xmlns:_0="' + NS + '">' + inner + '</_0:WindowTabData>'; }
    function fault(msg) { return { status: 500, body: '<html><head><title>Error 500 org.idempiere.webservices.fault.IdempiereServiceFault: ' + esc(msg) + '</title></head><body><h2>HTTP ERROR 500 org.idempiere.webservices.fault.IdempiereServiceFault: ' + esc(msg) + '</h2></body></html>' }; }
    function wtdError(msg) { return wtd('', '<_0:Error>' + esc(msg) + '</_0:Error>'); }

    function prelude(method, p) {
      var l = login(p.login); if (l.error) return { err: l.error };
      var a = authenticate(l.session, method, p.crud.serviceType); if (a.error) return { err: a.error };
      var v = validateCRUD(a.type, p.crud); if (v.fault) return { err: v.fault, fault: true };
      return { session: l.session, type: a.type, crud: v.crud };
    }
    function tableOf(name) { return one("SELECT lower(tablename) AS t FROM ad_table WHERE lower(tablename)=lower(?)", [name]); }

    // ModelADServiceImpl.readData :1318-1417
    function readData(p) {
      var pre = prelude('readData', p); if (pre.err) return wtdError(pre.err);
      var tn = pre.crud.tableName, t = tn && tableOf(tn);
      if (!t) return fault('Web service type ' + pre.type.value + ': table ' + tn + ' not found');                                                                      // :1368 (fault)
      var cols = outputColumns(pre.type, tn), key = tn + '_id';
      var row = one('SELECT * FROM ' + t.t + ' WHERE ' + key + '=?', [pre.crud.recordId]);
      if (!row) return wtd('NumRows="0" TotalRows="0" StartRow="0"', '');                                                                                                  // :1375-1382 (PO null)
      return wtd('NumRows="1" TotalRows="1" StartRow="1"', '<_0:DataSet><_0:DataRow>' + cols.map(function (c) { var v = row[c.toLowerCase()]; return '<_0:field column="' + esc(c) + '">' + cell(v) + '</_0:field>'; }).join('') + '</_0:DataRow></_0:DataSet>');
    }

    // ModelADServiceImpl.queryData :1419-1578
    function queryData(p) {
      var pre = prelude('queryData', p); if (pre.err) return (pre.fault ? fault(pre.err) : wtdError(pre.err));
      var tn = pre.crud.tableName, t = tn && tableOf(tn);
      if (!t) return fault('Web service type ' + pre.type.value + ': table ' + tn + ' not found');
      var cols = outputColumns(pre.type, tn), params = [], sql = 'SELECT * FROM ' + t.t + ' WHERE 1=1';
      var hasClient = !!one("SELECT 1 AS x FROM ad_column c JOIN ad_table tb ON tb.ad_table_id=c.ad_table_id WHERE lower(tb.tablename)=? AND lower(c.columnname)='ad_client_id'", [t.t]);
      if (hasClient) { sql += ' AND ' + t.t + '.ad_client_id IN (0, ' + Number(pre.session.clientId) + ')'; }                                                            // MRole.addAccessSQL (client part)
      if (hasClient && !pre.session.allOrgs) sql += ' AND ' + t.t + '.ad_org_id IN (0' + q("SELECT ad_org_id AS id FROM ad_role_orgaccess WHERE ad_role_id=? AND isactive='Y'", [pre.session.roleId]).map(function (o) { return ', ' + Number(o.id); }).join('') + ')';
      if (p.crud.hasDataRow) {
        var inputs = {}; q("SELECT c.columnname, c.ad_reference_id AS ref FROM ws_webservicefieldinput f JOIN ad_column c ON c.ad_column_id=f.ad_column_id WHERE f.ws_webservicetype_id=?", [pre.type.ws_webservicetype_id]).forEach(function (r) { inputs[r.columnname] = r; });
        for (var i = 0; i < p.crud.fields.length; i++) {
          var f = p.crud.fields[i];
          if (inputs[f.column]) { var isChar = [10, 14, 17, 34, 36].indexOf(Number(inputs[f.column].ref)) >= 0;   // DisplayType.getSQLDataType contains CHAR: String, Text, List, Memo, Text Long
            sql += ' AND ' + f.column + (isChar ? ' LIKE ?' : '=?'); params.push(f.val); }                                                                                 // :1488-1497 (CHAR -> LIKE, else =)
          else return fault('Web service type ' + pre.type.value + ': input column ' + f.column + ' not allowed');                                                       // :1507-1511
        }
      }
      if (pre.crud.filter) sql += ' AND ' + pre.crud.filter;                                                                                                               // :1518-1521 (parseSQL: @vars@ not ported)
      var rows; try { rows = q(sql, params); } catch (e) { return wtdError(String(e && e.message || e)); }
      var offset = p.crud.offset || 0, limit = p.crud.limit || 0, cnt = 0, out = [];
      rows.forEach(function (r) { cnt++; if (offset >= cnt || (limit > 0 && offset + limit < cnt)) return; out.push(r); });                                               // :1536-1538
      var body = '<_0:DataSet>' + out.map(function (r) { return '<_0:DataRow>' + cols.map(function (c) { return '<_0:field column="' + esc(c) + '">' + cell(r[c.toLowerCase()]) + '</_0:field>'; }).join('') + '</_0:DataRow>'; }).join('') + '</_0:DataSet>';
      return wtd('NumRows="' + out.length + '" TotalRows="' + cnt + '" StartRow="' + offset + '"', body);
    }

    return {
      handle: function (method, xml) {
        var p; try { p = parseRequest(xml); } catch (e) { return wtdError('Bad request: ' + e.message); }
        if (method === 'read_data') return readData(p);
        if (method === 'query_data') return queryData(p);
        return wtdError('Method ' + method + ' not registered');
      }
    };
  }
  return { create: create, parseRequest: parseRequest };
});
