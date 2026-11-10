#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-MIGRATION-RECOVER (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §RECOVER). READ THE LOG after every run: every verdict is a §REC line and the loader's own §MIG-* lines are
//   printed with it; the exit code is not the evidence. INCONCLUSIVE when nothing was judged. Fast (node, no browser) twin of the R2 cases of witness_migration_journey.js.
// THE ISSUE it proves/disproves: after a REFUSED or REPEATED cut-over, is the company recoverable the way legacy iDempiere is? Legacy's Import* processes act only on I_IsImported='N' rows
//   (ImportInvoice.java / ImportGLJournal.java), a record is never created twice (unique <table>_uu_idx, pg_indexes), and Initial Client Setup (MSetup.java) makes no invoice.
//   REPEAT   (F3) the SAME file Processed again: nothing is loaded twice (every table count identical, books identical), the summary refuses nothing, the form says "Nothing to do", stage 2 re-checks the books (PASS).
//   SECOND   (F3) a DIFFERENT cut-over file for a company that holds one: refused before anything is written, in plain words that say what to do (migrate into a new company); no "ambiguous" jargon.
//   RESUME   (F2) stage 2 refused (one open line missing) -> the CORRECTED file Processed on the same company: the pending staging rows are replaced, one journal, NDOC documents, clearing 0.00, §MIG-VERIFY PASS, no bank/partner twice.
//   HANDFIN  (F2) refused, then Import GL Journal + Import Invoice run by hand (journal left Drafted, clearing -amount): Process of the corrected file Completes the journal, imports ONLY the missing document, re-verifies: PASS.
//   NOSAMPLE (F4) the wizard's bundle (idempiere.html renderGenesisWizard) appends no invoice: a born company holds 0 invoices (MSetup.java has no MInvoice).
// MUTANT: run with ERP_DIR=<a checkout WITHOUT the fix> (e.g. ~/bim-ootb on the old main): REPEAT / SECOND / RESUME / HANDFIN / NOSAMPLE must FAIL there.
// Command: node erp/tests/witness_migration_recover.js 2>&1 | tee /tmp/count_logs/mig_migration_recover.log
'use strict';
var fs = require('fs'), path = require('path'), url = require('url');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = process.env.ERP_DIR || path.join(__dirname, '..'), FIXD = path.join(__dirname, 'fixtures', 'odoo_export_2026-11-10');
var _log = console.log, SHIPPED = []; console.log = function () { var l = Array.prototype.join.call(arguments, ' '); if (/^§(MIG-|E1-STOCK|ODOO-FORM run|IMPORT_|PROC-)/.test(l)) SHIPPED.push(l); if (/^§DBG/.test(l)) _log(l); };
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 };
function J(x) { return JSON.stringify(x); }
function check(cs, key, rule, ok, info) { var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §REC-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + String(J(info)).slice(0, 1800))); }
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }, v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§REC-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed); return v; }
var cents = function (v) { return Math.round(Number(v || 0) * 100); }, money = function (c) { return (c / 100).toFixed(2); };

