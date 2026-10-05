#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-MODELLER-ROOM-INJECT scope (read the log after every run)
 * SCOPE: bim-compiler prompts/Modeller/DISC_Walker/ROOM_INJECTION_HYBRID.md §MODELLER-ROOM-INJECT.
 * ISSUE UNDER TEST: WalkerDoctrine §14 — every building gets rooms. The Modeller never ran the room walker, so 6 of 8
 * residents opened with ZERO rooms (their *_ARC.db has no spatial_structure table). Fix: _openBuffer compiles rooms with
 * the shared viewer/lib/room_walker.js when a building has no IfcSpace, never touching real/curated ones.
 * Real user path: the Open panel row for each resident (e2e_harness t.open), then numbers off the live BOM-graph tree.
 * CLAIMS per resident:
 *   R1 LOGGED   — exactly one §MODELLER-ROOM-INJECT line for this open, with the expected source
 *                 (walker for the 6 room-less residents; present for Duplex = 21 real, Terminal = curated RM_).
 *   R2 ROOMS    — the Outliner BOM-graph tree has room nodes > 0 (was 0 on the 6 before the fix).
 *   R3 REAL-KEPT (Duplex) — its 21 real IfcSpace guids are still the ones in the open buffer (none RM_, none dropped).
 * Must be RED with the hook disabled (6 × R1/R2 fail). Env: shared e2e_harness (puppeteer, headless swiftshader).
 */
'use strict';
const { runE2E } = require('./e2e_harness');

const RES = [
  { key: 'SampleHouse', want: 'walker' }, { key: 'Duplex', want: 'present' }, { key: 'SampleCastle', want: 'walker' },
  { key: 'HHS', want: 'walker' }, { key: 'Clinic', want: 'walker' }, { key: 'Hospital', want: 'walker' },
  { key: 'HospitalGarage', want: 'walker' }, { key: 'Terminal', want: 'present' }
];

(async () => {
  let pass = 0, fail = 0;
  for (const R of RES) {
    const r = await runE2E('W-MODELLER-ROOM-INJECT ' + R.key, async (t) => {
      const n0 = t.slog.length;
      await t.open(R.key);
      await t.pg.waitForFunction(() => !!(window.BOMTreeOutliner && window.BOMTreeOutliner._currentTree()), { timeout: 120000 }).catch(() => {});
      const lines = t.slog.slice(n0).filter(l => /§MODELLER-ROOM-INJECT/.test(l));
      const src = lines.length ? ((lines[0].match(/source=(\w+)/) || [])[1] || '?') : null;
      const tree = await t.pg.evaluate(() => {
        const tr = window.BOMTreeOutliner._currentTree(); let rooms = 0;
        if (tr) Object.keys(tr.nodes).forEach(k => { if (tr.nodes[k].kind === 'room') rooms++; });
        let real = null;
        try { const db = new window.SQL.Database(new Uint8Array(window.__dwBuf));
          const q = db.exec("SELECT COUNT(*), SUM(guid LIKE 'RM\\_%' ESCAPE '\\') FROM spatial_structure WHERE type='IfcSpace'");
          real = q.length ? { n: q[0].values[0][0], rm: q[0].values[0][1] } : null; db.close(); } catch (e) { real = { err: e.message }; }
        return { rooms, real };
      });
      console.log('  §ROOM-INJECT-W ' + R.key + ' source=' + src + ' lines=' + lines.length + ' treeRooms=' + tree.rooms + ' ifcSpace=' + JSON.stringify(tree.real) + ' | ' + (lines[0] || '—').slice(0, 170));
      t.assert('R1 LOGGED ' + R.key + ' (one §MODELLER-ROOM-INJECT line, source=' + R.want + ')', lines.length === 1 && src === R.want, 'lines=' + lines.length + ' source=' + src);
      t.assert('R2 ROOMS ' + R.key + ' (Outliner BOM-graph room nodes > 0)', tree.rooms > 0, 'rooms=' + tree.rooms);
      if (R.key === 'Duplex') t.assert('R3 REAL-KEPT Duplex (21 real IfcSpace, 0 compiled RM_)', tree.real && tree.real.n === 21 && tree.real.rm === 0, JSON.stringify(tree.real));
    }, { noExit: true });
    pass += r.pass; fail += r.fail;
  }
  console.log('W-MODELLER-ROOM-INJECT: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
