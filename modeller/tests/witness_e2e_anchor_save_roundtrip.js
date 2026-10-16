#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-ANCHOR-SAVE-ROUNDTRIP: a saved + re-opened SampleCastle keeps its 65
 * void-anchors as ANCHORS. Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES (MODELLER_MASTER.md row 34, spec: bim-compiler
 * prompts/RESUME_MODELLER_LOD400_REAL_GEOMETRY.md §ROW34-ANCHOR-SAVE):
 * Save / Export ▸ Native .db write the signed op-log VERBATIM, so the 65 `GEOM_INSERT params.anchorOnly`
 * ops are in every snapshot (correct — they are chain links, and the cascade needs them after re-open).
 * The leak risk is a RE-OPENED snapshot treating them as ordinary elements: 65 extra visible meshes,
 * 65 extra conformity-gate boxes, 65 extra IFC products. The only prior save/re-open witness
 * (witness_e2e_export_db.js E4) runs on Duplex, which has 0 anchors — VACUOUS for this question.
 *
 *   R0 NON-VACUOUS — baseline anchor meshes == anchorOnly ops == 65. Otherwise INCONCLUSIVE, not PASS.
 *   R1 TAGGED      — exported bytes carry exactly 65 anchorOnly ops AND §EXPORT-NATIVE says anchors=65.
 *   R2 RE-OPEN     — after oplog.clear() + the REAL #b-open ▸ "Open local .db…" door: 65 userData.anchor
 *                    meshes, all visible=false; visible-mesh count and _gateBoxes count IDENTICAL.
 *   R3 EXPORT      — IFC build on the re-opened model: seeded == baseline, anchorsExcluded == 65.
 *   R4 FALSIFY     — same bytes with ONE op's anchorOnly stripped, re-opened: anchors 64, visible +1,
 *                    gate boxes +1 (the witness sees a real leak), and verify=false (chain sees tamper).
 */
'use strict';
const { runE2E } = require('./e2e_harness');
const fs = require('fs'), path = require('path'), os = require('os');

const N_ANCHORS = 65;

async function census(t) {
  return t.pg.evaluate(async () => {
    const g = window.Bonsai.group();
    const ms = g.children.filter(o => o.isMesh && o.userData && o.userData.featureId != null);
    const anc = ms.filter(o => o.userData.anchor === true);
    const ops = window.Bonsai.oplog._geomOps();
    let ancOps = 0; ops.forEach(o => { if (o.op_type === 'GEOM_INSERT' && o.parameters && o.parameters.anchorOnly) ancOps++; });
    const r = await window.Bonsai.ifc.build();
    return { len: window.Bonsai.oplog.length, anchors: anc.length, anchorsVisible: anc.filter(o => o.visible).length,
      visible: ms.filter(o => !o.userData.anchor && o.visible).length, gate: Object.keys(window.__gateBoxes()).length,
      ancOps, ifcSeeded: r.seeded, ifcAnchorsExcluded: r.seedAnchors };
  });
}

async function reopen(t, file, lenExpect) {
  await t.pg.evaluate(() => window.Bonsai.oplog.clear());
  await t.clickSel('#b-open'); await t.sleep(250);
  const [chooser] = await Promise.all([
    t.pg.waitForFileChooser({ timeout: 10000 }),
    t.pg.click('#m-open-panel .mo-row[data-key="__local"]')
  ]);
  await chooser.accept([file]);
  await t.pg.waitForFunction((n) => window.Bonsai.oplog.length === n, { timeout: 60000 }, lenExpect).catch(() => {});
  await t.sleep(2500);   // fold settles
  return t.slog.filter(l => /§EXPORT-NATIVE imported/.test(l)).pop() || '';
}

