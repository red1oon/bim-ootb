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
 */
'use strict';
const path = require('path'), { spawn } = require('child_process');
const { runE2E } = require('./e2e_harness');
const CLI = path.join(__dirname, '..', 'tools', 'edit_cli.js');
const call = (...a) => new Promise((res) => { let o = ''; const p = spawn('node', [CLI, ...a], { env: process.env, stdio: ['ignore', 'pipe', 'ignore'] }); p.stdout.on('data', d => { o += d; }); p.on('close', c => { let j = null; try { j = JSON.parse(o); } catch (e) {} res({ code: c, raw: o, json: j }); }); });
const edits = (r) => r.json && JSON.stringify(r.json.edits);
const L = (m) => console.log('§W-EDIT-CLI ' + m);
const J1 = ['--building', 'SampleHouse', '--grid', 'gx1', '--move', '1'], J2 = ['--building', 'HospitalGarage', '--grid', 'gy8', '--move', '1.5'];

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

  let pass = 0, fail = 0; const chk = (n, c, d) => { if (c) pass++; else fail++; console.log((c ? '  ✅ ' : '  ❌ ') + n + (d ? '  ' + d : '')); };
  const s1 = await call(...J1), g1 = await call(...J2);
  chk('C5 stdout parses whole as JSON, exit 0', s1.code === 0 && !!s1.json && g1.code === 0 && !!g1.json && s1.json.ok === true);
  chk('C1a SampleHouse through the CLI = the page, byte for byte', edits(s1) === '[' + inPageSH + ']', 'bytes=' + (inPageSH || '').length);
  chk('C1b Garage through the CLI = the page, byte for byte', edits(g1) === '[' + inPageG + ']', 'bytes=' + (inPageG || '').length);
  const s2 = await call(...J1);
  chk('C2 the same call twice: identical edits', edits(s1) === edits(s2));
  const conc = await Promise.all([call(...J1), call(...J1), call(...J2), call(...J2)]);
  chk('C3 four at once, under load: same bytes as the quiet runs', edits(conc[0]) === edits(s1) && edits(conc[1]) === edits(s1) && edits(conc[2]) === edits(g1) && edits(conc[3]) === edits(g1), 'ms=' + conc.map(c => c.json && c.json.ms).join(','));
  const other = await call('--building', 'SampleHouse', '--grid', 'gx1', '--move', '0.5');
  chk('C4 control: a different move gives a different report', !!edits(other) && edits(other) !== edits(s1));
  const un = await call('--building', 'SampleHouse', '--grid', 'nope', '--move', '1');
  chk('C6a unknown line: refused, the reason, exit 3', un.code === 3 && un.json.ok === false && un.json.edits[0].refused === true && /no grid line nope/.test(un.json.edits[0].reason), JSON.stringify(un.json && un.json.edits[0]));
  const en = await call('--building', 'HospitalGarage', '--grid', 'gy12', '--move', '0.6');
  chk('C6b engine refusal: refused, its reason, exit 3', en.code === 3 && en.json.edits[0].refused === true && /§DAGEVU refused/.test(en.json.edits[0].reason), (en.json && en.json.edits[0].reason || '').slice(0, 90));
  const us = await call('--grid', 'x');
  chk('C6c usage error: exit 2, nothing on stdout', us.code === 2 && us.raw === '');
  L('time quiet SampleHouse ms=' + s1.json.ms + ',' + s2.json.ms + ' Garage ms=' + g1.json.ms + ' | four at once ms=' + conc.map(c => c.json && c.json.ms).join(','));
  chk('C7 a time is reported per run', s1.json.ms > 0 && g1.json.ms > 0);
  const total = a.fail + b.fail + fail;
  console.log('§WITNESS_EDIT_CLI pass=' + pass + ' fail=' + total + ' verdict=' + (total ? 'FAIL' : 'PASS'));
  process.exit(total ? 1 : 0);
})();
