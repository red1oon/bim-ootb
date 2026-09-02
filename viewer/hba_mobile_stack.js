// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — HBA MOBILE CARD-STACK HOST (RESUME_HBA_MOBILE_CARD_STACK.md — the item0 "wow" build).
//   Scope: the SINGLE place the desktop/mobile split for the 6 HBA "Human-Asset" panes lives. Panes stay dumb
//   (their mount-tail calls G.HbaPaneHost.present instead of appendChild+HbaDraggable.enable). Desktop path is
//   BYTE-IDENTICAL to today (append-to-body + HbaDraggable.enable) so desktop is a provable no-op. Mobile path
//   re-parents the LIVE pane node (never clones — iot timers/event handlers must survive) into a full-screen
//   card-stack host: a scrollable peek-DECK of card-headers, tap a card → it goes FULL-SCREEN, ‹back / down =
//   minimise to the deck, the pane's own × = close (removes it, deck rebuilds), left/right = carousel between
//   full-screen cards. Reuses window._isMobile (config.js:7) — no parallel detection. Reuses swipe.js gesture
//   MATH + constants (THRESHOLD_PX=80, SNAP_MS=200) by re-implementation (NOT as the container — SwipeStack
//   renders innerHTML strings, which would kill live handlers/timers).
//   NON-INVENT: pure DOM/interaction over panes that already render; touches no data/geometry/DB.
//   §-log first — read the console §HBASTACK lines to verify state (present/focus/back/close transitions).
(function () {
  'use strict';
  var G = (typeof self !== 'undefined' ? self : this);
  var DOC = (typeof document !== 'undefined') ? document : null;

  // ── gesture constants (adopted from swipe.js — Witness: W-SERP-P3) ─────────────────────────────────────────
  var THRESHOLD_PX = 80;   // swipe commit threshold (or 30% of card width, whichever smaller)
  var SNAP_MS = 200;       // snap-back / commit animation

  // ── state (plain JS, no framework — §4 of the spec, single-level focus model) ──────────────────────────────
  var _stackEl = null;     // #hba-card-stack host (lazy)
  var _topbar = null;      // slim ‹back + title bar shown only in full-screen state
  var _titleEl = null;     // the title span inside _topbar
  var _cards = [];         // [{ id, pane, head, slot, obs, title }] — ORDER = open order (the deck, top→bottom)
  var _focus = -1;         // index of the full-screen card; -1 = peek-deck (home)
  var _lastA = null;       // most-recent APP handle (so the deck launcher can re-open the family drawer)

  // Read _isMobile ONCE per present() call (not cached) so a rotate/resize between opens is honoured (§3).
  function isMobile() { return !!G._isMobile; }

  function el(tag, css, txt) {
    var e = DOC.createElement(tag);
    if (css) e.style.cssText = css;
    if (txt != null) e.textContent = txt;
    return e;
  }

  // ── lazy host + one scoped <style> (§5) ────────────────────────────────────────────────────────────────────
  function ensureStackEl() {
    if (_stackEl) return _stackEl;
    var style = el('style');
    style.id = 'hba-card-stack-style';
    style.textContent = [
      '#hba-card-stack{position:fixed;inset:0;z-index:10060;overflow-y:auto;-webkit-overflow-scrolling:touch;',
      '  background:#0b1620;display:flex;flex-direction:column;padding:8px 0 24px;}',
      // neutralise each pane's fixed 340-420px overlay geometry once it is inside a card
      '#hba-card-stack .hba-card>[id^="hba-"]{position:static !important;top:auto;right:auto;left:auto;',
      '  width:100% !important;max-width:100% !important;box-shadow:none !important;margin:0 !important;}',
      // peek-deck: each card clamped to its header strip; a physical-deck look (overlap shadow, rounded)
      '#hba-card-stack.deck .hba-card{max-height:66px;overflow:hidden;margin:6px 8px;border-radius:12px;',
      '  box-shadow:0 4px 14px #0007;cursor:pointer;position:relative;}',
      '#hba-card-stack.deck .hba-card:active{transform:scale(0.99);}',
      // full-screen: the focused card fills the viewport, its body scrolls internally; siblings hidden
      '#hba-card-stack.fs .hba-card{margin:0;border-radius:0;}',
      '#hba-card-stack.fs .hba-card.focus>[id^="hba-"]{height:100vh;max-height:100vh !important;',
      '  padding-top:40px;border-radius:0;overflow:auto;}',
      '#hba-card-stack.fs .hba-card:not(.focus){display:none;}',
      // slim top bar (‹back + title) — only in full-screen state
      '#hba-card-stack .hba-topbar{position:fixed;top:0;left:0;right:0;height:40px;z-index:10061;display:none;',
      '  align-items:center;gap:8px;padding:0 6px;background:#0b1620;color:#cfe3f2;',
      '  font-family:system-ui,sans-serif;font-size:13px;box-shadow:0 2px 8px #0009;}',
      '#hba-card-stack.fs .hba-topbar{display:flex;}',
      '#hba-card-stack .hba-back{min-width:44px;min-height:32px;background:#16324a;color:#cfe3f2;border:none;',
      '  border-radius:8px;font-size:14px;cursor:pointer;padding:0 10px;}',
      '#hba-card-stack .hba-back:active{background:#1e4460;}',
      '#hba-card-stack .hba-title{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;}',
      // deck launcher chip — shown only in deck state (hidden in full-screen), floats bottom-right, above cards
      '#hba-card-stack .hba-launch{position:fixed;right:14px;bottom:18px;z-index:10062;min-height:44px;',
      '  padding:0 16px;border:none;border-radius:22px;background:#1976d2;color:#fff;font-size:14px;',
      '  font-weight:600;box-shadow:0 4px 14px #0009;cursor:pointer;font-family:system-ui,sans-serif;}',
      '#hba-card-stack.fs .hba-launch{display:none;}'
    ].join('\n');
    (DOC.head || DOC.documentElement).appendChild(style);

    _stackEl = el('div');
    _stackEl.id = 'hba-card-stack';
    _stackEl.className = 'deck';

    _topbar = el('div', '', '');
    _topbar.className = 'hba-topbar';
    var back = el('button', '', '‹ Back');
    back.className = 'hba-back';
    back.title = 'Back to deck (minimise)';
    back.addEventListener('click', function (e) { e.stopPropagation(); back_(); });
    _titleEl = el('span', '', '');
    _titleEl.className = 'hba-title';
    _topbar.appendChild(back);
    _topbar.appendChild(_titleEl);
    _stackEl.appendChild(_topbar);

    // deck launcher: a floating "＋ Panes" chip (deck state only) that re-opens the family drawer ABOVE the
    // stack, so the user can add another pane without leaving the card-stack. Uses the EXISTING drawer (spec
    // §2d "keep the launcher as-is") — the only mobile fix needed is z-order (see syncLauncher).
    var launch = el('button');
    launch.className = 'hba-launch';
    launch.textContent = '＋ Panes';
    launch.title = 'Open the Human-Asset drawer to add another pane';
    launch.addEventListener('click', function (e) {
      e.stopPropagation();
      if (_lastA && G.HBALens && G.HBALens.openFamilyDrawer) G.HBALens.openFamilyDrawer(_lastA);
      syncLauncher();
    });
    _stackEl.appendChild(launch);

    (DOC.body || DOC.documentElement).appendChild(_stackEl);
    bindGestures();
    return _stackEl;
  }

  // tear the host down entirely once the last card is gone (keeps the DOM pixel-clean when nothing is open).
  function teardownIfEmpty() {
    if (_cards.length) return;
    if (_stackEl && _stackEl.parentNode) _stackEl.parentNode.removeChild(_stackEl);
    var st = DOC.getElementById('hba-card-stack-style');
    if (st && st.parentNode) st.parentNode.removeChild(st);
    _stackEl = null; _topbar = null; _titleEl = null; _focus = -1;
    // restore the launcher drawers to their default z (they no longer need to out-rank a stack that's gone)
    ['hba-fm-drawer', 'hba-presence-drawer'].forEach(function (id) { var d = DOC.getElementById(id); if (d) d.style.zIndex = ''; });
    console.log('§HBASTACK teardown host removed (zero residue)');
  }

  // keep the family/presence launcher drawers usable on mobile: ABOVE the stack in deck state (so the user can
  // add another pane), BEHIND it in full-screen (so the pane reads clean). The only mobile change to the existing
  // drawer — no hba_lens.js edit. z: stack=10060, launcher-when-deck=10070, launcher-when-fs=10000 (hidden).
  function syncLauncher() {
    var fs = _focus >= 0 && _focus < _cards.length;
    ['hba-fm-drawer', 'hba-presence-drawer'].forEach(function (id) {
      var d = DOC.getElementById(id);
      if (d) d.style.zIndex = fs ? '10000' : '10070';
    });
  }

  // ── render: deck vs full-screen is just a class toggle + a .focus on one card (§5, no layout math) ──────────
  function render() {
    if (!_stackEl) return;
    var fs = _focus >= 0 && _focus < _cards.length;
    _stackEl.className = fs ? 'fs' : 'deck';
    _cards.forEach(function (c, i) {
      c.slot.classList.toggle('focus', fs && i === _focus);
    });
    if (fs && _titleEl) _titleEl.textContent = _cards[_focus].title || '';
    syncLauncher();
  }

  // ── navigation (single-level focus model: -1 deck | index full-screen) ─────────────────────────────────────
  function focus_(i) {
    if (i < 0 || i >= _cards.length) return;
    _focus = i;
    console.log('§HBASTACK focus i=' + i + ' id=' + _cards[i].id + ' cards=' + _cards.length);
    render();
  }
  function back_() {              // minimise (‹back / swipe-down): keep panes open, return to the deck
    _focus = -1;
    console.log('§HBASTACK back → deck cards=' + _cards.length);
    render();
  }
  function carousel(dir) {        // left/right in full-screen: switch to adjacent card, stay full-screen
    if (_focus < 0) return false;
    var j = _focus + dir;
    if (j < 0 || j >= _cards.length) return false;
    _focus = j;
    console.log('§HBASTACK carousel dir=' + dir + ' → i=' + j + ' id=' + _cards[j].id);
    render();
    return true;
  }

  // drop a card (its pane's own unmount removed the live node → the slot went empty). Fix _focus, rebuild deck.
  function dropCard(idx) {
    if (idx < 0 || idx >= _cards.length) return;
    var c = _cards[idx];
    if (c.obs) c.obs.disconnect();
    if (c.slot.parentNode) c.slot.parentNode.removeChild(c.slot);
    _cards.splice(idx, 1);
    if (_focus === idx) _focus = -1;          // the focused card was closed → land on the deck
    else if (_focus > idx) _focus -= 1;        // indices above the removed one shift down
    console.log('§HBASTACK close idx=' + idx + ' id=' + c.id + ' remaining=' + _cards.length + ' focus=' + _focus);
    if (!_cards.length) { teardownIfEmpty(); return; }
    render();
  }

  // ── the branch: present(pane, head, A) — replaces every pane's mount-tail (§2a/§2b) ────────────────────────
  function present(pane, head, A) {
    _lastA = A || _lastA;
    if (!isMobile()) {
      // EXACT current desktop path — provably a no-op change from today.
      (DOC.body || DOC.documentElement).appendChild(pane);
      if (G.HbaDraggable) G.HbaDraggable.enable(pane, head);
      console.log('§HBASTACK present id=' + (pane && pane.id) + ' mobile=false (desktop overlay)');
      return;
    }
    ensureStackEl();
    var title = (head && head.textContent) ? head.textContent.replace(/\s*×\s*$/, '').trim() : (pane && pane.id) || 'pane';

    // DE-DUPE by pane id: hba_leave/hba_payslip reselect() does unmount(keep)→mount, which would otherwise churn
    // a card. If a card for this id already exists, REUSE its slot (append the fresh live node) — the pending
    // MutationObserver then sees the slot non-empty and does NOT drop it. Zero churn, focus preserved.
    for (var k = 0; k < _cards.length; k++) {
      if (_cards[k].id === pane.id) {
        _cards[k].slot.appendChild(pane);
        _cards[k].pane = pane; _cards[k].head = head; _cards[k].title = title;
        console.log('§HBASTACK present id=' + pane.id + ' mobile=true reuse=slot' + k + ' (reselect)');
        if (_focus === k) render();
        return;
      }
    }

    var slot = el('div');
    slot.className = 'hba-card';
    slot.appendChild(pane);                                  // re-parent the LIVE node (timers/handlers intact)
    _stackEl.appendChild(slot);
    var idx = _cards.length;
    var card = { id: pane.id, pane: pane, head: head, slot: slot, title: title, obs: null };
    _cards.push(card);

    // teardown with ZERO extra pane changes: when the pane's own unmount() runs removeChild(_pane), the slot
    // goes empty → drop this card (§2c). Guard against the reselect re-fill: only drop when STILL empty.
    if (typeof MutationObserver === 'function') {
      card.obs = new MutationObserver(function () {
        if (slot.children.length === 0) {
          var here = _cards.indexOf(card);
          if (here >= 0) dropCard(here);
        }
      });
      card.obs.observe(slot, { childList: true });
    }

    // tap a deck card (anywhere that is NOT a button/link — so the pane's × still closes) → go full-screen.
    slot.addEventListener('click', function (e) {
      if (_focus >= 0) return;                                // only the deck expands on tap
      var t = e.target;
      if (t && (t.tagName === 'BUTTON' || t.tagName === 'A' || (t.closest && t.closest('button,a')))) return;
      var here = _cards.indexOf(card);
      if (here >= 0) focus_(here);
    });

    focus_(_cards.length - 1);                                // newest pane opens full-screen (§7 confident default)
    console.log('§HBASTACK present id=' + pane.id + ' mobile=true focus=' + _focus + ' cards=' + _cards.length);
  }

  // ── gestures on the focused card (§3 — carousel L/R, down=minimise) ─────────────────────────────────────────
  // Ported from swipe.js 124-186: pointer-capture, translate on move, threshold+snap on up. Respects the pane's
  // internal scroll — a vertical drag only becomes a "minimise" when the pane is already scrolled to the top,
  // otherwise the native overflow scroll wins (we never hijack it).
  var _sx = 0, _sy = 0, _drag = false, _axis = '', _fslot = null;

  function focusedPaneEl() {
    if (_focus < 0 || _focus >= _cards.length) return null;
    return _cards[_focus].pane;
  }
  function focusedScrollTop() {
    var p = focusedPaneEl();
    return p ? (p.scrollTop || 0) : 0;
  }

  function bindGestures() {
    if (!_stackEl) return;
    _stackEl.addEventListener('pointerdown', function (e) {
      if (_focus < 0) return;                                 // gestures only in full-screen
      if (e.target && e.target.closest && e.target.closest('button,a,input,select,textarea')) return;
      _sx = e.clientX; _sy = e.clientY; _drag = true; _axis = '';
      _fslot = _cards[_focus].slot;
    });
    _stackEl.addEventListener('pointermove', function (e) {
      if (!_drag || !_fslot) return;
      var dx = e.clientX - _sx, dy = e.clientY - _sy;
      if (!_axis) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;     // dead-zone until intent is clear
        // horizontal = carousel; vertical-DOWN only claims the gesture when pane is scrolled to the top
        if (Math.abs(dx) > Math.abs(dy)) _axis = 'x';
        else if (dy > 0 && focusedScrollTop() <= 0) _axis = 'y';
        else { _drag = false; return; }                        // let native vertical scroll take over
        _fslot.style.transition = 'none';
        try { _fslot.setPointerCapture(e.pointerId); } catch (_) {}
      }
      if (_axis === 'x') { _fslot.style.transform = 'translateX(' + dx + 'px)'; e.preventDefault(); }
      else if (_axis === 'y' && dy > 0) { _fslot.style.transform = 'translateY(' + dy + 'px)'; e.preventDefault(); }
    });
    function endDrag(e) {
      if (!_drag || !_fslot) { _drag = false; return; }
      _drag = false;
      var dx = e.clientX - _sx, dy = e.clientY - _sy;
      var w = _fslot.offsetWidth || 320;
      var thresh = Math.min(THRESHOLD_PX, w * 0.3);
      var committed = false;
      if (_axis === 'x' && Math.abs(dx) > thresh) {
        committed = carousel(dx < 0 ? +1 : -1);                // swipe LEFT → next, RIGHT → prev
      } else if (_axis === 'y' && dy > thresh) {
        back_(); committed = true;                             // swipe DOWN → minimise to deck
      }
      // snap the slot's transform back (render() re-lays out the new focus/deck; the old slot resets cleanly)
      var s = _fslot;
      s.style.transition = 'transform ' + SNAP_MS + 'ms ease';
      s.style.transform = 'translate(0,0)';
      _fslot = null; _axis = '';
      if (committed) { /* state already changed in carousel/back_ */ }
    }
    _stackEl.addEventListener('pointerup', endDrag);
    _stackEl.addEventListener('pointercancel', function () {
      if (_fslot) { _fslot.style.transition = 'transform ' + SNAP_MS + 'ms ease'; _fslot.style.transform = 'translate(0,0)'; }
      _drag = false; _fslot = null; _axis = '';
    });
  }

  // ── public API ─────────────────────────────────────────────────────────────────────────────────────────────
  G.HbaPaneHost = {
    present: present,
    // UI/programmatic navigation (also used by witnesses to drive the state machine without synthetic touch)
    focus: focus_,
    back: back_,
    carousel: carousel,
    cardCount: function () { return _cards.length; },
    // whitebox state read for §-witnesses (ids in deck order + which is full-screen)
    _state: function () { return { ids: _cards.map(function (c) { return c.id; }), focus: _focus, mobile: isMobile() }; },
    _isMobile: isMobile,
    _consts: { THRESHOLD_PX: THRESHOLD_PX, SNAP_MS: SNAP_MS }
  };
  if (typeof module === 'object' && module.exports) module.exports = G.HbaPaneHost;
})();
