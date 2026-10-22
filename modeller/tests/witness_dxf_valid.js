#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DXF-VALID (rule D32, prompts/DXF2BIM_FOUNDATION_LANE.md §F8). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: our marked sheets gave the markings handles above $HANDSEED (writeMarks), so an independent DXF reader (ezdxf) reported every marking
 * as a non-unique handle; other CAD programs may refuse or rewrite such a file.
 *   V1 HANDLES — on every writer sheet and every marked sheet: no entity handle repeats and $HANDSEED is larger than every handle (counted here, in JS).
 *   V2 EZDXF   — the independent reader (ezdxf, version printed) reports no non-unique handle; its other audit fixes are printed per sheet (the table-handle fixes are a known, stated item).
 * Usage: NODE_PATH=<dir with better-sqlite3> node modeller/tests/witness_dxf_valid.js <Node model .db>
 */
'use strict';
const path = require('path'), crypto = require('crypto'), fs = require('fs'), os = require('os'), { spawnSync } = require('child_process');
const M = path.join(__dirname, '..'), D = path.join(M, 'dxf2bim') + '/';
const S = require(D + 'std2d.js'), Mk = require(D + 'std2d_marks.js'), MK = require(D + 'dxf2marks.js'), B = require(D + 'dxf2bim.js'), SHC = require(D + 'dxf2shell_config.js'), DxfParser = require(path.join(M, 'lib/dxf-parser.js'));
const Database = require(path.join(process.env.HOME, 'bim-compiler/node_modules/better-sqlite3'));
const hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const con = new Database(process.argv[2], { readonly: true }), q = s => con.prepare(s).all();
const R = S.writeStdSet(q, 'X', {}), Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC }, { set: 'X' });
const handles = txt => { const L = txt.split(/\r?\n/), hs = [], seed = { v: null }; let inHdr = false;
  for (let i = 0; i + 1 < L.length; i += 2) { const c = L[i].trim(), v = L[i + 1].trim();
    if (c === '9' && v === '$HANDSEED') { seed.v = parseInt(L[i + 3].trim(), 16); i += 2; continue; }
    if (c === '5' || c === '105') hs.push(parseInt(v, 16)); }
  return { hs, seed: seed.v }; };
let bad = [];
[['writer', R.files], ['marked', Dm.files]].forEach(([kind, files]) => Object.keys(files).forEach(n => { const { hs, seed } = handles(files[n]), dup = hs.length - new Set(hs).size, mx = Math.max(...hs);
  if (dup || !(seed > mx)) bad.push(kind + ':' + n + ' dup=' + dup + ' seed=' + (seed === null ? '-' : seed.toString(16)) + ' max=' + mx.toString(16)); }));
check('V1', 'no handle repeats and $HANDSEED exceeds every handle, on writer and marked sheets', bad.length === 0, `sheets=${Object.keys(R.files).length * 2} bad=${bad.length} ${bad.slice(0, 2).join(' | ')}`);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dxfvalid-')); Object.keys(Dm.files).forEach(n => fs.writeFileSync(path.join(dir, n), Dm.files[n]));
const py = `import sys,glob,os,logging\ntry:\n import ezdxf\n from ezdxf import recover\nexcept Exception as e:\n print('NOEZDXF'); sys.exit(0)\nclass H(logging.Handler):\n def __init__(s): logging.Handler.__init__(s); s.n=0\n def emit(s,r):\n  if 'non-unique' in r.getMessage(): s.n+=1\nh=H(); lg=logging.getLogger('ezdxf'); lg.addHandler(h); lg.propagate=False\nprint('VERSION', ezdxf.__version__)\nfor f in sorted(glob.glob(os.path.join(sys.argv[1],'*.dxf'))):\n h.n=0\n doc,a=recover.readfile(f)\n print('SHEET', os.path.basename(f), h.n, len(a.errors), len(a.fixes))\n`;   // ezdxf reports non-unique handles through its logger
const r = spawnSync('python3', ['-c', py, dir], { encoding: 'utf8' }), out = (r.stdout || '').split('\n');
if (out.includes('NOEZDXF') || r.status !== 0) say('ENV V2 | ezdxf not available: ' + (r.stderr || '').slice(0, 120));
else { const ver = (out.find(l => /^VERSION /.test(l)) || '').slice(8), rows = out.filter(l => /^SHEET /.test(l)).map(l => l.split(' ')), nonU = rows.reduce((a, x) => a + +x[2], 0), errs = rows.reduce((a, x) => a + +x[3], 0), fixes = rows.map(x => x[4]);
  check('V2', `the independent reader (ezdxf ${ver}) reports no non-unique handle and no audit error on the marked sheets (its fixes per sheet are printed)`, rows.length > 0 && nonU === 0 && errs === 0, `sheets=${rows.length} non_unique=${nonU} errors=${errs} fixes_per_sheet=${fixes.join(',')}`); }
fs.rmSync(dir, { recursive: true, force: true });
say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
