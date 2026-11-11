#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-COVERAGE (spec prompts/CAPEX_DASHBOARD.md §5.40). READ THE LOG: verdict = §COVERAGE_W_VERDICT; the exit code is not evidence.
// THE ISSUE it proves/disproves: "the 5D fold silently drops every element without a usable box, and folds only the first building of a DB": nothing says which elements are unpriced or why.
//   C1 the audit's class counts equal an INDEPENDENT recount by different SQL   C2 unclassified = 0   C3 priced + audited-unpriced == all elements   C4 the whole-set fold is larger than the first building alone
// INCONCLUSIVE when the DB is missing or nothing is unpriced. Break: COVERAGE_BREAK=1 makes the audit ignore parts (aggregates counted as NO_GEOMETRY) → C1 must FAIL.
// Usage: NODE_PATH=<bim-ootb>/node_modules node capex/tests/witness_coverage_audit.js <building.db>
'use strict';
const fs = require('fs'), path = require('path'), initSqlJs = require('sql.js'), FI = require('../tools/fold_inputs.js'), log = console.log;
const db0 = process.argv[2]; let judged = 0, fails = 0, inconc = 0;
const ck = (n, ok, i) => { judged++; if (!ok) fails++; log('  §COVERAGE_W ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (i !== undefined ? ' ' + JSON.stringify(i) : '')); };
const done = () => { const v = judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; log('§COVERAGE_W_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails + ' inconclusive=' + inconc + (process.env.COVERAGE_BREAK === '1' ? ' (BREAK switch ON: FAIL expected)' : '')); process.exit(v === 'PASS' ? 0 : 1); };
(async () => {
  if (!db0 || !fs.existsSync(db0)) { inconc++; log('  §COVERAGE_W INCONCLUSIVE no building db'); return done(); }
  if (typeof FI.coverageAudit !== 'function') { ck('C0 fold_inputs.coverageAudit exists', false); return done(); }
  const SQL = await initSqlJs(), db = new SQL.Database(fs.readFileSync(db0)), one = s => db.exec(s)[0].values[0][0];
  const blds = db.exec('SELECT DISTINCT building FROM elements_meta ORDER BY 1')[0].values.map(r => r[0]);
  const A = FI.coverageAudit(db, blds, { log, ignoreParts: process.env.COVERAGE_BREAK === '1' });
  // independent recount (different SQL: NOT EXISTS / counts, no CTE)
  const noT = one('SELECT COUNT(*) FROM elements_meta m WHERE NOT EXISTS (SELECT 1 FROM element_transforms t WHERE t.guid=m.guid)'),
    zero = one('SELECT COUNT(*) FROM elements_meta m WHERE EXISTS (SELECT 1 FROM element_transforms t WHERE t.guid=m.guid AND (COALESCE(t.bbox_x,0)<=0 OR COALESCE(t.bbox_y,0)<=0 OR COALESCE(t.bbox_z,0)<=0))'),
    agg = one('SELECT COUNT(*) FROM elements_meta m WHERE NOT EXISTS (SELECT 1 FROM element_transforms t WHERE t.guid=m.guid) AND (EXISTS (SELECT 1 FROM rel_aggregates r JOIN element_transforms t ON t.guid=r.child_guid AND t.bbox_x>0 WHERE r.parent_guid=m.guid) OR EXISTS (SELECT 1 FROM element_parts p JOIN element_transforms t ON t.guid=p.child_guid AND t.bbox_x>0 WHERE p.parent_guid=m.guid))');
  const want = { AGGREGATE_PRICED_VIA_PARTS: agg, NO_GEOMETRY: noT - agg, ZERO_DIM: zero };
  if (!(want.NO_GEOMETRY + want.AGGREGATE_PRICED_VIA_PARTS + want.ZERO_DIM)) { inconc++; log('  §COVERAGE_W INCONCLUSIVE nothing is unpriced in this DB'); return done(); }
  log('§COVERAGE_W independent recount ' + JSON.stringify(want) + ' audit ' + JSON.stringify(A.totals));
  ck('C1 the audit class counts equal the independent recount', JSON.stringify(A.totals) === JSON.stringify(want), { audit: A.totals, want });
  ck('C2 unclassified = 0', A.unclassified === 0, { unclassified: A.unclassified });
  const all = one('SELECT COUNT(*) FROM elements_meta'), priced = FI.compute5D(db, blds).reduce((a, r) => a + r.count, 0);
  const unp = A.totals.AGGREGATE_PRICED_VIA_PARTS + A.totals.NO_GEOMETRY;   // ZERO_DIM elements still enter the quantity set by whatever side is above 0 (length) with zero area/volume: counted in `priced`, flagged by the audit
  ck('C3 priced elements + (aggregates + no-geometry) == all elements; the ' + A.totals.ZERO_DIM + ' zero-dimension elements are priced by length only', priced + unp === all, { priced, aggregates_and_no_geometry: unp, all });
  const first = FI.compute5D(db, blds[0]).reduce((a, r) => a + r.count, 0);
  if (blds.length < 2) { inconc++; log('  §COVERAGE_W C4 INCONCLUSIVE one building only'); } else ck('C4 the whole-set quantity set is larger than the first building alone (' + blds.length + ' buildings)', priced > first, { whole: priced, first });
  done();
})().catch(e => { log('§COVERAGE_W_VERDICT FAIL harness ' + (e && e.stack || e)); process.exit(1); });
