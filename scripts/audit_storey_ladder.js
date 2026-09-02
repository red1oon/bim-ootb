#!/usr/bin/env node
// audit_storey_ladder.js (§S13, bim-compiler prompts/4D_GANTT_TM_REFACTOR.md) — measures the storey
// ladder that ScheduleGate.deriveBandRanks builds, and flags the bands that are almost certainly the
// SAME physical level wearing two names.
//
// THE ISSUE IT PROVES OR DISPROVES: deriveBandRanks groups elements by storey NAME and ranks the
// groups by median base_z. When one physical floor carries two names — because the federation's
// source models used different vocabularies — it becomes two adjacent ranks, and everything
// downstream (§4D_BAND_MONOTONIC, §PHASE_OVERLAP_SUPPORT_GUARD, zone CPM, the movie) treats them as
// different levels that must not overlap. Measured on Clinic: architecture starts its "First Floor"
// on day 23 while the same floor's electrical/plumbing sits in "Level 1" and starts on day 106 — an
// 83-day split of one storey, which in playback reads as walls appearing with their services missing
// and services later appearing in mid-air. That is the shape of the user's bake report, and it is
// NOT the split-pair defect §S10/§S11 fixed (Clinic's pair is byte-clean — see audit_split_pairs.js).
//
// This tool DETECTS ONLY. It deliberately does not merge anything: for three of the four fleet
// buildings there is no extractable signal saying which names are the same level (see §S13's blocked
// question), and inventing a z-proximity heuristic is exactly the kind of guess this project's Prime
// Rule forbids. What it does extract, where the DB carries it:
//   - `elements_meta.building` (present in <B>_extracted.db, DROPPED by the split so <B>_meta.db has
//     no trace of it) names the source model per element. On Clinic it explains the whole thing:
//     Architectural/Structural/HVAC say "First Floor"/"Second Floor", Electrical/Plumbing say
//     "Level 1"/"Level 2". That is measured provenance, not a guess.
//   - Overlap of the two bands' interquartile z ranges, printed with the numbers, so a human or a
//     later extraction-side fix can judge each pair on evidence.
//
// Usage: node scripts/audit_storey_ladder.js [--dir buildings] [--building Name]
// Always exit 0 — this reports, it does not gate.
'use strict';
const fs = require('fs'), path = require('path');
const initSqlJs = require(path.join(__dirname, '..', 'modeller', 'lib', 'sql-wasm.js'));

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : process.argv[i + 1]; };
const DIR = path.resolve(arg('dir', path.join(__dirname, '..', 'buildings')));
const ONLY = arg('building', null);
const q = (db, sql) => { try { const r = db.exec(sql); return r.length ? r[0].values : []; } catch (e) { return null; } };
const pct = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];

async function main() {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, '..', 'modeller', 'lib', 'sql-wasm.wasm')) });
  const names = Array.from(new Set(fs.readdirSync(DIR).filter(f => /_(meta|extracted)\.db$/.test(f))
    .map(f => f.replace(/_(meta|extracted)\.db$/, '')))).filter(b => !ONLY || b === ONLY).sort();

  for (const B of names) {
    // Prefer meta.db (what the live viewer schedules) but read `building` from extracted.db, which
    // is the only side that still carries it.
    const fMeta = path.join(DIR, B + '_meta.db'), fExt = path.join(DIR, B + '_extracted.db');
    const src = fs.existsSync(fMeta) ? fMeta : fExt;
    if (!fs.existsSync(src)) continue;
    const db = new SQL.Database(fs.readFileSync(src));
    const rows = q(db, "SELECT COALESCE(m.storey,'NULL'), t.center_z - COALESCE(t.bbox_z,0)/2.0 " +
      'FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid');
    if (!rows || !rows.length) { db.close(); console.log('§STOREY_LADDER ' + B + ' SKIP — no joinable transforms'); continue; }
    const byStorey = new Map();
    for (const [s, z] of rows) { const k = String(s); if (!byStorey.has(k)) byStorey.set(k, []); byStorey.get(k).push(z); }
    db.close();

    // provenance: which source model each storey name came from (extracted.db only)
    const prov = new Map();
    if (fs.existsSync(fExt)) {
      const ex = new SQL.Database(fs.readFileSync(fExt));
      const pr = q(ex, "SELECT COALESCE(storey,'NULL'), COALESCE(building,'?'), COUNT(*) FROM elements_meta GROUP BY 1,2");
      ex.close();
      if (pr) for (const [s, b, n] of pr) {
        const k = String(s); if (!prov.has(k)) prov.set(k, []);
        prov.get(k).push({ b: String(b), n: n });
      }
    }

    const bands = [];
    byStorey.forEach((zs, s) => {
      zs.sort((a, b) => a - b);
      bands.push({ s: s, n: zs.length, q1: pct(zs, 0.25), med: pct(zs, 0.5), q3: pct(zs, 0.75) });
    });
    bands.sort((a, b) => a.med - b.med);

    console.log('§STOREY_LADDER ' + B + ' storeys=' + bands.length + ' src=' + path.basename(src));
    for (const r of bands) {
      const p = (prov.get(r.s) || []).sort((a, b) => b.n - a.n).map(x => x.b.replace(new RegExp('^' + B + '_?'), '') + ':' + x.n).join(' ');
      console.log('   %s med=%s q1=%s q3=%s n=%s %s'
        .replace('%s', (r.s === 'Unknown' || r.s === 'NULL' ? '⊘' : ' ') + ' ' + r.s.padEnd(38))
        .replace('%s', r.med.toFixed(2).padStart(8)).replace('%s', r.q1.toFixed(2).padStart(8))
        .replace('%s', r.q3.toFixed(2).padStart(8)).replace('%s', String(r.n).padStart(6))
        .replace('%s', p ? ' from[' + p + ']' : ''));
    }
    // Overlapping-band pairs: adjacent in the ladder, IQRs intersect. Reported with the numbers and
    // with whether the two names come from DIFFERENT source models — never merged here.
    let flagged = 0;
    for (let i = 0; i + 1 < bands.length; i++) {
      const a = bands[i], b = bands[i + 1];
      if (a.s === 'Unknown' || b.s === 'Unknown' || a.s === 'NULL' || b.s === 'NULL') continue;
      if (b.q1 >= a.q3) continue;                       // disjoint IQRs — genuinely different levels
      const pa = new Set((prov.get(a.s) || []).map(x => x.b)), pb = new Set((prov.get(b.s) || []).map(x => x.b));
      let shared = 0; pa.forEach(x => { if (pb.has(x)) shared++; });
      const srcSplit = pa.size && pb.size && shared === 0;
      flagged++;
      console.log('   ⚠ OVERLAP ' + a.s + ' (med ' + a.med.toFixed(2) + ', q3 ' + a.q3.toFixed(2) + ')' +
        ' vs ' + b.s + ' (med ' + b.med.toFixed(2) + ', q1 ' + b.q1.toFixed(2) + ')' +
        ' medianGap=' + (b.med - a.med).toFixed(2) + 'm' +
        ' sourceModels=' + (prov.size ? (srcSplit ? 'DISJOINT (different source models — same level, two vocabularies)'
          : 'shared (' + shared + ' in common)') : 'unknown (no building column)'));
    }
    console.log('§STOREY_LADDER_SUMMARY ' + B + ' overlappingPairs=' + flagged +
      ' provenance=' + (prov.size ? 'available' : 'ABSENT (building column not in this DB)'));
  }
}
main().catch(e => { console.error('§STOREY_LADDER ERR ' + (e && e.stack || e)); process.exit(2); });
