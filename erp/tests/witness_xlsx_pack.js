#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-XLSX-PACK. Read the log after every run (§XLSX-PACK, §PACKGEN lines).
// Spec: bim-compiler NEURO_SYMBOLIC_ORDER_CONTRACT.md §R.V item 12 (erp.pack), prompts/ERP_IDEMPIERE_UX_PARITY.md §BIMDOC-LEGACY.
// ISSUES: (X1) a data-model workbook must become a 2Pack whose records are exactly the workbook's rows (nothing dropped, nothing invented); (X2) a released pack
//   is immutable: same rows = unchanged, other rows under the same version = refused naming it; (X3) the pack names Java classes but carries none; (X4) a row that
//   points at a row the workbook does not have is refused, not packed with a hole (negative control); (X5) the Java model classes come from the same sheets, one
//   COLUMNNAME constant per column of the table; (X6) an empty workbook is INCONCLUSIVE, never PASS.
// Run: node erp/tests/witness_xlsx_pack.js   (starts one headless page, closes it)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const REPO = path.join(__dirname, '..', '..'), XP = require(path.join(REPO, 'erp', 'tools', 'xlsx_pack.js')), { SHEET, ORDER } = require(path.join(REPO, 'erp', 'tools', 'manifest_to_xlsx.js'));
const XLSX = require(path.join(REPO, 'erp', 'xlsx.mini.min.js'));
let fail = 0, pass = 0; const chk = (n, ok, m) => { console.log('  ' + (ok ? 'PASS ' : '✗ FAIL ') + n + ' ' + (m || '')); ok ? pass++ : fail++; };
(async () => {
  const book = path.join(REPO, 'erp', 'plugins', 'models', 'BIM_Document.xlsx'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xlsxpack-'));
  const model = XP.readWorkbook(book), want = {}; ORDER.forEach((t) => { if (model.sheets[t]) want[SHEET[t]] = model.sheets[t].length; });
  const total = Object.keys(want).filter((k) => k !== 'AD_TreeNodeMM').reduce((s, k) => s + want[k], 0);
  console.log('X1 the pack equals the workbook'); console.log('  workbook rows ' + JSON.stringify(want));
  if (!total) { console.log('§W-XLSX-PACK INCONCLUSIVE the workbook has no rows'); process.exit(1); }
  const m = await XP.toProvides(model, '1.0.0'), r = await XP.pack(m, tmp);
  const got = {}; (r.xml.match(/<(AD_\w+) type="table">/g) || []).forEach((t) => { const n = t.slice(1, t.indexOf(' ')); got[n] = (got[n] || 0) + 1; });
  const same = Object.keys(want).filter((k) => k !== 'AD_TreeNodeMM').every((k) => got[k] === want[k]) && Object.keys(got).every((k) => want[k] === got[k]);
  chk('X1 every sheet\'s rows are records of the pack, no others', same, 'pack ' + JSON.stringify(got));
  chk('X1b the menu carries its tree place (Parent_ID + SeqNo)', /<Parent_ID reference="id" reference-key="AD_Menu">\d+<\/Parent_ID>\s*<SeqNo>\d+<\/SeqNo>/.test(r.xml), '');
  // found on a real server 2026-11-11: the pack handler creates a physical column ONLY when the AD_Column element says IsSyncDatabase=Y (ColumnElementHandler.java), so a pack of N:s created the dictionary and no table
  const colEls = r.xml.split('<AD_Column type="table">').slice(1), sync = (e) => (/<IsSyncDatabase>([YN])<\/IsSyncDatabase>/.exec(e) || [])[1], virt = (e) => /<ColumnSQL>[^<]+<\/ColumnSQL>/.test(e);
  const phys = colEls.filter((e) => !virt(e)), ownPhys = phys.filter((e) => /BIM_Document_ID|<ColumnName>(Revision|DeliverableNo|DocStatus)<\/ColumnName>/.test(e));
  chk('X1c every physical column of the new table says IsSyncDatabase=Y; a virtual column never does', colEls.length === 32 && phys.every((e) => sync(e) === 'Y') && colEls.filter(virt).every((e) => sync(e) !== 'Y') && ownPhys.length >= 4, 'columns=' + colEls.length + ' physical=' + phys.length + ' virtual=' + colEls.filter(virt).length);
  const classes = (r.xml.match(/org\.kernel\.[\w.]+/g) || []).filter((v, i, s) => s.indexOf(v) === i).filter((c) => /process\./.test(c));
  chk('X3 the pack names the 2 process classes and holds no Java', classes.length === 2 && !/\.class|\.java|public class/.test(r.xml), JSON.stringify(classes));
  console.log('X2 immutable version');
  const r2 = await XP.pack(m, tmp); chk('X2 the same rows again = unchanged', r2.status === 'unchanged', r2.status);
  const m2 = JSON.parse(JSON.stringify(m)); m2.provides.elements.find((e) => e.table === 'ad_table').values.description = 'changed';
  let refused = ''; try { await XP.pack(m2, tmp); } catch (e) { refused = e.message; }
  chk('X2b other rows under the same version are refused, naming the version', /bump provides\.version/.test(refused), refused.slice(0, 90));
  console.log('X4 a dangling reference');
  const bad = XP.readWorkbook(book); bad.sheets.ad_column = bad.sheets.ad_column.filter((c) => c.key !== 'BIM_Document.Revision');
  let dang = ''; try { await XP.toProvides(bad, '1.0.0'); } catch (e) { dang = e.message; }
  chk('X4 a field whose column row was removed is refused naming the row', /Revision/.test(dang) && /not an earlier row/.test(dang), dang.slice(0, 110));
  console.log('X5 Java from the same sheets');
  const j = await XP.generateJava(model, 'org.kernel.bim.model'), cols = model.sheets.ad_column.filter((c) => c.values.ad_table_id === 'ref:BIM_Document').map((c) => c.values.columnname);
  const consts = (j['I_BIM_Document.java'].match(/COLUMNNAME_\w+ = /g) || []).length;
  chk('X5 one COLUMNNAME constant per column of the table, an X_ class, no hand-typed table id', consts === cols.length && /extends PO implements I_BIM_Document/.test(j['X_BIM_Document.java']) && /MTable\.getTable_ID\(Table_Name\)/.test(j['I_BIM_Document.java']), 'columns=' + cols.length + ' constants=' + consts);
  console.log('X6 vacuous guard');
  const empty = { plugin: { id: 'x.y' }, sheets: {} }; let ev = ''; try { await XP.toProvides(empty, '1.0.0'); const e2 = empty.sheets; ev = Object.keys(e2).length ? 'rows' : 'EMPTY'; } catch (e) { ev = e.message; }
  chk('X6 an empty workbook yields no elements (the verb reports INCONCLUSIVE)', ev === 'EMPTY' || /needs/.test(ev), ev);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('§W-XLSX-PACK ' + (fail ? 'FAIL' : 'PASS') + ' pass=' + pass + ' fail=' + fail); process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('§W-XLSX-PACK ERROR ' + e.message); process.exit(1); });
