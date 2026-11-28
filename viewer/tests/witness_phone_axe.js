// ⚠ DO NOT REMOVE — WITNESS W-PHONE-AXE (bim-compiler prompts/MOBILE_PERF.md "WO-2": the phone gate, proven on one group). READ THE LOG after every run; the exit code is not evidence.
// ISSUE THIS PROVES OR DISPROVES: "a phone downloads (and runs) feature files it can never use". After the gate, the files of ONE flagged group (here `rules`: structural_sanity.js, egress_sanity.js,
//   rule_report.js, rule_checklist.js — the modules with "phone": false + "phoneGroup": "rules" in viewer/modules.json) are written by viewer/viewer.html's `_desk(i)` only when window._caps.phone is false.
// Two profiles on the Duplex (phone = the profile witness_mobile_p1.js uses; desktop = default 1400x900). Service workers are BLOCKED in every run: this judges the PAGE's own requests; what the
//   service worker precaches on a phone is WO-10's question (the files stay precached on purpose, so offline desktop keeps working).
//   BASELINE = origin/main as this branch started from / was merged with (BASE_REF = git merge-base HEAD origin/main): the files this branch changed are served from `git show <BASE_REF>:<path>` (the rest is the same tree), plus the one `§BOOT_T` line WO-2 step 6 adds to main.js
//   (so D2's "before" is origin/main + step 6 only). The baseline is run twice (A, A') and its two runs are compared first: whatever differs between two runs of the SAME code is noise and is not judged.
//   P1  phone: zero requests for any file of the group (population = the group's files, > 0 else INCONCLUSIVE); §DESK_GATE phone=true written=0; document.scripts holds none of them
//   P2  phone: no page error, no ReferenceError, no §LOAD_FAIL, no §INIT_VIEWER_TIMEOUT; §BOOT_T printed; the viewer reached ready
//   P3  phone, RESULTS not just "no error": the § tags (+ their numeric fields) logged by boot -> building loaded -> Walk -> one pick -> the Issue Log, branch vs origin/main: equal, except the tags
//       that only a file of the group can log (each proven by grep: no kept file contains the tag). INCONCLUSIVE when no pick / no Issue Log happened (a vacuous run)
//   D1  desktop: every file of the group is requested ONCE; the group's setup functions are functions when initViewer starts (§BOOT_T moment); document.scripts = baseline's, same order, config.js aside;
//       the boot § tag list = the baseline's (apart from §DESK_GATE and §BOOT_T)
//   D2  desktop boot time, cache disabled: §BOOT_T initViewer_ms, 5 runs before (origin/main + step 6) and 5 after, interleaved; the after MEDIAN must not exceed the before MAXIMUM; all ten printed
//   R1  RED: the phone test removed from `_desk` (a copy of the page) -> P1 must FAIL
//   R2  RED: one guard of step 4 removed (main.js: `if (typeof setupRuleChecklist === 'function')`) -> P2 must FAIL on the phone
//   R3  RED: two desk literals of one run swapped in a copy of modules.json where a deps edge joins them -> the order check must FAIL (INCONCLUSIVE when the group has no such edge)
// WO-4 (film + filmsound) changes to this witness:  groups are passed as `--group film,filmsound` (or env GROUP=; a comma list is judged together; BASE_REF=424473b0^ judges `rules` against the page before WO-2);
//   P3 now ENTERS Walk for real (APP.toggleWalkMode() shows the anchor prompt, APP.setWalkAnchor() sets A.walkModeActive, walk.js:25-70; 3 steps) and requires walk_active=true in EVERY run, before and after the Issue Log, else P3 is INCONCLUSIVE;
//   P3 also opens the Find panel and runs one search ("Door"), runs the Ask answer exit_path on the Terminal (the Duplex and Clinic carry no walkable raster: INCONCLUSIVE on the baseline too), opens the Clash list (MEP|ARC) and a `#clash=` deep link
//   on the Duplex pair the list gave, and compares each RESULT (rows + text / verdict + summary + value / row text / camera + target + pair count) with the baseline phone's;
//   P4 (new): the group's Help-list rows are listed by the baseline phone and not by the gated phone; §EFFECTS_SKIP is in the phone log before and after, no §SPLIT_PART_MISSING, A.toggleSSAO / A.setOutline are functions; Alt+C / v / Alt+P keydown leave no §KBD_ROUTE line (dead on a phone);
//   R2 is per group (RED2 table), R4 (film): the phone filter of effects.js removed -> P4 must FAIL. D1 judges an on-demand flagged file by the baseline's request count and counts `written=` over every desk file.
// WO-5 (fourd) changes to this witness:  the group's entry names (it has no setup function: D1 reads the globals kept code calls, from the census) must be defined when initViewer starts on a desktop;
//   P3 gains the Find "› ERP" push leg (a kept phone feature that calls proj_fold -> ScheduleAuthor.classify: run on both phones, the §PROJ_PUSH line and the status text must be equal; red control R6 = the schedule_author.js tag removed);
//   P4 gains the phone UI probe (rail pills, the Inspect drawer, the Export menu rows, the Ask suggestions, the Find lens probe, the dead keys incl. `t`) and the Find "⏱ View at this moment" button (shown by the baseline phone once the push made a
//   twin, hidden by the gated phone, the rest of the Find info panel equal); R2 has one mutation per hidden control (a list), P4's `ui` part judges them.
// WO-6 (still: Alt+S lighting / GI / sky / glass) changes to this witness:  P3 gains the RENDER-NUMBERS leg (a fixed camera on the loaded building, phone profile: unique materials, distinct shader programs, renderer.info.render calls + triangles of one frame,
//   which THREE.ShaderChunk entries differ (the cause of any different program SOURCE), a coarse 8x8 luminance grid as a measurement; triangles and materials must be equal, a different program count is printed with its cause), the KEYS leg (every
//   window / APP name the baseline phone has and the gated phone lacks must appear in a file of the gated group: nothing else may go missing) and the SAVE leg (the phone's real APP.saveModelDb() with a light_field_cache row put in the
//   building: a current row is carried exactly as the baseline phone carries it); the group's Help row (Populate) is judged by P4; D2 is also run against the page before any gate (PRE_REF, default 424473b0^), all numbers printed, judged only
//   against the order's own start. R2 has one mutation per control / kept-feature guarantee (warning guard, Help row, save guard, light_law.js tag, surface_r10.js tag). R4 (the effects phone filter) runs for `still` too.
//   NEVER dispatched: Alt+S / Alt+G / Alt+J (they start the still, a GI preview): their phone path is judged by reading the code and by the §SHORTCUT_AUDIT dead= count only.
// VERDICT: §W-PHONE-AXE group=<g> checks=<n> fail=<n> inconclusive=<n> verdict=PASS|FAIL|INCONCLUSIVE   (PASS allows ONLY the R3 "no deps edge in the group" inconclusive; any other inconclusive = INCONCLUSIVE)
// Run:  node viewer/tests/witness_phone_axe.js --group rules   (env: GROUP=rules  BASE_REF=<default: the merge-base of HEAD and origin/main, i.e. origin/main once it is merged in>  PW=<playwright path>  PHONE_AXE_LOG=<file>  TIMING_RUNS=5)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const argOf = n => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };   // --group film,filmsound  (a comma list = several groups judged together; env GROUP= still works)
const GROUPS = (argOf('--group') || process.env.GROUP || 'rules').split(',').map(s => s.trim()).filter(Boolean), GROUP = GROUPS.join('+');
const ROOT = path.join(__dirname, '..', '..'), BASE_REF = process.env.BASE_REF || cp.execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], { cwd: path.join(__dirname, '..', '..') }).toString().trim(), TIMING_RUNS = +(process.env.TIMING_RUNS || 5);
const LOG = process.env.PHONE_AXE_LOG || path.join(__dirname, 'witness_phone_axe.log');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.sql': 'text/plain', '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
const URL_PATH = '/viewer/viewer.html?db=buildings/Duplex_extracted.db';
const PHONE = { viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true, serviceWorkers: 'block',
  userAgent: 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36' };
const DESKTOP = { viewport: { width: 1400, height: 900 }, serviceWorkers: 'block' };
const LAUNCH = { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] };   // the options witness_boot_cpe_lazy.js uses: no GPU flags added, never headed

