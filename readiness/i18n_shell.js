/* §LANGUAGE_I18N_FULLTOOLKIT — shared loader for the 6 prose pages (front/why/faq/proposal/sources/
   disclaimer). assess.html has its own inline templated renderer (tr()/L()/T() reading PACKS) and
   does not load this file, but mirrors the sessionStorage persistence below independently in its own
   applyLang(). Every fetch is same-origin, static JSON; no network call leaves the page beyond that.

   One mechanism: data-i18n-block="key" replaces an element's innerHTML from pack[PAGE][key];
   data-i18n-block="common:key" replaces it from pack.common[key] instead (nav labels, footer
   boilerplate — shared across all 7 pages). innerHTML, not textContent, throughout — translated
   content already carries its own tags/links, and plain-text values work fine as innerHTML too.
   Original English markup is left in place as the fallback: if a key is missing from a pack, or the
   pack fetch fails, the page simply stays in English — never a blank.

   PERSISTENCE (added 2026-08-25, user directive): the pick is written to sessionStorage under
   READINESS_LANG_KEY and read back on every page's load, restoring it instead of defaulting to
   English — a UI convenience so navigating Overview→Assessment→Proposal etc. doesn't reset the
   reader to English every click. sessionStorage ONLY (per-tab, gone when the tab closes, never sent
   over the network) — never localStorage, never a URL param, and NEVER the submitted answer payload.
   The narrower principle — "a language choice is not data about the respondent" — is about the
   research payload specifically and is unchanged; this is a separate, purely client-side reading
   convenience that touches nothing that gets submitted. Graceful fallback to English if unset, or if
   the stored code no longer exists in languages.json (e.g. a language is later removed).

   DRAFT LABELING REMOVED (2026-08-25, user directive): the toolkit previously showed a warning
   banner on every non-English page ("unadjudicated draft, not reviewed by a qualified translator")
   and appended " — draft" to each language's name in the picker. The user explicitly withdrew that
   framing — see PROMPT.md §LANGUAGE_I18N_FULLTOOLKIT for the dated note. Do not reintroduce a
   draft/unadjudicated banner without a fresh user directive; this removal was deliberate, not an
   oversight to "fix" back. */
(function () {
  var PAGE = document.currentScript && document.currentScript.getAttribute('data-page');
  var LANGS = null, PACKCACHE = {};

  var READINESS_LANG_KEY = 'readiness_lang';
  function readStoredLang() {
    try { return sessionStorage.getItem(READINESS_LANG_KEY); } catch (e) { return null; }
  }
  function writeStoredLang(code) {
    try { sessionStorage.setItem(READINESS_LANG_KEY, code); } catch (e) {}
  }

  var CSS = '.langbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;' +
    'padding:11px 0;border-bottom:1px solid var(--rule-soft)}' +
    '.langbar label{font-family:"Instrument Sans",sans-serif;font-size:12px;font-weight:600;' +
    'letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}' +
    '.langbar select{flex:0 0 auto;width:auto;max-width:220px;font-family:"Instrument Sans",sans-serif;' +
    'font-size:13.5px;color:var(--ink);background:var(--surface);border:1px solid var(--rule);' +
    'border-radius:6px;padding:5px 9px}' +
    '.langbar select:focus-visible{outline:2px solid var(--focus);outline-offset:2px}' +
    '.langbar .small{flex:1;min-width:240px;font-size:12.5px}' +
    '[dir="rtl"] .langbar{direction:rtl;text-align:right}';

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
      '<span class="small" id="langnote">This page is translated. The Sources page stays in English to preserve citation accuracy.</span>';
    topbar.parentNode.insertBefore(bar, topbar.nextSibling);
    return bar;
  }

  function populateSelect(sel) {
    Object.keys(LANGS).forEach(function (code) {
      if (code === 'en') return;
      var o = document.createElement('option');
      o.value = code;
      o.textContent = LANGS[code].native;
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

  function applyLang(code, skipWrite) {
    if (!skipWrite) writeStoredLang(code);
    document.documentElement.setAttribute('dir', LANGS[code] && LANGS[code].dir === 'rtl' ? 'rtl' : 'ltr');
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
      var stored = readStoredLang();
      if (stored && stored !== 'en' && LANGS[stored]) {
        sel.value = stored;
        applyLang(stored, true);
      }
    }).catch(function () { LANGS = { en: { name: 'English', native: 'English', dir: 'ltr' } }; });
    sel.addEventListener('change', function () { applyLang(sel.value); });
  });
})();
