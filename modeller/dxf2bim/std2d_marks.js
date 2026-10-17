// ⚠ DO NOT REMOVE — std2d JS port, slice S5a (markings from the model). Spec: bim-ootb prompts/DXF2BIM_MODELLER_LANE.md §L5.1 (c), §L5.6.
// Port of tests/dxf2bim/mark_dx_set.js `std` profile, generalised: N storeys, Node-schema model, no Duplex sheet list. Every marking is derived from the
// model (storey elevations, grid, wall/slab tops, IFC door sizes) and carries `@BY=model`. The Python-side oracle read the same facts back from the drawing;
// here the writer and the marker share the one grid/level object, so they cannot disagree. Unresolvable items are logged `§MARK_GAP`, never filled.
// deriveMarks(R, deps, opts) -> { files: {name: markedDxfText}, log }.  deps = { B (dxf2bim), DxfParser, hashHex, MK (dxf2marks), SHC (dxf2shell_config), SCOPES (std2d_scopes, only for scoped sets) }.
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.Std2dMarks = factory(); })(this, function () {
  'use strict';
  const ELEV_TOL = 0.003, EXT_FACE_TOL = 0.010;
  const FACE = { FRONT: 'minY', REAR: 'maxY', LEFT: 'minX', RIGHT: 'maxX' }, HAXIS = { FRONT: '+X', REAR: '-X', LEFT: '-Y', RIGHT: '+Y', SECTION: '+Y' };   // ELEV_FACES h(x,y) of std2d.js
  const HP = { FRONT: (x, y) => x, REAR: (x, y) => -x, LEFT: (x, y) => -y, RIGHT: (x, y) => y };
  const r3 = v => Number(Number(v).toFixed(3)), mm3 = v => Number((Number(v) * 1000).toFixed(3)), r6 = v => Number(Number(v).toFixed(6));

  function deriveMarks(R, deps, opts) {
    opts = opts || {};
    const M = R.model, grid = R.grid, set = opts.set || 'MODEL', out = {}, log = [], SC = deps.SCOPES;
    const say = s => log.push(s), STD = deps.SHC.STD;
    const files = Object.keys(R.files);
    const viewOf = n => { const m = /_([A-Z0-9_]+)_std\.dxf$/.exec(n); return m ? m[1] : n; };
    const gEl = M.storeys.find(s => s.name === M.grid_storey).elev;
    const levelsOf = () => { const l = M.storeys.filter(s => s.elev >= gEl).map(s => s.elev); if (M.roof_top !== null) l.push(M.roof_top); return l.sort((a, b) => a - b); };
    for (const name of files) {
      let view = viewOf(name), txt = R.files[name], marks = [], scopeSheet = null;
      const sm = /^(FLOOR_[A-Z0-9_]+?)__(KEY|[A-Z0-9_]+)$/.exec(view);   // §L6: a scoped plan sheet: <view>__KEY (annotation + every marking) or <view>__<scope>
      if (sm) { view = sm[1]; scopeSheet = sm[2]; }
      const kind = /^FLOOR_/.test(view) ? 'PLAN' : view === 'ROOF' ? 'ROOF' : view === 'SECTION' ? 'SECTION' : 'ELEV';
      say('== ' + name + ' (' + kind + (scopeSheet ? ', scope ' + scopeSheet : '') + ')');
      if (scopeSheet && scopeSheet !== 'KEY') {   // a wing/zone sheet: the plan role + level + its rectangle + the grid lines drawn on it; every other marking is on the KEY sheet
        const st = R.views.plan.find(v => v.view === view).storey, lv3 = r3(st.elev), sp = R.scoped[view], sh = sp.sheets.find(x => x.name === scopeSheet), E = sp.E;
        const cl = (v, lo, hi) => Number.isFinite(v) ? v : (v < 0 ? lo : hi);
        const rc = [cl(sh.rect[0], E[0], E[1]), cl(sh.rect[1], E[2], E[3]), cl(sh.rect[2], E[0], E[1]), cl(sh.rect[3], E[2], E[3])].map(v => Number(v.toFixed(3)));
        marks.push({ text: '@SET=' + set }, { text: '@VIEW=PLAN' }, { text: '@UNITS=mm' }, { text: '@NAME=' + view + '__' + scopeSheet }, { text: '@LEVEL=' + lv3 }, { text: '@SCOPE=' + scopeSheet + ',' + rc.join(',') });
        const keepX = SC.gridKeep(grid.x, sh.rect[0], sh.rect[2]), keepY = SC.gridKeep(grid.y, sh.rect[1], sh.rect[3]);
        grid.x.filter(g => keepX.has(g[1] * 1000)).forEach(g => marks.push({ text: '@GRIDX=' + g[0], x: mm3(g[1]), y: 0 }));
        grid.y.filter(g => keepY.has(g[1] * 1000)).forEach(g => marks.push({ text: '@GRIDY=' + g[0], x: 0, y: mm3(g[1]) }));
        say('  SCOPE=' + scopeSheet + ' rect=' + rc.join(',') + ' LEVEL=' + lv3 + ' grid ' + keepX.size + 'x' + keepY.size);
        out[name] = deps.MK.writeMarks(txt, marks.map(m => Object.assign({}, m, { text: m.text + ' @BY=model' })));
        continue;
      }
      if (scopeSheet === 'KEY') txt = R.whole[view];   // the markings (WALLTOP handles, tags) are derived on the whole plan: same handles as every scope sheet
      marks.push({ text: '@SET=' + set }, { text: '@VIEW=' + kind }, { text: '@UNITS=mm' }, { text: '@NAME=' + view });
      if (R.wing) marks.push({ text: '@FRAME=' + R.wing.angle + ',' + mm3(R.wing.ox) + ',' + mm3(R.wing.oy) });   // §L1.16: the sheet is drawn in the wing's own frame
      if (scopeSheet === 'KEY') marks.push({ text: '@SCOPE=KEY' });
      if (kind === 'PLAN') {
        const st = R.views.plan.find(v => v.view === view).storey, lv3 = r3(st.elev);
        marks.push({ text: '@LEVEL=' + lv3 }); say('  LEVEL=' + lv3 + '  [FROM_SOURCE_MODEL: storey placement of ' + st.name + ']');
        planWallTop(M, st, lv3, txt, marks, deps, say);
        planDoors(M, st, marks, say);
        grid.x.forEach(g => { marks.push({ text: '@GRIDX=' + g[0], x: mm3(g[1]), y: 0 }); });
        grid.y.forEach(g => { marks.push({ text: '@GRIDY=' + g[0], x: 0, y: mm3(g[1]) }); });
        say('  GRIDX ' + grid.x.map(g => g[0]) + ' GRIDY ' + grid.y.map(g => g[0]) + '  [building grid of the model]');
      } else if (kind === 'ROOF') {
        const rs = R.views.roof; marks.push({ text: '@LEVEL=' + r3(rs.elev) }); say('  LEVEL=' + r3(rs.elev));
        if (M.roof_top === null) say('  §MARK_GAP no @ROOF (no IfcRoof / IfcSlab)'); else marks.push({ text: '@ROOF=' + r3(M.roof_top) });
      } else {
        if (kind === 'SECTION') {
          const xs = grid.x.map(g => g[1]), X = Number(((xs[0] + xs[1]) / 2).toFixed(6)); marks.push({ text: '@CUT=X,' + Number((X * 1000).toFixed(2)) });
          marks.push({ text: '@HAXIS=' + HAXIS.SECTION });
          grid.y.forEach(g => marks.push({ text: '@GRIDH=' + g[0], x: mm3(g[1]), y: 0 }));
        } else {
          marks.push({ text: '@HAXIS=' + HAXIS[view] });
          const ax = (view === 'FRONT' || view === 'REAR') ? 'x' : 'y';
          grid[ax].forEach(g => marks.push({ text: '@GRIDH=' + g[0], x: mm3(ax === 'x' ? HP[view](g[1], 0) : HP[view](0, g[1])), y: 0 }));
          marks.push({ text: '@FACE=' + FACE[view] });
        }
        levelsOf().forEach(z => marks.push({ text: '@Z=' + r3(z), x: 0, y: mm3(z) }));
        if (M.roof_top === null) say('  §MARK_GAP no @ROOF (no IfcRoof / IfcSlab)'); else marks.push({ text: '@ROOF=' + r3(M.roof_top) });
        say('  HAXIS/GRIDH/Z/ROOF from the model');
      }
      out[name] = deps.MK.writeMarks(scopeSheet === 'KEY' ? R.files[name] : txt, marks.map(m => Object.assign({}, m, { text: m.text + ' @BY=model' })), scopeSheet === 'KEY' ? { handleBase: R.scoped[view].maxHandle } : undefined);
      say('  marks=' + marks.length);
    }
    return { files: out, log };
  }

  // L2.5 W1 + L2.6 A: wall tops from the model, per wall where the storey rule does not hold
  function planWallTop(M, st, lv3, txt, marks, deps, say) {
    const sw = M.walls.filter(w => w.storey === st.name);
    if (!sw.length) return;
    const W = sw.map(w => ({ id: w.guid, a: r6(w.x0), b: r6(w.y0), c: r6(w.x1), d: r6(w.y1), z0: r6(w.z0), top: r6(w.z1) })).sort((p, q) => (p.id < q.id ? -1 : 1));
    const SL = M.els.filter(e => e.cls === 'IfcSlab').map(e => ({ id: e.guid, a: r6(e.x0), b: r6(e.y0), c: r6(e.x1), d: r6(e.y1), z0: r6(e.z0) }));
    const E = [Math.min(...W.map(w => w.a)), Math.min(...W.map(w => w.b)), Math.max(...W.map(w => w.c)), Math.max(...W.map(w => w.d))];
    const ext = w => Math.abs(w.a - E[0]) <= EXT_FACE_TOL || Math.abs(w.b - E[1]) <= EXT_FACE_TOL || Math.abs(w.c - E[2]) <= EXT_FACE_TOL || Math.abs(w.d - E[3]) <= EXT_FACE_TOL;
    const pieces = deps.B.run(txt, deps.SHC.STD.MAP_PLAN, deps.SHC.CFG, { DxfParser: deps.DxfParser, hashHex: deps.hashHex, library: [] }).ops.filter(o => o.op_type === 'DXF_WALL' && o.params.rect);
    const inW = (r, w) => r[0] >= w.a - 0.002 && r[1] >= w.b - 0.002 && r[2] <= w.c + 0.002 && r[3] <= w.d + 0.002;
    const res = [];
    W.filter(w => !ext(w)).forEach(w => {
      const above = SL.filter(q => q.z0 > lv3 + ELEV_TOL && Math.min(q.c, w.c) - Math.max(q.a, w.a) > 1e-9 && Math.min(q.d, w.d) - Math.max(q.b, w.b) > 1e-9);
      const u = above.length ? Math.min(...above.map(q => q.z0)) : null, c = u !== null && Math.abs(w.top - u) <= ELEV_TOL;
      const hs = Array.from(new Set(pieces.filter(o => inW(o.params.rect, w)).map(o => o.params.handle)));
      res.push({ w, c, hs });
    });
    const onPlan = res.filter(x => x.hs.length);
    if (onPlan.some(x => x.c)) { marks.push({ text: '@WALLTOP=' + lv3 + ',slab_above' }); say('  WALLTOP=' + lv3 + ',slab_above  [FROM_SOURCE_MODEL: ' + onPlan.filter(x => x.c).length + ' interior walls reach the slab underside]'); }
    const perH = {}, baseOf = {};
    // §L1.24: a wall that starts below (or above) its storey level states its base FROM the model; it also gets the per-handle marking when it reaches the slab (the storey rule would give it base 0)
    onPlan.filter(x => !x.c || Math.abs(x.w.z0 - lv3) > ELEV_TOL).forEach(x => {
      const off = Math.abs(x.w.z0 - lv3) > ELEV_TOL, b = off ? r3(x.w.z0) : undefined;
      x.hs.forEach(h => { const t = r3(x.w.top); if (perH[h] !== undefined && (perH[h] !== t || baseOf[h] !== b)) perH[h] = null; else if (perH[h] !== null) { perH[h] = t; baseOf[h] = b; } });
    });
    Object.keys(perH).sort((a, b) => parseInt(a, 16) - parseInt(b, 16)).forEach(h => {
      if (perH[h] === null) { say('  WALLTOP piece ' + h + ': matches walls with different tops, no marking (gap stays)'); return; }
      const other = onPlan.filter(x => x.c && x.hs.indexOf(h) >= 0 && Math.abs(x.w.top - perH[h]) > ELEV_TOL);
      if (other.length) { say('  WALLTOP piece ' + h + ': also in a confirmed wall with another top, no marking (gap stays)'); return; }
      const bs = baseOf[h] === undefined ? '' : ',' + baseOf[h];
      marks.push({ text: '@WALLTOP=handle:' + h + ',' + perH[h] + bs }); say('  WALLTOP=handle:' + h + ',' + perH[h] + bs + (bs ? '  [base from the model wall z0, not the storey level]' : ''));
    });
    if (!onPlan.length) say('  WALLTOP not written for ' + st.name + ' (no interior wall on this plan)');
  }

  // L2.6 C: door schedule + tags from the IFC OverallWidth/OverallHeight (door_operation)
  function planDoors(M, st, marks, say) {
    const ops = M.door_ops, all = M.els.filter(e => e.cls === 'IfcDoor'), here = all.filter(x => x.storey === st.name), types = Array.from(new Set(here.map(x => x.etype))).sort();
    if (!Object.keys(ops).length) { say('  §MARK_GAP SCHEDULE/TAG not written: no door_operation in the model'); return; }
    types.forEach(t => {
      const sz = Array.from(new Set(all.filter(x => x.etype === t).map(x => ops[x.guid] && ops[x.guid].w != null ? (ops[x.guid].w * 1000).toFixed(1) + 'x' + (ops[x.guid].h * 1000).toFixed(1) : 'none')));
      if (sz.length !== 1 || sz[0] === 'none' || /,/.test(t)) { say('  SCHEDULE ' + t + ': REFUSED, sizes ' + JSON.stringify(sz)); return; }
      const [w, h] = sz[0].split('x').map(Number); marks.push({ text: '@SCHEDULE=' + t + ',door,' + w + ',' + h }); say('  SCHEDULE=' + t + ',door,' + w + ',' + h);
    });
    // §L1.25: two door types at one plan point would be two different @TAG texts at one point (a marking conflict the reader refuses): that point is not tagged
    const at = x => [Number(((x.x0 + x.x1) / 2 * 1000).toFixed(3)), Number(((x.y0 + x.y1) / 2 * 1000).toFixed(3))], ptTypes = {};
    here.forEach(x => { const k = at(x).join(','); (ptTypes[k] = ptTypes[k] || new Set()).add(x.etype); });
    const said = {};
    here.forEach(x => {
      if (types.indexOf(x.etype) < 0) return;
      const p = at(x), k = p.join(',');
      if (ptTypes[k].size > 1) { if (!said[k]) { said[k] = 1; say('  §MARK_GAP TAG door at (' + p[0] + ',' + p[1] + '): types ' + Array.from(ptTypes[k]).sort().join(' / ') + ' differ, not tagged'); } return; }
      marks.push({ text: '@TAG=door,' + x.etype, x: p[0], y: p[1] });
    });
  }
  return { deriveMarks };
});
