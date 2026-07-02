// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — HR_BIM_ASSET → VIEWER IoT PANE (RESUME_HR_BIM_ASSET.md §P10b, user 2026-07-02). An EXTRA,
//   ADDITIVE pane mirroring hba_dashboard.js's pattern — NOT a change to the rest of the viewer. ADDITIVE +
//   HOST-INJECTED: imports NOTHING from viewer internals; the host hands it `A` (APP). Opens as a supplementary
//   pane when the Assets/IoT FAMILY row is clicked (the tint lens stays untouched — same dual-action pattern as
//   the Presence roster). 3 sections, ALL EXPLICITLY MOCKUP (§P10b): (a) 6 Chart.js line charts over
//   hr_bim_asset/iot.js's deterministic synthetic series (reuses the ALREADY-BUNDLED Chart.js, same engine
//   hba_dashboard.js uses — no new charting dependency); (b) a 2x3 CCTV MOCKUP grid — plain <canvas> scanline
//   animation + "MOCK FEED" caption, NO invented video/GIF asset, NO external URL fetch (PRIME RULE); (c) the
//   ERP billing table — iot.billingLines() rendered as sensor/reading/uom/C_OrderLine qty·price·net, watermarked.
//   ZERO-IMPACT: OFF = no DOM; toggle ON mounts ONE fixed overlay; toggle OFF removes it + destroys charts +
//   stops the CCTV animation (zero residue). Read the log after run.
(function () {
  'use strict';
  var G = (typeof self !== 'undefined' ? self : this);
  var _pane = null, _charts = [], _cctvTimer = null;

  function deps() { return { M: G.HbaModels, IoT: G.HbaIot }; }
  function ready() { return !!(deps().M && deps().IoT && typeof document !== 'undefined'); }

  // the bound asset(s) this pane monitors — reuses the SAME PM_Asset records + guid-resolution gate as the
  // 'maintenance' lens (viewer/hba_lens.js detect(A,'maintenance')), so IoT never claims data on an asset that
  // isn't actually in this building.
  function boundAssets(A) {
    var m = deps().M; if (!m || !A || !A.guidMap) return [];
    return m.records('Asset').filter(function (a) {
      return Object.keys(A.guidMap).some(function (k) { return A.guidMap[k] === a.bim_guid; });
    });
  }
  function detect(A) { return !!(ready() && boundAssets(A).length); }

  function el(tag, css, txt) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; }

  function renderCctvTile(canvas, n) {
    var ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return null;
    var y = 0;
    return function tick() {
      ctx.fillStyle = '#0a1622'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#1976d2'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();   // scanline
      y = (y + 3) % canvas.height;
      ctx.fillStyle = '#7fa8c9'; ctx.font = '10px monospace';
      ctx.fillText('CAM ' + n + ' · MOCK FEED', 4, canvas.height - 6);
    };
  }

  function mount(A) {
    var assets = boundAssets(A);
    if (!assets.length) return false;
    var deps_ = deps(), asset = assets[0];
    var seriesSpec = deps_.IoT.demoSeries(asset.asset, 24);
    var billing = deps_.IoT.billingLines(asset.asset, seriesSpec.series, (A && A.buildingName) || 'This Building', seriesSpec.hours + 'h');

    var pane = el('div', 'position:fixed;top:54px;right:12px;width:420px;max-height:86vh;overflow:auto;z-index:10050;' +
      'background:#fff;border-radius:10px;box-shadow:0 6px 24px #0005;font-family:system-ui,sans-serif;color:#222;');
    pane.id = 'hba-iot-pane';
    var head = el('div', 'display:flex;justify-content:space-between;align-items:center;background:#102a43;color:#fff;padding:10px 12px;border-radius:10px 10px 0 0;');
    head.appendChild(el('div', 'font-size:14px;font-weight:600;', 'Assets / IoT · ' + asset.asset + ' (mockup)'));
    var x = el('button', 'background:none;border:none;color:#fff;font-size:18px;cursor:pointer;line-height:1;', '×');
    x.title = 'Close'; x.addEventListener('click', function () { toggle(A); });
    head.appendChild(x); pane.appendChild(head);
    pane.appendChild(el('div', 'background:#fff8e1;color:#a06b00;font-weight:700;letter-spacing:1px;font-size:11px;padding:4px 12px;',
      seriesSpec._watermark + ' · CONTOH — TIDAK RASMI · synthetic mockup, not a real sensor read'));

    // (a) 6 sensor charts, last-24h
    var chartsWrap = el('div', 'display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:10px 12px;');
    var canvases = [];
    deps_.IoT.SENSORS.forEach(function (s) {
      var wrap = el('div', 'height:110px;position:relative;background:#f8f9fb;border-radius:6px;padding:4px;');
      wrap.appendChild(el('div', 'font-size:10px;color:#627d98;text-transform:uppercase;', s.label + ' (' + s.uom_symbol + ')'));
      var cv = document.createElement('canvas'); cv.style.cssText = 'display:block;';
      wrap.appendChild(cv); chartsWrap.appendChild(wrap); canvases.push({ cv: cv, sensor: s });
    });
    pane.appendChild(chartsWrap);

    // (b) CCTV mockup grid — 6 tiles, plain canvas scanline animation, explicitly labeled MOCK FEED
    pane.appendChild(el('div', 'font-size:11px;color:#627d98;text-transform:uppercase;padding:6px 12px 0;', 'CCTV (mockup — no real feed)'));
    var cctvWrap = el('div', 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;padding:6px 12px;');
    var cctvTicks = [];
    for (var i = 1; i <= 6; i++) {
      var cv2 = document.createElement('canvas'); cv2.width = 120; cv2.height = 68;
      cv2.style.cssText = 'display:block;width:100%;border-radius:4px;background:#0a1622;';
      cctvWrap.appendChild(cv2);
      var tick = renderCctvTile(cv2, i); if (tick) cctvTicks.push(tick);
    }
    pane.appendChild(cctvWrap);

    // (c) ERP billing table — iot.billingLines() -> real c_orderline shape
    pane.appendChild(el('div', 'font-size:11px;color:#627d98;text-transform:uppercase;padding:8px 12px 0;',
      'Billable — ' + billing.order.documentno));
    var tbl = el('table', 'width:100%;border-collapse:collapse;font-size:12px;margin:4px 12px 10px;width:calc(100% - 24px);');
    billing.lines.forEach(function (ln) {
      var tr = el('tr', 'border-top:1px solid #eee;');
      tr.appendChild(el('td', 'padding:4px 2px;', ln.sensor.label));
      tr.appendChild(el('td', 'padding:4px 2px;text-align:right;', ln.reading.v + ' ' + ln.sensor.uom_symbol));
      tr.appendChild(el('td', 'padding:4px 2px;text-align:right;color:#627d98;', 'qty ' + ln.row.qtyordered));
      tr.appendChild(el('td', 'padding:4px 2px;text-align:right;color:#2e7d32;font-weight:600;', ln.row.linenetamt.toFixed(2)));
      tbl.appendChild(tr);
    });
    pane.appendChild(tbl);

    (document.body || document.documentElement).appendChild(pane);
    if (G.HbaDraggable) G.HbaDraggable.enable(pane, head);   // §P10b — drag by the header

    // charts must attach to the DOM before Chart.js measures the canvas (same ordering as hba_dashboard.js)
    if (G.Chart) canvases.forEach(function (c) {
      var pts = seriesSpec.series[c.sensor.key];
      var cfg = { type: 'line', data: { labels: pts.map(function (p) { return p.h + 'h'; }),
        datasets: [{ data: pts.map(function (p) { return p.v; }), borderColor: '#1976d2', borderWidth: 1.5, pointRadius: 0, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } },
          scales: { x: { display: false }, y: { display: false } } } };
      try { _charts.push(new G.Chart(c.cv, cfg)); } catch (e) { console.warn('§HBA_IOT chart err ' + e.message); }
    });
    // CCTV animation loop — mockup only, stopped on unmount
    if (typeof requestAnimationFrame === 'function') {
      (function loop() {
        if (!_pane) return;
        cctvTicks.forEach(function (t) { t(); });
        _cctvTimer = requestAnimationFrame(loop);
      })();
    }

    _pane = pane;
    console.log('§HBA_IOT_PANE mounted asset=' + asset.asset + ' sensors=' + deps_.IoT.SENSORS.length + ' billingLines=' + billing.lines.length);
    return true;
  }

  function unmount() {
    _charts.forEach(function (c) { try { c.destroy(); } catch (e) {} });
    _charts = [];
    if (_cctvTimer && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(_cctvTimer);
    _cctvTimer = null;
    if (_pane && _pane.parentNode) _pane.parentNode.removeChild(_pane);
    else if (_pane && typeof _pane.remove === 'function') _pane.remove();
    _pane = null;
    console.log('§HBA_IOT_PANE unmounted (charts destroyed, CCTV loop stopped, zero residue)');
    return false;
  }

  function toggle(A) {
    if (!ready()) { if (A && A.status) A.status.textContent = 'HR IoT not loaded'; return false; }
    return _pane ? unmount() : mount(A);
  }
  function isActive() { return !!_pane; }

  G.HBAIotPane = { toggle: toggle, detect: detect, isActive: isActive, _ready: ready, _boundAssets: boundAssets };
  if (typeof module === 'object' && module.exports) module.exports = G.HBAIotPane;
})();
