// Usage: node film/record_v2.js   (needs: node editor/build_dist.js /tmp/oplogpic_film_dist first)
// Records OplogPic film v2 (silent): features on an imported photo. Output work dir ~/Videos/oplogpic_v2_work/
const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const { chromium } = require('/home/red1/bim-ootb-psd/poc/psd-oplog/node_modules/playwright-core');
const DIST = '/tmp/oplogpic_film_dist', W = path.join(os.homedir(), 'Videos/oplogpic_v2_work'), PHOTO = '/home/red1/bim-compiler/docs/assets/images/TerminalExternal.jpeg';
fs.mkdirSync(W, { recursive: true }); fs.rmSync(W + '/vid', { recursive: true, force: true });
const LOG = W + '/run.log', TSV = W + '/shot_log.tsv'; fs.writeFileSync(LOG, ''); fs.writeFileSync(TSV, 'shot\tstart_s\tend_s\ton_screen\tvisible_numbers_and_text\n');
const log = (m) => { fs.appendFileSync(LOG, m + '\n'); console.log(m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const srv = http.createServer((q, r) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html'; const f = path.join(DIST, u); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
    const t = { '.js': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' }[path.extname(f)] || 'application/octet-stream'; r.writeHead(200, { 'content-type': t }); fs.createReadStream(f).pipe(r); }).listen(0, '127.0.0.1');
  await new Promise((r) => srv.on('listening', r)); const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const br = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await br.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: W + '/vid', size: { width: 1920, height: 1080 } }, permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.addInitScript(() => { addEventListener('DOMContentLoaded', () => {
    const st = document.createElement('style'); st.textContent = '@keyframes fcring{from{transform:translate(-50%,-50%) scale(.4);opacity:.95}to{transform:translate(-50%,-50%) scale(2.6);opacity:0}}';
    document.head.appendChild(st); const dot = document.createElement('div'); dot.style.cssText = 'position:fixed;left:-50px;top:-50px;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;background:#ff3b1f;border:3px solid #fff;box-shadow:0 0 0 1.5px #000,0 2px 8px rgba(0,0,0,.6);z-index:2147483647;pointer-events:none'; document.body.appendChild(dot);
    const mv = (e) => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; window.__fc = [e.clientX, e.clientY]; }; addEventListener('mousemove', mv, true); addEventListener('mousedown', (e) => { mv(e); const r = document.createElement('div'); r.style.cssText = 'position:fixed;left:' + e.clientX + 'px;top:' + e.clientY + 'px;width:44px;height:44px;border-radius:50%;border:4px solid #ff3b1f;z-index:2147483646;pointer-events:none;animation:fcring .5s ease-out forwards'; document.body.appendChild(r); setTimeout(() => r.remove(), 600); }, true); }); });
  const t0 = Date.now(); const page = await ctx.newPage();
  globalThis.__pg = page; page.on('pageerror', (e) => log('PAGEERROR ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') log('CONSOLE.error ' + m.text()); }); page.on('requestfailed', (r) => log('REQFAILED ' + r.url()));
  await page.goto(base); await page.waitForFunction(() => window.__ed); await sleep(800);
  await page.setInputFiles('#photo', PHOTO); await page.waitForFunction(() => window.__ed.layers().length >= 3); await sleep(2500);
  let cx = 960, cy = 540, cut = 0; const now = () => (Date.now() - t0) / 1000 - cut;
  // ---- helpers
  const glide = async (x, y, ms) => { const d = Math.hypot(x - cx, y - cy), n = Math.max(10, Math.round(d / 10)), per = ms ? ms / n : 14; for (let i = 1; i <= n; i++) { const k = i / n, e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; await page.mouse.move(cx + (x - cx) * e, cy + (y - cy) * e); await sleep(per); } cx = x; cy = y; };
  const centre = async (loc) => { const b = await loc.boundingBox(); if (!b) throw new Error('no box'); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const point = async (loc) => { const [x, y] = await centre(loc); await glide(x, y); };
  const click = async (loc, pause = 900) => { await point(loc); await sleep(180); await page.mouse.down(); await sleep(90); await page.mouse.up(); await sleep(pause); };
  const stroke = async (pts, pace = 16) => { await glide(pts[0][0], pts[0][1]); await sleep(150); await page.mouse.down(); for (let i = 1; i < pts.length; i++) { const [x, y] = pts[i], n = Math.max(2, Math.round(Math.hypot(x - cx, y - cy) / 9)); for (let k = 1; k <= n; k++) { await page.mouse.move(cx + (x - cx) * k / n, cy + (y - cy) * k / n); await sleep(pace); } cx = x; cy = y; } await sleep(120); await page.mouse.up(); await sleep(800); };
  const setv = (sel, v) => page.evaluate(([s, v]) => { const e = document.querySelector(s); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, [sel, v]);
  const cv = async () => page.locator('#c').boundingBox(); const at = async (fx, fy) => { const b = await cv(); return [b.x + b.width * fx, b.y + b.height * fy]; };
  const row = (name) => page.locator('#layers .layer', { has: page.locator('b', { hasText: name }) }).first();
  const rb = (name, title) => row(name).locator('button[title="' + title + '"]');
  const snap = () => page.evaluate(() => ({ info: info.textContent, status: document.getElementById('status').textContent, hmsg: hmsg.textContent, pv: document.getElementById('pvbar').hidden ? '' : pvtxt.textContent, layers: __ed.layers().map((l) => l.name + (l.hidden ? '(hidden)' : '') + (l.hasMask ? '[mask]' : '')).join(' | '), ops: __ed.ops.length }));
  let cur = null; const begin = (n, desc) => { cur = { n, s: now(), desc }; log('SHOT ' + n + ' start ' + cur.s.toFixed(1) + ' ' + desc); };
  const end = async (extra) => { const s = await snap(); cur.e = now(); const vis = 'info="' + s.info + '"; status="' + s.status + '"; hmsg="' + s.hmsg + '"; pvbar="' + s.pv + '"; layers=' + s.layers + (extra ? '; ' + extra : '');
    fs.appendFileSync(TSV, [cur.n, cur.s.toFixed(1), cur.e.toFixed(1), cur.desc, vis].join('\t') + '\n'); log('SHOT ' + cur.n + ' end ' + cur.e.toFixed(1) + ' ' + vis); };
  const sub = async (txt) => { const s = await snap(); log('  [' + now().toFixed(1) + '] ' + txt + ' | ' + JSON.stringify(s)); return s; };
  cut = (Date.now() - t0) / 1000; log('CUT: video seconds before first shot (import prelude) = ' + cut.toFixed(2));
  await page.mouse.move(1700, 300); cx = 1700; cy = 300; await sleep(300);
  // ===== SHOT 1 layers
  begin('1a', 'Photo layer on screen, point at layers panel, rename it Photo'); await sleep(1500);
  await glide(1790, 190, 700); await sleep(700);
  const photoRow = page.locator('#layers .layer').first(); await click(photoRow.locator('button[title="Rename layer"]'), 700);
  await page.keyboard.type('Photo', { delay: 160 }); await sleep(400); await page.keyboard.press('Enter'); await sleep(1500); await end();
  begin('1b', 'Add layer (new normal paint layer), hide and show Photo (eye), move Photo down and up (arrows)');
  await click(page.locator('#addl'), 1300); await sub('after add layer');
  await click(rb('Photo', 'Hide layer'), 1500); await sub('photo hidden'); await click(rb('Photo', 'Show layer'), 1400);
  await click(rb('Photo', 'Move layer down'), 1500); await sub('photo moved down'); await click(rb('Photo', 'Move layer up'), 1500); await sub('photo moved up'); await end();
  // ===== SHOT 2 selection
  const paintLayer = await page.evaluate(() => __ed.params.layer); log('current paint layer id ' + paintLayer);
  begin('2a', 'Select tool, Ellipse button, drag an ellipse around the middle of the photo, then Hard brush with bold red stroke across the edge: only inside paints');
  await click(page.locator('[data-tool="select"]'), 700); await click(page.locator('#s-ell'), 700);
  { const [a, b] = await at(.25, .30), [c, d] = await at(.75, .72); await glide(a, b); await page.mouse.down(); await glide(c, d, 1300); await page.mouse.up(); await sleep(1300); }
  await sub('ellipse selected'); await click(page.locator('[data-tool="hard"]'), 500); await setv('#color', '#e8261c'); await setv('#size', '70'); await sleep(600);
  { const P = [await at(.10, .45), await at(.35, .40), await at(.55, .50), await at(.90, .42)]; await stroke(P); } await sub('stroke inside selection only'); await sleep(1700); await end();
  begin('2b', 'Invert selection (Invert), bold blue stroke now paints outside the ellipse, then Clear selection');
  await click(page.locator('#s-inv'), 800); await setv('#color', '#1c4fe8'); await sleep(500);
  { const P = [await at(.05, .15), await at(.5, .12), await at(.95, .20)]; await stroke(P); } await sub('stroke outside'); await sleep(1500);
  await click(page.locator('#s-clr'), 1500); await end();
  // ===== SHOT 3 masks
  begin('3a', 'Hide the paint layer (eye), tick Advanced, click Photo layer name, Add mask');
  await click(rb('Layer 3', 'Hide layer'), 1000).catch(async (e) => { log('hide Layer3 failed ' + e.message); });
  await click(page.locator('#adv'), 1100); await click(row('Photo').locator('b'), 700); await click(rb('Photo', 'Add mask'), 1300); await sub('mask added'); await end();
  begin('3b', 'Mask target + Hide brush: paint strokes so the photo disappears where painted; switch to Reveal and paint some back; Invert mask');
  await click(row('Photo').locator('button.mb', { hasText: /^Mask$/ }), 600); log('mask-brush button label now: ' + await row('Photo').locator('button.mb').nth(2).textContent());
  if ((await row('Photo').locator('button.mb').nth(2).textContent()) !== 'Hide') await click(row('Photo').locator('button.mb').nth(2), 700);
  log('after switch label: ' + await row('Photo').locator('button.mb').nth(2).textContent());
  await click(page.locator('[data-tool="hard"]'), 400); await setv('#size', '90'); await sleep(500);
  { await stroke([await at(.15, .25), await at(.45, .45), await at(.85, .30)]); await stroke([await at(.2, .75), await at(.6, .65), await at(.9, .80)]); } await sub('hidden by mask strokes'); await sleep(1600);
  await click(row('Photo').locator('button.mb').nth(2), 700); log('label after click: ' + await row('Photo').locator('button.mb').nth(2).textContent()); await sleep(300);
  { await stroke([await at(.30, .33), await at(.55, .40), await at(.75, .34)]); } await sub('revealed some back'); await sleep(1600);
  await click(rb('Photo', 'Invert mask'), 1800); await sub('mask inverted'); await end();
  begin('3c', 'Select tool + ellipse over the photo, then Replace mask with selection (vignette look), Clear selection');
  await click(rb('Photo', 'Invert mask'), 800); // back to the pre-invert mask so the vignette step starts clear
  await click(page.locator('[data-tool="select"]'), 600); await click(page.locator('#s-ell'), 500);
  { const [a, b] = await at(.12, .10), [c, d] = await at(.88, .90); await glide(a, b); await page.mouse.down(); await glide(c, d, 1400); await page.mouse.up(); await sleep(1100); }
  await click(row('Photo').locator('button[title*="selection"]'), 1800); await sub('mask from selection'); await click(page.locator('#s-clr'), 1500); await end();
  // ===== SHOT 4 history
  begin('4a', 'Scroll the sidebar to History; click an earlier entry to preview (Viewing step N of M bar), Go back to here, redo with Ctrl+Shift+Z');
  { await glide(1790, 700); for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 140); await sleep(120); } await sleep(900); }
  const hrows = page.locator('#hist .hrow .hgo'); const nrows = await hrows.count(); log('history rows ' + nrows); const pick = hrows.filter({ hasText: /^12\./ }).first(); await pick.scrollIntoViewIfNeeded(); await sleep(600); log('pick box ' + JSON.stringify(await pick.boundingBox())); const picked = await pick.textContent(); log('previewing entry: ' + picked);
  await click(pick, 1500); await sub('preview'); await sleep(1200); const pvs = await snap(); const pvtxt = pvs.pv;
  await click(page.locator('#pv-rewind'), 1500); await sub('went back');
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Control+Shift+Z'); await sleep(1100); await sub('redo ' + (i + 1)); } for (let i = 0; i < 40 && await page.evaluate(() => __ed.canRedo()); i++) { await page.keyboard.press('Control+Shift+Z'); await sleep(450); } await sleep(1500); await sub('redo all the way'); await end('previewed entry="' + picked + '"; preview bar="' + pvtxt + '"');
  begin('4b', 'Replay time-lapse to the end'); await glide(1790, 575, 600).catch(() => {});
  { const pb = page.locator('#h-play'); const b = await pb.boundingBox(); if (!b || b.y < 0 || b.y > 1040) { await glide(1790, 700); for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, -140); await sleep(100); } await sleep(500); } await click(pb, 300); }
  await page.waitForFunction(() => /Replay (finished|stopped)/.test(document.getElementById('hmsg').textContent), null, { timeout: 180000 }); await sleep(2000); await end();
  begin('4c', 'Verify, then Share link'); await click(page.locator('#h-ver'), 2500); const vmsg = await page.evaluate(() => hmsg.textContent); log('verify: ' + vmsg); await sleep(1500);
  await click(page.locator('#h-share'), 1000); await page.waitForFunction(() => /Link ready|No link/.test(hmsg.textContent)); await sleep(2500); await end();
  begin('4d', 'Edit one old stroke entry: change its size and colour, Apply (first show the paint layer again with its eye so the stroke is visible)');
  await glide(1790, 600); for (let i = 0; i < 20; i++) { await page.mouse.wheel(0, -160); await sleep(80); } await sleep(700); await click(rb('Layer 3', 'Show layer'), 1500); await sub('paint layer shown'); for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 160); await sleep(100); } await sleep(700);
  { const ebs = page.locator('#hist .hrow button[title="Re-edit this stroke"]'); const n = await ebs.count(); log('edit buttons ' + n); const eb = ebs.nth(n - 1); await eb.scrollIntoViewIfNeeded(); await sleep(600); await click(eb, 900);
    const ed = page.locator('#hist .hedit'); const rowtxt = await ed.locator('xpath=..').locator('.hgo').textContent(); log('editing entry: ' + rowtxt); await ed.scrollIntoViewIfNeeded(); await sleep(500);
    const range = ed.locator('input[type=range]').first(); const rb2 = await range.boundingBox(); await glide(rb2.x + rb2.width * .3, rb2.y + rb2.height / 2); await page.mouse.down(); await glide(rb2.x + rb2.width * .9, rb2.y + rb2.height / 2, 900); await page.mouse.up(); await sleep(600);
    await page.evaluate(() => { const c = document.querySelector('#hist .hedit input[type=color]'); if (c) { c.value = '#19b04a'; c.dispatchEvent(new Event('input', { bubbles: true })); } }); await sleep(900);
    await click(ed.locator('button', { hasText: 'Apply' }), 2200); await sub('after apply'); await end('edited entry="' + rowtxt + '"'); }
  // ===== SHOT 5 persistence
  begin('5a', 'Idle 2.5 s (checkpoint), reload page: painting is restored; then Undo works right after reopen');
  await glide(960, 540, 600); const nOps = await page.evaluate(() => __ed.ops.length); await sleep(2500); const saved = await page.evaluate(() => window.__saved); log('ops ' + nOps + ' __saved ' + saved); const before = await snap();
  await page.reload(); await page.waitForFunction(() => window.__ed && window.__ed.ops.length > 3, null, { timeout: 20000 }); await page.mouse.move(cx, cy); await sleep(300);
  const st1 = await sub('after reload'); await sleep(2200);
  await click(page.locator('#undo'), 1800); const st2 = await sub('after Undo'); await sleep(1500);
  await end('before reload ops=' + before.ops + '; after reload ' + st1.info + ' status="' + st1.status + '"; after undo ' + st2.info);
  cx = 960; await sleep(1500); begin('5b', 'Hold last frame'); await sleep(3000); await end();
  const vp = page.video(); await ctx.close(); const webm = await vp.path(); log('webm ' + webm + ' total ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s, cut ' + cut.toFixed(2));
  const out = W + '/OplogPic_v2_RAW.mp4'; const r = cp.spawnSync('/usr/bin/ffmpeg', ['-y', '-v', 'error', '-i', webm, '-ss', cut.toFixed(2), '-vf', 'fps=26,scale=1920:1080', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', out], { encoding: 'utf8' }); log('ffmpeg status ' + r.status + ' ' + r.stderr);
  await br.close(); srv.close();
})().catch(async (e) => { log('SCRIPT FAIL ' + e.stack); try { await globalThis.__pg.screenshot({ path: W + '/fail.png' }); } catch (x) {} process.exit(1); });
