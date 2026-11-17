// ⚠ DO NOT REMOVE — H-SUPERSET (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.4 Step 4; design prompts/HELP_QUERY_CORE_DESIGN.md §2 D1, §6 step 4). READ THE LOG; an exit code is not evidence.
// ISSUE it proves or disproves: "moving the Viewer and Modeller help panels onto the shared query core LOST something that the old substring filter used to find".
// Method, on the REAL pages (viewer.html, modeller.html) in headless Chromium (--disable-gpu), per locale: the page's own live entries (the panel's cfg.entries(), captured at HelpPanel.toggle) give the probes:
// every word of 3+ characters of every entry's name, its sub-rows (children), its CLI titles and (Modeller) its guide paragraph. Each probe is TYPED into the real #cmd-search (the input event, the panel's own renderList);
// the rows that come back are read from the DOM. The OLD filter (help_panel.js at bim-ootb 3fb4ce8b, deleted by this PR; copied below, verbatim) is run over the same live entries for the same probe.
//   H1  SOURCE  X of N probes: the entry the word came from is in the core's list.  (N = (entry, word) pairs read from the live entries; printed.)
//   H2  ALL-OLD every entry the OLD filter returned for the probe, where the probe is a WHOLE word of that entry's own text (name, shortcut, sub-rows, CLI title + verb, guide paragraph), is in the core's list.
//       The OLD filter also matched a probe that is only a PIECE of a longer word ("open" inside "openings"); the core matches whole words (design D2: no stemming), so those are NOT kept. They are counted and
//       printed on every run (`old-hits-inside-a-longer-word`, `not-kept`) as the named deviation, never hidden; a name still matches by substring (tier 2), so only body text is affected.
//   H4  COVERED every live entry has a record in the index file (an entry without one is still found, from itself; this line shows the file has gone stale).
//   H3  NOPACK  with the index file refused (404), the same probes (first locale only) still hold: a live entry with no record is indexed from itself, so a missing pack loses nothing.
// Red control (must FAIL): HB_BREAK=nosub serves every index with the sub-row field `d` (and the guide paragraph `h`) removed from each record: words found only in a sub-row are lost, so H1/H2 must FAIL.
// INCONCLUSIVE when no probe was judged, a probe was answered before the index loaded ("via=wait"), or a page could not be opened.
// Run: NODE_PATH=~/bim-ootb/node_modules:~/bim-compiler/node_modules node common/help/tests/witness_help_superset.js [--locales en_US,de_DE] [--apps viewer,modeller]
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const ROOT = path.join(__dirname, '..', '..', '..');
const PW = process.env.PW || path.join(os.homedir(), 'bim-ootb', 'tests', 'node_modules', 'playwright');
const { chromium } = require(PW);
const LOGD = path.join(__dirname, 'logs'), BR = process.env.HB_BREAK || '';
fs.mkdirSync(LOGD, { recursive: true });
const LOGF = path.join(LOGD, 'witness_help_superset' + (BR ? '_break_' + BR : '') + '.log'); fs.writeFileSync(LOGF, '');
const say = (m) => { console.log(m); fs.appendFileSync(LOGF, m + '\n'); };
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const LOCALES = arg('locales', 'en_US,de_DE,fr_FR,zh_CN,ja_JP,th_TH,ar_SA').split(','), APPS = arg('apps', 'viewer,modeller').split(',');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.xml': 'application/xml' };
let pass = 0, fail = 0, inc = 0;
const chk = (id, ok, m) => { ok ? pass++ : fail++; say('  ' + (ok ? 'PASS ' : 'FAIL ') + id + ' ' + m); };
const incon = (id, why) => { inc++; say('§H-SUPERSET INCONCLUSIVE ' + id + ' — ' + why); };

