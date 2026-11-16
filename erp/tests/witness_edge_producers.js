#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-EDGE-PRODUCERS (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md Part A, A2-EDGE-2; decisions A-2 + A-6).
// Read the log after every run: exit code is not evidence.
// ISSUE THIS PROVES OR DISPROVES: "the page's model env (crud_overlay._modelEnv) and the client Pack In env (plugin_overlay._localNow / _clientEnv) read the wall
//   clock and the RNG themselves, each with its own copy of the local-stamp code" — after: both are views of the ONE installed edge through Env.stamp.
// POPULATION: the REAL erp/idempiere.html served from EP_REPO (default: this checkout), headless Chromium (no GPU, service worker blocked), timezone Asia/Kuala_Lumpur.
//   A fake CoreEdge (nowMs = 2026-11-20 10:15:00 local, a fixed uuid) is set on the page right before each call, so the only honest answer is the fake's.
//   E1 __crud.withModelTrx hands an env with date/now/nowMillis/uuid from the fake · E2 PluginEngine.packInClient with the CAPEX test 2Pack (client 11) records an
//   AD_Package_Imp row with created = updated = the fake's stamp · E3 the producer functions (parsed by name) call no Date / randomUUID.
// RED CONTROL: EP_REPO=<a main worktree> (the pre-A2-EDGE-2 files) must FAIL E1-E3. INCONCLUSIVE if the page never got ready or playwright is absent.
// Command (cwd = bim-ootb): node erp/tests/witness_edge_producers.js < /dev/null > <log>
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const REPO = path.resolve(process.env.EP_REPO || path.join(__dirname, '..', '..'));
let fail = 0, judged = 0;
const check = (label, ok) => { judged++; console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + label); if (!ok) fail++; };
const FAKE_LOCAL = [2026, 10, 20, 10, 15, 0], FAKE_ID = '11111111-2222-4333-8444-555555555555', WANT = '2026-11-20 10:15:00';
console.log('  repo: ' + REPO);

// E3 first (no browser): the producer functions, found by name with a parser, call no Date / randomUUID.
let espree = null;
for (const p of [REPO, path.join(__dirname, '..', '..'), path.join(require('os').homedir(), 'bim-ootb')]) { try { espree = require(require.resolve('espree', { paths: [p] })); break; } catch (e) {} }
function clockCalls(file, names) {
  const src = fs.readFileSync(path.join(REPO, file), 'utf8'), ast = espree.parse(src, { ecmaVersion: 2022, range: true }), found = {};
  (function walk(n, inFn) {
    if (!n || typeof n.type !== 'string') return;
    let here = inFn;
    if (n.type === 'FunctionDeclaration' && n.id && names.includes(n.id.name)) { here = n.id.name; found[here] = found[here] || 0; }
    if (here) {
      const c = n.type === 'CallExpression' ? n.callee : n.type === 'NewExpression' ? n.callee : null;
      if (n.type === 'NewExpression' && c && c.name === 'Date' && n.arguments.length === 0) found[here]++;
      if (n.type === 'CallExpression' && c && c.type === 'MemberExpression' && c.property && (c.property.name === 'randomUUID' || (c.property.name === 'now' && c.object && c.object.name === 'Date'))) found[here]++;
    }
    for (const k of Object.keys(n)) { const v = n[k]; if (k === 'range') continue; if (Array.isArray(v)) v.forEach(x => walk(x, here)); else if (v && typeof v.type === 'string') walk(v, here); }
  })(ast, null);
  return found;
}
if (!espree) console.log('  §EDGE_PRODUCERS E3 INCONCLUSIVE: espree not found');
else {
  const a = clockCalls('erp/crud_overlay.js', ['_modelEnv']), b = clockCalls('erp/plugin_overlay.js', ['_localNow', '_clientEnv']);
  for (const [f, m] of [['crud_overlay.js', a], ['plugin_overlay.js', b]]) for (const [fn, n] of Object.entries(m)) check('E3 erp/' + f + ' ' + fn + '() calls no new Date() / Date.now() / randomUUID (found ' + n + ')', n === 0);
  if (!Object.keys(a).length || Object.keys(b).length < 2) check('E3 every producer function was found by name (crud ' + Object.keys(a) + ', plugin ' + Object.keys(b) + ')', false);
}

let pw = null; try { pw = require(process.env.PW || path.join(__dirname, '..', '..', 'tests', 'node_modules', 'playwright')); } catch (e) {
  try { pw = require(path.join(require('os').homedir(), 'bim-ootb', 'tests', 'node_modules', 'playwright')); } catch (e2) {} }
