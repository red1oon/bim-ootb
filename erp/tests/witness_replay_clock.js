#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-REPLAY-CLOCK (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md Part A, step A0; bim-ootb #2995).
// Read the log after every run: exit code is not evidence.
// ISSUE THIS PROVES OR DISPROVES: "a replay of the op journal on a LATER day re-runs a dated process, which then takes
//   the new day from the wall clock, so the replayed books differ from the live ones" (InvoiceGenerate.js falls back to
//   the wall clock when no date is given; so do other processes).
// POPULATION: REAL rows. Child LIVE (clock fixed at day D): on the seed company, through shipped paths only (model layer
//   save / processIt, ad_process.runInTrx, the kernel's own commit + journal) a new order is completed, shipped (process
//   118), invoiced (process 119 with NO DateInvoiced, so it takes the session's date) and one import process is run.
//   Child REPLAY (clock at D + 3 days, 00:30 local): a fresh kernel, the journal applied by the kernel's OWN replay().
//   Both hash every row of every table the journal's ops touched. One population row per time zone.
// RED CONTROL: the same replay, but the invoice group is NOT applied from the journal: the process is RE-RUN at replay
//   time. That is the defect this witness looks for, made on purpose; it must give match=N.
// ALSO PRINTED, not judged: §REPLAY_CLOCK_SESSION_DAY, the day the kernel's session carries at 00:30 local beside the local
//   calendar day. In a +08 zone they differ (the session takes the UTC day): a separate finding, stated in its own issue.
// INCONCLUSIVE (never PASS) if the invoice process wrote 0 rows, or a child could not run.
// Command: node erp/tests/witness_replay_clock.js
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const ERP = path.join(__dirname, '..');
const MODE = process.env.RC_MODE || '';
const DAY = '2026-11-10';                      // D: the fixed session day of the live run
const say = s => process.stdout.write(s + '\n');

// ── child: a fixed clock, set BEFORE any kernel code loads ───────────────────────────────────────────────
function fixClock(localIso) {
  const Real = Date, base = new Real(localIso).getTime(); let tick = 0;
  class FixedDate extends Real {
    constructor(...a) { if (a.length === 0) super(base + (tick++)); else super(...a); }
    static now() { return base + (tick++); }
  }
  global.Date = FixedDate;
  return { base, real: Real };
}
function hashTables(k, tables) {
  const per = {}; let rows = 0;
  for (const t of tables.slice().sort()) {
    const rs = k.q('SELECT * FROM ' + t).map(r => JSON.stringify(Object.keys(r).sort().map(c => [c, r[c]]))).sort();
    rows += rs.length;
    per[t] = crypto.createHash('sha256').update(rs.join('\n')).digest('hex');
  }
  return { hash: crypto.createHash('sha256').update(JSON.stringify(per)).digest('hex'), per, rows };
}
const tablesOf = entries => Array.from(new Set([].concat.apply([], entries.map(e => ((e.payload && e.payload.ops) || []).map(o => String(o.table || '').toLowerCase()).filter(Boolean)))));
const SESSION = { clientId: 11, orgId: 11, userId: 100, roleId: 102, warehouseId: 103, actor: 'witness:replay-clock' };

async function loadKernel() {
  if (!global.window) global.window = {};
  if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
  const quiet = console.log; console.log = function () {};          // the kernel's own lines are not this witness's verdict
  const K = require(path.join(ERP, 'ws_kernel.js')), k = await K.load(), AP = require(path.join(ERP, 'ad_process.js'));
  require(path.join(ERP, 'ad_callout.js')).bind(function (sql, p) { return k.q(sql, p); });   // the callout runtime the page binds (as witness_migration_trade.js:73 does)
  console.log = quiet;
  return { k, AP };
}
function runInvoice(k, AP) {   // process 119, NO DateInvoiced parameter: the process takes the date of the session it runs in
  return k.inTrx(SESSION, { ws: 'a0:invoice' }, trx => {
    const r = AP.runInTrx(trx, 119, { params: { AD_Client_ID: 11, AD_Org_ID: 11, DocAction: 'CO', ConsolidateDocument: 'Y' } });
    return { ok: !!(r && r.ok), error: r && r.ok ? null : (r && (r.msg || r.error)) };
  });
}

