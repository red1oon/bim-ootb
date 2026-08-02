/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// cpe_day_counter.js — §CPE_DAY_COUNTER (prompts/CINEMA_PATH_EDITOR.md §CPE_DAY_COUNTER).
// User, 2026-08-02: "a Day # counter should be at a corner, to indicate progress" -> "Suggesting top
// right". A construction film with no clock gives the viewer no way to tell fast from slow; the
// buildup already knows exactly which day it is showing, it just never said so on screen.
//
// THE TRAP THIS FILE EXISTS TO AVOID (same one cpe_room_title.js's header names): cinema_maxq.js's
// _captureFrame grabs the RENDERER CANVAS only, so a DOM badge would look perfect while editing and
// be absent from every exported byte. The counter is composited onto the 2D context instead —
// the bake's captured frame, or a live overlay canvas over the WebGL canvas — through the SAME draw
// routine, so preview and export can never disagree.
//
// NOTHING HERE IS DERIVED. The day number is read from the cursor the buildup already set
// (cinema_maxq.js's `_bkMs = _workCursorAt(...)`) against the schedule's own project span. This file
// does not date anything, does not re-order anything, and must never become a second opinion about
// when an element was built — that is time_machine.js's job and it has one already.
function setupCpeDayCounter(A) {
  var MS_PER_DAY = 86400000;

  // ── The number, and ONLY the number. Pure, so the witness gates this arithmetic at exact
  // cursors instead of hoping a bake produces them. Returns null when there is no span to count
  // over, which is the honest answer for a film with no buildup — the caller then draws nothing
  // rather than a fabricated "Day 1".
  //
  // Day 1 is the project's first day, not day 0: a site calls its first day "day one", and an
  // off-by-one here is the kind of thing that gets noticed in a client screening. `floor + 1` is
  // therefore correct at cursor === projectStart (Day 1) and the final day is `totalDays`.
  A.dayCounterAt = function(cursorMs, projectStartMs, projectEndMs) {
    if (!(projectEndMs > projectStartMs)) return null;
    var totalDays = Math.max(1, Math.ceil((projectEndMs - projectStartMs) / MS_PER_DAY));
    var el = Math.max(0, cursorMs - projectStartMs);
    var day = Math.floor(el / MS_PER_DAY) + 1;
    if (day > totalDays) day = totalDays;   // the last frame lands exactly on projectEnd
    return { day: day, totalDays: totalDays };
  };

  // ── Shared draw routine — the ONLY place the counter is ever drawn, so the live preview and the
  // baked video cannot disagree about how it looks.
  //
  // §CPE_DAY_COUNTER_POS (user, 2026-08-02: "the movie maker panel puts the Day # counter top right
  // display option"). TOP RIGHT stays the DEFAULT — it is what the user asked for originally and what
  // already shipped, so an existing plan re-bakes identically. The corner is now a panel choice
  // because the counter and §CPE_ROOM_TITLE's caption are the only two overlays and a user framing a
  // particular building may want the clock out of a different corner.
  // ⚠ The two BOTTOM positions sit in the caption's lower-third band. That is the user's call to
  // make, not ours to forbid — but it is why top right remains the default rather than a mere
  // first-in-list accident.
  var POS = { tr: 1, tl: 1, br: 1, bl: 1 };
  A.dayCounterCompositeOntoCanvas = function(ctx, w, h, info, opacity, pos) {
    if (!ctx || !info || !(opacity > 0)) return;
    var op = Math.min(1, opacity);
    ctx.save();
    ctx.globalAlpha = op;

    // Sized off frame HEIGHT, exactly as the room title is, so the two overlays stay in proportion
    // to each other at every export size (the bake runs 1852x960; the editor preview is whatever
    // the window happens to be).
    var fontPx = Math.max(14, Math.round(h * 0.026));
    var subPx = Math.max(11, Math.round(fontPx * 0.62));
    var padX = Math.round(fontPx * 0.85);
    var padY = Math.round(fontPx * 0.55);
    var margin = Math.round(h * 0.028);

    var big = 'Day ' + info.day;
    var small = '/ ' + info.totalDays;

    var fBig = '700 ' + fontPx + 'px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
    var fSmall = '500 ' + subPx + 'px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
    ctx.font = fBig;
    var wBig = ctx.measureText(big).width;
    ctx.font = fSmall;
    var wSmall = ctx.measureText(small).width;
    var gap = Math.round(fontPx * 0.35);

    var boxW = padX * 2 + wBig + gap + wSmall;
    var boxH = padY * 2 + fontPx;
    var at = (pos && POS[pos]) ? pos : 'tr';
    var x = (at === 'tl' || at === 'bl') ? margin : w - margin - boxW;
    var y = (at === 'bl' || at === 'br') ? h - margin - boxH : margin;

    // Plate. Same 0.45 black the caption band uses — one visual language across both overlays.
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, boxW, boxH, Math.round(boxH * 0.22)); ctx.fill(); }
    else ctx.fillRect(x, y, boxW, boxH);

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    var cy = y + boxH / 2;
    ctx.fillStyle = '#fff';
    ctx.font = fBig;
    ctx.fillText(big, x + padX, cy);
    // The total is deliberately dimmer: the day is the reading, the span is the context.
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.font = fSmall;
    ctx.fillText(small, x + padX + wBig + gap, cy);

    ctx.restore();
  };

  // ── Live editor preview overlay — its own canvas, drawn through the same routine above. Kept
  // separate from cpe_room_title.js's overlay on purpose: either feature can be on without the
  // other, and sharing one canvas would make each responsible for clearing the other's pixels.
  var _liveCanvas = null, _liveState = null, _livePos = 'tr';

  function _ensureLiveCanvas() {
    if (_liveCanvas && _liveCanvas.isConnected) return _liveCanvas;
    if (!A.renderer || !A.renderer.domElement) return null;
    var c = document.createElement('canvas');
    c.id = 'cpe-day-counter-overlay';
    c.style.cssText = 'position:fixed;pointer-events:none;z-index:50;';
    document.body.appendChild(c);
    _liveCanvas = c;
    return c;
  }

  // Called once when a preview rehearsal starts, with the same buildup state the bake would use.
  A.dayCounterLiveStart = function(bkState, pos) {
    _liveState = (bkState && bkState.projectEnd > bkState.projectStart) ? bkState : null;
    _livePos = (pos && POS[pos]) ? pos : 'tr';
    console.log('§CPE_DAY_COUNTER live ' + (_liveState ? 'armed pos=' + _livePos + ' spanDays=' +
      Math.ceil((_liveState.projectEnd - _liveState.projectStart) / MS_PER_DAY) : 'off (no buildup span)'));
  };

  // Called every preview frame with the cursor the buildup is actually showing — NOT with a time,
  // so the badge cannot drift from the model the way a separately-interpolated clock would.
  A.dayCounterLiveTick = function(cursorMs) {
    var c = _ensureLiveCanvas();
    if (!c) return;
    var src = A.renderer.domElement, r = src.getBoundingClientRect();
    c.style.left = r.left + 'px'; c.style.top = r.top + 'px';
    if (c.width !== r.width) c.width = r.width;
    if (c.height !== r.height) c.height = r.height;
    c.style.width = r.width + 'px'; c.style.height = r.height + 'px';
    var ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    if (!_liveState) return;
    var info = A.dayCounterAt(cursorMs, _liveState.projectStart, _liveState.projectEnd);
    if (info) A.dayCounterCompositeOntoCanvas(ctx, c.width, c.height, info, 1, _livePos);
  };

  A.dayCounterLiveStop = function() {
    if (!_liveCanvas) return;
    var ctx = _liveCanvas.getContext('2d');
    ctx.clearRect(0, 0, _liveCanvas.width, _liveCanvas.height);
  };
}
