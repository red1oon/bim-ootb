// Checkpoints for the editor: raw float32 layer pixels + metadata, content-checked, keyed by the log's hash-chain head. Spec: witness_log/HYPOTHESES.md "Level 1e" (K1-K8).
(function (root) {
  const node = typeof require !== 'undefined', S = node ? require('../stack.js') : root.Stack, HO = node ? require('./history_ops.js') : root.HistoryOps, SO = node ? require('./select_ops.js') : root.SelectOps, FS = node ? require('../perf/fastsha.js') : root.FastSha;
  const sumOf = (f32) => FS.sha256(new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength));
  function snapshot(st, ops, k) {
    const layers = {}, bufs = [], mbufs = [], groups = {}, adjust = {}; for (const a of Object.keys(st.A)) { const o = st.A[a]; if (o.mask) throw new Error('checkpoint: adjustment masks are not supported'); adjust[a] = { kind: o.kind, params: JSON.parse(JSON.stringify(o.params)), opacity: o.opacity, hid: !!o.hid, keep: o.keep, name: o.name }; } for (const g of Object.keys(st.G)) { const o = st.G[g]; if (o.mask) throw new Error('checkpoint: group masks are not supported'); groups[g] = { mode: o.mode, opacity: o.opacity, hid: !!o.hid, keep: o.keep, name: o.name, children: o.children.slice() }; }
    for (const id of st.order) { const l = st.L[id]; if (l.mask) mbufs.push(new Float32Array(l.mask)); layers[id] = { mask: !!l.mask, mode: l.mode, opacity: l.opacity, hid: !!l.hid, keep: l.keep, name: l.name, parent: l.parent, clip: !!l.clip }; bufs.push(new Float32Array(l.pix)); } bufs.push(...mbufs);
    const sel = st.sel ? { kind: st.sel.kind, box: st.sel.box.slice(), inv: !!st.sel.inv } : null, selMask = st.sel ? new Uint8Array(st.sel.mask) : null;
    return { v: 1, k, W: st.W, head: HO.head(ops.slice(0, k)), meta: { order: st.order.slice(), root: st.root.slice(), layers, groups, adjust, sel }, bufs, sums: bufs.map(sumOf), selMask, selSum: selMask ? FS.sha256(selMask) : null };
  }
  function usable(ck, ops, opt = {}) {
    if (!ck || ck.v !== 1) throw new Error('not a checkpoint'); if (ck.k > ops.length) throw new Error('checkpoint is ahead of the log (k ' + ck.k + ' > ' + ops.length + ')');
    if (HO.head(ops.slice(0, ck.k)) !== ck.head) throw new Error('log head mismatch: entries before ' + ck.k + ' differ from the checkpoint');
    for (let i = ck.k; i < ops.length; i++) if (ops[i].op === 'amend' && ops[i].i < ck.k) throw new Error('an amend at entry ' + (i + 1) + ' rewrites entry ' + (ops[i].i + 1) + ' before the checkpoint');
    const nm = ck.meta.order.filter((id) => ck.meta.layers[id].mask).length; if (ck.bufs.length !== ck.meta.order.length + nm) throw new Error('buffer count mismatch');
    if (opt.verify !== false) ck.bufs.forEach((b, i) => { if (!(b instanceof Float32Array) || b.length !== ck.W * ck.W * (i < ck.meta.order.length ? 4 : 1)) throw new Error('buffer ' + i + ' has the wrong size'); if (sumOf(b) !== ck.sums[i]) throw new Error('buffer ' + i + ' fails its sha256 (corrupt)'); });
    if (ck.meta.sel) { if (!(ck.selMask instanceof Uint8Array) || ck.selMask.length !== ck.W * ck.W) throw new Error('selection mask has the wrong size'); if (opt.verify !== false && FS.sha256(ck.selMask) !== ck.selSum) throw new Error('selection mask fails its sha256 (corrupt)'); }
    return true;
  }
  function resume(ck, ops, applyOp, W, blobs) {
    if (ck.W !== W) throw new Error('canvas size differs'); const st = S.newState(W); st.blobs = blobs;
    ck.meta.order.forEach((id, i) => { S.apply(st, { op: 'layer', id, mode: 'normal', opacity: 1, mask: false }); const l = st.L[id], m = ck.meta.layers[id]; if (m.mask) l.mask = new Float32Array(ck.bufs[ck.meta.order.length + ck.meta.order.filter((x) => ck.meta.layers[x].mask).indexOf(id)]); l.mode = m.mode; l.opacity = m.opacity; if (m.clip) l.clip = true; if (m.hid) { l.hid = true; l.keep = m.keep; } if (m.name !== undefined) l.name = m.name; l.pix.set(ck.bufs[i]); });
    st.root = ck.meta.root.slice(); for (const g of Object.keys(ck.meta.groups || {})) { const m = ck.meta.groups[g]; st.G[g] = { mode: m.mode, opacity: m.opacity, mask: null, children: m.children.slice(), parent: -1 }; if (m.hid) { st.G[g].hid = true; st.G[g].keep = m.keep; } if (m.name !== undefined) st.G[g].name = m.name; for (const c of m.children) st.L[c].parent = +g; }
    for (const a of Object.keys(ck.meta.adjust || {})) { const m = ck.meta.adjust[a]; st.A[a] = { kind: m.kind, params: JSON.parse(JSON.stringify(m.params)), opacity: m.opacity, mask: null, parent: -1 }; if (m.hid) { st.A[a].hid = true; st.A[a].keep = m.keep; } if (m.name !== undefined) st.A[a].name = m.name; }
    st.order = []; for (const id of st.root) { if (st.G[id]) st.order.push(...st.G[id].children); else if (st.L[id]) st.order.push(id); } st.hasTree = Object.keys(st.G).length > 0 || Object.keys(st.A).length > 0 || st.order.some((id) => st.L[id].clip);
    if (ck.meta.sel) { const s = ck.meta.sel; st.sel = { kind: s.kind, box: s.box.slice(), inv: !!s.inv, mask: new Uint8Array(ck.selMask) }; }
    const ex = HO.expand(ops); for (let i = ck.k; i < ops.length; i++) applyOp(st, ex[i]); return st;
  }
  const bytes = (ck) => ck.bufs.reduce((a, b) => a + b.byteLength, 0);
  const api = { snapshot, usable, resume, bytes };
  if (node) module.exports = api; else root.Ckpt = api;
})(this);
