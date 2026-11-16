#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-PIPO-LOCAL (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md Part A, A2-PIPO; the twin rule).
// Read the log after every run: exit code is not evidence.
// ISSUE THIS PROVES OR DISPROVES: "a BUNDLE Pack In (PipoPackIn.incremental, no `now` passed) stamps its rows and its AD_Package_Imp row in UTC" — legacy stamps
//   the server's LOCAL clock (PO.java:1985/:3341, DB_PostgreSQL TO_DATE = Timestamp.toString()), and in +08 UTC is the PREVIOUS DAY before 08:00.
// POPULATION: the REAL erp/idempiere.html served from PL_REPO (default this checkout), headless, timezone Asia/Kuala_Lumpur, the page clock PINNED at
//   2026-11-13 00:30 local (Playwright page.clock.setFixedTime), so the old and the new code see the SAME instant and only the zone can differ.
//   The CAPEX test 2Pack applied as a bundle 'PipoLocal' 1.0.0 (225 records).
// CHECKS: P1 the AD_Package_Imp row says created = updated = '2026-11-13 00:30:00' (local) · P1b every row the walk stamped `updated` with this run's clock
//   (C_Project, the pack's first table) carries the local stamp, none the UTC one · P3 parser: no new Date() / Date.now() / randomUUID left in pipo_packin.js
//   or in plugin_overlay._packOpts. Ids: this pack carries its own UUs (measured: 0 minted), so the edge-uuid default is proven by P3 only.
// RED CONTROL: PL_REPO=<a main worktree> must FAIL P1 ('2026-11-12 16:30:00', the UTC day), P1b and P3. INCONCLUSIVE if the page never got ready.
// Command (cwd = bim-ootb): node erp/tests/witness_pipo_local.js < /dev/null > <log>
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const REPO = path.resolve(process.env.PL_REPO || path.join(__dirname, '..', '..'));
let fail = 0, judged = 0;
const check = (label, ok) => { judged++; console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + label); if (!ok) fail++; };
const LOCAL = '2026-11-13 00:30:00', UTC = '2026-11-12 16:30:00';
console.log('  repo: ' + REPO);

// P3 (no browser)
let espree = null;
for (const p of [REPO, path.join(__dirname, '..', '..'), path.join(require('os').homedir(), 'bim-ootb')]) { try { espree = require(require.resolve('espree', { paths: [p] })); break; } catch (e) {} }
function calls(file, onlyFn) {
  const ast = espree.parse(fs.readFileSync(path.join(REPO, file), 'utf8'), { ecmaVersion: 2022 }); let n = 0;
  (function walk(x, inside) {
    if (!x || typeof x.type !== 'string') return;
    const here = inside || !onlyFn || (x.type === 'FunctionDeclaration' && x.id && x.id.name === onlyFn);
    if (here && x.type === 'NewExpression' && x.callee && x.callee.name === 'Date' && x.arguments.length === 0) n++;
    if (here && x.type === 'CallExpression' && x.callee && x.callee.type === 'MemberExpression' && x.callee.property &&
      (x.callee.property.name === 'randomUUID' || (x.callee.property.name === 'now' && x.callee.object && x.callee.object.name === 'Date'))) n++;
    for (const k of Object.keys(x)) { const v = x[k]; if (Array.isArray(v)) v.forEach(y => walk(y, here)); else if (v && typeof v.type === 'string') walk(v, here); }
  })(ast, false);
  return n;
}
if (!espree) console.log('  §PIPO_LOCAL P3 INCONCLUSIVE: espree not found');
else {
  const a = calls('erp/pipo_packin.js'), b = calls('erp/plugin_overlay.js', '_packOpts');
  check('P3 erp/pipo_packin.js has no new Date() / Date.now() / randomUUID (found ' + a + ')', a === 0);
  check('P3 erp/plugin_overlay.js _packOpts() has no randomUUID / clock call (found ' + b + ')', b === 0);
}

