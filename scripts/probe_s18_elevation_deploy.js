#!/usr/bin/env node
// probe_s18_elevation_deploy.js — Implementing bim-compiler prompts/4D_MODEL_INTEGRITY.md §I.3.
//
// ⚠ DO NOT REMOVE — SCOPE. Read the §S18_DEPLOY log after every run. ONE question, no others:
//
//   Does the SERVED OCI object, plus the patch this repo is about to upload for it, make
//   viewer/schedule_author.js's §S18 query WORK — where today it throws?
//
// This is a DEPLOY probe, not a data probe. It is the `--verify` command for
// scripts/oci_patch_gate.js, and it exists because the §I.3 gap turned out to be neither a
// missing extractor fix nor missing data: the elevation patches were authored, committed, and
// wired (viewer/scene.js A._applyPendingPatch fetches buildings/patches/<dbFile>.sql from the
// same directory the db came from) — they were simply NEVER UPLOADED to the OCI bucket the
// viewer actually fetches from. The repo copy and the served copy silently disagreed. Nothing
// in the repo could see that, because nothing in the repo reads the served bytes. This does.
//
// It therefore runs against the DOWNLOADED SERVED BYTES, never buildings/*.db — a local
// building DB is a dev artifact that may already carry hand-applied fixes (measured: this
// machine's buildings/Hospital_meta.db had an elevation column the served object did not).
//
// WHAT IT ASSERTS, per building:
//   1. BEFORE — the served db + served state reproduces the live failure (records it verbatim).
//   2. AFTER  — the exact §S18 query from schedule_author.js:701 returns rows.
//   3. SURVIVES — the elevation column and its rows are still there after viewer/lib/room_walker.js
//      writeRooms() mutates the same table. writeRooms CREATEs spatial_structure WITHOUT an
//      elevation column when absent (:1338) and its ADD COLUMN list omits elevation (:1342), so
//      "the patch lands" and "the patch survives the client-side room compile" are two different
//      claims. Only the STC_/RM_ prefixed rows are deleted, so real storey rows must persist.
//   4. MERGES — schedule_gate.js's own deriveStoreyMergeMap() runs on the result and reports how
//      many storey NAMES collapse into shared bands. This calls the SHIPPED function; it does not
//      re-derive the merge (prompts/4D_MODEL_INTEGRITY.md §I OWNERSHIP TABLE — that row's owner is
//      deriveStoreyMergeMap, and re-implementing an owned relation is this lane's recurring defect).
//
// VERDICTS (PRIMAL LAW clause 4 — a witness that cannot report its own failure is not a witness):
//   PASS         — before threw / was empty, after returns rows, rows survive writeRooms.
//   VACUOUS      — the patch applied but yielded ZERO non-null elevations. A 0 here means the
//                  patch carries no datum, NOT that the building is fine. Never PASS.
//   NO-OP        — the served db ALREADY answered §S18 before the patch. Nothing to deploy.
//   FAIL         — after still throws, or rows do not survive writeRooms.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const HOME = os.homedir();
const initSqlJs = require(path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const SQLJS_DIST = path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js', 'dist');
const SG = require(path.join(__dirname, '..', 'viewer', 'schedule_gate.js'));

// The EXACT query viewer/schedule_author.js:701 runs. Kept byte-identical on purpose: if it drifts
// there, this probe must stop reporting PASS for a query the viewer no longer issues.
const S18_QUERY = "SELECT type,name,elevation FROM spatial_structure WHERE type='IfcBuildingStorey' AND elevation IS NOT NULL";

// Mirrors viewer/scene.js A._runSqlChunked (§PATCH_CHUNK). Statement-aware batching, not raw-line:
// a multi-line `CREATE TABLE spatial_structure (...)` must never be cut on a chunk boundary. Node's
// sql.js is a DIFFERENT build from the bundled browser .wasm and does not need the chunking to
// avoid the heap crash — it is replicated anyway so this probe applies the patch the same SHAPE the
// viewer does, rather than proving something about a code path the browser never takes.
function runSqlChunked(db, sql) {
  const statements = [];
  let buf = [];
  for (const ln of sql.split('\n')) {
    if (!ln.trim().length) continue;
    buf.push(ln);
    if (/;\s*$/.test(ln)) { statements.push(buf.join('\n')); buf = []; }
  }
  if (buf.length) statements.push(buf.join('\n'));
  const CHUNK = 500;
  for (let i = 0; i < statements.length; i += CHUNK) db.run(statements.slice(i, i + CHUNK).join('\n'));
  return statements.length;
}

// The schema mutations viewer/lib/room_walker.js writeRooms() performs on an EXISTING
// spatial_structure (:1341-1347 ADD COLUMN list, :1349 + :1356 the idempotent compiled-row deletes).
// Copied deliberately as the three real statements rather than by calling writeRooms(), which would
// require compiling every room in the building to answer a question about the TABLE, not the rooms.
function simulateWriteRoomsSchemaPass(db) {
  for (const col of ['center_x', 'center_y', 'center_z', 'size_x', 'size_y', 'size_z', 'object_type', 'predefined_type', 'room_guid']) {
    const type = (col.startsWith('center') || col.startsWith('size')) ? ' REAL' : ' TEXT';
    try { db.run('ALTER TABLE spatial_structure ADD COLUMN ' + col + type); } catch (e) { /* already exists */ }
  }
  db.run("DELETE FROM spatial_structure WHERE type='IfcBuildingStorey' AND guid LIKE 'STC\\_%' ESCAPE '\\'");
  db.run("DELETE FROM spatial_structure WHERE type='IfcSpace' AND guid LIKE 'RM\\_%' ESCAPE '\\'");
}

function s18(db) {
  try {
    const res = db.exec(S18_QUERY);
    if (!res.length) return { ok: true, rows: [] };
    const c = res[0].columns, tI = c.indexOf('type'), nI = c.indexOf('name'), eI = c.indexOf('elevation');
    return { ok: true, rows: res[0].values.map(v => ({ type: v[tI], name: v[nI], elevation: v[eI] })) };
  } catch (e) {
    return { ok: false, err: e.message };
  }
}

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i < 0 ? dflt : process.argv[i + 1];
}

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.join(SQLJS_DIST, f) });
  const servedDir = arg('served-dir', process.env.SERVED_DIR);
  const patchDir = arg('patch-dir', path.join(__dirname, '..', 'buildings', 'patches'));
  const targets = process.argv.slice(2).filter(a => !a.startsWith('--') &&
    !['--served-dir', '--patch-dir'].includes(process.argv[process.argv.indexOf(a) - 1]));

  // --gate-db mode: scripts/oci_patch_gate.js has ALREADY downloaded the served object and applied
  // the patch to a throwaway copy, handing it over as $GATE_DB. Assert the POST state only — there
  // is no un-patched BEFORE left to observe.
  //
  // ⚠ This mode is STRICTLY WEAKER than the standalone one and must not be treated as a substitute.
  // The gate applies the patch with `sqlite3 <db> < patch`, and the sqlite3 CLI without -bail keeps
  // going after a failing statement. The browser does NOT: _applyPendingPatch throws out the whole
  // buffer. So a patch that half-applies looks GREEN here and is fully DISCARDED live — which is
  // exactly how the Duplex `CREATE TABLE IF NOT EXISTS` defect would have slipped through. Run the
  // standalone mode (sql.js, all-or-nothing, same shape as the viewer) for that claim.
  const gateDb = arg('gate-db');
  if (gateDb) {
    const db = new SQL.Database(new Uint8Array(fs.readFileSync(gateDb)));
    const after = s18(db);
    if (!after.ok) { console.log(`§S18_DEPLOY gate-db FAIL — §S18 still throws after the gate applied the patch: "${after.err}"`); process.exit(1); }
    simulateWriteRoomsSchemaPass(db);
    const survived = s18(db);
    if (!survived.ok) { console.log(`§S18_DEPLOY gate-db FAIL — writeRooms() schema pass broke it: "${survived.err}"`); process.exit(1); }
    if (!survived.rows.length) { console.log('§S18_DEPLOY gate-db VACUOUS — zero non-null elevations; a 0 here is not a pass'); process.exit(1); }
    const map = SG.deriveStoreyMergeMap(survived.rows);
    const bands = new Set(Object.keys(map).map(k => map[k])).size;
    console.log(`§S18_DEPLOY gate-db PASS — ${survived.rows.length} storey datums survive the room compile, ${Object.keys(map).length} names -> ${bands} bands`);
    db.close();
    process.exit(0);
  }

  if (!servedDir || !targets.length) {
    console.error('usage: probe_s18_elevation_deploy.js --served-dir <dir> <DbObject.db> [...]');
    console.error('   or: probe_s18_elevation_deploy.js --gate-db "$GATE_DB"   (from oci_patch_gate.js --verify)');
    console.error('  <DbObject.db> is the OCI object name, e.g. Hospital_meta.db; the served copy is');
    console.error('  expected at <served-dir>/served_<DbObject.db> and the patch at <patch-dir>/<DbObject.db>.sql');
    process.exit(2);
  }

  let anyFail = false, anyVacuous = false;
  for (const dbObj of targets) {
    const servedPath = path.join(servedDir, 'served_' + dbObj);
    const patchPath = path.join(patchDir, dbObj + '.sql');
    if (!fs.existsSync(servedPath)) { console.log(`§S18_DEPLOY ${dbObj} INCONCLUSIVE — no served copy at ${servedPath}`); anyFail = true; continue; }
    if (!fs.existsSync(patchPath)) { console.log(`§S18_DEPLOY ${dbObj} INCONCLUSIVE — no patch at ${patchPath}`); anyFail = true; continue; }

    const db = new SQL.Database(new Uint8Array(fs.readFileSync(servedPath)));

    // 1. BEFORE — reproduce the live failure against the real served bytes.
    const before = s18(db);
    const beforeDesc = before.ok ? `returns ${before.rows.length} row(s)` : `THREW "${before.err}"`;
    console.log(`§S18_DEPLOY ${dbObj} BEFORE ${beforeDesc}`);

    // 2. AFTER — apply the patch exactly as A._applyPendingPatch would.
    // A THROW HERE IS THE LOUDEST RESULT THIS PROBE CAN PRODUCE, not a crash. viewer/scene.js
    // _applyPendingPatch catches every exec failure and returns the ORIGINAL buffer, so a patch
    // whose SQL throws is not partially applied — the WHOLE FILE is silently discarded, and the
    // only thing the user ever sees is the same §S18_STOREY_MERGE_FAIL the patch was meant to
    // cure. Measured: the Duplex §STOREY_DATUM block opened with `CREATE TABLE IF NOT EXISTS`,
    // which is a no-op against the served object's pre-existing elevation-less table, so every
    // INSERT threw. Report it as FAIL and name the discarded blast radius.
    const sql = fs.readFileSync(patchPath, 'utf8');
    let nStmt;
    try {
      nStmt = runSqlChunked(db, sql);
    } catch (e) {
      console.log(`§S18_DEPLOY ${dbObj} FAIL — patch SQL THREW "${e.message}". _applyPendingPatch swallows this and returns the UNPATCHED buffer, so the ENTIRE ${sql.length}-byte patch would be discarded silently, not partially applied.`);
      anyFail = true; db.close(); continue;
    }
    const after = s18(db);
    if (!after.ok) { console.log(`§S18_DEPLOY ${dbObj} FAIL — after patch the query STILL throws "${after.err}"`); anyFail = true; db.close(); continue; }
    console.log(`§S18_DEPLOY ${dbObj} AFTER  ${after.rows.length} row(s) from ${nStmt} statement(s), ${sql.length} bytes`);

    // 3. SURVIVES — the client-side room compile mutates this same table afterwards.
    simulateWriteRoomsSchemaPass(db);
    const survived = s18(db);
    if (!survived.ok) { console.log(`§S18_DEPLOY ${dbObj} FAIL — writeRooms() schema pass BROKE the query: "${survived.err}"`); anyFail = true; db.close(); continue; }
    console.log(`§S18_DEPLOY ${dbObj} SURVIVES_ROOM_COMPILE ${survived.rows.length} row(s) still answer §S18`);

    // 4. MERGES — the SHIPPED owner of "are two storey names one floor?".
    const map = SG.deriveStoreyMergeMap(survived.rows);
    const names = Object.keys(map);
    const merged = names.filter(k => map[k] !== k).length;
    const bands = new Set(names.map(k => map[k])).size;
    console.log(`§S18_DEPLOY ${dbObj} MERGE names=${names.length} merged=${merged} bands=${bands}`);

    // verdict
    if (!survived.rows.length) { console.log(`§S18_DEPLOY ${dbObj} VACUOUS — patch applied but ZERO non-null elevations; a 0 here is not a pass`); anyVacuous = true; }
    else if (before.ok && before.rows.length) { console.log(`§S18_DEPLOY ${dbObj} NO-OP — the served object already answered §S18; nothing to deploy`); }
    else console.log(`§S18_DEPLOY ${dbObj} PASS — served object could not answer §S18, patched object can (${survived.rows.length} storey datums, ${bands} bands)`);

    db.close();
  }

  const verdict = anyFail ? 'FAIL' : (anyVacuous ? 'INCONCLUSIVE' : 'PASS');
  console.log(`§S18_DEPLOY VERDICT ${verdict}`);
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(e => { console.error('§S18_DEPLOY CRASH', e); process.exit(1); });
