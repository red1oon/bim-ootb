#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-HOWTO (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §14.3). Scope: the How To rows of the Viewer's
// `?` / F1 palette (viewer/help/howto.json, built by viewer/tools/build_howto.js; rendered by scene.js showCommandPalette).
// READ THE LOG: exit code alone is not evidence.
// Issues it proves/disproves:
//   H1 DRIFT    — "the guide moved a section and the palette still links the old place": howto.json == the generator's output
//                 on today's live guide + panels.js + verbs.json. Guide unreachable → INCONCLUSIVE, never PASS.
//   H2 TRUE     — "a link goes to a section that does not explain the tool": every anchor exists on the live guide AND its
//                 section names the pill (heading or body).
//   H3 CLI      — "a CLI line is invented": each quoted phrase is in that verb's own description; the line's inputs are
//                 exactly the verb's required inputs.
//   H4 PAGE     — "the user never sees it": viewer.html + Duplex, F1 → the palette shows a guide link on X of N entries
//                 (N = the page's own pill list, which must equal the file's); a word only in a bullet finds its pill, opened;
//                 Find shows its 3 CLI lines; in de_DE the bullets are German and the label says the guide is English.
//   H5 TIE     — "a new section that merely comes first steals a tool's link" (§14.3.2): an equal mention count goes to the
//                 section whose heading shares a word with the pill's name, in either page order; mentions still dominate; a tie with no
//                 shared word keeps the first. Offline, synthetic page. Red control: the OLD rule (1e6+n, first wins) must FAIL H5a.
//   RED CONTROL — a made-up anchor, a section that does not name its pill, and a phrase not in the verb must FAIL (contract kit).
// usage: NODE_PATH=~/bim-ootb/node_modules:~/bim-compiler/node_modules node viewer/tests/witness_howto.js [--no-page]
//        [BUILDINGS=<dir with Duplex_extracted.db>, default ~/bim-ootb/viewer/buildings]
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const { Witness } = require(path.join(ROOT, 'witness_kit', 'contract.js'));
const B = require(path.join(ROOT, 'viewer', 'tools', 'build_howto.js'));
const BLD = process.env.BUILDINGS || path.join(process.env.HOME, 'bim-ootb', 'viewer', 'buildings');
const H = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'help', 'howto.json'), 'utf8'));
const VERBS = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, 'common', 'door', 'verbs.json'), 'utf8')).verbs.map(v => [v.verb, v]));
const log = console.log;
let fails = 0; const ck = (id, ok, msg) => { log((ok ? '§PASS ' : '§FAIL ') + id + ' ' + msg); if (!ok) fails++; };

