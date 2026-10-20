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
  var COLLATE = (typeof require === 'function' ? (function () { try { return require('./ad_find.js').collate; } catch (e) { return null; } })() : (typeof self !== 'undefined' && self.AdFind ? self.AdFind.collate : null)) || function (a, b) { return a < b ? -1 : a > b ? 1 : 0; };
  var WS_ID = 50001;   // ModelADService (AD seed: ws_webservice 50001)
  var METHOD = { createData: 50024, updateData: 50025, deleteData: 50026, readData: 50027, queryData: 50028, setDocAction: 50021, runProcess: 50022, getList: 50023 };
  var NS = 'http://idempiere.org/ADInterface/1_0';

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function unesc(s) { return String(s == null ? '' : s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'); }
  function tag(xml, name) { var m = new RegExp('<(?:\\w+:)?' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?' + name + '>').exec(xml); return m ? unesc(m[1]) : null; }

  // ModelCRUDRequest -> { crud:{serviceType,tableName,recordId,filter,action,offset,limit,fields[]}, login:{...} }
  function parseRequest(xml) {
    var crudX = (/<(?:\w+:)?ModelCRUD>([\s\S]*?)<\/(?:\w+:)?ModelCRUD>/.exec(xml) || [])[1] || '', loginX = (/<(?:\w+:)?ADLoginRequest>([\s\S]*?)<\/(?:\w+:)?ADLoginRequest>/.exec(xml) || [])[1] || '';
    // lval = DataField attribute (idempiere-schema.xsd :44)
    var fields = [], re = /<(?:\w+:)?field\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?field>/g, m;
    while ((m = re.exec(crudX))) { var col = (/\bcolumn="([^"]*)"/.exec(m[1]) || [])[1], lv = (/\blval="([^"]*)"/.exec(m[1]) || [])[1]; if (col != null) fields.push({ column: col, val: tag(m[2], 'val'), lval: lv == null ? null : unesc(lv) }); }
    var num = function (n) { var v = tag(crudX, n); return v == null || v === '' ? 0 : parseInt(v, 10); };
    var sdaX = (/<(?:\w+:)?ModelSetDocAction>([\s\S]*?)<\/(?:\w+:)?ModelSetDocAction>/.exec(xml) || [])[1];
    var sda = sdaX == null ? null : { serviceType: tag(sdaX, 'serviceType'), tableName: tag(sdaX, 'tableName'), recordId: parseInt(tag(sdaX, 'recordID') || '0', 10), recordIdVar: tag(sdaX, 'recordIDVariable'), docAction: tag(sdaX, 'docAction') };
    var rpM = /<(?:\w+:)?ModelRunProcess\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?ModelRunProcess>/.exec(xml), rp = null;
    if (rpM) { var at = function (n) { var m = new RegExp('\\b' + n + '="([^"]*)"').exec(rpM[1]); return m ? parseInt(m[1], 10) : 0; }, pf = [], pre = /<(?:\w+:)?field\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?field>/g, pm;
      while ((pm = pre.exec(rpM[2]))) { var pc = (/column="([^"]*)"/.exec(pm[1]) || [])[1]; if (pc != null) pf.push({ column: pc, val: tag(pm[2], 'val') }); }
      rp = { serviceType: tag(rpM[2], 'serviceType'), processId: at('AD_Process_ID'), menuId: at('AD_Menu_ID'), recordId: at('AD_Record_ID'), docAction: (/\bDocAction="([^"]*)"/.exec(rpM[1]) || [])[1] || null, fields: pf }; }
    var glM = /<(?:\w+:)?ModelGetList>([\s\S]*?)<\/(?:\w+:)?ModelGetList>/.exec(xml), gl = glM ? { serviceType: tag(glM[1], 'serviceType'), ref: tag(glM[1], 'AD_Reference_ID'), filter: tag(glM[1], 'Filter') } : null;
    if (gl) crudX = '<serviceType>' + (gl.serviceType || '') + '</serviceType>';
    if (sda) crudX = '<serviceType>' + (sda.serviceType || '') + '</serviceType>';
    if (rp) crudX = '<serviceType>' + (rp.serviceType || '') + '</serviceType>';
    return {
      docAction: sda, runProcess: rp, getList: gl,
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
      return { session: { actor: 'ws:' + l.user + '/client:' + l.clientId + '/role:' + l.roleId, userId: Number(user.ad_user_id), roleId: l.roleId, clientId: l.clientId, orgId: l.orgId, warehouseId: l.warehouseId, allOrgs: role.allorgs === 'Y' } };
    }

    // AbstractService.authenticate :221-285
    function authenticate(session, methodValue, serviceTypeValue) {
      var mid = METHOD[methodValue]; if (!mid) return { error: 'Method ' + methodValue + ' not registered' };                                                           // :228-229
      var t = one("SELECT * FROM ws_webservicetype WHERE ad_client_id IN (0, ?) AND ws_webservice_id=? AND ws_webservicemethod_id=? AND value=? AND isactive='Y' ORDER BY ad_client_id DESC",
        [session.clientId, WS_ID, mid, serviceTypeValue]);
      if (!t) return { error: 'Service type ' + serviceTypeValue + ' not configured' };                                                                                  // :248
      var acc = one("SELECT isactive FROM ws_webservicetypeaccess WHERE ad_role_id IN (SELECT ad_role_id FROM ad_role WHERE ad_role_id=? UNION SELECT included_role_id FROM ad_role_included WHERE ad_role_id=?) AND ws_webservicetype_id=?", [session.roleId, session.roleId, t.ws_webservicetype_id]);          // AbstractService.ROLE_ACCESS_SQL :72-75 (the role itself UNION its AD_Role_Included roles)
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
    function txt(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }   // XmlBeans element text: & and < escaped, '>' is not (observed: "&lt;None>")
    function cell(v) { return v == null ? '<_0:val xsi:nil="true" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/>' : '<_0:val>' + txt(v) + '</_0:val>'; }
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


    // ModelADServiceImpl.getList :464-665 - the entries of an AD_Reference: a LIST (AD_Ref_List rows) or a TABLE reference (AD_Ref_Table: key, Value if IsValueDisplayed, then the identifier columns)
    function listErr(msg) { return wtd('', '<_0:DataSet/><_0:Success>false</_0:Success><_0:Error>' + esc(msg) + '</_0:Error><_0:ErrorInfo>' + esc(msg) + '</_0:ErrorInfo>'); }
    function getList(p) {
      var g = p.getList || {}, l = login(p.login); if (l.error) return listErr(l.error);
      var a = authenticate(l.session, 'getList', g.serviceType); if (a.error) return listErr(a.error);
      var vr = validateParam(a.type, 'AD_Reference_ID', g.ref); if (vr.fault) return fault(vr.fault);
      var vf = validateParam(a.type, 'Filter', g.filter); if (vf.fault) return fault(vf.fault);
      var refId = parseInt(vr.v || '0', 10), filter = vf.v ? ' AND ' + vf.v : '';
      var ref = one('SELECT validationtype FROM ad_reference WHERE ad_reference_id=?', [refId]);
      if (!ref) return fault('java.lang.NullPointerException');                                                                                                           // MReference.get -> null -> ref.getValidationType() NPE (observed: HTTP 500)
      var allowed = {}; q("SELECT c.columnname FROM ws_webservicefieldoutput f JOIN ad_column c ON c.ad_column_id=f.ad_column_id WHERE f.ws_webservicetype_id=? AND f.isactive='Y'", [a.type.ws_webservicetype_id]).forEach(function (r) { allowed[r.columnname] = 1; });
      var cols = [], rows = null, sql;
      try {
        if (ref.validationtype === 'L') {
          cols = ['AD_Ref_List_ID', 'Value', 'Name', 'Description'];
          sql = "SELECT ad_ref_list.ad_ref_list_id AS \"AD_Ref_List_ID\", ad_ref_list.value AS \"Value\", ad_ref_list.name AS \"Name\", ad_ref_list.description AS \"Description\" FROM ad_ref_list WHERE ad_ref_list.ad_reference_id=? AND ad_ref_list.isactive='Y'" + filter + ' ORDER BY ad_ref_list.name';
          rows = q(sql, [refId]); rows.sort(function (x, y) { return COLLATE(String(x.name == null ? '' : x.name), String(y.name == null ? '' : y.name)); });   // ORDER BY Name under the DB collation (PG en_US ignores punctuation: <None> sorts as None)
        } else if (ref.validationtype === 'T') {
          var rt = one('SELECT * FROM ad_ref_table WHERE ad_reference_id=?', [refId]);
          if (!rt) return fault('Web service type ' + a.type.value + ': reference table ' + refId + ' not found');
          var tb = one('SELECT lower(tablename) AS t FROM ad_table WHERE ad_table_id=?', [rt.ad_table_id]), kc = one('SELECT columnname FROM ad_column WHERE ad_column_id=?', [rt.ad_key]);
          cols = [kc.columnname]; if (rt.isvaluedisplayed === 'Y') cols.push('Value');
          q("SELECT columnname FROM ad_column WHERE ad_table_id=? AND isactive='Y' AND isidentifier='Y' ORDER BY seqno", [rt.ad_table_id]).forEach(function (r) { if (!(rt.isvaluedisplayed === 'Y' && r.columnname.toLowerCase() === 'value')) cols.push(r.columnname); });
          sql = 'SELECT ' + cols.map(function (c) { return tb.t + '.' + c + ' AS "' + c + '"'; }).join(',') + ' FROM ' + tb.t + " WHERE " + tb.t + ".isactive='Y'";
          var hasClient = !!one("SELECT 1 AS x FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)=? AND lower(c.columnname)='ad_client_id'", [tb.t]);
          if (hasClient) { sql += ' AND ' + tb.t + '.ad_client_id IN (0, ' + Number(l.session.clientId) + ')'; if (!l.session.allOrgs) sql += ' AND ' + tb.t + '.ad_org_id IN (0' + q("SELECT ad_org_id AS id FROM ad_role_orgaccess WHERE ad_role_id=? AND isactive='Y'", [l.session.roleId]).map(function (o) { return ', ' + Number(o.id); }).join('') + ')'; }   // MRole.addAccessSQL
          sql += filter;
          if (rt.whereclause) sql += ' AND ' + rt.whereclause;
          if (rt.orderbyclause) sql += ' ORDER BY ' + rt.orderbyclause;
          rows = q(sql, []);
        }
      } catch (e) { return fault(e.constructor.name + ' ' + (e && e.message) + ' sql=' + sql); }                                                                            // SQLException -> IdempiereServiceFault (HTTP 500)
      var out = (rows || []).map(function (r) { return '<_0:DataRow>' + cols.filter(function (c) { return allowed[c]; }).map(function (c) { return '<_0:field column="' + esc(c) + '"><_0:val>' + txt(r[c.toLowerCase()]) + '</_0:val></_0:field>'; }).join('') + '</_0:DataRow>'; });
      var n = out.length;
      return wtd('NumRows="' + n + '" TotalRows="' + n + '" StartRow="1"', (n ? '<_0:DataSet>' + out.join('') + '</_0:DataSet>' : '<_0:DataSet/>') + '<_0:RowCount>' + n + '</_0:RowCount>' + (rows ? '<_0:Success>true</_0:Success>' : ''));
    }

    // ModelADServiceImpl.createUpdateData :858-1050 - find the record by the type's IsIdentifier input columns, then create / update / create-or-update it
    function createUpdateData(p) {
      var l = login(p.login); if (l.error) return std(null, true, l.error);
      var a = authenticate(l.session, 'createData', p.crud.serviceType); if (a.error) return std(null, true, a.error);
      var v = validateCRUD(a.type, p.crud); if (v.fault) return std(null, true, v.fault);
      var tn = v.crud.tableName, t = tn && tableOf(tn); if (!t) return std(null, true, 'No table ' + tn);
      var holder = K.ML.newPO({ q: q, env: K.env(l.session) }, t.t, {}), err = scanFields(a.type, holder, p.crud.fields, t.t, false);
      if (err) return std(null, true, err);
      var action = v.crud.action, isCreate = action === 'Create' || action === 'CreateUpdate', isUpdate = action === 'Update' || action === 'CreateUpdate';
      var keys = q("SELECT c.columnname AS c, f.isnullidentifier AS nul, f.identifierlogic AS logic FROM ws_webservicefieldinput f JOIN ad_column c ON c.ad_column_id=f.ad_column_id WHERE f.ws_webservicetype_id=? AND f.isactive='Y' AND f.isidentifier='Y' ORDER BY f.ws_webservicefieldinput_id", [a.type.ws_webservicetype_id]);
      if (isUpdate && !keys.length) return std(null, true, 'Web service type ' + a.type.value + ': There is no key column found ');
      var rid = 0, resolved = [];
      if (keys.length) {
        var w = [], par = [];
        for (var i = 0; i < keys.length; i++) {
          var kc = keys[i], cv = holder[kc.c.toLowerCase()];
          if (kc.logic) return std(null, true, 'Web service type ' + a.type.value + ': IdentifierLogic (dynamic SQL, @vars@) is not ported');
          if (cv == null && kc.nul === 'Y') w.push('ot.' + kc.c + ' IS NULL');
          else if (cv == null) return std(null, true, 'Web service type ' + a.type.value + ': Record Identifier column ' + kc.c + ' must be set');
          else { w.push('ot.' + kc.c + '=?'); par.push(cv); resolved.push(cv); }
        }
        var hit = one('SELECT ot.' + t.t + '_id AS id FROM ' + t.t + ' ot WHERE ' + w.join(' AND ') + ' AND ot.ad_client_id=?', par.concat([l.session.clientId]));
        rid = hit ? hit.id : 0;
      }
      var tname = (one('SELECT tablename FROM ad_table WHERE lower(tablename)=lower(?)', [tn]) || {}).tablename || tn;
      if (!isCreate && rid === 0) return std(null, true, 'No Record to update for ' + tname + ' with ([' + keys.map(function (k) { return k.c; }).join(', ') + ']) = ([' + resolved.join(', ') + '])');
      if (rid > 0 && !isUpdate) return std(null, true, 'Record already presents with ' + tname + '_ID = ' + rid);
      var cur = rid ? one('SELECT * FROM ' + t.t + ' WHERE ' + t.t + '_id=?', [rid]) : null, row = cur ? Object.assign({}, cur) : K.ML.newPO({ q: q, env: K.env(l.session) }, t.t, {});
      p.crud.fields.forEach(function (f) { var c = f.column.toLowerCase(); if (c in holder) row[c] = holder[c]; });                                                      // holder -> persistent PO (set_ValueNoCheck)
      err = fkError(t.t, row); if (err) return std(null, true, 'Cannot save record in ' + tname + ': ' + err);
      var r = K.inTrx(l.session, { ws: 'create_update_data', type: a.type.value, id: rid || undefined }, function (trx, ML) {
        if (cur) { var ch = {}; Object.keys(row).forEach(function (k) { if (row[k] !== cur[k]) ch[k] = row[k]; }); var u2 = uniqueError(t.t, row, rid); if (u2) return { ok: false, error: u2 }; var sv = ML.save(trx, t.t, trx.get(t.t, rid), ch); return sv.ok ? { ok: true, row: sv.row } : { ok: false, error: sv.error }; }
        var sv2 = ML.save(trx, t.t, null, row); if (!sv2.ok) return { ok: false, error: sv2.error }; var pre2 = pgNotNull(t.t, sv2.row) || uniqueError(t.t, sv2.row, null); return pre2 ? { ok: false, error: pre2 } : { ok: true, row: sv2.row };
      });
      if (!r.ok) return std(null, true, 'Cannot save record in ' + tname + ': ' + (r.error || 'SaveError'));
      var id = rid; if (!id) { var idx = -1; r.ops.forEach(function (o, i2) { if (idx < 0 && o.table === t.t && o.op_type === 'CRUD_CREATE') idx = i2; }); id = r.ids[idx]; }
      var saved = one('SELECT * FROM ' + t.t + ' WHERE ' + t.t + '_id=?', [id]) || {}; saved.__table = t.t;
      return std(id, false, null, outputFields(a.type, saved));
    }

    // ══ S2/S3 WRITE SIDE (ModelADServiceImpl createData :746, updateData :1232, deleteData :667, setDocAction :172). Every write is the kernel's own model-layer save()/remove()/processIt()
    //    inside ONE Trx (host.kernel.inTrx): nothing is written unless the whole request succeeds (legacy rollbackAndSetError). The API adds NO write logic.
    var K = host.kernel, FSM = (typeof require === 'function') ? require('./ad_docfsm.js') : (typeof self !== 'undefined' ? self.AdDocFsm : null);
    function parseTranslation(text) {   // Msg.parseTranslation: @Key@ -> AD_Message.MsgText (the session language is en_US here)
      return String(text == null ? '' : text).replace(/@([^@\s]+)@/g, function (m, k) { var r = one("SELECT msgtext FROM ad_message WHERE value=? AND isactive='Y'", [k]); return r && r.msgtext != null ? r.msgtext : m; });
    }
    var dbShim = { prepare: function (sql) { return { get: function (a) { return one(sql.replace(/\?/g, '?'), [a]); }, all: function (a) { return q(sql, [a]); } }; } };
    function std(recordId, isError, errMsg, extra) {   // StandardResponse: RecordID first, then IsError (attribute order as the pilot writes it)
      var a = (recordId != null ? ' RecordID="' + recordId + '"' : '') + (isError ? ' IsError="true"' : '');
      var inner = (isError ? '<_0:Error>' + esc(errMsg) + '</_0:Error>' : '') + (extra || '');
      return '<?xml version="1.0" encoding="UTF-8"?>\n<_0:StandardResponse' + a + ' xmlns:_0="' + NS + '"' + (inner ? '>' + inner + '</_0:StandardResponse>' : '/>');
    }
    var CLASS = { int: [11, 13, 18, 19, 21, 25, 27, 30, 31, 32, 33, 35, 38], dec: [12, 22, 29, 37], ts: [15, 16, 24], bool: [20] };   // DisplayType.getClass(displayType, true)
    function classOf(ref) { ref = Number(ref); return CLASS.int.indexOf(ref) >= 0 ? Integer : CLASS.dec.indexOf(ref) >= 0 ? 'dec' : CLASS.ts.indexOf(ref) >= 0 ? 'ts' : CLASS.bool.indexOf(ref) >= 0 ? 'bool' : 'str'; }
    var Integer = 'int';
    function convertToObj(str, cls, col) {   // AbstractService.convertToObj :505-560 (messages from the Java exceptions)
      if (cls === 'bool') { if (/^(y|true)$/i.test(str)) return 'Y'; if (/^(n|false)$/i.test(str)) return 'N'; throw new Error(' input column ' + col + ' wrong value ' + str); }
      if (cls === 'int') { if (!/^[+-]?\d+$/.test(str)) throw new Error('class java.lang.NumberFormatException For input string: "' + str + '" for ' + col); return parseInt(str, 10); }
      if (cls === 'dec') { if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(str)) throw new Error('class java.lang.NumberFormatException Character ' + (str.match(/[^\d.+\-eE]/) || ['x'])[0] + ' is neither a decimal digit number, decimal point, nor "e" notation exponential mark. for ' + col); return Number(str); }
      if (cls === 'ts') {   /* Timestamp.valueOf: the time part is REQUIRED */ var m = /^(\d{4}-\d{1,2}-\d{1,2}) (\d{1,2}:\d{1,2}:\d{1,2})(?:\.\d{1,9})?$/.exec(str); if (!m) throw new Error('class java.lang.IllegalArgumentException Timestamp format must be yyyy-mm-dd hh:mm:ss[.fffffffff] for ' + col); return m[1] + ' ' + m[2]; }
      return str;
    }
    function inputsOf(type) {
      var m = {}; q("SELECT f.ad_column_id, f.columnname AS var, f.ad_reference_id AS ref, f.ad_reference_value_id AS refval, c.columnname AS col, c.ad_reference_id AS cref, c.isalwaysupdateable AS alw FROM ws_webservicefieldinput f LEFT JOIN ad_column c ON c.ad_column_id=f.ad_column_id WHERE f.ws_webservicetype_id=? AND f.isactive='Y'", [type.ws_webservicetype_id])
        .forEach(function (r) { m[r.col || r.var] = r; }); return m;
    }
    // ModelADServiceImpl.scanFields :1176-1230 + setValueAccordingToClass :1057-1145. Returns an error string or null; `row` is the PO being built.
    function scanFields(type, row, fields, tableName, processed) {
      var inp = inputsOf(type);
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i], fi = inp[f.column];
        if (!fi) return 'Web service type ' + type.value + ': input column ' + f.column + ' not allowed';                                                          // :1223-1225
        if (!fi.col) continue;                                                                                                                                      // context variable: not ported (named)
        var col = one("SELECT lower(columnname) AS c, ad_reference_id AS ref, ad_reference_value_id AS rv, isalwaysupdateable AS alw, iskey AS k, columnsql FROM ad_column WHERE ad_column_id=?", [fi.ad_column_id]);
        if (!col) return 'Web service type ' + type.value + ': input column ' + f.column + ' does not exist';                                                       // :1203-1206
        if (processed && col.alw !== 'Y') return 'Web service type ' + type.value + ': input column ' + f.column + ' value could not be set: Document Processed';       // :1209-1211
        var val;
        try {
          if (f.lval != null && f.lval !== '') {                                                                                                                     // lookup by display text :1066-1118
            var rv = one("SELECT lower(t.tablename) AS tn, lower(k.columnname) AS kc FROM ad_ref_table rt JOIN ad_table t ON t.ad_table_id=rt.ad_table_id JOIN ad_column k ON k.ad_column_id=rt.ad_key WHERE rt.ad_reference_id=?", [col.rv || 0]);
            var tn = rv ? rv.tn : f.column.replace(/_ID$/i, '').toLowerCase(), kc = rv ? rv.kc : tn + '_id';
            var hit = one("SELECT " + kc + " AS id FROM " + tn + " WHERE upper(name)=upper(?) OR upper(value)=upper(?)", [f.lval, f.lval]);
            if (!hit) throw new Error(' Invalid Lookup value:' + f.lval);
            val = hit.id;
          } else if (f.val == null || f.val === '') val = null;
          else val = convertToObj(f.val, classOf(col.ref), f.column);
        } catch (e) { return 'Web service type ' + type.value + ': input column ' + f.column + ' value could not be set: ' + e.message; }
        row[col.c] = val;
      }
      return null;
    }
    function outputFields(type, row) {   // AbstractService.setOuputFields :349-386 (column order = the type's output rows; text = the lookup's display where the column is a lookup)
      var out = q("SELECT c.columnname AS col, lower(c.columnname) AS lc, c.ad_reference_id AS ref FROM ws_webservicefieldoutput f JOIN ad_column c ON c.ad_column_id=f.ad_column_id WHERE f.ws_webservicetype_id=? AND f.isactive='Y' AND c.isactive='Y'", [type.ws_webservicetype_id]);
      if (!out.length) return '';
      out.sort(function (a, b) { return COLLATE(a.col, b.col); });                                                                                                   // MWebServiceType.getOutputColumnNames :184 ORDER BY c.ColumnName (PG collation)
      return '<_0:outputFields>' + out.map(function (o) {
        var v = row[o.lc]; if (v == null) return '<_0:outputField column="' + esc(o.col) + '"/>';
        if (Number(o.ref) === 20) v = (v === 'Y' || v === true || v === 1) ? 'true' : 'false';   // po.get_Value of a Yes-No column is a java.lang.Boolean (setOuputFields prints toString)
        var txt = ''; if (/_ID$/.test(o.col) && o.lc !== (row.__table + '_id')) { var t = one("SELECT name FROM " + o.lc.replace(/_id$/, '') + " WHERE " + o.lc + "=?", [v]); if (t && t.name != null) txt = ' Text="' + esc(t.name) + '"'; }
        return '<_0:outputField column="' + esc(o.col) + '" value="' + esc(v) + '"' + txt + '/>';
      }).join('') + '</_0:outputFields>';
    }
    function fkError(table, row) {   // PO.validForeignKeys: "Foreign ID n not found in COL"
      var cs = q("SELECT lower(c.columnname) AS c, c.columnname AS cn, c.ad_reference_id AS ref FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)=? AND c.isactive='Y' AND c.columnsql IS NULL AND c.ad_reference_id IN (19,18,30) AND c.iskey<>'Y'", [table]);
      for (var i = 0; i < cs.length; i++) {
        var v = row[cs[i].c]; if (v == null || v === '' || Number(v) <= 0) continue;
        var tn = cs[i].c.replace(/_id$/, ''), tbl = one("SELECT 1 AS x FROM ad_table WHERE lower(tablename)=?", [tn]); if (!tbl) continue;
        if (!one("SELECT 1 AS x FROM " + tn + " WHERE " + tn + "_id=?", [v])) return 'Foreign ID ' + v + ' not found in ' + cs[i].cn;
      }
      return null;
    }
    function pgNotNull(table, row) {   // the DB's own refusal text for an unset NOT NULL column (the pilot answers with the PostgreSQL error; the "Failing row contains" detail is DB-specific and not reproduced)
      var cs = q("SELECT lower(c.columnname) AS c FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)=? AND c.ismandatory='Y' AND c.isactive='Y' AND c.columnsql IS NULL AND c.iskey<>'Y'", [table]);
      for (var i = 0; i < cs.length; i++) if (row[cs[i].c] == null && !STDCOL.test(cs[i].c) && !hasDdlDefault(table, cs[i].c)) return 'DBExecuteError:ERROR: null value in column "' + cs[i].c + '" of relation "' + table + '" violates not-null constraint';
      return null;
    }
    var STDCOL = /^(created|createdby|updated|updatedby|isactive|ad_client_id|ad_org_id)$|_uu$/;   // stamped by the commit (PO.setStandardDefaults), not unset
    function uniqueError(table, row, selfId) {   // the DB's unique-index refusal ("ERROR: duplicate key value violates unique constraint <index>"; ad_ddl_unique = pg_indexes)
      var ix = q("SELECT indexname, columns FROM ad_ddl_unique WHERE tablename=?", [table]);
      for (var i = 0; i < ix.length; i++) {
        var cs = ix[i].columns.split(','), vals = [], skip = false, where = [];
        cs.forEach(function (c) { var v = row[c]; if (v == null) skip = true; vals.push(v); where.push(c + '=?'); });
        if (skip) continue;                                                                                                                                         // NULLs never collide
        var hit = one('SELECT ' + table + '_id AS id FROM ' + table + ' WHERE ' + where.join(' AND ') + (selfId != null ? ' AND ' + table + '_id<>?' : ''), selfId != null ? vals.concat([selfId]) : vals);
        if (hit) return 'ERROR: duplicate key value violates unique constraint "' + ix[i].indexname + '"';
      }
      return null;
    }
    function hasDdlDefault(table, c) { return !!one("SELECT 1 AS x FROM ad_ddl_default WHERE tablename=? AND lower(columnname)=?", [table, c]); }
    function requireKernel() { return K ? null : 'Web service write side is not enabled on this host'; }

    function createData(p, viaUpdate) {   // viaUpdate: RecordID=0 on update_data -> table.getPO(0) is a NEW blank PO, the fields are set and it is SAVED = a create (ModelADServiceImpl :1285, observed on the pilot)
      var pre = prelude(viaUpdate ? 'updateData' : 'createData', p); if (pre.err) return std(viaUpdate ? 0 : null, true, pre.err);
      var tn = pre.crud.tableName, t = tn && tableOf(tn); if (!t) return std(viaUpdate ? 0 : null, true, 'No table ' + tn);                                                          // :794
      var row = K.ML.newPO({ q: q, env: K.env(pre.session) }, t.t, {}), err = scanFields(pre.type, row, p.crud.fields, t.t, false);
      if (err) return std(viaUpdate ? 0 : null, true, err);
      err = (K.breakMode === 'nofk') ? null : fkError(t.t, row); if (err) return std(viaUpdate ? 0 : null, true, 'Cannot save record in ' + tn + ': ' + err);   // breakMode: W-WS-DIFF-WRITE negative control only                                                         // :823-825
      var r = K.inTrx(pre.session, { ws: viaUpdate ? 'update_data' : 'create_data', type: pre.type.value }, function (trx, ML) { var sv = ML.save(trx, t.t, null, row); if (!sv.ok) return { ok: false, error: sv.error }; var pre2 = pgNotNull(t.t, sv.row) || uniqueError(t.t, sv.row, null); return pre2 ? { ok: false, error: pre2 } : { ok: true, row: sv.row }; });   // the DB checks see the row AFTER PO.saveNew numbering (DocumentNo)
      if (!r.ok) return std(viaUpdate ? 0 : null, true, 'Cannot save record in ' + tn + ': ' + (r.error || 'SaveError'));                                                                // :828
      var idx = -1; r.ops.forEach(function (o, i) { if (idx < 0 && o.table === t.t && o.op_type === 'CRUD_CREATE') idx = i; });
      var id = r.ids[idx], saved = one('SELECT * FROM ' + t.t + ' WHERE ' + t.t + '_id=?', [id]) || {}; saved.__table = t.t;
      return std(id, false, null, outputFields(pre.type, saved));
    }
    function updateData(p) {
      var pre = prelude('updateData', p); if (pre.err) return std(null, true, pre.err);
      var tn = pre.crud.tableName, id = pre.crud.recordId, t = tn && tableOf(tn); if (!t) return std(id, true, 'No table ' + tn);
      if (id === 0) return createData(p, true);
      var cur = one('SELECT * FROM ' + t.t + ' WHERE ' + t.t + '_id=?', [id]); if (!cur) return std(id, true, 'No Record ' + id + ' in ' + tn);                           // :1272
      var proc = cur.processed === 'Y', row = Object.assign({}, cur), err = scanFields(pre.type, row, p.crud.fields, t.t, proc);
      if (err) return std(id, true, err);
      err = fkError(t.t, row); if (err) return std(id, true, 'Cannot save record in ' + tn + ': ' + err);
      var r = K.inTrx(pre.session, { ws: 'update_data', type: pre.type.value, id: id }, function (trx, ML) { var ch = {}; Object.keys(row).forEach(function (k) { if (row[k] !== cur[k]) ch[k] = row[k]; }); var u2 = uniqueError(t.t, row, id); if (u2) return { ok: false, error: u2 }; var sv = ML.save(trx, t.t, trx.get(t.t, id), ch); return sv.ok ? { ok: true, row: sv.row } : { ok: false, error: sv.error }; });
      if (!r.ok) return std(id, true, 'Cannot save record in ' + tn + ': ' + (r.error || 'SaveError'));
      var saved = one('SELECT * FROM ' + t.t + ' WHERE ' + t.t + '_id=?', [id]); saved.__table = t.t;
      return std(id, false, null, outputFields(pre.type, saved));
    }
    function deleteData(p) {
      var pre = prelude('deleteData', p); if (pre.err) return std(null, true, pre.err);
      var tn = pre.crud.tableName, id = pre.crud.recordId, t = tn && tableOf(tn); if (!t) return std(id, true, 'No table ' + tn);
      if (id === 0) return std(0, true, 'Cannot commit transaction after delete record -1 in ' + tn);   // getPO(0) is a blank PO: delete() answers true, its get_ID() is -1, the commit then fails (pilot)
      if (!one('SELECT 1 AS x FROM ' + t.t + ' WHERE ' + t.t + '_id=?', [id])) return std(id, true, 'No Record ' + id + ' in ' + tn);                                    // :719
      var r = K.inTrx(pre.session, { ws: 'delete_data', type: pre.type.value, id: id }, function (trx, ML) { return ML.remove(trx, t.t, trx.get(t.t, id)); });
      if (!r.ok) return std(id, true, 'Cannot delete record ' + id + ' in ' + tn + ': ' + (r.error || 'DeleteError'));                                                   // :722
      return std(id, false);
    }
    function runProcess(p) {   // ModelADServiceImpl.runProcess :394-462 -> Process.runProcess (adinterface/Process.java:197) -> the verbatim SvrProcess port (ad_process.js dispatch), one Trx
      var d = p.runProcess || {};
      function resp(isError, text, log) { return '<?xml version="1.0" encoding="UTF-8"?>\n<_0:RunProcessResponse IsError="' + (isError ? 'true' : 'false') + '" xmlns:_0="' + NS + '"><_0:Error>' + esc(text) + '</_0:Error><_0:Summary>' + esc(isError ? '' : text) + '</_0:Summary>' + (log ? '<_0:LogInfo>' + log.replace(/^<!\[CDATA\[|\]\]>$/g, function (m) { return m === ']]>' ? ']]>' : '<![CDATA['; }) + '</_0:LogInfo>' : '<_0:LogInfo/>') + '</_0:RunProcessResponse>'; }
      var l = login(p.login); if (l.error) return resp(true, l.error);
      var a = authenticate(l.session, 'runProcess', d.serviceType); if (a.error) return resp(true, a.error);
      var v = {}; try { ['AD_Menu_ID', 'AD_Process_ID', 'AD_Record_ID', 'DocAction'].forEach(function (n) { var raw = n === 'AD_Menu_ID' ? d.menuId : n === 'AD_Process_ID' ? d.processId : n === 'AD_Record_ID' ? d.recordId : d.docAction; var r = validateParam(a.type, n, raw == null ? null : String(raw)); if (r.fault) throw new Error(r.fault); v[n] = r.v; }); } catch (e) { return resp(true, e.message); }
      var pid = parseInt(v.AD_Process_ID || '0', 10), mid = parseInt(v.AD_Menu_ID || '0', 10), rid = parseInt(v.AD_Record_ID || '0', 10);
      if (mid > 0 && pid <= 0) { var mm = one("SELECT ad_process_id AS id FROM ad_menu WHERE ad_menu_id=? AND action='P'", [mid]); pid = mm ? Number(mm.id) : 0; }
      var proc = pid > 0 ? one("SELECT ad_process_id FROM ad_process WHERE ad_process_id=? AND isactive='Y'", [pid]) : null;
      if (!proc) return resp(true, 'Process not found');                                                                                                             // Process.java:215
      var params = {}; (d.fields || []).forEach(function (f) { if (f.column === 'AD_Record_ID') { if (f.val) rid = parseInt(f.val, 10) || rid; } else if (f.val != null && f.val !== '') params[f.column] = f.val; });
      var AP = typeof require === 'function' ? require('./ad_process.js') : self.AdProcess;
      var dbS = { prepare: function (sql) { return { get: function () { return one(sql, [].slice.call(arguments)); }, all: function () { return q(sql, [].slice.call(arguments)); }, run: function () {} }; } };
      var ctx = { runInTrx: function (fn) { var env = K.env(l.session); var jr = fn(K.q, env); if (jr && jr.ok && jr.ops && jr.ops.length) K.commit(l.session, jr.ops, { ws: 'run_process', type: a.type.value, process: pid }); return jr; } };
      var res; try { res = AP.dispatch(dbS, { AD_Process_ID: pid, Record_ID: rid, Table_ID: 0, params: params, noValidate: true }, ctx); } catch (e) { return resp(true, String(e && e.message || e)); }
      if (!res.dispatched) return resp(true, res.message || res.reason || 'process not run');
      var lg = ((res.result && res.result.logs) || []).map(function (x) { return typeof x === 'string' ? x : (x.msg || x.message || x.m || JSON.stringify(x)); });
      var logs = lg.length ? '<![CDATA[<table width="100%" border="1" cellspacing="0" cellpadding="2">' + lg.map(function (t) { return '<tr><td>' + t + '</td></tr>'; }).join('') + '</table>]]>' : '';   // ProcessInfo.getLogInfo(true)
      return resp(!!(res.result && res.result.isError) || res.ok === false, (res.result && res.result.summary) || res.message || '', logs);
    }
    function setDocAction(p) {
      var d = p.docAction || {};
      var l = login(p.login); if (l.error) return std(null, true, l.error);
      var a = authenticate(l.session, 'setDocAction', d.serviceType); if (a.error) return std(null, true, a.error);
      var tn, id, act;
      try {
        var v1 = validateParam(a.type, 'tableName', d.tableName), v2 = validateParam(a.type, 'recordID', String(d.recordId || 0)), v3 = validateParam(a.type, 'docAction', d.docAction);
        [v1, v2, v3].forEach(function (v) { if (v.fault) throw new Error(v.fault); });
        tn = v1.v; id = v2.v == null || v2.v === '0' ? 0 : parseInt(v2.v, 10); act = v3.v;
      } catch (e) { return std(null, true, e.message); }
      var t = tn && tableOf(tn); if (!t) return std(id, true, 'No table ' + tn);                                                                                        // :239
      if (id === 0 && !(typeof K === 'undefined' || !K)) {   // blank PO: set DocAction, save (:246-250) - a failing beforeSave answers its message
        var nb = K.ML.newPO({ q: q, env: K.env(l.session) }, t.t, {}); nb.docaction = act;
        var rb = K.inTrx(l.session, { ws: 'set_docaction', type: a.type.value, id: 0 }, function (trx, ML) { var sv = ML.save(trx, t.t, null, nb); return sv.ok ? { ok: true, row: sv.row } : { ok: false, error: sv.error }; });
        if (!rb.ok) return std(0, true, 'Cannot save before set docAction: ' + (rb.error || 'no log message'));
        id = rb.ids[0];
      }
      var cur = one('SELECT * FROM ' + t.t + ' WHERE ' + t.t + '_id=?', [id]); if (!cur) return std(id, true, 'No Record ' + id + ' in ' + tn);                           // :243
      if (cur.docstatus != null && FSM && act !== '--') {   // DocumentEngine.processIt :263-289: the action must be valid for the status, else IllegalStateException (e.toString() is the message, :269)
        var legal; try { legal = t.t === 'c_order' ? FSM.legalActionsOrder(dbShim, { docStatus: cur.docstatus, isSOTrx: cur.issotrx, doctypeId: cur.c_doctype_id, processing: cur.processing }) : FSM.legalActions(dbShim, cur.c_doctype_id, cur.docstatus).actions; } catch (e) { legal = null; }
        if (legal && legal.indexOf(act) < 0) return std(id, true, 'java.lang.IllegalStateException: Status=' + cur.docstatus + ' - Invalid Actions: Process=' + act + ', Doc=' + act);
      }
      var r = K.inTrx(l.session, { ws: 'set_docaction', type: a.type.value, id: id, action: act }, function (trx, ML) {
        var out = ML.runWorkflow(trx, t.t, id, act);                                                                                                                       // :249-279 save DocAction, processIt, save
        return out.ok ? { ok: true } : { ok: false, error: out.msg || 'processIt failed' };
      });
      if (!r.ok && /^model threw: /.test(r.error || '')) return std(id, true, 'org.adempiere.exceptions.AdempiereException: ' + parseTranslation((r.error || '').slice(13).replace(/^FailedProcessingDocument/, '@FailedProcessingDocument@')));   // an AdempiereException thrown out of processIt reaches the caller as e.toString() (WebServiceFacade catch), not the :267 message
      if (!r.ok) return std(id, true, parseTranslation('@FailedProcessingDocument@: ' + (r.error || '')));                                                                   // :267
      var saved = one('SELECT * FROM ' + t.t + ' WHERE ' + t.t + '_id=?', [id]); saved.__table = t.t;
      return std(id, false, null, outputFields(a.type, saved));
    }

    function typeOf(table, column) {   // the Java class of a column as the JSON binding sees it (DisplayType.getClass): numbers stay numbers
      if (!table || !column) return 'str';
      var c = one("SELECT c.ad_reference_id AS ref FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)=lower(?) AND lower(c.columnname)=lower(?)", [table, column]);
      var k = c ? classOf(c.ref) : 'str'; return k === 'bool' || k === 'ts' ? 'str' : k;
    }
    return {
      typeOf: typeOf,
      handle: function (method, xml, hopts) {
        var p; try { p = parseRequest(xml); } catch (e) { return wtdError('Bad request: ' + e.message); }
        if (host.policy && /^(read_data|query_data|get_list|create_data|create_update_data|update_data|delete_data|set_docaction|run_process)$/.test(method)) {   // host-enforced policy (ws_policy.js): expiry, rate/volume limits, staged approval - BEFORE any work
          var lg = login(p.login);
          if (lg.session) {
            var po = { approved: !!(hopts && hopts.approved), onBehalf: hopts && hopts.onBehalf }, pr = host.policy.before(lg.session, method, xml, po);
            if (po.principal && K && K.ctxMeta) K.ctxMeta.v = Object.assign({}, K.ctxMeta.v || {}, { onBehalfOf: po.principal });   // the server clears it after the call
            if (pr && pr.error) return /^(read_data|query_data|get_list)$/.test(method) ? wtdError(pr.error) : method === 'run_process' ? ('<?xml version="1.0" encoding="UTF-8"?>\n<_0:RunProcessResponse IsError="true" xmlns:_0="' + NS + '"><_0:Error>' + esc(pr.error) + '</_0:Error><_0:Summary></_0:Summary><_0:LogInfo/></_0:RunProcessResponse>') : std(null, true, pr.error);
          }
        }
        if (method === 'get_list') return getList(p);
        if (method === 'read_data') return readData(p);
        if (method === 'query_data') return queryData(p);
        var needK = requireKernel(); 
        if (/^(create_data|create_update_data|update_data|delete_data|set_docaction)$/.test(method)) { if (needK) return std(null, true, needK); }
        if (method === 'run_process') return needK ? std(null, true, needK) : runProcess(p);
        if (method === 'create_data') return createData(p);
        if (method === 'create_update_data') return createUpdateData(p);
        if (method === 'update_data') return updateData(p);
        if (method === 'delete_data') return deleteData(p);
        if (method === 'set_docaction') return setDocAction(p);
        return wtdError('Method ' + method + ' not registered');
      }
    };
  }
  return { create: create, parseRequest: parseRequest };
});
