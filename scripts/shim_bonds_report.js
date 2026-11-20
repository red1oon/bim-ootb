#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — shim_bonds_report.js. SCOPE: bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.37.2 (S1, report only). READ THE LOG after every run.
// Prints the bond table of each building from its persisted run: who is bonded and by which need, who is lost and why, where the table's rows
// come from, how the bonds compare with the shipped election, and what stage S3 would move. CPU only; changes nothing.
// Usage: node scripts/shim_bonds_report.js [Building ...]      default: all seven
'use strict';
const path = require('path');
const R = require(path.join(__dirname, 'lib', 'shim_bonds_run.js')), SB = R.SB, O = SB.OUT;
const BLDS = process.argv.slice(2).length ? process.argv.slice(2) : ['Duplex', 'HHS_Office_Federated', 'JKR', 'Clinic', 'Terminal', 'Hospital', 'LTU_AHouse'];
const inc = (m, k, d) => { m[k] = (m[k] || 0) + (d || 1); };
const top = (m, n) => Object.keys(m).sort((a, b) => m[b] - m[a] || (a < b ? -1 : 1)).slice(0, n || 99).map(k => k + '=' + m[k]).join(' ');
(async () => {
  const SQL = await R.sql();
  for (const b of BLDS) {
    const X = R.load(b, SQL);
    if (!X) { console.log('§SHIM_BONDS ' + b + ' INCONCLUSIVE — no persisted run / played layer / contact graph (run: node scripts/cache_4d_run.js ' + b + ')'); continue; }
    const { items, res, des, agg } = X, c = res.counts, n = res.n;
    console.log('§SHIM_BONDS ' + b + ' db=' + X.run.dbFile + ' layer=played n=' + n + ' bonded=' + (c[O.BONDED] || 0) + ' (' + (100 * (c[O.BONDED] || 0) / n).toFixed(1) + '%)' +
      ' lostUntabled=' + (c[O.UNTABLED] || 0) + ' lostNoContact=' + (c[O.NOCONTACT] || 0) + ' lostNoHost=' + (c[O.NOHOST] || 0) + ' lostUnanchored=' + (c[O.UNANCHORED] || 0) +
      ' misplaced=' + (c[O.MISPLACED] || 0) + ' seeds=' + res.seeds + ' waves=' + res.waves + ' angleUnverified=' + (c[O.BONDED] || 0) + ' (boxes only, §Q.37 S6)' +
      ' aggregates=' + (agg.has ? (agg.pairs != null ? agg.pairs : Object.keys(agg.parentOf).length) : 'NONE(' + agg.why + ')') + ' source=' + X.source + (b === 'LTU_AHouse' ? '  ⚠ local Aug-10 DB, not the served pair (§Q.36.5)' : ''));
    const byKind = {}, bySrc = {}, untabled = {}, vs = { same: 0, other: 0, bondOnly: 0, electionOnly: 0, neither: 0 }, vsOther = {}, move = {}, moveN = { n: 0 };
    for (let i = 0; i < n; i++) {
      const k = res.kind[i] || '(untabled)', o = res.outcome[i], row = byKind[k] || (byKind[k] = { n: 0, out: {}, cap: {} });
      row.n++; inc(row.out, o);
      if (o === O.UNTABLED) inc(untabled, items[i].cls || '?');
      if (o === O.BONDED) {
        inc(row.cap, SB.capOf(res, i)); inc(bySrc, SB.srcOf(res, i));
        const hs = res.hosts[i] || [];
        if (SB.capOf(res, i) !== 'continues-same-kind' && hs.some(j => items[j].e > items[i].s + 1)) { inc(move, k); moveN.n++; }   // relay draws no order (rule C)          // a host ENDS after T starts on the played layer
      }
      const h = res.host[i], d = des[i];
      if (h >= 0 && d >= 0) { if (h === d || (res.hosts[i] || []).indexOf(d) >= 0) vs.same++; else { vs.other++; inc(vsOther, k); } }
      else if (h >= 0) vs.bondOnly++; else if (d >= 0) vs.electionOnly++; else vs.neither++;
    }
    Object.keys(byKind).sort((a, b2) => byKind[b2].n - byKind[a].n).forEach(k => console.log('  §SHIM_KIND ' + b + ' ' + k + ' n=' + byKind[k].n + ' | ' + top(byKind[k].out) + (Object.keys(byKind[k].cap).length ? ' | by need: ' + top(byKind[k].cap) : '')));
    console.log('  §SHIM_TABLE_SOURCE ' + b + ' bonds by row source: ' + (top(bySrc) || 'none') + '  (proposed = S1 session rows, not signed off)');
    console.log('  §SHIM_UNTABLED ' + b + ' classes with no row (for sign-off): ' + (top(untabled, 12) || 'none'));
    console.log('  §SHIM_VS_ELECTION ' + b + ' sameHost=' + vs.same + ' otherHost=' + vs.other + ' bondOnly=' + vs.bondOnly + ' electionOnly=' + vs.electionOnly + ' neither=' + vs.neither + (vs.other ? ' | otherHost by kind: ' + top(vsOther, 8) : ''));
    console.log('  §SHIM_WOULD_MOVE ' + b + ' bonded elements (relay excluded) with a host that ENDS after they start=' + moveN.n + (moveN.n ? ' | ' + top(move, 10) : '') + '  (what stage S3 would change; not a defect count)');
  }
})();
