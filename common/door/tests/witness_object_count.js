#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-OBJ-COUNT (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §0.13 item 1). READ THE §-LOG after every run; an exit code is not evidence.
 * ISSUE it proves or disproves: `object.count` gives a count that is not the model's, accepts a column the dictionary does not hold, or answers a vacuous 0 as if it were a result;
 *   and kind Room (a read-only view of the spaces) changes rows that existed before it.
 * No browser, no GPU. Model: the PUBLIC Duplex (FIXTURE_DB, else this machine's copy). Every expected number is an independent SQL count on the patched bytes, never a literal.
 * Falsifiers (each must make this witness FAIL): COUNT_BREAK=plus1 (the engine adds one) · COUNT_BREAK=nofilter (filters ignored) · COUNT_BREAK=zero_ok (an empty kind answered ok).
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const { kit, tmp, run, stripMs, ROOT, DOOR } = require('./_kit');
const k = kit('W-OBJ-COUNT');
const SJ = (p) => path.join(ROOT, p);
const DB = [process.env.FIXTURE_DB, path.join(os.homedir(), 'bim-ootb', 'buildings', 'Duplex_extracted.db'), SJ('buildings/Duplex_extracted.db')].filter(Boolean).filter(f => fs.existsSync(f))[0];
const PATCH = SJ('buildings/patches/Duplex_extracted.db.sql');

(async () => {
  if (!DB) { k.incon('FIXTURE', 'no Duplex_extracted.db found (set FIXTURE_DB)'); return k.end(); }
  const SQL = await require(SJ('common/lib/sql-wasm.js'))({ wasmBinary: fs.readFileSync(SJ('common/lib/sql-wasm.wasm')) });
  const O = require('../object_cli.js'), chunk = O.loadChunker();
  // the witness's own view of the model: the served-style bytes + the patch, by the loader's chunker; expected numbers come from SQL on the BASE tables, not from the kind's view
  const M = new SQL.Database(fs.readFileSync(DB)); if (!M.exec("SELECT 1 FROM sqlite_master WHERE lower(name)='ad_table'").length) chunk(M, fs.readFileSync(PATCH, 'utf8'));
  const one = (sql) => { const r = M.exec(sql); return r.length ? r[0].values[0][0] : null; };
  // a building dir holding ONLY this fixture, so the door's CLI opens the same bytes (VIEWER_BLD_DIR is object_cli's first lookup)
  const bdir = fs.mkdtempSync(path.join(os.tmpdir(), 'objcount_')); fs.copyFileSync(DB, path.join(bdir, 'Duplex_extracted.db'));
  const env = { VIEWER_BLD_DIR: bdir, BIM_OBJECT_OPLOG: path.join(bdir, 'ops.jsonl') };
  let seq = 0;
  const door = async (line, actor, e2) => { const r = await run(DOOR, ['--actor', actor || 'human', '--request', 'oc-' + (++seq), '--journal', path.join(bdir, 'journal.jsonl'), line], Object.assign({}, env, e2 || {})); let j = null; try { j = JSON.parse(r.out.split('\n').pop()); } catch (e) { /* judged below */ } return { r, j }; };
  const cnt = async (line, actor, e2) => { const d = await door(line, actor, e2); return d.j && d.j.status === 'ok' ? d.j.answer.count : 'status=' + (d.j ? d.j.status + ' ' + d.j.why : d.r.err.slice(-200)); };

  // ════ C1 the counts are the model's (independent SQL) ════
  const exp = {
    Room: one("SELECT count(*) FROM spatial_structure WHERE type='IfcSpace'"), Element: one('SELECT count(*) FROM elements_meta'),
    'Storey and Space': one('SELECT count(*) FROM spatial_structure'), Building: one('SELECT count(*) FROM project_metadata'), 'Element Transform': one('SELECT count(*) FROM element_transforms')
  };
  k.L('C1 independent SQL ' + JSON.stringify(exp));
  let judged = 0;
  for (const kind of Object.keys(exp)) { const got = await cnt('object.count building=Duplex kind="' + kind + '"'); if (exp[kind] > 0) judged++; k.chk('C1 object.count kind=' + kind + ' = SQL count', got === exp[kind] && exp[kind] > 0, 'door=' + got + ' sql=' + exp[kind]); }
  if (!judged) k.incon('C1', 'every kind is empty in this fixture');
  k.chk('C1 Room is fewer than Storey and Space and more than 0 (the view really narrows)', exp.Room > 0 && exp.Room < exp['Storey and Space'], exp.Room + ' of ' + exp['Storey and Space']);

  // ════ C2 filters: column=value checked by reflection, the count = its SQL ════
  const storey = one("SELECT p.name FROM spatial_structure s JOIN spatial_structure p ON p.guid=s.parent_guid WHERE s.type='IfcSpace' GROUP BY p.name ORDER BY count(*) DESC, p.name LIMIT 1");
  const eStorey = one("SELECT count(*) FROM spatial_structure s JOIN spatial_structure p ON p.guid=s.parent_guid WHERE s.type='IfcSpace' AND p.name='" + String(storey).replace(/'/g, "''") + "'");
  const gStorey = await cnt('object.count building=Duplex kind=Room storey="' + storey + '"');
  k.chk('C2 Room storey="' + storey + '" = SQL (a strict subset of the rooms)', gStorey === eStorey && eStorey > 0 && eStorey < exp.Room, 'door=' + gStorey + ' sql=' + eStorey + ' of ' + exp.Room);
  const disc = one('SELECT discipline FROM elements_meta WHERE discipline IS NOT NULL GROUP BY discipline ORDER BY count(*) DESC LIMIT 1'), eDisc = one("SELECT count(*) FROM elements_meta WHERE discipline='" + disc + "'");
  const gDisc = await cnt('object.count building=Duplex kind=Element discipline=' + disc);
  k.chk('C2 Element discipline=' + disc + ' = SQL', gDisc === eDisc && eDisc > 0 && eDisc < exp.Element, 'door=' + gDisc + ' sql=' + eDisc + ' of ' + exp.Element);
  const cls = one("SELECT ifc_class FROM elements_meta WHERE discipline='" + disc + "' GROUP BY ifc_class ORDER BY count(*) DESC LIMIT 1"), e2f = one("SELECT count(*) FROM elements_meta WHERE discipline='" + disc + "' AND ifc_class='" + cls + "'");
  const g2f = await cnt('object.count building=Duplex kind=Element discipline=' + disc + ' ifc_class=' + cls);
  k.chk('C2 two filters (discipline and ifc_class=' + cls + ') = SQL', g2f === e2f && e2f > 0, 'door=' + g2f + ' sql=' + e2f);
  const z = await door('object.count building=Duplex kind=Room storey=NoSuchStorey');
  k.chk('C2 a filter that matches nothing in a non-empty kind is a real 0 with the population (ok, not inconclusive)', z.j && z.j.status === 'ok' && z.j.answer.count === 0 && z.j.answer.population === exp.Room && z.j.answer.verdict === 'OK', z.j ? JSON.stringify(z.j.answer) : z.r.err.slice(-200));
  const elev = one("SELECT center_z FROM spatial_structure WHERE type='IfcSpace' AND center_z IS NOT NULL LIMIT 1"), eNum = one("SELECT count(*) FROM spatial_structure WHERE type='IfcSpace' AND center_z = " + elev);
  const gNum = await cnt('object.count building=Duplex kind=Room center_z=' + elev);
  k.chk('C2 a number column compares as a number (center_z=' + elev + ')', gNum === eNum && eNum > 0, 'door=' + gNum + ' sql=' + eNum);

  // ════ C3 wrong names are errors that name them; a wrong value shape is refused ════
  const uc = await door('object.count building=Duplex kind=Room floor=1');
  k.chk('C3 an unknown column is an error naming it and listing the kind\'s properties', uc.j && uc.j.status === 'error' && /no property "floor"/.test(uc.j.why) && /storey/.test(uc.j.why), uc.j && uc.j.why);
  const uk = await door('object.count building=Duplex kind=Rum');
  k.chk('C3 an unknown kind is an error naming it and listing the kinds (Room among them)', uk.j && uk.j.status === 'error' && /unknown kind "Rum"/.test(uk.j.why) && /Room/.test(uk.j.why), uk.j && uk.j.why);
  const bn = await door('object.count building=Duplex kind=Room center_x=abc');
  k.chk('C3 text given to a number column is refused with the reason', bn.j && bn.j.status === 'refused' && /center_x is a number/.test(bn.j.why), bn.j && bn.j.why);
  const other = await door('object.describe building=Duplex kind=Room floor=1');
  k.chk('C3 a verb WITHOUT calls.rest still refuses an unknown input at the door (nothing run)', other.j && other.j.status === 'error' && /unknown input: floor/.test(other.j.why), other.j && other.j.why);

  // ════ C4 the same line by a person and by an AI: the same envelope ════
  const h = await door('object.count building=Duplex kind=Room', 'human'), a = await door('object.count building=Duplex kind=Room', 'ai');
  const norm = (j) => { const o = JSON.parse(stripMs(j)); delete o.request; delete o.actor; return JSON.stringify(o); };
  k.chk('C4 human and ai get the same envelope apart from request, actor and ms', h.j && a.j && a.j.status === 'ok' && norm(h.j) === norm(a.j), a.j && a.j.status);

  // ════ C5 an empty kind is VACUOUS -> inconclusive, never ok with 0 ════
  const E = new SQL.Database(fs.readFileSync(DB)); if (!E.exec("SELECT 1 FROM sqlite_master WHERE lower(name)='ad_table'").length) chunk(E, fs.readFileSync(PATCH, 'utf8'));
  E.run("DELETE FROM spatial_structure WHERE type='IfcSpace'");
  const edir = fs.mkdtempSync(path.join(os.tmpdir(), 'objcount_e_')); fs.writeFileSync(path.join(edir, 'Duplex_extracted.db'), Buffer.from(E.export()));
  const v = await door('object.count building=Duplex kind=Room', 'human', { VIEWER_BLD_DIR: edir, BIM_OBJECT_OPLOG: path.join(edir, 'ops.jsonl') });
  k.chk('C5 a model with no room answers inconclusive with VACUOUS (not ok, not 0-as-an-answer)', v.j && v.j.status === 'inconclusive' && v.j.answer.verdict === 'VACUOUS' && v.j.answer.population === 0 && /no Room record/.test(v.j.why), v.j ? v.j.status + ' ' + JSON.stringify(v.j.answer) : v.r.err.slice(-200));
  k.L('C5 emptied model: ' + (v.j ? 'status=' + v.j.status + ' why=' + v.j.why : 'no envelope'));

  // ════ C6 Room is reflection's: describe = its ad_column rows; read-only (a view) ════
  const tid = one("SELECT ad_table_id FROM ad_table WHERE name='Room'"), isview = one("SELECT isview FROM ad_table WHERE name='Room'"), nCol = one('SELECT count(*) FROM ad_column WHERE ad_table_id=' + tid);
  const d = await door('object.describe building=Duplex kind=Room');
  const props = d.j && d.j.answer ? d.j.answer.properties.map(p => p.name) : [];
  k.chk('C6 describe Room lists exactly its ad_column rows (' + nCol + ') and Room is registered as a view', props.length === nCol && nCol > 0 && isview === 'Y', 'describe=' + props.length + ' sql=' + nCol + ' isview=' + isview);
  k.chk('C6 Room offers no update and no history (read-only view), and no property is updateable', d.j && d.j.answer && d.j.answer.methods.indexOf('update') < 0 && d.j.answer.methods.indexOf('history') < 0 && d.j.answer.properties.every(p => !p.updateable), d.j && d.j.answer && d.j.answer.methods.join(','));
  const rid = one("SELECT guid FROM spatial_structure WHERE type='IfcSpace' ORDER BY guid LIMIT 1"), rd = await door('object.read building=Duplex kind=Room uu=' + rid);
  k.chk('C6 a room is read by its key through the same engine; its storey is its parent\'s name', rd.j && rd.j.status === 'ok' && rd.j.answer.record.guid === rid && rd.j.answer.record.storey === one("SELECT p.name FROM spatial_structure s JOIN spatial_structure p ON p.guid=s.parent_guid WHERE s.guid='" + rid + "'"), rd.j ? rd.j.status + ' ' + (rd.j.why || JSON.stringify(rd.j.answer.record).slice(0, 160)) : '');
  const up = await door('object.update building=Duplex kind=Room uu=' + rid + ' column=name value=X');
  k.chk('C6 an update of a room is refused (not updateable); nothing is written', up.j && up.j.status === 'refused' && /not updateable/.test(up.j.why) && !fs.existsSync(env.BIM_OBJECT_OPLOG), up.j && up.j.status + ' ' + up.j.why);

  // ════ C7 adding the kind changed no earlier dictionary row and no data row ════
  // the patch as it was just before the Room kind: the parent of the commit that first added the view (found in git, so the gate needs no extra file)
  let base = null; try { const REL = 'buildings/patches/Duplex_extracted.db.sql', first = cp.execFileSync('git', ['-C', ROOT, 'log', '--format=%H', '-S', 'CREATE VIEW model_room', '--', REL], { encoding: 'utf8' }).trim().split('\n').pop(); if (first) base = cp.execFileSync('git', ['-C', ROOT, 'show', first + '~1:' + REL], { encoding: 'utf8', maxBuffer: 1 << 26 }); } catch (e) { /* judged below */ }
  const prior = process.env.PATCH_BEFORE ? fs.readFileSync(process.env.PATCH_BEFORE, 'utf8') : base;
  if (!prior || /model_room/.test(prior)) k.incon('C7', 'no pre-Room patch to compare with (set PATCH_BEFORE to the patch before this change)');
  else {
    const now = new Set(fs.readFileSync(PATCH, 'utf8').split('\n')), gone = prior.split('\n').filter(l => l.trim() && !now.has(l));
    k.chk('C7 every line of the patch before Room is still in the patch (add-only)', gone.length === 0, 'missing=' + gone.length + (gone[0] ? ' first=' + gone[0].slice(0, 80) : ''));
    const P0 = new SQL.Database(fs.readFileSync(DB)); chunk(P0, prior); const P1 = new SQL.Database(fs.readFileSync(DB)); chunk(P1, fs.readFileSync(PATCH, 'utf8'));
    const dump = (db, t) => JSON.stringify(db.exec('SELECT * FROM ' + t + ' ORDER BY 1')[0] || null);
    const roomIds = "(SELECT ad_table_id FROM ad_table WHERE name='Room')";
    const same = ['elements_meta', 'element_transforms', 'spatial_structure', 'project_metadata'].filter(t => dump(P0, t) === dump(P1, t));
    k.chk('C7 the four model tables are identical with and without the Room kind', same.length === 4, 'identical=' + same.join(','));
    const dictSame = [['ad_table', "name<>'Room'"], ['ad_column', 'ad_table_id NOT IN ' + roomIds], ['ad_ref_list', '1=1'], ['ad_reference', '1=1']].filter(([t, w]) => JSON.stringify(P0.exec('SELECT * FROM ' + t + ' ORDER BY 1')[0]) === JSON.stringify(P1.exec('SELECT * FROM ' + t + ' WHERE ' + w + ' ORDER BY 1')[0]));
    k.chk('C7 the earlier dictionary rows (4 kinds, their columns, lists) are identical', dictSame.length === 4, 'identical=' + dictSame.map(x => x[0]).join(','));
  }
  k.L('fixture=' + path.basename(DB) + ' bytes=' + fs.statSync(DB).size + ' rooms=' + exp.Room + ' elements=' + exp.Element + (process.env.COUNT_BREAK ? ' COUNT_BREAK=' + process.env.COUNT_BREAK : ''));
  k.end();
})().catch(e => { console.error('§W-OBJ-COUNT HARNESS-ERROR ' + (e && e.stack || e)); process.exit(1); });
