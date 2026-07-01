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
//   opts = { paneHost?, onMount(paneEl), onUnmount(), label?, host? }
//     paneHost — where the overlay pane attaches (default = document.body).
//     onMount  — called with the freshly-created pane element when Team goes ON (render the overlay here).
//     onUnmount— called when Team goes OFF (cleanup).
//     host     — the EMBEDDING product's UI factory (RESUME_TEAMS_UI_CONSISTENCY §R1/§R2): when present and
//                exposing `.icon(name,opts)` / `.createPanel(id,opts)` (the viewer `A` object), the pill is built
//                from the host's ONE Lucide registry (`host.icon('share', …)`) and the pane is the host's
//                `.bim-panel` shell — so Teams SPEAKS THE HOST'S VISUAL LANGUAGE (icon set + active-band token +
//                pane chrome) instead of imposing its own. Absent (the standalone demo) → the self-contained
//                glyph + `.teams-pane` div fallback (hardcoded fallbacks allowed only off-host, §R4).
//   Returns { el, isOn, open, close, toggle, destroy } — `el` is the pill button.
function mountTeamsPill(headerEl, opts) {
  if (typeof document === 'undefined' || !headerEl) return null;   // node / no host: no-op
  opts = opts || {};
  var on = false, pane = null;
  var host = opts.host || null;
  var hostIcon = host && typeof host.icon === 'function';          // §R1 — build the pill from the host registry
  var hostPanel = host && typeof host.createPanel === 'function';  // §R2 — pane = the host `.bim-panel` shell
  var label = opts.label || 'Teams overlay';

  var pill;
  if (hostIcon) {
    // §R1: `share` = the collab-network glyph (agreed icon map). The host factory carries the SVG, the
    // host's `.active` class (→ host active-band token, never `#3a6df0`), and the title-on-hover.
    pill = host.icon('share', { size: 18, title: label, id: 'teams-pill' });
    pill.classList.add('teams-pill');                              // keep the hook class for host CSS targeting
  } else {
    pill = _el('button', 'teams-pill');
    pill.id = 'teams-pill';
    pill.innerHTML = TEAMS_ICON;                                   // static glyph markup, never data
  }
  pill.type = 'button';
  pill.setAttribute('aria-pressed', 'false');
  pill.setAttribute('aria-label', label);
  if (!pill.title) pill.title = label;

  function open() {
    if (on) return;
    on = true;
    pill.classList.add('on');
    if (hostIcon) pill.classList.add('active');                   // §R1 — host active-band class (token-styled)
    pill.setAttribute('aria-pressed', 'true');
    if (hostPanel) {
      // §R2/§R3: the host `.bim-panel` shell (draggable, host-tokened, `.bim-panel-close`). createPanel
      // appends hidden; reveal it. We keep id `teams-pane` so the overlay/witness selectors are stable.
      pane = host.createPanel('teams-pane', { closable: true, draggable: true, onClose: close });
      pane.style.display = 'block';
    } else {
      pane = _el('div', 'teams-pane');                            // the overlay pane (created ONLY when ON)
      pane.id = 'teams-pane';
      (opts.paneHost || document.body).appendChild(pane);
    }
    if (opts.onMount) opts.onMount(pane);
  }
  function close() {
    if (!on) return;
    on = false;
    pill.classList.remove('on');
    pill.classList.remove('active');
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
