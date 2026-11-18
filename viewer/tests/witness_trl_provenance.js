#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-TRL-PROVENANCE (bim-compiler prompts/TRL_TRILOGY_STANDARD.md §3 S-3/S-4, step T4). READ THE LOG after every run: viewer/tests/logs/w_trl_provenance.log
// ISSUE IT PROVES OR DISPROVES: "a hand-checked translation cannot beat an AI row, and nothing says who wrote a row" — the source FOLDER now says it: viewer/i18n/machine/ (AI-written,
// lowest priority, every row the Viewer has) and viewer/i18n/own/ (hand-checked, higher priority, may be empty). build_trl.js reads own then machine; a lower row under a winner stays on
// disk and is counted `shadowed`.
//   P1  own/ empty -> the 18 built packs are byte-equal to BEFORE_REF (the main commit before T4), whole files, and the 34 xml moved byte-identical into machine/.
//   P2  an own/ row for ONE key in ONE locale shadows its machine row: shadowed=1 in that table+locale (nothing else), the machine row is still on disk byte-identical, and the page
//       (real viewer.html, headless chromium --disable-gpu, de_DE) shows the OWN text where it showed the machine text.
//   P3  the §TRL_BUILD_SRC counts add up: kept + shadowed + untranslated = the base rows, for every table and locale (real tree and the own/ fixtures); a stale row (original != today's
//       English) is counted and never used.
//   RED priority reversed (a copy of the tools with SOURCES = machine, own) FAILs P2: the page keeps the machine text.
// INCONCLUSIVE, never PASS, when nothing was judged. Run: node viewer/tests/witness_trl_provenance.js [--no-page]   Env: BEFORE_REF (default 16b7ef1d), PW.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), http = require('http'), crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..', '..'), VIEWER = path.join(ROOT, 'viewer'), T = require('../tools/trl_common');
const BEFORE_REF = process.env.BEFORE_REF || '16b7ef1d';
const PW = process.env.PW || path.join(os.homedir(), 'bim-ootb', 'tests', 'node_modules', 'playwright');
fs.mkdirSync(path.join(__dirname, 'logs'), { recursive: true });
const LOGF = path.join(__dirname, 'logs', 'w_trl_provenance.log'); fs.writeFileSync(LOGF, '');
const out = (m) => { console.log(m); fs.appendFileSync(LOGF, m + '\n'); };
let pass = 0, fail = 0, inc = 0;
const chk = (name, ok, info) => { ok ? pass++ : fail++; out('  ' + (ok ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + info : '')); return ok; };
const incon = (id, why) => { inc++; out('§TRL_PROV INCONCLUSIVE ' + id + ' — ' + why); };
const L = (m) => out('§TRL_PROV ' + m);
const NONBASE = T.LOCALES.filter(l => l !== T.BASE), sha = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
const git = (a) => cp.spawnSync('git', a, { cwd: ROOT, encoding: 'buffer', maxBuffer: 1 << 27 });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.db': 'application/octet-stream' };

function copyTree(reverse) {   // a fixture: the tools + the i18n dir (so a tool's own relative paths hold); reverse = SOURCES in the wrong priority order
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'trl_prov_')); fs.mkdirSync(path.join(d, 'viewer'));
  cp.execSync('cp -r ' + JSON.stringify(path.join(VIEWER, 'tools')) + ' ' + JSON.stringify(path.join(VIEWER, 'i18n')) + ' ' + JSON.stringify(path.join(d, 'viewer')));
  if (reverse) { const f = path.join(d, 'viewer', 'tools', 'trl_common.js'), s = fs.readFileSync(f, 'utf8'), r = s.replace("const SOURCES = ['own', 'machine'];", "const SOURCES = ['machine', 'own'];"); if (r === s) throw new Error('SOURCES line not found'); fs.writeFileSync(f, r); }
  return d;
}
function build(d) { const r = cp.spawnSync('node', [path.join(d, 'viewer', 'tools', 'build_trl.js')], { encoding: 'utf8' }); return { status: r.status, lines: r.stdout.split('\n').filter(l => l.startsWith('§TRL_BUILD_SRC')), err: r.stderr }; }
const srcLine = (lines, lang, table) => { const l = lines.find(x => x.indexOf(' lang=' + lang + ' table=' + table + ' ') > 0) || ''; const g = (k) => { const m = l.match(new RegExp(' ' + k + '=(\\d+)')); return m ? Number(m[1]) : null; }; return { l, base: g('base'), kept: g('kept'), shadowed: g('shadowed'), stale: g('stale'), untr: g('untranslated'), own: (l.match(/own=(\d+)/) || [])[1] * 1 }; };
function writeOwn(d, lang, table, rows) { const dir = path.join(d, 'viewer', 'i18n', 'own'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, (table === 'BIM_Element' ? 'BIM_Element_Trl_' : 'AD_Message_Trl_') + lang + '.xml'), T.writeTrlXml(lang, 'W-TRL-PROVENANCE fixture - hand-checked rows', rows, table)); }

