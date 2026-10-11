// Layer management ops for the editor log: del, mv, vis, name, clip, group, parent, ungroup. Spec: witness_log/HYPOTHESES.md "Level 1a" (L1-L8), "Level 2b" (CL), "Level 2c" (G1-G8).
// Shared by the page, the Node exporter and the tests; stack.js is not edited. Hide = opacity 0 with the real opacity kept in .keep, so the unchanged compositor skips the node.
// Tree model: st.root = top-level node ids bottom->top (layers and groups); st.G[g].children = that group's layer ids; groups do not nest; st.order = every LAYER id in display order (a walk of root), recomputed here.
(function (root) {
  const node = typeof require !== 'undefined', S = node ? require('../stack.js') : root.Stack, F = Math.fround;
  const nodeOf = (st, id) => st.L[id] || st.G[id];
  function need(st, o, key) { const id = o[key || 'layer'], n = nodeOf(st, id); if (!n) throw new Error(o.op + ': unknown layer ' + id); return n; }
  const listOf = (st, id) => { const l = st.L[id]; return l && l.parent >= 0 ? st.G[l.parent].children : st.root; };
  const reflow = (st) => { const out = []; for (const id of st.root) { if (st.G[id]) out.push(...st.G[id].children); else out.push(id); } st.order = out; };
  const retree = (st) => { st.hasTree = Object.keys(st.G).length > 0 || st.order.some((id) => st.L[id].clip); };   // no groups and no clips: the flat compositor, as before
  // a clipped layer needs an unclipped LAYER before it in its list (a group in between breaks the chain)
  const validList = (st, list) => { let base = false; for (const id of list) { if (st.G[id]) base = false; else if (st.L[id].clip) { if (!base) return false; } else base = true; } return true; };
  const validAll = (st) => validList(st, st.root) && Object.keys(st.G).every((g) => validList(st, st.G[g].children));
  function tx(st, fn) {   // run a structural change; on any failure restore the lists and parents exactly
    const bak = { root: st.root.slice(), order: st.order.slice(), ch: {}, par: {}, hasTree: st.hasTree }; for (const g of Object.keys(st.G)) bak.ch[g] = st.G[g].children.slice(); bak.clip = {}; for (const id of Object.keys(st.L)) { bak.par[id] = st.L[id].parent; bak.clip[id] = st.L[id].clip; }
    try { fn(); reflow(st); retree(st); if (!validAll(st)) throw new Error('a clipped layer would have no base layer below it in its list'); } catch (e) { st.root = bak.root; st.order = bak.order; for (const g of Object.keys(bak.ch)) st.G[g].children = bak.ch[g]; for (const id of Object.keys(bak.par)) if (st.L[id]) { st.L[id].parent = bak.par[id]; st.L[id].clip = bak.clip[id]; } st.hasTree = bak.hasTree; throw e; }
  }
  function apply(st, o) {   // returns true when it handled the op
    if (o.op === 'group') { if (nodeOf(st, o.id)) throw new Error('group: id ' + o.id + ' already used'); S.apply(st, o); reflow(st); retree(st); return true; }
    if (o.op === 'del') { const n = need(st, o); if (o.layer === 0) throw new Error('del: the Background cannot be deleted'); const isG = !!st.G[o.layer]; if (isG && st.G[o.layer].children.length) throw new Error('del: the group is not empty (ungroup it first)');
      const L0 = st.L[o.layer], G0 = st.G[o.layer]; tx(st, () => { const list = isG ? st.root : listOf(st, o.layer), i = list.indexOf(o.layer); list.splice(i, 1); if (isG) delete st.G[o.layer]; else delete st.L[o.layer]; }); void n; void L0; void G0; return true; }
    if (o.op === 'clip') { const l = need(st, o); if (st.G[o.layer]) throw new Error('clip: a group cannot be clipped'); if (o.layer === 0) throw new Error('clip: the Background cannot be clipped'); if (typeof o.v !== 'boolean') throw new Error('clip: v must be boolean'); const was = l.clip; tx(st, () => { l.clip = o.v; }); void was; return true; }
    if (o.op === 'mv') { need(st, o); if (o.layer === 0) throw new Error('mv: the Background cannot move'); const list = listOf(st, o.layer), isRoot = list === st.root, n = list.length, lo = isRoot ? 1 : 0;
      if (!Number.isInteger(o.to) || o.to < lo || o.to > n - 1) throw new Error('mv: index ' + o.to + ' out of range ' + lo + '..' + (n - 1));
      tx(st, () => { const j = list.indexOf(o.layer); list.splice(j, 1); list.splice(o.to, 0, o.layer); }); return true; }
    if (o.op === 'parent') { const l = st.L[o.layer]; if (!l) throw new Error('parent: unknown layer ' + o.layer); if (o.layer === 0) throw new Error('parent: the Background cannot be grouped'); if (o.group !== -1 && !st.G[o.group]) throw new Error('parent: unknown group ' + o.group);
      const dest = o.group === -1 ? st.root : st.G[o.group].children, lo = o.group === -1 ? 1 : 0; if (!Number.isInteger(o.to) || o.to < lo || o.to > dest.length - (listOf(st, o.layer) === dest ? 1 : 0)) throw new Error('parent: index ' + o.to + ' out of range');
      tx(st, () => { const src = listOf(st, o.layer); src.splice(src.indexOf(o.layer), 1); dest.splice(o.to, 0, o.layer); l.parent = o.group; }); return true; }
    if (o.op === 'ungroup') { const g = st.G[o.group]; if (!g) throw new Error('ungroup: unknown group ' + o.group); tx(st, () => { const i = st.root.indexOf(o.group); for (const c of g.children) st.L[c].parent = -1; st.root.splice(i, 1, ...g.children); delete st.G[o.group]; }); return true; }
    if (o.op === 'vis') { const l = need(st, o); if (typeof o.v !== 'boolean') throw new Error('vis: v must be boolean');
      if (!o.v && !l.hid) { l.keep = l.opacity; l.opacity = 0; l.hid = true; } else if (o.v && l.hid) { l.opacity = l.keep; delete l.keep; delete l.hid; } return true; }
    if (o.op === 'name') { const l = need(st, o), s = typeof o.name === 'string' ? o.name.trim() : ''; if (s.length < 1 || s.length > 40) throw new Error('name: 1..40 characters'); l.name = s; return true; }
    if (o.op === 'set' && o.opacity !== undefined && nodeOf(st, o.layer) && nodeOf(st, o.layer).hid) { const l = nodeOf(st, o.layer); l.keep = F(o.opacity); if (o.mode) l.mode = o.mode; return true; }
    return false;
  }
  const displayName = (id, l, isGroup) => (l && l.name) || (id === 0 ? 'Background' : (isGroup ? 'Group ' : 'Layer ') + id);
  const meta = (st) => { const m = {}; for (const id of st.order) { const l = st.L[id]; m[id] = { name: displayName(id, l), hidden: !!l.hid, opacity: l.hid ? l.keep : l.opacity }; } for (const id of Object.keys(st.G)) { const g = st.G[id]; m[id] = { name: displayName(+id, g, true), hidden: !!g.hid, opacity: g.hid ? g.keep : g.opacity, group: true }; } return m; };
  const nextId = (st) => Math.max(-1, ...Object.keys(st.L).map(Number), ...Object.keys(st.G).map(Number)) + 1;
  const api = { apply, displayName, meta, nextId, reflow, retree, validAll, listOf };
  if (node) module.exports = api; else root.LayerOps = api;
})(this);
