// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// pipo_packin.js - Pack In of a real iDempiere 2Pack (PackOut.xml in a zip), ported from org.adempiere.pipo2 (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §20.A).
// The rules, with their source:
//   elements  PackInHandler.java:258-311  a child element WITHOUT a type attribute is a property (column value) of its parent; one WITH a type is a record; depth first, unresolved -> deferred
//   find      POFinder.findPO:64-120       by <Table>_UU, then <Table>_ID
//   fill      PoFiller.autoFill:313-...     AD_Client_ID '0' -> client 0 / org 0; excludes ad_client_id, created(by), updated(by); reference="id"|"uuid" = a lookup in reference-key's table;
//                                         <Table>_ID imported only when official (<= 999999) and not another tenant's, else a new id from the table sequence
//   gate      AbstractElementHandler.isProcessElement:358-368  EntityType D / EE01 / EE02 / EE04 / EE05 is skipped unless the pack is in update mode (UpdateDictionary="true")
//   sql       SQLStatementElementHandler.java:62-140  each statement in its own savepoint; a failing one is rolled back alone, logged, and the pack goes on
//   record    PackInHandler.java:160-235  AD_Package_Imp + AD_Package_Imp_Inst + AD_Package_Imp_Detail
//   versions  Incremental2PackActivator.java:57-160  apply every 2Pack_<v>.zip above the highest installed version of the bundle, ascending, each once
// Writes go to the dictionary DB inside SAVEPOINT packin (a record failure rolls the whole pack back), as the self-heal patches do; the caller keeps the pack and re-applies it at every load.
// Not ported (named, logged §PACKIN generic-for-special): the special element handlers (Table/Column DB sync, Menu tree nodes, translations, print formats ...): such records are filled generically.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PipoPackIn = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var MAX_OFFICIAL_ID = 999999;
  var OFFICIAL_ET = { D: 1, EE01: 1, EE02: 1, EE04: 1, EE05: 1 };
  var EXCLUDE = { ad_client_id: 1, created: 1, createdby: 1, updated: 1, updatedby: 1 };
  // special handlers legacy registers (org.adempiere.pipo.handlers): filled generically here, counted
  var SPECIAL = { AD_Table: 1, AD_Column: 1, AD_Menu: 1, AD_Window: 1, AD_Tab: 1, AD_Field: 1, AD_Process: 1, AD_Process_Para: 1, AD_Form: 1, AD_Reference: 1, AD_Ref_List: 1, AD_Ref_Table: 1,
    AD_Element: 1, AD_PrintFormat: 1, AD_PrintFormatItem: 1, AD_ReportView: 1, AD_Workflow: 1, AD_WF_Node: 1, AD_WF_NodeNext: 1, AD_InfoWindow: 1, AD_InfoColumn: 1, AD_Val_Rule: 1,
    AD_Message: 1, AD_EntityType: 1, AD_ModelValidator: 1, AD_TableIndex: 1, AD_IndexColumn: 1, AD_ImpFormat: 1, AD_ImpFormat_Row: 1, AD_Role: 1, AD_Preference: 1 };

  // ── zip: central directory + deflate-raw (DecompressionStream), no library ──
  async function readZip(bytes) {
    var u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), out = {};
    var eocd = -1; for (var i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('not a zip (no end of central directory)');
    var n = dv.getUint16(eocd + 10, true), p = dv.getUint32(eocd + 16, true);
    for (var k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('zip central directory corrupt');
      var method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), loc = dv.getUint32(p + 42, true);
      var name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen)); p += 46 + nlen + elen + clen;
      if (/\/$/.test(name)) continue;
      var lnlen = dv.getUint16(loc + 26, true), lelen = dv.getUint16(loc + 28, true), start = loc + 30 + lnlen + lelen, data = u8.subarray(start, start + csize);
      if (method === 0) out[name] = data;
      else if (method === 8) out[name] = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      else throw new Error('zip method ' + method + ' not supported (' + name + ')');
    }
    return out;
  }
  async function packOutXml(bytes) {
    var files = await readZip(bytes), name = Object.keys(files).filter(function (f) { return /(^|\/)dict\/PackOut\.xml$/.test(f); })[0];
    if (!name) throw new Error('no dict/PackOut.xml in the 2Pack');
    return { name: name, xml: new TextDecoder().decode(files[name]) };
  }

  // ── the walk ──
  function apply(db, xmlText, opts) {
    opts = opts || {};
    var say = opts.say || function () {}, convert = opts.convertSql || function (s) { return s; }, now = opts.now || new Date().toISOString().slice(0, 19).replace('T', ' ');
    var q = function (sql, p) { var st = db.prepare(sql), rows = []; try { if (p) st.bind(p); while (st.step()) rows.push(st.getAsObject()); } finally { st.free(); } return rows; };
    var doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    var rootEl = doc.documentElement;
    if (!rootEl || rootEl.nodeName !== 'idempiere') throw new Error('not a PackOut.xml (root ' + (rootEl && rootEl.nodeName) + ')');
    var pack = { name: opts.name || rootEl.getAttribute('Name'), version: opts.version || rootEl.getAttribute('Version'), updateMode: String(rootEl.getAttribute('UpdateDictionary')).toLowerCase() === 'true',
      client: String(rootEl.getAttribute('Client') || '0').split('-')[0] };
    var stat = { viewsMissing: [], functionsMissing: [], absentTables: {}, records: 0, processed: 0, skippedOfficial: 0, translationsSkipped: 0, genericForSpecial: {}, deferred: 0, unresolved: [], sql: { ok: 0, failed: 0 }, byTable: {}, details: [], afterSave: {}, afterSaveNotPorted: {} };
    var cols = {}; function colsOf(t) { var k = t.toLowerCase(); if (!cols[k]) { var r = q('pragma table_info(' + k + ')'); cols[k] = r.length ? r.reduce(function (m, c) { m[String(c.name).toLowerCase()] = 1; return m; }, {}) : null; } return cols[k]; }
    function propsOf(el) { var p = {}, kids = []; for (var c = el.firstElementChild; c; c = c.nextElementSibling) { if (c.hasAttribute('type')) kids.push(c); else p[c.nodeName] = c; } return { p: p, kids: kids }; }
    function nextId(table) {   // MSequence.getNextID for a table sequence (AD_Sequence Name = TableName, IsTableID = 'Y'); never an official id
      var s = q("SELECT ad_sequence_id, currentnext FROM ad_sequence WHERE UPPER(name)=UPPER(?) AND istableid='Y'", [table])[0], mx = q('SELECT COALESCE(MAX(' + table + '_id),0) AS m FROM ' + table)[0].m;
      var id = Math.max(Number(s ? s.currentnext : 0), Number(mx) + 1, MAX_OFFICIAL_ID + 1);
      if (s) db.run('UPDATE ad_sequence SET currentnext=? WHERE ad_sequence_id=?', [id + 1, s.ad_sequence_id]);
      return id;
    }
    function resolveRef(propEl) {   // ReferenceUtils.resolveReference: id -> as written if present, uuid -> the id of that UUID, empty -> null
      var kind = propEl.getAttribute('reference'), key = propEl.getAttribute('reference-key'), v = propEl.textContent.trim();
      if (v === '') return { ok: true, v: null };
      if (kind === 'id') return { ok: true, v: Number(v) };   // ReferenceUtils.resolveReference:46-49: an id reference is taken as written
      if (!key || !colsOf(key)) return { ok: false, why: 'reference table ' + key + ' absent' };
      var r = q('SELECT ' + key + '_id AS id FROM ' + key + ' WHERE ' + key + '_uu=?', [v])[0];   // IDFinder.findIdByColumn on the UUID column
      return r ? { ok: true, v: r.id } : { ok: false, why: key + ' uuid ' + v + ' not found' };
    }
    // PO.afterSave(newRecord) rules legacy runs because its Pack In saves through PO.saveEx; the twin writes SQL, so the rule is applied here (ERP_FRIENDLY_OPS_LENS.md §22 L3).
    //   ad_process  MProcess.afterSave:511-524: an AD_Process_Access row for every role IsManual='N' (MRole.getOf, no client filter); MProcessAccess(MProcess,int):89-96 client/org from the role
    //   any other table: not ported, counted (afterSaveNotPorted) so a pack that depends on one is visible
    var AFTER_NEW = {
      ad_process: function (r) {
        if (!colsOf('ad_process_access')) return 0;
        var roles = q("SELECT ad_role_id, ad_client_id, ad_org_id FROM ad_role WHERE ismanual='N' ORDER BY ad_role_id"), ac = colsOf('ad_process_access'), n = 0;
        roles.forEach(function (ro) {
          var f = { ad_process_id: r.ad_process_id, ad_role_id: ro.ad_role_id, ad_client_id: ro.ad_client_id, ad_org_id: ro.ad_org_id, isactive: 'Y', isreadwrite: 'Y' };
          if (ac.created) { f.created = now; f.updated = now; f.createdby = 0; f.updatedby = 0; }
          if (ac.ad_process_access_uu) f.ad_process_access_uu = uuid();
          var ks = Object.keys(f); db.run('INSERT INTO ad_process_access (' + ks.join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')', ks.map(function (k) { return f[k]; })); n++;
        });
        say('§PACKIN aftersave table=AD_Process id=' + r.ad_process_id + ' rule=MProcess.afterSave access-rows=' + n + ' (roles IsManual=N)');
        return n;
      }
    };
    function uuid() { return opts.uuid ? opts.uuid() : (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : null); }
    function afterNew(t, vals) {
      if (AFTER_NEW[t]) { stat.afterSave[t] = (stat.afterSave[t] || 0) + AFTER_NEW[t](vals); return; }
      stat.afterSaveNotPorted[t] = (stat.afterSaveNotPorted[t] || 0) + 1;
    }
    function record(el, parent, deferred) {
      var table = el.nodeName, t = table.toLowerCase(), type = el.getAttribute('type');
      if (type === 'translation') { stat.translationsSkipped++; return 'skip'; }
      var pk = t + '_id', uuCol = t + '_uu', P = propsOf(el).p, vals = {}, unresolved = [];
      var c = colsOf(t);
      if (!c) {   // a table the twin does not carry: an official record would be skipped by the gate anyway (legacy has the table, the gate decides first); anything else is a real gap
        var et0 = P.EntityType ? P.EntityType.textContent.trim() : null;
        if (et0 != null && OFFICIAL_ET[et0] && !pack.updateMode) { stat.skippedOfficial++; stat.absentTables[table] = (stat.absentTables[table] || 0) + 1; return 'skip'; }
        throw new Error('table ' + table + ' is absent from the dictionary DB (record EntityType ' + et0 + ', would be written)');
      }
      // find (POFinder)
      var row = null, uu = P[table + '_UU'] ? P[table + '_UU'].textContent.trim() : '';
      if (uu && c[uuCol]) row = q('SELECT * FROM ' + t + ' WHERE ' + uuCol + '=?', [uu])[0] || null;
      if (!row && P[table + '_ID'] && c[pk]) { var idv = Number(P[table + '_ID'].textContent.trim()); if (idv) row = q('SELECT * FROM ' + t + ' WHERE ' + pk + '=?', [idv])[0] || null; }
      // fill (PoFiller.autoFill)
      var cl = P.AD_Client_ID ? P.AD_Client_ID.textContent.trim() : null;
      if (cl === '0') { vals.ad_client_id = 0; vals.ad_org_id = 0; }
      Object.keys(P).forEach(function (name) {
        var k = name.toLowerCase(), pe = P[name]; if (EXCLUDE[k] || !c[k]) return;
        if (k === 'ad_org_id' && cl === '0') return;
        if (pe.getAttribute('reference') === 'id' || pe.getAttribute('reference') === 'uuid') { var r = resolveRef(pe); if (r.ok) vals[k] = r.v; else unresolved.push(name + ': ' + r.why); return; }
        if (k === pk) { var iv = Number(pe.textContent.trim()); if (iv > 0 && iv <= MAX_OFFICIAL_ID) { var other = q('SELECT ad_client_id AS c FROM ' + t + ' WHERE ' + pk + '=?', [iv])[0]; if (!other || Number(other.c) === 0) vals[k] = iv; } return; }
        var txt = pe.textContent; vals[k] = (txt === '' && !pe.firstChild) ? null : txt;
      });
      // gate (isProcessElement) BEFORE the defer, as GenericPOElementHandler.startElement:79-98 (fill, then the entity type check, then the not-founds)
      var et = vals.entitytype != null ? vals.entitytype : (row ? row.entitytype : null);
      if (c.entitytype && et != null && OFFICIAL_ET[et] && !pack.updateMode) { stat.skippedOfficial++; stat.byTable[table] = (stat.byTable[table] || { new: 0, update: 0, same: 0, skip: 0 }); stat.byTable[table].skip++; return 'skip'; }
      if (unresolved.length) { if (deferred) stat.unresolved.push(table + ' ' + (uu || '') + ' [' + unresolved.join('; ') + ']'); return 'defer'; }
      if (SPECIAL[table]) stat.genericForSpecial[table] = (stat.genericForSpecial[table] || 0) + 1;
      var bt = stat.byTable[table] = (stat.byTable[table] || { new: 0, update: 0, same: 0, skip: 0 }), action;
      if (row) {
        var ch = Object.keys(vals).filter(function (k) { return k !== pk && String(row[k] == null ? '' : row[k]) !== String(vals[k] == null ? '' : vals[k]); });
        if (!ch.length) { bt.same++; action = 'Same'; }
        else { db.run('UPDATE ' + t + ' SET ' + ch.map(function (k) { return k + '=?'; }).join(', ') + (c.updated ? ', updated=?' : '') + ' WHERE ' + pk + '=?', ch.map(function (k) { return vals[k]; }).concat(c.updated ? [now] : []).concat([row[pk]])); bt.update++; action = 'Update'; }
      } else {
        if (vals[pk] == null && c[pk]) vals[pk] = nextId(t);
        if (c.created) { vals.created = now; vals.updated = now; vals.createdby = 0; vals.updatedby = 0; }
        if (c.isactive && vals.isactive == null) vals.isactive = 'Y';
        var ks = Object.keys(vals); db.run('INSERT INTO ' + t + ' (' + ks.join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')', ks.map(function (k) { return vals[k]; }));
        bt.new++; action = 'New';
        afterNew(t, vals);
      }
      stat.processed++;
      stat.details.push({ table: table, id: vals[pk] != null ? vals[pk] : (row && row[pk]), uu: uu, action: action });
      return action;
    }
    function sqlStatement(el) {   // SQLStatementElementHandler
      var P = propsOf(el).p, dbt = P.DBType ? P.DBType.textContent.trim() : 'ALL', sql = P.statement ? P.statement.textContent.trim() : '';
      if (/;$/.test(sql) && !/end;$/i.test(sql)) sql = sql.slice(0, -1);
      if (!(dbt === 'ALL' || dbt === 'Postgres' || dbt === 'PostgreSQL')) { stat.details.push({ table: 'SQLStatement', action: 'Skip ' + dbt }); return; }
      var fn = /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:\w+\.)?(\w+)\s*\(/i.exec(sql);
      if (fn) {   // a PL/pgSQL function: SQLite cannot create one; the twin provides stored functions as registered UDFs (crud_overlay._coBindUdf, callouts/sqlfn.js)
        var name = fn[1].toLowerCase(), have = opts.hasFunction ? opts.hasFunction(name) : false;
        if (have) { stat.sql.ok++; stat.details.push({ table: 'SQLStatement', action: 'Execute', count: 0, sql: sql.slice(0, 160), fn: name, providedBy: 'twin UDF' }); say('§PACKIN sql function=' + name + ' provided-by=twin UDF (PL/pgSQL not executed)'); }
        else { stat.sql.failed++; stat.functionsMissing.push(name); stat.details.push({ table: 'SQLStatement', action: 'Failed', error: 'function ' + name + ' not ported to the twin', sql: sql.slice(0, 160), fn: name }); say('§PACKIN sql function=' + name + ' MISSING in the twin (named gap; legacy would create it)'); }
        return;
      }
      var vw = /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:\w+\.)?(\w+)\s+AS/i.exec(sql);
      if (vw) {   // Postgres view DDL: the twin carries legacy views converted for SQLite (patches/*: build_views_patch.py); present = provided, absent = a named gap
        var vn = vw[1].toLowerCase(), hv = q("SELECT 1 AS x FROM sqlite_master WHERE type='view' AND lower(name)=?", [vn]).length > 0;
        if (hv) { stat.sql.ok++; stat.details.push({ table: 'SQLStatement', action: 'Execute', count: 0, sql: sql.slice(0, 160), view: vn, providedBy: 'twin view' }); say('§PACKIN sql view=' + vn + ' provided-by=twin view (Postgres DDL not executed)'); }
        else { stat.sql.failed++; stat.viewsMissing.push(vn); stat.details.push({ table: 'SQLStatement', action: 'Failed', error: 'view ' + vn + ' not in the twin', sql: sql.slice(0, 160), view: vn }); say('§PACKIN sql view=' + vn + ' MISSING in the twin (named gap; legacy would create it)'); }
        return;
      }
      db.run('SAVEPOINT pk_sql');
      try { var before = db.getRowsModified ? null : null; db.run(convert(sql)); var n = db.getRowsModified ? db.getRowsModified() : null; db.run('RELEASE pk_sql'); stat.sql.ok++; stat.details.push({ table: 'SQLStatement', action: 'Execute', count: n, sql: sql.slice(0, 160) }); say('§PACKIN sql ok count=' + n + ' ' + sql.replace(/\s+/g, ' ').slice(0, 140)); }
      catch (e) { db.run('ROLLBACK TO pk_sql'); db.run('RELEASE pk_sql'); stat.sql.failed++; stat.details.push({ table: 'SQLStatement', action: 'Failed', error: e.message, sql: sql.slice(0, 160) }); say('§PACKIN sql FAILED (rolled back alone, pack goes on) ' + e.message + ' | ' + sql.replace(/\s+/g, ' ').slice(0, 140)); }
    }
    var defer = [];
    function walk(el, parent) {
      for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
        if (!c.hasAttribute('type')) continue;
        if (c.nodeName === 'SQLStatement') { sqlStatement(c); continue; }
        stat.records++;
        var r = record(c, parent, false); if (r === 'defer') { stat.deferred++; defer.push(c); }
        walk(c, c);
      }
    }
    db.run('SAVEPOINT packin');
    try {
      walk(rootEl, null);
      for (var pass = 0; pass < 3 && defer.length; pass++) { var again = defer; defer = []; again.forEach(function (el) { if (record(el, null, pass === 2) === 'defer') defer.push(el); }); }
      if (defer.length) throw new Error(defer.length + ' record(s) unresolved: ' + stat.unresolved.slice(0, 3).join(' | '));
      db.run('RELEASE packin');
      stat.ok = true;
    } catch (e) {
      db.run('ROLLBACK TO packin'); db.run('RELEASE packin');
      stat.ok = false; stat.error = e.message;
    }
    say('§PACKIN pack=' + pack.name + ' version=' + pack.version + ' updateMode=' + pack.updateMode + ' ok=' + stat.ok + ' records=' + stat.records + ' processed=' + stat.processed + ' skippedOfficial=' + stat.skippedOfficial +
      ' translationsSkipped=' + stat.translationsSkipped + ' sql=' + stat.sql.ok + '/' + (stat.sql.ok + stat.sql.failed) + ' genericForSpecial=' + JSON.stringify(stat.genericForSpecial) + ' absentTablesSkipped=' + JSON.stringify(stat.absentTables) + ' afterSave=' + JSON.stringify(stat.afterSave) + ' afterSaveNotPorted=' + JSON.stringify(stat.afterSaveNotPorted) + ' functionsMissing=[' + stat.functionsMissing.join(',') + '] viewsMissing=[' + stat.viewsMissing.join(',') + ']' + (stat.error ? ' error="' + stat.error + '"' : ''));
    stat.pack = pack;
    return stat;
  }

  // ── AD_Package_Imp (+ _Inst, _Detail): what Packages Installed shows ──
  function recordImport(db, bundle, version, stat, now) {
    now = now || new Date().toISOString().slice(0, 19).replace('T', ' ');
    var has = function (t) { try { db.exec('SELECT 1 FROM ' + t + ' LIMIT 1'); return true; } catch (e) { return false; } };
    if (!has('ad_package_imp')) return null;
    var id = (db.exec('SELECT COALESCE(MAX(ad_package_imp_id),0)+1 FROM ad_package_imp')[0].values[0][0]);
    id = Math.max(Number(id), MAX_OFFICIAL_ID + 1);
    var status = stat.ok ? 'Completed successfully' : ('Import Failed: ' + stat.error).slice(0, 60);
    db.run('INSERT INTO ad_package_imp (ad_package_imp_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, name, pk_version, pk_status, description, processed) VALUES (?,0,0,\'Y\',?,0,?,0,?,?,?,?,\'Y\')',
      [id, now, now, bundle, version, status, 'Pack In (twin) ' + stat.processed + ' processed, ' + stat.skippedOfficial + ' official skipped, ' + stat.sql.ok + ' SQL']);
    if (has('ad_package_imp_inst')) {   // PackInHandler.java:197-232: the install log row per (Name, PK_Version), its status refreshed on a re-install
      var ex = db.exec("SELECT ad_package_imp_inst_id FROM ad_package_imp_inst WHERE name='" + String(bundle).replace(/'/g, "''") + "' AND pk_version='" + String(version).replace(/'/g, "''") + "'");
      if (ex.length && ex[0].values.length) db.run('UPDATE ad_package_imp_inst SET pk_status=?, updated=? WHERE ad_package_imp_inst_id=?', [status, now, ex[0].values[0][0]]);
      else { var iid = Math.max(Number(db.exec('SELECT COALESCE(MAX(ad_package_imp_inst_id),0)+1 FROM ad_package_imp_inst')[0].values[0][0]), MAX_OFFICIAL_ID + 1);
        db.run("INSERT INTO ad_package_imp_inst (ad_package_imp_inst_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, name, pk_status, pk_version, processed) VALUES (?,0,0,'Y',?,0,?,0,?,?,?,'Y')", [iid, now, now, bundle, status, version]); }
    }
    if (has('ad_package_imp_detail')) {
      var did = Math.max(Number(db.exec('SELECT COALESCE(MAX(ad_package_imp_detail_id),0)+1 FROM ad_package_imp_detail')[0].values[0][0]), MAX_OFFICIAL_ID + 1);
      stat.details.forEach(function (d, i) {
        try { db.run('INSERT INTO ad_package_imp_detail (ad_package_imp_detail_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, ad_package_imp_id, name, action, success, type, tablename, record_id, record_uu, result) VALUES (?,0,0,\'Y\',?,0,?,0,?,?,?,?,?,?,?,?,?)',
          [did + i, now, now, id, String(d.table), String(d.action).slice(0, 10), d.action === 'Failed' ? 'N' : 'Y', d.table === 'SQLStatement' ? 'SQL' : 'table', String(d.table), d.id || 0, d.uu || null, d.sql || d.error || null]); } catch (e) {}
      });
    }
    return { id: id, status: status };
  }
  function installedVersions(db, bundle) {
    try { var r = db.exec("SELECT pk_version FROM ad_package_imp WHERE name='" + String(bundle).replace(/'/g, "''") + "' AND pk_status='Completed successfully'"); return r.length ? r[0].values.map(function (v) { return String(v[0]); }) : []; } catch (e) { return []; }
  }
  function cmpVer(a, b) { var x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (var i = 0; i < 3; i++) { var d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; }
  // Incremental2PackActivator: packs = [{ version, bytes|xml }]; applies each above the highest installed, ascending, each once
  async function incremental(db, bundle, packs, opts) {
    opts = opts || {}; var say = opts.say || function () {};
    var inst = installedVersions(db, bundle), top = inst.reduce(function (m, v) { return !m || cmpVer(v, m) > 0 ? v : m; }, null), results = [];
    var todo = packs.slice().sort(function (a, b) { return cmpVer(a.version, b.version); }).filter(function (p) { return !top || cmpVer(p.version, top) > 0; });
    say('§PACKIN incremental bundle=' + bundle + ' installed=[' + inst.join(',') + '] toApply=[' + todo.map(function (p) { return p.version; }).join(',') + ']');
    for (var i = 0; i < todo.length; i++) {
      var p = todo[i], xml = p.xml || (await packOutXml(p.bytes)).xml;
      var st = apply(db, xml, { say: say, convertSql: opts.convertSql, hasFunction: opts.hasFunction, uuid: opts.uuid, name: bundle, version: p.version });
      var rec = recordImport(db, bundle, p.version, st);
      results.push({ version: p.version, ok: st.ok, stat: st, imp: rec });
      if (!st.ok) break;   // legacy stops at the first failed version (the next ones depend on it)
    }
    return results;
  }
  // ── delta: what a Pack In wrote, to replay on the same base at the next load (ERP_FRIENDLY_OPS_LENS.md §22 B3/B4) ──
  //   recording(db) -> a handle that delegates everything and keeps every SUCCESSFUL run(sql, params) in order (a failing statement throws before it is kept; its ROLLBACK TO is kept),
  //   so replaying the list verbatim on the same base reproduces the same rows, ids, timestamps and UUs.
  function recording(db) {
    var log = [], h = Object.create(db);
    h.run = function (sql, p) { var r = db.run(sql, p); log.push([sql, p == null ? null : p]); return r; };
    h.exec = function (sql, p) { return db.exec(sql, p); };
    h.prepare = function (sql) { return db.prepare(sql); };
    h.getRowsModified = function () { return db.getRowsModified(); };
    h.delta = function () { return log; };
    return h;
  }
  function replay(db, delta) {
    db.run('SAVEPOINT packreplay');
    try { for (var i = 0; i < delta.length; i++) db.run(delta[i][0], delta[i][1] == null ? undefined : delta[i][1]); db.run('RELEASE packreplay'); return { ok: true, statements: delta.length }; }
    catch (e) { db.run('ROLLBACK TO packreplay'); db.run('RELEASE packreplay'); return { ok: false, statements: i, error: e.message }; }
  }
  return { recording: recording, replay: replay, readZip: readZip, packOutXml: packOutXml, apply: apply, recordImport: recordImport, installedVersions: installedVersions, incremental: incremental, cmpVer: cmpVer, MAX_OFFICIAL_ID: MAX_OFFICIAL_ID };
});
