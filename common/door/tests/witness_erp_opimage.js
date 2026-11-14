// ⚠ DO NOT REMOVE — W-ERP-OPIMAGE (bim-compiler prompts/ERP_MIS_WINDOW_FROM_CSV.md §12.10: the op-log image, so a line does not replay the whole op-log). READ THE LOG; an exit code is not evidence.
//   G1 ISSUE (a line answers differently when it starts from the image) · G2 ISSUE (the image holds other rows than a full replay makes)
//   G3 ISSUE (the image hides what the op-log says: a line added later is not seen, or an EDITED log still gives the old result) · G4 ISSUE (the image is never used, or saves nothing)
//   G5 ISSUE (images pile up: one whose op-log is gone is never deleted; temp files are left)
//   Falsifiers: ERP_BREAK=staleimage (the prefix is not checked: must FAIL G3) · noimage (must FAIL G4). An op-log below the threshold gives INCONCLUSIVE, never PASS.
//   Run: node common/door/tests/witness_erp_opimage.js > common/door/tests/logs/erp_opimage.log 2>&1
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const { kit, tmp, ROOT, DOOR } = require('./_kit');
const k = kit('W-ERP-OPIMAGE'), BRK = process.env.ERP_BREAK || '';
(async () => {
  const dir = path.dirname(tmp('oi_')), snapDir = path.join(dir, 'snap'), MIN = 50;
  const PW = path.join(ROOT, 'common/door/samples/Ninja_Practice.xlsx');
  if (!fs.existsSync(PW)) { k.incon('G1-G5', 'common/door/samples/Ninja_Practice.xlsx is not in this checkout'); return k.end(); }
  fs.copyFileSync(PW, path.join(dir, 'Ninja_Practice.xlsx'));
  const LOG = path.join(dir, 'one.ops.jsonl'), envOf = (mode, log) => Object.assign({ BIM_OBJECT_OPLOG: log || LOG, BIM_DOOR_JOURNAL: path.join(dir, 'j.jsonl'), ERP_SNAPSHOT_DIR: snapDir, ERP_OPIMAGE: mode, ERP_OPIMAGE_MIN: String(MIN) }, BRK ? { ERP_BREAK: BRK } : {});
  const run = (env, line, timed) => new Promise((res) => { let o = '', er = ''; const t0 = Date.now(), p = cp.spawn(process.execPath, [DOOR, '--actor', 'human', line], { cwd: dir, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] }); p.stdout.on('data', d => { o += d; }); p.stderr.on('data', d => { er += d; });
    p.on('close', () => { let j = null; try { j = JSON.parse(o.split('\n').filter(l => l.charAt(0) === '{').pop()); } catch (x) { /* null */ } j = j || { status: 'unparseable', why: (o + er).slice(-300) }; j.ms_wall = Date.now() - t0; j.raw = o; res(j); }); });
  const norm = (j) => { const x = JSON.parse(JSON.stringify(j)); delete x.request; delete x.ms; delete x.ms_wall; delete x.raw; if (x.answer) delete x.answer.ms; return JSON.stringify(x); };
  const ON = envOf('on'), OFF = envOf('off'), ok = (j) => j && j.status === 'ok';
  const E = require(path.join(ROOT, 'common/door/erp_cli.js'));
  const image = async (env) => { const keep = {}; Object.keys(env).forEach(n => { keep[n] = process.env[n]; process.env[n] = env[n]; }); const w = process.stderr.write, lines = []; process.stderr.write = (s) => { lines.push(String(s)); return true; };
    try { const O = await E.boot({}); return { O, boot: lines.filter(l => /§ERP boot /.test(l)).pop() || '', all: lines.join('') }; } finally { process.stderr.write = w; Object.keys(env).forEach(n => { if (keep[n] == null) delete process.env[n]; else process.env[n] = keep[n]; }); } };
  const num = (s, re) => { const m = re.exec(s); return m ? Number(m[1]) : null; };

  // the log: a workbook, the document columns on one table, records down two levels (all written with the image OFF, so the first image is made by a later line)
  for (const l of ['ninja.exec file=Ninja_Practice.xlsx', 'ninja.workflow table=PR_Visit', 'mis.new kind=PR_Visit Name=Checkup PR_Patient_ID=1 Fee=50', 'mis.new kind=PR_Medicine Name=Paracetamol PR_Visit_ID=1 Qty=10', 'mis.update kind=PR_Patient id=2 BloodGroup=AB']) { const j = await run(OFF, l); if (!ok(j)) { k.incon('G1-G5', 'the log could not be written at "' + l + '": ' + j.why); return k.end(); } }
  const nOps = fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).length;
  if (nOps < MIN) { k.incon('G1-G5', 'the op-log holds ' + nOps + ' ops, below the threshold ' + MIN + ': no image would be written'); return k.end(); }

  // ── G5 setup: a second op-log gets its image, then the log is deleted
  const LOG2 = path.join(dir, 'two.ops.jsonl'); fs.copyFileSync(LOG, LOG2); await run(envOf('on', LOG2), 'mis.list kind=PR_Room');
  const sides = () => fs.existsSync(snapDir) ? fs.readdirSync(snapDir).filter(f => /^opimg-/.test(f)) : [], side2 = sides().filter(f => /\.json$/.test(f)).map(f => JSON.parse(fs.readFileSync(path.join(snapDir, f), 'utf8'))).filter(j => j.oplog === LOG2)[0];
  fs.unlinkSync(LOG2);

  // ── the first line with the image ON writes it; the next ones start from it
  const first = await image(ON), second = await image(ON), full = await image(OFF);
  k.L('boot ON (1st): ' + first.boot.trim().replace(/oplog=\S+/, '') + (/opimage=written/.test(first.all) ? ' · ' + (/opimage=written[^\n]*/.exec(first.all) || [''])[0] : ''));
  k.L('boot ON (2nd): ' + second.boot.trim().replace(/oplog=\S+/, '') + ' · boot OFF: ' + full.boot.trim().replace(/oplog=\S+/, ''));
  const hitOps = num(second.boot, /image_ops=(\d+)/), replayed = num(second.boot, /replayed_ops=(\d+)/);

  // ── G2 same data: every dictionary table a Ninja line writes, the sequences, and every staged data table, row for row
  const staged = full.O.rows("SELECT tablename AS t FROM ad_table WHERE ad_table_id>=7000000 AND isactive='Y' ORDER BY tablename").map(r => r.t.toLowerCase());
  const tables = ['ad_table', 'ad_column', 'ad_tab', 'ad_field', 'ad_window', 'ad_menu', 'ad_treenodemm', 'ad_reference', 'ad_ref_list', 'ad_window_access', 'ad_sequence'].concat(staged);
  const hash = (O, tn) => crypto.createHash('sha256').update(JSON.stringify(O.rows('SELECT * FROM ' + tn + ' ORDER BY rowid'))).digest('hex').slice(0, 12), cntOf = (O, tn) => O.rows('SELECT count(*) AS n FROM ' + tn)[0].n;
  const diff = tables.filter(tn => hash(second.O, tn) !== hash(full.O, tn)), ddl = (O) => JSON.stringify(O.rows("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name"));
  if (!staged.length) k.incon('G2', 'VACUOUS: no staged table in the image');
  else k.chk('G2 same data by both routes: ' + (tables.length - diff.length) + ' of ' + tables.length + ' tables hold the same rows from the image as from a full replay (11 dictionary tables + the ' + staged.length + ' staged ones), and the tables themselves are defined the same', diff.length === 0 && ddl(second.O) === ddl(full.O) && hitOps === nOps,
    'rows: ' + tables.map(tn => tn + '=' + cntOf(full.O, tn)).join(' ') + (diff.length ? ' · DIFFER: ' + diff.join(',') : '') + ' · same table definitions=' + (ddl(second.O) === ddl(full.O)) + ' · the image run started from ' + hitOps + ' of ' + nOps + ' ops');

  // ── G1 same answers: every staged kind listed and described, one master read with its children; N from the dictionary
  const lines = []; staged.forEach(tn => { lines.push('mis.list kind=' + tn + ' names=Y'); lines.push('mis.describe kind=' + tn); }); lines.push('mis.read kind=PR_Patient id=1'); lines.push('mis.sum kind=PR_Visit column=Fee'); lines.push('mis.list kind=C_BPartner limit=5');
  let same = 0; const bad = [], tOn = [], tOff = [];
  for (const l of lines) { const a = await run(ON, l), b = await run(OFF, l); tOn.push(a.ms_wall); tOff.push(b.ms_wall); if (a.status !== 'unparseable' && norm(a) === norm(b)) same++; else bad.push(l); }
  k.chk('G1 same answers: ' + same + ' of ' + lines.length + ' read lines answer the same, character for character, from the image and with the image off (every staged kind listed and described, a master read with its children, a sum, a core list)', same === lines.length && lines.length >= 2 * staged.length + 3, bad.length ? 'DIFFER: ' + bad.join(' | ') : 'lines=' + lines.length);

  // ── G4 it is used and it is cheaper
  const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  k.chk('G4 the image is used: the second line started from ' + hitOps + ' of ' + nOps + ' ops and applied ' + replayed + ', the first line wrote it; median wall time of the ' + lines.length + ' lines ' + med(tOn) + ' ms from the image against ' + med(tOff) + ' ms with a full replay', /opimage=written/.test(first.all) && hitOps === nOps && replayed === 0 && num(full.boot, /replayed_ops=(\d+)/) === nOps && med(tOn) < med(tOff),
    'first line: image written=' + /opimage=written/.test(first.all) + ' · second: image_ops=' + hitOps + ' replayed=' + replayed + ' · off: replayed=' + num(full.boot, /replayed_ops=(\d+)/) + ' · median ms on=' + med(tOn) + ' off=' + med(tOff));

  // ── G3 it follows the log: a line added after the image is seen; an EDITED log gives the edited result
  const add = await run(ON, 'mis.new kind=PR_Patient Name=Devi'), l1 = await run(ON, 'mis.list kind=PR_Patient'), n1 = ((l1.answer || {}).rows || []).map(r => r.Name).join();
  const txt = fs.readFileSync(LOG, 'utf8'), edited = txt.replace('"name":"Aminah"', '"name":"Zainab"'); fs.writeFileSync(LOG, edited);
  const l2 = await run(ON, 'mis.list kind=PR_Patient'), n2 = ((l2.answer || {}).rows || []).map(r => r.Name).join(), l3 = await run(OFF, 'mis.list kind=PR_Patient'), n3 = ((l3.answer || {}).rows || []).map(r => r.Name).join();
  if (edited === txt) k.incon('G3', 'the op-log holds no patient named Aminah to edit');
  else k.chk('G3 it follows the op-log: a patient added after the image is listed; after an earlier line of the log is edited (Aminah becomes Zainab) the next line shows Zainab, as a full replay does', ok(add) && /Devi/.test(n1) && /Aminah/.test(n1) && /Zainab/.test(n2) && !/Aminah/.test(n2) && n2 === n3, 'after the add: ' + n1 + ' · after the edit, with the image on: ' + n2 + ' · with it off: ' + n3);

  // ── G5 housekeeping: the deleted op-log's image is gone once another image is written (the edit above forced one); no temp file
  const left = sides(), gone = side2 ? (!fs.existsSync(side2.file) && left.filter(f => /\.json$/.test(f)).map(f => JSON.parse(fs.readFileSync(path.join(snapDir, f), 'utf8'))).filter(j => j.oplog === LOG2).length === 0) : null;
  if (!side2) k.incon('G5', 'the second op-log got no image, so there was nothing to sweep');
  else k.chk('G5 an image whose op-log was deleted is gone after the next image is written; one image file per op-log is left and no temp file', gone === true && left.filter(f => /\.tmp$/.test(f)).length === 0 && left.filter(f => /\.db$/.test(f)).length === 1, 'the deleted log\'s image gone=' + gone + ' · files left: ' + left.map(f => f.replace(/opimg-[0-9a-f]+-/, 'opimg-…-')).join(', '));
  try { fs.rmSync(snapDir, { recursive: true, force: true }); } catch (e) { /* left for the temp janitor */ }
  k.end();
})().catch(e => { console.log('§W-ERP-OPIMAGE ERROR ' + e.stack); process.exit(2); });
