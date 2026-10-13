// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ninja_template.js — RUN-TEMPLATE verb: a PARITY PORT of the legacy iDempiere plugin CustomisedReport (Input/Process/Output/BACKUP
// XLS template -> SQL -> painted Output). Spec: prompts/NINJAEXCEL_TEMPLATE_ENGINE.md RESULTS 8/9 (gap G1-G7, plan P1-P7).
//
// CARDINAL RULE (prompts/SQLiteIDEMPIERE.md): the twin must do EXACTLY what the legacy plugin does, quirks included. Every function
// below names the Java method it ports (source: the legacy plugin source, class CustomisedReport).
// Quirks kept on purpose: direction `S` keeps the LAST record; setAddress' last Input match wins; statement ends only at a row whose
// TABLE ends with " a"; cached Process annotation is used as the key (a stale cache is reported, not repaired).
// Witness: ~/Projects/customerExpenseReport/witness/W20_Parity.js judges this against the real fork's output (legacy/oracle_fork_*.xls).
//
// SEAMS: no DB driver, no xlsx import. Caller passes a SheetJS workbook object and exec(sql) -> rows (arrays of typed values).
// Typed value: {k:'n',s:'123.45'} number | {k:'s',s:'text'} string | {k:'t',s:'2006-12-15 00:00:00.0'} timestamp | null.
(function (global) {
  'use strict';
  var MAXC = 16383;   // last usable Process column (.xlsx XFD). The legacy .xls host stopped at column 255, i.e. a V/> list was SILENTLY cut at 248 items; this host does not cut (prompts/NINJAEXCEL_TEMPLATE_ENGINE.md §UC-SET)
  var VCOL = 8, END = 'END', DOWN = 'V', RIGHT = '>', PLUS = '+';

  // ── A1 codec ────────────────────────────────────────────────────────────────────────────────────────
  function colName(c) { var s = ''; c = c + 1; while (c > 0) { var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; }
  function addrOf(r, c) { return colName(c) + (r + 1); }
  function parseA1(a) { var m = /^\$?([A-Z]+)\$?(\d+)$/.exec(String(a).trim().toUpperCase()); if (!m) return null; var c = 0; for (var i = 0; i < m[1].length; i++) c = c * 26 + (m[1].charCodeAt(i) - 64); return { r: parseInt(m[2], 10) - 1, c: c - 1 }; }

  // ── POI-like cell model over SheetJS cells ──────────────────────────────────────────────────────────
  function getC(ws, r, c) { return ws[addrOf(r, c)] || null; }
  function growRef(ws, r, c) {
    var ref = ws['!ref'] ? XL.utils.decode_range(ws['!ref']) : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
    if (r > ref.e.r || c > ref.e.c) { if (r > ref.e.r) ref.e.r = r; if (c > ref.e.c) ref.e.c = c; ws['!ref'] = XL.utils.encode_range(ref); }
  }
  function mkC(ws, r, c) { var a = addrOf(r, c); if (!ws[a]) { ws[a] = { t: 'z' }; noteAdd(ws, r, c); growRef(ws, r, c); } return ws[a]; }
  function ctype(x) { if (!x) return null; if (x.f) return 'FORMULA'; if (x.t === 'n') return 'NUMERIC'; if (x.t === 's') return 'STRING'; if (x.t === 'b') return 'BOOLEAN'; return 'BLANK'; }
  function setBlank(x) { var s = x.s; delete x.f; delete x.v; delete x.w; x.t = 'z'; if (s) x.s = s; }
  function setNum(x, d) { delete x.f; delete x.w; x.t = 'n'; x.v = d; }
  function setStr(x, s) { delete x.f; delete x.w; x.t = 's'; x.v = s; }
  function setFormula(x, f) { delete x.w; x.f = f; x.t = 'n'; x.v = 0; }
  function isDateFmt(x) { return !!(x && x.z && XL.SSF && XL.SSF.is_date(x.z)); }
  function javaDouble(d) {                       // Double.toString
    if (d === Math.floor(d) && Math.abs(d) < 1e7) return d.toFixed(1);
    var a = Math.abs(d);
    if (a >= 1e7 || (a > 0 && a < 1e-3)) { var e = d.toExponential(); var m = e.split('e'); var mant = m[0].indexOf('.') < 0 ? m[0] + '.0' : m[0]; return mant + 'E' + parseInt(m[1], 10); }
    return String(d);
  }
  function toStr(x) {                            // HSSFCell.toString()
    var t = ctype(x); if (!t) return '';
    if (t === 'FORMULA') return String(x.f);
    if (t === 'STRING') return String(x.v);
    if (t === 'NUMERIC') return isDateFmt(x) ? poiDate(Number(x.v)) : javaDouble(Number(x.v));
    if (t === 'BOOLEAN') return x.v ? 'TRUE' : 'FALSE';
    return '';
  }
  function poiDate(serial) {                     // HSSFCell.toString() of a date-formatted numeric: dd-MMM-yyyy
    var d = new Date(Math.round((serial - 25569) * 86400000)), M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return (d.getUTCDate() < 10 ? '0' : '') + d.getUTCDate() + '-' + M[d.getUTCMonth()] + '-' + d.getUTCFullYear();
  }
  function strVal(x) { var t = ctype(x); if (t === 'STRING' || (t === 'FORMULA' && typeof x.v === 'string')) return String(x.v); if (t === 'BLANK') return ''; return String(x.v == null ? '' : x.v); }
  // row index per sheet (rebuilt lazily after any structural change — keeps physRows/rowCells O(1) amortised)
  var IDX = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function touch(ws) { if (IDX) IDX.delete(ws); }
  function noteAdd(ws, r, c) {                                   // incremental: a new cell in the index without a rebuild
    var x = IDX && IDX.get(ws); if (!x) return;
    var a = x.rows[r];
    if (!a) { x.rows[r] = [c]; var l = x.list, i = l.length; while (i > 0 && l[i - 1] > r) i--; l.splice(i, 0, r); return; }
    var j = a.length; while (j > 0 && a[j - 1] > c) j--; if (a[j - 1] !== c) a.splice(j, 0, c);
  }
  function idx(ws) {
    var x = IDX && IDX.get(ws); if (x) return x;
    var rows = {}; for (var k in ws) { if (k[0] === '!') continue; var p = parseA1(k); if (p) (rows[p.r] = rows[p.r] || []).push(p.c); }
    var list = Object.keys(rows).map(Number).sort(function (a, b) { return a - b; });
    list.forEach(function (r) { rows[r].sort(function (a, b) { return a - b; }); });
    x = { rows: rows, list: list }; if (IDX) IDX.set(ws, x); return x;
  }
  function physRows(ws) { return idx(ws).list.slice(); }       // HSSFSheet.rowIterator(): existing rows only, ascending
  function lastRowNum(ws) { var l = idx(ws).list; return l.length ? l[l.length - 1] : -1; }
  function rowCells(ws, r) { return (idx(ws).rows[r] || []).slice(); }
  function lastCellNum(ws, r) { var c = idx(ws).rows[r]; return c && c.length ? c[c.length - 1] + 1 : -1; }   // HSSFRow.getLastCellNum
  var XL = null;

  // ── value helpers ───────────────────────────────────────────────────────────────────────────────────
  function tsSerial(s) {                         // 'YYYY-MM-DD HH:MM:SS.f' -> Excel serial (fields as stored, no TZ shift: DateUtil.getExcelDate local)
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?)?/.exec(s); if (!m) return NaN;
    var ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0), Math.round(+('0.' + (m[7] || '0')) * 1000));
    return ms / 86400000 + 25569;
  }
  function vStr(v) { return v == null ? 'NULL' : v.s; }

  // ── the engine ──────────────────────────────────────────────────────────────────────────────────────
  // opts: {clientId, orgId, from, to, accountGroup, sheets:{input,process,output,backup}}  (from/to = Java Timestamp.toString())
  function runTemplate(wb, exec, opts) {
    XL = opts.XLSX || XL || (typeof require !== 'undefined' ? require('xlsx') : global.XLSX);
    var N = { input: 'Input', process: 'Process', output: 'Output', backup: 'BACKUP' }; for (var k in (opts.sheets || {})) N[k] = opts.sheets[k];
    var S = { log: [], sqlcount: 0, lastrowwrite: 1, lastrowread: 0, crosstab: false, crossTabHoldSQL: '', gotSQL: true, stale: 0, nothingReturned: 0, sqls: [] };
    function log(s) { S.log.push(s); }
    var from = opts.from || '', to = opts.to || '', orgId = opts.orgId || 0, accountGroup = opts.accountGroup || '';

    // port of clean() — clone BACKUP over Output, wipe Process addresses/values
    function clean() {
      var bak = wb.Sheets[N.backup]; if (!bak) throw new Error('§SHEET_MISSING ' + N.backup);
      var outName = N.output, copy = JSON.parse(JSON.stringify(bak));   // cloneSheet(BACKUP) → "BACKUP (2)" renamed BACKUP; old Output removed, clone renamed Output
      var idx = wb.SheetNames.indexOf(outName);
      wb.Sheets[outName] = copy; touch(copy);                                         // sheet order: clone sits where BACKUP's clone lands in POI; order is not part of the oracle
      var pws = wb.Sheets[N.process]; var rows = physRows(pws);
      for (var ri = 1; ri < rows.length; ri++) {                         // skip label header
        var r = rows[ri], col = VCOL;
        var ca = getC(pws, r, 6); if (ca) setBlank(ca);
        for (;;) {
          var cp = getC(pws, r, col); col++;
          if (col > MAXC) break;
          if (!cp) break;
          if (ctype(cp) === 'NUMERIC') setBlank(cp);
          if (strVal(cp) === END) break;
          if (strVal(cp).trim() === '') continue;
          setBlank(cp);
        }
      }
    }

    // port of setAddress()
    function setAddress() {
      var ins = wb.Sheets[N.input], prs = wb.Sheets[N.process], outs = wb.Sheets[N.output];
      var prow = physRows(prs), nothing = true, inRows = physRows(ins);
      for (var pi = 1; pi < prow.length; pi++) {
        var r = prow[pi];
        if (!getC(prs, r, 1)) break;                                     // EOF — end of ROW() column
        var an = getC(prs, r, 0); if (!an || toStr(an).trim() === '') continue;
        var annotateValue = strVal(an);
        var ad = mkC(prs, r, 6);
        for (var ii = 0; ii < inRows.length; ii++) {
          var cols = rowCells(ins, inRows[ii]);
          for (var cj = 0; cj < cols.length; cj++) {
            var cin = getC(ins, inRows[ii], cols[cj]);
            if (ctype(cin) === 'NUMERIC') continue;
            var cv = strVal(cin);
            if (cv === annotateValue) {
              nothing = false;
              var oc0 = mkC(outs, inRows[ii], cols[cj]);
              var val0 = mkC(prs, r, 8);
              if (oc0.s != null) { val0.s = oc0.s; ad.s = oc0.s; } if (oc0.z) { val0.z = oc0.z; ad.z = oc0.z; }     // value.setCellStyle(outcell.getCellStyle()); addressPr.setCellStyle(...)
              setStr(ad, addrOf(inRows[ii], cols[cj]));                   // last match wins (the Java `break` leaves only the cell loop)
              break;
            }
          }
        }
      }
      if (nothing) log('Nothing was painted. Do INPUT sheet again');
    }

    function selectJoinWhereSQL(SELECT, TABLE, JOIN, WHERE) {
      var sql = 'SELECT ' + SELECT + ' FROM ' + TABLE + ' WHERE a.AD_Client_ID=' + opts.clientId + (orgId > 0 ? ' AND a.AD_Org_ID=' + orgId : '') +
        (((JOIN + WHERE).trim() === '') ? '' : ' AND ') + JOIN + ' ' + WHERE;
      return replaceParameterTag(sql);
    }
    function replaceParameterTag(s) {
      if (s.indexOf('#') >= 0) { s = s.split('#1').join("'" + from + "'"); s = s.split('#2').join("'" + to + "'"); s = s.split('#3').join("'" + accountGroup + "'"); }
      return s;
    }
    function crossTabRemoveHash(sql) {
      if (S.crosstab) { sql = sql.replace(/#\?.*?;/g, ''); S.crossTabHoldSQL = sql; }
      return sql;
    }

    // port of makeFullSQLStatement()
    function makeFullSQLStatement() {
      var prs = wb.Sheets[N.process], rows = physRows(prs);
      var SELECT = '', TABLE = '', JOIN = '', WHERE = '', gothruall = false, i = S.lastrowwrite, lastRow = null;
      for (; i < rows.length; i++) {
        var r = rows[i]; lastRow = r;
        var c2 = getC(prs, r, 2), c3 = getC(prs, r, 3), c4 = getC(prs, r, 4), c5 = getC(prs, r, 5);
        if (gothruall) {
          if (c3 && toStr(c3).slice(-2) === ' a') {                       // another new set of tables
            var sql = selectJoinWhereSQL(SELECT, TABLE, JOIN, WHERE);
            S.lastrowread = i; return sql;                                 // lastrowread is the ITERATOR POSITION (rowPr.getRowNum() == position when rows are contiguous)
          }
          if (c2 && toStr(c2).trim() !== '') SELECT += ',' + toStr(c2);
          if (c3) { if (toStr(c3).indexOf('JOIN') >= 0) TABLE += ' ' + toStr(c3); else if (toStr(c3) !== '') TABLE += ',' + toStr(c3); }
          if (c4) { if (toStr(c4) !== '') JOIN += ' ' + toStr(c4); }
          if (c5) { if (toStr(c5).indexOf('#?') >= 0) S.crosstab = true; WHERE += ' ' + toStr(c5); }   // Java dangling-if: the append runs even for an EMPTY cell 5 (only the crosstab flag is guarded) — kept
          continue;
        }
        SELECT = toStr(c2);
        if (c3) TABLE = toStr(c3);
        if (c4) JOIN = toStr(c4);
        if (c5) { if (toStr(c5).indexOf('#?') >= 0) S.crosstab = true; WHERE = toStr(c5); }
        if (!gothruall) { if (TABLE.slice(-2) === ' a') gothruall = true; }
      }
      S.lastrowread = rows.length ? rows.length - 1 : 0;
      var full = selectJoinWhereSQL(SELECT, TABLE, JOIN, WHERE);
      var complete = crossTabRemoveHash(full);
      S.gotSQL = false;                                                    // `!rowIteratePr.hasNext()` is always true after the while loop
      return complete;
    }

    function executeSQL(sql) {
      S.sqls.push(sql);
      var res = exec(sql);
      if (!res || !res.length) { log(sql + ' RETURNS NOTHING'); S.nothingReturned++; return null; }
      if (res.length === 1 && res[0].length === 1 && res[0][0] && res[0][0].k === 'n' && res[0][0].s === '0.00') { log(sql + ' RETURNS NOTHING'); S.nothingReturned++; return null; }
      return res;
    }

    // port of set()/setReturnValues()
    function setValues(results) {
      var prs = wb.Sheets[N.process], rows = physRows(prs), v = VCOL;
      for (var ri = 0; ri < results.length; ri++) {
        var done = setReturnValues(prs, rows, results[ri], v);
        if (done) break;
        v++;
      }
    }
    function setReturnValues(prs, rows, returning, v) {
      var idx = S.lastrowwrite;
      for (var k = 0; k < returning.length; k++) {
        var ret = returning[k];
        if (idx >= rows.length) return false;
        var r = rows[idx++];
        var cp = mkC(prs, r, v);
        var chk = getC(prs, r, 5);
        if (chk && strVal(chk).indexOf('#?') >= 0) continue;                // bypass Cross Tab set
        var cellValue = ctype(cp) === 'NUMERIC' ? javaDouble(Number(cp.v)) : strVal(cp);
        if (cellValue === END && v > VCOL) return true;
        if (ret == null) { ret = { k: 's', s: 'NULL' }; }
        if (ret.k === 's') {
          if (ret.s === toStr(cp)) continue;
          setStr(cp, ret.s); log(addrOf(r, v) + ' Address is String ' + ret.s);
        } else if (ret.k === 't') {
          setNum(cp, tsSerial(ret.s)); log(addrOf(r, v) + ' Address is Timestamp ' + ret.s);
        } else {
          setNum(cp, Number(ret.s)); log(addrOf(r, v) + ' Address is Numeric ' + ret.s);
        }
        if (v > VCOL) { var b4 = getC(prs, r, VCOL); if (b4 && b4.s) cp.s = b4.s; }
      }
      return false;
    }

    // port of parseBracketTag(): [C8] -> value of Output!C8 (numeric: unquoted DataFormatter text; string: kept inside the quotes)
    function parseBracketTag(outs, text) {
      var buf = text, open = buf.indexOf('['), close = buf.indexOf(']');
      while (open + close > 0) {
        var C8 = buf.substring(open + 1, close);
        buf = buf.replace('[', "'").replace(']', "'");
        var ref = parseA1(C8);
        if (!ref || rowCells(outs, ref.r).length === 0) throw new Error('CROSSTAB - OUTPUT SHEET NULL ROW: [TAG] is ' + C8);
        var oc = getC(outs, ref.r, ref.c);
        if (!oc) throw new Error('CROSSTAB - OUTPUT SHEET [TAG] IS NULL: ' + text.replace(C8, C8));
        if (ctype(oc) === 'NUMERIC') {
          if (isDateFmt(oc)) buf = replaceFirstRe(buf, C8, toStr(oc));
          else buf = replaceFirstRe(buf, "'" + C8 + "'", XL.SSF.format(oc.z || 'General', Number(oc.v)));
        } else buf = replaceFirstRe(buf, C8, strVal(oc).trim());
        open = buf.indexOf('['); close = buf.indexOf(']');
      }
      return buf;
    }
    function replaceFirstRe(s, pattern, repl) { return s.replace(new RegExp(pattern), function () { return repl; }); }   // Java String.replaceFirst (regex pattern, literal-ish replacement)

    // port of crosstab(): re-run the held statement once per `#?...;` Process row; every returned VALUE goes to the next column of that row
    function crosstab() {
      var prs = wb.Sheets[N.process], outs = wb.Sheets[N.output], rows = physRows(prs);
      var ori = S.crossTabHoldSQL.trim();
      if (ori.indexOf(' FROM') === -1) throw new Error("NO ' FROM' IN ORIGINAL SQL " + ori);
      for (var a = S.lastrowwrite; a < S.lastrowread; a++) {
        var activeSQL = ori.substring(ori.indexOf(' FROM'));
        var r = rows[a]; var cellPr = getC(prs, r, 5);
        if (!cellPr) continue;
        if (strVal(cellPr).indexOf('#?') >= 0) {
          var c5 = strVal(cellPr), hash2comma = c5.substring(2, c5.length - 1);
          var selectcell = getC(prs, r, 2); if (!selectcell) throw new Error('NO NAME IN SELECT ROW OF PROCESS SHEET');
          activeSQL = 'SELECT ' + strVal(selectcell) + activeSQL;
          if (ori.indexOf('WHERE') >= 0) activeSQL += ' AND ';
          activeSQL += parseBracketTag(outs, hash2comma);
          S.crosstab = false; var v = VCOL;
          var result = executeSQL(activeSQL);
          if (!result) continue;
          for (var ci = 0; ci < result.length; ci++) {
            for (var vi = 0; vi < result[ci].length; vi++) {
              var ret = result[ci][vi]; if (ret == null) ret = { k: 's', s: 'NULL' };
              var cp = mkC(prs, r, v);
              var cellValue = ctype(cp) === 'NUMERIC' ? javaDouble(Number(cp.v)) : strVal(cp);
              if (cellValue === END && v > VCOL) return;
              if (ret.k === 's') { if (ret.s === toStr(cp)) continue; setStr(cp, ret.s); log(addrOf(r, v) + ' CROSSTAB String ' + ret.s); }
              else if (ret.k === 't') { setNum(cp, tsSerial(ret.s)); log(addrOf(r, v) + ' CROSSTAB Timestamp ' + ret.s); }
              else { setNum(cp, Number(ret.s)); log(addrOf(r, v) + ' CROSSTAB Numeric ' + ret.s); }
              v++;
            }
          }
        }
      }
      S.crossTabHoldSQL = ''; S.crosstab = false;
    }

    // ── formula + row/column shifting (ports of copyFormula / HSSFSheet.shiftRows / pushColumnsRight) ─────
    function shiftRefs(f, coldiff, rowdiff, onlyRowsFrom, rowShift) {
      // coldiff/rowdiff: copyFormula (relative refs only). onlyRowsFrom/rowShift: shiftRows (every ref at row>=start moves, abs or rel).
      return f.replace(/('[^']*'!|[A-Za-z_][A-Za-z0-9_.]*!)?(\$?)([A-Z]{1,3})(\$?)(\d+)(?![A-Za-z0-9_(])/g, function (m, sh, dc, col, dr, row, off, whole) {
        if (off > 0 && /[A-Za-z0-9_.]/.test(whole[off - 1]) && !sh) return m;
        var cn = parseA1(col + '1').c, rn = parseInt(row, 10) - 1;
        if (onlyRowsFrom != null) { if (rn >= onlyRowsFrom) rn += rowShift; }
        else { if (!dc) cn += coldiff; if (!dr) rn += rowdiff; }
        return (sh || '') + dc + colName(cn) + dr + (rn + 1);
      });
    }
    function copyFormula(f, coldiff, rowdiff) { var o = shiftRefs(f, coldiff, rowdiff); log(f + ' >>formula>> ' + o); return o; }
    function shiftRows(ws, start, end, n) {                           // HSSFSheet.shiftRows(start,end,n,true,true): moves cells, shifts same-sheet formula refs + merges
      var keys = Object.keys(ws).filter(function (k) { return k[0] !== '!'; }), moves = [];
      keys.forEach(function (k) { var p = parseA1(k); if (p && p.r >= start && p.r <= end) moves.push([k, p]); });
      moves.sort(function (a, b) { return b[1].r - a[1].r; });
      moves.forEach(function (m) { var c = ws[m[0]]; delete ws[m[0]]; ws[addrOf(m[1].r + n, m[1].c)] = c; });
      touch(ws);
      Object.keys(ws).forEach(function (k) { if (k[0] === '!') return; var c = ws[k]; if (c && c.f) c.f = shiftRefs(c.f, 0, 0, start, n); });
      if (ws['!merges']) ws['!merges'].forEach(function (mg) { if (mg.s.r >= start) { mg.s.r += n; mg.e.r += n; } });
      if (ws['!rows']) { var rh = ws['!rows'], nr = []; for (var ri2 in rh) { var rr = +ri2; nr[rr >= start && rr <= end ? rr + n : rr] = rh[ri2]; } ws['!rows'] = nr; }
      growRef(ws, end + n, 0);
    }
    function copyover(ws, from, to) {
      if (from.s) to.s = from.s; setBlank(to);
      var t = ctype(from);
      if (t === 'NUMERIC') { setNum(to, from.v); if (from.z) to.z = from.z; }
      else if (t === 'FORMULA') setFormula(to, copyFormula(from.f, 1, 0));
      else if (t === 'STRING') setStr(to, from.v);
    }
    function shiftOneColumnRight(ws, fromcol, tocol) {
      if (tocol - fromcol > 1) { log('CANNOT SHIFT SINGLE COLUMN MORE THAN ' + (tocol - fromcol)); return; }
      var rowno = 0, last = lastRowNum(ws);
      for (var r = 0; r < last; r++) {
        rowno++;
        if (rowCells(ws, rowno).length === 0) { log('This row is null : ' + rowno); continue; }
        var fc = mkC(ws, rowno, fromcol);
        ws[addrOf(rowno, tocol)] = { t: 'z' }; noteAdd(ws, rowno, tocol); growRef(ws, rowno, tocol);
        copyover(ws, fc, ws[addrOf(rowno, tocol)]);
      }
    }
    function colHidden(ws, c) { return !!(ws['!cols'] && ws['!cols'][c] && ws['!cols'][c].hidden); }
    function setColHidden(ws, c, h) { ws['!cols'] = ws['!cols'] || []; ws['!cols'][c] = ws['!cols'][c] || {}; ws['!cols'][c].hidden = h; }
    function pushColumnsRight(ws, startcol, endcol) {
      var hidden = colHidden(ws, startcol + 1), nocols = endcol - startcol, a = endcol - 1, b = endcol;
      for (var n = 0; n < nocols; n++) { shiftOneColumnRight(ws, a, b); if (a === startcol) break; b--; a--; }
      if (hidden) { setColHidden(ws, startcol + 1, false); setColHidden(ws, endcol, true); }
    }
    function pushRowDown(outs, nc, rowPr, prs, outcell, downrow, c) {
      var peek = getC(prs, rowPr, nc + 1);
      if (peek && toStr(peek) !== END && ctype(peek) !== 'BLANK') {
        if (ctype(outcell) === 'FORMULA') {
          var ori = downrow - 1, last = lastRowNum(outs);
          shiftRows(outs, downrow, last, 1);
          rowCells(outs, ori).forEach(function (st) {                // only the columns the source row really has (was: all 255 columns, which made every pushed row create 255 blank cells -> quadratic)
            var o = getC(outs, ori, st), n = mkC(outs, downrow, st);
            if (o) { if (o.s) n.s = o.s; if (ctype(o) === 'FORMULA') setFormula(n, copyFormula(o.f, 0, 1)); }
          });
          outcell = getC(outs, downrow, c);
        }
      }
      return outcell;
    }

    // port of the `+` branch of paint(): build the X/Y-axis matrix from the axis rows named in Direction ("A21+B13"), then lay the canvas onto Output
    function plusMatrix(prs, outs, rows, r, annotation, ref, outcell, nc) {
      var v = VCOL - 2, pv = VCOL;
      setBlank(outcell);
      var xtabcode = strVal(getC(prs, r, 7)).split(PLUS); while (xtabcode.length && xtabcode[xtabcode.length - 1] === '') xtabcode.pop();   // Java split drops trailing empties
      var refX = xtabcode[0], yaxis = [], xaxis = null, xint = 0, yint = 0, dir = '';
      var it = 1;                                                       // iterator position over Process rows after the header
      for (;;) {
        if (it >= rows.length) break;
        var rowX = rows[it++], cellX = getC(prs, rowX, v);
        if (!cellX) continue;
        if (ctype(cellX) === 'NUMERIC') throw new Error('IllegalStateException: Cannot get a STRING value from a NUMERIC cell ' + addrOf(rowX, v));
        if (strVal(cellX).trim() === '') continue;
        if (strVal(cellX) === refX) {
          if (dir.trim() === '') dir = toStr(getC(prs, rowX, v + 1));
          for (;;) {
            cellX = getC(prs, rowX, pv);
            if (!cellX) break;
            if (ctype(cellX) !== 'NUMERIC' && (strVal(cellX).trim() === '' || strVal(cellX) === END)) break;
            if (ctype(cellX) === 'NUMERIC') throw new Error('IllegalStateException: Cannot get a STRING value from a NUMERIC cell ' + addrOf(rowX, pv));
            yaxis.push(strVal(cellX)); pv++;
          }
          if (yaxis.length < 1) throw new Error(annotation + ' Cross-Tab has no data at ' + refX);
          if (xint === 0) {
            xint = yaxis.length; xaxis = yaxis; yaxis = []; pv = VCOL;
            if (xtabcode.length > 1) { refX = xtabcode[1]; it = 1; } else break;
          } else if (yaxis.length > 0) { yint = yaxis.length; break; }
        }
      }
      if (!xaxis) throw new Error('CROSS TAB NO SUCH INPUT AT : ' + annotation);
      if (yint < 2) yint = 2; if (xint < 2) xint = 2;
      var cw = xint, ch = yint;                                         // canvas = new Object[xint][yint] (BEFORE squaring)
      var canvas = []; for (var i = 0; i < cw; i++) canvas.push(new Array(ch).fill(null));
      if (yint > xint) xint = yint; if (xint > yint) yint = xint;
      var matrix = []; for (i = 0; i < xint; i++) matrix.push(new Array(yint).fill(null));
      for (var x = 0; x < xaxis.length; x++) matrix[x][1] = xaxis[x];
      for (var y = 0; y < yaxis.length; y++) matrix[y][0] = yaxis[y];
      var prValue = getC(prs, r, nc);
      for (var p = VCOL; p < MAXC; p++) {
        if (!prValue) break; if (toStr(prValue) === END) break;
        if (toStr(prValue) === 'NULL') setBlank(prValue);
        var intRowNo = rows[rows.indexOf(r)], xm = 0, ym = 0, breakflag = 0;
        for (var t = 0; t < xtabcode.length; t++) {
          intRowNo--;
          var bc = getC(prs, intRowNo, p);
          if (!bc || strVal(bc).trim() === '') break;
          var o = ctype(bc) === 'NUMERIC' ? Number(bc.v) : strVal(bc);
          for (y = 0; y < yint; y++) { if (o === matrix[y][0]) { ym = y; breakflag++; break; } }
          if (breakflag === 2) break;
          for (x = 0; x < xint; x++) { if (o === matrix[x][1]) { xm = x; breakflag++; break; } if (breakflag === 2) break; }
        }
        if (xm >= cw || ym >= ch) throw new Error('ArrayIndexOutOfBoundsException canvas[' + xm + '][' + ym + '] size ' + cw + 'x' + ch);
        if (canvas[xm][ym] == null) canvas[xm][ym] = prValue;
        nc++; prValue = getC(prs, r, nc);
      }
      function put(rowIdx, colIdx, cell) {
        var str = toStr(cell); if (str === END) return;
        var mc = mkC(outs, rowIdx, colIdx);
        if (str === 'NULL' || str === '') { setBlank(mc); return; }
        var d = Number(str); if (isNaN(d)) throw new Error('NumberFormatException: ' + str);
        setNum(mc, d);
      }
      if (dir === DOWN) {
        for (x = 0; x < canvas.length; x++) for (y = 0; y < canvas[0].length; y++) { if (canvas[x][y] == null) continue; put(ref.r + x, ref.c + y, canvas[x][y]); }
      } else {
        for (y = 0; y < canvas[0].length; y++) { if (rowCells(outs, ref.r + y).length === 0) throw new Error('NullPointerException: Output row ' + (ref.r + y)); for (x = 0; x < canvas.length; x++) { if (canvas[x][y] == null) continue; put(ref.r + y, ref.c + x, canvas[x][y]); } }
      }
      log(canvas.length + ' CROSS TAB CANVAS: ' + annotation);
      return outcell;
    }

    // port of paint() — directions S / V / > / +
    function paint() {
      var prs = wb.Sheets[N.process], outs = wb.Sheets[N.output], rows = physRows(prs);
      for (var ri = 1; ri < rows.length; ri++) {
        var r = rows[ri], nc = VCOL;
        var c0 = getC(prs, r, 0); if (!c0) break;
        var addressPr = getC(prs, r, 6); if (!addressPr || toStr(addressPr).trim() === '') continue;
        var c7 = getC(prs, r, 7); if (!c7) throw new Error('ROW NO. ' + (r + 1) + ' .. CHECK >> Direction (Column 8) of Process Sheet is Empty. Fill with S, V or >');
        var annotation = strVal(c0) + strVal(c7);
        var ref = parseA1(strVal(addressPr));
        var outcell = mkC(outs, ref.r, ref.c), downrow = ref.r, oR = ref.r, oC = ref.c;
        var prValue = getC(prs, r, nc);
        for (;;) {
          if (!outcell) break; if (nc > MAXC) { log('LIST TRUNCATED at Process column ' + nc + ' (more values than the sheet can hold)'); break; } if (!prValue) break;
          if (toStr(prValue) === END) break;
          if (toStr(prValue) === 'NULL') { nc++; prValue = getC(prs, r, nc); continue; }
          if (ctype(prValue) === 'BLANK' || ctype(prValue) === 'FORMULA') { nc++; prValue = getC(prs, r, nc); continue; }
          if (ctype(prValue) === 'NUMERIC') setNum(outcell, prValue.v); else setStr(outcell, strVal(prValue));      // outcell keeps ITS OWN style/format (Java: outcell.setCellValue only)
          if (annotation.slice(-1) === DOWN) {
            downrow++;
            oR = downrow;
            outcell = mkC(outs, downrow, oC);
            outcell = pushRowDown(outs, nc, r, prs, outcell, downrow, oC);
            oR = downrow;
          } else if (annotation.slice(-1) === RIGHT) {
            var oc = { r: oR, c: oC }; var orow = oR;
            oC = oC + 1; outcell = mkC(outs, orow, oC);
            var peek = getC(prs, r, nc + 1);
            if (ctype(outcell) === 'FORMULA' && peek && toStr(peek) !== END) {
              if (toStr(peek).trim() !== '') {
                var atColumn = oc.c + 1 - 1, endColumn = lastCellNum(outs, orow);
                pushColumnsRight(outs, atColumn, endColumn);
                outcell = getC(outs, orow, atColumn + 1); oC = atColumn + 1;
              }
            }
          } else if (annotation.indexOf(PLUS) >= 0) {
            outcell = plusMatrix(prs, outs, rows, r, annotation, ref, outcell, nc); break;
          }
          nc++; prValue = getC(prs, r, nc);
        }
      }
    }

    // ── main loop (doIt) ──────────────────────────────────────────────────────────────────────────────
    clean();
    setAddress();
    if (opts.stopAfter === 'setAddress') return S;
    while (S.gotSQL) {
      S.sqlcount++;
      var sql = makeFullSQLStatement();
      var results = executeSQL(sql);
      if (results) { setValues(results); if (S.crosstab) crosstab(); }
      S.lastrowwrite = S.lastrowread;
      if (opts.maxStatements && S.sqlcount >= opts.maxStatements) break;
    }
    if (opts.stopAfter === 'sql') return S;
    paint();
    return S;
  }

  // ── PG dialect for the SQLite twin (stone 2b) ──────────────────────────────────────────────────────
  // The legacy templates are written in PostgreSQL. The twin keeps PG builtins as registered UDFs (same convention as erp/callouts/sqlfn.js:
  // "PL/pgSQL functions ported as SQLite UDFs", source of truth = the live PG behaviour). Host does: registerPgBuiltins((n,f)=>db.function(n,{varargs:true},f)).
  function toChar(v, fmt) {                                   // PG to_char(timestamp|date, text) for the tokens the templates use
    if (v == null) return null; var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/.exec(String(v)); if (!m) return String(v);
    var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], map = { YYYY: m[1], YY: m[1].slice(2), MM: m[2], DD: m[3], HH24: m[4] || '00', MI: m[5] || '00', SS: m[6] || '00', Mon: MON[+m[2] - 1] };
    return String(fmt).replace(/YYYY|YY|MM|DD|HH24|MI|SS|Mon/g, function (t) { return map[t]; });
  }
  function registerPgBuiltins(reg) {
    reg('left', function (s, n) { return s == null ? null : (n >= 0 ? String(s).substring(0, n) : String(s).substring(0, Math.max(0, String(s).length + n))); });
    reg('right', function (s, n) { return s == null ? null : (n >= 0 ? String(s).slice(Math.max(0, String(s).length - n)) : String(s).substring(-n)); });
    reg('to_char', toChar);
    reg('concat', function () { var o = ''; for (var i = 0; i < arguments.length; i++) if (arguments[i] != null) o += arguments[i]; return o; });   // PG concat(): NULLs skipped; older sql.js builds have no concat()
  }
  function matchParen(sql, open) {                            // index of the ')' matching sql[open]=='(' (string-literal aware)
    var d = 0, q = false;
    for (var i = open; i < sql.length; i++) { var ch = sql[i]; if (ch === "'") q = !q; else if (!q) { if (ch === '(') d++; else if (ch === ')') { d--; if (d === 0) return i; } } }
    return -1;
  }
  function topLevelSplit(txt, kw) {                           // first top-level occurrence of kw (e.g. ' FROM ' / ' AS ') -> [before, after] or null
    var d = 0, q = false, u = txt.toUpperCase();
    for (var i = 0; i < txt.length; i++) { var ch = txt[i]; if (ch === "'") q = !q; else if (!q) { if (ch === '(') d++; else if (ch === ')') d--; else if (d === 0 && u.substr(i, kw.length) === kw) return [txt.slice(0, i), txt.slice(i + kw.length)]; } }
    return null;
  }
  function rewriteCalls(sql, name, fn) {                      // rewrite every NAME( ... ) call, innermost-last, string-literal aware
    var re = new RegExp('\\b' + name + '\\s*\\(', 'ig'), out = '', last = 0, m;
    while ((m = re.exec(sql))) {
      var open = m.index + m[0].length - 1, close = matchParen(sql, open); if (close < 0) break;
      var inner = fn(sql.slice(open + 1, close)); if (inner == null) { continue; }
      out += sql.slice(last, m.index) + inner; last = close + 1; re.lastIndex = close + 1;
    }
    return out + sql.slice(last);
  }
  function pgToSqlite(sql) {
    sql = sql.replace(/\bDATE\s+('(?:[^']|'')*')/gi, 'date($1)');                       // typed literal
    sql = rewriteCalls(sql, 'CAST', function (inner) {                                   // CAST(x AS TIMESTAMP|DATE)
      var sp = topLevelSplit(inner, ' AS '); if (!sp) return null; var ty = sp[1].trim().toUpperCase();
      if (ty === 'TIMESTAMP') return 'datetime(' + sp[0] + ')'; if (ty === 'DATE') return 'date(' + sp[0] + ')'; return null; });
    sql = rewriteCalls(sql, 'EXTRACT', function (inner) {                                // EXTRACT(YEAR|MONTH|DAY FROM x)
      var sp = topLevelSplit(inner, ' FROM '); if (!sp) return null; var f = { YEAR: '%Y', MONTH: '%m', DAY: '%d' }[sp[0].trim().toUpperCase()]; if (!f) return null;
      return "CAST(strftime('" + f + "', " + sp[1] + ') AS INTEGER)'; });
    return sql;
  }
  // SQLite value -> typed value as the Java side would see it. REAL results are rendered with the shortest decimal that round-trips at 12 sig. digits
  // (a REAL SUM of 2-decimal amounts becomes '445.85', not '445.8500000000001'); this is the twin's exact-decimal rule, flagged in the parity report.
  function typedFromSqlite(v) {
    if (v == null) return null;
    if (typeof v === 'number') return { k: 'n', s: Number.isInteger(v) ? String(v) : String(parseFloat(v.toPrecision(12))) };
    if (typeof v === 'bigint') return { k: 'n', s: v.toString() };
    return { k: 's', s: String(v) };
  }

  // ── SQLite executor with Java-equivalent result typing (closes D1: BigDecimal scale) ────────────────
  // The original reads JDBC BigDecimal/Timestamp/String; SQLite returns bare REAL/TEXT. The legacy rule `[0.00]` = "RETURNS NOTHING" depends on SCALE,
  // so each output column's type is derived from its SQL: column refs -> source column type + max scale (PG numeric rule for + - SUM ABS MAX MIN),
  // COUNT -> integer, string/CASE/function -> text. Scale/type metadata comes from the twin's dictionary side tables _scale(tbl,col,scale) and
  // _coltype(tbl,col,dt) (snapshot: max PG scale per numeric column). Unknown -> no scale (honest default), never guessed.
  function splitTopCommas(txt) {
    var parts = [], d = 0, q = false, cur = '';
    for (var i = 0; i < txt.length; i++) { var ch = txt[i]; if (ch === "'") q = !q; if (!q) { if (ch === '(') d++; else if (ch === ')') d--; else if (ch === ',' && d === 0) { parts.push(cur); cur = ''; continue; } } cur += ch; }
    parts.push(cur); return parts;
  }
  var SQLKW = /^(INNER|LEFT|RIGHT|OUTER|FULL|CROSS|JOIN|ON|WHERE|GROUP|ORDER|HAVING|UNION|AS|SELECT|AND|OR|NOT|IN|LIMIT)$/i;
  function aliasMap(sql) {
    var fr = topLevelSplit(sql, ' FROM '); if (!fr) return {};
    var rest = fr[1], cut = rest.search(/\s(WHERE|GROUP\s+BY|ORDER\s+BY|HAVING)\s/i); if (cut >= 0) rest = rest.slice(0, cut);
    var map = {}, re = /(?:^|\bJOIN\b|,)\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_]*))?/gi, m;
    rest = rest.replace(/\bON\b[^,]*?(?=\b(?:INNER|LEFT|RIGHT|OUTER|FULL|CROSS|JOIN)\b|$)/gi, ' ');   // drop ON clauses so their words are not read as tables
    while ((m = re.exec(rest))) { if (SQLKW.test(m[1])) continue; var tbl = m[1].toLowerCase(), al = (m[2] && !SQLKW.test(m[2])) ? m[2].toLowerCase() : tbl; map[al] = tbl; map[tbl] = map[tbl] || tbl; }
    return map;
  }
  function selectItemMeta(sql, lookup) {                      // -> [{kind:'num'|'str'|'ts'|'int'|'unknown', scale}]
    var body = sql.replace(/^\s*SELECT\s+(DISTINCT\s+)?/i, ''), sp = topLevelSplit(body, ' FROM '); if (!sp) return [];
    var amap = aliasMap(sql);
    return splitTopCommas(sp[0]).map(function (item) {
      var asp = topLevelSplit(item, ' AS '); var expr = (asp ? asp[0] : item).trim();
      if (/^count\s*\(/i.test(expr)) return { kind: 'int' };
      if (/'|\bCASE\b|\bleft\s*\(|\bright\s*\(|\bto_char\s*\(|\bconcat\s*\(/i.test(expr)) return { kind: 'str' };
      var refs = [], re = /\b([A-Za-z_]\w*)\.([A-Za-z_]\w*)\b/g, m; while ((m = re.exec(expr))) refs.push([m[1].toLowerCase(), m[2].toLowerCase()]);
      if (!refs.length) return { kind: 'unknown' };
      var metas = refs.map(function (r) { return lookup(amap[r[0]] || r[0], r[1]); }).filter(Boolean);
      if (!metas.length) return { kind: 'unknown' };
      if (/^[A-Za-z_]\w*\.[A-Za-z_]\w*$/.test(expr)) { var one = metas[0]; if (/timestamp|date/.test(one.dt)) return { kind: 'ts' }; if (one.dt === 'numeric') return { kind: 'num', scale: one.scale }; if (/int/.test(one.dt)) return { kind: 'int' }; return { kind: 'str' }; }
      var sc = -1; metas.forEach(function (x) { if (x.dt === 'numeric' && x.scale > sc) sc = x.scale; });
      return sc >= 0 ? { kind: 'num', scale: sc } : { kind: 'unknown' };
    });
  }
  function sqliteExecutor(db, BD) {                           // exec(sql) -> typed rows; db = better-sqlite3 / sql.js-compatible via .prepare(sql).raw().all(); BD = the twin's BigDecimal (build/erp/bigdecimal.js)
    var cache = {}, noDict = false;
    BD = BD || (typeof require !== 'undefined' ? (function () { try { return require('./bigdecimal.js'); } catch (e) { return null; } })() : global.BigDecimal);
    function lookup(tbl, col) {
      var k = tbl + '.' + col; if (k in cache) return cache[k];
      var dt, sc;
      try { dt = db.prepare('select dt from _coltype where lower(tbl)=? and lower(col)=?').raw().get(tbl, col); sc = db.prepare('select scale from _scale where lower(tbl)=? and lower(col)=?').raw().get(tbl, col); }
      catch (e) {                                              // db has no dictionary side tables (e.g. the ERP's own client db): say so ONCE, never silently - NUMERIC scale cannot be applied then
        if (!noDict) { noDict = true; if (typeof console !== 'undefined') console.log('§SCALE_DICT unavailable (no _coltype/_scale in this db): NUMERIC scale not applied, values keep their stored precision'); }
        return (cache[k] = null);
      }
      return (cache[k] = dt ? { dt: dt[0], scale: sc ? sc[0] : 0 } : null);
    }
    return function exec(sql) {
      var q = pgToSqlite(sql), rows = db.prepare(q).raw().all(), meta = selectItemMeta(sql, lookup);
      return rows.map(function (r) {
        return r.map(function (v, i) {
          var m = meta[i] || { kind: 'unknown' };
          if (v == null) return null;
          if (typeof v === 'number' || typeof v === 'bigint') {
            if (m.kind === 'num' && m.scale > 0) {                    // Java BigDecimal scale via the twin's own BigDecimal (decimals enter as STRINGS, per its contract)
              var dec = typeof v === 'bigint' ? v.toString() : String(parseFloat(Number(v).toPrecision(12)));
              return { k: 'n', s: BD ? BD.of(dec).setScale(m.scale, BD.RoundingMode.HALF_UP).toString() : Number(v).toFixed(m.scale) };
            }
            return typedFromSqlite(v);
          }
          if (m.kind === 'ts') { var t = String(v); return { k: 't', s: /\.\d+$/.test(t) ? t : t + '.0' }; }
          return { k: 's', s: String(v) };
        });
      });
    };
  }

  var API = { runTemplate: runTemplate, sqliteExecutor: sqliteExecutor, selectItemMeta: selectItemMeta, aliasMap: aliasMap, registerPgBuiltins: registerPgBuiltins, pgToSqlite: pgToSqlite, typedFromSqlite: typedFromSqlite, toChar: toChar, parseA1: parseA1, addrOf: addrOf, physRows: physRows, toStr: toStr, javaDouble: javaDouble, tsSerial: tsSerial, ctype: ctype };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else global.NinjaTemplate = API;
})(typeof self !== 'undefined' ? self : this);
