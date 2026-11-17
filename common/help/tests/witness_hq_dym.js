// ⚠ DO NOT REMOVE — W-HQ-DYM (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.5 Step 5; design prompts/HELP_QUERY_CORE_DESIGN.md D5). READ THE LOG; an exit code is not evidence.
// ISSUE it proves or disproves: a misspelled query ("Sales Ordr", "Rechnug") gives the help boxes nothing useful; ONE separate line "Did you mean: A · B · C" (common/help/help_dym.js, the ERP box AND the shared
// help panel, through AssistCore.nearest, the one suggester) must name what was meant, must not make things up, must not suggest 2-character names while the guard is on, must not run anything, and must not
// be a second edit-distance function.
//   D1  for every pack name of 3+ characters, the name with its MIDDLE character deleted shows that name in the line. X of N, N = names per pack (ERP: 5 languages, names = the language's + the English ones;
//       Viewer and Modeller: 18 locales each, the pack's own names). Not judged, and PRINTED per pack with the reason: the typo is itself an exact name (the top result is tier 0, so the line is not shown by rule);
//       a 3-character name (its typo has 2 characters: the §42 S3 territory, reported as D1b, never hidden). Then the same on the REAL ERP box and the REAL Viewer/Modeller panel (typed text, DOM read).
//   D2  a made-up word (8 random letters, seeded) shows no line, or names nothing farther than assist_core's limit max(2, floor(len/3)) by THIS witness's own edit distance.
//   D3  no name of 2 or fewer characters is suggested while the guard is on; and the guard is EXERCISED (the unguarded suggester does suggest such names for the same probes), else INCONCLUSIVE.
//   D4  nothing runs: on the real ERP box and the real panels, picking a suggestion fills the box and searches and nothing else (0 window opens, 0 kernel_ops written, 0 palette runs, only help log lines).
//   D5  `git grep` finds no second edit-distance function in common/help or erp (this witness's own copy, under common/help/tests, is the only one allowed and is excluded); the same grep finds the ONE in common/door.
//   L1  the line's label is the dictionary's word for the screen language (ERP chrome.json, Viewer dictionary), not hard-coded English.
// Red control (must FAIL D1): HQ_BREAK=nodym (the suggester returns nothing, in Node and in the pages).   Run: NODE_PATH=~/bim-ootb/node_modules:~/bim-compiler/node_modules node common/help/tests/witness_hq_dym.js [--no-pages]
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), cp = require('child_process');
const H = require('./_hq'), k = H.kit('W-HQ-DYM'), HQ = require(H.CORE), D = require(path.join(H.ROOT, 'common', 'help', 'help_dym.js')), AC = require(path.join(H.ROOT, 'common', 'door', 'assist_core.js'));
const NOPAGES = process.argv.indexOf('--no-pages') > 0, BR = process.env.HQ_BREAK || '';
const chars = (s) => Array.from(String(s)).length;
const mid = (n) => { const c = Array.from(n), i = Math.floor(c.length / 2); return c.slice(0, i).concat(c.slice(i + 1)).join(''); };   // the name with its middle character deleted
// this witness's OWN edit distance (the claim D2 is checked against something independent of assist_core's)
function dist(a, b) { a = a.toLowerCase(); b = b.toLowerCase(); const m = a.length, n = b.length; let p = []; for (let j = 0; j <= n; j++) p[j] = j;
  for (let i = 1; i <= m; i++) { const c = [i]; for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; } return p[n]; }
const limitOf = (typed) => Math.max(2, Math.floor(typed.length / 3));   // assist_core.js:29, read 2026-11-17
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const madeUp = (n, seed) => { const r = rng(seed), out = []; for (let i = 0; i < n; i++) { let w = ''; for (let j = 0; j < 8; j++) w += String.fromCharCode(97 + Math.floor(r() * 26)); out.push(w); } return out; };

const packs = [];   // {id, app, lang, names, h, alt}
function load() {
  if (H.seedOk()) H.LANGS.forEach((lang) => { const p = H.pack(lang); packs.push({ id: 'erp ' + lang, app: 'erp', lang, recs: p.index.records, alt: true, h: HQ.create(p.index, { text: p.text }) }); });
  else k.incon('ERP', 'no usable ad_seed.db (an LFS stub?): ERP packs not judged');
  H.BIM_APPS.forEach((app) => H.BIM_LOCALES.forEach((lang) => { const p = H.bimPack(app, lang); packs.push({ id: app + ' ' + lang, app, lang, recs: p.index.records, alt: false, h: HQ.create(p.index, { text: p.text }) }); }));
  packs.forEach((p) => { p.names = D.names(p.recs, { alt: p.alt }); });
}
const seen = [];   // every suggestion list any run produced, for D3

