// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — HR_BIM_ASSET → VIEWER IoT PANE (RESUME_HR_BIM_ASSET.md §P10b/§P10d, user 2026-07-02). An
//   EXTRA, ADDITIVE pane mirroring hba_dashboard.js's pattern — NOT a change to the rest of the viewer.
//   ADDITIVE + HOST-INJECTED: imports NOTHING from viewer internals; the host hands it `A` (APP). Opens as a
//   supplementary pane when the Assets/IoT FAMILY row is clicked (the tint lens stays untouched — same
//   dual-action pattern as the Presence roster). 3 sections, ALL EXPLICITLY MOCKUP: (a) 6 ANIMATED HORIZONTAL
//   BARS over hr_bim_asset/iot.js's deterministic synthetic series — style extracted from the actual
//   `RiverIoT`/Federation sensor-bar panel in the local IfcOpenShell/Bonsai checkout
//   (~/IfcOpenShell/src/bonsai/bonsai/bim/module/federation/river/equipment_operators.py
//   draw_callback_px — colored bars, smooth day-to-day interpolation, value readout per bar), adapted
//   horizontal with the running value printed at the bar's leading edge; NO Chart.js dependency for this
//   section (hba_dashboard.js still uses Chart.js for its own KPI trend charts — untouched). Each bar's
//   tick(pt) setter is the STUB SEAM for later real physical sensor wiring: swap the setInterval driver for a
//   real telemetry callback and the same rows/bars update — nothing else in this file needs to change. Each
//   bar is one distinct colour (SENSOR_COLORS) and clicking it flies the camera to THAT SENSOR'S OWN real
//   bound position (locateAndHighlight — §2026-07-05: iot.js DEVICES, one real guid per sensor, no longer all
//   6 sharing the single PM_Asset AHU-03 guid) + holds a distinct ORANGE tint — "there's a live sensor" also
//   means "here's exactly where it is". (b) a 2x3 CCTV grid — plain <canvas>, now painted from a REAL dimmed
//   still photo (`hba_cctv_still.jpg`, user-supplied ContaCam capture, copied into this repo — NOT a feed of
//   THIS building, still captioned MOCKUP) with a scanline overlay + a diagonal "STUB READY" watermark (this
//   tile is the placeholder seam for later real physical camera wiring, not a claim of a live feed), NO
//   invented video/GIF asset, NO external URL fetch (PRIME RULE); §2026-07-05: each tile is ALSO clickable,
//   locating+highlighting its OWN real bound camera position (iot.js CAMERAS, 6 real entrance/circulation
//   doors). (c) the ERP billing table — iot.billingLines() rendered as sensor/reading/uom/C_OrderLine
//   qty·RM·≈USD (§2026-07-05: c_currency_id=the real seeded MYR row, USD via the real seeded conversion rate,
//   never a fabricated FX) · an "open ↗" deep-link into the real persisted C_Order/C_OrderLine (once
//   scripts/seed_hba_erp.js §11 has run — see that script's header), watermarked. `boundAssets`/`detect` still
//   gate the PANE'S visibility on the pre-existing single PM_Asset (AHU-03) record — unchanged, low-risk; only
//   the PER-DEVICE fly/tint target changed. ZERO-IMPACT: OFF = no DOM; toggle ON mounts ONE fixed overlay;
//   toggle OFF removes it + stops all animation timers (zero residue). Read the log after run.
(function () {
  'use strict';
  var G = (typeof self !== 'undefined' ? self : this);
  var _pane = null, _cctvTimer = null, _barTimer = null;
  var _cctvImg = null, _cctvImgReady = false;

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

  function loadCctvImage() {
    if (_cctvImg || typeof Image === 'undefined') return;
    _cctvImg = new Image();
    _cctvImg.onload = function () { _cctvImgReady = true; };
    _cctvImg.onerror = function () { console.warn('§HBA_IOT_CCTV still image load failed'); };
    _cctvImg.src = 'hba_cctv_still.jpg?v=1';
  }

  // the source still (hba_cctv_still.jpg) is itself a ContaCam MULTI-camera dashboard screenshot — so each
  // tile n gets a DIFFERENT crop (a 3x2 grid over the source), not the same centered crop repeated 6x. Dimmed
  // so the blue scanline + caption stay legible and the tile still visibly reads as an OVERLAY, not a genuine
  // live camera frame.
  function renderCctvTile(canvas, n) {
    var ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return null;
    var y = 0;
    var col = (n - 1) % 3, row = Math.floor((n - 1) / 3);
    return function tick() {
      ctx.fillStyle = '#0a1622'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (_cctvImgReady && _cctvImg.naturalWidth) {
        var iw = _cctvImg.naturalWidth, ih = _cctvImg.naturalHeight;
        var cw = iw / 3, ch = ih / 2, sx = col * cw, sy = row * ch;
        ctx.globalAlpha = 0.55;
        ctx.drawImage(_cctvImg, sx, sy, cw, ch, 0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;
      }
      // diagonal "STUB READY" watermark — this tile is a placeholder wired to a real still photo, not a
      // real feed; the label doubles as the seam name for later real physical camera wiring (see file header).
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(-Math.PI / 8);
      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('STUB READY', 0, 0);
      ctx.restore();
      ctx.strokeStyle = '#1976d2'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();   // scanline
      y = (y + 3) % canvas.height;
      ctx.fillStyle = '#eaf3fb'; ctx.font = '10px monospace';
      ctx.fillText('CAM ' + n + ' · MOCKUP', 4, canvas.height - 6);
    };
  }

  // one distinct accent colour per sensor — purely visual differentiation between the racing bars (matches
  // the reference Bonsai federation/river panel's per-channel colour coding, no invented data behind it).
  var SENSOR_COLORS = { temp: '#1976d2', pressure: '#7b1fa2', sound: '#00897b', dust: '#ef6c00', solar: '#fbc02d', electrical: '#43a047', movement: '#c62828' };

  // §2026-07-05 (§BUILD ORDER point 3) — "locate the device outright": fly the camera to its OWN real bound
  // position (iot.js DEVICES/CAMERAS, one per device — no longer every device sharing the single AHU-03 guid)
  // AND hold a distinct ORANGE tint (0xff8800) on it — deliberately a different hue from flyToZone's own brief
  // 0xffcc00 arrival pulse (1.6s, auto-restoring) so "you clicked THIS device" stays visible after the fly
  // finishes, not just during the flight. Self-restoring (setTimeout→restoreAll), zero residue, same discipline
  // as every other HBA tint. Honest no-op (flyToZone's own §HBA_FLY log) when the guid has no rendered member.
  // §2026-07-05c (user: "zooms to the device, not too near, surrounding") — DEVICE_ZOOM_DIST widens
  // flyToZone's own default (8) so the shot is an establishing view of the device's room/plant/entrance, not a
  // nose-to-mesh close-up; flyToZone itself is UNCHANGED for every other caller (opts.dist defaults to 8).
  var ORANGE = 0xff8800, ORANGE_HOLD_MS = 4000, DEVICE_ZOOM_DIST = 18;
  function locateAndHighlight(A, guid) {
    if (!G.HBALens || !G.HBALens.flyToZone) return;
    G.HBALens.flyToZone(A, guid, { dist: DEVICE_ZOOM_DIST });
    if (G.HBALens.buildMeshPort) {
      var port = G.HBALens.buildMeshPort(A);
      port.setTint(guid, ORANGE);
      setTimeout(function () { port.restoreAll(); }, ORANGE_HOLD_MS);
    }
  }

  // §2026-07-05c (§P10c, user: "just simple tones but goes high pitch indicating danger" / "a combi of sirens
  // ... for respective sensors" / "identify by the sound right away") — a distinct waveform+blip-count PER
  // sensor so the SOUND ALONE identifies which sensor is alarming, independent of the shared pitch-vs-danger
  // mapping (iot.js toneFreqFor). Only 4 native Web Audio waveforms exist, so 2 pairs share a waveform but
  // differ in blip count (a single sustained tone vs a quick double/triple chirp) — still 7 distinct signatures.
  var SENSOR_TONE = {
    temp: { wave: 'sine', blips: 1 }, pressure: { wave: 'square', blips: 1 }, sound: { wave: 'triangle', blips: 1 },
    dust: { wave: 'sawtooth', blips: 1 }, solar: { wave: 'sine', blips: 2 }, electrical: { wave: 'square', blips: 2 },
    movement: { wave: 'triangle', blips: 3 }
  };
  var _audioCtx = null, _audioOn = false;
  function ensureAudioCtx() {
    if (_audioCtx) return _audioCtx;
    var Ctx = G.AudioContext || G.webkitAudioContext;
    if (!Ctx) return null;
    _audioCtx = new Ctx();
    return _audioCtx;
  }
  // one short "whoop" per blip: frequency ramps from 0.85x up to the target (a quick siren-like rise), a fast
  // attack/decay gain envelope (low peak gain 0.05 — several sensors alarming together must not be jarring,
  // "a combi of sirens" not a wall of noise). OFF by default (_audioOn) — every other HBA additive surface's
  // zero-impact-off convention; the mute button's click is also the required user-gesture to start/resume ctx.
  function playSiren(sensorKey, freq) {
    if (!_audioOn) return;
    var ctx = ensureAudioCtx(); if (!ctx) return;
    var tone = SENSOR_TONE[sensorKey] || { wave: 'sine', blips: 1 };
    var blipMs = 150, gapMs = 70;
    for (var i = 0; i < tone.blips; i++) {
      (function (delay) {
        var t0 = ctx.currentTime + delay / 1000;
        var osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = tone.wave;
        osc.frequency.setValueAtTime(freq * 0.85, t0);
        osc.frequency.exponentialRampToValueAtTime(Math.max(freq, 40), t0 + blipMs / 1000);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.05, t0 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + blipMs / 1000);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(t0); osc.stop(t0 + blipMs / 1000 + 0.02);
      })(i * (blipMs + gapMs));
    }
  }

  // one animated horizontal bar row per sensor — width + the running value at the bar's leading edge both
  // move together (matching CSS transition) as tick(pt) is fed new points. min/max are DATA-DERIVED (the
  // sensor's own baseline±amplitude from hr_bim_asset/iot.js), never an invented threshold. Clicking the row
  // flies the camera to THIS sensor's OWN real bound location (locateAndHighlight) — "locate the device outright".
  function renderSensorBar(A, device, sensor, min, max) {
    var color = SENSOR_COLORS[sensor.key] || '#1976d2';
    var row = el('div', 'padding:4px 0;cursor:pointer;');
    row.title = 'Locate ' + sensor.label + ' (' + (device ? device.element : sensor.label) + ') in the model';
    row.appendChild(el('div', 'font-size:10px;color:#627d98;text-transform:uppercase;margin-bottom:2px;', sensor.label));
    var track = el('div', 'position:relative;height:16px;background:#eef2f6;border-radius:3px;');
    var fill = el('div', 'position:absolute;left:0;top:0;bottom:0;width:2%;background:' + color + ';border-radius:3px;transition:width 0.7s ease;');
    var val = el('span', 'position:absolute;top:50%;left:2%;transform:translateY(-50%);font-size:10px;font-weight:600;color:#102a43;white-space:nowrap;transition:left 0.7s ease;padding-left:6px;');
    track.appendChild(fill); track.appendChild(val);
    row.appendChild(track);
    row.addEventListener('click', function () { if (device) locateAndHighlight(A, device.bim_guid); });
    var tick = function (pt) {
      var pct = Math.max(2, Math.min(100, ((pt.v - min) / (max - min)) * 100));
      fill.style.width = pct + '%';
      val.style.left = pct + '%';
      val.textContent = pt.v + ' ' + sensor.uom_symbol;
    };
    return { row: row, tick: tick };
  }

  function mount(A) {
    var assets = boundAssets(A);
    if (!assets.length) return false;
    var deps_ = deps(), asset = assets[0];
    var seriesSpec = deps_.IoT.demoSeries(asset.asset, 24);
    // §2026-07-05 — pass A.erpQuery (the SAME sync seam Tenancy/Payroll already reuse, set once ad_seed.db
    // loads) so billingLines() resolves the REAL persisted C_UOM/M_Product/C_Order/C_Currency rows
    // (scripts/seed_hba_erp.js §11) instead of the ungoverned in-memory mint. Absent → prior mint, unchanged.
    var billing = deps_.IoT.billingLines(asset.asset, seriesSpec.series, (A && A.buildingName) || 'This Building',
      seriesSpec.hours + 'h', { erpQuery: A && A.erpQuery });

    var pane = el('div', 'position:fixed;top:54px;right:12px;width:420px;max-height:86vh;overflow:auto;z-index:10050;' +
      'background:#fff;border-radius:10px;box-shadow:0 6px 24px #0005;font-family:system-ui,sans-serif;color:#222;');
    pane.id = 'hba-iot-pane';
    var head = el('div', 'display:flex;justify-content:space-between;align-items:center;background:#102a43;color:#fff;padding:10px 12px;border-radius:10px 10px 0 0;');
    head.appendChild(el('div', 'font-size:14px;font-weight:600;', 'Assets / IoT · ' + asset.asset + ' (mockup)'));
    // §2026-07-05c — mute/unmute toggle, OFF by default (opt-in, zero-impact — same discipline as every other
    // HBA additive surface). The click IS the required user-gesture to create/resume the AudioContext.
    var mute = el('button', 'background:none;border:none;color:#fff;font-size:16px;cursor:pointer;line-height:1;margin-right:8px;',
      _audioOn ? '🔊' : '🔇');
    mute.title = 'Toggle per-sensor alarm tones';
    mute.addEventListener('click', function () {
      _audioOn = !_audioOn;
      mute.textContent = _audioOn ? '🔊' : '🔇';
      if (_audioOn) { var ctx = ensureAudioCtx(); if (ctx && ctx.state === 'suspended') ctx.resume(); }
      console.log('§HBA_IOT_AUDIO ' + (_audioOn ? 'on' : 'off'));
    });
    head.appendChild(mute);
    var x = el('button', 'background:none;border:none;color:#fff;font-size:18px;cursor:pointer;line-height:1;', '×');
    x.title = 'Close'; x.addEventListener('click', function () { toggle(A); });
    head.appendChild(x); pane.appendChild(head);
    pane.appendChild(el('div', 'background:#fff8e1;color:#a06b00;font-weight:700;letter-spacing:1px;font-size:11px;padding:4px 12px;',
      seriesSpec._watermark + ' · CONTOH — TIDAK RASMI · synthetic mockup, not a real sensor read'));

    // (a) animated horizontal sensor bars (one per SENSORS entry), driven by the last-24h series (loops hour
    // 0..23) — stub seam for later real physical sensor wiring, see file header. Each tick ALSO plays a
    // per-sensor siren tone (§2026-07-05c) when the mute toggle is on — min/max (the SAME bounds the bar's
    // headroom uses) feed iot.js's toneFreqFor, so "danger" pitch and bar position agree.
    var barsWrap = el('div', 'padding:10px 12px;');
    var bars = [];
    deps_.IoT.SENSORS.forEach(function (s) {
      var pts = seriesSpec.series[s.key];
      var vals = pts.map(function (p) { return p.v; });
      var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
      if (max === min) max = min + 1;   // guard degenerate flat series
      var headroom = (max - min) * 0.15;
      var lo = min - headroom, hi = max + headroom;
      var b = renderSensorBar(A, deps_.IoT.DEVICES[s.key], s, lo, hi);
      barsWrap.appendChild(b.row); bars.push({ b: b, sensor: s, pts: pts, lo: lo, hi: hi });
    });
    pane.appendChild(barsWrap);

    // (b) CCTV mockup grid — 6 tiles, real dimmed still + canvas scanline animation, explicitly labeled MOCKUP.
    // §2026-07-05 (§BUILD ORDER point 3) — each tile is now ALSO clickable: locates+orange-highlights its OWN
    // real bound camera position (iot.js CAMERAS[i], a real entrance/circulation door — see file header), not
    // just a static image crop.
    pane.appendChild(el('div', 'font-size:11px;color:#627d98;text-transform:uppercase;padding:6px 12px 0;', 'CCTV (mockup — no real feed, click to locate)'));
    var cctvWrap = el('div', 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;padding:6px 12px;');
    var cctvTicks = [];
    for (var i = 1; i <= 6; i++) {
      var cv2 = document.createElement('canvas'); cv2.width = 120; cv2.height = 68;
      cv2.style.cssText = 'display:block;width:100%;border-radius:4px;background:#0a1622;cursor:pointer;';
      var cam = deps_.IoT.CAMERAS[i - 1];
      if (cam) { cv2.title = 'Locate CCTV Camera ' + i + ' (' + cam.element + ', ' + cam.storey + ') in the model'; }
      cv2.addEventListener('click', (function (camGuid) { return function () { if (camGuid) locateAndHighlight(A, camGuid); }; })(cam && cam.bim_guid));
      cctvWrap.appendChild(cv2);
      var tick = renderCctvTile(cv2, i); if (tick) cctvTicks.push(tick);
    }
    pane.appendChild(cctvWrap);

    // (c) ERP billing table — iot.billingLines() -> real c_orderline shape. The reading itself is already
    // shown live by the bar above (§P10d) — this table carries only what the bars DON'T: qty billed + net
    // amount, i.e. the actual ERP compile, not a second copy of the sensor value.
    pane.appendChild(el('div', 'font-size:11px;color:#627d98;text-transform:uppercase;padding:8px 12px 0;',
      'Billable — ' + billing.order.documentno));
    var tbl = el('table', 'width:100%;border-collapse:collapse;font-size:12px;margin:4px 12px 10px;width:calc(100% - 24px);');
    billing.lines.forEach(function (ln) {
      var tr = el('tr', 'border-top:1px solid #eee;');
      tr.appendChild(el('td', 'padding:4px 2px;', ln.sensor.label));
      tr.appendChild(el('td', 'padding:4px 2px;text-align:right;color:#627d98;', 'qty ' + ln.row.qtyordered + ' ' + ln.sensor.uom_symbol));
      // §2026-07-05 (§BUILD ORDER point 4) — RM is the real c_currency_id (301) the row itself is billed in;
      // USD is the SAME already-seeded C_Conversion_Rate (never a second invented rate) — shown only when
      // resolvable (governed/erpQuery present), an honest dash otherwise (no fabricated FX).
      var amtTd = el('td', 'padding:4px 2px;text-align:right;color:#2e7d32;font-weight:600;', 'RM ' + ln.row.linenetamt.toFixed(2));
      if (ln.usd != null) amtTd.appendChild(el('div', 'font-weight:400;color:#627d98;font-size:10px;', '≈ USD ' + ln.usd.toFixed(2)));
      tr.appendChild(amtTd);
      // §P11 — deep-link this billing line into the real C_Order it compiled onto (management billing follow-up).
      var linkTd = el('td', 'padding:4px 2px;text-align:right;');
      if (ln.row.c_order_id != null && G.HBALens && G.HBALens.erpLink) {
        var a = document.createElement('a');
        a.href = G.HBALens.erpLink(G.HBALens.AD_WINDOWS.ORDER, ln.row.c_order_id);
        a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'open ↗';
        a.title = 'Open ' + billing.order.documentno + ' in iDempiere — billable, ready for management follow-up';
        a.style.cssText = 'color:#1976d2;text-decoration:none;font-size:11px;';
        linkTd.appendChild(a);
      }
      tr.appendChild(linkTd);
      tbl.appendChild(tr);
    });
    pane.appendChild(tbl);

    (document.body || document.documentElement).appendChild(pane);
    if (G.HbaDraggable) G.HbaDraggable.enable(pane, head);   // §P10b — drag by the header

    loadCctvImage();
    // prime the bars at hour 0 immediately, then advance one hour per tick so the race is visible
    var hourIdx = 0;
    bars.forEach(function (r) { r.b.tick(r.pts[hourIdx]); });
    if (typeof setInterval === 'function') {
      _barTimer = setInterval(function () {
        hourIdx = (hourIdx + 1) % 24;
        bars.forEach(function (r) {
          var pt = r.pts[hourIdx];
          r.b.tick(pt);
          if (_audioOn) playSiren(r.sensor.key, deps_.IoT.toneFreqFor(pt.v, r.lo, r.hi));
        });
      }, 900);
    }
    // paint every CCTV tile once immediately (rAF alone can be throttled/parked in some hosts, e.g. a
    // backgrounded tab) — real browsers then keep animating via the rAF loop below; if the still image was
    // still loading at this exact instant, its 'load' event re-paints all tiles the moment it lands.
    cctvTicks.forEach(function (t) { t(); });
    if (_cctvImg && !_cctvImgReady) _cctvImg.addEventListener('load', function () { cctvTicks.forEach(function (t) { t(); }); });
    // CCTV animation loop — mockup only, stopped on unmount
    if (typeof requestAnimationFrame === 'function') {
      (function loop() {
        if (!_pane) return;
        cctvTicks.forEach(function (t) { t(); });
        _cctvTimer = requestAnimationFrame(loop);
      })();
    }

    _pane = pane;
    console.log('§HBA_IOT_PANE mounted asset=' + asset.asset + ' sensors=' + deps_.IoT.SENSORS.length + ' bars=' + bars.length + ' billingLines=' + billing.lines.length);
    return true;
  }

  function unmount() {
    if (_barTimer) { clearInterval(_barTimer); _barTimer = null; }
    if (_cctvTimer && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(_cctvTimer);
    _cctvTimer = null;
    if (_pane && _pane.parentNode) _pane.parentNode.removeChild(_pane);
    else if (_pane && typeof _pane.remove === 'function') _pane.remove();
    _pane = null;
    console.log('§HBA_IOT_PANE unmounted (bar timer + CCTV loop stopped, zero residue)');
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
