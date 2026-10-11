// Minimal playable editor on the op log. Spec: witness_log/HYPOTHESES.md "Minimal playable editor on the op log" (U1-U9). Every action is one log entry; the canvas is the dirty-tile backdrop.
(function (root) {
  const S = root.Stack, Br = root.Brush, Bl = root.Blur, T = 64, F = Math.fround, r2 = (x) => Math.round(x * 100) / 100, r4 = (x) => Math.round(x * 1e4) / 1e4, q = (v) => Math.max(0, Math.min(255, Math.floor(v * 255 + 0.5)));
  const LO = root.LayerOps, SO = root.SelectOps, base = (st, o) => (o.op === 'blur' ? Bl.applyOp(st, o) : Br.applyOp(st, o)), applyOp = (st, o) => (LO.apply(st, o) || SO.apply(st, o, base) ? undefined : base(st, o));
  function createEditor(canvas, W) {
    W = W || 1024; const ctx = canvas.getContext('2d'), tn = W / T, tileImg = new ImageData(T, T);
    canvas.width = canvas.height = W;
    let st, D, ops, undo, redo, cur = null; const moveMs = [], flushLog = [], params = { tool: 'hard', layer: 1, color: [0.1, 0.2, 0.6], size: 14, flow: 1, strength: 0.7, sigma: 4 }, listeners = [];
    const emit = () => listeners.forEach((f) => f());
    function paintTiles(list) { const back = D.back, d = tileImg.data;
      for (const t of list) { const tx = t % tn, ty = (t / tn) | 0;
        for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const p = ((ty * T + y) * W + tx * T + x) * 4, o = (y * T + x) * 4, a = back[p + 3];
          if (a > 0) { d[o] = q(F(back[p] / a)); d[o + 1] = q(F(back[p + 1] / a)); d[o + 2] = q(F(back[p + 2] / a)); } else d[o] = d[o + 1] = d[o + 2] = 0; d[o + 3] = q(a); }
        ctx.putImageData(tileImg, tx * T, ty * T); } }
    const allTiles = () => Array.from({ length: tn * tn }, (_, i) => i);
    function build(list) { st = S.newState(W); ops = []; undo = []; redo = []; cur = null; for (const o of list) { applyOp(st, o); ops.push(o); } D = root.Dirty.makeDirty(st); D.full(); paintTiles(allTiles()); emit(); }
    const initial = () => [{ op: 'layer', id: 0, mode: 'normal', opacity: 1, mask: false }, { op: 'fill', layer: 0, c: [1, 1, 1], a: 1 }, { op: 'layer', id: 1, mode: 'normal', opacity: 1, mask: false }];
    function regionCopy(layer, b) { const l = st.L[layer].pix, [x0, y0, x1, y1] = b, w = x1 - x0 + 1, out = new Float32Array(w * (y1 - y0 + 1) * 4); for (let y = y0; y <= y1; y++) out.set(l.subarray((y * W + x0) * 4, (y * W + x1 + 1) * 4), (y - y0) * w * 4); return out; }
    function regionPut(layer, b, data) { const l = st.L[layer].pix, [x0, y0, x1, y1] = b, w = x1 - x0 + 1; for (let y = y0; y <= y1; y++) l.set(data.subarray((y - y0) * w * 4, (y - y0 + 1) * w * 4), (y * W + x0) * 4); }
    const tilesOfBox = (b) => { const set = new Set(); for (let ty = Math.floor(b[1] / T); ty <= Math.floor(b[3] / T); ty++) for (let tx = Math.floor(b[0] / T); tx <= Math.floor(b[2] / T); tx++) set.add(ty * tn + tx); return [...set]; };
    function refresh(list) { for (const t of list) D.renderTile(t); paintTiles(list); }
    // time-sliced drawing for expensive brushes: apply queued dabs within a budget, show them, continue next frame; end() flushes the rest
    function drainSlice(budget) { const done = cur.sb.drain(budget, performance.now.bind(performance)), set = new Set(); for (const pos of done) { const bb = Br.bbox({ op: 'hdab', x: pos[0], y: pos[1], r: cur.o.r + 1 }, W); if (cur.sel) SO.merge(st.L[cur.o.layer].pix, cur.sel.work, st.sel.mask, W, bb); for (const t of tilesOfBox(bb)) set.add(t); } if (set.size) refresh([...set]); }
    function frame() { if (!cur) return; cur.raf = 0; const t0 = performance.now(); drainSlice(8); moveMs.push(performance.now() - t0); if (cur.sb.pending()) cur.raf = requestAnimationFrame(frame); }
    const ed = {
      W, params, moveMs, flushLog, get ops() { return ops; }, get st() { return st; }, get D() { return D; }, onChange: (f) => listeners.push(f),
      reset() { build(initial()); }, canUndo: () => undo.length > 0 && ops.length > 3, canRedo: () => redo.length > 0,
      layers() { return st.order.map((id) => { const l = st.L[id]; return { id, mode: l.mode, opacity: l.hid ? l.keep : l.opacity, hidden: !!l.hid, name: LO.displayName(id, l) }; }); },
      pickColor(x, y) { const c = ed.displayRGBA8(Math.max(0, Math.min(W - 1, Math.floor(x))), Math.max(0, Math.min(W - 1, Math.floor(y)))); return [c[0] / 255, c[1] / 255, c[2] / 255]; },
      exportPSD() { return root.PsdWeb.exportEditorPsd(st, W); },
      exportPNG() { return new Promise((res, rej) => canvas.toBlob((b) => (b ? b.arrayBuffer().then((a) => res(new Uint8Array(a))) : rej(new Error('PNG export failed'))), 'image/png')); },
      begin(x, y) { x = r2(x); y = r2(y); const p = params, l = st.L[p.layer]; if (p.tool === 'pick') { p.color = ed.pickColor(x, y); emit(); return; } if (p.tool === 'select') { if (!cur) { cur = { selDrag: [x, y], pv: null }; emit(); } return; }
        if (!l || cur || l.hid) return;
        const snap = new Float32Array(l.pix), color = p.color.map(r4), flow = r4(p.flow);
        const o = p.tool === 'smudge' ? { op: 'smudge', layer: p.layer, pts: [], r: p.size, s: r4(p.strength) } : p.tool === 'blur' ? { op: 'stroke', layer: p.layer, kind: 'blur', pts: [], r: p.size, s: r4(p.strength) } : { op: 'stroke', layer: p.layer, kind: p.tool === 'soft' ? 'soft' : p.tool === 'erase' ? 'erase' : 'hard', pts: [], r: p.size, c: color, a: flow };
        const sel = st.sel ? SO.shadow(st, p.layer) : null; cur = { o, snap, last: null, tiles: new Set(), box: null, sel };
        if (o.op === 'smudge') { cur.pb = Br.PositionBuilder(o.r, 0.1); cur.sm = Br.SmudgeBuilder(sel ? sel.sh : l, W, o); } else cur.sb = Br.StrokeBuilder(sel ? sel.shSt : st, o);
        ed.move(x, y, true); },
      move(x, y, first) { if (!cur) return; x = r2(x); y = r2(y); if (cur.selDrag) { cur.pv = [x, y]; emit(); return; } const t0 = performance.now(); if (cur.last && cur.last[0] === x && cur.last[1] === y) return; cur.last = [x, y]; cur.o.pts.push([x, y]);
        const sliced = !!cur.sb && !!cur.sb.queue, planned = cur.o.op === 'smudge' ? cur.pb.push(x, y) : sliced ? cur.sb.queue(x, y) : cur.sb.push(x, y);
        for (const pos of planned) { if (cur.o.op === 'smudge') cur.sm.step(pos); const b = Br.bbox({ op: 'hdab', x: pos[0], y: pos[1], r: cur.o.r + 1 }, W); if (cur.sel && !sliced) SO.merge(st.L[cur.o.layer].pix, cur.sel.work, st.sel.mask, W, b); cur.box = cur.box ? [Math.min(cur.box[0], b[0]), Math.min(cur.box[1], b[1]), Math.max(cur.box[2], b[2]), Math.max(cur.box[3], b[3])] : b; if (!sliced) for (const t of tilesOfBox(b)) cur.tiles.add(t); }
        if (sliced) { drainSlice(6); cur.maxPending = Math.max(cur.maxPending || 0, cur.sb.pending()); if (cur.sb.pending() && !cur.raf) cur.raf = requestAnimationFrame(frame); } else if (cur.tiles.size) { refresh([...cur.tiles]); cur.tiles.clear(); }
        if (!first) moveMs.push(performance.now() - t0); },
      end() { if (!cur) return; if (cur.selDrag) { const d = cur; cur = null; if (d.pv) ed.commitSelDrag(d.selDrag, d.pv); else emit(); return; } if (cur.raf) cancelAnimationFrame(cur.raf); if (cur.sb && cur.sb.queue) { const t0 = performance.now(), n = cur.sb.pending(); drainSlice(Infinity); flushLog.push({ pending: n, ms: performance.now() - t0, maxPending: cur.maxPending || 0 }); } const { o, snap, box } = cur; cur = null; if (o.op === 'smudge' && o.pts.length < 2) return;
        const b = box || [0, 0, 0, 0], sw = b[2] - b[0] + 1, before = new Float32Array(sw * (b[3] - b[1] + 1) * 4); for (let y = b[1]; y <= b[3]; y++) before.set(snap.subarray((y * W + b[0]) * 4, (y * W + b[2] + 1) * 4), (y - b[1]) * sw * 4);
        ops.push(o); undo.push({ kind: 'px', layer: o.layer, bbox: b, before, op: o }); redo = []; emit(); },
      get busy() { return !!cur; },
      cancel() { if (!cur) return; if (cur.selDrag) { cur = null; emit(); return; } if (cur.raf) cancelAnimationFrame(cur.raf); const { snap, box, o } = cur; cur = null; if (box) { const pix = st.L[o.layer].pix; for (let y = box[1]; y <= box[3]; y++) pix.set(snap.subarray((y * W + box[0]) * 4, (y * W + box[2] + 1) * 4), (y * W + box[0]) * 4); refresh(tilesOfBox(box)); } },
      addLayer() { const id = Math.max(...st.order) + 1, o = { op: 'layer', id, mode: 'normal', opacity: 1, mask: false }; applyOp(st, o); ops.push(o); undo.push({ kind: 'struct', op: o, inv() { delete st.L[id]; st.order.pop(); st.root.pop(); } }); redo = []; params.layer = id; emit(); },
      setLayer(id, field, value) { const l = st.L[id], o = { op: 'set', layer: id, [field]: field === 'opacity' ? r4(value) : value }, prev = field === 'opacity' ? (l.hid ? l.keep : l.opacity) : l.mode; applyOp(st, o); ops.push(o); undo.push({ kind: 'struct', op: o, inv() { if (field === 'opacity') { if (l.hid) l.keep = prev; else l.opacity = prev; } else l.mode = prev; } }); redo = []; refresh(allTiles()); emit(); },
      structural(o, inv) { applyOp(st, o); ops.push(o); undo.push({ kind: 'struct', op: o, inv }); redo = []; if (st.L[params.layer] === undefined) params.layer = st.order[st.order.length - 1]; D.full(); paintTiles(allTiles()); emit(); },
      delLayer(id) { const l = st.L[id], oi = st.order.indexOf(id), ri = st.root.indexOf(id); ed.structural({ op: 'del', layer: id }, () => { st.L[id] = l; st.order.splice(oi, 0, id); st.root.splice(ri, 0, id); }); },
      moveLayer(id, to) { const from = st.order.indexOf(id); ed.structural({ op: 'mv', layer: id, to }, () => applyOp(st, { op: 'mv', layer: id, to: from })); },
      hideLayer(id, hide) { const v = !hide; ed.structural({ op: 'vis', layer: id, v }, () => applyOp(st, { op: 'vis', layer: id, v: !v })); },
      renameLayer(id, name) { const l = st.L[id], prev = l.name; ed.structural({ op: 'name', layer: id, name }, () => { if (prev === undefined) delete l.name; else l.name = prev; }); },
      get selPreview() { return cur && cur.selDrag && cur.pv ? [cur.selDrag, cur.pv] : null; },
      selOp(o) { const prev = st.sel; applyOp(st, o); ops.push(o); undo.push({ kind: 'struct', noPix: true, op: o, inv() { st.sel = prev; } }); redo = []; emit(); },
      select(kind, x0, y0, x1, y1) { ed.selOp({ op: 'sel', kind, x0, y0, x1, y1 }); }, invertSel() { if (st.sel) ed.selOp({ op: 'sel', kind: 'invert' }); }, clearSel() { if (st.sel) ed.selOp({ op: 'sel', kind: 'none' }); },
      commitSelDrag(a, b) { const c = (v) => Math.max(0, Math.min(W, v)), x0 = c(Math.floor(Math.min(a[0], b[0]))), x1 = c(Math.ceil(Math.max(a[0], b[0]))), y0 = c(Math.floor(Math.min(a[1], b[1]))), y1 = c(Math.ceil(Math.max(a[1], b[1])));
        if (x1 - x0 < 2 || y1 - y0 < 2) ed.clearSel(); else ed.select(params.selShape === 'ellipse' ? 'ellipse' : 'rect', x0, y0, x1, y1); emit(); },
      undo() { if (!ed.canUndo()) return; const e = undo.pop(); ops.pop(); redo.push(e);
        if (e.kind === 'px') { e.after = regionCopy(e.layer, e.bbox); regionPut(e.layer, e.bbox, e.before); refresh(tilesOfBox(e.bbox)); } else { e.inv(); if (st.L[params.layer] === undefined) params.layer = st.order[st.order.length - 1]; if (!e.noPix) { D.full(); paintTiles(allTiles()); } } emit(); },
      redo() { if (!ed.canRedo()) return; const e = redo.pop(); if (e.kind === 'px') { regionPut(e.layer, e.bbox, e.after); refresh(tilesOfBox(e.bbox)); } else { applyOp(st, e.op); if (!e.noPix) { D.full(); paintTiles(allTiles()); } } ops.push(e.op); undo.push(e); emit(); },
      save() { return JSON.stringify({ format: 'psd-oplog-editor', v: 1, W, ops }); },
      load(json) { const j = JSON.parse(json); if (j.format !== 'psd-oplog-editor' || j.v !== 1 || j.W !== W) throw new Error('not an editor log for this canvas size'); build(j.ops); },
      hashes() { return { comp: S.hashF32(S.composite(st)), layers: Object.keys(st.L).map((k) => S.hashF32(st.L[k].pix)) }; },
      displayRGBA8(x, y) { const p = (y * W + x) * 4, b = D.back, a = b[p + 3]; return a > 0 ? [q(F(b[p] / a)), q(F(b[p + 1] / a)), q(F(b[p + 2] / a)), q(a)] : [0, 0, 0, q(a)]; },
    };
    ed.reset(); return ed;
  }
  // pure refold of an op list (no UI): hashes of the result
  function refold(list, W) { const st = S.newState(W || 1024); for (const o of list) applyOp(st, o); return { comp: S.hashF32(S.composite(st)), layers: Object.keys(st.L).map((k) => S.hashF32(st.L[k].pix)) }; }
  root.Editor = { createEditor, refold, applyOp };
})(this);
