// schedule_author_ui.js — §AUTHOR-1 slice-2 — the 4D-schedule authoring WIZARD (front-visual).
// TM-OWNED: launched from the Time Machine surface (the clock pill). Wraps the pure engine in
// viewer/schedule_author.js (window.ScheduleAuthor) with a glass panel matching the TM idiom.
//
// Implementing FUSED_4D5D_WEDGE_LANE.md §AUTHOR-1 (Front-visual wizard) — the user builds the 4D
// schedule UP, organized as phases (WBS), assigns elements, and tunes dates — every write lands in
// the IFC-native schedules/tasks/task_elements tables (the same substrate injectGantt's _cap reads).
// Steps: ① Generate first draft → ② Assign elements (3D highlight + reassign) → ③ Dates.
(function (global) {
  'use strict';

  function A() { return global.APP || global.A; }
  function db() { var a = A(); return a && a.db; }
  function rules() { return global.SEQUENCE_RULES || {}; }
  var SA = function () { return global.ScheduleAuthor; };

  var _panel = null, _built = false;
  var _state = null;   // { schedId, start, order:[taskId], name:{}, dur:{}, count:{} }

  // ── date helper (UTC, deterministic) ──────────────────────────────────────────
  function addDays(baseStr, n) {
    var b = Date.parse(baseStr + 'T00:00:00Z');
    return new Date(b + n * 86400000).toISOString().slice(0, 10);
  }

  function fmt(n) { return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  // step ④ 5D — fold the cost breakdown from the authored assignments (engine: ScheduleAuthor.foldCost).
  function costFold() {
    var d = db(); if (!d || !_state || !SA() || !SA().foldCost) return null;
    try {
      return SA().foldCost(d, _state.schedId, global.RATES || {}, global.RATES_DEFAULT, global.RATE_CURRENCY || '');
    } catch (e) { console.log('§AUTHOR_UI_COST_ERR ' + (e && e.message)); return null; }
  }

  function _injectStyle() {
    if (document.getElementById('sa-style')) return;
    var s = document.createElement('style');
    s.id = 'sa-style';
    s.textContent =
      '#schedule-author-panel{position:fixed;bottom:80px;right:16px;z-index:260;width:320px;max-height:72vh;' +
      'display:none;flex-direction:column;gap:6px;padding:12px;color:#e0e0e0;font-family:sans-serif;' +
      'background:rgba(20,20,40,0.9);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);' +
      'border:1px solid rgba(79,195,247,0.35);border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.5);' +
      'overflow-y:auto;user-select:none}' +
      '#schedule-author-panel button{background:rgba(255,255,255,0.1);color:#e0e0e0;border:1px solid rgba(79,195,247,0.3);' +
      'border-radius:5px;padding:5px 8px;cursor:pointer;font-size:11px}' +
      '#schedule-author-panel button:hover{background:rgba(79,195,247,0.2)}' +
      '#schedule-author-panel button.sa-primary{background:#1a6b8a;color:#fff;font-weight:bold}' +
      '#schedule-author-panel input,#schedule-author-panel select{background:rgba(255,255,255,0.08);color:#e0e0e0;' +
      'border:1px solid rgba(79,195,247,0.25);border-radius:4px;padding:3px 5px;font-size:11px}' +
      '.sa-phase{border:1px solid rgba(79,195,247,0.18);border-radius:7px;padding:6px;margin-bottom:6px}' +
      '.sa-phase-hd{display:flex;align-items:center;gap:5px}' +
      '.sa-dot{width:10px;height:10px;border-radius:50%;flex:0 0 auto}' +
      '.sa-name{flex:1;min-width:0}' +
      '.sa-meta{font-size:10px;color:#9bb;margin:4px 0 2px}' +
      '.sa-elist{max-height:120px;overflow-y:auto;margin-top:4px}' +
      '.sa-el{display:flex;align-items:center;gap:4px;padding:2px 0;font-size:10px;border-top:1px solid rgba(255,255,255,0.05)}' +
      '.sa-el .sa-elname{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;color:#cfe}' +
      '.sa-el select{font-size:9px;padding:1px 2px}' +
      '.sa-cost{font-size:10px;color:#7fdc9b;margin-left:6px}' +
      '.sa-total{margin-top:6px;padding-top:6px;border-top:1px solid rgba(79,195,247,0.25);font-size:12px;color:#cfe;text-align:right}';
    document.head.appendChild(s);
  }

  // Deterministic phase colour (stable hue per phase name) — visual organiser only.
  function phaseColor(name) {
    var h = 0; for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
    return 'hsl(' + h + ',70%,55%)';
  }

  function status(msg) {
    var el = document.getElementById('sa-status'); if (el) el.textContent = msg;
    console.log('§AUTHOR_UI_STATUS ' + msg);
  }

  // Read the authored schedule back from the DB into _state (single source of truth = the tables).
  function refreshState() {
    var d = db(); if (!d || !_state) return;
    // Order dated phases by date, undated (blank) phases by insert order (rowid) — NULL dates can't sort.
    var r = d.exec("SELECT task_id, name, schedule_start, schedule_finish FROM tasks " +
      "WHERE schedule_id='" + _state.schedId + "' AND is_summary=0 " +
      "ORDER BY COALESCE(schedule_start,'9999-99-99'), rowid");
    _state.order = []; _state.name = {}; _state.start = null; _state.undated = 0; _state.dated = {};
    if (r.length && r[0].values.length) {
      r[0].values.forEach(function (row) {
        _state.order.push(row[0]); _state.name[row[0]] = row[1];
        if (row[2] && row[3]) {   // dated phase
          _state.dated[row[0]] = true;
          if (!_state.dur[row[0]]) _state.dur[row[0]] = Math.max(1,
            Math.round((Date.parse(row[3]) - Date.parse(row[2])) / 86400000));
          if (!_state.start) _state.start = String(row[2]).slice(0, 10);
        } else { _state.dated[row[0]] = false; _state.undated++; }   // blank → user originates dates
      });
    }
    // element counts per task
    _state.count = {};
    var cr = d.exec("SELECT te.task_id, COUNT(*) FROM task_elements te JOIN tasks t ON t.task_id=te.task_id " +
      "WHERE t.schedule_id='" + _state.schedId + "' GROUP BY te.task_id");
    if (cr.length) cr[0].values.forEach(function (row) { _state.count[row[0]] = row[1]; });
  }

  // ── Authoring writes (each = an in-place edit of the IFC-native tables) ────────
  function applyDates() {
    var d = db(); if (!d || !_state) return;
    var cursor = 0, start = _state.start || '2026-01-01';
    _state.order.forEach(function (tid) {
      var dur = _state.dur[tid] || 30;
      var s = addDays(start, cursor), f = addDays(start, cursor + dur);
      d.run("UPDATE tasks SET schedule_start=?, schedule_finish=?, schedule_duration=? WHERE task_id=?",
        [s, f, 'P' + dur + 'D', tid]);
      cursor += dur;
    });
    // root span
    d.run("UPDATE tasks SET schedule_start=?, schedule_finish=? WHERE schedule_id=? AND is_summary=1",
      [start, addDays(start, cursor), _state.schedId]);
    console.log('§AUTHOR_UI_DATES start=' + start + ' span=' + cursor + 'd phases=' + _state.order.length);
  }

  function renamePhase(tid, name) {
    var d = db(); if (!d) return;
    d.run("UPDATE tasks SET name=? WHERE task_id=?", [name, tid]);
    _state.name[tid] = name;
    console.log('§AUTHOR_UI_RENAME ' + tid + ' -> "' + name + '"');
  }

  function reassign(guid, taskId) {
    var d = db(); if (!d || !SA()) return;
    SA().assignElement(d, guid, taskId);   // the CRAFT verb (engine-proven, W-AUTHOR-4D-BLANK)
    refreshState(); render();
  }

  function highlight(guid) {
    var a = A(); if (a && a.focusElement) { a.focusElement([guid], { item: true, frame: false }); }
    console.log('§AUTHOR_UI_FOCUS ' + guid);
  }

  // ── First draft: materialize the smart default from rules (the prebaked start) ──
  // §MI-FLOW: a "Start blank" toggle organizes phases+assignments but leaves them UNDATED, so the
  // user originates the schedule (the auto-dates become an optional "suggest a start" — scheduleNow).
  function generateDraft() {
    var d = db(); if (!d) { status('No model loaded'); return; }
    if (!SA()) { status('Author engine not loaded'); return; }
    var blankEl = document.getElementById('sa-blank');
    var blank = !!(blankEl && blankEl.checked);
    var res = SA().materializeDefault(d, rules(), { start: '2026-01-01', phaseDays: 30, blank: blank });
    _state = { schedId: res.scheduleId, start: '2026-01-01', order: [], name: {}, dur: {}, count: {} };
    refreshState();
    console.log('§AUTHOR_UI_DRAFT mode=' + (blank ? 'blank' : 'dated') + ' phases=' + res.phases.length + ' assignments=' + res.assignmentCount);
    status(blank
      ? 'Blank: ' + res.phases.length + ' phases organized, ' + res.assignmentCount + ' elements assigned — now set the dates'
      : 'Draft: ' + res.phases.length + ' phases, ' + res.assignmentCount + ' elements assigned');
    render();
  }

  // The user's deliberate "originate the dates" act (blank mode) — lay phases out from the start date.
  function scheduleNow() {
    var d = db(); if (!d || !SA() || !_state) return;
    SA().scheduleContiguous(d, _state.schedId, { start: _state.start || '2026-01-01', phaseDays: 30 });
    refreshState(); render();
    status('Scheduled — phases now carry dates and appear in the timeline.');
  }

  // ── Apply to 4D: re-fold the Time Machine so the gantt shows the authored schedule ──
  function applyTo4D() {
    applyDates();
    status('Applied. ' + (A() && A()._tmOn ? 're-folding Time Machine…' : 'open Time Machine to view'));
    console.log('§AUTHOR_UI_APPLY tmOn=' + !!(A() && A()._tmOn));
    if (A() && A()._tmOn && typeof global.toggleTimeMachine === 'function') {
      // toggle off→on re-runs injectGantt → _cap overlays the authored windows (W-AUTHOR-4D-BLANK)
      global.toggleTimeMachine();
      setTimeout(function () { global.toggleTimeMachine(); }, 60);
    }
  }

  function render() {
    var body = document.getElementById('sa-body'); if (!body) return;
    if (!_state || !_state.order.length) {
      body.innerHTML = '<div style="font-size:11px;color:#9bb;line-height:1.5">No schedule yet. ' +
        'Click <b>Generate first draft</b> to fold the model into organized phases — then rename, ' +
        'reassign elements, and tune dates. Each edit is written to the project.</div>';
      return;
    }
    var d = db();
    // phase-task option list (for reassign dropdowns)
    var opts = _state.order.map(function (tid) {
      return '<option value="' + tid + '">' + (_state.name[tid] || tid) + '</option>';
    }).join('');

    // ── step ④ 5D: fold the cost breakdown from the assigned elements (NON-INVENT) ──
    var cost = costFold();
    var costByTask = {}; var total = 0; var cur = '';
    if (cost) { cur = cost.currency || ''; total = cost.total;
      cost.phases.forEach(function (p) { costByTask[p.taskId] = p.cost; }); }

    var blankMode = _state.undated > 0;
    var html = '<div style="display:flex;gap:5px;align-items:center;margin-bottom:6px">' +
      '<label style="font-size:10px;color:#9bb">Start</label>' +
      '<input id="sa-start" type="date" value="' + (_state.start || '2026-01-01') + '" style="flex:1">' +
      (blankMode ? '<button id="sa-schedule" class="sa-primary" title="Lay the phases out from the start date — the schedule appears in the timeline">Schedule now &#9654;</button>' : '') +
      '</div>' +
      (blankMode ? '<div style="font-size:10px;color:#e0b070;margin-bottom:4px">' + _state.undated +
        ' phase(s) unscheduled — organized but undated. Set a start and press <b>Schedule now</b> to originate the dates.</div>' : '');

    _state.order.forEach(function (tid) {
      var nm = _state.name[tid] || tid, cnt = _state.count[tid] || 0;
      var cst = costByTask[tid] || 0;
      var dated = _state.dated ? _state.dated[tid] !== false : true;
      var durHtml = dated
        ? '<button class="sa-dur" data-tid="' + tid + '" data-d="-5">&#8211;5d</button> <b>' +
          (_state.dur[tid] || 30) + 'd</b> <button class="sa-dur" data-tid="' + tid + '" data-d="5">+5d</button> '
        : '<span style="color:#e0b070">unscheduled</span> ';
      html += '<div class="sa-phase" data-tid="' + tid + '">' +
        '<div class="sa-phase-hd">' +
          '<span class="sa-dot" style="background:' + phaseColor(nm) + '"></span>' +
          '<input class="sa-name" value="' + nm.replace(/"/g, '&quot;') + '" data-tid="' + tid + '">' +
          '<span style="font-size:10px;color:#9bb">' + cnt + ' el</span>' +
        '</div>' +
        '<div class="sa-meta">' +
          durHtml +
          '<span class="sa-cost" title="5D cost folded from assigned elements">' + cur + fmt(cst) + '</span>' +
          '<button class="sa-toggle" data-tid="' + tid + '" style="float:right;font-size:9px">elements &#9662;</button>' +
        '</div>' +
        '<div class="sa-elist" data-tid="' + tid + '" style="display:none"></div>' +
      '</div>';
    });
    html += '<div class="sa-total">5D total <b>' + cur + fmt(total) + '</b>' +
      (cost && cost.unmappedClasses.length ? ' <span title="classes using the default rate">(' +
        cost.unmappedClasses.length + ' unmapped)</span>' : '') + '</div>';
    body.innerHTML = html;

    // wire start date — in blank mode just remember it (the "Schedule now" button originates dates);
    // in dated mode, changing the start re-lays the existing schedule.
    var st = document.getElementById('sa-start');
    if (st) st.onchange = function () { _state.start = st.value; if (!blankMode) { applyDates(); render(); } };
    // wire "Schedule now" (blank mode → originate the dates)
    var sched = document.getElementById('sa-schedule');
    if (sched) sched.onclick = scheduleNow;

    // wire rename
    body.querySelectorAll('input.sa-name').forEach(function (inp) {
      inp.onchange = function () { renamePhase(inp.dataset.tid, inp.value.trim() || inp.dataset.tid); };
    });
    // wire duration steppers
    body.querySelectorAll('button.sa-dur').forEach(function (b) {
      b.onclick = function () {
        var tid = b.dataset.tid, delta = parseInt(b.dataset.d, 10);
        _state.dur[tid] = Math.max(1, (_state.dur[tid] || 30) + delta);
        applyDates(); render();
      };
    });
    // wire element-list expanders
    body.querySelectorAll('button.sa-toggle').forEach(function (b) {
      b.onclick = function () {
        var tid = b.dataset.tid;
        var box = body.querySelector('.sa-elist[data-tid="' + tid + '"]');
        if (!box) return;
        if (box.style.display === 'none') { _fillElements(box, tid, opts); box.style.display = 'block'; }
        else box.style.display = 'none';
      };
    });
  }

  function _fillElements(box, tid, opts) {
    var d = db(); if (!d) return;
    var r = d.exec("SELECT te.guid, m.ifc_class, COALESCE(m.element_name,'') FROM task_elements te " +
      "JOIN elements_meta m ON m.guid=te.guid WHERE te.task_id='" + tid + "' ORDER BY m.ifc_class LIMIT 200");
    var rows = (r.length && r[0].values) ? r[0].values : [];
    box.innerHTML = rows.map(function (row) {
      var g = row[0], cls = row[1], nm = row[2] || cls;
      return '<div class="sa-el">' +
        '<span class="sa-elname" data-g="' + g + '" title="' + g + '">' + (nm || cls) + '</span>' +
        '<select class="sa-move" data-g="' + g + '">' +
          '<option value="">move&#8230;</option>' + opts +
        '</select></div>';
    }).join('') || '<div style="font-size:10px;color:#9bb">no elements</div>';
    box.querySelectorAll('.sa-elname').forEach(function (el) {
      el.onclick = function () { highlight(el.dataset.g); };
    });
    box.querySelectorAll('select.sa-move').forEach(function (sel) {
      sel.onchange = function () { if (sel.value) reassign(sel.dataset.g, sel.value); };
    });
  }

  function build() {
    _injectStyle();
    _panel = document.createElement('div');
    _panel.id = 'schedule-author-panel';
    _panel.innerHTML =
      '<div style="display:flex;align-items:center;gap:6px">' +
        '<b style="flex:1;color:#4fc3f7;font-size:13px">&#9998; Author 4D Schedule</b>' +
        '<button id="sa-close" style="width:22px;height:22px;padding:0">&#x2715;</button>' +
      '</div>' +
      '<div id="sa-status" style="font-size:10px;color:#9bb;min-height:13px">Build the schedule up from the model.</div>' +
      '<div style="display:flex;gap:5px">' +
        '<button id="sa-draft" class="sa-primary" style="flex:1">Generate first draft</button>' +
        '<button id="sa-apply" style="flex:1">Apply to 4D &#9654;</button>' +
      '</div>' +
      '<label style="display:flex;align-items:center;gap:5px;font-size:10px;color:#9bb;margin-top:2px" ' +
        'title="Organize the phases + assignments but leave them UNDATED — you originate the schedule (§MI-FLOW)">' +
        '<input type="checkbox" id="sa-blank"> Start blank (set the dates yourself)</label>' +
      '<div id="sa-body" style="margin-top:4px"></div>';
    document.body.appendChild(_panel);
    document.getElementById('sa-close').onclick = close;
    document.getElementById('sa-draft').onclick = generateDraft;
    document.getElementById('sa-apply').onclick = applyTo4D;
    _built = true;
    render();
  }

  function open() {
    if (!_built) build();
    _panel.style.display = 'flex';
    // If a schedule was already authored this session, re-read it.
    if (!_state && db()) {
      var r = db().exec("SELECT schedule_id FROM schedules WHERE schedule_id='SCH_AUTHORED'");
      if (r.length && r[0].values.length) {
        _state = { schedId: 'SCH_AUTHORED', start: '2026-01-01', order: [], name: {}, dur: {}, count: {} };
        refreshState(); render();
      }
    }
    console.log('§AUTHOR_UI_OPEN built=' + _built + ' hasSchedule=' + (!!_state));
  }
  function close() { if (_panel) _panel.style.display = 'none'; console.log('§AUTHOR_UI_CLOSE'); }
  function toggle() { if (_panel && _panel.style.display === 'flex') close(); else open(); }

  global.openScheduleAuthorWizard = open;
  global.ScheduleAuthorUI = { open: open, close: close, toggle: toggle };

  console.log('§SCHEDULE_AUTHOR_UI_LOADED v2');
})(typeof self !== 'undefined' ? self : this);
