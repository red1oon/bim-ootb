// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// pipo_packgen.js - a bundle's DECLARED dictionary rows (manifest.provides) written out as a real 2Pack_<version>.zip, once, at development time (bim-compiler
//   prompts/ERP_FRIENDLY_OPS_LENS.md §26, slice D; W-PACKGEN). Not a runtime path and not a lens op: the rows are staged inside SAVEPOINT packgen on the dictionary DB, packed out
//   by the ONE Pack Out engine (pipo_packout.js exportPackage: legacy format, filters, references), and ALWAYS rolled back - nothing persistent is written here; Pack In writes them later.
// Declaration: provides = { version, date, description, updateDictionary, elements: [ { key, table, uu?, values } ] }; a value is a literal, an official id, { ref: '<key>' } (an earlier
//   declared element) or { table, uu } (an existing dictionary row). The table picks the Pack Out line (AD_Process P, AD_Form X, AD_EntityType ET, AD_Message MSG, SQLStatement SQL, else D);
//   an AD_Process_Para whose AD_Process_ID refs a declared process is written inside it by the P handler (ProcessElementHandler), as legacy does.
// Row fill (what a developer's New in the dictionary window + PO.saveNew leaves): declared values -> refs -> AD_Column.DefaultValue when it is a context-free constant (GridField.getDefault
//   for 'Y'/'N'/a number/a quoted literal; @..@ / @SQL= defaults need a window context and are counted, not guessed) -> ad_ddl_default (Trx.insert) -> standard columns.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./pipo_packout.js'));
  else root.PipoPackGen = factory(root.PipoPackOut);
})(typeof self !== 'undefined' ? self : this, function (PO) {
  'use strict';
  var NS_URL = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';   // RFC 4122 Appendix C name space for URLs; the name is "<bundle id>/<table>/<key>"
  var TYPE = { ad_process: 'P', ad_form: 'X', ad_entitytype: 'ET', ad_message: 'MSG', sqlstatement: 'SQL' };
  var STD = { ad_client_id: 1, ad_org_id: 1, isactive: 1, created: 1, createdby: 1, updated: 1, updatedby: 1 };
  async function uuidV5(name, ns) {   // RFC 4122 §4.3: SHA-1(namespace bytes + name), version 5, variant 10
    var hex = (ns || NS_URL).replace(/-/g, ''), nsb = new Uint8Array(16); for (var i = 0; i < 16; i++) nsb[i] = parseInt(hex.substr(i * 2, 2), 16);
    var nb = new TextEncoder().encode(name), buf = new Uint8Array(16 + nb.length); buf.set(nsb, 0); buf.set(nb, 16);
    var h = new Uint8Array(await crypto.subtle.digest('SHA-1', buf)).slice(0, 16); h[6] = (h[6] & 0x0f) | 0x50; h[8] = (h[8] & 0x3f) | 0x80;
    var s = Array.prototype.map.call(h, function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
    return s.substr(0, 8) + '-' + s.substr(8, 4) + '-' + s.substr(12, 4) + '-' + s.substr(16, 4) + '-' + s.substr(20);
  }
  // AD_Column.DefaultValue -> a value only when it needs no window context (GridField.getDefault priority 1, the constant case); else null (counted)
  function constDefault(d) {
    if (d == null) return undefined; var s = String(d).trim(); if (s === '') return undefined;
    if (/@/.test(s) || /^SYSDATE$/i.test(s)) return null;
    if (/^'.*'$/.test(s)) return s.slice(1, -1);
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    if (/^[\w.-]+$/.test(s)) return s;
    return null;
  }
  // generate(db, manifest, opts) -> { name, version, xml, zip (Uint8Array), stat, uus, defaultsSkipped }; db = a sql.js Database (the dictionary DB of the page)
  async function generate(db, manifest, opts) {
    opts = opts || {}; var say = opts.say || function () {}, t0 = Date.now();
    var pv = manifest && manifest.provides;
    if (!pv || !pv.version || !Array.isArray(pv.elements) || !pv.elements.length) throw new Error('manifest.provides needs version + elements');
    if (!/^\d+\.\d+\.\d+$/.test(pv.version)) throw new Error('provides.version must be x.y.z (Incremental2PackActivator): ' + pv.version);
    var date = pv.date || '2026-01-01 00:00:00';
    function q(sql, params) { var st = db.prepare(sql), out = []; try { st.bind(params || []); while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } } finally { st.free(); } return out; }
    var uus = {}, staged = {}, stat = { elements: 0, defaultsSkipped: [], lines: [] };
    for (var i = 0; i < pv.elements.length; i++) { var e0 = pv.elements[i]; if (!e0.key || !e0.table) throw new Error('element ' + i + ' needs key + table'); if (uus[e0.key]) throw new Error('duplicate key ' + e0.key);
      uus[e0.key] = e0.uu || (String(e0.table).toLowerCase() === 'sqlstatement' ? null : await uuidV5(manifest.id + '/' + e0.table + '/' + e0.key)); }
    db.run('SAVEPOINT packgen');
    try {
      pv.elements.forEach(function (e) {
        var t = String(e.table).toLowerCase();
        if (t === 'sqlstatement') { staged[e.key] = { t: t, sql: e.values || {} }; stat.lines.push({ type: 'SQL', dbtype: (e.values || {}).dbType || 'ALL', sqlstatement: (e.values || {}).statement || '' }); stat.elements++; return; }
        var tab = q('SELECT tablename AS n FROM ad_table WHERE lower(tablename)=?', [t])[0];
        var phys = q("SELECT name AS n FROM pragma_table_info(?)", [t]).map(function (r) { return r.n.toLowerCase(); });
        if (!tab || !phys.length) throw new Error('unknown table ' + e.table);
        var T = tab.n, cols = q("SELECT lower(c.columnname) AS c, c.defaultvalue AS d, c.ismandatory AS m, c.columnsql AS s FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)=? AND c.isactive='Y' ORDER BY c.ad_column_id", [t]);
        var row = {}, vals = e.values || {};
        Object.keys(vals).forEach(function (k) {
          var c = k.toLowerCase(), v = vals[k];
          if (phys.indexOf(c) < 0) throw new Error('column ' + T + '.' + k + ' is not in the table');
          if (v && typeof v === 'object' && v.ref != null) { var s = staged[v.ref]; if (!s || s.id == null) throw new Error(T + '.' + k + ' refs ' + v.ref + ', not an earlier declared element'); v = s.id; }
          else if (v && typeof v === 'object' && v.table) { var rt = String(v.table), hit = q('SELECT ' + rt + '_ID AS id FROM ' + rt + ' WHERE ' + rt + '_UU=?', [v.uu])[0]; if (!hit) throw new Error(T + '.' + k + ': ' + rt + ' uu=' + v.uu + ' not found'); v = hit.id; }
          row[c] = v;
        });
        if (!opts.noDefaults) {
          cols.forEach(function (c) { if (row[c.c] != null || STD[c.c] || phys.indexOf(c.c) < 0) return; var d = constDefault(c.d); if (d === null) stat.defaultsSkipped.push(T + '.' + c.c + '=' + c.d); else if (d !== undefined) row[c.c] = d; });
          try { q('SELECT lower(columnname) AS c, defaultvalue AS d FROM ad_ddl_default WHERE tablename=?', [t]).forEach(function (r) { if (row[r.c] == null && phys.indexOf(r.c) >= 0) row[r.c] = /^-?\d+(\.\d+)?$/.test(r.d) ? Number(r.d) : r.d; }); } catch (x) { /* no ad_ddl_default on this seed */ }
        }
        row.ad_client_id = 0; row.ad_org_id = 0; if (row.isactive == null) row.isactive = 'Y'; row.created = row.updated = date; row.createdby = row.updatedby = 100;
        if (phys.indexOf(t + '_uu') >= 0) row[t + '_uu'] = uus[e.key];
        var keyc = t + '_id', id = null;
        if (phys.indexOf(keyc) >= 0) { id = Math.max(Number(q('SELECT MAX(' + keyc + ') AS m FROM ' + t)[0].m) || 0, PO.MAX_OFFICIAL_ID) + 1; row[keyc] = id; }   // customization range, never exported (L4)
        cols.forEach(function (c) { if (c.m === 'Y' && !(c.s && String(c.s).trim()) && phys.indexOf(c.c) >= 0 && row[c.c] == null) throw new Error('mandatory ' + T + '.' + c.c + ' has no value'); });   // PO.save: FillMandatory
        var ks = Object.keys(row); db.run('INSERT INTO ' + t + ' (' + ks.join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')', ks.map(function (k) { return row[k]; }));
        staged[e.key] = { t: t, id: id, row: row }; stat.elements++;
        var type = TYPE[t] || 'D';
        if (t === 'ad_process_para' && pv.elements.some(function (p) { return String(p.table).toLowerCase() === 'ad_process' && staged[p.key] && staged[p.key].id === row.ad_process_id; })) return;   // inside its process (P handler)
        var line = { type: type };
        if (type === 'P') line.ad_process_id = id; else if (type === 'X') line.ad_form_id = id; else if (type === 'ET') line.ad_entitytype_id = id; else if (type === 'MSG') line.ad_message_id = id;
        else { line.ad_table_id = q('SELECT ad_table_id AS i FROM ad_table WHERE lower(tablename)=?', [t])[0].i; line.sqlstatement = 'SELECT * FROM ' + T + ' WHERE ' + T + "_UU='" + uus[e.key] + "'"; }
        stat.lines.push(line);
      });
      stat.lines.forEach(function (l, n) { l.line = (n + 1) * 10; });
      var header = { name: manifest.id, pk_version: pv.version, description: pv.description || '', isexportdictionaryentity: pv.updateDictionary ? 'Y' : 'N', created: date, updated: date, username: pv.author || '', email: pv.authorEmail || '' };
      var res = PO.exportPackage(q, header, stat.lines, { clientId: 0, say: say });
    } finally { db.run('ROLLBACK TO packgen'); db.run('RELEASE packgen'); }
    var zip = await PO.packageZip(res);
    var line = '§PACKGEN bundle=' + manifest.id + ' version=' + pv.version + ' elements=' + stat.elements + ' records=' + res.stat.records + ' bytes=' + zip.length + ' defaultsSkipped=' + stat.defaultsSkipped.length + ' ms=' + (Date.now() - t0);
    say(line); if (typeof console !== 'undefined') console.log(line);
    stat.defaultsSkipped.forEach(function (d) { var l = '§PACKGEN default-skipped ' + d; say(l); if (typeof console !== 'undefined') console.log(l); });
    return { name: manifest.id, version: pv.version, file: '2Pack_' + pv.version + '.zip', xml: res.xml, zip: zip, stat: res.stat, uus: uus, defaultsSkipped: stat.defaultsSkipped };
  }
  return { generate: generate, uuidV5: uuidV5, NS_URL: NS_URL };
});
