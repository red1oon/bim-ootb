// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-IFC-EXPORT-SEL, step (d) checks (called by witness_ifc_export_sel.js). Spec: bim-ootb prompts/VIEWER_IFC_EXPORT_BY_DISCIPLINE.md "(d) SPEC". READ THE LOG after every run; the exit code is not evidence.
// ISSUE IT PROVES OR DISPROVES: "an upgraded building exported from the Viewer is not the add-on file the Modeller (and the Python oracle) writes: its generated parts are generic products, it has no materials, no property sets and no part relations."
//   S3 PARTS     a fixture (GardenWorld + generated parts, part relations, a rebar set, a layer pair, a joint) and the real HHS_Office_Federated_2d: the IfcRelAggregates of the file = the parent -> child map the spec's rule gives (computed here from the DB rows, apart from the writer);
//                an aggregated child is in no storey containment; a child whose parent is not written carries Pset BIMC_Part {ParentGlobalId (the parent's GlobalId in the whole-building file), ParentElementId}; generated parts go through the parts path
//                (class, material, Pset BIMC_Upgrade with the host's own GlobalId, assembly of the joint).
//   S4 MATERIAL / PSET   every written generic element with a stated material_name has exactly that one material (python reads it back), the others none and are counted; every element_pset_common row of a written element is a property of the file with the
//                value / type the spec states (TRUE/FALSE -> IfcBoolean, number -> IfcReal, text -> IfcLabel); the property count of the file = the rows.
//   GID          a DB guid that is a valid, unique 22-character IFC GlobalId is the GlobalId in the file; an invalid or duplicated one is derived and counted.
//   S5 PARITY    (real, optional; env only) EXPORT_REAL_DB (+ EXPORT_REAL_DB_GUSSET) + EXPORT_FRAME_JSON + EXPORT_REF_IFC_REBAR (+ EXPORT_REF_IFC_GUSSET): the generated rows the reference add-on file holds, exported IFC2X3 with the frame: the same rooted class
//                counts, the same GlobalId set, and (python, modeller/tests/witness_lodup_ifc_check.py) validate / closed solids / every product's bbox within 1 mm / names, diameters, bar lengths, BIMC_Upgrade values equal. Unset = INCONCLUSIVE, never PASS.
//   RED CONTROLS IFC_EXPORT_RED=noparts (no element is flagged part: the (c) behaviour) must FAIL S3 and S5; IFC_EXPORT_RED=nopsets (element_pset_common is not read) must FAIL S4.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');

