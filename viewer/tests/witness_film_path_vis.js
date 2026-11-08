#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — W-FILM-PATH-VIS (verb 6 `film_path_visibility`)
// Spec: bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §19.3. Read the log after every run.
// Fixture, PUBLIC only: a copy of buildings/Duplex_extracted.db plus WRITTEN test rows (not data): a 2-band
// cinema_path inside the house and 2 drawn_walk_line + 1 drawn_walk_marker ahead of band 0. Each case names its issue:
//   FV1 the verb is blind                         — band 0, aimed at the rows, sees all 3
//   FV2 RED the verb counts what it should not    — spin 0: band 0 reversed sees 0 of them on band 0
//   FV2b the verb hides what the film shows       — default spin: reversed band 0 sees them, only from the 360° spin
//   FV3 the verb's camera is not the film's       — the flown track passes every stored band centre ≤ 0.05 m
//                                                   (the bake's own bandAnchorMinDistM) and the derived plan does not (≥ 1 m)
//   FV4 vacuous reads as a result                 — the drawn tables dropped → INCONCLUSIVE, never SEES/BLIND
//   FV6 a thin band reads as judged             — --samples 20 resamples until every band has ≥ 20 (min off: stays thin)
//   FV7 the interior count is not what it says  — the `bands` union = per-band indices recomputed, off-path excluded
//   FV5 the verb writes                           — the DB's sha256 is unchanged by a run
//   FV-RED falsifier                              — FPV_BREAK=1 (frustum test always true) must fail FV2
// Run: node viewer/tests/witness_film_path_vis.js   (SwiftShader, CPU only; no GPU, no bake). Exit 0 = pass.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
// the public Duplex DB is gitignored: this checkout's buildings/, else FPV_FIXTURE_DB, else the primary checkout's (read only, copied)
const SRC_DB = [path.join(ROOT, 'buildings', 'Duplex_extracted.db'), process.env.FPV_FIXTURE_DB, path.join(os.homedir(), 'bim-ootb', 'buildings', 'Duplex_extracted.db')]
  .filter(Boolean).find(f => fs.existsSync(f) && fs.statSync(f).size > 100000) || path.join(ROOT, 'buildings', 'Duplex_extracted.db');
const VERB = path.join(ROOT, 'viewer', 'tools', 'film_path_vis.js');

let fail = 0, inconclusive = 0;
const ok = (id, c, m) => { console.log(`§W-FILM-PATH-VIS ${c ? 'PASS' : 'FAIL'} ${id} — ${m}`); if (!c) fail++; };
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const sql = (db, s) => execFileSync('sqlite3', [db, s], { encoding: 'utf8' });

function fixture(dir, name, { reverse = false, drawn = true, spin = 0 } = {}) {
  // spin = the cinema_path spin_sec column: 0 isolates the band's travel; NULL keeps the engine's default 360° look-around at the first band
  const db = path.join(dir, name);
  fs.copyFileSync(SRC_DB, db);
  const d0 = reverse ? '0,-1,0' : '0,1,0';
  sql(db, `CREATE TABLE cinema_path (seq INTEGER, ifc_x REAL, ifc_y REAL, ifc_z REAL, dir_x REAL, dir_y REAL, dir_z REAL, len REAL,
      total_sec REAL, dive_sec REAL, spin_sec REAL, out_sec REAL, rise_sec REAL, hold_sec REAL);
    INSERT INTO cinema_path VALUES (0, 2,-12,1.6, ${d0}, 8, 30,NULL,${spin},NULL,NULL,0), (1, 4,-8,1.6, 1,0,0, 4, 30,NULL,${spin},NULL,NULL,0);`);
  if (drawn) sql(db, `CREATE TABLE drawn_walk_line(sheet TEXT, piece TEXT, x0 REAL,y0 REAL,z0 REAL,x1 REAL,y1 REAL,z1 REAL, width_drawn_mm REAL, system TEXT, basis TEXT, label TEXT);
    INSERT INTO drawn_walk_line VALUES ('FIX','p1', 1.5,-4,2.5, 2.5,-4,2.5, 300,'SA','void-middle',NULL), ('FIX','p2', 1.5,-3,2.5, 2.5,-3,2.5, 300,'RA','void-middle',NULL);
    CREATE TABLE drawn_walk_marker(sheet TEXT, item TEXT, kind TEXT, x REAL,y REAL,z REAL, basis TEXT, label TEXT, ifc_class TEXT, object_type TEXT);
    INSERT INTO drawn_walk_marker VALUES ('FIX','m1','equipment', 2,-3.5,1.2,'owner-stated','fixture','IfcFireSuppressionTerminal',NULL);`);
  return db;
}
function verb(db, env, extra) {
  const r = spawnSync('node', [VERB, '--db', db, '--json', ...(extra || [])], { encoding: 'utf8', env: { ...process.env, ...(env || {}) }, timeout: 600000 });
  let j = null; try { j = JSON.parse(r.stdout); } catch (e) { /* reported below */ }
  if (j) for (const l of j.log) console.log('  ' + l);
  else console.log('  verb exit=' + r.status + ' stderr=' + (r.stderr || '').slice(0, 300));
  return j;
}
const band = (j, k) => (j && j.per || []).find(b => b.band === k) || { samples: 0, lines: 0, markers: 0 };

