#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-UAT-SHED-SOURCE (bim-ootb prompts/CAPEX_DASHBOARD.md §5.85). READ THE LOG: the §UATSRC lines carry the evidence, the exit code does not.
// THE ISSUE IT PROVES OR DISPROVES: "the UAT guide's statements about the testers' drawings are not what the files and the Modeller's reader say":
//   S1 the Shed is drawn SHORTENED: every dimension that measures 1,560 in carries the text 410'-0" (n >= 5 sheets); the 600 in width has no override.
//   S2 the floor plan's grid labels are 01-06 and 35-42 (14 lines), i.e. grids 07-34 are not drawn.
//   F1 ASCII DXF 2000 / 2004 / 2007 / 2010 / 2013 / 2018 each give the original sheets' body count and body hash (the §5.84 fact line).
//   F2 DXF R12 and Binary DXF are refused (0 bodies, or the parser stops).
//   F3 the whole drawing as ONE file gives 0 bodies (one DXF per sheet is required).
//   UAT_SRC_BREAK=1 removes $INSUNITS from the 2018 set: F1 must FAIL.
// The version files are ezdxf-written stand-ins (python3 + ezdxf), not BricsCAD's own output. Private set: SHED_DIR = the Shed folder (sheets/, sheets_v2/, source/); SKIP without.
// Usage: SHED_DIR=<dir> NODE_PATH=~/bim-compiler/node_modules node capex/tests/witness_uat_shed_source.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), crypto = require('crypto');
const MOD = path.join(__dirname, '..', '..', 'modeller'), DIR = process.env.SHED_DIR || '', BREAK = process.env.UAT_SRC_BREAK === '1';
const NAMES = ['0_FLOOR_PLAN', '3_BEAM_LAYOUT', '4_FOUNDATION_LAYOUT', '1N_ELEV_NORTH', '1S_ELEV_SOUTH', '2_ELEV_WEST', '7_ELEV_EAST', '8_SECTION_AA_TRUSS', '5_DETAILS'];
const FACTS = ['--complete', '--accept-suggestions', '--set', 'SHED', '--level', '0',   // the §5.84 line (BIMCompiler scripts/guide/uat_shed_shots.js:17-19)
  '--datum', '1S_ELEV:0.6096@-4446.6', '--datum', '1N_ELEV:0.6096@-3895.2', '--datum', '2_ELEV:0.6096@-4515.7264', '--datum', '7_ELEV:0.6096@-3766.442', '--datum', '8_SECTION:0.6096@-3726.416',
  '--layer', 'plan:Col=column', '--layer', 'elev:0=column@1S_ELEV', '--layer', 'plan:Fo=footing', '--layer', 'plan:Dim=beam@3_BEAM', '--layer', 'elev:Wall=panel', '--layer', 'elev:Rod=fan', '--layer', 'elev:Dim=net', '--layer', 'plan:Rod=doorswing@0_FLOOR', '--layer', 'section:Fo=bar', '--layer', 'elev:Win=elevdoor',
  '--bodyz', 'footing=-1.4478,-1.143', '--exclude', '3_BEAM:-20880,-5600,-20845,-4950', '--bodyz', 'beam=3.098794,3.352794'];
