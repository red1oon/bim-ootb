#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-ERP-CHROME-FILL (bim-compiler prompts/TRL_TRILOGY_STANDARD.md step T5b). READ THE LOG: erp/tests/logs/w_erp_chrome_fill.log
// ISSUE IT PROVES OR DISPROVES: "46 ERP app strings (the chrome keys that had machine text for the first 8 languages) show English in pt_BR and id_ID".
//   F1  each of the 46 keys has a trl="Y" row in erp/i18n/machine/AD_Message_Trl_<lang>.xml (X of N per language, N read from BEFORE_REF's chrome.json: the keys that carry fr_FR machine text).
//   F2  tokens survive: the {0} slot and <b>..</b> markup of the English are in the text; the text is not the English unless the English is a name (PoC, Menu).
//   F3  through the REAL erp_i18n.js (headless chromium --disable-gpu): t(key) in pt_BR / id_ID is not the English for all 46 (published pack text counts where the pack has the key).
//   RED the chrome.json of BEFORE_REF served to the same page: F3 FAILs (the keys show English).
// INCONCLUSIVE, never PASS, when nothing was judged. Run: node erp/tests/witness_erp_chrome_fill.js   Env: BEFORE_REF (the main commit before T5b, default ce04a4d8), PW.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), http = require('http');
const ROOT = path.resolve(__dirname, '..', '..'), ERP = path.join(ROOT, 'erp'), I18N = path.join(ERP, 'i18n'), BEFORE_REF = process.env.BEFORE_REF || 'ce04a4d8';
const PW = process.env.PW || path.join(os.homedir(), 'bim-ootb', 'tests', 'node_modules', 'playwright'), NEW = ['pt_BR', 'id_ID'], SAME_OK = new Set(['demo · PoC', 'Menu']);
fs.mkdirSync(path.join(__dirname, 'logs'), { recursive: true });
const LOGF = path.join(__dirname, 'logs', 'w_erp_chrome_fill.log'); fs.writeFileSync(LOGF, '');
const out = (m) => { console.log(m); fs.appendFileSync(LOGF, m + '\n'); };
let pass = 0, fail = 0, inc = 0;
const chk = (n, ok, i) => { ok ? pass++ : fail++; out('  ' + (ok ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); return ok; };
const incon = (id, why) => { inc++; out('§ERP_CHROME_FILL INCONCLUSIVE ' + id + ' — ' + why); };
const L = (m) => out('§ERP_CHROME_FILL ' + m);
const unx = (s) => s.replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d))).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function rows(lang) { const f = path.join(I18N, 'machine', 'AD_Message_Trl_' + lang + '.xml'); if (!fs.existsSync(f)) return new Map(); const t = fs.readFileSync(f, 'utf8'), m = new Map(), re = /<row id="(\d+)" trl="([YN])">\s*<value column="MsgText" original="([^"]*)">([\s\S]*?)<\/value>/g; let x; while ((x = re.exec(t))) m.set(Number(x[1]), { trl: x[2], en: unx(x[3]), text: unx(x[4]) }); return m; }
(async () => {
  const r = cp.spawnSync('git', ['show', BEFORE_REF + ':erp/i18n/chrome.json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) { incon('setup', BEFORE_REF + ' not in this clone'); return end(); }
  const before = JSON.parse(r.stdout), now = JSON.parse(fs.readFileSync(path.join(I18N, 'chrome.json'), 'utf8')), ids = new Map();
  fs.readFileSync(path.join(I18N, 'chrome_base.csv'), 'utf8').split('\n').slice(1).forEach((l) => { const m = l.match(/^(\d+),([^,]+),/); if (m) ids.set(m[2], Number(m[1])); });
  const K = Object.keys(before.keys).filter(k => before.keys[k].machine && before.keys[k].machine.fr_FR);
  L('N: ' + K.length + ' chrome keys carry machine text for fr_FR at ' + BEFORE_REF + ' (and none for ' + NEW.join('/') + ': ' + K.filter(k => before.keys[k].machine.pt_BR || before.keys[k].machine.id_ID).length + ' had)');
  for (const lang of NEW) { const R = rows(lang); let ok = 0, tokOk = 0; const bad = [];
    K.forEach(k => { const row = R.get(ids.get(k)), en = now.keys[k].en; if (row && row.trl === 'Y' && row.text) ok++; else bad.push(k);
      const tk = (re) => (en.match(re) || []).length === ((row && row.text.match(re)) || []).length; if (row && tk(/\{\d\}/g) && tk(/<b>/g) && (row.text !== en || SAME_OK.has(row.text))) tokOk++; });
    chk('F1 ' + lang + ': ' + ok + ' of ' + K.length + ' keys have a trl=Y row in machine/AD_Message_Trl_' + lang + '.xml', ok === K.length, bad.slice(0, 3).join(','));
    chk('F2 ' + lang + ': tokens ({0}, <b>) kept and text is not the English: ' + tokOk + ' of ' + K.length, tokOk === K.length); }
  let browser, srv;
  try {
    srv = http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]); if (p === '/__shim.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<!doctype html><meta charset="utf-8"><script src="/erp/erp_i18n.js"></script>'); }
      fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': p.endsWith('.json') ? 'application/json' : 'text/javascript' }); res.end(b); }); });
    await new Promise(rr => srv.listen(0, rr)); const base = 'http://localhost:' + srv.address().port, { chromium } = require(PW); browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
    async function judge(red) { const ctx = await browser.newContext(), pg = await ctx.newPage(); if (red) await pg.route('**/erp/i18n/chrome.json*', rt => rt.fulfill({ status: 200, contentType: 'application/json', body: r.stdout }));
      await pg.goto(base + '/__shim.html'); await pg.waitForFunction(() => window.ErpI18n); const res = {};
      for (const lang of NEW) { await pg.evaluate((c) => ErpI18n.set(c), lang); const got = await pg.evaluate((ks) => ks.map(k => ErpI18n.t(k)), K); let tr = 0; const en = []; K.forEach((k, i) => { const e = now.keys[k]; const eng = e.fmt ? e.fmt.replace('{}', e.en) : e.en; if (got[i] !== eng || SAME_OK.has(e.en) || SAME_OK.has(got[i])) tr++; else en.push(k); }); res[lang] = { tr, en }; }
      await ctx.close(); return res; }
    const g = await judge(false), rd = await judge(true);
    NEW.forEach(l => L('F3 ' + l + ': t() differs from English for ' + g[l].tr + ' of ' + K.length + '; still English: [' + g[l].en.slice(0, 4) + '] | RED (chrome.json of ' + BEFORE_REF + '): ' + rd[l].tr + ' of ' + K.length));
    NEW.forEach(l => chk('F3 ' + l + ' through the real erp_i18n.js: ' + g[l].tr + ' of ' + K.length + ' chrome keys are no longer English', g[l].tr === K.length, g[l].en.slice(0, 3).join(',')));
    chk('RED the chrome.json of ' + BEFORE_REF + ' FAILs F3 (pt_BR ' + rd.pt_BR.tr + ', id_ID ' + rd.id_ID.tr + ' of ' + K.length + ': witness can fail)', rd.pt_BR.tr < K.length && rd.id_ID.tr < K.length);
  } catch (e) { fail++; out('FAIL F3 harness ' + (e && e.stack || e)); }
  if (browser) await browser.close(); if (srv) srv.close(); end();
})();
function end() { const v = fail ? 'FAIL' : (inc || !pass ? 'INCONCLUSIVE' : 'PASS'); out('§WITNESS_ERP_CHROME_FILL pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + ' verdict=' + v); process.exitCode = v === 'PASS' ? 0 : 1; }
