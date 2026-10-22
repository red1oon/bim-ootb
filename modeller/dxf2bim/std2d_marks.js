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
  const TOUCH = 1;   // mm: §F7 D15 a swing box and its door's plan extent meet on the opening line (snap-scale tolerance)
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
      if (view === 'PLANE_VIEW') {   // §F7 the view at the plane: a DRAWING (not read back); it states only who it is and its frame
        const mk = [{ text: '@SET=' + set }, { text: '@VIEW=DRAWING' }, { text: '@UNITS=mm' }, { text: '@NAME=' + view }]; if (R.wing) mk.push({ text: '@FRAME=' + R.wing.angle + ',' + mm3(R.wing.ox) + ',' + mm3(R.wing.oy) });
        out[name] = deps.MK.writeMarks(txt, mk.map(m => Object.assign({}, m, { text: m.text + ' @BY=model' }))); say('  DRAWING: not read back'); continue;
      }
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
      if (kind === 'ELEV' && /\n8\nA-WALL-CURT\r?\n/.test(txt)) marks.push({ text: '@LAYER=A-WALL-CURT,elevwall' });   // §F8 D31: only a sheet that draws a set-back curtain wall
      if (kind === 'PLAN' && /A-DOOR-DFLT/.test(txt)) { if (M.doorDefaults && M._doorStd && M.doorDefaults.some(g => txt.indexOf(g) >= 0)) marks.push({ text: '@DEFAULT=door.operation_standard,SINGLE_SWING_' + M._doorStd.side }); marks.push({ text: '@LAYER=A-DOOR-DFLT,opening' }); } if (kind === 'PLAN') ['A-AREA-IDEN', 'A-AREA-IDEN-DFLT'].forEach(l => { if (new RegExp('\\n' + l + '\\r?\\n').test(txt)) marks.push({ text: '@LAYER=' + l + ',ignore' }); });   // §F7 D22: room labels are a drawing, never read back   // §F7 D18: the standard the yellow doors were drawn from
      if (scopeSheet === 'KEY') marks.push({ text: '@SCOPE=KEY' });
      if (kind === 'PLAN') {
        const st = R.views.plan.find(v => v.view === view).storey, lv3 = r3(st.elev);
        marks.push({ text: '@LEVEL=' + lv3 }); say('  LEVEL=' + lv3 + '  [FROM_SOURCE_MODEL: storey placement of ' + st.name + ']');
        planWallMin(txt, marks, deps, say);
        planWallTop(M, st, lv3, txt, marks, deps, say);
        planDoors(M, st, marks, say, txt, deps);
        if (opts.windowSchedule !== false) planWindows(M, st, marks, say, R.log);   // §F8 D24 (opts.windowSchedule=false: test hook, W-WIN-SCHED S4)
        grid.x.forEach(g => { marks.push({ text: '@GRIDX=' + g[0], x: mm3(g[1]), y: 0 }); });
        grid.y.forEach(g => { marks.push({ text: '@GRIDY=' + g[0], x: 0, y: mm3(g[1]) }); });
        say('  GRIDX ' + grid.x.map(g => g[0]) + ' GRIDY ' + grid.y.map(g => g[0]) + '  [building grid of the model]');
      } else if (kind === 'ROOF') {
        const rs = R.views.roof; marks.push({ text: '@LEVEL=' + r3(rs.elev) }); say('  LEVEL=' + r3(rs.elev));
        if (M.roof_top === null) say('  §MARK_GAP no @ROOF (no IfcRoof / IfcSlab)'); else marks.push({ text: '@ROOF=' + r3(M.roof_top) });
      } else {
        if (kind === 'SECTION') {
          const xs = grid.x.map(g => g[1]), X = R.model && Number.isFinite(R.model.sectionX) ? R.model.sectionX : Number(((xs[0] + xs[1]) / 2).toFixed(6)); marks.push({ text: '@CUT=X,' + Number((X * 1000).toFixed(2)) });
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

  // §F6 D11: a plan that draws wall pieces thinner than the set's 50 mm reading limit states the thinnest piece it wants read, FROM the model's own drawn pieces; pieces under 10 mm (the plan merge tolerance, L1.8 S1: tessellation slivers) are not accepted and stay listed
  function planWallMin(txt, marks, deps, say) {
    const cfg0 = deps.SHC.CFG, all = deps.B.run(txt, deps.SHC.STD.MAP_PLAN, Object.assign({}, cfg0, { wall: Object.assign({}, cfg0.wall, { min_thickness: 0 }) }), { DxfParser: deps.DxfParser, hashHex: deps.hashHex, library: [] }).ops.filter(o => o.op_type === 'DXF_WALL' && typeof o.params.thickness === 'number');
    const ts = all.map(o => o.params.thickness).filter(t => t >= 0.010 && t < cfg0.wall.min_thickness);
    if (!ts.length) return;
    const t = Math.floor(Math.min(...ts) * 1000) / 1000;
    marks.push({ text: '@WALLMIN=' + t }); say('  WALLMIN=' + t + '  [FROM_SOURCE_MODEL: thinnest drawn wall piece >= 10 mm; ' + ts.length + ' piece(s) below the ' + cfg0.wall.min_thickness + ' m default]');
  }
  // L2.5 W1 + L2.6 A: wall tops from the model, per wall where the storey rule does not hold
  function planWallTop(M, st, lv3, txt, marks, deps, say) {
    const sw = M.walls.filter(w => w.storey === st.name);
    if (!sw.length) return;
    const W = sw.map(w => ({ id: w.guid, a: r6(w.x0), b: r6(w.y0), c: r6(w.x1), d: r6(w.y1), z0: r6(w.z0), top: r6(w.z1) })).sort((p, q) => (p.id < q.id ? -1 : 1));
    const SL = M.els.filter(e => e.cls === 'IfcSlab').map(e => ({ id: e.guid, a: r6(e.x0), b: r6(e.y0), c: r6(e.x1), d: r6(e.y1), z0: r6(e.z0) }));
    const E = [Math.min(...W.map(w => w.a)), Math.min(...W.map(w => w.b)), Math.max(...W.map(w => w.c)), Math.max(...W.map(w => w.d))];
    const ext = w => Math.abs(w.a - E[0]) <= EXT_FACE_TOL || Math.abs(w.b - E[1]) <= EXT_FACE_TOL || Math.abs(w.c - E[2]) <= EXT_FACE_TOL || Math.abs(w.d - E[3]) <= EXT_FACE_TOL;
    const wm = marks.find(m => /^@WALLMIN=/.test(m.text)), cfgEff = wm ? Object.assign({}, deps.SHC.CFG, { wall: Object.assign({}, deps.SHC.CFG.wall, { min_thickness: Number(wm.text.slice(9)) }) }) : deps.SHC.CFG;   // the plan is read with its own @WALLMIN
    const pieces = deps.B.run(txt, deps.SHC.STD.MAP_PLAN, cfgEff, { DxfParser: deps.DxfParser, hashHex: deps.hashHex, library: [] }).ops.filter(o => o.op_type === 'DXF_WALL' && o.params.rect);
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
    // §3d F6 D7: the plan also DRAWS the walls the cut plane crosses that carry another storey label (CUT_OFFSET 1.2 m as in std2d.js); a drawn piece no labelled wall of this storey covers states the top (and base) of the unique such wall, FROM the model; a piece already covered, or matching walls with different tops, is left exactly as before
    const cutZ = st.elev + 1.2, own = new Set(sw.map(w => w.guid)), covered = new Set(); res.forEach(x => x.hs.forEach(h => covered.add(h)));
    pieces.forEach(o => { if (W.some(w => inW(o.params.rect, w))) covered.add(o.params.handle); });
    const X = M.walls.filter(w => !own.has(w.guid) && w.z0 < cutZ && cutZ < w.z1).map(w => ({ a: r6(w.x0), b: r6(w.y0), c: r6(w.x1), d: r6(w.y1), z0: r6(w.z0), top: r6(w.z1) }));
    const EX = X.concat(W).reduce((e, w) => [Math.min(e[0], w.a), Math.min(e[1], w.b), Math.max(e[2], w.c), Math.max(e[3], w.d)], [Infinity, Infinity, -Infinity, -Infinity]), extX = w => Math.abs(w.a - EX[0]) <= EXT_FACE_TOL || Math.abs(w.b - EX[1]) <= EXT_FACE_TOL || Math.abs(w.c - EX[2]) <= EXT_FACE_TOL || Math.abs(w.d - EX[3]) <= EXT_FACE_TOL;
    const perX = {};
    X.filter(w => !extX(w)).forEach(w => { pieces.filter(o => !covered.has(o.params.handle) && inW(o.params.rect, w)).forEach(o => { const h = o.params.handle, b = Math.abs(w.z0 - lv3) > ELEV_TOL ? r3(w.z0) : undefined, t = r3(w.top); if (perX[h] !== undefined && (perX[h] === null || perX[h].t !== t || perX[h].b !== b)) perX[h] = null; else perX[h] = { t, b }; }); });
    Object.keys(perX).sort((a, b) => parseInt(a, 16) - parseInt(b, 16)).forEach(h => {
      if (perX[h] === null || perH[h] !== undefined || marks.some(m => m.text.indexOf('@WALLTOP=handle:' + h + ',') === 0)) { say('  WALLTOP piece ' + h + ' (wall of another storey label): walls with different tops, no marking (gap stays)'); return; }
      const bs = perX[h].b === undefined ? '' : ',' + perX[h].b;
      marks.push({ text: '@WALLTOP=handle:' + h + ',' + perX[h].t + bs }); say('  WALLTOP=handle:' + h + ',' + perX[h].t + bs + '  [FROM_SOURCE_MODEL: wall crossed by the cut plane, labelled another storey]');
    });
    // §3d F6 D8: an EXTERIOR wall whose base is not the storey level cannot take its height from an elevation rectangle (the reader accepts only rectangles that start at the level): state its top and base FROM the model per drawn piece, as L1.24 does for interior walls; a piece shared by walls with different tops or bases is left alone
    const perE = {};
    W.filter(ext).concat(X.filter(extX)).filter(w => Math.abs(w.z0 - lv3) > ELEV_TOL).forEach(w => { pieces.filter(o => inW(o.params.rect, w)).forEach(o => { const h = o.params.handle, b = r3(w.z0), t = r3(w.top); if (perE[h] !== undefined && (perE[h] === null || perE[h].t !== t || perE[h].b !== b)) perE[h] = null; else perE[h] = { t, b }; }); });
    Object.keys(perE).sort((a, b) => parseInt(a, 16) - parseInt(b, 16)).forEach(h => {
      if (perE[h] === null || marks.some(m => m.text.indexOf('@WALLTOP=handle:' + h + ',') === 0)) { say('  WALLTOP exterior piece ' + h + ': walls with different tops or bases, or already stated, no marking (gap stays)'); return; }
      marks.push({ text: '@WALLTOP=handle:' + h + ',' + perE[h].t + ',' + perE[h].b }); say('  WALLTOP=handle:' + h + ',' + perE[h].t + ',' + perE[h].b + '  [FROM_SOURCE_MODEL: exterior wall base differs from the storey level]');
    });
    // §3d F6 D4: interior curtain bands are on no elevation and the storey rule covers wall layers only: state each band's top (and base) FROM the model's own curtain extent
    const CW = (M.curtains || []).filter(c => c.z0 < cutZ && cutZ < c.z1).map(c => ({ a: r6(c.x0), b: r6(c.y0), c: r6(c.x1), d: r6(c.y1), z0: r6(c.z0), top: r6(c.z1) }));
    const perC = {};
    CW.forEach(w => { pieces.filter(o => o.params.layer && /CURT/i.test(o.params.layer) && inW(o.params.rect, w)).forEach(o => { const h = o.params.handle, b = Math.abs(w.z0 - lv3) > ELEV_TOL ? r3(w.z0) : undefined, t = r3(w.top); if (perC[h] !== undefined && (perC[h].t !== t || perC[h].b !== b)) perC[h] = null; else if (perC[h] !== null) perC[h] = { t, b }; }); });
    Object.keys(perC).sort((a, b) => parseInt(a, 16) - parseInt(b, 16)).forEach(h => {
      if (perC[h] === null || perH[h] !== undefined || perX[h] !== undefined || marks.some(m => m.text.indexOf('@WALLTOP=handle:' + h + ',') === 0)) { say('  WALLTOP curtain piece ' + h + ': ambiguous or already stated, no marking (gap stays)'); return; }
      const bs = perC[h].b === undefined ? '' : ',' + perC[h].b;
      marks.push({ text: '@WALLTOP=handle:' + h + ',' + perC[h].t + bs }); say('  WALLTOP=handle:' + h + ',' + perC[h].t + bs + '  [FROM_SOURCE_MODEL: curtain band extent]');
    });
    if (!onPlan.length) say('  WALLTOP not written for ' + st.name + ' (no interior wall on this plan)');
  }

  // L2.6 C: door schedule + tags from the IFC OverallWidth/OverallHeight (door_operation)
  function planDoors(M, st, marks, say, txt, deps) {
    const ops = M.door_ops, all = M.els.filter(e => e.cls === 'IfcDoor'), here = all.filter(x => x.storey === st.name);
    if (!Object.keys(ops).length) { say('  §MARK_GAP SCHEDULE/TAG not written: no door_operation in the model'); return; }
    // §3d F6 D5: one type name can carry several sizes (HHS: one family, 3-5 sizes); the label then carries the size ("<type> [WxH]") so every door keeps its OWN stated size; a type with one size keeps the plain label
    const szOf = x => ops[x.guid] && ops[x.guid].w != null ? (ops[x.guid].w * 1000).toFixed(1) + 'x' + (ops[x.guid].h * 1000).toFixed(1) : null;
    const sizesOfType = {}; all.forEach(x => { (sizesOfType[x.etype] = sizesOfType[x.etype] || new Set()).add(szOf(x)); });
    const labelOf = x => { const sz = szOf(x), ss = sizesOfType[x.etype]; if (sz === null || ss.has(null) || /[,\[\]]/.test(x.etype)) return null; return ss.size === 1 ? x.etype : x.etype + ' [' + sz + ']'; };
    const labels = Array.from(new Set(here.map(labelOf).filter(l => l !== null))).sort();
    here.filter(x => labelOf(x) === null).forEach(x => say('  SCHEDULE ' + x.etype + ': REFUSED for one door (size not stated or type name has , [ ])'));
    labels.forEach(l => { const x = here.find(d => labelOf(d) === l), [w, h] = szOf(x).split('x').map(Number); marks.push({ text: '@SCHEDULE=' + l + ',door,' + w + ',' + h }); say('  SCHEDULE=' + l + ',door,' + w + ',' + h); });
    // §L1.25: two door labels at one plan point would be two different @TAG texts at one point (a marking conflict the reader refuses): that point is not tagged
    const at = x => [Number(((x.x0 + x.x1) / 2 * 1000).toFixed(3)), Number(((x.y0 + x.y1) / 2 * 1000).toFixed(3))], ptTypes = {};
    here.forEach(x => { const k = at(x).join(','); (ptTypes[k] = ptTypes[k] || new Set()).add(labelOf(x)); });
    // §3d F6 D6: the tag must fall in the door's DRAWN swing box (the reader's rule); the model's bbox centre can lie on the other side of the wall line (HHS: 143 mm off, 30 doors untagged). The drawn doors are read back from this very sheet; a tag outside every swing box moves to the centre of the unique nearest box within one leaf width, else it stays
    const drawn = deps.B.run(txt, deps.SHC.STD.MAP_PLAN, deps.SHC.CFG, { DxfParser: deps.DxfParser, hashHex: deps.hashHex, library: [] }).ops.filter(o => o.op_type === 'DXF_OPENING' && o.params.kind === 'door' && o.params.hinge).map(o => { const P = o.params, H = P.hinge, pts = [H].concat([P.swing_start_deg, P.swing_end_deg].map(a => [H[0] + P.width * Math.cos(a * Math.PI / 180), H[1] + P.width * Math.sin(a * Math.PI / 180)])); const xs = pts.map(q => q[0] * 1000), ys = pts.map(q => q[1] * 1000); return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), w: P.width * 1000 }; });
    const touches = (b, x) => b.x0 <= x.x1 * 1000 + TOUCH && b.x1 >= x.x0 * 1000 - TOUCH && b.y0 <= x.y1 * 1000 + TOUCH && b.y1 >= x.y0 * 1000 - TOUCH;   // §F7 D15: a swing box hinges on its door's own opening line, so it touches the door's plan extent
    const moved = (p, x) => { if (drawn.some(b => p[0] >= b.x0 && p[0] <= b.x1 && p[1] >= b.y0 && p[1] <= b.y1)) return p; const cand = drawn.map(b => ({ b, d: Math.hypot(Math.max(b.x0 - p[0], 0, p[0] - b.x1), Math.max(b.y0 - p[1], 0, p[1] - b.y1)) })).filter(c => c.d <= c.b.w && touches(c.b, x)).sort((a, c) => a.d - c.d); if (!cand.length || (cand.length > 1 && cand[1].d - cand[0].d < 1)) return p; const b = cand[0].b; return [Number(((b.x0 + b.x1) / 2).toFixed(3)), Number(((b.y0 + b.y1) / 2).toFixed(3))]; };
    const said = {}, finalAt = {}, pend = [];
    here.forEach(x => {
      const l = labelOf(x); if (l === null) return;
      const p = moved(at(x), x), k = at(x).join(',');
      if (ptTypes[k].size > 1) { if (!said[k]) { said[k] = 1; say('  §MARK_GAP TAG door at (' + p[0] + ',' + p[1] + '): types ' + Array.from(ptTypes[k]).sort().join(' / ') + ' differ, not tagged'); } return; }
      const fk = p.join(','); (finalAt[fk] = finalAt[fk] || new Set()).add(l); pend.push({ l, p, fk });
    });
    // §F7 D15 safety: two different labels at one FINAL point (after the move) are the same conflict as §L1.25: neither is tagged, stated
    pend.forEach(t => { if (finalAt[t.fk].size > 1) { if (!said['f' + t.fk]) { said['f' + t.fk] = 1; say('  §MARK_GAP TAG door at (' + t.p[0] + ',' + t.p[1] + '): moved tags ' + Array.from(finalAt[t.fk]).sort().join(' / ') + ' meet, not tagged'); } return; } marks.push({ text: '@TAG=door,' + t.l, x: t.p[0], y: t.p[1] }); });
  }
  // §F8 D24: the window schedule + tags. Size from what the writer drew: w = the gap cut along the wall (§OPENING along), h = the window's own z extent, sill = z0 minus the
  // storey elevation (mm, 0.1). A type with one size keeps its name as the label, else "<type> [WxH S<sill>]" (as doors D5). A window with no gap, or a type name with , [ ] is refused, stated.
  function planWindows(M, st, marks, say, rlog) {
    const along = {};
    rlog.forEach(l => { if (l.indexOf('§OPENING ') !== 0 || l.indexOf('cls=IfcWindow') < 0 || / pos=above /.test(l)) return; const g = /guid=(\S+)/.exec(l)[1];
      const a = /along=\(([-\d.]+),([-\d.]+)\)/.exec(l) || /along=([-\d.]+)\.\.([-\d.]+)/.exec(l); if (a) along[g] = Math.abs(+a[2] - +a[1]); });
    const here = M.els.filter(e => e.cls === 'IfcWindow' && e.storey === st.name && along[e.guid] !== undefined && Number.isFinite(e.z0) && Number.isFinite(e.z1));
    if (!here.length) return;
    const szOf = x => along[x.guid].toFixed(1) + 'x' + ((x.z1 - x.z0) * 1000).toFixed(1) + ' S' + ((x.z0 - st.elev) * 1000).toFixed(1);
    const sizes = {}; M.els.filter(e => e.cls === 'IfcWindow' && along[e.guid] !== undefined).forEach(x => { (sizes[x.etype] = sizes[x.etype] || new Set()).add(szOf(x)); });
    here.forEach(x => { if (!sizes[x.etype]) (sizes[x.etype] = new Set()).add(szOf(x)); });
    const labelOf = x => /[,\[\]]/.test(x.etype || '') || !x.etype ? null : sizes[x.etype].size === 1 ? x.etype : x.etype + ' [' + szOf(x) + ']';
    here.filter(x => labelOf(x) === null).forEach(x => say('  SCHEDULE window ' + x.guid + ': REFUSED (no type name, or it has , [ ])'));
    const labels = Array.from(new Set(here.map(labelOf).filter(l => l !== null))).sort();
    labels.forEach(l => { const x = here.find(w => labelOf(w) === l), m = /^([\d.]+)x([\d.]+) S(-?[\d.]+)$/.exec(szOf(x)); marks.push({ text: '@SCHEDULE=' + l + ',window,' + Number(m[1]) + ',' + Number(m[2]) + ',' + Number(m[3]) }); say('  SCHEDULE=' + l + ',window,' + m[1] + ',' + m[2] + ',' + m[3]); });
    const at = x => [Number(((x.x0 + x.x1) / 2 * 1000).toFixed(3)), Number(((x.y0 + x.y1) / 2 * 1000).toFixed(3))], pt = {};
    here.forEach(x => { const l = labelOf(x); if (l === null) return; const k = at(x).join(','); (pt[k] = pt[k] || new Set()).add(l); });
    const said = {};
    here.forEach(x => { const l = labelOf(x); if (l === null) return; const p = at(x), k = p.join(',');
      if (pt[k].size > 1) { if (!said[k]) { said[k] = 1; say('  §MARK_GAP TAG window at (' + p[0] + ',' + p[1] + '): types ' + Array.from(pt[k]).sort().join(' / ') + ' differ, not tagged'); } return; }
      if (said['d' + k]) return; said['d' + k] = 1; marks.push({ text: '@TAG=window,' + l, x: p[0], y: p[1] }); });
  }
  return { deriveMarks };
});
