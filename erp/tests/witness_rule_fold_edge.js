// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-RULE-FOLD-EDGE (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md Part A, A2-EDGE; decision A-5). READ THE LOG after every run: the §RFE lines carry the evidence, the exit code does not.
// THE ISSUE it proves/disproves: rule_fold.js (a core module with no transaction) minted its op uuid itself with crypto.randomUUID() and, without it, fell back SILENTLY to 'rule:'+N,
//   an id that repeats in every session (it collides on a shared op-log). After A2-EDGE the id comes from the ONE edge the page installs (Env.setEdge), and no edge = §ENV_NO_DATE + throw.
//   R1 with a fixed edge installed, setT('premium') commits ONE SET_RULE op whose op_uuid IS the edge's id (read back from the op-log, not from the return value only); chainOk=Y
//   R2 the full gesture (runGesture) on the REAL seed DB (erp/ad_seed.db, GardenWorld client 11): every SET_RULE op carries an edge id, the rule re-folds and reverses (reversible=Y)
//   R3 RED CONTROL: no edge installed → setT throws and §ENV_NO_DATE is printed (the pre-fix code returned a 'rule:' id here and FAILS this row)
//   R4 an edge without uuid() is refused by Env.setEdge
//   R5 the REAL page (erp/idempiere.html, headless Chromium, no GPU): the page prints §ENV_EDGE set once at boot, and RuleFold.setT there commits an op whose id is a v4 uuid from that edge
//      (skipped with RFE R5 ENV when playwright is not installed; WRF_PAGE=0 skips it on purpose)
// INCONCLUSIVE if the seed DB has no premium population for client 11 (R2 judged nothing).
// Run (cwd = bim-ootb): node erp/tests/witness_rule_fold_edge.js < /dev/null > <log>
'use strict';
const path = require('path'), fs = require('fs');
const ERP = path.join(__dirname, '..');
if (!global.window) global.window = {};
global.window.ERP = global.window.ERP || {};   // rule_fold publishes its standalone op-log here (ensureOpLog), so the witness reads the ops it wrote
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
function reqSql() {
  const tries = ['sql.js', path.join(__dirname, '..', '..', 'node_modules', 'sql.js'), path.join(require('os').homedir(), 'bim-ootb', 'node_modules', 'sql.js')];
  for (const t of tries) { try { return require(t); } catch (e) {} }
  throw new Error('sql.js not resolvable');
}
const lines = []; const keepLog = console.log; console.log = (...a) => { const s = a.join(' '); lines.push(s); keepLog(s); };
const say = s => keepLog(s);
global.window.BigDecimal = require(path.join(ERP, 'bigdecimal.js'));
require(path.join(ERP, 'kernel_ops.js')); require(path.join(ERP, 'erp_signer.js'));
const A = require(path.join(ERP, 'ad_callout.js')); global.window.AdCallout = global.window.AdCallout || A;
require(path.join(ERP, 'rule_fold.js'));
const RF = global.window.RuleFold, Env = A.Env;

