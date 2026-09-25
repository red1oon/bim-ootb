#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-ROW7-GRID-BASELINE: what the emergent-grid residual actually is, and which
 * substrate it is measured on. Pure node — no browser, no playwright, no network.
 *
 * WHY THIS EXISTS. MODELLER_MASTER.md row 7 ("grid-lock crux, 0.104 m RMSE baseline residual on the
 * emergent grid") is flagged as needing its own HEAVY investigation session. Before anyone spends it,
 * two things had to be settled, and the second reverses an earlier claim of mine:
 *
 *  1. §XEDGE-GEOWIRE (#1744) changed cross_edges.js's derived datum count 802 -> 657 on SampleCastle,
 *     and I flagged that as possibly moving row 7's baseline. THAT FLAG WAS WRONG. str_walker.js
 *     derives its OWN emergent grid by 1D-clustering column centres and has ZERO references to
 *     CrossEdges/swXEdges. The two derivations are unrelated. Row 7's number is untouched by #1744.
 *
 *  2. Row 7 IS exposed to the same SUBSTRATE defect, by a different route: str_walker_bridge.js:22/38/50
 *     reads t.center_x/center_y straight off element_transforms, which is the IFC placement ANCHOR, not
 *     the volumetric centre (arc_editable.js §ARC-ANCHOR; real_geometry.js recenter()). So both the
 *     grid and the points measured against it sit on anchor positions.
 *
 * WHY A UNIFORM OFFSET WOULD NOT MATTER, AND WHY IT STILL DOES. swWalkSkeleton() derives the grid FROM
 * the same column centres it then measures, so an offset identical on every column would move grid and
 * points together and cancel exactly. It does not cancel, because the offset VARIES per column:
 * measured p50 19.7 mm, p90 148.1 mm, max 225.6 mm in plan — on columns that are 0.75 m square, so the
 * worst is ~30% of a column's width. That spread is the whole effect.
 *
 * MEASURED, on the same fixture and the same metric witness_green_report.js:57-61 uses
 * (swWalkSkeleton -> rms of .residual), Terminal_arcstr_proof.db, 158 columns, geometry 158/158:
 *     grid 18x10 either way — the anchor offset does NOT change grid STRUCTURE, only the residuals
 *     colRMS on anchor centres (what the shipped path computes today) = 0.0939 m
 *     colRMS on true mesh centres                                     = 0.1039 m
 * So correcting the substrate makes the residual WORSE, not better: the anchor defect was FLATTERING
 * this number by ~10 mm. Note the recorded row-7 figure, 0.104 m, matches the CORRECTED value to three
 * decimals, not the shipped path's 0.0939 — so the row's baseline is NOT stale; the measurement path
 * under-reports it. (Whether that match is provenance or coincidence is not established here.)
 *
 *   G1 INSTRUMENT — every column's decoded mesh extent equals its authored bbox_* (extractIFCtoDB.py:181
 *                   defines those as the world AABB extent). If this fails the blob decode is wrong and
 *                   NOTHING below may be believed. This is the check, not a formality.
 *   G2 GRID-STABLE — the emergent grid is the same shape on both substrates (18x10), so this is a
 *                    residual story, not a grid-topology story.
 *   G3 ANCHOR-BASELINE — the shipped path still computes 0.0939 m. Locks the number so a change is seen.
 *   G4 TRUE-BASELINE   — the corrected path computes 0.1039 m. Locks the honest number.
 *   G5 MATERIAL — the two differ by >5 mm, i.e. the substrate defect is material to row 7 and a heavy
 *                 session must decide WHICH number it is chasing before it starts.
 *
 * This witness deliberately asserts BOTH numbers, including the one computed on the known-wrong
 * substrate. It is not endorsing that path — it is pinning it, so that if someone repoints
 * str_walker_bridge.js at true centres, G3 goes red and the change is impossible to make silently.
 */
'use strict';
const { execSync } = require('child_process');
const path = require('path');
const SW = require(path.join(__dirname, '..', 'str_walker.js'));
const DB = path.join(__dirname, '..', 'Terminal_arcstr_proof.db');

const TOL = 0.002;                 // 2 mm on a metre-scale RMSE
const EXPECT_ANCHOR = 0.0939, EXPECT_TRUE = 0.1039;

let pass = 0, fail = 0;
const chk = (name, ok, detail) => { console.log('  ' + (ok ? '✅' : '❌') + ' ' + name + '  ' + (detail || '')); ok ? pass++ : fail++; };
const q = (sql) => execSync(`sqlite3 -separator '|' "${DB}" "${sql}"`, { maxBuffer: 1 << 28 }).toString().trim().split('\n').filter(Boolean);
const rms = a => Math.sqrt(a.reduce((s, r) => s + r * r, 0) / (a.length || 1));

console.log('═══ W-ROW7-GRID-BASELINE — emergent-grid residual, anchor vs true substrate (pure node) ═══');

// The substrate is a LOCAL fixture: .gitignore:49 excludes Terminal_arcstr_proof.db on purpose (it is
// rebuilt by tests/build_arcstr_proof_fixture.sh from Terminal_meta.db, not versioned). A fresh worktree
// or clone therefore has a 0-byte placeholder or nothing at all. Per CLAUDE.md's witness law — "a verdict
// line must print INCONCLUSIVE, never PASS, when nothing was actually judged" — say so and exit non-zero
// rather than silently reporting a green run over an empty population.
const fs2 = require('fs');
let _sz = 0; try { _sz = fs2.statSync(DB).size; } catch (e) { _sz = 0; }
if (_sz < 1024) {
  console.log('  ⚠ INCONCLUSIVE — substrate absent: ' + DB + ' is ' + _sz + ' bytes.');
  console.log('    It is gitignored by design (.gitignore:49). Rebuild it, then re-run:');
  console.log('      bash modeller/tests/build_arcstr_proof_fixture.sh');
  console.log('W-ROW7-GRID-BASELINE: INCONCLUSIVE (0 judged) — NOT a pass');
  process.exit(2);
}

const cols = q("SELECT m.guid,t.center_x,t.center_y,t.center_z FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid WHERE m.discipline='STR' AND m.ifc_class='IfcColumn'")
  .map(r => { const v = r.split('|'); return { guid: v[0], x: +v[1], y: +v[2], z: +v[3] }; });
const hashes = {}; q("SELECT guid,geometry_hash FROM element_instances").forEach(r => { const v = r.split('|'); hashes[v[0]] = v[1]; });
const geo = {};
execSync(`sqlite3 "${DB}" "SELECT geometry_hash, hex(vertices) FROM component_geometries"`, { maxBuffer: 1 << 30 })
  .toString().trim().split('\n').forEach(line => {
    const i = line.indexOf('|'); if (i < 0) return;
    const h = line.slice(0, i), hx = line.slice(i + 1); if (!hx) return;
    const buf = Buffer.from(hx, 'hex'), n = Math.floor(buf.length / 4);
    const f = new Float32Array(buf.buffer, buf.byteOffset, n);
    let mn = [1e30, 1e30, 1e30], mx = [-1e30, -1e30, -1e30];
    for (let k = 0; k + 2 < f.length; k += 3) for (let a = 0; a < 3; a++) { const v = f[k + a]; if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v; }
    geo[h] = { c: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2], ext: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]] };
  });

