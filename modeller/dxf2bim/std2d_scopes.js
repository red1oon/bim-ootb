// ⚠ DO NOT REMOVE — std2d scoped sets (lane spec §L6). A large building drawn as a series: one KEY sheet per storey (grid, dimensions, levels, markings = the annotation)
// + one SCOPE sheet per wing/zone (the elements it OWNS, each drawn whole, with the grid lines of its range, a match line to every neighbour and a title). Every sheet is a
// serialisation of the SAME whole-storey document (same entity handles), so assembling the sheets back is a union by handle and reproduces the whole plan exactly (witness_scopes.js).
// Ownership: the scope containing the centre of the element's plan bbox (an opening follows its host wall); half-open [lo, hi); an element in no stated rectangle goes to the implicit REST scope.
// Pure: no DOM, no DB. Spec: bim-ootb prompts/DXF2BIM_MODELLER_LANE.md §L6.
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.Std2dScopes = factory(); })(this, function () {
  'use strict';
  const BUDGET = 250;           // §L6.1 drawn elements per scope sheet (stated constant) before "Suggest" splits
  const MAX_DEPTH = 6;
  const OPEN = ['IfcDoor', 'IfcWindow'];

  function centreOf(model, guid) {   // mm
    let e = model.by_guid[guid]; if (!e) return null;
    if (OPEN.indexOf(e.cls) >= 0 && model.host_all && model.host_all[guid] && model.by_guid[model.host_all[guid]]) e = model.by_guid[model.host_all[guid]];
    return [(e.x0 + e.x1) / 2 * 1000, (e.y0 + e.y1) / 2 * 1000];
  }
  function scopeAt(scopes, c) {
    for (const s of scopes) if (c[0] >= s.rect[0] && c[0] < s.rect[2] && c[1] >= s.rect[1] && c[1] < s.rect[3]) return s.name;
    return 'REST';
  }
  function ownersOf(model, doc, scopes) {   // guid -> scope name, for every guid the document draws
    const out = {}; doc.meta.forEach(m => { if (m.guid && !(m.guid in out)) { const c = centreOf(model, m.guid.split(',')[0]); out[m.guid] = c ? scopeAt(scopes, c) : 'REST'; } });
    return out;
  }
  const num = v => (Number.isFinite(v) ? Number(v.toFixed(3)) : v);

  // labels of the grid lines a rect spans -> "1-6" / "A-F" ("3" for one line, "" for none)
  function span(lines, lo, hi) {
    const L = lines.filter(g => g[1] * 1000 >= lo && g[1] * 1000 < hi).map(g => g[0]);
    return !L.length ? '' : L.length === 1 ? L[0] : L[0] + '-' + L[L.length - 1];
  }
  function nameOf(grid, r, used) {   // sheet-name safe ([A-Z0-9_]): X1TO6_YATOF
    const sx = span(grid.x, r[0], r[2]), sy = span(grid.y, r[1], r[3]);
    let n = ((sx ? 'X' + sx : '') + (sx && sy ? '_' : '') + (sy ? 'Y' + sy : '')).replace(/-/g, 'TO').replace(/[^A-Za-z0-9_]/g, '').toUpperCase() || 'WING';
    let k = n, i = 2; while (used.has(k)) k = n + '_' + i++; used.add(k); return k;
  }

  // §L6.1 Suggest: recursive bisection along the grid line nearest the median of the element centres of the busiest storey, alternating to the longer side, until every
  // scope holds <= budget drawn elements in every storey (or no grid line lies inside, or depth MAX_DEPTH). Deterministic. Returns [{name, rect:[x0,y0,x1,y1] mm, counts:{storey:n}}].
  function suggest(R, budget) {
    budget = budget || BUDGET; const M = R.model, grid = R.grid, byStorey = {};
    const planNames = R.views.plan.map(v => v.storey.name);
    M.els.forEach(e => {
      if (!e.storey || planNames.indexOf(e.storey) < 0) return;
      if (['IfcWall', 'IfcWallStandardCase', 'IfcDoor', 'IfcWindow', 'IfcColumn'].indexOf(e.cls) < 0) return;
      const c = centreOf(M, e.guid); if (c) (byStorey[e.storey] = byStorey[e.storey] || []).push(c);
    });
    const all = [].concat(...Object.values(byStorey)); if (!all.length) return [];
    const ex = [Math.min(...all.map(c => c[0])) - 1, Math.min(...all.map(c => c[1])) - 1, Math.max(...all.map(c => c[0])) + 1, Math.max(...all.map(c => c[1])) + 1];
    const inR = (c, r) => c[0] >= r[0] && c[0] < r[2] && c[1] >= r[1] && c[1] < r[3];
    const leaves = [];
    (function split(r, depth) {
      const cnt = {}; Object.keys(byStorey).forEach(s => { cnt[s] = byStorey[s].filter(c => inR(c, r)).length; });
      const worst = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a] || (a < b ? -1 : 1))[0], n = cnt[worst];
      if (n <= budget || depth >= MAX_DEPTH) { leaves.push({ rect: r, counts: cnt }); return; }
      const pts = byStorey[worst].filter(c => inR(c, r)), xs = pts.map(c => c[0]), ys = pts.map(c => c[1]);
      const ax = (Math.max(...xs) - Math.min(...xs)) >= (Math.max(...ys) - Math.min(...ys)) ? 0 : 1, vals = (ax === 0 ? xs : ys).slice().sort((a, b) => a - b), med = vals[Math.floor(vals.length / 2)];
      const lo = vals[0], hi = vals[vals.length - 1];
      const cand = (ax === 0 ? grid.x : grid.y).map(g => g[1] * 1000).filter(p => p > lo && p < hi);
      if (!cand.length) { leaves.push({ rect: r, counts: cnt }); return; }
      const cut = cand.sort((a, b) => Math.abs(a - med) - Math.abs(b - med) || a - b)[0];
      const a = r.slice(), b = r.slice(); a[ax + 2] = cut; b[ax] = cut;
      split(a, depth + 1); split(b, depth + 1);
    })(ex, 0);
    const used = new Set();
    return leaves.map(l => ({ name: nameOf(grid, l.rect, used), rect: l.rect.map(num), counts: l.counts }));
  }

  // grid lines to show on a scope sheet: those inside the rect + the nearest one beyond each side (one bay)
  function gridKeep(lines, lo, hi) {
    const ps = lines.map(g => g[1] * 1000).sort((a, b) => a - b), keep = new Set(ps.filter(p => p >= lo && p < hi));
    const below = ps.filter(p => p < lo).pop(), above = ps.filter(p => p >= hi)[0];
    if (below !== undefined) keep.add(below); if (above !== undefined) keep.add(above);
    return keep;
  }

  // Split one whole-storey document. ctx: { model, grid, storey, view, E:[x0,x1,y0,y1] mm storey envelope, scopes, sheetPrefix }. Adds the scope extras (title, match lines) to the doc AFTER the
  // caller has serialised the whole plan. Returns { owners, key: text, sheets:[{name, rect, owned, text}], unowned }.
  function split(doc, ctx) {
    const scopes = ctx.scopes.slice(), owners = ownersOf(ctx.model, doc, scopes), names = scopes.map(s => s.name);
    doc.layers = Object.assign({}, doc.layers, { 'A-ANNO-MATCH': [1, 18, 'DASHED'] });   // only the scoped sheets carry the match-line layer; the whole-plan output is unchanged
    const ownedBy = {}; Object.keys(owners).forEach(g => { (ownedBy[owners[g]] = ownedBy[owners[g]] || []).push(g); });
    const hasRest = !!ownedBy.REST; if (hasRest) scopes.push({ name: 'REST', rect: [-Infinity, -Infinity, Infinity, Infinity] });
    const live = scopes.filter(s => (ownedBy[s.name] || []).length);
    const E = ctx.E, T = (txt, p, h, o) => doc.text('A-ANNO-NOTE', txt, p, h, o);
    const extras = {};   // scope name -> [meta index]
    live.forEach(s => {
      extras[s.name] = []; const mark = () => extras[s.name].push(doc.meta.length - 1);
      const [x0, y0, x1, y1] = s.rect, cx0 = Math.max(x0, E[0]), cx1 = Math.min(x1, E[1]), cy0 = Math.max(y0, E[2]), cy1 = Math.min(y1, E[3]);
      const neigh = (px, py) => scopeAt(live, [px, py]);
      const edges = [[x0 > E[0] + 1 && Number.isFinite(x0), 'W'], [x1 < E[1] - 1 && Number.isFinite(x1), 'E'], [y0 > E[2] + 1 && Number.isFinite(y0), 'S'], [y1 < E[3] - 1 && Number.isFinite(y1), 'N']];
      edges.forEach(([on, side]) => {
        if (!on) return;
        const v = side === 'W' ? x0 : side === 'E' ? x1 : side === 'S' ? y0 : y1, vert = side === 'W' || side === 'E';
        const a = vert ? [v, cy0] : [cx0, v], b = vert ? [v, cy1] : [cx1, v], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const across = vert ? [v + (side === 'W' ? -50 : 50), mid[1]] : [mid[0], v + (side === 'S' ? -50 : 50)], who = neigh(across[0], across[1]);
        doc.line('A-ANNO-MATCH', a, b, { linetype: 'DASHED' }); mark();
        T('MATCH LINE - SEE ' + who, [mid[0] + (vert ? (side === 'W' ? 150 : -150) : 0), mid[1] + (vert ? 0 : (side === 'S' ? 150 : -150))], 2 * 100, { align: 'MIDDLE_CENTER', rot: vert ? 90 : 0 }); mark();
      });
      T(`${ctx.storey.name.toUpperCase()} PLAN - SCOPE ${s.name}`, [(cx0 + cx1) / 2, cy0 - 3000], 5 * 100, { align: 'MIDDLE_CENTER' }); mark();
    });
    const keepX = {}, keepY = {};
    live.forEach(s => { keepX[s.name] = gridKeep(ctx.grid.x, s.rect[0], s.rect[2]); keepY[s.name] = gridKeep(ctx.grid.y, s.rect[1], s.rect[3]); });
    const inExtra = (i, n) => extras[n].indexOf(i) >= 0;
    const isExtra = i => Object.keys(extras).some(n => inExtra(i, n));
    const gridOk = (m, n) => m.grid && (m.grid.axis === 'x' ? keepX[n].has(m.grid.pos) : keepY[n].has(m.grid.pos));
    const maxHandle = doc.h - 1;   // every handle of every sheet (whole plan + scope extras) is <= this
    const key = doc.toString((m, i) => !isExtra(i) && !m.guid);   // annotation: grid, dimensions, level/title texts (marks are added by the marker)
    const sheets = live.map(s => ({ name: s.name, rect: s.rect.map(num), owned: ownedBy[s.name].length,
      text: doc.toString((m, i) => (m.guid && owners[m.guid] === s.name) || gridOk(m, s.name) || inExtra(i, s.name)) }));
    return { owners, key, sheets, E, maxHandle, unowned: 0, rest: hasRest, names };
  }
  return { BUDGET, suggest, split, ownersOf, centreOf, scopeAt, nameOf, gridKeep };
});
