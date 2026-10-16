// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// bake_modelvalidator_seed.js — additively CREATE + fill ad_modelvalidator in ad_seed.db.
//
// WHY: PLUGIN_SYSTEM_LANE.md §Phase E bridges ad_modelval.js's readValidators(db) to the live plugin
// system — but the LIVE-LOADED ad_seed.db (idempiere.html's actual runtime DB; ad_full.db is an
// OFFLINE ORACLE only, never shipped/fetched by the app — see idempiere.html's own "ad_seed.db is a
// column SLICE of ad_full.db" comment) has NO ad_modelvalidator table at all: verified live,
// `SELECT ... FROM ad_modelvalidator` against a pre-bake ad_seed.db throws "no such table:
// ad_modelvalidator". Without this bake, the bridge has nothing to read in the actual running app —
// this is a gap the original Phase-E spec didn't catch (it queried build/erp/ad_full.db only, and
// never checked whether ad_seed.db — the file idempiere.html actually loads — carried the same table).
// See the Phase-E implementation report for the full finding.
//
// Sourced from a local sqlite file (build/erp/ad_full.db in the bim-compiler checkout), NOT docker/PG
// like bake_forms_valrules_seed.js — ad_modelvalidator is tiny (3 rows) and ad_full.db already carries
// it verbatim (a real iDempiere export), so there is no need to re-derive it from a live docker PG.
// Same idempotent-additive discipline as bake_forms_valrules_seed.js: abort (no DROP) if the table
// already exists in ad_seed.db.
//
// EXTRACT, DON'T INVENT — every row/column copied verbatim from ad_full.db. READ THE LOG.
// Run: node erp/tests/bake_modelvalidator_seed.js   (edits erp/ad_seed.db in place; cwd-independent)
'use strict';
var fs = require('fs');
var path = require('path');
var initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');

var SEED = process.env.ERP_SEED || path.join(__dirname, '..', 'ad_seed.db');
var ORACLE = process.env.ERP_ORACLE || path.join(process.env.HOME || '/home/red1', 'bim-compiler', 'build', 'erp', 'ad_full.db');
var TABLE = 'ad_modelvalidator';

(async function () {
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join('/home/red1/bim-ootb/node_modules/sql.js/dist', f); } });

  var seedBuf = fs.readFileSync(SEED);
  var seed = new SQL.Database(new Uint8Array(seedBuf));
  function tableExists(db, t) {
    var r = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name=" + JSON.stringify(t));
    return r.length > 0;
  }
  console.log('§BAKE_MV_BEFORE seed_bytes=' + seedBuf.length + ' table_present=' + tableExists(seed, TABLE));
  if (tableExists(seed, TABLE)) {
    console.log('§BAKE_MV_ALREADY_PRESENT table=' + TABLE + ' — aborting to stay idempotent-safe (no DROP performed). Inspect manually.');
    process.exit(0);
  }

  var oracleBuf = fs.readFileSync(ORACLE);
  var oracle = new SQL.Database(new Uint8Array(oracleBuf));
  var ddlRow = oracle.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name=" + JSON.stringify(TABLE));
  if (!ddlRow.length) { console.log('§BAKE_MV_MISSING_IN_ORACLE table=' + TABLE + ' oracle=' + ORACLE); process.exit(1); }
  var ddl = ddlRow[0].values[0][0];
  seed.run(ddl);

  var res = oracle.exec('SELECT * FROM ' + TABLE + ' ORDER BY ad_modelvalidator_id');
  var n = 0;
  if (res.length) {
    var cols = res[0].columns;
    var stmt = seed.prepare('INSERT INTO ' + TABLE + ' (' + cols.map(function (c) { return '"' + c + '"'; }).join(',') +
      ') VALUES (' + cols.map(function () { return '?'; }).join(',') + ')');
    res[0].values.forEach(function (row) {
      stmt.run(row);
      n++;
      console.log('§BAKE_MV_ROW id=' + row[cols.indexOf('ad_modelvalidator_id')] + ' name="' + row[cols.indexOf('name')] +
        '" class=' + row[cols.indexOf('modelvalidationclass')] + ' entitytype=' + row[cols.indexOf('entitytype')]);
    });
    stmt.free();
  }
  fs.writeFileSync(SEED, Buffer.from(seed.export()));
  console.log('§BAKE_MV table=' + TABLE + ' rows=' + n + ' bytes=' + fs.statSync(SEED).size);

  // §AFTER — re-open from disk (not the in-memory handle), prove the table persisted with the right count.
  var after = new SQL.Database(new Uint8Array(fs.readFileSync(SEED)));
  var chk = after.exec('SELECT count(*) FROM ' + TABLE);
  var persisted = chk.length ? chk[0].values[0][0] : 0;
  console.log('§BAKE_MV_VERIFY table=' + TABLE + ' persisted_rows=' + persisted +
    ' bytes=' + fs.statSync(SEED).size + ' (' + (fs.statSync(SEED).size / 1048576).toFixed(1) + 'MB)');
  if (persisted !== n) process.exit(1);
})();
