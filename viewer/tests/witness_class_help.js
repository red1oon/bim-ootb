#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-CLASS-HELP (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §14.1). Scope: the Viewer info panel's
// `#info-class-help` block (info_class_help.js) and its rows in viewer/i18n. READ THE LOG: exit code alone is not evidence.
// Issues it proves/disproves:
//   C1 COVERAGE   — "a shipped element's class has no description": X of N classes of the shipped buildings have (b) ifccls_
//                   in every pack, and (a) ifcdef_ wherever bSDD has the class. N counted from the DBs now, never typed in.
//   C2 VERBATIM   — "we reworded or machine-translated buildingSMART's text" (CC BY-ND forbids it): every ifcdef_ text in
//                   every pack equals the bSDD text of its declared language, byte for byte.
//   C3 HONEST     — "a pack claims an official translation bSDD does not have, or drops one it has": per locale, the
//                   classes shown in a non-English bSI text == the classes bSDD translates (definition differs from EN).
//   C4 LABEL      — "a reader is shown English bSI text as if it were their language": fallback line iff text is EN and the
//                   page is not English; credit line always under (a). Rendered through the shipped html().
//   C5 PAGE       — "the block never appears on a real pick": viewer.html + Duplex, a Find pick of an IfcWall in de_DE and
//                   zh_CN logs §CLASS_HELP and shows the block (German bSI text in de_DE; the fallback line in zh_CN).
//   C6 TYPES      — (§14.2) "a type class shows a text that is not its occurrence's, or hides which class it is": IfcSensorType /
//                   IfcFlowInstrumentType show the bSDD text of the class their own IFC page names (type_of.json, the cited
//                   sentence present in the saved page), with that class in the heading and the link.
//   C7 LANGUAGES  — (§14.2) "our sentence is still English in a language we serve": every non-English locale has all shipped
//                   ifccls_ rows trl="Y" in its XML; the three English variants have none.
//   C8 FILL TOOL  — (§14.2) "trl_fill_batch.js overwrites a translation": re-running the shipped fill batch fills 0; a batch that
//                   changes one existing translation is REFUSED and leaves every XML byte-identical.
//   RED CONTROL   — one changed character in one bSI text, and a zh card without its fallback line, must FAIL (contract kit).
// usage: NODE_PATH=~/bim-ootb/node_modules:~/bim-compiler/node_modules node viewer/tests/witness_class_help.js
//        [BUILDINGS=<dir of *_extracted.db>, default ~/bim-ootb/viewer/buildings]  [--no-page]
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..');
const Database = require('better-sqlite3');
const { Witness } = require(path.join(ROOT, 'witness_kit', 'contract.js'));
const BLD = process.env.BUILDINGS || path.join(process.env.HOME, 'bim-ootb', 'viewer', 'buildings');
const ORACLE = require(path.join(ROOT, 'viewer', 'tools', 'ifc_class_help', 'bsdd_ifc43_shipped_classes.json'));
const ORACLE_OF = require(path.join(ROOT, 'viewer', 'tools', 'ifc_class_help', 'bsdd_ifc43_type_of_classes.json'));
const TYPE_OF = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'tools', 'ifc_class_help', 'type_of.json'), 'utf8'));
const srcOf = c => (TYPE_OF[c] && c[0] !== '_') ? { cls: TYPE_OF[c].of, o: ORACLE_OF } : { cls: c, o: ORACLE };   // whose bSDD text a class shows
const T = require(path.join(ROOT, 'viewer', 'tools', 'trl_common.js'));
const BSDD = { de_DE: 'de-DE', es_ES: 'es-ES', ja_JP: 'ja-JP', zh_CN: 'zh-CN', pt_BR: 'pt-BR', fr_FR: 'fr-FR' };
const HTML_LANG = l => l === 'bl_BD' ? 'bn-Latn' : l.split('_')[0];   // locale_loader.js applyLangDir rule
const log = console.log;
let fails = 0; const ck = (id, ok, msg) => { log((ok ? '§PASS ' : '§FAIL ') + id + ' ' + msg); if (!ok) fails++; };

// ── population: the shipped classes, counted from the building DBs now ──
const dbs = fs.existsSync(BLD) ? fs.readdirSync(BLD).filter(f => /_extracted\.db$/.test(f)) : [];
const shipped = new Set();
for (const f of dbs) {
  const p = fs.realpathSync(path.join(BLD, f)); if (!fs.statSync(p).size) continue;
  const db = new Database(p, { readonly: true });
  try { db.prepare('select distinct ifc_class c from elements_meta').all().forEach(r => r.c && shipped.add(r.c)); } finally { db.close(); }
}
log('§CLASS_HELP_POP buildings=' + dbs.length + ' classes=' + shipped.size + ' dir=' + BLD);
if (!shipped.size) { log('§W-CLASS-HELP INCONCLUSIVE no shipped building DB found — nothing judged'); process.exit(2); }
const classes = [...shipped].sort();

