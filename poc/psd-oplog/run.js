// Usage: node run.js   -> compares canonical CPU fold (f64, f32, node + chromium) with a WebGL fold (RGBA16F / RGBA32F)
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const Fold = require('./fold.js');
const W = 256, SIZES = [100, 1000, 3000], SEED = 42;
(async () => {
  const out = { canvas: W + 'x' + W, results: [] };
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setContent('<body></body>');
  await p.addScriptTag({ content: fs.readFileSync(path.join(__dirname, 'fold.js'), 'utf8') });
  await p.addScriptTag({ content: fs.readFileSync(path.join(__dirname, 'glfold.js'), 'utf8') });
  out.gl_renderer = await p.evaluate(() => GLFold.renderer());
  for (const n of SIZES) {
    const ops = Fold.makeOps(n, W, SEED);
    const t = Date.now();
    const f64 = Fold.foldCPU(ops, W, false), f32 = Fold.foldCPU(ops, W, true);
    const cpu_ms = Date.now() - t;
    const br = await p.evaluate(({ ops, W }) => {
      const f32 = Fold.foldCPU(ops, W, true);
      return { cpu32_hash_in_chromium: Fold.fnv(f32), gl16: Array.from(GLFold.fold(ops, W, 16)), gl32: Array.from(GLFold.fold(ops, W, 32)) };
    }, { ops, W });
    out.results.push({
      ops: n, cpu_ms_both_precisions: cpu_ms,
      node_f32_hash: Fold.fnv(f32), chromium_f32_hash: br.cpu32_hash_in_chromium,
      f32_cross_engine_identical: Fold.fnv(f32) === br.cpu32_hash_in_chromium,
      'cpu_f32_vs_f64': Fold.diff(f32, f64),
      'gl_rgba16f_vs_cpu_f32': Fold.diff(Uint8Array.from(br.gl16), f32),
      'gl_rgba32f_vs_cpu_f32': Fold.diff(Uint8Array.from(br.gl32), f32),
    });
  }
  console.log(JSON.stringify(out, null, 1)); await b.close();
})();
