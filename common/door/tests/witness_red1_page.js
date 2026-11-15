// ⚠ DO NOT REMOVE — W-RED1-PAGE (bim-compiler prompts/CLI_ERP_IVR.md §22.6, §22.11: paging a long list on a terminal). READ THE LOG; an exit code is not evidence.
//   P1 ISSUE (on a terminal a list taller than the screen scrolls off, or q does not stop it, or the prompt does not come back) · P2 ISSUE (a pipe gets fewer rows than the answer: the pager cut a script's output)
//   Falsifier: PAGE_BREAK=nostop (q is ignored: must FAIL P1). Needs `script` (util-linux) for a pseudo-terminal; without it P1 is INCONCLUSIVE.
//   Run: node common/door/tests/witness_red1_page.js > common/door/tests/logs/red1_page.log 2>&1
'use strict';
const path = require('path'), cp = require('child_process'), fs = require('fs'), os = require('os');
const { kit, ROOT } = require('./_kit');
const k = kit('W-RED1-PAGE'), RED1 = path.join(ROOT, 'common/door/red1.js'), BRK = process.env.PAGE_BREAK || '';
const sh = (cmd, ms) => new Promise((res) => { let o = ''; const p = cp.spawn('bash', ['-c', cmd], { env: Object.assign({}, process.env, { RED1_WARM: 'off' }, BRK ? { PAGE_BREAK: BRK } : {}) }); p.stdout.on('data', d => { o += d; }); p.stderr.on('data', d => { o += d; }); const t = setTimeout(() => p.kill(), ms); p.on('close', () => { clearTimeout(t); res(o); }); });
(async () => {
  const hist = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'r1p_')), 'h');
  const hasScript = cp.spawnSync('bash', ['-c', 'command -v script']).status === 0;
  if (!hasScript) k.incon('P1', 'no `script` command for a pseudo-terminal');
  else {
    const keys = "(sleep 2; printf 'cd Duplex\\r'; sleep 1; printf 'cd Element\\r'; sleep 3; printf 'ls limit=40\\r'; sleep 3; printf ' '; sleep 2; printf 'q'; sleep 2; printf 'pwd\\r'; sleep 2; printf 'exit\\r')";
    const out = (await sh(keys + " | script -qc \"stty rows 15 cols 160; RED1_HISTORY=" + hist + " node " + RED1 + "\" /dev/null", 40000)).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\r/g, '');
    const pg = /§RED1 page rows=(\d+) shown=(\d+) height=(\d+)/.exec(out), pwd = /^building=Duplex kind=Element$/m.test(out), stops = (out.match(/rows: Space next page/g) || []).length;
    k.L('P1 page=' + (pg ? pg[0] : 'none') + ' stops=' + stops + ' pwd after=' + pwd);
    k.chk('P1 on a 15-row terminal, `ls limit=40` stops each page (12 high), Space shows the next, q stops after 2 pages (22 of 40 shown) and the prompt takes the next line (pwd)',
      !!pg && pg[1] === '40' && pg[2] === '22' && pg[3] === '12' && stops === 2 && pwd, pg ? pg[0] : out.slice(-300));
  }
  const piped = await sh("printf 'cd Duplex\\ncd Element\\nls limit=40\\n' | node " + RED1 + " 2>/dev/null", 60000);
  const rows = piped.split('\n').filter(l => /^[0-9A-Za-z$_]{22}  /.test(l)).length;
  k.chk('P2 the same list through a pipe prints all 40 rows (no pager)', rows === 40 && !/rows: Space/.test(piped), 'rows=' + rows);
  k.end();
})().catch(e => { console.log('§W-RED1-PAGE FAIL ' + (e && e.stack || e)); process.exit(1); });
