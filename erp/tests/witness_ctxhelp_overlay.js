#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-CTXHELP-OVERLAY (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.16 C1). READ THE LOG after every run: every verdict is a § line, the exit code is not the evidence.
// THE ISSUE it proves/disproves: the twin had legacy's Context Help window (200034) and its dictionary, but no AD_CtxHelp / AD_CtxHelpMsg / AD_CtxHelpMsg_Trl / AD_CtxHelpSuggestion
//   table. (AD_Task / AD_Task_Access and the AD_CtxHelp_ID link columns come with seed + hashed patch; K1 still judges them, the twin DB is what must equal legacy.)
//   K1 after ad_ctxhelp_overlay.js ensure(): each of the 6 tables' columns == legacy's information_schema list and its row count == legacy's count; each legacy table with
//      AD_CtxHelp_ID that the seed has carries the column. ORACLE = legacy Postgres read HERE (docker exec postgres psql), never the rows file; unreachable -> INCONCLUSIVE.
//   K2 idempotent: a second ensure() adds 0 rows, 0 tables, 0 columns, and no key repeats.
//   K3 end of the chain, the REAL page (idempiere.html, GardenAdmin): the menu entry "Context Help" opens window 200034 and its first tab shows legacy's row (its name).
//   K5 the Team BASE does not move: the seed + its two hashed patches hash (team_sync.js hashBase manifest, rebuilt here) the same on this tree as on origin/main.
// Reds: CTX_BREAK=nomsg (the rows file without its ad_ctxhelpmsg row) -> K1 FAIL; CTX_BREAK=patch (one line appended to the hashed patch) -> K5 FAIL; CTX_BREAK=nooverlay (page without the overlay) -> K3 FAIL.
// Run: node erp/tests/witness_ctxhelp_overlay.js   Env: CTX_BREAK=nomsg|patch|nooverlay  NOPAGE=1
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const ERP = path.join(__dirname, '..'), ROOT = path.join(ERP, '..'), BR = process.env.CTX_BREAK || '';
const H = require(path.join(ROOT, 'common', 'help', 'tests', '_hq.js'));
let initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js')); }
const LOGD = path.join(__dirname, 'logs'); fs.mkdirSync(LOGD, { recursive: true });
const LOGF = path.join(LOGD, 'w_ctxhelp_overlay' + (BR ? '_break_' + BR : '') + '.log'); fs.writeFileSync(LOGF, '');
const out = (m) => { console.log(m); fs.appendFileSync(LOGF, m + '\n'); };
const K = { pass: 0, fail: 0, inc: 0 };
const chk = (n, ok, info) => { ok ? K.pass++ : K.fail++; out('  ' + (ok ? 'PASS' : 'FAIL') + ' ' + n + (info ? '  ' + info : '')); };
const incon = (id, why) => { K.inc++; out('§CTXHELP_OVERLAY INCONCLUSIVE ' + id + ' — ' + why); };
const L = (m) => out('§CTXHELP_OVERLAY ' + m);
const PG = (sql) => { const r = cp.spawnSync('docker', ['exec', 'postgres', 'psql', '-U', 'adempiere', '-d', 'idempiere', '-At', '-F', '|', '-c', 'set search_path=adempiere; ' + sql], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) return null; return r.stdout.split('\n').filter((x) => x && x !== 'SET'); };
const TABLES = ['ad_ctxhelp', 'ad_ctxhelpmsg', 'ad_ctxhelpmsg_trl', 'ad_ctxhelpsuggestion', 'ad_task', 'ad_task_access'];
const exec1 = (db, sql) => { const r = db.exec(sql); return r.length ? r[0].values : []; };
const colsOf = (db, t) => exec1(db, 'PRAGMA table_info("' + t + '")').map((v) => String(v[1]).toLowerCase());

function rowsData() {   // the overlay's data; CTX_BREAK=nomsg drops the ad_ctxhelpmsg row (the red)
  const D = JSON.parse(JSON.stringify(require(path.join(ERP, 'ad_ctxhelp_rows.js'))));
  if (BR === 'nomsg') D.rows = D.rows.filter((s) => !/^INSERT OR IGNORE INTO ad_ctxhelpmsg /.test(s));
  return D;
}
function baseHash(seedBuf, patchTexts) {   // team_sync.js:173-176 hashBase, rebuilt in node: seed sha256 + size, then each patch by position
  const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
  let man = 'seed ' + sha(seedBuf) + ' ' + seedBuf.length + '\n'; patchTexts.forEach((t, i) => { man += '--patch ' + i + (t == null ? ' MISSING' : '\n' + t) + '\n'; });
  return sha(Buffer.from(man, 'utf8'));
}

