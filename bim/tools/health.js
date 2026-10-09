// health.js — U6: IFC health report, counts only, NO invented thresholds (prompts/BIM_UTILITY_KNIFE.md §U6; metric ids follow Dubai metrics_worker M1–M15 where they overlap).
(function (g) {
  'use strict';
  const S = g.BIM_STEP || require('./step.js');
  const dec = (b) => (typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8').decode(b) : Buffer.from(b).toString('utf8'));
  function healthModel(model) {
    const prods = S.listProducts(model), byT = {};
    for (const e of model.ents.values()) (byT[e.type] = byT[e.type] || []).push(e);
    const real = prods.filter((p) => !/^IFC(BUILDINGSTOREY|BUILDING|SITE|SPACE|OPENINGELEMENT)$/.test(p.type));
    const inSet = (types, idx) => { const s = new Set(); types.forEach((t) => (byT[t] || []).forEach((r) => S.refsOf(S.args(r)[idx]).forEach((x) => s.add(x)))); return s; };
    const contained = inSet(['IFCRELCONTAINEDINSPATIALSTRUCTURE'], 4), withPset = inSet(['IFCRELDEFINESBYPROPERTIES'], 4);
    const withMat = inSet(['IFCRELASSOCIATESMATERIAL'], 4), withType = inSet(['IFCRELDEFINESBYTYPE'], 4), withCls = inSet(['IFCRELASSOCIATESCLASSIFICATION'], 4);
    const guid = new Map(); let dup = 0; for (const p of prods) { if (guid.has(p.guid)) dup++; else guid.set(p.guid, 1); }
    const pct = (s) => real.length ? +(100 * real.filter((p) => s.has(p.id)).length / real.length).toFixed(1) : null;
    const m = {
      M1_schema: model.schema, M3_elements: real.length, M4_spatialChain: ['IFCPROJECT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY'].every((t) => (byT[t] || []).length > 0),
      M4_storeys: (byT.IFCBUILDINGSTOREY || []).length, M5_spaces: (byT.IFCSPACE || []).length, M6_classifiedPct: pct(withCls), M7_psetPct: pct(withPset), M8_materialPct: pct(withMat), M12_typedPct: pct(withType),
      M11_quantitySets: (byT.IFCELEMENTQUANTITY || []).length, M13_spaceBoundaries: (byT.IFCRELSPACEBOUNDARY || []).length, M14_orphans: real.filter((p) => !contained.has(p.id)).length, M15_duplicateGuids: dup,
      M10_georef: (byT.IFCMAPCONVERSION || []).length > 0 || (byT.IFCSITE || []).some((s) => S.args(s)[9] !== '$' && S.args(s)[9] !== undefined),
      parseSkipped: model.bad,
    };
    return { metrics: m, verdict: real.length ? 'REPORT' : 'INCONCLUSIVE' };
  }
  function run(bytes) { const model = S.parse(typeof bytes === 'string' ? bytes : dec(bytes)); const r = healthModel(model); r.model = model; r.report = Object.assign({ verdict: r.verdict }, r.metrics); return r; }
  const api = { run, healthModel };
  g.BIM_HEALTH = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
