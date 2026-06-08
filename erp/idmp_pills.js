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
    var cfg = _PB.getConfig();
    var hidden = (cfg.hidden || []).filter(function (id) { return lifecycleIds.indexOf(id) < 0; }); // drop managed ids
    if (stage !== 'pre-client') hidden = hidden.concat(lifecycleIds);                                // in-client → overflow
    _PB.setConfig({ order: cfg.order, hidden: hidden });   // setConfig rebuilds + re-syncs lit states (§D)
    var lc = (stage === 'pre-client') ? 'rail' : 'overflow';
    var shown = _actions.filter(function (a) { return a.pill !== false && hidden.indexOf(a.id) < 0; }).map(function (a) { return a.id; });
    console.log('§IDMP-LIFECYCLE stage=' + stage + ' install=' + lc + ' migrate=' + lc + ' shown=[' + shown.join(',') + ']');
    _evalReveal();   // §P2 — a stage change can tuck pills into the ⋯ (in-client demotes Install/Migrate); re-cue.
  }

  // §P2 self-reveal cue (FRONT_DOOR_PILL_FINISH, user decision 2026-06-09): WHENEVER pills are tucked behind the
  // ⋯ — the bar is collapsed OR the hidden-set is non-empty — peek the trigger so the user is ALWAYS cued that
  // "there's more here". NOT a one-time per-device flag: re-evaluated on mount, on every stage change, and on each
  // ⋯ toggle. KISS — a CSS keyframe class added/removed around the condition (no second animation system).
  function _evalReveal() {
    if (!_PB) return;
    var trigger = document.getElementById('idmp-pill-trigger');
    if (!trigger) return;
    var hiddenN = (_PB.getConfig().hidden || []).length;
    var collapsed = !_PB.isOpen();
    var tucked = hiddenN > 0 || collapsed;                  // pills sitting behind the ⋯
    trigger.classList.remove('idmp-pill-attract');
    if (!tucked) return;                                    // nothing hidden → no cue (don't nag)
    void trigger.offsetWidth;                               // reflow so the animation REPLAYS on each eval
    trigger.classList.add('idmp-pill-attract');
    console.log('§IDMP-REVEAL cue=on hidden=' + hiddenN + ' collapsed=' + collapsed);
  }
  // setStage(s) — host calls on login (in-client) / tenant-picker open (pre-client). No arg → re-read IdmpPillStage().
  function setStage(stage) {
    if (!stage) stage = (typeof window.IdmpPillStage === 'function') ? window.IdmpPillStage() : 'pre-client';
    if (stage === _curStage) return;
    _curStage = stage;
    _applyStage(stage);
  }

  function mount() {
    if (!window.PillBuilder) { console.warn('§IDMP-PILLS PillBuilder missing — not mounted'); return; }
    if (document.getElementById('idmp-pillbar')) return;     // idempotent (one bar)

    fetch('pills_idmp.json?v=26').then(function (r) { return r.json(); }).then(function (mf) {
      var pills = (mf.pills || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      var ACT = window.IdmpPillActions || {};

      var actions = pills.map(function (p) {
        var act = { id: p.id, name: p.name, key: p.key || '' };
        if (p.img) act.img = p.img; else act.icon = _resolveIcon(p) || '';
        if (p.stage) act._stage = p.stage;                   // §C lifecycle tag (carried from the manifest)
        // fn binds BY ID to the host's real handler; honest toast if a handler is missing (NON-INVENT).
        act.fn = ACT[p.id] || (function (name) { return function () { _toast(name + ' — handler not wired'); }; })(p.name);
        var ACTIVE = window.IdmpPillActive || {};            // §D — lit-state binding by id (e.g. redpill = clean mode on)
        if (ACTIVE[p.id]) act.isActive = ACTIVE[p.id];
        return act;
      });
      _actions = actions;

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
        storageKey: 'idmp_pill_config',
        persistent: true   // ⋯ toggles the rail; an outside tap does NOT auto-close (user drives reveal/collapse)
      });
      trigger.addEventListener('pointerup', function (e) { e.stopPropagation(); PB.toggle(); _evalReveal(); });
      // §P2 — re-arm the cue: drop the attract class when the bob ends so it can REPLAY on the next eval.
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
      // Desktop: right-edge vertical strip (matches erp.html's #erp-pillbar idiom).
      '#idmp-pillbar{position:fixed;right:10px;top:50%;transform:translateY(-50%);z-index:1200;' +
        'display:flex;flex-direction:column;align-items:center;gap:8px;}' +
      '#idmp-pill{display:flex;flex-direction:column;gap:6px;max-height:62vh;overflow-y:auto;' +
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
      // §P2 self-reveal cue (FRONT_DOOR_PILL_FINISH): a brief upward peek that fires WHENEVER pills are tucked
      // behind the ⋯ (collapsed bar OR a non-empty hidden-set). Two bobs then SETTLE — an attract, not a loop
      // ([[feedback_pill_icon_consistency]]: subtle, common HMI). Applied to the TRIGGER (the bar itself carries
      // translateY(-50%) for centring, so animating the bar's transform would fight it; the trigger is clean).
      '@keyframes idmp-pill-peek{' +
        '0%,100%{transform:translateY(0);box-shadow:none;}' +
        '25%{transform:translateY(-9px);box-shadow:0 0 0 3px rgba(108,159,255,0.35);}' +
        '55%{transform:translateY(0);}' +
        '78%{transform:translateY(-4px);}' +
      '}' +
      '#idmp-pill-trigger.idmp-pill-attract{animation:idmp-pill-peek 0.85s ease-in-out 2;color:#6c9fff;}' +
      // §P2 (FRONT_DOOR_PILL_FINISH): mobile MIRRORS desktop — a RIGHT-edge VERTICAL strip, NOT the old bottom
      // row dock (user-requested consistency). Same form factor everywhere; the ⋯ keeps one constant right-side
      // spot. Respect the safe-area inset (home indicator / rounded corners) and cap the height so a short phone
      // scrolls instead of overflowing. PillBuilder toggles the pill via inline display:block — a block container
      // with display:flex buttons stacks them vertically (same as desktop), so no inline-flex/nowrap needed.
      '@media (max-width:760px){' +
        '#idmp-pillbar{right:calc(8px + env(safe-area-inset-right,0px));left:auto;bottom:auto;top:50%;' +
          'transform:translateY(-50%);flex-direction:column;align-items:center;justify-content:center;' +
          'gap:8px;padding:0;background:none;border-top:none;}' +
        '#idmp-pill{flex-direction:column;max-height:68vh;overflow-y:auto;overflow-x:hidden;white-space:normal;}' +
        '#idmp-pill button{display:flex;margin:0;}' +
        '#idmp-pill-trigger{order:0;margin-top:2px;}' +
      '}';
    document.head.appendChild(s);
  }

  window.IdmpPills = { mount: mount, setStage: setStage, _evalReveal: _evalReveal, builder: null };
})();
