// Checkpoints for the editor: raw float32 layer pixels + metadata, content-checked, keyed by the log's hash-chain head. Spec: witness_log/HYPOTHESES.md "Level 1e" (K1-K8).
(function (root) {
  const node = typeof require !== 'undefined', S = node ? require('../stack.js') : root.Stack, HO = node ? require('./history_ops.js') : root.HistoryOps, SO = node ? require('./select_ops.js') : root.SelectOps, FS = node ? require('../perf/fastsha.js') : root.FastSha;
  const sumOf = (f32) => FS.sha256(new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength));
  function snapshot(st, ops, k) {
    if (st.hasTree || Object.keys(st.G).length || Object.keys(st.A).length) throw new Error('checkpoint: groups/adjustments are not supported'); const layers = {}, bufs = [];
    for (const id of st.order) { const l = st.L[id]; if (l.mask) throw new Error('checkpoint: masks are not supported'); layers[id] = { mode: l.mode, opacity: l.opacity, hid: !!l.hid, keep: l.keep, name: l.name, parent: l.parent, clip: !!l.clip }; bufs.push(new Float32Array(l.pix)); }
    const sel = st.sel ? { kind: st.sel.kind, box: st.sel.box.slice(), inv: !!st.sel.inv } : null;
    return { v: 1, k, W: st.W, head: HO.head(ops.slice(0, k)), meta: { order: st.order.slice(), root: st.root.slice(), layers, sel }, bufs, sums: bufs.map(sumOf) };
  }
  function usable(ck, ops, opt = {}) {
    if (!ck || ck.v !== 1) throw new Error('not a checkpoint'); if (ck.k > ops.length) throw new Error('checkpoint is ahead of the log (k ' + ck.k + ' > ' + ops.length + ')');
    if (HO.head(ops.slice(0, ck.k)) !== ck.head) throw new Error('log head mismatch: entries before ' + ck.k + ' differ from the checkpoint');
    for (let i = ck.k; i < ops.length; i++) if (ops[i].op === 'amend' && ops[i].i < ck.k) throw new Error('an amend at entry ' + (i + 1) + ' rewrites entry ' + (ops[i].i + 1) + ' before the checkpoint');
    if (ck.bufs.length !== ck.meta.order.length) throw new Error('buffer count mismatch');
    if (opt.verify !== false) ck.bufs.forEach((b, i) => { if (!(b instanceof Float32Array) || b.length !== ck.W * ck.W * 4) throw new Error('buffer ' + i + ' has the wrong size'); if (sumOf(b) !== ck.sums[i]) throw new Error('buffer ' + i + ' fails its sha256 (corrupt)'); });
    return true;
  }
  function resume(ck, ops, applyOp, W, blobs) {
    if (ck.W !== W) throw new Error('canvas size differs'); const st = S.newState(W); st.blobs = blobs;
    ck.meta.order.forEach((id, i) => { S.apply(st, { op: 'layer', id, mode: 'normal', opacity: 1, mask: false }); const l = st.L[id], m = ck.meta.layers[id]; l.mode = m.mode; l.opacity = m.opacity; if (m.hid) { l.hid = true; l.keep = m.keep; } if (m.name !== undefined) l.name = m.name; l.pix.set(ck.bufs[i]); });
    st.order = ck.meta.order.slice(); st.root = ck.meta.root.slice();
    if (ck.meta.sel) { const s = ck.meta.sel, b = s.box; SO.apply(st, { op: 'sel', kind: s.kind, x0: b[0], y0: b[1], x1: b[2], y1: b[3] }, null); if (s.inv) SO.apply(st, { op: 'sel', kind: 'invert' }, null); }
    const ex = HO.expand(ops); for (let i = ck.k; i < ops.length; i++) applyOp(st, ex[i]); return st;
  }
  const bytes = (ck) => ck.bufs.reduce((a, b) => a + b.byteLength, 0);
  const api = { snapshot, usable, resume, bytes };
  if (node) module.exports = api; else root.Ckpt = api;
})(this);
