// ⚠ DO NOT REMOVE — Scope guard
// W-ERP-ENGINE-SUBSET — erp/erp_engine.js is the BROWSER SUBSET of bim-compiler scripts/erp_engine.js: only the exports a live
// caller uses (+ their internal closure) remain; the retired verbs live in bim-compiler. Node only, no browser.
// READ THE LOG after every run (exit code alone is not evidence).  Spec: scratchpad ENGINE_RESULT.md /
// bim-compiler prompts/CODE_HYGIENE_REVIEW_2026-11.md C3.  Style: witness_erp_dead_ui.js.
//
// ISSUES this proves or disproves (each verdict line names its issue):
//   S1  nothing live was lost: every engine member a shipped caller / bim-ootb witness / the two bim-compiler --engine-dir
//       scripts (poc_sd16, poc_shopday_run2, read from origin/master) uses still exists, and is a function.  (The export object being EXACTLY that set is judged in S2.)
//   S2  the retired verbs are really gone: none of the pinned deleted names is declared/referenced in the engine, none is
//       called on an engine receiver by any shipped file, AND an acorn closure from the live exports finds 0 dead top-level
//       declarations (a re-added dead verb => FAIL).  Baseline (97a18c74) MUST FAIL this — that is how S2 is known to be able to fail.
//   S3  pure deletion: every top-level declaration that remains, the UMD wrapper and the export values are byte-identical to
//       baseline (no behaviour change possible from this edit).
//   INCONCLUSIVE is printed (never PASS) when nothing was judged.
// Usage: node witness_erp_engine_subset.js [--rev=<git rev for the tree under test; default = working tree>]
//        [--mutate=drop-used|keep-dead|edit-kept|empty]   (self-test mutants; must FAIL / INCONCLUSIVE)
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), vm = require('vm');
let acorn; try { acorn = require('acorn'); } catch (e) { acorn = require('/usr/share/nodejs/acorn'); }
const ROOT = path.resolve(__dirname, '..', '..');
const BASE = '97a18c74';                                    // PIN: the tree this retirement was measured against
const BC = process.env.BIM_COMPILER || '/home/red1/bim-compiler';
const arg = k => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
const REV = arg('rev'), MUT = arg('mutate');
function git(a, cwd) { return cp.execFileSync('git', ['-C', cwd || ROOT].concat(a), { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }); }
const readTree = p => { if (REV) { try { return git(['show', REV + ':' + p]); } catch (e) { return null; } } return fs.existsSync(path.join(ROOT, p)) ? fs.readFileSync(path.join(ROOT, p), 'utf8') : null; };
const baseSrc = (() => { try { return git(['show', BASE + ':erp/erp_engine.js']); } catch (e) { return null; } })();
let treeSrc = readTree('erp/erp_engine.js');
if (treeSrc != null && MUT === 'drop-used') treeSrc = treeSrc.replace(/function completeInvoice\(/, 'function completeInvoiceGONE(');
if (treeSrc != null && MUT === 'keep-dead') treeSrc = treeSrc.replace(/\nreturn \{/, '\nfunction completeCash(a) { return a; }\nreturn {');
if (treeSrc != null && MUT === 'edit-kept') treeSrc = treeSrc.replace(/function rmaCheckQty\(([^)]*)\) \{/, 'function rmaCheckQty($1) { $1.length;');
if (MUT === 'empty') treeSrc = '';

const out = []; let fails = 0, incon = 0;
function say(tag, ok, msg) { out.push((ok === null ? 'INCONCLUSIVE' : ok ? 'PASS' : 'FAIL') + ' ' + tag + ' ' + msg); if (ok === false) fails++; if (ok === null) incon++; }
function finish() { out.forEach(l => console.log(l)); console.log((fails ? 'FAIL' : incon ? 'INCONCLUSIVE' : 'PASS') + ' W-ERP-ENGINE-SUBSET fails=' + fails + ' inconclusive=' + incon + ' tree=' + (REV || 'worktree') + (MUT ? ' mutant=' + MUT : '') + ' base=' + BASE); process.exit(fails ? 1 : incon ? 2 : 0); }

// ---------- pinned facts (measured on BASE; see ENGINE_RESULT.md caller table) ----------
// USED: export -> a caller that really contains `.name` (honesty of the table is itself checked).
const CALLERS = {
  rmaCheckQty: 'erp/tests/witness_sd16_engine_port.js', rmaLineSave: 'erp/model_rma.js', completeRMA: 'erp/model_rma.js', rmaReceiptEffects: 'erp/model_order.js',
  calcTax: 'erp/tests/witness_one_tax_owner.js', taxLookup: 'erp/till.js', orderTaxes: 'erp/till_core.js', buildDoc: 'erp/ad_process.js', qtyOnHand: 'viewer/wh_walk.js',
  replenishQtyToOrder: 'erp/processes/ReplenishReportProduction.js', completeOrder: 'erp/crud_overlay.js', completeInvoice: 'erp/crud_overlay.js', completeReceipt: 'erp/crud_overlay.js',
  orderPriceListDefault: 'erp/model_order.js' };
const USED = Object.keys(CALLERS);
// DELETED: every top-level declaration (verbs + their private helpers) removed from BASE.
const DELETED = ['resolveCtx', 'dialectShim', 'evalGuard', 'match', 'explodeBOM', 'reversePosting', '_neg', '_reversalInvoiceDocOps', '_invSign', '_d12', '_invAllocTotal', 'reverseInvoice',
  '_reversalInOutDocOps', 'reverseInOut', 'voidOrder', 'completeMovement', 'completePayment', 'prepareInvoice', 'acctSetupGap', 'periodOpen', 'priceAt', 'creditCheckOrder', 'orderReserve',
  'inoutOrderLineEffects', 'invoiceOrderLineEffects', 'completeInOut', 'matchFromInvoice', 'prepareRequisition', 'completeCash', 'completeJournal', 'completeBankStatement', 'completeProjectIssue',
  'completeDDOrder', 'bpOpenBalance', '_faMonthEnd', '_faMonth', '_faDiv', '_FA_TYPES', '_faInvoke', '_faRequireLast', 'faRegisterAsset', 'faBuildDepreciation', 'faCompleteAddition',
  '_faSetCurrentPeriod', 'faCompleteDepreciationEntry', 'faCompleteDisposal', 'faCompleteReval'];
// Exports that stay as internal helpers (callers none) but are no longer exported:
const UNEXPORTED_INTERNAL = ['VERBS', 'DOC_SPECS', 'movementSign', 'movementTypeOf', 'stockMoves'];

// ---------- acorn helpers ----------
function parts(src) {
  const ast = acorn.parse(src, { ecmaVersion: 2022, locations: true });
  const call = ast.body.find(s => s.type === 'ExpressionStatement' && s.expression.type === 'CallExpression');
  const fac = call.expression.arguments[1], body = fac.body.body, decl = {}, texts = {};
  for (const s of body) {
    if (s.type === 'FunctionDeclaration') { decl[s.id.name] = s; texts[s.id.name] = src.slice(s.start, s.end); }
    else if (s.type === 'VariableDeclaration') for (const d of s.declarations) if (d.id.type === 'Identifier') { decl[d.id.name] = s; texts[d.id.name] = src.slice(d.start, d.end); }
  }
  const ret = body.find(s => s.type === 'ReturnStatement'), props = {};
  for (const p of ret.argument.properties) props[p.key.name || p.key.value] = src.slice(p.value.start, p.value.end);
  return { ast, call, body, decl, texts, ret, props, wrapper: src.slice(src.indexOf("'use strict'"), fac.body.start + 1), allIds: ids(body, new Set()) };
}
function ids(node, set) { (function w(n) { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) { n.forEach(w); return; } if (n.type === 'Identifier') set.add(n.name); for (const k in n) { if (k === 'loc') continue; const v = n[k]; if (v && typeof v === 'object') w(v); } })(node); return set; }
function deadByClosure(P, roots) {
  const r0 = new Set(); roots.forEach(k => { if (P.props[k]) ids(acorn.parseExpressionAt(P.props[k], 0, { ecmaVersion: 2022 }), r0); });
  for (const s of P.body) { if (s === P.ret) continue; const isDecl = s.type === 'FunctionDeclaration' || (s.type === 'VariableDeclaration' && s.declarations.every(d => d.id.type === 'Identifier')); if (!isDecl) ids(s, r0); }
  const reach = new Set(), q = [...r0].filter(n => P.decl[n]); q.forEach(n => reach.add(n));
  for (const n of Object.keys(P.decl)) { const s = P.decl[n]; if (s.type === 'VariableDeclaration') for (const d of s.declarations) if (d.init && (d.init.type === 'CallExpression' || d.init.type === 'NewExpression') && !reach.has(d.id.name)) { reach.add(d.id.name); q.push(d.id.name); } }
  while (q.length) { const n = q.pop(); for (const m of ids(P.decl[n], new Set())) if (P.decl[m] && !reach.has(m)) { reach.add(m); q.push(m); } }
  return Object.keys(P.decl).filter(n => !reach.has(n) && !(P.decl[n].type === 'VariableDeclaration' && P.decl[n].declarations.some(d => reach.has(d.id.name))));
}

// ---------- setup ----------
if (baseSrc == null) { say('SETUP', null, 'cannot read baseline ' + BASE + ':erp/erp_engine.js — nothing judged'); finish(); }
if (treeSrc == null || treeSrc.trim() === '') { say('SETUP', null, 'tree under test has no erp/erp_engine.js (tree=' + (REV || 'worktree') + ') — nothing judged'); finish(); }
let B, T; try { B = parts(baseSrc); T = parts(treeSrc); } catch (e) { say('SETUP', false, 'engine does not parse: ' + e.message); finish(); }
const missingFromBase = DELETED.filter(n => !B.decl[n]);
if (missingFromBase.length) { say('SETUP', null, 'pinned DELETED names not declared at baseline (spec drift): ' + missingFromBase.join(',')); finish(); }
const shipped = git(['ls-files']).split('\n').filter(f => /\.(js|html|mjs)$/.test(f) && f !== 'erp/erp_engine.js' && f !== 'erp/tests/witness_erp_engine_subset.js' && !/\.min\.js$|^archive\//.test(f));

// ---------- S1 ----------
{
  const bad = [];
  // caller-table honesty: the named caller (tree = shipped files, unaffected by --mutate) really uses `.name`
  for (const n of USED) { const s = fs.existsSync(path.join(ROOT, CALLERS[n])) ? fs.readFileSync(path.join(ROOT, CALLERS[n]), 'utf8') : ''; if (!new RegExp('\\.' + n + '\\b').test(s)) bad.push('caller-table:' + n + '@' + CALLERS[n]); }
  // names used by the two bim-compiler --engine-dir scripts (read from origin/master, not the working tree)
  let bc = [], bcNote = '';
  for (const f of ['scripts/poc_sd16.js', 'scripts/poc_shopday_run2.js']) {
    try { const s = git(['show', 'origin/master:' + f], BC); (s.match(/\bE\.([A-Za-z_]\w*)/g) || []).forEach(m => bc.push(m.slice(2))); } catch (e) { bcNote += ' [cannot read ' + f + ']'; }
  }
  bc = [...new Set(bc)];
  const bcInBase = bc.filter(n => n in B.props), bcNotInBase = bc.filter(n => !(n in B.props));
  for (const n of bcInBase) if (!USED.includes(n)) bad.push('bim-compiler script uses ' + n + ' but it is not kept');
  // the tree exports exactly USED, each a function
  let api = null; try { const sb = { module: { exports: {} }, console }; sb.module.exports = sb.module.exports; vm.createContext(sb); vm.runInContext(treeSrc, sb, { filename: 'erp_engine.js' }); api = sb.module.exports; } catch (e) { bad.push('does not load: ' + e.message); }
  if (api) { for (const n of USED) if (typeof api[n] !== 'function') bad.push('missing/not-function:' + n) }
  const judged = USED.length + bc.length;
  say('S1', bcNote && !bc.length ? null : bad.length === 0, 'used-exports=' + USED.length + ' bim-compiler-engine-dir-names=' + bc.length + ' (kept=' + bcInBase.length + ', absent-by-design=' + bcNotInBase.join('|') + ')' + bcNote + ' problems=' + bad.length + (bad.length ? ' [' + bad.slice(0, 10).join(', ') + ']' : '') + (judged ? '' : ' (nothing judged)'));
}
// ---------- S2 ----------
{
  const present = DELETED.filter(n => T.allIds.has(n) || T.decl[n]);
  const exportsBack = Object.keys(T.props).filter(n => !USED.includes(n));   // also catches a re-exported dead verb
  const calls = [];
  for (const f of shipped) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const n of DELETED.concat(UNEXPORTED_INTERNAL).filter(x => x[0] !== '_')) {
      if (new RegExp('(?:ERPEngine|\\bEE|\\bEng|\\bengine|\\bM\\.E|erp_engine(?:\\.js)?\'?\\)?|\\bE)\\.' + n + '\\b').test(s) && !/\/\/.*(ERPEngine|engine)\.\w+/.test(s.split('\n').find(l => l.includes('.' + n)) || '')) calls.push(f + ':' + n);
    }
  }
  const dead = deadByClosure(T, USED);
  const bad = present.concat(exportsBack.map(n => 'export:' + n), calls, dead.map(n => 'dead-decl:' + n));
  say('S2', bad.length === 0, 'deleted-names-judged=' + DELETED.length + ' shipped-files-scanned=' + shipped.length + ' still-present=' + bad.length + (bad.length ? ' [' + bad.slice(0, 12).join(',') + (bad.length > 12 ? ',…' : '') + ']' : ''));
}
// ---------- S3 ----------
{
  const bad = [];
  for (const n of Object.keys(T.texts)) { if (!(n in B.texts)) bad.push('new:' + n); else if (T.texts[n] !== B.texts[n]) bad.push('changed:' + n); }
  if (T.wrapper !== B.wrapper) bad.push('umd-wrapper');
  for (const n of Object.keys(T.props)) if (T.props[n] !== B.props[n]) bad.push('export-value:' + n);
  const kept = Object.keys(T.texts).length;
  say('S3', kept === 0 ? null : bad.length === 0, 'kept-declarations=' + kept + ' (baseline had ' + Object.keys(B.texts).length + ') byte-identical-check problems=' + bad.length + (bad.length ? ' [' + bad.slice(0, 10).join(',') + ']' : ''));
}
finish();