// ── the shipped renderer, driven by each built pack through a _trl that behaves like locale_loader.js's ──
const P = require(path.join(ROOT, 'viewer', 'info_class_help.js'));
let PACK = {};
global._trl = (k, r, d) => (PACK[k] ? PACK[k] : (d != null ? d : k));
console.log = (...a) => { if (!/^§CLASS_HELP /.test(String(a[0]))) log(...a); };
const rows = [];
for (const loc of T.LOCALES) {
  PACK = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'i18n', loc + '.json'), 'utf8')).labels;
  for (const c of classes) {
    const m = P.model(c, HTML_LANG(loc));
    const html = m ? P.html(m) : '';
    const so = srcOf(c);
    rows.push({ loc, cls: c, ours: m ? m.ours : '', def: m ? m.def : '', defLang: m ? m.defLang : '', fallback: !!(m && m.fallback), of: m ? (m.of || '') : '',
      showsFallbackLine: /data-cls-part="fallback"/.test(html), showsCredit: /data-cls-part="credit"/.test(html),
      headingNamesOf: !!(m && m.of) && html.indexOf(m.of) > html.indexOf('<summary') && html.indexOf('/class/' + m.of + '"') > 0,
      inBsdd: !!(so.o[so.cls] && so.o[so.cls].EN && !so.o[so.cls].EN.error) });
  }
}
console.log = log;

const sch = { type: 'object', required: ['loc', 'cls', 'ours', 'def', 'defLang', 'fallback'],
  properties: { loc: { type: 'string' }, cls: { type: 'string', pattern: '^Ifc' }, ours: { type: 'string' }, def: { type: 'string' }, defLang: { type: 'string' }, fallback: { type: 'boolean' } } };
const oracleText = (c, code) => { const so = srcOf(c), x = so.o[so.cls] && so.o[so.cls][code]; return x && !x.error ? x.definition : null; };
const officialIn = (c, loc) => { const code = BSDD[loc]; if (!code) return false; const t = oracleText(c, code), en = oracleText(c, 'EN'); return !!(t && en && t !== en); };

const res = Witness('CLASS_HELP')
  .population(() => rows)
  .schema(sch)
  .invariant('C1 coverage: (b) for every shipped class in every pack; (a) iff the class (or its cited occurrence class) is in bSDD', rs => rs.every(r => r.ours.length > 0 && (r.def.length > 0) === r.inBsdd))
  .invariant('C2 verbatim: every (a) text == bSDD text of its declared language', rs => rs.every(r => !r.def || r.def === oracleText(r.cls, r.defLang === 'EN' ? 'EN' : r.defLang)))
  .invariant('C3 honest: non-English (a) exactly where bSDD has an official translation', rs => rs.every(r => !r.def || ((r.defLang !== 'EN') === officialIn(r.cls, r.loc))))
  .invariant('C4 label: fallback line iff EN text on a non-English page; credit under every (a)', rs => rs.every(r => r.showsFallbackLine === (!!r.def && r.defLang === 'EN' && !/^en/.test(HTML_LANG(r.loc))) && (!r.def || r.showsCredit)))
  .invariant('C6 types: a type shows its cited occurrence class, named in heading + link', rs => rs.every(r => !TYPE_OF[r.cls] || (r.of === TYPE_OF[r.cls].of && r.headingNamesOf &&
     fs.readFileSync(path.join(ROOT, 'viewer', 'tools', 'ifc_class_help', TYPE_OF[r.cls].file), 'utf8').indexOf(TYPE_OF[r.cls].cite) >= 0)))
  .redControl(rs => rs.map(r => {
    if (r.loc === 'ja_JP' && r.cls === 'IfcSensorType') return Object.assign(r, { headingNamesOf: false });                   // a type hiding its source class
    if (r.loc === 'de_DE' && r.cls === 'IfcWall') return Object.assign(r, { def: r.def.replace('Räumen', 'Raeumen') });       // one character changed
    if (r.loc === 'zh_CN' && r.cls === 'IfcWall') return Object.assign(r, { showsFallbackLine: false });                       // zh card claims translated
    return r;
  }))
  .run();

