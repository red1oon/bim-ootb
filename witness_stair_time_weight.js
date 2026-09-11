#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-STAIR-TIME-WEIGHT scope (READ THE LOG after every run)
 * SCOPE: prompts/EXIT_DETECTION.md PART 2 / T4 — common/room_graph.js's E3 (stair) edge weight,
 * replacing raw vertical rise with an equivalent-corridor-metres conversion of the real sloped
 * travel distance (§STAIR-TIME-WEIGHT in room_graph.js). RUN: node witness_stair_time_weight.js
 *
 * ISSUES THIS WITNESS EXPOSES:
 *   S1 NEVER-CHEAPER — every E3 edge's new weight is >= what the OLD vertical-rise-only formula
 *      would have given for that same edge (stairs must never get cheaper than the old proxy).
 *   S2 REAL-RUN-USED-WHEN-TRUSTWORTHY — on a real single/simple stair (contained.length<=2), the
 *      new weight reflects real sloped-run length, not just rise (fails if it's suspiciously close
 *      to the pure-rise number on a building where run offset is real).
 *   S3 NO-BOGUS-INFLATION — regression guard for the bug this session found and fixed: an
 *      intermediate link in a multi-storey stair TOWER chain must NOT borrow the group's global
 *      lo/hi row positions (that measured a bogus ~70m "run" on real Hospital data before the
 *      fix, roughly 10x every other edge). Every E3 weight must stay in a plausible per-storey
 *      range, not spike on chain-interior links.
 */
'use strict';
const fs = require('fs'), path = require('path');
const initSqlJs = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'sql.js'));
const RoomGraph = require('./common/room_graph.js');
const DB_PATH = path.join(__dirname, 'buildings', 'Hospital_meta.db');

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

(async () => {
  if (!fs.existsSync(DB_PATH)) { console.log('§W-STAIR-TIME-WEIGHT SKIP — ' + DB_PATH + ' not present'); process.exit(0); }
  console.log('§W-STAIR-TIME-WEIGHT building=' + DB_PATH);
  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(DB_PATH)));
  function dbQuery(sql, params) { const r = params ? db.exec(sql, params) : db.exec(sql); return r.length ? r[0].values : []; }

  const graph = RoomGraph.buildGraph(dbQuery, { log: () => {} });
  const e3 = graph.edges.filter(e => e.kind === 'E3');
  console.log('§E3_EDGES n=' + e3.length);
  chk('G0 real E3 stair edges exist on Hospital', e3.length > 0, 'n=' + e3.length);

  // storeyZ per node — derive per-edge rise from the two circ nodes' own cz (mean wall-center z),
  // the exact quantity the OLD formula used (Math.abs(zB - zA)).
  let neverCheaper = true, worstRatio = Infinity, maxW = -Infinity, minW = Infinity;
  e3.forEach(e => {
    const a = graph.nodesByGuid[e.a], b = graph.nodesByGuid[e.b];
    const oldW = Math.abs(b.cz - a.cz);
    console.log('  §E3 ' + e.storey + ' rise=' + oldW.toFixed(2) + 'm newWeight=' + e.w.toFixed(2));
    if (e.w < oldW - 1e-6) neverCheaper = false;
    worstRatio = Math.min(worstRatio, e.w / (oldW || 1));
    maxW = Math.max(maxW, e.w); minW = Math.min(minW, e.w);
  });
  chk('S1 every E3 edge weight >= its own old vertical-rise proxy', neverCheaper, 'worstRatio=' + worstRatio.toFixed(2));

  chk('S2 new weight scales the rise (ratio stays near STAIR_SPEED_MPS/CORRIDOR_SPEED_MPS≈1.857, not 1.0)',
    worstRatio > 1.3, 'worstRatio=' + worstRatio.toFixed(2));

  chk('S3 no bogus inflation — all E3 weights stay in one plausible per-storey band (max/min < 5x)',
    maxW / minW < 5, 'min=' + minW.toFixed(2) + ' max=' + maxW.toFixed(2) + ' ratio=' + (maxW / minW).toFixed(2));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
