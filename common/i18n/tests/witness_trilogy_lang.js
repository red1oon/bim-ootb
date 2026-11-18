#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-TRILOGY-LANG (bim-compiler prompts/TRL_TRILOGY_STANDARD.md §3 S-5, step T1). READ THE LOG after every run: common/i18n/tests/logs/w_trilogy_lang*.log
// ISSUE IT PROVES OR DISPROVES: "a person who picks a language in one app opens the next app of the Trilogy in English" (three keys, no shared one).
// The three REAL pages (erp/idempiere.html, viewer/viewer.html, modeller/modeller.html) are served from ONE local http origin in ONE browser context (headless chromium,
// --disable-gpu), so they share localStorage as the deployed site does. A page's language is proven by its own lines / state (§TRL_DETECT, §I18N, §LANG_*, <html lang>,
// ErpI18n.lang, _TRL_LOADER.current()), never by a screenshot.
//   L1  set in the ERP (the real picker <select>) -> the Viewer and the Modeller start in it  (ERP 'ar' reaches them as ar_SA: the one mapping table)
//   L2  set in the Modeller (the real flag picker) -> the ERP starts in it
//   L3  ko_KR (a real ERP pack since T5c): the ERP opens in it, bim.lang stays ko_KR, the Viewer too; CONTROL bn_BD (still no ERP pack): the ERP shows its nearest (en_US base), bim.lang is STILL bn_BD
//   L4  an old erp.lang / bim_ootb_config.locale migrates ONCE (a later change of the old key is ignored); ?lang= outranks bim.lang and does not overwrite it
//   U   lang_choice.js unit facts: nearest() table, canon() table, set() rejects an unknown code
// RED CONTROL: TRL_BREAK=ownkey (page flag window.__TRL_BREAK; each app reads only its own old key) must FAIL L1 and L2. A verdict is INCONCLUSIVE, never PASS, when a page
// could not be judged or nothing was judged.   Run: node common/i18n/tests/witness_trilogy_lang.js   |   TRL_BREAK=ownkey node common/i18n/tests/witness_trilogy_lang.js
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..', '..');
const PW = process.env.PW || path.join(os.homedir(), 'bim-ootb', 'tests', 'node_modules', 'playwright');
const BREAK = process.env.TRL_BREAK || '';
const LC = require(path.join(ROOT, 'common', 'i18n', 'lang_choice.js'));
fs.mkdirSync(path.join(__dirname, 'logs'), { recursive: true });
const LOGF = path.join(__dirname, 'logs', 'w_trilogy_lang' + (BREAK ? '_break_' + BREAK : '') + '.log'); fs.writeFileSync(LOGF, '');
const out = (m) => { console.log(m); fs.appendFileSync(LOGF, m + '\n'); };
let pass = 0, fail = 0, inc = 0;
const chk = (name, ok, info) => { ok ? pass++ : fail++; out('  ' + (ok ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + info : '')); return ok; };
const incon = (id, why) => { inc++; out('§TRILOGY_LANG INCONCLUSIVE ' + id + ' — ' + why); };
const L = (m) => out('§TRILOGY_LANG ' + m);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.css': 'text/css', '.wasm': 'application/wasm', '.sql': 'text/plain', '.png': 'image/png', '.svg': 'image/svg+xml', '.xml': 'application/xml' };
const serve = () => new Promise((r) => { const s = http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(b); }); }); s.listen(0, () => r(s)); });