(async () => {
  const SQL = await reqSql()();
  const rows = [];
  let n = 0; const edge = { nowMs: () => 1763139600000, uuid: () => 'edge-' + (++n), perfMs: () => 0 };

  // R3 first (no edge yet): RED CONTROL — must throw + print §ENV_NO_DATE, never mint an id itself
  let r3 = 'returned', r3id = null;
  try { const r = await RF.setT('premium', 200, { SQL }); r3id = r && r.uuid; } catch (e) { r3 = 'threw'; }
  const r3log = lines.some(l => /§ENV_NO_DATE/.test(l));
  const ok3 = r3 === 'threw' && r3log;
  say('§RFE R3 red-control no-edge outcome=' + r3 + ' id=' + JSON.stringify(r3id) + ' §ENV_NO_DATE=' + (r3log ? 'Y' : 'N') + ' ok=' + (ok3 ? 'Y' : 'N'));
  rows.push(ok3);

  // R4: an edge without uuid() is refused
  let r4 = false; if (typeof Env.setEdge === 'function') { try { Env.setEdge({ nowMs: () => 1 }); } catch (e) { r4 = true; } }
  say('§RFE R4 edge-without-uuid refused=' + (r4 ? 'Y' : 'N') + ' ok=' + (r4 ? 'Y' : 'N')); rows.push(r4);

  // R1: a fixed edge → setT's op carries the edge id, read back from the op-log itself
  let ok1 = false, got1 = null, logId = null, chain1 = null;
  try {
    Env.setEdge(edge);
    const r = await RF.setT('premium', 300, { SQL }); got1 = r.uuid; chain1 = r.chainOk;
    const ops = global.window.KernelOps.replayOps(global.window.ERP.opDb, 'SET_RULE');
    logId = ops.length ? ops[ops.length - 1].op_uuid : null;
  } catch (e) { say('§RFE R1 error ' + e.message); }
  ok1 = /^edge-\d+$/.test(String(got1)) && logId === got1 && chain1 === true;
  say('§RFE R1 setT uuid=' + got1 + ' oplog_uuid=' + logId + ' chainOk=' + (chain1 ? 'Y' : 'N') + ' ok=' + (ok1 ? 'Y' : 'N')); rows.push(ok1);

  // R2: the full gesture on the REAL seed DB (GardenWorld client 11)
  const seed = path.join(ERP, 'ad_seed.db');
  const adDb = new SQL.Database(fs.readFileSync(seed));
  const before = n; let g = null;
  try { g = await RF.runGesture({ rule: 'premium', db: adDb, SQL, client: { id: 11, name: 'GardenWorld' } }); } catch (e) { say('§RFE R2 error ' + e.message); }
  const minted = n - before;
  const judged = !!(g && g.N > 0);
  const ok2 = judged && minted === 3 && g.reversible === true && g.oracleOk === true;
  say('§RFE R2 runGesture N=' + (g && g.N) + ' K0=' + (g && g.K0) + ' K1=' + (g && g.K1) + ' edge_ids_minted=' + minted + ' (want 3: seed+forward+reverse) reversible=' + (g && g.reversible ? 'Y' : 'N') +
      ' oracle=' + (g && g.oracleOk ? 'Y' : 'N') + ' ok=' + (ok2 ? 'Y' : 'N'));
  rows.push(ok2);

  // R5: the real page installs the edge at boot and rule_fold uses it there
  let pw = null; try { pw = require(process.env.PW || path.join(__dirname, '..', '..', 'tests', 'node_modules', 'playwright')); } catch (e) {}
  if (process.env.WRF_PAGE === '0' || !pw) say('§RFE R5 ENV page row skipped (' + (pw ? 'WRF_PAGE=0' : 'playwright not installed') + ')');
  else {
    const http = require('http'), REPO = path.join(ERP, '..');
    const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm' };
    const srv = http.createServer((q, res) => { const fp = path.join(REPO, decodeURIComponent(q.url.split('?')[0]));
      fs.stat(fp, (e, st) => { if (e || st.isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); }); });
    await new Promise(r => srv.listen(0, r));
    const br = await pw.chromium.launch(); let ok5 = false, info = {};
    try {
      const page = await (await br.newContext({ serviceWorkers: 'block' })).newPage(); const cl = [];
      page.on('console', m => { const t = m.text(); if (/§ENV_EDGE|§ENV_NO_DATE|§RULE-SET/.test(t)) cl.push(t); });
      await page.goto('http://localhost:' + srv.address().port + '/erp/idempiere.html?lang=en_US', { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForFunction(() => !!(window.RuleFold && window.SQL && window.AdCallout && window.KernelOps), null, { timeout: 120000 });
      info = await page.evaluate(async () => { const r = await window.RuleFold.setT('premium', 300, { SQL: window.SQL }); return { uuid: r.uuid, chainOk: r.chainOk }; });
      info.edgeLines = cl.filter(t => /§ENV_EDGE set/.test(t)).length; info.noDate = cl.filter(t => /§ENV_NO_DATE/.test(t)).length;
      ok5 = info.edgeLines === 1 && info.noDate === 0 && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(String(info.uuid)) && info.chainOk === true;
    } catch (e) { info.error = e.message.split('\n')[0]; }
    await br.close(); srv.close();
    say('§RFE R5 page §ENV_EDGE_lines=' + info.edgeLines + ' §ENV_NO_DATE=' + info.noDate + ' setT_uuid=' + info.uuid + ' chainOk=' + (info.chainOk ? 'Y' : 'N') + (info.error ? ' error=' + info.error : '') + ' ok=' + (ok5 ? 'Y' : 'N'));
    rows.push(ok5);
  }

  const fail = rows.filter(x => !x).length;
  const verdict = !judged ? 'INCONCLUSIVE' : fail ? 'FAIL' : 'PASS';
  say('§RFE VERDICT ' + verdict + ' rows=' + rows.length + ' fail=' + fail);
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(e => { say('§RFE FATAL ' + (e && e.stack || e)); process.exit(2); });