const zipDir = path.join(REPO, 'capex/plugin/testdata_2pack');
const ZIP = fs.existsSync(zipDir) ? fs.readdirSync(zipDir).filter(f => /_GardenWorld_CAPEXTestData\.zip$/.test(f)).sort().map(f => path.join(zipDir, f)).pop() : null;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm', '.sql': 'text/plain', '.db': 'application/octet-stream' };
const srv = http.createServer((q, res) => { const fp = path.join(REPO, decodeURIComponent(q.url.split('?')[0]));
  fs.stat(fp, (e, st) => { if (e || st.isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); }); });

(async () => {
  if (!pw) { console.log('§EDGE_PRODUCERS verdict=INCONCLUSIVE reason="playwright not installed"'); process.exitCode = 2; return; }
  await new Promise(r => srv.listen(0, r));
  const br = await pw.chromium.launch(); let ready = false;
  try {
    const ctx = await br.newContext({ serviceWorkers: 'block', timezoneId: 'Asia/Kuala_Lumpur' }), page = await ctx.newPage(), cl = [];
    page.on('console', m => { const t = m.text(); if (/§ENV_NO_DATE|§PACKIN-CLIENT/.test(t)) cl.push(t); });
    await page.goto('http://localhost:' + srv.address().port + '/erp/idempiere.html?lang=en_US', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => !!(window.__crud && window.__crud.withModelTrx && window.AdCallout && window.ModelLayer && window.PluginEngine), null, { timeout: 120000 });
    await page.waitForTimeout(3000);
    ready = true;
    // E1
    const e1 = await page.evaluate(([L, ID]) => {
      const fake = { nowMs: () => new Date(L[0], L[1], L[2], L[3], L[4], L[5]).getTime(), uuid: () => ID, perfMs: () => 0 }, keep = window.CoreEdge; window.CoreEdge = fake;
      let env = null; try { window.__crud.withModelTrx((q, e) => { env = { date: e.date, now: e.now, nowMillis: e.nowMillis, id: e.uuid && e.uuid() }; return 1; }); } catch (x) { env = { threw: x.message }; }
      window.CoreEdge = keep; return { env, fakeMs: fake.nowMs() };
    }, [FAKE_LOCAL, FAKE_ID]);
    const v = e1.env || {};
    check('E1 __crud.withModelTrx env ' + JSON.stringify(v) + ' (expected date 2026-11-20 00:00:00, now ' + WANT + ', nowMillis ' + e1.fakeMs + ', id ' + FAKE_ID + ')',
      v.date === '2026-11-20 00:00:00' && v.now === WANT && v.nowMillis === e1.fakeMs && v.id === FAKE_ID);
    // E2
    if (!ZIP) console.log('  §EDGE_PRODUCERS E2 INCONCLUSIVE: no CAPEX test 2Pack under capex/plugin/testdata_2pack');
    else {
      const e2 = await page.evaluate(async ([L, ID, b64]) => {
        const bin = atob(b64), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const fake = { nowMs: () => new Date(L[0], L[1], L[2], L[3], L[4], L[5]).getTime(), uuid: () => ID, perfMs: () => 0 }, keep = window.CoreEdge; window.CoreEdge = fake;
        let r; try { r = await window.PluginEngine.packInClient({ name: 'EdgeProducers', bytes, clientId: 11, orgId: 11, userId: 100, roleId: 102 }); } catch (x) { r = { ok: false, summary: 'threw ' + x.message }; }
        window.CoreEdge = keep;
        let row = null; try { const x = window.__idmpDb.exec("SELECT created, updated FROM ad_package_imp WHERE name='EdgeProducers' ORDER BY ad_package_imp_id DESC LIMIT 1"); row = x.length ? x[0].values[0] : null; } catch (x) { row = ['query failed ' + x.message]; }
        return { ok: r && r.ok, summary: r && r.summary, row };
      }, [FAKE_LOCAL, FAKE_ID, fs.readFileSync(ZIP).toString('base64')]);
      check('E2 packInClient ' + (e2.ok ? 'ok' : 'NOT ok (' + e2.summary + ')') + ', AD_Package_Imp created/updated=' + JSON.stringify(e2.row) + ' (expected both ' + WANT + ')',
        e2.ok === true && !!e2.row && String(e2.row[0]).slice(0, 19) === WANT && String(e2.row[1]).slice(0, 19) === WANT);
    }
    console.log('  page § lines: ' + JSON.stringify(cl.slice(0, 4)));
  } catch (e) { console.log('  §EDGE_PRODUCERS page error: ' + e.message.split('\n')[0]); }
  await br.close(); srv.close();
  const verdict = !ready || judged === 0 ? 'INCONCLUSIVE' : fail === 0 ? 'PASS' : 'FAIL';
  console.log('§EDGE_PRODUCERS checks=' + judged + ' failed=' + fail + ' verdict=' + verdict);
  process.exitCode = verdict === 'PASS' ? 0 : verdict === 'FAIL' ? 1 : 2;
})();
