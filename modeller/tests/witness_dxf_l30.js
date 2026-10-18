#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-L30 (prompts/DXF2BIM_MODELLER_LANE.md §L30): the details sheet's FOOTING and COLUMN schedules read by cell geometry, attached under a stated rule, and the below-grade section taken from the sheet. REAL sheets (SKIP without them). READ THE LOG.
// Issues proved/disproved: S1 no cell is attached to the wrong header (the (A) stirrup must not land under Main_Bar); S2-S3 the shed builds its below-grade columns from its own schedule with no manual setting and carries the rows only where the rule allows; S4-S6 controls (stated beats sheet, no sheet, non-square cell); S7 the page agrees.
// usage: NODE_PATH=~/bim-compiler/node_modules node modeller/tests/witness_dxf_l30.js
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const CLI = path.join(__dirname, '..', 'dxf2bim_cli.js'), SHD = path.join(process.env.HOME, 'Projects/SYSNOVA/DXF2BIM/ShedDrawing/sheets') + '/';
let fails = 0; const ok = (id, c, m) => { console.log((c ? '§PASS ' : '§FAIL ') + id + ' ' + (m || '')); if (!c) fails++; };
if (!fs.existsSync(SHD + '5_DETAILS.dxf')) { console.log('§SKIP W-L30 no real sheets at ' + SHD); process.exit(0); }
const DP = require('dxf-parser'), N = require('../dxf2notes.js'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l30-'));
const parse = t => new (DP.default || DP)().parseSync(t), detailsText = fs.readFileSync(SHD + '5_DETAILS.dxf', 'utf8');
const sc = N.schedules([{ name: '5_DETAILS.dxf', dxf: parse(detailsText) }]), T = k => (sc.tables.filter(t => t.kind === k)[0] || { cells: {} }).cells, txt = (c, k) => c[k] && c[k].text;
const f = T('footing'), c = T('column');
ok('S1 footing table: F-1, 4\'-0" x 5\'-0", T 12", both bars 12 mm dia @ 6" C/C', txt(f, 'Type') === 'F-1' && txt(f, 'Size_L_x_B') === '4\'-0" x 5\'-0"' && txt(f, 'T') === '12"' && txt(f, 'L_Bar') === '12 mm dia @ 6" C/C' && txt(f, 'S_Bar') === '12 mm dia @ 6" C/C', JSON.stringify(Object.keys(f)));
ok('S1b column table: C-1, 12" x 12" / 14" x 14", 6-16dia, stirrups A 5" and B 10" under their own markers; nothing mis-assigned', txt(c, 'Type') === 'C-1' && txt(c, 'Above_Gr') === '12" x 12"' && txt(c, 'Below_Gr') === '14" x 14"' && txt(c, 'Main_Bar') === '6-16dia' && /@ 5" C\/C \(A\)$/.test(txt(c, 'Stirrup_A')) && /@ 10" C\/C \(B\)$/.test(txt(c, 'Stirrup_B')) && !/@/.test(txt(c, 'Main_Bar')) && sc.unassigned.length === 0 && sc.gaps.length === 0, 'unassigned ' + sc.unassigned.length + ' gaps ' + sc.gaps.length);
ok('S1c below-grade section from the cell: 0.3556 m (14 in) by 5_DETAILS.dxf#<handle>', sc.derived.belowgrade && sc.derived.belowgrade.value === 0.3556 && /^5_DETAILS\.dxf#/.test(sc.derived.belowgrade.by), JSON.stringify(sc.derived));
const base = ['0_FLOOR_PLAN', '1S_ELEV_SOUTH', '1N_ELEV_NORTH', '2_ELEV_WEST', '7_ELEV_EAST', '3_BEAM_LAYOUT', '4_FOUNDATION_LAYOUT', '8_SECTION_AA_TRUSS'];
const run = (name, files, extra) => { const o = path.join(dir, name), r = cp.spawnSync('node', [CLI, '--sheets'].concat(files, ['--out', o, '--complete', '--ifc', '--accept-suggestions', '--set', 'SHED', '--level', '0',
  '--datum', '1S_ELEV:0.6096@-4446.6', '--datum', '1N_ELEV:0.6096@-3895.2', '--datum', '2_ELEV:0.6096@-4515.7264', '--datum', '7_ELEV:0.6096@-3766.442', '--datum', '8_SECTION:0.6096@-3726.416',
  '--layer', 'plan:Col=column', '--layer', 'elev:0=column@1S_ELEV', '--layer', 'plan:Fo=footing', '--layer', 'plan:Dim=beam@3_BEAM', '--layer', 'elev:Wall=panel', '--layer', 'elev:Rod=fan', '--layer', 'elev:Dim=net', '--layer', 'plan:Rod=doorswing@0_FLOOR', '--layer', 'section:Fo=bar', '--layer', 'elev:Win=elevdoor',
  '--bodyz', 'footing=-1.4478,-1.143', '--exclude', '3_BEAM:-20880,-5600,-20845,-4950', '--bodyz', 'beam=3.098794,3.352794'], extra || []), { encoding: 'utf8' });
  console.log('  ' + name + ': ' + (r.stdout.match(/§CLI result .*/) || [''])[0].replace(/ out=\S+/, '').slice(0, 120) + (r.status ? ' rc=' + r.status + (r.stderr || '').slice(0, 200) : ''));
  return { out: o, rc: r.status, bodies: JSON.parse(fs.readFileSync(path.join(o, 'bodies.json'), 'utf8')), ops: JSON.parse(fs.readFileSync(path.join(o, 'ops.json'), 'utf8')).inserts, verdict: JSON.parse(fs.readFileSync(path.join(o, 'verdict.json'), 'utf8')) }; };
const files = n => base.concat(n).map(x => SHD + x + '.dxf');
const A = run('schedule-only', files(['5_DETAILS']), []), D = run('stated-wins', files(['5_DETAILS']), ['--default', 'synth.column.belowgrade.size=0.4064']), B = run('no-details', files([]), []);
const props = r => r.ops.map(o => o.params.provenance.ifc.props), kind = (r, k) => props(r).filter(p => p.Kind === k), all = (a, fn) => a.length > 0 && a.every(fn), mm = (a, b) => Math.abs(a - b) < 0.001;
const bel = A.bodies.filter(b => /^synth-colbelow-/.test(b.guid));
ok('S2 no manual setting: 512 bodies, 96 columns, 32 below parts 0.3556 with source "schedule"', A.rc === 0 && A.bodies.length === 512 && A.bodies.filter(b => b.kind === 'column').length === 96 && bel.length === 32 && all(bel, b => b.size.x.number === 0.3556 && b.size.x.source === 'schedule'), 'bodies ' + A.bodies.length);
const row = A.verdict.defaults && A.verdict.defaults.filter(d => d.key === 'synth.column.belowgrade.size')[0];
ok('S2b the yellow row is a stated row naming the sheet cell it came from', !!row && row.kind === 'stated' && /5_DETAILS\.dxf#/.test(row.evidence || ''), JSON.stringify(row).slice(0, 200));
ok('S3 every footing carries F-1 and every column part C-1 with SchedBasis; beams and panels carry no Sched_ prop', all(kind(A, 'footing'), p => p.Sched_Footing_L_Bar === '12 mm dia @ 6" C/C' && p.Sched_Footing_Type === 'F-1' && /single schedule row/.test(p.SchedBasis_footing)) &&
  all(kind(A, 'column'), p => p.Sched_Column_Main_Bar === '6-16dia' && p.Sched_Column_Type === 'C-1' && /single schedule row/.test(p.SchedBasis_column)) && all(kind(A, 'beam').concat(kind(A, 'panel')), p => !Object.keys(p).some(k => /^Sched/.test(k))), 'footings ' + kind(A, 'footing').length + ' columns ' + kind(A, 'column').length);
const bd = D.bodies.filter(b => /^synth-colbelow-/.test(b.guid));
const partProps = A.ops.map(o => o.params.provenance.ifc).filter(i => /^Column (below grade|grade to base)$/.test(i.type_name || '')).map(i => i.props);
ok('S3b the 64 derived column parts say they take the row as parts of a drawn column', partProps.length === 64 && all(partProps, p => /part of/.test(p.SchedBasis_column) && p.Sched_Column_Type === 'C-1'), 'parts ' + partProps.length);
ok('S4 control: an explicit --default (0.4064) wins over the schedule, source "stated"', bd.length === 32 && all(bd, b => b.size.x.number === 0.4064 && b.size.x.source === 'stated'), 'size ' + (bd[0] && bd[0].size.x.number));
ok('S5 control: no details sheet -> 448 bodies, no Sched_ prop anywhere', B.bodies.length === 448 && !props(B).some(p => Object.keys(p).some(k => /^Sched/.test(k))), 'bodies ' + B.bodies.length);
// S6 control: the same sheet with the below-grade cell made non-square (a modified copy of the real sheet text, marked as a control)
const bad = path.join(dir, 'ctl'); fs.mkdirSync(bad); const badText = detailsText.replace(/14" x 14"/g, '14" x 12"').replace(/14"x14"/g, '14"x12"'); fs.writeFileSync(path.join(bad, '5_DETAILS.dxf'), badText);
ok('S6a control text really changed', badText !== detailsText && /14" x 12"/.test(badText), '');
const E = run('non-square', base.map(x => SHD + x + '.dxf').concat(path.join(bad, '5_DETAILS.dxf')), []);
ok('S6 control: a non-square below-grade cell -> GAP, no below body, 448', E.bodies.length === 448 && E.verdict.verdict && JSON.stringify(E.verdict).indexOf('synth_column_belowgrade_not_square') > 0, 'bodies ' + E.bodies.length);
(async () => {
  const http = require('http'), ROOT = path.join(__dirname, '..', '..'), puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    const pg = await br.newPage(); await pg.setViewport({ width: 1600, height: 900 }); pg.on('pageerror', e => console.log('§PAGEERR ' + String(e).slice(0, 200)));
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 });
    await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.A && window.A.scene', { timeout: 120000 });
    const mdir = path.join(A.out, 'marked'), mf = fs.readdirSync(mdir).sort().map(x => path.join(mdir, x));
    await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
    const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(mf);
    await pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict', { timeout: 240000 }); await new Promise(r => setTimeout(r, 1500));
    await pg.evaluate(() => { const x = document.getElementById('dxf-complete'); if (x && !x.checked) x.click(); }); await new Promise(r => setTimeout(r, 2500));
    await pg.click('#dxf-convert'); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 240000 });
    const r = await pg.evaluate(() => { const o = window.Bonsai.oplog._geomOps().filter(x => x.op_type === 'GEOM_INSERT'), P = x => x.parameters || x.params || {}, pr = x => (P(x).provenance && P(x).provenance.ifc && P(x).provenance.ifc.props) || {}; return { n: window.DxfImportUI.state.last.nInserts, below: o.filter(x => /Column below grade/.test((P(x).provenance.ifc || {}).type_name || '')).length, sched: o.filter(x => pr(x).Sched_Column_Main_Bar === '6-16dia').length, schedFoot: o.filter(x => pr(x).Sched_Footing_Type === 'F-1').length, wrong: o.filter(x => (pr(x).Kind === 'beam' || pr(x).Kind === 'panel') && Object.keys(pr(x)).some(k => /^Sched/.test(k))).length }; });
    ok('S7 page on the marked sheets: 512 inserts, 32 below parts, 96 column parts + 32 footings carry their row, no beam/panel does', r.n === 512 && r.below === 32 && r.sched === 96 && r.schedFoot === 32 && r.wrong === 0, JSON.stringify(r));
  } catch (e) { ok('S7 page', false, String(e && e.stack || e).slice(0, 300)); } finally { await br.close(); srv.close(); }
  console.log('§W-L30 ' + (fails ? 'FAIL ' + fails : 'PASS')); process.exit(fails ? 1 : 0);
})();
