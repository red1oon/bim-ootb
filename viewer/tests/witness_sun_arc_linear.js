#!/usr/bin/env node
// ⚠ DO NOT REMOVE — §SUN_ARC_TOPOUT_SNAP REVERTED witness (bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md,
// 2026-09-06). Read the log after every run — exit code is not evidence.
//
// ISSUE IT PROVES OR DISPROVES: the bake's sun elevation is the ONE linear 55°→6° formula of the film
// fraction, for every caller, with no second argument that bends it after topout (#1685 added one; the user
// ruled the original crawl correct and never to be touched). Calls the SHIPPED A._sunArcStep in a real
// viewer page and checks its returned elevation against the formula at seven film fractions, that a stray
// second argument changes nothing, and (statically) that cinema_maxq.js calls it with exactly one argument.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const { Witness } = require('../../witness_kit/contract');
const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const BLD = process.env.BLD || 'Hospital_silent_local';
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings');
const GPU = process.env.GPU || 'real';
const PORT = +(process.env.PORT || 8598);
const LOAD_MS = +(process.env.LOAD_MS || 900000);
const LOG = process.env.LOG || '/tmp/witness_sun_arc_linear.log';
const logStream = fs.createWriteStream(LOG, { flags: 'w' });
const T0 = Date.now();
function ts() { return new Date().toISOString().slice(11, 23) + ' +' + ((Date.now() - T0) / 1000).toFixed(1).padStart(7) + 's'; }
function log(l) { const s = ts() + ' ' + l; logStream.write(s + '\n'); console.log(s); }
function logRaw(l) { logStream.write(ts() + ' ' + l + '\n'); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.hdr': 'application/octet-stream', '.gz': 'application/gzip', '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => { try {
  const u = decodeURIComponent(req.url.split('?')[0]);
  let fp = u.startsWith('/buildings/') ? path.join(BLD_DIR, u.slice('/buildings/'.length)) : path.join(ROOT, u.replace(/^\/+/, ''));
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
  if (!fs.existsSync(fp)) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(fp).pipe(res);
} catch (e) { res.writeHead(500); res.end(String(e)); } });
function inconclusive(r) { log('§SAL verdict=INCONCLUSIVE reason=' + r + ' — nothing was judged'); log('§WITNESS_SUN_ARC_LINEAR pass=0 fail=0 ran=0 INCONCLUSIVE'); }

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const gpuArgs = { sw: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], real: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] }[GPU] || [];
  const gpuEnv = GPU === 'real' ? { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' } : {};
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sal-'));
  const commit = (() => { try { return require('child_process').execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD']).toString().trim(); } catch (e) { return '?'; } })();
  log(`§SAL_ENV root=${ROOT} commit=${commit} bld=${BLD} gpu=${GPU} log=${LOG}`);
  const EFFECTS = fs.readFileSync(path.join(ROOT, 'viewer/effects.js'), 'utf8');
  const MAXQ = fs.readFileSync(path.join(ROOT, 'viewer/cinema_maxq.js'), 'utf8');
  const START = +(EFFECTS.match(/var PHOTO_SUN_ELEVATION_START = (\d+(?:\.\d+)?)/) || [])[1];
  const END = +(EFFECTS.match(/var PHOTO_SUN_ELEVATION = (\d+(?:\.\d+)?)/) || [])[1];
  const browser = await puppeteer.launch({ headless: true, userDataDir: profile, protocolTimeout: 20 * 60 * 1000, env: Object.assign({}, process.env, gpuEnv), args: ['--no-sandbox', '--hide-crash-restore-bubble', '--window-size=1300,840'].concat(gpuArgs) });
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  page.on('console', m => logRaw('[con] ' + m.text()));
  page.on('pageerror', e => logRaw('[pageerror] ' + e.message));
  const rows = []; let crashed = false;
  const claim = (name, ok, detail) => { rows.push({ claim: name, ok: ok ? 1 : 0, detail: String(detail).slice(0, 240) }); log(`§SAL_CLAIM ${name} ${ok ? 'OK' : 'FAIL'} — ${detail}`); };
  try {
    if (!(START > END)) { inconclusive(`could not read PHOTO_SUN_ELEVATION_START/END from effects.js (${START}/${END})`); process.exitCode = 2; return; }
    const url = `http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${BLD}.db`; log('§SAL_NAV ' + url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.APP && window.APP.renderer && typeof window.APP._sunArcStep === 'function' && typeof window.APP.updateSky === 'function', { timeout: LOAD_MS });
    const TS = [0, 0.1, 0.361, 0.419, 0.441, 0.7, 1];
    const S = await page.evaluate((ts) => { const A = window.APP; const keep = A._sunArcElevationDeg;
      const one = ts.map(t => ({ t, el: A._sunArcStep(t), elWithArg: A._sunArcStep(t, 0.361), arity: A._sunArcStep.length }));
      A._sunArcElevationDeg = keep; return one; }, TS);
    S.forEach(r => log('§SAL_SAMPLE ' + JSON.stringify(r)));
    const want = t => START + (END - START) * t;
    const offLinear = S.filter(r => Math.abs(r.el - want(r.t)) > 1e-9);
    claim('L1_elevation_is_the_linear_formula_at_every_sample', S.length === TS.length && offLinear.length === 0,
      `${START}°→${END}° linear: ` + S.map(r => r.t + '→' + r.el.toFixed(2)).join(' ') + (offLinear.length ? ' OFF at ' + offLinear.map(r => r.t + ' (want ' + want(r.t).toFixed(2) + ')').join(',') : ''));
    claim('L2_a_second_argument_changes_nothing', S.every(r => r.elWithArg === r.el) && S.every(r => r.arity === 1),
      `_sunArcStep(t, 0.361) === _sunArcStep(t) at every sample: ${S.every(r => r.elWithArg === r.el)}; declared arity=${S[0].arity}`);
    const call = MAXQ.match(/A\._sunArcStep\(([^)]*)\)/g) || [];
    claim('L3_bake_calls_the_step_with_the_film_fraction_only', call.length === 1 && /^A\._sunArcStep\(_tnFilm\)$/.test(call[0]), `cinema_maxq.js calls: ${JSON.stringify(call)}`);
    const body = (EFFECTS.match(/function _sunElevationAt\(([^)]*)\)\s*\{([\s\S]*?)\n  \}/) || []);
    const oneLiner = body[1] === 'tNorm' && (body[2] || '').trim().split('\n').length === 1 && /return PHOTO_SUN_ELEVATION_START \+ \(PHOTO_SUN_ELEVATION_END - PHOTO_SUN_ELEVATION_START\) \* tNorm;/.test(body[2] || '');
    claim('L4_formula_source_is_the_single_linear_line', oneLiner, `_sunElevationAt(${body[1]}) body: ${JSON.stringify((body[2] || '').trim())}`);
  } catch (e) { log('§SAL_ERROR ' + (e && e.stack || e)); inconclusive('exception ' + String(e && e.message).slice(0, 160)); process.exitCode = 2; crashed = true; }
  finally { try { await browser.close(); } catch (e) {} server.close(); try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} }
  if (!rows.length || crashed) return;
  Witness('sun_arc_linear').population(() => rows)
    .schema({ type: 'object', required: ['claim', 'ok'], properties: { claim: { type: 'string', minLength: 1 }, ok: { type: 'integer', minimum: 0, maximum: 1 }, detail: { type: 'string' } } })
    .invariant('the bake sun is the single linear 55°→6° formula of the film fraction: matches at every sample, ignores any second argument, one-argument call site, one-line source', rs => rs.every(r => r.ok === 1))
    .redControl(rs => { const c = rs.map(r => Object.assign({}, r)); if (c[0]) c[0].ok = 0; return c; })
    .run();
  logStream.end();
})();
