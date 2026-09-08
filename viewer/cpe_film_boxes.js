/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// cpe_film_boxes.js — §HUD_BOX / §STATUS_BOX / §MEASURE_BOX.
// Implementing bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §38.1a + §38.1b + §40.1 —
// Witness: W-FILM-BOXES (viewer/tests/witness_film_boxes.js).
//
// USER, 2026-09-08: "I think it is because it is messed up by the status that flickers around. Thus
// it should be its own info panel." … "Status should also be deprecated and appear as below the HUD
// in its own box like that organises Storey / Room / BuildUp action etc."
//
// THE ONE RULE THIS FILE EXISTS FOR: a rectangle is decided by (w, h, corner, armed) and by NOTHING
// ELSE. No text, no per-frame content, no measured string width. The centred lower-third caption it
// replaces sized its plate to its own text and re-centred it every frame, so the box moved and
// resized whenever the caption changed — three fixed boxes are the fix, and "fixed" only means
// anything if the geometry cannot see the content.
//
// ⚠ THE FLICKER AT THE 9 s PLATE BEAT IS NOT THIS (§40.0, measured before this file was written).
// It is a whole-frame single-frame luma dip — 34 in the 4,699-frame Hospital film, 15 of them inside
// 8.96-17.75 s — and a 2D overlay redraw cannot darken 55 % of the frame's pixels. This box is built
// because §38.1b asked for it in its own right, NOT as that fix. Do not close the flicker on it.
function setupCpeFilmBoxes(A) {
  var POS = { tr: 1, tl: 1, br: 1, bl: 1 };
  var OPP = { tr: 'bl', tl: 'br', br: 'tl', bl: 'tr' };

  // §STATUS_BOX — FOUR rows, fixed order, fixed height. A row with nothing to say is BLANK, never
  // removed: removing it would change the box's height, which is the exact defect being fixed.
  // Row 4 ("Reveal") is §38.1b's "…" — the discipline-parade caption, the one remaining caption
  // source in the code. It is not an invented row.
  var STATUS_ROWS = ['Storey', 'Room', 'Build-up', 'Reveal'];
  var MEASURE_ROWS = 4;         // a title + up to this many figure rows; the box never grows

  var F = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';

  // ── GEOMETRY. Pure, so the witness gates the rectangles without a bake — the same contract
  // dayCounterAt and bigStatsAt keep. `armed` says which HUD members this FILM has, decided once
  // per bake and never per frame: a day counter that drops out for a stretch must not move the
  // boxes underneath it.
  A.filmBoxesLayout = function (w, h, armed) {
    armed = armed || {};
    var at = (armed.pos && POS[armed.pos]) ? armed.pos : 'tr';
    var margin = Math.round(h * 0.028);
    var gap = Math.round(h * 0.012);
    var bw = Math.round(h * 0.36);                       // the widest HUD member (cpe_resource_panel _box)
    var top = (at === 'tl' || at === 'tr');
    var left = (at === 'tl' || at === 'bl');

    var hudH = 0, parts = [];
    if (armed.day) { var dh = (A.dayCounterBoxSize ? A.dayCounterBoxSize(h).h : Math.round(h * 0.079)); parts.push(dh); }
    if (armed.overview) parts.push(Math.round(h * 0.20));
    if (armed.stats) parts.push(Math.round(h * 0.24));
    for (var i = 0; i < parts.length; i++) hudH += parts[i] + (i ? gap : 0);

    var x = left ? margin : w - margin - bw;
    var hud = { x: x, y: top ? margin : h - margin - hudH, w: bw, h: hudH, n: parts.length };

    // the status box is the NEXT slot in the SAME column — below the HUD for a top corner, and
    // correspondingly further from the corner for a bottom one. Either way the rect is logged.
    var rowH = Math.round(h * 0.030), pad = Math.round(h * 0.012);
    var statusH = pad * 2 + STATUS_ROWS.length * rowH;
    var status = { x: x, w: bw, h: statusH, rowH: rowH, pad: pad,
                   y: top ? (margin + hudH + (hudH ? gap : 0)) : (h - margin - hudH - (hudH ? gap : 0) - statusH) };

    // the Measure panel takes the corner diagonally opposite, so it can never share a screen edge
    // with the column it must not be confused with.
    var mAt = OPP[at];
    var mw = Math.round(h * 0.34), mh = pad * 2 + (MEASURE_ROWS + 1) * rowH;
    var mLeft = (mAt === 'tl' || mAt === 'bl'), mTop = (mAt === 'tl' || mAt === 'tr');
    // a frame narrow enough for the two columns to meet shrinks the MEASURE box, never the HUD —
    // and says so, rather than silently overlapping.
    var clamped = 0;
    if (mw + bw + margin * 3 > w) { clamped = mw; mw = Math.max(Math.round(h * 0.18), w - bw - margin * 3); }
    var measure = { x: mLeft ? margin : w - margin - mw, y: mTop ? margin : h - margin - mh,
                    w: mw, h: mh, rowH: rowH, pad: pad, rows: MEASURE_ROWS, clampedFrom: clamped };
    return { pos: at, hud: hud, status: status, measure: measure, margin: margin, gap: gap };
  };

  function overlaps(a, b) {
    return a.w > 0 && b.w > 0 && a.h > 0 && b.h > 0 &&
           a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }
  A.filmBoxesOverlap = overlaps;

  // ── ARM: called once per bake with the frame size and which HUD members this film has. Prints the
  // three rectangles ONCE — they cannot change afterwards, so printing them per frame would be noise
  // and printing them never would leave §38.1b's witness with nothing to read.
  var _armed = null, _layout = null;
  A.filmBoxesArm = function (w, h, armed) {
    _armed = { pos: (armed && armed.pos) || 'tr', day: !!(armed && armed.day),
               overview: !!(armed && armed.overview), stats: !!(armed && armed.stats) };
    _layout = A.filmBoxesLayout(w, h, _armed);
    var L = _layout;
    var r = function (b) { return b.x + ',' + b.y + ' ' + b.w + 'x' + b.h; };
    console.log('§HUD_BOX ' + r(L.hud) + ' pos=' + L.pos + ' members=' + L.hud.n +
      ' (day=' + _armed.day + ' overview=' + _armed.overview + ' stats=' + _armed.stats + ') frame=' + w + 'x' + h);
    console.log('§STATUS_BOX ' + r(L.status) + ' rows=' + STATUS_ROWS.join('|') +
      ' rowH=' + L.status.rowH + ' — fixed: a row with nothing to say is BLANK, the box never resizes');
    console.log('§MEASURE_BOX ' + r(L.measure) + ' maxRows=' + L.measure.rows +
      (L.measure.clampedFrom ? ' clampedFrom=' + L.measure.clampedFrom + ' (frame too narrow for two full columns)' : '') +
      ' — Measure figures only; not drawn when no Measure beat is live');
    console.log('§FILM_BOXES_DISJOINT hud/status=' + overlaps(L.hud, L.status) +
      ' hud/measure=' + overlaps(L.hud, L.measure) + ' status/measure=' + overlaps(L.status, L.measure));
    return L;
  };
  A.filmBoxesLayoutOf = function () { return _layout; };
  A.filmBoxesArmed = function () { return _armed; };
  A.filmBoxesStatusRowNames = function () { return STATUS_ROWS.slice(); };
  A.filmBoxesDisarm = function () { _armed = null; _layout = null; _queue = []; };

  // ── STATUS ROWS. Pure: takes the four caption sources the bake already computes and returns the
  // fixed four rows. A source that is null yields '' — the row still exists.
  // `buildup` is the Time-Machine frontier phase, which until now was smuggled into the room caption
  // as " [phase]" by roomTitleFinalText — which is precisely what made that plate resize mid-shot.
  A.filmBoxesStatusRows = function (src) {
    src = src || {};
    var pick = function (v) {
      if (!v) return '';
      if (typeof v === 'string') return v;
      return (v.opacity == null || v.opacity > 0) ? (v.name || '') : '';
    };
    return [ { label: 'Storey', text: pick(src.storey) },
             { label: 'Room', text: pick(src.room) },
             { label: 'Build-up', text: pick(src.buildup) },
             { label: 'Reveal', text: pick(src.reveal) } ];
  };

  function plate(ctx, b) {
    var rad = Math.round(Math.min(b.h, b.w) * 0.09);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, rad); ctx.fill(); }
    else ctx.fillRect(b.x, b.y, b.w, b.h);
  }
  // shrink, then ellipsis — the same rule §CPE_CARD_FIT settled for the stat card: a label a client
  // cannot read is the same failure as no label at all.
  function fitText(ctx, text, maxW, px, floor, weight) {
    var p = px;
    while (p > floor) {
      ctx.font = weight + ' ' + p + 'px ' + F;
      if (ctx.measureText(text).width <= maxW) return p;
      p -= 1;
    }
    ctx.font = weight + ' ' + p + 'px ' + F;
    if (ctx.measureText(text).width <= maxW) return p;
    var t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return { px: p, text: t + '…' };
  }
  function drawFitted(ctx, text, x, y, maxW, px, floor, weight) {
    var r = fitText(ctx, text, maxW, px, floor, weight);
    var t = text;
    if (r && r.text != null) { t = r.text; ctx.font = weight + ' ' + r.px + 'px ' + F; }
    ctx.fillText(t, x, y);
  }

  // ── STATUS BOX draw. ONE implementation, so a live preview and the exported bytes cannot disagree
  // (the same contract cpe_day_counter.js and cpe_room_title.js keep).
  var _statLogged = null;
  A.filmBoxesDrawStatus = function (ctx, w, h, rows, armed) {
    var L = (armed ? A.filmBoxesLayout(w, h, armed) : _layout) || A.filmBoxesLayout(w, h, _armed || {});
    var b = L.status;
    if (!ctx || !b || b.h <= 0) return 0;
    rows = rows || A.filmBoxesStatusRows(null);
    ctx.save();
    plate(ctx, b);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    var labPx = Math.max(9, Math.round(b.rowH * 0.46));
    var valPx = Math.max(11, Math.round(b.rowH * 0.60));
    var labW = Math.round(b.w * 0.30), gapX = Math.round(b.pad * 0.6);
    var n = 0;
    for (var i = 0; i < rows.length; i++) {
      var cy = b.y + b.pad + b.rowH * (i + 0.5);
      ctx.fillStyle = 'rgba(255,255,255,0.50)';
      ctx.font = '600 ' + labPx + 'px ' + F;
      ctx.fillText(rows[i].label, b.x + b.pad, cy);
      if (!rows[i].text) continue;                        // BLANK, and the row still occupies its slot
      ctx.fillStyle = '#fff';
      drawFitted(ctx, rows[i].text, b.x + b.pad + labW + gapX, cy,
                 b.w - b.pad * 2 - labW - gapX, valPx, Math.max(9, Math.round(valPx * 0.66)), '600');
      n++;
    }
    ctx.restore();
    var key = rows.map(function (r) { return r.text; }).join('|');
    if (_statLogged !== key) {
      _statLogged = key;
      console.log('§STATUS_BOX_ROWS ' + rows.map(function (r) { return r.label + '="' + r.text + '"'; }).join(' ') +
        ' filled=' + n + '/' + rows.length + ' rect=' + b.x + ',' + b.y + ' ' + b.w + 'x' + b.h);
    }
    return n;
  };

  // ── MEASURE BOX. Every Measure module keeps calling A.flythruDrawPanel unchanged; that function
  // posts here instead of drawing a roaming plate with a leader. The box is the ONE place a Measure
  // figure appears, and it is NOT DRAWN AT ALL when nothing posted this frame (§38.1a).
  var _queue = [];
  A.filmBoxesMeasureReset = function () { _queue = []; };
  A.filmBoxesMeasurePost = function (title, rows, ink) {
    if (!_armed && !_layout) return 0;                    // not a filmBoxes bake — caller falls back
    _queue.push({ title: String(title == null ? '' : title),
                  rows: (rows || []).map(function (r) { return String(r); }),
                  ink: ink });
    return _queue.length;
  };
  A.filmBoxesMeasureQueue = function () { return _queue.slice(); };

  var _measLogged = null, _measIdleLogged = false;
  A.filmBoxesDrawMeasure = function (ctx, w, h, armed) {
    var L = (armed ? A.filmBoxesLayout(w, h, armed) : _layout) || A.filmBoxesLayout(w, h, _armed || {});
    var b = L.measure;
    var q = _queue; _queue = [];
    if (!ctx || !b) return 0;
    if (!q.length) {
      if (!_measIdleLogged) { _measIdleLogged = true; console.log('§MEASURE_BOX rows=0 idle — no Measure beat live, nothing drawn'); }
      _measLogged = null;
      return 0;
    }
    _measIdleLogged = false;
    // more than one beat posting in the same frame is a §14 slot collision; the box shows the FIRST
    // and names the rest rather than stacking two panels into a fixed height.
    var head = q[0];
    var lines = head.rows.slice(0, b.rows);
    var extra = q.length - 1;
    ctx.save();
    plate(ctx, b);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    var titlePx = Math.max(11, Math.round(b.rowH * 0.56));
    var rowPx = Math.max(11, Math.round(b.rowH * 0.62));
    var innerW = b.w - b.pad * 2;
    ctx.fillStyle = head.ink != null ? '#ffd600' : '#ffd600';    // §7's cue ink, one colour for Measure
    drawFitted(ctx, head.title || 'Measure', b.x + b.pad, b.y + b.pad + b.rowH * 0.5, innerW,
               titlePx, Math.max(9, Math.round(titlePx * 0.7)), '700');
    ctx.fillStyle = '#fff';
    for (var i = 0; i < lines.length; i++) {
      drawFitted(ctx, lines[i], b.x + b.pad, b.y + b.pad + b.rowH * (i + 1.5), innerW,
                 rowPx, Math.max(9, Math.round(rowPx * 0.7)), '500');
    }
    ctx.restore();
    var key = head.title + '|' + lines.join('|') + '|' + extra;
    if (_measLogged !== key) {
      _measLogged = key;
      console.log('§MEASURE_BOX title="' + head.title + '" rows=' + lines.length + '/' + head.rows.length +
        ' [' + lines.join(' · ') + '] rect=' + b.x + ',' + b.y + ' ' + b.w + 'x' + b.h +
        (extra ? ' ALSO_POSTED=' + extra + ' (§14 slot collision — first shown, rest named here)' : ''));
    }
    return lines.length;
  };

  console.log('§FILM_BOXES_INIT wired (three fixed boxes: HUD column, status below it, Measure panel opposite; ' +
    'geometry is a pure function of frame size + corner + armed members — never of the text)');
}
if (typeof window !== 'undefined') window.setupCpeFilmBoxes = setupCpeFilmBoxes;
