// witness_tm_panel_resize_h.js — prompts/4D_SCHEDULE_PERFECTION.md §TM_PANEL_RESIZE_H.
//
// THE ISSUE THIS PROVES OR DISPROVES:
//   User report 2026-08-05: "make the lower border pullable expandable too, not just the right
//   border" — only the drawer's right edge (tm-panel-resize-grip, width) was draggable; the panel
//   had no bottom-edge handle at all. This witness fails if the bottom grip is missing, unwired, or
//   grows the panel in the wrong direction (a resize handle that shrinks when dragged the way a user
//   expects to grow is worse than none — same class of bug the width grip's own comment warns about).
//
//   UPDATED 2026-08-06 — real regression caught live by the user AFTER the above shipped: "it seems
//   there is an inner frame for the gantt chart panel... it does not be max". The first cut grew the
//   OUTER _panel shell only; the actual content (#tm-gantt-box) has its own separate height cap and
//   never grew, so the drag looked like it worked but never uncrammed anything. This witness now
//   asserts the grip drives #tm-gantt-box / _ganttBoxH — the SAME target the internal top-strip grip
//   (wireGanttResize) already owns — not the outer panel.
//
//   Static-source check, same style as witness_gantt_palette.js: reads the values straight out of
//   viewer/time_machine.js so it tests what actually ships, not a copy that can drift.
var fs = require('fs');
var path = require('path');
var SRC = path.join(__dirname, 'viewer', 'time_machine.js');
var txt = fs.readFileSync(SRC, 'utf8');

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('§W-PRH PASS  ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('§W-PRH FAIL  ' + name + (detail ? '  ' + detail : '')); }
}

// 1 — the bottom grip DOM element exists, spans the full width, and is the vertical-resize cursor.
var gripIdx = txt.indexOf('tm-panel-resize-grip-b');
check('G-PRH-1 bottom-grip-element-present', gripIdx >= 0);
var gripSlice = gripIdx >= 0 ? txt.slice(gripIdx - 80, gripIdx + 200) : '';
check('G-PRH-2 bottom-grip-is-ns-resize', /cursor:ns-resize/.test(gripSlice));
check('G-PRH-3 bottom-grip-spans-full-width', /left:0;right:0;bottom:-3px;height:8px/.test(gripSlice));

// 2 — the wiring function exists, is called at panel-build time (alongside the existing width
//     wiring, not instead of it), and both grips end up wired.
check('G-PRH-4 wirePanelResizeHeight-defined', /function wirePanelResizeHeight\s*\(\)/.test(txt));
check('G-PRH-5 wirePanelResizeHeight-called', /wirePanelResize\(\);\s*\n\s*wirePanelResizeHeight\(\);/.test(txt));
check('G-PRH-6 width-grip-still-wired', /function wirePanelResize\s*\(\)/.test(txt));

// 3 — direction: dragging the BOTTOM edge DOWN (larger clientY) must GROW height. This is the
//     opposite sign to the existing internal top-strip grip (wireGanttResize, startY - e.clientY)
//     because that one sits ABOVE its content; a bottom-edge handle sits BELOW its content, so the
//     sign must flip or the drawer would shrink exactly when the user expects it to grow.
var fnIdx = txt.indexOf('function wirePanelResizeHeight');
var fnSlice = fnIdx >= 0 ? txt.slice(fnIdx, fnIdx + 1700) : '';
check('G-PRH-7 grows-on-downward-drag', /startH \+ \(e\.clientY - startY\)/.test(fnSlice),
  'expected startH + (e.clientY - startY), i.e. dragging down increases height');
check('G-PRH-8 no-inverted-sign-leftover', !/startY - e\.clientY/.test(fnSlice));

// 4 — clamped, not unbounded (an unclamped drag can push the panel off-screen or to zero height).
//     Same bounds as wireGanttResize's own clamp — deliberately reused, not reinvented.
check('G-PRH-9 min-height-clamped', /Math\.max\(80,/.test(fnSlice));
check('G-PRH-10 max-height-clamped-to-viewport', /window\.innerHeight \* 0\.75/.test(fnSlice));

// 5 — a real witness log line ships, same convention as §TM_PANEL_RESIZE's own width log, so the
//     drag is provable from console output (§ FUNDAMENTAL LAW: log values, not a screenshot).
check('G-PRH-11 logs-tm-panel-resize-h', /console\.log\('§TM_PANEL_RESIZE_H height=' \+ _ganttBoxH \+/.test(fnSlice));

// 6 — CSS hover/gripping affordance mirrors the existing width grip (visual parity, not a
//     second-class handle).
check('G-PRH-12 hover-style-present', txt.indexOf('#tm-panel-resize-grip-b:hover,#tm-panel-resize-grip-b.tm-gripping') >= 0);

// 7 — THE REGRESSION ITSELF: the grip must target #tm-gantt-box / _ganttBoxH (the real content,
//     same variable wireGanttResize already writes), NOT the outer _panel shell. This is the exact
//     check that would have caught the shipped bug before it reached the user.
check('G-PRH-13 targets-inner-gantt-box-not-outer-panel',
  /var box = document\.getElementById\('tm-gantt-box'\)/.test(fnSlice) &&
  /_ganttBoxH = h/.test(fnSlice) && /box\.style\.maxHeight = h \+ 'px'/.test(fnSlice));
check('G-PRH-14 no-outer-panel-maxheight-leftover',
  !/_panel\.style\.maxHeight/.test(fnSlice) && !/_panel\.style\.overflowY/.test(fnSlice));

// 8 — shares real state with the top-strip grip: both must write the SAME _ganttBoxH variable, and
//     that value must be the one drawGanttMini/re-render actually applies (time_machine.js's own
//     `if (_ganttBoxH) box.style.maxHeight = ...` re-apply-on-redraw line), so a resize survives a
//     data refresh instead of being silently reset.
check('G-PRH-15 shared-ganttBoxH-with-top-strip-grip',
  (txt.match(/_ganttBoxH = h/g) || []).length >= 2);
check('G-PRH-16 reapplied-on-redraw', /if \(_ganttBoxH\) box\.style\.maxHeight = _ganttBoxH \+ 'px'/.test(txt));

console.log('§W-PRH RESULT pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
