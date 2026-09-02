// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// report_overlay.js — the Report verb (read face of the op-log) — prompts/CRUD_P_R_REPORT.md, R1.
// A THIRD peer overlay on the same keyed-hook mechanism as help_overlay.js / crud_overlay.js
// (UI_OVERLAY_GOVERNANCE.md): it attaches to glassbowl's bubbles BY KEY, listens on the key-addressed
// intent bus ('overlay:report'), and renders a RECEIPT for the focused document by FOLDING its header+
// lines from the bundle (glassbowl_data.db). PURE READ — no kernel write, no row mutation. Every amount
// is a fold over real rows; the layout carries no literal number (handAuthored=0). Reuses page globals:
// N/idx/withBundle/curChain/fname (best-effort, all typeof-guarded). Delete this file → page intact.
(function (global) {
  'use strict';

  // ════════════════════════════════════════════════════════════════════════
  // PURE CORE — no DOM, no DB. Exported for the headless §-witness harness (node).
  // ════════════════════════════════════════════════════════════════════════

  // REPORT_MAP — the iDempiere header/line CONVENTION as data (structure, not invented values):
  // header table → its line table + the financial columns. A new document = a new row here, never new
  // fold code (R3 later replaces this literal map with ad_printformat-driven layout). amount:null marks a
  // NON-FINANCIAL document (a shipment carries qty, not money) — folded honestly, never a fabricated total.
  var REPORT_MAP = {
    c_order:   { key: 'c_order',   pk: 'c_order_id',   lineTable: 'c_orderline',   fk: 'c_order_id',
                 fkProduct: 'm_product_id', amount: 'linenetamt', qty: 'qtyordered',  price: 'priceactual',
                 date: 'dateordered',  total: 'grandtotal' },
    c_invoice: { key: 'c_invoice', pk: 'c_invoice_id', lineTable: 'c_invoiceline', fk: 'c_invoice_id',
                 fkProduct: 'm_product_id', amount: 'linenetamt', qty: 'qtyinvoiced', price: 'priceactual',
                 date: 'dateinvoiced', total: 'grandtotal' },
    m_inout:   { key: 'm_inout',   pk: 'm_inout_id',   lineTable: 'm_inoutline',   fk: 'm_inout_id',
                 fkProduct: 'm_product_id', amount: null,        qty: 'movementqty', price: null,
                 date: 'movementdate', total: null },
    // Rpt M_InOutConfirm (AD_Process 292, "Shipment Confirmation") — the LINE-SORT + PRODUCT-JOIN variant
    // (AD_PROCESS_FOLD_LANE §P2-tail-leg6). The confirm-line table m_inoutlineconfirm has (a) NO `line` column →
    // `lineSort` names the ORDER BY column instead (m_inoutlineconfirm_id), and (b) NO m_product_id → `lineProductVia`
    // tells the db-aware caller to resolve each line's product through the parent shipment line (m_inoutline_id →
    // m_inoutline.m_product_id) and set it on the row before folding. foldReceipt itself is UNCHANGED. NON-FINANCIAL:
    // qty=ConfirmedQty (amount/price/total null); no c_bpartner_id on the header → partner null; no business date → null.
    m_inoutconfirm:{key:'m_inoutconfirm',pk:'m_inoutconfirm_id',lineTable:'m_inoutlineconfirm',fk:'m_inoutconfirm_id',
                 fkProduct: 'm_product_id', amount: null,        qty: 'confirmedqty', price: null,
                 date: null, total: null, lineSort: 'm_inoutlineconfirm_id',
                 lineProductVia: { fk: 'm_inoutline_id', table: 'm_inoutline', pk: 'm_inoutline_id', product: 'm_product_id' } },
    // Rpt M_Movement (AD_Process 290, "Inventory Move Print") — the warehouse sibling of m_inout (AD_PROCESS_FOLD_LANE
    // §P2-tail-leg2). A material movement is NON-FINANCIAL (amount/price/total null) — header M_Movement + lines
    // M_MovementLine, the carried value is qty=MovementQty. SAME foldReceipt, NO new fold code. A movement has no
    // c_bpartner_id (internal locator→locator) → partner folds honestly null. The browser lc() helper aliases the
    // bundle's CamelCase (DocumentNo/MovementQty/MovementDate) to these lowercase keys.
    m_movement:{ key: 'm_movement',pk: 'm_movement_id',lineTable: 'm_movementline',fk: 'm_movement_id',
                 fkProduct: 'm_product_id', amount: null,        qty: 'movementqty', price: null,
                 date: 'movementdate', total: null },
    // Rpt M_Inventory (AD_Process 291, "Physical Inventory Print") — the third inventory-document print
    // (AD_PROCESS_FOLD_LANE §P2-tail-leg3, after m_inout + m_movement). NON-FINANCIAL: a physical count carries
    // qty=QtyCount (the counted quantity), not money — amount/price/total null. Header M_Inventory + lines
    // M_InventoryLine; no c_bpartner_id column → partner folds honestly null. SAME foldReceipt, NO new fold code.
    // The browser lc() helper aliases the bundle's CamelCase (DocumentNo/QtyCount/MovementDate) to these keys.
    m_inventory:{key: 'm_inventory',pk:'m_inventory_id',lineTable:'m_inventoryline',fk:'m_inventory_id',
                 fkProduct: 'm_product_id', amount: null,        qty: 'qtycount',    price: null,
                 date: 'movementdate', total: null },
    // Rpt PP_Order (AD_Process 53028, "Manufacturing Order") — a 4th non-sales document family (manufacturing,
    // AD_PROCESS_FOLD_LANE §P2-tail-leg4). NON-FINANCIAL: a manufacturing order's BOM lines carry qty=QtyRequiered
    // (the required component quantity), not money — amount/price/total null. Header PP_Order + lines
    // PP_Order_BOMLine (line + m_product_id present → no fold-shape change). A production order is internal → no
    // c_bpartner_id → partner null. date=DatePromised (the populated scheduling date; DateStart is null in seed).
    // SAME foldReceipt, NO new fold code. The browser lc() helper aliases the CamelCase (DocumentNo/QtyRequiered).
    pp_order:  { key: 'pp_order',  pk: 'pp_order_id',  lineTable: 'pp_order_bomline',fk: 'pp_order_id',
                 fkProduct: 'm_product_id', amount: null,        qty: 'qtyrequiered',price: null,
                 date: 'datepromised', total: null },
    // Rpt C_Project (AD_Process 217, "Project Print") — a KIND-1 report folded by the SAME foldReceipt as the
    // order/invoice prints (no new fold code, AD_PROCESS_FOLD_LANE §P2-leg3). A project IS a document: header
    // C_Project + lines C_ProjectLine; the planned amounts are its money (subtotal = Σ PlannedAmt, total = the
    // header PlannedAmt). C_Project has no DocumentNo → docnoCol names its identifier column (Value). The browser
    // lc() helper aliases the bundle's CamelCase (PlannedAmt/Value) to these lowercase keys.
    c_project: { key: 'c_project', pk: 'c_project_id', lineTable: 'c_projectline', fk: 'c_project_id',
                 fkProduct: 'm_product_id', amount: 'plannedamt', qty: 'plannedqty', price: 'plannedprice',
                 date: 'datecontract', total: 'plannedamt', docnoCol: 'value' },
    // Rpt C_Payment (AD_Process 313, "Payment Print") — a HEADER-ONLY financial document (AD_PROCESS_FOLD_LANE
    // §P2-tail-leg5). A payment has NO line table; its amount is PayAmt on the header → folded by foldVoucher, NOT
    // foldReceipt. `amounts` names the real money columns; `total`=payamt is the document amount. The voucher's
    // amounts obey iDempiere's allocation invariant: PayAmt + Discount + Write-off − Over/Under = the settled
    // invoice's GrandTotal (re-derived in W-PROC-PAYMENT). The browser lc() helper aliases the CamelCase columns.
    c_payment: { key: 'c_payment', pk: 'c_payment_id', docnoCol: 'documentno', date: 'datetrx',
                 total: 'payamt', headerOnly: true,
                 amounts: [ { col: 'payamt',      label: 'Payment Amount' },
                            { col: 'discountamt',  label: 'Discount' },
                            { col: 'writeoffamt',  label: 'Write-off' },
                            { col: 'overunderamt', label: 'Over/Under Payment' },
                            { col: 'taxamt',       label: 'Tax' } ],
                 flags:   [ { col: 'isreceipt',    label: 'Receipt' },
                            { col: 'tendertype',   label: 'Tender' } ] }
  };

  function num(v) { return (v == null || v === '') ? null : Number(v); }
  function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }  // non-money use only (qty/price display)

  // ── exact money (feedback_numbers_via_bigdecimal · ENGINE_FULL_ERP_ISSUES.md §I-L) ──────────────
  // Every monetary accumulation in the folds below goes through BigDecimal (== java.math.BigDecimal, proven),
  // NOT raw Number+round2. raw round2 = Math.round (rounds .5 toward +inf) diverges from Java HALF_UP
  // (away-from-zero) on negative half-cents, masks TB imbalances, and drops cents past 2^53c — all MEASURED.
  // Source values arrive from SQLite as Number|string; route through String so BigDecimal.of never sees a
  // non-integer float (it throws by contract). money2() is the single DISPLAY leaf (re-enters Number; this is
  // a PURE-READ fold, nothing here is hashed). BigDecimal is loaded before this file in glassbowl.html; under
  // node the witness requires it.
  var BD = (typeof BigDecimal !== 'undefined') ? BigDecimal
         : (typeof require === 'function' ? require('./bigdecimal.js') : null);
  function bd(v) { return (v == null || v === '') ? BD.ZERO : BD.of(String(v)); }       // null/'' → exact 0
  // money2 — the single money LEAF: exact 2dp HALF_UP, carried as a STRING so no value re-enters Number even
  // past 2^53 cents (render formats via Number(x).toFixed(2), which is fine on a 2dp string). Never lossy.
  function money2(b) { return b == null ? null : b.setScale(2, BD.RoundingMode.HALF_UP).toString(); }

  // foldReceipt — fold ONE document's receipt from its raw header row + raw line rows.
  // PURE: takes rows in, returns the folded receipt out. subtotal = Σ line amount; tax = total − subtotal
  // (only when both present); financial=false ⇒ no money columns (subtotal/tax stay null, honestly "n/a").
  // names = { partner:<str|null>, products:{ <id>:<name> } } — resolved by the caller from the bundle.
  function foldReceipt(map, header, lines, names) {
    if (!map || !header) return null;
    names = names || {};
    var fin = !!map.amount, prods = names.products || {};
    var outLines = (lines || []).map(function (r) {
      var pid = r[map.fkProduct];
      return {
        line: r.line, m_product_id: pid,
        name: (prods[pid] != null ? prods[pid] : (pid != null ? '#' + pid : '(no product)')),
        qty: num(r[map.qty]),
        price: map.price ? num(r[map.price]) : null,
        amount: fin ? num(r[map.amount]) : null
      };
    });
    // EXACT: subtotal = Σ line amount, tax = total − subtotal — all BigDecimal off the RAW rows (never the
    // display Number), one money2 leaf each. tax-as-remainder is exactly where negative half-cents bite.
    var subtotalB = fin ? (lines || []).reduce(function (acc, r) { return acc.add(bd(r[map.amount])); }, BD.ZERO) : null;
    var totalB = map.total ? bd(header[map.total]) : null;
    var taxB = (subtotalB != null && totalB != null) ? totalB.subtract(subtotalB) : null;
    var subtotal = money2(subtotalB), total = (totalB != null ? money2(totalB) : null), tax = money2(taxB);
    return {
      key: map.key, id: header[map.pk], docno: header[map.docnoCol || 'documentno'],
      date: (map.date && header[map.date] != null) ? String(header[map.date]).slice(0, 10) : null,
      partner: (names.partner != null ? names.partner
                 : (header.c_bpartner_id != null ? '#' + header.c_bpartner_id : null)),
      lines: outLines, subtotal: subtotal, tax: tax, total: total,
      financial: fin, foldsFrom: 'bundle'
    };
  }

  // foldVoucher — fold a HEADER-ONLY financial document (one with NO line table) into a voucher: a payment, where
  // the document amount lives on the header (PayAmt) and there are genuinely no line rows (AD_PROCESS_FOLD_LANE
  // §P2-tail-leg5). foldReceipt's subtotal=Σline model is WRONG here (an unapplied payment with 0 lines would
  // yield tax=PayAmt) — so this is a distinct fold, NOT a foldReceipt call. PURE: header in, voucher out. Every
  // amount is BigDecimal-exact off a REAL header column named in map.amounts (never a synthesized/fabricated line).
  // `amounts` carries the named money columns (PayAmt/Discount/Write-off/…); `flags` carries non-money descriptors
  // (IsReceipt/TenderType). total = the document amount (map.total, e.g. payamt). No `lines` key — the host's
  // line-table branch is skipped; the headerOnly branch renders the amount breakdown.
  function foldVoucher(map, header, names) {
    if (!map || !header) return null;
    names = names || {};
    var amounts = (map.amounts || []).map(function (a) {
      return { col: a.col, label: a.label, value: money2(bd(header[a.col])) };   // EXACT BigDecimal off the raw column
    });
    var flags = (map.flags || []).map(function (f) {
      return { label: f.label, value: (header[f.col] != null && header[f.col] !== '') ? String(header[f.col]) : null };
    });
    return {
      key: map.key, id: header[map.pk], docno: header[map.docnoCol || 'documentno'],
      date: (map.date && header[map.date] != null) ? String(header[map.date]).slice(0, 10) : null,
      partner: (names.partner != null ? names.partner
                 : (header.c_bpartner_id != null ? '#' + header.c_bpartner_id : null)),
      amounts: amounts, flags: flags,
      total: (map.total ? money2(bd(header[map.total])) : null),
      financial: true, headerOnly: true, foldsFrom: 'bundle'
    };
  }

  // foldTrialBalance — fold the posted journal into a Trial Balance (R2). PURE: group fact_acct rows by
  // account, sum Dr/Cr, join account meta (value/name/type from c_elementvalue). The proof is that ΣDr==ΣCr
  // to the cent — a structural property of double-entry, re-derived here, never asserted. accounts = {id:{value,name,accounttype}}.
  function foldTrialBalance(factRows, accounts) {
    accounts = accounts || {};
    var by = {};
    (factRows || []).forEach(function (r) {
      var a = r.account_id; if (!by[a]) by[a] = { account_id: a, dr: BD.ZERO, cr: BD.ZERO };
      by[a].dr = by[a].dr.add(bd(r.amtacctdr)); by[a].cr = by[a].cr.add(bd(r.amtacctcr));   // EXACT
    });
    var totDrB = BD.ZERO, totCrB = BD.ZERO;
    var lines = Object.keys(by).map(function (a) {
      var b = by[a], m = accounts[a] || {};
      totDrB = totDrB.add(b.dr); totCrB = totCrB.add(b.cr);
      return { account_id: +a, value: m.value != null ? m.value : ('#' + a), name: m.name != null ? m.name : null,
               type: m.accounttype != null ? m.accounttype : null,
               dr: money2(b.dr), cr: money2(b.cr), balance: money2(b.dr.subtract(b.cr)) };  // balance: signed → HALF_UP exact
    }).sort(function (x, y) { return String(x.value).localeCompare(String(y.value)); });
    // balanced is EXACT (isZero), never a float compare — a 3rd-decimal credit can no longer mask an imbalance.
    var diffB = totDrB.subtract(totCrB);
    var diffC = Number(diffB.multiply(bd('100')).setScale(0, BD.RoundingMode.HALF_UP).toString());
    return { lines: lines, totalDr: money2(totDrB), totalCr: money2(totCrB), balanced: diffB.isZero(),
             maxDiffCents: diffC, rows: (factRows || []).length, foldsFrom: 'fact_acct' };
  }

  // foldPnL — fold the P&L from the same journal: revenue accounts (type R, natural credit) and expense
  // accounts (type E, natural debit). netIncome = revenue − expense. Asset/Liability/Equity (A/L/O) excluded.
  function foldPnL(factRows, accounts) {
    accounts = accounts || {};
    var by = {};
    (factRows || []).forEach(function (r) {
      var m = accounts[r.account_id] || {}, t = m.accounttype;
      if (t !== 'R' && t !== 'E') return;
      var a = r.account_id; if (!by[a]) by[a] = { account_id: a, type: t, value: m.value, name: m.name, net: BD.ZERO };
      // net is a SIGNED fold (cr−dr for revenue, dr−cr for expense) — exactly the half-cent trap. EXACT.
      by[a].net = (t === 'R') ? by[a].net.add(bd(r.amtacctcr)).subtract(bd(r.amtacctdr))
                              : by[a].net.add(bd(r.amtacctdr)).subtract(bd(r.amtacctcr));
    });
    var revenueB = BD.ZERO, expenseB = BD.ZERO;
    var lines = Object.keys(by).map(function (a) {
      var b = by[a]; if (b.type === 'R') revenueB = revenueB.add(b.net); else expenseB = expenseB.add(b.net);
      return { account_id: b.account_id, type: b.type, value: b.value, name: b.name, net: money2(b.net) };
    }).sort(function (x, y) { return String(x.value).localeCompare(String(y.value)); });
    return { lines: lines, revenue: money2(revenueB), expense: money2(expenseB),
             netIncome: money2(revenueB.subtract(expenseB)), foldsFrom: 'fact_acct' };
  }

  // ════════════════════════════════════════════════════════════════════════
  // foldStatement — the generic PA_Report fold (W-PA-REPORT).
  // SPEC (docs/ReportingFold.md §4b edit is permission-blocked this session — the AUTHORITATIVE spec lives HERE
  //   as this header comment; mirror it back to the doc when writable):
  // Implementing ReportingFold.md §4b — Witness: W-PA-REPORT (scripts/poc_pa_report.js → build/erp/poc_pa_report.log)
  //
  //   A financial statement = a (lines × columns) matrix of signed journal sums, driven ENTIRELY by standard
  //   iDempiere PA_* metadata — no hardcoded statement. Generalises foldTrialBalance/foldPnL into one verb:
  //   a new statement is a pa_report ROW, not new code.
  //
  // PURE: host injects every row; no DB/clock/DOM; integer-cents via BigDecimal; runs under sql.js unchanged.
  //   foldStatement(report, lines, cols, sourcesByLine, factRows, accounts, periodWindows) -> {cells,lineOrder,colOrder}
  //   - report: one pa_report row — c_acctschema_id SCOPES the fold (seed: schema 101).
  //   - lines:  pa_reportline rows, SeqNo-ordered. linetype 'S'=segment, 'C'=calc (calculationtype
  //             A=add / S=subtract / R=range / P=percent over oper_1_id,oper_2_id line ids).
  //   - cols:   pa_reportcolumn rows, SeqNo-ordered. columntype 'C'=calc column (combined last), else relative.
  //             paamounttype in B/S/C/D/Q/R -> amount expr (== MReportColumn.getSelectClause, verbatim):
  //               B->acctBalance(acct,Dr,Cr) . S->Dr-Cr . C->Cr . D->Dr . Q->Qty . R->acctBalance(acct,Qty,0).
  //             A LINE's own paamounttype overrides the column's (FinReport.insertLine). postingtype filters facts.
  //   - sourcesByLine: { lineId:[{account_ids:[..LEAF ids..]}] } — host PRE-EXPANDS each pa_reportsource
  //             c_elementvalue_id to leaf accounts via the EV account tree (ad_treenode; MReportTree rule:
  //             a SUMMARY node -> all non-summary descendants, a leaf -> itself). Verb takes leaf id sets -> stays pure.
  //   - accounts: { id:{accounttype,accountsign} } — for the natural-sign rule.
  //   - periodWindows: { colId: Set<c_period_id> } — host resolves relativeperiod/paperiodtype over the calendar
  //             (bundle fact_acct has NO dateacct, only c_period_id; FinReportPeriod date windows -> c_period sets:
  //              'P'=target period . 'Y'=periods in target's fiscal year up to target . 'T'=all periods <= target).
  //
  // SIGN — natural balance (== live acctbalance() PL/pgSQL, re-verified): bal=dr-cr; if accountsign='N'
  //   (ALL 379 seed accounts confirmed 'N') then accounttype in (A,E) => Debit-natural (keep dr-cr) else
  //   Credit-natural (bal=cr-dr). SAME logic foldPnL already ships. Non-natural sign => name-defer (none in 100/101).
  //
  // THREE PASSES, one integer-cents fold, NO mid-fold rounding (signed half-cent trap) — HALF_UP scale-2 at OUTPUT:
  //   1. S-lines: per segment line x non-calc column, Sum amountExpr(col) over facts where account in leafSources(line)
  //      AND c_period_id in periodWindows[col] AND c_acctschema_id=report.c_acctschema_id AND (postingtype=col.pt if set).
  //   2. C-lines (calc tree, SeqNo order so earlier results visible — matches FinReport.doCalculations):
  //      A=cell[o1]+cell[o2] . S=cell[o1]-cell[o2] . R(range)=Sum lines with SeqNo BETWEEN o1.seq..o2.seq (inclusive,
  //      == getLineIDs) . P(percent)=cell[o1]/cell[o2]*100. Per column.
  //   3. Calc columns (columntype 'C'): combine columns via col.oper_1_id/oper_2_id+calculationtype, same A/S/R/P.
  // ════════════════════════════════════════════════════════════════════════

  // amtExpr — the per-row amount per PA AmountType (== MReportColumn.getSelectClause). Returns a BD. acct sign
  // applied only for B (acctBalance) and R (acctBalance over Qty). S/C/D/Q are raw, exactly as FinReport's SQL.
  function amtExpr(amt, r, sign) {
    switch (amt) {
      case 'B': return signedBalance(bd(r.amtacctdr).subtract(bd(r.amtacctcr)), sign);   // acctBalance(Dr,Cr)
      case 'S': return bd(r.amtacctdr).subtract(bd(r.amtacctcr));                         // Dr-Cr (accounted sign)
      case 'C': return bd(r.amtacctcr);                                                   // Cr only
      case 'D': return bd(r.amtacctdr);                                                   // Dr only
      case 'Q': return bd(r.qty);                                                         // Qty (accounted sign)
      case 'R': return signedBalance(bd(r.qty), sign);                                    // acctBalance(Qty,0)
      default:  return BD.ZERO;                                                           // unknown -> 0 (FinReport SEVERE)
    }
  }
  // signedBalance — flip dr-cr balance to cr-dr for credit-natural accounts (== acctbalance() PL/pgSQL).
  // sign = {accounttype, accountsign}. accountsign!=='N' name-deferred upstream; here 'N' -> A/E debit, else credit.
  function signedBalance(drMinusCr, sign) {
    if (!sign) return drMinusCr;                                  // unknown account -> raw dr-cr (== PL/pgSQL fallback)
    var as = sign.accountsign;
    if (as === 'N' || as == null) as = (sign.accounttype === 'A' || sign.accounttype === 'E') ? 'D' : 'C';
    return (as === 'C') ? drMinusCr.negate() : drMinusCr;        // credit-natural => cr-dr = -(dr-cr)
  }

  // foldStatement — see the spec block above. Returns { cells:{lineId:{colId:<money2 string>}}, lineOrder, colOrder,
  //   schema, foldsFrom }. Cells accumulate as BD, only money2()'d at output (one HALF_UP leaf).
  function foldStatement(report, lines, cols, sourcesByLine, factRows, accounts, periodWindows) {
    report = report || {}; lines = lines || []; cols = cols || []; sourcesByLine = sourcesByLine || {};
    factRows = factRows || []; accounts = accounts || {}; periodWindows = periodWindows || {};
    var schema = report.c_acctschema_id;
    var segCols = cols.filter(function (c) { return c.columntype !== 'C'; });   // non-calculation columns
    var calcCols = cols.filter(function (c) { return c.columntype === 'C'; });
    var factByAcct = {};                                                        // index facts by account (pure in-memory)
    factRows.forEach(function (r) {
      if (schema != null && r.c_acctschema_id != schema) return;                // scope to the report's acctschema
      (factByAcct[r.account_id] = factByAcct[r.account_id] || []).push(r);
    });
    var cellsBD = {};                                                            // {lineId:{colId:BD}}
    lines.forEach(function (l) { cellsBD[l.pa_reportline_id] = {}; });
    var lineById = {}; lines.forEach(function (l) { lineById[l.pa_reportline_id] = l; });

    // ── PASS 1: segment ('S') lines x segment columns ───────────────────────
    lines.forEach(function (l) {
      if (l.linetype !== 'S') return;
      var srcs = sourcesByLine[l.pa_reportline_id] || [];
      var acctSet = {};
      srcs.forEach(function (s) { (s.account_ids || []).forEach(function (a) { acctSet[a] = 1; }); });
      var lineAmt = (l.paamounttype != null && l.paamounttype !== '') ? l.paamounttype : null;  // line overrides column
      segCols.forEach(function (c) {
        var amt = lineAmt || c.paamounttype;
        var win = periodWindows[c.pa_reportcolumn_id];                           // Set (has .has) or null = all periods
        var pt = c.postingtype;
        var sum = BD.ZERO;
        Object.keys(acctSet).forEach(function (a) {
          var sign = accounts[a] || null;
          (factByAcct[a] || []).forEach(function (r) {
            if (win && !win.has(r.c_period_id)) return;
            if (pt != null && pt !== '' && r.postingtype != null && r.postingtype !== pt) return;
            sum = sum.add(amtExpr(amt, r, sign));                                 // EXACT, no mid-round
          });
        });
        cellsBD[l.pa_reportline_id][c.pa_reportcolumn_id] = sum;
      });
    });

    // ── PASS 2: calculation ('C') lines, in SeqNo order, per segment column ──
    function cellOr0(lid, cid) { var row = cellsBD[lid]; return (row && row[cid] != null) ? row[cid] : BD.ZERO; }
    lines.forEach(function (l) {
      if (l.linetype !== 'C') return;
      var ct = l.calculationtype, o1 = l.oper_1_id, o2 = l.oper_2_id;
      segCols.forEach(function (c) {
        var cid = c.pa_reportcolumn_id, v;
        if (ct === 'A') { v = cellOr0(o1, cid).add(cellOr0(o2, cid)); }
        else if (ct === 'S') { v = cellOr0(o1, cid).subtract(cellOr0(o2, cid)); }
        else if (ct === 'R') {                                                   // range: Sum lines SeqNo o1..o2 (incl)
          var s1 = lineById[o1] ? Number(lineById[o1].seqno) : null;
          var s2 = lineById[o2] ? Number(lineById[o2].seqno) : null;
          if (s1 != null && s2 != null) { var lo = Math.min(s1, s2), hi = Math.max(s1, s2);
            v = BD.ZERO;
            lines.forEach(function (rl) { var sq = Number(rl.seqno); if (sq >= lo && sq <= hi) v = v.add(cellOr0(rl.pa_reportline_id, cid)); });
          } else v = BD.ZERO;
        } else if (ct === 'P') {                                                 // percent: o1/o2*100 (0 denom -> 0)
          var d = cellOr0(o2, cid);
          v = d.isZero() ? BD.ZERO : cellOr0(o1, cid).divide(d, 10, BD.RoundingMode.HALF_UP).multiply(bd('100'));
        } else { v = BD.ZERO; }
        cellsBD[l.pa_reportline_id][cid] = v;
      });
    });

    // ── PASS 3: calculation columns (columntype 'C'), per line ──────────────
    // R (range) = INCLUSIVE sum of every column between oper_1 and oper_2 by COLUMN POSITION (== FinReport
    // doCalculations lines 992-997: COALESCE(Col_ii1,0)+COALESCE(Col_ii1+1,0)+…+COALESCE(Col_ii2,0), endpoints
    // swapped if reversed) — NOT the first operand. A=Col_o1+Col_o2 . S=Col_o1-Col_o2 . P=Col_o1/Col_o2*100.
    var colIdx = {}; cols.forEach(function (c, i) { colIdx[c.pa_reportcolumn_id] = i; });
    calcCols.forEach(function (c) {
      var cid = c.pa_reportcolumn_id, ct = c.calculationtype, o1 = c.oper_1_id, o2 = c.oper_2_id;
      lines.forEach(function (l) {
        var lid = l.pa_reportline_id, v;
        var a = (o1 != null) ? cellOr0(lid, o1) : BD.ZERO, b = (o2 != null) ? cellOr0(lid, o2) : BD.ZERO;
        if (ct === 'A') v = a.add(b);
        else if (ct === 'S') v = a.subtract(b);
        else if (ct === 'P') v = b.isZero() ? BD.ZERO : a.divide(b, 10, BD.RoundingMode.HALF_UP).multiply(bd('100'));
        else if (ct === 'R') {                                                  // inclusive column-position range
          var i1 = colIdx[o1], i2 = colIdx[o2];
          if (i1 == null || i2 == null) { v = a; }
          else { var lo = Math.min(i1, i2), hi = Math.max(i1, i2); v = BD.ZERO;
            for (var k = lo; k <= hi; k++) v = v.add(cellOr0(lid, cols[k].pa_reportcolumn_id)); }
        }
        else v = a;                                                            // unknown -> first operand
        cellsBD[lid][cid] = v;
      });
    });

    // ── OUTPUT: single money2 leaf (HALF_UP scale-2) — nothing rounded mid-fold ──
    var cells = {};
    lines.forEach(function (l) {
      var row = {}; var src = cellsBD[l.pa_reportline_id] || {};
      cols.forEach(function (c) { var b = src[c.pa_reportcolumn_id]; row[c.pa_reportcolumn_id] = (b != null) ? money2(b) : money2(BD.ZERO); });
      cells[l.pa_reportline_id] = row;
    });
    return {
      cells: cells,
      lineOrder: lines.map(function (l) { return l.pa_reportline_id; }),
      colOrder: cols.map(function (c) { return c.pa_reportcolumn_id; }),
      schema: schema, foldsFrom: 'fact_acct'
    };
  }

  // ════════════════════════════════════════════════════════════════════════
  // foldPrint — the generic AD_PrintFormat fold (W-PRINTFORMAT).
  // Implementing ReportingFold.md §1 (Document layout) — Witness: W-PRINTFORMAT
  //   (scripts/poc_printformat.js → build/erp/poc_printformat.log)
  //
  //   ONE recursive fold replaces iDempiere's DataEngine (1529 LOC, PrintData tree) + PrintDataGroup (the
  //   break/function row engine). The FORMAT is data (ad_printformat + ad_printformatitem, extracted by
  //   scripts/extract_printformat.sh); the ROW SOURCE is host-injected (the print views, materialized by
  //   Postgres at extract time — the view SQL is never reimplemented here, non-invent).
  //
  // PURE: no DB/clock/DOM. foldPrint(format, formatsById, itemsByFormat, rowsOf, link) -> manifest
  //   - format:        one ad_printformat row {ad_printformat_id, name, tablename}.
  //   - formatsById:   {id: format row} — for 'P' (Included-print-format) child lookup.
  //   - itemsByFormat: {formatId: [ad_printformatitem rows]} — active items; the verb orders by seqno.
  //   - rowsOf(format, link): host row source for the format's table; link = {column, value}|null scopes a
  //                    detail section to its master row (== DataEngine's nested child query, but injected).
  //   - link:          null for the master section; set by the recursion for 'P' children.
  // SEMANTICS (== DataEngine/PrintDataGroup, verified against the source):
  //   - sort:    items isorderby='Y', ordered by sortno (then seqno) -> row comparator (numeric-aware).
  //   - fields:  printed items in seqno order, type F(ield)/T(ext)/I(mage)/R(ect/line); 'P' items become
  //              child SECTIONS, not fields. ispagebreak -> a manifest marker (DOM page-break, not pixels).
  //   - 'P':     master-detail = RECURSION (same shape as explodeBOM/buildDoc fan-out): per master row, fold
  //              the child format with link {column: item.columnname, value: row[column]}. N levels free.
  //   - breaks:  isgroupby -> partition (after sort); issummarized -> Σ BigDecimal · iscounted -> count of
  //              non-null values · isaveraged -> Σ/count HALF_UP — per group AND grand total, ONE pass,
  //              no SQL-vs-Java split-brain. Sums are EXACT (bd), money2 only at output.
  function foldPrint(format, formatsById, itemsByFormat, rowsOf, link) {
    format = format || {}; formatsById = formatsById || {}; itemsByFormat = itemsByFormat || {};
    var items = (itemsByFormat[format.ad_printformat_id] || [])
      .filter(function (i) { return i.isactive !== 'N'; })
      .slice().sort(function (a, b) { return (Number(a.seqno) - Number(b.seqno)) || (Number(a.ad_printformatitem_id) - Number(b.ad_printformatitem_id)); });
    var col = function (i) { return i.columnname ? String(i.columnname).toLowerCase() : null; };

    // ── row source + ORDER BY (isorderby items by sortno — DataEngine's ORDER BY clause) ──
    var rows = (typeof rowsOf === 'function' ? rowsOf(format, link || null) : []) || [];
    var orderItems = items.filter(function (i) { return i.isorderby === 'Y' && col(i); })
      .sort(function (a, b) { return (Number(a.sortno) - Number(b.sortno)) || (Number(a.seqno) - Number(b.seqno)); });
    if (orderItems.length) {
      rows = rows.slice().sort(function (x, y) {
        for (var k = 0; k < orderItems.length; k++) {
          var c = col(orderItems[k]), a = x[c], b = y[c];
          if (a == null && b == null) continue;
          if (a == null) return -1; if (b == null) return 1;
          var na = Number(a), nb = Number(b);
          var cmp = (!isNaN(na) && !isNaN(nb)) ? (na - nb) : String(a).localeCompare(String(b));
          if (cmp) return cmp;
        }
        return 0;
      });
    }

    // ── fields (printed, non-'P') + the 'P' child sections ──
    var fields = items.filter(function (i) { return i.isprinted === 'Y' && i.printformattype !== 'P'; })
      .map(function (i) { return { name: i.name, printName: (i.printname != null && i.printname !== '') ? i.printname : i.name,
                                   column: col(i), type: i.printformattype, align: i.fieldalignmenttype || null,
                                   pageBreak: i.ispagebreak === 'Y' }; });
    var pItems = items.filter(function (i) { return i.printformattype === 'P' && i.isprinted === 'Y'; });

    var outRows = rows.map(function (r) {
      var children = [];
      pItems.forEach(function (pi) {
        var child = formatsById[pi.ad_printformatchild_id];
        var lc = col(pi);
        if (!child || !lc) return;                                   // no child format/link column -> honest skip
        children.push({ item: pi.name, formatId: pi.ad_printformatchild_id,
                        manifest: foldPrint(child, formatsById, itemsByFormat, rowsOf, { column: lc, value: r[lc] }) });
      });
      return { cells: r, children: children };
    });

    // ── the row engine: group partitions + function rows (Σ / count / avg), ONE integer-cents pass ──
    var funcItems = items.filter(function (i) {
      return col(i) && (i.issummarized === 'Y' || i.iscounted === 'Y' || i.isaveraged === 'Y');
    });
    function reduceRows(rs) {                                        // -> {colname:{sum,count,avg}} (money2 strings)
      var out = {};
      funcItems.forEach(function (i) {
        var c = col(i), sum = BD.ZERO, n = 0;
        rs.forEach(function (r) {
          var v = r[c];
          if (v == null || v === '') return;                         // PrintDataGroup.addValue: null not accumulated
          sum = sum.add(bd(v)); n++;
        });
        var f = out[c] = out[c] || {};
        if (i.issummarized === 'Y') f.sum = money2(sum);
        if (i.iscounted === 'Y') f.count = n;
        if (i.isaveraged === 'Y') f.avg = (n > 0) ? money2(sum.divide(bd(String(n)), 2, BD.RoundingMode.HALF_UP)) : money2(BD.ZERO);
      });
      return out;
    }
    var groupItems = items.filter(function (i) { return i.isgroupby === 'Y' && col(i); });
    var groups = [];
    if (groupItems.length && rows.length) {                           // partition the SORTED rows by group key
      var keyOf = function (r) { return groupItems.map(function (g) { return String(r[col(g)]); }).join(''); };
      var cur = null, start = 0;
      rows.forEach(function (r, idx) {
        var k = keyOf(r);
        if (cur === null) { cur = k; start = idx; }
        else if (k !== cur) { groups.push({ key: cur, from: start, to: idx - 1, funcs: reduceRows(rows.slice(start, idx)) }); cur = k; start = idx; }
      });
      groups.push({ key: cur, from: start, to: rows.length - 1, funcs: reduceRows(rows.slice(start)) });
    }
    var total = funcItems.length ? reduceRows(rows) : null;           // the grand function row

    return {
      format: { id: format.ad_printformat_id, name: format.name, table: format.tablename },
      link: link || null,
      fields: fields,
      rows: outRows,
      breaks: { groups: groups, total: total },
      foldsFrom: 'ad_printformat'
    };
  }

  // ════════════════════════════════════════════════════════════════════════
  // resolveScope — the PURE R-T2 default + fall-through (REPORTING_UI_DEFAULT_FALLTHROUGH.md). No DB/DOM/clock.
  // Picks the default report period DETERMINISTICALLY from the journal and resolves each non-calc column to a
  // c_period_id window, then GUARDS: if that scope matches 0 fact rows but the bundle DOES have facts, fall through
  // to the single busiest populated period (reuse the SAME window rule, non-empty source). Empty bundle -> absent.
  //   periods: [{id,name,sd,ed,yr}] (calendar order) · factRows: [{c_period_id,...}] ·
  //   cols: [{pa_reportcolumn_id, columntype, paperiodtype, relativeperiod}]
  //   -> { periodWindows:{colId:Set}, reportIdx, busiestIdx, sourcePeriod:{id,name}|null, coverage, scopeFacts, totalFacts }
  // coverage: 'live' (a user-chosen period — future) | 'default→history' (our derived default) | 'absent' (no facts).
  function resolveScope(periods, factRows, cols) {
    periods = periods || []; factRows = factRows || []; cols = cols || [];
    var factCnt = {}, totalFacts = 0;
    factRows.forEach(function (r) { factCnt[r.c_period_id] = (factCnt[r.c_period_id] || 0) + 1; totalFacts++; });
    var yearFacts = {};
    periods.forEach(function (p) { if (factCnt[p.id]) yearFacts[p.yr] = (yearFacts[p.yr] || 0) + factCnt[p.id]; });
    var bestYr = null, bestN = -1;
    Object.keys(yearFacts).forEach(function (y) { if (yearFacts[y] > bestN) { bestN = yearFacts[y]; bestYr = Number(y); } });
    var busiestIdx = -1, busiestN = -1;
    periods.forEach(function (p, i) { var n = factCnt[p.id] || 0; if (n > busiestN) { busiestN = n; busiestIdx = i; } });
    var reportIdx = -1, repN = -1;
    periods.forEach(function (p, i) { var n = factCnt[p.id] || 0; if (p.yr === bestYr && n > repN) { repN = n; reportIdx = i; } });
    if (reportIdx < 0) reportIdx = (busiestIdx >= 0) ? busiestIdx : periods.length - 1;
    function winFor(idx, paperiodtype, relativeperiod) {
      var i = idx + (relativeperiod || 0), set = {};
      if (i < 0 || i >= periods.length) return set;
      var tgt = periods[i];
      if (paperiodtype === 'P') set[tgt.id] = 1;
      else if (paperiodtype === 'Y') periods.forEach(function (p) { if (p.yr === tgt.yr && p.sd <= tgt.ed && p.ed <= tgt.ed) set[p.id] = 1; });
      else if (paperiodtype === 'T') periods.forEach(function (p) { if (p.ed <= tgt.ed) set[p.id] = 1; });
      else set[tgt.id] = 1;
      return set;
    }
    function buildWindows(idx, anchor) {
      var w = {};
      // anchor=true (the fall-through): every column window collapses to the busiest period itself — drop the column's
      // own paperiodtype/relativeperiod (which is what steered the scope into an empty period). Goal: show real data.
      cols.forEach(function (c) {
        if (c.columntype === 'C') return;
        w[c.pa_reportcolumn_id] = anchor ? winFor(idx, 'P', 0) : winFor(idx, c.paperiodtype, c.relativeperiod);
      });
      return w;
    }
    function countFacts(windows) {
      var union = {}; var any = false;
      Object.keys(windows).forEach(function (cid) { Object.keys(windows[cid]).forEach(function (id) { union[id] = 1; any = true; }); });
      if (!any) return factRows.length;                          // no period filter at all -> every fact in scope
      var n = 0; factRows.forEach(function (r) { if (union[r.c_period_id]) n++; }); return n;
    }
    var windows = buildWindows(reportIdx, false), srcIdx = reportIdx, coverage = 'default→history';
    if (totalFacts === 0) {
      coverage = 'absent';
    } else if (countFacts(windows) === 0 && busiestIdx >= 0) {    // empty-scope edge -> history fall-through
      windows = buildWindows(busiestIdx, true); srcIdx = busiestIdx;
    }
    var srcP = (srcIdx >= 0 && periods[srcIdx]) ? periods[srcIdx] : null;
    // emit Sets (the foldStatement contract) from the plain id maps
    var periodWindows = {};
    Object.keys(windows).forEach(function (cid) { var s = new Set(); Object.keys(windows[cid]).forEach(function (id) { s.add(isNaN(+id) ? id : +id); }); periodWindows[cid] = s; });
    return { periodWindows: periodWindows, reportIdx: reportIdx, busiestIdx: busiestIdx,
             sourcePeriod: srcP ? { id: srcP.id, name: srcP.name } : null,
             coverage: coverage, scopeFacts: countFacts(windows), totalFacts: totalFacts };
  }

  var CORE = { REPORT_MAP: REPORT_MAP, foldReceipt: foldReceipt, foldVoucher: foldVoucher, foldTrialBalance: foldTrialBalance, foldPnL: foldPnL,
               foldStatement: foldStatement, foldPrint: foldPrint, resolveScope: resolveScope,
               amtExpr: amtExpr, signedBalance: signedBalance, round2: round2 };
  if (typeof module !== 'undefined' && module.exports) { module.exports = CORE; return; }
  if (typeof document === 'undefined') return;

  // ════════════════════════════════════════════════════════════════════════
  // DOM OVERLAY — the receipt panel, driven by the ring's ▤ Report verb (via the intent bus).
  // ════════════════════════════════════════════════════════════════════════
  injectCss();
  var panel = document.createElement('div'); panel.id = 'reportPanel'; document.body.appendChild(panel);

  // ── bundle helpers (truth-bound: read real rows, never invent) ──────────────
  function hasCol(db, t, c) {
    try { var pr = db.exec('PRAGMA table_info(' + t + ')'); return pr.length && pr[0].values.some(function (v) { return String(v[1]).toLowerCase() === c; }); }
    catch (e) { return false; }
  }
  function rowsOf(res) {
    if (!res || !res.length) return [];
    return res[0].values.map(function (v) { var o = {}; res[0].columns.forEach(function (c, i) { o[c] = v[i]; }); return o; });
  }
  // lowercase-alias every column key (NON-INVENT, ADDITIVE) — the browser bundle stores DOCUMENT tables in
  // canonical CamelCase (DocumentNo/GrandTotal/LineNetAmt), but REPORT_MAP keys + foldReceipt read lowercase
  // (the verb is proven headless on all-lowercase ad_full.db). Without this the in-browser receipt read 0.00 /
  // docno=undefined. Mirrors doc_poster.lc — all-lowercase rows alias to themselves → the headless verb unchanged.
  function lc(row) {
    if (!row || typeof row !== 'object') return row;
    Object.keys(row).forEach(function (k) { var lk = k.toLowerCase(); if (lk !== k && !(lk in row)) row[lk] = row[k]; });
    return row;
  }
  // litId — prefer the row in the currently-traced O2C chain (the lit instance), else the first row
  // (mirrors crud_overlay.getRecord so Report and the ring agree on which document is focused).
  function litId(db, map) {
    try { if (typeof curChain !== 'undefined' && curChain) { for (var i = 0; i < curChain.length; i++) if (curChain[i].table === map.key && curChain[i].id != null) return curChain[i].id; } } catch (e) {}
    try { var r = db.exec('SELECT ' + map.pk + ' FROM ' + map.key + ' ORDER BY ' + map.pk + ' LIMIT 1'); return (r.length && r[0].values.length) ? r[0].values[0][0] : null; }
    catch (e) { return null; }
  }
  function nameOf(db, table, pk, id, col) {
    try { if (!hasCol(db, table, col)) return null; var r = db.exec('SELECT ' + col + ' FROM ' + table + ' WHERE ' + pk + '=' + id + ' LIMIT 1'); return (r.length && r[0].values.length) ? r[0].values[0][0] : null; }
    catch (e) { return null; }
  }

  // _renderReceipt — fold + render ONE document's receipt for an explicit record id (shared by show + printRecord).
  function _renderReceipt(db, key, map, id) {
    if (id == null) { renderUnsupported(db, key); return; }
    var header = lc(rowsOf(db.exec('SELECT * FROM ' + map.key + ' WHERE ' + map.pk + '=' + id + ' LIMIT 1'))[0]) || null;
    if (!header) { renderUnsupported(db, key); return; }
    var lines = [];
    try { lines = rowsOf(db.exec('SELECT * FROM ' + map.lineTable + ' WHERE ' + map.fk + '=' + id + ' ORDER BY ' + (map.lineSort || 'line'))).map(lc); } catch (e) {}
    // lineProductVia (§P2-tail-leg6): the carried product lives on a PARENT line table, not this line row —
    // resolve it per line through the join and set it on the row, so foldReceipt reads r[fkProduct] unchanged.
    if (map.lineProductVia) { var via = map.lineProductVia;
      lines.forEach(function (r) { var lid = r[via.fk]; if (lid != null) r[map.fkProduct] = nameOf(db, via.table, via.pk, lid, via.product); }); }
    var names = { partner: nameOf(db, 'c_bpartner', 'c_bpartner_id', header.c_bpartner_id, 'name'), products: {} };
    lines.forEach(function (r) { var pid = r[map.fkProduct]; if (pid != null && names.products[pid] === undefined) names.products[pid] = nameOf(db, 'm_product', 'm_product_id', pid, 'name'); });
    var rec = CORE.foldReceipt(map, header, lines, names);
    render(db, rec);
    console.log('§REPORT-RECEIPT doc=' + fname(key) + '#' + rec.id + ' lines=' + rec.lines.length +
      ' subtotal=' + fmtN(rec.subtotal) + ' tax=' + fmtN(rec.tax) + ' total=' + fmtN(rec.total) +
      ' folds-from=' + rec.foldsFrom + ' handAuthored=0');
  }
  // show — fold + render the receipt for `key` (resolving the lit document id from the bundle).
  function show(key) {
    var map = CORE.REPORT_MAP[key];
    if (!map) { renderUnsupported(key); console.log('§REPORT verb key=' + key + ' supported=N (no header/line map)'); return; }
    if (typeof withBundle !== 'function') { console.warn('§REPORT no bundle'); return; }
    withBundle(function (db) { try { _renderReceipt(db, key, map, litId(db, map)); } catch (er) { console.warn('§REPORT fold error', er && er.message); } });
  }
  // printRecord — iDempiere's toolbar Print (btnPrint, Alt+P): the receipt for THIS open document (the actually-
  // selected record), NOT the lit demo doc show() defaults to. Same PURE foldReceipt verb, just the real id.
  // Returns true when the document kind is printable (a header/line map exists) so the caller can grey the
  // toolbar Print otherwise (iDempiere enablePrint parity). NO new fold code.
  function printRecord(key, recordId) {
    var map = CORE.REPORT_MAP[key];
    if (!map) { console.log('§REPORT-PRINT key=' + key + ' supported=N (no header/line map)'); return false; }
    if (typeof withBundle !== 'function') { console.warn('§REPORT no bundle'); return false; }
    withBundle(function (db) { try { _renderReceipt(db, key, map, recordId != null ? recordId : litId(db, map)); } catch (er) { console.warn('§REPORT fold error', er && er.message); } });
    console.log('§REPORT-PRINT key=' + key + ' rec=' + recordId + ' supported=Y');
    return true;
  }

  // ════════════════════════════════════════════════════════════════════════
  // FINANCIAL STATEMENTS — bring W-PA-REPORT foldStatement into the browser (REPORTING_LANE Step 3).
  // The bundle now carries the PA_* definition + calendar + EV-tree (scripts/extract_pa_report.sh); the host
  // here replicates poc_pa_report.js's input-prep EXACTLY (reading from the bundle, not ad_full.db) and folds
  // via CORE.foldStatement — so what the panel renders == the cent-exact, oracle-diffed statement.
  // ════════════════════════════════════════════════════════════════════════
  var STMT_TREE = 101, STMT_CAL = 102;            // EV account tree + GardenWorld calendar (== the witness)

  function bundleHasStatements(db) { return hasTable(db, 'pa_report') && hasTable(db, 'fact_acct') && hasTable(db, 'ad_treenode'); }
  function hasTable(db, t) {
    try { var r = db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='" + t + "'"); return !!(r.length && r[0].values.length); }
    catch (e) { return false; }
  }
  // EV chart + leaf-expansion over the account tree (== MReportTree.getWhereClause: SUMMARY node -> non-summary leaves).
  function evModel(db) {
    var EV = {}; rowsOf(db.exec('SELECT c_elementvalue_id, value, accounttype, accountsign, issummary FROM c_elementvalue'))
      .forEach(function (r) { EV[r.c_elementvalue_id] = r; });
    var kids = {};
    rowsOf(db.exec('SELECT node_id, parent_id FROM ad_treenode WHERE ad_tree_id=' + STMT_TREE))
      .forEach(function (n) { (kids[n.parent_id] = kids[n.parent_id] || []).push(n.node_id); });
    function leaves(id) {
      var e = EV[id]; if (!e || e.issummary !== 'Y') return [id];
      var out = []; (function rec(x) { (kids[x] || []).forEach(function (c) { if (EV[c] && EV[c].issummary === 'Y') rec(c); else out.push(c); }); })(id);
      return out;
    }
    return { EV: EV, leaves: leaves };
  }
  // periodsOf — the calendar's posting periods in date order (the row source for the PURE CORE.resolveScope).
  // iDempiere's FinReport takes C_Period as a (mandatory) PARAMETER — there is no engine default; we DERIVE one
  // deterministically (CORE.resolveScope: busiest period of the busiest fiscal year, + a history fall-through). No clock.
  function periodsOf(db) {
    return rowsOf(db.exec(
      "SELECT p.c_period_id id, p.name, p.startdate sd, p.enddate ed, p.c_year_id yr FROM c_period p " +
      "JOIN c_year y ON p.c_year_id=y.c_year_id WHERE y.c_calendar_id=" + STMT_CAL +
      " AND p.isactive='Y' AND p.periodtype='S' ORDER BY p.startdate"));
  }
  // assemble the foldStatement inputs for one pa_report, reading ONLY the bundle (the browser path).
  function statementInputs(db, reportId) {
    var report = rowsOf(db.exec('SELECT pa_report_id, name, pa_reportlineset_id, pa_reportcolumnset_id, c_acctschema_id, c_calendar_id FROM pa_report WHERE pa_report_id=' + (reportId | 0)))[0];
    if (!report) return null;
    var lines = rowsOf(db.exec("SELECT pa_reportline_id, seqno, name, linetype, calculationtype, oper_1_id, oper_2_id, paamounttype, paperiodtype FROM pa_reportline WHERE pa_reportlineset_id=" + report.pa_reportlineset_id + " AND isactive='Y' ORDER BY seqno"));
    var cols = rowsOf(db.exec("SELECT pa_reportcolumn_id, seqno, name, columntype, calculationtype, oper_1_id, oper_2_id, paamounttype, paperiodtype, relativeperiod, postingtype FROM pa_reportcolumn WHERE pa_reportcolumnset_id=" + report.pa_reportcolumnset_id + " AND isactive='Y' ORDER BY seqno"));
    var ev = evModel(db);
    var sourcesByLine = {};
    lines.forEach(function (l) {
      var srcs = rowsOf(db.exec("SELECT c_elementvalue_id ev FROM pa_reportsource WHERE pa_reportline_id=" + l.pa_reportline_id + " AND isactive='Y'"));
      sourcesByLine[l.pa_reportline_id] = srcs.map(function (s) { return { account_ids: ev.leaves(s.ev) }; });
    });
    var factRows = rowsOf(db.exec('SELECT account_id, amtacctdr, amtacctcr, qty, c_period_id, c_acctschema_id, postingtype FROM fact_acct'));
    // R-T2 default + history fall-through is the PURE CORE.resolveScope — the browser path and the headless
    // witness run the SAME code (REPORTING_UI_DEFAULT_FALLTHROUGH.md). No user period yet -> coverage=default→history.
    var sc = CORE.resolveScope(periodsOf(db), factRows, cols);
    var accounts = {};
    Object.keys(ev.EV).forEach(function (id) { accounts[id] = { accounttype: ev.EV[id].accounttype, accountsign: ev.EV[id].accountsign }; });
    return { report: report, lines: lines, cols: cols, sourcesByLine: sourcesByLine, factRows: factRows, accounts: accounts,
             periodWindows: sc.periodWindows, coverage: sc.coverage, sourcePeriod: sc.sourcePeriod,
             scopeFacts: sc.scopeFacts, totalFacts: sc.totalFacts };
  }

  // statement — fold + render one pa_report into the panel.
  function statement(reportId) {
    if (typeof withBundle !== 'function') { console.warn('§REPORT no bundle'); return; }
    withBundle(function (db) {
      try {
        if (!bundleHasStatements(db)) { renderUnsupported(db, 'pa_report'); console.log('§STATEMENT bundle lacks pa_report/fact_acct/ad_treenode'); return; }
        var inp = statementInputs(db, reportId);
        if (!inp) { renderUnsupported(db, 'pa_report'); console.log('§STATEMENT report=' + reportId + ' not in bundle'); return; }
        var folded = CORE.foldStatement(inp.report, inp.lines, inp.cols, inp.sourcesByLine, inp.factRows, inp.accounts, inp.periodWindows);
        folded.coverage = inp.coverage;                          // R-T2: carry the honest source tag into the render
        folded.sourcePeriod = inp.sourcePeriod;
        renderStatement(db, inp, folded);
        var seg = inp.lines.filter(function (l) { return l.linetype === 'S'; }).length;
        var sp = inp.sourcePeriod ? (inp.sourcePeriod.id + '/' + inp.sourcePeriod.name) : 'none';
        console.log('§STATEMENT report=' + inp.report.pa_report_id + ' "' + inp.report.name + '" lines=' + inp.lines.length +
          ' (S=' + seg + ') cols=' + inp.cols.length + ' cells=' + (inp.lines.length * inp.cols.length) +
          ' schema=' + folded.schema + ' foldsFrom=' + folded.foldsFrom +
          ' coverage=' + inp.coverage + ' sourcePeriod=' + sp + ' scopeFacts=' + inp.scopeFacts +
          ' — every cell a re-sum of fact_acct, 0 invented');
      } catch (er) { console.warn('§STATEMENT fold error', er && er.message); }
    });
  }

  function fmtN(n) { return n == null ? 'n/a' : Number(n).toFixed(2); }
  function money(n) { return n == null ? '<span class=rpna>n/a</span>' : Number(n).toFixed(2); }

  function render(db, rec) {
    var fin = rec.financial;
    var h = '<span class=rpx title=close>✕</span>' +
      '<div class=rph><span class=rpglyph>▤</span> Receipt — ' + esc(fname(rec.key)) + ' #' + esc(rec.docno == null ? rec.id : rec.docno) + '</div>' +
      pickerHtml(db, null) +
      '<div class=rpmeta>' + (rec.partner ? '<div><b>Partner</b> ' + esc(rec.partner) + '</div>' : '') +
        (rec.date ? '<div><b>Date</b> ' + esc(rec.date) + '</div>' : '') + '</div>' +
      '<table class=rptbl><thead><tr><th>#</th><th>Item</th><th class=rpr>Qty</th>' +
        (fin ? '<th class=rpr>Price</th><th class=rpr>Amount</th>' : '') + '</tr></thead><tbody>';
    rec.lines.forEach(function (l) {
      h += '<tr><td>' + esc(l.line) + '</td><td>' + esc(l.name) + '</td><td class=rpr>' + esc(l.qty == null ? '' : l.qty) + '</td>' +
        (fin ? '<td class=rpr>' + esc(l.price == null ? '' : Number(l.price).toFixed(2)) + '</td><td class=rpr>' + money(l.amount) + '</td>' : '') + '</tr>';
    });
    if (!rec.lines.length) h += '<tr><td colspan=' + (fin ? 5 : 3) + ' class=rpna>(no lines carried in the bundle)</td></tr>';
    h += '</tbody></table>';
    if (fin) {
      h += '<div class=rptot><div><span>Subtotal</span><span>' + money(rec.subtotal) + '</span></div>' +
        '<div><span>Tax</span><span>' + money(rec.tax) + '</span></div>' +
        '<div class=rpgrand><span>Total</span><span>' + money(rec.total) + '</span></div></div>';
    } else {
      h += '<div class=rptot rpnafin><div class=rpna>non-financial document — qty only, no money columns carried</div></div>';
    }
    h += '<div class=rpfoot>folded from the bundle — every amount is a re-sum of the rows, no value is hand-authored</div>';
    panel.innerHTML = h; panel.className = 'open'; wirePicker();
    // ⎙ the iDempiere-format print (foldPrint over ad_printformat) — offered only when the bundle carries the
    // format AND the document's materialized print view (data-gated, never a dead button).
    try { wirePrintButton(rec); } catch (e) {}
  }
  function wirePrintButton(rec) {
    if (typeof withBundle !== 'function') return;
    withBundle(function (db) {
      var view = rec.key + '_header_v';                              // c_invoice -> c_invoice_header_v (the print view)
      var fmt = hasTable(db, view) ? formatForTable(db, view) : null;
      if (!fmt) return;
      var head = panel.querySelector('.rph'); if (!head) return;
      var b = document.createElement('button');
      b.className = 'rptab'; b.style.marginLeft = '8px'; b.textContent = '⎙ iDempiere format';
      b.title = 'fold via AD_PrintFormat "' + fmt.name + '" (W-PRINTFORMAT maxDiff=0c)';
      b.addEventListener('click', function () {
        var map = REPORT_MAP[rec.key];
        printDoc(fmt.ad_printformat_id, { column: map.pk, value: rec.id });
      });
      head.appendChild(b);
    });
  }
  // ── statements picker bar (shown whenever the bundle carries pa_report) ──────
  var STMT_LIST = null;                                            // cached [{id,name}] per bundle
  function statementList(db) {
    if (STMT_LIST) return STMT_LIST;
    try { STMT_LIST = bundleHasStatements(db) ? rowsOf(db.exec('SELECT pa_report_id id, name FROM pa_report ORDER BY pa_report_id')) : []; }
    catch (e) { STMT_LIST = []; }
    return STMT_LIST;
  }
  function pickerHtml(db, activeId) {
    var list = statementList(db);
    if (!list.length) return '';
    var tabs = list.map(function (s) {
      return '<button class="rptab' + (s.id == activeId ? ' on' : '') + '" data-stmt="' + s.id + '">' + esc(s.name) + '</button>';
    }).join('');
    return '<div class=rppick><span class=rppicklbl>Financials</span>' + tabs + '</div>';
  }
  function wirePicker() {
    panel.querySelectorAll('.rptab').forEach(function (b) {
      b.addEventListener('click', function () { statement(b.getAttribute('data-stmt') | 0); });
    });
    var x = panel.querySelector('.rpx'); if (x) x.addEventListener('click', close);
  }

  // renderStatement — the (lines × columns) matrix, folded cent-exact from fact_acct.
  function renderStatement(db, inp, folded) {
    var cols = inp.cols, lines = inp.lines;
    // R-T2 honest banner: when the output is the historical default (no live period configured), say so plainly.
    // coverage:absent (truly empty journal) shows the honest gate; coverage:live (a real picker, future) shows nothing.
    var banner = '';
    if (folded.coverage === 'default→history') {
      var sp = folded.sourcePeriod ? (' — period ' + esc(folded.sourcePeriod.name) + ')') : ')';
      banner = '<div class=rpbanner>Showing historical Fact_Acct (2002–2003' + sp + ' — no live period configured.</div>';
    } else if (folded.coverage === 'absent') {
      banner = '<div class="rpbanner rpna">No Fact_Acct history in this bundle — nothing to fold (coverage: absent).</div>';
    }
    var h = '<span class=rpx title=close>✕</span>' +
      '<div class=rph><span class=rpglyph>▤</span> ' + esc(inp.report.name) + '</div>' +
      pickerHtml(db, inp.report.pa_report_id) + banner +
      '<table class=rptbl><thead><tr><th></th>' +
        cols.map(function (c) { return '<th class=rpr>' + esc(c.name) + '</th>'; }).join('') + '</tr></thead><tbody>';
    lines.forEach(function (l) {
      var calc = l.linetype === 'C';
      h += '<tr class="' + (calc ? 'rpcalc' : '') + '"><td>' + esc(l.name) + '</td>' +
        cols.map(function (c) {
          var v = (folded.cells[l.pa_reportline_id] || {})[c.pa_reportcolumn_id];
          return '<td class=rpr>' + (v == null ? '<span class=rpna>·</span>' : esc(Number(v).toFixed(2))) + '</td>';
        }).join('') + '</tr>';
    });
    h += '</tbody></table>' +
      '<div class=rpfoot>folded from the journal via PA_Report metadata — every cell is a re-sum of fact_acct (W-PA-REPORT, maxDiff=0c vs iDempiere), no value is hand-authored</div>';
    panel.innerHTML = h; panel.className = 'open'; wirePicker();
  }

  // ════════════════════════════════════════════════════════════════════════
  // DOCUMENT PRINT — bring W-PRINTFORMAT foldPrint into the browser (REPORTING_LANE Step 2/3).
  // The bundle carries ad_printformat/_item + the MATERIALIZED print views (extract_printformat.sh); this host
  // path assembles foldPrint's inputs from the bundle and renders the manifest as DOM — the DataEngine/
  // LayoutEngine/Jasper replacement. Every number in the render is a view row or a BigDecimal break sum
  // (W-PRINTFORMAT: == live base tables + the stored GrandTotal, maxDiff=0c).
  // ════════════════════════════════════════════════════════════════════════
  var PRINT_MODEL = null;                                            // cached {formatsById, itemsByFormat} per bundle
  function printModel(db) {
    if (PRINT_MODEL) return PRINT_MODEL;
    if (!hasTable(db, 'ad_printformat') || !hasTable(db, 'ad_printformatitem')) return null;
    var formatsById = {}; rowsOf(db.exec('SELECT ad_printformat_id, name, tablename, isactive FROM ad_printformat')).forEach(function (f) { formatsById[f.ad_printformat_id] = f; });
    var itemsByFormat = {}; rowsOf(db.exec("SELECT * FROM ad_printformatitem WHERE isactive='Y'")).forEach(function (i) { (itemsByFormat[i.ad_printformat_id] = itemsByFormat[i.ad_printformat_id] || []).push(i); });
    PRINT_MODEL = { formatsById: formatsById, itemsByFormat: itemsByFormat };
    return PRINT_MODEL;
  }
  // the host row source: the materialized print-view tables carried by the bundle (PG evaluated the view SQL at
  // extract time — nothing re-derived here). A format whose view is not in the bundle folds to 0 rows, honestly.
  function bundleRowsOf(db) {
    return function (format, link) {
      var t = String(format.tablename || '').toLowerCase();
      if (!/^[a-z0-9_]+$/.test(t) || !hasTable(db, t)) return [];
      var sql = 'SELECT * FROM ' + t + (link ? ' WHERE ' + String(link.column).replace(/[^a-z0-9_]/gi, '') + '=' + (Number(link.value) | 0) : '');
      try { return rowsOf(db.exec(sql)); } catch (e) { return []; }
    };
  }
  // resolve the print format for a document table DATA-driven: the active ad_printformat over the table's print
  // view, preferring the non-TEMPLATE (client) one — read from the dictionary, not hardcoded.
  function formatForTable(db, viewName) {
    var pm = printModel(db); if (!pm) return null;
    var cand = Object.keys(pm.formatsById).map(function (k) { return pm.formatsById[k]; })
      .filter(function (f) { return String(f.tablename).toLowerCase() === viewName && f.isactive !== 'N'; });
    cand.sort(function (a, b) {                                       // client format before ** TEMPLATE **
      var ta = /TEMPLATE/.test(a.name) ? 1 : 0, tb = /TEMPLATE/.test(b.name) ? 1 : 0;
      return (ta - tb) || (a.ad_printformat_id - b.ad_printformat_id);
    });
    return cand[0] || null;
  }
  function printDoc(formatId, link) {
    if (typeof withBundle !== 'function') { console.warn('§PRINT no bundle'); return; }
    withBundle(function (db) {
      try {
        var pm = printModel(db);
        if (!pm || !pm.formatsById[formatId]) { renderUnsupported(db, 'ad_printformat'); console.log('§PRINT format=' + formatId + ' not in bundle'); return; }
        var m = CORE.foldPrint(pm.formatsById[formatId], pm.formatsById, pm.itemsByFormat, bundleRowsOf(db), link || null);
        renderPrint(db, m);
        var det = (m.rows[0] && m.rows[0].children[0]) ? m.rows[0].children[0].manifest : null;
        console.log('§PRINT format=' + formatId + ' "' + m.format.name + '" masterRows=' + m.rows.length +
          ' detailRows=' + (det ? det.rows.length : 0) +
          ' breakTotal=' + (det && det.breaks.total && det.breaks.total.linenetamt ? det.breaks.total.linenetamt.sum : 'n/a') +
          ' — folded via ad_printformat metadata (W-PRINTFORMAT maxDiff=0c), no value hand-authored');
      } catch (er) { console.warn('§PRINT fold error', er && er.message); }
    });
  }
  // renderPrint — the manifest as DOM: master printed fields, each 'P' child as a detail table, break Σ rows.
  function renderPrint(db, m) {
    var master = m.rows[0];
    var h = '<span class=rpx title=close>✕</span>' +
      '<div class=rph><span class=rpglyph>⎙</span> ' + esc(m.format.name) + '</div>' + pickerHtml(db, null);
    if (!master) {
      h += '<div class="rpfoot rpna">no rows for this document in the bundle</div>';
      panel.innerHTML = h; panel.className = 'open'; wirePicker(); return;
    }
    h += '<div class=rpmeta>';
    m.fields.forEach(function (f) {                                   // printed master fields with a value
      if (f.type !== 'F' || !f.column) return;
      var v = master.cells[f.column];
      if (v == null || v === '') return;
      h += '<div><b>' + esc(f.printName) + '</b> ' + esc(v) + '</div>';
    });
    h += '</div>';
    master.children.forEach(function (ch) {
      var d = ch.manifest;
      var dcols = d.fields.filter(function (f) { return f.type === 'F' && f.column; });
      h += '<table class=rptbl><thead><tr>' + dcols.map(function (f) { return '<th class=rpr>' + esc(f.printName) + '</th>'; }).join('') + '</tr></thead><tbody>';
      d.rows.forEach(function (r) {
        h += '<tr>' + dcols.map(function (f) {
          var v = r.cells[f.column];
          return '<td class=rpr>' + (v == null || v === '' ? '' : esc(v)) + '</td>';
        }).join('') + '</tr>';
      });
      h += '</tbody></table>';
      if (d.breaks.total) {
        h += '<div class=rptot>';
        Object.keys(d.breaks.total).forEach(function (c) {
          var f = d.breaks.total[c];
          if (f.sum != null) h += '<div class=rpgrand><span>Σ ' + esc(c) + '</span><span>' + esc(f.sum) + '</span></div>';
          if (f.count != null) h += '<div><span># ' + esc(c) + '</span><span>' + esc(f.count) + '</span></div>';
          if (f.avg != null) h += '<div><span>⌀ ' + esc(c) + '</span><span>' + esc(f.avg) + '</span></div>';
        });
        h += '</div>';
      }
    });
    h += '<div class=rpfoot>folded via AD_PrintFormat (the iDempiere layout AS DATA) over the bundled print views — break totals are BigDecimal re-sums (W-PRINTFORMAT == live iDempiere, maxDiff=0c)</div>';
    panel.innerHTML = h; panel.className = 'open'; wirePicker();
  }

  // TRIAL BALANCE — the action='R' menu leaf (502) backed by the ALREADY-PROVEN foldTrialBalance (§REPORT-FIN:
  // ΣDr=ΣCr to the cent, re-derived from fact_acct). Statement of Accounts (350) has no oracle-anchored fold
  // yet — it stays dimmed in the menu (named-deferred, never faked).
  function trialBalance() {
    if (typeof withBundle !== 'function') { console.warn('§TB no bundle'); return; }
    withBundle(function (db) {
      try {
        if (!hasTable(db, 'fact_acct')) { renderUnsupported(db, 'fact_acct'); return; }
        var accounts = {};
        rowsOf(db.exec('SELECT c_elementvalue_id id, value, name, accounttype FROM c_elementvalue')).forEach(function (r) { accounts[r.id] = r; });
        var factRows = rowsOf(db.exec('SELECT account_id, amtacctdr, amtacctcr FROM fact_acct'));
        var tb = CORE.foldTrialBalance(factRows, accounts);
        var h = '<span class=rpx title=close>✕</span><div class=rph><span class=rpglyph>▤</span> Trial Balance</div>' +
          pickerHtml(db, null) +
          '<table class=rptbl><thead><tr><th>Account</th><th></th><th class=rpr>Dr</th><th class=rpr>Cr</th></tr></thead><tbody>';
        tb.lines.forEach(function (l) {
          h += '<tr><td>' + esc(l.value) + '</td><td>' + esc(l.name || '') + '</td><td class=rpr>' + esc(l.dr) + '</td><td class=rpr>' + esc(l.cr) + '</td></tr>';
        });
        h += '</tbody></table><div class=rptot>' +
          '<div class=rpgrand><span>Σ Dr / Σ Cr</span><span>' + esc(tb.totalDr) + ' / ' + esc(tb.totalCr) + '</span></div>' +
          '<div><span>balanced</span><span>' + (tb.balanced ? 'YES (to the cent)' : 'NO — diff ' + tb.maxDiffCents + 'c') + '</span></div></div>' +
          '<div class=rpfoot>every figure is a re-sum of the bundled fact_acct (§REPORT-FIN ΣDr=ΣCr); nothing hand-authored</div>';
        panel.innerHTML = h; panel.className = 'open'; wirePicker();
        console.log('§TB accounts=' + tb.lines.length + ' totalDr=' + tb.totalDr + ' totalCr=' + tb.totalCr + ' balanced=' + tb.balanced);
      } catch (er) { console.warn('§TB fold error', er && er.message); }
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // iDempiere AD_Menu launcher — follow iDempiere's menu to reach the reports.
  // Path (AD_Tree 10 "Menu"): Performance Analysis and Accounting (278) → Financial Reporting (280) →
  // Financial Report (281, a Window over table PA_Report). The 3 PA_Reports are the WINDOW RECORDS; selecting
  // one runs the fold (== iDempiere's "Create Report" process on that PA_Report). Tree + names are READ from
  // the bundle's ad_menu/ad_treenodemm (extract_pa_report.sh) — not invented; matches live AD_Menu (W-PA-MENU).
  // ════════════════════════════════════════════════════════════════════════
  var MENU_TREE = 10, MENU_REPORTING_NODE = 280, MENU_PAA_NODE = 278;   // Financial Reporting / its parent
  function menuModel(db) {
    if (!hasTable(db, 'ad_menu') || !hasTable(db, 'ad_treenodemm')) return null;
    var menu = {}; rowsOf(db.exec('SELECT ad_menu_id, name, action, issummary, isactive FROM ad_menu')).forEach(function (m) { menu[m.ad_menu_id] = m; });
    var kids = {}; rowsOf(db.exec('SELECT node_id, parent_id, seqno FROM ad_treenodemm WHERE ad_tree_id=' + MENU_TREE)).forEach(function (n) { (kids[n.parent_id] = kids[n.parent_id] || []).push(n); });
    Object.keys(kids).forEach(function (p) { kids[p].sort(function (a, b) { return (a.seqno || 0) - (b.seqno || 0); }); });
    var tbl = {}; if (hasTable(db, 'ad_menu_table')) rowsOf(db.exec('SELECT ad_menu_id, tablename FROM ad_menu_table')).forEach(function (r) { tbl[r.ad_menu_id] = r.tablename; });
    return { menu: menu, kids: kids, tbl: tbl };
  }
  // openMenu — render the iDempiere Financial Reporting branch; the PA_Report-backed node lists the report records.
  function openMenu() {
    if (typeof withBundle !== 'function') { console.warn('§REPORT no bundle'); return; }
    withBundle(function (db) {
      try {
        var mm = menuModel(db);
        if (!mm || !mm.kids[MENU_REPORTING_NODE]) {                          // no menu in bundle -> fall back to the flat picker
          if (statementList(db).length) { statement(statementList(db)[0].id); } else { renderUnsupported(db, 'ad_menu'); }
          console.log('§MENU no ad_menu in bundle — fell back to statement picker'); return;
        }
        var crumb = [MENU_PAA_NODE, MENU_REPORTING_NODE].map(function (id) { return mm.menu[id] ? mm.menu[id].name : id; }).join(' › ');
        var reachable = 0;
        var h = '<span class=rpx title=close>✕</span><div class=rph><span class=rpglyph>▤</span> Menu</div>' +
          '<div class=rpcrumb>' + esc(crumb) + '</div><div class=rpmenu>';
        (mm.kids[MENU_REPORTING_NODE] || []).forEach(function (n) {
          var m = mm.menu[n.node_id]; if (!m || m.isactive === 'N') return;
          var actionable = mm.tbl[n.node_id] === 'PA_Report';                 // the Financial Report window opens PA_Report
          // action='R' leaves backed by a PROVEN fold become actionable: Trial Balance -> foldTrialBalance
          // (§REPORT-FIN). Statement of Accounts stays dimmed — no oracle-anchored fold yet (named-deferred).
          var tbLeaf = (m.action === 'R' && /^trial balance$/i.test(String(m.name)));
          var on = actionable || tbLeaf;
          h += '<div class="rpmi' + (on ? ' on' : ' off') + '"' + (tbLeaf ? ' data-leaf="tb"' : '') +
            (on ? (tbLeaf ? ' style="cursor:pointer"' : '') : ' title="iDempiere menu item — this build folds: Financial Report (PA_Report) + Trial Balance"') + '>' +
            '<span class=rpmact>' + esc(m.action || '') + '</span>' + esc(m.name) + '</div>';
          if (actionable) {
            statementList(db).forEach(function (r) { reachable++; h += '<div class=rpmrep data-report="' + r.id + '">' + esc(r.name) + '</div>'; });
          }
          if (tbLeaf) reachable++;
        });
        h += '</div><div class=rpfoot>iDempiere AD_Menu (tree 10): ' + esc(crumb) + ' → Financial Report → PA_Report; selecting a report runs the fold (= "Create Report").</div>';
        panel.innerHTML = h; panel.className = 'open';
        panel.querySelector('.rpx').addEventListener('click', close);
        panel.querySelectorAll('.rpmrep').forEach(function (el) { el.addEventListener('click', function () { statement(el.getAttribute('data-report') | 0); }); });
        panel.querySelectorAll('[data-leaf="tb"]').forEach(function (el) { el.addEventListener('click', trialBalance); });
        console.log('§MENU opened "' + crumb + '" reports-reachable=' + reachable + ' (data-driven from ad_menu/ad_treenodemm)');
      } catch (er) { console.warn('§MENU error', er && er.message); }
    });
  }

  function renderUnsupported(db, key) {
    panel.innerHTML = '<span class=rpx title=close>✕</span><div class=rph><span class=rpglyph>▤</span> Receipt — ' + esc(fname(key)) + '</div>' +
      pickerHtml(db, null) +
      '<div class=rpfoot rpna>No header/line receipt for this document kind in the bundle. (Report folds documents that have a line table — orders, invoices, shipments.)</div>';
    panel.className = 'open'; wirePicker();
  }
  function close() { panel.className = ''; panel.innerHTML = ''; }

  // ── react to the ring's key-addressed Report intent (no import of crud_overlay — the bus is the seam) ──
  global.addEventListener('overlay:report', function (ev) { var d = ev && ev.detail; if (d && d.key) show(d.key); });
  // ── react to a financial-statement intent (a menu/launcher can dispatch this with a pa_report id) ──
  global.addEventListener('overlay:statement', function (ev) { var d = ev && ev.detail; if (d && d.reportId != null) statement(d.reportId | 0); });
  // ── react to a document-print intent (formatId + optional {column,value} master link) ──
  global.addEventListener('overlay:print', function (ev) { var d = ev && ev.detail; if (d && d.formatId != null) printDoc(d.formatId | 0, d.link || null); });

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function fname(k) { return (typeof global.fname === 'function') ? global.fname(k) : k; }

  function injectCss() {
    var css = document.createElement('style');
    css.textContent =
      '#reportPanel{position:fixed;z-index:76;right:14px;top:64px;width:min(380px,94vw);max-height:78vh;overflow:auto;' +
        'background:#120d16;border:1px solid #4a2f44;border-radius:12px;padding:14px 16px;color:#ecdcea;' +
        'font:13px/1.5 system-ui;box-shadow:0 10px 40px rgba(0,0,0,.65);display:none}' +
      '#reportPanel.open{display:block}' +
      '#reportPanel .rpx{position:absolute;right:11px;top:9px;color:#a07f99;cursor:pointer}' +
      '#reportPanel .rph{font-weight:600;font-size:15.5px;margin:0 22px 10px 0;color:#fbeaf7}' +
      '#reportPanel .rpglyph{color:#9fdfe8}' +
      '#reportPanel .rpmeta{display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:#c4a8c0;margin:0 0 10px}' +
      '#reportPanel .rpmeta b{color:#8a6f86;font-weight:600;margin-right:4px}' +
      '#reportPanel .rpbanner{font-size:11px;color:#c9b18a;background:#241a10;border:1px solid #4a3a1f;' +
        'border-radius:7px;padding:5px 9px;margin:0 0 10px;line-height:1.4}' +
      '#reportPanel .rptbl{width:100%;border-collapse:collapse;font-size:12.5px}' +
      '#reportPanel .rptbl th{text-align:left;color:#8a6f86;font-weight:600;border-bottom:1px solid #3a2b38;padding:3px 6px}' +
      '#reportPanel .rptbl td{padding:3px 6px;border-bottom:1px solid #221826}' +
      '#reportPanel .rpr{text-align:right;font-variant-numeric:tabular-nums}' +
      '#reportPanel .rptot{margin-top:10px;font-size:13px}' +
      '#reportPanel .rptot>div{display:flex;justify-content:space-between;padding:2px 6px;font-variant-numeric:tabular-nums}' +
      '#reportPanel .rptot>div>span:first-child{color:#c4a8c0}' +
      '#reportPanel .rpgrand{border-top:1px solid #3a2b38;margin-top:3px;padding-top:5px;font-weight:600;color:#bff0dd}' +
      '#reportPanel .rpna{color:#8a6f86;font-style:italic}' +
      '#reportPanel .rpfoot{margin-top:11px;font-size:11px;color:#8a6f86;font-style:italic;line-height:1.4}' +
      '#reportPanel .rppick{display:flex;flex-wrap:wrap;align-items:center;gap:5px;margin:0 0 11px;padding-bottom:9px;border-bottom:1px solid #2a1f29}' +
      '#reportPanel .rppicklbl{font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:#8a6f86;margin-right:2px}' +
      '#reportPanel .rptab{font:11.5px/1 system-ui;color:#c4a8c0;background:#1c1422;border:1px solid #3a2b38;border-radius:7px;padding:4px 8px;cursor:pointer}' +
      '#reportPanel .rptab:hover{border-color:#6a4a62;color:#fbeaf7}' +
      '#reportPanel .rptab.on{background:#3a2440;border-color:#9fdfe8;color:#bff0dd}' +
      '#reportPanel .rpcalc td{font-weight:600;color:#fbeaf7;border-top:1px solid #2a1f29}' +
      // #reportMenuPill removed — Reports now surfaces as a registry pill (pills_idmp.json + IdmpPillActions.reports → window.__report.menu)

      '#reportPanel .rpcrumb{font-size:11px;color:#8a6f86;margin:0 0 9px;padding-bottom:8px;border-bottom:1px solid #2a1f29}' +
      '#reportPanel .rpmenu{display:flex;flex-direction:column;gap:2px}' +
      '#reportPanel .rpmi{display:flex;align-items:center;gap:8px;padding:5px 7px;border-radius:7px;font-size:12.5px}' +
      '#reportPanel .rpmi.on{color:#fbeaf7;font-weight:600}' +
      '#reportPanel .rpmi.off{color:#7a6076}' +
      '#reportPanel .rpmact{font:10px/1 ui-monospace,monospace;color:#8a6f86;border:1px solid #3a2b38;border-radius:4px;padding:2px 4px;min-width:13px;text-align:center}' +
      '#reportPanel .rpmrep{margin-left:26px;padding:5px 8px;border-radius:7px;font-size:12.5px;color:#c4a8c0;cursor:pointer;border:1px solid transparent}' +
      '#reportPanel .rpmrep:hover{background:#3a2440;border-color:#9fdfe8;color:#bff0dd}';
    document.head.appendChild(css);
  }

  global.__report = { show: show, statement: statement, menu: openMenu, print: printDoc, printRecord: printRecord, trialBalance: trialBalance,
                      core: CORE, panel: function () { return panel; }, close: close };
  console.log('§REPORT layer mounted (read face — ▤ Report)');
})(typeof window !== 'undefined' ? window : this);
