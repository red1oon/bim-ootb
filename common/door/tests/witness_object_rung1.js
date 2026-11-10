#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-OBJ-REG, W-OBJ-GENERIC, W-OBJ-DESCRIBE, W-OBJ-UU, W-OBJ-SHADOW, W-OBJ-DOOR (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §0.8). READ THE §-LOG after every run.
 * No browser, no GPU. The model is the PUBLIC Duplex; the object engine is the ERP's own (erp/model_layer.js, ad_attachment.js, crud_core.js) run over the model's OWN sql.js handle.
 *   W-OBJ-REG      ISSUE: the dictionary turning into a memory cost. The patch with the §OBJ_DICT section vs the same patch without it: every data table has the same rows; the only new tables are the
 *                  dictionary's; the size delta is measured and printed. Applying twice changes nothing (idempotent); the old chunker fails on the second apply (so the skip is what makes it idempotent).
 *                  A plant that adds a data row makes the judge say FAIL. "Free" is claimed only for the dictionary rows, never for opening the file.
 *   W-OBJ-DESCRIBE ISSUE: reflection that guesses. `object.describe` lists exactly the AD_Column rows (independent SQL count + names); a physical column with no dictionary row is NOT listed; an unknown kind
 *                  is an error naming it; a plant that drops a property makes the judge say FAIL.
 *   W-OBJ-UU       ISSUE: identity lost. read and update by `<table>_uu` keep the key (guid) unchanged; the op addresses the record by that key; attach writes Record_UU = that key and no numeric id.
 *                  Falsifier: ad_attachment.js with the _uu rule stripped makes attach refuse "No Key".
 *   W-OBJ-GENERIC  ISSUE: per-table special cases. Three kinds (element, storey/space, building) get update + attach + history through ONE engine; the engine files name none of the model's tables (grep 0 hits);
 *                  a plant that names one is caught; an unedited record has 0 history entries (the 1+ of an edited one is not vacuous).
 *   W-OBJ-SHADOW   ISSUE: two dictionaries colliding. The ERP's dictionary and a model's dictionary, loaded in one process, give a table of the SAME NAME each its own key, in either order; the old (name-only) cache shadows.
 *   W-OBJ-DOOR     ISSUE: the verbs not being the door's. The five object verbs run through the door; a human write is ok with an op, an AI write is a claim with nothing written.
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const { kit, tmp, ROOT } = require('./_kit');
const k = kit('W-OBJ');
const SJ = (p) => path.join(ROOT, p);
const HOME_DB = [process.env.FIXTURE_DB, path.join(os.homedir(), 'bim-ootb', 'buildings', 'Duplex_extracted.db'), path.join(ROOT, 'buildings', 'Duplex_extracted.db')].filter(Boolean).filter(f => fs.existsSync(f))[0];
const OTHER_DB = [process.env.FIXTURE_DB_B, '/home/red1/Projects/bim-compiler/deploy/buildings/Duplex_extracted.db'].filter(Boolean).filter(f => fs.existsSync(f))[0];
const PATCH = SJ('buildings/patches/Duplex_extracted.db.sql');
const BEGIN = '-- ═══ §OBJ_DICT begin', END = '-- ═══ §OBJ_DICT end';
const DICT = ['ad_table', 'ad_column', 'ad_reference', 'ad_ref_list', 'ad_window', 'ad_tab', 'ad_field', 'ad_attachment'];
const MODEL_TABLES = ['elements_meta', 'element_transforms', 'spatial_structure', 'project_metadata'];

