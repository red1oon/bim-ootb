// extract.js — U2: pick element(s) out of an IFC, write a standalone valid IFC. INTERACTIVE tool (prompts/BIM_UTILITY_KNIFE.md §U2).
// Witness: W-EX-1 selected==written products, W-EX-2 no dangling #ref, W-EX-3 GlobalIds preserved.
(function (g) {
  'use strict';
  const S = g.BIM_STEP || require('./step.js');
  const enc = (s) => (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s) : Buffer.from(s, 'utf8'));
  const dec = (b) => (typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8').decode(b) : Buffer.from(b).toString('utf8'));
  // attribute index of the "related objects" list per relationship family (identical in IFC2X3 / IFC4 / IFC4X3)
  function relListIdx(t) {
    if (t === 'IFCRELAGGREGATES') return 5;
    if (t === 'IFCRELCONTAINEDINSPATIALSTRUCTURE' || t === 'IFCRELDEFINESBYPROPERTIES' || t === 'IFCRELDEFINESBYTYPE' || t === 'IFCRELDEFINESBYTEMPLATE' || t.startsWith('IFCRELASSOCIATES')) return 4;
    return -1;
  }
  function pick(model, o) {
    const sel = new Set(), want = (o.guids || []).map(String), cls = (o.classes || []).map((c) => c.toUpperCase());
    const nm = (o.nameContains || '').toLowerCase();
    let storeyIds = null;
    if (o.storey || o.storeyId) {
      storeyIds = new Set();
      for (const e of model.ents.values()) if (e.type === 'IFCRELCONTAINEDINSPATIALSTRUCTURE') {
        const a = S.args(e), st = model.ents.get(S.refId(a[5]));
        if (st && (o.storeyId ? st.id === o.storeyId : S.unq(S.args(st)[2]) === o.storey)) S.refsOf(a[4]).forEach((r) => storeyIds.add(r));
      }
    }
    for (const e of model.ents.values()) {
      if (!S.isProduct(e)) continue;
      const a = S.args(e), guid = S.unq(a[0]);
      if (o.ids && o.ids.indexOf(e.id) >= 0) { sel.add(e.id); continue; }
      if (want.length && want.indexOf(guid) >= 0) { sel.add(e.id); continue; }
      if (!want.length && !(o.ids && o.ids.length) && (cls.length || nm || storeyIds)) {
        if (cls.length && cls.indexOf(e.type) < 0) continue;
        if (nm && S.unq(a[2]).toLowerCase().indexOf(nm) < 0) continue;
        if (storeyIds && !storeyIds.has(e.id)) continue;
        sel.add(e.id);
      }
    }
    return sel;
  }

  // ── placement flattening: a kept product may be placed relative to a host (e.g. a door to its wall) that does not travel.
  // IfcLocalPlacement.PlacesObject is [1:1], so an un-owned placement in the file is invalid; compose the chain into one placement.
  function vec(sv) { return refsOfNums(sv); }
  function refsOfNums(sv) { const m = sv.match(/-?\d+\.?\d*(?:[Ee][-+]?\d+)?/g); return m ? m.map(Number) : []; }
  function axisMat(model, apId) {
    const e = model.ents.get(apId); if (!e) return null;
    const a = S.args(e), loc = a[0] && S.isRef(a[0]) ? vec(S.args(model.ents.get(S.refId(a[0])))[0]) : [0, 0, 0];
    const is3 = e.type === 'IFCAXIS2PLACEMENT3D';
    let z = [0, 0, 1], x = [1, 0, 0];
    if (is3) {
      if (a[1] && S.isRef(a[1])) { const v = vec(S.args(model.ents.get(S.refId(a[1])))[0]); if (v.length === 3) z = v; }
      if (a[2] && S.isRef(a[2])) { const v = vec(S.args(model.ents.get(S.refId(a[2])))[0]); if (v.length === 3) x = v; }
    } else if (a[1] && S.isRef(a[1])) { const v = vec(S.args(model.ents.get(S.refId(a[1])))[0]); x = [v[0], v[1], 0]; }
    const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
    const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
    z = nrm(z); const d = dot(x, z); x = nrm([x[0] - d * z[0], x[1] - d * z[1], x[2] - d * z[2]]); const y = cross(z, x);
    return [[x[0], y[0], z[0], loc[0] || 0], [x[1], y[1], z[1], loc[1] || 0], [x[2], y[2], z[2], loc[2] || 0], [0, 0, 0, 1]];
  }
  const mmul = (A, B) => A.map((r, i) => B[0].map((_, j) => r.reduce((s, _v, k) => s + A[i][k] * B[k][j], 0)));
  const fnum = (v) => { let t = String(+v.toFixed(9)); if (/^-?0$/.test(t)) t = '0'; return t.indexOf('.') < 0 && t.indexOf('e') < 0 ? t + '.' : t; };
  function flattenPlacements(model, P, keepOwners, extra) {
    let next = 0; for (const id of model.ents.keys()) if (id > next) next = id;
    const ownerOf = new Map(); for (const e of model.ents.values()) if (S.isProduct(e)) { const pl = S.args(e)[5]; if (pl && S.isRef(pl)) ownerOf.set(S.refId(pl), e.id); }
    const rewritten = new Map(); let n = 0;
    for (const pid of P) {
      const p = model.ents.get(pid), a = S.args(p).slice(), pl0 = a[5]; if (!pl0 || !S.isRef(pl0)) continue;
      const chain = []; let cur = S.refId(pl0);
      while (cur) {
        const pe = model.ents.get(cur); if (!pe || pe.type !== 'IFCLOCALPLACEMENT') break;
        const own = ownerOf.get(cur);
        if (chain.length && keepOwners.has(own)) break;               // reached a placement whose owner travels
        chain.push(pe); const rt = S.args(pe)[0]; cur = rt && S.isRef(rt) ? S.refId(rt) : 0;
      }
      if (chain.length < 2) continue;
      const anchor = cur || 0;
      let M = null;
      for (let k = chain.length - 1; k >= 0; k--) { const rp = S.args(chain[k])[1]; const m = rp && S.isRef(rp) ? axisMat(model, S.refId(rp)) : null; if (!m) { M = null; break; } M = M ? mmul(M, m) : m; }
      if (!M) continue;
      const mk = (type, argstr) => { const id = ++next; extra.set(id, { id, type, a: argstr, _args: null }); return id; };
      const loc = mk('IFCCARTESIANPOINT', '(' + [M[0][3], M[1][3], M[2][3]].map(fnum).join(',') + ')');
      const dz = mk('IFCDIRECTION', '(' + [M[0][2], M[1][2], M[2][2]].map(fnum).join(',') + ')');
      const dx = mk('IFCDIRECTION', '(' + [M[0][0], M[1][0], M[2][0]].map(fnum).join(',') + ')');
      const ap = mk('IFCAXIS2PLACEMENT3D', '#' + loc + ',#' + dz + ',#' + dx);
      const lp = mk('IFCLOCALPLACEMENT', (anchor ? '#' + anchor : '$') + ',#' + ap);
      a[5] = '#' + lp; rewritten.set(pid, a); n++;
    }
    return { rewritten, n };
  }
  function extractModel(model, o) {
    o = o || {};
    const log = [];
    const S0 = pick(model, o);
    if (!S0.size) return { empty: true, report: { selected: 0, verdict: 'INCONCLUSIVE', note: 'nothing matched the selection' } };
    const P = new Set(S0);
    const byType = {}; for (const e of model.ents.values()) (byType[e.type] = byType[e.type] || []).push(e);
    // voids (openings) of picked hosts always travel with them; fillings only if asked
    for (const r of byType.IFCRELVOIDSELEMENT || []) { const a = S.args(r); if (P.has(S.refId(a[4]))) P.add(S.refId(a[5])); }
    if (o.fillings) for (const r of byType.IFCRELFILLSELEMENT || []) { const a = S.args(r); if (P.has(S.refId(a[4]))) P.add(S.refId(a[5])); }
    // spatial ancestors: containment storey -> aggregates up to project
    const A = new Set();
    const rels = []; for (const e of model.ents.values()) if (relListIdx(e.type) >= 0) rels.push(e);
    for (const r of rels) if (r.type === 'IFCRELCONTAINEDINSPATIALSTRUCTURE') {
      const a = S.args(r); if (S.refsOf(a[4]).some((x) => P.has(x))) A.add(S.refId(a[5]));
    }
    let grew = true;
    while (grew) {
      grew = false;
      for (const r of rels) if (r.type === 'IFCRELAGGREGATES') {
        const a = S.args(r), parent = S.refId(a[4]);
        if (!A.has(parent) && S.refsOf(a[5]).some((x) => A.has(x) || P.has(x))) { A.add(parent); grew = true; }
      }
    }
    const proj = (byType.IFCPROJECT || [])[0]; if (proj) A.add(proj.id);
    const extra = new Map(), keepOwners = new Set([...P, ...A]);
    const fl = flattenPlacements(model, P, keepOwners, extra);
    extra.forEach((e, id) => model.ents.set(id, e));
    // rewrite relationships so they list only what travels
    const override = new Map(fl.rewritten), keepRels = [];
    for (const r of rels) {
      const idx = relListIdx(r.type), a = S.args(r).slice();
      const keep = new Set(r.type === 'IFCRELAGGREGATES' ? [...A, ...P] : [...P]);
      const lst = S.refsOf(a[idx]).filter((x) => keep.has(x));
      if (!lst.length) continue;
      if (r.type === 'IFCRELCONTAINEDINSPATIALSTRUCTURE' && !A.has(S.refId(a[5]))) continue;
      if (r.type === 'IFCRELAGGREGATES' && !(A.has(S.refId(a[4])) || P.has(S.refId(a[4])))) continue;
      a[idx] = '(' + lst.map((x) => '#' + x).join(',') + ')';
      override.set(r.id, a); keepRels.push(r.id);
    }
    const roots = [...P, ...A, ...keepRels];
    for (const r of byType.IFCRELVOIDSELEMENT || []) { const a = S.args(r); if (P.has(S.refId(a[4])) && P.has(S.refId(a[5]))) roots.push(r.id); }
    if (o.fillings) for (const r of byType.IFCRELFILLSELEMENT || []) { const a = S.args(r); if (P.has(S.refId(a[4])) && P.has(S.refId(a[5]))) roots.push(r.id); }
    let keepSet = S.closure(model, roots, override);
    // inverse-only attachments that nothing points at: styles, layers, material appearance
    for (let pass = 0; pass < 4; pass++) {
      const before = keepSet.size, add = [];
      for (const e of byType.IFCSTYLEDITEM || []) { const it = S.args(e)[0]; if (S.isRef(it) && keepSet.has(S.refId(it)) && !keepSet.has(e.id)) add.push(e.id); }
      for (const e of byType.IFCMATERIALDEFINITIONREPRESENTATION || []) { const a = S.args(e); if (a[3] && S.isRef(a[3]) && keepSet.has(S.refId(a[3])) && !keepSet.has(e.id)) add.push(e.id); }
      if (add.length) S.closure(model, add, override).forEach((x) => keepSet.add(x));
      if (keepSet.size === before) break;
    }
    // layers: keep only assigned items that travel
    for (const e of byType.IFCPRESENTATIONLAYERASSIGNMENT || []) {
      const a = S.args(e).slice(), items = S.refsOf(a[2]).filter((x) => keepSet.has(x));
      if (items.length) { a[2] = '(' + items.map((x) => '#' + x).join(',') + ')'; override.set(e.id, a); S.closure(model, [e.id], override).forEach((x) => keepSet.add(x)); }
    }
    const out = new Map();
    for (const id of keepSet) { const e = model.ents.get(id); if (!e) continue; if (override.has(id)) out.set(id, { id, type: e.type, a: override.get(id).join(','), _args: null }); else out.set(id, e); }
    // W-EX-2: dangling refs
    let dangling = 0; for (const e of out.values()) for (const r of S.refsOf(e.a)) if (!out.has(r)) dangling++;
    const text = S.write(model.schema, model.header, out, { name: o.outName });
    extra.forEach((e, id) => model.ents.delete(id));
    const outProducts = [...out.values()].filter((e) => S.isProduct(e)).length;
    return {
      text, bytes: enc(text),
      report: { selected: S0.size, withDependencies: P.size, spatialAncestors: A.size, placementsFlattened: fl.n, entitiesIn: model.ents.size, entitiesOut: out.size, dangling, productsOut: outProducts, schema: model.schema,
        verdict: dangling === 0 ? 'PASS' : 'FAIL' },
    };
  }
  function run(bytes, o) { const model = S.parse(typeof bytes === 'string' ? bytes : dec(bytes)); const r = extractModel(model, o); r.model = model; return r; }
  const api = { run, extractModel, pick };
  g.BIM_EXTRACT = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
