#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-MARK-REFS: prompts/DXF2BIM_ARCHITECT_REVIEW.md §D102. Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: the shed's FOUNDATION layout tags GB-1 four times and the DETAILS sheet details it, yet the model has no grade beam and no check said so; a mark
 * tagged, detailed and modelled must be checked as one, without building or dropping anything.
 *   R1 the shed (CLI, --complete): GB-1 not_modelled (4 FOUNDATION tags, detail "Long Section of GB-1"); B-1 / B-2 modelled + detailed via abbreviation; C-1 / F-1 by schedule.
 *   R2 left_out unchanged (4), verdict qualifies: the advisories are not dropped bodies.
 *   R3 fixtures: B-9 tagged + body, no detail -> no_detail; + "Long Section of Beam-9" -> modelled (abbreviation); a GB-1 body -> GB-1 modelled; a GUID-like text holding "B-3" is no tag.
 *   R4 one grammar: dxf2bodies' nearMark and MarkRefs read the same Dxf2Bodies.MARK_RE.
 * Input: the CLI-marked shed set (SHED_MARKED, default ~/Videos/dxf2bim_film_work/why/cli/marked); missing -> MISSING input (exit 2).
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const M = path.join(__dirname, '..'), C = require(path.join(M, 'dxf2bim_cli.js')), MR = require(path.join(M, 'dxf2markrefs.js')), B = require(path.join(M, 'dxf2bodies.js'));
const MK = process.env.SHED_MARKED || path.join(os.homedir(), 'Videos', 'dxf2bim_film_work', 'why', 'cli', 'marked');
const files = fs.existsSync(MK) ? fs.readdirSync(MK).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(MK, f)) : [];
if (files.length !== 9) { console.log('MISSING input: the 9 CLI-marked shed sheets in ' + MK + ' (SHED_MARKED), found ' + files.length); process.exit(2); }
let fail = 0, judged = 0; const ok = (n, c, i) => { judged++; console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
const r = C.run(C.parseArgs(['--sheets', ...files, '--out', path.join(os.tmpdir(), 'w_markrefs_' + process.pid), '--complete']), () => {}), out = r.out, R = out.gate.R.bodies.markRefs;
console.log('  ' + R.log);
const by = k => R.rows.find(x => x.mark === k) || {};
const g = by('GB-1'), b1 = by('B-1'), b2 = by('B-2'), c1 = by('C-1'), f1 = by('F-1');
ok('R1 the shed: GB-1 not_modelled (tags ' + JSON.stringify(g.tags) + ', bodies ' + g.bodies + ', detail ' + JSON.stringify((g.details || []).map(d => d.title)) + '); B-1/B-2 modelled via abbreviation; C-1/F-1 by schedule',
  g.status === 'not_modelled' && g.bodies === 0 && Object.keys(g.tags).length === 1 && /FOUNDATION/.test(Object.keys(g.tags)[0]) && g.nTags === 4 && g.details.some(d => /Long Section of GB-1/.test(d.title)) &&
  [b1, b2].every(x => x.status === 'modelled' && x.bodies > 0 && x.details.some(d => d.via === 'abbreviation')) && [c1, f1].every(x => x.status === 'modelled' && x.details.some(d => d.via === 'schedule')),
  R.rows.map(x => x.mark + ':' + x.status).join(' '));
const adv = out.gate.verdict.advisory.filter(a => /^GAP:mark_/.test(a.code));
ok('R2 left_out stays ' + out.gate.structure.left_out + ', verdict ' + out.gate.verdict.verdict + '; mark advisories ' + adv.length + ' (' + adv.map(a => a.code).join(',') + ')',
  out.gate.structure.left_out === 4 && out.gate.verdict.verdict === 'qualifies' && adv.length === 1 && adv[0].code === 'GAP:mark_not_modelled', '');
const T = (t, layer) => ({ type: 'TEXT', layer: layer || 'Tex', text: t });
const plan = ents => ({ name: 'plan.dxf', role: 'plan', dxf: { entities: ents } }), det = ents => ({ name: 'det.dxf', role: null, dxf: { entities: ents } });
const f0 = MR.build([plan([T('B-9'), T('{783FF0FE-1BCD-4B3D-834B-3094932F3AF8}')]), det([])], [{ mark: 'B-9', ifc: {} }], { B, notesSheets: ['det.dxf'] });
const f1x = MR.build([plan([T('B-9')]), det([T('Long Section of Beam-9 (12"x10")')])], [{ mark: 'B-9', ifc: {} }], { B, notesSheets: ['det.dxf'] });
const f2 = MR.build([plan([T('GB-1')]), det([T('Long Section of GB-1')])], [{ mark: 'GB-1', ifc: {} }], { B, notesSheets: ['det.dxf'] });
const st = (X, k) => (X.rows.find(x => x.mark === k) || {}).status;
ok('R3 fixtures: B-9 no detail -> ' + st(f0, 'B-9') + '; with "Long Section of Beam-9" -> ' + st(f1x, 'B-9') + '; a GB-1 body -> ' + st(f2, 'GB-1') + '; marks from the GUID text: ' + f0.rows.length,
  st(f0, 'B-9') === 'no_detail' && st(f1x, 'B-9') === 'modelled' && f1x.rows[0].details[0].via === 'abbreviation' && st(f2, 'GB-1') === 'modelled' && f0.rows.length === 1, '');
const src = fs.readFileSync(path.join(M, 'dxf2bodies.js'), 'utf8'), msrc = fs.readFileSync(path.join(M, 'dxf2markrefs.js'), 'utf8');
ok('R4 one grammar: nearMark tests MARK_RE, MarkRefs reads B.MARK_RE, no second mark regex in dxf2markrefs.js', /if \(!MARK_RE\.test\(t\)\) return;/.test(src) && /B\.MARK_RE/.test(msrc) && !/\[A-Z\]\{1,3\}/.test(msrc), '');
console.log(fail ? '§VERDICT FAIL W-MARK-REFS judged=' + judged + ' fail=' + fail : '§VERDICT PASS W-MARK-REFS judged=' + judged + ' fail=0'); process.exit(fail ? 1 : 0);
