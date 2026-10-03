// erp_i18n.js — UI language (locale) for the in-browser Kernel-ERP (idempiere.html).
// Spec: bim-compiler prompts/ERP_UI_LOCALES.md (§L1 model, §L2 packs, §L3 chrome catalogue, §L4 switch, §L5 RTL).
// Witness: W-ERP-I18N (erp/tests/witness_erp_i18n.js).
//
// iDempiere's model, ported — not invented:
//   * the base language lives in the AD tables themselves (ad_seed.db = en_US);
//   * a translation is an <Table>_Trl row keyed by the base row's ID (TranslationHandler: UPDATE … WHERE <T>_ID=…);
//   * centrally-maintained names follow their source (SynchronizeTerminology): a W/P/R/X menu takes its window /
//     process / form translation; a field takes its column's AD_Element translation (PO_Name in an IsSOTrx='N'
//     window), or its column's process translation for a button column; non-central rows use their own _Trl row.
//   The _Trl rows ship as one lazily-fetched file per locale (i18n/<lang>.json, built by tools/build_i18n.py from
//   the published language packs) — only the chosen language is downloaded. App-own chrome strings resolve through
//   i18n/chrome.json (AD_Message / AD_Element reference first, then a labelled machine entry, then English).
//
// The switch is IN PLACE: set(lang) loads the pack, flips <html lang/dir>, and calls every onChange listener; the
// host (idempiere.html) re-labels the open windows' objects and re-renders menu / tabs / toolbar / body without
// re-login and without touching the session, the open window, the current tab or the current record.
(function (global) {
  'use strict';
  var LOCALES = [   // code, CLDR autonym, writing direction (static so the pickers render with zero fetches)
    { code: 'en_US', native: 'English', dir: 'ltr', html: 'en' },
    { code: 'fr_FR', native: 'Français', dir: 'ltr', html: 'fr' },
    { code: 'es_ES', native: 'Español', dir: 'ltr', html: 'es' },
    { code: 'de_DE', native: 'Deutsch', dir: 'ltr', html: 'de' },
    { code: 'ar', native: 'العربية', dir: 'rtl', html: 'ar' },
    { code: 'zh_CN', native: '中文 (简体)', dir: 'ltr', html: 'zh-CN' },
    { code: 'ja_JP', native: '日本語', dir: 'ltr', html: 'ja' },
    { code: 'ms_MY', native: 'Bahasa Melayu', dir: 'ltr', html: 'ms' },
    { code: 'th_TH', native: 'ไทย', dir: 'ltr', html: 'th' }
  ];
  var BASE = 'en_US', LS_KEY = 'erp.lang';
  var _lang = BASE, _pack = null, _packs = {}, _cat = null, _catP = null, _listeners = [];
  var _db = null, _menuCentral = null, _fieldMeta = {};   // lazily-read dictionary facts for central resolution
  var _stats = null;

  function _loc(code) { for (var i = 0; i < LOCALES.length; i++) if (LOCALES[i].code === code) return LOCALES[i]; return null; }
  function _base() { var s = (document.currentScript && document.currentScript.src) || ''; return s ? s.replace(/[^/]*$/, '') : ''; }
  var _root = _base();
  function _fetchJson(path) {
    return fetch(_root + path, { cache: 'default' }).then(function (r) {
      if (!r.ok) throw new Error(path + ' HTTP ' + r.status); return r.json(); });
  }
  function loadCatalogue() {
    if (_cat) return Promise.resolve(_cat);
    if (!_catP) _catP = _fetchJson('i18n/chrome.json').then(function (c) { _cat = c.keys || {}; return _cat; })
      .catch(function (e) { console.warn('§I18N catalogue-fail ' + e.message); _cat = {}; return _cat; });
    return _catP;
  }
  function loadPack(code) {
    if (code === BASE) return Promise.resolve(null);
    if (_packs[code]) return Promise.resolve(_packs[code]);
    return _fetchJson('i18n/' + code + '.json').then(function (p) { _packs[code] = p; return p; });
  }
  function preload(codes) {
    codes = codes || LOCALES.map(function (l) { return l.code; });
    return Promise.all([loadCatalogue()].concat(codes.map(function (c) { return loadPack(c).catch(function () {}); })));
  }

  // ── stats: every label resolution is counted per switch so the §I18N line is measured, not asserted ──
  function _resetStats() { _stats = { menu: [0, 0], window: [0, 0], tab: [0, 0], field: [0, 0], chrome: [0, 0], pack: 0, machine: 0 }; }
  _resetStats();
  function _count(kind, translated, src) {
    var s = _stats[kind]; if (!s) return; s[1]++; if (translated) { s[0]++; if (src === 'machine') _stats.machine++; else _stats.pack++; }
  }

  // ── pack lookups (raw _Trl rows) ──
  function _trl(table, id) { if (!_pack || id == null) return null; var t = _pack[table + '_Trl']; if (!t) return null; var v = t[String(Math.round(Number(id)))]; return v == null ? null : v; }
  // labelled machine supplement (tools/build_i18n.py machine_fill → <T>_Trl_m): consulted only after every pack rule
  var _src = 'pack';
  function _trlm(table, id) { if (!_pack || id == null) return null; var t = _pack[table + '_Trl_m']; if (!t) return null; var v = t[String(Math.round(Number(id)))]; return v == null ? null : v; }
  function _orM(v, table, id) { _src = 'pack'; if (v) return v; var m = _trlm(table, id); if (m) _src = 'machine'; return m; }
  function msg(value) { if (!_pack) return null; var t = _pack.AD_Message_Trl; return t && t[value] != null ? t[value] : null; }
  function element(id, po) { var v = _trl('AD_Element', id); if (!v) return null; return (po && v[1]) ? v[1] : v[0]; }
  function refList(id, en) { var v = _trl('AD_Ref_List', id); return v || en; }
  function process(id) { return _trl('AD_Process', id); }

  // ── dictionary facts (read once from the loaded ad_seed db) ──
  function bindDb(db) { _db = db; _menuCentral = null; _fieldMeta = {}; }
  function _q(sql) { try { var r = _db.exec(sql); return r.length ? r[0].values : []; } catch (e) { return []; } }
  function _menuCentralSet() {
    if (_menuCentral) return _menuCentral;
    _menuCentral = {};
    _q("SELECT AD_Menu_ID FROM AD_Menu WHERE IsCentrallyMaintained='Y'").forEach(function (r) { _menuCentral[Math.round(r[0])] = true; });
    return _menuCentral;
  }
  function _fieldMetaFor(windowId) {
    if (_fieldMeta[windowId]) return _fieldMeta[windowId];
    var m = {};
    _q('SELECT f.AD_Field_ID, f.IsCentrallyMaintained, c.AD_Element_ID, c.AD_Process_ID, w.IsSOTrx FROM AD_Field f ' +
       'JOIN AD_Tab t ON t.AD_Tab_ID=f.AD_Tab_ID JOIN AD_Window w ON w.AD_Window_ID=t.AD_Window_ID ' +
       'LEFT JOIN AD_Column c ON c.AD_Column_ID=f.AD_Column_ID WHERE t.AD_Window_ID=' + Number(windowId))
      .forEach(function (r) { m[Math.round(r[0])] = { central: r[1] === 'Y', el: r[2], proc: r[3], po: r[4] === 'N' }; });
    return (_fieldMeta[windowId] = m);
  }

  // ── resolvers (SynchronizeTerminology semantics) ──
  function menuName(node) {
    var c = _menuCentralSet()[Math.round(Number(node.id))], v = null;
    if (c) {
      if (node.action === 'W' && node.windowId) v = _trl('AD_Window', node.windowId);
      else if ((node.action === 'P' || node.action === 'R') && node.processId) v = _trl('AD_Process', node.processId);
      else if (node.action === 'X' && node.formId) v = _trl('AD_Form', node.formId);
    }
    return _orM(v || _trl('AD_Menu', node.id), 'AD_Menu', node.id);
  }
  function fieldName(windowId, f) {
    var meta = _fieldMetaFor(windowId)[Math.round(Number(f.id))], v = null;
    if (meta && meta.central) {
      if (meta.proc) v = process(meta.proc);
      else if (meta.el != null) v = element(meta.el, meta.po);
    }
    return _orM(v || _trl('AD_Field', f.id), 'AD_Field', f.id);
  }

  // Mutate a menu tree's labels in place (English kept on node._en so English lookups never break).
  function applyMenuTree(roots) {
    (function walk(list) {
      (list || []).forEach(function (n) {
        if (n._en == null) n._en = n.name;
        var v = _pack ? menuName(n) : null;
        n.name = v || n._en; _count('menu', !!v, _src);
        walk(n.children);
      });
    })(roots);
    return roots;
  }
  // Mutate a window object (from ADParser.getWindow) in place: window, tab and field names.
  function applyWindow(win) {
    if (!win) return win;
    if (win._en == null) win._en = win.name;
    var wv = _pack ? _orM(_trl('AD_Window', win.id), 'AD_Window', win.id) : null; win.name = wv || win._en; _count('window', !!wv, _src);
    (win.tabs || []).forEach(function (t) {
      if (t._en == null) t._en = t.name;
      var tv = _pack ? _orM(_trl('AD_Tab', t.id), 'AD_Tab', t.id) : null; t.name = tv || t._en; _count('tab', !!tv, _src);
      (t.fields || []).forEach(function (f) {
        if (f._en == null) f._en = f.name;
        var fv = (_pack && f.id != null) ? fieldName(win.id, f) : null;
        f.name = fv || f._en;
        if (f.isDisplayed && !f.isKey) _count('field', !!fv, _src);
      });
    });
    return win;
  }
  function windowName(id, en) { var v = _pack ? _orM(_trl('AD_Window', id), 'AD_Window', id) : null; return v || en; }

  // ── chrome catalogue: t(key, args) ──
  function _ref(ref) {
    if (!ref || !_pack) return null;
    var p = ref.split(':');
    if (p[0] === 'msg') return msg(p[1]);
    if (p[0] === 'el') return element(Number(p[1]), false);
    return null;
  }
  function t(key, args) {
    var e = _cat && _cat[key];
    if (!e) return key;
    var out = e.en, src = 'none';
    if (_lang !== BASE) {
      var v = _ref(e.ref);
      if (v) { out = e.fmt ? e.fmt.replace('{}', v) : v; src = 'pack'; }
      else if (e.machine && e.machine[_lang]) { out = e.machine[_lang]; src = 'machine'; }
    }
    _count('chrome', src !== 'none', src);
    if (args) out = out.replace(/\{(\d)\}/g, function (_, i) { return args[i] != null ? args[i] : ''; });
    return out;
  }
  // Re-label static markup: [data-i18n] text, [data-i18n-html] html, [data-i18n-ph] placeholder, [data-i18n-title] title.
  function applyDom(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach(function (n) { n.textContent = t(n.getAttribute('data-i18n')); });
    root.querySelectorAll('[data-i18n-html]').forEach(function (n) { n.innerHTML = t(n.getAttribute('data-i18n-html')); });
    root.querySelectorAll('[data-i18n-ph]').forEach(function (n) { n.placeholder = t(n.getAttribute('data-i18n-ph')); });
    root.querySelectorAll('[data-i18n-title]').forEach(function (n) { n.title = t(n.getAttribute('data-i18n-title')); });
  }

  function _persist(code) { try { localStorage.setItem(LS_KEY, code); } catch (e) {} }
  function initial() {
    var q = null; try { q = new URLSearchParams(location.search).get('lang'); } catch (e) {}
    if (q && _loc(q)) return q;
    var s = null; try { s = localStorage.getItem(LS_KEY); } catch (e) {}
    return (s && _loc(s)) ? s : BASE;
  }
  // set(code) → Promise<{lang, dir, ms}>. Loads the pack, flips the document, runs listeners (the host re-render),
  // then logs the measured §I18N line. A failed pack fetch leaves the current language in place (logged).
  function set(code, opts) {
    var t0 = (global.performance ? performance.now() : Date.now());
    var L = _loc(code);
    if (!L) { console.warn('§I18N unknown-locale ' + code); return Promise.resolve(null); }
    return Promise.all([loadCatalogue(), loadPack(code)]).then(function (res) {
      _lang = code; _pack = res[1]; _resetStats();
      var de = document.documentElement; de.lang = L.html; de.dir = L.dir;
      if (!(opts && opts.noPersist)) _persist(code);
      _listeners.forEach(function (fn) { try { fn(code, L); } catch (e) { console.warn('§I18N listener-err ' + e.message); } });
      var ms = Math.round((global.performance ? performance.now() : Date.now()) - t0);
      var s = _stats, tr = s.menu[0] + s.window[0] + s.tab[0] + s.field[0] + s.chrome[0], tot = s.menu[1] + s.window[1] + s.tab[1] + s.field[1] + s.chrome[1];
      console.log('§I18N lang=' + code + ' labels=' + tr + '/' + tot + ' dir=' + L.dir + ' ms=' + ms +
        ' menu=' + s.menu.join('/') + ' window=' + s.window.join('/') + ' tab=' + s.tab.join('/') + ' field=' + s.field.join('/') +
        ' chrome=' + s.chrome.join('/') + ' src=pack:' + s.pack + ',machine:' + s.machine +
        ' packRows=' + (_pack ? Object.keys(_pack.counts || {}).map(function (k) { return k.replace('AD_', '') + ':' + _pack.counts[k]; }).join(',') : 'base'));
      return { lang: code, dir: L.dir, ms: ms, stats: JSON.parse(JSON.stringify(s)) };
    }).catch(function (e) { console.warn('§I18N switch-fail lang=' + code + ' ' + e.message + ' — staying on ' + _lang); return null; });
  }
  function onChange(fn) { if (typeof fn === 'function') _listeners.push(fn); }
  // A <select> wired to set(); every picker mirrors the current language.
  function picker(sel) {
    sel.innerHTML = '';
    LOCALES.forEach(function (l) { var o = document.createElement('option'); o.value = l.code; o.textContent = l.native; o.lang = l.html; o.dir = l.dir; sel.appendChild(o); });
    sel.value = _lang;
    sel.addEventListener('change', function () { set(sel.value); });
    onChange(function (code) { if (sel.value !== code) sel.value = code; });
    return sel;
  }

  global.ErpI18n = {
    LOCALES: LOCALES, BASE: BASE,
    get lang() { return _lang; }, get dir() { var l = _loc(_lang); return l ? l.dir : 'ltr'; }, get pack() { return _pack; },
    initial: initial, set: set, preload: preload, onChange: onChange, picker: picker, bindDb: bindDb,
    t: t, has: function (k) { return !!(_cat && _cat[k]); }, msg: msg, element: element, refList: refList, applyDom: applyDom,
    applyMenuTree: applyMenuTree, applyWindow: applyWindow, windowName: windowName, menuName: menuName, fieldName: fieldName,
    loadCatalogue: loadCatalogue, stats: function () { return JSON.parse(JSON.stringify(_stats)); }
  };
})(typeof window !== 'undefined' ? window : this);
