// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — HR_BIM_ASSET → VIEWER TENANCY/AD PANE (RESUME_HR_BIM_ASSET.md §P10-BUILD + §P10a, user
//   2026-07-02). An EXTRA, ADDITIVE pane mirroring hba_leave.js's pattern — NOT a change to the rest of the
//   viewer. ADDITIVE + HOST-INJECTED: imports NOTHING from viewer internals; the host hands it `A` (APP).
//   Renders `hr_bim_asset/ad_tenancy.js`'s already-compiled `A._hbaTenancySpec` (native Warehouse/Locator/
//   Product/Subscription rows — "Compile not Model", §CRITICAL) — no new schema, this is the VIEW on the
//   compile layer. Party display resolves through MODELS.Official (§P10a: AD_User is the primary spatial
//   identity — name/email/phone; an honest miss shows the bare code, never a fabricated name). Row click flies
//   the camera to the unit via HBALens.flyToZone (§FIND-FM-LINK, "just a link"). ZERO-IMPACT: OFF = no DOM;
//   toggle ON mounts ONE fixed overlay; toggle OFF removes it (zero residue). Read the log after run.
(function () {
  'use strict';
  var G = (typeof self !== 'undefined' ? self : this);
  var _pane = null;

  function deps() { return { M: G.HbaModels, ADT: G.HbaAdTenancy, Lens: G.HBALens }; }
  function ready() { return !!(deps().M && deps().ADT && typeof document !== 'undefined'); }

  function spec(A) { return (A && A._hbaTenancySpec) || null; }
  function detect(A) { var sp = spec(A); return !!(ready() && sp && sp.subscriptions && sp.subscriptions.length); }

  function el(tag, css, txt) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; }

  function cadenceName(subTypeId) {
    var d = deps(); var types = (d.ADT && d.ADT.SUBSCRIPTION_TYPES) || {};
    var hit = Object.keys(types).map(function (k) { return types[k]; }).filter(function (t) { return t.c_subscriptiontype_id === subTypeId; })[0];
    return hit ? hit.name : ('type ' + subTypeId);
  }

  function partyLabel(code) {
    var o = deps().M.officialByName(code);
    return o ? o.name + (o.phone ? ' · ' + o.phone : '') : code;
  }

  function mount(A) {
    var sp = spec(A);
    if (!sp) return false;
    var pane = el('div', 'position:fixed;top:54px;right:12px;width:380px;max-height:82vh;overflow:auto;z-index:10050;' +
      'background:#fff;border-radius:10px;box-shadow:0 6px 24px #0005;font-family:system-ui,sans-serif;color:#222;');
    pane.id = 'hba-tenancy-pane';
    var head = el('div', 'display:flex;justify-content:space-between;align-items:center;background:#102a43;color:#fff;padding:10px 12px;border-radius:10px 10px 0 0;');
    head.appendChild(el('div', 'font-size:14px;font-weight:600;', 'Tenancy · AD Compile (' + sp.warehouse.name + ')'));
    var x = el('button', 'background:none;border:none;color:#fff;font-size:18px;cursor:pointer;line-height:1;', '×');
    x.title = 'Close'; x.addEventListener('click', function () { toggle(A); });
    head.appendChild(x); pane.appendChild(head);
    pane.appendChild(el('div', 'background:#fff8e1;color:#a06b00;font-weight:700;letter-spacing:1px;font-size:11px;padding:4px 12px;', sp._watermark + ' · CONTOH — TIDAK RASMI'));
    // KPIs — Warehouse · Units-derived · Leases · Strata (§P10-BUILD point 3)
    var kp = el('div', 'display:flex;gap:8px;padding:10px 12px;flex-wrap:wrap;');
    var leases = sp.subscriptions.filter(function (s) { return s.kind === 'tenancy'; }).length;
    var strata = sp.subscriptions.filter(function (s) { return s.kind === 'strata'; }).length;
    [['Units', sp.units], ['Leases', leases], ['Strata', strata]].forEach(function (k) {
      var c = el('div', 'background:#f4f5f7;border-radius:6px;padding:6px 10px;min-width:60px;');
      c.appendChild(el('div', 'font-size:20px;font-weight:700;color:#102a43;', String(k[1])));
      c.appendChild(el('div', 'font-size:10px;color:#627d98;text-transform:uppercase;', k[0])); kp.appendChild(c);
    });
    pane.appendChild(kp);
    var body = el('div', 'padding:0 12px 12px;');
    var tbl = el('table', 'width:100%;border-collapse:collapse;font-size:12px;');
    sp.subscriptions.forEach(function (s) {
      var tr = el('tr', 'border-top:1px solid #eee;cursor:pointer;');
      tr.setAttribute('data-unit-guid', s.unit_guid);
      tr.appendChild(el('td', 'padding:6px 4px;', (s.row.name || '—') + ' · ' + partyLabel(s.row.c_bpartner_id)));
      tr.appendChild(el('td', 'padding:6px 4px;color:#627d98;', s.storey || '—'));
      tr.appendChild(el('td', 'padding:6px 4px;text-align:right;', cadenceName(s.row.c_subscriptiontype_id)));
      tr.appendChild(el('td', 'padding:6px 4px;text-align:right;color:#627d98;', (s.row.startdate || '—') + '→' + (s.row.renewaldate || '—')));
      tr.addEventListener('click', function () {
        var lens = deps().Lens;
        var res = lens && lens.flyToZone ? lens.flyToZone(A, s.unit_guid) : { flew: false };
        console.log('§HBA_TEN_LINK guid=' + s.unit_guid + ' flew=' + res.flew + (res.center ? ' center=(' + res.center.x.toFixed(1) + ',' + res.center.y.toFixed(1) + ',' + res.center.z.toFixed(1) + ')' : ''));
      });
      tbl.appendChild(tr);
    });
    body.appendChild(tbl);
    if (sp.skipped.length) {
      body.appendChild(el('div', 'font-size:11px;color:#c62828;padding:6px 2px 0;',
        sp.skipped.length + ' record(s) skipped — unit_guid not a real room in this building (never fabricated)'));
    }
    pane.appendChild(body);
    (document.body || document.documentElement).appendChild(pane);
    if (G.HbaDraggable) G.HbaDraggable.enable(pane, head);   // §P10b — drag by the header
    _pane = pane;
    console.log('§HBA_TEN_PANE mounted units=' + sp.units + ' leases=' + leases + ' strata=' + strata + ' skipped=' + sp.skipped.length);
    return true;
  }

  function unmount() {
    if (_pane && _pane.parentNode) _pane.parentNode.removeChild(_pane);
    else if (_pane && typeof _pane.remove === 'function') _pane.remove();
    _pane = null;
    console.log('§HBA_TEN_PANE unmounted (zero residue)');
    return false;
  }

  function toggle(A) {
    if (!ready()) { if (A && A.status) A.status.textContent = 'HR tenancy not loaded'; return false; }
    return _pane ? unmount() : mount(A);
  }
  function isActive() { return !!_pane; }

  G.HBATenancyPane = { toggle: toggle, detect: detect, isActive: isActive, _ready: ready, _spec: spec };
  if (typeof module === 'object' && module.exports) module.exports = G.HBATenancyPane;
})();
