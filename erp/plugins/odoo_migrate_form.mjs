// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — odoo_migrate_form.mjs: HOT chunk of plugins/odoo_migrate.mjs — the "Migrate from Odoo" form descriptor for the ONE generic form engine (ad_form_generic.js).
// Implementing bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §B4-IMPL-SPEC (+ §B0-SPEC summary-before-OK / uncheck rules) — Witness: W-ODOO-FORM. READ THE LOG: §ODOO-FORM lines.
// rows(trx, params, current) = the SUMMARY: the Ninja loader (AD_Process 9540001) run inside the form's READ transaction, which the engine throws away — the same import code on a
//   throwaway copy (§B0 4). run(trx, params, rows) = the same plan, the same loader, in the form's ONE transaction, kept. Nothing here writes a table itself.
// Selection (§B0 3): a sheet stays ticked (locked) while a ticked sheet looks it up through a MANDATORY column (AD_Column.IsMandatory of that header's column); an OPTIONAL lookup
//   into an unticked sheet is dropped from the ticked one (the stated effect). Units: an Odoo unit a product uses must be answered with an ERP unit (suggested only on an exact
//   name match); units nothing uses are left out. Refused before anything runs: the manifest's files/sheets/row counts differ from what was picked; a used unit has no answer.
// Deterministic: no clock, no random.
import { putFile, dropFile, mapUom, sheetRows, bookToWorkbook } from './ninja_migrate_process.mjs';
import * as OB from './open_balances.mjs';                    // §E3C-SPEC 1(d)+(e): the open balances of ANY source (prerequisites, the two import processes, the verifier)
import { isExport, openBalances, hasMasters, convert } from './odoo_migrate_convert.mjs';   // §E3C-SPEC 1(c): the agent's raw odoo_export.json → the open sheets, by the engine on templates/odoo-17.json
export const CLASSNAME = 'org.kernel.odoo.MigrateFromOdoo';
const NINJA_PROCESS = 9540001, FILE = 'odoo_migration.from-form.xlsx';
let AP = null;

function say(trx, line) { if (trx && trx.say) trx.say(line); console.log(line); }
function tableOfSheet(name) { return String(name).replace(/^\d\d/, ''); }

// the table an _ID header looks up (the loader's own rule: column minus _ID, else the column's reference key table)
function lookupTable(trx, table, col) {
  const name = col.replace(/_ID$/i, '');
  if (trx.q("SELECT 1 AS x FROM ad_table WHERE upper(tablename)=upper(?) AND isactive='Y'", [name]).length) return name.toUpperCase();
  const r = trx.q('SELECT tb.tablename AS t FROM ad_column c JOIN ad_table t0 ON t0.ad_table_id=c.ad_table_id JOIN ad_ref_table rt ON rt.ad_reference_id=c.ad_reference_value_id ' +
    'JOIN ad_column k ON k.ad_column_id=rt.ad_key JOIN ad_table tb ON tb.ad_table_id=k.ad_table_id WHERE upper(t0.tablename)=upper(?) AND upper(c.columnname)=upper(?)', [table, col])[0];
  return r ? String(r.t).toUpperCase() : null;
}
function isMandatory(trx, table, col) {
  const r = trx.q("SELECT c.ismandatory AS m FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE upper(t.tablename)=upper(?) AND upper(c.columnname)=upper(?) AND c.isactive='Y'", [table, col])[0];
  return !!r && r.m === 'Y';
}

