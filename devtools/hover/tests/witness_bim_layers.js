#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-BIM-LAYERS (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.23, decision F-18). READ THE LOG after every run: the §BIM_LAYERS_W lines carry the
//   evidence, the exit code does not.
// THE ISSUE it proves/disproves: "why is this body this size, here, with this hole?" needed reading six places by hand. The provenance hover (dxf_hover.js layersFor) must
//   show, for EVERY body, its six layers from the data the body and the op log carry, and never a guessed line. Node only, no browser.
//   Built in-process exactly as the page does (dxf2bim_cli.run -> toOps -> the page's commit mapping, dxf_import_ui.js:951-952: ids contiguous from 1, cut parent = 1 + index,
//   slide.fillingFid = 1 + fillingIdx). The INDEPENDENT oracle is the Node CLI with --trace in a SEPARATE process (trace.json, bodies.json).
//   L1 builder = the oracle's trace key, its line = a fresh parse (denominator: every insert) · L2 pass-through on a synthetic chain; the shed's chain count (0 = VACUOUS)
//   L3 sizes: side:source list = the op's SizeBasis (a second code path); each number = the oracle's bodies.json; a default with a key links a line of element_defaults.json
//      that holds that key, one without links nothing · L4 every cut listed under exactly its host, each fill names its host, Σ = cuts.length
//   L5 synthetic edits (MOVE on A, GRID_MOVE on B, SCALE on C, a 4th op past the cursor) listed only on A, B, C; the past-cursor op nowhere
//   L6 handle / layer / sheet = the oracle's bodies.json · K every key 1-6 link = vscode://file/<root>/<existing file:line> or absent
//   RED controls (each must FAIL its judge): R1 slice 2's resolve() as the hover · R2 one SizeBasis corrupted · R3 the cursor before the edits
// INCONCLUSIVE (exit 2) if the marked shed is missing or 0 inserts were judged. Run alone, low priority:
//   nice -n 19 ionice -c3 node devtools/hover/tests/witness_bim_layers.js < /dev/null > <log>    (SHED_MARKED overrides the input)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..', '..'), M = path.join(ROOT, 'modeller');
const MK = process.env.SHED_MARKED || path.join(os.homedir(), 'Videos', 'dxf2bim_film_work', 'why', 'cli', 'marked');
const files = fs.existsSync(MK) ? fs.readdirSync(MK).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(MK, f)) : [];
if (files.length !== 9) { console.log('§BIM_LAYERS_W VERDICT INCONCLUSIVE the 9 CLI-marked shed sheets are not at ' + MK + ' (found ' + files.length + ')'); process.exit(2); }
let fail = 0; const ok = (n, c, i) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
const H = require(path.join(ROOT, 'devtools', 'hover', 'dxf_hover.js'));
const ARGS = ['--sheets', ...files, '--pack', 'pwd2024_bd', '--complete'];

// the index the overlay reads, regenerated (git-ignored, this machine's root)
const gen = cp.spawnSync('node', [path.join(ROOT, 'devtools', 'hover', 'gen_trace_index.js'), '--root', ROOT], { encoding: 'utf8' });
console.log('§BIM_LAYERS_W index ' + (gen.stdout || '').trim());
const IX = JSON.parse(fs.readFileSync(path.join(ROOT, 'devtools', 'hover', 'trace_index.json'), 'utf8'));
const lineExists = at => { const m = /^(.*):(\d+)$/.exec(at || ''); if (!m) return false; try { return fs.readFileSync(path.join(ROOT, m[1]), 'utf8').split('\n').length >= Number(m[2]); } catch (e) { return false; } };
const lineText = at => { const m = /^(.*):(\d+)$/.exec(at); return fs.readFileSync(path.join(ROOT, m[1]), 'utf8').split('\n')[Number(m[2]) - 1]; };

// the independent oracle: a separate CLI process with --trace
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'w_bim_layers_'));
const cli = cp.spawnSync('node', [path.join(M, 'dxf2bim_cli.js'), ...ARGS, '--out', out, '--trace'], { encoding: 'utf8', env: process.env, maxBuffer: 1 << 28 });
const ORACLE = fs.existsSync(path.join(out, 'trace.json')) ? JSON.parse(fs.readFileSync(path.join(out, 'trace.json'), 'utf8')).trace : {};
const OB = {}; (fs.existsSync(path.join(out, 'bodies.json')) ? JSON.parse(fs.readFileSync(path.join(out, 'bodies.json'), 'utf8')) : []).forEach(b => { OB[b.guid] = b; });
console.log('§BIM_LAYERS_W oracle cli_exit=' + cli.status + ' traced=' + Object.keys(ORACLE).length + ' bodies=' + Object.keys(OB).length);

