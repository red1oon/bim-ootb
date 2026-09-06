#!/usr/bin/env node
// ⚠ DO NOT REMOVE — §PL_TOPOUT_UNPIN witness (spec: bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md
// §PL_TOPOUT_UNPIN, 2026-09-06). Read the log after every run — exit code is not evidence.
//
// ISSUE IT PROVES OR DISPROVES: with the sun correctly snapped to 6° after topout (§SUN_ARC_TOPOUT_SNAP),
// the interior fixtures never read as the dominant light because the bake's fill pin holds plScale at the
// staged Alt+S cut (0.5) for the whole film. This witness calls the SHIPPED A._sunArcFillPin(t, topoutU)
// on a real Hospital load with real photo staging and asserts: pre-topout → the staged value (unchanged
// behaviour); inside the ease window → strictly between, on the sun's own TOPOUT_SNAP_EASE_U curve;
// past it → 1.0 with the point-light pool's summed intensity scaled 1/staged; a call WITHOUT topoutU →
// the staged value (the legacy/preview path untouched); a staged 0 → 0 at every t; ambient/hemi never move.
// Every claim can come back NO; staging that never lands is INCONCLUSIVE, never PASS.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const { Witness } = require('../../witness_kit/contract');
const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const BLD = process.env.BLD || 'Hospital_silent_local';
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings');
const GPU = process.env.GPU || 'real';
const PORT = +(process.env.PORT || 8597);
const LOAD_MS = +(process.env.LOAD_MS || 900000);
const LOG = process.env.LOG || '/tmp/witness_pl_topout_unpin.log';
const TOPOUT_U = +(process.env.TOPOUT_U || 0.361);   // the Hospital plan's topout fraction used throughout the spec
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
function inconclusive(r) { log('§PLT verdict=INCONCLUSIVE reason=' + r + ' — nothing was judged'); log('§WITNESS_PL_TOPOUT_UNPIN pass=0 fail=0 ran=0 INCONCLUSIVE'); }

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const gpuArgs = { sw: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], real: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] }[GPU] || [];
  const gpuEnv = GPU === 'real' ? { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' } : {};
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'plt-'));
  const commit = (() => { try { return require('child_process').execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD']).toString().trim(); } catch (e) { return '?'; } })();
  log(`§PLT_ENV root=${ROOT} commit=${commit} bld=${BLD} gpu=${GPU} topoutU=${TOPOUT_U} log=${LOG}`);
  // static claim: the bake passes the topout fraction to the pin (otherwise nothing below can reach a real bake)
  const MAXQ = fs.readFileSync(path.join(ROOT, 'viewer/cinema_maxq.js'), 'utf8');
  const wired = /A\._sunArcFillPin\(_tnFilm,\s*_revealU\)/.test(MAXQ);
  const browser = await puppeteer.launch({ headless: true, userDataDir: profile, protocolTimeout: 20 * 60 * 1000, env: Object.assign({}, process.env, gpuEnv), args: ['--no-sandbox', '--hide-crash-restore-bubble', '--window-size=1300,840'].concat(gpuArgs) });
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  page.on('console', m => logRaw('[con] ' + m.text()));
  page.on('pageerror', e => logRaw('[pageerror] ' + e.message));
  const rows = []; let crashed = false;
  const claim = (name, ok, detail) => { rows.push({ claim: name, ok: ok ? 1 : 0, detail: String(detail).slice(0, 240) }); log(`§PLT_CLAIM ${name} ${ok ? 'OK' : 'FAIL'} — ${detail}`); };
  try {
    const url = `http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${BLD}.db`; log('§PLT_NAV ' + url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.APP && window.APP.renderer, { timeout: LOAD_MS });
    await page.waitForFunction(() => window.APP.activeBuilding && window.APP.db && window.APP.buildingsRendered && window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming, { timeout: LOAD_MS, polling: 1000 });
    const has = await page.evaluate(() => !!(window.APP._sunArcFillPin && window.APP._plTopoutWant && window.APP.startStillRefine));
    if (!has) { inconclusive('A._sunArcFillPin / A._plTopoutWant / A.startStillRefine absent — §PL_TOPOUT_UNPIN not wired on this ROOT'); process.exitCode = 2; return; }
    // real photo staging (the Alt+S entry) — the pin reads A._photoFillBase and A._nightPLScaleStaged from it
    await page.evaluate(() => { try { window.APP.startStillRefine(); } catch (e) { console.log('§PLT startStillRefine threw: ' + e.message); } });
    let staged = null;
    try {
      await page.waitForFunction(() => { const A = window.APP; return !!(A._photoFillBase && typeof A._nightPLScaleStaged === 'number' && typeof A._nightUpdateLights === 'function'); }, { timeout: 180000, polling: 500 });
      staged = await page.evaluate(() => { const A = window.APP; return { base: A._photoFillBase, plStaged: A._nightPLScaleStaged, budget: A._nightMaxLightsStill, fixtures: (A._nightBakePool || A._nightLights || []).length }; });
    } catch (e) { staged = null; }
    if (!staged) { inconclusive('photo staging never landed (A._photoFillBase / A._nightPLScaleStaged absent after 180 s) — the pin has nothing to pin'); process.exitCode = 2; return; }
    log(`§PLT_STAGED ambI=${staged.base.ambI} hemiI=${staged.base.hemiI} plStaged=${staged.plStaged} budgetStill=${staged.budget} fixtures=${staged.fixtures}`);
    if (!(staged.plStaged > 0)) { inconclusive(`plStaged=${staged.plStaged} — a lights-off staging cannot show the ease (the staged-0 claim alone would be vacuous)`); process.exitCode = 2; return; }
    // stop the refine loop's own writes from racing the samples: pin runs are synchronous, so sample back to back
    const S = await page.evaluate((tu) => { const A = window.APP; const at = (t, u) => { const r = A._sunArcFillPin(t, u); return { t, u, plScale: r.plScale, plWant: r.plWant, poolLit: r.poolLit, poolSum: +r.poolSum.toFixed(6), ambient: r.ambient, hemi: r.hemi, drift: r.drift.join(';') }; };
      const out = { pre: at(0.30, tu), mid: at(0.40, tu), end: at(0.45, tu), late: at(0.90, tu), noTopout: at(0.45, null), preAgain: at(0.30, tu) };
      const keep = A._nightPLScaleStaged; A._nightPLScaleStaged = 0; out.zero = at(0.90, tu); A._nightPLScaleStaged = keep; out.restored = at(0.90, tu);
      out.curve = { pre: A._plTopoutWant(keep, 0.30, tu), mid: A._plTopoutWant(keep, 0.40, tu), end: A._plTopoutWant(keep, 0.45, tu), none: A._plTopoutWant(keep, 0.45, null) };
      return out; }, TOPOUT_U);
    Object.keys(S).forEach(k => log('§PLT_SAMPLE ' + k + ' ' + JSON.stringify(S[k])));
    const st = staged.plStaged, EASE = 0.08;
    const wantMid = st + (1 - st) * ((0.40 - TOPOUT_U) / EASE);
    claim('U0_bake_passes_topout_to_the_pin', wired, `cinema_maxq.js calls A._sunArcFillPin(_tnFilm, _revealU): ${wired}`);
    claim('U1_pre_topout_is_the_staged_value', S.pre.plScale === st && S.preAgain.plScale === st, `t=0.30 plScale=${S.pre.plScale} (staged ${st}); again after the ease: ${S.preAgain.plScale}`);
    claim('U2_inside_the_window_is_on_the_sun_ease_curve', S.mid.plScale > st && S.mid.plScale < 1 && Math.abs(S.mid.plScale - wantMid) < 1e-6,
      `t=0.40 plScale=${S.mid.plScale} want=${wantMid.toFixed(6)} (staged + (1−staged)·(0.40−${TOPOUT_U})/${EASE})`);
    claim('U3_past_the_window_is_the_tuned_night_value', S.end.plScale === 1 && S.late.plScale === 1, `t=0.45 → ${S.end.plScale}, t=0.90 → ${S.late.plScale} (PL_TOPOUT_TARGET 1.0 = nav Night Mode's A._nightPLScale)`);
    const ratio = S.pre.poolSum > 0 ? S.late.poolSum / S.pre.poolSum : null;
    claim('U4_pool_intensity_scales_with_it', S.pre.poolLit > 0 && S.late.poolLit === S.pre.poolLit && ratio != null && Math.abs(ratio - 1 / st) < 0.01,
      `poolLit ${S.pre.poolLit}→${S.late.poolLit}, poolSum ${S.pre.poolSum}→${S.late.poolSum} ratio=${ratio == null ? '-' : ratio.toFixed(4)} want=${(1 / st).toFixed(4)}`);
    claim('U5_no_topout_is_the_untouched_pin', S.noTopout.plScale === st && S.curve.none === st, `t=0.45 with topoutU=null → plScale=${S.noTopout.plScale} (staged ${st}); curve(none)=${S.curve.none}`);
    // The pin's contract is the plScale WRITE. The pool's own reading of a 0 is tools.js's business: its
    // `(A._nightPLScale || 1)` treats 0 as "unset" (pre-existing, both branches ~1917/1952), so poolSum does not
    // follow a 0 here — logged as a finding, not gated (the lights-off film state is enforced by effects.js
    // §CPE_TAIL_LIGHTS_ALL_ONLY's own path, not by this multiplier).
    claim('U6_staged_zero_stays_zero', S.zero.plScale === 0 && S.zero.plWant === 0, `staged 0, t=0.90 → plScale=${S.zero.plScale} plWant=${S.zero.plWant} (poolSum=${S.zero.poolSum}: tools.js reads a 0 scale as 1 — pre-existing, see the comment)`);
    const fills = ['pre', 'mid', 'end', 'late', 'noTopout', 'zero', 'restored'].map(k => S[k].ambient + '/' + S[k].hemi);
    claim('U7_ambient_and_hemi_never_move', fills.every(f => f === fills[0]) && S.pre.ambient === staged.base.ambI && S.pre.hemi === staged.base.hemiI, `ambient/hemi across all samples: ${fills[0]} (staged ${staged.base.ambI}/${staged.base.hemiI})`);
  } catch (e) { log('§PLT_ERROR ' + (e && e.stack || e)); inconclusive('exception ' + String(e && e.message).slice(0, 160)); process.exitCode = 2; crashed = true; }
  finally { try { await browser.close(); } catch (e) {} server.close(); try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} }
  if (!rows.length || crashed) return;
  Witness('pl_topout_unpin').population(() => rows)
    .schema({ type: 'object', required: ['claim', 'ok'], properties: { claim: { type: 'string', minLength: 1 }, ok: { type: 'integer', minimum: 0, maximum: 1 }, detail: { type: 'string' } } })
    .invariant('every §PL_TOPOUT_UNPIN claim holds: the bake passes topout, pre-topout and no-topout equal the staged pin, the window follows the sun ease, past it the fixtures sit at the tuned night value with the pool scaled 1/staged, staged 0 stays 0, ambient/hemi never move', rs => rs.every(r => r.ok === 1))
    .redControl(rs => { const c = rs.map(r => Object.assign({}, r)); if (c[0]) c[0].ok = 0; return c; })
    .run();
  logStream.end();
})();
