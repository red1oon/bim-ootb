#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-GENESIS-REAL-POSTER (bim-compiler prompts/SQLiteIDEMPIERE.md §POSTING-PARITY 5g). READ THE LOG: §WGRP lines; exit code is not evidence.
// THE ISSUE: genesis.html booked its born tenant's sample invoice with the doc_poster invoice fold - a SECOND posting implementation beside the real poster
//   (model_post) - because the born tenant has no dictionary for the model layer. Owner decision: ship a GENERATED dictionary subset (genesis_dict.js).
//   G1 the page's path (Genesis.buildPostingDb(GENESIS_DICT) + Genesis.postSampleInvoice, the born tenant as birthTenant returns it) posts through the REAL
//      poster to the cent: DR 12110 109.00 / CR 41000 100.00 / CR 21610 9.00, balanced, state=posted
//   G2 the same invoice of the same born tenant merged into the FULL seed posts the SAME facts (value x side x amount) - the subset loses nothing
//   G3 nothing is written: the posting db's fact_acct stays empty and the invoice's Posted flag is not Y (previewFacts runs on a never-committed Trx)
//   G4 erp/genesis_dict.js is what the generator makes from the shipped seed now (--check UP-TO-DATE)
//   G5 (INFO, never a PASS) the measured dependence of THIS invoice's facts on the AD_Table/AD_Column/AD_DDL_Default rows: none - the model layer's
//      fallbacks give the same facts for a completed AR invoice; the rows stay in the subset so genesis runs the app's code path (idempiere.html has the dictionary).
//   MUTANT: MUT=notaxacct (c_tax_acct dropped from the subset) must FAIL G1. Nothing judged -> INCONCLUSIVE.
// Run: node erp/tests/witness_genesis_real_poster.js
'use strict';
var fs = require('fs'), path = require('path'), cp = require('child_process');
var ERP = path.join(__dirname, '..'), MUT = process.env.MUT || '';
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js'); }
var log = function (s) { console.log(s); }, pass = 0, fail = 0, inc = 0;
var ok = function (id, n, c, d) { log((c === null ? '  ⚠ ' : c ? '  ✅ ' : '  ❌ ') + id + ' ' + n + (d ? ' — ' + d : '')); c === null ? inc++ : c ? pass++ : fail++; };
global.window = global;
require(path.join(ERP, 'genesis_seed.js'));
var G = require(path.join(ERP, 'genesis.js')), DICT = JSON.parse(JSON.stringify(require(path.join(ERP, 'genesis_dict.js'))));
var ML = require(path.join(ERP, 'model_layer.js'));
['model_trade', 'model_cost', 'model_post'].forEach(function (m) { require(path.join(ERP, m + '.js')); });
var MP = require(path.join(ERP, 'model_post.js'));
var key = function (gl) { return gl.lines.map(function (l) { return l.value + ':' + (l.amtacctdr ? 'DR' + Math.round(l.amtacctdr * 100) : 'CR' + Math.round(l.amtacctcr * 100)); }).sort().join(' '); };
initSqlJs().then(function (SQL) {
  if (MUT === 'notaxacct') { DICT.order = DICT.order.filter(function (t) { return t !== 'c_tax_acct'; }); delete DICT.ddl.c_tax_acct; }   // the subset loses a table the born tenant writes and the poster reads
  var input = { clientName: 'WitnessCo', currencyId: 100, currencyPrecision: 2, adminUser: 'admin', dateAcct: '2024-01-15' };
  // G1 - the page's path
  var born = G.birthTenant(input), raw = G.buildPostingDb(SQL, DICT), r1 = null, e1 = null;
  try { r1 = G.postSampleInvoice({ raw: raw, born: born, ML: ML, MP: MP }); } catch (e) { e1 = String(e).slice(0, 200); }
  var gl = r1 && r1.gl, by = {}; (gl ? gl.lines : []).forEach(function (l) { by[l.value] = l; });
  var cent = !!(by['12110'] && by['12110'].amtacctdr === 109 && by['41000'] && by['41000'].amtacctcr === 100 && by['21610'] && by['21610'].amtacctcr === 9);
  log('§WGRP G1 subset db tables=' + DICT.order.length + ' merged=' + (r1 && r1.merged) + ' state=' + (r1 && r1.pf.state) + (r1 && r1.pf.refusal ? ' refusal=' + r1.pf.refusal : '') + (e1 ? ' EXC=' + e1 : '') + ' facts=' + (gl ? key(gl) : '-') + ' balanced=' + (gl && gl.balanced) + ' say=' + (r1 ? r1.pf.say.join(' ; ').slice(0, 300) : ''));
  ok('G1', 'the page path posts the sample invoice through the REAL poster: DR 12110 109.00 / CR 41000 100.00 / CR 21610 9.00, balanced', r1 ? (r1.pf.state === 'posted' && gl.lines.length === 3 && gl.balanced && cent) : false, gl ? key(gl) : e1);
  // G3 - nothing written
  var fa = raw.exec('SELECT COUNT(*) FROM fact_acct')[0].values[0][0], pst = (raw.exec('SELECT posted FROM c_invoice WHERE c_invoice_id=' + (r1 ? r1.invId : 0))[0] || { values: [[null]] }).values[0][0];
  log('§WGRP G3 fact_acct rows after the preview=' + fa + ' invoice posted=' + pst);
  ok('G3', 'nothing committed: fact_acct empty, Posted not Y', r1 ? (Number(fa) === 0 && pst !== 'Y') : null, 'fact_acct=' + fa + ' posted=' + pst);
  // G2 - the full seed
  var full = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) try { full.run(st); } catch (e) { } });
  var bornF = G.rebandGenesis(G.birthTenant(input), { clientId: G.nextClientId(G.b3(full)) }), r2 = null, e2 = null;
  try { r2 = G.postSampleInvoice({ raw: full, born: bornF, ML: ML, MP: MP }); } catch (e) { e2 = String(e).slice(0, 200); }
  log('§WGRP G2 full seed client=' + bornF.clientId + ' state=' + (r2 && r2.pf.state) + (e2 ? ' EXC=' + e2 : '') + ' facts=' + (r2 ? key(r2.gl) : '-'));
  ok('G2', 'the same invoice on the FULL seed posts the same facts (value x side x amount) - the subset loses nothing', r1 && r2 ? key(r1.gl) === key(r2.gl) && r2.gl.lines.length === 3 : null, (r1 ? key(r1.gl) : '-') + ' vs ' + (r2 ? key(r2.gl) : '-'));
  // G4 - in sync with the seed
  var chk = cp.spawnSync(process.execPath, [path.join(ERP, 'patches/build_genesis_dict.js'), '--check'], { encoding: 'utf8' }), line = (chk.stdout.match(/§GDICT CHECK[^\n]*/) || ['(no check line)'])[0];
  log('§WGRP G4 ' + line);
  ok('G4', 'erp/genesis_dict.js == what the generator makes from the shipped seed now', chk.status === 0 && /UP-TO-DATE/.test(line), line);
  // G5 - INFO: is the dictionary load-bearing for this invoice?
  var ND = JSON.parse(JSON.stringify(DICT)); ['ad_table', 'ad_column', 'ad_ddl_default'].forEach(function (t) { ND.rows[t].vals = []; });
  var r5 = null; try { r5 = G.postSampleInvoice({ raw: G.buildPostingDb(SQL, ND), born: G.birthTenant(input), ML: ML, MP: MP }); } catch (e) { }
  var full5 = function (r) { return r ? JSON.stringify(r.pf.facts.map(function (f) { var o = {}; Object.keys(f).sort().forEach(function (c) { if (!/_uu$|^created|^updated/.test(c)) o[c] = f[c]; }); return o; })) : null; };
  log('§WGRP G5 INFO dictionary rows (ad_table/ad_column/ad_ddl_default) load-bearing for this invoice: ' + (full5(r5) === full5(r1) ? 'NO (same facts without them - the model layer fallbacks agree here; rows kept for the app code path)' : 'YES (facts differ without them)'));
  var verdict = fail ? 'FAIL' : inc ? 'INCONCLUSIVE' : 'PASS';
  log('§WGRP-SUMMARY ' + verdict + ' mutant=' + (MUT || 'none') + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc);
  process.exit(fail ? 1 : inc ? 3 : 0);
}).catch(function (e) { console.log('§WGRP CRASH ' + (e.stack || e)); process.exit(2); });
