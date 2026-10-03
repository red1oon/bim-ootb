#!/usr/bin/env node
// witness_viewer_i18n.js — W-VIEWER-I18N (bim-compiler prompts/S226_localisation.md §R2 SPEC R2.4).
//
// ISSUE IT PROVES OR DISPROVES: "a user who picks a language on the landing page still sees English on Viewer screens."
//
//  (1) CARRY-THROUGH  the REAL flag picker on index.html (locale_loader.js openFlagPicker → click) saves the locale; every
//                     Viewer page then opens in it: §TRL_DETECT src=saved … code=<x>, §TRL_LABELS locale=<x>, <html lang dir>.
//  (2) LEAK COUNT     per locale, per page: every text node / title / placeholder / data-tip / <title>. A string equal to a
//                     base English msgtext is a SLOT. leak = slot still English while the locale's XML row is trl="Y" with
//                     another text (WIRING) · slot whose row is trl="N" (GAP) · a string the English baseline run found
//                     UNCATALOGUED (English on screen that no key covers) showing again. §TRL_LEAK locale=<x> leaks=<n> of <total>.
//  (3) FORMAT         every AD_Message_Trl_*.xml parsed by Python xml.etree (independent of the Node builder): root/attrs,
//                     ids > 999999 unique, trl∈{Y,N}, original == CSV msgtext, MsgTip original="", full coverage; the shipped
//                     i18n/<code>.json == CSV⋈XML (build_trl.js --check); static English in the pages == CSV msgtext.
//  (4) CONTROL        de_DE saved but i18n/de_DE.json ABORTED → the page falls back to English → the same counter must say
//                     leaks > 0. Proves (2) can fail.
//  (5) INCONCLUSIVE   whenever 0 slots were judged or no locale ran. Exit code is not evidence — READ THE LOG.
//
//  (2b) DRAWER       S226 §R2b (2026-10-04): the Time Machine / Gantt / What-if / Pull Back / P6 drawer (#time-machine-panel) is
//                     judged like every other surface and its population printed (§TRL_SCOPE … n=); n < 40 FAILS, so a drawer
//                     missing from the DOM cannot pass by absence. The real What-if popup (#whatif-panel) is opened via sql.js +
//                     erp/ad_seed.db and judged too; when it cannot open that is PRINTED as not judged (§TRL_WHATIF open=no), never passed.
//
//  (6) IN PLACE      S226 §R2c (2026-10-04): on viewer.html WITH a real building (buildings/warehouse_gardenworld.db, 61 KB) the
//                     language is switched IN PLACE through every locale (first switch via the REAL flag picker click, the rest
//                     via _TRL_LOADER.setLocale): no navigation, the page marker / building element count / camera survive, and
//                     the same leak counter runs after each switch (§TRL_INPLACE …). The Info panel's 4D block (info_4d_panel.js,
//                     rendered from a stubbed schedule) must re-render in the new language. CONTROL: a once-built English
//                     node + the dictionary re-translation pass disabled (window.__TRL_SWITCH_NO_RETRANSLATE) → leaks > 0.
//                     `--only inplace` runs just (6).
// No GPU: headless chromium with --disable-gpu (software GL). Pages are opened WITHOUT a building (?blank=1) — the strings
// under test are the static chrome. Logs: viewer/tests/logs/witness_viewer_i18n.log (verdicts) + .page.log (every console line).
// Run:  NODE_PATH=~/bim-ootb/node_modules node viewer/tests/witness_viewer_i18n.js [--locales de_DE,ar_SA] [--pages landing,viewer]
/* global showPortalFresh, openHub, buildRail, _railWrap, toggleMobilePill, clearCache */
'use strict';
const os = require('os'), http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process');
const { chromium } = require(process.env.PW || (os.homedir() + '/bim-ootb/tests/node_modules/playwright'));
const { Witness } = require('../../witness_kit/contract');
const T = require('../tools/trl_common');

const REPO = path.join(__dirname, '..', '..'), VIEWER = path.join(REPO, 'viewer');
const LOGDIR = path.join(__dirname, 'logs'); fs.mkdirSync(LOGDIR, { recursive: true });
const LOGF = path.join(LOGDIR, 'witness_viewer_i18n.log'), PAGELOGF = path.join(LOGDIR, 'witness_viewer_i18n.page.log');
const ERP9 = ['en_MY', 'fr_FR', 'es_ES', 'de_DE', 'ar_SA', 'zh_CN', 'ja_JP', 'ms_MY', 'th_TH'];   // the 9 the ERP has (en_MY stands for en)
const argOf = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const LOCALES = (argOf('--locales') ? argOf('--locales').split(',') : T.LOCALES.slice()).filter(l => T.LOCALES.includes(l));
if (!LOCALES.includes(T.BASE)) LOCALES.unshift(T.BASE);   // the English baseline always runs first
const PAGES = [
  { id: 'landing', url: '/index.html?x=1' },
  { id: 'viewer', url: '/viewer/viewer.html?blank=1&ghost=1' },
  { id: 'boq', url: '/viewer/boq_charts.html' },
  { id: 'clash', url: '/viewer/clash_report.html' },
  { id: 'mep', url: '/viewer/mep_report.html' }
].filter(p => !argOf('--pages') || argOf('--pages').split(',').includes(p.id));

const OUT = []; const say = (s) => { OUT.push(s); console.log(s); };
const PAGELOG = []; const ERRS = [];
let pass = 0, fail = 0; const W = (ok, m) => { ok ? pass++ : fail++; say((ok ? 'PASS ' : 'FAIL ') + m); return ok; };

// ── static server over the worktree root ─────────────────────────────────────────────────────────────────────────
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.db': 'application/octet-stream', '.xml': 'application/xml' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  fs.readFile(path.join(REPO, p === '/' ? '/index.html' : p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Content-Length': buf.length }); res.end(buf);
  });
});

