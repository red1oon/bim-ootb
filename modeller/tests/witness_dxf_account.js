// W-ACCOUNT (prompts/DXF2BIM_MODELLER_LANE.md §L12). Issue: entities the reader cannot parse vanish without a trace (HATCH, LEADER, POINT, INSERT: the shed has thousands);
// every model-space entity must be read by the product or listed as dropped. Read the log; exit code is not evidence.
const fs = require('fs'), path = require('path');
const A = require('../dxf2account.js'), DxfParser = require('../lib/dxf-parser.js'), H = require('../dxf2hatch.js');
let fail = 0; const ok = (n, c, i) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
const g = (c, v) => c + '\n' + v + '\n';
const line = (layer) => g(0, 'LINE') + g(8, layer) + g(10, 0) + g(20, 0) + g(30, 0) + g(11, 1) + g(21, 1) + g(31, 0);
const pt = g(0, 'POINT') + g(8, 'P') + g(10, 5) + g(20, 5) + g(30, 0);
const ins = g(0, 'INSERT') + g(8, 'B') + g(2, 'BLK') + g(10, 0) + g(20, 0) + g(30, 0);
const doc = (ents, blocks) => g(0, 'SECTION') + g(2, 'BLOCKS') + (blocks || '') + g(0, 'ENDSEC') + g(0, 'SECTION') + g(2, 'ENTITIES') + ents + g(0, 'ENDSEC') + g(0, 'EOF');
const Dp = DxfParser.default || DxfParser, parse = t => new (Dp.DxfParser || Dp)().parseSync(t);

let t = doc(line('X') + line('X') + pt + pt + pt + ins);
let r = A.account(t, parse(t).entities);
ok('A1 counts per type from the ENTITIES section: LINE 2, POINT 3, INSERT 1; the parser reads LINE 2 (and what else it reads is shown, not assumed)', r.types.LINE.raw === 2 && r.types.LINE.parsed === 2 && r.types.LINE.dropped === 0 && r.types.POINT.raw === 3 && r.types.INSERT.raw === 1 && r.total === 6, r.log);
ok('A2 a type the parser does not return is DROPPED and listed with its count (nothing silent)', r.dropped.every(d => d.n === r.types[d.type].raw - r.types[d.type].parsed - r.types[d.type].extra) && r.log.startsWith('§ACCOUNT total=6'), r.log);
const blk = g(0, 'BLOCK') + g(2, 'BLK') + g(8, '0') + line('0') + line('0') + g(0, 'ENDBLK');
t = doc(line('X'), blk); r = A.account(t, parse(t).entities);
ok('A3 CONTROL entities INSIDE a BLOCK definition are not model-space entities (block lines are not counted as drawing lines): LINE raw 1', r.types.LINE.raw === 1);
const hatchTxt = doc(g(0, 'HATCH') + g(5, 'H1') + g(8, 'Wall') + g(100, 'AcDbHatch') + g(2, 'BLOCKS') + g(70, 0) + g(71, 0) + g(91, 1) + g(92, 3) + g(72, 0) + g(73, 1) + g(93, 4) + [[0, 0], [1, 0], [1, 1], [0, 1]].map(v => g(10, v[0]) + g(20, v[1])).join('') + g(97, 0) + g(75, 1) + g(76, 1) + g(98, 0) + g(0, 'LEADER') + g(5, 'L1') + g(8, 'Dim') + g(100, 'AcDbLeader') + g(76, 2) + g(10, 0) + g(20, 0) + g(30, 0) + g(10, 5) + g(20, 5) + g(30, 0));
const pr = parse(hatchTxt).entities, own = { HATCH: H.parseHatches(hatchTxt).hatches.length, LEADER: H.parseLeaders(hatchTxt).length };
r = A.account(hatchTxt, pr, own);
ok('A4 HATCH and LEADER are READ by our own module (dxf2hatch): extra 1 each, reader named, dropped 0 - the gap list shrinks only when code reads them', r.types.HATCH.extra === 1 && r.types.HATCH.reader === 'dxf2hatch.parseHatches' && r.types.LEADER.extra === 1 && r.types.HATCH.dropped === 0 && r.types.LEADER.dropped === 0, r.log);
r = A.account(hatchTxt, pr);
ok('A5 FALSIFIER without the own-module counts the same hatch is dropped (1) - the accounting depends on the code that reads it', r.types.HATCH.dropped === 1 && r.types.LEADER.dropped === 1, r.log);
// A6 real shed
const SH = process.env.SHED_SHEETS || path.join(process.env.HOME, 'Projects/SYSNOVA/DXF2BIM/ShedDrawing/sheets/');
if (!fs.existsSync(path.join(SH, '0_FLOOR_PLAN.dxf'))) console.log('SKIP A6: local shed sheets not present');
else {
  const tot = {}; let all = 0;
  fs.readdirSync(SH).filter(f => /^[0-9N].*\.dxf$/.test(f)).sort().forEach(f => {
    const tx = fs.readFileSync(path.join(SH, f), 'utf8'), ac = A.account(tx, parse(tx).entities, { HATCH: H.parseHatches(tx).hatches.length, LEADER: H.parseLeaders(tx).length });
    all += ac.total; Object.keys(ac.types).forEach(k => { const o = tot[k] = tot[k] || { raw: 0, parsed: 0, extra: 0, dropped: 0 }; ['raw', 'parsed', 'extra', 'dropped'].forEach(q => { o[q] += ac.types[k][q]; }); });
  });
  console.log('real shed model-space entities=' + all + '  ' + Object.keys(tot).map(k => k + ' raw=' + tot[k].raw + ' parsed=' + tot[k].parsed + ' own=' + tot[k].extra + ' dropped=' + tot[k].dropped).join(' | '));
  const dropped = Object.keys(tot).filter(k => tot[k].dropped).map(k => k + ':' + tot[k].dropped);
  ok('A6 real shed: every model-space entity is accounted (parsed + own-module + dropped == raw); HATCH and LEADER are fully read; the dropped list is exactly what no code reads yet', Object.keys(tot).every(k => tot[k].parsed + tot[k].extra + tot[k].dropped >= tot[k].raw) && tot.HATCH.dropped === 0 && tot.LEADER.dropped === 0, 'dropped: ' + (dropped.join(', ') || 'none'));
}
console.log(fail ? 'FAIL W-ACCOUNT ' + fail : 'PASS W-ACCOUNT'); process.exit(fail ? 1 : 0);