const VERS = { R2000: 'AC1015', R2004: 'AC1018', R2007: 'AC1021', R2010: 'AC1024', R2013: 'AC1027', R2018: 'AC1032' };
let judged = 0, fails = 0; const say = s => console.log(s), ck = (id, c, i) => { judged++; if (!c) fails++; say('§UATSRC ' + id + ' ' + (c ? 'PASS' : 'FAIL') + ' ' + JSON.stringify(i).slice(0, 500)); };
const PY = String.raw`
import sys, os, json, ezdxf
from ezdxf.addons import r12export
mode = sys.argv[1]
if mode == 'dims':
    out = {'length': [], 'width': []}
    for f in sorted(os.listdir(sys.argv[2])):
        if not f.endswith('.dxf'): continue
        for d in ezdxf.readfile(os.path.join(sys.argv[2], f)).modelspace().query('DIMENSION'):
            try: m = d.get_measurement()
            except Exception: continue
            if not isinstance(m, (int, float)): continue
            t = d.dxf.get('text', '')
            if abs(m - 1560) < 0.5: out['length'].append([f, t])
            if abs(m - 600) < 0.5: out['width'].append([f, t])
    print(json.dumps(out))
else:
    src, dst, names, brk = sys.argv[2], sys.argv[3], sys.argv[4].split(','), sys.argv[5] == '1'
    VERS = json.loads(sys.argv[6])
    for v in list(VERS) + ['R12', 'BIN']:
        d = os.path.join(dst, v); os.makedirs(d, exist_ok=True)
        for n in names:
            doc = ezdxf.readfile(os.path.join(src, n + '.dxf')); p = os.path.join(d, n + '.dxf')
            if v == 'R12': r12export.saveas(doc, p)
            elif v == 'BIN': doc.saveas(p, fmt='bin')
            else:
                doc.dxfversion = VERS[v]
                if brk and v == 'R2018' and '$INSUNITS' in doc.header: del doc.header['$INSUNITS']
                doc.saveas(p)
    print('written')
`;
const bodyHash = dir => { const b = JSON.parse(fs.readFileSync(path.join(dir, 'bodies.json'), 'utf8')), drop = ['guid', 'id', 'provenance', 'src', 'handle', 'handles'];
  const k = b.map(o => JSON.stringify(Object.keys(o).filter(x => !drop.includes(x)).sort().reduce((a, x) => (a[x] = o[x], a), {}))).sort(); return { n: b.length, h: crypto.createHash('sha1').update(k.join('')).digest('hex').slice(0, 12) }; };
const cli = (files, out, extra) => { const r = cp.spawnSync('node', [path.join(MOD, 'dxf2bim_cli.js'), '--sheets'].concat(files, ['--out', out], extra), { encoding: 'utf8', maxBuffer: 64 << 20 });
  const m = (r.stdout || '').match(/§CLI result ok=(\w+) bodies=(\d+)/), err = ((r.stdout || '') + (r.stderr || '')).match(/§CLI ERROR[^\n]*|Error:[^\n]*/);
  return { rc: r.status, ok: m ? m[1] === 'true' : false, bodies: m ? Number(m[2]) : 0, err: err ? err[0].slice(0, 160) : null, stdout: r.stdout || '', hash: m && fs.existsSync(path.join(out, 'bodies.json')) && Number(m[2]) > 0 ? bodyHash(out) : null }; };
