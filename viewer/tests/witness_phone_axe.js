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
// VERDICT: §W-PHONE-AXE group=rules checks=8 fail=<n> inconclusive=<n> verdict=PASS|FAIL|INCONCLUSIVE   (PASS allows ONLY the R3 "no deps edge in the group" inconclusive; any other inconclusive = INCONCLUSIVE)
// Run:  node viewer/tests/witness_phone_axe.js            (env: GROUP=rules  BASE_REF=<default: the merge-base of HEAD and origin/main, i.e. origin/main once it is merged in>  PW=<playwright path>  PHONE_AXE_LOG=<file>  TIMING_RUNS=5)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const ROOT = path.join(__dirname, '..', '..'), GROUP = process.env.GROUP || 'rules', BASE_REF = process.env.BASE_REF || cp.execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], { cwd: path.join(__dirname, '..', '..') }).toString().trim(), TIMING_RUNS = +(process.env.TIMING_RUNS || 5);
const LOG = process.env.PHONE_AXE_LOG || path.join(__dirname, 'witness_phone_axe.log');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.sql': 'text/plain', '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
const URL_PATH = '/viewer/viewer.html?db=buildings/Duplex_extracted.db';
const PHONE = { viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true, serviceWorkers: 'block',
  userAgent: 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36' };
const DESKTOP = { viewport: { width: 1400, height: 900 }, serviceWorkers: 'block' };
const LAUNCH = { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] };   // the options witness_boot_cpe_lazy.js uses: no GPU flags added, never headed

