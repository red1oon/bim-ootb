// ⚠ DO NOT REMOVE — W-MIS-ADD (bim-compiler prompts/ERP_MIS_WINDOW_FROM_CSV.md §10: mis.add_window at the door). READ THE LOG; an exit code is not evidence.
//   A1 ISSUE (the door stages something else than the Ninja stager) · A2 ISSUE (the window is gone after a restart) · A3 ISSUE (a staged window nobody can edit: the M0 gaps)
//   A4 ISSUE (a new window is visible to nobody under a role) · A5 ISSUE (the same sheet gets different identities on two machines) · A6 ISSUE (a refusal leaves something written)
//   A7 ISSUE (a dry run writes; an AI adds a window without a person) · A8 ISSUE (the terminal screen is dead on a table with no rows, so the first record cannot be made)
//   Falsifiers: ADDWIN_BREAK=nofield (must FAIL A1) · notable (A2) · bare (A3, A4, A5). Each claim can say VACUOUS / INCONCLUSIVE.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { kit, tmp, run, ROOT, DOOR } = require('./_kit');
const k = kit('W-MIS-ADD');
(async () => {
  const dir = path.dirname(tmp('aw_')), brk = process.env.ADDWIN_BREAK ? { ADDWIN_BREAK: process.env.ADDWIN_BREAK } : {};
  const SHEET = 'Column,Type,Length,Mandatory,Identifier,Default,List,Lookup,Callout,Help\nName,String,60,Y,Y,,,,,Its name\nPurchaseDate,Date,,,,,,,,When it was bought\nCost,Amount,,,,,,,,\nCondition,List,,,,GOOD,"GOOD=Good,FAIR=Fair,POOR=Poor",,,\nC_BPartner_ID,,,,,,,,,Supplier\nIsInsured,,,,,,,,,\n';
  fs.writeFileSync(path.join(dir, 'AST_Asset.csv'), SHEET); fs.writeFileSync(path.join(dir, 'AST_Other.csv'), SHEET); fs.writeFileSync(path.join(dir, 'C_Order.csv'), SHEET);
  fs.writeFileSync(path.join(dir, 'AST_Bad.csv'), 'Column,Type,Length\nCost,Money,\nName,String,long\nAST_Bad_UU,,\n');
  const envOf = (n) => Object.assign({ BIM_OBJECT_OPLOG: path.join(dir, n + '.ops.jsonl'), BIM_DOOR_JOURNAL: path.join(dir, n + '.j.jsonl') }, brk);
  const nops = (e) => { try { return fs.readFileSync(e.BIM_OBJECT_OPLOG, 'utf8').split('\n').filter(Boolean).length; } catch (x) { return 0; } };
  const ops = (e) => { try { return fs.readFileSync(e.BIM_OBJECT_OPLOG, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch (x) { return []; } };
  const doorE = (e, actor) => (line) => new Promise((res) => { let o = ''; const p = cp.spawn(process.execPath, [DOOR, '--actor', actor || 'human', line], { cwd: dir, env: Object.assign({}, process.env, e), stdio: ['ignore', 'pipe', 'ignore'] }); p.stdout.on('data', d => { o += d; }); p.on('close', () => { let j = null; try { j = JSON.parse(o); } catch (x) { /* null */ } res(j || { status: 'unparseable', why: o.slice(0, 120) }); }); });
  const E1 = envOf('one'), door = doorE(E1), ok = (j) => j && j.status === 'ok', ref = (j, re) => j && j.status === 'refused' && re.test(String(j.why));
  const sq = (q) => JSON.parse(cp.spawnSync('sqlite3', ['-readonly', '-json', path.join(ROOT, 'erp/ad_seed.db'), q], { encoding: 'utf8' }).stdout || '[]');
  // ── A7a dry
  const dry = await door('mis.add_window file=AST_Asset.csv dry=Y');
  k.chk('A7a dry=Y writes nothing and names the six columns of the sheet', ok(dry) && dry.answer.dry === true && dry.answer.columns.map(c => c.name).join() === 'Name,PurchaseDate,Cost,Condition,C_BPartner_ID,IsInsured' && nops(E1) === 0, 'columns=' + (dry.answer && dry.answer.columns || []).map(c => c.name).join() + ' ops=' + nops(E1));
  // ── A6 refusals (before anything is staged)
  const r1 = await door('mis.add_window file=../AST_Asset.csv'), r2 = await door('mis.add_window file=AST_Bad.csv'), r3 = await door('mis.add_window file=C_Order.csv'), r4 = await door('mis.add_window file=AST_Asset.csv master=C_Order');
  const add = await door('mis.add_window file=AST_Asset.csv'), n1 = nops(E1), r5 = await door('mis.add_window file=AST_Asset.csv');
  k.chk('A6 refusals write nothing: a file outside the folder; a faulty sheet with its three faults listed (lines 2, 3, 4); a core table name; master=; and, once staged, the same table again', ref(r1, /leaves it/) && ref(r2, /^3 faults/) && /line 2 /.test(r2.why) && /line 3 /.test(r2.why) && /line 4 /.test(r2.why) && ref(r3, /already exists in the dictionary/) && ref(r4, /master= is not built/) && ok(add) && ref(r5, /already a window/) && nops(E1) === n1, [r1, r2, r3, r4, r5].map(x => x.status).join(',') + ' | ' + String(r2.why).slice(0, 110) + ' | ops after add=' + n1 + ' after the repeat=' + nops(E1));
  if (!ok(add)) { k.incon('A1-A8', 'the window could not be staged: ' + add.why); return k.end(); }
  k.L('staged ' + JSON.stringify(add.answer.opSummary) + ' window=' + add.answer.window.id + ' sha256=' + add.answer.sha256.slice(0, 12));
  // ── A1 the door's rows = the Ninja stager's rows on an untouched copy of the seed, in the columns the stager writes
  const WR = { ad_window: ['ad_window_id', 'name', 'description', 'windowtype', 'isactive'], ad_table: ['ad_table_id', 'tablename', 'name', 'description', 'ad_window_id', 'isactive'], ad_tab: ['ad_tab_id', 'ad_window_id', 'name', 'ad_table_id', 'tablevel', 'seqno', 'isactive'],
    ad_column: ['ad_column_id', 'ad_table_id', 'columnname', 'name', 'description', 'ad_reference_id', 'iskey', 'isparent', 'callout', 'isactive'], ad_field: ['ad_field_id', 'ad_tab_id', 'ad_column_id', 'name', 'seqno', 'isreadonly', 'isactive'], ad_menu: ['ad_menu_id', 'name', 'description', 'issummary', 'action', 'ad_window_id', 'isactive'] };
  const SQL = await require(path.join(ROOT, 'common/lib/sql-wasm.js'))({ wasmBinary: fs.readFileSync(path.join(ROOT, 'common/lib/sql-wasm.wasm')) }), ref0 = new SQL.Database(fs.readFileSync(path.join(ROOT, 'erp/ad_seed.db')));
  const NS = require(path.join(ROOT, 'erp/ninja_stage.js')), NC = require(path.join(ROOT, 'erp/ninja_csv.js')), XL = require(path.join(ROOT, 'erp/xlsx.mini.min.js')), model = NC.fromText(SHEET, XL, { table: 'AST_Asset' }).model;
  const lg = console.log; console.log = () => {}; try { NS.stageModels(ref0, model, 0); } finally { console.log = lg; }
  const refRows = (t) => { const st = ref0.prepare('SELECT * FROM ' + t + ' WHERE ' + t + '_id>=' + NS.NINJA_BASE + " AND isactive='Y' ORDER BY " + t + '_id'), out = []; while (st.step()) { const r = st.getAsObject(), l = {}; Object.keys(r).forEach(c => { l[c.toLowerCase()] = r[c]; }); out.push(l); } st.free(); return out; };
  const mine = ops(E1).filter(o => o.op_type === 'CRUD_CREATE'), audit = /^(created|createdby|updated|updatedby)$/i, colNm = {}; refRows('ad_column').forEach(c => { colNm[c.ad_column_id] = c.columnname; });
  const inSeed = (t, id) => sq('SELECT 1 AS x FROM ' + t + ' WHERE ' + t + '_id=' + id).length > 0, react = ops(E1).filter(o => o.op_type === 'CRUD_UPDATE' && o.changes && o.changes.isactive && o.changes.isactive.new === 'Y').map(o => o.table + ':' + o.id);
  let reactOk = true;
  const a1 = Object.keys(WR).map(t => { let want = refRows(t); if (t === 'ad_field') want = want.filter(r => !audit.test(colNm[r.ad_column_id]));   // §10: no field for the four audit columns (core TabCreateFields L99)
    want = want.filter(r => { if (!inSeed(t, r[t + '_id'])) return true; if (react.indexOf(t + ':' + r[t + '_id']) < 0) reactOk = false; return false; });   // a row the seed already holds (the menu's summary node, inactive) is REACTIVATED by an update op, not created
    const got = mine.filter(o => o.table === t).map(o => o.fields).sort((x, y) => x[t + '_id'] - y[t + '_id']), pick = (r) => JSON.stringify(WR[t].map(c => r[c] == null ? null : r[c]));
    return { t, want: want.length, got: got.length, same: want.length === got.length && want.every((r, i) => pick(r) === pick(got[i])) }; });
  k.L('A1 ' + a1.map(x => x.t + ' ' + x.got + '/' + x.want + (x.same ? '' : ' DIFFERS')).join(' · '));
  if (!a1.some(x => x.want > 0)) k.incon('A1', 'VACUOUS: the stager made no row');
  else k.chk('A1 the door stages what the Ninja stager stages: for each of the six dictionary tables the door\'s rows equal the stager\'s own rows on an untouched seed, in every column the stager writes (the four audit-column fields left out, as core does; the menu summary node the seed already holds is reactivated)', a1.every(x => x.same && x.want > 0) && reactOk && react.length >= 1, 'reactivated=' + react.join(',') + ' ' + a1.filter(x => !x.same).map(x => x.t + ' ' + x.got + '/' + x.want).join(' '));
  // ── A2 a fresh process has the window, the table and the rows
  const l0 = await door('mis.list kind=AST_Asset'), nw = await door('mis.new kind=AST_Asset Name=Tractor Cost=1200.50'), l1 = await door('mis.list kind=AST_Asset columns=Name,Cost,Condition'), rd = nw.answer ? await door('mis.read kind=AST_Asset id=' + nw.answer.id) : {};
  k.chk('A2 it survives a restart: separate processes on the same op-log list the kind (empty), create a record, list it with its default (Condition GOOD) and read it back', l0 && l0.answer && l0.answer.total === 0 && ok(nw) && ok(l1) && l1.answer.total === 1 && l1.answer.rows[0].Name === 'Tractor' && l1.answer.rows[0].Condition === 'GOOD' && ok(rd) && rd.answer.record.name === 'Tractor', 'empty list: ' + (l0 && l0.status) + ' new: ' + nw.status + ' ' + String(nw.why || '').slice(0, 80) + ' rows=' + JSON.stringify(l1.answer && l1.answer.rows));
  // ── A3 a working window: the M0 gaps, each
  const ds = await door('mis.describe kind=AST_Asset'), P = (n) => ds.answer ? ds.answer.properties.filter(p => p.name === n)[0] || {} : {}, sheetCols = ['Name', 'PurchaseDate', 'Cost', 'Condition', 'C_BPartner_ID', 'IsInsured'];
  const noName = await door('mis.new kind=AST_Asset Cost=5'), up = nw.answer ? await door('mis.update kind=AST_Asset id=' + nw.answer.id + ' Cost=99 Condition=FAIR') : {}, unk = await door('mis.list kind=NoSuchKind_X');
  const mis = (e, args, keys) => cp.spawnSync(process.execPath, [path.join(ROOT, 'common/door/mis.js')].concat(args, ['--plain']), { cwd: dir, input: keys, encoding: 'utf8', env: Object.assign({}, process.env, e) }).stdout || '';
  const scr = mis(E1, ['kind=AST_Asset'], 'Enter\nEsc\nEsc\n'), form = scr.slice(scr.indexOf('Edit AST_Asset')), fields = form.split('\n').filter(l => /^( > |   )[* ] \S/.test(l)).length;
  k.chk('A3 a working window: describe shows the six sheet columns updateable, Name mandatory with its length and help, Condition with its three values, the key and the audit columns not updateable; mis.new without Name is refused naming it; mis.update changes two columns; the Edit form has fields (' + fields + '), none of them the key, the UU or an audit column',
    ok(ds) && sheetCols.every(c => P(c).updateable === true) && P('Name').mandatory === true && P('Name').length === 60 && P('Name').help === 'Its name' && JSON.stringify(P('Condition').values) === '["FAIR","GOOD","POOR"]' && P('AST_Asset_ID').updateable === false && P('Created').updateable === false && P('AST_Asset_ID').displayed === false && P('AST_Asset_UU').displayed === false
    && ref(noName, /mandatory.*Name/) && ok(up) && up.answer.changed.includes('cost') && up.answer.changed.includes('condition') && /Edit AST_Asset/.test(scr) && fields >= 6 && !/AST Asset UU|Created|Updated|AST Asset ID/.test(form.split('type to fill')[0]),
    'updateable=' + sheetCols.filter(c => P(c).updateable === true).length + '/6 name=' + JSON.stringify({ m: P('Name').mandatory, l: P('Name').length }) + ' values=' + JSON.stringify(P('Condition').values) + ' noName=' + noName.status + ' update=' + up.status + ' ' + String(up.why || '').slice(0, 60) + ' fields=' + fields);
  // ── A4 under a role
  const roles = sq("SELECT ad_role_id AS id FROM ad_role WHERE isactive='Y' AND ismanual='N'").map(r => r.id).sort((a, b) => a - b), acc = mine.filter(o => o.table === 'ad_window_access').map(o => o.fields.ad_role_id).sort((a, b) => a - b);
  const g102 = await door('mis.list kind=AST_Asset role=102'), n103 = await door('mis.new kind=AST_Asset Name=Plough role=103'), u103 = n103.answer ? await door('mis.update kind=AST_Asset id=' + n103.answer.id + ' Cost=7 role=103') : {}, g103 = await door('mis.list kind=AST_Asset role=103');
  k.chk('A4 under a role: the window has one access row per active non-manual role (' + roles.length + ', independent count); role 102 lists, role 103 creates, changes and lists records of the new kind', roles.length > 0 && JSON.stringify(acc) === JSON.stringify(roles) && ok(g102) && g102.answer.total >= 1 && ok(n103) && ok(u103) && ok(g103) && g103.answer.total >= 2, 'access rows=' + acc.length + '/' + roles.length + ' 102 list=' + g102.status + ' 103 new=' + n103.status + ' update=' + u103.status + ' ' + String(n103.why || u103.why || g102.why || '').slice(0, 110));
  // ── A5 the same sheet gives the same UUs on another machine (a second, separate op-log); another table name gives others
  const E2 = envOf('two'), E3 = envOf('three'); await doorE(E2)('mis.add_window file=AST_Asset.csv'); await doorE(E3)('mis.add_window file=AST_Other.csv');
  const uus = (e) => ops(e).filter(o => o.op_type === 'CRUD_CREATE' && /^ad_/.test(o.table)).map(o => { const c = Object.keys(o.fields).filter(x => /_uu$/.test(x))[0]; return o.table + ':' + (c ? o.fields[c] : 'NONE'); });
  const u1 = uus(E1).filter(x => !/^ad_treenodemm/.test(x)), u2 = uus(E2).filter(x => !/^ad_treenodemm/.test(x)), u3 = uus(E3).filter(x => !/^ad_treenodemm/.test(x)), UU = /:[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  if (!u1.length) k.incon('A5', 'VACUOUS: no dictionary op');
  else k.chk('A5 the same sheet gives the same UUs: ' + u1.length + ' staged dictionary rows carry a version-5 UU, equal row for row on a second op-log; a sheet staged under another table name shares none of them', u1.every(x => UU.test(x)) && JSON.stringify(u1) === JSON.stringify(u2) && u3.length === u1.length && !u3.some(x => u1.indexOf(x) >= 0), 'with a UU ' + u1.filter(x => UU.test(x)).length + '/' + u1.length + ' equal=' + (JSON.stringify(u1) === JSON.stringify(u2)) + ' shared with the other table=' + u3.filter(x => u1.indexOf(x) >= 0).length);
  // ── A7b an AI's line is a claim; the vocabulary entry
  const E4 = envOf('ai'), ai = await doorE(E4, 'ai')('mis.add_window file=AST_Asset.csv'), V = JSON.parse(fs.readFileSync(path.join(ROOT, 'common/door/verbs.json'), 'utf8')).verbs.filter(v => v.verb === 'mis.add_window')[0];
  k.chk('A7b an AI\'s mis.add_window is held as a claim, nothing written; the vocabulary entry is generated, harm writes, dictionary true, human+ai', ai.status === 'claim' && nops(E4) === 0 && !!V && V.harm === 'writes' && V.dictionary === true && V.actors.join() === 'human,ai', 'ai=' + ai.status + ' ops=' + nops(E4) + ' entry=' + JSON.stringify(V && { harm: V.harm, dictionary: V.dictionary }));
  // ── A8 the terminal screen on a table with no rows
  const E5 = envOf('scr'); await doorE(E5)('mis.add_window file=AST_Asset.csv');
  const s5 = mis(E5, ['kind=AST_Asset'], '+\n=Harrow\nEnter\ny\nEsc\n'), made = await doorE(E5)('mis.list kind=AST_Asset columns=Name');
  k.chk('A8 the screen opens on a table with no rows (it says so and offers New), and + with a name makes the first record', /no AST_Asset record yet/.test(s5) && /-> mis\.new kind=AST_Asset Name=Harrow$/m.test(s5) && ok(made) && made.answer.total === 1 && made.answer.rows[0].Name === 'Harrow', 'empty note=' + /no AST_Asset record yet/.test(s5) + ' rows=' + JSON.stringify(made.answer && made.answer.rows));
  return k.end();
})().catch(e => { console.log('§W-MIS-ADD ERROR ' + e.stack); process.exit(2); });