function d1() {
  const fam = {};   // app -> {X, N, ex, short, shortX, shortMiss}
  packs.forEach((p) => {
    const f = fam[p.app] || (fam[p.app] = { X: 0, N: 0, tn: 0, sh: 0, shX: 0, miss: [], shMiss: [] });
    let N = 0, X = 0, tn = 0, sh = 0, shX = 0;
    p.names.filter((n) => chars(n) >= 3).forEach((n) => {
      const typo = mid(n), top = p.h.query(typo)[0], tier = top ? top.tier : 3;
      if (tier === 0) { tn++; return; }   // the typo is itself a name: the rule says no line
      const s = D.suggest(typo, p.names, tier); seen.push(s);
      if (chars(typo) <= 2) { sh++; if (s.indexOf(n) >= 0) shX++; else if (f.shMiss.length < 4) f.shMiss.push(p.id + ' "' + n + '" -> "' + typo + '" => ' + JSON.stringify(s)); return; }
      N++; if (s.indexOf(n) >= 0) X++; else if (f.miss.length < 4) f.miss.push(p.id + ' "' + n + '" -> "' + typo + '" => ' + JSON.stringify(s));
    });
    f.X += X; f.N += N; f.tn += tn; f.sh += sh; f.shX += shX;
    k.L('D1 pack=' + p.id + ' names=' + p.names.length + ' (3+ chars ' + p.names.filter((n) => chars(n) >= 3).length + ') judged=' + N + ' source-in-line=' + X + ' not-judged: typo-is-a-name=' + tn + ' 3-char-names=' + sh + ' (D1b: ' + shX + ' of ' + sh + ')');
  });
  Object.keys(fam).forEach((app) => { const f = fam[app];
    if (!f.N) { k.incon('D1 ' + app, 'VACUOUS: no name judged'); return; }
    k.chk('D1 ' + app + ' packs: every name with its middle character deleted shows that name in the line: ' + f.X + ' of ' + f.N + ' names (not judged: ' + f.tn + ' typo-is-a-name)', f.X === f.N, f.miss.join(' ; '));
    k.L('D1b ' + app + ' 3-character names (typed text of 2 characters, the limit of assist_core.js:29, S3 not landed): ' + f.shX + ' of ' + f.sh + ' show the source' + (f.shMiss.length ? '; e.g. ' + f.shMiss.join(' ; ') : '') + ' — reported, not a verdict claim');
  });
}
function d2() {
  const words = madeUp(40, 20261117); let K = 0, none = 0, within = 0, v = 0; const bad = [];
  packs.forEach((p) => words.forEach((w) => {
    const top = p.h.query(w)[0], tier = top ? top.tier : 3, s = D.suggest(w, p.names, tier); seen.push(s); K++;
    if (!s.length) { none++; return; }
    const far = s.filter((n) => dist(w, n.replace(/-/g, '_')) > limitOf(w) && n.toLowerCase().indexOf(w) !== 0);
    if (far.length) { v++; if (bad.length < 3) bad.push(p.id + ' "' + w + '" => ' + JSON.stringify(far)); } else within++;
  }));
  k.L('D2 made-up words=' + words.length + ' (seeded 20261117, e.g. ' + words.slice(0, 3).join(',') + ') x packs=' + packs.length + ' = ' + K + ' lines asked: no-line=' + none + ' line-within-limit=' + within + ' line-beyond-limit=' + v);
  if (!K) k.incon('D2', 'VACUOUS: nothing asked'); else k.chk('D2 a made-up word shows no line or only names within the limit (own edit distance): ' + (K - v) + ' of ' + K, v === 0, bad.join(' ; '));
}
function d3() {
  let probes = 0, would = 0, got = 0, packsWith = 0; const ex = [];
  packs.forEach((p) => {
    const small = p.names.filter((n) => chars(n) <= 2); if (!small.length) return; packsWith++;
    small.forEach((s) => [s, s + 'x', 'x' + s].forEach((typed) => {
      probes++;
      const raw = AC.nearest(typed, p.names, 3).filter((x) => chars(x.name) <= 2);   // what the UNGUARDED suggester would offer
      if (raw.length) { would++; if (ex.length < 3) ex.push(p.id + ' "' + typed + '" would offer ' + JSON.stringify(raw.map((x) => x.name))); }
      const s2 = D.suggest(typed, p.names, 3); seen.push(s2); if (s2.some((n) => chars(n) <= 2)) got++;
    }));
  });
  const all = seen.reduce((n, l) => n + l.filter((x) => chars(x) <= 2).length, 0);
  k.L('D3 packs with a name of 2 or fewer characters=' + packsWith + ' probes=' + probes + ' the unguarded suggester would offer a short name for ' + would + ' of them (e.g. ' + ex.join(' ; ') + '); guarded: ' + got + '; short names in ALL ' + seen.length + ' lists any check produced: ' + all);
  if (!probes) k.incon('D3', 'VACUOUS: no pack holds a name of 2 or fewer characters');
  else if (!would && !BR) k.incon('D3', 'the guard is never exercised: the unguarded suggester offers no short name for these probes');
  else k.chk('D3 no name of 2 or fewer characters is suggested while the guard is on: ' + (seen.length - 0) + ' lists, ' + all + ' short names (unguarded would offer one for ' + would + ' of ' + probes + ' probes)', all === 0 && got === 0);
}
function d5() {
  const pat = 'levenshtein|damerau|editdistance|edit_distance|function lev\\b|\\blev\\(|Math\\.min\\([^)]*\\[[^]]*-[ ]*1\\]\\[';
  const run = (specs) => { const r = cp.spawnSync('git', ['-C', H.ROOT, 'grep', '-n', '-i', '-E', pat, '--'].concat(specs), { encoding: 'utf8' }); return (r.stdout || '').split('\n').filter(Boolean); };
  const mine = run(['common/help', 'erp', ':!common/help/tests']), door = run(['common/door/assist_core.js']);
  k.L('D5 git grep (edit-distance function) in common/help + erp, excluding this witness: ' + mine.length + ' hit(s)' + (mine.length ? ' ' + mine.slice(0, 3).join(' | ').slice(0, 300) : '') + '; in common/door/assist_core.js (control, the ONE): ' + door.length + ' hit(s)');
  if (!door.length) k.incon('D5', 'the grep control found nothing in assist_core.js: the pattern cannot see an edit distance');
  else k.chk('D5 no second edit-distance function in common/help or erp (the one suggester is AssistCore.nearest)', mine.length === 0, mine.slice(0, 3).join(' | '));
}

