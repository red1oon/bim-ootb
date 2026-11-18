#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-MODELLER-TERMS (bim-compiler prompts/TRL_TRILOGY_STANDARD.md §3 S-2, step T3). READ THE LOG after every run: viewer/tests/logs/w_modeller_terms.log
// ISSUE IT PROVES OR DISPROVES: "the Modeller finds a term by matching its English text, not by its key" — that path (the dictionary page, loader __TRL_DICT_PAGE) breaks when a term's
// English is edited, and it turns a node that merely reads "EN" into "es-ES" / "pt-BR" (the English of the term attribute ifcdef_<C>_lang is also a UI word).
//   M0  MEASURE what the Modeller shows: terms found in its sources (static) and in its screen (runtime, de_DE): printed as numbers, never assumed.
//   M1  for each of the 153 BIM_Element terms, the Modeller's text equals the Viewer's for the same key and locale (real pages, in-place switch), over the 18 locales: X of N = 153 x 18.
//   M2  a term looked up BY KEY survives an edit of that term's base English (en_MY row edited in memory, served to the page): the text in the other locales is unchanged, 14 of 14 (the 14 locales whose term text differs from the English; en_MY/US/GB/AU show the English).
//   M3  the Modeller's exact-English dictionary carries no term: its size drops by the terms' distinct English, and a node reading "EN" stays "EN" in es_ES and pt_BR.
//   RED the OLD exact-English path (the loader of BEFORE_REF, same pages) FAILs M2: translated before the edit, 0 after; and maps "EN" to es-ES.
// INCONCLUSIVE, never PASS, when nothing was judged. Run: node viewer/tests/witness_modeller_terms.js   Env: BEFORE_REF (the main commit before T3, default 40c9b28b), PW.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), http = require('http');
const ROOT = path.resolve(__dirname, '..', '..'), T = require('../tools/trl_common');
const BEFORE_REF = process.env.BEFORE_REF || '40c9b28b';
const PW = process.env.PW || path.join(os.homedir(), 'bim-ootb', 'tests', 'node_modules', 'playwright');
fs.mkdirSync(path.join(__dirname, 'logs'), { recursive: true });
const LOGF = path.join(__dirname, 'logs', 'w_modeller_terms.log'); fs.writeFileSync(LOGF, '');
const out = (m) => { console.log(m); fs.appendFileSync(LOGF, m + '\n'); };
let pass = 0, fail = 0, inc = 0;
const chk = (name, ok, info) => { ok ? pass++ : fail++; out('  ' + (ok ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + info : '')); return ok; };
const incon = (id, why) => { inc++; out('§MODELLER_TERMS INCONCLUSIVE ' + id + ' — ' + why); };
const L = (m) => out('§MODELLER_TERMS ' + m);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.db': 'application/octet-stream' };
const pack = (l) => JSON.parse(fs.readFileSync(path.join(T.I18N, l + '.json'), 'utf8'));
const NONEN = T.LOCALES.filter(l => !/^en_/.test(l)), KEYCLS = 'ifccls_IfcWall';