// in the page: the probes, typed for real, and both answers. `OLD` is the substring filter of common/help/help_panel.js renderList at bim-ootb 3fb4ce8b, verbatim in logic.
async function probePage(opts) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const cfg = window.__hqCfg, inp = document.getElementById('cmd-search'), st = cfg.state;
  const OLD = (all, f0) => {   // f0 = the typed text; returns the entries' names the old filter kept
    const f = (f0 || '').toLowerCase();
    return all.filter((e) => {
      e.seq = e.seq || '';
      if (String(e.name).toLowerCase().indexOf(f) >= 0 || e.seq.toLowerCase().indexOf(f) >= 0) return true;
      if (!f) return false;
      return (e.children || []).some((c) => String(c.name || '').toLowerCase().indexOf(f) >= 0) ||
        ((e.howto && e.howto.cli) || []).some((c) => String(c.title).toLowerCase().indexOf(f) >= 0 || c.verb.indexOf(f) >= 0) ||
        !!(e.howto && e.howto.text && String(e.howto.text).replace(/<[^>]*>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').toLowerCase().indexOf(f) >= 0);
    });
  };
  // is the typed text a WHOLE word of one of the entry's own fields (name, shortcut, sub-rows, CLI title + verb, guide text), not just a piece of a longer word?
  const tok = (t) => String(t || '').replace(/<[^>]*>/g, ' ').toLowerCase().split(/[^\p{L}\p{N}\p{M}]+/u).filter(Boolean);
  const whole = (e, f0) => { const f = String(f0).toLowerCase(), t = [e.name, e.seq].concat((e.children || []).map((c) => c.name), ((e.howto && e.howto.cli) || []).map((c) => c.title + ' ' + c.verb), [e.howto && e.howto.text]);
    return t.some((x) => tok(x).indexOf(f) >= 0); };
  const type = (v) => { inp.value = v; inp.dispatchEvent(new Event('input')); };
  const rows = () => [...document.querySelectorAll('#cmd-palette .cmd-row')].map((r) => (r.firstChild ? r.firstChild.textContent : '').replace(/\s+/g, ' ').trim());
  const words = (t) => String(t || '').replace(/<[^>]*>/g, ' ').split(/[^\p{L}\p{N}\p{M}]+/u).filter((w) => Array.from(w).length >= 3);
  // the live entries WITH their guide paragraphs (the Modeller adds a paragraph only while a filter is typed)
  type('zz'); await sleep(50); const withText = cfg.entries(); type('');
  const by = {}; withText.forEach((e) => { by[String(e.hkey || e.name)] = e; });
  const probes = [];
  cfg.entries().forEach((e) => {
    const src = by[String(e.hkey || e.name)] || e, seen = new Set(), put = (w) => { if (!seen.has(w.toLowerCase())) { seen.add(w.toLowerCase()); probes.push({ w, name: String(e.name), hkey: String(e.hkey || e.name) }); } };
    words(e.name).forEach(put); (e.children || []).forEach((c) => words(c.name).forEach(put));
    ((src.howto && src.howto.cli) || []).forEach((c) => words(c.title).forEach(put));
    if (src.howto && src.howto.text) words(src.howto.text).forEach(put);
  });
  // wait for the index to land (the first typed query starts the fetch; the list stays whole until then)
  type(probes.length ? probes[0].w : 'zzz'); for (let i = 0; i < 100 && !window.__hqLoad; i++) await sleep(50); await sleep(100);
  const out = { n: 0, srcFound: 0, srcMiss: [], oldHits: 0, lost: 0, lostEx: [], subHits: 0, subLost: 0, subEx: [], wait: 0, via: {}, load: window.__hqLoad || null };
  for (const p of probes) {
    type(p.w); const now = rows(), via = String(window.__hqVia || '');
    out.via[via] = (out.via[via] || 0) + 1; if (/^wait/.test(window.__hqVia || '')) { out.wait++; continue; }
    const old = OLD(cfg.entries(), p.w), set = new Set(now);
    out.n++; if (set.has(p.name)) out.srcFound++; else if (out.srcMiss.length < 4) out.srcMiss.push('"' + p.w + '" of "' + p.name + '"');
    old.forEach((e) => { const nm = String(e.name), isWhole = whole(e, p.w);
      if (isWhole) { out.oldHits++; if (!set.has(nm)) { out.lost++; if (out.lostEx.length < 4) out.lostEx.push('"' + p.w + '" old kept "' + nm + '"'); } }
      else { out.subHits++; if (!set.has(nm)) { out.subLost++; if (out.subEx.length < 3) out.subEx.push('"' + p.w + '" inside a longer word of "' + nm + '"'); } } });
  }
  // H4: how many live entries have a record in the index file (the rest are indexed from themselves at run time): a stale pack shows here, not as a loss
  let have = {}; try { const j = await (await fetch(opts.url)).json(); (j.records || []).forEach((r) => { if (r.go) have[String(r.go.hkey)] = 1; }); } catch (e) { have = null; }
  const live = cfg.entries(); out.entries = live.length; out.uncovered = have ? live.filter((e) => !have[String(e.hkey || e.name)]).map((e) => String(e.hkey || e.name)) : null;
  type(''); return out;
}
async function run() {
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const base = 'http://127.0.0.1:' + srv.address().port, browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  say('§H-SUPERSET start chromium=' + browser.version() + ' node=' + process.versions.node + ' apps=' + APPS.join(',') + ' locales=' + LOCALES.join(',') + (BR ? ' HB_BREAK=' + BR : ''));
  let X = 0, N = 0;
  try {
    for (const app of APPS) {
      for (const loc of LOCALES) {
        for (const mode of loc === LOCALES[0] && !BR ? ['pack', 'nopack'] : ['pack']) {
          const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' }), pg = await ctx.newPage(), errs = [];
          pg.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
          await pg.addInitScript(() => { const o = console.log; console.log = function () { const t = String(arguments[0]); if (t.indexOf('§HELP_QUERY_LOAD') === 0) window.__hqLoad = t; if (t.indexOf('§HOWTO_PALETTE') === 0) window.__hqVia = (t.match(/ via=(\S+)/) || [])[1]; return o.apply(console, arguments); }; });
          await pg.route('**/help/index/*.json', (route) => {
            if (mode === 'nopack') return route.fulfill({ status: 404, body: 'x' });
            if (BR !== 'nosub') return route.continue();
            return route.fetch().then((r) => r.json()).then((j) => { j.records.forEach((rc) => { delete rc.d; delete rc.h; }); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j) }); });
          });
          const url = base + (app === 'viewer' ? '/viewer/viewer.html' : '/modeller/modeller.html') + '?lang=' + loc;
          try {
            await pg.goto(url, { waitUntil: 'load', timeout: 120000 });
            await pg.waitForFunction(app === 'viewer' ? 'window._TRL_READY === true && window.HelpPanel && window.HelpQuery && window._mainPillActions && window._mainPillActions.length && window.showCommandPalette' : 'window.__sceneReady === true && window.HelpPanel && window.HelpQuery && document.getElementById("m-help") && window.__modellerGuideSections', null, { timeout: 180000 });
            await pg.evaluate(() => { const o = window.HelpPanel.toggle; window.HelpPanel.toggle = function (cfg) { window.__hqCfg = cfg; return o.apply(this, arguments); }; });
            await pg.evaluate((a) => { if (a === 'viewer') window.showCommandPalette(); else document.getElementById('m-help').click(); }, app);
            await pg.waitForSelector('#cmd-search', { timeout: 30000 });
            const r = await pg.evaluate(probePage, { url: (app === 'viewer' ? base + '/viewer/help/index/' : base + '/modeller/help/index/') + loc + '.json' });
            const tag = app + ' ' + loc + (mode === 'nopack' ? ' (index refused)' : '');
            say('§H-SUPERSET app=' + app + ' locale=' + loc + ' mode=' + mode + ' probes=' + r.n + ' source-found=' + r.srcFound + ' old-hits-whole-word=' + r.oldHits + ' lost=' + r.lost + ' old-hits-inside-a-longer-word=' + r.subHits + ' not-kept=' + r.subLost + ' waited=' + r.wait + ' via=' + JSON.stringify(r.via) + ' page-errors=' + errs.length + (r.load ? ' ' + r.load.replace('§HELP_QUERY_LOAD ', '') : ''));
            if (!r.n || r.wait) { incon(tag, 'probes judged ' + r.n + ', answered-before-index ' + r.wait); }
            else {
              if (mode === 'pack') { X += r.srcFound; N += r.n; }
              chk('H1' + (mode === 'nopack' ? '/H3' : '') + ' ' + tag + ' the entry a word came from is in the core list: ' + r.srcFound + ' of ' + r.n, r.srcFound === r.n, r.srcMiss.length ? 'e.g. ' + r.srcMiss.join(' ; ') : '');
              chk('H2' + (mode === 'nopack' ? '/H3' : '') + ' ' + tag + ' every entry the OLD filter kept for a whole word is in the core list: ' + (r.oldHits - r.lost) + ' of ' + r.oldHits, r.lost === 0, r.lostEx.length ? 'e.g. ' + r.lostEx.join(' ; ') : '');
              if (mode === 'pack') chk('H4 ' + tag + ' every live entry has a record in the index file: ' + (r.entries - (r.uncovered || []).length) + ' of ' + r.entries, !!r.uncovered && !r.uncovered.length, (r.uncovered || []).length ? 'no record for ' + r.uncovered.join(',') : '');
              if (mode === 'pack' && !(r.via['core:ok'] > 0)) chk('H0 ' + tag + ' the answers came from the core over the pack', false, JSON.stringify(r.via));
              if (mode === 'nopack' && !(r.via['core:fail'] > 0)) chk('H0 ' + tag + ' the refused index was really refused', false, JSON.stringify(r.via));
            }
          } catch (e) { incon(app + ' ' + loc + ' ' + mode, 'page failed: ' + String(e && e.message).split('\n')[0]); }
          await ctx.close();
        }
      }
    }
  } finally { await browser.close(); srv.close(); }
  say('§H-SUPERSET ALL (index present): ' + X + ' of ' + N + ' probes find their own entry');
  const v = fail ? 'FAIL' : (inc || !pass ? 'INCONCLUSIVE' : 'PASS');
  say('§WITNESS_H_SUPERSET pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + ' verdict=' + v + (BR ? ' HB_BREAK=' + BR : ''));
  process.exitCode = v === 'PASS' ? 0 : 1;
}
run().catch((e) => { console.log('ERROR', e && e.stack || e); process.exitCode = 2; });
