#!/usr/bin/env node
// ⚠ DO NOT REMOVE — Implementing bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §10 H1/H3/H4 (help showcase). Witness: W-HELP-SHOWCASE (erp/tests/witness_help_showcase.js).
// Builds erp/i18n/help/<lang>/help.json. EXTRACTED, never invented:
//   fields  — translated Description/Help per AD_Field_ID from the SAME published packs erp/tools/build_i18n.py pins (cache ~/.cache/erp_trl).
//             Legacy's rule (SynchronizeTerminology): a centrally maintained field takes its column's AD_Element translation (PO_ text in an
//             IsSOTrx='N' window when present); otherwise its own AD_Field_Trl row. A text counts as translated when present and not equal to
//             its English original. First source wins (the build_i18n.py order).
//   how-to  — NOT in help.json since §19.16 C4: legacy's context help (AD_CtxHelp T/P + AD_CtxHelpMsg + _Trl) in erp/ad_ctxhelp_app_rows.js, read by erp/ctx_help.js; for the trade-cycle windows: sentences copied from docs/ERPUserGuide.md "The standard flow"
//             §1-§8 and (§19.17 F5) the steps of docs/ERP_FirstSetup.md at TAB level (bim-compiler), proof asides left out, the guide section linked; window names linked at build time (H3, ONE linker).
//   actions — AD_Ref_List 135 (DocAction) name/description, the statuses an action is allowed from (AdDocFsm.TRANSITION), the CLI verb
//             (common/door/verbs.json, the verb whose description says "Runs DocAction <code>", with its own input names).
// Run: node erp/tools/build_help_pack.js [--guide <ERPUserGuide.md>] [--setup <ERP_FirstSetup.md>]   (default: git show origin/master:docs/<file> in ~/bim-compiler)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const ERP = path.join(__dirname, '..'), ROOT = path.join(ERP, '..');
const CACHE = process.env.ERP_TRL_CACHE || path.join(os.homedir(), '.cache', 'erp_trl');
const SEED = process.env.ERP_SEED_DB || path.join(ERP, 'ad_seed.db');
const OUT = path.join(ERP, 'i18n', 'help');
const GUIDE_URL = 'https://red1oon.github.io/BIMCompiler/ERPUserGuide/';
// §19.17 F5: the two source guides (bim-compiler docs). UG = the user guide's "The standard flow", FS = the first-setup guide (step by step, at TAB level).
const DOCS = { UG: { file: 'docs/ERPUserGuide.md', url: GUIDE_URL, arg: '--guide' }, FS: { file: 'docs/ERP_FirstSetup.md', url: 'https://red1oon.github.io/BIMCompiler/ERP_FirstSetup/', arg: '--setup' } };
// §19.11 step 1 (VOCAB_MESSAGE_CATALOG): the ONE source list, erp/tools/i18n_sources.json, also read by build_i18n.py (the screen packs): every screen language gets its help pack, no copy of the list here
const SOURCES = (() => { const j = JSON.parse(fs.readFileSync(path.join(__dirname, 'i18n_sources.json'), 'utf8')).sources, o = {}; Object.keys(j).forEach((l) => { o[l] = j[l].map((x) => x.dir); }); return o; })();
// H4: the trade-cycle how-to rows: window -> the guide section (heading text as in the guide, its mkdocs anchor)
//   §19.17 F1: all 8 sections of "The standard flow". `window` = the row's own window (help.json, the How To widget), `also` = the other windows the section walks, `process` = the
//   processes / reports it names (CtxType P when there is no window). ONE AD_CtxHelp per section, linked from every target's first tab / the process (legacy's FK is on them).
const HOWTO = [
  { window: 143, heading: '### 1 · Sales Order', anchor: '1-sales-order' },
  { window: 169, heading: '### 2 · Shipment', anchor: '2-shipment' },
  { window: 167, heading: '### 3 · Customer Invoice → AR', anchor: '3-customer-invoice-ar' },
  { window: 195, heading: '### 4 · Receipt & Allocation', anchor: '4-receipt-allocation' },
  { window: null, process: [53267], sotrx: 'N', heading: '### 5 · Replenishment', anchor: '5-replenishment' },
  { window: 181, also: [184, 183, 107], sotrx: 'N', heading: '### 6 · Purchase Order → Receipt → Vendor Invoice → Match', anchor: '6-purchase-order-receipt-vendor-invoice-match' },
  { window: 200005, also: [194], heading: '### 7 · Final accounts', anchor: '7-final-accounts' },
  { window: 216, process: [310], heading: '### 8 · Financial reporting', anchor: '8-financial-reporting' },
];
// §19.17 F5: docs/ERP_FirstSetup.md, each step on the TAB (or process) its own words name. `tabs` = AD_Tab ids, `window` = that window's first tab, `process` = AD_Process ids.
//   Steps 1, 2, 10, 12, 13 name no dictionary target and are left out.
const SETUP = [
  { key: 'FS3', process: [53161], heading: '### Step 3 · Run *Initial Tenant Setup*', anchor: 'step-3-run-initial-tenant-setup' },
  { key: 'FS4', tabs: [220], heading: '### Step 4 · Create a customer', anchor: 'step-4-create-a-customer' },
  { key: 'FS5', tabs: [220], heading: '### Step 5 · Create a vendor', anchor: 'step-5-create-a-vendor' },
  { key: 'FS6', tabs: [180, 177], heading: '### Step 6 · Products, prices, tax and payment terms', anchor: 'step-6-products-prices-tax-and-payment-terms' },
  { key: 'FS6a', tabs: [222], heading: '### Step 6a · Give your customer an address', anchor: 'step-6a-give-your-customer-an-address' },
  { key: 'FS6b', window: 146, heading: '### Step 6b · A first sales order in your own company', anchor: 'step-6b-a-first-sales-order-in-your-own-company' },
  { key: 'FS7', tabs: [186], heading: '### Step 7 · Enter the order header', anchor: 'step-7-enter-the-order-header' },
  { key: 'FS8', tabs: [187], heading: '### Step 8 · Add a line', anchor: 'step-8-add-a-line' },
  { key: 'FS9', tabs: [186], heading: '### Step 9 · Complete the order', anchor: 'step-9-complete-the-order' },
  { key: 'FSD', tabs: [294], sotrx: 'N', heading: '## Part D — Your first purchase order (demo company)', anchor: 'part-d-your-first-purchase-order-demo-company' },
  { key: 'FS11', process: [310], heading: '### Step 11 · Run the Trial Balance', anchor: 'step-11-run-the-trial-balance' },
  { key: 'FS11b', process: [238], heading: '### Step 11b · Aging: who owes you, and since when', anchor: 'step-11b-aging-who-owes-you-and-since-when' },
];
// THE section list, in source order (the standard flow first, then the setup guide): a tab or process served by several sections gets ONE message holding them in this order.
//   trlId = the row id of erp/i18n/machine/AD_CtxHelpMsg_Trl_<lang>.xml that translates the SECTION (the message id it had when it was translated, §19.16 C3).
const SECTIONS = HOWTO.map((h, k) => Object.assign({ key: 'UG' + (k + 1), doc: 'UG', trlId: 1000000 + k }, h)).concat(SETUP.map((h) => Object.assign({ doc: 'FS', trlId: null }, h)));
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
// §19.11: a source's files are named by the PACK's own code (es_ES is served from *_es_CO.xml, ar from *_ar_DZ / *_ar_TN), so they are found as build_i18n.py finds them: <dir>/<Table>_Trl_*.xml, sorted, every match
function trlFiles(dir, table) { const d = path.join(CACHE, dir); if (!fs.existsSync(d)) return []; const pre = table + '_Trl_'; return fs.readdirSync(d).filter((f) => f.startsWith(pre) && f.endsWith('.xml')).sort().map((f) => path.join(d, f)); }
// every file is its own source, in order, so the 'first TRANSLATED row wins' rule (pick) runs across files as build_i18n.py's does across its glob
const srcFiles = (lang, table) => [].concat(...SOURCES[lang].map((d) => trlFiles(d, table).map(parseTrl)));

