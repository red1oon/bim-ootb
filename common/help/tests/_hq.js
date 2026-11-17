// ⚠ DO NOT REMOVE — shared bits of the W-HQ-* witnesses (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.2 Step 2; design prompts/HELP_QUERY_CORE_DESIGN.md §5). READ THE LOG after every run.
// kit(tag): counts, prints the § lines, writes the witness's OWN log under common/help/tests/logs/ (the log name carries the HQ_BREAK value of a red run), ends with a verdict line
// that is INCONCLUSIVE, never PASS, when nothing was judged. The rest: the packs, the query list, the headless page (software GL, no GPU).
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..', '..'), CORE = path.join(ROOT, 'common', 'help', 'help_query.js'), ERP = path.join(ROOT, 'erp');
const SEED = path.join(ERP, 'ad_seed.db');
const PW = process.env.PW || path.join(os.homedir(), 'bim-ootb', 'tests', 'node_modules', 'playwright');
const LANGS = ['en_US', 'fr_FR', 'de_DE', 'ja_JP', 'zh_CN'];
function kit(tag) {
  const k = { pass: 0, fail: 0, inc: 0 }, br = process.env.HQ_BREAK || '';
  fs.mkdirSync(path.join(__dirname, 'logs'), { recursive: true });
  const logf = path.join(__dirname, 'logs', tag.toLowerCase().replace(/^w-/, 'w_').replace(/-/g, '_') + (br ? '_break_' + br : '') + '.log'); fs.writeFileSync(logf, '');
  const out = (m) => { console.log(m); fs.appendFileSync(logf, m + '\n'); };
  k.out = out; k.log = logf;
  k.L = (m) => out('§' + tag.replace(/^W-/, '') + ' ' + m);
  k.chk = (name, ok, info) => { if (ok) k.pass++; else k.fail++; out('  ' + (ok ? 'PASS' : 'FAIL') + ' ' + name + (info ? '  ' + info : '')); };
  k.incon = (id, why) => { k.inc++; k.L('INCONCLUSIVE ' + id + ' — ' + why); };
  k.end = () => { const v = k.fail ? 'FAIL' : (k.inc || !k.pass ? 'INCONCLUSIVE' : 'PASS'); out('§WITNESS_' + tag.replace(/^W-/, '').replace(/-/g, '_') + ' pass=' + k.pass + ' fail=' + k.fail + ' inconclusive=' + k.inc + ' verdict=' + v + (br ? ' HQ_BREAK=' + br : '')); process.exitCode = v === 'PASS' ? 0 : 1; return v; };
  return k;
}
const q = (sql) => { const r = cp.spawnSync('sqlite3', ['-readonly', '-json', SEED, sql], { encoding: 'utf8', maxBuffer: 1 << 29 }); if (r.status !== 0) throw new Error(r.stderr); return JSON.parse(r.stdout || '[]'); };
const seedOk = () => fs.existsSync(SEED) && fs.statSync(SEED).size > 1e6;   // an LFS stub is a few bytes
const idxFile = (lang) => path.join(ERP, 'i18n', 'help', lang, 'index.json'), packFile = (lang) => path.join(ERP, 'i18n', 'help', lang, 'help.json');
// pack(lang) -> {index, text(i)}: the committed index.json + the resolver rebuilt from the two help packs the page loads (the adapter's own resolver)
function pack(lang) {
  const A = require(path.join(ERP, 'tools', 'help_records.js')), index = JSON.parse(fs.readFileSync(idxFile(lang), 'utf8'));
  const en = JSON.parse(fs.readFileSync(packFile('en_US'), 'utf8')), pk = lang === 'en_US' ? en : JSON.parse(fs.readFileSync(packFile(lang), 'utf8'));
  return { lang, index, text: A.resolver(en, pk) };
}
// the integers a pack's records use, as an object {i: text}, to send to a page (it has no file system)
function textsUsed(p) { const t = {}; p.index.records.forEach((r) => ['d', 'h'].forEach((f) => { if (typeof r[f] === 'number') t[r[f]] = p.text(r[f]); })); return t; }
// the query list of W-HQ-RANK-TWIN / W-HQ-BM25, from the pack's own records: every window, process, action and status name, each how-to title, and each multi-word name's first word alone
function queries(p, allKinds) {
  const kinds = allKinds ? null : ['window', 'process', 'action', 'status', 'howto'], seen = new Set(), out = [];
  const add = (s) => { s = String(s).replace(/\s+/g, ' ').trim(); if (s && !seen.has(s)) { seen.add(s); out.push(s); } };
  p.index.records.forEach((r) => { if (kinds && kinds.indexOf(r.k) < 0) return; add(r.n); const w = String(r.n).replace(/\s+/g, ' ').trim().split(' '); if (w.length > 1) add(w[0]); });
  return out;
}
async function page(breakValue) {
  const { chromium } = require(PW), b = await chromium.launch({ headless: true, args: ['--disable-gpu'] }), pg = await b.newPage();
  if (breakValue) await pg.addInitScript('window.__HQ_BREAK=' + JSON.stringify(breakValue));
  await pg.goto('about:blank'); await pg.addScriptTag({ path: CORE });
  return { pg, close: () => b.close(), version: b.version() };
}
// run the core in Node, the way the page will: one handle per pack, a list of queries -> the lines "id|tier|score,..." per query (integers, so a text compare is exact)
function lines(HQ, p, qs) { const h = HQ.create(p.index, { text: p.text }); return qs.map((s) => h.query(s).map((x) => x.id + '|' + x.tier + '|' + x.score).join(',')); }
// §19.4 (VOCAB_MESSAGE_CATALOG.md): the Viewer and Modeller packs, one per Viewer locale (the 18 of viewer/i18n), made by the ONE builder from viewer/ and modeller/ tools/help_records.js.
// Their records hold their own strings (no integer text list), so text() is empty.
const BIM_APPS = ['viewer', 'modeller'], BIM_LOCALES = require(path.join(ROOT, 'viewer', 'tools', 'trl_common')).LOCALES;
const bimFile = (app, lang) => path.join(ROOT, app, 'help', 'index', lang + '.json');
function bimPack(app, lang) { return { app, lang, index: JSON.parse(fs.readFileSync(bimFile(app, lang), 'utf8')), text: () => '' }; }
module.exports = { kit, q, seedOk, pack, textsUsed, queries, page, lines, LANGS, ROOT, CORE, ERP, SEED, BIM_APPS, BIM_LOCALES, bimFile, bimPack };
