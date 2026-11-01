#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-ANALYTICAL: prompts/DXF2BIM_ARCHITECT_REVIEW.md §D103. Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: an engineer re-draws the frame by hand in STAAD / ETABS / SAP2000 from the 2D set (nodes, members, sections, supports) before any analysis, although the
 * converted model already holds every structural part with its drawn size and source. The analytical export must hand it on: every column / beam / member with a section a member, every
 * other body listed with a reason, every member end a support, a shared joint or a LISTED dangling end (the shed's known §D100 facts are shown, not hidden), a .std that reads back to the
 * model, a self-weight that agrees with the Load Summary to a stated geometric difference, a falsifier that breaks a joint on purpose, deterministic bytes, and a refusal on an empty set.
 *   A1 every IfcColumn / IfcBeam / IfcMember with a section -> >= 1 member; every other body in leftOut with a reason (counts printed); nothing counted twice or lost
 *   A2 joints: each member end is a support, shared with another member, or a listed dangling end (sheets / handles printed; the count is re-derived from the incidences)
 *   A3 the .std parses back (own reader): JOINT COORDINATES / MEMBER INCIDENCES / MEMBER PROPERTY / SUPPORTS = the model's, coordinates to 4 decimals, no data line over 79 characters
 *   A4 self-weight: sum length x area x density over the exported members vs LoadSummary's kN for the same bodies, per class; centreline vs body length printed, the snap's effect bounded by the shifts
 *   A5 falsifier: move one beam 1 m in plan -> its two ends become dangling (they were joined), and the rise in the dangling count is printed with its cause
 *   A6 two runs (two full conversions) -> identical bytes for model.std and analytical.json
 *   A7 a set with no structure (empty els) -> refused, nothing written
 * §D105: the model is built FROM THE IFC the converter writes (Dxf2Ifc -> the shared extractor -> Dxf2Analytical.fromDb -> build); every claim below is judged on that route, none weakened (P4 of W-ANALYTICAL-IFC).
 * Input: the CLI-marked shed set (SHED_MARKED, default ~/Videos/dxf2bim_film_work/why/cli/marked); missing -> MISSING input (exit 2).
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const M = path.join(__dirname, '..'), C = require(path.join(M, 'dxf2bim_cli.js')), AN = require(path.join(M, 'dxf2analytical.js')), LS = require(path.join(M, 'load_summary.js'));
const MK = process.env.SHED_MARKED || path.join(os.homedir(), 'Videos', 'dxf2bim_film_work', 'why', 'cli', 'marked');
const files = fs.existsSync(MK) ? fs.readdirSync(MK).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(MK, f)) : [];
if (files.length !== 9) { console.log('MISSING input: the 9 CLI-marked shed sheets in ' + MK + ' (SHED_MARKED), found ' + files.length); process.exit(2); }
let fail = 0, judged = 0; const ok = (n, c, i) => { judged++; console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
(async () => {
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w_analytical_'));
function convert(dir) { return C.run(C.parseArgs(['--sheets', ...files, '--out', dir, '--pack', 'pwd2024_bd', '--complete', '--analytical']), () => {}); }
const r1 = convert(path.join(tmp, 'a')), R = r1.out.gate.R;
const values = {}, sources = {}; R.defaults_table.forEach(x => { values[x.key] = x.value; sources[x.key] = x.source; });
const opts = { values, sources, LS };
const WI = require('web-ifc'), api = new WI.IfcAPI(); await api.Init(); const SQL = await require('sql.js')(), Core = require(path.join(M, 'dxf2bim', 'ifc_extract_core.js'));
const built = await C.buildIfc(r1), ifcBytes = new Uint8Array(built.bytes);
const viaIfc = bytes => AN.fromIfc({ ifcBytes: bytes, WebIFC: WI, ifcApi: api, SQL, Core, LS, values, sources });
const model = await viaIfc(ifcBytes), els = model.elements; model.log.forEach(l => console.log('  ' + l));
const outDir = path.join(tmp, 'a'); fs.mkdirSync(outDir, { recursive: true }); await C.writeAnalytical(r1, outDir);
const std = fs.readFileSync(path.join(outDir, 'model.std'), 'utf8'), js = fs.readFileSync(path.join(outDir, 'analytical.json'), 'utf8');
console.log('  files: model.std ' + std.length + ' bytes, analytical.json ' + js.length + ' bytes, format ' + JSON.parse(js).format + '; IFC ' + ifcBytes.length + ' bytes, ' + els.length + ' elements read back');
ok('A0 the input is the IFC: ' + els.length + ' elements read back from the extractor\'s tables, ' + model.input.evidence + ' with the evidence pset, the model has no DXF body behind it', els.length === R.els.length && model.input.evidence === els.length && !!model.elements[0].ifcGuid, '');

// A1
const lsRows = LS.compute(els, { values, sources }).rows, lsBy = {}; lsRows.forEach(r => { lsBy[r.guid] = r; });
const STRUCT = ['IfcColumn', 'IfcBeam', 'IfcMember'], hasSection = e => e['class'] !== 'IfcMember' || !!lsBy[e.guid].section;
const expectMem = els.filter(e => STRUCT.includes(e['class']) && hasSection(e)), memGuids = new Set(model.members.map(q => q.guid)), leftG = new Map(model.leftOut.map(q => [q.guid, q]));
const byC = {}; model.members.forEach(q => { byC[q.class] = (byC[q.class] || 0) + 1; });
const lby = {}; model.leftOut.forEach(q => { lby[q.class + ': ' + q.reason] = (lby[q.class + ': ' + q.reason] || 0) + 1; });
const shortLeft = model.leftOut.filter(q => /shorter than the snap/.test(q.reason)).map(q => q.guid);
const lostMem = expectMem.filter(e => !memGuids.has(e.guid) && !shortLeft.includes(e.guid));
const rest = els.filter(e => !expectMem.includes(e));
console.log('  A1 members ' + model.members.length + ' (pieces) from ' + memGuids.size + ' bodies ' + JSON.stringify(byC) + '; leftOut ' + model.leftOut.length); Object.keys(lby).sort().forEach(k => console.log('     leftOut ' + lby[k] + ' x ' + k));
ok('A1 all ' + expectMem.length + ' column / beam / member bodies with a section are members (or listed as shorter than the snap: ' + shortLeft.length + '); the other ' + rest.length + ' bodies are all in leftOut with a reason; ' + els.length + ' = ' + memGuids.size + ' + ' + model.leftOut.length,
  lostMem.length === 0 && rest.every(e => leftG.has(e.guid) && leftG.get(e.guid).reason) && memGuids.size + model.leftOut.length === els.length && model.leftOut.every(q => !memGuids.has(q.guid)) && memGuids.size > 0,
  'lost ' + lostMem.length + ' ' + (model.leftOut.filter(q => !q.reason).length ? 'reasonless leftOut' : ''));

// A2
const deg = {}; model.members.forEach(q => { deg[q.n1] = (deg[q.n1] || 0) + 1; deg[q.n2] = (deg[q.n2] || 0) + 1; });
const sup = new Set(model.supports.map(s => s.node)), dangNodes = Object.keys(deg).filter(n => deg[n] === 1 && !sup.has(Number(n))).map(Number), listed = new Set(model.dangling.map(d => d.node));
const unaccounted = Object.keys(deg).map(Number).filter(n => !(sup.has(n) || deg[n] >= 2 || listed.has(n)));
const dby = {}; model.dangling.forEach(d => { const k = d.class + ' ' + d.sheet; dby[k] = (dby[k] || []).concat(d.handle); });
console.log('  A2 joints ' + model.nodes.length + ', supports ' + sup.size + ', shared (degree >= 2) ' + Object.keys(deg).filter(n => deg[n] >= 2).length + ', dangling ends ' + model.dangling.length + ' (§D100 facts, not hidden):');
Object.keys(dby).sort().forEach(k => console.log('     ' + k + ' x' + dby[k].length + ': ' + dby[k].join(' ')));
ok('A2 every member end is a support, shared, or a listed dangling end; the dangling count ' + model.dangling.length + ' = the re-derived ' + dangNodes.length + '; ' + model.supports.length + ' supports each over a footing (gap printed ' + model.supports.map(s => s.gap.toFixed(3)).filter((g, i, a) => a.indexOf(g) === i).join('/') + ' m)',
  unaccounted.length === 0 && dangNodes.length === model.dangling.length && dangNodes.every(n => listed.has(n)) && model.dangling.every(d => d.sheet && d.handle) && model.supports.length > 0 && model.supports.every(s => s.footing), 'unaccounted ' + unaccounted.length);

// A3: a small STAAD reader of our own
function readStd(t) {
  const out = { joints: [], inc: [], prop: {}, sup: [], mat: [], lines: t.split('\n') }; let sec = null, acc = '';
  const ids = s => { const o = [], tk = s.trim().split(/\s+/); for (let i = 0; i < tk.length; i++) { if (tk[i + 1] === 'TO') { for (let k = Number(tk[i]); k <= Number(tk[i + 2]); k++) o.push(k); i += 2; } else o.push(Number(tk[i])); } return o; };
  out.lines.forEach(l => {
    if (/^\*/.test(l) || !l.trim()) return;
    if (/^(JOINT COORDINATES|MEMBER INCIDENCES|MEMBER PROPERTY|CONSTANTS|SUPPORTS|DEFINE MATERIAL|LOAD |SET |UNIT |FINISH|STAAD)/.test(l)) { sec = l.split(' ')[0] + (/^(JOINT|MEMBER|DEFINE)/.test(l) ? ' ' + l.split(' ')[1] : ''); acc = ''; return; }
    if (sec === 'JOINT COORDINATES') { const m = /^(\d+) (\S+) (\S+) (\S+);$/.exec(l); if (m) out.joints.push([Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]); }
    else if (sec === 'MEMBER INCIDENCES') { const m = /^(\d+) (\d+) (\d+);$/.exec(l); if (m) out.inc.push([Number(m[1]), Number(m[2]), Number(m[3])]); }
    else if (sec === 'MEMBER PROPERTY' || sec === 'SUPPORTS') {
      acc += (acc ? ' ' : '') + l.replace(/ -$/, ''); if (/ -$/.test(l)) return;
      if (sec === 'MEMBER PROPERTY') { const m = /^(.*?) PRIS (.*)$/.exec(acc); ids(m[1]).forEach(i => { (out.prop[i] = out.prop[i] || []).push(m[2]); }); }
      else { const m = /^(.*) (FIXED|PINNED)$/.exec(acc); ids(m[1]).forEach(i => out.sup.push([i, m[2]])); }
      acc = '';
    } else if (sec === 'CONSTANTS') { acc += (acc ? ' ' : '') + l.replace(/ -$/, ''); if (/ -$/.test(l)) return; const m = /^MATERIAL (\S+) MEMB (.*)$/.exec(acc); if (m) ids(m[2]).forEach(i => out.mat.push([i, m[1]])); acc = ''; }
  });
  return out;
}
const S = readStd(std), over = S.lines.filter(l => !/^\*/.test(l) && l.length > 79);
const jOk = S.joints.length === model.nodes.length && S.joints.every((j, i) => { const n = model.nodes[i]; return j[0] === n.id && Math.abs(j[1] - n.x) < 6e-5 && Math.abs(j[2] - n.y) < 6e-5 && Math.abs(j[3] - n.z) < 6e-5; });
const iOk = S.inc.length === model.members.length && S.inc.every((m, i) => m[0] === model.members[i].id && m[1] === model.members[i].n1 && m[2] === model.members[i].n2);
const pOk = Object.keys(S.prop).length === model.members.length && Object.keys(S.prop).every(k => S.prop[k].length === 1);
const sOk = S.sup.length === model.supports.length && S.sup.every(s => model.supports.some(q => q.node === s[0] && q.type === s[1]));
const mOk = S.mat.length === model.members.filter(q => q.material).length;
console.log('  A3 read back: joints ' + S.joints.length + ' incidences ' + S.inc.length + ' properties ' + Object.keys(S.prop).length + ' supports ' + S.sup.length + ' material-constants ' + S.mat.length + ' lines>79 ' + over.length);
ok('A3 the .std reads back: ' + S.joints.length + ' joints / ' + S.inc.length + ' members / ' + Object.keys(S.prop).length + ' one-property members / ' + S.sup.length + ' supports equal the model; no data line over 79; header says not a design',
  jOk && iOk && pOk && sOk && mOk && over.length === 0 && /NOT a design/.test(std) && /^SET Z UP$/m.test(std) && /SELFWEIGHT Z -1/.test(std), [jOk, iOk, pOk, sOk, mOk, over.length].join(','));

// A4: per body, never a bulk fudge. Columns: the same box x height. Beams: equal except the bodies the Load Summary's own formula mis-reads (named below). Members: bar length vs axis length.
const secOf = k => model.sections[k], dens = q => (q.material ? model.materials[q.material].density : NaN), rcD = Number(values['load.unit_weight.concrete']) + 0.63 * Number(values['load.rc_steel_percent']);
const byG = {}; model.members.forEach(q => { (byG[q.guid] = byG[q.guid] || []).push(q); });
const cls = {}; STRUCT.forEach(c => { cls[c] = { axis: 0, node: 0, ls: 0, n: 0 }; });
const elBy = {}; els.forEach(e => { elBy[e.guid] = e; });
const F32 = 1e-6;   /* the IFC's Float32 vertex store: ~1e-7 relative; a real difference (the 127 kN beam) is 1e1 */
let maxRel = 0; const bad = [], beamOff = [], snapOver = [], memOver = [];
Object.keys(byG).forEach(g => {
  const P = byG[g], q0 = P[0], c = cls[q0.class], a = secOf(q0.section).AX, d = dens(q0), e = elBy[g], L = P.reduce((s, q) => s + q.length, 0);
  const mine = q0.axisLength * a * d, ls = lsBy[g].kN; if (q0.class !== 'IfcMember') maxRel = Math.max(maxRel, Math.abs(mine - ls) / ls); c.n++; c.axis += mine; c.node += L * a * d; c.ls += ls;
  if (Math.abs(L - q0.axisLength) > 2 * model.maxShift + 1e-9) snapOver.push(q0.handle);
  const X = e.vertices.map(v => v[0]), Y = e.vertices.map(v => v[1]), d0 = Math.max(...X) - Math.min(...X), d1 = Math.max(...Y) - Math.min(...Y), d2 = e.z1 - e.z0;
  if (q0.class === 'IfcColumn' && Math.abs(mine - ls) > F32 * ls) bad.push('column ' + q0.handle);
  if (q0.class === 'IfcBeam' && Math.abs(mine - ls) > F32 * ls) {   // the Load Summary reads (w || bbox-y) x (d || bbox-z) x max(bbox-x, bbox-y): wrong for a beam along Y with no stated size
    const w = e.size && e.size.w !== undefined ? Number(e.size.w.number) : NaN, dd = e.size && e.size.d !== undefined ? Number(e.size.d.number) : NaN, lsFormula = (isFinite(w) ? w : d1) * (isFinite(dd) ? dd : d2) * Math.max(d0, d1) * rcD;
    beamOff.push({ handle: q0.handle, mine, ls, lsFormula, alongY: d1 > d0, sized: isFinite(w) && isFinite(dd) });
  }
  if (q0.class === 'IfcMember') { const w = Number(e.size.w.number), barL = lsBy[g].length; if (Math.abs(q0.axisLength - barL) > Math.SQRT2 * w) memOver.push(q0.handle + ' ' + q0.axisLength.toFixed(3) + ' vs ' + barL.toFixed(3)); }
});
STRUCT.forEach(c => { const x = cls[c];
  console.log('     ' + c + ' bodies ' + x.n + ': sum L x A x gamma  body axis ' + x.axis.toFixed(3) + ' kN | snapped centreline ' + x.node.toFixed(3) + ' kN | Load Summary ' + x.ls.toFixed(3) + ' kN | axis vs LS ' + (100 * (x.axis - x.ls) / x.ls).toFixed(3) + '% | snap ' + (100 * (x.node - x.axis) / x.axis).toFixed(3) + '%'); });
console.log('     snap bound: no body changes length by more than 2 x max end shift (' + (2 * model.maxShift).toFixed(4) + ' m); over: ' + snapOver.length);
beamOff.forEach(b => console.log('     beam ' + b.handle + ' mine ' + b.mine.toFixed(3) + ' kN, Load Summary ' + b.ls.toFixed(3) + ' kN; the Load Summary formula (w||bbox-y) x (d||bbox-z) x max(bbox-x,bbox-y) gives ' + b.lsFormula.toFixed(3) + ' kN; along Y ' + b.alongY + ', size stated ' + b.sized));
const lsBeamFixed = cls.IfcBeam.ls - beamOff.reduce((s, b) => s + b.ls - b.mine, 0), tot = k => STRUCT.reduce((s, c) => s + cls[c][k], 0);
console.log('     TOTAL axis ' + tot('axis').toFixed(3) + ' kN | snapped ' + tot('node').toFixed(3) + ' kN | Load Summary ' + tot('ls').toFixed(3) + ' kN (' + beamOff.length + ' beam(s) the Load Summary mis-reads: without them ' + (tot('ls') - beamOff.reduce((s, b) => s + b.ls - b.mine, 0)).toFixed(3) + ' kN)');
console.log('     largest column / beam body-by-body relative difference vs the Load Summary: ' + maxRel.toExponential(2) + ' (IFC Float32 limit ' + F32 + ')');
ok('A4 self-weight: columns equal the Load Summary body by body (' + cls.IfcColumn.n + ' bodies, ' + cls.IfcColumn.axis.toFixed(3) + ' kN); beams equal the Load Summary body by body, NO exception (' + beamOff.length + ' differ; §D104 fixed the Y-beam width fallback); members within the cross-section diagonal of the bar length (axis ' + cls.IfcMember.axis.toFixed(3) + ' vs ' + cls.IfcMember.ls.toFixed(3) + ' kN); snap bounded by the shifts',
  bad.length === 0 && beamOff.length === 0 && memOver.length === 0 && snapOver.length === 0 && cls.IfcColumn.n === 96 && cls.IfcBeam.n === 35 && cls.IfcMember.n === 156,
  [bad, memOver, snapOver].map(x => x.length).join(',') + ' ' + lsBeamFixed.toFixed(1));

// A5 falsifier: move one beam 1 m in plan; its two (joined) ends must become dangling
const dangOf = m => new Set(m.dangling.map(d => d.sheet + '|' + d.handle + '|' + d.end + '|' + d.node)), cnt = m => m.dangling.length;
const endsOf = (m, g) => m.dangling.filter(d => elBy[g] && d.handle === elBy[g].handle && d.sheet === elBy[g].sheet).length;
let f5 = null;
for (const e of els.filter(x => x['class'] === 'IfcBeam')) {
  if (endsOf(model, e.guid) !== 0) continue;
  for (const dv of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const moved = els.map(x => x === e ? Object.assign({}, x, { vertices: x.vertices.map(v => [v[0] + dv[0], v[1] + dv[1], v[2]]) }) : x), m2 = AN.build(moved, opts);
    if (endsOf(m2, e.guid) === 2) { f5 = { e, dv, m2 }; break; }
  }
  if (f5) break;
}
const others = f5 ? cnt(f5.m2) - cnt(model) - 2 : NaN;
console.log('  A5 beam ' + (f5 && f5.e.handle) + ' moved 1 m by ' + (f5 && JSON.stringify(f5.dv)) + ': dangling ' + cnt(model) + ' -> ' + (f5 && cnt(f5.m2)) + ' (its own two ends: +2; other members that lost their only partner: ' + others + ')');
ok('A5 falsifier: moving one joined beam 1 m in plan leaves exactly its two ends dangling (0 -> 2) and the dangling count rises by 2 + ' + others + ' (other member ends that lost their only partner)', !!f5 && others >= 0 && cnt(f5.m2) === cnt(model) + 2 + others, '');

// A6 determinism: a second full conversion, identical bytes
const r2 = convert(path.join(tmp, 'b')); const dirB = path.join(tmp, 'b'); fs.mkdirSync(dirB, { recursive: true }); await C.writeAnalytical(r2, dirB);
const std2 = fs.readFileSync(path.join(dirB, 'model.std'), 'utf8'), js2 = fs.readFileSync(path.join(dirB, 'analytical.json'), 'utf8');
ok('A6 two conversions -> identical bytes (model.std ' + Buffer.byteLength(std) + ' bytes, analytical.json ' + Buffer.byteLength(js) + ' bytes); toStaad / toJSON of one model twice also identical', std === std2 && js === js2 && AN.toStaad(model) === AN.toStaad(model) && AN.toJSON(model) === AN.toJSON(model), '');

// A7 refusal
const empty = AN.build([], opts), fake = { out: { gate: { R: { els: [], defaults_table: R.defaults_table } } } }, dirC = path.join(tmp, 'c'); fs.mkdirSync(dirC, { recursive: true });
const wr = await C.writeAnalytical(fake, dirC); let threw = false; try { AN.toStaad(empty); } catch (e) { threw = true; }
const noStruct = AN.build(els.filter(e => !STRUCT.includes(e['class'])), opts);
ok('A7 a set with no structure is refused (' + empty.refused + '), toStaad throws, the CLI writes nothing (' + fs.readdirSync(dirC).length + ' files); a set with only walls / roof / fans is refused too', !!empty.refused && threw && wr.refused && fs.readdirSync(dirC).length === 0 && !!noStruct.refused, '');

// A8 nothing guessed (through the IFC): no f'c in the IFC -> no elastic modulus for concrete + a finding per member; PINNED from the registry reaches the file
const txt = Buffer.from(ifcBytes).toString('latin1'), noFcBytes = new Uint8Array(Buffer.from(txt.split("'Note_fc_MPa'").join("'Note_fc_GONE'"), 'latin1')), m8 = await viaIfc(noFcBytes);
const pin = AN.build(els, { values: Object.assign({}, values, { 'analytical.support': 'PINNED' }), sources, LS }), pinStd = AN.toStaad(pin);
const fcF = m8.findings.filter(f => f.code === 'fc_missing').length;
ok('A8 no f\'c in the IFC: ' + fcF + ' findings, concrete materials ' + Object.keys(m8.materials).filter(k => /^CONC/.test(k)).length + ' (E never guessed), steel kept; analytical.support=PINNED -> ' + pin.supports.length + ' PINNED supports in the file',
  fcF === 131 && Object.keys(m8.materials).filter(k => /^CONC/.test(k)).length === 0 && !!m8.materials.STEEL && pin.supports.every(s => s.type === 'PINNED') && /PINNED$/m.test(pinStd) && !/FIXED$/m.test(pinStd), 'fc findings ' + fcF);

// A9 (U2) one beam-section owner: the builder takes a beam's axis and section from LoadSummary.beamSection; a beam turned 45 degrees in plan exports the same section and length
{ const Lb = 4.775, Wb = 0.305, Db = 0.254, beamAt = deg => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), V = [];
    [0, Lb].forEach(x => [-Wb / 2, Wb / 2].forEach(y => [3, 3 + Db].forEach(z => V.push([x * c - y * s, x * s + y * c, z])))); return { guid: 'b' + deg, class: 'IfcBeam', z0: 3, z1: 3 + Db, sheet: 's', handle: 'h' + deg, vertices: V, ifc: { material: 'Reinforced concrete', props: { Note_fc_MPa: '24' } } }; };
  const one = deg => { const m = AN.build([beamAt(deg)], opts), k = Object.keys(m.sections)[0]; return { key: k, len: m.members[0] && m.members[0].length }; }, a0 = one(0), a45 = one(45);
  const asrc = fs.readFileSync(path.join(M, 'dxf2analytical.js'), 'utf8');
  console.log('  A9 0 deg ' + JSON.stringify(a0) + ' | 45 deg ' + JSON.stringify(a45));
  ok('A9 one beam-section owner: dxf2analytical.js has no axisOf of its own and calls LS.beamSection; the beam at 45 degrees exports section ' + a45.key + ' = the 0 degree ' + a0.key + ', length ' + (a45.len || 0).toFixed(4) + ' = ' + (a0.len || 0).toFixed(4),
    !/function axisOf/.test(asrc) && /\.beamSection\(/.test(asrc) && a0.key === a45.key && Math.abs(a0.len - a45.len) < 1e-6 && a0.key === 'RECT ' + Db.toFixed(4) + 'x' + Wb.toFixed(4), ''); }

console.log((fail ? '§W-ANALYTICAL FAIL ' + fail : judged ? '§W-ANALYTICAL PASS ' + judged + '/0' : '§W-ANALYTICAL INCONCLUSIVE nothing judged'));
process.exit(fail ? 1 : 0);
})();