function buildFields(lang) {
  const els = srcFiles(lang, 'AD_Element'), flds = srcFiles(lang, 'AD_Field');
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

// §19.17 F4: the translated Description / Help of a TAB and a PROCESS (AD_Tab_Trl / AD_Process_Trl), first translated source wins as for fields. Legacy's
//   HelpController.renderCtxHelp shows them when the tab / process has no context-help message (HelpController.java:338-410).
function buildRecTrl(lang, table, sql) {
  const srcs = srcFiles(lang, table), out = {}; let n = 0;
  const pick = (id, col) => { for (const s of srcs) { const r = s[String(id)]; if (r && translated(r[col])) return r[col][0]; } return null; };
  q(sql).forEach((r) => { const d = pick(r.id, 'Description'), h = pick(r.id, 'Help'); if (d != null || h != null) { out[r.id] = [d, h]; n++; } });
  return { recs: out, n };
}
function readGuide(doc) {
  const D = DOCS[doc || 'UG'], i = process.argv.indexOf(D.arg); if (i > 0) return fs.readFileSync(process.argv[i + 1], 'utf8');
  return cp.execSync('git -C ' + JSON.stringify(path.join(os.homedir(), 'bim-compiler')) + ' show origin/master:' + D.file, { encoding: 'utf8', maxBuffer: 1 << 26 });
}
// §19.16 C2: a guide's own time (its last commit, or the file's mtime when given by argument), the Created / Updated of the context-help rows, so a rebuild is stable
function guideTime(doc) {
  const D = DOCS[doc || 'UG'], i = process.argv.indexOf(D.arg); if (i > 0) return fs.statSync(process.argv[i + 1]).mtime.toISOString().replace('T', ' ').slice(0, 19);
  return cp.execSync('git -C ' + JSON.stringify(path.join(os.homedir(), 'bim-compiler')) + ' log -1 --format=%ci origin/master -- ' + D.file, { encoding: 'utf8' }).trim().slice(0, 19);
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
function buildSections(windows) {
  // §19.17 F5: every section of both guides -> { key, doc, name, url, html, tabs, processes }. Link targets: each window's exact name, plus each table's dictionary Name and TableName -> the table's own window (AD_Table.AD_Window_ID)
  const wid = {}; windows.forEach((w) => { wid[w.id] = 1; });
  const targets = windows.slice(), targetsPO = windows.slice();   // §19.17 F1: a buy-side section (HOWTO sotrx 'N') links a table term to AD_Table.PO_Window_ID when it has one - legacy's zoom rule by IsSOTrx
  //   a table term links only as a WHOLE bold/code term of the guide (<b>Invoice</b>, <code>M_InOut</code>), never a System-only dictionary table (AccessLevel 4)
  q("SELECT tablename tt, name tn, ad_window_id tw, po_window_id tp FROM ad_table WHERE isactive='Y' AND ad_window_id IS NOT NULL AND accesslevel<>'4'").forEach((t) => {
    if (wid[t.tw]) { targets.push({ id: Number(t.tw), name: String(t.tt), whole: true }); targets.push({ id: Number(t.tw), name: String(t.tn), whole: true }); }
    const pw = t.tp != null && wid[t.tp] ? Number(t.tp) : (wid[t.tw] ? Number(t.tw) : null); if (pw != null) { targetsPO.push({ id: pw, name: String(t.tt), whole: true }); targetsPO.push({ id: pw, name: String(t.tn), whole: true }); } });
  const linkSO = linker(targets), linkPO = linker(targetsPO), text = {}, time = {}, rows = [];
  // the setup guide names fields, sample records and buttons in bold (Oak Tree, Initial Tenant Setup): there a name links only as a WHOLE bold term, the rule the translated rows already use
  const whole = (a) => a.map((t) => Object.assign({}, t, { whole: true })), linkSOw = linker(whole(targets)), linkPOw = linker(whole(targetsPO));
  Object.keys(DOCS).forEach((d) => { text[d] = readGuide(d).split('\n'); time[d] = guideTime(d); });
  const li = (t) => md(t.replace(/\s*\n\s*/g, ' ').trim());
  // one block of a guide -> html: a paragraph, a bullet list, a numbered list (its own numbers kept; bullets under an item nest), a #### sub-heading
  const block = (p) => /^- /.test(p) ? '<ul>' + p.split(/\n- /).map((it) => '<li>' + md(it.replace(/^- /, '').replace(/\s*\n\s*/g, ' ')) + '</li>').join('') + '</ul>'
    : /^\d+\. /.test(p) ? '<ol>' + p.split(/\n(?=\d+\. )/).map((it) => { const n = /^(\d+)\. /.exec(it)[1], parts = it.replace(/^\d+\. /, '').split(/\n\s+- /);
      return '<li value="' + n + '">' + li(parts[0]) + (parts.length > 1 ? '<ul>' + parts.slice(1).map((x) => '<li>' + li(x) + '</li>').join('') + '</ul>' : '') + '</li>'; }).join('') + '</ol>'
    : /^#### /.test(p) ? '<p><b>' + li(p.replace(/^#### /, '')) + '</b></p>'
    : '<p>' + md(p.replace(/\s*\n\s*/g, ' ')) + '</p>';
  const firstTab = (w) => { const r = q('SELECT ad_tab_id t FROM ad_tab WHERE ad_window_id=' + Number(w) + " AND tablevel=0 AND isactive='Y' ORDER BY seqno, ad_tab_id LIMIT 1")[0]; if (!r) throw new Error('window ' + w + ' has no first tab'); return { window: Number(w), tab: Number(r.t) }; };
  const theTab = (t) => { const r = q('SELECT ad_window_id w FROM ad_tab WHERE ad_tab_id=' + Number(t) + " AND isactive='Y'")[0]; if (!r) throw new Error('tab ' + t + ' not active'); return { window: Number(r.w), tab: Number(t) }; };
  SECTIONS.forEach((h) => {
    const lines = text[h.doc], at = lines.indexOf(h.heading); if (at < 0) throw new Error(DOCS[h.doc].file + ' heading not found: ' + h.heading);
    const body = []; for (let i = at + 1; i < lines.length && !/^#{1,3} /.test(lines[i]); i++) body.push(lines[i]);
    // left out, as proof or decoration: the user guide's `> Proven by` asides; the setup guide's *(Verified …)* asides, its pictures and its rules
    const src = h.doc === 'FS' ? body.join('\n').replace(/\n[ \t]*\*\(Verified[\s\S]*?\)\*[ \t]*(?=\n)/g, '').replace(/\*\(Verified[\s\S]*?\)\*/g, '').split('\n').filter((l) => !/^\s*!\[/.test(l) && !/^---\s*$/.test(l)).map((l) => l.replace(/\s+$/, '')).join('\n') : body.join('\n');
    const paras = src.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p && !p.startsWith('>'));
    const title = h.heading.replace(/^#+\s*/, '').replace(/\*([^*]+)\*/g, '$1'), link = h.doc === 'FS' ? (h.sotrx === 'N' ? linkPOw : linkSOw) : (h.sotrx === 'N' ? linkPO : linkSO);
    const tabs = [].concat(h.doc === 'UG' ? [h.window].concat(h.also || []).filter((w) => w != null).map(firstTab) : [], (h.tabs || []).map(theTab), h.doc === 'FS' && h.window != null ? [firstTab(h.window)] : []);
    const procs = (h.process || []).map((pid) => { if (!q('SELECT 1 x FROM ad_process WHERE ad_process_id=' + Number(pid) + " AND isactive='Y'").length) throw new Error('process ' + pid + ' not active'); return Number(pid); });
    if (!tabs.length && !procs.length) throw new Error('section ' + h.key + ' names no target');
    rows.push({ key: h.key, doc: h.doc, trlId: h.trlId, name: title, time: time[h.doc], url: DOCS[h.doc].url + '#' + h.anchor, tabs, processes: procs, html: paras.map(block).map(link).join('') });
  });
  return rows;
}
// §19.17 F5: a help's id is kept across rebuilds by the committed register erp/tools/ctxhelp_ids.json (id -> its section keys). The same sections = the same id; a help that
//   GAINED sections keeps the id of the register entry it grew from (all of that entry's sections are in it, and nothing else uses the entry); otherwise the next free id.
//   An entry no longer used stays in the register, so its id is never given to another help.
const IDS_FILE = path.join(__dirname, 'ctxhelp_ids.json');
function assignIds(sigs) {
  const reg = JSON.parse(fs.readFileSync(IDS_FILE, 'utf8')), ids = reg.ids, out = {}, used = {};
  sigs.forEach((s) => { const id = Object.keys(ids).find((i) => ids[i].join('+') === s.join('+')); if (id != null) { out[s.join('+')] = Number(id); used[id] = 1; } });
  sigs.forEach((s) => {
    if (out[s.join('+')] != null) return;
    const grown = Object.keys(ids).filter((i) => !used[i] && ids[i].every((k) => s.indexOf(k) >= 0)).sort((a, b) => ids[b].length - ids[a].length || Number(a) - Number(b))[0];
    const id = grown != null ? Number(grown) : Math.max(APP_ID0 - 1, ...Object.keys(ids).map(Number)) + 1;
    ids[id] = s; used[id] = 1; out[s.join('+')] = id;
  });
  const sorted = {}; Object.keys(ids).map(Number).sort((a, b) => a - b).forEach((i) => { sorted[i] = ids[i]; });
  fs.writeFileSync(IDS_FILE, JSON.stringify({ note: reg.note, ids: sorted }, null, 0).replace(/("\d+":)/g, '\n$1').replace(/\}\}$/, '\n}}') + '\n');
  return out;
}
// §19.17 F7 (owner 2026-11-22: "Whole paragraphs + link"): legacy's AD_CtxHelpMsg.MsgText / _Trl.MsgText are FieldLength 2000 (AD_Column, read from the seed, never a
//   number here); the twin's SQLite never enforced it, so 4 rows were over (3,047 / 2,450 / de 2,493 / zh 2,287). A message over the limit keeps WHOLE blocks (<p> / <ul> /
//   <ol>) in order and ends with one link to the guide section where it stops: the section's own title + " …", its guide URL. Nothing is reworded.
let _msgLen = null;
function msgLen() {
  if (_msgLen != null) return _msgLen;
  const r = q("SELECT c.fieldlength n FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)='ad_ctxhelpmsg' AND lower(c.columnname)='msgtext'")[0];
  if (!r || !(Number(r.n) > 0)) throw new Error('F7: AD_CtxHelpMsg.MsgText FieldLength not found in the seed');
  return (_msgLen = Number(r.n));
}
const BLOCK_RE = /<(p|ul|ol)>[\s\S]*?<\/\1>/g;
const attr = (x) => String(x).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const moreLink = (p) => '<p><a href="' + attr(p.url) + '" target="_blank">' + attr(p.title) + ' …</a></p>';
// parts = [{ html, url, title, key }] in source order -> { text, full, cut } (cut = the key of the section where the text stops, null when it fits whole)
function fitParts(parts, max) {
  const all = parts.map((p) => p.html).join(''); if (all.length <= max) return { text: all, full: all.length, cut: null };
  const blocks = []; parts.forEach((p) => { const b = p.html.match(BLOCK_RE) || []; if (b.join('') !== p.html) throw new Error('F7: section ' + p.key + ' is not whole blocks'); b.forEach((x) => blocks.push({ x, p })); });
  let out = '', i = 0;
  for (; i < blocks.length; i++) { const next = blocks[i + 1]; if ((out + blocks[i].x + (next ? moreLink(next.p) : '')).length > max) break; out += blocks[i].x; }
  if (i === 0) throw new Error('F7: the first block of ' + blocks[0].p.key + ' alone is over ' + max);
  return { text: out + moreLink(blocks[i].p), full: all.length, cut: blocks[i].p.key };
}
const fitLog = (id, lang, f) => { if (f.cut) console.log('§CTXHELP_FIT help=' + id + ' lang=' + lang + ' full=' + f.full + ' kept=' + f.text.length + ' cut_at=' + f.cut + ' max=' + msgLen()); };
// one help per distinct section list: every tab / process -> the sections that name it, in SECTIONS order; the targets with the same list share the help
function buildHelps(sections) {
  const by = {}, order = [];
  sections.forEach((s) => { s.tabs.map((t) => ['T' + t.tab, t]).concat(s.processes.map((p) => ['P' + p, p])).forEach(([k, v]) => { if (!by[k]) { by[k] = { v, keys: [] }; order.push(k); } by[k].keys.push(s.key); }); });
  const helps = [], at = {};
  order.forEach((k) => { const sig = by[k].keys.join('+'); if (at[sig] == null) { at[sig] = helps.length; helps.push({ keys: by[k].keys, sections: by[k].keys.map((x) => sections.find((s) => s.key === x)), tabs: [], processes: [] }); }
    const h = helps[at[sig]]; if (k[0] === 'T') h.tabs.push(by[k].v); else h.processes.push(by[k].v); });
  const ids = assignIds(helps.map((h) => h.keys));
  helps.forEach((h) => { h.id = ids[h.keys.join('+')]; h.name = h.sections.map((s) => s.name).join(' + '); if (h.name.length > 120) throw new Error('AD_CtxHelp.Name is 120 long: ' + h.name);
    h.parts = h.sections.map((s) => titleP(s.name) + s.html); const f = fitParts(h.sections.map((s, i) => ({ html: h.parts[i], url: s.url, title: s.name, key: s.key })), msgLen()); fitLog(h.id, 'en_US', f); h.msgtext = f.text; h.time = h.sections.map((s) => s.time).sort().pop(); });
  return helps.sort((a, b) => a.id - b.id);
}
// §19.16 C2 (VOCAB_MESSAGE_CATALOG): the same how-to rows in LEGACY's shape — AD_CtxHelp (CtxType T) + AD_CtxHelpMsg, linked from the window's first tab
//   (AD_Tab.AD_CtxHelp_ID, the column legacy's MCtxHelpMsg.getCtxHelpID reads for CTXTYPE_Tab). App-own ids 1000000+ (the twin gives a new record -opId). Written to
//   erp/ad_ctxhelp_app_rows.js, applied by the ONE boot overlay (ad_ctxhelp_overlay.js) after legacy's rows; INSERT OR IGNORE, and the link only when the tab has none,
//   so a re-applied overlay never overwrites an edit. Outside the hashed patches (Team BASE hash).
const APP_ID0 = 1000000;
function uuidOf(name) {   // RFC 4122 name-based (v5, SHA-1, URL namespace): the same row gets the same _UU on every rebuild
  const ns = Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex'), h = require('crypto').createHash('sha1').update(Buffer.concat([ns, Buffer.from('kernel-erp:' + name, 'utf8')])).digest();
  h[6] = (h[6] & 0x0f) | 0x50; h[8] = (h[8] & 0x3f) | 0x80; const x = h.subarray(0, 16).toString('hex');
  return x.slice(0, 8) + '-' + x.slice(8, 12) + '-' + x.slice(12, 16) + '-' + x.slice(16, 20) + '-' + x.slice(20);
}
const titleP = (name) => '<p><strong>' + md(name) + '</strong></p>';   // §19.16 C3: the title is MsgText's first paragraph (legacy's own fallback shape, HelpController.renderCtxHelp:345-347); AD_CtxHelp.Name has no _Trl and is never shown
// §19.16 C3: read a legacy Translation XML of AD_CtxHelpMsg_Trl - CDATA and xml:space aware (parseTrl's regex is not) -> { id: { trl, original, text } }
function readCtxTrl(file) {
  const out = {}; if (!fs.existsSync(file)) return out;
  const x = fs.readFileSync(file, 'utf8'), rowRe = /<row id="(\d+)"([^>]*)>([\s\S]*?)<\/row>/g;
  let m; while ((m = rowRe.exec(x))) {
    const v = /<value column="MsgText"([^>]*?)(?:\/>|>([\s\S]*?)<\/value>)/.exec(m[3]); if (!v) continue;
    const orig = (/original="([^"]*)"/.exec(v[1]) || [])[1] || '', body = v[2] || '', cd = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(body);
    out[m[1]] = { trl: ((/trl="([YN])"/.exec(m[2]) || [])[1]) || 'N', original: ent(orig), text: cd ? cd[1] : ent(body) };
  }
  return out;
}
const MACHINE_DIR = path.join(ERP, 'i18n', 'machine');
const machineCtxFile = (lang) => path.join(MACHINE_DIR, 'AD_CtxHelpMsg_Trl_' + lang + '.xml');
const linkParas = (html, link) => { const m = /^(<p><strong>[\s\S]*?<\/strong><\/p>)([\s\S]*)$/.exec(html), head = m ? m[1] : '', rest = m ? m[2] : html; return head + (rest.match(/<(p|ul)>[\s\S]*?<\/(p|ul)>/g) || []).map((x) => x.startsWith('<ul>') ? link(x) : '<p>' + link(x.slice(3, -4)) + '</p>').join(''); };
// per language, per English message (legacy's + ours): a translated PUBLISHED row of the message wins (i18n_sources.json order); else, for our helps, the machine rows:
//   §19.17 F5: a machine row translates ONE section (its trlId), so the help's text is built section by section - the machine text where there is one (linked with that
//   language's window names), the English section where there is none (translations are frozen while the content grows; nothing may vanish for a translated screen).
function buildCtxTrl(lang, legacyIds, helps, link) {
  const pub = [].concat(...SOURCES[lang].map((d) => trlFiles(d, 'AD_CtxHelpMsg').map(readCtxTrl))), mach = readCtxTrl(machineCtxFile(lang)), out = [];
  const tr = (r) => r && norm(r.text) !== '' && norm(r.text) !== norm(r.original);
  const published = (id) => { const p = pub.find((x) => tr(x[id])); if (p) out.push({ id, lang, source: 'published', istranslated: p[id].trl, text: p[id].text }); return !!p; };
  legacyIds.forEach(published);
  helps.forEach((h) => {
    if (published(h.id) || !h.sections.some((s) => tr(mach[s.trlId]))) return;
    // §19.17 F7: each language fitted on its own text; a translated section's link carries its translated title
    const parts = h.sections.map((s, i) => { const t = tr(mach[s.trlId]) ? linkParas(mach[s.trlId].text, link) : h.parts[i], m = /^<p><strong>([\s\S]*?)<\/strong><\/p>/.exec(t); return { html: t, url: s.url, title: m ? ent(m[1].replace(/<[^>]+>/g, '')) : s.name, key: s.key, own: tr(mach[s.trlId]) }; })
      // §19.19: the sections in the reader's language FIRST, then the English ones (in source order each): new English content never pushes out text already translated
      .sort((a, b) => (b.own ? 1 : 0) - (a.own ? 1 : 0));
    const f = fitParts(parts, msgLen()); fitLog(h.id, lang, f);
    out.push({ id: h.id, lang, source: 'machine', istranslated: 'N', text: f.text, parts });   // parts (unfitted): the legacy script fits them at apply time (§19.17 F6)
  });
  return out;
}
function buildCtxHelpRows(helps, trl) {
  const lit = (v) => v == null ? 'NULL' : typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'", rows = [], links = [], timeOf = {};
  const ins = (table, o) => 'INSERT OR IGNORE INTO ' + table + ' (' + Object.keys(o).join(', ') + ') VALUES (' + Object.keys(o).map((k) => lit(o[k])).join(', ') + ')';
  helps.forEach((h) => {
    const id = h.id, t = h.time; timeOf[id] = t;
    rows.push(ins('ad_ctxhelp', { ad_client_id: 0, ad_ctxhelp_id: id, ad_ctxhelp_uu: uuidOf('ad_ctxhelp|' + id), ad_org_id: 0, created: t, createdby: 100, ctxtype: h.tabs.length ? 'T' : 'P', description: (h.sections.find((x) => x.doc !== 'DV') || h.sections[0]).url, isactive: 'Y', name: h.name, updated: t, updatedby: 100 }));
    rows.push(ins('ad_ctxhelpmsg', { ad_client_id: 0, ad_ctxhelp_id: id, ad_ctxhelpmsg_id: id, ad_ctxhelpmsg_uu: uuidOf('ad_ctxhelpmsg|' + id), ad_org_id: 0, created: t, createdby: 100, isactive: 'Y', line: null, msgtext: h.msgtext, updated: t, updatedby: 100 }));
    h.tabs.forEach((x) => rows.push('UPDATE ad_tab SET ad_ctxhelp_id=' + id + ' WHERE ad_tab_id=' + x.tab + ' AND ad_ctxhelp_id IS NULL'));
    h.processes.forEach((pid) => rows.push('UPDATE ad_process SET ad_ctxhelp_id=' + id + ' WHERE ad_process_id=' + pid + ' AND ad_ctxhelp_id IS NULL'));
    links.push({ help: id, name: h.name, sections: h.keys, tabs: h.tabs, processes: h.processes });
  });
  const t0 = guideTime('UG');   // legacy's own message (200000) has no guide: its translation rows keep the user guide's time, as before
  (trl || []).forEach((r) => { const t = timeOf[r.id] || t0; rows.push(ins('ad_ctxhelpmsg_trl', { ad_client_id: 0, ad_ctxhelpmsg_id: r.id, ad_ctxhelpmsg_trl_uu: uuidOf('ad_ctxhelpmsg_trl|' + r.id + '|' + r.lang), ad_language: r.lang, ad_org_id: 0, created: t, createdby: 100, isactive: 'Y', istranslated: r.istranslated, msgtext: r.text, updated: t, updatedby: 100 })); });
  const trlBy = {}; (trl || []).forEach((r) => { trlBy[r.lang + ':' + r.source] = (trlBy[r.lang + ':' + r.source] || 0) + 1; });
  const L = { spec: 'bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.16 C2, §19.17 F5', source: Object.keys(DOCS).map((d) => DOCS[d].file).join(' + ') + ' (build_help_pack.js SECTIONS)', links, rows };
  fs.writeFileSync(path.join(ERP, 'ad_ctxhelp_app_rows.js'), '// GENERATED by erp/tools/build_help_pack.js from ' + Object.keys(DOCS).map((d) => DOCS[d].file).join(' and ') + ' - do not edit by hand. Applied by ad_ctxhelp_overlay.js after legacy\'s rows (boot overlay, outside the team base hash).\n' +
    '(function (g) { var L = ' + JSON.stringify(L, null, 0).replace(/,"rows":\[/, ',\n"rows": [\n').replace(/","(INSERT|UPDATE)/g, '",\n"$1') + ';\n  if (typeof module !== "undefined" && module.exports) module.exports = L; g.AD_CTXHELP_APP_ROWS = L; })(typeof window !== "undefined" ? window : globalThis);\n');
  console.log('§CTXHELP_APP_ROWS helps=' + helps.length + ' sections=' + helps.reduce((a, h) => a + h.keys.length, 0) + ' statements=' + rows.length + ' trl=' + (trl || []).length + ' ' + JSON.stringify(trlBy) + ' links=' + links.map((x) => x.help + '[' + x.sections.join('+') + ']:' + x.tabs.map((y) => y.window + '>' + y.tab).concat(x.processes.map((y) => 'P' + y)).join('+')).join(',') + ' time=' + JSON.stringify(Object.keys(DOCS).map((d) => guideTime(d))));
}
// §12 H1b: the names of the language, from its own published XML (first source wins, translated = present and not the English original):
//   windows (AD_Window_Trl), tables (AD_Table_Trl), actions (AD_Ref_List_Trl of DocAction 135, by code), statuses (AD_Ref_List_Trl of DocStatus 131, by code).
function buildNames(lang) {
  const read = (table) => srcFiles(lang, table);
  const pick = (srcs, id) => { for (const s of srcs) { const r = s[String(id)]; if (r && translated(r.Name)) return r.Name[0].trim(); } return null; };
  const W = read('AD_Window'), T = read('AD_Table'), R = read('AD_Ref_List'), P = read('AD_Process'), out = { windows: {}, tables: {}, actions: {}, statuses: {}, processes: {} };
  q("SELECT ad_window_id wid FROM ad_window WHERE isactive='Y'").forEach((r) => { const n = pick(W, r.wid); if (n) out.windows[r.wid] = n; });
  q("SELECT ad_table_id tid FROM ad_table WHERE isactive='Y' AND ad_window_id IS NOT NULL").forEach((r) => { const n = pick(T, r.tid); if (n) out.tables[r.tid] = n; });
  q("SELECT ad_process_id pid FROM ad_process WHERE isactive='Y'").forEach((r) => { const n = pick(P, r.pid); if (n) out.processes[r.pid] = n; });   // §19.10 the process / report names (AD_Process_Trl), read as the window names are
  // §19.14 the form / workflow / info window / task menu entries: the name the MENU shows in this language (erp/menu_name.js, the menu's own rule, over the committed screen pack)
  const MN = require(path.join(ERP, 'menu_name.js')), sf = path.join(ERP, 'i18n', lang + '.json'), screen = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : null; out.menus = {};
  q("SELECT ad_menu_id id, action a, ad_window_id w, ad_process_id p, ad_form_id f, iscentrallymaintained c FROM ad_menu WHERE isactive='Y' AND issummary='N' AND action IN ('X','F','I','T')").forEach((r) => {
    const n = MN.of({ id: r.id, action: r.a, windowId: r.w, processId: r.p, formId: r.f }, screen, r.c === 'Y').name; if (n) out.menus[r.id] = n; });
  q("SELECT ad_ref_list_id rid, ad_reference_id ref, value v FROM ad_ref_list WHERE ad_reference_id IN (131,135) AND isactive='Y' AND value<>'--'").forEach((r) => { const n = pick(R, r.rid); if (n) out[r.ref === 135 ? 'actions' : 'statuses'][r.v] = n; });
  return out;
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
// §19.19 (VOCAB_MESSAGE_CATALOG, amended 2026-11-23): DERIVED how-to sections, one per window, from three named sources and nothing else:
//   the dictionary (ad_seed.db: what must exist first, the tabs, the action name), legacy's DocAction source (erp/tools/legacy_rules.json, legacy_rules.js:
//   the refusal messages of prepareIt/completeIt and the cited effects) and legacy's recorded run (erp/tools/legacy_run_facts.json, run_facts.js: which of those
//   a legacy run SHOWED, MATCH scenarios only). The wording around the facts is a fixed template; every name and message is read, never written.
//   A derived section comes FIRST in its help: it has no other home, while a guide section that is cut at MsgText's limit keeps its link to the guide (F7).
const DV_URL = 'https://red1oon.github.io/BIMCompiler/LegacyOracleAdapterSpec/';   // the parallel-run method page: where the legacy facts come from
const DV_PILOT = [143, 141];   // §19.19 pilot: Sales Order (a document) and Payment Term (a setup window)
// the CORE menu (owner 2026-10-04: trade cycle + accounting) = these legacy menu folders and everything under them (AD_TreeNodeMM)
const CORE_MENU = [166, 203, 236, 183, 278, 280, 164, 165, 167];
const readJson = (f) => { const p = path.join(__dirname, f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; };
function coreWindows() {
  return q('WITH RECURSIVE sub(node) AS (SELECT node_id FROM ad_treenodemm WHERE node_id IN (' + CORE_MENU.join(',') + ') UNION SELECT t.node_id FROM ad_treenodemm t JOIN sub s ON t.parent_id = s.node) ' +
    "SELECT DISTINCT m.ad_window_id w FROM sub s JOIN ad_menu m ON m.ad_menu_id = s.node WHERE m.issummary='N' AND m.isactive='Y' AND m.action='W' AND m.ad_window_id IS NOT NULL").map((r) => Number(r.w));
}
const winRow = (w) => q('SELECT name n, issotrx so FROM ad_window WHERE ad_window_id=' + Number(w))[0];
const headTab = (w) => q('SELECT t.ad_tab_id tab, t.ad_table_id tb, b.tablename tn FROM ad_tab t JOIN ad_table b ON b.ad_table_id=t.ad_table_id WHERE t.ad_window_id=' + Number(w) + " AND t.tablevel=0 AND t.isactive='Y' ORDER BY t.seqno, t.ad_tab_id LIMIT 1")[0];
const isDoc = (tb) => q('SELECT 1 x FROM ad_column WHERE ad_table_id=' + Number(tb) + " AND columnname='DocAction' AND isactive='Y'").length > 0;
// part 1 rule: a displayed, editable, mandatory reference field with no default (column or field), not the tenant / org / key / parent link
function mustExist(tab, sotrx) {
  return q('SELECT f.name fn, c.columnname cn, c.ad_reference_id r, c.ad_reference_value_id rv FROM ad_field f JOIN ad_column c ON c.ad_column_id=f.ad_column_id WHERE f.ad_tab_id=' + Number(tab) +
    " AND f.isactive='Y' AND f.isdisplayed='Y' AND c.isactive='Y' AND coalesce(nullif(f.ismandatory,''), c.ismandatory)='Y' AND c.isupdateable='Y' AND coalesce(f.isreadonly,'N')='N'" +
    " AND coalesce(c.iskey,'N')='N' AND coalesce(c.isparent,'N')='N' AND coalesce(c.defaultvalue,'')='' AND coalesce(f.defaultvalue,'')='' AND c.ad_reference_id IN (18,19,30)" +
    " AND c.columnname NOT IN ('AD_Client_ID','AD_Org_ID') ORDER BY f.seqno, f.ad_field_id").map((f) => {
    // legacy's reference rule: Table / Search with a value reference -> AD_Ref_Table; TableDir (or a bare Search) -> the table named by the column without _ID
    const viaRef = (Number(f.r) === 18 || Number(f.r) === 30) && f.rv != null ? q('SELECT ad_table_id t FROM ad_ref_table WHERE ad_reference_id=' + Number(f.rv))[0] : null;
    const t = viaRef ? q('SELECT ad_table_id t, ad_window_id w, po_window_id p FROM ad_table WHERE ad_table_id=' + Number(viaRef.t))[0]
      : q("SELECT ad_table_id t, ad_window_id w, po_window_id p FROM ad_table WHERE lower(tablename)=lower('" + String(f.cn).replace(/_ID$/i, '').replace(/'/g, "''") + "')")[0];
    const win = t ? (sotrx === 'N' && t.p != null ? Number(t.p) : t.w != null ? Number(t.w) : null) : null;
    return { field: String(f.fn), column: String(f.cn), table: t ? Number(t.t) : null, window: win, wname: win != null ? (winRow(win) || {}).n : null };
  });
}
const wlink = (id, name) => '<a href="#" data-help-win="' + id + '">' + md(String(name)) + '</a>';
const quote = (s) => '“' + md(s) + '”';
function derivedSections(ids, opts) {   // opts.facts / opts.rules: another copy of the two inputs (W-CTXHELP-DERIVED D3 feeds the facts with every verdict flipped)
  const R = (opts && opts.rules) || readJson('legacy_rules.json'), F = (opts && opts.facts) || readJson('legacy_run_facts.json'), core = coreWindows(), rows = [], vac = [];
  if (!R || !F) throw new Error('§19.19: erp/tools/legacy_rules.json and legacy_run_facts.json are needed (node erp/tools/legacy_rules.js; node erp/tools/run_facts.js --log ... --bridge ...)');
  const subOf = {}; q('SELECT c_doctype_id d, docsubtypeso s FROM c_doctype').forEach((r) => { subOf[r.d] = r.s; });
  const seen = (pred) => F.scenarios.filter((s) => s.verdict === 'MATCH' && pred(s));   // D3: MATCH only, so the twin is proved to do the same
  // a proof op on one legacy key: '>=1' / '==0' on a count; 'reserved=ordered' on the order-line quantities 'product:ordered/reserved/delivered/invoiced' (|-joined)
  const opOk = (v, op) => { if (op === 'reserved=ordered') { const l = String(v).split('|').map((x) => x.split(':')[1].split('/').map(Number)); return l.length > 0 && l.every((x) => x[0] !== 0 && x[1] === x[0]); }
    const n = Number(v); return op === '>=1' ? n >= 1 : op === '==0' ? n === 0 : false; };
  const coreDocs = core.map((w) => ({ w, h: headTab(w), r: winRow(w) })).filter((x) => x.h && x.r && isDoc(x.h.tb));
  ids.forEach((w) => {
    const W = winRow(w), H = headTab(w); if (!W || !H) throw new Error('§19.19: window ' + w + ' has no head tab');
    const doc = isDoc(H.tb), html = [], facts = [];
    // part 1: what must exist first (documents), or which core documents need this record (setup windows)
    const need = mustExist(H.tab, W.so);
    if (need.length) html.push('<p><b>Before you start.</b> These must exist first: ' + need.map((n) => n.window != null && n.wname ? (n.wname === n.field ? wlink(n.window, n.wname) : md(n.field) + ' (' + wlink(n.window, n.wname) + ')') : md(n.field)).join(', ') + '.</p>');
    else vac.push(w + ' part1 no-mandatory-reference');
    if (!doc) {
      const by = coreDocs.filter((d) => d.w !== w && mustExist(d.h.tab, d.r.so).some((n) => n.table === Number(H.tb)));
      if (by.length) html.push('<p><b>Needed by.</b> Each of these asks for one on its header: ' + by.map((d) => wlink(d.w, d.r.n)).join(', ') + '.</p>');
      else vac.push(w + ' part1 needed-by-none');
    }
    // part 2: the tabs in order, then the action that completes a document
    const tabs = q('SELECT name n FROM ad_tab WHERE ad_window_id=' + Number(w) + " AND isactive='Y' AND tablevel<=1 ORDER BY seqno, ad_tab_id").map((t) => '<b>' + md(String(t.n)) + '</b>');
    const co = doc ? (q("SELECT name n FROM ad_ref_list WHERE ad_reference_id=135 AND value='CO' AND isactive='Y'")[0] || {}).n : null;
    html.push('<p><b>Do it.</b> ' + (tabs.length > 1 ? 'Fill ' + tabs[0] + ', then ' + tabs.slice(1).join(', ') : 'Fill ' + tabs[0]) + (co ? '; then the Document Action <b>' + md(co) + '</b>.' : '.') + '</p>');
    if (doc) {
      const C = R.classes[H.tn], E = R.effects.filter((e) => e.table === H.tn);
      // part 3: what Complete does, per document subtype, from the cited source; ✓ when a MATCH legacy scenario of that subtype shows it
      const nm = (ref, v) => (q('SELECT name n FROM ad_ref_list WHERE ad_reference_id=' + ref + " AND value='" + v + "' AND isactive='Y'")[0] || {}).n || v;
      const fill = (t) => t.replace(/\{status:(\w+)\}/g, (m, v) => nm(131, v)).replace(/\{action:(\w+)\}/g, (m, v) => nm(135, v));
      if (E.length) {
        const li = E.map((e) => {
          const set = e.when === 'all' ? null : e.when;
          const runs = e.proof && set ? seen((s) => s.table === H.tn && s.legacy.outcome === 'COMPLETED' && set.indexOf(subOf[s.doctype]) >= 0 && s.legacy[e.proof.key] != null && opOk(s.legacy[e.proof.key], e.proof.op)) : [];
          facts.push({ part: 3, id: e.id, src: e.file + ':' + e.line, runs: runs.map((s) => s.id) });
          const who = set ? md(set.map((v) => R.subtypes[v] || v).join(', ')) + (e.flagName ? ' (' + md(e.flagName.subtype) + ' if <i>' + md(e.flagName.column) + '</i>)' : '') + ': ' : 'Then ';
          return '<li>' + who + md(fill(e.text)) + (runs.length ? ' ✓' : '') + '</li>';
        });
        html.push('<p><b>What Complete does.</b></p><ul>' + li.join('') + '</ul>');
      } else vac.push(w + ' part3 no-cited-effect');
      // part 4: legacy's own refusal messages: the source's prepareIt / completeIt messages, then those a legacy run showed (a validator / credit manager message is not a literal in the class)
      const runRef = seen((s) => s.table === H.tn && s.legacy.outcome === 'REJECTED' && s.refusal);
      const msgs = (C && C.refusals ? C.refusals.map((r) => ({ text: r.text, src: C.file + ':' + r.line })) : []);
      runRef.forEach((s) => { if (!msgs.some((m) => m.text === s.refusal.text)) msgs.push({ text: s.refusal.text, src: 'run' }); });
      if (msgs.length) {
        html.push('<p><b>When it refuses</b>, legacy says: ' + msgs.map((m) => { const r = runRef.filter((s) => s.refusal.text === m.text); facts.push({ part: 4, text: m.text, src: m.src, runs: r.map((s) => s.id) });
          return quote(m.text) + (r.length ? ' ✓' : ''); }).join('; ') + '.</p>');
      } else vac.push(w + ' part4 no-refusal-source');
    }
    html.push('<p><i>' + (doc ? 'Read from iDempiere\'s ' + md(R.classes[H.tn] ? R.classes[H.tn].file.split('/').pop() : H.tn) + ' and the dictionary. ✓ = seen in a legacy run of ' + F.logTime.slice(0, 10) + '.' : 'Read from the dictionary.') + '</i></p>');
    facts.forEach((f) => console.log('§CTXHELP_DERIVED_FACT window=' + w + ' part=' + f.part + ' ' + (f.id || JSON.stringify(f.text)) + ' src=' + f.src + ' runs=' + (f.runs.join(',') || '-')));
    rows.push({ key: 'DV' + w, doc: 'DV', trlId: null, name: String(W.n), time: (doc ? F.logTime : guideTime('UG')).replace('T', ' ').slice(0, 19), url: DV_URL, tabs: [{ window: Number(w), tab: Number(H.tab) }], processes: [], html: html.join('') });
  });
  console.log('§CTXHELP_DERIVED windows=' + ids.length + ' of core ' + core.length + ' sections=' + rows.length + ' facts_log=' + F.log + ' source=' + R.source.head.slice(0, 10) + ' ' + vac.map((v) => 'VACUOUS ' + v).join(' '));
  return rows;
}
function main() {
  const log = console.log; console.log = () => {}; const fsmCheck = require(path.join(ERP, 'ad_docfsm.js')); console.log = log; void fsmCheck;
  // the role's menu windows are not known at build time; the linker uses every active window of the seed (the page drops a link whose window is not on the menu)
  const windows = q("SELECT ad_window_id wid, name wnm FROM ad_window WHERE isactive='Y'").map((w) => ({ id: Number(w.wid), name: String(w.wnm) }));   // aliases differ from column names: sqlite3 -json keeps a same-named column's own case
  fs.mkdirSync(path.join(OUT, 'en_US'), { recursive: true });
  const sections = derivedSections(DV_PILOT).concat(buildSections(windows)), helps = buildHelps(sections);   // §19.19: derived first (no other home)
  const en = { lang: 'en_US', spec: 'bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §10', built: 'build_help_pack.js', actions: buildActions() };   // §19.16 C4: no `howto` here: it is legacy's context help (ad_ctxhelp_app_rows.js), read by erp/ctx_help.js
  fs.writeFileSync(path.join(OUT, 'en_US', 'help.json'), JSON.stringify(en));
  const legacyIds = require(path.join(ERP, 'ad_ctxhelp_rows.js')).rows.filter((x) => /^INSERT OR IGNORE INTO ad_ctxhelpmsg \(/.test(x)).map((x) => Number(/VALUES \(\d+, \d+, (\d+),/.exec(x)[1])), allTrl = [];
  console.log('§HELP_PACK en_US how-to sections=' + sections.length + ' ' + JSON.stringify(sections.reduce((a, r) => { a[r.doc] = (a[r.doc] || 0) + 1; return a; }, {})) + ' helps=' + helps.length + ' (to the context help, not help.json) links=' + sections.reduce((a, r) => a + (r.html.match(/data-help-win=/g) || []).length, 0) + ' actions=' + Object.keys(en.actions).length + ' bytes=' + fs.statSync(path.join(OUT, 'en_US', 'help.json')).size);
  Object.keys(SOURCES).forEach((lang) => {
    const b = buildFields(lang); fs.mkdirSync(path.join(OUT, lang), { recursive: true });
    const f = path.join(OUT, lang, 'help.json');
    // each distinct text once: fields[id] = [descIndex, helpIndex] into texts (-1 = none) — 3,374 distinct texts carry 14,961 German fields (PERF BUDGET: no duplicate buffers)
    const texts = [], ix = new Map(), fields = {};
    const at = (t) => { if (t == null) return -1; if (!ix.has(t)) { ix.set(t, texts.length); texts.push(t); } return ix.get(t); };
    Object.keys(b.fields).forEach((id) => { fields[id] = b.fields[id].map(at); });
    // §19.17 F4: tabs[id] / processes[id] = [descIndex, helpIndex], the same texts array
    const TB = buildRecTrl(lang, 'AD_Tab', "SELECT ad_tab_id id FROM ad_tab WHERE isactive='Y'"), PR = buildRecTrl(lang, 'AD_Process', "SELECT ad_process_id id FROM ad_process WHERE isactive='Y'"), tabs = {}, processes = {};
    Object.keys(TB.recs).forEach((id) => { tabs[id] = TB.recs[id].map(at); }); Object.keys(PR.recs).forEach((id) => { processes[id] = PR.recs[id].map(at); });
    const names = buildNames(lang), wlink = linker(Object.keys(names.windows).map((id) => ({ id: Number(id), name: names.windows[id], whole: true })));   // a TRANSLATED row links a window name only as a whole bold term, in every language (CJK has no case: 菜单 'menu'; German nouns are all capitalised: 'Produkt')
    const trl = buildCtxTrl(lang, legacyIds, helps, wlink); allTrl.push(...trl);
    fs.writeFileSync(f, JSON.stringify({ lang, spec: en.spec, sources: SOURCES[lang], texts, fields, tabs, processes, names }));
    console.log('§HELP_PACK ' + lang + ' fields=' + b.n + ' of ' + b.total + ' tabs=' + TB.n + ' processes-help=' + PR.n + ' texts=' + texts.length + ' stale-original=' + b.stale + ' names windows=' + Object.keys(names.windows).length + ' tables=' + Object.keys(names.tables).length +
      ' ctxtrl=' + trl.length + ' actions=' + Object.keys(names.actions).length + ' statuses=' + Object.keys(names.statuses).length + ' processes=' + Object.keys(names.processes).length + ' menus=' + Object.keys(names.menus).length + ' bytes=' + fs.statSync(f).size);
  });
  buildCtxHelpRows(helps, allTrl);
  buildLegacySql(helps, allTrl);
}

// §19.17 F6 (owner 2026-11-22: "let legacy has the harmless CMS ... via migration scripts", "Copy own text in"): the SAME helps as ONE PostgreSQL script for a legacy site's
//   migration/local_sql/postgresql/ (applied by RUN_SyncDB, legacy's migration/local_sql/README.txt). Legacy's code and tables are untouched; only rows in its own tables.
//   - one AD_CtxHelp + AD_CtxHelpMsg PER TARGET (tab / process): its message starts with that record's OWN Name / Description / Help, built at APPLY time from the site's
//     AD_Tab (AD_Process) and, per site language, AD_Tab_Trl (AD_Process_Trl), as legacy's HelpController.renderCtxHelp draws them (:338-364), then <hr>, then our blocks;
//   - the F7 rule in SQL: whole blocks while dictionary + blocks + the guide link fit the site's own AD_Column.FieldLength of MsgText;
//   - every row keyed on its UUID (a site's ids start at 1000000, as ours: fixed ids would collide): COALESCE(the row's id, nextidfunc) + ON CONFLICT (uu) DO UPDATE only
//     when the text differs, so a second apply changes nothing; a tab / process that already has a help keeps it (AD_CtxHelp_ID IS NULL guard).
const LEGACY_DIR = path.join(ERP, 'legacy', 'local_sql', 'postgresql');
const lit = (x) => x == null ? 'NULL' : "'" + String(x).replace(/'/g, "''") + "'";
function buildLegacySql(helps, trl) {
  const seq = (t) => "nextidfunc((SELECT AD_Sequence_ID FROM AD_Sequence WHERE Name='" + t + "' AND IsTableID='Y')::integer, 'N')";
  const lim = (t) => "(SELECT c.FieldLength FROM AD_Column c JOIN AD_Table tb ON tb.AD_Table_ID=c.AD_Table_ID WHERE tb.TableName='" + t + "' AND c.ColumnName='MsgText')";
  const dict = (a) => "'<p><strong>' || " + a + ".Name || '</strong></p>' || COALESCE('<p><em>' || NULLIF(" + a + ".Description, '') || '</em></p>', '') || COALESCE('<p>' || NULLIF(" + a + ".Help, '') || '</p>', '') || '<hr>'";
  const fit = (d, l, m) => "(SELECT x.dict || COALESCE(string_agg(b.html, '' ORDER BY b.k) FILTER (WHERE b.k <= x.j), '') || COALESCE(max(b.more) FILTER (WHERE b.k = x.j + 1), '')" +
    " FROM (SELECT y.dict, y.l, COALESCE((SELECT min(c.k) FROM (SELECT k, sum(length(html)) OVER (ORDER BY k) AS cum, nextlen FROM blk WHERE lang = y.l) c WHERE length(y.dict) + c.cum + c.nextlen > y.lim) - 1, (SELECT max(k) FROM blk WHERE lang = y.l)) AS j" +
    " FROM (SELECT " + d + " AS dict, " + l + " AS l, " + m + " AS lim) y) x JOIN blk b ON b.lang = x.l GROUP BY x.dict, x.j)";
  // §19.17 F6.1: the twin's window / process links (<a href="#" data-help-win|proc>) do nothing in legacy (no handler): there they are a plain bold term; the guide links (https) stay
  const unlink = (h) => h.replace(/<a [^>]*data-help-(?:win|proc)="[^"]*"[^>]*>([\s\S]*?)<\/a>/g, '<b>$1</b>');
  const blocksOf = (parts) => { const bl = []; parts.forEach((pp) => (unlink(pp.html).match(BLOCK_RE) || []).forEach((x) => bl.push({ x, p: pp }))); return bl; };
  const out = [], targets = [];
  helps.forEach((h) => {
    const langs = [['en', h.sections.map((sx, i) => ({ html: h.parts[i], url: sx.url, title: sx.name, key: sx.key }))]].concat(trl.filter((r) => r.id === h.id && r.source === 'machine' && r.parts).map((r) => [r.lang, r.parts]));
    const vals = []; langs.forEach(([lg, parts]) => { const bl = blocksOf(parts); bl.forEach((b, i) => { const nx = bl[i + 1]; vals.push('(' + lit(lg) + ', ' + (i + 1) + ', ' + lit(b.x) + ', ' + lit(moreLink(b.p)) + ', ' + (nx ? moreLink(nx.p).length : 0) + ')'); }); });
    const blk = 'WITH blk(lang, k, html, more, nextlen) AS (VALUES\n  ' + vals.join(',\n  ') + ')\n';
    h.tabs.map((t) => ({ kind: 'T', id: t.tab, T: 'AD_Tab', name: (q('SELECT name n FROM ad_tab WHERE ad_tab_id=' + Number(t.tab))[0] || {}).n }))
      .concat(h.processes.map((pid) => ({ kind: 'P', id: pid, T: 'AD_Process', name: (q('SELECT name n FROM ad_process WHERE ad_process_id=' + Number(pid))[0] || {}).n }))).forEach((g) => {
      const huu = uuidOf('legacy|ad_ctxhelp|' + g.kind + g.id), muu = uuidOf('legacy|ad_ctxhelpmsg|' + g.kind + g.id), url = (h.sections.find((x) => x.doc !== 'DV') || h.sections[0]).url;
      const name = h.tabs.length + h.processes.length > 1 ? h.name + ' (' + g.name + ')' : h.name; if (name.length > 120) throw new Error('F6: AD_CtxHelp.Name is 120 long: ' + name);
      targets.push({ kind: g.kind, id: g.id, help: h.id, huu, muu, sections: h.keys, langs: langs.map((x) => x[0]) });
      out.push('-- ' + (g.kind === 'T' ? 'tab' : 'process') + ' ' + g.id + ' ' + g.name + ': ' + h.keys.join(' + ') + ' (twin help ' + h.id + ')',
        'INSERT INTO AD_CtxHelp (AD_CtxHelp_ID, AD_CtxHelp_UU, AD_Client_ID, AD_Org_ID, Created, CreatedBy, Updated, UpdatedBy, IsActive, CtxType, Name, Description)\n' +
        'SELECT COALESCE((SELECT AD_CtxHelp_ID FROM AD_CtxHelp WHERE AD_CtxHelp_UU=' + lit(huu) + '), ' + seq('AD_CtxHelp') + '), ' + lit(huu) + ", 0, 0, now(), 100, now(), 100, 'Y', '" + g.kind + "', " + lit(name) + ', ' + lit(url) + '\n' +
        'ON CONFLICT (AD_CtxHelp_UU) DO UPDATE SET Name=EXCLUDED.Name, Description=EXCLUDED.Description, Updated=now() WHERE (AD_CtxHelp.Name, AD_CtxHelp.Description) IS DISTINCT FROM (EXCLUDED.Name, EXCLUDED.Description);',
        blk + 'INSERT INTO AD_CtxHelpMsg (AD_CtxHelpMsg_ID, AD_CtxHelpMsg_UU, AD_CtxHelp_ID, AD_Client_ID, AD_Org_ID, Created, CreatedBy, Updated, UpdatedBy, IsActive, MsgText)\n' +
        'SELECT COALESCE((SELECT AD_CtxHelpMsg_ID FROM AD_CtxHelpMsg WHERE AD_CtxHelpMsg_UU=' + lit(muu) + '), ' + seq('AD_CtxHelpMsg') + '), ' + lit(muu) + ", toRecordId('AD_CtxHelp', " + lit(huu) + "), 0, 0, now(), 100, now(), 100, 'Y', " +
        fit(dict('r'), "'en'", lim('AD_CtxHelpMsg')) + '\nFROM ' + g.T + ' r WHERE r.' + g.T + '_ID=' + g.id + '\n' +
        'ON CONFLICT (AD_CtxHelpMsg_UU) DO UPDATE SET MsgText=EXCLUDED.MsgText, Updated=now() WHERE AD_CtxHelpMsg.MsgText IS DISTINCT FROM EXCLUDED.MsgText;',
        blk + 'INSERT INTO AD_CtxHelpMsg_Trl (AD_CtxHelpMsg_ID, AD_Language, AD_CtxHelpMsg_Trl_UU, AD_Client_ID, AD_Org_ID, Created, CreatedBy, Updated, UpdatedBy, IsActive, IsTranslated, MsgText)\n' +
        "SELECT toRecordId('AD_CtxHelpMsg', " + lit(muu) + "), r.AD_Language, generate_uuid(), 0, 0, now(), 100, now(), 100, 'Y', 'N', " +
        fit(dict('r'), "CASE WHEN EXISTS (SELECT 1 FROM blk WHERE lang = r.AD_Language) THEN r.AD_Language ELSE 'en' END", lim('AD_CtxHelpMsg_Trl')) + '\nFROM ' + g.T + '_Trl r WHERE r.' + g.T + '_ID=' + g.id + '\n' +
        'ON CONFLICT (AD_CtxHelpMsg_ID, AD_Language) DO UPDATE SET MsgText=EXCLUDED.MsgText, Updated=now() WHERE AD_CtxHelpMsg_Trl.MsgText IS DISTINCT FROM EXCLUDED.MsgText;',
        'UPDATE ' + g.T + " SET AD_CtxHelp_ID=toRecordId('AD_CtxHelp', " + lit(huu) + '), Updated=now() WHERE ' + g.T + '_ID=' + g.id + ' AND AD_CtxHelp_ID IS NULL;', '');
    });
  });
  const ts = helps.map((h) => h.time).sort().pop().replace(/[^0-9]/g, '').slice(0, 12), file = path.join(LEGACY_DIR, ts + '_KernelERP_ContextHelp.sql');
  fs.mkdirSync(LEGACY_DIR, { recursive: true }); fs.readdirSync(LEGACY_DIR).filter((f) => /_KernelERP_ContextHelp\.sql$/.test(f) && path.join(LEGACY_DIR, f) !== file).forEach((f) => fs.unlinkSync(path.join(LEGACY_DIR, f)));
  const head = ['-- GENERATED by bim-ootb erp/tools/build_help_pack.js (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.17 F6) - do not edit by hand.',
    '-- Kernel ERP how-to topics as iDempiere Context Help, from docs/ERPUserGuide.md and docs/ERP_FirstSetup.md (https://red1oon.github.io/BIMCompiler/).',
    '-- Apply: copy to <idempiere>/migration/local_sql/postgresql/ and run RUN_SyncDB. Adds rows to AD_CtxHelp, AD_CtxHelpMsg, AD_CtxHelpMsg_Trl and sets AD_CtxHelp_ID on the',
    '-- ' + targets.length + ' tabs / processes below only where it is empty. Each message starts with that tab\'s own Name / Description / Help in each of your languages, read here from',
    '-- your dictionary. Rows are keyed on the UUIDs below; applying it again changes nothing. A newer file of this name updates the same rows.', ''];
  fs.writeFileSync(file, head.concat(out).join('\n'));
  fs.writeFileSync(path.join(ERP, 'legacy', 'ctxhelp_targets.json'), JSON.stringify({ spec: '§19.17 F6', file: path.relative(ERP, file), targets }, null, 1) + '\n');   // the witness's denominator
  console.log('§CTXHELP_LEGACY_SQL file=' + path.relative(ROOT, file) + ' targets=' + targets.length + ' (' + targets.filter((t) => t.kind === 'T').length + ' tabs, ' + targets.filter((t) => t.kind === 'P').length + ' processes) statements=' + (out.length - targets.length * 2) + ' bytes=' + fs.statSync(file).size + ' langs=' + JSON.stringify([...new Set([].concat(...targets.map((t) => t.langs)))]));
}
// §19.10: the witnesses read the SAME source list (W-HQ-PROC-NAMES), never a copy of it
if (require.main === module) main(); else module.exports = { SOURCES, CACHE, md, readCtxTrl, titleP, machineCtxFile, SECTIONS, DOCS, derivedSections, DV_PILOT, coreWindows, mustExist, headTab, isDoc };
