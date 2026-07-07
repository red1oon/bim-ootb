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
  // §POLISH3 §V1 eye-toggle glyphs (lucide eye / eye-off, verbatim paths).
  const EYE = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></svg>';

  function gridRef(pt) {
    if (!pt || !window.Bonsai.grid || !window.Bonsai.grid.xs.length) return null;
    const r = window.Bonsai.grid.refAt(pt[0], pt[1]);
    return (r.x || r.y) ? ((r.x || '·') + '-' + (r.y || '·')) : null;
  }

  const Outliner = {
    _el: null, _find: '', _collapsed: {}, _categories: [],
    // §POLISH3 state (RESUME_MODELLER_POLISH3.md):
    // _hidden   §V1 eye-toggle lens — node id → true (in-memory only; visibility is a lens, not layout).
    // _chunkWin §V4 windowed sibling lists — window key → how many OL_CHUNK windows are open.
    // _painted  §V4 O(k) pick restyle — the rows setActive painted last time (only these get restored).
    // _lastRoots one cat.tree() fold per paint, reused by dim/hide/expand walks (no re-fold per feature).
    _hidden: {}, _chunkWin: {}, _painted: [], _lastRoots: {}, _hoverRow: null, _expanding: false,
    _chunk() { return (typeof window !== 'undefined' && window.OL_CHUNK) || 250; },
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
          node: op => { const prof = op.parameters.profile;
            // circle profile (W-E2E-SKETCH-CIRCLE): profile.circle {cx,cy,r} sibling key — no point ring to gridRef
            if (prof.circle) return { id: op.id, label: 'Column', sub: '⌀' + (2 * prof.circle.r).toFixed(2) + 'm' };
            const p = prof.points; const a = gridRef(p[0]), b = gridRef(p[1]);
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
      // §POLISH3 §V4c delegated hover: ONE listener pair on the tree container replaces the per-row
      // handler rebinding setActive used to redo on EVERY pick (that rebind was O(all rows) per pick).
      const treeEl = el.querySelector('#bo-tree');
      const rowOf = t => (t && t.closest) ? t.closest('[data-fid],[data-bnode][data-leaf="1"]') : null;
      treeEl.addEventListener('mouseover', e => {
        const d = rowOf(e.target); if (d === this._hoverRow) return;
        this._unhover();
        if (!d) return;
        this._hoverRow = d;
        if (d.dataset.sel !== 'p') d.style.background = '#23262e';
        const fid = this._rowFid(d);
        if (fid != null && window.Bonsai.hoverFeature) window.Bonsai.hoverFeature(fid);   // §P2 row → canvas glow
      });
      treeEl.addEventListener('mouseout', e => {
        const d = rowOf(e.target); if (!d || d !== this._hoverRow) return;
        if (rowOf(e.relatedTarget) === d) return;                     // still inside the same row
        this._unhover();
      });
      treeEl.addEventListener('mouseleave', () => this._unhover());
      window.addEventListener('bonsai:oplog', () => this.refresh());
      this.refresh();
      console.log(TAG + ' mounted categories=' + this._categories.map(c => c.key).join(','));
      return el;
    },
    _unhover() {
      const d = this._hoverRow; this._hoverRow = null;
      if (d && d.isConnected) { const b = this._rowBase(d); d.style.background = b.bg; d.style.color = b.color; }
      if (d && window.Bonsai.hoverFeature) window.Bonsai.hoverFeature(null);
    },
    // structural base style of a row, derivable at any time from its own attributes (delegated restore).
    _rowBase(d) {
      if (d.dataset.sel === 'p') return { bg: '#26456b', color: '#dce6f4' };
      if (d.dataset.sel === 's') return { bg: '#1d3550', color: '#c3d2e6' };
      if (d.getAttribute('data-adj') === '1') return { bg: '#2c2616', color: '#e6dcc2' };
      return { bg: 'transparent', color: '#c7cdd8' };
    },
    // a row's numeric featureId (flat rows carry it; seeded bnode rows resolve guid→fid via the ARC bridge).
    _rowFid(d) {
      if (d.hasAttribute('data-fid')) return +d.getAttribute('data-fid');
      const bn = d.getAttribute('data-bnode');
      const fidByGuid = (typeof window !== 'undefined' && window.__arcFidByGuid) || {};
      if (fidByGuid[bn] != null) return fidByGuid[bn];
      return isNaN(+bn) ? null : +bn;
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
    // §POLISH3 §V4b (Witness: W-E2E-OLVIRT): O(selection) restyle. The old body swept EVERY row twice per
    // pick (querySelectorAll + a per-row hover-handler rebind). Now: restore only the rows painted LAST time
    // (this._painted), then paint only the rows of the CURRENT selection via targeted [data-…="id"] lookups.
    // Hover moved to ONE delegated listener (mount). GUID↔featureId cross-match preserved (a 3D pick passes
    // the numeric fid, seeded rows are keyed by guid — window.__arcFidByGuid/__arcGuidByFid bridge, 2026-07-02).
    // §P3/§P4 multi-select parity preserved: secondaries painted from window.Bonsai._selSet.
    setActive(id) {
      window.Bonsai._selId = id;
      if (!this._el) return;
      const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
      (this._painted || []).forEach(d => {
        if (!d || !d.isConnected) return;
        delete d.dataset.sel;
        const b = this._rowBase(d); d.style.background = b.bg; d.style.color = b.color;
      });
      this._painted = [];
      const guidByFid = (typeof window !== 'undefined' && window.__arcGuidByFid) || {};
      const fidByGuid = (typeof window !== 'undefined' && window.__arcFidByGuid) || {};
      const altId = guidByFid[id] != null ? guidByFid[id] : fidByGuid[id];
      const selSet = (typeof window !== 'undefined' && window.Bonsai && window.Bonsai._selSet) || null;
      const esc = s => (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(String(s)) : String(s).replace(/["\\\]]/g, '\\$&');
      const rowsFor = (theId) => {
        if (theId == null) return [];
        const out = [];
        let d = this._el.querySelector('[data-fid="' + esc(theId) + '"]'); if (d) out.push(d);
        d = this._el.querySelector('[data-bnode="' + esc(theId) + '"][data-leaf="1"]'); if (d) out.push(d);
        return out;
      };
      const paint = (d, kind) => {
        if (d.dataset.sel === 'p') return;                  // primary wins over a secondary re-paint
        d.dataset.sel = kind;
        const b = this._rowBase(d); d.style.background = b.bg; d.style.color = b.color;
        this._painted.push(d);
      };
      let activeEl = null;
      if (id != null) {
        rowsFor(id).concat(rowsFor(altId)).forEach(d => { paint(d, 'p'); if (!activeEl) activeEl = d; });
        if (selSet) selSet.forEach(fid => {
          if (fid === id || (altId != null && fid === altId)) return;
          rowsFor(fid).concat(rowsFor(guidByFid[fid])).forEach(d => paint(d, 's'));
        });
        // §V3 auto-expand on pick: the picked row lives inside a collapsed ancestor (or beyond a chunk
        // window) → expand the ancestor path + widen the window, repaint ONCE, retry. One level of
        // recursion only (_expanding); a genuinely absent id stays a clean no-op as before.
        if (!activeEl && !this._expanding && this._expandTo(id, altId)) {
          this._expanding = true;
          try { this._paint(); } finally { this._expanding = false; }
          return;                                           // _paint → setActive retry painted + scrolled it
        }
      }
      if (activeEl && activeEl.scrollIntoView) activeEl.scrollIntoView({ block: 'nearest' });
      const ms = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : 0) - t0;
      window.__olPickStats = { restyled: this._painted.length, ms: ms };   // W-E2E-OLVIRT oracle
      console.log(TAG + ' §OLPICK id=' + String(id).slice(0, 12) + ' restyled=' + this._painted.length + ' ms=' + ms.toFixed(1));
    },
    // §V3: expand every collapsed ancestor of `id` (tree cats: tcat header + bn| nodes; flat cats: the group)
    // and widen the §V4 chunk windows so the row's index is inside its parent's open window. Returns true when
    // anything changed (caller repaints). Reads this._lastRoots (the fold captured by the last _paint).
    _expandTo(id, altId) {
      let changed = false;
      const tryTree = (t) => {
        for (const cat of this._categories.filter(c => c.tree)) {
          const roots = this._lastRoots[cat.key] || [];
          const findPath = (nodes, anc) => {
            for (const n of (nodes || [])) {
              if (String(n.id) === t) return anc.concat([n]);
              const p = findPath(n.children, anc.concat([n]));
              if (p) return p;
            }
            return null;
          };
          const p = findPath(roots, []);
          if (!p) continue;
          if (this._collapsed['tcat|' + cat.key]) { delete this._collapsed['tcat|' + cat.key]; changed = true; }
          p.slice(0, -1).forEach(n => { if (this._collapsed['bn|' + n.id]) { delete this._collapsed['bn|' + n.id]; changed = true; } });
          for (let i = 0; i < p.length; i++) {
            const parent = i === 0 ? null : p[i - 1];
            const siblings = i === 0 ? roots : (parent.children || []);
            const winKey = parent ? String(parent.id) : ('roots|' + cat.key);
            const idx = siblings.indexOf(p[i]);
            const need = Math.ceil((idx + 1) / this._chunk());
            if (idx >= 0 && (this._chunkWin[winKey] || 1) < need) { this._chunkWin[winKey] = need; changed = true; }
          }
          return true;
        }
        return false;
      };
      const tryFlat = (t) => {
        const ops = (window.Bonsai.oplog && window.Bonsai.oplog.db) ? window.Bonsai.oplog._geomOps() : [];
        for (const cat of this._categories.filter(c => !c.tree)) {
          const idx = ops.filter(cat.match).map(cat.node).findIndex(n => String(n.id) === t);
          if (idx < 0) continue;
          if (this._collapsed[cat.key]) { delete this._collapsed[cat.key]; changed = true; }
          const winKey = 'flat|' + cat.key;
          const need = Math.ceil((idx + 1) / this._chunk());
          if ((this._chunkWin[winKey] || 1) < need) { this._chunkWin[winKey] = need; changed = true; }
          return true;
        }
        return false;
      };
      [id, altId].some(x => x != null && (tryTree(String(x)) || tryFlat(String(x))));
      if (changed) { this._saveCollapsed(); console.log(TAG + ' §OLEXPAND id=' + String(id).slice(0, 12) + ' (auto-expanded collapsed ancestors / widened window)'); }
      return changed;
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

      // §POLISH3: fold each tree category ONCE per paint; dim/hide/expand walks below reuse this._lastRoots.
      this._lastRoots = {};
      treeCats.forEach(cat => { this._lastRoots[cat.key] = (cat.tree ? cat.tree() : []) || []; });
      // §V1 honesty: an eye renders ONLY where it can actually act on the scene — a leaf whose guid/id
      // resolves to a real mesh, a discipline node (whole walked bucket), or a group containing one. A row
      // that can't change the 3D view gets NO eye (never a toggle that silently does nothing).
      {
        const fidByGuid = (typeof window !== 'undefined' && window.__arcFidByGuid) || {};
        const mark = (n) => {
          let h = false;
          if (n.kind === 'element') h = fidByGuid[n.id] != null || !isNaN(+n.id);
          if (n.dwp) h = true;   // §I5 (W-E2E-INSTHIDE): a walked-instance row acts via setPlacementVisible
          if (n.disc) h = true;
          (n.children || []).forEach(c => { if (mark(c)) h = true; });
          n._hidable = h; return h;
        };
        treeCats.forEach(cat => (this._lastRoots[cat.key] || []).forEach(mark));
      }

      // ── SEEDED TREE section (ARC LEADS, W-UX-3) — re-rendered only when its HTML actually changes ──────────
      let treesHtml = '';
      treeCats.forEach(cat => {
        // §I5: a hideWhenEmpty category with an empty fold contributes NOTHING (no dead header pre-walk)
        if (cat.hideWhenEmpty && !(this._lastRoots[cat.key] || []).length) return;
        const r = this._treeHtml(cat, match); treesHtml += r.html; total += r.total; shown += r.shown;
      });
      let treeBuilt = false;
      if (treesHtml !== this._treesCache) {
        const c = tree.querySelector('#bo-trees'); c.innerHTML = treesHtml; this._wireTrees(c, treeCats);
        this._treesCache = treesHtml; treeBuilt = true;
      }

      // ── FLAT op-log groups — grows with authored features; the only section a geometry commit changes ──────
      // §V4a: the flat lists get the same chunk WINDOW as tree siblings (hover is delegated, nothing inline).
      const groups = flatCats.map(cat => ({ cat, nodes: ops.filter(cat.match).map(cat.node) }));
      let flatsHtml = '';
      groups.forEach(g => {
        const vis = g.nodes.filter(match); total += g.nodes.length; shown += vis.length;
        if (f && !vis.length) return;
        const col = this._collapsed[g.cat.key];
        flatsHtml += '<div data-grp="' + g.cat.key + '" style="padding:2px 6px 2px 16px;color:#6f7a8b;cursor:pointer">' +
          CHEV(!col) + g.cat.label + ' <span style="color:#454e5d">(' + g.nodes.length + ')</span></div>';
        if (col) return;
        const winKey = 'flat|' + g.cat.key, cap = this._chunk() * (this._chunkWin[winKey] || 1);
        vis.slice(0, cap).forEach(n => {                     // active-blue NOT baked — setActive() paints it
          flatsHtml += '<div data-fid="' + n.id + '" style="padding:3px 6px 3px 32px;cursor:pointer;border-radius:4px;color:#c7cdd8">' +
            LEAF + n.label + '  <span style="color:#7f8aa0;font-family:ui-monospace,monospace">' + n.sub + '</span></div>';
        });
        if (vis.length > cap) flatsHtml += this._moreRow(winKey, vis.length - cap, 32);
      });
      let flatBuilt = false;
      if (flatsHtml !== this._flatsCache) {
        const c = tree.querySelector('#bo-flats'); c.innerHTML = flatsHtml; this._wireFlat(c);
        this._flatsCache = flatsHtml; flatBuilt = true;
      }

      // §POLISH3 §V2 (Witness: W-E2E-OLFILTER): the find box now reaches the SCENE — matched elements keep
      // full opacity, everything else ghosts (dim, not hide — spec §V2). Matched sets are computed off the
      // SAME fold this paint used; walked disciplines match bucket-level (§DECISIONS-2).
      if (window.Bonsai.dimExcept) {
        if (!f) window.Bonsai.dimExcept(null);
        else {
          const fidByGuid = (typeof window !== 'undefined' && window.__arcFidByGuid) || {};
          const fids = new Set(), discs = new Set();
          groups.forEach(g => g.nodes.filter(match).forEach(n => fids.add(n.id)));
          treeCats.forEach(cat => {
            const walk = (n, discAnc, ancMatched) => {
              const d2 = n.disc || discAnc;
              const m = ancMatched || match({ label: n.label, sub: n.sub || '' });
              if (n.kind === 'element') {
                if (!m) return;
                const fid = fidByGuid[n.id] != null ? fidByGuid[n.id] : (isNaN(+n.id) ? null : +n.id);
                if (fid != null) fids.add(fid);
                if (d2) discs.add(d2);
              } else (n.children || []).forEach(c => walk(c, d2, m));
            };
            (this._lastRoots[cat.key] || []).forEach(r => walk(r, null, false));
          });
          window.Bonsai.dimExcept({ fids: fids, discs: discs });
        }
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
    // §V4a: a "… show N more" click opens the next window on that sibling list (shared by both sections).
    _wireMore(root) {
      root.querySelectorAll('[data-more]').forEach(d => d.onclick = () => {
        const k = d.getAttribute('data-more');
        this._chunkWin[k] = (this._chunkWin[k] || 1) + 1;
        console.log(TAG + ' §OLWINDOW widen ' + k + ' → windows=' + this._chunkWin[k] + ' (cap=' + this._chunk() * this._chunkWin[k] + ')');
        this._paint();
      });
    },
    _wireFlat(root) {
      this._wireMore(root);
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
    // §V4a: the "… show N more" window-widening row (one per over-cap sibling list).
    _moreRow(winKey, hiddenN, pad) {
      return '<div data-more="' + winKey + '" style="padding:3px 6px 3px ' + pad + 'px;cursor:pointer;color:#6f9fd8">' +
        '… show ' + Math.min(hiddenN, this._chunk()) + ' more <span style="color:#454e5d">(' + hiddenN + ' windowed)</span></div>';
    },
    _treeHtml(cat, match) {
      const roots = this._lastRoots[cat.key] || (cat.tree ? cat.tree() : []) || [];
      const ckey = 'tcat|' + cat.key, col = this._collapsed[ckey];
      let leafTotal = 0; const countLeaves = ns => ns.forEach(n => { if (n.kind === 'element') leafTotal++; if (n.children) countLeaves(n.children); });
      countLeaves(roots);
      let html = '<div data-tcat="' + cat.key + '" style="padding:2px 6px 2px 16px;color:#6f7a8b;cursor:pointer">' +
        CHEV(!col) + cat.label + ' <span style="color:#454e5d">(' + leafTotal + ')</span></div>';
      let shown = 0;
      if (!col) { const r = this._renderNodes(roots, 1, cat.key, match, 'roots|' + cat.key, false); html += r.html; shown = r.shown; }
      return { html: html, total: leafTotal, shown: shown };
    },
    // §POLISH3 §V4a (Witness: W-E2E-OLVIRT): WINDOWED sibling lists — any node with more visible children
    // than the open window (OL_CHUNK × opened windows) renders the window + ONE "… show N more" row. Bounds
    // the whole-tree DOM at Terminal scale (an honest 80% cut, NOT a virtual scroller — spec §V4).
    // §V1: every row carries an eye toggle; a hidden node's subtree renders dimmed (ancHidden).
    _renderNodes(nodes, depth, ckey, match, parentKey, ancHidden) {
      let html = '', shown = 0;
      const visNodes = (nodes || []).filter(n => !this._find || this._subtreeMatches(n, match));
      const cap = this._chunk() * (this._chunkWin[parentKey] || 1);
      visNodes.slice(0, cap).forEach(n => {
        const kids = n.children || [];
        const isLeaf = n.kind === 'element';
        if (isLeaf) shown++;
        const ncol = this._collapsed['bn|' + n.id];
        const active = window.Bonsai._selId === n.id;      // adjacency-lens degree badge below reads this
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
        // §FIND-HIGHLIGHT (2026-07-04): a row whose OWN label/sub matches the find text (not just an ancestor
        // of a match) gets a distinct highlight — "found it, right here" vs. "this folder contains a match
        // somewhere below". Reuses the SAME `match` closure _subtreeMatches already applies; no new match logic.
        const selfMatch = !!this._find && match({ label: n.label, sub: n.sub || '' });
        const rowBg = selfMatch ? 'background:#123a44;color:#bdeaf7' : isNbr ? 'background:#2c2616;color:#e6dcc2' : 'color:#c7cdd8';
        // §V1 eye toggle: own-hidden shows eye-off; a row inside a hidden ancestor renders dimmed too.
        // Only _hidable rows get an eye (marked in _paint — never a toggle that silently does nothing).
        const ownHid = !!this._hidden[n.id], hid = ownHid || ancHidden;
        const eye = !n._hidable ? '' : '<span class="bn-eye" data-eye="' + n.id + '" title="' + (ownHid ? 'show' : 'hide') + ' in 3D" ' +
          'style="float:right;padding:0 2px;color:' + (ownHid ? '#e0a23a' : '#5b6473') + ';opacity:' + (ownHid ? '1' : '.55') + '">' +
          (ownHid ? EYE_OFF : EYE) + '</span>';
        // §FIND-EXPAND (2026-07-04): while searching, a match hiding inside a COLLAPSED ancestor used to be
        // completely invisible — _subtreeMatches correctly kept the ancestor row shown, but the recursion
        // below never opened it, so the actual matching leaf/twig never rendered at all (silent false-negative
        // from the user's POV: "I searched and got nothing" when the row existed, just collapsed). `visNodes`
        // above already restricts this branch to ones that DO contain a match, so forcing it open here only
        // ever reveals real hits — never "expand everything" while searching.
        const showKids = kids.length && (!ncol || !!this._find);
        html += '<div data-bnode="' + n.id + '" data-tcat="' + ckey + '" data-leaf="' + (isLeaf ? 1 : 0) + '"' +
          (n.disc ? ' data-disc="' + n.disc + '"' : '') + (isNbr ? ' data-adj="1"' : '') + (hid ? ' data-hid="1"' : '') + ' draggable="true" ' +
          'style="padding:3px 6px 3px ' + pad + 'px;cursor:' + (isLeaf ? 'grab' : 'pointer') + ';border-radius:4px;' +
          (hid ? 'opacity:.45;' : '') + rowBg + '">' + eye +
          (kids.length ? CHEV(showKids) : LEAF) + n.label + walkGlyph + adjBadge +
          (n.sub ? '  <span style="color:#7f8aa0;font-family:ui-monospace,monospace">' + n.sub + '</span>' : '') + '</div>';
        if (showKids) { const r = this._renderNodes(kids, depth + 1, ckey, match, String(n.id), hid); html += r.html; shown += r.shown; }
      });
      if (visNodes.length > cap) html += this._moreRow(parentKey, visNodes.length - cap, 16 + depth * 14);
      return { html: html, shown: shown };
    },
    // §POLISH3 §V1 (Witness: W-E2E-OLEYE): eye-toggle → scene. Deterministic re-apply: reset EVERYTHING
    // visible, then hide every _hidden subtree (leaf → its featureId mesh via the ARC bridge; a DISCIPLINE
    // node → its whole walked bucket, per-instance hide DEFERRED per §DECISIONS-2; a group → its descendants).
    _toggleHide(id) {
      if (this._hidden[id]) delete this._hidden[id]; else this._hidden[id] = true;
      const applied = this._applyHidden();
      console.log(TAG + ' §OLEYE toggle id=' + String(id).slice(0, 14) + ' nowHidden=' + !!this._hidden[id] +
        ' hiddenNodes=' + Object.keys(this._hidden).length + ' sceneApplied=' + applied);
      this._paint();
    },
    _applyHidden() {
      const B = (typeof window !== 'undefined' && window.Bonsai) || {};
      if (B.setAllVisible) B.setAllVisible();
      const fidByGuid = (typeof window !== 'undefined' && window.__arcFidByGuid) || {};
      let applied = 0;
      const hideNode = (n) => {
        if (n.kind === 'element') {
          const fid = fidByGuid[n.id] != null ? fidByGuid[n.id] : (isNaN(+n.id) ? null : +n.id);
          if (fid != null && B.setFeatureVisible && B.setFeatureVisible(fid, false)) applied++;
        }
        // §I5 (SPEC_INSTANCE_HIDE.md §I5d — Witness: W-E2E-INSTHIDE): a walked-instance node hides its
        // exact (im, instanceId) twins inside the InstancedMesh bucket(s) + the folded authored _dw twin
        // (§I5b-TWIN) — the §V1-deferred per-instance leg. n.dwp.asm=true → an assembly part (§I5b-ASM).
        if (n.dwp && B.setPlacementVisible) applied += B.setPlacementVisible(n.dwp.disc, n.dwp.idx, false, n.dwp.asm);
        if (n.disc && B.setDiscVisible) applied += B.setDiscVisible(n.disc, false);
        (n.children || []).forEach(hideNode);
      };
      this._categories.filter(c => c.tree).forEach(cat => {
        const walk = (n) => { if (this._hidden[n.id]) hideNode(n); else (n.children || []).forEach(walk); };
        (this._lastRoots[cat.key] || []).forEach(walk);
      });
      return applied;
    },
    _subtreeMatches(n, match) { if (match({ label: n.label, sub: n.sub || '' })) return true; return (n.children || []).some(c => this._subtreeMatches(c, match)); },
    _wireTrees(root, treeCats) {
      if (!root || !treeCats.length) return;
      this._wireMore(root);
      const byKey = {}; treeCats.forEach(c => byKey[c.key] = c);
      root.querySelectorAll('[data-tcat]:not([data-bnode])').forEach(d => d.onclick = () => {
        const k = 'tcat|' + d.getAttribute('data-tcat'); this._collapsed[k] = !this._collapsed[k]; this._saveCollapsed(); this._paint();
      });
      root.querySelectorAll('[data-bnode]').forEach(d => {
        const id = d.getAttribute('data-bnode'), isLeaf = d.getAttribute('data-leaf') === '1';
        const disc = d.getAttribute('data-disc');
        d.onclick = (e) => {
          // §V1: the eye toggle owns its click — never a select/collapse.
          if (e && e.target && e.target.closest && e.target.closest('.bn-eye')) { this._toggleHide(id); return; }
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
              // §I5: a Walked-Fixtures row (dwp|disc|idx) identifies + frames its exact instance — the
              // production pickInstance path, not the "walked fixtures render as one batch" toast (stale
              // since §Q2 landed instance identity).
              if (window.Bonsai.frameInstanceRow && window.Bonsai.frameInstanceRow(id)) {
                console.log(TAG + ' §OLSYNC instrow id=' + String(id).slice(0, 18) + ' (identified + framed walked instance)');
              } else if (window.Bonsai.frameElementByGuid && window.Bonsai.frameElementByGuid(id)) {
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