const HTML_LANG = (c) => ({ ar_SA: 'ar', ar: 'ar', bl_BD: 'bn-Latn' }[c] || c.split('_')[0]);   // <html lang> the Viewer/Modeller set (applyLangDir) and the ERP set (LOCALES.html, first token)
let base, browser;
async function ctx() {   // a fresh browser context = a fresh origin storage, i.e. a new person
  const c = await browser.newContext({ viewport: { width: 1300, height: 800 } });
  if (BREAK) await c.addInitScript('window.__TRL_BREAK=' + JSON.stringify(BREAK));
  const logs = []; c._logs = logs;
  c.on('page', (p) => { p.on('console', (m) => logs.push(m.text())); p.on('pageerror', (e) => logs.push('PAGEERR ' + e.message)); });
  return c;
}
const ls = (pg, k) => pg.evaluate((key) => { try { return localStorage.getItem(key); } catch (e) { return null; } }, k);
async function seed(c, kv) { const pg = await c.newPage(); await pg.goto(base + '/manifest.json'); await pg.evaluate((o) => { Object.keys(o).forEach((k) => localStorage.setItem(k, o[k])); }, kv); await pg.close(); }
async function erpOpen(c, q) {   // the real ERP, logged in; resolves once the boot line and the i18n initial line are in
  const pg = await c.newPage(), n0 = c._logs.length;
  await pg.goto(base + '/erp/idempiere.html?seed=ad_seed.db&login=GardenAdmin' + (q || ''), { waitUntil: 'load', timeout: 90000 });
  const ok = await pg.waitForFunction(() => window.ErpI18n && document.getElementById('idmp-lang') && window.__idmpFieldHelp, null, { timeout: 60000 }).then(() => true).catch(() => false);
  for (let i = 0; i < 60 && !c._logs.slice(n0).some((l) => l.indexOf('§I18N initial') === 0); i++) await pg.waitForTimeout(250);
  await pg.waitForTimeout(600);   // initial() -> set(noPersist) is async; let it settle
  const logs = c._logs.slice(n0);
  return { pg, ok, logs, lang: ok ? await pg.evaluate(() => ErpI18n.lang) : null, html: ok ? await pg.evaluate(() => document.documentElement.lang) : null, init: logs.find((l) => l.indexOf('§I18N initial') === 0) || '' };
}
async function erpPick(e, code) {   // the real picker <select id=idmp-lang>: change event -> ErpI18n.set
  const n0 = e.pg.context()._logs.length;
  await e.pg.evaluate((cd) => { const s = document.getElementById('idmp-lang'); s.value = cd; s.dispatchEvent(new Event('change', { bubbles: true })); }, code);
  let line = null; for (let i = 0; i < 80 && !line; i++) { line = e.pg.context()._logs.slice(n0).find((l) => l.indexOf('§I18N lang=' + code) === 0); if (!line) await e.pg.waitForTimeout(250); }
  return line;
}
async function bimOpen(c, which, q) {   // viewer | modeller
  const pg = await c.newPage(), n0 = c._logs.length, url = which === 'viewer' ? '/viewer/viewer.html?blank=1&ghost=1' : '/modeller/modeller.html';
  await pg.goto(base + url + (q || ''), { waitUntil: 'load', timeout: 90000 });
  const ok = await pg.waitForFunction(() => window._TRL_READY === true, null, { timeout: 60000 }).then(() => true).catch(() => false);
  const logs = c._logs.slice(n0), det = logs.find((l) => l.indexOf('§TRL_DETECT') === 0) || '';
  return { pg, ok, logs, det, code: ok ? await pg.evaluate(() => window._TRL_LOADER.current()) : null, html: ok ? await pg.evaluate(() => document.documentElement.lang) : null };
}
async function modellerPick(m, code) {   // the real flag picker: openFlagPicker -> the button whose title ends (code) -> setLocale in place (the Modeller sets __TRL_INPLACE)
  const n0 = m.pg.context()._logs.length;
  const r = await m.pg.evaluate((cd) => { window._TRL_LOADER.openFlagPicker(); const b = Array.from(document.querySelectorAll('#ootb-flag-popup button')).find((x) => (x.title || '').endsWith('(' + cd + ')')); if (!b) return 'no button'; b.click(); return 'clicked'; }, code);
  for (let i = 0; i < 80 && !m.pg.context()._logs.slice(n0).some((l) => l.indexOf('§TRL_SWITCH from=') === 0 && l.indexOf('to=' + code) > 0); i++) await m.pg.waitForTimeout(250);
  return r;
}
const brk = () => BREAK ? ' [TRL_BREAK=' + BREAK + ']' : '';

