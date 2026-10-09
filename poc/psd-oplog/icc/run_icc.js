// Usage: node icc/run_icc.js [--update]    (run `sh icc/fetch_profiles.sh` once first)
// 1) ICC checks in Node (lcms-wasm)  2) same checks in Chromium, hashes must match  3) golden hashes
// 4) native LittleCMS (Pillow) vs lcms-wasm via check_native.py
const fs = require('fs'), path = require('path'), http = require('http'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), GOLD = path.join(__dirname, 'golden_icc.json'), EMIT = path.join(__dirname, '.emit'), update = process.argv.includes('--update');
const IccCore = require('./icc_core.js'), ColorFold = require('./color_fold.js'), { sha256 } = require('../stack.js');
(async () => {
  const cmyk = new Uint8Array(fs.readFileSync(path.join(__dirname, 'profiles/default_cmyk.icc')));
  const L = await import('lcms-wasm'), lcms = await L.instantiate();
  const node = IccCore.run(L, lcms, cmyk, 2_000_000); const cfn = ColorFold.run(L, lcms, cmyk, node.p3Bytes, sha256); const fails = [...node.fails, ...cfn.fails]; Object.assign(node.hashes, cfn.hashes); node.checks.color_fold = cfn.checks;
  // ---- native comparison data
  fs.mkdirSync(EMIT, { recursive: true }); fs.writeFileSync(path.join(EMIT, 'p3.icc'), node.p3Bytes);
  const open = (b) => lcms.cmsOpenProfileFromMem(b, b.length), sRGB = lcms.cmsCreate_sRGBProfile(), P3 = open(node.p3Bytes), CMYK = open(cmyk), RC = L.INTENT_RELATIVE_COLORIMETRIC, PE = L.INTENT_PERCEPTUAL, BPC = L.cmsFLAGS_BLACKPOINTCOMPENSATION;
  const rgb = IccCore.grid8(), nrgb = rgb.length / 3, g = [0, 64, 128, 192, 255], cm = []; for (const c of g) for (const m of g) for (const y of g) for (const k of g) cm.push(c, m, y, k);
  const cmykIn = Uint8Array.from(cm), ncm = cmykIn.length / 4, cases = [];
  const add = (name, a, fa, b, fb, intent, flags, inp, n) => { const t = lcms.cmsCreateTransform(a, fa, b, fb, intent, flags); const o = lcms.cmsDoTransform(t, inp, n); lcms.cmsDeleteTransform(t); fs.writeFileSync(path.join(EMIT, name + '.in'), inp); fs.writeFileSync(path.join(EMIT, name + '.wasm'), o); cases.push({ name, n, intent: intent === RC ? 'relcol' : 'perceptual', bpc: !!(flags & BPC), nooptimize: !!(flags & L.cmsFLAGS_NOOPTIMIZE), from: fa === L.TYPE_CMYK_8 ? 'cmyk' : 'srgb', to: fb === L.TYPE_CMYK_8 ? 'cmyk' : (b === P3 ? 'p3' : 'srgb') }); };
  add('srgb_to_p3', sRGB, L.TYPE_RGB_8, P3, L.TYPE_RGB_8, RC, 0, rgb, nrgb);
  add('srgb_to_p3_nooptimize', sRGB, L.TYPE_RGB_8, P3, L.TYPE_RGB_8, RC, L.cmsFLAGS_NOOPTIMIZE, rgb, nrgb);
  add('srgb_to_cmyk_relcol_bpc', sRGB, L.TYPE_RGB_8, CMYK, L.TYPE_CMYK_8, RC, BPC, rgb, nrgb);
  add('srgb_to_cmyk_perceptual_bpc', sRGB, L.TYPE_RGB_8, CMYK, L.TYPE_CMYK_8, PE, BPC, rgb, nrgb);
  add('cmyk_to_srgb_relcol_bpc', CMYK, L.TYPE_CMYK_8, sRGB, L.TYPE_RGB_8, RC, BPC, cmykIn, ncm);
  fs.writeFileSync(path.join(EMIT, 'cases.json'), JSON.stringify(cases));
  // ---- Chromium
  const { chromium } = require('playwright-core');
  const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': f.endsWith('.wasm') ? 'application/wasm' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }), p = await b.newPage(); p.on('pageerror', (e) => fails.push('page error: ' + e.message));
  await p.goto(base + '/icc/blank.html');
  for (const s of ['/icc/color_math.js', '/icc/icc_write.js', '/stack.js', '/oracle.js', '/icc/icc_core.js', '/icc/color_fold.js']) await p.addScriptTag({ url: base + s });
  const br = await p.evaluate(async () => { const L = await import('/node_modules/lcms-wasm/dist/lcms.js'), lcms = await L.instantiate();
    const cmyk = new Uint8Array(await (await fetch('/icc/profiles/default_cmyk.icc')).arrayBuffer()); const o = IccCore.run(L, lcms, cmyk, 2000000), cf = ColorFold.run(L, lcms, cmyk, o.p3Bytes, Stack.sha256); o.fails.push(...cf.fails); Object.assign(o.hashes, cf.hashes); delete o.p3Bytes; return o; });
  await b.close(); srv.close();
  fails.push(...br.fails.map((f) => 'chromium: ' + f));
  const same = JSON.stringify(node.hashes) === JSON.stringify(br.hashes); if (!same) fails.push('Node and Chromium hashes differ');
  // ---- golden
  if (update) fs.writeFileSync(GOLD, JSON.stringify(node.hashes, null, 1) + '\n');
  else { const want = JSON.parse(fs.readFileSync(GOLD, 'utf8')); for (const k of Object.keys(want)) if (node.hashes[k] !== want[k]) fails.push('golden ' + k + ' changed'); }
  // ---- native
  let native; try { native = JSON.parse(execFileSync('python3', ['-I', path.join(__dirname, 'check_native.py'), EMIT], { encoding: 'utf8' })); } catch (e) { native = { error: String(e.stdout || e.message).slice(0, 400) }; fails.push('native comparison failed to run'); }
  if (native.fails && native.fails.length) fails.push(...native.fails.map((f) => 'native: ' + f));
  delete node.p3Bytes; delete node.fails; node.checks.throughput_browser = br.checks.throughput_MPx_per_s;
  console.log(JSON.stringify({ node_checks: node.checks, node_fails_total: fails.length, hashes_node_equal_chromium: same, hashes: Object.fromEntries(Object.entries(node.hashes).map(([k, v]) => [k, v.slice(0, 16)])), native_vs_wasm: native.cases || native, gate: fails.length ? 'FAIL' : 'PASS', fails }, null, 1));
  process.exit(fails.length ? 1 : 0);
})();
