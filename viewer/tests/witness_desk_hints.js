// ⚠ DO NOT REMOVE — WITNESS W-DESK-HINTS (bim-compiler prompts/MOBILE_PERF.md "WO-33": the desktop discovers the phone-gated files as early as before the gate). READ THE LOG after every run; the exit code is not evidence.
// ISSUE THIS PROVES OR DISPROVES: WO-32 measured that the phone gate made desktop `§BOOT_T initViewer_ms` about +5 % slower, with ONE cause the timings point at: before the gate the browser's preload scanner saw every
//   static tag at once (first gated file starts at about 6 ms), after it the gated files were found only when the parser had run config.js and the `_DESK` block that wrote the hints (about 33-36 ms; domInteractive +46 ms).
// WHAT WO-33 BUILT: the hints are STATIC markup in the page head (one `<link rel="preload" as="script" href="<file>?v=<code>" media="(min-device-width: 1024px)">` per `desk` file, written by scripts/gen_manifest.js from
//   viewer/modules.json), so the scanner sees them at once, and a phone (touch + screen < 1024) matches none of them. The JS loop that wrote hints is deleted. window._caps (viewer/config.js) is STILL the one
//   decider of what executes: the media query is a performance hint only.
// CHECKS (Duplex, service workers blocked, cache disabled, headless, the launch options of witness_phone_axe.js):
//   H1  phone profile (touch + 412 wide, as witness_mobile_p1.js): ZERO requests for any desk file; population = every desk file of viewer/modules.json (> 0, else INCONCLUSIVE); §DESK_GATE phone=true written=0
//   H2  desktop: every desk file requested exactly once; the FIRST desk file's request start minus the first static script's start is no later than the same difference on the page before any gate
//       (424473b0^, measured here, never hard-coded) + 5 ms (medians of TIMING_RUNS runs each, every number printed)
//   H3  the two profiles where the hint and the probe differ, neither is wrong: (a) narrow WITHOUT touch: not a phone, hints do not match, every desk file still loads and runs through _desk (globals exist at initViewer,
//       §DESK_GATE written=<all>); (b) wide WITH touch: not a phone, hints match, every file is fetched once, runs, and Chrome prints 0 "preloaded but not used" warnings
//   H4  desktop behaviour unchanged: witness_phone_axe.js --group rules | film,filmsound | fourd | still, ONE AT A TIME, each with the BASE_REF its PR names; D1 must PASS in each (their lines are printed)
//   H5  timing, 15 rounds (variants rotated, load recorded per run): V0 = the page before any gate, V1 = origin/main before this order, V6 = this tree; pass: V6-V1 median < 0 in at least 10 of 15 rounds.
//       V6-V0 is REPORTED as measured, not a pass criterion.
//   R1  RED: the `media` attribute removed from the hints (a copy of the page) -> H1 must FAIL (the phone fetches the files)
//   R2  RED: the hints removed (a copy of the page) -> H2 must FAIL (the gated files start late again)
// VERDICT: §W-DESK-HINTS checks=5 fail=<n> red=<k>/2 verdict=PASS|FAIL|INCONCLUSIVE   (INCONCLUSIVE when a population was empty or a red control was not detected)
// Run:  node viewer/tests/witness_desk_hints.js   (env: ONLY=H1,H3 runs just those and never prints PASS · ROUNDS=15 · TIMING_RUNS=5 · V0_REF=424473b0^ · V1_REF=<default: merge-base of HEAD and origin/main>
//       · AXE_LOG_DIR=<dir for the H4 logs> · REUSE_AXE=1 reads logs already there instead of running · LOAD_MAX=2 · DESK_HINTS_LOG=<file> · PW=<playwright path>)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const ROOT = path.join(__dirname, '..', '..'), LOG = process.env.DESK_HINTS_LOG || path.join(__dirname, 'witness_desk_hints.log');
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean), want = id => !ONLY.length || ONLY.includes(id);
const ROUNDS = +(process.env.ROUNDS || 15), TIMING_RUNS = +(process.env.TIMING_RUNS || 5), LOAD_MAX = +(process.env.LOAD_MAX || 2);
const git = (args, opt) => cp.execFileSync('git', args, Object.assign({ cwd: ROOT, maxBuffer: 1 << 28 }, opt || {}));
const V0_REF = process.env.V0_REF || '424473b0^', V1_REF = process.env.V1_REF || git(['merge-base', 'HEAD', 'origin/main']).toString().trim();
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.sql': 'text/plain', '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
const URL_PATH = '/viewer/viewer.html?db=buildings/Duplex_extracted.db';
const PHONE = { viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true, serviceWorkers: 'block',
  userAgent: 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36' };
const PROFILES = { phone: PHONE, desktop: { viewport: { width: 1400, height: 900 }, serviceWorkers: 'block' },
  narrowNoTouch: { viewport: { width: 412, height: 823 }, serviceWorkers: 'block' }, wideTouch: { viewport: { width: 1400, height: 900 }, hasTouch: true, serviceWorkers: 'block' } };
const LAUNCH = { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] };   // the options witness_phone_axe.js / witness_boot_cpe_lazy.js use: no GPU flags added, never headed
const out = [], S = m => { out.push(m); console.log(m); }, sleep = ms => new Promise(r => setTimeout(r, ms));
const median = a => { const s = a.slice().sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const quant = (a, p) => a.slice().sort((x, y) => x - y)[Math.floor(p * (a.length - 1))];
const res = [];   // {id, state, why}
const note = (id, state, why) => { res.push({ id, state, why }); S(`§W-DESK-HINTS ${id} ${state} ${why}`); };
const BOOT_T_LINE = "  console.log('§BOOT_T initViewer_ms=' + Math.round(performance.now()));   // the clock D2 of witness_phone_axe.js reads; first statement on purpose\n";

// ---- the desk files, from the manifest (never hard-coded): normalised paths of the files, in load order
const MAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'modules.json'), 'utf8'));
const DESK = MAN.order['viewer/viewer.html'].filter(s => s.kind === 'desk').map(s => path.posix.normalize('viewer/' + s.as));
const HINTS = MAN.order['viewer/viewer.html'].filter(s => s.kind === 'hint').map(s => path.posix.normalize('viewer/' + s.as));
const reqPath = u => { try { return decodeURIComponent(new URL(u).pathname).replace(/^\//, ''); } catch (e) { return ''; } };
const isDesk = u => DESK.includes(reqPath(u));

// ---- servers: a tree on disk (optionally with some files replaced) — `overlay`: path -> string
function serve(root, overlay) {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
    const rel = p.replace(/^\//, '');
    if (overlay && overlay.has(rel)) { res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(overlay.get(rel)); return; }
    fs.readFile(path.join(root, p), (e, buf) => { if (e) { res.writeHead(404); res.end('404 ' + p); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf); });
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ srv, port: srv.address().port })));
}
/** the app folders of `ref` as a git archive (cached under the temp folder, keyed by the commit), the Duplex etc. symlinked from this tree, and the one §BOOT_T line main.js lacks before WO-2 step 6 */
function treeOf(ref) {
  const sha = git(['rev-parse', ref]).toString().trim(), dir = path.join(os.tmpdir(), 'wdh_' + sha.slice(0, 12));
  if (!fs.existsSync(path.join(dir, '.done'))) {
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    cp.execSync(`git archive ${sha} viewer common erp modeller hr_bim_asset | tar -x -C ${JSON.stringify(dir)}`, { cwd: ROOT, maxBuffer: 1 << 28 });
    fs.mkdirSync(path.join(dir, 'viewer', 'buildings'), { recursive: true });
    for (const f of fs.readdirSync(path.join(ROOT, 'viewer', 'buildings'))) { if (f === 'patches') continue; const d = path.join(dir, 'viewer', 'buildings', f); try { fs.rmSync(d, { force: true }); fs.symlinkSync(fs.realpathSync(path.join(ROOT, 'viewer', 'buildings', f)), d); } catch (e) { /* a missing source is not this witness's business */ } }
    const mp = path.join(dir, 'viewer', 'main.js'); let tx = fs.readFileSync(mp, 'utf8');
    if (!tx.includes('§BOOT_T')) { const a = 'async function initViewer() {\n'; if (!tx.includes(a)) throw new Error('initViewer not found in main.js of ' + ref); fs.writeFileSync(mp, tx.replace(a, a + BOOT_T_LINE)); }
    fs.writeFileSync(path.join(dir, '.done'), sha);
  }
  return dir;
}

