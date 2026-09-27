#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-WALK-LOD400-ONLY scope (read the log after every run)
 * SCOPE: bim-compiler prompts/RESUME_MODELLER_LOD400_REAL_GEOMETRY.md §WALK-LOD400-ONLY.
 * ISSUE UNDER TEST: red1 first principle — "no BBoxes or cubes, or LOD200 fallback. All must be LOD400 or fail hard".
 * Before the fix a SampleCastle walk rendered 366 measured LOD200 boxes (ELEC 270 · ACMV 12 · PLB 84 — legacy-walk placements
 * with no device and no mesh hash), and a Duplex walk that beat the geo fetch drew its 102 ELEC fixtures as boxes.
 * CLAIMS (real Open panel + the production discWalk entry point; numbers from §-lines + the live dwRoot scene graph):
 *   W1 NO-BOX (SampleCastle ELEC/ACMV/PLB/FP) — every §DW-PRIM-LOD line reads lod300=0 lod200=0.
 *   W2 REFUSED-LOGGED — every disc whose placements lacked a real mesh logs §DW-LOD400-REFUSE with its count (not silent).
 *   W3 SCENE-TRUTH — every fixture bucket under dwRoot is a real LOD400 geometry (geometry.userData.lod400 === true); 0 others.
 *   W4 KEPT-REAL — borrowed FP on SampleCastle still renders its real LOD400 meshes (lod400 > 0).
 *   W5 NO-RACE (Duplex) — ELEC walked right after Open (before waiting on anything) → lod400 = placed, lod200 = 0.
 * Must be RED before the fix (W1 lod200=270, W3 box buckets).
 */
'use strict';
const { runE2E } = require('./e2e_harness');

const lodLines = (slog, n0) => slog.slice(n0).filter(l => /§DW-PRIM-LOD disc=/.test(l)).map(l => {
  const m = l.match(/disc=(\w+) lod400=(\d+) lod300=(\d+) lod200=(\d+)/); return m ? { disc: m[1], l4: +m[2], l3: +m[3], l2: +m[4] } : null; }).filter(Boolean);
const sceneTruth = (t) => t.pg.evaluate(() => {
  const g = window.Bonsai.group(); const root = g.children.find(o => o.userData && o.userData.dwRoot);
  let real = 0, other = 0; const bad = [];
  if (root) root.children.forEach(o => { if (!o.isMesh || o.userData.dwDisc == null) return;
    if (o.geometry && o.geometry.userData && o.geometry.userData.lod400 === true) real++; else { other++; if (bad.length < 5) bad.push(o.userData.dwDisc + ':' + (o.geometry && o.geometry.type)); } });
  return { real, other, bad };
});

(async () => {
  let pass = 0, fail = 0;
  const a = await runE2E('W-WALK-LOD400-ONLY SampleCastle', async (t) => {
    await t.open('SampleCastle');
    await t.pg.waitForFunction(() => window.Bonsai && window.Bonsai.oplog.length > 3000, { timeout: 180000 }).catch(() => {});
    const n0 = t.slog.length;
    for (const D of ['ELEC', 'ACMV', 'PLB', 'FP']) {
      const before = await t.pg.evaluate(() => window.__dwLastCommitDisc || null);
      await t.pg.evaluate((d) => { window.__dwLastCommitDisc = null; return window.discWalk(d, { building: 'SampleCastle' }); }, D);
      // a walk either commits (lastCommitDisc) or refuses (REFUSE line) — wait for whichever happens
      const tw = Date.now();
      while (Date.now() - tw < 150000) {
        const done = await t.pg.evaluate((d) => window.__dwLastCommitDisc === d, D);
        if (done || t.slog.slice(n0).some(l => new RegExp('§DISC-WALK ' + D + ' REFUSE|§DW-LOD400-REFUSE disc=' + D).test(l))) break;
        await t.sleep(500);
      }
      await t.sleep(1500);
      void before;
    }
    const lods = lodLines(t.slog, n0), refuse = t.slog.slice(n0).filter(l => /§DW-LOD400-REFUSE disc=/.test(l));
    const sc = await sceneTruth(t);
    console.log('  §WLO SampleCastle lod=' + JSON.stringify(lods.slice(-8)) + ' refuseLines=' + refuse.length + ' scene=' + JSON.stringify(sc));
    refuse.forEach(l => console.log('  §WLO ' + l.slice(0, 200)));
    t.assert('W1 NO-BOX SampleCastle (every §DW-PRIM-LOD lod300=0 lod200=0)', lods.length > 0 && lods.every(x => x.l3 === 0 && x.l2 === 0), JSON.stringify(lods.filter(x => x.l2 || x.l3)));
    t.assert('W2 REFUSED-LOGGED (§DW-LOD400-REFUSE for the mesh-less discs)', refuse.length >= 1 && refuse.some(l => /disc=ELEC refused=\d+/.test(l)), refuse.length + ' line(s)');
    t.assert('W3 SCENE-TRUTH (every dwRoot fixture bucket is LOD400; 0 others)', sc.real > 0 && sc.other === 0, JSON.stringify(sc));
    const fp = lods.filter(x => x.disc === 'FP').pop();
    t.assert('W4 KEPT-REAL borrowed FP renders real LOD400', !!fp && fp.l4 > 0 && fp.l2 === 0, JSON.stringify(fp || null));
  }, { noExit: true });
  pass += a.pass; fail += a.fail;
  const b = await runE2E('W-WALK-LOD400-ONLY Duplex', async (t) => {
    const n0 = t.slog.length;
    await t.open('Duplex');
    await t.pg.evaluate(() => window.discWalk('ELEC', { building: 'Duplex' }));   // immediately — the race case
    await t.pg.waitForFunction(() => window.__dwLastCommitDisc === 'ELEC', { timeout: 150000 }).catch(() => {});
    await t.sleep(1500);
    const lods = lodLines(t.slog, n0), last = lods.filter(x => x.disc === 'ELEC').pop();
    const placed = await t.pg.evaluate(() => (window.__dwWalks.ELEC || []).length);
    console.log('  §WLO Duplex lod=' + JSON.stringify(lods) + ' placed=' + placed);
    t.assert('W5 NO-RACE Duplex ELEC right after Open → lod400 = placed, lod200 = 0', !!last && last.l4 === placed && placed > 0 && last.l2 === 0 && last.l3 === 0, JSON.stringify(last) + ' placed=' + placed);
  }, { noExit: true });
  pass += b.pass; fail += b.fail;
  console.log('W-WALK-LOD400-ONLY: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
