// ⚠ DO NOT REMOVE — W-RED1-DRAW (bim-compiler prompts/CLI_ERP_IVR.md §22.8, §22.11 step R6: the clash funnel). READ THE LOG; an exit code is not evidence.
//   D1 ISSUE (a number in the drawing is not the answer's: the picture says something the Viewer did not) · D2 ISSUE (the --ascii form is not plain ASCII)
//   D3 ISSUE (a value whose parts do not add up is drawn anyway) · D4 ISSUE (the next-step tree shows a code the engine did not offer, or drops one)
//   Falsifiers: DRAW_BREAK=off1 (the drawing shows mesh clashes + 1: must FAIL D1) · dropone (the tree drops the last code: must FAIL D4). Needs the Viewer headless.
//   Run: node common/door/tests/witness_red1_draw.js > common/door/tests/logs/red1_draw.log 2>&1
'use strict';
const path = require('path'), cp = require('child_process');
const { kit, ROOT } = require('./_kit');
const k = kit('W-RED1-DRAW'), RED1 = path.join(ROOT, 'common/door/red1.js'), Dr = require(path.join(ROOT, 'common/door/draw_core.js')), BRK = process.env.DRAW_BREAK || '';
const run = (argv, input, env) => new Promise((res) => { let o = '', e = ''; const p = cp.spawn(process.execPath, argv, { env: Object.assign({}, process.env, env || {}), stdio: [input == null ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
  p.stdout.on('data', d => { o += d; }); p.stderr.on('data', d => { e += d; }); if (input != null) { p.stdin.write(input); p.stdin.end(); } p.on('close', c => res({ code: c, out: o, err: e })); });
(async () => {
  const s = await run([RED1], 'cd Duplex\nclash ARC MEP\n', BRK ? { DRAW_BREAK: BRK } : {});
  const m = /^§RED1 draw funnel lines=\d+ value=(.*)$/m.exec(s.err), drawn = s.out.split('\n').filter(l => /box overlaps|clash at mesh|inside the other|cleared by|do not touch|not judged/.test(l));
  if (!m || drawn.length !== 7) { k.incon('D1-D2', 'no funnel was drawn: ' + s.err.slice(-300)); return k.end(); }
  const v = JSON.parse(m[1]), nums = drawn.map(l => Number((/(\d+) /.exec(l.replace(/^[^\d]*/, '')) || [])[1]));
  const want = [v.bboxOverlaps, v.meshClashes, v.contained, v.cleared, v.obbRejected, v.triangleClear, v.unknown];
  k.L('D1 drawn=' + JSON.stringify(nums) + ' value=' + JSON.stringify(want));
  k.chk('D1 the 7 numbers of the funnel the session drew are the answer\'s own fields, in order (box overlaps, mesh clashes, inside, cleared, turned boxes, triangles, not judged)', JSON.stringify(nums) === JSON.stringify(want), JSON.stringify(nums));
  const a = Dr.funnel(v, { ascii: true }).join('\n');
  k.chk('D2 the --ascii funnel has no byte above 127 and the same numbers', !/[^\x00-\x7f]/.test(a) && a.match(/\d+/g).join(',') === Dr.funnel(v).join('\n').match(/\d+/g).join(','), a.split('\n')[1]);
  const bad = Dr.funnel(Object.assign({}, v, { cleared: v.cleared + 1 }));
  k.chk('D3 a value whose parts do not add up (cleared + 1) is not drawn; the reply names the sum that fails', bad.length === 1 && /do not add up/.test(bad[0]), bad[0].slice(0, 120));
  // D4 the next-step tree of a draft order: its codes are erp.actions' legal list, in order; a code with a do word shows the line that runs it
  const t = await run([RED1], 'cd Order\nnext S00002\n', BRK ? { DRAW_BREAK: BRK } : {}), tm = /^§RED1 draw tree lines=\d+ legal=(.*)$/m.exec(t.err);
  const tl = t.out.split('\n').filter(l => /^(├─|└─|\+-|\\-) /.test(l)), codes = tl.map(l => l.slice(3, 5));
  if (!tm) k.incon('D4', 'no tree drawn (is the order S00002 a draft in this seed?): ' + t.err.slice(-200));
  else { const legal = JSON.parse(tm[1]); k.L('D4 legal=' + JSON.stringify(legal) + ' drawn=' + JSON.stringify(codes) + ' lines=' + JSON.stringify(tl));
    k.chk('D4 `next S00002` draws exactly erp.actions\' legal codes in order, and CO/VO point at `do complete S00002` / `do void S00002`', JSON.stringify(codes) === JSON.stringify(legal) && tl.some(l => /CO  → do complete S00002/.test(l)) && tl.some(l => /VO  → do void S00002/.test(l)), codes.join(',')); }
  k.end();
})().catch(e => { console.log('§W-RED1-DRAW FAIL ' + (e && e.stack || e)); process.exit(1); });
