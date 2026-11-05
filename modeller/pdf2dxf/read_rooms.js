// Implements prompts/PDF2BIM_VECTOR_PROBE.md §41 — port of scripts/pdf2bim/read_rooms.py (§36: rooms on THIS drawing: each preset room's cell at this run's grid, its tag found in it, the printed area compared with what is expected there). Pure; UMD: window.Pdf2DxfRooms.
// run(model, R, Tm, glyphs, emitLog) -> {rosetta, log}. R is the effective dictionary from fill_blanks; the returned dictionary carries the rooms read.
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(require('./py_rt.js'), require('./type_template.js'), require('./tag_reader.js')); else root.Pdf2DxfRooms = factory(root.Pdf2DxfRt, root.Pdf2DxfTT, root.Pdf2DxfTR); })(typeof self !== 'undefined' ? self : this, function (RT, TT, TR) {
  'use strict';
  const { I, T: Tp, fixed, pyRound, pyRoundInt } = RT;
  function run(model, R0, Tm, glyphs, emitLog) {
    const R = RT.deepcopy(R0); const L = []; const lg = (...a) => L.push(['§ROOMS'].concat(a.map(RT.str)).join(' ')); const pr = s => L.push(s);
    const RTg = Tm.ruler.room_tag; const K = R.sheet.mm_per_pt_fitted; const gx = R.grid.x, gy = R.grid.y;
    const page = model.pages[String(Tm.sheets.plan)]; const P = TT.stroked_paths(page); const [xa, y5] = TT.plan_origin(model, R, Tm); const W = TT.words(page);
    const B = TT.room_tags(P, Tm, K, TT.plan_frame(W, R, Tm)); lg('tags found', I(B.length), 'rooms preset', I(R.rooms.length));
    if (!B.length) lg('no tag box on the plan: areas only from the text layer');
    const [A, stray] = TT.assign_tags(B, R, xa, y5, K);
    for (const b of stray) lg('FINDING a tag in no preset cell at mm', I(pyRoundInt(b.cx)), I(pyRoundInt(b.cy)));
    const G = TT.load_glyphs(Tm, glyphs); const pw = TT.porch_width(emitLog || []);
    const nom = R.rooms.map(r => ('printed_nominal' in r) ? r.printed_nominal : r.printed_sqm); const n = new Map([['READ', 0], ['FINDING', 0], ['DEFAULT', 0]]);
    const f2 = v => fixed(+v, 2);
    R.rooms.forEach((r, ri) => {
      const nv = nom[ri]; const [ex, ey] = TT.room_extent(r, R); const dy = I(+ey[1] - +ey[0]); let dx;
      if (ex !== null) dx = I(+ex[1] - +ex[0]);
      else { dx = TT.decide(L, 'room_width_' + r.name.replace(/ /g, '_'), pw, { nominal: r.x_mm, tol_mm: Tm.ruler.grid_tol_mm }, 'the two A-COLS column centres', Tm.ruler.grid_module_mm).value; r.x_mm = dx; }
      const cell = f2(+dx * +dy / 1e6); const tags = A.get(r.name); let st = 'DEFAULT', val = null, note = '';
      const tw = [];
      W.forEach((w, i) => {
        if (/^\d+\.\d\d$/.test(w[0]) && i + 1 < W.length && ['m2', 'sqm', 'm²'].indexOf(W[i + 1][0].toLowerCase()) >= 0) {
          const mx = (w[1] - xa) * K, my = (w[2] - y5) * K;
          if ((ex === null || (+ex[0] <= mx && mx <= +ex[1])) && +ey[0] <= my && my <= +ey[1] && (ex !== null || Math.abs(mx - (+gx.get('C') + +gx.get('D')) / 2) <= (+gx.get('D') - +gx.get('C')) / 2)) tw.push(w[0]);
        }
      });
      const setRec = () => { n.set(st, n.get(st) + 1); r.printed_nominal = nv; r.printed_sqm = val; r.printed_status = st; r.cell_sqm = parseFloat(cell); };
      if (tw.length === 1) {
        val = parseFloat(tw[0]); st = tw[0] === cell ? 'READ' : 'FINDING'; note = 'text layer'; setRec();
        pr(['§ROOM', st, 'printed', val, 'cell', cell, 'dx', dx, 'dy', dy, '|', r.name, '|', note].map(RT.str).join(' ')); pr(['§PDF R1', r.name, 'area', cell, 'printed', val, st === 'READ' ? 'MATCH' : 'MISMATCH'].map(RT.str).join(' ')); return;
      }
      if (tags.length !== 1) { note = 'FINDING cell holds ' + tags.length + ' tags'; lg(note, '|', r.name); }
      else if (tags[0].xm === null) note = 'no divider in the tag';
      else {
        const b = tags[0]; const cands = new Set(nom.filter(v => v !== null && v !== undefined).map(f2)); cands.add(cell);
        const xs = [], ys = []; for (const a of gx.values()) for (const c of gx.values()) if (+a < +c && +a <= b.cx && b.cx <= +c) xs.push(Tp(a, c)); for (const a of gy.values()) for (const c of gy.values()) if (+a < +c && +a <= b.cy && b.cy <= +c) ys.push(Tp(a, c));
        const rect = new Map(); for (const x of xs) for (const y of ys) rect.set(f2((+x[1] - +x[0]) * (+y[1] - +y[0]) / 1e6), [x, y]); for (const k of rect.keys()) cands.add(k);
        const c = TR.choose(TT.cell_ink(P, TT.area_cell(b), Tm, K), [...cands].sort(), G, RTg.read_max_mm, RTg.margin_mm);
        note = 'best ' + RT.str(c.best === undefined ? null : c.best) + ' ' + RT.str(c.score) + ' next ' + RT.str(c.next) + ' ' + RT.str(c.next_score) + ' candidates ' + cands.size;
        if (c.value !== null) { val = parseFloat(c.value); st = c.value === cell ? 'READ' : 'FINDING'; if (st === 'FINDING' && rect.has(c.value)) note += ' also fits the grid rectangle ' + RT.str(rect.get(c.value)[0]) + ' x ' + RT.str(rect.get(c.value)[1]); }
      }
      setRec();
      pr(['§ROOM', st, 'printed', val, 'cell', cell, 'dx', dx, 'dy', dy, '|', r.name, '|', note].map(RT.str).join(' '));
      pr(['§PDF R1', r.name, 'area', cell, 'printed', val, st === 'READ' ? 'MATCH' : (st === 'FINDING' ? 'MISMATCH' : 'NOT_MADE_OUT')].map(RT.str).join(' '));
    });
    lg('RESULT', new Map([...n].map(([k, v]) => [k, I(v)])), 'stray', I(stray.length), 'wrote rosetta.effective.json');
    return { rosetta: R, log: L };
  }
  return { run };
});
