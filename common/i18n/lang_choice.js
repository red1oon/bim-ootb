// common/i18n/lang_choice.js — the ONE language choice of the Trilogy (ERP, BIM Viewer, Modeller).
// Implementing bim-compiler prompts/TRL_TRILOGY_STANDARD.md §3 S-5 (step T1) — Witness: W-TRILOGY-LANG (common/i18n/tests/witness_trilogy_lang.js).
// ISSUE: a person who picks a language in one app found the next app in English (three keys, no shared one). All three apps are served from one origin,
//   so they share localStorage: the choice lives under ONE key, 'bim.lang', in the chooser's 18-code set (CODES below = viewer/locale_loader.js AVAILABLE_LOCALES).
// API (window.BimLang, also module.exports):
//   get(opts)            -> {code, src, req} | null.  Precedence: ?lang= > bim.lang > the app's OLD key (opts.legacy: [fn() -> string|null], read once, then migrated
//                           into bim.lang) > navigator.language > null (the caller then uses its own default). code is always one of CODES.
//   set(code)            -> the stored chooser code, or null when the code is not one the chooser knows. Every app's picker calls it.
//   nearest(code, appCodes) -> the member of appCodes that serves `code` (an alias of the same chooser code, e.g. ERP 'ar' for 'ar_SA', else the same language,
//                           e.g. en_MY -> en_US), or null (the app then shows its own default). An app uses it to SHOW; it never writes bim.lang, so the choice
//                           survives to the next app that has a pack for it.
//   canon(code)          -> a foreign/browser tag ('ar', 'en-GB', 'pt') resolved to a chooser code, or null.  MAP is the one mapping table (moved from the Viewer's LOCALE_MAP).
// `window.__TRL_BREAK === 'ownkey'` is the witness's red control: get() ignores bim.lang and the URL, i.e. each app reads only its own old key.
(function (root) {
  'use strict';
  var KEY = 'bim.lang';
  var CODES = ['en_MY', 'en_US', 'en_GB', 'en_AU', 'ms_MY', 'de_DE', 'fr_FR', 'es_ES', 'zh_CN', 'th_TH', 'ja_JP', 'ko_KR', 'ar_SA', 'pt_BR', 'id_ID', 'bn_BD', 'bl_BD', 'af_ZA'];
  // browser / foreign tag -> chooser code (moved verbatim from viewer/locale_loader.js LOCALE_MAP)
  var MAP = {
    'en-MY': 'en_MY', 'en-my': 'en_MY', 'en': 'en_MY',
    'en-US': 'en_US', 'en-us': 'en_US',
    'en-GB': 'en_GB', 'en-gb': 'en_GB',
    'en-AU': 'en_AU', 'en-au': 'en_AU',
    'ms': 'ms_MY', 'ms-MY': 'ms_MY', 'ms-my': 'ms_MY',
    'de': 'de_DE', 'de-DE': 'de_DE', 'de-de': 'de_DE',
    'fr': 'fr_FR', 'fr-FR': 'fr_FR', 'fr-fr': 'fr_FR',
    'es': 'es_ES', 'es-ES': 'es_ES', 'es-es': 'es_ES',
    'zh': 'zh_CN', 'zh-CN': 'zh_CN', 'zh-cn': 'zh_CN',
    'th': 'th_TH', 'th-TH': 'th_TH', 'th-th': 'th_TH',
    'ja': 'ja_JP', 'ja-JP': 'ja_JP', 'ja-jp': 'ja_JP',
    'ko': 'ko_KR', 'ko-KR': 'ko_KR', 'ko-kr': 'ko_KR',
    'ar': 'ar_SA', 'ar-SA': 'ar_SA', 'ar-sa': 'ar_SA',
    'pt': 'pt_BR', 'pt-BR': 'pt_BR', 'pt-br': 'pt_BR',
    'id': 'id_ID', 'id-ID': 'id_ID', 'id-id': 'id_ID',
    'bn': 'bn_BD', 'bn-BD': 'bn_BD', 'bn-bd': 'bn_BD',
    'af': 'af_ZA', 'af-ZA': 'af_ZA', 'af-za': 'af_ZA'
  };
  function canon(code) {
    if (!code) return null;
    code = String(code);
    if (CODES.indexOf(code) >= 0) return code;
    return MAP[code.replace('_', '-')] || MAP[code.split(/[-_]/)[0]] || null;
  }
  function _ls() { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } }
  function _read(k) { try { var s = _ls(); return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function _write(code) { try { var s = _ls(); if (s) s.setItem(KEY, code); } catch (e) { /* storage blocked: the choice lives for this page only */ } }
  function _log(m) { try { console.log(m); } catch (e) {} }
  function _query() { try { return typeof location !== 'undefined' ? new URLSearchParams(location.search).get('lang') : null; } catch (e) { return null; } }
  function _break() { try { return !!(root && root.__TRL_BREAK === 'ownkey'); } catch (e) { return false; } }

  function get(opts) {
    var own = _break(), req = own ? null : _query();
    if (req) {                                                   // 1. ?lang= (the ERP's Zoom Across hand-over; a foreign code like 'ar' resolves through MAP)
      var u = canon(req);
      if (u) return { code: u, src: CODES.indexOf(req) >= 0 ? 'url' : 'url-mapped', req: req };
    }
    var saved = own ? null : canon(_read(KEY));                  // 2. the shared choice
    if (saved) return { code: saved, src: 'saved', req: req };
    var legacy = (opts && opts.legacy) || [];                    // 3. the app's old key: read once, migrate, so the old key never speaks again
    for (var i = 0; i < legacy.length; i++) {
      var raw = null; try { raw = legacy[i](); } catch (e) {}
      var c = canon(raw);
      if (c) {
        if (!own) { _write(c); _log('§LANG_MIGRATE old=' + raw + ' ' + KEY + '=' + c); }
        return { code: c, src: own ? 'legacy' : 'saved', req: req };
      }
    }
    var nav = typeof navigator !== 'undefined' ? (navigator.language || navigator.userLanguage || '') : '';   // 4. the browser
    var b = canon(nav);
    if (b) return { code: b, src: 'browser', req: req };
    return null;                                                 // 5. the caller's own default
  }
  function set(code) {
    var c = canon(code);
    if (!c) { _log('§LANG_SET unknown ' + code); return null; }
    _write(c);
    _log('§LANG_SET ' + KEY + '=' + c + (c !== code ? ' (from ' + code + ')' : ''));
    return c;
  }
  function nearest(code, appCodes) {
    var c = canon(code); if (!c || !appCodes || !appCodes.length) return null;
    var i, lang = c.split('_')[0];
    for (i = 0; i < appCodes.length; i++) if (appCodes[i] === c) return c;                       // exact
    for (i = 0; i < appCodes.length; i++) if (canon(appCodes[i]) === c) return appCodes[i];      // an alias of the same chooser code (ERP 'ar' = ar_SA)
    for (i = 0; i < appCodes.length; i++) if (String(appCodes[i]).split(/[-_]/)[0] === lang) return appCodes[i];   // same language (en_MY -> en_US)
    return null;
  }
  var api = { KEY: KEY, CODES: CODES, MAP: MAP, canon: canon, get: get, set: set, nearest: nearest };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BimLang = api;
})(typeof window !== 'undefined' ? window : this);