// G1 — instrument check FIRST. Everything else is void if the decode is wrong.
const bb = {}; q("SELECT m.guid,t.bbox_x,t.bbox_y,t.bbox_z FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid WHERE m.discipline='STR' AND m.ifc_class='IfcColumn'")
  .forEach(r => { const v = r.split('|'); bb[v[0]] = [+v[1], +v[2], +v[3]]; });
let ok = 0, worst = 0, resolved = 0;
cols.forEach(c => { const g = geo[hashes[c.guid]], b = bb[c.guid]; if (!g || !b) return; resolved++;
  const d = Math.max(...[0, 1, 2].map(i => Math.abs(g.ext[i] - b[i]))); worst = Math.max(worst, d); if (d <= 0.002) ok++; });
chk('G1 INSTRUMENT (decoded mesh extent == authored bbox_* — if this fails, believe nothing below)',
  resolved === cols.length && ok === cols.length,
  'columns=' + cols.length + ' geoResolved=' + resolved + ' extentMatch=' + ok + '/' + resolved + ' worstDelta=' + (worst * 1000).toFixed(2) + 'mm');

const skA = SW.swWalkSkeleton(cols, { lineFit: 'mean' });   // the 2026-09-21 measurement was on the mean fit; the default is median since 2026-09-26 (W-ROW7-TRUE-CENTRE pins both)
const rmsA = rms(skA.walked.map(w => w.residual));
const disp = [];
const colsTrue = cols.map(c => { const g = geo[hashes[c.guid]]; if (!g) return null;
  disp.push(Math.hypot(g.c[0], g.c[1]));
  return { guid: c.guid, x: c.x + g.c[0], y: c.y + g.c[1], z: c.z + g.c[2] }; }).filter(Boolean);
const skB = SW.swWalkSkeleton(colsTrue, { lineFit: 'mean' });
const rmsB = rms(skB.walked.map(w => w.residual));
const s = disp.slice().sort((a, b2) => a - b2);
console.log('  §ROW7 offset(plan) p50=' + (s[Math.floor(s.length * .5)] * 1000).toFixed(1) +
            'mm p90=' + (s[Math.floor(s.length * .9)] * 1000).toFixed(1) + 'mm max=' + (s[s.length - 1] * 1000).toFixed(1) + 'mm');

chk('G2 GRID-STABLE (same emergent grid shape on both substrates — a residual story, not a topology one)',
  skA.grid.xLines.length === skB.grid.xLines.length && skA.grid.yLines.length === skB.grid.yLines.length,
  'anchor=' + skA.grid.xLines.length + 'x' + skA.grid.yLines.length + ' true=' + skB.grid.xLines.length + 'x' + skB.grid.yLines.length);
chk('G3 ANCHOR-BASELINE (the SHIPPED path — pinned, not endorsed; repointing the bridge turns this red)',
  Math.abs(rmsA - EXPECT_ANCHOR) <= TOL, 'colRMS=' + rmsA.toFixed(4) + ' m expected=' + EXPECT_ANCHOR);
chk('G4 TRUE-BASELINE (corrected to real mesh centres — the honest number row 7 should chase)',
  Math.abs(rmsB - EXPECT_TRUE) <= TOL, 'colRMS=' + rmsB.toFixed(4) + ' m expected=' + EXPECT_TRUE);
chk('G5 MATERIAL (>5 mm apart — the substrate defect matters to row 7; decide which number before starting)',
  Math.abs(rmsA - rmsB) > 0.005, 'delta=' + ((rmsB - rmsA) * 1000).toFixed(1) + 'mm (corrected is WORSE — the anchor defect flattered it)');

console.log('W-ROW7-GRID-BASELINE: ' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
