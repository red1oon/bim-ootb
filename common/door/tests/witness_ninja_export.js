// ⚠ DO NOT REMOVE — W-NINJA-EXPORT (bim-compiler prompts/ERP_MIS_WINDOW_FROM_CSV.md §12.11: ninja.export). READ THE LOG; an exit code is not evidence.
//   E1 ISSUE (the file says something the system does not hold: a Master link, a column, a type or a list value is lost or invented) · E2 ISSUE (the round trip: the exported file does not make the same shape, or an edit of it is not made)
//   E3 ISSUE (the file holds rows, overwrites a file, exports "everything", or exports a table that is the system's own)
//   Falsifiers: NINJAEXPORT_BREAK=nomaster (must FAIL E1, E2) · nolists (must FAIL E1). A claim with nothing to judge says INCONCLUSIVE, never PASS.
//   Run: node common/door/tests/witness_ninja_export.js > common/door/tests/logs/ninja_export.log 2>&1
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { kit, tmp, ROOT, DOOR } = require('./_kit');
const k = kit('W-NINJA-EXPORT'), BRK = process.env.NINJAEXPORT_BREAK || '';
(async () => {
  const dir = path.dirname(tmp('nw_'));
  const PW = path.join(ROOT, 'common/door/samples/Ninja_Practice.xlsx');
  if (!fs.existsSync(PW)) { k.incon('F1-F7', 'common/door/samples/Ninja_Practice.xlsx is not in this checkout'); return k.end(); }
  fs.copyFileSync(PW, path.join(dir, 'Ninja_Practice.xlsx'));
  fs.writeFileSync(path.join(dir, 'WF_Claim.csv'), 'Column,Type,Length,Mandatory\nName,String,60,Y\nAmount,Amount,,\n');
  const envOf = (n) => Object.assign({ BIM_OBJECT_OPLOG: path.join(dir, n + '.ops.jsonl'), BIM_DOOR_JOURNAL: path.join(dir, n + '.j.jsonl') }, BRK ? { NINJAEXPORT_BREAK: BRK } : {});
  const nops = (e) => { try { return fs.readFileSync(e.BIM_OBJECT_OPLOG, 'utf8').split('\n').filter(Boolean).length; } catch (x) { return 0; } };
  const doorE = (e, actor) => (line) => new Promise((res) => { let o = ''; const p = cp.spawn(process.execPath, [DOOR, '--actor', actor || 'human', line], { cwd: dir, env: Object.assign({}, process.env, e), stdio: ['ignore', 'pipe', 'ignore'] }); p.stdout.on('data', d => { o += d; });
    p.on('close', () => { let j = null; try { j = JSON.parse(o.split('\n').filter(l => l.charAt(0) === '{').pop()); } catch (x) { /* null */ } res(j || { status: 'unparseable', why: o.slice(-300) }); }); });
  const E1 = envOf('one'), door = doorE(E1), ok = (j) => j && j.status === 'ok', ref = (j, re) => j && j.status === 'refused' && re.test(String(j.why));
  const sq = (q) => JSON.parse(cp.spawnSync('sqlite3', ['-readonly', '-json', path.join(ROOT, 'erp/ad_seed.db'), q], { encoding: 'utf8' }).stdout || '[]');
  const E = require(path.join(ROOT, 'common/door/erp_cli.js'));
  const image = async (e) => { const old = process.env.BIM_OBJECT_OPLOG; process.env.BIM_OBJECT_OPLOG = e.BIM_OBJECT_OPLOG; const w = process.stderr.write; process.stderr.write = () => true; try { return await E.boot({}); } finally { process.stderr.write = w; if (old == null) delete process.env.BIM_OBJECT_OPLOG; else process.env.BIM_OBJECT_OPLOG = old; } };
  const NM = require(path.join(ROOT, 'erp/ninja_model.js')), NCr = require(path.join(ROOT, 'erp/ninja_create.js')), XL = require(path.join(ROOT, 'erp/xlsx.mini.min.js')), EC = E;
  const modelOf = (file) => { const wb = XL.read(fs.readFileSync(path.join(dir, file)), { type: 'buffer' }), pick = NCr.pickModelSheet(wb), hdr = wb.Sheets['1_RO_ModelHeader'] ? EC.sheetGrid(XL, wb.Sheets['1_RO_ModelHeader']) : [];
    const P = NM.parseSheet(EC.sheetGrid(XL, wb.Sheets[pick.name]), { format: pick.format, bundleName: hdr[1] && hdr[1][0] ? String(hdr[1][0]).trim() : '' }); return { m: P.model || P, wb }; };
  const norm = (m) => m.tables.map(t => t.name + '|master=' + (t.master || '') + '|' + t.columns.filter(c => !c.isStandard && !(t.master && c.name === t.master + '_ID')).map(c => c.name + ':' + c.refId + (c.listValues && c.listValues.length ? '=' + c.listValues.join('/') : '')).join(',')).join('\n');
  const st = await door('ninja.exec file=Ninja_Practice.xlsx data=N'); if (!ok(st)) { k.incon('E1-E3', 'the practice workbook did not stage: ' + st.why); return k.end(); }
  const orig = modelOf('Ninja_Practice.xlsx').m, ex = await door('ninja.export bundle=Practice file=Practice_out.xlsx'); if (!ok(ex)) { k.incon('E1-E3', 'the export did not run: ' + ex.why); return k.end(); }
  const back = modelOf('Practice_out.xlsx'), a = norm(orig), b = norm(back.m);
  k.L('original\n' + a); k.L('exported\n' + b);
  k.chk('E1 the exported workbook, read by the parser ninja.exec uses, holds the same tables, Master links, column names, reference types and list values as the sheet that made the bundle (' + orig.tables.length + ' tables, compared field by field)', a === b && orig.tables.length === 5 && /BloodGroup:17=/.test(b) && /master=C_BPartner/.test(b), a === b ? 'identical · lists=' + ex.answer.lists : 'DIFFERENT (see the two models above)');
  // ── E2 the round trip, and an edit of the file
  const E2 = envOf('two'), d2 = doorE(E2); fs.copyFileSync(path.join(dir, 'Practice_out.xlsx'), path.join(dir, 'Round.xlsx'));
  const r1 = await d2('ninja.exec file=Round.xlsx data=N'), shapeOf = (j) => j && j.answer && j.answer.tables ? j.answer.tables.map(t => t.table + '|' + (t.master || '') + '|' + t.lists.join()).join(';') : '', same = ok(r1) && shapeOf(r1) === shapeOf(st);
  const wsn = back.wb.Sheets['2_RO_ModelMaker'], grid = EC.sheetGrid(XL, wsn), ci = grid[0].indexOf('ColumnSet'), ni = grid[0].indexOf('Name'), row = grid.findIndex(r => r[ni] === 'PR_Room');
  grid[row][ci] = grid[row][ci] + ',Y#IsOpenNow'; const wb2 = XL.utils.book_new(); XL.utils.book_append_sheet(wb2, XL.utils.aoa_to_sheet(EC.sheetGrid(XL, back.wb.Sheets['1_RO_ModelHeader'])), '1_RO_ModelHeader'); XL.utils.book_append_sheet(wb2, XL.utils.aoa_to_sheet(grid), '2_RO_ModelMaker');
  fs.writeFileSync(path.join(dir, 'Edited.xlsx'), Buffer.from(XL.write(wb2, { bookType: 'xlsx', type: 'array' })));
  const E3 = envOf('three'), d3 = doorE(E3), r2 = await d3('ninja.exec file=Edited.xlsx data=N'), O3 = ok(r2) ? await image(E3) : null, made = O3 ? O3.rows("SELECT c.columnname AS n, c.ad_reference_id AS r FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE t.tablename='PR_Room' AND c.columnname='IsOpenNow' AND c.isactive='Y'") : [];
  k.chk('E2 the exported file run by ninja.exec on a fresh door makes the same shape (tables, Master links, lists); after an edit of the file (a yes-no column added to PR_Room) the run makes that column', same && ok(r2) && made.length === 1 && Number(made[0].r) === 20, 'round: ' + r1.status + ' same shape=' + same + ' ' + String(r1.why || '').slice(0, 100) + ' · edited: ' + r2.status + ' ' + String(r2.why || '').slice(0, 100) + ' · IsOpenNow=' + JSON.stringify(made));
  // ── E3 the model only; never overwritten; a selector is required; the system's own table is refused
  const n0 = nops(E1), ov = await door('ninja.export bundle=Practice file=Practice_out.xlsx'), none = await door('ninja.export file=x1.xlsx'), two = await door('ninja.export bundle=Practice table=PR_Visit file=x2.xlsx'), core = await door('ninja.export table=C_Order file=x3.xlsx'), unk = await door('ninja.export bundle=Nope file=x4.xlsx'), noext = await door('ninja.export bundle=Practice file=x5.csv'), n1 = nops(E1);
  const sheets = back.wb.SheetNames, wrote = ['x1', 'x2', 'x3', 'x4', 'x5'].some(n => fs.existsSync(path.join(dir, n + '.xlsx')) || fs.existsSync(path.join(dir, n + '.csv')));
  k.chk('E3 the file holds the model only (sheets: ' + sheets.join(', ') + ') and the answer says the rows are not written; an existing file is refused; no selector is refused with legacy\'s rule; two selectors, a system table, an unknown bundle and a non-workbook name are refused; none of the refusals writes a file or an op',
    sheets.join() === '1_RO_ModelHeader,2_RO_ModelMaker' && /rows are not written/.test((ex.answer.notMade || [])[0] || '') && ref(ov, /never overwritten/) && ref(none, /Choose something/) && ref(two, /only one of/) && ref(core, /came with the system/) && ref(unk, /no active staged bundle/) && ref(noext, /\.xlsx/) && !wrote && n1 === n0,
    'overwrite: ' + ov.status + ' · none: ' + none.status + ' · two: ' + two.status + ' · core: ' + core.status + ' · unknown: ' + unk.status + ' · ext: ' + noext.status + ' · files=' + wrote + ' · ops ' + n0 + '->' + n1);
  const E4 = envOf('ai'), ai = await doorE(E4, 'ai')('ninja.export bundle=Practice file=ai.xlsx'), V = JSON.parse(fs.readFileSync(path.join(ROOT, 'common/door/verbs.json'), 'utf8')).verbs.filter(v => v.verb === 'ninja.export')[0];
  k.chk('E4 the vocabulary entry is generated and names its witness; an AI\'s line is a claim and writes no file', ai.status === 'claim' && !fs.existsSync(path.join(dir, 'ai.xlsx')) && !!V && V.witness === 'common/door/tests/witness_ninja_export.js', 'ai=' + ai.status + ' · entry=' + JSON.stringify(V && { harm: V.harm, witness: V.witness }));
  k.end();
})().catch(e => { console.log('§W-NINJA-EXPORT ERROR ' + e.stack); process.exit(2); });
