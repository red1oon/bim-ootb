#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — prompts/STRUCTURAL_SANITY.md T9 bench (READ THE LOG after every run)
 * SCOPE: the fleet ARTIFACT RATE for the Sanity/Egress rules — the benchmark T9 drives to zero.
 *   An artifact is a finding whose OWN witness (T8.12) shows the rule rejected real load-bearing
 *   geometry. This is NOT "fewer findings": a rule reaches zero findings by becoming vacuous, and
 *   this metric is designed to catch exactly that (see --gate).
 * RUN:  node tests/bench_rule_artifacts.js [--json out.json] [--gate tests/bench_baseline.json]
 *       --gate fails (exit 1) if any rule's artifact rate ROSE, or if a rule's findings collapsed
 *       toward zero without its artifact rate falling — the vacuity trap.
 * WHY A BENCH AND NOT A TEST: the numbers here are properties of real buildings, not assertions.
 *   They move when a model is re-extracted. The gate compares against a RECORDED baseline so a
 *   regression is visible without freezing a count into a test (the circular-guard mistake T9
 *   documents: tests/test_structural_sanity_rules.js asserted "count in [40,50]" for the life of
 *   a bug, because that range came from the buggy code's own output).
 */
'use strict';
const fs = require('fs'), path = require('path');
const initSqlJs = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'sql.js'));
const StructuralSanity = require('../viewer/structural_sanity.js');
const EgressSanity = require('../viewer/egress_sanity.js');
const RuleReport = require('../viewer/rule_report.js');

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const ROOT = path.join(__dirname, '..');
const sr = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer/rates/structural_rules.json'), 'utf8'));
const er = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer/rates/egress_rules.json'), 'utf8'));

// Every *_meta.db and *_silent.db under buildings/, plus anything named on the command line.
// A DB that is absent is REPORTED as absent, never silently skipped — a fleet bench that quietly
// shrinks its own fleet is the same silent-SKIP failure the Log Mandate exists to stop.
function fleet() {
  const dir = path.join(ROOT, 'buildings');
  let names = [];
  try {
    // Key by the FULL basename. Stripping the _meta/_silent suffix collapsed Terminal_meta and
    // Terminal_silent onto one key and the second silently overwrote the first — a bench that
    // quietly measures fewer buildings than it lists is the failure this file exists to prevent.
    names = fs.readdirSync(dir)
      .filter(f => /_(meta|silent|extracted)\.db$/.test(f))   // _extracted included so JKR (which has no _meta) is in the fleet
      .map(f => [f.replace(/\.db$/, ''), path.join(dir, f)]);
  } catch (e) { /* no buildings dir */ }
  const extra = process.argv.filter(a => /\.db$/.test(a)).map(p => [path.basename(p, '.db'), p]);
  const all = names.concat(extra);
  const seen = {};
  all.forEach(([n]) => { if (seen[n]) throw new Error('§BENCH_FAIL duplicate building key "' + n + '" — two DBs would collapse onto one row'); seen[n] = 1; });
  return all;
}

