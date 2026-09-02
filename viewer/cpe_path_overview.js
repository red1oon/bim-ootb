/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// cpe_path_overview.js — §CPE_PATH_OVERVIEW (prompts/CINEMA_PATH_EDITOR.md).
// User, 2026-08-30: "a perspective overview thumbnail with the cam path/facing similar to the alt-c
// setting process. So that during baking and also playback the user can glance at the overview box
// and knows where the path/cam/face is doing" … "The smaller box is a 3D at an angle to maximise
// perspective, is static and only showing that same yellow path and that cam head move."
//
// THE WHOLE FRAME IS ALREADY POV. Nothing on screen says where in the building that POV is, so a
// viewer scrubbing the finished mp4 can see WHAT is being looked at and never WHERE from. This box
// answers only that. It is not a scrubbing control — the movie player is the scrubber; this is the
// readout the scrubber lacks.
//
// THE TRAP THIS FILE EXISTS TO AVOID is the same one cpe_day_counter.js's header names:
// cinema_maxq.js's _captureFrame grabs the RENDERER CANVAS only, so a DOM box would look perfect
// while editing and be absent from every exported byte. Drawn onto the 2D context instead, through
// the SAME routine for preview and export, so the two can never disagree.
//
// WHY VECTORS AND NOT A SECOND SCENE RENDER: a second render from an overview camera pays the
// per-object cost (culling, draw calls, state) of the whole building, and that cost barely shrinks
// with the thumbnail's pixel count — on Terminal that is 48,428 elements re-submitted per frame.
// The path polyline and the envelope box are a few dozen points. They are projected through a
// FIXED 3/4 view here and stroked as lines, which is what "static, at an angle" already means.
//
// NOTHING HERE IS DERIVED. The path is `plan.waypoints`, exactly as effects.js emitted it
// (`{x,y,z}` world points, effects.js:8524). The camera head reads the REAL pose the frame was
// rendered with — never a re-derivation from the path parameter — which is the discipline
// §CPE_POV_MARKER already set for itself (cinema_path_editor.js:3789: "read off the REAL mesh's
// transform, never a re-derivation"). A marker that re-derives its own pose can disagree with the
// shot it is labelling, which is worse than no marker.
function setupCpePathOverview(A) {
  // The editor's own two colours, reused rather than re-picked, so the box reads as the same
  // object the user already arranged in Alt+C:
  //   path  — cinema_path_editor.js:250's yellow-on-dark tube colour (0xffd54f)
  //   head  — cinema_path_editor.js:60's CONE_DEFAULT_COLOR (0xff1744)
  var PATH_COLOR = '#ffd54f';
  var HEAD_COLOR = '#ff1744';
  var POS = { tr: 1, tl: 1, br: 1, bl: 1 };

  // ── The fixed eye. USER RULING 2026-08-30: "a top-down building view path/cam is good
  // perspective." That supersedes the 28° three-quarter angle this shipped with — the look is the
  // user's call, and a near-plan view is the one people already read building paths in.
  // 62° rather than a true 90° plan: straight down would collapse every storey of a multi-level
  // path onto one another, so a route that climbs would be indistinguishable from one that does
  // not. 62° keeps the plan reading dominant while a vertical run still separates on screen.
  // The azimuth stays off-axis so a rectangular building never projects to a degenerate line.
  var AZ = 38 * Math.PI / 180, EL = 62 * Math.PI / 180;
  var FOCAL = 2.2;          // mild perspective — convergence visible, no wide-angle distortion
  var EYE_DIST_MULT = 2.6;  // multiples of the content radius; far enough that FOCAL reads as 3/4

  function _sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
  function _dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function _cross(a, b) {
    return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
  }
  function _norm(v) {
    var l = Math.sqrt(_dot(v, v)) || 1;
    return { x: v.x / l, y: v.y / l, z: v.z / l };
  }

  // ── Build the static projection ONCE per bake. "Static" is the user's own word for this box and
  // it is also what makes it cheap: the eye, the path and the envelope never move, so they are
  // projected and fitted here and only the camera head is projected per frame.
  //
  // Returns null when there is no path to draw — the honest answer for a bake with no plan, and the
  // caller then draws nothing rather than an empty box implying an empty building.
  // §CPE_PATH_OVERVIEW_FIT (2026-08-30, found by rendering real HHS_Office frames, not by reading):
  // at t=0.02 the head was ABSENT from the box. The fit was built from the waypoints alone, but
  // Beat 1 of poseAt (effects.js:7672) is a dive-IN from `camPos0`, far outside the settled path —
  // so the head projected outside the panel and was clipped away for the whole opening. A marker
  // that disappears exactly when the film starts is worse than no marker. `camSamples` (the caller
  // samples poseAt across the film) is folded into the same fit, so the head is in-frame at every t.
  A.pathOverviewPrepare = function(plan, bbox, camSamples) {
    if (!plan || !plan.waypoints || plan.waypoints.length < 2) return null;
    var wp = plan.waypoints, i;

    // Content bounds = the path, plus the building envelope when one was handed in. The envelope is
    // what makes the box legible as a BUILDING rather than a floating squiggle.
    var lo = { x: Infinity, y: Infinity, z: Infinity }, hi = { x: -Infinity, y: -Infinity, z: -Infinity };
    function _grow(p) {
      if (p.x < lo.x) lo.x = p.x; if (p.x > hi.x) hi.x = p.x;
      if (p.y < lo.y) lo.y = p.y; if (p.y > hi.y) hi.y = p.y;
      if (p.z < lo.z) lo.z = p.z; if (p.z > hi.z) hi.z = p.z;
    }
    for (i = 0; i < wp.length; i++) _grow(wp[i]);
    // §CPE_PATH_OVERVIEW_FRAME — USER RULING 2026-08-30: "ignore the initial fly in, and the fly
    // out where path is not in user's crafting space. Start from first stick to last stick, nothing
    // needed beyond." The sticks ARE plan.waypoints, so the frame is exactly their bounds and
    // nothing else. This retires two failed attempts, kept only as a warning: folding poseAt's raw
    // trajectory in collapsed the path to a squiggle (the dive-in starts far outside), and a
    // percentile clip of it was a guess at where the crafted span began. The plan already says.
    // `camSamples` is accepted and deliberately IGNORED for framing — the head is clamped instead,
    // so the fly-in/fly-out tail parks at the edge and needs no space of its own.
    // §CPE_PATH_OVERVIEW_NO_ENVELOPE (2026-08-30): a building wireframe was drawn here from a
    // whole-scene Box3 traverse. Removed. On HHS_Office that traverse picks up ground/sky/DLOD
    // placeholder geometry far outside the building, so the "envelope" was neither the building nor
    // trustworthy — and being vastly larger than the path, it dominated the fit and shrank the path
    // to a few pixels. It was also never asked for: the scope was "only showing that same yellow
    // path and that cam head move". Dropping it also drops a 48k-element traverse at bake start.
    if (!isFinite(lo.x)) return null;

    var ctr = { x: (lo.x + hi.x) / 2, y: (lo.y + hi.y) / 2, z: (lo.z + hi.z) / 2 };
    var rad = Math.max(1e-3, 0.5 * Math.sqrt(
      (hi.x - lo.x) * (hi.x - lo.x) + (hi.y - lo.y) * (hi.y - lo.y) + (hi.z - lo.z) * (hi.z - lo.z)));

    var dir = { x: Math.cos(EL) * Math.cos(AZ), y: Math.sin(EL), z: Math.cos(EL) * Math.sin(AZ) };
    var eye = { x: ctr.x + dir.x * rad * EYE_DIST_MULT,
                y: ctr.y + dir.y * rad * EYE_DIST_MULT,
                z: ctr.z + dir.z * rad * EYE_DIST_MULT };
    var fwd = _norm(_sub(ctr, eye));
    // Y is up in this scene (every camera pose in cinema_maxq/effects sets .y as height).
    var right = _norm(_cross(fwd, { x: 0, y: 1, z: 0 }));
    var up = _cross(right, fwd);

    var ov = { eye: eye, fwd: fwd, right: right, up: up, scale: 1, ox: 0, oy: 0, path: null };

    // Raw (unfitted) projection — exposed so a witness can assert the transform independently of
    // any canvas. Returns null BEHIND the eye rather than a mirrored ghost point.
    ov.raw = function(p) {
      var v = _sub(p, ov.eye);
      var z = _dot(v, ov.fwd);
      if (z <= 1e-4) return null;
      return { x: _dot(v, ov.right) / z * FOCAL, y: _dot(v, ov.up) / z * FOCAL };
    };

    // Fit everything that will ever be drawn STATICALLY into a unit box, so the camera head shares
    // one transform with the path it rides. Camera positions are path positions, so they cannot
    // fall outside this fit.
    var all = [], r;
    for (i = 0; i < wp.length; i++) { r = ov.raw(wp[i]); if (r) all.push(r); }
    if (all.length < 2) return null;
    var xlo = Infinity, xhi = -Infinity, ylo = Infinity, yhi = -Infinity;
    for (i = 0; i < all.length; i++) {
      if (all[i].x < xlo) xlo = all[i].x; if (all[i].x > xhi) xhi = all[i].x;
      if (all[i].y < ylo) ylo = all[i].y; if (all[i].y > yhi) yhi = all[i].y;
    }
    ov.fit = { xlo: xlo, xhi: xhi, ylo: ylo, yhi: yhi };
    ov.wpCount = wp.length;
    ov.waypoints = wp;
    return ov;
  };

  // ── Map a raw projected point into the drawing box. Split out from the draw so the witness can
  // assert placement arithmetic without a canvas, the same reason dayCounterAt is pure.
  A.pathOverviewToBox = function(ov, raw, bw, bh, pad) {
    if (!ov || !raw) return null;
    var f = ov.fit;
    var sw = (f.xhi - f.xlo) || 1e-6, sh = (f.yhi - f.ylo) || 1e-6;
    var s = Math.min((bw - pad * 2) / sw, (bh - pad * 2) / sh);
    var cx = pad + ((bw - pad * 2) - sw * s) / 2;
    var cy = pad + ((bh - pad * 2) - sh * s) / 2;
    // Screen Y grows downward; the projection's Y grows up.
    return { x: cx + (raw.x - f.xlo) * s, y: cy + (f.yhi - raw.y) * s };
  };

  // ── The ONLY place the box is ever drawn, so the live preview and the baked video cannot
  // disagree about how it looks — same contract as the day counter and the caption.
  // `pose` is the REAL camera pose the frame was rendered with: {pos:{x,y,z}, target:{x,y,z}}.
  // `stackY` is the offset down (for a top corner) or up (for a bottom corner) from the corner
  // margin, so the counter, the resource panel and this box form ONE column in ONE chosen corner —
  // §CPE_HUD_STACK. The caller owns the stacking order; this function owns only its own drawing.
  A.pathOverviewCompositeOntoCanvas = function(ctx, w, h, ov, pose, opacity, pos, stackY) {
    if (!ctx || !ov || !(opacity > 0)) return;
    var op = Math.min(1, opacity);

    // Sized off frame HEIGHT, exactly as the counter and caption are, so all three overlays stay in
    // proportion to one another at every export size.
    var bw = Math.round(h * 0.30), bh = Math.round(h * 0.20);
    var margin = Math.round(h * 0.028);
    var at = (pos && POS[pos]) ? pos : 'tr';
    var sy = stackY || 0;
    var x = (at === 'tl' || at === 'bl') ? margin : w - margin - bw;
    var y = (at === 'bl' || at === 'br') ? h - margin - bh - sy : margin + sy;
    var rad = Math.round(bh * 0.10);

    ctx.save();
    ctx.globalAlpha = op;

    // ── Frosted glass. Cheap HERE and only here: _captureFrame has already drawn the rendered frame
    // into this context, so the pixels behind the panel exist and can simply be blurred back over
    // themselves. The same look in-scene would need real transmission/refraction through the lit
    // pipeline, on every one of the still's 24 AO frames.
    var glass = false;
    try {
      if (typeof ctx.filter === 'string' && typeof document !== 'undefined' && document.createElement) {
        var tmp = document.createElement('canvas');
        tmp.width = bw; tmp.height = bh;
        tmp.getContext('2d').drawImage(ctx.canvas, x, y, bw, bh, 0, 0, bw, bh);
        ctx.save();
        _roundPath(ctx, x, y, bw, bh, rad);
        ctx.clip();
        ctx.filter = 'blur(9px)';
        // Overscan by the blur radius: a blur sampling past the edge of `tmp` would pull in
        // transparent pixels and ring the panel with a dark halo.
        ctx.drawImage(tmp, x - 9, y - 9, bw + 18, bh + 18);
        ctx.filter = 'none';
        ctx.restore();
        glass = true;
      }
    } catch (e) { glass = false; }   // never lose a frame to a filter quirk — fall back to the plate

    // Tint. The SAME 0.45 black the caption band and the day-counter plate use when there is no
    // blur under it; lighter over glass, because the blur is already carrying the separation.
    _roundPath(ctx, x, y, bw, bh, rad);
    ctx.fillStyle = glass ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.45)';
    ctx.fill();
    _roundPath(ctx, x, y, bw, bh, rad);
    ctx.strokeStyle = 'rgba(255,255,255,0.20)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.save();
    _roundPath(ctx, x, y, bw, bh, rad);
    ctx.clip();
    ctx.translate(x, y);
    var pad = Math.round(bh * 0.12);
    var i, p, q;

    // ── The path — the same yellow the user arranged in Alt+C, one unbroken line, no progress
    // split. The user's own scoping: "only showing that same yellow path and that cam head move."
    var lw = Math.max(1.5, bh * 0.012);
    ctx.lineJoin = ctx.lineCap = 'round';
    var pathInks = [['rgba(0,0,0,0.45)', lw + 2], [PATH_COLOR, lw]];
    for (var pi = 0; pi < pathInks.length; pi++) {
      ctx.strokeStyle = pathInks[pi][0];
      ctx.lineWidth = pathInks[pi][1];
      ctx.beginPath();
      var open = false;
      for (i = 0; i < ov.waypoints.length; i++) {
        p = A.pathOverviewToBox(ov, ov.raw(ov.waypoints[i]), bw, bh, pad);
        if (!p) { open = false; continue; }
        if (!open) { ctx.moveTo(p.x, p.y); open = true; } else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    // ── The camera head. Position and facing are read from the pose the frame was ACTUALLY
    // rendered with (§CPE_POV_MARKER's rule), so the head can never point somewhere the shot does
    // not. Drawn as a triangle whose apex is the look direction — the 2D reading of the editor's
    // red cone.
    if (pose && pose.pos) {
      var hp = A.pathOverviewToBox(ov, ov.raw(pose.pos), bw, bh, pad);
      if (hp) {
        // §CPE_PATH_OVERVIEW_FRAME — the camera legitimately sits outside the path's own bounds
        // during the dive-in. Pin it to the edge rather than let it be clipped away: an edge-pinned
        // head states "off-box, approaching", where a missing head states nothing at all.
        var m = Math.max(3, bh * 0.04);
        hp.x = Math.max(m, Math.min(bw - m, hp.x));
        hp.y = Math.max(m, Math.min(bh - m, hp.y));
        var ang = null;
        if (pose.target) {
          var tp = A.pathOverviewToBox(ov, ov.raw(pose.target), bw, bh, pad);
          if (tp) {   // target is NOT clamped — the direction to it is what the head reports
            var dx = tp.x - hp.x, dy = tp.y - hp.y;
            if (dx * dx + dy * dy > 1e-4) ang = Math.atan2(dy, dx);
          }
        }
        var hs = Math.max(6, bh * 0.075);   // §CPE_PATH_OVERVIEW_CONTRAST: was 0.055 and read as a speck
        ctx.save();
        ctx.translate(hp.x, hp.y);
        ctx.fillStyle = HEAD_COLOR;
        if (ang === null) {
          // Facing unknown (camera sitting on its own target): a dot states position and claims
          // nothing about direction, rather than pointing an arrow somewhere arbitrary.
          ctx.beginPath(); ctx.arc(0, 0, hs * 0.5, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1; ctx.stroke();
        } else {
          ctx.rotate(ang);
          ctx.beginPath();
          ctx.moveTo(hs, 0);
          ctx.lineTo(-hs * 0.62, hs * 0.62);
          ctx.lineTo(-hs * 0.62, -hs * 0.62);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.45)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    ctx.restore();
    ctx.restore();
  };

  function _roundPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
if (typeof window !== 'undefined') window.setupCpePathOverview = setupCpePathOverview;