// in-process, as the page: trace on, run, toOps, the commit mapping (ONE helper, shared with W-DXF-HOVER H2b)
const SC = require('./shed_ctx.js').shedCtx(ROOT, files, 1), R = SC.R, T = SC.T, ops = SC.ops, TRACE = SC.trace, guidByFid = SC.guidByFid, byId = SC.byId, FIDS = SC.fids;
const mkCtx = (o, extra) => SC.ctx(IX, extra);
console.log('§BIM_LAYERS_W page-shaped inserts=' + FIDS.length + ' cuts=' + T.cuts.length + ' els=' + R.els.length + ' trace_map=' + TRACE.size);
if (!FIDS.length) { console.log('§BIM_LAYERS_W VERDICT INCONCLUSIVE 0 inserts judged'); process.exit(2); }

// the judges (each returns the list of wrong fids; the red controls run the SAME judges)
const guidOf = f => String(guidByFid[f]).replace(/^dxf-/, '');
function judgeL1(LF) { return FIDS.filter(f => { const r = LF(f), k = String(ORACLE[guidOf(f)] || '').split(' > ')[0], it = r && r.layers && r.layers[0].items[0];
  return !(it && k && it.text.indexOf(k) === 0 && it.at === IX.keys[k] && lineExists(it.at)); }); }
function judgeL3(LF, opsById) { const bad = []; let byS = {};
  FIDS.forEach(f => { const r = LF(f); if (!r || !r.layers) { bad.push(f); return; }
    const P = (opsById || byId)[f], basis = String((((P.provenance || {}).ifc || {}).props || {}).SizeBasis || '').split(/\s+/).filter(Boolean);
    const items = r.layers[2].items.filter(it => !/^height /.test(it.text)), withSrc = items.filter(it => !/\(no source recorded\)$/.test(it.text));
    const got = withSrc.map(it => { const m = /^(\S+) (?:(\S+)  )?(\S+)/.exec(it.text); return m ? m[1] + ':' + m[3] : '?'; });
    const b = OB[guidOf(f)], numsOk = !b || withSrc.every(it => { const side = it.text.split(' ')[0], v = b.size && b.size[side], n = v && (v.number != null ? v.number : v.value);
      return n == null || it.text.indexOf(side + ' ' + String(Math.round(n * 1e6) / 1e6) + '  ') === 0; });
    const defOk = withSrc.every(it => { if (!/ default/.test(it.text)) return true; const km = /  ([a-z_]+\.[a-z_.]+)  /.exec(it.text + '  ');
      if (!km) return !it.at && /which default is not recorded/.test(it.text); return it.at === IX.defaults[km[1]] && lineText(it.at).indexOf('"' + km[1] + '"') >= 0; });
    withSrc.forEach(it => { const s = (/^(\S+) (?:(\S+)  )?(\S+)/.exec(it.text) || [])[3]; byS[s] = (byS[s] || 0) + 1; });
    if (got.join(' ') !== basis.join(' ') || !numsOk || !defOk) bad.push(f); });
  judgeL3.bySource = byS; return bad; }
