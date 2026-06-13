/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * idmp_pills.js — mounts the iDempiere renderer's bottom/side bar from pills_idmp.json.
 *   The SIBLING of erp_pills.js: SAME PillBuilder renderer (pill_builder.js, used as-is),
 *   surface-specific manifest (GATE-1 — the action sets differ from erp.html).
 *
 * Registration layer, NOT a renderer rewrite. The manifest (pills_idmp.json) is DATA; this module
 *   1. fetches pills_idmp.json,
 *   2. resolves each icon from the verbatim icon set (window.ICONS / icons.js) — never inlines art,
 *   3. binds fn BY ID to the REAL existing idempiere.html handlers (window.IdmpPillActions),
 *   4. instantiates the existing PillBuilder (pill_builder.js, used as-is) — incl. the ⋯ collapse +
 *      per-user {order, hidden} persistence,
 *   5. emits §IDMP-PILLS counting the DOM buttons it actually built (handAuthored=0).
 *
 * Retires the hand-rolled #idmp-pillrail (ERP_BOTTOM_BAR_AND_LIFECYCLE.md §A; the standing
 * "no controls outside the pill" principle, §PILL-REGISTRY).
 *
 * The host (idempiere.html) sets window.IdmpPillActions then calls window.IdmpPills.mount() —
 * NOT auto-mount: the handlers live in the host IIFE and must be published first (deterministic order).
 */