// ── the dictionary (sources, not the built JSON) ─────────────────────────────────────────────────────────────────
const BASE = T.readBase();                                   // [{id, value, msgtext, msgtype}]
const EN_BY_TEXT = new Map(); BASE.forEach(r => { if (!EN_BY_TEXT.has(r.msgtext)) EN_BY_TEXT.set(r.msgtext, []); EN_BY_TEXT.get(r.msgtext).push(r); });
const BY_ID = new Map(BASE.map(r => [r.id, r]));
const XML = {};                                              // lang -> { byValue: Map(value -> {trl, text}) }
T.LOCALES.filter(l => l !== T.BASE).forEach(lang => {
  const x = T.parseTrlXml(fs.readFileSync(T.xmlFile(lang), 'utf8'));
  const byValue = new Map(); x.rows.forEach(r => { const b = BY_ID.get(r.id); if (b) byValue.set(b.value, { trl: r.trl, text: r.text }); });
  XML[lang] = { byValue, textSet: new Set(x.rows.filter(r => r.trl === 'Y').map(r => r.text)),
    tplPrefixes: Array.from(new Set(x.rows.filter(r => r.trl === 'Y' && r.text !== r.original).map(r => { const i = r.text.indexOf('{'); return i >= 4 ? r.text.slice(0, i) : ''; }).filter(Boolean))) };   // S226 §R2b
});
// English that is the same in every language by rule (S226 Translation Rules) — never a leak when it stays
const ALLOW = new Set(('BIM OOTB ERP IFC BOQ MEP GPS GUID WBS UOM CSV DXF DAE OBJ GLB GLTF 3DS FBX STL HTML PDF QR LOD MaxQ DEV ARC STR PLB ACMV ' +
  'ELEC FP VENT HEAT SAN COOL VOID OK SET DB ID UBBL GardenWorld iDempiere DAGeVu Excel WhatsApp GoatCounter Ctrl Alt Shift Esc Caps Lock ' +
  'mm cm km kg Hz RM USD EUR MYR SGD AUD GBP JPY CNY THB KRW BRL IDR BDT ZAR SAR X Y Z N S E W SMM2 HVAC PLB·ELEC·ACMV·FP IfcWall ' +
  'P6 MSP PMXML XER MSPDI EPS BAC PV').split(' '));   // S226 §R2b: the P6 / MS Project interchange acronyms on the TM drawer + EVM symbols on the What-if panel
// English kept on purpose (not leaks): the NLP example chips — the query parser (nlp.js) understands English; translating the
// examples would show users phrases the engine cannot run (the placeholder key ui_nlp_placeholder keeps them too).
const ALLOW_STRINGS = new Set(['count doors', 'floor 1 walls', 'total cost', 'show structure', 'find fire doors']);
// S226 §R2b (2026-10-04): the Time Machine / Gantt / What-if / Pull Back / P6 drawer is JUDGED like every other surface
// (it was §TRL_OUT_OF_SCOPE n=53 under §R2.3). Its root is counted so a drawer that is not in the DOM cannot pass by absence:
// §TRL_SCOPE page=viewer drawer=#time-machine-panel n=<strings>, FAIL when n < TM_MIN_STRINGS. The What-if popup
// (#whatif-panel, whatif_panel.js) is opened for real when sql.js + erp/ad_seed.db are reachable — §TRL_WHATIF open=yes|no.
const TM_DRAWER = '#time-machine-panel', TM_MIN_STRINGS = 40;
const EN_TEXTS_DESC = Array.from(new Set(BASE.map(r => r.msgtext))).filter(t => t.length >= 3).sort((a, b) => b.length - a.length);   // every base msgtext, longest first, stripped from a string before the English heuristic
// S226 §R2b — TEMPLATE SLOTS. A msgtext holding {placeholders} ('Compressed {n} tasks', 'drag to slip · official {a}→{b}') never
// appears on screen verbatim; the screen shows it filled in. Its static PREFIX (text before the first '{', ≥ 4 chars) identifies
// the family: a string starting with the English prefix is a SLOT, and for locale X it counts as translated only when it starts
// with X's own template prefix (X's text ≠ English) or X affirms the same text — otherwise it is still the English = a leak.
const tplPrefix = (s) => { const i = s.indexOf('{'); return i > 0 ? s.slice(0, i) : ''; };
const EN_TPL = []; (() => { const m = new Map(); BASE.forEach(r => { const p = tplPrefix(r.msgtext); if (p.length >= 4 && !EN_BY_TEXT.has(p)) { if (!m.has(p)) m.set(p, []); m.get(p).push(r); } }); m.forEach((rows, prefix) => EN_TPL.push({ prefix, rows })); EN_TPL.sort((a, b) => b.prefix.length - a.prefix.length); })();
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
function englishLooking(s) {   // the heuristic used on the ENGLISH baseline only: a Latin word ≥3 letters that is not allow-listed
  if (ALLOW_STRINGS.has(norm(s))) return false;
  let rest = norm(s); EN_TEXTS_DESC.forEach(t => { if (rest.includes(t)) rest = rest.split(t).join(' '); });   // 'Night · n' → '· n'
  const toks = rest.match(/[A-Za-z][A-Za-z'’\-]*/g) || [];
  return toks.some(t => t.length >= 3 && !ALLOW.has(t) && !ALLOW.has(t.toUpperCase()) && !/^v\d+$/i.test(t) && !/^Ifc[A-Z]/.test(t));
}

// ── in-page collector: text nodes + title + placeholder + data-tip + <title> ─────────────────────────────────────
async function collectStrings(page) {
  return page.evaluate(() => {
    const out = []; const seen = new Set();
    const push = (kind, text, el) => {
      text = String(text || '').replace(/\s+/g, ' ').trim(); if (!text) return;
      const k = kind + '|' + text; if (seen.has(k)) return; seen.add(k);
      let hidden = false; try { const cs = el && el.nodeType === 1 ? getComputedStyle(el) : null; hidden = !!(cs && (cs.display === 'none' || cs.visibility === 'hidden')) || !!(el && el.closest && el.closest('[style*="display:none"],[style*="display: none"]')); } catch (e) { /* detached */ }
      out.push({ kind, text, hidden, tm: !!(el && el.closest && el.closest('#time-machine-panel')), wi: !!(el && el.closest && el.closest('#whatif-panel')), sel: el && el.nodeType === 1 ? (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '')) : '' });
    };
    const skip = 'script,style,noscript,template,svg,canvas,#walk-log,#ootb-locale-toast,.hub-card .nm,#s-current-element,#load-elapsed,#tl-label,#section-val,#site-cam-time,#load-items,' +
      '#whatif-panel .wi-name,#whatif-panel h3 > span,#whatif-panel .wi-d';   // S226 §R2b: What-if phase names + project name are DB data (erp/ad_seed.db), the ±Nd steppers are numbers
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) { const n = walker.currentNode, p = n.parentElement; if (!p || p.closest(skip)) continue; push('text', n.textContent, p); }
    document.querySelectorAll('[title]').forEach(el => { if (!el.closest(skip)) push('title', el.getAttribute('title'), el); });
    document.querySelectorAll('[placeholder]').forEach(el => { if (!el.closest(skip)) push('placeholder', el.getAttribute('placeholder'), el); });
    document.querySelectorAll('[data-tip]').forEach(el => push('tip', el.getAttribute('data-tip'), el));
    if (document.title) push('doctitle', document.title, document.documentElement);
    const toast = document.getElementById('ootb-locale-toast');
    return { toast: toast ? toast.textContent : null, strings: out, lang: document.documentElement.getAttribute('lang'), dir: document.documentElement.getAttribute('dir') };
  });
}