module.exports = function (C) {
  const { SQL, X, L, ck, inc, log, py, RED, OUTDIR, hashParts, splitAttrs, unq, ROOT } = C;
  const HOOK = { noParts: RED === 'noparts', noPsets: RED === 'nopsets' };
  const rowsOf = (db, sql, b) => { const r = db.exec(sql, b); return r.length ? r[0].values : []; };
  const sortedKeys = (o) => Object.keys(o).sort();
  const canon = (v) => (v && typeof v === 'object' && !Array.isArray(v)) ? '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : JSON.stringify(v), eqJson = (a, b) => canon(a) === canon(b);
  const isGid = (g) => /^[0-3][0-9A-Za-z_$]{21}$/.test(g || '');
  function pyD(file) {
    const r = cp.spawnSync('python3', [path.join(__dirname, 'witness_ifc_export_sel_d_check.py'), file], { encoding: 'utf8', maxBuffer: 1 << 30, timeout: 1800000 });
    if (r.status === 77) return { skip: true, why: (r.stdout || '').trim() };
    const m = /§IFC_SEL_D_JSON (.*)/.exec(r.stdout || ''); if (!m) return { error: 'python half gave no result: status=' + r.status + ' ' + (r.stderr || '').slice(0, 400) };
    return JSON.parse(m[1]);
  }
  function exportCase(db, geo, label, schema, sel, extra) {
    const name = label + '_' + schema + '.ifc', col = X.collect(db, geo, sel || null, HOOK), res = X.build(col, Object.assign({ schema, name, buildingName: label, projectName: label }, extra || {}));
    if (!res.ok) return { ok: false, why: res.why, col };
    const dir = path.join(OUTDIR, 'd_' + label.replace(/\W+/g, '_')); fs.mkdirSync(dir, { recursive: true }); const file = path.join(dir, name), h = hashParts(res.parts, file);
    col.frameName = extra && extra.frame ? 'frame.json' : null; log(X.selLine(col, res, schema));
    return { ok: true, col, res, file, sha: h.sha, bytes: h.bytes };
  }
  // the GlobalId the file must carry for a DB guid (the spec's rule 5): kept when a valid, unique 22-character GlobalId, else UUID5 of the DB guid; generated parts: UUID5 of the generated id
  const egidGen = (guid, dupSet) => (isGid(guid) && !dupSet.has(guid)) ? guid : L.gidOf(guid);

  // ---- the fixture: GardenWorld + generated parts, part relations, psets, valid GlobalIds, one duplicated row
  function makeFixture(gwBytes) {
    const db = new SQL.Database(new Uint8Array(gwBytes)), mk = (t) => ('0W' + t + '0'.repeat(22)).slice(0, 22);
    const K1 = mk('Keep1'), K3 = mk('Keep3'), D1 = mk('Dup1');
    const ren = (a, b) => ['elements_meta', 'element_transforms', 'element_instances'].forEach((t) => db.run('UPDATE ' + t + ' SET guid = ? WHERE guid = ?', [b, a]));
    ren('RACK_HQ', K1); ren('101', K3); ren('RACK_HQT', D1);
    const PARTS = [   // [old guid, new guid, class, name, host, rule, detail]
      ['AISLE_C', 'GEN-FX-RB-1', 'IfcReinforcingBar', 'Fixture bottom bars 2 x 2T16 [stated "2T16" | fixture]', 'GW_SITE_FLOOR', 'fixture rebar rule', 'stated "2T16" (fixture rows) 2 of 2 bars placed'],
      ['AISLE_A', 'GEN-FX-LY-1', 'IfcBuildingElementPart', 'Concrete 100 mm (layer 1 of 2)', 'GW_SITE_FLOOR', 'fixture layer rule', 'layer 1 of 2'],
      ['AISLE_B', 'GEN-FX-LY-2', 'IfcBuildingElementPart', 'Insulation 50 mm (layer 2 of 2)', K1, 'fixture layer rule', 'layer 2 of 2'],
      ['50005', 'GEN-FX-1-PL', 'IfcPlate', 'Fixture plate', 'RACK_STORE_EAST', 'fixture joint rule', 'plate'],
      ['50006', 'GEN-FX-1-BT', 'IfcMechanicalFastener', 'Fixture bolt M16', 'RACK_STORE_EAST', 'fixture joint rule', 'bolt'],
      ['50007', 'GEN-FX-1-WD', 'IfcFastener', 'Fixture weld', 'RACK_STORE_EAST', 'fixture joint rule', 'weld']];
    PARTS.forEach((p) => { ren(p[0], p[1]); db.run('UPDATE elements_meta SET ifc_class = ?, element_name = ? WHERE guid = ?', [p[2], p[3], p[1]]); });
    db.run("UPDATE elements_meta SET storey = 'AISLE_C' WHERE guid IN ('GEN-FX-1-PL', 'GEN-FX-1-BT', 'GEN-FX-1-WD')");   // one joint = one storey (the writer groups per joint and storey)
    db.run('CREATE TABLE upgrade_changes (seq INTEGER PRIMARY KEY, change TEXT, guid TEXT, ifc_class TEXT, host_guid TEXT, rule TEXT, detail TEXT)');
    PARTS.forEach((p, i) => db.run('INSERT INTO upgrade_changes VALUES (?,?,?,?,?,?,?)', [i + 1, 'ADDED', p[1], p[2], p[4], p[5], p[6]]));
    db.run("INSERT INTO upgrade_changes VALUES (99,'REFUSED','GEN-FX-NOPE','IfcReinforcingBar','RACK_HQ','fixture rule','refused row: must never be written')");
    db.run('CREATE TABLE element_parts (parent_guid TEXT, child_guid TEXT, parent_class TEXT, child_class TEXT)');
    const EP = [[K1, K3], [K1, '50000'], ['RACK_FURNITURE', '50004'], ['NO_SUCH_PARENT', '50008'], ['RACK_FERTILIZER', '50001'], [K1, '50001'], ['GW_SITE_FLOOR', 'GEN-FX-LY-1'], [K1, 'GEN-FX-LY-2'],
      ['RACK_STORE_EAST', 'GEN-FX-1-PL'], ['RACK_STORE_EAST', 'GEN-FX-1-BT'], ['RACK_STORE_EAST', 'GEN-FX-1-WD']];
    EP.forEach((r) => db.run('INSERT INTO element_parts VALUES (?,?,?,?)', [r[0], r[1], '', '']));
    db.run('CREATE TABLE element_pset_common (guid TEXT, pset TEXT, name TEXT, value TEXT, source TEXT)');
    const PS = [[K1, 'Pset_FixtureCommon', 'IsBuiltIn', 'TRUE'], [K1, 'Pset_FixtureCommon', 'Reference', 'R-1'], [K1, 'Pset_FixtureNum', 'Load', '12.5'], [K1, 'Pset_FixtureNum', 'Count', '3'],
      ['50004', 'Pset_FixtureCommon', 'Flag', 'false'], ['ABSENT_GUID_1', 'Pset_FixtureCommon', 'IsBuiltIn', 'TRUE']];
    PS.forEach((r) => db.run('INSERT INTO element_pset_common VALUES (?,?,?,?,?)', r.concat(['fixture'])));
    // elements_meta without its primary key (the extractor's DBs may hold a guid twice), with the row of D1 duplicated
    db.run('CREATE TABLE em_np AS SELECT * FROM elements_meta'); db.run('DROP TABLE elements_meta'); db.run('ALTER TABLE em_np RENAME TO elements_meta');
    db.run('INSERT INTO elements_meta SELECT * FROM elements_meta WHERE guid = ?', [D1]);
    return { db, K1, K3, D1, PARTS, EP, PS };
  }

  // the spec's rules computed from the DB rows alone (never from the writer's output)
  function expectFixture(F, written, red) {
    const dup = new Set(rowsOf(F.db, 'SELECT guid FROM elements_meta GROUP BY guid HAVING COUNT(*) > 1').map((r) => r[0]));
    const meta = {}; rowsOf(F.db, 'SELECT guid, ifc_class, element_name, material_name FROM elements_meta').forEach((r) => { meta[r[0]] = { cls: r[1], name: r[2], mat: r[3] }; });
    const partSet = new Set(F.PARTS.map((p) => p[1])), joint = new Set(F.PARTS.filter((p) => /-(PL|BT|WD)$/.test(p[1])).map((p) => p[1]));
    const gidOf = (g) => partSet.has(g) ? L.gidOf(g) : egidGen(g, dup);
    const par = {}; F.EP.forEach((r) => { (par[r[1]] = par[r[1]] || []).push(r[0]); });
    const agg = {}, orphans = {};
    Object.keys(par).sort().forEach((child) => {
      if (!written.has(child) || joint.has(child)) return;
      const c = par[child].slice().sort(), pick = c.filter((p) => written.has(p))[0];
      if (pick !== undefined) (agg[pick] = agg[pick] || []).push(child); else orphans[child] = c[0];
    });
    const aggGid = {}; Object.keys(agg).forEach((p) => { aggGid[gidOf(p)] = agg[p].map(gidOf).sort(); });
    if (!red) aggGid[L.gidOf('GEN-FX-1')] = ['GEN-FX-1-PL', 'GEN-FX-1-BT', 'GEN-FX-1-WD'].map((g) => L.gidOf(g)).sort();   // the writer's own assembly of the joint
    return { dup, meta, partSet, joint, gidOf, par, agg, aggGid, orphans };
  }

  // ---------------------------------------------------------------------------------------------------------------- the fixture checks
  function runFixture(gwBytes) {
    const F = makeFixture(gwBytes), schemas = ['IFC4', 'IFC2X3'], whole = {};
    const allGuids = new Set(rowsOf(F.db, 'SELECT DISTINCT guid FROM elements_meta').map((r) => r[0]));
    for (const schema of schemas) {
      const E = exportCase(F.db, null, 'FixtureD', schema, null);
      if (!E.ok) { ck('S3:fixture:' + schema, false, 'the writer refused: ' + E.why); continue; }
      const st = E.res.stats, X0 = expectFixture(F, allGuids, !!HOOK.noParts), D = pyD(E.file);
      if (D.skip) { inc('S3:fixture:' + schema, 'ifcopenshell not importable (' + D.why + '): the fixture read-back was NOT judged'); inc('S4:fixture:' + schema, 'ifcopenshell not importable'); continue; }
      if (D.error) { ck('S3:fixture:' + schema, false, D.error); continue; }
      const P = D.products, byTag = {}; Object.keys(P).forEach((g) => { byTag[P[g].tag] = g; });
      whole[schema] = { D, byTag, E };
      // S2 on the fixture file
      const v = py(E.file); if (v.skip) inc('S2:fixture:' + schema, 'ifcopenshell not importable'); else ck('S2:fixture:' + schema, !v.error && v.validate_errors === 0 && v.dupGlobalIds === 0, 'ifcopenshell.validate on the fixture file (' + schema + '): ' + (v.error || v.validate_errors + ' errors, ' + v.products + ' products, dup GlobalIds ' + v.dupGlobalIds + ' ' + JSON.stringify((v.first_errors || []).slice(0, 1))));
      // --- S3: aggregation
      const got = {}, exp = {}; sortedKeys(D.aggs).forEach((k) => { got[k] = D.aggs[k]; }); sortedKeys(X0.aggGid).forEach((k) => { exp[k] = X0.aggGid[k]; });
      ck('S3:fixture:' + schema + ':aggregates', eqJson(got, exp) && st.aggregates === Object.keys(X0.agg).length, 'IfcRelAggregates of the file (whole -> parts, GlobalIds) = the map the rule gives from the DB rows: ' + Object.keys(got).length + ' wholes, ' + Object.values(got).reduce((a, b) => a + b.length, 0) + ' parts (expected ' + Object.keys(exp).length + ' / ' + Object.values(exp).reduce((a, b) => a + b.length, 0) + '); stats.aggregates=' + st.aggregates + ' (expected ' + Object.keys(X0.agg).length + ' from element_parts, +1 joint assembly in the file)');
      const aggChild = new Set(); Object.values(D.aggs).forEach((a) => a.forEach((g) => aggChild.add(g)));
      const badCont = Object.keys(P).filter((g) => (aggChild.has(g) ? P[g].cont !== null : P[g].cont === null));
      ck('S3:fixture:' + schema + ':containment', badCont.length === 0 && aggChild.size > 0, 'an aggregated part is in no storey containment and every other product is contained: ' + aggChild.size + ' aggregated, ' + badCont.length + ' violations' + (badCont.length ? ' e.g. ' + badCont.slice(0, 2).map((g) => P[g].tag).join(',') : ''));
      // --- S3: orphans carry BIMC_Part
      const orphBad = []; let orphN = 0;
      Object.keys(X0.orphans).forEach((child) => { orphN++; const g = byTag[child], ps = g && P[g].psets.BIMC_Part; if (!ps || ps.ParentElementId[1] !== X0.orphans[child] || ('ParentGlobalId' in ps)) orphBad.push(child); });
      ck('S3:fixture:' + schema + ':orphans', orphN > 0 && orphBad.length === 0 && st.orphanParts >= orphN, 'a child whose parent is not written (no such parent in the DB) carries Pset BIMC_Part {ParentElementId} and no dangling relation: ' + orphN + ' judged, ' + orphBad.length + ' wrong; stats.orphanParts=' + st.orphanParts);
      // --- S3: generated parts through the parts path
      const want = { 'GEN-FX-RB-1': ['IfcReinforcingBar', 'Reinforcing steel (grade not stated)'], 'GEN-FX-LY-1': ['IfcBuildingElementPart', 'Concrete'], 'GEN-FX-LY-2': ['IfcBuildingElementPart', 'Insulation'], 'GEN-FX-1-PL': ['IfcPlate', 'Steel (grade not stated)'], 'GEN-FX-1-BT': ['IfcMechanicalFastener', 'Steel (grade not stated)'], 'GEN-FX-1-WD': ['IfcFastener', 'Steel (grade not stated)'] };
      const pBad = [];
      F.PARTS.forEach((p) => {
        const g = byTag[p[1]], w = want[p[1]], pr = g && P[g]; if (!pr) { pBad.push(p[1] + ': not in the file'); return; }
        const up = pr.psets.BIMC_Upgrade, hostGid = X0.gidOf(p[4]);
        if (pr.cls !== w[0]) pBad.push(p[1] + ': class ' + pr.cls + ' != ' + w[0]);
        if (g !== L.gidOf(p[1])) pBad.push(p[1] + ': GlobalId is not UUID5 of the generated id');
        if (!up) pBad.push(p[1] + ': no Pset BIMC_Upgrade'); else {
          if (up.HostGlobalId[1] !== hostGid) pBad.push(p[1] + ': HostGlobalId ' + up.HostGlobalId[1] + ' != the host\'s own GlobalId in the file ' + hostGid); if (up.Rule[1] !== p[5] || up.Detail[1] !== p[6] || up.GeneratedElementId[1] !== p[1]) pBad.push(p[1] + ': Rule / Detail / GeneratedElementId differ');
        }
        if (!eqJson(pr.mat, [w[1]])) pBad.push(p[1] + ': material ' + JSON.stringify(pr.mat) + ' != ' + w[1]);
        if (p[2] === 'IfcReinforcingBar') { if (!up || up.BarRole[1] !== 'MAIN' || up.DiametersStatedOnElement_mm) pBad.push(p[1] + ': BarRole / diameter pset'); }
      });
      const asmG = L.gidOf('GEN-FX-1'), asm = P[asmG];
      if (!HOOK.noParts && (!asm || asm.cls !== 'IfcElementAssembly')) pBad.push('joint: no IfcElementAssembly');
      const refusedWritten = !!byTag['GEN-FX-NOPE'];
      const pcExp = { IfcBuildingElementPart: 2, IfcFastener: 1, IfcMechanicalFastener: 1, IfcPlate: 1, IfcReinforcingBar: 1 };
      ck('S3:fixture:' + schema + ':parts', pBad.length === 0 && !refusedWritten && eqJson(st.partClasses, pcExp) && st.parts === 6 && st.assemblies === 1, 'the 6 generated parts (rebar set, layer pair, plate + bolt + weld joint) go through the parts path as the Modeller writes them: class, GlobalId = UUID5 of the generated id, Pset BIMC_Upgrade (Rule / Detail / HostGlobalId = the host\'s own GlobalId in this file), material, assembly; ' + pBad.length + ' problems ' + JSON.stringify(pBad.slice(0, 3)) + '; the REFUSED row written=' + refusedWritten + '; stats parts=' + st.parts + ' assemblies=' + st.assemblies + ' partClasses=' + JSON.stringify(st.partClasses));
      // --- S4: materials
      const genGuids = Object.keys(X0.meta).filter((g) => !X0.partSet.has(g)), mBad = []; let withMat = 0, noMat = 0;
      genGuids.forEach((g) => { const pr = P[byTag[g]], m = X0.meta[g].mat; if (m) { withMat++; if (!eqJson(pr.mat, [m])) mBad.push(g + ' ' + JSON.stringify(pr.mat) + ' != ' + m); } else { noMat++; if (pr.mat.length) mBad.push(g + ' has ' + JSON.stringify(pr.mat) + ' but states none'); } });
      ck('S4:fixture:' + schema + ':material', genGuids.length > 0 && withMat > 0 && mBad.length === 0 && st.noMaterial === noMat, 'every written element with a stated material_name has exactly that one material, the others none: ' + withMat + ' with, ' + noMat + ' without, ' + mBad.length + ' wrong; stats.noMaterial=' + st.noMaterial + ' (expected ' + noMat + '), materials=' + st.materials);
      // --- S4: property sets
      const ex = { [F.K1]: { Pset_FixtureCommon: { IsBuiltIn: ['IfcBoolean', true], Reference: ['IfcLabel', 'R-1'] }, Pset_FixtureNum: { Load: ['IfcReal', 12.5], Count: ['IfcReal', 3] } }, '50004': { Pset_FixtureCommon: { Flag: ['IfcBoolean', false] } } };
      const pb = []; let props = 0; Object.keys(ex).forEach((g) => { const got2 = {}; const pr = P[byTag[g]]; Object.keys(pr.psets).filter((n) => !/^BIMC_/.test(n)).forEach((n) => { got2[n] = pr.psets[n]; }); props += Object.values(got2).reduce((a, o) => a + Object.keys(o).length, 0); if (!eqJson(got2, ex[g])) pb.push(g + ' ' + JSON.stringify(got2) + ' != ' + JSON.stringify(ex[g])); });
      let fileProps = 0; Object.keys(P).forEach((g) => { if (X0.partSet.has(P[g].tag)) return; Object.keys(P[g].psets).filter((n) => !/^BIMC_/.test(n)).forEach((n) => { fileProps += Object.keys(P[g].psets[n]).length; }); });
      ck('S4:fixture:' + schema + ':psets', pb.length === 0 && props === 5 && fileProps === 5 && st.props === 5 && st.psets === 3, 'element_pset_common rows round-trip typed (TRUE -> IfcBoolean true, false -> IfcBoolean false, 12.5 / 3 -> IfcReal, R-1 -> IfcLabel); the row of a guid not in the DB is not written: ' + pb.length + ' wrong ' + JSON.stringify(pb.slice(0, 2)) + '; properties in the file ' + fileProps + ' = 5 rows of written elements; stats.psets=' + st.psets + ' props=' + st.props);
      // --- GID
      const gBad = []; let kept = 0, derived = 0;
      genGuids.forEach((g) => { const gid = byTag[g], want2 = egidGen(g, X0.dup); if (gid !== want2) gBad.push(g + ' file ' + gid + ' != ' + want2); if (isGid(g) && !X0.dup.has(g)) kept++; else derived++; });
      ck('GID:fixture:' + schema, kept === 2 && derived === genGuids.length - 2 && gBad.length === 0 && byTag[F.K1] === F.K1 && byTag[F.D1] !== F.D1 && st.gidKept === kept && st.gidDerived === derived, 'a valid unique 22-character DB guid is the GlobalId (2 kept: ' + (byTag[F.K1] === F.K1 && byTag[F.K3] === F.K3) + '); the duplicated valid one and the invalid ones are derived (' + derived + '), none equal to the DB guid unless valid + unique; ' + gBad.length + ' wrong; stats gidKept=' + st.gidKept + ' gidDerived=' + st.gidDerived);
    }
    // --- S3: a selection of children alone gives no aggregate and every child names its parent's GlobalId as the whole-building file writes it
    const W = whole.IFC4;
    if (W) {
      const kids = ['50000', '50004', '50001', F.K3], sel = new Set(kids), E = exportCase(F.db, null, 'FixtureDSel', 'IFC4', sel), D = E.ok ? pyD(E.file) : null;
      if (!E.ok || !D || D.error) ck('S3:fixture:selection', false, 'selection export failed: ' + (E.why || (D && D.error)));
      else {
        const X0 = expectFixture(F, allGuids, !!HOOK.noParts), byTag = {}; Object.keys(D.products).forEach((g) => { byTag[D.products[g].tag] = g; });
        const bad = []; kids.forEach((k) => { const g = byTag[k], pr = g && D.products[g], bp = pr && pr.psets.BIMC_Part, pick = X0.par[k].slice().sort().filter((p) => allGuids.has(p))[0], pg = W.byTag[pick]; if (!bp || bp.ParentElementId[1] !== pick || bp.ParentGlobalId === undefined || bp.ParentGlobalId[1] !== pg) bad.push(k + ': ' + JSON.stringify(bp) + ' != parent ' + pick + ' ' + pg); });
        ck('S3:fixture:selection', Object.keys(D.aggs).length === 0 && E.res.stats.aggregates === 0 && E.res.stats.orphanParts === kids.length && bad.length === 0 && Object.keys(D.products).length === kids.length, 'a selection of 4 children alone: ' + Object.keys(D.aggs).length + ' aggregates (0 required), every child carries BIMC_Part.ParentGlobalId = its parent\'s GlobalId in the whole-building file and ParentElementId; ' + bad.length + ' wrong ' + JSON.stringify(bad.slice(0, 2)) + '; products ' + Object.keys(D.products).length + ', orphanParts ' + E.res.stats.orphanParts);
      }
    }
    // --- determinism of the fixture files (S6)
    const a = exportCase(F.db, null, 'FixtureD', 'IFC4', null), b = exportCase(F.db, null, 'FixtureD', 'IFC4', null);
    ck('S6:fixture:IFC4', a.ok && b.ok && a.sha === b.sha, 'two fixture exports (parts, psets, relations, kept GlobalIds): ' + (a.sha || '').slice(0, 16) + ' / ' + (b.sha || '').slice(0, 16));
  }

  // ---------------------------------------------------------------------------------------------------------------- the real HHS_Office_Federated_2d: part relations + psets as the extractor stored them
  function runHhs2d(bytes) {
    const db = new SQL.Database(new Uint8Array(bytes)), E = exportCase(db, null, 'HHS2d', 'IFC4', null);
    if (!E.ok) { ck('S3:HHS2d', false, 'the writer refused: ' + E.why); return; }
    const st = E.res.stats, D = pyD(E.file);
    if (D.skip) { inc('S3:HHS2d', 'ifcopenshell not importable'); inc('S4:HHS2d', 'ifcopenshell not importable'); return; }
    if (D.error) { ck('S3:HHS2d', false, D.error); return; }
    const P = D.products, byTag = {}; Object.keys(P).forEach((g) => { byTag[P[g].tag] = g; });
    const written = new Set(Object.keys(byTag)), ep = rowsOf(db, 'SELECT child_guid, parent_guid FROM element_parts ORDER BY child_guid, parent_guid');
    const kids = ep.filter((r) => written.has(r[0])), parentsWritten = new Set(ep.map((r) => r[1]).filter((p) => written.has(p)));
    const bad = []; kids.forEach((r) => { const pr = P[byTag[r[0]]], bp = pr.psets.BIMC_Part; if (!bp || bp.ParentElementId[1] !== r[1] || bp.ParentGlobalId[1] !== r[1]) bad.push(r[0]); });
    const v = py(E.file); if (v.skip) inc('S2:HHS2d', 'ifcopenshell not importable'); else ck('S2:HHS2d', !v.error && v.validate_errors === 0 && v.dupGlobalIds === 0, 'ifcopenshell.validate on HHS_Office_Federated_2d (IFC4, ' + v.products + ' products): ' + (v.error || v.validate_errors + ' errors, dup GlobalIds ' + v.dupGlobalIds));
    ck('S3:HHS2d', kids.length > 0 && parentsWritten.size === 0 && Object.keys(D.aggs).length === 0 && st.aggregates === 0 && st.orphanParts === kids.length && bad.length === 0, 'HHS_Office_Federated_2d whole building: ' + kids.length + ' written children of element_parts, their ' + new Set(ep.map((r) => r[1])).size + ' parents (curtain walls) carry no geometry so none is written: ' + Object.keys(D.aggs).length + ' aggregates (0 expected), every child carries BIMC_Part {ParentGlobalId, ParentElementId} naming its parent (' + bad.length + ' wrong); stats.orphanParts=' + st.orphanParts + ' aggregates=' + st.aggregates);
    // S4 psets: every row of a written element, typed
    const rows = rowsOf(db, 'SELECT guid, pset, name, value FROM element_pset_common ORDER BY guid, pset, name').filter((r) => written.has(r[0])), pbad = [];
    rows.forEach((r) => { const t = (/^true$/i.test(r[3]) || /^false$/i.test(r[3])) ? ['IfcBoolean', /^true$/i.test(r[3])] : (isFinite(Number(r[3])) && String(r[3]).trim() !== '') ? ['IfcReal', Number(r[3])] : ['IfcLabel', r[3]], got = (P[byTag[r[0]]].psets[r[1]] || {})[r[2]]; if (!got || got[0] !== t[0] || got[1] !== t[1]) pbad.push(r.join('.')); });
    let fileProps = 0; Object.keys(P).forEach((g) => Object.keys(P[g].psets).filter((n) => !/^BIMC_/.test(n)).forEach((n) => { fileProps += Object.keys(P[g].psets[n]).length; }));
    const wall = rowsOf(db, "SELECT c.guid, m.element_name, c.value FROM element_pset_common c JOIN elements_meta m USING(guid) WHERE c.pset = 'Pset_WallCommon' AND c.name = 'IsExternal' ORDER BY c.guid LIMIT 1")[0], wp = wall && P[byTag[wall[0]]].psets.Pset_WallCommon;
    const wallOk = !!(wall && wp && wp.IsExternal[0] === 'IfcBoolean' && wp.IsExternal[1] === /^true$/i.test(wall[2]));
    const noMat = rowsOf(db, "SELECT COUNT(*) FROM elements_meta WHERE material_name IS NULL OR material_name = ''")[0][0], matInFile = Object.keys(P).filter((g) => P[g].mat.length).length;
    ck('S4:HHS2d', rows.length > 0 && pbad.length === 0 && fileProps === rows.length && st.props === rows.length && wallOk && matInFile === 0 && st.noMaterial === st.written, 'HHS_Office_Federated_2d: ' + rows.length + ' element_pset_common rows of written elements, ' + pbad.length + ' differ in the file (type / value); properties in the file ' + fileProps + ' = rows ' + rows.length + '; Pset_WallCommon.IsExternal of the wall "' + (wall && wall[1]) + '" = DB ' + (wall && wall[2]) + ' -> ' + JSON.stringify(wp && wp.IsExternal) + '; the DB states no material (' + noMat + ' of ' + st.written + ' elements): ' + matInFile + ' materials in the file, stats.noMaterial=' + st.noMaterial);
    ck('GID:HHS2d', st.gidKept === st.written && st.gidDerived === 0 && Object.keys(P).every((g) => g === P[g].tag), 'every DB guid of HHS_Office_Federated_2d is a valid unique 22-character GlobalId: all ' + st.gidKept + ' are the GlobalId in the file (derived ' + st.gidDerived + ')');
  }

  // GID on the real HHS_Office extracted building (9 of its 6880 guids are not valid GlobalIds): the whole-building file already written by the main witness
  function gidCheck(label, db, col, res, file) {
    const txt = fs.readFileSync(file, 'utf8'), want = new Map(), re = /^#\d+=([A-Z0-9_]+)\((.*)\);$/gm; let m;
    const dbGuids = new Set(rowsOf(db, 'SELECT guid FROM elements_meta').map((r) => r[0])), dup = new Set(rowsOf(db, 'SELECT guid FROM elements_meta GROUP BY guid HAVING COUNT(*) > 1').map((r) => r[0])), got = new Map();
    while ((m = re.exec(txt)) !== null) { if (/^IFCREL|^IFCPROJECT$|^IFCSITE$|^IFCBUILDING$|^IFCBUILDINGSTOREY$/.test(m[1])) continue; const a = splitAttrs(m[2]); if (a.length < 8) continue; const t = unq(a[7]); if (t !== null && dbGuids.has(t)) got.set(t, unq(a[0])); }
    let kept = 0, derived = 0; const bad = [];
    col.elements.forEach((e) => { const w = egidGen(e.guid, dup), g = got.get(e.guid); if (g !== w) bad.push(e.guid + ' ' + g + ' != ' + w); if (isGid(e.guid) && !dup.has(e.guid)) kept++; else derived++; });
    const st = res.stats, invalidKept = col.elements.filter((e) => !isGid(e.guid) && got.get(e.guid) === e.guid).length;
    ck('GID:' + label, bad.length === 0 && got.size === col.elements.length && st.gidKept === kept && st.gidDerived === derived && invalidKept === 0 && kept > 0, label + ': every written product whose DB guid is a valid unique GlobalId carries it (' + kept + ' kept), the others are derived (' + derived + ' derived, ' + col.elements.filter((e) => !isGid(e.guid)).length + ' invalid); ' + bad.length + ' wrong; stats gidKept=' + st.gidKept + ' gidDerived=' + st.gidDerived + '; an invalid guid kept as GlobalId: ' + invalidKept);
  }

  // ---------------------------------------------------------------------------------------------------------------- S5: the real parity (env only)
  function refTags(file) {   // the Tag (8th attribute) of every product line of an add-on file
    const txt = fs.readFileSync(file, 'utf8'), out = new Set(), re = /^#\d+=(IFC(?:REINFORCINGBAR|PLATE|MECHANICALFASTENER|FASTENER|BUILDINGELEMENTPART))\((.*)\);$/gm; let m;
    while ((m = re.exec(txt)) !== null) { const a = splitAttrs(m[2]); const t = a.length >= 8 ? unq(a[7]) : null; if (t) out.add(t); }
    return out;
  }
  function stepRoots(text) {
    const cls = {}, ids = [], re = /^#\d+=(IFC\w+)\('([0-9A-Za-z_$]{22})',#\d+,/; let i = 0; const n = text.length;
    while (i < n) { let j = text.indexOf('\n', i); if (j < 0) j = n; const m = re.exec(text.substr(i, 140)); if (m) { cls[m[1]] = (cls[m[1]] || 0) + 1; ids.push(m[2]); } i = j + 1; }
    return { cls, ids };
  }
  function parityOne(kind, dbPath, refPath, frameJson, schemaWord) {
    const t0 = Date.now(), db = new SQL.Database(new Uint8Array(fs.readFileSync(dbPath))), tags = refTags(refPath);
    const added = new Set(rowsOf(db, "SELECT guid FROM upgrade_changes WHERE change = 'ADDED'").map((r) => r[0])), sel = new Set(Array.from(tags).filter((t) => added.has(t)));
    const inDbCls = {}; rowsOf(db, 'SELECT ifc_class, COUNT(*) FROM elements_meta WHERE guid IN (' + Array.from(sel).map(() => '?').join(',') + ') GROUP BY 1', Array.from(sel)).forEach((r) => { inDbCls[r[0]] = r[1]; });
    log('§IFC_SEL_S5_INPUT ' + kind + ' reference products carry ' + tags.size + ' distinct element ids; ' + sel.size + ' of them are ADDED rows of the upgraded DB (' + JSON.stringify(inDbCls) + '); frame given=' + !!frameJson);
    if (!sel.size) { inc('S5:' + kind, 'none of the reference file\'s element ids is an ADDED row of the DB: nothing judged'); return; }
    const E = exportCase(db, null, 'S5' + kind, 'IFC2X3', sel, { frame: frameJson });
    if (!E.ok) { ck('S5:' + kind + ':build', false, 'the writer refused: ' + E.why); return; }
    const M = stepRoots(fs.readFileSync(E.file, 'utf8')), R = stepRoots(fs.readFileSync(refPath, 'utf8')), sm = new Set(M.ids), sr = new Set(R.ids);
    const onlyM = M.ids.filter((g) => !sr.has(g)).length, onlyR = R.ids.filter((g) => !sm.has(g)).length, sameCls = eqJson(sortedKeys(M.cls).map((k) => [k, M.cls[k]]), sortedKeys(R.cls).map((k) => [k, R.cls[k]]));
    ck('S5:' + kind + ':CLASSES', sameCls, 'rooted class counts, ' + kind + ': mine ' + JSON.stringify(M.cls) + ' / reference ' + JSON.stringify(R.cls));
    ck('S5:' + kind + ':GLOBALIDS', onlyM === 0 && onlyR === 0 && M.ids.length === R.ids.length && sm.size === M.ids.length, 'GlobalId set, ' + kind + ': mine ' + M.ids.length + ' / reference ' + R.ids.length + ', unique ' + sm.size + ', only in mine ' + onlyM + ', only in reference ' + onlyR);
    const r = cp.spawnSync('python3', [path.join(ROOT, 'modeller', 'tests', 'witness_lodup_ifc_check.py'), E.file, refPath], { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 3600000 });
    if (r.status === 77) { inc('S5:' + kind + ':PY', 'ifcopenshell / numpy not importable: validate, solids, bbox and attributes NOT judged'); return; }
    const out = (r.stdout || '') + (r.stderr || ''), g = (re) => (re.exec(out) || [])[1];
    const bb = /§LODUP_IFC_PY_BBOX products_mine=(\d+) products_oracle=(\d+) compared=(\d+) only_in_mine=(\d+) only_in_oracle=(\d+) no_geometry=(\d+) max_mm=([\d.]+) over_tol=(\d+) tol_mm=\S+ -> (\w+)/.exec(out), at = /§LODUP_IFC_PY_ATTRS products_compared=(\d+) differences=(\d+) declared_text_differences_ignored=(\{[^}]*\}) -> (\w+)/.exec(out), va = /§LODUP_IFC_PY_VALIDATE schema=(\S+) roots=(\d+) validate_errors=(\d+) -> (\w+)/.exec(out), so = /§LODUP_IFC_PY_SOLIDS (\S+)=(\d+) invalid=(\d+)/.exec(out);
    log('§IFC_SEL_S5_PY ' + kind + ' ' + out.split('\n').filter((l) => /§LODUP_IFC_PY_(VALIDATE|SOLIDS|BBOX|ATTRS)/.test(l)).join(' | ').replace(/\s+/g, ' ').slice(0, 900));
    ck('S5:' + kind + ':PY', r.status === 0 && !!bb && !!at && !!va && bb[9] === 'PASS' && at[4] === 'PASS' && va[4] === 'PASS' && +bb[3] > 0 && +bb[7] <= 1 && +bb[8] === 0 && +at[2] === 0, 'python read-back vs the reference add-on file, ' + kind + ': validate errors ' + (va && va[3]) + ', closed solids invalid ' + (so && so[3]) + ' of ' + (so && so[2]) + ', bbox compared ' + (bb && bb[3]) + ' of ' + (bb && bb[1]) + '/' + (bb && bb[2]) + ' (only in mine ' + (bb && bb[4]) + ', only in reference ' + (bb && bb[5]) + ') worst ' + (bb && bb[7]) + ' mm (limit 1), attribute / pset differences ' + (at && at[2]) + ' of ' + (at && at[1]) + ' products');
    log('§IFC_SEL_S5_DONE ' + kind + ' ms=' + (Date.now() - t0));
  }
  function runS5() {
    const E = process.env;
    if (!E.EXPORT_REAL_DB || !E.EXPORT_FRAME_JSON || !E.EXPORT_REF_IFC_REBAR) { inc('S5', 'EXPORT_REAL_DB / EXPORT_FRAME_JSON / EXPORT_REF_IFC_REBAR not set: the parity against the reference add-on files was NOT judged (never PASS)'); return; }
    for (const f of [E.EXPORT_REAL_DB, E.EXPORT_FRAME_JSON, E.EXPORT_REF_IFC_REBAR]) if (!fs.existsSync(f)) { inc('S5', 'an S5 input file does not exist: NOT judged'); return; }
    let frame; try { frame = JSON.parse(fs.readFileSync(E.EXPORT_FRAME_JSON, 'utf8')); } catch (e) { ck('S5:frame', false, 'the frame JSON does not parse'); return; }
    const fv = L.validateFrame(frame); ck('S5:frame', fv.ok, 'the frame JSON passes LodIfc.validateFrame: ' + (fv.ok ? fv.summary.replace(/[^\x20-\x7e]/g, '?').replace(/^[^:,]+/, 'frame') : fv.why));
    parityOne('rebar', E.EXPORT_REAL_DB, E.EXPORT_REF_IFC_REBAR, frame);
    if (E.EXPORT_REF_IFC_GUSSET && fs.existsSync(E.EXPORT_REF_IFC_GUSSET)) { const gdb = E.EXPORT_REAL_DB_GUSSET || E.EXPORT_REAL_DB; if (fs.existsSync(gdb)) parityOne('gusset', gdb, E.EXPORT_REF_IFC_GUSSET, frame); else inc('S5:gusset', 'EXPORT_REAL_DB_GUSSET does not exist'); }
    else inc('S5:gusset', 'EXPORT_REF_IFC_GUSSET not set (optional): the gusset parity was NOT judged');
  }
  return { runFixture, runHhs2d, gidCheck, runS5, HOOK };
};
