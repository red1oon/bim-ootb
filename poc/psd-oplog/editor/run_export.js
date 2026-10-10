// Usage: node editor/run_export.js   PSD export of an editor log: X1-X4 (pre-registered in witness_log/HYPOTHESES.md before this file existed). Needs the venv python with psd-tools (PYTHON env); Krita AppImage optional (KRITA env).
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process'), S = require('../stack.js'), { exportLog } = require('./export_psd.js');
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true }); const rec = [], fails = [], num = {}, skipped = [];
const chk = (id, name, value, cmp, limit) => { const pass = cmp === '<=' ? value <= limit : cmp === '>=' ? value >= limit : value === limit; rec.push({ id, name, value, cmp, limit, pass }); if (!pass) fails.push({ id, name, value, cmp, limit }); };
const r2 = (x) => Math.round(x * 100) / 100;
// a scripted painting like the editor session, scaled to the canvas width
function session(W) { const k = W / 1024, P = (pts) => pts.map(([x, y]) => [r2(x * k), r2(y * k)]), ops = [{ op: 'layer', id: 0, mode: 'normal', opacity: 1, mask: false }, { op: 'fill', layer: 0, c: [1, 1, 1], a: 1 }, { op: 'layer', id: 1, mode: 'normal', opacity: 1, mask: false }];
  ops.push({ op: 'stroke', layer: 1, kind: 'hard', pts: P([[150, 200], [300, 350], [450, 250], [600, 400]]), r: 14 * k, c: [0.1, 0.2, 0.6], a: 1 }, { op: 'stroke', layer: 1, kind: 'soft', pts: P([[200, 600], [500, 700], [800, 550]]), r: 40 * k, c: [0.1, 0.2, 0.6], a: 1 },
    { op: 'smudge', layer: 1, pts: P([[180, 200], [350, 300], [500, 450], [620, 500]]), r: 14 * k, s: 0.7 }, { op: 'blur', layer: 1, sigma: 4, rect: [Math.floor(W / 2) - 64 * k, Math.floor(0.65 * W) - 64 * k, 128 * k, 128 * k].map((v) => Math.max(0, Math.floor(v))) },
    { op: 'layer', id: 2, mode: 'multiply', opacity: 0.8, mask: false }, { op: 'stroke', layer: 2, kind: 'hard', pts: P([[700, 150], [850, 300], [750, 450]]), r: 24 * k, c: [0.8, 0.2, 0.13], a: 1 }, { op: 'stroke', layer: 2, kind: 'erase', pts: P([[780, 200], [800, 400]]), r: 20 * k, c: [0, 0, 0], a: 1 },
    { op: 'layer', id: 3, mode: 'screen', opacity: 0.6, mask: false }, { op: 'stroke', layer: 3, kind: 'soft', pts: P([[300, 850], [600, 900]]), r: 30 * k, c: [0.9, 0.7, 0.2], a: 0.9 });
  return { format: 'psd-oplog-editor', v: 1, W, ops }; }
