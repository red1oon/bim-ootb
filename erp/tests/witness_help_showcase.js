// ⚠ DO NOT REMOVE — W-HELP-SHOWCASE (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §10: help pack, question search, auto-links, how-to). READ THE LOG; an exit code is not evidence.
//   S1 ISSUE (a help pack text that no published pack holds = invented) · S2 ISSUE (the chosen language does not reach the tooltip / panel, or English drifts)
//   S3 ISSUE (a plain question does not find the window and the action) · S4 ISSUE (a how-to link that goes nowhere, or a card link that does not open)
//   S5 ISSUE (how-to text that the guide does not say)
//   Falsifiers: HS_BREAK=tamper FAILs S1 · nophrase FAILs S3 · deadlink FAILs S4. Each claim can say VACUOUS / INCONCLUSIVE.
// Run: node erp/tests/witness_help_showcase.js   (after node erp/tools/build_help_pack.js; ERP_TRL_CACHE / PW / GUIDE override paths)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), cp = require('child_process');
const { kit, ROOT } = require('../../common/door/tests/_kit');
const k = kit('W-HELP-SHOWCASE');
const ERP = path.join(ROOT, 'erp'), HELP = path.join(ERP, 'i18n', 'help');
const CACHE = process.env.ERP_TRL_CACHE || path.join(os.homedir(), '.cache', 'erp_trl');
const BREAK = process.env.HS_BREAK || '';
const PW = process.env.PW || path.join(os.homedir(), 'bim-ootb', 'tests', 'node_modules', 'playwright');
const SEED = path.join(ERP, 'ad_seed.db');
const SOURCES = { fr_FR: ['nmicoud_fr_FR', 'x_fr352/fr_FR'], de_DE: ['bxservice_tbayen.translations/data/de_DE'], ja_JP: ['JPiere_japanese-translation'], zh_CN: ['x_zh_CN/zh_CN'] };
const q = (sql) => { const r = cp.spawnSync('sqlite3', ['-readonly', '-json', SEED, sql], { encoding: 'utf8', maxBuffer: 1 << 29 }); if (r.status !== 0) throw new Error(r.stderr); return JSON.parse(r.stdout || '[]'); };
// the witness's OWN reader of the published XML (not the builder's): every <value> text of a table, by row id
function xmlTexts(file) {
  const m = new Map(); if (!fs.existsSync(file)) return m;
  const x = fs.readFileSync(file, 'utf8'), dec = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (a, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (a, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
  for (const row of x.split('<row ').slice(1)) {
    const id = (row.match(/^id="(\d+)"/) || [])[1]; if (!id) continue;
    const set = m.get(id) || new Set(); m.set(id, set);
    for (const v of row.matchAll(/<value column="[^"]+" original="[^"]*">([\s\S]*?)<\/value>/g)) set.add(dec(v[1]));
  }
  return m;
}
function s1() {
  const fieldEl = new Map(); q('SELECT f.ad_field_id fid, c.ad_element_id eid FROM ad_field f JOIN ad_column c ON c.ad_column_id=f.ad_column_id').forEach((r) => fieldEl.set(String(r.fid), String(r.eid)));
  Object.keys(SOURCES).forEach((lang) => {
    const f = path.join(HELP, lang, 'help.json'); if (!fs.existsSync(f)) { k.incon('S1-' + lang, 'no pack ' + f); return; }
    const pack = JSON.parse(fs.readFileSync(f, 'utf8')), ids = Object.keys(pack.fields || {});
    ids.forEach((id) => { pack.fields[id] = pack.fields[id].map((i) => (i >= 0 ? pack.texts[i] : null)); });   // [descIndex, helpIndex] -> texts
    if (BREAK === 'tamper' && ids.length) pack.fields[ids[0]][0] = (pack.fields[ids[0]][0] || '') + ' (tampered)';
    const els = SOURCES[lang].map((d) => xmlTexts(path.join(CACHE, d, 'AD_Element_Trl_' + lang + '.xml'))), flds = SOURCES[lang].map((d) => xmlTexts(path.join(CACHE, d, 'AD_Field_Trl_' + lang + '.xml')));
    if (!els.some((m) => m.size)) { k.incon('S1-' + lang, 'source packs not in ' + CACHE); return; }
    let n = 0, ok = 0; const bad = [];
    ids.forEach((id) => (pack.fields[id] || []).forEach((txt) => {
      if (txt == null) return; n++;
      const e = fieldEl.get(id), found = els.some((m) => e && m.has(e) && m.get(e).has(txt)) || flds.some((m) => m.has(id) && m.get(id).has(txt));
      if (found) ok++; else if (bad.length < 2) bad.push(id + ':' + JSON.stringify(txt.slice(0, 40)));
    }));
    k.L('S1 ' + lang + ' fields=' + ids.length + ' texts=' + n);
    if (!n) { k.incon('S1-' + lang, 'VACUOUS: empty pack'); return; }
    k.chk('S1 ' + lang + ' every pack text occurs in the published pack (element or field row)', ok === n, ok + '/' + n + (bad.length ? ' first not found: ' + bad.join(' | ') : ''));
  });
}
function s5() {
  let guide = null;
  try { guide = process.env.GUIDE ? fs.readFileSync(process.env.GUIDE, 'utf8') : cp.execSync('git -C ' + JSON.stringify(path.join(os.homedir(), 'bim-compiler')) + ' show origin/master:docs/ERPUserGuide.md', { encoding: 'utf8', maxBuffer: 1 << 26 }); } catch (e) { k.incon('S5', 'guide not readable'); return; }
  const en = JSON.parse(fs.readFileSync(path.join(HELP, 'en_US', 'help.json'), 'utf8')), rows = en.howto || [];
  if (!rows.length) { k.incon('S5', 'VACUOUS: no how-to rows'); return; }
  const flat = (t) => t.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const mdFlat = (t) => t.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\s+/g, ' ').trim();
  let ok = 0; const bad = [];
  rows.forEach((r) => {
    const headOk = guide.split('\n').indexOf(r.source.heading) >= 0, sentOk = r.source.sentences.every((s) => guide.indexOf(s) >= 0);
    const htmlOk = flat(r.html) === r.source.sentences.map(mdFlat).join(' ');   // the shown text is exactly the guide's sentences, nothing added
    if (headOk && sentOk && htmlOk) ok++; else bad.push(r.name + ' heading=' + headOk + ' sentences=' + sentOk + ' text=' + htmlOk);
  });
  k.chk('S5 every how-to row is the guide section it names, word for word (proof asides left out)', ok === rows.length, ok + '/' + rows.length + (bad.length ? ' ' + bad.join(' | ') : ''));
}
// ---------- the browser part: S2, S3, S4 in the real page (served from the repo root, as live) ----------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.css': 'text/css', '.wasm': 'application/wasm', '.sql': 'text/plain', '.png': 'image/png' };
const serve = () => new Promise((r) => { const s = http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(b); }); }); s.listen(0, () => r(s)); });
const QUESTIONS = [   // real phrasings -> the window and the DocAction a person means (fixture: what is asked, not how it is found)
  { q: 'How do I close a Sales Order?', w: 143, a: 'CL' },
  { q: 'what does complete do on a sales order', w: 143, a: 'CO' },
  { q: 'complete an invoice', w: 167, a: 'CO' },
  { q: 'How can I void a payment?', w: 195, a: 'VO' },
  { q: 'how to record a customer payment', w: 195, a: null },
  { q: 'How do I create a shipment?', w: 169, a: null },
  { q: 'reactivate a sales order', w: 143, a: 'RE' },
  { q: 'Re-activate a Sales Order', w: 143, a: 'RE' },
];
async function browser() {
  let chromium; try { ({ chromium } = require(PW)); } catch (e) { k.incon('S2,S3,S4', 'playwright not found at ' + PW); return; }
  const srv = await serve(), port = srv.address().port, b = await chromium.launch({ headless: true }), page = await b.newPage();
  if (BREAK) await page.addInitScript((v) => { window.__HS_BREAK = v; }, BREAK);
  const logs = [], errs = []; page.on('console', (m) => logs.push(m.text())); page.on('pageerror', (e) => errs.push(e.message));
  try {
    await page.goto('http://localhost:' + port + '/erp/idempiere.html?seed=ad_seed.db&login=GardenAdmin', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction(() => window.__idmpHowto && window.__idmpFieldHelp && window.__idmpFieldHelp.menu().windows.length > 0, null, { timeout: 30000 });
    for (let i = 0; i < 40 && !logs.some((l) => /^§HELP_SEARCH index/.test(l)); i++) await page.waitForTimeout(250);
    k.L((logs.find((l) => /^§HELP_SEARCH index/.test(l)) || 'NO §HELP_SEARCH index line') + ' pageErrors=' + errs.length + (errs.length ? ' first=' + errs[0].slice(0, 80) : ''));
    // S3: the question set
    const res = await page.evaluate((Q) => Q.map((x) => { const c = window.__idmpHowto.ask(x.q); return c ? { w: c.window && c.window.id, a: c.action && c.action.code, cli: c.cli && (c.cli.line || c.cli.note), m: c.matched } : null; }), QUESTIONS);
    let ok3 = 0; QUESTIONS.forEach((x, i) => { const r = res[i] || {}, good = r.w === x.w && (r.a || null) === x.a; if (good) ok3++; k.L('S3 ' + (good ? 'ok ' : 'WRONG ') + JSON.stringify(x.q) + ' -> window=' + r.w + ' action=' + r.a + ' cli=' + JSON.stringify(r.cli) + ' (want ' + x.w + '/' + x.a + ')'); });
    k.chk('S3 the question set finds the window and the action', ok3 === QUESTIONS.length, ok3 + '/' + QUESTIONS.length);
    // S4: every link the widget renders goes to a window on the role's menu; the card's window link opens it
    const s4 = await page.evaluate(() => {
      const menu = window.__idmpFieldHelp.menu().windows, links = [];
      const box = document.createElement('div'); document.body.appendChild(box);
      ['How do I close a Sales Order?', 'How do I create a shipment?', 'complete an invoice', 'How can I void a payment?'].forEach((qq) => { window.__idmpHowto.ask(qq); document.querySelectorAll('#idmp-howto-card a[data-help-win]').forEach((a) => links.push(Number(a.getAttribute('data-help-win')))); });
      return { n: links.length, onMenu: links.filter((w) => menu.indexOf(w) >= 0).length };
    });
    if (!s4.n) k.incon('S4', 'VACUOUS: no link rendered');
    else k.chk('S4 every rendered help link points at a window on the role\'s menu', s4.onMenu === s4.n, s4.onMenu + '/' + s4.n);
    await page.evaluate(() => window.__idmpHowto.ask('How can I void a payment?'));
    const before = logs.length;
    const clicked = await page.click('#idmp-howto-card .hs-card > .hs-row a[data-help-win]', { timeout: 3000 }).then(() => true).catch(() => false);   // no window link (e.g. nophrase) = a FAIL below, not a crash
    if (!clicked) k.L('S4 the card has no window link to click');
    for (let i = 0; i < 40 && !logs.slice(before).some((l) => /^§IDEMPIERE window=.*\(195\)/.test(l)); i++) await page.waitForTimeout(250);
    const opened = logs.slice(before).find((l) => /^§IDEMPIERE window=.*\(195\)/.test(l)), linkLine = logs.slice(before).find((l) => /^§HELP_LINK/.test(l));
    k.chk('S4 clicking the card\'s window link opens that window', !!opened, (linkLine || 'no §HELP_LINK') + ' | ' + (opened || 'no §IDEMPIERE window=…(195)'));
    const ctx = logs.slice(before).find((l) => /^§HELP_CTX window=195/.test(l));
    k.chk('S4 the How To widget follows the window in view (its own how-to row)', !!ctx && !/howto=none/.test(ctx), ctx || 'no §HELP_CTX window=195');
    // S2: de_DE reaches the field tooltip + panel through the real path (ErpI18n.applyWindow on the window model, _appendReadonlyFields, FieldHelp)
    const dp = JSON.parse(fs.readFileSync(path.join(HELP, 'de_DE', 'help.json'), 'utf8')), de = {};
    Object.keys(dp.fields).forEach((id) => { de[id] = dp.fields[id].map((i) => (i >= 0 ? dp.texts[i] : null)); });
    const enRows = {}; q("SELECT f.ad_field_id fid, f.description d FROM ad_field f WHERE f.ad_tab_id=186").forEach((r) => { enRows[r.fid] = r.d == null ? '' : String(r.d); });
    const run = (lang) => page.evaluate(async (lang) => {
      await ErpI18n.set(lang);
      const H = window.__idmpFieldHelp, w = ErpI18n.applyWindow(H.windowModel(143)), tab = w.tabs[0], box = document.createElement('div'); document.body.appendChild(box);
      const form = H.readonlyForm(tab, null); box.appendChild(form);
      const byCol = {}; tab.fields.forEach((f) => { byCol[String(f.columnName).toLowerCase()] = f.id; });
      const out = []; form.querySelectorAll('.idmp-fld[data-ad-column]').forEach((fld) => { const v = fld.querySelector('.val'); v.focus(); out.push({ id: byCol[String(fld.getAttribute('data-ad-column')).toLowerCase()], title: v.hasAttribute('title') ? v.title : null, panel: document.getElementById('idmp-help-tooltip').innerHTML }); });
      box.remove(); return { tab: tab.id, out };
    }, lang);
    const enBefore = await run('en_US'), deRun = await run('de_DE'), enAfter = await run('en_US');
    let n = 0, okT = 0, okP = 0, fb = 0, okFb = 0;
    deRun.out.forEach((r) => {
      const hv = de[String(r.id)], d = hv && hv[0] != null ? hv[0] : null;
      if (d != null) { n++; if (r.title === (d.length ? d : null)) okT++; if (d.trim().length === 0 || r.panel.indexOf(d.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')) >= 0 || r.panel.indexOf(d) >= 0) okP++; }
      else { fb++; const e = enRows[r.id]; if (r.title === (e && e.length ? e : null)) okFb++; }
    });
    k.L('S2 tab=' + deRun.tab + ' rendered=' + deRun.out.length + ' with a German pack entry=' + n + ' without (English shown)=' + fb);
    if (!n) k.incon('S2', 'VACUOUS: no German entry on the Sales Order header tab');
    else {
      k.chk('S2 de_DE tooltip = the pack\'s German Description', okT === n, okT + '/' + n);
      k.chk('S2 de_DE Tool Tip panel shows the German Description', okP === n, okP + '/' + n);
      k.chk('S2 a field without a German entry shows the English text, as legacy', okFb === fb, okFb + '/' + fb);
    }
    const same = JSON.stringify(enBefore.out) === JSON.stringify(enAfter.out);
    k.chk('S2 back to English: tooltips and panel byte-identical to before the switch', same, enBefore.out.length + ' fields');
  } finally { await b.close(); srv.close(); }
}
(async function main() {
  if (!fs.existsSync(SEED) || fs.statSync(SEED).size < 1e6) { k.incon('ALL', 'no usable seed'); return k.end(); }
  k.L('break=' + (BREAK || 'none'));
  s1(); s5(); await browser(); k.end();
})().catch((e) => { console.log('§W-HELP-SHOWCASE CRASH ' + (e && e.stack || e)); process.exit(3); });
