// §ALTC_PANELS — road data panels on quiet stretches of the road film's drive.
// Spec: bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §ALTC_PANELS. Gate: A.isCivilModel() — a building never builds panels.
// Content is model data only (Prime Rule): per-stretch discipline counts, drainage types/sizes (element_psets 02_Type /
// 03_Dimension), JKR sign codes (17_Code / 16_Name), and ONE "planned" card (terrain / weather / traffic) with no numbers.
// WHEN: the build-up part of the drive only, on the quietest film times by the noise law's own walk probes (plan.walkBusy).
function setupCpeRoadPanels(A) {
  'use strict';
  var PANEL_SEC = 5, GAP_SEC = 2, STRETCH_M = 150;   // presentation: card on-screen time, spacing, half-width of a stretch
  var KIND_ORDER = ['counts', 'ground', 'check', 'outstanding', 'planned', 'drainage', 'signs'];   // §ALTC_CHECKS: 'check' = a road check as a worked formula
  // §ALTC_GROUND_CARDS (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md): 'ground' = the partner's ground works of the stretch by the
  // file's own 15_Name; 'outstanding' = ONE red-banner card counting what the model does not carry yet (G3).
  var _rp = null;

  function _q(sql) { try { return (A.dbQuery && A.dbQuery(sql)) || []; } catch (e) { return []; } }
  // §EARTHWORKS_VOLUME + §EW_VOLUME_SURFACE: computed by earthworks_volume.js (ONE owner); this only binds it to the open model.
  A.meshSolidVolume = function (vArr, fArr) { return window.EarthworksVolume.meshSolidVolume(vArr, fArr); };
  var _ewVol = null;
  A.earthworksVolume = function () {
    if (_ewVol && _ewVol.db === A.db) return _ewVol.r;
    var EV = window.EarthworksVolume;
    var r = EV.measure(function (sql, p) { return A.dbQuery(sql, p); },
      (A.libDb && A.libDb !== A.db) ? function (sql, p) { var lr = A.libDb.exec(sql, p); return lr.length ? lr[0].values : []; } : null);
    _ewVol = { db: A.db, r: r };
    return r;
  };
  A.earthworksVolumeLine = function () { return window.EarthworksVolume.line(A.earthworksVolume()); };
  function _hasPsets() { return _q("SELECT name FROM sqlite_master WHERE type='table' AND name='element_psets'").length > 0; }

  // nearest-segment projection of an xz point onto the route polyline → chainage (m) from the drive's first point
  function _chainager(route) {
    var cum = [0];
    for (var i = 1; i < route.length; i++) cum.push(cum[i - 1] + Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z));
    return {
      len: cum[cum.length - 1],
      at: function (x, z) {
        var best = Infinity, ch = 0;
        for (var j = 1; j < route.length; j++) {
          var ax = route[j - 1].x, az = route[j - 1].z, bx = route[j].x - ax, bz = route[j].z - az, L2 = bx * bx + bz * bz;
          var u = L2 > 1e-9 ? Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / L2)) : 0;
          var d = Math.hypot(x - (ax + u * bx), z - (az + u * bz));
          if (d < best) { best = d; ch = cum[j - 1] + u * Math.sqrt(L2); }
        }
        return ch;
      }
    };
  }
  function _busyAt(plan, t) {
    var wb = plan.walkBusy; if (!wb || !wb.pos || !wb.pos.length) return 0;
    var p = plan.poseAt(t), bi = 0, bd = Infinity;
    for (var i = 0; i < wb.pos.length; i++) { var d = Math.hypot(wb.pos[i].x - p.x, wb.pos[i].z - p.z); if (d < bd) { bd = d; bi = i; } }
    return wb.v[bi] || 0;
  }

  // §ALTC_CHECKS (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §ALTC_CHECKS): road_check.js rows, run ONCE per bake, each
  // shown as a worked formula with its rule's film_status (VALID / SPECULATIVE, the tracking list in rates/road_rules.json).
  // RoadCheck reads row OBJECTS (sql.js getAsObject), A.dbQuery returns arrays → a small adapter over A.db.
  var _checks = null;
  function _objQuery(sql, params) {
    var st = A.db.prepare(sql), out = [];
    try { if (params && params.length) st.bind(params); while (st.step()) out.push(st.getAsObject()); } finally { st.free(); }
    return out;
  }
  function _loadChecks() {
    if (!window.RoadCheck || !A.db || typeof fetch !== 'function') { console.log('§ROAD_CHECK_FILM VACUOUS — road_check.js / db / fetch missing'); return Promise.resolve(null); }
    return fetch('rates/road_rules.json').then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (cfg) {
      var t0 = performance.now(), res = window.RoadCheck.run(_objQuery, cfg, { log: function () {} }), R = {};
      (cfg.road_rules || []).forEach(function (r) { R[r.name] = r; });
      var byGuid = {}, nV = 0, nS = 0;
      (res.rows || []).forEach(function (row) {
        var rule = R[row.rule]; if (!rule || !row.guid) return;
        var st = (rule.film_status && rule.film_status.status) || 'speculative';
        if (st === 'valid') nV++; else nS++;
        (byGuid[row.guid] = byGuid[row.guid] || []).push({ row: row, rule: rule, status: st });
      });
      console.log('§ROAD_CHECK_FILM rows=' + (res.rows || []).length + ' valid=' + nV + ' speculative=' + nS + ' ms=' + (performance.now() - t0).toFixed(0) +
        ' statuses=[' + (cfg.road_rules || []).map(function (r) { return r.name + ':' + ((r.film_status && r.film_status.status) || '?'); }).join(',') + ']');
      return byGuid;
    }).catch(function (e) { console.warn('§ROAD_CHECK_FILM failed: ' + e.message); return null; });
  }

  // Build once per bake. Resolves to the slot list (also kept for the composite pass). filmSec = the film's delivered seconds.
  A.roadPanelsBuild = function (plan, filmSec) {
    _rp = null; _checks = null;
    if (!(A.isCivilModel && A.isCivilModel())) return Promise.resolve(_buildSlots(plan, filmSec));
    return _loadChecks().then(function (c) { _checks = c; return _buildSlots(plan, filmSec); });
  };
  function _buildSlots(plan, filmSec) {
    if (!(A.isCivilModel && A.isCivilModel())) { console.log('§ROAD_PANELS VACUOUS — not a civil model (buildings never build road panels)'); return null; }
    var b = plan && plan.beats, route = plan && plan.waypoints;
    if (!b || !route || route.length < 2 || typeof plan.poseAt !== 'function' || !(filmSec > 0)) { console.log('§ROAD_PANELS VACUOUS — no drive on the plan'); return null; }
    var w0 = b.spin, w1 = (plan.reveal && plan.reveal.inDrive) ? plan.reveal.inDrive.a : b.out;
    var slotU = PANEL_SEC / filmSec, gapU = GAP_SEC / filmSec, stepU = 0.5 / filmSec;
    if (!(w1 - w0 > slotU)) { console.log('§ROAD_PANELS VACUOUS — build-up drive window ' + ((w1 - w0) * filmSec).toFixed(1) + 's shorter than one card'); return null; }
    // candidate starts every 0.5 s; score = mean busy over the card's own span
    var cands = [];
    for (var t = w0 + gapU; t + slotU <= w1 - gapU + 1e-9; t += stepU) {
      var s = 0, n = 0;
      for (var k = 0; k <= 4; k++) { s += _busyAt(plan, t + slotU * k / 4); n++; }
      cands.push({ t0: t, busy: s / n });
    }
    var sorted = cands.map(function (c) { return c.busy; }).sort(function (x, y) { return x - y; });
    var median = sorted.length ? sorted[sorted.length >> 1] : 0;
    var picked = [];
    cands.slice().sort(function (x, y) { return x.busy - y.busy || x.t0 - y.t0; }).forEach(function (c) {
      if (c.busy > median) return;   // quiet only: never a card on a busier-than-median stretch
      if (picked.some(function (p) { return Math.abs(p.t0 - c.t0) < slotU + gapU; })) return;
      picked.push(c);
    });
    picked.sort(function (x, y) { return x.t0 - y.t0; });
    // elements → chainage, once
    var ch = _chainager(route), els = [];
    _q('SELECT m.guid, m.discipline, t.center_x, t.center_y, t.center_z FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid')
      .forEach(function (r) { var p = A.ifc2three(r[2], r[3], r[4]); els.push({ g: r[0], d: r[1], c: ch.at(p.x, p.z) }); });
    var psets = _hasPsets();
    var kindIx = 0, plannedDone = false, osDone = false, slots = [];
    picked.forEach(function (c) {
      var mid = plan.poseAt(c.t0 + slotU / 2), cCam = ch.at(mid.x, mid.z);
      var lo = Math.max(0, cCam - STRETCH_M), hi = Math.min(ch.len, cCam + STRETCH_M);
      var inS = els.filter(function (e) { return e.c >= lo && e.c <= hi; });
      var card = null, tries = 0;
      while (!card && tries < KIND_ORDER.length) {
        var kind = KIND_ORDER[kindIx % KIND_ORDER.length]; kindIx++; tries++;
        card = _card(kind, inS, psets, lo, hi, plannedDone, osDone);
        if (card && kind === 'planned') plannedDone = true;
        if (card && kind === 'outstanding') osDone = true;
      }
      if (card) slots.push({ t0: c.t0, t1: c.t0 + slotU, busy: +c.busy.toFixed(3), chLo: Math.round(lo), chHi: Math.round(hi), card: card });
    });
    _rp = { slots: slots, plan: plan, median: median, w0: w0, w1: w1 };
    console.log('§ROAD_PANELS slots=' + slots.length + ' window=[' + w0.toFixed(4) + ',' + w1.toFixed(4) + '] (' + ((w1 - w0) * filmSec).toFixed(1) +
      's build-up drive) cardSec=' + PANEL_SEC + ' busyMedian=' + median.toFixed(3) + ' kinds=[' + slots.map(function (s) { return s.card.kind; }).join(',') +
      '] at=[' + slots.map(function (s) { return (s.t0 * filmSec).toFixed(1) + 's'; }).join(',') + '] routeLenM=' + ch.len.toFixed(0));
    return _rp;
  }

  // §ALTC_GROUND_CARDS G3 — counts of what the model lacks; each row a number its witness re-derives (no prose claim).
  // Civil disciplines = rates.js CIVIL_RATES keys; references (measure 'NONE': chainage labels, right-of-way) carry no properties by
  // nature and are not priced, so they are left out of every row.
  function _outstandingRows(psets) {
    var CR = window.CIVIL_RATES || {}, present = {};
    _q('SELECT discipline, COUNT(*) FROM elements_meta GROUP BY discipline').forEach(function (r) { present[r[0]] = r[1]; });
    var work = Object.keys(CR).filter(function (d) { return present[d] && CR[d] && CR[d].measure !== 'NONE'; });
    if (!work.length) return [];
    var inL = work.map(function (d) { return "'" + d + "'"; }).join(',');
    var noProps = (_q('SELECT COUNT(*) FROM elements_meta m WHERE m.discipline IN (' + inL + ')' +
      (psets ? ' AND NOT EXISTS (SELECT 1 FROM element_psets p WHERE p.guid = m.guid)' : ''))[0] || [0])[0];
    var noRate = work.filter(function (d) { return CR[d].rate == null; }).length;
    var byCount = work.filter(function (d) { return /^M[23]?$/.test(CR[d].measure) && CR[d].qtyBasis === 'EA'; }).length;
    var rows = [];
    if (noProps) rows.push({ label: 'Civil pieces with no properties', value: noProps, os: 'noProps' });
    if (noRate) rows.push({ label: 'Disciplines with no rate (RM)', value: noRate, os: 'noRate' });
    if (byCount) rows.push({ label: 'Disciplines timed by count, not by m / m² / m³', value: byCount, os: 'byCount' });
    return rows;
  }

  function _card(kind, inS, psets, lo, hi, plannedDone, osDone) {
    var head = 'CH ' + lo + '–' + hi + ' m (inferred)';
    if (kind === 'counts') {
      if (!inS.length) return null;
      var by = {}; inS.forEach(function (e) { by[e.d] = (by[e.d] || 0) + 1; });
      var rows = Object.keys(by).sort(function (x, y) { return by[y] - by[x]; }).map(function (d) {
        return [(A.cpeRevealDiscLabel ? A.cpeRevealDiscLabel(d) : d), by[d], d]; });
      return { kind: kind, title: 'This stretch — ' + head, rows: rows.map(function (r) { return { label: r[0], value: r[1], disc: r[2] }; }),
               guids: inS.map(function (e) { return e.g; }) };
    }
    if ((kind === 'drainage' || kind === 'signs') && psets) {
      var disc = kind === 'drainage' ? 'DRAINAGE' : 'SIGNAGE';
      var gs = inS.filter(function (e) { return e.d === disc; }).map(function (e) { return e.g; });
      if (!gs.length) return null;
      var inList = gs.map(function (g) { return "'" + String(g).replace(/'/g, "''") + "'"; }).join(',');
      var sql = kind === 'drainage'
        ? "SELECT a.value, COALESCE(b.value,''), COUNT(DISTINCT a.guid) FROM element_psets a LEFT JOIN element_psets b ON b.guid=a.guid AND b.name='03_Dimension' " +
          "WHERE a.name='02_Type' AND a.guid IN (" + inList + ") GROUP BY 1,2 ORDER BY 3 DESC LIMIT 3"
        : "SELECT a.value, COALESCE(b.value,''), COUNT(DISTINCT a.guid) FROM element_psets a LEFT JOIN element_psets b ON b.guid=a.guid AND b.name='16_Name' " +
          "WHERE a.name='17_Code' AND a.guid IN (" + inList + ") GROUP BY 1,2 ORDER BY 3 DESC LIMIT 3";
      var r = _q(sql);
      if (!r.length) return null;
      return { kind: kind, title: (kind === 'drainage' ? 'Drainage here — ' : 'Road signs here (JKR) — ') + head,
               rows: r.map(function (x) { return { label: x[0] + (x[1] ? ' · ' + x[1] : ''), value: +x[2], key: x[0], sub: x[1] }; }), guids: gs };
    }
    if (kind === 'check' && _checks) {
      var hits = [];
      inS.forEach(function (e) { (_checks[e.g] || []).forEach(function (c) { hits.push(c); }); });
      if (!hits.length) return null;
      hits.sort(function (a, b) { return (a.status === 'valid' ? 0 : 1) - (b.status === 'valid' ? 0 : 1); });
      var h = hits[0], row = h.row, rule = h.rule, val = row.measured, lim = row.limit, unit = row.unit || '';
      var meets = (typeof lim === 'number') ? (rule.name === 'chevron_spacing' ? Math.abs(val - lim) <= 0.5 : val >= lim) : false;
      var tag = h.status === 'valid' ? 'VALID' : 'SPECULATIVE';
      return { kind: kind, title: 'Road check — ' + rule.label, status: h.status, rule: rule.name, guid: row.guid, measured: val,
        rows: [{ label: rule.formula || rule.name, value: val + ' ' + unit },
               { label: rule.clause + ' (' + rule.verb + ')', value: (typeof lim === 'number' ? (rule.name === 'chevron_spacing' ? '= ' : '≥ ') + lim + ' ' + unit : String(lim) + ' ' + unit) },
               { label: 'result', value: typeof lim === 'number' ? (meets ? 'meets' : 'outside the limit') : 'matches no table row' },
               { label: tag, value: h.status === 'valid' ? 'method checked' : 'method under review' }],
        guids: [row.guid] };
    }
    if (kind === 'ground') {
      var gw = inS.filter(function (e) { return e.d === 'GEOTECH' || e.d === 'GABION'; });
      if (!gw.length) return null;
      var gg = gw.map(function (e) { return e.g; }), named = {}, rowsG = [];
      if (psets) {
        var gl = gg.map(function (g) { return "'" + String(g).replace(/'/g, "''") + "'"; }).join(',');
        _q("SELECT a.value, COUNT(DISTINCT a.guid), MIN(a.guid) FROM element_psets a WHERE a.name = '15_Name' AND a.guid IN (" + gl + ") " +
           "GROUP BY a.value ORDER BY 2 DESC LIMIT 4").forEach(function (x) {
          // the group's length as the file states it (22_DRIVEN_LENGTH "18m", 17_Length "12m SOIL NAILING …" → first word)
          var len = _q("SELECT value FROM element_psets WHERE guid = '" + String(x[2]).replace(/'/g, "''") + "' AND name IN ('22_DRIVEN_LENGTH','17_Length') LIMIT 1");
          rowsG.push({ label: x[0] + (len.length ? ' · ' + String(len[0][0]).split(' ')[0] : ''), value: +x[1], key: x[0] }); });
        _q("SELECT DISTINCT guid FROM element_psets WHERE name = '15_Name' AND guid IN (" + gl + ")").forEach(function (x) { named[x[0]] = 1; });
      }
      var rest = {}; gw.forEach(function (e) { if (!named[e.g]) rest[e.d] = (rest[e.d] || 0) + 1; });
      Object.keys(rest).forEach(function (d) { rowsG.push({ label: (A.cpeRevealDiscLabel ? A.cpeRevealDiscLabel(d) : d) + (psets && rowsG.length ? ' (other)' : ''), value: rest[d], disc: d, unnamed: true }); });
      var evl = A.isCivilModel && A.isCivilModel() ? A.earthworksVolumeLine() : null;   // §EW_VOLUME_SURFACE: measured, so it lives here, not on 'planned'
      if (evl) rowsG.push({ label: 'Earthworks volume', value: evl, vol: true });
      return { kind: kind, title: 'Ground works here — ' + head, rows: rowsG, guids: gg };
    }
    if (kind === 'outstanding' && !osDone) {
      var osRows = _outstandingRows(psets);
      if (!osRows.length) return null;
      return { kind: kind, title: 'Outstanding — not in this model yet', banner: 'red', rows: osRows, guids: [] };
    }
    if (kind === 'planned' && !plannedDone) {
      return { kind: kind, title: 'Coming to this view — planned', rows: [
        (function () { var ew = (_q("SELECT COUNT(*) FROM elements_meta WHERE discipline = 'EARTHWORK'")[0] || [0])[0];   // G2: true only when none
          return ew ? { label: 'Earthworks body (solids)', value: ew, disc: 'EARTHWORK' } : { label: 'Terrain profile', value: 'planned — no earthwork surface in this model' }; })(),
        { label: 'Weather', value: 'planned — no weather data' },
        { label: 'Traffic', value: 'planned — no traffic data' }].filter(Boolean), guids: [] };
    }
    return null;
  }

  function _slotAt(tNorm) {
    if (!_rp) return null;
    for (var i = 0; i < _rp.slots.length; i++) { var s = _rp.slots[i]; if (tNorm >= s.t0 && tNorm < s.t1) return s; }
    return null;
  }
  // the rect a card WOULD take at this frame size (right-middle, or left-middle when that overlaps a registered HUD rect)
  function _layout(ctx, w, h, card, avoid) {
    var fp = window.__hudFontPx, tPx = fp ? fp(h, 0.022, 10) : Math.round(h * 0.022), bPx = fp ? fp(h, 0.018, 9) : Math.round(h * 0.018);
    var pad = Math.round(bPx * 0.8), lh = Math.round(bPx * 1.45);
    ctx.save();
    ctx.font = '600 ' + tPx + 'px sans-serif'; var wMax = ctx.measureText(card.title).width;
    ctx.font = bPx + 'px sans-serif';
    card.rows.forEach(function (r) { wMax = Math.max(wMax, ctx.measureText(r.label + '   ' + r.value).width); });
    ctx.restore();
    var bw = Math.min(Math.round(w * 0.42), Math.ceil(wMax + 2 * pad)), bh = Math.ceil(tPx * 1.5 + card.rows.length * lh + 2 * pad);
    var y = Math.round(h * 0.38), cands = [{ x: w - bw - Math.round(w * 0.025), y: y }, { x: Math.round(w * 0.025), y: y }];
    var hit = function (c) { return (avoid || []).some(function (r) { return r.w > 1 && r.h > 1 && c.x < r.x + r.w && c.x + bw > r.x && c.y < r.y + r.h && c.y + bh > r.y; }); };
    var at = cands.filter(function (c) { return !hit(c); })[0] || cands[0];
    return { x: at.x, y: at.y, w: bw, h: bh, tPx: tPx, bPx: bPx, pad: pad, lh: lh, overlap: hit(at) };
  }
  A.roadPanelsLastBox = null;
  // Draws the card for this film fraction, or nothing. opacity = the freeze fade handed in by _drawUnlessHold.
  A.roadPanelsCompositeOntoCanvas = function (ctx, w, h, tNorm, opacity) {
    A.roadPanelsLastBox = null;
    var s = _slotAt(tNorm); if (!s) return null;
    var c = s.card, L = _layout(ctx, w, h, c, A._hudLayoutRects);
    var span = s.t1 - s.t0, u = (tNorm - s.t0) / span, fade = Math.min(1, u / 0.08, (1 - u) / 0.08);   // ~0.4 s ease in/out
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, fade)) * (opacity == null ? 1 : opacity);
    ctx.fillStyle = 'rgba(12,16,22,0.78)';
    var r = Math.round(L.pad * 0.8);
    ctx.beginPath(); ctx.moveTo(L.x + r, L.y); ctx.arcTo(L.x + L.w, L.y, L.x + L.w, L.y + L.h, r); ctx.arcTo(L.x + L.w, L.y + L.h, L.x, L.y + L.h, r);
    ctx.arcTo(L.x, L.y + L.h, L.x, L.y, r); ctx.arcTo(L.x, L.y, L.x + L.w, L.y, r); ctx.closePath(); ctx.fill();
    if (c.banner === 'red') {   // §ALTC_GROUND_CARDS G3: the outstanding card's title sits on a red banner
      ctx.fillStyle = '#c0392b'; ctx.fillRect(L.x, L.y, L.w, L.pad + L.tPx * 1.25);
    }
    ctx.fillStyle = c.banner === 'red' ? '#ffffff' : '#ffd27a'; ctx.font = '600 ' + L.tPx + 'px sans-serif'; ctx.textBaseline = 'top';
    ctx.fillText(c.title, L.x + L.pad, L.y + L.pad);
    ctx.font = L.bPx + 'px sans-serif';
    c.rows.forEach(function (row, i) {
      var yy = L.y + L.pad + L.tPx * 1.5 + i * L.lh;
      ctx.fillStyle = '#e8edf2'; ctx.textAlign = 'left'; ctx.fillText(String(row.label), L.x + L.pad, yy);
      ctx.fillStyle = c.kind === 'planned' ? '#9aa7b4' : '#ffffff'; ctx.textAlign = 'right'; ctx.fillText(String(row.value), L.x + L.w - L.pad, yy);
    });
    ctx.restore();
    A.roadPanelsLastBox = { x: L.x, y: L.y, w: L.w, h: L.h };
    if (!s._logged) { s._logged = true;
      console.log('§ROAD_PANEL_DRAW kind=' + c.kind + ' t=' + tNorm.toFixed(4) + ' rect=' + [L.x, L.y, L.w, L.h].join(',') + ' frame=' + w + 'x' + h +
        ' overlapHud=' + L.overlap + ' rows=' + c.rows.length); }
    return A.roadPanelsLastBox;
  };
  A.roadPanelsSlots = function () { return _rp ? _rp.slots : null; };
  A.roadPanelsCardOf = function (kind) {
    var inS = [];   // 'ground' needs its stretch members: for the witness, every GEOTECH/GABION element of the model
    if (kind === 'ground') _q("SELECT guid, discipline FROM elements_meta WHERE discipline IN ('GEOTECH','GABION')").forEach(function (x) { inS.push({ g: x[0], d: x[1] }); });
    return _card(kind, inS, _hasPsets(), 0, 0, false, false); };   // witness access: one card kind, whatever the film slots picked
  // §ALTC_V3_CHAINAGE_ROW: ONE owner for "where along the drive is this point" on a road film (the status box's Chainage row reads it).
  // Same projection the cards use, on the film's drive route (A.civilDriveRoute). Null on a building.
  var _chainRouteRef = null, _chainFn = null;
  A.civilChainageAt = function (x, z) {
    if (!(A.isCivilModel && A.isCivilModel()) || typeof A.civilDriveRoute !== 'function') return null;
    var r = A.civilDriveRoute(); if (!r || r.length < 2) return null;
    if (_chainRouteRef !== r) { _chainRouteRef = r; _chainFn = _chainager(r); }
    return _chainFn.at(x, z);
  };
  A.roadPanelsDispose = function () { _rp = null; A.roadPanelsLastBox = null; };
}
if (typeof window !== 'undefined') window.setupCpeRoadPanels = setupCpeRoadPanels;