(async () => {
  const terms = T.readTerms(), TK = terms.map(r => r.value), EN = pack(T.BASE).labels;
  L('begin before_ref=' + BEFORE_REF + ' terms=' + TK.length + ' locales=' + T.LOCALES.length);
  const oldLoader = cp.spawnSync('git', ['show', BEFORE_REF + ':viewer/locale_loader.js'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  if (oldLoader.status !== 0 || !TK.length) { incon('setup', 'no BEFORE_REF loader (' + BEFORE_REF + ') or no term rows'); return end(); }

  // ── M0a static: the Modeller's own sources (modeller/, common/help, viewer/help) never name a term key or hold a term sentence ──
  const files = cp.execSync('git ls-files modeller common viewer/help', { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(f => /\.(js|html|json)$/.test(f) && !/(^|\/)(tests|lib)\//.test(f));
  const src = files.map(f => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]);
  const keyRefs = [], textRefs = [];
  src.forEach(([f, s]) => { if (/ifccls_|ifcdef_|BIM_Element|BimElement/.test(s)) keyRefs.push(f); });
  terms.filter(r => r.msgtext.length >= 12 && !/^Ifc\w+$/.test(r.msgtext)).forEach(r => src.forEach(([f, s]) => { const at = s.indexOf(r.msgtext.slice(0, 30)); if (at >= 0) textRefs.push(r.value + ' ' + f + ':' + (s.slice(0, at).split('\n').length)); }));
  L('M0a static: ' + files.length + ' Modeller-side source files; term key names: ' + keyRefs.length + (keyRefs.length ? ' [' + keyRefs.join(',') + ']' : '') + '; term sentences: ' + textRefs.length + (textRefs.length ? ' [' + textRefs.slice(0, 5).join(' ') + ']' : ''));

  const srv = http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(b); }); });
  await new Promise(r => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port;
  const { chromium } = require(PW), browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
  // a page: which = modeller|viewer; opts.oldLoader serves the BEFORE_REF loader; opts.editKey edits that term's English in the en_MY pack the page is served
  async function open(which, opts) {
    opts = opts || {}; const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } }), pg = await ctx.newPage(), logs = [];
    pg.on('console', m => logs.push(m.text())); pg.on('pageerror', e => logs.push('PAGEERR ' + e.message));
    if (opts.oldLoader) await pg.route('**/viewer/locale_loader.js*', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: oldLoader.stdout }));
    if (opts.editKey) await pg.route('**/viewer/i18n/en_MY.json', r => { const j = pack(T.BASE); j.labels[opts.editKey] = j.labels[opts.editKey] + ' (EDITED IN MEMORY)'; r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j) }); });
    await pg.goto(base + (which === 'viewer' ? '/viewer/viewer.html?blank=1&ghost=1' : '/modeller/modeller.html'), { waitUntil: 'load', timeout: 90000 });
    const ok = await pg.waitForFunction(() => window._TRL_READY === true && window._TRL_LOADER, null, { timeout: 60000 }).then(() => true).catch(() => false);
    await pg.waitForTimeout(600);
    return { pg, ctx, ok, logs };
  }
  const sw = (pg, code) => pg.evaluate((c) => window._TRL_LOADER.setLocale(c).then(r => (r && r.to) || null), code);
  const probe = (pg, text) => pg.evaluate((t) => { const d = document.createElement('div'); d.textContent = t; document.body.appendChild(d); window._TRL_DICT.apply(d); const v = d.textContent; d.remove(); return v; }, text);
  try {
    // ── M0b runtime: what the Modeller screen holds, de_DE ──
    const mo = await open('modeller');
    if (!mo.ok) { incon('M0b', 'Modeller did not reach trl-ready'); return end(); }
    await sw(mo.pg, 'de_DE'); await mo.pg.waitForTimeout(500);
    const shown = await mo.pg.evaluate((tt) => { const html = document.documentElement.innerText + ' ' + Array.from(document.querySelectorAll('[title],[placeholder],[aria-label]')).map(e => (e.title || '') + (e.placeholder || '') + (e.getAttribute('aria-label') || '')).join(' ');
      return { shown: tt.filter(r => r[1].length >= 12 && !/^Ifc\w+$/.test(r[1]) && (html.includes(r[1].slice(0, 30)) || html.includes((window._TRL[r[0]] || '\u0000').slice(0, 30)))).map(r => r[0]), dict: window._TRL_DICT.size() }; }, terms.map(r => [r.value, r.msgtext]));
    L('M0b runtime (Modeller, de_DE, text + title/placeholder/aria-label): BIM_Element terms shown on screen=' + shown.shown.length + (shown.shown.length ? ' [' + shown.shown.slice(0, 5) + ']' : '') + '; exact-English dictionary size=' + shown.dict);
    const newDict = shown.dict;

    // ── M1: Modeller == Viewer, per key and locale ──
    const vw = await open('viewer'); if (!vw.ok) { incon('M1', 'Viewer did not reach trl-ready'); return end(); }
    let ok1 = 0, n1 = 0; const bad1 = [], per = [];
    for (const lang of T.LOCALES) {
      const a = await sw(mo.pg, lang), b = await sw(vw.pg, lang);
      const m = await mo.pg.evaluate((k) => k.map(x => window._trl(x, null, '\u0000MISSING')), TK), v = await vw.pg.evaluate((k) => k.map(x => window._trl(x, null, '\u0000MISSING')), TK), want = pack(lang).labels;
      let o = 0; TK.forEach((k, i) => { n1++; if (m[i] === v[i] && m[i] === want[k] && a === lang && b === lang) { o++; ok1++; } else if (bad1.length < 3) bad1.push(lang + ':' + k); });
      per.push(lang + '=' + o + '/' + TK.length);
    }
    L('M1 ' + per.join(' '));
    chk('M1 a term in the Modeller equals the Viewer\'s for the same key and locale (and the pack): ' + ok1 + ' of ' + n1 + ' (' + TK.length + ' terms x ' + T.LOCALES.length + ' locales); terms shown on screen today: ' + shown.shown.length + ' (N is the set the Modeller\'s lookup serves)', n1 > 0 && ok1 === n1, bad1.join(' | '));
    await vw.ctx.close(); await mo.ctx.close();

    // ── M2 (new loader) and RED (old loader): edit the English of ifccls_IfcWall in the served en_MY pack ──
    const enOrig = EN[KEYCLS];
    async function m2(oldL, edited) {
      const p = await open('modeller', { oldLoader: oldL, editKey: edited ? KEYCLS : null }); if (!p.ok) return null;
      let byKey = 0, byEn = 0, n = 0; const enNodes = [];
      for (const lang of NONEN) { await sw(p.pg, lang); const want = pack(lang).labels[KEYCLS]; n++;
        if ((await p.pg.evaluate((k) => window._trl(k, null, '\u0000MISSING'), KEYCLS)) === want) byKey++;          // the lookup by KEY
        const t = await probe(p.pg, enOrig); if (t === want) byEn++; }                                             // the lookup by the ORIGINAL English (the old path)
      const esEN = await sw(p.pg, 'es_ES').then(() => probe(p.pg, 'EN')), ptEN = await sw(p.pg, 'pt_BR').then(() => probe(p.pg, 'EN')), dict = await p.pg.evaluate(() => window._TRL_DICT.size());
      await p.ctx.close(); return { byKey, byEn, n, esEN, ptEN, dict };
    }
    const nNew = await m2(false, true), oOld0 = await m2(true, false), oOld1 = await m2(true, true);
    if (!nNew || !oOld0 || !oOld1) { incon('M2', 'a Modeller page did not reach trl-ready'); return end(); }
    L('M2 new loader, base English of ' + KEYCLS + ' edited: by key ' + nNew.byKey + '/' + nNew.n + ' unchanged; old loader unedited: by English ' + oOld0.byEn + '/' + oOld0.n + ', after the edit: by English ' + oOld1.byEn + '/' + oOld1.n + ' (by key ' + oOld1.byKey + '/' + oOld1.n + ')');
    chk('M2 a term looked up BY KEY keeps its translated text in the other locales after its base English is edited: ' + nNew.byKey + ' of ' + nNew.n, nNew.n > 0 && nNew.byKey === nNew.n);
    chk('RED the OLD exact-English path FAILs M2: translated ' + oOld0.byEn + '/' + oOld0.n + ' unedited, ' + oOld1.byEn + '/' + oOld1.n + ' after the edit (witness can fail)', oOld0.byEn === oOld0.n && oOld1.byEn === 0);

    // ── M3: the dictionary carries no term ──
    const distinct = new Set(terms.filter(r => r.msgtext.trim().length > 1).map(r => r.msgtext.trim())).size;
    L('M3 dictionary size: old loader ' + oOld0.dict + ', new loader ' + newDict + ' (de_DE); "EN" in es_ES -> old "' + oOld0.esEN + '", new "' + nNew.esEN + '"; in pt_BR -> old "' + oOld0.ptEN + '", new "' + nNew.ptEN + '"');
    chk('M3 the exact-English dictionary carries no term: size ' + oOld0.dict + ' -> ' + nNew.dict + ' (' + distinct + ' distinct term English strings in the pack)', nNew.dict < oOld0.dict && oOld0.dict - nNew.dict >= 100);
    chk('M3 a node reading "EN" stays "EN" in es_ES and pt_BR (old path: "' + oOld0.esEN + '" / "' + oOld0.ptEN + '")', nNew.esEN === 'EN' && nNew.ptEN === 'EN' && (oOld0.esEN !== 'EN' || oOld0.ptEN !== 'EN'));
  } catch (e) { fail++; out('FAIL harness exception ' + (e && e.stack || e)); }
  await browser.close(); srv.close(); end();
})();
function end() {
  const verdict = fail ? 'FAIL' : (inc || !pass ? 'INCONCLUSIVE' : 'PASS');
  out('§WITNESS_MODELLER_TERMS pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + ' verdict=' + verdict);
  process.exitCode = verdict === 'PASS' ? 0 : 1;
}