// ── judge one page's strings for one locale ──────────────────────────────────────────────────────────────────────
const BASELINE_UNCAT = {};   // page id -> Set(strings) found uncatalogued on the English run
const WHATIF_OPEN = {};      // lang -> 'open' | reason the What-if popup could not be opened (S226 §R2b)
function judge(lang, pageId, strings) {
  const r = { slots: 0, wiring: [], gap: [], uncat: [], tm: 0, wi: 0, translated: 0, total: 0 };
  const x = XML[lang];
  strings.forEach(s => {
    const t = s.text;
    if (s.tm) r.tm++;   // S226 §R2b: counted (anti-vacuous), AND judged below like every other string
    if (s.wi) r.wi++;
    const enRows = EN_BY_TEXT.get(t);
    if (enRows) {
      r.slots++;
      if (lang === T.BASE) return;
      // the SAME English may be the msgtext of several keys; it is a leak only if NO key for it stays English by right
      const rows = enRows.map(b => x.byValue.get(b.value) || { trl: 'N', text: b.msgtext });
      if (rows.some(row => row.trl === 'Y' && row.text === t)) return;                 // affirmed same (acronym / same word)
      if (/^en_/.test(lang) && rows.every(row => row.text === t)) return;              // an English variant (en_US/en_GB/en_AU): the base English IS its text; trl="N" there is not a gap
      if (rows.every(row => row.trl === 'N')) r.gap.push(t + ' [' + enRows.map(b => b.value).join('|') + ']');
      else r.wiring.push(t + ' [' + enRows.map(b => b.value).join('|') + '] → ' + rows.find(row => row.trl === 'Y').text);
      return;
    }
    if (lang !== T.BASE && x.textSet.has(t)) { r.slots++; r.translated++; return; }
    const tpl = EN_TPL.find(p => t.startsWith(p.prefix));   // S226 §R2b template slot (English prefix)
    if (tpl) {
      r.slots++;
      if (lang === T.BASE) return;
      const rows = tpl.rows.map(b => x.byValue.get(b.value) || { trl: 'N', text: b.msgtext });
      if (rows.some((row, i) => row.trl === 'Y' && (row.text === tpl.rows[i].msgtext || (tplPrefix(row.text).length > 0 && row.text !== tpl.rows[i].msgtext && t.startsWith(tplPrefix(row.text)))))) { r.translated++; return; }
      if (/^en_/.test(lang) && rows.every((row, i) => row.text === tpl.rows[i].msgtext)) return;
      if (rows.every(row => row.trl === 'N')) r.gap.push(t.slice(0, 50) + ' [' + tpl.rows.map(b => b.value).join('|') + ']');
      else r.wiring.push(t.slice(0, 50) + ' [' + tpl.rows.map(b => b.value).join('|') + '] → ' + rows.find(row => row.trl === 'Y').text.slice(0, 40));
      return;
    }
    if (lang !== T.BASE && x.tplPrefixes.some(p => t.startsWith(p))) { r.slots++; r.translated++; return; }   // a filled-in template in X's own words
    if (lang === T.BASE) { if (englishLooking(t)) r.uncat.push(t + (s.hidden ? ' (hidden)' : '') + ' <' + s.kind + (s.sel ? ' ' + s.sel : '') + '>'); return; }
    if (BASELINE_UNCAT[pageId] && BASELINE_UNCAT[pageId].has(t)) r.uncat.push(t + ' <' + s.kind + '>');
  });
  if (lang === T.BASE) BASELINE_UNCAT[pageId] = new Set(r.uncat.map(u => u.replace(/( \(hidden\))? <[^>]*>$/, '')));
  r.total = r.slots + r.uncat.length;
  r.leaks = r.wiring.length + r.gap.length + r.uncat.length;
  return r;
}

