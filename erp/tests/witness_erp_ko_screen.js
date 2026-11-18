#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-ERP-KO-SCREEN (bim-compiler prompts/TRL_TRILOGY_STANDARD.md step T5c, owner 2026-11-18: "T5a + T5b, then Korean screen"). READ THE LOG: erp/tests/logs/w_erp_ko_screen.log
// ISSUE IT PROVES OR DISPROVES: "the ERP has no Korean". ko_KR is added as a machine-only language (no published pack is reachable): SCREEN NAMES only (not Description / Help), AI-written rows in
// erp/i18n/machine/<T>_Trl_ko_KR.xml. Tables done in this step: AD_Window, AD_Menu, AD_Tab + the 58 chrome keys; the others are listed as NOT DONE by the log (X of N, N from ad_seed.db).
//   K1  ko_KR is in erp/tools/i18n_sources.json meta (ltr, 한국어, ko) with an EMPTY source list, in the page's LOCALES, in index.json and has a help pack + index.
//   K2  rows by table: every AD_Window / AD_Menu / AD_Tab id has a Korean row (X of N, N from ad_seed.db), the 58 chrome keys have one, no stale row; the English that the Viewer already has in Korean
//       uses the VIEWER's text (X of N reused, counted); tables not yet written are printed.
//   K3  no published row is shadowed by a machine row: shadowed = 0 and stale = 0 in a rebuild of every language (the build log), and ko_KR's published tables are empty.
//   K4  through the REAL erp_i18n.js (headless chromium --disable-gpu, ko_KR pack): t() of the 58 chrome keys, applyMenuTree / applyWindow names equal the XML text (X of N). RED: the pack without its
//       <T>_Trl_m maps (what the page had before T5c) shows English for all of them: K4 FAILs.
//   Size: rows, help.json bytes, index.json bytes against the 100 KB budget.
// INCONCLUSIVE, never PASS, when nothing was judged. Run: node erp/tests/witness_erp_ko_screen.js   Env: PW, ERP_TRL_CACHE.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), http = require('http');
const ROOT = path.resolve(__dirname, '..', '..'), ERP = path.join(ROOT, 'erp'), I18N = path.join(ERP, 'i18n'), MACH = path.join(I18N, 'machine'), PW = process.env.PW || path.join(os.homedir(), 'bim-ootb', 'tests', 'node_modules', 'playwright');
const CACHE = process.env.ERP_TRL_CACHE || path.join(os.homedir(), '.cache', 'erp_trl');
fs.mkdirSync(path.join(__dirname, 'logs'), { recursive: true });
const LOGF = path.join(__dirname, 'logs', 'w_erp_ko_screen.log'); fs.writeFileSync(LOGF, '');
const out = (m) => { console.log(m); fs.appendFileSync(LOGF, m + '\n'); };
let pass = 0, fail = 0, inc = 0;
const chk = (n, ok, i) => { ok ? pass++ : fail++; out('  ' + (ok ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); return ok; };
const incon = (id, why) => { inc++; out('§ERP_KO_SCREEN INCONCLUSIVE ' + id + ' — ' + why); };
const L = (m) => out('§ERP_KO_SCREEN ' + m);
const sq = (sql) => { const r = cp.spawnSync('sqlite3', ['-readonly', '-json', path.join(ERP, 'ad_seed.db'), sql], { encoding: 'utf8', maxBuffer: 1 << 28 }); if (r.status !== 0) throw new Error(r.stderr); return JSON.parse(r.stdout || '[]'); };
const unx = (s) => s.replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d))).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function rows(file) { if (!fs.existsSync(file)) return new Map(); const t = fs.readFileSync(file, 'utf8'), m = new Map(), re = /<row id="(\d+)" trl="([YN])">\s*<value column="(?:Name|MsgText)" original="([^"]*)">([\s\S]*?)<\/value>/g; let x; while ((x = re.exec(t))) m.set(Number(x[1]), { trl: x[2], en: unx(x[3]), text: unx(x[4]) }); if ((t.match(/<row /g) || []).length !== m.size) throw new Error(file + ': row count mismatch'); return m; }
const TABLES = { AD_Window: 'SELECT AD_Window_ID AS id, Name AS n FROM AD_Window', AD_Menu: 'SELECT AD_Menu_ID AS id, Name AS n FROM AD_Menu', AD_Tab: 'SELECT AD_Tab_ID AS id, Name AS n FROM AD_Tab', AD_Field: 'SELECT AD_Field_ID AS id, Name AS n FROM AD_Field',
  AD_Element: 'SELECT AD_Element_ID AS id, Name AS n FROM AD_Element', AD_Process: 'SELECT ad_process_id AS id, name AS n FROM ad_process', AD_Form: 'SELECT AD_Form_ID AS id, Name AS n FROM AD_Form', AD_Ref_List: 'SELECT AD_Ref_List_ID AS id, Name AS n FROM AD_Ref_List' };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
