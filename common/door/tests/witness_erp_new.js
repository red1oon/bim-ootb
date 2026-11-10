#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-ERP-NEW (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §R.V item 2). READ THE §-LOG after every run; an exit code is not evidence.
 * ISSUE: `erp.new` creates a record the window would not create (a column the window's callouts fill is empty, a mandatory column is skipped, a name is guessed), or an AI's create runs without a person.
 * Model: the ERP seed through the door; the op-log and journal are in a temp folder. The comparison record is erp_draft.js (the Sales Order keyed by hand with every column spelled out).
 *   N1 an Order header from partner + doctype + sales rep + issotrx: the answer starts with `number`, docStatus DR, the Document No equals the row the engine stored
 *   N2 the window path filled location, price list, warehouse, payment term, bill-to and currency to the SAME values the hand-keyed draft carries
 *   N3 a line by the document's NUMBER (order=<no>): Line 10, price, tax, UOM and line amount equal the draft's line for the same facts; the header's totals follow (TotalLines = GrandTotal = draft's)
 *   N4 the created order completes (DR -> CO): a record the engine accepts
 *   N5 a partner and a product given by NAME resolve to the same keys as the ids; a name no record has, and an ambiguous parent number (60000 on two orders), are refused naming the reason, and write nothing
 *   N6 a mandatory column left empty (no sales rep) is refused naming it; nothing is written
 *   N7 an unknown column is refused naming the kind's properties; a Sales/Purchase document without issotrx is refused; nothing is written
 *   N8 an AI's erp.new is a claim: nothing written; a person confirms it with --confirm and it runs once
 * Falsifiers (each must make this witness FAIL): NEW_BREAK=nocallouts (N2, N3) · NEW_BREAK=nomandatory (N6).
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { kit, run, DOOR, ROOT } = require('./_kit');
const DR = require('./erp_draft.js');
const k = kit('W-ERP-NEW');
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erpnew_')), OPS = path.join(dir, 'ops.jsonl'), J = path.join(dir, 'journal.jsonl'), env = { BIM_OBJECT_OPLOG: OPS, BIM_DOOR_JOURNAL: J };
  const nops = () => { try { return fs.readFileSync(OPS, 'utf8').split('\n').filter(Boolean).length; } catch (e) { return 0; } };
  let seq = 0;
  const door = async (line, actor) => { const r = await run(DOOR, ['--actor', actor || 'human', '--request', 'en-' + (++seq), '--journal', J, line], env); let j = null; try { j = JSON.parse(r.out.trim()); } catch (e) {} return { j, r }; };
  const read = async (kind, number) => { const d = await door('erp.read kind=' + kind + ' number=' + number); return d.j && d.j.answer && d.j.answer.record; };
  // the comparison record: the same facts keyed by hand, in its own op-log
  const draft = await DR.draftOrder({ oplog: path.join(dir, 'draft.ops.jsonl') }, {});
  const H = 'erp.new kind=Order issotrx=Y c_doctypetarget_id=132 c_bpartner_id=112 salesrep_id=101';
  // N1
  const n1 = await door(H), a1 = n1.j && n1.j.answer;
  const keys = a1 ? Object.keys(a1) : [];
  const rec = a1 ? await read('Order', a1.number) : null;
  k.chk('N1 header created: the answer starts with number, status DR, number = the stored Document No', !!a1 && keys[0] === 'number' && a1.docStatus === 'DR' && !!rec && String(rec.documentno) === String(a1.number), a1 ? 'number=' + a1.number + ' first=' + keys[0] : (n1.j ? n1.j.status + ' ' + n1.j.why : n1.r.err.slice(-200)));
  if (!a1) { k.incon('N2-N8', 'the header did not create, so nothing else can be judged'); return k.end(); }
  // N2
  const hand = draft.facts, dr = await (async () => { const d = await door('erp.read kind=Order id=' + draft.id); return d.j && d.j.answer && d.j.answer.record; })();
  const cols = ['c_bpartner_location_id', 'm_pricelist_id', 'm_warehouse_id', 'c_paymentterm_id', 'bill_bpartner_id', 'bill_location_id', 'c_currency_id', 'issotrx', 'docstatus'];
  const diff = rec && dr ? cols.filter(c => String(rec[c]) !== String(dr[c])) : cols;
  k.chk('N2 callout-filled columns equal the hand-keyed draft\'s (' + cols.length + ' columns)', !!rec && !!dr && diff.length === 0, diff.length ? diff.map(c => c + ': new=' + (rec && rec[c]) + ' draft=' + (dr && dr[c])).join('; ') : 'location=' + rec.c_bpartner_location_id + ' pricelist=' + rec.m_pricelist_id + ' warehouse=' + rec.m_warehouse_id + ' term=' + rec.c_paymentterm_id);
  // N3
  const n3 = await door('erp.new kind=C_OrderLine order=' + a1.number + ' m_product_id=' + hand.product + ' qtyentered=' + hand.qty), a3 = n3.j && n3.j.answer, l = a3 && a3.record, dl = draft.lines[0];
  const hdr = await read('Order', a1.number);
  k.chk('N3 line by the document number: Line 10, price, tax, amount = the draft\'s; header totals follow', !!l && l.line === 10 && Number(l.priceactual) === Number(dl.priceactual) && Number(l.c_tax_id) === Number(dl.c_tax_id) && Number(l.linenetamt) === Number(dl.linenetamt) && Number(l.qtyordered) === Number(dl.qtyordered) && !!hdr && Number(hdr.totallines) === Number(draft.totalLines) && Number(hdr.grandtotal) === Number(draft.grandTotal),
    l ? 'line=' + l.line + ' price=' + l.priceactual + ' tax=' + l.c_tax_id + ' net=' + l.linenetamt + ' | header total=' + (hdr && hdr.totallines) + '/' + (hdr && hdr.grandtotal) + ' draft=' + draft.totalLines + '/' + draft.grandTotal : (n3.j ? n3.j.status + ' ' + n3.j.why : n3.r.err.slice(-200)));
  // N4
  const n4 = await door('erp.complete kind=Order number=' + a1.number);
  k.chk('N4 the created order completes: DR -> CO', n4.j && n4.j.status === 'ok' && n4.j.answer.after.docStatus === 'CO', n4.j ? n4.j.status + ' ' + String(n4.j.why || '').slice(0, 120) : 'no json');
  // N5: names (independent SQL on the seed)
  const SQL = await require(path.join(ROOT, 'common/lib/sql-wasm.js'))({ wasmBinary: fs.readFileSync(path.join(ROOT, 'common/lib/sql-wasm.wasm')) });
  const E = new SQL.Database(fs.readFileSync(path.join(ROOT, 'erp', 'ad_seed.db')));
  const one = (sql) => { const r = E.exec(sql); return r.length ? r[0].values[0][0] : null; };
  const bpName = one('SELECT name FROM c_bpartner WHERE c_bpartner_id=112'), prName = one('SELECT name FROM m_product WHERE m_product_id=' + hand.product);
  const bpDup = Number(one("SELECT count(*) FROM c_bpartner WHERE ad_client_id IN (0,11) AND (lower(name)=lower('" + String(bpName).replace(/'/g, "''") + "') OR lower(value)=lower('" + String(bpName).replace(/'/g, "''") + "'))")), prDup = Number(one("SELECT count(*) FROM m_product WHERE ad_client_id IN (0,11) AND (lower(name)=lower('" + String(prName).replace(/'/g, "''") + "') OR lower(value)=lower('" + String(prName).replace(/'/g, "''") + "'))"));
  const before5 = nops();
  if (bpDup !== 1 || prDup !== 1) k.incon('N5a', 'the partner or product name is not unique in the seed (' + bpDup + '/' + prDup + '); cannot judge name resolution');
  else {
    const nn = await door('erp.new kind=Order issotrx=Y c_doctypetarget_id=132 c_bpartner_id="' + bpName + '" salesrep_id=101'), r5 = nn.j && nn.j.answer && nn.j.answer.record;
    k.chk('N5a a partner given by NAME ("' + bpName + '") resolves to key 112 and the same defaults', !!r5 && Number(r5.c_bpartner_id) === 112 && Number(r5.c_bpartner_location_id) === Number(rec.c_bpartner_location_id), r5 ? 'bp=' + r5.c_bpartner_id : (nn.j ? nn.j.status + ' ' + nn.j.why : ''));
  }
  const before5b = nops();
  const bad5 = [await door('erp.new kind=Order issotrx=Y c_doctypetarget_id=132 c_bpartner_id="No Such Partner 9z" salesrep_id=101'), await door('erp.new kind=C_OrderLine order=60000 m_product_id=' + hand.product + ' qtyentered=1')];
  k.chk('N5b an unknown name and an ambiguous parent number (60000) are refused with a reason and write nothing', bad5.every(d => d.j && d.j.status === 'refused' && /No Such Partner|60000/.test(String(d.j.why))) && nops() === before5b, bad5.map(d => d.j ? d.j.status + ': ' + String(d.j.why).slice(0, 80) : 'nojson').join(' | '));
  // N6 / N7
  const b6 = nops(), d6 = await door('erp.new kind=Order issotrx=Y c_doctypetarget_id=132 c_bpartner_id=112');
  k.chk('N6 mandatory SalesRep_ID left empty: refused naming it, nothing written', d6.j && d6.j.status === 'refused' && /SalesRep_ID/.test(String(d6.j.why)) && nops() === b6, d6.j ? d6.j.status + ': ' + String(d6.j.why).slice(0, 100) : 'nojson');
  const b7 = nops(), d7a = await door('erp.new kind=Order issotrx=Y nosuchcol=1'), d7b = await door('erp.new kind=Order c_bpartner_id=112 salesrep_id=101');
  k.chk('N7 an unknown column and a missing issotrx are refused, nothing written', d7a.j && d7a.j.status === 'refused' && /nosuchcol/.test(String(d7a.j.why)) && d7b.j && d7b.j.status === 'refused' && /issotrx/i.test(String(d7b.j.why)) && nops() === b7, [d7a, d7b].map(d => d.j ? d.j.status : 'nojson').join(','));
  // N8
  const b8 = nops(), c8 = await door(H, 'ai'), claimed = c8.j && c8.j.status === 'claim' && nops() === b8;
  const cl = await run(DOOR, ['--journal', J, '--claims'], env); let held = []; try { held = JSON.parse(cl.out.trim()).claims; } catch (e) {}
  const mine = held.filter(c => c.line === H)[0];
  const cf = mine ? await run(DOOR, ['--journal', J, '--confirm', mine.request], env) : null; let cj = null; try { cj = JSON.parse(cf.out.trim()); } catch (e) {}
  const after = nops(), cf2 = mine ? await run(DOOR, ['--journal', J, '--confirm', mine.request], env) : null;
  k.chk('N8 an AI\'s erp.new is a held claim (nothing written); a person\'s confirm creates it once, a second confirm creates nothing', claimed && !!cj && cj.status === 'ok' && !!cj.answer && cj.answer.number != null && after > b8 && nops() === after, 'claim=' + (c8.j && c8.j.status) + ' confirmed=' + (cj && cj.status) + ' ops ' + b8 + '->' + after + '->' + nops());
  k.end();
})().catch(e => { console.log('§WITNESS_ERP_NEW verdict=INCONCLUSIVE ' + (e && e.stack || e)); process.exit(2); });