async function live() {
  const clock = fixClock(DAY + 'T10:00:00');
  const { k, AP } = await loadKernel(), ML = k.ML, q = k.q;
  const prod = q("SELECT p.* FROM m_product p JOIN m_storageonhand s ON s.m_product_id=p.m_product_id WHERE p.ad_client_id=11 AND p.isactive='Y' AND p.issold='Y' AND s.qtyonhand>=3 ORDER BY p.m_product_id")[0];
  const wh = q('SELECT l.m_warehouse_id AS id FROM m_locator l JOIN m_storageonhand s ON s.m_locator_id=l.m_locator_id WHERE s.m_product_id=? AND s.qtyonhand>=3 ORDER BY l.m_locator_id', [prod.m_product_id])[0].id;
  const pl = q("SELECT m_pricelist_id AS id FROM m_pricelist WHERE ad_client_id=11 AND issopricelist='Y' AND isactive='Y' ORDER BY isdefault DESC, m_pricelist_id")[0].id;
  const bp = q("SELECT b.c_bpartner_id AS id, (SELECT c_bpartner_location_id FROM c_bpartner_location l WHERE l.c_bpartner_id=b.c_bpartner_id AND l.isactive='Y' ORDER BY 1 LIMIT 1) AS loc FROM c_bpartner b WHERE b.ad_client_id=11 AND b.iscustomer='Y' AND b.isactive='Y' ORDER BY b.c_bpartner_id")[0];
  const pt = q("SELECT c_paymentterm_id AS id FROM c_paymentterm WHERE ad_client_id=11 AND isactive='Y' ORDER BY isdefault DESC, c_paymentterm_id")[0].id;
  const so = q("SELECT c_doctype_id AS id FROM c_doctype WHERE ad_client_id=11 AND docbasetype='SOO' AND docsubtypeso='SO' AND isactive='Y' ORDER BY c_doctype_id")[0].id;
  const steps = {};
  const O = k.inTrx(SESSION, { ws: 'a0:order' }, trx => {
    const o = ML.newPO(trx, 'c_order', { ad_org_id: 11, c_doctypetarget_id: so, c_doctype_id: so, c_bpartner_id: bp.id, c_bpartner_location_id: bp.loc, bill_bpartner_id: bp.id, bill_location_id: bp.loc, m_pricelist_id: pl, c_paymentterm_id: pt, c_currency_id: 100, m_warehouse_id: wh, issotrx: 'Y', docstatus: 'DR', docaction: 'CO', dateordered: DAY, dateacct: DAY, datepromised: DAY });
    const sv = ML.save(trx, 'c_order', null, o); if (!sv.ok) return { ok: false, error: 'save c_order: ' + sv.error };
    const l = ML.newPO(trx, 'c_orderline', { c_order_id: sv.row.c_order_id, ad_org_id: 11, line: 10, m_product_id: prod.m_product_id, c_uom_id: prod.c_uom_id, qtyentered: 3, qtyordered: 3, m_warehouse_id: wh, c_currency_id: 100 });
    const sl = ML.save(trx, 'c_orderline', null, l); if (!sl.ok) return { ok: false, error: 'save c_orderline: ' + sl.error };
    const r = ML.processIt(trx, 'c_order', sv.row.c_order_id, 'CO');
    return { ok: !!r.ok, error: r.ok ? null : (r.msg || r.status) };
  });
  const why = r => (r.ok ? undefined : String((r.log || []).filter(l => /MODEL-ERR/.test(l))[0] || '').split('\n').slice(0, 7).join(' | ').slice(0, 900));   // a failed step names where it failed
  steps.order = { ok: O.ok, error: O.error || null, ops: O.ops.length, why: why(O) };
  const SH = k.inTrx(SESSION, { ws: 'a0:ship' }, trx => { const r = AP.runInTrx(trx, 118, { params: { AD_Client_ID: 11, AD_Org_ID: 11, M_Warehouse_ID: wh, DocAction: 'CO', ConsolidateDocument: 'Y' } }); return { ok: !!(r && r.ok), error: r && r.ok ? null : (r && (r.msg || r.error)) }; });
  steps.ship = { ok: SH.ok, error: SH.error || null, ops: SH.ops.length, why: why(SH) };
  const IV = runInvoice(k, AP);
  steps.invoice = { ok: IV.ok, error: IV.error || null, ops: IV.ops.length, why: why(IV) };
  // one Import* process (ImportOrder, 206): it reads its staging table and stamps with the session's time
  const soName = q('SELECT name FROM c_doctype WHERE c_doctype_id=?', [so])[0].name;
  const IM = k.inTrx(SESSION, { ws: 'a0:import' }, trx => {
    // the staging row carries NO DateOrdered: the process must date the order itself (as witness_import_order.js stages its rows)
    const sv = ML.save(trx, 'i_order', null, ML.newPO(trx, 'i_order', { i_isimported: 'N', issotrx: 'Y', documentno: 'A0-REPLAY-CLOCK-1', doctypename: soName, c_bpartner_id: bp.id, m_product_id: prod.m_product_id, qtyordered: 2, c_uom_id: prod.c_uom_id }));
    if (!sv.ok) return { ok: false, error: 'save i_order: ' + sv.error };
    const r = AP.runInTrx(trx, 206, { params: { AD_Client_ID: 11, AD_Org_ID: 11, DocAction: 'PR' } });
    return { ok: !!(r && r.ok), error: r && r.ok ? null : (r && (r.summary || r.msg || r.error)), summary: r && r.summary };
  });
  steps.import = { ok: IM.ok, error: IM.error || null, ops: IM.ops.length, why: why(IM) };
  const text = k.journal.map(e => JSON.stringify(e)).join('\n');
  fs.writeFileSync(process.env.RC_JOURNAL, text);
  const tables = tablesOf(k.journal), h = hashTables(k, tables);
  const inv = q("SELECT documentno, dateinvoiced, dateacct, created FROM c_invoice WHERE ad_client_id=11 ORDER BY ABS(c_invoice_id) DESC LIMIT 1")[0] || null;
  steps.import.order = q("SELECT documentno, dateordered, dateacct, docstatus FROM c_order WHERE ad_client_id=11 AND documentno='A0-REPLAY-CLOCK-1'")[0] || null;
  say('RC_RESULT ' + JSON.stringify({ mode: 'live', tz: process.env.TZ, clock: new clock.real(clock.base).toISOString(), steps, groups: k.journal.length, ops: k.journal.reduce((n, e) => n + e.ops, 0), tables: tables.length, rows: h.rows, hash: h.hash, per: h.per, invoice: inv }));
}

