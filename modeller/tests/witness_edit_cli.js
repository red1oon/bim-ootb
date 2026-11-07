#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-EDIT-CLI (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §11). READ THE §-LOG after every run.
 * ISSUE: no proposer or macro can be measured because no call takes an edit and returns the proof. Each claim names what it proves or disproves:
 *   C1 the CLI is a second, different answer: byte-for-byte against the report the page itself produces
 *   C2 not repeatable: the same call twice gives identical edits
 *   C3 the answer depends on machine load: the same call, two at once, must give the same bytes (a first build returned "not judged" when slow)
 *   C4 C1 cannot fail: a different move must give a different report
 *   C5 a caller cannot read it: stdout parses whole as JSON
 *   C6 a refusal reads as success or crashes: unknown line and engine refusal give refused, the reason, exit 3
 *   C7 "fast" without a number: time per run is printed
 *   C8 a block shift through the CLI is a second answer (§13.1): byte for byte against the page, twice identical
 *   C9 a default grid passed off as the building's (§13.2): --lines states its source, --own-grid lays the derived lines, the default-grid answers stay as they were
 *   C10 the measuring switch leaks (§13.6): no effect at theta 0, an effect on the rotated Garage, off unless asked
 *   C12 the CLI needs this repo (§14.2): run from outside it against --url, it must give the same bytes
 *   C13 the stop lets red through (§15.1): a red edit is stopped, exit 3, with the page's own report inside
 *   C14 a stop leaves the model changed: the next edit in the same call must equal that edit made alone
 *   C15 the stop changes a clean answer: an edit with no red passes byte for byte
 *   C16 a not-judged row reads as passed: it is listed as not judged
 *   C11 a refused shift reads as success: a crossing wall carrying a cut gives refused, the reason, exit 3
 */
'use strict';
const path = require('path'), { spawn } = require('child_process');
const { runE2E } = require('./e2e_harness');
const CLI = path.join(__dirname, '..', 'tools', 'edit_cli.js');
const call = (...a) => new Promise((res) => { let o = ''; const p = spawn('node', [CLI, ...a], { env: process.env, stdio: ['ignore', 'pipe', 'ignore'] }); p.stdout.on('data', d => { o += d; }); p.on('close', c => { let j = null; try { j = JSON.parse(o); } catch (e) {} res({ code: c, raw: o, json: j }); }); });
const edits = (r) => r.json && JSON.stringify(r.json.edits);
const L = (m) => console.log('§W-EDIT-CLI ' + m);
const J1 = ['--building', 'SampleHouse', '--report-only', '--grid', 'gx1', '--move', '1'], J2 = ['--building', 'HospitalGarage', '--report-only', '--grid', 'gy8', '--move', '1.5'];   // --report-only: C1 compares with the page, which never stops

