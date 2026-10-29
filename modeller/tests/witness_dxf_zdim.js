#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-ZDIM (prompts/DXF2BIM_FOUNDATION_LANE.md §D96). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: every elevation / section asked the person for a second height (the gate's "two heights"), although the drawing's own dimensions
// (measured by the CAD, not typed over, dimension scale factor 1) already prove the sheet is drawn at full size. §D96 PR-Z-DIM reads it. What could go wrong, one check each:
//   Z1 the read height builds a different shed: the CLI-marked shed with its five second @Z REMOVED, --accept-suggestions, gives 5 PR-Z-DIM, ok, and the SAME bodies as the full
//      marked set run the same way (guid, class; every body's bbox and z0 / z1 within 0.5 mm: the hand-typed y's rounding, §D96 measured 0.483 mm at most).
//   Z2 something else closes the gap: the stripped set with DXF_NO_ZDIM=1 is refused (no second height = blocked).
//   Z3 a reduced-scale sheet is trusted: one stripped elevation with $DIMLFAC 50 gets no PR-Z-DIM (refused, the factor named) and the run is refused.
//   Z4 a person's typed-over figure is used as a measure: the dimension handles named by the 5 rows are none of the typed-over ones of the raw sheets.
//   Z5 the raw shed: Accept all alone ends every elevation / section with 2 @Z (the second one PR-Z-DIM).
// Inputs: SHED_MARKED_DIR (default ~/Videos/dxf2bim_film_work/why/cli/marked), SHED_RAW_DIR (default .../why/raw); missing -> INCONCLUSIVE (exit 2).
// usage: node modeller/tests/witness_dxf_zdim.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..'), CLI = path.join(ROOT, 'modeller', 'dxf2bim_cli.js'), DP = require(path.join(ROOT, 'modeller', 'lib', 'dxf-parser.js'));
const MARKED = process.env.SHED_MARKED_DIR || path.join(os.homedir(), 'Videos', 'dxf2bim_film_work', 'why', 'cli', 'marked');
const RAW = process.env.SHED_RAW_DIR || path.join(os.homedir(), 'Videos', 'dxf2bim_film_work', 'why', 'raw');
let fails = 0, judged = 0; const ok = (id, c, m) => { judged++; console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
const dxfs = d => fs.existsSync(d) ? fs.readdirSync(d).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(d, f)) : [];
// pair-wise entity split (a coordinate value "0" never splits an entity)
const ents = t => { const L = t.split(/\r?\n/), E = [[]]; for (let i = 0; i + 1 < L.length; i += 2) { if (L[i].trim() === '0') E.push([]); E[E.length - 1].push(L[i], L[i + 1]); } return E; };
const strip = (src, dst) => { fs.mkdirSync(dst, { recursive: true }); let n = 0; dxfs(src).forEach(f => { const keep = ents(fs.readFileSync(f, 'utf8')).filter(e => { let lay = null, txt = null;
  for (let i = 0; i < e.length; i += 2) { if (e[i].trim() === '8') lay = e[i + 1]; if (e[i].trim() === '1') txt = e[i + 1]; }
  const m = /^@Z=(\S+)/.exec(txt || ''), drop = lay === 'DXF2BIM-MARK' && m && Number(m[1]) !== 0; if (drop) n++; return !drop; });
  fs.writeFileSync(path.join(dst, path.basename(f)), keep.flat().join('\n') + '\n'); }); return n; };
const run = (files, out, env) => { const r = cp.spawnSync('node', [CLI, '--sheets', ...files, '--out', out, '--accept-suggestions'], { encoding: 'utf8', env: Object.assign({}, process.env, env || {}), maxBuffer: 1 << 28 });
  const log = (r.stdout || '') + (r.stderr || ''), res = /§CLI result ok=(\w+) bodies=(\d+)/.exec(log);
  const bodies = fs.existsSync(path.join(out, 'bodies.json')) ? JSON.parse(fs.readFileSync(path.join(out, 'bodies.json'), 'utf8')) : [];
  return { log, ok: res ? res[1] === 'true' : false, n: res ? Number(res[2]) : 0, bodies, zdim: log.split('\n').filter(l => /§CLI mark .*\(PR-Z-DIM\)/.test(l)) }; };
