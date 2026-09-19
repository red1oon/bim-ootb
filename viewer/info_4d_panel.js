/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// info_4d_panel.js — §S7 §S7-OPEN (bim-compiler prompts/TM_4D5D_VARIANCE_LANE.md): renders the
// `#info-4d` block of `#info-panel` — "when does THIS element get built".
//
// WHY THIS FILE EXISTS AT ALL (it is an EXTRACTION, not a new surface). §S7-DO item 2 told the
// original leg to put this renderer next to `_showClassCost` in find_erp_push.js, which it did, and
// which was correct for the Find-panel pick path. But find_erp_push.js lives inside `APP.loadNavigate()`
// — a LAZY bundle (main.js ~:187) that does not load until the user opens Find. So on a plain
// 3D-canvas click, `A._show4DWindow` simply did not exist yet and nothing rendered: the headline
// interaction of the whole stage ("click an element, see when it is built") was unreachable until
// Find had been opened once. That is §S7-OPEN, measured and recorded before this fix.
//
// The renderer needs NOTHING from the Find panel — only ScheduleRead4D.windowForGuid,
// ScheduleAuthor.activeSchedule, A.db and the #info-4d DOM node. So it moves HERE, into a module
// viewer.html loads eagerly, and BOTH call sites delegate to it. Deliberately NOT copied into
// picking.js: a second copy of this logic is exactly the "copy it rather than import it" convention
// this project already identified as the reason one support-predicate bug had to be found and fixed
// three separate times (4D_SCHEDULE_PERFECTION.md, "Architectural finding").
//
// GRAIN WARNING — do not "simplify" the wording below. The date is TASK grain, never element grain
// (§S7-GRAIN, measured: Hospital = 41 distinct windows over 63,415 elements; the biggest single task
// holds 9,545 of them). The task's NAME is what makes that coverage legible; a bare date reads as
// "this door is built on the 20th", which the data cannot support.
// DUAL-MODE, the find_erp_push.js/gantt_model.js convention: attaches to the browser global AND
// exports for require(). A Node witness must register it the same way the browser does
// (`global.Info4DPanel = require('../info_4d_panel.js')`) — find_erp_push.js's delegating
// _show4DWindow looks it up on the shared global, never via require, so the two call sites cannot
// drift onto two different copies.
(function (global) {
  'use strict';

  /**
   * Fill (or honestly hide) the #info-4d block for one element.
   * @param {object} A - the APP object (needs A.db).
   * @param {string} guid - the picked element's guid.
   * @returns {boolean} true if a window was rendered, false on any honest no-op.
   */
  function render(A, guid) {
    var box = document.getElementById('info-4d');
    if (!box) return false;
    box.style.display = 'none';
    var RD = global.ScheduleRead4D, SA = global.ScheduleAuthor;
    // module/db not ready — honest no-op, same guard style as find_erp_push.js's _ensureErpDb
    if (!RD || !RD.windowForGuid || !A || !A.db) return false;
    var sched = null;
    try { sched = (SA && SA.activeSchedule) ? SA.activeSchedule(A.db) : null; } catch (e) { sched = null; }
    if (!sched || !sched.id) {
      console.log('§4D_INFO_PANEL guid="' + guid + '" skip reason=no_active_schedule');
      return false;
    }
    var win = null;
    // Pass scheduleAuthor explicitly — the SAME override seam windowForGuid documents. Costs nothing
    // in the browser (SA is already window.ScheduleAuthor there) and keeps this function witnessable
    // headlessly, where schedule_read_4d.js's own `global` is the module's exports object.
    try { win = RD.windowForGuid(A.db, guid, { scheduleAuthor: SA }); } catch (e) { win = null; }
    var html = '<div style="color:#4fc3f7;font-weight:bold;margin-bottom:3px">Construction window</div>';
    if (!win) {
      // A schedule exists but this element has no dated task. windowForGuid already logged the exact
      // reason (guid_not_in_task/undated) via §4D_ON_ELEMENT_GATE; this line tells the USER why the
      // block is not showing dates, instead of rendering an empty box that looks broken. It already
      // names the schedule inline, so no separate provenance line is added on this branch.
      html += '<div style="color:#888;font-size:11px">Not yet assigned to a dated task in "' +
        (sched.name || sched.id) + '".</div>';
    } else {
      // §S7-INJECT HONESTY — provenance lives in schedules.name ('Default Programme (auto-generated)'
      // vs the wizard's 'Authored Schedule (4D template)'/'Authored Schedule…'), never in schedule_id
      // (stays 'SCH_AUTHORED' either way — see schedule_inject.js header) or any other column. Render
      // it right beside the real dates so a generated default can never be mistaken for the
      // project's committed programme just because this block also shows a normal-looking window.
      if (sched.name) {
        html += '<div style="color:#888;font-size:10px;margin-bottom:2px" title="Which schedule this window comes from">' +
          sched.name + '</div>';
      }
      var crit = win.isCritical ? ' <b style="color:#ff6b6b">(critical path)</b>' : '';
      html += '<div><span class="label">Task</span>: <span class="value">' + win.name + '</span></div>';
      html += '<div><span class="label">Window</span>: <span class="value">' + win.startDate + ' → ' + win.finishDate + crit + '</span></div>';
      if (win.resource) html += '<div><span class="label">Trade</span>: <span class="value">' + win.resource + '</span></div>';
      if (win.totalFloat != null && win.totalFloat !== '') html += '<div><span class="label">Float</span>: <span class="value">' + win.totalFloat + ' d</span></div>';
    }
    box.innerHTML = html;
    box.style.display = 'block';
    var ipnl = document.getElementById('info-panel'); if (ipnl) ipnl.style.display = 'block';
    console.log('§4D_INFO_PANEL guid="' + guid + '" hit=' + !!win +
      (win ? (' task=' + win.taskId + ' start=' + win.startDate + ' finish=' + win.finishDate) : ''));
    return !!win;
  }

  global.Info4DPanel = { render: render };
  if (typeof module !== 'undefined' && module.exports) module.exports = { render: render };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
