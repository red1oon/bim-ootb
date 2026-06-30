// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — HR_BIM_ASSET → VIEWER DASHBOARD PANE (RESUME_HR_BIM_ASSET.md §RESUME — occupancy dashboard
//   UI). An EXTRA, ADDITIVE pane — NOT a change to the rest of the viewer. ADDITIVE + HOST-INJECTED: imports
//   NOTHING from viewer internals; the host hands it `A` (APP). It renders the WITNESSED dashboard config
//   (hr_bim_asset/dashboard.js → occupancy.pivot + request.aging) with the ALREADY-BUNDLED Chart.js. ZERO-IMPACT:
//   OFF = no DOM (pixel-identical); toggle ON mounts ONE fixed overlay (its own div + canvases); toggle OFF
//   removes it + destroys its charts (zero residue). It never touches the 3D scene, other panels, or sw.js.
//   Data source = host-injected A._hbaOccupancyLog / A._hbaRequestLog (seeded from the model's real rooms by
//   hba_lens.js); honest empty when none. Read the log after run.
(function () {
  'use strict';
  var G = (typeof self !== 'undefined' ? self : this);
  var _pane = null, _charts = [];

  function deps() { return { D: G.HbaDashboard, Oc: G.HbaOccupancy, Rq: G.HbaRequest }; }
  function ready() { var d = deps(); return !!(d.D && d.Oc && typeof document !== 'undefined'); }

  function periods() { var p = []; for (var m = 1; m <= 12; m++) p.push('2026-' + ('0' + m).slice(-2)); return p; }

  // build the dashboard payload from the host-injected logs (+ the model's real rooms for allResources/storey).
  function dataFor(A) {
    var d = deps();
    var opts = { asOf: '2026-05-10T00:00:00Z', locale: 'en' };
    if (A._hbaRooms) opts.allResources = A._hbaRooms.map(function (r) { return r.guid; });
    if (A._hbaStoreyOf) opts.storeyOf = function (r) { return A._hbaStoreyOf[r]; };
    return d.D.build(A._hbaOccupancyLog || [], A._hbaRequestLog || [], periods(), opts);
  }

  // is there occupancy data to show? (the data-gate the pill uses.)
  function detect(A) { return !!(ready() && A && ((A._hbaOccupancyLog && A._hbaOccupancyLog.length) || (A._hbaRooms && A._hbaRooms.length))); }

  function el(tag, css, txt) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; }

  function mount(A) {
    var dash = dataFor(A);
    var pane = el('div', 'position:fixed;top:54px;right:12px;width:380px;max-height:82vh;overflow:auto;z-index:10050;' +
      'background:#fff;border-radius:10px;box-shadow:0 6px 24px #0005;font-family:system-ui,sans-serif;color:#222;');
    pane.id = 'hba-dash-pane';
    var head = el('div', 'display:flex;justify-content:space-between;align-items:center;background:#102a43;color:#fff;padding:10px 12px;border-radius:10px 10px 0 0;');
    head.appendChild(el('div', 'font-size:14px;font-weight:600;', 'Occupancy · Availability'));
    var x = el('button', 'background:none;border:none;color:#fff;font-size:18px;cursor:pointer;line-height:1;', '×');
    x.title = 'Close'; x.addEventListener('click', function () { toggle(A); });
    head.appendChild(x); pane.appendChild(head);
    pane.appendChild(el('div', 'background:#fff8e1;color:#a06b00;font-weight:700;letter-spacing:1px;font-size:11px;padding:4px 12px;', dash._watermark + ' · CONTOH — TIDAK RASMI'));
    // KPIs
    var kp = el('div', 'display:flex;gap:8px;padding:10px 12px;flex-wrap:wrap;');
    [['Rooms', dash.kpi.rooms], ['Util', Math.round(dash.kpi.avgUtilization * 100) + '%'], ['Open', dash.kpi.openTickets]].forEach(function (k) {
      var c = el('div', 'background:#f4f5f7;border-radius:6px;padding:6px 10px;min-width:60px;');
      c.appendChild(el('div', 'font-size:20px;font-weight:700;color:#102a43;', String(k[1])));
      c.appendChild(el('div', 'font-size:10px;color:#627d98;text-transform:uppercase;', k[0])); kp.appendChild(c);
    });
    pane.appendChild(kp);
    // charts
    var cfgs = [dash.charts.byStorey, dash.charts.aging, dash.charts.trend];
    cfgs.forEach(function (cfg) {
      var wrap = el('div', 'padding:6px 12px;'); var cv = document.createElement('canvas'); wrap.appendChild(cv); pane.appendChild(wrap);
      if (G.Chart) { try { _charts.push(new G.Chart(cv, cfg)); } catch (e) { console.warn('§HBA_DASH chart err ' + e.message); } }
    });
    (document.body || document.documentElement).appendChild(pane);
    _pane = pane;
    console.log('§HBA_DASH mounted rooms=' + dash.kpi.rooms + ' util=' + dash.kpi.avgUtilization + ' open=' + dash.kpi.openTickets);
    return true;
  }

  function unmount() {
    _charts.forEach(function (c) { if (c && typeof c.destroy === 'function') { try { c.destroy(); } catch (e) {} } });
    _charts = [];
    if (_pane && _pane.parentNode) _pane.parentNode.removeChild(_pane);
    else if (_pane && typeof _pane.remove === 'function') _pane.remove();
    _pane = null;
    console.log('§HBA_DASH unmounted (zero residue)');
    return false;
  }

  // toggle the pane. ON → mount; ON-again/close → unmount (full removal). Returns the new state.
  function toggle(A) {
    if (!ready()) { if (A && A.status) A.status.textContent = 'HR dashboard not loaded'; return false; }
    return _pane ? unmount() : mount(A);
  }
  function isActive() { return !!_pane; }

  G.HBADashPane = { toggle: toggle, detect: detect, isActive: isActive, _ready: ready, _dataFor: dataFor };
  if (typeof module === 'object' && module.exports) module.exports = G.HBADashPane;
})();