runE2E('W-E2E-ANCHOR-SAVE-ROUNDTRIP', async (t) => {
  await t.open('SampleCastle');
  let len = -1;
  for (let i = 0; i < 80; i++) {
    const l = await t.pg.evaluate(() => window.Bonsai.oplog.length);
    if (l > 0 && l === len) break;
    len = l; await t.sleep(750);
  }
  await t.sleep(2000);
  const B = await census(t);
  console.log('  §ANCSAVE baseline ' + JSON.stringify(B));
  const vac = !(B.anchors === N_ANCHORS && B.ancOps === N_ANCHORS);
  if (vac) console.log('  §ANCSAVE INCONCLUSIVE — baseline carries anchors=' + B.anchors + ' ops=' + B.ancOps + ', expected ' + N_ANCHORS);
  t.assert('R0 NON-VACUOUS (baseline: 65 anchor meshes == 65 anchorOnly ops, all invisible)',
    !vac && B.anchorsVisible === 0, 'anchors=' + B.anchors + ' ancOps=' + B.ancOps + ' visibleAnchors=' + B.anchorsVisible);

  // R1 — the snapshot bytes (the SAME writer runSave uses) + the §ANCHOR tag on the save path
  const ex = await t.pg.evaluate(async () => {
    const r = await window.Bonsai.exportDb({ download: false });
    const db = new window.SQL.Database(r.bytes);
    let anc = 0; const rows = db.exec("SELECT parameters FROM kernel_ops WHERE op_type='GEOM_INSERT'");
    if (rows.length) rows[0].values.forEach(v => { if (JSON.parse(v[0]).anchorOnly) anc++; });
    db.close();
    let b64 = ''; const u8 = r.bytes, CH = 32766;
    for (let i = 0; i < u8.length; i += CH) b64 += btoa(String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + CH, u8.length))));
    return { b64, n: u8.length, anc, tip: r.tip };
  });
  const tag = t.slog.filter(l => /^§EXPORT-NATIVE ops=/.test(l)).pop() || '';
  console.log('  §ANCSAVE exported bytes=' + ex.n + ' anchorOpsInBytes=' + ex.anc + ' tag="' + tag + '"');
  t.assert('R1 TAGGED (snapshot carries exactly 65 anchorOnly ops AND §EXPORT-NATIVE reports anchors=65)',
    ex.anc === N_ANCHORS && new RegExp('anchors=' + N_ANCHORS + ' ').test(tag), 'inBytes=' + ex.anc + ' tag="' + tag.slice(0, 90) + '"');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wancsave-'));
  const good = path.join(dir, 'SampleCastle.db');
  fs.writeFileSync(good, Buffer.from(ex.b64, 'base64'));

  // R2 + R3 — re-open the file through the real door, re-measure everything
  const imp = await reopen(t, good, B.len);
  const A = await census(t);
  console.log('  §ANCSAVE reopened ' + JSON.stringify(A) + ' importLog="' + imp + '"');
  t.assert('R2 RE-OPEN (65 anchors still invisible userData.anchor; visible meshes + gate boxes IDENTICAL)',
    /verify=true/.test(imp) && A.len === B.len && A.anchors === N_ANCHORS && A.anchorsVisible === 0 &&
    A.visible === B.visible && A.gate === B.gate,
    'verify=' + /verify=true/.test(imp) + ' len=' + A.len + '/' + B.len + ' anchors=' + A.anchors + ' visAnc=' + A.anchorsVisible +
    ' visible=' + A.visible + '/' + B.visible + ' gate=' + A.gate + '/' + B.gate);
  t.assert('R3 EXPORT AFTER RE-OPEN (IFC seeded identical, 65 anchors excluded)',
    A.ifcSeeded === B.ifcSeeded && A.ifcAnchorsExcluded === N_ANCHORS,
    'seeded=' + A.ifcSeeded + '/' + B.ifcSeeded + ' excluded=' + A.ifcAnchorsExcluded);

  // R4 — falsify: strip anchorOnly from ONE op in the bytes; the witness must SEE the leak
  const bad64 = await t.pg.evaluate((b64) => {
    const bin = atob(b64); const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const db = new window.SQL.Database(u8);
    const rows = db.exec("SELECT id, parameters FROM kernel_ops WHERE op_type='GEOM_INSERT'")[0].values;
    const hit = rows.find(v => JSON.parse(v[1]).anchorOnly);
    const p = JSON.parse(hit[1]); delete p.anchorOnly;
    db.run('UPDATE kernel_ops SET parameters=? WHERE id=?', [JSON.stringify(p), hit[0]]);
    const out = db.export(); db.close();
    let s = ''; const CH = 32766;
    for (let i = 0; i < out.length; i += CH) s += btoa(String.fromCharCode.apply(null, out.subarray(i, Math.min(i + CH, out.length))));
    return s;
  }, ex.b64);
  const bad = path.join(dir, 'SampleCastle_tampered.db');
  fs.writeFileSync(bad, Buffer.from(bad64, 'base64'));
  const impBad = await reopen(t, bad, B.len);
  const F = await census(t);
  console.log('  §ANCSAVE falsify ' + JSON.stringify(F) + ' importLog="' + impBad + '"');
  t.assert('R4 FALSIFY (one anchorOnly stripped → anchors 64, visible +1, gate +1, verify=false)',
    F.anchors === N_ANCHORS - 1 && F.visible === B.visible + 1 && F.gate === B.gate + 1 && /verify=false/.test(impBad),
    'anchors=' + F.anchors + ' visible=' + F.visible + '/' + (B.visible + 1) + ' gate=' + F.gate + '/' + (B.gate + 1) +
    ' importLog="' + impBad.slice(0, 80) + '"');
});
