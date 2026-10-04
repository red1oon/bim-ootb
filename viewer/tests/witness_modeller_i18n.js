#!/usr/bin/env node
// ⚠ DO NOT REMOVE — witness_modeller_i18n.js — W-MODELLER-I18N (bim-compiler prompts/S226_localisation.md §R3 SPEC item 4).
// ISSUE IT PROVES OR DISPROVES: "the Modeller shows English to a user who picked another language" (red1 2026-10-04 chose to
//   translate the Modeller before its polyglot trailer). Claims, per locale (default: all 18):
//  (1) CARRY      modeller.html opened with the saved locale → §TRL_LABELS locale=<x> + §TRL_DICT_PAGE locale=<x> applied>0.
//  (2) LEAKS      the trailer's screens are walked for real (toolbar, Help, Open chooser, the Duplex resident opened, Export) and
//                 every text node / title / placeholder / aria-label is judged: a string equal to a base English msgtext (or of an
//                 English {template}'s shape) that is still English while this locale has another text = WIRING leak; English the
//                 en_MY baseline found UNCATALOGUED appearing again = UNCAT leak. DATA (IFC classes, GUIDs, element / storey /
//                 building names) is excluded by the explicit rules below — printed, never silently.
//  (3) POPULATION slots judged per locale printed; < MIN_SLOTS FAILS (an empty Modeller cannot pass by absence).
//  (4) IN PLACE   en_MY page → the REAL flag button (#header-flag-btn) → de_DE: no navigation, then leaks re-counted, then the
//                 Help panel opened AFTER the switch must arrive translated (the MutationObserver path).
//  (5) CONTROL    de_DE with its i18n/de_DE.json ABORTED → the same counter must report leaks > 0 (proves (2) can fail).
// INCONCLUSIVE when nothing was judged. CPU only (--disable-gpu). READ the log: viewer/tests/logs/witness_modeller_i18n.log
// Run:  node viewer/tests/witness_modeller_i18n.js [--locales de_DE,ar_SA]
'use strict';
const os = require('os'), fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require(process.env.PW || (os.homedir() + '/bim-ootb/tests/node_modules/playwright'));
const T = require('../tools/trl_common');
const REPO = path.resolve(__dirname, '..', '..');
const LOGD = path.join(__dirname, 'logs'); fs.mkdirSync(LOGD, { recursive: true });
const LOG = []; const say = (s) => { LOG.push(s); console.log(s); };
let pass = 0, fail = 0, inc = 0; const W = (ok, m) => { ok ? pass++ : fail++; say((ok ? 'PASS ' : 'FAIL ') + m); return ok; };
const argOf = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const LOCALES = (argOf('--locales') || T.LOCALES.join(',')).split(',').filter(Boolean);
if (!LOCALES.includes(T.BASE)) LOCALES.unshift(T.BASE);   // the baseline runs first, always
const MIN_SLOTS = 80;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.mjs': 'text/javascript', '.db': 'application/octet-stream', '.ifc': 'application/octet-stream', '.xml': 'application/xml' };
const server = http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]); const fp = path.join(REPO, p);
  fs.stat(fp, (e, st) => { if (e || st.isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); }); });

