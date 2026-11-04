#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-PREVIEW-IS-POSTING (bim-compiler prompts/SQLiteIDEMPIERE.md §POSTING-PARITY step (2)+(4); CARDINAL RULE: twin == legacy, ONE implementation per responsibility). READ THE LOG: §WPIP lines; exit code is not evidence.
// THE ISSUE: the Posting-Preview (erp_preview.js) derived its journal with doc_poster.derivePostings - a SECOND implementation of posting. Where it differed from model_post (the real posting path)
//   the Preview showed books that Complete would not write. Preview must render what the real poster writes, then the duplicate derivation retires.
//   P1  every client-11 seed document of every model_post-handled type: the Preview's lines == the facts a SEPARATE real post writes in a throwaway copy of the db (rows read back), per schema x account x side, 0c;
//       a document the real poster refuses shows the refusal text in the Preview, never lines
//   P2  a preview writes nothing: db bytes, fact_acct row count and the document's Posted flag are unchanged
//   P3  every name deleted from doc_poster.js is referenced by no shipped file and no --engine-dir bim-compiler script
//   P4  every doc_poster function a remaining caller (shipped file, test, engine-dir script) uses still exists
//   P5  model_post.post output (result + ops + log) is byte-identical to the pinned baseline on every seed document
//   P6  the Preview never calls DocPoster.derivePostings for a model_post-handled table
//   BASELINE=1 loads the pinned baseline erp_preview.js (two implementations) and must FAIL; MUT=commit (the preview applies its group to the db) must FAIL P2; MUT=derive (C_Invoice routed through derivePostings) must FAIL P6.
//   Nothing judged -> INCONCLUSIVE, never PASS.
// Run: node erp/tests/witness_preview_is_posting.js   (node only; sql.js)
'use strict';
var fs = require('fs'), path = require('path'), cp = require('child_process'), Module = require('module'), crypto = require('crypto');
var ERP = path.join(__dirname, '..'), BASE = 'b94bd387', MUT = process.env.MUT || '', BASELINE = !!process.env.BASELINE;
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js'); }
var log = function (s) { console.log(s); }, pass = 0, fail = 0, inc = 0;
var ok = function (id, n, c, d) { log((c === null ? '  ⚠ ' : c ? '  ✅ ' : '  ❌ ') + id + ' ' + n + (d ? ' — ' + d : '')); c === null ? inc++ : c ? pass++ : fail++; };
var cents = function (v) { return Math.round(Number(v || 0) * 100); };
var PATCH = fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8');
function applyPatch(db) { PATCH.split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); } catch (e) { } }); }
function gitShow(spec) { try { return cp.execFileSync('git', ['show', spec], { cwd: ERP, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }).toString(); } catch (e) { return null; } }
function loadAs(name, src) { var m = new Module(path.join(ERP, name), module); m.filename = path.join(ERP, name); m.paths = Module._nodeModulePaths(ERP); m._compile(src, m.filename); return m.exports; }
var TYPES = ['c_invoice', 'c_payment', 'c_allocationhdr', 'm_inout', 'm_matchinv', 'm_matchpo', 'm_movement', 'm_inventory', 'gl_journal', 'c_bankstatement'];
var DISPLAY = { c_invoice: 'C_Invoice', c_payment: 'C_Payment', c_allocationhdr: 'C_AllocationHdr', m_inout: 'M_InOut', m_matchinv: 'M_MatchInv', m_matchpo: 'M_MatchPO', m_movement: 'M_Movement', m_inventory: 'M_Inventory', gl_journal: 'GL_Journal', c_bankstatement: 'C_BankStatement' };
var TABLE_ID = { c_invoice: 318, c_payment: 335, c_allocationhdr: 735, m_inout: 319, m_matchinv: 472, m_matchpo: 473, m_movement: 323, m_inventory: 321, gl_journal: 224, c_bankstatement: 392 };
(async function main() {
  var SQL = await initSqlJs(), seedBytes = new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db')));
  var db = new SQL.Database(seedBytes); applyPatch(db);
  var A = require(path.join(ERP, 'ad_callout.js'));
  ['support', 'support_stock', 'views', 'currency', 'uom', 'pricing', 'tax', 'sqlfn'].forEach(function (m) { require(path.join(ERP, 'callouts', m + '.js')); });
  A.RUNTIME.registerSqlFunctions(function (n, f) { db.create_function(n, f); });
  var ML = require(path.join(ERP, 'model_layer.js'));
  ['model_trade', 'model_ctor', 'model_cost', 'model_match', 'model_order', 'model_invoice'].forEach(function (m) { require(path.join(ERP, m + '.js')); });
  var srcB = gitShow(BASE + ':erp/model_post.js'), PB = srcB ? loadAs('__model_post_baseline.js', srcB) : null;
  var PN = require(path.join(ERP, 'model_post.js'));
  if (MUT === 'commit') { var mpSrc = fs.readFileSync(path.join(ERP, 'model_post.js'), 'utf8'); PN = loadAs('__model_post_mut.js', mpSrc.replace('/*PREVIEW-END*/', 'if (trx.env.__commit) trx.env.__commit(trx.groupOps());')); }   // mutant: previewFacts commits its group
  if (!BASELINE) ML.setPoster(PN.post);
  global.window = global.window || {};
  var PR = require(path.join(ERP, 'post_resolver.js')), DP = require(path.join(ERP, 'doc_poster.js'));
  // P6 instrument: record every table the Preview hands to derivePostings
  var derived = [], dpOrig = DP.derivePostings;
  DP.derivePostings = function (d, ref) { derived.push(String(ref && (ref.table || ref.doc_type))); return dpOrig.apply(this, arguments); };
  var AP = require(path.join(ERP, 'accts_posted.js'));
  var PVsrc = BASELINE ? gitShow(BASE + ':erp/erp_preview.js') : fs.readFileSync(path.join(ERP, 'erp_preview.js'), 'utf8');
  if (MUT === 'derive' && PVsrc) PVsrc = PVsrc.replace(/(function previewDocAction\(recordRef, ctx, dbs, opts\) \{)/, '$1 if (recordRef && recordRef.table === "C_Invoice") { var __r = (opts && opts.DocPoster || window.DocPoster).derivePostings(dbs.docDb, recordRef, (opts && opts.schema) || 101, opts && opts.R || window.PostResolver); return { visible: true, posted: true, lines: __r.lines, balanced: __r.balanced, source: "preview", coverage: "complete", note: null, reason: null, schema: (opts && opts.schema) || 101 }; }');
  var PV = loadAs('__erp_preview_cand.js', PVsrc);
  function q(sql, params, d) { d = d || db; var st = d.prepare(sql), out = []; try { if (params && params.length) st.bind(params.map(function (v) { return v === undefined ? null : v; })); while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } } finally { st.free(); } return out; }
  var DAY = '2026-11-05 00:00:00';
  function env() { var uu = 0, clock = Date.parse('2026-11-05T09:00:00Z'); return { client: 11, org: 11, user: 100, role: 102, date: DAY, now: '2026-11-05 09:00:00', nowMillis: clock, uuid: function () { uu++; return '00000000-0000-4000-8000-' + ('000000000000' + uu).slice(-12); } }; }
  function applyOps(d, ops) {                                                     // the host's commitGroup, reduced to what posting writes: fact_acct creates/deletes
    var cols = {}; q('PRAGMA table_info(fact_acct)', [], d).forEach(function (c) { cols[c.name.toLowerCase()] = 1; });
    var nid = (q('SELECT COALESCE(MAX(fact_acct_id),0) AS m FROM fact_acct', [], d)[0] || { m: 0 }).m;
    ops.forEach(function (o) {
      if (!o || o.table !== 'fact_acct') return;
      if (o.op_type === 'CRUD_DELETE') { d.run('DELETE FROM fact_acct WHERE fact_acct_id=?', [o.id]); return; }
      if (o.op_type !== 'CRUD_CREATE') return;
      var f = Object.assign({}, o.fields); f.fact_acct_id = ++nid; var ks = Object.keys(f).filter(function (k) { return cols[k] && !(f[k] && typeof f[k] === 'object'); });
      d.run('INSERT INTO fact_acct (' + ks.join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')', ks.map(function (k) { return f[k]; }));
    });
  }
  function withTrx(d) { return function (fn) { var e = env(); if (MUT === 'commit') e.__commit = function (ops) { applyOps(d, ops); }; return fn(function (sql, p) { return q(sql, p, d); }, e); }; }
  function hash(d) { return crypto.createHash('sha1').update(Buffer.from(d.export())).digest('hex'); }
  var ctx = AP.buildCtx({ role: { id: 102 }, orgs: [{ id: 0 }] });
  var dbs = { adQ: function (sql, p) { return q(sql, p); }, docDb: PV.facade(db), withTrx: withTrx(db) };
  var schemas = q('SELECT c_acctschema_id AS s FROM c_acctschema WHERE ad_client_id=11 ORDER BY 1').map(function (r) { return r.s; });
  log('§WPIP config baseline=' + BASE + (PB ? '' : ' (BASELINE UNAVAILABLE)') + ' mode=' + (BASELINE ? 'BASELINE-erp_preview' : 'candidate') + ' mutant=' + (MUT || 'none') + ' previewFacts=' + (typeof PN.previewFacts) + ' schemas=' + schemas.join(','));

  // ── population ──
  var pop = []; TYPES.forEach(function (t) { var key = t + '_id'; try { q('SELECT ' + key + ' AS id FROM ' + t + ' WHERE ad_client_id=11 ORDER BY ' + key).forEach(function (r) { pop.push({ t: t, id: r.id }); }); } catch (e) { log('§WPIP POPULATION ' + t + ' unreadable: ' + String(e.message).slice(0, 80)); } });
  var byT = {}; pop.forEach(function (p) { byT[p.t] = (byT[p.t] || 0) + 1; });
  log('§WPIP POPULATION client-11 docs=' + pop.length + ' ' + JSON.stringify(byT));
  var tw = new SQL.Database(seedBytes); applyPatch(tw); A.RUNTIME.registerSqlFunctions(function (n, f) { tw.create_function(n, f); });   // the throwaway copy of the seed (the SEPARATE real post)
  var poster = BASELINE ? PB.post : PN.post;

  function mapOf(rows) { var m = {}; rows.forEach(function (f) { if (cents(f.amtacctdr)) { var k = f.account_id + ':DR'; m[k] = (m[k] || 0) + cents(f.amtacctdr); } if (cents(f.amtacctcr)) { var k2 = f.account_id + ':CR'; m[k2] = (m[k2] || 0) + cents(f.amtacctcr); } }); return m; }
  function diff(a, b) { var keys = {}, md = 0, bad = []; Object.keys(a).concat(Object.keys(b)).forEach(function (k) { keys[k] = 1; }); Object.keys(keys).forEach(function (k) { var d = Math.abs((a[k] || 0) - (b[k] || 0)); if (d > md) md = d; if (d) bad.push(k + ' preview=' + (a[k] || 0) + ' real=' + (b[k] || 0)); }); return { md: md, bad: bad }; }
  var judged = 0, mismatches = 0, refusedJudged = 0, postedJudged = 0, leaks = 0, p5bad = 0, p5n = 0;
  pop.forEach(function (p) {
    // the SEPARATE real post, in the throwaway copy: trx over tw, real poster, group applied, rows read back
    var rt = new ML.Trx(function (sql, pr) { return q(sql, pr, tw); }, env()), rlog = []; rt.say = function (l) { rlog.push(String(l)); };
    var rdoc = rt.get(p.t, p.id), rres = null, rexc = null; try { rres = poster(rt, p.t, rdoc, { repost: true }); } catch (e) { rexc = String(e && e.message || e).slice(0, 200); }
    var rops = rt.groupOps(); applyOps(tw, rops);
    var realPosted = rt.get(p.t, p.id) ? rt.get(p.t, p.id).posted : null;
    var realRows = q('SELECT c_acctschema_id AS s, account_id, amtacctdr, amtacctcr FROM fact_acct WHERE ad_table_id=? AND record_id=?', [TABLE_ID[p.t], p.id], tw);
    // P5: model_post output vs the pinned baseline on the same document, own throwaway Trx over the working db
    if (PB) { var o1 = (function (P) { var t = new ML.Trx(q, env()), l = [], r, ex = null; t.say = function (x) { l.push(String(x)); }; try { r = P(t, p.t, t.get(p.t, p.id), { repost: true }); } catch (e) { ex = String(e).slice(0, 120); } return JSON.stringify([r, ex, t.groupOps(), l]); });
      p5n++; if (o1(PN.post) !== o1(PB.post)) p5bad++; }
    schemas.forEach(function (sc) {
      var before = { h: hash(db), n: q('SELECT COUNT(*) AS n FROM fact_acct')[0].n, posted: q('SELECT posted FROM ' + p.t + ' WHERE ' + p.t + '_id=?', [p.id])[0].posted };
      derived.length = 0;
      var res; try { res = PV.previewDocAction({ table: DISPLAY[p.t], id: p.id, ad_org_id: 11 }, ctx, dbs, { schema: sc, R: PR, DocPoster: DP, ModelPost: PN, ModelLayer: ML }); } catch (e) { res = { err: String(e && e.message || e).slice(0, 160), lines: [] }; }
      var after = { h: hash(db), n: q('SELECT COUNT(*) AS n FROM fact_acct')[0].n, posted: q('SELECT posted FROM ' + p.t + ' WHERE ' + p.t + '_id=?', [p.id])[0].posted };
      var leak = before.h !== after.h || before.n !== after.n || before.posted !== after.posted; if (leak) leaks++;
      var usedDerive = derived.slice();
      var realS = realRows.filter(function (f) { return f.s === sc; }), realAll = realRows.length;
      var refused = realPosted !== 'Y' || realAll === 0 && rres !== true;
      if (rres === true && realAll === 0) {                                          // posted with no facts (e.g. legacy writes none): preview must show no lines
        var ok0 = !(res.lines && res.lines.length); judged++; postedJudged++; if (!ok0) mismatches++;
        log('§WPIP ' + p.t + '#' + p.id + ' schema=' + sc + ' real=posted-no-facts previewLines=' + (res.lines || []).length + (ok0 ? '' : ' <-- DIFF') + ' derive=' + usedDerive.join(',') + ' leak=' + leak); return; }
      if (rres === true) {
        // a schema without facts of its own: the Preview falls back to the first schema posted - compare with the schema the result names
        var usedSch = res.schema != null ? res.schema : sc, pm = mapOf(res.lines || []), rm = mapOf(realRows.filter(function (f) { return f.s === usedSch; }));
        var d = diff(pm, rm), good = d.md === 0 && (res.lines || []).length > 0 && !res.err; judged++; postedJudged++; if (!good) mismatches++;
        log('§WPIP ' + p.t + '#' + p.id + ' schema=' + sc + (usedSch !== sc ? '(->' + usedSch + ')' : '') + ' real=Y facts=' + realAll + ' previewLines=' + (res.lines || []).length + ' maxDiff=' + d.md + 'c source=' + res.source + (res.err ? ' ERR=' + res.err : '') + ' derive=' + usedDerive.join(',') + ' leak=' + leak + (d.bad.length ? ' DIFF ' + d.bad.slice(0, 4).join('; ') : '')); return; }
      // refused by the real poster: the Preview must carry the real refusal text and no lines
      var rtxt = (rlog.filter(function (l) { return /§MODEL-POST .*(reason=|error=|posted=)/.test(l); })[0] || '') + (rexc ? ' ' + rexc : ''), note = String(res.note || '');
      var why = (rtxt.match(/(?:reason|error)="([^"]{6,60})/) || [])[1] || rexc || '';
      var good2 = !(res.lines && res.lines.length) && (why ? note.indexOf(why.slice(0, 30)) >= 0 : note.length > 0); judged++; refusedJudged++; if (!good2) mismatches++;
      log('§WPIP ' + p.t + '#' + p.id + ' schema=' + sc + ' real=REFUSED(' + (why || realPosted) + ') previewLines=' + (res.lines || []).length + ' note="' + note.slice(0, 90) + '"' + (good2 ? '' : ' <-- DIFF') + ' derive=' + usedDerive.join(',') + ' leak=' + leak);
    });
  });
  ok('P1', 'Preview == the facts a separate real post writes (per schema x account x side, 0c); refusals carry the real text', judged === 0 ? null : mismatches === 0, 'judged=' + judged + ' (posted ' + postedJudged + ', refused ' + refusedJudged + ') mismatches=' + mismatches);
  ok('P2', 'a preview writes nothing: db bytes, fact_acct count, Posted flag unchanged', judged === 0 ? null : leaks === 0, 'leaks=' + leaks + ' of ' + judged);
  ok('P5', 'model_post.post output (result+ops+log) byte-identical to baseline ' + BASE, p5n === 0 ? null : p5bad === 0, 'docs=' + p5n + ' differing=' + p5bad);

  // ── P6: derivePostings never called for a model-handled table (the Preview of every type, instrumented above) ──
  var derivedAll = 0; derived.length = 0;
  var derCalls = {}; (function () { var o = DP.derivePostings; DP.derivePostings = function (d, ref) { var t = String(ref && ref.table); derCalls[t] = (derCalls[t] || 0) + 1; return o.apply(this, arguments); }; })();
  pop.forEach(function (p) { try { PV.previewDocAction({ table: DISPLAY[p.t], id: p.id, ad_org_id: 11 }, ctx, dbs, { schema: schemas[0], R: PR, DocPoster: DP, ModelPost: PN, ModelLayer: ML }); } catch (e) { } });
  Object.keys(derCalls).forEach(function (t) { derivedAll += derCalls[t]; });
  ok('P6', 'the Preview calls DocPoster.derivePostings for NO model_post-handled table', pop.length === 0 ? null : derivedAll === 0, 'derivePostings calls=' + derivedAll + ' ' + JSON.stringify(derCalls));

  // ── P3 / P4: deleted names unreferenced, remaining callers' functions exist ──
  var DELETED = ['deriveMatchInv', 'deriveMatchPO', 'deriveGLJournal', 'deriveInventory', '_receiptLineAmt', 'deriveInOut', 'deriveMovement', 'deriveAllocation', 'deriveBankStatement', 'deriveSalesReturn', 'deriveReceipt', 'derivePayment', '_allocBalanceAccounting'];   // + §POSTING-PARITY step 5 (the real poster owns these tables)
  function walk(dir, acc) { fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) { var p = path.join(dir, e.name); if (e.isDirectory()) { if (e.name === 'node_modules' || e.name === '.git') return; walk(p, acc); } else if (/\.(js|mjs|html)$/.test(e.name)) acc.push(p); }); return acc; }
  var files = walk(path.join(ERP, '..'), []).filter(function (f) { return f.indexOf('__model_post_baseline') < 0 && f.indexOf('witness_preview_is_posting.js') < 0; });
  var dpSrc = fs.readFileSync(path.join(ERP, 'doc_poster.js'), 'utf8'), refs = [];
  files.forEach(function (f) { var s = fs.readFileSync(f, 'utf8'); DELETED.forEach(function (n) { if (new RegExp('\\b' + n + '\\b').test(s)) refs.push(path.relative(ERP, f) + ':' + n); }); });
  // engine scripts reach only EXPORTED names ('_' helpers were never on the module); one that GATES a deleted name on the module having it (poc_sd16 BOOKS: its plain mode judges the compiler's own copy) is not a reference to the shipped one
  var ENGINE_SCRIPTS = ['poc_sd16', 'poc_shopday_run2', 'poc_review2_2026_10_11', 'poc_review_fix_2026_10_11'], engSrc = {};
  ENGINE_SCRIPTS.forEach(function (n) { var s = null; ['origin/master', 'master', 'HEAD'].some(function (rv) { try { s = cp.execFileSync('git', ['-C', '/home/red1/bim-compiler', 'show', rv + ':scripts/' + n + '.js'], { maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }).toString(); return true; } catch (e) { return false; } }); engSrc[n] = s; if (s) DELETED.filter(function (d) { return d.charAt(0) !== '_'; }).forEach(function (d) { if (new RegExp('\\b' + d + '\\b').test(s) && !new RegExp('typeof DP\\.' + d + " === 'function'").test(s)) refs.push('bim-compiler/scripts/' + n + '.js:' + d); }); });
  var engRead = Object.keys(engSrc).filter(function (n) { return engSrc[n]; }).length;
  DELETED.forEach(function (n) { if (new RegExp('function ' + n + '\\b').test(dpSrc)) refs.push('doc_poster.js still defines ' + n); });
  ok('P3', 'deleted doc_poster names are referenced by no shipped file and no --engine-dir script', files.length === 0 || engRead === 0 ? null : refs.length === 0, 'files scanned=' + files.length + ' engine scripts read=' + engRead + '/' + ENGINE_SCRIPTS.length + (refs.length ? ' REFS ' + refs.slice(0, 6).join(', ') : ''));
  var NEEDED = { derivePostings: 'genesis.html + witnesses + engine scripts', deriveInvoice: 'genesis.html (derivePostings C_Invoice; §POSTING-PARITY 5g open)', deriveOrder: 'Preview draft projection', invoiceForOrder: 'Preview', costQtyUpdates: 'witness_sd16 + engine scripts', costQtyUpdatesFor: 'poc_shopday_run2 ED', costUpdatesForMatchPO: 'poc_review2 ED', docClassFor: 'model_post + plugins', registerDocClass: 'plugins', removeDocClassOwner: 'plugin lifecycle', legacyDocClassExists: 'model_post', legacyDocClassOf: 'model_post', immediatePostingRefusal: 'witness_rma/post_error', fxRate: 'witness_nc5_rates' };
  var missing = Object.keys(NEEDED).filter(function (n) { return typeof DP[n] !== 'function'; });
  if (typeof (DP._test && DP._test.poLineCost) !== 'function') missing.push('_test.poLineCost'); if (typeof (DP._test && DP._test.inventoryPostRefused) !== 'function') missing.push('_test.inventoryPostRefused'); if (typeof (DP._test && DP._test.mtaxCalc) !== 'function') missing.push('_test.mtaxCalc');
  var seamNeeds = ['facade', 'previewDocAction', 'openPreview'].filter(function (n) { return typeof PV[n] !== 'function'; });
  ok('P4', 'every function a remaining doc_poster / erp_preview caller uses still exists', missing.length === 0 && seamNeeds.length === 0, 'checked=' + (Object.keys(NEEDED).length + 3 + 3) + (missing.length ? ' MISSING ' + missing.join(',') : '') + (seamNeeds.length ? ' SEAM-MISSING ' + seamNeeds.join(',') : ''));

  log('§WPIP-SUMMARY ' + (fail ? 'FAIL' : (inc || judged === 0) ? 'INCONCLUSIVE' : 'PASS') + ' mode=' + (BASELINE ? 'baseline' : 'candidate') + ' mutant=' + (MUT || 'none') + ' judged=' + judged + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc);
  process.exit(fail ? 1 : (inc || judged === 0) ? 2 : 0);
})().catch(function (e) { console.log('§WPIP-SUMMARY FAIL harness error: ' + (e && e.stack || e)); process.exit(1); });
