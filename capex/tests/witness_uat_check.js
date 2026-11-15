#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-UAT-CHECK (bim-ootb prompts/CAPEX_DASHBOARD.md §5.87). READ THE LOG: the §UATCK lines carry the evidence, the exit code does not.
// THE ISSUE IT PROVES OR DISPROVES: "the UAT checker page passes a run that differs from the proven one, or fails one that equals it".
//   K1 the pack's manifest states exactly what its W-UAT-CHAIN run read (B2.6 / B2.9 / B3.1), and the page finds every file's sha256 intact
//   A  a tester run that equals the proven run (W-UAT-CHAIN outputs): all four rows PASS, verdict PASS
//   B  the BREAK run (no exclude box): B0.9, B2.8, B2.9 and B3.1 FAIL, verdict FAIL
//   C  nothing given: every row NOT GIVEN, verdict INCONCLUSIVE (never PASS)
//   K2 a pack with one marked file changed but its manifest kept: the page refuses it (damaged), the button stays off
// Inputs (made by W-UAT-CHAIN with UAT_OUT, and capex/tools/uat_pack.js): UAT_PACK=<zip> UAT_RUN=<UAT_OUT dir> UAT_RUN_BREAK=<UAT_OUT dir of the BREAK run>; SKIP without.
// Usage: UAT_PACK=… UAT_RUN=… UAT_RUN_BREAK=… NODE_PATH=~/bim-compiler/node_modules node capex/tests/witness_uat_check.js
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os'), cp = require('child_process');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer')), sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..', '..'), PACK = process.env.UAT_PACK || '', RUN = process.env.UAT_RUN || '', RUNB = process.env.UAT_RUN_BREAK || '';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css' };
let judged = 0, fails = 0; const say = s => console.log(s), ck = (id, c, i) => { judged++; if (!c) fails++; say('§UATCK ' + id + ' ' + (c ? 'PASS' : 'FAIL') + ' ' + JSON.stringify(i).slice(0, 600)); };
(async () => {
  if (![PACK, path.join(RUN, 'run.json'), path.join(RUNB, 'run.json')].every(f => f && fs.existsSync(f))) { say('§UATCK SKIP needs UAT_PACK, UAT_RUN and UAT_RUN_BREAK (private set)'); process.exit(0); }
  const run = JSON.parse(fs.readFileSync(path.join(RUN, 'run.json'), 'utf8')), runB = JSON.parse(fs.readFileSync(path.join(RUNB, 'run.json'), 'utf8'));
  const man = JSON.parse(cp.execFileSync('unzip', ['-p', PACK, 'manifest.json'], { encoding: 'utf8' }));
  ck('K1a the manifest states what its chain run read', !run.break && man.expected['B2.6'] === run.proven['B2.6'] && man.expected['B2.9'] === run.proven['B2.9'] && man.expected['B3.1'] === run.proven['B3.1'] && man.commit === run.commit,
    { manifest: man.expected, run: run.proven, commit: man.commit.slice(0, 8) });
  // K2's damaged pack: the same files, one marked sheet changed by one character, the manifest (and its sha256) kept
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'uatck-')), X = path.join(TMP, 'x'); fs.mkdirSync(X); cp.execFileSync('unzip', ['-q', PACK, '-d', X]);
  const victim = path.join(X, 'marked', fs.readdirSync(path.join(X, 'marked')).sort()[0]); fs.appendFileSync(victim, '\n999\nDAMAGED\n'); const BAD = path.join(TMP, 'damaged.zip');
  cp.execFileSync('zip', ['-q', '-r', BAD, '.'], { cwd: X });
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); }); await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  async function mark(packFile, tester, label) {   // tester = { dir, run } or null
    const pg = await br.newPage(), logs = []; pg.on('console', m => { const t = m.text(); if (/§UATCHECK/.test(t)) logs.push(t); }); pg.on('pageerror', e => say('§UATCK ' + label + ' PAGEERR ' + String(e).slice(0, 200)));
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/capex/uat/check.html', { waitUntil: 'load' });
    await (await pg.$('#pack')).uploadFile(packFile);
    for (let i = 0; i < 60 && !logs.some(l => /pack (ok|refused)/.test(l)); i++) await sleep(250);
    const packLine = logs.find(l => /pack (ok|refused)/.test(l)) || '(no pack line)', info = await pg.$eval('#packinfo', e => e.textContent), enabled = await pg.$eval('#go', e => !e.disabled);
    let res = null;
    if (enabled) {
      if (tester) { const md = path.join(tester.dir, 'tester', 'marked'); await (await pg.$('#marked')).uploadFile(...fs.readdirSync(md).sort().map(f => path.join(md, f))); await (await pg.$('#db')).uploadFile(path.join(tester.dir, 'tester', 'SHED_extracted.db'));
        await pg.type('#vline', String(tester.run.tester['B2.9'] || '')); await pg.type('#cline', String(tester.run.tester['B3.1'] || '')); }
      await pg.click('#go'); for (let i = 0; i < 120 && !logs.some(l => /_VERDICT/.test(l)); i++) await sleep(250);
      res = await pg.evaluate(() => window.__uatResult ? { verdict: window.__uatResult.verdict, rows: window.__uatResult.rows.map(r => [r.row, r.verdict]) } : null);
    }
    say('§UATCK ' + label + ': ' + packLine + ' | page says: ' + info + ' | result ' + JSON.stringify(res)); await pg.close(); return { packLine, info, enabled, res };
  }
  const A = await mark(PACK, { dir: RUN, run }, 'A');
  ck('K1b the page finds the pack intact (every sha256)', /pack ok files=\d+/.test(A.packLine) && A.enabled, { line: A.packLine });
  const v = r => r && Object.fromEntries(r.rows);
  ck('A a run equal to the proven one: all four rows PASS', A.res && A.res.verdict === 'PASS' && ['B0.9', 'B2.8', 'B2.9', 'B3.1'].every(k => v(A.res)[k] === 'PASS'), A.res);
  const B = await mark(PACK, { dir: RUNB, run: runB }, 'B');
  ck('B the BREAK run (no exclude box): B0.9, B2.8, B2.9, B3.1 FAIL', runB.break && B.res && B.res.verdict === 'FAIL' && ['B0.9', 'B2.8', 'B2.9', 'B3.1'].every(k => v(B.res)[k] === 'FAIL'), { breakRun: runB.break, res: B.res, lines: runB.tester });
  const C = await mark(PACK, null, 'C');
  ck('C nothing given: every row NOT GIVEN, verdict INCONCLUSIVE', C.res && C.res.verdict === 'INCONCLUSIVE' && C.res.rows.every(r => r[1] === 'NOT GIVEN'), C.res);
  const K2 = await mark(BAD, { dir: RUN, run }, 'K2');
  ck('K2 a damaged pack is refused, the button stays off', /pack refused .*damaged/.test(K2.packLine) && !K2.enabled && !K2.res, { line: K2.packLine, enabled: K2.enabled });
  await br.close(); srv.close();
  const verdict = fails ? 'FAIL' : judged ? 'PASS' : 'INCONCLUSIVE'; say('§UATCK_VERDICT ' + verdict + ' judged=' + judged + ' fails=' + fails); process.exit(fails ? 1 : 0);
})().catch(e => { say('§UATCK STOPPED ' + (e.stack || e).toString().slice(0, 500)); process.exit(1); });
