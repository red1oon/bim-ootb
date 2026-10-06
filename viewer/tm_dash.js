// time_machine family — part `dash` (original time_machine.js lines 8256–8926).
// GENERATED move-only by scripts/split_closure.js (config scripts/split_configs/time_machine.json). Below the `yield` every
// statement is the original text; the only edit is that a name owned by ANOTHER part is reached as TMS.name.
// Edit this file normally from now on; regenerate only to re-split a branch that still edits the old single file.
(typeof window !== 'undefined' ? window : globalThis).__timeMachineParts = (typeof window !== 'undefined' ? window : globalThis).__timeMachineParts || {};
(typeof window !== 'undefined' ? window : globalThis).__timeMachineParts.dash = function* __split_time_machine_dash(TMS) {
  'use strict';
  // phase 1 — publish this part's names that other parts use (same function objects; vars as live accessors)
  TMS.drawGanttMini = drawGanttMini;
  TMS.toggleDashDOM = toggleDashDOM;
  TMS.findBarAtClick = findBarAtClick;
  TMS.barsInRect = barsInRect;
  TMS.drawDashboard = drawDashboard;
  Object.defineProperty(TMS, '_GANTT_CACHE_VERSION', { get: function () { return _GANTT_CACHE_VERSION; }, set: function (v) { _GANTT_CACHE_VERSION = v; }, enumerable: true });
  yield;   // phase 2 resumes here, in this same scope: the original statements, in original order


  function drawGanttMini() {
    var _L = (typeof TMS._tmTrl === 'function') ? TMS._tmTrl : function (k, en, r) { var s = en; if (r) for (var q in r) s = s.replace('{' + q + '}', r[q]); return s; };   // S226 §R2b — sliced into vm sandboxes by witnesses
    if (!TMS._ops.length) return;
    var canvas = document.getElementById('tm-gantt-canvas');
    var box = document.getElementById('tm-gantt-box');
    if (!canvas || !box) return;
    TMS.buildGanttTasks();
    if (!TMS._ganttTasks.length) return;
    TMS.wireGanttResize();
    TMS.wireGanttRulerShift();
    // §GANTT_EDIT_LOCK: wire the lock toggle once, and auto-materialize a schedule the first time
    // this drawer has nothing editable to show (replaces the old §GANTT_AUTHOR_ENTRY button — no
    // click required, no side panel involved). One attempt per activate() (_ganttAutoGenAttempted),
    // so a genuine materialize failure doesn't retry every redraw.
    (function () {
      var editable = 0;
      for (var q = 0; q < TMS._ganttTasks.length; q++) if (TMS._ganttTasks[q].taskId) editable++;
      var lockBtn = document.getElementById('tm-gantt-editlock');
      if (lockBtn && !lockBtn._wired) {
        lockBtn._wired = true;
        lockBtn.addEventListener('pointerup', function (e) {
          e.stopPropagation();
          function applyLockUi() {
            lockBtn.innerHTML = TMS._ganttEditable ? '&#x1F513; ' + _L('tm_editing', 'Editing') : '&#x1F512; ' + _L('tm_locked', 'Locked');
            lockBtn.title = TMS._ganttEditable
              ? _L('tm_tt_editing', 'Editing: drag to move/resize, drag onto another bar to link, double-click for typed edit. Click to lock.')
              : _L('tm_tt_locked', 'Locked: drag/resize/link disabled, timeline still scrubs live. Click to unlock editing.');
            console.log('§GANTT_EDIT_LOCK editable=' + TMS._ganttEditable);
            // §TM_PANEL_RESIZE auto-expand (user ruling 2026-08-05): editing needs elbow room (the
            // props panel alone is ~330px wide) — widen automatically rather than making the user find
            // the new resize grip every time. Only expands if narrower than the edit width already (a
            // user who manually widened past it keeps their own choice); restores to whatever width was
            // active the moment editing turned on, so a manual resize DURING editing is not fought.
            if (TMS._panel) {
              var curW = TMS._panel.getBoundingClientRect().width;
              if (TMS._ganttEditable) {
                TMS._panelWPreEdit = curW;
                if (curW < TMS.PANEL_W_EDIT) { TMS._panelW = TMS.PANEL_W_EDIT; TMS._panel.style.width = TMS.PANEL_W_EDIT + 'px'; }
              } else if (TMS._panelWPreEdit != null) {
                TMS._panelW = TMS._panelWPreEdit; TMS._panel.style.width = TMS._panelWPreEdit + 'px'; TMS._panelWPreEdit = null;
              }
            }
          }
          if (TMS._ganttEditable) {
            // §GANTT_LOCK_INTEGRITY: 🔓→🔒 verifies the EDITED schedule still holds physical
            // integrity before the lock is accepted. Breach ⇒ the lock is REFUSED (stays Editing),
            // the flag names the floaters, and ↺ Undo (or further corrective edits) is the way out —
            // the gate is stateless, every lock attempt re-audits, so undo depth vs breach depth
            // (spec open-question 1) needs no edit-history tracing. Only THIS transition is gated
            // (spec Q2); unlock below never verifies.
            var lm = document.getElementById('tm-gantt-lockmsg');
            if (lm) { lm.textContent = _L('tm_verifying', 'Verifying integrity…'); lm.style.color = ''; }
            setTimeout(function () {   // let the "Verifying…" state paint before the audit runs (spec Q3)
              var v = TMS.verifyGanttIntegrity();
              if (!v.ok) {
                console.log('§GANTT_LOCK_BREACH floating=' + v.floating + '(+' + v.dFloating + ') midair=' +
                  (v.midair || 0) + '(+' + (v.dMidair || 0) + ')/' + v.total + ' ms=' + v.ms +
                  ' sample=[' + v.guids.slice(0, 5).join(',') + '] (lock refused — Undo or fix, then lock again)');
                if (lm) {
                  var _breach = [];
                  if (v.dFloating > 0) _breach.push(_L('tm_breach_floating', '+{n} floating', { n: v.dFloating }));
                  if (v.dMidair > 0) _breach.push(_L('tm_breach_midair', '+{n} hanging in midair', { n: v.dMidair }));
                  lm.textContent = _L('tm_breach', '⚠ Integrity Breach: {list} — press ↺ Undo edit (or fix), then lock again', { list: _breach.join(' + ') });
                  lm.style.color = '#f66';
                }
                return;   // REFUSED — _ganttEditable stays true, nothing hidden
              }
              console.log('§GANTT_LOCK_VERIFY ok floating=' + v.floating + '/base=' + v.baseFloating +
                ' midair=' + v.midair + '/base=' + v.baseMidair + ' total=' + v.total + ' ms=' + v.ms +
                (v.skipped ? ' skipped=' + v.skipped : ''));
              if (lm) { lm.textContent = ''; lm.style.color = ''; }
              TMS._ganttEditable = false;
              applyLockUi();
            }, 0);
            return;
          }
          TMS._ganttEditable = true;
          TMS.captureLockBaseline();   // §GANTT_LOCK_DELTA: the state the planner inherited
          applyLockUi();
        });
      }
      var lockMsg = document.getElementById('tm-gantt-lockmsg');
      if (lockMsg) lockMsg.textContent = editable ? '' : (TMS._ganttAutoGenAttempted ? _L('tm_no_schedule_available', 'No schedule available') : '');
      if (!editable && !TMS._ganttAutoGenAttempted) {
        TMS._ganttAutoGenAttempted = true;
        console.log('§GANTT_AUTO_GENERATE no editable bars — materializing a schedule natively');
        TMS.generateGanttSchedule();
      }
    })();
    if (TMS._ganttBoxH) box.style.maxHeight = TMS._ganttBoxH + 'px';

    // §GANTT_PALETTE: the phase legend strip is GONE (user: "the legend is redundant, just hover
    // labelling is sufficient"). The hover tooltip already reports strictly more than the legend did
    // — storey, phase, element count, day range AND the generated-vs-IFC-4D source — so the legend
    // carried no information of its own. Removing it returns its row of vertical space to the bars.

    // Canvas sizing
    var barH = 12, gapH = 2, rowH = barH + gapH;
    var marginL = 60; // storey labels
    var numTasks = TMS._ganttTasks.length;
    var cW = box.clientWidth;
    var cH = numTasks * rowH + 4;
    var barW = cW - marginL;

    canvas.width = cW * (window.devicePixelRatio || 1);
    canvas.height = cH * (window.devicePixelRatio || 1);
    canvas.style.height = cH + 'px';
    var ctx = canvas.getContext('2d');
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

    ctx.clearRect(0, 0, cW, cH);

    // §GANTT_AXIS_OUTLIER: qualified DISPLAY axis (see var declarations) — bars/ruler/gridlines/hairline
    // all draw against this, never the real playback _projectStart/_projectEnd.
    var range = Math.max(1, TMS._ganttAxisEnd - TMS._ganttAxisStart);
    var prevStorey = '';

    // §GANTT_RULER (E5): draw the sticky axis header, then lay its ticks down the bar canvas as
    // gridlines. Same tick set for both, so a bar's edge can be read against a real date instead of
    // being eyeballed against nothing. Drawn BEFORE the bars so it never sits on top of them.
    var R = TMS.drawGanttRuler(cW, marginL, barW);
    if (R) {
      ctx.strokeStyle = 'rgba(120,140,160,0.13)';
      ctx.lineWidth = 1;
      R.ticks.forEach(function (t) {
        var gx = Math.round(marginL + (t.ts - TMS._ganttAxisStart) / range * barW) + 0.5;
        if (gx < marginL || gx > marginL + barW) return;
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, cH); ctx.stroke();
      });
    }

    // Draw bars
    for (var ti = 0; ti < numTasks; ti++) {
      var task = TMS._ganttTasks[ti];
      var x = marginL + (task.startTs - TMS._ganttAxisStart) / range * barW;
      var w = (task.endTs - task.startTs) / range * barW;
      if (w < 2) w = 2;
      var y = ti * rowH + 2;
      var color = TMS.PHASE_COLORS[task.phase] || '#888';

      // Storey label (only if different from previous row)
      if (task.storey !== prevStorey) {
        prevStorey = task.storey;
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#999';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(task.storey.substring(0, 8), marginL - 4, y + barH / 2);
      }

      // Active highlight: cursor is within this task's time range
      var isActive = (TMS._cursor >= task.startTs && TMS._cursor <= task.endTs);

      // §GANTT_PALETTE: fills at full opacity — 0.8 flattened what little contrast the old palette
      // had. The families carry the distinction now, so the bars can be read at a glance.
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, barH);

      // §gate: captured (preset IFC 4D) bars get a bright-yellow frame so you can tell the real
      // programme from the generated fallback. cap = #captured ops in this storey|phase group.
      if (task.cap > 0) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#ffeb3b';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, Math.max(1, w - 1), barH - 1);
      }

      if (isActive) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#ff8c00';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, w, barH);
      }

      // §GANTT_GROUP_MOVE — marquee-selected bars get a bright cyan frame, same idea as the
      // captured-schedule yellow frame above (a different concern, so a different colour, drawn
      // last so it always reads on top). Selection is ephemeral UI state (_ganttSelected), not
      // persisted — this is the only place it's visible.
      if (task.taskId && TMS._ganttSelected[task.taskId]) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#4fc3f7';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 1, y - 1, w + 2, barH + 2);
      }

      // §GANTT_CPM_ANNOTATE (§S68/§S74): float rail on the BOTTOM edge — red = on the critical path
      // (zero float), green = has slack. DRAWN LAST, and that placement is the fix, not a preference:
      // §S68 drew it right after the bar fill, so the yellow captured-schedule frame (a 1px
      // strokeRect around the whole bar) painted straight over its bottom row. MEASURED on the live
      // site before this change — canvas pixels read back, not eyeballed — 19 bars: the rail showed
      // on only ONE of its two rows (railVisibleAt row h-2 = 15, at h-1 = 0) and the yellow frame
      // owned h-1 on 17 of 19. A 2px cue that renders as 1px, half of it blended against the phase
      // fill, is why it read as "no visual cue at all".
      // NOT a fourth stroke frame: yellow (captured), orange (cursor-active) and cyan
      // (marquee-selected) already take all three, and a fourth at this row height is unreadable.
      // Why BOTH colours rather than red-only: MEASURED over the 8-building fleet with the real rate
      // tables, criticality runs 27–82% of tasks (witness_gantt_cpm_annotate.js W-CPM-5). At the top
      // of that range a red-only rail marks four bars in five and carries almost no signal; painting
      // the complement makes the SCARCE thing — the bars that can actually move without pushing the
      // end date — the thing that stands out, at every fraction.
      // The marks are derived FROM the dates the cascade wrote — annotate never moved one.
      var cpmMark = task.taskId ? TMS._ganttCritical[task.taskId] : null;
      if (cpmMark) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = cpmMark.critical ? TMS.CPM_COLOR_CRITICAL : TMS.CPM_COLOR_FLOAT;
        ctx.fillRect(x, y + barH - 2, w, 2);
      }

      // Label: explicit phase short-code (§GANTT_PALETTE). substring(0,3) used to yield "Sub" vs
      // "Sup" — one character apart at 9px, colliding on the very pair the colours also collided on.
      if (w > 40) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = TMS.PHASE_INK[task.phase] || '#fff';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(TMS.PHASE_SHORT[task.phase] || task.phase.substring(0, 3), x + w - 3, y + barH / 2);
      }
    }

    // §GANTT_BAR_RECTS — read-only debug hook, same double-underscore convention as __tmScheduleDebug
    // above. Exposes the ACTUAL drawn rect of every bar so a browser wiring test can aim a synthetic
    // pointer at measured geometry instead of guessing at it. The first attempt at proving the drag
    // aimed at marginL+40px and hit empty canvas past the end of a short bar, which is
    // indistinguishable from "the handler never fired" — this removes that ambiguity for good.
    // §GANTT_AXIS_OUTLIER: hook reads back the qualified axis too, so a live probe sees exactly
    // what's drawn, not the pre-fix unqualified math.
    try {
      window.__tmGanttBars = TMS._ganttTasks.map(function (t, i) {
        var bx = marginL + (t.startTs - TMS._ganttAxisStart) / range * barW;
        var bw = Math.max(2, (t.endTs - t.startTs) / range * barW);
        return { i: i, taskId: t.taskId || null, phase: t.phase, storey: t.storey,
          x: bx, w: bw, y: i * rowH + 2, h: barH, midX: bx + bw / 2, midY: i * rowH + 2 + barH / 2 };
      });
      // §GANTT_BAR_RECTS_RAW (2026-08-17, 4D_GANTT_TM_REFACTOR.md stage 2) — same read-only debug
      // convention as __tmGanttBars above, but the real ms times instead of pixel geometry. Needed
      // to measure the actual rendered bar span (stagger acceptance) without re-deriving ms from
      // pixels through the axis math — a live probe reads exactly what was drawn from, not a
      // reconstruction of it.
      window.__tmGanttBarsRaw = TMS._ganttTasks.map(function (t, i) {
        return { i: i, taskId: t.taskId || null, phase: t.phase, storey: t.storey,
          startTs: t.startTs, endTs: t.endTs, count: t.count };
      });
    } catch (e) {}

    // Hairline cursor. §GANTT_AXIS_OUTLIER: clamp into the qualified axis — the real _cursor can
    // legitimately run past it (e.g. once playback reaches the outlier op itself), and an unclamped
    // hairline would draw far outside the canvas instead of pinning to the visible edge.
    ctx.globalAlpha = 1;
    var hxFrac2 = Math.max(0, Math.min(1, (TMS._cursor - TMS._ganttAxisStart) / range));
    var hx = marginL + hxFrac2 * barW;
    ctx.strokeStyle = '#ff8c00';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hx, 0);
    ctx.lineTo(hx, cH);
    ctx.stroke();

    ctx.globalAlpha = 1;

    // Update div hairline too
    var hair = document.getElementById('tm-gantt-hair');
    if (hair) {
      hair.style.left = hx + 'px';
      hair.style.display = 'block';
    }

    // §S260c: Auto-scroll Gantt drawer to keep active bar visible during playback
    if (TMS._playing && box.scrollHeight > box.clientHeight) {
      for (var ai = 0; ai < numTasks; ai++) {
        if (TMS._cursor >= TMS._ganttTasks[ai].startTs && TMS._cursor <= TMS._ganttTasks[ai].endTs) {
          var activeY = ai * rowH;
          var scrollTarget = activeY - box.clientHeight / 2;
          if (Math.abs(box.scrollTop - scrollTarget) > rowH * 2) {
            box.scrollTop += (scrollTarget - box.scrollTop) * 0.15; // smooth scroll
          }
          break;
        }
      }
    }
  }

  // ── Dashboard DOM toggle ──
  function toggleDashDOM(on) {
    var col = document.getElementById('tm-dash-col');
    if (col) col.classList.toggle('open', on);
    var btn = document.getElementById('tm-dash');
    if (btn) btn.classList.toggle('tm-active', on);
  }

  // ── Find bar at click/hover ──
  function findBarAtClick(e) {
    if (!TMS._ganttTasks.length) return null;
    var rect = e.target.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    var barH = 12, gapH = 2, rowH = barH + gapH;
    var cW = rect.width;
    // §GANTT_AXIS_OUTLIER: must match drawGanttMini's own bar geometry, which draws against the
    // qualified axis — hit-testing against the unqualified one would silently miss bars.
    var range = Math.max(1, TMS._ganttAxisEnd - TMS._ganttAxisStart);
    var marginL = 60;
    var barW = cW - marginL;
    for (var i = 0; i < TMS._ganttTasks.length; i++) {
      var task = TMS._ganttTasks[i];
      var bx = marginL + (task.startTs - TMS._ganttAxisStart) / range * barW;
      var bw = (task.endTs - task.startTs) / range * barW;
      if (bw < 2) bw = 2;
      var by = i * rowH + 2;
      if (x >= bx && x <= bx + bw && y >= by && y <= by + barH) return task;
    }
    return null;
  }

  // §GANTT_GROUP_MOVE — every task whose drawn rect intersects the given canvas-local marquee
  // rectangle. SAME geometry as findBarAtClick (marginL=60, rowH=14) — a marquee that misses a bar
  // findBarAtClick would also miss is a bug, not a feature, so this deliberately shares the exact
  // constants rather than a second copy of them. Only bars with a real taskId are selectable — an
  // un-authored bar has nothing to shift.
  function barsInRect(cW, rx0, ry0, rx1, ry1) {
    var barH = 12, gapH = 2, rowH = barH + gapH;
    var range = Math.max(1, TMS._ganttAxisEnd - TMS._ganttAxisStart);
    var marginL = 60;
    var barW = cW - marginL;
    var lo = Math.min(rx0, rx1), hi = Math.max(rx0, rx1), top = Math.min(ry0, ry1), bot = Math.max(ry0, ry1);
    var out = [];
    for (var i = 0; i < TMS._ganttTasks.length; i++) {
      var task = TMS._ganttTasks[i]; if (!task.taskId) continue;
      var bx = marginL + (task.startTs - TMS._ganttAxisStart) / range * barW;
      var bw = (task.endTs - task.startTs) / range * barW; if (bw < 2) bw = 2;
      var by = i * rowH + 2;
      if (bx <= hi && bx + bw >= lo && by <= bot && by + barH >= top) out.push(task);
    }
    return out;
  }

  // ── RES_ICONS (reused from boq_charts) ──
  var RES_ICONS = {
    STEEL_ERECTOR:  '\uD83C\uDFD7\uFE0F',
    CONCRETE_GANG:  '\uD83D\uDEA7',
    MASON:          '\uD83E\uDDF1',
    PLUMBER:        '\uD83D\uDEB0',
    HVAC_TECH:      '\u2699\uFE0F',
    ELECTRICIAN:    '\u26A1',
    CARPENTER:      '\uD83E\uDEB5',
    ROOFER:         '\uD83C\uDFE0',
    FINISHER:       '\uD83D\uDD8C\uFE0F',
    LABORER:        '\uD83D\uDC77'
  };

  // ── Donut pie chart ──
  function drawDonut(canvasId, pct, label, sublabel, color) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height, cx = w/2, cy = h/2, r = Math.min(cx,cy) - 8;
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.stroke();
    if (pct > 0) {
      ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI/2, -Math.PI/2 + Math.PI*2*(pct/100));
      ctx.lineWidth = 12; ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.stroke();
    }
    ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy - 6);
    ctx.fillStyle = '#999'; ctx.font = '10px sans-serif';
    ctx.fillText(sublabel, cx, cy + 12);
  }

  // ── Dashboard drawer ──
  var _dashLogTick = 0; // §S260d: throttle dashboard logs
  function drawDashboard() {
    var _L = (typeof TMS._tmTrl === 'function') ? TMS._tmTrl : function (k, en, r) { var s = en; if (r) for (var q in r) s = s.replace('{' + q + '}', r[q]); return s; };   // S226 §R2b — sliced into vm sandboxes by witnesses
    if (!TMS._ops.length) return;
    _dashLogTick++;

    // Time donut — elapsed vs total days
    var totalDays = Math.max(1, Math.round((TMS._projectEnd - TMS._projectStart) / 86400000));
    var curDay = Math.max(0, Math.round((TMS._cursor - TMS._projectStart) / 86400000));
    var timePct = Math.round(curDay / totalDays * 100);
    drawDonut('tm-dash-time-pie', timePct, 'Day ' + curDay, timePct + '% elapsed', '#4fc3f7');

    // Cost donut — weighted by rate_per_day × install duration per op
    // Each op accrues cost proportionally between start and end (not binary done/not-done).
    var LR = window.LABOR_RATES || {};
    var totalCost = 0, doneCost = 0;
    for (var ci2 = 0; ci2 < TMS._ops.length; ci2++) {
      var op2 = TMS._ops[ci2];
      var opRes = (op2.parameters || {}).resource || '';
      var lr = LR[opRes];
      // §FUTURE-5A B5 (applied 2026-09-02, queue item B-3): the bare "95" was an undocumented
      // duplicate of sequence_rules.json LABOR_RATES.LABORER (rate_per_day 95, crew_size 1) — read
      // that entry directly; the literal 95 now fires only if LABORER itself is absent from LR.
      var _laborerLR = LR.LABORER;
      var dailyRate = lr ? lr.rate_per_day * (lr.crew_size || 1)
        : (_laborerLR ? _laborerLR.rate_per_day * (_laborerLR.crew_size || 1) : 95);
      var opStart = op2.start_ts || TMS._projectStart;
      var realEnd = op2.end_ts || TMS._projectEnd;
      var durMs = Math.max(1, realEnd - opStart);
      var durDays = durMs / 86400000;
      var cost = dailyRate * durDays;
      totalCost += cost;
      // Proportional: how much of this op's duration has elapsed at cursor
      if (TMS._cursor >= realEnd) {
        doneCost += cost;
      } else if (TMS._cursor > opStart) {
        doneCost += cost * ((TMS._cursor - opStart) / durMs);
      }
    }
    if (_dashLogTick % 20 === 0) console.log('§COST_DEBUG ops=' + TMS._ops.length + ' totalCost=' + Math.round(totalCost) + ' doneCost=' + Math.round(doneCost) + ' cursor=' + Math.round((TMS._cursor-TMS._projectStart)/86400000) + 'd/' + Math.round((TMS._projectEnd-TMS._projectStart)/86400000) + 'd');
    var costPct = totalCost > 0 ? Math.round(doneCost / totalCost * 100) : 0;
    var costLabel = doneCost >= 1000000 ? '$' + (doneCost/1000000).toFixed(1) + 'M'
                  : doneCost >= 1000 ? '$' + Math.round(doneCost/1000) + 'K'
                  : '$' + Math.round(doneCost);
    drawDonut('tm-dash-cost-pie', costPct, costLabel, costPct + '% spent', '#44cc44');
    if (_dashLogTick % 20 === 0) console.log('§DASH_DONUTS time=' + timePct + '% cost=' + costPct + '%');

    // Phase progress
    var phaseTotals = {};
    var phaseDone = {};
    var PHASE_ORDER = ['Substructure','Superstructure','MEP Rough-in','Architecture','MEP Final','Finishes'];
    for (var i = 0; i < TMS._ops.length; i++) {
      var p = (TMS._ops[i].parameters || {}).phase || 'Architecture';
      if (!phaseTotals[p]) { phaseTotals[p] = 0; phaseDone[p] = 0; }
      phaseTotals[p]++;
      if (TMS._ops[i].end_ts <= TMS._cursor) phaseDone[p]++;
    }

    var phDiv = document.getElementById('tm-dash-phases');
    if (phDiv) {
      var html = '';
      var phaseCount = 0;
      for (var pi = 0; pi < PHASE_ORDER.length; pi++) {
        var ph = PHASE_ORDER[pi];
        if (!phaseTotals[ph]) continue;
        phaseCount++;
        var pct = Math.round(phaseDone[ph] / phaseTotals[ph] * 100);
        var col = TMS.PHASE_COLORS[ph] || '#888';
        html += '<div style="margin:2px 0;font-size:10px">' +
          '<div style="display:flex;justify-content:space-between;color:#ccc"><span>' + ph + '</span><span>' + pct + '%</span></div>' +
          '<div style="height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden">' +
          '<div style="width:' + pct + '%;height:100%;background:' + col + ';transition:width 0.2s"></div></div></div>';
        if (_dashLogTick % 20 === 0) console.log('§DASH_PHASE ' + ph + ' ' + pct + '%');
      }
      phDiv.innerHTML = html;
    }

    // Site resources — frontier ops with progress bars (old GanttChart player style)
    var crews = {};
    var crewTotal = 0;
    var maxCrew = 0;
    var machines = {};
    var EA = window.EQUIPMENT_ALLOCATION || {};
    for (var ci = 0; ci < TMS._ops.length; ci++) {
      var op = TMS._ops[ci];
      if (op.start_ts <= TMS._cursor && op.end_ts > TMS._cursor) {
        var res = (op.parameters || {}).resource || '';
        if (res) {
          if (!crews[res]) crews[res] = 0;
          crews[res]++;
          crewTotal++;
          if (crews[res] > maxCrew) maxCrew = crews[res];
        }
        // Equipment from EQUIPMENT_ALLOCATION
        var opCls = (op.parameters || {}).cls || '';
        var eqAlloc = EA[opCls];
        if (eqAlloc && eqAlloc.equipment) machines[eqAlloc.equipment] = true;
      }
    }
    var RES_COLORS = {
      STEEL_ERECTOR: '#e57373', CONCRETE_GANG: '#ffb74d', MASON: '#a1887f',
      PLUMBER: '#4fc3f7', HVAC_TECH: '#81c784', ELECTRICIAN: '#fff176',
      CARPENTER: '#ce93d8', ROOFER: '#90a4ae', FINISHER: '#f48fb1', LABORER: '#b0bec5'
    };
    var crDiv = document.getElementById('tm-dash-crews');
    if (crDiv) {
      var ch = '';
      for (var r in crews) {
        var icon = RES_ICONS[r] || '\uD83D\uDC77';
        var color = RES_COLORS[r] || '#888';
        var LR = window.LABOR_RATES || {};
        var tradeLabel = LR[r] && LR[r].trade ? LR[r].trade.split(' (')[0] : r.replace(/_/g, ' ');
        var barPct = maxCrew > 0 ? Math.round(crews[r] / maxCrew * 100) : 0;
        ch += '<div style="display:flex;align-items:center;gap:4px;padding:2px 0">' +
          '<span style="font-size:16px;width:22px;text-align:center;flex-shrink:0">' + icon + '</span>' +
          '<span style="width:60px;font-size:9px;color:' + color + ';font-weight:600;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + tradeLabel + '</span>' +
          '<div style="flex:1;height:14px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden">' +
          '<div style="height:100%;width:' + barPct + '%;background:' + color + ';border-radius:3px;transition:width 0.3s"></div></div>' +
          '<span style="width:24px;text-align:right;font-size:13px;font-weight:800;color:' + color + ';flex-shrink:0">' + crews[r] + '</span></div>';
      }
      // Equipment row
      var machList = Object.keys(machines);
      var ER = window.EQUIPMENT_RATES || {};
      if (machList.length) {
        ch += '<div style="margin-top:3px;padding-top:3px;border-top:1px solid rgba(255,255,255,0.05)">';
        for (var mi2 = 0; mi2 < machList.length; mi2++) {
          var eqDesc = ER[machList[mi2]] ? ER[machList[mi2]].desc : machList[mi2].replace(/_/g, ' ');
          ch += '<div style="display:flex;align-items:center;gap:4px;padding:1px 0;color:rgba(255,255,255,0.5)">' +
            '<span style="font-size:13px;width:22px;text-align:center">\uD83D\uDE9C</span>' +
            '<span style="font-size:9px">' + eqDesc + '</span></div>';
        }
        ch += '</div>';
      }
      // Footer
      ch += '<div style="font-size:9px;color:rgba(255,255,255,0.4);margin-top:4px;padding-top:3px;border-top:1px solid rgba(255,255,255,0.05)">' +
        '<strong style="color:rgba(255,255,255,0.7)">' + crewTotal + '</strong> workers \u00B7 ' +
        '<strong style="color:rgba(255,255,255,0.7)">' + machList.length + '</strong> machines</div>';
      if (!crewTotal) ch = '<div style="color:#666;font-size:10px">No active crews</div>';
      crDiv.innerHTML = ch;
    }

    // S-Curve sparkline
    if (!TMS._sCurveData) computeSCurve();
    // §E2b: trigger shopfloor load on first draw; invalidate S-curve when it arrives so stacked data renders
    if (!TMS._shopfloor && !TMS._shopfloorLoading) {
      TMS._loadShopfloor().then(function (sf) {
        if (sf) { TMS._sCurveData = null; if (TMS._dashVisible) { computeSCurve(); drawSCurve(); } }
      });
    }
    drawSCurve();

    // Day counter
    var totalDays = Math.max(1, Math.round((TMS._projectEnd - TMS._projectStart) / 86400000));
    var curDay = Math.max(0, Math.round((TMS._cursor - TMS._projectStart) / 86400000));
    var totalDone = 0;
    for (var di = 0; di < TMS._ops.length; di++) { if (TMS._ops[di].end_ts <= TMS._cursor) totalDone++; }
    var donePct = Math.round(totalDone / TMS._ops.length * 100);
    var dc = document.getElementById('tm-dash-daycnt');
    if (dc) dc.textContent = _L('tm_day_of_total', 'Day {c} / {t} \u2014 {p}% complete', { c: curDay, t: totalDays, p: donePct });

    // §S260e: Throttle — was spamming every tick during playback
    if (!drawDashboard._tick) drawDashboard._tick = 0;
    if (++drawDashboard._tick % 20 === 0) {
      console.log('§DASH_OPEN phases=' + phaseCount + ' crews=' + crewTotal);
    }
  }

  // §E2b — STACKED S-curve: if shopfloor data loaded, stacks Material/Labor/Burden/Overhead cost elements;
  // else falls back to op-count monotonic curve. "Batch lights together" = all elements of an order accrue
  // at its finish date (not during; binary done/not-done per order, monotonic by construction). W-SHOP-SCURVE.
  var _SF_ELEMS = ['Material', 'Labor', 'Burden', 'Overhead'];
  var _SF_COLORS = { Material: 'rgba(136,136,136,0.65)', Labor: 'rgba(79,195,247,0.65)',
                     Burden: 'rgba(255,213,79,0.65)', Overhead: 'rgba(255,140,0,0.65)' };

  function computeSCurve() {
    if (!TMS._ops.length) { TMS._sCurveData = []; return; }
    var totalDays = Math.max(1, Math.round((TMS._projectEnd - TMS._projectStart) / 86400000));
    var step = Math.max(1, Math.floor(totalDays / 50));
    var sf = TMS._shopfloor;

    if (sf && sf.orders.length) {
      // cost-element stacked: at each step, sum CumulatedAmt of orders whose finish has passed
      var grandTotal = 0;
      sf.orders.forEach(function (o) {
        _SF_ELEMS.forEach(function (e) { grandTotal += (o.elements[e] || 0); });
      });
      if (!grandTotal) { TMS._sCurveData = []; return; }
      var points = [];
      for (var d = 0; d <= totalDays; d += step) {
        var ts = TMS._projectStart + d * 86400000;
        var pt = { day: d };
        _SF_ELEMS.forEach(function (e) { pt[e] = 0; });
        sf.orders.forEach(function (o) {
          if (o.end <= ts) { _SF_ELEMS.forEach(function (e) { pt[e] += o.elements[e] || 0; }); }
        });
        _SF_ELEMS.forEach(function (e) { pt[e] = pt[e] / grandTotal * 100; });   // → % of grand total
        points.push(pt);
      }
      TMS._sCurveData = points;
      console.log('§SCURVE_COMPUTE stacked=true orders=' + sf.orders.length + ' steps=' + points.length + ' grandTotal=' + Math.round(grandTotal));
    } else {
      // fallback count-based (until shopfloor loads)
      var points2 = [];
      for (var d2 = 0; d2 <= totalDays; d2 += step) {
        var ts2 = TMS._projectStart + d2 * 86400000;
        var done = 0;
        for (var i = 0; i < TMS._ops.length; i++) { if (TMS._ops[i].end_ts <= ts2) done++; }
        points2.push({ day: d2, pct: done / TMS._ops.length * 100 });
      }
      TMS._sCurveData = points2;
    }
  }

  function drawSCurve() {
    var canvas = document.getElementById('tm-dash-scurve');
    if (!canvas || !TMS._sCurveData || !TMS._sCurveData.length) return;
    var c = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    c.clearRect(0, 0, w, h);
    var pts = TMS._sCurveData;
    var isStacked = 'Material' in (pts[0] || {});
    var totalDays = Math.max(1, pts[pts.length - 1].day);

    if (isStacked) {
      // stacked area per cost element (bottom to top: Material / Labor / Burden / Overhead)
      for (var ei = 0; ei < _SF_ELEMS.length; ei++) {
        var eName = _SF_ELEMS[ei];
        c.beginPath();
        for (var i = 0; i < pts.length; i++) {
          var x = pts[i].day / totalDays * w;
          var stackPct = 0; for (var j = 0; j <= ei; j++) stackPct += (pts[i][_SF_ELEMS[j]] || 0);
          var y = h - (stackPct / 100 * h);
          if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
        }
        for (var i = pts.length - 1; i >= 0; i--) {
          var x = pts[i].day / totalDays * w;
          var basePct = 0; for (var j = 0; j < ei; j++) basePct += (pts[i][_SF_ELEMS[j]] || 0);
          var y = h - (basePct / 100 * h);
          c.lineTo(x, y);
        }
        c.closePath(); c.fillStyle = _SF_COLORS[eName]; c.fill();
      }
      // cursor dot at top of stack
      var curDay = Math.max(0, (TMS._cursor - TMS._projectStart) / 86400000);
      var ci2 = Math.min(pts.length - 1, Math.round(curDay / totalDays * (pts.length - 1)));
      var cp = pts[ci2];
      if (cp) {
        var topPct = _SF_ELEMS.reduce(function (s, e) { return s + (cp[e] || 0); }, 0);
        var dx = cp.day / totalDays * w, dy = h - (topPct / 100 * h);
        c.beginPath(); c.arc(dx, dy, 3, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill();
        if ((drawSCurve._tick = (drawSCurve._tick || 0) + 1) % 20 === 0)
          console.log('§SCURVE_DRAW stacked=true cursor_day=' + Math.round(curDay) + ' accrued=' + Math.round(topPct) + '%');
      }
    } else {
      // fallback single line
      c.beginPath(); c.strokeStyle = '#4fc3f7'; c.lineWidth = 2;
      for (var i = 0; i < pts.length; i++) {
        var pt = pts[i], x = pt.day / totalDays * w, y = h - (pt.pct / 100 * h);
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke(); c.lineTo(w, h); c.lineTo(0, h); c.closePath(); c.fillStyle = 'rgba(79,195,247,0.1)'; c.fill();
      var curDay2 = Math.max(0, (TMS._cursor - TMS._projectStart) / 86400000);
      var done2 = 0; for (var ci3 = 0; ci3 < TMS._ops.length; ci3++) { if (TMS._ops[ci3].end_ts <= TMS._cursor) done2++; }
      var dx2 = curDay2 / totalDays * w, dy2 = h - (done2 / Math.max(TMS._ops.length, 1) * h);
      c.beginPath(); c.arc(dx2, dy2, 4, 0, Math.PI * 2); c.fillStyle = '#ff8c00'; c.fill();
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // §S260c: JSON CACHE — persist Gantt schedule + Movie Script in IDB
  // Keys: "gantt:v{N}:{building}" and "movie:{building}"
  // Same IDB store as DB file cache. Tiny (100-500KB) vs DB files (10-170MB).
  // Clear Cache on landing deletes entire IDB → next session recomputes.
  //
  // §GANTT_CACHE_VERSION: bump this whenever schedule-GENERATION logic changes in a way that
  // would make an already-cached schedule wrong (rate/productivity tables, sequence rules,
  // schedule_gate.js gating logic). A cached 'gantt' entry survives indefinitely otherwise —
  // §GANTT_CACHE_HIT trusts it forever, so a logic fix alone does NOT reach a browser that
  // already generated+cached a schedule under the old (buggy) logic; only a version bump does,
  // since it changes the cache KEY and makes the old entry an orphaned miss. Do NOT rely on
  // manual cacheDel/tmRefoldSchedule for this class of fix — that requires the user to know to
  // do it. v2 (2026-07-18): locale_loader.js productivity-map deep-merge fix. v3 (2026-07-18):
  // schedule_gate.js §CREW-CAP fix (uncapped per-Z-band crews → capped project-wide pool) — see
  // prompts/HOSPITAL_4D_SUPERSTRUCTURE_DURATION_ANOMALY.md Item 2. v4 (2026-07-18): §STOREY-Z
  // no-storey-element reassignment (PR #869) — Item 6. Missed on first landing (user hit exactly
  // this "hard reset didn't fix it" symptom); this bump is that fix's second half.
  // v5 (2026-08-01): §4D_ROOF_LOAD_PATH (PR #1120) changed BOTH things this comment names — the
  // slab sequence rule (role now derived from the load path, not the storey name) and
  // schedule_gate.js's gating logic (walls became candidate supports for promoted roof slabs).
  // Missed on first landing for the SECOND time in this file's history, and the user hit the exact
  // symptom the v4 note above already describes in those words: "I still see the roof of the helipad
  // huts going first before the walls" AFTER a hard reset, because §GANTT_CACHE_HIT served a
  // gantt:v4 entry generated under the old ordering. A hard reset cannot clear it — the entry is in
  // IndexedDB, not the HTTP cache. This bump is that fix's second half.
  // §STOREY_DATUM_FRAME (2026-09-03) 38→39: a v38 schedule authored on Hospital_meta.db / the user's
  // Hospital_silent.db was banded by a storey ladder in the WRONG vertical frame (56 local-frame
  // elevation rows won over the 7 world-frame center_z rows by emptiness) — 1 band, 7 tasks, 509 d
  // instead of 8/42/318. schedule_author.js now picks the ladder whose span contains the element
  // base-Z median; a persisted v38 grid still carries the collapsed ladder, so regenerate.
  var _GANTT_CACHE_VERSION = 41;
};