async function replay() {
  const d3 = new Date(DAY + 'T00:30:00'); d3.setDate(d3.getDate() + 3);
  const pad = n => String(n).padStart(2, '0');
  const clock = fixClock(d3.getFullYear() + '-' + pad(d3.getMonth() + 1) + '-' + pad(d3.getDate()) + 'T00:30:00');
  const { k, AP } = await loadKernel();
  const text = fs.readFileSync(process.env.RC_JOURNAL, 'utf8'), entries = text.split('\n').filter(Boolean).map(l => JSON.parse(l));
  let rerun = null;
  if (process.env.RC_RERUN === '1') {
    // RED CONTROL: apply every group as written, EXCEPT the invoice group: there, re-run the process now (the defect, on purpose)
    for (const e of entries) {
      if (e.meta && e.meta.ws === 'a0:invoice') { const r = runInvoice(k, AP); rerun = { ok: r.ok, error: r.error || null, ops: r.ops.length }; }
      else k.apply(e.payload.ops, e.payload.std);
    }
  } else k.replay(text);
  const tables = tablesOf(entries), h = hashTables(k, tables);
  const inv = k.q("SELECT documentno, dateinvoiced, dateacct, created FROM c_invoice WHERE ad_client_id=11 ORDER BY ABS(c_invoice_id) DESC LIMIT 1")[0] || null;
  // for information (not part of the verdict): the day the kernel's session carries at this moment, beside the LOCAL calendar day
  const realNow = new clock.real(clock.base), localDay = realNow.getFullYear() + '-' + pad(realNow.getMonth() + 1) + '-' + pad(realNow.getDate());
  const sessionDay = String(k.env(SESSION).date).slice(0, 10);
  say('RC_RESULT ' + JSON.stringify({ mode: process.env.RC_RERUN === '1' ? 'rerun' : 'replay', tz: process.env.TZ, clock: new clock.real(clock.base).toISOString(), rerun, localDay, sessionDay, tables: tables.length, rows: h.rows, hash: h.hash, per: h.per, invoice: inv }));
}