if (!fs.existsSync(SRC_DB) || fs.statSync(SRC_DB).size < 100000) {
  console.log(`§W-FILM-PATH-VIS INCONCLUSIVE fixture source ${SRC_DB} absent or an LFS pointer stub — nothing judged`);
  process.exit(1);
}
console.log(`§W-FILM-PATH-VIS fixture source=${SRC_DB} sha256=${sha(SRC_DB).slice(0, 12)}…`);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fpvw-'));
try {
  const dbA = fixture(tmp, 'fwd.db'), dbB = fixture(tmp, 'rev.db', { reverse: true }), dbC = fixture(tmp, 'nodrawn.db', { drawn: false }),
        dbS = fixture(tmp, 'rev_spin.db', { reverse: true, spin: 'NULL' });
  const hA = sha(dbA);
  console.log('§W-FILM-PATH-VIS run forward');
  const A = verb(dbA);
  const b0 = band(A, '0');
  ok('FV1', !!A && b0.samples > 0 && b0.lines === 2 && b0.markers === 1, `band 0 samples=${b0.samples} lines=${b0.lines}/2 markers=${b0.markers}/1 verdict=${A && A.verdict}`);
  const anc = (A && A.anchorMinDistM) || [], der = (A && A.derivedAnchorMinDistM) || [];
  ok('FV3', anc.length === 2 && anc.every(d => d <= 0.05) && der.length === 2 && der.some(d => d >= 1),
    `flown bandAnchorMinDistM=[${anc}] (≤ 0.05) derived-plan=[${der}] (some ≥ 1: the stored path, not the derived one)`);
  // FV7 (the interior count is not what it says): the `bands` union = the union of per-band row indices, off-path excluded
  { const bl = new Set(), bm = new Set(); for (const b of (A && A.per) || []) if (b.band !== 'off-path') { b.lineIdx.forEach(x => bl.add(x)); b.markerIdx.forEach(x => bm.add(x)); }
    ok('FV7', !!A && A.bandLines === bl.size && A.bandMarkers === bm.size && A.log.some(l => /§FILM-PATH-VIS bands linesInView=/.test(l)),
      `bands union printed lines=${A && A.bandLines} markers=${A && A.bandMarkers}, recomputed lines=${bl.size} markers=${bm.size}`); }
  // FV6 (a thin band reads as judged): --samples 20 must resample until every band has ≥ 20; with the minimum off the same run stays thin
  console.log('§W-FILM-PATH-VIS run thin: --samples 20');
  const T1 = verb(dbA, null, ['--samples', '20']), T0 = verb(dbA, null, ['--samples', '20', '--min-band-samples', '0']);
  const bandCounts = j => [0, 1].map(i => band(j, String(i)).samples);
  const c1 = bandCounts(T1), c0 = bandCounts(T0);
  ok('FV6', !!T1 && !!T0 && c1.every(c => c >= 20) && T1.log.some(l => /§FILM-PATH-VIS resample from=20 /.test(l)) && c0.some(c => c < 20),
    `min 20: band samples=[${c1}] samplesUsed=${T1 && T1.samplesUsed} (expect all ≥ 20, resample line printed); min 0: band samples=[${c0}] (expect some < 20)`);
  ok('FV5', sha(dbA) === hA, `DB sha256 unchanged after the run (${hA.slice(0, 12)}…)`);
  console.log('§W-FILM-PATH-VIS run reversed');
  const B = verb(dbB), r0 = band(B, '0');
  ok('FV2', !!B && r0.samples > 0 && r0.lines === 0 && r0.markers === 0, `RED band 0 reversed samples=${r0.samples} lines=${r0.lines} markers=${r0.markers} (expect 0, 0)`);
  // FV2b (the verb hides what the film shows): with the engine's default spin, the camera turns 360° at the first band's
  // start (measured 2026-11-09: fixed position, look direction swept through every heading), so a reversed band 0 DOES
  // see the rows, and only from its still (spin) samples, never while moving.
  console.log('§W-FILM-PATH-VIS run reversed, default spin');
  const Sv = verb(dbS), s0 = band(Sv, '0');
  ok('FV2b', !!Sv && s0.still > 0 && (s0.lines + s0.markers) > 0 && s0.movingLines === 0 && s0.movingMarkers === 0,
    `default spin, band 0 reversed: stillSamples=${s0.still} seen=${s0.lines}+${s0.markers} whileMoving=${s0.movingLines}+${s0.movingMarkers} (expect seen > 0, all from the spin)`);
  console.log('§W-FILM-PATH-VIS run no-drawn');
  const C = verb(dbC);
  ok('FV4', !!C && C.verdict === 'INCONCLUSIVE', `no drawn tables → verdict=${C && C.verdict} (expect INCONCLUSIVE)`);
  if (process.env.FPV_BREAK !== '1') {
    console.log('§W-FILM-PATH-VIS run falsifier FPV_BREAK=1 on the reversed fixture');
    const X = verb(dbB, { FPV_BREAK: '1' }), x0 = band(X, '0');
    ok('FV-RED', !!X && (x0.lines > 0 || x0.markers > 0), `FPV_BREAK=1 band 0 reversed lines=${x0.lines} markers=${x0.markers} → FV2 would ${(x0.lines || x0.markers) ? 'FAIL (caught)' : 'PASS (witness blind)'}`);
  }
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
const verdict = fail ? 'FAIL' : inconclusive ? 'INCONCLUSIVE' : 'PASS';
console.log(`§W-FILM-PATH-VIS verdict=${verdict} fail=${fail}`);
process.exit(fail || inconclusive ? 1 : 0);
