// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// sheet_door.js - the SHEET FRONT DOOR engine: the user's own spreadsheet layout files a real iDempiere document.
// Implementing bim-compiler prompts/SHEET_FRONT_DOOR.md §1-§3 (slice S1) - Witness: W-SHEET-DOOR (erp/tests/witness_sheet_door.js).
// Contract (host-neutral, §1): input = the template (_door_tags JSON) + the VALUES of the tagged cells only ({ "B3": "JoeBlock" });
//   output = { ok, verdict, reason, writes: [{cell, value}], checks: [...], invoice }. The LEDGER is the host's: after it commits the
//   transaction, it appends the kernel's signed journal entry (ws_kernel journalOf, hash-chained, replayable) to the workbook's
//   _door_ledger sheet. The uncommitted op group is NOT the ledger: the commit assigns the record keys (W-SHEET-DOOR D9, 2026-11-27). The engine never parses a file format
//   and never names a cell the template does not name. Every spreadsheet host (Excel / WPS / LibreOffice / Google Sheets) is a thin
//   menu that reads the tagged cells and applies `writes`.
// Twin + AD-layer law: the door adds NO invoice logic. It declares I_Invoice rows and runs iDempiere's own Import Invoice
//   (AD_Process 207, processes/ImportInvoice.js, W-IMPORT-INVOICE) in the CALLER's transaction; on ok:false the caller drops it.
// The door passes NO DocAction of its own (SHEET_FRONT_DOOR.md §24.1): Import Invoice takes its dictionary default (PR, Prepare): the invoice is saved In Progress, not completed, not posted
//   (MInvoice.prepareIt returns STATUS_InProgress, MInvoice.java:1814). Completing it is the ERP window's own button. A template that asks for any other action is refused in words.
// Checks the sheet makes on itself (the document prints its own answers; we compare, never tune to them):
//   subtotal == sum of printed line amounts; qty x price == printed amount where all three are printed (exact decimals, no floats);
//   after the import: each printed amount == the filed line net, printed grand total == the filed grand total (tax by the twin).
// A check that cannot run must say so (prompts/SHEET_FRONT_DOOR.md §12, D10/D11): a tagged cell holding a formula with no saved result (host fact opts.noSavedResult) is REFUSED,
//   never read as blank; every verdict carries `ran` / `checksLine` (line / subtotal / grandtotal / linenet = ran | absent | no-saved-result | not-reached).
(function (global) {
  'use strict';

  var REVIEW_ONLY = 'this page files a document for review; complete it in the ERP';
  // Optional header cells (SHEET_FRONT_DOOR.md 29.8): what legacy's Import Invoice reads to CREATE a business partner that does not exist yet (ImportInvoice.java:515-626): the partner's name, its address
  //   (country is mandatory for a new partner: "ERR=Invalid Country" otherwise, :366-380) and its contact. Each key is an I_Invoice column; a template that names none still files for known partners.
  var HDR_OPT = { partnername: 'name', countrycode: 'countrycode', address1: 'address1', address2: 'address2', city: 'city', postal: 'postal', regionname: 'regionname', contactname: 'contactname', email: 'email', phone: 'phone' };
  var COLS = { product: 'productvalue', charge: 'chargename', description: 'description', qty: 'qtyordered', price: 'priceactual' };

  // ── exact decimals: a printed number as { n: BigInt, s: scale } (money via exact arithmetic, never IEEE floats) ──
  function dec(v) {
    if (v == null) return null;
    var t = String(v).replace(/,/g, '').trim();
    if (t === '') return null;
    var m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(t);
    if (!m || (m[2] === '' && !m[3])) return undefined;                        // not a number: undefined (a refusal), blank: null
    var frac = m[3] || '';
    return { n: BigInt((m[1] === '-' ? '-' : '') + (m[2] || '0') + frac), s: frac.length };
  }
  function scaleTo(d, s) { return d.n * (BigInt(10) ** BigInt(s - d.s)); }
  function decEq(a, b) { var s = Math.max(a.s, b.s); return scaleTo(a, s) === scaleTo(b, s); }
  function decAdd(a, b) { var s = Math.max(a.s, b.s); return { n: scaleTo(a, s) + scaleTo(b, s), s: s }; }
  function decMul(a, b) { return { n: a.n * b.n, s: a.s + b.s }; }
  function decRound2(d) {                                                       // HALF_UP to 2 places (the currency precision of the line net)
    if (d.s <= 2) return { n: scaleTo(d, 2), s: 2 };
    var f = BigInt(10) ** BigInt(d.s - 2), q = d.n / f, r = d.n % f; if (r < 0) r = -r;
    if (r * BigInt(2) >= f) q += d.n < 0 ? BigInt(-1) : BigInt(1);
    return { n: q, s: 2 };
  }
  function decStr(d) {
    if (!d) return String(d);
    var neg = d.n < 0, a = (neg ? -d.n : d.n).toString();
    if (d.s === 0) return (neg ? '-' : '') + a;
    while (a.length <= d.s) a = '0' + a;
    return (neg ? '-' : '') + a.slice(0, a.length - d.s) + '.' + a.slice(a.length - d.s);
  }

  function cellOf(tpl, col, row) { return tpl.lines.cols[col] ? tpl.lines.cols[col] + row : null; }
  function blank(v) { return v == null || String(v).trim() === ''; }

  // readLines(tpl, cells) -> [{ row, f: {I_Invoice fields}, amount, qty, price }] for the filled line rows of the template's range
  function readLines(tpl, cells) {
    var out = [];
    for (var r = tpl.lines.from; r <= tpl.lines.to; r++) {
      var v = function (c) { var a = cellOf(tpl, c, r); return a ? cells[a] : null; };
      if (blank(v('product')) && blank(v('charge'))) continue;               // §2: a row with no product and no charge is empty
      var f = {};
      Object.keys(COLS).forEach(function (c) { var x = v(c); if (!blank(x)) f[COLS[c]] = c === 'qty' || c === 'price' ? decStr(dec(x)) : String(x).trim(); });
      out.push({ row: r, f: f, qty: dec(v('qty')), price: dec(v('price')), amount: dec(v('amount')), raw: { qty: v('qty'), price: v('price'), amount: v('amount') } });
    }
    return out;
  }

  // tagCells(tpl) -> the addresses file() READS (the host reads exactly these, nothing else): the header cells it consumes (status is write-only) and every
  //   line column of the range. W-SHEET-ADDIN A1: the engine owns which cells it reads, so a host menu never guesses.
  function tagCells(tpl) {
    var out = [], seen = {}, add = function (a) { if (a && !seen[a]) { seen[a] = 1; out.push(a); } };
    ['partner', 'date', 'docno', 'subtotal', 'grandtotal'].concat(Object.keys(HDR_OPT)).forEach(function (k) { add(tpl.header && tpl.header[k]); });
    for (var row = tpl.lines.from; row <= tpl.lines.to; row++) ['product', 'charge', 'description', 'qty', 'price', 'amount'].forEach(function (c) { add(cellOf(tpl, c, row)); });
    return out;
  }

  // §12 Rule 1: the tagged cells this filing READS that hold a formula and no saved result (the host says which; the engine never parses a file). Header cells always; a line column only on a
  //   filled row (a product or charge printed, or that cell is itself such a formula); an unfilled row is not read (§2).
  function noResultCells(tpl, cells, nsr) {
    var bad = {}, out = [];
    (nsr || []).forEach(function (a) { bad[a] = 1; });
    var hit = function (a) { if (a && bad[a]) { out.push(a); delete bad[a]; } };
    ['partner', 'date', 'docno', 'subtotal', 'grandtotal'].concat(Object.keys(HDR_OPT)).forEach(function (k) { hit(tpl.header && tpl.header[k]); });
    for (var rw = tpl.lines.from; rw <= tpl.lines.to; rw++) {
      var pa = cellOf(tpl, 'product', rw), ca = cellOf(tpl, 'charge', rw);
      var filled = !blank(pa && cells[pa]) || !blank(ca && cells[ca]) || !!(pa && bad[pa]) || !!(ca && bad[ca]);
      if (!filled) continue;
      ['product', 'charge', 'description', 'qty', 'price', 'amount'].forEach(function (c) { hit(cellOf(tpl, c, rw)); });
    }
    return out;
  }
  function listCells(a) { return a.length === 1 ? 'cell ' + a[0] : 'cells ' + a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  function ranLine(ran) { return 'checks: ' + ['line', 'subtotal', 'grandtotal', 'linenet'].map(function (k) { return k + '=' + ran[k]; }).join(' '); }

  // the words of a DocStatus code, from the dictionary (AD_Ref_List of the C_Invoice.DocStatus column); the code itself when the dictionary has no row
  function statusName(trx, code) {
    var r = trx.q("SELECT r.name AS n FROM ad_ref_list r JOIN ad_column col ON col.ad_reference_value_id = r.ad_reference_id JOIN ad_table t ON t.ad_table_id = col.ad_table_id " +
      "WHERE lower(t.tablename) = 'c_invoice' AND lower(col.columnname) = 'docstatus' AND r.value = ?", [code])[0];
    return r && r.n ? r.n : String(code);
  }
  function refuse(res, verdict, reason) { res.ok = false; res.verdict = verdict; res.reason = reason; return res; }
  function statusWrite(tpl, res, text) { if (tpl.header.status) res.writes.push({ cell: tpl.header.status, value: text }); }

  // check(tpl, cells, opts) - the pure checks the sheet makes on itself, BEFORE any books are touched (SHEET_FRONT_DOOR.md section 29.5, slice 2: moved out of file(), not rewritten, so the
  //   PDF page and the ERP judge by the same code). Returns { ok, stop, verdict, reason, writes, checks, ran, checksLine, lines (filled rows), silent }: stop = a refusal (verdict REFUSED /
  //   INCONCLUSIVE, reason, the status write); ok = every check that can run without the books passed (verdict 'CHECKED'). The grand total needs the books (tax by the twin): file() judges it.
  function finish(r) { r.checksLine = ranLine(r.ran); return r; }
  function pre(tpl, cells, opts) {
    opts = opts || {};
    var H = tpl && tpl.header, res = { ok: false, verdict: null, reason: null, writes: [], checks: [], ran: { line: 'not-reached', subtotal: 'not-reached', grandtotal: 'not-reached', linenet: 'not-reached' } };
    var stop = function (r) { return { stop: true, res: r }; };
    if (!tpl || tpl.kind !== 'invoice' || !tpl.header || !tpl.lines || !tpl.lines.cols) return stop(refuse(res, 'REFUSED', 'template is not an invoice template (§2)'));

    // ── §24.1: a template may not ask the door to complete the document: it files for review, the ERP completes ──
    var asked = tpl.docAction == null ? '' : String(tpl.docAction).trim().toUpperCase();
    if (asked !== '' && asked !== 'PR') {
      statusWrite(tpl, res, 'Not filed: ' + REVIEW_ONLY);
      return stop(refuse(res, 'REFUSED', REVIEW_ONLY + ' (the template asks for document action ' + asked + ')'));
    }

    var lines = readLines(tpl, cells);

    // ── D10 (§12 Rule 1): a formula with no saved result is not a blank: refuse, name the cells, say why ──
    var nr = noResultCells(tpl, cells, opts.noSavedResult);
    if (nr.length) {
      nr.forEach(function (a) {
        if (a === H.subtotal) res.ran.subtotal = 'no-saved-result'; else if (a === H.grandtotal) res.ran.grandtotal = 'no-saved-result';
        else for (var rr = tpl.lines.from; rr <= tpl.lines.to; rr++) if (a === cellOf(tpl, 'amount', rr)) res.ran.line = res.ran.linenet = 'no-saved-result';
      });
      var why = listCells(nr) + (nr.length === 1 ? ' holds a formula' : ' hold formulas') + ' with no saved result; open and save the file in your spreadsheet program, or type the figure' + (nr.length === 1 ? '' : 's');
      statusWrite(tpl, res, 'Not filed: ' + why);
      return stop(refuse(res, 'REFUSED', why));
    }

    // ── D6: nothing to judge -> INCONCLUSIVE ──
    if (!lines.length) { statusWrite(tpl, res, 'Not filed: no line filled'); return stop(refuse(res, 'INCONCLUSIVE', 'no filled line rows in ' + tpl.lines.from + '..' + tpl.lines.to)); }
    var bad = lines.filter(function (l) { return l.qty === undefined || l.price === undefined || l.amount === undefined; });
    if (bad.length) { statusWrite(tpl, res, 'Not filed: row ' + bad[0].row + ' has a value that is not a number'); return stop(refuse(res, 'REFUSED', 'row ' + bad[0].row + ' not a number ' + JSON.stringify(bad[0].raw))); }

    // ── D3: the sheet's own printed sums ──
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (l.qty && l.price && l.amount) {
        var calc = decRound2(decMul(l.qty, l.price)), okL = decEq(calc, l.amount);
        res.ran.line = 'ran';
        res.checks.push({ check: 'line', row: l.row, printed: decStr(l.amount), computed: decStr(calc), ok: okL });
        if (!okL) { statusWrite(tpl, res, 'Not filed: row ' + l.row + ' qty x price = ' + decStr(calc) + ' but the row prints ' + decStr(l.amount)); return stop(refuse(res, 'REFUSED', 'row ' + l.row + ' qty x price ' + decStr(calc) + ' != printed ' + decStr(l.amount))); }
      }
    }
    if (res.ran.line === 'not-reached') res.ran.line = 'absent';                // no row printed qty, price and amount together: nothing to compare
    res.ran.subtotal = 'absent'; var silent = [];                               // absent = nothing printed to compare (cell empty, or the template never tagged it)
    if (H.subtotal) {
      var printedSub = dec(cells[H.subtotal]);
      if (!printedSub) silent.push('subtotal');
      if (printedSub) {
        res.ran.subtotal = 'ran';
        var withAmt = lines.filter(function (x) { return x.amount; });
        if (withAmt.length !== lines.length) return stop(refuse(res, 'REFUSED', 'a subtotal is printed but ' + (lines.length - withAmt.length) + ' line(s) print no amount'));
        var sum = withAmt.reduce(function (a, x) { return decAdd(a, x.amount); }, { n: BigInt(0), s: 0 }), okS = decEq(sum, printedSub);
        res.checks.push({ check: 'subtotal', printed: decStr(printedSub), computed: decStr(sum), ok: okS });
        if (!okS) { statusWrite(tpl, res, 'Not filed: the lines add up to ' + decStr(sum) + ' but the subtotal prints ' + decStr(printedSub)); return stop(refuse(res, 'REFUSED', 'subtotal: lines ' + decStr(sum) + ' != printed ' + decStr(printedSub))); }
      }
    }

    return { stop: false, res: res, lines: lines, silent: silent };
  }
  function check(tpl, cells, opts) {
    var P = pre(tpl, cells, opts), r = finish(P.res);
    if (P.stop) { r.stop = true; return r; }
    r.ok = true; r.verdict = 'CHECKED'; r.stop = false; r.lines = P.lines.length; r.silent = P.silent;
    return r;
  }

  // file(trx, deps, tpl, cells, opts) - deps = { AP: ad_process.js }, opts = { AD_Client_ID, AD_Org_ID }
  function file(trx, deps, tpl, cells, opts) {
    opts = opts || {};
    var AP = deps.AP, H = tpl && tpl.header;
    var say = function (s) { trx.say(s); };
    var done = function (r) { finish(r); say('§SHEET_DOOR verdict=' + r.verdict + ' ok=' + r.ok + (r.reason ? ' reason="' + r.reason + '"' : '') + ' ' + r.checksLine + ' writes=' + JSON.stringify(r.writes.map(function (w) { return w.cell; }))); return r; };
    var P = pre(tpl, cells, opts), res = P.res;
    if (P.stop) return done(res);
    var lines = P.lines, silent = P.silent;

    // ── D8: legacy Import Invoice sweeps EVERY pending row of the client; the door files only its own ──
    var C = opts.AD_Client_ID != null ? opts.AD_Client_ID : trx.env.client, O = opts.AD_Org_ID != null ? opts.AD_Org_ID : trx.env.org;
    var foreign = trx.q("SELECT count(*) AS n FROM i_invoice WHERE ad_client_id=? AND COALESCE(i_isimported,'N')<>'Y'", [C])[0];
    if (foreign && Number(foreign.n) > 0) { statusWrite(tpl, res, 'Not filed: ' + foreign.n + ' other import row(s) are waiting in Import Invoice'); return done(refuse(res, 'REFUSED', foreign.n + ' pending I_Invoice row(s) not made by this filing')); }

    // ── declare the I_Invoice rows (one per filled line) the way legacy's Import Loader does: ImpFormat.updateDB (ImpFormat.java:640-680)
    //    is a raw INSERT of the standard fields + an UPDATE of the mapped columns with IsActive='Y', Processed='N', I_IsImported='N' -
    //    NOT PO.saveNew, so a blank DocumentNo stays NULL (PO.saveNew :3563-3584 would mint one per ROW and legacy Import Invoice would
    //    then break the sheet into one invoice per line, :678-680). trx.insert = the raw insert (physical DEFAULTs apply, as in SQL). ──
    var spPre = trx.setSavepoint();                                                       // before any row is declared: the master-data stages below hand the host their own rows only
    var back = function () { var c; try { c = structuredClone(spPre); } catch (e) { c = JSON.parse(JSON.stringify(spPre)); } trx.rollbackTo(c); };   // Trx.rollbackTo adopts the snapshot it is given: a snapshot can be used ONCE, so each return to the start is a fresh copy
    var hdr = Object.assign({}, tpl.fixed || {});
    if (!blank(cells[H.partner])) hdr.bpartnervalue = String(cells[H.partner]).trim();
    if (!blank(cells[H.date])) { var dt = String(cells[H.date]).trim().slice(0, 10) + ' 00:00:00'; hdr.dateinvoiced = dt; hdr.dateacct = dt; }
    if (H.docno && !blank(cells[H.docno])) hdr.documentno = String(cells[H.docno]).trim();
    Object.keys(HDR_OPT).forEach(function (k) { if (H[k] && !blank(cells[H[k]])) hdr[HDR_OPT[k]] = String(cells[H[k]]).trim(); });   // optional header cells -> their I_Invoice columns
    var ids = [];
    var declareRows = function () {
      ids = [];
      for (var j = 0; j < lines.length; j++) {
        var f = Object.assign({ ad_client_id: C, ad_org_id: O, isactive: 'Y', processed: 'N', i_isimported: 'N', qtyordered: '1' }, hdr, lines[j].f);
        ids.push(trx.insert('i_invoice', f).i_invoice_id);
      }
      say('§SHEET_DOOR declared rows=' + ids.length + ' partner=' + (hdr.bpartnervalue || '-') + ' docno=' + (hdr.documentno || '(minted)'));
    };
    // ── run iDempiere's own Import Invoice (AD_Process 207) in this transaction. stopAt 'bpartner' = legacy's commit point after the new-partner loop (ImportInvoice.java:649 commitEx): the process hands back there ──
    var runInvoice = function (stopAt) { var r0 = AP.runInTrx(trx, 207, { params: { AD_Client_ID: C, AD_Org_ID: O }, stopAt: stopAt }); return { pr: r0, mine: ids.map(function (id) { return trx.get('i_invoice', id); }) }; };   // no DocAction: the process's own default (PR) applies (§24.1)
    var made = function (t) { var o = [], m = trx.pend[t] || {}; Object.keys(m).forEach(function (id) { if (m[id].isNew && !m[id].deleted) o.push({ value: m[id].row.value, name: m[id].row.name }); }); return o; };   // rows this Trx has made and not yet committed
    var unknownOf = function (mine) {   // the products a run marked "ERR=Invalid Product, " (:461-468): one entry per printed code, named by the printed description
      var u = [], seen = {};
      mine.forEach(function (r, i) { if (r && /ERR=Invalid Product, /.test(String(r.i_errormsg || '')) && r.productvalue != null && !seen[r.productvalue]) { seen[r.productvalue] = 1; u.push({ value: r.productvalue, name: lines[i].f.description || r.productvalue }); } });
      return u;
    };
    var stageProducts = function (unknown) {   // legacy's way to MAKE a product: ONE I_Product row per unknown code (Value = the code, Name = the printed description, every other column the process's own default, ImportProduct.java:215-226, :307-315) and Import Product
      unknown.forEach(function (u) { trx.insert('i_product', { ad_client_id: C, ad_org_id: O, isactive: 'Y', processed: 'N', i_isimported: 'N', value: u.value, name: u.name }); });
      var ip = AP.runInTrx(trx, 196, { params: { AD_Client_ID: C } }), bad = unknown.filter(function (u) { return !trx.find('m_product', { value: u.value, ad_client_id: C })[0]; });
      if (ip.ok && !bad.length) return null;
      var pm = trx.find('i_product', { value: bad.length ? bad[0].value : unknown[0].value }, null, {})[0], pmsg = pm && pm.i_errormsg ? String(pm.i_errormsg).replace(/ERR=/g, '').replace(/[\s,]+$/, '').trim() : (ip.summary || 'Import Product failed');
      statusWrite(tpl, res, 'Not filed: the product ' + (bad.length ? bad[0].value : unknown[0].value) + ' could not be created: ' + pmsg);
      return done(refuse(res, 'REFUSED', 'Import Product: ' + pmsg));
    };
    // What this document would make beyond itself, found by RUNNING legacy's own processes up to their commit points and taking the run back (SHEET_FRONT_DOOR.md 29.8 item 3: the same lookups, never a copy):
    //   the products Import Invoice cannot find and the partners its new-partner loop creates (a row that came back "Invalid Product" is not in that loop, so the products are made first, pending, and it is run once more).
    var plan = function () {
      declareRows(); var r1 = runInvoice('bpartner'), unknown = unknownOf(r1.mine), partners = made('c_bpartner');
      if (unknown.length) { back(); var bad = stageProducts(unknown); if (bad) return { refused: bad }; declareRows(); runInvoice('bpartner'); partners = partners.concat(made('c_bpartner')); }
      back();
      return { partners: partners, products: unknown };
    };
    if (opts.stage === 'products' || opts.stage === 'partners') {                              // a host that asked its user: make the master data, as its own group; the document is filed afterwards (legacy commits at :435/:652 and :649)
      var pl = plan(); if (pl.refused) return pl.refused;
      if (opts.stage === 'products') {
        if (pl.products.length) { var bad0 = stageProducts(pl.products); if (bad0) return bad0; }
        res.created = { partners: [], products: made('m_product') }; res.ok = true; res.verdict = 'PRODUCTS'; return done(res);
      }
      if (pl.products.length) { statusWrite(tpl, res, 'Not filed: the products ' + pl.products.map(function (u) { return u.value; }).join(', ') + ' do not exist yet'); return done(refuse(res, 'REFUSED', 'the products are not in the books')); }
      declareRows(); var rp = runInvoice('bpartner'); ids.forEach(function (id) { trx.del('i_invoice', trx.get('i_invoice', id)); });   // the staged rows are not the document: they go, the partner / location / contact stay
      res.created = { partners: made('c_bpartner'), products: [] }; res.ok = true; res.verdict = 'PARTNERS'; return done(res);
    }
    if (!opts.stage) {
      var pn = plan(); if (pn.refused) return pn.refused;
      if (pn.partners.length || pn.products.length) { res.needs = pn; statusWrite(tpl, res, 'Not filed: it needs new master data'); return done(refuse(res, 'NEEDS-MASTER', 'it needs ' + pn.partners.length + ' new business partner(s) and ' + pn.products.length + ' new product(s)')); }
    }
    declareRows();
    var run = runInvoice(), pr = run.pr, mine = run.mine;
    var errs = mine.filter(function (r) { return !r || r.i_isimported !== 'Y'; });
    if (!pr.ok || errs.length) {
      var msg = errs.length && errs[0] ? String(errs[0].i_errormsg == null ? '' : errs[0].i_errormsg).trim() : '';
      if (!msg) {   // legacy's unique index c_invoice_documentno_target refuses a second invoice of the same partner / number / type and leaves I_ErrorMsg EMPTY: the words are only in the collision line (ImportInvoice.js)
        var col = trx.log.filter(function (l) { return l.indexOf('§IMPORT_INVOICE_COLLISION') === 0; })[0], dn = col && /documentno=(\S+)/.exec(col);
        msg = dn ? 'document number ' + dn[1] + ' already exists for this business partner and document type' : (errs.length ? 'not imported' : (pr.summary || 'Import Invoice failed'));
      }
      statusWrite(tpl, res, 'Not filed: ' + msg);
      return done(refuse(res, 'REFUSED', 'Import Invoice: ' + msg));
    }
    var invIds = {}; mine.forEach(function (r) { invIds[r.c_invoice_id] = 1; });
    if (Object.keys(invIds).length !== 1) return done(refuse(res, 'REFUSED', 'the sheet became ' + Object.keys(invIds).length + ' invoices, not one'));
    var inv = trx.get('c_invoice', mine[0].c_invoice_id);

    // ── D3 after the import: each printed amount == the filed line net; D4: printed grand total == the filed grand total ──
    res.ran.linenet = 'absent'; res.ran.grandtotal = 'absent';
    for (var k = 0; k < lines.length; k++) {
      if (!lines[k].amount) continue;
      res.ran.linenet = 'ran';
      var il = trx.get('c_invoiceline', mine[k].c_invoiceline_id), net = dec(il && il.linenetamt);
      var okN = !!net && decEq(net, lines[k].amount);
      res.checks.push({ check: 'linenet', row: lines[k].row, printed: decStr(lines[k].amount), filed: net && decStr(net), ok: okN });
      if (!okN) { statusWrite(tpl, res, 'Not filed: row ' + lines[k].row + ' prints ' + decStr(lines[k].amount) + ' but the price list gives ' + (net && decStr(net))); return done(refuse(res, 'REFUSED', 'row ' + lines[k].row + ' line net ' + (net && decStr(net)) + ' != printed ' + decStr(lines[k].amount))); }
    }
    if (H.grandtotal) {
      var pg = dec(cells[H.grandtotal]), fg = dec(inv.grandtotal);
      if (!pg) silent.push('grandtotal');
      if (pg) {
        res.ran.grandtotal = 'ran';
        var okG = !!fg && decEq(pg, fg);
        res.checks.push({ check: 'grandtotal', printed: decStr(pg), filed: fg && decStr(fg), ok: okG });
        if (!okG) { statusWrite(tpl, res, 'Not filed: the books compute a total of ' + (fg && decStr(fg)) + ' but the sheet prints ' + decStr(pg)); return done(refuse(res, 'REFUSED', 'grandtotal: filed ' + (fg && decStr(fg)) + ' != printed ' + decStr(pg))); }
      }
    }

    // ── D5 write-back: docno + status only ──
    if (H.docno) res.writes.push({ cell: H.docno, value: inv.documentno });
    var stName = statusName(trx, inv.docstatus);
    statusWrite(tpl, res, 'Filed ' + inv.documentno + ' (' + stName + ')' + (silent.length ? '; not checked: ' + silent.map(function (c) { return c + ' (none printed)'; }).join(', ') : ''));
    var dt = trx.q('SELECT name FROM c_doctype WHERE c_doctype_id=?', [inv.c_doctype_id != null ? inv.c_doctype_id : inv.c_doctypetarget_id])[0];
    res.created = { partners: made('c_bpartner'), products: made('m_product') };                           // what this filing makes beyond the document: the host asks before it commits them (the dialog of the ERP drop)
    res.ok = true; res.verdict = 'FILED'; res.invoice = { documentno: inv.documentno, docstatus: inv.docstatus, docstatusname: stName, grandtotal: inv.grandtotal };
    res.record = { table: 'c_invoice', documentno: inv.documentno, issotrx: inv.issotrx, doctype: dt ? dt.name : null };   // what the host shows next: the table is named HERE (the engine is the invoice template's), never by a host or an overlay
    return done(res);
  }

  var api = { file: file, check: check, readLines: readLines, tagCells: tagCells, dec: dec, decStr: decStr };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else global.SheetDoor = api;
})(typeof window !== 'undefined' ? window : this);
