/* §LANGUAGE_I18N_FULLTOOLKIT — shared loader for the 6 prose pages (front/why/faq/proposal/sources/
   disclaimer). assess.html has its own inline templated renderer (tr()/L()/T() reading PACKS) and
   does not load this file. Policy: nothing persisted across pages — "a language choice is not data
   about the respondent," extended here to "not data about the reader either." Every fetch is same-
   origin, static JSON; no network call leaves the page beyond that.

   One mechanism: data-i18n-block="key" replaces an element's innerHTML from pack[PAGE][key];
   data-i18n-block="common:key" replaces it from pack.common[key] instead (nav labels, footer
   boilerplate — shared across all 7 pages). innerHTML, not textContent, throughout — translated
   content already carries its own tags/links, and plain-text values work fine as innerHTML too.
   Original English markup is left in place as the fallback: if a key is missing from a pack, or the
   pack fetch fails, the page simply stays in English — never a blank. */
(function () {
  var PAGE = document.currentScript && document.currentScript.getAttribute('data-page');
  var LANGS = null, PACKCACHE = {};

  var CSS = '.langbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;' +
    'padding:11px 0;border-bottom:1px solid var(--rule-soft)}' +
    '.langbar label{font-family:"Instrument Sans",sans-serif;font-size:12px;font-weight:600;' +
    'letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}' +
    '.langbar select{flex:0 0 auto;width:auto;max-width:220px;font-family:"Instrument Sans",sans-serif;' +
    'font-size:13.5px;color:var(--ink);background:var(--surface);border:1px solid var(--rule);' +
    'border-radius:6px;padding:5px 9px}' +
    '.langbar select:focus-visible{outline:2px solid var(--focus);outline-offset:2px}' +
    '.langbar .small{flex:1;min-width:240px;font-size:12.5px}' +
    '.draftbar{margin:12px 0 0;padding:12px 14px;border-left:3px solid var(--warn);border-radius:6px;' +
    'background:var(--warn-wash);color:var(--ink-2);font-size:14px;line-height:1.55}' +
    '.draftbar .en{display:block;margin-top:7px;padding-top:7px;border-top:1px solid var(--rule-soft);opacity:.8}' +
    '[dir="rtl"] .langbar{direction:rtl;text-align:right}' +
    '[dir="rtl"] .draftbar{border-left:none;border-right:3px solid var(--warn);direction:rtl;text-align:right}' +
    '[dir="rtl"] .draftbar .en{direction:ltr;text-align:left}';

  function injectCSS() {
    var s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function mountLangbar() {
    var topbar = document.querySelector('.topbar');
    if (!topbar) return null;
    var bar = document.createElement('div');
    bar.className = 'langbar';
    bar.innerHTML =
      '<label for="langsel">Language</label>' +
      '<select id="langsel"><option value="en">English</option></select>' +
      '<span class="small" id="langnote">Translated as an unadjudicated draft — see the notice below once a language is selected.</span>';
    topbar.parentNode.insertBefore(bar, topbar.nextSibling);
    var draft = document.createElement('div');
    draft.className = 'draftbar'; draft.id = 'draftbar'; draft.hidden = true;
    bar.parentNode.insertBefore(draft, bar.nextSibling);
    return bar;
  }

  function populateSelect(sel) {
    Object.keys(LANGS).forEach(function (code) {
      if (code === 'en') return;
      var o = document.createElement('option');
      o.value = code;
      o.textContent = LANGS[code].native + (LANGS[code].status === 'draft' ? ' — draft' : '');
      sel.appendChild(o);
    });
  }

  function fetchPack(code) {
    if (code === 'en') return Promise.resolve(null);
    if (PACKCACHE[code]) return Promise.resolve(PACKCACHE[code]);
    return fetch('i18n/' + code + '.json').then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { PACKCACHE[code] = j; return j; })
      .catch(function () { return null; });
  }

  /* originals[key] holds the untouched English innerHTML so switching back to English (or a pack
     missing a key) always has a real fallback to restore, not a guess. */
  var originals = {};

  function applyLang(code) {
    document.documentElement.setAttribute('dir', LANGS[code] && LANGS[code].dir === 'rtl' ? 'rtl' : 'ltr');
    var draft = document.getElementById('draftbar');
    fetchPack(code).then(function (pack) {
      var common = pack && pack.common;
      var page = pack && pack[PAGE];

      document.querySelectorAll('[data-i18n-block]').forEach(function (el) {
        var raw = el.getAttribute('data-i18n-block');
        if (!(raw in originals)) originals[raw] = el.innerHTML;
        var v;
        if (raw.indexOf('common:') === 0) { v = common && common[raw.slice(7)]; }
        else { v = page && page[raw]; }
        el.innerHTML = (v === undefined || v === null || v === '') ? originals[raw] : v;
      });

      if (code === 'en' || !pack) { if (draft) draft.hidden = true; return; }
      if (draft) {
        var note = (common && common.draftnote) ||
          'This translation is an <strong>unadjudicated draft</strong>, not reviewed by a qualified translator.';
        draft.innerHTML = note + '<span class="en" lang="en">This translation is an <strong>unadjudicated draft</strong>, not reviewed by a qualified translator.</span>';
        draft.hidden = false;
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!PAGE) return;
    injectCSS();
    var bar = mountLangbar();
    if (!bar) return;
    var sel = document.getElementById('langsel');
    fetch('i18n/languages.json').then(function (r) { return r.json(); }).then(function (langs) {
      LANGS = langs;
      populateSelect(sel);
    }).catch(function () { LANGS = { en: { name: 'English', native: 'English', dir: 'ltr', status: 'source' } }; });
    sel.addEventListener('change', function () { applyLang(sel.value); });
  });
})();
