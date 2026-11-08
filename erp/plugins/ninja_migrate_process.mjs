// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — ninja_migrate_process.mjs: HOT chunk of plugins/ninja_migrate.mjs. The class org.idempiere.ninja.process.MigrateExcelData (AD_Process 9540001).
// Implementing bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §NINJA-LOADER-SPEC — Witness: W-NINJA-MIGRATE (erp/tests/witness_ninja_migrate.js). READ THE LOG: §NINJA lines.
// LEGACY SOURCE: ~/Projects/red1_plugins/org.red1.ninja/src/org/ninja/process/MigrateExcelData.java (the owner's plugin; the newer org.idempiere.ninja carries it to iDempiere 13).
// KEPT (read from the Java): sheet = AD_Table.TableName case-insensitive, Processed=Y drops a 2-char order prefix, a sheet naming no table is bypassed; row 1 = AD column names, a header
//   that is not a column of the table STOPS the run ("No such column. Check your Excel sheet+column:<Table>-<Column>"); one PO per row (MTable.getPO(0) = ModelLayer.newRecord) -> set
//   every cell -> po.save (so the model's defaults, beforeSave/afterSave and validators run); values by AD reference (15/16 date, ' 00:00:00' added under 12 chars; 12/22/29/37 BigDecimal);
//   an _ID cell is looked up: table = column minus _ID, else the column's AD_Reference_Value_ID -> AD_Ref_Table.AD_Key's table; <Table>Line finds its parent by DocumentNo; Col>Alt matches
//   on Alt; X_ID>Y_ID is one nested level; a lookup table with no Name column takes the integer as is; IsActive=Y = UPDATE mode keyed on the first two columns (+ WhereClause), a raw
//   UPDATE without model events as the Java's DB.executeUpdateEx; the answer "No worksheets : N" + "(<Table> = n records) " per sheet.
// FIXED (owner 2026-11-09, or named in §NINJA-LOADER-SPEC) — each one prints a §NINJA-FIX line when it changes an outcome:
//   F1 every lookup / update value is a bound parameter (an apostrophe broke the Java's WHERE Name='...');  F2 alt lookups are per header and unlimited (Java: String[5] + a counter never
//   reset per sheet);  F3 a lookup reads the login tenant first, then System (0) (Java: alt lookups have no client filter, Name lookups read System first);  F4 more than one match in
//   that tier, or none at all, is an ERROR naming sheet/row/column (Java: the first match wins; an alt miss silently leaves the column empty, a Name miss stops the run);  F5 the column
//   reference is read from THIS table's AD_Column (Java: the first column of that name in any table);  F6 a blank cell sets nothing, the PO default stands (Java: new BigDecimal("")
//   throws);  F7 all or nothing: any row error -> nothing is kept and the answer lists every error (legacy postgres aborts the transaction at the first failed statement);  F8 a saved row
//   whose AD-mandatory column is empty is an error (legacy: the NOT NULL of the INSERT; the twin's SQLite has none);  F9 File_Directory names a workbook the host put on this plugin's
//   file shelf (putFile) - the twin cannot open a server path;  F10 an alt applies also to a column resolved through its reference (Java: only when the column name is a table);
//   F11 an empty WhereClause adds nothing (Java appends " AND " + "" -> an SQL error).
// Deterministic: no clock, no random. The workbook is a SheetJS workbook object read cell by cell (no library inside the process).
export const CLASSNAME = 'org.idempiere.ninja.process.MigrateExcelData';

const SHELF = new Map();                                       // F9: the "server folder" of the twin - the host puts the picked file here under its name
export function putFile(name, workbook) { SHELF.set(String(name), workbook); }
export function dropFile(name) { SHELF.delete(String(name)); }

