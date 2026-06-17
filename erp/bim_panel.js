/**
 * BIM OOTB — bim_panel.js — the in-app BIM embed PANEL (dock / float / maximize / pop-out).
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * BimPanel.open(url, {title}) mounts a single draggable floating iframe that loads the BIM viewer
 * chromelessly (appends &embedded=true — the EXISTING viewer param, config.js A.EMBEDDED). We own the
 * dock/float/max state (the OS popup↔tab drag is a browser dead-end), so the host record stays visible
 * underneath in float. Pop-out opens the RAW url (with chrome) in a new tab. Listens for the viewer's
 * {type:'bim:ready'} postMessage (§-log). Drag idiom ported verbatim from pos_lens.js _makePanelDraggable
 * (itself from the viewer measure.js idiom). See prompts/BIM_EMBED_WINDOW_SESSION.md §B2 (W-BIM-EMBED).
 */
(function () {
  'use strict';
  var PANEL_ID = 'bim-embed-panel';
  var STYLE_ID = 'bim-embed-panel-style';

  function _icon(name, sz) {
    var I = window.ICONS && window.ICONS[name];
    return I ? ('<svg width="' + (sz || 18) + '" height="' + (sz || 18) + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + I.svg + '</svg>') : '';
  }

  function _ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style'); s.id = STYLE_ID;
    s.textContent =
      '#' + PANEL_ID + '{position:fixed;z-index:9000;background:#1e1e1e;border:1px solid #444;' +
      'border-radius:8px;box-shadow:0 10px 40px rgba(0,0,0,.55);display:flex;flex-direction:column;overflow:hidden;}' +
      '#' + PANEL_ID + '.state-float{left:12px;top:64px;width:46vw;height:60vh;}' +
      '#' + PANEL_ID + '.state-dock{left:auto;right:0;top:0;width:42vw;height:100vh;border-radius:0;}' +
      '#' + PANEL_ID + '.state-max{left:0;top:0;width:100vw;height:100vh;border-radius:0;}' +
      '#' + PANEL_ID + ' .bim-panel-hdr{display:flex;align-items:center;gap:8px;padding:6px 10px;' +
      'background:#262626;color:#eee;font:600 13px system-ui,sans-serif;cursor:grab;user-select:none;}' +
      '#' + PANEL_ID + ' .bim-panel-title{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      '#' + PANEL_ID + ' .bim-panel-grip{opacity:.5;}' +
      '#' + PANEL_ID + ' .bim-panel-ctrls{display:flex;gap:2px;}' +
      '#' + PANEL_ID + ' .bim-panel-btn{background:none;border:0;color:#bbb;padding:4px;border-radius:5px;' +
      'cursor:pointer;display:flex;align-items:center;}' +
      '#' + PANEL_ID + ' .bim-panel-btn:hover{background:#3a3a3a;color:#fff;}' +
      '#' + PANEL_ID + ' .bim-panel-frame{flex:1;width:100%;border:0;background:#0b0b0b;}' +
      '@media (max-width:760px){#' + PANEL_ID + '.state-float{left:0;top:0;width:100vw;height:100vh;border-radius:0;}}';
    document.head.appendChild(s);
  }

  // ported verbatim from pos_lens.js §R2-4 _makePanelDraggable (the established pointer-drag idiom).
  function _makeDraggable(panel, handle) {
    var sx, sy, ox, oy, dragging = false, pid = null;
    handle.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.bim-panel-btn')) return;       // buttons aren't drag handles
      var r = panel.getBoundingClientRect();
      ox = r.left; oy = r.top; sx = e.clientX; sy = e.clientY; dragging = true; pid = e.pointerId;
      panel.style.right = 'auto'; panel.style.bottom = 'auto';
      panel.style.left = ox + 'px'; panel.style.top = oy + 'px';
      try { handle.setPointerCapture(pid); } catch (er) {}
      handle.style.cursor = 'grabbing'; e.preventDefault();
    });
    handle.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var nx = ox + (e.clientX - sx), ny = oy + (e.clientY - sy);
      nx = Math.max(0, Math.min(nx, window.innerWidth - 40));
      ny = Math.max(0, Math.min(ny, window.innerHeight - 40));
      panel.style.left = nx + 'px'; panel.style.top = ny + 'px';
    });
    function _end() { if (!dragging) return; dragging = false; handle.style.cursor = 'grab'; try { handle.releasePointerCapture(pid); } catch (er) {} console.log('§BIM-PANEL-DRAG moved=Y'); }
    handle.addEventListener('pointerup', _end);
    handle.addEventListener('pointercancel', _end);
  }

  function close() {
    var p = document.getElementById(PANEL_ID);
    if (p) { p.remove(); console.log('§BIM-PANEL close'); }
  }

  function open(url, opts) {
    opts = opts || {};
    if (!url) { console.warn('§BIM-PANEL open called with no url'); return null; }
    _ensureStyle();
    close();   // single panel at a time

    var embUrl = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'embedded=true';
    var panel = document.createElement('div'); panel.id = PANEL_ID; panel.className = 'state-float';

    var hdr = document.createElement('div'); hdr.className = 'bim-panel-hdr';
    hdr.innerHTML = '<span class="bim-panel-grip">⠿</span><span class="bim-panel-title"></span>';
    hdr.querySelector('.bim-panel-title').textContent = opts.title || 'BIM Model';

    function setState(s) { panel.className = 'state-' + s; console.log('§BIM-PANEL state=' + s); }
    function ctl(name, title, fn) {
      var b = document.createElement('button'); b.className = 'bim-panel-btn'; b.title = title;
      b.innerHTML = _icon(name, 16);
      b.addEventListener('click', function (e) { e.stopPropagation(); fn(); });
      return b;
    }
    var ctrls = document.createElement('div'); ctrls.className = 'bim-panel-ctrls';
    ctrls.appendChild(ctl('panelRight', 'Dock', function () { setState('dock'); }));
    ctrls.appendChild(ctl('pictureInPicture2', 'Float', function () { setState('float'); }));
    ctrls.appendChild(ctl('maximize', 'Maximize', function () { setState('max'); }));
    ctrls.appendChild(ctl('externalLink', 'Open in new tab', function () { window.open(url, '_blank'); console.log('§BIM-PANEL popout'); }));
    ctrls.appendChild(ctl('xmark', 'Close', close));
    hdr.appendChild(ctrls);

    var frame = document.createElement('iframe'); frame.className = 'bim-panel-frame'; frame.id = 'bim-panel-frame';
    frame.setAttribute('title', opts.title || 'BIM Model'); frame.src = embUrl;

    panel.appendChild(hdr); panel.appendChild(frame);
    document.body.appendChild(panel);
    _makeDraggable(panel, hdr);
    console.log('§BIM-EMBED-PANEL open url=' + embUrl + ' title=' + (opts.title || 'BIM Model'));
    return panel;
  }

  // viewer → host: the embedded viewer posts {type:'bim:ready'} once chromeless mode is up.
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (d && typeof d === 'object' && d.type === 'bim:ready')
      console.log('§BIM-EMBED-READY viewer ready bld=' + (d.bld || '?'));
  });

  window.BimPanel = { open: open, close: close };
})();
