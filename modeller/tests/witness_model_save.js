#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-MODEL-SAVE (bim-compiler prompts/MODEL_SESSION_LINES.md §S2: model.save and the save on close). READ THE LOG; an exit code is not evidence.
//   M1 ISSUE (a clean save writes no file, or not the page's own bytes, or a broken .db; or its phase times do not add up) · M2 ISSUE (a save with nothing authored writes something)
//   M3 ISSUE (close drops unsaved changes when no file is known) · M4 ISSUE (close with a known file does not save first, or saves again right after a save) · M5 ISSUE (a file outside the folder is written)
//   Falsifiers: MODELSES_BREAK=nofile (must FAIL M1, M4) · closedrops (must FAIL M3, M4). INCONCLUSIVE when the input sheets are missing.
//   Reports, not judged: §MODEL_SAVE_FINDING lines (what the page's Save gate says after model.addbay).
//   Input: the 9 marked Shed sheets (SHED_MARKED_DIR, default ~/.cache/capex_uat_dryrun/shed_cli/marked). Run: NODE_PATH=~/bim-compiler/node_modules node modeller/tests/witness_model_save.js > modeller/tests/logs/model_save.log 2>&1
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..'), DOOR = path.join(ROOT, 'common/door/door.js'), SHEETS = process.env.SHED_MARKED_DIR || path.join(os.homedir(), '.cache/capex_uat_dryrun/shed_cli/marked');
let pass = 0, fail = 0, inc = 0; const L = (m) => console.log(m);
const chk = (id, ok, detail) => { if (ok) pass++; else fail++; L('  ' + (ok ? '✅' : '❌') + ' ' + id + '  ' + detail); };
const door = (dir, line) => new Promise(res => { let o = ''; const p = cp.spawn(process.execPath, [DOOR, '--actor', 'human', line], { cwd: dir, env: process.env, stdio: ['ignore', 'pipe', 'ignore'] }); p.stdout.on('data', d => { o += d; });
  p.on('close', () => { let j = null; try { j = JSON.parse(o.split('\n').filter(l => l.charAt(0) === '{').pop()); } catch (e) { /* null */ } res(j || { status: 'unparseable', why: o.slice(-300) }); }); });