(function () {
  'use strict';

  function _toast(msg) {
    var t = document.createElement('div');
    t.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:9999;' +
      'padding:10px 22px;border-radius:8px;font-size:13px;font-family:system-ui,sans-serif;transition:opacity .5s;' +
      'background:rgba(40,44,58,0.95);color:#cdd6e4;border:1px solid rgba(255,255,255,0.1);pointer-events:none;';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.style.opacity = '0'; }, 2600);
    setTimeout(function () { if (t.parentNode) t.remove(); }, 3100);
  }

  function _resolveIcon(p) {
    if (p.img) return null;                                  // img form handled by pill_builder
    var ICONS = window.ICONS || {};
    var ic = ICONS[p.icon];
    if (!ic) { console.warn('§IDMP_PILL_ICON_MISS id=' + p.id + ' icon=' + p.icon); return null; }
    return ic.svg;
  }

  // HISTORY_KNOB_DIAL.md — the W pill's long-press drawer: two stacked chips above the pill.
  //   Z (docHist) = open THIS page's dot-timeline bar (IdmpHistory) · bomb = clear history (warns first).
  function _histIconSvg(name, color) {
    var ic = (window.ICONS || {})[name];
    return '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" ' +
      'stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ic ? ic.svg : '') + '</svg>';
  }
  function _clearIdmpHistory() {
    // The page timeline lives in localStorage / the in-memory bar, NOT the SW cache — "clear cache" never
    // wiped it. The bomb is the one switch that does.
    if (window.confirm('Clear history for this page AND the world timeline?\nThis wipes the session timeline and cannot be undone.')) {
      try { Object.keys(localStorage).filter(function (k) { return k.indexOf('idmp.hist') === 0 || k.indexOf('bim.hist') === 0; }).forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {}
      if (window.IdmpHistory && window.IdmpHistory.clear) window.IdmpHistory.clear();
      // §IDMP-HIST world: the cross-page WorldHistory log is its OWN store (bim.docHistory) — the bim.hist
      // prefix above does NOT match it. Clear it explicitly + refresh the open overlay so it shows empty.
      var world = 'n/a';
      if (window.WholeHistory && WholeHistory.clear) {
        try { WholeHistory.clear(); world = 'cleared'; } catch (e) { world = 'err'; }
        try { var p = document.getElementById('whole-hist-panel'); if (p && p.classList.contains('show') && WholeHistory.open) WholeHistory.open(); } catch (e) {}
      }
      console.log('§IDMP-HIST clear via=bomb confirmed world=' + world);
    } else { console.log('§IDMP-HIST clear via=bomb cancelled'); }
  }
  function _worldDrawer(srcBtn) {
    var open = document.getElementById('idmp-whist-drawer');
    if (open) { open.remove(); return; }
    if (!srcBtn) return;
    var r = srcBtn.getBoundingClientRect();
    var d = document.createElement('div'); d.id = 'idmp-whist-drawer';
    // UPWARD column — bomb at top (outside/far = safety), Z at bottom (near pill = first reach)
    d.style.cssText = 'position:fixed;z-index:10000;display:flex;flex-direction:column;align-items:center;gap:6px;' +
      'bottom:' + (window.innerHeight - r.top + 6) + 'px;left:' + Math.max(8, r.left) + 'px;';
    function chip(name, title, color, onTap) {
      var b = document.createElement('button'); b.title = title; b.innerHTML = _histIconSvg(name, color);
      b.style.cssText = 'width:44px;height:44px;display:flex;align-items:center;justify-content:center;border:none;' +
        'border-radius:8px;background:rgba(20,20,40,0.85);color:' + color + ';cursor:pointer;' +
        'backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:0 2px 12px rgba(0,0,0,0.4);';
      b.addEventListener('pointerup', function (e) { e.stopPropagation(); onTap(); var dd = document.getElementById('idmp-whist-drawer'); if (dd) dd.remove(); });
      return b;
    }
    d.appendChild(chip('bomb', 'Clear history…', '#ff6b6b', _clearIdmpHistory));
    d.appendChild(chip('docHist', 'Page history (Z) — this page\'s dot timeline', '#6c9fff',
      function () { if (window.IdmpHistory && window.IdmpHistory.toggleBar) window.IdmpHistory.toggleBar(); else if (window.IdmpHistory) window.IdmpHistory.render(); }));
    document.body.appendChild(d);
    setTimeout(function () {
      var off = function (ev) { var dd = document.getElementById('idmp-whist-drawer'); if (dd && !dd.contains(ev.target)) { dd.remove(); document.removeEventListener('pointerdown', off, true); } };
      document.addEventListener('pointerdown', off, true);
    }, 0);
    console.log('§IDMP-PILL drawer=worldhist items=Z,bomb');
  }

  // §C lifecycle gate — pills tagged stage:"pre-client" (Install/Migrate) are SHOWN only before a client is
  // entered (login/tenant-picker), HIDDEN once a client is committed (GATE-2). PillBuilder._build skips
  // act.pill===false, so we toggle that flag + rebuild — no second rail, no DOM teardown.
  var _PB = null, _actions = null, _curStage = null;
  function _applyStage(stage) {
    if (!_PB || !_actions) return;
    // §C lifecycle (agreed onboarding UX): pre-client = lifecycle pills on the primary rail (the login card
    // also carries Install/Migrate); in-client = DEMOTE to the ⋯ overflow — still reachable/restorable, NOT
    // gone (so a 2nd tenant can be onboarded without a foot-gun on the live rail). We toggle the builder's
    // `hidden` set (off-rail-but-in-overflow) rather than pill=false (gone), preserving the user's own choices.
    var lifecycleIds = _actions.filter(function (a) { return a._stage === 'pre-client'; }).map(function (a) { return a.id; });
    _actions.forEach(function (a) { if (a._stage === 'pre-client') a.pill = undefined; });  // always a real pill
    // §AD-GATE — pills tagged showWhen:"posting-doc" mirror iDempiere's AD `Posted` Button field: they may
    // surface ONLY when a posting document (a table carrying that field) is open. The host answers via
    // window.IdmpPillDocGate(); absent/false → the pill is fully off the bar (pill=false), not just overflow.
    var _docOk = (typeof window.IdmpPillDocGate === 'function') ? !!window.IdmpPillDocGate() : false;
    _actions.forEach(function (a) { if (a._showWhen === 'posting-doc') a.pill = _docOk ? undefined : false; });
    // §AD-GATE — showWhen:"pos-station" (POS_ADDON_SPEC §P-1): the POS pill surfaces only when the tenant
    // carries a c_pos row (data-gated like Posting-Preview). Host answers via window.IdmpPillPosGate().
    var _posOk = (typeof window.IdmpPillPosGate === 'function') ? !!window.IdmpPillPosGate() : false;
    _actions.forEach(function (a) { if (a._showWhen === 'pos-station') a.pill = _posOk ? undefined : false; });
    var cfg = _PB.getConfig();
    var hidden = (cfg.hidden || []).filter(function (id) { return lifecycleIds.indexOf(id) < 0; }); // drop managed ids
    if (stage !== 'pre-client') hidden = hidden.concat(lifecycleIds);                                // in-client → overflow
    _PB.setConfig({ order: cfg.order, hidden: hidden });   // setConfig rebuilds + re-syncs lit states (§D)
    var lc = (stage === 'pre-client') ? 'rail' : 'overflow';
    var shown = _actions.filter(function (a) { return a.pill !== false && hidden.indexOf(a.id) < 0; }).map(function (a) { return a.id; });
    console.log('§IDMP-LIFECYCLE stage=' + stage + ' install=' + lc + ' migrate=' + lc + ' shown=[' + shown.join(',') + ']');
    _evalReveal();   // §P2 — a stage change can tuck pills into the ⋯ (in-client demotes Install/Migrate); re-cue.
  }

  // §P2/§P4-3 self-reveal cue (FRONT_DOOR_PILL_FINISH). WHENEVER pills are tucked behind the ⋯ (the bar is
  // collapsed OR the hidden-set is non-empty), cue the user that "there's more here". §P4-3 (user wrap
  // 2026-06-09): the cue is now a TRUE PEEK — the actual hidden PILLS briefly SLIDE OUT and back, not just a
  // ⋯ bob (with collapse-by-default ALL pills sit behind the ⋯, so a bob alone never showed the icons). We
  // momentarily show the real strip (#idmp-pill display:block + a slide keyframe) WITHOUT flipping PillBuilder's
  // open state (_pillOpen stays false), then restore display:none on animationend — so it re-collapses cleanly
  // and the user's own ⋯ tap still opens from the closed state. The ⋯ keeps a companion glow. No second
  // animation system: a CSS keyframe class added/removed around the condition.
  // Boot/stage CUE (user wrap 2026-06-09): the reveal itself is now CLICK-DRIVEN and STAYS open (PillBuilder
  // _toggle rises the strip up on every ⋯ tap — see `.pill-revealing`). The old auto STRIP-PEEK that slid the
  // pills out and RE-COLLAPSED is REMOVED (user: "and not collapse"). All this does now is a gentle ⋯ bob while
  // the bar is collapsed, so the user notices there's more behind the ⋯ — it never moves/recollapses the strip.
  function _evalReveal() {
    if (!_PB) return;
    var trigger = document.getElementById('idmp-pill-trigger');
    if (!trigger) return;
    trigger.classList.remove('idmp-pill-attract');
    if (_PB.isOpen()) return;                               // rail already revealed → no need to cue
    void trigger.offsetWidth;                               // reflow so the bob REPLAYS on each eval
    trigger.classList.add('idmp-pill-attract');             // a brief glow/bob on the ⋯ — "tap to reveal"
    console.log('§PILL-CUE attract=⋯ collapsed=true hidden=' + (_PB.getConfig().hidden || []).length);
  }
  // setStage(s) — host calls on login (in-client) / tenant-picker open (pre-client). No arg → re-read IdmpPillStage().
  function setStage(stage) {
    if (!stage) stage = (typeof window.IdmpPillStage === 'function') ? window.IdmpPillStage() : 'pre-client';
    if (stage === _curStage) return;
    _curStage = stage;
    _applyStage(stage);
  }

  // setDocContext() — host calls on every tab/record open so showWhen:"posting-doc" pills re-evaluate against
  // window.IdmpPillDocGate() (AD: is a posting document open?). Recomputes the bar at the current stage.
  function setDocContext() { if (_PB && _actions) _applyStage(_curStage || 'pre-client'); }

  function mount() {
    if (!window.PillBuilder) { console.warn('§IDMP-PILLS PillBuilder missing — not mounted'); return; }
    if (document.getElementById('idmp-pillbar')) return;     // idempotent (one bar)

    fetch('pills_idmp.json?v=30').then(function (r) { return r.json(); }).then(function (mf) {
      var pills = (mf.pills || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      var ACT = window.IdmpPillActions || {};

      var actions = pills.map(function (p) {
        var act = { id: p.id, name: p.name, key: p.key || '' };
        if (p.img) act.img = p.img; else act.icon = _resolveIcon(p) || '';
        if (p.stage) act._stage = p.stage;                   // §C lifecycle tag (carried from the manifest)
        if (p.showWhen) act._showWhen = p.showWhen;           // §AD-GATE condition (e.g. "posting-doc") carried from the manifest
        // fn binds BY ID to the host's real handler; honest toast if a handler is missing (NON-INVENT).
        act.fn = ACT[p.id] || (function (name) { return function () { _toast(name + ' — handler not wired'); }; })(p.name);
        var ACTIVE = window.IdmpPillActive || {};            // §D — lit-state binding by id (e.g. redpill = clean mode on)
        if (ACTIVE[p.id]) act.isActive = ACTIVE[p.id];
        // HISTORY_KNOB_DIAL.md — the W pill long-presses into a drawer (Z page-timeline + bomb clear).
        if (p.id === 'worldhist') act.hold = function (btn) { _worldDrawer(btn); };
        return act;
      });
      _actions = actions;
      // §AD-GATE — apply the posting-doc condition at BUILD (not just on later sync): with no document open
      // the host's IdmpPillDocGate() is false → showWhen:"posting-doc" pills (Posting-Preview) start OFF the bar.
      var _docOk0 = (typeof window.IdmpPillDocGate === 'function') ? !!window.IdmpPillDocGate() : false;
      actions.forEach(function (a) { if (a._showWhen === 'posting-doc') a.pill = _docOk0 ? undefined : false; });
      // §AD-GATE — pos-station at BUILD too (POS pill off the bar until a c_pos tenant is open)
      var _posOk0 = (typeof window.IdmpPillPosGate === 'function') ? !!window.IdmpPillPosGate() : false;
      actions.forEach(function (a) { if (a._showWhen === 'pos-station') a.pill = _posOk0 ? undefined : false; });

      _injectStyle();
      var wrap = document.createElement('div');
      wrap.id = 'idmp-pillbar';
      var pill = document.createElement('div');
      pill.id = 'idmp-pill';
      var trigger = document.createElement('button');
      trigger.id = 'idmp-pill-trigger';
      trigger.title = 'Pills';
      // FLAT (horizontal) kebab so OUR ⋯ differs from Android's own vertical ⋮ system menu (user-requested).
      var _mv = (window.ICONS && window.ICONS.moreHoriz) ? window.ICONS.moreHoriz.svg
        : '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>';
      trigger.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + _mv + '</svg>';
      wrap.appendChild(pill);
      wrap.appendChild(trigger);
      document.body.appendChild(wrap);

      var PB = window.PillBuilder({
        pill: pill, trigger: trigger, APP: {}, actions: actions,
        order: actions.map(function (a) { return a.id; }),
        storageKey: 'idmp_pill_config'
        // NON-persistent (user wrap 2026-06-09: "click outside closes — intuitive + standard"): a ⋯ tap toggles;
        // tapping a pill INSIDE keeps it open; tapping OUTSIDE (canvas/record) collapses it — consistent with the
        // BIM viewer. Still stays open until you act away from it (no auto-recollapse after the reveal).
      });
      // ⋯ tap → toggle. Opening RISES the strip up (PillBuilder _toggle `.pill-revealing`); re-tapping (or a tap
      // outside the strip) collapses it back down to the bottom-right ⋯. No bob after a deliberate tap.
      trigger.addEventListener('pointerup', function (e) { e.stopPropagation(); PB.toggle(); });
      // Re-arm the ⋯ bob: drop the attract class when it ends so it can REPLAY on the next eval.
      trigger.addEventListener('animationend', function () { trigger.classList.remove('idmp-pill-attract'); });
      _PB = PB;
      window.IdmpPills.builder = PB;

      // §P3 (FRONT_DOOR_PILL_FINISH, user decision 2026-06-09): COLLAPSED BY DEFAULT on BOTH desktop and mobile —
      // the clean resting state is just the ⋯; pills reveal ONLY when the user taps it. Keep the UI clean, leave
      // the reveal to user intuition (the peek cue invites the tap). PB.close() (not toggle) sets display:none AND
      // _pillOpen=false together, so the FIRST ⋯ tap opens cleanly (no off-by-one). Also kills the mobile
      // expanded-strip-over-content overlap: the strip only appears on demand.
      PB.close();

      // §C — apply the initial session stage (pre-client at boot: Install/Migrate belong on the rail behind the ⋯).
      _curStage = null; setStage();
      PB.sync();   // §D — restore lit states (e.g. red pill) so they're correct the moment the user opens the rail
      _evalReveal();   // §P2 — collapsed at boot ⇒ the cue peeks the ⋯ once, inviting the first tap (both platforms)

      var mounted = pill.querySelectorAll('button[id^="pill-"]').length;
      var hidden = (PB.getConfig().hidden || []).length;
      console.log('§IDMP-PILLS source=registry pills=' + pills.length + ' handAuthored=0' +
        ' mountedButtons=' + mounted + ' overflow=⋯ hidden=' + hidden +
        ' stage=' + _curStage + ' ids=[' + pills.map(function (p) { return p.id; }).join(',') + ']');
    }).catch(function (e) {
      console.warn('§IDMP-PILLS fetch/mount failed: ' + e.message);
    });
  }

  function _injectStyle() {
    if (document.getElementById('idmp-pill-style')) return;
    var s = document.createElement('style');
    s.id = 'idmp-pill-style';
    s.textContent =
      // BOTTOM-RIGHT dock (user wrap 2026-06-09 — consistent with the BIM viewer's #mobile-bar/#mobile-pill):
      // the ⋯ rests at the bottom-right corner and STAYS there; the strip (DOM-ordered ABOVE the trigger in a
      // bottom-anchored column) RISES UP from behind it on tap. `bottom` is pinned so collapsing never moves the
      // ⋯ to mid-screen — it remains where it is. Was right-edge VERTICALLY-CENTRED (top:50%/translateY(-50%)).
      '#idmp-pillbar{position:fixed;right:10px;bottom:16px;top:auto;transform:none;z-index:1200;' +
        'display:flex;flex-direction:column;align-items:center;gap:8px;}' +
      '#idmp-pill{display:flex;flex-direction:column;gap:6px;max-height:calc(100vh - 120px);overflow-y:auto;' +
        'padding:6px;border-radius:16px;background:rgba(20,22,32,0.82);' +
        'border:1px solid rgba(255,255,255,0.08);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);}' +
      '#idmp-pill::-webkit-scrollbar{width:0;}' +
      '#idmp-pill button{width:40px;height:40px;min-height:40px;display:flex;align-items:center;justify-content:center;' +
        'border:none;border-radius:10px;background:transparent;color:#cdd6e4;cursor:pointer;padding:0;}' +
      '#idmp-pill button:hover{background:rgba(108,159,255,0.16);color:#6c9fff;}' +
      '#idmp-pill button.active{background:rgba(108,159,255,0.24);color:#6c9fff;}' +
      '#idmp-pill button img{border-radius:4px;}' +
      '#idmp-pill-trigger{width:32px;height:32px;min-height:32px;border-radius:50%;cursor:pointer;' +
        'background:rgba(20,22,32,0.82);color:#9aa4b8;font-size:18px;line-height:1;display:flex;' +
        'align-items:center;justify-content:center;' +
        'border:1px solid rgba(255,255,255,0.08);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);}' +
      // Reveal-UP: on each open the strip rises into view from behind the bottom ⋯ (translateY 18px → 0) then
      // STAYS open (PillBuilder _toggle adds `.pill-revealing`; persistent dock — only a ⋯ re-tap collapses it).
      '@keyframes pill-rise{from{transform:translateY(18px);opacity:0;}to{transform:translateY(0);opacity:1;}}' +
      '#idmp-pill.pill-revealing{animation:pill-rise 0.42s cubic-bezier(.2,.85,.25,1);}' +
      // Boot/stage CUE: a gentle upward bob on the ⋯ while collapsed — "there's more here, tap me". Two bobs
      // then settle (subtle, common HMI — [[feedback_pill_icon_consistency]]); never recollapses the strip.
      '@keyframes idmp-pill-peek{' +
        '0%,100%{transform:translateY(0);box-shadow:none;}' +
        '25%{transform:translateY(-9px);box-shadow:0 0 0 3px rgba(108,159,255,0.35);}' +
        '55%{transform:translateY(0);}' +
        '78%{transform:translateY(-4px);}' +
      '}' +
      '#idmp-pill-trigger.idmp-pill-attract{animation:idmp-pill-peek 0.85s ease-in-out 2;color:#6c9fff;}' +
      // Mobile mirrors desktop — same BOTTOM-RIGHT dock, just a touch tighter + safe-area inset (home indicator).
      '@media (max-width:760px){' +
        '#idmp-pillbar{right:calc(10px + env(safe-area-inset-right,0px));' +
          'bottom:calc(12px + env(safe-area-inset-bottom,0px));top:auto;transform:none;' +
          'flex-direction:column;align-items:center;gap:8px;}' +
        '#idmp-pill{max-height:calc(100vh - 110px);overflow-y:auto;overflow-x:hidden;}' +
      '}';
    document.head.appendChild(s);
  }

  window.IdmpPills = { mount: mount, setStage: setStage, setDocContext: setDocContext, _evalReveal: _evalReveal, builder: null };
})();
