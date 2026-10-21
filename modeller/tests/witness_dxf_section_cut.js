#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-SECTION-CUT (rule D30, prompts/DXF2BIM_FOUNDATION_LANE.md §F8). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: our standard set's SECTION was cut midway between the first two grid lines, where it crossed slabs of 2 of LTU's 4 storeys (HHS 0 of 3),
 * so the reader had no slab underside from the section, the walls under the slab got no height, and their openings no bounds.
 *   C1 MOST FLOORS — with no stated cut, the section's X crosses a slab of as many plan storeys as the best grid bay does (and is the first such bay).
 *   C2 FIRST BAY   — when the first bay already crosses the most floors, the cut is the first bay's midpoint (the set is unchanged: Duplex byte-identical to the writer before D30, BASE=<repo>).
 *   C3 STATED CUT  — a stated cut (sectionAt pivot / a number) is never moved.
 *   C4 READ        — the reader takes the slab of every storey the section crosses from the section (source=section), never fewer storeys than with the old first-bay cut.
 * Usage: NODE_PATH=<dir with better-sqlite3> node modeller/tests/witness_dxf_section_cut.js <Node model .db>
 */
'use strict';
const path = require('path'), crypto = require('crypto'), M = path.join(__dirname, '..'), D = path.join(M, 'dxf2bim') + '/';
const S = require(D + 'std2d.js'), Mk = require(D + 'std2d_marks.js'), MK = require(D + 'dxf2marks.js'), B = require(D + 'dxf2bim.js'), SHC = require(D + 'dxf2shell_config.js');
const DxfParser = require(path.join(M, 'lib/dxf-parser.js')), I = require(path.join(M, 'dxf2bim_import.js'));
const Database = require(path.join(process.env.HOME, 'bim-compiler/node_modules/better-sqlite3'));
const hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const con = new Database(process.argv[2], { readonly: true }), q = s => con.prepare(s).all();
const R = S.writeStdSet(q, 'X', {}), Mo = R.model, xs = R.grid.x.map(g => g[1]), sts = S.planStoreys(Mo), slabs = Mo.els.filter(e => e.cls === 'IfcSlab');
const cov = x => sts.filter(st => slabs.some(e => e.storey === st.name && e.x0 < x && x < e.x1)).length, mids = []; for (let i = 0; i + 1 < xs.length; i++) mids.push(Number(((xs[i] + xs[i + 1]) / 2).toFixed(6)));
const best = Math.max(...mids.map(cov)), firstBest = mids.find(x => cov(x) === best), X = Mo.sectionX;
check('C1', 'the default section crosses a slab of as many storeys as the best grid bay, at the first such bay', X !== null && cov(X) === best && (cov(mids[0]) === best ? X === mids[0] : X === firstBest), `cut X=${X} floors=${cov(X)}/${sts.length} best=${best} first_bay=${cov(mids[0])} bays=${mids.length}`);
if (cov(mids[0]) === best && process.env.BASE) { const SB = require(path.join(process.env.BASE, 'modeller/dxf2bim/std2d.js')), Rb = SB.writeStdSet(q, 'X', {}); check('C2', 'the first bay already crosses the most floors: the set is byte-identical to the writer before D30', Object.keys(Rb.files).every(n => Rb.files[n] === R.files[n]), 'files=' + Object.keys(R.files).length); }
else say(`INFO C2 | first bay crosses ${cov(mids[0])} of the best ${best}${process.env.BASE ? '' : ' (BASE not given)'}`);
const ws = Mo.walls, cx = (Math.min(...ws.map(w => w.x0)) + Math.max(...ws.map(w => w.x1))) / 2, cy = (Math.min(...ws.map(w => w.y0)) + Math.max(...ws.map(w => w.y1))) / 2;
const Rn = S.writeStdSet(q, 'X', { sectionAt: mids[0] }), Rp = S.writeStdSet(q, 'X', { wing: { name: 'W', turn: 0, pivot: [cx, cy] }, sectionAt: 'pivot' });
check('C3', 'a stated cut is never moved (a number; the wand pivot)', Rn.model.sectionX === mids[0] && Math.abs(Rp.model.sectionX - Rp.wing.ox) < 1e-6, `number ${Rn.model.sectionX} (asked ${mids[0]}); pivot ${Rp.model.sectionX} (plane ${Rp.wing && Rp.wing.ox})`);
const readSec = Rx => { const Dm = Mk.deriveMarks(Rx, { B, DxfParser, hashHex, MK, SHC }, { set: 'X' }), o = I.convert(I.readSheets(Object.keys(Dm.files).map(n => ({ name: n, text: Dm.files[n] }))), {}); return Object.values(o.slabZ || {}).filter(z => z.source === 'section').length; };
const now = readSec(R), old = readSec(Rn);
check('C4', 'the reader takes the slabs of the storeys the section crosses from the section, never fewer than with the first-bay cut', now >= old, `slabs from the section: ${old} (first bay) -> ${now}`);
say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
