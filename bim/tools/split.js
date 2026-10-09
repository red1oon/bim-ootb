// split.js — U3: one IFC per storey (INTERACTIVE-capable, also runs headless). prompts/BIM_UTILITY_KNIFE.md §U3.
(function (g) {
  'use strict';
  const S = g.BIM_STEP || require('./step.js');
  const X = g.BIM_EXTRACT || require('./extract.js');
  const dec = (b) => (typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8').decode(b) : Buffer.from(b).toString('utf8'));
  function splitModel(model, o) {
    const storeys = []; for (const e of model.ents.values()) if (e.type === 'IFCBUILDINGSTOREY') storeys.push(e);
    const parts = [];
    for (const st of storeys) {
      const nm = S.unq(S.args(st)[2]) || ('storey' + st.id);
      const r = X.extractModel(model, { storeyId: st.id, fillings: true });
      if (r.empty) { parts.push({ name: nm, storeyId: st.id, empty: true }); continue; }
      parts.push({ name: nm, storeyId: st.id, bytes: r.bytes, report: r.report });
    }
    const nonEmpty = parts.filter((p) => !p.empty);
    const covered = nonEmpty.reduce((t, p) => t + p.report.selected, 0);
    const all = S.listProducts(model).filter((p) => !/^IFC(BUILDINGSTOREY|BUILDING|SITE)$/.test(p.type)).length;
    return { parts, report: { storeys: storeys.length, files: nonEmpty.length, productsInStoreys: covered, productsTotal: all, verdict: storeys.length === 0 ? 'INCONCLUSIVE' : (nonEmpty.every((p) => p.report.verdict === 'PASS') ? 'PASS' : 'FAIL') } };
  }
  function run(bytes, o) { const model = S.parse(typeof bytes === 'string' ? bytes : dec(bytes)); const r = splitModel(model, o); r.model = model; return r; }
  const api = { run, splitModel };
  g.BIM_SPLIT = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