(async () => {
  let inPageSH = null, inPageG = null;
  const a = await runE2E('W-EDIT-CLI-PAGE', async (t) => {
    await t.open('SampleHouse', {});
    for (let i = 0; i < 240; i++) { if (await t.pg.evaluate(() => !!window.__saveGateBaseline && Object.keys(window.__saveGateBaseline).length > 0)) break; await t.sleep(500); }
    await t.sleep(1500);
    inPageSH = await t.pg.evaluate(async () => { await window.__gridStretch('gx1', 1); return JSON.stringify(window.__lastEditReport); });
    t.assert('the page produced a report', !!inPageSH);
  }, { noExit: true });
  const b = await runE2E('W-EDIT-CLI-PAGE-G', async (t) => {
    await t.open('HospitalGarage', {});
    for (let i = 0; i < 240; i++) { if (await t.pg.evaluate(() => !!window.__saveGateBaseline && Object.keys(window.__saveGateBaseline).length > 0)) break; await t.sleep(500); }
    for (let i = 0; i < 60 && !t.slog.some(l => /§STRWALK-OL §GEO-SERVED/.test(l)); i++) await t.sleep(500);
    await t.sleep(5000); await t.clickSel('#b-gridmove'); await t.sleep(600);
    inPageG = await t.pg.evaluate(async () => { await window.__gridStretch('gy8', 1.5); return JSON.stringify(window.__lastEditReport); });
    t.assert('the page produced a report', !!inPageG);
  }, { noExit: true });

  let inPageShift = null;
  const c = await runE2E('W-EDIT-CLI-PAGE-SHIFT', async (t) => {
    await t.open('HospitalGarage', {});
    for (let i = 0; i < 240; i++) { if (await t.pg.evaluate(() => !!window.__saveGateBaseline && Object.keys(window.__saveGateBaseline).length > 0)) break; await t.sleep(500); }
    for (let i = 0; i < 60 && !t.slog.some(l => /§STRWALK-OL §GEO-SERVED/.test(l)); i++) await t.sleep(500);
    await t.sleep(5000); await t.clickSel('#b-gridmove'); await t.sleep(600);
    inPageShift = await t.pg.evaluate(async () => { await window.__gridShift('gy9', 1.51); return JSON.stringify(window.__lastEditReport); });
    t.assert('the page produced a shift report', !!inPageShift);
  }, { noExit: true });

  let pass = 0, fail = 0; const chk = (n, c, d) => { if (c) pass++; else fail++; console.log((c ? '  ✅ ' : '  ❌ ') + n + (d ? '  ' + d : '')); };
  const s1 = await call(...J1), g1 = await call(...J2);
  chk('C5 stdout parses whole as JSON, exit 0', s1.code === 0 && !!s1.json && g1.code === 0 && !!g1.json && s1.json.ok === true);
  chk('C1a SampleHouse through the CLI = the page, byte for byte', edits(s1) === '[' + inPageSH + ']', 'bytes=' + (inPageSH || '').length);
  chk('C1b Garage through the CLI = the page, byte for byte', edits(g1) === '[' + inPageG + ']', 'bytes=' + (inPageG || '').length);
  const s2 = await call(...J1);
  chk('C2 the same call twice: identical edits', edits(s1) === edits(s2));
  const conc = await Promise.all([call(...J1), call(...J1), call(...J2), call(...J2)]);
  chk('C3 four at once, under load: same bytes as the quiet runs', edits(conc[0]) === edits(s1) && edits(conc[1]) === edits(s1) && edits(conc[2]) === edits(g1) && edits(conc[3]) === edits(g1), 'ms=' + conc.map(c => c.json && c.json.ms).join(','));
  const other = await call('--building', 'SampleHouse', '--report-only', '--grid', 'gx1', '--move', '0.5');
  chk('C4 control: a different move gives a different report', !!edits(other) && edits(other) !== edits(s1));
  const un = await call('--building', 'SampleHouse', '--grid', 'nope', '--move', '1');
  chk('C6a unknown line: refused, the reason, exit 3', un.code === 3 && un.json.ok === false && un.json.edits[0].refused === true && /no grid line nope/.test(un.json.edits[0].reason), JSON.stringify(un.json && un.json.edits[0]));
  const en = await call('--building', 'HospitalGarage', '--grid', 'gy12', '--move', '0.6');
  chk('C6b engine refusal: refused, its reason, exit 3', en.code === 3 && en.json.edits[0].refused === true && /§DAGEVU refused/.test(en.json.edits[0].reason), (en.json && en.json.edits[0].reason || '').slice(0, 90));
  const us = await call('--grid', 'x');
  chk('C6c usage error: exit 2, nothing on stdout', us.code === 2 && us.raw === '');
  const SH = ['--building', 'HospitalGarage', '--report-only', '--shift', 'gy9', '--move', '1.51'], sa = await call(...SH), sb = await call(...SH);
  chk('C8a a shift through the CLI = the page, byte for byte', edits(sa) === '[' + inPageShift + ']', 'bytes=' + (inPageShift || '').length);
  chk('C8b the same shift twice: identical edits', edits(sa) === edits(sb));
  const ld = await call('--building', 'SampleHouse', '--lines'), lo = await call('--building', 'SampleHouse', '--own-grid', '--lines'), lg = await call('--building', 'HospitalGarage', '--own-grid', '--lines');
  chk('C9a without --own-grid a wall-bearing building says its lines are the app default', ld.json.model.grid_source === 'app-default', ld.json.model.grid_source);
  chk('C9b --own-grid lays the lines derived from the walls and says so', lo.json.model.grid_source === 'derived:arc-semigrid' && lo.json.model.lines.map(l => l.id).join() === 'gx0,gx1,gy0,gy1,gy2', JSON.stringify(lo.json.model.lines));
  chk('C9c a column-framed building is already on its own grid', lg.json.model.grid_source === 'column-derived');
  const own = await call('--building', 'SampleHouse', '--report-only', '--own-grid', '--grid', 'gx1', '--move', '1');
  chk('C9d --own-grid changes the answer, and the default-grid answer stays as C1a pinned it', !!edits(own) && edits(own) !== edits(s1) && edits(s1) === '[' + inPageSH + ']');
  const lb0 = await call('--building', 'SampleHouse', '--report-only', '--lattice-boxes', '--grid', 'gx1', '--move', '1'), lb1 = await call('--building', 'HospitalGarage', '--report-only', '--lattice-boxes', '--grid', 'gy8', '--move', '1.5');
  chk('C10a the switch has no effect at theta 0', edits(lb0) === edits(s1));
  chk('C10b the switch has an effect on the rotated Garage, and C1b shows it is off unless asked', !!edits(lb1) && edits(lb1) !== edits(g1));
  const rf = await call('--building', 'SampleHouse', '--own-grid', '--shift', 'gy1', '--move', '1.355');
  chk('C11 a refused shift: refused, the reason, exit 3', rf.code === 3 && rf.json.edits[0].refused === true && rf.json.edits[0].shift === true && /carries a GEOM_CUT/.test(rf.json.edits[0].reason), (rf.json && rf.json.edits[0].reason || '').slice(0, 90));
  const fs = require('fs'), os = require('os'), http = require('http'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit_cli_alone_')), alone = path.join(dir, 'edit_cli.js'), ROOT = path.join(__dirname, '..', '..');
  fs.copyFileSync(CLI, alone);
  const srv = http.createServer((q, r) => fs.readFile(path.join(ROOT, decodeURIComponent(q.url.split('?')[0])), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': /\.js$|\.mjs$/.test(q.url.split('?')[0]) ? 'text/javascript' : /\.html$/.test(q.url.split('?')[0]) ? 'text/html' : /\.wasm$/.test(q.url.split('?')[0]) ? 'application/wasm' : /\.json$/.test(q.url.split('?')[0]) ? 'application/json' : /\.css$/.test(q.url.split('?')[0]) ? 'text/css' : 'application/octet-stream', 'Accept-Ranges': 'bytes' }); r.end(b); })); await new Promise(z => srv.listen(0, z));
  const viaUrl = await new Promise((res) => { let o = ''; const p = spawn('node', [alone, '--url', 'http://localhost:' + srv.address().port + '/modeller/modeller.html', ...J1], { cwd: dir, env: process.env, stdio: ['ignore', 'pipe', 'ignore'] }); p.stdout.on('data', d => { o += d; }); p.on('close', z => { let j = null; try { j = JSON.parse(o); } catch (e) {} res({ code: z, json: j }); }); });
  srv.close(); fs.rmSync(dir, { recursive: true, force: true });
  chk('C12 one copied file, run from an empty folder against --url = the repo run, byte for byte', edits(viaUrl) === edits(s1), 'exit=' + viaUrl.code);
  const st = await call('--building', 'SampleHouse', '--grid', 'gx1', '--move', '1'), e0 = st.json && st.json.edits[0];
  chk('C13 a red edit is stopped: exit 3, the reason, and the page\'s own report inside', st.code === 3 && !!e0 && e0.stopped_by_gate === true && /Driven into a wall it touches: 2/.test(e0.reason) && JSON.stringify(e0.report) === inPageSH, (e0 && e0.reason || '').slice(0, 90));
  const two = await call('--building', 'SampleHouse', '--grid', 'gx1', '--move', '1', '--grid', 'gx1', '--move', '0.5');
  chk('C14 after a stop the next edit starts from Before: it equals that edit made alone', two.code === 3 && two.json.edits[0].stopped_by_gate === true && JSON.stringify(two.json.edits[1].stopped_by_gate ? two.json.edits[1].report : two.json.edits[1]) === JSON.stringify(other.json.edits[0]), JSON.stringify(two.json.gate));
  const cleanArgs = ['--building', 'HospitalGarage', '--lattice-boxes', '--grid', 'gy8', '--move', '-1.51'], cg = await call(...cleanArgs), co = await call(...cleanArgs, '--report-only');
  chk('C15 an edit with no red passes the stop byte for byte', cg.code === 0 && !!edits(cg) && edits(cg) === edits(co) && cg.json.gate[0].stopped === false, JSON.stringify(cg.json && cg.json.gate));
  chk('C16 a not-judged row is listed as not judged, never as passed', two.json.gate.every(g => g.not_judged.indexOf('span_red') >= 0) && cg.json.gate[0].not_judged.indexOf('span_red') < 0);
  L('time quiet SampleHouse ms=' + s1.json.ms + ',' + s2.json.ms + ' Garage ms=' + g1.json.ms + ' | four at once ms=' + conc.map(c => c.json && c.json.ms).join(','));
  chk('C7 a time is reported per run', s1.json.ms > 0 && g1.json.ms > 0);
  const total = a.fail + b.fail + c.fail + fail;
  console.log('§WITNESS_EDIT_CLI pass=' + pass + ' fail=' + total + ' verdict=' + (total ? 'FAIL' : 'PASS'));
  process.exit(total ? 1 : 0);
})();
