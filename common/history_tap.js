// common/history_tap.js — §-stream history tap + granularity KNOB (loose-coupled history pickup)
// Spec: prompts/HISTORY_KNOB_SIGNAL_TAP.md. Witness: W-TAP-KNOB.
// SoC: actions call S(tag,label,payload) — ONE line, no history-specific wiring. The bar SUBSCRIBES
//      to that stream and casts a dial-able net (the knob). Every future feature appears the moment
//      it emits an §EVT. The kernel-op spine (signed/replayable) is UNTOUCHED — this is a read-only tier.
(function (root) {
  'use strict';

  // Named knob stops → which §-tags enter history (pattern SETS, not a brittle per-label whitelist).
  var STOPS = {
    low:  ['KERNEL_OP', 'BUILDING_OPEN'],                                    // milestones
    mid:  ['KERNEL_OP', 'BUILDING_OPEN', 'FOCUS', 'PICK', 'PHASE_LENS', 'FILTER', 'ROOM'], // + navigation
    high: ['KERNEL_OP', 'BUILDING_OPEN', 'FOCUS', 'PICK', 'PHASE_LENS', 'FILTER', 'ROOM',
           'KBD_ROUTE', 'XRAY', 'MAT_SELECT', 'DEPTH'],                      // + toggles/aids
    max:  null,                                                              // nearly all (deny still applies)
  };
  // Noise floor: even 'max' never records these tags (render churn / not user intent).
  var DENY_TAG = { RENDER_TICK: 1, IDLE_GATE: 1, HOVER: 1, PANEL_BLUR: 1, LOAD_FAIL: 1 };
  // Intra-tag noise: same tag, but the line is internal routing/error, not a user action.
  var NOISE_LABEL = /pass-through|no-op|error|blocked|unregistered|drop key|guard/i;

  var all = [];                 // every fed event — re-dialing re-filters, never loses data
  var level = 'mid';

  // ── AMBIENT VIEW-STATE (the "depth" axis) ──────────────────────────────────────────
  // The tap watches the SAME §-stream and keeps a running mirror of toggle state. Every
  // recorded entry is STAMPED with this state, so "selected Door" remembers x-ray/bbox was on.
  // Derived from the stream → zero feature coupling. Restore re-applies entry.view.
  var ambient = { xray: false, ghost: false, isolation: null, discipline: null, phase: null };
  var REDUCERS = [
    { m: function (t, l) { return t === 'KBD_ROUTE' && /Alt\+Z → xray/.test(l); },        a: function (s) { s.xray = !s.xray; } },
    { m: function (t, l) { return t === 'KBD_ROUTE' && /Alt\+X → ghost-xray/.test(l); },   a: function (s) { s.ghost = !s.ghost; } },
    { m: function (t)    { return t === 'PHASE_LENS'; },  a: function (s, l) { s.phase = l; } },
    { m: function (t)    { return t === 'FILTER'; },      a: function (s, l) { s.discipline = l; } },
  ];
  function reduceAmbient(tag, label) {
    for (var i = 0; i < REDUCERS.length; i++) if (REDUCERS[i].m(tag, label)) REDUCERS[i].a(ambient, label);
  }
  function snapView() { var c = {}; for (var k in ambient) c[k] = ambient[k]; return c; }

  // (1) Camera & other NON-stream state come from one optional pull-hook — loose-coupled, host opt-in.
  var viewProvider = null;                              // () => ({ cam:{p,t}, … })  registered by host
  function setViewProvider(fn) { viewProvider = fn; }
  // (2) Seed ambient once from current state (so a toggle ON before the tap woke up isn't missed).
  function seed(state) { if (state) for (var k in state) ambient[k] = state[k]; }

  function feed(tag, label, payload) {
    reduceAmbient(tag, label);                          // update the mirror FROM the stream …
    var v = snapView();
    if (viewProvider) { try { var ext = viewProvider(); for (var k in ext) v[k] = ext[k]; } catch (e) {} } // … + pull camera …
    all.push({ tag: tag, label: label, payload: payload || null, view: v, t: all.length });               // … then stamp.
  }

  // (3) RESTORE — re-apply a recorded entry's view vector to the live scene.
  // Appliers are registered by the host (one per state key) — the tap stays scene-agnostic.
  var appliers = {};                                   // key -> fn(value)
  function registerApplier(key, fn) { appliers[key] = fn; }
  function restore(entry) {
    if (!entry || !entry.view) return false;
    var applied = [];
    for (var k in entry.view) {
      if (appliers[k]) { try { appliers[k](entry.view[k]); applied.push(k); } catch (e) {} }
    }
    try { console.log('§EVT RESTORE|' + (entry.label || '?') + ' keys=' + applied.join(',')); } catch (e) {}
    return true;
  }
  function setKnob(l) { if (STOPS.hasOwnProperty(l) || l === 'max') level = l; }
  function getKnob() { return level; }
  function history() {
    var pass = level === 'max' ? null : STOPS[level];
    return all.filter(function (e) {
      if (DENY_TAG[e.tag]) return false;
      if (NOISE_LABEL.test(e.label)) return false;
      return pass === null || pass.indexOf(e.tag) !== -1;
    });
  }
  function clear() { all.length = 0; }

  var Tap = { feed: feed, setKnob: setKnob, getKnob: getKnob, history: history, clear: clear,
              seed: seed, setViewProvider: setViewProvider, registerApplier: registerApplier, restore: restore,
              _all: all, STOPS: STOPS };

  // S() — the sink. Keeps the §-debug line you have today AND feeds the tap. No event bus.
  function S(tag, label, payload) {
    try { console.log('§EVT ' + tag + '|' + label); } catch (e) {}
    feed(tag, label, payload);
  }

  root.HistoryTap = Tap;
  root.S = root.S || S;            // don't clobber if a host already defines S
})(typeof window !== 'undefined' ? window : globalThis);
