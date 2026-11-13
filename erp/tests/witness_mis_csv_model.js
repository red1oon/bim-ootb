// ⚠ DO NOT REMOVE — W-MIS-CSV-MODEL + W-MIS-CSV-REFUSE (bim-compiler prompts/ERP_MIS_WINDOW_FROM_CSV.md §9: the properties CSV becomes the Ninja model). READ THE LOG; an exit code is not evidence.
//   CM1 ISSUE (a CSV means something else than the same table in a Ninja workbook) · CM2 ISSUE (a property of the sheet is lost, or lands on the wrong column) · CM3 ISSUE (007 arrives as 7)
//   CM4 ISSUE (master / workflow inputs are ignored) · CR1 ISSUE (a bad sheet gives a model) · CR2 ISSUE (only the first fault is told) · CR3 ISSUE (a stated type is silently replaced by the name rule)
//   CR4 ISSUE (the reader grew a file or database dependency and cannot run in the page)
//   Falsifiers: MISCSV_BREAK=droplist (must FAIL CM1) · coerce (must FAIL CM3) · lenient (must FAIL CR1). Each claim can say VACUOUS.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), C = require(path.join(ROOT, 'erp/ninja_csv.js')), NM = require(path.join(ROOT, 'erp/ninja_model.js')), XL = require(path.join(ROOT, 'erp/xlsx.mini.min.js'));
const brk = process.env.MISCSV_BREAK || '';
let pass = 0, fail = 0, inc = 0;
const L = (m) => console.log('§W-MIS-CSV ' + m), chk = (n, ok, info) => { ok ? pass++ : fail++; console.log('  ' + (ok ? '✅' : '❌') + ' ' + n + (info ? '  ' + info : '')); }, incon = (id, why) => { inc++; L('INCONCLUSIVE ' + id + ' — ' + why); };
const HEAD = 'Column,Type,Length,Mandatory,Identifier,Default,List,Lookup,Callout,Help';
const read = (body, o) => C.fromText(HEAD + '\n' + body, XL, Object.assign({ table: 'AST_Asset', brk }, o || {}));
const core = (c) => ({ name: c.name, refId: c.refId, isStandard: !!c.isStandard, fkTable: c.fkTable || null, listValues: c.listValues || null, callout: c.callout || null });

// ── CM1: the spec's own example (§3.2) against the hand-written workbook row
const EX = 'Name,String,60,Y,Y,,,,,\nPurchaseDate,Date,,,,,,,,When it was bought\nCost,Amount,,,,,,,,\nCondition,List,,,,GOOD,"GOOD=Good,FAIR=Fair,POOR=Poor",,,\nC_BPartner_ID,,,,,,,,,Supplier\nIsInsured,,,,,,,,,\nNotes,Text,,,,,,,org.x.CalloutAsset.notes,\n';
const ex = read(EX);
const wb = NM.parseSheet([['RO_ModelHeader_ID', 'SeqNo', 'WorkflowStructure', 'KanbanBoard', 'Master', 'Name', 'Help', 'ColumnSet'], ['AST', '10', 'N', 'N', '', 'AST_Asset', '', 'S#Name,D#PurchaseDate,A#Cost,L#Condition=GOOD/FAIR/POOR,C_BPartner_ID,IsInsured,T#Notes@org.x.CalloutAsset.notes']], {});
const a = ex.model ? ex.model.tables[0].columns.map(core) : [], b = wb.tables[0].columns.map(core);
L('CM1 csv columns=' + a.length + ' workbook columns=' + b.length + ' refusals=' + JSON.stringify(ex.refusals) + ' warnings=' + JSON.stringify(wb.warnings));
if (!b.length) incon('CM1', 'VACUOUS: the workbook row gave no column');
else chk('CM1 same model as the workbook: the ' + b.length + ' columns of the CSV model equal the columns parseSheet gives for the equivalent 2_RO_ModelMaker row (name, refId, isStandard, fkTable, listValues, callout), and the bundle is the prefix', ex.ok && JSON.stringify(a) === JSON.stringify(b) && ex.model.bundleName === 'AST' && ex.model.tables[0].name === 'AST_Asset' && !wb.warnings.length, 'first difference: ' + JSON.stringify(a.filter((x, i) => JSON.stringify(x) !== JSON.stringify(b[i]))[0] || null));
// ── CM2: the additive keys, each on its own column and nowhere else
const cm = read('Name,String,60,Y,Y,,,,,Its name\nSupplier_ID,,,,,,,C_BPartner,,\nCondition,List,,,,GOOD,"GOOD=Good,FAIR=Fair",,,\nCost,Amount,,,,,,,,\n'), col = (n) => cm.model ? cm.model.tables[0].columns.filter(c => c.name === n)[0] : {};
const KEYS = ['length', 'mandatory', 'identifier', 'defaultValue', 'help', 'listNames'], plain = cm.model ? cm.model.tables[0].columns.filter(c => c.name === 'Cost' || c.isStandard) : [];
chk('CM2 the additive keys: Length, Mandatory, Identifier, Help land on Name; Default and the list names on Condition; Lookup makes Supplier_ID point at C_BPartner; Cost and the standard columns carry none. Properties carried: ' + (ex.carried.length > cm.carried.length ? ex.carried.length : cm.carried.length) + ' of 10 by one sheet, ' + [...new Set(ex.carried.concat(cm.carried))].length + ' of 10 over the two',
  cm.ok && col('Name').length === 60 && col('Name').mandatory === true && col('Name').identifier === true && col('Name').help === 'Its name' && col('Condition').defaultValue === 'GOOD' && JSON.stringify(col('Condition').listNames) === '["Good","Fair"]' && JSON.stringify(col('Condition').listValues) === '["GOOD","FAIR"]' && col('Supplier_ID').fkTable === 'C_BPartner' && col('Supplier_ID').refId === NM.DT.TableDir && plain.length > 5 && plain.every(c => KEYS.every(k => !(k in c))) && [...new Set(ex.carried.concat(cm.carried))].length === 10,
  'carried=' + [...new Set(ex.carried.concat(cm.carried))].join(',') + ' refusals=' + JSON.stringify(cm.refusals));
