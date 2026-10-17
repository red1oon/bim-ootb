// ⚠ DO NOT REMOVE — ERP film PART IV: "SQLite based Kernel ERP, getting friendlier" (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §37). A CONTINUATION of Part II (nothing repeated): one-click install of the friendly plugin, built-in Ninja bundles in the pill tray, Add row / Save & back, Ship and Invoice from the order. RAW take (no narration; cards carry the numbers).
// ONE take, CPU only, English UI, real mouse/keyboard on the real page. Every fact is a §ERP_FILM_FACT read from the live in-browser DB/DOM. READ <out>/erp_film.log and <out>/erp_film.page.log before any conclusion; exit code is not evidence.
// The claims the film SHOWS are proven by W-FO-OPTIN, W-NINJA-BUNDLES, W-FO-A1, W-FO-A2, W-GEN-TIPREAD (erp/tests/). Cards read their numbers from those witnesses' logs, never from this run.
// Run: [DRY=1] [REPO=<worktree root>] [BEAT_MIN='{"q0":14.0,...}'] [FOA1_LOG=<W-FO-A1 log>] [FOA2_LOG=<W-FO-A2 log>] node erp/tests/film_erp_part4.js <outDir>
// Narrated cut (2026-10-16): cards cover every navigation (no flash), each scene holds for its narration line (BEAT_MIN from film_narration_poly.py measure + 1 s); narration bim-compiler prompts/film_narration_mfg_part2_dialogue.tsv.
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
  const MIN = JSON.parse(process.env.BEAT_MIN || '{}'); let prevB = null;
  const holdFor = async () => { if (prevB && MIN[prevB.id] && !DRY) { const wait = MIN[prevB.id] - (nowT() - prevB.t); if (wait > 0) { say('§ERP_FILM_HOLD after=' + prevB.id + ' extra=' + wait.toFixed(2)); await page.waitForTimeout(wait * 1000); } } };
  const beat = async (id, note) => { await holdFor(); gestFlush(); GPrev = { ...GT }; GPrevId = id; prevB = { id, t: nowT() }; say('§ERP_FILM_BEAT id=' + id + ' t=' + nowT().toFixed(2) + ' lang=en ' + (note || '')); };
  async function glide(sel) { const loc = page.locator(sel).first(); await loc.scrollIntoViewIfNeeded().catch(() => {}); const b = await loc.boundingBox(); if (!b) throw new Error('no box for ' + sel); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: DRY ? 3 : 22 }); await hold(DRY ? 40 : 160); }
  let clicks = 0, cursorOk = 0;
  async function hclick(sel) { await glide(sel); const c = await page.evaluate(() => { const e = document.getElementById('__fc'); return e ? [parseFloat(e.style.left), parseFloat(e.style.top)] : null; }); const b = await page.locator(sel).first().boundingBox();
    clicks++; GT.click++; if (c && b && Math.abs(c[0] - (b.x + b.width / 2)) < 2 && Math.abs(c[1] - (b.y + b.height / 2)) < 2) cursorOk++; await page.mouse.down(); await hold(60); await page.mouse.up(); await hold(DRY ? 150 : 280); }
  const htype = async (sel, text) => { GT.type++; await glide(sel); await page.click(sel); await page.fill(sel, ''); await page.type(sel, text, { delay: DRY ? 5 : 80 }); await hold(DRY ? 60 : 350); };
  const pace = (ms) => hold(DRY ? Math.min(ms, 120) : ms);

  // ── setup OFF CAMERA (Part I showed all of it): fresh page, Libero installed and started, Part I's prerequisite; the take opens on a card over the login screen ──
  const HOMEDIR = require('os').homedir();
  const readOr = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return ''; } };
  await page.goto(base + '/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
  for (const n of ['erp_cache', 'fold_plugins']) await page.evaluate(x => new Promise(r => { const q = indexedDB.deleteDatabase(x); q.onsuccess = q.onerror = q.onblocked = () => r(); }), n);
  await page.goto(base + '/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__idmpDb && !!window.PluginRelease && document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0, null, { timeout: 30000 });
  await hold(1200);
  // a card covers the page; navigation behind it uses plain in-page clicks (no cursor, no gesture count)
  const card = async (title, sub, heads, rows) => { await page.evaluate(({ title, sub, heads, rows }) => {
      const old = document.getElementById('__card'); const d = document.createElement('div'); d.id = '__card';
      d.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#10151c;color:#e8edf3;font-family:DejaVu Sans,Arial,sans-serif;display:flex;flex-direction:column;justify-content:center;padding:0 90px';
      const tone = ['#7fd1ff', '#ff9b8a', '#7ee0a0'];
      const tbl = rows && rows.length ? '<table style="border-collapse:collapse;width:100%;margin-top:26px">' + (heads ? '<tr style="font-size:20px;color:#8fa0b3"><td></td>' + heads.map(h => '<td style="text-align:center;padding:6px 22px">' + h + '</td>').join('') + '</tr>' : '') +
        rows.map(r => '<tr style="border-top:1px solid #243040"><td style="padding:14px 22px;font-size:25px;color:#c9d4e0;width:36%">' + r.label + '</td>' + r.cells.map((c, i) => '<td style="padding:14px 22px;text-align:center;font-size:' + (c.small ? 24 : 44) + 'px;font-weight:700;color:' + (c.tone || tone[i % 3]) + '">' + c.v + (c.rec ? '<div style="font-size:15px;font-weight:400;color:#8fa0b3;margin-top:4px">recorded · ' + c.rec + '</div>' : '') + '</td>').join('') + '</tr>').join('') + '</table>' : '';
      d.innerHTML = '<div style="font-size:21px;letter-spacing:.14em;color:#8fa0b3;text-transform:uppercase">Kernel ERP · Part IV · Friendlier operations</div><div style="font-size:52px;font-weight:700;margin:8px 0 6px">' + title + '</div><div style="font-size:25px;color:#b8c4d2;max-width:1500px">' + sub + '</div>' + tbl;
      document.body.appendChild(d); if (old) old.remove(); }, { title, sub, heads: heads || null, rows: rows || [] }); };
  const ipc = (sel) => page.locator(sel).first().evaluate(e => e.click());   // in-page click: works under the card, no cursor, not a counted gesture
  const uncard = () => page.evaluate(() => { const d = document.getElementById('__card'); if (d) d.remove(); });
  const tip = (q) => page.evaluate(x => window.__crud.withModelTrx(f => f(x)), q);
  const NEWB = '#idmp-toolbar [data-tb="new"]', F = (c, t) => '#idmp-inline-mount ' + (t || 'input') + '[data-col="' + c + '"]';
  const optBy = async (col, re) => { const o = (await page.$$eval('#idmp-inline-mount select[data-col="' + col + '"] option', os => os.map(x => ({ v: x.value, t: x.text })))).find(x => x.v && re.test(x.t)); if (!o) throw new Error('no option ' + col + ' ' + re); return o; };
  const hselect = async (sel, val) => { GT.select++; await glide(sel); await page.selectOption(sel, val); await hold(DRY ? 60 : 500); };
  const hdate = async (sel, v) => { GT.type++; await glide(sel); await page.fill(sel, v); await page.locator(sel).first().dispatchEvent('change'); await hold(DRY ? 60 : 400); };
  const rowsOf = () => page.evaluate(() => [...document.querySelectorAll('#pr-osgi table.oc-t > tbody > tr:not(.oc-d)')].map(tr => ({ id: tr.cells[0].textContent.trim(), name: tr.cells[1].textContent.trim(), status: tr.cells[3].textContent.trim() })));
  const lensBar = () => page.$$eval('[data-lens-action]', e => e.map(x => x.textContent));
  async function openMenuById(menuId) {
    const chain = await page.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); if (!leaf) return null; const out = []; let n = leaf.parentElement.parentElement;
      while (n && n.id !== 'idmp-tree') { if (n.classList.contains('idmp-node')) out.unshift(n.querySelector(':scope > .idmp-row').getAttribute('data-menu-id')); n = n.parentElement; } return out; }, menuId);
    if (!chain) throw new Error('menu id not in tree: ' + menuId);
    for (const id of chain) { const open = await page.evaluate(i => { const r = document.querySelector('#idmp-tree .idmp-row[data-menu-id="' + i + '"]'); return r && r.parentElement.classList.contains('open'); }, id); if (!open) await hclick('#idmp-tree .idmp-row[data-menu-id="' + id + '"]'); }
    await hold(400); await page.locator('#idmp-tree .idmp-row.leaf[data-menu-id="' + menuId + '"]').scrollIntoViewIfNeeded(); await hclick('#idmp-tree .idmp-row.leaf[data-menu-id="' + menuId + '"]');
  }
  // behind-card menu open: in-page clicks only
  async function menuBehind(menuId) {
    await page.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); let n = leaf.parentElement; while (n && n.id !== 'idmp-tree') { if (n.classList && n.classList.contains('idmp-node')) n.classList.add('open'); n = n.parentElement; } leaf.click(); }, menuId);
  }
  const EN = 'friendly-ops', FID = 'org.kernel.friendly-ops', NX = 'org.idempiere.ninja.excel';
  const menuIdOf = (win) => page.evaluate((w) => { const r = window.__idmpDb.exec("SELECT AD_Menu_ID FROM AD_Menu WHERE Action='W' AND AD_Window_ID=" + w + " AND IsActive='Y'"); return (r.length ? r[0].values.map(x => x[0]) : []).find(i => document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + i + '"]')); }, win);
  const pills = () => page.$$eval('#idmp-pill button[id^="pill-"]', b => b.map(x => x.id.slice(5)));
  const openConsole = async () => { await page.evaluate(() => window.PluginRelease.open()); await page.waitForSelector('#pr-osgi table.oc-t', { timeout: 10000 }); await hold(700); };
  const closeConsole = async () => { await hclick('#pr-root [data-pr-close]'); await pace(500); };
  const readOr2 = (f) => readOr(f);
  const FOA1 = process.env.FOA1_LOG || path.join(HOMEDIR, 'bim-compiler/build/erp/logs_odoo_observe/w_fo_a1_run3.log'), FOA2 = process.env.FOA2_LOG || path.join(HOMEDIR, 'bim-compiler/build/erp/logs_odoo_observe/w_fo_a2_run7.log');
  try {
    // ═══ P0 title card; behind it the login screen and the Plugins & Releases console ═══
    await card('Getting friendlier', 'The SQLite based Kernel ERP, with the friendly plugin: the same documents and postings as iDempiere, fewer steps to reach them. Optional, and off until you install it.');
    await cast(); await page.mouse.move(720, 500); await beat('p0', 'title card');
    await ipc('#idmp-release-link'); await page.waitForSelector('#pr-osgi table.oc-t', { timeout: 10000 }); await hold(DRY ? 200 : 2500);

    // ═══ P1 offered, not imposed: the console lists what is on the page; the friendly plugin is an offer, one click ═══
    await beat('p1', 'offer in the console'); await uncard(); await pace(1500);
    fact('console.rowsBefore', JSON.stringify(await rowsOf()));
    fact('console.offer', String(await page.locator('[data-oc-offerrow="' + FID + '"]').count()) + ' offer row(s)');
    await glide('[data-oc-offerrow="' + FID + '"]'); await pace(2200);
    const n1 = PAGELOG.length; await hclick('[data-oc-offer="' + FID + '"]'); await hold(DRY ? 1500 : 2800);
    fact('console.installed', JSON.stringify((await rowsOf()).find(r => /Friendly/i.test(r.name))) + ' | ' + (PAGELOG.slice(n1).filter(l => /§PLUGIN-START/.test(l)).pop() || '') + ' | offerRowsNow=' + (await page.locator('[data-oc-offerrow="' + FID + '"]').count()));

    // ═══ P3 behind a short card: log in, open the Sales Order window ═══
    await beat('p3', 'card: a sales order');
    await card('A sales order, start to finish', 'Standard Order, one line. The plugin adds the buttons on the order itself.');
    await ipc("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await page.waitForSelector('#idmp-login-step1:visible');
    await ipc("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await page.waitForSelector('#idmp-login-step2:visible');
    await ipc('#idmp-login-ok'); await page.waitForSelector('#idmp-home', { timeout: 20000 }).catch(() => {}); await hold(1500);
    await uncard(); await pace(800);
    // ═══ P2 core bundles are bundles: the Excel Report Ninja stops and starts on its own, its pill follows ═══
    await beat('p2', 'Ninja pill follows its bundle');
    fact('pills.before', JSON.stringify(await pills()));
    await closeConsole(); await hclick('#idmp-pill-trigger'); await pace(1200); await glide('#pill-ninja'); await pace(1800);
    fact('pills.tray', JSON.stringify(await pills()));
    await openConsole(); const n2 = PAGELOG.length; await hclick('[data-oc-stop="' + NX + '"]'); await pace(1500);
    fact('ninja.stopped', JSON.stringify((await rowsOf()).find(r => /Excel/i.test(r.name))) + ' | ' + (PAGELOG.slice(n2).filter(l => /§PILL-CONTRIB remove/.test(l)).pop() || ''));
    await closeConsole(); await pace(1800); fact('pills.afterStop', JSON.stringify(await pills()));
    await openConsole(); const n3 = PAGELOG.length; await hclick('[data-oc-start="' + NX + '"]'); await pace(1500);
    fact('ninja.started', JSON.stringify((await rowsOf()).find(r => /Excel/i.test(r.name))) + ' | ' + (PAGELOG.slice(n3).filter(l => /§PILL-CONTRIB add/.test(l)).pop() || ''));
    await closeConsole(); await pace(1500); fact('pills.afterStart', JSON.stringify(await pills())); await glide('#pill-ninja'); await pace(1500); await hclick('#idmp-pill-trigger'); await pace(700);

    await card('A sales order, start to finish', 'Standard Order, one line. The plugin adds the buttons on the order itself.'); await pace(600);
    await menuBehind(await menuIdOf(143)); await page.waitForSelector(NEWB, { timeout: 20000 }); await hold(1200);

    // ═══ P4 the order: header, then Add Order Line (Save + line tab + New in ONE click), line, Save & back ═══
    await beat('p4', 'order header + Add Order Line'); await uncard(); await pace(800);
    await hclick(NEWB); await page.waitForSelector('#idmp-inline-mount .cfrow', { timeout: 10000 }); await pace(900);
    await hselect(F('c_doctypetarget_id', 'select'), (await optBy('c_doctypetarget_id', /^Standard Order/)).v);
    await hselect(F('c_bpartner_id', 'select'), (await optBy('c_bpartner_id', /Joe Block/)).v);
    await hselect(F('ad_org_id', 'select'), (await optBy('ad_org_id', /^HQ/)).v); await pace(700);
    fact('lens.barHeader', JSON.stringify(await lensBar()));
    await hclick('[data-lens-action^="' + EN + ':add:"]'); await page.waitForSelector(F('m_product_id', 'select'), { timeout: 15000 }); await pace(1200);
    await hselect(F('m_product_id', 'select'), (await optBy('m_product_id', /Mulch/)).v); await pace(600);
    await htype(F('qtyentered'), '1'); await page.locator(F('qtyentered')).first().blur().catch(() => {}); await pace(700);
    fact('lens.barLine', JSON.stringify(await lensBar()));
    await hclick('[data-lens-action^="' + EN + ':back:"]'); await page.waitForSelector('[data-doc-action="CO"]', { timeout: 20000 }); await pace(1200);
    const nC = PAGELOG.length; await hclick('[data-doc-action="CO"]');
    for (let i = 0; i < 60 && !(await page.locator('[data-lens-action="' + EN + ':next:ship"]').count()); i++) await page.waitForTimeout(250);
    await hold(DRY ? 600 : 1500);
    fact('order.complete', lastLog(nC, /§MODEL-DOCACTION table=c_order/)); fact('lens.barOnOrder', JSON.stringify(await lensBar()));

    // ═══ P5 the next steps, from the order: Ship, then Invoice ═══
    await beat('p5', 'Ship, Invoice');
    for (const [act, pid] of [['ship', 118], ['invoice', 119]]) {
      const nn = PAGELOG.length; await hclick('[data-lens-action="' + EN + ':next:' + act + '"]');
      await page.waitForSelector('#idmp-procdlg [data-procdlg-ok]', { timeout: 30000 }); await pace(2200);
      fact('next.' + act, lastLog(nn, new RegExp('§AD-PROC-LIVE proc=' + pid + ' .*dispatched=')) + ' | ' + lastLog(nn, new RegExp('§PROC-COMMIT proc=' + pid)));
      await hclick('#idmp-procdlg [data-procdlg-ok]'); await pace(1500);
    }
    fact('order.docs', JSON.stringify({ shipment: await tip('SELECT docstatus AS s, documentno AS d FROM m_inout WHERE m_inout_id<0'), invoice: await tip('SELECT docstatus AS s, documentno AS d, grandtotal AS g FROM c_invoice WHERE c_invoice_id<0') }));
    fact('lens.barAfter', JSON.stringify(await lensBar()));

    // ═══ P6 what is linked to the order, with counts ═══
    await beat('p6', 'related counts');
    const relSel = '[data-lens-action^="' + EN + ':rel:"]:has-text("Shipment")';
    await glide(relSel); await pace(1500);
    await hclick(relSel); await pace(2000);
    if (!(await page.locator('.idmp-grid tbody tr').count())) { await hclick('#idmp-toolbar [data-tb="toggle"]'); await pace(700); }
    fact('related.grid', (await page.locator('.idmp-grid tbody tr').count()) + ' rows | ' + lastLog(0, /§ZOOM-ACROSS-OPEN/)); await pace(1500);

    // ═══ P7 card: counted steps and what the witnesses checked (numbers read from their logs) ═══
    await beat('p7', 'card: counted');
    const L1 = readOr2(FOA1), L2 = readOr2(FOA2), g = (o) => o && o.g ? (typeof o.g === 'number' ? o.g : (o.g.click + o.g.select + o.g.type)) : null;
    const m1 = /§FOA1 off=(\{.*?\}) on=(\{.*?\})\s*$/m.exec(L1) || [], m2 = /§FOA2 off=(\{.*?\}) on=(\{.*?\})\s*$/m.exec(L2) || [];
    const j = (x) => { try { return JSON.parse(x); } catch (e) { return null; } };
    const a1 = [g(j(m1[1])), g(j(m1[2]))], a2 = [g(j(m2[1])), g(j(m2[2]))], ev1 = (j(m1[1]) || {}).ev, ev2 = (j(m2[1]) || {}).ev;
    const v1 = (/§FOA1_VERDICT (\S+)/.exec(L1) || [])[1], v2 = (/§FOA2_VERDICT (\S+)/.exec(L2) || [])[1];
    fact('card.numbers', JSON.stringify({ orderEntry: a1, shipInvoice: a2, events: [ev1, ev2], verdicts: [v1, v2] }));
    const tot = [a1[0] + a2[0], a1[1] + a2[1]], okAll = v1 === 'GREEN' && v2 === 'GREEN' && !isNaN(tot[0]);
    await card('Counted, not guessed', 'A standard order entered, completed, shipped and invoiced. A step is a click, a pick from a list or a typed field.', ['Plain', 'With the plugin'],
      [{ label: 'Enter and complete the order', cells: [{ v: a1[0] }, { v: a1[1] }] }, { label: 'Ship and invoice it', cells: [{ v: a2[0] }, { v: a2[1] }] },
       { label: 'Total steps', cells: [{ v: tot[0] }, { v: tot[1] }] },
       { label: 'Model events, same order', cells: [{ v: ev1 + ' / ' + ev2, small: true, tone: '#c9d4e0' }, { v: okAll ? 'equal' : 'NOT VERIFIED', small: true, tone: okAll ? '#7ee0a0' : '#ff9b8a' }] },
       { label: 'Shipment, invoice, quantities', cells: [{ v: '', small: true }, { v: okAll ? 'identical rows' : 'NOT VERIFIED', small: true, tone: okAll ? '#7ee0a0' : '#ff9b8a' }] }]);
    await hold(DRY ? 200 : 6000);

    // ═══ P8 stop the plugin: the same order, the plain toolbar ═══
    await beat('p8', 'stop the plugin');
    await openConsole(); await uncard(); await pace(1000);
    await hclick('#pr-osgi [data-oc-stop="' + FID + '"]'); await pace(1500);
    fact('lens.afterStop', JSON.stringify({ lenses: await page.evaluate(() => window.AdLens.count()), row: (await rowsOf()).find(r => /Friendly/i.test(r.name)) }));
    await closeConsole(); await pace(1500);
    fact('plain.toolbar', JSON.stringify({ lensBar: await page.locator('#idmp-lensbar').count() }));
    await beat('end', 'end'); await hold(DRY ? 200 : 1500);
    gestFlush(); GPrevId = null;
    say('§ERP_FILM_CURSOR clicks=' + clicks + ' cursorOnTarget=' + cursorOk + (clicks === cursorOk ? ' OK' : ' WRONG'));
  } catch (e) { say('§ERP_FILM_ERROR ' + String(e.stack || e.message).split('\n').slice(0, 3).join(' | ')); }
  if (cdp) await cdp.send('Page.stopScreencast').catch(() => {}); await page.waitForTimeout(300).catch(() => {});
  fs.writeFileSync(path.join(OUT, 'erp_film.page.log'), PAGELOG.join('\n') + '\n');
  const errs = PAGELOG.filter(l => /^PAGEERR/.test(l)); say('§ERP_FILM_PAGEERRORS ' + errs.length + ' ' + errs.slice(0, 2).join(' | '));
  if (!DRY && frames.length) {
    const endTs = Date.now() / 1000, lines = [];
    frames.forEach((f, i) => { const d = (i + 1 < frames.length ? frames[i + 1].ts : endTs) - f.ts; lines.push(`file '${f.fn}'`, `duration ${Math.max(d, 0.001).toFixed(4)}`); }); lines.push(`file '${frames[frames.length - 1].fn}'`);
    fs.writeFileSync(path.join(OUT, 'frames.txt'), lines.join('\n') + '\n'); const mp4 = path.join(OUT, 'erp_part4_raw.mp4');
    try { execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(OUT, 'frames.txt'), '-vf', 'fps=24,scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-crf', '17', '-preset', 'medium', mp4]); say('§ERP_FILM_DONE frames=' + frames.length + ' dur=' + (endTs - T0).toFixed(2) + ' out=' + mp4); } catch (e) { say('§ERP_FILM_ERROR ffmpeg ' + String(e.message).split('\n')[0]); }
  }
  fs.writeFileSync(path.join(OUT, 'erp_film.log'), LOG.join('\n') + '\n'); await browser.close(); server.close();
})();