(async () => {
  // ── K1 ──
  const src = JSON.parse(fs.readFileSync(path.join(ERP, 'tools', 'i18n_sources.json'), 'utf8')), meta = src.meta.ko_KR, idx = JSON.parse(fs.readFileSync(path.join(I18N, 'index.json'), 'utf8'));
  const page = fs.readFileSync(path.join(ERP, 'erp_i18n.js'), 'utf8'), helpDir = path.join(I18N, 'help', 'ko_KR'), hj = path.join(helpDir, 'help.json'), hi = path.join(helpDir, 'index.json');
  chk('K1 ko_KR: meta ltr / 한국어 / ko, empty source list, in the page LOCALES, in index.json, help pack + index present', !!meta && meta.dir === 'ltr' && meta.native === '한국어' && meta.html === 'ko' && Array.isArray(src.sources.ko_KR) && src.sources.ko_KR.length === 0
    && /code: 'ko_KR'/.test(page) && idx.locales.some(l => l.code === 'ko_KR') && fs.existsSync(hj) && fs.existsSync(hi), 'index codes=' + idx.locales.map(l => l.code).join(','));
  // ── K2 ──
  const vcsv = fs.readFileSync(path.join(ROOT, 'viewer', 'i18n', 'ad_message_base.csv'), 'utf8').split('\n').slice(1), vbase = new Map(); vcsv.forEach(l => { const m = l.match(/^(\d+),/); if (m) { /* quoted fields possible: id -> raw line */ vbase.set(Number(m[1]), l); } });
  const vrows = rows(path.join(ROOT, 'viewer', 'i18n', 'machine', 'AD_Message_Trl_ko_KR.xml')), V = new Map(); vrows.forEach((r) => { if (r.trl === 'Y' && r.text !== r.en) V.set(r.en, r.text); });
  let tot = { rows: 0, n: 0, reused: 0, reusable: 0, stale: 0 }; const done = [], notDone = [];
  Object.keys(TABLES).forEach(t => { const all = sq(TABLES[t]), R = rows(path.join(MACH, t + '_Trl_ko_KR.xml'));
    if (!R.size) { notDone.push(t + ' 0/' + all.length + ' ids'); return; }
    let ok = 0, stale = 0, reusable = 0, reused = 0; all.forEach(a => { const r = R.get(a.id); if (r && r.trl === 'Y' && r.text) ok++; if (r && (r.en || '').trim() !== (a.n || '').trim()) stale++; const v = V.get((a.n || '').trim()); if (v !== undefined) { reusable++; if (r && r.text === v) reused++; } });
    done.push({ t, ok, n: all.length, stale, reusable, reused }); tot.rows += ok; tot.n += all.length; tot.stale += stale; tot.reusable += reusable; tot.reused += reused; });
  const cr = rows(path.join(MACH, 'AD_Message_Trl_ko_KR.xml')), chromeIds = fs.readFileSync(path.join(I18N, 'chrome_base.csv'), 'utf8').split('\n').slice(1).filter(Boolean).length;
  L('K2 tables written (rows / ids in ad_seed.db): ' + done.map(d => d.t + ' ' + d.ok + '/' + d.n).join(', ') + '; chrome (AD_Message) ' + cr.size + '/' + chromeIds + ' | NOT DONE: ' + notDone.join(', '));
  chk('K2 every id of the written tables has a Korean row: ' + tot.rows + ' of ' + tot.n + ' (' + done.map(d => d.t).join(', ') + '), chrome ' + cr.size + ' of ' + chromeIds + ', stale ' + tot.stale, done.length > 0 && tot.rows === tot.n && tot.stale === 0 && cr.size === chromeIds);
  chk('K2 where the Viewer already has Korean for the same English, the ERP row IS the Viewer\'s text: ' + tot.reused + ' of ' + tot.reusable + ' ids reused (distinct English in the Viewer: ' + V.size + ')', tot.reusable > 0 && tot.reused === tot.reusable);
  // ── K3 ──
  if (!fs.existsSync(path.join(CACHE, 'ad_message_base.csv'))) incon('K3', 'no published-pack cache at ' + CACHE);
  else { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'erp_ko_')); cp.execSync('cp -r ' + JSON.stringify(I18N) + '/. ' + JSON.stringify(d));
    const r = cp.spawnSync('python3', [path.join(ERP, 'tools', 'build_i18n.py')], { encoding: 'utf8', env: Object.assign({}, process.env, { ERP_I18N_OUT: d }), maxBuffer: 1 << 26 }), lines = (r.stdout.match(/machine-src lang=\S+ .*/g) || []);
    const sh = lines.reduce((s, l) => s + (l.match(/shadowed:(\d+)/g) || []).reduce((a, x) => a + Number(x.split(':')[1]), 0), 0), st = lines.reduce((s, l) => s + (l.match(/stale:(\d+)/g) || []).reduce((a, x) => a + Number(x.split(':')[1]), 0), 0);
    const ko = JSON.parse(fs.readFileSync(path.join(d, 'ko_KR.json'), 'utf8')), pubRows = Object.keys(ko).filter(k => /_Trl$/.test(k)).reduce((s, k) => s + Object.keys(ko[k]).length, 0);
    const same = ['ko_KR', 'chrome', 'index'].filter(f => fs.readFileSync(path.join(d, f + '.json'), 'utf8') !== fs.readFileSync(path.join(I18N, f + '.json'), 'utf8'));
    chk('K3 no published row shadowed by a machine row: shadowed=' + sh + ', stale=' + st + ' over ' + lines.length + ' languages\' machine sources; ko_KR has ' + pubRows + ' published rows (no pack); the shipped ko_KR.json / chrome.json / index.json equal a rebuild' + (same.length ? ' [DIFF ' + same + ']' : ''), r.status === 0 && sh === 0 && st === 0 && pubRows === 0 && same.length === 0 && lines.length >= 9);
    fs.rmSync(d, { recursive: true, force: true }); }
  // ── K4 + RED ──
  let browser, srv;
  try {
    srv = http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]); if (p === '/__shim.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<!doctype html><meta charset="utf-8"><script src="/erp/erp_i18n.js"></script>'); }
      fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(b); }); });
    await new Promise(r => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port, { chromium } = require(PW); browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
    const chrome = JSON.parse(fs.readFileSync(path.join(I18N, 'chrome.json'), 'utf8')).keys, ids = {}; fs.readFileSync(path.join(I18N, 'chrome_base.csv'), 'utf8').split('\n').slice(1).forEach(l => { const m = l.match(/^(\d+),([^,]+),/); if (m) ids[m[2]] = Number(m[1]); });
    const want = {}; Object.keys(chrome).forEach(k => { const m = chrome[k].machine && chrome[k].machine.ko_KR; if (m) want[k] = chrome[k].fmt ? chrome[k].fmt.replace('{}', m) : m; });
    const W = rows(path.join(MACH, 'AD_Window_Trl_ko_KR.xml')), M = rows(path.join(MACH, 'AD_Menu_Trl_ko_KR.xml')), T = rows(path.join(MACH, 'AD_Tab_Trl_ko_KR.xml'));
    async function judge(red) { const ctx = await browser.newContext(), pg = await ctx.newPage(); if (red) await pg.route('**/erp/i18n/ko_KR.json*', r => { const j = JSON.parse(fs.readFileSync(path.join(I18N, 'ko_KR.json'), 'utf8')); Object.keys(j).filter(k => /_Trl_m$/.test(k)).forEach(k => { j[k] = {}; }); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j) }); });
      if (red) await pg.route('**/erp/i18n/chrome.json*', r => { const j = JSON.parse(fs.readFileSync(path.join(I18N, 'chrome.json'), 'utf8')); Object.keys(j.keys).forEach(k => { if (j.keys[k].machine) delete j.keys[k].machine.ko_KR; }); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j) }); });
      await pg.goto(base + '/__shim.html'); await pg.waitForFunction(() => window.ErpI18n); await pg.evaluate(() => ErpI18n.set('ko_KR'));
      const r = await pg.evaluate((a) => {
        const html = document.documentElement.lang, dir = document.documentElement.dir, chromeOk = Object.keys(a.want).filter(k => ErpI18n.t(k) === a.want[k]).length;
        const menus = a.M.map(([id, en]) => ({ id, name: en, action: 'Z', children: [] })); ErpI18n.applyMenuTree(menus); const mOk = menus.filter((n, i) => n.name === a.M[i][2]).length;
        const wins = a.W.map(([id, en, ko]) => ({ id, name: en, tabs: [] })); wins.forEach(w => ErpI18n.applyWindow(w)); const wOk = wins.filter((w, i) => w.name === a.W[i][2]).length;
        const tw = { id: 0, name: 'x', tabs: a.T.map(([id, en]) => ({ id, name: en, fields: [] })) }; ErpI18n.applyWindow(tw); const tOk = tw.tabs.filter((t, i) => t.name === a.T[i][2]).length;
        return { html, dir, chromeOk, mOk, wOk, tOk }; }, { want, M: Array.from(M).map(([id, r]) => [id, r.en, r.text]), W: Array.from(W).map(([id, r]) => [id, r.en, r.text]), T: Array.from(T).map(([id, r]) => [id, r.en, r.text]) });
      await ctx.close(); return r; }
    const g = await judge(false), rd = await judge(true), nW = W.size, nM = M.size, nT = T.size, nC = Object.keys(want).length;
    L('K4 real erp_i18n.js, ko_KR: html lang=' + g.html + ' dir=' + g.dir + '; chrome ' + g.chromeOk + '/' + nC + ', menus ' + g.mOk + '/' + nM + ', windows ' + g.wOk + '/' + nW + ', tabs ' + g.tOk + '/' + nT + ' | RED (no machine maps / no ko chrome): chrome ' + rd.chromeOk + ', menus ' + rd.mOk + ', windows ' + rd.wOk + ', tabs ' + rd.tOk);
    chk('K4 through the real page: ' + (g.chromeOk + g.mOk + g.wOk + g.tOk) + ' of ' + (nC + nM + nW + nT) + ' names are the Korean rows (chrome ' + g.chromeOk + '/' + nC + ', menu ' + g.mOk + '/' + nM + ', window ' + g.wOk + '/' + nW + ', tab ' + g.tOk + '/' + nT + '); <html lang=' + g.html + '>', g.html === 'ko' && g.dir === 'ltr' && g.chromeOk === nC && g.mOk === nM && g.wOk === nW && g.tOk === nT && nC > 0 && nM > 0);
    chk('RED without the machine maps the same page shows English: ' + (rd.chromeOk + rd.mOk + rd.wOk + rd.tOk) + ' of ' + (nC + nM + nW + nT) + ' Korean (witness can fail)', (rd.chromeOk + rd.mOk + rd.wOk + rd.tOk) < (nC + nM + nW + nT) / 2);
  } catch (e) { fail++; out('FAIL K4 harness ' + (e && e.stack || e)); }
  if (browser) await browser.close(); if (srv) srv.close();
  // ── size ──
  const bytes = (f) => fs.existsSync(f) ? fs.statSync(f).size : 0, xmlBytes = fs.readdirSync(MACH).filter(f => /_ko_KR\.xml$/.test(f)).reduce((s, f) => s + bytes(path.join(MACH, f)), 0);
  L('SIZE ko_KR: screen-name rows ' + tot.rows + ' + chrome ' + cr.size + '; ko_KR.json ' + bytes(path.join(I18N, 'ko_KR.json')) + ' B; help.json ' + bytes(hj) + ' B (no Description/Help: out of scope); help index.json ' + bytes(hi) + ' B (budget 102400); machine xml ' + xmlBytes + ' B');
  chk('SIZE the ko_KR help index is under the 100 KB budget: ' + bytes(hi) + ' B', bytes(hi) > 0 && bytes(hi) <= 102400);
  end();
})();
function end() { const v = fail ? 'FAIL' : (inc || !pass ? 'INCONCLUSIVE' : 'PASS'); out('§WITNESS_ERP_KO_SCREEN pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + ' verdict=' + v); process.exitCode = v === 'PASS' ? 0 : 1; }