const ONLY = process.env.ONLY || '';   // debugging aid: ONLY=D1 (or P, D2, R) runs just those sections; the verdict is then never PASS
const out = []; const S = m => { out.push(m); console.log(m); };
const git = (args, opt) => cp.execFileSync('git', args, Object.assign({ cwd: ROOT, maxBuffer: 1 << 28 }, opt || {}));
const res = [];   // {id, state, why}
const note = (id, state, why) => { res.push({ id, state, why }); S(`§W-PHONE-AXE ${id} ${state} ${why}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const median = a => { const s = a.slice().sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

// ---- the group, from the manifest
const MAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'modules.json'), 'utf8'));
const GROUP_FILES = Object.entries(MAN.modules).filter(([, v]) => v.phone === false && GROUPS.includes(v.phoneGroup)).map(([f]) => f).sort();
// the Help-list rows (command palette) that belong to a group: listed by the baseline phone, NOT by the gated phone (a row whose code a phone does not load is not listed), still listed by a desktop
const GROUP_ROWS = { rules: ['Sanity', 'Egress'], film: ['MaxQ Movie'], filmsound: ['Sound FX'], fourd: ['Time Machine', '4D Window'], still: ['Populate'] };
// a group with no `setup*` function (fourd): D1 reads the globals KEPT code calls when they exist (the census's §PHONE_BARE names defined in the group's files) — all must be defined when initViewer starts on a desktop
const GROUP_ENTRIES = { fourd: ['toggleTimeMachine', 'tmGetState', 'tmJumpToElement', 'tmJumpToPhase', 'tmGenerateTimeline', 'tmRefoldSchedule', 'tmResweep', 'ScheduleRead4D', 'ScheduleSync', 'Info4DPanel', 'ScheduleInject'], still: ['SkyOcc', 'SourcedLight', 'ShadowCascade', 'LightZones'] };   // still: the globals scene.js / main.js / tools.js / streaming.js read (census §PHONE_BARE); setupGIPoc is found by the `setup*` scan
const ROWS = [].concat(...GROUPS.map(g => GROUP_ROWS[g] || []));
// ONE mutation per group for the red control R2 (a guard of the group's own step removed): `must` = which phone check has to catch it
const RED2 = { rules: { file: 'viewer/main.js', from: "if (typeof setupRuleChecklist === 'function') setupRuleChecklist(APP);", to: 'setupRuleChecklist(APP);', must: 'P2', re: /setupRuleChecklist/ },
  film: { file: 'viewer/main.js', from: 'setupHoverName, window.setupCpeRoomTitle,', to: 'setupHoverName, setupCpeRoomTitle,', must: 'P2', re: /setupCpeRoomTitle/ },
  filmsound: { file: 'viewer/panels.js', from: "key: 'v', pill: false, platform: 'desktop',", to: "key: 'v', pill: false,", must: 'P4', re: /Sound FX/ },
  // fourd: one mutation per hidden control / kept-feature guarantee of WO-5; `must` = the check that has to catch it
  fourd: [{ file: 'viewer/panels.js', from: "key: 't', pill: false, platform: 'desktop',", to: "key: 't', pill: false,", must: 'P4', re: /Time Machine/ },
    { file: 'viewer/find_ask_grammar.js', from: 'var NO_PHONE = window._isMobile ? { schedule_4d: 1 } : {};', to: 'var NO_PHONE = {};', must: 'P4ui', re: /ask/ },
    { file: 'viewer/export_menu.js', from: "!(window._isMobile && it.key === 'schedule')", to: 'true', must: 'P4ui', re: /export/ },
    { file: 'viewer/find_erp_push.js', from: '      } else P.render(A, guid);', to: '        return;\n      }\n      P.render(A, guid);', must: 'P4jump', re: /info/ },
    { file: 'viewer/scene.js', from: "'t':  function() { A._pillRun('tm'); },", to: "'t':  function() { if (typeof toggleTimeMachine === 'function') toggleTimeMachine(); },", must: 'P3', re: /SHORTCUT/ },
    { file: 'viewer/viewer.html', edit: tx => { const m = /<script src="schedule_author\.js\?v=[0-9a-f]{8}"[^>]*><\/script>\n/.exec(tx); if (!m) throw new Error('R6: the schedule_author.js tag is not where the witness expects it'); return tx.replace(m[0], ''); }, must: 'P3push', re: /classify/ }] };
// still (WO-6): one mutation per hidden control / kept-feature guarantee; `must` = the check that has to catch it (P3warn: a § warning the baseline phone never printed; P3save: the saved light_field_cache row; P3render: materials / triangles of the render leg)
RED2.still = [{ file: 'viewer/scene.js', from: "else if (!_noStill) console.warn('§SOURCED_LIGHT not loaded", to: "else console.warn('§SOURCED_LIGHT not loaded", must: 'P3warn', re: /§SOURCED_LIGHT not loaded/ },
  { file: 'viewer/scene.js', from: "if (!window._isMobile) all.push({ seq: 'ALT+P'", to: "all.push({ seq: 'ALT+P'", must: 'P4', re: /Populate/ },
  { file: 'viewer/scene.js', from: "if (!LZ && window._caps && window._caps.phone) {", to: "if (false) {", must: 'P3save', re: /light_field/ },
  { file: 'viewer/viewer.html', edit: tx => { const m = /<script src="light_law\.js\?v=[0-9a-f]{8}"[^>]*><\/script>\n/.exec(tx); if (!m) throw new Error('R2: the light_law.js tag is not where the witness expects it'); return tx.replace(m[0], ''); }, must: 'P2', re: /LightLaw|SCENE|toneConst|reading 'S/ },
  { file: 'viewer/viewer.html', edit: tx => { const m = /<script src="surface_r10\.js\?v=[0-9a-f]{8}"[^>]*><\/script>\n/.exec(tx); if (!m) throw new Error('R2: the surface_r10.js tag is not where the witness expects it'); return tx.replace(m[0], ''); }, must: 'P3render', re: /material/ }];
const GROUP_BASE = GROUP_FILES.map(f => path.posix.basename(f));
const LAZY_BASE = new Set(GROUP_FILES.filter(f => MAN.modules[f].load === 'lazy').map(f => path.posix.basename(f)));   // flagged files an on-demand loader fetches (e.g. cinema_path_editor.js): requested 0 times at boot on every device, nothing to gate
const isGroupUrl = u => GROUP_BASE.some(b => new RegExp('/' + b.replace(/\./g, '\\.') + '(\\?|$)').test(u));

// ---- the servers: the branch tree, and the same tree with the changed files taken from BASE_REF
const changed = git(['diff', '--name-only', BASE_REF]).toString().split('\n').filter(Boolean);
const BOOT_T_LINE = "  console.log('§BOOT_T initViewer_ms=' + Math.round(performance.now()));   // MOBILE_PERF WO-2 step 6: the clock the phone-gate witness (D2) reads; first statement on purpose\n";
/** the branch tree with every file that differs from `ref` served as `git show <ref>:<path>` (the rest is the same tree), plus the one `§BOOT_T` line WO-2 step 6 adds to main.js (so D2's "before" is `ref` + step 6 only) */
function makeOverlay(ref) {
  const names = ref === BASE_REF ? changed : git(['diff', '--name-only', ref]).toString().split('\n').filter(Boolean);
  const show = p => { try { return git(['show', ref + ':' + p], { stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { return null; } };
  const ov = new Map();   // path -> Buffer | null (null: the file does not exist at `ref`)
  for (const p of names) ov.set(p, show(p));
  const m = ov.get('viewer/main.js') || show('viewer/main.js'); let tx = m.toString('utf8');
  if (!tx.includes('§BOOT_T')) { const a = 'async function initViewer() {\n'; if (!tx.includes(a)) throw new Error('initViewer not found in the main.js of ' + ref); tx = tx.replace(a, a + BOOT_T_LINE); }
  ov.set('viewer/main.js', Buffer.from(tx, 'utf8'));
  return ov;
}
const baseText = p => { try { return git(['show', BASE_REF + ':' + p], { stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { return null; } };
const overlayBase = makeOverlay(BASE_REF);
function serve(overlay, delayMs, jsOnly) {   // delayMs: every response is held back this long (the baseline under a different timing: tags that move are asynchronous by nature)
  const srv = http.createServer((req, res0) => {
    const res = delayMs && (!jsOnly || /\.js$/.test(req.url.split('?')[0])) ? { writeHead: (...a) => { res0._h = a; }, end: b => setTimeout(() => { res0.writeHead(...(res0._h || [200])); res0.end(b); }, delayMs) } : res0;
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
    const rel = p.replace(/^\//, '');
    if (overlay && overlay.has(rel)) { const b = overlay.get(rel); if (b == null) { res.writeHead(404); res.end('404 (not at the baseline) ' + p); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(b); return; }
    fs.readFile(path.join(ROOT, p), (e, buf) => { if (e) { res.writeHead(404); res.end('404 ' + p); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf); });
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ srv, port: srv.address().port })));
}
const withOverride = (base, rel, fn) => { const m = new Map(base || []); const cur = m.has(rel) ? m.get(rel) : fs.readFileSync(path.join(ROOT, rel)); m.set(rel, Buffer.from(fn(cur.toString('utf8')), 'utf8')); return m; };

// ---- one page run
async function waitReady(page, tries) {
  for (let i = 0; i < (tries || 150); i++) { await page.waitForTimeout(1000);
    const ok = await page.evaluate(() => !!(window.APP && window.APP.guidMap && Object.keys(window.APP.guidMap).length > 0 && window.APP.streaming === false && window._mainPillActions && window._mainPillActions.length > 0)).catch(() => false);
    if (ok) return true; }
  return false;
}
async function tapEl(page, sel) {
  const pt = await page.evaluate(s => { const r = document.querySelector(s); if (!r || !r.offsetWidth) return null; r.scrollIntoView({ block: 'center' }); const q = r.getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; }, sel);
  if (!pt) return false; await page.waitForTimeout(150); await page.touchscreen.tap(pt[0], pt[1]); return true;
}
/** One browser page. opts.phone, opts.steps (Walk -> pick -> Issue Log), opts.noCache, opts.bootTOnly (stop at §BOOT_T). Returns everything the claims read. */
async function run(browser, port, opts) {
  const ctx = await browser.newContext(opts.phone ? PHONE : DESKTOP), page = await ctx.newPage(), cons = [], reqs = [], errs = [];
  page.on('console', m => cons.push(m.text())); page.on('request', q => reqs.push(q.url())); page.on('pageerror', e => errs.push(String(e.message).slice(0, 240)));
  if (opts.noCache) { const c = await ctx.newCDPSession(page); await c.send('Network.setCacheDisabled', { cacheDisabled: true }); }
  // the moment initViewer starts (its first statement logs §BOOT_T): which setup functions of the group exist then
  await page.addInitScript(names => { const ol = console.log.bind(console); console.log = function () { const t = arguments[0];
    if (typeof t === 'string' && t.charAt(0) === '§' && document.currentScript) (window.__syncLog = window.__syncLog || []).push(t.split(/[\s=]/)[0]);   // logged WHILE a classic script runs = parse-time, in a deterministic order (an async callback has no currentScript)
    if (typeof t === 'string' && t.indexOf('§BOOT_T') === 0) window.__bootT = { setups: names.map(n => [n, typeof window[n]]), scripts: [...document.scripts].map(s => s.src).filter(x => x && !/^blob:/.test(x)) };
    return ol.apply(console, arguments); }; }, window_setup_names().concat(window_entry_names()));
  await page.goto('http://127.0.0.1:' + port + URL_PATH, { waitUntil: 'domcontentloaded' });
  const r = { cons, reqs, errs, ready: false, steps: {} };
  if (opts.bootTOnly) { for (let i = 0; i < 90 && !cons.some(t => t.indexOf('§BOOT_T') === 0); i++) await sleep(500); await ctx.close(); return r; }
  r.ready = await waitReady(page);
  r.scripts = await page.evaluate(() => [...document.scripts].map(s => s.src).filter(Boolean)).catch(() => []);
  r.bootT = await page.evaluate(() => window.__bootT || null).catch(() => null);
  r.syncTags = await page.evaluate(() => window.__syncLog || []).catch(() => []);
  if (r.ready && opts.render) {   // WO-6: the RENDER NUMBERS of the loaded building on a fixed camera (a clone of the app's own camera at load) — numbers, not pixels, apart from the coarse luminance grid (a measurement)
    r.keys = await page.evaluate(() => ({ win: Object.getOwnPropertyNames(window).filter(k => !/^(webkit|on)/.test(k)), app: Object.keys(window.APP) })).catch(() => null);
    r.render = await page.evaluate(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms)); await sleep(2500);
      const A = window.APP, R = A.renderer, T = window.THREE, hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
      const mats = new Set(); let meshes = 0, drawn = 0;
      A.scene.traverse(o => { const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach(x => mats.add(x)); if (o.isMesh) { meshes++; drawn += o.isInstancedMesh ? o.count : 1; } });
      const cam = A.camera.clone(); cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
      R.render(A.scene, cam); await sleep(800); R.render(A.scene, cam);   // warm-up: every program this frame needs is compiled
      const programs = R.info.programs ? R.info.programs.length : -1, byName = {}; (R.info.programs || []).forEach(p => { const n = p.name || '?'; byName[n] = (byName[n] || 0) + 1; });
      R.info.reset(); R.render(A.scene, cam);
      const info = { calls: R.info.render.calls, triangles: R.info.render.triangles, lines: R.info.render.lines, points: R.info.render.points };
      const W = 256, H = 144, rt = new T.WebGLRenderTarget(W, H, { type: T.UnsignedByteType }), prevRT = R.getRenderTarget(), buf = new Uint8Array(W * H * 4);   // offscreen at the same camera (the canvas itself is cleared once presented): a measurement taken AFTER the counts above
      R.setRenderTarget(rt); R.render(A.scene, cam); R.readRenderTargetPixels(rt, 0, 0, W, H, buf); R.setRenderTarget(prevRT); rt.dispose();
      const G = 8, grid = []; for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) { let s = 0, n = 0; for (let y = Math.floor(gy * H / G); y < Math.floor((gy + 1) * H / G); y++) for (let x = Math.floor(gx * W / G); x < Math.floor((gx + 1) * W / G); x++) { const i = (y * W + x) * 4; s += (buf[i] + buf[i + 1] + buf[i + 2]) / 3; n++; } grid.push(+(s / n).toFixed(2)); }
      const chunks = {}; for (const k of Object.keys(T.ShaderChunk)) chunks[k] = hash(String(T.ShaderChunk[k]));
      const pos = A.camera.position.toArray().map(v => +v.toFixed(3));
      return { materials: mats.size, meshes, drawn, programs, byName, info, grid, chunks, cam: pos, bufW: W, bufH: H, mem: { geometries: R.info.memory.geometries, textures: R.info.memory.textures },
        windowsSplit: (A._r10State && A._r10State.win) ? A._r10State.win.clean : null, surfaceRules: A._surfRules === true }; }).catch(e => ({ err: String(e && e.message).slice(0, 160) }));
  }
  if (r.ready && opts.steps) {
    r.mark = { building: cons.length };
    // WO-4 step 5 (the WO-2 weakness): Walk must really be ENTERED. toggleWalkMode() alone only shows the anchor prompt (walk.js:25-31); the Walk button's second tap is setWalkAnchor() (walk.js:37-70), which sets A.walkModeActive.
    await page.evaluate(() => { APP.toggleWalkMode(); }); await page.waitForTimeout(400);
    r.steps.walkPrompt = await page.evaluate(() => { const e = document.getElementById('walk-anchor-prompt'); return !!(e && e.style.display === 'block'); });
    await page.evaluate(() => { APP.setWalkAnchor(); }); await page.waitForTimeout(800);
    await page.evaluate(() => { for (let k = 0; k < 3; k++) APP.advanceWalkStep(); }); await page.waitForTimeout(500);
    r.steps.walk = await page.evaluate(() => APP.walkModeActive === true); r.mark.walk = cons.length;
    r.walkCam = await page.evaluate(() => APP.camera.position.toArray().map(v => +v.toFixed(3)));
    const pts = [[0.5, 0.5], [0.4, 0.55], [0.6, 0.5], [0.5, 0.4], [0.3, 0.6], [0.7, 0.6], [0.5, 0.65], [0.45, 0.35]];
    r.steps.pick = false;
    for (const [fx, fy] of pts) { const before = cons.length; await page.touchscreen.tap(Math.round(PHONE.viewport.width * fx), Math.round(PHONE.viewport.height * fy)); await page.waitForTimeout(900);
      if (cons.slice(before).some(t => /^§PICK hits=[1-9]/.test(t))) { r.steps.pick = true; break; } }
    r.mark.pick = cons.length;
    const railUp = await page.evaluate(() => { const p = document.getElementById('pill-inspect'); return !!(p && p.offsetWidth); });
    const fab = railUp || await tapEl(page, '#mobile-trigger'); await page.waitForTimeout(500);
    const pill = fab && await tapEl(page, '#pill-inspect'); await page.waitForTimeout(500);
    const row = pill && await tapEl(page, '#drawer-row-issues'); await page.waitForTimeout(1200);
    r.steps.issues = await page.evaluate(() => { const p = document.getElementById('issues-panel'); return !!(p && p.classList.contains('active')); }); r.mark.issues = cons.length;
    r.steps.walkAfter = await page.evaluate(() => APP.walkModeActive === true);   // Walk is still on after the pick and the Issue Log (the Find panel below leaves Walk, nf_panel_search.js:62-71)
    await page.waitForFunction(() => typeof XLSX !== 'undefined', null, { timeout: 20000 }).catch(() => {});   // the Issue Log loads SheetJS on demand (excel.js): wait for it in every run, so its § line is not a race
    await page.waitForTimeout(1000);
    // WO-4 step 5: the Find panel + one search (the Find lane is a KEPT phone feature), then the Ask answer "exit_path" (find_ask.js runExit -> A.escapeRouteBuild, a film-group file the rule-4 census line points at)
    r.mark.findStart = cons.length;
    r.find = await page.evaluate(async () => {
      if (typeof APP.openFindPanel !== 'function') return null;
      APP.openFindPanel('Door');
      for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 500)); const p = document.getElementById('find-panel'), n = document.getElementById('find-results'); if (p && p.style.display === 'block' && n && n.children.length > 0) break; }
      await new Promise(r => setTimeout(r, 1500));
      const p = document.getElementById('find-panel'), n = document.getElementById('find-results');
      return { open: !!(p && p.style.display === 'block'), rows: n ? n.children.length : -1, text: p ? p.innerText.replace(/\s+/g, ' ').slice(0, 1200) : '' }; }).catch(e => ({ err: String(e.message).slice(0, 120) }));
    r.mark.find = cons.length;
    r.ask = await page.evaluate(async () => {
      for (let i = 0; i < 60 && !(window.FindAsk && window.FindAsk.catalog); i++) await new Promise(r => setTimeout(r, 500));
      const c = window.FindAsk && window.FindAsk.catalog && window.FindAsk.catalog.find(x => x.id === 'exit_path'); if (!c) return null;
      try { const a = await Promise.race([c.run({}), new Promise((_, rj) => setTimeout(() => rj(new Error('timeout 90 s')), 90000))]);
        return { verdict: a.verdict, summary: a.summary, value: JSON.stringify(a.value === undefined ? null : a.value).slice(0, 400), tags: (a.evidence || []).map(e => e.tag).join(','), sources: JSON.stringify(a.sources || {}).slice(0, 300) }; }
      catch (e) { return { err: String(e && e.message).slice(0, 160) }; } }).catch(e => ({ err: String(e.message).slice(0, 120) }));
    r.mark.ask = cons.length;
    // the Clash list (a KEPT phone feature; measure.js:723 reads A.clashLabels.factRow of clash_labels.js for every narrow-phase CLASH row): the matrix cell, the list's rows, the text after the narrow phase answered, the first pair's guids (for the deep link run)
    r.clash = await page.evaluate(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      window._shortcuts.c(); for (let i = 0; i < 80 && !(APP._clashMatrixDiv && APP._clashMatrixDiv.querySelector('[data-pair]')); i++) await sleep(250);
      await sleep(1500);
      const m = APP._clashMatrixDiv; if (!m) return { err: 'no matrix' };
      const c = m.querySelector('[data-pair="MEP|ARC"]') || m.querySelector('[data-pair="ARC|MEP"]') || m.querySelector('[data-pair]'); if (!c) return { err: 'no pair cell' };
      const pair = c.getAttribute('data-pair'); c.click();
      for (let i = 0; i < 120 && !(APP._clashListDiv && APP._clashListDiv.querySelector('[data-clash-idx]')); i++) await sleep(250);
      if (!(APP._clashListDiv && APP._clashListDiv.querySelector('[data-clash-idx]'))) return { err: 'no rows', pair };
      let last = '', stable = 0; for (let i = 0; i < 80 && stable < 6; i++) { await sleep(500); const s = APP._clashListDiv.innerText; if (s === last) stable++; else { stable = 0; last = s; } }   // the narrow-phase verdicts arrive row by row: wait until the text stops changing
      const rows = APP._clashListDiv.querySelectorAll('[data-clash-idx]');
      const cur = APP._currentClashes || [];
      return { pair, rows: rows.length, text: APP._clashListDiv.innerText.replace(/\s+/g, ' ').slice(0, 1500), factRows: (APP._clashListDiv.innerText.match(/\[\s*\d+\s*\/\s*\d+\s*mm\s*\]/g) || []).length, hasFactFn: !!(APP.clashLabels && APP.clashLabels.factRow), guids: cur.length ? [cur[0][0], cur[0][1]] : null, tol: Math.round(APP._pairTolerance(APP._currentClashRules, cur[0][4], cur[0][5]) * 1000) }; }).catch(e => ({ err: String(e.message).slice(0, 120) }));
    r.mark.clash = cons.length;
  }
  if (r.ready && opts.effects) {   // the phone's effects path + the dead keyboard path (WO-4 rulings 2 and 6)
    const m0 = cons.length;
    r.fx = await page.evaluate(() => ({ toggleSSAO: typeof APP.toggleSSAO, setOutline: typeof APP.setOutline, composerEnabled: APP._composerEnabled === true, isMobile: window._isMobile === true, cap: window._caps && window._caps.phone === true }));
    if (opts.phone) {   // PHONE ONLY: on a desktop these keys would START the film (Alt+C opens the path editor) and add timing-dependent § tags to the desktop comparison (D1)
      await page.evaluate(() => { for (const [k, alt] of [['c', true], ['v', false], ['p', true], ['t', false]]) window.dispatchEvent(new KeyboardEvent('keydown', { key: k, altKey: alt, bubbles: true })); });
      await page.waitForTimeout(600);
    }
    r.kbdLines = cons.slice(m0).filter(t => /^§KBD_ROUTE/.test(t));
  }
  if (r.ready && opts.palette) {   // the Help list (command palette) is the one place the group's controls (Sanity, Egress) are listed besides the keyboard: read its text
    r.palette = await page.evaluate(rows => { if (typeof showCommandPalette !== 'function') return null; showCommandPalette(); return new Promise(res => setTimeout(() => { const t = document.body.innerText, o = { len: t.length, rows: {} }; for (const n of rows) o.rows[n] = new RegExp('\\b' + n + '\\b').test(t); res(o); }, 1500)); }, ROWS).catch(() => null);
    for (let i = 0; i < 40 && !cons.some(t => /^§HOWTO_LOAD/.test(t)); i++) await sleep(250);   // the Help list loads its how-to pack on open: wait for its § line in every run, so it is not a race with the end of the run
    await sleep(500);
  }
  await ctx.close();
  return r;
}

/** WO-5: the fourd group's phone UI and the kept Find features it touches, on ONE phone page: the rail pill ids, the Inspect drawer rows, the Export menu rows, the Ask suggestions (empty sentence, "schedule"),
 *  the Find lens probe line; then Find "Door" -> pick the first row -> the Find "› ERP" push (a kept phone feature: it folds a Project Order through proj_fold -> ScheduleAuthor.classify) -> pick the row again
 *  (the push made a cost twin, so the info panel offers "⏱ View at this moment" when the Time Machine's jump functions exist). Everything is read back as text / counts. */
async function runFourdUi(browser, port) {
  const ctx = await browser.newContext(PHONE), page = await ctx.newPage(), cons = [], errs = [];
  page.on('console', m => cons.push(m.text())); page.on('pageerror', e => errs.push(String(e.message).slice(0, 240)));
  await page.goto('http://127.0.0.1:' + port + URL_PATH, { waitUntil: 'domcontentloaded' });
  const ready = await waitReady(page);
  // the Inspect drawer through the REAL taps (the rail's button, then Inspect): its rows are built when it first opens
  let drawer = null;
  if (ready) { const railUp = await page.evaluate(() => { const p = document.getElementById('pill-inspect'); return !!(p && p.offsetWidth); });
    if (!railUp) { await tapEl(page, '#mobile-trigger'); await page.waitForTimeout(500); }
    await tapEl(page, '#pill-inspect'); await page.waitForTimeout(1200);
    drawer = await page.evaluate(() => { const dp = document.getElementById('inspect-drawer-panel'); return dp ? [...dp.querySelectorAll('[id^="drawer-row-"]')].map(e => e.id).sort() : null; });
    await tapEl(page, '#pill-inspect'); await page.waitForTimeout(500); }
  // Settings > Pill Icons lists every registered action by name (a visibility toggle per pill): a control a phone does not have must not be listed there either
  let settingsRows = null;
  if (ready) { await tapEl(page, '#pill-settings'); await page.waitForTimeout(1500);
    settingsRows = await page.evaluate(() => { const p = document.getElementById('settings-panel'); if (!p) return null; const t = p.innerText; return ['Time Machine', '4D Window', 'Bounding Boxes', 'Section Cut'].filter(n => t.indexOf(n) >= 0); });   // 'Bounding Boxes' / 'Section Cut' = controls both phones keep: the probe reads the panel at all
    await tapEl(page, '#pill-settings'); await page.waitForTimeout(500); }
  const o = ready ? await page.evaluate(async ([drawer0, settings0]) => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)), out = { drawer: drawer0, settings: settings0 };
    out.rail = [...document.querySelectorAll('[id^="pill-"]')].map(e => e.id).sort();
    try { await APP.openExportMenu(document.getElementById('pill-save')); await sleep(700); } catch (e) { out.exportErr = String(e.message).slice(0, 80); }
    const ep = document.getElementById('v-export-panel'); out.exportRows = ep ? [...ep.querySelectorAll('.ve-row')].map(e => e.getAttribute('data-key')) : null;
    try { await APP.openExportMenu(document.getElementById('pill-save')); await sleep(300); } catch (e) { /* closed or absent */ }
    APP.openFindPanel('Door');
    for (let i = 0; i < 60; i++) { await sleep(500); const n = document.getElementById('find-results'); if (n && n.children.length > 0) break; }
    await sleep(1500);
    try { out.ask0 = (await APP.askSuggest('')).map(x => x.tpl); out.askSched = (await APP.askSuggest('schedule')).map(x => x.tpl); } catch (e) { out.askErr = String(e.message).slice(0, 80); }
    const pick = async () => { const r0 = document.querySelector('#find-results').children[0]; if (r0) r0.click(); await sleep(2500); };
    await pick();
    const btn = document.getElementById('find-erp-btn'); out.pushBtnVisible = !!(btn && btn.offsetWidth);
    if (btn) btn.click();
    for (let i = 0; i < 90; i++) { await sleep(500); const st = (APP.status && APP.status.textContent) || ''; if (/Project Order/.test(st) && !/Folding/.test(st)) break; }   // "Folding Project Order…" is the start, "Project Order: 1 lines · … (saved)" / "… push failed: …" the end
    await sleep(2000);
    out.pushStatus = (APP.status && APP.status.textContent) || '';
    await pick(); await sleep(1500);
    const cb = document.getElementById('info-cost-tm'); out.costTmButton = !!cb;
    const strip = t => String(t || '').replace(/⏱ View at this moment/g, '').replace(/\s+/g, ' ').trim();
    const ic = document.getElementById('info-cost'), pn = document.getElementById('info-panel');
    out.costBox = ic && ic.style.display === 'block' ? strip(ic.innerText).slice(0, 600) : '(hidden)'; out.infoPanel = pn ? strip(pn.innerText).slice(0, 900) : '';
    return out; }, [drawer, settingsRows]).catch(e => ({ err: String(e.message).slice(0, 160) })) : null;
  await ctx.close();
  return { ready, errs, o, push: cons.find(t => /§PROJ_PUSH project=/.test(t)) || null, pushErr: cons.find(t => /§PROJ_PUSH_ERR/.test(t)) || null, lens: cons.find(t => /§LENS_PROBE/.test(t)) || null, cons };
}
/** WO-5 P4 `ui` part: the controls of the group are in the baseline phone's UI and not in the gated phone's; everything else in those lists is equal. */
function uiHidden(b, a) {
  if (!b || !a || !b.o || !a.o || b.o.err || a.o.err) return { state: 'INCONCLUSIVE', why: 'the phone UI probe did not run in both runs: ' + JSON.stringify([b && b.o && b.o.err, a && a.o && a.o.err]) };
  const L = (x, k) => (x.o[k] || []), minus = (x, y) => x.filter(v => !y.includes(v)), parts = [], bad = [];
  const cmp = (name, key, gone, why) => { const want = L(a, key).filter(v => !gone.includes(v)), got = L(b, key), shownBefore = gone.filter(v => L(a, key).includes(v)), shownNow = gone.filter(v => got.includes(v));
    if (shownBefore.length !== gone.length) { bad.push('INCONCLUSIVE'); parts.push(`${name}: the baseline phone does not list ${minus(gone, L(a, key)).join(',')} either (${JSON.stringify(L(a, key))})`); }
    else if (shownNow.length || JSON.stringify(got) !== JSON.stringify(want)) { bad.push('FAIL'); parts.push(`${name}: gated ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
    else parts.push(`${name}: baseline lists ${gone.join(',')}, the gated phone does not, the other ${got.length} entries equal`); };
  cmp('rail', 'rail', ['pill-sched4d'], ''); cmp('Inspect drawer', 'drawer', ['drawer-row-tm'], ''); cmp('Export menu', 'exportRows', ['schedule'], ''); cmp('Ask suggestions', 'ask0', ['schedule_4d'], ''); cmp('Ask "schedule"', 'askSched', ['schedule_4d'], ''); cmp('Settings > Pill Icons', 'settings', ['Time Machine', '4D Window'], '');
  const lensPhase = l => (/phase=(\w+)/.exec(l || '') || [])[1];
  parts.push(`Find lens probe phase=${lensPhase(b.lens)} (baseline ${lensPhase(a.lens)}: the Phase axis is data-gated on the generator or a stored timeline)`);
  const state = bad.includes('FAIL') ? 'FAIL' : bad.includes('INCONCLUSIVE') ? 'INCONCLUSIVE' : 'PASS';
  return { state, why: parts.join(' | ') };
}
/** WO-5 ruling 5: the Find info panel's "⏱ View at this moment" button: the baseline phone shows it, the gated phone does not, and the rest of the panel (and the cost box) is equal */
function jumpHidden(b, a) {
  if (!b || !a || !b.o || !a.o || b.o.err || a.o.err) return { state: 'INCONCLUSIVE', why: 'the Find push / info probe did not run in both runs' };
  const firstDiff = (x, y) => { let i = 0; while (i < x.length && x[i] === y[i]) i++; return i >= Math.max(x.length, y.length) ? '-' : `@${i} "${x.slice(Math.max(0, i - 25), i + 50)}" vs "${y.slice(Math.max(0, i - 25), i + 50)}"`; };
  const d = `button branch=${b.o.costTmButton} baseline=${a.o.costTmButton}; cost box equal=${b.o.costBox === a.o.costBox}; info panel equal=${b.o.infoPanel === a.o.infoPanel} (first difference ${firstDiff(String(b.o.infoPanel), String(a.o.infoPanel))})`;
  if (!a.o.costTmButton) return { state: 'INCONCLUSIVE', why: 'the baseline phone shows no "View at this moment" button even after the push made a twin: hiding it is not proven (' + d + ')' };
  if (b.o.costTmButton || b.o.costBox !== a.o.costBox || b.o.infoPanel !== a.o.infoPanel) return { state: 'FAIL', why: d };
  return { state: 'PASS', why: d + ` (cost box "${String(a.o.costBox).slice(0, 70)}")` };
}
/** WO-5 P3 push leg: the Find "› ERP" push gives the same §PROJ_PUSH line (project, phases, tasks, lines, plannedAmt, notes) and the same status text on both phones, with no §PROJ_PUSH_ERR */
function pushSame(b, a) {
  if (!b || !a || !b.o || !a.o) return { state: 'INCONCLUSIVE', why: 'the push leg did not run in both runs' };
  const d = `branch status="${String(b.o.pushStatus).slice(0, 70)}" err=${b.pushErr ? 'YES ' + b.pushErr.slice(0, 90) : '-'} | baseline status="${String(a.o.pushStatus).slice(0, 70)}" err=${a.pushErr ? 'YES' : '-'}`;
  if (!a.push || a.pushErr) return { state: 'INCONCLUSIVE', why: 'the baseline phone does not complete the push: ' + d };
  if (!b.push || b.pushErr || b.push !== a.push || b.o.pushStatus !== a.o.pushStatus) return { state: 'FAIL', why: d + ` | line equal=${b.push === a.push}` };
  return { state: 'PASS', why: d + ` | §PROJ_PUSH line equal: ${a.push.replace(/^\[RP-C\] /, '').slice(0, 130)}` };
}
/** The Ask answer exit_path on a phone on a building that HAS an escape route (the Duplex and the Clinic carry no walkable raster: their answer is INCONCLUSIVE on the baseline too). find_ask.js runExit -> A.escapeRouteBuild / A.escapeRouteFor (cpe_escape_route.js, rule 4). */
async function runAskExit(browser, port, bld) {
  const ctx = await browser.newContext(PHONE), page = await ctx.newPage(), cons = [], errs = [];
  page.on('console', m => cons.push(m.text())); page.on('pageerror', e => errs.push(String(e.message).slice(0, 240)));
  await page.goto('http://127.0.0.1:' + port + '/viewer/viewer.html?db=buildings/' + bld + '_extracted.db', { waitUntil: 'domcontentloaded' });
  const ready = await waitReady(page, 280);
  const ask = ready ? await page.evaluate(async () => {
    APP.openFindPanel('Door');
    for (let i = 0; i < 240; i++) { await new Promise(r => setTimeout(r, 500)); const p = document.getElementById('find-panel'), n = document.getElementById('find-results'); if (window.FindAsk && window.FindAsk.catalog && p && p.style.display === 'block' && n && n.children.length > 0) break; }
    await new Promise(r => setTimeout(r, 2000));   // FindAsk.mount(A, panel) ran when the panel was built (nf_ui_history.js:251): A_ref is set
    const c = window.FindAsk && window.FindAsk.catalog && window.FindAsk.catalog.find(x => x.id === 'exit_path'); if (!c) return null;
    try { const a = await Promise.race([c.run({}), new Promise((_, rj) => setTimeout(() => rj(new Error('timeout 240 s')), 240000))]);
      return { verdict: a.verdict, summary: a.summary, value: JSON.stringify(a.value === undefined ? null : a.value).slice(0, 600), tags: (a.evidence || []).map(e => e.tag).join(',') }; }
    catch (e) { return { err: String(e && e.message).slice(0, 160) }; } }).catch(e => ({ err: String(e.message).slice(0, 120) })) : null;
  await ctx.close();
  return { ready, errs, ask, escLines: cons.filter(t => /^§ESCAPE_ROUTE/.test(t)).length };
}
/** The clash deep link on a phone (main.js:1169-1215): a fresh page at #clash=<a>~<b>; what the link did, as numbers. */
async function runDeepLink(browser, port, g, tol) {
  const ctx = await browser.newContext(PHONE), page = await ctx.newPage(), cons = [], errs = [];
  page.on('console', m => cons.push(m.text())); page.on('pageerror', e => errs.push(String(e.message).slice(0, 240)));
  await page.goto('http://127.0.0.1:' + port + URL_PATH + '#clash=' + g[0] + '~' + g[1] + '&st=&tol=' + tol, { waitUntil: 'domcontentloaded' });
  const ready = await waitReady(page);
  for (let i = 0; i < 90 && !cons.some(t => /^§CLASH_DEEPLINK /.test(t)); i++) await sleep(500);
  await sleep(4000);   // the fly
  const o = await page.evaluate(() => ({ cam: APP.camera.position.toArray().map(v => +v.toFixed(2)), tgt: APP.controls.target.toArray().map(v => +v.toFixed(2)), n: (APP._currentClashes || []).length, status: (APP.status && APP.status.textContent || '').slice(0, 120) })).catch(() => null);
  await ctx.close();
  return { ready, errs, line: cons.find(t => /^§CLASH_DEEPLINK /.test(t)) || null, err: cons.find(t => /§CLASH_DEEPLINK_ERR/.test(t)) || null, o };
}
// the setup functions of the group (top-level `function setupX` of its files), judged at the §BOOT_T moment
function window_entry_names() { const e = []; for (const g of GROUPS) e.push(...(GROUP_ENTRIES[g] || [])); return e; }
function window_setup_names() { const n = []; for (const f of GROUP_FILES.filter(x => MAN.modules[x].load !== 'lazy')) { const t = fs.readFileSync(path.join(ROOT, f), 'utf8'); for (const m of t.matchAll(/^(?:async\s+)?function\s+(setup[A-Za-z0-9_$]*)\s*\(/gm)) n.push(m[1]); } return [...new Set(n)]; }

// §SCRIPT_DUP_AUDIT total= counts document.scripts: the gate removes the group's static tags from a phone's page and adds the inline scripts of the frame (the _DESK block + one _desk(i) call per run) — computed, not assumed
const inlineOf = txt => require(path.join(ROOT, 'scripts', 'lib', 'page_refs.js')).readHtml(txt).inline.length;
const inlineAdded = () => inlineOf(fs.readFileSync(path.join(ROOT, 'viewer', 'viewer.html'), 'utf8')) - inlineOf((overlayBase.get('viewer/viewer.html') || fs.readFileSync(path.join(ROOT, 'viewer', 'viewer.html'))).toString('utf8'));
// tags a TIMER emits (frame sampler main.js §FPS_MODE: a mean/max/n over the frames since the last line, one line per interval): their count and n follow elapsed time, so they are judged for presence only
const SAMPLER = new Set(['§FPS_MODE']);
// ---- the § tag signature of a run
const tagOf = t => { const m = /^§[A-Za-z0-9_\-]+/.exec(t); return m ? m[0] : null; };
const fieldsOf = t => [...t.matchAll(/([A-Za-z_][A-Za-z0-9_]*)=(-?\d+(?:\.\d+)?)(?![\w.])/g)].map(m => [m[1], m[2]]).filter(([k]) => k !== 'uuid');   // a random id is not a result
function signature(cons) {   // tag -> {count, fields: key -> sorted values}
  const sig = new Map();
  for (const t of cons) { const g = tagOf(t); if (!g) continue; const e = sig.get(g) || { count: 0, fields: new Map() }; e.count++;
    for (const [k, v] of fieldsOf(t)) { const a = e.fields.get(k) || []; a.push(v); e.fields.set(k, a); } sig.set(g, e); }
  return sig;
}
/** What differs between two signatures: {tag, what}. */
const TIMING_KEY = /^(ms|ts|t|at|dt|elapsed|msPerPair|[a-z]+Ms|[a-z]+_ms|ms_[a-z]+|heap(Before|Peak|After)MB)$/;   // heap*MB (WO-5): the JS heap the clash list measured — fewer scripts loaded, a smaller heap: a measurement, not a result;   // fields that carry a duration / timestamp (e.g. §DUP_SHELL ms=38 vs 39 between two runs of the SAME code)
function sigDiff(a, b) {
  const d = [];
  for (const g of new Set([...a.keys(), ...b.keys()])) { const x = a.get(g), y = b.get(g);
    if (!x || !y) { d.push({ tag: g, what: 'only in ' + (x ? 'A' : 'B') }); continue; }
    if (x.count !== y.count) d.push({ tag: g, what: `count ${x.count} vs ${y.count}` });
    for (const k of new Set([...x.fields.keys(), ...y.fields.keys()])) { const p = (x.fields.get(k) || []).slice().sort().join(','), q = (y.fields.get(k) || []).slice().sort().join(',');
      if (p !== q && !TIMING_KEY.test(k)) d.push({ tag: g, key: k, what: `${k}: ${p.slice(0, 60)} vs ${q.slice(0, 60)}` }); } }   // a duration is not a result: its presence and the tag's count are judged, its milliseconds are not
  return d;
}
const keptFiles = () => { const files = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!/node_modules|buildings|^tests?$/.test(e.name)) walk(p); } else if (/\.js$/.test(e.name)) files.push(p); } })(path.join(ROOT, 'viewer')); return files; };
// the files a GATED phone loads: every viewer/*.js minus every file the page writes as a `desk` site (all groups gated so far, not only this run's group)
const DESK_NOW = new Set((MAN.order['viewer/viewer.html'] || []).filter(s => s.kind === 'desk').map(s => path.posix.normalize(path.posix.join('viewer', s.as))));
const phoneFiles = () => keptFiles().filter(f => !DESK_NOW.has(path.relative(ROOT, f).split(path.sep).join('/')));
// files that became desk sites since the baseline (the page's script-count arithmetic, P3 / D1): the desk sites now minus the desk sites at BASE_REF
const CONVERTED = DESK_NOW.size - (() => { const b = baseText('viewer/modules.json'); if (!b) return 0; try { return (JSON.parse(b.toString('utf8')).order['viewer/viewer.html'] || []).filter(s => s.kind === 'desk').length; } catch (e) { return 0; } })();
// P4 pieces ---------------------------------------------------------------------------------------------------------------------
/** the group's Help-list rows: listed by the baseline phone, not by the gated phone */
function rowsHidden(b, a) {
  if (!ROWS.length) return { state: 'PASS', why: 'this group has no Help-list row' };
  const pb = b.palette, pa = a.palette; if (!pb || !pa) return { state: 'INCONCLUSIVE', why: `no Help list was read (branch=${!!pb} baseline=${!!pa})` };
  const shownBefore = ROWS.filter(n => pa.rows[n]), shownNow = ROWS.filter(n => pb.rows[n]);
  if (shownBefore.length !== ROWS.length) return { state: 'INCONCLUSIVE', why: `the baseline phone does not list ${ROWS.filter(n => !pa.rows[n]).join(',')} either: hiding them is not proven (baseline ${JSON.stringify(pa.rows)})` };
  if (shownNow.length) return { state: 'FAIL', why: `the gated phone still lists ${shownNow.join(',')}` };
  return { state: 'PASS', why: `the baseline phone lists ${ROWS.join(',')} (${JSON.stringify(pa.rows)}), the gated phone none (${JSON.stringify(pb.rows)})` };
}
/** the effects path (ruling 2) and the dead keyboard path (ruling 6): §EFFECTS_SKIP before and after, the no-ops defined, no missing part, Alt+C / v / Alt+P leave no §KBD_ROUTE line on either phone */
function fxState(b, a) {
  if (!b.fx || !a.fx) return { state: 'INCONCLUSIVE', why: 'the effects state was not read' };
  const skipB = b.cons.filter(t => /^§EFFECTS_SKIP /.test(t)).length, skipA = a.cons.filter(t => /^§EFFECTS_SKIP /.test(t)).length, miss = b.cons.filter(t => /§SPLIT_PART_MISSING/.test(t)).length;
  const kb = (b.kbdLines || []).length, ka = (a.kbdLines || []).length;
  const detail = `§EFFECTS_SKIP branch=${skipB} baseline=${skipA}, §SPLIT_PART_MISSING=${miss}, A.toggleSSAO/A.setOutline=${b.fx.toggleSSAO}/${b.fx.setOutline} (baseline ${a.fx.toggleSSAO}/${a.fx.setOutline}), _isMobile=${b.fx.isMobile}, Alt+C/v/Alt+P/t keydown §KBD_ROUTE lines branch=${kb} baseline=${ka} (the scene.js keydown handler's \`if (window._isMobile) return;\` mobile guard)`;
  if (skipA < 1 || !a.fx.isMobile) return { state: 'INCONCLUSIVE', why: 'the baseline phone does not take the §EFFECTS_SKIP path: ' + detail };
  if (skipB < 1 || miss > 0 || b.fx.toggleSSAO !== 'function' || b.fx.setOutline !== 'function' || !b.fx.isMobile || kb > 0 || ka > 0) return { state: 'FAIL', why: detail };
  return { state: 'PASS', why: detail };
}

