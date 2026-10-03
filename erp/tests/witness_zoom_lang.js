// witness_zoom_lang.js — W-ZOOM-LANG (bim-compiler prompts/S226_localisation.md §R1).
// ISSUE IT PROVES OR DISPROVES: "the Viewer opens in a different language from the ERP that launched it."
//   (a)  each CHOSEN ERP UI code (erp/i18n/index.json, not the base en_US) rides in the Zoom Across Viewer URL (both launches)
//   (b)  the real viewer/locale_loader.js detectLocale() picks a Viewer locale of the SAME language for each code
//   (b2) the Viewer's own flag picker still wins in a tab opened with ?lang= (it rewrites the URL before reload)
//   (c)  negative control: loader without the §R1.2 mapping must FAIL on 'ar' — proves (b) can fail
// No browser. Run: node erp/tests/witness_zoom_lang.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
let pass = 0, fail = 0; const W = (ok, m) => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + m); return ok; };

const codes = JSON.parse(fs.readFileSync(path.join(ROOT, 'erp/i18n/index.json'), 'utf8')).locales.map(l => l.code);
console.log('§ZOOM_LANG codes=' + codes.length + ' ' + codes.join(','));

// ── (a) ERP launch URLs ──
const html = fs.readFileSync(path.join(ROOT, 'erp/idempiere.html'), 'utf8');
const zl = html.match(/function _zoomLang\(\)[^\n]*\n/);
function registerBlock(id) {
  const i = html.indexOf("window.ZoomAcross.register({\n      id: '" + id + "'");
  if (i < 0) return null;
  const j = html.indexOf('\n    });', i);
  return html.slice(i + 'window.ZoomAcross.register('.length, j + '\n    }'.length);
}
function launchUrl(id, lang) {
  const block = registerBlock(id); if (!block || !zl) return null;
  const opened = [];
  const win = { ErpI18n: lang ? { lang, BASE: 'en_US' } : undefined, open: u => opened.push(u) };
  const scope = { bld: 'Hospital', find: 'IfcWall', tm: { order: 77 } };
  const ctx = { window: win, location: { origin: 'http://h', pathname: '/erp/idempiere.html' }, console: { log() {} },
    _connectEnable() {}, _zoomScope: () => scope, _lastBimScope: null, status() {} };
  const src = 'var window=__w;' + zl[0] + 'var d=(' + block + ');d.launch({});';
  vm.runInNewContext(src, Object.assign({ __w: win }, ctx));
  return opened[0] || '';
}
for (const id of ['viewer', 'timemachine']) {
  if (!W(!!registerBlock(id) && !!zl, '(a) found Zoom Across launch "' + id + '" + _zoomLang in idempiere.html')) continue;
  const chosen = codes.filter(c => c !== 'en_US');
  let ok = 0; for (const c of chosen) { const u = launchUrl(id, c); if (new URL(u, 'http://h/erp/').searchParams.get('lang') === c) ok++; else console.log('  miss ' + id + ' ' + c + ' url=' + u); }
  W(chosen.length > 0 && ok === chosen.length, '(a) ' + id + ' URL carries lang= for ' + ok + '/' + chosen.length + ' chosen ERP languages');
  W(!/lang=/.test(launchUrl(id, 'en_US')), '(a) ' + id + ' URL has no lang= on the ERP base en_US (Viewer keeps its own saved locale + rates)');
  W(!/lang=/.test(launchUrl(id, null)), '(a) ' + id + ' URL has no lang= when ErpI18n is absent');
}

// ── (b) Viewer loader ──
const loaderSrc = fs.readFileSync(path.join(ROOT, 'viewer/locale_loader.js'), 'utf8');
function loadLoader(src, url, store) {
  const logs = []; const u = new URL(url);
  const el = () => ({ style: {}, classList: { toggle() {}, add() {}, remove() {} }, children: [], appendChild(c) { this.children.push(c); }, contains: () => false, getBoundingClientRect: () => ({ bottom: 0, left: 0 }) });
  const body = el(), head = el();
  const loc = { href: u.href, search: u.search, reload() { loc.reloaded = true; } };
  const win = { __TRL_NO_AUTORUN: true, location: loc };
  const sandbox = {
    window: win, location: loc, navigator: { language: 'en-US' }, URL, URLSearchParams,
    history: { replaceState(_, __, h) { const n = new URL(h); loc.href = n.href; loc.search = n.search; } },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    document: { getElementsByTagName: () => [{ src: 'http://h/viewer/locale_loader.js' }], getElementById: () => null, createElement: el, body, head, addEventListener() {}, querySelectorAll: () => [] },
    console: { log: m => logs.push(String(m)), warn() {} }, setTimeout() {}, CustomEvent: function () {}
  };
  vm.runInNewContext(src, sandbox);
  return { L: win._TRL_LOADER, logs, loc, body };
}
const VIEWER_CODES = loaderSrc.match(/code: '[a-z]{2}_[A-Z]{2}'/g).map(s => s.slice(7, -1));
function checkB(src, label) {
  let ok = 0, n = 0;
  for (const c of codes) {
    n++;
    const r = loadLoader(src, 'http://h/viewer/viewer.html?bld=Hospital&lang=' + c, {});
    const got = r.L.detectLocale(); const line = r.logs.find(l => l.startsWith('§TRL_DETECT')) || '';
    const same = VIEWER_CODES.includes(got) && got.split('_')[0] === c.split('_')[0] && / src=url(-mapped)? /.test(line);
    if (same) ok++; else console.log('  ' + label + ' miss ' + c + ' → ' + got + ' | ' + line);
    if (label === 'b') console.log('  ' + line);
  }
  return { ok, n };
}
const b = checkB(loaderSrc, 'b');
W(b.n > 0 && b.ok === b.n, '(b) Viewer picks the same language for ' + b.ok + '/' + b.n + ' ERP codes');

// ── (b2) the Viewer's own flag picker survives ?lang= ──
{
  const store = {};
  const r = loadLoader(loaderSrc, 'http://h/viewer/viewer.html?bld=Hospital&lang=ar', store);
  r.L.openFlagPicker();
  const popup = r.body.children[0]; const btn = popup && popup.children.find(x => /\(de_DE\)/.test(x.title));
  if (W(!!btn, '(b2) flag picker built, de_DE button found')) {
    btn.onclick();
    W(new URL(r.loc.href).searchParams.get('lang') === 'de_DE' && r.loc.reloaded, '(b2) click → URL lang=de_DE + reload (' + r.loc.search + ')');
    const r2 = loadLoader(loaderSrc, r.loc.href, store);
    W(r2.L.detectLocale() === 'de_DE', '(b2) after reload the Viewer is de_DE, not the ERP\'s ar');
  }
}

// ── (c) negative control: strip §R1.2 → 'ar' must fail ──
const stripped = loaderSrc.replace(/    \/\/ 1b\. S226 §R1\.2[\s\S]*?\n    }\n/, '');
W(stripped !== loaderSrc, '(c) §R1.2 block located and removed for the control');
const c = checkB(stripped, 'c');
W(c.ok < c.n, '(c) without §R1.2 the check FAILS (' + c.ok + '/' + c.n + ') — (b) is able to fail');

const verdict = codes.length === 0 ? 'INCONCLUSIVE' : (fail ? 'FAIL' : 'PASS');
console.log('§W-ZOOM-LANG ' + verdict + ' pass=' + pass + ' fail=' + fail);
process.exit(verdict === 'PASS' ? 0 : 1);