const out = []; const S = m => { out.push(m); console.log(m); };
const git = (args, opt) => cp.execFileSync('git', args, Object.assign({ cwd: ROOT, maxBuffer: 1 << 28 }, opt || {}));
const res = [];   // {id, state, why}
const note = (id, state, why) => { res.push({ id, state, why }); S(`§W-PHONE-AXE ${id} ${state} ${why}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const median = a => { const s = a.slice().sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

// ---- the group, from the manifest
const MAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'modules.json'), 'utf8'));
const GROUP_FILES = Object.entries(MAN.modules).filter(([, v]) => v.phone === false && v.phoneGroup === GROUP).map(([f]) => f).sort();
const GROUP_BASE = GROUP_FILES.map(f => path.posix.basename(f));
const isGroupUrl = u => GROUP_BASE.some(b => new RegExp('/' + b.replace(/\./g, '\\.') + '(\\?|$)').test(u));

// ---- the servers: the branch tree, and the same tree with the changed files taken from BASE_REF
const changed = git(['diff', '--name-only', BASE_REF]).toString().split('\n').filter(Boolean);
const baseText = p => { try { return git(['show', BASE_REF + ':' + p], { stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { return null; } };
const BOOT_T_LINE = "  console.log('§BOOT_T initViewer_ms=' + Math.round(performance.now()));   // MOBILE_PERF WO-2 step 6: the clock the phone-gate witness (D2) reads; first statement on purpose\n";
const overlayBase = new Map();   // path -> Buffer | null (null: the file does not exist at BASE_REF)
for (const p of changed) overlayBase.set(p, baseText(p));
{ const m = overlayBase.get('viewer/main.js') || baseText('viewer/main.js'); let t = m.toString('utf8');
  if (!t.includes('§BOOT_T')) { const a = 'async function initViewer() {\n'; if (!t.includes(a)) throw new Error('initViewer not found in the baseline main.js'); t = t.replace(a, a + BOOT_T_LINE); }
  overlayBase.set('viewer/main.js', Buffer.from(t, 'utf8')); }
function serve(overlay, delayMs) {   // delayMs: every response is held back this long (the baseline under a different timing: tags that move are asynchronous by nature)
  const srv = http.createServer((req, res0) => {
    const res = delayMs ? { writeHead: (...a) => { res0._h = a; }, end: b => setTimeout(() => { res0.writeHead(...(res0._h || [200])); res0.end(b); }, delayMs) } : res0;
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
    if (typeof t === 'string' && t.indexOf('§BOOT_T') === 0) window.__bootT = { setups: names.map(n => [n, typeof window[n]]), scripts: [...document.scripts].map(s => s.src).filter(x => x && !/^blob:/.test(x)) };
    return ol.apply(console, arguments); }; }, window_setup_names());
  await page.goto('http://127.0.0.1:' + port + URL_PATH, { waitUntil: 'domcontentloaded' });
  const r = { cons, reqs, errs, ready: false, steps: {} };
  if (opts.bootTOnly) { for (let i = 0; i < 90 && !cons.some(t => t.indexOf('§BOOT_T') === 0); i++) await sleep(500); await ctx.close(); return r; }
  r.ready = await waitReady(page);
  r.scripts = await page.evaluate(() => [...document.scripts].map(s => s.src).filter(Boolean)).catch(() => []);
  r.bootT = await page.evaluate(() => window.__bootT || null).catch(() => null);
  if (r.ready && opts.steps) {
    r.mark = { building: cons.length };
    await page.evaluate(() => { if (typeof toggleWalkMode === 'function') toggleWalkMode(); }); await page.waitForTimeout(1500);
    r.steps.walk = await page.evaluate(() => !!(window.APP && (window.APP.walkModeActive || window.APP._walkMode))); r.mark.walk = cons.length;
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
    await page.waitForFunction(() => typeof XLSX !== 'undefined', null, { timeout: 20000 }).catch(() => {});   // the Issue Log loads SheetJS on demand (excel.js): wait for it in every run, so its § line is not a race
    await page.waitForTimeout(1000);
  }
  await ctx.close();
  return r;
}
// the setup functions of the group (top-level `function setupX` of its files), judged at the §BOOT_T moment
function window_setup_names() { const n = []; for (const f of GROUP_FILES) { const t = fs.readFileSync(path.join(ROOT, f), 'utf8'); for (const m of t.matchAll(/^(?:async\s+)?function\s+(setup[A-Za-z0-9_$]*)\s*\(/gm)) n.push(m[1]); } return [...new Set(n)]; }

// §SCRIPT_DUP_AUDIT total= counts document.scripts: the gate removes the group's static tags from a phone's page and adds the inline scripts of the frame (the _DESK block + one _desk(i) call per run) — computed, not assumed
const inlineOf = txt => require(path.join(ROOT, 'scripts', 'lib', 'page_refs.js')).readHtml(txt).inline.length;
const inlineAdded = () => inlineOf(fs.readFileSync(path.join(ROOT, 'viewer', 'viewer.html'), 'utf8')) - inlineOf((overlayBase.get('viewer/viewer.html') || fs.readFileSync(path.join(ROOT, 'viewer', 'viewer.html'))).toString('utf8'));
// tags a TIMER emits (frame sampler main.js §FPS_MODE: a mean/max/n over the frames since the last line, one line per interval): their count and n follow elapsed time, so they are judged for presence only
const SAMPLER = new Set(['§FPS_MODE']);
// ---- the § tag signature of a run
const tagOf = t => { const m = /^§[A-Za-z0-9_\-]+/.exec(t); return m ? m[0] : null; };
const fieldsOf = t => [...t.matchAll(/([A-Za-z_][A-Za-z0-9_]*)=(-?\d+(?:\.\d+)?)(?![\w.])/g)].map(m => [m[1], m[2]]);
function signature(cons) {   // tag -> {count, fields: key -> sorted values}
  const sig = new Map();
  for (const t of cons) { const g = tagOf(t); if (!g) continue; const e = sig.get(g) || { count: 0, fields: new Map() }; e.count++;
    for (const [k, v] of fieldsOf(t)) { const a = e.fields.get(k) || []; a.push(v); e.fields.set(k, a); } sig.set(g, e); }
  return sig;
}
/** What differs between two signatures: {tag, what}. */
function sigDiff(a, b) {
  const d = [];
  for (const g of new Set([...a.keys(), ...b.keys()])) { const x = a.get(g), y = b.get(g);
    if (!x || !y) { d.push({ tag: g, what: 'only in ' + (x ? 'A' : 'B') }); continue; }
    if (x.count !== y.count) d.push({ tag: g, what: `count ${x.count} vs ${y.count}` });
    for (const k of new Set([...x.fields.keys(), ...y.fields.keys()])) { const p = (x.fields.get(k) || []).slice().sort().join(','), q = (y.fields.get(k) || []).slice().sort().join(',');
      if (p !== q) d.push({ tag: g, key: k, what: `${k}: ${p.slice(0, 60)} vs ${q.slice(0, 60)}` }); } }
  return d;
}
const keptFiles = () => { const files = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!/node_modules|buildings|^tests?$/.test(e.name)) walk(p); } else if (/\.js$/.test(e.name)) files.push(p); } })(path.join(ROOT, 'viewer')); return files; };

(async () => {
  S(`§PHONE_AXE_GROUP group=${GROUP} files=${GROUP_FILES.length} ${GROUP_FILES.join(',')} base_ref=${BASE_REF} base=${git(['rev-parse', '--short', BASE_REF]).toString().trim()} changed_vs_base=${changed.length}`);
  if (!GROUP_FILES.length) { S(`§W-PHONE-AXE group=${GROUP} checks=0 fail=0 inconclusive=1 verdict=INCONCLUSIVE (no module flagged for this group)`); fs.writeFileSync(LOG, out.join('\n') + '\n'); process.exit(1); }
  const br = await serve(null), bs = await serve(overlayBase), bd = await serve(overlayBase, 15), bd3 = await serve(overlayBase, 3), bd40 = await serve(overlayBase, 40), browser = await chromium.launch(LAUNCH);
  const stamp = (id, r) => fs.writeFileSync(path.join(os.tmpdir(), `phone_axe_${id}.console.log`), r.cons.join('\n') + '\n');
  try {
    // ======== PHONE: branch, baseline A, baseline A'
    S('── PHONE 412x823 touch: branch ──'); const pB = await run(browser, br.port, { phone: true, steps: true }); stamp('phone_branch', pB);
    S('── PHONE: baseline (origin/main + step 6) run A ──'); const pA = await run(browser, bs.port, { phone: true, steps: true }); stamp('phone_baseA', pA);
    S('── PHONE: baseline run A\' (same code again: the noise floor) ──'); const pA2 = await run(browser, bs.port, { phone: true, steps: true }); stamp('phone_baseA2', pA2);
    S('── PHONE: baseline run Ad (same code, every response 15 ms late: what moves with timing) ──'); const pAd = await run(browser, bd.port, { phone: true, steps: true }); stamp('phone_baseAd', pAd);
    S(`§PHONE_RUNS branch: ready=${pB.ready} cons=${pB.cons.length} reqs=${pB.reqs.length} steps=${JSON.stringify(pB.steps)} | baseline A: ready=${pA.ready} cons=${pA.cons.length} steps=${JSON.stringify(pA.steps)} | A': ready=${pA2.ready} cons=${pA2.cons.length} steps=${JSON.stringify(pA2.steps)} | Ad: ready=${pAd.ready} cons=${pAd.cons.length}`);

    // ---- P1
    { const hits = pB.reqs.filter(isGroupUrl), gate = pB.cons.find(t => /^§DESK_GATE /.test(t)) || '', inScripts = (pB.scripts || []).filter(isGroupUrl);
      const baseHits = pA.reqs.filter(isGroupUrl).length;   // the control: the SAME population is requested by the baseline's phone (its static tags), so "0" is not an empty-page artefact
      if (!pB.ready || !GROUP_FILES.length) note('P1', 'INCONCLUSIVE', `ready=${pB.ready} files=${GROUP_FILES.length}`);
      else if (baseHits === 0) note('P1', 'INCONCLUSIVE', 'the baseline phone requested none of the group files either: the count of 0 would prove nothing');
      else if (hits.length === 0 && /phone=true/.test(gate) && /written=0/.test(gate) && inScripts.length === 0) note('P1', 'PASS', `0 requests for ${GROUP_FILES.length} group files (baseline phone: ${baseHits}); "${gate}"; document.scripts holds none`);
      else note('P1', 'FAIL', `requests=${hits.length} (${hits.slice(0, 3).join(' ')}) gate="${gate}" in_document_scripts=${inScripts.length}`); }
    // ---- P2
    { const bad = pB.cons.filter(t => /ReferenceError|§LOAD_FAIL|§INIT_VIEWER_TIMEOUT/.test(t)), bt = pB.cons.find(t => /^§BOOT_T /.test(t)) || '';
      if (!pB.ready && !pB.errs.length && !bad.length) note('P2', 'INCONCLUSIVE', 'the phone viewer never became ready and nothing was reported');
      else if (pB.ready && !pB.errs.length && !bad.length && bt) note('P2', 'PASS', `ready, 0 page errors, 0 ReferenceError/§LOAD_FAIL/§INIT_VIEWER_TIMEOUT, "${bt}"`);
      else note('P2', 'FAIL', `ready=${pB.ready} pageerrors=${JSON.stringify(pB.errs.slice(0, 3))} bad=${JSON.stringify(bad.slice(0, 3))} boot_t=${bt || 'MISSING'}`); }
    // ---- P3
    { const sA = signature(pA.cons), sA2 = signature(pA2.cons), sB = signature(pB.cons), noise = sigDiff(sA, sA2).concat(sigDiff(sA, signature(pAd.cons))), noisy = new Set(noise.map(x => x.tag + '|' + (x.key || ''))), noisyTag = new Set(noise.filter(x => !x.key).map(x => x.tag));
      const raw = sigDiff(sA, sB).filter(x => !['§DESK_GATE', '§BOOT_T'].includes(x.tag) && !(SAMPLER.has(x.tag) && x.what !== 'only in A' && x.what !== 'only in B'));
      const real = raw.filter(x => !noisyTag.has(x.tag) && !noisy.has(x.tag + '|' + (x.key || '')) && !(x.key && noisyTag.has(x.tag)));
      const files = keptFiles().filter(f => !GROUP_FILES.includes(path.relative(ROOT, f).split(path.sep).join('/'))).map(f => fs.readFileSync(f, 'utf8'));
      const inlineAddedN = inlineAdded();
      const dupA = sA.get('§SCRIPT_DUP_AUDIT'), dupB = sB.get('§SCRIPT_DUP_AUDIT'), dupDelta = dupA && dupB ? +dupB.fields.get('total')[0] - +dupA.fields.get('total')[0] : null, dupWant = inlineAddedN - GROUP_FILES.length;
      S(`§P3_ARITH §SCRIPT_DUP_AUDIT total: baseline ${dupA && dupA.fields.get('total')[0]} branch ${dupB && dupB.fields.get('total')[0]} delta=${dupDelta}; expected = inline scripts added to the page (${inlineAddedN}) - group files no longer on a phone's page (${GROUP_FILES.length}) = ${dupWant}`);
      const onlyGroup = [], unexplained = [], arith = [];
      for (const x of real) { if (x.tag === '§SCRIPT_DUP_AUDIT' && x.key === 'total' && dupDelta === dupWant) { arith.push(x); continue; } const inKept = files.some(t => t.includes(x.tag)); if (!inKept) onlyGroup.push(x); else unexplained.push(x); }
      S(`§P3_NOISE baseline A vs A' and A vs Ad (15 ms late): ${noise.length} differences over ${new Set(noise.map(x => x.tag)).size} tags (not judged): ${[...new Set(noise.map(x => x.tag + (x.key ? '.' + x.key : '')))].slice(0, 40).join(' ')}`);
      S(`§P3_DIFF branch vs baseline A: ${raw.length} raw, ${real.length} after the noise floor; only-in-the-group tags: ${onlyGroup.map(x => x.tag + ' (' + x.what + ')').join('; ') || '-'}; unexplained: ${unexplained.map(x => x.tag + ' (' + x.what + ')').join('; ') || '-'}`);
      const pop = (r, id) => r.cons.slice(r.mark ? r.mark.walk : 0).filter(t => id.test(t)).length;
      const vac = !(pB.steps.pick && pB.steps.issues && pA.steps.pick && pA.steps.issues);
      S(`§P3_POPULATION branch: tags=${sB.size} lines=${pB.cons.filter(tagOf).length} walk_active=${pB.steps.walk} pick=${pB.steps.pick} issues_open=${pB.steps.issues} §PICK_lines=${pB.cons.filter(t => /^§PICK /.test(t)).length} | baseline A: tags=${sA.size} walk_active=${pA.steps.walk} pick=${pA.steps.pick} issues_open=${pA.steps.issues}`);
      if (!pB.ready || !pA.ready || !pA2.ready || !pAd.ready) note('P3', 'INCONCLUSIVE', `a run did not become ready (branch=${pB.ready} A=${pA.ready} A'=${pA2.ready} Ad=${pAd.ready})`);
      else if (vac) note('P3', 'INCONCLUSIVE', 'a step did not happen (pick or Issue Log) in the branch or the baseline: the lists would be compared on a shorter path than required');
      else if (unexplained.length) note('P3', 'FAIL', `${unexplained.length} difference(s) the group cannot explain: ${unexplained.slice(0, 6).map(x => x.tag + ' ' + x.what).join(' | ')}`);
      else note('P3', 'PASS', `${sB.size} § tags, the same as the baseline over boot -> building -> Walk(active=${pB.steps.walk}) -> pick -> Issue Log; ${noise.length} noise differences between two baseline runs not judged; ${onlyGroup.length} difference(s) only in group-only tags (grep-proven: in no kept file); ${arith.length} explained by the script-count arithmetic above`); }

    // ======== DESKTOP
    S('── DESKTOP 1400x900: branch / baseline ──');
    const dB = await run(browser, br.port, {}); stamp('desk_branch', dB); const dA = await run(browser, bs.port, {}); stamp('desk_baseA', dA);
    // ---- D1
    { const dA2 = await run(browser, bs.port, {}); stamp('desk_baseA2', dA2); const dAd = await run(browser, bd.port, {}); stamp('desk_baseAd', dAd); const dAd3 = await run(browser, bd3.port, {}); stamp('desk_baseAd3', dAd3); const dAd40 = await run(browser, bd40.port, {}); stamp('desk_baseAd40', dAd40);
      const req = f => dB.reqs.filter(u => new RegExp('/' + f.replace(/\./g, '\\.') + '(\\?|$)').test(u)).length, counts = GROUP_BASE.map(f => [f, req(f)]), once = counts.every(([, n]) => n === 1);
      const names = window_setup_names(), mainTxt = fs.readFileSync(path.join(ROOT, 'viewer', 'main.js'), 'utf8').split('\n'), named = names.filter(n => mainTxt.slice(14, 17).join('\n').includes(n));
      const fnAtBoot = dB.bootT ? dB.bootT.setups.every(([, ty]) => ty === 'function') : false;
      const nb = u => u.split('?')[0].replace(/^https?:\/\/[^/]+/, ''), listOf = r => ((r.bootT && r.bootT.scripts) || []).map(nb), sB = listOf(dB).filter(u => !/\/config\.js$/.test(u)), sA = listOf(dA).filter(u => !/\/config\.js$/.test(u));
      const sameScripts = sB.length > 0 && sB.length === sA.length && sB.every((u, i) => u === sA[i]), cfgFirstB = listOf(dB)[0] === '/viewer/config.js';
      // the boot § tag list: async fetch callbacks reorder a few tags between two runs of the SAME code, so the tags that move between baseline runs A and A' are the noise floor and are left out; the rest must match IN ORDER
      const seq = r => r.cons.filter(tagOf).map(tagOf).filter(t => !['§DESK_GATE', '§BOOT_T'].includes(t));
      const lcsKeep = (x, y) => { const n = x.length, m = y.length, d = Array.from({ length: n + 1 }, () => new Int32Array(m + 1)); for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) d[i][j] = x[i] === y[j] ? d[i + 1][j + 1] + 1 : Math.max(d[i + 1][j], d[i][j + 1]);
        const keepX = new Set(), keepY = new Set(); let i = 0, j = 0; while (i < n && j < m) { if (x[i] === y[j]) { keepX.add(i); keepY.add(j); i++; j++; } else if (d[i + 1][j] >= d[i][j + 1]) i++; else j++; } return { keepX, keepY }; };
      const qA = seq(dA), qA2 = seq(dA2), qAd = seq(dAd), qB = seq(dB), unstable = new Set();
      for (const other of [qA2, qAd, seq(dAd3), seq(dAd40)]) { const k = lcsKeep(qA, other); qA.forEach((t, i) => { if (!k.keepX.has(i)) unstable.add(t); }); other.forEach((t, i) => { if (!k.keepY.has(i)) unstable.add(t); }); }
      const fA = qA.filter(t => !unstable.has(t)), fB = qB.filter(t => !unstable.has(t)); let firstDiff = -1; for (let i = 0; i < Math.max(fA.length, fB.length); i++) if (fA[i] !== fB[i]) { firstDiff = i; break; }
      const noGate = r => r.cons.filter(t => !/^§(DESK_GATE|BOOT_T)/.test(t)), sigd = sigDiff(signature(noGate(dA)), signature(noGate(dA2))).concat(sigDiff(signature(noGate(dA)), signature(noGate(dAd))), sigDiff(signature(noGate(dA)), signature(noGate(dAd3))), sigDiff(signature(noGate(dA)), signature(noGate(dAd40)))), noiseKeys = new Set(sigd.map(x => x.tag + '|' + (x.key || ''))), noiseTags = new Set(sigd.filter(x => !x.key).map(x => x.tag));
      const dupA = signature(noGate(dA)).get('§SCRIPT_DUP_AUDIT'), dupB = signature(noGate(dB)).get('§SCRIPT_DUP_AUDIT'), dupDeltaD = dupA && dupB ? +dupB.fields.get('total')[0] - +dupA.fields.get('total')[0] : null, dupWantD = inlineAdded();   // a desktop writes the same 4 files the static tags loaded: only the inline scripts are new
      const realSig = sigDiff(signature(noGate(dA)), signature(noGate(dB))).filter(x => !noiseTags.has(x.tag) && !noiseKeys.has(x.tag + '|' + (x.key || '')) && !(SAMPLER.has(x.tag) && x.what !== 'only in A' && x.what !== 'only in B') && !(x.tag === '§SCRIPT_DUP_AUDIT' && x.key === 'total' && dupDeltaD === dupWantD));
      const gate = dB.cons.find(t => /^§DESK_GATE /.test(t)) || '';
      S(`§D1_DETAIL requests=${JSON.stringify(counts)} setups_at_initViewer=${JSON.stringify(dB.bootT && dB.bootT.setups)} main.js:15-16 names ${named.length} of the group's setup functions (${names.join(',') || '-'}: called from main.js's own guarded line, not :15-16) scripts_at_initViewer=${sB.length} same_order_without_config=${sameScripts} config_first=${cfgFirstB}`);
      S(`§D1_TAGS boot § tag list: baseline ${qA.length} / A' ${qA2.length} / Ad ${qAd.length} / branch ${qB.length} (DESK_GATE and BOOT_T left out); tags that move between baseline runs (A vs A', and A vs the same code with every response 3 / 15 / 40 ms late; ${unstable.size}): ${[...unstable].join(' ') || '-'}; compared in order after leaving those out: ${fA.length} vs ${fB.length} firstDiff=${firstDiff}${firstDiff >= 0 ? ' ' + fA[firstDiff] + ' vs ' + fB[firstDiff] : ''}; §SCRIPT_DUP_AUDIT delta ${dupDeltaD} (expected = inline scripts added = ${dupWantD}); § field/count differences baseline vs branch beyond the noise floor: ${realSig.length}${realSig.length ? ' ' + realSig.slice(0, 5).map(x => x.tag + ' ' + x.what).join(' | ') : ''}; "${gate}"`);
      if (!dB.ready || !dA.ready || !dA2.ready || !dAd.ready || !dAd3.ready || !dAd40.ready) note('D1', 'INCONCLUSIVE', `desktop not ready (branch=${dB.ready} baseline=${dA.ready} A'=${dA2.ready} Ad=${dAd.ready})`);
      else if (!names.length) note('D1', 'INCONCLUSIVE', 'the group defines no setup function to check');
      else if (once && fnAtBoot && sameScripts && cfgFirstB && firstDiff < 0 && realSig.length === 0 && /phone=false/.test(gate) && new RegExp(`written=${GROUP_FILES.length}`).test(gate)) note('D1', 'PASS', `each of ${GROUP_FILES.length} files requested once; ${names.join(',')} is a function at initViewer; ${sB.length} scripts in the baseline's order (config.js first on the branch); ${fB.length} boot § tags identical in order (${unstable.size} tags that already move between baseline runs left out); "${gate}"`);
      else note('D1', 'FAIL', `once=${once} setups_fn=${fnAtBoot} same_script_order=${sameScripts} config_first=${cfgFirstB} tag_list_first_diff=${firstDiff} field_diffs=${realSig.length} gate="${gate}"`); }
    // ---- D2
    { const before = [], after = [];
      // measured: the run right after a closed browser context is ~25% slower than one that had a pause (teardown still using the CPU), so every run is followed by a 3 s settle and the order alternates (ABAB…BABA)
      for (let i = 0; i < TIMING_RUNS; i++) for (const [arr, port] of (i % 2 ? [[after, br.port], [before, bs.port]] : [[before, bs.port], [after, br.port]])) { const r = await run(browser, port, { noCache: true, bootTOnly: true }); const m = r.cons.map(t => /^§BOOT_T initViewer_ms=(\d+)/.exec(t)).find(Boolean); arr.push(m ? +m[1] : NaN); await sleep(3000); }
      S(`§BOOT_T_BEFORE initViewer_ms=${before.join(',')} median=${median(before)} max=${Math.max(...before)}`); S(`§BOOT_T_AFTER  initViewer_ms=${after.join(',')} median=${median(after)} max=${Math.max(...after)}`);
      if (before.some(Number.isNaN) || after.some(Number.isNaN)) note('D2', 'INCONCLUSIVE', 'a run printed no §BOOT_T');
      else if (median(after) <= Math.max(...before)) note('D2', 'PASS', `after median ${median(after)} ms <= before max ${Math.max(...before)} ms (before median ${median(before)})`);
      else note('D2', 'FAIL', `after median ${median(after)} ms > before max ${Math.max(...before)} ms`); }

    // ======== RED CONTROLS
    // R1: the phone test removed from _desk -> a phone writes the tags -> P1 must FAIL
    { const ov = withOverride(null, 'viewer/viewer.html', t => { const a = 'if (!phone) for (', b = '  if (_deskPhone()) return;\n'; if (!t.includes(a) || !t.includes(b)) throw new Error('R1: the phone test is not where the witness expects it'); return t.replace(a, 'for (').replace(b, ''); });
      const s = await serve(ov), r = await run(browser, s.port, { phone: true }); s.srv.close(); stamp('phone_R1', r);
      const hits = r.reqs.filter(isGroupUrl).length;
      if (!r.ready) note('R1', 'INCONCLUSIVE', 'the red phone run did not become ready');
      else if (hits > 0) note('R1', 'PASS', `with the phone test removed the phone requested ${hits} group file(s): P1 would FAIL (control detected)`);
      else note('R1', 'FAIL', 'with the phone test removed the phone still requested no group file: P1 cannot fail'); }
    // R2: one guard of step 4 removed -> P2 must FAIL on the phone
    { const ov = withOverride(null, 'viewer/main.js', t => { const a = "if (typeof setupRuleChecklist === 'function') setupRuleChecklist(APP);"; if (!t.includes(a)) throw new Error('R2: the guard is not where the witness expects it'); return t.replace(a, 'setupRuleChecklist(APP);'); });
      const s = await serve(ov), r = await run(browser, s.port, { phone: true }); s.srv.close(); stamp('phone_R2', r);
      const bad = r.cons.filter(t => /ReferenceError|§LOAD_FAIL|§INIT_VIEWER_TIMEOUT/.test(t)), p2fails = !!(r.errs.length || bad.length || !r.ready);
      if (p2fails && (r.errs.some(e => /setupRuleChecklist/.test(e)) || bad.length)) note('R2', 'PASS', `guard removed: P2 would FAIL (control detected): ready=${r.ready} pageerrors=${JSON.stringify(r.errs.slice(0, 2))} flagged console lines=${JSON.stringify(bad.slice(0, 2).map(t => t.slice(0, 160)))}`);
      else if (p2fails) note('R2', 'INCONCLUSIVE', `P2 would fail but not on the removed guard: pageerrors=${JSON.stringify(r.errs.slice(0, 2))}`);
      else note('R2', 'FAIL', 'guard removed and P2 still passes: P2 cannot fail'); }
    // R3: two desk literals of one run swapped where a deps edge joins them -> the order check must FAIL
    { const MS = require(path.join(ROOT, 'scripts', 'lib', 'manifest_source.js')), page = 'viewer/viewer.html', dk = (MAN.order[page] || []).map((s, i) => ({ s, i })).filter(x => x.s.kind === 'desk');
      const runs = []; { const txt = fs.readFileSync(path.join(ROOT, page), 'utf8'), b = /var\s+_DESK\s*=\s*\[([\s\S]*?)\n\];/.exec(txt); (b ? [...b[1].matchAll(/\[([^\[\]]*)\]/g)] : []).forEach(x => runs.push([...x[1].matchAll(/'([^'?]+)\?v=/g)].map(y => 'viewer/' + y[1]))); }
      let edge = null; for (const rn of runs) for (const a of rn) for (const b of rn) if (a !== b && (MAN.modules[a].deps || []).includes(b)) edge = edge || { a, b };
      if (!edge) { note('R3', 'INCONCLUSIVE', `no deps edge joins two files of one run of group ${GROUP} (deps of its files: ${GROUP_FILES.map(f => f + '=' + JSON.stringify(MAN.modules[f].deps)).join(' ')}); the order check on desk sites is exercised by W-MANIFEST-ROUNDTRIP R32 with synthetic edges`); }
      else { const mm = JSON.parse(JSON.stringify(MAN)), o = mm.order[page], ia = o.findIndex(s => s.kind === 'desk' && 'viewer/' + s.as === edge.a), ib = o.findIndex(s => s.kind === 'desk' && 'viewer/' + s.as === edge.b);
        const ok0 = MS.order(MAN, ROOT).errors.length === 0; [o[ia], o[ib]] = [o[ib], o[ia]]; const e = MS.order(mm, ROOT).errors;
        note('R3', ok0 && e.length > 0 ? 'PASS' : 'FAIL', `swapped ${edge.a} and ${edge.b} (deps edge): the order check printed ${e.length} refusal(s): ${e.slice(0, 1).join(' ')} (real manifest clean: ${ok0})`); } }
  } finally { await browser.close(); br.srv.close(); bs.srv.close(); bd.srv.close(); bd3.srv.close(); bd40.srv.close(); }

  const fail = res.filter(r => r.state === 'FAIL').length, inc = res.filter(r => r.state === 'INCONCLUSIVE').length;
  const allowed = res.filter(r => r.state === 'INCONCLUSIVE' && r.id === 'R3' && /no deps edge joins/.test(r.why)).length;
  const verdict = fail ? 'FAIL' : (inc - allowed) > 0 ? 'INCONCLUSIVE' : res.length < 8 ? 'INCONCLUSIVE' : 'PASS';
  S(`§W-PHONE-AXE group=${GROUP} checks=${res.length} fail=${fail} inconclusive=${inc} verdict=${verdict}`);
  fs.writeFileSync(LOG, out.join('\n') + '\n'); process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(e => { S('§W-PHONE-AXE FAIL fatal=' + (e && e.stack || e)); try { fs.writeFileSync(LOG, out.join('\n') + '\n'); } catch (x) { /* log dir */ } process.exit(1); });
