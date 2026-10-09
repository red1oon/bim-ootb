// Usage: node run_stack.js   Layer-stack fold: CPU f32 (canonical) vs spec f64, Canvas2D, WebGL f32/f16; node vs chromium hashes.
const fs = require('fs'), path = require('path'), { chromium } = require('playwright-core');
const S = require('./stack.js'), O = require('./oracle.js');
const W = 128, SEEDS = [1, 2, 3], ARGS = process.argv.slice(2), GATE = !ARGS.includes('--no-gate');
const lim = { spec64: { max: 1, mean: 0.05 }, gl32: { max: 2, mean: 0.1 }, gl16: { max: 3, mean: 0.3 } };   // levels of 255
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: process.env.GPU ? ['--no-sandbox', '--ignore-gpu-blocklist', '--enable-gpu'] : ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setContent('<body></body>');
  for (const f of ['stack.js', 'oracle.js', 'glstack.js']) await p.addScriptTag({ content: fs.readFileSync(path.join(__dirname, f), 'utf8') });
  const out = { canvas: W + 'x' + W, gl_renderer: await p.evaluate(() => GLStack.renderer()), scenes: [], per_mode: {} }, fails = [];
  const one = async (name, ops) => {
    const st = S.fold(ops, W), back = S.composite(st), c8 = S.toRGBA8(back), r = { name, ops: ops.length, f32_hash: S.hashF32(back).slice(0, 16) };
    const br = await p.evaluate(({ ops, W }) => { const st = Stack.fold(ops, W), back = Stack.composite(st);
      return { hash: Stack.hashF32(back).slice(0, 16), c2d: Array.from(Oracle.canvas2d(st)), gl32: Array.from(GLStack.run(ops, W, 32)), gl16: Array.from(GLStack.run(ops, W, 16)) }; }, { ops, W });
    r.node_eq_chromium = r.f32_hash === br.hash;
    r.vs_spec64 = S.diff(c8, O.spec64(st), true); r.vs_canvas2d = S.diff(c8, Uint8Array.from(br.c2d), true);
    r.vs_gl32 = S.diff(c8, Uint8Array.from(br.gl32), true); r.vs_gl16 = S.diff(c8, Uint8Array.from(br.gl16), true);
    if (!r.node_eq_chromium) fails.push(name + ': node!=chromium hash');
    for (const [k, v] of [['spec64', r.vs_spec64], ['gl32', r.vs_gl32], ['gl16', r.vs_gl16]]) if (v.max > lim[k].max || v.mean > lim[k].mean) fails.push(name + ': ' + k + ' ' + JSON.stringify(v));
    return r;
  };
  for (const s of SEEDS) out.scenes.push(await one('stack_seed' + s, S.makeScene(s, W)));
  for (const m of S.MODES.slice(1)) { const r = await one('mode_' + m, S.makeModeScene(m, 7, W)); out.per_mode[m] = { vs_spec64_max: r.vs_spec64.max, vs_canvas2d_max: r.vs_canvas2d.max, vs_canvas2d_mean: r.vs_canvas2d.mean, vs_gl32_max: r.vs_gl32.max, vs_gl16_max: r.vs_gl16.max, node_eq_chromium: r.node_eq_chromium }; }
  out.gate = GATE ? (fails.length ? 'FAIL' : 'PASS') : 'skipped'; out.fails = fails;
  console.log(JSON.stringify(out, null, 1)); await b.close(); if (GATE && fails.length) process.exit(1);
})();
