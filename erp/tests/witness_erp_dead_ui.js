// ⚠ DO NOT REMOVE — Scope guard
// W-ERP-DEAD-UI — retire the code of the OLD ERP screen engine (erp/ad_ui.js window/tab/table-overlay/help/
// charts engine, erp/ad_charts.js bar/pie/overlay/completeness) that NO live entry can reach. Node only, no browser.
// READ THE LOG after every run (exit code alone is not evidence).  Spec: scratchpad ERPUI_RESULT.md /
// bim-compiler prompts/CODE_HYGIENE_REVIEW_2026-11.md C3+C4.  erp.html STAYS (bubble launcher, §IDEMPIERE-ROUTE).
//
// ISSUES this proves or disproves (each verdict line names its issue):
//   D1  the deleted functions are really gone: not defined and not referenced in ad_ui.js / ad_charts.js, and no shipped
//       file calls a deleted PUBLIC member (ADUI.getRecordIdx..., ADCharts.drawBarChart..., window._accordionLoadTab).
//       Baseline (07bf3f9e) MUST FAIL this (dead code present) — that is how we know D1 can fail.
//   D1b nothing dead is left: acorn reachability from the live roots finds 0 unreachable top-level functions in
//       ad_ui.js and ad_charts.js (a re-added dead function => FAIL).
//   D2  nothing live was lost: every function reachable from erp.html's boot (ADUI.init/setClient/hydrate), the pill bar
//       (ADUI.showMenu/buildShareUrl), share-restore (getContext/buildShareUrl) and the ADGraph callbacks, computed on the
//       BASELINE tree, still exists after; every Module.member that erp.html / erp_pills.js / live ad_ui.js call is exported;
//       and ADUI.getContext()/buildShareUrl() return byte-identical values before and after (executed in a vm).
//   D3  every <script src> and every MODULES[] entry of erp/erp.html resolves to an existing file.
//   D4  crud_overlay.js's per-table completeFanout{Order,Receipt,Invoice}: present IFF some host page that loads
//       crud_overlay.js does not load the model layer (glassbowl.html does not => they MUST stay).
//   INCONCLUSIVE is printed (never PASS) when nothing was judged.
// Usage: node witness_erp_dead_ui.js [--rev=<git rev for the tree under test; default = working tree>]
//        [--mutate=drop-live|add-dead|drop-fanout]   (self-test mutants; must FAIL)
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), vm = require('vm');
let acorn; try { acorn = require('acorn'); } catch (e) { acorn = require('/usr/share/nodejs/acorn'); }
const ROOT = path.resolve(__dirname, '..', '..');
const BASE = '07bf3f9e';                                   // PIN: the tree this retirement was measured against
const arg = k => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
const REV = arg('rev'), MUT = arg('mutate');