// ---------- pages ----------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.db': 'application/octet-stream', '.sql': 'text/plain' };
const serve = () => new Promise((ok) => { const s = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(H.ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); }); }); s.listen(0, '127.0.0.1', () => ok(s)); });
const CHROME = JSON.parse(fs.readFileSync(path.join(H.ERP, 'i18n', 'chrome.json'), 'utf8')).keys['help.dym'];
const erpLabel = (lang) => (lang === 'en_US' ? CHROME.en : (CHROME.machine && CHROME.machine[lang]) || CHROME.en);
const VIEWER_LABEL = (lang) => { const j = JSON.parse(fs.readFileSync(path.join(H.ROOT, 'viewer', 'i18n', lang + '.json'), 'utf8')); return (j.labels && j.labels.ui_help_dym) || null; };

async function erpPages() {
  let page; try { page = await H.erpPage(BR ? { HQ: BR } : null); } catch (e) { k.incon('D1p-erp', 'no headless chromium / ERP page: ' + String(e.message).split('\n')[0]); return; }
  try {
    let X = 0, N = 0, tn = 0, sh = 0; const miss = []; let lab = 0, labN = 0; const labBad = [];
    for (const lang of H.LANGS) {
      const line = lang === 'en_US' ? page.firstIndexLine : await page.setLang(lang);
      if (!line) { k.incon('D1p-erp ' + lang, 'the page did not build its index'); continue; }
      const r = await page.pg.evaluate(() => {
        const recs = window.__idmpHowto.index().records, set = new Set(window.__idmpFieldHelp.menu().windows), allowed = (g) => g[0] === 'window' && set.has(g[1]);
        const names = HelpDym.names(recs, { alt: true, allowed }), chars = (s) => Array.from(s).length, out = { names: names.length, N: 0, X: 0, tn: 0, sh: 0, miss: [], label: null, labelOf: [] };
        names.filter((n) => chars(n) >= 3).forEach((n) => {
          const c = Array.from(n), i = Math.floor(c.length / 2), typo = c.slice(0, i).concat(c.slice(i + 1)).join('');
          const card = window.__idmpHowto.ask(typo), top = card.hits[0] ? card.hits[0].tier : 3, host = document.getElementById('idmp-howto-dym'), items = host ? [...host.querySelectorAll('.hq-dym-item')].map((a) => a.getAttribute('data-dym')) : [];
          if (top === 0) { out.tn++; return; }
          if (chars(typo) <= 2) { out.sh++; return; }
          out.N++; if (items.indexOf(n) >= 0) out.X++; else if (out.miss.length < 3) out.miss.push('"' + n + '" -> "' + typo + '" => ' + JSON.stringify(items));
          if (!out.label && host && host.querySelector('.hq-dym-label')) out.label = host.querySelector('.hq-dym-label').textContent;
        });
        return out;
      });
      X += r.X; N += r.N; tn += r.tn; sh += r.sh; r.miss.forEach((m) => miss.length < 4 && miss.push(lang + ' ' + m));
      k.L('D1p erp page lang=' + lang + ' role-menu names=' + r.names + ' judged=' + r.N + ' source-in-line=' + r.X + ' not-judged: typo-is-a-name=' + r.tn + ' 3-char-names=' + r.sh);
      labN++; if (r.label === erpLabel(lang)) lab++; else labBad.push(lang + ' page="' + r.label + '" catalogue="' + erpLabel(lang) + '"');
    }
    if (!N) k.incon('D1p-erp', 'VACUOUS: no name judged on the page'); else k.chk('D1 the REAL ERP box (window.__idmpHowto.ask, DOM line read): every role-menu name with its middle character deleted shows that name: ' + X + ' of ' + N + ' (5 languages)', X === N, miss.join(' ; '));
    if (!labN) k.incon('L1-erp', 'no label read'); else k.chk('L1 the ERP line\'s label is the catalogue word (i18n/chrome.json help.dym) in each language: ' + lab + ' of ' + labN, lab === labN, labBad.join(' ; '));
    // D4 on the real box: pick a suggestion
    await page.setLang('en_US'); await page.pg.waitForTimeout(2500);
    const idle0 = page.logs.length; await page.pg.waitForTimeout(800); const idle = page.logs.slice(idle0).filter((l) => !/^§HELP_(SEARCH|DYM)/.test(l));   // control: what the page logs by itself in the same time
    const before = page.logs.length;
    const st = await page.pg.evaluate(() => {
      const ops = () => { try { return Number(window.__crud.kernelDb().exec('SELECT count(*) FROM kernel_ops')[0].values[0][0]); } catch (e) { return null; } };
      const names = HelpDym.names(window.__idmpHowto.index().records, { alt: true, allowed: (g) => g[0] === 'window' && new Set(window.__idmpFieldHelp.menu().windows).has(g[1]) });
      const target = names.filter((n) => n.length >= 6)[0], typo = target.slice(0, 3) + target.slice(4);
      const o0 = ops(); window.__idmpHowto.ask(typo);
      const a = document.querySelector('#idmp-howto-dym .hq-dym-item'), shown = [...document.querySelectorAll('#idmp-howto-dym .hq-dym-item')].map((x) => x.getAttribute('data-dym'));
      if (!a) return { typo, target, none: true };
      const tabs0 = document.querySelectorAll('[id^="idmp-tab"], .idmp-tab').length; a.click();
      return { target, typo, shown, clicked: a.getAttribute('data-dym'), box: document.getElementById('idmp-howto-q').value, ops0: o0, ops1: ops(), tabs0, tabs1: document.querySelectorAll('[id^="idmp-tab"], .idmp-tab').length, lineAfter: document.querySelectorAll('#idmp-howto-dym .hq-dym-item').length };
    });
    if (st.none) { k.chk('D4 ERP: a typed "' + st.typo + '" (from "' + st.target + '") gives a line to pick', false, 'no line shown, nothing to pick'); k.L('page errors=' + page.errs.length); return; }
    await page.pg.waitForTimeout(300);
    const newLogs = page.logs.slice(before), foreign = newLogs.filter((l) => !/^§HELP_(SEARCH|DYM)/.test(l));   // any other line (a window open, a CRUD, an op) is the pick's own
    k.L('D4 erp typed "' + st.typo + '" (from "' + st.target + '") line=' + JSON.stringify(st.shown) + ' clicked "' + st.clicked + '" box now "' + st.box + '" kernel_ops ' + st.ops0 + ' -> ' + st.ops1 + ' tabs ' + st.tabs0 + ' -> ' + st.tabs1 + ' log lines after: ' + newLogs.length + ' (non-help: ' + foreign.length + ') · idle control 800 ms without a pick: non-help lines=' + idle.length);
    k.chk('D4 ERP: a pick fills the box and searches, nothing else runs (0 window opens, 0 kernel_ops written, only §HELP_SEARCH/§HELP_DYM lines)', st.box === st.clicked && st.ops0 === st.ops1 && st.tabs0 === st.tabs1 && !foreign.length && newLogs.some((l) => l.indexOf('§HELP_SEARCH ask=' + JSON.stringify(st.clicked)) === 0), JSON.stringify(foreign.slice(0, 2)));
    if (st.ops0 === null) k.incon('D4-ops', 'kernel_ops is not readable from the page (window.__crud.kernelDb): the write count was not measured');
    k.chk('D4 ERP: after the pick the name is tier 0 and the line is gone (shown only when the top result is not tier 0)', st.lineAfter === 0);
    k.L('page errors=' + page.errs.length + (page.errs.length ? ' ' + page.errs.slice(0, 2).join(' | ') : ''));
  } finally { await page.close(); }
}