if (MODE === 'live') live().catch(e => { say('RC_ERROR ' + String(e && e.stack || e).split('\n').slice(0, 6).join(' | ')); process.exit(3); });
else if (MODE === 'replay') replay().catch(e => { say('RC_ERROR ' + String(e && e.stack || e).split('\n').slice(0, 6).join(' | ')); process.exit(3); });
else {
  // ── parent: one row per time zone, judged through the witness contract ──
  const { Witness } = require('../../witness_kit/contract');
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-clock-'));
  function child(mode, tz, extra) {
    const r = cp.spawnSync(process.execPath, [__filename], { encoding: 'utf8', maxBuffer: 1 << 26, timeout: 600000,
      env: Object.assign({}, process.env, { RC_MODE: mode, TZ: tz, RC_JOURNAL: path.join(TMP, 'journal_' + tz.replace(/\W/g, '_') + '.jsonl') }, extra || {}) });
    const line = (r.stdout || '').split('\n').find(l => l.startsWith('RC_RESULT '));
    if (!line) { say('  child ' + mode + ' tz=' + tz + ' gave no result: exit=' + r.status + ' ' + ((r.stdout || '') + (r.stderr || '')).split('\n').filter(l => /RC_ERROR|Error/.test(l)).slice(0, 3).join(' | ').slice(0, 500)); return null; }
    return JSON.parse(line.slice(10));
  }
  const diffTables = (a, b) => Object.keys(a.per).filter(t => a.per[t] !== b.per[t]);
  const rows = [], red = [];
  for (const tz of ['UTC', 'Asia/Kuala_Lumpur']) {
    const L = child('live', tz); if (!L) continue;
    say('  §REPLAY_CLOCK_LIVE tz=' + tz + ' clock=' + L.clock + ' groups=' + L.groups + ' ops=' + L.ops + ' tables=' + L.tables + ' rows=' + L.rows + ' steps=' + JSON.stringify(L.steps) + ' invoice=' + JSON.stringify(L.invoice));
    const R = child('replay', tz), X = child('replay', tz, { RC_RERUN: '1' });
    if (!R || !X) continue;
    say('  §REPLAY_CLOCK_REPLAY tz=' + tz + ' clock=' + R.clock + ' invoice=' + JSON.stringify(R.invoice) + ' differing_tables=' + JSON.stringify(diffTables(L, R)));
    say('  §REPLAY_CLOCK_RERUN tz=' + tz + ' rerun=' + JSON.stringify(X.rerun) + ' invoice=' + JSON.stringify(X.invoice) + ' differing_tables=' + JSON.stringify(diffTables(L, X)));
    say('  §REPLAY_CLOCK_SESSION_DAY tz=' + tz + ' local_clock=' + R.localDay + ' 00:30 session_day=' + R.sessionDay + ' same=' + (R.localDay === R.sessionDay ? 'Y' : 'N') + ' (information: the day a NEW document would get at that moment; not judged here)');
    say('§REPLAY_CLOCK ops=' + L.ops + ' liveHash=' + L.hash.slice(0, 16) + ' replayHash=' + R.hash.slice(0, 16) + ' tz=' + tz + ' match=' + (L.hash === R.hash ? 'Y' : 'N'));
    rows.push({ tz, ops: L.ops, invoiceOps: L.steps.invoice.ops, invoiceOk: L.steps.invoice.ok, liveHash: L.hash, replayHash: R.hash, match: L.hash === R.hash });
    red.push({ tz, ops: L.ops, invoiceOps: L.steps.invoice.ops, invoiceOk: L.steps.invoice.ok, liveHash: L.hash, replayHash: X.hash, match: L.hash === X.hash });
  }
  fs.rmSync(TMP, { recursive: true, force: true });
  const judged = rows.filter(r => r.invoiceOk && r.invoiceOps > 0);
  if (rows.length < 2 || judged.length < rows.length) {
    say('§REPLAY_CLOCK_VERDICT INCONCLUSIVE zones_run=' + rows.length + ' zones_where_the_invoice_process_wrote_rows=' + judged.length + ' (nothing dated was replayed: no verdict)');
    process.exit(2);
  }
  Witness('REPLAY_CLOCK')
    .population(() => rows)
    .schema({ type: 'object', required: ['tz', 'ops', 'invoiceOps', 'liveHash', 'replayHash', 'match'], properties: { ops: { type: 'integer', minimum: 1 }, invoiceOps: { type: 'integer', minimum: 1 }, liveHash: { type: 'string', minLength: 64 }, replayHash: { type: 'string', minLength: 64 } } })
    .invariant('the replay on a later day gives the same rows as the live run, in every time zone', rs => rs.length === 2 && rs.every(r => r.match === true && r.liveHash === r.replayHash))
    .redControl(() => red)     // the REAL re-run population measured above, not a mutated copy: it must differ
    .run();
}
