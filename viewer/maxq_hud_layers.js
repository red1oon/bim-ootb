// cinema_maxq family — part `hud_layers` (original cinema_maxq.js lines 800–1692).
// GENERATED move-only by scripts/split_closure.js (config scripts/split_configs/cinema_maxq.json). Below the `yield` every
// statement is the original text; the only edit is that a name owned by ANOTHER part is reached as MQS.name.
// Edit this file normally from now on; regenerate only to re-split a branch that still edits the old single file.
(typeof window !== 'undefined' ? window : globalThis).__cinemaMaxqParts = (typeof window !== 'undefined' ? window : globalThis).__cinemaMaxqParts || {};
(typeof window !== 'undefined' ? window : globalThis).__cinemaMaxqParts.hud_layers = function* __split_cinema_maxq_hud_layers(MQS) {
  'use strict';
  // phase 1 — publish this part's names that other parts use (same function objects; vars as live accessors)
  MQS._filmRecInstall = _filmRecInstall;
  MQS._filmRecSummary = _filmRecSummary;
  MQS._hudLayoutRegisterImpl = _hudLayoutRegisterImpl;
  MQS._hudLayoutWitnessImpl = _hudLayoutWitnessImpl;
  MQS._hudLayoutStableSampleImpl = _hudLayoutStableSampleImpl;
  MQS._hudLayoutStablePrintImpl = _hudLayoutStablePrintImpl;
  MQS._hudLayoutFocusWitnessImpl = _hudLayoutFocusWitnessImpl;
  MQS._lpInstallDrawInstrument = _lpInstallDrawInstrument;
  MQS._lpUninstallDrawInstrument = _lpUninstallDrawInstrument;
  MQS._filmLayerRegister = _filmLayerRegister;
  MQS._cease3D = _cease3D;
  MQS._drawUnlessHold = _drawUnlessHold;
  MQS._hudHold = _hudHold;
  MQS._logFrameCost = _logFrameCost;
  Object.defineProperty(MQS, '_lpUnwrappedDrawCount', { get: function () { return _lpUnwrappedDrawCount; }, set: function (v) { _lpUnwrappedDrawCount = v; }, enumerable: true });
  Object.defineProperty(MQS, '_lpAlphaAtDraw', { get: function () { return _lpAlphaAtDraw; }, set: function (v) { _lpAlphaAtDraw = v; }, enumerable: true });
  Object.defineProperty(MQS, '_HUD_ROW', { get: function () { return _HUD_ROW; }, set: function (v) { _HUD_ROW = v; }, enumerable: true });
  yield;   // phase 2 resumes here, in this same scope: the original statements, in original order


  // One explicit composer render, then SAME-TASK drawImage into a 2D canvas (clash_snag.js's
  // proven capture pattern — the WebGL buffer is only guaranteed valid within the task that drew it).
  // §CPE_ROOM_TITLE: titleInfo ({name, opacity}, or null/opacity<=0) is composited onto THIS 2D
  // context, after the WebGL frame is drawn in but before toBlob — the only point that reaches the
  // actual exported bytes (RESUME_CPE_ROOM_TITLE.md §2's trap: a DOM caption never would).
  // §CPE_DAY_COUNTER: dayInfo ({day,totalDays} or null) rides the SAME 2D context for the SAME
  // reason as titleInfo — this is the only point that reaches the exported bytes. Drawn after the
  // caption; they occupy different corners (lower-third vs top right) so neither can clip the other.
  // ══ §129.6 item 4 — §HUD_LAYOUT registry (2026-09-15) ══════════════════════════════════════════
  // Any HUD drawer that paints a rect THIS frame calls A._hudLayoutRegister(name,x,y,w,h) — reset
  // once per frame (top of _captureFrame, below) so a stale rect can never survive into the next
  // frame's check. Overlap excludes pure nesting (one rect fully containing another is intentional
  // structure — e.g. a row inside its own panel — not a layout defect; the defect class this
  // witness exists to catch is two UNRELATED rects spanning/crossing each other, exactly what
  // window.__hudForceOverlap constructs on demand).
  function _hudRectsOverlap(a, b) {
    return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
  }
  function _hudRectContains(parent, child) {
    return child.x >= parent.x && child.y >= parent.y &&
      child.x + child.w <= parent.x + parent.w && child.y + child.h <= parent.y + parent.h;
  }
  // Plain module-scope functions, never assigned onto `A` at SCRIPT-LOAD time (window.APP may not
  // exist yet when this IIFE first runs, depending on script order) — _captureFrame below assigns
  // them onto A itself, every frame, cheap and idempotent, only once a bake is actually live.
  // §HUD FIX (2026-09-15, real HHS bake): `parentName` (optional 6th arg) replaces the earlier
  // auto-detected "fully nested = not an overlap" heuristic with an EXPLICIT declaration — a child
  // registered against a real parent is never counted as overlapping THAT parent (intentional
  // structure, e.g. a row inside its own panel), but if it does not fully fit inside that parent's
  // own rect, that is `overflow`, a real defect (the real bake's own pie.ledger: 306px inside a
  // 173px panel) — checked in the witness below, never silently absorbed into "not an overlap".
  // ══ W6 §F — ONE RECORD PER FILM FRAME (ALTC_FOUNDATION §1 SPEC W6, 2026-10-03) ═════════════════════════════════════════════
  // A film frame used to print 32-38 lines (Hospital page log 27 MB), most of them the same decision repeated, and answering one
  // question (were the lamps lit?) took four tags and a timeline. This owner reads the lines the layers already print, keeps the
  // numbers that matter and prints ONE `§F` line per frame after its capture: phase ms (same boundaries as phases.py), renders
  // (renderer.info.render.frame delta), scene calls/tris, exposure, lamp owner/lit, HUD boxes, luma, encode. It never changes what
  // a layer decides. With &filmlog=compact the repeat lines it folds are printed ONCE per film (first occurrence) and then dropped;
  // without it every line still prints (existing witnesses read them). Outside a film it is a pass-through.
  var _FREC_FOLD = /^(?:\[[^\]]*\] )?§(STILL_REFINE|PHOTO_AO|LAMP_ZONE_PICK|SUN_ARC_FILL_PIN|SUN_ARC_STEP|PHOTO_SHADOW_FORCE_REASSERT|TRIPLANAR_PERF|STILL_OVERLAY_GUARD|PHOTO_STAGING|NIGHT_PL_INTENSITY_HEURISTIC|NIGHT_BUILDUP_GATE|LAMP_CAP_CHURN|FPS_MODE|SOURCED_LIGHT_BIND|FILM_EXPOSURE|FRAME_QA|CAPTURE_PARTS|CAPTURE_ENC|CAPTURE_TAIL|LAMP_EN|SOURCED_OWN_COST|WINDOW_PULL|FLYTHRU_DIM_DRAW|PERF_TRAVERSE)\b/;
  var _frec = null;
  function _filmRecInstall() {
    if (window.__filmRecOrigLog) { _frec = { t: {}, seen: {}, folded: 0, emitted: 0, lastHashT: null, lastRenders: null, pend: null }; return; }
    var orig = console.log; window.__filmRecOrigLog = orig;
    _frec = { t: {}, seen: {}, folded: 0, emitted: 0, lastHashT: null, lastRenders: null, pend: null };
    function f1(v) { return v == null ? '-' : (+v).toFixed(0); }
    function emit() {
      var R = _frec, P = R.pend; if (!P) return; R.pend = null;
      var A = window.APP, T = R.t, ri = A && A.renderer && A.renderer.info && A.renderer.info.render;
      var rNow = ri ? ri.frame : null, renders = (rNow != null && R.lastRenders != null) ? rNow - R.lastRenders : null;
      R.lastRenders = rNow;
      var ph = function (a, b) { return (a != null && b != null) ? (b - a) : null; };
      var rects = (A && A._hudLayoutRects) || [], real = 0;
      for (var k = 0; k < rects.length; k++) if (!(rects[k].w <= 1 && rects[k].h <= 1)) real++;
      var c = A && A.camera ? A.camera.position : null, L = (A && A._frLamps) || {}, X = R.ex || {}, Q = R.qa || {}, E = R.enc || {};
      orig.call(console, '§F i=' + P.i + ' total=' + f1(ph(R.lastHashT, P.t)) + ' setup=' + f1(ph(R.lastHashT, T.rs)) + ' light=' + f1(ph(T.rs, T.exp)) +
        ' taa=' + f1(ph(T.exp, T.rd)) + ' ao=' + f1(ph(T.aos, T.aod)) + ' cap=' + f1(ph(T.aod, P.t)) + ' renders=' + (renders == null ? '-' : renders) +
        ' calls=' + ((A && A._taaPass && A._taaPass.lastSceneCalls != null) ? A._taaPass.lastSceneCalls : '-') +
        ' tris=' + ((A && A._taaPass && A._taaPass.lastSceneTris != null) ? (A._taaPass.lastSceneTris / 1e6).toFixed(2) + 'M' : '-') +
        ' | EV=' + (X.ev || '-') + ' exp=' + (X.exp || '-') + ' Lcd=' + (X.lcd || '-') + ' metered=' + (X.met || '-') + ' capped=' + (X.cap || '-') + ' meterMs=' + (X.ms || '-') +
        ' | lamps=' + (L.owner || '-') + ' dataLit=' + (L.data == null ? '-' : L.data) + ' poolLit=' + (L.pool == null ? '-' : L.pool) +
        ' | hud=' + real + ' | luma=' + (Q.l || '-') + ' dark=' + (Q.d || '-') + ' clip=' + (Q.c || '-') + ' reused=' + (Q.r || '-') +
        ' | encMs=' + (E.ms || '-') + ' compMs=' + (E.comp || '-') + ' bytes=' + (E.b || P.b || '-') +
        ' cam=' + (c ? c.x.toFixed(2) + ',' + c.y.toFixed(2) + ',' + c.z.toFixed(2) : '-'));
      R.emitted++; R.lastHashT = P.t; R.t = {}; R.ex = null; R.qa = null; R.enc = null;
    }
    console.log = function () {
      var A = window.APP, s = (arguments.length && typeof arguments[0] === 'string') ? arguments[0] : null;
      if (!s || !A || !A._maxqActive || !_frec || s.indexOf('§') < 0) return orig.apply(console, arguments);
      var R = _frec, now = performance.now(), m;
      if (s.indexOf('§STILL_REFINE start') >= 0) { if (R.t.rs == null) R.t.rs = now; }
      else if (s.indexOf('§STILL_REFINE done') >= 0) R.t.rd = now;
      else if (s.indexOf('§PHOTO_AO start') >= 0) R.t.aos = now;
      else if (s.indexOf('§PHOTO_AO done') >= 0) R.t.aod = now;
      else if ((m = /§FILM_EXPOSURE f=\d+ metered=(\d)\S* .*?\bEV=([\d.]+) exposure=([\d.]+) Lcd=([\d.]+).*?capped=(\S+).*\bms=([\d.]+)/.exec(s))) {
        R.t.exp = now; R.ex = { met: m[1], ev: m[2], exp: m[3], lcd: (+m[4]).toFixed(0), cap: m[5], ms: (+m[6]).toFixed(0) }; }
      else if ((m = /§FRAME_QA i=\d+ .*?lumaMean=([\d.]+).*?darkPct=([\d.]+) clipPct=([\d.]+) reused=(\d)/.exec(s))) R.qa = { l: m[1], d: m[2], c: m[3], r: m[4] };
      else if ((m = /§CAPTURE_ENC .*?\bms=([\d.]+) compMs=([\d.]+) bytes=(\d+)/.exec(s))) R.enc = { ms: m[1], comp: m[2], b: m[3] };
      var hm = /§FRAME_HASH i=(\d+) sha=\S+ bytes=(\d+)/.exec(s);
      if (hm) { emit(); R.pend = { i: +hm[1], t: now, b: hm[2] }; }
      var key = _FREC_FOLD.exec(s), pass = !A._filmLogCompact || !key || !R.seen[key[1]];
      if (key) R.seen[key[1]] = 1;
      if (pass) orig.apply(console, arguments); else R.folded++;
      if (/§CAPTURE_TAIL i=/.test(s) || /§FRAME_REUSE_TOTAL/.test(s)) emit();
    };
  }
  function _filmRecSummary() {
    if (!_frec || !window.__filmRecOrigLog) return;
    window.__filmRecOrigLog.call(console, _frec.emitted
      ? '§F_SUMMARY frames=' + _frec.emitted + ' foldedLines=' + _frec.folded + ' compact=' + (window.APP && window.APP._filmLogCompact ? 1 : 0)
      : '§F_SUMMARY INCONCLUSIVE — no §F record was emitted (no §FRAME_HASH seen)');
  }

  function _hudLayoutRegisterImpl(name, x, y, w, h, parentName, truncated) {
    var A2 = window.APP;
    if (!A2._hudLayoutRects) A2._hudLayoutRects = [];
    // §129.7 item 5 (2026-09-16) CONTROL WART FIX: force the overlap by moving pie.ledger onto
    // pie.cost — NOT onto the roster any more. Roster is FOCUS-suppressed during the hold (§129.6
    // item 8), so forcing onto it required the tap to ALSO set __lpNoFocusHold=1 just to make roster
    // register a rect at all — which then made §LOADPATH_FOCUS fail as a side effect (roster
    // "painted" during the hold), defeating the point of testing §HUD_LAYOUT in isolation. pie.cost
    // is never FOCUS-gated (it is one of the frozen HUD status rows that stays up through the whole
    // hold, per item 8's own text) and it registers on the SAME frame, one row before pie.ledger
    // (cpe_resource_panel.js's own row order) — so it is always there to collide onto without
    // touching FOCUS gating at all. Falls back to roster only if pie.cost was not registered this
    // frame (cost odometer off).
    if (window.__hudForceOverlap) {
      var pairCandidates = { 'pie.ledger': ['pie.cost', 'roster'], 'pie.cost': ['pie.ledger'],
        'roster': ['pie.ledger'] }[name];
      if (pairCandidates) {
        for (var pc = 0; pc < pairCandidates.length; pc++) {
          var other = A2._hudLayoutRects.filter(function (r) { return r.name === pairCandidates[pc]; })[0];
          if (other) { x = other.x; y = other.y; w = other.w; h = other.h; break; }
        }
      }
    }
    // W2: the alpha this box was drawn at (set by _drawUnlessHold around its own register call; boxes drawn outside it are opaque = 1)
    var _al = (A2._hudRegAlpha != null) ? A2._hudRegAlpha : 1;
    A2._hudLayoutRects.push({ name: name, x: x, y: y, w: w, h: h, parent: parentName || null, truncated: !!truncated, alpha: _al });
  }
  // `h` (ROUND 13 item D, NEW param) — the frame height, needed to check `rowFontPx` against the
  // pre-Round-10 FORMULA (itself proportional to frame height, never a fixed pixel constant).
  // `tag` (Finding 1 broadened fix, 2026-09-16, NEW param, default '§HUD_LAYOUT') — lets the SAME
  // function print under a second name, '§HUD_LAYOUT_ARM', for the arm-frame sample (see the two
  // call sites in _captureFrame below). Same computation either way; only the log line's own tag differs.
  function _hudLayoutWitnessImpl(h, tag) {
    tag = tag || '§HUD_LAYOUT';
    var A2 = window.APP, rects = A2._hudLayoutRects || [], overlaps = 0, overflow = 0;
    var byName = {}; rects.forEach(function (r) { byName[r.name] = r; });
    rects.forEach(function (r) {
      if (r.parent && byName[r.parent] && !_hudRectContains(byName[r.parent], r)) overflow++;
    });
    for (var i = 0; i < rects.length; i++) for (var j = i + 1; j < rects.length; j++) {
      var a = rects[i], b = rects[j];
      // ROUND 12 item 3 (2026-09-16, real HHS bake: overlaps=78 from 13 placeholder rects all
      // registered at the SAME 0,0,1,1 marker) — a placeholder-sized rect (_drawUnlessHold's own
      // "something ran, no real geometry" marker convention, w<=1 and h<=1) is never real content
      // and must never count toward overlaps, however many of them happen to coincide.
      if ((a.w <= 1 && a.h <= 1) || (b.w <= 1 && b.h <= 1)) continue;
      if (a.parent === b.name || b.parent === a.name) continue;   // declared parent/child — never an overlap (overflow, above, is that pair's own check)
      if (_hudRectsOverlap(a, b)) overlaps++;
    }
    // §129.7 item 4 — rows whose measured text width exceeded their available width BEFORE any
    // fitting (the drawer's own honest self-report via the 7th A._hudLayoutRegister arg), never a
    // second, re-measured opinion here.
    var truncated = rects.filter(function (r) { return r.truncated; }).length;
    var cost = byName['pie.cost'], ledger = byName['pie.ledger'];
    var pieBand = byName['pie.band'], panel = byName['resource-panel'];
    // Finding 1 broadened fix (2026-09-16) — cost/ledger/pieBand/panel ALL absent means the resource
    // panel simply did not draw THIS frame (e.g. the mid-hold §HUD_LAYOUT sample, taken after §129.8
    // item 4b's FOCUS fade has taken hud.pie to alpha 0 — see _drawUnlessHold/resourcePanelComposite-
    // OntoCanvas's own opacity>0 guard). `orderOk`/`pieExclusive`/`rowsFullWidth` below used to default
    // to a bare `true` in that case — a vacuous pass, never a real check of anything. They now say
    // 'INCONCLUSIVE' instead, honestly, same convention as this project's other INCONCLUSIVE witnesses
    // (§129.4 PRIMAL LAW clause 4). The NEW arm-frame sample (tag='§HUD_LAYOUT_ARM', fired while
    // A._loadPathHudAlpha is still 1, before the fade starts) is the one that gets real values.
    var hudFaded = !cost && !ledger && !pieBand && !panel;
    // §129.6 item 6b — cost must sit fully above ledger (cost.y + cost.h <= ledger.y), checked
    // geometrically from the SAME registered rects, never a second layout opinion.
    var orderOk = hudFaded ? 'INCONCLUSIVE' : (!(cost && ledger) || (cost.y + cost.h <= ledger.y));
    // §129.7 item 8a (2026-09-16) — `pieExclusive`: no OTHER registered rect intersects the pie's
    // own band (`pie.band`, cpe_resource_panel.js's own registration). Reuses the SAME overlap test
    // and the SAME declared-parent/child exclusion the generic loop above already applies — a rect
    // parented to something else entirely (e.g. `pie.list`, a SIBLING under `resource-panel`, not a
    // child of `pie.band`) is still checked against `pie.band`; `pie.band`'s OWN declared parent
    // (`resource-panel`, the whole outer panel — always nested around it, never "beside" it) is
    // excluded too, else a fully-containing parent would always read as a false overlap.
    var pieExclusive = hudFaded ? 'INCONCLUSIVE' : true;
    if (!hudFaded && pieBand) {
      for (var pk = 0; pk < rects.length; pk++) {
        var pr = rects[pk];
        if (pr.name === 'pie.band' || pr.parent === 'pie.band' || pr.name === pieBand.parent) continue;
        if (_hudRectsOverlap(pieBand, pr)) { pieExclusive = false; break; }
      }
    }
    // §129.7 item 8d — `rowsFullWidth`: pie.cost/pie.ledger (whichever registered this frame) get
    // the SAME allocated width as each other (cpe_resource_panel.js now registers the ALLOCATED
    // full-inner-width column, never the variable measured text width — see its own comment) and
    // that width is most of the panel's own (a generous 0.7 threshold, robust to the exact pad
    // constant cpe_resource_panel.js uses — never re-derived here — while still clearly telling
    // apart "full width below the pie" from the old ~44%-squeezed side column).
    function isFullWidth(r) { return !!(r && panel && r.w >= panel.w * 0.7); }
    var rowsFullWidth = hudFaded ? 'INCONCLUSIVE' : ((!cost || isFullWidth(cost)) && (!ledger || isFullWidth(ledger)) &&
      (!cost || !ledger || cost.w === ledger.w));
    // ROUND 13 item D (2026-09-16, user: "the other text lines are too large. Keep them same size
    // as before, allow the pie only to grow") — `rowFontPx` is the REAL font px cpe_resource_panel.
    // js's own `_drawList` used THIS frame (`A._resPanelRowFontPx`, stashed there — never read back
    // from a flag); checked against the PRE-ROUND-10 FORMULA read from git history of that file
    // (HEAD's own `_drawList`: `fs = Math.max(9, Math.round(bh*0.085))` where `bh = Math.round(h*
    // 0.24)` — never re-typed as a fixed pixel constant, since the value is itself proportional to
    // frame height `h`). `pieBandH` is read straight off the ALREADY-registered `pie.band` rect's
    // own height (cpe_resource_panel.js's own registration) — never a second, re-derived number.
    var expectedRowFontPx = Math.max(9, Math.round(Math.round((h || 0) * 0.24) * 0.085));
    var rowFontPx = A2._resPanelRowFontPx;
    var fontOk = (rowFontPx == null) || (rowFontPx === expectedRowFontPx);
    var pieBandH = pieBand ? pieBand.h : null;
    // ROUND 16 item 1 (§129.9 item 1, 2026-09-16, red1: resource-panel read 173x272 vs 173x115 pre-
    // Round-10 — "gigantic") — `resourcePanelH` is the REAL registered `resource-panel` rect height,
    // checked against a FRESH recompute of cpe_resource_panel.js's own `_box()` formula (pieBandH +
    // pad + shownRows*rowH0+listHeaderH + pad*0.4, using ONLY `h` and `A2._resPanelShownRows` — the
    // live row count that function itself stashed, NEVER read back from `panel.h` itself, which
    // would be a tautology) — FAILs if any reserved worst-case space survives (the panel would then
    // read TALLER than this formula predicts for the rows actually shown).
    // ROUND 20 (2026-09-16, red1 ruling — MERGES Cost/Ledger back into this SAME panel, superseding
    // Round 16 item 1's separate `hud.fiveD` box): the recompute now ALSO adds the cost/ledger rows'
    // own content-driven height, off `A2._resPanelClRows` (the live count cpe_resource_panel.js's own
    // `resourcePanelCompositeOntoCanvas` stashed THIS frame — same non-tautological discipline as
    // `shownRows`), so a reserved worst-case surviving for EITHER the trade list OR the cost/ledger
    // rows still fails this check.
    var panelH = panel ? panel.h : null;
    var shownRows = A2._resPanelShownRows;
    var clRows = A2._resPanelClRows;
    var expectedPanelH = null, panelHOk = true;
    if (panelH != null && shownRows != null && pieBandH != null) {
      var _bh0 = Math.round((h || 0) * 0.24), _fs0 = Math.max(9, Math.round(_bh0 * 0.085)),
          _rowH0 = Math.round(_fs0 * 1.55), _pad = Math.round(_bh0 * 0.10),
          _listHeaderH = Math.round(_fs0 * 0.7 + _rowH0 * 0.95);
      var _rows = Math.max(0, Math.min(8, shownRows));
      var _listRowsH = _rows > 0 ? (_listHeaderH + _rows * _rowH0) : 0;
      var _clN = (clRows != null) ? Math.max(0, clRows) : 0;
      var _clRowsH = _clN > 0 ? Math.round(_pad * 0.5 + _clN * _rowH0) : 0;
      expectedPanelH = Math.round(pieBandH + _pad + _listRowsH + _clRowsH + _pad * 0.4);
      panelHOk = (panelH === expectedPanelH);
    }
    // ROUND 4 item 2, REVISED RULING (2026-09-16, red1): the panel does not widen and a truncated
    // (ellipsis-clipped) row is ACCEPTABLE by design — `truncated` is printed for visibility but no
    // longer gates PASS/FAIL; `overflow` (a registered rect actually leaving its panel) still does.
    var ok = overlaps === 0 && overflow === 0 && !!orderOk && fontOk && panelHOk;
    console.log(tag + ' items=[' + rects.map(function (r) {
      return r.name + ':' + Math.round(r.x) + ',' + Math.round(r.y) + ',' + Math.round(r.w) + ',' + Math.round(r.h);
    }).join(' ') + '] overlaps=' + overlaps + ' overflow=' + overflow + ' truncated=' + truncated +
      (cost && ledger ? ' costAboveLedger=' + orderOk : '') +
      ' pieExclusive=' + pieExclusive + ' rowsFullWidth=' + rowsFullWidth +
      ' rowFontPx=' + (rowFontPx == null ? 'n/a' : rowFontPx) + '(expect ' + expectedRowFontPx + ')' +
      ' pieBandH=' + (pieBandH == null ? 'n/a' : Math.round(pieBandH)) +
      ' resourcePanelH=' + (panelH == null ? 'n/a' : panelH) + '(expect ' + (expectedPanelH == null ? 'n/a' : expectedPanelH) + ')' +
      ' => ' + (ok ? 'PASS' : 'FAIL'));
  }
  // §129.7 item 8c (2026-09-16) — §HUD_LAYOUT_STABLE: sample the registry EVERY frame (never just
  // mid-hold — the pie/cost/ledger panel is up through the whole buildup, not only a load-path
  // hold) for pie.cost/pie.ledger's own Y and the panel's own H. A min==max range across the WHOLE
  // bake is the falsifiable proof the panel's height and the pinned rows' Y truly never move —
  // called once per frame from _captureFrame, printed once at end of bake (see the frame loop's own
  // post-loop summary prints, e.g. §CPE_PIE_HOLD/§CPE_STATS_TAIL, right below it).
  // ROUND 20 (2026-09-16, red1 ruling — Cost/Ledger MERGED back into the resource panel's own box,
  // SUPERSEDING Round 16 item 1's separate `hud.fiveD`, which no longer exists) — `fiveDY` is GONE:
  // there is no more independently-positioned box to require frame-invariant. What that field was
  // protecting against (§129.7 item 8's own complaint: "the running new line...jumps up and down")
  // is now, by red1's own explicit ruling tonight, the CORRECT, intended behaviour — content-driven
  // sizing means ledgerY/costY (drawn right after the trade list) move WHENEVER the trade list's own
  // row count changes across the buildup, same reason `panelH` already stopped gating `ok` in Round
  // 16. Requiring them stable here would be requiring the exact fixed worst-case reservation tonight's
  // ruling rejected — so they stay PRINTED (visibility) but NEVER gate `ok` again.
  // What DOES still hold, unconditionally, by `_box()`'s own formula (`bw`/`x` are pure functions of
  // frame height + corner/stackY alone, NEVER of row count or content) is the panel's own X anchor —
  // `panelX` replaces `fiveDY` as the one field this witness still requires stable, so a real
  // regression (the whole box drifting sideways, corner flipping mid-bake, etc.) is still caught.
  var _hudStableLedgerY = null, _hudStableCostY = null, _hudStablePanelH = null, _hudStablePanelX = null;
  // Fix (2026-09-17, red1: "solve systematically, ensure it is WITNESSED" — the rolling-cards
  // inflation bug (cpe_resource_panel.js's `bigStatsCompositeOntoCanvas`) was invisible to every
  // existing witness because the ONE thing that checks `resource-panel`'s height against a fresh
  // formula recompute (`expectedPanelH`/`panelHOk`, in `_hudLayoutWitnessImpl` below) only ever runs
  // during the load-path hold — never during the separate reveal-round/rolling-cards phase where
  // this bug actually lived. Rather than run the full formula every single frame (red1's own
  // question: "why check every frame if it's a loop? check before and after"), this samples on
  // CHANGE ONLY — same "once per CHANGE, never per frame" discipline this file's own HUD registry
  // logging already follows elsewhere. A bug that's wrong for a whole repeating phase is wrong on
  // the FIRST frame of that phase, which is exactly when a content-state change fires this.
  var _hudPanelHCheckedKey = null, _hudPanelHEverFailed = false, _hudPanelHStatesChecked = 0;
  // `h` (real frame height, the SAME value `_hudLayoutWitnessImpl` takes as its own param) is passed
  // through from `_captureFrame`'s own scope — never reverse-derived from a registered rect (rounding
  // round-trips through `_box()`'s own multi-step formula are lossy and would produce false positives
  // that aren't real bugs).
  function _hudPanelHCheckOnChange(A2, h, panel, pieBandH) {
    if (!panel || pieBandH == null || !(h > 0)) return;
    var shownRows = A2._resPanelShownRows, clRows = A2._resPanelClRows;
    if (shownRows == null) return;
    var key = panel.h + '|' + h + '|' + shownRows + '|' + clRows;
    if (key === _hudPanelHCheckedKey) return;   // same content state as last frame — nothing new to prove
    _hudPanelHCheckedKey = key;
    _hudPanelHStatesChecked++;
    // Same pure formula as `_hudLayoutWitnessImpl` (§HUD_LAYOUT/§HUD_LAYOUT_ARM) and `_box()` itself
    // (cpe_resource_panel.js) — kept in sync deliberately, never read back from `panel.h`/`pieBandH`
    // themselves (that would be a tautology).
    var _bh0 = Math.round(h * 0.24), _fs0 = Math.max(9, Math.round(_bh0 * 0.085)),
        _rowH0 = Math.round(_fs0 * 1.55), _pad = Math.round(_bh0 * 0.10),
        _listHeaderH = Math.round(_fs0 * 0.7 + _rowH0 * 0.95);
    var _rows = Math.max(0, Math.min(8, shownRows));
    var _listRowsH = _rows > 0 ? (_listHeaderH + _rows * _rowH0) : 0;
    var _clN = (clRows != null) ? Math.max(0, clRows) : 0;
    var _clRowsH = _clN > 0 ? Math.round(_pad * 0.5 + _clN * _rowH0) : 0;
    var expected = Math.round(pieBandH + _pad + _listRowsH + _clRowsH + _pad * 0.4);
    if (panel.h !== expected) _hudPanelHEverFailed = true;
  }
  function _hudLayoutStableSampleImpl(h) {
    var A2 = window.APP, rects = (A2 && A2._hudLayoutRects) || [], byName = {};
    rects.forEach(function (r) { byName[r.name] = r; });
    var panel = byName['resource-panel'], ledger = byName['pie.ledger'], cost = byName['pie.cost'];
    var pieBand = byName['pie.band'];
    function widen(range, v) { return range ? [Math.min(range[0], v), Math.max(range[1], v)] : [v, v]; }
    if (panel) { _hudStablePanelH = widen(_hudStablePanelH, panel.h); _hudStablePanelX = widen(_hudStablePanelX, panel.x); }
    if (ledger) _hudStableLedgerY = widen(_hudStableLedgerY, ledger.y);
    if (cost) _hudStableCostY = widen(_hudStableCostY, cost.y);
    _hudPanelHCheckOnChange(A2, h, panel, pieBand ? pieBand.h : null);
    // ══ §HUD_OVERLAP_WORST (2026-09-21) — OVERLAP IS A PER-FRAME FACT, SO CHECK EVERY FRAME ══════
    // The pairwise check in _hudLayoutWitnessImpl is correct, but it runs on ONE sampled frame: the
    // HHS 1080p bake printed `overlaps=0` from its single sample while resource-panel (y 259..715)
    // covered hud.status (y 602..756) by 113 px for the whole crew window. A one-frame sample of a
    // 3,275-frame film cannot see a panel whose height depends on the crew on site that day.
    // This runs on EVERY frame — the rects are already built for the sampler above, so it costs a
    // pairwise walk of ~15 boxes — and keeps only the WORST pair seen, printed once at the end.
    // Same exclusions as the witness: placeholders (w<=1 && h<=1) and declared parent/child.
    // W2 (ALTC_FOUNDATION §1, 2026-10-03): a pair where either box is drawn at alpha < 0.5 is a CROSS-FADE (the load-path freeze fades
    // the HUD out over 24 frames while its card appears in the same corner) — counted apart, never as an overlap. Every verdict names
    // its frame and both alphas, and a film where no frame had two real boxes is INCONCLUSIVE, not PASS (LTU printed PASS on zero rects).
    _hudOvFrame++;
    var _real = 0;
    for (var ri = 0; ri < rects.length; ri++) if (!(rects[ri].w <= 1 && rects[ri].h <= 1)) _real++;
    if (_real >= 2) _hudOvFramesJudged++;
    for (var oi = 0; oi < rects.length; oi++) for (var oj = oi + 1; oj < rects.length; oj++) {
      var ra = rects[oi], rb = rects[oj];
      if ((ra.w <= 1 && ra.h <= 1) || (rb.w <= 1 && rb.h <= 1)) continue;
      if (ra.parent === rb.name || rb.parent === ra.name) continue;
      // §HUD_OVERLAP_SELF — an IDENTICAL rect under two names is ONE box registered twice, not two
      // boxes sharing pixels. Found on the first Terminal run this tracker judged: it reported
      // `"stats-panel" x "escroute.card" overlap=474x358px rects=[30,692,474,358] [30,692,474,358]`
      // — byte-identical. The escape card is drawn through bigStatsCompositeOntoCanvas, so that
      // drawer publishes its own `stats-panel` rect while _drawUnlessHold registers the same rect
      // again under `escroute.card`. A box cannot obscure itself, and reporting it would have made
      // this tracker cry wolf on every film that draws the escape card.
      if (ra.x === rb.x && ra.y === rb.y && ra.w === rb.w && ra.h === rb.h) continue;
      var ox = Math.min(ra.x + ra.w, rb.x + rb.w) - Math.max(ra.x, rb.x);
      var oy = Math.min(ra.y + ra.h, rb.y + rb.h) - Math.max(ra.y, rb.y);
      if (ox <= 0 || oy <= 0) continue;
      var area = ox * oy, aA = (ra.alpha == null ? 1 : ra.alpha), aB = (rb.alpha == null ? 1 : rb.alpha);
      var rec = { a: ra.name, b: rb.name, ox: ox, oy: oy, area: area, f: _hudOvFrame - 1, alA: aA, alB: aB,
                  ra: [ra.x, ra.y, ra.w, ra.h], rb: [rb.x, rb.y, rb.w, rb.h] };
      if (aA < 0.5 || aB < 0.5) {
        _hudCrossfadeFrames[_hudOvFrame - 1] = 1;
        if (!_hudWorstCrossfade || area > _hudWorstCrossfade.area) _hudWorstCrossfade = rec;
        continue;
      }
      if (!_hudWorstOverlap || area > _hudWorstOverlap.area) _hudWorstOverlap = rec;
    }
  }
  var _hudWorstOverlap = null, _hudWorstCrossfade = null, _hudCrossfadeFrames = {}, _hudOvFrame = 0, _hudOvFramesJudged = 0;   // W2
  function _hudLayoutStablePrintImpl() {
    // §HUD_OVERLAP_WORST — one line for the whole bake, naming the pair and the pixels. `none` here
    // is real coverage; `overlaps=0` on a single sampled frame never was.
    if (_hudWorstCrossfade) {
      var X = _hudWorstCrossfade;
      console.log('§HUD_OVERLAP_CROSSFADE "' + X.a + '" x "' + X.b + '" overlap=' + X.ox + 'x' + X.oy + 'px frames=' +
        Object.keys(_hudCrossfadeFrames).length + ' worstF=' + X.f + ' alpha=' + X.alA.toFixed(2) + '/' + X.alB.toFixed(2) +
        ' — one box fading (< 0.5) while the other shows: a transition, not an overlap (W2)');
    }
    if (_hudWorstOverlap) {
      var W = _hudWorstOverlap;
      console.log('§HUD_OVERLAP_WORST "' + W.a + '" x "' + W.b + '" overlap=' + W.ox + 'x' + W.oy +
        'px area=' + W.area + ' f=' + W.f + ' alpha=' + W.alA.toFixed(2) + '/' + W.alB.toFixed(2) +
        ' rects=[' + W.ra.join(',') + '] [' + W.rb.join(',') +
        '] judgedFrames=' + _hudOvFramesJudged + '/' + _hudOvFrame + ' => FAIL — two solid HUD boxes shared pixels');
    } else if (_hudOvFramesJudged === 0) {
      console.log('§HUD_OVERLAP_WORST INCONCLUSIVE — no frame of ' + _hudOvFrame + ' had two real HUD boxes; nothing was judged (VACUOUS)');
    } else {
      console.log('§HUD_OVERLAP_WORST none judgedFrames=' + _hudOvFramesJudged + '/' + _hudOvFrame + ' — checked every frame with >= 2 boxes => PASS');
    }
    function fmt(range) { return range ? '[' + range[0].toFixed(1) + ',' + range[1].toFixed(1) + ']' : '?'; }
    function stable(range) { return !range || range[0] === range[1]; }
    // ROUND 16 item 1 / ROUND 20 — `panelH`/`ledgerY`/`costY` are all now PRINTED but NO LONGER GATE
    // `ok`: the resource panel's own height (and everything drawn after the trade list inside it) is
    // SUPPOSED to track the rows actually shown each frame (Round 16's own fix, now also covering
    // Cost/Ledger — "the panel's height is pie band + the rows actually shown", never a fixed
    // worst-case reservation), so a real, healthy bake legitimately produces min!=max ranges on all
    // three now. `panelX` is the one field still required stable — see the block comment above.
    // Fix (2026-09-17, red1: "solve systematically... ensure it is WITNESSED") — `_hudPanelHCheckOnChange`
    // (above) has been silently accumulating a real correctness check (the same no-reserved-space
    // formula `_hudLayoutWitnessImpl`'s own `panelHOk` uses, just change-detected instead of run every
    // frame) across EVERY distinct content-state this whole bake ever showed — including the reveal-
    // round/rolling-cards phase the load-path hold's own witness never samples. It was computed and
    // never printed: exactly the "code ran, nothing proves it" gap this project keeps getting burned
    // by. `panelHFormulaOk` DOES gate `ok` (unlike the min/max ranges above, which are allowed to move)
    // — it is never allowed to be wrong, at any content state, anywhere in the film.
    var panelHVacuous = (_hudPanelHStatesChecked === 0);
    var panelHFormulaOk = panelHVacuous ? null : !_hudPanelHEverFailed;
    var ok = stable(_hudStablePanelX) && (panelHVacuous || panelHFormulaOk);
    console.log('§HUD_LAYOUT_STABLE ledgerY=' + fmt(_hudStableLedgerY) + ' costY=' + fmt(_hudStableCostY) +
      ' panelH=' + fmt(_hudStablePanelH) + ' panelX=' + fmt(_hudStablePanelX) +
      ' panelHFormula=' + (panelHVacuous ? 'INCONCLUSIVE reason=never-registered' : (panelHFormulaOk ? 'PASS' : 'FAIL')) +
      ' statesChecked=' + _hudPanelHStatesChecked +
      ' => ' + (ok ? 'PASS' : 'FAIL'));
  }
  // §LOADPATH_FOCUS — the NAMED overlays item 8 lists ("off" unless this frame registered a rect).
  // §129.8 item 4b (amendment) — hud.status/hud.pie/hud.pathmap ADDED: "no status box, no pie panel
  // ... no path map/compass" now supersedes §129.6 item 8's old "status box stays" exemption.
  var _FOCUS_NAMES = ['measure.datum', 'measure.cues', 'measure.linear', 'measure.slab',
    'measure.indoor', 'measure.flyout', 'measure.rulefindings', 'measure.box', 'clash.labels',
    'roomtitle.fallback', 'daycounter', 'roster', 'hud.status', 'hud.pie', 'hud.pathmap'];
  // ROUND 12 item 3 (2026-09-16, real HHS bake) — "the FOCUS witness reads 'painted' from a real
  // non-empty rect only": with `_drawUnlessHold`'s own fix below (register ONLY when something was
  // actually visible), a name's presence in the registry already means alpha was > 0 when it ran —
  // no separate alpha re-check needed here any more; a name simply absent from the registry is
  // "off". `w>0 && h>0` is kept as a belt-and-suspenders filter in case anything ever registers a
  // placeholder through a path other than `_drawUnlessHold`.
  function _hudLayoutFocusWitnessImpl() {
    var A2 = window.APP, rects = A2._hudLayoutRects || [];
    var byName = {}; rects.forEach(function (r) { if (r.w > 0 && r.h > 0) byName[r.name] = true; });
    var painted = 0;
    var parts = _FOCUS_NAMES.map(function (n) {
      var isPainted = !!byName[n];
      if (isPainted) painted++;
      return n + ':' + (isPainted ? 'painted' : 'off');
    });
    var alpha = (A2._loadPathHudAlpha != null) ? A2._loadPathHudAlpha : 1;
    // ROUND 16 item 2 (§129.9 item 2, 2026-09-16, real HHS bake: the datum overlay drew twice, once
    // completely outside `_drawUnlessHold`'s own fade wrapper — a witness reading the REGISTRY alone
    // (`painted`) cannot see that, since the unwrapped call never registers a rect either way) —
    // `_lpUnwrappedDrawCount` is the REAL count of fillText/fillRect/strokeText/drawImage calls the
    // capture ctx received THIS frame outside both `A._inHudFadeWrapper` (every `_drawUnlessHold`
    // call, while genuinely faded) and `A._inLoadPathComposite` (load path's own composite, which by
    // design keeps drawing unwrapped through the hold) — "the witness that reads the frame, not a
    // wrapper." `window.__lpNoFocusHold=1` forces `_drawUnlessHold`'s own `faded` to false (alpha
    // pinned to 1), so nothing is genuinely wrapped that frame and every draw counts — the control's
    // own proof this reads real draw calls, not the flag alone.
    // `(loadpath-own)` is load-path's OWN composite (ladder/card) — by explicit, confirmed ruling
    // ("the ladder and info card are part of the frozen scene, not HUD — they stay on through the
    // freeze") it is SUPPOSED to paint at full alpha through the hold. Only an UNEXPECTED clobber
    // (a real HUD layer painting despite alpha=0) should fail this witness.
    var clobberLayers = Object.keys(_lpAlphaAtDraw).filter(function (k) { return k !== '(loadpath-own)'; });
    var ok = painted === 0 && _lpUnwrappedDrawCount === 0 && clobberLayers.length === 0;
    console.log('§LOADPATH_FOCUS overlays=[' + parts.join(' ') + '] painted=' + painted + ' hudAlpha=' + alpha.toFixed(2) +
      ' unwrappedDraws=' + _lpUnwrappedDrawCount +
      ' alphaClobber=[' + clobberLayers.map(function (k) { return k + ':' + _lpAlphaAtDraw[k].count + 'x@maxAlpha=' + _lpAlphaAtDraw[k].maxAlpha.toFixed(2); }).join(',') + ']' +
      ' => ' + (ok ? 'PASS' : 'FAIL'));
    // Coordinator addition (2026-09-16) — stashed so cpe_load_path.js's own §LOADPATH_BACKDROP
    // witness (fired later, at release) can print ONE tied-together confirmation spanning BOTH halves
    // of "no other layers HUDs, background, sun lit sky, ground" — this witness's own mid-hold verdict
    // read back there as §LOADPATH_CONTEXT_OFF, never re-derived or re-checked a second way.
    A2._loadPathFocusLastResult = { ok: ok, painted: painted, unwrappedDraws: _lpUnwrappedDrawCount };
  }
  // ROUND 16 item 2 — instrument the capture ctx's own draw methods for the duration of a hold
  // frame's composite pass. `A2._inHudFadeWrapper` is true only while `_drawUnlessHold` is genuinely
  // fading a call (see its own comment); `A2._inLoadPathComposite` is true only while `A.
  // loadPathCompositeOntoCanvas` itself is running. A call outside BOTH is, by definition, a
  // composite call that bypassed the hold-fade discipline entirely.
  var _lpUnwrappedDrawCount = 0;
  var _lpCtxInstrument = null;   // {ctx, originals} while installed, else null
  // §129 FIX 5 (2026-09-17) — the ORIGINAL instrument only proved a draw call happened while
  // `_inHudFadeWrapper` was true; it never checked `ctx.globalAlpha` at the ACTUAL moment of that
  // call. A compositor that takes its own opacity/state and sets `ctx.globalAlpha` ABSOLUTELY
  // (the exact risk ROUND 13 item C's own comment names, only partly fixed) still counts as
  // "wrapped" here even while painting fully opaque — invisible to this witness either way. This
  // now also records the REAL globalAlpha seen at each call, named by which `_drawUnlessHold` layer
  // (if any) is currently active, so a clobbering compositor is named, not just suspected.
  var _lpAlphaAtDraw = {};
  function _lpInstallDrawInstrument(ctx) {
    if (!ctx || _lpCtxInstrument) return;
    var methods = ['fillText', 'fillRect', 'strokeText', 'drawImage'];
    var originals = {};
    methods.forEach(function (m) {
      if (typeof ctx[m] !== 'function') return;
      originals[m] = ctx[m];
      ctx[m] = function () {
        var A2 = window.APP;
        if (!(A2 && (A2._inHudFadeWrapper || A2._inLoadPathComposite))) _lpUnwrappedDrawCount++;
        var layer = (A2 && A2._drawUnlessHoldCurrentName) || (A2 && A2._inLoadPathComposite ? '(loadpath-own)' : '(unwrapped)');
        var ga = ctx.globalAlpha;
        if (ga > 0.02) {   // a real, visible paint despite whatever this frame's fade thinks alpha is
          if (!_lpAlphaAtDraw[layer]) _lpAlphaAtDraw[layer] = { count: 0, maxAlpha: 0 };
          _lpAlphaAtDraw[layer].count++;
          if (ga > _lpAlphaAtDraw[layer].maxAlpha) _lpAlphaAtDraw[layer].maxAlpha = ga;
        }
        return originals[m].apply(ctx, arguments);
      };
    });
    _lpCtxInstrument = { ctx: ctx, originals: originals };
  }
  function _lpUninstallDrawInstrument() {
    if (!_lpCtxInstrument) return;
    var ctx = _lpCtxInstrument.ctx, originals = _lpCtxInstrument.originals;
    Object.keys(originals).forEach(function (m) { ctx[m] = originals[m]; });
    _lpCtxInstrument = null;
  }
  // ══ §129.6 item 8 / §129.8 item 4b — FOCUS: "everything else is OFF during the hold" ══════════
  // Wraps a HUD/overlay draw call that has its own real-time animation (never one that is already a
  // pure function of the — now frozen during hold — tFilm, which needs no wrapping at all).
  // AMENDED (§129.8 item 4b, 2026-09-16): the call is NEVER skipped — it always runs (so it can fade
  // smoothly, never pop) at `ctx.globalAlpha *= A._loadPathHudAlpha` for the duration of the call,
  // restored immediately after.
  // ROUND 12 item 3 (2026-09-16, real HHS bake: overlaps=78 — 13 placeholder rects, ALL registered
  // at the same 0,0,1,1 marker, because the previous round registered UNCONDITIONALLY even at alpha
  // 0) — "a drawer that painted nothing must not register a rect": the placeholder is registered
  // ONLY when `alpha > 0` (something was genuinely, even if faintly, visible this frame). A fully
  // faded-out drawer (the whole stack-show middle of the hold) now registers NOTHING, which is
  // exactly what both §HUD_LAYOUT's overlap count and §LOADPATH_FOCUS's own "painted" need.
  // window.__lpNoFocusHold=1 forces alpha=1 (full visibility, always registers) — the control
  // §LOADPATH_FOCUS's own FAIL depends on. `A._captureCtx` is set once per frame by _captureFrame.
  // §129.55 A (2026-09-20) — `boxFn` (NEW, optional) returns THIS frame's real rect for this layer.
  // Until now every layer wrapped here registered only the 0,0,1,1 placeholder below, which the
  // §HUD_LAYOUT witness skips by design (w<=1 && h<=1) — so seven overlays were in the registry by
  // NAME only and contributed nothing to `overlaps`/`overflow`. That is how §129.52 (the stat card
  // drawn on top of the pie panel) sat under a green overlaps=0 and had to be found by eye.
  // A `boxFn` returning a real box (w>1 && h>1) registers THAT instead. No boxFn, or a degenerate
  // box, keeps the placeholder exactly as before — and the `alpha > 0` guard ("a drawer that painted
  // nothing must not register a rect") still gates both cases, unchanged.
  // ══ §ESCAPE_ROUTE_HUD_SUPPRESS — the overlays that CEASE while the escape route has the frame ══
  // red1, 2026-09-20 after seeing the clip: "While Escape Route, the other overlays have to cease.
  // Their work is sufficient and allowed full focus on EscRoute mgmt." — then, on being asked which:
  // "I don't mean the clock Sun stuff as it's needed.. I meant the Sanity and clashes".
  // WHAT CEASES: every `measure.*` layer and every `clash.*` layer — datum, cues, linear, slab,
  // indoor, flyout, rulefindings, box, and the clash labels with their counts. All of it is
  // FINDINGS signage about other rules, and the escape route is itself a findings beat — two
  // rulebooks arguing in one frame is the crowding he is reacting to.
  // WHEN: from two seconds before the STOREY REVEAL opens (red1: "off when the storey reveal
  // starts" plus "give 2 more secs back to see other overlays going off") through to the end of
  // the film, covering the escape beat with it. Both triggers feed the one decision below.
  // WHAT STAYS: the sun clock, the sun-compass readout, the day counter, the path box and the pie.
  // ⚠ THIS IS NOT THE RETIRED GATE'S LIST — it is very nearly its inverse. The old `_hudGate()`
  // cleared the sun clock, the compass readout, the path box and the pie, which are exactly the
  // four red1 now says are needed. Only the SHAPE of that mechanism is reused.
  // A._escRouteHudSuppress is set and maintained by cpe_escape_route.js — it is how the module
  // reports "my window is open" — so this gate reads a flag that already exists rather than adding
  // a second trigger. Gated in the one wrapper both layers already pass through, so there is a
  // single place that decides and a witness can assert it by name.
  // A PREDICATE, NOT A LIST. red1: "cease those overlays during ending orbit, as user has seen
  // enough" — Measure, Sanity and clashes, from the onset of the storey reveal.
  // The first cut named two layers of nine and was correct only by luck: the stale "Floor area"
  // box red1 chased all morning is `measure.box`, which was NOT in that list and went quiet only
  // because §SLAB_LABEL_STALE cleared its source. A named list also invites the tenth layer to
  // arrive by accident rather than by decision, which is exactly how §75 rotted into a half-fix.
  // Nothing in the closing orbit carries NEW measurement — every beat feeding these layers runs
  // earlier — so ceasing the whole family costs no live information.
  var ESC_SUPPRESS_RX = /^(measure\.|clash\.)/;
  // ══ THE OTHER HALF: WHAT THESE BEATS DRAW **ON THE BUILDING** ═══════════════════════════════
  // red1, 2026-09-20, after watching the 12:25 clip: "Make the overlay shine thru of beams cease
  // then. They are showing and disturbing the scene which now has other new stuff to do ie Storey
  // Reveal and then EscRoute. Even if not, it can just go on for 2 secs and no more as user has
  // seen enough and wana enjoy the finale of whole landed building."
  // THE GATE ABOVE ONLY EVER COVERED THE 2D HALF. `measure.datum` stopped drawing its chip and
  // §FINDINGS_CEASE said so — while `flythruDatumAt` kept setting `_grp.visible` from its OWN life
  // curve every frame, so the datum's depthTest:false uprights and storey bands went on shining
  // through the building to the final frame. The chips ceasing made that MORE obvious, not less:
  // the geometry was left with nothing to explain it.
  // ⚠ THE GATE IS A PREDICATE, NOT A LIST (2026-09-20). It used to hide four names —
  // flythruDatum, flythruCue, indoorBeats, slabBeat — and red1 watched a clip that CONTAINED that
  // fix and said "the glow thru beams still persists!". A list of four can never catch the fifth,
  // and the honest answer to "what else is still drawing?" is not to go and measure it: it is to
  // stop the code emitting. red1: "why such measures? It is GIGO.. if u dont stop the code from
  // emitting."
  // So the rule is now the DRAW CONTRACT itself. Shining through the building is what
  // `depthTest:false` MEANS in this viewer — cpe_flythru_dims.js states it as A.FLYTHRU_DRAW_CONTRACT
  // and clash_film.js, cpe_slab_beat.js, cpe_flythru_cues.js, cpe_flythru_datum.js, ghostglass.js,
  // grid_contours.js, grid_door_arcs.js, grid_dim_chains.js and hba_lens.js all use it. From the
  // moment the closing beats open, ANY object in the scene drawing under that contract is switched
  // off, whoever added it and whether or not anybody remembered it exists. A tenth module added
  // next month is covered the day it lands.
  // Building geometry is never depthTest:false, so nothing the film is ABOUT is reachable by this.
  // ONE EXEMPTION, and it is the beat that is actually on screen: the escape route's own room glow
  // is depthTest:false by design (cpe_escape_route.js §ESCAPE_ROUTE_NO_XRAY — "the room glow is
  // depthTest:false, so [it] still read[s] through the building"), so a blind sweep would switch
  // off the very thing the closing orbit exists to show. It is exempt BY NAME, it disposes itself
  // at beat exit, and W-CEASE asserts there is exactly one exemption and that it is that beat's.
  // HIDDEN, NEVER DISPOSED — each beat's own `.visible` returns the moment the gate lifts, the same
  // non-destructive shape clashFilm.setVisible already uses.
  // TWO ARMS, because they catch different things and the union is what red1 asked for.
  // ARM 1 — the NAMES. A beat's group can hold parts that depth-test normally (cpe_indoor_beats'
  // hall tint is painted ON the floor and shines through nothing), and those are still "an overlay
  // on the building" under his rule — "Its last second is like a finale. It should not have any
  // overlay on the building." A predicate on the draw contract alone would leave them on.
  // ARM 2 — the CONTRACT. The names can only ever cover beats somebody remembered; arm 2 covers
  // every module that shines through, including the ones nobody has thought of yet.
  // ══ §FILM_LAYER — ONE SWITCH PER LAYER, AND THE SAME SWITCH FOR ITS 2D AND ITS 3D ════════════
  // red1, 2026-09-20: "it be good to control each layer thru a proper mechanism."
  // THE DEFECT THIS REPLACES. A film layer had TWO unrelated controls. Its chip was drawn through
  // `_drawUnlessHold(name, ...)` and gated by `_escSuppresses(name)`; its GEOMETRY was a group the
  // module added to A.scene and drove from its own life curve, consulting nothing. So the gate
  // could report `§FINDINGS_CEASE layer=measure.datum` truthfully while the datum's uprights went
  // on shining through the building, and the master flag `A._flythruDatumOn` — which appears only
  // in the 2D chain of this file — could not reach them either. Two halves of one layer, two
  // switches, and only one of them wired to the rule.
  // THE MECHANISM. A module registers whatever it puts in the scene under the SAME layer name its
  // 2D half already uses:  A.filmLayer('measure.datum', _grp).  From then on one predicate governs
  // both halves: `_escSuppresses(name)` decides the chip AND the geometry, on the same frame, for
  // the same reason. A layer cannot half-cease any more, because there is no second switch left to
  // forget.
  // IT ONLY EVER SUPPRESSES. The gate writes `visible = false` and never `true`, so a beat's own
  // life curve still owns when it appears — the registry takes nothing over, it only takes away.
  // The name is the contract: anything not matching /^(measure\.|clash\.)/ is simply never gated,
  // which is why the sun clock, the compass and the day counter need no exemption.
  // ⚠ THIS SCOPE HAS NO `A`. cinema_maxq.js is a bare IIFE — every function inside it opens with
  // its own `var A = window.APP`. An `A.filmLayer = ...` written here reads an undeclared `A` at
  // MODULE LOAD, throws, and the module never finishes loading: the bake then sits at
  // §IDLE_GATE park forever with no error that names the cause. `node --check` passes it, because
  // an undeclared READ is valid syntax — the same trap that ate `var _tnFilm` in §129.61.
  // So the registry is a local function here and is ATTACHED to APP below, where A exists.
  function _filmLayerRegister(name, obj) {
    var A2 = window.APP;
    if (!A2 || !name || !obj) return obj;
    A2._filmLayers = A2._filmLayers || [];
    obj.userData = obj.userData || {};
    obj.userData.filmLayer = name;            // the sweep reads this to NAME an offender
    for (var i = 0; i < A2._filmLayers.length; i++) if (A2._filmLayers[i].obj === obj) return obj;
    A2._filmLayers.push({ name: name, obj: obj });
    console.log('§FILM_LAYER registered layer="' + name + '" object="' + (obj.name || obj.type) +
      '" — its 2D half and its geometry now cease on one rule');
    return obj;
  }
  function _ceaseRegistered() {
    var A2 = window.APP; if (!A2 || !A2._filmLayers) return 0;
    var n = 0;
    for (var i = 0; i < A2._filmLayers.length; i++) {
      var e = A2._filmLayers[i];
      if (!e.obj || !e.obj.visible) continue;
      if (!_escSuppresses(e.name)) continue;
      e.obj.visible = false; n++;
      A2._cease3DSeen = A2._cease3DSeen || {};
      if (!A2._cease3DSeen[e.name]) {
        A2._cease3DSeen[e.name] = 0;
        console.log('§FINDINGS_CEASE_3D layer="' + e.name + '" object="' + (e.obj.name || e.obj.type) +
          '" hidden by its OWN layer switch — the same rule that stopped its chip, on the same frame');
      }
      A2._cease3DSeen[e.name]++;
    }
    return n;
  }
  var CEASE_3D_GROUPS = ['flythruDatum', 'flythruCue', 'indoorBeats', 'slabBeat'];
  var CEASE_3D_EXEMPT_RX = /^escapeRouteGlow/;
  function _ceaseOwnerName(o) {
    // The OUTERMOST named ancestor: the nearest one is usually an anonymous mesh, and what the log
    // has to name is the MODULE that put this in the scene.
    var owner = '', p = o, hops = 0;
    while (p && hops++ < 32) { if (p.name) owner = p.name; p = p.parent; }
    return owner || ('(unnamed ' + (o.type || 'Object3D') + ')');
  }
  function _ceaseLayerTag(o) {
    // A registered ancestor is what names this object. Walked upward, because a module registers
    // its GROUP and the material that shines through is on a mesh several levels down.
    var p = o, hops = 0;
    while (p && hops++ < 32) { if (p.userData && p.userData.filmLayer) return p.userData.filmLayer; p = p.parent; }
    return null;
  }
  function _ceaseShinesThrough(o) {
    var m = o.material; if (!m) return false;
    var mats = Array.isArray(m) ? m : [m];
    for (var i = 0; i < mats.length; i++) if (mats[i] && mats[i].depthTest === false) return true;
    return false;
  }
  function _cease3D() {
    var A2 = window.APP;
    if (!A2 || !A2.scene || !A2._findingsHudSuppress) return;
    var hidNow = 0, kept = 0, unreg = 0, fresh = [];
    A2._cease3DSeen = A2._cease3DSeen || {};
    // ══ §RULE_TINT_CEASE — THE STRUCTURAL SANITY OVERLAY COMES DOWN ═════════════════════════════
    // red1, repeatedly: "the overlay of Sanity Structural/Safety still lingering in the building",
    // "those yellow beams were appearing during the Structural Sanity from first seconds".
    // WHAT IT IS, read in the source, not guessed. rule_findings_film.js:367 calls
    // A.showRuleModeTint(...{shineThrough:true}) while the Sanity beat runs. rule_checklist.js:518
    // builds one InstancedMesh per colour of translucent boxes over every flagged element and
    // A.scene.add()s them (:587) — `§RULE_TINT_ENTER elements=390 colors=2 shineThrough=true
    // renderOrder=900 depthTest=false` in every bake log. Those are the yellow cages on the beams.
    // WHY THEY NEVER LEFT. The only teardown is A.exitRuleModeTint (rule_checklist.js:649) and its
    // ONLY caller in the whole viewer was showRuleModeTint itself (:520), replacing a previous
    // tint. The film never called it. The single per-frame control it had was
    // A.ruleTintShowOnly(show) — which does not hide anything, it zero-scales the instances NOT in
    // `show` — and that call lives inside A.ruleFindingsFilmCompositeOntoCanvas, which is drawn
    // through _drawUnlessHold('measure.rulefindings', ...). So when the cease switched that layer
    // off, the one hand that was scaling the boxes each frame stopped, and they FROZE at full size
    // on the building to the final frame. Ceasing the chip is what made the boxes permanent.
    // ⚠ NOTHING HERE TOUCHES THE STOREY REVEAL'S TINT. That is a different mechanism in a
    // different module (cpe_storey_reveal.js _applyTint/_restoreTint recolours the building's OWN
    // materials) with its own restore, and it is not in scope.
    // This teardown is DESTRUCTIVE where the rest of the gate only hides — on purpose: it is the
    // module's own exit, it disposes its meshes and it puts the flagged elements' real geometry
    // back, which is what the finale needs. One shot, guarded by _ruleTintActive.
    if (A2._ruleTintActive && typeof A2.exitRuleModeTint === 'function') {
      var _rtMeshes = (A2._ruleTintMeshes || []).length;
      var _rtHidden = A2.collectMeshes
        ? A2.collectMeshes(function (o) { return o.userData && o.userData._ruleTintHidden; }).length : -1;
      try { A2.exitRuleModeTint(); } catch (eRT) { console.log('§RULE_TINT_CEASE threw: ' + eRT.message); }
      var _rtLeft = (A2._ruleTintMeshes || []).length;
      var _rtStill = A2.collectMeshes
        ? A2.collectMeshes(function (o) { return o.userData && o.userData._ruleTintHidden; }).length : -1;
      var _rtOk = (_rtLeft === 0 && _rtStill === 0 && !A2._ruleTintActive);
      console.log('§RULE_TINT_CEASE removed=' + _rtMeshes + ' tint meshes, restored=' + _rtHidden +
        ' flagged elements — left=' + _rtLeft + ' stillHidden=' + _rtStill +
        ' active=' + (!!A2._ruleTintActive) + ' => ' + (_rtOk ? 'PASS' : 'FAIL') +
        ' (the Structural Sanity boxes; NOT the storey reveal tint, which is cpe_storey_reveal.js)');
    }
    // ARM 0 — §FILM_LAYER. Every layer that registered its geometry ceases on its OWN switch, the
    // same one that stops its chip. This is the mechanism; the two arms below are the safety net
    // for anything that has not been wired to it yet.
    hidNow += _ceaseRegistered();
    // ARM 1 — the named beat groups, whole, whatever their materials do.
    for (var g = 0; g < CEASE_3D_GROUPS.length; g++) {
      var go = A2.scene.getObjectByName ? A2.scene.getObjectByName(CEASE_3D_GROUPS[g]) : null;
      if (!go || !go.visible) continue;
      go.visible = false; hidNow++;
      if (!A2._cease3DSeen[CEASE_3D_GROUPS[g]]) { A2._cease3DSeen[CEASE_3D_GROUPS[g]] = 0; fresh.push({ n: CEASE_3D_GROUPS[g], by: 'named beat group' }); }
      A2._cease3DSeen[CEASE_3D_GROUPS[g]]++;
    }
    // ARM 2 — everything else still drawing under the shine-through contract.
    try {
      A2.scene.traverseVisible(function (o) {
        if (!_ceaseShinesThrough(o)) return;
        var owner = _ceaseOwnerName(o);
        if (CEASE_3D_EXEMPT_RX.test(owner) || CEASE_3D_EXEMPT_RX.test(o.name || '')) { kept++; return; }
        // A registered object names itself. Anything the net catches WITHOUT a layer name is a
        // layer nobody wired to the mechanism — the log says so in those words, so the next person
        // reads a defect rather than "(unnamed Sprite)" and a mystery.
        var tag = _ceaseLayerTag(o);
        if (!tag) {
          unreg++;
          // FINGERPRINT, not a guess. An unregistered offender has no layer name by definition, so
          // the line has to carry enough to identify the module that made it without a second bake:
          // the ancestor chain, the renderOrder (clash_film uses 998/999, the escape glow 1004/1005,
          // the flythru contract 900) and the material's own colour.
          var chain = [], pc = o, ch = 0;
          while (pc && ch++ < 6) { chain.push((pc.name || pc.type)); pc = pc.parent; }
          var m0 = Array.isArray(o.material) ? o.material[0] : o.material;
          tag = 'UNREGISTERED ' + owner + ' {' + chain.join('<') + ' renderOrder=' + (o.renderOrder || 0) +
                ' mat=' + ((m0 && m0.type) || '?') +
                ((m0 && m0.color && m0.color.getHexString) ? ' #' + m0.color.getHexString() : '') + '}';
        }
        o.visible = false; hidNow++;
        if (!A2._cease3DSeen[tag]) { A2._cease3DSeen[tag] = 0; fresh.push({ n: tag, by: 'depthTest:false draw contract (the net, not a switch)' }); }
        A2._cease3DSeen[tag]++;
      });
    } catch (eC3) { console.log('§FINDINGS_CEASE_3D sweep threw: ' + eC3.message); return; }
    for (var f = 0; f < fresh.length; f++) {
      console.log('§FINDINGS_CEASE_3D group="' + fresh[f].n + '" hidden, found by the ' + fresh[f].by +
        ' — it was drawing ON the building, which the 2D gate never reached. Hidden, not disposed:' +
        ' the beat\'s own visibility returns the moment the gate lifts.');
    }
    // ONE line per CHANGE, never one per frame: in steady state the sweep finds the same objects
    // every frame and a log that repeated 193 times would drown the run it is meant to explain.
    var keptFirst = (kept > 0 && !A2._cease3DKeptSeen);
    if (keptFirst) A2._cease3DKeptSeen = 1;
    if (!fresh.length && !keptFirst) return;
    console.log('§FINDINGS_CEASE_3D sweep hid=' + hidNow + ' exempt=' + kept +
      ' unregistered=' + unreg + ' (exempt is the live beat\'s own glow; unregistered>0 means a' +
      ' layer is still relying on the net instead of its own switch) layers=[' +
      Object.keys(A2._cease3DSeen).join(' | ') + ']');
  }
  function _escSuppresses(name) {
    var A2 = window.APP;
    if (!A2 || !ESC_SUPPRESS_RX.test(name)) return false;
    // TWO triggers, ONE decision. `_escRouteHudSuppress` is the escape route's own window;
    // `_findingsHudSuppress` opens two seconds before the storey reveal and does not close, so the
    // chips cannot flash back on in the ~1.2 s gap between beats.rise and the escape window.
    return !!(A2._escRouteHudSuppress || A2._findingsHudSuppress);
  }
  // W2 — the top row the load-path card covers, name -> its LastBox prop. A yielding member keeps its last drawn box as the
  // row's reservation (nothing drawn), so the panels below do not ride up under the card on the arm frame.
  var _HUD_ROW = { 'hud.pathmap': 'pathOverviewLastBox', 'daycounter': 'dayCounterLastBox', 'suncompass.clock': 'sunClockLastBox', 'suncompass.readout': 'sunReadoutLastBox' };
  function _drawUnlessHold(name, fn, boxFn) {
    var A2 = window.APP;
    if (A2 && A2._hudRowYield && _HUD_ROW[name]) { A2[_HUD_ROW[name]] = (A2._hudRowKeep || {})[name] || null;
      if (!A2._hudCompositeAlphaSample) A2._hudCompositeAlphaSample = {}; A2._hudCompositeAlphaSample[name] = 0; return; }
    // Suppressed overlays register a 1x1 placeholder exactly as an absent box does, so §HUD_LAYOUT
    // still has a row for them and _rowAdvance reads a zero-size box — the row collapses and the
    // card below gets the space, which is the point of ceding the frame.
    if (_escSuppresses(name)) {
      if (A2) {
        if (A2._hudLayoutRegister) A2._hudLayoutRegister(name, 0, 0, 1, 1);
        if (!A2._hudCompositeAlphaSample) A2._hudCompositeAlphaSample = {};
        A2._hudCompositeAlphaSample[name] = 0;
        A2._escSuppressedThisFrame = (A2._escSuppressedThisFrame || 0) + 1;
        // §FINDINGS_CEASE — the bake SAYS this happened, once, naming the layers and the trigger.
        // red1 asked for it in as many words: "WITNESS logging must be present for those big
        // request ie ceasing of M/C/S overlays during storey reveal start." A gate that is only
        // provable by a node witness is not provable from the film that shipped.
        A2._ceaseSeen = A2._ceaseSeen || {};
        if (!A2._ceaseSeen[name]) {
          A2._ceaseSeen[name] = 1;
          console.log('§FINDINGS_CEASE layer=' + name + ' ceased' +
            ' trigger=' + (A2._escRouteHudSuppress && !A2._findingsHudSuppress ? 'escape-route-window'
              : (A2._findingsHudSuppress ? 'storey-reveal-onset' : 'unknown')) +
            ' — Measure/Sanity/clash signage stands down for the closing movement (red1: "cease' +
            ' those overlays during ending orbit, as user has seen enough"). Layers ceased so far=' +
            Object.keys(A2._ceaseSeen).length);
        }
      }
      return;
    }
    var forced = !!window.__lpNoFocusHold;
    var alpha = forced ? 1 : ((A2 && A2._loadPathHudAlpha != null) ? A2._loadPathHudAlpha : 1);
    var ctx2 = A2 && A2._captureCtx;
    var faded = ctx2 && alpha < 1;
    if (faded) { ctx2.save(); ctx2.globalAlpha = ctx2.globalAlpha * alpha; }
    // ROUND 13 item C — `alpha` is now handed to `fn` itself: several compositors this wraps
    // (resourcePanel/bigStats/dayCounter/pathOverview/flythruCues) take their OWN `opacity`
    // parameter and set `ctx.globalAlpha` straight from it, an ABSOLUTE assignment that silently
    // clobbers the ambient `ctx2.globalAlpha *= alpha` set just above — those call sites now pass
    // `alpha` through instead of a hardcoded `1`, so the SAME number governs both.
    // ROUND 16 item 2 — `_inHudFadeWrapper` is true only while GENUINELY faded (`faded`, not just
    // "inside this function"): under `window.__lpNoFocusHold=1`, `alpha` is pinned to 1 so `faded`
    // is false here too, and the draws below are correctly left UNEXCLUDED from the frame-truth
    // count — the control's own proof.
    if (A2) { A2._inHudFadeWrapper = faded; A2._drawUnlessHoldCurrentName = name; }
    fn(alpha);
    if (A2) { A2._inHudFadeWrapper = false; A2._drawUnlessHoldCurrentName = null; }
    if (faded) ctx2.restore();
    if (alpha > 0 && A2 && _HUD_ROW[name] && A2[_HUD_ROW[name]]) (A2._hudRowKeep = A2._hudRowKeep || {})[name] = A2[_HUD_ROW[name]];   // W2 row reservation
    if (alpha > 0 && A2 && A2._hudLayoutRegister) {
      // §129.55 A — the drawer's own published rect when it has one, read AFTER fn() so it is this
      // frame's, never a neighbour's. try/catch for the same never-kills-a-bake contract every
      // other optional HUD read here keeps.
      var _rb = null;
      if (boxFn) { try { _rb = boxFn(); } catch (eRB) { _rb = null; } }
      A2._hudRegAlpha = alpha;   // W2 — the overlap judge needs to know a fading box from a solid one
      if (_rb && _rb.w > 1 && _rb.h > 1) A2._hudLayoutRegister(name, _rb.x, _rb.y, _rb.w, _rb.h);
      else A2._hudLayoutRegister(name, 0, 0, 1, 1);
      A2._hudRegAlpha = null;
    }
    // ROUND 13 item C — record the alpha THIS call actually used, per layer name, per frame (reset
    // every frame in _captureFrame alongside A._hudLayoutRects) — the real number the §LOADPATH_
    // HUD_FADE witness now reads, instead of re-deriving one from the formula alone.
    if (A2) { if (!A2._hudCompositeAlphaSample) A2._hudCompositeAlphaSample = {}; A2._hudCompositeAlphaSample[name] = alpha; }
  }
  // §129.1 FREEZE bridge, published for OTHER lanes (georef/sun-compass, bim-ootb#1751/#1752):
  // main's own `_hudHold` reads this off window and falls back to drawing at full opacity when it
  // is absent, so the compass/clock overlays respect the load-path freeze the moment this branch
  // merges — no edit needed on their side. One line, beside the definition, as they asked.
  if (typeof window !== 'undefined') window.__drawUnlessHold = _drawUnlessHold;

  // ══ §HUD_SCALE (2026-09-19) — ONE sizing law for every bake overlay ═════════════════════════
  // red1, after watching the same film at 854x480 and 1920x1080: "it's too big in low res and too
  // small in hi res". Every overlay in this viewer sized itself as a CONSTANT FRACTION of frame
  // height, which keeps text the same PROPORTION at every resolution — and proportion is not
  // legibility. A 480-tall frame carries little scene detail, so a 2.6% caption dominates it; a
  // 2160-tall frame is dense, and the same 2.6% vanishes into it. Constant pixels are worse in the
  // other direction, which is the trap `13 * k` fell into with its 1.6 ceiling (§129.36).
  // So the FRACTION ITSELF rises with resolution — gently, as h^0.35 about a 1080 anchor, and
  // clamped at both ends so no resolution can run away:
  //     480 -> 1.96% of frame height   720 -> 2.26%   1080 -> 2.60%   1440 -> 2.87%   2160 -> 3.17%
  //   (for the 0.026 family; every caller keeps its own 1080 anchor, so their RELATIVE sizes —
  //    counter against readout against clock caption — are exactly as they were tuned.)
  // Published on `window` rather than `A` for the same reason `__drawUnlessHold` is: this IIFE runs
  // at script load, when window.APP may not exist yet, and every caller reads it at DRAW time.
  // Each caller falls back to its own old formula when this is absent, so a page that loads an
  // overlay without cinema_maxq still draws.
  function _hudFontPx(h, k1080, minPx) {
    var hh = h || 1080;
    var k = k1080 * Math.pow(hh / 1080, 0.35);
    var lo = k1080 * 0.70, hi = k1080 * 1.22;
    if (k < lo) k = lo; else if (k > hi) k = hi;
    return Math.max(minPx || 9, Math.round(hh * k));
  }
  if (typeof window !== 'undefined') window.__hudFontPx = _hudFontPx;
  // §129.1 FREEZE bridge, RESOLVED SIDE (merge of origin/main, 2026-09-19). The sun-compass lane
  // built against a main with no freeze beat, so it called this through `window.__drawUnlessHold`
  // with a "draw at full opacity" fallback. Both lanes now live in THIS file, so the indirection is
  // gone: `_hudHold` is the real wrapper, called directly. The window publish above stays for any
  // other lane still building against main.
  function _hudHold(name, fn, boxFn) { return _drawUnlessHold(name, fn, boxFn); }   // §129.55 B — must forward boxFn; suncompass.clock/readout go through here
  // ══ §FRAME_COST (2026-09-19, LARGE_DB_BAKE.md §8.2 item 1) — is this frame paying for the
  // MODEL or for ITSELF? ════════════════════════════════════════════════════════════════════════
  // red1: "study how to reduce hi element DB as a frame is only a limited set". MEASURED at
  // identical settings on 2026-09-19: HHS (6,880 elements) 0.54 s/frame, Terminal (48,428) 0.86,
  // LTU (122,330) 2.55 — and within ONE LTU bake the rate went 0.64 -> 2.75 s/frame as the buildup
  // filled the scene in. Cost tracks what the scene HOLDS. What no log has ever said is how much
  // of that the renderer was ALREADY throwing away, and that single number decides whether culling
  // work is worth anything at all: if `drawn` is already a small fraction of `held`, the cost is
  // somewhere else and §8.3's levers are dead on arrival. So this is measured BEFORE anything is
  // built, and it is allowed to kill the idea.
  //
  // Cheap by construction: it runs only on the frames §MAXQ_FRAME already logs (throttled to
  // MAXQ_LOG_MS), never per frame, so the measurement cannot distort what it measures.
  // `calls`/`triangles` are three.js's own per-render counters and describe the LAST render of the
  // still-refine burst, not the sum of all 20 — the burst multiplies whatever this number is.
  function _logFrameCost(i, nFrames, perFrameMs) {
    try {
      var A2 = window.APP;
      if (!A2 || !A2.scene || !A2.camera || typeof THREE === 'undefined') return;
      var held = 0, vis = 0, inFrustum = 0, instanced = 0, instancedCount = 0;
      var cam = A2.camera;
      cam.updateMatrixWorld();
      var _m = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      var _fr = new THREE.Frustum().setFromProjectionMatrix(_m);
      var _sph = new THREE.Sphere();
      A2.scene.traverse(function (o) {
        if (!o.isMesh && !o.isInstancedMesh) return;
        held++;
        if (o.isInstancedMesh) { instanced++; instancedCount += (o.count || 0); }
        if (!o.visible) return;
        // a hidden ancestor hides this too — `visible` alone would over-count
        for (var p = o.parent; p; p = p.parent) { if (!p.visible) return; }
        vis++;
        var g = o.geometry;
        if (!g) return;
        if (!g.boundingSphere) { try { g.computeBoundingSphere(); } catch (e) { return; } }
        if (!g.boundingSphere) return;
        _sph.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
        if (_fr.intersectsSphere(_sph)) inFrustum++;
      });
      var inf = (A2.renderer && A2.renderer.info && A2.renderer.info.render) || null;
      var pct = function (a, b) { return b ? (100 * a / b).toFixed(1) : '0.0'; };
      console.log('§FRAME_COST i=' + i + '/' + nFrames + ' perFrameMs=' + Math.round(perFrameMs) +
        ' held=' + held + ' visible=' + vis + ' inFrustum=' + inFrustum +
        ' frustumPct=' + pct(inFrustum, vis) + '%ofVisible' +
        ' instancedMeshes=' + instanced + ' instances=' + instancedCount +
        ' (W7: lastRenderCalls dropped — it read whichever render ran last; per-frame scene calls are in §F calls=)' +
        ' — frustumPct is the number that decides LARGE_DB_BAKE.md §8: high means the renderer is' +
        ' already submitting most of the model every frame and culling is worth building; low means' +
        ' it is culling well already and the cost is elsewhere.');
    } catch (e) {
      if (!window.__frameCostWarned) { window.__frameCostWarned = true;
        console.warn('§FRAME_COST unavailable: ' + (e && e.message) + ' — measurement only, bake unaffected'); }
    }
  }
};