const PY = process.env.PYTHON || 'python3', KRITA = process.env.KRITA || path.join(process.env.HOME, '.local/opt/krita/krita-5.2.16-x86_64.AppImage');
(async () => {
  const W = 1024, log = session(W), r1 = await exportLog(log), r2b = await exportLog(log), psd = path.join(OUT, 'session1024.psd'); fs.writeFileSync(psd, r1.bytes);
  chk('X3', `exporting the same log twice gives byte-identical files (${r1.bytes.length} bytes)`, Buffer.compare(Buffer.from(r1.bytes), Buffer.from(r2b.bytes)) === 0, '==', true);
  const meta = { W, layers: r1.layers.map((l, i) => { const f = path.join(OUT, `layer${i}.rgba`); fs.writeFileSync(f, l.rgba); return { mode: l.mode, opacity: l.opacity, rgba: f }; }), display: path.join(OUT, 'display.rgba') }; fs.writeFileSync(meta.display, r1.display); fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta));
  const py = spawnSync(PY, ['-I', path.join(__dirname, 'check_psd_editor.py'), psd, path.join(OUT, 'meta.json')], { encoding: 'utf8' }); if (py.status !== 0) { console.error(py.stderr); process.exit(2); }
  const R = JSON.parse(py.stdout.trim().split('\n').pop()), want = r1.layers.map((l) => l.mode.replace('-', '_')), wantOp = r1.layers.map((l) => Math.round(l.opacity * 255 + 1e-4)); num.psdtools = R;
  chk('X1', `psd-tools reads ${R.layers} layers (editor ${r1.layers.length}), modes ${R.modes.join(',')}, opacity bytes ${R.opacity.join(',')}, profile resource ${R.profile_resource}`, R.layers === r1.layers.length && JSON.stringify(R.modes.map((m) => m.replace('soft_light', 'soft_light'))) === JSON.stringify(want) && JSON.stringify(R.opacity) === JSON.stringify(wantOp) && R.profile_resource, '==', true);
  chk('X2', `layer pixels vs the editor (quantised): max diff ${Math.max(...R.layer_max_diff)} levels`, Math.max(...R.layer_max_diff), '<=', 1);
  chk('X2', `PSD merged preview vs the editor display: max ${R.merged_max_diff} levels, mean ${R.merged_mean_diff.toFixed(3)}`, R.merged_max_diff <= 3 && R.merged_mean_diff <= 0.3, '==', true);
  // X4 Krita (small canvas: headless Krita is slow on big files)
  const kW = 256, kLog = session(kW), kr = await exportLog(kLog), kpsd = path.join(OUT, 'session256.psd'), kra = path.join(OUT, 'session256.kra'); fs.writeFileSync(kpsd, kr.bytes);
  if (!fs.existsSync(KRITA)) { skipped.push('X4: Krita AppImage not found at ' + KRITA); } else {
    const t0 = Date.now(), kr2 = spawnSync(KRITA, ['--appimage-extract-and-run', '--export', '--export-filename', kra, kpsd], { env: { ...process.env, QT_QPA_PLATFORM: 'offscreen' }, timeout: 580000, encoding: 'utf8' }); num.krita_seconds = (Date.now() - t0) / 1000;
    if (!fs.existsSync(kra)) skipped.push('X4: Krita did not write the .kra (status ' + kr2.status + ', ' + num.krita_seconds + ' s)'); else {
      const x = spawnSync('python3', ['-I', '-c', `import zipfile,sys,re,json;z=zipfile.ZipFile(sys.argv[1]);x=z.read('maindoc.xml').decode();L=re.findall(r'<layer [^>]*>',x);print(json.dumps([[re.search(r'compositeop="([^"]*)"',l).group(1),int(re.search(r'opacity="([^"]*)"',l).group(1))] for l in L][::-1]))`, kra], { encoding: 'utf8' }); const K = JSON.parse(x.stdout.trim()), kmode = { multiply: 'multiply', screen: 'screen', normal: 'normal', soft_light: 'soft-light' };
      num.krita = K; const ok = K.length === kr.layers.length && K.every(([m, o], i) => m === kr.layers[i].mode.replace('-', '_') && Math.abs(o - Math.round(kr.layers[i].opacity * 255)) <= 1);
      chk('X4', `Krita reads the exported 256 px PSD with ${K.length} layers: ${K.map(([m, o]) => m + '/' + o).join(' ')} (${num.krita_seconds.toFixed(0)} s)`, ok, '==', true); } }
  const out = { n_checks: rec.length, gate: fails.length ? 'FAIL' : 'PASS', fails, skipped, numbers: num, checks: rec, node: process.version };
  fs.writeFileSync(path.join(OUT, 'export.json'), JSON.stringify(out, null, 1)); console.log(JSON.stringify({ ...out, checks: undefined }, null, 1)); process.exit(fails.length ? 1 : 0);
})();
