// ⚠ DO NOT REMOVE — Scope guard
// W-ERP-I18N — the in-browser Kernel-ERP's UI language switch, EXECUTED in a real headless browser (software
//   rendering, --disable-gpu) over the served bundle. Spec: bim-compiler prompts/ERP_UI_LOCALES.md (§L1–§L5).
// THE ISSUES this proves or disproves, per locale (en_US fr_FR es_ES de_DE ar zh_CN ja_JP ms_MY th_TH):
//   I1 login card: does picking a language on #idmp-login-lang re-render the login card BEFORE login, every label ==
//      the catalogue/pack oracle, <html dir> correct, within the switch budget?
//   I2 session: does the header #idmp-lang switch re-label the menu, the open windows' tabs, form labels, grid
//      headers and toolbar IN PLACE — each label == an oracle computed here, independently, from i18n/<lang>.json +
//      ad_seed.db (iDempiere's SynchronizeTerminology rule re-implemented in this file, not imported) — while the
//      session, the open windows, the active window and the current record survive?
//   I3 carry-over: does the language picked on the login card carry into the session after Log In?
//   I4 glyphs: did Chromium render a translated label with a real font (CDP CSS.getPlatformFontsForNode, by value)?
//   I5 no page errors.
// Verdict per locale: PASS | FAIL | INCONCLUSIVE (a locale whose pack has 0 rows, or whose surface translated 0 labels,
//   is VACUOUS → INCONCLUSIVE, never PASS). en_US is the baseline: 0 translated, every label == English.
// §-log first — READ erp/tests/witness_erp_i18n.log (verdicts) and witness_erp_i18n.page.log (every console line).
// Run:  NODE_PATH=~/bim-ootb/node_modules node erp/tests/witness_erp_i18n.js      (serves the REPO ROOT)
'use strict';
const os = require('os'), http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PW || (os.homedir() + '/bim-ootb/tests/node_modules/playwright'));
const initSqlJs = require(process.env.SQLJS || (os.homedir() + '/bim-ootb/node_modules/sql.js'));
const { Witness } = require('../../witness_kit/contract');

const REPO = path.join(__dirname, '..', '..'), ERP = path.join(REPO, 'erp');
const LOGF = path.join(__dirname, 'witness_erp_i18n.log'), PAGELOGF = path.join(__dirname, 'witness_erp_i18n.page.log');
const LOCALES = ['en_US', 'fr_FR', 'es_ES', 'de_DE', 'ar', 'zh_CN', 'ja_JP', 'ms_MY', 'th_TH'];
const RTL = { ar: true };
const BUDGET_MS = Number(process.env.I18N_BUDGET_MS || 1500);   // the film's on-screen budget is ~1–2 s; asserted on the in-page ms
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm', '.sql': 'text/plain' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  fs.readFile(path.join(REPO, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Content-Length': buf.length }); res.end(buf);
  });
});
const OUT = []; const say = (s) => { OUT.push(s); console.log(s); };
const PAGELOG = [], ERRS = [];

