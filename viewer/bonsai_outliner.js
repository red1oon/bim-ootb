// bonsai_outliner.js — Bonsai-faithful Outliner (the richer "Find") for the modeller.
// prompts/BONSAI_KERNEL_RESEARCH.md Item 3 (Bonsai look-alike chrome). A Blender-Outliner-style left
// panel driven by the signed op-log feature tree: "Bonsai Model" > category groups > nodes, each with
// its grid reference; a Find box filters across categories; clicking a node selects + highlights in 3D.
//
// CATEGORY-DRIVEN BY DESIGN (user direction 2026-06-18): categories are REGISTERED, not hardcoded, so
// the powerful cross-Find categories (Room, Phase, …) and an ERP Project→Order-create action can slot in
// later via Bonsai.outliner.addCategory(...) without a rewrite. Today: Walls + Openings from the op-log.
(function () {
  'use strict';
  const TAG = '§OUTLINER';

  // Lucide line disclosure glyphs (verbatim chevron-down / chevron-right) — no unicode triangles.
  const CHEV = (open) => '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:4px">' +
    (open ? '<path d="m6 9 6 6 6-6"/>' : '<path d="m9 18 6-6-6-6"/>') + '</svg>';
  // Leaf marker — a small dot (a leaf row is not expandable, so a chevron would mislead).
  const LEAF = '<svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" stroke="none" ' +
    'style="vertical-align:-1px;margin-right:5px;opacity:.55"><circle cx="12" cy="12" r="3"/></svg>';

  function gridRef(pt) {
    if (!pt || !window.Bonsai.grid || !window.Bonsai.grid.xs.length) return null;
    const r = window.Bonsai.grid.refAt(pt[0], pt[1]);
    return (r.x || r.y) ? ((r.x || '·') + '-' + (r.y || '·')) : null;
  }

  const Outliner = {
    _el: null, _find: '', _collapsed: {}, _categories: [],

    // Default categories — extensible. A category = { key, label, match(op)->bool, node(op)->{id,label,sub} }.
    _defaults() {
      return [
        { key: 'walls', label: 'Walls', match: op => op.op_type === 'GEOM_EXTRUDE_POLY',
          node: op => { const p = op.parameters.profile.points; const a = gridRef(p[0]), b = gridRef(p[1]);
            return { id: op.id, label: 'Wall', sub: (a && b) ? a + '·' + b : '#' + op.id }; } },
        { key: 'openings', label: 'Openings', match: op => op.op_type === 'GEOM_CUT',
          node: op => ({ id: op.parent, label: 'Opening', sub: '⮡ Wall ' + op.parent }) }
      ];
    },
    addCategory(cat) { this._categories.push(cat); this.refresh(); return this; },   // seam for Room/Phase/ERP

    mount(parentSel) {
      if (this._el) return this._el;
      if (!this._categories.length) this._categories = this._defaults();
      const host = (parentSel ? document.querySelector(parentSel) : null) || document.body;
      const el = document.createElement('div');
      el.id = 'bonsai-outliner';
      el.style.cssText = 'position:fixed;top:0;left:0;width:240px;height:100vh;background:#1b1d23;' +
        'border-right:1px solid #2c303a;color:#c7cdd8;font:12px/1.5 -apple-system,system-ui,sans-serif;' +
        'z-index:20;display:flex;flex-direction:column;user-select:none';
      el.innerHTML =
        '<div style="padding:9px 11px;font-size:11px;letter-spacing:.12em;color:#5b6473;border-bottom:1px solid #2c303a">OUTLINER</div>' +
        '<div style="padding:7px 9px;border-bottom:1px solid #2c303a">' +
        '<input id="bo-find" placeholder="🔍 find…" style="width:100%;box-sizing:border-box;background:#13151a;' +
        'border:1px solid #2c303a;border-radius:5px;color:#c7cdd8;padding:5px 8px;font-size:12px;outline:none"></div>' +
        '<div id="bo-tree" style="flex:1;overflow:auto;padding:5px 4px"></div>' +
        '<div id="bo-foot" style="padding:6px 11px;border-top:1px solid #2c303a;font-size:10px;color:#4a5260"></div>';
      host.appendChild(el);
      this._el = el;
      el.querySelector('#bo-find').addEventListener('input', e => { this._find = e.target.value.toLowerCase(); this._paint(); });
      window.addEventListener('bonsai:oplog', () => this.refresh());
      this.refresh();
      console.log(TAG + ' mounted categories=' + this._categories.map(c => c.key).join(','));
      return el;
    },

    refresh() { if (this._el) this._paint(); },

    // Pick-select is FREQUENT (every click) and changes ONLY which row is active — so restyle the existing
    // rows in place instead of re-querying the DB + rebuilding the whole tree (the old refresh() on each pick
    // was the select-side jank). Full _paint() still runs on actual op-log changes (commit/clear/find).
    setActive(id) {
      window.Bonsai._selId = id;
      if (!this._el) return;
      this._el.querySelectorAll('[data-fid]').forEach(d => {
        const on = (+d.getAttribute('data-fid')) === id;
        d.style.background = on ? '#26456b' : 'transparent';
        d.style.color = on ? '#dce6f4' : '#c7cdd8';
        d.onmouseover = () => { d.style.background = on ? '#26456b' : '#23262e'; };
        d.onmouseout = () => { d.style.background = on ? '#26456b' : 'transparent'; };
      });
    },

    _paint() {
      const tree = this._el.querySelector('#bo-tree'); if (!tree) return;
      const ops = (window.Bonsai.oplog && window.Bonsai.oplog.db) ? window.Bonsai.oplog._geomOps() : [];
      // FLAT categories (op-log feature groups — Walls/Openings/etc., unchanged). TREE categories (deep, seeded,
      // editable — the BOM Tree composition facet, SPATIAL_DEPENDENCY_GRAPH §OUTLINER-COHERENCE) take a separate path.
      const flatCats = this._categories.filter(c => !c.tree);
      const treeCats = this._categories.filter(c => c.tree);
      const groups = flatCats.map(cat => ({ cat, nodes: ops.filter(cat.match).map(cat.node) }));
      const f = this._find;
      const match = n => !f || (n.label + ' ' + n.sub).toLowerCase().includes(f);
      let total = 0, shown = 0;
      let html = '<div style="padding:2px 6px;color:#8b94a3">' + CHEV(true) + 'DAGeVu Model</div>';
      groups.forEach(g => {
        const vis = g.nodes.filter(match); total += g.nodes.length; shown += vis.length;
        if (f && !vis.length) return;
        const col = this._collapsed[g.cat.key];
        html += '<div data-grp="' + g.cat.key + '" style="padding:2px 6px 2px 16px;color:#6f7a8b;cursor:pointer">' +
          CHEV(!col) + g.cat.label + ' <span style="color:#454e5d">(' + g.nodes.length + ')</span></div>';
        if (col) return;
        vis.forEach(n => {
          const active = window.Bonsai._selId === n.id;
          html += '<div data-fid="' + n.id + '" style="padding:3px 6px 3px 32px;cursor:pointer;border-radius:4px;' +
            (active ? 'background:#26456b;color:#dce6f4' : 'color:#c7cdd8') + '" ' +
            'onmouseover="this.style.background=\'' + (active ? '#26456b' : '#23262e') + '\'" ' +
            'onmouseout="this.style.background=\'' + (active ? '#26456b' : 'transparent') + '\'">' +
            LEAF + n.label + '  <span style="color:#7f8aa0;font-family:ui-monospace,monospace">' + n.sub + '</span></div>';
        });
      });
      treeCats.forEach(cat => { const r = this._treeHtml(cat, match); html += r.html; total += r.total; shown += r.shown; });
      tree.innerHTML = html;
      tree.querySelectorAll('[data-grp]').forEach(d => d.onclick = () => { const k = d.getAttribute('data-grp'); this._collapsed[k] = !this._collapsed[k]; this._paint(); });
      tree.querySelectorAll('[data-fid]').forEach(d => d.onclick = () => {
        const fid = +d.getAttribute('data-fid');
        if (window.Bonsai.select) window.Bonsai.select(fid);   // → highlight() → setActive(): restyle only, no rebuild
        else this.setActive(fid);
      });
      this._wireTrees(treeCats);
      const foot = this._el.querySelector('#bo-foot');
      const tip = (window.Bonsai.oplog && window.Bonsai.oplog._lastTip) || '';
      foot.textContent = (f ? shown + '/' + total + ' shown' : total + ' features') + (tip ? '  🔒 ' + tip.slice(0, 8) : '');
      console.log(TAG + ' paint total=' + total + ' shown=' + shown + ' find="' + f + '" trees=' + treeCats.length);
    },

    // ── DEEP / EDITABLE tree category (the BOM Tree composition facet). cat.tree() → [rootNode];
    //    node = {id,label,sub,kind,children}. Drag a node onto another → cat.onReparent(childId,targetId) (signed op
    //    upstream). GREP-CLEAN of geometry: this renders pointers only, never touches a placement.
    _treeHtml(cat, match) {
      const roots = (cat.tree ? cat.tree() : []) || [];
      const ckey = 'tcat|' + cat.key, col = this._collapsed[ckey];
      let leafTotal = 0; const countLeaves = ns => ns.forEach(n => { if (n.kind === 'element') leafTotal++; if (n.children) countLeaves(n.children); });
      countLeaves(roots);
      let html = '<div data-tcat="' + cat.key + '" style="padding:2px 6px 2px 16px;color:#6f7a8b;cursor:pointer">' +
        CHEV(!col) + cat.label + ' <span style="color:#454e5d">(' + leafTotal + ')</span></div>';
      let shown = 0;
      if (!col) { const r = this._renderNodes(roots, 1, cat.key, match); html += r.html; shown = r.shown; }
      return { html: html, total: leafTotal, shown: shown };
    },
    _renderNodes(nodes, depth, ckey, match) {
      let html = '', shown = 0;
      (nodes || []).forEach(n => {
        const kids = n.children || [];
        const isLeaf = n.kind === 'element';
        const vis = !this._find || this._subtreeMatches(n, match);
        if (!vis) return;
        if (isLeaf) shown++;
        const ncol = this._collapsed['bn|' + n.id];
        const active = window.Bonsai._selId === n.id;
        const pad = 16 + depth * 14;
        html += '<div data-bnode="' + n.id + '" data-tcat="' + ckey + '" data-leaf="' + (isLeaf ? 1 : 0) + '" draggable="true" ' +
          'style="padding:3px 6px 3px ' + pad + 'px;cursor:' + (isLeaf ? 'grab' : 'pointer') + ';border-radius:4px;' +
          (active ? 'background:#26456b;color:#dce6f4' : 'color:#c7cdd8') + '">' +
          (kids.length ? CHEV(!ncol) : LEAF) + n.label +
          (n.sub ? '  <span style="color:#7f8aa0;font-family:ui-monospace,monospace">' + n.sub + '</span>' : '') + '</div>';
        if (kids.length && !ncol) { const r = this._renderNodes(kids, depth + 1, ckey, match); html += r.html; shown += r.shown; }
      });
      return { html: html, shown: shown };
    },
    _subtreeMatches(n, match) { if (match({ label: n.label, sub: n.sub || '' })) return true; return (n.children || []).some(c => this._subtreeMatches(c, match)); },
    _wireTrees(treeCats) {
      if (!this._el || !treeCats.length) return;
      const byKey = {}; treeCats.forEach(c => byKey[c.key] = c);
      this._el.querySelectorAll('[data-tcat]:not([data-bnode])').forEach(d => d.onclick = () => {
        const k = 'tcat|' + d.getAttribute('data-tcat'); this._collapsed[k] = !this._collapsed[k]; this._paint();
      });
      this._el.querySelectorAll('[data-bnode]').forEach(d => {
        const id = d.getAttribute('data-bnode'), isLeaf = d.getAttribute('data-leaf') === '1';
        d.onclick = () => {
          if (isLeaf) { const num = +id; if (window.Bonsai.select && !isNaN(num)) window.Bonsai.select(num); else this.setActive(id); }
          else { this._collapsed['bn|' + id] = !this._collapsed['bn|' + id]; this._paint(); }
        };
        d.ondragstart = e => { e.dataTransfer.setData('text/bnode', id); this._dragSrc = id; };
        d.ondragover = e => { e.preventDefault(); d.style.outline = '1px dashed #4a78b8'; };
        d.ondragleave = () => { d.style.outline = 'none'; };
        d.ondrop = e => {
          e.preventDefault(); d.style.outline = 'none';
          const src = (e.dataTransfer && e.dataTransfer.getData('text/bnode')) || this._dragSrc;
          const cat = byKey[d.getAttribute('data-tcat')];
          if (src && cat && cat.onReparent && src !== id) cat.onReparent(src, id);
        };
      });
    }
  };

  window.Bonsai = window.Bonsai || {};
  window.Bonsai.outliner = Outliner;
  console.log(TAG + ' module loaded');
})();