(async () => {
  if (!HOME_DB) { k.incon('FIXTURE', 'no Duplex_extracted.db found (set FIXTURE_DB)'); return k.end(); }
  const SQL = await require(SJ('common/lib/sql-wasm.js'))({ wasmBinary: fs.readFileSync(SJ('common/lib/sql-wasm.wasm')) });
  const O = require('../object_cli.js');
  const chunk = O.loadChunker();
  const patchText = fs.readFileSync(PATCH, 'utf8'), b = patchText.indexOf(BEGIN), e = patchText.indexOf(END);
  k.chk('PATCH has exactly one §OBJ_DICT section', b > 0 && e > b && patchText.indexOf(BEGIN, b + 1) < 0, 'bytes=' + (e - b));
  const without = patchText.slice(0, b) + patchText.slice(patchText.indexOf('\n', e) + 1);
  const rowsOf = (db, sql) => { const r = db.exec(sql); return r.length ? r[0].values : []; };
  const tables = (db) => rowsOf(db, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map(r => r[0].toLowerCase());   // the dictionary DDL is the ERP seed's own (CamelCase); SQLite names are case-insensitive
  const counts = (db) => Object.fromEntries(tables(db).map(t => [t, rowsOf(db, 'SELECT count(*) FROM "' + t + '"')[0][0]]));
  const sizeOf = (db) => rowsOf(db, 'PRAGMA page_count')[0][0] * rowsOf(db, 'PRAGMA page_size')[0][0];
  const open = (f) => new SQL.Database(fs.readFileSync(f));

  // ════════ W-OBJ-REG ════════
  const A = open(HOME_DB); chunk(A, without);
  const B = open(HOME_DB); const res1 = chunk(B, patchText);
  const cA = counts(A), cB = counts(B), newTables = Object.keys(cB).filter(t => !(t in cA)), sizeA = sizeOf(A), sizeB = sizeOf(B);
  const judgeReg = (before, after, added) => {
    const data = Object.keys(before), same = data.filter(t => before[t] === after[t]), changed = data.filter(t => before[t] !== after[t]);
    return { ok: data.length > 0 && !changed.length && added.every(t => DICT.indexOf(t) >= 0), n: data.length, changed, rows: data.reduce((s, t) => s + before[t], 0) };
  };
  const j = judgeReg(cA, cB, newTables);
  k.L('REG data tables=' + j.n + ' data rows=' + j.rows + ' changed=[' + j.changed.join(',') + '] new tables=[' + newTables.join(',') + '] statements=' + res1.statements);
  k.L('REG size without=' + sizeA + ' B, with=' + sizeB + ' B, delta=' + (sizeB - sizeA) + ' B (' + (100 * (sizeB - sizeA) / sizeA).toFixed(2) + '% of the file; sql.js holds the whole file in memory, so this is the heap proxy)');
  const dictRows = Object.fromEntries(DICT.map(t => [t, cB[t]]));
  k.L('REG dictionary rows ' + JSON.stringify(dictRows));
  if (!j.n || !j.rows) k.incon('REG', 'no data rows were judged');
  else k.chk('REG every data table has the same rows with and without the dictionary; only dictionary tables are new', j.ok, 'changed=' + j.changed.join(',') + ' new=' + newTables.join(','));
  k.chk('REG the dictionary rows are present (5 kinds: 4 tables + the Room view, window/tab/field rows)', cB.ad_table === 5 && cB.ad_window === 4 && cB.ad_tab === 5 && cB.ad_column > 20 && cB.ad_field === cB.ad_column, JSON.stringify(dictRows));
  // plant: a patch that adds a data row must be seen
  const P = open(HOME_DB); chunk(P, patchText); P.run("INSERT INTO elements_meta (guid, ifc_class) VALUES ('PLANT','IfcWall')");
  const jp = judgeReg(cA, counts(P), newTables); k.chk('REG falsifier: a plant that adds an element row makes the judge say FAIL', !jp.ok && jp.changed.indexOf('elements_meta') >= 0, 'changed=' + jp.changed.join(','));
  // idempotence
  const before2 = JSON.stringify(counts(B)), logs = []; const lg = console.log; console.log = (...a) => { logs.push(a.join(' ')); };
  let res2, err2 = null; try { res2 = chunk(B, patchText); } catch (x) { err2 = x; } console.log = lg;
  k.chk('REG applying the patch a second time raises nothing and changes no row count', !err2 && JSON.stringify(counts(B)) === before2, 'err=' + (err2 && err2.message) + ' skipLog=' + logs.filter(l => /PATCH_ADDCOL_SKIP/.test(l)).join('|'));
  k.chk('REG the second apply reported 4 skipped ALTERs (the 5th, on the table the patch drops and recreates itself, is legitimately added again)', logs.some(l => /§PATCH_ADDCOL_SKIP 4 /.test(l)), logs.join('|'));
  // the OLD chunker cannot do it. Pinned to 4f9f8203^, the commit before this rung's chunker change (bim-ootb #2772): 'origin/main' held the old
  // chunker only until #2772 merged; after that this falsifier compared the new chunker with itself and failed on every DB (found 2026-11-10 by the OCI patch gate).
  let oldErr = null;
  try {
    const old = cp.execSync('git -C ' + JSON.stringify(ROOT) + ' show 4f9f8203^:viewer/scene.js', { maxBuffer: 1 << 28 }).toString(), a0 = old.indexOf('A._runSqlChunked = function(db, sql) {'), b0 = old.indexOf('\n  };', a0), AA = {};
    new Function('A', old.slice(a0, b0 + 5))(AA); AA._runSqlChunked(open(HOME_DB), patchText + '\n' + patchText.slice(b, e));   // dictionary section twice = the second ALTERs repeat
  } catch (x) { oldErr = x; }
  k.chk('REG falsifier: the pre-change chunker throws "duplicate column name" on a repeated patch', !!oldErr && /duplicate column name/i.test(oldErr.message), 'err=' + (oldErr && oldErr.message));
  // a second Duplex version: the patch must apply to it too (it has its own spatial_structure)
  if (OTHER_DB) { const C = open(OTHER_DB); const cC = counts(C); let e3 = null; try { chunk(C, patchText); } catch (x) { e3 = x; } const cD = counts(C);
    k.chk('REG the patch also applies to the older 1,122-element Duplex; its element rows are unchanged', !e3 && cD.elements_meta === cC.elements_meta && cD.ad_table === 5, 'elements=' + cC.elements_meta + '->' + cD.elements_meta + ' err=' + (e3 && e3.message)); }
  else k.incon('REG-B', 'no second Duplex version on this machine');
  // generated columns: sql.js accepted them and they equal the key
  const gen = rowsOf(B, 'SELECT count(*), sum(elements_meta_uu = guid) FROM elements_meta')[0];
  k.chk('REG the generated key column equals guid on every element row', gen[0] > 0 && gen[0] === gen[1], 'rows=' + gen[0] + ' equal=' + gen[1]);
  const gen2 = rowsOf(B, 'SELECT count(*), sum(element_transforms_uu = guid), sum(elements_meta_uu = guid) FROM element_transforms')[0];
  k.chk('REG the transform table carries its own key and the link to its element', gen2[0] > 0 && gen2[0] === gen2[1] && gen2[0] === gen2[2], 'rows=' + gen2[0]);

  // fixture dir for the CLI: a copy of the model + the patch beside it, so the loader convention is used as shipped
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obj1_')); fs.mkdirSync(path.join(dir, 'patches'));
  const FIX = path.join(dir, 'Duplex_extracted.db'); fs.copyFileSync(HOME_DB, FIX); fs.copyFileSync(PATCH, path.join(dir, 'patches', 'Duplex_extracted.db.sql'));
  const OPLOG = path.join(dir, 'ops.jsonl'); process.env.BIM_OBJECT_OPLOG = OPLOG; process.env.VIEWER_BLD_DIR = dir;
  const cli = (argv) => { const r = cp.spawnSync(process.execPath, [SJ('common/door/object_cli.js')].concat(argv, ['--db', FIX, '--oplog', OPLOG]), { encoding: 'utf8' }); let out = null; try { out = JSON.parse(r.stdout); } catch (x) { /* not json */ } return { code: r.status, out, err: r.stderr }; };

  // ════════ W-OBJ-DESCRIBE ════════
  const D0 = B;   // an independent reader: the patched model, read by plain SQL
  const kinds = rowsOf(D0, "SELECT name, ad_table_id, tablename FROM ad_table WHERE ad_table_uu IS NOT NULL ORDER BY ad_table_id");
  let judged = 0;
  const judgeDesc = (d, id) => {
    const want = rowsOf(D0, 'SELECT columnname FROM ad_column WHERE ad_table_id=' + id + " AND isactive='Y' ORDER BY ad_column_id").map(r => r[0]);
    return d && d.properties && d.properties.length === want.length && d.properties.map(p => p.name).join(',') === want.join(',');
  };
  for (const [name, id, tbl] of kinds) {
    const r = cli(['describe', '--kind', name]); judged++;
    k.chk('DESCRIBE ' + name + ' lists exactly its AD_Column rows (independent SQL count + names)', r.code === 0 && judgeDesc(r.out, id), 'exit=' + r.code + ' props=' + (r.out && r.out.properties && r.out.properties.length) + ' table=' + tbl);
  }
  if (!judged) k.incon('DESCRIBE', 'no kinds judged');
  const el = cli(['describe', '--kind', 'Element']);
  const listVals = (n) => (el.out.properties.filter(p => p.name === n)[0] || {}).values || [];
  const wantDisc = rowsOf(D0, "SELECT value FROM ad_ref_list WHERE ad_reference_id=(SELECT ad_reference_value_id FROM ad_column WHERE columnname='discipline' AND ad_table_id=(SELECT ad_table_id FROM ad_table WHERE tablename='elements_meta')) ORDER BY value").map(r => r[0]);
  k.chk('DESCRIBE the discipline list values equal the AD_Ref_List rows', wantDisc.length > 0 && listVals('discipline').join(',') === wantDisc.join(','), 'values=' + listVals('discipline').join(','));
  k.chk('DESCRIBE the element carries its transform as a single-row child tab linked by the _uu key', el.out.childTabs.length === 1 && el.out.childTabs[0].single === true && el.out.childTabs[0].link === 'elements_meta_uu', JSON.stringify(el.out.childTabs));
  k.chk('DESCRIBE the legal methods follow the dictionary (key + updateable columns + _UU key + IsChangeLog)', el.out.methods.join(',') === 'read,update,attach,history' && el.out.highVolume === true, el.out.methods.join(','));
  const tr = cli(['describe', '--kind', 'Element Transform']);
  k.chk('DESCRIBE the child kind has no child tab of its own and a read-only-by-key shape', tr.out.childTabs.length === 0 && tr.out.properties.some(p => p.parent), 'children=' + tr.out.childTabs.length);
  const unk = cli(['describe', '--kind', 'Nope']);
  k.chk('DESCRIBE an unknown kind is an error that names it and lists the registered kinds', unk.code === 1 && /unknown kind "Nope"/.test(unk.err) && /Element/.test(unk.err), 'exit=' + unk.code);
  // does it read the dictionary, or guess from the table? a physical column with no dictionary row must not appear
  { const S = open(FIX); chunk(S, patchText); S.run('ALTER TABLE elements_meta ADD COLUMN sneaky TEXT'); const f2 = path.join(dir, 'Sneaky_extracted.db'); fs.writeFileSync(f2, Buffer.from(S.export())); fs.mkdirSync(path.join(dir, 'patches'), { recursive: true }); fs.copyFileSync(PATCH, path.join(dir, 'patches', 'Sneaky_extracted.db.sql'));
    const rr = cp.spawnSync(process.execPath, [SJ('common/door/object_cli.js'), 'describe', '--kind', 'Element', '--db', f2, '--oplog', OPLOG + '.sneaky'], { encoding: 'utf8' }); const dd = JSON.parse(rr.stdout);
    k.chk('DESCRIBE a physical column with no dictionary row is NOT listed (reflection reads the dictionary, not the table)', dd.properties.every(p => p.name !== 'sneaky') && dd.properties.length === el.out.properties.length, 'props=' + dd.properties.length); }
  // plant: a describe that drops a property must be judged FAIL
  { const bad = JSON.parse(JSON.stringify(el.out)); bad.properties.pop(); k.chk('DESCRIBE falsifier: an answer missing a property is judged FAIL', judgeDesc(bad, kinds.filter(x => x[0] === 'Element')[0][1]) === false); }
  // the describe of a record reads no data row: it must give the same answer for a guid that does not exist
  { const rr = cli(['describe', '--kind', 'Element', '--uu', 'NO-SUCH-GUID']); k.chk('DESCRIBE with a record names the link and opens no data row (a nonexistent guid still answers)', rr.code === 0 && rr.out.record && rr.out.record.childWhere[0] === "element_transforms.elements_meta_uu = 'NO-SUCH-GUID'", 'exit=' + rr.code); }

  // ════════ W-OBJ-UU, W-OBJ-GENERIC (in-process, the same functions the CLI runs) ════════
  const M = await O.boot({ db: FIX, oplog: OPLOG });
  const pick = (sql) => rowsOf(M.db, sql).map(r => r[0]);
  const elems = pick("SELECT guid FROM elements_meta ORDER BY rowid"), noTr = pick('SELECT guid FROM elements_meta WHERE guid NOT IN (SELECT guid FROM element_transforms) LIMIT 1');
  const sample = [elems[0], elems[Math.floor(elems.length / 2)], elems[elems.length - 1]].concat(noTr.length ? [noTr[0]] : []);
  if (!elems.length) k.incon('UU', 'no elements');
  const elemId = rowsOf(M.db, "SELECT ad_table_id FROM ad_table WHERE tablename='elements_meta'")[0][0];
  const nElems0 = rowsOf(M.db, 'SELECT count(*) FROM elements_meta')[0][0];
  for (const g of sample) {
    const rd = O.read(M, { kind: 'Element', uu: g });
    k.chk('UU read by the _uu key returns that element; the key column equals guid', rd.record.guid === g && rd.record.elements_meta_uu === g, 'guid=' + g);
    const nm0 = rd.record.element_name, up = O.update(M, { kind: 'Element', uu: g, column: 'element_name', value: 'OBJ1 ' + g.slice(0, 6) });
    const after = rowsOf(M.db, "SELECT guid, element_name FROM elements_meta WHERE guid='" + g.replace(/'/g, "''") + "'");
    k.chk('UU update by the _uu key keeps the guid unchanged and writes the new name; one op addresses the record by that key', after.length === 1 && after[0][0] === g && after[0][1] === 'OBJ1 ' + g.slice(0, 6) && up.ops.length === 1 && up.ops[0].id === g && up.ops[0].idCol === 'elements_meta_uu' && up.ops[0].changes.element_name.old === nm0, 'op=' + JSON.stringify({ id: up.ops[0].id, idCol: up.ops[0].idCol }));
    const at = await O.attach(M, { kind: 'Element', uu: g, text: 'note for ' + g });
    const row = rowsOf(M.db, "SELECT record_uu, record_id, ad_table_id FROM ad_attachment WHERE record_uu='" + g.replace(/'/g, "''") + "'");
    k.chk('UU attach writes Record_UU = the key, no numeric Record_ID, under the Element table id', row.length === 1 && row[0][0] === g && !row[0][1] && row[0][2] === elemId, 'rows=' + row.length + ' record_id=' + (row[0] && row[0][1]) + ' (0 = the attachment module\'s existing value for a UU-keyed record)');
  }
  { // a FILE attachment: the zip entry reads back with the same bytes
    const AT = require(SJ('erp/ad_attachment.js')), f = path.join(dir, 'drawing.txt'), payload = 'sheet A-101 rev 1\n'.repeat(40); fs.writeFileSync(f, payload);
    const at = await O.attach(M, { kind: 'Element', uu: sample[0], file: f });
    const row = rowsOf(M.db, "SELECT ad_attachment_id FROM ad_attachment WHERE record_uu='" + sample[0].replace(/'/g, "''") + "'");
    const host = { rows: (sql) => O.rowsOf ? O.rowsOf(sql) : M.rows(sql) }, back = await AT.load(AT.lookup(host, { tableId: elemId, recordUU: sample[0] }));
    k.chk('UU a file attached to the element reads back from its Record_UU with the same bytes', row.length === 1 && at.entries.some(e => e.name === 'drawing.txt') && back.entries.length === 1 && Buffer.from(back.entries[0].data).toString() === payload, 'entries=' + back.entries.length + ' rows=' + row.length);
  }
  k.chk('UU no element was added or removed by any of it', rowsOf(M.db, 'SELECT count(*) FROM elements_meta')[0][0] === nElems0);
  { // a nonexistent key is refused, naming it (and nothing is written)
    let msg = null; try { O.update(M, { kind: 'Element', uu: 'NO-SUCH', column: 'element_name', value: 'x' }); } catch (x) { msg = x instanceof O.Refused ? x.message : 'OTHER ' + x.message; }
    k.chk('UU a key that does not exist is refused naming it', /no Element with elements_meta_uu NO-SUCH/.test(msg || ''), String(msg)); }
  // falsifier: strip the _uu rule from ad_attachment.js -> attach must refuse "No Key"
  { const atPath = SJ('erp/ad_attachment.js'), src = fs.readFileSync(atPath, 'utf8');
    const stripped = src.replace("ruu = uu != null && uu !== '' ? String(uu) : (/_UU$/i.test(kc) && kv ? String(kv) : null)", 'ruu = null');
    k.chk('UU falsifier setup: the _uu rule line was found and stripped', stripped !== src);
    const Module = require('module'), m = new Module(atPath, null); m.filename = atPath; m.paths = Module._nodeModulePaths(path.dirname(atPath)); m._compile(stripped, atPath);
    const saved = require.cache[atPath]; require.cache[atPath] = { id: atPath, filename: atPath, loaded: true, exports: m.exports };
    let msg = null; try { await O.attach(M, { kind: 'Element', uu: sample[0], text: 'x' }); } catch (x) { msg = x instanceof O.Refused ? x.message : 'OTHER ' + x.message; }
    if (saved) require.cache[atPath] = saved; else delete require.cache[atPath];
    k.chk('UU falsifier: with the _uu rule stripped, attach refuses "No Key"', /^No Key/.test(msg || ''), String(msg).slice(0, 90)); }

  // ── GENERIC ──
  const kindsTried = [];
  const generic = async (kind, uu, col, val) => {
    const h0 = O.history(M, { kind, uu }).entries.length, up = O.update(M, { kind, uu, column: col, value: val }), at = await O.attach(M, { kind, uu, text: 'generic ' + kind });
    const h1 = O.history(M, { kind, uu }).entries, last = h1[h1.length - 1];
    kindsTried.push(kind);
    return h0 === 0 && h1.length >= 1 && last.column === col && String(last.new) === String(val) && last.event === 'U' && last.uu === uu && at.attachment && at.attachment.record_uu === uu && up.ops.length === 1;
  };
  const hist0 = O.history(M, { kind: 'Element', uu: sample[1] });
  // sample[1] was edited above: 1+ entries; a different, untouched element: 0
  const untouched = elems.filter(g => sample.indexOf(g) < 0)[0];
  k.chk('GENERIC history is not vacuous: an edited element has entries, an untouched one has 0', hist0.entries.length >= 1 && O.history(M, { kind: 'Element', uu: untouched }).entries.length === 0, 'edited=' + hist0.entries.length);
  k.chk('GENERIC element: update + attach + history through the one engine', await generic('Element', untouched, 'storey', 'Level OBJ1'));
  const sp = pick("SELECT guid FROM spatial_structure WHERE type='IfcBuildingStorey' ORDER BY rowid LIMIT 1");
  if (!sp.length) k.incon('GENERIC-SPATIAL', 'no storey row'); else k.chk('GENERIC storey/space: the same three operations, no new code', await generic('Storey and Space', sp[0], 'name', 'Storey OBJ1'), 'uu=' + sp[0]);
  const bk = pick("SELECT key FROM project_metadata WHERE key='building_name'");
  if (!bk.length) k.incon('GENERIC-BUILDING', 'no building_name row'); else k.chk('GENERIC building: the same three operations, key is a text key, no new code', await generic('Building', bk[0], 'value', 'Duplex OBJ1'), 'uu=' + bk[0]);
  k.L('GENERIC kinds exercised=' + kindsTried.join(', ') + ' through erp/model_layer.js Trx + ad_attachment.js + crud_core.js changeLog');
  // the grep: no model table in the engine files
  const ENGINE = ['erp/model_layer.js', 'erp/ad_attachment.js', 'erp/crud_core.js', 'common/door/object_cli.js', 'common/door/door.js', 'erp/ad_gridtab.js'];
  const grep = (text) => MODEL_TABLES.filter(t => new RegExp('\\b' + t + '(_uu)?\\b', 'i').test(text));
  const hits = ENGINE.map(f => [f, grep(fs.readFileSync(SJ(f), 'utf8'))]).filter(x => x[1].length);
  k.chk('GENERIC the engine files name none of the model\'s tables (grep over ' + ENGINE.length + ' files)', hits.length === 0 && ENGINE.length > 0, 'hits=' + hits.map(h => h[0] + ':' + h[1].join('/')).join(' '));
  k.chk('GENERIC falsifier: an engine file with a model table named in it is caught', grep(fs.readFileSync(SJ('erp/model_layer.js'), 'utf8') + "\nif (table === 'elements_meta') {}").length === 1);

  // ════════ W-OBJ-SHADOW ════════
  {
    const ERP = new SQL.Database(fs.readFileSync(SJ('erp/ad_seed.db')));
    const qOf = (db) => (sql, p) => { const st = db.prepare(sql), o = []; try { if (p && p.length) st.bind(p); while (st.step()) o.push(st.getAsObject()); } finally { st.free(); } return o; };
    const MOD = open(FIX); chunk(MOD, patchText);
    // a model table that has the same name as an ERP table: c_uom (ERP key C_UOM_ID); the model registers it keyed by c_uom_uu
    const erpKey = rowsOf(ERP, "SELECT c.ColumnName FROM AD_Column c JOIN AD_Table t ON t.AD_Table_ID=c.AD_Table_ID WHERE lower(t.TableName)='c_uom' AND c.IsKey='Y'").map(r => r[0]);
    MOD.run("INSERT INTO ad_table (ad_table_id, name, tablename, isactive, ad_table_uu) VALUES (9559001,'Shadow','c_uom','Y','shadow-t')");
    MOD.run("INSERT INTO ad_column (ad_column_id, ad_table_id, columnname, iskey, isactive, ad_column_uu) VALUES (9559002,9559001,'c_uom_uu','Y','Y','shadow-c')");
    const fresh = () => { Object.keys(require.cache).filter(f => /\/erp\/(model_layer|bigdecimal|ad_modelval|layered_registry|ad_workflow)\.js$/.test(f)).forEach(f => delete require.cache[f]); return require(SJ('erp/model_layer.js')); };
    const erpQ = qOf(ERP), modQ = qOf(MOD), lcq = (q) => (s, p) => q(s, p).map(r => Object.fromEntries(Object.entries(r).map(([a, v]) => [a.toLowerCase(), v])));
    k.L('SHADOW erp key=' + erpKey.join(',') + ' (table c_uom); the model registers the same name keyed by c_uom_uu');
    const results = [];
    for (const order of ['erp-first', 'model-first']) {
      const ML = fresh(), seq = order === 'erp-first' ? [['erp', erpQ], ['model', modQ]] : [['model', modQ], ['erp', erpQ]], got = {};
      seq.forEach(([n, q]) => { got[n] = new ML.Trx(lcq(q), { db: n }).keyCols('c_uom').join(','); });
      results.push([order, got]);
      k.chk('SHADOW ' + order + ': each database gives c_uom its own key', got.erp === erpKey.map(s => s.toLowerCase()).join(',') && got.model === 'c_uom_uu', JSON.stringify(got));
    }
    // falsifier: no database id (the old, name-only cache) -> the second one is shadowed by the first
    { const ML = fresh(), a1 = new ML.Trx(lcq(erpQ), {}).keyCols('c_uom').join(','), a2 = new ML.Trx(lcq(modQ), {}).keyCols('c_uom').join(',');
      k.chk('SHADOW falsifier: without a database id the model table IS shadowed by the ERP table (the case the key prevents)', a1 !== 'c_uom_uu' && a2 === a1, 'erp=' + a1 + ' model=' + a2); }
    ERP.close();
  }

  // ════════ W-OBJ-DOOR ════════
  {
    const D = require('../door.js'), journal = tmp('obj_j_');
    process.env.BIM_OBJECT_OPLOG = path.join(dir, 'door_ops.jsonl');
    const door = D.createDoor({ journal, say: () => {} }), g = elems[2];
    const d1 = await door.runLine('object.describe building=Duplex kind=Element', { actor: 'human' });
    k.chk('DOOR object.describe through the door: ok, the engine\'s own JSON inside', d1.status === 'ok' && d1.answer.properties.length === el.out.properties.length, 'status=' + d1.status + ' ' + (d1.why || ''));
    const d2 = await door.runLine('object.read building=Duplex kind=Element uu=' + g, { actor: 'ai' });
    k.chk('DOOR object.read as an AI (a read verb) is allowed', d2.status === 'ok' && d2.answer.record.guid === g, 'status=' + d2.status + ' ' + (d2.why || ''));
    const w0 = fs.existsSync(process.env.BIM_OBJECT_OPLOG) ? fs.readFileSync(process.env.BIM_OBJECT_OPLOG, 'utf8') : '';
    const d3 = await door.runLine('object.attach building=Duplex kind=Element uu=' + g + ' text="from an AI"', { actor: 'ai' });
    const w1 = fs.existsSync(process.env.BIM_OBJECT_OPLOG) ? fs.readFileSync(process.env.BIM_OBJECT_OPLOG, 'utf8') : '';
    k.chk('DOOR object.attach as an AI is held as a claim and writes nothing', d3.status === 'claim' && w1 === w0, 'status=' + d3.status);
    const d4 = await door.runLine('object.attach building=Duplex kind=Element uu=' + g + ' text="from a person"', { actor: 'human' });
    k.chk('DOOR object.attach as a human is ok and returns its op in the envelope', d4.status === 'ok' && d4.ops.length === 1 && d4.ops[0].table === 'ad_attachment' && d4.ops[0].record_uu === g, 'status=' + d4.status + ' ' + (d4.why || ''));
    const d5 = await door.runLine('object.update building=Duplex kind=Element uu=' + g + ' column=discipline value=NOPE', { actor: 'human' });
    k.chk('DOOR object.update with a value off the list is refused with the rule, no op', d5.status === 'refused' && /must be one of/.test(d5.why) && d5.ops.length === 0, 'status=' + d5.status + ' why=' + d5.why);
    const d6 = await door.runLine('object.describe building=Duplex kind=Nope', { actor: 'human' });
    k.chk('DOOR an unknown kind comes back as an error naming it', d6.status === 'error' && /unknown kind "Nope"/.test(d6.why), 'why=' + d6.why);
    const d7 = await door.runLine('object.history building=Duplex kind=Element uu=' + g, { actor: 'human' });
    k.chk('DOOR object.history answers (no entry yet for an element only attached to)', d7.status === 'ok' && Array.isArray(d7.answer.entries), 'status=' + d7.status);
  }
  k.end();
})().catch(e => { console.log('§W-OBJ INCONCLUSIVE ' + (e && e.stack || e)); process.exit(2); });
