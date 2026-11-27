// ⚠ DO NOT REMOVE — WITNESS W-BOOT-CPE-LAZY (2026-11-28, bim-compiler prompts/MOBILE_PERF.md §P3 STAGE 2 MOVE 2 SPEC)
// ISSUE THIS PROVES OR DISPROVES: the Alt+C path editor (cinema_path_editor.js, ~308 KB) was fetched and parsed on EVERY viewer boot,
// phone included, while its only opener is the film start (maxq_start.js). After the move, through ONE generic loader APP.lazy(name):
//   E1 no cinema_path_editor request at boot; APP.cinemaPathEditor undefined well after boot (its 500 ms publish timer never ran)
//   E2 APP.lazy('cpe') → one request, APP.cinemaPathEditor.open is a function, §LAZY name=cpe … ok=true
//   E3 a second APP.lazy('cpe') → no new request (one promise per name)
//   E4 the film start loads it on the same conditions it opens on (static: maxq_start.js awaits A.lazy('cpe') before its editor guard)
//   E6 the lazily loaded editor opens on a real path (APP.cinemaPathPlan, as the film start builds it) and its Cancel resolves 'cancel'
//   E5 eager boot bytes fell by at least the file's size (pre-move page at OLD_REF vs now, scripts/boot_weight.js's rule)
//   RED: the pre-move viewer.html (OLD_REF) carries the boot tag → E1's static half fails there.
// §-log first — READ viewer/tests/witness_boot_cpe_lazy.log after every run. Run: node viewer/tests/witness_boot_cpe_lazy.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..'), OLD_REF = process.env.OLD_REF || 'ef08a10e';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.sql': 'text/plain',
  '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => { if (e) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf); });
});
const log = []; let fails = 0, judged = 0;
function S(m) { log.push(m); console.log(m); }
function verdict(ok, label, detail) { judged++; if (!ok) fails++; S('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); return ok; }
const hasTag = html => /<script[^>]+src="cinema_path_editor\.js/.test(html);
const eager = html => { html = html.replace(/<!--[\s\S]*?-->/g, ''); let n = 0;
  for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) { if (/^(https?:)?\/\//.test(m[1])) continue; const f = path.normalize(path.join(ROOT, 'viewer', m[1].split('?')[0])); if (fs.existsSync(f)) n += fs.statSync(f).size; } return n; };

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage(), cons = [], reqs = [], errs = [];
  page.on('console', m => cons.push(m.text())); page.on('request', q => { if (/cinema_path_editor\.js/.test(q.url())) reqs.push(q.url()); }); page.on('pageerror', e => errs.push(String(e.message).slice(0, 160)));
  await page.goto('http://127.0.0.1:' + server.address().port + '/viewer/viewer.html?db=buildings/Duplex_extracted.db', { waitUntil: 'domcontentloaded' });
  let ready = false;
  for (let i = 0; i < 120 && !ready; i++) { await page.waitForTimeout(1000); ready = await page.evaluate(() => !!(window.APP && APP.guidMap && Object.keys(APP.guidMap).length && APP.streaming === false)).catch(() => false); }
  await page.waitForTimeout(2000);   // > 4 ticks of the editor's own 500 ms publish timer, had it loaded
  const html = fs.readFileSync(path.join(ROOT, 'viewer', 'viewer.html'), 'utf8'), atBoot = await page.evaluate(() => typeof (window.APP && APP.cinemaPathEditor));
  verdict(ready && !hasTag(html) && reqs.length === 0 && atBoot === 'undefined', 'E1 no path editor at boot (no tag, no request, APP.cinemaPathEditor undefined)', 'ready=' + ready + ' tag=' + hasTag(html) + ' requests=' + reqs.length + ' typeof=' + atBoot);
  const c0 = cons.length, r2 = await page.evaluate(() => APP.lazy('cpe').then(v => 'resolved:' + v, e => 'rejected:' + e.message));
  const open = await page.evaluate(() => typeof (APP.cinemaPathEditor && APP.cinemaPathEditor.open)), l2 = cons.slice(c0).find(t => /^§LAZY name=cpe /.test(t)) || '';
  verdict(r2 === 'resolved:true' && open === 'function' && reqs.length === 1 && /ok=true/.test(l2), 'E2 APP.lazy(\'cpe\') loads it once and the editor API is there', r2 + ' open=' + open + ' requests=' + reqs.length + ' "' + l2 + '"');
  const r3 = await page.evaluate(() => APP.lazy('cpe').then(v => 'resolved:' + v, e => 'rejected:' + e.message));
  verdict(r3 === 'resolved:true' && reqs.length === 1 && errs.length === 0, 'E3 a second call loads nothing new; no page error', r3 + ' requests=' + reqs.length + ' pageerrors=' + JSON.stringify(errs));
  // E6: the lazily loaded editor really opens on a real path (the call maxq_start.js makes), then Cancel resolves it
  const c6 = cons.length;
  const o6 = await page.evaluate(async () => { try { if (typeof APP.ensureRooms === 'function') await APP.ensureRooms({}); } catch (e) {}
    const plan = typeof APP.cinemaPathPlan === 'function' ? APP.cinemaPathPlan(24) : null; if (!plan || !plan.waypoints) return 'no plan';
    window.__cpeP = APP.cinemaPathEditor.open({ plan: plan, durationSec: 24, fps: 30 }); return 'opening waypoints=' + plan.waypoints.length; });
  for (let i = 0; i < 40 && !cons.slice(c6).some(t => /^§CPE_OPEN /.test(t)); i++) await page.waitForTimeout(250);
  const panel = await page.evaluate(() => !!document.getElementById('cpe-panel')), l6 = cons.slice(c6).find(t => /^§CPE_OPEN /.test(t)) || '';
  await page.evaluate(() => { const b = document.getElementById('cpe-cancel'); if (b) b.click(); });
  const res6 = await page.evaluate(() => Promise.race([window.__cpeP.then(r => r.action), new Promise(r => setTimeout(() => r('timeout'), 5000))]));
  verdict(/^§CPE_OPEN /.test(l6) && panel && res6 === 'cancel' && errs.length === 0, 'E6 the lazily loaded editor opens on a real path and Cancel closes it', o6 + ' | "' + l6.slice(0, 90) + '" panel=' + panel + ' result=' + res6 + ' pageerrors=' + JSON.stringify(errs));
  await browser.close(); server.close();
  const mq = fs.readFileSync(path.join(ROOT, 'viewer', 'maxq_start.js'), 'utf8'), iL = mq.indexOf("await A.lazy('cpe')"), iG = mq.indexOf('if (A.cinemaPathEditor && plan && plan.waypoints');
  verdict(iL > 0 && iG > iL && iG - iL < 600, 'E4 the film start awaits A.lazy(\'cpe\') just before its editor guard', 'lazy_at=' + iL + ' guard_at=' + iG);
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'bcpe-')); cp.execSync('git archive ' + OLD_REF + ' viewer/viewer.html | tar -x -C ' + tmp, { cwd: ROOT });
  const oldHtml = fs.readFileSync(path.join(tmp, 'viewer', 'viewer.html'), 'utf8'), size = fs.statSync(path.join(ROOT, 'viewer', 'cinema_path_editor.js')).size, before = eager(oldHtml), now = eager(html);
  S('§BOOT_CPE eager_before=' + before + ' eager_now=' + now + ' saved=' + (before - now) + ' file=' + size);
  verdict(before - now >= size, 'E5 eager boot bytes fell by at least the editor file', 'saved=' + (before - now) + ' file=' + size);
  const redOk = hasTag(oldHtml);
  S('§BOOT_CPE_RED pre-move viewer.html (' + OLD_REF + ') ' + (redOk ? 'carries the tag — E1 fails there, as required' : 'has no tag (control not detected)'));
  const v = !redOk ? (fails ? 'FAIL' : 'INCONCLUSIVE') : fails ? 'FAIL' : 'PASS';
  S(`§WITNESS_BOOT_CPE_LAZY ${v} judged=${judged} fails=${fails} red_control=${redOk ? 'detected' : 'not detected'}`);
  fs.writeFileSync(path.join(__dirname, 'witness_boot_cpe_lazy.log'), log.join('\n') + '\n'); process.exit(v === 'PASS' ? 0 : 1);
})().catch(e => { S('§WITNESS_BOOT_CPE_LAZY FAIL fatal=' + (e && e.stack || e)); fs.writeFileSync(path.join(__dirname, 'witness_boot_cpe_lazy.log'), log.join('\n') + '\n'); process.exit(1); });
