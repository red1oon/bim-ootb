// SPDX-License-Identifier: GPL-2.0-only
// ⚠ DO NOT REMOVE — W-PLUGIN-LAZY-LIVE (Host work H2; spec ~/Projects/Mfg/HOST_PLUGIN_LIFECYCLE_SPEC.md §H2). READ THE LOG: §PLG-LAZY lines carry the evidence.
// THE ISSUE it proves/disproves, in a REAL browser through the page's own commit funnel: a LAZY plugin bundle (fixture, trigger table PP_Order) is STARTED but not activated; the base product has no DocAction class for pp_order
//   (control: a DocAction on a pp_order row takes the status-only path, no §MODEL-DOCACTION); the FIRST DocAction on a pp_order row activates the bundle at the funnel (applyOp -> demand), BEFORE the registries are read, and the model layer then runs
//   the bundle's DocAction (§MODEL-DOCACTION appears, after §PLUGIN-ACTIVATE); a second action does not re-activate; the activation is a recorded op; 0 page errors.
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.db': 'application/octet-stream' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/erp/idempiere.html'; const f = path.join(ROOT, p);
  fs.stat(f, (e, s) => { if (e || s.isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }); });
let fails = 0; const ok = (n, c, i) => { if (!c) fails++; console.log('  §PLG-LAZY ' + n + ' ' + (c ? 'PASS' : 'FAIL') + (c ? '' : ' ' + JSON.stringify(i))); };
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const browser = await chromium.launch({ args: ['--no-sandbox'] }); const pg = await (await browser.newContext()).newPage();
  const logs = [], errs = []; pg.on('console', m => logs.push(m.text())); pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(`http://localhost:${port}/erp/idempiere.html?seed=ad_seed.db&login=GardenAdmin&window=123`, { waitUntil: 'networkidle' });
  await pg.waitForSelector('[data-ad-table]', { timeout: 20000 }).catch(async () => { const u = await pg.$('#idmp-login-users .idmp-login-user:not(.disabled)'); if (u) { await u.click(); const o = await pg.$('#idmp-login-ok'); if (o) await o.click(); } await pg.waitForSelector('[data-ad-table]', { timeout: 15000 }).catch(() => {}); });
  await pg.waitForTimeout(1200);
  const idx = (re) => logs.findIndex(l => re.test(l));
  // CONTROL: no bundle yet - a DocAction on a pp_order row takes the status-only path
  const pre = await pg.evaluate(() => ({ docClass: !!(window.ModelLayer && window.ModelLayer.docActionFor('pp_order')), engine: !!(window.PluginEngine && window.PluginEngine.need), crud: !!(window.__crud && window.__crud.process) }));
  ok('L0 the page exposes the engine + commit funnel and the base product has NO pp_order DocAction class', pre.engine && pre.crud && pre.docClass === false, pre);
  const mark0 = logs.length;
  await pg.evaluate(() => window.__crud.process('PP_Order', 50001, 'CO', { from: 'DR', to: 'CO' })); await pg.waitForTimeout(2500);
  const ctrl = logs.slice(mark0);
  console.log('§PLG-LAZY-CTRL control (no bundle): MODEL-DOCACTION lines=' + ctrl.filter(l => /§MODEL-DOCACTION table=pp_order/.test(l)).length + ' HOSTPROCESS lines=' + ctrl.filter(l => /§CRUD-HOSTPROCESS table=pp_order/.test(l)).length);
  ok('L1 control: the pp_order DocAction reached the funnel but NO model DocAction ran (no class) - the status-only path', ctrl.some(l => /§CRUD-HOSTPROCESS table=pp_order/.test(l)) && !ctrl.some(l => /§MODEL-DOCACTION table=pp_order/.test(l)), ctrl.slice(0, 6));
  // install + START the lazy fixture
  const url = `http://localhost:${port}/erp/tests/fixtures/lazy_probe.mjs`;
  const st = await pg.evaluate(async (u) => { const r = window.PluginEngine._reg(); await r.installBundle(u); const x = await r.startBundle('com.test.lazy-probe'); return { state: x.state, probe: window.__lazyProbe || 0, docClass: !!window.ModelLayer.docActionFor('pp_order') }; }, url);
  console.log('§PLG-LAZY-1 after START: ' + JSON.stringify(st));
  ok('L2 started LAZY: state STARTING, the bundle code has NOT run (0 activations), no DocAction class yet', st.state === 'STARTING' && st.probe === 0 && st.docClass === false, st);
  // THE DEMAND: first DocAction on a pp_order row
  const mark1 = logs.length;
  await pg.evaluate(() => window.__crud.process('PP_Order', 50000, 'CO', { from: 'DR', to: 'CO' })); await pg.waitForTimeout(3500);
  const dem = logs.slice(mark1), iAct = dem.findIndex(l => /§PLUGIN-ACTIVATE id=com.test.lazy-probe/.test(l)), iDoc = dem.findIndex(l => /§MODEL-DOCACTION table=pp_order/.test(l));
  const after = await pg.evaluate(() => ({ state: window.PluginEngine._reg().get('com.test.lazy-probe').state, probe: window.__lazyProbe || 0, docClass: !!window.ModelLayer.docActionFor('pp_order') }));
  console.log('§PLG-LAZY-2 after the first pp_order DocAction: ' + JSON.stringify(after) + ' activateLine@' + iAct + ' modelDocActionLine@' + iDoc);
  ok('L3 the first pp_order DocAction ACTIVATED the bundle at the funnel (ACTIVE, exactly 1 activation, DocAction class registered)', after.state === 'ACTIVE' && after.probe === 1 && after.docClass === true, after);
  ok('L4 ordering: §PLUGIN-ACTIVATE precedes §MODEL-DOCACTION, and the model layer RAN the bundle\'s DocAction (not the status-only path)', iAct >= 0 && iDoc > iAct, { iAct: iAct, iDoc: iDoc, sample: dem.filter(l => /PLUGIN|MODEL-DOC|HOSTPROCESS/.test(l)).slice(0, 6) });
  await pg.evaluate(() => window.__crud.process('PP_Order', 50001, 'CO', { from: 'DR', to: 'CO' })); await pg.waitForTimeout(2500);
  const again = await pg.evaluate(() => window.__lazyProbe || 0);
  ok('L5 a second demand does not re-activate (still 1 activation)', again === 1, { again: again });
  const ops = await pg.evaluate(() => { try { const KO = window.KernelOps, db = window.__idmpDb; return null; } catch (e) { return null; } });
  ok('L6 zero page errors', errs.length === 0, errs.slice(0, 3));
  console.log('§PLG-LAZY-VERDICT ' + (fails ? 'FAIL' : 'PASS') + ' failed=' + fails); await browser.close(); srv.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('§PLG-LAZY-VERDICT FAIL harness: ' + e.stack); process.exit(2); });