// ── reading a SheetJS sheet cell by cell (HSSFDataFormatter.formatCellValue: the text the cell shows) ──
function colA1(c) { let s = ''; c++; while (c > 0) { const r = (c - 1) % 26; s = String.fromCharCode(65 + r) + s; c = Math.floor((c - 1) / 26); } return s; }
function rangeOf(ref) { const m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(String(ref || '')); if (!m) return null;
  const dec = (s) => { let n = 0; for (const ch of s) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  return { c1: dec(m[3] || m[1]), r1: Number(m[4] || m[2]) - 1 }; }
export function sheetRows(sheet) {
  const rg = rangeOf(sheet && sheet['!ref']); if (!rg) return [];
  const out = [];
  for (let r = 0; r <= rg.r1; r++) {
    const row = [];
    for (let c = 0; c <= rg.c1; c++) { const cell = sheet[colA1(c) + (r + 1)]; row.push(cell == null || cell.v == null ? '' : cell.t === 'n' ? String(cell.v) : String(cell.w != null ? cell.w : cell.v)); }
    out.push(row);
  }
  return out;
}

// ── mapUom(book, answers) — the B4 form's UoM step (§NINJA-LOADER-SPEC): book = [{name, rows}] (rows[0] = header) ──
//   answers[odooName] = { to: '<ERP UoM Name>' } -> the C_UOM row leaves and every C_UOM_ID cell naming it is rewritten; { x12de355: 'XXXX' } -> kept as a new UoM with that code;
//   no answer + unused -> dropped (unchecked, §B0 3); no answer + used -> refused. Returns { ok, book, mapped, kept, dropped, missing }.
export function mapUom(book, answers) {
  answers = answers || {};
  const isUom = (s) => /^(\d\d)?C_UOM$/i.test(s.name), uom = book.find(isUom);
  if (!uom) return { ok: true, book, mapped: [], kept: [], dropped: [], missing: [] };
  const used = {};
  book.forEach((s) => { const i = s.rows[0].findIndex((h) => String(h).split('>')[0] === 'C_UOM_ID'); if (i >= 0) s.rows.slice(1).forEach((r) => { if (r[i] !== '') used[r[i]] = (used[r[i]] || 0) + 1; }); });
  const ni = uom.rows[0].indexOf('Name'), xi = uom.rows[0].indexOf('X12DE355'), mapped = [], kept = [], dropped = [], missing = [], keep = [uom.rows[0]];
  uom.rows.slice(1).forEach((r) => {
    const name = r[ni], a = answers[name];
    if (a && a.to) mapped.push(name + '→' + a.to);
    else if (a && a.x12de355) { const k = r.slice(); k[xi] = a.x12de355; keep.push(k); kept.push(name + '=' + a.x12de355); }
    else if (used[name]) missing.push(name + ' (used by ' + used[name] + ' row(s))');
    else dropped.push(name);
  });
  if (missing.length) return { ok: false, book, mapped, kept, dropped, missing };
  const to = {}; Object.keys(answers).forEach((k) => { if (answers[k] && answers[k].to) to[k] = answers[k].to; });
  const out = book.map((s) => {
    if (s === uom) return { name: s.name, rows: keep };
    const i = s.rows[0].findIndex((h) => String(h).split('>')[0] === 'C_UOM_ID');
    return i < 0 ? s : { name: s.name, rows: s.rows.map((r, ri) => (ri && to[r[i]] != null ? Object.assign(r.slice(), { [i]: to[r[i]] }) : r)) };
  });
  return { ok: true, book: out, mapped, kept, dropped, missing };
}
// a book as [{name, rows}] -> a SheetJS-shaped workbook (what the host and the witness hand the process)
export function bookToWorkbook(book) {
  const wb = { SheetNames: [], Sheets: {} };
  book.forEach((s) => { const sh = {}; let c1 = 0;
    s.rows.forEach((r, ri) => r.forEach((v, ci) => { if (v !== '' && v != null) { sh[colA1(ci) + (ri + 1)] = { t: 's', v: String(v), w: String(v) }; } c1 = Math.max(c1, ci); }));
    sh['!ref'] = 'A1:' + colA1(c1) + Math.max(1, s.rows.length); wb.SheetNames.push(s.name); wb.Sheets[s.name] = sh; });
  return wb;
}

export function activate(ctx) {
  const AP = ctx.process;
  AP.defineProcess(CLASSNAME, function (SvrProcess, X) {
    const NUM = { 12: 1, 22: 1, 29: 1, 37: 1 }, INT = { 11: 1, 13: 1, 18: 1, 19: 1, 30: 1, 31: 1, 21: 1, 25: 1, 35: 1 };
    const STAMPED = /^(created|createdby|updated|updatedby)$/;   // filled when the group commits (PO.saveNew's session stamps)

    function MigrateExcelData() { SvrProcess.call(this); this.IsActive = false; this.File_Directory = ''; this.Processed = false; this.WhereClause = ''; }
    MigrateExcelData.prototype = Object.create(SvrProcess.prototype);

    // prepare — the Java's four parameters, nothing else
    MigrateExcelData.prototype.prepare = function () {
      const para = this.getParameter();
      for (let i = 0; i < para.length; i++) {
        const name = para[i].getParameterName(), pv = para[i].getParameter();
        if (pv == null) continue;
        if (name === 'IsActive') this.IsActive = 'Y' === pv;
        else if (name === 'Processed') this.Processed = 'Y' === pv;
        else if (name === 'File_Directory') this.File_Directory = String(pv);
        else if (name === 'WhereClause') this.WhereClause = String(pv);
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA MigrateExcelData ' + name);
      }
    };

    MigrateExcelData.prototype.doIt = function () {
      const trx = this.get_TrxName(), self = this;
      this.client = Number(trx.env.client || 0); this.errors = []; this.fixes = {};
      const wb = SHELF.get(this.File_Directory);
      if (!wb) throw new Error(this.File_Directory + ' (No such file or directory)');   // FileInputStream's FileNotFoundException text
      let message = 'No worksheets : ' + wb.SheetNames.length;
      wb.SheetNames.forEach(function (sn) {
        let sheetName = sn;
        if (self.Processed) sheetName = sheetName.substring(2);
        const t = self.table(sheetName);
        if (!t) { trx.say('§NINJA-SKIP sheet=' + sn + ' — ' + sheetName + ' does not exist. Bypassing..'); return; }
        trx.say('§NINJA-SHEET Processing...' + sheetName);
        message = message + self.migrateSheetToDB(t, sheetRows(wb.Sheets[sn]), sn);
      });
      Object.keys(this.fixes).forEach(function (f) { trx.say('§NINJA-FIX ' + f + ' applied=' + self.fixes[f]); });
      if (this.errors.length) {                                                            // F7: all or nothing
        this.errors.forEach(function (e) { trx.say('§NINJA-ERR ' + e); });
        this.rollback();
        throw new Error('Nothing migrated: ' + this.errors.length + ' row error(s). ' + this.errors.slice(0, 12).join(' | ') + (this.errors.length > 12 ? ' | …' : ''));
      }
      trx.say('§NINJA-DONE ' + message);
      return message;
    };
    MigrateExcelData.prototype.fix = function (f) { this.fixes[f] = (this.fixes[f] || 0) + 1; };

    // ── dictionary reads ──
    MigrateExcelData.prototype.table = function (name) {
      const r = this.get_TrxName().q("SELECT ad_table_id AS id, tablename AS t FROM ad_table WHERE upper(tablename)=upper(?) AND isactive='Y'", [name])[0];
      return r ? { id: r.id, name: r.t, lc: String(r.t).toLowerCase() } : null;
    };
    MigrateExcelData.prototype.column = function (t, col) {
      return this.get_TrxName().q("SELECT columnname AS c, ad_reference_id AS ref, ad_reference_value_id AS refv, ismandatory AS m, iskey AS k, coalesce(columnsql,'') AS s FROM ad_column WHERE ad_table_id=? AND upper(columnname)=upper(?) AND isactive='Y'", [t.id, col])[0] || null;
    };
    MigrateExcelData.prototype.hasColumn = function (tableName, col) {
      return this.get_TrxName().q("SELECT 1 AS x FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE upper(t.tablename)=upper(?) AND upper(c.columnname)=upper(?) AND c.isactive='Y'", [tableName, col]).length > 0;
    };
    // the table an _ID column points at: column minus _ID when that is a table, else its reference's key table (F5: THIS table's column)
    MigrateExcelData.prototype.lookupTable = function (t, colInfo) {
      const name = colInfo.c.replace(/_ID$/i, ''), direct = this.table(name);
      if (direct) return { t: direct, viaRef: false };
      if (!colInfo.refv) throw new Error('No Reference for Column - ' + name);
      const r = this.get_TrxName().q('SELECT tb.tablename AS t FROM ad_ref_table rt JOIN ad_column k ON k.ad_column_id=rt.ad_key JOIN ad_table tb ON tb.ad_table_id=k.ad_table_id WHERE rt.ad_reference_id=?', [colInfo.refv])[0];
      if (!r) throw new Error('No Reference for Column - ' + name);
      return { t: this.table(r.t), viaRef: true };
    };
    // F3+F4: tenant first, then System; exactly one row in the tier that answers
    MigrateExcelData.prototype.findOne = function (lt, col, value) {
      const trx = this.get_TrxName(), key = lt.lc + '_id', tiers = this.client ? [this.client, 0] : [0];
      for (const c of tiers) {
        const w = {}; w[col.toLowerCase()] = value; w.ad_client_id = c;
        const rows = trx.find(lt.lc, w);
        if (rows.length === 1) return { id: rows[0][key] };
        if (rows.length > 1) return { error: rows.length + ' ' + lt.name + ' rows have ' + col + '="' + value + '" in client ' + c + ' (ambiguous)' };
      }
      return { error: 'no ' + lt.name + ' with ' + col + '="' + value + '"' };
    };
    MigrateExcelData.prototype.doLookupID = function (t, colInfo, alt, value, rowVals) {
      const trx = this.get_TrxName(), lk = this.lookupTable(t, colInfo), lt = lk.t;
      if (lk.viaRef && alt) this.fix('F10');
      // <Table>Line -> its header by DocumentNo
      if (t.name.toUpperCase().endsWith('LINE') && t.name.slice(0, -4).toUpperCase() === lt.name.toUpperCase() && !alt) {
        const p = this.findOne(lt, 'DocumentNo', value);
        if (p.id != null) return p;
        trx.say('§NINJA-WARN Master-MasterLine with NO DocumentNo ' + value + ' (' + p.error + ')');
      }
      if (alt) {
        if (/_ID$/i.test(alt)) {                                                         // nested one level: C_BPartner_Location_ID>C_BPartner_ID
          const inner = this.table(alt.replace(/_ID$/i, ''));
          if (!inner) throw new Error('Lookup within table not found: ' + colInfo.c);
          const i = this.findOne(inner, 'Name', value);
          if (i.error) return i;
          return this.findOne(lt, alt, i.id);
        }
        this.fix('F2');
        return this.findOne(lt, alt, value);
      }
      if (!this.hasColumn(lt.name, 'Name')) {                                            // no Name column: the integer as is
        if (/^-?\d+$/.test(String(value))) return { id: Number(value) };
        throw new Error(lt.name + ' ' + value + ' ** No Name in ID Lookup - Try Alternate \'Table_ID>AlternateColumnName\' in header column');
      }
      return this.findOne(lt, 'Name', value);
    };
    MigrateExcelData.prototype.convert = function (colInfo, value) {
      const ref = Number(colInfo.ref);
      if (ref === 15 || ref === 16) { let d = String(value); if (d.length < 12) d = d + ' 00:00:00'; if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(d)) return { error: 'not a date: "' + value + '"' }; return { v: d }; }
      if (NUM[ref] || INT[ref]) { const s = String(value).trim(); if (!/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(s)) return { error: 'not a number: "' + value + '"' }; return { v: Number(s) }; }
      return { v: String(value) };
    };

    // ── one sheet ──
    MigrateExcelData.prototype.migrateSheetToDB = function (t, rows, sheetLabel) {
      const trx = this.get_TrxName(), ML = X.ML, self = this;
      let cnt = 0, updated = 0;
      if (!rows.length) return 'No rows in Excel Sheet';
      const head = [];
      for (const h of rows[0]) {
        if (h == null || String(h).trim() === '') break;                                 // the Java stops at the first blank header cell
        const parts = String(h).split('>'), col = parts[0].trim(), alt = parts[1] ? parts[1].trim() : null;
        const info = this.column(t, col);
        if (!info) throw new Error('No such column. Check your Excel sheet+column:' + t.name + '-' + col);
        head.push({ h: String(h), col: info.c, lc: String(info.c).toLowerCase(), alt: alt, info: info });
      }
      const mand = trx.q("SELECT lower(columnname) AS c FROM ad_column WHERE ad_table_id=? AND ismandatory='Y' AND isactive='Y' AND iskey<>'Y' AND coalesce(columnsql,'')=''", [t.id])
        .map((r) => r.c).filter((c) => !STAMPED.test(c) && !/_uu$/.test(c));
      for (let ri = 1; ri < rows.length; ri++) {
        const r = rows[ri];
        if (r.every((v) => v === '')) return '(' + t.name + ' = ' + cnt + ' records) HAS EMPTY ROWS';
        const where = sheetLabel + ' row ' + (ri + 1), rowErr = [];
        if (this.IsActive) { updated += this.updateIsActive(t, head, r, where); continue; }
        const po = ML.newRecord(trx, t.lc);
        head.forEach(function (hd, ci) { try {
          const v = r[ci] == null ? '' : r[ci];
          if (v === '') { self.fix('F6'); return; }
          if (/_ID$/i.test(hd.col)) {
            const lk = self.doLookupID(t, hd.info, hd.alt, v, r);
            if (lk.error) { rowErr.push(where + ' ' + hd.h + ': ' + lk.error); return; }
            po.set(hd.lc, lk.id); return;
          }
          const cv = self.convert(hd.info, v);
          if (cv.error) { rowErr.push(where + ' ' + hd.h + ': ' + cv.error); return; }
          po.set(hd.lc, cv.v);
        } catch (e) { rowErr.push(where + ' ' + hd.h + ': ' + (e && e.message || e)); } });   // F7: a lookup that throws (Java: AdempiereException) is listed with the rest
        if (rowErr.length) { this.errors.push.apply(this.errors, rowErr); continue; }
        if (!po.save()) { this.errors.push(where + ': ' + t.name + ' save refused — ' + po.error); continue; }
        const empty = mand.filter((c) => po.row[c] == null || po.row[c] === '');            // F8
        if (empty.length) { this.fix('F8'); this.errors.push(where + ': ' + t.name + ' mandatory ' + empty.join(',') + ' empty'); continue; }
        cnt++;
        this.statusUpdate('Processing : ' + t.name + '::' + cnt);
      }
      return this.IsActive ? '(' + t.name + ' = ' + updated + ' records) ' : '(' + t.name + ' = ' + cnt + ' records) ';
    };

    // IsActive=Y: UPDATE the rows matching the first two columns (+ WhereClause), raw (no model events) as the Java's DB.executeUpdateEx
    MigrateExcelData.prototype.updateIsActive = function (t, head, r, where) {
      const trx = this.get_TrxName(), self = this, key = {}, set = {};
      if (head.length < 3) { this.errors.push(where + ': update mode needs two key columns and one to set'); return 0; }
      for (let i = 0; i < head.length; i++) {
        const hd = head[i], v = r[i] == null ? '' : r[i];
        let val = v;
        if (/_ID$/i.test(hd.col) && v !== '') { const lk = this.doLookupID(t, hd.info, hd.alt, v, r); if (lk.error) { this.errors.push(where + ' ' + hd.h + ': ' + lk.error); return 0; } val = lk.id; }
        else if (v !== '') { const cv = this.convert(hd.info, v); if (cv.error) { this.errors.push(where + ' ' + hd.h + ': ' + cv.error); return 0; } val = cv.v; }
        if (i < 2) key[hd.lc] = val; else if (v !== '') set[hd.lc] = val;
      }
      key.ad_client_id = this.client;
      let rows = trx.find(t.lc, key);
      if (this.WhereClause && this.WhereClause.trim()) {                                 // the clause is SQL the user wrote (legacy semantics), read on committed rows
        const idc = trx.idCol(t.lc), ok = {};
        trx.q('SELECT ' + idc + ' AS i FROM ' + t.lc + ' WHERE ' + this.WhereClause).forEach(function (x) { ok[String(x.i)] = 1; });
        rows = rows.filter(function (x) { return ok[String(x[idc])]; });
      } else if (this.WhereClause !== null) this.fix('F11');
      rows.forEach(function (row) { trx.update(t.lc, row, set); });
      if (rows.length === 1) this.statusUpdate('Updating : ' + t.name + '::' + 1);
      return rows.length === 1 ? 1 : 0;                                                  // the Java counts an update only when exactly one row changed (r==1)
    };

    return MigrateExcelData;
  });
}