// ── ORACLE — independent re-implementation of iDempiere's naming rule over the shipped files ──────────────────────
let DB, CAT, PACK = {};
const q = (sql) => { const r = DB.exec(sql); return r.length ? r[0].values : []; };
const K = (v) => String(Math.round(Number(v)));
function pk(lang) { if (lang === 'en_US') return null; if (!PACK[lang]) PACK[lang] = JSON.parse(fs.readFileSync(path.join(ERP, 'i18n', lang + '.json'), 'utf8')); return PACK[lang]; }
const trl = (p, t, id) => (p && p[t + '_Trl'] && id != null) ? (p[t + '_Trl'][K(id)] || null) : null;
const trlm = (p, t, id) => (p && p[t + '_Trl_m'] && id != null) ? (p[t + '_Trl_m'][K(id)] || null) : null;
let MENU = null, FIELD = null;
function menuOracle(lang, id) {
  const p = pk(lang); if (!p) return null;
  if (!MENU) { MENU = {}; q('SELECT AD_Menu_ID, IsCentrallyMaintained, Action, AD_Window_ID, AD_Process_ID, AD_Form_ID FROM AD_Menu').forEach(r => { MENU[K(r[0])] = r; }); }
  const m = MENU[K(id)]; if (!m) return null;
  let v = null;
  if (m[1] === 'Y') {
    if (m[2] === 'W' && m[3]) v = trl(p, 'AD_Window', m[3]);
    else if ((m[2] === 'P' || m[2] === 'R') && m[4]) v = trl(p, 'AD_Process', m[4]);
    else if (m[2] === 'X' && m[5]) v = trl(p, 'AD_Form', m[5]);
  }
  return v || trl(p, 'AD_Menu', id) || trlm(p, 'AD_Menu', id);
}
function fieldOracle(lang, fid) {
  const p = pk(lang); if (!p) return null;
  if (!FIELD) { FIELD = {}; q("SELECT f.AD_Field_ID, f.IsCentrallyMaintained, c.AD_Element_ID, c.AD_Process_ID, w.IsSOTrx FROM AD_Field f JOIN AD_Tab t ON t.AD_Tab_ID=f.AD_Tab_ID JOIN AD_Window w ON w.AD_Window_ID=t.AD_Window_ID LEFT JOIN AD_Column c ON c.AD_Column_ID=f.AD_Column_ID").forEach(r => { FIELD[K(r[0])] = r; }); }
  const f = FIELD[K(fid)]; let v = null;
  if (f && f[1] === 'Y') {
    if (f[3]) v = trl(p, 'AD_Process', f[3]);
    else if (f[2] != null) { const e = trl(p, 'AD_Element', f[2]); v = e ? ((f[4] === 'N' && e[1]) ? e[1] : e[0]) : null; }
  }
  return v || trl(p, 'AD_Field', fid) || trlm(p, 'AD_Field', fid);
}
const tabOracle = (lang, id) => { const p = pk(lang); return p ? (trl(p, 'AD_Tab', id) || trlm(p, 'AD_Tab', id)) : null; };
const winOracle = (lang, id) => { const p = pk(lang); return p ? (trl(p, 'AD_Window', id) || trlm(p, 'AD_Window', id)) : null; };
function chromeOracle(lang, key) {   // → { text, src }
  const e = CAT[key]; if (!e) return { text: null, src: 'absent' };
  if (lang === 'en_US') return { text: e.en, src: 'none' };
  const p = pk(lang); let v = null;
  if (e.ref) { const [k, a] = e.ref.split(':'); v = k === 'msg' ? (p.AD_Message_Trl[a] || null) : (trl(p, 'AD_Element', a) || [null])[0]; }
  if (v) return { text: e.fmt ? e.fmt.replace('{}', v) : v, src: 'pack' };
  if (e.machine && e.machine[lang]) return { text: e.machine[lang], src: 'machine' };
  return { text: e.en, src: 'none' };
}
const strip = (h) => String(h).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
// window structure (same SQL shape ADParser.getTabs/getFields read)
function tabsOf(wid) { return q('SELECT AD_Tab_ID, Name FROM AD_Tab WHERE AD_Window_ID=' + wid + " AND IsActive='Y' ORDER BY SeqNo").map(r => ({ id: r[0], en: r[1] })); }
function gridFieldsOf(tabId) {
  return q("SELECT f.AD_Field_ID, f.Name FROM AD_Field f JOIN AD_Column c ON f.AD_Column_ID=c.AD_Column_ID WHERE f.AD_Tab_ID=" + tabId +
    " AND f.IsActive='Y' AND f.IsDisplayed='Y' AND c.IsKey<>'Y' ORDER BY f.SeqNo").map(r => ({ id: r[0], en: r[1] }));
}
function formFieldsByCol(tabId) {
  const m = {}; q("SELECT f.AD_Field_ID, f.Name, lower(c.ColumnName) FROM AD_Field f JOIN AD_Column c ON f.AD_Column_ID=c.AD_Column_ID WHERE f.AD_Tab_ID=" + tabId + " AND f.IsActive='Y'").forEach(r => { m[r[2]] = { id: r[0], en: r[1] }; });
  return m;
}

