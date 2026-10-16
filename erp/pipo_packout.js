// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// pipo_packout.js - Pack Out to a real iDempiere 2Pack (PackOut.xml in a zip), ported from org.adempiere.pipo2 (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §25).
// The rules, with their source:
//   detail lines  PackOutProcess.doIt          AD_Package_Exp_Detail of one AD_Package_Exp, active, ORDER BY Line; Type -> one element handler; unknown -> "Packout handler not found for type"
//   document      PackOut.java:213-239          <idempiere Name Version idempiereVersion DataBaseVersion Description Author AuthorEmail CreatedDate UpdatedDate PackOutVersion UpdateDictionary Client AD_Client_UU>
//   zip           PackOut.java:120-191          <Name>/dict/PackOut.xml + <Name>/doc/<Name>Doc.xml (+ <Name>/blobs/<n>.dat for LOB columns, PackOut.writeBlob)
//   filter        AbstractElementHandler.isPackOutElement:591-606   Updated < DateFrom -> skip; EntityType D/EE01/EE02/EE04/EE05 -> skip unless IsExportDictionaryEntity
//   requirement   AbstractElementHandler.verifyPackOutRequirement:583  no UUID and no official single key -> refused
//   record body   PoExporter.export             AD_Client 0 -> AD_Client_ID/AD_Org_ID 0 first; AD_Column order (POInfo ORDER BY AD_Column_ID, IsActive='Y'); excludes ad_client_id, created(by), updated(by)
//                                               and AD_Org_ID; <Table>_ID only if official; YesNo -> Y/N; references -> ReferenceUtils.getTableReference (id / uuid / empty); NULL UUID column omitted
//   handlers      P ProcessElementHandler (+ AD_Process_Para), X FormElementHandler, D/DS GenericPOElementHandler, SQL SQLStatementElementHandler, ET EntityTypeElementHandler, MSG MessageElementHandler
// Not ported (named): W/F/IW/REF/V/PFT/R/S/IMP/B/MV/T and file/script types (refused like an unknown type); translations (CommonTranslationHandler); AD_TableAttribute; a process's
//   ReportView / PrintFormat / Workflow and a parameter's Reference / Val_Rule dependencies are NOT emitted - counted as dependencies (none arise when they are official records and
//   the pack does not export the dictionary entity, which is legacy's own outcome).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PipoPackOut = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var MAX_OFFICIAL_ID = 999999;
  var OFFICIAL_ET = { D: 1, EE01: 1, EE02: 1, EE04: 1, EE05: 1 };
  var EXCLUDE = ['ad_client_id', 'created', 'createdby', 'updated', 'updatedby'];
  var DT = { ID: 13, LIST: 17, TABLE: 18, TABLEDIR: 19, YESNO: 20, LOCATION: 21, BINARY: 23, ACCOUNT: 25, SEARCH: 30, LOCATOR: 31, IMAGE: 32, PATTRIBUTE: 35, TEXTLONG: 36,
    PAYMENT: 200012, RADIOLIST: 200152, CHOSEN_LIST: 200161, CHOSEN_TABLE: 200162, CHOSEN_SEARCH: 200163, TABLE_UU: 200233, TABLEDIR_UU: 200234, SEARCH_UU: 200235, SSGRID: 200127, MSGRID: 200128 };
  var TYPES = { P: 'AD_Process', X: 'AD_Form', D: 'D', DS: 'DS', SQL: 'SQLStatement', SQM: null, ET: 'AD_EntityType', MSG: 'AD_Message' };
  var HANDLED_TABLE = { ad_process: 'P', ad_form: 'X', ad_entitytype: 'ET', ad_message: 'MSG' };   // a D row of these tables is delegated (GenericPOElementHandler.packOut :182-189)
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function attr(s) { return esc(s).replace(/"/g, '&quot;'); }
  // Java toString of a value read from the DB (Timestamp "yyyy-mm-dd hh:mm:ss.f", numbers as written)
  function jstr(v, dt) {
    if (v == null) return '';
    if ((dt === 15 || dt === 16) && /^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d$/.test(String(v))) return String(v).replace('T', ' ') + '.0';
    return String(v);
  }
  function exporter(q, opts) {
    opts = opts || {};
    var say = opts.say || function () {}, out = [], depth = 1, blobs = [], stat = { records: 0, byTable: {}, skipped: { fromDate: 0, dictionary: 0, otherClient: 0 }, dependencies: [], exported: {} };
    var cols = {}, refTable = {};
    function columnsOf(table) {   // POInfo: AD_Column of the table, active, ORDER BY AD_Column_ID
      var k = table.toLowerCase(); if (cols[k]) return cols[k];
      cols[k] = q("SELECT c.columnname AS n, c.ad_reference_id AS r, c.ad_reference_value_id AS rv, c.columnsql AS csql FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)=lower(?) AND c.isactive='Y' ORDER BY c.ad_column_id", [table]);
      if (!cols[k].length) throw new Error('table ' + table + ' has no AD_Column rows in the dictionary');
      return cols[k];
    }
    function tableNameOf(id) { var r = q('SELECT tablename AS t FROM ad_table WHERE ad_table_id=?', [id])[0]; return r ? r.t : null; }
    function lookupTable(c) {   // the referenced table of a lookup column (MColumn.getReferenceTableName / POInfo lookup)
      if (c.rv && (c.r === DT.TABLE || c.r === DT.SEARCH || c.r === DT.TABLE_UU || c.r === DT.SEARCH_UU || c.r === DT.CHOSEN_TABLE || c.r === DT.CHOSEN_SEARCH)) {
        var key = 'rt' + c.rv; if (!(key in refTable)) { var rt = q('SELECT t.tablename AS t FROM ad_ref_table r JOIN ad_table t ON t.ad_table_id=r.ad_table_id WHERE r.ad_reference_id=?', [c.rv])[0]; refTable[key] = rt ? rt.t : null; }
        if (refTable[key]) return refTable[key];
      }
      return /_I[DU]$/i.test(c.n) ? c.n.replace(/_(ID|UU)$/i, '') : null;
    }
    function line(s) { out.push(new Array(depth + 1).join('    ') + s); }
    function el(name, value, atts) { var a = Object.keys(atts || {}).map(function (k) { return ' ' + k + '="' + attr(atts[k]) + '"'; }).join(''); line(value === '' ? '<' + name + a + '/>' : '<' + name + a + '>' + esc(value) + '</' + name + '>'); }
    function reference(table, id) {   // ReferenceUtils.getTableReference
      if (id != null && Number(id) > 0 && Number(id) <= MAX_OFFICIAL_ID) return { v: String(Number(id)), a: { reference: 'id', 'reference-key': table } };
      if (id == null || Number(id) <= 0) return { v: '', a: { reference: 'id' } };
      var uuc = table.toLowerCase() + '_uu', has = q('SELECT 1 AS x FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)=lower(?) AND lower(c.columnname)=?', [table, uuc]).length;   // table.getColumn(uuidColumnName)
      if (has) { var r = q('SELECT ' + uuc + ' AS u FROM ' + table + ' WHERE ' + table + '_ID=?', [id])[0]; if (r && r.u && String(r.u).trim()) return { v: String(r.u).trim(), a: { reference: 'uuid', 'reference-key': table } }; }
      return { v: '', a: { reference: 'id' } };
    }
    function isPackOutElement(table, row) {
      if (opts.dateFrom && row.updated != null && String(row.updated) < String(opts.dateFrom)) { stat.skipped.fromDate++; return false; }
      if (!opts.exportDictionaryEntity && row.entitytype != null && OFFICIAL_ET[row.entitytype]) { stat.skipped.dictionary++; return false; }
      return true;
    }
    function verifyRequirement(table, row) {
      var t = table.toLowerCase(), uu = row[t + '_uu'], id = row[t + '_id'];
      if ((uu == null || String(uu).trim() === '') && !(id != null && Number(id) > 0 && Number(id) <= MAX_OFFICIAL_ID))
        throw new Error("2Pack doesn't work with record without official Id and UUID -> " + table + '_UU');
    }
    // PoExporter.export(excludes)
    function exportRow(table, row, excludes, leadOfficialKey) {
      var t = table.toLowerCase(), ex = EXCLUDE.concat(excludes || []);
      if (leadOfficialKey) { var kid = row[t + '_id']; if (kid != null && Number(kid) > 0 && Number(kid) <= MAX_OFFICIAL_ID) el(table + '_ID', jstr(kid), {}); }
      if (Number(row.ad_client_id) === 0) { el('AD_Client_ID', '0', {}); if (ex.indexOf('ad_org_id') < 0) el('AD_Org_ID', '0', {}); }
      else if (ex.indexOf('ad_org_id') < 0) el('AD_Org_ID', Number(row.ad_org_id) === 0 ? '0' : (opts.includeOrganizationId ? String(row.ad_org_id) : '@AD_Org_ID@'), {});
      columnsOf(table).forEach(function (c) {
        var n = c.n, ln = n.toLowerCase(), v = row[ln], r = Number(c.r);
        if (n === 'AD_Language' || n === 'EntityType') r = 10; else if (n === 'Record_ID') r = DT.ID;   // POInfoColumn:76-90: these two are Strings, Record_ID is an ID, whatever AD_Column says
        if (ex.indexOf(ln) >= 0) return;
        if (n === 'AD_Org_ID' && t !== 'ad_org') return;
        if (ln === t + '_id') { if (v != null && Number(v) > 0 && Number(v) <= MAX_OFFICIAL_ID) el(n, jstr(v), {}); return; }
        if (!(ln in row)) return;   // a dictionary column the twin's table does not carry physically (virtual ColumnSQL or schema drift): no value to export
        if (r === DT.YESNO) { el(n, v === true || v === 'Y' ? 'Y' : 'N', {}); return; }
        var refT = null, isRef = false;
        if (r === DT.TABLEDIR || r === DT.ID) { isRef = true; refT = (/^record_(id|uu)$/.test(ln) && row.ad_table_id) ? tableNameOf(row.ad_table_id) : lookupTable(c); }
        else if (r === DT.LIST || r === DT.RADIOLIST || r === DT.CHOSEN_LIST || r === DT.PAYMENT) { el(n, jstr(v), {}); return; }
        else if (r === DT.TABLE || r === DT.SEARCH || r === DT.TABLE_UU || r === DT.SEARCH_UU || r === DT.TABLEDIR_UU || r === DT.CHOSEN_TABLE || r === DT.CHOSEN_SEARCH || r === DT.SSGRID || r === DT.MSGRID) {
          isRef = true; refT = (/^record_(id|uu)$/.test(ln) && row.ad_table_id) ? tableNameOf(row.ad_table_id) : lookupTable(c);
          if (!refT) throw new Error('Could not find the related table for column ' + table + '.' + n);
        }
        else if (r === DT.ACCOUNT) { isRef = true; refT = 'C_ValidCombination'; }
        else if (r === DT.BINARY || r === DT.TEXTLONG) {
          if (v == null) { el(n, '', {}); return; }
          blobs.push({ name: (blobs.length + 1) + '.dat', data: typeof v === 'string' ? new TextEncoder().encode(v) : v });
          el(n, blobs.length + '.dat|' + (typeof v === 'string' ? 'string' : 'byte[]'), {}); return;
        }
        else if (ln === t + '_uu' && v == null) return;
        else if (r === DT.LOCATOR) { isRef = true; refT = 'M_Locator'; }
        else if (r === DT.LOCATION) { isRef = true; refT = 'C_Location'; }
        else if (r === DT.IMAGE) { isRef = true; refT = 'AD_Image'; }
        else if (r === DT.PATTRIBUTE) { isRef = true; refT = 'M_AttributeSetInstance'; }
        if (isRef && refT) {
          if (/_UU$/i.test(n) || r === DT.TABLE_UU || r === DT.SEARCH_UU || r === DT.TABLEDIR_UU) { el(n, v == null || v === '' ? '' : String(v).trim(), v == null || v === '' ? { reference: 'uuid' } : { reference: 'uuid', 'reference-key': refT }); return; }
          var ref = (Number(v) === 0 && (n === 'Node_ID' || n === 'Parent_ID')) ? { v: '0', a: {} } : reference(refT, v);
          el(n, ref.v, ref.a); return;
        }
        el(n, jstr(v, r), {});
      });
    }
    function open(table, type) { line('<' + table + ' type="' + type + '">'); depth++; }
    function close(table) { depth--; line('</' + table + '>'); }
    function count(table) { stat.records++; stat.byTable[table] = (stat.byTable[table] || 0) + 1; }
    function once(key) { if (stat.exported[key]) return false; stat.exported[key] = 1; return true; }
    function rowOf(table, id) { var r = q('SELECT * FROM ' + table + ' WHERE ' + table + '_ID=?', [id])[0]; if (!r) throw new Error(table + ' ' + id + ' not found'); return r; }
    var H = {};
    // ProcessElementHandler.create: the process, then its parameters inside it (ReportView/PrintFormat/Workflow + para Reference/ValRule dependencies counted, not emitted)
    H.P = function (id) {
      if (!once('AD_Process_ID|' + id)) return;
      var p = rowOf('AD_Process', id);
      if (p.isreport === 'Y' && Number(p.ad_reportview_id) > 0) stat.dependencies.push('AD_ReportView ' + p.ad_reportview_id);
      if (p.isreport === 'Y' && Number(p.ad_printformat_id) > 0) stat.dependencies.push('AD_PrintFormat ' + p.ad_printformat_id);
      if (Number(p.ad_workflow_id) > 0) stat.dependencies.push('AD_Workflow ' + p.ad_workflow_id);
      var create = isPackOutElement('AD_Process', p);
      if (create) { verifyRequirement('AD_Process', p); open('AD_Process', 'table'); exportRow('AD_Process', p, [], true); count('AD_Process'); }
      q('SELECT * FROM AD_Process_Para WHERE AD_Process_ID=? ORDER BY AD_Process_Para_ID', [id]).forEach(function (pp) {
        [['AD_Reference', pp.ad_reference_id], ['AD_Reference', pp.ad_reference_value_id], ['AD_Val_Rule', pp.ad_val_rule_id]].forEach(function (d) {
          if (Number(d[1]) > 0) { var dr = q('SELECT entitytype AS e FROM ' + d[0] + ' WHERE ' + d[0] + '_ID=?', [d[1]])[0]; if (!(dr && OFFICIAL_ET[dr.e] && !opts.exportDictionaryEntity)) stat.dependencies.push(d[0] + ' ' + d[1]); }
        });
        if (!once('AD_Process_Para_ID|' + pp.ad_process_para_id) || !isPackOutElement('AD_Process_Para', pp)) return;   // ProcessParaElementHandler.create
        verifyRequirement('AD_Process_Para', pp); open('AD_Process_Para', 'table'); exportRow('AD_Process_Para', pp, [], true); close('AD_Process_Para'); count('AD_Process_Para');
      });
      if (create) close('AD_Process');
    };
    function simple(table, key) { return function (id) { if (!once(table + '_ID|' + id)) return; var r = rowOf(table, id); if (!isPackOutElement(table, r)) return; verifyRequirement(table, r); open(table, 'table'); exportRow(table, r, [], true); close(table); count(table); }; }
    H.X = simple('AD_Form'); H.MSG = simple('AD_Message');
    H.ET = function (id) {   // EntityTypeElementHandler: the AD_EntityType row (+ its AD_Modification rows, when the twin carries the table)
      if (!once('AD_EntityType_ID|' + id)) return; var r = rowOf('AD_EntityType', id);
      if (!isPackOutElement('AD_EntityType', r)) return; verifyRequirement('AD_EntityType', r); open('AD_EntityType', 'table'); exportRow('AD_EntityType', r, [], false); count('AD_EntityType');
      var hasMod = q("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name='ad_modification'").length;
      if (hasMod) q('SELECT * FROM AD_Modification WHERE entitytype=? ORDER BY AD_Modification_ID', [r.entitytype]).forEach(function (m) { open('AD_Modification', 'table'); exportRow('AD_Modification', m, [], true); close('AD_Modification'); count('AD_Modification'); });
      close('AD_EntityType');
    };
    // GenericPOElementHandler.create (Data / DataSingle): the rows of AD_Table_ID the SQL selects, this client only; a single-key row of a handled table is delegated (Data only)
    function data(single) {
      return function (d) {
        var table = tableNameOf(d.ad_table_id), sql = String(d.sqlstatement || '').split(';')[0];
        if (!table) throw new Error('AD_Table_ID ' + d.ad_table_id + ' not found');
        if (String(d.sqlstatement || '').indexOf(';') > 0) stat.dependencies.push('detail tables of a Data line (' + table + ' >..) not exported');
        var excludes = [], checked = /^\s*select\s+\*/i.test(sql);
        q(sql, []).forEach(function (row0) {
          var row = {}; Object.keys(row0).forEach(function (k) { row[k.toLowerCase()] = row0[k]; });
          if (Number(row.ad_client_id) !== Number(opts.clientId || 0)) { stat.skipped.otherClient++; return; }
          if (!checked) {   // IDEMPIERE-1563: columns the SQL did not select are excluded; the client/org, key and UUID columns must be there
            columnsOf(table).forEach(function (c) { var ln = c.n.toLowerCase(); if (!(ln in row)) { if (ln === 'ad_client_id' || ln === 'ad_org_id') throw new Error('SQL Statement must include AD_Client_ID and AD_Org_ID'); if (excludes.indexOf(ln) < 0) excludes.push(ln); } });
            if (excludes.indexOf(table.toLowerCase() + '_uu') >= 0) throw new Error('SQL Statement must include UUID column');
            checked = true;
          }
          if (!isPackOutElement(table, row)) return;
          var keyId = row[table.toLowerCase() + '_id'];
          if (!single && keyId != null && HANDLED_TABLE[table.toLowerCase()]) { H[HANDLED_TABLE[table.toLowerCase()]](keyId); return; }
          verifyRequirement(table, row); open(table, 'table'); exportRow(table, row, excludes, false); close(table); count(table);
        });
      };
    }
    H.D = data(false); H.DS = data(true);
    H.SQL = function (d) { line('<SQLStatement type="custom">'); depth++; el('DBType', String(d.dbtype || 'ALL'), {}); line('<statement><![CDATA[' + String(d.sqlstatement || '').replace(/\]\]>/g, ']]]]><![CDATA[>') + ']]></statement>'); depth--; line('</SQLStatement>'); count('SQLStatement'); };
    return {
      item: function (d) {
        var type = d.type;
        if (!H[type]) throw new Error('Packout handler not found for type ' + (TYPES[type] || type));
        if (type === 'P') H.P(d.ad_process_id); else if (type === 'X') H.X(d.ad_form_id); else if (type === 'ET') H.ET(d.ad_entitytype_id); else if (type === 'MSG') H.MSG(d.ad_message_id); else H[type](d);
        say('§PACKOUT item line=' + d.line + ' type=' + type + ' records=' + stat.records);
      },
      body: function () { return out.join('\n'); }, blobs: blobs, stat: stat
    };
  }
  // PackOutProcess.doIt + PackOut.export: header + details -> { name, xml, docXml, blobs, count, stat }
  function exportPackage(q, header, details, opts) {
    opts = opts || {};
    var cl = q('SELECT ad_client_id AS id, value AS v, name AS n, ad_client_uu AS uu FROM ad_client WHERE ad_client_id=?', [opts.clientId || 0])[0];
    if (!cl || !cl.uu) throw new Error('2Pack requires UUID on AD_Client');
    var ex = exporter(q, { say: opts.say, clientId: opts.clientId || 0, dateFrom: header.datefrom || null, exportDictionaryEntity: header.isexportdictionaryentity === 'Y', includeOrganizationId: (opts.clientId || 0) > 0 && header.isincludeorganizationid === 'Y' });
    var n = 0;
    details.forEach(function (d) { ex.item(d); n++; });
    var ts = function (v) { return v == null ? '' : String(v).replace('T', ' ') + (/\.\d+$/.test(String(v)) ? '' : '.0'); };
    var root = '<?xml version="1.0" encoding="UTF-8"?><idempiere Name="' + attr(header.name) + '" Version="' + attr(header.pk_version || '') + '" idempiereVersion="' + attr(header.releaseno || '') + '" DataBaseVersion="' + attr(header.version || '') +
      '" Description="' + attr(header.description || '') + '" Author="' + attr(header.username || '') + '" AuthorEmail="' + attr(header.email || '') + '" CreatedDate="' + attr(ts(header.created)) + '" UpdatedDate="' + attr(ts(header.updated)) +
      '" PackOutVersion="100" UpdateDictionary="' + (header.isexportdictionaryentity === 'Y' ? 'true' : 'false') + '" Client="' + attr(cl.id + '-' + cl.v + '-' + cl.n) + '" AD_Client_UU="' + attr(cl.uu) + '">';
    var xml = root + '\n' + ex.body() + '\n</idempiere>\n';
    var doc = '<?xml version="1.0" encoding="UTF-8"?><idempiereDocument><header>' + esc(header.name) + ' Package Description</header><H3>Package Name:</H3><packagename>' + esc(header.name) + '</packagename><file>File: PackOut.xml</file><filedirectory>Directory: \\dict\\</filedirectory></idempiereDocument>\n';
    return { name: header.name, xml: xml, docXml: doc, blobs: ex.blobs, count: n, stat: ex.stat };
  }
  // ── zip writer: deflate-raw (CompressionStream) + CRC-32, no library ──
  var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { var c = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  async function deflateRaw(u8) { var cs = new CompressionStream('deflate-raw'), w = cs.writable.getWriter(); w.write(u8); w.close(); return new Uint8Array(await new Response(cs.readable).arrayBuffer()); }
  async function zip(files) {   // files: [{ path, data: Uint8Array|string }]
    var enc = new TextEncoder(), parts = [], central = [], off = 0;
    for (var i = 0; i < files.length; i++) {
      var f = files[i], name = enc.encode(f.path), raw = typeof f.data === 'string' ? enc.encode(f.data) : f.data, comp = await deflateRaw(raw), crc = crc32(raw);
      var lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 8, true); lh.setUint32(14, crc, true); lh.setUint32(18, comp.length, true); lh.setUint32(22, raw.length, true); lh.setUint16(26, name.length, true);
      var ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 8, true); ch.setUint32(16, crc, true); ch.setUint32(20, comp.length, true); ch.setUint32(24, raw.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
      parts.push(new Uint8Array(lh.buffer), name, comp); central.push(new Uint8Array(ch.buffer), name); off += 30 + name.length + comp.length;
    }
    var csize = central.reduce(function (m, p) { return m + p.length; }, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, off, true);
    var all = parts.concat(central, [new Uint8Array(end.buffer)]), total = all.reduce(function (m, p) { return m + p.length; }, 0), outb = new Uint8Array(total), o = 0;
    all.forEach(function (p) { outb.set(p, o); o += p.length; });
    return outb;
  }
  async function packageZip(res) {   // PackOut.java:120-191 layout
    var files = [{ path: res.name + '/dict/PackOut.xml', data: res.xml }, { path: res.name + '/doc/' + res.name + 'Doc.xml', data: res.docXml }];
    res.blobs.forEach(function (b) { files.push({ path: res.name + '/blobs/' + b.name, data: b.data }); });
    return zip(files);
  }
  // PackOutProcess.doIt for one AD_Package_Exp: details active, ORDER BY Line
  function exportById(q, packageExpId, opts) {
    var h = q('SELECT * FROM AD_Package_Exp WHERE AD_Package_Exp_ID=?', [packageExpId])[0];
    if (!h) throw new Error('No Record');
    var d = q("SELECT * FROM AD_Package_Exp_Detail WHERE AD_Package_Exp_ID=? AND IsActive='Y' ORDER BY Line", [packageExpId]);
    return exportPackage(q, h, d, opts);
  }
  // processUI.download (PackOutProcess.doIt :218): the zip is built (async: CompressionStream) and handed to the browser; the last one is kept for a witness
  var last = null;
  function deliver(res) {
    last = packageZip(res).then(function (bytes) {
      var file = res.name + '.zip';
      if (typeof document !== 'undefined' && typeof Blob !== 'undefined' && !(typeof window !== 'undefined' && window.__packOutNoDownload)) {
        var a = document.createElement('a'), u = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' })); a.href = u; a.download = file; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 5000);
      }
      if (typeof console !== 'undefined') console.log('§PACKOUT-DOWNLOAD file=' + file + ' bytes=' + bytes.length + ' records=' + res.stat.records + ' items=' + res.count);
      return { file: file, bytes: bytes, xml: res.xml, stat: res.stat };
    });
    return last;
  }
  return { deliver: deliver, last: function () { return last; }, exportPackage: exportPackage, exportById: exportById, packageZip: packageZip, zip: zip, crc32: crc32, MAX_OFFICIAL_ID: MAX_OFFICIAL_ID };
});
