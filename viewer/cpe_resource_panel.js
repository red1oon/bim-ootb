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
  // §CPE_PIE_HOLD — how far a HELD composition (one from a past day) is dimmed. It stays
  // legible, but a viewer can see at a glance that it is not today's crew.
  var HELD_DIM = 0.60;

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
    // §129.5 COST ODOMETER — stash the same real ops/window this call already validated, so the
    // odometer (drawn from resourcePanelCompositeOntoCanvas, which only ever receives `info`, never
    // these raw args) can compute "placed n/N" and derive a cursor from `info.progress` without a
    // second query and without changing this function's or the composite function's own signature.
    A._resPanelOps = ops; A._resPanelProjectStart = projectStartMs; A._resPanelProjectEnd = projectEndMs;
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

  // §129.7 item 8c (2026-09-16, user on the Terminal clip: cost/ledger rows must be PINNED to the
  // panel's bottom edge, never appended after the resource list — "the running new line should also
  // stay absolute bottom row as appending to the resource changing height makes it jumps up and
  // down") — the panel's HEIGHT must therefore be sized ONCE, at build, for the LONGEST resource
  // list the whole schedule can ever show (the distinct-trade count `info.rows.length`), never
  // per-frame off whatever happens to be active. `A.resourcePanelAt` already receives no other
  // caller than cinema_maxq.js's own per-frame call, so this file has no independent "the whole
  // schedule" hook of its own — but `A.resourcePanelAt` already stashes the real `ops`/window on
  // `A._resPanelOps`/`A._resPanelProjectStart`/`A._resPanelProjectEnd` on every call (§129.5 COST
  // ODOMETER's own comment above), so the FIRST real frame call is enough to scan the rest. Sampled
  // at the SAME cadence `bigStatsBuild`'s own peak-workforce scan uses (a handful of samples across
  // the whole programme, never per-frame) and memoized for the life of the page/bake — one scan,
  // however many frames follow.
  var _maxResourceRows = null;
  function _scanMaxResourceRows() {
    if (_maxResourceRows != null) return _maxResourceRows;
    var ops = A._resPanelOps, ps = A._resPanelProjectStart, pe = A._resPanelProjectEnd;
    var maxN = 0;
    if (ops && ops.length && pe > ps) {
      var totalDays = Math.ceil((pe - ps) / MS_PER_DAY);
      var step = Math.max(1, Math.floor(totalDays / 60));
      for (var d = 0; d < totalDays; d += step) {
        var info = A.resourcePanelAt(ps + d * MS_PER_DAY, ops, ps, pe);
        if (info && info.rows && info.rows.length > maxN) maxN = info.rows.length;
      }
    }
    _maxResourceRows = maxN;
    return _maxResourceRows;
  }
  // Exposed for a direct node dry run (no THREE/DOM/Chrome needed — a plain {rows:[...]} stub for
  // A.resourcePanelAt is enough), and so a fresh bake/test can force a re-scan.
  A._resourcePanelScanMaxRows = _scanMaxResourceRows;
  A._resourcePanelResetMaxRowsCache = function () { _maxResourceRows = null; };

  // ══ §129.5 COST ODOMETER (MEP_CLASH_REVEAL_MOVIE.md §129.5) ═══════════════════════════════════
  // "just adding a small figure next to the resource chart HUD" — cost to date + crew-hours to
  // date, fed by the schedule's OWN rate model. NON-INVENT: T=A._hrCost.total / H=A._hrCost.personDays
  // (§HR_COST, time_machine.js — crew-days x crew_size x rate_per_day, the schedule's own labour
  // content) are taken VERBATIM, never re-summed here — a day-by-day re-derivation via this file's own
  // capped-crew arithmetic (resourcePanelAt) is a DIFFERENT quantity (deployed-crews-per-calendar-day,
  // capped) from _hrTotal's (total work content, uncapped) and would not reconcile with it, which is
  // exactly the "second opinion about the schedule's own labour content" cpe_resource_panel.js's own
  // header already forbids for the client-facing 5D cards. Instead the RUNNING "to date" value is
  // that SAME total, time-phased by the elapsed-programme fraction resourcePanelAt() already computes
  // (`progress` — the identical fraction the progress ring already draws) — reconciling with T/H
  // EXACTLY at progress=1 BY CONSTRUCTION, with no second cost model that could ever disagree.
  // "placed n/N" is a real, separate, non-invented count: schedule ops with a start time at or before
  // the cursor, out of the whole ops array, tracked with a FORWARD-ONLY pointer (ops are sorted by
  // start_ts — the same assumption resourcePanelAt's own early-break already relies on) so a full
  // bake's cost is O(ops.length) total, never O(ops.length x days).
  var _coPtr = 0, _coPtrOps = null;
  function _placedCount(cursorMs, ops) {
    if (!ops || !ops.length) return { n: 0, N: 0 };
    if (ops !== _coPtrOps) { _coPtrOps = ops; _coPtr = 0; }   // a different ops array (new bake) resets the pointer
    while (_coPtr < ops.length && ops[_coPtr].s <= cursorMs) _coPtr++;
    return { n: _coPtr, N: ops.length };
  }
  // Pure — same discipline as resourcePanelAt. `progress` (0..1) is normally the caller's own
  // already-computed elapsed-programme fraction (never re-derived from cursorMs when supplied).
  A.costOdometerAt = function (cursorMs, ops, projectStartMs, projectEndMs, progress) {
    var HC = A._hrCost;
    if (!HC || !(HC.total > 0)) return null;   // §129.5 DO NOT: show a figure with no costs
    var LR = _rates();
    var basisHrs = (LR && LR._productivity_basis_secs) ? LR._productivity_basis_secs / 3600 : 8;
    var T = HC.total, H = +(HC.personDays * basisHrs).toFixed(1);
    var p = (progress != null) ? Math.max(0, Math.min(1, progress))
      : (projectEndMs > projectStartMs ? Math.max(0, Math.min(1, (cursorMs - projectStartMs) / (projectEndMs - projectStartMs))) : 1);
    var pc = _placedCount(cursorMs, ops);
    return { day: (projectStartMs != null && cursorMs != null) ? Math.floor((cursorMs - projectStartMs) / MS_PER_DAY) + 1 : null,
             placed: pc.n, total: pc.N, costToDate: Math.round(T * p), hoursToDate: +(H * p).toFixed(1),
             grandCost: T, grandHours: H, progress: p };
  };
  // §129.6 item 6b (2026-09-15) SUPERSEDES the earlier free-floating placement: Cost sits DIRECTLY
  // ABOVE Ledger, BOTH as rows of THIS panel (drawn by _pieCostLedgerRows below, called from
  // A.resourcePanelCompositeOntoCanvas right after the trade list, same column/font/row cadence),
  // gated by A._costOdometerOn/A._pieLedgerOn (the "4D/5D" toggle, not Measure). Space-grouped
  // thousands ("801 577", not "801,577") per the ruling's own row examples.
  function _spaceThousands(n) {
    var s = String(Math.round(n)), neg = s.charAt(0) === '-';
    if (neg) s = s.slice(1);
    s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return (neg ? '-' : '') + s;
  }
  var _coLoggedInconclusive = false, _coLastLoggedDay = null, _coFinalFired = false, _coLastOd = null;
  // §HUD FIX (2026-09-15, after a real HHS bake showed 8 §COST_ODOMETER day= lines but NO
  // §COST_ODOMETER_FINAL at all): this logic used to run ONLY from inside the DRAW path
  // (_costRowText, called from _pieCostLedgerRows, called from resourcePanelCompositeOntoCanvas) —
  // but that function STOPS being called once the film enters the Reveal/stats round (§CPE_STATS_TAIL:
  // `_resInfo` is only set in the `!_inReveal` branch), which can happen at/around the SAME moment
  // `info.progress` crosses 1.0 — a race that left "the last buildup frame" landing on a frame the
  // panel never drew. Split: A.costOdometerTick(info) is the LOGIC+LOGGING half, called EVERY FRAME
  // from cinema_maxq.js's own resourcePanelHoldAt site — which already runs unconditionally,
  // regardless of `_inReveal` — so the witness fires whether or not the panel is on screen this
  // frame. `_costRowText()` (below) is now PURE DRAWING: it only ever reads the cached `_coLastOd`,
  // never recomputes or re-triggers a witness.
  A.costOdometerTick = function (info) {
    var HC = A._hrCost;
    if (!HC || !(HC.total > 0)) {
      if (!_coLoggedInconclusive) { _coLoggedInconclusive = true; console.log('§COST_ODOMETER INCONCLUSIVE reason=norates'); }
      return;
    }
    var projectStartMs = A._resPanelProjectStart, projectEndMs = A._resPanelProjectEnd, ops = A._resPanelOps;
    var trueP = (info && info.progress != null) ? info.progress : 0;   // the REAL, unfrozen elapsed fraction
    var atEnd = trueP >= 0.999999;
    var frozen = !!window.__coFreeze;
    // Control window.__coFreeze=1 (§129.5): the ODOMETER stops updating at day 1 while the REAL
    // film keeps going — `atEnd` below still fires at the true topout (driving the FINAL check at
    // the right moment), but the value it checks stays wrong, which is the intended FAIL.
    var displayP = frozen
      ? (projectEndMs > projectStartMs ? Math.max(0, Math.min(1, MS_PER_DAY / (projectEndMs - projectStartMs))) : 0)
      : (atEnd ? 1 : trueP);   // force exact reconciliation at the true final frame, never a near-1 gap
    var cursorMs = (projectStartMs != null && projectEndMs != null)
      ? projectStartMs + displayP * (projectEndMs - projectStartMs) : null;
    var od = A.costOdometerAt(cursorMs, ops, projectStartMs, projectEndMs, displayP);
    if (!od) return;
    _coLastOd = od;
    if (od.day !== _coLastLoggedDay) {
      _coLastLoggedDay = od.day;
      console.log('§COST_ODOMETER day=' + od.day + ' placed=' + od.placed + '/' + od.total +
        ' costToDate=' + od.costToDate + ' hoursToDate=' + od.hoursToDate);
    }
    if (atEnd && !_coFinalFired) {
      _coFinalFired = true;
      A._costOdometerFinalFired = true;   // cinema_maxq.js's own post-loop "did FINAL ever fire" check
      var ok = (od.costToDate === od.grandCost) && (od.hoursToDate === od.grandHours);
      console.log('§COST_ODOMETER_FINAL cost=' + od.costToDate + ' total=' + od.grandCost +
        ' hours=' + od.hoursToDate + ' totalHours=' + od.grandHours + ' => ' + (ok ? 'PASS' : 'FAIL'));
    }
  };
  // Pure draw-time formatter — reads the CACHED _coLastOd only, never recomputes, never logs.
  function _costRowText() {
    if (!_coLastOd) return null;
    // Example row (spec, §129.6 6b): "Cost   801 577 · 13 038 h"
    return 'Cost   ' + _spaceThousands(_coLastOd.costToDate) + ' · ' + _spaceThousands(_coLastOd.hoursToDate) + ' h';
  }
  // ROUND 20 (2026-09-16, red1 direct ruling, OVERRIDING Round 16 item 1's own invented split — "one
  // combined HUD panel again"): Cost/Ledger are BACK inside the resource panel's own box/plate/clip,
  // drawn right after the trade list, in the SAME `_box()` (never a second, independently-positioned
  // `hud.fiveD`/`_fiveDBox()` — both are gone). The panel's own height formula (`_box`, below) grows
  // to include these rows — but STILL content-driven (never a fixed worst-case reservation): Round
  // 16's real fix — "the panel's height is pie band + the rows actually shown" — is preserved, just
  // widened to cover the cost/ledger rows too, not undone.
  // `rows` is now a PARAMETER (built once by the caller via `_costLedgerRowsData()`, passed to BOTH
  // `_box()` for sizing and here for drawing) so the height formula and the actual draw can never
  // disagree about which rows exist this frame — the exact bug class `panelHOk` (cinema_maxq.js)
  // exists to catch. `listEnd` (the trade list's own real end Y, LOCAL to the panel's translated
  // origin — see `_drawList`'s own return) is where these rows now start: content-driven sizing means
  // "right after the list" and "the panel's own bottom" are the SAME point, by construction, since
  // nothing is reserved beyond what is actually drawn.
  // Both rows span the panel's FULL INNER WIDTH (item 8d, unchanged) — the REGISTERED rect width is
  // the ALLOCATED column width (`fullAvailW`), not the rendered text's own (usually narrower)
  // measured width, so §HUD_LAYOUT's `rowsFullWidth` can check the real layout fact, not an accident
  // of how long today's numbers happen to be. Truncation (ellipsis via `_fit()`) stays allowed.
  function _costLedgerRowsData() {
    var rows = [];
    if (A._costOdometerOn) { var ct = _costRowText(); if (ct) rows.push({ name: 'pie.cost', text: ct }); }
    if (A._pieLedgerOn && typeof A.ledgerTickerRowText === 'function') {
      var lt = A.ledgerTickerRowText(false);
      if (lt) rows.push({ name: 'pie.ledger', text: lt });
    }
    return rows;
  }
  A._resourcePanelCostLedgerRowsData = _costLedgerRowsData;
  // Draws INSIDE the caller's own already-translated/clipped panel space (called right after
  // `_drawList`, before that block's own `ctx.restore()`) — local coordinates match `_drawList`'s own
  // convention (`lx`, not `B.x+lx`); registration converts back to ABSOLUTE coordinates (`B.x+lx`),
  // matching every other rect this file registers. Because this now shares that block, the row TEXT
  // inherits the SAME `ctx.globalAlpha = opacity` the caller already set around it (§129.9 REAL BUG —
  // see this file's own git history: the old hud.fiveD box drew these rows AFTER that alpha scope had
  // already been ctx.restore()'d back to 1, so held/faded frames drew the text at full opacity
  // regardless — gone now, verified by inspection, not assumed: no `ctx.globalAlpha` write exists
  // anywhere in this function).
  function _pieCostLedgerRows(ctx, bw, B, rows, listEnd) {
    if (!rows || !rows.length) return listEnd;
    var pad = B.pad, lx = pad, fullAvailW = bw - 2 * pad;
    var fs = B.fs0, rowH = B.rowH0;
    // CONTROL `window.__hudRowsFloat=1` (§129.7 item 8 / ROUND 10, kept working — never deleted —
    // against the NEW merged structure): the DEFAULT (0) position is content-driven — right after
    // the list's own real end (`listEnd.ry`, plus a small separator gap matching `_box()`'s own
    // `clRowsH` reservation below) — which the height formula assumes. The control deliberately
    // draws at a WRONG, list-blind position instead (as if the list were always empty, ignoring
    // `listEnd` entirely) so that on a clip whose trade-list row count is ever > 0, the rows land on
    // TOP of the list — a real, detectable overlap `§HUD_LAYOUT`'s generic overlap count catches
    // (`pie.cost`/`pie.ledger` are siblings of `pie.list` under `resource-panel`, never declared
    // parent/child of each other, so an overlap between them is never exempted).
    // Fix (2026-09-17, real bake caught it: §HUD_LAYOUT_ARM overlaps=1, pie.cost 2px into pie.list) —
    // `ry` is a text-baseline CENTER (textBaseline='middle'), but registration below reports the rect's
    // TOP as `ry - rowH/2`. Adding only `pad*0.5` after the list's own bottom edge doesn't account for
    // that half-row-height the rect extends upward from its center, so the registered top edge landed
    // `rowH/2 - pad/2` pixels above the list's bottom whenever `rowH > pad` (it does here) — a real,
    // measured overlap, not a hypothetical one. `+ rowH * 0.5` restores the intended `pad*0.5` gap
    // between the list's bottom edge and the row's own top edge.
    var afterListY = (listEnd ? listEnd.ry : (B.pieBandH + pad)) + pad * 0.5 + rowH * 0.5;
    var wrongY = (B.pieBandH || 0) + pad;
    var start = window.__hudRowsFloat ? wrongY : afterListY;
    var ry = start;
    ctx.save();
    ctx.font = '600 ' + fs + 'px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    rows.forEach(function (r) {
      var text = r.text, tw = ctx.measureText(text).width;
      var truncated = tw > fullAvailW;   // read BEFORE any fitting — §HUD_LAYOUT's own honest flag
      if (truncated && r.name === 'pie.ledger') {
        var short = A.ledgerTickerRowText(true);   // the nicer, still-legible intermediate form
        var shortW = ctx.measureText(short).width;
        if (shortW <= fullAvailW) { text = short; tw = shortW; }
      }
      if (tw > fullAvailW) { text = _fit(ctx, text, fullAvailW); tw = ctx.measureText(text).width; }
      ctx.fillText(text, lx, ry);
      // §129.7 item 8d — registered width is the ALLOCATED full-inner-width column (fullAvailW),
      // never the variable measured/post-fit text width `tw`. ROUND 20 — parent is `resource-panel`
      // (the merged panel itself), never a separate `hud.fiveD`. Coordinates are ABSOLUTE (caller's
      // `B.x`/`B.y` added back), matching `pie.band`/`pie.list`'s own registration convention.
      if (A._hudLayoutRegister) A._hudLayoutRegister(r.name, B.x + lx, B.y + ry - rowH / 2, fullAvailW, rowH, 'resource-panel', truncated);
      ry += rowH;
    });
    ctx.restore();
    return { ry: ry };
  }
  // Exposed for a direct node dry run of the row-fit chain (full -> short, shortened by design, no
  // ellipsis), same convention cpe_load_path.js uses for its own pure layout functions (A._loadPathLadderLayout
  // etc.) — no THREE.js/DOM needed, only a ctx with measureText/fillText.
  A._resourcePanelPieCostLedgerRows = _pieCostLedgerRows;
  A._resourcePanelFit = _fit;
  // §129.7 item 4 — exposed so a dry run can drive the REAL box-growth formula (never a re-typed
  // copy of it) against A._costOdometerOn/A._pieLedgerOn.
  A._resourcePanelBox = _box;

  // ══ §CPE_PIE_HOLD (2026-08-30, user ruling) ══════════════════════════════════════════════════
  // User: "make the pie part not to disappear but hold when there is silent info."
  //
  // MEASURED FIRST (persisted ~/.cache/bim4d task windows, no probe launched): Hospital 318 days,
  // Clinic 111, Terminal 97, HHS 50, Duplex 13 — **ZERO** days with no task active on any of them.
  // So the silence is not a mid-programme gap; it is the post-§CPE_BUILDUP_TOPOUT half (topoutU=0.524
  // on the user's own Hospital bake), where no trade is active and the pie vanished entirely.
  //
  // ⚠ §PIE_HOLD_PREDICATE — CORRECTED 2026-09-02. THE TWO SENTENCES ABOVE MEASURE THE WRONG THING
  // and their conclusion ("not a mid-programme gap") is FALSE on Hospital. They count days with no
  // TASK active (42 task windows). This panel never reads tasks: it reads the per-element op array
  // and `resourcePanelAt` below SKIPS every op without a trade (`if (!o.r) continue;`). The real
  // predicate is therefore "no STAFFED ELEMENT op is active on this day" — and element ops are short
  // sub-windows INSIDE a task window (§TM_ELEMENT_WINDOW_BIND total=63415 clamped=63182), so a task
  // window can be continuously "active" while days inside it place no element at all.
  // MEASURED LIVE, windowed Hospital bake 2026-09-02 (stored path, buildup+label+reveal):
  //   §CPE_RESOURCE_PANEL on ops=63417 rates=true
  //   §CPE_RESOURCE_PANEL INCONCLUSIVE ops=63417 withResource=63415 day=[2026-09-06]
  //     opsSpan=[2026-07-31..2027-09-07] rates=true — no trade is active on this day
  //   §CPE_RESOURCE_HOLD first hold at day=137 holding day=133 (4 days back) heads=4 trades=1
  // 63,415 of 63,417 ops DO carry a resource, so the null is NOT a missing-trade defect: Hospital's
  // derived build order genuinely contains idle days — the earliest at ≈day 37 and a 4-day stretch at
  // days 134-137. The stage-5 film logged §CPE_PIE_HOLD heldFrames=283/2027 (14%) for this reason.
  // The hold firing MID-PROGRAMME is this feature working as designed against a real gap, not a bug,
  // and it supersedes the "it will NOT fire on Hospital" expectation recorded elsewhere.
  // (Whether the 4D generator SHOULD leave idle days inside a task window is a schedule-lane
  // question, not a HUD one — do not "fix" it here.)
  // Full reconciliation: bim-compiler prompts/CINEMA_PATH_EDITOR.md §PIE_HOLD_PREDICATE.
  //
  // This layers a HOLD on top of resourcePanelAt WITHOUT changing it — that function stays the pure
  // live-day truth its witness gates, so "who is on site today" and "who was on site last" can never
  // be confused in the log. Pure: no module state, no carried-forward numbers. The held composition
  // is the REAL composition of the most recent staffed day, recomputed by the same arithmetic at
  // that day's cursor — nothing averaged, decayed or extrapolated.
  //   • progress stays LIVE — elapsed programme fraction is still true after topout, so the ring
  //     keeps filling on the real cursor while the wedges hold.
  //   • held=true + heldDayKey travel with the info so the panel can dim it and print the day it is
  //     from. A held pie is a claim about a PAST day and must say so.
  //   • nothing staffed yet at this cursor -> null. No fabricated composition, ever.
  A.resourcePanelHoldAt = function (cursorMs, ops, projectStartMs, projectEndMs) {
    var live = A.resourcePanelAt(cursorMs, ops, projectStartMs, projectEndMs);
    var todayKey = Math.floor((cursorMs - projectStartMs) / MS_PER_DAY);
    if (live) { live.held = false; live.heldDayKey = todayKey; live.heldDays = 0; return live; }
    if (!ops || !ops.length || !(projectEndMs > projectStartMs)) return null;
    // Most recent staffed activity at or before this cursor's day. Same prefix scan the live path
    // uses (ops are sorted by start_ts), so a held frame costs no more than a live one.
    var dayEnd = projectStartMs + (todayKey + 1) * MS_PER_DAY;
    var lastEnd = -Infinity, i, o, e;
    for (i = 0; i < ops.length; i++) {
      o = ops[i];
      if (o.s >= dayEnd) break;
      if (!o.r) continue;
      e = (o.e == null ? o.s : o.e);
      if (e > lastEnd) lastEnd = e;
    }
    if (!isFinite(lastEnd)) return null;      // nothing has ever been staffed before now
    // The day containing that end HAD that op running, so this recomputation cannot come back empty
    // for the reason the live call did — but if it somehow does, refuse rather than draw a blank ring.
    var held = A.resourcePanelAt(Math.min(lastEnd, dayEnd - 1), ops, projectStartMs, projectEndMs);
    if (!held) return null;
    held.held = true;
    held.heldDayKey = held.dayKey;
    held.heldDays = todayKey - held.dayKey;
    held.dayKey = todayKey;
    held.progress = Math.max(0, Math.min(1, (cursorMs - projectStartMs) / (projectEndMs - projectStartMs)));
    if (!A._resHoldLogged) {
      A._resHoldLogged = true;
      console.log('§CPE_RESOURCE_HOLD first hold at day=' + (todayKey + 1) + ' holding day=' +
        (held.heldDayKey + 1) + ' (' + held.heldDays + ' days back) heads=' + held.totalHeads +
        ' trades=' + held.rows.length + ' — pie holds, ring stays live');
    }
    A._resHoldFrames = (A._resHoldFrames || 0) + 1;
    return held;
  };

  // ══ §CPE_STATS_TAIL (2026-08-30, user ruling) ═══════════════════════════════════════════════
  // User, on BIM_MaxQ_Hospital_1788092317604.mp4: "there is ample unused timing to display more
  // info after Finishes."
  //
  // MEASURED on that mp4: the day counter's digits stop changing at u≈0.45 (Day 315/315) and the
  // pie shows one static trade — 4 on site, Finisher ×4 — for the remaining ≈125 s. Over HALF the
  // film. §CPE_BIG_STATS could not reach it because its handover trigger is "the pie is honestly
  // empty", and on this schedule Finisher ops run to the last day so the pie is never empty.
  //
  // The right test is not emptiness, it is whether the schedule CAN still change. Frozen ⟺ no op
  // boundary — a start or an end — remains between this cursor and the end of the film. Then the
  // composition is fixed for every frame that follows and the column is showing a number that will
  // never move again. resourcePanelAt returning null is a SPECIAL CASE of this, so §CPE_PIE_HOLD is
  // subsumed, not replaced. Read off the ops array only: never a film fraction, never a topout
  // constant. A building whose work runs to the last frame never freezes and keeps its trade list.
  // Boundaries are compared against the END OF THE CURSOR'S DAY, not the instant: the panel is a
  // per-day readout, so an op that starts or ends later TODAY changes nothing about what any
  // following frame will show. This also covers the real shape — the buildup parks the cursor on the
  // final day for the whole reveal, with the last trade still running on it (MEASURED: Hospital
  // 315/315 with Finisher ×4 from u≈0.45 to the last frame).
  A.resourcePanelFrozenAt = function (cursorMs, ops, projectStartMs, projectEndMs) {
    if (!ops || !ops.length || !(projectEndMs > projectStartMs)) return false;
    var dayEnd = projectStartMs + (Math.floor((cursorMs - projectStartMs) / MS_PER_DAY) + 1) * MS_PER_DAY;
    var i, o, e;
    for (i = 0; i < ops.length; i++) {
      o = ops[i];
      if (!o.r) continue;
      if (o.s > dayEnd && o.s <= projectEndMs) return false;        // a trade still starts ahead
      e = (o.e == null ? o.s : o.e);
      if (e > dayEnd && e <= projectEndMs) return false;            // a trade still finishes ahead
    }
    return true;
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

  // ══ §CPE_BIG_STATS (2026-08-30, user ruling) ═════════════════════════════════════════════════
  // User: "During reveal, all disciplines already landed, so why say 'how much of it is there?'"
  // then "The panel continue giving revolving big stats for BIM clients to grasp."
  //
  // The composition pie answers "who is on site today", which is a real question during the WALK
  // and a dead one after §CPE_BUILDUP_TOPOUT (topoutU=0.524 on the user's own Hospital bake):
  // construction is finished, no trade is active, and the panel correctly drew nothing for the
  // whole second half. So the second half asks a different question and gets a different answer —
  // one BIG number at a time, cycled, sized to be read from across a room by someone who does not
  // use the software.
  //
  // EVERY CARD IS EXTRACTED, NONE ARE COMPUTED HERE. Counts come from elements_meta (the same
  // A.db the centres bootstrap already queries), the programme from the bake's own _bkState, the
  // workforce from the ops snapshot + rates.js. A card whose source is missing is DROPPED, never
  // filled with a plausible number — §CPE_BIG_STATS logs which cards were built from what.
  var _cards = null, _cardsKey = null;
  var CARD_SECONDS = 4.5;   // long enough to read a number and its label, short enough to keep moving

  A.bigStatsBuild = function (ops, projectStartMs, projectEndMs) {
    var out = [], LR = _rates();
    function q(sql) {
      try { if (!A.db) return null; var r = A.db.exec(sql); return r.length ? r[0].values : null; }
      catch (e) { return null; }
    }
    var tot = q("SELECT COUNT(*) FROM elements_meta");
    if (tot && tot[0]) out.push({ big: (+tot[0][0]).toLocaleString(), label: 'elements coordinated', src: 'elements_meta' });

    var mep = null;
    var disc = q("SELECT discipline, COUNT(*) FROM elements_meta WHERE discipline IS NOT NULL AND discipline<>'' GROUP BY 1 ORDER BY 2 DESC");
    if (disc && disc.length) {
      out.push({ big: String(disc.length), label: 'disciplines federated',
                 sub: disc.slice(0, 3).map(function (d) { return d[0] + ' ' + (+d[1]).toLocaleString(); }).join('   '),
                 src: 'elements_meta.discipline' });
      var i;
      for (i = 0; i < disc.length; i++) if (disc[i][0] === 'MEP') mep = disc[i][1];
      if (mep) out.push({ big: (+mep).toLocaleString(), label: 'MEP elements resolved', src: 'elements_meta.discipline=MEP' });
    }
    // §CPE_BIG_STATS_PLACEHOLDER_GUARD (2026-08-30, caught by the witness on Clinic, which produced
    // the card "102  MEP on Unknown"). 'Unknown' is a placeholder the extractor writes when a storey
    // could not be resolved — fine in a data table, unusable on a card a client reads. These stats
    // are advert-register: a headline nobody can act on is worse than one fewer card. Excluded from
    // BOTH the densest-level card and the level COUNT, so "8 levels" cannot be inflated by a bucket
    // that is not a level.
    var NOT_PLACEHOLDER = " AND storey IS NOT NULL AND storey<>'' AND LOWER(storey) NOT IN ('unknown','none','n/a','-') ";
    var st = q("SELECT storey, COUNT(*) FROM elements_meta WHERE discipline='MEP'" + NOT_PLACEHOLDER + "GROUP BY 1 ORDER BY 2 DESC LIMIT 1");
    // Also dropped when it merely restates the MEP total — the same number twice in a rotation reads
    // as a bug, not as two facts (Clinic showed 102 then 102).
    if (st && st[0] && (!mep || +st[0][1] < +mep)) {
      out.push({ big: (+st[0][1]).toLocaleString(), label: 'MEP on ' + st[0][0], sub: 'densest level',
                 src: 'elements_meta storey x MEP' });
    }
    var lv = q("SELECT COUNT(DISTINCT storey) FROM elements_meta WHERE 1=1" + NOT_PLACEHOLDER);
    if (lv && lv[0] && +lv[0][0] > 0) out.push({ big: String(+lv[0][0]), label: 'levels', src: 'elements_meta.storey' });

    if (projectEndMs > projectStartMs) {
      var days = Math.max(1, Math.ceil((projectEndMs - projectStartMs) / MS_PER_DAY));
      out.push({ big: String(days), label: 'day programme',
                 sub: new Date(projectStartMs).toISOString().slice(0, 10) + '  →  ' + new Date(projectEndMs).toISOString().slice(0, 10),
                 src: 'bake _bkState' });
    }
    // Peak workforce — the same capped-crew arithmetic resourcePanelAt uses, sampled per day, so the
    // headline can never exceed what §CREW_CAP_FINAL says the site could actually staff.
    if (ops && ops.length && projectEndMs > projectStartMs && LR) {
      var peak = 0, peakDay = null, d, info;
      var totalDays = Math.ceil((projectEndMs - projectStartMs) / MS_PER_DAY);
      var step = Math.max(1, Math.floor(totalDays / 60));
      for (d = 0; d < totalDays; d += step) {
        info = A.resourcePanelAt(projectStartMs + d * MS_PER_DAY, ops, projectStartMs, projectEndMs);
        if (info && info.totalHeads > peak) { peak = info.totalHeads; peakDay = d + 1; }
      }
      if (peak > 0) out.push({ big: String(peak), label: 'peak workforce', sub: 'day ' + peakDay, src: 'ops x rates.js crew caps' });
    }
    // 5D — the client-facing numbers. Taken from §HR_COST's own computation (A._hrCost, exposed in
    // time_machine.js), never re-derived here: cost is the schedule's labour content and this file
    // must not become a second opinion about it. Absent = card dropped, not estimated.
    if (A._hrCost && A._hrCost.total > 0) {
      out.push({ big: (A._hrCost.total).toLocaleString(), label: 'labour cost committed',
                 sub: A._hrCost.trades + ' trades  ·  time-phased, not a bill of quantities',
                 src: '§HR_COST' });
      out.push({ big: Math.round(A._hrCost.personDays).toLocaleString(), label: 'person-days of labour',
                 src: '§HR_COST' });
    }
    // §CLASH_HUD_CARD (2026-09-06, MEP_CLASH_REVEAL_MOVIE.md; user: "the HUD info be in") — the
    // mesh-true clash count the film ALREADY built (A.clashFilm.stats()), never re-counted here.
    // Dropped when the film was never built or judged no bbox candidate at all — absent, not a zero.
    // pairs=0 with broad>0 is a real judged fact (every candidate CLEAR at mesh level) and is shown.
    var cf = (A.clashFilm && A.clashFilm.stats) ? A.clashFilm.stats() : null;
    if (cf && cf.built && cf.broad > 0) {
      var falsePct = Math.round((cf.falseExcluded / cf.broad) * 1000) / 10;
      out.push({ big: String(cf.pairs), label: 'mesh-true clashes flagged',
                 sub: cf.broad.toLocaleString() + ' bbox candidates  ·  ' + falsePct + '% false at mesh level' +
                      (cf.flat > 0 ? '  ·  ' + cf.flat + ' flat touch' + (cf.flat > 1 ? 'es' : '') + ' dropped' : ''),   // §CLASH_FILM_FLAT_FILTER
                 src: 'clash_film.js §CLASH_FILM_BUILD' });
    }
    // §CLASH_HUD_PAIR_CARDS (2026-09-06, MEP_CLASH_REVEAL_MOVIE.md §PENDING.5 item B) — ONE card per
    // discipline pair that actually has a mesh-true clash, extending (not replacing) the single
    // aggregate card above. Pure groupby already computed in clash_film.js — no new judgment here.
    // A pair with 0 clashes gets no card (§VACUOUS), same rule every other card in this function keeps.
    // `discPairKey` rides along unused by the renderer — cinema_maxq.js reads it during the pullback
    // window to sync the on-screen highlight to whichever of these cards is currently shown.
    if (A.clashFilm && A.clashFilm.statsByDiscPair) {
      var pairGroups = A.clashFilm.statsByDiscPair();
      pairGroups.forEach(function (g) {
        if (g.count > 0) {
          out.push({ big: String(g.count), label: g.discA + ' vs ' + g.discB + ' clashes',
                     sub: 'discipline pair', src: 'clash_film.js pairs() grouped by discA/discB',
                     discPairKey: g.key });
        }
      });
    }
    // §RULE_FILM_HUD_CARD (2026-09-11, MEP_CLASH_REVEAL_MOVIE.md §59) — Structural Sanity + Egress
    // counts the film ALREADY evaluated (A.ruleFindingsFilm.stats()), never re-counted here. Same
    // §CLASH_HUD_CARD discipline: one card per NON-EMPTY category, dropped entirely (never a
    // fabricated zero) when a category found nothing. `ink` is new on this renderer's card shape —
    // bigStatsCompositeOntoCanvas reads it when present and falls back to its existing white/grey
    // for every pre-existing card, which never sets it.
    var rf = (A.ruleFindingsFilm && A.ruleFindingsFilm.stats) ? A.ruleFindingsFilm.stats() : null;
    if (rf && rf.built) {
      if (rf.structuralTotal > 0) {
        out.push({ big: String(rf.structuralTotal), label: 'structural issues flagged',
                   sub: rf.structuralPicked ? 'floating members · unsupported columns · span/depth' : 'no storey stayed on screen long enough to show one',
                   src: 'structural_sanity.js', ink: '#ffaa33' });
      }
      if (rf.egressTotal > 0) {
        var exitSub = 'isolated rooms · circulation distance · door width';
        if (rf.maxExitDistM != null) {
          exitSub = 'longest distance to exit — ' + Math.round(rf.maxExitDistSec) + 's / ~' + rf.maxExitDistSteps + ' steps' +
                    ' (' + rf.maxExitDistM.toFixed(1) + 'm @ ' + (A.WALK_SPEED || 1.2) + ' m/s est.)';
        }
        out.push({ big: String(rf.egressTotal), label: 'safety issues flagged',
                   sub: exitSub, src: 'egress_sanity.js', ink: '#e57373' });   // §68 — #cc4444 failed WCAG 4.5 at every plate alpha
      }
    }
    // §MEASURE_HUD_CARD (2026-09-06, MEP_CLASH_REVEAL_MOVIE.md §PENDING.5 item D) — the Measure tool's
    // OWN saved measurements from THIS page session (A.measureLabels, measure.js), never a building-
    // wide area/volume figure (a different question the cards above already answer). Dropped entirely
    // when nobody measured anything this session — never a fabricated "0 measurements" card. A more
    // durable source exists (UniversalHistory.recordEvent('MEASURE',...) → common/history_bar.js's own
    // localStorage-backed tree) but its public API exposes no distance/point data, only label/kind —
    // using it would need a small additive export on that SHARED cross-app module, not built here
    // (see prompts/MEP_CLASH_REVEAL_MOVIE.md §PENDING.5 item D for the full note).
    if (A.measureLabels && A.measureLabels.length) {
      var mDist = [];
      A.measureLabels.forEach(function (m) {
        if (m && m.p1 && m.p2 && m.p1.distanceTo) mDist.push(m.p1.distanceTo(m.p2));
      });
      var mSub = mDist.length
        ? mDist.slice(0, 3).map(function (d) { return d.toFixed(2) + 'm'; }).join('  ·  ')
        : 'area/point measurements (no distance pair)';
      out.push({ big: String(A.measureLabels.length), label: 'measurements saved this session',
                 sub: mSub, src: 'measure.js A.measureLabels' });
    }
    console.log('§CPE_BIG_STATS cards=' + out.length + (out.length
      ? ' [' + out.map(function (c) { return c.label; }).join(' | ') + ']'
      : ' INCONCLUSIVE — no source available (A.db=' + !!A.db + ' ops=' + (ops ? ops.length : 0) + '); panel omitted, not blank'));
    return out.length ? out : null;
  };

  // §MEASURE_BUILDING_CARD (2026-09-06, MEP_CLASH_REVEAL_MOVIE.md — user: "The Measure stats can take
  // the orbit last 3 secs.") — the WHOLE-BUILDING figures the in-viewer Measure tool already extracts
  // on double-click (measure.js's own DB-envelope branch, ~L1483: MIN/MAX of center±bbox/2 over
  // element_transforms). Restated here against the SAME table and the SAME arithmetic rather than
  // imported, because measure.js computes it inside a DOM click handler with no return value.
  //
  // This REPLACES A.measureLabels as the film's "Measure stats" source. measureLabels holds the
  // user's own saved tape-measure readings, which are empty on every scripted bake (cli_silent_bake.js
  // launches Chrome on a fresh throwaway --profile), so that card could never fire in a film. The
  // envelope figures need no session state and are real on every building.
  //
  // Height is the Z extent — element_transforms is Z-up (the same center_z every storey ladder in this
  // repo orders on). Floor area is the envelope FOOTPRINT (dx x dy), a bbox proxy, labelled as such —
  // never presented as true room area, same rule the storey card's own footprint clause follows.
  // Returns null (never a fabricated card) when the table is missing or the envelope is degenerate.
  A.buildingMeasureCards = function () {
    var one = A.buildingMeasureCard();
    if (!one) return null;
    var out = [one];
    var e = one._envelope;
    // Envelope dimensions as their own card — the "Dimensions XYZ" the user asked for, stated as the
    // three real extents rather than folded into a sub-line where they read as an afterthought.
    out.push({ big: e.dx.toFixed(1) + ' \u00D7 ' + e.dy.toFixed(1) + ' \u00D7 ' + e.dz.toFixed(1),
               label: 'm building envelope', sub: 'X \u00D7 Y \u00D7 Z extents',
               src: 'element_transforms MIN/MAX' });
    // Opening census — a COMPLETE count from elements_meta, so these are facts, not proxies.
    try {
      var cr = A.dbQuery("SELECT REPLACE(ifc_class,'Ifc','') AS cls, COUNT(*) FROM elements_meta " +
        "WHERE ifc_class IN ('IfcDoor','IfcWindow','IfcWall','IfcWallStandardCase') GROUP BY cls");
      var cnt = {}; (cr || []).forEach(function (r) { cnt[r[0]] = (cnt[r[0]] || 0) + (+r[1]); });
      var walls = (cnt.Wall || 0) + (cnt.WallStandardCase || 0);
      if (cnt.Door > 0) {
        var csub = [];
        if (cnt.Window > 0) csub.push(cnt.Window.toLocaleString() + ' windows');
        if (walls > 0) csub.push(walls.toLocaleString() + ' walls');
        out.push({ big: cnt.Door.toLocaleString(), label: 'doors', sub: csub.join('  \u00B7  '),
                   src: 'elements_meta census' });
      }
      console.log('\u00A7MEASURE_BUILDING_CARD census doors=' + (cnt.Door || 0) +
        ' windows=' + (cnt.Window || 0) + ' walls=' + walls);
    } catch (eC) { console.warn('\u00A7MEASURE_BUILDING_CARD census failed: ' + eC.message + ' — card omitted'); }
    // Cost. Labour is REAL (§HR_COST, time-phased off the schedule). Materials are a ROUGH
    // count x rate — MATERIAL_COSTS rates carry units (M / M2 / EA) that a plain element count does
    // NOT honour, exactly the caveat effects.js's own cpeRevealDiscQtyCost states about itself. The
    // card says "rough" on its face rather than passing a proxy off as a bill of quantities.
    try {
      var labour = (A._hrCost && A._hrCost.total > 0) ? A._hrCost.total : 0;
      var mat = 0;
      if (A.MATERIAL_COSTS) {
        var mr = A.dbQuery('SELECT ifc_class, COUNT(*) FROM elements_meta GROUP BY ifc_class');
        (mr || []).forEach(function (r) {
          var mc = A.MATERIAL_COSTS[r[0]];
          if (mc) mat += (+r[1]) * mc.rate;
        });
      }
      // §VACUOUS — labour is 0 on a silent CLI bake (A._hrCost is only populated by an interactive
      // schedule run), so calling the figure a "total estimated cost" while it is materials ONLY would
      // imply labour is folded in when it is not. Name exactly what is in the number: with labour
      // present it is a total; without, it is a materials estimate and says so. The "rough" caveat
      // stays either way — MATERIAL_COSTS rates carry M/M2/EA units a plain element count cannot honour.
      if (labour > 0 && mat > 0) {
        out.push({ big: Math.round(labour + mat).toLocaleString(), label: 'total estimated cost',
                   sub: 'labour ' + Math.round(labour).toLocaleString() +
                        '  \u00B7  materials ' + Math.round(mat).toLocaleString() + ' (rough, count \u00D7 rate)',
                   src: 'A._hrCost + MATERIAL_COSTS (not unit-aware)' });
      } else if (mat > 0) {
        out.push({ big: Math.round(mat).toLocaleString(), label: 'material cost estimate',
                   sub: 'rough: element count \u00D7 rate, not a bill of quantities',
                   src: 'MATERIAL_COSTS (not unit-aware); no labour figure in this run' });
      } else if (labour > 0) {
        out.push({ big: Math.round(labour).toLocaleString(), label: 'labour cost committed',
                   sub: 'time-phased from the schedule', src: 'A._hrCost' });
      }
      console.log('\u00A7MEASURE_BUILDING_CARD cost labour=' + Math.round(labour) +
        ' materialRough=' + Math.round(mat) + ' total=' + Math.round(labour + mat));
    } catch (eK) { console.warn('\u00A7MEASURE_BUILDING_CARD cost failed: ' + eK.message + ' — card omitted'); }
    console.log('\u00A7MEASURE_BUILDING_CARD cards=' + out.length + ' [' +
      out.map(function (c) { return c.label; }).join(' | ') + ']');
    return out;
  };

  A.buildingMeasureCard = function () {
    if (typeof A.dbQuery !== 'function') { console.log('§MEASURE_BUILDING_CARD INCONCLUSIVE reason=no-dbQuery'); return null; }
    var r;
    try {
      r = A.dbQuery('SELECT MIN(center_x - bbox_x/2), MAX(center_x + bbox_x/2),' +
        ' MIN(center_y - bbox_y/2), MAX(center_y + bbox_y/2),' +
        ' MIN(center_z - bbox_z/2), MAX(center_z + bbox_z/2) FROM element_transforms');
    } catch (e) { console.log('§MEASURE_BUILDING_CARD INCONCLUSIVE reason=query-failed ' + e.message); return null; }
    var v = r && r[0];
    if (!v || v[0] == null) { console.log('§MEASURE_BUILDING_CARD INCONCLUSIVE reason=empty-envelope'); return null; }
    var dx = +v[1] - +v[0], dy = +v[3] - +v[2], dz = +v[5] - +v[4];
    if (!(dx > 0 && dy > 0 && dz > 0)) {
      console.log('§MEASURE_BUILDING_CARD INCONCLUSIVE reason=degenerate dx=' + dx + ' dy=' + dy + ' dz=' + dz);
      return null;
    }
    var vol = dx * dy * dz, foot = dx * dy;
    var card = { big: Math.round(vol).toLocaleString(), label: 'm\u00B3 measured volume',
                 sub: Math.round(foot).toLocaleString() + ' m\u00B2 footprint  \u00B7  ' + dz.toFixed(1) + ' m tall',
                 src: 'element_transforms envelope (bbox proxy, same as measure.js dbl-click)',
                 _envelope: { dx: dx, dy: dy, dz: dz, vol: vol, foot: foot } };
    console.log('\u00A7MEASURE_BUILDING_CARD vol=' + vol.toFixed(1) + 'm3 footprint=' + foot.toFixed(1) +
      'm2 height=' + dz.toFixed(2) + 'm (dx=' + dx.toFixed(2) + ' dy=' + dy.toFixed(2) + ')');
    return card;
  };

  // §CPE_CARD_SPAN (2026-09-06) — like bigStatsAt, but for a BOUNDED window: `u` (0..1 across that
  // window) maps onto exactly ONE pass through `cards`, so the first card is always index 0 and the
  // last one finishes as the window closes. bigStatsAt indexes off ABSOLUTE film seconds, which is
  // right for an open-ended rotation and wrong for a window: measured on the 2026-09-06 ending bake,
  // the pullback opened mid-rotation on ELEC|STR for 0.6s before reaching the intended first card,
  // and 7 cards x CARD_SECONDS (31.5s) overran the 25.9s window so the tail of the list was cut and
  // the first card repeated. Same fade shape as bigStatsAt — only the indexing differs.
  A.bigStatsAtSpan = function (cards, u) {
    if (!cards || !cards.length) return null;
    var n = cards.length;
    var w = Math.max(0, Math.min(0.999999, u));
    var idx = Math.min(n - 1, Math.floor(w * n));
    var su = w * n - idx;                                  // 0..1 within this card's own slot
    var fade = Math.min(1, Math.min(su, 1 - su) / 0.12);
    return { card: cards[idx], idx: idx, n: n, opacity: Math.max(0, fade) };
  };

  // Which card is on screen at this film second, and its fade. Pure — the witness gates the rotation
  // without a bake, same contract dayCounterAt keeps.
  A.bigStatsAt = function (cards, filmSec) {
    if (!cards || !cards.length) return null;
    var idx = Math.floor(filmSec / CARD_SECONDS) % cards.length;
    var u = (filmSec % CARD_SECONDS) / CARD_SECONDS;
    var fade = Math.min(1, Math.min(u, 1 - u) / 0.12);   // ease in and out, held flat between
    return { card: cards[idx], idx: idx, n: cards.length, opacity: Math.max(0, fade) };
  };

  // ── The panel BOX. §CPE_PIE_HOLD: both modes call this, so the slot cannot change size, corner or
  // stack position when the content inside it swaps from the trade list to a revolving stat card.
  // ROUND 4 item 2, REVISED RULING (2026-09-16, red1): the panel does NOT widen — "users can see the
  // ravelling when it is shorter, gives a glimpse of the common end tail; this is just for idea
  // rather than empirical record." Superseded a same-day attempt that widened `bw` to the widest
  // measured row (see git history/prior §129.4 entries) — reverted outright, `bw` is fixed again.
  // §129.7 item 8 (2026-09-16, real Terminal clip sighting) — STACKED layout: (a) the pie gets an
  // EXCLUSIVE band at the panel's top, nothing beside it; (b) the resource list follows below, at
  // the FULL panel width (never the old 56%-squeezed side column — the actual cause of the heavy
  // truncation the user pointed at).
  // ROUND 16 item 1 (§129.9 item 1, 2026-09-16, red1: registry showed resource-panel 173x272 vs
  // 173x115 pre-Round-10 — "that is what red1 calls gigantic") — SUPERSEDES (c)'s own "worst case
  // the whole schedule will ever need": the list band is now sized for the ROWS ACTUALLY SHOWN this
  // frame (`shownRows`, the caller's own live `info.rows.length`, clamped [0,8] — the SAME ceiling
  // the old worst-case scan used, now applied to real content instead of a hypothetical), never
  // `_scanMaxResourceRows()`'s pre-reserved allocation — "the panel's height is pie band + the rows
  // actually shown" (red1's own ruling).
  // ROUND 20 (2026-09-16, red1, OVERRIDING Round 16 item 1's own separate `hud.fiveD` box — "one
  // combined HUD panel again"): Cost/Ledger are BACK in this SAME formula, via `clRows` (the caller's
  // own live `_costLedgerRowsData().length`, mirroring `shownRows`'s exact discipline — content-
  // driven, never a fixed worst-case reservation). `clRows` OMITTED falls back to the STATIC on/off
  // toggle count (never used by the real resource-panel caller, which always passes the live number;
  // kept only so an old/other caller that never knew about this param still gets a sane, non-zero
  // reservation instead of silently clipping rows it didn't know to size for).
  function _box(w, h, pos, stackY, shownRows, clRows) {
    var bw = Math.round(h * 0.36);
    // bh0 stays a FIXED, frame-height-anchored reference for font sizing ONLY (fs0/rowH0) — never
    // fed back from the live/grown bh (see the old circular-growth note this replaces): the panel's
    // ACTUAL height (bh, below) is now built up from real content bands, not derived from bh0 by
    // itself, so this anchor keeps text a constant, predictable size regardless of how tall the
    // panel ends up (a longer schedule's resource list must not also grow the font).
    var bh0 = Math.round(h * 0.24);
    var fs0 = Math.max(9, Math.round(bh0 * 0.085));
    var rowH0 = Math.round(fs0 * 1.55);
    var pad = Math.round(bh0 * 0.10);
    // (a) the pie's own EXCLUSIVE band — full bw, sized off bw now (not squeezed into a column
    // beside the list), so it no longer competes with the list for width OR height. UNCHANGED size
    // (red1: "retain the single row pie bigger size as it is now").
    var pieBandH = Math.round(bw * 0.66);
    var listHeaderH = Math.round(fs0 * 0.7 + rowH0 * 0.95);
    var rows = (shownRows != null) ? Math.max(0, Math.min(8, shownRows)) : Math.min(8, Math.max(2, _scanMaxResourceRows()));
    var listRowsH = rows > 0 ? (listHeaderH + rows * rowH0) : 0;
    // ROUND 20 — Cost/Ledger rows, appended AFTER the trade list, content-driven exactly like it: a
    // small separator gap (`pad*0.5`, matching `_pieCostLedgerRows`'s own `afterListY` start) then
    // one `rowH0` per row actually shown. Zero rows -> zero height, no reserved gap either.
    var clN = (clRows != null) ? Math.max(0, clRows) : ((A._costOdometerOn ? 1 : 0) + (A._pieLedgerOn ? 1 : 0));
    var clRowsH = clN > 0 ? Math.round(pad * 0.5 + clN * rowH0) : 0;
    var bh = Math.round(pieBandH + pad + listRowsH + clRowsH + pad * 0.4);
    var margin = Math.round(h * 0.028);
    var at = (pos && POS[pos]) ? pos : 'tr';
    var sy = stackY || 0;
    // `bwBase` kept, equal to `bw` — the pie no longer has a narrower "own column" width distinct
    // from the list (both now span the full panel width), but older callers still read the field.
    return { bw: bw, bwBase: bw, bh: bh, bh0: bh0, fs0: fs0, rowH0: rowH0, pad: pad,
             pieBandH: pieBandH, rows: rows, clRows: clN, rad: Math.round(bh * 0.09),
             x: (at === 'tl' || at === 'bl') ? margin : w - margin - bw,
             y: (at === 'bl' || at === 'br') ? h - margin - bh - sy : margin + sy };
  }

  // ── Frosted plate. Cheap only HERE: _captureFrame has already drawn the rendered frame into this
  // context, so the pixels behind the panel exist and can be blurred back over themselves. ONE
  // implementation for both modes — the plate must not change tone as the content swaps.
  function _plate(ctx, B) { A.cpePanelPlate(ctx, B.x, B.y, B.bw, B.bh, B.rad); }

  // §MEASURE_PLATE_MATCHES_HUD (MEP_CLASH_REVEAL_MOVIE.md §65, 2026-09-11, user: "just make background
  // same as main HUD which has no issue"). Exported so cpe_film_boxes.js's three boxes draw the SAME
  // plate as this panel rather than a second look-alike — one implementation, so the two surfaces
  // cannot drift apart. Same "ONE implementation for both modes" discipline this plate already kept.
  A.cpePanelPlate = function (ctx, x, y, bw, bh, rad) {
    var glass = _glass(ctx, x, y, bw, bh, rad);
    _round(ctx, x, y, bw, bh, rad);
  // §HUD_LEGIBLE (MEP_CLASH_REVEAL_MOVIE.md §68, 2026-09-11, user: "Just make sure everything is
  // legible"). Measured, not chosen by eye: at the old 0.28/0.45 every ink fell under WCAG 4.5 over a
  // bright backdrop (white facade / sky), because a translucent plate lets a bright scene through.
  // 0.85 is the alpha at which every HUD ink clears 4.5 over BOTH the darkest and brightest frames.
    // §73.3 — translucency restored (user: "Restore back the info panels translucence see thru...
    // Yes they may not be that legible but user can pause and the scene movement helps contrast").
    // The value is cpe_path_overview.js:208's — the top-left cam-path box the user pointed at
    // ("It looks more like 70%, very nice, not obscuring background scene much"). Matched exactly
    // rather than approximated, so the two boxes cannot drift apart. 0.28 = 72% see-through.
    ctx.fillStyle = glass ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.45)';
    ctx.fill();
    _round(ctx, x, y, bw, bh, rad);
    ctx.strokeStyle = 'rgba(255,255,255,0.20)'; ctx.lineWidth = 1; ctx.stroke();
  };

  // ── The pie + ring are static for a whole calendar day, so they are rendered once into an
  // offscreen canvas and blitted. The user's own instruction: "yes reprint if no change".
  // Cached across BOTH modes, so a held pie costs nothing extra for the whole reveal.
  var _pieKey = null, _pieCanvas = null;
  function _pie(ctx, B, info) {
    // §129.7 item 8a — the pie's own EXCLUSIVE band: full panel width now (`B.bw`, never a narrower
    // side column), height `B.pieBandH` (falls back to `B.bh` for a bare {bw,bh,x,y,rad} object a
    // future caller might build by hand instead of via _box()).
    var pieBw = B.bw;
    var pieBandH = (B.pieBandH != null) ? B.pieBandH : B.bh;
    var lit = A.resourcePanelLightDir();
    var key = (info.held ? 'H' : 'L') +
              (info.heldDayKey == null ? info.dayKey : info.heldDayKey) +
              '|' + pieBw + 'x' + pieBandH + '|' + info.rows.length + '|' + info.totalHeads +
              '|' + info.progress.toFixed(3) + '|' + lit.x.toFixed(2) + ',' + lit.y.toFixed(2);
    if (_pieKey !== key || !_pieCanvas) { _pieCanvas = _pieBitmap(pieBw, pieBandH, info, lit); _pieKey = key; }
    if (!_pieCanvas) return;
    ctx.save();
    _round(ctx, B.x, B.y, B.bw, B.bh, B.rad); ctx.clip();
    ctx.drawImage(_pieCanvas, B.x, B.y);
    ctx.restore();
    if (A._hudLayoutRegister) A._hudLayoutRegister('pie.band', B.x, B.y, B.bw, pieBandH, 'resource-panel');
  }

  // §CPE_BIG_STATS + §CPE_PIE_HOLD. `heldInfo` (optional) is the composition the pie holds while the
  // cards revolve — pass what A.resourcePanelHoldAt returned. With it, the pie keeps its column and
  // the card takes the content column; without it the card falls back to the full width it had
  // before the hold existed, so an older caller still renders correctly.
  // §CPE_STATS_TAIL — the tail rotation is [ roster ] + cards, so the trade list with its avatars
  // and ×N is ONE of the revolving slots rather than being replaced by them. Nothing the panel used
  // to say is lost to the cards; the dead half of the film just gains everything else.
  A.tailPanelAt = function (cards, filmSec, info) {
    var nCards = cards ? cards.length : 0;
    var hasRoster = !!(info && info.rows && info.rows.length);
    var n = nCards + (hasRoster ? 1 : 0);
    if (!n) return null;
    var idx = Math.floor(filmSec / CARD_SECONDS) % n;
    var u = (filmSec % CARD_SECONDS) / CARD_SECONDS;
    var fade = Math.max(0, Math.min(1, Math.min(u, 1 - u) / 0.12));
    if (hasRoster && idx === 0) return { roster: info, idx: idx, n: n, opacity: fade };
    return { card: cards[idx - (hasRoster ? 1 : 0)], idx: idx, n: n, opacity: fade };
  };

  A.bigStatsCompositeOntoCanvas = function (ctx, w, h, shown, opacity, pos, stackY, heldInfo) {
    if (!ctx || !shown || !(shown.card || shown.roster) || !(opacity > 0)) return;
    var c = shown.card;
    // `clRows=0` EXPLICIT — this stat-card/roster display never draws Cost/Ledger rows itself (see
    // this function's body below: pie + card-or-roster only), so it must not reserve height for them
    // either — leaving `clRows` omitted would fall back to the STATIC on/off toggle count (`_box()`'s
    // own back-compat default for a caller that never knew about this param) and needlessly grow this
    // panel past what it actually draws.
    // Fix (2026-09-17, red1: "the rolling ending cards... got inflated, did not restore back its
    // original size") — `shownRows` was `undefined` here, which `_box()`'s own fallback (line ~791)
    // sends to `_scanMaxResourceRows()`, the OLD pre-Round-16 worst-case reservation the main
    // resource panel stopped using months ago. This panel never got that same fix, so it was sized
    // for a hypothetical worst-case list instead of what it actually draws (pie + one card/roster
    // row, never a full trade list here). Pass the REAL row count, same content-driven discipline as
    // `resourcePanelCompositeOntoCanvas`'s own `shownRows`: the roster slot draws `shown.roster.rows`
    // via `_drawList` below, so that IS the real row count when a roster is showing; the card slot
    // draws no list rows at all.
    var shownRowsReal = (shown.roster && shown.roster.rows) ? Math.max(0, Math.min(8, shown.roster.rows.length)) : 0;
    // Stash the SAME globals `resourcePanelCompositeOntoCanvas` stashes, so cinema_maxq.js's own
    // change-detected panel-height check (§HUD_LAYOUT_STABLE) has FRESH, correct data regardless of
    // which of the two panel functions drew this frame — without this, the check would silently read
    // stale values left over from whichever panel drew last, during the OTHER panel's own phase.
    A._resPanelShownRows = shownRowsReal; A._resPanelClRows = 0;
    var B = _box(w, h, pos, stackY, shownRowsReal, 0);
    var bw = B.bw, bh = B.bh, x = B.x, y = B.y, rad = B.rad;
    ctx.save();
    ctx.globalAlpha = Math.min(1, opacity);
    _plate(ctx, B);

    // The pie does NOT leave when the trades do — it holds the last real composition in exactly the
    // place it occupied all through the build, dimmed and captioned with the day it is from.
    // §CPE_PIE_FLYOUT_DROP (2026-09-01): the Reveal round now passes heldInfo=null on purpose —
    // the pie is not drawn there at all and the content keeps this full-width column. The held-pie
    // path below still serves any caller that passes a composition (round 1 semantics unchanged).
    // §129.7 item 8a (2026-09-16) — the held pie now draws in its own EXCLUSIVE top band too (same
    // stacked layout the resource panel uses); the card/roster below it is FULL WIDTH always (never
    // a narrower side column) and simply starts `B.pieBandH` further down when a pie is drawn.
    var colX = x + Math.round(bh * 0.13), colW = bw - Math.round(bh * 0.13) * 2;
    var pieDrawn = false, topY = 0;
    if (heldInfo && heldInfo.rows && heldInfo.rows.length && heldInfo.totalHeads > 0) {
      _pie(ctx, B, heldInfo);
      topY = B.pieBandH;
      pieDrawn = true;
    }

    ctx.save();
    _round(ctx, x, y, bw, bh, rad); ctx.clip();
    ctx.globalAlpha = Math.min(1, opacity) * shown.opacity;   // the card itself fades, the plate does not
    var pad = Math.round(bh * 0.13);
    // §CPE_STATS_TAIL — the roster slot draws the real trade list, not a number, so the avatars and
    // the ×N counts stay in the rotation instead of being replaced by the cards.
    if (shown.roster) {
      // §129.7 item 8b — the roster list is full width regardless of pieDrawn now; only the START Y
      // (below the pie's own band, when one is drawn) differs.
      ctx.save(); ctx.translate(x, y); _drawList(ctx, bw, bh, shown.roster, topY, B); ctx.restore();
      _dots(ctx, colX, y + bh - pad * 0.7, bh, shown);
      ctx.restore(); ctx.restore();
      return;
    }
    var F = 'BlinkMacSystemFont,"Segoe UI",Roboto,-apple-system,sans-serif';
    // THE NUMBER — as large as will fit, because the whole point is grasping it at a glance.
    var big = Math.round(bh * 0.42), tw;
    do { ctx.font = '800 ' + big + 'px ' + F; tw = ctx.measureText(c.big).width; if (tw <= colW) break; big -= 2; }
    while (big > 14);
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.fillStyle = c.ink || '#fff';   // §59 — a category ink (Structural/Safety cards) overrides the default white; every pre-existing card never sets c.ink
    var baseY = y + topY + pad + big * 0.86;
    ctx.fillText(c.big, colX, baseY);
    // §CPE_CARD_FIT (2026-09-01, found in the user's OWN Hospital bake, not by reading): once
    // §CPE_PIE_HOLD gave the pie its own permanent column, the card's text column narrowed from
    // bw-2*pad (286 px at h=960) to availW (171 px) — and the labels started truncating:
    // "labour cost ..." and "9 trades  ·  time-...". That is the SAME defect §CPE_HUD_ORDER already
    // fixed once for the trade names, and the file's own ruling applies unchanged: a label a client
    // cannot read is the same failure as a placeholder storey — the card is there but says nothing.
    // SHRINK BEFORE ELLIPSIS. The number above already does exactly this; the label and sub simply
    // never did, because at 286 px they never had to. Ellipsis stays as the last resort so a
    // pathologically long sub still cannot overflow the panel.
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    _fitText(ctx, c.label, colX, baseY + Math.round(bh * 0.17), colW,
             Math.round(bh * 0.105), Math.round(bh * 0.072), '600', F);
    if (c.sub) {
      // The sub is a full sentence ("9 trades · time-phased, not a bill of quantities" = 48 chars).
      // At 171 px even the floor size cannot fit it on one line, and the real bake cut it mid-word
      // at "time-phased, n…". There IS vertical room — the dots sit at bh-pad*0.7 and the sub starts
      // at 0.30*bh — so it wraps to a second line instead of losing the caveat it exists to carry.
      ctx.fillStyle = 'rgba(255,255,255,0.78)';   // §68 — 0.60 measured 2.46 against the plate, under 4.5
      _wrapText(ctx, c.sub, colX, baseY + Math.round(bh * 0.30), colW,
                Math.round(bh * 0.085), Math.round(bh * 0.058), '500', F, 2);
    }
    _dots(ctx, colX, y + bh - pad * 0.7, bh, shown);
    ctx.restore();
    ctx.restore();
  };

  // §CPE_CARD_FIT — shrink to fit, then ellipsis only if still over. `floor` is the smallest size
  // still worth printing; below that the text is decoration, so it gets the ellipsis instead.
  function _fitText(ctx, text, x, y, maxW, size, floor, weight, F) {
    var px = size;
    while (px > floor) {
      ctx.font = weight + ' ' + px + 'px ' + F;
      if (ctx.measureText(text).width <= maxW) break;
      px -= 1;
    }
    ctx.font = weight + ' ' + px + 'px ' + F;
    ctx.fillText(_fit(ctx, text, maxW), x, y);
    return px;
  }

  // §CPE_CARD_FIT — shrink, then wrap across at most `maxLines`, then ellipsis on the last line.
  // Word-boundary wrap: a mid-word break reads as a rendering bug, which is the whole complaint.
  function _wrapText(ctx, text, x, y, maxW, size, floor, weight, F, maxLines) {
    var px = size;
    // shrink first — one readable line beats two small ones
    while (px > floor) {
      ctx.font = weight + ' ' + px + 'px ' + F;
      if (ctx.measureText(text).width <= maxW) break;
      px -= 1;
    }
    ctx.font = weight + ' ' + px + 'px ' + F;
    if (ctx.measureText(text).width <= maxW) { ctx.fillText(text, x, y); return px; }
    var words = String(text).split(/\s+/), lines = [], cur = '';
    for (var i = 0; i < words.length; i++) {
      var next = cur ? cur + ' ' + words[i] : words[i];
      if (ctx.measureText(next).width <= maxW || !cur) { cur = next; }
      else { lines.push(cur); cur = words[i]; if (lines.length === maxLines) break; }
    }
    if (cur && lines.length < maxLines) lines.push(cur);
    for (var j = 0; j < lines.length; j++) {
      var last = (j === lines.length - 1);
      var overflowed = last && (lines.length === maxLines) &&
                       (words.join(' ').indexOf(lines[j]) + lines[j].length < words.join(' ').length);
      ctx.fillText(overflowed ? _fit(ctx, lines[j] + ' …', maxW) : lines[j], x, y + j * Math.round(px * 1.25));
    }
    return px;
  }

  // dots: which of the revolving slots this is, so a viewer knows more are coming
  function _dots(ctx, dx, dy, bh, shown) {
    var dr = Math.max(2, Math.round(bh * 0.016)), gap = dr * 3, i2;
    for (i2 = 0; i2 < shown.n; i2++) {
      ctx.beginPath(); ctx.arc(dx + i2 * gap, dy, dr, 0, Math.PI * 2);
      ctx.fillStyle = (i2 === shown.idx) ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.28)';
      ctx.fill();
    }
  }

  // shared frosted-glass backdrop — one implementation for both panel modes
  function _glass(ctx, x, y, bw, bh, rad) {
    try {
      if (typeof ctx.filter !== 'string' || typeof document === 'undefined' || !document.createElement) return false;
      var tmp = document.createElement('canvas');
      tmp.width = bw; tmp.height = bh;
      tmp.getContext('2d').drawImage(ctx.canvas, x, y, bw, bh, 0, 0, bw, bh);
      ctx.save();
      _round(ctx, x, y, bw, bh, rad); ctx.clip();
      ctx.filter = 'blur(9px)';
      ctx.drawImage(tmp, x - 9, y - 9, bw + 18, bh + 18);
      ctx.filter = 'none';
      ctx.restore();
      return true;
    } catch (e) { return false; }
  }

  // ── The ONLY place the panel is drawn, so live preview and baked video cannot disagree.
  // Same box, same plate, same pie column as the stat-card mode — only the content column differs.
  A.resourcePanelCompositeOntoCanvas = function (ctx, w, h, info, opacity, pos, stackY) {
    if (!ctx || !info || !(opacity > 0)) return;
    // ROUND 16 item 1 — the panel's own height is sized for the ROWS ACTUALLY SHOWN this frame
    // (never a pre-scanned worst case); stashed on A for §HUD_LAYOUT's own independent recompute-
    // and-compare check (cinema_maxq.js), so that witness never re-reads B.bh itself (a tautology)
    // but recomputes the EXPECTED height fresh from h + this row count.
    var shownRows = (info.rows && info.rows.length) ? Math.min(8, info.rows.length) : 0;
    A._resPanelShownRows = shownRows;
    // ROUND 20 — Cost/Ledger row data built ONCE here (never re-derived inside `_box()` or
    // `_pieCostLedgerRows()`), so the height formula below and the actual draw further down can
    // never disagree about which rows exist this frame. Stashed on A (mirrors `_resPanelShownRows`)
    // for cinema_maxq.js's own independent `expectedPanelH` recompute to read — never read back from
    // `panel.h` itself, which would be a tautology.
    var clRows = _costLedgerRowsData();
    A._resPanelClRows = clRows.length;
    var B = _box(w, h, pos, stackY, shownRows, clRows.length);
    ctx.save();
    ctx.globalAlpha = Math.min(1, opacity);
    _plate(ctx, B);
    _pie(ctx, B, info);
    ctx.save();
    _round(ctx, B.x, B.y, B.bw, B.bh, B.rad); ctx.clip();
    ctx.translate(B.x, B.y);
    // §129.7 item 8b — the list now spans the FULL panel width (B.bw, never the narrower B.bwBase
    // side column), starting below the pie's own exclusive band (B.pieBandH).
    var listEnd = _drawList(ctx, B.bw, B.bh, info, B.pieBandH, B);
    // §129.7 item 8a — the list's own rect, registered so §HUD_LAYOUT's `pieExclusive` witness has
    // a real sibling rect to check "nothing beside the pie" against (a band that starts exactly
    // where the pie's own band ends can never overlap it by construction; this registration is what
    // makes that a checked fact, not an assumption). Bounded by `listEnd.ry` (where the list's own
    // drawn content actually stopped THIS frame), never `B.bh`.
    if (A._hudLayoutRegister) A._hudLayoutRegister('pie.list', B.x, B.y + B.pieBandH, B.bw, Math.max(0, listEnd.ry - B.pieBandH), 'resource-panel');
    // ROUND 20 (2026-09-16, red1 ruling — MERGES Round 16 item 1's separate `hud.fiveD` box back into
    // this SAME clip/translate block, right after the trade list): the row TEXT now inherits the SAME
    // `ctx.globalAlpha = opacity` set above (the real bug fixed this round — see `_pieCostLedgerRows`'s
    // own comment), and `pie.cost`/`pie.ledger` register with `resource-panel` as their parent.
    if (clRows.length) _pieCostLedgerRows(ctx, B.bw, B, clRows, listEnd);
    ctx.restore();
    ctx.restore();
    if (A._hudLayoutRegister) A._hudLayoutRegister('resource-panel', B.x, B.y, B.bw, B.bh);
  };

  // §CPE_PIE_HOLD / §129.7 item 8a (2026-09-16, SUPERSEDES the side-by-side layout below) — the
  // pie's OWN geometry only, now sized to its EXCLUSIVE band (full `bw`, band height `bh` — the
  // list below has its OWN separate layout, see `_drawList`, never sharing this column math again).
  // §CPE_RESOURCE_PANEL_LAYOUT (2026-08-30, found by rendering a real frame): the pie was sized from
  // panel HEIGHT and the list took whatever was left over — which at 216x187 was 3.5 PIXELS. Trade
  // names rendered as one letter each and "36 on site" was clipped mid-word. §129.7 item 8 (2026-09-
  // 16, same failure mode recurring at a 56%-width list column): the side-by-side split itself was
  // the problem — stacking the pie in its own band and giving the list the FULL width below it is
  // the fix red1 asked for, not another split ratio.
  function _geom(bw, bh) {
    var pad = Math.round(bh * 0.12);
    var R = Math.max(10, Math.min((bw / 2 - pad) / 1.05, (bh - pad * 2) / 2 * 0.90));
    return { pad: pad, cx: bw / 2, cy: bh / 2, R: R, RY: R * 0.52, depth: Math.max(4, R * 0.30) };
  }

  // The pie + ring ONLY, on a transparent bitmap — cached and shared by both panel modes.
  // When info.held is true the wedges are dimmed and the day they are from is printed under them:
  // a held pie is a claim about a PAST day and must say so on screen (§CPE_PIE_HOLD rule 2).
  // The ring is NOT dimmed — elapsed programme fraction is still live and true after topout.
  function _pieBitmap(bw, bh, info, lit) {
    var c = document.createElement('canvas');
    c.width = bw; c.height = bh;
    var g = c.getContext('2d');
    var G = _geom(bw, bh);
    var cx = G.cx, cy = G.cy, R = G.R, RY = G.RY, depth = G.depth;

    // ══ 1. Progress ring — the outer perimeter. The elapsed arc is solid; the balance is an EMPTY
    // GLASS CYLINDER (the user's phrase): a translucent wall with a rim highlight, so the remainder
    // reads as "still to build" rather than as chart background.
    var ringR = R * 1.20, ringRY = RY * 1.20, ringW = Math.max(3, R * 0.13);
    var a0 = -Math.PI / 2, a1 = a0 + info.progress * Math.PI * 2;
    g.save();
    g.lineWidth = ringW;
    g.strokeStyle = 'rgba(255,255,255,0.13)';
    _ellipseArc(g, cx, cy + depth * 0.5, ringR, ringRY, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.13)';
    _ellipseArc(g, cx, cy, ringR, ringRY, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 1;
    _ellipseArc(g, cx, cy, ringR, ringRY, 0, Math.PI * 2); g.stroke();
    g.restore();
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
    g.save();
    if (info.held) g.globalAlpha = HELD_DIM;
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
    g.strokeStyle = 'rgba(255,255,255,0.30)'; g.lineWidth = Math.max(1, R * 0.06);
    var sa = Math.atan2(lit.y, lit.x);
    _ellipseArc(g, cx, cy, R * 0.88, RY * 0.88, sa - 0.55, sa + 0.55); g.stroke();
    g.restore();

    // ══ 3. The held caption. Only drawn when the composition is NOT today's.
    if (info.held) {
      var fs = Math.max(8, Math.round(bh * 0.062));
      g.font = '600 ' + fs + 'px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(255,255,255,0.62)';
      g.fillText('day ' + ((info.heldDayKey || 0) + 1), cx,
                 Math.min(bh - fs * 0.8, cy + ringRY + depth + fs * 1.05));
      g.textAlign = 'left';
    }
    return c;
  }

  // ══ 4. Avatar + qty rows, drawn live into the panel's own space (translated by the caller).
  // The staffage PNGs already vendored are office/street people (sitting formal, walking with
  // shopping) — wrong for a trade, so the figure is drawn: a hard-hat silhouette tinted per trade.
  // Zero assets, crisp at any export size.
  // §129.7 item 8b (2026-09-16, SUPERSEDES the side-by-side 0.56-column split) — the list now
  // ALWAYS spans the panel's full inner width (nothing sits beside it any more — the pie moved to
  // its own exclusive band, see `_geom`/`_pie`), starting at `topY` (the pie band's own height when
  // one precedes it, 0 for a caller with no pie at all — e.g. the Reveal-round roster slot,
  // §CPE_PIE_FLYOUT_DROP, unchanged in spirit, just no longer a width toggle).
  // ROUND 13 item D (2026-09-16, user after sighting: "the other text lines are too large. Keep
  // them same size as before, allow the pie only to grow") — `B` (the panel's OWN `_box()` result,
  // NEW optional param) carries `fs0`/`pad` ANCHORED TO `bh0` (the fixed, pre-growth reference —
  // see `_box`'s own comment); font/pad here now read THOSE instead of re-deriving from `bh`, which
  // is the panel's GROWN total height since the pie band was added — the regression this fixes is
  // exactly that re-derivation (`Math.round(bh*0.085)` off a `bh` that now includes the pie band,
  // so the text grew right along with it, even though `_box()` had already computed a fixed `fs0`
  // for this purpose and simply never wired it in here). `bh` is STILL used for `maxRows` (how many
  // rows actually fit THIS frame's real, grown panel) — only the font/pad are pinned.
  function _drawList(g, bw, bh, info, topY, B) {
    var fs0 = (B && B.fs0) || Math.max(9, Math.round(bh * 0.085));   // fallback only for a caller with no B (none currently)
    var pad = (B && B.pad) || Math.round(bh * 0.10);
    var top = topY || 0, lx = pad, availW = bw - pad * 2;
    var fs = fs0;
    A._resPanelRowFontPx = fs;   // ROUND 13 item D — §HUD_LAYOUT's own `rowFontPx=` reads this, never a flag/formula
    var rowH = Math.round(fs * 1.55);
    var maxRows = Math.max(1, Math.floor((bh - top - pad * 2 - fs * 1.4) / rowH));
    var i, row, col;
    g.save();
    if (info.held) g.globalAlpha = HELD_DIM;
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.font = '700 ' + Math.round(fs * 1.15) + 'px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
    g.fillStyle = '#fff';
    g.fillText(info.totalHeads + ' on site', lx, top + pad + fs * 0.7);
    g.font = '600 ' + fs + 'px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
    var ry = top + pad + fs * 0.7 + rowH * 0.95;
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
      ry += rowH;
    }
    g.restore();
    // Kept for callers that still read where the list visually ended (informational only since
    // item 8c: Cost/Ledger no longer append after this — see _pieCostLedgerRows's own pinned `ry`).
    return { ry: ry, lx: lx, availW: availW, fs: fs, rowH: rowH };
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
