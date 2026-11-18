#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-TRL-TERMS (bim-compiler prompts/TRL_TRILOGY_STANDARD.md §3 S-2, step T2). READ THE LOG after every run: viewer/tests/logs/w_trl_terms*.log
// ISSUE IT PROVES OR DISPROVES: "IFC class names and definitions are AD_Message rows, so a term cannot be shared or reviewed as a term" — they now live in their own table
// (BIM_Element), and moving them changed NOTHING the page shows.
//   T2a  every moved key is in BIM_Element and NOT in AD_Message: X of N, N = the batches' OWN key lists (trl_batch_2026-11-17_ifccls / _ifcdef / _ifcdef_types, read here);
//        the csv, and every one of the 17 non-base xml pairs. Keys the batches wrote that are NOT terms (ui_cls_*) and the roadstd rows stay in AD_Message ("left, unclear").
//   T2b  the built page text is byte-equal before and after, for every locale: the labels of the shipped i18n/<locale>.json at BEFORE_REF (the main commit before T2) against
//        today's, serialised the way the build writes them (key order included); built.rows / translated / untranslated equal too.
//   T2c  a term looked up THROUGH THE PAGE (headless chromium --disable-gpu, real viewer.html, the loader's own _trl) gives the text it gave before, for each locale.
//   RED  R1 a key left in BOTH tables -> T2a FAILs (and build_trl.js refuses);  R2 a moved key dropped (csv + xml, build clean) -> T2b FAILs.
// INCONCLUSIVE, never PASS, when nothing was judged (no BEFORE_REF, no browser). Run: node viewer/tests/witness_trl_terms.js [--no-page]   Env: BEFORE_REF (default 41b6b676), PW.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), http = require('http');
const ROOT = path.resolve(__dirname, '..', '..'), VIEWER = path.join(ROOT, 'viewer');
const T = require('../tools/trl_common');
const BEFORE_REF = process.env.BEFORE_REF || '41b6b676';
const PW = process.env.PW || path.join(os.homedir(), 'bim-ootb', 'tests', 'node_modules', 'playwright');
fs.mkdirSync(path.join(__dirname, 'logs'), { recursive: true });
const LOGF = path.join(__dirname, 'logs', 'w_trl_terms.log'); fs.writeFileSync(LOGF, '');
const out = (m) => { console.log(m); fs.appendFileSync(LOGF, m + '\n'); };
let pass = 0, fail = 0, inc = 0;
const chk = (name, ok, info) => { ok ? pass++ : fail++; out('  ' + (ok ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + info : '')); return ok; };
const incon = (id, why) => { inc++; out('§TRL_TERMS INCONCLUSIVE ' + id + ' — ' + why); };
const L = (m) => out('§TRL_TERMS ' + m);
const NONBASE = T.LOCALES.filter(l => l !== T.BASE);