// per-locale X of N, so the numbers are in the log (spec §14.1 measured: de 9, es 31, ja 9, pt_BR 46, zh 0, fr 0)
for (const loc of ['de_DE', 'es_ES', 'ja_JP', 'pt_BR', 'zh_CN', 'fr_FR', 'en_MY']) {
  const rs = rows.filter(r => r.loc === loc);
  log('§CLASS_HELP_COV locale=' + loc + ' ours=' + rs.filter(r => r.ours).length + '/' + rs.length + ' ifc=' + rs.filter(r => r.def).length + '/' + rs.length +
    ' ifc_official=' + rs.filter(r => r.def && r.defLang !== 'EN').length + ' ifc_fallback=' + rs.filter(r => r.fallback).length);
}
// C4 named cases (the spec's examples), so a reader sees them, not just "all rows passed"
const one = (loc, c) => rows.find(r => r.loc === loc && r.cls === c) || {};
ck('C4a', one('de_DE', 'IfcWall').defLang === 'de-DE' && !one('de_DE', 'IfcWall').showsFallbackLine, 'IfcWall de_DE: German bSI text, no fallback line');
ck('C4b', one('zh_CN', 'IfcWall').defLang === 'EN' && one('zh_CN', 'IfcWall').showsFallbackLine, 'IfcWall zh_CN: English bSI text + fallback line');
ck('C4c', shipped.has('IfcWallStandardCase') ? (one('fr_FR', 'IfcWallStandardCase').ours && !one('fr_FR', 'IfcWallStandardCase').def) : false, 'IfcWallStandardCase: (b) only, no (a)');
PACK = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'i18n', 'de_DE.json'), 'utf8')).labels;
ck('C4d', P.model('IfcNoSuchThing', 'de') === null, 'unknown class: no block');
// C7 — read the XML (the source), not the built pack: trl="Y" per locale for the shipped ifccls_ rows
{ const base = new Map(T.readTerms().map(r => [r.value, r.id])); const want = classes.map(c => base.get('ifccls_' + c)); const bad = [];   // T2: ifccls_ rows live in BIM_Element
  for (const loc of T.LOCALES.filter(l => l !== T.BASE)) {
    const x = T.parseTrlXml(fs.readFileSync(T.elementXmlFile(loc), 'utf8')), y = new Map(x.rows.map(r => [r.id, r.trl]));
    const n = want.filter(id => y.get(id) === 'Y').length, english = /^en_/.test(loc);
    log('§CLASS_HELP_TRL locale=' + loc + ' ours_translated=' + n + '/' + want.length);
    if (english ? n !== 0 : n !== want.length) bad.push(loc + '=' + n);
  }
  ck('C7', !bad.length && want.every(Boolean), 'our sentence translated in every non-English locale, none in en_*' + (bad.length ? ' BAD ' + bad.join(',') : '')); }
// C8 — the fill tool: idempotent, and it refuses to overwrite a translation (files untouched)
{ const cp = require('child_process'), crypto = require('crypto');
  const hash = () => crypto.createHash('sha1').update(T.LOCALES.filter(l => l !== T.BASE).map(l => fs.readFileSync(T.xmlFile(l)) + fs.readFileSync(T.elementXmlFile(l))).join('')).digest('hex');
  const tool = path.join(ROOT, 'viewer', 'tools', 'trl_fill_batch.js'), shipped = path.join(ROOT, 'viewer', 'tools', 'trl_batch_2026-11-17_ifccls_fill.js');
  const h0 = hash();
  const r1 = cp.spawnSync('node', [tool, shipped], { encoding: 'utf8' });
  const again = r1.status === 0 && /filled=0/.test(r1.stdout) && !/filled=[1-9]/.test(r1.stdout) && hash() === h0;
  const tmp = path.join(require('os').tmpdir(), 'w_class_help_bad_fill_' + process.pid + '.js');
  fs.writeFileSync(tmp, "module.exports = { LABEL: 'witness', FILL: { de_DE: { ifccls_IfcWall: 'Eine andere Wand' } } };");
  const r2 = cp.spawnSync('node', [tool, tmp], { encoding: 'utf8' }); fs.unlinkSync(tmp);
  const refused = r2.status === 1 && /REFUSED/.test(r2.stdout) && /already translated with other text/.test(r2.stdout) && hash() === h0;
  ck('C8', again && refused, 'fill tool re-run fills 0 (' + again + '), overwrite REFUSED with XML untouched (' + refused + ')'); }
{ const t = rows.find(r => r.loc === 'pt_BR' && r.cls === 'IfcSensorType') || {}, j = rows.find(r => r.loc === 'ja_JP' && r.cls === 'IfcSensorType') || {};
  ck('C6a', t.of === 'IfcSensor' && t.defLang === 'pt-BR' && !t.showsFallbackLine && j.defLang === 'EN' && j.showsFallbackLine && j.headingNamesOf,
    'IfcSensorType: pt_BR official IfcSensor text; ja_JP English IfcSensor text + fallback line; heading/link name IfcSensor'); }
if (res.fail) fails += res.fail;

