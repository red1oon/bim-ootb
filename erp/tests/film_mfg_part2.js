// ⚠ DO NOT REMOVE — Manufacturing film PART II: the friendly-ops lens (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §15-§16). RAW take (no narration, no cards; those are added in POST).
// ONE take, CPU only, English UI, real mouse/keyboard on the real page. Every fact is a §ERP_FILM_FACT read from the live in-browser DB/DOM. READ <out>/erp_film.log and <out>/erp_film.page.log before any conclusion; exit code is not evidence.
// The claims the film SHOWS are proven by W-FRIENDLY-OPS (erp/tests/witness_friendly_ops.js): same events, same books, preview == save, counts == tip.
// Run: [DRY=1] [REPO=<worktree root>] [BEAT_MIN='{"q0":14.0,...}'] [FOPS_LOG=<witness log>] [ODOO_LOG=<odoo recorder log>] [LENS_SPEC=<ERP_FRIENDLY_OPS_LENS.md>] node erp/tests/film_mfg_part2.js <outDir>
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
  const FOPS_LOG = process.env.FOPS_LOG || path.join(HOMEDIR, 'bim-compiler/build/erp/logs_odoo_observe/witness_friendly_ops_run8.log');
  const ODOO_LOG = process.env.ODOO_LOG || path.join(HOMEDIR, 'bim-compiler/build/erp/logs_odoo_observe/mo_produceall_woodpanel_2026-10-15.log');
  const LENS_SPEC = process.env.LENS_SPEC || path.join(HOMEDIR, 'bim-compiler/prompts/ERP_FRIENDLY_OPS_LENS.md');
  const readOr = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return ''; } };
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
  fact('prerequisite.offCamera', 'Libero started, standard costing cats=' + JSON.stringify(fx) + ' KG=2.5 BAG=0.4 on-hand KG=10000 BAG=500');
  // a card covers the page; navigation behind it uses plain in-page clicks (no cursor, no gesture count)
  const card = async (title, sub, heads, rows) => { await page.evaluate(({ title, sub, heads, rows }) => {
      const old = document.getElementById('__card'); const d = document.createElement('div'); d.id = '__card';
      d.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#10151c;color:#e8edf3;font-family:DejaVu Sans,Arial,sans-serif;display:flex;flex-direction:column;justify-content:center;padding:0 90px';
      const tone = ['#7fd1ff', '#ff9b8a', '#7ee0a0'];
      const tbl = rows && rows.length ? '<table style="border-collapse:collapse;width:100%;margin-top:26px">' + (heads ? '<tr style="font-size:20px;color:#8fa0b3"><td></td>' + heads.map(h => '<td style="text-align:center;padding:6px 22px">' + h + '</td>').join('') + '</tr>' : '') +
        rows.map(r => '<tr style="border-top:1px solid #243040"><td style="padding:14px 22px;font-size:25px;color:#c9d4e0;width:36%">' + r.label + '</td>' + r.cells.map((c, i) => '<td style="padding:14px 22px;text-align:center;font-size:' + (c.small ? 24 : 44) + 'px;font-weight:700;color:' + (c.tone || tone[i % 3]) + '">' + c.v + (c.rec ? '<div style="font-size:15px;font-weight:400;color:#8fa0b3;margin-top:4px">recorded · ' + c.rec + '</div>' : '') + '</td>').join('') + '</tr>').join('') + '</table>' : '';
      d.innerHTML = '<div style="font-size:21px;letter-spacing:.14em;color:#8fa0b3;text-transform:uppercase">Manufacturing · Part II · Friendly operations</div><div style="font-size:52px;font-weight:700;margin:8px 0 6px">' + title + '</div><div style="font-size:25px;color:#b8c4d2;max-width:1500px">' + sub + '</div>' + tbl;
      document.body.appendChild(d); if (old) old.remove(); }, { title, sub, heads: heads || null, rows: rows || [] }); };
  const ipc = (sel) => page.locator(sel).first().evaluate(e => e.click());   // in-page click: works under the card, no cursor, not a counted gesture
  const uncard = () => page.evaluate(() => { const d = document.getElementById('__card'); if (d) d.remove(); });
  await card('Fewer steps, the same books', 'An optional lens on the SQLite twin. Switched off, every screen stays as in iDempiere. Switched on, the same work takes fewer steps and leaves the same documents and postings.');
  await cast(); await page.mouse.move(720, 500);
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
  async function preview(tag) {
    const n = PAGELOG.length; await hclick('[data-lens-action="friendly-ops:preview"]'); await page.waitForSelector('[data-save-preview]', { timeout: 10000 }); await pace(DRY ? 300 : 900);
    fact(tag + '.panel', (await page.$eval('[data-save-preview]', b => b.getAttribute('data-save-preview') + ' | ' + b.textContent.replace(/\s+/g, ' ').replace(/Close$/, ''))).slice(0, 400));
    fact(tag + '.log', PAGELOG.slice(n).filter(l => /§SAVE-PREVIEW/.test(l)).pop() || 'NO §SAVE-PREVIEW');
    fact(tag + '.nothingWritten', 'pp_order=' + (await tip('SELECT COUNT(*) AS n FROM pp_order'))[0].n);
  }
  const closePreview = async () => { await holdFor(); await hclick('[data-preview-close]'); await pace(700); };
  try {
    // ═══ Q0 title card (login screen behind it) ═══
    await beat('q0', 'title card');
    await ipc('#idmp-release-link'); await page.waitForSelector('#pr-osgi table.oc-t', { timeout: 10000 });   // the Plugins panel opens BEHIND the card
    if (!(await page.locator('#pr-osgi [data-oc-url]:visible').count())) await ipc('#pr-osgi [data-oc-installtoggle]');
    await page.waitForSelector('#pr-osgi [data-oc-url]'); await hold(DRY ? 200 : 2500);

    // ═══ Q1 install the lens like any other plugin ═══
    await beat('q1', 'install the lens'); await uncard(); await pace(1200);
    const n1 = PAGELOG.length; await htype('#pr-osgi [data-oc-url]', 'plugins/friendly_ops.mjs'); await hclick('#pr-osgi [data-oc-doinstall]'); await hold(DRY ? 1500 : 2500);
    fact('lens.installed', JSON.stringify((await rowsOf()).find(r => /Friendly/i.test(r.name))) + ' | ' + (PAGELOG.slice(n1).filter(l => /§PLUGIN-START/.test(l)).pop() || ''));
    await hclick('#pr-osgi a.oc-nm:text-matches("Friendly", "i")').catch(() => {}); await pace(2000);
    fact('lens.detail', (await page.evaluate(() => (document.querySelector('#pr-osgi tr.oc-d') || {}).textContent || '')).replace(/\s+/g, ' ').slice(0, 300));

    // ═══ Q1b card: the counted gestures; behind it: close the panel, log in, open the Manufacturing Order window, New ═══
    await beat('q1b', 'card: counted gestures');
    const odoo = (/§ODOO_GESTURES total=(\d+)/.exec(readOr(ODOO_LOG)) || [])[1] || '?', odooOk = /§ODOO_VERDICT PASS/.test(readOr(ODOO_LOG));
    const spec = readOr(LENS_SPEC), plainN = (/plain (\d+) \(menu 4/.exec(spec) || [])[1] || '?', lensN = (/lens \*\*(\d+)\*\* \(4 \+ 11/.exec(spec) || [])[1] || '?';
    fact('card.gestures', 'odoo=' + odoo + ' verdict=' + (odooOk ? 'PASS' : 'NOT PASS') + ' twinPlain=' + plainN + ' twinLens=' + lensN);
    await card('Counted, not guessed', 'One manufacturing order, from an empty form to finished goods received. A gesture is a click, a pick from a list or a typed field.', ['Odoo 17', 'Twin, plain', 'Twin + lens'],
      [{ label: 'Gestures', cells: [{ v: odoo, rec: 'Odoo recorder log' }, { v: plainN, rec: 'witness + film tally' }, { v: lensN, rec: 'witness + film tally' }] },
       { label: 'Where the rest is', cells: [{ v: '', small: true }, { v: 'the order header: 11 gestures, legacy defaults', small: true, tone: '#c9d4e0' }, { v: '', small: true }] }]);
    await ipc('#pr-root [data-pr-close]'); await hold(400);
    await ipc("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await page.waitForSelector('#idmp-login-step1:visible');
    await ipc("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await page.waitForSelector('#idmp-login-step2:visible');
    await ipc('#idmp-login-ok'); await page.waitForSelector('#idmp-home', { timeout: 20000 }).catch(() => {}); await hold(1500);
    await menuBehind(53055); await page.waitForSelector(NEWB, { timeout: 20000 }); await hold(1200);
    await ipc(NEWB); await page.waitForSelector('#idmp-inline-mount .cfrow', { timeout: 10000 }); await hold(1200);
    fact('lens.barWhileEditing', JSON.stringify(await lensBar()));

    // ═══ Q2 a new order, typed on camera; Preview shows what Save will write ═══
    await beat('q2', 'new order, then Preview'); await uncard(); await pace(800);
    await hselect(F('c_doctypetarget_id', 'select'), (await optBy('c_doctypetarget_id', /^Manufacturing Order/)).v);
    await hselect(F('ad_org_id', 'select'), (await optBy('ad_org_id', /^Fertilizer \(/)).v);
    await hselect(F('m_warehouse_id', 'select'), (await optBy('m_warehouse_id', /^Fertilizer \(/)).v);
    await hselect(F('s_resource_id', 'select'), (await optBy('s_resource_id', /Fertilizer Plant/)).v);
    await hselect(F('m_product_id', 'select'), (await optBy('m_product_id', /Fertilizer #70/)).v); await pace(700);
    await hselect(F('priorityrule', 'select'), (await optBy('priorityrule', /Medium/)).v); await htype(F('qtyentered'), '100');
    await page.fill(F('datestartschedule'), '2008-08-16'); await page.fill(F('datepromised'), '2008-08-17'); await page.fill(F('datefinishschedule'), '2008-08-17'); GT.type += 3; await pace(500);
    await preview('preview.ok');
    await closePreview();

    // ═══ Q3 the same Preview catches what Save would refuse ═══
    await beat('q3', 'Preview catches a refusal');
    await hdate(F('datestartschedule'), '2007-01-01'); await pace(400);
    await preview('preview.refused');
    await closePreview();
    await hdate(F('datestartschedule'), '2008-08-16'); await pace(500);

    // ═══ Q4 Save & Complete ═══
    await beat('q4', 'Save & Complete');
    const nSC = PAGELOG.length; await hclick('[data-lens-action="friendly-ops:save-complete"]');
    let o = null; for (let i = 0; i < 60; i++) { o = (await tip('SELECT pp_order_id AS id, documentno, qtyordered, docstatus FROM pp_order WHERE pp_order_id<0 ORDER BY pp_order_id ASC LIMIT 1'))[0]; if (o && o.docstatus === 'CO') break; await page.waitForTimeout(200); }
    await hold(DRY ? 600 : 1500);
    fact('lens.saveComplete', JSON.stringify(o) + ' | ' + (PAGELOG.slice(nSC).filter(l => /§OPS-LENS docAction/.test(l)).pop() || ''));
    fact('lens.children', JSON.stringify({ bomLines: (await tip('SELECT COUNT(*) AS n FROM pp_order_bomline WHERE pp_order_id=' + o.id))[0].n, mrp: (await tip('SELECT COUNT(*) AS n FROM pp_mrp WHERE pp_order_id=' + o.id))[0].n }));
    fact('lens.barOnOrder', JSON.stringify(await lensBar()));

    // ═══ Q5 the order opens its own Receipt & Issue ═══
    await beat('q5', 'Receipt & Issue from the order');
    await hclick('[data-lens-action^="friendly-ops:form:"]'); await page.waitForSelector('[data-gform]', { timeout: 20000 }); await pace(2000);
    fact('form.preset', await page.$eval('[data-gform-param=PP_Order_ID]', e => (e.options[e.selectedIndex] || {}).textContent));
    const nP = PAGELOG.length; await hclick('[data-gform-run]');
    for (let i = 0; i < 80 && !(await page.$eval('[data-gform-msg]', e => e.textContent).catch(() => '')); i++) await page.waitForTimeout(250);
    await hold(DRY ? 1500 : 2500);
    fact('form.commit', PAGELOG.slice(nP).filter(l => /§AD-FORM-GENERIC commit/.test(l)).pop() || ''); fact('form.message', await page.$eval('[data-gform-msg]', e => e.textContent).catch(() => ''));
    await holdFor(); prevB = null;
    // behind a short card: back to the order (no visible navigation)
    await card('Back on the order', 'Order ' + o.documentno + ', after its Receipt & Issue.');
    await menuBehind(53055); await page.waitForSelector(NEWB, { timeout: 20000 }); await hold(1000);
    if (!(await page.locator('.idmp-grid tbody tr').count())) { await ipc('#idmp-toolbar [data-tb="toggle"]'); await hold(700); }
    const rowSel = '.idmp-grid tbody tr:has(td:text-is("' + o.documentno + '"))';
    if (await page.locator(rowSel).count()) { await ipc(rowSel); await hold(1000); }
    await hold(DRY ? 200 : 1600);

    // ═══ Q6 what is linked to the order, with counts ═══
    await beat('q6', 'related counts: Cost Collector (3)'); await uncard(); await pace(1200);
    fact('lens.related', JSON.stringify(await lensBar()) + ' tipCollectors=' + (await tip('SELECT COUNT(*) AS n FROM pp_cost_collector WHERE pp_order_id=' + o.id))[0].n);
    await glide('[data-lens-action^="friendly-ops:rel:"]'); await pace(1500);
    await hclick('[data-lens-action^="friendly-ops:rel:"]'); await pace(1800);
    if (!(await page.locator('.idmp-grid tbody tr').count())) { await hclick('#idmp-toolbar [data-tb="toggle"]'); await pace(700); }
    fact('collectors.grid', (await page.locator('.idmp-grid tbody tr').count()) + ' rows | ' + (PAGELOG.filter(l => /§ZOOM-ACROSS-OPEN/.test(l)).pop() || ''));

    // ═══ Q7 card: what the witness checked (read from its log) ═══
    await beat('q7', 'card: same steps underneath');
    const W = readOr(FOPS_LOG), wl = (id) => (W.split('\n').find(l => l.startsWith('§FOPS ' + id + ' ')) || '');
    const ok = (id) => /^§FOPS \S+ PASS/.test(wl(id)), num = (id, re) => (re.exec(wl(id)) || [])[1] || '?';
    const verdict = (/§FOPS_VERDICT (\S+) judged=(\d+) failed=(\d+)/.exec(W) || []);
    fact('card.witness', 'verdict=' + verdict.slice(1).join('/') + ' F2=' + ok('F2') + ' F3=' + ok('F3') + ' F6=' + ok('F6') + ' F7=' + ok('F7') + ' F9=' + ok('F9'));
    await card('Same steps underneath', 'A witness ran every lens action beside the plain one and compared what the model did. ' + (verdict[1] || '?') + ': ' + (verdict[2] || '?') + ' checks, ' + (verdict[3] || '?') + ' failed.', ['Plain', 'Lens', ''],
      [{ label: 'Save, then Complete: model events', cells: [{ v: num('F2', /same (\d+) model/) }, { v: num('F2', /same (\d+) model/) }, { v: ok('F2') ? 'same order' : 'DIFFERENT', small: true, tone: ok('F2') ? '#7ee0a0' : '#ff9b8a' }] },
       { label: 'Receipt & Issue: model events', cells: [{ v: num('F3', /same (\d+) events/) }, { v: num('F3', /same (\d+) events/) }, { v: ok('F3') ? 'same order' : 'DIFFERENT', small: true, tone: ok('F3') ? '#7ee0a0' : '#ff9b8a' }] },
       { label: 'Preview rows vs rows Save wrote', cells: [{ v: num('F6', /the (\d+) rows/) }, { v: num('F6', /the (\d+) rows/) }, { v: ok('F6') ? 'equal' : 'DIFFERENT', small: true, tone: ok('F6') ? '#7ee0a0' : '#ff9b8a' }] },
       { label: 'Rows the Preview wrote', cells: [{ v: ok('F7') ? '0' : '?' }, { v: '', small: true }, { v: ok('F7') && ok('F9') ? 'refusal text = Save\'s' : '', small: true, tone: '#7ee0a0' }] }]);

    // ═══ Q8 stop the lens: the same order, the plain toolbar ═══
    await beat('q8', 'stop the lens');
    await page.evaluate(() => window.PluginRelease.open()); await page.waitForSelector('#pr-osgi table.oc-t', { timeout: 10000 }); await hold(800);
    await uncard(); await pace(1000);
    await hclick('#pr-osgi [data-oc-stop="org.kernel.friendly-ops"]'); await pace(1500);
    fact('lens.afterStop', JSON.stringify({ lenses: await page.evaluate(() => window.AdLens.count()), row: (await rowsOf()).find(r => /Friendly/i.test(r.name)) }));
    await hclick('#pr-root [data-pr-close]'); await pace(500);
    await openMenuById(53055); await page.waitForSelector(NEWB, { timeout: 20000 }); await pace(1000);
    if (await page.locator(rowSel).count()) { await hclick(rowSel); await pace(800); }
    fact('plain.toolbar', JSON.stringify({ lensBar: await page.locator('#idmp-lensbar').count(), order: (await tip('SELECT documentno, docstatus FROM pp_order WHERE pp_order_id=' + o.id))[0] }));
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
    fs.writeFileSync(path.join(OUT, 'frames.txt'), lines.join('\n') + '\n'); const mp4 = path.join(OUT, 'mfg_part2_raw.mp4');
    try { execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(OUT, 'frames.txt'), '-vf', 'fps=24,scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-crf', '17', '-preset', 'medium', mp4]); say('§ERP_FILM_DONE frames=' + frames.length + ' dur=' + (endTs - T0).toFixed(2) + ' out=' + mp4); } catch (e) { say('§ERP_FILM_ERROR ffmpeg ' + String(e.message).split('\n')[0]); }
  }
  fs.writeFileSync(path.join(OUT, 'erp_film.log'), LOG.join('\n') + '\n'); await browser.close(); server.close();
})();