async function panelPages() {
  const { chromium } = require(process.env.PW || path.join(require('os').homedir(), 'bim-ootb', 'tests', 'node_modules', 'playwright')), srv = await serve(), browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const base = 'http://127.0.0.1:' + srv.address().port;
  try {
    for (const app of H.BIM_APPS) {
      let X = 0, N = 0; const miss = []; let ran = 0;
      for (const loc of ['en_US', 'de_DE', 'zh_CN']) {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' }), pg = await ctx.newPage(), errs = [], logs = [];
        pg.on('pageerror', (e) => errs.push(String(e).slice(0, 160))); pg.on('console', (m) => logs.push(m.text()));
        if (BR) await pg.addInitScript('window.__HQ_BREAK=' + JSON.stringify(BR));
        try {
          await pg.goto(base + (app === 'viewer' ? '/viewer/viewer.html' : '/modeller/modeller.html') + '?lang=' + loc, { waitUntil: 'load', timeout: 120000 });
          await pg.waitForFunction(app === 'viewer' ? 'window._TRL_READY === true && window.HelpPanel && window.HelpQuery && window.HelpDym && window._mainPillActions && window._mainPillActions.length && window.showCommandPalette' : 'window.__sceneReady === true && window.HelpPanel && window.HelpQuery && window.HelpDym && document.getElementById("m-help")', null, { timeout: 120000 });
          await pg.evaluate((a) => { if (a === 'viewer') window.showCommandPalette(); else document.getElementById('m-help').click(); }, app);
          await pg.waitForSelector('#cmd-search', { timeout: 30000 });
          const url = '/' + app + '/help/index/' + loc + '.json';
          const r = await pg.evaluate(async (u) => {
            const sleep = (ms) => new Promise((x) => setTimeout(x, ms)), inp = document.getElementById('cmd-search'), type = (v) => { inp.value = v; inp.dispatchEvent(new Event('input')); };
            const pack = await (await fetch(u)).json(), h = HelpQuery.create(pack, {}), names = HelpDym.names(pack.records, { alt: false }), chars = (s) => Array.from(s).length;
            type('zzz'); await sleep(300); type('zzzz'); await sleep(300);   // the first typed query starts the index fetch; wait for it
            const out = { names: names.length, N: 0, X: 0, tn: 0, sh: 0, miss: [], label: null, short: 0 };
            for (const n of names.filter((x) => chars(x) >= 3)) {
              const c = Array.from(n), i = Math.floor(c.length / 2), typo = c.slice(0, i).concat(c.slice(i + 1)).join(''), tp = h.query(typo)[0];
              if (tp && tp.tier === 0) { out.tn++; continue; }
              if (chars(typo) <= 2) { out.sh++; continue; }
              type(typo); const host = document.getElementById('cmd-dym'), items = [...host.querySelectorAll('.hq-dym-item')].map((a) => a.getAttribute('data-dym'));
              out.N++; if (items.indexOf(n) >= 0) out.X++; else if (out.miss.length < 3) out.miss.push('"' + n + '" -> "' + typo + '" => ' + JSON.stringify(items));
              out.short += items.filter((x) => chars(x) <= 2).length;
              if (!out.label && host.querySelector('.hq-dym-label')) out.label = host.querySelector('.hq-dym-label').textContent;
            }
            return out;
          }, url);
          await pg.waitForTimeout(500);   // the Modeller's dictionary observer translates the new node on the next frame
          const lab2 = await pg.evaluate(() => { const l = document.querySelector('#cmd-dym .hq-dym-label'); return l ? l.textContent : null; });
          if (r.N) { X += r.X; N += r.N; }
          r.miss.forEach((m) => miss.length < 4 && miss.push(app + ' ' + loc + ' ' + m));
          k.L('D1p ' + app + ' page locale=' + loc + ' pack names=' + r.names + ' judged=' + r.N + ' source-in-line=' + r.X + ' not-judged: typo-is-a-name=' + r.tn + ' 3-char-names=' + r.sh + ' short-names-in-lines=' + r.short + ' page-errors=' + errs.length);
          // L1: the label in this locale
          const want = loc === 'en_US' ? 'Did you mean' : VIEWER_LABEL(loc);
          k.chk('L1 ' + app + ' ' + loc + ' the line\'s label is the dictionary word (ui_help_dym): "' + lab2 + '"', !!want && lab2 === want, 'expected "' + want + '"');
          // D4 on the real panel: type a typo, pick the first suggestion
          const before = logs.length;
          const st = await pg.evaluate(async (u) => {
            const sleep = (ms) => new Promise((x) => setTimeout(x, ms)), inp = document.getElementById('cmd-search'), type = (v) => { inp.value = v; inp.dispatchEvent(new Event('input')); };
            const pack = await (await fetch(u)).json(), names = HelpDym.names(pack.records, { alt: false }).filter((n) => Array.from(n).length >= 5), target = names[0], c = Array.from(target), typo = c.slice(0, 2).concat(c.slice(3)).join('');
            type(typo); const items = [...document.querySelectorAll('#cmd-dym .hq-dym-item')]; if (!items.length) return { typo, target, none: true };
            const first = items[0].getAttribute('data-dym'); items[0].click(); await sleep(100);
            return { typo, target, first, box: inp.value, line: document.querySelectorAll('#cmd-dym .hq-dym-item').length };
          }, url);
          const nl = logs.slice(before), runs = nl.filter((l) => l.indexOf('§KBD_PALETTE_RUN') === 0).length, foreign = nl.filter((l) => !/^§(HELP_DYM|HOWTO_PALETTE|HELP_QUERY_LOAD)/.test(l));
          k.L('D4 ' + app + ' ' + loc + ' typed "' + st.typo + '" (from "' + st.target + '") picked "' + st.first + '" box now "' + st.box + '" palette runs=' + runs + ' non-help log lines=' + foreign.length + (foreign.length ? ' ' + JSON.stringify(foreign.slice(0, 2)) : ''));
          if (st.none) k.incon('D4 ' + app + ' ' + loc, 'no suggestion to pick for "' + st.typo + '"'); else k.chk('D4 ' + app + ' ' + loc + ': a pick fills the box and searches, nothing runs (0 palette runs, only help log lines)', st.box === st.first && runs === 0 && !foreign.length, JSON.stringify(foreign.slice(0, 2)));
          ran++;
        } catch (e) { k.incon(app + ' ' + loc, 'page failed: ' + String(e && e.message).split('\n')[0]); }
        await ctx.close();
      }
      if (!ran) continue;
      if (!N) k.incon('D1p-' + app, 'VACUOUS: no name judged on the page'); else k.chk('D1 the REAL ' + app + ' panel (typed into #cmd-search, #cmd-dym read): every name with its middle character deleted shows that name: ' + X + ' of ' + N + ' (en_US, de_DE, zh_CN)', X === N, miss.join(' ; '));
    }
  } finally { await browser.close(); srv.close(); }
}

(async function main() {
  load();
  k.L('start node=' + process.versions.node + ' packs=' + packs.length + ' (' + packs.filter((p) => p.app === 'erp').length + ' ERP + ' + packs.filter((p) => p.app === 'viewer').length + ' Viewer + ' + packs.filter((p) => p.app === 'modeller').length + ' Modeller) GUARD_MIN_CHARS=' + D.GUARD_MIN_CHARS + ' n=' + D.N + (BR ? ' HQ_BREAK=' + BR : ''));
  if (!packs.length) { k.incon('ALL', 'no pack loaded'); return k.end(); }
  d1(); d2(); d3(); d5();
  if (NOPAGES) k.incon('pages', '--no-pages: D4 and the page-level D1/L1 were not run');
  else { await erpPages(); await panelPages(); }
  k.end();
})().catch((e) => { console.log('ERROR', e && e.stack || e); process.exitCode = 2; });
