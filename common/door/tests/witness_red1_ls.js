// ⚠ DO NOT REMOVE — W-RED1-LS (bim-compiler prompts/CLI_ERP_IVR.md §22.6, §22.11 step R3: `ls` after a summary, the held answer, viewer.clashes rows=). READ THE LOG; an exit code is not evidence.
//   L1 ISSUE (`ls` after `clash` serves rows that are not the line's: a held answer of another line, or rows a fresh run would not give)
//   L2 ISSUE (rows=all drops rows: the rows returned are fewer than rowsTotal) · L3 ISSUE (a line without rows= changed: it no longer returns 20 rows, so older scripts read a different answer)
//   Falsifier: RED1_BREAK=stale (the session serves the first answer it holds for any line: must FAIL L1). A claim with nothing to judge says INCONCLUSIVE, never PASS.
//   Needs the Viewer headless (each clash run 20-100 s). Run: node common/door/tests/witness_red1_ls.js > common/door/tests/logs/red1_ls.log 2>&1
'use strict';
const path = require('path'), cp = require('child_process');
const { kit, ROOT, DOOR } = require('./_kit');
const k = kit('W-RED1-LS'), RED1 = path.join(ROOT, 'common/door/red1.js'), BRK = process.env.RED1_BREAK || '';
const run = (argv, env) => new Promise((res) => { let o = '', e = ''; const p = cp.spawn(process.execPath, argv, { env: Object.assign({}, process.env, env || {}), stdio: ['ignore', 'pipe', 'pipe'] }); p.stdout.on('data', d => { o += d; }); p.stderr.on('data', d => { e += d; }); p.on('close', c => res({ code: c, out: o, err: e })); });
const envsOf = (r) => r.out.split('\n').filter(l => l.charAt(0) === '{').map(l => JSON.parse(l));
(async () => {
  const s = await run([RED1, 'cd Duplex; cd Element; count; cd ..; clash ARC MEP; ls'], BRK ? { RED1_BREAK: BRK } : {});
  const E = envsOf(s), arrows = (s.err.match(/^→ .*$/mg) || []), held = (s.err.match(/^§RED1 held .*$/mg) || []);
  k.L('session lines=' + JSON.stringify(arrows) + ' held=' + held.length + ' answers=' + E.map(e => e.verb + ':' + e.status).join(','));
  const ls = E[E.length - 1], clash = E[E.length - 2];
  const fresh = envsOf(await run([DOOR, '--actor', 'human', 'viewer.clashes building=Duplex discA=ARC discB=MEP rows=all'])).pop();
  if (!fresh || fresh.status !== 'ok') k.incon('L1-L2', 'the Viewer did not answer the fresh run: ' + (fresh && fresh.why));
  else {
    const fr = fresh.answer;
    k.L('fresh summary=' + JSON.stringify(fr.summary) + ' rows=' + fr.rows.length + ' rowsTotal=' + fr.rowsTotal);
    const same = !!ls && ls.verb === 'viewer.clashes' && ls.held === true && JSON.stringify(ls.answer.rows) === JSON.stringify(fr.rows) && arrows[arrows.length - 1] === arrows[arrows.length - 2];
    k.chk('L1 `ls` after `clash ARC MEP` prints the SAME line, is served from the held answer (not re-run), and its rows equal a fresh run\'s rows', same,
      'ls verb=' + (ls && ls.verb) + ' held=' + (ls && ls.held) + ' rows=' + (ls && ls.answer && ls.answer.rows && ls.answer.rows.length) + ' fresh=' + fr.rows.length);
    k.chk('L2 rows=all returns every row: rows = rowsTotal, and the session\'s clash answer says the same', fr.rows.length === fr.rowsTotal && fr.rowsTotal > 20 && !!clash && clash.answer && clash.answer.rowsTotal === fr.rowsTotal,
      'rows=' + fr.rows.length + ' rowsTotal=' + fr.rowsTotal + ' session rowsTotal=' + (clash && clash.answer && clash.answer.rowsTotal));
  }
  const old = envsOf(await run([DOOR, '--actor', 'human', 'viewer.clashes building=Duplex discA=ARC discB=MEP'])).pop();
  if (!old || old.status !== 'ok') k.incon('L3', 'the Viewer did not answer: ' + (old && old.why));
  else k.chk('L3 the line without rows= still returns 20 rows (rowsTotal unchanged)', old.answer.rows.length === 20 && fresh && old.answer.rowsTotal === fresh.answer.rowsTotal, 'rows=' + old.answer.rows.length + ' rowsTotal=' + old.answer.rowsTotal);
  k.end();
})().catch(e => { console.log('§W-RED1-LS FAIL ' + (e && e.stack || e)); process.exit(1); });
