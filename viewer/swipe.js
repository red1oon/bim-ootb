// swipe.js — Implementing SpatialERP_POC.md §12b File 2 — Witness: W-SERP-P3
// Card stack with touch/pointer gestures. Pure DOM, no library.
// LEFT/RIGHT = next/prev doc. UP = drill into sub-cards. DOWN = back.
// pointerup not click. Touch targets >= 44px.
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
(function () {
  'use strict';

  var _containerEl = null;
  var _cards = [];        // [{ id, html, actions }]
  var _currentIndex = 0;
  var _drillStack = [];   // stack of card arrays for drill-in/back
  var _onAction = null;
  var _swipeCallbacks = { LEFT: null, RIGHT: null, UP: null, DOWN: null };

  // Gesture state
  var _startX = 0, _startY = 0;
  var _dragging = false;
  var _cardEl = null;

  var THRESHOLD_PX = 80;
  var SNAP_MS = 200;

  /**
   * Init swipe stack.
   * @param {Element} containerEl  DOM container
   * @param {Array}   cards        [{ id, html, actions }]
   * @param {Function} onAction    callback(cardId, actionName)
   */
  function init(containerEl, cards, onAction) {
    console.log('§SWIPE init count=' + (cards ? cards.length : 0));
    _containerEl = containerEl;
    _cards = cards || [];
    _currentIndex = 0;
    _drillStack = [];
    _onAction = onAction;
    _render();
  }

  /**
   * Replace card stack (on role change or filter).
   */
  function setCards(cards) {
    console.log('§SWIPE setCards count=' + (cards ? cards.length : 0));
    _cards = cards || [];
    _currentIndex = 0;
    _drillStack = [];
    _render();
  }

  /**
   * Register swipe direction callback.
   * @param {string} direction  LEFT | RIGHT | UP | DOWN
   * @param {Function} callback called with current card
   */
  function onSwipe(direction, callback) {
    _swipeCallbacks[direction] = callback;
  }

  /**
   * Push sub-cards (drill in). Saves current stack on drill stack.
   * @param {Array} subCards  new cards to show
   */
  function drillIn(subCards) {
    console.log('§SWIPE drillIn from=' + (_cards.length) + ' to=' + (subCards ? subCards.length : 0));
    _drillStack.push({ cards: _cards, index: _currentIndex });
    _cards = subCards || [];
    _currentIndex = 0;
    _render();
  }

  /**
   * Pop back to parent card level.
   */
  function drillBack() {
    if (!_drillStack.length) {
      console.log('§SWIPE drillBack already at root');
      return;
    }
    var prev = _drillStack.pop();
    _cards = prev.cards;
    _currentIndex = prev.index;
    console.log('§SWIPE drillBack restored count=' + _cards.length + ' index=' + _currentIndex);
    _render();
  }

  function _render() {
    if (!_containerEl) return;
    if (!_cards.length) {
      _containerEl.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;' +
        'height:100%;color:#888;font-size:16px;">No documents</div>';
      return;
    }

    var card = _cards[_currentIndex];
    var depth = _drillStack.length;
    var nav = (_cards.length > 1)
      ? '<div class="swipe-nav" style="text-align:center;padding:8px 0;color:#888;font-size:12px;">' +
          (_currentIndex + 1) + ' / ' + _cards.length +
          (depth ? ' &middot; depth ' + depth : '') +
        '</div>'
      : '';

    _containerEl.innerHTML =
      '<div class="swipe-card-wrapper" style="position:relative;height:100%;' +
        'display:flex;flex-direction:column;justify-content:center;padding:16px;">' +
        '<div class="swipe-card" style="' +
          'background:#2a2a2a;border:1px solid #444;border-radius:12px;' +
          'padding:20px;max-width:420px;margin:0 auto;width:100%;' +
          'touch-action:none;user-select:none;' +
          'transition:transform ' + SNAP_MS + 'ms ease,opacity ' + SNAP_MS + 'ms ease;">' +
          card.html +
        '</div>' +
        nav +
      '</div>';

    _cardEl = _containerEl.querySelector('.swipe-card');
    _bindGestures();
    _bindActions(card);
  }

  function _bindGestures() {
    if (!_cardEl) return;

    _cardEl.addEventListener('pointerdown', function (e) {
      _startX = e.clientX;
      _startY = e.clientY;
      _dragging = true;
      _cardEl.style.transition = 'none';
      _cardEl.setPointerCapture(e.pointerId);
    });

    _cardEl.addEventListener('pointermove', function (e) {
      if (!_dragging) return;
      var dx = e.clientX - _startX;
      var dy = e.clientY - _startY;
      _cardEl.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      // Fade at edges
      var dist = Math.sqrt(dx * dx + dy * dy);
      var opacity = Math.max(0.4, 1 - dist / 400);
      _cardEl.style.opacity = opacity;
    });

    _cardEl.addEventListener('pointerup', function (e) {
      if (!_dragging) return;
      _dragging = false;
      var dx = e.clientX - _startX;
      var dy = e.clientY - _startY;

      // Determine threshold — 80px or 30% of card width, whichever smaller
      var cardW = _cardEl.offsetWidth || 300;
      var thresh = Math.min(THRESHOLD_PX, cardW * 0.3);

      var handled = false;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > thresh) {
        if (dx > 0) {
          handled = _handleSwipe('RIGHT');
        } else {
          handled = _handleSwipe('LEFT');
        }
      } else if (Math.abs(dy) > thresh) {
        if (dy < 0) {
          handled = _handleSwipe('UP');
        } else {
          handled = _handleSwipe('DOWN');
        }
      }

      if (!handled) {
        // Snap back
        _cardEl.style.transition = 'transform ' + SNAP_MS + 'ms ease, opacity ' + SNAP_MS + 'ms ease';
        _cardEl.style.transform = 'translate(0,0)';
        _cardEl.style.opacity = '1';
      }
    });

    _cardEl.addEventListener('pointercancel', function () {
      _dragging = false;
      if (_cardEl) {
        _cardEl.style.transition = 'transform ' + SNAP_MS + 'ms ease, opacity ' + SNAP_MS + 'ms ease';
        _cardEl.style.transform = 'translate(0,0)';
        _cardEl.style.opacity = '1';
      }
    });
  }

  function _handleSwipe(direction) {
    console.log('§SWIPE gesture=' + direction + ' index=' + _currentIndex + ' total=' + _cards.length);

    if (direction === 'RIGHT' && _currentIndex > 0) {
      _currentIndex--;
      _render();
      return true;
    }
    if (direction === 'LEFT' && _currentIndex < _cards.length - 1) {
      _currentIndex++;
      _render();
      return true;
    }
    if (direction === 'UP') {
      if (_swipeCallbacks.UP) {
        _swipeCallbacks.UP(_cards[_currentIndex]);
        return true;
      }
    }
    if (direction === 'DOWN') {
      if (_drillStack.length) {
        drillBack();
        return true;
      }
      if (_swipeCallbacks.DOWN) {
        _swipeCallbacks.DOWN(_cards[_currentIndex]);
        return true;
      }
    }

    // External callback
    if (_swipeCallbacks[direction]) {
      _swipeCallbacks[direction](_cards[_currentIndex]);
      return true;
    }
    return false;
  }

  function _bindActions(card) {
    if (!_containerEl || !card.actions) return;
    var btns = _containerEl.querySelectorAll('[data-action]');
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        btn.addEventListener('pointerup', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var action = btn.getAttribute('data-action');
          console.log('§SWIPE action card=' + card.id + ' action=' + action);
          if (_onAction) _onAction(card.id, action);
        });
      })(btns[i]);
    }
  }

  var SwipeStack = {
    init:      init,
    setCards:   setCards,
    onSwipe:   onSwipe,
    drillIn:   drillIn,
    drillBack: drillBack
  };

  if (typeof window !== 'undefined') window.SwipeStack = SwipeStack;
  if (typeof module !== 'undefined' && module.exports) module.exports = SwipeStack;

  console.log('§SWIPE_LOADED v1');
})();
