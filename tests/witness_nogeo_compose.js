/**
 * W-NOGEO-COMPOSE — witness: does every geometry-less aggregate-parent element ("ghost") in a
 * shipped building DB get a REAL composed transform once its relationship patch is applied?
 *
 * Issue it proves/disproves (prompts/4D_SCHEDULE_PERFECTION.md §NOGEO_COMPOSE, bim-ootb#1263):
 *   IfcCurtainWall/IfcStair/IfcRoof containers authored with no own Representation have NO
 *   element_transforms row, so time_machine.js's §4D_NOGEO fallback parked them at project-end with
 *   a synthetic timestamp and ScheduleGate.auditFloating never counted them. The fix ships the real
 *   IfcRelAggregates pairs as a patch and unions the children's real bboxes at load time.
 *   PASS = ghosts_after == 0 (or the remainder is NAMED in §NOGEO_COMPOSE_UNRESOLVED, never silent).
 *
 * Runs the ACTUAL shipped code, not a reimplementation: both `A._applyPendingPatch` and
 * `A.composeGhostsFromAggregates` are sliced out of viewer/scene.js and eval'd, against the
 * project's OWN bundled viewer/lib/sql-wasm.wasm — NOT npm sql.js (a different WASM build; the
 * 9,465-statement "memory access out of bounds" crash only reproduces on the bundled one).
 *
 * Usage:  node tests/witness_nogeo_compose.js [BuildingDb ...]
 *   default set = every buildings/*.db that has a patches/<db>.sql alongside it
 *   env DBDIR=/path  (default /home/red1/bim-ootb/buildings)
 *
 *   node tests/witness_nogeo_compose.js --db <path> [--patch <file>]
 *   one explicit DB — this is the form scripts/oci_patch_gate.js --verify uses, where the gate has
 *   ALREADY applied the patch to the bytes it downloaded from the bucket ($GATE_DB), so --patch is
 *   omitted and only the compose step is exercised.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DBDIR = process.env.DBDIR || '/home/red1/bim-ootb/buildings';
const PATCHDIR = path.join(ROOT, 'buildings', 'patches');

// --- slice the two real functions out of viewer/scene.js -------------------------------------
function sliceFn(src, header) {
  const start = src.indexOf(header);
  if (start < 0) throw new Error('not found in scene.js: ' + header);
  // functions in scene.js close on a line that is exactly "  };"
  const end = src.indexOf('\n  };', start);
  if (end < 0) throw new Error('no close for ' + header);
  return src.slice(start, end + '\n  };'.length);
}
const sceneSrc = fs.readFileSync(path.join(ROOT, 'viewer', 'scene.js'), 'utf8');
const fnChunk = sliceFn(sceneSrc, '  A._runSqlChunked = function(db, sql) {');   // §PATCH_CHUNK extracted 2026-08-10 (shared with the needle path)
const fnPatch = sliceFn(sceneSrc, '  A._applyPendingPatch = async function(buf, url) {');
const fnCompose = sliceFn(sceneSrc, '  A.composeGhostsFromAggregates = function(db) {');

async function main() {
  const initSqlJs = require(path.join(ROOT, 'viewer', 'lib', 'sql-wasm.js'));
  const wasmPath = path.join(ROOT, 'viewer', 'lib', 'sql-wasm.wasm');
  const wasmBinary = fs.readFileSync(wasmPath);
  console.log(`§WASM bundled=${path.relative(ROOT, wasmPath)} md5=${crypto.createHash('md5').update(wasmBinary).digest('hex')} (the shipped build, not npm sql.js)`);
  const SQL = await initSqlJs({ wasmBinary });

  // eval the real functions with the globals scene.js expects
  const A = { _SQL: SQL };
  global.window = { SQL };
  global.fetch = async (u) => {                       // patch fetch → local patch file
    const f = global.__patchFile || path.join(PATCHDIR, path.basename(u));
    if (!fs.existsSync(f)) return { ok: false, status: 404 };
    return { ok: true, status: 200, text: async () => fs.readFileSync(f, 'utf8') };
  };
  // eslint-disable-next-line no-eval
  eval(fnChunk + '\n' + fnPatch + '\n' + fnCompose);

  const argOf = (n) => { const i = process.argv.indexOf('--' + n); return i < 0 ? null : process.argv[i + 1]; };
  const explicitDb = argOf('db');
  let targets = process.argv.slice(2).filter(a => !a.startsWith('--'));
  if (explicitDb) targets = targets.filter(t => t !== explicitDb && t !== argOf('patch'));
  if (!explicitDb && !targets.length) {
    targets = fs.readdirSync(PATCHDIR)
      .filter(f => f.endsWith('.db.sql'))
      .map(f => f.replace(/\.sql$/, ''))
      .filter(db => fs.existsSync(path.join(DBDIR, db)));
  }

  const jobs = explicitDb
    ? [{ dbFile: path.basename(explicitDb), dbPath: explicitDb, patch: argOf('patch') }]
    : targets.map(dbFile => ({ dbFile, dbPath: path.join(DBDIR, dbFile), patch: path.join(PATCHDIR, dbFile + '.sql') }));

  let pass = 0, fail = 0;
  for (const job of jobs) {
    const { dbFile, dbPath } = job;
    if (!fs.existsSync(dbPath)) { console.log(`§SKIP ${dbFile} — no file at ${dbPath}`); continue; }
    const before = fs.readFileSync(dbPath);
    const md5Before = crypto.createHash('md5').update(before).digest('hex');

    const ghostsQ = 'SELECT COUNT(*) FROM elements_meta m LEFT JOIN element_transforms t ON t.guid=m.guid WHERE t.guid IS NULL';
    const raw = new SQL.Database(new Uint8Array(before));
    const ghostsPre = raw.exec(ghostsQ)[0].values[0][0];
    raw.close();

    const raw0 = before.buffer.slice(before.byteOffset, before.byteOffset + before.byteLength);
    global.__patchFile = job.patch || null;
    // no --patch = the caller (the OCI gate) already applied it to these bytes; compose only
    const patched = job.patch ? await A._applyPendingPatch(raw0, 'buildings/' + path.basename(job.patch).replace(/\.sql$/, '')) : raw0;
    const db = new SQL.Database(new Uint8Array(patched));
    const res = A.composeGhostsFromAggregates(db);
    const ghostsPost = db.exec(ghostsQ)[0].values[0][0];
    let srcBreak = '(no transform_source column)';
    try {
      srcBreak = JSON.stringify(db.exec("SELECT COALESCE(transform_source,'<real>'), COUNT(*) FROM element_transforms GROUP BY 1")[0].values);
    } catch (e) { /* pre-column db */ }
    db.close();

    // the served file must be byte-identical afterwards — compose is in-memory ONLY
    const md5After = crypto.createHash('md5').update(fs.readFileSync(dbPath)).digest('hex');
    const untouched = md5Before === md5After;
    const ok = ghostsPost === 0 && untouched;
    console.log(`§NOGEO_WITNESS ${ok ? 'PASS' : 'FAIL'} ${dbFile} ghosts ${ghostsPre}→${ghostsPost} composed=${res.composed} unresolved=${res.unresolved} served_file_untouched=${untouched} transform_source=${srcBreak}`);
    ok ? pass++ : fail++;
  }
  console.log(`§NOGEO_WITNESS_TOTAL pass=${pass} fail=${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('§NOGEO_WITNESS_ERROR', e); process.exit(1); });
