#!/usr/bin/env node
// ⚠ DO NOT REMOVE — Implementing bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §10 H1/H3/H4 (help showcase). Witness: W-HELP-SHOWCASE (erp/tests/witness_help_showcase.js).
// Builds erp/i18n/help/<lang>/help.json. EXTRACTED, never invented:
//   fields  — translated Description/Help per AD_Field_ID from the SAME published packs erp/tools/build_i18n.py pins (cache ~/.cache/erp_trl).
//             Legacy's rule (SynchronizeTerminology): a centrally maintained field takes its column's AD_Element translation (PO_ text in an
//             IsSOTrx='N' window when present); otherwise its own AD_Field_Trl row. A text counts as translated when present and not equal to
//             its English original. First source wins (the build_i18n.py order).
//   howto   — AD_CtxHelp-shaped rows (ctxtype W) for the trade-cycle windows: sentences copied from docs/ERPUserGuide.md "The standard flow"
//             §1-§4 (bim-compiler), proof asides left out, the guide section linked; window names linked at build time (H3, ONE linker).
//   actions — AD_Ref_List 135 (DocAction) name/description, the statuses an action is allowed from (AdDocFsm.TRANSITION), the CLI verb
//             (common/door/verbs.json, the verb whose description says "Runs DocAction <code>", with its own input names).
// Run: node erp/tools/build_help_pack.js [--guide <ERPUserGuide.md>]   (default: git show origin/master:docs/ERPUserGuide.md in ~/bim-compiler)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const ERP = path.join(__dirname, '..'), ROOT = path.join(ERP, '..');
const CACHE = process.env.ERP_TRL_CACHE || path.join(os.homedir(), '.cache', 'erp_trl');
const SEED = process.env.ERP_SEED_DB || path.join(ERP, 'ad_seed.db');
const OUT = path.join(ERP, 'i18n', 'help');
const GUIDE_URL = 'https://red1oon.github.io/BIMCompiler/ERPUserGuide/';
const SOURCES = {   // the build_i18n.py SOURCES for the four pilot languages (D2), same order (first wins)
  fr_FR: ['nmicoud_fr_FR', 'x_fr352/fr_FR'],
  de_DE: ['bxservice_tbayen.translations/data/de_DE'],
  ja_JP: ['JPiere_japanese-translation'],
  zh_CN: ['x_zh_CN/zh_CN'],
};
// H4: the trade-cycle how-to rows: window -> the guide section (heading text as in the guide, its mkdocs anchor)
const HOWTO = [
  { window: 143, heading: '### 1 · Sales Order', anchor: '1-sales-order' },
  { window: 169, heading: '### 2 · Shipment', anchor: '2-shipment' },
  { window: 167, heading: '### 3 · Customer Invoice → AR', anchor: '3-customer-invoice-ar' },
  { window: 195, heading: '### 4 · Receipt & Allocation', anchor: '4-receipt-allocation' },
];
const q = (sql) => { const r = cp.spawnSync('sqlite3', ['-readonly', '-json', SEED, sql], { encoding: 'utf8', maxBuffer: 1 << 29 }); if (r.status !== 0) throw new Error(r.stderr); return JSON.parse(r.stdout || '[]'); };
const ent = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e.toLowerCase()]);
const norm = (s) => String(s == null ? '' : s).split(/\s+/).filter(Boolean).join(' ');
// parse an iDempiere translation XML: { id: { Column: [text, original] } }
function parseTrl(file) {
  const out = {}; if (!fs.existsSync(file)) return out;
  const x = fs.readFileSync(file, 'utf8'), rowRe = /<row id="(\d+)"[^>]*>([\s\S]*?)<\/row>/g, valRe = /<value column="([^"]+)" original="([^"]*)"\s*(?:\/>|>([\s\S]*?)<\/value>)/g;
  let m; while ((m = rowRe.exec(x))) { const o = {}; let v; while ((v = valRe.exec(m[2]))) o[v[1]] = [ent(v[3] || ''), ent(v[2] || '')]; out[m[1]] = o; }
  return out;
}
const translated = (pair) => pair && norm(pair[0]) !== '' && norm(pair[0]) !== norm(pair[1]);
function findFile(dir, table, lang) { const d = path.join(CACHE, dir), f = path.join(d, table + '_Trl_' + lang + '.xml'); return fs.existsSync(f) ? f : null; }

function buildFields(lang) {
  const els = SOURCES[lang].map((d) => parseTrl(findFile(d, 'AD_Element', lang) || '')), flds = SOURCES[lang].map((d) => parseTrl(findFile(d, 'AD_Field', lang) || ''));
  const rows = q("SELECT f.ad_field_id id, f.iscentrallymaintained cm, f.description d, f.help h, c.ad_element_id e, w.issotrx so FROM ad_field f JOIN ad_column c ON c.ad_column_id=f.ad_column_id JOIN ad_tab t ON t.ad_tab_id=f.ad_tab_id JOIN ad_window w ON w.ad_window_id=t.ad_window_id WHERE f.isactive='Y'");
  const out = {}; let n = 0, stale = 0;
  const pick = (srcs, id, col) => { for (const s of srcs) { const r = s[String(id)]; if (r && translated(r[col])) return r[col]; } return null; };
  rows.forEach((r) => {
    const get = (col, base) => {
      let p = null;
      if (r.cm === 'Y') { if (r.so === 'N') p = pick(els, r.e, 'PO_' + col); if (!p) p = pick(els, r.e, col); }
      else p = pick(flds, r.id, col);
      if (p && norm(p[1]) !== norm(base)) stale++;   // the pack's English original differs from today's English (applied by id, as legacy does)
      return p ? p[0] : null;
    };
    const d = get('Description', r.d), h = get('Help', r.h);
    if (d != null || h != null) { out[r.id] = [d, h]; n++; }
  });
  return { fields: out, n, stale, total: rows.length };
}

function readGuide() {
  const i = process.argv.indexOf('--guide'); if (i > 0) return fs.readFileSync(process.argv[i + 1], 'utf8');
  return cp.execSync('git -C ' + JSON.stringify(path.join(os.homedir(), 'bim-compiler')) + ' show origin/master:docs/ERPUserGuide.md', { encoding: 'utf8', maxBuffer: 1 << 26 });
}
// H3: ONE linker — a window's exact name in the text becomes a link (case-sensitive, longest name first, whole words, each name once)
function linker(windows) {
  const names = windows.slice().sort((a, b) => b.name.length - a.name.length);
  return function link(html) {
    const used = {}; let out = html;
    names.forEach((w) => {
      if (used[w.name.toLowerCase()]) return;
      const re = new RegExp('(^|[^\\w>])(' + w.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?![\\w<])');   // case-sensitive: the window's exact name (lowercase 'menu' / 'product' are words, not windows)
      // never link inside a tag or an existing link
      const parts = out.split(/(<a [^>]*>.*?<\/a>|<[^>]+>)/);
      for (let p = 0; p < parts.length; p++) {
        if (parts[p].startsWith('<')) continue;
        if (w.whole && !(parts[p] === w.name && /^<(b|code)>$/.test(parts[p - 1] || ''))) continue;
        if (re.test(parts[p])) { parts[p] = parts[p].replace(re, (m, pre, nm) => pre + '<a href="#" data-help-win="' + w.id + '">' + nm + '</a>'); used[w.name.toLowerCase()] = 1; break; }
      }
      out = parts.join('');
    });
    return out;
  };
}
const md = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\*([^*]+)\*/g, '<i>$1</i>').replace(/`([^`]+)`/g, '<code>$1</code>');
function buildHowto(windows) {
  // link targets: each window's exact name, plus each table's dictionary Name and TableName -> the table's own window (AD_Table.AD_Window_ID)
  const wid = {}; windows.forEach((w) => { wid[w.id] = 1; });
  const targets = windows.slice();
  //   a table term links only as a WHOLE bold/code term of the guide (<b>Invoice</b>, <code>M_InOut</code>), never a System-only dictionary table (AccessLevel 4)
  q("SELECT tablename tt, name tn, ad_window_id tw FROM ad_table WHERE isactive='Y' AND ad_window_id IS NOT NULL AND accesslevel<>'4'").forEach((t) => { if (wid[t.tw]) { targets.push({ id: Number(t.tw), name: String(t.tt), whole: true }); targets.push({ id: Number(t.tw), name: String(t.tn), whole: true }); } });
  const g = readGuide(), lines = g.split('\n'), link = linker(targets), rows = [];
  HOWTO.forEach((h, k) => {
    const at = lines.indexOf(h.heading); if (at < 0) throw new Error('guide heading not found: ' + h.heading);
    const body = []; for (let i = at + 1; i < lines.length && !/^#{1,3} /.test(lines[i]); i++) body.push(lines[i]);
    const paras = body.join('\n').split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p && !p.startsWith('>'));   // the proof asides (> *Proven by* …) left out
    const win = windows.find((w) => w.id === h.window), title = h.heading.replace(/^#+\s*/, '');
    rows.push({ id: k + 1, ctxtype: 'W', ad_window_id: h.window, name: title, window: win ? win.name : null,
      source: { guide: 'docs/ERPUserGuide.md', heading: h.heading, url: GUIDE_URL + '#' + h.anchor, sentences: paras },
      html: paras.map((p) => '<p>' + link(md(p.replace(/\s*\n\s*/g, ' '))) + '</p>').join('') });
  });
  return rows;
}
// §12 H1b: the names of the language, from its own published XML (first source wins, translated = present and not the English original):
//   windows (AD_Window_Trl), tables (AD_Table_Trl), actions (AD_Ref_List_Trl of DocAction 135, by code), statuses (AD_Ref_List_Trl of DocStatus 131, by code).
function buildNames(lang) {
  const read = (table) => SOURCES[lang].map((d) => parseTrl(findFile(d, table, lang) || ''));
  const pick = (srcs, id) => { for (const s of srcs) { const r = s[String(id)]; if (r && translated(r.Name)) return r.Name[0].trim(); } return null; };
  const W = read('AD_Window'), T = read('AD_Table'), R = read('AD_Ref_List'), out = { windows: {}, tables: {}, actions: {}, statuses: {} };
  q("SELECT ad_window_id wid FROM ad_window WHERE isactive='Y'").forEach((r) => { const n = pick(W, r.wid); if (n) out.windows[r.wid] = n; });
  q("SELECT ad_table_id tid FROM ad_table WHERE isactive='Y' AND ad_window_id IS NOT NULL").forEach((r) => { const n = pick(T, r.tid); if (n) out.tables[r.tid] = n; });
  q("SELECT ad_ref_list_id rid, ad_reference_id ref, value v FROM ad_ref_list WHERE ad_reference_id IN (131,135) AND isactive='Y' AND value<>'--'").forEach((r) => { const n = pick(R, r.rid); if (n) out[r.ref === 135 ? 'actions' : 'statuses'][r.v] = n; });
  return out;
}
// §12 H1b: the how-to rows of a language = the build session's translation file erp/tools/help_howto_<lang>.json, linked by the SAME linker with that language's window names
function buildHowtoLang(lang, names, enRows) {
  const f = path.join(__dirname, 'help_howto_' + lang + '.json'); if (!fs.existsSync(f)) return [];
  const src = JSON.parse(fs.readFileSync(f, 'utf8')), link = linker(Object.keys(names.windows).map((id) => ({ id: Number(id), name: names.windows[id], whole: /[\u3040-\u30ff\u3400-\u9fff]/.test(names.windows[id]) })));   // CJK has no case: a name links only as a whole bold term (菜单 'menu' and 产品 'product' are words, not the Menu / Product windows)
  return src.rows.map((r, k) => {
    const en = enRows.find((e) => e.ad_window_id === r.window); if (!en) throw new Error(lang + ' how-to row for window ' + r.window + ' has no English row');
    return { id: en.id, ctxtype: 'W', ad_window_id: r.window, name: r.name, window: names.windows[r.window] || en.window, kind: en.kind, table: en.table, translated: src.translated,
      source: { guide: en.source.guide, heading: en.source.heading, url: en.source.url, sentences: en.source.sentences, translation: r.sentences },
      html: r.sentences.map((p) => '<p>' + link(md(p)) + '</p>').join('') };
  });
}
function buildActions() {
  const fsm = require(path.join(ERP, 'ad_docfsm.js'));
  const st = {}; q("SELECT value v, name n FROM ad_ref_list WHERE ad_reference_id=131 AND isactive='Y'").forEach((r) => { st[r.v] = r.n; });
  const verbs = JSON.parse(fs.readFileSync(path.join(ROOT, 'common', 'door', 'verbs.json'), 'utf8')).verbs || [];
  const out = {};
  q("SELECT value v, name n, description d FROM ad_ref_list WHERE ad_reference_id=135 AND isactive='Y' AND value<>'--' ORDER BY value").forEach((r) => {
    const from = Object.keys(fsm.TRANSITION[r.v] || {}), vb = verbs.find((x) => new RegExp('Runs DocAction ' + r.v + '\\b').test(x.description || ''));
    const offered = vb ? ((vb.description.match(/Offered for: (.*?) \(each /) || [])[1] || '') : '';
    out[r.v] = { name: r.n, description: r.d, allowedFrom: from.map((s) => st[s] || s), verb: vb ? vb.verb : null, inputs: vb ? (vb.inputs || []).map((i) => i.name) : [], offeredFor: offered };
  });
  return out;
}
(function main() {
  const log = console.log; console.log = () => {}; const fsmCheck = require(path.join(ERP, 'ad_docfsm.js')); console.log = log; void fsmCheck;
  // the role's menu windows are not known at build time; the linker uses every active window of the seed (the page drops a link whose window is not on the menu)
  const windows = q("SELECT ad_window_id wid, name wnm FROM ad_window WHERE isactive='Y'").map((w) => ({ id: Number(w.wid), name: String(w.wnm) }));   // aliases differ from column names: sqlite3 -json keeps a same-named column's own case
  const tables = {}; q("SELECT t.ad_window_id w, tb.name tn, tb.tablename tt FROM ad_tab t JOIN ad_table tb ON tb.ad_table_id=t.ad_table_id WHERE t.tablevel=0 AND t.isactive='Y' AND t.ad_window_id IN (" + HOWTO.map((h) => h.window).join(',') + ") ORDER BY t.seqno").forEach((r) => { if (!tables[r.w]) tables[r.w] = { kind: r.tn, table: r.tt }; });
  fs.mkdirSync(path.join(OUT, 'en_US'), { recursive: true });
  const howto = buildHowto(windows).map((r) => Object.assign(r, { kind: (tables[r.ad_window_id] || {}).kind || null, table: (tables[r.ad_window_id] || {}).table || null }));
  const en = { lang: 'en_US', spec: 'bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §10', built: 'build_help_pack.js', howto, actions: buildActions() };
  fs.writeFileSync(path.join(OUT, 'en_US', 'help.json'), JSON.stringify(en));
  console.log('§HELP_PACK en_US howto=' + howto.length + ' links=' + howto.reduce((a, r) => a + (r.html.match(/data-help-win=/g) || []).length, 0) + ' actions=' + Object.keys(en.actions).length + ' bytes=' + fs.statSync(path.join(OUT, 'en_US', 'help.json')).size);
  Object.keys(SOURCES).forEach((lang) => {
    const b = buildFields(lang); fs.mkdirSync(path.join(OUT, lang), { recursive: true });
    const f = path.join(OUT, lang, 'help.json');
    // each distinct text once: fields[id] = [descIndex, helpIndex] into texts (-1 = none) — 3,374 distinct texts carry 14,961 German fields (PERF BUDGET: no duplicate buffers)
    const texts = [], ix = new Map(), fields = {};
    Object.keys(b.fields).forEach((id) => { fields[id] = b.fields[id].map((t) => { if (t == null) return -1; if (!ix.has(t)) { ix.set(t, texts.length); texts.push(t); } return ix.get(t); }); });
    const names = buildNames(lang), hl = buildHowtoLang(lang, names, howto);
    fs.writeFileSync(f, JSON.stringify(Object.assign({ lang, spec: en.spec, sources: SOURCES[lang], texts, fields, names }, hl.length ? { howto: hl } : {})));
    console.log('§HELP_PACK ' + lang + ' fields=' + b.n + ' of ' + b.total + ' texts=' + texts.length + ' stale-original=' + b.stale + ' names windows=' + Object.keys(names.windows).length + ' tables=' + Object.keys(names.tables).length +
      ' actions=' + Object.keys(names.actions).length + ' statuses=' + Object.keys(names.statuses).length + ' howto=' + hl.length + ' links=' + hl.reduce((a, r) => a + (r.html.match(/data-help-win=/g) || []).length, 0) + ' bytes=' + fs.statSync(f).size);
  });
})();
