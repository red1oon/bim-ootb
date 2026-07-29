/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// cpe_room_title.js — §CPE_ROOM_TITLE (prompts/RESUME_CPE_ROOM_TITLE.md): a room-name title card
// that appears as the Film-Maker's camera enters each room, behind a checkbox, OFF by default.
// Naming is NOT reinvented here — every title runs through A.friendlyName, the same verb the Find
// panel and §HOVER_NAME use (HOVER_NAME.md's own coverage sweep is what proved that pipeline).
// The one real problem this file solves: cinema_maxq.js's _captureFrame grabs the renderer CANVAS
// only, so an HTML caption would be invisible in the exported video (HOVER_NAME.md's DOM label
// trick does NOT transfer here). Titles are composited onto a 2D context directly — either the
// bake's captured frame, or a live overlay canvas positioned over the WebGL canvas for editing —
// through the SAME draw routine, so the preview can never look different from what actually bakes.
function setupCpeRoomTitle(A) {
  var SAMPLE_DT = 0.15;   // seconds between coarse room-at-time samples when building the timeline
  var MIN_DWELL = 1.4;    // seconds — a room shown for less than this is suppressed (rate limit):
                          // a walk crossing six small rooms in four seconds must not strobe six titles
  var FADE = 0.4;         // seconds — fade in/out

  // Point-in-room via the shared room graph (A.getRoomGraph — the ONE cache per building every
  // other room consumer already shares, FLY_TOUR_CORRIDOR_GRAPH.md §S2). Only 'room'-kind nodes
  // carry a rect footprint (real IfcSpace + synthesized corridors both do; stair/circulation
  // waypoint nodes are points, not polygons, and simply produce no title — same scope CINEMA_DIVE's
  // own room search already accepts). z-closest match disambiguates stacked floors whose plan
  // rects overlap.
  function _roomAtIfcPoint(ix, iy, iz) {
    var g = (typeof A.getRoomGraph === 'function') ? A.getRoomGraph() : null;
    if (!g || !g.nodesByGuid) return null;
    var best = null, bestDz = Infinity;
    for (var k in g.nodesByGuid) {
      var n = g.nodesByGuid[k];
      if (!n || n.kind !== 'room' || !n.rects || !n.rects.length) continue;
      for (var i = 0; i < n.rects.length; i++) {
        var r = n.rects[i];
        if (ix < r.x0 || ix > r.x1 || iy < r.y0 || iy > r.y1) continue;
        var dz = Math.abs((n.cz || 0) - iz);
        if (dz < bestDz) { bestDz = dz; best = n; }
        break;
      }
    }
    return best;
  }

  // ⚠ HOVER_NAME.md §1 / this feature's own scope note: consume A.friendlyName, never a second
  // naming path. A room's stored name is already human-authored or compiler-synthesized-friendly
  // (e.g. "≈ Roof R1") — friendlyName is a no-op passthrough for those, but running every title
  // through it is what the witness asserts and what keeps this in lockstep with the Find panel if
  // friendlyName is ever improved.
  function _titleFor(n) {
    if (!n) return null;
    var name = (typeof A.friendlyName === 'function') ? A.friendlyName(n.name, null) : n.name;
    return { guid: n.guid, name: name };
  }

  // Coarse-samples the whole (or clipped) film ONCE, collapses into room-dwell segments, and drops
  // any segment shorter than MIN_DWELL. Cheap: a few hundred samples, each one THREE→IFC conversion
  // plus a linear scan of a few hundred room rects — §CPE_BUILDUP_FOLLOW_TM measured this class of
  // per-t lookup as trivial next to a bake's real cost (a full still-refine per frame).
  A.roomTitleBuildTimeline = function(plan, totalSec) {
    var t0 = performance.now();
    var samples = [];
    for (var t = 0; t <= totalSec + 1e-6; t += SAMPLE_DT) {
      var tn = totalSec > 0 ? Math.min(1, t / totalSec) : 0;
      var p = plan.poseAt(tn);
      var ifcP = A.three2ifc ? A.three2ifc(p.x, p.y, p.z) : null;
      var room = ifcP ? _roomAtIfcPoint(ifcP.ix, ifcP.iy, ifcP.iz) : null;
      samples.push({ t: t, guid: room ? room.guid : null, node: room });
    }
    var raw = [];
    samples.forEach(function(s) {
      var last = raw[raw.length - 1];
      if (last && last.guid === s.guid) { last.tEnd = s.t; }
      else raw.push({ guid: s.guid, node: s.node, tStart: s.t, tEnd: s.t });
    });
    var kept = [], suppressed = 0;
    raw.forEach(function(seg) {
      if (!seg.guid) return; // no room here — no title, never a fabricated one
      if ((seg.tEnd - seg.tStart) < MIN_DWELL) { suppressed++; return; }
      var title = _titleFor(seg.node);
      kept.push({ guid: seg.guid, name: title.name, tStart: seg.tStart, tEnd: seg.tEnd });
    });
    console.log('§CPE_ROOM_TITLE_TIMELINE segments=' + kept.length + ' suppressed=' + suppressed +
      ' totalSec=' + totalSec.toFixed(1) + ' ms=' + (performance.now() - t0).toFixed(1));
    return kept;
  };

  // Opacity/text for whichever segment is active (or fading) at absolute time t. Two segments can
  // both claim a moment during a crossfade — the higher-opacity one wins, so the reveal reads as
  // one continuous crossfade rather than a flicker between two half-visible captions.
  A.roomTitleOpacityAt = function(segs, t) {
    var best = null;
    (segs || []).forEach(function(s) {
      if (t < s.tStart - FADE || t > s.tEnd + FADE) return;
      var op = (t < s.tStart) ? (t - (s.tStart - FADE)) / FADE :
               (t > s.tEnd) ? 1 - (t - s.tEnd) / FADE : 1;
      if (!best || op > best.opacity) best = { name: s.name, guid: s.guid, opacity: op };
    });
    return best;
  };

  // Shared draw routine — the ONLY place title text is ever drawn, so the live preview and the
  // baked video can never disagree about how a title looks (same font, size, band, fade). A lower-
  // third caption band, documentary-style — screen POSITION is the one open detail RESUME_CPE_
  // ROOM_TITLE.md left for the user; this is the placeholder until told otherwise.
  A.roomTitleCompositeOntoCanvas = function(ctx, w, h, text, opacity) {
    if (!ctx || !text || !(opacity > 0)) return;
    ctx.save();
    var fontPx = Math.max(18, Math.round(h * 0.032));
    var bandH = fontPx * 2.2;
    var y = h - bandH * 1.4;
    ctx.globalAlpha = opacity;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, y, w, bandH);
    ctx.fillStyle = '#fff';
    ctx.font = '600 ' + fontPx + 'px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, y + bandH / 2);
    ctx.restore();
  };

  // ══ Live editor preview — an overlay canvas positioned exactly over the WebGL canvas, drawn
  // through the SAME roomTitleCompositeOntoCanvas the bake uses. Never a DOM label: the point is
  // WYSIWYG with what the export will actually produce, not just "something readable on screen"
  // (the exact trap this file's own header warns about).
  var _liveCanvas = null, _liveSegs = null;

  function _ensureLiveCanvas() {
    if (_liveCanvas && _liveCanvas.isConnected) return _liveCanvas;
    if (!A.renderer || !A.renderer.domElement) return null;
    var c = document.createElement('canvas');
    c.id = 'cpe-room-title-overlay';
    c.style.cssText = 'position:fixed;pointer-events:none;z-index:50;';
    document.body.appendChild(c);
    _liveCanvas = c;
    return c;
  }

  // Called once when a preview rehearsal starts (cinema_path_editor.js's _previewFly).
  A.roomTitleLiveStart = function(plan, totalSec) {
    _liveSegs = A.roomTitleBuildTimeline(plan, totalSec);
  };

  // Called every preview frame with the ABSOLUTE seconds along the (unclipped) film timeline.
  A.roomTitleLiveTick = function(tSec) {
    var c = _ensureLiveCanvas();
    if (!c) return;
    var src = A.renderer.domElement, r = src.getBoundingClientRect();
    c.style.left = r.left + 'px'; c.style.top = r.top + 'px';
    if (c.width !== r.width) c.width = r.width;
    if (c.height !== r.height) c.height = r.height;
    c.style.width = r.width + 'px'; c.style.height = r.height + 'px';
    var ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    var info = A.roomTitleOpacityAt(_liveSegs, tSec);
    if (info) A.roomTitleCompositeOntoCanvas(ctx, c.width, c.height, info.name, info.opacity);
  };

  A.roomTitleLiveStop = function() {
    if (!_liveCanvas) return;
    var ctx = _liveCanvas.getContext('2d');
    ctx.clearRect(0, 0, _liveCanvas.width, _liveCanvas.height);
  };
}