let pw = null; for (const p of [process.env.PW, path.join(__dirname, '..', '..', 'tests', 'node_modules', 'playwright'), path.join(require('os').homedir(), 'bim-ootb', 'tests', 'node_modules', 'playwright')]) { if (!p) continue; try { pw = require(p); break; } catch (e) {} }
const zd = path.join(REPO, 'capex/plugin/testdata_2pack');
const ZIP = fs.existsSync(zd) ? fs.readdirSync(zd).filter(f => /_GardenWorld_CAPEXTestData\.zip$/.test(f)).sort().map(f => path.join(zd, f)).pop() : null;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm', '.sql': 'text/plain' };
const srv = http.createServer((q, res) => { const fp = path.join(REPO, decodeURIComponent(q.url.split('?')[0]));
  fs.stat(fp, (e, st) => { if (e || st.isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); }); });

(async () => {
  if (!pw || !ZIP) { console.log('§PIPO_LOCAL verdict=INCONCLUSIVE reason="' + (!pw ? 'playwright not installed' : 'no CAPEX test 2Pack') + '"'); process.exitCode = 2; return; }
  await new Promise(r => srv.listen(0, r));
  const br = await pw.chromium.launch(); let ready = false;
  try {
    const ctx = await br.newContext({ serviceWorkers: 'block', timezoneId: 'Asia/Kuala_Lumpur' }), page = await ctx.newPage();
    await page.goto('http://localhost:' + srv.address().port + '/erp/idempiere.html?lang=en_US', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => !!(window.PipoPackIn && window.__idmpDb && window.AdCallout && window.CoreEdge), null, { timeout: 120000 });
    await page.waitForTimeout(3000);
    await page.clock.setFixedTime(new Date('2026-11-13T00:30:00+08:00'));
    ready = true;
    const r = await page.evaluate(async (b64) => {
      const bin = atob(b64), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const db = window.__idmpDb, P = window.PipoPackIn;
      let res; try { res = await P.incremental(db, 'PipoLocal', [{ version: '1.0.0', bytes }], { say: () => {}, convertSql: window.AdCallout.convertSql, hasFunction: () => true }); } catch (e) { res = 'threw ' + e.message; }
      const one = sql => { try { const x = db.exec(sql); return x.length ? x[0].values : []; } catch (e) { return [['query failed ' + e.message]]; } };
      return { pageClock: new Date().toString(), res: typeof res === 'string' ? res : res.map(x => ({ ok: x.ok, processed: x.stat && x.stat.processed })),
        imp: one("SELECT created, updated FROM ad_package_imp WHERE name='PipoLocal' ORDER BY ad_package_imp_id DESC LIMIT 1")[0] || null,
        proj: one("SELECT updated, COUNT(*) FROM c_project WHERE substr(updated,1,10) IN ('2026-11-13','2026-11-12') GROUP BY substr(updated,1,19)") };
    }, fs.readFileSync(ZIP).toString('base64'));
    console.log('  page clock: ' + r.pageClock + ' · walk: ' + JSON.stringify(r.res));
    check('P1 AD_Package_Imp created/updated = ' + JSON.stringify(r.imp) + ' (expected both ' + LOCAL + ' local, not ' + UTC + ' UTC)',
      Array.isArray(r.imp) && String(r.imp[0]).slice(0, 19) === LOCAL && String(r.imp[1]).slice(0, 19) === LOCAL);
    const local = r.proj.filter(x => String(x[0]).slice(0, 19) === LOCAL).reduce((s, x) => s + x[1], 0), utc = r.proj.filter(x => String(x[0]).slice(0, 19) === UTC).reduce((s, x) => s + x[1], 0);
    if (!local && !utc) console.log('  §PIPO_LOCAL P1b INCONCLUSIVE: no C_Project row carries this run\'s stamp (nothing judged)');
    else check('P1b C_Project rows stamped by this walk: ' + local + ' at ' + LOCAL + ' (local), ' + utc + ' at ' + UTC + ' (UTC); expected all local', local > 0 && utc === 0);
  } catch (e) { console.log('  §PIPO_LOCAL page error: ' + e.message.split('\n')[0]); }
  await br.close(); srv.close();
  const verdict = !ready || judged === 0 ? 'INCONCLUSIVE' : fail === 0 ? 'PASS' : 'FAIL';
  console.log('§PIPO_LOCAL checks=' + judged + ' failed=' + fail + ' verdict=' + verdict);
  process.exitCode = verdict === 'PASS' ? 0 : verdict === 'FAIL' ? 1 : 2;
})();