(async function main() {
  var K = require(path.join(ERP, 'ws_kernel.js')), k = await K.load(), db = k.db, ML = k.ML, AP = require(path.join(ERP, 'ad_process.js'));
  (fs.readFileSync(path.join(ERP, 'idempiere.html'), 'utf8').match(/<script src="(model_[a-z_]+\.js)/g) || []).forEach(function (m) { try { require(path.join(ERP, m.replace('<script src="', ''))); } catch (e) {} });
  ['ImportInventory.js', 'ImportGLJournal.js', 'ImportInvoice.js'].forEach(function (f) { try { require(path.join(ERP, 'processes', f)); } catch (e) { say('§REC-LOAD ' + f + ' not loadable: ' + e.message); } });
  var G = require(path.join(ERP, 'genesis.js')), PR = require(path.join(ERP, 'plugin_registry.js')), AF = require(path.join(ERP, 'ad_form_generic.js')), XLSX = require(path.join(ERP, 'xlsx.mini.min.js'));
  function q(sql, p) { return k.q(sql, p || []); }
  var shim = { prepare: function (sql) { return { all: function () { return q(sql); },
    run: function (row) { var b = {}; Object.keys(row || {}).forEach(function (x) { b['@' + x] = row[x] == null ? null : row[x]; }); var s = db.prepare(sql); try { s.bind(b); s.step(); } finally { s.free(); } } }; } };
  function birth(name) {
    var born = G.birthTenant({ clientName: name, currencyId: 100, currencyIso: 'USD', currencyPrecision: 2, adminUser: name.replace(/\W/g, '') + 'Admin', dateAcct: '2026-11-10', countryId: 100 });
    var rb = G.rebandGenesis({ groups: born.groups, refs: born.refs, input: born.input, tip: born.tip }, { clientId: G.nextClientId(shim) });
    G.mergeGenesisInto(rb.groups, shim, { now: '2026-11-10 09:00:00', user: 100, initialDefaults: ML.initialDefaultsOf });
    var R = rb.refs; return { clientId: R.clientId, orgId: R.orgId, userId: R.userId || 100, roleId: R.roleAdminId, actor: 'witness:migration-recover' };
  }
  var hostDb = { query: function (sql, p) { return q(sql, p); }, run: function (sql, p) { db.run(sql, p || []); } };
  var host = { engineVersion: '1.0.0', db: hostDb, ops: { append: function () { return 1; } }, process: AP, docAction: ML, form: AF,
    import: function (u) { return import(url.pathToFileURL(path.resolve(path.join(ERP, 'plugins'), u)).href); } };
  var reg = PR.create(host);
  await reg.installBundle(await import(url.pathToFileURL(path.join(ERP, 'plugins', 'ninja_migrate.mjs')).href)); await reg.startBundle('org.idempiere.ninja.migrate');
  await reg.installBundle(await import(url.pathToFileURL(path.join(ERP, 'plugins', 'odoo_migrate.mjs')).href)); await reg.startBundle('org.kernel.odoo.migrate');
  var CLS = 'org.kernel.odoo.MigrateFromOdoo', D = AF.get(CLS);
  var wbuf = fs.readFileSync(path.join(FIXD, 'odoo_migration.xlsx')), man = JSON.parse(fs.readFileSync(path.join(FIXD, 'manifest.json'), 'utf8')), EXP = JSON.parse(fs.readFileSync(path.join(FIXD, 'odoo_export.json'), 'utf8'));
  function files(exp) { return { Files: [{ name: 'odoo_migration.xlsx', size: wbuf.length, data: XLSX.read(wbuf) }, { name: 'manifest.json', size: 1, data: man }, { name: 'odoo_export.json', size: 1, data: exp || EXP }] }; }
  var CUT = EXP.manifest.cutover, ANS = { Units: 'Each', Days: 'Day', Hours: 'Hour' };
  function session(S, loginDate) {
    var withT = function (fn) { return fn(k.q, Object.assign(k.env(S), { date: loginDate + ' 00:00:00' })); };
    return { S: S, rows: function (params, cur) { return AF.read(withT, function (trx) { return D.rows(trx, params, cur); }); },
      execute: function (params, cur) { var r = AF.execute(withT, CLS, params, cur); if (r.ok && r.ops && r.ops.length) k.commit(S, r.ops, { ws: 'open_balances' }); return r; },
      after: function (params, cur) { var r = AF.executeAfter(withT, CLS, params, cur); if (r.ok && r.ops && r.ops.length) k.commit(S, r.ops, { ws: 'open_balances' }); return r; } };
  }
  function answer(rs) { return rs.map(function (r) { var o = { key: r.key, selected: r.selected }; if (r.erpunit !== undefined) { var u = r.item.replace(/^Unit: /, ''); o.erpunit = ANS[u] != null ? ANS[u] : r.erpunit; } return o; }); }
  function n(C, t) { return q('SELECT count(*) AS n FROM ' + t + ' WHERE ad_client_id=?', [C])[0].n; }
  function snap(C) { var o = {}; ['c_bpartner', 'c_elementvalue', 'i_gljournal', 'i_invoice', 'gl_journal', 'c_invoice', 'fact_acct', 'c_charge', 'c_tax'].forEach(function (t) { o[t] = n(C, t); }); return o; }
  // note: AP/AF above

  var OCV = await import(url.pathToFileURL(path.join(ERP, 'plugins', 'odoo_migrate_convert.mjs')).href), CLRV = { AR: OCV.TEMPLATE.variables.AR_CLEARING, AP: OCV.TEMPLATE.variables.AP_CLEARING, BANK: OCV.TEMPLATE.variables.BANK_CLEARING };
  var books = function (C) { var o = {}; q('SELECT ev.value AS v, SUM(f.amtacctdr)-SUM(f.amtacctcr) AS b FROM fact_acct f JOIN c_elementvalue ev ON ev.c_elementvalue_id=f.account_id WHERE f.ad_client_id=? GROUP BY ev.value', [C]).forEach(function (r) { o[r.v] = cents(r.b); }); return o; };
  var CT = ['c_bpartner', 'c_bpartner_location', 'c_location', 'c_bank', 'c_bankaccount', 'm_product', 'c_elementvalue', 'i_gljournal', 'i_invoice', 'i_bankstatement', 'gl_journalbatch', 'gl_journal', 'c_invoice', 'c_bankstatement', 'fact_acct', 'c_charge'];
  function snapAll(C) { var o = {}; CT.forEach(function (t) { o[t] = n(C, t); }); return o; }
  var NDOC = Object.keys(EXP.sets.open_lines.reduce(function (m, l) { if ({ out_invoice: 1, out_refund: 1, in_invoice: 1, in_refund: 1 }[l.move_type]) m[l.move_name] = 1; return m; }, {})).length;
  function full(S, exp) { var ses = S._ses, f = files(exp), cur = answer(ses.rows(f, null)), r = ses.execute(f, cur), a = r.ok ? ses.after(f, cur) : { ok: false, msg: 'stage 1 refused: ' + r.msg }; return { r: r, a: a, rows: ses.rows(f, cur) }; }
  function mk(name) { var T = birth(name); T._ses = session(T, '2026-11-11'); return T; }
  var ver = function (m) { return SHIPPED.slice(m).filter(function (l) { return /^§MIG-VERIFY/.test(l); }).pop() || ''; };

  // ═══ NOSAMPLE (F4) ═══
  var wiz = fs.readFileSync(path.join(ERP, 'idempiere.html'), 'utf8'), wz = wiz.slice(wiz.indexOf('function renderGenesisWizard') >= 0 ? wiz.indexOf('function renderGenesisWizard') : 0);
  var ws = wz.slice(0, wz.indexOf('idmpInstallGenesis(bundle)') + 40);
  check('NOSAMPLE', 'wizard-source', 'the wizard code before idmpInstallGenesis builds the bundle from the birth groups only (no "G7 sample invoice", no c_invoice CREATE)', ws.length > 500 && !/G7 sample invoice|table: 'c_invoice'/.test(ws), { found: /G7 sample invoice/.test(ws) });
  var T0 = mk('Plain Co'); check('NOSAMPLE', 'born-no-invoice', 'a company born by Genesis (the wizard\'s own birthTenant + install) holds 0 invoices, as legacy MSetup.java makes none', n(T0.clientId, 'c_invoice') === 0, n(T0.clientId, 'c_invoice'));
  verdict('NOSAMPLE');

  // ═══ REPEAT ═══
  var TA = mk('Repeat Co'), CA = TA.clientId, m0 = SHIPPED.length, A1 = full(TA);
  check('REPEAT', 'first-ok', 'the first full Process completes stage 2 with §MIG-VERIFY PASS (control: the repeat is judged against a real migration)', A1.r.ok && A1.a.ok && /Open balances completed/.test(A1.a.msg) && /verdict=PASS judged=[1-9]/.test(ver(m0)), { r: A1.r.msg, a: A1.a.msg });
  var sA = snapAll(CA), bA = books(CA); m0 = SHIPPED.length;
  var SA = TA._ses.rows(files(), answer(A1.rows)), sumRef = SA.reduce(function (x, r) { return x + (Number(r.refused) || 0); }, 0), sumWill = SA.reduce(function (x, r) { return x + (Number(r.will) || 0); }, 0), sumAlr = SA.reduce(function (x, r) { return x + (Number(r.already) || 0); }, 0);
  say('§REC-REPEAT summary refused=' + sumRef + ' will=' + sumWill + ' already=' + sumAlr + ' problems=' + J(SA.filter(function (r) { return /^⚠/.test(r.item); }).map(function (r) { return r.item.slice(0, 120); })));
  var loadRef = SA.filter(function (r) { return Number(r.refused) > 0 && !/not in the file/.test(String(r.reason)); });   // 'not in the file' = the converter's own note on source lines it cannot bring (not a load refusal)
  check('REPEAT', 'summary', 'the re-run summary refuses no row in the load (only the converter\'s "not in the file" notes), loads nothing (will=0), counts the file under "Already there" (>0) and carries no problem row', loadRef.length === 0 && sumWill === 0 && sumAlr > 0 && !SA.some(function (r) { return /^⚠/.test(r.item); }), { loadRef: loadRef.map(function (r) { return r.item + ': ' + String(r.reason).slice(0, 100); }), sumWill: sumWill, sumAlr: sumAlr });
  var A2 = full(TA), sA2 = snapAll(CA);
  say('§REC-REPEAT second Process: stage1=' + A2.r.ok + ' msg=' + String(A2.r.msg).slice(0, 160) + ' | stage2=' + A2.a.ok + ' msg=' + String(A2.a.msg).slice(0, 200));
  check('REPEAT', 'message', 'the second Process says "Nothing to do" (stage 1) and "Already migrated ... checked against the source" (stage 2) - not an error, not "ambiguous"', A2.r.ok && /Nothing to do/.test(A2.r.msg) && A2.a.ok && /Already migrated/.test(A2.a.msg) && !/ambiguous/i.test(A2.r.msg + A2.a.msg), { r: A2.r.msg, a: A2.a.msg });
  check('REPEAT', 'counts', 'no table gains a row: ' + CT.length + ' counts identical before and after the second Process (nothing loaded twice)', J(sA) === J(sA2), { before: sA, after: sA2 });
  check('REPEAT', 'books', 'the books are identical (Fact_Acct per account) and the stage-2 re-check says §MIG-VERIFY PASS judged>0', J(books(CA)) === J(bA) && /verdict=PASS judged=[1-9]/.test(ver(m0)), { ver: ver(m0) });
  verdict('REPEAT');

  // ═══ MULTI: ONE export into a second company of the same twin (legacy's <table>_uu_idx is GLOBAL; the loader salts the file's UUs per tenant) ═══
  var TM = mk('Second Co'), CM = TM.clientId, MA = full(TM), sM = snapAll(CM);
  check('MULTI', 'no-collision', 'the same export loaded into a second company completes (stage 2 "Open balances completed", §MIG-VERIFY PASS) with no unique-key refusal and the same row counts as company 1', MA.r.ok && MA.a.ok && /Open balances completed/.test(MA.a.msg) && !/duplicate key|ambiguous/i.test(MA.r.msg + MA.a.msg) && J(sM) === J(sA), { r: MA.r.msg, a: MA.a.msg, sM: sM, sA: sA });
  var uuA = q("SELECT count(*) AS n FROM c_location WHERE ad_client_id=? AND c_location_uu IN (SELECT c_location_uu FROM c_location WHERE ad_client_id=?)", [CA, CM])[0].n;
  check('MULTI', 'distinct-uu', 'the two companies hold NO C_Location_UU in common (global unique index, distinct per tenant)', uuA === 0 && q('SELECT count(*) AS n FROM c_location WHERE ad_client_id IN (?,?) AND c_location_uu IS NOT NULL', [CA, CM])[0].n >= 16, uuA);
  var MR = full(TA);
  check('MULTI', 'repeat-still-nothing', 'after company 2 exists, the repeat in company 1 still says "Nothing to do" and loads nothing', MR.r.ok && /Nothing to do/.test(MR.r.msg) && J(snapAll(CA)) === J(sA), { r: MR.r.msg });
  verdict('MULTI');

  // ═══ SECOND file for the company that holds one ═══
  var E2 = JSON.parse(JSON.stringify(EXP)); E2.manifest.company_id = 2; E2.manifest.company_name = 'My Company (Chicago)';
  E2.sets['res.partner'].forEach(function (p) { p.name = p.name + ' CHI'; if (p.ref) p.ref = p.ref + 'C'; });
  E2.sets['product.product'].forEach(function (p) { if (p.default_code) p.default_code = p.default_code + 'C'; p.name = p.name + ' CHI'; });
  E2.sets.open_lines.forEach(function (l) { l.move_name = l.move_name + '/C'; l['move_id__name'] = l.move_name; }); E2.sets.open_moves.forEach(function (m) { m.name = m.name + '/C'; });
  var S2 = TA._ses.rows(files(E2), answer(A1.rows)), prob2 = S2.filter(function (r) { return /^⚠/.test(r.item); }).map(function (r) { return r.item; }), B2 = full(TA, E2), sB = snapAll(CA);
  say('§REC-SECOND problems=' + J(prob2.map(function (t) { return t.slice(0, 200); })) + ' stage1=' + B2.r.ok + ' msg=' + String(B2.r.msg).slice(0, 220));
  check('SECOND', 'plain-words', 'a different cut-over file is refused with ONE problem row that names the cause (already has an opening balance, a different cut-over) and the action (new company) - no "ambiguous", no "row error"', prob2.length >= 1 && prob2.some(function (t) { return /already has an opening balance/.test(t) && /different cut-over/.test(t) && /new company/.test(t); }) && !prob2.some(function (t) { return /ambiguous|row error/i.test(t); }), prob2);
  check('SECOND', 'nothing-written', 'the refused second file changes nothing: all ' + CT.length + ' counts identical to the first migration', !B2.r.ok && J(sB) === J(sA), { before: sA, after: sB, msg: B2.r.msg });
  verdict('SECOND');

  // ═══ RESUME ═══
  var TC = mk('Resume Co'), CC = TC.clientId, EF = JSON.parse(JSON.stringify(EXP)), gone = EF.sets.open_lines.filter(function (l) { return l.move_type === 'out_invoice'; }).pop();
  EF.sets.open_lines = EF.sets.open_lines.filter(function (l) { return l !== gone; }); EF.manifest.sets.open_lines.count -= 1;
  var goneAmt = money(Math.abs(cents(gone.amount_residual))), C1 = full(TC, EF);
  check('RESUME', 'refused-named', 'stage 2 of the short file is refused and names ' + goneAmt + ' left on AR Clearing; the staging rows stay pending and the message says what to do next', C1.r.ok && !C1.a.ok && String(C1.a.msg).indexOf(goneAmt) >= 0 && /AR clearing/.test(C1.a.msg), C1.a.msg);
  var pend = q("SELECT (SELECT count(*) FROM i_gljournal WHERE ad_client_id=? AND i_isimported<>'Y') AS g, (SELECT count(*) FROM i_invoice WHERE ad_client_id=? AND i_isimported<>'Y') AS i", [CC, CC])[0], bk0 = n(CC, 'c_bank'), bp0 = n(CC, 'c_bpartner');
  check('RESUME', 'next-step-in-text', 'the refusal text tells the user what to do next (Process the corrected file again)', /Process (this|the corrected) file again|Process again/i.test(String(C1.a.msg)), C1.a.msg);
  m0 = SHIPPED.length; var C2 = full(TC), sC = snapAll(CC), bC = books(CC);
  say('§REC-RESUME pending_before=' + J(pend) + ' corrected: stage1=' + C2.r.ok + ' ' + String(C2.r.msg).slice(0, 120) + ' | stage2=' + C2.a.ok + ' ' + String(C2.a.msg).slice(0, 200) + ' counts=' + J(sC));
  check('RESUME', 'completes', 'the corrected file Processed on the same company completes: stage 2 "Open balances completed", §MIG-VERIFY PASS judged>0', C2.r.ok && C2.a.ok && /Open balances completed/.test(C2.a.msg) && /verdict=PASS judged=[1-9]/.test(ver(m0)), { r: C2.r.msg, a: C2.a.msg, ver: ver(m0) });
  check('RESUME', 'no-duplicates', 'staging rows replaced, not doubled: i_invoice=' + NDOC + ', one journal batch, ' + NDOC + ' invoices, one bank, no partner twice', sC.i_invoice === NDOC && sC.gl_journalbatch === 1 && sC.c_invoice === NDOC && sC.c_bank === bk0 && sC.c_bpartner === bp0, sC);
  check('RESUME', 'clearing-zero', 'AR / AP / Bank Clearing end at 0.00 and the books sum to 0.00', ['AR', 'AP', 'BANK'].every(function (k) { return !bC[CLRV[k]]; }) && Object.keys(bC).reduce(function (x, a) { return x + bC[a]; }, 0) === 0, bC);
  verdict('RESUME');

  // ═══ HANDFIN ═══
  var TD = mk('Hand Co'), CD = TD.clientId, D1 = full(TD, EF);
  var H = AF && ML.run(k.q, k.env(TD), { table: 'ad_form', timing: 'PROCESS', fn: function (trx) { var as = trx.q('SELECT c_acctschema1_id AS id FROM ad_clientinfo WHERE ad_client_id=?', [CD])[0];
    var r1 = AP.runInTrx(trx, 220, { params: { AD_Client_ID: CD, AD_Org_ID: Number(trx.env.org || 0), C_AcctSchema_ID: as && as.id, IsValidateOnly: 'N', IsImportOnlyNoErrors: 'Y', DeleteOldImported: 'N' } });
    var r2 = AP.runInTrx(trx, 207, { params: { AD_Client_ID: CD, AD_Org_ID: Number(trx.env.org || 0), DocAction: 'CO', DeleteOldImported: 'N' } }); return { ok: !!(r1 && r1.ok && r2 && r2.ok), msg: 'hand' }; } });
  if (H && H.ok && H.ops && H.ops.length) k.commit(TD, H.ops, { ws: 'hand' });
  var dr = q("SELECT count(*) AS n FROM gl_journalbatch WHERE ad_client_id=? AND docstatus<>'CO'", [CD])[0].n, d0 = snapAll(CD), bD0 = books(CD);
  say('§REC-HANDFIN refused=' + (!D1.a.ok) + ' by_hand ok=' + (H && H.ok) + ' drafted_batches=' + dr + ' invoices=' + d0.c_invoice + ' AR_clearing=' + money(bD0[CLRV.AR] || 0));
  check('HANDFIN', 'precondition', 'control: after the refusal and the by-hand import the journal is Drafted, ' + (NDOC - 1) + ' invoices are in and AR Clearing is not 0.00 (the silent state F2 describes)', !D1.a.ok && dr === 1 && d0.c_invoice === NDOC - 1 && (bD0[CLRV.AR] || 0) !== 0, { dr: dr, d0: d0, ar: bD0[CLRV.AR] });
  m0 = SHIPPED.length; var D2 = full(TD), d1 = snapAll(CD), bD1 = books(CD);
  say('§REC-HANDFIN corrected: stage1=' + D2.r.ok + ' ' + String(D2.r.msg).slice(0, 100) + ' | stage2=' + D2.a.ok + ' ' + String(D2.a.msg).slice(0, 220) + ' counts=' + J(d1));
  check('HANDFIN', 'resumes', 'the corrected file Processed again Completes the Drafted journal, imports ONLY the missing document (' + NDOC + ' in all, none twice), one journal batch, §MIG-VERIFY PASS', D2.r.ok && D2.a.ok && d1.c_invoice === NDOC && d1.gl_journalbatch === 1 && q("SELECT count(*) AS n FROM gl_journalbatch WHERE ad_client_id=? AND docstatus='CO'", [CD])[0].n === 1 && /verdict=PASS judged=[1-9]/.test(ver(m0)), { r: D2.r.msg, a: D2.a.msg, d1: d1 });
  check('HANDFIN', 'clearing-zero', 'AR / AP / Bank Clearing end at 0.00 and the books sum to 0.00 (reported, no longer silent)', ['AR', 'AP', 'BANK'].every(function (kk) { return !bD1[CLRV[kk]]; }) && Object.keys(bD1).reduce(function (x, a) { return x + bD1[a]; }, 0) === 0, bD1);
  verdict('HANDFIN');

  var ALLV = ['NOSAMPLE', 'REPEAT', 'MULTI', 'SECOND', 'RESUME', 'HANDFIN'].map(function (c) { return CASES[c] ? (CASES[c].failed ? 'FAIL' : 'PASS') : 'INCONCLUSIVE'; });
  say('§REC-VERDICT ' + (!ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS') + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' cases=' + J(ALLV));
  process.exit(!ALL.judged ? 3 : ALL.failed ? 1 : 0);
})();