// ── CM3: text stays text. MEASURED 2026-11-13 on erp/xlsx.mini.min.js: without raw the library types 007 as the number 7 and 2026-11-10 as a date serial; its formatted text keeps "007" and "1e5"
//    but turns the date into "11/10/26". So the value that shows the trap in this reader is a date; 007 and 1e5 are kept as the cases the spec names.
const tx = read('Code,String,,,,007,,,,\nGrade,List,,,,,"1e5=High,007=Low",,,\nSince,Date,,,,2026-11-10,,,,\n'), tc = tx.model ? tx.model.tables[0].columns : [], dv = (n) => (tc.filter(c => c.name === n)[0] || {}).defaultValue;
chk('CM3 text stays text: the defaults 007 and 2026-11-10 and the list values 1e5 and 007 arrive as written', tx.ok && dv('Code') === '007' && dv('Since') === '2026-11-10' && JSON.stringify((tc.filter(c => c.name === 'Grade')[0] || {}).listValues) === '["1e5","007"]', 'defaults=' + JSON.stringify([dv('Code'), dv('Since')]) + ' values=' + JSON.stringify((tc.filter(c => c.name === 'Grade')[0] || {}).listValues));
// ── CM4: master and workflow from the line's inputs
const md = read('Task,String,,,,,,,,\n', { table: 'AST_Maintenance', master: 'AST_Asset', workflow: 'Y' }), mc = md.model ? md.model.tables[0] : { columns: [] }, names = mc.columns.map(c => c.name);
chk('CM4 master and workflow: the model carries master AST_Asset with its link column, and the five workflow columns', md.ok && mc.master === 'AST_Asset' && mc.workflow === true && names.includes('AST_Asset_ID') && ['DocStatus', 'DocAction', 'Processed', 'DocumentNo', 'IsApproved'].every(n => names.includes(n)) && (mc.columns.filter(c => c.name === 'AST_Asset_ID')[0] || {}).fkTable === 'AST_Asset', 'columns=' + names.filter(n => !/^(AD_|Is|Created|Updated)/.test(n)).join(','));
// ── CR1: one sheet per refusal class; the refusal must name the row and the heading, and there is no model
const existing = (t) => ({ c_order: 'D', ast_old: 'U' })[t.toLowerCase()] || null;
const CASES = [
  ['no Column heading', () => C.fromText('Name,Type\nx,String\n', XL, { table: 'AST_A', brk }), 1, 'Name'],
  ['unknown heading', () => C.fromText('Column,Colour\nx,red\n', XL, { table: 'AST_A', brk }), 1, 'Colour'],
  ['heading twice', () => C.fromText('Column,Type,type\nx,String,String\n', XL, { table: 'AST_A', brk }), 1, 'Type'],
  ['empty column name', () => read(',String,,,,,,,,\n'), 2, 'Column'],
  ['bad column name', () => read('My Name,String,,,,,,,,\n'), 2, 'Column'],
  ['column twice', () => read('Cost,Amount,,,,,,,,\ncost,Amount,,,,,,,,\n'), 3, 'Column'],
  ['standard column listed', () => read('AST_Asset_ID,,,,,,,,,\n'), 2, 'Column'],
  ['workflow column listed', () => read('DocStatus,,,,,,,,,\n', { workflow: 'Y' }), 2, 'Column'],
  ['unknown type', () => read('Cost,Money,,,,,,,,\n'), 2, 'Type'],
  ['type the name overrules', () => read('IsoCode,String,,,,,,,,\n'), 2, 'Type'],
  ['list values on a non-list', () => read('Cost,Amount,,,,,"A=a,B=b",,,\n'), 2, 'List'],
  ['list with no values', () => read('Grade,List,,,,,,,,\n'), 2, 'List'],
  ['list value with a slash', () => read('Grade,List,,,,,"A/B=x",,,\n'), 2, 'List'],
  ['lookup on a non-ID column', () => read('Supplier,,,,,,,C_BPartner,,\n'), 2, 'Lookup'],
  ['length not a number', () => read('Name,String,long,,,,,,,\n'), 2, 'Length'],
  ['mandatory not Y/N', () => read('Name,String,,maybe,,,,,,\n'), 2, 'Mandatory'],
  ['identifier not Y/N', () => read('Name,String,,,yes,,,,,\n'), 2, 'Identifier'],
  ['callout not class.method', () => read('Name,String,,,,,,,notacallout,\n'), 2, 'Callout'],
  ['bad table name', () => read('Name,String,,,,,,,,\n', { table: 'my table' }), 0, 'table'],
  ['a core table name', () => read('Name,String,,,,,,,,\n', { table: 'C_Order', existing }), 0, 'table']
];
const res = CASES.map(([what, f, row, column]) => { const r = f(), hit = r.refusals.some(x => x.row === row && x.column === column); return { what, ok: hit && r.model === null && r.ok === false, got: r.refusals.map(x => x.row + ':' + x.column).join(' ') + (r.model ? ' MODEL RETURNED' : '') }; });
const shown = res.filter(x => x.ok).length, userT = read('Name,String,,,,,,,,\n', { table: 'AST_Old', existing });
res.forEach(x => L('CR1 ' + (x.ok ? 'ok   ' : 'MISS ') + x.what + ' -> ' + x.got));
chk('CR1 every refusal class: ' + shown + ' of ' + CASES.length + ' faulty sheets are refused naming the row and the heading, with no model; a table that exists as a user-made one (entity type U) is not refused', shown === CASES.length && userT.ok === true, res.filter(x => !x.ok).map(x => x.what + ' [' + x.got + ']').join(' | '));
// ── CR2: all at once
const three = read('Cost,Money,,,,,,,,\nName,String,long,,,,,,,\nAST_Asset_UU,,,,,,,,,\n');
chk('CR2 all at once: a sheet with three different faults lists three refusals (lines 2, 3, 4), not the first only', three.refusals.length === 3 && [2, 3, 4].every(n => three.refusals.some(x => x.row === n)) && three.model === null, three.refusals.map(x => x.row + ':' + x.column).join(' '));
// ── CR3: the name rule is the grammar's own, for every type word
const TRAPS = { String: 'IsoCode', Quantity: 'IsQuick', Amount: 'QtyOwed', YesNo: 'QtyFlag', Date: 'IsDue', DateTime: 'StartDate', Text: 'AmtNote', List: 'IsKind' };
const PF = { String: 'S', Quantity: 'Q', Amount: 'A', YesNo: 'Y', Date: 'D', DateTime: 'd', Text: 'T', List: 'L' }, NAMEOF = (id) => Object.keys(NM.DT).filter(k => NM.DT[k] === id)[0];
const tr = Object.keys(TRAPS).map(w => { const r = read(TRAPS[w] + ',' + w + ',,,,,' + (w === 'List' ? '"A=a"' : '') + ',,,\n'), g = NM.parseColDef(PF[w] + '#' + TRAPS[w], []), x = r.refusals.filter(y => y.column === 'Type')[0]; return { w, ok: !!x && r.model === null && new RegExp('becomes ' + NAMEOF(g.refId) + ' ').test(x.why) && g.refId !== NM.parseColDef(PF[w] + '#X', []).refId, why: x ? x.why.slice(0, 70) : 'NOT REFUSED' }; });
// Quantity has no name the grammar overrules (its test comes first): a word with no trap is stated, not counted as shown
const trapped = tr.filter(x => x.ok), untrap = tr.filter(x => !x.ok).map(x => x.w);
tr.forEach(x => L('CR3 ' + x.w + ' with ' + TRAPS[x.w] + ' -> ' + x.why));
if (!trapped.length) incon('CR3', 'VACUOUS: no type word has a name the grammar overrules');
else chk('CR3 the name rule is the grammar\'s: for ' + trapped.length + ' of 8 type words a column name the grammar overrules is refused, naming the type parseColDef itself returns; the words with no such name: ' + (untrap.join(', ') || 'none'), untrap.every(w => w === 'Quantity') && trapped.length >= 7, '');
// ── CR4: pure
const src = fs.readFileSync(path.join(ROOT, 'erp/ninja_csv.js'), 'utf8').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n'), reqs = (src.match(/require\(([^)]*)\)/g) || []);
chk('CR4 pure: the reader requires only ninja_model.js and names no fs, path, process, child_process or database call', reqs.length === 1 && /ninja_model\.js/.test(reqs[0]) && !/\b(fs|child_process)\b|process\.|\.prepare\(|\.exec\(|db\.run/.test(src), 'requires=' + JSON.stringify(reqs));
const v = fail ? 'FAIL' : inc ? 'INCONCLUSIVE' : 'PASS';
console.log('§WITNESS_MIS_CSV_MODEL pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + ' verdict=' + v + (brk ? ' MISCSV_BREAK=' + brk : ''));
process.exit(fail ? 1 : 0);