// ── N: the batches' own key lists (NOT trl_common.isTermKey: the rule under test must not judge itself) ──
function batchKeys() {
  const dir = path.join(VIEWER, 'tools'), bf = (n) => path.join(dir, 'trl_batch_2026-11-17_' + n + '.js');
  const cls = require(bf('ifccls')), def = require(bf('ifcdef')), typ = require(bf('ifcdef_types'));
  const terms = new Set(Object.keys(cls.CLS).map(c => 'ifccls_' + c));                       // the ifccls batch's class table: one sentence per IFC class
  [def, typ].forEach(b => Object.keys(b.NEW).filter(k => k.startsWith('ifcdef_')).forEach(k => terms.add(k)));   // every ifcdef_ key of the two definition batches
  const nonTerm = new Set(); [cls, def, typ].forEach(b => Object.keys(b.NEW).forEach(k => { if (!terms.has(k)) nonTerm.add(k); }));   // the panel words (ui_cls_*): messages
  const road = (fs.readFileSync(bf('roadstd_fill'), 'utf8').match(/const KEYS = \[([^\]]*)\]/) || [, ''])[1].match(/'([^']+)'/g) || [];
  return { terms: Array.from(terms), nonTerm: Array.from(nonTerm), road: road.map(s => s.slice(1, -1)) };
}
// T2a over a set of files: dir = a viewer/i18n directory (the shipped one, or a red-control copy)
function judgeA(dir, K) {
  const ad = T.parseCsv(fs.readFileSync(path.join(dir, 'ad_message_base.csv'), 'utf8')), el = T.parseElementCsv(fs.readFileSync(path.join(dir, 'bim_element_base.csv'), 'utf8'));
  const adV = new Map(ad.map(r => [r.value, r.id])), elV = new Map(el.map(r => [r.value, r.id]));
  const bad = { missingInElement: [], stillInAD: [], xmlMissing: 0, xmlStillInAD: 0 };
  K.terms.forEach(k => { if (!elV.has(k)) bad.missingInElement.push(k); if (adV.has(k)) bad.stillInAD.push(k); });
  const adIds = new Set(K.terms.map(k => adV.get(k)).filter(Boolean)), elIds = K.terms.map(k => elV.get(k)).filter(Boolean);
  NONBASE.forEach(lang => {
    const xe = new Set(T.parseTrlXml(fs.readFileSync(path.join(dir, 'machine', 'BIM_Element_Trl_' + lang + '.xml'), 'utf8')).rows.map(r => r.id));
    const xa = T.parseTrlXml(fs.readFileSync(path.join(dir, 'machine', 'AD_Message_Trl_' + lang + '.xml'), 'utf8')).rows;
    const xaIdVal = new Map(ad.map(r => [r.id, r.value])), termSet = new Set(K.terms);
    bad.xmlMissing += elIds.filter(id => !xe.has(id)).length;
    bad.xmlStillInAD += xa.filter(r => termSet.has(xaIdVal.get(r.id)) || adIds.has(r.id)).length;
  });
  const both = ad.filter(r => elV.has(r.value)).map(r => r.value);
  const x = K.terms.length - new Set([].concat(bad.missingInElement, bad.stillInAD)).size;
  return { ok: x === K.terms.length && !bad.xmlMissing && !bad.xmlStillInAD && !both.length, x, n: K.terms.length, bad, both };
}
const ser = (o) => JSON.stringify(o, null, 1) + '\n';
function beforeJson(lang) { const r = cp.spawnSync('git', ['show', BEFORE_REF + ':viewer/i18n/' + lang + '.json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }); return r.status === 0 ? JSON.parse(r.stdout) : null; }
// T2b over a directory of built <locale>.json
function judgeB(dir, before) {
  const rows = [];
  NONBASE.concat([T.BASE]).forEach(lang => {
    const b = before[lang], a = JSON.parse(fs.readFileSync(path.join(dir, lang + '.json'), 'utf8'));
    const keys = Object.keys(b.labels), sub = {}; keys.forEach(k => { if (k in a.labels) sub[k] = a.labels[k]; });
    const missing = keys.filter(k => !(k in a.labels)), changed = keys.filter(k => k in a.labels && a.labels[k] !== b.labels[k]);
    const added = Object.keys(a.labels).length - keys.length, eqText = ser(sub) === ser(b.labels);
    // built counts equal as they were; keys added to the dictionary since BEFORE_REF (other lanes) only grow rows, and translated + untranslated must still sum to rows
    const eqCounts = added === 0 ? (a.built.rows === b.built.rows && a.built.translated === b.built.translated && a.built.untranslated === b.built.untranslated) : (a.built.rows === b.built.rows + added && (lang === T.BASE || a.built.translated + a.built.untranslated === a.built.rows) && a.built.translated >= b.built.translated);
    rows.push({ lang, ok: eqText && eqCounts && !missing.length && !changed.length, keys: keys.length, added: Object.keys(a.labels).length - keys.length, missing, changed, eqCounts });
  });
  return rows;
}
function copyTree() {   // a red-control copy: the tools + the i18n dir, so a tool's own relative paths hold
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'trl_terms_red_')); fs.mkdirSync(path.join(d, 'viewer'));
  cp.execSync('cp -r ' + JSON.stringify(path.join(VIEWER, 'tools')) + ' ' + JSON.stringify(path.join(VIEWER, 'i18n')) + ' ' + JSON.stringify(path.join(d, 'viewer')));
  return d;
}

(async () => {
  L('begin before_ref=' + BEFORE_REF + ' repo=' + ROOT);
  const K = batchKeys();
  L('N: batches own key lists — terms=' + K.terms.length + ' (ifccls ' + K.terms.filter(k => k.startsWith('ifccls_')).length + ', ifcdef ' + K.terms.filter(k => k.startsWith('ifcdef_')).length + '), left in AD_Message (panel words)=' + K.nonTerm.length + ' [' + K.nonTerm.join(',') + '], roadstd=' + K.road.length + ' [' + K.road.join(',') + ']');
  if (!K.terms.length) { incon('N', 'the batches gave no term keys'); return end(); }

  // ── T2a ──
  const dirI18n = T.I18N, A = judgeA(dirI18n, K);
  chk('T2a ' + A.x + ' of ' + A.n + ' moved keys are in BIM_Element and NOT in AD_Message (csv); xml: element rows missing=' + A.bad.xmlMissing + ', term rows still in AD xml=' + A.bad.xmlStillInAD + ' (x ' + NONBASE.length + ' locales); keys in both tables=' + A.both.length, A.ok,
    A.ok ? '' : 'missingInElement=' + A.bad.missingInElement.slice(0, 3) + ' stillInAD=' + A.bad.stillInAD.slice(0, 3) + ' both=' + A.both.slice(0, 3));
  { const ad = new Set(T.readBase().map(r => r.value)), el = new Set(T.readTerms().map(r => r.value)), left = K.nonTerm.concat(K.road);
    const okL = left.length > 0 && left.every(k => ad.has(k) && !el.has(k));
    chk('T2a-left the ' + left.length + ' non-term keys of those batches (ui_cls_*, roadstd) are still in AD_Message and not in BIM_Element', okL); }
  { const g = cp.spawnSync('node', [path.join(VIEWER, 'tools', 'build_trl.js'), '--check'], { encoding: 'utf8' });
    chk('T2a-build shipped i18n/<locale>.json == both tables built (build_trl.js --check)', g.status === 0, (g.stdout.trim().split('\n').pop() || g.stderr.slice(0, 160))); }

  // ── T2b ──
  const before = {}; let haveBefore = true;
  T.LOCALES.forEach(l => { before[l] = beforeJson(l); if (!before[l]) haveBefore = false; });
  if (!haveBefore) incon('T2b', 'git show ' + BEFORE_REF + ':viewer/i18n/<locale>.json failed (commit not in this clone?)');
  else {
    const rows = judgeB(dirI18n, before), bad = rows.filter(r => !r.ok), tot = rows.reduce((s, r) => s + r.keys, 0);
    rows.forEach(r => L('T2b lang=' + r.lang + ' before_keys=' + r.keys + ' equal=' + r.ok + ' added_since=' + r.added + (r.ok ? '' : ' missing=' + r.missing.slice(0, 3) + ' changed=' + r.changed.slice(0, 3))));
    chk('T2b built page text byte-equal before/after in ' + (rows.length - bad.length) + ' of ' + rows.length + ' locales (' + tot + ' labels, key order + built counts included)', bad.length === 0 && rows.length === T.LOCALES.length);

    // ── RED R1: a key left in BOTH tables ──
    const d1 = copyTree(), i1 = path.join(d1, 'viewer', 'i18n'), k1 = K.terms[0];
    { const adRows = T.parseCsv(fs.readFileSync(path.join(i1, 'ad_message_base.csv'), 'utf8')), el = T.readTerms().find(r => r.value === k1);
      adRows.push({ id: el.id, value: k1, msgtext: el.msgtext, msgtype: 'I' }); adRows.sort((a, b) => a.id - b.id); fs.writeFileSync(path.join(i1, 'ad_message_base.csv'), T.writeCsv(adRows));
      NONBASE.forEach(lang => { const f = path.join(i1, 'machine', 'AD_Message_Trl_' + lang + '.xml'), x = T.parseTrlXml(fs.readFileSync(f, 'utf8')), e = T.parseTrlXml(fs.readFileSync(path.join(i1, 'machine', 'BIM_Element_Trl_' + lang + '.xml'), 'utf8')).rows.find(r => r.id === el.id);
        const rs = x.rows.map(r => ({ id: r.id, trl: r.trl, original: r.original, text: r.text })).concat([{ id: e.id, trl: e.trl, original: e.original, text: e.text }]).sort((a, b) => a.id - b.id);
        fs.writeFileSync(f, T.writeTrlXml(lang, 'red control', rs)); }); }
    const r1 = judgeA(i1, K), g1 = cp.spawnSync('node', [path.join(d1, 'viewer', 'tools', 'build_trl.js'), '--check'], { encoding: 'utf8' });
    L('RED R1 key ' + k1 + ' left in both tables: T2a judged ' + r1.x + ' of ' + r1.n + ' ok=' + r1.ok + ' (stillInAD=' + r1.bad.stillInAD.length + ', both=' + r1.both.length + ', term rows in AD xml=' + r1.bad.xmlStillInAD + '); build_trl.js exit=' + g1.status + ' ' + ((g1.stderr.match(/Error: [^\n]*BOTH[^\n]*/) || [''])[0]).slice(0, 120));
    chk('RED R1 a key left in both tables FAILs T2a (witness can fail) and the build refuses it', !r1.ok && r1.both.length === 1 && g1.status !== 0 && /BOTH/.test(g1.stderr));

    // ── RED R2: a moved key dropped (csv + xml, so the build is clean) ──
    const d2 = copyTree(), i2 = path.join(d2, 'viewer', 'i18n'), k2 = K.terms[1];
    { const el = T.parseElementCsv(fs.readFileSync(path.join(i2, 'bim_element_base.csv'), 'utf8')), gone = el.find(r => r.value === k2);
      fs.writeFileSync(path.join(i2, 'bim_element_base.csv'), T.writeElementCsv(el.filter(r => r.id !== gone.id)));
      NONBASE.forEach(lang => { const f = path.join(i2, 'machine', 'BIM_Element_Trl_' + lang + '.xml'), x = T.parseTrlXml(fs.readFileSync(f, 'utf8'));
        fs.writeFileSync(f, T.writeTrlXml(lang, 'red control', x.rows.filter(r => r.id !== gone.id).map(r => ({ id: r.id, trl: r.trl, original: r.original, text: r.text })), 'BIM_Element')); }); }
    const g2 = cp.spawnSync('node', [path.join(d2, 'viewer', 'tools', 'build_trl.js')], { encoding: 'utf8' });
    const r2 = g2.status === 0 ? judgeB(i2, before) : null, bad2 = r2 ? r2.filter(r => !r.ok) : [];
    L('RED R2 key ' + k2 + ' dropped: build exit=' + g2.status + ' locales failing T2b=' + bad2.length + '/' + (r2 ? r2.length : '-') + (bad2[0] ? ' e.g. ' + bad2[0].lang + ' missing=' + bad2[0].missing.join(',') : ''));
    chk('RED R2 a moved key dropped FAILs T2b in every locale (witness can fail)', !!r2 && bad2.length === r2.length && bad2.every(r => r.missing.indexOf(k2) >= 0));
    [d1, d2].forEach(d => fs.rmSync(d, { recursive: true, force: true }));

    // ── T2c: through the page ──
    if (process.argv.includes('--no-page')) incon('T2c', '--no-page given');
    else {
      let browser, srv;
      try {
        const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.db': 'application/octet-stream' };
        srv = http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(b); }); });
        await new Promise(r => srv.listen(0, r));
        const { chromium } = require(PW); browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
        const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } }), pg = await ctx.newPage(), logs = [];
        pg.on('console', m => logs.push(m.text())); pg.on('pageerror', e => logs.push('PAGEERR ' + e.message));
        await pg.goto('http://localhost:' + srv.address().port + '/viewer/viewer.html?blank=1&ghost=1', { waitUntil: 'load', timeout: 90000 });
        const ready = await pg.waitForFunction(() => window._TRL_READY === true && window._TRL_LOADER, null, { timeout: 60000 }).then(() => true).catch(() => false);
        if (!ready) incon('T2c', 'viewer.html did not reach trl-ready');
        else {
          let ok = 0, n = 0; const bad = [], perLang = [];
          for (const lang of T.LOCALES) {
            const sw = await pg.evaluate((c) => window._TRL_LOADER.setLocale(c).then(r => (r && r.to) || null), lang);
            const got = await pg.evaluate((keys) => keys.map(k => window._trl(k, null, '\u0000MISSING')), K.terms);
            let o = 0; K.terms.forEach((k, i) => { n++; if (got[i] === before[lang].labels[k]) { o++; ok++; } else if (bad.length < 4) bad.push(lang + ':' + k + ' got=' + JSON.stringify(String(got[i]).slice(0, 40))); });
            perLang.push(lang + '=' + o + '/' + K.terms.length + (sw === lang ? '' : '(switch ' + sw + ')'));
          }
          L('T2c ' + perLang.join(' '));
          chk('T2c a term looked up through the page (_trl) gives the same text as before: ' + ok + ' of ' + n + ' (' + K.terms.length + ' terms x ' + T.LOCALES.length + ' locales)', n > 0 && ok === n, bad.join(' | '));
        }
      } catch (e) { fail++; out('FAIL T2c harness exception ' + (e && e.stack || e)); }
      if (browser) await browser.close(); if (srv) srv.close();
    }
  }
  end();
})();
function end() {
  const verdict = fail ? 'FAIL' : (inc || !pass ? 'INCONCLUSIVE' : 'PASS');
  out('§WITNESS_TRL_TERMS pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + ' verdict=' + verdict);
  process.exitCode = verdict === 'PASS' ? 0 : 1;
}
