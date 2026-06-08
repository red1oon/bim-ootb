// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// help_overlay.js — ReadMe/ShowMe HELP overlay (READSHOWME_DYNAMIC_SPEC.md — D3).
// A separated behavior layer (unobtrusive JS / Stimulus-style data-hooks / AOP cross-cutting concern):
// it attaches to glassbowl's bubbles BY KEY, reads the keyed _TRL-style store help_ops.json, and never
// edits the renderer. Opt-in (NeedHelp?), dismissible, dynamic (badges + steps generated from the store).
// Reuses page globals: setTrace/setFocus/openDossierTab + N/idx/project/px/py/k/radius + helpJive/navJive/showmeJive.
(function () {
  // ════════════════════════════════════════════════════════════════════════
  // PURE COACH CORE — no DOM. The guide's WHOLE vocabulary as data, domain-free
  // and key-addressed (READSHOWME_DYNAMIC_SPEC.md §guide-vocabulary). Exported for
  // the headless §-witness (W-HELP-COACH). INVARIANT: asserts NOTHING (§Invariant).
  // ════════════════════════════════════════════════════════════════════════

  // coachPlan — PURE: the ordered key-addressed intents ShowMe drives for a step,
  // and the assert count (ALWAYS 0 — the guide narrates, the data speaks).
  //  reveal: every step brings its element into view.
  //  kind:'process' steps ALSO pulse the Process affordance (reveal-only, never
  //  auto-fired) and highlight the live status bar. No posting logic, no branching.
  function coachPlan(step) {
    step = step || {};
    var drove = ['reveal'];
    if (step.kind === 'process') { drove.push('pulse'); drove.push('highlight:statusbar'); }
    return { drove: drove, asserts: 0, key: step.key || null, target: step.target || null };
  }

  // legalNext — the only keys "on path" from a step: itself + the next step in order.
  function legalNext(curStep, steps) {
    var keys = {};
    if (!curStep) return keys;
    keys[curStep.key] = 1;
    var i = steps ? steps.indexOf(curStep) : -1;
    if (i >= 0 && steps[i + 1]) keys[steps[i + 1].key] = 1;
    return keys;
  }

  // isVeer — PURE (§veer): an action key is a veer iff it is neither the current step
  // nor its legal Next. A veer SUSPENDS (no kill, no timeline tag) — see suspend().
  function isVeer(curStep, steps, actionKey) {
    if (!curStep || actionKey == null) return false;
    return !legalNext(curStep, steps)[actionKey];
  }

  // nextGate — PURE (§Next-gated-on-success): after a Process gesture on a live draft, decide whether
  // Next may proceed. Reads ONLY the live docstatus the page reported + the step's expected success
  // status (default 'CO'). Three outcomes, all read the same dumb way — compares live vs expected, never
  // asks WHY (that is the Process layer's logic):
  //   CO (== expect) → advance (Next proceeds, timeline tag fires)
  //   IP             → hold   (re-highlight, NO advance, NO tag) — legitimate business non-completion
  //   exception      → errorReport (NO advance, NO tag) — hand to the single ErrorReport class
  //   none / other   → hold   (not yet processed, or an unexpected status; never advance on a non-success)
  // The read-mode (no-gesture) bypass is the CALLER's concern (§Edit-mode gate), not this pure decision.
  function nextGate(liveStatus, expect) {
    expect = expect || 'CO';
    if (liveStatus === 'exception') return { advanced: false, gate: 'exception', action: 'errorReport' };
    if (liveStatus === expect)      return { advanced: true,  gate: liveStatus, action: 'advance' };
    if (liveStatus === 'IP')        return { advanced: false, gate: 'IP', action: 'hold' };
    return { advanced: false, gate: liveStatus || 'none', action: 'hold' };
  }

  var COACH = { coachPlan: coachPlan, legalNext: legalNext, isVeer: isVeer, nextGate: nextGate };

  // node (headless witness): export the pure core and stop — no DOM to attach.
  if (typeof module !== 'undefined' && module.exports) { module.exports = COACH; return; }
  if (typeof document === 'undefined') return;

  // ════════════════════════════════════════════════════════════════════════
  // HOST ADAPTER (the lift — UI_OVERLAY_GOVERNANCE §host contract / docs/TourGuideHostContract.md).
  // The overlay needs 3 things from its host: a MOUNT container, a NAV interface (drive ShowMe), and a
  // LOCATE projection (key → screen pos, to place numbered badges + the card). The DEFAULTS below REPRODUCE
  // today's glassbowl behavior VERBATIM (document.body + window.setFocus/setTrace/openDossierTab + the SVG
  // projection N/idx/project/px/py/k/radius), so an un-init'd page (glassbowl) is behaviorally diff=0.
  // A host (idempiere) calls window.__help.init({host, nav}) to REBIND — same module, different chrome. NO FORK.
  // ════════════════════════════════════════════════════════════════════════
  var HOST = document.body;
  // glassbowl projection: key → {x,y,r,rRaw} or null (off-screen/unknown). r = screen radius (card gap),
  // rRaw = unclamped node radius (badge offset) — preserves the ORIGINAL screenPt + positionBadges maths.
  function gbLocate(key) {
    try {
      if (key && typeof N !== 'undefined' && typeof idx !== 'undefined' && idx[key] != null && typeof project === 'function') {
        var n = N[idx[key]]; project(n); var kk = (typeof k === 'number' ? k : 1);
        var rr = (typeof radius === 'function' ? radius(n) : 14);
        return { x: px + n.sx * kk, y: py + n.sy * kk, r: Math.max(12, rr * kk), rRaw: rr };
      }
    } catch (e) {}
    return null;
  }
  var NAV = {
    trace:   function (on)       { if (window.setTrace) window.setTrace(on); },
    focus:   function (key)      { if (window.setFocus) window.setFocus(key); },
    openTab: function (key, tab) { if (window.openDossierTab) window.openDossierTab(key, tab); },
    has:     function (key)      { return typeof idx !== 'undefined' && idx[key] != null; },
    locate:  gbLocate,
    jive:    function (which, dir) {
      try {
        if (which === 'help'   && typeof helpJive   === 'function') helpJive();
        if (which === 'nav'    && typeof navJive    === 'function') navJive(dir);
        if (which === 'showme' && typeof showmeJive === 'function') showmeJive();
      } catch (e) {}
    }
  };
  // init — a host rebinds the adapter: re-parent the chrome into its container and merge its nav fns.
  function init(opts) {
    opts = opts || {};
    if (opts.host && opts.host !== HOST) {
      HOST = opts.host;
      if (wrap.parentNode !== HOST) HOST.appendChild(wrap);
      if (card.parentNode !== HOST) HOST.appendChild(card);
    }
    if (opts.nav) { for (var key in opts.nav) { if (opts.nav[key]) NAV[key] = opts.nav[key]; } }
    console.log('§TOUR overlay=help_overlay host=' + (opts.hostName || 'custom') + ' forked=0 mounts=2 init=ok');
    return window.__help;
  }

  // ── injected CSS (self-contained module) ──
  var css = document.createElement('style');
  css.textContent =
   '#needHelpWrap{position:fixed;top:10px;right:14px;z-index:70;display:flex;align-items:center;gap:6px;background:#13202b;border:1px solid #2f4654;border-radius:16px;padding:5px 11px;font:13px system-ui;color:#cfe8ee;cursor:pointer;user-select:none}' +
   '#needHelpWrap:hover{border-color:#56d6e0}#needHelpWrap input{accent-color:#56d6e0;cursor:pointer}' +
   '.help-q{position:fixed;z-index:69;width:20px;height:20px;border-radius:50%;background:#1668a8;color:#fff;font:700 13px system-ui;display:none;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 1px 5px rgba(0,0,0,.5);border:1px solid #7fd6e0;transition:transform .1s}' +
   '.help-q:hover{transform:scale(1.18);background:#1f86d0}' +
   '#helpCard{position:fixed;z-index:71;width:min(280px,84vw);background:#0f1a22;border:1px solid #2f4654;border-radius:11px;padding:11px 13px;color:#dbe9ee;font:13px/1.45 system-ui;box-shadow:0 6px 22px rgba(0,0,0,.55);display:none}' +
   '#helpCard.open{display:block}#helpCard .hcnum{font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:#6f93a2}' +
   '#helpCard .hctitle{font-weight:600;font-size:15px;margin:2px 0 4px;color:#eaf6fa}#helpCard .hctip{margin:0 0 8px;color:#bcd2da}' +
   '#helpCard figure{margin:8px 0;border:1px solid #294150;border-radius:8px;overflow:hidden}#helpCard figure img{display:block;width:100%}' +
   '#helpCard figure figcaption{font-size:11px;color:#8fb3c0;padding:5px 8px;background:#0b141b}' +
   '#helpCard .figph{border:1px dashed #3a5a6a;border-radius:8px;padding:14px;color:#7f9aa8;font-style:italic;font-size:12.5px;text-align:center;background:#0d1820;margin:8px 0}' +
   '#helpCard .hcnav{display:flex;align-items:center;gap:7px;margin-top:10px}' +
   '#helpCard a.hcmore{color:#7fd6e0;text-decoration:none;font-size:12.5px}#helpCard a.hcmore:hover{text-decoration:underline}' +
   '#helpCard button.hcb{background:#16252f;color:#cfe8ee;border:1px solid #2f4654;border-radius:8px;padding:6px 12px;font:13px system-ui;cursor:pointer}' +
   '#helpCard button.hcb:hover:not(:disabled){border-color:#56d6e0}#helpCard button.hcb:disabled{opacity:.35;cursor:default}' +
   '#helpCard button.hcshow{background:#16493a;border-color:#2f6d5a;color:#bff0dd}#helpCard button.hcshow:hover{border-color:#56d6e0}' +
   '#helpCard .hcgrow{flex:1}#helpCard .hcx{position:absolute;right:10px;top:8px;color:#6f93a2;cursor:pointer}' +
   '#helpCard{cursor:grab}#helpCard.dragging{cursor:grabbing;user-select:none}#helpCard button,#helpCard a,#helpCard .hcx{cursor:pointer}';
  document.head.appendChild(css);

  var HELP = null, STEPS = [], cur = -1, on = false, raf = 0, badges = [], dragged = false;
  var suspended = false, resumeIdx = -1;
  var README_BASE = 'https://red1oon.github.io/BIMCompiler/';

  var wrap = document.createElement('label'); wrap.id = 'needHelpWrap';
  wrap.innerHTML = '<input type="checkbox" id="needHelpCk"><span>NeedHelp?</span>';
  HOST.appendChild(wrap);                                  // HOST defaults to document.body (glassbowl); init() re-parents
  var card = document.createElement('div'); card.id = 'helpCard'; HOST.appendChild(card);
  var ck = document.getElementById('needHelpCk');

  function readmeUrl(ref) { if (!ref) return '#'; var p = String(ref).split('#'); return README_BASE + p[0].replace(/\.md$/, '') + '/' + (p[1] ? ('#' + p[1]) : ''); }

  // render paraHTML, swapping [[FIG x.y: advice]] -> the auto-snapped figure, with a placeholder fallback.
  function renderPara(step) {
    var html = step.paraHTML || '';
    return html.replace(/\[\[FIG\s*([0-9.]+)\s*:\s*([^\]]*)\]\]/g, function (m, fig, advice) {
      var src = 'figs/o2c_' + step.ordinal + '_' + step.key + '.png';
      var safe = advice.replace(/'/g, '’');
      return '<figure><img src="' + src + '" alt="Figure ' + fig + '" ' +
        'onerror="this.parentNode.outerHTML=&quot;<div class=figph>Figure ' + fig + ' &mdash; ' + safe + '</div>&quot;">' +
        '<figcaption>Figure ' + fig + ' — ' + advice + '</figcaption></figure>';
    });
  }

  // ── key-addressed intent bus (governance: neither overlay imports the other; UI_OVERLAY_GOVERNANCE.md).
  // The guide EMITS intents; the CRUD overlay (which owns the Process ▶ ring) reacts to them by KEY.
  function emit(verb, detail) {
    detail = detail || {}; detail.verb = verb;
    try { window.dispatchEvent(new CustomEvent('overlay:guide', { detail: detail })); } catch (e) {}
  }

  // highlightStatusBar — point at the live #docStatusBar and READ what it says; assert NOTHING
  // (§Invariant: the guide quotes the bar verbatim, never claims "it worked"). Returns the live text.
  function highlightStatusBar() {
    var bar = document.getElementById('docStatusBar');
    var live = bar ? (bar.textContent || '').replace(/\s+/g, ' ').trim() : '';
    if (bar) { bar.classList.add('pulse'); setTimeout(function () { bar.classList.remove('pulse'); }, 2200); }
    if (card.classList.contains('open') && !card.querySelector('.hcstatus')) {
      var note = document.createElement('div'); note.className = 'hctip hcstatus';
      note.textContent = 'Note the status' + (live ? ' — it reads: “' + live + '”.' : '.');
      var nav = card.querySelector('.hcnav');
      if (nav) card.insertBefore(note, nav); else card.appendChild(note);
    }
    return live;
  }

  // ShowMe — type-aware drive. Bubbles here; field/list/tab dispatch is the erp.html extension point (req 11).
  // A kind:'process' step ALSO drives the coach vocabulary (READSHOWME §guide-vocabulary): reveal+pulse the
  // Process affordance (key-addressed, never auto-fired) and highlight the live status bar — asserts NOTHING.
  function showMe(step) {
    NAV.jive('showme');
    NAV.trace(true);
    if (step.kind === 'overview' || !step.target) { console.log('§SHOWME op=' + step.op + ' drove=[trace] kind=overview via=host-globals'); return; }
    NAV.focus(step.target);
    if (step.tab) NAV.openTab(step.target, step.tab);
    positionCard();
    if (step.kind === 'process') {
      var plan = COACH.coachPlan(step);
      emit('pulse', { kind: 'process', key: step.key });   // reveal-only; CRUD overlay fans out + pulses ▶
      var live = highlightStatusBar();
      console.log('§HELP coach key=' + step.key + ' drove=[' + plan.drove.join(',') + '] asserts=' + plan.asserts + ' barRead=' + JSON.stringify(live));
    }
    console.log('§SHOWME op=' + step.op + ' key=' + step.key + ' drove=[trace,focus:' + step.target + (step.tab ? ',tab:' + step.tab : '') + '] via=host-globals invented=0');
  }

  // screen point {x,y,r,rRaw} for a key — DELEGATES to the host adapter's locate (glassbowl projection by
  // default, idempiere getBoundingClientRect after init). null if off-screen/unknown.
  function screenPt(target) { return NAV.locate(target); }
  // all chain bubbles the card must NOT obscure (every step's target on screen).
  function chainPts() { var a = []; STEPS.forEach(function (s) { var p = screenPt(s.target); if (p) a.push(p); }); return a; }
  // count how many chain bubbles a card rect (L,T,w,h) would cover (expanded by each bubble's radius).
  function overlapScore(L, T, w, h, pts) {
    var n = 0;
    for (var i = 0; i < pts.length; i++) { var p = pts[i]; if (p.x >= L - p.r && p.x <= L + w + p.r && p.y >= T - p.r && p.y <= T + h + p.r) n++; }
    return n;
  }

  // anchor the card near the step's bubble but STEER CLEAR of the lit chain (req: don't obscure the
  // bubbles in the chain). Tries right/left/below/above the target, picks the placement covering the
  // fewest chain bubbles. Once the user drags it (dragged=true) we leave it parked where they put it.
  function positionCard() {
    if (dragged) return;                                  // user moved it to a clearer spot — respect it
    var s = STEPS[cur]; if (!s) return;
    var cw = card.offsetWidth || 300, chh = card.offsetHeight || 200;
    var tgt = screenPt(s.target);
    if (!tgt) { card.style.left = '50%'; card.style.top = '14%'; card.style.transform = 'translateX(-50%)'; return; }
    var pts = chainPts(), g = 24;
    var cands = [
      { L: tgt.x + tgt.r + g,           T: tgt.y - chh / 2 },           // right (preferred)
      { L: tgt.x - tgt.r - g - cw,      T: tgt.y - chh / 2 },           // left
      { L: tgt.x - cw / 2,              T: tgt.y + tgt.r + g },         // below
      { L: tgt.x - cw / 2,              T: tgt.y - tgt.r - g - chh }    // above
    ];
    var best = null, bestScore = Infinity;
    cands.forEach(function (c) {
      var L = Math.max(8, Math.min(window.innerWidth - cw - 8, c.L));
      var T = Math.max(8, Math.min(window.innerHeight - chh - 8, c.T));
      var sc = overlapScore(L, T, cw, chh, pts);          // earlier candidates win ties (strict <)
      if (sc < bestScore) { bestScore = sc; best = { L: L, T: T }; }
    });
    card.style.transform = 'none';
    card.style.left = best.L + 'px';
    card.style.top = best.T + 'px';
  }

  // draggable (req: user can move the card to a clearer spot). Capture-after-move so a click on the
  // card body doesn't jitter; drags starting on a button/link/✕ are ignored (those keep their action).
  function setupDrag() {
    var sx = 0, sy = 0, ox = 0, oy = 0, down = false, moving = false;
    card.addEventListener('pointerdown', function (ev) {
      if (ev.target.closest && ev.target.closest('button, a, .hcx')) return;
      down = true; moving = false; sx = ev.clientX; sy = ev.clientY;
      var rc = card.getBoundingClientRect(); ox = rc.left; oy = rc.top;
    });
    window.addEventListener('pointermove', function (ev) {
      if (!down) return;
      var dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!moving) { if (Math.abs(dx) + Math.abs(dy) < 4) return; moving = true; dragged = true; card.style.transform = 'none'; card.classList.add('dragging'); }
      card.style.left = Math.max(8, Math.min(window.innerWidth - card.offsetWidth - 8, ox + dx)) + 'px';
      card.style.top = Math.max(8, Math.min(window.innerHeight - card.offsetHeight - 8, oy + dy)) + 'px';
    });
    window.addEventListener('pointerup', function () {
      if (down && moving) console.log('§HELP card dragged spot=(' + card.style.left + ',' + card.style.top + ')');
      down = false; moving = false; card.classList.remove('dragging');
    });
  }

  function renderCard() {
    var s = STEPS[cur]; if (!s) return;
    card.innerHTML = '<span class=hcx title=close>✕</span>' +
      '<div class=hcnum>Help ' + (cur + 1) + ' / ' + STEPS.length + ' · ' + (s.op || '') + '</div>' +
      '<div class=hctitle>' + s.title + '</div>' +
      '<div class=hctip>' + (s.tip || '') + '</div>' +
      '<div class=hcnav><a class=hcmore href="' + readmeUrl(s.readmeAnchor) + '" target=_blank rel=noopener>Read more →</a>' +
      '<span class=hcgrow></span>' +
      '<button class=hcb id=hcPrev ' + (cur === 0 ? 'disabled' : '') + '>◀</button>' +
      '<button class="hcb hcshow" id=hcShow>▶ ShowMe</button>' +
      '<button class=hcb id=hcNext ' + (cur === STEPS.length - 1 ? 'disabled' : '') + '>Next ▶</button></div>';
    card.querySelector('.hcx').addEventListener('click', close);
    card.querySelector('#hcShow').addEventListener('click', function () { showMe(s); });
    var pv = card.querySelector('#hcPrev'), nx = card.querySelector('#hcNext');
    if (pv) pv.addEventListener('click', function () { goTo(cur - 1, true); });
    if (nx) nx.addEventListener('click', function () { tryNext(); });
    positionCard();
  }

  // ── Next gated on SUCCESS (READSHOWME §Next-gated-on-success) ────────────────
  // editModeOn — read the live Edit-mode toggle (#crudModeCk) BY ID — same statusbar-kind DOM addressing
  // the guide already uses for #docStatusBar; no import of the CRUD overlay (governance preserved).
  function editModeOn() { var c = document.getElementById('crudModeCk'); return !!(c && c.checked); }
  // readBarStatus — the live docstatus the page reported, read off #docStatusBar's class (s-XX). '' if none.
  function readBarStatus() {
    var bar = document.getElementById('docStatusBar');
    if (!bar || !/\bshow\b/.test(bar.className)) return '';
    var m = bar.className.match(/\bs-([A-Za-z]+)/);
    return m ? m[1] : '';
  }
  // errorReportStep — Process threw: halt with ONE canned step and call the SINGLE ErrorReport class if the
  // page exposes it. The guide does NOT re-implement error handling (READSHOWME §error-path) — the callable
  // ErrorReport factor-out (error_reporter.js → bim-ootb/viewer/erp/) is the flagged precondition for E3.
  function errorReportStep() {
    var note = card.querySelector('.hcstatus');
    if (!note && card.classList.contains('open')) {
      note = document.createElement('div'); note.className = 'hctip hcstatus';
      var nav = card.querySelector('.hcnav'); if (nav) card.insertBefore(note, nav); else card.appendChild(note);
    }
    if (note) note.textContent = 'Process raised an error — ErrorReport ready. Submit.';
    try { if (typeof window.reportBug === 'function') window.reportBug(); } catch (e) {}
  }
  // tryNext — the Next gesture (await/acknowledge). On a live process step it is GATED on the real status
  // bar: advance only on CO; IP/none → re-highlight + HOLD (no advance, no tag); exception → ErrorReport.
  // In read/trace mode (Edit-mode OFF) there is no gesture and no gate — Next is a free acknowledgment.
  function tryNext() {
    var s = STEPS[cur];
    if (s && s.kind === 'process' && editModeOn()) {
      var live = readBarStatus() || 'none';
      var g = COACH.nextGate(live, s.expect || 'CO');
      console.log('§HELP next gate docstatus=' + g.gate + ' advanced=' + (g.advanced ? 'Y' : 'N'));
      if (!g.advanced) { if (g.action === 'errorReport') errorReportStep(); else highlightStatusBar(); return; }
    }
    goTo(cur + 1, true);
  }

  function goTo(i, nav) {
    if (i < 0 || i >= STEPS.length) return;
    var dir = i > cur ? 1 : -1; cur = i;
    if (nav) NAV.jive('nav', dir);
    card.classList.add('open'); renderCard();
    console.log('§READSHOWME step=' + i + ' key=' + STEPS[i].key + ' target=' + (STEPS[i].target || '-') + ' para=' + STEPS[i].readmeAnchor);
  }
  function open(i) { NAV.jive('help'); goTo(i == null ? 0 : i, false); }
  function close() { card.classList.remove('open'); dragged = false; }   // reopening re-anchors to the chain

  function buildSteps() {
    STEPS = Object.keys(HELP).filter(function (k) { return k !== '__meta'; })
      .map(function (k) { var e = HELP[k]; e.key = k; return e; })
      .sort(function (a, b) { return (a.ordinal || 0) - (b.ordinal || 0); });
  }
  function buildBadges() {
    clearBadges();
    STEPS.forEach(function (s, i) {
      if (!s.target || !NAV.has(s.target)) return;          // host KNOWS this key → it gets a numbered badge
      var q = document.createElement('div'); q.className = 'help-q'; q.textContent = String(s.ordinal);
      q.title = 'Help ' + s.ordinal + ': ' + s.title; q.setAttribute('data-i', i);
      q.addEventListener('click', function (ev) { ev.stopPropagation(); open(i); });
      HOST.appendChild(q); badges.push({ el: q, step: s });
    });
  }
  function clearBadges() { badges.forEach(function (b) { if (b.el.parentNode) b.el.parentNode.removeChild(b.el); }); badges = []; }
  function positionBadges() {
    if (!on) return;
    badges.forEach(function (b) {
      var p = NAV.locate(b.step.target);                    // null → currently off-screen → hide
      if (!p) { b.el.style.display = 'none'; return; }
      var rRaw = (p.rRaw != null ? p.rRaw : p.r);           // hosts may report a single radius
      b.el.style.display = 'flex';
      b.el.style.left = (p.x + rRaw * 0.7) + 'px';
      b.el.style.top = (p.y - rRaw - 10) + 'px';
    });
  }
  function loop() { if (!on) { raf = 0; return; } positionBadges(); if (card.classList.contains('open')) positionCard(); raf = requestAnimationFrame(loop); }

  function enable() {
    on = true; suspended = false; resumeIdx = -1;
    function go() { buildSteps(); buildBadges(); if (!raf) raf = requestAnimationFrame(loop); open(0); console.log('§HELP mode=on steps=' + STEPS.length + ' badges=' + badges.length); }
    if (HELP) { go(); return; }
    fetch('help_ops.json').then(function (r) { return r.json(); }).then(function (j) { HELP = j; go(); })
      .catch(function (e) { console.warn('§HELP load-error', e && e.message); });
  }
  function disable() { on = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } clearBadges(); close(); console.log('§HELP mode=off'); }
  ck.addEventListener('change', function () { if (ck.checked) enable(); else disable(); });

  // setOps(store) — ADDITIVE host extension (NO FORK; same spirit as init()). A host (idempiere) context-gates
  // the ShowMe content by handing the overlay a different ops store per stage: pre-client = an onboarding store,
  // in-client = the AD tour. store=null/undefined RESTORES the default (fetch help_ops.json). Callers that never
  // invoke it (glassbowl, erp.html) are behaviorally diff=0. If ShowMe is currently on, rebuild from the new store.
  function setOps(store) {
    HELP = store || null;
    cur = -1;
    console.log('§HELP setOps store=' + (store ? ('custom/' + Object.keys(store).filter(function (k) { return k !== '__meta'; }).length) : 'default'));
    if (on) { disable(); enable(); }
  }

  // ── veer (§veer): an off-path action on the shared bus SUSPENDS the guide — it does NOT kill Help.
  // NeedHelp? stays ON (badges live); no §VIEWLOG / timeline tag (a veer is not a Next); the step number
  // is preserved for Resume. If the veered-to element has its own ReadMe step, meet them where they landed.
  function suspend(actionKey) {
    if (suspended) return;
    suspended = true; resumeIdx = cur;
    console.log('§HELP veer→suspend needhelp=' + (on ? 'on' : 'off') + ' tag=unchanged actionKey=' + actionKey);
    var j = -1; for (var i = 0; i < STEPS.length; i++) { if (STEPS[i].key === actionKey) { j = i; break; } }
    if (j >= 0) goTo(j, false);   // surface the veered-to card; nav=false → no navJive → no timeline tag
  }
  function resume() {
    if (!suspended) return;
    suspended = false;
    if (resumeIdx >= 0) goTo(resumeIdx, false);
    console.log('§HELP resume idx=' + resumeIdx);
  }
  // listen for CRUD verb gestures on the bus; off-path → suspend. Same-step / legal-Next gestures pass.
  window.addEventListener('overlay:action', function (ev) {
    if (!on) return;
    var key = ev && ev.detail && ev.detail.key; var s = STEPS[cur];
    if (s && COACH.isVeer(s, STEPS, key)) suspend(key);
  });

  setupDrag();
  window.__help = { init: init, enable: enable, disable: disable, goTo: goTo, suspend: suspend, resume: resume,
                    showMe: showMe, setOps: setOps, suspended: function () { return suspended; }, steps: function () { return STEPS; },
                    adapter: function () { return { host: HOST, nav: NAV }; } };
  console.log('§HELP layer mounted (NeedHelp? ready)');
})();
