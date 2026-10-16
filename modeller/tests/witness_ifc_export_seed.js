#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-IFC-EXPORT-SEED: Export ▸ IFC carries the building, not an empty file.
 *
 * THE ISSUE THIS PROVES OR DISPROVES (MODELLER_MASTER.md row 36 / §IFC-EXPORT-SEED):
 * `bonsai_ifc.js build()` branched on GEOM_EXTRUDE_POLY / GEOM_CUT / GEOM_ARRAY only, and EVERY
 * ARC-seeded element is a GEOM_INSERT — so exporting an opened resident emitted a header and nothing
 * else. Measured on Duplex before the fix: 196 meshes on screen, build() returned
 * {walls:0, openings:0, arrays:0, bytes:592}. 592 bytes is an empty IFC4 file.
 *
 * WHY THIS IS EASY TO GET WRONG, AND WHAT THAT COSTS: the tempting check is "did bytes grow?".
 * Bytes grow the moment ANY geometry is written, including a wrong or partial set — the pre-fix file
 * was 592 B and a half-broken fix would still be megabytes. So E2 asserts the EXACT product count
 * against the op-log, and E3 RE-IMPORTS the emitted bytes and counts products back. A file that is
 * large but unreadable, or readable but short, fails.
 *
 *   E1 NOT-EMPTY    — Duplex exports > 0 products. RED before the fix at exactly 0.
 *   E2 COUNT-EXACT  — products == non-anchor GEOM_INSERT ops. Not ">0": the exact number, so a
 *                     partial export cannot pass.
 *   E3 ROUND-TRIP   — re-importing the emitted bytes yields the SAME product count and one
 *                     IfcTriangulatedFaceSet per product. Proves real, readable IFC, not a big buffer.
 *   E4 ANCHORS-OUT  — SampleCastle has 65 void-anchor inserts. They are invisible ride anchors and the
 *                     user's binding condition keeps them out of every count/pick/audit — an export IS
 *                     an audit. products == ops, anchorsExcluded == 65.
 *   E5 NO-SILENT-BOX — noMeshSkipped is REPORTED, and is 0 on both residents. An element whose mesh
 *                     cannot be resolved is never quietly emitted as a bounding box (§PRIME LESSON);
 *                     it is refused and counted. A non-zero value here is a finding, not a pass.
 *
 * Falsify: revert the `op.op_type === 'GEOM_INSERT'` branch in bonsai_ifc.js — E1/E2/E3 go RED at 0
 * products on both buildings.
 */
'use strict';
const { runE2E } = require('./e2e_harness');

const PRODUCT_TYPES = ['IFCWALL','IFCSLAB','IFCDOOR','IFCWINDOW','IFCFURNISHINGELEMENT','IFCCOVERING',
  'IFCRAILING','IFCSTAIRFLIGHT','IFCBUILDINGELEMENTPROXY','IFCCOLUMN','IFCBEAM','IFCRAMPFLIGHT','IFCROOF',
  'IFCPLATE','IFCMEMBER','IFCBUILDINGELEMENTPART','IFCCURTAINWALL','IFCFLOWTERMINAL','IFCSTAIR',
  'IFCFOOTING','IFCCONTROLLER'];

async function measure(t, building) {
  await t.open(building);
  await t.sleep(building === 'SampleCastle' ? 5000 : 4000);
  return t.pg.evaluate(async (types) => {
    const ops = window.Bonsai.oplog._geomOps();
    let inserts = 0, anchors = 0;
    ops.forEach(o => { if (o.op_type === 'GEOM_INSERT') { o.parameters.anchorOnly ? anchors++ : inserts++; } });
    const r = await window.Bonsai.ifc.build();
    const api = await window.Bonsai.ifc._init(), T = window.WebIFC;
    const id = api.OpenModel(r.bytes);
    const n = (ty) => { try { return api.GetLineIDsWithType(id, ty).size(); } catch (e) { return 0; } };
    let products = 0; const byType = {};
    types.forEach(k => { const c = n(T[k]); if (c > 0) byType[k] = c; products += c; });
    const faceSets = n(T.IFCTRIANGULATEDFACESET);
    api.CloseModel(id);
    return { inserts, anchors, seeded: r.seeded, tris: r.seedTris, noMesh: r.seedNoMesh,
             anchorsExcluded: r.seedAnchors, proxy: r.seedProxy, bytes: r.bytes.length,
             products, faceSets, byType };
  }, PRODUCT_TYPES);
}

runE2E('W-IFC-EXPORT-SEED', async (t) => {
  const D = await measure(t, 'Duplex');
  console.log('  §IFC-SEED-DX ' + JSON.stringify(D));
  t.assert('E1 NOT-EMPTY (Duplex Export ▸ IFC carries products — was 0 / 592 bytes before the fix)',
    D.products > 0 && D.bytes > 10000, 'products=' + D.products + ' bytes=' + D.bytes);
  t.assert('E2 COUNT-EXACT (products == non-anchor GEOM_INSERT ops — exact, so a PARTIAL export fails)',
    D.seeded === D.inserts && D.products === D.inserts,
    'ops=' + D.inserts + ' seeded=' + D.seeded + ' productsInFile=' + D.products);
  t.assert('E3 ROUND-TRIP (re-imported product count matches, one face set per product — real readable IFC)',
    D.products === D.seeded && D.faceSets === D.seeded && D.tris > 0,
    'products=' + D.products + ' faceSets=' + D.faceSets + ' tris=' + D.tris);
  t.assert('E5 NO-SILENT-BOX (Duplex — no element quietly replaced by a bbox; refusals counted)',
    D.noMesh === 0, 'noMeshSkipped=' + D.noMesh + ' (non-zero is a FINDING, not a pass)');

  const S = await measure(t, 'SampleCastle');
  console.log('  §IFC-SEED-SC ' + JSON.stringify(S));
  t.assert('E4 ANCHORS-OUT (SampleCastle: 65 void-anchors stay out of the export — an export IS an audit)',
    S.anchors === 65 && S.anchorsExcluded === 65 && S.seeded === S.inserts && S.products === S.inserts,
    'anchors=' + S.anchors + ' excluded=' + S.anchorsExcluded + ' ops=' + S.inserts +
    ' seeded=' + S.seeded + ' productsInFile=' + S.products);
  t.assert('E5b NO-SILENT-BOX (SampleCastle — same refusal discipline at 3,225 elements)',
    S.noMesh === 0, 'noMeshSkipped=' + S.noMesh);
});