if (process.argv.includes('--no-page')) { log('§CLASS_HELP_PAGE not judged (--no-page)'); log('§W-CLASS-HELP ' + (fails ? 'FAIL ' + fails : 'PASS (page not judged)')); process.exit(fails ? 1 : 0); }

// ── C5 real page: Find pick of an IfcWall on Duplex, in de_DE and zh_CN ──
(async () => {
  const puppeteer = require('puppeteer');
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const SRC = fs.realpathSync(path.join(BLD, 'Duplex_extracted.db')), VDB = path.join(ROOT, 'viewer', 'buildings', 'WitnessClassHelp_extracted.db');
  fs.mkdirSync(path.dirname(VDB), { recursive: true }); fs.copyFileSync(SRC, VDB);
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { log('§CLASS_HELP_404 ' + p); s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    for (const loc of ['de_DE', 'zh_CN']) {
      const pg = await br.newPage(); await pg.setViewport({ width: 1600, height: 900 });
      const lines = []; pg.on('console', m => { const t = m.text(); if (/§CLASS_HELP|§TRL_LABELS|§LOAD_FAIL/.test(t)) lines.push(t); });
      pg.on('pageerror', e => log('§PAGEERR ' + String(e).slice(0, 200)));
      await pg.goto('http://127.0.0.1:' + srv.address().port + '/viewer/viewer.html?db=buildings/WitnessClassHelp_extracted.db&lang=' + loc, { waitUntil: 'load', timeout: 120000 });
      const wait = async (what, fn) => { try { await pg.waitForFunction(fn, { timeout: 240000 }); } catch (e) {
        const st = await pg.evaluate(() => ({ app: !!window.APP, db: !!(window.APP && window.APP.db), trl: !!window._TRL_READY, body: (document.body.innerText || '').slice(0, 200) })).catch(() => null);
        throw new Error('wait ' + what + ' timed out, state=' + JSON.stringify(st)); } };
      await wait('app+db+trl', 'window.APP && window.APP.db && window.APP.dbQuery && window._TRL_READY');
      // the status line is translated (de_DE: FERTIG): wait for the pack's own ui_status_done word, not English DONE
      await wait('ui_status_done', () => { const w = String(window._trl('ui_status_done', null, 'DONE')).split(/[ —]/)[0]; return !!w && (document.body.innerText || '').indexOf(w) >= 0; });
      await pg.evaluate(() => window.APP.openFindPanel('IfcWall')); await new Promise(r => setTimeout(r, 3000));
      // the Find 'IfcWall' list also holds IfcWallStandardCase: click results the way a user does until the info panel's
      // own class row reads IfcWall (the class whose bSI text has a German translation)
      const picked = await pg.evaluate(async () => { const items = [...document.querySelectorAll('.find-result-item')];
        for (let i = 0; i < Math.min(items.length, 60); i++) { items[i].click(); await new Promise(r => setTimeout(r, 400));
          const c = (document.getElementById('info-class').textContent || '').split(' ')[0]; if (c === 'IfcWall') return { i, of: items.length }; }
        return { i: -1, of: items.length }; });
      log('§CLASS_HELP_PICK locale=' + loc + ' result=' + picked.i + ' of=' + picked.of); await new Promise(r => setTimeout(r, 1500));
      const t = await pg.evaluate(() => { const b = document.getElementById('info-class-help'); if (!b) return null; const d = b.querySelector('details'); if (d) d.open = true;
        return { vis: getComputedStyle(b).display !== 'none', text: (b.innerText || '').replace(/\s+/g, ' ').slice(0, 400), fallback: !!b.querySelector('[data-cls-part="fallback"]'), credit: !!b.querySelector('[data-cls-part="credit"]') }; });
      lines.forEach(l => log('  ' + l));
      const logged = lines.some(l => /^§CLASS_HELP guid=.* class=IfcWall ours=Y ifc=Y/.test(l)) && picked.i >= 0;
      const want = loc === 'de_DE' ? (!!t && /Vertikale Konstruktion/.test(t.text) && !t.fallback) : (!!t && /The wall represents/.test(t.text) && t.fallback);
      ck('C5 ' + loc, !!t && t.vis && t.credit && logged && want, 'page Find pick: ' + JSON.stringify(t));
      await pg.close();
    }
  } finally { await br.close(); srv.close(); try { fs.unlinkSync(VDB); } catch (e) {} }
  log('§W-CLASS-HELP ' + (fails ? 'FAIL ' + fails : 'PASS'));
  process.exit(fails ? 1 : 0);
})().catch(e => { log('§FAIL C5 ' + (e && e.stack || e)); try { fs.unlinkSync(path.join(ROOT, 'viewer', 'buildings', 'WitnessClassHelp_extracted.db')); } catch (x) {} process.exit(1); });