// ── page helpers ─────────────────────────────────────────────────────────────────────────────────────────────────
function tail(mark) { return PAGELOG.length - 0 - (mark || 0); }
function linesSince(n) { return PAGELOG.slice(n); }
async function openPage(page, base, pg, saved) {
  const n0 = PAGELOG.length;
  await page.goto(base + pg.url, { waitUntil: 'load', timeout: 90000 });
  if (saved) { /* localStorage was set on this origin already */ }
  await page.waitForFunction(() => window._TRL_READY === true, null, { timeout: 60000 }).catch(() => PAGELOG.push('TIMEOUT trl-ready ' + pg.id));
  if (pg.id === 'landing') {
    await page.evaluate(() => { try { localStorage.setItem('mx_entered', '1'); } catch (e) { /* */ } if (typeof showPortalFresh === 'function') showPortalFresh(); if (typeof openHub === 'function') openHub(); });
    await page.waitForFunction(() => document.querySelectorAll('#hub .hub-card').length > 1 || /fail/.test(document.getElementById('hub-status') ? document.getElementById('hub-status').textContent : ''), null, { timeout: 20000 }).catch(() => PAGELOG.push('TIMEOUT hub cards'));
    await page.waitForFunction(() => document.querySelectorAll('#portal-stage .por-ic').length >= 8, null, { timeout: 10000 }).catch(() => PAGELOG.push('TIMEOUT launchers'));
    await page.evaluate(() => { if (typeof buildRail === 'function') buildRail(); if (window._railWrap) _railWrap.style.display = 'flex'; });
  }
  if (pg.id === 'viewer') {
    await page.waitForFunction(() => Array.isArray(window._mainPillActions) && window._mainPillActions.length > 0 && document.querySelectorAll('#mobile-pill button').length > 0, null, { timeout: 60000 }).catch(() => PAGELOG.push('TIMEOUT pill ' + pg.id));
    await page.evaluate(() => { try { if (typeof toggleMobilePill === 'function') toggleMobilePill(); } catch (e) { /* */ } });   // open the rail so the drawer titles exist
    await page.waitForTimeout(600);
    // S226 §R2b: open the REAL What-if popup (whatif_panel.js) — it needs sql.js + the ERP seed (erp/ad_seed.db, C_Project
    // 990000 'BIM: Hospital', 7 phases). ?blank=1 never initialises sql.js, so the witness does what streaming.js would.
    const wi = await page.evaluate(async () => {
      try {
        if (!window.WhatIfPanel || !window.WhatIf) return 'no WhatIfPanel';
        if (!window.SQL && typeof initSqlJs === 'function') window.SQL = await initSqlJs({ locateFile: f => 'lib/' + f });
        if (!window.SQL) return 'no sql.js';
        window.WhatIfPanel.open();
        for (let i = 0; i < 300; i++) { if (document.querySelector('#whatif-panel .wi-row')) return 'open'; await new Promise(r => setTimeout(r, 100)); }
        return 'timeout (status=' + ((window.APP || window.A || {}).status || {}).textContent + ')';
      } catch (e) { return 'ERR ' + e.message; }
    });
    PAGELOG.push('WHATIF ' + wi); WHATIF_OPEN[page._tmLang || ''] = wi;
  }
  if (pg.id === 'boq' || pg.id === 'clash' || pg.id === 'mep') await page.waitForTimeout(1500);   // the no-DB message settles
  return linesSince(n0);
}
const find = (lines, re) => { for (let i = lines.length - 1; i >= 0; i--) if (re.test(lines[i])) return lines[i]; return ''; };   // LAST match: console events of the previous load can arrive late

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port;
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });   // software rendering ONLY — never the GPU
  say('§W-VIEWER-I18N start served=' + REPO + ' gpu=disabled locales=' + LOCALES.join(',') + ' pages=' + PAGES.map(p => p.id).join(','));

  const ONLY = argOf('--only');
  if (ONLY === 'inplace') { await inplace(browser, base); await browser.close(); server.close(); return finish([], true); }
  // ── (3) FORMAT — Python xml.etree as the independent oracle; the CSV is the truth for `original` ──────────────
  const py = cp.spawnSync('python3', ['-c', `
import xml.etree.ElementTree as ET, glob, json, os, sys, csv
d = sys.argv[1]; base = {}
with open(os.path.join(d, 'ad_message_base.csv'), newline='', encoding='utf-8') as f:
    for row in csv.DictReader(f): base[int(row['ad_message_id'])] = row
out = {'files': {}, 'base': len(base), 'badIds': [i for i in base if i <= 999999]}
for fn in sorted(glob.glob(os.path.join(d, 'AD_Message_Trl_*.xml'))):
    lang = os.path.basename(fn)[len('AD_Message_Trl_'):-4]; r = ET.parse(fn).getroot(); rows = r.findall('row')
    ids = [int(x.get('id')) for x in rows]
    bad = []
    if r.tag != 'idempiereTrl': bad.append('root ' + r.tag)
    if r.get('table') != 'AD_Message': bad.append('table ' + str(r.get('table')))
    if r.get('language') != lang: bad.append('language ' + str(r.get('language')))
    if len(set(ids)) != len(ids): bad.append('dup ids')
    if any(i <= 999999 for i in ids): bad.append('official id')
    if set(ids) != set(base): bad.append('coverage %d/%d' % (len(set(ids) & set(base)), len(base)))
    y = n = 0
    for x in rows:
        if x.get('trl') not in ('Y', 'N'): bad.append('trl ' + str(x.get('trl'))); break
        vals = x.findall('value'); cols = [v.get('column') for v in vals]
        if cols != ['MsgText', 'MsgTip']: bad.append('columns %s row %s' % (cols, x.get('id'))); break
        b = base.get(int(x.get('id')))
        if b is None or vals[0].get('original') != b['msgtext']: bad.append('original != csv row ' + x.get('id')); break
        if vals[1].get('original') != '': bad.append('MsgTip original row ' + x.get('id')); break
        if x.get('trl') == 'Y': y += 1
        else:
            n += 1
            if (vals[0].text or '') != b['msgtext']: bad.append('trl=N text != English row ' + x.get('id')); break
    out['files'][lang] = {'rows': len(rows), 'trlY': y, 'trlN': n, 'bad': bad}
print(json.dumps(out))`, T.I18N], { encoding: 'utf8' });
  let fmt = null; try { fmt = JSON.parse(py.stdout.trim().split('\n').pop()); } catch (e) { say('python oracle failed: ' + (py.stderr || py.stdout || e.message).slice(0, 400)); }
  if (fmt) {
    const langs = Object.keys(fmt.files); const bad = langs.filter(l => fmt.files[l].bad.length);
    W(langs.length === T.LOCALES.length - 1 && fmt.badIds.length === 0, '(3) ' + langs.length + ' AD_Message_Trl_*.xml files, base rows=' + fmt.base + ' all ids > 999999');
    langs.forEach(l => { const f = fmt.files[l]; say('  §TRL_XML lang=' + l + ' rows=' + f.rows + ' trlY=' + f.trlY + ' trlN=' + f.trlN + (f.bad.length ? ' BAD=' + f.bad.join(';') : ' format=ok')); });
    W(bad.length === 0, '(3) iDempiere Translation export format (root/attrs/row/trl/MsgText original==CSV/MsgTip/coverage) — ' + (bad.length ? 'BAD: ' + bad.join(',') : 'every file'));
  } else W(false, '(3) python xml.etree oracle ran');
  const chk = cp.spawnSync('node', [path.join(VIEWER, 'tools', 'build_trl.js'), '--check'], { encoding: 'utf8' });
  W(chk.status === 0, '(3) shipped i18n/<code>.json == CSV ⋈ XML (build_trl.js --check): ' + (chk.stdout.trim().split('\n').pop() || chk.stderr.slice(0, 200)));

  // (3b) the static English in the pages and the in-code defaults equal the CSV msgtext — so `original` stays true to the screen
  {
    const dec = (s) => s.replace(/&mdash;/g, '—').replace(/&larr;/g, '←').replace(/&rarr;/g, '→').replace(/&hellip;/g, '…').replace(/&times;/g, '×').replace(/&middot;/g, '·')
      .replace(/&amp;/g, '&').replace(/&#8595;/g, '↓').replace(/&#10133;/g, '➕').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)));
    const unjs = (s) => s.replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    const byValue = new Map(BASE.map(r => [r.value, r.msgtext]));
    const mism = [], unknown = []; let checked = 0;
    const files = ['index.html', 'viewer/viewer.html', 'viewer/boq_charts.html', 'viewer/clash_report.html', 'viewer/mep_report.html',
      ...fs.readdirSync(VIEWER).filter(f => /\.js$/.test(f)).map(f => 'viewer/' + f)];
    files.forEach(f => {
      const src = fs.readFileSync(path.join(REPO, f), 'utf8');
      let m; const re1 = /data-trl="(\w+)"[^>]*>([^<'{]*)</g;
      while ((m = re1.exec(src))) { if (!m[2].trim() || m[1] === 'source_app') continue; /* source_app: brand placeholder differs on purpose (pre-existing) */ checked++; const want = byValue.get(m[1]); if (want == null) unknown.push(f + ':' + m[1]); else if (norm(dec(m[2])) !== norm(want)) mism.push(f + ':' + m[1] + ' page=' + JSON.stringify(norm(dec(m[2]))) + ' csv=' + JSON.stringify(want)); }
      const re2 = /data-trl-(title|tip)="(\w+)"[^>]*\s(?:title|data-tip)="([^"]*)"/g;
      const isJs = /\.js$/.test(f);   // S226 §R2b: markup built inside a JS string carries \' for an apostrophe
      while ((m = re2.exec(src))) { checked++; const want = byValue.get(m[2]); const attr = isJs ? unjs(m[3]) : m[3]; if (want == null) unknown.push(f + ':' + m[2]); else if (norm(dec(attr)) !== norm(want)) mism.push(f + ':' + m[2] + ' attr=' + JSON.stringify(attr) + ' csv=' + JSON.stringify(want)); }
      // in-code defaults: _trl(k, repl, 'dflt') · _trlD(k, 'dflt') / _trlD(k, repl, 'dflt') · _lt(k, 'dflt') · clash_report _t(k, 'dflt')
      // S226 §R2b: time_machine.js _tmTrl(k, 'dflt'[, repl]) + its sandbox-safe local _L(k, 'dflt'[, repl]) · whatif_panel.js _wiTrl(k, 'dflt'[, repl])
      const re3 = /\b(_trl|_trlD|_lt|_t|_tmTrl|_L|_wiTrl)\(\s*'(\w+)'\s*,\s*(?:(?:null|\{[^}]*\})\s*,\s*)?'((?:[^'\\]|\\.)*)'/g;
      while ((m = re3.exec(src))) {
        if (m[1] === '_t' && f !== 'viewer/clash_report.html') continue;   // mep_report.html's older _t(k, fb) carries its own short fallbacks by design
        if (m[1] === '_trl' && !/,\s*(?:null|\{[^}]*\})\s*,\s*'/.test(m[0])) continue;   // 2-arg _trl(key, repl) — no default to check
        checked++; const want = byValue.get(m[2]); if (want == null) unknown.push(f + ':' + m[2]); else if (unjs(m[3]) !== want) mism.push(f + ':' + m[2] + ' code=' + JSON.stringify(unjs(m[3]).slice(0, 60)) + ' csv=' + JSON.stringify(want.slice(0, 60)));
      }
    });
    W(mism.length === 0 && unknown.length === 0, '(3b) static English / in-code defaults == CSV msgtext: checked=' + checked + (mism.length ? ' MISMATCH ' + mism.slice(0, 6).join(' | ') : '') + (unknown.length ? ' UNKNOWN-KEY ' + unknown.slice(0, 6).join(',') : ''));
  }

  // ── (1)+(2) per locale ────────────────────────────────────────────────────────────────────────────────────────
  const ROWS = [];
  for (const lang of LOCALES) {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage(); page._tmLang = lang;
    page.on('console', m => PAGELOG.push('[' + lang + '] ' + m.text()));
    page.on('pageerror', e => { ERRS.push(lang + ': ' + e); PAGELOG.push('[' + lang + '] PAGEERR ' + e); });
    page.on('dialog', async d => { PAGELOG.push('[' + lang + '] DIALOG ' + d.message().slice(0, 80)); await d.dismiss(); });
    const row = { lang, carry: false, detectSrc: '', htmlLang: '', dir: '', pages: 0, slots: 0, total: 0, leaks: 0, wiring: 0, gap: 0, uncat: 0, errs: 0, confirmOk: null };
    // (1) pick on the landing page through the REAL picker
    await page.goto(base + '/index.html', { waitUntil: 'load', timeout: 90000 });
    await page.evaluate(() => { try { localStorage.setItem('mx_entered', '1'); localStorage.removeItem('bim_ootb_config'); } catch (e) { /* */ } });
    await page.waitForFunction(() => !!(window._TRL_LOADER && window._TRL_LOADER.openFlagPicker), null, { timeout: 30000 });
    const clicked = await page.evaluate((code) => {
      window._TRL_LOADER.openFlagPicker();
      const btn = Array.from(document.querySelectorAll('#ootb-flag-popup button')).find(b => (b.title || '').endsWith('(' + code + ')'));
      if (!btn) return 'no button for ' + code;
      btn.click(); return 'clicked';   // the real handler: saves bim_ootb_config.locale (+ clears caches) and reloads
    }, lang);
    await page.waitForLoadState('load'); await page.waitForTimeout(800);
    const savedCfg = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('bim_ootb_config')).locale; } catch (e) { return null; } });
    W(clicked === 'clicked' && savedCfg === lang, '(1) ' + lang + ' landing flag picker click → bim_ootb_config.locale=' + savedCfg);
    let carryAll = true; const perPage = [];
    for (const pg of PAGES) {
      const lines = await openPage(page, base, pg);
      const det = find(lines, /§TRL_DETECT /), lab = find(lines, /§TRL_LABELS /);
      const detOk = new RegExp('§TRL_DETECT src=saved req=- code=' + lang + '$').test(det.replace(/^\[[^\]]+\] /, ''));
      const labOk = new RegExp('§TRL_LABELS locale=' + lang + ' ').test(lab) && !/src=fallback/.test(lab);
      const col = await collectStrings(page);
      const wantLang = lang === 'bl_BD' ? 'bn-Latn' : lang.split('_')[0], wantDir = lang === 'ar_SA' ? 'rtl' : 'ltr';
      const attrOk = col.lang === wantLang && col.dir === wantDir;
      if (!(detOk && labOk && attrOk)) carryAll = false;
      row.detectSrc = det.replace(/^\[[^\]]+\] /, ''); row.htmlLang = col.lang; row.dir = col.dir;
      say('  §TRL_CARRY locale=' + lang + ' page=' + pg.id + ' detect=' + (detOk ? 'saved' : 'WRONG:' + det.slice(0, 60)) + ' labels=' + (labOk ? lab.replace(/^.*src=/, 'src=') : 'WRONG:' + lab.slice(0, 60)) + ' html.lang=' + col.lang + ' dir=' + col.dir + (attrOk ? '' : ' WRONG'));
      if (col.toast != null) { const hint = lang === T.BASE ? 'change in ⚙' : ((XML[lang].byValue.get('ui_locale_toast_hint') || {}).text || 'change in ⚙'); const ok = col.toast.endsWith('— ' + hint); if (!ok) row.toastBad = (row.toastBad || 0) + 1; say('  §TRL_TOAST locale=' + lang + ' page=' + pg.id + ' text=' + JSON.stringify(col.toast) + (ok ? ' ok' : ' MISMATCH want-suffix=' + JSON.stringify(hint))); }
      const j = judge(lang, pg.id, col.strings);
      perPage.push(j); row.pages++; row.slots += j.slots; row.total += j.total; row.leaks += j.leaks; row.wiring += j.wiring.length; row.gap += j.gap.length; row.uncat += j.uncat.length;
      if (pg.id === 'viewer') {   // S226 §R2b — the drawer and the What-if popup are judged; their populations are printed so a 0 cannot hide
        const wiState = WHATIF_OPEN[lang] || 'not attempted';
        say('  §TRL_SCOPE locale=' + lang + ' page=viewer drawer=' + TM_DRAWER + ' n=' + j.tm + ' whatif=#whatif-panel n=' + j.wi + ' open=' + (wiState === 'open' ? 'yes' : 'no (' + wiState + ')'));
        row.tmStrings = (row.tmStrings || 0) + j.tm; row.wiStrings = (row.wiStrings || 0) + j.wi; row.wiOpen = wiState === 'open';
      }
      if (lang === T.BASE) say('  §TRL_UNCATALOGUED page=' + pg.id + ' n=' + j.uncat.length + (j.uncat.length ? ' [' + j.uncat.join(' · ') + ']' : '') + ' slots=' + j.slots);
      else say('  §TRL_LEAK locale=' + lang + ' page=' + pg.id + ' leaks=' + j.leaks + ' of ' + j.total + ' (translated=' + j.translated + ' wiring=' + j.wiring.length + ' gap=' + j.gap.length + ' uncat=' + j.uncat.length + ')' +
        (j.leaks ? ' [' + j.wiring.map(s => 'W:' + s).concat(j.gap.map(s => 'G:' + s), j.uncat.map(s => 'U:' + s)).join(' · ') + ']' : ''));
      // the confirm() popup on the landing page — a dialog string, judged by value
      if (pg.id === 'landing') {
        const msg = await page.evaluate(() => new Promise(res => { const o = window.confirm; window.confirm = (m) => { window.confirm = o; res(m); return false; }; try { clearCache(); } catch (e) { res('ERR ' + e.message); } }));
        const want = lang === T.BASE ? BY_ID.get(BASE.find(r => r.value === 'landing_clear_confirm').id).msgtext : (XML[lang].byValue.get('landing_clear_confirm') || {}).text;
        row.confirmOk = msg === want; say('  §TRL_DIALOG locale=' + lang + ' confirm=' + (row.confirmOk ? 'ok' : 'MISMATCH ' + JSON.stringify(String(msg).slice(0, 50))) + ' first-line=' + JSON.stringify(String(msg).split('\n')[0]));
      }
    }
    row.carry = carryAll; row.errs = ERRS.filter(e => e.startsWith(lang + ':')).length;
    W(carryAll, '(1) ' + lang + ' carries through all ' + PAGES.length + ' pages (§TRL_DETECT src=saved, §TRL_LABELS, <html lang=' + row.htmlLang + ' dir=' + row.dir + '>)');
    if (PAGES.some(p => p.id === 'viewer')) {   // (2b) S226 §R2b — the drawer was judged on a real population (not absent), the What-if popup too when it opened
      W((row.tmStrings || 0) >= TM_MIN_STRINGS, '(2b) ' + lang + ' Time Machine drawer judged: ' + (row.tmStrings || 0) + ' strings inside ' + TM_DRAWER + ' (min ' + TM_MIN_STRINGS + '; was §TRL_OUT_OF_SCOPE n=53)');
      if (row.wiOpen) W((row.wiStrings || 0) >= 8, '(2b) ' + lang + ' What-if popup judged: ' + (row.wiStrings || 0) + ' strings inside #whatif-panel');
      else say('  §TRL_WHATIF locale=' + lang + ' open=no — popup NOT judged (' + (WHATIF_OPEN[lang] || 'not attempted') + ')');
    }
    if (lang !== T.BASE) say('§TRL_LEAK locale=' + lang + ' leaks=' + row.leaks + ' of ' + row.total + ' wiring=' + row.wiring + ' gap=' + row.gap + ' uncat=' + row.uncat + ' pages=' + row.pages);
    else say('§TRL_BASELINE locale=' + lang + ' slots=' + row.slots + ' uncatalogued=' + row.uncat + ' pages=' + row.pages);
    ROWS.push(row);
    await ctx.close();
  }

  // ── (4) NEGATIVE CONTROL — de_DE saved, its label pack aborted → the counter must see English ───────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } }); const page = await ctx.newPage();
    const n0 = PAGELOG.length; page.on('console', m => PAGELOG.push('[control] ' + m.text()));
    await page.route('**/i18n/de_DE.json*', r => r.abort());
    await page.goto(base + '/viewer/mep_report.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window._TRL_READY === true, null, { timeout: 30000 }).catch(() => {});
    await page.evaluate(() => { localStorage.setItem('bim_ootb_config', JSON.stringify({ locale: 'de_DE' })); localStorage.removeItem('bim_ootb_trl_de_DE'); });
    const lines = await openPage(page, base, PAGES.find(p => p.id === 'mep') || PAGES[PAGES.length - 1]);
    const lab = find(lines, /§TRL_LABELS /); const col = await collectStrings(page);
    const j = judge('de_DE', 'mep', col.strings);
    W(/src=fallback/.test(lab) && j.leaks > 0, '(4) control: de_DE with i18n/de_DE.json aborted → ' + lab.replace(/^\[[^\]]+\] /, '') + ' → §TRL_LEAK_CONTROL leaks=' + j.leaks + ' of ' + j.total + ' expected>0');
    await ctx.close(); void n0;
  }
  await inplace(browser, base);
  await browser.close(); server.close();
  finish(ROWS, false);
})().catch(e => { say('§W-VIEWER-I18N CRASH ' + (e && e.stack || e)); fs.writeFileSync(LOGF, OUT.join('\n') + '\n'); fs.writeFileSync(PAGELOGF, PAGELOG.join('\n') + '\n'); process.exit(2); });

