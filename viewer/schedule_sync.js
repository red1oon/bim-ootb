// schedule_sync.js — §SE-4 / §SE-D: live cross-surface schedule sync ("both are folds of ONE log").
//
// Each surface (editor tab, Viewer Time Machine) has its OWN in-memory sql.js db. There is no shared
// store, so the sync mechanism is to REPLAY each signed schedule op on the receiver's db via the EXACT
// SAME ScheduleAuthor verb the sender used — the broadcast carries the op, the receiver re-folds it.
// One-way edit→watch is the MVP; because every surface is a symmetric fold, bidirectional is free.
//
// Pure `applyOp` is DOM-free + node-testable (W-SCHED-SYNC). `create()` wraps BroadcastChannel('bim_4d').
(function (global) {
  'use strict';
  var CHANNEL = 'bim_4d';        // the rail main.js already listens on (S240)
  var TYPE = '4D_SCHED_EDIT';

  function SA() { return global.ScheduleAuthor || (typeof globalThis !== 'undefined' ? globalThis.ScheduleAuthor : null); }

  // applyOp(db, op) — replay one schedule op on a receiver db via the matching ScheduleAuthor verb.
  // PURE (no DOM, no channel). Returns the verb's result, or {ok:false, reason} for bad input.
  function applyOp(db, op) {
    if (!db || !op || !SA()) return { ok: false, reason: 'no_db_or_engine' };
    switch (op.op) {
      case 'move':   return SA().moveTask(db, op.taskId, op.start);
      case 'add':    return SA().addDependency(db, op.predId, op.succId, op.type || 'FS', op.lag || 0);
      case 'remove': return SA().removeDependency(db, op.predId, op.succId);
      case 'retype': return SA().updateDependency(db, op.predId, op.succId, { type: op.value });
      case 'lag':    return SA().updateDependency(db, op.predId, op.succId, { lag: op.value });
      case 'cpm':    return SA().computeCpm(db, op.schedule, {});
      // §SE-WBS structural edits — deterministic (explicit taskId / stable child ids) so peers converge.
      case 'addtask':   return SA().addTask(db, op.schedId, { taskId: op.taskId, name: op.name, wbsParent: op.wbsParent });
      case 'breakdown': return SA().breakdownByAttribute(db, op.schedId, op.taskId, op.attr);
      case 'reparent':  return SA().reparentTask(db, op.schedId, op.taskId, op.wbsParent);
      default:       return { ok: false, reason: 'unknown_op:' + (op.op || '?') };
    }
  }

  function newTabId() {
    try { return 'tab_' + Math.random().toString(36).slice(2, 9); } catch (e) { return 'tab_x'; }
  }

  // create({tabId?}) → a sync handle bound to BroadcastChannel('bim_4d').
  function create(opts) {
    opts = opts || {};
    var tabId = opts.tabId || newTabId();
    var bc = null;
    try { if (typeof BroadcastChannel !== 'undefined') bc = new BroadcastChannel(CHANNEL); } catch (e) {}
    return {
      tabId: tabId,
      // emit(op) — broadcast one signed op (tagged with this tab's id so peers can echo-guard).
      emit: function (op) {
        if (!bc || !op) return;
        try { bc.postMessage(Object.assign({ type: TYPE, from: tabId }, op)); } catch (e) {}
      },
      // listen(db, onApplied) — replay inbound ops (not our own) on db; call onApplied(op, result).
      listen: function (db, onApplied) {
        if (!bc) return;
        bc.addEventListener('message', function (ev) {
          var m = ev.data;
          if (!m || m.type !== TYPE || m.from === tabId) return;   // ignore foreign types + own echo
          var res = applyOp(db, m);
          console.log('§SE_SYNC recv op=' + m.op + ' from=' + m.from + ' ok=' + !!(res && res.ok !== false));
          if (onApplied) try { onApplied(m, res); } catch (e) { console.warn('§SE_SYNC onApplied', e); }
        });
      },
      close: function () { try { if (bc) bc.close(); } catch (e) {} }
    };
  }

  var API = { applyOp: applyOp, create: create, CHANNEL: CHANNEL, TYPE: TYPE };
  if (typeof window !== 'undefined') window.ScheduleSync = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.ScheduleSync = API;
  console.log('§SCHEDULE_SYNC_LOADED v1');
})(typeof self !== 'undefined' ? self : this);
