// Layer management ops for the editor log: del, mv, vis, name. Spec: witness_log/HYPOTHESES.md "Level 1a" (L1-L8). Shared by the page, the Node exporter and the tests; stack.js is not edited.
// Hide = opacity 0 with the real opacity kept in l.keep, so the unchanged compositor skips the layer.
(function (root) {
  const F = Math.fround;
  function need(st, o) { const l = st.L[o.layer]; if (!l) throw new Error(o.op + ': unknown layer ' + o.layer); return l; }
  function apply(st, o) {   // returns true when it handled the op
    if (o.op === 'del') { need(st, o); if (o.layer === 0) throw new Error('del: the Background cannot be deleted'); delete st.L[o.layer]; for (const a of [st.order, st.root]) { const i = a.indexOf(o.layer); if (i >= 0) a.splice(i, 1); } return true; }
    if (o.op === 'mv') { need(st, o); const n = st.order.length, i = st.order.indexOf(o.layer);
      if (o.layer === 0) throw new Error('mv: the Background cannot move'); if (!Number.isInteger(o.to) || o.to < 1 || o.to > n - 1) throw new Error('mv: index ' + o.to + ' out of range 1..' + (n - 1));
      for (const a of [st.order, st.root]) { const j = a.indexOf(o.layer); a.splice(j, 1); a.splice(o.to, 0, o.layer); } return true; }
    if (o.op === 'vis') { const l = need(st, o); if (typeof o.v !== 'boolean') throw new Error('vis: v must be boolean');
      if (!o.v && !l.hid) { l.keep = l.opacity; l.opacity = 0; l.hid = true; } else if (o.v && l.hid) { l.opacity = l.keep; delete l.keep; delete l.hid; } return true; }
    if (o.op === 'name') { const l = need(st, o), s = typeof o.name === 'string' ? o.name.trim() : ''; if (s.length < 1 || s.length > 40) throw new Error('name: 1..40 characters'); l.name = s; return true; }
    if (o.op === 'set' && o.opacity !== undefined && st.L[o.layer] && st.L[o.layer].hid) { const l = st.L[o.layer]; l.keep = F(o.opacity); if (o.mode) l.mode = o.mode; return true; }
    return false;
  }
  const displayName = (id, l) => (l && l.name) || (id === 0 ? 'Background' : 'Layer ' + id);
  const meta = (st) => { const m = {}; for (const id of st.order) { const l = st.L[id]; m[id] = { name: displayName(id, l), hidden: !!l.hid, opacity: l.hid ? l.keep : l.opacity }; } return m; };
  const api = { apply, displayName, meta };
  if (typeof module !== 'undefined') module.exports = api; else root.LayerOps = api;
})(this);