(async () => {
  const SQL = await initSqlJs();
  const out = { generatedAt: new Date().toISOString(), buildings: {}, fleet: {} };
  const dbs = fleet();
  console.log('§BENCH_FLEET candidates=' + dbs.length);
  if (!dbs.length) { console.log('§BENCH_FAIL no buildings found — nothing measured, and that is not a pass'); process.exit(1); }

  let usable = 0;
  for (const [name, p] of dbs) {
    let size = 0;
    try { size = fs.statSync(p).size; } catch (e) { console.log(`§BENCH_SKIP ${name} — file missing (${p})`); out.buildings[name] = { skipped: 'missing' }; continue; }
    if (size < 1000) { console.log(`§BENCH_SKIP ${name} — ${size} bytes, an empty placeholder`); out.buildings[name] = { skipped: 'empty' }; continue; }
    const db = new SQL.Database(new Uint8Array(fs.readFileSync(p)));
    const q = (sql, pa) => { const r = pa ? db.exec(sql, pa) : db.exec(sql); return r.length ? r[0].values : []; };
    let rows = [];
    try {
      rows = StructuralSanity.evaluate(q, sr, { log: () => {}, witness: true })
        .concat(EgressSanity.evaluate(q, er, { log: () => {}, witness: true }));
    } catch (e) { console.log(`§BENCH_SKIP ${name} — evaluator error: ${e.message}`); out.buildings[name] = { skipped: 'error: ' + e.message }; continue; }
    usable++;
    const rates = RuleReport.artifactRates(rows, [sr, er]);
    out.buildings[name] = { findings: rows.length, rules: rates };
    console.log(`\n§BENCH ${name} findings=${rows.length}`);
    rates.forEach(r => console.log(`  §BENCH_RULE building=${name} rule=${r.rule} found=${r.found}` +
      ` defect=${r.defect === null ? 'n/a' : r.defect} nearMiss=${r.nearMiss === null ? 'n/a' : r.nearMiss}` +
      ` rate=${r.rate === null ? 'n/a' : (r.rate * 100).toFixed(0) + '%'}`));
  }

  // Fleet roll-up over rules that HAVE an artifact test.
  const g = {};
  Object.values(out.buildings).forEach(b => (b.rules || []).forEach(r => {
    if (r.defect === null) return;
    g[r.rule] = g[r.rule] || { found: 0, artifact: 0, nearMiss: 0 };
    g[r.rule].found += r.found; g[r.rule].artifact += r.defect; g[r.rule].nearMiss += (r.nearMiss || 0);
  }));
  let tf = 0, ta = 0;
  Object.keys(g).sort().forEach(k => { tf += g[k].found; ta += g[k].artifact; g[k].rate = +(g[k].artifact / g[k].found).toFixed(4); });
  out.fleet = { rules: g, found: tf, artifact: ta, rate: tf ? +(ta / tf).toFixed(4) : null, buildingsMeasured: usable };

  console.log('\n' + '='.repeat(64));
  console.log('§BENCH_FLEET_TOTAL buildings=' + usable + ' found=' + tf + ' DEFECT=' + ta +
    ' rate=' + (tf ? (ta / tf * 100).toFixed(1) : 'n/a') + '%  (defect = the rule missed something inside its OWN tolerance)');
  Object.keys(g).sort().forEach(k => console.log(`  §BENCH_FLEET_RULE rule=${k} found=${g[k].found} DEFECT=${g[k].artifact} (${(g[k].rate * 100).toFixed(0)}%) nearMiss=${g[k].nearMiss} (threshold, not a defect)`));

  const jsonOut = arg('json', null);
  if (jsonOut) { fs.writeFileSync(jsonOut, JSON.stringify(out, null, 2)); console.log('§BENCH_JSON ' + jsonOut); }

  const gate = arg('gate', null);
  if (gate) {
    if (!fs.existsSync(gate)) { console.log('§BENCH_GATE_FAIL baseline not found: ' + gate); process.exit(1); }
    const base = JSON.parse(fs.readFileSync(gate, 'utf8'));
    let fail = 0;
    console.log('\n§BENCH_GATE baseline=' + gate + ' (' + base.generatedAt + ')');
    // ⚠ FLEET MEMBERSHIP FIRST. These are fleet TOTALS: comparing them across a different set of
    // buildings is meaningless, and the failure is silent — a missing DB just makes every number
    // smaller and every rule look improved. The buildings/ DBs are gitignored, so a fresh
    // checkout measures a smaller fleet than the one this baseline was recorded on.
    const nowSet = Object.keys(out.buildings).filter(b => !out.buildings[b].skipped).sort();
    const baseSet = Object.keys(base.buildings || {}).filter(b => !base.buildings[b].skipped).sort();
    const missing = baseSet.filter(b => nowSet.indexOf(b) === -1);
    const added = nowSet.filter(b => baseSet.indexOf(b) === -1);
    if (missing.length || added.length) {
      console.log('  ❌ §BENCH_GATE_FLEET_MISMATCH baseline measured [' + baseSet.join(', ') + ']');
      console.log('                               this run measured [' + nowSet.join(', ') + ']');
      if (missing.length) console.log('     missing now: ' + missing.join(', ') + ' — every fleet total is smaller for that reason alone, not because a rule improved');
      if (added.length) console.log('     added now: ' + added.join(', '));
      console.log('§BENCH_GATE_FAIL fleet membership differs — re-record the baseline or restore the DBs');
      process.exit(1);
    }
    Object.keys(g).sort().forEach(k => {
      const b = (base.fleet.rules || {})[k];
      if (!b) { console.log(`  §BENCH_GATE_NEW rule=${k} rate=${(g[k].rate * 100).toFixed(0)}% — no baseline, recorded for next time`); return; }
      const d = g[k].rate - b.rate;
      // (1) the artifact rate must not rise.
      if (d > 0.005) { console.log(`  ❌ §BENCH_GATE_WORSE rule=${k} ${(b.rate * 100).toFixed(0)}% -> ${(g[k].rate * 100).toFixed(0)}%`); fail++; return; }
      // (2) THE VACUITY TRAP: findings collapsed but the artifact rate did not improve. A rule
      // that stops firing without getting more accurate has been switched off, not fixed.
      const dropped = b.found ? (b.found - g[k].found) / b.found : 0;
      if (dropped > 0.5 && d > -0.05) {
        console.log(`  ❌ §BENCH_GATE_VACUOUS rule=${k} findings ${b.found} -> ${g[k].found} (-${(dropped * 100).toFixed(0)}%) but rate ${(b.rate * 100).toFixed(0)}% -> ${(g[k].rate * 100).toFixed(0)}% — the rule went quiet without getting more accurate`);
        fail++; return;
      }
      console.log(`  ✅ rule=${k} ${(b.rate * 100).toFixed(0)}% -> ${(g[k].rate * 100).toFixed(0)}%  findings ${b.found} -> ${g[k].found}`);
    });
    console.log(fail ? `§BENCH_GATE_FAIL ${fail} rule(s) regressed` : '§BENCH_GATE_OK no rule regressed');
    process.exit(fail ? 1 : 0);
  }
})();
