#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-ASI-CREATE (bim-compiler prompts/ERP_PRODUCT_ATTRIBUTE_ASI.md §4 AS-1; TWIN CARDINAL RULE). READ THE LOG: §ASI lines and the verdict §ASI-SUMMARY; the exit code alone is not evidence.
// THE ISSUE it proves/disproves: the twin had NO way to create an Attribute Set Instance the way legacy does (Lot / Serial No / Guarantee Date / description / M_Lot register, counters
//   MLotCtl + MSerNoCtl) and no model for M_AttributeSetInstance / M_AttributeSet (their afterSave / beforeSave). Part 1 (ORACLE, rolled back, ordinary use of makedoc): the legacy row after
//   saving an ASI without a Description (afterSave := its id), with one, and the legacy M_AttributeSet.beforeSave IsInstanceAttribute rule, against the twin row column by column.
//   Part 2 (TWIN-ONLY = NOTED-AS-DESIGNED, §62: the legacy createLot/createSerNo/setDescription/saveSelection are not reachable by an existing oracle op and no pilot config may change):
//   judged by invariants - counter arithmetic, M_Lot linked, guarantee date = today + days, description text per MAttributeSetInstance.setDescription, mandatory refusals of
//   WPAttributeDialog.saveSelection. Zero judged prints INCONCLUSIVE, never PASS. Negative controls (MUST exit 1): ASI_BREAK=nodesc (afterSave model off) / nocounter (counter not advanced) / nolot (no M_Lot row).
// Run: NODE_PATH=$HOME/bim-ootb/tests/node_modules:$HOME/bim-ootb/node_modules node erp/tests/witness_asi_create.js   (pilot + oracle :8097)
'use strict';
var C = require('./dd_common.js');
var pass = 0, fail = 0, inc = 0, noted = 0, judged = 0, BREAK = process.env.ASI_BREAK || '';
var log = function (s) { console.log(s); };
var ok = function (id, n, c, d) { judged++; log((c === null ? '  ⚠ ' : c ? '  ✅ ' : '  ❌ ') + id + ' ' + n + (d ? ' — ' + d : '')); c === null ? inc++ : c ? pass++ : fail++; };
var note = function (id, d) { noted++; log('  ℹ NOTED-AS-DESIGNED ' + id + ' - ' + d); };