(async () => {
  L('begin break=' + (BREAK || '-') + ' repo=' + ROOT);
  // ── U: the module, in Node (no browser) ──
  const ERP = ['en_US', 'fr_FR', 'es_ES', 'de_DE', 'ar', 'zh_CN', 'ja_JP', 'ms_MY', 'th_TH', 'pt_BR', 'id_ID', 'ko_KR'];
  const U = [['ko_KR', 'ko_KR'], ['bn_BD', null], ['bl_BD', null], ['af_ZA', null], ['ar_SA', 'ar'], ['ar', 'ar'], ['en_MY', 'en_US'], ['en_GB', 'en_US'], ['en-AU', 'en_US'], ['ja_JP', 'ja_JP'], ['pt', 'pt_BR'], ['xx_YY', null]];
  const bad = U.filter(([c, w]) => LC.nearest(c, ERP) !== w);
  chk('U1 nearest(code, ERP codes) table: ' + (U.length - bad.length) + '/' + U.length, bad.length === 0, bad.map(([c, w]) => c + '->' + LC.nearest(c, ERP) + ' want ' + w).join('; '));
  chk('U2 CODES is the chooser\'s 18', LC.CODES.length === 18 && new Set(LC.CODES).size === 18, 'n=' + LC.CODES.length);
  const loaderSrc = fs.readFileSync(path.join(ROOT, 'viewer', 'locale_loader.js'), 'utf8'), chooser = (loaderSrc.match(/code: '[a-z]{2}_[A-Z]{2}'/g) || []).map((s) => s.slice(7, -1));
  chk('U3 CODES == viewer/locale_loader.js AVAILABLE_LOCALES (' + chooser.length + ')', chooser.length === 18 && chooser.every((c) => LC.CODES.indexOf(c) >= 0));
  chk('U4 LOCALE_MAP moved out of the loader (one mapping table)', !/LOCALE_MAP\s*=/.test(loaderSrc) && Object.keys(LC.MAP).length >= 40 && LC.MAP.ar === 'ar_SA', 'MAP keys=' + Object.keys(LC.MAP).length);
  chk('U5 canon: every ERP code resolves to a chooser code', ERP.every((c) => LC.CODES.indexOf(LC.canon(c)) >= 0), ERP.map((c) => c + '=' + LC.canon(c)).join(' '));

  let srv; try { srv = await serve(); } catch (e) { incon('serve', e.message); return end(); }
  base = 'http://localhost:' + srv.address().port;
  const { chromium } = require(PW); browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] }); L('browser ' + browser.version() + ' base=' + base);
  try {
    // ── L1: ERP -> Viewer, Modeller ──
    for (const pick of ['ja_JP', 'ar']) {
      const want = LC.canon(pick), c = await ctx(), e = await erpOpen(c);
      if (!e.ok) { incon('L1 ' + pick, 'ERP page did not boot'); await c.close(); continue; }
      const line = await erpPick(e, pick), stored = await ls(e.pg, 'bim.lang');
      L('L1 ERP picked ' + pick + ' -> ' + (line || 'NO §I18N LINE').slice(0, 60) + ' bim.lang=' + stored + brk());
      for (const app of ['viewer', 'modeller']) {
        const a = await bimOpen(c, app);
        if (!a.ok) { incon('L1 ' + pick + ' ' + app, 'page did not reach trl-ready'); continue; }
        L('L1 ' + app + ' ' + a.det + ' current=' + a.code + ' html=' + a.html);
        chk('L1 ERP ' + pick + ' -> ' + app + ' opens in ' + want + ' (bim.lang=' + stored + ')', stored === want && a.code === want && a.html === HTML_LANG(want), 'got ' + a.code + ' html=' + a.html + ' ' + a.det);
      }
      await c.close();
    }
    // ── L2: Modeller -> ERP ──
    {
      const c = await ctx(), m = await bimOpen(c, 'modeller');
      if (!m.ok) incon('L2', 'Modeller did not reach trl-ready'); else {
        const r = await modellerPick(m, 'de_DE'), stored = await ls(m.pg, 'bim.lang'); L('L2 Modeller picker ' + r + ' bim.lang=' + stored + brk());
        const e = await erpOpen(c);
        if (!e.ok) incon('L2', 'ERP page did not boot'); else {
          L('L2 ERP ' + e.init + ' lang=' + e.lang + ' html=' + e.html);
          chk('L2 Modeller de_DE -> ERP opens in de_DE (bim.lang=' + stored + ')', stored === 'de_DE' && e.lang === 'de_DE' && e.html === 'de', 'got ' + e.lang + ' html=' + e.html + ' ' + e.init);
        }
      }
      await c.close();
    }
    // ── L3: ko_KR is a REAL ERP pack since T5c; bn_BD stays the control for a code the ERP still lacks ──
    for (const [code, real] of [['ko_KR', true], ['bn_BD', false]]) {
      const c = await ctx(), m = await bimOpen(c, 'modeller');
      if (!m.ok) incon('L3 ' + code, 'Modeller did not reach trl-ready'); else {
        const r = await modellerPick(m, code), stored = await ls(m.pg, 'bim.lang'); L('L3 Modeller picker ' + code + ' ' + r + ' bim.lang=' + stored + brk());
        const e = await erpOpen(c); const after = e.ok ? await ls(e.pg, 'bim.lang') : null;
        if (!e.ok) incon('L3 ' + code, 'ERP page did not boot'); else {
          L('L3 ' + code + ' ERP ' + e.init + ' lang=' + e.lang + ' html=' + e.html + ' bim.lang(after)=' + after);
          if (real) chk('L3 ' + code + ': the ERP now has a REAL ' + code + ' pack (T5c): it opens in it, <html lang=ko>', e.lang === code && e.html === 'ko' && new RegExp('choice=' + code + ' ').test(e.init) && new RegExp('shows=' + code).test(e.init), e.init);
          else chk('L3 control ' + code + ': the ERP (still no pack) shows its nearest = en_US base', e.lang === 'en_US' && e.html === 'en' && new RegExp('choice=' + code + ' ').test(e.init) && /shows=en_US/.test(e.init), e.init);
          chk('L3 ' + code + ': bim.lang is STILL ' + code + ' after the ERP booted (nearest never overwrites)', after === code, 'bim.lang=' + after);
          const v = await bimOpen(c, 'viewer'); if (!v.ok) incon('L3 viewer ' + code, 'no trl-ready'); else
            chk('L3 ' + code + ': the Viewer, opened after the ERP, is ' + code, v.code === code, v.det);
        }
      }
      await c.close();
    }
    // ── L4: old keys migrate once; ?lang= outranks and never writes ──
    {
      const c = await ctx(); await seed(c, { 'erp.lang': 'fr_FR' });
      const e = await erpOpen(c), b1 = e.ok ? await ls(e.pg, 'bim.lang') : null;
      if (!e.ok) incon('L4 erp', 'ERP page did not boot'); else {
        const mig = e.logs.find((l) => l.indexOf('§LANG_MIGRATE') === 0) || '';
        L('L4 ERP seeded erp.lang=fr_FR -> ' + mig + ' lang=' + e.lang + brk());
        chk('L4 erp.lang=fr_FR migrates into bim.lang and the ERP opens fr_FR', b1 === 'fr_FR' && e.lang === 'fr_FR' && /old=fr_FR bim.lang=fr_FR/.test(mig), 'bim.lang=' + b1 + ' lang=' + e.lang + ' ' + mig);
        await e.pg.evaluate(() => localStorage.setItem('erp.lang', 'de_DE')); await e.pg.close();   // the old key changes behind the migration's back
        const e2 = await erpOpen(c);
        chk('L4 migrated ONCE: a later erp.lang=de_DE is ignored (still fr_FR, no second §LANG_MIGRATE)', e2.ok && e2.lang === 'fr_FR' && !e2.logs.some((l) => l.indexOf('§LANG_MIGRATE') === 0), 'lang=' + e2.lang);
      }
      await c.close();
      const c2 = await ctx(); await seed(c2, { bim_ootb_config: JSON.stringify({ locale: 'th_TH' }) });
      const v = await bimOpen(c2, 'viewer'), vb = v.ok ? await ls(v.pg, 'bim.lang') : null;
      if (!v.ok) incon('L4 viewer', 'no trl-ready'); else {
        const mig = v.logs.find((l) => l.indexOf('§LANG_MIGRATE') === 0) || ''; L('L4 Viewer seeded bim_ootb_config.locale=th_TH -> ' + mig + ' ' + v.det + brk());
        chk('L4 bim_ootb_config.locale=th_TH migrates into bim.lang and the Viewer opens th_TH', vb === 'th_TH' && v.code === 'th_TH' && /old=th_TH bim.lang=th_TH/.test(mig), 'bim.lang=' + vb + ' code=' + v.code + ' ' + mig);
        await v.pg.evaluate(() => localStorage.setItem('bim_ootb_config', JSON.stringify({ locale: 'ms_MY' }))); await v.pg.close();
        const v2 = await bimOpen(c2, 'viewer');
        chk('L4 migrated ONCE: a later bim_ootb_config.locale=ms_MY is ignored (still th_TH)', v2.ok && v2.code === 'th_TH' && !v2.logs.some((l) => l.indexOf('§LANG_MIGRATE') === 0), 'code=' + v2.code);
        // ?lang= > bim.lang, and ?lang= does not overwrite bim.lang (the Zoom Across hand-over: the ERP passes the code in the URL)
        const v3 = await bimOpen(c2, 'viewer', '&lang=ja_JP'), kept = v3.ok ? await ls(v3.pg, 'bim.lang') : null;
        if (!v3.ok) incon('L4 ?lang', 'no trl-ready'); else chk('L4 ?lang=ja_JP outranks bim.lang=th_TH (Zoom Across hand-over) and does not overwrite it', v3.code === 'ja_JP' && kept === 'th_TH' && /src=url /.test(v3.det), 'code=' + v3.code + ' bim.lang=' + kept + ' ' + v3.det);
        const v4 = await bimOpen(c2, 'viewer', '&lang=ar'); if (!v4.ok) incon('L4 ?lang=ar', 'no trl-ready'); else chk('L4 ?lang=ar (an ERP code) resolves through the one mapping table to ar_SA', v4.code === 'ar_SA' && /src=url-mapped /.test(v4.det), v4.det);
      }
      await c2.close();
    }
  } catch (e) { fail++; out('FAIL harness exception ' + (e && e.stack || e)); }
  await browser.close(); srv.close();
  end();
})();
function end() {
  const verdict = fail ? 'FAIL' : (inc || !pass ? 'INCONCLUSIVE' : 'PASS');
  out('§WITNESS_TRILOGY_LANG pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + ' verdict=' + verdict + (BREAK ? ' TRL_BREAK=' + BREAK : ''));
  process.exitCode = verdict === 'PASS' ? 0 : 1;
}