async function nodePart() {
  const SQL = await initSqlJs(), db = new SQL.Database(new Uint8Array(fs.readFileSync(H.SEED)));
  let ok = 0, bad = 0;
  fs.readFileSync(path.join(ERP, 'patches', 'ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach((st) => { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); ok++; } catch (e) { bad++; } });
  L('seed + patches/ad_seed.db.sql statements ok=' + ok + ' failed=' + bad + ' break=' + (BR || 'none'));
  const before = TABLES.filter((t) => colsOf(db, t).length);
  L('before the overlay: tables present ' + before.length + ' of ' + TABLES.length + ' (' + (before.join(',') || 'none') + ')');
  const O = require(path.join(ERP, 'ad_ctxhelp_overlay.js')), D = rowsData();
  global.AD_CTXHELP_ROWS = D;
  const lg = console.log; let line = ''; console.log = (m) => { line = String(m); }; const r1 = O.ensure(db); console.log = lg; L('first ' + line);
  // K1 against legacy, read here
  const legacyCols = PG("select table_name, string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema='adempiere' and table_name in ('" + TABLES.join("','") + "') group by 1");
  if (!legacyCols) incon('K1', 'legacy Postgres unreachable (docker exec postgres)');
  else {
    const lc = {}; legacyCols.forEach((x) => { const p = x.split('|'); lc[p[0]] = p[1]; });
    let colOk = 0, cntOk = 0; const miss = [];
    TABLES.forEach((t) => {
      const mine = colsOf(db, t).join(','), want = lc[t] || '';
      if (mine === want && want) colOk++; else miss.push(t + ' columns differ');
      const lcnt = Number((PG('select count(*) from ' + t) || ['-1'])[0]), tcnt = Number(exec1(db, 'SELECT count(*) FROM ' + t)[0][0]);
      L('K1 ' + t + ' columns=' + colsOf(db, t).length + ' legacy=' + want.split(',').length + ' rows twin=' + tcnt + ' legacy=' + lcnt);
      if (lcnt === tcnt && lcnt >= 0) cntOk++; else miss.push(t + ' rows ' + tcnt + ' != legacy ' + lcnt);
    });
    const linkT = PG("select table_name from information_schema.columns where table_schema='adempiere' and column_name='ad_ctxhelp_id' and table_name not in ('" + TABLES.join("','") + "') order by 1") || [];
    const seedHas = linkT.filter((t) => colsOf(db, t).length), linkOk = seedHas.filter((t) => colsOf(db, t).indexOf('ad_ctxhelp_id') >= 0);
    L('K1 link column ad_ctxhelp_id: legacy tables ' + linkT.length + ', in the seed ' + seedHas.length + ', carry it ' + linkOk.length + ' (' + seedHas.filter((t) => linkOk.indexOf(t) < 0).join(',') + ' missing)');
    chk('K1 the overlay is legacy\'s: columns ' + colOk + ' of 6, row counts ' + cntOk + ' of 6, link column ' + linkOk.length + ' of ' + seedHas.length, colOk === 6 && cntOk === 6 && seedHas.length > 0 && linkOk.length === seedHas.length, miss.join(' ; '));
  }
  // K2 idempotent
  console.log = (m) => { line = String(m); }; const r2 = O.ensure(db); console.log = lg; L('second ' + line);
  const keys = D.tables.map((T) => { const n = Number(exec1(db, 'SELECT count(*) FROM ' + T.t)[0][0]), d = Number(exec1(db, 'SELECT count(*) FROM (SELECT DISTINCT ' + T.pk.join(',') + ' FROM ' + T.t + ')')[0][0]); return { t: T.t, n, d }; });
  const dup = keys.filter((x) => x.n !== x.d);
  chk('K2 a second ensure adds nothing: rows=' + r2.rows + ' tables=' + r2.tables + ', key repeats in ' + dup.length + ' of ' + keys.length + ' tables (first run added rows=' + r1.rows + ')',
    r2.rows === 0 && r2.tables === 0 && dup.length === 0 && r1.rows > 0, dup.map((x) => x.t).join(','));
  // K5 the team base
  const seedBuf = fs.readFileSync(H.SEED), pt = (rel) => fs.readFileSync(path.join(ERP, 'patches', rel), 'utf8');
  const mainT = (rel) => { try { return cp.execSync('git show origin/main:erp/patches/' + rel, { cwd: ROOT, maxBuffer: 1 << 26, encoding: 'utf8' }); } catch (e) { return null; } };
  const mineP = [pt('ad_seed.db.sql') + (BR === 'patch' ? '\n-- one appended line\n' : ''), pt('mfg.sql')], mainP = [mainT('ad_seed.db.sql'), mainT('mfg.sql')];
  if (mainP[0] == null) incon('K5', 'origin/main not readable');
  else { const a = baseHash(seedBuf, mineP), b = baseHash(seedBuf, mainP); L('K5 team base this tree=' + a.slice(0, 12) + ' origin/main=' + b.slice(0, 12)); chk('K5 the Team BASE hash does not move (seed + hashed patches == origin/main\'s)', a === b); }
}

async function pagePart() {
  const over = BR === 'nooverlay' ? { '/erp/ad_ctxhelp_rows.js': path.join(require('os').tmpdir(), 'ctx_empty_' + process.pid + '.js') } : null;
  if (over) fs.writeFileSync(over['/erp/ad_ctxhelp_rows.js'], '');
  const want = PG("select name from ad_ctxhelp order by ad_ctxhelp_id");
  const P = await H.erpPage(null, over);
  try {
    L('page chromium ' + P.version + ' ' + (P.logs.filter((l) => l.indexOf('§CTXHELP_OVERLAY') === 0).pop() || 'no §CTXHELP_OVERLAY line'));
    const scope = P.logs.filter((l) => l.indexOf('§IDMP-SESSION scopeMenu') === 0).pop(); L('page ' + (scope || 'no scopeMenu line'));
    const n0 = P.logs.length, row = await P.pg.evaluate(() => { const r = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="200038"]'); if (r) r.click(); return !!r; });   // the menu's own handler (W-HQ-MENU-LEAVES M4 way)
    if (!row) { incon('K3', 'menu entry 200038 "Context Help" not on the role\'s menu'); return; }
    // a high-volume table opens legacy's Find window first (§UDP4-INITIAL findFirst=true); it says "Records = N", then OK shows the rows, as a user does
    let findTxt = ''; for (let i = 0; i < 20 && !findTxt; i++) { await P.pg.waitForTimeout(250); findTxt = await P.pg.evaluate(() => { const o = document.querySelector('#idmp-find-ov'); return o ? o.innerText : ''; }); }
    const recs = (/Records = (\d+)/.exec(findTxt) || [])[1]; L('K3 find window ' + (findTxt ? 'open, Records = ' + recs : 'not shown'));
    if (findTxt) await P.pg.evaluate(() => document.querySelector('#idmp-find-ov [data-find-ok]').click());
    // a single-row tab shows the name in an input box (innerText has no values), so the values are read too
    let txt = ''; for (let i = 0; i < 40; i++) { await P.pg.waitForTimeout(250); txt = await P.pg.evaluate(() => document.body.innerText + '\n' + Array.from(document.querySelectorAll('input,textarea')).map((e) => e.value).join('\n')); if (want && want.every((w) => txt.indexOf(w) >= 0)) break; }
    const opened = P.logs.slice(n0).filter((l) => l.indexOf('§IDEMPIERE window=') === 0).join(' | ');
    L('K3 ' + (opened || 'no §IDEMPIERE window line') + ' legacy names=' + JSON.stringify(want));
    if (!want || !want.length) incon('K3', 'legacy Postgres unreachable or no ad_ctxhelp row');
    else chk('K3 the Context Help window opens on the twin and shows legacy\'s ' + want.length + ' row(s): ' + want.filter((w) => txt.indexOf(w) >= 0).length + ' of ' + want.length + ' names on screen', /\(200034\)/.test(opened) && want.every((w) => txt.indexOf(w) >= 0));
    if (P.errs.length) L('page errors: ' + P.errs.slice(0, 3).join(' | '));
  } finally { await P.close(); if (over) fs.unlinkSync(over['/erp/ad_ctxhelp_rows.js']); }
}

(async function main() {
  if (!H.seedOk()) { incon('ALL', 'no usable ad_seed.db (an LFS stub?)'); }
  else { await nodePart(); if (!process.env.NOPAGE) await pagePart(); }
  const v = K.fail ? 'FAIL' : (K.inc || !K.pass ? 'INCONCLUSIVE' : 'PASS');
  out('§WITNESS_CTXHELP_OVERLAY pass=' + K.pass + ' fail=' + K.fail + ' inconclusive=' + K.inc + ' verdict=' + v + (BR ? ' CTX_BREAK=' + BR : ''));
  process.exitCode = v === 'PASS' ? 0 : 1;
})().catch((e) => { out('ERROR ' + (e && e.stack || e)); process.exitCode = 2; });