// ---- WO-6 legs ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The render-numbers leg (ruling 2). b = gated phone, a = baseline phone, a2 = baseline run again (the noise floor of the program count). Materials, meshes, drawn instances and the triangles of one frame at the same camera must be equal;
 *  a different program count is reported with its cause (the THREE.ShaderChunk entries that differ: the boot patches of sourced_light.js / shadow_cascade.js / sky_occlusion.js), never hidden. */
function renderSame(b, a, a2) {
  const rb = b && b.render, ra = a && a.render, ra2 = a2 && a2.render;
  if (!rb || !ra || rb.err || ra.err) return { state: 'INCONCLUSIVE', why: 'the render probe did not run in both phone runs: ' + JSON.stringify([rb && rb.err, ra && ra.err]) };
  const diffChunks = Object.keys(Object.assign({}, ra.chunks, rb.chunks)).filter(k => ra.chunks[k] !== rb.chunks[k]);
  const camSame = JSON.stringify(ra.cam) === JSON.stringify(rb.cam), grid = ra.grid.map((v, i) => Math.abs(v - rb.grid[i])), gmax = Math.max(...grid), gmean = +(grid.reduce((x, y) => x + y, 0) / grid.length).toFixed(3);
  const noiseProg = ra2 && ra2.programs >= 0 ? ra2.programs : null;
  const detail = `materials ${rb.materials}/${ra.materials} meshes ${rb.meshes}/${ra.meshes} drawn ${rb.drawn}/${ra.drawn} | one frame: draw calls ${rb.info.calls}/${ra.info.calls} triangles ${rb.info.triangles}/${ra.info.triangles} lines ${rb.info.lines}/${ra.info.lines} points ${rb.info.points}/${ra.info.points} | programs ${rb.programs}/${ra.programs}${noiseProg != null ? ' (baseline run again ' + noiseProg + ')' : ''} by name ${JSON.stringify(rb.byName)} vs ${JSON.stringify(ra.byName)} | geometries ${rb.mem.geometries}/${ra.mem.geometries} textures ${rb.mem.textures}/${ra.mem.textures}${ra2 ? ' (baseline run again ' + ra2.mem.textures + ')' : ''} | same camera=${camSame} | opening split windows=${rb.windowsSplit}/${ra.windowsSplit} surfaceRules=${rb.surfaceRules}/${ra.surfaceRules} | ShaderChunk entries that differ (${diffChunks.length}): ${diffChunks.join(',') || '-'} | luminance 8x8 grid (a measurement, not judged): max cell delta ${gmax.toFixed(2)} mean cell delta ${gmean} of 255, frame mean ${(rb.grid.reduce((x, y) => x + y, 0) / rb.grid.length).toFixed(2)}/${(ra.grid.reduce((x, y) => x + y, 0) / ra.grid.length).toFixed(2)} (offscreen ${rb.bufW}x${rb.bufH}${ra2 ? '; baseline run again frame mean ' + (ra2.grid.reduce((x, y) => x + y, 0) / ra2.grid.length).toFixed(2) : ''})`;
  if (!(ra.grid.reduce((x, y) => x + y, 0) > 0)) return { state: 'INCONCLUSIVE', why: 'vacuous: the baseline luminance grid is black: ' + detail };
  if (!(ra.info.triangles > 0) || !(ra.materials > 0)) return { state: 'INCONCLUSIVE', why: 'vacuous: the baseline frame drew no triangles / no material: ' + detail };
  if (!camSame) return { state: 'INCONCLUSIVE', why: 'the two runs did not start on the same camera: ' + detail };
  const bad = [];
  if (rb.materials !== ra.materials) bad.push('materials'); if (rb.meshes !== ra.meshes) bad.push('meshes'); if (rb.drawn !== ra.drawn) bad.push('drawn instances');
  if (rb.info.triangles !== ra.info.triangles) bad.push('triangles'); if (rb.info.calls !== ra.info.calls) bad.push('draw calls'); if (rb.windowsSplit !== ra.windowsSplit) bad.push('opening split');
  if (bad.length) return { state: 'FAIL', why: bad.join(',') + ' differ: ' + detail };
  return { state: 'PASS', why: detail, progDiff: rb.programs !== ra.programs, diffChunks };
}
/** The keys leg: every window / APP name the baseline phone has and the gated phone lacks is defined by a file of the gated group (the text of a group file holds the name); nothing else may go missing, nothing may appear. */
function keysCheck(b, a, a2) {
  if (!b || !a || !b.keys || !a.keys) return { state: 'INCONCLUSIVE', why: 'no key lists' };
  const groupText = GROUP_FILES.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n'), has = n => new RegExp('(?<![\\w$])' + n.replace(/\$/g, '\\$') + '(?![\\w$])').test(groupText);
  // a name that differs between two runs of the SAME baseline code (set by an asynchronous step that had or had not finished at the moment of the probe: A._civilModel) is the noise floor, not the gate
  const flip = a2 && a2.keys ? new Set([].concat(a.keys.win.filter(k => !a2.keys.win.includes(k)), a2.keys.win.filter(k => !a.keys.win.includes(k)), a.keys.app.filter(k => !a2.keys.app.includes(k)), a2.keys.app.filter(k => !a.keys.app.includes(k)))) : new Set();
  const miss = (x, y) => x.filter(k => !y.includes(k) && !flip.has(k)), wMiss = miss(a.keys.win, b.keys.win), aMiss = miss(a.keys.app, b.keys.app), wNew = miss(b.keys.win, a.keys.win), aNew = miss(b.keys.app, a.keys.app);
  const unexplained = wMiss.concat(aMiss).filter(n => !has(n));
  const why = `window names only on the baseline phone (${wMiss.length}): ${wMiss.join(',') || '-'} | APP members only on the baseline phone (${aMiss.length}): ${aMiss.join(',') || '-'} | new on the gated phone: window ${wNew.join(',') || '-'} APP ${aNew.join(',') || '-'} | not found in any file of the group: ${unexplained.join(',') || '-'} | differ between two baseline runs (noise, not judged): ${[...flip].join(',') || '-'}`;
  if (!wMiss.length && !aMiss.length) return { state: 'INCONCLUSIVE', why: 'the baseline phone has no name the gated phone lacks: the group defines nothing at boot, or the lists are empty — ' + why };
  if (unexplained.length || wNew.length || aNew.length) return { state: 'FAIL', why };
  return { state: 'PASS', why };
}
/** The save leg (ruling 5): the phone's REAL APP.saveModelDb() with a light_field_cache row put into the opened building. Three cases per phone page: a current row (the key light_zones.js reports), a stale row, no table. showSaveFilePicker is replaced
 *  by a writer that keeps the bytes; the saved file is opened again and its table read. */