function git(a) { return cp.execFileSync('git', ['-C', ROOT].concat(a), { encoding: 'utf8', maxBuffer: 1 << 28 }); }
function provider(rev) {
  if (!rev) return { read: p => fs.existsSync(path.join(ROOT, p)) ? fs.readFileSync(path.join(ROOT, p), 'utf8') : null,
                     list: () => git(['ls-files', '--cached', '--others', '--exclude-standard', '--', 'erp', 'common', '*.html']).split('\n').filter(f => f && fs.existsSync(path.join(ROOT, f))) };
  return { read: p => { try { return git(['show', rev + ':' + p]); } catch (e) { return null; } },
           list: () => git(['ls-tree', '-r', '--name-only', rev, '--', 'erp', 'common']).split('\n').filter(Boolean).concat(git(['ls-tree', '--name-only', rev]).split('\n').filter(f => /\.html$/.test(f))) };
}
const T = provider(REV), B = provider(BASE);
function mutated(P) {
  return { list: P.list, read: p => {
    let s = P.read(p); if (s == null || !MUT) return s;
    if (MUT === 'drop-live' && p === 'erp/ad_ui.js') s = s.replace(/function _recPk\(/, 'function _recPkGONE(');
    if (MUT === 'add-dead' && p === 'erp/ad_ui.js') s = s.replace(/\(function \(\) \{\n  'use strict';/, "(function () {\n  'use strict';\n  function _showMore() { return 1; }");
    if (MUT === 'drop-fanout' && p === 'erp/crud_overlay.js') s = s.replace(/function completeFanoutOrder\(/, 'function completeFanoutOrderGONE(');
    return s; } };
}
const TT = mutated(T);

const out = []; let fails = 0, incon = 0;
function say(tag, ok, msg) { out.push((ok === null ? 'INCONCLUSIVE' : ok ? 'PASS' : 'FAIL') + ' ' + tag + ' ' + msg); if (ok === false) fails++; if (ok === null) incon++; }

// ---------- acorn helpers ----------
function iifeBody(src) {
  const ast = acorn.parse(src, { ecmaVersion: 2022, locations: true });
  const i = ast.body.find(s => s.type === 'ExpressionStatement' && s.expression.type === 'CallExpression');
  return i.expression.callee.body.body;
}
function ids(node, set) { (function w(n) { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) { n.forEach(w); return; }
  if (n.type === 'Identifier') set.add(n.name); for (const k in n) { if (k === 'loc') continue; const v = n[k]; if (v && typeof v === 'object') w(v); } })(node); return set; }
// Reachability inside one IIFE module. keepProps = public export-object members that are live (others are not roots).
function analyse(src, exportVar, keepProps, skipText) {
  const body = iifeBody(src), decl = {};
  for (const s of body) {
    if (s.type === 'FunctionDeclaration') decl[s.id.name] = s;                     // later duplicate wins, exactly as JS hoisting
    else if (s.type === 'VariableDeclaration' && s.declarations.length === 1 && s.declarations[0].id.type === 'Identifier' && s.declarations[0].id.name !== exportVar) decl[s.declarations[0].id.name] = s;
  }
  const dup = body.filter(s => s.type === 'FunctionDeclaration').map(s => s.id.name).filter((n, i, a) => a.indexOf(n) !== i);
  const roots = new Set(), declSet = new Set(Object.values(decl));
  for (const s of body) {
    if (declSet.has(s)) { if (s.type === 'VariableDeclaration') { const it = s.declarations[0].init; if (it && !['Literal', 'ObjectExpression', 'ArrayExpression', 'FunctionExpression', 'Identifier'].includes(it.type)) ids(s, roots); } continue; }
    if (s.type === 'VariableDeclaration' && s.declarations[0].id.name === exportVar) { for (const p of s.declarations[0].init.properties) { const k = p.key.name || p.key.value; if (keepProps.includes(k)) ids(p.value, roots); } continue; }
    if (skipText && src.slice(s.start, s.end).includes(skipText)) continue;   // window-global registration with zero callers (checked in D2)
    ids(s, roots);
  }
  const reach = new Set(), q = [...roots].filter(n => decl[n]); q.forEach(n => reach.add(n));
  while (q.length) { const n = q.pop(); const r = ids(decl[n], new Set()); r.delete(n); for (const m of r) if (decl[m] && !reach.has(m)) { reach.add(m); q.push(m); } }
  const fns = Object.keys(decl).filter(n => decl[n].type === 'FunctionDeclaration');
  return { fns, live: fns.filter(n => reach.has(n)), dead: fns.filter(n => !reach.has(n)), dup, allIds: ids(body, new Set()) };
}
// Live public members = exactly what erp.html (inline), erp_pills.js and the pill/picker scripts call on a module.
function memberCalls(srcs, mod) {
  const set = new Set(); const re = new RegExp('\\b' + mod + '\\.([A-Za-z_$][\\w$]*)', 'g');
  for (const s of srcs) { if (!s) continue; let m; while ((m = re.exec(s))) set.add(m[1]); } return set;
}
function execModule(file, src, globalName) {
  const noop = () => {}; const sb = { console: { log: noop, warn: noop, error: noop }, location: { origin: 'https://x', pathname: '/erp/erp.html' }, setTimeout: noop,
    document: { addEventListener: noop, createElement: () => ({ style: {}, appendChild: noop, addEventListener: noop }), getElementById: () => null, body: { appendChild: noop } },
    navigator: {}, performance: { now: () => 0 } };
  sb.window = sb; vm.createContext(sb); vm.runInContext(src, sb, { filename: file });
  return sb[globalName];
}

// ---------- gather ----------
const files = ['erp/ad_ui.js', 'erp/ad_charts.js', 'erp/erp.html', 'erp/erp_pills.js'];
const srcT = {}, srcB = {};
for (const f of files) { srcT[f] = TT.read(f); srcB[f] = B.read(f); }
if (files.some(f => srcT[f] == null || srcB[f] == null)) { say('SETUP', null, 'cannot read entry files (tree=' + (REV || 'worktree') + ' base=' + BASE + ') — nothing judged'); finish(); }
const inline = h => (h.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g) || []).join('\n');

const LIVE_ADUI = ['init', 'hydrate', 'showMenu', 'setClient', 'buildShareUrl', 'getContext', 'openWindow'];
const ADUI_PUBLIC_DELETED = ['getRecordIdx', 'getRecordCount', 'getCurrentScreen', 'getTabIdx', '_test'];
const CHARTS_PUBLIC_DELETED = ['runQuery', 'drawBarChart', 'drawPieChart', 'drawCompleteness', 'getPrebuilt', 'renderOverlay'];
// Private functions/vars deleted from ad_ui.js / ad_charts.js (IIFE-private: no outside file can reference them).
const DELETED_UI = ['_showFieldHelp', '_updateHelpContent', '_toggleHelp', '_ensureHelpPanel', '_addRecent', '_loadRecent', '_findIdentifier', '_showMore', '_showCharts',
  '_renderMenuNodes', '_hasMatchingLeaf', '_loadChildRecords', '_discoverChildTabs', '_resolveTitle', '_buildFieldGrid', '_buildAccordionHTML', '_closeTableOverlay',
  '_openTableView', '_saveOverlayCell', '_renderEditableCell', '_ovToast', '_openAccordionPanel', '_renderKPICards', '_escHtml', '_fallbackFields', '_getFieldsForTable',
  '_resolveDisplay', '_caseGet', '_currentRecordPk', '_accordionLoadTab'];
const DELETED_CHARTS = ['_addChart', 'runQuery', 'drawBarChart', 'drawPieChart', 'drawCompleteness', 'getPrebuilt', 'renderOverlay'];

// ---------- D1 ----------
{
  const uiIds = analyse(srcT['erp/ad_ui.js'], 'ADUI', LIVE_ADUI).allIds, chIds = analyse(srcT['erp/ad_charts.js'], 'ADCharts', ['drawTreemap']).allIds;
  const present = DELETED_UI.filter(n => uiIds.has(n) || srcT['erp/ad_ui.js'].includes('window.' + n)).concat(DELETED_CHARTS.filter(n => chIds.has(n)).map(n => 'charts:' + n));
  // shipped-file callers of deleted PUBLIC members
  const shipped = T.list().filter(f => /\.(js|html)$/.test(f) && !/\/(tests|archive)\//.test(f) && !/^erp\/(ad_ui|ad_charts)\.js$/.test(f));
  const callers = [];
  for (const f of shipped) { const s = TT.read(f); if (!s) continue;
    for (const m of ADUI_PUBLIC_DELETED) if (new RegExp('ADUI\\.' + m + '\\b').test(s)) callers.push(f + ':ADUI.' + m);
    for (const m of CHARTS_PUBLIC_DELETED) if (new RegExp('ADCharts\\.' + m + '\\b').test(s)) callers.push(f + ':ADCharts.' + m);
    if (/_accordionLoadTab/.test(s)) callers.push(f + ':_accordionLoadTab'); }
  const exp = execModule('ad_ui.js', srcT['erp/ad_ui.js'], 'ADUI'), expC = execModule('ad_charts.js', srcT['erp/ad_charts.js'], 'ADCharts');
  const stillExported = ADUI_PUBLIC_DELETED.filter(m => exp && m in exp).concat(CHARTS_PUBLIC_DELETED.filter(m => expC && m in expC).map(m => 'ADCharts.' + m));
  const n = DELETED_UI.length + DELETED_CHARTS.length + ADUI_PUBLIC_DELETED.length;
  const bad = present.concat(callers, stillExported);
  say('D1', bad.length === 0 ? true : false, 'deleted-names-judged=' + n + ' shipped-files-scanned=' + shipped.length + ' still-present=' + bad.length + (bad.length ? ' [' + bad.slice(0, 12).join(',') + (bad.length > 12 ? ',…' : '') + ']' : ''));
}
// ---------- D1b ----------
const aUI = analyse(srcT['erp/ad_ui.js'], 'ADUI', LIVE_ADUI), aCH = analyse(srcT['erp/ad_charts.js'], 'ADCharts', ['drawTreemap']);
say('D1b', (aUI.fns.length === 0 || aCH.fns.length === 0) ? null : (aUI.dead.length + aCH.dead.length + aUI.dup.length === 0),
  'ad_ui fns=' + aUI.fns.length + ' live=' + aUI.live.length + ' dead=' + aUI.dead.length + ' shadowed-duplicates=' + aUI.dup.length + ' | ad_charts fns=' + aCH.fns.length + ' dead=' + aCH.dead.length +
  (aUI.dead.length + aCH.dead.length + aUI.dup.length ? ' [' + aUI.dead.concat(aCH.dead, aUI.dup).join(',') + ']' : ''));

// ---------- D2 ----------
{
  const orphanCallers = T.list().concat(B.list()).filter(f => /\.(js|html)$/.test(f) && !/\/(tests|archive)\//.test(f) && f !== 'erp/ad_ui.js').filter(f => /_accordionLoadTab/.test(B.read(f) || '')).length;
  const bUI = analyse(srcB['erp/ad_ui.js'], 'ADUI', LIVE_ADUI, orphanCallers === 0 ? 'window._accordionLoadTab' : null), bCH = analyse(srcB['erp/ad_charts.js'], 'ADCharts', ['drawTreemap']);
  // _currentRecordPk/_caseGet were 'live' at baseline only via _getContext's window branch, guarded by _currentWindow, which is
  // assigned exactly once (the `= null` initialiser) => the branch can never run. Exempt ONLY if that proof holds on the baseline.
  const winAssigns = (srcB['erp/ad_ui.js'].match(/\b_currentWindow\s*=[^=]/g) || []).length;
  const stateExempt = winAssigns === 1 ? ['_currentRecordPk', '_caseGet'] : [];
  const lostUI = bUI.live.filter(n => !aUI.fns.includes(n) && !stateExempt.includes(n)), lostCH = bCH.live.filter(n => !aCH.fns.includes(n));
  // entry-point call-set (erp.html inline + pill bar) must be identical baseline vs after and exported after
  const entryT = [inline(srcT['erp/erp.html']), srcT['erp/erp_pills.js']], entryB = [inline(srcB['erp/erp.html']), srcB['erp/erp_pills.js']];
  const mods = { ADUI: execModule('ad_ui.js', srcT['erp/ad_ui.js'], 'ADUI') };
  const callT = [...memberCalls(entryT, 'ADUI')].sort(), callB = [...memberCalls(entryB, 'ADUI')].sort();
  const missing = callT.filter(m => !(m in mods.ADUI));
  // members the LIVE ad_ui body calls on ADCharts / ADData / ADParser must be exported by those modules
  const ck = [];
  const uiSrc = srcT['erp/ad_ui.js'];
  const chart = execModule('ad_charts.js', srcT['erp/ad_charts.js'], 'ADCharts');
  for (const m of memberCalls([uiSrc], 'ADCharts')) if (!chart || typeof chart[m] !== 'function') ck.push('ADCharts.' + m);
  for (const [g, f] of [['ADData', 'erp/ad_data.js'], ['ADParser', 'erp/ad_parser.js']]) {
    const src = TT.read(f); const calls = memberCalls([uiSrc], g); if (!src) { ck.push(f + ' missing'); continue; }
    for (const m of calls) if (!new RegExp('\\b' + m + '\\s*:').test(src) && !new RegExp('\\b' + g + '\\.' + m + '\\s*=').test(src)) ck.push(g + '.' + m);
  }
  // behaviour identical for the share/deep-link capture path
  const eb = execModule('ad_ui.js', srcB['erp/ad_ui.js'], 'ADUI');
  const same = JSON.stringify(eb.getContext()) === JSON.stringify(mods.ADUI.getContext()) && eb.buildShareUrl() === mods.ADUI.buildShareUrl();
  const judged = bUI.live.length + bCH.live.length;
  say('D2', judged === 0 ? null : (lostUI.length + lostCH.length + missing.length + ck.length === 0 && same && JSON.stringify(callT) === JSON.stringify(callB)),
    '_currentWindow-assignments-at-baseline=' + winAssigns + ' (state-unreachable exempt=' + stateExempt.length + ') window._accordionLoadTab-callers-in-shipped-files=' + orphanCallers + ' baseline-live-fns=' + judged + ' lost=' + (lostUI.length + lostCH.length) + (lostUI.length + lostCH.length ? ' [' + lostUI.concat(lostCH).join(',') + ']' : '') +
    ' entry-ADUI-members=[' + callT.join(',') + '] unexported=' + missing.length + ' unresolved-module-members=' + ck.length + (ck.length ? ' [' + ck.join(',') + ']' : '') +
    ' entry-callset-unchanged=' + (JSON.stringify(callT) === JSON.stringify(callB)) + ' getContext/buildShareUrl-identical=' + same);
}
// ---------- D3 ----------
{
  const h = srcT['erp/erp.html']; const refs = [];
  let m; const re = /<script[^>]*\bsrc="([^"]+)"/g; while ((m = re.exec(h))) refs.push(m[1].split('?')[0]);
  const mod = /var MODULES = \[([\s\S]*?)\];/.exec(h); if (mod) { const r2 = /'([^']+\.js)'/g; let k; while ((k = r2.exec(mod[1]))) refs.push(k[1]); }
  const miss = refs.filter(r => /^https?:/.test(r) ? false : TT.read(path.posix.normalize('erp/' + r)) == null);
  say('D3', refs.length === 0 ? null : miss.length === 0, 'erp.html script refs=' + refs.length + ' unresolved=' + miss.length + (miss.length ? ' [' + miss.join(',') + ']' : ''));
}
// ---------- D4 ----------
{
  const hosts = T.list().filter(f => /\.html$/.test(f) && !/\/(tests|archive)\//.test(f)).filter(f => /crud_overlay\.js/.test(TT.read(f) || ''));
  const rows = hosts.map(f => ({ f, ml: /<script[^>]*src="model_layer\.js/.test(TT.read(f)) }));
  const need = rows.some(r => !r.ml);
  const co = TT.read('erp/crud_overlay.js') || '';
  const has = ['completeFanoutOrder', 'completeFanoutReceipt', 'completeFanoutInvoice'].every(n => new RegExp('function ' + n + '\\(').test(co));
  say('D4', hosts.length === 0 ? null : (need === has), 'crud_overlay hosts=' + rows.map(r => r.f + '(model_layer=' + r.ml + ')').join(' ') + ' fallback-needed=' + need + ' fallback-present=' + has);
}
finish();
function finish() {
  console.log('§ERP_DEAD_UI tree=' + (REV || 'worktree') + ' base=' + BASE + ' mutate=' + (MUT || 'none'));
  out.forEach(l => console.log('§ERP_DEAD_UI ' + l));
  const v = fails ? 'FAIL' : incon ? 'INCONCLUSIVE' : 'PASS';
  console.log('§ERP_DEAD_UI VERDICT ' + v + ' fails=' + fails + ' inconclusive=' + incon);
  process.exit(fails ? 1 : incon ? 2 : 0);
}
