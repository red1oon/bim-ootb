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
    // §P9 (RESUME_MODELLER_POLISH_BATCH.md — Witness: W-OL-PERSIST): collapsed-state survives a reload.
    // Stored as plain JSON under one key (tiny — a handful of 'tcat|…'/'bn|…' flags); load once at mount,
    // save on every toggle. try-wrapped both ways: no localStorage (node/tests) ⇒ silently in-memory as before.
    // _adjLens deliberately NOT persisted — it's a lens you switch on to look, not layout.
    _CKEY: 'dagevu_modeller_ol_collapsed',
    _loadCollapsed() { try { const s = localStorage.getItem(this._CKEY); if (s) { const o = JSON.parse(s); if (o && typeof o === 'object') this._collapsed = o; } } catch (e) { } },
    _saveCollapsed() { try { localStorage.setItem(this._CKEY, JSON.stringify(this._collapsed)); } catch (e) { } },
    // W-UX-6: the "⇄ adjacency" lens — when ON, selecting an element highlights its typed cross-edge
    // neighbours (Find-style) on the containment backbone. Edges are READ from window.swXEdges (derived
    // on-the-fly from the pristine substrate, NON-INVENT — abuts ships today; later edge types slot in).
    _adjLens: false, _adjMap: null,

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

    // ── W-UX-6 adjacency lens helpers ────────────────────────────────────────────────────────────────
    // Build guid → Map(neighbour guid → Set(edge kinds)) from the ELEMENT↔ELEMENT cross-edges in
    // window.swXEdges (each carries {a,b} guids): abuts (derived), fills + aggregates (recovered). Element↔
    // DATUM edges (anchored/spans) have no a/b → naturally skipped here; they annotate the selected row instead.
    _ADJ_GLYPH: { abuts: '⇄', fills: '⌂', aggregates: '⧉' },
    _buildAdjMap() {
      const map = {}, X = (typeof window !== 'undefined' && window.swXEdges) || {};
      function add(a, b, kind) { if (a == null || b == null || a === b) return; var m = map[a] || (map[a] = new Map()); if (!m.has(b)) m.set(b, new Set()); m.get(b).add(kind); }
      Object.keys(X).forEach(kind => {
        const edges = X[kind]; if (!Array.isArray(edges)) return;
        edges.forEach(e => { if (e && e.a != null && e.b != null) { add(e.a, e.b, e.kind || kind); add(e.b, e.a, e.kind || kind); } });
      });
      return map;
    },
    // Per-kind edge stats for the footer + the selected-row annotation (element↔element + element↔datum).
    _adjStats() {
      const X = (typeof window !== 'undefined' && window.swXEdges) || {};
      const c = k => Array.isArray(X[k]) ? X[k].length : 0;
      return { abuts: c('abuts'), fills: c('fills'), aggregates: c('aggregates'), anchored: c('anchored'), spans: c('spans'), datums: c('datums') };
    },
    _adjCount() { const s = this._adjStats(); return s.abuts + s.fills + s.aggregates; },   // element↔element edges
    // Count a guid's element↔datum relations (anchored datums / span axes) for the selected-row annotation.
    _datumRels(guid) {
      const X = (typeof window !== 'undefined' && window.swXEdges) || {};
      const anc = Array.isArray(X.anchored) ? X.anchored.filter(a => a.element_guid === guid).length : 0;
      const spn = Array.isArray(X.spans) ? X.spans.filter(s => s.element_guid === guid).length : 0;
      return { anchored: anc, spans: spn };
    },

    mount(parentSel) {
      if (this._el) return this._el;
      if (!this._categories.length) this._categories = this._defaults();
      this._loadCollapsed();                                   // §P9: restore last session's collapse layout
      const host = (parentSel ? document.querySelector(parentSel) : null) || document.body;
      const el = document.createElement('div');
      el.id = 'bonsai-outliner';
      el.style.cssText = 'position:fixed;top:0;left:0;width:240px;height:100vh;background:#1b1d23;' +
        'border-right:1px solid #2c303a;color:#c7cdd8;font:12px/1.5 -apple-system,system-ui,sans-serif;' +
        'z-index:20;display:flex;flex-direction:column;user-select:none';
      el.innerHTML =
        '<div style="padding:9px 11px;font-size:11px;letter-spacing:.12em;color:#5b6473;border-bottom:1px solid #2c303a">OUTLINER</div>' +
        '<div style="padding:7px 9px;border-bottom:1px solid #2c303a;display:flex;gap:6px;align-items:center">' +
        '<input id="bo-find" placeholder="🔍 find…" style="flex:1;min-width:0;box-sizing:border-box;background:#13151a;' +
        'border:1px solid #2c303a;border-radius:5px;color:#c7cdd8;padding:5px 8px;font-size:12px;outline:none">' +
        '<button id="bo-adj" title="Adjacency lens — highlight a selected element’s abutting neighbours" ' +
        'style="flex:0 0 auto;background:#13151a;border:1px solid #2c303a;border-radius:5px;color:#7f8aa0;' +
        'padding:4px 8px;font-size:13px;cursor:pointer;line-height:1">⇄</button></div>' +
        '<div id="bo-tree" style="flex:1;overflow:auto;padding:5px 4px"></div>' +
        '<div id="bo-foot" style="padding:6px 11px;border-top:1px solid #2c303a;font-size:10px;color:#4a5260"></div>';
      host.appendChild(el);
      this._el = el;
      el.querySelector('#bo-find').addEventListener('input', e => { this._find = e.target.value.toLowerCase(); this._paint(); });
      el.querySelector('#bo-adj').addEventListener('click', () => {
        this._adjLens = !this._adjLens;
        const b = this._el.querySelector('#bo-adj');
        b.style.background = this._adjLens ? '#23364a' : '#13151a';
        b.style.borderColor = this._adjLens ? '#3a6ea5' : '#2c303a';
        b.style.color = this._adjLens ? '#cfe3f6' : '#7f8aa0';
        const n = this._adjLens ? this._adjCount() : 0;
        console.log(TAG + ' §XEDGE-LENS adjacency=' + this._adjLens + ' edges=' + n);
        this._paint();
      });
      window.addEventListener('bonsai:oplog', () => this.refresh());
      this.refresh();
      console.log(TAG + ' mounted categories=' + this._categories.map(c => c.key).join(','));
      return el;
    },

    refresh() { if (this._el) this._paint(); },

    // Pick-select is FREQUENT (every click) and changes ONLY which row is active — so restyle the existing
    // rows in place instead of re-querying the DB + rebuilding the whole tree (the old refresh() on each pick
    // was the select-side jank). M8 (incremental): the active-blue is NEVER baked into the section HTML — it is
    // painted here over the cached DOM for BOTH the flat op-log rows ([data-fid]) AND the seeded BOM-tree leaf
    // rows ([data-bnode][data-leaf="1"]). A neighbour row (adjacency lens, data-adj=1) falls back to amber.
    // scene→Outliner sync (2026-07-02): a 3D pick (click a mesh in the canvas) already routes here via
    // window.Bonsai.select→highlight→setActive — so the ONLY missing piece was making the now-active row
    // actually SCROLL INTO VIEW (a building with thousands of seeded rows can leave the active row scrolled
    // off, looking like the pick "didn't do anything" in the Outliner). `id` may be a numeric featureId
    // (flat op-log rows) or a string bnode id (seeded ARC-tree rows) — try both containers, whichever hit.
    setActive(id) {
      window.Bonsai._selId = id;
      if (!this._el) return;
      // GUID↔featureId cross-match (2026-07-02): the seeded ARC-BOM tree's leaf rows are keyed by GUID
      // (bom_tree.js `id: e.guid`), but a 3D pick / window.Bonsai.select() always passes the NUMERIC
      // featureId — so a bnode-row match on `id` alone misses every ARC-seeded row. Resolve the OTHER
      // representation via arc_editable.js's featureId↔guid bridge (window.__arcFidByGuid/__arcGuidByFid)
      // so a pick highlights the right row regardless of which id flavour the caller used.
      const guidByFid = (typeof window !== 'undefined' && window.__arcGuidByFid) || {};
      const fidByGuid = (typeof window !== 'undefined' && window.__arcFidByGuid) || {};
      const altId = guidByFid[id] != null ? guidByFid[id] : fidByGuid[id];
      // §P3/§P4 (RESUME_MODELLER_POLISH_BATCH.md — Witness: W-OL-SYNC): the canvas already paints EVERY
      // selected mesh (primary bright, secondaries dimmer — modeller.html _paintSel) but this restyle only
      // ever compared against the ONE primary id — a shift-click/marquee multi-select looked single in the
      // Outliner. Same single-id assumption both directions, same fix: a membership check against the live
      // selection set. Secondary tint deliberately echoes _paintSel's dimmer 0x1f3f5c family.
      const selSet = (typeof window !== 'undefined' && window.Bonsai && window.Bonsai._selSet) || null;
      const inSel = fid => !!(selSet && fid != null && selSet.has(fid));
      const hov = fid => { if (window.Bonsai && window.Bonsai.hoverFeature) window.Bonsai.hoverFeature(fid); };   // §P2 row hover → canvas glow
      let activeEl = null;
      this._el.querySelectorAll('[data-fid]').forEach(d => {
        const fid = +d.getAttribute('data-fid');
        const on = fid === id;
        const sec = !on && inSel(fid);                      // secondary member of the multi-select
        const base = on ? '#26456b' : (sec ? '#1d3550' : 'transparent');
        d.style.background = base;
        d.style.color = on ? '#dce6f4' : (sec ? '#c3d2e6' : '#c7cdd8');
        d.onmouseover = () => { d.style.background = on ? '#26456b' : '#23262e'; hov(fid); };
        d.onmouseout = () => { d.style.background = base; hov(null); };
        if (on) activeEl = d;
      });
      this._el.querySelectorAll('[data-bnode][data-leaf="1"]').forEach(d => {
        const bn = d.getAttribute('data-bnode');
        const on = bn === String(id) || (altId != null && bn === String(altId));
        // resolve this ROW's own featureId (bnode id is a guid for seeded rows, numeric for authored ones)
        const bnFid = fidByGuid[bn] != null ? fidByGuid[bn] : (isNaN(+bn) ? null : +bn);
        const sec = !on && inSel(bnFid);
        const nbr = d.getAttribute('data-adj') === '1';     // adjacency-lens neighbour → amber base
        const base = on ? '#26456b' : (sec ? '#1d3550' : (nbr ? '#2c2616' : 'transparent'));
        d.style.background = base;
        d.style.color = on ? '#dce6f4' : (sec ? '#c3d2e6' : (nbr ? '#e6dcc2' : '#c7cdd8'));
        d.onmouseover = () => { d.style.background = on ? '#26456b' : '#23262e'; if (bnFid != null) hov(bnFid); };   // §P2 both row flavours
        d.onmouseout = () => { d.style.background = base; if (bnFid != null) hov(null); };
        if (on) activeEl = d;
      });
      if (activeEl && activeEl.scrollIntoView) activeEl.scrollIntoView({ block: 'nearest' });
    },

    // M8 INCREMENTAL (RESUME_MODELLER_POLISH.md #7): the Outliner has TWO sections — the seeded BOM-tree
    // categories (the loaded building: storey→room→disc→class→element, thousands of nodes, RE-FOLDED only on a
    // reparent/seed/walk) and the FLAT op-log groups (what the user authored, grows on every geometry commit).
    // The old _paint rebuilt BOTH on EVERY `bonsai:oplog` change → re-folding + re-parsing + re-wiring the whole
    // building tree on each move/cut = the "jank at 100+ features". Now each section is rendered to its OWN
    // persistent container and the freshly-built HTML is STRING-DIFFED against the last render: an identical
    // section is left UNTOUCHED (no innerHTML reparse, no querySelectorAll re-wire — the costly DOM work). A
    // geometry commit changes only the flat HTML → the seeded tree DOM is reused as-is (identity preserved).
    // Selection is applied by setActive() over whichever DOM survived, so a pure pick never rebuilds either side.
    _ensureSections(tree) {
      if (tree.querySelector('#bo-trees')) return;
      tree.innerHTML =
        '<div style="padding:2px 6px;color:#8b94a3">' + CHEV(true) + 'DAGeVu Model</div>' +
        '<div id="bo-trees"></div><div id="bo-flats"></div>';
      this._treesCache = this._flatsCache = null;   // fresh skeleton → force both sections to refill (no stale-cache desync)
    },
    _paint() {
      const __t0 = performance.now();
      const tree = this._el.querySelector('#bo-tree'); if (!tree) return;
      this._ensureSections(tree);
      // W-UX-6: refresh the adjacency map for this paint when the lens is ON (cheap; reads window.swXEdges).
      this._adjMap = this._adjLens ? this._buildAdjMap() : null;
      const ops = (window.Bonsai.oplog && window.Bonsai.oplog.db) ? window.Bonsai.oplog._geomOps() : [];
      const flatCats = this._categories.filter(c => !c.tree);
      const treeCats = this._categories.filter(c => c.tree);
      const f = this._find;
      const match = n => !f || (n.label + ' ' + n.sub).toLowerCase().includes(f);
      let total = 0, shown = 0;

      // ── SEEDED TREE section (ARC LEADS, W-UX-3) — re-rendered only when its HTML actually changes ──────────
      let treesHtml = '';
      treeCats.forEach(cat => { const r = this._treeHtml(cat, match); treesHtml += r.html; total += r.total; shown += r.shown; });
      let treeBuilt = false;
      if (treesHtml !== this._treesCache) {
        const c = tree.querySelector('#bo-trees'); c.innerHTML = treesHtml; this._wireTrees(c, treeCats);
        this._treesCache = treesHtml; treeBuilt = true;
      }

      // ── FLAT op-log groups — grows with authored features; the only section a geometry commit changes ──────
      const groups = flatCats.map(cat => ({ cat, nodes: ops.filter(cat.match).map(cat.node) }));
      let flatsHtml = '';
      groups.forEach(g => {
        const vis = g.nodes.filter(match); total += g.nodes.length; shown += vis.length;
        if (f && !vis.length) return;
        const col = this._collapsed[g.cat.key];
        flatsHtml += '<div data-grp="' + g.cat.key + '" style="padding:2px 6px 2px 16px;color:#6f7a8b;cursor:pointer">' +
          CHEV(!col) + g.cat.label + ' <span style="color:#454e5d">(' + g.nodes.length + ')</span></div>';
        if (col) return;
        vis.forEach(n => {                                   // active-blue NOT baked — setActive() paints it
          flatsHtml += '<div data-fid="' + n.id + '" style="padding:3px 6px 3px 32px;cursor:pointer;border-radius:4px;color:#c7cdd8" ' +
            'onmouseover="this.style.background=\'#23262e\'" onmouseout="this.style.background=\'transparent\'">' +
            LEAF + n.label + '  <span style="color:#7f8aa0;font-family:ui-monospace,monospace">' + n.sub + '</span></div>';
        });
      });
      let flatBuilt = false;
      if (flatsHtml !== this._flatsCache) {
        const c = tree.querySelector('#bo-flats'); c.innerHTML = flatsHtml; this._wireFlat(c);
        this._flatsCache = flatsHtml; flatBuilt = true;
      }

      // selection highlight (over whichever DOM survived) + footer
      this.setActive(window.Bonsai._selId);
      const foot = this._el.querySelector('#bo-foot');
      const tip = (window.Bonsai.oplog && window.Bonsai.oplog._lastTip) || '';
      let lens = '';
      if (this._adjLens) { const s = this._adjStats(); lens = '  ⇄' + s.abuts + ' ⌂' + s.fills + ' ⧉' + s.aggregates + ' ⊥' + s.datums; }
      foot.textContent = (f ? shown + '/' + total + ' shown' : total + ' features') + lens + (tip ? '  🔒 ' + tip.slice(0, 8) : '');
      this._lastPaint = { tree: treeBuilt, flat: flatBuilt };   // whitebox witness reads this (W-BONSAI-OUTLINER-INCR)
      console.log(TAG + ' paint total=' + total + ' shown=' + shown + ' find="' + f + '" trees=' + treeCats.length +
        ' treeBuilt=' + treeBuilt + ' flatBuilt=' + flatBuilt + ' §PAINT_MS=' + (performance.now() - __t0).toFixed(1));
    },
    // Flat op-log group/row wiring (scoped to the #bo-flats container so it re-wires only on a flat rebuild).
    // §P4 (W-OL-SYNC): ctrl/cmd-click a row toggles it IN/OUT of the live multi-selection (the same set the
    // canvas shift-click builds) — the Outliner side of multi-select. Returns true when it consumed the click.
    _ctrlToggle(e, fid) {
      if (!(e && (e.ctrlKey || e.metaKey)) || fid == null || !window.Bonsai.selectMany || !window.Bonsai._selSet) return false;
      const ids = new Set(window.Bonsai._selSet);
      if (ids.has(fid)) ids.delete(fid); else ids.add(fid);
      window.Bonsai.selectMany(Array.from(ids));
      console.log(TAG + ' §OLSYNC ctrl-toggle fid=' + fid + ' n=' + ids.size);
      return true;                                          // no fly-to on a multi-toggle (matches canvas shift-click)
    },
    _wireFlat(root) {
      root.querySelectorAll('[data-grp]').forEach(d => d.onclick = () => { const k = d.getAttribute('data-grp'); this._collapsed[k] = !this._collapsed[k]; this._saveCollapsed(); this._paint(); });
      root.querySelectorAll('[data-fid]').forEach(d => d.onclick = (e) => {
        const fid = +d.getAttribute('data-fid');
        if (this._ctrlToggle(e, fid)) return;                // §P4 multi-toggle wins over replace-select
        if (window.Bonsai.select) window.Bonsai.select(fid);   // → highlight() → setActive(): restyle only, no rebuild
        else this.setActive(fid);
        // Outliner→scene camera fly-to (2026-07-02): ONLY on an Outliner-row click, not a 3D pick (you're
        // already looking at what you clicked in the canvas) — window.Bonsai.frameFeature is modeller.html-only
        // (needs camera/controls), so guard for other hosts/tests that don't define it.
        if (window.Bonsai.frameFeature) window.Bonsai.frameFeature(fid);
      });
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
        // W-UX-4: a DISCIPLINE node (n.disc) is a WALKER entry point — render a ▶ walk affordance + carry data-disc.
        const walkGlyph = n.disc ? ' <span class="bn-walk" title="Walk this discipline" style="color:#4fc3f7">▶</span>' : '';
        // W-UX-6: adjacency lens — a NEIGHBOUR of the selected element gets a per-EDGE-TYPE badge (⇄ abuts ·
        // ⌂ fills · ⧉ aggregates) + amber tint; the selected element shows its per-kind degree + its element↔
        // datum relations (⊥ anchored · ↕ spans). All read the derived map (window.swXEdges), never a baked table.
        const nbrMap = (this._adjLens && isLeaf && this._adjMap) ? this._adjMap[window.Bonsai._selId] : null;
        const nbrKinds = (nbrMap && n.id !== window.Bonsai._selId) ? nbrMap.get(n.id) : null;
        const isNbr = !!nbrKinds;
        let adjBadge = '';
        if (isNbr) {
          let g = ''; ['abuts', 'fills', 'aggregates'].forEach(k => { if (nbrKinds.has(k)) g += (this._ADJ_GLYPH[k] || '·'); });
          adjBadge = ' <span class="bn-adj" data-kinds="' + Array.from(nbrKinds).sort().join(',') + '" title="' + Array.from(nbrKinds).sort().join(', ') + ' the selected element" style="color:#e0a23a">' + (g || '⇄') + '</span>';
        } else if (this._adjLens && active && isLeaf && this._adjMap && this._adjMap[n.id]) {
          const m = this._adjMap[n.id], cnt = { abuts: 0, fills: 0, aggregates: 0 };
          m.forEach(ks => ks.forEach(k => { if (k in cnt) cnt[k]++; })); // per-kind neighbour counts
          const dr = this._datumRels(n.id);
          let parts = [];
          if (cnt.abuts) parts.push('⇄' + cnt.abuts); if (cnt.fills) parts.push('⌂' + cnt.fills); if (cnt.aggregates) parts.push('⧉' + cnt.aggregates);
          if (dr.anchored) parts.push('⊥' + dr.anchored); if (dr.spans) parts.push('↕' + dr.spans);
          if (parts.length) adjBadge = ' <span class="bn-deg" style="color:#e0a23a;font-family:ui-monospace,monospace">' + parts.join(' ') + '</span>';
        }
        // active-blue is NOT baked here (M8) — setActive() paints the selected row over the cached DOM so a pure
        // pick never forces a tree rebuild. Neighbour-amber (adjacency lens) stays structural (depends on selId).
        const rowBg = isNbr ? 'background:#2c2616;color:#e6dcc2' : 'color:#c7cdd8';
        html += '<div data-bnode="' + n.id + '" data-tcat="' + ckey + '" data-leaf="' + (isLeaf ? 1 : 0) + '"' +
          (n.disc ? ' data-disc="' + n.disc + '"' : '') + (isNbr ? ' data-adj="1"' : '') + ' draggable="true" ' +
          'style="padding:3px 6px 3px ' + pad + 'px;cursor:' + (isLeaf ? 'grab' : 'pointer') + ';border-radius:4px;' + rowBg + '">' +
          (kids.length ? CHEV(!ncol) : LEAF) + n.label + walkGlyph + adjBadge +
          (n.sub ? '  <span style="color:#7f8aa0;font-family:ui-monospace,monospace">' + n.sub + '</span>' : '') + '</div>';
        if (kids.length && !ncol) { const r = this._renderNodes(kids, depth + 1, ckey, match); html += r.html; shown += r.shown; }
      });
      return { html: html, shown: shown };
    },
    _subtreeMatches(n, match) { if (match({ label: n.label, sub: n.sub || '' })) return true; return (n.children || []).some(c => this._subtreeMatches(c, match)); },
    _wireTrees(root, treeCats) {
      if (!root || !treeCats.length) return;
      const byKey = {}; treeCats.forEach(c => byKey[c.key] = c);
      root.querySelectorAll('[data-tcat]:not([data-bnode])').forEach(d => d.onclick = () => {
        const k = 'tcat|' + d.getAttribute('data-tcat'); this._collapsed[k] = !this._collapsed[k]; this._saveCollapsed(); this._paint();
      });
      root.querySelectorAll('[data-bnode]').forEach(d => {
        const id = d.getAttribute('data-bnode'), isLeaf = d.getAttribute('data-leaf') === '1';
        const disc = d.getAttribute('data-disc');
        d.onclick = (e) => {
          if (isLeaf) {
            // The seeded ARC-BOM tree's leaf id IS THE GUID (bom_tree.js `id: e.guid`) — window.Bonsai.select
            // only accepts a NUMERIC featureId, so resolve guid→featureId via arc_editable.js's bridge
            // (window.__arcFidByGuid) first. A node whose id is ALREADY numeric (a flat/authored tree) is
            // used as-is — this is what actually drives the 3D emissive highlight for an ARC-seeded pick,
            // not just the Outliner row's own paint (setActive's cross-match, see above, handles the rest).
            let num = +id;
            if (isNaN(num) && window.__arcFidByGuid && window.__arcFidByGuid[id] != null) num = window.__arcFidByGuid[id];
            if (!isNaN(num) && this._ctrlToggle(e, num)) return;   // §P4 multi-toggle (resolved fid) wins here too
            // §P5 (W-OL-DEADCLICK) → upgraded by §Q2 (W-E2E-INSTPICK): a non-ARC leaf's GUID never lands in
            // __arcFidByGuid (bridge is ARC-seed-only), but the element's REAL transform is in the open
            // building DB — fly the camera there (frameElementByGuid, elements_meta⋈element_transforms).
            // Only when the DB has no row (or no DB is open) does the honest toast remain.
            if (isNaN(num)) {
              if (window.Bonsai.frameElementByGuid && window.Bonsai.frameElementByGuid(id)) {
                console.log(TAG + ' §OLSYNC instframe guid=' + String(id).slice(0, 12) + ' (framed from real element_transforms row)');
              } else {
                if (window.toast) window.toast('no 3D pick for generated elements yet — walked fixtures render as one batch', 'info');
                console.log(TAG + ' §OLSYNC deadclick guid=' + String(id).slice(0, 12) + ' (no featureId bridge — generated element)');
              }
            }
            if (window.Bonsai.select && !isNaN(num)) window.Bonsai.select(num); else this.setActive(id);
            // Outliner→scene camera fly-to (2026-07-02): ONLY on this Outliner-row click, mirrors the flat-row
            // wiring above (_wireFlat) — guarded since frameFeature is modeller.html-only.
            if (!isNaN(num) && window.Bonsai.frameFeature) window.Bonsai.frameFeature(num);
            // W-UX-6: with the adjacency lens ON, a fresh selection re-folds neighbour highlights (full repaint —
            // setActive only restyles flat data-fid rows; the bom-graph bnode highlights are computed in _paint).
            if (this._adjLens) { const deg = (this._adjMap && this._adjMap[id]) ? this._adjMap[id].size : 0; console.log(TAG + ' §XEDGE-LENS select=' + String(id).slice(0, 10) + ' neighbours=' + deg); this._paint(); }
          }
          else {
            // W-UX-4: a discipline node WALKS on click (and still toggles its subtree). The walker dispatch
            // (STR walk / RouteWalker / honest refusal) is the category's onWalk; pure pointer, no geometry.
            if (disc) { const cat = byKey[d.getAttribute('data-tcat')]; if (cat && cat.onWalk) cat.onWalk(disc); }
            this._collapsed['bn|' + id] = !this._collapsed['bn|' + id]; this._saveCollapsed(); this._paint();
          }
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
