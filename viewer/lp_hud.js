// cpe_load_path family — part `hud` (original cpe_load_path.js lines 3868–4681).
// Split mechanically from the single file (bim-compiler prompts/VIEWER_FILE_SPLIT_PLAN.md §5, 2026-10-06). The only edits:
// names shared across parts are reached through LP (the one shared object setupCpeLoadPath creates), and top-level
// `var` statements run as assignments in phase 2 (their names are hoisted to this part, as before). Load order and the
// two-phase setup live in cpe_load_path.js. Witness: viewer/tests/witness_cpe_load_path_surface.js (W-LP-SURFACE).
(typeof window !== 'undefined' ? window : globalThis).__cpeLoadPathParts = (typeof window !== 'undefined' ? window : globalThis).__cpeLoadPathParts || {};
(typeof window !== 'undefined' ? window : globalThis).__cpeLoadPathParts.hud = function __lpPart_hud(A, LP) {
  'use strict';
  var FREEZE_SCHED;   // hoisted here, as the single closure hoisted them
  // literal-valued constants, verbatim (evaluating a literal earlier changes nothing)
  // ══ §129.58 FREEZE HUD THEME (2026-09-20, red1: "streamline the Freeze info panel box to be
  // same theme (only reversed as it is on black) as the rest HUDs for consistency. The standard
  // HUD font title, body sizing is more professional.") ════════════════════════════════════════
  //
  // WHAT WAS INCONSISTENT, measured against the rest of the overlays at h=1080:
  //
  //   box                     family                          body px   title px   rowH
  //   resource panel rows     -apple-system,…,Roboto          22        25 (x1.15)  x1.55   <- the standard
  //   sun-compass readout     (k 0.020)                       22        —           —
  //   day counter             (k 0.026)                       28        —           —
  //   freeze info CARD        Segoe UI, system-ui             28        —          x1.55
  //   freeze info PANEL       Segoe UI, system-ui             16        21 (x1.35) x2.00   <- the outlier
  //
  // The panel's body was 16 px where every other overlay's is 22, its title ratio was 1.35 where
  // the standard is 1.15, its rows were 2.00x where the standard is 1.55x, and both freeze boxes
  // asked for a font family no other overlay uses. Nothing here is a new number: every value below
  // is read off `cpe_resource_panel.js`'s own list (`fs`, `fs * 1.15`, `round(fs * 1.55)`) and the
  // one §HUD_SCALE law in `cinema_maxq.js` (`window.__hudFontPx`).
  //
  // THE ONE DEVIATION, and red1 named it: the freeze runs on a BLACK backdrop
  // (`§LOADPATH_BACKDROP allElseAtBlack=51/51`), where the standard dark-glass plate
  // (`rgba(0,0,0,0.28)`) has no presence at all. So the freeze theme is the standard one REVERSED —
  // light plate, dark ink — which is what the info card already did alone with its opaque white
  // slab. The panel now shares that plate instead of carrying the dark one it could not be read
  // against, so the two boxes in the same frozen frame finally match each other.
  var FREEZE_F = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
  // Ink, mirrored from the SAME opacities `§HUD_LEGIBLE` already measured for white-on-dark-glass,
  // so the contrast ladder (title strongest, body next, zebra and divider as faint structure) is
  // the one the rest of the HUD already uses — only the polarity is flipped.
  var FREEZE_INK_TITLE = 'rgba(0,0,0,0.92)';
  var FREEZE_INK_BODY  = 'rgba(0,0,0,0.78)';
  var FREEZE_INK_ZEBRA = 'rgba(0,0,0,0.05)';
  var FREEZE_INK_RULE  = 'rgba(0,0,0,0.15)';
  // §61 (MEP_CLASH_REVEAL_MOVIE.md, red1: "the yellow HUD coloring is not helping optics … Replace
  // yellow with blue is better contrast") — the totals line was `rgba(255,215,0,0.95)` gold, the one
  // place in the freeze still breaking that ruling. #0277bd is the project blue #4fc3f7 taken to a
  // weight that clears contrast against a light plate rather than a dark one.
  var FREEZE_INK_TOTALS = '#0277bd';
  // §FREEZE_BANDS (2026-10-01, red1: "beef up the graphics of the load path black page info panels, with more striking color";
  // picked "colour header bands" — white body kept for legibility, a solid group-colour title band + left accent stripe).
  // One colour per GROUP (bim-compiler PERFORMANCE_AS_CLASH.md §13): Structure = the project blue (NOT amber — §61 ruled yellow
  // out of the freeze), Security = teal, Comfort = violet. Measured WCAG contrast: white title on band 6.67 / 5.08 / 5.70 (>= 4.5),
  // band against the black page 3.15 / 4.14 / 3.68 (>= 3 for marks). &lpbands=0 = the §129.58 look (control).
  var FREEZE_BAND = { structure: '#0B5CAD', security: '#0E7C70', comfort: '#7C3AED' };
  var _freezeBandWitnessed = {};
  // §FREEZE_ANIM (bim-compiler PERFORMANCE_AS_CLASH.md §19.4, red1 2026-10-01 "animated line by line reveal ... looks too static"): every freeze
  // panel line fades + slides in on ONE clock, the hold's elapsed seconds (_lp.holdElapsed). The SAME schedule feeds the draw and
  // A._freezeAnimKey (cinema_maxq.js §FRAME_REUSE key), so an animating frame is never reused and a settled one still is. &lpanim=0 = static.
  var FREEZE_FADE = 0.35;
  var _faWit = { first: null, settled: null, prevKey: null, nonMono: 0, lastVals: null };
  var MS_PER_DAY_CARD = 86400000;
  var CARD_FIXED_LINE = 'each layer rests on the one below it, as the 4D order built them';


  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // A.loadPathCompositeOntoCanvas(ctx, w, h, filmSec) — every captured frame, 2D pass.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // ══ §129.6 items 5/7 LABEL LADDER (2026-09-15) ══════════════════════════════════════════════════
  // Pure layout math — no THREE.js, no canvas — so it is directly node-dry-runnable against
  // synthetic screen positions. `hopScreens`: [{k, px, py}, ...] for VISIBLE hops ONLY (item 7b),
  // in GROUND-UP order (matching hopsUp's own convention). Returns one row per hop, reversed to
  // TOP-DOWN display order (item 5: "sorted by layer height" reads as the stack's own physical
  // order), evenly spaced by rowH = labelH + gap with gap >= one label height (spec's own floor).
  // §HUD FIX (2026-09-15, real HHS bake: the ladder column landed under the pie/resource panel,
  // overlaps=5) — `avoidRects` ([{x,y,w,h}, ...], typically A._hudLayoutRects from an EARLIER point
  // in the SAME frame) is now consulted: for each candidate side (preferred first, then the other),
  // find the largest CONTIGUOUS vertical band whose column x-range does not cross any avoid-rect
  // that also spans that x-range; use the first side whose free band is >= the ladder's own needed
  // height. If NEITHER side has room, drop the column below the lowest avoid-rect (spec's own
  // explicit fallback) — still on the preferred side's x. Returns `{rows, column}` — `column` is the
  // ACTUALLY chosen side, which the caller's own witness print must read (never the naive
  // preferRight guess, since avoidance can flip it).
  function _freeVerticalSpan(x0, x1, avoidRects, h) {
    var blockers = (avoidRects || [])
      .filter(function (r) { return !(r.x + r.w <= x0 || x1 <= r.x); })
      .map(function (r) { return { y0: r.y, y1: r.y + r.h }; })
      .sort(function (a, b) { return a.y0 - b.y0; });
    var spans = [], cursor = 0;
    blockers.forEach(function (b) {
      if (b.y0 > cursor) spans.push({ y0: cursor, y1: b.y0 });
      cursor = Math.max(cursor, b.y1);
    });
    if (cursor < h) spans.push({ y0: cursor, y1: h });
    var best = null;
    spans.forEach(function (s) { if (!best || (s.y1 - s.y0) > (best.y1 - best.y0)) best = s; });
    // §HUD FIX 2 (2026-09-16) edge case: when the blockers consume the WHOLE column (spans is
    // empty because every gap got closed), falling back to {0,h} claimed the FULLY-BLOCKED column
    // as maximally free — the opposite of the truth — which is exactly why AVOIDANCE 2's left
    // column (fully blocked, 0..h) was still picked over the spec's "drop below lowest rect"
    // fallback. {0,h} is only correct when there were no blockers in this column at all, which the
    // `if (cursor < h) spans.push(...)` line above already covers whenever real room exists. A
    // zero-size span here reads as "no room" to every caller (any neededH > 0 fails >= against it),
    // so the caller correctly moves to the next side / the below-lowest-rect fallback.
    // §129.7 item 2 (2026-09-16) NOTE: superseded as the ladder's OWN placement method — the ladder
    // no longer chooses a side or dodges a blocker (see `_ladderLayout` below) — kept as a tested,
    // still-exposed (`A._loadPathFreeVerticalSpan`) utility, not dead code removed on a guess.
    return best || { y0: h, y1: h };
  }
  // Cross-overlap: every row in `a` against every rect in `b` (a HUD registry, typically). Distinct
  // from `_rectsOverlapCount` (pairwise WITHIN one list) — this is "does THIS SET intersect THAT
  // SET", the exact shape §129.7 item 2's `hudClear` check needs.
  function _crossOverlapCount(a, b) {
    var n = 0;
    for (var i = 0; i < a.length; i++) for (var j = 0; j < b.length; j++) {
      var x = a[i], y = b[j];
      if (!(x.x + x.w <= y.x || y.x + y.w <= x.x || x.y + x.h <= y.y || y.y + y.h <= x.y)) n++;
    }
    return n;
  }
  // §129.7 item 2 (2026-09-16, user: "the labelling skew to the right and obscured a bit by the
  // HUD... rather have the labels fall in the screen centre") — SUPERSEDES the side-choosing/
  // relocating algorithm above entirely. The column is now ALWAYS centred on the frame's x-centre,
  // vertically centred in the FULL frame height — same vertical order (top-down by layer height)
  // and same gap rule (rowH = labelH + gap, gap >= labelH) as before. It does NOT dodge a registered
  // HUD rect: "the centre is normally free — if not, the witness says so" is the user's own ruling,
  // confirmed by the dry-run requirement that a blocked centre must FAIL, not relocate silently.
  // `preferRight` is kept as a parameter only for call-site/back-compat (ignored, no side to prefer
  // any more); `avoidRects`, when given, is used ONLY to compute `hudOverlaps`/`hudClear` for the
  // caller's own witness — never to move the column.
  function _ladderLayout(hopScreens, w, h, preferRight, labelW, labelH, avoidRects) {
    labelH = labelH || Math.max(14, Math.round(h * 0.022));
    labelW = labelW || Math.max(60, Math.round(w * 0.16));
    var gap = labelH, rowH = labelH + gap;
    var topDown = hopScreens.slice().reverse();
    var neededH = topDown.length > 0 ? topDown.length * rowH - gap : 0;
    var centreX = Math.round(w / 2 - labelW / 2);
    var startY = Math.max(0, (h - neededH) / 2);   // vertically centred in the FULL frame height
    var rows = topDown.map(function (hs, pos) {
      return { k: hs.k, px: hs.px, py: hs.py, x: centreX, y: startY + pos * rowH, w: labelW, h: labelH };
    });
    var hudOverlaps = _crossOverlapCount(rows, avoidRects || []);
    return { rows: rows, column: 'centre', hudOverlaps: hudOverlaps, hudClear: hudOverlaps === 0 };
  }
  // §129.8 item 4 (2026-09-16, SUPERSEDES the screen-centred column above for the TWO-STACK case —
  // "ladders beside their stacks... the side with more room, between the two stacks if both fit")
  // — revives `_freeVerticalSpan`'s own side-choosing math (kept, tested, exposed since §129.7 item
  // 2 superseded its ORIGINAL use, never dead code removed on a guess): tries the side with more
  // free vertical room next to `stackBoxPx` ([0, x0) or (x1, w]) against `avoidRects` (the HUD
  // registry — and, when both stacks are shown, the OTHER stack's own screen box, so the two
  // ladders cannot land on each other), places the column flush against that side, vertically
  // centred in the free span found.
  function _ladderLayoutBesideStack(hopScreens, stackBoxPx, w, h, labelW, labelH, avoidRects) {
    labelH = labelH || Math.max(14, Math.round(h * 0.022));
    labelW = labelW || Math.max(60, Math.round(w * 0.16));
    // ROUND 12 item 4 (2026-09-16, real HHS bake: `loadpath.label.near.*:0,…` — a column flush
    // against the frame's own left edge) — "keep a margin of one label height from every frame
    // edge": one `labelH` of clearance on every side (left/right/top/bottom), never just clamped to
    // 0/w/0/h.
    var margin = labelH;
    var gap = labelH, rowH = labelH + gap;
    // FIX (2026-09-18, red1: "the lines drawn are not proper Y accurate") — labels used to be ordered
    // by fixed hop-index (`.reverse()`, highest hop always drawn topmost), never by where each hop's
    // OWN anchor actually lands on screen. Under perspective, a taller/farther hop can project BELOW
    // a shorter/nearer one even though its hop-index is higher — the label order didn't move with it,
    // so its leader line had to cross whichever line WAS drawn to the correct screen-order slot. Real
    // fix: sort by the anchor's own projected screen-Y (top of screen first), so label order always
    // matches anchor order and leader lines never have to cross to reach their own row.
    var topDown = hopScreens.slice().sort(function (a, b) { return a.py - b.py; });
    var neededH = topDown.length > 0 ? topDown.length * rowH - gap : 0;
    var x0 = stackBoxPx ? stackBoxPx.x0 : w / 2, x1 = stackBoxPx ? stackBoxPx.x1 : w / 2;
    var leftSpan = _freeVerticalSpan(0, x0, avoidRects, h);
    var rightSpan = _freeVerticalSpan(x1, w, avoidRects, h);
    var leftRoom = Math.max(0, leftSpan.y1 - leftSpan.y0), rightRoom = Math.max(0, rightSpan.y1 - rightSpan.y0);
    var side = rightRoom >= leftRoom ? 'right' : 'left';
    var span = side === 'right' ? rightSpan : leftSpan;
    var colX = side === 'right'
      ? Math.min(w - labelW - margin, Math.round(x1))
      : Math.max(margin, Math.round(x0 - labelW));
    var spanY0 = Math.max(margin, span.y0), spanY1 = Math.min(h - margin, span.y1);
    var room = Math.max(0, spanY1 - spanY0);
    var startY = spanY0 + Math.max(0, (room - neededH) / 2);
    var rows = topDown.map(function (hs, pos) {
      return { k: hs.k, px: hs.px, py: hs.py, x: colX, y: startY + pos * rowH, w: labelW, h: labelH };
    });
    var hudOverlaps = _crossOverlapCount(rows, avoidRects || []);
    return { rows: rows, column: side, hudOverlaps: hudOverlaps, hudClear: hudOverlaps === 0 };
  }
  // Control window.__lpLabelsNaive=1 — v8 behaviour: one label AT each hop's own projected point,
  // no column, no gap floor — exactly what item 5 asks the ladder to replace.
  function _naiveLayout(hopScreens, labelW, labelH) {
    labelH = labelH || 14; labelW = labelW || 90;
    return hopScreens.map(function (hs) {
      return { k: hs.k, px: hs.px, py: hs.py, x: hs.px, y: hs.py - labelH / 2, w: labelW, h: labelH };
    });
  }
  function _rectsOverlapCount(rects) {
    var n = 0;
    for (var i = 0; i < rects.length; i++) for (var j = i + 1; j < rects.length; j++) {
      var a = rects[i], b = rects[j];
      if (!(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y)) n++;
    }
    return n;
  }
  function _minVerticalGap(rects) {
    var sorted = rects.slice().sort(function (a, b) { return a.y - b.y; }), m = Infinity;
    for (var i = 1; i < sorted.length; i++) { var g = sorted[i].y - (sorted[i - 1].y + sorted[i - 1].h); if (g < m) m = g; }
    return m === Infinity ? null : m;
  }
  function _allRectsInFrame(rects, w, h) {
    return rects.every(function (r) { return r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h; });
  }

  // §129.21 (2026-09-18, red1: "I think we do away with lines and all in a HUD... Just have a nice
  // HUD like the other overlays, as each stack item appears, it's corresponding info row does so
  // too in that same colour thus user correlates right away. A running total qty cost in bigger
  // font gives the wow") — REPLACES the ladder's leader-line-to-3D-anchor scheme (`_drawStackLadder`
  // below, kept defined but no longer called from the composite pass — see that call site's own
  // note) with a plain, fixed-position HUD list, one row per REVEALED hop, colour-swatched to match
  // that hop's own 3D shine-through colour (`h.hex`, `_hexForHop` — the SAME gradient the stack
  // itself already renders in, not a new scheme). Solves the ladder's own line-crossing bug outright
  // (§129.15) — there is no leader line to cross any more, no 3D anchor projection needed at all.
  // Alternating zebra-striped row backgrounds (red1: "for a more pro look"), a running total
  // (elements placed · cost, `A._loadPathFetchHopScheduleCost`'s own real per-hop `calcLabor` figure
  // — never invented) in a larger header font.
  // §129.23 (2026-09-18, red1: "the sequence should also match, ie from bottom up in the HUD... I
  // asked for running totals for days too, thus need not be at each line since cost is not at each
  // line") — rows now list hop1 (the foundation, "each layer rests on the one below it") at the
  // panel's OWN bottom edge, newer/higher hops appended ABOVE as they reveal — the panel grows
  // upward from a fixed bottom, mirroring how the building itself rises. `yBottom` (was `yTop`) is
  // that fixed anchor; the caller reserves it from each stack's FULL hop count (`_stackInfoPanelMaxH`
  // below) so the anchor never shifts as `revealed` grows mid-hold. Days total is a HEADER figure,
  // matching cost — and, same as cost, genuinely SUMMED (never invented): unique TASK ids among the
  // revealed hops only, each task's own real duration counted ONCE — several hops commonly share one
  // task (e.g. "Substructure" spanning many columns), so a naive per-hop sum would double-count real
  // calendar time that is not actually sequential.
  // §HUD_SCALE — takes the frame HEIGHT now, not the old `k` scale: the one sizing law is a
  // function of h, and this helper must reserve the height the panel will ACTUALLY draw at,
  // or the bottom anchor it feeds shifts under the panel mid-hold.
  function _stackInfoPanelMaxH(h, stack) {
    if (!stack || !stack.hopsUp) return 0;
    // §129.58 — the standard body (22 px at 1080, the same as a resource-panel row), title x1.15
    // and rows x1.55, all from the shared freeze theme. Was k=0.014444 (16 px), x1.35 and x2.00 —
    // the only overlay in the film using its own three numbers.
    // ⚠ `_stackInfoPanelMaxH` (the height RESERVER) and `_drawStackInfoPanel` (the drawer) both
    // carry this block and MUST stay identical, or the bottom anchor the reserver feeds shifts
    // under the panel mid-hold — see the reserver's own note above.
    var fontPx = _freezeBodyPx(h);
    var headerFontPx = Math.round(fontPx * 1.15);
    var rowH = Math.round(fontPx * 1.55);
    var headerH = Math.round(headerFontPx * 2.6);
    var pad = Math.round(fontPx * 0.6);
    return headerH + stack.hopsUp.length * rowH + pad;
  }
  // §129.28 (2026-09-18, red1: "the stack lines box to avoid the stack itself... move out of from
  // obscuring it") — screen-space bbox of the stack's own REVEALED (currently-solid/visible, per
  // `_solidSetFor` — never a re-derived "index < revealedHops" guess, which would silently invert
  // under `window.__lpTopDown`) hop clones. Same projection `_drawStackLadder` used before this
  // fixed-position panel replaced it (position-only, not full AABB corners — a cheap, already-
  // proven approximation for "roughly where the stack is on screen"). Used only to decide whether
  // the panel below needs to step aside.
  function _stackScreenBox(stack, w, h) {
    var bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
    var proj = new THREE.Vector3();
    var _solid = LP._solidSetFor(stack.hopsUp.length, stack.revealedHops || 0);
    (stack.hopsUp || []).forEach(function (h_, i) {
      if (!h_._cloneMesh || !_solid[i]) return;
      var b = new THREE.Box3().setFromObject(h_._cloneMesh);
      var box = { minX: b.min.x, maxX: b.max.x, minY: b.min.y, maxY: b.max.y, minZ: b.min.z, maxZ: b.max.z };
      var r = LP._projectAABBLive(box, A.camera);
      if (!r || !r.intersects) return;
      var wp = new THREE.Vector3(); h_._cloneMesh.getWorldPosition(wp);
      proj.copy(wp).project(A.camera);
      var pxn = Math.max(-1.5, Math.min(1.5, proj.x)), pyn = Math.max(-1.5, Math.min(1.5, proj.y));
      var px = (pxn * 0.5 + 0.5) * w, py = (1 - (pyn * 0.5 + 0.5)) * h;
      bx0 = Math.min(bx0, px); bx1 = Math.max(bx1, px); by0 = Math.min(by0, py); by1 = Math.max(by1, py);
    });
    return isFinite(bx0) ? { x0: bx0, x1: bx1, y0: by0, y1: by1 } : null;
  }
  function _freezeBodyPx(h) {   // the standard body: 22 px at 1080, same as a resource-panel row
    return (window.__hudFontPx ? window.__hudFontPx(h, 0.020, 9) : Math.max(9, Math.round(h * 0.020)));
  }
  // The reversed plate. `_freezePlate` is to the freeze what `A.cpePanelPlate` is to every other
  // overlay — one function, so the card and the panel cannot drift apart again.
  function _freezePlate(ctx, x, y, bw, bh, rad) {
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, bw, bh, rad); ctx.fill(); }
    else ctx.fillRect(x, y, bw, bh);
  }
  function _freezePlateDraw(ctx, x, y, bw, bh, rad) {
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    _freezePlate(ctx, x, y, bw, bh, rad);
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 1;
    _freezePlate(ctx, x, y, bw, bh, rad); ctx.stroke();
  }
  function _freezeBandsOn() { return !(typeof location !== 'undefined' && /[?&]lpbands=0/.test(location.search)); }
  function _lum(hex) { return [1, 3, 5].map(function (i) { var v = parseInt(hex.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
    .reduce(function (s, v, i) { return s + v * [0.2126, 0.7152, 0.0722][i]; }, 0); }
  function _contrast(a, b) { var x = _lum(a), y = _lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function _freezeBand(ctx, x, y, bw, bh, rad, bandH, group, fontPx, name) {
    var col = FREEZE_BAND[group]; if (!col) return;
    var stripe = Math.max(3, Math.round(fontPx * 0.22));
    ctx.save();
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, bw, bh, rad); ctx.clip(); }
    ctx.fillStyle = col; ctx.fillRect(x, y, bw, bandH); ctx.fillRect(x, y + bandH, stripe, bh - bandH);
    ctx.restore();
    if (!_freezeBandWitnessed[name]) { _freezeBandWitnessed[name] = true;
      var c1 = _contrast('#FFFFFF', col), c2 = _contrast(col, '#000000');
      console.log('§FREEZE_BAND panel=' + name + ' group=' + group + ' color=' + col + ' bandPx=' + bandH + ' stripePx=' + stripe +
        ' whiteOnBand=' + c1.toFixed(2) + ' bandVsBlack=' + c2.toFixed(2) + ' => ' + (c1 >= 4.5 && c2 >= 3 ? 'PASS' : 'FAIL') + ' (WCAG AA text 4.5, marks 3)'); }
  }
  function _freezeAnimOn() { return !(typeof location !== 'undefined' && /[?&]lpanim=0/.test(location.search)); }
  function _fa(t0) { var e = LP._lp && LP._lp.holdElapsed; if (e == null || !_freezeAnimOn()) return 1; return Math.max(0, Math.min(1, (e - t0) / FREEZE_FADE)); }
  function _rowAlpha(stack, ri) { return _fa(stack && stack._rowT && stack._rowT[ri] != null ? stack._rowT[ri] : 0); }

  function _drawStackInfoPanel(ctx, w, h, k, stack, stackName, yBottom, avoidRect) {
    if (!stack || !stack.hopsUp || !stack.hopsUp.length) return null;
    var revealed = Math.max(0, Math.min(stack.hopsUp.length, stack.revealedHops || 0));
    if (revealed <= 0) return null;
    // §129.58 — the standard body (22 px at 1080, the same as a resource-panel row), title x1.15
    // and rows x1.55, all from the shared freeze theme. Was k=0.014444 (16 px), x1.35 and x2.00 —
    // the only overlay in the film using its own three numbers.
    // ⚠ `_stackInfoPanelMaxH` (the height RESERVER) and `_drawStackInfoPanel` (the drawer) both
    // carry this block and MUST stay identical, or the bottom anchor the reserver feeds shifts
    // under the panel mid-hold — see the reserver's own note above.
    var fontPx = _freezeBodyPx(h);
    var headerFontPx = Math.round(fontPx * 1.15);
    var rowH = Math.round(fontPx * 1.55);
    var headerH = Math.round(headerFontPx * 2.6);
    var pad = Math.round(fontPx * 0.6);
    var swatch = Math.round(fontPx * 0.75);
    var divider = Math.max(1, Math.round(fontPx * 0.08));
    ctx.save();
    // §129.26 (2026-09-18, red1: "make the table professional looking with totals correct" / "need
    // not be at each line since cost is not at each line") — rows are back to plain class/storey/hop
    // (no per-row day tag either now, matching cost's own always-header-only convention); totals
    // (RM cost, days — both `calcLabor`'s own real per-element figures, §129.26 above) live ONLY in
    // the header, summed straight (no dedup — see that section's own reasoning for why cost/days are
    // now the SAME kind of additive per-element figure). A thin divider under the header and a
    // slightly bolder header weight are the "professional" cues — same dark-glass plate, no new look.
    ctx.font = '600 ' + fontPx + 'px ' + FREEZE_F;
    var rowsText = [];
    var maxRowW = 0;
    for (var mi = 0; mi < revealed; mi++) {
      var mh = stack.hopsUp[mi];
      var lbl = mh.cls.replace(/^Ifc/, '') + ' · ' + mh.storey + ' · hop ' + (mi + 1) + '/' + stack.hopsUp.length;
      rowsText.push(lbl);
      maxRowW = Math.max(maxRowW, ctx.measureText(lbl).width);
    }
    ctx.font = '700 ' + headerFontPx + 'px ' + FREEZE_F;
    var totalCost = 0, totalDays = 0;
    for (var ci = 0; ci < revealed; ci++) {
      var ch = stack.hopsUp[ci];
      totalCost += (ch.hopCost || 0);
      totalDays += (ch.hopDays || 0);
    }
    var headerText = revealed + ' of ' + stack.hopsUp.length + ' placed';
    var totalsText = 'RM ' + _spaceThousandsLP(totalCost) + ' · ' + _formatDaysLP(totalDays);
    var headerW = Math.max(ctx.measureText(headerText).width, ctx.measureText(totalsText).width);
    var panelW = Math.round(Math.max(headerW, maxRowW + swatch + pad * 3) + pad * 2);
    var panelH = headerH + revealed * rowH + pad;
    var x = Math.round(w - panelW - w * 0.012);
    var y = Math.round(yBottom) - panelH;
    // §129.28 (2026-09-18, red1) — step the panel LEFT of the stack's own screen bbox when (and
    // only when) the fixed right-edge position would actually sit on top of it (a tall stack whose
    // upper hops happen to project into this same top-right corner). Left untouched otherwise.
    var stackBoxPx = _stackScreenBox(stack, w, h);
    if (stackBoxPx && x < stackBoxPx.x1 && (x + panelW) > stackBoxPx.x0 && y < stackBoxPx.y1 && (y + panelH) > stackBoxPx.y0) {
      x = Math.round(Math.max(pad, stackBoxPx.x0 - panelW - w * 0.012));
    }
    // §129.30 (2026-09-18, red1: "the stack label box is obscured by the top-left info box, thus it
    // has one more target to avoid") — the stack-avoidance nudge above can land the panel right on
    // top of the (always top-left, fixed) info card. A second, independent check: step DOWN below
    // the card when they'd overlap, keeping whatever `x` the stack-avoidance step already chose.
    if (avoidRect && x < avoidRect.x + avoidRect.w && (x + panelW) > avoidRect.x &&
        y < avoidRect.y + avoidRect.h && (y + panelH) > avoidRect.y) {
      y = Math.round(avoidRect.y + avoidRect.h + pad);
    }
    // W2 (ALTC_FOUNDATION §1 round 6): the two steps above never looked at the rest of the HUD, so the stack-avoidance step put the
    // near panel on stats-panel — which stays up through the hold — §HUD_OVERLAP_WORST f=211 1.00/1.00, 53x293 px (Hospital 1900:2000).
    // Clear every SOLID box already registered this frame (the HUD row/column draw before this composite; alpha < 0.5 = fading, not
    // judged by W2; the freeze's own loadpath.* boxes excluded): step right of the blocker when that still fits the frame and keeps off
    // the stack, else below it. Bounded; a panel pushed out of frame is still caught by §LOADPATH_INFOPANEL inFrame.
    var _hudSolid = (A._hudLayoutRects || []).filter(function (r) { return r.w > 1 && r.h > 1 && !(r.alpha < 0.5) && !/^loadpath\./.test(r.name); });
    var _ovl = function (ax, ay, aw, ah, b) { return ax < b.x + b.w && ax + aw > b.x && ay < b.y + b.h && ay + ah > b.y; };
    // Tested against the FULL reserved height (_stackInfoPanelMaxH, the panel grows upward as hops reveal) so the answer cannot change
    // mid-hold and make the panel jump; a step down moves the whole reserved block.
    var _maxH = Math.max(panelH, _stackInfoPanelMaxH(h, stack)), _yTop = y + panelH - _maxH, _moves = [];
    for (var _it = 0; _it < 8; _it++) {
      var _hit = null; for (var _hi = 0; _hi < _hudSolid.length; _hi++) if (_ovl(x, _yTop, panelW, _maxH, _hudSolid[_hi])) { _hit = _hudSolid[_hi]; break; }
      if (!_hit) break;
      var _xr = Math.round(_hit.x + _hit.w + pad);
      var _rightOk = _xr + panelW <= w - w * 0.012 && !(stackBoxPx && _ovl(_xr, _yTop, panelW, _maxH, { x: stackBoxPx.x0, y: stackBoxPx.y0, w: stackBoxPx.x1 - stackBoxPx.x0, h: stackBoxPx.y1 - stackBoxPx.y0 }));
      if (_rightOk) x = _xr; else _yTop = Math.round(_hit.y + _hit.h + pad);
      _moves.push(_hit.name + (_rightOk ? '>right' : '>down'));
    }
    y = _yTop + _maxH - panelH;
    if (_moves.length && !(stack._hudAvoidLogged)) { stack._hudAvoidLogged = true;
      console.log('§LOADPATH_INFOPANEL_AVOID stack=' + stackName + ' moves=[' + _moves.join(',') + '] final=' + x + ',' + y + ' ' + panelW + 'x' + panelH + ' solidHud=' + _hudSolid.length); }
    var rr = Math.round(Math.min(panelH, panelW) * 0.09);
    // §129.21 amendment (2026-09-18, red1: "keep design theme consistent with other HUDs") — the
    // SAME frosted dark-glass plate every other panel (resource panel, path map, measure boxes)
    // already shares via `A.cpePanelPlate` — not the white plate the ladder/info-card used (that
    // was always a deliberate ONE-OFF for on-black freeze legibility, not the project's real
    // default). Ink matches too: white at the SAME opacities `_HUD_LEGIBLE` already measured
    // against this exact plate, rather than a new pair invented for this one panel.
    // §129.58 — the freeze's own REVERSED plate, shared with the info card beside it.
    // `A.cpePanelPlate`'s dark glass (rgba(0,0,0,0.28)) has no presence against this beat's black
    // backdrop (§LOADPATH_BACKDROP allElseAtBlack=51/51), which is exactly why the card next to it
    // was already carrying a white slab of its own. Now they share one.
    _freezePlateDraw(ctx, x, y, panelW, panelH, rr);
    var _band = _freezeBandsOn();   // §FREEZE_BANDS — the header IS the band (title + totals in white on Structure blue)
    if (_band) _freezeBand(ctx, x, y, panelW, panelH, rr, headerH, 'structure', fontPx, 'stack.' + stackName);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = '700 ' + headerFontPx + 'px ' + FREEZE_F;
    ctx.fillStyle = _band ? '#FFFFFF' : FREEZE_INK_TITLE;
    ctx.fillText(headerText, x + pad, y + headerH * 0.34);
    ctx.font = '700 ' + Math.round(headerFontPx * 0.86) + 'px ' + FREEZE_F;
    ctx.fillStyle = _band ? 'rgba(255,255,255,0.92)' : FREEZE_INK_TOTALS;   // §61 — was rgba(255,215,0,0.95) gold; yellow is the one HUD ink red1 ruled out ("Replace yellow with blue is better contrast")
    ctx.fillText(totalsText, x + pad, y + headerH * 0.72);
    // Divider — a clean, professional break between the summary header and the itemised rows below (the band edge is the break when banded).
    if (!_band) { ctx.fillStyle = FREEZE_INK_RULE;
    ctx.fillRect(x + pad, y + headerH - divider, panelW - pad * 2, divider); }
    ctx.font = '600 ' + fontPx + 'px ' + FREEZE_F;
    // §129.23 — bottom-up: hop1 (ri=0) draws at the panel's OWN bottom-most row; each higher hop
    // stacks ABOVE it. `panelH` already reserves exactly `revealed` rows worth of space below the
    // header, so `ri` counted from the bottom lands every row flush, no gap.
    for (var ri = 0; ri < revealed; ri++) {
      var rowY = (y + panelH) - pad - (ri + 1) * rowH;
      if (ri % 2 === 1) {
        ctx.fillStyle = FREEZE_INK_ZEBRA;   // zebra band — a lift off the plate, not a heavy tint
        ctx.fillRect(x, rowY, panelW, rowH);
      }
      var hop = stack.hopsUp[ri];
      var _ra = _rowAlpha(stack, ri), _rdx = Math.round((1 - _ra) * fontPx * 0.6);   // §FREEZE_ANIM: the row fades + slides in as its hop appears
      ctx.save(); ctx.globalAlpha *= _ra;
      ctx.fillStyle = '#' + ('000000' + (hop.hex >>> 0).toString(16)).slice(-6);
      ctx.fillRect(x + pad - _rdx, rowY + (rowH - swatch) / 2, swatch, swatch);
      ctx.fillStyle = FREEZE_INK_BODY;
      ctx.fillText(rowsText[ri], x + pad * 2 + swatch - _rdx, rowY + rowH / 2);
      ctx.restore();
    }
    ctx.restore();
    if (A._hudLayoutRegister) A._hudLayoutRegister('loadpath.infopanel.' + stackName, x, y, panelW, panelH);
    return { x0: x, y0: y, x1: x + panelW, y1: y + panelH };
  }
  // Local thousands-separator — this file has no shared formatter to reuse (cpe_resource_panel.js's
  // own `_spaceThousands` lives in a different closure), and this is the only place in THIS file that
  // needs one.
  function _spaceThousandsLP(n) {
    var s = Math.round(n).toString();
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }
  // Whole-day figures print clean ("6 days"); a real fractional remainder (from an hour-only task,
  // §_isoDurToDays) keeps one decimal rather than rounding it away.
  function _formatDaysLP(days) {
    var rounded = Math.round(days * 10) / 10;
    var isWhole = Math.abs(rounded - Math.round(rounded)) < 1e-9;
    return (isWhole ? Math.round(rounded) : rounded) + (Math.abs(rounded) === 1 ? ' day' : ' days');
  }   // §129.8 item 3 — keyed by stack name ('near'/'far')
  // §129.21 (2026-09-18) — RETIRED from the composite pass (see `A.loadPathCompositeOntoCanvas`'s
  // own call site, now `_drawStackInfoPanel` instead), superseded by red1's own direction to drop
  // the leader-line ladder for a plain HUD list. Kept defined, not deleted: still exposed for a
  // direct node dry run of the pure layout math (`A._loadPathLadderLayoutBesideStack` etc, below),
  // and as prior art if a future look ever wants a 3D-anchored label again.
  // §129.8 item 4 — one stack's own hop-screen projection + ladder-beside-box + draw + witness.
  // `otherStackBoxPx` (nullable): the OTHER stack's own screen box, added to `avoidRects` ONLY for
  // THIS stack's own side/room search, so the two ladders cannot land on each other — "between the
  // two stacks if both fit" falls out of this for free (each stack's ladder naturally lands on its
  // OUTER side once the other stack's box blocks the inner one, unless the inner side still has
  // more free room, in which case the free-room rule already picked correctly on its own merits).
  function _drawStackLadder(ctx, w, h, k, stack, stackName, avoidRectsBase, otherStackBoxPx) {
    var proj = new THREE.Vector3();
    var hopScreens = [];
    var bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
    stack.hopsUp.forEach(function (h_, i) {
      if (!h_._cloneMesh) return;
      h_._cloneMesh.updateMatrixWorld(true);
      var b = new THREE.Box3().setFromObject(h_._cloneMesh);
      var box = { minX: b.min.x, maxX: b.max.x, minY: b.min.y, maxY: b.max.y, minZ: b.min.z, maxZ: b.max.z };
      var r = LP._projectAABBLive(box, A.camera);
      if (!r || !r.intersects) return;   // off-screen: coloured (already drawn in 3D) but never labelled/leadered
      var wp = new THREE.Vector3(); h_._cloneMesh.getWorldPosition(wp);
      proj.copy(wp).project(A.camera);
      var pxn = Math.max(-1.5, Math.min(1.5, proj.x)), pyn = Math.max(-1.5, Math.min(1.5, proj.y));
      var px = (pxn * 0.5 + 0.5) * w, py = (1 - (pyn * 0.5 + 0.5)) * h;
      hopScreens.push({ k: i, px: px, py: py });
      bx0 = Math.min(bx0, px); bx1 = Math.max(bx1, px); by0 = Math.min(by0, py); by1 = Math.max(by1, py);
    });
    var stackBoxPx = isFinite(bx0) ? { x0: bx0, x1: bx1, y0: by0, y1: by1 } : { x0: w / 2, x1: w / 2, y0: 0, y1: h };
    var avoidRects = otherStackBoxPx ? avoidRectsBase.concat([{ x: otherStackBoxPx.x0, y: otherStackBoxPx.y0,
      w: otherStackBoxPx.x1 - otherStackBoxPx.x0, h: otherStackBoxPx.y1 - otherStackBoxPx.y0 }]) : avoidRectsBase;
    // FIX (2026-09-18, red1: "the background of each label not in full" — the plate was a fixed
    // `w*0.16` guess, unrelated to the actual label text; a longer storey name like "GROUND FLOOR
    // LEVEL" overflowed it on both sides, and where that overflow fell outside the frame it was
    // clipped outright, cutting off leading/trailing characters with no plate behind them at all).
    // Measure every label THIS stack will actually draw (revealedHops-gated, same filter the draw
    // loop below uses) at the bold/current font (the wider of the two weights — a safe upper bound
    // regardless of which row ends up "current"), and size the plate to the WIDEST of them, so every
    // row's white background genuinely covers its own text, no exceptions.
    ctx.save();
    ctx.font = '700 ' + (13 * k).toFixed(0) + 'px ' + FREEZE_F;   // §129.58 family only — the 13*k SIZE is a remaining outlier, see the theme block
    var _measuredLabelW = 0;
    stack.hopsUp.forEach(function (h_, i) {
      if (i >= stack.revealedHops) return;
      var lbl = h_.cls + ' · ' + h_.storey + ' · hop ' + (i + 1) + '/' + stack.hopsUp.length;
      var mw = ctx.measureText(lbl).width;
      if (mw > _measuredLabelW) _measuredLabelW = mw;
    });
    ctx.restore();
    var _labelPadX = Math.round(16 * k);
    var labelWAuto = Math.max(60, Math.round(_measuredLabelW + _labelPadX * 2));
    var layout, column, hudClear = true;
    if (window.__lpLabelsNaive) {
      layout = _naiveLayout(hopScreens, labelWAuto, Math.max(14, Math.round(h * 0.022)));
      column = (stackBoxPx.x0 + stackBoxPx.x1) / 2 < w / 2 ? 'right' : 'left';
      hudClear = _crossOverlapCount(layout, avoidRects) === 0;
    } else {
      var laddered = _ladderLayoutBesideStack(hopScreens, stackBoxPx, w, h, labelWAuto, null, avoidRects);
      layout = laddered.rows; column = laddered.column; hudClear = laddered.hudClear;
    }
    layout.forEach(function (row) {
      if (row.k >= stack.revealedHops) return;   // this layer's turn has not come yet
      var h_ = stack.hopsUp[row.k];
      var isCurrent = (row.k === stack.revealedHops - 1);
      ctx.save();
      // Locked spec 2026-09-17 (red1) item 3 — leader line goes yellow (was white/light-grey): a
      // real, legible warm yellow, not a garish pure #ffff00 — reads clearly against a black
      // backdrop and a white building either way. isCurrent keeps its own distinction via a brighter
      // shade AND the existing lineWidth split (both kept — belt and suspenders, minor either way).
      ctx.strokeStyle = isCurrent ? '#ffd83d' : '#f5c518';
      ctx.lineWidth = (isCurrent ? 2.2 : 1.4) * k;
      ctx.beginPath(); ctx.moveTo(row.px, row.py);
      ctx.lineTo(row.x + (row.x > row.px ? 0 : row.w), row.y + row.h / 2); ctx.stroke();
      var label = h_.cls + ' · ' + h_.storey + ' · hop ' + (row.k + 1) + '/' + stack.hopsUp.length;
      ctx.font = (isCurrent ? '700 ' : '600 ') + (13 * k).toFixed(0) + 'px ' + FREEZE_F;   // §129.58 family only — see above
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // FIX (2026-09-17, red1 direct correction — reversed from what shipped here, no written spec
      // entry existed to check it against): black text on a WHITE plate, not white text on a black
      // one. `row` is already sized exactly for this text by the ladder layout above (x/y/w/h) —
      // used directly, no re-measure. Opacity raised 50%->100% (red1, same day: "falling on black
      // anyway [during the hold] to be more legible" — nothing behind it a translucent plate would
      // need to show through).
      ctx.fillStyle = 'rgba(255,255,255,1)';
      ctx.fillRect(row.x, row.y, row.w, row.h);
      ctx.fillStyle = isCurrent ? '#000000' : '#14181d';
      ctx.fillText(label, row.x + row.w / 2, row.y + row.h / 2);
      ctx.restore();
      if (A._hudLayoutRegister) A._hudLayoutRegister('loadpath.label.' + stackName + '.' + row.k, row.x, row.y, row.w, row.h);
    });
    if (A._loadPathMidHoldThisFrame && !LP._lpLabelsWitnessFiredThisHold[stackName]) {
      LP._lpLabelsWitnessFiredThisHold[stackName] = true;
      var overlaps = _rectsOverlapCount(layout);
      var minGap = _minVerticalGap(layout);
      var inFrame = _allRectsInFrame(layout, w, h);
      var ok = overlaps === 0 && inFrame && hudClear;
      console.log('§LOADPATH_LABELS stack=' + stackName + ' n=' + hopScreens.length + ' of=' + stack.hopsUp.length +
        ' column=' + column + ' x=' + (layout[0] ? Math.round(layout[0].x) : 0) +
        ' overlaps=' + overlaps + ' minGapPx=' + (minGap == null ? 'n/a' : minGap.toFixed(1)) +
        ' inFrame=' + inFrame + ' hudClear=' + hudClear + ' => ' + (ok ? 'PASS' : 'FAIL'));
    }
    return stackBoxPx;
  }   // reset per build/hold in A.loadPathBuild, alongside the labels flag
  // IfcColumn -> column, IfcWallStandardCase -> wall, IfcSlab -> slab. No new vocabulary — the SAME
  // `cls` field every hop already carries from _buildItems().
  function _shortClassLabel(cls) {
    var s = String(cls || '').replace(/^Ifc/, '');
    s = s.replace(/StandardCase$/, '');
    return s.toLowerCase();
  }
  // "Level 3 column" — storey + short class, for one hop.
  function _stackFragment(hop) {
    return hop.storey + ' ' + _shortClassLabel(hop.cls);
  }
  // "Near stack   5 layers · Level 3 column → Level 1 slab → ground" — top and bottom hop only
  // (never the full walk), K = the SAME layer count §LOADPATH_STACK's own step=j/K already prints.
  function _stackCardLine(label, stack) {
    var K = stack.hopsUp.length;
    var top = _stackFragment(stack.hopsUp[K - 1]);
    var bottom = _stackFragment(stack.hopsUp[0]);
    return label + ' stack   ' + K + ' layers · ' + top + ' → ' + bottom + ' → ground';
  }   // own local const — this file carries no projectStartMs of its own
  function _cardDayNumber(cursorMs, projectStartMs) {
    if (cursorMs == null || projectStartMs == null) return null;
    return Math.floor((cursorMs - projectStartMs) / MS_PER_DAY_CARD) + 1;
  }
  // info = { cursorEntry, projectStart, near: {hopsUp, pickItem}, far: {...}|null,
  //          wrongStackControl: bool, buildNearGuid, buildFarGuid }
  // Returns { lines: [...], nearGuid, farGuid } — farGuid is null when there is no far stack.
  function _cardAssemble(info) {
    var day = _cardDayNumber(info.cursorEntry, info.projectStart);
    var lines = [];
    lines.push('LOAD PATH ·' + (day != null ? ' day ' + day + ',' : '') + ' structure topped out');
    lines.push(_stackCardLine('Near', info.near));
    var farGuid = null;
    if (info.far) {
      lines.push(_stackCardLine('Far', info.far));
      farGuid = info.wrongStackControl ? info.buildFarGuid : info.far.pickItem.guid;
    }
    lines.push(CARD_FIXED_LINE);
    var nearGuid = info.wrongStackControl ? info.buildNearGuid : info.near.pickItem.guid;
    return { lines: lines, nearGuid: nearGuid, farGuid: farGuid };
  }
  // Fixed top-left placement, sized to fit the longest line — no avoidance search, unlike the
  // ladders. margin/pad/rowH are the SAME corner-inset convention every other HUD corner box already
  // uses (cpe_resource_panel.js's own `_box`: margin = round(h*0.028)), passed in here, never
  // hardcoded twice.
  function _cardRect(maxLineWidthPx, numLines, rowH, pad, margin) {
    return { x: margin, y: margin, w: maxLineWidthPx + pad * 2, h: numLines * rowH + pad * 2 };
  }
  // §LOADPATH_CARD's own geometry checks reuse the SAME cross-overlap/in-frame shape
  // _ladderLayoutBesideStack's own witness already uses (_crossOverlapCount/_allRectsInFrame),
  // scoped here to ONLY `loadpath.label.*` rects (the card is drawn while the rest of the HUD
  // registry is unregistered at alpha 0, per ROUND 12 item 3 — nothing else is live geometry to
  // avoid) — never a second, duplicated overlap/in-frame implementation.
  function _cardOverlapsLadders(rect, hudRects) {
    var ladderRects = (hudRects || []).filter(function (r) { return r.name && r.name.indexOf('loadpath.label.') === 0; });
    return _crossOverlapCount([rect], ladderRects);
  }
  function _cardInFrame(rect, w, h) { return _allRectsInFrame([rect], w, h); }
  // §LOADPATH_CARD lines=N rect=x,y,w,h inFrame=true overlaps=0 near=guid far=guid|none => PASS|FAIL
  // `drawnNearGuid`/`drawnFarGuid` are the ACTUALLY drawn stacks (_lp.pickItem.guid/_lp.far.pickItem.
  // guid) — checked against the assembled card's OWN nearGuid/farGuid regardless of any control,
  // which is what makes window.__lpCardWrongStack a real, falsifiable check rather than an
  // unverified label swap.
  function _cardWitness(assembled, rect, w, h, hudRects, drawnNearGuid, drawnFarGuid) {
    var inFrame = _cardInFrame(rect, w, h);
    var overlaps = _cardOverlapsLadders(rect, hudRects);
    var nearOk = assembled.nearGuid === drawnNearGuid;
    var farOk = drawnFarGuid != null ? (assembled.farGuid === drawnFarGuid) : (assembled.farGuid == null);
    var ok = inFrame && overlaps === 0 && nearOk && farOk;
    console.log('§LOADPATH_CARD lines=' + assembled.lines.length +
      ' rect=' + Math.round(rect.x) + ',' + Math.round(rect.y) + ',' + Math.round(rect.w) + ',' + Math.round(rect.h) +
      ' inFrame=' + inFrame + ' overlaps=' + overlaps +
      ' near=' + assembled.nearGuid + ' far=' + (assembled.farGuid || 'none') +
      ' => ' + (ok ? 'PASS' : 'FAIL'));
    return ok;
  }

  // The actual 2D draw call — top-left, fades in with the first ladder and out with the HUD fade-in
  // (`cardAlpha = 1 - A._loadPathHudAlpha`, the SAME HUD_FADE_SEC curve mirrored, no new curve).
  // `window.__lpCardWrongStack=1` makes the TEXT name the BUILD-TIME PROBE pick instead of the live
  // re-pick (_lp.buildNearGuid/_lp.buildFarGuid, stashed in loadPathBuild) — the witness above always
  // compares against the REAL drawn guids regardless, so the control reliably FAILS when build and
  // live picks genuinely differ.
  // §129.30 (2026-09-18) — factored out of `_drawInfoCard` so `loadPathCompositeOntoCanvas` can know
  // the card's own rect BEFORE positioning the stack panel (which needs to avoid it), without a
  // second, independently-drifting copy of this same measurement.
  function _infoCardLayout(ctx, w, h, k) {
    var info = {
      cursorEntry: LP._lp.cursorAtEntry, projectStart: A._resPanelProjectStart,
      near: { hopsUp: LP._lp.hopsUp, pickItem: LP._lp.pickItem },
      far: LP._lp.far ? { hopsUp: LP._lp.far.hopsUp, pickItem: LP._lp.far.pickItem } : null,
      wrongStackControl: !!window.__lpCardWrongStack, buildNearGuid: LP._lp.buildNearGuid, buildFarGuid: LP._lp.buildFarGuid
    };
    var assembled = _cardAssemble(info);
    // §129.32 (2026-09-19, red1: "font size independent like the other HUDs from resolution change")
    // — was `Math.max(9, Math.round(17 * k))`, `k` capped at 1.6 — grew slower than every other HUD
    // (day counter: `Math.max(14, Math.round(h * 0.026))`, no ceiling at all), so the gap widened at
    // hi-res: this card fell visibly behind text sized directly off `h` right next to it. Same direct
    // `h`-fraction convention now, no `k` indirection, no ceiling — matches `cpe_day_counter.js`'s
    // own formula exactly, so this card scales at the SAME rate the rest of the HUD already does.
    // `pad`/`rowH`/the card's own rect (`_cardRect`, below) all derive from `fontPx`, so this one
    // number scales the whole plate proportionally, not just the text.
    // §HUD_SCALE (2026-09-19, red1: "too big in low res and too small in hi res") — the size
    // now comes from the ONE law in cinema_maxq.js, which lets the FRACTION of frame height
    // rise gently with resolution instead of holding constant. The 1080 anchor below is this
    // overlay's own previous constant, so nothing moves at 1080 and every overlay keeps its
    // tuned size RELATIVE to its neighbours. The fallback is the old formula verbatim, for a
    // page that loads this module without cinema_maxq.
    var fontPx = (window.__hudFontPx ? window.__hudFontPx(h, 0.026, 9) : Math.max(9, Math.round(h * 0.026)));
    var pad = Math.round(fontPx * 0.6), margin = Math.round(h * 0.028), rowH = Math.round(fontPx * 1.55);
    ctx.save();
    ctx.font = '600 ' + fontPx + 'px ' + FREEZE_F;   // §129.58 — the card keeps k=0.026 (the day counter's own size); only the family was its own
    var maxLineWidthPx = 0;
    assembled.lines.forEach(function (l) { maxLineWidthPx = Math.max(maxLineWidthPx, ctx.measureText(l).width); });
    ctx.restore();
    var rect = _cardRect(maxLineWidthPx, assembled.lines.length, rowH, pad, margin);
    return { assembled: assembled, rect: rect, fontPx: fontPx, pad: pad, rowH: rowH };
  }
  function _drawInfoCard(ctx, w, h, k, layout) {
    // §129.29 (2026-09-18, code review after §129.27) — was `1 - A._loadPathHudAlpha`, INVERTED:
    // that made the card blank whenever HUD is near-normal (hudAlpha near 1) — right at arm before
    // the HUD fade-out has progressed, and right before release once the front-loaded fade-in
    // finishes — while showing it only near HUD's minimum, mid-hold. Per the RECONCILIATION ruling
    // (§129.12), this card is PART OF THE FROZEN SCENE, same as the ladder panel just below it,
    // which already draws unconditionally with no HUD-alpha gate at all. The caller
    // (`A.loadPathCompositeOntoCanvas`) already restricts this whole draw pass to `_lp.showLadder`
    // — no separate alpha needed here.
    layout = layout || _infoCardLayout(ctx, w, h, k);
    var assembled = layout.assembled, rect = layout.rect, pad = layout.pad, rowH = layout.rowH;
    ctx.save();
    // FIX (2026-09-17, red1: "Freeze info panel is not even following the label schema just given")
    // — same schema as the ladder labels: black text on a WHITE plate (100% opaque, same "falling on
    // black anyway" reasoning as the ladder labels above). Was using the shared `A.cpePanelPlate` (a
    // dark-glass panel tuned for the REST of the HUD, left untouched here on purpose — changing it
    // would affect unrelated panels) with near-white text, the same reversed scheme fixed once for
    // the ladder and missed here.
    var rr = Math.round(rect.h * 0.09);
    // §129.58 — the same reversed plate the info panel now uses, so the two freeze boxes cannot
    // drift apart again. Was a bare opaque `rgba(255,255,255,1)` slab with no border.
    _freezePlateDraw(ctx, rect.x, rect.y, rect.w, rect.h, rr);
    if (_freezeBandsOn()) _freezeBand(ctx, rect.x, rect.y, rect.w, rect.h, rr, Math.max(4, Math.round(layout.fontPx * 0.3)), 'structure', layout.fontPx, 'card');   // §FREEZE_BANDS: the card has no title row — a top strip + stripe
    // §129.39 (2026-09-19, red1 on a 1080p frame: "its text is still too small") — THIS FUNCTION
    // NEVER SET ctx.font. `_infoCardLayout` sets it, measures the lines with it, and then hands the
    // context back through its OWN ctx.restore() — so every fillText below ran at the canvas 2D
    // default, `10px sans-serif`, on every frame this card has ever drawn.
    // That is why §129.32 looked like it did nothing: it changed the formula from `17*k` to
    // `h*0.026`, the PLATE grew with it (rect is derived from fontPx), and the TEXT did not move,
    // because the text was never sized by that number in the first place. Measured on the delivered
    // 1920x1080 film: a 913x163 plate — the right size for 28px — carrying ~10px glyphs.
    // One line. The size is `layout.fontPx`, the same number the plate was measured with, so the
    // two can no longer disagree.
    ctx.font = '600 ' + layout.fontPx + 'px ' + FREEZE_F;   // §129.58 — must match _infoCardLayout's measuring font exactly (§129.39)
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    assembled.lines.forEach(function (l, i) {
      var _ca = _fa(FREEZE_SCHED.cardLine(i));   // §FREEZE_ANIM: card lines one by one
      var ly = rect.y + pad + rowH * i + rowH / 2, lx = rect.x + pad - Math.round((1 - _ca) * layout.fontPx * 0.6);
      ctx.save(); ctx.globalAlpha *= _ca;
      ctx.fillStyle = FREEZE_INK_BODY;   // §129.58 — was the one-off #14181d; the shared freeze ink now, same ladder as the panel
      ctx.fillText(l, lx, ly);
      ctx.restore();
    });
    ctx.restore();
    if (A._hudLayoutRegister) A._hudLayoutRegister('loadpath.card', rect.x, rect.y, rect.w, rect.h);
    if (A._loadPathMidHoldThisFrame && !LP._lpCardWitnessFired) {
      LP._lpCardWitnessFired = true;
      var drawnNearGuid = LP._lp.pickItem ? LP._lp.pickItem.guid : null;
      var drawnFarGuid = LP._lp.far ? LP._lp.far.pickItem.guid : null;
      _cardWitness(assembled, rect, w, h, A._hudLayoutRects || [], drawnNearGuid, drawnFarGuid);
    }
  }

  return function () {   // phase 2: this part's setup statements, in original order
  A._loadPathLadderLayoutBesideStack = _ladderLayoutBesideStack;
  // Exposed for a direct node dry run of the pure layout math (never re-derived a second time there).
  A._loadPathLadderLayout = _ladderLayout; A._loadPathNaiveLayout = _naiveLayout;
  A._loadPathRectsOverlapCount = _rectsOverlapCount; A._loadPathMinVerticalGap = _minVerticalGap;
  A._loadPathFreeVerticalSpan = _freeVerticalSpan; A._loadPathCrossOverlapCount = _crossOverlapCount;
  A._loadPathStackInfoPanelMaxH = _stackInfoPanelMaxH;
  A._freezeBand = _freezeBand; A._freezeBandsOn = _freezeBandsOn;
  FREEZE_SCHED = { cardLine: function (i) { return 0.15 + 0.25 * i; }, perfPlate: 0.8, perfLine: function (j) { return 1.2 + 0.5 * j; }, countUp: [1.2, 0.8] };
  A._freezeAnim = { alpha: _fa, sched: FREEZE_SCHED, on: _freezeAnimOn, e: function () { return LP._lp ? LP._lp.holdElapsed : null; },
    countUp: function () { var e = LP._lp && LP._lp.holdElapsed; if (e == null || !_freezeAnimOn()) return 1; var p = Math.max(0, Math.min(1, (e - FREEZE_SCHED.countUp[0]) / FREEZE_SCHED.countUp[1])); return 1 - Math.pow(1 - p, 3); } };
  A._freezeAnimKey = function () {
    if (!LP._lp || LP._lp.holdElapsed == null || !_freezeAnimOn()) return '-';
    var v = [];   // fixed-length items first, so a growing row list never shifts their index (the monotone check compares by index)
    for (var i = 0; i < 6; i++) v.push(_fa(FREEZE_SCHED.cardLine(i)));
    if (A._freezePerfOn && (A._freezePerfOn.visual || A._freezePerfOn.audio)) { v.push(_fa(FREEZE_SCHED.perfPlate)); for (var j = 0; j < 12; j++) v.push(_fa(FREEZE_SCHED.perfLine(j))); v.push(A._freezeAnim.countUp()); }
    [LP._lp.far, LP._lp].forEach(function (s) { if (s && s.hopsUp) for (var ri = 0; ri < (s.revealedHops || 0); ri++) v.push(_rowAlpha(s, ri)); });
    var key = v.map(function (x) { return x.toFixed(3); }).join(','), e = LP._lp.holdElapsed, all1 = v.every(function (x) { return x >= 1; });
    if (_faWit.first == null) _faWit.first = e;
    if (_faWit.lastVals && _faWit.lastVals.length <= v.length) for (var q = 0; q < _faWit.lastVals.length; q++) if (v[q] < _faWit.lastVals[q] - 1e-9) _faWit.nonMono++;
    _faWit.lastVals = v;
    if (all1 && _faWit.settled == null) { _faWit.settled = e; _faWit.n = (_faWit.n || 0) + 1; console.log('§FREEZE_ANIM settle#' + _faWit.n + ' first=' + _faWit.first.toFixed(2) + ' settled=' + e.toFixed(2) + ' lines=' + v.length + ' nonMonotone=' + _faWit.nonMono + ' => ' + (_faWit.nonMono ? 'FAIL' : 'PASS') + ' (alphas never fade back)'); }
    if (!all1) _faWit.settled = null;
    return all1 ? 'settled' : key;
  };

  LP._lpLabelsWitnessFiredThisHold = {};

  // ══ §129.8 item 6 / ROUND 13 (2026-09-16) — INFO CARD DURING THE HOLD ══════════════════════════
  // Pure layout/text math, same "no THREE.js/DOM needed" convention every other exposed function in
  // this file uses — verbatim from the dry-run harness (scratchpad/test_loadpath_card.js), proven
  // there first (17 asserts) before landing here unchanged. Text is assembled ONLY from PICK/CHAIN/
  // HOLD data already computed (_lp.cursorAtEntry, A._resPanelProjectStart, hopsUp, pickItem) —
  // nothing new computed here.
  LP._lpCardWitnessFired = false;
  A._loadPathShortClassLabel = _shortClassLabel; A._loadPathStackFragment = _stackFragment;
  A._loadPathStackCardLine = _stackCardLine; A._loadPathCardDayNumber = _cardDayNumber;
  A._loadPathCardAssemble = _cardAssemble; A._loadPathCardRect = _cardRect;
  A._loadPathCardOverlapsLadders = _cardOverlapsLadders; A._loadPathCardInFrame = _cardInFrame;
  A._loadPathCardWitness = _cardWitness;
  A._loadPathDrawInfoCard = _drawInfoCard;
  // W2 (ALTC_FOUNDATION §1 round 3) — the card's on-screen window, read by cinema_maxq.js so the path map (same top-left rect)
  // yields to it. Same gate as loadPathCompositeOntoCanvas below, so the two can never disagree.
  A.loadPathCardOn = function () { return !!(LP._lp && LP._lp.ok && LP._lp.showLadder); };

  A.loadPathCompositeOntoCanvas = function (ctx, w, h, filmSec) {
    try {
      if (!LP._lp || !LP._lp.ok || !LP._lp.showLadder || !A.camera || typeof THREE === 'undefined') return;
      // §129.36 (2026-09-19, red1: "the label sizes are constant such that when hi res the freeze
      // text does not look diminished ... that goes for the rest") — the 1.6 CEILING was the bug.
      // `k` is the panel/ladder's own size scale (13px at the h=900 it was drawn against). Clamped
      // to 1.6 it stopped growing above h=1440, so the text held a SHRINKING share of the frame as
      // resolution rose: 1.48% of frame height at 1080, 0.97% at 2160, against the 2.6% the day
      // counter and the info card hold at EVERY resolution (`Math.round(h * 0.026)`, no ceiling).
      // Now a straight proportion, the convention every other bake overlay in this viewer already
      // follows (day counter 0.026, sun readout 0.020, sun clock 0.014 — all direct `h` fractions,
      // none capped). h=900 and h=1080 are unchanged to the pixel, so the look red1 has already
      // signed off does not move; only hi-res stops shrinking and 4K gets 31px instead of 21px.
      // The 0.6 FLOOR is gone with it — a floor is the same defect pointing the other way.
      // (The per-font `Math.max(9, ...)` legibility floors below still hold under ~623px height,
      // which is test-clip territory only; every delivered resolution is above it.)
      var k = h / 900;
      // §129.8 item 4b — the ARM-frame HUD snapshot, never the live (now hold-suppressed) registry
      // — same source of truth the underHud test uses.
      var avoidRects = LP._lp.armHudRects || A._hudLayoutRects || [];
      // §129.21/§129.23 — the ladder's own leader-line-to-3D-anchor placement (`_drawStackLadder`,
      // kept defined below but no longer called) is REPLACED by a fixed-position HUD list panel per
      // stack, growing upward from a fixed BOTTOM anchor (bottom-up row order, §129.23) — so each
      // stack's own anchor is reserved from its FULL hop count (`_stackInfoPanelMaxH`), not its
      // current `revealed` count, and never shifts as more hops reveal mid-hold. FAR's reserved
      // block sits above NEAR's, same "far drawn first" order the ladder used.
      var topMargin = Math.round(h * 0.028), stackGap = Math.round(h * 0.014);
      // §129.30 — computed BEFORE the stack panels so their own avoidance nudge can see it; reused
      // (never recomputed) by `_drawInfoCard` below, single source of truth for the card's rect.
      var cardLayout = _infoCardLayout(ctx, w, h, k);
      var nearMaxH = _stackInfoPanelMaxH(h, LP._lp);
      var nearBottomY = topMargin + nearMaxH;
      var farPanelBox = null;
      if (LP._lp.far) {
        var farMaxH = _stackInfoPanelMaxH(h, LP._lp.far);
        var farBottomY = topMargin + farMaxH;
        farPanelBox = _drawStackInfoPanel(ctx, w, h, k, LP._lp.far, 'far', farBottomY, cardLayout.rect);
        nearBottomY = farBottomY + stackGap + nearMaxH;
      }
      var nearPanelBox = _drawStackInfoPanel(ctx, w, h, k, LP._lp, 'near', nearBottomY, cardLayout.rect);
      if (A._loadPathMidHoldThisFrame && !LP._lpLabelsWitnessFiredThisHold.near) {
        LP._lpLabelsWitnessFiredThisHold.near = true;
        var _revealedN = LP._lp.revealedHops || 0;
        var _inFrameN = !nearPanelBox || (nearPanelBox.x0 >= 0 && nearPanelBox.y0 >= 0 && nearPanelBox.x1 <= w && nearPanelBox.y1 <= h);
        console.log('§LOADPATH_INFOPANEL stack=near revealed=' + _revealedN + '/' + LP._lp.hopsUp.length +
          ' inFrame=' + _inFrameN + ' => ' + (_revealedN > 0 && !_inFrameN ? 'FAIL' : (_revealedN === 0 ? 'INCONCLUSIVE reason=nothing-revealed-yet' : 'PASS')));
      }
      // ROUND 14 (2026-09-16, real HHS R13 bake: NO §LOADPATH_CARD line at all) — `_drawInfoCard`
      // was defined in ROUND 13 but never actually WIRED into this composite pass. Fixed: called
      // here, same frame as the ladders, so it draws/witnesses for whatever `_lp.hopsUp`/`_lp.
      // pickItem` is ACTUALLY drawn (fallback included), never `picked.near` from the arm block.
      _drawInfoCard(ctx, w, h, k, cardLayout);
      // §FREEZE_PERF_PANEL (PERFORMANCE_AS_CLASH.md §19) — Audio/Visual panels in the black, clear of everything drawn above
      if (A.freezePerfCompositeOntoCanvas && A._freezePerfOn && (A._freezePerfOn.visual || A._freezePerfOn.audio)) {
        var _cr = cardLayout.rect, _taken = [nearPanelBox, farPanelBox, _cr ? { x0: _cr.x, y0: _cr.y, x1: _cr.x + _cr.w, y1: _cr.y + _cr.h } : null,
          _stackScreenBox(LP._lp, w, h), LP._lp.far ? _stackScreenBox(LP._lp.far, w, h) : null].filter(Boolean);
        A.freezePerfCompositeOntoCanvas(ctx, w, h, { plate: _freezePlateDraw, bodyPx: _freezeBodyPx, font: FREEZE_F }, _taken);
      }
    } catch (e) { if (!A._loadPathDrawWarned) { A._loadPathDrawWarned = true; LP._err('DRAW', e); } }
  };

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  A.loadPathDispose = function () {
    try { LP._forceRestore(); } catch (e) {}
    LP._lp = null; A._loadPathWindow = null;
  };

  console.log('§LOADPATH_INIT wired gate=measure (§129.1 v8b — camera holds at arm pose, no cut; ' +
    'hold-point searched forward from topout; pick/chain/visible(clip+clones)/framing/hold/restore; ' +
    'controls: window.__lpBreakSupport, window.__lpSkipRestore, window.__lpHideRest, window.__lpFrameOff, window.__lpClipAll)');
  };
};