(async () => {
  const marked = dxfs(MARKED), raw = dxfs(RAW);
  if (marked.length !== 9 || raw.length !== 9) { console.log('§VERDICT INCONCLUSIVE missing input: marked ' + marked.length + ' (' + MARKED + '), raw ' + raw.length + ' (' + RAW + '), need 9 + 9'); process.exit(2); }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zdim-'));
  try {
    const A = run(marked, path.join(tmp, 'A'));
    const nStrip = strip(MARKED, path.join(tmp, 'strip')), SF = dxfs(path.join(tmp, 'strip'));
    const B = run(SF, path.join(tmp, 'B'));
    console.log('§ZDIM control ok=' + A.ok + ' bodies=' + A.n + ' | stripped ' + nStrip + ' second @Z -> ok=' + B.ok + ' bodies=' + B.n + ' rows=' + B.zdim.length);
    B.zdim.forEach(l => console.log('  ' + l.trim().slice(0, 160)));
    // Z1
    const byG = {}; A.bodies.forEach(b => { byG[b.guid] = b; }); let worst = 0, missing = [], cls = [];
    B.bodies.forEach(b => { const a = byG[b.guid]; if (!a) { missing.push(b.guid); return; } if (a.class !== b.class) cls.push(b.guid);
      const d = [Math.abs(a.z0 - b.z0), Math.abs(a.z1 - b.z1)].concat((a.bbox || []).map((v, i) => Math.abs(v - (b.bbox || [])[i]))); worst = Math.max(worst, ...d.filter(isFinite)); });
    ok('Z1 stripped + PR-Z-DIM builds the same shed as the typed heights (guid, class, bbox and z within 0.5 mm)', nStrip === 5 && B.zdim.length === 5 && A.ok && B.ok && A.n === B.n && !missing.length && !cls.length && worst <= 0.0005,
      'rows=' + B.zdim.length + ' bodies ' + B.n + '/' + A.n + ' missing=' + missing.length + ' class_diff=' + cls.length + ' worst=' + (worst * 1000).toFixed(3) + ' mm');
    // Z2
    const C = run(SF, path.join(tmp, 'C'), { DXF_NO_ZDIM: '1' });
    ok('Z2 without the rule the stripped set is refused (the rule is what closes the second height)', !C.ok && C.zdim.length === 0, 'ok=' + C.ok + ' bodies=' + C.n);
    // Z3
    const D = path.join(tmp, 'scaled'); fs.mkdirSync(D); SF.forEach(f => fs.copyFileSync(f, path.join(D, path.basename(f))));
    const wf = path.join(D, '2_ELEV_WEST_marked.dxf'); let t = fs.readFileSync(wf, 'utf8'); const had = /\n\$DIMLFAC\r?\n\s*40\r?\n[^\n]*/.test(t);
    t = had ? t.replace(/\n\$DIMLFAC\r?\n(\s*40\r?\n)[^\n]*/, (m, g) => '\n$DIMLFAC\n' + g + '50.0') : t.replace(/\n\$INSUNITS\r?\n/, () => '\n$DIMLFAC\n40\n50.0\n  9\n$INSUNITS\n'); fs.writeFileSync(wf, t);
    const hdr = new DP().parseSync(t).header.$DIMLFAC, E = run(dxfs(D), path.join(tmp, 'E'));
    ok('Z3 falsifier: an elevation whose dimension scale factor is 50 gets no PR-Z-DIM and the run is refused', hdr === 50 && !E.zdim.some(l => /2_ELEV_WEST/.test(l)) && E.zdim.length === 4 && !E.ok, '$DIMLFAC read=' + hdr + ' rows=' + E.zdim.length + ' ok=' + E.ok);
    // Z4
    // each row's y (the CLI mark line: "@Z=<z> at 0,<y>") must be the top of a self-measured vertical dimension of that sheet and of no typed-over one
    const Z4 = B.zdim.map(l => { const m = /sheet=(\S+) @Z=\S+ at [-0-9.]+,([-0-9.]+)/.exec(l), f = raw.find(r => m && path.basename(r) === m[1].replace('_marked', '')), y = m ? Number(m[2]) : NaN;
      const ds = f ? new DP().parseSync(fs.readFileSync(f, 'utf8')).entities.filter(e => e.type === 'DIMENSION' && e.linearOrAngularPoint1 && e.linearOrAngularPoint2) : [];
      const top = e => Math.max(e.linearOrAngularPoint1.y, e.linearOrAngularPoint2.y), isTyped = e => e.text !== undefined && String(e.text).trim() !== '' && String(e.text).trim() !== '<>';
      const self = ds.filter(e => !isTyped(e) && Math.abs(e.actualMeasurement - Math.abs(e.linearOrAngularPoint1.y - e.linearOrAngularPoint2.y)) <= 1e-6 * Math.max(1, e.actualMeasurement));
      const hit = self.filter(e => Math.abs(top(e) - y) < 1e-3).map(e => e.handle), bad = ds.filter(e => isTyped(e) && Math.abs(top(e) - y) < 1e-3).map(e => e.handle);
      return { s: m ? m[1].replace(/_marked\.dxf$/, '') : '?', hit, bad }; });
    ok('Z4 each read height sits on a self-measured dimension, never on a typed-over one', Z4.length === 5 && Z4.every(q => q.hit.length && !q.bad.length), Z4.map(q => q.s + ' on ' + (q.hit.join('/') || 'NONE') + (q.bad.length ? ' TYPED ' + q.bad.join('/') : '')).join(' | '));
    // Z5
    const F = run(raw, path.join(tmp, 'F'));
    const zOf = sh => { const p = path.join(tmp, 'F', 'marked', path.basename(sh).replace(/\.dxf$/i, '_marked.dxf')); if (!fs.existsSync(p)) return -1; return ents(fs.readFileSync(p, 'utf8')).filter(e => { let lay = null, txt = null; for (let i = 0; i < e.length; i += 2) { if (e[i].trim() === '8') lay = e[i + 1]; if (e[i].trim() === '1') txt = e[i + 1]; } return lay === 'DXF2BIM-MARK' && /^@Z=/.test(txt || ''); }).length; };
    const ev = raw.filter(f => /ELEV|SECTION/.test(f)), zc = ev.map(f => path.basename(f).replace(/\.dxf$/, '') + ':' + zOf(f));
    ok('Z5 raw shed, Accept all alone: every elevation / section ends with 2 @Z (the second from PR-Z-DIM)', ev.length === 5 && ev.every(f => zOf(f) === 2) && F.zdim.length === 5, zc.join(' ') + ' rows=' + F.zdim.length);
  } catch (e) { console.log('§FAIL crash ' + String(e && e.stack || e).slice(0, 400)); fails++; }
  console.log('§VERDICT ' + (judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS') + ' W-ZDIM judged=' + judged + ' fail=' + fails);
  process.exit(fails ? 1 : 0);
})();
