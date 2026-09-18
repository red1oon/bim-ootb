#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-RFH-RESIDENTS: the authored host↔opening↔filling chain reaches the residents
 * that were missing it, so §DAGEVU's anchor/ride is no longer inert on most of the fleet.
 *
 * THE ISSUE THIS PROVES OR DISPROVES (MODELLER_MASTER.md row 12):
 * `rel_fills_host` shipped for SampleHouse/Duplex/SampleCastle only. `dagevu_engine.js:62` builds every
 * `HostFillEdge` from a REAL row of that table, and `sdg_cascade.js stretchRide()` is guarded on
 * `window.swXEdges.fills` — so on the other five residents the table was absent, `fills` was empty, and
 * #1706's anchor-by-default engine (the headline of the whole DAGeVu arc) silently did nothing.
 * `docs/ModellerGuide.md` documents the behaviour as shipped, so the honest fix is to ship the relation.
 *
 * WHAT MAKES THIS FALSIFIABLE RATHER THAN A SMOKE TEST: the patch generator measures, offline and
 * against the target DB, exactly how many fills have BOTH ends present as scene features ("rideable").
 * This witness asserts the LIVE count equals that number EXACTLY, per resident. A patch that loads but
 * whose GUIDs do not resolve to real features would load fine and still ride nothing — `> 0` would pass
 * it; an exact match cannot. (That is not hypothetical: an earlier run of this measurement read
 * Hospital as 0 rideable. The cause was a too-short settle on a 14,641-element building, not a defect —
 * hence the generous per-building waits below. A witness that races is a witness that lies.)
 *
 *   F1 TABLE-REACHES-SCENE — each patched resident loads rel_fills_host AND cross_edges publishes it
 *                            as window.swXEdges.fills with the full row count.
 *   F2 RIDEABLE-EXACT      — live rideable == the generator's offline measured reach, per resident:
 *                            HHS 99 · Clinic 302 · Hospital 506 · HospitalGarage 36.
 *   F3 CONTROL-UNCHANGED   — Duplex, which already had the table, still reads 50 rows / 36 rideable.
 *                            Proves the append did not disturb an already-working resident.
 *   F4 TERMINAL-HONEST     — Terminal has NO table and 0 fills, and that is CORRECT, not a miss: its
 *                            source IFC (TerminalMerged.ifc, 567 MB) declares ZERO
 *                            IfcRelVoidsElement/IfcRelFillsElement, so the generator refused to write a
 *                            file rather than invent one. Asserted so the gap stays visible and nobody
 *                            "fixes" it by fabricating edges.
 *
 * Falsify: delete the appended rel_fills_host block from any patched resident's
 * modeller/patches/<X>_ARC.db.sql — F1 and F2 go RED for that building.
 */
'use strict';
const { runE2E } = require('./e2e_harness');

// rows = INSERTs in the shipped patch; rideable = the generator's own measured reach on that target.
const EXPECT = {
  HHS:            { rows: 218, rideable: 99,  settle: 6000 },
  Clinic:         { rows: 403, rideable: 302, settle: 6000 },
  Hospital:       { rows: 665, rideable: 506, settle: 15000 },
  HospitalGarage: { rows: 220, rideable: 36,  settle: 6000 },
  Duplex:         { rows: 50,  rideable: 36,  settle: 5000 },
  Terminal:       { rows: 0,   rideable: 0,   settle: 12000 }
};

async function read(t, key) {
  await t.open(key);
  await t.sleep(EXPECT[key].settle);
  return t.pg.evaluate(() => {
    const X = window.swXEdges || {}, fbg = window.__arcFidByGuid || {};
    const fills = X.fills || [];
    let rideable = 0;
    fills.forEach(f => { if (fbg[f.host_guid] != null && fbg[f.filling_guid] != null) rideable++; });
    const db = new window.SQL.Database(new Uint8Array(window.__dwBuf));
    let table = false, rows = 0;
    try {
      table = db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='rel_fills_host'").length > 0;
      if (table) rows = db.exec("SELECT COUNT(*) FROM rel_fills_host")[0].values[0][0];
    } catch (e) { }
    db.close();
    return { table, rows, fills: fills.length, rideable, bridge: Object.keys(fbg).length };
  });
}

runE2E('W-RFH-RESIDENTS', async (t) => {
  for (const key of ['HHS', 'Clinic', 'Hospital', 'HospitalGarage']) {
    const e = EXPECT[key], r = await read(t, key);
    console.log('  §RFH-' + key + ' ' + JSON.stringify(r));
    t.assert('F1 TABLE-REACHES-SCENE (' + key + ' — patch applied AND published as swXEdges.fills)',
      r.table && r.rows === e.rows && r.fills === e.rows,
      'table=' + r.table + ' rows=' + r.rows + '/' + e.rows + ' fills=' + r.fills);
    t.assert('F2 RIDEABLE-EXACT (' + key + ' — live reach == the generator\'s measured reach, exactly)',
      r.rideable === e.rideable,
      'rideable=' + r.rideable + ' expected=' + e.rideable + ' (bridge=' + r.bridge + ')');
  }

  const d = await read(t, 'Duplex');
  console.log('  §RFH-Duplex ' + JSON.stringify(d));
  t.assert('F3 CONTROL-UNCHANGED (Duplex already had the table — the append disturbed nothing)',
    d.table && d.rows === EXPECT.Duplex.rows && d.rideable === EXPECT.Duplex.rideable,
    'rows=' + d.rows + '/' + EXPECT.Duplex.rows + ' rideable=' + d.rideable + '/' + EXPECT.Duplex.rideable);

  const tm = await read(t, 'Terminal');
  console.log('  §RFH-Terminal ' + JSON.stringify(tm));
  t.assert('F4 TERMINAL-HONEST (no table, 0 fills — its SOURCE IFC declares zero void/fill relations)',
    !tm.table && tm.fills === 0,
    'table=' + tm.table + ' fills=' + tm.fills + ' — do NOT fabricate edges to make this green');
});
