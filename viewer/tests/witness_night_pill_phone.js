// ⚠ DO NOT REMOVE — WITNESS W-NIGHT-PHONE (bim-compiler prompts/MOBILE_PERF.md, owner of the phone lane). READ THE LOG after every run; the exit code is not evidence.
// ISSUE THIS PROVES OR DISPROVES: "the Night pill throws on a phone". viewer/tools.js (_nightUpdateLights, _lampZonePick) called A._tmIsVisible(guid), which only
//   viewer/fx_props_staffage.js (phase 2) defines, and a phone never loads that file -> `TypeError: A._tmIsVisible is not a function` on the Duplex. The intended default (tools.js
//   comment at §NIGHT_BUILDUP_GATE) is "visible" when Time Machine is not driving the scene. The fix reads the guard as `typeof A._tmIsVisible === 'function' ? ... : true`.
// Two profiles on the Duplex, service workers blocked, headless, the launch options witness_phone_axe.js uses (no GPU flags, never headed). The Night pill is pressed through its own
//   registered action, A._pillRun('night') (panels.js action id 'night' -> toggleNightMode), no real tap needed.
//   BASELINE = origin/main as this branch started from / was merged with (BASE_REF = git merge-base HEAD origin/main): the files this branch changed are served from `git show <BASE_REF>:<path>`.
//   N1  RED CONTROL, baseline on the phone profile: pressing the pill logs the TypeError (caught from the call or as a page error) -> the defect is reproduced. Not reproduced = INCONCLUSIVE.
//   N2  branch, phone profile: no exception, no page error; the code's own lines are read: §NIGHT_MODE fixtures=<n> (n > 0) and §NIGHT_MEM_WITNESS nightLights=<m> (m > 0), the lights the
//       pill actually created; the number of THREE.PointLight objects in the scene is printed beside it.
//   N3  desktop profile, baseline vs branch: the same lines, equal numbers (fixtures, glowMats, nightLights, PointLight count), no exception on either.
// VERDICT: §W-NIGHT-PHONE checks=3 fail=<n> red=<k>/1 verdict=PASS|FAIL|INCONCLUSIVE
// Run:  node viewer/tests/witness_night_pill_phone.js     (env: BASE_REF=<ref>  PW=<playwright path>  NIGHT_LOG=<file>)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const BASE_REF = process.env.BASE_REF || cp.execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], { cwd: ROOT }).toString().trim();
const LOG = process.env.NIGHT_LOG || path.join(__dirname, 'witness_night_pill_phone.log');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.sql': 'text/plain', '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
const URL_PATH = '/viewer/viewer.html?db=buildings/Duplex_extracted.db';
const PHONE = { viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true, serviceWorkers: 'block',
  userAgent: 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36' };
const DESKTOP = { viewport: { width: 1400, height: 900 }, serviceWorkers: 'block' };
const LAUNCH = { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] };
const out = []; const S = m => { out.push(m); console.log(m); };
const git = (args, opt) => cp.execFileSync('git', args, Object.assign({ cwd: ROOT, maxBuffer: 1 << 28 }, opt || {}));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// the baseline tree: the files this branch changed come from BASE_REF
const changed = git(['diff', '--name-only', BASE_REF]).toString().split('\n').filter(Boolean);
const overlay = new Map();
for (const p of changed) { try { overlay.set(p, git(['show', BASE_REF + ':' + p], { stdio: ['ignore', 'pipe', 'ignore'] })); } catch (e) { overlay.set(p, null); } }
function serve(useOverlay) {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
    const rel = p.replace(/^\//, '');
    if (useOverlay && overlay.has(rel)) { const b = overlay.get(rel); if (b == null) { res.writeHead(404); res.end('404 ' + p); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(b); return; }
    fs.readFile(path.join(ROOT, p), (e, buf) => { if (e) { res.writeHead(404); res.end('404 ' + p); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf); });
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ srv, port: srv.address().port })));
}
async function waitReady(page) {
  for (let i = 0; i < 150; i++) { await page.waitForTimeout(1000);
    const ok = await page.evaluate(() => !!(window.APP && window.APP.guidMap && Object.keys(window.APP.guidMap).length > 0 && window.APP.streaming === false && window._mainPillActions && window._mainPillActions.length > 0)).catch(() => false);
    if (ok) return true; }
  return false;
}
const num = (line, key) => { const m = new RegExp('\\b' + key + '=(-?\\d+(?:\\.\\d+)?)').exec(line || ''); return m ? +m[1] : null; };
async function run(browser, port, prof) {
  const ctx = await browser.newContext(prof), page = await ctx.newPage(), cons = [], errs = [];
  page.on('console', m => cons.push(m.text())); page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
  await page.goto('http://127.0.0.1:' + port + URL_PATH, { waitUntil: 'domcontentloaded' });
  const ready = await waitReady(page);
  let r = { ready, phone: null };
  if (ready) {
    const mark = cons.length;
    r = Object.assign(r, await page.evaluate(async () => { let err = null; try { window.APP._pillRun('night'); } catch (e) { err = String(e && e.message).slice(0, 160); }
      await new Promise(res => setTimeout(res, 2500)); let pl = 0; window.APP.scene.traverse(o => { if (o.isPointLight) pl++; });
      return { err, pointLights: pl, nightMode: window.APP._nightMode === true, phone: !!(window._caps && window._caps.phone) }; }).catch(e => ({ err: 'evaluate: ' + String(e && e.message).slice(0, 120) })));
    const after = cons.slice(mark);
    r.modeLine = after.find(t => t.indexOf('§NIGHT_MODE on') === 0) || null;
    r.memLine = after.find(t => t.indexOf('§NIGHT_MEM_WITNESS') === 0) || null;
    r.pillLine = after.find(t => t.indexOf('§NIGHT_PILL') === 0) || null;
    r.fixtures = num(r.modeLine, 'fixtures'); r.glowMats = num(r.modeLine, 'glowMats'); r.nightLights = num(r.memLine, 'nightLights');
  }
  r.errs = errs.filter(e => /_tmIsVisible|TypeError|ReferenceError/.test(e)); r.allErrs = errs.length;
  await ctx.close(); return r;
}
const show = r => JSON.stringify({ ready: r.ready, phone: r.phone, err: r.err, pageErrors: r.errs, fixtures: r.fixtures, glowMats: r.glowMats, nightLights: r.nightLights, pointLights: r.pointLights, nightMode: r.nightMode });
const isTmErr = r => /_tmIsVisible is not a function/.test([r.err].concat(r.errs).join(' | '));

