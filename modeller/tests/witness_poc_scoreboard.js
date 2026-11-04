#!/usr/bin/env node
// ⚠ DO NOT REMOVE — §POC scoreboard (prompts/DXF2BIM_ARCHITECT_REVIEW.md §D109). Read the log after every run: exit code is not evidence.
// Issue it exposes: a Convert can say left_out=0 while most of the building is unread (a rotated loop is not a gap). `built` must be judged against a count taken from the SHEETS, never from the reader's own list.
// Usage: witness_poc_scoreboard.js --sheets <dir of .dxf> --run <dir with bodies.json>. No sheets given: SKIP, said loudly. A class with no evidence prints INCONCLUSIVE, never done.
'use strict';
const fs = require('fs'), path = require('path');
const arg = n => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : null; };
const dirS = arg('sheets') || process.env.REVIT_SET_DIR, dirR = arg('run');
if (!dirS || !fs.existsSync(dirS)) { console.log('§POC SKIP no sheets (--sheets or REVIT_SET_DIR): nothing judged'); process.exit(0); }
const DxfParser = require('dxf-parser');
const clean = t => String(t).replace(/\\[A-Za-z][^;\\]*;/g, '').replace(/\\P/g, ' ').replace(/[{}]/g, '').trim();
// Layer = <discipline>-<class>-...-IDEN holds the labels. `repeat`: the same elements are labelled on every plan, so the plan with most is the count; otherwise each plan has its own.
const CLS = [
  { name: 'columns', ifc: ['IfcColumn'], layer: /^[AS]-COLS-.*-IDEN$/, text: /^(?:N?C\d*[A-Z]?|BU-WF-\d+.*)$/, repeat: true },
  { name: 'footings', ifc: ['IfcFooting'], layer: /^S-FNDN-.*-IDEN$/, text: /^F\d+[A-Z]?$/, repeat: true },
  { name: 'beams_rc', ifc: ['IfcBeam'], layer: /^S-BEAM-.*-IDEN$/, text: /^[A-Z]*B\d*\(.*$/, repeat: false, resolved: true },
  { name: 'members_steel', ifc: ['IfcMember'], layer: /^S-BEAM-.*-IDEN$/, text: /^(?:-\s*)?(?:UB\d.*|UC\d.*|L\d+[xX]\d.*|RB\d+|BU[- ].*)$/, repeat: false },
  { name: 'doors', ifc: ['IfcDoor'], layer: /^A-DOOR(?:-.*)?-IDEN$/, text: /^[A-Z0-9]+-\d+(?:-[A-Z])?$/, repeat: false },
];
const files = fs.readdirSync(dirS).filter(f => /\.dxf$/i.test(f)).sort();
const count = {}; CLS.forEach(c => { count[c.name] = { perPlan: {}, kinds: {} }; });
let wallLen = 0, wallPlans = 0, slabLoops = 0, stairs = 0, roofLines = 0;
const labels = {}, stairNames = {};
files.forEach(f => {
  const d = new DxfParser().parseSync(fs.readFileSync(path.join(dirS, f), 'utf8')), isPlan = !/ELEVATION|SECTION|DETAIL/i.test(f);
  if (!isPlan) return;
  CLS.forEach(c => { d.entities.forEach(e => { if ((e.type !== 'MTEXT' && e.type !== 'TEXT') || !c.layer.test(e.layer)) return; const t = clean(e.text); if (!c.text.test(t)) return;
    count[c.name].perPlan[f] = (count[c.name].perPlan[f] || 0) + 1; const k = t.split(/[ (]/)[0]; count[c.name].kinds[k] = (count[c.name].kinds[k] || 0) + 1; }); });
  let wl = 0; d.entities.forEach(e => { if (e.type === 'LINE' && /^A-WALL$/.test(e.layer)) wl += Math.hypot(e.vertices[1].x - e.vertices[0].x, e.vertices[1].y - e.vertices[0].y); });
  if (wl) { wallLen += wl / 1000; wallPlans++; }   // metres of wall line: a wall is several lines, so a length of wall is not countable from the sheets without its type
  // stairs, roof: present or not, from what the sheet SAYS. A layer's entity count is no evidence: one stair drawn as thousands of short curved pieces read as 13,248 stairs on the first run. Count the stairs the sheet names.
  d.entities.forEach(e => { if (/^S-SLAB|^A-FLOR-____-OTLN$/.test(e.layer)) slabLoops++; if (e.type === 'MTEXT' || e.type === 'TEXT') { const t = clean(e.text); if (/^STAIR\s+[A-Z0-9]{1,2}$/i.test(t)) stairNames[t.toUpperCase()] = 1; if (/^TOS\b/i.test(t) || /^T\/ROOF\b/i.test(t)) roofLines++; } });
  labels[f] = d.entities.filter(e => (e.type === 'MTEXT' || e.type === 'TEXT')).map(e => { const p = e.position || e.startPoint || {}; return { t: clean(e.text), x: p.x, y: p.y, layer: e.layer }; });
});
const bodies = dirR && fs.existsSync(path.join(dirR, 'bodies.json')) ? JSON.parse(fs.readFileSync(path.join(dirR, 'bodies.json'), 'utf8')) : null;
const verdict = dirR && fs.existsSync(path.join(dirR, 'verdict.json')) ? JSON.parse(fs.readFileSync(path.join(dirR, 'verdict.json'), 'utf8')) : null;
const by = {}; (bodies || []).forEach(b => { by[b.class] = (by[b.class] || 0) + 1; });
const built = names => names.reduce((a, n) => a + (by[n] || 0), 0);
const line = (name, b, ev, note) => { const inc = !(ev > 0) ? ' INCONCLUSIVE: no evidence in these sheets' : !bodies ? ' INCONCLUSIVE: no run' : ''; console.log('§POC ' + name + ' built=' + b + ' evidence=' + ev + ' gap=' + (ev > 0 ? Math.max(0, ev - b) : '-') + inc + (note ? '  ' + note : '')); };
CLS.forEach(c => { const pp = count[c.name].perPlan, vals = Object.keys(pp).map(k => pp[k]), ev = !vals.length ? 0 : c.repeat ? Math.max.apply(null, vals) : vals.reduce((a, v) => a + v, 0);
  // a labelled class counts labels that found their element: a label that names a repeat of one beam is not missing
  const rb = c.resolved && verdict && verdict.report && verdict.report.beams; if (rb) console.log('§POC_BEAMS ' + JSON.stringify(rb));
  const dr = c.name === 'doors' && verdict && verdict.report && verdict.report.doors; if (dr) console.log('§POC_DOORS ' + JSON.stringify(dr) + ' leaves=' + built(c.ifc));
  const sb = c.name === 'members_steel' && verdict && verdict.report && verdict.report.steel; if (sb) console.log('§POC_STEEL ' + JSON.stringify(sb));
  line(c.name, rb ? rb.labels - rb.no_edges : sb ? sb.built + sb.same_line : dr ? dr.built_tags : built(c.ifc), ev, Object.keys(count[c.name].kinds).sort().map(k => k + ':' + count[c.name].kinds[k]).join(' ')); });
const wr = verdict && verdict.report && verdict.report.walls; if (wr) console.log('§POC_WALLS ' + JSON.stringify(wr) + ' bodies=' + built(['IfcWall']));
line('wall_lines_m', wr ? Math.round(wr.covered_m) : 0, Math.round(wallLen), wallPlans + ' plans with wall lines');
const cr = verdict && verdict.report && verdict.report.curtain; if (cr) console.log('§POC_CURTAIN ' + JSON.stringify(cr) + ' bodies=' + built(['IfcCurtainWall']));
const sr = verdict && verdict.report && verdict.report.slabs; if (sr) console.log('§POC_SLABS ' + JSON.stringify(sr));
line('slab_levels', sr ? sr.built_levels : 0, sr ? sr.levels : 0, slabLoops + ' floor lines');
const stR = verdict && verdict.report && verdict.report.stairs; if (stR) console.log('§POC_STAIRS ' + JSON.stringify(stR));
line('named_stairs', stR ? stR.named_built : 0, Object.keys(stairNames).length, Object.keys(stairNames).sort().join(' '));
const rR = verdict && verdict.report && verdict.report.roof; if (rR) console.log('§POC_ROOF ' + JSON.stringify(rR));
line('roof', built(['IfcRoof']), roofLines ? 1 : 0, roofLines + ' roof spot levels');
// a count that matches can still be the wrong elements: each label of a repeated class goes to its nearest body (bbox, metres), on the plan with most labels. Two labels on one body or a body with none is printed.
CLS.filter(c => c.repeat && bodies).forEach(c => { const pp = count[c.name].perPlan, f = Object.keys(pp).sort((a, b) => pp[b] - pp[a])[0]; if (!f) return;
  const B = bodies.filter(b => c.ifc.indexOf(b.class) >= 0 && b.bbox), L = labels[f].filter(q => c.layer.test(q.layer) && c.text.test(q.t));
  // nearest first, each body and each label used once: a rotated body's bbox overlaps its neighbour's, so a plain nearest would double count. A body that carries a mark must carry the label's.
  const P = []; L.forEach((q, li) => { const x = q.x * 0.001, y = q.y * 0.001; B.forEach((b, bi) => { if (b.mark && b.mark !== q.t) return; const dx = Math.max(b.bbox[0] - x, 0, x - b.bbox[3]), dy = Math.max(b.bbox[1] - y, 0, y - b.bbox[4]); P.push([Math.hypot(dx, dy), li, bi]); }); });
  P.sort((a, b) => a[0] - b[0]); const uL = {}, uB = {}; let n = 0; P.forEach(p => { if (uL[p[1]] || uB[p[2]] || p[0] > 3) return; uL[p[1]] = uB[p[2]] = 1; n++; });
  console.log('§POC_MATCH ' + c.name + ' labels=' + L.length + ' bodies=' + B.length + ' matched=' + n + ' unmatched_labels=' + (L.length - n) + ' unmatched_bodies=' + (B.length - n) + ' on=' + f.slice(0, 5)); });
const hs = {}; (bodies || []).forEach(b => { const k = b.class + ':' + (b.height_source || '-'); hs[k] = (hs[k] || 0) + 1; });
console.log('§POC_HEIGHT ' + JSON.stringify(hs));
console.log('§POC_TOTAL bodies=' + (bodies ? bodies.length : 'no run') + ' sheets=' + files.length);
