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
  // §FIX 2026-07-06 (user: "pressing camera... zoom in to the cam device, right to the device position") — a
  // CAMERA tile gets a CLOSE shot (right at the device), distinct from a SENSOR's wider establishing shot
  // (DEVICE_ZOOM_DIST=18, "not too near — surrounding"). Both still route through the SAME flyToZone/dist seam.
  var CAMERA_ZOOM_DIST = 4;
  function locateAndHighlight(A, guid, dist) {
    if (!G.HBALens || !G.HBALens.flyToZone) return;
    G.HBALens.flyToZone(A, guid, { dist: dist != null ? dist : DEVICE_ZOOM_DIST });
    if (G.HBALens.buildMeshPort) {
      var port = G.HBALens.buildMeshPort(A);
      port.setTint(guid, ORANGE);
      setTimeout(function () { port.restoreAll(); }, ORANGE_HOLD_MS);
    }
  }

  // §FIX 2026-07-06 (user: "pressing the sensor again, scene zoom to the nearest cam POV that has the sensor in
  // sight, or best effort") — real 3D distance over the ACTUAL extracted element_transforms rows (never a
  // fabricated position), never the camera's own declared facing (that's the still-blocked Item 2 decision —
  // this only needs a known REAL target to look at, the sensor itself, so it sidesteps that blocker entirely).
  // Best-effort fallback to the existing storey-match connector (camerasNearDevice) when A.dbQuery is
  // unavailable (e.g. a node witness stub) or no real position resolves for either end — honest null otherwise
  // (e.g. Roof-Level sensors: no CCTV camera exists up there at all, never invented one).
  function nearestCameraFor(A, deviceKey) {
    var IoT = deps().IoT; if (!IoT) return null;
    var device = IoT.DEVICES[deviceKey];
    if (!device || !A || typeof A.dbQuery !== 'function') return (IoT.camerasNearDevice(deviceKey) || [])[0] || null;
    function posOf(guid) {
      try {
        var rows = A.dbQuery('SELECT center_x, center_y, center_z FROM element_transforms WHERE guid = ?', [guid]);
        return (rows && rows.length) ? { x: rows[0][0], y: rows[0][1], z: rows[0][2] } : null;
      } catch (e) { return null; }
    }
    var dPos = posOf(device.bim_guid);
    if (!dPos) return (IoT.camerasNearDevice(deviceKey) || [])[0] || null;
    var best = null, bestD = Infinity;
    IoT.CAMERAS.forEach(function (cam) {
      var cPos = posOf(cam.bim_guid); if (!cPos) return;
      var dx = cPos.x - dPos.x, dy = cPos.y - dPos.y, dz = cPos.z - dPos.z;
      var d = dx * dx + dy * dy + dz * dz;
      if (d < bestD) { bestD = d; best = cam; }
    });
    return best || (IoT.camerasNearDevice(deviceKey) || [])[0] || null;
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

  // §FIX 2026-07-06 — the danger-exceeded bar colour (user: "a red bar when they exceed", citing the RiverIoT/
  // Federation reference's own above-threshold colour split). Never overrides the sensor's own accent colour
  // unless IoT.isDanger() actually says so.
  var DANGER_COLOR = '#e53935';

  // one animated horizontal bar row per sensor — width + the running value at the bar's leading edge both
  // move together (matching CSS transition) as tick(pt, opts) is fed new points. min/max are DATA-DERIVED (the
  // sensor's own baseline±amplitude from hr_bim_asset/iot.js), never an invented threshold. Clicking the row
  // fires `onClick` (mount() wires it to locateAndHighlight + the same-storey camera flash, see
  // iot.js camerasNearDevice) — "locate the device outright, and show me what can see it".
  // §FIX 2026-07-06 — tick(pt, opts) now accepts an optional displayVal (the jittered "cycle around near actual
  // values" reading — the RAW pt.v stays the ERP-billed value, unchanged) + danger (true → DANGER_COLOR fill,
  // per IoT.isDanger()).
  function renderSensorBar(sensor, min, max, title, onClick) {
    var color = SENSOR_COLORS[sensor.key] || '#1976d2';
    var row = el('div', 'padding:4px 0;cursor:pointer;');
    row.title = title;
    row.appendChild(el('div', 'font-size:10px;color:#627d98;text-transform:uppercase;margin-bottom:2px;', (sensor.icon || '') + ' ' + sensor.label));
    var track = el('div', 'position:relative;height:16px;background:#eef2f6;border-radius:3px;');
    var fill = el('div', 'position:absolute;left:0;top:0;bottom:0;width:2%;background:' + color + ';border-radius:3px;transition:width 0.7s ease,background 0.3s ease;');
    var val = el('span', 'position:absolute;top:50%;left:2%;transform:translateY(-50%);font-size:10px;font-weight:600;color:#102a43;white-space:nowrap;transition:left 0.7s ease;padding-left:6px;');
    track.appendChild(fill); track.appendChild(val);
    row.appendChild(track);
    row.addEventListener('click', function () { if (onClick) onClick(); });
    var tick = function (pt, opts) {
      opts = opts || {};
      var v = opts.displayVal != null ? opts.displayVal : pt.v;
      var pct = Math.max(2, Math.min(100, ((v - min) / (max - min)) * 100));
      fill.style.width = pct + '%';
      fill.style.background = opts.danger ? DANGER_COLOR : color;
      val.style.left = pct + '%';
      val.textContent = v + ' ' + sensor.uom_symbol;
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

    // §FIX 2026-07-06c item B — cascade column 2 (right:428) so this pane never overlaps hba_bom.js's column 1.
    var pane = el('div', 'position:fixed;top:54px;right:428px;width:420px;max-height:86vh;overflow:auto;z-index:10050;' +
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
    //
    // (b) CCTV mockup grid tiles are built FIRST (not yet appended to the DOM) so the bars below can wire a
    // same-storey highlight — §2026-07-05d (user: "ready utils that talk or connects between them"): clicking
    // a sensor ALSO briefly rings the CCTV tile(s) sharing its floor (iot.js camerasNearDevice — a plain
    // storey-match filter over data already present, no new geometry/distance math).
    var cctvTileEls = [];   // [{el, cam}] — index i matches iot.js CAMERAS[i]
    var CAM_RING = '0 0 0 3px #ff8800aa';
    function flashCamerasForDevice(deviceKey) {
      var cams = deps_.IoT.camerasNearDevice(deviceKey);
      if (!cams.length) return;
      var guids = {}; cams.forEach(function (c) { guids[c.bim_guid] = true; });
      cctvTileEls.forEach(function (t) {
        if (!t.cam || !guids[t.cam.bim_guid]) return;
        t.el.style.boxShadow = CAM_RING;
        setTimeout(function () { t.el.style.boxShadow = ''; }, ORANGE_HOLD_MS);
      });
      console.log('§HBA_IOT_CONNECT device=' + deviceKey + ' camerasOnFloor=' + cams.length);
    }

    // §FIX 2026-07-06 (user: "when a sensor is pressed, scene zooms to the sensor... when pressing the sensor
    // again, scene zoom to the nearest cam POV that has the sensor in sight, or best effort") — a per-sensor
    // 2-state toggle, LOCAL to this mount (fresh on every mount/unmount, same zero-residue discipline as every
    // other HBA additive state). First click of a given sensor = unchanged prior behaviour (device establishing
    // shot + same-floor camera flash); the NEXT click of that SAME sensor swaps to the nearest real camera's
    // position, looking AT the sensor (flyToPOV) — then the click after THAT reverts to the device shot again.
    var _sensorViewState = {};
    var barsWrap = el('div', 'padding:10px 12px;');
    var bars = [];
    deps_.IoT.SENSORS.forEach(function (s) {
      var pts = seriesSpec.series[s.key];
      var vals = pts.map(function (p) { return p.v; });
      var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
      if (max === min) max = min + 1;   // guard degenerate flat series
      var headroom = (max - min) * 0.15;
      var lo = min - headroom, hi = max + headroom;
      var device = deps_.IoT.DEVICES[s.key];
      var title = 'Locate ' + s.label + ' (' + (device ? device.element : s.label) + ') in the model — click again for the nearest camera\'s POV';
      var b = renderSensorBar(s, lo, hi, title, function () {
        if (!device) return;
        if (!_sensorViewState[s.key]) {
          locateAndHighlight(A, device.bim_guid);
          flashCamerasForDevice(s.key);
          _sensorViewState[s.key] = true;
        } else {
          var cam = nearestCameraFor(A, s.key);
          if (cam && G.HBALens && G.HBALens.flyToPOV) {
            G.HBALens.flyToPOV(A, cam.bim_guid, device.bim_guid, { dist: CAMERA_ZOOM_DIST });
          } else {
            locateAndHighlight(A, device.bim_guid);   // honest fallback — no camera exists anywhere near this device
          }
          _sensorViewState[s.key] = false;
        }
      });
      barsWrap.appendChild(b.row); bars.push({ b: b, sensor: s, pts: pts, lo: lo, hi: hi });
    });
    pane.appendChild(barsWrap);

    // CCTV mockup grid — 6 tiles, real dimmed still + canvas scanline animation, explicitly labeled MOCKUP.
    // §2026-07-05 (§BUILD ORDER point 3) — each tile is now ALSO clickable: locates+orange-highlights its OWN
    // real bound camera position (iot.js CAMERAS[i], a real entrance/circulation door — see file header), not
    // just a static image crop.
    pane.appendChild(el('div', 'font-size:11px;color:#627d98;text-transform:uppercase;padding:6px 12px 0;', deps_.IoT.CAMERA_ICON + ' CCTV (mockup — no real feed, click to locate)'));
    var cctvWrap = el('div', 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;padding:6px 12px;');
    var cctvTicks = [];
    for (var i = 1; i <= 6; i++) {
      var cv2 = document.createElement('canvas'); cv2.width = 120; cv2.height = 68;
      cv2.style.cssText = 'display:block;width:100%;border-radius:4px;background:#0a1622;cursor:pointer;transition:box-shadow 0.3s ease;';
      var cam = deps_.IoT.CAMERAS[i - 1];
      if (cam) { cv2.title = deps_.IoT.CAMERA_ICON + ' Locate CCTV Camera ' + i + ' (' + cam.element + ', ' + cam.storey + ') in the model'; }
      // §FIX 2026-07-06 (user: "zoom in to the cam device, right to the device position") — a close shot at the
      // camera itself (CAMERA_ZOOM_DIST). §FIX 2026-07-06b — now that iot.js CAMERAS carries a declared
      // `facing` vector (structural-centroid heuristic), the click ASSUMES that camera's own fixed POV
      // (flyToFacing: stand at the door, look along its facing) instead of just locating+highlighting it.
      // Honest fallback to the old locate-only shot if flyToFacing is unavailable or the camera has no facing
      // (neither should happen for any of the 6 real CAMERAS today, but a future camera entry might lack one).
      cv2.addEventListener('click', (function (c) {
        return function () {
          if (!c || !c.bim_guid) return;
          if (c.facing && G.HBALens && G.HBALens.flyToFacing) {
            G.HBALens.flyToFacing(A, c.bim_guid, c.facing, { dist: CAMERA_ZOOM_DIST });
          } else {
            locateAndHighlight(A, c.bim_guid, CAMERA_ZOOM_DIST);
          }
        };
      })(cam));
      cctvWrap.appendChild(cv2);
      cctvTileEls.push({ el: cv2, cam: cam });
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
      tr.appendChild(el('td', 'padding:4px 2px;', (ln.sensor.icon || '') + ' ' + ln.sensor.label));
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

    // §MOBILE-STACK — desktop unchanged; mobile = card-stack host. Re-parents the SAME live node (NOT a clone),
    // so the _barTimer/_cctvTimer intervals + their canvas targets survive; unmount() still stops them.
    (G.HbaPaneHost ? G.HbaPaneHost.present
      : function (p, h) { (document.body || document.documentElement).appendChild(p); if (G.HbaDraggable) G.HbaDraggable.enable(p, h); }
    )(pane, head, A);

    loadCctvImage();
    // §FIX 2026-07-06 — prime the bars at hour 0, then advance one hour per tick. Each displayed reading is the
    // stored hourly point PLUS a small deterministic jitter (IoT.jitterFor — "cycle around near actual values",
    // never a smooth monotonic sweep); the RAW pt.v (unjittered) still feeds the ERP billing table + audio pitch
    // unchanged. IoT.isDanger() flags the bar red when the jittered display value exceeds the sensor's own
    // honest mockup threshold (baseline+amplitude*1.15) — this can happen even when the base curve alone never
    // would, exactly the "occasionally in the red" behaviour the reference RiverIoT panel shows.
    var hourIdx = 0, tickCounter = 0;
    bars.forEach(function (r) {
      var pt0 = r.pts[hourIdx], dv0 = Math.round((pt0.v + deps_.IoT.jitterFor(r.sensor, hourIdx, tickCounter)) * 100) / 100;
      r.b.tick(pt0, { displayVal: dv0, danger: deps_.IoT.isDanger(r.sensor, dv0) });
    });
    if (typeof setInterval === 'function') {
      _barTimer = setInterval(function () {
        hourIdx = (hourIdx + 1) % 24;
        tickCounter++;
        bars.forEach(function (r) {
          var pt = r.pts[hourIdx];
          var displayVal = Math.round((pt.v + deps_.IoT.jitterFor(r.sensor, hourIdx, tickCounter)) * 100) / 100;
          var danger = deps_.IoT.isDanger(r.sensor, displayVal);
          r.b.tick(pt, { displayVal: displayVal, danger: danger });
          if (_audioOn) playSiren(r.sensor.key, deps_.IoT.toneFreqFor(displayVal, r.lo, r.hi));
        });
      }, 900);
    }
    // paint every CCTV tile once immediately (rAF alone can be throttled/parked in some hosts, e.g. a
    // backgrounded tab) — real browsers then keep animating via the rAF loop below; if the still image was
    // still loading at this exact instant, its 'load' event re-paints all tiles the moment it lands.
    cctvTicks.forEach(function (t) { t(); });
    if (_cctvImg && !_cctvImgReady) _cctvImg.addEventListener('load', function () { cctvTicks.forEach(function (t) { t(); }); });
    // §SCALE-UX-SWEEP fix (WATCHDOG_SCALE_AND_UX_SWEEP.md §3.4): _pane MUST be set BEFORE the rAF loop's first
    // invocation — the loop's own `if (!_pane) return` guard (its unmount check) was firing on its VERY FIRST
    // call, since `_pane = pane` used to run AFTER this block, permanently killing the scanline animation
    // (loop() returned before ever scheduling its own next frame). Ordering fix only — same guard, same loop.
    _pane = pane;
    // CCTV animation loop — mockup only, stopped on unmount
    if (typeof requestAnimationFrame === 'function') {
      (function loop() {
        if (!_pane) return;
        cctvTicks.forEach(function (t) { t(); });
        _cctvTimer = requestAnimationFrame(loop);
      })();
    }

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