function judgeL4(LF) { let total = 0; const bad = [];
  FIDS.forEach(f => { const r = LF(f); if (!r || !r.layers) { bad.push(f); return; } const host = r.layers[3].items.filter(it => / GEOM_CUT /.test(it.text)), fills = r.layers[3].items.filter(it => /^fills the opening of #/.test(it.text));
    const want = ops.filter(o => o.op_type === 'GEOM_CUT' && o.parameters.parent === f), wantFill = ops.filter(o => o.op_type === 'GEOM_CUT' && o.parameters.slide && o.parameters.slide.fillingFid === f);
    total += host.length;
    if (host.length !== want.length || !want.every(o => host.some(it => it.text.indexOf('#' + o.id + ' GEOM_CUT ') === 0))) bad.push(f);
    if (fills.length !== wantFill.length || !wantFill.every(o => fills.some(it => it.text.indexOf('fills the opening of #' + o.parameters.parent + ' ') === 0))) bad.push(f); });
  judgeL4.total = total; return bad; }
function judgeL6(LF) { return FIDS.filter(f => { const r = LF(f), b = OB[guidOf(f)]; if (!r || !r.layers) return true; if (!b) return false;   // the joined wall line exists only as an insert
  const lay = (((b.ifc || {}).props || {}).SourceLayer) || '-';   // bodies.json carries no top-level layer; the oracle's own copy is its IFC props (measured)
  const t = r.layers[5].items[0] && r.layers[5].items[0].text; return !(t && t.indexOf('handle ' + b.handle + '  layer ' + lay + '  sheet ' + b.sheet + '  ') === 0); }); }
function judgeK(LF) { let tried = 0, links = 0; const bad = [];
  FIDS.forEach(f => { const r = LF(f); for (let n = 1; n <= 6; n++) { tried++; const L = H.keyLink(r, n); if (!L) continue; links++;
    const at = L.replace('vscode://file' + IX.root + '/', ''); if (L.indexOf('vscode://file' + IX.root + '/') !== 0 || !lineExists(at)) bad.push(f + ':' + n); } });
  judgeK.tried = tried; judgeK.links = links; return bad; }

const LF = f => H.layersFor(f, mkCtx());
// L1
const b1 = judgeL1(LF); console.log('§BIM_LAYERS_W L1 inserts=' + FIDS.length + ' wrong=' + b1.length);
ok('L1 every insert: layer 1 = the oracle trace key, its line = the parse', b1.length === 0, FIDS.length + ' inserts');
// L2: synthetic chain + the shed's population
const chains = FIDS.filter(f => String(TRACE.get(guidOf(f)) || '').indexOf(' > ') >= 0).length;
const k3 = Object.keys(IX.keys).slice(0, 3), f0 = FIDS[0], g0 = guidOf(f0), tr2 = new Map(TRACE); tr2.set(g0, k3.join(' > '));
const r2 = H.layersFor(f0, mkCtx(null, { trace: tr2 })), p2 = r2.layers[1].items;
console.log('§BIM_LAYERS_W L2 synthetic chain=' + k3.join(' > ') + ' items=' + p2.length + ' shed_chains=' + chains + (chains ? '' : ' -> VACUOUS on the shed (judged on the synthetic chain only)'));
ok('L2 a chain a > b > c: layer 1 = a, layer 2 = b, c, each at its parsed line', r2.layers[0].items[0].at === IX.keys[k3[0]] && p2.length === 2 && p2[0].at === IX.keys[k3[1]] && p2[1].at === IX.keys[k3[2]]);
// L3
const b3 = judgeL3(LF); console.log('§BIM_LAYERS_W L3 inserts=' + FIDS.length + ' wrong=' + b3.length + ' by_source=' + JSON.stringify(judgeL3.bySource) + (b3.length ? ' first=' + b3.slice(0, 3) : ''));
const defLinked = FIDS.reduce((t, f) => t + LF(f).layers[2].items.filter(it => / default/.test(it.text) && it.at).length, 0), defUnlinked = FIDS.reduce((t, f) => t + LF(f).layers[2].items.filter(it => / default/.test(it.text) && !it.at).length, 0);
console.log('§BIM_LAYERS_W L3 default_sides linked=' + defLinked + ' not_recorded=' + defUnlinked);
ok('L3 every insert: side:source = the op SizeBasis, numbers = the oracle bodies.json, defaults linked only by their recorded key', b3.length === 0);
// L4
const b4 = judgeL4(LF); console.log('§BIM_LAYERS_W L4 cuts=' + T.cuts.length + ' listed_under_hosts=' + judgeL4.total + ' wrong=' + b4.length + (T.cuts.length ? '' : ' -> VACUOUS (the shed has no cut)'));
ok('L4 every cut under exactly its host (Σ = cuts), every fill names its host', b4.length === 0 && judgeL4.total === T.cuts.length && T.cuts.length > 0, T.cuts.length + ' cuts');
// L5: synthetic edits
const [A, B, C] = [FIDS[1], FIDS[2], FIDS[3]], base = ops.length;
const edits = [{ id: 9001, op_type: 'GEOM_MOVE', parameters: { parent: A, dx: 0.5, dy: 0, dz: 0 } }, { id: 9002, op_type: 'GEOM_GRID_MOVE', parameters: { commands: [{ featureId: B, action: 'TRANSLATE', axis: 'x', delta: 1.2 }] } },
  { id: 9003, op_type: 'GEOM_SCALE', parameters: { parent: C, fx: 2, fy: 1, fz: 1 } }];
const past = { id: 9004, op_type: 'GEOM_MOVE', parameters: { parent: FIDS[4], dx: 9, dy: 0, dz: 0 } };   // beyond the cursor: undone, never shown
const opsE = ops.concat(edits), LFE = f => H.layersFor(f, mkCtx(null, { ops: opsE }));   // ctx.ops = the log BEFORE the cursor (the page slices at Bonsai.oplog.cursor)
function judgeL5(L5) { const bad = []; FIDS.forEach(f => { const it = L5(f).layers[4].items, want = f === A ? ['#9001 GEOM_MOVE'] : f === B ? ['#9002 GEOM_GRID_MOVE'] : f === C ? ['#9003 GEOM_SCALE'] : [];
  if (it.length !== want.length || !want.every((w, i) => it[i].text.indexOf(w) === 0) || it.some(x => /#9004/.test(x.text))) bad.push(f); }); return bad; }
const b5 = judgeL5(LFE); console.log('§BIM_LAYERS_W L5 A=#' + A + ' ' + JSON.stringify(LFE(A).layers[4].items.map(i => i.text)) + ' B=#' + B + ' ' + JSON.stringify(LFE(B).layers[4].items.map(i => i.text)) + ' C=#' + C + ' ' + JSON.stringify(LFE(C).layers[4].items.map(i => i.text)) + ' wrong=' + b5.length + ' past_cursor_op=#9004 (not in ctx.ops: base=' + base + ')');
ok('L5 edits: A, B, C list exactly theirs (via EditDelta.netEdits), no other body lists any, the past-cursor op nowhere', b5.length === 0);
// L6
const b6 = judgeL6(LF); console.log('§BIM_LAYERS_W L6 inserts=' + FIDS.length + ' wrong=' + b6.length);
ok('L6 evidence handle / layer / sheet = the oracle bodies.json', b6.length === 0);
// K
const bK = judgeK(LF); console.log('§BIM_LAYERS_W K keys_tried=' + judgeK.tried + ' links=' + judgeK.links + ' dangling=' + bK.length);
ok('K every key 1-6 link is vscode://file/<root>/<existing line> or absent', bK.length === 0 && judgeK.links > 0);
// what one body looks like (the log keeps it: the next session reads it here, not by re-running)
[FIDS.find(f => /column/.test(guidOf(f)) && LF(f).layers[2].items.some(i => i.at)), FIDS.find(f => LF(f).layers[3].items.length)].filter(Boolean).forEach(f => H.render(LF(f)).split('\n').forEach(l => console.log('  §BIM_LAYERS_W SAMPLE #' + f + ' | ' + l)));
const perKey = {}; FIDS.forEach(f => { const c = LF(f).counts; ['builder', 'pass', 'sizes', 'cuts', 'edits', 'evidence'].forEach((n, i) => { perKey[n] = (perKey[n] || 0) + (c[i] ? 1 : 0); }); });
console.log('§BIM_LAYERS_W bodies_with_layer ' + JSON.stringify(perKey) + ' of ' + FIDS.length);

// RED controls: the same judges must FAIL
const R1 = f => H.resolve(f, mkCtx());   // slice 2's single-line hover
const r1 = { L3: judgeL3(R1).length, L4: judgeL4(R1).length, L6: judgeL6(R1).length };
console.log('§BIM_LAYERS_W R1 slice-2 resolve() as the hover: L3_wrong=' + r1.L3 + ' L4_wrong=' + r1.L4 + ' L6_wrong=' + r1.L6);
ok('R1 red control: the single-line hover fails L3, L4 and L6', r1.L3 === FIDS.length && r1.L4 > 0 && r1.L6 > 0);
const fx = FIDS.find(f => /x:label/.test(String(byId[f].provenance.ifc.props.SizeBasis))), bad2 = Object.assign({}, byId);
bad2[fx] = JSON.parse(JSON.stringify(byId[fx])); bad2[fx].provenance.ifc.props.SizeBasis = bad2[fx].provenance.ifc.props.SizeBasis.replace('x:label', 'x:default');
const r2b = judgeL3(LF, bad2); console.log('§BIM_LAYERS_W R2 SizeBasis corrupted on #' + fx + ' -> L3 wrong=' + JSON.stringify(r2b));
ok('R2 red control: one corrupted SizeBasis -> L3 catches exactly that body', r2b.length === 1 && r2b[0] === fx);
const r3 = judgeL5(LF); console.log('§BIM_LAYERS_W R3 cursor before the edits -> L5 wrong=' + r3.length + ' (A, B, C list nothing)');
ok('R3 red control: the cursor before the edits -> L5 fails on A, B, C', r3.length === 3);

console.log('§BIM_LAYERS_W VERDICT ' + (fail ? 'FAIL' : 'PASS') + ' fail=' + fail + ' inserts=' + FIDS.length + ' cuts=' + T.cuts.length);
process.exit(fail ? 1 : 0);