(async () => {
  const V2 = path.join(DIR, 'sheets_v2'), SRC = path.join(DIR, 'source', 'Shed Drawing.dxf');
  if (!DIR || !NAMES.every(n => fs.existsSync(path.join(V2, n + '.dxf'))) || !fs.existsSync(SRC)) { say('§UATSRC SKIP no private Shed set at SHED_DIR=' + DIR); process.exit(0); }
  const py = cp.spawnSync('python3', ['-c', 'import ezdxf; print(ezdxf.__version__)'], { encoding: 'utf8' }); if (py.status !== 0) { say('§UATSRC SKIP python3 + ezdxf not available'); process.exit(0); }
  say('§UATSRC ezdxf ' + py.stdout.trim() + (BREAK ? ' (BREAK: $INSUNITS removed from the 2018 set)' : ''));
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'uatsrc-')), pyf = path.join(TMP, 'w.py'); fs.writeFileSync(pyf, PY);
  // S1 the length is drawn 1,560 in and labelled 410'-0"; the width 600 in is not overridden
  const dims = JSON.parse(cp.spawnSync('python3', [pyf, 'dims', V2], { encoding: 'utf8' }).stdout);
  const lenSheets = [...new Set(dims.length.map(x => x[0]))], lenText = [...new Set(dims.length.map(x => x[1]))], widText = [...new Set(dims.width.map(x => x[1]))];
  say('§UATSRC length dims (1560 in): ' + JSON.stringify(dims.length) + ' | width dims (600 in) texts: ' + JSON.stringify(widText));
  ck('S1 drawn 1,560 in labelled 410\'-0" on >= 5 sheets; the 600 in width carries no override', lenSheets.length >= 5 && lenText.length === 1 && lenText[0] === '410\'-0"' && dims.width.length > 0 && widText.every(t => t === '' || t === '<>' || !/\d/.test(t.replace(/\\A1;/, '').replace(/Beam-2\s*/, ''))), { sheets: lenSheets, text: lenText, widthTexts: widText });
  // baseline: the original sheets (sheets_v2) with the fact line
  const base = cli(NAMES.map(n => path.join(V2, n + '.dxf')), path.join(TMP, 'base'), FACTS); say('§UATSRC baseline sheets_v2: ok=' + base.ok + ' bodies=' + base.bodies + ' hash=' + (base.hash && base.hash.h));
  const grids = [...base.stdout.matchAll(/sheet=0_FLOOR_PLAN\.dxf @GRIDX=(\S+)/g)].map(m => m[1]);
  ck('S2 floor-plan grid labels are 01-06 and 35-42 (14), grids 07-34 not drawn', JSON.stringify(grids) === JSON.stringify(['01', '02', '03', '04', '05', '06', '35', '36', '37', '38', '39', '40', '41', '42']), { grids });
  // F1-F2 each version
  const w = cp.spawnSync('python3', [pyf, 'write', V2, TMP, NAMES.join(','), BREAK ? '1' : '0', JSON.stringify(VERS)], { encoding: 'utf8' }); if (w.status !== 0) { say('§UATSRC STOPPED version writer: ' + (w.stderr || '').slice(-300)); process.exit(1); }
  const res = {}; for (const v of Object.keys(VERS).concat(['R12', 'BIN'])) { res[v] = cli(NAMES.map(n => path.join(TMP, v, n + '.dxf')), path.join(TMP, 'out_' + v), FACTS); say('§UATSRC ' + v + ': rc=' + res[v].rc + ' ok=' + res[v].ok + ' bodies=' + res[v].bodies + ' hash=' + (res[v].hash && res[v].hash.h) + (res[v].err ? ' err=' + res[v].err : '')); }
  const same = Object.keys(VERS).filter(v => res[v].ok && res[v].hash && base.hash && res[v].hash.n === base.hash.n && res[v].hash.h === base.hash.h);
  ck('F1 ASCII 2000..2018 each give the original body count and hash', base.ok && base.bodies > 0 && same.length === Object.keys(VERS).length, { base: base.hash, same, differ: Object.keys(VERS).filter(v => !same.includes(v)) });
  ck('F2 R12 and Binary are refused', !res.R12.ok && res.R12.bodies === 0 && !res.BIN.ok && res.BIN.bodies === 0, { R12: { rc: res.R12.rc, bodies: res.R12.bodies }, BIN: { rc: res.BIN.rc, err: res.BIN.err } });
  // F3 the whole drawing as one file
  const whole = cli([SRC], path.join(TMP, 'whole'), ['--accept-suggestions', '--set', 'SHED']); say('§UATSRC whole drawing as one file: rc=' + whole.rc + ' ok=' + whole.ok + ' bodies=' + whole.bodies);
  ck('F3 the whole drawing as one DXF gives 0 bodies', !whole.ok && whole.bodies === 0, { rc: whole.rc, bodies: whole.bodies });
  const v = fails ? 'FAIL' : judged ? 'PASS' : 'INCONCLUSIVE'; say('§UATSRC_VERDICT ' + v + ' judged=' + judged + ' fails=' + fails + (BREAK ? ' (BREAK: F1 must FAIL)' : '')); process.exit(fails ? 1 : 0);
})().catch(e => { say('§UATSRC STOPPED ' + (e.stack || e).toString().slice(0, 400)); process.exit(1); });
