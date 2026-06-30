// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — TEAMS PILL + MOUNT (teams/ROADMAP.md §S9, Phase E — the embed launcher).
//   A DISTINCT "Teams" pill (2-person icon, id `teams-pill`) — NOT the red-pill / Zoom-Across (those are
//   nav/geometry, ERP_CONTEXT §8). Self-contained (does NOT fork pill_builder): the host calls
//   mountTeamsPill(headerEl, opts) once; everything else is this module. THE HARD RULE (TEAM_OPTICS §9):
//   **Team OFF (default) = pixel-identical UI** — until the pill is toggled ON, NO overlay DOM exists, so
//   the host screen is byte-for-byte unchanged. ON → the overlay mounts in a pane; OFF again → the pane is
//   removed and the screen reverts to the exact OFF baseline (reversible). Browser-only; pure DOM API.
//   Witness: teams/tests/wire_teams_pill.js (W-TEAM-WIRE — pill exists · OFF pixel-identical · ON mounts · reversible).
'use strict';

// a clean 2-person glyph (distinct from redpill's lozenge + zoom-across's arrows).
var TEAMS_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/>' +
  '<circle cx="17" cy="9" r="2.2"/><path d="M15.5 19a4.5 4.5 0 0 1 6.5-4"/></svg>';

function _el(tag, cls, txt) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = String(txt);
  return e;
}

// mountTeamsPill(headerEl, opts) — add the Teams launcher to a host header.
//   opts = { paneHost?, onMount(paneEl), onUnmount(), label? }
//     paneHost — where the overlay pane attaches (default = document.body).
//     onMount  — called with the freshly-created pane element when Team goes ON (render the overlay here).
//     onUnmount— called when Team goes OFF (cleanup).
//   Returns { el, isOn, open, close, toggle, destroy } — `el` is the pill button.
function mountTeamsPill(headerEl, opts) {
  if (typeof document === 'undefined' || !headerEl) return null;   // node / no host: no-op
  opts = opts || {};
  var on = false, pane = null;

  var pill = _el('button', 'teams-pill');
  pill.id = 'teams-pill';
  pill.type = 'button';
  pill.setAttribute('aria-pressed', 'false');
  pill.setAttribute('aria-label', opts.label || 'Teams overlay');
  pill.title = opts.label || 'Teams overlay';
  pill.innerHTML = TEAMS_ICON;                                    // static glyph markup, never data

  function open() {
    if (on) return;
    on = true;
    pill.classList.add('on');
    pill.setAttribute('aria-pressed', 'true');
    pane = _el('div', 'teams-pane');                             // the overlay pane (created ONLY when ON)
    pane.id = 'teams-pane';
    (opts.paneHost || document.body).appendChild(pane);
    if (opts.onMount) opts.onMount(pane);
  }
  function close() {
    if (!on) return;
    on = false;
    pill.classList.remove('on');
    pill.setAttribute('aria-pressed', 'false');
    if (opts.onUnmount) opts.onUnmount();
    if (pane && pane.parentNode) pane.parentNode.removeChild(pane);  // remove ALL overlay DOM → OFF baseline
    pane = null;
  }
  function toggle() { on ? close() : open(); }

  pill.addEventListener('click', toggle);
  headerEl.appendChild(pill);
  return {
    el: pill,
    isOn: function () { return on; },
    open: open, close: close, toggle: toggle,
    destroy: function () { close(); if (pill.parentNode) pill.parentNode.removeChild(pill); }
  };
}

var TP = { mountTeamsPill: mountTeamsPill, TEAMS_ICON: TEAMS_ICON };
if (typeof module === 'object' && module.exports) module.exports = TP;
else (typeof self !== 'undefined' ? self : this).TeamsPill = TP;
