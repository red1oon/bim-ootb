#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-SET-PLACEHOLDER: prompts/DXF2BIM_ARCHITECT_REVIEW.md §D98. Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: a set where no sheet states a set name left every sheet's Set box empty and blocking until the user typed one (owner: "should be
 * defaulted to ie 'BUILD-NAME' to shut it up" … "still 'red' or yellow to signify it is a default"). The placeholder must unblock WITHOUT ever passing for a stated name.
 *   D1 OFFERED    — raw shed (no @SET on any sheet): Accept-all puts @SET=BUILD-NAME on all 9 sheets, each by rule PR-SET-PLACEHOLDER (never PR-SET, whose tier is "stated").
 *   D2 UNBLOCKED  — before: the marks' describe() lists SET as missing (on every sheet whose role asks for it); after D1: on none.
 *   D3 STATED WINS — one sheet states SHED: the other 8 are offered PR-SET SHED, no placeholder anywhere.
 *   D4 CONFLICT ASKS — two sheets state SHED and BARN: the other 7 are offered no set at all (no placeholder over a real conflict).
 *   D5 RENAME WINS — every sheet holds the placeholder, then one is typed SHED: the other 8 are offered PR-SET SHED (a real name replaces the placeholder).
 *   D6 CLI --set  — raw shed with --accept-suggestions --set FARM: every sheet SET=FARM, none left at BUILD-NAME (the placeholder must not block --set).
 *   D7 STAYS YELLOW — the editor's tier for PR-SET-PLACEHOLDER is "inferred" and its source label for a SET equal to the placeholder is the yellow "default" badge.
 * Input: the raw shed (SHED_RAW_DIR, default ~/Videos/dxf2bim_film_work/why/raw); missing -> §SKIP (the runner's ENV/SKIP baseline).
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const M = path.join(__dirname, '..'), C = require(path.join(M, 'dxf2bim_cli.js')), SG = require(path.join(M, 'dxf2suggest.js')), MK = require(path.join(M, 'dxf2bim/dxf2marks.js')), I = require(path.join(M, 'dxf2bim_import.js'));
const RAW = process.env.SHED_RAW_DIR || path.join(os.homedir(), 'Videos', 'dxf2bim_film_work', 'why', 'raw');
let fail = 0, judged = 0; const ok = (n, c, i) => { judged++; console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
const files = fs.existsSync(RAW) ? fs.readdirSync(RAW).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(RAW, f)) : [];
if (files.length !== 9) { console.log('§SKIP W-SET-PLACEHOLDER raw shed (9 sheets) not at ' + RAW); process.exit(0); }
const P = SG.SET_PLACEHOLDER, setOf = sh => (sh.marks.find(m => m.key === 'SET') || {}).value;
const missingSet = sh => MK.describe(sh.marks.map((m, i) => ({ raw: SG.markText(m), x: m.x, y: m.y, handle: (i + 1).toString(16) }))).errors.some(e => e.code === 'MARK:missing' && (e.keys || []).includes('SET'));
function cli(extra) { const lines = []; const res = C.run(C.parseArgs(['--sheets', ...files, '--out', path.join(os.tmpdir(), 'w_setph_' + process.pid), ...extra]), s => lines.push(s)); return { res, lines }; }
// the suggestion engine over a copy of the sheets with only the SET marks given (the CLI's own ctx)
function engine(sheets, sets) {
  const sh = sheets.map((s, i) => Object.assign({}, s, { marks: sets[i] ? [{ key: 'SET', value: sets[i], x: 0, y: 0, source: 'user' }] : [] })), SETX = I.setWith('DX');
  const sug = SG.create({ MK, sheets: () => sh, gridLayers: () => SETX.QUALIFY.layers.grid, levelLayers: () => SETX.MAP_LEVL.rules.filter(r => r.type === 'levelline').map(r => r.pattern) });
  return sh.map(s => sug.proposalsFor(s).list.filter(p => p.key === 'SET').map(p => p.rule + '=' + p.value));
}
// D1 + D2
const A = cli(['--accept-suggestions']), sheets = A.res.sheets;
const placed = A.lines.filter(l => /^§CLI mark sheet=\S+ @SET=/.test(l)), byRule = placed.map(l => (/\((PR-[A-Z-]+)\)/.exec(l) || [])[1]);
ok('D1 OFFERED no @SET on the raw shed: Accept-all puts @SET=' + P + ' on all ' + sheets.length + ' sheets, each by PR-SET-PLACEHOLDER', sheets.every(s => setOf(s) === P) && placed.length === sheets.length && byRule.every(r => r === 'PR-SET-PLACEHOLDER'),
  'placed=' + placed.length + ' rules=' + JSON.stringify([...new Set(byRule)]));
const before = sheets.map(s => Object.assign({}, s, { marks: s.marks.filter(m => m.key !== 'SET') })).filter(missingSet).length, after = sheets.filter(missingSet).length;
ok('D2 UNBLOCKED SET listed missing on ' + before + ' of ' + sheets.length + ' sheets without it, on ' + after + ' with the placeholder', before > 0 && after === 0, '');
// D3 / D4 / D5
const none = new Array(sheets.length).fill(null);
const d3 = engine(sheets, Object.assign(none.slice(), { 0: 'SHED' })), d3o = d3.slice(1);
ok('D3 STATED WINS one sheet states SHED: the other ' + d3o.length + ' are offered PR-SET SHED, no placeholder anywhere', d3o.every(p => JSON.stringify(p) === '["PR-SET=SHED"]') && !d3.flat().some(p => /PLACEHOLDER/.test(p)), JSON.stringify(d3).slice(0, 200));
const d4 = engine(sheets, Object.assign(none.slice(), { 0: 'SHED', 1: 'BARN' })), d4o = d4.slice(2);
ok('D4 CONFLICT ASKS SHED and BARN stated: the other ' + d4o.length + ' are offered no set (no placeholder over a real conflict)', d4o.every(p => p.length === 0), JSON.stringify(d4).slice(0, 200));
const d5 = engine(sheets, sheets.map((s, i) => i === 0 ? 'SHED' : P)), d5o = d5.slice(1);
ok('D5 RENAME WINS placeholder on all, one typed SHED: the other ' + d5o.length + ' are offered PR-SET SHED', d5o.every(p => JSON.stringify(p) === '["PR-SET=SHED"]'), JSON.stringify(d5).slice(0, 200));
// D6
const F = cli(['--accept-suggestions', '--set', 'FARM']), fs6 = F.res.sheets.map(setOf);
ok('D6 CLI --set FARM after Accept-all: every sheet FARM, none left at ' + P, fs6.every(v => v === 'FARM'), JSON.stringify([...new Set(fs6)]));
// D7 (the editor's own table and source label, read from its source: they live inside its browser closure)
const ED = fs.readFileSync(path.join(M, 'dxf_meta_editor.js'), 'utf8');
const tier = /'PR-SET-PLACEHOLDER': '(\w+)'/.exec(ED), badge = /function srcLabel\(m\) \{[^\n]*m\.key === 'SET' && window\.Dxf2Suggest && m\.value === window\.Dxf2Suggest\.SET_PLACEHOLDER\) return '<span class="dm-src default"/.test(ED);
ok('D7 STAYS YELLOW tier of PR-SET-PLACEHOLDER = inferred; a SET equal to the placeholder shows the yellow "default" badge', tier && tier[1] === 'inferred' && badge, 'tier=' + (tier && tier[1]) + ' badge=' + badge);
console.log(fail ? '§VERDICT FAIL W-SET-PLACEHOLDER judged=' + judged + ' fail=' + fail : '§VERDICT PASS W-SET-PLACEHOLDER judged=' + judged + ' fail=0'); process.exit(fail ? 1 : 0);
