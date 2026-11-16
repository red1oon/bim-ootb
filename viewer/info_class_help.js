/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// info_class_help.js — bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §14.1: renders the `#info-class-help` block of
// `#info-panel`: what this KIND of element is.
//   (b) ifccls_<C>  — our own plain sentence, always shown when the row exists;
//   (a) ifcdef_<C>  — buildingSMART's IFC 4.3 definition, VERBATIM (bSDD, CC BY-ND 4.0), folded under "IFC definition",
//                     with the credit line; ifcdef_<C>_lang says which language that text is in ('EN' or e.g. 'de-DE').
// THE LABEL RULE (one place): (a) carries "English: no official translation…" iff its _lang is 'EN' and the page is not
// English. All text comes through the ONE label loader (_trl, viewer/i18n/<code>.json); this file holds no text.
// A class with neither row leaves the block hidden: never an empty box. Dual-mode (browser global + require()), the
// info_dxf2bim.js convention: picking.js and the Find pick (find_erp_push.js) both delegate here, one renderer.
(function (global) {
  'use strict';
  var BSDD = 'https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3/class/';
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  // '' when the key is absent from the loaded pack (the _trl default) — that is how "no row" is told apart.
  function t(k, d) { return (typeof global._trl === 'function') ? global._trl(k, null, d) : d; }
  function pageLang() {
    var l = (typeof document !== 'undefined' && document.documentElement && document.documentElement.lang) || 'en';
    return String(l);
  }
  function isEnglish(lang) { return /^en\b/i.test(lang); }

  // The pure part: what the block says for one class in one page language. Exported for the witness.
  function model(cls, lang) {
    if (!cls) return null;
    var ours = t('ifccls_' + cls, ''), def = t('ifcdef_' + cls, ''), defLang = def ? t('ifcdef_' + cls + '_lang', 'EN') : '';
    if (!ours && !def) return null;
    return {
      cls: cls, ours: ours, def: def, defLang: defLang,
      fallback: !!def && defLang === 'EN' && !isEnglish(lang),
      link: def ? BSDD + cls : ''
    };
  }

  function html(m) {
    var h = '';
    if (m.ours) h += '<div style="color:#4fc3f7;font-weight:bold;margin-bottom:3px">' + esc(t('ui_cls_about', 'What this is')) + '</div>' +
      '<div class="value" data-cls-part="ours">' + esc(m.ours) + '</div>';
    if (m.def) {
      h += '<details data-cls-part="ifc" style="margin-top:4px"><summary class="label" style="cursor:pointer">' + esc(t('ui_cls_ifcdef', 'IFC definition')) + '</summary>' +
        (m.fallback ? '<div class="label" data-cls-part="fallback" style="font-style:italic">' + esc(t('ui_cls_no_official', 'English: no official translation in your language')) + '</div>' : '') +
        '<div class="value" lang="' + esc(m.defLang === 'EN' ? 'en' : m.defLang) + '" style="white-space:pre-line">' + esc(m.def) + '</div>' +
        '<div class="label" data-cls-part="credit" style="font-size:10px;margin-top:2px"><a href="' + esc(m.link) + '" target="_blank" rel="noopener" style="color:#888">' +
        esc(t('ui_cls_credit', 'buildingSMART IFC 4.3 (bSDD), CC BY-ND 4.0')) + '</a></div></details>';
    }
    return h;
  }

  var _last = null;   // last render args — re-rendered on an in-place language switch (info_4d_panel.js convention)
  if (global.addEventListener) global.addEventListener('trl-ready', function (e) {
    var box = typeof document !== 'undefined' && document.getElementById('info-class-help');
    if (e && e.detail && e.detail.inplace && _last && box && box.style.display === 'block') render(_last[0], _last[1]);
  });

  function render(A, guid) {
    var box = typeof document !== 'undefined' && document.getElementById('info-class-help');
    if (!box) return false;
    _last = [A, guid];
    box.style.display = 'none';
    var cls = null;
    try {
      var r = (A && A.dbQuery && guid) ? A.dbQuery('SELECT ifc_class FROM elements_meta WHERE guid = ?', [guid]) : [];
      cls = r && r.length ? r[0][0] : null;
    } catch (e) { cls = null; }
    var lang = pageLang(), m = model(cls, lang);
    if (!m) { console.log('§CLASS_HELP guid="' + guid + '" class=' + (cls || '-') + ' skip reason=no_row locale=' + lang); return false; }
    box.innerHTML = html(m); box.style.display = 'block';
    console.log('§CLASS_HELP guid="' + guid + '" class=' + cls + ' ours=' + (m.ours ? 'Y' : 'N') + ' ifc=' + (m.def ? 'Y' : 'N') +
      ' ifc_lang=' + (m.defLang || '-') + ' fallback=' + (m.fallback ? 'Y' : 'N') + ' locale=' + lang);
    return true;
  }

  var API = { render: render, model: model, html: html };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.InfoClassHelp = API;
})(typeof window !== 'undefined' ? window : globalThis);
