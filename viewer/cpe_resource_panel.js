/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// cpe_resource_panel.js — §CPE_RESOURCE_PANEL (prompts/CINEMA_PATH_EDITOR.md).
// User, 2026-08-30: "do the resources well with its pie chart progression … the quality finishing
// be better ie bevel or cylindrical shapped pie chart and the avatar + qty" … "with the balance in
// 'empty glass cylinder' for wow effect. And if it reflects the canvas scene sunlight direction can
// be good too" … "must not be too expensive. It is user's choice as its the Label ON option."
//
// The Gantt was dropped on the user's own ruling — the bottom caption already names the phase. What
// this adds is the thing nothing else on screen says: WHO is on site today, and how many.
//
// NOTHING HERE IS DERIVED OR INVENTED.
//   • WHO/WHEN — window.tmOpsSnapshot() (§TM_OPS_SNAPSHOT), a read-only copy of the ops
//     time_machine.js already authored: start_ts, _end_ts, resource. No second schedule opinion.
//   • HOW MANY — rates.js LABOR_RATES: crew_size / max_crews / trade, CIDB-2024 derived.
//   • CREWS ARE CAPPED. Concurrent OPS are not concurrent CREWS: 500 wall elements in a day is not
//     500 gangs. §CREW_CAP_FINAL measured Terminal's CARPENTER peak at 20 against a cap of 2 — a
//     10x breach — before the re-pack fix. A pie makes that number the subject of the shot, so
//     crews are clamped to max_crews here and the witness asserts it.
//
// COST. Drawn in _captureFrame's 2D compositing path, never in-scene: a real cylinder + real glass
// would enter the lit/AO/TAA pipeline and be paid on all 24 AO frames of every still. The pie is
// rebuilt only when the DAY changes (dayKey), and the backdrop blur is the only per-frame work.
function setupCpeResourcePanel(A) {
  var POS = { tr: 1, tl: 1, br: 1, bl: 1 };
  var MS_PER_DAY = 86400000;

  // Trade colours — distinct hues, readable small. Keyed on the resource ids rates.js already uses.
  var TRADE_COLOR = {
    CONCRETE_GANG: '#8d9aa8', STEEL_ERECTOR: '#e8833a', CARPENTER: '#c08a4a',
    MASON: '#b5563f', PLUMBER: '#3f8fc4', ELECTRICIAN: '#e6c34a',
    HVAC_TECH: '#4fb3a5', FINISHER: '#9a7fc0', GENERAL_LABOR: '#7e8a97'
  };
  var FALLBACK = ['#6d8fb0', '#b07d6d', '#7fb08a', '#b0a06d', '#8a7fb0', '#b06d95'];

  function _rates() {
    return (typeof window !== 'undefined' && (window.LABOR_RATES || (A && A.LABOR_RATES))) || null;
  }

  // ── The composition, and ONLY the composition. Pure, so a witness gates this arithmetic at exact
  // cursors instead of hoping a bake produces them — the same contract dayCounterAt keeps.
  // Returns null when there is nothing real to draw, so the caller omits the panel rather than
  // drawing a confident empty ring.
  A.resourcePanelAt = function(cursorMs, ops, projectStartMs, projectEndMs) {
    if (!ops || !ops.length || !(projectEndMs > projectStartMs)) return null;
    var LR = _rates();
    var dayStart = projectStartMs + Math.floor((cursorMs - projectStartMs) / MS_PER_DAY) * MS_PER_DAY;
    var dayEnd = dayStart + MS_PER_DAY;
    var byTrade = {}, i, o;
    for (i = 0; i < ops.length; i++) {
      o = ops[i];
      if (!o.r) continue;
      if (o.s >= dayEnd) break;              // ops are sorted by start_ts — stop, don't scan on
      if ((o.e == null ? o.s : o.e) < dayStart) continue;
      byTrade[o.r] = (byTrade[o.r] || 0) + 1;
    }
    var rows = [], total = 0, k;
    for (k in byTrade) {
      var rate = LR && LR[k] ? LR[k] : null;
      var crewSize = (rate && rate.crew_size) || 1;
      var cap = (rate && rate.max_crews) || 3;
      // concurrent ops -> crews, CAPPED. See §CREW_CAP_FINAL in the header.
      var crews = Math.max(1, Math.min(cap, byTrade[k]));
      var heads = crews * crewSize;
      rows.push({ trade: k, label: (rate && rate.trade) || k, crews: crews, crewSize: crewSize,
                  heads: heads, ops: byTrade[k], capped: byTrade[k] > cap, cap: cap });
      total += heads;
    }
    if (!rows.length) {
      // §CPE_RESOURCE_PANEL_WHY — a null must say WHY. First call only, so a 3,000-frame bake does
      // not print this 3,000 times. The two real causes are distinguishable and need opposite fixes:
      // no op carries a `resource` at all (the schedule was generated without trade assignment), or
      // the cursor's day simply has nothing running.
      if (!A._resWhyLogged) {
        A._resWhyLogged = true;
        var withR = 0, spanLo = Infinity, spanHi = -Infinity, j;
        for (j = 0; j < ops.length; j++) {
          if (ops[j].r) withR++;
          if (ops[j].s < spanLo) spanLo = ops[j].s;
          if ((ops[j].e || ops[j].s) > spanHi) spanHi = ops[j].e || ops[j].s;
        }
        console.log('§CPE_RESOURCE_PANEL INCONCLUSIVE ops=' + ops.length + ' withResource=' + withR +
          ' day=[' + new Date(dayStart).toISOString().slice(0, 10) + ']' +
          ' opsSpan=[' + (isFinite(spanLo) ? new Date(spanLo).toISOString().slice(0, 10) : '?') + '..' +
          (isFinite(spanHi) ? new Date(spanHi).toISOString().slice(0, 10) : '?') + ']' +
          ' rates=' + (!!LR) + ' — ' +
          (withR === 0 ? 'NO op carries a resource: this schedule was authored without trade assignment'
                       : 'no trade is active on this day') + '; panel omitted, not blank');
      }
      return null;
    }
    rows.sort(function (a, b) { return b.heads - a.heads; });
    var elapsed = Math.max(0, Math.min(1, (cursorMs - projectStartMs) / (projectEndMs - projectStartMs)));
    return { rows: rows, totalHeads: total, progress: elapsed,
             dayKey: Math.floor((cursorMs - projectStartMs) / MS_PER_DAY),
             ratesPresent: !!LR };
  };

  // Sun azimuth from the REAL scene light, so the cylinder's highlight and its dropped shadow fall
  // on the same side as every shadow in the frame behind it — and track the Alt+C noon->dusk arc.
  // Returns a 2D unit direction in panel space, or a sane default when there is no sun to read.
  A.resourcePanelLightDir = function () {
    var sp = A.sun && A.sun.position;
    if (!sp) return { x: -0.55, y: -0.83 };
    var L = Math.sqrt(sp.x * sp.x + sp.z * sp.z);
    if (!(L > 1e-6)) return { x: -0.55, y: -0.83 };
    // world X -> panel X, world Z -> panel Y (screen Y grows down, hence the negation)
    return { x: sp.x / L, y: -sp.z / L };
  };

  var _cacheKey = null, _cacheCanvas = null;

  // ── The ONLY place the panel is drawn, so live preview and baked video cannot disagree.
  A.resourcePanelCompositeOntoCanvas = function (ctx, w, h, info, opacity, pos, stackY) {
    if (!ctx || !info || !(opacity > 0)) return;
    var bw = Math.round(h * 0.36), bh = Math.round(h * 0.24);
    var margin = Math.round(h * 0.028);
    var at = (pos && POS[pos]) ? pos : 'tr';
    var sy = stackY || 0;
    var x = (at === 'tl' || at === 'bl') ? margin : w - margin - bw;
    var y = (at === 'bl' || at === 'br') ? h - margin - bh - sy : margin + sy;
    var rad = Math.round(bh * 0.09);

    ctx.save();
    ctx.globalAlpha = Math.min(1, opacity);

    // ── Frosted glass. Cheap only HERE: _captureFrame has already drawn the rendered frame into
    // this context, so the pixels behind the panel exist and can be blurred back over themselves.
    var glass = false;
    try {
      if (typeof ctx.filter === 'string' && typeof document !== 'undefined' && document.createElement) {
        var tmp = document.createElement('canvas');
        tmp.width = bw; tmp.height = bh;
        tmp.getContext('2d').drawImage(ctx.canvas, x, y, bw, bh, 0, 0, bw, bh);
        ctx.save();
        _round(ctx, x, y, bw, bh, rad); ctx.clip();
        ctx.filter = 'blur(9px)';
        ctx.drawImage(tmp, x - 9, y - 9, bw + 18, bh + 18);   // overscan: no dark halo at the edge
        ctx.filter = 'none';
        ctx.restore();
        glass = true;
      }
    } catch (e) { glass = false; }
    _round(ctx, x, y, bw, bh, rad);
    ctx.fillStyle = glass ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.45)';
    ctx.fill();
    _round(ctx, x, y, bw, bh, rad);
    ctx.strokeStyle = 'rgba(255,255,255,0.20)'; ctx.lineWidth = 1; ctx.stroke();

    // ── The pie + ring are static for a whole calendar day, so they are rendered once into an
    // offscreen canvas and blitted. The user's own instruction: "yes reprint if no change".
    var lit = A.resourcePanelLightDir();
    var key = info.dayKey + '|' + bw + 'x' + bh + '|' + info.rows.length + '|' +
              info.progress.toFixed(3) + '|' + lit.x.toFixed(2) + ',' + lit.y.toFixed(2);
    if (_cacheKey !== key || !_cacheCanvas) {
      _cacheCanvas = _renderPanel(bw, bh, info, lit);
      _cacheKey = key;
    }
    if (_cacheCanvas) {
      ctx.save();
      _round(ctx, x, y, bw, bh, rad); ctx.clip();
      ctx.drawImage(_cacheCanvas, x, y);
      ctx.restore();
    }
    ctx.restore();
  };

  function _renderPanel(bw, bh, info, lit) {
    var c = document.createElement('canvas');
    c.width = bw; c.height = bh;
    var g = c.getContext('2d');
    // §CPE_RESOURCE_PANEL_LAYOUT (2026-08-30, found by rendering a real frame, not by reading): the
    // pie was sized from panel HEIGHT and the list took whatever was left over — which at 216x187
    // was 3.5 PIXELS. Trade names rendered as one letter each and "36 on site" was clipped mid-word.
    // The list's width is now RESERVED FIRST and the pie fits into the remainder, so the text column
    // can never be squeezed out no matter how the panel is proportioned.
    var pad = Math.round(bh * 0.10);
    var listW = Math.max(Math.round(bw * 0.46), 96);
    var pieW = bw - listW - Math.round(pad * 1.4);
    var cy = bh / 2;
    var R = Math.max(10, Math.min(pieW / 2 / 1.22, (bh - pad * 2) / 2 * 0.82));
    var cx = pad + pieW / 2;
    var RY = R * 0.52;                 // squashed = the cylinder seen at an angle
    var depth = Math.max(4, R * 0.30); // extruded skirt height

    // ══ 1. Progress ring — the outer perimeter. The elapsed arc is solid; the balance is an EMPTY
    // GLASS CYLINDER (the user's phrase): a translucent wall with a rim highlight, so the remainder
    // reads as "still to build" rather than as chart background.
    var ringR = R * 1.20, ringRY = RY * 1.20, ringW = Math.max(3, R * 0.13);
    var a0 = -Math.PI / 2, a1 = a0 + info.progress * Math.PI * 2;
    // glass shell, full circle first
    g.save();
    g.lineWidth = ringW;
    g.strokeStyle = 'rgba(255,255,255,0.13)';
    _ellipseArc(g, cx, cy + depth * 0.5, ringR, ringRY, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.13)';
    _ellipseArc(g, cx, cy, ringR, ringRY, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 1;
    _ellipseArc(g, cx, cy, ringR, ringRY, 0, Math.PI * 2); g.stroke();
    g.restore();
    // filled portion — skirt then top, so the fill reads as a solid wall inside the glass
    if (info.progress > 0.001) {
      g.save();
      g.lineWidth = ringW;
      g.strokeStyle = 'rgba(120,200,255,0.45)';
      _ellipseArc(g, cx, cy + depth * 0.5, ringR, ringRY, a0, a1); g.stroke();
      g.strokeStyle = 'rgba(150,220,255,0.90)';
      _ellipseArc(g, cx, cy, ringR, ringRY, a0, a1); g.stroke();
      g.restore();
    }

    // ══ 2. The composition pie, as a cylinder: skirt first (darker, offset down), then the top
    // face, then a specular arc on the sun side. Standard 2D cylinder construction — and at this
    // size it reads more solid than a real lit mesh would, because the scene's own lighting is
    // near-uniform (the §TRIPLANAR_NORMAL lesson: 4.3% under flat light).
    var acc = -Math.PI / 2, i, row, frac, col;
    for (i = 0; i < info.rows.length; i++) {
      row = info.rows[i];
      frac = row.heads / info.totalHeads;
      col = TRADE_COLOR[row.trade] || FALLBACK[i % FALLBACK.length];
      _wedge(g, cx, cy + depth, R, RY, acc, acc + frac * Math.PI * 2, _shade(col, -0.45));
      acc += frac * Math.PI * 2;
    }
    acc = -Math.PI / 2;
    for (i = 0; i < info.rows.length; i++) {
      row = info.rows[i];
      frac = row.heads / info.totalHeads;
      col = TRADE_COLOR[row.trade] || FALLBACK[i % FALLBACK.length];
      var mid = acc + frac * Math.PI;
      // curvature: brighter where the wedge faces the sun, darker where it turns away
      var facing = Math.cos(mid) * lit.x + Math.sin(mid) * lit.y;
      _wedge(g, cx, cy, R, RY, acc, acc + frac * Math.PI * 2, _shade(col, 0.18 * facing));
      acc += frac * Math.PI * 2;
    }
    // specular arc on the sun side of the top face
    g.save();
    g.strokeStyle = 'rgba(255,255,255,0.30)'; g.lineWidth = Math.max(1, R * 0.06);
    var sa = Math.atan2(lit.y, lit.x);
    _ellipseArc(g, cx, cy, R * 0.88, RY * 0.88, sa - 0.55, sa + 0.55); g.stroke();
    g.restore();

    // ══ 3. Avatar + qty rows. The staffage PNGs already vendored are office/street people
    // (sitting formal, walking with shopping) — wrong for a trade, so the figure is drawn: a
    // hard-hat silhouette tinted per trade. Zero assets, crisp at any export size.
    var lx = bw - listW;
    var availW = listW - pad;
    var fs = Math.max(9, Math.round(bh * 0.085));
    var rowH = Math.round(fs * 1.55);
    var maxRows = Math.max(1, Math.floor((bh - pad * 2 - fs * 1.4) / rowH));
    g.textBaseline = 'middle';
    g.font = '700 ' + Math.round(fs * 1.15) + 'px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
    g.fillStyle = '#fff';
    g.fillText(info.totalHeads + ' on site', lx, pad + fs * 0.7);
    g.font = '600 ' + fs + 'px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
    var ry = pad + fs * 0.7 + rowH * 0.95;
    for (i = 0; i < Math.min(maxRows, info.rows.length); i++) {
      row = info.rows[i];
      col = TRADE_COLOR[row.trade] || FALLBACK[i % FALLBACK.length];
      _worker(g, lx + fs * 0.42, ry, fs * 0.92, col);
      g.fillStyle = 'rgba(255,255,255,0.92)';
      var name = _short(row.label);
      var qty = '×' + row.heads;
      var qw = g.measureText(qty).width;
      g.fillText(_fit(g, name, availW - fs * 1.3 - qw - 6), lx + fs * 1.05, ry);
      g.fillStyle = 'rgba(255,255,255,0.70)';
      g.fillText(qty, bw - pad - qw, ry);
      ry += rowH;
    }
    if (info.rows.length > maxRows) {
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillText('+' + (info.rows.length - maxRows) + ' more', lx + fs * 1.05, ry);
    }
    return c;
  }

  // A hard-hat worker silhouette — helmet, head, shoulders. Deliberately simple: it must read at
  // ~10px, where detail becomes mud.
  function _worker(g, x, y, s, col) {
    g.save(); g.translate(x, y); g.fillStyle = col;
    g.beginPath(); g.arc(0, -s * 0.16, s * 0.20, Math.PI, 0); g.closePath(); g.fill();   // helmet
    g.beginPath(); g.ellipse(0, -s * 0.02, s * 0.15, s * 0.16, 0, 0, Math.PI * 2); g.fill(); // head
    g.beginPath();
    g.moveTo(-s * 0.30, s * 0.50); g.lineTo(-s * 0.22, s * 0.14);
    g.lineTo(s * 0.22, s * 0.14); g.lineTo(s * 0.30, s * 0.50);
    g.closePath(); g.fill();                                                              // shoulders
    g.restore();
  }

  function _wedge(g, cx, cy, R, RY, a0, a1, fill) {
    g.beginPath(); g.moveTo(cx, cy);
    var steps = Math.max(2, Math.ceil((a1 - a0) / 0.12)), i, a;
    for (i = 0; i <= steps; i++) { a = a0 + (a1 - a0) * i / steps; g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * RY); }
    g.closePath(); g.fillStyle = fill; g.fill();
  }
  function _ellipseArc(g, cx, cy, R, RY, a0, a1) {
    g.beginPath();
    var steps = Math.max(8, Math.ceil(Math.abs(a1 - a0) / 0.08)), i, a;
    for (i = 0; i <= steps; i++) { a = a0 + (a1 - a0) * i / steps; g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * R, cy + Math.sin(a) * RY); }
  }
  function _shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
    function m(v) { return Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt))); }
    return 'rgb(' + m(r) + ',' + m(gg) + ',' + m(b) + ')';
  }
  function _short(s) { return String(s).replace(/\s*\((Skilled|Mixed)\)\s*/i, '').replace(/\s*\+\s*Laborers/i, ''); }
  function _fit(g, s, maxW) {
    if (g.measureText(s).width <= maxW) return s;
    while (s.length > 2 && g.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }
  function _round(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);         ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
if (typeof window !== 'undefined') window.setupCpeResourcePanel = setupCpeResourcePanel;
