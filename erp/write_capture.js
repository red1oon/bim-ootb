// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — write_capture.js: "run a function that writes plain SQL on a COPY of the host db, hand back what it wrote as CRUD ops" (bim-compiler prompts/CLI_ERP_IVR.md §29.6 P3b).
// Read the §WRITE_CAPTURE line after every run; an exit code is not evidence.
// WHY: the BIM fold (viewer/proj_fold.js foldProjectOrder) writes plain SQL into the db it is handed (db.run INSERT/UPDATE/DELETE); the door and the ERP keep a write as an op-log OP
//   (CRUD_CREATE / CRUD_UPDATE / CRUD_DELETE, the shapes common/door/object_cli.js applyOp and the ERP's commitGroup replay). This module is the one bridge, with NO hand list of tables:
//   1. run the function on a SCRATCH copy of the host db (host.export()), whose run/exec/prepare are wrapped: every statement's target table is recorded as it is run;
//   2. for each recorded table, diff the scratch against the untouched host by the table's key -> create / update / delete ops;
//   3. a schema change (CREATE / ALTER / DROP) cannot be an op: refused, naming the statement.
// The host is never written. Same function for any host that has a sql.js handle (the door today; the page the day it hosts the process).
// Pure: no require of the engine; the sql.js Database constructor is handed in. Node: module.exports; browser: window.WriteCapture.
(function (global) {
  'use strict';
  var BREAK = (typeof process !== 'undefined' && process.env && process.env.CAPTURE_BREAK) || '';   // W-POST-FOLD falsifiers: skipupdate (UPDATE ops dropped) · lasttable (the last written table is not diffed)

  // the statement's WRITE targets: strings and comments removed first, so a word inside a text value is never a target
  function targets(sql) {
    var s = String(sql).replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/'(?:[^']|'')*'/g, "''").replace(/"(?:[^"]|"")*"/g, function (m) { return m; });
    var out = [], ddl = [], m, re = /\b(INSERT(?:\s+OR\s+\w+)?\s+INTO|REPLACE\s+INTO|UPDATE(?:\s+OR\s+\w+)?|DELETE\s+FROM)\s+["`\[]?(\w+)/gi;
    while ((m = re.exec(s))) { var t = m[2]; if (/^(set|or)$/i.test(t)) continue; out.push(t.toLowerCase()); }   // `ON CONFLICT DO UPDATE SET` is not a table
    var d = /\b(CREATE|ALTER|DROP)\s+(?:TEMP(?:ORARY)?\s+)?(TABLE|INDEX|VIEW|TRIGGER|COLUMN)\b[^;]*/gi;
    while ((m = d.exec(s))) ddl.push(m[0].replace(/\s+/g, ' ').trim().slice(0, 120));
    return { tables: out, ddl: ddl };
  }
  function wrap(scratch, rec) {
    ['run', 'exec', 'prepare'].forEach(function (fn) {
      var orig = scratch[fn]; if (typeof orig !== 'function') return;
      scratch[fn] = function (sql) { var t = targets(sql); t.tables.forEach(function (x) { if (rec.tables.indexOf(x) < 0) rec.tables.push(x); }); t.ddl.forEach(function (x) { rec.ddl.push(x); }); rec.statements++; return orig.apply(scratch, arguments); };
    });
  }
  function rowsOf(db, sql) { var r = db.exec(sql); return r.length ? { cols: r[0].columns.map(function (c) { return c.toLowerCase(); }), vals: r[0].values } : { cols: [], vals: [] }; }
  var same = function (a, b) { return (a == null && b == null) || a === b || (a != null && b != null && typeof a !== 'object' && typeof b !== 'object' && String(a) === String(b)); };

  // keyOf: the columns that identify a row: the primary key (one column or several), else <table>_id, else <table>_uu. An UPDATE / DELETE addresses a row by ONE column
  //   (applyOp: WHERE <idCol>=?), so a table with a composite key can be CREATED into but a change or delete of its rows is refused, never guessed.
  function keyOf(db, table) {
    var info = rowsOf(db, 'PRAGMA table_info("' + table + '")'), ci = info.cols, ni = ci.indexOf('name'), pi = ci.indexOf('pk'), di = ci.indexOf('dflt_value');
    var cols = info.vals.map(function (v) { return String(v[ni]).toLowerCase(); }), pks = info.vals.filter(function (v) { return v[pi] > 0; }).sort(function (a, b) { return a[pi] - b[pi]; }).map(function (v) { return String(v[ni]).toLowerCase(); });
    var dflt = {}; info.vals.forEach(function (v) { if (v[di] != null) dflt[String(v[ni]).toLowerCase()] = 1; });
    var keys = pks.length ? pks : (cols.indexOf(table + '_id') >= 0 ? [table + '_id'] : (cols.indexOf(table + '_uu') >= 0 ? [table + '_uu'] : []));
    return { cols: cols, keys: keys, key: keys.length === 1 ? keys[0] : null, dflt: dflt, idKey: keys.length === 1 && keys[0] === table + '_id' };
  }
  // diffTable(host, scratch, table) -> ops {create, update, del}
  function diffTable(host, scratch, table) {
    var K = keyOf(host, table); if (!K.cols.length) return { create: [], update: [], del: [], rows: 0 };
    if (!K.keys.length) throw new Error('write capture: ' + table + ' has no key to tell its rows apart; not guessed');
    var H = rowsOf(host, 'SELECT * FROM "' + table + '"'), S = rowsOf(scratch, 'SELECT * FROM "' + table + '"');
    var kh = K.keys.map(function (c) { return H.cols.indexOf(c); }), ks = K.keys.map(function (c) { return S.cols.indexOf(c); }), kstr = function (r, ix) { return ix.map(function (i) { return String(r[i]); }).join('\u0001'); };
    var hm = {}, sm = {}; H.vals.forEach(function (r) { hm[kstr(r, kh)] = r; }); S.vals.forEach(function (r) { sm[kstr(r, ks)] = r; });
    var out = { create: [], update: [], del: [], rows: S.vals.length }, idCol = K.idKey ? undefined : K.key;
    var need = function (what) { if (!K.key) throw new Error('write capture: ' + table + ' has a composite key (' + K.keys.join(', ') + '); a ' + what + ' of one of its rows cannot be addressed by one column, and was not kept'); };
    Object.keys(sm).forEach(function (k) {
      var s = sm[k], h = hm[k];
      if (!h) { var f = {}; S.cols.forEach(function (c, i) { if (s[i] != null || K.dflt[c]) { if (s[i] instanceof Uint8Array) return; f[c] = s[i]; } });
        out.create.push({ op_type: 'CRUD_CREATE', key: table, table: table, verb: 'create', id: null, cas: null, fields: f, _k: k }); return; }
      if (BREAK === 'skipupdate') return;
      var ch = {}; S.cols.forEach(function (c, i) { var hi = H.cols.indexOf(c); if (hi < 0) return; if (!same(s[i], h[hi]) || (s[i] == null) !== (h[hi] == null)) ch[c] = { old: h[hi] == null ? null : h[hi], new: s[i] == null ? null : s[i] }; });
      if (Object.keys(ch).length) { need('change'); var u = { op_type: 'CRUD_UPDATE', key: table, table: table, verb: 'update', id: h[kh[0]], changes: ch, _k: k }; if (idCol) u.idCol = idCol; out.update.push(u); }
    });
    Object.keys(hm).forEach(function (k) { if (!sm[k]) { need('delete'); var d = { op_type: 'CRUD_DELETE', key: table, table: table, verb: 'delete', id: hm[k][kh[0]], tombstone: true, reversible: true, _k: k }; if (idCol) d.idCol = idCol; out.del.push(d); } });
    var by = function (a, b) { var x = a._k, y = b._k, nx = Number(x), ny = Number(y); return (isFinite(nx) && isFinite(ny) && nx !== ny) ? nx - ny : (x < y ? -1 : x > y ? 1 : 0); };
    ['create', 'update', 'del'].forEach(function (w) { out[w].sort(by); out[w].forEach(function (o) { delete o._k; }); });
    return out;
  }
  // capture(hostDb, Database, fn) -> { ops, tables, result, ms, statements, perTable } ; the order of ops: per table in first-write order — deletes, updates, creates
  function capture(hostDb, Database, fn) {
    var t0 = Date.now(), scratch = new Database(hostDb.export()), rec = { tables: [], ddl: [], statements: 0 }, t1 = Date.now();
    wrap(scratch, rec);
    var result = fn(scratch);
    if (rec.ddl.length) throw new Error('write capture: the function changed the schema (' + rec.ddl[0] + '); a schema change is not an op and was not kept');
    var tables = BREAK === 'lasttable' ? rec.tables.slice(0, -1) : rec.tables, ops = [], per = {};
    tables.forEach(function (t) { var d = diffTable(hostDb, scratch, t); per[t] = { create: d.create.length, update: d.update.length, del: d.del.length, rows: d.rows }; ops = ops.concat(d.del, d.update, d.create); });
    var ms = Date.now() - t0;
    if (typeof console !== 'undefined') console.log('§WRITE_CAPTURE tables=' + JSON.stringify(rec.tables) + ' statements=' + rec.statements + ' ops=' + ops.length + ' ' + JSON.stringify(per) + ' copyMs=' + (t1 - t0) + ' ms=' + ms);
    return { ops: ops, tables: rec.tables, result: result, ms: ms, statements: rec.statements, perTable: per, scratch: scratch };
  }
  var API = { capture: capture, targets: targets, diffTable: diffTable, keyOf: keyOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else global.WriteCapture = API;
})(typeof window !== 'undefined' ? window : globalThis);