// plan(trx, params, current) -> { problems[], units[], sheets[], book (effective), files } — everything the summary and the run share
export function plan(trx, params, current) {
  const out = { problems: [], units: [], sheets: [], book: null, open: null, source: null };
  const files = (params && params.Files) || [];
  const wbf = files.find((f) => /\.xlsx?$/i.test(f.name)), mf = files.find((f) => /manifest\.json$/i.test(f.name));
  // §ODOO-ENGINE-SPEC O3: odoo_export.json with the master sets and NO workbook = the whole book comes from the agent's raw rows through the ONE engine (templates/odoo-17.json).
  //   A workbook (an older download: workbook + manifest.json, with or without odoo_export.json for the open balances) loads exactly as before.
  const xe = !wbf ? files.find((f) => hasMasters(f.data)) : null, eng = xe ? convert(xe.data) : null;
  if (!eng) {
    if (!wbf) out.problems.push('Pick odoo_export.json from your export folder (or, from an older export, the workbook odoo_migration.xlsx + manifest.json).');
    else if (!mf) out.problems.push('Pick manifest.json from the same folder (it proves nothing was dropped or made up).');
  } else if (eng.short.length) out.problems.push('odoo_export.json is not complete: ' + eng.short.join('; ') + '. Run the export again.');
  if (!AP || !AP.JAVA || !AP.JAVA['org.idempiere.ninja.process.MigrateExcelData'] || !trx.q("SELECT 1 AS x FROM ad_process WHERE ad_process_id=? AND isactive='Y'", [NINJA_PROCESS]).length)
    out.problems.push('Start the plugin "Ninja data migration" first (Plugins & Releases): this form loads through it.');
  if (!eng && (!wbf || !mf)) return out;
  const man = eng ? eng.manifest : mf.data;
  let book = eng ? eng.book.map((b) => ({ name: b.name, rows: b.rows })) : wbf.data.SheetNames.map((n) => ({ name: n, rows: sheetRows(wbf.data.Sheets[n]) }));
  // manifest == what was picked (the export's own count of every sheet)
  if (!eng && man.workbook && man.workbook !== wbf.name) out.problems.push('The manifest is for ' + man.workbook + ', not ' + wbf.name + '.');
  const mSheets = (man.sheets || []).slice();
  mSheets.forEach((m) => { const s = book.find((b) => b.name === m.sheet);
    if (!s) out.problems.push('Sheet ' + m.sheet + ' is in the manifest but not in the workbook.');
    else if (s.rows.length - 1 !== m.rows) out.problems.push('Sheet ' + m.sheet + ' has ' + (s.rows.length - 1) + ' rows; the manifest says ' + m.rows + '.'); });
  book.forEach((b) => { if (!mSheets.some((m) => m.sheet === b.name)) out.problems.push('Sheet ' + b.name + ' is not in the manifest.'); });
  // §E3C-SPEC: the optional third file, the agent's RAW rows (odoo_export.json) → the open-balance sheets, appended after the masters (their own manifest counts them)
  const xf = eng ? null : files.find((f) => isExport(f.data)); let openCfg = null; const openNames = [];
  if (eng) { (man.problems || []).forEach((p) => out.problems.push(p)); book.forEach((b) => { if (/^(I_GLJournal|I_Invoice|C_Bank|C_BankAccount|I_BankStatement)$/.test(tableOfSheet(b.name))) openNames.push(b.name); }); if (openNames.length) openCfg = man; out.source = man; }
  if (xf) {
    const xm = xf.data.manifest, c = openBalances(xf.data);
    ['db', 'cutover', 'company_id'].forEach((k) => { if (man[k] != null && String(man[k]) !== String(xm[k])) out.problems.push(xf.name + ' is not from the same export as ' + wbf.name + ' (' + k + ': ' + xm[k] + ' / ' + man[k] + ').'); });
    (c.manifest.problems || []).forEach((p) => out.problems.push(p));
    c.sheets.forEach((sh) => { const name = String(book.length + 1).padStart(2, '0') + sh.table; book.push({ name, rows: sh.rows }); mSheets.push({ sheet: name, rows: sh.rows.length - 1 }); openNames.push(name); });
    openCfg = c.manifest; out.source = c.manifest;
  }
  const cur = {}; (current || []).forEach((r) => { cur[r.key] = r; });

  // units the products use, with the user's answer (or an exact-name suggestion)
  const uom = book.find((b) => tableOfSheet(b.name).toUpperCase() === 'C_UOM'), used = {};
  book.forEach((b) => { const i = b.rows[0].findIndex((h) => String(h).split('>')[0] === 'C_UOM_ID'); if (i >= 0) b.rows.slice(1).forEach((r) => { if (r[i] !== '') used[r[i]] = (used[r[i]] || 0) + 1; }); });
  const answers = {};
  // H7 (§HARDEN-SPEC): the answer is picked from the units this tenant has (System + own, active) — the generic renderer draws them as a pick list (G-e)
  const pick = trx.q("SELECT name FROM c_uom WHERE ad_client_id IN (0,?) AND isactive='Y' ORDER BY name", [trx.env.client || 0]).map((r) => r.name);
  Object.keys(used).sort().forEach((u, i) => {
    const key = i + 1, given = cur[key] && cur[key].erpunit != null ? String(cur[key].erpunit).trim() : null;
    const code = cur[key] && cur[key].newcode != null ? String(cur[key].newcode).trim() : '';   // §KEEP-UNIT-SPEC: no ERP unit chosen + a code = the unit is kept as a NEW unit with that X12DE355 code
    const exact = trx.q("SELECT name FROM c_uom WHERE name=? AND ad_client_id IN (0,?) AND isactive='Y'", [u, trx.env.client || 0]);
    // §BC-SPEC: no exact name, but the source names the unit's international code (Business Central's UN/ECE code in the C_UOM sheet's X12DE355) and exactly ONE ERP unit has
    //   that code → suggested (the user still sees and can change it); Odoo leaves the code blank, so nothing changes there
    let byCode = [];
    if (exact.length !== 1 && uom) { const ni = uom.rows[0].indexOf('Name'), xi = uom.rows[0].indexOf('X12DE355'), ur = uom.rows.slice(1).find((r) => r[ni] === u);
      if (ur && xi >= 0 && ur[xi]) byCode = trx.q("SELECT name FROM c_uom WHERE x12de355=? AND ad_client_id IN (0,?) AND isactive='Y'", [ur[xi], trx.env.client || 0]); }
    const ans = given != null ? given : exact.length === 1 ? exact[0].name : byCode.length === 1 ? byCode[0].name : '';
    let note = '';
    if (ans) { const hit = trx.q("SELECT count(*) AS n FROM c_uom WHERE name=? AND ad_client_id IN (0,?) AND isactive='Y'", [ans, trx.env.client || 0])[0].n;
      if (hit === 1) answers[u] = { to: ans }; else note = hit ? 'more than one ERP unit is called "' + ans + '"' : 'no ERP unit is called "' + ans + '"'; }
    else if (code) { const taken = trx.q('SELECT count(*) AS n FROM c_uom WHERE x12de355=? AND ad_client_id IN (0,?)', [code, trx.env.client || 0])[0].n;
      if (code.length > 4) note = 'a unit code has at most 4 characters'; else if (taken) note = 'the code ' + code + ' is already a unit of this ERP: choose that unit instead';
      else { answers[u] = { x12de355: code }; note = 'kept as a new unit with the code ' + code; } }
    else note = 'answer which ERP unit this is, or give a code to keep it as a new unit';
    out.units.push({ key, item: 'Unit: ' + u, infile: used[u] + ' product(s)', erpunit: ans, newcode: ans ? '' : code, reason: note, selected: true, locked: true, lockedBy: 'a unit is answered, not unticked', options: { erpunit: pick } });
  });

  // selection + dependencies (mandatory lookups lock their parent; optional ones are dropped when the parent is unticked)
  const tables = book.map((b) => tableOfSheet(b.name).toUpperCase());
  const sel = {}; book.forEach((b, i) => { const k = 101 + i; sel[b.name] = cur[k] ? !!cur[k].selected : true; });
  const edges = [];
  book.forEach((b) => { const t = tableOfSheet(b.name); b.rows[0].forEach((h, hi) => { const col = String(h).split('>')[0]; if (!/_ID$/i.test(col)) return;
    const lt = lookupTable(trx, t, col); if (!lt || lt === t.toUpperCase()) return; const pi = tables.indexOf(lt); if (pi < 0) return;
    edges.push({ child: b.name, parent: book[pi].name, col: col, hi: hi, mandatory: isMandatory(trx, t, col) }); }); });
  const lockedBy = {};
  // the opening journal and the open documents go together: the journal puts the receivable / payable balance on the clearing accounts, the documents take it off again
  const jn = openNames.find((n) => tableOfSheet(n) === 'I_GLJournal'), inn = openNames.find((n) => tableOfSheet(n) === 'I_Invoice');
  if (jn && inn) { if (sel[jn]) lockedBy[inn] = ['I_GLJournal (its clearing accounts)']; else sel[inn] = false; }
  // the opening bank statement goes with the journal too (it takes the bank balance off Bank Clearing) and needs its bank account (found by number) - which needs its bank (the mandatory lookup below)
  const bsn = openNames.find((n) => tableOfSheet(n) === 'I_BankStatement'), ban = book.map((b) => b.name).find((n) => tableOfSheet(n) === 'C_BankAccount');
  if (jn && bsn) { if (sel[jn]) lockedBy[bsn] = (lockedBy[bsn] || []).concat('I_GLJournal (its clearing accounts)'); else sel[bsn] = false; }
  if (bsn && ban && (sel[bsn] || lockedBy[bsn])) lockedBy[ban] = (lockedBy[ban] || []).concat('I_BankStatement');
  edges.forEach((e) => { if (e.mandatory && sel[e.child]) (lockedBy[e.parent] = lockedBy[e.parent] || []).push(tableOfSheet(e.child)); });
  Object.keys(lockedBy).forEach((p) => { if (!sel[p]) say(trx, '§ODOO-FORM relock ' + p + ' (needed by ' + lockedBy[p].join(',') + ')'); sel[p] = true; });
  const drops = {};
  edges.forEach((e) => { if (!e.mandatory && sel[e.child] && !sel[e.parent]) (drops[e.child] = drops[e.child] || []).push(e); });

  // the effective book: units mapped, unticked sheets out, optional lookups into them dropped
  const mu = mapUom(JSON.parse(JSON.stringify(book)), answers);
  if (!mu.ok) out.problems.push('Answer the unit(s): ' + mu.missing.join(', ') + '.');
  let eff = (mu.ok ? mu.book : book).filter((b) => sel[b.name] && !(tableOfSheet(b.name).toUpperCase() === 'C_UOM' && b.rows.length < 2));
  eff = eff.map((b) => { const d = drops[b.name]; if (!d) return b; const cut = d.map((e) => e.hi);
    return { name: b.name, rows: b.rows.map((r) => r.filter((v, i) => cut.indexOf(i) < 0)) }; });
  out.book = eff;
  if (openCfg) { out.open = OB.openOf(eff, openCfg); OB.problems(trx, out.open).forEach((p) => out.problems.push(p)); }
  book.forEach((b, i) => {
    const t = tableOfSheet(b.name), m = mSheets.find((x) => x.sheet === b.name);
    const needs = edges.filter((e) => e.child === b.name).map((e) => tableOfSheet(e.parent) + (e.mandatory ? '' : ' (optional)'));
    const neededBy = edges.filter((e) => e.parent === b.name).map((e) => tableOfSheet(e.child) + (e.mandatory ? '' : ' (optional)'));
    const inTenant = trx.q('SELECT count(*) AS n FROM ' + t.toLowerCase() + ' WHERE ad_client_id=?', [trx.env.client || 0])[0].n;
    out.sheets.push({ key: 101 + i, sheet: b.name, table: t, item: t, odoo: m ? m.rows : null, infile: b.rows.length - 1, selected: sel[b.name], locked: !!lockedBy[b.name],
      lockedBy: lockedBy[b.name] ? 'needed by ' + Array.from(new Set(lockedBy[b.name])).join(', ') : null,
      needs: Array.from(new Set(needs)).join(', '), neededby: Array.from(new Set(neededBy)).join(', '), intenant: inTenant,
      reason: drops[b.name] ? 'drops ' + drops[b.name].map((e) => e.col).join(', ') + ' (its sheet is unticked)' : '' });
  });
  return out;
}