// ── (6) IN PLACE — S226 §R2c ───────────────────────────────────────────────────────────────────────────────────────
const INPLACE = { judged: 0, switches: 0 };
async function inplace(browser, base) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } }); const page = await ctx.newPage();
  page.on('console', m => PAGELOG.push('[inplace] ' + m.text()));
  page.on('pageerror', e => { ERRS.push('inplace: ' + e); PAGELOG.push('[inplace] PAGEERR ' + e); });
  page.on('dialog', async d => { await d.dismiss(); });
  let navs = 0; page.on('framenavigated', f => { if (f === page.mainFrame()) navs++; });
  await page.goto(base + '/index.html', { waitUntil: 'load' });
  await page.evaluate((b) => { localStorage.setItem('mx_entered', '1'); localStorage.setItem('bim_ootb_config', JSON.stringify({ locale: b })); }, T.BASE);
  await page.goto(base + '/viewer/viewer.html?db=../buildings/warehouse_gardenworld.db', { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window._TRL_READY === true, null, { timeout: 60000 }).catch(() => PAGELOG.push('[inplace] TIMEOUT trl-ready'));
  await page.waitForFunction(() => window.APP && window.APP.streaming === false && !(window.APP._bboxPlaceholders || []).length && window.APP.guidMap && Object.keys(window.APP.guidMap).length > 0, null, { timeout: 120000 }).catch(() => PAGELOG.push('[inplace] TIMEOUT stream'));
  await page.waitForFunction(() => Array.isArray(window._mainPillActions) && window._mainPillActions.length > 0, null, { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { try { if (typeof toggleMobilePill === 'function') toggleMobilePill(); } catch (e) { /* */ } });
  const sig = () => page.evaluate(() => {
    const A = window.APP || {}; const c = A.camera && A.camera.position;
    return { mark: window.__inplaceMark || null, elements: A.guidMap ? Object.keys(A.guidMap).length : -1, cam: c ? [c.x, c.y, c.z].map(v => Math.round(v * 1000) / 1000).join(',') : '' };
  });
  // the Info panel's 4D block from a stubbed schedule (real renderer: info_4d_panel.js); the building's own schedule is not the subject
  const stub = () => page.evaluate(() => {
    window.ScheduleRead4D = window.ScheduleRead4D || {}; window.ScheduleRead4D.windowForGuid = () => ({ name: 'T1', startDate: '2026-01-05', finishDate: '2026-02-06', isCritical: true, resource: 'MASON', totalFloat: 0, taskId: 1 });
    window.ScheduleAuthor = window.ScheduleAuthor || {}; window.ScheduleAuthor.activeSchedule = () => ({ id: 'SCH', name: 'SCH' });
    const A = window.APP || {}; A.db = A.db || {}; return !!(window.Info4DPanel && window.Info4DPanel.render(A, 'g-witness'));
  });
  // the camera flies in after the stream ends — wait until it holds still for 2 s before taking the reference
  { let last = '', still = 0; for (let i = 0; i < 120 && still < 4; i++) { const c = (await sig()).cam; still = (c === last) ? still + 1 : 0; last = c; await page.waitForTimeout(500); } }
  await page.evaluate(() => { window.__inplaceMark = 'm' + Math.random(); });
  const s0 = await sig(); const rendered = await stub(); navs = 0;
  say('  §TRL_INPLACE start building elements=' + s0.elements + ' cam=' + s0.cam + ' info4d=' + rendered);
  const col0 = await collectStrings(page); const j0 = judge(T.BASE, 'viewer-inplace', col0.strings);
  say('  §TRL_INPLACE baseline locale=' + T.BASE + ' slots=' + j0.slots + ' uncatalogued(data, not judged here)=' + j0.uncat.length + ' [' + j0.uncat.join(' · ') + ']');
  const info4d = async () => page.evaluate(() => { const b = document.getElementById('info-4d'); return b && b.style.display === 'block' ? b.innerText.split('\n')[0] : null; });
  const order = LOCALES.filter(l => l !== T.BASE).concat([T.BASE]);
  let first = true, allOk = true;
  for (const lang of order) {
    const n0 = PAGELOG.length;
    if (first) {   // the REAL picker click — the in-place path a user takes
      await page.evaluate((code) => { window._TRL_LOADER.openFlagPicker(); const b = Array.from(document.querySelectorAll('#ootb-flag-popup button')).find(x => (x.title || '').endsWith('(' + code + ')')); if (b) b.click(); }, lang);
      first = false;
    } else await page.evaluate((code) => window._TRL_LOADER.setLocale(code), lang);
    for (let i = 0; i < 100 && !linesSince(n0).some(l => l.includes('§TRL_SWITCH ') && l.includes(' to=' + lang + ' ')); i++) await page.waitForTimeout(100);
    await page.waitForTimeout(300);
    const sw = find(linesSince(n0), /§TRL_SWITCH /).replace(/^\[[^\]]+\] /, '');
    const s1 = await sig(); const col = await collectStrings(page); const j = judge(lang, 'viewer-inplace', col.strings);
    const t4 = await info4d(); const want4 = lang === T.BASE ? 'Construction window' : ((XML[lang].byValue.get('info_4d_title') || {}).text || 'Construction window');
    const same = s1.mark === s0.mark && s1.elements === s0.elements && s1.cam === s0.cam && navs === 0;
    const wantLang = lang === 'bl_BD' ? 'bn-Latn' : lang.split('_')[0], wantDir = lang === 'ar_SA' ? 'rtl' : 'ltr';
    j.leaks = j.wiring.length + j.gap.length; j.total = j.slots;   // uncatalogued on this building page = data (judged on the blank pages by (2))
    const ok = !!sw && same && j.leaks === 0 && t4 === want4 && col.lang === wantLang && col.dir === wantDir;
    if (!ok) allOk = false; INPLACE.switches++; INPLACE.judged += j.slots;
    say('  §TRL_INPLACE locale=' + lang + ' ' + (sw || 'NO §TRL_SWITCH') + ' navs=' + navs + ' kept=' + (same ? 'yes' : 'NO ' + JSON.stringify(s1)) +
      ' html=' + col.lang + '/' + col.dir + ' info4d=' + JSON.stringify(t4) + (t4 === want4 ? '' : ' WANT ' + JSON.stringify(want4)) +
      ' leaks=' + j.leaks + ' of ' + j.total + (j.leaks ? ' [' + j.wiring.map(x => 'W:' + x).concat(j.gap.map(x => 'G:' + x), j.uncat.map(x => 'U:' + x)).slice(0, 12).join(' · ') + ']' : ''));
  }
  W(allOk && INPLACE.switches === order.length, '(6) in place through ' + INPLACE.switches + ' switches (first via the real picker): no navigation, building+camera+marker kept, Info 4D block re-rendered, 0 leaks each');
  // CONTROL — a once-built English node; with the re-translation pass disabled it stays English → leak
  const ctrlNode = () => page.evaluate(() => { let d = document.getElementById('__trl_ctrl'); if (!d) { d = document.createElement('div'); d.id = '__trl_ctrl'; d.style.cssText = 'position:fixed;left:0;top:0'; document.body.appendChild(d); } d.textContent = window._trl('info_cost_title', null, 'Cost variance'); return d.textContent; });
  await ctrlNode();
  await page.evaluate(() => window._TRL_LOADER.setLocale('fr_FR')); await page.waitForTimeout(300);
  const fixed = await page.evaluate(() => document.getElementById('__trl_ctrl').textContent);
  await page.evaluate((b) => window._TRL_LOADER.setLocale(b), T.BASE); await page.waitForTimeout(300); await ctrlNode();
  await page.evaluate(() => { window.__TRL_SWITCH_NO_RETRANSLATE = true; return window._TRL_LOADER.setLocale('es_ES'); }); await page.waitForTimeout(300);
  const colC = await collectStrings(page); const jC = judge('es_ES', 'viewer-inplace', colC.strings); jC.leaks = jC.wiring.length + jC.gap.length; jC.total = jC.slots;
  await page.evaluate(() => { window.__TRL_SWITCH_NO_RETRANSLATE = false; });
  const wantFr = (XML.fr_FR.byValue.get('info_cost_title') || {}).text;
  W(fixed === wantFr && jC.leaks > 0, '(6) control: once-built node re-translated by the dictionary pass (fr=' + JSON.stringify(fixed) + ') · with the pass disabled → §TRL_INPLACE_CONTROL leaks=' + jC.leaks + ' of ' + jC.total + ' expected>0');
  await ctx.close();
}

