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
// Checks the sheet makes on itself (the document prints its own answers; we compare, never tune to them):
//   subtotal == sum of printed line amounts; qty x price == printed amount where all three are printed (exact decimals, no floats);
//   after the import: each printed amount == the filed line net, printed grand total == the filed grand total (tax by the twin).
(function (global) {
  'use strict';

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

  function refuse(res, verdict, reason) { res.ok = false; res.verdict = verdict; res.reason = reason; return res; }
  function statusWrite(tpl, res, text) { if (tpl.header.status) res.writes.push({ cell: tpl.header.status, value: text }); }

  // file(trx, deps, tpl, cells, opts) - deps = { AP: ad_process.js }, opts = { AD_Client_ID, AD_Org_ID }
  function file(trx, deps, tpl, cells, opts) {
    opts = opts || {};
    var AP = deps.AP, H = tpl.header, res = { ok: false, verdict: null, reason: null, writes: [], checks: [] };
    var say = function (s) { trx.say(s); };
    var done = function (r) { say('§SHEET_DOOR verdict=' + r.verdict + ' ok=' + r.ok + (r.reason ? ' reason="' + r.reason + '"' : '') + ' writes=' + JSON.stringify(r.writes.map(function (w) { return w.cell; }))); return r; };
    if (!tpl || tpl.kind !== 'invoice' || !tpl.header || !tpl.lines || !tpl.lines.cols) return done(refuse(res, 'REFUSED', 'template is not an invoice template (§2)'));

    // ── D6: nothing to judge -> INCONCLUSIVE ──
    var lines = readLines(tpl, cells);
    if (!lines.length) { statusWrite(tpl, res, 'Not filed: no line filled'); return done(refuse(res, 'INCONCLUSIVE', 'no filled line rows in ' + tpl.lines.from + '..' + tpl.lines.to)); }
    var bad = lines.filter(function (l) { return l.qty === undefined || l.price === undefined || l.amount === undefined; });
    if (bad.length) { statusWrite(tpl, res, 'Not filed: row ' + bad[0].row + ' has a value that is not a number'); return done(refuse(res, 'REFUSED', 'row ' + bad[0].row + ' not a number ' + JSON.stringify(bad[0].raw))); }

    // ── D3: the sheet's own printed sums ──
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (l.qty && l.price && l.amount) {
        var calc = decRound2(decMul(l.qty, l.price)), okL = decEq(calc, l.amount);
        res.checks.push({ check: 'line', row: l.row, printed: decStr(l.amount), computed: decStr(calc), ok: okL });
        if (!okL) { statusWrite(tpl, res, 'Not filed: row ' + l.row + ' qty x price = ' + decStr(calc) + ' but the row prints ' + decStr(l.amount)); return done(refuse(res, 'REFUSED', 'row ' + l.row + ' qty x price ' + decStr(calc) + ' != printed ' + decStr(l.amount))); }
      }
    }
    if (H.subtotal) {
      var printedSub = dec(cells[H.subtotal]);
      if (printedSub) {
        var withAmt = lines.filter(function (x) { return x.amount; });
        if (withAmt.length !== lines.length) return done(refuse(res, 'REFUSED', 'a subtotal is printed but ' + (lines.length - withAmt.length) + ' line(s) print no amount'));
        var sum = withAmt.reduce(function (a, x) { return decAdd(a, x.amount); }, { n: BigInt(0), s: 0 }), okS = decEq(sum, printedSub);
        res.checks.push({ check: 'subtotal', printed: decStr(printedSub), computed: decStr(sum), ok: okS });
        if (!okS) { statusWrite(tpl, res, 'Not filed: the lines add up to ' + decStr(sum) + ' but the subtotal prints ' + decStr(printedSub)); return done(refuse(res, 'REFUSED', 'subtotal: lines ' + decStr(sum) + ' != printed ' + decStr(printedSub))); }
      }
    }

    // ── D8: legacy Import Invoice sweeps EVERY pending row of the client; the door files only its own ──
    var C = opts.AD_Client_ID != null ? opts.AD_Client_ID : trx.env.client, O = opts.AD_Org_ID != null ? opts.AD_Org_ID : trx.env.org;
    var foreign = trx.q("SELECT count(*) AS n FROM i_invoice WHERE ad_client_id=? AND COALESCE(i_isimported,'N')<>'Y'", [C])[0];
    if (foreign && Number(foreign.n) > 0) { statusWrite(tpl, res, 'Not filed: ' + foreign.n + ' other import row(s) are waiting in Import Invoice'); return done(refuse(res, 'REFUSED', foreign.n + ' pending I_Invoice row(s) not made by this filing')); }

    // ── declare the I_Invoice rows (one per filled line) the way legacy's Import Loader does: ImpFormat.updateDB (ImpFormat.java:640-680)
    //    is a raw INSERT of the standard fields + an UPDATE of the mapped columns with IsActive='Y', Processed='N', I_IsImported='N' -
    //    NOT PO.saveNew, so a blank DocumentNo stays NULL (PO.saveNew :3563-3584 would mint one per ROW and legacy Import Invoice would
    //    then break the sheet into one invoice per line, :678-680). trx.insert = the raw insert (physical DEFAULTs apply, as in SQL). ──
    var hdr = Object.assign({}, tpl.fixed || {});
    if (!blank(cells[H.partner])) hdr.bpartnervalue = String(cells[H.partner]).trim();
    if (!blank(cells[H.date])) { var dt = String(cells[H.date]).trim().slice(0, 10) + ' 00:00:00'; hdr.dateinvoiced = dt; hdr.dateacct = dt; }
    if (H.docno && !blank(cells[H.docno])) hdr.documentno = String(cells[H.docno]).trim();
    var ids = [];
    for (var j = 0; j < lines.length; j++) {
      var f = Object.assign({ ad_client_id: C, ad_org_id: O, isactive: 'Y', processed: 'N', i_isimported: 'N', qtyordered: '1' }, hdr, lines[j].f);
      ids.push(trx.insert('i_invoice', f).i_invoice_id);
    }
    say('§SHEET_DOOR declared rows=' + ids.length + ' partner=' + (hdr.bpartnervalue || '-') + ' docno=' + (hdr.documentno || '(minted)'));

    // ── run iDempiere's own Import Invoice (AD_Process 207) in this transaction ──
    var pr = AP.runInTrx(trx, 207, { params: { AD_Client_ID: C, AD_Org_ID: O, DocAction: tpl.docAction || 'CO' } });
    var mine = ids.map(function (id) { return trx.get('i_invoice', id); });
    var errs = mine.filter(function (r) { return !r || r.i_isimported !== 'Y'; });
    if (!pr.ok || errs.length) {
      var msg = errs.length && errs[0] ? (errs[0].i_errormsg || 'not imported') : (pr.summary || 'Import Invoice failed');
      statusWrite(tpl, res, 'Not filed: ' + msg);
      return done(refuse(res, 'REFUSED', 'Import Invoice: ' + msg));
    }
    var invIds = {}; mine.forEach(function (r) { invIds[r.c_invoice_id] = 1; });
    if (Object.keys(invIds).length !== 1) return done(refuse(res, 'REFUSED', 'the sheet became ' + Object.keys(invIds).length + ' invoices, not one'));
    var inv = trx.get('c_invoice', mine[0].c_invoice_id);

    // ── D3 after the import: each printed amount == the filed line net; D4: printed grand total == the filed grand total ──
    for (var k = 0; k < lines.length; k++) {
      if (!lines[k].amount) continue;
      var il = trx.get('c_invoiceline', mine[k].c_invoiceline_id), net = dec(il && il.linenetamt);
      var okN = !!net && decEq(net, lines[k].amount);
      res.checks.push({ check: 'linenet', row: lines[k].row, printed: decStr(lines[k].amount), filed: net && decStr(net), ok: okN });
      if (!okN) { statusWrite(tpl, res, 'Not filed: row ' + lines[k].row + ' prints ' + decStr(lines[k].amount) + ' but the price list gives ' + (net && decStr(net))); return done(refuse(res, 'REFUSED', 'row ' + lines[k].row + ' line net ' + (net && decStr(net)) + ' != printed ' + decStr(lines[k].amount))); }
    }
    if (H.grandtotal) {
      var pg = dec(cells[H.grandtotal]), fg = dec(inv.grandtotal);
      if (pg) {
        var okG = !!fg && decEq(pg, fg);
        res.checks.push({ check: 'grandtotal', printed: decStr(pg), filed: fg && decStr(fg), ok: okG });
        if (!okG) { statusWrite(tpl, res, 'Not filed: the books compute a total of ' + (fg && decStr(fg)) + ' but the sheet prints ' + decStr(pg)); return done(refuse(res, 'REFUSED', 'grandtotal: filed ' + (fg && decStr(fg)) + ' != printed ' + decStr(pg))); }
      }
    }

    // ── D5 write-back: docno + status only ──
    if (H.docno) res.writes.push({ cell: H.docno, value: inv.documentno });
    statusWrite(tpl, res, 'Filed ' + inv.documentno + ' (' + inv.docstatus + ')');
    res.ok = true; res.verdict = 'FILED'; res.invoice = { documentno: inv.documentno, docstatus: inv.docstatus, grandtotal: inv.grandtotal };
    return done(res);
  }

  var api = { file: file, readLines: readLines, dec: dec, decStr: decStr };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else global.SheetDoor = api;
})(typeof window !== 'undefined' ? window : this);
