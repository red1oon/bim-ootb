#!/usr/bin/env node
// # ⚠ DO NOT REMOVE — scope: W-APPLY-BUILDING-PATCH (bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.33.11). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: the gates judged the RAW building file while the viewer plays file + buildings/patches/<file>.sql, so a fact
// shipped only as a patch (rel_aggregates on Duplex / HHS / Clinic) was invisible to §ASSEMBLY_RULE in every 4D run. scripts/lib/apply_building_patch.js
// applies it in node through the viewer's own chunker. Claims (real shipped DBs + patches; a missing DB prints INCONCLUSIVE, never PASS):
//   AP-1  the raw file has no rel_aggregates rows; after mode 'agg' it has exactly the rows the patch carries (Clinic_meta 738, HHS 2,120, Duplex 11)
//   AP-2  mode 'agg' touches NOTHING else: every other table's row count is unchanged (spatial_structure, element_transforms, elements_meta …)
//   AP-3  idempotent: applying twice leaves the same row count (the browser re-applies on every open)
//   AP-4  a failing patch is rolled back whole and REPORTED (failed[]), the db is left as it was (the browser's behaviour) — red control: a bad patch must be seen
//   AP-5  the chunker is the one in viewer/scene.js, not a copy: the sliced function text equals scene.js's, and it splits a multi-line statement whole
//   AP-6  mode 'all' on HHS carries the whole patch (more statements than 'agg' and spatial_structure rows changes) — proves 'agg' is a real restriction, not a no-op
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..');
const BP = require(path.join(ROOT, 'scripts', 'lib', 'apply_building_patch.js'));
const BLD = process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings');
let pass = 0, fail = 0, inc = 0;
const say = (id, ok, d) => { console.log('  ' + (ok === null ? 'INCONCLUSIVE' : ok ? 'PASS' : 'FAIL') + ' ' + id + ' — ' + d); ok === null ? inc++ : ok ? pass++ : fail++; };
const quiet = () => {};
(async () => {
  const initSqlJs = require(path.join(ROOT, 'modeller', 'lib', 'sql-wasm.js'));
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ROOT, 'modeller', 'lib', 'sql-wasm.wasm')) });
  const open = f => new SQL.Database(new Uint8Array(fs.readFileSync(path.join(BLD, f))));
  const count = (db, t) => { try { return db.exec('SELECT count(*) FROM "' + t + '"')[0].values[0][0]; } catch (e) { return null; } };
  const tables = db => db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0].values.map(v => v[0]);
  const CASES = [['Clinic_meta.db', 738], ['HHS_Office_Federated_extracted.db', 2120], ['Duplex_extracted.db', 11]];
  for (const [f, want] of CASES) {
    if (!fs.existsSync(path.join(BLD, f)) || fs.statSync(path.join(BLD, f)).size < 1e5) { say('AP-1 ' + f, null, 'db not present at ' + BLD + ' — judged nothing'); continue; }
    const db = open(f), before = {}; tables(db).forEach(t => { before[t] = count(db, t); });
    const raw = before.rel_aggregates || 0;
    const r1 = BP.applyTo(db, f, quiet, 'agg'), n1 = count(db, 'rel_aggregates');
    say('AP-1 ' + f, raw === 0 && n1 === want && r1.failed.length === 0, 'raw rel_aggregates rows=' + raw + ' -> after agg=' + n1 + ' (patch carries ' + want + ') failed=' + r1.failed.length);
    const moved = Object.keys(before).filter(t => t !== 'rel_aggregates' && count(db, t) !== before[t]);
    say('AP-2 ' + f, moved.length === 0, 'tables compared=' + (Object.keys(before).length - (raw ? 1 : 0)) + ' changed=' + (moved.length ? moved.join(',') : 'none'));
    BP.applyTo(db, f, quiet, 'agg'); const n2 = count(db, 'rel_aggregates');
    say('AP-3 ' + f, n2 === n1, 'second apply rows=' + n2 + ' first=' + n1);
    db.close();
  }
  // AP-4: a bad patch, rolled back whole and reported
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apb-')), prev = process.env.PATCH_DIR; process.env.PATCH_DIR = tmp;
  fs.writeFileSync(path.join(tmp, 'x.db.sql'), "CREATE TABLE IF NOT EXISTS rel_aggregates (parent_guid TEXT NOT NULL, child_guid TEXT NOT NULL, PRIMARY KEY (parent_guid, child_guid));\n" +
    "INSERT OR IGNORE INTO rel_aggregates (parent_guid,child_guid) VALUES ('a','b');\nINSERT INTO rel_aggregates (parent_guid,child_guid) VALUES ('a','b');\n");   // 2nd insert violates the PK
  { const d = new SQL.Database(); d.run('CREATE TABLE elements_meta(guid TEXT)');
    const r = BP.applyTo(d, 'x.db', quiet, 'agg'), t = tables(d);
    say('AP-4 red control', r.failed.length === 1 && !t.includes('rel_aggregates'), 'failed=' + r.failed.length + ' (' + (r.failed[0] && r.failed[0].err) + ') rel_aggregates table survives rollback=' + t.includes('rel_aggregates')); d.close(); }
  if (prev === undefined) delete process.env.PATCH_DIR; else process.env.PATCH_DIR = prev;
  fs.rmSync(tmp, { recursive: true, force: true });
  // AP-5: one chunker
  const scene = require(path.join(ROOT, 'viewer', 'tests', '_split_families.js')).readSource(path.join(ROOT, 'viewer', 'scene.js'), 'utf8');
  const i = scene.indexOf('A._runSqlChunked = function'), j = scene.indexOf('\n  };\n', i);
  const A = {}; new Function('A', 'console', scene.slice(i, j + 6))(A, { log: quiet });
  { const d = new SQL.Database(), r = A._runSqlChunked(d, 'CREATE TABLE t (a INTEGER,\n  b INTEGER);\nINSERT INTO t VALUES (1,2);\n');
    say('AP-5', i > 0 && r.statements === 2 && count(d, 't') === 1, 'sliced from viewer/scene.js; multi-line CREATE kept whole: statements=' + r.statements + ' rows=' + count(d, 't')); d.close(); }
  // AP-6: 'all' is the whole patch
  const hf = 'HHS_Office_Federated_extracted.db';
  if (fs.existsSync(path.join(BLD, hf)) && fs.statSync(path.join(BLD, hf)).size > 1e5) {
    const da = open(hf), dl = open(hf), sa = count(da, 'spatial_structure');
    const ra = BP.applyTo(da, hf, quiet, 'agg'), rl = BP.applyTo(dl, hf, quiet, 'all');
    say('AP-6', rl.statements > ra.statements && count(dl, 'spatial_structure') !== sa && count(da, 'spatial_structure') === sa,
      "statements agg=" + ra.statements + " all=" + rl.statements + " spatial_structure raw=" + sa + " agg=" + count(da, 'spatial_structure') + " all=" + count(dl, 'spatial_structure')); da.close(); dl.close();
  } else say('AP-6', null, 'HHS db not present — judged nothing');
  console.log('§APPLY_BUILDING_PATCH_SUMMARY pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc);
  process.exit(fail ? 1 : (pass === 0 ? 2 : 0));
})();