// ── the dictionary (sources) ──
const BASE = T.readBase(); const BY_ID = new Map(BASE.map(r => [r.id, r]));
const EN_BY_TEXT = new Map(); BASE.forEach(r => { if (!EN_BY_TEXT.has(r.msgtext)) EN_BY_TEXT.set(r.msgtext, []); EN_BY_TEXT.get(r.msgtext).push(r); });
const tplRe = (s) => { const names = []; const src = s.split(/(\{\w+\})/).map(p => { const m = p.match(/^\{(\w+)\}$/); if (m) { names.push(m[1]); return '(.+?)'; } return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('');
  return names.length && src.replace(/\(\.\+\?\)/g, '').length >= 3 ? new RegExp('^' + src + '$') : null; };
const EN_TPL = BASE.filter(r => /\{\w+\}/.test(r.msgtext)).map(r => ({ r, re: tplRe(r.msgtext) })).filter(x => x.re);
const XML = {};
T.LOCALES.filter(l => l !== T.BASE).forEach(lang => { const x = T.parseTrlXml(fs.readFileSync(T.xmlFile(lang), 'utf8')); const byValue = new Map();
  x.rows.forEach(r => { const b = BY_ID.get(r.id); if (b) byValue.set(b.value, { trl: r.trl, text: r.text }); });
  XML[lang] = { byValue, textSet: new Set(x.rows.filter(r => r.trl === 'Y').map(r => r.text)),
    tpl: x.rows.filter(r => r.trl === 'Y' && /\{\w+\}/.test(r.text)).map(r => tplRe(r.text)).filter(Boolean) }; });

// ── DATA (never a leak; the same in every language because it comes from the building file) ──
const DATA_RULES = [
  [/^Ifc[A-Z]\w*$/, 'IFC class'], [/^[0-9A-Za-z$_]{8,}…$/, 'GUID fragment'], [/(wall-bearing|column-framed)/, 'resident label (building name · structural system)'],
  [/· ARC\.ifc$/, 'IFC source file'], [/^(Level \d+|Roof|T\/FDN)( · layer)?$/, 'storey name'], [/^[^:]+:[^:]+:\d+(:\d+)?$/, 'element name (Revit family:type:id)'],
  [/^Grid \d+×\d+( ∠.*)?$/, 'grid size'], [/^(Duplex|SampleHouse|SampleCastle|HHS|Clinic|Hospital|HospitalGarage|Terminal|Stairway|Stair|StairFlight|Unknown)$/, 'building / IFC type name'],
  [/^DAGeVu( · MODELLER| Model)$/, 'product name'], [/^LOD \d+$/, 'LOD term'], [/^ready — supported=/, 'engine status line (diagnostic)'],
  [/^(CTRL|Ctrl|ALT|Alt|SHIFT|Shift|Esc|Del|Enter)([+⇧].*)?$/, 'key cap'] ];
const dataOf = (s) => { for (const [re, why] of DATA_RULES) if (re.test(s)) return why; return null; };
const ALLOW = new Set('BIM OOTB ERP IFC IFC4 BCF BOM MEP ARC STR PLB ACMV ELEC FP LOD DAGeVu iDempiere Gravity RED ORANGE GREEN GEOM_ROTATE GEOM_SCALE Ctrl Alt Shift Esc Del'.split(' '));
const EN_TEXTS_DESC = Array.from(new Set(BASE.map(r => r.msgtext))).filter(t => t.length >= 3).sort((a, b) => b.length - a.length);
function englishLooking(s) { let rest = s; EN_TEXTS_DESC.forEach(t => { if (rest.includes(t)) rest = rest.split(t).join(' '); });
  return (rest.match(/[A-Za-z][A-Za-z'’\-]*/g) || []).some(t => t.length >= 3 && !ALLOW.has(t) && !ALLOW.has(t.toUpperCase())); }

const BASELINE_UNCAT = new Set();
function judge(lang, strings) {
  const r = { slots: 0, translated: 0, wiring: [], gap: [], uncat: [], data: 0 }; const x = XML[lang];
  strings.forEach(s => { const t = s.t;
    if (dataOf(t)) { r.data++; return; }
    const en = EN_BY_TEXT.get(t);
    if (en) { r.slots++; if (lang === T.BASE) return; const rows = en.map(b => x.byValue.get(b.value) || { trl: 'N', text: b.msgtext });
      if (rows.some(row => row.trl === 'Y' && row.text === t) || (/^en_/.test(lang) && rows.every(row => row.text === t))) return;
      (rows.some(row => row.trl === 'Y') ? r.wiring : r.gap).push(t + ' [' + en.map(b => b.value).join('|') + ']'); return; }
    const et = EN_TPL.find(e => e.re.test(t));
    if (et) { r.slots++; if (lang === T.BASE) return; const row = x.byValue.get(et.r.value) || { trl: 'N', text: et.r.msgtext };
      if (row.text === et.r.msgtext || /^en_/.test(lang)) return; (row.trl === 'Y' ? r.wiring : r.gap).push(t + ' [' + et.r.value + ' tpl]'); return; }
    if (lang !== T.BASE && (x.textSet.has(t) || x.tpl.some(re => re.test(t)))) { r.slots++; r.translated++; return; }
    if (lang === T.BASE) { if (englishLooking(t)) r.uncat.push(t); return; }
    if (BASELINE_UNCAT.has(t)) r.uncat.push(t); });
  if (lang === T.BASE) r.uncat.forEach(u => BASELINE_UNCAT.add(u));
  r.leaks = r.wiring.length + r.gap.length + (lang === T.BASE ? 0 : r.uncat.length); return r;
}

const COLLECT = (root) => { const out = []; const seen = new Set(); const R = root ? document.querySelector(root) : document.body; if (!R) return out;
  const add = (k, t) => { t = String(t || '').replace(/\s+/g, ' ').trim(); if (!t || !/\p{L}{2}/u.test(t)) return; if (seen.has(k + '|' + t)) return; seen.add(k + '|' + t); out.push({ k, t }); };
  const w = document.createTreeWalker(R, NodeFilter.SHOW_TEXT); while (w.nextNode()) { const n = w.currentNode; if (n.parentElement && !n.parentElement.closest('script,style,svg,canvas,noscript,textarea,#ootb-flag-popup,#ootb-locale-toast')) add('text', n.textContent); }
  R.querySelectorAll('[title],[placeholder],[aria-label]').forEach(e => { if (e.closest('#ootb-flag-popup')) return; ['title', 'placeholder', 'aria-label'].forEach(a => { if (e.hasAttribute(a)) add(a, e.getAttribute(a)); }); });
  return out; };

async function openPage(browser, base, lang, opts) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((loc) => { try { localStorage.setItem('bim_ootb_config', JSON.stringify({ locale: loc })); Object.keys(localStorage).filter(k => k.startsWith('bim_ootb_trl_')).forEach(k => localStorage.removeItem(k)); } catch (e) {} }, lang);
  if (opts && opts.abort) await ctx.route('**/i18n/' + lang + '.json', r => r.abort());
  const page = await ctx.newPage(); const plog = []; page.on('console', m => plog.push(m.text())); page.on('pageerror', e => plog.push('PAGEERR ' + e)); page.on('dialog', d => d.dismiss().catch(() => {}));
  await page.goto(base + '/modeller/modeller.html', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 100 && !plog.some(l => /§TRL_DICT_PAGE|§TRL_LABELS_FAIL/.test(l)); i++) await page.waitForTimeout(200);
  await page.waitForTimeout(1500);
  return { ctx, page, plog };
}
async function walk(page, plog) {   // the trailer's screens, real clicks
  const click = async (sel, ms) => { if (await page.locator(sel).first().isVisible().catch(() => false)) { await page.locator(sel).first().click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(ms || 800); return true; } return false; };
  const all = new Map(); const snap = async () => (await page.evaluate(COLLECT, null)).forEach(s => all.set(s.k + '|' + s.t, s));
  await snap(); await click('#m-dots'); await click('#m-help'); await snap(); await click('#m-help');
  await click('#b-open', 1200); await snap();
  const n0 = plog.length; const dup = page.locator('#m-open-panel >> text=/^Duplex · wall-bearing$/').first();
  if (await dup.isVisible().catch(() => false)) await dup.click().catch(() => {});
  for (let i = 0; i < 120 && !plog.slice(n0).some(l => /features 🔒|§SW_|resident=Duplex/.test(l)); i++) await page.waitForTimeout(250);
  await page.waitForTimeout(7000); await snap();
  await click('#b-export', 1200); await snap(); await page.keyboard.press('Escape');
  return [...all.values()];
}

(async () => {
  await new Promise(r => server.listen(0, r)); const base = 'http://localhost:' + server.address().port;
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  say('§W-MODELLER-I18N start served=' + REPO + ' gpu=disabled locales=' + LOCALES.join(','));
  const sums = [];
  for (const lang of LOCALES) {
    const { ctx, page, plog } = await openPage(browser, base, lang);
    // the dictionary page loads the en_MY base AFTER the locale's own pack — match this locale's §TRL_LABELS line, not the last one
    const lab = plog.filter(l => new RegExp('§TRL_LABELS locale=' + lang + ' ').test(l)).pop() || plog.filter(l => /§TRL_LABELS/.test(l))[0] || '', dp = plog.filter(l => /§TRL_DICT_PAGE/.test(l)).pop() || '';
    const strings = await walk(page, plog); const j = judge(lang, strings);
    const carry = new RegExp('§TRL_LABELS locale=' + lang + ' ').test(lab) && new RegExp('§TRL_DICT_PAGE locale=' + lang + ' ').test(dp);
    say('  §MDL_CARRY locale=' + lang + ' ' + (carry ? 'ok' : 'WRONG') + ' | ' + lab.replace(/^.*§/, '§') + ' | ' + dp.replace(/^.*§/, '§'));
    if (lang === T.BASE) { say('  §MDL_UNCATALOGUED n=' + j.uncat.length + (j.uncat.length ? ' [' + j.uncat.join(' · ') + ']' : '') + ' slots=' + j.slots + ' data=' + j.data); W(carry, '(1) ' + lang + ' baseline carries'); W(j.slots >= MIN_SLOTS, '(3) ' + lang + ' slots judged=' + j.slots + ' (min ' + MIN_SLOTS + ')'); }
    else { say('  §MDL_LEAK locale=' + lang + ' leaks=' + j.leaks + ' slots=' + j.slots + ' translated=' + j.translated + ' wiring=' + j.wiring.length + ' gap=' + j.gap.length + ' uncat=' + j.uncat.length + ' data=' + j.data +
        (j.leaks ? ' [' + j.wiring.map(s => 'W:' + s).concat(j.gap.map(s => 'G:' + s), j.uncat.map(s => 'U:' + s)).join(' · ') + ']' : ''));
      W(carry, '(1) ' + lang + ' carries (§TRL_LABELS + §TRL_DICT_PAGE)'); W(j.slots >= MIN_SLOTS, '(3) ' + lang + ' slots judged=' + j.slots + ' (min ' + MIN_SLOTS + ')');
      W(j.leaks === 0, '(2) ' + lang + ' leaks=' + j.leaks + ' on the trailer screens (translated=' + j.translated + ')'); sums.push(lang + ':' + j.leaks + '/' + j.slots); }
    say('  §MDL_PAGEERR locale=' + lang + ' n=' + plog.filter(l => l.startsWith('PAGEERR')).length + (plog.filter(l => l.startsWith('PAGEERR')).slice(0, 2).join(' | ') ? ' ' + plog.filter(l => l.startsWith('PAGEERR')).slice(0, 2).join(' | ') : ''));
    await ctx.close();
  }
  // (4) in place — en_MY → de_DE through the real flag button; the Help panel opened AFTER the switch
  if (LOCALES.includes('de_DE')) {
    const { ctx, page, plog } = await openPage(browser, base, T.BASE);
    await page.evaluate(() => { window.__mark = 'kept'; });
    await page.locator('#m-dots').click().catch(() => {}); await page.waitForTimeout(500);
    const n0 = plog.length; await page.locator('#header-flag-btn').click().catch(() => {}); await page.waitForSelector('#ootb-flag-popup.active', { timeout: 5000 }).catch(() => {});
    await page.locator('#ootb-flag-popup button[title$="(de_DE)"]').click().catch(() => {});
    for (let i = 0; i < 50 && !plog.slice(n0).some(l => /§TRL_DICT_PAGE locale=de_DE/.test(l)); i++) await page.waitForTimeout(200);
    await page.waitForTimeout(800);
    const sw = plog.slice(n0).filter(l => /§TRL_SWITCH/.test(l)).pop() || 'NO §TRL_SWITCH', kept = await page.evaluate(() => window.__mark).catch(() => null);
    const j1 = judge('de_DE', await page.evaluate(COLLECT, null));
    await page.locator('#m-help').click().catch(() => {}); await page.waitForTimeout(800);
    const jh = judge('de_DE', await page.evaluate(COLLECT, '#m-help-panel'));
    say('  §MDL_INPLACE ' + sw.replace(/^.*§/, '§') + ' navs=' + (kept === 'kept' ? 0 : 1) + ' leaks=' + j1.leaks + ' helpAfterSwitch slots=' + jh.slots + ' translated=' + jh.translated + ' leaks=' + jh.leaks +
      (j1.leaks + jh.leaks ? ' [' + j1.wiring.concat(j1.uncat, jh.wiring, jh.uncat).join(' · ') + ']' : ''));
    W(/§TRL_SWITCH .*to=de_DE/.test(sw) && kept === 'kept' && j1.leaks === 0, '(4) in-place en_MY→de_DE via #header-flag-btn: no navigation, leaks=' + j1.leaks);
    if (jh.slots === 0) { inc++; say('INCONCLUSIVE (4) Help panel after the switch: 0 slots judged'); } else W(jh.leaks === 0 && jh.translated > 0, '(4) Help panel built AFTER the switch arrives translated (observer): translated=' + jh.translated + ' leaks=' + jh.leaks);
    await ctx.close();
    // (5) control — de_DE labels aborted → leaks > 0
    const c = await openPage(browser, base, 'de_DE', { abort: true }); const jc = judge('de_DE', await walk(c.page, c.plog));
    say('  §MDL_CONTROL de_DE i18n aborted → leaks=' + jc.leaks + ' slots=' + jc.slots); W(jc.leaks > 0, '(5) control: with de_DE.json aborted the counter reports leaks=' + jc.leaks + ' > 0'); await c.ctx.close();
  }
  await browser.close(); server.close();
  const verdict = fail ? 'FAIL' : (pass === 0 || inc ? 'INCONCLUSIVE' : 'PASS');
  say('§W-MODELLER-I18N ' + verdict + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + ' leaks=' + sums.join(','));
  fs.writeFileSync(path.join(LOGD, 'witness_modeller_i18n.log'), LOG.join('\n') + '\n');
  process.exit(fail ? 1 : 0);
})();