// ---- one page run. Returns everything the claims read.
const ENTRY_GLOBALS = ['SkyOcc', 'SourcedLight', 'ShadowCascade', 'LightZones', 'toggleTimeMachine', 'tmGetState', 'ScheduleRead4D', 'ScheduleSync', 'Info4DPanel', 'ScheduleInject', 'setupGIPoc', 'setupRuleChecklist'];
async function run(browser, port, profile, o) {
  o = o || {};
  const ctx = await browser.newContext(PROFILES[profile]), page = await ctx.newPage(), cons = [], reqs = [], resp = new Map(), errs = [], warns = [];
  page.on('console', m => { cons.push(m.text()); if (m.type() === 'warning') warns.push(m.text()); }); page.on('request', q => reqs.push(q.url())); page.on('response', r => resp.set(r.url(), r.status())); page.on('pageerror', e => errs.push(String(e.message).slice(0, 240)));
  const c = await ctx.newCDPSession(page); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.addInitScript(names => { try { performance.setResourceTimingBufferSize(3000); } catch (e) {} const ol = console.log.bind(console); console.log = function () { const t = arguments[0];
    if (typeof t === 'string' && t.indexOf('§BOOT_T') === 0) window.__bootT = { globals: names.map(n => [n, typeof window[n]]), scripts: [...document.scripts].map(s => s.src).filter(x => x), di: (performance.getEntriesByType('navigation')[0] || {}).domInteractive };
    return ol.apply(console, arguments); }; }, ENTRY_GLOBALS);
  await page.goto('http://127.0.0.1:' + port + URL_PATH, { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 120 && !cons.some(t => t.indexOf('§BOOT_T') === 0); i++) await sleep(250);
  await sleep(o.settleMs == null ? 1500 : o.settleMs);   // o.settleMs 8000: past Chrome's "preloaded but not used" check (a few seconds after the load event)
  const perf = await page.evaluate(() => { const nav = performance.getEntriesByType('navigation')[0] || {}; return { domInteractive: Math.round(nav.domInteractive || 0),
    res: performance.getEntriesByType('resource').filter(e => /\.js(\?|$)/.test(e.name)).map(e => [e.name, e.startTime, e.responseEnd]), caps: window._caps ? JSON.stringify(window._caps) : null, bootT: window.__bootT || null, scr: screen.width, mm: matchMedia('(min-device-width: 1024px)').matches }; }).catch(() => ({ domInteractive: 0, res: [], bootT: null }));
  await ctx.close();
  const m = cons.map(t => /^§BOOT_T initViewer_ms=(\d+)/.exec(t)).find(Boolean);
  return { cons, reqs, resp, errs, warns, perf, ms: m ? +m[1] : NaN, gate: cons.find(t => t.indexOf('§DESK_GATE') === 0) || null,
    bad: cons.filter(t => /ReferenceError|§LOAD_FAIL|§INIT_VIEWER_TIMEOUT/.test(t)).concat(errs) };
}
/** how often each desk file was requested in a run; and the start time of the first desk file / the first other script (resource timing, ms from navigation start) */
function deskReqs(r) { const n = new Map(DESK.map(f => [f, 0])); for (const u of r.reqs) { const p = reqPath(u); if (n.has(p)) n.set(p, n.get(p) + 1); } return n; }
function starts(r) {
  const ent = r.perf.res.map(([u, s, e]) => ({ p: reqPath(u), s, e }));
  const dk = ent.filter(x => DESK.includes(x.p)), st = ent.filter(x => !DESK.includes(x.p));
  const first = dk.length ? dk.reduce((a, b) => (DESK.indexOf(a.p) <= DESK.indexOf(b.p) ? a : b)) : null;   // the first desk file in LOAD order (not the earliest in time: that would hide a late first file)
  return { deskFirst: first ? first.s : NaN, staticFirst: st.length ? Math.min(...st.map(x => x.s)) : NaN, deskMin: dk.length ? Math.min(...dk.map(x => x.s)) : NaN, deskLastStart: dk.length ? Math.max(...dk.map(x => x.s)) : NaN };
}
const f1 = x => Number.isFinite(x) ? x.toFixed(1) : 'NaN';

// ---- the judges (the red controls call the SAME functions on a mutated page)
/** H1: a phone requested none of the desk files. */
function judgeH1(r) {
  const n = deskReqs(r), got = [...n].filter(([, c]) => c > 0).map(([f]) => f);
  return { ok: DESK.length > 0 && got.length === 0 && /phone=true/.test(r.gate || '') && /written=0/.test(r.gate || ''), requested: got.length, population: DESK.length, gate: r.gate, first: got.slice(0, 3) };
}
/** H2: every desk file once; the first desk file starts no later (relative to the first static script) than on the baseline page + 5 ms (medians). */
function judgeH2(runs, base) {
  const once = runs.every(r => [...deskReqs(r).values()].every(c => c === 1)), d = a => median(a.map(r => { const s = starts(r); return s.deskFirst - s.staticFirst; }));
  const mine = d(runs), theirs = d(base);
  return { ok: once && Number.isFinite(mine) && Number.isFinite(theirs) && mine - theirs <= 5, once, mine, theirs };
}
/** a page with every hint changed by `fn` (the red controls) */
const mutatePage = fn => { const tx = fs.readFileSync(path.join(ROOT, 'viewer', 'viewer.html'), 'utf8'); const a = tx.indexOf('<!-- §MANIFEST:BEGIN viewer hints'), b = tx.indexOf('<!-- §MANIFEST:END viewer hints -->');
  if (a < 0 || b < 0) throw new Error('the hints block is not in viewer/viewer.html'); const blk = tx.slice(a, b); const nb = fn(blk); if (nb === blk) throw new Error('the mutation changed nothing');
  return new Map([['viewer/viewer.html', tx.slice(0, a) + nb + tx.slice(b)]]); };

const loadNow = () => os.loadavg()[0];
async function waitLoad(label) { const t0 = Date.now(); let l = loadNow(); while (l > LOAD_MAX && Date.now() - t0 < 25 * 60 * 1000) { await sleep(10000); l = loadNow(); }
  S(`§W-DESK-HINTS LOAD ${label} load1=${l.toFixed(2)} waited_s=${Math.round((Date.now() - t0) / 1000)} ${l <= LOAD_MAX ? 'settled' : 'NOT-SETTLED (gave up after 25 min)'}`); return l; }

(async () => {
  S(`§W-DESK-HINTS start desk_files=${DESK.length} hint_sites=${HINTS.length} V0=${V0_REF} V1=${V1_REF} rounds=${ROUNDS} timing_runs=${TIMING_RUNS} only=${ONLY.join(',') || '-'}`);
  const browser = await chromium.launch(LAUNCH);
  const here = await serve(ROOT);
  let t0 = null, vaxe = null;
  const R = { H1: null, H2: null };
  // ---- H1 phone
  if (want('H1') || want('R1')) {
    if (!DESK.length) note('H1', 'INCONCLUSIVE', 'the manifest holds no desk file (population empty)');
    else {
      const r = await run(browser, here.port, 'phone'), j = judgeH1(r); R.H1 = j;
      if (want('H1')) note('H1', j.ok ? 'PASS' : 'FAIL', `phone (touch + ${r.perf.scr}px): ${j.requested} of ${j.population} desk files requested${j.requested ? ' (' + j.first.join(',') + ')' : ''}; ${r.gate}; caps=${r.perf.caps}; page errors=${r.bad.length}${r.bad.length ? ' ' + r.bad.slice(0, 2).join(' | ') : ''}`);
    }
  }
  // ---- H2 desktop, against the page before any gate
  let baseRuns = [], myRuns = [];
  if (want('H2') || want('R2')) {
    const v0 = treeOf(V0_REF), s0 = await serve(v0);
    for (let i = 0; i < TIMING_RUNS; i++) { myRuns.push(await run(browser, here.port, 'desktop', { settleMs: i === 0 ? 8000 : 2500 })); await sleep(2500); baseRuns.push(await run(browser, s0.port, 'desktop', { settleMs: 2500 })); await sleep(2500); }
    s0.srv.close(); R.H2 = judgeH2(myRuns, baseRuns);
    myRuns.forEach((r, i) => { const a = starts(r), b = starts(baseRuns[i]); S(`§W-DESK-HINTS H2 run=${i + 1} branch: first_desk_start=${f1(a.deskFirst)} first_static_start=${f1(a.staticFirst)} diff=${f1(a.deskFirst - a.staticFirst)} last_desk_start=${f1(a.deskLastStart)} domInteractive=${r.perf.domInteractive} | pre-gate page: first_desk_start=${f1(b.deskFirst)} first_static_start=${f1(b.staticFirst)} diff=${f1(b.deskFirst - b.staticFirst)} last_desk_start=${f1(b.deskLastStart)} domInteractive=${baseRuns[i].perf.domInteractive} load1=${loadNow().toFixed(2)}`); });
    const n = deskReqs(myRuns[0]); const unused = myRuns.reduce((k, r) => k + r.warns.filter(w => /preload/i.test(w) && /not used/i.test(w)).length, 0);
    R.unusedDesktop = unused;
    if (want('H2')) note('H2', R.H2.ok ? 'PASS' : 'FAIL', `desktop: every desk file requested exactly once in all ${myRuns.length} runs: ${R.H2.once} (first run: ${[...n.values()].filter(c => c === 1).length}/${DESK.length}); first-desk-start minus first-static-start: median ${f1(R.H2.mine)} ms on this page vs ${f1(R.H2.theirs)} ms on the page before any gate (${V0_REF}); rule: mine <= theirs + 5 -> ${f1(R.H2.mine - R.H2.theirs)}; unused-preload warnings on desktop=${unused}`);
  }
  // ---- H3 the two profiles where hint and probe differ
  if (want('H3')) {
    const judge3 = (r, what) => { const n = deskReqs(r), all = [...n.values()].every(c => c === 1), ok200 = DESK.every(f => [...r.resp].some(([u, st]) => reqPath(u) === f && st === 200));
      const g = r.perf.bootT ? r.perf.bootT.globals.filter(([, t]) => t !== 'undefined').length : -1, srcs = r.perf.bootT ? DESK.filter(f => r.perf.bootT.scripts.some(s => reqPath(s) === f)).length : -1;
      const gate = new RegExp('phone=false.*written=' + DESK.length + '$').test(r.gate || '');
      return { all, ok200, g, srcs, gate, bad: r.bad.length, ok: all && ok200 && gate && srcs === DESK.length && g > 0 && r.bad.length === 0, what }; };
    const a = await run(browser, here.port, 'narrowNoTouch'), ja = judge3(a, 'narrow, no touch'), sa = starts(a);
    S(`§W-DESK-HINTS H3a ${ja.ok ? 'PASS' : 'FAIL'} narrow (${a.perf.scr}px) WITHOUT touch: caps=${a.perf.caps}; hint media matches=${a.perf.mm} (so no early hint); each desk file requested once=${ja.all}, answered 200=${ja.ok200}; ${ja.srcs}/${DESK.length} desk <script> elements at initViewer; ${ja.g} of ${ENTRY_GLOBALS.length} entry globals defined at initViewer; ${a.gate}; page errors=${ja.bad}; first desk start ${f1(sa.deskFirst)} ms (late, as expected: written by _desk)`);
    const b = await run(browser, here.port, 'wideTouch', { settleMs: 8000 }), jb = judge3(b, 'wide, touch'), sb = starts(b), unused = b.warns.filter(w => /preload/i.test(w) && /not used/i.test(w)).length;
    const okb = jb.ok && unused === 0 && b.perf.mm; S(`§W-DESK-HINTS H3b ${okb ? 'PASS' : 'FAIL'} wide (${b.perf.scr}px) WITH touch: caps=${b.perf.caps}; hint media matches=${b.perf.mm}; each desk file requested once=${jb.all}, answered 200=${jb.ok200}; ${jb.srcs}/${DESK.length} desk <script> elements at initViewer; ${jb.g} of ${ENTRY_GLOBALS.length} entry globals defined; ${b.gate}; page errors=${jb.bad}; 'preloaded but not used' warnings=${unused}; first desk start ${f1(sb.deskFirst)} ms (static start ${f1(sb.staticFirst)})`);
    // the probe says "not a phone" in both, the hint disagrees in (a) only: neither is wrong, every file ran in both
    note('H3', ja.ok && okb && !a.perf.mm ? 'PASS' : 'FAIL', `(a) narrow without touch: hint ${a.perf.mm ? 'MATCHES (unexpected)' : 'does not match'}, probe phone=false, all ${DESK.length} files loaded and ran: ${ja.ok}; (b) wide with touch: hint matches=${b.perf.mm}, probe phone=false, all files fetched, ran, 0 unused-preload warnings: ${okb}`);
  }
  // ---- H4 desktop behaviour unchanged: the existing witness, one group at a time
  if (want('H4')) {
    const dir = process.env.AXE_LOG_DIR || path.join(os.tmpdir(), 'wdh_axe'); fs.mkdirSync(dir, { recursive: true });
    const GROUPS = [['rules', '424473b0^'], ['film,filmsound', '125e0c3c^'], ['fourd', '8d634e19^'], ['still', '19e42123']];
    let allD1 = true;
    for (const [g, ref] of GROUPS) {
      const logf = path.join(dir, 'axe_' + g.replace(',', '_') + '.log');
      if (!(process.env.REUSE_AXE === '1' && fs.existsSync(logf))) {
        S(`§W-DESK-HINTS H4 running witness_phone_axe.js --group ${g} BASE_REF=${ref} -> ${logf}`);
        const r = cp.spawnSync('node', [path.join(__dirname, 'witness_phone_axe.js'), '--group', g], { cwd: ROOT, env: Object.assign({}, process.env, { BASE_REF: ref, PHONE_AXE_LOG: logf + '.own' }), encoding: 'utf8', maxBuffer: 1 << 28, timeout: 40 * 60 * 1000 });
        fs.writeFileSync(logf, (r.stdout || '') + (r.stderr || ''));
      }
      const tx = fs.readFileSync(logf, 'utf8'), lines = tx.split('\n').filter(l => /§W-PHONE-AXE (P\d\w*|D\d|R\d)\b|^§W-PHONE-AXE group=/.test(l)), d1 = lines.find(l => /§W-PHONE-AXE D1 /.test(l)), fin = lines.find(l => /^§W-PHONE-AXE group=/.test(l));
      lines.forEach(l => S('   [axe ' + g + '] ' + l.slice(0, 260)));
      const ok = !!d1 && /D1 PASS/.test(d1); allD1 = allD1 && ok;
      S(`§W-DESK-HINTS H4 group=${g} base_ref=${ref} D1=${d1 ? (ok ? 'PASS' : 'NOT-PASS') : 'MISSING'} final: ${fin || 'MISSING'}`);
    }
    note('H4', allD1 ? 'PASS' : 'FAIL', 'D1 of witness_phone_axe.js in all four groups (rules, film+filmsound, fourd, still)');
  }
  // ---- H5 timing
  let h5 = null;
  if (want('H5')) {
    const trees = { V0: treeOf(V0_REF), V1: treeOf(V1_REF), V6: ROOT }, sv = {}; for (const k of Object.keys(trees)) sv[k] = await serve(trees[k]);
    const VARS = ['V0', 'V1', 'V6'], rows = []; let wasteLoad = [];
    for (let i = 0; i < ROUNDS; i++) {
      if (i % 5 === 0) await waitLoad('batch ' + (i / 5 + 1));
      const order = VARS.map((_, k) => VARS[(k + i) % VARS.length]), row = { round: i + 1 };   // rotated every round: each variant takes every position equally
      for (const v of order) { const L = loadNow(), r = await run(browser, sv[v].port, 'desktop', { settleMs: 1500 }); row[v] = { ms: r.ms, load1: +L.toFixed(2), di: r.perf.domInteractive, st: starts(r), bad: r.bad.length };
        S(`§W-DESK-HINTS H5 round=${i + 1}/${ROUNDS} ${v} pos=${order.indexOf(v)} initViewer_ms=${r.ms} domInteractive=${r.perf.domInteractive} first_desk_start=${f1(row[v].st.deskFirst)} load1=${L.toFixed(2)} bad=${r.bad.length}`); await sleep(3000); }
      rows.push(row);
    }
    for (const k of VARS) sv[k].srv.close();
    const cut = (rs, label) => {
      const ok = rs.filter(r => VARS.every(v => Number.isFinite(r[v].ms))); if (!ok.length) return null;
      const d = (a, b) => ok.map(r => r[a].ms - r[b].ms), line = (a, b) => { const x = d(a, b); return `${a}-${b}: median ${median(x)} [q25 ${quant(x, .25)} .. q75 ${quant(x, .75)}] min ${Math.min(...x)} max ${Math.max(...x)} ${a} slower in ${x.filter(z => z > 0).length}/${x.length} rounds, faster in ${x.filter(z => z < 0).length}`; };
      S(`§W-DESK-HINTS H5 ${label} rounds=${ok.length}: medians V0=${median(ok.map(r => r.V0.ms))} V1=${median(ok.map(r => r.V1.ms))} V6=${median(ok.map(r => r.V6.ms))}; domInteractive medians V0=${median(ok.map(r => r.V0.di))} V1=${median(ok.map(r => r.V1.di))} V6=${median(ok.map(r => r.V6.di))}; first desk start medians V0=${f1(median(ok.map(r => r.V0.st.deskFirst)))} V1=${f1(median(ok.map(r => r.V1.st.deskFirst)))} V6=${f1(median(ok.map(r => r.V6.st.deskFirst)))}`);
      S(`§W-DESK-HINTS H5 ${label} ${line('V6', 'V1')}`); S(`§W-DESK-HINTS H5 ${label} ${line('V6', 'V0')}`); S(`§W-DESK-HINTS H5 ${label} ${line('V1', 'V0')}`);
      return { ok, faster: d('V6', 'V1').filter(z => z < 0).length, med61: median(d('V6', 'V1')), med60: median(d('V6', 'V0')) };
    };
    const all = cut(rows, 'all'), quiet = cut(rows.filter(r => VARS.every(v => r[v].load1 <= 5)), 'started-at-load<=5');
    S(`§W-DESK-HINTS H5 loads: ${rows.map(r => VARS.map(v => r[v].load1).join('/')).join(' ')}`);
    h5 = all;
    if (!all) note('H5', 'INCONCLUSIVE', 'no round with three finite timings');
    else note('H5', all.med61 < 0 && all.faster >= Math.ceil(ROUNDS * 2 / 3) ? 'PASS' : 'FAIL', `V6-V1 median ${all.med61} ms, V6 faster than V1 in ${all.faster}/${all.ok.length} rounds (need median < 0 and >= ${Math.ceil(ROUNDS * 2 / 3)}); V6-V0 median ${all.med60} ms (reported only); quiet cut (every run started at load <= 5): ${quiet ? quiet.ok.length + ' rounds, V6-V1 median ' + quiet.med61 + ', faster in ' + quiet.faster : 'no such round'}`);
  }
  // ---- red controls
  const red = [];
  if (want('R1')) {
    const ov = mutatePage(b => b.replace(/ media="\(min-device-width: 1024px\)"/g, '')), s = await serve(ROOT, ov), r = await run(browser, s.port, 'phone'), j = judgeH1(r); s.srv.close();
    const det = !j.ok && j.requested > 0 && R.H1 && R.H1.ok; red.push(det);
    note('R1', det ? 'DETECTED' : 'NOT-DETECTED', `media attribute removed from every hint: the same H1 judge says ${j.ok ? 'PASS' : 'FAIL'} (${j.requested} of ${j.population} desk files requested by the phone; ${r.gate})`);
  }
  if (want('R2')) {
    const ov = mutatePage(b => b.replace(/<link rel="preload" as="script"[^>]*>\n/g, '')), s = await serve(ROOT, ov), runs = [];
    for (let i = 0; i < TIMING_RUNS; i++) { runs.push(await run(browser, s.port, 'desktop', { settleMs: 2500 })); await sleep(2500); } s.srv.close();
    const j = judgeH2(runs, baseRuns), det = !j.ok && R.H2 && R.H2.ok; red.push(det);
    note('R2', det ? 'DETECTED' : 'NOT-DETECTED', `hints removed: the same H2 judge says ${j.ok ? 'PASS' : 'FAIL'} (first-desk-start minus first-static-start median ${f1(j.mine)} ms vs ${f1(j.theirs)} on the pre-gate page; once=${j.once})`);
  }
  await browser.close(); here.srv.close();
  const checks = res.filter(x => /^H\d$/.test(x.id)), fail = checks.filter(x => x.state === 'FAIL').length, inc = checks.filter(x => x.state === 'INCONCLUSIVE').length + (red.length && red.some(x => !x) ? 1 : 0);
  const full = !ONLY.length, verdict = fail ? 'FAIL' : (inc || !full || checks.length < 5) ? 'INCONCLUSIVE' : 'PASS';
  S(`§W-DESK-HINTS checks=${checks.length} fail=${fail} red=${red.filter(Boolean).length}/${red.length || 2} verdict=${verdict}${full ? '' : ' (partial run: ONLY=' + ONLY.join(',') + ')'}`);
  fs.writeFileSync(LOG, out.join('\n') + '\n');
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(e => { console.log('§W-DESK-HINTS CRASH ' + (e && e.stack || e)); process.exit(2); });
