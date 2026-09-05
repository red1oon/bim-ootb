// ══════════════════════════════════════════════════════════════════════════════════════════════
// §CLASH_FILM_P2 — the in-scene LABEL for a clash pair the camera is passing, in a baked film.
// Implementing bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §CLASH_FILM_P2 — Witness: W-CLASH-LABELS
//   (viewer/tests/witness_clash_film_labels.js, claims P1–P6 of §P2.5)
//
// THE USER'S THREE RULINGS (2026-09-05, verbatim in the spec) — settled, not re-litigated here:
//   1. "if it is close by where it is clear enough i would say within 4 meters, it will then hold its
//      shine thru and bear labels even though behind close doors/walls/obstruction. And it is only
//      selective well spaced out, not overlapping, can be up to any number thus."
//   2. "A single label similar to the HUD, with same half see thru panel just to bear both items:
//      above in red, below in the blue … Just its semantic name ie Sprinkler / Wall. They fly
//      together but its size remain constant to avoid overlaying pov."
//   3. "No slowing down" — nothing here touches the camera.
//
// ── SELECTION IS PROXIMITY, NOT RANKING (§P2.1) ─────────────────────────────────────────────────
// A pair is ELIGIBLE when its mesh-true `contact` (clash_narrow.js, three.js space) is within
// ENTER_M of the camera, and stays eligible until it is RELEASE_M away (hysteresis — a pair drifting
// on the boundary must not strobe). There is NO cap and NO facing test. OCCLUSION IS NEVER CONSULTED:
// no raycast, no visibility query, no frustum test decides eligibility — a pair behind a door or a
// wall is labelled and shines through (that is the ruling; a "fix" that hides it is a regression,
// and the witness's P2 asserts a synthetic pair behind an occluder IS labelled).
// What limits the count is SCREEN SPACE: the eligible set is walked nearest-first and a panel is
// placed only if its rectangle does not intersect one already placed this frame. A skipped pair keeps
// its marker and simply carries no panel this frame.
//
// ── THE LABEL IS 2D, COMPOSITED ONTO THE CAPTURE CANVAS (§P2.2) ─────────────────────────────────
// cinema_maxq.js's _captureFrame draws the WebGL canvas into a 2D context and composites the HUD on
// it; this panel rides that same pass (a DOM overlay is never captured; 3D text re-orients and
// z-fights). Constant screen size falls out for free — a 2D panel does not scale with distance.
// The panel is drawn BEFORE the corner HUD (day counter, path box, pie): those are fixed furniture,
// a wandering label must never paint over them.
//
// ── THE NAME IS EXTRACTED, NOT INVENTED (§P2.3) ─────────────────────────────────────────────────
// rates.js's `Ifc<Class>: { desc }` is the source. The trim rule is stated in semanticName() below;
// a class with no rates.js entry shows its raw ifc_class, verbatim. Never a guess.
//
// ── THE SEAM (§P2.6) ───────────────────────────────────────────────────────────────────────────
// The only contact with clash_film.js is its public API: pairs() to read, setFade(i, v) to hold a
// labelled pair solid (its §4b per-instance channel), stats() for reporting. The marker geometry and
// the pulse envelope are NOT reimplemented here.
// ══════════════════════════════════════════════════════════════════════════════════════════════
function setupClashLabels(A) {
  'use strict';
  {
    var THREE = window.THREE;
    if (!THREE) return;

    // ══ §P2.1 AMENDED 2026-09-05 (user, after watching the 20–25 s clip: pulses visible, nothing ever
    // came close enough to label — nearest 7.98 m): "10 meters or half of scene space". 4.0/4.6 → 10.0/10.6,
    // the same 0.6 m hysteresis gap scaled up, so labels appear in normal flythrough footage rather than only
    // on extreme close approaches. 10 m is the concrete number; no scene-relative formula was asked for.
    var ENTER_M = 10.0, RELEASE_M = 10.6;   // ruling 1 (amended) + §P2.1 hysteresis: enter at 10.0 m, release at 10.6 m
    var FADE_S = 0.5;                      // FILM seconds for a marker to go solid / back to the pulse (§4b: a fade, never a switch)
    // ══ §CLASH_LABEL_HUD_FAMILY (2026-09-05, user: the label styling "seems to be not nicely setup
    // to be consistent as the HUD color scheme") ═════════════════════════════════════════════════
    // The plate and the font FAMILY already matched cpe_day_counter.js; the TEXT did not. The day
    // counter reads white #fff at weight 700 (the reading) beside rgba(255,255,255,0.62) at 500 (the
    // context); the label put the marker's own saturated rgb(255,33,26) / rgb(41,112,255) at 600 on
    // the same plate — a neon insert sitting on the HUD rather than part of it. The colour IDENTITY
    // stays (red = A, blue = B: the user reads a name to its marker by it) — each row is the marker
    // colour mixed TINT toward white, which lifts its luminance next to the counter's white and takes
    // the saturation off, set at the counter's own 700. Both rows are the reading, so both are 700.
    function tint(r, g, b, k) { return 'rgb(' + Math.round(r + (255 - r) * k) + ',' + Math.round(g + (255 - g) * k) + ',' + Math.round(b + (255 - b) * k) + ')'; }
    var TINT = 0.45;
    var COL_A = tint(255, 33, 26, TINT), COL_B = tint(41, 112, 255, TINT);   // rgb(255,133,129) / rgb(137,176,255)
    var WEIGHT = 700;
    var PLATE = 'rgba(0,0,0,0.45)';        // the day counter's plate — one visual language across the HUD
    var FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
    // The leader was ONE near-white stroke, invisible against a lit wall or the sky (review of #1679).
    // A dark halo under the white core holds contrast on both — the same guarantee the plate gives
    // the text. The halo is the plate's black, a touch denser because a 1 px line has no area to spare.
    var LEADER = 'rgba(255,255,255,0.92)', LEADER_HALO = 'rgba(0,0,0,0.55)';

    var _pairsRef = null, _near = null, _fade = null, _names = null, _lastFilmS = null, _placed = [];
    var _measureCtx = null, _nameLogged = {};
    var _v = new THREE.Vector3(), _cam = new THREE.Vector3();
    var _stats = null;
    function freshStats() {
      return { frames: 0, framesWithEligible: 0, framesWithLabel: 0, maxEligible: 0, maxLabelled: 0,
        enters: 0, releases: 0, skippedOverlap: 0, nearestM: Infinity, labelFrames: 0 };
    }
    _stats = freshStats();

    A.clashLabels = A.clashLabels || {};

    // ── §P2.3 — the semantic name, EXTRACTED from rates.js. The trim rule, stated:
    //   1. drop any parenthetical             "Duct Fittings (elbows, tees)" → "Duct Fittings"
    //   2. drop every token containing a digit "RC Slab 250mm" → "RC Slab"  (a size/spec is not a name)
    //   3. drop a LEADING all-caps token of ≤3 letters (optionally "/"-joined: RC, LED, PVC/HDPE — a
    //      material/spec prefix), only when something remains after it  → "Slab"
    //   4. singularise the LAST token when it is a plain "-s" plural ("Fittings" → "Fitting"; "-ss" untouched)
    //   5. no rates.js entry, or nothing left → the raw ifc_class, verbatim. Never invented.
    function semanticName(ifcClass) {
      var R = window.RATES, e = (R && ifcClass) ? R[ifcClass] : null;
      var src = (e && e.desc) ? String(e.desc) : '';
      var s = src.replace(/\s*\([^)]*\)/g, ' ');
      var toks = s.split(/\s+/).filter(function (t) { return t && !/\d/.test(t); });
      if (toks.length > 1 && /^[A-Z]{2,3}(\/[A-Z]{2,4})?$/.test(toks[0])) toks.shift();
      if (toks.length) {
        var last = toks[toks.length - 1];
        if (/^[A-Z][a-z]+s$/.test(last) && !/ss$/.test(last)) toks[toks.length - 1] = last.slice(0, -1);
      }
      var out = toks.join(' ');
      return { name: out || (ifcClass || '?'), source: out ? 'rates.js' : (e ? 'rates.js(empty desc)→ifc_class' : 'ifc_class'), desc: src };
    }
    A.clashLabels.semanticName = semanticName;

    function nameFor(ifcClass) {
      var r = semanticName(ifcClass);
      if (!_nameLogged[ifcClass]) {
        _nameLogged[ifcClass] = 1;
        console.log('§CLASH_LABEL_NAME ' + ifcClass + ' → "' + r.name + '" source=' + r.source + (r.desc ? ' desc="' + r.desc + '"' : ''));
      }
      return r.name;
    }

    // Sized off frame HEIGHT, exactly as the day counter is, so the label stays in proportion to the
    // HUD at every export size. Nothing here depends on the pair's distance — that is §P2.5 P5.
    function metrics(h) {
      var fontPx = Math.max(12, Math.round(h * 0.022));
      var padY = Math.round(fontPx * 0.45), rowGap = Math.round(fontPx * 0.3);
      var bh = padY * 2 + fontPx * 2 + rowGap;
      return { fontPx: fontPx, padX: Math.round(fontPx * 0.7), padY: padY, rowGap: rowGap, bh: bh,
        off: Math.round(h * 0.035), margin: Math.round(h * 0.028),
        line: Math.max(1, Math.round(h * 0.0015)), halo: Math.max(1, Math.round(h * 0.0015)), dot: Math.max(2, Math.round(h * 0.004)),
        radius: Math.round(bh * 0.22) };   // the day counter's own corner rule (boxH × 0.22), not a separate one
    }
    function font(px) { return WEIGHT + ' ' + px + 'px ' + FONT; }
    function measure(text, px) {
      if (!_measureCtx) { var c = document.createElement('canvas'); c.width = c.height = 8; _measureCtx = c.getContext('2d'); }
      _measureCtx.font = font(px);
      return _measureCtx.measureText(text).width;
    }
    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
    function overlaps(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }

    A.clashLabels.reset = function () {
      if (_fade && A.clashFilm && A.clashFilm.setFade) for (var i = 0; i < _fade.length; i++) if (_fade[i]) A.clashFilm.setFade(i, 0);
      _pairsRef = null; _near = null; _fade = null; _names = null; _lastFilmS = null; _placed = [];
      _stats = freshStats();
    };

    // ── UPDATE: once per frame, BEFORE clashFilm.update (so the fade it writes lands in this frame's
    // marker colours). Pure in (camera pose, film seconds, w, h) plus the hysteresis state.
    // Returns the frame record cinema_maxq hands to _captureFrame; `placed` is what gets drawn.
    A.clashLabels.update = function (camera, filmSeconds, w, h, frameIdx) {
      var pairs = (A.clashFilm && A.clashFilm.pairs) ? A.clashFilm.pairs() : null;
      _placed = [];
      var rec = { placed: _placed, eligible: 0, labelled: 0, skippedOverlap: 0, entered: [], released: [], nearestM: Infinity };
      if (!pairs || !pairs.length || !camera || !(w > 0) || !(h > 0)) return rec;
      if (_pairsRef !== pairs || !_near || _near.length !== pairs.length) {
        _pairsRef = pairs; _near = new Uint8Array(pairs.length); _fade = new Float32Array(pairs.length); _lastFilmS = null; _names = null;
      }
      if (!_names) _names = pairs.map(function (p) { return { a: nameFor(p.classA), b: nameFor(p.classB) }; });
      var fs = filmSeconds || 0;
      var dt = (_lastFilmS == null) ? FADE_S : Math.max(0, fs - _lastFilmS);
      _lastFilmS = fs;
      camera.updateMatrixWorld(true);
      _cam.setFromMatrixPosition(camera.matrixWorld);
      var M = metrics(h);

      // 1. proximity + hysteresis — no other predicate. Distance is to the mesh-true contact point.
      var elig = [], i, d, c;
      for (i = 0; i < pairs.length; i++) {
        c = pairs[i].contact; if (!c) continue;
        d = Math.sqrt((c.x - _cam.x) * (c.x - _cam.x) + (c.y - _cam.y) * (c.y - _cam.y) + (c.z - _cam.z) * (c.z - _cam.z));
        if (d < rec.nearestM) rec.nearestM = d;
        if (!_near[i] && d <= ENTER_M) { _near[i] = 1; rec.entered.push(pairs[i].pairId + '@' + d.toFixed(2) + ' ' + _names[i].a + '/' + _names[i].b); }
        else if (_near[i] && d >= RELEASE_M) { _near[i] = 0; rec.released.push(pairs[i].pairId + '@' + d.toFixed(2)); }
        if (_near[i]) elig.push({ i: i, d: d });
      }
      elig.sort(function (a, b) { return a.d - b.d; });
      rec.eligible = elig.length;

      // 2. screen space, nearest first, no overlap. Projection only — never a visibility test.
      for (var k = 0; k < elig.length; k++) {
        var e = elig[k], p = pairs[e.i]; c = p.contact;
        _v.set(c.x, c.y, c.z).applyMatrix4(camera.matrixWorldInverse);
        var behind = _v.z > 0;                       // view space looks down -z
        _v.set(c.x, c.y, c.z).project(camera);
        var nx = _v.x, ny = _v.y;
        if (behind) {
          // project() flips a point behind the camera; mirror it back and push it to the frame edge
          // on the side it is on, so the panel clamps to that edge. §P2.4: no leader for these.
          nx = -nx; ny = -ny;
          var mag = Math.max(Math.abs(nx), Math.abs(ny));
          if (mag > 1e-6) { nx /= mag; ny /= mag; } else { nx = 0; ny = 1; }
        }
        var sx = (nx + 1) / 2 * w, sy = (1 - ny) / 2 * h;
        var nm = _names[e.i];
        var bw = M.padX * 2 + Math.ceil(Math.max(measure(nm.a, M.fontPx), measure(nm.b, M.fontPx)));
        var bh = M.bh;
        var x = sx + M.off, y = sy - M.off - bh;     // up-right of the anchor …
        if (x + bw > w - M.margin) x = sx - M.off - bw;   // … or up-left when the right side would leave the frame
        if (y < M.margin) y = sy + M.off;                 // … and below it when the top would
        x = Math.round(clamp(x, M.margin, w - M.margin - bw)); y = Math.round(clamp(y, M.margin, h - M.margin - bh));   // integer px: crisp text
        var rect = { x: x, y: y, w: bw, h: bh };
        var hit = false;
        for (var q = 0; q < _placed.length; q++) if (overlaps(_placed[q], rect)) { hit = true; break; }
        if (hit) { rec.skippedOverlap++; continue; }
        _placed.push({ i: e.i, pairId: p.pairId, x: x, y: y, w: bw, h: bh, sx: sx, sy: sy, behind: behind,
          d: e.d, nameA: nm.a, nameB: nm.b, alpha: 0 });
      }
      rec.labelled = _placed.length;

      // 3. the fade seam (§P2.1, §4b): labelled → 1 (solid, pulse off), everything else → 0, by a ramp
      // in FILM seconds. Written through clash_film.js's own channel — nothing about the marker is
      // touched here.
      var isPlaced = new Uint8Array(pairs.length);
      for (q = 0; q < _placed.length; q++) isPlaced[_placed[q].i] = 1;
      var canFade = !!(A.clashFilm && A.clashFilm.setFade);
      for (i = 0; i < pairs.length; i++) {
        var tgt = isPlaced[i] ? 1 : 0, f = _fade[i];
        if (f === tgt) continue;
        f += (tgt > f ? 1 : -1) * (dt / FADE_S);
        if ((tgt > _fade[i] && f > tgt) || (tgt < _fade[i] && f < tgt)) f = tgt;
        _fade[i] = clamp(f, 0, 1);
        if (canFade) A.clashFilm.setFade(i, _fade[i]);
      }
      for (q = 0; q < _placed.length; q++) _placed[q].alpha = _fade[_placed[q].i];

      // bookkeeping + the §-log: one line per CHANGE of the labelled set, never per frame.
      _stats.frames++;
      if (elig.length) _stats.framesWithEligible++;
      if (_placed.length) { _stats.framesWithLabel++; _stats.labelFrames += _placed.length; }
      if (elig.length > _stats.maxEligible) _stats.maxEligible = elig.length;
      if (_placed.length > _stats.maxLabelled) _stats.maxLabelled = _placed.length;
      _stats.enters += rec.entered.length; _stats.releases += rec.released.length; _stats.skippedOverlap += rec.skippedOverlap;
      if (rec.nearestM < _stats.nearestM) _stats.nearestM = rec.nearestM;
      // … plus every 10th frame while a panel is up, WITH its rectangle — so a probe can go to that
      // frame of the exported film and find the plate in the bytes (the end of the chain).
      var fi = (frameIdx != null ? frameIdx : _stats.frames - 1);
      if (rec.entered.length || rec.released.length || (_placed.length && fi % 10 === 0)) {
        var panels = _placed.map(function (q) { return q.i + '@' + q.x + ',' + q.y + ',' + q.w + 'x' + q.h + (q.behind ? 'B' : '') + ':' + q.alpha.toFixed(2); });
        console.log('§CLASH_LABELS frame=' + fi +
          ' eligible=' + rec.eligible + ' labelled=' + rec.labelled + ' skippedOverlap=' + rec.skippedOverlap +
          (rec.entered.length ? ' enter=[' + rec.entered.join(',') + ']' : '') +
          (rec.released.length ? ' release=[' + rec.released.join(',') + ']' : '') +
          ' nearest=' + (isFinite(rec.nearestM) ? rec.nearestM.toFixed(2) + 'm' : '-') +
          (panels.length ? ' panels=[' + panels.join(' ') + ']' : ''));
      }
      return rec;
    };

    // ── DRAW: the 2D pass (§P2.2/§P2.4). `placed` is this frame's record from update(); the caller
    // hands it back so a stale frame's panels can never be drawn on a frame they were not placed for.
    A.clashLabelsCompositeOntoCanvas = function (ctx, w, h, placed) {
      if (!ctx || !placed || !placed.length) return 0;
      var M = metrics(h), n = 0;
      ctx.save();
      for (var k = 0; k < placed.length; k++) {
        var q = placed[k];
        if (!(q.alpha > 0)) continue;
        ctx.globalAlpha = Math.min(1, q.alpha);
        if (!q.behind) {
          // leader: from the panel's nearest edge point to the projected contact, plus a dot on it
          var ax = clamp(q.sx, q.x, q.x + q.w), ay = clamp(q.sy, q.y, q.y + q.h);
          // §CLASH_LABEL_HUD_FAMILY: halo first, core on top — line and dot alike.
          ctx.lineCap = 'round';
          ctx.strokeStyle = LEADER_HALO; ctx.lineWidth = M.line + 2 * M.halo;
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(q.sx, q.sy); ctx.stroke();
          ctx.strokeStyle = LEADER; ctx.lineWidth = M.line;
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(q.sx, q.sy); ctx.stroke();
          ctx.fillStyle = LEADER_HALO;
          ctx.beginPath(); ctx.arc(q.sx, q.sy, M.dot + M.halo, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = LEADER;
          ctx.beginPath(); ctx.arc(q.sx, q.sy, M.dot, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = PLATE;
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(q.x, q.y, q.w, q.h, M.radius); ctx.fill(); }
        else ctx.fillRect(q.x, q.y, q.w, q.h);
        ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.font = font(M.fontPx);
        ctx.fillStyle = COL_A; ctx.fillText(q.nameA, q.x + M.padX, q.y + M.padY + M.fontPx / 2);
        ctx.fillStyle = COL_B; ctx.fillText(q.nameB, q.x + M.padX, q.y + M.padY + M.fontPx + M.rowGap + M.fontPx / 2);
        n++;
      }
      ctx.restore();
      return n;
    };

    A.clashLabels.placed = function () { return _placed.slice(); };
    A.clashLabels.stats = function () {
      var s = {}; for (var k in _stats) s[k] = _stats[k];
      s.enterM = ENTER_M; s.releaseM = RELEASE_M; s.fadeS = FADE_S; s.pairs = _pairsRef ? _pairsRef.length : 0;
      return s;
    };
    A.clashLabels.fadeOf = function (i) { return _fade && i >= 0 && i < _fade.length ? _fade[i] : null; };

    // ── SUMMARY: one line after the loop. VACUOUS when no pair ever came within ENTER_M — a film
    // whose camera never passed a clash proves nothing about the label, and must say so.
    A.clashLabels.summary = function (framesDone) {
      var s = _stats;
      if (!s.frames) { console.log('§CLASH_LABELS_SUMMARY INCONCLUSIVE — update() never ran'); return s; }
      if (!s.framesWithEligible) {
        console.log('§CLASH_LABELS_SUMMARY VACUOUS frames=' + s.frames + ' eligibleFrames=0 nearest=' +
          (isFinite(s.nearestM) ? s.nearestM.toFixed(2) + 'm' : '-') + ' — no pair came within ' + ENTER_M + ' m of the camera; nothing was labelled and nothing is proven');
        return s;
      }
      console.log('§CLASH_LABELS_SUMMARY frames=' + s.frames + (framesDone != null ? '/' + framesDone : '') +
        ' eligibleFrames=' + s.framesWithEligible + ' labelFrames=' + s.framesWithLabel +
        ' maxEligible=' + s.maxEligible + ' maxLabelled=' + s.maxLabelled + ' enters=' + s.enters +
        ' releases=' + s.releases + ' skippedOverlap=' + s.skippedOverlap + ' panelsDrawn=' + s.labelFrames +
        ' nearest=' + s.nearestM.toFixed(2) + 'm enter=' + ENTER_M + 'm release=' + RELEASE_M + 'm');
      return s;
    };

    A.clashLabels.style = function () { return { colA: COL_A, colB: COL_B, tint: TINT, weight: WEIGHT, plate: PLATE, leader: LEADER, leaderHalo: LEADER_HALO }; };
    console.log('§CLASH_LABELS_INIT wired enter=' + ENTER_M + 'm release=' + RELEASE_M + 'm fade=' + FADE_S + 's' +
      ' text=A:' + COL_A + '/B:' + COL_B + ' (marker colours tinted ' + TINT + ' toward white) weight=' + WEIGHT +
      ' plate=' + PLATE + ' leader=' + LEADER + '+halo ' + LEADER_HALO + ' (no allocation until update)');
  }
}