(async () => {
  // H1 — the generator's own --check
  const r = cp.spawnSync('node', [path.join(ROOT, 'viewer', 'tools', 'build_howto.js'), '--check'], { encoding: 'utf8' });
  (r.stdout || '').split('\n').filter(Boolean).forEach(l => log('  ' + l));
  if (r.status === 2) { log('§W-HOWTO INCONCLUSIVE live guide unreachable — nothing judged'); process.exit(2); }
  ck('H1', r.status === 0 && /check same/.test(r.stdout), 'howto.json == generator output on today\'s inputs');

  // H5 — the tie rule, on synthetic pages (no fetch). One pill 'Save Building'; the page order and the mention counts are the variables.
  { const pill = "var _actions = [\n      { id: 'save',      name: 'Save Building', children: [] }\n    ];";
    const sec = (id, head, body) => '<h2 id="' + id + '">' + head + '</h2><p>' + body + '</p>';
    const pick = html => { const o = B.build(html, pill, []); return o.pills.save.guide && o.pills.save.guide.anchor; };
    const HELP = sec('help', 'Help and the command line', 'Press F1. Save Building is in the list.'), SAVE = sec('save-open', 'Save and open a building', 'Use Save Building to keep the model.');
    const oldRule = html => { let best = null; B.sections(html).forEach(s => { let n = 0, i = 0; while ((i = s.body.indexOf('Save Building', i)) >= 0) { n++; i += 13; } const score = (s.heading.indexOf('Save Building') >= 0 ? 1e6 : 0) + n; if (score > 0 && (!best || score > best.score)) best = { anchor: s.anchor, score }; }); return best && best.anchor; };
    const a = pick(HELP + SAVE), b = pick(SAVE + HELP), d = pick(sec('x', 'Overview', 'Save Building once.') + sec('y', 'Appendix', 'Save Building once.'));
    ck('H5a tie, the sharing section is SECOND in the page -> it wins', a === 'save-open', 'picked ' + a);
    ck('H5b same page, sections swapped -> the same one wins (order does not decide)', b === 'save-open', 'picked ' + b);
    ck('H5c a section naming it twice beats a sharing section naming it once', pick(sec('twice', 'Appendix', 'Save Building. Save Building.') + SAVE) === 'twice', 'picked ' + pick(sec('twice', 'Appendix', 'Save Building. Save Building.') + SAVE));
    ck('H5d a tie with no shared word keeps the first in the page', d === 'x', 'picked ' + d);
    const o = oldRule(HELP + SAVE); ck('H5-red the OLD rule (1e6+n, first wins) picks the wrong one on H5a, so H5a can fail', o === 'help' && o !== a, 'old rule picked ' + o + ', new rule ' + a);
    { const zero = B.build(sec('only', 'Save and open a building', 'Nothing about the tool by name here.'), pill, []).pills.save; ck('H5f a section that only SHARES a word but never names the pill is not linked', zero.guide === null, 'guide=' + JSON.stringify(zero.guide)); }
    ck('H5e shared() counts words of 3+ letters in both', B.shared('Save and open a building', 'Save Building') === 2 && B.shared('Help - F1', 'Save Building') === 0, 'shared=' + B.shared('Save and open a building', 'Save Building')); }

  // population: one row per pill, judged against the LIVE guide
  const html = await (await fetch(H.guide + '?nc=' + Date.now())).text();
  const secs = new Map(B.sections(html).map(s => [s.anchor, s]));
  const rows = Object.keys(H.pills).map(id => {
    const p = H.pills[id], s = p.guide ? secs.get(p.guide.anchor) : null;
    return { id, name: p.name, anchor: p.guide ? p.guide.anchor : '', exists: !!s,
      names: !!s && (s.heading.indexOf(p.name) >= 0 || s.body.indexOf(p.name) >= 0),
      cli: p.cli.map(c => { const v = VERBS.get(c.verb); const req = v ? (v.inputs || []).filter(i => i.required).map(i => i.name) : null;
        return { verb: c.verb, citeOk: !!v && (v.description || '').indexOf(c.cite) >= 0,
          inputsOk: !!req && JSON.stringify((c.line.match(/ ([A-Za-z_]+)=/g) || []).map(x => x.trim().slice(0, -1))) === JSON.stringify(req) }; }) };
  });
  const res = Witness('HOWTO')
    .population(() => rows)
    .schema({ type: 'object', required: ['id', 'name', 'anchor', 'exists', 'names', 'cli'], properties: { id: { type: 'string' }, name: { type: 'string' }, anchor: { type: 'string' } } })
    .invariant('H2 every guide link exists on the live guide and its section names the pill', rs => rs.every(x => !x.anchor || (x.exists && x.names)))
    .invariant('H3 every CLI line: phrase in the verb\'s description, inputs == required inputs', rs => rs.every(x => x.cli.every(c => c.citeOk && c.inputsOk)))
    .redControl(rs => rs.map(x => {
      if (x.id === 'measure') return Object.assign(x, { exists: false, anchor: 'no-such-section' });                 // made-up anchor
      if (x.id === 'share') return Object.assign(x, { names: false });                                               // section does not name it
      if (x.id === 'find') return Object.assign(x, { cli: x.cli.map((c, i) => i ? c : Object.assign({}, c, { citeOk: false })) });   // phrase not there
      return x;
    }))
    .run();
  if (res.fail) fails += res.fail;
  const withGuide = rows.filter(x => x.anchor).length;
  log('§HOWTO_COV pills=' + rows.length + ' guide=' + withGuide + ' cli_pills=' + rows.filter(x => x.cli.length).length +
    ' gaps=' + H.gaps.join(',') + ' excluded=' + Object.keys(H.excluded).join(','));

  if (process.argv.includes('--no-page')) { log('§HOWTO_PAGE not judged (--no-page)'); log('§W-HOWTO ' + (fails ? 'FAIL ' + fails : 'PASS (page not judged)')); process.exit(fails ? 1 : 0); }

  // H4 — the real page
  const puppeteer = require('puppeteer');
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const VDB = path.join(ROOT, 'viewer', 'buildings', 'WitnessHowto_extracted.db');
  fs.mkdirSync(path.dirname(VDB), { recursive: true }); fs.copyFileSync(fs.realpathSync(path.join(BLD, 'Duplex_extracted.db')), VDB);
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    const seen = {};
    for (const loc of ['en_MY', 'de_DE']) {
      const pg = await br.newPage(); await pg.setViewport({ width: 1600, height: 900 });
      const lines = []; pg.on('console', m => { const t = m.text(); if (/§HOWTO_/.test(t)) lines.push(t); });
      pg.on('pageerror', e => log('§PAGEERR ' + String(e).slice(0, 200)));
      await pg.goto('http://127.0.0.1:' + srv.address().port + '/viewer/viewer.html?db=buildings/WitnessHowto_extracted.db&lang=' + loc, { waitUntil: 'load', timeout: 120000 });
      await pg.waitForFunction('window.APP && window.APP.db && window._TRL_READY && window._mainPillActions && window.showCommandPalette', { timeout: 240000 });
      await pg.evaluate(() => window.showCommandPalette());
      await pg.waitForFunction(() => document.querySelectorAll('#cmd-palette .cmd-howto-guide').length > 0, { timeout: 30000 }).catch(() => {});
      const st = await pg.evaluate(() => {
        const ids = window._mainPillActions.map(a => a.id);
        const guides = [...document.querySelectorAll('#cmd-palette .cmd-howto-guide a')].map(a => ({ href: a.getAttribute('href'), text: a.textContent.trim() }));
        return { ids, guides };
      });
      // a word that is in some pill's bullets but in no pill name and no key: chosen from the page's own data
      const word = await pg.evaluate(() => {
        const names = window._mainPillActions.map(a => String(a.name || '').toLowerCase()).join(' ');
        for (const a of window._mainPillActions) for (const c of (a.children || [])) {
          const w = String(c.name || '').toLowerCase().split(/[^a-zà-ÿ]+/).find(x => x.length >= 6 && names.indexOf(x) < 0);
          if (w) return { w, pill: a.name };
        }
        return null;
      });
      let found = null;
      if (word) {
        await pg.evaluate(w => { const i = document.getElementById('cmd-search'); i.value = w; i.dispatchEvent(new Event('input')); }, word.w);
        await new Promise(ok => setTimeout(ok, 300));
        found = await pg.evaluate(p => { const rows = [...document.querySelectorAll('#cmd-palette .cmd-row')];
          const row = rows.find(r => r.textContent.indexOf(p) >= 0); const next = row && row.nextElementSibling;
          return { rows: rows.length, hit: !!row, open: !!next && !next.classList.contains('cmd-row') && next.style.display === 'block' }; }, word.pill);
      }
      // the Find entry: its CLI lines (search by its key, then open it)
      await pg.evaluate(() => { const i = document.getElementById('cmd-search'); i.value = ''; i.dispatchEvent(new Event('input')); });
      const cli = await pg.evaluate(() => [...document.querySelectorAll('#cmd-palette .cmd-howto-cli')].map(c => { const out = []; let n = c.nextElementSibling;
        while (n && n.querySelector && n.querySelector('code')) { out.push(n.textContent.trim()); n = n.nextElementSibling; } return { label: c.textContent, lines: out }; }));
      const bullet = await pg.evaluate(() => { const a = window._mainPillActions.find(x => x.children && x.children.length); return a ? a.id + ': ' + String(a.children[0].name) : ''; });   // the first pill that has bullets
      lines.forEach(l => log('  ' + l));
      seen[loc] = { st, word, found, cli, bullet };
      await pg.close();
    }
    const en = seen.en_MY, de = seen.de_DE, fileIds = Object.keys(H.pills);
    const pageIds = en.st.ids, wantGuide = pageIds.filter(id => H.pills[id] && H.pills[id].guide).length;
    ck('H4a', JSON.stringify(pageIds) === JSON.stringify(fileIds), 'page pill list == file pill list (' + pageIds.length + ' vs ' + fileIds.length + ')');
    ck('H4b', en.st.guides.length === wantGuide && en.st.guides.every(g => g.href.indexOf(H.guide + '#') === 0 && g.text === 'Guide'),
      'guide links shown ' + en.st.guides.length + '/' + pageIds.length + ' (file says ' + wantGuide + '), every href into the live guide');
    ck('H4c', !!(en.word && en.found && en.found.hit && en.found.open), 'bullet-only word "' + (en.word && en.word.w) + '" finds "' + (en.word && en.word.pill) + '", shown opened: ' + JSON.stringify(en.found));
    const findCli = en.cli.find(c => c.lines.length === 3);
    ck('H4d', !!findCli && H.pills.find.cli.every(c => findCli.lines.indexOf(c.line) >= 0), 'Find shows its 3 CLI lines: ' + JSON.stringify(findCli));
    ck('H4e', de.st.guides.length === wantGuide && de.st.guides.every(g => g.text === 'Handbuch (Englisch)') && de.bullet && de.bullet !== en.bullet &&
      de.cli.every(c => c.label === 'Dasselbe in der CLI'), 'de_DE: label "' + (de.st.guides[0] || {}).text + '", bullet "' + de.bullet + '" vs en "' + en.bullet + '"');
  } finally { await br.close(); srv.close(); try { fs.unlinkSync(VDB); } catch (e) {} }
  log('§W-HOWTO ' + (fails ? 'FAIL ' + fails : 'PASS'));
  process.exit(fails ? 1 : 0);
})().catch(e => { log('§FAIL W-HOWTO ' + (e && e.stack || e)); try { fs.unlinkSync(path.join(ROOT, 'viewer', 'buildings', 'WitnessHowto_extracted.db')); } catch (x) {} process.exit(1); });
