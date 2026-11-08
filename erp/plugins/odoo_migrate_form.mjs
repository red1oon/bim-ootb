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
  const out = { problems: [], units: [], sheets: [], book: null };
  const files = (params && params.Files) || [];
  const wbf = files.find((f) => /\.xlsx?$/i.test(f.name)), mf = files.find((f) => /manifest\.json$/i.test(f.name));
  if (!wbf) out.problems.push('Pick the workbook odoo_migration.xlsx from your export folder.');
  if (!mf) out.problems.push('Pick manifest.json from the same folder (it proves nothing was dropped or made up).');
  if (!AP || !AP.JAVA || !AP.JAVA['org.idempiere.ninja.process.MigrateExcelData'] || !trx.q("SELECT 1 AS x FROM ad_process WHERE ad_process_id=? AND isactive='Y'", [NINJA_PROCESS]).length)
    out.problems.push('Start the plugin "Ninja data migration" first (Plugins & Releases): this form loads through it.');
  if (!wbf || !mf) return out;
  const wb = wbf.data, man = mf.data;
  let book = wb.SheetNames.map((n) => ({ name: n, rows: sheetRows(wb.Sheets[n]) }));
  // manifest == what was picked (the export's own count of every sheet)
  if (man.workbook && man.workbook !== wbf.name) out.problems.push('The manifest is for ' + man.workbook + ', not ' + wbf.name + '.');
  const mSheets = man.sheets || [];
  mSheets.forEach((m) => { const s = book.find((b) => b.name === m.sheet);
    if (!s) out.problems.push('Sheet ' + m.sheet + ' is in the manifest but not in the workbook.');
    else if (s.rows.length - 1 !== m.rows) out.problems.push('Sheet ' + m.sheet + ' has ' + (s.rows.length - 1) + ' rows; the manifest says ' + m.rows + '.'); });
  book.forEach((b) => { if (!mSheets.some((m) => m.sheet === b.name)) out.problems.push('Sheet ' + b.name + ' is not in the manifest.'); });
  const cur = {}; (current || []).forEach((r) => { cur[r.key] = r; });

  // units the products use, with the user's answer (or an exact-name suggestion)
  const uom = book.find((b) => tableOfSheet(b.name).toUpperCase() === 'C_UOM'), used = {};
  book.forEach((b) => { const i = b.rows[0].findIndex((h) => String(h).split('>')[0] === 'C_UOM_ID'); if (i >= 0) b.rows.slice(1).forEach((r) => { if (r[i] !== '') used[r[i]] = (used[r[i]] || 0) + 1; }); });
  const answers = {};
  Object.keys(used).sort().forEach((u, i) => {
    const key = i + 1, given = cur[key] && cur[key].erpunit != null ? String(cur[key].erpunit).trim() : null;
    const exact = trx.q("SELECT name FROM c_uom WHERE name=? AND ad_client_id IN (0,?) AND isactive='Y'", [u, trx.env.client || 0]);
    const ans = given != null ? given : exact.length === 1 ? exact[0].name : '';
    let note = '';
    if (ans) { const hit = trx.q("SELECT count(*) AS n FROM c_uom WHERE name=? AND ad_client_id IN (0,?) AND isactive='Y'", [ans, trx.env.client || 0])[0].n;
      if (hit === 1) answers[u] = { to: ans }; else note = hit ? 'more than one ERP unit is called "' + ans + '"' : 'no ERP unit is called "' + ans + '"'; }
    else note = 'answer which ERP unit this is';
    out.units.push({ key, item: 'Unit: ' + u, infile: used[u] + ' product(s)', erpunit: ans, reason: note, selected: true, locked: true, lockedBy: 'a unit is answered, not unticked' });
  });

  // selection + dependencies (mandatory lookups lock their parent; optional ones are dropped when the parent is unticked)
  const tables = book.map((b) => tableOfSheet(b.name).toUpperCase());
  const sel = {}; book.forEach((b, i) => { const k = 101 + i; sel[b.name] = cur[k] ? !!cur[k].selected : true; });
  const edges = [];
  book.forEach((b) => { const t = tableOfSheet(b.name); b.rows[0].forEach((h, hi) => { const col = String(h).split('>')[0]; if (!/_ID$/i.test(col)) return;
    const lt = lookupTable(trx, t, col); if (!lt || lt === t.toUpperCase()) return; const pi = tables.indexOf(lt); if (pi < 0) return;
    edges.push({ child: b.name, parent: book[pi].name, col: col, hi: hi, mandatory: isMandatory(trx, t, col) }); }); });
  const lockedBy = {};
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

