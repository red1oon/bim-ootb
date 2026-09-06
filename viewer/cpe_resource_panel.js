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
                 sub: cf.broad.toLocaleString() + ' bbox candidates  ·  ' + falsePct + '% false at mesh level',
                 src: 'clash_film.js §CLASH_FILM_BUILD' });
    }
    console.log('§CPE_BIG_STATS cards=' + out.length + (out.length
      ? ' [' + out.map(function (c) { return c.label; }).join(' | ') + ']'
      : ' INCONCLUSIVE — no source available (A.db=' + !!A.db + ' ops=' + (ops ? ops.length : 0) + '); panel omitted, not blank'));
    return out.length ? out : null;
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
  function _box(w, h, pos, stackY) {
    var bw = Math.round(h * 0.36), bh = Math.round(h * 0.24);
    var margin = Math.round(h * 0.028);
    var at = (pos && POS[pos]) ? pos : 'tr';
    var sy = stackY || 0;
    return { bw: bw, bh: bh, rad: Math.round(bh * 0.09),
             x: (at === 'tl' || at === 'bl') ? margin : w - margin - bw,
             y: (at === 'bl' || at === 'br') ? h - margin - bh - sy : margin + sy };
  }

  // ── Frosted plate. Cheap only HERE: _captureFrame has already drawn the rendered frame into this
  // context, so the pixels behind the panel exist and can be blurred back over themselves. ONE
  // implementation for both modes — the plate must not change tone as the content swaps.
  function _plate(ctx, B) {
    var glass = _glass(ctx, B.x, B.y, B.bw, B.bh, B.rad);
    _round(ctx, B.x, B.y, B.bw, B.bh, B.rad);
    ctx.fillStyle = glass ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.45)';
    ctx.fill();
    _round(ctx, B.x, B.y, B.bw, B.bh, B.rad);
    ctx.strokeStyle = 'rgba(255,255,255,0.20)'; ctx.lineWidth = 1; ctx.stroke();
  }

  // ── The pie + ring are static for a whole calendar day, so they are rendered once into an
  // offscreen canvas and blitted. The user's own instruction: "yes reprint if no change".
  // Cached across BOTH modes, so a held pie costs nothing extra for the whole reveal.
  var _pieKey = null, _pieCanvas = null;
  function _pie(ctx, B, info) {
    var lit = A.resourcePanelLightDir();
    var key = (info.held ? 'H' : 'L') +
              (info.heldDayKey == null ? info.dayKey : info.heldDayKey) +
              '|' + B.bw + 'x' + B.bh + '|' + info.rows.length + '|' + info.totalHeads +
              '|' + info.progress.toFixed(3) + '|' + lit.x.toFixed(2) + ',' + lit.y.toFixed(2);
    if (_pieKey !== key || !_pieCanvas) { _pieCanvas = _pieBitmap(B.bw, B.bh, info, lit); _pieKey = key; }
    if (!_pieCanvas) return;
    ctx.save();
    _round(ctx, B.x, B.y, B.bw, B.bh, B.rad); ctx.clip();
    ctx.drawImage(_pieCanvas, B.x, B.y);
    ctx.restore();
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
    var B = _box(w, h, pos, stackY);
    var bw = B.bw, bh = B.bh, x = B.x, y = B.y, rad = B.rad;
    ctx.save();
    ctx.globalAlpha = Math.min(1, opacity);
    _plate(ctx, B);

    // The pie does NOT leave when the trades do — it holds the last real composition in exactly the
    // place it occupied all through the build, dimmed and captioned with the day it is from.
    // §CPE_PIE_FLYOUT_DROP (2026-09-01): the Reveal round now passes heldInfo=null on purpose —
    // the pie is not drawn there at all and the content keeps this full-width column. The held-pie
    // path below still serves any caller that passes a composition (round 1 semantics unchanged).
    var G = _geom(bw, bh);
    var colX = x + Math.round(bh * 0.13), colW = bw - Math.round(bh * 0.13) * 2;
    var pieDrawn = false;
    if (heldInfo && heldInfo.rows && heldInfo.rows.length && heldInfo.totalHeads > 0) {
      _pie(ctx, B, heldInfo);
      colX = x + G.lx; colW = G.availW;
      pieDrawn = true;
    }

    ctx.save();
    _round(ctx, x, y, bw, bh, rad); ctx.clip();
    ctx.globalAlpha = Math.min(1, opacity) * shown.opacity;   // the card itself fades, the plate does not
    var pad = Math.round(bh * 0.13);
    // §CPE_STATS_TAIL — the roster slot draws the real trade list, not a number, so the avatars and
    // the ×N counts stay in the rotation instead of being replaced by the cards.
    if (shown.roster) {
      // §CPE_PIE_FLYOUT_DROP — with no pie drawn the roster list takes the full width too, and the
      // slot dots move to the list's own left edge instead of the old right column.
      ctx.save(); ctx.translate(x, y); _drawList(ctx, bw, bh, shown.roster, !pieDrawn); ctx.restore();
      _dots(ctx, x + (pieDrawn ? G.lx : G.pad), y + bh - pad * 0.7, bh, shown);
      ctx.restore(); ctx.restore();
      return;
    }
    var F = 'BlinkMacSystemFont,"Segoe UI",Roboto,-apple-system,sans-serif';
    // THE NUMBER — as large as will fit, because the whole point is grasping it at a glance.
    var big = Math.round(bh * 0.42), tw;
    do { ctx.font = '800 ' + big + 'px ' + F; tw = ctx.measureText(c.big).width; if (tw <= colW) break; big -= 2; }
    while (big > 14);
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    var baseY = y + pad + big * 0.86;
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
      ctx.fillStyle = 'rgba(255,255,255,0.60)';
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
    var B = _box(w, h, pos, stackY);
    ctx.save();
    ctx.globalAlpha = Math.min(1, opacity);
    _plate(ctx, B);
    _pie(ctx, B, info);
    ctx.save();
    _round(ctx, B.x, B.y, B.bw, B.bh, B.rad); ctx.clip();
    ctx.translate(B.x, B.y);
    _drawList(ctx, B.bw, B.bh, info);
    ctx.restore();
    ctx.restore();
  };

  // §CPE_PIE_HOLD — ONE panel, ONE geometry, in BOTH modes: [ pie + ring ] | [ content ].
  // The pie's position is computed here and nowhere else, so the trade list and the revolving stat
  // card sit in exactly the same column and the pie cannot move or vanish between them.
  // §CPE_RESOURCE_PANEL_LAYOUT (2026-08-30, found by rendering a real frame, not by reading): the
  // pie was sized from panel HEIGHT and the list took whatever was left over — which at 216x187 was
  // 3.5 PIXELS. Trade names rendered as one letter each and "36 on site" was clipped mid-word. The
  // content column's width is RESERVED FIRST and the pie fits into the remainder, so the text can
  // never be squeezed out no matter how the panel is proportioned. Widened again after a real baked
  // frame showed "Conc...", "Steel...", "Pipefit..." all truncating.
  function _geom(bw, bh) {
    var pad = Math.round(bh * 0.10);
    var listW = Math.max(Math.round(bw * 0.56), 110);
    var pieW = bw - listW - Math.round(pad * 1.4);
    var R = Math.max(10, Math.min(pieW / 2 / 1.22, (bh - pad * 2) / 2 * 0.82));
    return { pad: pad, listW: listW, pieW: pieW, cx: pad + pieW / 2, cy: bh / 2,
             R: R, RY: R * 0.52, depth: Math.max(4, R * 0.30),
             lx: bw - listW, availW: listW - pad };
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
  // §CPE_PIE_FLYOUT_DROP — `fullW` (optional, Reveal-round roster slot only): no pie is on the
  // panel, so the list starts at the left pad and spans the whole plate instead of the 0.56 column
  // §CPE_HUD_ORDER reserved beside the pie. Round-1 callers pass nothing and are unchanged.
  function _drawList(g, bw, bh, info, fullW) {
    var G = _geom(bw, bh), pad = G.pad, lx = fullW ? G.pad : G.lx,
        availW = fullW ? bw - G.pad * 2 : G.availW;
    var fs = Math.max(9, Math.round(bh * 0.085));
    var rowH = Math.round(fs * 1.55);
    var maxRows = Math.max(1, Math.floor((bh - pad * 2 - fs * 1.4) / rowH));
    var i, row, col;
    g.save();
    if (info.held) g.globalAlpha = HELD_DIM;
    g.textAlign = 'left'; g.textBaseline = 'middle';
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
    g.restore();
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
