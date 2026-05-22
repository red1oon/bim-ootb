/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// locale_loader.js — BIM OOTB Localisation Runtime
// Detects browser language, fetches locale from OCI, caches in localStorage.
// Load order: rates.js → locale_loader.js → page JS
// Implementing S226 §Phase 1 — Witness: W-LOCALE_LOADER

(function() {
  'use strict';

  // ── Base URL: derive from this script's own location ──
  var _scripts = document.getElementsByTagName('script');
  var _thisScript = _scripts[_scripts.length - 1];
  var LOCALE_BASE = _thisScript.src.replace(/[^/]*$/, '') + 'locales/';

  // ── Locale mapping: navigator.language → locale file code ──
  var LOCALE_MAP = {
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

  // ── Flag emoji from ISO 3166-1 alpha-2 ──
  function isoToFlag(iso) {
    if (!iso || iso.length !== 2) return '';
    var a = iso.toUpperCase().charCodeAt(0) - 65 + 0x1F1E6;
    var b = iso.toUpperCase().charCodeAt(1) - 65 + 0x1F1E6;
    return String.fromCodePoint(a) + String.fromCodePoint(b);
  }

  // ── Available locales (for settings dialog) ──
  var AVAILABLE_LOCALES = [
    { code: 'en_MY', iso: 'MY', name: 'English (Malaysia)', label: 'EN' },
    { code: 'en_US', iso: 'US', name: 'English (US)' },
    { code: 'en_GB', iso: 'GB', name: 'English (UK)' },
    { code: 'en_AU', iso: 'AU', name: 'English (Australia)' },
    { code: 'ms_MY', iso: 'MY', name: 'Bahasa Melayu', label: 'BM' },
    { code: 'de_DE', iso: 'DE', name: 'Deutsch' },
    { code: 'fr_FR', iso: 'FR', name: 'Fran\u00e7ais' },
    { code: 'es_ES', iso: 'ES', name: 'Espa\u00f1ol' },
    { code: 'zh_CN', iso: 'CN', name: '\u7b80\u4f53\u4e2d\u6587' },
    { code: 'th_TH', iso: 'TH', name: '\u0e20\u0e32\u0e29\u0e32\u0e44\u0e17\u0e22' },
    { code: 'ja_JP', iso: 'JP', name: '\u65e5\u672c\u8a9e' },
    { code: 'ko_KR', iso: 'KR', name: '\ud55c\uad6d\uc5b4' },
    { code: 'ar_SA', iso: 'SA', name: '\u0627\u0644\u0639\u0631\u0628\u064a\u0629' },
    { code: 'pt_BR', iso: 'BR', name: 'Portugu\u00eas' },
    { code: 'id_ID', iso: 'ID', name: 'Bahasa Indonesia' },
    { code: 'bn_BD', iso: 'BD', name: '\u09ac\u09be\u0982\u09b2\u09be', label: 'BN' },
    { code: 'bl_BD', iso: 'BD', name: 'Banglish', label: 'BL' },
    { code: 'af_ZA', iso: 'ZA', name: 'Afrikaans' }
  ];

  // ── Detect locale: URL param > localStorage > navigator.language > fallback ──
  function detectLocale() {
    var params = new URLSearchParams(window.location.search);
    // 1. URL param override
    var urlLang = params.get('lang');
    if (urlLang && AVAILABLE_LOCALES.some(function(l) { return l.code === urlLang; })) {
      return urlLang;
    }
    // 2. localStorage saved config
    try {
      var saved = JSON.parse(localStorage.getItem('bim_ootb_config'));
      if (saved && saved.locale) return saved.locale;
    } catch(e) { /* ignore */ }
    // 3. Browser language
    var browserLang = navigator.language || navigator.userLanguage || 'en';
    // Try exact match first, then prefix
    if (LOCALE_MAP[browserLang]) return LOCALE_MAP[browserLang];
    var prefix = browserLang.split('-')[0];
    if (LOCALE_MAP[prefix]) return LOCALE_MAP[prefix];
    // 4. Fallback
    return 'en_MY';
  }

  // ── Deep merge: locale over defaults ──
  function deepMerge(target, source) {
    for (var key in source) {
      if (!source.hasOwnProperty(key)) continue;
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key] || typeof target[key] !== 'object') target[key] = {};
        deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
    return target;
  }

  // ── Fetch locale from OCI or localStorage cache ──
  function fetchLocale(code, callback) {
    // Check localStorage cache first
    var LOCALE_VERSION = 6; // bump to invalidate cached locales
    var cacheKey = 'bim_ootb_locale_' + code;
    try {
      var cached = localStorage.getItem(cacheKey);
      if (cached) {
        var parsed = JSON.parse(cached);
        if (parsed && parsed.data && parsed.ts && parsed.v === LOCALE_VERSION) {
          // Cache valid for 7 days and same version
          if (Date.now() - parsed.ts < 7 * 24 * 60 * 60 * 1000) {
            console.log('\u00a7TRL_LOADED cached locale=' + code + ' keys=' + Object.keys(parsed.data).length);
            callback(null, parsed.data);
            return;
          }
        }
      }
    } catch(e) { /* cache miss */ }

    // Fetch from OCI
    var url = LOCALE_BASE + code + '.js';
    fetch(url).then(function(resp) {
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return resp.text();
    }).then(function(text) {
      // Parse: locale files set var _TRL_LOCALE = {...};
      var fn = new Function(text + '; return _TRL_LOCALE;');
      var data = fn();
      // Cache in localStorage
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ data: data, ts: Date.now(), v: LOCALE_VERSION }));
      } catch(e) { /* storage full — continue without cache */ }
      console.log('\u00a7TRL_LOADED fetched locale=' + code + ' keys=' + Object.keys(data).length);
      callback(null, data);
    }).catch(function(err) {
      console.warn('\u00a7TRL_FETCH_FAIL locale=' + code + ' err=' + err.message);
      // Try loading from local path (development / same-origin)
      var localUrl = 'locales/' + code + '.js';
      fetch(localUrl).then(function(resp) {
        if (!resp.ok) throw new Error('local HTTP ' + resp.status);
        return resp.text();
      }).then(function(text) {
        var fn = new Function(text + '; return _TRL_LOCALE;');
        var data = fn();
        console.log('\u00a7TRL_LOADED local locale=' + code + ' keys=' + Object.keys(data).length);
        callback(null, data);
      }).catch(function(err2) {
        console.warn('\u00a7TRL_FALLBACK using defaults, err=' + err2.message);
        callback(err2, null);
      });
    });
  }

  // ── Apply URL param overrides (highest priority) ──
  function applyUrlOverrides(trl) {
    var params = new URLSearchParams(window.location.search);
    if (params.get('cur'))  trl.cur = params.get('cur');
    if (params.get('cur2')) trl.cur2 = params.get('cur2');
    if (params.get('rate')) trl.cur_rate = parseFloat(params.get('rate'));
    // Any _TRL key can be overridden: ?h_labour=Labor&ui_tools=Outils
    params.forEach(function(val, key) {
      if (key.match(/^(h_|t_|s_|ui_)/)) trl[key] = val;
    });
  }

  // ── Override global rates from locale ──
  function applyRateOverrides(localeData) {
    if (localeData.rates && typeof RATES !== 'undefined') {
      for (var cls in localeData.rates) {
        if (localeData.rates.hasOwnProperty(cls)) RATES[cls] = localeData.rates[cls];
      }
    }
    if (localeData.rates_default && typeof RATES_DEFAULT !== 'undefined') {
      RATES_DEFAULT = localeData.rates_default;
    }
    if (localeData.labor_rates && typeof LABOR_RATES !== 'undefined') {
      for (var key in localeData.labor_rates) {
        if (localeData.labor_rates.hasOwnProperty(key)) LABOR_RATES[key] = localeData.labor_rates[key];
      }
    }
    if (localeData.equipment_rates && typeof EQUIPMENT_RATES !== 'undefined') {
      for (var key in localeData.equipment_rates) {
        if (localeData.equipment_rates.hasOwnProperty(key)) EQUIPMENT_RATES[key] = localeData.equipment_rates[key];
      }
    }
  }

  // ── Show toast notification ──
  function showLocaleToast(code) {
    var loc = AVAILABLE_LOCALES.find(function(l) { return l.code === code; });
    if (!loc) return;
    var flag = isoToFlag(loc.iso);
    var toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);z-index:9999;' +
      'background:rgba(0,0,0,0.8);color:#fff;padding:8px 16px;border-radius:8px;font-size:13px;' +
      'font-family:Segoe UI,sans-serif;backdrop-filter:blur(8px);border:1px solid rgba(79,195,247,0.3);' +
      'transition:opacity 0.5s;pointer-events:none';
    toast.textContent = flag + ' ' + loc.name + ' \u2014 change in \u2699';
    document.body.appendChild(toast);
    setTimeout(function() { toast.style.opacity = '0'; }, 3000);
    setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 3500);
  }

  // ── Template string helper: _TRL.ui_flew_to.replace('{name}', x) ──
  // Exposed globally for convenience
  window._trl = function(key, replacements) {
    var s = (typeof _TRL !== 'undefined' && _TRL[key]) ? _TRL[key] : key;
    if (replacements) {
      for (var k in replacements) {
        s = s.replace('{' + k + '}', replacements[k]);
      }
    }
    return s;
  };

  // ── Flag picker popup ──
  function toggleFlagPicker() {
    var popup = document.getElementById('ootb-flag-popup');
    if (popup) { popup.classList.toggle('active'); return; }

    // Position next to the header flag button
    var anchor = document.getElementById('header-flag-btn');
    var posStyle = 'position:fixed;top:60px;right:16px;z-index:9998;';
    if (anchor) {
      var r = anchor.getBoundingClientRect();
      posStyle = 'position:fixed;top:' + (r.bottom + 6) + 'px;left:' + r.left + 'px;z-index:9998;';
    }

    popup = document.createElement('div');
    popup.id = 'ootb-flag-popup';
    popup.className = 'active';
    popup.style.cssText = posStyle +
      'background:rgba(10,10,30,0.95);border-radius:12px;padding:12px 14px;' +
      'border:1px solid rgba(79,195,247,0.3);backdrop-filter:blur(12px);' +
      'display:none;grid-template-columns:repeat(5,1fr);gap:4px';

    var currentLocale = detectLocale();
    AVAILABLE_LOCALES.forEach(function(loc) {
      var btn = document.createElement('button');
      btn.style.cssText = 'padding:6px;border-radius:6px;border:2px solid transparent;' +
        'background:rgba(255,255,255,0.08);cursor:pointer;font-size:18px;text-align:center;' +
        'transition:border-color 0.2s;position:relative';
      btn.title = loc.name + ' (' + loc.code + ')';
      if (loc.label) {
        btn.innerHTML = isoToFlag(loc.iso) +
          '<span style="position:absolute;bottom:0;right:0;font-size:7px;color:#4fc3f7;' +
          'background:rgba(0,0,0,0.7);border-radius:2px;padding:0 2px;line-height:1.2">' +
          loc.label + '</span>';
      } else {
        btn.textContent = isoToFlag(loc.iso);
      }
      if (loc.code === currentLocale) {
        btn.style.borderColor = '#4fc3f7';
        btn.style.background = 'rgba(79,195,247,0.15)';
      }
      btn.onclick = function() {
        try {
          localStorage.setItem('bim_ootb_config', JSON.stringify({ locale: loc.code }));
          localStorage.removeItem('bim_ootb_locale_' + currentLocale);
        } catch(e) { /* ignore */ }
        location.reload();
      };
      popup.appendChild(btn);
    });

    document.body.appendChild(popup);
    var style = document.createElement('style');
    style.textContent = '#ootb-flag-popup.active{display:grid!important}';
    document.head.appendChild(style);

    // Close on outside click
    document.addEventListener('click', function(e) {
      if (!popup.contains(e.target) && e.target.id !== 'header-flag-btn') {
        popup.classList.remove('active');
      }
    });
  }

  // ── Update any element with id="header-flag-btn" to show current flag ──
  function updateHeaderFlag() {
    var btn = document.getElementById('header-flag-btn');
    if (!btn) return;
    // S265: don't overwrite if button has SVG icon (home icon in overflow)
    if (btn.querySelector('svg')) return;
    var currentIso = 'US';
    var currentLocale = detectLocale();
    AVAILABLE_LOCALES.forEach(function(loc) {
      if (loc.code === currentLocale) currentIso = loc.iso;
    });
    btn.textContent = isoToFlag(currentIso);
  }

  // ── Apply _TRL to DOM elements with data-trl attributes ──
  function applyTrlToDOM() {
    if (typeof _TRL === 'undefined') return;
    // data-trl="key" → textContent
    document.querySelectorAll('[data-trl]').forEach(function(el) {
      var key = el.getAttribute('data-trl');
      if (_TRL[key]) el.textContent = _TRL[key];
    });
    // data-trl-title="key" → title attribute
    document.querySelectorAll('[data-trl-title]').forEach(function(el) {
      var key = el.getAttribute('data-trl-title');
      if (_TRL[key]) el.title = _TRL[key];
    });
    // data-trl-placeholder="key" → placeholder attribute
    document.querySelectorAll('[data-trl-placeholder]').forEach(function(el) {
      var key = el.getAttribute('data-trl-placeholder');
      if (_TRL[key]) el.placeholder = _TRL[key];
    });
  }

  // ── Main init ──
  var localeCode = detectLocale();

  // If we have _TRL (from boq_charts.html inline _TRL_DEFAULTS), merge locale over it
  // If not (viewer page), create _TRL from scratch
  if (typeof _TRL === 'undefined') {
    // On pages that don't have _TRL_DEFAULTS inline, provide empty base
    window._TRL = {};
  }

  fetchLocale(localeCode, function(err, data) {
    if (data) {
      deepMerge(_TRL, data);
      applyRateOverrides(data);
    }
    applyUrlOverrides(_TRL);

    // Apply to DOM once loaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        applyTrlToDOM();
        updateHeaderFlag();
        showLocaleToast(localeCode);
      });
    } else {
      applyTrlToDOM();
      updateHeaderFlag();
      // Only toast on first load (no saved config)
      try {
        if (!localStorage.getItem('bim_ootb_config')) showLocaleToast(localeCode);
      } catch(e) { /* ignore */ }
    }

    // Dispatch event for other scripts to know locale is ready
    window.dispatchEvent(new CustomEvent('trl-ready', { detail: { locale: localeCode } }));
  });

  // Expose for other modules
  window._TRL_LOADER = {
    detectLocale: detectLocale,
    isoToFlag: isoToFlag,
    AVAILABLE_LOCALES: AVAILABLE_LOCALES,
    openFlagPicker: toggleFlagPicker
  };

})();
