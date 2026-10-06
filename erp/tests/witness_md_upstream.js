// ⚠ DO NOT REMOVE — W-MD-UPSTREAM. Scope: a detail tab whose AD link metadata cannot be READ must never list every parent's rows.
// Read the log after every run (erp/tests/_out/witness_md_upstream_<mode>.log); exit code alone is not evidence.
// Issue it proves/disproves (bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §MD-UPSTREAM): field case 2026-10-07 — Task Line under
//   Project 990001 listed 29 lines of two projects with `where=(…ProjectTask_ID > 0) AND AD_Client_ID IN (0,11)` (tab WhereClause, NO link,
//   NO 2=3) = a model whose link read as "none". Injected here: the AD_Tab/AD_Column reads THROW while the tab model is first built.
// Usage: node witness_md_upstream.js [old]   — `old` serves the pre-fix ad_gridtab.js/idempiere.html from git HEAD (expected RED).
// INCONCLUSIVE (never PASS) when the Task Line population judged is empty or the injection never fired.
const { chromium } = require(require('os').homedir() + '/bim-ootb/tests/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '../..'), MODE = process.argv[2] === 'old' ? 'old' : 'new', PORT = 8500 + Math.floor(Math.random() * 90);
const OLD = {}; if (MODE === 'old') ['erp/ad_gridtab.js', 'erp/idempiere.html'].forEach(f => OLD['/' + f] = cp.execSync('git show HEAD:' + f, { cwd: ROOT, maxBuffer: 1 << 28 }));
const server = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const send = b => { r.writeHead(200, { 'Content-Type': ({'.html':'text/html','.js':'text/javascript','.json':'application/json','.wasm':'application/wasm','.css':'text/css'})[path.extname(p)] || 'application/octet-stream' }); r.end(b); };
  if (OLD[p]) return send(OLD[p]); fs.readFile(path.join(ROOT, p), (e, b) => e ? (r.writeHead(404), r.end()) : send(b)); });
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'mdw-')), {});
  const page = await ctx.newPage(); const log = [], md = [];
  page.on('console', m => { const t = m.text(); if (/§(GT-OPEN-DEGRADED|GT-OPEN-FAIL|IDEMPIERE-MD|IDEMPIERE tab=Task Line|AD_DATA readRecords table=C_ProjectLine where)/.test(t)) { log.push(t.slice(0, 300)); md.push(t); } });
  await page.goto('http://127.0.0.1:' + PORT + '/erp/idempiere.html?client=garden&window=130&record=990001');
  for (let i = 0; i < 60; i++) { await page.waitForTimeout(2500);
    const si = await page.evaluate(() => { const vis = e => e && e.getBoundingClientRect().width > 0;
      const s2 = document.getElementById('idmp-login-step2'), ok = document.getElementById('idmp-login-ok');
      if (s2 && s2.style.display !== 'none' && vis(ok)) { ok.click(); return 1; }
      const u = Array.from(document.querySelectorAll('.idmp-login-user')).filter(vis).find(r => /GardenAdmin/.test(r.textContent)); if (u) { u.click(); return 1; }
      return document.querySelectorAll('.idmp-adtab').length ? 2 : 0; });
    if (si === 2) break; }
  await page.waitForTimeout(2500);
  const tab = async n => { await page.evaluate((n) => { const t = Array.from(document.querySelectorAll('.idmp-adtab')).find(e => e.textContent.trim() === n); t && t.click(); }, n); await page.waitForTimeout(2500); };
  // inject: the AD link-metadata reads throw (the tab model is first built while they fail)
  await page.evaluate(() => { const d = window.__idmpDb, o = d.exec.bind(d); window.__injected = 0; window.__restore = () => { d.exec = o; };
    d.exec = function (sql) { if (/FROM AD_Tab t WHERE t\.AD_Tab_ID=\?/.test(sql) || /c\.IsParent='Y'/.test(sql)) { window.__injected++; throw new Error('injected AD read failure'); } return o.apply(d, arguments); }; });
  log.push('--- PHASE 1: AD reads failing, open Task Line'); const n1 = md.length; await tab('Task Line');
  const ph1 = md.slice(n1), inj = await page.evaluate(() => window.__injected);
  const rows1 = (ph1.map(t => /§IDEMPIERE tab=Task Line .* rows=(\d+)/.exec(t)).filter(Boolean).pop() || [])[1];
  const where1 = (ph1.map(t => /readRecords table=C_ProjectLine where=(.*)/.exec(t)).filter(Boolean).pop() || [])[1] || '';
  log.push('--- PHASE 2: AD reads healthy again, leave and re-enter Task Line (self-heal)');
  await page.evaluate(() => window.__restore()); await tab('Project'); const n2 = md.length; await tab('Task Line');
  const ph2 = md.slice(n2); const mdl2 = ph2.find(t => /§IDEMPIERE-MD tab=Task Line/.test(t)) || '';
  const R = [];
  const A = (name, ok, detail) => R.push((ok ? 'PASS ' : 'FAIL ') + name + ' ' + detail);
  const verdict = inj === 0 || rows1 === undefined ? 'INCONCLUSIVE' : null;
  A('§W-MD-UP.1 injection fired (AD reads actually failed)', inj > 0, 'injected=' + inj);
  A('§W-MD-UP.2 degraded model logged', ph1.some(t => /§GT-OPEN-DEGRADED tab=Task Line/.test(t)), '');
  A('§W-MD-UP.3 where carries a parent scope (2=3), not tab WhereClause alone', /2=3/.test(where1), 'where=' + where1);
  A('§W-MD-UP.4 rows listed under an unresolved parent = 0 (field case: 29)', rows1 === '0', 'rows=' + rows1);
  A('§W-MD-UP.5 self-heal: re-entry rebuilds the model with its real link column', /link=C_ProjectTask_ID source=AD_Column_ID/.test(mdl2), mdl2.slice(0, 160));
  const bad = R.filter(x => x.startsWith('FAIL')).length;
  log.push(...R); log.push('§W-MD-UP VERDICT mode=' + MODE + ' ' + (verdict || (bad ? 'FAIL(' + bad + ')' : 'PASS')));
  fs.mkdirSync(path.join(__dirname, '_out'), { recursive: true }); fs.writeFileSync(path.join(__dirname, '_out', 'witness_md_upstream_' + MODE + '.log'), log.join('\n')); console.log(log.join('\n'));
  await ctx.close(); server.close(); process.exit(verdict ? 2 : bad ? 1 : 0);
})();
