// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — scope: W-LEVEL (prompts/DXF2BIM_FOUNDATION_LANE.md §D37, PR-LEVEL). Read the printed § lines after EVERY run; exit code alone is not evidence.
// Issue each check proves or disproves: L1 the raw shed gets @LEVEL=0 (inferred) on its 3 plans and the HAXIS chain closes without typing; L2 a set whose plans state levels gets
// NO PR-LEVEL; L3 a title naming a storey is refused with the reason; L4 falsifier: the rule off -> L1's rows vanish (so L1 is not vacuous).
// Needs private local material: SHED_RAW_DIR (the raw shed sheets) and the marked shed (~/Videos/dxf2bim_film_work/why/cli/marked); a missing set prints SKIP / INCONCLUSIVE, never PASS.
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..'), CLI = require(path.join(ROOT, 'modeller', 'dxf2bim_cli.js'));
const RAW = process.env.SHED_RAW_DIR || '', MARKED = path.join(process.env.HOME, 'Videos/dxf2bim_film_work/why/cli/marked');
let fails = 0, judged = 0; const ok = (id, c, m) => { judged++; console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
const files = d => fs.readdirSync(d).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(d, f));
const run = fl => { const L = []; CLI.run(CLI.parseArgs(['--sheets'].concat(fl, ['--out', fs.mkdtempSync(path.join(os.tmpdir(), 'lvl-')), '--accept-suggestions'])), s => L.push(s)); return L; };
const rows = (L, rule) => L.filter(l => new RegExp('^§CLI mark .*\\(' + rule + '\\)$').test(l));
if (!RAW || !fs.existsSync(RAW) || files(RAW).length !== 9) { console.log('§SKIP W-LEVEL  SHED_RAW_DIR unset or not 9 sheets (INCONCLUSIVE: nothing judged)'); console.log('§W-LEVEL INCONCLUSIVE'); process.exit(0); }
const raw = files(RAW);
const L1 = run(raw), lv = rows(L1, 'PR-LEVEL'), hx = rows(L1, 'PR-HAXIS');
ok('L1[shed raw] the 3 plans get @LEVEL=0 as PR-LEVEL (floor, beam, foundation) and the elevations/section then get HAXIS without anything typed',
  lv.length === 3 && lv.every(l => /@LEVEL=0 /.test(l)) && ['0_FLOOR_PLAN', '3_BEAM_LAYOUT', '4_FOUNDATION_LAYOUT'].every(n => lv.some(l => l.indexOf('sheet=' + n) >= 0)) && hx.length === 5, 'level rows=' + lv.length + ' haxis rows=' + hx.length);
if (fs.existsSync(MARKED) && files(MARKED).length === 9) { const L2 = run(files(MARKED)); ok('L2[shed marked] plans state their levels: 0 PR-LEVEL rows (the default never overrides a stated level)', rows(L2, 'PR-LEVEL').length === 0, 'rows=' + rows(L2, 'PR-LEVEL').length); } else console.log('§SKIP L2  marked shed absent (INCONCLUSIVE)');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lvl3-')), f3 = raw.map(f => { const o = path.join(tmp, path.basename(f)); let t = fs.readFileSync(f, 'utf8'); if (/0_FLOOR_PLAN/.test(f)) { t = t.replace(/Shed Floor Plan/g, 'First Floor Plan'); } fs.writeFileSync(o, t); return o; });
const L3 = run(f3);
ok('L3[title names a storey] "First Floor Plan" in an otherwise raw set: 0 PR-LEVEL rows (refused: its level is not a default)', rows(L3, 'PR-LEVEL').length === 0, 'rows=' + rows(L3, 'PR-LEVEL').length);
process.env.DXF_NO_PRLEVEL = '1'; const L4 = run(raw); delete process.env.DXF_NO_PRLEVEL;
ok('L4[falsifier DXF_NO_PRLEVEL=1] with the rule off the 3 level rows and the 5 HAXIS rows are gone (L1 is not vacuous)', rows(L4, 'PR-LEVEL').length === 0 && rows(L4, 'PR-HAXIS').length === 0, 'level=' + rows(L4, 'PR-LEVEL').length + ' haxis=' + rows(L4, 'PR-HAXIS').length);
console.log('§W-LEVEL ' + (fails ? 'FAIL ' + fails : judged ? 'PASS' : 'INCONCLUSIVE')); process.exit(fails ? 1 : 0);
