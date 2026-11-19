// apply_building_patch.js — the browser's self-heal patch (viewer/scene.js A._applyPendingPatch), applied in NODE. ONE chunker, no second copy.
//
// ⚠ DO NOT REMOVE — SCOPE (bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.33.11). Read the §PATCH_NODE lines in the log after every run.
// ISSUE IT PROVES OR DISPROVES: the viewer plays `<db>` + `buildings/patches/<db>.sql` (+ `.qto.sql`); scripts/cache_4d_run.js and the 4D gates
// judged the RAW file, so a fact that ships only as a patch (rel_aggregates for Duplex / HHS / Clinic, §ASSEMBLY_RULE) was invisible to every gate
// (W-FC-2 INCONCLUSIVE). This applies the same files the same way: same chunker, main then qto, each inside a SAVEPOINT, a failing patch is rolled
// back and the unpatched DB is used (as the browser does). The light-field `.bin` sidecar is not applied: no 4D reader.
//
// MODE (env CACHE_PATCHES): 'all' (DEFAULT since §Q.35.3, ruling R2 — the gates judge the DB the viewer plays) applies the whole file, exactly
// as the browser does; 'agg' applies ONLY the rel_aggregates statements; '0' applies nothing. HISTORY — why 'agg' was the default (measured 2026-11-19, bim-compiler
// prompts/4D_MODEL_INTEGRITY.md §Q.33.11): the whole patches also carry transform repairs, spatial_structure, wind flips — applying them moves
// every played instant on Terminal (48,427/48,428) and LTU (all), 4 locked ratchets and the Duplex edit fixture; that is a separate decision (a
// fidelity step with its own re-lock), not part of "carry the assembly relation". 'all' stays one env var away to measure it.
//
// The chunker is SLICED out of scene.js (A._runSqlChunked), never retyped — the same technique witness_patch_chain_single_open.js and
// tm_played_layer.js use. If scene.js changes the function's shape, the slice fails loudly (§PATCH_NODE_NO_CHUNKER), it does not fall back to a copy.
//
// EXPORTS
//   patchDir()                          the patch folder (env PATCH_DIR, default <repo>/buildings/patches)
//   mode()                              '0' | 'agg' | 'all'  (env CACHE_PATCHES, default 'all' — §Q.35.3)
//   patchFilesFor(dbFile)               [{kind:'main'|'qto', file}] that exist for this db file name
//   patchKey(dbFile, mode)              '' when nothing would be applied, else a short hash of the text that WOULD be applied (cache keys)
//   applyTo(db, dbFile, log, mode)      apply to an open sql.js Database; returns {applied:[..], failed:[..], statements, mode, aggregatesRows}
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const REPO = path.join(__dirname, '..', '..');
const readSrc = require(path.join(REPO, 'viewer', 'tests', '_split_families.js')).readSource;   // split-aware read: scene.js may be split

const AGG_LINE = /^\s*(CREATE TABLE IF NOT EXISTS|INSERT (OR \w+ )?INTO)\s+rel_aggregates\b/;   // every rel_aggregates statement in the shipped patches is ONE line (checked: §Q.33.11)
function mode() { const m = process.env.CACHE_PATCHES; return m === '0' || m === 'agg' ? m : 'all'; }
function textFor(file, m) { const sql = fs.readFileSync(file, 'utf8'); return m === 'all' ? sql : sql.split('\n').filter(l => AGG_LINE.test(l)).join('\n'); }
function patchDir() { return process.env.PATCH_DIR || path.join(REPO, 'buildings', 'patches'); }
function patchFilesFor(dbFile) {
  const base = path.basename(dbFile), dir = patchDir(), out = [];
  const main = path.join(dir, base + '.sql'), qto = path.join(dir, base + '.qto.sql');
  if (fs.existsSync(main)) out.push({ kind: 'main', file: main });
  if (fs.existsSync(qto)) out.push({ kind: 'qto', file: qto });
  return out;
}
function patchKey(dbFile, m) {
  m = m || mode(); if (m === '0') return '';
  const h = crypto.createHash('sha1'); let any = false;
  for (const p of patchFilesFor(dbFile)) { const t = textFor(p.file, m); if (!t.trim()) continue; any = true; h.update(p.kind).update(t); }
  return any ? m + '-' + h.digest('hex').slice(0, 10) : '';
}
let _chunker = null;
function chunker() {
  if (_chunker) return _chunker;
  const src = readSrc(path.join(REPO, 'viewer', 'scene.js'), 'utf8');
  const i = src.indexOf('A._runSqlChunked = function'); if (i < 0) throw new Error('§PATCH_NODE_NO_CHUNKER A._runSqlChunked not found in viewer/scene.js');
  const mark = '\n  };\n', j = src.indexOf(mark, i); if (j < 0) throw new Error('§PATCH_NODE_NO_CHUNKER end of A._runSqlChunked not found');
  const A = {}; new Function('A', 'console', src.slice(i, j + mark.length))(A, { log() {} });
  return (_chunker = A._runSqlChunked);
}
function applyTo(db, dbFile, log, m) {
  log = log || console.log; m = m || mode();
  const res = { applied: [], failed: [], statements: 0, mode: m, files: m === '0' ? [] : patchFilesFor(dbFile), aggregatesRows: null };
  if (m === '0') { log('§PATCH_NODE off (CACHE_PATCHES=0) ' + path.basename(dbFile) + ' — the RAW file is judged, not what the viewer plays'); return res; }
  if (!res.files.length) { log('§PATCH_NODE none ' + path.basename(dbFile) + ' (no ' + path.join(patchDir(), path.basename(dbFile)) + '.sql)'); return res; }
  const run = chunker();
  for (const p of res.files) {
    const sql = textFor(p.file, m), t0 = Date.now();
    if (!sql.trim()) { log('§PATCH_NODE skip ' + path.basename(p.file) + ' mode=' + m + ' (no rel_aggregates statement in it; the rest of the file is not applied in this mode)'); continue; }
    try {
      db.run('SAVEPOINT node_patch'); const r = run(db, sql); db.run('RELEASE node_patch');
      res.applied.push(p.kind); res.statements += r.statements;
      try { res.aggregatesRows = db.exec('SELECT count(*) FROM rel_aggregates')[0].values[0][0]; } catch (e) { /* no table */ }
      log('§PATCH_NODE applied mode=' + m + ' ' + path.basename(p.file) + ' (' + sql.length + ' bytes, ' + r.statements + ' statements, ' + r.chunks + ' chunk(s)) rel_aggregates rows now=' + res.aggregatesRows + ' ms=' + (Date.now() - t0));
    } catch (e) {
      try { db.run('ROLLBACK TO node_patch'); db.run('RELEASE node_patch'); } catch (e2) {}
      res.failed.push({ kind: p.kind, err: e.message });
      log('§PATCH_NODE_FAIL ' + path.basename(p.file) + ' rolled back, db stays as it was — ' + e.message);
    }
  }
  return res;
}
module.exports = { mode, patchDir, patchFilesFor, patchKey, applyTo };