(async () => {
  S(`§W-NIGHT-PHONE_SETUP base_ref=${BASE_REF} base=${git(['rev-parse', '--short', BASE_REF]).toString().trim()} changed_vs_base=${changed.length}`);
  const base = await serve(true), branch = await serve(false), browser = await chromium.launch(LAUNCH);
  const bp = await run(browser, base.port, PHONE), np = await run(browser, branch.port, PHONE), bd = await run(browser, base.port, DESKTOP), nd = await run(browser, branch.port, DESKTOP);
  S('§NIGHT_RUN baseline phone  ' + show(bp)); S('§NIGHT_RUN branch   phone  ' + show(np)); S('§NIGHT_RUN baseline desktop ' + show(bd)); S('§NIGHT_RUN branch   desktop ' + show(nd));
  S('§NIGHT_LINES branch phone: ' + [np.modeLine, np.memLine, np.pillLine].filter(Boolean).join(' || '));
  const res = []; const note = (id, state, why) => { res.push(state); S(`§W-NIGHT-PHONE ${id} ${state} ${why}`); };
  // N1 red control
  let red = 0;
  if (!bp.ready || !bp.phone) note('N1', 'INCONCLUSIVE', 'the baseline phone run did not reach ready / was not a phone: ' + show(bp));
  else if (isTmErr(bp)) { red = 1; note('N1', 'PASS', 'baseline phone: pressing the Night pill throws "' + (bp.err || bp.errs[0]) + '" (defect reproduced)'); }
  else note('N1', 'FAIL', 'baseline phone did NOT throw A._tmIsVisible TypeError - the control is not red: ' + show(bp));
  // N2 branch phone
  if (!np.ready || !np.phone) note('N2', 'INCONCLUSIVE', 'the branch phone run did not reach ready / was not a phone: ' + show(np));
  else if (np.err || np.errs.length) note('N2', 'FAIL', 'branch phone still throws: ' + show(np));
  else if (!(np.fixtures > 0) || !(np.nightLights > 0)) note('N2', (np.fixtures == null || np.nightLights == null) ? 'INCONCLUSIVE' : 'FAIL', 'no fixtures / lights handled (population empty or the pill did nothing): ' + show(np));
  else note('N2', 'PASS', `branch phone: no exception; fixtures=${np.fixtures} nightLights=${np.nightLights} pointLights(scene)=${np.pointLights}`);
  // N3 desktop equal
  if (!bd.ready || !nd.ready) note('N3', 'INCONCLUSIVE', 'a desktop run did not reach ready');
  else if (!(bd.fixtures > 0)) note('N3', 'INCONCLUSIVE', 'baseline desktop handled no fixtures: ' + show(bd));
  else { const k = r => JSON.stringify([r.err, r.errs, r.fixtures, r.glowMats, r.nightLights, r.pointLights, r.nightMode]);
    if (k(bd) === k(nd) && !bd.err && !bd.errs.length) note('N3', 'PASS', `desktop equal: fixtures=${nd.fixtures} glowMats=${nd.glowMats} nightLights=${nd.nightLights} pointLights=${nd.pointLights}`);
    else note('N3', 'FAIL', 'desktop differs: baseline ' + show(bd) + ' branch ' + show(nd)); }
  const fail = res.filter(x => x === 'FAIL').length, inc = res.filter(x => x === 'INCONCLUSIVE').length;
  S(`§W-NIGHT-PHONE checks=3 fail=${fail} red=${red}/1 verdict=${fail ? 'FAIL' : (inc || red !== 1) ? 'INCONCLUSIVE' : 'PASS'}`);
  fs.writeFileSync(LOG, out.join('\n') + '\n');
  await browser.close(); base.srv.close(); branch.srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('§W-NIGHT-PHONE crashed', e); process.exit(2); });