// load(trx, book) -> { ok, summary, perTable{T: n}, refusals{sheet: [reasons]} } — the Ninja loader in THIS transaction
export function load(trx, book) {
  putFile(FILE, bookToWorkbook(book));
  const mark = trx.log.length;
  let r;
  try { r = AP.runInTrx(trx, NINJA_PROCESS, { params: { File_Directory: FILE, Processed: 'Y' } }); } finally { dropFile(FILE); }
  const lines = trx.log.slice(mark), refusals = {}, perTable = {};
  lines.forEach((l) => { const m = /^§NINJA-ERR (\d\d[A-Za-z_]+) row (\d+)(.*)$/.exec(l); if (m) (refusals[m[1]] = refusals[m[1]] || []).push('row ' + m[2] + m[3]); });
  const shown = {};
  String(r && r.summary || '').replace(/\(([A-Za-z_]+) = (\d+) records\)/g, (x, t, n) => { perTable[t.toUpperCase()] = Number(n); shown[t] = Number(n); return x; });
  return { ok: !!(r && r.ok), summary: r && r.summary, perTable, shown, refusals };
}

export const DESC = {
  title: 'Migrate from Odoo',
  emptyText: 'Pick odoo_migration.xlsx and manifest.json from the folder the Odoo agent wrote (node export.js).',
  params: [{ name: 'Files', label: 'Export files (odoo_migration.xlsx + manifest.json)', type: 'file', multiple: true, accept: '.xlsx,.json', mandatory: true }],
  columns: [{ key: 'item', label: 'Item' }, { key: 'odoo', label: 'Odoo rows' }, { key: 'infile', label: 'In file' }, { key: 'erpunit', label: 'ERP unit', type: 'string', editable: true },
    { key: 'will', label: 'Will import' }, { key: 'refused', label: 'Refused' }, { key: 'reason', label: 'Why / effect' }, { key: 'needs', label: 'Needs' },
    { key: 'neededby', label: 'Needed by' }, { key: 'intenant', label: 'In this tenant now' }],
  rows(trx, params, current) {
    const p = plan(trx, params, current);
    const probRows = p.problems.map((t, i) => ({ key: 900 + i, item: '⚠ ' + t, selected: false, locked: true }));
    if (!p.book || p.problems.length) { say(trx, '§ODOO-FORM summary problems=' + p.problems.length + ' ' + JSON.stringify(p.problems)); return probRows.concat(p.units, p.sheets); }
    const dry = load(trx, p.book);   // the READ transaction: thrown away by the engine
    p.sheets.forEach((s) => { const inBook = p.book.some((b) => b.name === s.sheet), ref = dry.refusals[s.sheet] || [];
      s.will = !inBook ? 0 : dry.ok ? (dry.perTable[s.table.toUpperCase()] || 0) : 0; s.refused = ref.length;
      if (ref.length) s.reason = ref[0] + (ref.length > 1 ? ' (+' + (ref.length - 1) + ' more)' : ''); else if (!inBook && !s.reason) s.reason = s.table === 'C_UOM' ? 'every unit maps to an ERP unit' : 'unticked'; });
    say(trx, '§ODOO-FORM summary ok=' + dry.ok + ' will=' + JSON.stringify(p.sheets.map((s) => s.table + ':' + s.will)) + ' refused=' + p.sheets.reduce((n, s) => n + s.refused, 0));
    return p.units.concat(p.sheets);
  },
  run(trx, params, rows) {
    const p = plan(trx, params, rows);
    if (p.problems.length) throw new Error('Not migrated: ' + p.problems.join(' '));
    const r = load(trx, p.book);
    say(trx, '§ODOO-FORM run ok=' + r.ok + ' perTable=' + JSON.stringify(r.perTable));
    if (!r.ok) throw new Error(String(r.summary || 'The load was refused.'));
    return 'Migrated from Odoo: ' + Object.keys(r.shown).filter((t) => r.shown[t] > 0).map((t) => t + ' ' + r.shown[t]).join(', ') + '.';
  }
};

export function activate(ctx) {
  AP = ctx.process;
  if (!ctx.form) throw new Error('odoo-migrate: the host injected no form engine (ctx.form)');
  ctx.form.register(CLASSNAME, DESC);
  console.log('§ODOO-FORM descriptor registered class=' + CLASSNAME);
}
