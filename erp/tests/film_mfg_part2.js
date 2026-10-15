// ⚠ DO NOT REMOVE — Manufacturing film PART II: the friendly-ops lens (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §15-§16). RAW take (no narration, no cards; those are added in POST).
// ONE take, CPU only, English UI, real mouse/keyboard on the real page. Every fact is a §ERP_FILM_FACT read from the live in-browser DB/DOM. READ <out>/erp_film.log and <out>/erp_film.page.log before any conclusion; exit code is not evidence.
// The claims the film SHOWS are proven by W-FRIENDLY-OPS (erp/tests/witness_friendly_ops.js): same events, same books, preview == save, counts == tip.
// Run: [DRY=1] [REPO=<worktree root>] node erp/tests/film_mfg_part2.js <outDir>
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const REPO = process.env.REPO || path.join(__dirname, '..', '..'), DRY = !!process.env.DRY;
const OUT = path.resolve(process.argv[2] || '.'); const FR = path.join(OUT, 'frames'); fs.mkdirSync(FR, { recursive: true });
const LOG = [], PAGELOG = []; const say = (s) => { LOG.push(s); console.log(s); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.sql': 'text/plain' };
const server = http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]); const fp = path.join(REPO, p);
  fs.stat(fp, (e, st) => { if (e || st.isDirectory()) { res.writeHead(404); res.end('404 ' + p); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Content-Length': st.size }); fs.createReadStream(fp).pipe(res); }); });
const CURSOR = `(() => { const go = () => { if (document.getElementById('__fc')) return;
  const c = document.createElement('div'); c.id = '__fc';
  c.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;margin:-3px 0 0 -3px;z-index:2147483647;pointer-events:none;background:url("data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2222%22 height=%2222%22><path d=%22M3 2 L3 18 L7.5 14 L10.5 20.5 L13 19.4 L10.1 13 L16 13 Z%22 fill=%22white%22 stroke=%22black%22 stroke-width=%221.4%22/></svg>") no-repeat';
  document.documentElement.appendChild(c);
  const at = (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; };
  addEventListener('mousemove', at, true);
  addEventListener('mousedown', (e) => { at(e); const r = document.createElement('div');
    r.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;border:3px solid #ffb400;border-radius:50%;width:10px;height:10px;left:' + (e.clientX - 5) + 'px;top:' + (e.clientY - 5) + 'px;transition:all .45s ease-out;opacity:1';
    document.documentElement.appendChild(r); requestAnimationFrame(() => { r.style.transform = 'scale(4)'; r.style.opacity = '0'; }); setTimeout(() => r.remove(), 600); }, true); };
  if (document.documentElement) go(); else addEventListener('DOMContentLoaded', go); })();`;
(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port, base = 'http://localhost:' + port + '/erp';
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3 }); await ctx.addInitScript(CURSOR);
  const page = await ctx.newPage();
  page.on('console', m => PAGELOG.push(m.text())); page.on('pageerror', e => PAGELOG.push('PAGEERR ' + e)); page.on('dialog', async d => { PAGELOG.push('DIALOG ' + d.message()); await d.accept(); });
  const fact = (k, v) => say('§ERP_FILM_FACT ' + k + '=' + String(v).replace(/\s+/g, ' ').slice(0, 400));
  const lastLog = (n, re) => PAGELOG.slice(n).filter(l => re.test(l)).pop() || '';
  const sql = async (s) => { const r = await page.evaluate(q => { try { const r = window.__idmpDb.exec(q); return r.length ? r[0].values : []; } catch (e) { return 'ERR ' + e.message; } }, s); return r; };
  const hold = (ms) => page.waitForTimeout(ms);

  // ── screencast (skipped in DRY) ──
  const frames = []; let T0 = null, cdp = null;
  async function cast() {
    if (DRY) return; cdp = await ctx.newCDPSession(page); const me = cdp;
    me.on('Page.screencastFrame', async f => { const fn = path.join(FR, String(frames.length).padStart(6, '0') + '.jpg'); fs.writeFileSync(fn, Buffer.from(f.data, 'base64')); frames.push({ fn, ts: f.metadata.timestamp }); if (T0 === null) T0 = f.metadata.timestamp; me.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
    await me.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  }
  const nowT = () => (T0 === null ? 0 : Date.now() / 1000 - T0);
  // per-beat gesture tally (ERP_FRIENDLY_OPS_LENS.md §14): G = clicks + selects + typed fields, the same unit the Odoo recorder counts
  const GT = { click: 0, select: 0, type: 0 }; let GPrev = null, GPrevId = null;
  const gestFlush = () => { if (GPrevId) { const d = Object.fromEntries(Object.keys(GT).map(k => [k, GT[k] - GPrev[k]])); say('§ERP_FILM_GESTURES beat=' + GPrevId + ' G=' + (d.click + d.select + d.type) + ' clicks=' + d.click + ' selects=' + d.select + ' typed=' + d.type); } };
  const beat = (id, note) => { gestFlush(); GPrev = { ...GT }; GPrevId = id; say('§ERP_FILM_BEAT id=' + id + ' t=' + nowT().toFixed(2) + ' ' + (note || '')); };
  async function glide(sel) { const loc = page.locator(sel).first(); await loc.scrollIntoViewIfNeeded().catch(() => {}); const b = await loc.boundingBox(); if (!b) throw new Error('no box for ' + sel); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: DRY ? 3 : 22 }); await hold(DRY ? 40 : 160); }
  let clicks = 0, cursorOk = 0;
  async function hclick(sel) { await glide(sel); const c = await page.evaluate(() => { const e = document.getElementById('__fc'); return e ? [parseFloat(e.style.left), parseFloat(e.style.top)] : null; }); const b = await page.locator(sel).first().boundingBox();
    clicks++; GT.click++; if (c && b && Math.abs(c[0] - (b.x + b.width / 2)) < 2 && Math.abs(c[1] - (b.y + b.height / 2)) < 2) cursorOk++; await page.mouse.down(); await hold(60); await page.mouse.up(); await hold(DRY ? 150 : 280); }
  const htype = async (sel, text) => { GT.type++; await glide(sel); await page.click(sel); await page.fill(sel, ''); await page.type(sel, text, { delay: DRY ? 5 : 80 }); await hold(DRY ? 60 : 350); };
  const pace = (ms) => hold(DRY ? Math.min(ms, 120) : ms);

  // ── setup OFF CAMERA (Part I showed all of it): fresh page, Libero installed and started, Part I's prerequisite; the take opens on the login screen ──
  await page.goto(base + '/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
  for (const n of ['erp_cache', 'fold_plugins']) await page.evaluate(x => new Promise(r => { const q = indexedDB.deleteDatabase(x); q.onsuccess = q.onerror = q.onblocked = () => r(); }), n);
  await page.goto(base + '/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__idmpDb && !!window.PluginRelease && document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0, null, { timeout: 30000 });
  await page.evaluate(async (u) => { const r = window.PluginEngine._reg(); await r.installBundle(u); await r.startBundle('org.idempiere.mfg'); }, base + '/plugins/libero_manufacturing.mjs');
  await hold(1200);
  const fx = await page.evaluate(() => { const db = window.__idmpDb, run = (s) => db.run(s);
    const cats = db.exec('SELECT DISTINCT m_product_category_id FROM m_product WHERE m_product_id IN (50007,50008,50014)')[0].values.map(r => r[0]);
    cats.forEach(c => run("UPDATE m_product_category_acct SET costingmethod='S' WHERE m_product_category_id=" + c));
    run('UPDATE m_cost SET currentcostprice=2.5 WHERE m_product_id=50008 AND m_costelement_id=100 AND c_acctschema_id=101 AND m_costtype_id=100 AND ad_org_id=0');
    run('UPDATE m_cost SET currentcostprice=0.4 WHERE m_product_id=50014 AND m_costelement_id=100 AND c_acctschema_id=101 AND m_costtype_id=100 AND ad_org_id=0');
    run('DELETE FROM m_storageonhand WHERE m_product_id IN (50007,50008,50014)');
    run("INSERT INTO m_storageonhand (ad_client_id, ad_org_id, isactive, m_locator_id, m_product_id, m_attributesetinstance_id, qtyonhand, datematerialpolicy, m_storageonhand_uu) VALUES (11,50006,'Y',50001,50008,0,10000,'2026-01-01 00:00:00','film-kg'),(11,50006,'Y',50001,50014,0,500,'2026-01-01 00:00:00','film-bag')");
    return cats; });
  fact('prerequisite.offCamera', 'Libero started, GardenAdmin, standard costing cats=' + JSON.stringify(fx) + ' KG=2.5 BAG=0.4 on-hand KG=10000 BAG=500');
  await hold(800); await cast(); await page.mouse.move(720, 500); await hold(DRY ? 100 : 1500);
  const tip = (q) => page.evaluate(x => window.__crud.withModelTrx(f => f(x)), q);
  const NEWB = '#idmp-toolbar [data-tb="new"]', F = (c, t) => '#idmp-inline-mount ' + (t || 'input') + '[data-col="' + c + '"]';
  const optBy = async (col, re) => { const o = (await page.$$eval('#idmp-inline-mount select[data-col="' + col + '"] option', os => os.map(x => ({ v: x.value, t: x.text })))).find(x => x.v && re.test(x.t)); if (!o) throw new Error('no option ' + col + ' ' + re); return o; };
  const hselect = async (sel, val) => { GT.select++; await glide(sel); await page.selectOption(sel, val); await hold(DRY ? 60 : 500); };
  const rowsOf = () => page.evaluate(() => [...document.querySelectorAll('#pr-osgi table.oc-t > tbody > tr:not(.oc-d)')].map(tr => ({ id: tr.cells[0].textContent.trim(), name: tr.cells[1].textContent.trim(), status: tr.cells[3].textContent.trim() })));
  const hdate = async (sel, v) => { GT.type++; await glide(sel); await page.fill(sel, v); await page.locator(sel).first().dispatchEvent('change'); await hold(DRY ? 60 : 400); };
  const lensBar = () => page.$$eval('[data-lens-action]', e => e.map(x => x.textContent));
  async function openMenuById(menuId) {
    const chain = await page.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); if (!leaf) return null; const out = []; let n = leaf.parentElement.parentElement;
      while (n && n.id !== 'idmp-tree') { if (n.classList.contains('idmp-node')) out.unshift(n.querySelector(':scope > .idmp-row').getAttribute('data-menu-id')); n = n.parentElement; } return out; }, menuId);
    if (!chain) throw new Error('menu id not in tree: ' + menuId);
    for (const id of chain) { const open = await page.evaluate(i => { const r = document.querySelector('#idmp-tree .idmp-row[data-menu-id="' + i + '"]'); return r && r.parentElement.classList.contains('open'); }, id); if (!open) await hclick('#idmp-tree .idmp-row[data-menu-id="' + id + '"]'); }
    await hold(400); await page.locator('#idmp-tree .idmp-row.leaf[data-menu-id="' + menuId + '"]').scrollIntoViewIfNeeded(); await hclick('#idmp-tree .idmp-row.leaf[data-menu-id="' + menuId + '"]');
  }
  async function preview(tag) {
    const n = PAGELOG.length; await hclick('[data-lens-action="friendly-ops:preview"]'); await page.waitForSelector('[data-save-preview]', { timeout: 10000 }); await pace(DRY ? 300 : 900);
    fact(tag + '.panel', (await page.$eval('[data-save-preview]', b => b.getAttribute('data-save-preview') + ' | ' + b.textContent.replace(/\s+/g, ' ').replace(/Close$/, ''))).slice(0, 400));
    fact(tag + '.log', PAGELOG.slice(n).filter(l => /§SAVE-PREVIEW/.test(l)).pop() || 'NO §SAVE-PREVIEW');
    fact(tag + '.nothingWritten', 'pp_order=' + (await tip('SELECT COUNT(*) AS n FROM pp_order'))[0].n);
    await pace(DRY ? 300 : 6500); await hclick('[data-preview-close]'); await pace(700);
  }
  try {
    // ═══ P1 the lens is an add-on like any other: install it from the panel ═══
    beat('p1', 'Install the Friendly ops lens');
    await hclick('#idmp-release-link'); await page.waitForSelector('#pr-osgi table.oc-t', { timeout: 10000 }); await pace(1500);
    if (!(await page.locator('#pr-osgi [data-oc-url]:visible').count())) await hclick('#pr-osgi [data-oc-installtoggle]');
    await page.waitForSelector('#pr-osgi [data-oc-url]'); await pace(500);
    const n1 = PAGELOG.length; await htype('#pr-osgi [data-oc-url]', 'plugins/friendly_ops.mjs'); await hclick('#pr-osgi [data-oc-doinstall]'); await hold(DRY ? 1500 : 2500);
    fact('lens.installed', JSON.stringify((await rowsOf()).find(r => /Friendly/i.test(r.name))) + ' | ' + (PAGELOG.slice(n1).filter(l => /§PLUGIN-START/.test(l)).pop() || ''));
    await hclick('#pr-osgi a.oc-nm:text-matches("Friendly", "i")').catch(() => {}); await pace(2500);
    fact('lens.detail', (await page.evaluate(() => (document.querySelector('#pr-osgi tr.oc-d') || {}).textContent || '')).replace(/\s+/g, ' ').slice(0, 300));
    await hclick('#pr-root [data-pr-close]'); await pace(600);
    await hclick("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await page.waitForSelector('#idmp-login-step1:visible'); await hold(300);
    await hclick("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await page.waitForSelector('#idmp-login-step2:visible'); await hold(300);
    await hclick('#idmp-login-ok'); await page.waitForSelector('#idmp-home', { timeout: 20000 }).catch(() => {}); await pace(2000);

    // ═══ P2 a new order: Preview shows what Save will write, before anything is saved ═══
    beat('p2', 'New order, then Preview');
    await openMenuById(53055); await page.waitForSelector(NEWB, { timeout: 20000 }); await pace(1500);
    await hclick(NEWB); await page.waitForSelector('#idmp-inline-mount .cfrow', { timeout: 10000 }); await pace(900);
    fact('lens.barWhileEditing', JSON.stringify(await lensBar()));
    await hselect(F('c_doctypetarget_id', 'select'), (await optBy('c_doctypetarget_id', /^Manufacturing Order/)).v);
    await hselect(F('ad_org_id', 'select'), (await optBy('ad_org_id', /^Fertilizer \(/)).v);
    await hselect(F('m_warehouse_id', 'select'), (await optBy('m_warehouse_id', /^Fertilizer \(/)).v);
    await hselect(F('s_resource_id', 'select'), (await optBy('s_resource_id', /Fertilizer Plant/)).v);
    await hselect(F('m_product_id', 'select'), (await optBy('m_product_id', /Fertilizer #70/)).v); await pace(900);
    await hselect(F('priorityrule', 'select'), (await optBy('priorityrule', /Medium/)).v); await htype(F('qtyentered'), '100');
    await page.fill(F('datestartschedule'), '2008-08-16'); await page.fill(F('datepromised'), '2008-08-17'); await page.fill(F('datefinishschedule'), '2008-08-17'); GT.type += 3; await pace(700);
    await preview('preview.ok');

    // ═══ P3 the same Preview catches what Save would refuse: a start date before the BOM is valid ═══
    beat('p3', 'Preview catches a refusal');
    await hdate(F('datestartschedule'), '2007-01-01'); await pace(500);
    await preview('preview.refused');
    await hdate(F('datestartschedule'), '2008-08-16'); await pace(600);

    // ═══ P4 Save & Complete: one click for Save then Complete ═══
    beat('p4', 'Save & Complete');
    const nSC = PAGELOG.length; await hclick('[data-lens-action="friendly-ops:save-complete"]');
    let o = null; for (let i = 0; i < 60; i++) { o = (await tip('SELECT pp_order_id AS id, documentno, qtyordered, docstatus FROM pp_order WHERE pp_order_id<0 ORDER BY pp_order_id ASC LIMIT 1'))[0]; if (o && o.docstatus === 'CO') break; await page.waitForTimeout(200); }
    await hold(DRY ? 600 : 2500);
    fact('lens.saveComplete', JSON.stringify(o) + ' | ' + (PAGELOG.slice(nSC).filter(l => /§OPS-LENS docAction/.test(l)).pop() || ''));
    fact('lens.children', JSON.stringify({ bomLines: (await tip('SELECT COUNT(*) AS n FROM pp_order_bomline WHERE pp_order_id=' + o.id))[0].n, mrp: (await tip('SELECT COUNT(*) AS n FROM pp_mrp WHERE pp_order_id=' + o.id))[0].n, cost: (await tip('SELECT COUNT(*) AS n FROM pp_order_cost WHERE pp_order_id=' + o.id))[0].n }));
    fact('lens.barOnOrder', JSON.stringify(await lensBar())); await pace(2000);

    // ═══ P5 the order opens its own Receipt & Issue, the order already chosen ═══
    beat('p5', 'Receipt & Issue from the order');
    await hclick('[data-lens-action^="friendly-ops:form:"]'); await page.waitForSelector('[data-gform]', { timeout: 20000 }); await pace(2500);
    fact('form.preset', await page.$eval('[data-gform-param=PP_Order_ID]', e => (e.options[e.selectedIndex] || {}).textContent));
    const nP = PAGELOG.length; await hclick('[data-gform-run]');
    for (let i = 0; i < 80 && !(await page.$eval('[data-gform-msg]', e => e.textContent).catch(() => '')); i++) await page.waitForTimeout(250);
    await hold(DRY ? 1500 : 3500);
    fact('form.commit', PAGELOG.slice(nP).filter(l => /§AD-FORM-GENERIC commit/.test(l)).pop() || ''); fact('form.message', await page.$eval('[data-gform-msg]', e => e.textContent).catch(() => ''));
    await pace(1500);

    // ═══ P6 back on the order: what is linked to it, with counts; open the cost collectors ═══
    beat('p6', 'Back on the order: Cost Collector (3)');
    await openMenuById(53055); await page.waitForSelector(NEWB, { timeout: 20000 }); await pace(1200);
    if (!(await page.locator('.idmp-grid tbody tr').count())) { await hclick('#idmp-toolbar [data-tb="toggle"]'); await pace(700); }
    const rowSel = '.idmp-grid tbody tr:has(td:text-is("' + o.documentno + '"))';
    if (await page.locator(rowSel).count()) { await hclick(rowSel); await pace(1200); }
    fact('lens.related', JSON.stringify(await lensBar()) + ' tipCollectors=' + (await tip('SELECT COUNT(*) AS n FROM pp_cost_collector WHERE pp_order_id=' + o.id))[0].n);
    await pace(2500);
    await hclick('[data-lens-action^="friendly-ops:rel:"]'); await pace(2000);
    if (!(await page.locator('.idmp-grid tbody tr').count())) { await hclick('#idmp-toolbar [data-tb="toggle"]'); await pace(700); }
    fact('collectors.grid', (await page.locator('.idmp-grid tbody tr').count()) + ' rows | ' + (PAGELOG.filter(l => /§ZOOM-ACROSS-OPEN/.test(l)).pop() || ''));
    await pace(5000);

    // ═══ P7 stop the lens: the same order, the plain toolbar ═══
    beat('p7', 'Stop the lens');
    await page.evaluate(() => window.PluginRelease.open()); await page.waitForSelector('#pr-osgi table.oc-t', { timeout: 10000 }); await pace(1200);
    await hclick('#pr-osgi [data-oc-stop="org.kernel.friendly-ops"]'); await pace(1500);
    fact('lens.afterStop', JSON.stringify({ lenses: await page.evaluate(() => window.AdLens.count()), row: (await rowsOf()).find(r => /Friendly/i.test(r.name)) }));
    await hclick('#pr-root [data-pr-close]'); await pace(600);
    await openMenuById(53055); await page.waitForSelector(NEWB, { timeout: 20000 }); await pace(1200);
    if (await page.locator(rowSel).count()) { await hclick(rowSel); await pace(1000); }
    fact('plain.toolbar', JSON.stringify({ lensBar: await page.locator('#idmp-lensbar').count(), order: (await tip('SELECT documentno, docstatus FROM pp_order WHERE pp_order_id=' + o.id))[0] }));
    await hold(DRY ? 300 : 4000);
    gestFlush(); GPrevId = null;
    say('§ERP_FILM_CURSOR clicks=' + clicks + ' cursorOnTarget=' + cursorOk + (clicks === cursorOk ? ' OK' : ' WRONG'));
  } catch (e) { say('§ERP_FILM_ERROR ' + String(e.stack || e.message).split('\n').slice(0, 3).join(' | ')); }
  if (cdp) await cdp.send('Page.stopScreencast').catch(() => {}); await page.waitForTimeout(300).catch(() => {});
  fs.writeFileSync(path.join(OUT, 'erp_film.page.log'), PAGELOG.join('\n') + '\n');
  const errs = PAGELOG.filter(l => /^PAGEERR/.test(l)); say('§ERP_FILM_PAGEERRORS ' + errs.length + ' ' + errs.slice(0, 2).join(' | '));
  if (!DRY && frames.length) {
    const endTs = Date.now() / 1000, lines = [];
    frames.forEach((f, i) => { const d = (i + 1 < frames.length ? frames[i + 1].ts : endTs) - f.ts; lines.push(`file '${f.fn}'`, `duration ${Math.max(d, 0.001).toFixed(4)}`); }); lines.push(`file '${frames[frames.length - 1].fn}'`);
    fs.writeFileSync(path.join(OUT, 'frames.txt'), lines.join('\n') + '\n'); const mp4 = path.join(OUT, 'mfg_part2_raw.mp4');
    try { execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(OUT, 'frames.txt'), '-vf', 'fps=24,scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-crf', '17', '-preset', 'medium', mp4]); say('§ERP_FILM_DONE frames=' + frames.length + ' dur=' + (endTs - T0).toFixed(2) + ' out=' + mp4); } catch (e) { say('§ERP_FILM_ERROR ffmpeg ' + String(e.message).split('\n')[0]); }
  }
  fs.writeFileSync(path.join(OUT, 'erp_film.log'), LOG.join('\n') + '\n'); await browser.close(); server.close();
})();
