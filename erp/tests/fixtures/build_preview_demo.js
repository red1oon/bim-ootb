#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — prompts/AGENT_QUEUE.md §PREVIEW-DEMO-FROM-SQL (owns §ERP-SESSION-CLOSE-2 §C2.3 item 4).
//
// WHY THIS EXISTS. `erp/preview_demo.db` was a 397 KB BINARY tracked in git — the one thing CLAUDE.md's
// DB rule bans outright ("binary .db commits are banned, unconditionally"), and it was in only because
// .gitignore carried an explicit `!erp/preview_demo.db` un-ignore. It is also the live fixture of
// erp/tests/poc_preview_demo.js, so deleting it would delete a passing witness. The project's own
// doctrine gives the third answer: ship the SQL, build the binary on demand.
//
// preview_demo.sql is `sqlite3 preview_demo.db .dump`, verbatim — TEXT: reviewable, diffable, and a real
// delta in git instead of a fresh 397 KB blob per change.
//
// This builder is called automatically by poc_preview_demo.js when the .db is absent, so nothing in any
// workflow changes; run it by hand only if you want the file without running the witness:
//     node erp/tests/fixtures/build_preview_demo.js
// It uses sql.js, which that witness already requires — no new dependency, and no sqlite3 CLI needed
// (CI cannot be assumed to have one).
'use strict';
var fs = require('fs'), path = require('path');

// sql.js resolves from bim-ootb/node_modules, which a fresh WORKTREE does not have (node_modules is not
// tracked). Same tolerant resolution the browser witnesses already use for playwright — try the normal
// require first, then the primary checkout's two module roots. No new dependency either way.
function reqSqlJs() {
  var tries = ['sql.js', process.env.HOME + '/bim-ootb/node_modules/sql.js',
               process.env.HOME + '/bim-ootb/tests/node_modules/sql.js'];
  for (var i = 0; i < tries.length; i++) { try { return require(tries[i]); } catch (e) {} }
  throw new Error('sql.js not resolvable from any of: ' + tries.join(' , '));
}

var FIX = __dirname;
var SQL_FILE = path.join(FIX, 'preview_demo.sql');
var OUT = path.join(FIX, '..', '..', 'preview_demo.db');           // bim-ootb/erp/preview_demo.db

// build(force) -> { built:boolean, path, bytes, statements, reason }
// Idempotent: with no force it is a no-op when the .db is newer than the .sql, so a witness can call it
// on every run for pennies. It NEVER silently half-writes: the file is materialised in memory first and
// written once, so an interrupted run leaves the previous .db intact.
function build(force) {
  if (!force && fs.existsSync(OUT)) {
    var dbT = fs.statSync(OUT).mtimeMs, sqlT = fs.statSync(SQL_FILE).mtimeMs;
    if (dbT >= sqlT) return { built: false, path: OUT, bytes: fs.statSync(OUT).size, reason: 'up to date' };
  }
  var initSqlJs = reqSqlJs();
  var text = fs.readFileSync(SQL_FILE, 'utf8');
  return initSqlJs().then(function (SQL) {
    var db = new SQL.Database();
    db.run(text);                                                   // the whole dump, one transaction
    var n = db.exec("SELECT COUNT(*) FROM sqlite_master WHERE type='table'");
    var tables = n && n[0] ? Number(n[0].values[0][0]) : 0;
    var bytes = Buffer.from(db.export());
    db.close();
    fs.writeFileSync(OUT, bytes);
    return { built: true, path: OUT, bytes: bytes.length, tables: tables,
             statements: (text.match(/;\s*\n/g) || []).length };
  });
}

// ensure(cb) — the shape a witness wants: build if needed, then call back. Synchronous when the file is
// already there, so the common path costs one stat().
function ensure(cb) {
  var r = build(false);
  if (r && typeof r.then === 'function') {
    r.then(function (res) {
      console.log('§PREVIEW-FIXTURE built=' + res.built + ' tables=' + res.tables + ' bytes=' + res.bytes +
                  ' from=' + path.basename(SQL_FILE) + ' (the tracked artefact is the SQL, not the binary)');
      cb(null, res);
    }, function (e) { cb(e); });
    return;
  }
  console.log('§PREVIEW-FIXTURE built=false bytes=' + r.bytes + ' reason="' + r.reason + '"');
  cb(null, r);
}

module.exports = { build: build, ensure: ensure, SQL_FILE: SQL_FILE, OUT: OUT };

if (require.main === module) {
  ensure(function (e, r) {
    if (e) { console.log('🔴 §PREVIEW-FIXTURE FAILED — ' + e.message); process.exit(1); }
    console.log((r.built ? '🟢 built ' : '🟢 already present ') + r.path + ' (' + r.bytes + ' bytes)');
  });
}
