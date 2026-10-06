// time_machine family — part `gantt_edit` (original time_machine.js lines 6337–8254).
// GENERATED move-only by scripts/split_closure.js (config scripts/split_configs/time_machine.json). Below the `yield` every
// statement is the original text; the only edit is that a name owned by ANOTHER part is reached as TMS.name.
// Edit this file normally from now on; regenerate only to re-split a branch that still edits the old single file.
(typeof window !== 'undefined' ? window : globalThis).__timeMachineParts = (typeof window !== 'undefined' ? window : globalThis).__timeMachineParts || {};
(typeof window !== 'undefined' ? window : globalThis).__timeMachineParts.gantt_edit = function* __split_time_machine_gantt_edit(TMS) {
  'use strict';
  // phase 1 — publish this part's names that other parts use (same function objects; vars as live accessors)
  TMS.buildGanttTasks = buildGanttTasks;
  TMS.drawGanttRuler = drawGanttRuler;
  TMS.wirePanelResize = wirePanelResize;
  TMS.wirePanelResizeHeight = wirePanelResizeHeight;
  TMS.wireGanttRulerShift = wireGanttRulerShift;
  TMS.wireGanttResize = wireGanttResize;
  TMS._tmCpmLegend = _tmCpmLegend;
  TMS._tmEditLocked = _tmEditLocked;
  TMS.shiftGanttSchedule = shiftGanttSchedule;
  TMS.undoLastGanttEdit = undoLastGanttEdit;
  TMS.setGanttBaseline = setGanttBaseline;
  TMS.rescheduleGanttAsap = rescheduleGanttAsap;
  TMS._materializeNativeSchedule = _materializeNativeSchedule;
  TMS.generateGanttSchedule = generateGanttSchedule;
  TMS.wireGanttDrag = wireGanttDrag;
  TMS.toggleP6Drawer = toggleP6Drawer;
  TMS.wireP6Controls = wireP6Controls;
  Object.defineProperty(TMS, '_panelW', { get: function () { return _panelW; }, set: function (v) { _panelW = v; }, enumerable: true });
  Object.defineProperty(TMS, '_panelWPreEdit', { get: function () { return _panelWPreEdit; }, set: function (v) { _panelWPreEdit = v; }, enumerable: true });
  Object.defineProperty(TMS, 'PANEL_W_EDIT', { get: function () { return PANEL_W_EDIT; }, set: function (v) { PANEL_W_EDIT = v; }, enumerable: true });
  Object.defineProperty(TMS, '_ganttBoxH', { get: function () { return _ganttBoxH; }, set: function (v) { _ganttBoxH = v; }, enumerable: true });
  Object.defineProperty(TMS, '_dragConsumed', { get: function () { return _dragConsumed; }, set: function (v) { _dragConsumed = v; }, enumerable: true });
  Object.defineProperty(TMS, '_ganttEditable', { get: function () { return _ganttEditable; }, set: function (v) { _ganttEditable = v; }, enumerable: true });
  Object.defineProperty(TMS, '_ganttAutoGenAttempted', { get: function () { return _ganttAutoGenAttempted; }, set: function (v) { _ganttAutoGenAttempted = v; }, enumerable: true });
  Object.defineProperty(TMS, '_ganttSelected', { get: function () { return _ganttSelected; }, set: function (v) { _ganttSelected = v; }, enumerable: true });
  Object.defineProperty(TMS, '_marquee', { get: function () { return _marquee; }, set: function (v) { _marquee = v; }, enumerable: true });
  Object.defineProperty(TMS, '_groupDrag', { get: function () { return _groupDrag; }, set: function (v) { _groupDrag = v; }, enumerable: true });
  Object.defineProperty(TMS, '_lastEdit', { get: function () { return _lastEdit; }, set: function (v) { _lastEdit = v; }, enumerable: true });
  Object.defineProperty(TMS, 'CPM_COLOR_CRITICAL', { get: function () { return CPM_COLOR_CRITICAL; }, set: function (v) { CPM_COLOR_CRITICAL = v; }, enumerable: true });
  Object.defineProperty(TMS, 'CPM_COLOR_FLOAT', { get: function () { return CPM_COLOR_FLOAT; }, set: function (v) { CPM_COLOR_FLOAT = v; }, enumerable: true });
  Object.defineProperty(TMS, '_ganttCritical', { get: function () { return _ganttCritical; }, set: function (v) { _ganttCritical = v; }, enumerable: true });
  Object.defineProperty(TMS, '_cpmPrimed', { get: function () { return _cpmPrimed; }, set: function (v) { _cpmPrimed = v; }, enumerable: true });
  yield;   // phase 2 resumes here, in this same scope: the original statements, in original order


  // buildGanttTasks() — THIN WRAPPER (§S53, F3). The model lives in gantt_model.js
  // (GanttModel.buildTasks): the §S51 grouping precedence (task id -> cell stamp -> storey|phase),
  // the §GANTT_MINI_TRIM Tukey bar-span trim, and the SEQUENCE_RULES-derived §GANTT_ROW_ORDER sort,
  // all moved there verbatim with their comments. This function keeps what is genuinely
  // time_machine's: the K0 dirty-flag gate, the state assignment, and the three §-log proof lines.
  function buildGanttTasks() {
    if (!TMS._ganttDirty) return;
    var GM = (typeof window !== 'undefined' && window.GanttModel) || null;
    if (!GM) { console.warn('§LOAD_FAIL gantt_model.js — buildGanttTasks skipped, bars unchanged'); return; }
    TMS._ganttDirty = false;
    var idx = TMS.buildTaskIndex();
    var r = GM.buildTasks(TMS._ops, idx, (typeof window !== 'undefined' && window.SEQUENCE_RULES) || null);
    TMS._ganttTasks = r.tasks;
    TMS._ganttIdentified = r.identified; TMS._ganttUnidentified = r.unidentified;
    TMS._ganttSpanFromTask = r.spanFromTask || 0; TMS._ganttSpanFromOps = r.spanFromOps || 0;

    // §S58 (4D_GANTT_TM_REFACTOR.md §S58.1a): these three lines used to be gated on
    // `_ganttTasksComputed`, a "log once flag" reset only at building-close — so they reported the
    // FIRST build of a building and never again. But this function recomputes the whole model
    // whenever `_ganttDirty` is set, i.e. after every drag, retime, group-move, link and undo,
    // which is exactly when a reader needs the numbers. A drag that duplicated bars, reordered
    // phases or flipped the editable/non-editable mix was invisible in the log for the rest of the
    // session. Now reported on every real REBUILD. NOT per-frame: the `!_ganttDirty` early-return
    // above means a redraw with an unchanged model logs nothing.
    {
      TMS._ganttRebuildN++;
      var _idBars = 0;
      for (var bi = 0; bi < TMS._ganttTasks.length; bi++) if (TMS._ganttTasks[bi].taskId) _idBars++;
      console.log('§GANTT_MINI tasks=' + TMS._ganttTasks.length + ' rebuild=' + TMS._ganttRebuildN);
      // §GANTT_CPM_ANNOTATE (§S68) — prime float/criticality ONCE per building, so the critical path
      // is on screen before the first edit. Deliberately not per-rebuild: every rebuild past this one
      // is edit-driven, and each edit path already re-annotates itself after its own retime, so a
      // per-rebuild call would run CPM twice for every drag. Reset with the rest of the per-building
      // state on deactivate.
      if (!_cpmPrimed) { _cpmPrimed = true; _tmAnnotateCpm(); }
      // K0 proof line: how many bars carry a real tasks.task_id (i.e. are addressable by the edit
      // verbs) vs how many are still the un-authored storey|phase fallback. editable=0 means no
      // authored schedule exists for this building, NOT that the join failed.
      // K1 proof line: the row order actually drawn, so "is substructure first" is checkable from the
      // log instead of from a screenshot.
      console.log('§GANTT_ROW_ORDER rebuild=' + TMS._ganttRebuildN + ' phases=' +
        JSON.stringify(TMS._ganttTasks.map(function (t) { return t.phase; })
        .filter(function (p, i, arr) { return i === 0 || arr[i - 1] !== p; })));
      console.log('§GANTT_BAR_IDENTITY rebuild=' + TMS._ganttRebuildN +
        ' schedule=' + ((TMS._taskIndex && TMS._taskIndex.scheduleId) || 'none') +
        ' bars=' + TMS._ganttTasks.length + ' editable=' + _idBars +
        ' opsWithTask=' + TMS._ganttIdentified + ' opsWithout=' + TMS._ganttUnidentified +
        ' modelTasks=' + ((TMS._taskIndex && TMS._taskIndex.n) || 0));
      // §GANTT_BAR_IS_ITS_TASK (§S65 STAGE 3) — where each bar's SPAN came from. spanFromTask is the
      // authored window (the correct source); spanFromOps is the Tukey envelope over member elements,
      // now only the un-authored fallback. Before this fix every bar was spanFromOps, and on
      // HHS_Office_Federated that drew "Superstructure — Roof Level" 0.6px wide against its own
      // 101.4px window (0.6%), with a mean absolute start error of 5.33 days across 17 bars.
      console.log('§GANTT_BAR_SPAN_SOURCE rebuild=' + TMS._ganttRebuildN +
        ' spanFromTask=' + TMS._ganttSpanFromTask + ' spanFromOps=' + TMS._ganttSpanFromOps +
        ' bars=' + TMS._ganttTasks.length);
      TMS._ganttTasksComputed = true;
    }
  }

  // §GANTT_RULER (E5) — the drawer's time axis. Ticks are chosen so labels land roughly every 80px
  // and always on a "nice" day interval, so the axis stays readable from a 30-day Duplex to a
  // 1000-day Terminal without any per-building tuning. Returns the tick times so the bar canvas can
  // draw matching gridlines — one source of truth for where a date sits horizontally.
  var _RULER_STEPS = [1, 2, 5, 7, 14, 30, 60, 90, 180, 365, 730];
  // §GANTT_AXIS_OUTLIER: ruler geometry is DISPLAY — uses the qualified axis (_ganttAxisStart/End),
  // never the real playback _projectStart/_projectEnd. See the var declarations for why.
  function ganttRulerTicks(barW) {
    var range = Math.max(1, TMS._ganttAxisEnd - TMS._ganttAxisStart);
    var totalDays = range / 86400000;
    var pxPerDay = barW / totalDays;
    var step = _RULER_STEPS[_RULER_STEPS.length - 1];
    for (var i = 0; i < _RULER_STEPS.length; i++) {
      if (_RULER_STEPS[i] * pxPerDay >= 80) { step = _RULER_STEPS[i]; break; }
    }
    var ticks = [];
    for (var d = 0; d <= totalDays; d += step) ticks.push({ day: Math.round(d), ts: TMS._ganttAxisStart + d * 86400000 });
    return { ticks: ticks, step: step, totalDays: totalDays };
  }

  function drawGanttRuler(cW, marginL, barW) {
    var rc = document.getElementById('tm-gantt-ruler');
    if (!rc) return null;
    var H = 18, dpr = window.devicePixelRatio || 1;
    rc.width = cW * dpr; rc.height = H * dpr; rc.style.height = H + 'px';
    var ctx = rc.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cW, H);
    var R = ganttRulerTicks(barW);
    var range = Math.max(1, TMS._ganttAxisEnd - TMS._ganttAxisStart);
    // "Day N" origin label in the storey-label gutter, so the axis reads as project days too.
    ctx.fillStyle = '#8a97a5'; ctx.font = '9px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('Day', 4, H / 2);
    var longSpan = R.step >= 30;
    ctx.strokeStyle = 'rgba(120,140,160,0.35)'; ctx.lineWidth = 1;
    R.ticks.forEach(function (t) {
      var x = marginL + (t.ts - TMS._ganttAxisStart) / range * barW;
      if (x < marginL - 0.5 || x > marginL + barW + 0.5) return;
      ctx.beginPath(); ctx.moveTo(x + 0.5, H - 5); ctx.lineTo(x + 0.5, H); ctx.stroke();
      var dt = new Date(t.ts);
      // Real calendar date, plus the project-day number the rest of the drawer already speaks in.
      var lbl = longSpan
        ? dt.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
        : dt.getDate() + ' ' + dt.toLocaleDateString(undefined, { month: 'short' });
      ctx.fillStyle = '#aab6c2'; ctx.textAlign = 'center';
      ctx.fillText(lbl, x, 5);
      ctx.fillStyle = '#68758a';
      ctx.fillText('d' + t.day, x, 13);
    });
    // Cursor marker on the axis, same orange as the hairline. Clamped into [0,1] — the real _cursor
    // can legitimately sit past the qualified axis (e.g. scrubbed to the outlier op itself); off the
    // qualified ruler is the correct place for that, not a reason to hide the marker entirely.
    var hxFrac = Math.max(0, Math.min(1, (TMS._cursor - TMS._ganttAxisStart) / range));
    var hx = marginL + hxFrac * barW;
    if (hx >= marginL && hx <= marginL + barW) {
      ctx.fillStyle = '#ff8c00';
      ctx.beginPath(); ctx.moveTo(hx, H - 6); ctx.lineTo(hx - 4, H); ctx.lineTo(hx + 4, H); ctx.closePath(); ctx.fill();
    }
    return R;
  }

  // §TM_PANEL_RESIZE — drag tm-panel-resize-grip to widen the WHOLE drawer past its 376px default.
  // _panel is centered (left:50%/translateX(-50%)), so dragging the right edge by dx pixels must
  // grow width by 2*dx for the edge to actually track the cursor 1:1 (the invisible left edge moves
  // -dx to keep centered) — see wirePanelResize's pointermove for the derivation.
  var _panelW = 0;            // 0 = follow the stylesheet default (376px); set once the user drags
  var _panelWPreEdit = null;  // width to restore to when Editing turns back off (auto-expand undo)
  var PANEL_W_DEFAULT = 376, PANEL_W_EDIT = 560, PANEL_W_MIN = 320;

  function wirePanelResize() {
    var grip = document.getElementById('tm-panel-resize-grip');
    if (!grip || !TMS._panel || grip._wired) return;
    grip._wired = true;
    var startX = 0, startW = 0, dragging = false;
    grip.addEventListener('pointerdown', function (e) {
      dragging = true; startX = e.clientX; startW = TMS._panel.getBoundingClientRect().width;
      TMS._panel.classList.add('tm-panel-resizing');
      grip.classList.add('tm-gripping');
      grip.setPointerCapture(e.pointerId); e.preventDefault(); e.stopPropagation();
    });
    grip.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var maxW = Math.min(Math.round(window.innerWidth * 0.92), 900);
      var w = Math.max(PANEL_W_MIN, Math.min(maxW, Math.round(startW + 2 * (e.clientX - startX))));
      _panelW = w;
      TMS._panel.style.width = w + 'px';
      e.preventDefault(); e.stopPropagation();
    });
    function end(e) {
      if (!dragging) return;
      dragging = false;
      TMS._panel.classList.remove('tm-panel-resizing');
      grip.classList.remove('tm-gripping');
      try { grip.releasePointerCapture(e.pointerId); } catch (err) {}
      console.log('§TM_PANEL_RESIZE width=' + _panelW + 'px');
    }
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  }

  // §TM_PANEL_RESIZE_H — companion to wirePanelResize() above, same grip/pointer-capture pattern,
  // mirrored onto the panel's bottom edge. FIX (2026-08-06, user: "it seems there is an inner frame
  // for the gantt chart panel... it does not be max" — confirmed live): this used to grow the OUTER
  // _panel shell only, leaving the actual content (#tm-gantt-box, the Gantt canvas) clipped at its
  // own separate height cap — so the drag looked like it worked but never uncrammed any content.
  // Now it drives the SAME #tm-gantt-box / _ganttBoxH that the internal top-strip grip
  // (wireGanttResize, §GANTT_RESIZE E6) already owns — this is just a second, more discoverable
  // entry point to that one real resize, not a second independent mechanism. _panel itself has no
  // height cap of its own (flex column, grows to fit content) so it naturally follows the box taller
  // — no outer-panel style needed at all, exactly like the top-strip grip already proves works.
  function wirePanelResizeHeight() {
    var grip = document.getElementById('tm-panel-resize-grip-b');
    var box = document.getElementById('tm-gantt-box');
    if (!grip || !box || grip._wired) return;
    grip._wired = true;
    var startY = 0, startH = 0, dragging = false;
    grip.addEventListener('pointerdown', function (e) {
      dragging = true; startY = e.clientY; startH = box.clientHeight;
      if (TMS._panel) TMS._panel.classList.add('tm-panel-resizing');
      grip.classList.add('tm-gripping');
      grip.setPointerCapture(e.pointerId); e.preventDefault(); e.stopPropagation();
    });
    grip.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      // Grip sits at the drawer's BOTTOM edge (opposite of tm-gantt-grip's top-edge placement), so
      // dragging DOWN (positive dy) grows it — same clamp bounds as wireGanttResize for consistency.
      var h = Math.max(80, Math.min(Math.round(window.innerHeight * 0.75), startH + (e.clientY - startY)));
      _ganttBoxH = h;
      box.style.maxHeight = h + 'px';
      e.preventDefault(); e.stopPropagation();
    });
    function end(e) {
      if (!dragging) return;
      dragging = false;
      if (TMS._panel) TMS._panel.classList.remove('tm-panel-resizing');
      grip.classList.remove('tm-gripping');
      try { grip.releasePointerCapture(e.pointerId); } catch (err) {}
      console.log('§TM_PANEL_RESIZE_H height=' + _ganttBoxH + 'px rows=' + TMS._ganttTasks.length);
    }
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  }

  // §TM_RULER_SHIFT UI — drag the day ruler to move the whole project's start/finish (user ruling
  // 2026-08-05). Same lock gate as bar drag/resize/link (this is the biggest possible edit, not a
  // reason to exempt it from the lock). Uses the SAME axis math as ganttHit's dayPx so a drag of N
  // pixels always means the same N days everywhere in the drawer, ruler included.
  function wireGanttRulerShift() {
    var _L = (typeof TMS._tmTrl === 'function') ? TMS._tmTrl : function (k, en, r) { var s = en; if (r) for (var q in r) s = s.replace('{' + q + '}', r[q]); return s; };   // S226 §R2b — sliced into vm sandboxes by witnesses
    var rc = document.getElementById('tm-gantt-ruler');
    if (!rc || rc._shiftWired) return;
    rc._shiftWired = true;
    var startX = 0, dragDays = 0, dragging = false;
    rc.addEventListener('pointerdown', function (e) {
      if (!_ganttEditable) {
        console.log('§TM_RULER_SHIFT_REJECT reason=locked');
        var t0 = document.getElementById('tm-gantt-tip');
        if (t0) {
          t0.textContent = _L('tm_locked_hint', 'Locked — click 🔒 Locked to enable editing');
          t0.style.display = 'block';
          setTimeout(function () { t0.style.display = 'none'; }, 2200);
        }
        return;
      }
      dragging = true; startX = e.clientX; dragDays = 0;
      try { rc.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault(); e.stopPropagation();
    });
    rc.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var range = Math.max(1, TMS._ganttAxisEnd - TMS._ganttAxisStart);
      var barW = Math.max(1, rc.clientWidth - 60);   // 60 = the storey-label gutter, same as ganttHit/drawGanttMini
      var dayPx = barW / (range / 86400000);
      dragDays = Math.round((e.clientX - startX) / Math.max(0.001, dayPx));
      var tip = document.getElementById('tm-gantt-tip');
      if (tip) {
        tip.textContent = _L('tm_shift_whole', 'Shift whole schedule {d}d', { d: (dragDays >= 0 ? '+' : '') + dragDays });
        tip.style.left = '4px'; tip.style.top = '20px'; tip.style.display = 'block';
      }
      e.preventDefault(); e.stopPropagation();
    });
    function end(e) {
      if (!dragging) return;
      dragging = false;
      try { rc.releasePointerCapture(e.pointerId); } catch (err) {}
      var tip = document.getElementById('tm-gantt-tip');
      if (tip) tip.style.display = 'none';
      if (dragDays) shiftGanttSchedule(dragDays);
    }
    rc.addEventListener('pointerup', end);
    rc.addEventListener('pointercancel', end);
  }

  // §GANTT_RESIZE (E6) — drag the grip to make the drawer taller than the CSS 220px cap. Inline
  // max-height wins over the .tm-drawer-bottom.open rule, so the class keeps owning open/close and
  // this only owns the height. Reuses the same pointer-capture idiom as makeDraggable.
  var _ganttBoxH = 0;   // 0 = follow the stylesheet default
  function wireGanttResize() {
    var grip = document.getElementById('tm-gantt-grip');
    var box = document.getElementById('tm-gantt-box');
    if (!grip || !box || grip._wired) return;
    grip._wired = true;
    var startY = 0, startH = 0, dragging = false;
    grip.addEventListener('pointerdown', function (e) {
      dragging = true; startY = e.clientY; startH = box.clientHeight;
      grip.setPointerCapture(e.pointerId); e.preventDefault(); e.stopPropagation();
    });
    grip.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      // Grip sits at the drawer's TOP edge, so dragging UP (negative dy) grows it.
      var h = Math.max(80, Math.min(Math.round(window.innerHeight * 0.75), startH + (startY - e.clientY)));
      _ganttBoxH = h;
      box.style.maxHeight = h + 'px';
      e.preventDefault(); e.stopPropagation();
    });
    function end(e) {
      if (!dragging) return;
      dragging = false;
      try { grip.releasePointerCapture(e.pointerId); } catch (err) {}
      console.log('§GANTT_RESIZE height=' + _ganttBoxH + 'px rows=' + TMS._ganttTasks.length);
    }
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  }

  // ── §GANTT_DRAG (E1/E2) + §GANTT_RETIME (W1) ──────────────────────────────────────────────────
  // The UI half of the constraint-aware edit. The ENGINE half lives in schedule_author.js
  // (moveTaskCascade / resizeTask) and is witnessed independently — this layer only translates a
  // gesture into a date and then re-times the affected elements so the movie cannot disagree with
  // the chart it was dragged on.
  var _drag = null;            // { bar, mode:'move'|'resizeL'|'resizeR', x0, dayPx, previewDays }
  var _dragConsumed = false;   // set on a committed edit so the seek handler ignores that pointerup
  var EDGE_PX = 5;             // grab zone at each bar end — inside this, a drag resizes, not moves

  // §GANTT_EDIT_LOCK (user ruling 2026-08-05): the drawer is the ONLY editing surface now — no more
  // side-panel button. Default LOCKED so an accidental drag can never move a date; the user flips it
  // ON deliberately to edit. Gates drag/resize (wireGanttDrag pointerdown, which also gates the E3
  // drag-to-link since endDrag never runs without a live _drag) and the E7 props dblclick (typed
  // retime + unlink). Playback/scrub/seek/render are NEVER gated — the canvas stays live feedback
  // regardless of lock state (user: "if canvas is runtime responsive, it gives the user feedback
  // which is desirable"). Persistence model is UNCHANGED: every accepted edit still writes straight
  // to the tasks/kernel_ops tables the instant it's committed (same as before this toggle existed,
  // §GANTT_EDIT_UNDO already covers the single-level undo of that immediate write) — the toggle is a
  // UI lock only, not a new draft/commit layer.
  var _ganttEditable = false;
  var _ganttAutoGenAttempted = false;  // reset per activate() — one auto-generate attempt per open

  // §GANTT_GROUP_MOVE (user ruling 2026-08-05): marquee-select a cluster of bars (MS-Word-style —
  // drag from EMPTY canvas space, sweep into the bars you want), then dragging any SELECTED bar
  // moves the whole group together (same uniform-shift primitive as §TM_RULER_SHIFT, scoped to the
  // selection instead of the whole project). Ephemeral, never persisted — same convention as
  // selecting files in a file manager: it exists between "marquee" and "click away," nothing more.
  // Click any empty canvas space (a marquee drag that ends up ~zero-size) clears it — same gesture
  // starts a NEW marquee and dissolves the OLD selection in one motion, no separate "ungroup" verb.
  var _ganttSelected = {};   // taskId -> true
  var _marquee = null;       // { x0, y0, x1, y1 } in canvas-local px while a marquee drag is live
  var _groupDrag = null;     // { taskIds, x0, y0, dayPx, days, moved } while dragging a selected bar

  // §GANTT_EDIT_UNDO — single-level (not a stack): a drag can cascade N successors with no way back
  // except regenerating the whole schedule (real gap, this session's own edit UI made it possible).
  // Scope is deliberately narrow: only commitGanttDrag (E1/E2 move/resize) sets this, not link/unlink
  // or the property panel — matching exactly the need named in 4D_SCHEDULE_PERFECTION.md, not a
  // speculative general undo system. { schedId, tasksBefore:{taskId:{start,finish,duration}},
  // opsBefore:{guid:{start_ts,end_ts,parameters}}, taskId, mode } — cleared on every fresh TM activate().
  var _lastEdit = null;

  // Which bar (and where on it) is under the pointer? Extends findBarAtClick with an edge zone so a
  // single gesture can mean either E1 (move) or E2 (edge-pull), the way P6/MSP behave.
  function ganttHit(e) {
    var bar = TMS.findBarAtClick(e);
    if (!bar) return null;
    var rect = e.target.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var marginL = 60, barW = rect.width - marginL;
    // §GANTT_AXIS_OUTLIER: must match the qualified axis findBarAtClick/drawGanttMini now use.
    var range = Math.max(1, TMS._ganttAxisEnd - TMS._ganttAxisStart);
    var bx = marginL + (bar.startTs - TMS._ganttAxisStart) / range * barW;
    var bw = Math.max(2, (bar.endTs - bar.startTs) / range * barW);
    var mode = 'move';
    if (x <= bx + EDGE_PX) mode = 'resizeL';
    else if (x >= bx + bw - EDGE_PX) mode = 'resizeR';
    return { bar: bar, mode: mode, dayPx: barW / (range / 86400000) };
  }

  // §GANTT_RETIME (W1) — after an accepted edit, re-time the affected tasks' OWN elements onto their
  // new window. This is what keeps the drawer and the 3D movie from diverging: the bar's drawn span
  // is derived from the element ops (§GANTT_BAR_IDENTITY), so moving the elements IS what moves the
  // bar. Coherence is structural rather than policed afterwards.
  //
  // The remap is AFFINE over each element's existing position in its old window, deliberately: a
  // zone's internal ordering was already computed correctly by the engine (computeSchedule, plus this
  // session's support fixes), so an edit must PRESERVE that order, not re-derive it. Only the window
  // the order is stretched across changes.
  // The remap itself, kept pure and self-contained so witness_gantt_edit_coherence.js can slice it
  // out of THIS source and test the shipped function rather than a hand-copied duplicate (the copy
  // problem this codebase already paid for three times with the support predicate).
  function _retimeSpan(opS, opE, oS, oE, nS, nE) {
    // §S7_OUTLIER_DELTA (4D_GANTT_TM_REFACTOR.md §S7, measured live 2026-08-16: Terminal roof task
    // n=11,004 had 440 ops outside its drawn bar; a drag collapsed 437 to the 60s floor and
    // INVERTED 217 — end before start by up to -3.6h — because the affine map below assumes
    // containment and extrapolates-then-clamps an outsider). An op outside the OLD window is a
    // dag-wins Tukey outlier the bar deliberately excludes (M2: "counted, never hidden") — the
    // edit-side rule is the same doctrine: never squeeze it into the window. It gets the window's
    // uniform START delta with its TRUE duration preserved (a move shifts it with the task; a
    // right-edge resize leaves it untouched, since nS==oS ⇒ delta 0).
    if (opS < oS - 1 || opE > oE + 1) {
      var ds = nS - oS;
      return { s: Math.round(opS + ds), e: Math.round(opE + ds) };
    }
    var oSpan = Math.max(1, oE - oS), nSpan = Math.max(1, nE - nS);
    var s = Math.round(nS + ((opS - oS) / oSpan) * nSpan);
    var e = Math.round(nS + ((opE - oS) / oSpan) * nSpan);
    if (s < nS) s = nS;
    if (e > nE) e = nE;
    if (e <= s) e = Math.min(nE, s + 60000);
    return { s: s, e: e };
  }

  function retimeTaskElements(db, barsByTask, moved, tasksBefore) {
    var upd = db.prepare("UPDATE kernel_ops SET timestamp = ?, parameters = ? " +
      "WHERE op_type = 'ELEMENT_PLACE' AND output_guid = ?");
    var opByGuid = {}, i;
    for (i = 0; i < TMS._ops.length; i++) if (TMS._ops[i].output_guid) opByGuid[TMS._ops[i].output_guid] = TMS._ops[i];
    var rows = 0, t0 = (window.performance || Date).now();
    // §RETIME_OUTLIER_AUDIT (4D_GANTT_TM_REFACTOR.md §S7 step 1 — measure, don't assume): count,
    // per commit, the ops whose TRUE times sit outside their task's OLD drawn window (the Tukey
    // outliers M2 deliberately leaves riding outside the bar) and what duration _retimeSpan hands
    // each one back. collapsed = duration crushed to the 60s floor; inverted = end before start.
    var audOutside = 0, audCollapsed = 0, audInverted = 0, audMinDur = Infinity, audMaxDur = -Infinity;
    // §S22_EPOCH_FIX (4D_GANTT_TM_REFACTOR.md §S22, MEASURED 2026-08-17 on a real +10d drag —
    // Clinic TASK_MEP_Rough_in_Level_1: bar.startTs/endTs went 1970-01-09..1970-03-23 -> AFTER the
    // drag, 2026-08-23..2026-11-18. m.start/m.finish (ScheduleAuthor's moveTaskCascade/resizeTask/
    // shiftSchedule/shiftTasks result) are REAL absolute calendar dates on the `tasks` table's OWN
    // clock (materializeZones seeds it from real "today", schedule_author.js:386/480 — `start` opt +
    // day-count added via _addDays). bar.startTs/endTs (oS/oE) and every op's start_ts/end_ts are on
    // the TM's OWN internal clock (kernel_ops.timestamp, sourced from cpm_schedule.js's zero-anchored
    // day-offset solve — confirmed near-1970 by design, matching the raw solver dumps quoted
    // elsewhere in this lane). Date.parse(m.start)-ing directly and feeding it to _retimeSpan
    // alongside oS/oE (a DIFFERENT, day-offset clock) spliced the dragged task's ops onto a
    // timescale ~57 YEARS from the rest of the untouched project: _projectEnd (computeDays() takes
    // Math.max over ALL ops) ballooned to match, so the rest of the schedule occupied 0.5% of the
    // resulting scrub range — practically unreachable by a live drag-scrub, matching the live user
    // report ("scrubbing didn't solve it") even though a scripted absolute-cursor jump COULD still
    // land there (§S22's own diagnostic evidence, both correct in isolation, missed this).
    // Fix: convert m.start/m.finish into TM-clock units via tasksBefore[m.id] — the SAME `tasks`
    // table, SAME clock, snapshotted immediately before the ScheduleAuthor verb ran (already
    // captured at every one of retimeTaskElements's 3 call sites for undo, just never passed in
    // here). A pure DAY-COUNT DELTA is clock-agnostic: both clocks share 86400000ms/day granularity,
    // only their zero-point differs, so (Date.parse(m.start) - Date.parse(before.start)) applied
    // onto oS/oE (already on the correct clock) needs no knowledge of either clock's absolute
    // zero-point. Sub-day rounding noise (materializeZones's Math.floor/ceil day-grid) can survive
    // the round trip — far below the severity of a decades-scale splice, and the same day-grain this
    // whole authoring pipeline already works in.
    var epochFixApplied = 0, epochFixSkippedNoBefore = 0;
    db.run('BEGIN');
    moved.forEach(function (m) {
      var bar = barsByTask[m.id]; if (!bar || !bar.guids || !bar.guids.length) return;
      var tb = tasksBefore && tasksBefore[m.id];
      var nS, nE;
      if (tb && tb.start && tb.finish) {
        var oldRealS = Date.parse(tb.start + 'T00:00:00Z'), oldRealE = Date.parse(tb.finish + 'T00:00:00Z');
        var newRealS = Date.parse(m.start + 'T00:00:00Z'), newRealE = Date.parse(m.finish + 'T00:00:00Z');
        if (isNaN(oldRealS) || isNaN(oldRealE) || isNaN(newRealS) || isNaN(newRealE)) return;
        nS = Math.round(bar.startTs + (newRealS - oldRealS));
        nE = Math.round(bar.endTs + (newRealE - oldRealE));
        epochFixApplied++;
        console.log('§S22_EPOCH_FIX_DETAIL task=' + m.id + ' tb.start=' + tb.start + ' tb.finish=' + tb.finish +
          ' m.start=' + m.start + ' m.finish=' + m.finish + ' oS=' + bar.startTs + ' oE=' + bar.endTs +
          ' deltaSdays=' + ((newRealS - oldRealS) / 86400000).toFixed(2) + ' nS=' + nS + ' nE=' + nE);
      } else {
        // No before-snapshot for this task — refuse rather than guess a cross-clock splice. Every
        // real call site (commitGanttDrag/shiftGanttSchedule/commitGanttGroupShift) captures
        // tasksBefore for every task it's about to touch, so this should never fire live; it exists
        // as a fail-safe, not a fallback path to lean on.
        epochFixSkippedNoBefore++;
        return;
      }
      if (isNaN(nS) || isNaN(nE) || nE <= nS) return;
      var oS = bar.startTs, oE = bar.endTs, oSpan = Math.max(1, oE - oS), nSpan = nE - nS;
      for (var gi = 0; gi < bar.guids.length; gi++) {
        var g = bar.guids[gi], op = opByGuid[g]; if (!op) continue;
        var wasOutside = (op.start_ts < oS - 1 || op.end_ts > oE + 1);
        var r = _retimeSpan(op.start_ts, op.end_ts, oS, oE, nS, nE);
        if (wasOutside) {
          audOutside++;
          var audDur = r.e - r.s;
          if (audDur <= 60000) audCollapsed++;
          if (audDur < 0) audInverted++;
          if (audDur < audMinDur) audMinDur = audDur;
          if (audDur > audMaxDur) audMaxDur = audDur;
        }
        op.start_ts = r.s; op.end_ts = r.e;
        op.parameters._end_ts = r.e;
        upd.run([r.s, JSON.stringify(op.parameters), g]);
        rows++;
      }
    });
    db.run('COMMIT');
    upd.free();
    console.log('§GANTT_RETIME tasks=' + moved.length + ' rows=' + rows +
      ' ms=' + ((window.performance || Date).now() - t0).toFixed(1));
    console.log('§RETIME_OUTLIER_AUDIT outsideOldWindow=' + audOutside + ' collapsed60s=' + audCollapsed +
      ' inverted=' + audInverted +
      (audOutside ? ' outlierDurMs=[' + audMinDur + ',' + audMaxDur + ']' : '') +
      ' — outliers ride outside their bar (M2); collapse/inversion here is the §S7 edit-path defect');
    console.log('§S22_EPOCH_FIX clockTranslated=' + epochFixApplied + ' skippedNoBefore=' + epochFixSkippedNoBefore +
      ' — nS/nE derived via tasksBefore day-delta, never a raw Date.parse(m.start) splice onto the TM clock');
    return rows;
  }

  // §GANTT_RETIME_RESYNC (2026-08-07, 4D_SCHEDULE_PERFECTION.md §4D_LAYER_TRUTH follow-on — user
  // report: "foundation piling nor others does not come onto canvas anymore, though i dragged to
  // certain bars passing", witnessed as §PERF_TRAVERSE cand=0 on every scrub after §GANTT_RETIME):
  // retimeTaskElements moves the ops' timestamps, but THREE derived structures kept the old times —
  // (1) the §PERF_INCR event index (_evMesh), so the incremental reveal skipped meshes straight
  // across their new transitions (the blackout); (2) _ops' sort order (consumers binary-search it);
  // (3) the §XRAY solidify cache (stale carrier ends). One resync, called by every retime commit
  // path (drag, ruler shift, group shift, undo) — same drop-pattern deactivate() already uses.
  function _tmResyncAfterRetime() {
    TMS._ops.sort(function (a, b) { return a.start_ts - b.start_ts; });
    TMS._evMesh = null; TMS._evSig = ''; TMS._incrPrimed = false;   // §PERF_INCR: force full rebuild next tick
    TMS._tmRebuildXrayCache();
  }

  // ── §GANTT_CPM_ANNOTATE — float + critical path, DERIVED from the edit, never driving it ────────
  // Implementing bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §S68 (product decision, 2026-08-23:
  // "go with annotate"). Settles the standing question "does the drag run CPM?" — it does not, and
  // deliberately still does not. moveTaskCascade's push-only cascade + predecessor-floor clamp stays
  // the date engine. CPM runs AFTER it, in fixedDates mode, purely to derive float/criticality FROM
  // the dates the cascade just wrote.
  // Why fixedDates is mandatory here: computeCpm's derived forward pass (max over predecessors'
  // EF+lag) compounds independently-fitted lags on a multi-parent zone graph — MEASURED at PF=138d
  // against the real movie's 93d on Terminal's 71-zone graph, +48% (schedule_author.js:1385). A drag
  // that silently restretches the project by half is worse than the honest cascade. With the flag,
  // ES/EF come straight from the persisted dates and only the BACKWARD pass runs, over real edges,
  // so total float and is_critical stay meaningful.
  // computeCpm's only write is early_*/late_*/free_float/total_float/is_critical — it never touches
  // schedule_start/schedule_finish/schedule_duration. That is the whole safety property of this
  // feature, and it is witnessed byte-for-byte (W-CPM-2), not assumed from reading the code.
  // §S75 — ONE definition of the float palette. The rail on the canvas and the legend swatch in the
  // drawer must be the same colour by construction; two hex literals in two files is how a legend
  // ends up quietly explaining a colour the bars no longer use.
  var CPM_COLOR_CRITICAL = '#e53935';   // zero float — this task cannot slip without moving the end date
  var CPM_COLOR_FLOAT = '#26a69a';      // has slack
  var _ganttCritical = {};   // taskId -> { critical, totalFloat } — DISPLAY state, not a date source
  var _cpmPrimed = false;    // first-build annotate ran for this building (reset on deactivate)
  // _tmCpmLegend(marks) — §S75. null/empty ⇒ the strip is cleared: a legend that keeps showing the
  // last building's counts after a bail is worse than no legend.
  function _tmCpmLegend(crit, slack, pf, minF, maxF) {
    var _L = (typeof TMS._tmTrl === 'function') ? TMS._tmTrl : function (k, en, r) { var s = en; if (r) for (var q in r) s = s.replace('{' + q + '}', r[q]); return s; };   // S226 §R2b — sliced into vm sandboxes by witnesses
    var el = (typeof document !== 'undefined') && document.getElementById('tm-gantt-cpmlegend');
    if (!el) return;
    if (crit === null) { el.textContent = ''; el.removeAttribute('title'); return; }
    var sw = function (c) {
      return '<span style="display:inline-block;width:12px;height:3px;background:' + c +
        ';vertical-align:middle;margin-right:3px"></span>';
    };
    el.innerHTML = sw(CPM_COLOR_CRITICAL) + '<b style="color:#c9d3dd">' + crit + '</b> ' + _L('tm_cpm_critical', 'critical') +
      '<span style="margin:0 5px">·</span>' + sw(CPM_COLOR_FLOAT) + '<b style="color:#c9d3dd">' + slack + '</b> ' + _L('tm_cpm_with_float', 'with float');
    el.title = _L('tm_tt_cpm', 'Critical Path Method, recomputed after every edit. Red = zero total float: the task cannot slip without moving the project end. Green = it has slack.\nProject duration {pf}d · total float {minF}..{maxF}d.\nCPM reads the dates the drag produced — it never changes one.', { pf: pf, minF: minF, maxF: maxF });
  }

  function _tmAnnotateCpm(schedId) {
    var app = TMS.A(), SA = (typeof window !== 'undefined') && window.ScheduleAuthor;
    if (!app || !app.db || !SA || !SA.computeCpm) {
      console.log('§GANTT_CPM_ANNOTATE_SKIP reason=ScheduleAuthor_not_loaded');
      _tmCpmLegend(null);
      return null;
    }
    schedId = schedId || (TMS._taskIndex && TMS._taskIndex.scheduleId) || 'SCH_AUTHORED';
    // A `tasks` table predating the widened DDL has no is_critical column, so computeCpm's UPDATE
    // would throw INSIDE a drag commit. Probe first and refuse loudly — annotate must never be able
    // to break an edit that already succeeded.
    try { app.db.exec('SELECT is_critical FROM tasks LIMIT 1'); }
    catch (e) {
      console.log('§GANTT_CPM_ANNOTATE_SKIP reason=thin_tasks_table schedule=' + schedId);
      _tmCpmLegend(null);
      return null;
    }
    var r = null;
    try { r = SA.computeCpm(app.db, schedId, { fixedDates: true }); }
    catch (e) { console.log('§GANTT_CPM_ANNOTATE_SKIP reason=threw msg=' + (e && e.message)); _tmCpmLegend(null); return null; }
    if (!r || r.error) {
      // Cycle/orphan (computeCpm logs §SE_CPM_BAIL) or no tasks. 2 of the 7 fleet buildings still
      // carry cycles (4D_SCHEDULE_PERFECTION.md §MILESTONE), so this is a real, expected branch.
      // CLEAR the marks rather than leave stale ones on screen — never paint a critical path that
      // the current dates do not support.
      _ganttCritical = {};
      _tmCpmLegend(null);
      console.log('§GANTT_CPM_ANNOTATE_SKIP reason=' + (r ? r.error : 'no_result') + ' schedule=' + schedId);
      return null;
    }
    var marks = {}, crit = 0, minF = null, maxF = null;
    (r.tasks || []).forEach(function (t) {
      marks[t.id] = { critical: !!t.critical, totalFloat: t.totalFloat };
      if (t.critical) crit++;
      if (minF === null || t.totalFloat < minF) minF = t.totalFloat;
      if (maxF === null || t.totalFloat > maxF) maxF = t.totalFloat;
    });
    _ganttCritical = marks;
    var nT = (r.tasks || []).length;
    _tmCpmLegend(crit, nT - crit, r.projectDuration, minF, maxF);
    console.log('§GANTT_CPM_ANNOTATE schedule=' + schedId + ' tasks=' + nT +
      ' critical=' + crit + ' (' + (nT ? Math.round(crit / nT * 100) : 0) + '%) projectDuration=' +
      r.projectDuration + 'd float=' + minF + '..' + maxF + ' datesWritten=0 (fixedDates)');
    return r;
  }

  // Commit a finished gesture: engine verb → clamp/cascade result → re-time elements → redraw.
  // ── §TM_BAKE_LOCK — the film plays this timeline; do not edit it mid-record ───────────────────
  // Implementing bim-compiler prompts/SCRIPT_LENGTH_REFACTOR_SEAMS.md §S56.
  // User's rule, verbatim: "Alt-S movie making is a separation of concern. It runs the TM to record
  // the movie. User should not do both same time to avoid conflict." Until now that was DISCIPLINE,
  // not code: cinema_maxq.js sets A._maxqActive (:884) and dlod_nav.js/panels.js both honour it,
  // while time_machine.js — the thing being recorded — never read it at all.
  // The busy triple is the SAME one tmWarmXrayElements already uses below (see its comment: the
  // flags dlod_nav.js names as "not idle"). Extracted from that list rather than invented; there is
  // deliberately no new bake flag on APP, because a second source of truth is how these drift.
  // Refusal is LOUD and returns — never a silent no-op, never a queued edit applied after the bake.
  function _tmBusyRecording(app) {
    if (!app) return null;
    if (app._maxqActive) return 'maxq_bake';
    if (app._cinemaOrbitActive) return 'cinema_orbit';
    if (app._stillRefineActive) return 'still_refine';
    return null;
  }

  // _tmEditLocked(verb) — the ONE refusal, called by every timeline-mutating entry point.
  // Implementing bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §S69. §S56 shipped this guard as five
  // duplicated lines inside commitGanttDrag and generateGanttSchedule; the five paths added since
  // (ruler shift, group shift, undo, link, typed apply/unlink) never got a copy, so a bake could be
  // desynced by any of them. Duplication was the mechanism — a rule that has to be re-typed at each
  // new call site is a rule that eventually is not. One helper, one log format, and W-TBL-5 derives
  // the list of callers from the code instead of trusting a hand-kept list.
  // Refusal stays LOUD and returns — never a silent no-op, never an edit queued and applied after
  // the bake finishes.
  function _tmEditLocked(verb) {
    var busy = _tmBusyRecording(TMS.A());
    if (!busy) return false;
    console.log('§TM_BAKE_LOCK refused=' + verb + ' reason=' + busy +
      ' — the film is playing this timeline; editing it mid-record would desync the recording');
    return true;
  }

  // _tmPersistEdit(what) — write the edited building back to the IndexedDB slot it was loaded from.
  // Implementing bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §S70.
  // Until now an in-canvas Gantt edit lived ONLY in the in-memory sql.js db and died on reload.
  // retimeTaskElements writes kernel_ops with raw SQL rather than through KernelOps' commit API, so
  // kernel_ops.js's own debounce never fired for it, and nothing else persisted it either. This is
  // the same gap schedule_editor_ui.js (the Editor tab, since folded in — §TM_P6_FOLD) closed (§SE-6, "the gap that made every
  // schedule edit vanish on tab close") — same DB, same slot, same verb, just never wired here.
  // MEASURED cost of persistDb's whole-db export on the real fleet: Duplex 3ms, Terminal 10ms,
  // LTU 26ms, Clinic 47ms, JKR 70ms, Hospital (252MB) 86ms — one dropped frame at the worst, and
  // persistDb debounces 1200ms on top, so a burst of drags collapses to a single write.
  // Guards mirror §KRN_PERSIST_GUARD: only APP.db under the url APP.db's own bytes came from,
  // never a foreign db (a lens committing its own op-db under the building's key cost a P0 in
  // kernel_ops.js), and never when _cacheDisabled (incognito / low quota).
  // §TM_SPLITMODE_PERSIST_KEY (4D_GANTT_TM_REFACTOR.md §S78): a split-mode building's A.db is
  // loaded from metaUrl, not A.DB_URL (streaming.js) — persisting under A.DB_URL writes a slot
  // the reload path's cachedFetch(metaUrl) never reads, so the edit survives the write and is
  // silently unreachable on reload (measured on Hospital/Clinic, §S76). app._dbPersistUrl is set
  // by streaming.js at the exact point app.db is assigned, in BOTH the split and whole-db
  // branches — it is the one url that is always guaranteed to describe app.db's actual content,
  // so persisting under it (falling back to app.DB_URL only if a pre-this-fix build never set it)
  // keeps read-key and write-key derived from the same fact, not two independent guesses.
  function _tmPersistEdit(what) {
    var app = TMS.A(), SA = (typeof window !== 'undefined') && window.ScheduleAuthor;
    if (!app || !app.db || !SA || !SA.persistDb) {
      console.log('§GANTT_EDIT_PERSIST_SKIP what=' + what + ' reason=ScheduleAuthor_not_loaded');
      return;
    }
    if (!app.DB_URL) { console.log('§GANTT_EDIT_PERSIST_SKIP what=' + what + ' reason=no_db_url'); return; }
    if (app._cacheDisabled) { console.log('§GANTT_EDIT_PERSIST_SKIP what=' + what + ' reason=cache_disabled'); return; }
    var persistUrl = app._dbPersistUrl || app.DB_URL;
    SA.persistDb(app.db, persistUrl, {}).then(function (ok) {
      console.log('§GANTT_EDIT_PERSIST what=' + what + ' url=' + persistUrl + ' ok=' + ok);
      // §GANTT_EDIT_PERSIST_FAIL (bim-compiler 4D_GANTT_TM_REFACTOR.md §5b) — a save that fails must
      // be LOUD. Before this the ok=false branch did nothing but log at info level: the edit stayed
      // on screen, looked saved, and was gone on the next reload. persistDb now reports false for a
      // real abort (§SCHED_PERSIST_ERR carries the reason), so say so where the user is looking.
      if (!ok) {
        console.warn('§GANTT_EDIT_PERSIST_FAIL what=' + what + ' url=' + persistUrl +
          ' — edit is in memory only and will NOT survive a reload');
        try { _tmSay('⚠ Could not save this edit — it will be lost on reload. See console (§SCHED_PERSIST_ERR).', 7000); } catch (e) {}
      }
    });
  }

  // ── §TM_SILENT_REFUSAL — every refusal the user can trigger gets a visible tip ─────────────────
  // Implementing the tm-error-handling spec (W-TM-SRT / W-TM-EXC). Before this, ten refusal paths
  // logged a §..._REJECT/§..._FAIL line and returned: the drag snapped back, the click did nothing,
  // and the user saw NOTHING (commitGanttDrag :6205/:6210/:6243/:6259, shiftGanttSchedule
  // :6347/:6363, commitGanttGroupShift :6401/:6418, the dblclick lock gate :6852, openGanttProps
  // :6934, linkGanttBars :6864 — pre-fix line numbers). Same centralization rationale as
  // _tmEditLocked above: a tip that has to be re-typed at each new refusal site is a tip that
  // eventually is not (witness_tm_silent_refusal_tips.js now gates that).
  function _tmTipRestore(tip) {
    // _tmSayException below loosens these so its inline action is clickable/wrappable; every
    // hide (and every fresh show) puts the drawer's original inline contract back.
    tip.style.pointerEvents = 'none';
    tip.style.whiteSpace = 'nowrap';
    tip.style.overflow = 'hidden';
  }
  function _tmSay(msg, ms) {
    var tip = document.getElementById('tm-gantt-tip');
    if (!tip) return;
    _tmTipRestore(tip);
    tip.textContent = msg;
    tip.style.display = 'block';
    setTimeout(function () { tip.style.display = 'none'; }, ms || 2600);
  }

  // ── §TM_EDIT_EXCEPTION — an edit pipeline that THROWS must not leave a stale frame ─────────────
  // Each edit verb runs a multi-step pipeline (engine verb → retimeTaskElements → resync → annotate
  // → persist → repaint). Before this, a throw anywhere in it propagated uncaught to
  // error_reporter.js's sitewide handler (generic "Something went wrong", 3-per-session cap, shared
  // app-wide) and TM's own display froze on whatever half-updated frame the throw interrupted.
  // On catch: log, then re-derive the display from the DB's REAL current state. Every recovery step
  // is an idempotent re-deriver (verified by reading each: _tmResyncAfterRetime re-sorts _ops and
  // nulls caches; invalidateGanttModel nulls flags; computeDays re-reads _placeOps(); drawGanttMini
  // rebuilds and redraws; renderAtTime paints visibility at the cursor) — the same five calls every
  // successful edit already ends with, and undoLastGanttEdit already re-runs after restoring the DB.
  // Each step is individually guarded so one failing step cannot rob the panel of the rest.
  function _tmEditExceptionRecover(fnName, e) {
    console.log('§TM_EDIT_EXCEPTION fn=' + fnName + ' error=' + (e && e.message));
    try { _tmResyncAfterRetime(); } catch (e2) { console.log('§TM_EDIT_EXCEPTION_RECOVER_SKIP step=resync error=' + (e2 && e2.message)); }
    try { TMS.invalidateGanttModel(); } catch (e2) { console.log('§TM_EDIT_EXCEPTION_RECOVER_SKIP step=invalidate error=' + (e2 && e2.message)); }
    try { TMS.computeDays(); } catch (e2) { console.log('§TM_EDIT_EXCEPTION_RECOVER_SKIP step=computeDays error=' + (e2 && e2.message)); }
    try { TMS.drawGanttMini(); } catch (e2) { console.log('§TM_EDIT_EXCEPTION_RECOVER_SKIP step=draw error=' + (e2 && e2.message)); }
    try { TMS.renderAtTime(TMS._cursor); } catch (e2) { console.log('§TM_EDIT_EXCEPTION_RECOVER_SKIP step=render error=' + (e2 && e2.message)); }
    try { _tmSayException(e); } catch (e2) { console.log('§TM_EDIT_EXCEPTION_RECOVER_SKIP step=tip error=' + (e2 && e2.message)); }
  }

  // The TM-specific message (never the sitewide generic toast), plus the ONE concrete, low-risk
  // mitigation that is actually buildable from what exists: offering to close the OTHER open
  // panels. "Other panels" is grounded in the app's REAL registry — scene.js's _registerPanel /
  // window._panels ({id, el, nav, close}), using the exact visibility check _cyclePanel already
  // uses. The TM panel itself is NOT in that registry (hand-built #time-machine-panel appended to
  // document.body), so the id filter is belt-and-braces. Closing is ONLY ever user-clicked — the
  // offer is an inline button in the tip, never an automatic side-effect.
  function _tmVisibleOtherPanels() {
    var out = [];
    var reg = (typeof window !== 'undefined' && window._panels) || [];
    for (var i = 0; i < reg.length; i++) {
      var p = reg[i];
      if (!p || !p.el || p.el.id === 'time-machine-panel') continue;
      if (p.el.style.display !== 'none' && p.el.offsetWidth > 0) out.push(p);   // _cyclePanel's check
    }
    return out;
  }
  function _tmSayException(e) {
    var _L = (typeof TMS._tmTrl === 'function') ? TMS._tmTrl : function (k, en, r) { var s = en; if (r) for (var q in r) s = s.replace('{' + q + '}', r[q]); return s; };   // S226 §R2b — sliced into vm sandboxes by witnesses
    var tip = document.getElementById('tm-gantt-tip');
    if (!tip) return;
    var shortReason = (e && e.message) ? String(e.message).slice(0, 90) : _L('tm_unexpected_error', 'unexpected error');
    _tmTipRestore(tip);
    tip.textContent = _L('tm_edit_exception', 'Time Machine couldn\'t complete this edit — {reason}', { reason: shortReason });
    var others = [];
    try { others = _tmVisibleOtherPanels(); } catch (e2) {}
    var hidden = false;
    function hide() {
      if (hidden) return;
      hidden = true;
      tip.style.display = 'none';
      _tmTipRestore(tip);
    }
    if (others.length) {
      var btn = document.createElement('button');
      btn.textContent = _L('tm_close_other_panels', 'Close other panels ({n})', { n: others.length });
      btn.style.cssText = 'display:block;margin-top:3px;font-size:10px;padding:1px 6px;cursor:pointer';
      btn.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var ids = [], n = 0;
        for (var i = 0; i < others.length; i++) {
          var p = others[i];
          try {
            if (typeof p.close === 'function') p.close();
            else p.el.style.display = 'none';
            ids.push(p.id); n++;
          } catch (e3) {}
        }
        console.log('§TM_CLOSE_OTHER_PANELS closed=' + n + ' ids=[' + ids.join(',') + ']');
        hide();
      });
      tip.appendChild(btn);
      // The drawer tip ships pointer-events:none + nowrap/ellipsis (fine for passive text, fatal
      // for a button) — loosen while the offer is up; hide()/_tmTipRestore puts it all back.
      tip.style.pointerEvents = 'auto';
      tip.style.whiteSpace = 'normal';
      tip.style.overflow = 'visible';
    }
    tip.style.display = 'block';
    setTimeout(hide, others.length ? 8000 : 3600);
  }

  function commitGanttDrag(bar, mode, deltaDays) {
    var _L = (typeof TMS._tmTrl === 'function') ? TMS._tmTrl : function (k, en, r) { var s = en; if (r) for (var q in r) s = s.replace('{' + q + '}', r[q]); return s; };   // S226 §R2b — sliced into vm sandboxes by witnesses
    if (_tmEditLocked('commitGanttDrag')) return;
    var app = TMS.A();
    var SA = (typeof window !== 'undefined') && window.ScheduleAuthor;
    if (!app || !app.db || !SA || !SA.moveTaskCascade) {
      console.log('§GANTT_DRAG_REJECT reason=ScheduleAuthor_not_loaded');
      _tmSay(_L('tm_not_available', 'Not available'));   // §TM_SILENT_REFUSAL — same wording as setGanttBaseline/rescheduleGanttAsap's SA guard
      return;
    }
    if (!bar.taskId) {
      // Honest refusal: an un-authored bar has no task to move. Never fake the edit.
      console.log('§GANTT_DRAG_REJECT reason=bar_has_no_task storey="' + bar.storey + '" phase="' + bar.phase + '"');
      _tmSay(_L('tm_not_editable', 'Not editable — no schedule task on this bar'));   // §TM_SILENT_REFUSAL — same wording as wireGanttDrag's copy of this refusal
      return;
    }
    var schedId = (TMS._taskIndex && TMS._taskIndex.scheduleId) || 'SCH_AUTHORED';
    var d = function (ms) { return new Date(ms).toISOString().slice(0, 10); };

    // §GANTT_EDIT_UNDO — snapshot BEFORE the engine verb mutates `tasks`. Cascade scope isn't known
    // until the verb returns, so this captures every leaf task in the active schedule (cheap — a
    // handful to a few hundred rows), not just the dragged one.
    var tasksBefore = {};
    try {
      var tb = app.db.exec('SELECT task_id, schedule_start, schedule_finish, schedule_duration ' +
        'FROM tasks WHERE schedule_id=? AND (is_summary IS NULL OR is_summary=0)', [schedId]);
      if (tb.length) tb[0].values.forEach(function (row) {
        tasksBefore[row[0]] = { start: row[1], finish: row[2], duration: row[3] };
      });
    } catch (e) {}

    // §S22_EPOCH_FIX (4D_GANTT_TM_REFACTOR.md §S22, MEASURED 2026-08-17): the target date string
    // handed to moveTaskCascade/resizeTask used to be d(bar.startTs + deltaDays*86400000) — bar.startTs
    // is the TM's OWN internal clock (kernel_ops-derived day-offset solve, near-1970 by construction),
    // NOT a real calendar date. On a real drag this produced a target like "1970-01-19" that
    // moveTaskCascade's C2 predecessor-floor clamp (correctly) snapped straight back to the task's
    // OWN current real position (`§GANTT_EDIT_CLAMP requested=1970-01-19 clampedTo=2026-08-23
    // blockedBy=...`, measured live) — the drag's deltaDays was silently discarded, the task never
    // actually moved, EVERY 'move' drag on an on-critical-path task was a no-op in real terms. The
    // target must be computed from the task's ACTUAL real calendar position — tasksBefore[bar.taskId],
    // captured just above from the SAME `tasks` table ScheduleAuthor itself reads — not from bar's
    // TM-clock fields. bar.taskId is guaranteed present in tasksBefore (same query, same schedId,
    // same task) except in a genuinely stale-model edge case, refused rather than silently
    // mis-targeted.
    var tbBar = tasksBefore[bar.taskId];
    if (!tbBar || !tbBar.start || !tbBar.finish) {
      console.log('§GANTT_DRAG_REJECT reason=no_real_task_snapshot task=' + bar.taskId);
      _tmSay(_L('tm_cannot_edit_no_dates', 'Cannot edit — no real dates found for this task'));   // §TM_SILENT_REFUSAL
      return;
    }
    var realS0 = Date.parse(tbBar.start + 'T00:00:00Z'), realE0 = Date.parse(tbBar.finish + 'T00:00:00Z');

    // §TM_EDIT_EXCEPTION — the whole pipeline (engine verb → retime → resync → annotate → persist →
    // repaint), so a throw anywhere in it recovers the display instead of freezing a stale frame.
    try {
    var res;
    if (mode === 'move') {
      res = SA.moveTaskCascade(app.db, schedId, bar.taskId, d(realS0 + deltaDays * 86400000), {});
    } else if (mode === 'resizeR') {
      res = SA.resizeTask(app.db, schedId, bar.taskId, d(realS0),
        d(realE0 + deltaDays * 86400000), {});
    } else {
      res = SA.resizeTask(app.db, schedId, bar.taskId, d(realS0 + deltaDays * 86400000),
        d(realE0), {});
    }
    if (!res || !res.ok) {
      // §TM_SILENT_REFUSAL — the CLAMPED case below always showed a tip; the outright-failure case
      // (bad_date / no_such_task / no_tasks / cycle from the engine verb) showed nothing at all.
      console.log('§GANTT_DRAG_REJECT task=' + bar.taskId + ' reason=' + ((res && res.reason) || 'unknown'));
      _tmSay(_L('tm_rejected', 'Rejected: {reason}', { reason: (res && res.reason) || _L('tm_unknown', 'unknown') }));   // same format as the props panel's Rejected: line
      return;
    }
    // C2 feedback: the user must SEE that the drag was refused, not silently land somewhere else.
    if (res.clamped) {
      var tip = document.getElementById('tm-gantt-tip');
      if (tip) {
        tip.textContent = _L('tm_blocked_clamped', 'Blocked by {by} — clamped to {start}', { by: res.blockedBy, start: res.start });
        tip.style.display = 'block';
        setTimeout(function () { tip.style.display = 'none'; }, 2600);
      }
    }
    var barsByTask = {};
    for (var i = 0; i < TMS._ganttTasks.length; i++) if (TMS._ganttTasks[i].taskId) barsByTask[TMS._ganttTasks[i].taskId] = TMS._ganttTasks[i];

    // §GANTT_EDIT_UNDO — the element-op "before" state, captured from the in-memory _ops (still the
    // pre-retime values at this point) for exactly the guids retimeTaskElements is about to touch.
    // Hash the guid->op lookup ONCE (same shape as retimeTaskElements's own opByGuid below) — a
    // linear scan per guid here was O(cascadeGuids * totalOps): measured 92s wall-clock on Terminal
    // (3,519 guids * 48,428 ops) before this fix, unusable for an interactive drag.
    var opsBefore = {};
    var _opByGuidForUndo = {};
    for (var oi2 = 0; oi2 < TMS._ops.length; oi2++) if (TMS._ops[oi2].output_guid) _opByGuidForUndo[TMS._ops[oi2].output_guid] = TMS._ops[oi2];
    (res.moved || []).forEach(function (m) {
      var bar2 = barsByTask[m.id]; if (!bar2 || !bar2.guids) return;
      bar2.guids.forEach(function (g) {
        var op = _opByGuidForUndo[g];
        if (op) opsBefore[g] = { start_ts: op.start_ts, end_ts: op.end_ts, parameters: JSON.stringify(op.parameters) };
      });
    });

    retimeTaskElements(app.db, barsByTask, res.moved || [], tasksBefore);
    _lastEdit = { schedId: schedId, taskId: bar.taskId, mode: mode, tasksBefore: tasksBefore, opsBefore: opsBefore };
    console.log('§GANTT_DRAG_COMMIT task=' + bar.taskId + ' mode=' + mode + ' deltaDays=' + deltaDays +
      ' start=' + res.start + ' clamped=' + res.clamped + ' cascaded=' + res.cascaded);
    _tmResyncAfterRetime();   // §GANTT_RETIME_RESYNC — without this the canvas plays the OLD times
    _tmAnnotateCpm(schedId);   // §GANTT_CPM_ANNOTATE (§S68) — re-derive float/critical FROM the new dates
    _tmPersistEdit('drag');   // §S70 — the edit must survive a reload
    TMS.invalidateGanttModel();
    TMS.computeDays();
    TMS.drawGanttMini();
    TMS.renderAtTime(TMS._cursor);
    // §S73 — the ONLY `return true` in this function. Every refusal above returns undefined, so the
    // __tmGanttDrag test hook can report what actually happened instead of "I found the bar."
    return true;
    } catch (e) { _tmEditExceptionRecover('commitGanttDrag', e); }   // §TM_EDIT_EXCEPTION — undefined return = "did not commit" (§S73)
  }
  // Test hooks (diagnostic only, same contract as __tmZoneProbe) — §S7's live drag reproduction:
  // a headless probe needs the real commit path and the real computed bars, not a DOM gesture.
  // §S73: returns whether the edit COMMITTED, not whether the bar was found. It used to return true
  // for a refused edit too — including a §TM_BAKE_LOCK refusal — so a probe watching this hook would
  // report a mid-bake edit as successful, which is precisely the regression the lock exists to catch.
  // `notFound` is distinguishable from `false` for the same reason: a renamed task should not read as
  // "the software refused."
  window.__tmGanttDrag = function (taskId, mode, deltaDays) {
    for (var i = 0; i < TMS._ganttTasks.length; i++) {
      if (TMS._ganttTasks[i].taskId === taskId) return commitGanttDrag(TMS._ganttTasks[i], mode, deltaDays) === true;
    }
    return 'notFound';
  };
  window.__tmGanttWindows = function () {   // NOT __tmGanttBars — drawGanttMini owns that name (rects)
    return TMS._ganttTasks.map(function (g) {
      return { taskId: g.taskId, storey: g.storey, phase: g.phase, startTs: g.startTs, endTs: g.endTs,
               n: g.guids ? g.guids.length : 0 };
    });
  };
  // §S22_DIAG (2026-08-17, 4D_GANTT_TM_REFACTOR.md §S22 — TM invisible-after-drag-then-scrub bug):
  // read-only, same double-underscore convention as __tmGanttWindows above but returns the actual
  // guid list for one task, needed to check per-guid mesh-visibility state (via __tmSnapshotVisible)
  // against the schedule, which __tmGanttWindows (count only) cannot support. Diagnostic only.
  window.__tmGanttTaskGuids = function (taskId) {
    for (var i = 0; i < TMS._ganttTasks.length; i++) {
      if (TMS._ganttTasks[i].taskId === taskId) return (TMS._ganttTasks[i].guids || []).slice();
    }
    return null;
  };

  // §TM_RULER_SHIFT — drag the day ruler to move the WHOLE project's start/finish. Same shape as
  // commitGanttDrag (snapshot every leaf task's before-state + every touched guid's before-state
  // into the SAME _lastEdit single-level undo, call the real engine verb, retimeTaskElements to
  // resync playback), just against SA.shiftSchedule instead of moveTaskCascade/resizeTask and
  // against EVERY task instead of one cascade. mode:'shift' in _lastEdit is cosmetic (log/tip text
  // only) — undoLastGanttEdit's restore loop doesn't branch on it, so no other change was needed
  // there at all.
  function shiftGanttSchedule(deltaDays) {
    var _L = (typeof TMS._tmTrl === 'function') ? TMS._tmTrl : function (k, en, r) { var s = en; if (r) for (var q in r) s = s.replace('{' + q + '}', r[q]); return s; };   // S226 §R2b — sliced into vm sandboxes by witnesses
    if (_tmEditLocked('shiftGanttSchedule')) return;   // §TM_BAKE_LOCK (§S69)
    var app = TMS.A();
    var SA = (typeof window !== 'undefined') && window.ScheduleAuthor;
    if (!app || !app.db || !SA || !SA.shiftSchedule) {
      console.log('§TM_RULER_SHIFT_REJECT reason=ScheduleAuthor_not_loaded');
      _tmSay(_L('tm_not_available', 'Not available'));   // §TM_SILENT_REFUSAL
      return;
    }
    if (!deltaDays) return;   // a click, not a drag — nothing to shift
    var schedId = (TMS._taskIndex && TMS._taskIndex.scheduleId) || 'SCH_AUTHORED';

    var tasksBefore = {};
    try {
      var tb = app.db.exec('SELECT task_id, schedule_start, schedule_finish, schedule_duration FROM tasks WHERE schedule_id=?', [schedId]);
      if (tb.length) tb[0].values.forEach(function (row) {
        tasksBefore[row[0]] = { start: row[1], finish: row[2], duration: row[3] };
      });
    } catch (e) {}

    try {   // §TM_EDIT_EXCEPTION — engine verb through final repaint
    var res = SA.shiftSchedule(app.db, schedId, deltaDays);
    if (!res || !res.ok) {
      console.log('§TM_RULER_SHIFT_REJECT reason=' + ((res && res.reason) || 'unknown'));
      _tmSay(_L('tm_cannot_shift', 'Cannot shift — {reason}', { reason: (res && res.reason) || _L('tm_no_schedule', 'no schedule') }));   // §TM_SILENT_REFUSAL — same shape as "Cannot compress"
      return;
    }

    var barsByTask = {};
    for (var i = 0; i < TMS._ganttTasks.length; i++) if (TMS._ganttTasks[i].taskId) barsByTask[TMS._ganttTasks[i].taskId] = TMS._ganttTasks[i];
    var opsBefore = {};
    var _opByGuidForUndo = {};
    for (var oi2 = 0; oi2 < TMS._ops.length; oi2++) if (TMS._ops[oi2].output_guid) _opByGuidForUndo[TMS._ops[oi2].output_guid] = TMS._ops[oi2];
    res.moved.forEach(function (m) {
      var bar2 = barsByTask[m.id]; if (!bar2 || !bar2.guids) return;
      bar2.guids.forEach(function (g) {
        var op = _opByGuidForUndo[g];
        if (op) opsBefore[g] = { start_ts: op.start_ts, end_ts: op.end_ts, parameters: JSON.stringify(op.parameters) };
      });
    });

    retimeTaskElements(app.db, barsByTask, res.moved, tasksBefore);
    _lastEdit = { schedId: schedId, taskId: '(whole schedule)', mode: 'shift', tasksBefore: tasksBefore, opsBefore: opsBefore };
    console.log('§TM_RULER_SHIFT_COMMIT schedule=' + schedId + ' deltaDays=' + deltaDays + ' tasks=' + res.moved.length);
    _tmResyncAfterRetime();   // §GANTT_RETIME_RESYNC — without this the canvas plays the OLD times
    _tmAnnotateCpm(schedId);   // §GANTT_CPM_ANNOTATE (§S68) — re-derive float/critical FROM the new dates
    _tmPersistEdit('rulerShift');   // §S70 — the edit must survive a reload
    TMS.invalidateGanttModel();
    TMS.computeDays();
    TMS.drawGanttMini();
    TMS.renderAtTime(TMS._cursor);
    } catch (e) { _tmEditExceptionRecover('shiftGanttSchedule', e); }   // §TM_EDIT_EXCEPTION
  }

  // §GANTT_GROUP_MOVE — same shape as shiftGanttSchedule, scoped to an explicit marquee-selected
  // task_id list instead of the whole schedule. Reuses the SAME _lastEdit single-level undo — its
  // restore loop doesn't care whether tasksBefore/opsBefore covers a cascade, the whole schedule,
  // or a selection, it just restores whatever's in there.
  function commitGanttGroupShift(taskIds, deltaDays) {
    var _L = (typeof TMS._tmTrl === 'function') ? TMS._tmTrl : function (k, en, r) { var s = en; if (r) for (var q in r) s = s.replace('{' + q + '}', r[q]); return s; };   // S226 §R2b — sliced into vm sandboxes by witnesses
    if (_tmEditLocked('commitGanttGroupShift')) return;   // §TM_BAKE_LOCK (§S69)
    var app = TMS.A();
    var SA = (typeof window !== 'undefined') && window.ScheduleAuthor;
    if (!app || !app.db || !SA || !SA.shiftTasks) {
      console.log('§GANTT_GROUP_SHIFT_REJECT reason=ScheduleAuthor_not_loaded');
      _tmSay(_L('tm_not_available', 'Not available'));   // §TM_SILENT_REFUSAL
      return;
    }
    if (!deltaDays || !taskIds || !taskIds.length) return;
    var schedId = (TMS._taskIndex && TMS._taskIndex.scheduleId) || 'SCH_AUTHORED';

    var tasksBefore = {};
    try {
      var placeholders = taskIds.map(function () { return '?'; }).join(',');
      var tb = app.db.exec('SELECT task_id, schedule_start, schedule_finish, schedule_duration FROM tasks WHERE task_id IN (' + placeholders + ')', taskIds);
      if (tb.length) tb[0].values.forEach(function (row) {
        tasksBefore[row[0]] = { start: row[1], finish: row[2], duration: row[3] };
      });
    } catch (e) {}

    try {   // §TM_EDIT_EXCEPTION — engine verb through final repaint
    var res = SA.shiftTasks(app.db, taskIds, deltaDays);
    if (!res || !res.ok) {
      console.log('§GANTT_GROUP_SHIFT_REJECT reason=' + ((res && res.reason) || 'unknown'));
      _tmSay(_L('tm_cannot_move_group', 'Cannot move group — {reason}', { reason: (res && res.reason) || _L('tm_no_schedule', 'no schedule') }));   // §TM_SILENT_REFUSAL
      return;
    }

    var barsByTask = {};
    for (var i = 0; i < TMS._ganttTasks.length; i++) if (TMS._ganttTasks[i].taskId) barsByTask[TMS._ganttTasks[i].taskId] = TMS._ganttTasks[i];
    var opsBefore = {};
    var _opByGuidForUndo = {};
    for (var oi3 = 0; oi3 < TMS._ops.length; oi3++) if (TMS._ops[oi3].output_guid) _opByGuidForUndo[TMS._ops[oi3].output_guid] = TMS._ops[oi3];
    res.moved.forEach(function (m) {
      var bar3 = barsByTask[m.id]; if (!bar3 || !bar3.guids) return;
      bar3.guids.forEach(function (g) {
        var op = _opByGuidForUndo[g];
        if (op) opsBefore[g] = { start_ts: op.start_ts, end_ts: op.end_ts, parameters: JSON.stringify(op.parameters) };
      });
    });

    retimeTaskElements(app.db, barsByTask, res.moved, tasksBefore);
    _lastEdit = { schedId: schedId, taskId: '(' + taskIds.length + ' selected)', mode: 'group-shift', tasksBefore: tasksBefore, opsBefore: opsBefore };
    console.log('§GANTT_GROUP_SHIFT_COMMIT tasks=' + res.moved.length + ' deltaDays=' + deltaDays);
    _tmResyncAfterRetime();   // §GANTT_RETIME_RESYNC — without this the canvas plays the OLD times
    _tmAnnotateCpm(schedId);   // §GANTT_CPM_ANNOTATE (§S68) — re-derive float/critical FROM the new dates
    _tmPersistEdit('groupShift');   // §S70 — the edit must survive a reload
    TMS.invalidateGanttModel();
    TMS.computeDays();
    TMS.drawGanttMini();
    TMS.renderAtTime(TMS._cursor);
    } catch (e) { _tmEditExceptionRecover('commitGanttGroupShift', e); }   // §TM_EDIT_EXCEPTION
  }

  // §GANTT_EDIT_UNDO — reverse the single most recent commitGanttDrag edit. Restores both halves
  // that edit changed: the task dates (moveTaskCascade/resizeTask's write to `tasks`) and the
  // element ops (retimeTaskElements's write to `kernel_ops`) — same two tables, same shape, run
  // backward. Single-level: clears _lastEdit so a second click is a no-op, not a second undo step.
  function undoLastGanttEdit() {
    var _L = (typeof TMS._tmTrl === 'function') ? TMS._tmTrl : function (k, en, r) { var s = en; if (r) for (var q in r) s = s.replace('{' + q + '}', r[q]); return s; };   // S226 §R2b — sliced into vm sandboxes by witnesses
    // §TM_BAKE_LOCK (§S69) — an undo mutates the timeline exactly as much as the edit it reverses.
    if (_tmEditLocked('undoLastGanttEdit')) return;
    var app = TMS.A();
    var tip = document.getElementById('tm-gantt-tip');
    function say(msg) {
      if (!tip) return;
      tip.textContent = msg; tip.style.display = 'block';
      setTimeout(function () { tip.style.display = 'none'; }, 2200);
    }
    if (!_lastEdit || !app || !app.db) {
      console.log('§GANTT_EDIT_UNDO_REJECT reason=nothing_to_undo');
      say(_L('tm_nothing_to_undo', 'Nothing to undo'));
      return;
    }
    var edit = _lastEdit;
    _lastEdit = null;   // single-level — commit even if a write below throws, never retry the same edit
    var db = app.db;
    db.run('BEGIN');
    var stT = db.prepare('UPDATE tasks SET schedule_start=?, schedule_finish=?, schedule_duration=? WHERE task_id=?');
    var tRestored = 0;
    for (var tid in edit.tasksBefore) {
      var t = edit.tasksBefore[tid];
      stT.run([t.start, t.finish, t.duration, tid]);
      tRestored++;
    }
    stT.free();
    var stO = db.prepare('UPDATE kernel_ops SET timestamp=?, parameters=? WHERE op_type=\'ELEMENT_PLACE\' AND output_guid=?');
    var oRestored = 0;
    // Same O(1)-per-guid hash, same reason as commitGanttDrag's opsBefore capture — a linear scan
    // per guid here is O(cascadeGuids * totalOps), unusable on a large building's cascade.
    var _opByGuidForRestore = {};
    for (var oi3 = 0; oi3 < TMS._ops.length; oi3++) if (TMS._ops[oi3].output_guid) _opByGuidForRestore[TMS._ops[oi3].output_guid] = TMS._ops[oi3];
    for (var guid in edit.opsBefore) {
      var o = edit.opsBefore[guid];
      stO.run([o.start_ts, o.parameters, guid]);
      var opR = _opByGuidForRestore[guid];
      if (opR) { opR.start_ts = o.start_ts; opR.end_ts = o.end_ts; opR.parameters = JSON.parse(o.parameters); }
      oRestored++;
    }
    stO.free();
    db.run('COMMIT');
    console.log('§GANTT_EDIT_UNDO task=' + edit.taskId + ' mode=' + edit.mode +
      ' tasksRestored=' + tRestored + ' opsRestored=' + oRestored);
    say(_L('tm_undone', 'Undone: {mode} {task}', { mode: edit.mode, task: edit.taskId }));
    _tmResyncAfterRetime();   // §GANTT_RETIME_RESYNC — without this the canvas plays the OLD times
    _tmAnnotateCpm(edit.schedId);   // §GANTT_CPM_ANNOTATE (§S68) — re-derive float/critical FROM the new dates
    _tmPersistEdit('undo');   // §S70 — the edit must survive a reload
    TMS.invalidateGanttModel();
    TMS.computeDays();
    TMS.drawGanttMini();
    TMS.renderAtTime(TMS._cursor);
  }

  // ⚑ Set Baseline — replaces the dead Copy New slot. Definition user-confirmed 2026-08-05
  // (4D_SCHEDULE_PERFECTION.md "the transport row's two buttons"): a deliberate snapshot of the
  // schedule's own dates, a DIFFERENT axis from §TM-VARIANCE's existing ERP cost variance. Manual
  // button today because MOB's auto-trigger-at-ERP-push (M2) doesn't exist yet — once it does, the
  // SAME ScheduleAuthor.setBaseline verb gets called there too; this button does not become obsolete,
  // it becomes the "re-baseline for an approved change order" case named in the spec.
  function setGanttBaseline() {
    var _L = (typeof TMS._tmTrl === 'function') ? TMS._tmTrl : function (k, en, r) { var s = en; if (r) for (var q in r) s = s.replace('{' + q + '}', r[q]); return s; };   // S226 §R2b — sliced into vm sandboxes by witnesses
    var app = TMS.A();
    var SA = (typeof window !== 'undefined') && window.ScheduleAuthor;
    var tip = document.getElementById('tm-gantt-tip');
    function say(msg) {
      if (!tip) return;
      tip.textContent = msg; tip.style.display = 'block';
      setTimeout(function () { tip.style.display = 'none'; }, 2600);
    }
    if (!app || !app.db || !SA || !SA.setBaseline) {
      console.log('§GANTT_SET_BASELINE_REJECT reason=ScheduleAuthor_not_loaded');
      say(_L('tm_not_available', 'Not available')); return;
    }
    var schedId = (TMS._taskIndex && TMS._taskIndex.scheduleId) || 'SCH_AUTHORED';
    var res = SA.setBaseline(app.db, schedId);
    if (!res.ok) { say(_L('tm_no_baseline_yet', 'No schedule to baseline yet — generate a 4D schedule first')); return; }
    say(_L('tm_baseline_set', 'Baseline set — {n} tasks', { n: res.taskCount }));
  }

  // ⏪ Pull Back — §GANTT_RESCHEDULE_ASAP. The EXPLICIT "reschedule as early as possible" action.
  // moveTaskCascade is push-only by design (§S68's annotate-only drag contract: a drag moves ONE
  // bar and pushes violated successors, it never silently re-optimises the rest of the programme).
  // The user-decided product shape for pull-back is therefore a deliberate transport-row button —
  // same surface as ⚑ Set Baseline — not a side-effect of every drag. Same 7-step commit pipeline
  // as every other edit path (lock → verb → retime → resync → annotate → persist → redraw); W-CPM-1
  // / W-PERS-1 / W-TBL-5 derive their caller lists from the source and hold this function to it.
  function rescheduleGanttAsap() {
    var _L = (typeof TMS._tmTrl === 'function') ? TMS._tmTrl : function (k, en, r) { var s = en; if (r) for (var q in r) s = s.replace('{' + q + '}', r[q]); return s; };   // S226 §R2b — sliced into vm sandboxes by witnesses
    if (_tmEditLocked('rescheduleGanttAsap')) return;   // §TM_BAKE_LOCK (§S69)
    var app = TMS.A();
    var SA = (typeof window !== 'undefined') && window.ScheduleAuthor;
    var tip = document.getElementById('tm-gantt-tip');
    function say(msg) {
      if (!tip) return;
      tip.textContent = msg; tip.style.display = 'block';
      setTimeout(function () { tip.style.display = 'none'; }, 2600);
    }
    if (!app || !app.db || !SA || !SA.rescheduleAsap) {
      console.log('§GANTT_RESCHEDULE_ASAP_REJECT reason=ScheduleAuthor_not_loaded');
      say(_L('tm_not_available', 'Not available')); return;
    }
    // (returns: true = committed, 'nothing' = zero float to close, undefined = refused — §S73's
    // convention, so the __tmRescheduleAsap probe hook reports what HAPPENED, not "I was called".)
    var schedId = (TMS._taskIndex && TMS._taskIndex.scheduleId) || 'SCH_AUTHORED';

    // §GANTT_EDIT_UNDO — snapshot BEFORE the engine verb mutates `tasks`. This action can move MANY
    // leaf tasks, so the snapshot covers every leaf in the schedule (same scope commitGanttDrag
    // already uses for exactly this reason: "cascade scope isn't known until the verb returns").
    var tasksBefore = {};
    try {
      var tb = app.db.exec('SELECT task_id, schedule_start, schedule_finish, schedule_duration ' +
        'FROM tasks WHERE schedule_id=? AND (is_summary IS NULL OR is_summary=0)', [schedId]);
      if (tb.length) tb[0].values.forEach(function (row) {
        tasksBefore[row[0]] = { start: row[1], finish: row[2], duration: row[3] };
      });
    } catch (e) {}

    try {   // §TM_EDIT_EXCEPTION — engine verb through final repaint; a throw returns undefined = "refused" (§S73)
    var res = SA.rescheduleAsap(app.db, schedId, {});
    if (!res || !res.ok) {
      console.log('§GANTT_RESCHEDULE_ASAP_REJECT reason=' + ((res && res.reason) || 'unknown'));
      say(_L('tm_cannot_compress', 'Cannot compress — {reason}', { reason: (res && res.reason) || _L('tm_no_schedule', 'no schedule') }));
      return;
    }
    if (!res.moved.length) {
      // The verb wrote nothing (compression found zero float to close) — honest no-op, no retime,
      // no persist, no undo entry to clobber the user's real last edit.
      say(_L('tm_nothing_to_compress', 'Nothing to compress — schedule is already at earliest float'));
      return 'nothing';
    }

    var barsByTask = {};
    for (var i = 0; i < TMS._ganttTasks.length; i++) if (TMS._ganttTasks[i].taskId) barsByTask[TMS._ganttTasks[i].taskId] = TMS._ganttTasks[i];
    var opsBefore = {};
    var _opByGuidForUndo = {};
    for (var oi4 = 0; oi4 < TMS._ops.length; oi4++) if (TMS._ops[oi4].output_guid) _opByGuidForUndo[TMS._ops[oi4].output_guid] = TMS._ops[oi4];
    res.moved.forEach(function (m) {
      var bar4 = barsByTask[m.id]; if (!bar4 || !bar4.guids) return;
      bar4.guids.forEach(function (g) {
        var op = _opByGuidForUndo[g];
        if (op) opsBefore[g] = { start_ts: op.start_ts, end_ts: op.end_ts, parameters: JSON.stringify(op.parameters) };
      });
    });

    retimeTaskElements(app.db, barsByTask, res.moved, tasksBefore);
    _lastEdit = { schedId: schedId, taskId: '(' + res.moved.length + ' pulled back)', mode: 'asap', tasksBefore: tasksBefore, opsBefore: opsBefore };
    console.log('§GANTT_RESCHEDULE_ASAP_COMMIT schedule=' + schedId + ' tasks=' + res.moved.length +
      ' daysCompressed=' + res.daysCompressed);
    _tmResyncAfterRetime();   // §GANTT_RETIME_RESYNC — without this the canvas plays the OLD times
    _tmAnnotateCpm(schedId);   // §GANTT_CPM_ANNOTATE (§S68) — re-derive float/critical FROM the new dates
    _tmPersistEdit('rescheduleAsap');   // §S70 — the edit must survive a reload
    TMS.invalidateGanttModel();
    TMS.computeDays();
    TMS.drawGanttMini();
    TMS.renderAtTime(TMS._cursor);
    say((res.moved.length === 1 ? _L('tm_compressed_one', 'Compressed 1 task') : _L('tm_compressed_many', 'Compressed {n} tasks', { n: res.moved.length })) + ' — ' +
      (res.daysCompressed > 0 ? (res.daysCompressed === 1 ? _L('tm_finish_moved_one', 'project finish moved up 1 day') : _L('tm_finish_moved_many', 'project finish moved up {d} days', { d: res.daysCompressed }))
                              : _L('tm_finish_unchanged', 'project finish unchanged (internal float closed)')));
    return true;
    } catch (e) { _tmEditExceptionRecover('rescheduleGanttAsap', e); }   // §TM_EDIT_EXCEPTION
  }
  // Test hook (diagnostic only, same contract as __tmGanttDrag / __tmZoneProbe): a headless probe
  // needs the REAL commit path — lock check, engine verb, retime, resync, annotate, persist — not a
  // DOM gesture. §S73 semantics: true = committed, 'nothing' = zero closable float, false = refused.
  window.__tmRescheduleAsap = function () { return rescheduleGanttAsap() || false; };

  // §GANTT_AUTHOR_ENTRY (native, §GANTT_EDIT_LOCK 2026-08-05 dropped the last old-panel fallback) —
  // called automatically by drawGanttMini when the drawer has nothing editable to show, no button,
  // no side panel involved at all any more. Calls the real engine verb directly, same as the panel's
  // own generateDraft() zone-detail path (schedule_author_ui.js), not a reimplementation of it.
  // §GANTT_SINGLE_LOAD (2026-08-07, 4D_SCHEDULE_PERFECTION.md §GANTT_DOUBLE_LOAD) — the materialize
  // core, callable BEFORE activation: no UI tip, no refold. Returns true iff a fresh native schedule
  // was written. Scoped to the truly-cold case only (NO schedule row at all) — an existing schedule,
  // authored or captured, is left for injectGantt to absorb as-is; generateGanttSchedule() below keeps
  // its own wider semantics (regenerates over a non-captured schedule) for the drawer's auto-gen
  // fallback. Same materializeZones call/opts as generateGanttSchedule — keep them in sync.
  function _materializeNativeSchedule(app) {
    var SA = (typeof window !== 'undefined') && window.ScheduleAuthor;
    if (!app || !app.db || !SA || !SA.materializeZones) return false;
    // §TM_BAKE_LOCK (§S69) — deliberately NOT guarded, and the line below is why: this bootstrap
    // returns early whenever a schedule already exists, and a bake by definition plays an existing
    // one. It can only ever write the FIRST schedule for a building, which is not a timeline any
    // film is mid-way through recording. W-TBL-5d asserts that early-return still stands.
    var act = SA.activeSchedule ? SA.activeSchedule(app.db) : null;
    if (act) return false;                       // schedule exists — injectGantt absorbs it, one pass
    var todayStart = new Date().toISOString().slice(0, 10);
    var SR = window.SEQUENCE_RULES || {}, LR = window.LABOR_RATES || {}, RT = window.RATES || {};
    var _shiftHoursGantt = (window.SHIFT_HOURS > 0) ? window.SHIFT_HOURS : 24; // §GANTT_SHIFT_HOURS_DESYNC — match injectGantt's real clock
    var res = SA.materializeZones(app.db, SR, { start: todayStart, laborRates: LR, rates: RT, scheduleGate: window.ScheduleGate, shiftHours: _shiftHoursGantt, genVersion: TMS._GANTT_CACHE_VERSION, displayRemap: TMS._tmDisplayRemap, template: TMS._4dTemplate });   // §ZONE_DISPLAY_AUTHORING + §TPL_WIRED
    if (!res.ok && SA.materializeDefault) res = SA.materializeDefault(app.db, SR, { start: todayStart, laborRates: LR, blank: false, genVersion: TMS._GANTT_CACHE_VERSION });
    console.log('§GANTT_PREMATERIALIZE ' + (res.ok
      ? 'native schedule written BEFORE first injectGantt (zones=' + (res.zoneCount != null ? res.zoneCount : 'n/a') + ') — single-pass cold open'
      : 'failed reason=' + (res.reason || 'unknown') + ' — legacy auto-generate fallback will handle it'));
    return !!res.ok;
  }

  function generateGanttSchedule() {
    var _L = (typeof TMS._tmTrl === 'function') ? TMS._tmTrl : function (k, en, r) { var s = en; if (r) for (var q in r) s = s.replace('{' + q + '}', r[q]); return s; };   // S226 §R2b — sliced into vm sandboxes by witnesses
    if (_tmEditLocked('generateGanttSchedule')) return;
    var app = TMS.A();
    var SA = (typeof window !== 'undefined') && window.ScheduleAuthor;
    var tip = document.getElementById('tm-gantt-tip');
    function say(msg) {
      if (!tip) return;
      tip.textContent = msg; tip.style.display = 'block';
      setTimeout(function () { tip.style.display = 'none'; }, 3200);
    }
    if (!app || !app.db || !SA || !SA.materializeZones) {
      console.log('§GANTT_AUTHOR_ENTRY_FAIL reason=ScheduleAuthor_not_loaded');
      say(_L('tm_not_available', 'Not available')); return;
    }
    // Never clobber a REAL imported (Bonsai/Revit/IFC-native) schedule with a synthetic one — the
    // SAME guard schedule_author_ui.js's generateDraft() already applies before it materializes
    // anything. Previously this fell back to opening the old ScheduleAuthorUI side panel to edit a
    // captured schedule's structure — user ruling 2026-08-05 removed that too ("prefer to edit right
    // in the gantt chart itself"): a captured schedule is left exactly as imported (never
    // regenerated) and is edited through the SAME drawer lock/drag/link/props surface as any other
    // schedule, once its bars carry real task_ids via the normal cap/injectGantt load path.
    try {   // §TM_EDIT_EXCEPTION — schedule probe + materialize verb through the refresh
    var act = SA.activeSchedule ? SA.activeSchedule(app.db) : null;
    if (act && act.captured) {
      console.log('§GANTT_AUTHOR_ENTRY captured=' + act.id + ' — leaving it as imported, not regenerating');
      return;
    }
    // §TM_RULER_SHIFT (2026-08-05, user ruling): "defaulted to today if the JSON is silent" — the
    // native auto-generate path has no imported schedule to take a start date from, so it starts
    // TODAY (real wall-clock date), not a hardcoded placeholder. Once materialized the user can drag
    // the ruler to shift the whole project to a different start, same as any other edit.
    var todayStart = new Date().toISOString().slice(0, 10);
    var SR = window.SEQUENCE_RULES || {}, LR = window.LABOR_RATES || {}, RT = window.RATES || {};
    var _shiftHoursGantt = (window.SHIFT_HOURS > 0) ? window.SHIFT_HOURS : 24; // §GANTT_SHIFT_HOURS_DESYNC — match injectGantt's real clock
    var res = SA.materializeZones(app.db, SR, { start: todayStart, laborRates: LR, rates: RT, scheduleGate: window.ScheduleGate, shiftHours: _shiftHoursGantt, genVersion: TMS._GANTT_CACHE_VERSION, displayRemap: TMS._tmDisplayRemap, template: TMS._4dTemplate });   // §ZONE_DISPLAY_AUTHORING + §TPL_WIRED
    if (!res.ok) {
      console.log('§GANTT_AUTHOR_ENTRY_ZONE_FALLBACK reason=' + (res.reason || 'unknown'));
      res = SA.materializeDefault ? SA.materializeDefault(app.db, SR, { start: todayStart, laborRates: LR, blank: false, genVersion: TMS._GANTT_CACHE_VERSION }) : { ok: false };
    }
    if (!res.ok) {
      console.log('§GANTT_AUTHOR_ENTRY_FAIL reason=' + (res.reason || 'materialize_failed'));
      say(_L('tm_could_not_generate', 'Could not generate a schedule')); return;
    }
    console.log('§GANTT_AUTHOR_ENTRY native generate zones=' + (res.zoneCount != null ? res.zoneCount : 'n/a') +
      ' phases=' + (res.phases ? res.phases.length : 'n/a'));
    say(_L('tm_schedule_generated', 'Schedule generated — refreshing…'));
    // Reuse the SAME refresh path applyTo4D() already uses for this exact situation (a fresh/edited
    // schedule needs the drawer's overlay re-run) — real, already-working machinery, not a second
    // lighter-weight refresh path whose correctness would need its own separate proof.
    if (typeof window.tmRefoldSchedule === 'function') window.tmRefoldSchedule();
    else { TMS.invalidateGanttModel(); TMS.computeDays(); TMS.drawGanttMini(); TMS.renderAtTime(TMS._cursor); }
    } catch (e) { _tmEditExceptionRecover('generateGanttSchedule', e); }   // §TM_EDIT_EXCEPTION
  }

  function wireGanttDrag() {
    var _L = (typeof TMS._tmTrl === 'function') ? TMS._tmTrl : function (k, en, r) { var s = en; if (r) for (var q in r) s = s.replace('{' + q + '}', r[q]); return s; };   // S226 §R2b — sliced into vm sandboxes by witnesses
    var cv = document.getElementById('tm-gantt-canvas');
    if (!cv || cv._dragWired) return;
    cv._dragWired = true;
    cv.addEventListener('pointerdown', function (e) {
      if (!TMS._active || !TMS._ganttTasks.length) return;
      var hit = ganttHit(e);
      if (!hit) {
        // §GANTT_GROUP_MOVE — empty canvas starts a marquee-select (MS-Word-style: drag from empty
        // space, sweep into the bars you want). Same lock gate as everything else — selecting is
        // UI-only, but its only purpose here is to enable a group move, which IS an edit.
        if (!_ganttEditable) return;
        var mrect = e.target.getBoundingClientRect();
        _marquee = { x0: e.clientX - mrect.left, y0: e.clientY - mrect.top, x1: e.clientX - mrect.left, y1: e.clientY - mrect.top };
        try { cv.setPointerCapture(e.pointerId); } catch (err) {}
        return;
      }
      // §GANTT_DRAG_REJECT at the point of refusal. This used to be a bare `return`: a user dragging
      // a non-editable bar got NO feedback and NO log line, and the browser wiring test could not
      // tell "handler never fired" apart from "handler correctly refused". Silence is not a refusal.
      if (!hit.bar.taskId) {
        console.log('§GANTT_DRAG_REJECT reason=bar_has_no_task storey="' + hit.bar.storey +
          '" phase="' + hit.bar.phase + '"');
        var t0 = document.getElementById('tm-gantt-tip');
        if (t0) {
          t0.textContent = _L('tm_not_editable', 'Not editable — no schedule task on this bar');
          t0.style.display = 'block';
          setTimeout(function () { t0.style.display = 'none'; }, 2200);
        }
        return;
      }
      // §GANTT_EDIT_LOCK — drag/resize AND the drag-to-link path (endDrag never runs without a live
      // _drag) are both gated here, at the single point of entry. Seek/scrub/hover are untouched —
      // those are wired on tm-gantt-canvas's OWN pointerup/pointermove listeners registered earlier
      // in activate(), not in this function.
      if (!_ganttEditable) {
        console.log('§GANTT_DRAG_REJECT reason=locked');
        var t1 = document.getElementById('tm-gantt-tip');
        if (t1) {
          t1.textContent = _L('tm_locked_hint', 'Locked — click 🔒 Locked to enable editing');
          t1.style.display = 'block';
          setTimeout(function () { t1.style.display = 'none'; }, 2200);
        }
        return;
      }
      // §GANTT_GROUP_MOVE — dragging a bar that's part of the current multi-selection moves the
      // WHOLE group together. Dragging a bar OUTSIDE the current selection clears it first (same
      // convention as every other selection UI: clicking an unselected object deselects the group).
      if (_ganttSelected[hit.bar.taskId] && Object.keys(_ganttSelected).length > 1) {
        _groupDrag = { taskIds: Object.keys(_ganttSelected), x0: e.clientX, y0: e.clientY, dayPx: hit.dayPx, days: 0, moved: false };
        try { cv.setPointerCapture(e.pointerId); } catch (err) {}
        return;
      }
      if (Object.keys(_ganttSelected).length) { _ganttSelected = {}; TMS.drawGanttMini(); }
      _drag = { bar: hit.bar, mode: hit.mode, x0: e.clientX, y0: e.clientY, dayPx: hit.dayPx, days: 0, moved: false };
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    });
    cv.addEventListener('pointermove', function (e) {
      if (_marquee) {
        var mrect2 = e.target.getBoundingClientRect();
        _marquee.x1 = e.clientX - mrect2.left; _marquee.y1 = e.clientY - mrect2.top;
        var mel = document.getElementById('tm-gantt-marquee');
        if (mel) {
          var lo = Math.min(_marquee.x0, _marquee.x1), hi = Math.max(_marquee.x0, _marquee.x1);
          var top = Math.min(_marquee.y0, _marquee.y1), bot = Math.max(_marquee.y0, _marquee.y1);
          mel.style.left = lo + 'px'; mel.style.top = top + 'px';
          mel.style.width = (hi - lo) + 'px'; mel.style.height = (bot - top) + 'px';
          mel.style.display = 'block';
        }
        e.preventDefault();
        return;
      }
      if (_groupDrag) {
        var days2 = Math.round((e.clientX - _groupDrag.x0) / Math.max(0.001, _groupDrag.dayPx));
        if (days2 !== _groupDrag.days) { _groupDrag.days = days2; _groupDrag.moved = _groupDrag.moved || days2 !== 0; }
        var tip2 = document.getElementById('tm-gantt-tip');
        if (tip2 && _groupDrag.moved) {
          tip2.textContent = _L('tm_move_bars', 'Move {n} bars  {d}d', { n: _groupDrag.taskIds.length, d: (days2 >= 0 ? '+' : '') + days2 });
          tip2.style.left = Math.max(0, Math.min(e.offsetX + 8, e.target.clientWidth - 200)) + 'px';
          tip2.style.top = Math.max(2, e.offsetY - 22) + 'px';
          tip2.style.display = 'block';
        }
        e.preventDefault();
        return;
      }
      if (!_drag) { cv.style.cursor = (function () { var h = ganttHit(e); return h && h.bar.taskId ? (h.mode === 'move' ? 'grab' : 'ew-resize') : 'pointer'; })(); return; }
      var days = Math.round((e.clientX - _drag.x0) / Math.max(0.001, _drag.dayPx));
      if (days !== _drag.days) { _drag.days = days; _drag.moved = _drag.moved || days !== 0; }
      var tip = document.getElementById('tm-gantt-tip');
      if (tip && _drag.moved) {
        tip.textContent = (_drag.mode === 'move' ? _L('tm_drag_move', 'Move') : _L('tm_drag_resize', 'Resize')) + ' ' + _drag.bar.phase + ' — ' +
          _drag.bar.storey + '  ' + (days >= 0 ? '+' : '') + days + 'd';
        tip.style.left = Math.max(0, Math.min(e.offsetX + 8, e.target.clientWidth - 200)) + 'px';
        tip.style.top = Math.max(2, e.offsetY - 22) + 'px';
        tip.style.display = 'block';
      }
      e.preventDefault();
    });
    function endDrag(e) {
      if (_marquee) {
        var m = _marquee; _marquee = null;
        try { cv.releasePointerCapture(e.pointerId); } catch (err) {}
        var mel2 = document.getElementById('tm-gantt-marquee');
        if (mel2) mel2.style.display = 'none';
        // A near-zero marquee is a CLICK, not a drag — click-away-to-deselect, the same gesture
        // that starts a new marquee also dissolves the old selection (no separate "ungroup" verb).
        if (Math.abs(m.x1 - m.x0) + Math.abs(m.y1 - m.y0) < 4) {
          if (Object.keys(_ganttSelected).length) {
            _ganttSelected = {};
            console.log('§GANTT_GROUP_SELECT count=0 (cleared)');
            TMS.drawGanttMini();
          }
          return;
        }
        var hitBars = TMS.barsInRect(cv.clientWidth, m.x0, m.y0, m.x1, m.y1);
        _ganttSelected = {};
        hitBars.forEach(function (t) { _ganttSelected[t.taskId] = true; });
        console.log('§GANTT_GROUP_SELECT count=' + hitBars.length);
        TMS.drawGanttMini();
        return;
      }
      if (_groupDrag) {
        var gd = _groupDrag; _groupDrag = null;
        try { cv.releasePointerCapture(e.pointerId); } catch (err) {}
        var tip3 = document.getElementById('tm-gantt-tip');
        if (tip3) tip3.style.display = 'none';
        if (!gd.moved || !gd.days) return;   // a click, not a drag
        _dragConsumed = true;
        commitGanttGroupShift(gd.taskIds, gd.days);
        return;
      }
      if (!_drag) return;
      var d = _drag; _drag = null;
      try { cv.releasePointerCapture(e.pointerId); } catch (err) {}
      // §GANTT_LINK (E3): a drag that ENDS on a different bar, at least one row away, means "link
      // these two", not "move this one". Requiring a full row of vertical travel keeps incidental
      // drift during a horizontal move from silently creating a dependency.
      var drop = ganttHit(e);
      if (drop && drop.bar !== d.bar && drop.bar.taskId && d.bar.taskId &&
          Math.abs(e.clientY - d.y0) >= 14) {
        _dragConsumed = true;
        linkGanttBars(d.bar, drop.bar);
        return;
      }
      if (!d.moved || !d.days) return;          // a click, not a drag — let the seek handler have it
      _dragConsumed = true;
      commitGanttDrag(d.bar, d.mode, d.days);
    }
    cv.addEventListener('pointerup', endDrag);
    cv.addEventListener('pointercancel', endDrag);
    // §GANTT_PROPS (E7): double-click opens the keyed-entry panel. Drag is for speed, typing is for
    // accuracy — on a 400-day project one pixel is ~2 days, so drag alone can never be the precise path.
    cv.addEventListener('dblclick', function (e) {
      var hit = ganttHit(e);
      if (!hit || !hit.bar.taskId) return;
      if (!_ganttEditable) {  // §GANTT_EDIT_LOCK — same gate as drag, props panel also edits (typed retime + unlink)
        console.log('§GANTT_PROPS_REJECT reason=locked');
        // §TM_SILENT_REFUSAL — every OTHER lock refusal already says this. Inline tip-set (not
        // _tmSay) on purpose: wireGanttDrag's sibling refusals use this exact self-contained
        // pattern, and witness_gantt_edit_lock.js slices this function alone into its sandbox.
        var t2 = document.getElementById('tm-gantt-tip');
        if (t2) {
          t2.textContent = _L('tm_locked_hint', 'Locked — click 🔒 Locked to enable editing');
          t2.style.display = 'block';
          setTimeout(function () { t2.style.display = 'none'; }, 2200);
        }
        return;
      }
      _dragConsumed = true; openGanttProps(hit.bar);
    });
  }

  // §GANTT_LINK (E3) — create a real FS dependency, guarded by the EXISTING wouldCycle. A cyclic
  // schedule is invalid, so the guard refuses rather than "fixing" it silently.
  function linkGanttBars(predBar, succBar) {
    var _L = (typeof TMS._tmTrl === 'function') ? TMS._tmTrl : function (k, en, r) { var s = en; if (r) for (var q in r) s = s.replace('{' + q + '}', r[q]); return s; };   // S226 §R2b — sliced into vm sandboxes by witnesses
    if (_tmEditLocked('linkGanttBars')) return;   // §TM_BAKE_LOCK (§S69)
    var app = TMS.A(), SA = (typeof window !== 'undefined') && window.ScheduleAuthor;
    // §TM_SILENT_REFUSAL — this guard returns before the local say() below exists, so it uses the
    // module-scope _tmSay (the guard used to be the one refusal in this function with no tip).
    if (!app || !app.db || !SA || !SA.addDependency) { console.log('§GANTT_LINK_REJECT reason=ScheduleAuthor_not_loaded'); _tmSay(_L('tm_not_available', 'Not available')); return; }
    var tip = document.getElementById('tm-gantt-tip');
    function say(msg) { if (tip) { tip.textContent = msg; tip.style.display = 'block'; setTimeout(function () { tip.style.display = 'none'; }, 2600); } }
    try {   // §TM_EDIT_EXCEPTION — cycle probe + addDependency verb through the final repaint
    if (SA.wouldCycle && SA.wouldCycle(app.db, predBar.taskId, succBar.taskId)) {
      console.log('§GANTT_EDIT_CYCLE_BLOCKED pred=' + predBar.taskId + ' succ=' + succBar.taskId);
      say(_L('tm_refused_cycle', 'Refused — that link would create a cycle'));
      return;
    }
    var r = SA.addDependency(app.db, predBar.taskId, succBar.taskId, 'FS', 0);
    console.log('§GANTT_EDIT_LINK pred=' + predBar.taskId + ' succ=' + succBar.taskId +
      ' type=FS ok=' + JSON.stringify(r && (r.ok !== undefined ? r.ok : r)));
    say(_L('tm_linked', 'Linked: {pred}  →  {succ}', { pred: predBar.phase + ' — ' + predBar.storey, succ: succBar.phase + ' — ' + succBar.storey }));
    // The new edge may make the successor illegal where it currently sits. Re-apply it through the
    // SAME constraint-aware verb so the graph and the dates agree immediately, rather than leaving a
    // freshly-created violation on screen.
    var schedId = (TMS._taskIndex && TMS._taskIndex.scheduleId) || 'SCH_AUTHORED';
    if (SA.moveTaskCascade) {
      var tasksBeforeLink = {};
      try {
        var tbL = app.db.exec('SELECT task_id, schedule_start, schedule_finish, schedule_duration FROM tasks WHERE schedule_id=?', [schedId]);
        if (tbL.length) tbL[0].values.forEach(function (row) { tasksBeforeLink[row[0]] = { start: row[1], finish: row[2], duration: row[3] }; });
      } catch (e) {}
      // §S22_EPOCH_FIX: succBar.startTs is the TM's OWN internal clock (kernel_ops-derived day-offset
      // solve, not a real date) — new Date(succBar.startTs) misread it as if it already were one,
      // handing moveTaskCascade a bogus target (the same clock-mismatch class §S22 found in
      // retimeTaskElements, one call site over). Re-apply the successor at its OWN CURRENT real
      // position instead — tasks.schedule_start, just captured above — the correct "no-op except for
      // the new constraint" input the comment above already intends.
      var succReal = tasksBeforeLink[succBar.taskId];
      var targetDate = succReal ? succReal.start : new Date(succBar.startTs).toISOString().slice(0, 10);
      var res = SA.moveTaskCascade(app.db, schedId, succBar.taskId, targetDate, {});
      if (res && res.ok && res.moved && res.moved.length) {
        var byTask = {};
        for (var i = 0; i < TMS._ganttTasks.length; i++) if (TMS._ganttTasks[i].taskId) byTask[TMS._ganttTasks[i].taskId] = TMS._ganttTasks[i];
        retimeTaskElements(app.db, byTask, res.moved, tasksBeforeLink);
        _tmResyncAfterRetime();   // §GANTT_RETIME_RESYNC — without this the canvas plays the OLD times
      }
      // §FUTURE-5A item 6 (applied 2026-09-02, queue item B-3): the ONLY §GANTT_EDIT_CLAMP call
      // site in this file with NO on-screen feedback at all — commitGanttDrag/openGanttProps'
      // Apply already show `blockedBy`/`clampedTo` (the inline tm-gantt-tip pattern _tmSay itself
      // wraps), but this re-apply-after-link call to moveTaskCascade never checked res.clamped, so
      // a new link that ALSO clamps the successor left the user with only the earlier "Linked: ..."
      // message and no word that the date shown isn't where the link math alone would have put it.
      // res.blockedBy is the engine's own extracted binding predecessor (schedule_author.js
      // _bindingPred) — never invented here.
      if (res && res.clamped) {
        _tmSay(_L('tm_linked_clamped', 'Linked, but {task} clamped to {start} — blocked by {by}', { task: succBar.taskId, start: res.start, by: res.blockedBy }), 3400);
      }
    }
    // §GANTT_CPM_ANNOTATE (§S68) — OUTSIDE the moved-check on purpose: a new EDGE changes the graph,
    // so it changes float and criticality even when the clamp left every date exactly where it was.
    _tmAnnotateCpm(schedId);
    _tmPersistEdit('link');   // §S70 — the edit must survive a reload
    TMS.invalidateGanttModel(); TMS.computeDays(); TMS.drawGanttMini(); TMS.renderAtTime(TMS._cursor);
    } catch (e) { _tmEditExceptionRecover('linkGanttBars', e); }   // §TM_EDIT_EXCEPTION
  }

  // §GANTT_PROPS (E7) — typed editing + the dependency list (E4 unlink lives here rather than on a
  // 1px arrow hit-target: same verbs, same C1/C2 checks, just a precise input surface).
  function openGanttProps(bar) {
    var _L = (typeof TMS._tmTrl === 'function') ? TMS._tmTrl : function (k, en, r) { var s = en; if (r) for (var q in r) s = s.replace('{' + q + '}', r[q]); return s; };   // S226 §R2b — sliced into vm sandboxes by witnesses
    var app = TMS.A(), SA = (typeof window !== 'undefined') && window.ScheduleAuthor;
    if (!app || !app.db || !SA) return;
    var schedId = (TMS._taskIndex && TMS._taskIndex.scheduleId) || 'SCH_AUTHORED';
    var d = function (ms) { return new Date(ms).toISOString().slice(0, 10); };
    // §S22_EPOCH_FIX, E7 (bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §S72) — the REAL calendar
    // dates, read from `tasks`, never bar.startTs/bar.endTs.
    // bar.startTs is the TM's OWN internal playback clock (a kernel_ops-derived day-offset solve,
    // near-1970 by construction). §S22 fixed commitGanttDrag for exactly this and E7 was never
    // brought along: the panel showed "1970-01-01" for a task really starting 2026-09-07, and
    // Apply then wrote that 1970 date straight into tasks.schedule_start through moveTaskCascade.
    // MEASURED live before the fix (Duplex, real dblclick → real Apply):
    //   §GANTT_PROPS_OPEN task=TASK_Substructure_T_FDN → input value 1970-01-01
    //   §GANTT_EDIT_MOVE  task=TASK_Substructure_T_FDN start=1970-01-05 cascaded=0
    //   §GANTT_EDIT_PERSIST what=propsApply ok=true      ← and §S70 then cached the corruption
    var realS = null, realF = null;
    try {
      var rr = app.db.exec('SELECT schedule_start, schedule_finish FROM tasks WHERE task_id=?', [bar.taskId]);
      if (rr.length && rr[0].values.length) { realS = rr[0].values[0][0]; realF = rr[0].values[0][1]; }
    } catch (e) {}
    if (!realS || !realF) {
      // Honest refusal, same shape as commitGanttDrag's no_real_task_snapshot: a panel that cannot
      // read the task's real dates must not offer to edit them with made-up ones.
      console.log('§GANTT_PROPS_REJECT reason=no_real_task_dates task=' + bar.taskId);
      _tmSay(_L('tm_cannot_edit_no_dates', 'Cannot edit — no real dates found for this task'));   // §TM_SILENT_REFUSAL
      return;
    }
    var box = document.getElementById('tm-gantt-props') || (function () {
      var el = document.createElement('div');
      el.id = 'tm-gantt-props';
      el.style.cssText = 'position:absolute;right:8px;bottom:8px;z-index:20;background:rgba(20,20,40,0.97);' +
        'border:1px solid rgba(79,195,247,0.35);border-radius:8px;padding:8px 10px;font-size:11px;' +
        'color:#e0e0e0;min-width:250px;max-width:330px;max-height:60vh;overflow:auto';
      (document.getElementById('time-machine-panel') || document.body).appendChild(el);
      return el;
    })();
    var deps = (SA.listDependencies ? SA.listDependencies(app.db, schedId) : [])
      .filter(function (x) { return x.succId === bar.taskId || x.predId === bar.taskId; });
    var cpmInfo = bar.taskId ? _ganttCritical[bar.taskId] : null;   // §S68 — display only, never a date source
    var depHtml = deps.length ? deps.map(function (x, i) {
      var dir = x.succId === bar.taskId ? _L('tm_dep_after', '← after') : _L('tm_dep_before', '→ before');
      var other = x.succId === bar.taskId ? x.predName : x.succName;
      return '<div style="display:flex;justify-content:space-between;gap:6px;padding:1px 0">' +
        '<span>' + dir + ' <b>' + other + '</b> <span style="color:#8a97a5">' + x.type +
        (x.lag ? (x.lag > 0 ? '+' : '') + x.lag + 'd' : '') + '</span></span>' +
        '<button data-unlink="' + i + '" style="font-size:9px;padding:0 5px">' + _L('tm_unlink', 'unlink') + '</button></div>';
    }).join('') : '<div style="color:#8a97a5">' + _L('tm_no_dependencies', 'no dependencies') + '</div>';
    box.innerHTML =
      '<div style="font-weight:bold;margin-bottom:4px">' + (bar.taskName || (bar.phase + ' — ' + bar.storey)) + '</div>' +
      '<div style="color:#8a97a5;margin-bottom:6px">' + _L('tm_elements_count', '{n} elements · {task}', { n: bar.count, task: bar.taskId }) + '</div>' +
      // §GANTT_CPM_ANNOTATE (§S68) — read-only. Total float is the ONE number that tells you whether
      // a slip on this task moves the project end; the bar's red rail only says "zero float". Blank
      // when CPM could not run (cycle/thin table) rather than showing a made-up 0.
      (cpmInfo ? '<div style="margin-bottom:6px;color:' + (cpmInfo.critical ? '#e53935' : '#8a97a5') + '">' +
        (cpmInfo.critical ? _L('tm_critical_path', 'CRITICAL PATH · zero float') : _L('tm_total_float', 'Total float {n}d', { n: cpmInfo.totalFloat })) +
        ' <span style="font-size:9px;color:#8a97a5">' + _L('tm_cpm_dates_unchanged', '(CPM, dates unchanged)') + '</span></div>' : '') +
      '<div style="display:flex;gap:4px;align-items:center;margin-bottom:4px">' + _L('tm_start', 'Start') +
        '<input id="tmp-s" type="date" value="' + realS + '" style="flex:1;font-size:11px"></div>' +
      '<div style="display:flex;gap:4px;align-items:center;margin-bottom:6px">' + _L('tm_finish', 'Finish') +
        '<input id="tmp-f" type="date" value="' + realF + '" style="flex:1;font-size:11px"></div>' +
      '<div style="margin-bottom:4px;color:#8a97a5">' + _L('tm_dependencies', 'Dependencies') + '</div>' + depHtml +
      '<div style="display:flex;gap:6px;margin-top:8px">' +
        '<button id="tmp-apply" style="flex:1;font-size:11px">' + _L('tm_apply', 'Apply') + '</button>' +
        '<button id="tmp-close" style="font-size:11px">' + _L('ui_close', 'Close') + '</button></div>' +
      '<div id="tmp-msg" style="color:#ff8c00;margin-top:4px;min-height:12px"></div>';
    box.style.display = 'block';
    console.log('§GANTT_PROPS_OPEN task=' + bar.taskId + ' deps=' + deps.length + ' elements=' + bar.count);
    document.getElementById('tmp-close').onclick = function () { box.style.display = 'none'; };
    box.querySelectorAll('[data-unlink]').forEach(function (btn) {
      btn.onclick = function () {
        // §TM_BAKE_LOCK (§S69) — on the WRITE, not on opening the panel: reading a task's dates
        // mid-bake is harmless, and refusing that would be a worse product than the bug.
        if (_tmEditLocked('openGanttProps:unlink')) return;
        var x = deps[parseInt(btn.getAttribute('data-unlink'), 10)];
        if (!x || !SA.removeDependency) return;
        SA.removeDependency(app.db, x.predId, x.succId);
        console.log('§GANTT_EDIT_UNLINK pred=' + x.predId + ' succ=' + x.succId);
        _tmAnnotateCpm(schedId);   // §GANTT_CPM_ANNOTATE (§S68) — removing an edge changes float too
        _tmPersistEdit('unlink');   // §S70 — the edit must survive a reload
        TMS.invalidateGanttModel(); TMS.computeDays(); TMS.drawGanttMini(); openGanttProps(bar);
      };
    });
    document.getElementById('tmp-apply').onclick = function () {
      if (_tmEditLocked('openGanttProps:apply')) return;   // §TM_BAKE_LOCK (§S69) — same, on the write
      var s = document.getElementById('tmp-s').value, f = document.getElementById('tmp-f').value;
      var msg = document.getElementById('tmp-msg');
      // Typed dates go through the SAME constraint-aware verbs as a drag — keyin is a second input
      // surface onto one model, never a bypass around C1/C2.
      // §S22_EPOCH_FIX: same tasksBefore snapshot commitGanttDrag/shiftGanttSchedule/
      // commitGanttGroupShift already capture, needed here too so retimeTaskElements can convert
      // res.moved's real calendar dates back onto the TM's own clock instead of splicing them in raw.
      var tasksBeforeApply = {};
      try {
        var tbA = app.db.exec('SELECT task_id, schedule_start, schedule_finish, schedule_duration FROM tasks WHERE schedule_id=?', [schedId]);
        if (tbA.length) tbA[0].values.forEach(function (row) { tasksBeforeApply[row[0]] = { start: row[1], finish: row[2], duration: row[3] }; });
      } catch (e) {}
      // Compare against the REAL dates the panel was populated with (§S72) — comparing the typed
      // value against the TM-clock d(bar.startTs) made "start changed, finish didn't" always true,
      // so a pure finish edit was routed through moveTaskCascade as if it were a move.
      try {   // §TM_EDIT_EXCEPTION — typed-apply pipeline: engine verb through the final repaint
      var res = (s !== realS && f === realF && SA.moveTaskCascade)
        ? SA.moveTaskCascade(app.db, schedId, bar.taskId, s, {})
        : SA.resizeTask(app.db, schedId, bar.taskId, s, f, {});
      if (!res || !res.ok) { if (msg) msg.textContent = _L('tm_rejected', 'Rejected: {reason}', { reason: (res && res.reason) || _L('tm_unknown', 'unknown') }); return; }
      if (msg) msg.textContent = res.clamped ? _L('tm_clamped_by', 'Clamped to {start} by {by}', { start: res.start, by: res.blockedBy }) :
        _L('tm_applied_cascaded', 'Applied · {n} successor(s) cascaded', { n: res.cascaded });
      var byTask = {};
      for (var i = 0; i < TMS._ganttTasks.length; i++) if (TMS._ganttTasks[i].taskId) byTask[TMS._ganttTasks[i].taskId] = TMS._ganttTasks[i];
      retimeTaskElements(app.db, byTask, res.moved || [], tasksBeforeApply);
      _tmResyncAfterRetime();   // §GANTT_RETIME_RESYNC — without this the canvas plays the OLD times
      _tmAnnotateCpm(schedId);   // §GANTT_CPM_ANNOTATE (§S68) — re-derive float/critical FROM the new dates
      _tmPersistEdit('propsApply');   // §S70 — the edit must survive a reload
      console.log('§GANTT_PROPS_APPLY task=' + bar.taskId + ' start=' + res.start +
        ' clamped=' + res.clamped + ' cascaded=' + res.cascaded);
      TMS.invalidateGanttModel(); TMS.computeDays(); TMS.drawGanttMini(); TMS.renderAtTime(TMS._cursor);
      } catch (e) { _tmEditExceptionRecover('commitGanttProps', e); }   // §TM_EDIT_EXCEPTION — the typed-apply path (props panel Apply)
    };
  }

  // ── §TM_P6_FOLD — P6 / MS Project interop + Diff-vs-Model, folded IN from the retired Schedule
  // Editor tab (viewer/schedule_editor.html + schedule_editor_ui.js, DELETED 2026-08-24). The tab's
  // editing surface (WBS outline, dependency editor, drag-Gantt, ▶ CPM, zoom) was fully redundant:
  // the drawer edits directly (§GANTT_EDIT/§GANTT_PROPS) and CPM float/criticality is auto-derived
  // after every edit (§S68 _tmAnnotateCpm). What was NOT redundant — file interop (Import P6/MSPDI,
  // Export MSPDI/PMXML/XER, §X5/§X6/§X7) and the §4D_SCHEDULE_DIFF grader — lives here now,
  // operating on the TM's own already-open app.db instead of a second sql.js copy in another tab.
  // foreign_schedule.js + schedule_diff.js stay pure engines and are LAZY-LOADED on first open of
  // this section (promise-cached dynamic injection, the same pattern as main.js APP.loadNavigate /
  // APP.loadWizard) — the main viewer's eager script list does not grow.
  // Alt+C impact: NONE — cinema_maxq.js only calls window.tm* globals that read closure state
  // (_ops/_projectStart/_projectEnd); it never opens the TM panel or touches its DOM (see the
  // §TM/Alt+C separation contract near tmActivateForBake: "Alt+C owns the camera", never the DOM).
  function _tmLoadP6Modules() {
    if (window.ForeignSchedule && window.ScheduleDiff) return Promise.resolve();
    if (TMS._p6ModsPromise) return TMS._p6ModsPromise;
    TMS._p6ModsPromise = new Promise(function (resolve, reject) {
      var mods = ['foreign_schedule.js?v=1', 'schedule_diff.js?v=1'];
      function next(i) {
        if (i >= mods.length) { console.log('§TM_P6_LAZY_LOADED ' + mods.join(' + ')); resolve(); return; }
        var s = document.createElement('script');
        s.src = mods[i];
        s.onload = function () { next(i + 1); };
        s.onerror = function () { TMS._p6ModsPromise = null; reject(new Error('failed to load ' + mods[i])); };
        document.head.appendChild(s);
      }
      next(0);
    });
    return TMS._p6ModsPromise;
  }

  function toggleP6Drawer() {
    var _L = (typeof TMS._tmTrl === 'function') ? TMS._tmTrl : function (k, en, r) { var s = en; if (r) for (var q in r) s = s.replace('{' + q + '}', r[q]); return s; };   // S226 §R2b — sliced into vm sandboxes by witnesses
    TMS._p6Visible = !TMS._p6Visible;
    // Mobile: only one bottom drawer at a time (mirror the gantt/dash/var rule).
    if (TMS._p6Visible && window.innerWidth < 600 && TMS._ganttVisible) {
      TMS._ganttVisible = false;
      var gb = document.getElementById('tm-gantt-box'); if (gb) gb.classList.remove('open');
      var gbt = document.getElementById('tm-gantt'); if (gbt) gbt.classList.remove('tm-active');
    }
    var btn = document.getElementById('tm-editor');
    if (btn) btn.classList.toggle('tm-active', TMS._p6Visible);
    var box = document.getElementById('tm-p6-box');
    if (box) box.classList.toggle('open', TMS._p6Visible);
    if (TMS._p6Visible) {
      _tmLoadP6Modules().then(function () {
        console.log('§TM_P6_OPEN modules ready ForeignSchedule=' + !!window.ForeignSchedule +
          ' ScheduleDiff=' + !!window.ScheduleDiff);
      }).catch(function (e) {
        _tmP6Say(_L('tm_interop_load_failed', 'Interop modules failed to load: {err}', { err: e.message }));
      });
    }
  }

  function wireP6Controls() {
    var imp = document.getElementById('tm-p6-import'), impFile = document.getElementById('tm-p6-file');
    if (imp && impFile) {
      // 'click' (not pointerup) on purpose: opening a file dialog needs the user-activation a
      // click carries; the hidden input's programmatic .click() then inherits it.
      imp.addEventListener('click', function (e) { e.stopPropagation(); impFile.click(); });
      impFile.addEventListener('change', function () {
        if (impFile.files && impFile.files[0]) tmImportForeign(impFile.files[0]);
        impFile.value = '';
      });
    }
    var em = document.getElementById('tm-p6-export-msp');
    if (em) em.addEventListener('pointerup', function (e) { e.stopPropagation(); tmExportMSProject(); });
    var ep = document.getElementById('tm-p6-export-pmxml');
    if (ep) ep.addEventListener('pointerup', function (e) { e.stopPropagation(); tmExportPMXML(); });
    var ex = document.getElementById('tm-p6-export-xer');
    if (ex) ex.addEventListener('pointerup', function (e) { e.stopPropagation(); tmExportXER(); });
    var ed = document.getElementById('tm-p6-diff');
    if (ed) ed.addEventListener('pointerup', function (e) { e.stopPropagation(); tmDiffVsModel(); });
  }

  // Status routing: the section's own output line (persistent, multi-result) + the drawer tip
  // (transient, same say() every other TM action uses).
  function _tmP6Say(msg) {
    var out = document.getElementById('tm-p6-out');
    if (out) out.textContent = msg;
    _tmSay(msg);
  }

  // UTC day arithmetic — matches the engine's _addDays; ported verbatim from the Editor tab.
  function _p6DaysBetween(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }

  function _tmP6BaseName(app) {
    var u = String((app && (app._dbPersistUrl || app.DB_URL)) || 'schedule');
    return u.split('?')[0].split('/').pop().replace(/\.[a-z0-9]+$/i, '') || 'schedule';
  }

  function _tmP6Download(content, mime, filename) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  // Refresh the cached index first so an export right after an import targets the ADOPTED schedule,
  // not the last one the drawer indexed (buildTaskIndex re-probes activeSchedule; positive-cached).
  function _tmP6SchedId() {
    try { TMS.buildTaskIndex(); } catch (e) {}
    return (TMS._taskIndex && TMS._taskIndex.scheduleId) || 'SCH_AUTHORED';
  }

  // §X5 port — import a Primavera P6 (.xer / PMXML .xml) or MS Project (MSPDI) programme into the
  // TM's own db. Adopt via ForeignSchedule, then §TM-REFOLD: an import IS an external schedule
  // edit, so it takes the exact rebuild path main.js's bim_4d consumer already uses (stale gantt
  // cache + kernel_ops places invalidated, re-activate re-reads the adopted tasks). task_elements
  // stays empty unless auto-bind resolves tokens — binding is a separate, reviewable craft.
  function tmImportForeign(file) {
    var _L = (typeof TMS._tmTrl === 'function') ? TMS._tmTrl : function (k, en, r) { var s = en; if (r) for (var q in r) s = s.replace('{' + q + '}', r[q]); return s; };   // S226 §R2b — sliced into vm sandboxes by witnesses
    if (_tmEditLocked('tmImportForeign')) { _tmP6Say(_L('tm_recording_import_refused', 'Recording in progress — import refused')); return; }   // §TM_BAKE_LOCK (§S69)
    var app = TMS.A();
    var FSx = (typeof window !== 'undefined') && window.ForeignSchedule;
    if (!FSx) { _tmP6Say(_L('tm_interop_not_loaded', 'Interop module not loaded — reopen the P6/MSP section')); return; }
    if (!app || !app.db) { _tmP6Say(_L('tm_no_model_open', 'No model open yet')); return; }
    var rdr = new FileReader();
    rdr.onload = function () {
      try {
        var txt = String(rdr.result);
        var det = FSx.parseForeign(txt, file.name);   // sniff P6-XER / P6-XML(PMXML) / MS Project(MSPDI)
        var data = FSx.toScheduleData(det.parsed);
        FSx.adoptIntoDb(app.db, data);
        var schedId = data.schedules[0].id;
        // §B3 — auto-bind by convention (opt-in, reviewable): resolve any @disc:class tokens the
        // file carried and report the pre-bound counts — a deterministic SUGGESTION, never silent.
        var tokened = data.tasks.filter(function (t) { return t.bindSelector; }).length;
        var ab = document.getElementById('tm-p6-autobind'); var bindMsg = '';
        if (tokened && (!ab || ab.checked) && FSx.autoBind) {
          var r = FSx.autoBind(app.db, schedId);
          bindMsg = ' ' + _L('tm_prebound', 'Pre-bound {n} elements across {a} activities by convention', { n: r.bound, a: r.perActivity.length }) +
            (r.unresolved.length ? ' ' + _L('tm_unresolved_selectors', '({n} selector(s) matched nothing — review)', { n: r.unresolved.length }) : '') + '.';
          console.log('§TM_AUTOBIND schedule=' + schedId + ' bound=' + r.bound +
            ' activities=' + r.perActivity.length + ' unresolved=' + r.unresolved.length);
        } else if (tokened) {
          bindMsg = ' ' + _L('tm_bind_hint', '({n} activities carry a bind token — tick auto-bind to resolve.)', { n: tokened });
        }
        TMS.invalidateGanttModel();
        _tmAnnotateCpm(schedId);        // §S68 — the Editor tab's ▶ CPM, automatic here
        _tmPersistEdit('import_p6');    // §S70 — an imported programme is a real edit, save it
        TMS.refoldSchedule();               // §TM-REFOLD — rebuild the 4D from the LIVE tasks table
        _tmP6Say(_L('tm_imported', 'Imported {format} "{file}" — {wbs} WBS / {acts} activities / {links} links.', { format: det.format, file: file.name, wbs: data._meta.summaryCount, acts: data._meta.leafCount, links: data.taskSequences.length }) + bindMsg);
        console.log('§TM_IMPORT_P6 file=' + file.name + ' format=' + det.format +
          ' schedule=' + schedId + ' wbs=' + data._meta.summaryCount +
          ' activities=' + data._meta.leafCount + ' tokened=' + tokened);
      } catch (e) { _tmP6Say(_L('tm_import_failed', 'Import failed: {err}', { err: e.message })); console.error('§TM_IMPORT_P6 ERROR', e); }
    };
    rdr.readAsText(file);
  }

  // §X6 port — export to MS Project XML (MSPDI). Schema/units verified AGAINST foreign_schedule.js
  // parseMSPDI (not invented): OutlineLevel-encoded hierarchy, Duration='PT{hours}H0M0S', LinkLag in
  // TENTHS OF A MINUTE, PredecessorLink/Type 0=FF/1=FS/2=SF/3=SS, 8h/day calendar (MinutesPerDay=480).
  function tmExportMSProject() {
    var _L = (typeof TMS._tmTrl === 'function') ? TMS._tmTrl : function (k, en, r) { var s = en; if (r) for (var q in r) s = s.replace('{' + q + '}', r[q]); return s; };   // S226 §R2b — sliced into vm sandboxes by witnesses
    var app = TMS.A(), SA = (typeof window !== 'undefined') && window.ScheduleAuthor;
    if (!app || !app.db || !SA || !SA.wbsTree) { _tmP6Say(_L('tm_no_schedule_export', 'No schedule to export')); return; }
    var schedId = _tmP6SchedId();
    var tree = SA.wbsTree(app.db, schedId);
    if (!tree.length) { _tmP6Say(_L('tm_no_tasks_export', 'No tasks to export')); return; }
    var deps = SA.listDependencies ? SA.listDependencies(app.db, schedId) : [];
    var predByTask = {};
    deps.forEach(function (d) { (predByTask[d.succId] = predByTask[d.succId] || []).push(d); });

    var HPD = 8, MPD = HPD * 60;
    var TYPE_CODE = { FS: 1, SS: 3, FF: 0, SF: 2 };
    // split/join for the quote (not a /"/g regex literal): witness_tm_silent_refusal_tips.js's
    // brace scanner deliberately aborts on any regex literal containing a quote or brace.
    function xmlEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').split('"').join('&quot;'); }
    function durTag(start, finish) {
      if (!start || !finish) return 'PT0H0M0S';
      var days = Math.max(1, _p6DaysBetween(start, finish));
      return 'PT' + (days * HPD) + 'H0M0S';
    }

    var uid = {}, seq = 1, rows = [];
    (function walk(nodes, level) {
      nodes.forEach(function (n) {
        uid[n.id] = seq++;
        rows.push({ n: n, level: level });
        if (n.children && n.children.length) walk(n.children, level + 1);
      });
    })(tree, 1);

    var name = _tmP6BaseName(app);
    var xml = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<Project xmlns="http://schemas.microsoft.com/project">',
      '<Name>' + xmlEsc(name) + '</Name>',
      '<MinutesPerDay>' + MPD + '</MinutesPerDay>',
      '<Tasks>'];
    rows.forEach(function (r) {
      var n = r.n, u = uid[n.id];
      var links = predByTask[n.id] || [];
      xml.push('<Task>' +
        '<UID>' + u + '</UID><ID>' + u + '</ID>' +
        '<Name>' + xmlEsc(n.name) + '</Name>' +
        '<OutlineLevel>' + r.level + '</OutlineLevel>' +
        '<Summary>' + (n.isSummary ? 1 : 0) + '</Summary>' +
        (n.start ? '<Start>' + n.start + 'T08:00:00</Start>' : '') +
        (n.finish ? '<Finish>' + n.finish + 'T17:00:00</Finish>' : '') +
        '<Duration>' + durTag(n.start, n.finish) + '</Duration>' +
        (n.critical ? '<Critical>1</Critical>' : '') +
        links.map(function (l) {
          var lagTenths = Math.round((l.lag || 0) * HPD * 60 * 10);
          return '<PredecessorLink><PredecessorUID>' + uid[l.predId] + '</PredecessorUID>' +
            '<Type>' + (TYPE_CODE[l.type] != null ? TYPE_CODE[l.type] : 1) + '</Type>' +
            '<LinkLag>' + lagTenths + '</LinkLag></PredecessorLink>';
        }).join('') +
        '</Task>');
    });
    xml.push('</Tasks></Project>');

    var fname = name + '_schedule.xml';
    _tmP6Download(xml.join(''), 'application/xml', fname);
    _tmP6Say(_L('tm_exported_msp', 'Exported {n} tasks / {m} links to MS Project XML ({file}).', { n: rows.length, m: deps.length, file: fname }));
    console.log('§TM_EXPORT_MSP tasks=' + rows.length + ' links=' + deps.length + ' file=' + fname);
  }

  // §X7 port — Primavera PMXML / XER writers. SAME (tree, deps) input tmExportMSProject reads —
  // ForeignSchedule.toPMXML/toXER are pure serializers (W-XER-ROUNDTRIP/W-PMXML-ROUNDTRIP prove
  // mismatch=0 re-parsing the writer's own output with our reader).
  function _tmExportP6(kind, writeFn, ext, mime, label) {
    var _L = (typeof TMS._tmTrl === 'function') ? TMS._tmTrl : function (k, en, r) { var s = en; if (r) for (var q in r) s = s.replace('{' + q + '}', r[q]); return s; };   // S226 §R2b — sliced into vm sandboxes by witnesses
    var app = TMS.A(), SA = (typeof window !== 'undefined') && window.ScheduleAuthor;
    if (!app || !app.db || !SA || !SA.wbsTree) { _tmP6Say(_L('tm_no_schedule_export', 'No schedule to export')); return; }
    var FSx = (typeof window !== 'undefined') && window.ForeignSchedule;
    if (!FSx || !FSx[writeFn]) { _tmP6Say(_L('tm_interop_not_loaded', 'Interop module not loaded — reopen the P6/MSP section')); return; }
    var schedId = _tmP6SchedId();
    var tree = SA.wbsTree(app.db, schedId);
    if (!tree.length) { _tmP6Say(_L('tm_no_tasks_export', 'No tasks to export')); return; }
    var deps = SA.listDependencies ? SA.listDependencies(app.db, schedId) : [];
    var name = _tmP6BaseName(app);
    var out = FSx[writeFn](tree, deps, { hpd: 8, projectId: schedId, projectName: name });

    var fname = name + '_schedule.' + ext;
    _tmP6Download(out, mime, fname);
    var leafCount = 0; (function walk(ns) { (ns || []).forEach(function (n) { if (!n.isSummary) leafCount++; walk(n.children); }); })(tree);
    _tmP6Say(_L('tm_exported_p6', 'Exported {n} tasks / {m} links to {label} ({file}). Some fields (WBS code, EPS-level activity codes, resource assignments, global calendars, baselines) are not carried — P6 itself drops most of these on cross-DB import.', { n: leafCount, m: deps.length, label: label, file: fname }));
    console.log('§TM_EXPORT_' + kind + ' tasks=' + leafCount + ' links=' + deps.length + ' file=' + fname);
  }
  function tmExportPMXML() { _tmExportP6('PMXML', 'toPMXML', 'xml', 'application/xml', 'Primavera PMXML'); }
  function tmExportXER() { _tmExportP6('XER', 'toXER', 'xer', 'text/plain', 'Primavera XER'); }

  // §4D_SCHEDULE_DIFF port — grade an IMPORTED P6/MSP schedule's per-phase durations against OUR
  // own real-quantity + labor-rate estimate for THIS building. Only meaningful on a captured
  // (imported) schedule — diffing our own generated estimate against itself is a no-op. The
  // estimate is written to the throwaway SCH_DIFF_SHADOW schedule (non-destructive,
  // rebuild-on-every-call — schedule_diff.js's own convention).
  function tmDiffVsModel() {
    var _L = (typeof TMS._tmTrl === 'function') ? TMS._tmTrl : function (k, en, r) { var s = en; if (r) for (var q in r) s = s.replace('{' + q + '}', r[q]); return s; };   // S226 §R2b — sliced into vm sandboxes by witnesses
    var app = TMS.A(), SA = (typeof window !== 'undefined') && window.ScheduleAuthor;
    var DFx = (typeof window !== 'undefined') && window.ScheduleDiff;
    if (!DFx) { _tmP6Say(_L('tm_interop_not_loaded', 'Interop module not loaded — reopen the P6/MSP section')); return; }
    if (!app || !app.db || !SA || !SA.activeSchedule) { _tmP6Say(_L('tm_no_schedule_loaded', 'No schedule loaded')); return; }
    var act = SA.activeSchedule(app.db);
    if (!act || !act.captured) {
      _tmP6Say(_L('tm_diff_needs_import', 'Diff vs Model compares an IMPORTED P6/MSP schedule against our real-quantity estimate — import one first.'));
      return;
    }
    _tmP6Say(_L('tm_diff_computing', 'Computing schedule diff…'));
    setTimeout(function () {
      var res = DFx.computeScheduleDiff(app.db, null, { importedScheduleId: act.id, start: '2026-01-01' });
      if (res.error) { _tmP6Say(_L('tm_diff_failed', 'Diff failed: {err}', { err: res.error })); return; }
      var lines = res.phases.map(function (r) {
        var icon = r.flag === 'optimistic' ? '⚡' : r.flag === 'slow' ? '🐢' : '✓';
        return icon + ' ' + r.phase + ': ' + _L('tm_diff_theirs_ours', 'theirs {a}d vs ours {b}d', { a: r.theirDays, b: r.ourDays }) + ' (' +
          (r.deltaPct > 0 ? '+' : '') + r.deltaPct + '%) — ' + r.flagMsg;
      });
      if (res.unmatchedActivities.length) lines.push(_L('tm_diff_unmatched', '{n} activity(ies) unmatched — see console §4D_DIFF_UNMATCHED', { n: res.unmatchedActivities.length }));
      var out = document.getElementById('tm-p6-out');
      if (out) out.textContent = lines.join('   ');
      _tmSay(_L('tm_diff_summary', '4D Schedule Diff: {a}/{b} phases compared, {c}/{d} activities matched.', { a: res.summary.matchedPhases, b: res.summary.ourPhases, c: res.summary.matchedActivities, d: res.summary.theirActivities }));
      console.log('§TM_DIFF schedule=' + act.id + ' matchedPhases=' + res.summary.matchedPhases +
        ' matchedActivities=' + res.summary.matchedActivities + ' unmatched=' + res.summary.unmatchedActivities);
    }, 30);
  }
};