function finish(ROWS, onlyInplace) {
  if (onlyInplace) {
    const verdict = INPLACE.judged === 0 ? 'INCONCLUSIVE' : (fail ? 'FAIL' : 'PASS');
    say('§W-VIEWER-I18N(inplace) ' + verdict + ' pass=' + pass + ' fail=' + fail + ' switches=' + INPLACE.switches + ' slots=' + INPLACE.judged + ' pageErrors=' + ERRS.length);
    fs.writeFileSync(LOGF, OUT.join('\n') + '\n'); fs.writeFileSync(PAGELOGF, PAGELOG.join('\n') + '\n');
    say('logs: ' + LOGF + ' + ' + PAGELOGF);
    process.exit(verdict === 'PASS' ? 0 : 1);
  }
  // ── the Witness contract: rows, schema, invariants, redControl ───────────────────────────────────────────────────
  const judged = ROWS.filter(r => r.lang !== T.BASE);
  const erp9 = judged.filter(r => ERP9.includes(r.lang));
  const res = Witness('viewer_i18n')
    .population(() => ROWS)
    .schema({ type: 'object', required: ['lang', 'carry', 'pages', 'slots', 'total', 'leaks', 'htmlLang', 'dir'],
      properties: { lang: { type: 'string', pattern: '^[a-z]{2}_[A-Z]{2}$' }, carry: { type: 'boolean' }, pages: { type: 'integer', minimum: 1 }, slots: { type: 'integer', minimum: 0 },
        total: { type: 'integer', minimum: 0 }, leaks: { type: 'integer', minimum: 0 }, htmlLang: { type: 'string', minLength: 2 }, dir: { type: 'string', enum: ['ltr', 'rtl'] } } })
    .invariant('carry-through-every-locale', rs => rs.every(r => r.carry))
    .invariant('baseline-judged-slots>0', rs => rs.some(r => r.lang === T.BASE && r.slots > 0))
    .invariant('erp9-zero-leaks', rs => rs.filter(r => ERP9.includes(r.lang) && r.lang !== T.BASE).every(r => r.leaks === 0))
    .invariant('arabic-rtl', rs => rs.filter(r => r.lang === 'ar_SA').every(r => r.dir === 'rtl'))
    .invariant('confirm-dialog-in-locale', rs => rs.every(r => r.confirmOk !== false))
    .invariant('no-page-errors', rs => rs.every(r => r.errs === 0))
    .invariant('locale-toast-in-locale', rs => rs.every(r => !r.toastBad))
    .redControl(rs => rs.map(r => Object.assign({}, r, { carry: false, leaks: r.leaks + 3 })))
    .run();

  const slots = ROWS.reduce((a, r) => a + r.slots, 0);
  const verdict = (slots === 0 || judged.length === 0) ? 'INCONCLUSIVE' : ((fail + res.fail) ? 'FAIL' : 'PASS');
  say('§W-VIEWER-I18N ' + verdict + ' pass=' + (pass + res.pass) + ' fail=' + (fail + res.fail) + ' locales=' + ROWS.length + ' erp9=' + erp9.length + ' slots=' + slots +
    ' leaks=' + judged.map(r => r.lang + ':' + r.leaks + '/' + r.total).join(',') + ' pageErrors=' + ERRS.length);
  fs.writeFileSync(LOGF, OUT.join('\n') + '\n'); fs.writeFileSync(PAGELOGF, PAGELOG.join('\n') + '\n');
  say('logs: ' + LOGF + ' + ' + PAGELOGF);
  process.exit(verdict === 'PASS' ? 0 : 1);
}