// §E1 opening stock (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §ENGINE-SPEC §3 "Opening stock", §5 E1) — Witness: W-BC-MIGRATE / W-SAP-MIGRATE / W-ODOO-FORM case STOCK.
// The 17-sheet Ninja workbook (the owner's format, loaded faithfully by MigrateExcelData: no DocAction) carries the opening stock as M_Inventory + M_InventoryLine; saved as is it stays
//   a DRAFTED physical inventory (no storage, no M_Transaction, no Fact_Acct - measured, BC demo). Legacy's route for rows that must become documents is I_Inventory + ImportInventory
//   with DocAction CO (ImportInventory.java:122, :383/:461; the twin's port is processes/ImportInventory.js, AD_Process 219). So THIS loader - the one shared by every source
//   (Odoo, Business Central, SAP Business One) - rewrites the two sheets into ONE I_Inventory sheet (product Value + LocatorValue + QtyCount + MovementDate + DocSubTypeInv PI),
//   loads it with the same Ninja loader, then runs process 219 with DocAction CO. The summary still speaks of M_Inventory / M_InventoryLine (headers made / lines made).
//   COST: no source sheet carries a unit cost, so no cost adjustment is made (ImportInventory.java:546-564 IsUpdateCosting stays a named refusal in the twin) - named in the log, never invented.
const STOCK_PROCESS = 219;
export function openingStockSheets(book) {
  const iH = book.findIndex((b) => tableOfSheet(b.name) === 'M_Inventory'), iL = book.findIndex((b) => tableOfSheet(b.name) === 'M_InventoryLine');
  if (iH < 0 || iL < 0) return null;
  const H = book[iH].rows, L = book[iL].rows; if (H.length < 2 || L.length < 2) return null;
  const hx = (n) => H[0].indexOf(n), lx = (n) => L[0].indexOf(n);
  const cDoc = hx('DocumentNo'), cDate = hx('MovementDate'), cType = hx('C_DocType_ID>DocSubTypeInv'), cDesc = hx('Description');
  const lDoc = lx('M_Inventory_ID'), lLoc = lx('M_Locator_ID>Value'), lProd = lx('M_Product_ID>Value'), lQty = lx('QtyCount');
  if ([cDoc, cDate, lDoc, lLoc, lProd, lQty].some((i) => i < 0)) return null;
  const hdr = {}; H.slice(1).forEach((r) => { hdr[r[cDoc]] = r; });
  const out = [['Value', 'LocatorValue', 'QtyCount', 'MovementDate', 'C_DocType_ID>DocSubTypeInv', 'Description', 'I_IsImported']];   // I_IsImported = N: the importer's own "not yet" flag (mandatory column)
  for (const r of L.slice(1)) { const h = hdr[r[lDoc]]; if (!h) return null;       // a line whose header is not there: leave both sheets to the loader's own refusal
    out.push([r[lProd], r[lLoc], r[lQty], h[cDate], cType < 0 ? '' : h[cType], cDesc < 0 ? '' : h[cDesc], 'N']); }
  const ioSheet = book[iH].name.replace(/M_Inventory$/, 'I_Inventory');
  const nb = book.map((b, i) => i === iH ? { ...b, name: ioSheet, rows: out } : b).filter((b, i) => i !== iL);
  return { book: nb, lineSheet: book[iL].name, headSheet: book[iH].name, headers: H.length - 1, lines: L.length - 1, ioSheet };
}