// ── harness ──
const waitI18n = async (page, n0, lang) => {
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    const l = PAGELOG.slice(n0).find(x => x.startsWith('§I18N lang=' + lang + ' '));
    if (l) return l;
    await page.waitForTimeout(30);
  }
  return null;
};
async function fontsOf(cdp, page, selector) {
  try {
    const doc = await cdp.send('DOM.getDocument', { depth: 0 });
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector });
    if (!nodeId) return [];
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    return (fonts || []).map(f => f.familyName + ':' + f.glyphCount);
  } catch (e) { return ['ERR ' + e.message]; }
}
async function switchVia(page, sel, lang) {
  const n0 = PAGELOG.length, e0 = ERRS.length, t0 = Date.now();
  await page.selectOption(sel, lang);
  const line = await waitI18n(page, n0, lang);
  await page.waitForTimeout(60);
  const m = line && /ms=(\d+)/.exec(line);
  return { line, ms: m ? Number(m[1]) : null, wallMs: Date.now() - t0, errs: ERRS.slice(e0), rr: PAGELOG.slice(n0).filter(l => l.startsWith('§I18N-RERENDER')).pop() || '' };
}

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.join(path.dirname(require.resolve(process.env.SQLJS || (os.homedir() + '/bim-ootb/node_modules/sql.js'))), f) });
  DB = new SQL.Database(fs.readFileSync(path.join(ERP, 'ad_seed.db')));
  CAT = JSON.parse(fs.readFileSync(path.join(ERP, 'i18n', 'chrome.json'), 'utf8')).keys;
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/erp';
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });   // software rendering ONLY
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('console', m => PAGELOG.push(m.text()));
  page.on('pageerror', e => { ERRS.push(String(e)); PAGELOG.push('PAGEERR ' + e); });
  page.on('dialog', async d => { PAGELOG.push('DIALOG ' + d.message()); await d.accept(); });
  const cdp = await page.context().newCDPSession(page); await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  say('§W-ERP-I18N start served=' + REPO + ' gpu=disabled budgetMs=' + BUDGET_MS + ' locales=' + LOCALES.join(','));
  const ROWS = {}; LOCALES.forEach(l => { ROWS[l] = { lang: l, packRows: 0, login: null, session: null, errs: 0, fonts: [], ms: [], verdict: 'INCONCLUSIVE', why: [] }; });
  LOCALES.forEach(l => { const p = pk(l); ROWS[l].packRows = p ? Object.values(p.counts || {}).reduce((a, b) => a + b, 0) : 0; });

  // ── I1 login card, step 0, every locale ─────────────────────────────────────────────────────────────────────────
  await page.goto(base + '/idempiere.html?lang=en_US', { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('#idmp-login-clients .idmp-login-user').length > 0, null, { timeout: 40000 });
  for (const lang of LOCALES) {
    const sw = await switchVia(page, '#idmp-login-lang', lang);
    const snap = await page.evaluate(() => ({
      dir: document.documentElement.dir || 'ltr', lang: document.documentElement.lang,
      keyed: [...document.querySelectorAll('#idmp-login [data-i18n], #idmp-login [data-i18n-html]')].map(n => ({ k: n.getAttribute('data-i18n') || n.getAttribute('data-i18n-html'), html: n.hasAttribute('data-i18n-html'), t: n.hasAttribute('data-i18n-html') ? n.innerHTML : n.textContent, vis: !!(n.offsetParent || n.getClientRects().length) })),
      tags: [...document.querySelectorAll('#idmp-login-clients .tag')].map(n => n.textContent),
      headerSel: document.getElementById('idmp-lang').value, loginSel: document.getElementById('idmp-login-lang').value }));
    let tr = 0, tot = 0; const mism = [];
    snap.keyed.forEach(k => {
      const o = chromeOracle(lang, k.k); tot++;
      const got = k.html ? strip(k.t) : norm(k.t), exp = k.html ? strip(o.text) : norm(o.text);
      if (got !== exp) mism.push(k.k + '=' + JSON.stringify(got) + '≠' + JSON.stringify(exp));
      if (o.src !== 'none') tr++;
    });
    // dynamic step-0 tags: "<n> user(s) · id" and the demo tags
    const u1 = chromeOracle(lang, 'login.user1').text, uN = chromeOracle(lang, 'login.userN').text, dr = chromeOracle(lang, 'login.demoReady').text, dp = chromeOracle(lang, 'login.demoPoc').text;
    snap.tags.forEach(t => { tot++; const ok = new RegExp('^\\d+ (' + [u1, uN].map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ') · \\d+$').test(norm(t)) || norm(t) === dr || norm(t) === dp;
      if (!ok) mism.push('tag=' + JSON.stringify(t)); else if (lang !== 'en_US') tr++; });
    const fonts = lang === 'en_US' ? [] : await fontsOf(cdp, page, '.idmp-login-title');
    ROWS[lang].login = { translated: tr, total: tot, mismatches: mism.length, dir: snap.dir, ms: sw.ms, wallMs: sw.wallMs, pickersAgree: snap.headerSel === lang && snap.loginSel === lang };
    ROWS[lang].ms.push(sw.ms); ROWS[lang].errs += sw.errs.length; if (fonts.length) ROWS[lang].fonts.push('login:' + fonts.join('|'));
    say('§W-ERP-I18N login lang=' + lang + ' strings=' + tr + '/' + tot + ' mismatches=' + mism.length + ' dir=' + snap.dir + ' ms=' + sw.ms + ' wallMs=' + sw.wallMs +
      ' pickers=' + snap.loginSel + '/' + snap.headerSel + ' errs=' + sw.errs.length + (fonts.length ? ' fonts=' + fonts.join('|') : '') + (mism.length ? ' FIRST=' + mism.slice(0, 3).join(' ; ') : ''));
    say('    ' + (sw.line || '§I18N line MISSING'));
  }

  // ── I1b + I3: step 1 / step 2 re-render, then the picked language carries into the session ──────────────────────
  let carry = null;
  try {
    await page.selectOption('#idmp-login-lang', 'en_US'); await page.waitForTimeout(150);
    await page.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))");
    await page.waitForSelector('#idmp-login-step1:visible', { timeout: 8000 });
    const s1 = await switchVia(page, '#idmp-login-lang', 'fr_FR');
    const s1label = await page.$eval('#idmp-login-step1-label', e => e.textContent);
    const s1exp = chromeOracle('fr_FR', 'login.selectUser').text + ' · GardenWorld';
    await page.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))");
    await page.waitForSelector('#idmp-login-step2:visible', { timeout: 8000 });
    const s2 = await switchVia(page, '#idmp-login-lang', 'de_DE');
    const s2labels = await page.$$eval('#idmp-login-step2 [data-i18n]', ns => ns.map(n => [n.getAttribute('data-i18n'), n.textContent]));
    const s2mism = s2labels.filter(([k, t]) => norm(t) !== norm(chromeOracle('de_DE', k).text)).map(x => x.join('='));
    const n0 = PAGELOG.length;
    await page.click('#idmp-login-ok');
    await page.waitForFunction(() => document.querySelectorAll('#idmp-tree .idmp-row').length > 0, null, { timeout: 20000 });
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({ lang: window.ErpI18n.lang, dir: document.documentElement.dir, sel: document.getElementById('idmp-lang').value,
      menu: [...document.querySelectorAll('#idmp-tree .idmp-row')].map(r => [r.dataset.menuId, r.querySelector('.nm').textContent]) }));
    const mm = after.menu.filter(([id, t]) => norm(t) !== norm(menuOracle('de_DE', id) || q('SELECT Name FROM AD_Menu WHERE AD_Menu_ID=' + Number(id))[0][0]));
    const trd = after.menu.filter(([id]) => menuOracle('de_DE', id)).length;
    carry = { step1: norm(s1label) === norm(s1exp), step2mism: s2mism.length, lang: after.lang, sel: after.sel, menuTranslated: trd, menuTotal: after.menu.length, menuMism: mm.length };
    say('§W-ERP-I18N login-steps step1(fr) label=' + JSON.stringify(s1label) + ' expect=' + JSON.stringify(s1exp) + ' ok=' + carry.step1 + ' ms=' + s1.ms +
      ' | step2(de) mismatches=' + s2mism.length + ' ms=' + s2.ms + (s2mism.length ? ' ' + s2mism.join(' ; ') : ''));
    say('§W-ERP-I18N carry-over picked=de_DE session.lang=' + after.lang + ' header=' + after.sel + ' menu=' + trd + '/' + after.menu.length + ' mismatches=' + mm.length +
      ' ' + (PAGELOG.slice(n0).find(l => l.startsWith('§IDEMPIERE-LOGIN')) || ''));
  } catch (e) { say('§W-ERP-I18N login-steps HARNESS ' + e.message); }

  // ── I2 session: BP + Sales Order open, record 3 in form view, cycle every locale via the header picker ──────────
  const BP = 123, SO = 143;
  const menuFor = (w) => q("SELECT AD_Menu_ID FROM AD_Menu WHERE Action='W' AND AD_Window_ID=" + w)[0][0];
  const openViaMenu = (w) => page.evaluate(id => { const r = document.querySelector('#idmp-tree .idmp-row[data-menu-id="' + id + '"]'); if (r) r.click(); return !!r; }, menuFor(w));
  const bpTabs = tabsOf(BP), soTabs = tabsOf(SO), bpGrid = gridFieldsOf(bpTabs[0].id).slice(0, 7), soForm = formFieldsByCol(soTabs[0].id);
  let okOpen = await openViaMenu(BP); await page.waitForTimeout(900);
  okOpen = (await openViaMenu(SO)) && okOpen; await page.waitForTimeout(900);
  const clickTb = (txt) => page.evaluate(t => { const b = [...document.querySelectorAll('#idmp-toolbar button')].find(x => x.textContent.trim() === t); if (b) b.click(); return !!b; }, txt);
  await clickTb('▶'); await page.waitForTimeout(250); await clickTb('▶'); await page.waitForTimeout(250);
  await page.evaluate(() => { const b = document.querySelector('#idmp-toolbar [data-tb="toggle"]'); if (b) b.click(); });
  await page.waitForTimeout(900);
  const state = () => page.evaluate(() => ({ nav: (document.getElementById('idmp-recnav') || {}).textContent || '', wins: document.querySelectorAll('.idmp-wintab').length,
    active: (document.querySelector('.idmp-wintab.active .lbl') || {}).textContent || '', form: !!document.querySelector('#idmp-form'), rec: (document.querySelector('#idmp-form') || { getAttribute: () => null }).getAttribute('data-ad-record') }));
  const st0 = await state();
  say('§W-ERP-I18N session-setup opened=' + okOpen + ' wins=' + st0.wins + ' active=' + JSON.stringify(st0.active) + ' nav=' + JSON.stringify(st0.nav) + ' form=' + st0.form + ' record=' + st0.rec);
  const recNo = (s) => { const m = /(\d+)\D+(\d+)\s*$/.exec(s || ''); return m ? m[1] + '/' + m[2] : null; };
  const formBase = {};   // the English form labels (curated crud specs carry their own English, e.g. "Price List (ID)")
  const SEQ = LOCALES.concat(['en_US']);   // ends back in English: the round trip must restore the baseline exactly
  for (let si = 0; si < SEQ.length; si++) {
    const lang = SEQ[si], second = si > 0 && lang === 'en_US';
    const sw = await switchVia(page, '#idmp-lang', lang);
    const snap = await page.evaluate(() => ({
      dir: document.documentElement.dir || 'ltr',
      menu: [...document.querySelectorAll('#idmp-tree .idmp-row')].map(r => [r.dataset.menuId, r.querySelector('.nm').textContent]),
      tabs: [...document.querySelectorAll('#idmp-tabstrip .idmp-adtab')].map(e => e.textContent),
      wintabs: [...document.querySelectorAll('.idmp-wintab .lbl')].map(e => e.textContent),
      form: [...document.querySelectorAll('#idmp-form .cfrow')].map(r => [r.getAttribute('data-row'), (r.querySelector('.cfl') || {}).firstChild ? r.querySelector('.cfl').firstChild.nodeValue : '']),
      formRO: [...document.querySelectorAll('#idmp-form .idmp-fld')].map(r => [String(r.getAttribute('data-ad-column') || '').toLowerCase(), (r.querySelector('label') || {}).textContent || '']),
      tbNew: (document.querySelector('#idmp-toolbar [data-tb="new"]') || {}).textContent || '',
      tbToggle: (document.querySelector('#idmp-toolbar [data-tb="toggle"]') || {}).textContent || '',
      nav: (document.getElementById('idmp-recnav') || {}).textContent || '' }));
    const st = await state();
    const enMenu = (id) => (q('SELECT Name FROM AD_Menu WHERE AD_Menu_ID=' + Number(id))[0] || [''])[0];
    const C = { menu: [0, 0, 0], tab: [0, 0, 0], field: [0, 0, 0], grid: [0, 0, 0], chrome: [0, 0, 0], window: [0, 0, 0] };   // translated, total, mismatches
    const mis = [];
    const judge = (kind, got, oracle, en, label) => { C[kind][1]++; if (oracle) C[kind][0]++; const exp = oracle || en; if (norm(got) !== norm(exp)) { C[kind][2]++; if (mis.length < 6) mis.push(kind + ':' + label + '=' + JSON.stringify(norm(got)) + '≠' + JSON.stringify(norm(exp))); } };
    snap.menu.forEach(([id, t]) => judge('menu', t, menuOracle(lang, id), enMenu(id), 'm' + id));
    snap.tabs.forEach((t, i) => soTabs[i] && judge('tab', t, tabOracle(lang, soTabs[i].id), soTabs[i].en, 't' + soTabs[i].id));
    const formRows = snap.form.length ? snap.form : snap.formRO;
    formRows.forEach(([col, t]) => { const c = String(col).toLowerCase(), f = soForm[c]; if (!f) return;
      if (lang === 'en_US' && !second) formBase[c] = String(t).trim();
      judge('field', String(t).trim(), fieldOracle(lang, f.id), formBase[c] != null ? formBase[c] : f.en, 'f' + f.id); });
    const wEn = { [BP]: q('SELECT Name FROM AD_Window WHERE AD_Window_ID=' + BP)[0][0], [SO]: q('SELECT Name FROM AD_Window WHERE AD_Window_ID=' + SO)[0][0] };
    snap.wintabs.forEach((t, i) => { const w = i === 0 ? BP : SO; judge('window', t, winOracle(lang, w), wEn[w], 'w' + w); });
    const cNew = chromeOracle(lang, 'tb.new'); C.chrome[1]++; if (cNew.src !== 'none') C.chrome[0]++; if (snap.tbNew.indexOf(cNew.text) < 0) { C.chrome[2]++; mis.push('chrome:tb.new=' + JSON.stringify(snap.tbNew) + '∌' + cNew.text); }
    const cTg = chromeOracle(lang, 'tb.form'); C.chrome[1]++; if (cTg.src !== 'none') C.chrome[0]++; if (snap.tbToggle.indexOf(cTg.text) < 0) { C.chrome[2]++; mis.push('chrome:tb.form=' + JSON.stringify(snap.tbToggle) + '∌' + cTg.text); }
    const kept = st.wins === st0.wins && recNo(st.nav) === recNo(st0.nav) && st.form === st0.form && st.rec === st0.rec;
    const fonts = lang === 'en_US' ? [] : await fontsOf(cdp, page, '#idmp-tree .idmp-node > .idmp-row .nm');
    // BP grid headers (switch window tab, read th, come back to SO record 3 form) — the grid path of the same labels
    await page.evaluate(() => { const t = document.querySelectorAll('.idmp-wintab')[0]; if (t) t.click(); }); await page.waitForTimeout(500);
    const ths = await page.$$eval('.idmp-grid thead th:not(.idmp-cbcol)', ns => ns.map(n => n.textContent));
    ths.forEach((t, i) => bpGrid[i] && judge('grid', t, fieldOracle(lang, bpGrid[i].id), bpGrid[i].en, 'g' + bpGrid[i].id));
    await page.evaluate(() => { const t = document.querySelectorAll('.idmp-wintab')[1]; if (t) t.click(); }); await page.waitForTimeout(500);
    await clickTb('▶'); await page.waitForTimeout(200); await clickTb('▶'); await page.waitForTimeout(200);
    await page.evaluate(() => { const b = document.querySelector('#idmp-toolbar [data-tb="toggle"]'); if (b) b.click(); }); await page.waitForTimeout(700);
    const tr = C.menu[0] + C.tab[0] + C.field[0] + C.grid[0] + C.window[0] + C.chrome[0], tot = C.menu[1] + C.tab[1] + C.field[1] + C.grid[1] + C.window[1] + C.chrome[1];
    const mmT = C.menu[2] + C.tab[2] + C.field[2] + C.grid[2] + C.window[2] + C.chrome[2];
    ROWS[lang][second ? 'session2' : 'session'] = { translated: tr, total: tot, mismatches: mmT, dir: snap.dir, ms: sw.ms, wallMs: sw.wallMs, kept, menu: C.menu.slice(0, 2), field: C.field[0] + C.grid[0], fieldTotal: C.field[1] + C.grid[1] };
    ROWS[lang].ms.push(sw.ms); ROWS[lang].errs += sw.errs.length; if (fonts.length) ROWS[lang].fonts.push('menu:' + fonts.join('|'));
    say('§W-ERP-I18N session' + (second ? '-roundtrip' : '') + ' lang=' + lang + ' labels=' + tr + '/' + tot + ' mismatches=' + mmT + ' menu=' + C.menu.join('/') + ' window=' + C.window.join('/') + ' tab=' + C.tab.join('/') +
      ' formField=' + C.field.join('/') + ' gridHeader=' + C.grid.join('/') + ' toolbar=' + C.chrome.join('/') + ' dir=' + snap.dir + ' ms=' + sw.ms + ' wallMs=' + sw.wallMs +
      ' kept=' + kept + '(wins=' + st.wins + ' nav=' + JSON.stringify(st.nav) + ' record=' + st.rec + ') errs=' + sw.errs.length + (fonts.length ? ' fonts=' + fonts.join('|') : '') + (mis.length ? ' FIRST=' + mis.join(' ; ') : ''));
    say('    ' + (sw.line || '§I18N line MISSING') + '  ' + sw.rr);
  }

  // ── verdicts ─────────────────────────────────────────────────────────────────────────────────────────────────
  LOCALES.forEach(l => {
    const r = ROWS[l], why = r.why, L = r.login || {}, S = r.session || {};
    if (!r.login || !r.session) why.push('harness: a phase did not run');
    if (L.mismatches) why.push('login mismatches=' + L.mismatches);
    if (S.mismatches) why.push('session mismatches=' + S.mismatches);
    if (r.session2 && (r.session2.mismatches || !r.session2.kept)) why.push('round-trip back to English: mismatches=' + r.session2.mismatches + ' kept=' + r.session2.kept);
    const expDir = RTL[l] ? 'rtl' : 'ltr';
    if (L.dir !== expDir || S.dir !== expDir) why.push('dir login=' + L.dir + ' session=' + S.dir + ' expected=' + expDir);
    if (!S.kept) why.push('session/window/record NOT kept');
    if (!L.pickersAgree) why.push('pickers disagree');
    if (r.errs) why.push('pageErrors=' + r.errs);
    if (r.ms.some(m => m == null || m > BUDGET_MS)) why.push('switch ms=' + r.ms.join(',') + ' > budget ' + BUDGET_MS);
    if (l !== 'en_US' && r.fonts.some(f => /ERR|^[a-z]+:$/.test(f))) why.push('fonts unreadable ' + r.fonts.join(' '));
    const vacuous = l !== 'en_US' && (r.packRows === 0 || !L.translated || !S.translated);
    if (l === 'en_US' && (L.translated || S.translated)) why.push('English baseline reports translated labels');
    r.verdict = why.length ? 'FAIL' : (vacuous ? 'INCONCLUSIVE' : 'PASS');
    say('§W-ERP-I18N verdict lang=' + l + ' ' + r.verdict + ' packRows=' + r.packRows + ' login=' + L.translated + '/' + L.total + ' session=' + S.translated + '/' + S.total +
      ' fields=' + S.field + '/' + S.fieldTotal + ' menu=' + (S.menu || []).join('/') + ' dir=' + S.dir + ' ms=' + r.ms.join(',') + ' errs=' + r.errs + (why.length ? ' WHY=' + why.join(' ; ') : ''));
  });
  if (carry) say('§W-ERP-I18N verdict carry-over ' + (carry.step1 && !carry.step2mism && carry.lang === 'de_DE' && carry.sel === 'de_DE' && carry.menuTranslated > 0 && !carry.menuMism ? 'PASS' : 'FAIL') + ' ' + JSON.stringify(carry));
  else say('§W-ERP-I18N verdict carry-over INCONCLUSIVE (phase did not run)');
  say('§W-ERP-I18N pageErrors=' + ERRS.length + (ERRS.length ? ' FIRST=' + ERRS.slice(0, 2).join(' | ') : ''));

  // ── witness_kit contract: population = the 9 judged locale rows; redControl proves the witness can fail ─────────
  const rows = LOCALES.map(l => ({ lang: l, verdict: ROWS[l].verdict, dir: (ROWS[l].session || {}).dir || 'none', mismatches: ((ROWS[l].login || {}).mismatches || 0) + ((ROWS[l].session || {}).mismatches || 0),
    translated: (ROWS[l].session || {}).translated || 0, errs: ROWS[l].errs, maxMs: Math.max.apply(null, ROWS[l].ms.map(m => m == null ? 1e9 : m)), kept: !!(ROWS[l].session || {}).kept }));
  Witness('ERP_I18N')
    .population(() => rows)
    .schema({ type: 'object', required: ['lang', 'verdict', 'dir', 'mismatches', 'translated', 'errs', 'maxMs', 'kept'],
      properties: { lang: { enum: LOCALES }, verdict: { enum: ['PASS', 'FAIL', 'INCONCLUSIVE'] }, dir: { enum: ['ltr', 'rtl'] }, mismatches: { type: 'integer', minimum: 0 },
        translated: { type: 'integer', minimum: 0 }, errs: { type: 'integer', minimum: 0 }, maxMs: { type: 'number' }, kept: { type: 'boolean' } } })
    .invariant('all 9 locales judged', rs => rs.length === LOCALES.length)
    .invariant('no locale FAILs', rs => rs.every(r => r.verdict !== 'FAIL'))
    .invariant('every non-English locale PASSes (not vacuous)', rs => rs.filter(r => r.lang !== 'en_US').every(r => r.verdict === 'PASS'))
    .invariant('every label equals its oracle (0 mismatches)', rs => rs.every(r => r.mismatches === 0))
    .invariant('ar is rtl, the rest ltr', rs => rs.every(r => r.dir === (RTL[r.lang] ? 'rtl' : 'ltr')))
    .invariant('session + window + record kept on every switch', rs => rs.every(r => r.kept))
    .invariant('switch within budget', rs => rs.every(r => r.maxMs <= BUDGET_MS))
    .invariant('zero page errors', rs => rs.every(r => r.errs === 0))
    .redControl(rs => rs.map(r => r.lang === 'ar' ? Object.assign(r, { dir: 'ltr', mismatches: 3 }) : r))
    .run();
  fs.writeFileSync(LOGF, OUT.join('\n') + '\n'); fs.writeFileSync(PAGELOGF, PAGELOG.join('\n') + '\n');
  await browser.close(); server.close();
})().catch(e => { console.error('§W-ERP-I18N HARNESS-FATAL ' + (e && e.stack || e)); fs.writeFileSync(LOGF, OUT.join('\n') + '\nFATAL ' + e + '\n'); fs.writeFileSync(PAGELOGF, PAGELOG.join('\n')); process.exit(2); });
