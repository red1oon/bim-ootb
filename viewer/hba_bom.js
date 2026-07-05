// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — HR_BIM_ASSET → VIEWER **BIM BOM** PANE (bim-compiler prompts/RESUME_HBA_ERP_STAGE3.md
//   §Stage 3 item 2 — Witness: W-HBA-BOM-PANE). An EXTRA, ADDITIVE pane mirroring viewer/hba_tenancy.js —
//   NOT a change to the rest of the viewer. ADDITIVE + HOST-INJECTED: imports NOTHING from viewer internals;
//   the host hands it `A` (APP). Renders `A._hbaBomSpec` — the ERP-GOVERNED lens `hr_bim_asset/ad_bom.js
//   readBom()` produced in hba_lens.js `_regovern` over the REAL seeded pp_product_bom/pp_product_bomline
//   rows (§BOM-ERP-CENTERED: the ERP is the authority, the Java m_bom is a retired migration source; this
//   pane is purely a VIEW on the lens — it stores nothing). Room = assembly, contained elements = lines with
//   QtyBOM. Row click flies the camera to the assembly's room via HBALens.flyToZone (same "just a link"
//   idiom as the Tenancy pane); each assembly deep-links into the REAL iDempiere "Bill of Materials and
//   Formula" window (AD_WINDOWS.BOM=53006, looked up live — never guessed). Data gate: the pane is available
//   ONLY when the governed spec carries ≥1 assembly (no ERP db / no 'B' BOMs → honestly greyed, no clutter).
//   ZERO-IMPACT: OFF = no DOM; toggle ON mounts ONE fixed overlay; OFF removes it (zero residue).
//   Read the log after every run.
(function () {
  'use strict';
  var G = (typeof self !== 'undefined' ? self : this);
  var _pane = null;

  function deps() { return { ADB: G.HbaAdBom, Lens: G.HBALens }; }
  function ready() { return !!(deps().ADB && typeof document !== 'undefined'); }

  function spec(A) { return (A && A._hbaBomSpec) || null; }
  // detect gates on the GOVERNED spec (RESUME_HBA_ERP_STAGE3.md item 2: "Detect gates on
  // A._hbaBomSpec.assemblies.length") — no governed BOM rows → pane unavailable, never a literal fallback.
  function detect(A) { var sp = spec(A); return !!(ready() && sp && sp.assemblies && sp.assemblies.length); }

  function el(tag, css, txt) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; }

  function mount(A) {
    var sp = spec(A);
    if (!sp) return false;
    var totalLines = sp.assemblies.reduce(function (s, a) { return s + a.lines.length; }, 0);
    var pane = el('div', 'position:fixed;top:54px;right:12px;width:400px;max-height:82vh;overflow:auto;z-index:10050;' +
      'background:#fff;border-radius:10px;box-shadow:0 6px 24px #0005;font-family:system-ui,sans-serif;color:#222;');
    pane.id = 'hba-bom-pane';
    var building = (sp.assemblies[0] && sp.assemblies[0].building) || 'This Building';
    var head = el('div', 'display:flex;justify-content:space-between;align-items:center;background:#102a43;color:#fff;padding:10px 12px;border-radius:10px 10px 0 0;');
    head.appendChild(el('div', 'font-size:14px;font-weight:600;', 'BIM BOM · ERP-governed (' + building + ')'));
    var x = el('button', 'background:none;border:none;color:#fff;font-size:18px;cursor:pointer;line-height:1;', '×');
    x.title = 'Close'; x.addEventListener('click', function () { toggle(A); });
    head.appendChild(x); pane.appendChild(head);
    pane.appendChild(el('div', 'background:#fff8e1;color:#a06b00;font-weight:700;letter-spacing:1px;font-size:11px;padding:4px 12px;', sp._watermark + ' · CONTOH — TIDAK RASMI'));
    // KPIs — Assemblies (rooms with a native BOM header) · Components (pp_product_bomline rows)
    var kp = el('div', 'display:flex;gap:8px;padding:10px 12px;flex-wrap:wrap;');
    [['Assemblies', sp.assemblies.length], ['Components', totalLines]].forEach(function (k) {
      var c = el('div', 'background:#f4f5f7;border-radius:6px;padding:6px 10px;min-width:60px;');
      c.appendChild(el('div', 'font-size:20px;font-weight:700;color:#102a43;', String(k[1])));
      c.appendChild(el('div', 'font-size:10px;color:#627d98;text-transform:uppercase;', k[0])); kp.appendChild(c);
    });
    pane.appendChild(kp);
    var body = el('div', 'padding:0 12px 12px;');
    var tbl = el('table', 'width:100%;border-collapse:collapse;font-size:12px;');
    sp.assemblies.forEach(function (a) {
      var storey = (A && A._hbaStoreyOf && A._hbaStoreyOf[a.assembly_guid]) || null;
      var tr = el('tr', 'border-top:2px solid #d9e2ec;cursor:pointer;background:#f4f8fb;');
      tr.setAttribute('data-assembly-guid', a.assembly_guid);
      tr.appendChild(el('td', 'padding:7px 4px;font-weight:600;', (a.assembly_name || a.assembly_guid) + (storey ? ' · ' + storey : '')));
      tr.appendChild(el('td', 'padding:7px 4px;text-align:right;color:#627d98;', a.lines.length + ' component' + (a.lines.length === 1 ? '' : 's')));
      // deep-link into the REAL iDempiere BOM window for this pp_product_bom record (never fabricated).
      var linkTd = el('td', 'padding:7px 4px;text-align:right;');
      var lens0 = deps().Lens;
      if (a.bom_id != null && lens0 && lens0.erpLink && lens0.AD_WINDOWS && lens0.AD_WINDOWS.BOM != null) {
        var link = document.createElement('a');
        link.href = lens0.erpLink(lens0.AD_WINDOWS.BOM, a.bom_id);
        link.target = '_blank'; link.rel = 'noopener'; link.textContent = 'open ↗';
        link.title = 'Open this BOM in iDempiere (Bill of Materials and Formula)';
        link.style.cssText = 'color:#1976d2;text-decoration:none;font-size:11px;';
        link.addEventListener('click', function (e) { e.stopPropagation(); });
        linkTd.appendChild(link);
      }
      tr.appendChild(linkTd);
      tr.addEventListener('click', function () {
        var lens = deps().Lens;
        var res = lens && lens.flyToZone ? lens.flyToZone(A, a.assembly_guid) : { flew: false };
        console.log('§HBA_BOM_LINK guid=' + a.assembly_guid + ' flew=' + res.flew + (res.center ? ' center=(' + res.center.x.toFixed(1) + ',' + res.center.y.toFixed(1) + ',' + res.center.z.toFixed(1) + ')' : ''));
      });
      tbl.appendChild(tr);
      a.lines.forEach(function (ln) {
        var lr = el('tr', 'border-top:1px solid #f0f0f0;');
        lr.setAttribute('data-line-id', String(ln.line_id));
        lr.appendChild(el('td', 'padding:4px 4px 4px 18px;color:#334e68;', ln.component_name || ln.component_guid));
        lr.appendChild(el('td', 'padding:4px;text-align:right;color:#627d98;', 'Qty ' + (ln.qty != null ? ln.qty : '—')));
        lr.appendChild(el('td', ''));
        tbl.appendChild(lr);
      });
    });
    body.appendChild(tbl);
    pane.appendChild(body);
    // §MOBILE-STACK — desktop unchanged; mobile = card-stack host (inline fallback if module absent).
    (G.HbaPaneHost ? G.HbaPaneHost.present
      : function (p, h) { (document.body || document.documentElement).appendChild(p); if (G.HbaDraggable) G.HbaDraggable.enable(p, h); }
    )(pane, head, A);
    _pane = pane;
    console.log('§HBA_BOM_PANE mounted assemblies=' + sp.assemblies.length + ' components=' + totalLines + ' building=' + building);
    return true;
  }

  function unmount() {
    if (_pane && _pane.parentNode) _pane.parentNode.removeChild(_pane);
    else if (_pane && typeof _pane.remove === 'function') _pane.remove();
    _pane = null;
    console.log('§HBA_BOM_PANE unmounted (zero residue)');
    return false;
  }

  function toggle(A) {
    if (!ready()) { if (A && A.status) A.status.textContent = 'BIM BOM lens not loaded'; return false; }
    return _pane ? unmount() : mount(A);
  }
  function isActive() { return !!_pane; }

  G.HBABomPane = { toggle: toggle, detect: detect, isActive: isActive, _ready: ready, _spec: spec };
  if (typeof module === 'object' && module.exports) module.exports = G.HBABomPane;
})();
