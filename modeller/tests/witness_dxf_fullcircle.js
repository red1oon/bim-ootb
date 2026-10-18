#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-FULLCIRCLE: prompts/DXF2BIM_MODELLER_LANE.md §L21. Read the log after every run (exit code is not evidence).
 *
 * THE ISSUE THIS PROVES OR DISPROVES: the 448-body shed IFC (built by the product CLI from the eight real sheets, the exact ALLARGS line of witness_dxf_cli.js C31),
 * written back to a standard 2D set by std2d.js, puts columns, the building grid, doors and walls at the SAME COORDINATES as the ORIGINAL 0_FLOOR_PLAN.dxf (1 mm).
 *   F1 R2PRIME  F2 COLUMNS  F3 GRID  F4 DOORS  F5 WALLS  F6 ACCOUNT  F7 CONTROL (the checks can fail)  F8 DOOR-IN-WALL (spatial invariant, §L21.2)
 * Usage: NODE_PATH=<dir with web-ifc, sql.js> node modeller/tests/witness_dxf_fullcircle.js   (needs ~/Projects/SYSNOVA/DXF2BIM/ShedDrawing/sheets/)
 */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const M = path.join(__dirname, '..'), D = path.join(M, 'dxf2bim') + '/', CLI = path.join(M, 'dxf2bim_cli.js');