(async function main() {
  var H = await C.boot(), TODAY = H.TODAY, q = H.q, lc = C.lc;
  var ASI; try { ASI = require('../model_asi.js'); } catch (e) { ASI = { plan: function () { return { ok: false, errors: ['model_asi.js absent (twin cannot create an ASI)'], rows: [], description: '' }; }, form: function () { return { ok: false, attributes: [] }; }, create: function () { return { ok: false, error: 'model_asi.js absent' }; } }; log('§ASI-RED model_asi.js absent'); }
  if (BREAK === 'nodesc') H.ML.registerModel('m_attributesetinstance', { afterSave: function () { return null; } });
  log('§ASI-SEED patches ok=' + H.patchOk + ' failed=' + H.patchBad + ' today=' + TODAY + ' break=' + (BREAK || 'none'));
  var CTX = Object.assign({ date: TODAY }, H.ctx);
  var sp = null, n = 0;
  var fresh = function () { if (sp) { H.rollback(sp); sp = null; } sp = 'c' + (++n); H.begin(sp); };
  var skip = { m_attributesetinstance_id: 1, m_attributesetinstance_uu: 1, m_lot_id: 1 };

  // ── Part 1: ORACLE rows (legacy saves the PO, rolled back) vs the twin's save of the same field values ─────────────────
  var P1 = [
    { id: 'O1-asi-no-description', note: 'new ASI of the Fertilizer Lot set with Lot only: afterSave sets Description := id', table: 'M_AttributeSetInstance', fields: { AD_Org_ID: 0, M_AttributeSet_ID: 101, Lot: 'L-ORACLE-1' }, key: 'm_attributesetinstance',
      q: 'SELECT m_attributeset_id, lot, serno, guaranteedate, description, m_lot_id, ad_org_id, isactive FROM m_attributesetinstance WHERE m_attributesetinstance_id=?' , descIsId: true },
    { id: 'O2-asi-with-description', note: 'a given Description is kept', table: 'M_AttributeSetInstance', fields: { AD_Org_ID: 0, M_AttributeSet_ID: 102, SerNo: 'SN-ORACLE-1', Description: 'my text' }, key: 'm_attributesetinstance',
      q: 'SELECT m_attributeset_id, lot, serno, guaranteedate, description, m_lot_id, ad_org_id, isactive FROM m_attributesetinstance WHERE m_attributesetinstance_id=?' },
    { id: 'O3-set-instance-flag', note: 'a new Attribute Set with Lot=Y becomes IsInstanceAttribute=Y (MAttributeSet.beforeSave :462-470)', table: 'M_AttributeSet', fields: { AD_Org_ID: 0, Name: 'W-ASI probe set', IsLot: 'Y' }, key: 'm_attributeset',
      q: 'SELECT name, islot, isserno, isguaranteedate, isinstanceattribute, mandatorytype FROM m_attributeset WHERE m_attributeset_id=?' }
  ];
  for (var pi = 0; pi < P1.length; pi++) {
    var K = P1[pi], L;
    try { L = (await C.oracle({ op: 'makedoc', ctx: CTX, header: { table: K.table, fields: K.fields }, lines: [], queries: { row: K.q } })).doc; }
    catch (e) { ok('ORACLE-' + K.id, 'oracle reachable', false, String(e.message)); continue; }
    if (L.exception) { ok(K.id, 'legacy saved the fixture', null, 'LEGACY-REFUSED ' + String(L.exception).slice(0, 160)); continue; }
    var lrow = (L.rows.row || [])[0]; if (!lrow) { ok(K.id, 'legacy row read back', null, 'no row'); continue; }
    fresh();
    var r = H.save(K.key, K.fields); if (!r.ok) { ok(K.id, 'twin save', false, r.error || r.msg); continue; }
    var tid = H.lastId(K.key), trow = H.one(K.q, [tid]);
    var cmp = C.cmpRow(lc(lrow), trow, { skip: skip });
    if (K.descIsId) { // legacy description = its id, twin description = its id (the ids differ by database)
      var lOk = String(lrow.description) === String(L.id), tOk = String(trow.description) === String(tid);
      ok(K.id + '-description-is-id', K.note, lOk && tOk, 'legacy desc=' + lrow.description + ' (id ' + L.id + ') twin desc=' + trow.description + ' (id ' + tid + ')');
      cmp.diffs = cmp.diffs.filter(function (d) { return !/^description /.test(d); });
    }
    ok(K.id, K.note + ' - ' + cmp.n + ' columns compared', cmp.diffs.length === 0 && cmp.n > 0, cmp.diffs.join('; ') || undefined);
    log('§ASI case=' + K.id + ' legacy=' + JSON.stringify(lrow) + ' twin=' + JSON.stringify(trow));
  }

  // ── Part 2: TWIN-ONLY invariants (NOTED-AS-DESIGNED: the legacy methods are not reachable by an existing oracle op) ──────────
  var run = function (o, extra) {   // create() inside one Trx, committed like a window save
    var out = null, r = H.run({ table: 'm_attributesetinstance', timing: 'PROCESS', fn: function (trx) {
      if (BREAK === 'nocounter') { var u0 = trx.update; trx.update = function (t, row, ch) { return t === 'm_lotctl' ? row : u0.call(trx, t, row, ch); }; }   // negative control: the counter is not advanced
      if (BREAK === 'nolot') { var i0 = trx.insert; trx.insert = function (t, f) { return t === 'm_lot' ? { m_lot_id: null } : i0.call(trx, t, f); }; }      // negative control: no M_Lot row
      out = ASI.create(trx, o); return { ok: out.ok, error: out.error, ops: trx.groupOps ? undefined : undefined }; } });
    return { r: r, out: out };
  };
  var planOnly = function (o) { return ASI.plan({ q: function (s, p) { return q(s, p); } }, o); };
  var ctl0 = q('SELECT currentnext, incrementno, prefix, suffix FROM m_lotctl WHERE m_lotctl_id=100')[0];
  var sn0 = q('SELECT currentnext FROM m_sernoctl WHERE m_sernoctl_id=100')[0];
  log('§ASI-PILOT-CTL lotctl100 currentnext=' + ctl0.currentnext + ' inc=' + ctl0.incrementno + ' prefix=' + ctl0.prefix + ' suffix=' + ctl0.suffix + '; sernoctl100 currentnext=' + (sn0 && sn0.currentnext));
  var mdy = function (iso) { var d = iso.slice(0, 10).split('-'); return d[1] + '/' + d[2] + '/' + d[0]; };
  var addDays = function (iso, k) { var d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); };

  // T1 generateLot / create on the Lot set (product 136 Fertilizer#50, set 101, LotCtl 100, GuaranteeDays 180)
  fresh();
  note('T1', 'MAttributeSetInstance.create / MLotCtl.createLot are not reachable by any oracle op; judged by invariants');
  var pl = planOnly({ productId: 136, mode: 'create', today: TODAY });
  var expLot = (ctl0.prefix || '') + Number(ctl0.currentnext) + (ctl0.suffix || ''), expGd = addDays(TODAY, 180);
  ok('T1-plan', 'plan(create) for the Fertilizer Lot product is ok', pl.ok === true, pl.errors.join('; '));
  var o1 = { productId: 136, mode: 'create', today: TODAY };
  var res = run(o1);
  ok('T1-create', 'create() committed an instance', res.out && res.out.ok === true && res.r.ok, res.out && res.out.error);
  var a1 = res.out && res.out.ok ? q('SELECT * FROM m_attributesetinstance WHERE m_attributesetinstance_id=(SELECT MAX(m_attributesetinstance_id) FROM m_attributesetinstance)')[0] : null;
  var lot1 = q('SELECT * FROM m_lot ORDER BY m_lot_id DESC LIMIT 1')[0], ctl1 = q('SELECT currentnext FROM m_lotctl WHERE m_lotctl_id=100')[0];
  log('§ASI T1 asi=' + JSON.stringify(a1) + ' lot=' + JSON.stringify(lot1) + ' ctl.currentnext ' + ctl0.currentnext + '->' + ctl1.currentnext);
  ok('T1-lot-name', 'Lot = Prefix + CurrentNext + Suffix (' + expLot + ')', !!a1 && a1.lot === expLot, a1 && 'lot=' + a1.lot);
  ok('T1-counter', 'LotCtl.CurrentNext advanced by IncrementNo (' + ctl0.currentnext + ' -> ' + (Number(ctl0.currentnext) + Number(ctl0.incrementno)) + ')', Number(ctl1.currentnext) === Number(ctl0.currentnext) + Number(ctl0.incrementno), 'now ' + ctl1.currentnext);
  ok('T1-m_lot', 'an M_Lot row exists for the product and the instance points at it', !!lot1 && !!a1 && lot1.name === expLot && Number(lot1.m_product_id) === 136 && Number(a1.m_lot_id) === Number(lot1.m_lot_id), 'm_lot=' + JSON.stringify(lot1) + ' asi.m_lot_id=' + (a1 && a1.m_lot_id));
  ok('T1-guarantee', 'GuaranteeDate = today + 180 days (' + expGd + ')', !!a1 && String(a1.guaranteedate).slice(0, 10) === expGd, a1 && 'gd=' + a1.guaranteedate);
  var expDesc1 = '«' + expLot + '»_' + mdy(expGd);
  ok('T1-description', 'Description per setDescription: lot in guillemets then date (' + expDesc1 + ')', !!a1 && a1.description === expDesc1, a1 && 'desc=' + a1.description);

  // T2 a second create takes the next number (no duplicate lot)
  var res2 = run(o1), a2 = q('SELECT * FROM m_attributesetinstance WHERE m_attributesetinstance_id=(SELECT MAX(m_attributesetinstance_id) FROM m_attributesetinstance)')[0];
  ok('T2-next-lot', 'a second instance gets the NEXT lot number, never the same', !!a1 && !!a2 && a2.lot !== a1.lot && Number(a2.lot) === Number(a1.lot) + Number(ctl0.incrementno), 'first ' + (a1 && a1.lot) + ' second ' + (a2 && a2.lot));

  // T3 dialog save with a typed serial (set 102, no SerNoCtl): typed value kept, '#' delimiter, guarantee date typed
  fresh();
  var d3 = planOnly({ productId: 133, mode: 'dialog', today: TODAY, values: { serno: 'SN-77', guaranteedate: '2027-03-01' } });
  ok('T3-plan', 'dialog plan for Patio Chair with a typed serial + date is ok', d3.ok === true, d3.errors.join('; '));
  ok('T3-description', 'Description = "#SN-77_03/01/2027"', d3.description === '#SN-77_03/01/2027', 'desc=' + d3.description);
  ok('T3-no-counter', 'a typed serial advances no counter and creates no M_Lot', d3.rows.filter(function (x) { return x.update || x.table === 'm_lot'; }).length === 0, JSON.stringify(d3.rows.map(function (x) { return x.table || 'upd'; })));

  // T4 mandatory refusals (WPAttributeDialog.saveSelection): the twin DB is changed locally (never the pilot): Lot mandatory + a mandatory attribute
  fresh();
  H.db.run("UPDATE m_attributeset SET islotmandatory='Y' WHERE m_attributeset_id=101");
  var d4 = planOnly({ productId: 136, mode: 'dialog', today: TODAY, values: {} });
  ok('T4-lot-mandatory', 'Lot mandatory and empty -> refused "@FillMandatory@ - Lot"', d4.ok === false && /FillMandatory.* - Lot/.test(d4.errors.join(' ')), d4.errors.join('; '));
  var d4b = planOnly({ productId: 136, mode: 'dialog', today: TODAY, values: { lot: 'L-TYPED' } });
  ok('T4-lot-given', 'Lot mandatory and typed -> accepted, Description has the lot', d4b.ok === true && /L-TYPED/.test(d4b.description), d4b.errors.join('; ') || d4b.description);

  // T5 product with no Attribute Set -> a clear refusal, no rows
  var d5 = planOnly({ productId: 124, mode: 'create', today: TODAY });
  ok('T5-no-set', 'a product without an Attribute Set is refused in words', d5.ok === false && /no Attribute Set/.test(d5.errors.join(' ')), d5.errors.join('; '));

  // T6 product attributes (Product window, T-Shirt set 100: Size, Color are product attributes) -> list values -> M_AttributeInstance rows + description
  fresh();
  var f6 = ASI.form({ q: function (s, p) { return q(s, p); } }, 148, true);
  ok('T6-form', 'Product-window form of T-Shirt lists its product attributes (Size, Color)', f6.ok && f6.attributes.length === 2, JSON.stringify(f6.attributes.map(function (a) { return a.name + ':' + a.type; })));
  var opt = function (a, nm) { return (a.options || []).filter(function (o) { return o.name === nm; })[0]; };
  var byName = function (re) { return f6.attributes.filter(function (a) { return re.test(a.name); })[0]; };
  var sz = byName(/^Size/), co = byName(/^Color/), vals = {};
  if (sz && co && opt(sz, 'Large') && opt(co, 'Red')) { vals[sz.id] = opt(sz, 'Large').id; vals[co.id] = opt(co, 'Red').id; }
  var d6 = planOnly({ productId: 148, mode: 'dialog', productWindow: true, today: TODAY, values: { attrs: vals } });
  ok('T6-plan', 'plan ok and writes one M_AttributeInstance per chosen value', d6.ok && d6.rows.filter(function (x) { return x.table === 'm_attributeinstance'; }).length === 2, d6.errors.join('; '));
  var expOrder = f6.attributes.map(function (a) { return a.id === (sz && sz.id) ? 'Large' : 'Red'; }).join('_');
  ok('T6-description', 'Description of product attributes = values joined by "_" in attribute-use order (' + expOrder + ')', d6.description === expOrder, 'desc=' + d6.description);

  // summary
  var verdict = judged === 0 ? 'INCONCLUSIVE' : fail > 0 ? 'FAIL' : inc > 0 ? 'INCONCLUSIVE' : 'PASS';
  log('§ASI-SUMMARY verdict=' + verdict + ' judged=' + judged + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + ' noted_as_designed=' + noted + ' break=' + (BREAK || 'none'));
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(function (e) { console.log('§ASI-SUMMARY verdict=ERROR ' + (e && e.stack || e)); process.exit(2); });
