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
      const groups = this._categories.map(cat => ({ cat, nodes: ops.filter(cat.match).map(cat.node) }));
      const f = this._find;
      const match = n => !f || (n.label + ' ' + n.sub).toLowerCase().includes(f);
      let total = 0, shown = 0;
      let html = '<div style="padding:2px 6px;color:#8b94a3">▼ Bonsai Model</div>';
      groups.forEach(g => {
        const vis = g.nodes.filter(match); total += g.nodes.length; shown += vis.length;
        if (f && !vis.length) return;
        const col = this._collapsed[g.cat.key];
        html += '<div data-grp="' + g.cat.key + '" style="padding:2px 6px 2px 16px;color:#6f7a8b;cursor:pointer">' +
          (col ? '▸ ' : '▼ ') + g.cat.label + ' <span style="color:#454e5d">(' + g.nodes.length + ')</span></div>';
        if (col) return;
        vis.forEach(n => {
          const active = window.Bonsai._selId === n.id;
          html += '<div data-fid="' + n.id + '" style="padding:3px 6px 3px 32px;cursor:pointer;border-radius:4px;' +
            (active ? 'background:#26456b;color:#dce6f4' : 'color:#c7cdd8') + '" ' +
            'onmouseover="this.style.background=\'' + (active ? '#26456b' : '#23262e') + '\'" ' +
            'onmouseout="this.style.background=\'' + (active ? '#26456b' : 'transparent') + '\'">' +
            '▸ ' + n.label + '  <span style="color:#7f8aa0;font-family:ui-monospace,monospace">' + n.sub + '</span></div>';
        });
      });
      tree.innerHTML = html;
      tree.querySelectorAll('[data-grp]').forEach(d => d.onclick = () => { const k = d.getAttribute('data-grp'); this._collapsed[k] = !this._collapsed[k]; this._paint(); });
      tree.querySelectorAll('[data-fid]').forEach(d => d.onclick = () => {
        const fid = +d.getAttribute('data-fid');
        if (window.Bonsai.select) window.Bonsai.select(fid);   // → highlight() → setActive(): restyle only, no rebuild
        else this.setActive(fid);
      });
      const foot = this._el.querySelector('#bo-foot');
      const tip = (window.Bonsai.oplog && window.Bonsai.oplog._lastTip) || '';
      foot.textContent = (f ? shown + '/' + total + ' shown' : total + ' features') + (tip ? '  🔒 ' + tip.slice(0, 8) : '');
      console.log(TAG + ' paint total=' + total + ' shown=' + shown + ' find="' + f + '"');
    }
  };

  window.Bonsai = window.Bonsai || {};
  window.Bonsai.outliner = Outliner;
  console.log(TAG + ' module loaded');
})();
