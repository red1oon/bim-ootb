// Usage: node film/record_v3.js  (needs: node editor/build_dist.js /tmp/oplogpic_film_dist_v3 first). Film v3, silent. Outputs ~/Videos/oplogpic_v2_work/*_v3_*
const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const { chromium } = require('/home/red1/bim-ootb-psd/poc/psd-oplog/node_modules/playwright-core');
const DIST = '/tmp/oplogpic_film_dist_v3', W = path.join(os.homedir(), 'Videos/oplogpic_v2_work'), PHOTO = W + '/assets/KLCC_dawn_Slusarczyk_CCBY3.jpg';
const VW = +(process.env.VW || 1366), VH = +(process.env.VH || 768), HISTVH = process.env.HISTVH || '46vh';
fs.mkdirSync(W, { recursive: true }); fs.rmSync(W + '/vid3', { recursive: true, force: true });
const LOG = W + '/run_v3.log', TSV = W + '/shot_log_v3.tsv', FACTS = W + '/facts_v3.tsv';
fs.writeFileSync(LOG, ''); fs.writeFileSync(TSV, 'shot\tstart_s\tend_s\ton_screen\n'); fs.writeFileSync(FACTS, 'shot\tkey\tvalue\n');
const log = (m) => { fs.appendFileSync(LOG, m + '\n'); console.log(m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const srv = http.createServer((q, r) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html'; const f = path.join(DIST, u); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
    const t = { '.js': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' }[path.extname(f)] || 'application/octet-stream'; r.writeHead(200, { 'content-type': t }); fs.createReadStream(f).pipe(r); }).listen(0, '127.0.0.1');
  await new Promise((r) => srv.on('listening', r)); const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const br = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--force-device-scale-factor=1.40625', '--window-size=1366,853'] });
  const ctx = await br.newContext({ viewport: null, recordVideo: { dir: W + '/vid3', size: { width: 1920, height: 1080 } }, permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.addInitScript((HV) => { addEventListener('DOMContentLoaded', () => {
    const st = document.createElement('style'); st.textContent = '@keyframes fcring{from{transform:translate(-50%,-50%) scale(.4);opacity:.95}to{transform:translate(-50%,-50%) scale(2.6);opacity:0}} #hist{max-height:' + HV + ' !important}';
    document.head.appendChild(st); const dot = document.createElement('div'); dot.id = 'fcdot'; dot.style.cssText = 'position:fixed;left:-50px;top:-50px;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;background:#ff3b1f;border:3px solid #fff;box-shadow:0 0 0 1.5px #000,0 2px 8px rgba(0,0,0,.6);z-index:2147483647;pointer-events:none'; document.body.appendChild(dot);
    const mv = (e) => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; }; addEventListener('mousemove', mv, true); addEventListener('mousedown', (e) => { mv(e); const r = document.createElement('div'); r.style.cssText = 'position:fixed;left:' + e.clientX + 'px;top:' + e.clientY + 'px;width:44px;height:44px;border-radius:50%;border:4px solid #ff3b1f;z-index:2147483646;pointer-events:none;animation:fcring .5s ease-out forwards'; document.body.appendChild(r); setTimeout(() => r.remove(), 600); }, true); }); }, HISTVH);
  const t0 = Date.now(); const page = await ctx.newPage();
  globalThis.__pg = page; page.on('pageerror', (e) => log('PAGEERROR ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') log('CONSOLE.error ' + m.text()); }); page.on('requestfailed', (r) => log('REQFAILED ' + r.url()));
  await page.goto(base); await page.waitForFunction(() => window.__ed);
  let cx = 700, cy = 300, cut = 0; const now = () => (Date.now() - t0) / 1000 - cut;
  // ---------- SLATE
  await page.evaluate(() => { const o = document.createElement('div'); o.id = 'slate'; o.style.cssText = 'position:fixed;inset:0;background:#0b0d11;z-index:2147483600;display:flex;flex-direction:column;justify-content:center;padding:0 9vw;font-family:system-ui,sans-serif;color:#f1f3f6;transition:opacity 1s';
    const L = (t, sz, col, mt) => { const d = document.createElement('div'); d.textContent = t; d.style.cssText = 'opacity:0;transition:opacity 1.1s;font-size:' + sz + 'px;color:' + col + ';margin-top:' + mt + 'px;line-height:1.25'; o.appendChild(d); return d; };
    window.__sl = [L("What we have that others don't", 60, '#ffffff', 0), L('The history is the file.', 28, '#e6e8ec', 40), L('Change the past: re-edit an old stroke, everything after follows.', 28, '#e6e8ec', 20), L('Prove it: replay from scratch, check the fingerprint.', 28, '#e6e8ec', 20), L('Send the whole history as a link.', 28, '#e6e8ec', 20), L('Close it. Undo still works.', 28, '#e6e8ec', 20), L('Open source (MIT). Runs in the browser. No server.', 18, '#8d95a3', 46)];
    document.body.appendChild(o); });
  await sleep(300); cut = (Date.now() - t0) / 1000; log('CUT (video s before slate) = ' + cut.toFixed(2));
  const TSLATE = [0.6, 2.4, 4.4, 6.4, 8.4, 10.2, 11.8];
  const slateT = Date.now();
  // prepare page while slate is up
  await page.evaluate(() => { document.getElementById('hraw').click(); }); // tick Show raw entries
  for (let i = 0; i < 7; i++) { const w = TSLATE[i] * 1000 - (Date.now() - slateT); if (w > 0) await sleep(w); await page.evaluate((i) => { window.__sl[i].style.opacity = 1; }, i); }
  await sleep(14000 - (Date.now() - slateT)); await page.evaluate(() => { document.getElementById('slate').style.opacity = 0; }); await sleep(1100); await page.evaluate(() => document.getElementById('slate').remove());
  const slateEnd = now();
  const raw = await page.evaluate(() => document.getElementById('hraw').checked); log('raw ticked=' + raw);
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
  // slate shot logged
  fs.appendFileSync(TSV, ['0', '0.0', slateEnd.toFixed(1), 'Slate: "What we have that others don\'t" + 5 lines revealed one by one + foot line; fades out to an empty editor'].join('\t') + '\n');
  fact('0', 'slate_lines', "What we have that others don't | The history is the file. | Change the past: re-edit an old stroke, everything after follows. | Prove it: replay from scratch, check the fingerprint. | Send the whole history as a link. | Close it. Undo still works. | Open source (MIT). Runs in the browser. No server.");
  await page.mouse.move(cx, cy);
  // ---------- ACT 1
  await scrollSide(0); await factsNow('1-start', false);
  begin('1-start', 'Empty editor, History panel with Show raw entries ticked; summary line shows the 3 starting entries'); await sleep(1500);
  await scrollSide('bottom'); await sleep(2500); await factsNow('1-start', false); end();
  const bb = async () => { await scrollSide(0); };
  // (a) photo
  begin('1a', 'Import the photo: one new history row, tiny raw line {"op":"img",...} with its byte size');
  await scrollSide('bottom'); const nBefore = await page.evaluate(() => __ed.ops.length);
  await page.setInputFiles('#photo', PHOTO); await page.waitForFunction((n) => window.__ed.ops.length > n, nBefore, { timeout: 30000 }); await sleep(800);
  await scrollSide('bottom'); await pointNewRow(); await sleep(3200); await factsNow('1a', true); end();
  const imgOp = await page.evaluate(() => JSON.stringify(__ed.ops[__ed.ops.length - 1]).length); fact('1a', 'img_op_json_chars', imgOp);
  // (b) rename
  begin('1b', 'Rename the photo layer (pen icon) to KLCC: a name row'); await scrollSide(0);
  await click(topLayer().locator('button[title="Rename layer"]'), 600); await page.keyboard.type('KLCC', { delay: 170 }); await sleep(400); await page.keyboard.press('Enter'); await sleep(800);
  await scrollSide('bottom'); await pointNewRow(); await sleep(3200); await factsNow('1b', true); end();
  // (c) hide / show
  begin('1c', 'Hide then show the layer (eye): two vis rows'); await scrollSide(0);
  await click(rb('KLCC', 'Hide layer'), 700); await scrollSide('bottom'); await pointNewRow(); await sleep(2600); await factsNow('1c-hide', true);
  await scrollSide(0); await click(rb('KLCC', 'Show layer'), 700); await scrollSide('bottom'); await pointNewRow(); await sleep(2600); await factsNow('1c-show', true); end();
  // (d) one stroke
  begin('1d', 'ONE short brush stroke on the photo: pts "+N more", size in bytes vs the photo reference'); await scrollSide(0);
  await page.evaluate(() => { const e = document.getElementById('hist'); }); await click(page.locator('[data-tool="hard"]'), 400); await setv('#color', '#ffd27a'); await setv('#size', '10'); await sleep(500);
  await stroke([await at(.08, .76), await at(.22, .72), await at(.36, .75), await at(.5, .79)], 22);
  await scrollSide('bottom'); await pointNewRow(); await sleep(3500); const sRow = await factsNow('1d', true); end();
  // ---------- ACT 2
  begin('2a', 'Advanced ticked; layer Grade: whole-canvas rectangle selection, big hard teal brush (size 120) swipes, blend soft-light, opacity 45, Clip, Add mask, sky selection, mask from selection');
  await scrollSide(0); await click(page.locator('#adv'), 800);
  await click(page.locator('#addl'), 900); await click(topLayer().locator('button[title="Rename layer"]'), 600); await page.keyboard.type('Grade', { delay: 150 }); await sleep(300); await page.keyboard.press('Enter'); await sleep(1200); await factsNow('2a-layer', true);
  await click(page.locator('[data-tool="select"]'), 600); await click(page.locator('#s-rect'), 600);
  await drag(await at(.995, .995), await at(.005, .005), 1400); { const sl = await page.evaluate(() => JSON.stringify(__ed.st.sel && { kind: __ed.st.sel.kind, box: __ed.st.sel.box })); log('whole-canvas selection st.sel=' + sl); fact('2a', 'selection_state', sl); if (sl === 'null') throw new Error('selection not made'); } await factsNow('2a-sel', true);
  await click(page.locator('[data-tool="hard"]'), 400); await setv('#color', '#0e9d9b'); await setv('#size', '120'); await sleep(500);
  for (const y of [.62, .78, .46, .30]) { await stroke([await at(.0, y), await at(.35, y + .04), await at(.7, y - .04), await at(1.0, y)], 12); }
  await sleep(1500); await factsNow('2a-teal', true); await click(page.locator('#s-clr'), 1200);
  const gid = await page.evaluate(() => __ed.layers()[__ed.layers().length - 1].id);
  const gsel = topLayer().locator('select'); await point(gsel); await sleep(500); await gsel.selectOption('overlay'); await sleep(1800); await factsNow('2a-mode', true);
  { const op = topLayer().locator('input[type=range]'); const b = await op.boundingBox(); await glide(b.x + b.width - 6, b.y + b.height / 2); await sleep(200); await page.mouse.down(); await glide(b.x + 8 + (b.width - 16) * .45, b.y + b.height / 2, 700); await page.mouse.up(); await sleep(400);
    const v = await op.inputValue(); log('opacity slider value ' + v); if (Math.abs(+v - 45) > 6) { await setv('#layers .layer:first-child input[type=range]', 45); } await sleep(1800); await factsNow('2a-opacity', true); }
  await click(topLayer().locator('button.mb', { hasText: /^Clip$/ }), 1800); await factsNow('2a-clip', true);
  await click(topLayer().locator('button[title="Add mask"]'), 1500); await factsNow('2a-mask', true);
  await click(topLayer().locator('button.mb', { hasText: /^Mask$/ }), 900); { const lab = await topLayer().locator('button.mb').nth(2).textContent(); log('mask brush label ' + lab); if (lab !== 'Hide') await click(topLayer().locator('button.mb').nth(2), 700); fact('2a', 'mask_brush_label', await topLayer().locator('button.mb').nth(2).textContent()); }
  await click(page.locator('[data-tool="soft"]'), 400); await setv('#size', '120'); await sleep(500);
  for (const y of [.17, .23, .29, .36]) { await stroke([await at(.0, y), await at(.35, y + .03), await at(.7, y - .03), await at(1.0, y)], 12); }
  await sleep(2000); await factsNow('2a-skymask', true);
  await click(topLayer().locator('button.mb', { hasText: /^Layer$/ }), 900); await sleep(2500); await factsNow('2a-done', true); end();
  const nBeforeVig = await page.evaluate(() => __ed.ops.length);
  begin('2b', 'Layer Vignette: ellipse selection, Invert, soft black strokes along the edges, multiply, Clip, opacity 60, Clear selection');
  await click(page.locator('#addl'), 900); await click(topLayer().locator('button[title="Rename layer"]'), 600); await page.keyboard.type('Vignette', { delay: 150 }); await sleep(300); await page.keyboard.press('Enter'); await sleep(1000);
  await click(page.locator('[data-tool="select"]'), 500); await click(page.locator('#s-ell'), 500); await drag(await at(.10, .22), await at(.90, .78), 1300); await click(page.locator('#s-inv'), 1000); await factsNow('2b-sel', true);
  await click(page.locator('[data-tool="soft"]'), 400); await setv('#color', '#000000'); await setv('#size', '110'); await sleep(400);
  await stroke([await at(.02, .19), await at(.02, .5), await at(.04, .82)], 14); await stroke([await at(.0, .82), await at(.5, .84), await at(1.0, .82)], 14); await stroke([await at(.98, .82), await at(.97, .5), await at(.98, .19)], 14); await stroke([await at(1.0, .19), await at(.5, .18), await at(.0, .19)], 14);
  await factsNow('2b-strokes', true);
  { const sel = topLayer().locator('select'); await point(sel); await sleep(400); await sel.selectOption('multiply'); await sleep(1400); }
  { const op = topLayer().locator('input[type=range]'); const b = await op.boundingBox(); await glide(b.x + b.width - 6, b.y + b.height / 2); await sleep(200); await page.mouse.down(); await glide(b.x + 8 + (b.width - 16) * .6, b.y + b.height / 2, 600); await page.mouse.up(); await sleep(400); const v = await op.inputValue(); log('vignette opacity ' + v); if (Math.abs(+v - 60) > 6) await setv('#layers .layer:first-child input[type=range]', 60); await sleep(1500); }
  await click(topLayer().locator('button.mb', { hasText: /^Clip$/ }), 1500); await click(page.locator('#s-clr'), 1500); await factsNow('2b-done', true); end();
  begin('2c', 'Glow layer: ellipse around the towers, one soft warm stroke, screen, opacity 35, Clear');
  await click(page.locator('#addl'), 900); await click(topLayer().locator('button[title="Rename layer"]'), 600); await page.keyboard.type('Glow', { delay: 150 }); await sleep(300); await page.keyboard.press('Enter'); await sleep(900);
  await click(page.locator('[data-tool="select"]'), 500); await click(page.locator('#s-ell'), 500); await drag(await at(.18, .24), await at(.66, .74), 1200);
  await click(page.locator('[data-tool="soft"]'), 400); await setv('#color', '#ff9a3c'); await setv('#size', '90'); await sleep(400);
  await stroke([await at(.35, .50), await at(.42, .46), await at(.49, .50)], 16);
  { const sel = topLayer().locator('select'); await point(sel); await sleep(400); await sel.selectOption('screen'); await sleep(1200); }
  { const op = topLayer().locator('input[type=range]'); const b = await op.boundingBox(); await glide(b.x + b.width - 6, b.y + b.height / 2); await sleep(200); await page.mouse.down(); await glide(b.x + 8 + (b.width - 16) * .35, b.y + b.height / 2, 600); await page.mouse.up(); await sleep(400); const v = await op.inputValue(); log('glow opacity ' + v); if (Math.abs(+v - 35) > 6) await setv('#layers .layer:first-child input[type=range]', 35); await sleep(1500); }
  await click(page.locator('#s-clr'), 1500); await click(page.locator('[data-tool="hard"]'), 300);
  await scrollSide(0); await glide(1250, 560, 700); await sleep(4000); await factsNow('2c-end', true); end();
  // ---------- ACT 3
  const histToBottomRow = async (num) => { const r = page.locator('#hist .hrow .hgo').filter({ hasText: new RegExp('^' + num + '\\.') }).first(); await r.scrollIntoViewIfNeeded(); return r; };
  const toHist = async () => { await scrollSide('bottom'); };
  // a
  begin('3a', 'BEFORE/AFTER: click the photo-import row (read-only preview of the untouched photo), Back to now; twice');
  await toHist(); const imgNum = await page.evaluate(() => __ed.ops.findIndex((o) => o.op === 'img') + 1); fact('3a', 'photo_import_entry_number', imgNum);
  for (let k = 0; k < 2; k++) { await scrollHist('bottom'); const r = await histToBottomRow(imgNum); await click(r, 3000); await factsNow('3a-before' + (k + 1), false); await click(page.locator('#pv-back'), 3000); await factsNow('3a-after' + (k + 1), false); }
  end();
  // b
  begin('3b', 'RE-EDIT THE PAST: Edit on the first Grade stroke, change colour and size, Apply; new row Re-edit entry N, italic amended row; preview of the old step; raw text of the original entry is unchanged');
  const gIdx = await page.evaluate((nb) => { const o = __ed.ops; for (let i = 0; i < o.length; i++) if (o[i].op === 'stroke' && Math.abs(o[i].r - 120) < 1 && o[i].c && o[i].c[1] > o[i].c[0]) return i; return -1; }, nBeforeVig); fact('3b', 'first_grade_stroke_entry_number', gIdx + 1);
  const rawBefore = await page.evaluate((i) => HistoryOps.raw(__ed.ops[i]) + '  ' + HistoryOps.bytesOf(__ed.ops[i]) + ' B', gIdx); fact('3b', 'original_entry_raw_before_edit', rawBefore);
  await toHist(); await scrollHist('bottom'); { const r = await histToBottomRow(gIdx + 1); await sleep(800);
    const eb = page.locator('#hist .hrow', { has: page.locator('.hgo', { hasText: new RegExp('^' + (gIdx + 1) + '\\.') }) }).first().locator('button[title="Re-edit this stroke"]'); await click(eb, 1000);
    const ed = page.locator('#hist .hedit'); await ed.scrollIntoViewIfNeeded(); await sleep(600);
    const range = ed.locator('input[type=range]').first(); const rb2 = await range.boundingBox(); await glide(rb2.x + rb2.width * .95, rb2.y + rb2.height / 2); await page.mouse.down(); await glide(rb2.x + rb2.width * .5, rb2.y + rb2.height / 2, 900); await page.mouse.up(); await sleep(500);
    const cb = await ed.locator('input[type=color]').boundingBox(); await glide(cb.x + cb.width / 2, cb.y + cb.height / 2); await sleep(700);
    await page.evaluate(() => { const c = document.querySelector('#hist .hedit input[type=color]'); c.value = '#ff2fa0'; c.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(1000);
    await click(ed.locator('button', { hasText: 'Apply' }), 800); }
  await sleep(2500); await factsNow('3b-applied', true);
  const amendOp = await page.evaluate(() => { const o = __ed.ops[__ed.ops.length - 1]; return JSON.stringify(o); }); fact('3b', 'last_op_json', amendOp);
  await scrollHist(0); await sleep(2500); await scrollHist('bottom'); await sleep(500);
  { const r = await histToBottomRow(gIdx + 1); await sleep(600); const rawj = page.locator('#hist .hrow', { has: page.locator('.hgo', { hasText: new RegExp('^' + (gIdx + 1) + '\\.') }) }).first().locator('.rawj'); await point(rawj); await sleep(3000); fact('3b', 'original_entry_raw_after_edit', await rawj.textContent()); await click(r, 3500); await factsNow('3b-preview-old', false); await click(page.locator('#pv-back'), 2500); }
  end();
  // c
  begin('3c', 'GO BACK TO HERE: preview step ' + nBeforeVig + ' (before the vignette), Go back to here, note, then Ctrl+Shift+Z until all later steps return');
  await toHist(); const nTotal = await page.evaluate(() => __ed.ops.length); fact('3c', 'entries_before_goback', nTotal);
  await scrollHist('bottom'); { const r = await histToBottomRow(nBeforeVig); await click(r, 3000); await factsNow('3c-preview', false); }
  await click(page.locator('#pv-rewind'), 3500); await factsNow('3c-wentback', false);
  for (let i = 0; i < 4; i++) { await page.keyboard.press('Control+Shift+Z'); await sleep(1500); await factsNow('3c-redo' + (i + 1), false); }
  for (let i = 0; i < 80 && await page.evaluate(() => __ed.canRedo()); i++) { await page.keyboard.press('Control+Shift+Z'); await sleep(350); }
  await sleep(2500); await factsNow('3c-allback', false); fact('3c', 'entries_after_redo_all', await page.evaluate(() => __ed.ops.length)); end();
  // d
  begin('3d', 'REPLAY: the whole painting re-plays as a time-lapse'); await toHist(); await click(page.locator('#h-play'), 300);
  await page.waitForFunction(() => /Replay (finished|stopped)/.test(document.getElementById('hmsg').textContent), null, { timeout: 240000 }); await sleep(3000); await factsNow('3d', false); end();
  // e
  begin('3e', 'VERIFY twice: same fingerprint'); await click(page.locator('#h-ver'), 3500); const v1 = await page.evaluate(() => JSON.stringify(window.__verify)); await factsNow('3e-verify1', false); fact('3e', '__verify_1', v1);
  await click(page.locator('#h-ver'), 3500); const v2 = await page.evaluate(() => JSON.stringify(window.__verify)); await factsNow('3e-verify2', false); fact('3e', '__verify_2', v2); end();
  // f
  begin('3f', 'CLOSE AND REOPEN: idle, reload, restored message, Ctrl+Z undoes, Ctrl+Shift+Z redoes'); await glide(900, 400, 600); await sleep(2500);
  fact('3f', 'ckpt_before_reload', JSON.stringify(await page.evaluate(() => window.__ckpt))); const nR = await page.evaluate(() => __ed.ops.length); fact('3f', 'ops_before_reload', nR);
  await page.reload(); await page.waitForFunction(() => window.__ed && window.__ed.ops.length > 3, null, { timeout: 40000 }); await page.waitForFunction(() => /Restored/.test(document.getElementById('status').textContent), null, { timeout: 20000 }).catch(() => log('no Restored status'));
  await page.mouse.move(cx, cy); await sleep(300); await scrollSide('bottom'); await sleep(3000); await factsNow('3f-restored', true); fact('3f', '__restore', JSON.stringify(await page.evaluate(() => window.__restore))); fact('3f', '__ckpt_after_reload', JSON.stringify(await page.evaluate(() => window.__ckpt)));
  await page.keyboard.press('Control+z'); await sleep(3500); await factsNow('3f-undo', true);
  await page.keyboard.press('Control+Shift+Z'); await sleep(3000); await factsNow('3f-redo', true); end();
  // g
  begin('3g1', 'SHARE LINK on the photo painting: the app says the link is too large'); await toHist(); await click(page.locator('#h-share'), 800); await sleep(3500); await factsNow('3g1', false); end();
  begin('3g2', 'New canvas (tap twice), then a small no-photo piece with features'); 
  await scrollSide(0); await click(page.locator('#newc'), 900); await factsNow('3g2-armed', false); await click(page.locator('#newc'), 1800); await factsNow('3g2-newcanvas', true);
  await click(page.locator('[data-tool="select"]'), 500); await click(page.locator('#s-rect'), 500); await drag(await at(.08, .12), await at(.48, .55), 1000);
  await click(page.locator('[data-tool="hard"]'), 400); await setv('#color', '#e53935'); await setv('#size', '46'); await stroke([await at(.02, .2), await at(.3, .4), await at(.6, .35)], 16);
  await click(page.locator('[data-tool="select"]'), 500); await click(page.locator('#s-ell'), 500); await drag(await at(.4, .4), await at(.92, .9), 1000);
  await click(page.locator('[data-tool="hard"]'), 400); await setv('#color', '#1e88e5'); await setv('#size', '50'); await stroke([await at(.3, .85), await at(.6, .6), await at(.95, .55)], 16);
  await click(page.locator('[data-tool="select"]'), 500); await click(page.locator('#s-rect'), 500); await drag(await at(.45, .12), await at(.95, .62), 1000);
  await click(page.locator('#addl'), 900);
  await click(topLayer().locator('button[title="Mask from selection"]'), 1200);
  await click(page.locator('[data-tool="hard"]'), 400); await setv('#color', '#43a047'); await setv('#size', '60'); await stroke([await at(.35, .5), await at(.65, .75), await at(.9, .55)], 16);
  await click(page.locator('#s-clr'), 1000);
  await click(topLayer().locator('button[title="Hide layer"]'), 1500); await click(topLayer().locator('button[title="Show layer"]'), 1500);
  await scrollSide('bottom'); await sleep(2500); await factsNow('3g2-piece', true); end();
  begin('3g3', 'Share link: length + fingerprint; open it in the same page: view only banner; painting does nothing; Edit a copy; altered link refused');
  await toHist(); await click(page.locator('#h-share'), 800); await page.waitForFunction(() => /Link ready|No link/.test(hmsg.textContent)); await sleep(3500); const hm = await factsNow('3g3-share', false);
  const hash = await page.evaluate(() => window.__lastLink); fact('3g3', '__lastLink_length', hash.length); fact('3g3', '__lastLink_head', hash.slice(0, 40) + '...' + hash.slice(-30));
  const nPiece = await page.evaluate(() => __ed.ops.length); fact('3g3', 'entries_in_piece', nPiece);
  // choose an altered payload that still decodes but fails the fingerprint (probe off-screen)
  let bad = null; { const pi = hash.indexOf('&h='); for (let k = 40; k < pi && !bad; k += 7) { const ch = hash[k]; const rep = ch === 'A' ? 'B' : 'A'; const cand = hash.slice(0, k) + rep + hash.slice(k + 1); const r = await page.evaluate(async (c) => { try { await HistoryOps.parseLink(c); return 'OK'; } catch (e) { return e.message; } }, cand); log('alter probe pos ' + k + ' -> ' + r); if (/fingerprint/.test(r)) bad = cand; } }
  await page.goto(base + hash); await page.reload(); await page.waitForFunction(() => window.__viewOnly && window.__ed.ops.length > 3, null, { timeout: 20000 }); await page.mouse.move(cx, cy); await sleep(1000); await scrollSide('bottom'); await sleep(3000); await factsNow('3g3-opened', false);
  const nOpened = await page.evaluate(() => __ed.ops.length); await stroke([await at(.2, .3), await at(.5, .6), await at(.8, .3)], 16); await sleep(1500); const nAfter = await page.evaluate(() => __ed.ops.length); fact('3g3', 'entries_before_trying_to_paint', nOpened); fact('3g3', 'entries_after_trying_to_paint', nAfter); await factsNow('3g3-tried', false);
  await click(page.locator('#pv-copy'), 2500); await factsNow('3g3-copy', false);
  if (bad) { await page.goto(base + bad); await page.reload(); await sleep(1500); await page.mouse.move(cx, cy); await scrollSide('bottom'); await sleep(3500); await factsNow('3g3-altered', false); } else log('NO alterable payload found');
  end();
  // h
  begin('3h', 'Final hold 3 s, then credit overlay 3 s'); await sleep(3000);
  await page.evaluate(() => { const o = document.createElement('div'); o.style.cssText = 'position:fixed;left:50%;bottom:48px;transform:translateX(-50%);z-index:2147483000;background:#000d;color:#fff;font:28px system-ui,sans-serif;padding:16px 30px;border-radius:12px;border:1px solid #fff4;opacity:0;transition:opacity .8s'; o.textContent = 'Photo: Marek Ślusarczyk, CC BY 3.0, Wikimedia Commons'; document.body.appendChild(o); setTimeout(() => o.style.opacity = 1, 30); });
  await sleep(3600); end();
  const vp = page.video(); await ctx.close(); const webm = await vp.path(); log('webm ' + webm + ' total ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s, cut ' + cut.toFixed(2));
  const out = W + '/OplogPic_v3_RAW.mp4'; const r = cp.spawnSync('/usr/bin/ffmpeg', ['-y', '-v', 'error', '-i', webm, '-ss', cut.toFixed(2), '-vf', 'fps=26,scale=1920:1080', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', out], { encoding: 'utf8' }); log('ffmpeg status ' + r.status + ' ' + r.stderr);
  await br.close(); srv.close();
})().catch(async (e) => { log('SCRIPT FAIL ' + e.stack); try { await globalThis.__pg.screenshot({ path: W + '/fail_v3.png' }); } catch (x) {} process.exit(1); });
