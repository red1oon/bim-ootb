// Usage: node film/record_v4.js  (needs: node editor/build_dist.js /tmp/oplogpic_film_dist_v4 first). Film v4 part 1 (We can do what Photoshop does), silent. Outputs ~/Videos/oplogpic_v2_work/*_v4_*
const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const { chromium } = require('/home/red1/bim-ootb-psd/poc/psd-oplog/node_modules/playwright-core');
const DIST = '/tmp/oplogpic_film_dist_v4', W = path.join(os.homedir(), 'Videos/oplogpic_v2_work'), PHOTO = W + '/assets/KLCC_dawn_Slusarczyk_CCBY3.jpg';
const VW = +(process.env.VW || 1366), VH = +(process.env.VH || 768), HISTVH = process.env.HISTVH || '46vh';
fs.mkdirSync(W, { recursive: true }); fs.rmSync(W + '/vid4', { recursive: true, force: true });
const LOG = W + '/run_v4.log', TSV = W + '/shot_log_v4.tsv', FACTS = W + '/facts_v4.tsv';
fs.writeFileSync(LOG, ''); fs.writeFileSync(TSV, 'shot\tstart_s\tend_s\ton_screen\n'); fs.writeFileSync(FACTS, 'shot\tkey\tvalue\n');
const log = (m) => { fs.appendFileSync(LOG, m + '\n'); console.log(m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const srv = http.createServer((q, r) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html'; const f = path.join(DIST, u); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
    const t = { '.js': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' }[path.extname(f)] || 'application/octet-stream'; r.writeHead(200, { 'content-type': t }); fs.createReadStream(f).pipe(r); }).listen(0, '127.0.0.1');
  await new Promise((r) => srv.on('listening', r)); const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const br = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--force-device-scale-factor=1.40625', '--window-size=1366,853'] });
  const ctx = await br.newContext({ viewport: null, recordVideo: { dir: W + '/vid4', size: { width: 1920, height: 1080 } }, permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.addInitScript((HV) => { addEventListener('DOMContentLoaded', () => {
    const st = document.createElement('style'); st.textContent = '@keyframes fcring{from{transform:translate(-50%,-50%) scale(.4);opacity:.95}to{transform:translate(-50%,-50%) scale(2.6);opacity:0}} #hist{max-height:' + HV + ' !important}';
    document.head.appendChild(st); const dot = document.createElement('div'); dot.id = 'fcdot'; dot.style.cssText = 'position:fixed;left:-50px;top:-50px;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;background:#ff3b1f;border:3px solid #fff;box-shadow:0 0 0 1.5px #000,0 2px 8px rgba(0,0,0,.6);z-index:2147483647;pointer-events:none'; document.body.appendChild(dot);
    const mv = (e) => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; }; addEventListener('mousemove', mv, true); addEventListener('mousedown', (e) => { mv(e); const r = document.createElement('div'); r.style.cssText = 'position:fixed;left:' + e.clientX + 'px;top:' + e.clientY + 'px;width:44px;height:44px;border-radius:50%;border:4px solid #ff3b1f;z-index:2147483646;pointer-events:none;animation:fcring .5s ease-out forwards'; document.body.appendChild(r); setTimeout(() => r.remove(), 600); }, true); }); }, HISTVH);
  const t0 = Date.now(); const page = await ctx.newPage();
  globalThis.__pg = page; page.on('pageerror', (e) => log('PAGEERROR ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') log('CONSOLE.error ' + m.text()); }); page.on('requestfailed', (r) => log('REQFAILED ' + r.url()));
  await page.goto(base); await page.waitForFunction(() => window.__ed);  let cx = 700, cy = 300, cut = 0; const now = () => (Date.now() - t0) / 1000 - cut;
  // ---------- TITLE (shot 0)
  await page.evaluate(() => { const o = document.createElement('div'); o.id = 'slate'; o.style.cssText = 'position:fixed;inset:0;background:rgba(8,10,14,.55);z-index:2147483600;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .7s;font-family:system-ui,sans-serif;pointer-events:none';
    const d = document.createElement('div'); d.textContent = 'We can do what Photoshop does'; d.style.cssText = 'font-size:72px;font-weight:600;color:#fff;letter-spacing:.01em;text-shadow:0 3px 24px #000a;text-align:center;padding:0 6vw'; o.appendChild(d); document.body.appendChild(o); });
  await sleep(300); cut = (Date.now() - t0) / 1000; log('CUT (video s before title) = ' + cut.toFixed(2));
  const slateT = Date.now(); await page.evaluate(() => { document.getElementById('slate').style.opacity = 1; document.getElementById('hraw').click(); });
  await sleep(2600); await page.evaluate(() => { document.getElementById('slate').style.opacity = 0; }); await sleep(800); await page.evaluate(() => document.getElementById('slate').remove());
  const slateEnd = now(); log('title ' + ((Date.now() - slateT) / 1000).toFixed(1) + ' s');
  log('raw ticked=' + await page.evaluate(() => document.getElementById('hraw').checked));
  // ---------- helpers
  const glide = async (x, y, ms) => { const d = Math.hypot(x - cx, y - cy), n = Math.max(10, Math.round(d / 10)), per = ms ? ms / n : 14; for (let i = 1; i <= n; i++) { const k = i / n, e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; await page.mouse.move(cx + (x - cx) * e, cy + (y - cy) * e); await sleep(per); } cx = x; cy = y; };
  const centre = async (loc) => { const b = await loc.boundingBox(); if (!b) throw new Error('no box'); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const point = async (loc) => { await loc.scrollIntoViewIfNeeded(); await sleep(250); const [x, y] = await centre(loc); await glide(x, y); };
  const click = async (loc, pause = 900) => { await point(loc); await sleep(180); await page.mouse.down(); await sleep(90); await page.mouse.up(); await sleep(pause); };
  const stroke = async (pts, pace = 16) => { await glide(pts[0][0], pts[0][1]); await sleep(150); await page.mouse.down(); for (let i = 1; i < pts.length; i++) { const [x, y] = pts[i], n = Math.max(2, Math.round(Math.hypot(x - cx, y - cy) / 9)); for (let k = 1; k <= n; k++) { await page.mouse.move(cx + (x - cx) * k / n, cy + (y - cy) * k / n); await sleep(pace); } cx = x; cy = y; } await sleep(120); await page.mouse.up(); await sleep(900); };
  const drag = async (a, b, ms = 1200) => { await glide(a[0], a[1]); await sleep(200); await page.mouse.down(); await glide(b[0], b[1], ms); await page.mouse.up(); await sleep(1000); };
  const setv = (sel, v) => page.evaluate(([s, v]) => { const e = document.querySelector(s); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, [sel, v]);
  const at = async (fx, fy) => { const b = await page.locator('#c').boundingBox(); return [b.x + b.width * fx, b.y + b.height * fy]; };
  const row = (name) => page.locator('#layers .layer', { has: page.locator('b', { hasText: new RegExp('^' + name + '$') }) }).first();
  const rb = (name, title) => row(name).locator('button[title="' + title + '"]');
  const topLayer = () => page.locator('#layers .layer').first();
  const scrollSide = async (to) => { await page.evaluate((to) => { const s = document.getElementById('side'); s.scrollTo({ top: to === 'bottom' ? s.scrollHeight : to, behavior: 'smooth' }); }, to); await sleep(900); };
  const scrollHist = async (to) => { await page.evaluate((to) => { const s = document.getElementById('hist'); s.scrollTo({ top: to === 'bottom' ? s.scrollHeight : to, behavior: 'smooth' }); }, to); await sleep(900); };
  const snap = () => page.evaluate(() => ({ hsum: hsum.textContent, hmsg: hmsg.textContent, status: document.getElementById('status').textContent, pv: document.getElementById('pvbar').hidden ? '' : pvtxt.textContent, layers: __ed.layers().map((l) => l.name + (l.hidden ? '(hidden)' : '') + (l.hasMask ? '[mask]' : '') + (l.clip ? '[clip]' : '') + (l.mode && l.mode !== 'normal' ? '{' + l.mode + ' ' + Math.round(l.opacity * 100) + '}' : (l.opacity < 1 ? '{' + Math.round(l.opacity * 100) + '}' : ''))).join(' | '), ops: __ed.ops.length }));
  const topRow = () => page.evaluate(() => { const r = document.querySelector('#hist .hrow'); if (!r) return null; return { label: r.querySelector('.hgo').textContent, raw: r.querySelector('.rawj') ? r.querySelector('.rawj').textContent : '' }; });
  const fact = (shot, k, v) => { v = String(v).replace(/[\t\n]/g, ' '); fs.appendFileSync(FACTS, [shot, k, v].join('\t') + '\n'); log('  FACT ' + shot + ' ' + k + ' = ' + v); };
  const factsNow = async (shot, withRow) => { const s = await snap(); fact(shot, 'hsum', s.hsum); if (s.hmsg) fact(shot, 'hmsg', s.hmsg); fact(shot, 'status', s.status); if (s.pv) fact(shot, 'pvbar', s.pv); fact(shot, 'layers', s.layers); if (withRow) { const r = await topRow(); if (r) { fact(shot, 'newrow_label', r.label); fact(shot, 'newrow_raw+bytes', r.raw); } } return s; };
  const pointNewRow = async () => { await scrollHist(0); const b = await page.locator('#hist .hrow .rawj').first().boundingBox(); if (b) await glide(b.x + Math.min(b.width - 10, 160), b.y + b.height / 2, 600); };
  let cur = null; const begin = (n, desc) => { cur = { n, s: now(), desc }; log('SHOT ' + n + ' start ' + cur.s.toFixed(1) + ' ' + desc); };
  const end = () => { cur.e = now(); fs.appendFileSync(TSV, [cur.n, cur.s.toFixed(1), cur.e.toFixed(1), cur.desc].join('\t') + '\n'); log('SHOT ' + cur.n + ' end ' + cur.e.toFixed(1)); };
  fs.appendFileSync(TSV, ['0', '0.0', slateEnd.toFixed(1), 'Title overlay "We can do what Photoshop does" fades in/out over the empty editor; Show raw entries already ticked'].join('\t') + '\n');
  fact('0', 'title', 'We can do what Photoshop does');
  const rowRe = (re) => page.locator('#layers .layer', { has: page.locator('b', { hasText: re }) }).first();
  const rbr = (re, title) => rowRe(re).locator('button[title="' + title + '"]');
  const clickAt = async (x, y, pause = 1100) => { await glide(x, y); await sleep(160); await page.mouse.down(); await sleep(80); await page.mouse.up(); await sleep(pause); };
  const selInfo = () => page.evaluate(() => { const s = __ed.st.sel; if (!s) return 'none'; let n = 0; for (let i = 0; i < s.mask.length; i++) n += s.mask[i]; return JSON.stringify({ kind: s.kind, inv: s.inv, pixels: n, of: s.mask.length, box: s.box }); });
  const adjInfo = () => page.evaluate(() => JSON.stringify(__ed.tree().filter((n) => n.adjust).map((n) => ({ name: n.name, kind: n.kind, params: n.params, hidden: !!n.hidden, opacity: n.opacity }))));
  const sliderTo = async (loc, frac, ms = 900) => { const b = await loc.boundingBox(); await glide(b.x + 8 + (b.width - 16) * (+(await loc.evaluate((e) => (e.value - e.min) / (e.max - e.min)))), b.y + b.height / 2); await sleep(200); await page.mouse.down(); await glide(b.x + 8 + (b.width - 16) * frac, b.y + b.height / 2, ms); await sleep(150); await page.mouse.up(); await sleep(500); };
  await page.mouse.move(cx, cy);
  // ---------- 1 IMPORT
  await scrollSide(0);
  begin('1', 'Empty editor; import the KLCC dawn photo (one img entry), rename the layer KLCC, tick Advanced');
  await sleep(1200); await scrollSide('bottom'); await factsNow('1-start', false);
  const nBefore = await page.evaluate(() => __ed.ops.length);
  await page.setInputFiles('#photo', PHOTO); await page.waitForFunction((n) => window.__ed.ops.length > n, nBefore, { timeout: 30000 }); await sleep(800);
  await scrollSide('bottom'); await pointNewRow(); await sleep(2200); await factsNow('1-import', true);
  fact('1', 'img_op_json_chars', await page.evaluate(() => JSON.stringify(__ed.ops[__ed.ops.length - 1]).length));
  await scrollSide(0); await click(topLayer().locator('button[title="Rename layer"]'), 600); await page.keyboard.type('KLCC', { delay: 150 }); await sleep(300); await page.keyboard.press('Enter'); await sleep(900);
  await click(page.locator('#adv'), 900); await factsNow('1-renamed', true); end();
  // ---------- 2 MAGIC WAND
  begin('2', 'Magic wand sky selection (Tol 20, contiguous, 7 clicks New+Add, Grow), Invert, Mask from selection on KLCC, Clear');
  await click(page.locator('[data-tool="wand"]'), 700);
  await sliderTo(page.locator('#w-tol'), 0.20, 1100); { const v = await page.locator('#w-tol').inputValue(); log('tol slider value ' + v); if (v !== '20') { await setv('#w-tol', 20); await sleep(500); } }
  fact('2', 'wand_tolerance_shown', await page.locator('#w-tolv').textContent()); fact('2', 'wand_mode_buttons', await page.evaluate(() => ['w-contig', 'w-new', 'w-add'].map((i) => document.getElementById(i).textContent + ':' + document.getElementById(i).classList.contains('on')).join(' ')));
  const seeds = [[150, 450], [700, 440], [500, 300], [350, 470], [60, 340], [880, 490], [425, 415]];
  const cvB = await page.locator('#c').boundingBox(); const toPage = ([x, y]) => [cvB.x + cvB.width * x / 1024, cvB.y + cvB.height * y / 1024];
  await clickAt(...toPage(seeds[0]), 1200); fact('2', 'after_click1_selection', await selInfo());
  await scrollSide('bottom'); await pointNewRow(); await sleep(2400); await factsNow('2-wand1', true);
  await scrollSide(0); await click(page.locator('#w-add'), 700);
  for (let i = 1; i < seeds.length; i++) { await clickAt(...toPage(seeds[i]), i === 1 ? 1500 : 1000); fact('2', 'after_click' + (i + 1) + '_selection', await selInfo()); }
  await click(page.locator('#w-grow'), 1200); fact('2', 'after_grow_selection', await selInfo()); await glide(cvB.x + cvB.width * .5, cvB.y + cvB.height * .72, 700); await sleep(2800);
  await scrollSide('bottom'); await pointNewRow(); await sleep(1500); await factsNow('2-wand-grow', true);
  await scrollSide(0); await click(page.locator('#s-inv'), 1700); fact('2', 'after_invert_selection', await selInfo());
  await click(topLayer().locator('button[title="Mask from selection"]'), 2600); await factsNow('2-mask', true);
  await click(page.locator('#s-clr'), 800);
  await scrollSide('bottom'); await pointNewRow(); await sleep(1800); end();
  // ---------- 3 NEW SKY
  begin('3', 'Add layer New sky, 5 big soft strokes blue to magenta to orange, move it below KLCC');
  await scrollSide(0); await click(page.locator('#addl'), 900); await click(topLayer().locator('button[title="Rename layer"]'), 600); await page.keyboard.type('New sky', { delay: 150 }); await sleep(300); await page.keyboard.press('Enter'); await sleep(900);
  await click(page.locator('[data-tool="soft"]'), 500); await setv('#size', '120'); await sleep(300);
  for (const [col, y] of [['#12206e', .20], ['#4a2a96', .27], ['#b0288c', .34], ['#ee5a36', .42], ['#ffb347', .49]]) { await setv('#color', col); await sleep(250); await stroke([await at(-0.02, y), await at(.35, y + .015), await at(.7, y - .015), await at(1.02, y)], 11); }
  await sleep(900); await factsNow('3-painted', true);
  await click(rbr(/^New sky$/, 'Move layer down'), 1800); await factsNow('3-moved', true);
  fact('3', 'strokes', '5 soft strokes size 120: #12206e y.20, #4a2a96 y.27, #b0288c y.34, #ee5a36 y.42, #ffb347 y.49 (fractions of canvas height)');
  await scrollSide('bottom'); await pointNewRow(); await sleep(1500); await scrollSide(0); await glide(cvB.x + cvB.width * .5, cvB.y + cvB.height * .72, 600); await sleep(2200); end();
  // ---------- 4 ADJUSTMENTS
  begin('4', 'Add Curves adjustment, drag two points to an S-curve live; add Levels, drag Gamma; hide/show Curves for before/after');
  await scrollSide(0); await point(page.locator('#adda')); await sleep(300); await page.locator('#adda').selectOption('curves'); await sleep(1500); await scrollSide(0); await sleep(500);
  const cvs = page.locator('canvas.crv').first(); await cvs.scrollIntoViewIfNeeded(); await sleep(400);
  const cg = async (px, py) => { const b = await cvs.boundingBox(); return [b.x + b.width * px / 255, b.y + b.height * (1 - py / 255)]; };
  fact('4', 'curves_points_initial', (await adjInfo()));
  await drag(await cg(64, 64), await cg(60, 38), 1800); await sleep(500); fact('4', 'curves_after_point1', await adjInfo());
  await drag(await cg(192, 192), await cg(196, 222), 1800); await sleep(1200); fact('4', 'curves_after_point2', await adjInfo()); await factsNow('4-curves', true);
  await scrollSide('bottom'); await pointNewRow(); await sleep(1800); await scrollSide(0);
  await point(page.locator('#adda')); await sleep(300); await page.locator('#adda').selectOption('levels'); await sleep(1500); await scrollSide(0);
  const gam = page.locator('#layers .layer.adj').first().locator('label', { hasText: 'Gamma' }).locator('input[type=range]'); await gam.scrollIntoViewIfNeeded(); await sleep(300);
  await sliderTo(gam, (150 - 10) / 290, 1800); await sleep(1300); fact('4', 'levels_after_gamma', await adjInfo()); await factsNow('4-levels', true);
  await scrollSide('bottom'); await pointNewRow(); await sleep(1500); await scrollSide(0);
  await click(rbr(/^Curves/, 'Hide adjustment'), 2000); await factsNow('4-curves-hidden', true); await click(rbr(/^Curves/, 'Show adjustment'), 2000); await factsNow('4-curves-shown', true);
  await glide(cvB.x + cvB.width * .5, cvB.y + cvB.height * .75, 600); await sleep(1200); end();
  // ---------- 5 GROUP
  begin('5', 'Add group Scene, move it below the adjustments, put KLCC and New sky in it, group opacity 85 then 100');
  await scrollSide(0); await click(page.locator('#addg'), 900); await scrollSide(0);
  const gName = await page.evaluate(() => __ed.tree().filter((n) => n.group).map((n) => n.name)[0]); fact('5', 'new_group_default_name', gName);
  const gRow = () => page.locator('#layers .layer.grp').first();
  await click(gRow().locator('button[title="Rename group"]'), 600); await page.keyboard.type('Scene', { delay: 150 }); await sleep(300); await page.keyboard.press('Enter'); await sleep(900);
  await click(gRow().locator('button[title="Move group down"]'), 900); await click(gRow().locator('button[title="Move group down"]'), 1000);
  fact('5', 'root_order_after_group_moves', await page.evaluate(() => __ed.tree().map((n) => n.name).join(' > ')));
  for (const nm of [/^KLCC$/, /^New sky$/]) { const sel = rowRe(nm).locator('select[title="Put this layer in a group"]'); await point(sel); await sleep(500); await sel.selectOption({ label: 'Scene' }); await sleep(1400); await scrollSide(0); }
  await factsNow('5-grouped', true);
  { const op = gRow().locator('input[type=range]').first(); await sliderTo(op, .85, 900); const v = await op.inputValue(); log('group opacity ' + v); if (Math.abs(+v - 85) > 5) { await setv('#layers .layer.grp input[type=range]', 85); } await sleep(1600); await factsNow('5-op85', true);
    await sliderTo(gRow().locator('input[type=range]').first(), 1, 900); const v2 = await gRow().locator('input[type=range]').first().inputValue(); log('group opacity back ' + v2); if (+v2 !== 100) await setv('#layers .layer.grp input[type=range]', 100); await sleep(1500); await factsNow('5-op100', true); }
  fact('5', 'tree', await page.evaluate(() => JSON.stringify(__ed.tree().map((n) => ({ name: n.name, group: !!n.group, adjust: !!n.adjust, children: n.children ? n.children.map((c) => c.name) : undefined })))));
  await scrollSide('bottom'); await pointNewRow(); await sleep(1500); await scrollSide(0); end();
  // ---------- 6 EXPORT
  begin('6', 'Export PSD (download), layers panel summary hold, credit overlay');
  await scrollSide(0); const [dl] = await Promise.all([page.waitForEvent('download'), click(page.locator('#psd'), 1800)]);
  const psdOut = W + '/KLCC_part1_v4.psd'; await dl.saveAs(psdOut); const psz = fs.statSync(psdOut).size; fact('6', 'psd_file', psdOut + ' ' + psz + ' bytes; suggested name ' + dl.suggestedFilename()); fact('6', 'status_after_export', await page.evaluate(() => document.getElementById('status').textContent));
  await scrollSide(0); await glide(1000, 420, 800); await sleep(3200);
  await page.evaluate(() => { const o = document.createElement('div'); o.style.cssText = 'position:fixed;left:50%;bottom:48px;transform:translateX(-50%);z-index:2147483000;background:#000d;color:#fff;font:28px system-ui,sans-serif;padding:16px 30px;border-radius:12px;border:1px solid #fff4;opacity:0;transition:opacity .8s'; o.textContent = 'Photo: Marek Ślusarczyk, CC BY 3.0, Wikimedia Commons'; document.body.appendChild(o); setTimeout(() => o.style.opacity = 1, 30); });
  await sleep(3400); end();
  await factsNow('end', false);
  const vp = page.video(); await ctx.close(); const webm = await vp.path(); log('webm ' + webm + ' total ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s, cut ' + cut.toFixed(2));
  const out = W + '/OplogPic_v4_part1_RAW.mp4'; const r = cp.spawnSync('/usr/bin/ffmpeg', ['-y', '-v', 'error', '-i', webm, '-ss', cut.toFixed(2), '-vf', 'fps=26,scale=1920:1080', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', out], { encoding: 'utf8' }); log('ffmpeg status ' + r.status + ' ' + r.stderr);
  await br.close(); srv.close();
})().catch(async (e) => { log('SCRIPT FAIL ' + e.stack); try { await globalThis.__pg.screenshot({ path: W + '/fail_v4.png' }); } catch (x) {} process.exit(1); });