(async () => {
  L('begin before_ref=' + BEFORE_REF + ' repo=' + ROOT);
  const base = T.readBase(), terms = T.readTerms();
  // ── P1 ──
  const ownXml = fs.existsSync(T.dirOf('own')) ? fs.readdirSync(T.dirOf('own')).filter(f => /\.xml$/.test(f)) : [];
  const stray = fs.readdirSync(T.I18N).filter(f => /_Trl_.*\.xml$/.test(f)), mach = fs.readdirSync(T.dirOf('machine')).filter(f => /_Trl_.*\.xml$/.test(f));
  L('P1 sources: own/ xml files=' + ownXml.length + ', machine/ xml files=' + mach.length + ', xml left in i18n/=' + stray.length);
  const probe = git(['cat-file', '-t', BEFORE_REF]);
  if (probe.status !== 0) { incon('P1', BEFORE_REF + ' not in this clone'); return end(); }
  const rows = [], badPk = [], badXml = [];
  T.LOCALES.forEach(l => { const b = git(['show', BEFORE_REF + ':viewer/i18n/' + l + '.json']), f = path.join(T.I18N, l + '.json'); const eq = b.status === 0 && Buffer.compare(b.stdout, fs.readFileSync(f)) === 0; rows.push(l + '=' + (eq ? 'equal' : 'DIFF')); if (!eq) badPk.push(l); });
  NONBASE.forEach(l => ['AD_Message_Trl_', 'BIM_Element_Trl_'].forEach(p => { const b = git(['show', BEFORE_REF + ':viewer/i18n/' + p + l + '.xml']), f = path.join(T.dirOf('machine'), p + l + '.xml'); if (!(b.status === 0 && fs.existsSync(f) && Buffer.compare(b.stdout, fs.readFileSync(f)) === 0)) badXml.push(p + l); }));
  L('P1 ' + rows.join(' '));
  chk('P1 own/ is empty and the ' + T.LOCALES.length + ' built packs are byte-equal to ' + BEFORE_REF + ' in ' + (T.LOCALES.length - badPk.length) + ' of ' + T.LOCALES.length + ' (whole files); the ' + (NONBASE.length * 2) + ' xml moved byte-identical into machine/ (' + (NONBASE.length * 2 - badXml.length) + ' of ' + NONBASE.length * 2 + ')',
    ownXml.length === 0 && badPk.length === 0 && badXml.length === 0 && stray.length === 0 && mach.length === NONBASE.length * 2, badPk.concat(badXml).slice(0, 4).join(',') + (ownXml.length ? ' own=' + ownXml : ''));

  // ── P3 on the real tree ──
  const real = cp.spawnSync('node', [path.join(VIEWER, 'tools', 'build_trl.js'), '--check'], { encoding: 'utf8' }), rl = real.stdout.split('\n').filter(l => l.startsWith('§TRL_BUILD_SRC'));
  let okSum = 0, nSum = 0, stale0 = 0; const badSum = [];
  NONBASE.forEach(l => [['AD_Message', base.length], ['BIM_Element', terms.length]].forEach(([t, n]) => { const r = srcLine(rl, l, t); nSum++; stale0 += r.stale || 0;
    if (r.base === n && r.kept + r.shadowed + r.untr === n) okSum++; else badSum.push(l + ':' + t + ' ' + r.l.slice(0, 120)); }));
  L('P3 real tree: ' + rl.length + ' §TRL_BUILD_SRC lines; stale rows total=' + stale0 + '; build_trl --check exit=' + real.status);
  chk('P3 kept + shadowed + untranslated = base rows for every table and locale: ' + okSum + ' of ' + nSum + ' (real tree, base AD_Message=' + base.length + ' BIM_Element=' + terms.length + ')', nSum > 0 && okSum === nSum && real.status === 0, badSum.slice(0, 2).join(' | '));

  // ── P2 fixture: ONE own row, de_DE, AD_Message, key ui_buildings (a data-trl key of viewer.html) ──
  const KEY = 'ui_buildings', LANG = 'de_DE', OWN = 'OWN-ROW Gebaeude (hand-checked)';
  const brow = base.find(r => r.value === KEY); if (!brow) { incon('P2', KEY + ' not in the base'); return end(); }
  const machineDe = pack(LANG).labels[KEY];
  const mk = (reverse) => { const d = copyTree(reverse); writeOwn(d, LANG, 'AD_Message', [{ id: brow.id, trl: 'Y', original: brow.msgtext, text: OWN }]); return d; };
  const dGood = mk(false), mf = path.join(dGood, 'viewer', 'i18n', 'machine', 'AD_Message_Trl_' + LANG + '.xml'), h0 = sha(mf), bg = build(dGood), lg = pack(LANG, dGood);
  const sDe = srcLine(bg.lines, LANG, 'AD_Message'), sEl = srcLine(bg.lines, LANG, 'BIM_Element'), sFr = srcLine(bg.lines, 'fr_FR', 'AD_Message');
  const allShadow = bg.lines.map(l => (l.match(/ lang=(\w+) table=(\w+) .* shadowed=(\d+)/) || [])).filter(m => m[3] !== '0').map(m => m[1] + ':' + m[2] + '=' + m[3]);
  L('P2 fixture own/AD_Message_Trl_de_DE.xml: 1 row (' + KEY + ', id ' + brow.id + '); build: ' + sDe.l.replace('§TRL_BUILD_SRC ', '') + '; non-zero shadowed anywhere: [' + allShadow.join(',') + ']');
  const okCount = bg.status === 0 && sDe.shadowed === 1 && sDe.own === 1 && sDe.kept + sDe.shadowed + sDe.untr === sDe.base && allShadow.length === 1 && allShadow[0] === LANG + ':AD_Message=1' && sEl.shadowed === 0 && sFr.shadowed === 0;
  const okDisk = sha(mf) === h0 && fs.readFileSync(mf, 'utf8').indexOf('original="' + brow.msgtext.replace(/&/g, '&amp;') + '"') > 0;
  const okLabel = lg.labels[KEY] === OWN && lg.labels[KEY] !== machineDe && Object.keys(lg.labels).every(k => k === KEY || lg.labels[k] === pack(LANG).labels[k]);
  chk('P2 the own row shadows its machine row: shadowed=1 (only de_DE AD_Message), own wins in the built pack, every other label unchanged; the machine row is still on disk, byte-identical', okCount && okDisk && okLabel, 'count=' + okCount + ' disk=' + okDisk + ' label=' + okLabel);
  // stale own row (S-4): original != today's English -> counted, never used
  { const d = copyTree(false); writeOwn(d, LANG, 'AD_Message', [{ id: brow.id, trl: 'Y', original: brow.msgtext + ' (old English)', text: OWN }]); const b = build(d), s = srcLine(b.lines, LANG, 'AD_Message'), lab = pack(LANG, d).labels[KEY];
    chk('P3 a stale own row (original != today\'s English) is counted (stale=1), shadows nothing and is never used', s.stale === 1 && s.shadowed === 0 && s.own === 0 && lab === machineDe && s.kept + s.shadowed + s.untr === s.base, s.l.replace('§TRL_BUILD_SRC ', ''));
    fs.rmSync(d, { recursive: true, force: true }); }
  const tl = terms[0]; { const d = copyTree(false); writeOwn(d, 'ja_JP', 'BIM_Element', [{ id: tl.id, trl: 'Y', original: tl.msgtext, text: 'OWN term text' }]); const b = build(d), s = srcLine(b.lines, 'ja_JP', 'BIM_Element');
    chk('P3 an own row in the BIM_Element table: shadowed=1 there, sums hold (' + s.kept + '+' + s.shadowed + '+' + s.untr + '=' + s.base + ')', s.shadowed === 1 && s.kept + s.shadowed + s.untr === s.base && pack('ja_JP', d).labels[tl.value] === 'OWN term text'); fs.rmSync(d, { recursive: true, force: true }); }

  // ── RED: priority reversed ──
  const dRed = mk(true), br = build(dRed), lr = pack(LANG, dRed), sr = srcLine(br.lines, LANG, 'AD_Message');
  const redOk = br.status === 0 && lr.labels[KEY] === OWN;
  L('RED priority reversed (SOURCES = machine, own): ' + sr.l.replace('§TRL_BUILD_SRC ', '') + '; built label=' + JSON.stringify(String(lr.labels[KEY]).slice(0, 30)));
  chk('RED priority reversed FAILs P2: the own row loses (built label is the machine text), although shadowed=' + sr.shadowed + ' still counts one row', !redOk && lr.labels[KEY] === machineDe);

  // ── P2 through the page ──
  if (process.argv.includes('--no-page')) incon('P2-page', '--no-page given');
  else {
    let browser, srv;
    try {
      srv = http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(b); }); });
      await new Promise(r => srv.listen(0, r)); const base0 = 'http://localhost:' + srv.address().port;
      const { chromium } = require(PW); browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
      async function shown(fixture) {   // the text the real Viewer shows for KEY in de_DE; fixture = a built de_DE.json served in place of the shipped one (null = as shipped)
        const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } }), pg = await ctx.newPage();
        if (fixture) await pg.route('**/viewer/i18n/' + LANG + '.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(path.join(fixture, 'viewer', 'i18n', LANG + '.json')) }));
        await pg.addInitScript((l) => { localStorage.setItem('bim.lang', l); }, LANG);
        await pg.goto(base0 + '/viewer/viewer.html?blank=1&ghost=1', { waitUntil: 'load', timeout: 90000 });
        const ok = await pg.waitForFunction(() => window._TRL_READY === true, null, { timeout: 60000 }).then(() => true).catch(() => false);
        const r = ok ? await pg.evaluate((k) => ({ dom: (document.querySelector('[data-trl="' + k + '"]') || {}).textContent, trl: window._trl(k), lang: document.documentElement.lang }), KEY) : null;
        await ctx.close(); return r;
      }
      const r0 = await shown(null), r1 = await shown(dGood), r2 = await shown(dRed);
      if (!r0 || !r1 || !r2) incon('P2-page', 'viewer.html did not reach trl-ready');
      else {
        L('P2 page de_DE [data-trl="' + KEY + '"]: shipped=' + JSON.stringify(r0.dom) + ' own-fixture=' + JSON.stringify(r1.dom) + ' reversed=' + JSON.stringify(r2.dom));
        chk('P2 the page shows the OWN row (' + JSON.stringify(r1.dom) + ') where it showed the machine row (' + JSON.stringify(r0.dom) + '), through _trl too', r0.dom === machineDe && r1.dom === OWN && r1.trl === OWN && r1.lang === 'de');
        chk('RED the page of the priority-reversed build still shows the machine row (' + JSON.stringify(r2.dom) + '): P2 FAILs, as it must', r2.dom === machineDe && r2.dom !== OWN);
      }
    } catch (e) { fail++; out('FAIL P2-page harness exception ' + (e && e.stack || e)); }
    if (browser) await browser.close(); if (srv) srv.close();
  }
  [dGood, dRed].forEach(d => fs.rmSync(d, { recursive: true, force: true }));
  end();
})();
function pack(lang, dir) { return JSON.parse(fs.readFileSync(path.join(dir ? path.join(dir, 'viewer', 'i18n') : T.I18N, lang + '.json'), 'utf8')); }
function end() {
  const verdict = fail ? 'FAIL' : (inc || !pass ? 'INCONCLUSIVE' : 'PASS');
  out('§WITNESS_TRL_PROVENANCE pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + ' verdict=' + verdict);
  process.exitCode = verdict === 'PASS' ? 0 : 1;
}