const SHD = path.join(os.homedir(), 'Projects/SYSNOVA/DXF2BIM/ShedDrawing/sheets') + '/';
const IN = 25.4, TOL = 1;   // original drawing units are inches; the regenerated set is millimetres in the same world frame
const lines = []; let fail = 0;
const say = s => { lines.push(s); console.log(s); };
const check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
if (!fs.existsSync(SHD + '0_FLOOR_PLAN.dxf')) { console.log('SKIP: shed sheets not found at ' + SHD); process.exit(0); }
const DxfParser = require(path.join(M, 'lib/dxf-parser.js'));
const parse = text => new (DxfParser.default || DxfParser)().parseSync(text);
const bb = v => { const x = v.map(p => p.x), y = v.map(p => p.y); return [Math.min(...x), Math.min(...y), Math.max(...x), Math.max(...y)]; };
// one-to-one nearest match: each original item takes the nearest unused regenerated item; returns the worst distance and what is left over
function match(orig, regen, dist) {
  const used = new Set(); let worst = 0; const far = [];
  orig.forEach((a, i) => { let best = Infinity, bj = -1; regen.forEach((b, j) => { if (used.has(j)) return; const d = dist(a, b); if (d < best) { best = d; bj = j; } });
    if (bj >= 0) { used.add(bj); worst = Math.max(worst, best); if (best > TOL) far.push([i, best]); } else far.push([i, Infinity]); });
  return { worst, far, unmatchedRegen: regen.length - used.size };
}
const boxDist = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
(async () => {
  const WebIFC = require('web-ifc'), initSqlJs = require('sql.js');
  const Core = require(D + 'ifc_extract_core.js'), S = require(D + 'std2d.js');
  // the product run (C31 ALLARGS)
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'fullcircle-'));
  const SHEETS = ['0_FLOOR_PLAN', '1S_ELEV_SOUTH', '1N_ELEV_NORTH', '2_ELEV_WEST', '7_ELEV_EAST', '3_BEAM_LAYOUT', '4_FOUNDATION_LAYOUT', '8_SECTION_AA_TRUSS'].map(x => SHD + x + '.dxf');
  const A = [CLI, '--sheets'].concat(SHEETS, ['--out', out, '--complete', '--ifc', '--accept-suggestions', '--set', 'SHED', '--level', '0',
     '--datum', '1S_ELEV:0.6096@-4446.6', '--datum', '1N_ELEV:0.6096@-3895.2', '--datum', '2_ELEV:0.6096@-4515.7264', '--datum', '7_ELEV:0.6096@-3766.442', '--datum', '8_SECTION:0.6096@-3726.416',
     '--layer', 'plan:Col=column', '--layer', 'elev:0=column@1S_ELEV', '--layer', 'plan:Fo=footing', '--layer', 'plan:Dim=beam@3_BEAM',
     '--layer', 'elev:Wall=panel', '--layer', 'elev:Rod=fan', '--layer', 'elev:Dim=net', '--layer', 'plan:Rod=doorswing@0_FLOOR', '--layer', 'section:Fo=bar', '--bodyz', 'footing=-1.4478,-1.143', '--exclude', '3_BEAM:-20880,-5600,-20845,-4950', '--bodyz', 'beam=3.098794,3.352794']);
  const r = cp.spawnSync('node', A, { encoding: 'utf8' });
  const bodies = r.status === 0 ? JSON.parse(fs.readFileSync(path.join(out, 'bodies.json'), 'utf8')) : [];
  say('  PRODUCT RUN rc=' + r.status + ' ' + ((r.stdout.match(/§CLI result .*/) || [''])[0]).replace(/ out=\S+/, '').slice(0, 260));
  if (bodies.length !== 448) { check('F0 INPUT', 'the product did not build the 448-body shed', false, 'bodies=' + bodies.length); process.exit(1); }
  const SQL = await initSqlJs(), api = new WebIFC.IfcAPI(); await api.Init(); const sdb = new SQL.Database();
  await Core.extractToDb({ WebIFC, ifcApi: api, ifcData: new Uint8Array(fs.readFileSync(path.join(out, 'model.ifc'))), db: Core.sqljsDb(sdb), Buf: Core.browserBuf, buildingName: 'SHED', sourceName: 'model.ifc', log: () => {} });
  const q = sql => { const x = sdb.exec(sql); if (!x.length) return []; return x[0].values.map(v => Object.fromEntries(x[0].columns.map((c, i) => [c, v[i]]))); };
  // F1 R2' (BIMCompiler #220): the unaided writer plans the single-storey shed (it threw before; see §L21)
  let thrown = null, R = null; try { R = S.writeStdSet(q, 'SHED'); } catch (e) { thrown = e.message; }
  check('F1 R2PRIME', 'the unmodified writer cannot plan the single-storey shed', thrown === null && R.log.some(l => l.indexOf('§STOREY_SINGLE') === 0) && Object.keys(R.files).some(f => /FLOOR_/.test(f)), thrown || R.log.filter(l => /^§STOREY/.test(l)).join(' / '));
  if (!R) process.exit(1);
  say('  files=' + Object.keys(R.files).join(' ') + '; gaps=' + JSON.stringify(R.log.filter(l => l.indexOf('§GAP_SUMMARY') === 0)));
  const planName = Object.keys(R.files).find(f => /FLOOR_/.test(f)), reg = parse(R.files[planName]), org = parse(fs.readFileSync(SHD + '0_FLOOR_PLAN.dxf', 'utf8'));
  const E = (d, layer, type) => d.entities.filter(e => e.layer === layer && (!type || e.type === type));
  // F2 COLUMNS
  const oc = E(org, 'Col').map(e => bb(e.vertices).map(v => v * IN)), rc = E(reg, 'S-COLS').map(e => bb(e.vertices));
  const m2 = match(oc, rc, boxDist);
  check('F2 COLUMNS', 'a column of the original plan is not where the regenerated plan puts it (1 mm, one-to-one)', oc.length === 32 && rc.length === 32 && m2.far.length === 0 && m2.unmatchedRegen === 0, `orig=${oc.length} regen=${rc.length} worst bbox deviation=${m2.worst.toFixed(4)} mm`);
  // F3 GRID
  const lineKey = e => { const a = e.vertices[0], b = e.vertices[1]; return Math.abs(a.x - b.x) < Math.abs(a.y - b.y) ? ['v', a.x] : ['h', a.y]; };
  const og = E(org, 'C L', 'LINE').map(e => { const k = lineKey(e); return [k[0], k[0] === 'v' ? k[1] * IN : k[1] * IN]; }), rg = E(reg, 'A-GRID', 'LINE').map(e => lineKey(e));
  const gd = (a, b) => a[0] === b[0] ? Math.abs(a[1] - b[1]) : Infinity, m3 = match(og, rg, gd);
  check('F3 GRID', 'a centre line of the original plan is not a grid line of the regenerated plan (1 mm, one-to-one)', og.length === 18 && rg.length === 18 && m3.far.length === 0 && m3.unmatchedRegen === 0, `orig=${og.length} (v${og.filter(g => g[0] === 'v').length}/h${og.filter(g => g[0] === 'h').length}) regen=${rg.length} worst=${m3.worst.toFixed(4)} mm`);
  // F4 DOORS
  const bbox2 = b => [b.bbox[0] * 1000, b.bbox[1] * 1000, b.bbox[3] * 1000, b.bbox[4] * 1000];
  const od = bodies.filter(b => b.class === 'IfcDoor').map(bbox2), rd = E(reg, 'A-DOOR').map(e => bb(e.vertices)), m4 = match(od, rd, boxDist);
  check('F4 DOORS', 'a door body (from the original Rod swing symbols) is not where the regenerated plan draws it (1 mm)', od.length === 4 && rd.length === 4 && m4.far.length === 0, `bodies=${od.length} regen=${rd.length} worst=${m4.worst.toFixed(4)} mm`);
  // F5 WALLS
  const wb = bodies.filter(b => b.class === 'IfcWall'), wbb = wb.map(bbox2), rw = E(reg, 'A-WALL-FULL').map(e => bb(e.vertices));
  const inside = (a, b) => a[0] >= b[0] - TOL && a[1] >= b[1] - TOL && a[2] <= b[2] + TOL && a[3] <= b[3] + TOL;
  const rows = [], bad = [], touched = new Set(); let shortest = 0, thinWorst = 0;
  rw.forEach((a, i) => {
    const host = wbb.map((b, j) => [j, b]).filter(([, b]) => inside(a, b)); host.forEach(([j]) => touched.add(j));
    if (!host.length) { bad.push('contour ' + i + ' inside no wall body'); return; }
    const best = host.map(([, b]) => { const thinX = (b[2] - b[0]) < (b[3] - b[1]); return thinX ? Math.max(Math.abs(a[0] - b[0]), Math.abs(a[2] - b[2])) : Math.max(Math.abs(a[1] - b[1]), Math.abs(a[3] - b[3])); });
    thinWorst = Math.max(thinWorst, Math.min(...best)); if (Math.min(...best) > TOL) bad.push('contour ' + i + ' thin-axis faces differ ' + Math.min(...best).toFixed(2));
    host.slice(0, 1).forEach(([, b]) => { const run = Math.max(b[2] - b[0], b[3] - b[1]) - Math.max(a[2] - a[0], a[3] - a[1]); if (run > TOL) { rows.push(`run ${run.toFixed(1)} mm shorter than its panel`); shortest = Math.max(shortest, run); } });
  });
  check('F5 WALLS', 'a regenerated wall contour is outside the wall bodies or its thickness faces are off by more than 1 mm', rw.length > 0 && bad.length === 0, `contours=${rw.length} worst thickness-face deviation=${thinWorst.toFixed(4)} mm ${bad.slice(0, 4).join('; ')}; ${rows.length} contours shorter along the run than their panel bbox (max ${shortest.toFixed(1)} mm: panel outline not rectangular at the cut height)`);
  // F6 ACCOUNT
  const cls = {}; bodies.forEach(b => { cls[b.class] = (cls[b.class] || 0) + 1; });
  const why = { IfcColumn: 'drawn S-COLS', IfcWall: 'cut at 1.2 m: A-WALL-FULL', IfcDoor: 'drawn A-DOOR', IfcFooting: 'below the 1.2 m cut: not plan content', IfcBeam: 'above the cut (beam sheet)', IfcSlab: 'not cut', IfcRoof: 'roof sheet', IfcFan: 'gable elevation content', IfcMember: 'truss section content', IfcPlate: 'truss section content', IfcCovering: 'net above the cut (elevation)' };
  say('  ACCOUNT ' + Object.keys(cls).sort().map(c => `${c} ${cls[c]} (${why[c] || 'UNEXPLAINED'})`).join('; '));
  const unwalled = wb.filter((b, j) => !touched.has(j)).map(b => b.guid + ' z' + b.z0.toFixed(2) + '-' + b.z1.toFixed(2));
  check('F6 ACCOUNT', 'a body class has neither plan content nor a stated reason', Object.keys(cls).every(c => why[c]), `${Object.keys(cls).length} classes explained; ${unwalled.length} of ${wb.length} wall bodies have no contour inside: ${unwalled.slice(0, 8).join(', ')}${unwalled.length > 8 ? ' ...' : ''}`);
  // F8 DOOR-IN-WALL (§L21.2): a door overlaps no wall body in 3D, and sits in a gap of its own wall line with wall bodies bounding it on both sides
  const wall3 = wb.map(b => b.bbox.map(v => v * 1000)), clr = [];
  const dd = bodies.filter(b => b.class === 'IfcDoor').map(b => ({ g: b.guid, b: b.bbox.map(v => v * 1000) }));
  const overlaps = dd.filter(d => wall3.some(w => w[0] < d.b[3] && w[3] > d.b[0] && w[1] < d.b[4] && w[4] > d.b[1] && w[2] < d.b[5] && w[5] > d.b[2]));
  dd.forEach(d => {   // the wall line runs along x (door depth << width); neighbours: wall bodies (any direction: a gable end counts) touching the door's y band +-200 mm, to its left and right
    const near = wall3.filter(w => w[1] - 200 < d.b[4] && w[4] + 200 > d.b[1]);
    const left = near.filter(w => w[3] <= d.b[0] + 0.5).map(w => d.b[0] - w[3]), right = near.filter(w => w[0] >= d.b[3] - 0.5).map(w => w[0] - d.b[3]);
    clr.push(left.length && right.length ? `${d.g.replace('body-door-0-', '')} ${Math.min(...left).toFixed(0)}|${Math.min(...right).toFixed(0)}` : `${d.g} NO-NEIGHBOUR`);
  });
  check('F8 DOOR-IN-WALL', 'a door overlaps a wall body, or is not bounded by walls on its own wall line (so there is no opening to cut)', dd.length === 4 && overlaps.length === 0 && clr.every(c => !/NO-NEIGHBOUR/.test(c)), `doors=${dd.length} overlapping wall bodies=${overlaps.length}; clearance left|right to the neighbouring panels (mm): ${clr.join('; ')}`);
  // F7 CONTROL
  const moved = rc.map((b, i) => i === 0 ? b.map(v => v + 2) : b), dropped = rc.slice(1), mv = match(oc, moved, boxDist), dr = match(oc, dropped, boxDist);
  const gmoved = rg.map((g, i) => i === 0 ? [g[0], g[1] + 2] : g), mg = match(og, gmoved, gd);
  check('F7 CONTROL', 'the checks cannot see a column moved 2 mm, a column deleted, or a grid line moved 2 mm', mv.far.length > 0 && dr.far.length > 0 && mg.far.length > 0, `moved column worst=${mv.worst.toFixed(2)} mm; deleted column unmatched=${dr.far.length}; moved grid line worst=${mg.worst.toFixed(2)} mm`);
  fs.mkdirSync(path.join(__dirname, 'logs'), { recursive: true }); fs.writeFileSync(path.join(__dirname, 'logs', 'witness_dxf_fullcircle.log'), lines.join('\n') + '\n');
  say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