async function runSaveLeg(browser, port, curKey) {
  const ctx = await browser.newContext(PHONE), page = await ctx.newPage(), cons = [], errs = [];
  page.on('console', m => cons.push(m.text())); page.on('pageerror', e => errs.push(String(e.message).slice(0, 240)));
  await page.addInitScript(() => { window.showSaveFilePicker = async () => ({ name: 'witness_save.db', createWritable: async () => ({ write: async b => { window.__saved = new Uint8Array(await b.arrayBuffer()); }, close: async () => {} }) }); });
  await page.goto('http://127.0.0.1:' + port + URL_PATH, { waitUntil: 'domcontentloaded' });
  const ready = await waitReady(page);
  const o = ready ? await page.evaluate(async (key0) => {
    const A = window.APP, sleep = ms => new Promise(r => setTimeout(r, ms)), out = { key: window.LightZones && window.LightZones.cacheKey ? window.LightZones.cacheKey() : null, cases: {} }, key = out.key || key0;
    const DDL = 'CREATE TABLE IF NOT EXISTS light_field_cache (key TEXT, bld TEXT, fp TEXT, bytes INTEGER, raw_bytes INTEGER, blob BLOB, created TEXT)';
    const save = async () => { window.__saved = null; await A.saveModelDb(); for (let i = 0; i < 40 && !window.__saved; i++) await sleep(250); if (!window.__saved) return { err: 'nothing saved' };
      const db2 = new A.db.constructor(window.__saved), tb = db2.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='light_field_cache'"), present = !!(tb[0] && tb[0].values.length);
      let rows = []; if (present) { const r = db2.exec('SELECT key, bytes, length(blob) FROM light_field_cache'); rows = r[0] ? r[0].values : []; } db2.close(); return { present, rows, saved: window.__saved.length }; };
    for (const [name, k] of [['current', key], ['stale', 'stale-key-0000'], ['none', null]]) {
      A.db.run('DROP TABLE IF EXISTS light_field_cache');
      if (k) { A.db.run(DDL); const st = A.db.prepare('INSERT INTO light_field_cache VALUES (?,?,?,?,?,?,?)'); st.run([k, 'Duplex', 'fp', 3, 3, new Uint8Array([1, 2, 3]), 'witness']); st.free(); }
      out.cases[name] = await save(); }
    return out; }, curKey).catch(e => ({ err: String(e && e.message).slice(0, 200) })) : null;
  await ctx.close();
  return { ready, errs, o, lines: cons.filter(t => /^§LIGHT_FIELD_DB|^§SAVE_/.test(t)).map(t => t.slice(0, 140)) };
}
function saveSame(b, a) {
  if (!b || !a || !b.o || !a.o || b.o.err || a.o.err || !a.ready || !b.ready) return { state: 'INCONCLUSIVE', why: 'the save leg did not run in both phones: ' + JSON.stringify([b && b.o && b.o.err, a && a.o && a.o.err]) };
  const c = (x, n) => x.o.cases[n], show = x => JSON.stringify(x && (x.err || { present: x.present, rows: (x.rows || []).map(r => [String(r[0]).slice(0, 12), r[1], r[2]]) }));
  const cur = [c(b, 'current'), c(a, 'current')], stale = [c(b, 'stale'), c(a, 'stale')], none = [c(b, 'none'), c(a, 'none')];
  const d = `current row: gated ${show(cur[0])} baseline ${show(cur[1])} | stale row: gated ${show(stale[0])} baseline ${show(stale[1])} | no table: gated ${show(none[0])} baseline ${show(none[1])} | baseline light_zones key ${a.o.key} gated ${b.o.key}; log gated: ${b.lines.slice(0, 4).join(' | ')}`;
  if (!a.o.key || !(cur[1] && cur[1].present && cur[1].rows.length === 1)) return { state: 'INCONCLUSIVE', why: 'the baseline phone does not carry a current row through its save: nothing is proven. ' + d };
  if (JSON.stringify(cur[0]) !== JSON.stringify(cur[1]) || JSON.stringify(none[0]) !== JSON.stringify(none[1])) return { state: 'FAIL', why: d };
  const staleSame = JSON.stringify(stale[0]) === JSON.stringify(stale[1]);
  return { state: 'PASS', why: d + (staleSame ? '' : ' | the stale-row case differs: the baseline phone drops a row whose key is not the current light_zones.js hash, the gated phone cannot judge that and carries it (derived cache data, reported)') };
}