// load(trx, book) -> { ok, summary, perTable{T: n}, refusals{sheet: [reasons]} } — the Ninja loader in THIS transaction (stage 1: masters + the I_Inventory rows, §E1)
function loadOnce(trx, book, open) {
  const st = openingStockSheets(book), loadBook = st ? st.book : book;
  // §E3C-SPEC 1(d) stage 1: what the open balances need and the tenant lacks (clearing accounts, the no-tax tax, the Opening Charges), through the model, each named.
  //   §E3D-SPEC: BEFORE the Ninja load - the I_BankStatement sheet looks its charge up BY NAME while it loads (C_Charge_ID>Name).
  const created = open ? OB.prerequisites(trx, open) : [];
  putFile(FILE, bookToWorkbook(loadBook));
  const mark = trx.log.length;
  let r;
  try { r = AP.runInTrx(trx, NINJA_PROCESS, { params: { File_Directory: FILE, Processed: 'Y' } }); } finally { dropFile(FILE); }
  const lines = trx.log.slice(mark), refusals = {}, perTable = {};
  lines.forEach((l) => { const m = /^§NINJA-ERR (\d\d[A-Za-z_]+) row (\d+)([\s\S]*)$/.exec(l); /* [\s\S]: a refusal may have two lines (the unique error's Detail line) */ if (m) { const sh = st && m[1] === st.ioSheet ? st.lineSheet : m[1]; (refusals[sh] = refusals[sh] || []).push('row ' + m[2] + m[3]); } });
  const shown = {};
  String(r && r.summary || '').replace(/\(([A-Za-z_]+) = (\d+) records\)/g, (x, t, n) => { perTable[t.toUpperCase()] = Number(n); shown[t] = Number(n); return x; });
  if (st) {   // the summary speaks of the documents stage 2 will make: one inventory per source header, one line per I_Inventory row
    const n = perTable.I_INVENTORY || 0; delete perTable.I_INVENTORY; delete shown.I_Inventory;
    perTable.M_INVENTORY = st.headers; shown.M_Inventory = st.headers; perTable.M_INVENTORYLINE = n; shown.M_InventoryLine = n;
    say(trx, '§E1-STOCK stage=1 I_Inventory rows=' + n + ' (source headers=' + st.headers + '); stage 2 (Import Inventory, DocAction CO) runs after these masters are committed');
  }
  return { ok: !!(r && r.ok), summary: r && r.summary, perTable, shown, refusals, created };
}

