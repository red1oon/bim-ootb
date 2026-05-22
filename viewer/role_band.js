// role_band.js — Implementing SpatialERP_POC.md §12b File 1 — Witness: W-SERP-P3
// Fixed header bar: role label + colour + [QR] + [<>] switch.
// Reads project_metadata for roles/colours/labels.
// pointerup not click. Touch targets >= 44px.
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
(function () {
  'use strict';

  var _db = null;
  var _roles = [];
  var _labels = {};
  var _colours = {};
  var _modes = {};
  var _scopes = {};
  var _currentIndex = 0;
  var _containerEl = null;

  function _readMeta(key) {
    if (!_db) return null;
    var r = _db.exec('SELECT value FROM project_metadata WHERE key = ?', [key]);
    if (!r.length || !r[0].values.length) return null;
    return r[0].values[0][0];
  }

  /**
   * Init role band. Reads project_metadata, renders bar.
   * @param {Object} db          sql.js database
   * @param {Element} containerEl DOM element to render into
   */
  function init(db, containerEl) {
    console.log('§ROLE_BAND init enter');
    _db = db;
    _containerEl = containerEl;

    _roles   = JSON.parse(_readMeta('roles') || '[]');
    _labels  = JSON.parse(_readMeta('role_labels') || '{}');
    _colours = JSON.parse(_readMeta('role_colours') || '{}');
    _modes   = JSON.parse(_readMeta('role_modes') || '{}');
    _scopes  = JSON.parse(_readMeta('role_scopes') || '{}');

    // Check URL ?role= override
    var urlRole = (new URLSearchParams(window.location.search)).get('role');
    if (urlRole && _roles.indexOf(urlRole) >= 0) {
      _currentIndex = _roles.indexOf(urlRole);
    }

    console.log('§ROLE_BAND init roles=' + JSON.stringify(_roles) +
                ' default=' + _roles[_currentIndex]);
    _render();
  }

  function _render() {
    if (!_containerEl || !_roles.length) return;
    var role = _roles[_currentIndex];
    var colour = _colours[role] || '#888';
    var label = _labels[role] || role;

    _containerEl.innerHTML =
      '<div class="role-band-inner" style="' +
        'display:flex;align-items:center;justify-content:space-between;' +
        'padding:4px 12px;min-height:48px;' +
        'background:' + colour + '22;' +
        'border-bottom:2px solid ' + colour + ';">' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
          '<span class="role-dot" style="display:inline-block;width:12px;height:12px;' +
            'border-radius:50%;background:' + colour + ';"></span>' +
          '<span class="role-code" style="font-weight:bold;font-size:14px;color:' + colour + ';">' +
            role + '</span>' +
          '<span class="role-label" style="font-size:13px;color:#ccc;">' +
            label + '</span>' +
        '</div>' +
        '<div style="display:flex;gap:6px;">' +
          '<button class="rb-qr" style="min-width:44px;min-height:44px;' +
            'background:transparent;border:1px solid #555;border-radius:6px;' +
            'color:#ccc;font-size:16px;cursor:pointer;" title="Share role link">QR</button>' +
          '<button class="rb-switch" style="min-width:44px;min-height:44px;' +
            'background:transparent;border:1px solid #555;border-radius:6px;' +
            'color:#ccc;font-size:16px;cursor:pointer;" title="Switch role">&lt;&gt;</button>' +
        '</div>' +
      '</div>';

    // Bind pointerup (not click — mobile-first)
    var switchBtn = _containerEl.querySelector('.rb-switch');
    if (switchBtn) {
      switchBtn.addEventListener('pointerup', function (e) {
        e.preventDefault();
        switchRole(1);
      });
    }
    var qrBtn = _containerEl.querySelector('.rb-qr');
    if (qrBtn) {
      qrBtn.addEventListener('pointerup', function (e) {
        e.preventDefault();
        _shareRole();
      });
    }

    console.log('§ROLE_BAND render role=' + role + ' colour=' + colour + ' label=' + label);
  }

  /**
   * Cycle to next/prev role. Fires 'role-changed' CustomEvent.
   * @param {number} direction  +1 forward, -1 backward
   */
  function switchRole(direction) {
    var oldRole = _roles[_currentIndex];
    _currentIndex = (_currentIndex + (direction || 1) + _roles.length) % _roles.length;
    var newRole = _roles[_currentIndex];
    var detail = currentRole();
    console.log('§ROLE_BAND switch from=' + oldRole + ' to=' + newRole +
                ' scope=' + detail.scope + ' mode=' + detail.mode);
    _render();
    document.dispatchEvent(new CustomEvent('role-changed', { detail: detail }));
  }

  /**
   * Returns current role info.
   * @returns {{ role, scope, mode, colour, label }}
   */
  function currentRole() {
    var role = _roles[_currentIndex] || '';
    return {
      role:   role,
      scope:  _scopes[role] || '*',
      mode:   _modes[role] || 'full',
      colour: _colours[role] || '#888',
      label:  _labels[role] || role
    };
  }

  function _shareRole() {
    var role = _roles[_currentIndex];
    var params = new URLSearchParams(window.location.search);
    params.set('role', role);
    var url = window.location.origin + window.location.pathname + '?' + params.toString();
    console.log('§ROLE_BAND share role=' + role + ' url=' + url);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url);
    }
    // Fire event for external handlers (share.js integration)
    document.dispatchEvent(new CustomEvent('role-share', {
      detail: { role: role, url: url }
    }));
  }

  var RoleBand = {
    init:        init,
    switchRole:  switchRole,
    currentRole: currentRole
  };

  if (typeof window !== 'undefined') window.RoleBand = RoleBand;
  if (typeof module !== 'undefined' && module.exports) module.exports = RoleBand;

  console.log('§ROLE_BAND_LOADED v1');
})();
