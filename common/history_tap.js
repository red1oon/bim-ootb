// common/history_tap.js — §-stream history tap + granularity KNOB (loose-coupled history pickup)
// Spec: prompts/HISTORY_KNOB_SIGNAL_TAP.md. Witness: W-TAP-KNOB.
// SoC: actions call S(tag,label,payload) — ONE line, no history-specific wiring. The bar SUBSCRIBES
//      to that stream and casts a dial-able net (the knob). Every future feature appears the moment
//      it emits an §EVT. The kernel-op spine (signed/replayable) is UNTOUCHED — this is a read-only tier.
(function (root) {
  'use strict';

  // Named knob stops → which §-tags enter history (pattern SETS, not a brittle per-label whitelist).
  // Shared vocabulary: VIEWER tags + ERP DOC-EVENT tags coexist (a stream only emits its own app's tags,
  // so the union is safe). ERP doc events from the erp/*.js §-census, mapped onto the same breadth ladder:
  //   low  = signed/posted MILESTONES — POSTED (posting), PCLOSE (period close); KERNEL_OP already here.
  //   mid  = + document CHANGES + navigation — CRUD (record edit), RULE (rule edit), SIGN, NAVIGATE, FOCUS_NODE.
  //   high = + lenses/aids — KANBAN, ERP_SEARCH, AD_GRAPH, AD_DATA, ERP_PANEL, TAP.
  var STOPS = {
    low:  ['KERNEL_OP', 'BUILDING_OPEN', 'POSTED', 'PCLOSE'],                                    // milestones
    mid:  ['KERNEL_OP', 'BUILDING_OPEN', 'POSTED', 'PCLOSE', 'FOCUS', 'PICK', 'PHASE_LENS', 'FILTER', 'ROOM',
           'CRUD', 'RULE', 'SIGN', 'NAVIGATE', 'FOCUS_NODE'],                                    // + doc changes + navigation
    high: ['KERNEL_OP', 'BUILDING_OPEN', 'POSTED', 'PCLOSE', 'FOCUS', 'PICK', 'PHASE_LENS', 'FILTER', 'ROOM',
           'CRUD', 'RULE', 'SIGN', 'NAVIGATE', 'FOCUS_NODE',
           'KBD_ROUTE', 'XRAY', 'MAT_SELECT', 'DEPTH',
           'KANBAN', 'ERP_SEARCH', 'AD_GRAPH', 'AD_DATA', 'ERP_PANEL', 'TAP'],                   // + toggles/lenses/aids
    max:  null,                                                              // nearly all (deny still applies)
  };
  // Noise floor: even 'max' never records these tags (render churn / not user intent).
  // Tuned against the live Hospital firehose (§RENDER_LOOP/§IDLE_GATE/§SFX_* dominated the stream).
  // NB: KBD_ROUTE is NOT denied — that's how Alt+X/Z ghost-xray is captured; its noise ("drop key") is
  // dropped by NOISE_LABEL instead. EVT/RESTORE = the tap's OWN output (anti-recursion for the sniffer).
  var DENY_TAG = {
    RENDER_TICK: 1, RENDER_LOOP: 1, IDLE_GATE: 1, HOVER: 1, PANEL_BLUR: 1, PANEL_FOCUS: 1, LOAD_FAIL: 1,
    SFX_NAV: 1, SFX_SUSPEND: 1, SFX_RESUME: 1, SFX_INIT: 1, SFX_CONFIG: 1, FILTER_GUIDS: 1, GRID_SCISSORS: 1,
    KBD_SEQ_ENGINE: 1, KBD_SEQ_FIRE: 1, KBD_SEQ: 1, BBOX: 1, BBOX_PLACEHOLDERS: 1, BBOX_CLEARED: 1,
    EVT: 1, RESTORE: 1, HIST_PUSH: 1, HIST_UNDO: 1, HIST_REDO: 1, KRN_CHAIN: 1, KRN_PERSIST: 1,
    HIST_TAP_DOT: 1, HIST_DEPTH: 1,                                 // the bar's tap-drain echo (anti-recursion)
    // ERP boot/infra + cross-page-log echo (HISTORY_TAP_TO_IDEMPIERE §SESSION — from the REAL idempiere
    // firehose; all infra on the viewer too): VFS=storage-backend probe · AD_PARSER=tip-miss parse churn ·
    // IDEMPIERE=shard load · WHOLE=whole_history's own §WHOLE-REC/NAV/LANDED echo (also recursion-guard).
    VFS: 1, AD_PARSER: 1, IDEMPIERE: 1, WHOLE: 1,
  };
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

  // ── THE PRIMITIVE: field(name, read, write) ────────────────────────────────────────
  // ONE symmetric line makes any view-act restorable: capture = read(), restore = write(value).
  // Lives in the feature's OWN module → history couples to nothing. Adding section/palette/clash =
  // one field() line. Two branches are two field-maps; orthogonal fields (color vs section) UNION
  // with no collision — which is exactly what makes "combine A's color + B's section" effortless.
  var fields = {};                                     // name -> { read, write }
  function field(name, read, write) { fields[name] = { read: read, write: write }; }

  // (compat) the old asymmetric pair, now expressed AS fields — kept so existing hosts don't break.
  var viewProvider = null;
  function setViewProvider(fn) { viewProvider = fn; }
  function registerApplier(key, fn) { field(key, null, fn); }
  function seed(state) { if (state) for (var k in state) ambient[k] = state[k]; }

  // Build the current view vector: stream-ambient toggles + every field's read() (authoritative).
  function buildView() {
    var v = snapView();
    for (var name in fields) { if (fields[name].read) { try { v[name] = fields[name].read(); } catch (e) {} } }
    if (viewProvider) { try { var ext = viewProvider(); for (var k in ext) v[k] = ext[k]; } catch (e) {} }
    return v;
  }
  function currentView() { return buildView(); }       // host stamps its OWN bar entries with this.

  // ── SUBSCRIBERS (HISTORY_KNOB_SIGNAL_TAP §THE WORK step 1) ─────────────────────────
  // The bar subscribes HERE instead of being wired into every feature. _notify() fires after each act
  // enters the stream → the bar drains fresh crumbs into read-only dots. Loose-coupled: the tap knows
  // nothing about the bar. (Anti-recursion: the bar's drain echoes HIST_TAP_DOT/HIST_PUSH, both DENYed.)
  var _observers = [];
  function onFeed(fn) { if (typeof fn === 'function') _observers.push(fn); }
  function _notify() { for (var i = 0; i < _observers.length; i++) { try { _observers[i](); } catch (e) {} } }

  function feed(tag, label, payload) {
    reduceAmbient(tag, label);                          // update the mirror FROM the stream …
    all.push({ tag: tag, label: label, payload: payload || null, view: buildView(), t: all.length });     // … then stamp.
    _notify();
  }

  // ── THE LOG-SNIFFER: recording goes TOTAL with ZERO per-feature wiring ──────────────
  // Every act already prints a §line (Log Mandate). We read that stream instead of instrumenting each
  // feature. A crumb is LIGHTWEIGHT (no view-stamp) — the read-only "what I did" net the knob filters.
  // Boot/load/render LIFECYCLE — logged, but not "what the USER did". Excluded from the sniffer net so
  // "total recording" means total ACTIONS, not total console output. (Explicit S() acts bypass this.)
  var LIFECYCLE = /_(LOADED|READY|INIT|DONE|WIRED?|MODULE|VERSION|REGISTER|CHECK|AUDIT|PROBE|FETCHED|FLUSH|STREAM|DETAIL|MISS_READ|WRITE_OK|QUERY|RESULT|DETECT|RECOLOR|EARLY|FROM_POSITIONS)$|^(UPGRADE|CACHE|BVH|BOOTSTRAP|SPLIT|GEO|DB|DS|SW|PWA|FOG|ENV|SKY|TONE|GROUND|BATCHED|BLOB|INSTANCED|PROGRESSIVE|NORMALS|CENTRES|HASH|DIFF|HELPERS|PANELS|LISTNAV|QUOTA|OFFSET|MAIN|COLOR_MGMT|LENSFLARE|EFFECTS|SITECAM|NLP|MEASURE|SHARE|RECORD|ERROR_REPORTER|GHOSTGLASS|UI_PILL|PILL|MOBILE)/;
  function feedCrumb(tag, label) {
    if (DENY_TAG[tag] || LIFECYCLE.test(tag) || NOISE_LABEL.test(label)) return;  // firehose + lifecycle + intra-tag noise
    var n = all.length;                                             // dedupe vs the last few (explicit S() + its console.log overlap)
    for (var i = n - 1; i >= 0 && i >= n - 3; i--) if (all[i].tag === tag && all[i].label === label) return;
    reduceAmbient(tag, label);
    all.push({ tag: tag, label: label, payload: null, crumb: true, t: all.length });
    _notify();
  }
  var _origLog = null, _sniffing = false;
  var TAGRE = /§([A-Z][A-Z0-9_]*)\s*([^\n]*)/;                      // find §TAG anywhere ("[S205] §SECTION …")
  function sniff(enable) {
    if (enable && !_origLog && typeof console !== 'undefined') {
      _origLog = console.log;
      console.log = function () {
        _origLog.apply(console, arguments);                        // never swallow the real log
        if (_sniffing) return;                                     // anti-recursion
        try {
          _sniffing = true;
          var s = ''; for (var i = 0; i < arguments.length; i++) s += (typeof arguments[i] === 'string' ? arguments[i] : '') + ' ';
          var m = TAGRE.exec(s);
          if (m) feedCrumb(m[1], (m[2] || '').trim().slice(0, 80));
        } catch (e) {} finally { _sniffing = false; }
      };
      try { console.log('§EVT SNIFF|on — recording every §act, deny-filtered'); } catch (e) {}
    } else if (!enable && _origLog) { console.log = _origLog; _origLog = null; }
  }

  // RESTORE — re-apply a recorded view vector: each field's write() reproduces its slice of the look.
  // _applyingView: write() drives the REAL setters (e.g. A.toggleSection) — emitters that record history
  // at those setters must NOT mint a new dot during a restore. They gate on isApplying().
  var _applyingView = false;
  function applyView(view, label) {
    if (!view) return false;
    var applied = [];
    _applyingView = true;
    try {
      for (var k in view) {
        if (fields[k] && fields[k].write) { try { fields[k].write(view[k]); applied.push(k); } catch (e) {} }
      }
    } finally { _applyingView = false; }
    try { console.log('§EVT RESTORE|' + (label || '?') + ' keys=' + applied.join(',')); } catch (e) {}
    return applied.length > 0;
  }
  function isApplying() { return _applyingView; }
  // COMBINE — union two recorded looks into one. Orthogonal fields (color vs section) never collide;
  // a shared field → second wins (last-writer). This is "merge" reduced to a vector union (no 3-way).
  function combineViews() {
    var out = {};
    for (var i = 0; i < arguments.length; i++) { var v = arguments[i] || {}; for (var k in v) out[k] = v[k]; }
    return out;
  }
  function restore(entry) { return entry ? applyView(entry.view, entry.label) : false; }
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
  // historySince(t, extraDeny) — the SUBSCRIBER pull: knob-filtered crumbs newer than high-water `t`,
  // minus any tag the host already records explicitly (extraDeny). Pure → the bar drains this into dots.
  function historySince(t, extraDeny) {
    var pass = level === 'max' ? null : STOPS[level];
    return all.filter(function (e) {
      if (e.t <= t) return false;
      if (DENY_TAG[e.tag]) return false;
      if (extraDeny && extraDeny[e.tag]) return false;
      if (NOISE_LABEL.test(e.label)) return false;
      return pass === null || pass.indexOf(e.tag) !== -1;
    });
  }
  function clear() { all.length = 0; }

  var Tap = { feed: feed, feedCrumb: feedCrumb, sniff: sniff, setKnob: setKnob, getKnob: getKnob, history: history,
              historySince: historySince, onFeed: onFeed, clear: clear,
              field: field, seed: seed, setViewProvider: setViewProvider, registerApplier: registerApplier,
              restore: restore, currentView: currentView, applyView: applyView, combineViews: combineViews,
              isApplying: isApplying,
              _all: all, _fields: fields, STOPS: STOPS };

  // S() — the sink. Keeps the §-debug line you have today AND feeds the tap. No event bus.
  function S(tag, label, payload) {
    try { console.log('§EVT ' + tag + '|' + label); } catch (e) {}
    feed(tag, label, payload);
  }

  root.HistoryTap = Tap;
  root.S = root.S || S;            // don't clobber if a host already defines S
})(typeof window !== 'undefined' ? window : globalThis);