const sha = (f) => { try { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); } catch (e) { return null; } };
const A = (j) => j.answer || {};
const fresh = (n) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'msave_' + n + '_')); fs.mkdirSync(path.join(d, 'shed')); fs.readdirSync(SHEETS).filter(f => /\.dxf$/i.test(f)).forEach(f => fs.copyFileSync(path.join(SHEETS, f), path.join(d, 'shed', f))); return d; };
const OPEN = 'model.open sheets=shed type="Farming Shed"';
(async () => {
  if (!fs.existsSync(SHEETS) || fs.readdirSync(SHEETS).filter(f => /\.dxf$/i.test(f)).length !== 9) { L('§W-MODEL-SAVE INCONCLUSIVE the 9 marked Shed sheets are not at ' + SHEETS); L('§WITNESS_MODEL_SAVE pass=0 fail=0 inconclusive=1 verdict=INCONCLUSIVE'); process.exit(2); }
  // session 1: M2, M1, M5, the addbay finding, M4b (close right after a save)
  const d1 = fresh('a'); await door(d1, OPEN);
  const s0 = await door(d1, 'model.save file=s.db');
  chk('M2 a save before anything is authored is refused with the page\'s words and writes no file', s0.status === 'refused' && /author something first/.test(s0.why) && !fs.existsSync(path.join(d1, 's.db')), s0.status + ' ' + String(s0.why).slice(0, 600));
  await door(d1, 'model.convert');
  const s1 = await door(d1, 'model.save file=s.db'), a1 = A(s1), f1 = path.join(d1, 's.db'), ic = fs.existsSync(f1) ? cp.spawnSync('sqlite3', [f1, 'PRAGMA integrity_check'], { encoding: 'utf8' }).stdout.trim() : 'no file';
  const ph = a1.phases || {}, sumPh = ['gate_ms', 'heal_and_regate_ms', 'fold_and_catalog_ms', 'read_back_ms', 'file_write_ms'].reduce((s, k) => s + (Number(ph[k]) || 0), 0);
  chk('M1 a clean save writes the .db the page folded: the file\'s sha256 (computed here) = the page\'s sha256 of its catalog version, the database is sound, and the phase times add up to no more than the total',
    s1.status === 'ok' && sha(f1) === a1.sha256 && fs.statSync(f1).size === a1.bytes && ic === 'ok' && sumPh <= a1.total_ms && sumPh >= a1.total_ms * 0.5,
    s1.status + ' file sha=' + String(sha(f1)).slice(0, 12) + ' page sha=' + String(a1.sha256).slice(0, 12) + ' bytes=' + a1.bytes + ' integrity=' + ic + ' phases=' + JSON.stringify(ph) + ' total=' + a1.total_ms);
  L('§MODEL_SAVE_PROFILE elements=' + a1.elements + ' total_ms=' + a1.total_ms + ' ' + JSON.stringify(ph));
  const s5 = await door(d1, 'model.save file=../out.db');
  chk('M5 a save file outside the folder is refused and not written', s5.status === 'refused' && /leaves it/.test(s5.why) && !fs.existsSync(path.join(path.dirname(d1), 'out.db')), s5.status + ' ' + String(s5.why).slice(0, 80));
  const before = sha(f1), c1 = await door(d1, 'model.close');
  chk('M4b close right after a save writes nothing new (the file is unchanged, the answer says saved: null)', c1.status === 'ok' && A(c1).saved == null && sha(f1) === before, c1.status + ' saved=' + JSON.stringify(A(c1).saved) + ' file same=' + (sha(f1) === before));
  // session 2: M4 (a file named on open; close saves first)
  const d2 = fresh('b'); await door(d2, OPEN + ' file=m.db'); await door(d2, 'model.convert'); const f2 = path.join(d2, 'm.db');
  const c2 = await door(d2, 'model.close'), sv = A(c2).saved || {};
  chk('M4 with file=m.db named on model.open, close saves first: m.db exists, its sha256 = the page\'s, then the session is gone', c2.status === 'ok' && fs.existsSync(f2) && sha(f2) === sv.sha256 && !fs.existsSync(path.join(d2, '.model_session.json')),
    c2.status + ' saved=' + JSON.stringify(sv).slice(0, 120) + ' file=' + fs.existsSync(f2));
  // session 3: M3 (changes, no file) and the add-a-bay finding
  const d3 = fresh('c'); await door(d3, OPEN); await door(d3, 'model.convert');
  const c3 = await door(d3, 'model.close'), alive = fs.existsSync(path.join(d3, '.model_session.json')), b3 = await door(d3, 'model.addbay end=high');
  chk('M3 close with unsaved changes and no file is refused (it names model.save file= and discard=Y) and the session stays open (its state file is there and the next line works)', c3.status === 'refused' && /unsaved changes/.test(c3.why) && /discard=Y/.test(c3.why) && alive && b3.status === 'ok', c3.status + ' ' + String(c3.why).slice(0, 90) + ' · state file=' + alive + ' next line=' + b3.status);
  // the finding, order A: convert -> addbay -> save (no save in between)
  const sA = await door(d3, 'model.save file=bayA.db');
  L('§MODEL_SAVE_FINDING order=convert,addbay,save addbay_gate=' + JSON.stringify(A(b3).gate) + ' save=' + sA.status + ' ' + String(sA.why || A(sA).summary).slice(0, 900));
  await door(d3, 'model.undo');
  const c4 = await door(d3, 'model.close discard=Y');
  // the finding, order B: convert -> save -> addbay -> save (a save rolls the Save gate's baseline forward)
  const d4 = fresh('d'); await door(d4, OPEN); await door(d4, 'model.convert'); const sB0 = await door(d4, 'model.save file=b0.db'), bB = await door(d4, 'model.addbay end=high'), sB = await door(d4, 'model.save file=bayB.db');
  L('§MODEL_SAVE_FINDING order=convert,save,addbay,save first_save=' + sB0.status + ' addbay_gate=' + JSON.stringify(A(bB).gate) + ' save=' + sB.status + ' ' + String(sB.why || A(sB).summary).slice(0, 900));
  await door(d4, 'model.close discard=Y');
  chk('M3b close discard=Y drops the changes on purpose and closes', c4.status === 'ok' && A(c4).discarded === true && !fs.existsSync(path.join(d3, '.model_session.json')), c4.status + ' discarded=' + A(c4).discarded);
  L('§WITNESS_MODEL_SAVE pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + ' verdict=' + (fail ? 'FAIL' : inc ? 'INCONCLUSIVE' : 'PASS') + (process.env.MODELSES_BREAK ? ' (MODELSES_BREAK=' + process.env.MODELSES_BREAK + ')' : ''));
  process.exit(fail ? 1 : inc ? 2 : 0);
})().catch(e => { L('§W-MODEL-SAVE ERROR ' + e.stack); process.exit(2); });
