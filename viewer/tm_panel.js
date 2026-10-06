// time_machine family — part `panel` (original time_machine.js lines 2843–3697).
// GENERATED move-only by scripts/split_closure.js (config scripts/split_configs/time_machine.json). Below the `yield` every
// statement is the original text; the only edit is that a name owned by ANOTHER part is reached as TMS.name.
// Edit this file normally from now on; regenerate only to re-split a branch that still edits the old single file.
(typeof window !== 'undefined' ? window : globalThis).__timeMachineParts = (typeof window !== 'undefined' ? window : globalThis).__timeMachineParts || {};
(typeof window !== 'undefined' ? window : globalThis).__timeMachineParts.panel = function* __split_time_machine_panel(TMS) {
  'use strict';
  // phase 1 — publish this part's names that other parts use (same function objects; vars as live accessors)
  TMS.updateStatus = updateStatus;
  TMS.anchorFromCursor = anchorFromCursor;
  TMS.tickMs = tickMs;
  TMS.saveVisibility = saveVisibility;
  TMS.restoreVisibility = restoreVisibility;
  TMS._tmTrl = _tmTrl;
  TMS.buildPanel = buildPanel;
  TMS.switchMode = switchMode;
  TMS.configSlider = configSlider;
  TMS.startPlayback = startPlayback;
  TMS.stopPlayback = stopPlayback;
  Object.defineProperty(TMS, '_playing', { get: function () { return _playing; }, set: function (v) { _playing = v; }, enumerable: true });
  Object.defineProperty(TMS, '_activeBuildingCount', { get: function () { return _activeBuildingCount; }, set: function (v) { _activeBuildingCount = v; }, enumerable: true });
  yield;   // phase 2 resumes here, in this same scope: the original statements, in original order


  function updateStatus() {
    var _L = (typeof _tmTrl === 'function') ? _tmTrl : function (k, en, r) { var s = en; if (r) for (var q in r) s = s.replace('{' + q + '}', r[q]); return s; };   // S226 §R2b — sliced into vm sandboxes by witnesses
    var pbar = document.getElementById('tm-progress-bar');
    var range = TMS._projectEnd - TMS._projectStart;
    if (pbar && range > 0) pbar.style.width = Math.round((TMS._cursor - TMS._projectStart) / range * 100) + '%';

    // Count placed, collect readable active element names
    var placed = 0;
    var activeNames = [];
    for (var i = 0; i < TMS._ops.length; i++) {
      if (TMS._ops[i].start_ts > TMS._cursor) break;
      placed++;
      if (TMS._cursor < TMS._ops[i].end_ts) {
        var p = TMS._ops[i].parameters;
        // Prefer element name, fall back to IFC class stripped of "Ifc" prefix
        var nm = (p && p.name) || '';
        if (!nm && p && p.cls) nm = p.cls.replace(/^Ifc/, '');
        if (nm && activeNames.length < 3) activeNames.push(nm);
      }
    }

    var status = document.getElementById('tm-status');
    var label = document.getElementById('tm-label');
    var bigCounter = document.getElementById('tm-big-counter');
    var d = new Date(TMS._cursor);
    if (label) label.textContent = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    if (status) status.textContent = _L('tm_status_placed', '{n} placed | {names}', { n: placed, names: activeNames.join(', ') || _L('tm_idle', 'idle') });
    if (bigCounter) {
      var elapsedMs = TMS._cursor - TMS._projectStart;
      var totalDays = Math.floor(elapsedMs / 86400000);
      var remainHrs = Math.floor((elapsedMs % 86400000) / 3600000);
      bigCounter.textContent = _L('tm_mode_day', 'DAY') + ' ' + totalDays + ' \u2502 ' + _L('tm_mode_hr', 'HR') + ' ' + remainHrs;
    }
  }

  // ── Anchor from cursor ──
  function anchorFromCursor() {
    var d = new Date(TMS._cursor);
    TMS._anchorDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    TMS._anchorHr = d.getHours();
  }

  // ── Tick size in ms based on mode ──
  function tickMs() {
    // §S277b: Smaller time steps during dawn/dusk — more frames in the golden hour
    var base;
    if (TMS._mode === 'DAY') base = 3200000;       // ~53 min per tick
    else if (TMS._mode === 'HR') base = 52000;     // 52 sec per tick
    else base = 9000;                          // 9 seconds per tick
    // §S277b: During twilight, shrink time step — more frames across the color transition
    // Widened zone: 30° above to 20° below horizon. Finest at horizon crossing.
    if (TMS._sunCycle && TMS._lastElDeg !== undefined) {
      var el = TMS._lastElDeg;
      if (el > -20 && el < 30) {
        var dist = Math.abs(el);
        var range = el >= 0 ? 30 : 20;
        var t = 1 - dist / range;  // 1 at horizon, 0 at edge
        // Time step shrinks to 0.25x at horizon (4x more frames)
        var stepScale = 1 - 0.75 * t * t;
        base = Math.floor(base * stepScale);
      }
    }
    return base;
  }

  // ── Scene state save/restore ──
  var _savedInstanceState = {}; // meshId → { vis, matrices: { idx → Matrix4 } }
  var _savedBatchState = {};    // §S260b: meshId → { vis, slots: [bool, ...] }

  function saveVisibility() {
    TMS._savedVisibility = [];
    _savedInstanceState = {};
    _savedBatchState = {};
    var app = TMS.A();
    if (!app || !app.scene) return;
    app.scene.traverse(function(obj) {
      if (obj.userData && obj.userData.guid) {
        TMS._savedVisibility.push({ obj: obj, vis: obj.visible });
      }
      // §SE-7 (W-TM-DEDUPE-SAVE): Save InstancedMesh VISIBILITY only here — NOT matrices. The matrix
      // snapshot used to be cloned a SECOND time right here (one `new THREE.Matrix4()` + `.clone()` per
      // instance, ~29s of main-thread block on a 122K-element building — the "still hangs" report). It
      // was pure duplicate work: `renderAtTime()` (called unconditionally right after this, in
      // `_finishActivate`, and on every subsequent tick) already lazily builds `_savedInstanceMatrices`
      // — the SAME per-instance original matrices — as a side effect of rendering it has to do anyway.
      // `restoreVisibility()` now reads from that shared lazy cache instead of a redundant private copy.
      if (obj.isInstancedMesh && app._instanceMeta && app._instanceMeta[obj.id]) {
        _savedInstanceState[obj.id] = { vis: obj.visible, obj: obj };
      }
      // §S260b: Save BatchedMesh slot visibility
      if (obj.isBatchedMesh && app._batchMeta && app._batchMeta[obj.id]) {
        var bmetas = app._batchMeta[obj.id];
        var slots = [];
        for (var si = 0; si < bmetas.length; si++) {
          slots.push(obj.getVisibleAt ? obj.getVisibleAt(bmetas[si].slotId) : true);
        }
        _savedBatchState[obj.id] = { vis: obj.visible, slots: slots, obj: obj };
      }
    });
  }

  function restoreVisibility(force) {
    TMS.clearHighlight(force);
    var app = TMS.A();
    // §SE-7: matrices come from `_savedInstanceMatrices` (renderAtTime's lazy per-tick cache), not a
    // private clone saveVisibility() no longer makes. `activate()` always calls `renderAtTime()` at
    // least once before any `deactivate()` can run (§S260c "initial render" call in `_finishActivate`),
    // so every InstancedMesh this loop iterates (i.e. every one `saveVisibility()` saw) is guaranteed to
    // already have an entry here. A mesh with no entry (should not happen per the above) is left as-is —
    // correct either way, since renderAtTime never touched/mutated its matrix in that case.
    for (var meshId in _savedInstanceState) {
      var state = _savedInstanceState[meshId];
      var obj = state.obj;
      var mats = TMS._savedInstanceMatrices[meshId];
      if (mats) {
        for (var idx in mats) {
          obj.setMatrixAt(parseInt(idx), mats[idx]);
        }
        obj.instanceMatrix.needsUpdate = true;
      }
      obj.visible = state.vis;
    }
    _savedInstanceState = {};
    TMS._savedInstanceMatrices = {};
    // §S260b: Restore BatchedMesh slot visibility
    for (var bmId in _savedBatchState) {
      var bs = _savedBatchState[bmId];
      var bmetas = app._batchMeta && app._batchMeta[bmId];
      if (bmetas) {
        for (var si = 0; si < bmetas.length; si++) {
          bs.obj.setVisibleAt(bmetas[si].slotId, bs.slots[si] !== false);
        }
      }
      bs.obj.visible = bs.vis;
    }
    _savedBatchState = {};
    // Restore single mesh visibility — shadow flags return to Sunglass state
    TMS._savedVisibility.forEach(function(s) {
      s.obj.visible = s.vis;
    });
    TMS._savedVisibility = [];
    // §S260b: Restore shadow flags to Sunglass state (not blindly clear)
    var app = TMS.A();
    if (app && app.scene) {
      var shOn = !!app._shadowOn;
      app.scene.traverse(function(obj) {
        if (obj.isMesh || obj.isInstancedMesh || obj.isBatchedMesh) {
          obj.castShadow = shOn; obj.receiveShadow = shOn;
        }
      });
      if (app.renderer) app.renderer.shadowMap.needsUpdate = true;
    }
    if (app && app.markDirty) app.markDirty();
  }

  // ── UI ──
  // S226 §R2b (bim-compiler prompts/S226_localisation.md): the drawer's strings come from the iDempiere-format
  // dictionary (viewer/i18n/ad_message_base.csv ⋈ AD_Message_Trl_<lang>.xml → i18n/<code>.json, read by
  // locale_loader.js). `en` is the English shown today — byte-identical to the CSV msgtext (W-VIEWER-I18N 3b) — and
  // is what the page shows until the label pack lands or when no loader is present (Node witnesses). Functions that
  // witnesses SLICE out of this file and run alone in a vm sandbox cannot see this helper; they open with a local
  // `var _L = (typeof _tmTrl === 'function') ? _tmTrl : <English fallback>` instead (same contract).
  function _tmTrl(key, en, repl) {
    if (typeof _trl === 'function') return _trl(key, repl || null, en);
    var s = en; if (repl) for (var k in repl) s = s.replace('{' + k + '}', repl[k]);
    return s;
  }
  function buildPanel() {
    var _L = (typeof _tmTrl === 'function') ? _tmTrl : function (k, en, r) { var s = en; if (r) for (var q in r) s = s.replace('{' + q + '}', r[q]); return s; };   // S226 §R2b — sliced into vm sandboxes by witnesses
    TMS._panel = document.createElement('div');
    TMS._panel.id = 'time-machine-panel';
    TMS._panel.style.cssText =
      'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:250;' +
      'display:none;flex-direction:column;align-items:center;gap:6px;padding:10px 16px;' +
      'background:rgba(20,20,40,0.85);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);' +
      'border:1px solid rgba(79,195,247,0.3);border-radius:12px;' +
      'box-shadow:0 4px 24px rgba(0,0,0,0.5);color:#e0e0e0;font-family:sans-serif;' +
      'width:376px;user-select:none;touch-action:none;';

    TMS._panel.innerHTML =
      '<div style="display:flex;align-items:center;width:100%;cursor:grab" class="tm-drag">' +
        '<button id="tm-sun" style="font-size:14px;padding:4px 8px;min-width:32px;min-height:32px" data-trl-title="tm_tt_sun" title="Day/night cycle"><span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:linear-gradient(90deg,#fff 50%,#222 50%);vertical-align:middle"></span></button>' +
        '<button id="tm-eye" style="padding:2px 6px;min-width:36px;min-height:36px;background:#888" data-trl-title="tm_tt_drone" title="Drone Pilot — cinematic camera"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2"/><circle cx="12" cy="12" r="3"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M12 2v4"/><path d="M12 18v4"/></svg></button>' +
        '<button id="tm-gantt" style="font-size:12px;padding:2px 6px" data-trl-title="tm_tt_gantt" title="Gantt chart">&#x1F4CA;</button>' +
        // §GANTT_EDIT DEP (user ruling 2026-08-04): the ✎ Author-4D side-panel button is REMOVED —
        // the Gantt drawer itself is now the editable surface (drag to move, edge-pull to resize,
        // both constraint-aware). §TM_P6_FOLD (2026-08-24): the "later pass" that old comment
        // promised for the ↗ Editor tab happened — the tab's editing surface (WBS outline,
        // dependency editor, drag-Gantt, ▶ CPM, zoom) was fully redundant with the drawer's direct
        // editing (§GANTT_EDIT/§GANTT_PROPS) + auto-CPM-annotate (§S68), so schedule_editor.html /
        // schedule_editor_ui.js are DELETED. The tab's one non-redundant surface — P6/MS Project
        // import/export + Diff-vs-Model — is folded into the #tm-p6-box section below, and #tm-editor
        // is repurposed as its toggle.
        '<button id="tm-whatif" style="font-size:12px;padding:2px 6px" data-trl-title="tm_tt_whatif" title="What-if: slip a phase, watch the chain re-fold in blue">&#9094;</button>' +
        '<button id="tm-editor" style="font-size:11px;padding:2px 6px" data-trl-title="tm_tt_p6" title="P6 / MS Project interop — import a Primavera .xer/.xml or MS Project XML programme onto this model, export MSPDI/PMXML/XER, or grade an imported schedule against the model to see its own quantity + rate estimate">&#8644; P6/MSP</button>' +
        '<button id="tm-dash" style="font-size:12px;padding:2px 6px" data-trl-title="tm_tt_dash" title="Dashboard">&#x1F4CB;</button>' +
        '<button id="tm-var" style="font-size:13px;padding:2px 6px;display:none" data-trl-title="tm_tt_var" title="Budget vs Actual variance">&#x2696;</button>' +
        '<button id="tm-lod" style="padding:2px 6px;min-width:32px;min-height:32px;display:none" data-trl-title="tm_tt_lod" title="Draw-cost proxy: box the already-built elements outside camera view (large buildings only). OFF = today\'s rendering, unchanged."><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg></button>' +
        '<span id="tm-big-counter" style="flex:1;font-size:18px;font-weight:bold;color:#4fc3f7;text-align:center;letter-spacing:1px"><span data-trl="tm_mode_day">DAY</span> 0 | <span data-trl="tm_mode_hr">HR</span> 0</span>' +
        '<button id="tm-close" style="width:22px;height:22px;font-size:12px;padding:0;line-height:1" data-trl-title="ui_close" title="Close">&#x2715;</button>' +
      '</div>' +
      '<div id="tm-status" data-trl="tm_status_init" style="width:100%;text-align:center;font-size:13px;color:#ccc;padding:2px 0;min-height:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">4D Construction Playback</div>' +
      '<div style="display:flex;gap:4px;align-items:center;width:100%">' +
        '<span id="tm-label" style="color:#4fc3f7;font-weight:bold;font-size:13px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">—</span>' +
        '<div style="display:flex;gap:3px">' +
          '<button class="tm-mode" data-mode="DAY" data-trl="tm_mode_day">DAY</button>' +
          '<button class="tm-mode" data-mode="HR" data-trl="tm_mode_hr">HR</button>' +
          '<button class="tm-mode" data-mode="MIN" data-trl="tm_mode_min">MIN</button>' +
        '</div>' +
      '</div>' +
      '<input id="tm-slider" type="range" min="0" max="100" value="50" style="width:100%;accent-color:#4fc3f7">' +
      '<div id="tm-progress" style="width:100%;height:3px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden">' +
        '<div id="tm-progress-bar" style="height:100%;width:100%;background:#4fc3f7;transition:width 0.2s"></div>' +
      '</div>' +
      '<div style="display:flex;gap:3px;width:100%;height:30px">' +
        '<button id="tm-start-btn" style="width:30px;font-size:14px" data-trl-title="tm_tt_jump_start" title="Jump to start">&#x25C0;&#x25C0;</button>' +
        '<button id="tm-rev-btn" style="width:30px;font-size:14px" data-trl-title="tm_tt_deconstruct" title="Deconstruct">&#x25C0;</button>' +
        '<button id="tm-stop-btn" style="width:30px;font-size:14px" data-trl-title="tm_tt_stop" title="Stop">&#x25A0;</button>' +
        '<button id="tm-fwd-btn" style="width:30px;font-size:14px" data-trl-title="tm_tt_build" title="Build">&#x25B6;</button>' +
        '<button id="tm-end-btn" style="width:30px;font-size:14px" data-trl-title="tm_tt_jump_end" title="Jump to end">&#x25B6;&#x25B6;</button>' +
        '<button id="tm-undo" style="flex:1;font-size:9px" data-trl-title="tm_tt_undo_edit" title="Undo the last Gantt drag/resize">&#x21BA; <span data-trl="tm_undo_edit">Undo edit</span></button>' +
        '<button id="tm-baseline" style="flex:1;font-size:9px" data-trl-title="tm_tt_set_baseline" title="Snapshot current dates as the baseline for schedule variance">&#x2691; <span data-trl="tm_set_baseline">Set Baseline</span></button>' +
        '<button id="tm-reschedule-asap" style="flex:1;font-size:9px" data-trl-title="tm_tt_pull_back" title="Pull every task back to the earliest start its predecessors allow (compression only — never moves a task later)">&#x23EA; <span data-trl="tm_pull_back">Pull Back</span></button>' +
      '</div>' +
      '<div id="tm-gantt-box" class="tm-drawer-bottom">' +
        // §GANTT_PALETTE 2026-08-04: phase legend strip removed — the hover tooltip already reports
        // storey, phase, element count, day range and source, so the legend was pure duplication.
        // §GANTT_RULER (E5) + §GANTT_RESIZE (E6), 2026-08-04. The drawer had NO time axis at all —
        // the only temporal reference was the cursor hairline, so a bar's absolute dates were only
        // discoverable by hovering it. position:sticky keeps the header pinned while the bar rows
        // scroll underneath, so the axis is always on screen. The grip above it drags the drawer
        // taller than the CSS 220px cap (a 22-storey building renders ~130 bars into that box).
        '<div id="tm-gantt-head" style="position:sticky;top:0;z-index:3;background:#12161c">' +
          '<div id="tm-gantt-grip" style="height:7px;cursor:ns-resize;background:rgba(79,195,247,0.18);' +
            'border-bottom:1px solid rgba(79,195,247,0.25)" data-trl-title="tm_tt_gantt_grip" title="Drag to resize the Gantt drawer"></div>' +
          // §GANTT_EDIT_LOCK (user ruling 2026-08-05, supersedes §GANTT_AUTHOR_ENTRY's button): no
          // button opens a side panel any more, native or otherwise — the drawer materializes its own
          // schedule automatically (see drawGanttMini's auto-generate call) the first time it has
          // nothing to show, same native ScheduleAuthor.materializeZones/materializeDefault path,
          // still guarded against clobbering a real imported schedule. What the user DOES need a
          // manual control for is whether the bars are draggable right now — that's this lock toggle,
          // not a generate trigger.
          '<div id="tm-gantt-lockbar" style="display:flex;align-items:center;gap:6px;padding:3px 6px;' +
            'font-size:10px;color:#8a97a5;border-bottom:1px solid rgba(79,195,247,0.15)">' +
            '<button id="tm-gantt-editlock" style="font-size:10px;padding:1px 6px" data-trl-title="tm_tt_locked" title="Locked: drag/resize/link disabled, timeline still scrubs live. Click to unlock editing.">' +
            '&#x1F512; <span data-trl="tm_locked">Locked</span></button><span id="tm-gantt-lockmsg" style="flex:1"></span>' +
            // §S75 — the legend for the float rail. The swatches are drawn as thin bars, the same
            // shape as the rail itself, so the mapping reads without a caption. Counts come from the
            // SAME annotate pass that paints the bars (never a second computation), and the whole
            // strip is emptied when CPM could not run rather than showing a stale or invented zero.
            '<span id="tm-gantt-cpmlegend" style="white-space:nowrap;color:#8a97a5"></span></div>' +
          '<canvas id="tm-gantt-ruler" style="width:100%;height:18px;display:block;cursor:ew-resize" data-trl-title="tm_tt_ruler" title="Drag to shift the whole project\'s start/finish (Editing must be unlocked)"></canvas>' +
        '</div>' +
        '<div style="position:relative">' +
          '<canvas id="tm-gantt-canvas" style="width:100%;cursor:pointer"></canvas>' +
          '<div id="tm-gantt-hair" style="position:absolute;top:0;width:2px;height:100%;background:#ff8c00;pointer-events:none;z-index:1;display:none"></div>' +
          '<div id="tm-gantt-marquee" style="position:absolute;border:1px dashed #4fc3f7;' +
            'background:rgba(79,195,247,0.12);pointer-events:none;z-index:1;display:none"></div>' +
          '<div id="tm-gantt-tip" style="position:absolute;top:4px;left:0;background:rgba(20,20,40,0.92);color:#ff8c00;font-size:10px;padding:3px 8px;border-radius:3px;border:1px solid rgba(255,140,0,0.3);pointer-events:none;z-index:2;display:none;white-space:nowrap;max-width:280px;overflow:hidden;text-overflow:ellipsis"></div>' +
        '</div>' +
      '</div>' +
      '<div id="tm-var-box" class="tm-drawer-bottom">' +
        '<div id="tm-var-head" style="padding:4px 6px 2px;font-size:11px;color:#e0e0e0;line-height:1.5"></div>' +
        '<canvas id="tm-var-canvas" style="width:100%;cursor:default"></canvas>' +
        '<div id="tm-var-list" style="padding:2px 6px 4px;font-size:10px;color:#ccc"></div>' +
      '</div>' +
      // §TM_P6_FOLD — P6/MS Project interop + Diff-vs-Model, folded in from the retired Schedule
      // Editor tab (2026-08-24). Collapsed by default (.tm-drawer-bottom max-height:0); #tm-editor
      // toggles it and lazy-loads foreign_schedule.js + schedule_diff.js on first open.
      '<div id="tm-p6-box" class="tm-drawer-bottom">' +
        '<div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;padding:6px 6px 2px">' +
          '<span style="font-size:9px;color:#8a97a5;text-transform:uppercase;letter-spacing:.06em" data-trl="tm_import">Import</span>' +
          '<button id="tm-p6-import" style="font-size:10px" data-trl-title="tm_tt_p6_file" title="Import a Primavera P6 programme (.xer or .xml/PMXML) or MS Project XML (MSPDI) — adopt its WBS, logic and dates onto this model. Binding tasks to elements stays a separate, reviewable step.">&#8681; <span data-trl="tm_p6_file">P6/MSP file</span></button>' +
          '<input id="tm-p6-file" type="file" accept=".xer,.xml" style="display:none">' +
          '<label style="font-size:10px;color:#8a97a5" data-trl-title="tm_tt_autobind" title="If activity names carry a BIM-Bind token (@discipline:IfcClass[:storey]), resolve it against this model and pre-bind tasks to elements on import — a reviewable first pass, not a guess."><input id="tm-p6-autobind" type="checkbox" checked> <span data-trl="tm_autobind">auto-bind</span></label>' +
          '<span style="width:1px;height:14px;background:rgba(79,195,247,0.25);margin:0 2px"></span>' +
          '<span style="font-size:9px;color:#8a97a5;text-transform:uppercase;letter-spacing:.06em" data-trl="tm_export">Export</span>' +
          '<button id="tm-p6-export-msp" style="font-size:10px" data-trl-title="tm_tt_export_msp" title="Export the current schedule (WBS, dates, dependencies) as MS Project XML (MSPDI) — opens directly in Microsoft Project; re-imports here too.">&#8679; MSP</button>' +
          '<button id="tm-p6-export-pmxml" style="font-size:10px" data-trl-title="tm_tt_export_pmxml" title="Export as Primavera P6 PMXML (APIBusinessObjects XML) — the format every documented P6 export path uses; re-imports here too. Some fields (WBS code, EPS-level activity codes, resource assignments, global calendars, baselines) are not carried — P6 itself drops most of these on cross-DB import.">&#8679; PMXML</button>' +
          '<button id="tm-p6-export-xer" style="font-size:10px" data-trl-title="tm_tt_export_xer" title="Export as Primavera XER — the older tab-delimited P6 interchange, for P6 installs that still prefer it over PMXML. Same known-lossy fields as PMXML.">&#8679; XER</button>' +
          '<span style="width:1px;height:14px;background:rgba(79,195,247,0.25);margin:0 2px"></span>' +
          '<button id="tm-p6-diff" style="font-size:10px" data-trl-title="tm_tt_diff_model" title="4D Schedule Diff — grade an IMPORTED P6/MSP schedule per-phase against the model. It compares their durations to our own real-quantity + labor-rate estimate (import a file first)">&#9878; <span data-trl="tm_diff_model">Diff vs Model</span></button>' +
        '</div>' +
        '<div id="tm-p6-out" style="padding:2px 8px 6px;font-size:10px;color:#9fb0c6;line-height:1.5;max-height:64px;overflow-y:auto"></div>' +
      '</div>' +
      '<div id="tm-dash-col" class="tm-drawer-right">' +
        '<div style="display:flex;gap:8px;justify-content:center;margin-bottom:8px">' +
          '<canvas id="tm-dash-time-pie" width="120" height="120" style="width:110px;height:110px"></canvas>' +
          '<canvas id="tm-dash-cost-pie" width="120" height="120" style="width:110px;height:110px"></canvas>' +
        '</div>' +
        '<div style="font-size:11px;color:#4fc3f7;font-weight:bold;margin-bottom:4px" data-trl="tm_phase_progress">Phase Progress</div>' +
        '<div id="tm-dash-phases"></div>' +
        '<div style="font-size:11px;color:#4fc3f7;font-weight:bold;margin:8px 0 4px" data-trl="t_site_resources">Site Resources</div>' +
        '<div id="tm-dash-crews"></div>' +
        '<div style="font-size:11px;color:#4fc3f7;font-weight:bold;margin:8px 0 4px" data-trl="tm_s_curve">S-Curve</div>' +
        '<canvas id="tm-dash-scurve" width="200" height="60" style="width:100%;height:60px"></canvas>' +
        '<div id="tm-dash-daycnt" style="font-size:10px;color:#999;margin-top:2px;text-align:center"></div>' +
      '</div>' +
      // §TM_PANEL_RESIZE (2026-08-05, user ruling: "panel borders supposed to be draggable so we
      // can see more"). The whole drawer was hardcoded 376px with a resize handle for the internal
      // Gantt box's HEIGHT (tm-gantt-grip) but nothing for the drawer's own WIDTH — exactly what the
      // screenshot showed: the props panel overlapping the storey labels and ruler with nowhere to
      // grow into. `_panel` is centered via left:50%/translateX(-50%), so a single edge handle grows
      // the box symmetrically for free — no left-edge math needed.
      '<div id="tm-panel-resize-grip" data-trl-title="tm_tt_panel_grip" title="Drag to resize the drawer" style="position:absolute;' +
        'top:0;right:-3px;bottom:0;width:8px;cursor:ew-resize;z-index:6"></div>' +
      // §TM_PANEL_RESIZE_H (2026-08-05, user: "make the lower border pullable expandable too, not
      // just the right border") — same edge-grip pattern as the width handle above, mirrored onto
      // the panel's bottom edge so both resizable dimensions are reachable the same way.
      '<div id="tm-panel-resize-grip-b" data-trl-title="tm_tt_panel_grip" title="Drag to resize the drawer" style="position:absolute;' +
        'left:0;right:0;bottom:-3px;height:8px;cursor:ns-resize;z-index:6"></div>';
    document.body.appendChild(TMS._panel);
    // S226 §R2b: the drawer is built after the loader's own pass may already have run — translate its subtree now.
    if (typeof window._applyTrlToDOM === 'function') window._applyTrlToDOM();
    TMS.wirePanelResize();
    TMS.wirePanelResizeHeight();

    var style = document.createElement('style');
    style.textContent =
      '#time-machine-panel{transition:width 200ms ease-out}' +
      '#time-machine-panel.tm-panel-resizing{transition:none}' +
      '#tm-panel-resize-grip:hover,#tm-panel-resize-grip.tm-gripping{background:rgba(79,195,247,0.35)}' +
      '#tm-panel-resize-grip-b:hover,#tm-panel-resize-grip-b.tm-gripping{background:rgba(79,195,247,0.35)}' +
      '#time-machine-panel button{background:rgba(255,255,255,0.1);color:#e0e0e0;border:1px solid rgba(79,195,247,0.3);' +
      'border-radius:4px;padding:4px 4px;cursor:pointer;font-size:10px}' +
      '#time-machine-panel button:hover{background:rgba(79,195,247,0.2)}' +
      '#time-machine-panel button.tm-active{background:#1a6b8a;color:#fff}' +
      '#tm-eye.tm-active{background:#fff !important}' +
      '.tm-drawer-bottom{max-height:0;overflow:hidden;transition:max-height 200ms ease-out;' +
      'width:100%;margin-top:4px;border-top:1px solid rgba(79,195,247,0.2)}' +
      '.tm-drawer-bottom.open{max-height:220px;overflow-y:auto}' +
      '.tm-drawer-right{width:0;overflow:hidden;transition:width 200ms ease-out,opacity 150ms;opacity:0;' +
      'position:absolute;left:100%;top:0;padding:0;pointer-events:none;' +
      'background:rgba(20,20,40,0.92);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);' +
      'border:1px solid rgba(79,195,247,0.3);border-left:none;border-radius:0 12px 12px 0;' +
      'max-height:80vh;overflow-y:auto}' +
      '.tm-drawer-right.open{width:260px;opacity:1;padding:10px;pointer-events:auto}' +
      '@media(max-width:600px){#time-machine-panel{width:92vw;bottom:60px}' +
      '.tm-drawer-right{left:auto;top:100%;border-radius:0 0 12px 12px;border-left:1px solid rgba(79,195,247,0.3);border-top:none}' +
      '.tm-drawer-right.open{width:100%;max-height:200px}}';
    document.head.appendChild(style);

    makeDraggable(TMS._panel);

    // Mode buttons
    TMS._panel.querySelectorAll('.tm-mode').forEach(function(btn) {
      btn.addEventListener('pointerup', function(e) {
        e.stopPropagation(); switchMode(btn.dataset.mode);
      });
    });

    document.getElementById('tm-slider').addEventListener('input', onSlide);

    // §AUTHOR-1: the 4D-schedule authoring wizard + what-if are TM-owned (launched from this surface).
    var _author = document.getElementById('tm-author');
    if (_author) _author.addEventListener('pointerup', function(e) {
      e.stopPropagation();
      if (window.ScheduleAuthorUI) window.ScheduleAuthorUI.toggle();
      else if (typeof window.openScheduleAuthorWizard === 'function') window.openScheduleAuthorWizard();
      else { var s = document.getElementById('tm-status'); if (s) s.textContent = _L('tm_author_not_loaded', 'Author engine not loaded'); }
    });
    var _whatif = document.getElementById('tm-whatif');
    if (_whatif) _whatif.addEventListener('pointerup', function(e) {
      e.stopPropagation();
      if (window.WhatIfPanel) window.WhatIfPanel.open();
      else { var s = document.getElementById('tm-status'); if (s) s.textContent = _L('tm_whatif_not_loaded', 'What-if engine not loaded'); }
    });
    // §TM_P6_FOLD — repurposed #tm-editor: no longer opens a tab; toggles the in-panel P6/MSP
    // interop section (import/export/diff). Editing lives in the drawer itself (§GANTT_EDIT +
    // §S68 auto-CPM); the interop engines lazy-load on first open, so Alt+C and plain viewer
    // boot pay nothing for this section.
    var _editor = document.getElementById('tm-editor');
    if (_editor) _editor.addEventListener('pointerup', function(e) {
      e.stopPropagation();
      TMS.toggleP6Drawer();
    });
    TMS.wireP6Controls();

    // Transport buttons
    document.getElementById('tm-start-btn').addEventListener('pointerup', function(e) {
      e.stopPropagation(); stopPlayback(); TMS.renderAtTime(TMS._projectStart); anchorFromCursor(); configSlider();
    });
    document.getElementById('tm-end-btn').addEventListener('pointerup', function(e) {
      e.stopPropagation(); stopPlayback(); TMS.renderAtTime(TMS._projectEnd); anchorFromCursor(); configSlider();
    });
    document.getElementById('tm-rev-btn').addEventListener('pointerup', function(e) {
      e.stopPropagation(); startPlayback(-1);
    });
    document.getElementById('tm-fwd-btn').addEventListener('pointerup', function(e) {
      e.stopPropagation(); startPlayback(+1);
    });
    document.getElementById('tm-stop-btn').addEventListener('pointerup', function(e) {
      e.stopPropagation(); stopPlayback();
    });

    document.getElementById('tm-undo').addEventListener('pointerup', function(e) {
      e.stopPropagation(); TMS.undoLastGanttEdit();
    });
    document.getElementById('tm-baseline').addEventListener('pointerup', function(e) {
      e.stopPropagation(); TMS.setGanttBaseline();
    });
    document.getElementById('tm-reschedule-asap').addEventListener('pointerup', function(e) {
      e.stopPropagation(); TMS.rescheduleGanttAsap();
    });
    document.getElementById('tm-sun').addEventListener('pointerup', function(e) {
      e.stopPropagation();
      var app = TMS.A();
      if (!app) return;
      TMS._sunCycle = !TMS._sunCycle;
      var btn = document.getElementById('tm-sun');
      if (btn) btn.classList.toggle('tm-active', TMS._sunCycle);
      if (TMS._sunCycle) {
        TMS.applySunCycle(TMS._cursor);
      } else {
        // §S277b: Sun toggle off — restore lighting but keep _savedLighting for re-toggle
        app._sunCycleActive = false;
        if (app._sky && !app._shadowOn) app._sky.visible = false;
        if (app._lensflare) { app._lensflare.visible = false; if (app._lensflare.userData._halo) app._lensflare.userData._halo.visible = false; }
        if (app.updateSky) app.updateSky(45, 180);
        if (TMS._savedLighting) {
          app.sun.intensity = TMS._savedLighting.sunI;
          if (app.ambient) app.ambient.intensity = TMS._savedLighting.ambI;
          if (app.hemi) app.hemi.intensity = TMS._savedLighting.hemiI;
          if (app.renderer) {
            app.renderer.toneMappingExposure = TMS._savedLighting.exposure;
            app.renderer.setClearColor(TMS._savedLighting.clearColor);
          }
        }
        TMS._savedClearColor = null;
      }
      if (app.renderer && app.scene && app.camera) app.renderer.render(app.scene, app.camera);
    });
    var _lodBtn = document.getElementById('tm-lod');
    if (_lodBtn) _lodBtn.addEventListener('pointerup', function(e) {
      e.stopPropagation();
      TMS._dlodProxyOn = !TMS._dlodProxyOn;
      _lodBtn.classList.toggle('tm-active', TMS._dlodProxyOn);
      console.log('§DLOD_TM_TOGGLE on=' + TMS._dlodProxyOn + ' large=' + TMS._isLargeBuilding + ' streaming=' + !!TMS.A().streaming);
      // §4: user-paced edge — force the FULL traverse path (not §PERF_INCR delta, which would skip
      // nearly every mesh at a zero-span re-render and leave the toggle visually unapplied).
      window.__forceFull = true;
      TMS.renderAtTime(TMS._cursor);
      if (TMS.A().renderer && TMS.A().scene && TMS.A().camera) TMS.A().renderer.render(TMS.A().scene, TMS.A().camera);
    });
    document.getElementById('tm-eye').addEventListener('pointerup', function(e) {
      e.stopPropagation();
      TMS._camFollow = !TMS._camFollow;
      TMS._camAngle = 0;
      var btn = document.getElementById('tm-eye');
      if (btn) btn.classList.toggle('tm-active', TMS._camFollow);

      if (TMS._camFollow) {
        // §S260c: Compute storyboard — show status while preparing
        TMS.viewerStatus('🚁 Pilot Drone processing...');
        TMS._cineBeat = 'closeup';
        TMS._cineTick = 0;
        TMS._cineSceneIdx = 0;
        TMS._cineCloseupCount = 0;
        TMS._cineSeenZones = {};

        // §S260c: Check IDB for cached Movie Script, else compute fresh
        TMS.cacheGet('movie').then(function(cachedScript) {
          // §S260d: Invalidate old cache — check for _arcV marker (S260d storyboard format)
          var cacheValid = cachedScript && cachedScript.length > 0 && cachedScript[0]._arcV === 4;
          if (cacheValid) {
            // Reconstruct Vector3 objects from plain {x,y,z}
            for (var si = 0; si < cachedScript.length; si++) {
              var s = cachedScript[si];
              s.center = new THREE.Vector3(s.center.x, s.center.y, s.center.z);
              if (s.chain) {
                for (var ci = 0; ci < s.chain.length; ci++) {
                  s.chain[ci] = new THREE.Vector3(s.chain[ci].x, s.chain[ci].y, s.chain[ci].z);
                }
              }
            }
            TMS._cineStoryboard = cachedScript;
            console.log('§MOVIE_CACHE_HIT scenes=' + TMS._cineStoryboard.length);
          } else {
            var posMap = TMS.buildGuidPosMap();
            TMS._cineStoryboard = TMS.computeStoryboard(TMS._ops, posMap);
            // §S260d: Don't cache here — background builder caches full storyboard when done
            if (TMS._cineStoryboard.length && !TMS._bgBuildRaf) {
              TMS.cachePut('movie', TMS._cineStoryboard);
              console.log('§MOVIE_CACHE_SAVE scenes=' + TMS._cineStoryboard.length);
            }
          }

          if (TMS._cineStoryboard.length) {
            TMS._cineNextTarget = TMS._cineStoryboard[0].center;
            TMS._camTarget = TMS._cineStoryboard[0].center.clone();
            // §S260c v2: Don't auto-play — let user press ▶ when ready
            TMS.viewerStatus('🚁 ' + TMS._cineStoryboard.length + ' scenes ready — press ▶ to play');
            console.log('§CINE_READY scenes=' + TMS._cineStoryboard.length + ' — awaiting user Play');
          } else {
            TMS.viewerStatus('🚁 No scenes found — load a building first');
          }
        }).catch(function(e) {
          console.warn('§MOVIE_CACHE_ERR ' + (e && e.message));
          var posMap = TMS.buildGuidPosMap();
          TMS._cineStoryboard = TMS.computeStoryboard(TMS._ops, posMap);
          if (TMS._cineStoryboard.length) {
            TMS._cineNextTarget = TMS._cineStoryboard[0].center;
            TMS._camTarget = TMS._cineStoryboard[0].center.clone();
            TMS.viewerStatus('🚁 ' + TMS._cineStoryboard.length + ' scenes ready — press ▶ to play');
          }
        });
      } else {
        TMS._cineStoryboard = [];
        if (TMS._bgBuildRaf) { cancelAnimationFrame(TMS._bgBuildRaf); TMS._bgBuildRaf = 0; }
        TMS.restorePeeled();
        TMS._cineHeroSlowdown = false;
        TMS._cineEstabStart = null; TMS._cineEstabEnd = null;
        stopPlayback();
        TMS.viewerStatus('');
      }

      // Hook orbit controls — detect manual interaction to pause auto-rotation
      var app = TMS.A();
      if (app && app.renderer && app.renderer.domElement) {
        app.renderer.domElement.addEventListener('pointerdown', function() {
          TMS._camUserInteracted = performance.now();
        });
      }
    });
    document.getElementById('tm-gantt').addEventListener('pointerup', function(e) {
      e.stopPropagation();
      TMS._ganttVisible = !TMS._ganttVisible;
      // Mobile: only one drawer at a time
      if (TMS._ganttVisible && window.innerWidth < 600 && TMS._dashVisible) {
        TMS._dashVisible = false;
        TMS.toggleDashDOM(false);
      }
      var btn = document.getElementById('tm-gantt');
      if (btn) btn.classList.toggle('tm-active', TMS._ganttVisible);
      var box = document.getElementById('tm-gantt-box');
      if (box) box.classList.toggle('open', TMS._ganttVisible);
      // §GANTT_AUTHOR_REPROBE (2/2, found in a real browser 2026-08-04): re-probing inside
      // buildTaskIndex() was not enough on its own — buildGanttTasks() is gated on _ganttDirty, and
      // authoring a schedule does not set it, so the re-probe never ran and freshly authored bars
      // stayed non-editable. PROVEN live: materializeZones returned ok:true with 18 zones while the
      // drawer still showed the "not editable" banner. Opening the drawer is exactly the moment the
      // user expects it to reflect reality, so mark it dirty here.
      if (TMS._ganttVisible) { TMS._ganttDirty = true; TMS.drawGanttMini(); }
    });
    document.getElementById('tm-dash').addEventListener('pointerup', function(e) {
      e.stopPropagation();
      TMS._dashVisible = !TMS._dashVisible;
      // Mobile: only one drawer at a time
      if (TMS._dashVisible && window.innerWidth < 600 && TMS._ganttVisible) {
        TMS._ganttVisible = false;
        var gb = document.getElementById('tm-gantt-box');
        if (gb) gb.classList.remove('open');
        var gbtn = document.getElementById('tm-gantt');
        if (gbtn) gbtn.classList.remove('tm-active');
      }
      TMS.toggleDashDOM(TMS._dashVisible);
      if (TMS._dashVisible) TMS.drawDashboard();
    });
    document.getElementById('tm-var').addEventListener('pointerup', function(e) {
      e.stopPropagation();
      TMS._varVisible = !TMS._varVisible;
      // Mobile: only one bottom drawer at a time (mirror the gantt/dash rule)
      if (TMS._varVisible && window.innerWidth < 600 && TMS._ganttVisible) {
        TMS._ganttVisible = false;
        var gb2 = document.getElementById('tm-gantt-box'); if (gb2) gb2.classList.remove('open');
        var gbt2 = document.getElementById('tm-gantt'); if (gbt2) gbt2.classList.remove('tm-active');
      }
      var vbtn = document.getElementById('tm-var');
      if (vbtn) vbtn.classList.toggle('tm-active', TMS._varVisible);
      var vbox = document.getElementById('tm-var-box');
      if (vbox) vbox.classList.toggle('open', TMS._varVisible);
      if (TMS._varVisible) TMS.drawVariance();
    });
    // §S1 — tap a phase row in the variance drawer to jump the cursor to that phase's window (reciprocal of
    // the hairline: the scrub moves the highlight, a tap moves the cursor). Maps click-Y → phase row.
    document.getElementById('tm-var-canvas').addEventListener('pointerup', function (e) {
      if (!TMS._active || !TMS._ops.length || !TMS._twin) return;
      var V = TMS._computeVariance();
      if (!V || !V.phases.length) return;
      var rect = e.target.getBoundingClientRect();
      var barH = 9, gap = 5, rowH = barH + gap;
      var ti = Math.floor((e.clientY - rect.top - 4) / rowH);
      if (ti < 0 || ti >= V.phases.length) return;
      var p = V.phases[ti];
      TMS.renderAtTime(p.winStart);
      anchorFromCursor();
      configSlider();
      console.log('§TM_VARIANCE_JUMP phase="' + p.phase + '" cursor=' + Math.round(TMS._cursor) + ' committed=' + p.aCost);
    });
    // ── §GANTT_DRAG (E1/E2 UI half) — pointerdown starts a bar drag, pointerup either commits the
    // edit or falls through to the original seek. Registered BEFORE the seek handler so _dragMoved
    // is already set by the time that one runs.
    TMS.wireGanttDrag();
    document.getElementById('tm-gantt-canvas').addEventListener('pointerup', function(e) {
      if (!TMS._active || !TMS._ops.length) return;
      if (TMS._dragConsumed) { TMS._dragConsumed = false; return; }   // this pointerup finished an edit, not a seek
      var rect = e.target.getBoundingClientRect();
      var x = (e.clientX - rect.left - 60) / (rect.width - 60);  // account for storey label margin
      if (x < 0) x = 0;
      var pct = Math.min(1, Math.max(0, x));
      // §GANTT_AXIS_OUTLIER: invert against the SAME qualified axis the bars/ruler are drawn against.
      var ts = TMS._ganttAxisStart + pct * Math.max(1, TMS._ganttAxisEnd - TMS._ganttAxisStart);
      var bar = TMS.findBarAtClick(e);
      TMS.renderAtTime(ts);
      anchorFromCursor();
      configSlider();
      if (bar) console.log('§GANTT_MINI_SEEK ts=' + Math.round(ts) + ' bar="' + bar.storey + '|' + bar.phase + '"');
    });
    // Hover tooltip for gantt bars
    document.getElementById('tm-gantt-canvas').addEventListener('pointermove', function(e) {
      var tip = document.getElementById('tm-gantt-tip');
      if (!tip || !TMS._ganttTasks.length) return;
      var bar = TMS.findBarAtClick(e);
      if (bar) {
        var dayStart = Math.round((bar.startTs - TMS._projectStart) / 86400000);
        var dayEnd = Math.round((bar.endTs - TMS._projectStart) / 86400000);
        // \u00a7gate: source label so you can tell preset IFC 4D from generated fallback
        var src = (bar.cap === bar.count) ? _L('tm_src_ifc4d', 'IFC 4D') : (bar.cap > 0 ? (bar.cap + '/' + bar.count + ' ' + _L('tm_src_ifc4d', 'IFC 4D')) : _L('tm_src_generated', 'generated'));
        tip.textContent = _L('tm_bar_tip', '{storey} \u2014 {phase} ({n} el, Day {a}\u2013{b}, {src})', { storey: bar.storey, phase: bar.phase, n: bar.count, a: dayStart, b: dayEnd, src: src });
        tip.style.left = Math.max(0, Math.min(e.offsetX + 8, e.target.clientWidth - 200)) + 'px';
        // \u00a7gate: follow the pointer/touch Y so the tip stays visible when the Gantt is scrolled
        // (was pinned at top:4px \u2192 off-screen once scrolled down). Just above the tip; flip below near the top.
        var ty = e.offsetY - 22; if (ty < 2) ty = e.offsetY + 16;
        tip.style.top = ty + 'px';
        tip.style.display = 'block';
      } else {
        tip.style.display = 'none';
      }
    });
    document.getElementById('tm-gantt-canvas').addEventListener('pointerleave', function() {
      var tip = document.getElementById('tm-gantt-tip');
      if (tip) tip.style.display = 'none';
    });
    document.getElementById('tm-close').addEventListener('pointerup', function(e) {
      e.stopPropagation(); TMS.deactivate();
    });
  }

  // ── Draggable (measure.js pattern + mobile) ──
  function makeDraggable(el) {
    var ox, oy, sx, sy, dragging = false;
    var dragStrip = (window._isMobile) ? 50 : 30;
    if (window._isMobile) {
      el.addEventListener('touchstart', function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
        var rect = el.getBoundingClientRect();
        var t = e.touches[0];
        if (t.clientY - rect.top <= dragStrip) e.preventDefault();
      }, { passive: false });
    }
    el.addEventListener('pointerdown', function(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
      var rect = el.getBoundingClientRect();
      if (e.clientY - rect.top > dragStrip) return;
      dragging = true;
      ox = e.clientX; oy = e.clientY;
      sx = rect.left; sy = rect.top;
      el.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    el.addEventListener('pointermove', function(e) {
      if (!dragging) return;
      el.style.left = (sx + e.clientX - ox) + 'px';
      el.style.top = (sy + e.clientY - oy) + 'px';
      el.style.right = 'auto'; el.style.bottom = 'auto'; el.style.transform = 'none';
    });
    el.addEventListener('pointerup', function() { dragging = false; });
  }

  // ── Mode switching ──
  function switchMode(mode) {
    TMS._mode = mode;
    TMS._panel.querySelectorAll('.tm-mode').forEach(function(btn) {
      btn.classList.toggle('tm-active', btn.dataset.mode === mode);
    });
    anchorFromCursor();
    configSlider();
  }

  function configSlider() {
    var slider = document.getElementById('tm-slider');
    if (TMS._mode === 'DAY') {
      slider.min = 0;
      slider.max = Math.max(TMS._days.length - 1, 0);
      var dayIdx = 0;
      if (TMS._anchorDay !== null) {
        for (var i = 0; i < TMS._days.length; i++) {
          if (TMS._days[i] <= TMS._anchorDay) dayIdx = i;
        }
      } else { dayIdx = TMS._days.length - 1; }
      slider.value = dayIdx;
    } else if (TMS._mode === 'HR') {
      slider.min = 0; slider.max = 23;
      slider.value = (TMS._anchorHr !== null) ? TMS._anchorHr : 12;
    } else {
      slider.min = 0; slider.max = 59;
      slider.value = new Date(TMS._cursor).getSeconds();
    }
  }

  // ── Slider scrub ──
  function onSlide() {
    var slider = document.getElementById('tm-slider');
    var val = parseInt(slider.value);
    var targetMs;

    if (TMS._mode === 'DAY') {
      var dayIdx = Math.min(val, TMS._days.length - 1);
      TMS._anchorDay = TMS._days[dayIdx];
      targetMs = TMS._anchorDay + 86400000; // end of that day
    } else if (TMS._mode === 'HR') {
      TMS._anchorHr = val;
      if (TMS._anchorDay === null && TMS._days.length) TMS._anchorDay = TMS._days[0];
      targetMs = (TMS._anchorDay || TMS._projectStart) + (val + 1) * 3600000;
    } else {
      if (TMS._anchorDay === null && TMS._days.length) TMS._anchorDay = TMS._days[0];
      if (TMS._anchorHr === null) TMS._anchorHr = 0;
      var anchorMinute = new Date(TMS._cursor).getMinutes();
      targetMs = (TMS._anchorDay || TMS._projectStart) + TMS._anchorHr * 3600000 + anchorMinute * 60000 + (val + 1) * 1000;
    }

    TMS.renderAtTime(targetMs);
  }

  function copyGuids(onlyNew) {
    var guids = {};
    for (var i = 0; i < TMS._ops.length; i++) {
      if (TMS._ops[i].start_ts > TMS._cursor) break;
      if (onlyNew && TMS._ops[i].op_type !== 'ELEMENT_PLACE') continue;
      var g = TMS._ops[i].output_guid;
      if (g) guids[g] = true;
    }
    var list = Object.keys(guids);
    if (!list.length) return;
    if (navigator.clipboard) navigator.clipboard.writeText(list.join('\n'));
    console.log('§TIME_MACHINE copy ' + (onlyNew ? 'new' : 'all') + ' — ' + list.length + ' GUIDs');
  }

  // ── Playback ──
  var _playing = false;
  var _playDir = 0;
  var _playTimer = null;
  // §S277b: Adaptive tick interval — auto-speed by building size + dramatic slowdown at dawn/dusk
  var _activeBuildingCount = 0;  // set in _finishActivate
  function TICK_MS() {
    // Base speed scales with building size: 3.5K→200ms, 48K→150ms, 122K→220ms
    var base = TMS._isLargeBuilding ? 220 : Math.max(140, Math.min(200, 200 - (_activeBuildingCount / 1000)));
    // §S277b: Dramatic slowdown during twilight — widened zone, steeper ramp at horizon
    // Zone: |30°| to |-20°| covers full sunset→dark and dark→sunrise
    if (TMS._sunCycle && TMS._lastElDeg !== undefined) {
      var el = TMS._lastElDeg;
      if (el > -20 && el < 30) {
        // Proximity to horizon (0°): peaks at el=0, fades at edges
        var dist = Math.abs(el);
        var range = el >= 0 ? 30 : 20;  // asymmetric: 30° above, 20° below
        var t = 1 - dist / range;  // 1 at horizon, 0 at edge
        // Smooth ease-in: slow factor 1x→5x with cubic ramp at center
        var slowFactor = 1 + 4 * t * t;
        base = Math.floor(base * slowFactor);
      }
    }
    return base;
  }

  function startPlayback(dir) {
    if (_playing && _playDir === dir) { stopPlayback(); return; }
    stopPlayback();
    _playing = true;
    _playDir = dir;
    // §PERF_INCR_FIX (part 2, live LTU report post-#912): these wrap-around warps mutated _cursor
    // SILENTLY — no render. The next playTick's renderAtTime then derived _prevCursor from the
    // already-warped value, so the delta window was (start, start+1tick]: only hour-0/1 events got
    // applied and the fully-built end-state scene stayed on canvas ("first second of play at Hour 0
    // does not clear"). Same calling-convention bug family as #912 — warp via renderAtTime (full
    // span → mode=full → every mesh updated), never by assigning _cursor directly.
    if (dir < 0 && TMS._cursor <= TMS._projectStart) TMS.renderAtTime(TMS._projectEnd);
    // §S260e: Opening = construction starts from empty, camera orbits for context
    var _willOpen = TMS._camFollow && dir > 0 && TMS._cineStoryboard.length &&
      (TMS._cursor >= TMS._projectEnd || TMS._cursor <= TMS._projectStart + 1);
    if (dir > 0 && TMS._cursor >= TMS._projectEnd) TMS.renderAtTime(TMS._projectStart);

    if (_willOpen) {
      if (TMS._cursor > TMS._projectStart) TMS.renderAtTime(TMS._projectStart); // start empty — construction builds while camera orbits
      var app = TMS.A();
      if (app && app.camera && app.controls) {
        // §S260e: Opening — 10s orbit, camera starts below grade for foundation visibility
        TMS._cineBeat = 'opening';
        TMS._cineTick = 0;
        TMS._cineSceneIdx = 0;
        TMS._cineOpenStart = app.camera.position.clone();
        TMS._cineOpenTarget = app.controls.target.clone();
        // §S260e: Log building extents for self-review
        var _minY = Infinity, _maxY = -Infinity;
        for (var si = 0; si < TMS._cineStoryboard.length; si++) {
          var cy = TMS._cineStoryboard[si].center.y;
          if (cy < _minY) _minY = cy;
          if (cy > _maxY) _maxY = cy;
        }
        console.log('§CINE_OPENING scenes=' + TMS._cineStoryboard.length +
          ' camY=' + TMS._cineOpenStart.y.toFixed(1) +
          ' targetY=' + TMS._cineOpenTarget.y.toFixed(1) +
          ' sceneMinY=' + _minY.toFixed(1) + ' sceneMaxY=' + _maxY.toFixed(1));
        // Find the first scene center for the transition out
        var firstSc = TMS._cineStoryboard[0];
        if (firstSc) {
          TMS._cineNextTarget = firstSc.center;
          TMS._camTarget = firstSc.center.clone();
        }
      }
    }

    var btn = document.getElementById(dir < 0 ? 'tm-rev-btn' : 'tm-fwd-btn');
    if (btn) { btn.textContent = '\u25AE\u25AE'; btn.classList.add('tm-active'); }
    playTick();
  }

  function stopPlayback() {
    _playing = false;
    if (_playTimer) { clearTimeout(_playTimer); _playTimer = null; }
    TMS._gspStopDecay();   // §GROUP_SPARK: in-flight flashes cool out, then park at ZERO sprites
    var rb = document.getElementById('tm-rev-btn');
    var fb = document.getElementById('tm-fwd-btn');
    if (rb) { rb.textContent = '\u25C0'; rb.classList.remove('tm-active'); }
    if (fb) { fb.textContent = '\u25B6'; fb.classList.remove('tm-active'); }
    anchorFromCursor();
    configSlider();
  }

  function playTick() {
    if (!_playing) return;

    TMS._gspRoll++;   // §GROUP_SPARK: one re-roll per playback tick ("randomize among themselves
                  // repeatedly until their duration is reached")
    // §PERF_INCR_FIX: compute the target into a LOCAL var, not the global _cursor, before calling
    // renderAtTime — renderAtTime reads _cursor itself to derive _prevCursor (the delta-skip
    // window's lower bound). Pre-assigning _cursor here made _prevCursor==cursorMs on EVERY tick
    // (zero-width window), so _tmHasEventIn found "no event" for every mesh and the delta path
    // skipped the whole scene every tick once shadows stopped forcing full mode (Phase 2). Confirmed
    // live: real playback log showed span=0h on every tick. renderAtTime sets the global _cursor
    // itself once it has captured the true previous value — do not set it here first.
    var _nextCursor = Math.max(TMS._projectStart, Math.min(TMS._cursor + _playDir * tickMs(), TMS._projectEnd));

    TMS.renderAtTime(_nextCursor);

    // Update slider position during playback
    anchorFromCursor();
    configSlider();

    if ((_playDir < 0 && TMS._cursor <= TMS._projectStart) || (_playDir > 0 && TMS._cursor >= TMS._projectEnd)) {
      stopPlayback();
      return;
    }

    _playTimer = setTimeout(playTick, TICK_MS());
  }
};