// §ALREADY-THERE-SPEC: load(trx, book, open) - a source row whose key the TENANT already holds (the born client's own "Standard" / "Immediate" rows, an account it already has)
//   is refused by the unique index, rightly; it must not refuse the whole migration. The model says who holds the key (§MODEL-UNIQUE ... held_by=tenant|this-load, model_layer.js
//   uniqueError); rows refused ONLY for a key held by the tenant are taken out and the load runs again from the savepoint. A key repeated inside the file is still a refusal.
// heldByIdentifier(trx, book) -> { book, already{sheet: n} } (migrate-recover F3). A master table without a unique index (C_Bank, C_BankAccount) cannot say "already there" through the DB's refusal. The dictionary
//   says what identifies a record (AD_Column.IsIdentifier = 'Y': what legacy shows as the record's name in every lookup); a file row whose identifier columns the sheet supplies as plain values (no ">") are ALL
//   equal to exactly ONE row of this tenant is that row, so it is not loaded again. No identifier supplied, or no / several matching rows: the row is left to the loader (nothing guessed). Staging (I_*) sheets are not masters.
function heldByIdentifier(trx, book) {
  const C = Number(trx.env.client || 0), already = {};
  const tblId = (name) => trx.q('SELECT ad_table_id AS i, tablename AS t FROM ad_table WHERE upper(tablename)=upper(?)', [name])[0];
  const out = book.map((b) => {
    const t = tableOfSheet(b.name); if (/^I_/i.test(t) || !b.rows.length) return b;
    const idc = trx.q("SELECT lower(c.columnname) AS c FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE upper(t.tablename)=upper(?) AND c.isidentifier='Y' AND c.isactive='Y' AND c.ad_reference_id NOT IN (18,19,30,28)", [t]).map((r) => r.c);
    const H = b.rows[0].map((h) => String(h)), plain = idc.map((c) => H.findIndex((h) => h.toLowerCase() === c)).filter((i) => i >= 0);
    if (!idc.length || !plain.length) return b;
    // the lookups of the sheet (X_ID>Alt, Alt a plain column) are part of the row's identity: resolved to the tenant's ids; one that cannot be resolved leaves the row to the loader
    const looks = H.map((h, i) => ({ h, i })).filter((x) => x.h.includes('>')).map((x) => { const [col, alt] = x.h.split('>'); return { i: x.i, col: col.trim().toLowerCase(), alt: alt.trim(), tbl: col.trim().replace(/_ID$/i, '') }; });
    if (looks.some((l) => /_ID$/i.test(l.alt))) return b;
    const lc = t.toLowerCase(); let rowsT; try { rowsT = trx.find(lc, { ad_client_id: C }); } catch (e) { return b; }
    const memo = {}, resolve = (l, v) => { const k = l.tbl + '|' + l.alt + '|' + v; if (k in memo) return memo[k]; let rs = [];
      try { const tb = tblId(l.tbl); for (const c of [C, 0]) { const w = {}; w[l.alt.toLowerCase()] = String(v); w.ad_client_id = c; rs = tb ? trx.find(l.tbl.toLowerCase(), w) : []; if (rs.length) break; } } catch (e) { rs = []; }   // tenant first, then System (the Ninja loader's own tiers)
      return (memo[k] = rs.length === 1 ? String(rs[0][l.tbl.toLowerCase() + '_id']) : null); };
    const idOf = (x) => (x == null ? '' : String(x).trim()), tenantBy = {};
    // a blank identifier cell is not compared (legacy fills a blank Name with "." - MBPartnerLocation); the other identifier cells and every lookup must be equal
    const sigOf = (r) => plain.filter((i) => idOf(r[i]) !== '');
    const countOf = (cols, lk) => { const sk = cols.join(','); const m = tenantBy[sk] = tenantBy[sk] || (() => { const o = {}; rowsT.forEach((x) => { const k = cols.map((i) => idOf(x[H[i].toLowerCase()])).concat(looks.map((l) => idOf(x[l.col]))).join('\u0001'); o[k] = (o[k] || 0) + 1; }); return o; })();
      return m[cols.map((i) => idOf(r0[i])).concat(lk).join('\u0001')]; };
    let r0 = null;
    const kept = b.rows.filter((r, i) => { if (i === 0 || r.every((v) => v === '')) return true; const cols = sigOf(r); if (!cols.length && !looks.length) return true;
      const lk = looks.map((l) => (r[l.i] === '' || r[l.i] == null ? '' : resolve(l, r[l.i])));
      if (lk.some((v) => v == null) || (!cols.length && lk.every((v) => v === ''))) return true; r0 = r; return countOf(cols, lk) !== 1; });
    if (kept.length === b.rows.length) return b;
    already[b.name] = b.rows.length - kept.length; return { name: b.name, rows: kept };
  });
  return { book: out, already };
}

