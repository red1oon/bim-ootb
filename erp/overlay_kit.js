/**
 * BIM OOTB — ERP. Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>. SPDX-License-Identifier: MIT
 *
 * overlay_kit.js — the ONE shared toolbox for the import overlays (prompts/CONSISTENCY_FINISH.md §K-1).
 *   Extracts what erp_picker.js + migrate_showme.js carried byte-for-byte each (el, ensureSql) and adds
 *   the ONE icon renderer (ico) over window.ICONS — the same 24×24 / stroke-2 / round-caps contract
 *   pill_builder.js uses, so the overlays stop drawing with unicode glyphs (🔒⬇✓✗…) and match the
 *   pill surfaces (feedback_pill_icon_consistency). NOT a framework: each overlay keeps its own
 *   rendering + CSS (ep- / ms- classes); only the duplicated utilities live here.
 *   ensureSql REUSES window.SQL when the host page (idempiere.html) already booted sql.js — one WASM
 *   init per page instead of one per overlay.
 *
 *   §-witness: §OVERLAY-KIT sql=<reused|inited>
 */
(function (global) {
  'use strict';

  var _SQL = null;   // page-wide cache: ONE sql.js module shared by every overlay on this page

  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (html != null) e.innerHTML = html;
    return e;
  }

  function ensureSql() {
    if (_SQL) return Promise.resolve(_SQL);
    if (global.SQL && global.SQL.Database) {            // host page already booted sql.js — reuse it
      _SQL = global.SQL;
      console.log('§OVERLAY-KIT sql=reused');
      return Promise.resolve(_SQL);
    }
    if (typeof initSqlJs !== 'function') return Promise.reject(new Error('sql.js not loaded'));
    return initSqlJs({ locateFile: function () { return 'lib/sql-wasm-fts5.wasm'; } })
      .then(function (S) { _SQL = S; console.log('§OVERLAY-KIT sql=inited'); return S; });
  }

  // ico(name, size?, color?) — inline SVG from the verbatim ICONS registry (icons.js). Same wrapper
  // attributes as pill_builder.js renders, sized for inline text use. Unknown name → '' (never invented).
  function ico(name, size, color) {
    var d = (global.ICONS || {})[name];
    if (!d || !d.svg) return '';
    var s = size || 14;
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + s + '" height="' + s
      + '" viewBox="0 0 24 24" fill="none" stroke="' + (color || 'currentColor')
      + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
      + ' style="vertical-align:-2px">' + d.svg + '</svg>';
  }

  global.OverlayKit = { el: el, ensureSql: ensureSql, ico: ico };
})(typeof window !== 'undefined' ? window : this);