(async () => {
  S(`§PHONE_AXE_GROUP group=${GROUP} files=${GROUP_FILES.length} ${GROUP_FILES.join(',')} base_ref=${BASE_REF} base=${git(['rev-parse', '--short', BASE_REF]).toString().trim()} changed_vs_base=${changed.length}`);
  if (!GROUP_FILES.length) { S(`§W-PHONE-AXE group=${GROUP} checks=0 fail=0 inconclusive=1 verdict=INCONCLUSIVE (no module flagged for this group)`); fs.writeFileSync(LOG, out.join('\n') + '\n'); process.exit(1); }
  const br = await serve(null), bs = await serve(overlayBase), bd = await serve(overlayBase, 15), bd3 = await serve(overlayBase, 3), bd40 = await serve(overlayBase, 40), bj2 = await serve(overlayBase, 2, true), bj6 = await serve(overlayBase, 6, true), browser = await chromium.launch(LAUNCH);
  const FOURD = GROUPS.includes('fourd'), STILL = GROUPS.includes('still'), PUSH = FOURD || STILL; let saveA = null; const saveBase = async () => saveA || (saveA = await runSaveLeg(browser, bs.port, null)); let fourdA = null; const fourdBase = async () => fourdA || (fourdA = await runFourdUi(browser, bs.port));
  let basePhone = null; const rowsBaseline = async () => basePhone || (basePhone = await run(browser, bs.port, { phone: true, palette: true, effects: true, render: STILL }));
  const stamp = (id, r) => fs.writeFileSync(path.join(os.tmpdir(), `phone_axe_${id}.console.log`), r.cons.join('\n') + '\n');
  try {
    // ======== PHONE: branch, baseline A, baseline A'
    if (!ONLY || ONLY.includes('P')) {
    S('── PHONE 412x823 touch: branch ──'); const pB = await run(browser, br.port, { phone: true, steps: true, palette: true, effects: true, render: STILL }); stamp('phone_branch', pB);
    S('── PHONE: baseline (origin/main + step 6) run A ──'); const pA = await run(browser, bs.port, { phone: true, steps: true, palette: true, effects: true, render: STILL }); basePhone = pA; stamp('phone_baseA', pA);
    S('── PHONE: baseline run A\' (same code again: the noise floor) ──'); const pA2 = await run(browser, bs.port, { phone: true, steps: true, render: STILL }); stamp('phone_baseA2', pA2);
    S('── PHONE: baseline run Ad (same code, every response 15 ms late: what moves with timing) ──'); const pAd = await run(browser, bd.port, { phone: true, steps: true }); stamp('phone_baseAd', pAd);
    S(`§PHONE_RUNS branch: ready=${pB.ready} cons=${pB.cons.length} reqs=${pB.reqs.length} steps=${JSON.stringify(pB.steps)} | baseline A: ready=${pA.ready} cons=${pA.cons.length} steps=${JSON.stringify(pA.steps)} | A': ready=${pA2.ready} cons=${pA2.cons.length} steps=${JSON.stringify(pA2.steps)} | Ad: ready=${pAd.ready} cons=${pAd.cons.length}`);

    // WO-5: the fourd UI probe + the Find push leg, one phone page per side (branch / baseline)
    let fu = null; if (PUSH) { S('── PHONE: UI probe + Find "› ERP" push, branch / baseline ──'); const fB = await runFourdUi(browser, br.port), fA = await fourdBase(); fu = { fB, fA }; stamp('phone_fourd_branch', { cons: fB.cons }); stamp('phone_fourd_base', { cons: fA.cons });
      S(`§P4_FOURD_UI branch: ${JSON.stringify(fB.o && Object.assign({}, fB.o, { infoPanel: undefined, costBox: undefined }))} pageerrors=${fB.errs.length} lens="${fB.lens}" | baseline: ${JSON.stringify(fA.o && Object.assign({}, fA.o, { infoPanel: undefined, costBox: undefined }))} pageerrors=${fA.errs.length} lens="${fA.lens}"`); }
    // ---- P1
    { const hits = pB.reqs.filter(isGroupUrl), gate = pB.cons.find(t => /^§DESK_GATE /.test(t)) || '', inScripts = (pB.scripts || []).filter(isGroupUrl);
      const baseHits = pA.reqs.filter(isGroupUrl).length;   // the control: the SAME population is requested by the baseline's phone (its static tags), so "0" is not an empty-page artefact
      if (!pB.ready || !GROUP_FILES.length) note('P1', 'INCONCLUSIVE', `ready=${pB.ready} files=${GROUP_FILES.length}`);
      else if (baseHits === 0) note('P1', 'INCONCLUSIVE', 'the baseline phone requested none of the group files either: the count of 0 would prove nothing');
      else if (hits.length === 0 && /phone=true/.test(gate) && /written=0/.test(gate) && inScripts.length === 0) note('P1', 'PASS', `0 requests for ${GROUP_FILES.length} group files (baseline phone: ${baseHits}); "${gate}"; document.scripts holds none`);
      else note('P1', 'FAIL', `requests=${hits.length} (${hits.slice(0, 3).join(' ')}) gate="${gate}" in_document_scripts=${inScripts.length}`); }
    // ---- P2: the phone page runs without an error
    { const bad = pB.cons.filter(t => /ReferenceError|§LOAD_FAIL|§INIT_VIEWER_TIMEOUT|§INIT_VIEWER_ERROR|§SPLIT_PART_MISSING/.test(t)), bt = pB.cons.find(t => /^§BOOT_T /.test(t)) || '';
      if (!pB.ready && !pB.errs.length && !bad.length) note('P2', 'INCONCLUSIVE', 'the phone viewer never became ready and nothing was reported');
      else if (pB.ready && !pB.errs.length && !bad.length && bt) note('P2', 'PASS', `ready, 0 page errors, 0 ReferenceError/§LOAD_FAIL/§INIT_VIEWER_TIMEOUT/§INIT_VIEWER_ERROR/§SPLIT_PART_MISSING over boot -> Walk -> pick -> Issue Log -> Find -> Ask -> Clash list, "${bt}"`);
      else note('P2', 'FAIL', `ready=${pB.ready} pageerrors=${JSON.stringify(pB.errs.slice(0, 3))} bad=${JSON.stringify(bad.slice(0, 3))} boot_t=${bt || 'MISSING'}`); }
    // ---- P4: the group's controls are hidden on the gated phone, the effects path is still the phone path, the keyboard path is dead
    { const hid = rowsHidden(pB, pA), fx = fxState(pB, pA), ui = FOURD ? uiHidden(fu.fB, fu.fA) : null, jp = FOURD ? jumpHidden(fu.fB, fu.fA) : null, all = [hid, fx].concat(ui ? [ui, jp] : []);
      note('P4', all.some(x => x.state === 'FAIL') ? 'FAIL' : (all.some(x => x.state === 'INCONCLUSIVE') ? 'INCONCLUSIVE' : 'PASS'), `rows: ${hid.why} | effects+keys: ${fx.why}${ui ? ` | ui: ${ui.state} ${ui.why} | Find "View at this moment": ${jp.state} ${jp.why}` : ''}`); }
    // ---- P3
    { const sA = signature(pA.cons), sA2 = signature(pA2.cons), sB = signature(pB.cons), noise = sigDiff(sA, sA2).concat(sigDiff(sA, signature(pAd.cons))), noisy = new Set(noise.map(x => x.tag + '|' + (x.key || ''))), noisyTag = new Set(noise.filter(x => !x.key).map(x => x.tag));
      const raw = sigDiff(sA, sB).filter(x => !['§DESK_GATE', '§BOOT_T'].includes(x.tag) && !(SAMPLER.has(x.tag) && x.what !== 'only in A' && x.what !== 'only in B'));
      const real = raw.filter(x => !noisyTag.has(x.tag) && !noisy.has(x.tag + '|' + (x.key || '')) && !(x.key && noisyTag.has(x.tag)));
      const files = phoneFiles().map(f => fs.readFileSync(f, 'utf8'));   // every file the gated phone loads: a tag that none of them can log is a tag only a file the phone no longer loads can log
      const inlineAddedN = inlineAdded();
      const dupA = sA.get('§SCRIPT_DUP_AUDIT'), dupB = sB.get('§SCRIPT_DUP_AUDIT'), dupDelta = dupA && dupB ? +dupB.fields.get('total')[0] - +dupA.fields.get('total')[0] : null, dupWant = inlineAddedN - CONVERTED;
      S(`§P3_ARITH §SCRIPT_DUP_AUDIT total: baseline ${dupA && dupA.fields.get('total')[0]} branch ${dupB && dupB.fields.get('total')[0]} delta=${dupDelta}; expected = inline scripts added to the page (${inlineAddedN}) - files that became desk sites since the baseline (${CONVERTED}) = ${dupWant}`);
      // WO-5: differences that are the DESIGNED, named consequence of hiding a control; each one is tied to the code that causes it, and the P4 `ui` check proves the control itself is gone
      const EXPLAINED = [
        { tag: '§4D_INFO_PANEL', test: x => x.what === 'only in A', why: 'logged by Info4DPanel.render (info_4d_panel.js) on a pick; the kept picking.js:651 calls it only `if (window.Info4DPanel)` and the file is not loaded on a phone (find_erp_push.js logs the tag on the Find path only, reason=info_4d_panel_absent)' },
        { tag: '§DRAWER_BUILD', test: x => { const m = /rows: (\d+) vs (\d+)/.exec(x.what || ''); return !!m && +m[1] - +m[2] === 1; }, why: 'the Inspect drawer lists exactly one row fewer: the Time Machine row (panels.js id tm, platform desktop)' },
        { tag: '§SKY_OCCLUSION', test: x => x.what === 'only in A', why: 'logged by SkyOcc.install (sky_occlusion.js); the kept scene.js:44-52 prints the same tag only in its "not loaded" branch, which a phone now skips on purpose (`_noStill`): a missing file is the phone\'s normal state' },
        { tag: '§SOURCED_LIGHT', test: x => x.what === 'only in A', why: 'logged by SourcedLight.install (sourced_light.js); scene.js prints it only in the "not loaded" branch, skipped on a phone (`_noStill`)' },
        { tag: '§STILL_SHADOW_CASCADE', test: x => x.what === 'only in A', why: 'logged by ShadowCascade.install (shadow_cascade.js); scene.js prints it only in the "not loaded" branch, skipped on a phone (`_noStill`)' },
        { tag: '§LIGHT_FIELD_BY_BUILDING', test: x => x.what === 'only in A', why: 'main.js calls A._lightFieldByBuilding() only `if (window.LightZones && window.LightZones.primeDb)` (the Alt+S light-field prime); light_zones.js is not loaded on a phone, so no sidecar is looked up (a building with a baked sidecar is not fetched / not put into the live db: derived data only Alt+S reads)' },
        { tag: '§LIGHT_FIELD_DB', test: x => x.what === 'only in A', why: 'logged by LightZones.primeDb (light_zones.js) and read back at save; the same `window.LightZones` guard of main.js:1394 — a phone without the file never primes it. The Save path itself is judged by the save leg' },
        { tag: '§CLASH_WAIT_INDEX', test: x => x.what === 'only in A', why: 'printed when a clash call had to wait for the spatial index; its presence follows how long the index took (the list itself — rows and text — is judged separately and is equal)' }];
      const explainedBy = [];
      const onlyGroup = [], unexplained = [], arith = [];
      for (const x of real) { const ex = EXPLAINED.find(e => e.tag === x.tag && e.test(x)); if (ex) { explainedBy.push(x.tag + ' (' + x.what + '): ' + ex.why); continue; } if (x.tag === '§SCRIPT_DUP_AUDIT' && x.key === 'total' && dupDelta === dupWant) { arith.push(x); continue; } const inKept = files.some(t => t.includes(x.tag)); if (!inKept) onlyGroup.push(x); else unexplained.push(x); }
      S(`§P3_NOISE baseline A vs A' and A vs Ad (15 ms late): ${noise.length} differences over ${new Set(noise.map(x => x.tag)).size} tags (not judged): ${[...new Set(noise.map(x => x.tag + (x.key ? '.' + x.key : '')))].slice(0, 40).join(' ')}`);
      S(`§P3_DIFF branch vs baseline A: ${raw.length} raw, ${real.length} after the noise floor; only-in-files-the-phone-no-longer-loads tags: ${onlyGroup.map(x => x.tag + ' (' + x.what + ')').join('; ') || '-'}; explained by a hidden control: ${explainedBy.join(' || ') || '-'}; unexplained: ${unexplained.map(x => x.tag + ' (' + x.what + ')').join('; ') || '-'}`);
      // the RESULTS the kept features gave (WO-4 steps 3 and 5): Find, the Ask answer "exit_path", the Clash list and the clash deep link
      const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      const fB = pB.find, fA = pA.find, fA2 = pA2.find, kB = pB.ask, kA = pA.ask, cB = pB.clash, cA = pA.clash, cA2 = pA2.clash;
      const findOk = !!(fB && fA && fA2 && fB.open && fA.open && fA.rows > 0 && fB.rows > 0), askOk = !!(kB && kA && kA.verdict && kA.verdict !== 'INCONCLUSIVE' && kB.verdict), clashOk = !!(cB && cA && cA.rows > 0 && cB.rows > 0 && cA.guids);
      const axisN = t => { const m = /(\d)\/(\d) Storey/.exec(t || ''); return m ? +m[2] : null; }, maskAxis = t => String(t || '').replace(/\d\/\d (?=Storey)/, 'n/m '), lensPhase = c => { const l = c.find(t => /§LENS_PROBE/.test(t)); return l ? (/phase=(\w+)/.exec(l) || [])[1] : null; }, axisOk = !FOURD || (lensPhase(pA.cons) === 'true' && lensPhase(pB.cons) === 'false' && axisN(fA && fA.text) === axisN(fB && fB.text) + 1), resFind = findOk && eq(fB.rows, fA.rows) && eq(maskAxis(fB.text), maskAxis(fA.text)) && axisOk, resAsk = askOk && eq({ v: kB.verdict, s: kB.summary, x: kB.value, t: kB.tags }, { v: kA.verdict, s: kA.summary, x: kA.value, t: kA.tags });
      const clashNoise = cA2 && cA && cA2.text !== cA.text, resClash = clashOk && cB.rows === cA.rows && cB.pair === cA.pair && (cB.text === cA.text) && cB.factRows === cA.factRows;
      S(`§P3_RESULTS find: rows branch=${fB && fB.rows} baseline=${fA && fA.rows} text_equal=${!!(fB && fA && fB.text === fA.text)}${FOURD ? ' (equal once the Find axis counter n/m is masked: ' + !!(fB && fA && maskAxis(fB.text) === maskAxis(fA.text)) + '; axes branch=' + axisN(fB && fB.text) + ' baseline=' + axisN(fA && fA.text) + ': the Phase axis is data-gated on the Time Machine generator)' : ''}${fA2 ? ' (baseline A vs A\' equal=' + (fA.text === fA2.text) + ')' : ''} | ask exit_path: branch=${kB ? kB.verdict + ' "' + String(kB.summary).slice(0, 90) + '"' : 'null'} baseline=${kA ? kA.verdict + ' "' + String(kA.summary).slice(0, 90) + '"' : 'null'} value_equal=${!!(kB && kA && kB.value === kA.value)} | clash list ${cB && cB.pair}: rows branch=${cB && cB.rows} baseline=${cA && cA.rows} fact_rows branch=${cB && cB.factRows} baseline=${cA && cA.factRows} hasFactFn branch=${cB && cB.hasFactFn} baseline=${cA && cA.hasFactFn} text_equal=${!!(cB && cA && cB.text === cA.text)}${cA2 ? ' (baseline A vs A\' equal=' + (cA.text === cA2.text) + ')' : ''}`);
      let dl = null; if (clashOk && pB.ready && pA.ready) { S('── PHONE: clash deep link, branch / baseline ──'); const dlB = await runDeepLink(browser, br.port, cA.guids, cA.tol), dlA = await runDeepLink(browser, bs.port, cA.guids, cA.tol); dl = { dlB, dlA }; stamp('phone_dl_branch', { cons: [JSON.stringify(dlB)] }); stamp('phone_dl_base', { cons: [JSON.stringify(dlA)] });
        S(`§P3_DEEPLINK branch: ${JSON.stringify(dlB.o)} line="${dlB.line}" err=${dlB.err || '-'} pageerrors=${dlB.errs.length} | baseline: ${JSON.stringify(dlA.o)} line="${dlA.line}" err=${dlA.err || '-'} pageerrors=${dlA.errs.length}`); }
      else S(`§P3_DEEPLINK not run: ${clashOk ? 'a phone run was not ready' : 'the Duplex clash list gave no pair (rows branch=' + (cB && cB.rows) + ' baseline=' + (cA && cA.rows) + ' err=' + ((cA && cA.err) || (cB && cB.err) || '-') + ')'}`);
      S('── PHONE on Terminal: Ask exit_path, branch / baseline ──'); const akB = await runAskExit(browser, br.port, 'Terminal'), akA = await runAskExit(browser, bs.port, 'Terminal'); stamp('phone_ask_branch', { cons: [JSON.stringify(akB)] }); stamp('phone_ask_base', { cons: [JSON.stringify(akA)] });
      S(`§P3_ASK Terminal exit_path: branch ready=${akB.ready} ${JSON.stringify(akB.ask && { v: akB.ask.verdict, s: String(akB.ask.summary).slice(0, 110), err: akB.ask.err })} §ESCAPE_ROUTE lines=${akB.escLines} pageerrors=${akB.errs.length} | baseline ready=${akA.ready} ${JSON.stringify(akA.ask && { v: akA.ask.verdict, s: String(akA.ask.summary).slice(0, 110), err: akA.ask.err })} §ESCAPE_ROUTE lines=${akA.escLines} pageerrors=${akA.errs.length}`);
      const askOk2 = !!(akA.ask && akA.ask.verdict === 'OK' && akB.ask && akB.ask.verdict), resAsk2 = askOk2 && eq({ v: akB.ask.verdict, s: akB.ask.summary, x: akB.ask.value }, { v: akA.ask.verdict, s: akA.ask.summary, x: akA.ask.value }) && !akB.errs.length;
      const dlOk = !!(dl && dl.dlA.line && dl.dlB.line && dl.dlA.o && dl.dlB.o), resDl = dlOk && eq(dl.dlA.o.cam, dl.dlB.o.cam) && eq(dl.dlA.o.tgt, dl.dlB.o.tgt) && dl.dlA.o.n === dl.dlB.o.n && !dl.dlB.err && !dl.dlB.errs.length;
      const popul = `walk_active branch=${pB.steps.walk}/${pB.steps.walkAfter} baseline=${pA.steps.walk}/${pA.steps.walkAfter} pick=${pB.steps.pick}/${pA.steps.pick} issues_open=${pB.steps.issues}/${pA.steps.issues} find_rows=${fB && fB.rows}/${fA && fA.rows} ask=${kB && kB.verdict}/${kA && kA.verdict} clash_rows=${cB && cB.rows}/${cA && cA.rows} deeplink=${dlOk}`;
      S(`§P3_POPULATION branch: tags=${sB.size} lines=${pB.cons.filter(tagOf).length} walk_active=${pB.steps.walk} walk_active_after=${pB.steps.walkAfter} pick=${pB.steps.pick} issues_open=${pB.steps.issues} §PICK_lines=${pB.cons.filter(t => /^§PICK /.test(t)).length} | baseline A: tags=${sA.size} walk_active=${pA.steps.walk} walk_active_after=${pA.steps.walkAfter} pick=${pA.steps.pick} issues_open=${pA.steps.issues} | ${popul}`);
      let rn = null, ks = null, sv = null;
      if (STILL) {   // WO-6 legs: render numbers, key lists, the real phone Save
        rn = renderSame(pB, pA, pA2); ks = keysCheck(pB, pA, pA2);
        S('── PHONE: save leg (APP.saveModelDb with a light_field_cache row), baseline / branch ──'); const svA = await saveBase(), svB = await runSaveLeg(browser, br.port, svA.o && svA.o.key); sv = saveSame(svB, svA); stamp('phone_save_base', { cons: svA.lines }); stamp('phone_save_branch', { cons: svB.lines });
        S(`§P3_RENDER ${rn.state} ${rn.why}`); S(`§P3_KEYS ${ks.state} ${ks.why}`); S(`§P3_SAVE ${sv.state} ${sv.why}`);
        if (rn.progDiff) S(`§P3_PROGRAMS the gated phone compiles ${pB.render.programs} shader programs, the baseline phone ${pA.render.programs} (the baseline run again: ${pA2.render && pA2.render.programs}); the program SOURCE differs because boot patches of THREE.ShaderChunk (${rn.diffChunks.join(',')}) are not installed (scene.js:44-52 finds no SourcedLight / ShadowCascade / SkyOcc); their uniforms stay at the off value on every phone path, so the same triangles and materials are drawn (above)`);
      }
      const walkBoth = pB.steps.walk === true && pA.steps.walk === true && pB.steps.walkAfter === true && pA.steps.walkAfter === true;
      if (!pB.ready || !pA.ready || !pA2.ready || !pAd.ready) note('P3', 'INCONCLUSIVE', `a run did not become ready (branch=${pB.ready} A=${pA.ready} A'=${pA2.ready} Ad=${pAd.ready})`);
      else if (!walkBoth) note('P3', 'INCONCLUSIVE', `Walk was not active in every run (${popul}): the walk leg judged nothing — the verdict cannot be PASS`);
      else if (!(pB.steps.pick && pB.steps.issues && pA.steps.pick && pA.steps.issues)) note('P3', 'INCONCLUSIVE', `a step did not happen (pick or Issue Log) in the branch or the baseline: the lists would be compared on a shorter path than required (${popul})`);
      else if (!findOk) note('P3', 'INCONCLUSIVE', `the Find panel gave no search rows in a run (branch=${JSON.stringify(fB && { open: fB.open, rows: fB.rows, err: fB.err })} baseline=${JSON.stringify(fA && { open: fA.open, rows: fA.rows, err: fA.err })}): nothing was judged for Find`);
      else if (!askOk2) note('P3', 'INCONCLUSIVE', `the Ask answer exit_path is not OK on the baseline phone even on the Terminal (${JSON.stringify(akA.ask)}): comparing it would judge nothing`);
      else if (!clashOk) note('P3', 'INCONCLUSIVE', `the Duplex Clash list gave no rows in a run (branch=${JSON.stringify(cB && { rows: cB.rows, err: cB.err })} baseline=${JSON.stringify(cA && { rows: cA.rows, err: cA.err })}): nothing was judged for the clash list / deep link`);
      else if (!dlOk) note('P3', 'INCONCLUSIVE', `the clash deep link did not complete in a run (branch=${JSON.stringify(dl && dl.dlB.o)} line=${dl && dl.dlB.line}; baseline=${JSON.stringify(dl && dl.dlA.o)} line=${dl && dl.dlA.line})`);
      else if (STILL && (rn.state !== 'PASS' || ks.state !== 'PASS' || sv.state !== 'PASS')) note('P3', [rn, ks, sv].some(x => x.state === 'FAIL') ? 'FAIL' : 'INCONCLUSIVE', `a still-group leg did not pass: render=${rn.state} keys=${ks.state} save=${sv.state} (see the §P3_RENDER / §P3_KEYS / §P3_SAVE lines)`);
      else if (PUSH && pushSame(fu.fB, fu.fA).state === 'INCONCLUSIVE') note('P3', 'INCONCLUSIVE', `the Find push leg judged nothing: ${pushSame(fu.fB, fu.fA).why}`);
      else if (PUSH && pushSame(fu.fB, fu.fA).state === 'FAIL') note('P3', 'FAIL', `the Find "› ERP" push (a kept phone feature) gave a different result: ${pushSame(fu.fB, fu.fA).why}`);
      else if (unexplained.length) note('P3', 'FAIL', `${unexplained.length} difference(s) the files the phone no longer loads cannot explain: ${unexplained.slice(0, 6).map(x => x.tag + ' ' + x.what).join(' | ')}`);
      else if (!resFind || !resAsk2 || !resClash || !resDl) note('P3', 'FAIL', `a kept feature gave a different result: find_equal=${resFind} ask_exit_path_terminal_equal=${resAsk2} clash_list_equal=${resClash} (baseline-vs-baseline text equal=${!clashNoise}) deeplink_equal=${resDl}`);
      else note('P3', 'PASS', `${sB.size} § tags, the same as the baseline over boot -> building -> Walk(active=${pB.steps.walk}, still active after the Issue Log=${pB.steps.walkAfter}) -> pick -> Issue Log -> Find "Door" (${fB.rows} rows, same text) -> Ask exit_path on the Terminal (${akB.ask.verdict}, same summary and value; the Duplex has no exit route: ${kA && kA.verdict} on both) -> Clash list ${cB.pair} (${cB.rows} rows, same text, ${cB.factRows} fact rows) -> clash deep link (same camera, same pair count)${PUSH ? '; Find "› ERP" push: ' + pushSame(fu.fB, fu.fA).why : ''}${STILL ? `; render numbers equal (materials ${rn.why.match(/materials (\S+)/)[1]}, triangles ${rn.why.match(/triangles (\S+)/)[1]}, programs ${pB.render.programs}/${pA.render.programs}); ${ks.why.split(' | ')[0]}; Save carries the current light_field_cache row as the baseline phone does` : ''}; ${noise.length} noise differences between baseline runs not judged; ${onlyGroup.length} difference(s) only in tags no file of the gated phone can log (grep-proven); ${arith.length} explained by the script-count arithmetic above`); }
    }
    // ======== DESKTOP
    S('── DESKTOP 1400x900: branch / baseline ──');
    const dB = await run(browser, br.port, { palette: true, effects: true }); stamp('desk_branch', dB); const dA = await run(browser, bs.port, { palette: true, effects: true }); stamp('desk_baseA', dA);
    // ---- D1
    { const dA2 = await run(browser, bs.port, {}); stamp('desk_baseA2', dA2); const dAd = await run(browser, bd.port, {}); stamp('desk_baseAd', dAd); const dAd3 = await run(browser, bd3.port, {}); stamp('desk_baseAd3', dAd3); const dAd40 = await run(browser, bd40.port, {}); stamp('desk_baseAd40', dAd40); const dJ2 = await run(browser, bj2.port, {}); stamp('desk_baseJ2', dJ2); const dJ6 = await run(browser, bj6.port, {}); stamp('desk_baseJ6', dJ6);
      const reqIn = (r, f) => r.reqs.filter(u => new RegExp('/' + f.replace(/\./g, '\\.') + '(\\?|$)').test(u)).length, req = f => reqIn(dB, f), counts = GROUP_BASE.map(f => [f, req(f)]), once = counts.every(([f, n]) => LAZY_BASE.has(f) ? n === reqIn(dA, f) : n === 1);   // an on-demand file is requested as often as the baseline desktop requests it (the gate does not touch it)
      const setupNames = window_setup_names(), names = setupNames.concat(window_entry_names()), mainTxt = fs.readFileSync(path.join(ROOT, 'viewer', 'main.js'), 'utf8').split('\n'), named = names.filter(n => mainTxt.slice(14, 17).join('\n').includes(n));
      const fnAtBoot = dB.bootT ? dB.bootT.setups.every(([n, ty]) => setupNames.includes(n) ? ty === 'function' : ty !== 'undefined') : false;   // a setup function must be a function; an entry global (fourd) must merely be defined (ScheduleRead4D is an object)
      const nb = u => u.split('?')[0].replace(/^https?:\/\/[^/]+/, ''), listOf = r => ((r.bootT && r.bootT.scripts) || []).map(nb), sB = listOf(dB).filter(u => !/\/config\.js$/.test(u)), sA = listOf(dA).filter(u => !/\/config\.js$/.test(u));
      const sameScripts = sB.length > 0 && sB.length === sA.length && sB.every((u, i) => u === sA[i]), cfgFirstB = listOf(dB)[0] === '/viewer/config.js';
      // the boot § tag list: async fetch callbacks reorder a few tags between two runs of the SAME code, so the tags that move between baseline runs A and A' are the noise floor and are left out; the rest must match IN ORDER
      const seq = r => r.cons.filter(tagOf).map(t => tagOf(t)).filter(t => !['§DESK_GATE', '§BOOT_T'].includes(t));
      const sync = r => (r.syncTags || []).filter(t => !['§DESK_GATE', '§BOOT_T'].includes(t));
      const lcsKeep = (x, y) => { const n = x.length, m = y.length, d = Array.from({ length: n + 1 }, () => new Int32Array(m + 1)); for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) d[i][j] = x[i] === y[j] ? d[i + 1][j + 1] + 1 : Math.max(d[i + 1][j], d[i][j + 1]);
        const keepX = new Set(), keepY = new Set(); let i = 0, j = 0; while (i < n && j < m) { if (x[i] === y[j]) { keepX.add(i); keepY.add(j); i++; j++; } else if (d[i + 1][j] >= d[i][j + 1]) i++; else j++; } return { keepX, keepY }; };
      // (1) the PARSE-TIME tags (logged while a classic script runs: document.currentScript set) come in one deterministic order: it must equal the baseline's exactly. (2) the ASYNC ones (a fetch / import callback) race the parser,
      //     so their position moves with timing even in the baseline: judged by what they say (count + numeric fields, below), and their order is compared only where the baseline itself never moves it (A vs A', every response 3/15/40 ms late, every script 2/6 ms late).
      const yA = sync(dA), yA2 = sync(dA2), yB = sync(dB); let syncDiff = -1; for (let i = 0; i < Math.max(yA.length, yB.length); i++) if (yA[i] !== yB[i]) { syncDiff = i; break; } const syncBase = yA.length === yA2.length && yA.every((t, i) => t === yA2[i]);
      const qA = seq(dA), qA2 = seq(dA2), qAd = seq(dAd), qB = seq(dB), unstable = new Set();
      for (const other of [qA2, qAd, seq(dAd3), seq(dAd40), seq(dJ2), seq(dJ6)]) { const k = lcsKeep(qA, other); qA.forEach((t, i) => { if (!k.keepX.has(i)) unstable.add(t); }); other.forEach((t, i) => { if (!k.keepY.has(i)) unstable.add(t); }); }
      const fA = qA.filter(t => !unstable.has(t)), fB = qB.filter(t => !unstable.has(t)); let firstDiff = -1; for (let i = 0; i < Math.max(fA.length, fB.length); i++) if (fA[i] !== fB[i]) { firstDiff = i; break; }
      const noGate = r => r.cons.filter(t => !/^§(DESK_GATE|BOOT_T)/.test(t)), sigd = sigDiff(signature(noGate(dA)), signature(noGate(dA2))).concat(sigDiff(signature(noGate(dA)), signature(noGate(dAd))), sigDiff(signature(noGate(dA)), signature(noGate(dAd3))), sigDiff(signature(noGate(dA)), signature(noGate(dAd40))), sigDiff(signature(noGate(dA)), signature(noGate(dJ2))), sigDiff(signature(noGate(dA)), signature(noGate(dJ6)))), noiseKeys = new Set(sigd.map(x => x.tag + '|' + (x.key || ''))), noiseTags = new Set(sigd.filter(x => !x.key).map(x => x.tag));
      const dupA = signature(noGate(dA)).get('§SCRIPT_DUP_AUDIT'), dupB = signature(noGate(dB)).get('§SCRIPT_DUP_AUDIT'), dupDeltaD = dupA && dupB ? +dupB.fields.get('total')[0] - +dupA.fields.get('total')[0] : null, dupWantD = inlineAdded();   // a desktop writes the same 4 files the static tags loaded: only the inline scripts are new
      const realSig = sigDiff(signature(noGate(dA)), signature(noGate(dB))).filter(x => !noiseTags.has(x.tag) && !noiseKeys.has(x.tag + '|' + (x.key || '')) && !(SAMPLER.has(x.tag) && x.what !== 'only in A' && x.what !== 'only in B') && !(x.tag === '§SCRIPT_DUP_AUDIT' && x.key === 'total' && dupDeltaD === dupWantD));
      const gate = dB.cons.find(t => /^§DESK_GATE /.test(t)) || '';
      S(`§D1_DETAIL requests=${JSON.stringify(counts)} setups_at_initViewer=${JSON.stringify(dB.bootT && dB.bootT.setups)} main.js:15-16 names ${named.length} of the group's setup functions (${names.join(',') || '-'}: called from main.js's own guarded line, not :15-16) scripts_at_initViewer=${sB.length} same_order_without_config=${sameScripts} config_first=${cfgFirstB}`);
      S(`§D1_SYNC parse-time § tags (logged while a classic script runs): baseline ${yA.length} / A' ${yA2.length} / branch ${yB.length}; baseline A == A': ${syncBase}; branch == baseline A in order: ${syncDiff < 0}${syncDiff >= 0 ? ' (first difference at ' + syncDiff + ': ' + yA[syncDiff] + ' vs ' + yB[syncDiff] + ')' : ''}`);
      S(`§D1_TAGS all boot § tags: baseline ${qA.length} / A' ${qA2.length} / Ad ${qAd.length} / branch ${qB.length} (DESK_GATE and BOOT_T left out); asynchronous tags move between baseline runs (A vs A', and A vs the same code with every response 3 / 15 / 40 ms late, or every script 2 / 6 ms late; ${unstable.size}): ${[...unstable].join(' ') || '-'}; the rest compared in order (informational, not judged): ${fA.length} vs ${fB.length} firstDiff=${firstDiff}${firstDiff >= 0 ? ' ' + fA[firstDiff] + ' vs ' + fB[firstDiff] : ''}; §SCRIPT_DUP_AUDIT delta ${dupDeltaD} (expected = inline scripts added = ${dupWantD}); § field/count differences baseline vs branch beyond the noise floor: ${realSig.length}${realSig.length ? ' ' + realSig.slice(0, 5).map(x => x.tag + ' ' + x.what).join(' | ') : ''}; "${gate}"`);
      if (!dB.ready || !dA.ready || !dA2.ready || !dAd.ready || !dAd3.ready || !dAd40.ready || !dJ2.ready || !dJ6.ready) note('D1', 'INCONCLUSIVE', `desktop not ready (branch=${dB.ready} baseline=${dA.ready} A'=${dA2.ready} Ad=${dAd.ready})`);
      else if (!names.length) note('D1', 'INCONCLUSIVE', 'the group defines no setup function to check');
      else if (once && fnAtBoot && sameScripts && cfgFirstB && syncDiff < 0 && syncBase && yA.length > 0 && realSig.length === 0 && (!ROWS.length || (!!dB.palette && ROWS.every(n => dB.palette.rows[n]))) && /phone=false/.test(gate) && new RegExp(`written=${DESK_NOW.size}`).test(gate)) note('D1', 'PASS', `the desktop Help list still shows ${ROWS.join('+') || '(no row)'}; each of ${GROUP_FILES.length - LAZY_BASE.size} boot files requested once (${LAZY_BASE.size} on-demand file(s) ${[...LAZY_BASE].map(f => f + ' x' + req(f) + ' (baseline x' + reqIn(dA, f) + ')').join(', ') || '-'}: as often as the baseline requests them); ${names.join(',')} is a function at initViewer; ${sB.length} scripts in the baseline's order (config.js first on the branch); ${yB.length} parse-time § tags identical in order, every tag's count and numeric fields identical (the asynchronous tags' order moves with timing, also in the baseline); "${gate}"`);
      else note('D1', 'FAIL', `once=${once} setups_fn=${fnAtBoot} same_script_order=${sameScripts} config_first=${cfgFirstB} sync_order_diff=${syncDiff} baseline_sync_stable=${syncBase} field_diffs=${realSig.length} gate="${gate}"`); }
    // ---- D2
    if (!ONLY || ONLY.includes('D2')) { const before = [], after = [];
      // measured: the run right after a closed browser context is ~25% slower than one that had a pause (teardown still using the CPU), so every run is followed by a 3 s settle and the order alternates (ABAB…BABA)
      for (let i = 0; i < TIMING_RUNS; i++) for (const [arr, port] of (i % 2 ? [[after, br.port], [before, bs.port]] : [[before, bs.port], [after, br.port]])) { const r = await run(browser, port, { noCache: true, bootTOnly: true }); const m = r.cons.map(t => /^§BOOT_T initViewer_ms=(\d+)/.exec(t)).find(Boolean); arr.push(m ? +m[1] : NaN); await sleep(3000); }
      S(`§BOOT_T_BEFORE initViewer_ms=${before.join(',')} median=${median(before)} max=${Math.max(...before)}`); S(`§BOOT_T_AFTER  initViewer_ms=${after.join(',')} median=${median(after)} max=${Math.max(...after)}`);
      if (before.some(Number.isNaN) || after.some(Number.isNaN)) note('D2', 'INCONCLUSIVE', 'a run printed no §BOOT_T');
      else if (median(after) <= Math.max(...before)) note('D2', 'PASS', `after median ${median(after)} ms <= before max ${Math.max(...before)} ms (before median ${median(before)})`);
      else note('D2', 'FAIL', `after median ${median(after)} ms > before max ${Math.max(...before)} ms`); }

    // WO-6: D2 again against the page BEFORE any gate (PRE_REF, default 424473b0^ = the parent of WO-2): the same procedure, all numbers printed, reported as measured and not judged (the order's own start is the acceptance)
    if (STILL && (!ONLY || ONLY.includes('D2'))) { const PRE_REF = process.env.PRE_REF || '424473b0^', sp = await serve(makeOverlay(PRE_REF)), pre = [], after = [];
      try { for (let i = 0; i < TIMING_RUNS; i++) for (const [arr, port] of (i % 2 ? [[after, br.port], [pre, sp.port]] : [[pre, sp.port], [after, br.port]])) { const r = await run(browser, port, { noCache: true, bootTOnly: true }); const m = r.cons.map(t => /^§BOOT_T initViewer_ms=(\d+)/.exec(t)).find(Boolean); arr.push(m ? +m[1] : NaN); await sleep(3000); }
        S(`§BOOT_T_PREGATE ref=${PRE_REF} (${git(['rev-parse', '--short', PRE_REF]).toString().trim()}) initViewer_ms=${pre.join(',')} median=${median(pre)} max=${Math.max(...pre)}`); S(`§BOOT_T_AFTER_VS_PREGATE initViewer_ms=${after.join(',')} median=${median(after)} max=${Math.max(...after)}`);
        S(`§D2_PREGATE reported as measured, not judged: after median ${median(after)} ms vs pre-gate median ${median(pre)} ms (${((median(after) / median(pre) - 1) * 100).toFixed(1)} %), after median ${median(after) <= Math.max(...pre) ? '<=' : '>'} pre-gate max ${Math.max(...pre)} ms`); } finally { sp.srv.close(); } }

    // ======== RED CONTROLS
    if (!ONLY || ONLY.includes('R')) {
    // R1: the phone test removed from _desk -> a phone writes the tags -> P1 must FAIL
    { const ov = withOverride(null, 'viewer/viewer.html', t => { const a = 'if (!phone) for (', b = '  if (_deskPhone()) return;\n'; if (!t.includes(a) || !t.includes(b)) throw new Error('R1: the phone test is not where the witness expects it'); return t.replace(a, 'for (').replace(b, ''); });
      const s = await serve(ov), r = await run(browser, s.port, { phone: true }); s.srv.close(); stamp('phone_R1', r);
      const hits = r.reqs.filter(isGroupUrl).length;
      if (!r.ready) note('R1', 'INCONCLUSIVE', 'the red phone run did not become ready');
      else if (hits > 0) note('R1', 'PASS', `with the phone test removed the phone requested ${hits} group file(s): P1 would FAIL (control detected)`);
      else note('R1', 'FAIL', 'with the phone test removed the phone still requested no group file: P1 cannot fail'); }
    // R2: one guard / hidden control of the group's own step removed -> the check named in RED2 must FAIL on the phone (a group may list several mutations)
    { const mut = [].concat(...GROUPS.map(g => RED2[g] || []));
      if (!mut.length) note('R2', 'INCONCLUSIVE', `no mutation defined for group ${GROUP}`);
      else for (const spec of mut) {
        const what = (spec.from || spec.file).slice(0, 60);
        let ov = null; try { ov = withOverride(null, spec.file, tx => { if (spec.edit) return spec.edit(tx); if (!tx.includes(spec.from)) throw new Error('R2: the text is not where the witness expects it in ' + spec.file); return tx.replace(spec.from, spec.to); }); } catch (e) { note('R2', 'INCONCLUSIVE', e.message); continue; }
        const s = await serve(ov);
        try {
          if (spec.must === 'P3warn' || spec.must === 'P3save' || spec.must === 'P3render') {   // WO-6: the still group's own checks, on the mutated server vs the baseline phone
            if (spec.must === 'P3warn') { const r = await run(browser, s.port, { phone: true }), base = await rowsBaseline(); stamp('phone_R2_warn', r); const hit = r.cons.filter(x => spec.re.test(x)).length, bhit = base.cons.filter(x => spec.re.test(x)).length;
              if (!r.ready) note('R2', 'INCONCLUSIVE', 'the red phone run did not become ready'); else if (hit > 0 && bhit === 0) note('R2', 'PASS', `${spec.file} (${what}): the phone printed ${hit} line(s) "${(r.cons.find(x => spec.re.test(x)) || '').slice(0, 90)}" the baseline phone never prints: P3 would FAIL (control detected)`); else note('R2', 'FAIL', `warning guard removed: mutated phone ${hit} line(s), baseline phone ${bhit}: P3 cannot see a new warning`); continue; }
            if (spec.must === 'P3save') { const base = await saveBase(), r = await runSaveLeg(browser, s.port, base.o && base.o.key), h = saveSame(r, base);
              if (!r.ready) note('R2', 'INCONCLUSIVE', 'the red phone run did not become ready'); else if (h.state === 'FAIL') note('R2', 'PASS', `${spec.file} (${what}): P3's save leg would FAIL (control detected): ${h.why.slice(0, 300)}`); else note('R2', 'FAIL', `save guard removed and the save leg still says ${h.state}: it cannot fail (${h.why.slice(0, 200)})`); continue; }
            const r = await run(browser, s.port, { phone: true, render: true }), base = await rowsBaseline(), h = renderSame(r, base, null); stamp('phone_R2_render', r);
            if (!r.ready) note('R2', 'INCONCLUSIVE', 'the red phone run did not become ready'); else if (h.state === 'FAIL') note('R2', 'PASS', `${spec.file} (${what}): P3's render leg would FAIL (control detected): ${h.why.slice(0, 300)}`); else note('R2', 'FAIL', `the file's tag removed and the render leg still says ${h.state}: it cannot fail (${h.why.slice(0, 200)})`); continue; }
          if (spec.must === 'P4ui' || spec.must === 'P3push' || spec.must === 'P4jump') {   // the fourd UI / push probe on the mutated server vs the baseline phone's
            const r = await runFourdUi(browser, s.port), base = await fourdBase(); stamp('phone_R2_' + spec.must + '_' + path.posix.basename(spec.file), { cons: r.cons });
            const h = spec.must === 'P4ui' ? uiHidden(r, base) : spec.must === 'P4jump' ? jumpHidden(r, base) : pushSame(r, base);
            if (!r.ready) note('R2', 'INCONCLUSIVE', 'the red phone run did not become ready');
            else if (h.state === 'FAIL') note('R2', 'PASS', `${spec.file} (${what}): ${spec.must === 'P3push' ? 'P3' : 'P4'} would FAIL (control detected): ${h.why.slice(0, 260)}`);
            else note('R2', 'FAIL', `${spec.file} mutated and the ${spec.must} check still says ${h.state}: it cannot fail (${h.why.slice(0, 200)})`);
            continue; }
          const r = await run(browser, s.port, { phone: true, palette: true, effects: true }); stamp('phone_R2_' + path.posix.basename(spec.file), r);
          const bad = r.cons.filter(t => /ReferenceError|§LOAD_FAIL|§INIT_VIEWER_TIMEOUT|§INIT_VIEWER_ERROR/.test(t)), p2fails = !!(r.errs.length || bad.length || !r.ready);
          if (spec.must === 'P2') {
            if (p2fails && (r.errs.some(e => spec.re.test(e)) || bad.length)) note('R2', 'PASS', `${spec.file} guard removed (${what}): P2 would FAIL (control detected): ready=${r.ready} pageerrors=${JSON.stringify(r.errs.slice(0, 2))} flagged console lines=${JSON.stringify(bad.slice(0, 2).map(t => t.slice(0, 160)))}`);
            else if (p2fails) note('R2', 'INCONCLUSIVE', `P2 would fail but not on the removed guard: pageerrors=${JSON.stringify(r.errs.slice(0, 2))}`);
            else note('R2', 'FAIL', 'guard removed and P2 still passes: P2 cannot fail'); }
          else if (spec.must === 'P3') {   // the shortcut audit: a key whose handler names a function a phone does not load is a dead key (P3 compares §SHORTCUT_AUDIT dead=)
            const base = await rowsBaseline(), dead = x => { const l = x.cons.find(t => /^§SHORTCUT_AUDIT total=/.test(t)); const m = l && /dead=(\d+)/.exec(l); return m ? +m[1] : null; };
            if (!r.ready || dead(r) == null || dead(base) == null) note('R2', 'INCONCLUSIVE', 'no §SHORTCUT_AUDIT line in a run');
            else if (dead(r) > dead(base)) note('R2', 'PASS', `${spec.file} (${what}): §SHORTCUT_AUDIT dead=${dead(r)} (baseline ${dead(base)}): P3 would FAIL (control detected)`);
            else note('R2', 'FAIL', `the \`t\` route removed and §SHORTCUT_AUDIT dead=${dead(r)} (baseline ${dead(base)}): P3 cannot see a dead key`); }
          else {   // 'P4': the control row must come back on the phone
            const base = await rowsBaseline(); const h = rowsHidden(r, base);
            if (!r.ready) note('R2', 'INCONCLUSIVE', 'the red phone run did not become ready');
            else if (h.state === 'FAIL') note('R2', 'PASS', `${spec.file} hidden-control gate removed (${what}): P4 would FAIL (control detected): ${h.why}`);
            else note('R2', 'FAIL', `control gate removed and P4 still says ${h.state}: P4 cannot fail (${h.why})`); }
        } finally { s.srv.close(); } } }
    // R3: two desk literals of one run swapped where a deps edge joins them -> the order check must FAIL
    { const MS = require(path.join(ROOT, 'scripts', 'lib', 'manifest_source.js')), page = 'viewer/viewer.html', dk = (MAN.order[page] || []).map((s, i) => ({ s, i })).filter(x => x.s.kind === 'desk');
      const runs = []; { const txt = fs.readFileSync(path.join(ROOT, page), 'utf8'), b = /var\s+_DESK\s*=\s*\[([\s\S]*?)\n\];/.exec(txt); (b ? [...b[1].matchAll(/\[([^\[\]]*)\]/g)] : []).forEach(x => runs.push([...x[1].matchAll(/'([^'?]+)\?v=/g)].map(y => path.posix.normalize('viewer/' + y[1])))); }
      let edge = null; for (const rn of runs) for (const a of rn) for (const b of rn) if (a !== b && (MAN.modules[a].deps || []).includes(b)) edge = edge || { a, b };
      if (!edge) { note('R3', 'INCONCLUSIVE', `no deps edge joins two files of one run of group ${GROUP} (deps of its files: ${GROUP_FILES.map(f => f + '=' + JSON.stringify(MAN.modules[f].deps)).join(' ')}); the order check on desk sites is exercised by W-MANIFEST-ROUNDTRIP R32 with synthetic edges`); }
      else { const mm = JSON.parse(JSON.stringify(MAN)), o = mm.order[page], ia = o.findIndex(s => s.kind === 'desk' && path.posix.normalize('viewer/' + s.as) === edge.a), ib = o.findIndex(s => s.kind === 'desk' && path.posix.normalize('viewer/' + s.as) === edge.b);
        const ok0 = MS.order(MAN, ROOT).errors.length === 0; [o[ia], o[ib]] = [o[ib], o[ia]]; const e = MS.order(mm, ROOT).errors;
        note('R3', ok0 && e.length > 0 ? 'PASS' : 'FAIL', `swapped ${edge.a} and ${edge.b} (deps edge): the order check printed ${e.length} refusal(s): ${e.slice(0, 1).join(' ')} (real manifest clean: ${ok0})`); } }
    // R4 (film only): the phone filter of effects.js removed -> the flagged effects parts are missing on a phone -> §SPLIT_PART_MISSING and no §EFFECTS_SKIP: P4 must FAIL
    if (GROUPS.includes('film') || STILL) { const ov = withOverride(null, 'viewer/effects.js', tx => { const a = "if (window._caps && window._caps.phone) ORDER = ORDER.filter(function (n) { return n === 'composer'; });"; if (!tx.includes(a)) throw new Error('R4: the phone filter is not where the witness expects it'); return tx.replace(a, ''); });
      const s = await serve(ov), r = await run(browser, s.port, { phone: true, palette: true, effects: true }); s.srv.close(); stamp('phone_R4', r); const base = await rowsBaseline(), f = fxState(r, base);
      if (!r.ready && !r.cons.some(t => /§SPLIT_PART_MISSING/.test(t))) note('R4', 'INCONCLUSIVE', 'the red phone run did not become ready and nothing was reported');
      else if (f.state === 'FAIL') note('R4', 'PASS', `effects.js phone filter removed: P4 would FAIL (control detected): ${f.why}`);
      else note('R4', 'FAIL', `effects.js phone filter removed and P4's effects check still says ${f.state}: it cannot fail (${f.why})`); }
    }
  } finally { await browser.close(); br.srv.close(); bs.srv.close(); bd.srv.close(); bd3.srv.close(); bd40.srv.close(); bj2.srv.close(); bj6.srv.close(); }

  const fail = res.filter(r => r.state === 'FAIL').length, inc = res.filter(r => r.state === 'INCONCLUSIVE').length;
  const allowed = res.filter(r => r.state === 'INCONCLUSIVE' && r.id === 'R3' && /no deps edge joins/.test(r.why)).length;
  const verdict = fail ? 'FAIL' : ONLY ? 'INCONCLUSIVE' : (inc - allowed) > 0 ? 'INCONCLUSIVE' : res.length < 8 ? 'INCONCLUSIVE' : 'PASS';
  S(`§W-PHONE-AXE group=${GROUP} checks=${res.length} fail=${fail} inconclusive=${inc} verdict=${verdict}`);
  fs.writeFileSync(LOG, out.join('\n') + '\n'); process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(e => { S('§W-PHONE-AXE FAIL fatal=' + (e && e.stack || e)); try { fs.writeFileSync(LOG, out.join('\n') + '\n'); } catch (x) { /* log dir */ } process.exit(1); });