// saltUU(book, client): the converters mint deterministic UUs (uuid5 of the source id) so a sheet can find its own rows (C_Location_ID>C_Location_UU). Legacy's <table>_uu_idx is GLOBAL, so the same export loaded
//   into a second company would collide: every *_UU value of the file is mapped, with the target client, to another deterministic UUID. Same file + same tenant = same UUs (a repeat finds its rows); another tenant = distinct.
export function saltUUValue(client, v) {
  const h = (str, seed) => { let a = 0x811c9dc5 ^ seed, b = 0x9e3779b9 ^ seed; for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b ^ c, 2246822519); b ^= b >>> 13; } return ((a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0')); };
  const k = String(v), x = h(client + '|' + k, 1) + h(client + '|' + k, 2) + h(k + '|' + client, 3) + h(k, client);
  return x.slice(0, 8) + '-' + x.slice(8, 12) + '-5' + x.slice(13, 16) + '-a' + x.slice(17, 20) + '-' + x.slice(20, 32);
}
function saltUU(book, client) {
  const mapUU = (v) => saltUUValue(client, v);
  return book.map((b) => { const idx = (b.rows[0] || []).map((hd, i) => (/(^|>)[A-Za-z_]*_UU$/.test(String(hd)) ? i : -1)).filter((i) => i >= 0);
    return idx.length ? { name: b.name, rows: b.rows.map((r, ri) => (ri && r ? r.map((v, i) => (idx.indexOf(i) >= 0 && v !== '' && v != null ? mapUU(v) : v)) : r)) } : b; });
}

export function load(trx, book, open, salt) {   // salt: the form's own calls (every source: the UUs of a file are salted with the target tenant, legacy's <table>_uu_idx being global)
  if (salt) book = saltUU(book, Number(trx.env.client || 0));
  const rs = OB.resume(trx, book, open), stk = openingStockSheets(rs.book);
  if (stk) {   // the opening stock (I_Inventory rows stage 2 imports): imported rows equal to the file's lines = already there; pending rows = an earlier refused run's staging, replaced
    const C = Number(trx.env.client || 0), rows = trx.find('i_inventory', { ad_client_id: C }), imp = rows.filter((x) => String(x.i_isimported) === 'Y'), pen = rows.filter((x) => String(x.i_isimported) !== 'Y');
    if (imp.length && imp.length === stk.lines) { rs.book = rs.book.filter((b) => b.name !== stk.headSheet && b.name !== stk.lineSheet); rs.dropped[stk.lineSheet] = imp.length; }
    else if (!imp.length && pen.length) { pen.forEach((x) => trx.del('i_inventory', x)); rs.superseded[stk.lineSheet] = pen.length; }
  }
  const hb = heldByIdentifier(trx, rs.book);
  const pre = {}; Object.keys(hb.already).forEach((k) => { pre[k] = hb.already[k]; }); Object.keys(rs.dropped).forEach((k) => { pre[k] = (pre[k] || 0) + rs.dropped[k]; });
  if (Object.keys(hb.already).length) say(trx, '§MIG-HELD identifier rows already in this tenant ' + JSON.stringify(hb.already));
  const r0 = load2(trx, hb.book, open), already = Object.assign({}, pre, r0.already || {}); Object.keys(r0.already || {}).forEach((k) => { already[k] = (pre[k] || 0) + r0.already[k]; });
  return Object.assign(r0, { already, resumed: rs });
}
function load2(trx, book, open) {
  const sp = trx.setSavepoint(), mark = trx.log.length, r1 = loadOnce(trx, book, open);
  const held = new Set(trx.log.slice(mark).filter((l) => /^§MODEL-UNIQUE .* held_by=tenant$/.test(l)).map((l) => /key=(\(.*\)=\(.*\)) held_by=tenant$/.exec(l)[1]));
  const drop = {}; let n = 0;
  Object.keys(r1.refusals).forEach((sh) => r1.refusals[sh].forEach((t) => { const m = /^row (\d+)[\s\S]*duplicate key value[\s\S]*Key (\(.*\)=\(.*\)) already exists\./.exec(t);
    if (m && held.has(m[2])) { (drop[sh] = drop[sh] || new Set()).add(Number(m[1])); n++; } }));
  if (r1.ok || !n) return Object.assign(r1, { already: {} });
  trx.rollbackTo(sp);
  const st = openingStockSheets(book), names = {}; if (st) names[st.lineSheet] = 1;   // a stock line is never "already there" (rows of the rewritten I_Inventory sheet are not judged by a tenant key)
  const b2 = book.map((b) => (drop[b.name] && !names[b.name] ? { name: b.name, rows: b.rows.filter((row, i) => i === 0 || !drop[b.name].has(i + 1)) } : b));
  const r2 = loadOnce(trx, b2, open), already = {}; Object.keys(drop).forEach((sh) => { already[sh] = drop[sh].size; });
  say(trx, '§ODOO-FORM already-there rows=' + n + ' ' + JSON.stringify(already) + ' (their key is a row of this tenant: not loaded, the tenant\'s row is used) second load ok=' + r2.ok);
  return Object.assign(r2, { already });
}

// stage 2 (§E1): ImportInventory with DocAction CO over the I_Inventory rows stage 1 left. It must run AFTER stage 1 is committed: the process looks products / locators / warehouses up
//   by SQL (ImportInventory.java:221-298) and completes the documents, and neither sees rows that are still pending in the stage-1 transaction. A refusal is legacy's own: the row keeps
//   I_IsImported=N and I_ErrorMsg, the masters stay, and the same process can be run again from the window (Import Inventory).
export function completeOpeningStock(trx) {
  const C = Number(trx.env.client || 0), pend = trx.find('i_inventory', { ad_client_id: C }).filter((x) => String(x.i_isimported) !== 'Y').map((x) => x.i_inventory_id);
  if (!pend.length) { say(trx, '§E1-STOCK stage=2 nothing to import (no pending I_Inventory row): not judged'); return ''; }
  if (!AP.JAVA || !AP.JAVA['org.compiere.process.ImportInventory']) throw new Error('Opening stock needs Import Inventory (AD_Process ' + STOCK_PROCESS + '), which this host has not loaded.');
  const ri = AP.runInTrx(trx, STOCK_PROCESS, { params: { AD_Client_ID: C, AD_Org_ID: Number(trx.env.org || 0), DocAction: 'CO', DeleteOldImported: 'N' } });
  const done = pend.map((id) => trx.get('i_inventory', id)).filter(Boolean), good = done.filter((x) => String(x.i_isimported) === 'Y'), bad = done.filter((x) => String(x.i_isimported) !== 'Y');
  const heads = new Set(good.map((x) => x.m_inventory_id)), notCO = Array.from(heads).filter((id) => String((trx.get('m_inventory', id) || {}).docstatus) !== 'CO');
  say(trx, '§E1-STOCK stage=2 rows=' + pend.length + ' imported=' + good.length + ' errors=' + bad.length + ' headers=' + heads.size + ' completed=' + (heads.size - notCO.length) + ' process_ok=' + !!(ri && ri.ok)
    + ' cost=none-in-sheet (no cost adjustment; ImportInventory.java:546-564 not applicable, nothing invented)');
  if (!(ri && ri.ok) || bad.length || notCO.length)
    throw new Error('Opening stock was not completed: ' + (bad.length ? bad.length + ' row(s) refused by Import Inventory (' + String(bad[0].i_errormsg || '').trim() + ')' : (ri && ri.summary) || (notCO.length + ' inventory document(s) not Completed')) + '. The masters are loaded; fix the rows and run Import Inventory again.');
  return 'Opening stock completed: ' + heads.size + ' inventory document(s), ' + good.length + ' line(s).';
}

export const DESC = {
  title: 'Migrate from Odoo',
  emptyText: 'Pick odoo_export.json from the folder the Odoo agent wrote (node export.js). An older export: odoo_migration.xlsx + manifest.json.',
  params: [{ name: 'Files', label: 'Export file (odoo_export.json; an older export: odoo_migration.xlsx + manifest.json)', type: 'file', multiple: true, accept: '.xlsx,.json', mandatory: true }],
  columns: [{ key: 'item', label: 'Item' }, { key: 'odoo', label: 'Odoo rows' }, { key: 'infile', label: 'In file' }, { key: 'erpunit', label: 'ERP unit', type: 'string', editable: true }, { key: 'newcode', label: 'New unit code', type: 'string', editable: true },
    { key: 'will', label: 'Will import' }, { key: 'already', label: 'Already there' }, { key: 'refused', label: 'Refused' }, { key: 'reason', label: 'Why / effect' }, { key: 'needs', label: 'Needs' },
    { key: 'neededby', label: 'Needed by' }, { key: 'intenant', label: 'In this tenant now' }],
  rows(trx, params, current) {
    const p = plan(trx, params, current);
    const probRows = p.problems.map((t, i) => ({ key: 900 + i, item: '⚠ ' + t, selected: false, locked: true }));
    if (!p.book || p.problems.length) { say(trx, '§ODOO-FORM summary problems=' + p.problems.length + ' ' + JSON.stringify(p.problems)); return probRows.concat(p.units, p.sheets); }
    const will = p.open ? OB.willCreate(trx, p.open) : [];
    const dry = load(trx, p.book, p.open, true);   // the READ transaction: thrown away by the engine
    p.sheets.forEach((s) => { const inBook = p.book.some((b) => b.name === s.sheet), ref = dry.refusals[s.sheet] || [];
      s.will = !inBook ? 0 : dry.ok ? (dry.perTable[s.table.toUpperCase()] || 0) : 0; s.refused = ref.length; s.already = (dry.already || {})[s.sheet] || 0;
      if (s.already) s.reason = s.already + ' already in this tenant — kept as they are, not loaded' + (s.reason ? ' · ' + s.reason : '');
      if (ref.length) s.reason = (s.already ? s.reason + ' · ' : '') + ref[0] + (ref.length > 1 ? ' (+' + (ref.length - 1) + ' more)' : ''); else if (!inBook && !s.reason) s.reason = s.table === 'C_UOM' ? 'every unit maps to an ERP unit' : 'unticked'; });
    say(trx, '§ODOO-FORM summary ok=' + dry.ok + ' will=' + JSON.stringify(p.sheets.map((s) => s.table + ':' + s.will)) + ' refused=' + p.sheets.reduce((n, s) => n + s.refused, 0));
    const rs = p.units.concat(p.sheets);
    if (!p.source) return rs;
    const info = will.map((t, i) => ({ key: 930 + i, item: 'ℹ Will create (open balances need it): ' + t, selected: false, locked: true }));
    return withSourceRows(rs, p.source).concat(info);
  },
  // stage 2, run by the host after stage 1 is committed (AdFormGeneric.executeAfter): the opening stock (§E1), then the open balances (§E3C-SPEC 1(d): Import GL Journal → Complete,
  //   Import Invoice with DocAction CO, the books checked against the source)
  after(trx, params, rows) {
    const a = completeOpeningStock(trx), p = plan(trx, params, rows), b = OB.complete(trx, AP, p.open);
    return [a, b].filter(Boolean).join(' ');
  },
  run(trx, params, rows) {
    const p = plan(trx, params, rows);
    if (p.problems.length) throw new Error('Not migrated: ' + p.problems.join(' '));
    const r = load(trx, p.book, p.open, true);
    say(trx, '§ODOO-FORM run ok=' + r.ok + ' perTable=' + JSON.stringify(r.perTable));
    if (!r.ok) throw new Error(String(r.summary || 'The load was refused.'));
    const nAlready = Object.keys(r.already || {}).reduce((n, k) => n + (r.already[k] || 0), 0), nNew = Object.keys(r.shown).reduce((n, t) => n + (r.shown[t] > 0 ? r.shown[t] : 0), 0);
    if (!nNew && nAlready) { say(trx, '§MIG-NOTHING-TO-DO already=' + nAlready); return 'Nothing to do: all ' + nAlready + ' rows of this file are already in this company, so none was loaded again.'; }
    if (Object.keys(r.resumed && r.resumed.superseded || {}).length) say(trx, '§MIG-RESUME the pending staging rows of the earlier refused run were replaced by this file: ' + JSON.stringify(r.resumed.superseded));
    return 'Migrated from Odoo: ' + Object.keys(r.shown).filter((t) => r.shown[t] > 0).map((t) => t + ' ' + r.shown[t]).join(', ') + '.';
  }
};

// withSourceRows(rows, manifest) — a source converter (bc_/sap_migrate_convert.mjs) refuses some rows BEFORE the load (a bin without its location, a warehouse without a
//   country): the summary must still say so. Each manifest.refused entry is added to its sheet's row (refused + reason, 'not in the file'), and each manifest note becomes a
//   locked info row. Shared by every converter-backed form (one implementation).
export function withSourceRows(rows, manifest) {
  const m = manifest || {};
  (m.refused || []).forEach((r) => { const row = rows.find((x) => x.key > 100 && x.key < 900 && x.item === r.sheet); if (!row) return;
    row.refused = (Number(row.refused) || 0) + r.n; const why = 'not in the file: ' + r.n + ' — ' + r.why; row.reason = row.reason && row.reason !== 'unticked' ? row.reason + ' · ' + why : why; });
  const notes = (m.notes || []).slice(0, 40).map((t, i) => ({ key: 910 + i, item: 'ℹ ' + t, selected: false, locked: true }));
  return rows.concat(notes);
}

// bindProcess(ap) — the process engine plan/load run the Ninja loader through; a bundle that reuses plan/load (bc_migrate_form.mjs) binds it from its own ctx
export function bindProcess(ap) { AP = ap; }
export function activate(ctx) {
  AP = ctx.process;
  if (!ctx.form) throw new Error('odoo-migrate: the host injected no form engine (ctx.form)');
  ctx.form.register(CLASSNAME, DESC);
  console.log('§ODOO-FORM descriptor registered class=' + CLASSNAME);
}
