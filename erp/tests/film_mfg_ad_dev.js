// ⚠ DO NOT REMOVE — Manufacturing film, DEVELOPER cut: a plugin's dictionary as 2Packs (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §22-§23). RAW take, English; cards in the take, narration in post.
// Compact redo of Part III for developers: Start packs Libero's 2Packs in (Incremental2PackActivator), Packages Installed lists them, the packed rows (process, access by
//   MProcess.afterSave), a second session REPLAYS them, the order's button, Stop keeps the rows. Every number is a §ERP_FILM_FACT read live or "recorded" from W-PLUGIN-PACKS.
// Page A = System (fresh profile, Libero installed NOT started), page B = GardenAdmin (prepared after A's Start: its load replays the kept packs).
// Run: [DRY=1] [BEAT_MIN='{"d0":..}'] [WPP_LOG=<W-PLUGIN-PACKS log>] [LIBERO_SRC=<org.idempiere.mfg checkout>] node erp/tests/film_mfg_ad_dev.js <outDir>
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
  let page = await ctx.newPage(); const pA = page, pB = await ctx.newPage();
  for (const p of [pA, pB]) { p.on('console', m => PAGELOG.push(m.text())); p.on('pageerror', e => PAGELOG.push('PAGEERR ' + e)); p.on('dialog', async d => { PAGELOG.push('DIALOG ' + d.message()); await d.accept(); }); }
  const fact = (k, v) => say('§ERP_FILM_FACT ' + k + '=' + String(v).replace(/\s+/g, ' ').slice(0, 400));
  const lastLog = (n, re) => PAGELOG.slice(n).filter(l => re.test(l)).pop() || '';
  const sql = async (s) => { const r = await page.evaluate(q => { try { const r = window.__idmpDb.exec(q); return r.length ? r[0].values : []; } catch (e) { return 'ERR ' + e.message; } }, s); return r; };
  const hold = (ms) => page.waitForTimeout(ms);

  // ── screencast (skipped in DRY) ──
  const frames = []; let T0 = null, cdp = null;
  async function cast() {   // casts the CURRENT page; switching pages stops the previous screencast (frames from it are ignored)
    if (DRY) return; if (cdp) await cdp.send('Page.stopScreencast').catch(() => {}); await page.bringToFront(); cdp = await ctx.newCDPSession(page); const me = cdp;
    const castStart = Date.now() / 1000;   // the first frame carries the time of the page's LAST paint (before the cast): clamp, or the film opens with seconds that never happened
    me.on('Page.screencastFrame', async f => { if (me !== cdp) return; const fn = path.join(FR, String(frames.length).padStart(6, '0') + '.jpg'); fs.writeFileSync(fn, Buffer.from(f.data, 'base64')); const ts = Math.max(f.metadata.timestamp, castStart, frames.length ? frames[frames.length - 1].ts : 0); frames.push({ fn, ts }); if (T0 === null) T0 = ts; me.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
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

  const HOMEDIR = require('os').homedir();
  const TBB_LOG = process.env.TBB_LOG || path.join(HOMEDIR, 'bim-compiler/build/erp/logs_odoo_observe/witness_ad_tbb_run3.log');
  const LIBERO_SRC = process.env.LIBERO_SRC || '/tmp/claude-1000/-home-red1-bim-compiler/2291d82e-3bc8-4990-a422-13666a460d9e/scratchpad/libero_repo';
  const readOr = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return ''; } };
  const card = async (title, sub, heads, rows) => { await page.evaluate(({ title, sub, heads, rows }) => {
      const old = document.getElementById('__card'); const d = document.createElement('div'); d.id = '__card';
      d.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#10151c;color:#e8edf3;font-family:DejaVu Sans,Arial,sans-serif;display:flex;flex-direction:column;justify-content:center;padding:0 90px';
      const tone = ['#7fd1ff', '#ff9b8a', '#7ee0a0'];
      const tbl = rows && rows.length ? '<table style="border-collapse:collapse;width:100%;margin-top:26px">' + (heads ? '<tr style="font-size:20px;color:#8fa0b3"><td></td>' + heads.map(h => '<td style="text-align:center;padding:6px 22px">' + h + '</td>').join('') + '</tr>' : '') +
        rows.map(r => '<tr style="border-top:1px solid #243040"><td style="padding:14px 22px;font-size:25px;color:#c9d4e0;width:36%">' + r.label + '</td>' + r.cells.map((c, i) => '<td style="padding:14px 22px;text-align:center;font-size:' + (c.small ? 24 : 44) + 'px;font-weight:700;color:' + (c.tone || tone[i % 3]) + '">' + c.v + (c.rec ? '<div style="font-size:15px;font-weight:400;color:#8fa0b3;margin-top:4px">recorded · ' + c.rec + '</div>' : '') + '</td>').join('') + '</tr>').join('') + '</table>' : '';
      d.innerHTML = '<div style="font-size:21px;letter-spacing:.14em;color:#8fa0b3;text-transform:uppercase">Manufacturing · for developers · a plugin\'s dictionary</div><div style="font-size:52px;font-weight:700;margin:8px 0 6px">' + title + '</div><div style="font-size:25px;color:#b8c4d2;max-width:1500px">' + sub + '</div>' + tbl;
      document.body.appendChild(d); if (old) old.remove(); }, { title, sub, heads: heads || null, rows: rows || [] }); };
  const ipc = (sel) => page.locator(sel).first().evaluate(e => e.click());   // in-page click: works under the card, no cursor, not a counted gesture
  const uncard = () => page.evaluate(() => { const d = document.getElementById('__card'); if (d) d.remove(); });
  const tip = (q) => page.evaluate(x => window.__crud.withModelTrx(f => f(x)), q);
  const NEWB = '#idmp-toolbar [data-tb="new"]';
  const rowsOf = () => page.evaluate(() => [...document.querySelectorAll('#pr-osgi table.oc-t > tbody > tr:not(.oc-d)')].map(tr => ({ id: tr.cells[0].textContent.trim(), name: tr.cells[1].textContent.trim(), status: tr.cells[3].textContent.trim() })));
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
  // a page: fresh, Libero installed + started + ACTIVATED (its form/model registrations), Part I's off-camera prerequisite, logged in plainly (behind a card or before the cast)
  async function prepare(p, client, user) {
    page = p; await page.bringToFront();   // a background tab is not painted: prepared in front, so its frames are current when the cast starts
    await page.goto(base + '/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__idmpDb && !!window.PluginEngine && document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0, null, { timeout: 30000 });
    await page.evaluate(async (u) => { const r = window.PluginEngine._reg(); if (!r.get('org.idempiere.mfg')) await r.installBundle(u); await r.startBundle('org.idempiere.mfg').catch(() => {}); }, base + '/plugins/libero_manufacturing.mjs');
    await page.evaluate(() => { const db = window.__idmpDb, run = (s) => db.run(s);
      const cats = db.exec('SELECT DISTINCT m_product_category_id FROM m_product WHERE m_product_id IN (50007,50008,50014)')[0].values.map(r => r[0]);
      cats.forEach(c => run("UPDATE m_product_category_acct SET costingmethod='S' WHERE m_product_category_id=" + c));
      run('DELETE FROM m_storageonhand WHERE m_product_id IN (50007,50008,50014)');
      run("INSERT INTO m_storageonhand (ad_client_id, ad_org_id, isactive, m_locator_id, m_product_id, m_attributesetinstance_id, qtyonhand, datematerialpolicy, m_storageonhand_uu) VALUES (11,50006,'Y',50001,50008,0,10000,'2026-01-01 00:00:00','film-kg'),(11,50006,'Y',50001,50014,0,500,'2026-01-01 00:00:00','film-bag')"); });
    await ipc("#idmp-login-clients .idmp-login-user:has(.nm:text-is('" + client + "'))"); await page.waitForSelector('#idmp-login-step1:visible');
    await ipc("#idmp-login-users .idmp-login-user:has(.nm:text-is('" + user + "'))"); await page.waitForSelector('#idmp-login-step2:visible');
    await ipc('#idmp-login-ok'); await page.waitForFunction(() => document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0, null, { timeout: 20000 }); await hold(1200);
    await page.evaluate(async () => { if (window.PluginEngine.need) await window.PluginEngine.need({ table: 'pp_order' }); });   // the lazy bundle activates (legacy: its services come up)
    await hold(DRY ? 300 : 3000); await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));   // settle: the Home and the activation finish painting before anything is cast
    fact('page.' + user, 'role=' + await page.evaluate(() => window.APP && window.APP.roleId) + ' libero=' + await page.evaluate(() => { const x = window.PluginEngine._reg().get('org.idempiere.mfg'); return x ? x.state : 'absent'; }));
  }
  async function findByName(text) {   // the iDempiere way to land on a record: Find (Simple) on Name
    await hclick('#idmp-toolbar [data-tb="find"]'); await page.waitForSelector('#idmp-find-ov'); await pace(700);
    await htype('[data-find-panel="simple"] [data-find-s="Name"]', text); await pace(500);
    await hclick('[data-find-ok]'); await pace(1500);
    if (!(await page.locator('#idmp-inline-mount').count()) && (await page.locator('.idmp-grid tbody tr').count()) >= 1) { await hclick('.idmp-grid tbody tr'); await pace(500); await hclick('#idmp-toolbar [data-tb="toggle"]'); await pace(1200); }
  }
  const fieldVal = (col) => page.evaluate(c => { const e = [...document.querySelectorAll('#idmp-inline-mount [data-col]')].find(x => x.getAttribute('data-col').toLowerCase() === c.toLowerCase()); if (!e) { const f = [...document.querySelectorAll('.idmp-fld')].find(x => (x.getAttribute('data-ad-column') || '').toLowerCase() === c.toLowerCase()); return f ? f.textContent.replace(/\s+/g, ' ').trim() : null; } return e.tagName === 'SELECT' ? (e.options[e.selectedIndex] || {}).textContent : e.value; }, col);


  const WPP_LOG = process.env.WPP_LOG || path.join(HOMEDIR, 'bim-compiler/build/erp/logs_odoo_observe/witness_plugin_packs_run3.log');
  const zoomOrder = async () => { await page.evaluate(() => window.IdmpHost.zoom(53009, null, 50000)); await page.waitForSelector(NEWB, { timeout: 20000 }); await hold(1500); };
  async function prepareA() {   // System, Libero installed only: the Start is the first scene
    page = pA; await page.bringToFront();
    await page.goto(base + '/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__idmpDb && !!window.PluginEngine && document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0, null, { timeout: 30000 });
    await page.evaluate(async (u) => { const r = window.PluginEngine._reg(); if (!r.get('org.idempiere.mfg')) await r.installBundle(u); await window.PluginEngine.persist(); }, base + '/plugins/libero_manufacturing.mjs');
    await ipc("#idmp-login-clients .idmp-login-user:has(.nm:text-is('System'))"); await page.waitForSelector('#idmp-login-step1:visible');
    await ipc("#idmp-login-users .idmp-login-user:has(.nm:text-is('System'))"); await page.waitForSelector('#idmp-login-step2:visible');
    await ipc('#idmp-login-ok'); await page.waitForFunction(() => document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0, null, { timeout: 20000 }); await hold(1200);
    fact('pageA.before', JSON.stringify({ libero: await page.evaluate(() => window.PluginEngine._reg().get('org.idempiere.mfg').state), packages: await sql("SELECT COUNT(*) FROM ad_package_imp WHERE name='org.idempiere.mfg'"), formClass: await sql('SELECT classname FROM ad_form WHERE ad_form_id=53007') }));
  }
  const menuOf = (w) => page.evaluate(w => { const r = window.__idmpDb.exec("SELECT AD_Menu_ID FROM AD_Menu WHERE Action='W' AND AD_Window_ID=" + w + " AND IsActive='Y'"); return r.length ? r[0].values[0][0] : null; }, w);

  await prepareA();
  await card('A plugin\'s dictionary', 'For developers: how a plugin ships its dictionary rows the iDempiere way, as 2Packs, and what Start, reload and Stop do with them.');
  await page.mouse.move(720, 500); await hold(1500); await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); await cast();
  try {
    await beat('d0', 'title card');
    await page.evaluate(() => window.PluginRelease.open()); await page.waitForSelector('#pr-osgi table.oc-t', { timeout: 10000 }); await hold(800);

    // ═══ d1 card: the bundle, legacy vs here (read from the files) ═══
    await beat('d1', 'card: packs, column callouts, Stop');
    const lib = await page.evaluate(async () => { const x = window.PluginEngine._reg().get('org.idempiere.mfg'); const m = (await import(x.url)).manifest; return { id: m.id, packs: m.packs.map(p => p.split('/').pop()) }; });
    const sizes = lib.packs.map(p => { try { return Math.round(fs.statSync(path.join(REPO, 'erp/plugins/libero_2pack', p)).size / 1024) + ' KB'; } catch (e) { return '?'; } });
    const mf = readOr(path.join(LIBERO_SRC, 'META-INF/MANIFEST.MF')), act = (/Bundle-Activator: ([^\n]+)/.exec(mf) || [])[1] || 'org.adempiere.plugin.utils.Incremental2PackActivator';
    fact('card.bundle', JSON.stringify({ id: lib.id, packs: lib.packs, sizes, activator: act.trim() }));
    await card('One bundle, its dictionary in 2Packs', 'Libero Manufacturing: iDempiere\'s OSGi bundle and the same plugin here.', ['iDempiere', 'Here'],
      [{ label: 'Dictionary', cells: [{ v: 'META-INF/2Pack_1.0.0 … 1.0.2.zip', small: true }, { v: 'manifest.packs: ' + lib.packs.map((p, i) => p.replace('2Pack_', '').replace('.zip', '') + ' (' + sizes[i] + ')').join(' · '), small: true }] },
       { label: 'At Start', cells: [{ v: act.trim().split('.').pop() + ': each pack above the installed version, once', small: true }, { v: 'the same rule, before any plugin code', small: true }] },
       { label: 'Callouts', cells: [{ v: 'plugin.xml IColumnCallout (table + column)', small: true }, { v: 'ctx.callout.defineColumnCallout', small: true }] },
       { label: 'At Stop', cells: [{ v: 'code stops, rows stay', small: true }, { v: 'code stops, rows stay', small: true }] }]);

    // ═══ d2 live: Start applies the packs ═══
    await beat('d2', 'Plugins panel: Start = Pack In');
    await uncard(); await pace(1200);
    const n2 = PAGELOG.length; await hclick('#pr-osgi [data-oc-start="org.idempiere.mfg"]');
    for (let i = 0; i < 160 && !PAGELOG.slice(n2).some(l => /§PACKIN-START bundle=org.idempiere.mfg/.test(l)); i++) await hold(250);
    await pace(1500);
    fact('start.packin', lastLog(n2, /§PACKIN-START bundle=org.idempiere.mfg/));
    PAGELOG.slice(n2).filter(l => /§PACKIN pack=/.test(l)).forEach(l => { const m = /version=(\S+).*records=(\d+) processed=(\d+) skippedOfficial=(\d+).* sql=(\S+)/.exec(l); fact('start.pack', m ? 'v' + m[1] + ' records=' + m[2] + ' processed=' + m[3] + ' official-skipped=' + m[4] + ' sql=' + m[5] : l.slice(0, 200)); });
    fact('start.aftersave', lastLog(n2, /§PACKIN aftersave/));
    fact('start.state', await page.evaluate(() => window.PluginEngine._reg().get('org.idempiere.mfg').state));
    await pace(2500);

    // ═══ d3 live: Packages Installed ═══
    await holdFor(); prevB = null;
    await card('Packages Installed', 'Where iDempiere lists every pack applied.'); await beat('d3', 'Packages Installed window');
    await ipc('#pr-root [data-pr-close]'); await hold(400); await menuBehind(await menuOf(50001)); await page.waitForSelector(NEWB, { timeout: 20000, state: 'attached' }); await hold(1500);
    if (await page.locator('#idmp-inline-mount').count()) { await ipc('#idmp-toolbar [data-tb="toggle"]'); await hold(1000); }
    await uncard(); await pace(1500);
    const pk = await page.$$eval('.idmp-grid tbody tr', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
    fact('packages.grid', pk.length + ' rows ' + JSON.stringify(pk.filter(t => /mfg/.test(t))).slice(0, 380));
    await pace(3500);

    // ═══ d4 live: the packed process and its access ═══
    await holdFor(); prevB = null;
    await card('The packed rows', 'Report & Process: the process from our pack 1.0.3, and who may run it.'); await beat('d4', 'Report & Process: process + Report Access');
    await menuBehind(await menuOf(165)); await page.waitForSelector(NEWB, { timeout: 20000, state: 'attached' }); await hold(1500);
    await uncard(); await pace(1500);
    await findByName('Order Receipt & Issue');
    fact('process.record', JSON.stringify({ name: await fieldVal('Name'), value: await fieldVal('Value'), form: await fieldVal('AD_Form_ID'), entity: await fieldVal('EntityType'), id: await sql("SELECT ad_process_id FROM ad_process WHERE ad_process_uu='6f1f9b8e-1d0a-4c55-9a3e-18c2b1f00a01'") }));
    await pace(1500);
    await hclick('#idmp-tabstrip .idmp-adtab[title$="· AD_Process_Access"]'); await pace(1800);
    fact('process.access', JSON.stringify({ grid: await page.$$eval('.idmp-grid tbody tr', e => e.length), all: await sql("SELECT COUNT(*) FROM ad_process_access a JOIN ad_process p ON p.ad_process_id=a.ad_process_id WHERE p.ad_process_uu='6f1f9b8e-1d0a-4c55-9a3e-18c2b1f00a01'"), autoRoles: await sql("SELECT COUNT(*) FROM ad_role WHERE ismanual='N'") }));
    fact('callouts.adColumn', JSON.stringify(await sql("SELECT COUNT(*) FROM ad_column WHERE callout LIKE 'org.eevolution.model%'")));
    await pace(3000);

    // ═══ d5 card: a second session replays the kept packs (page B loads behind it) ═══
    await holdFor(); prevB = null;
    await beat('d5', 'card: reload = replay');
    await card('Every load', 'The dictionary is rebuilt from the seed at each load, so the packs that went in are put back before any plugin starts.');
    const nB = PAGELOG.length; await prepare(pB, 'GardenWorld', 'GardenAdmin'); await zoomOrder(); page = pA; await page.bringToFront();
    const rep = lastLog(nB, /§PACKIN-REPLAY bundle=org.idempiere.mfg/), stB = lastLog(nB, /§PACKIN-START bundle=org.idempiere.mfg/);
    fact('pageB.replay', rep); fact('pageB.start', stB);
    const W = readOr(WPP_LOG), k4 = (/mode=full .*?statements=(\d+) ms=(\d+)/.exec(W) || []), wv = (/§WPP_VERDICT (\S+) judged=(\d+) failed=(\d+)/.exec(W) || []);
    fact('card.wpp', 'verdict=' + wv.slice(1).join('/') + ' fullReapply ms=' + (k4[2] || '?'));
    const rm = /statements=(\d+) ms=(\d+)/.exec(rep) || [];
    await card('Every load', 'The dictionary is rebuilt from the seed at each load, so the packs that went in are put back before any plugin starts.', ['', ''],
      [{ label: 'This session (GardenWorld Admin)', cells: [{ v: (rm[1] || '?') + ' writes', small: false }, { v: 'replayed in ' + (rm[2] || '?') + ' ms', small: true, tone: '#7ee0a0' }] },
       { label: 'Seed or patches changed', cells: [{ v: 'full Pack In', small: true }, { v: (k4[2] ? (k4[2] / 1000).toFixed(1) + ' s' : '?'), rec: 'W-PLUGIN-PACKS K4' }] },
       { label: 'Start in this session', cells: [{ v: /applied=\[\]/.test(stB) ? '0 packs' : '?', small: false }, { v: 'already installed', small: true }] },
       { label: 'Witness', cells: [{ v: (wv[2] - wv[3]) + ' of ' + wv[2], rec: 'W-PLUGIN-PACKS' }, { v: wv[1] || '?', small: true, tone: '#7ee0a0' }] }]);
    await pace(2000);

    // ═══ d6 live (page B): the order's button ═══
    await holdFor(); prevB = null;
    page = pB; await page.bringToFront(); await card('On the order', 'Logged in as GardenWorld Admin.'); await hold(DRY ? 200 : 1200); await cast(); await beat('d6', 'the button on the order');
    await uncard(); await pace(1000);
    fact('order.toolbar', JSON.stringify(await (async () => { await page.click('#idmp-toolbar [data-tb="process"]'); await page.waitForSelector('#idmp-proc-ov', { timeout: 8000 }).catch(() => {}); const v = await page.$$eval('#idmp-proc-ov [data-tbb]', e => e.map(x => x.getAttribute('data-tbb') + '=' + x.textContent)); await page.evaluate(() => { const o = document.getElementById('idmp-proc-ov'); if (o) o.remove(); }); return v; })()));
    const n6 = PAGELOG.length; await (async () => { if (!(await page.$('#idmp-proc-ov [data-tbb="PP_Order_ReceiptIssue"]'))) { await hclick('#idmp-toolbar [data-tb="process"]'); await page.waitForSelector('#idmp-proc-ov [data-tbb="PP_Order_ReceiptIssue"]', { timeout: 8000 }); } await hclick('#idmp-proc-ov [data-tbb="PP_Order_ReceiptIssue"]'); })(); await page.waitForSelector('[data-gform]', { timeout: 20000 }); await pace(1500);
    fact('form.opened', (PAGELOG.slice(n6).filter(l => /§AD-TBB run|§AD-FORM-GENERIC open/.test(l)).join(' || ')).slice(0, 400));
    await pace(3000);

    // ═══ d7 live (page B): Stop keeps the rows ═══
    await holdFor(); prevB = null;
    await card('Stop the plugin', 'Plugins & Releases, Libero Manufacturing.'); await beat('d7', 'stop: rows stay');
    await page.evaluate(() => window.PluginRelease.open()); await page.waitForSelector('#pr-osgi table.oc-t', { timeout: 10000 }); await hold(DRY ? 200 : 2400);   // the card stays >= 1.5 s (the assembler's scene-change check)
    await uncard(); await pace(1500);
    await hclick('#pr-osgi [data-oc-stop="org.idempiere.mfg"]'); await pace(1500);
    fact('afterStop.rows', JSON.stringify({ process: await sql("SELECT COUNT(*) FROM ad_process WHERE ad_process_uu='6f1f9b8e-1d0a-4c55-9a3e-18c2b1f00a01'"), button: await sql("SELECT COUNT(*) FROM ad_toolbarbutton WHERE ad_toolbarbutton_uu='6f1f9b8e-1d0a-4c55-9a3e-18c2b1f00a02'"), access: await sql("SELECT COUNT(*) FROM ad_process_access a JOIN ad_process p ON p.ad_process_id=a.ad_process_id WHERE p.ad_process_uu='6f1f9b8e-1d0a-4c55-9a3e-18c2b1f00a01'"), packages: await sql("SELECT COUNT(*) FROM ad_package_imp WHERE name='org.idempiere.mfg' AND pk_status='Completed successfully'") }));
    fact('afterStop.code', JSON.stringify({ state: await page.evaluate(() => window.PluginEngine._reg().get('org.idempiere.mfg').state), formDescriptor: await page.evaluate(() => !!(window.AdFormGeneric && window.AdFormGeneric.get('org.libero.form.VOrderReceiptIssue'))) }));
    await hclick('#pr-root [data-pr-close]'); await pace(800);
    await zoomOrder();
    fact('afterStop.toolbar', JSON.stringify(await (async () => { await page.click('#idmp-toolbar [data-tb="process"]'); await page.waitForSelector('#idmp-proc-ov', { timeout: 8000 }).catch(() => {}); const v = await page.$$eval('#idmp-proc-ov [data-tbb]', e => e.map(x => x.getAttribute('data-tbb'))); await page.evaluate(() => { const o = document.getElementById('idmp-proc-ov'); if (o) o.remove(); }); return v; })()));
    await pace(3000);
    await beat('end', 'end'); await hold(DRY ? 200 : 1000);
    gestFlush(); GPrevId = null;
    say('§ERP_FILM_CURSOR clicks=' + clicks + ' cursorOnTarget=' + cursorOk + (clicks === cursorOk ? ' OK' : ' WRONG'));
  } catch (e) { say('§ERP_FILM_ERROR ' + String(e.stack || e.message).split('\n').slice(0, 3).join(' | ')); }
  if (cdp) await cdp.send('Page.stopScreencast').catch(() => {}); await page.waitForTimeout(300).catch(() => {});
  fs.writeFileSync(path.join(OUT, 'erp_film.page.log'), PAGELOG.join('\n') + '\n');
  const errs = PAGELOG.filter(l => /^PAGEERR/.test(l)); say('§ERP_FILM_PAGEERRORS ' + errs.length + ' ' + errs.slice(0, 2).join(' | '));
  if (!DRY && frames.length) {
    const endTs = Date.now() / 1000, lines = [];
    frames.forEach((f, i) => { const d = (i + 1 < frames.length ? frames[i + 1].ts : endTs) - f.ts; lines.push(`file '${f.fn}'`, `duration ${Math.max(d, 0.001).toFixed(4)}`); }); lines.push(`file '${frames[frames.length - 1].fn}'`);
    fs.writeFileSync(path.join(OUT, 'frames.txt'), lines.join('\n') + '\n'); const mp4 = path.join(OUT, 'mfg_ad_dev_raw.mp4');
    try { execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(OUT, 'frames.txt'), '-vf', 'fps=24,scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-crf', '17', '-preset', 'medium', mp4]); say('§ERP_FILM_DONE frames=' + frames.length + ' dur=' + (endTs - T0).toFixed(2) + ' out=' + mp4); } catch (e) { say('§ERP_FILM_ERROR ffmpeg ' + String(e.message).split('\n')[0]); }
  }
  fs.writeFileSync(path.join(OUT, 'erp_film.log'), LOG.join('\n') + '\n'); await browser.close(); server.close();
})();

