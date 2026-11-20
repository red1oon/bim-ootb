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
// one help per distinct section list: every tab / process -> the sections that name it, in SECTIONS order; the targets with the same list share the help
function buildHelps(sections) {
  const by = {}, order = [];
  sections.forEach((s) => { s.tabs.map((t) => ['T' + t.tab, t]).concat(s.processes.map((p) => ['P' + p, p])).forEach(([k, v]) => { if (!by[k]) { by[k] = { v, keys: [] }; order.push(k); } by[k].keys.push(s.key); }); });
  const helps = [], at = {};
  order.forEach((k) => { const sig = by[k].keys.join('+'); if (at[sig] == null) { at[sig] = helps.length; helps.push({ keys: by[k].keys, sections: by[k].keys.map((x) => sections.find((s) => s.key === x)), tabs: [], processes: [] }); }
    const h = helps[at[sig]]; if (k[0] === 'T') h.tabs.push(by[k].v); else h.processes.push(by[k].v); });
  const ids = assignIds(helps.map((h) => h.keys));
  helps.forEach((h) => { h.id = ids[h.keys.join('+')]; h.name = h.sections.map((s) => s.name).join(' + '); if (h.name.length > 120) throw new Error('AD_CtxHelp.Name is 120 long: ' + h.name);
    h.parts = h.sections.map((s) => titleP(s.name) + s.html); h.msgtext = h.parts.join(''); h.time = h.sections.map((s) => s.time).sort().pop(); });
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
    out.push({ id: h.id, lang, source: 'machine', istranslated: 'N', text: h.sections.map((s, i) => tr(mach[s.trlId]) ? linkParas(mach[s.trlId].text, link) : h.parts[i]).join('') });
  });
  return out;
}
function buildCtxHelpRows(helps, trl) {
  const lit = (v) => v == null ? 'NULL' : typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'", rows = [], links = [], timeOf = {};
  const ins = (table, o) => 'INSERT OR IGNORE INTO ' + table + ' (' + Object.keys(o).join(', ') + ') VALUES (' + Object.keys(o).map((k) => lit(o[k])).join(', ') + ')';
  helps.forEach((h) => {
    const id = h.id, t = h.time; timeOf[id] = t;
    rows.push(ins('ad_ctxhelp', { ad_client_id: 0, ad_ctxhelp_id: id, ad_ctxhelp_uu: uuidOf('ad_ctxhelp|' + id), ad_org_id: 0, created: t, createdby: 100, ctxtype: h.tabs.length ? 'T' : 'P', description: h.sections[0].url, isactive: 'Y', name: h.name, updated: t, updatedby: 100 }));
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
function main() {
  const log = console.log; console.log = () => {}; const fsmCheck = require(path.join(ERP, 'ad_docfsm.js')); console.log = log; void fsmCheck;
  // the role's menu windows are not known at build time; the linker uses every active window of the seed (the page drops a link whose window is not on the menu)
  const windows = q("SELECT ad_window_id wid, name wnm FROM ad_window WHERE isactive='Y'").map((w) => ({ id: Number(w.wid), name: String(w.wnm) }));   // aliases differ from column names: sqlite3 -json keeps a same-named column's own case
  fs.mkdirSync(path.join(OUT, 'en_US'), { recursive: true });
  const sections = buildSections(windows), helps = buildHelps(sections);
  const en = { lang: 'en_US', spec: 'bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §10', built: 'build_help_pack.js', actions: buildActions() };   // §19.16 C4: no `howto` here: it is legacy's context help (ad_ctxhelp_app_rows.js), read by erp/ctx_help.js
  fs.writeFileSync(path.join(OUT, 'en_US', 'help.json'), JSON.stringify(en));
  const legacyIds = require(path.join(ERP, 'ad_ctxhelp_rows.js')).rows.filter((x) => /^INSERT OR IGNORE INTO ad_ctxhelpmsg \(/.test(x)).map((x) => Number(/VALUES \(\d+, \d+, (\d+),/.exec(x)[1])), allTrl = [];
  console.log('§HELP_PACK en_US how-to sections=' + sections.length + ' ' + JSON.stringify(sections.reduce((a, r) => { a[r.doc] = (a[r.doc] || 0) + 1; return a; }, {})) + ' helps=' + helps.length + ' (to the context help, not help.json) links=' + sections.reduce((a, r) => a + (r.html.match(/data-help-win=/g) || []).length, 0) + ' actions=' + Object.keys(en.actions).length + ' bytes=' + fs.statSync(path.join(OUT, 'en_US', 'help.json')).size);
  Object.keys(SOURCES).forEach((lang) => {
    const b = buildFields(lang); fs.mkdirSync(path.join(OUT, lang), { recursive: true });
    const f = path.join(OUT, lang, 'help.json');
    // each distinct text once: fields[id] = [descIndex, helpIndex] into texts (-1 = none) — 3,374 distinct texts carry 14,961 German fields (PERF BUDGET: no duplicate buffers)
    const texts = [], ix = new Map(), fields = {};
    Object.keys(b.fields).forEach((id) => { fields[id] = b.fields[id].map((t) => { if (t == null) return -1; if (!ix.has(t)) { ix.set(t, texts.length); texts.push(t); } return ix.get(t); }); });
    const names = buildNames(lang), wlink = linker(Object.keys(names.windows).map((id) => ({ id: Number(id), name: names.windows[id], whole: true })));   // a TRANSLATED row links a window name only as a whole bold term, in every language (CJK has no case: 菜单 'menu'; German nouns are all capitalised: 'Produkt')
    const trl = buildCtxTrl(lang, legacyIds, helps, wlink); allTrl.push(...trl);
    fs.writeFileSync(f, JSON.stringify({ lang, spec: en.spec, sources: SOURCES[lang], texts, fields, names }));
    console.log('§HELP_PACK ' + lang + ' fields=' + b.n + ' of ' + b.total + ' texts=' + texts.length + ' stale-original=' + b.stale + ' names windows=' + Object.keys(names.windows).length + ' tables=' + Object.keys(names.tables).length +
      ' ctxtrl=' + trl.length + ' actions=' + Object.keys(names.actions).length + ' statuses=' + Object.keys(names.statuses).length + ' processes=' + Object.keys(names.processes).length + ' menus=' + Object.keys(names.menus).length + ' bytes=' + fs.statSync(f).size);
  });
  buildCtxHelpRows(helps, allTrl);
}
// §19.10: the witnesses read the SAME source list (W-HQ-PROC-NAMES), never a copy of it
if (require.main === module) main(); else module.exports = { SOURCES, CACHE, md, readCtxTrl, titleP, machineCtxFile, SECTIONS, DOCS };
