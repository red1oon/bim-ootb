#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC (W-ERP-VERBS)
// Spec: bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §21.7. Read the log after every run.
// SCOPE: prove scripts/gen_erp_verbs.js counts the ERP verbs from the dictionary and lists every handler,
//        and that the committed internal/ERP_VERBS.md is current. Each case names the issue it proves:
//   EV1 N is hand-made / miscounted — tables, DocAction values, active processes by plain SQL (sqlite3 CLI,
//                                     not the generator's sql.js reader) equal the generator
//   EV2 a handler is missing         — every K.register( and registerHandler(' site found by an independent
//                                     line grep outside tests/ is a listed site/classname or declared dynamic
//   EV3 stale file                   — regenerating gives the committed bytes, twice
//   EV4 vacuous                      — an empty dictionary gives INCONCLUSIVE (exit 2), never PASS
//   EV5 falsifier                    — EV_BREAK=1 (generator drops one DocAction value) must fail EV1
//   EV6 X is invented                — X = 0 while erp/actor_verbs.json does not exist
// Run: node tests/witness_erp_verbs.js — exit 0 = pass.
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.resolve(__dirname, '..');
const GEN = path.join(ROOT, 'scripts/gen_erp_verbs.js');
const IDX = path.join(ROOT, 'internal/ERP_VERBS.md');
const DB = path.join(ROOT, 'erp/ad_seed.db');

let fail = 0, inconclusive = 0;
const ok = (id, cond, msg) => { console.log(`§W-ERP-VERBS ${cond ? 'PASS' : 'FAIL'} ${id} — ${msg}`); if (!cond) fail++; };
const inc = (id, msg) => { inconclusive++; console.log(`§W-ERP-VERBS INCONCLUSIVE ${id} — ${msg}`); };
const gen = (args, env) => spawnSync('node', [GEN, ...args], { encoding: 'utf8', env: { ...process.env, ...(env || {}) } });
const genJson = (env, args) => { const r = gen(['--json', ...(args || [])], env); if (r.status !== 0) throw new Error('generator exit ' + r.status + ': ' + r.stdout + r.stderr); return JSON.parse(r.stdout); };
const sql = (db, q) => { const r = spawnSync('sqlite3', ['-readonly', db, q], { encoding: 'utf8' }); if (r.error || r.status !== 0) return null; return r.stdout.trim(); };

if (sql(DB, 'select 1') === null) { inc('EV0', 'sqlite3 CLI or erp/ad_seed.db unavailable: the independent count cannot run (nothing judged)'); console.log('§W-ERP-VERBS verdict=INCONCLUSIVE fail=0 inconclusive=1'); process.exit(1); }

const J = genJson();
// ── EV1: independent plain-SQL counts ──
const iTables = +sql(DB, "select count(distinct t.tablename) from AD_Column c join AD_Table t on t.AD_Table_ID=c.AD_Table_ID where lower(c.columnname)='docaction'");
const iActions = +sql(DB, "select count(*) from AD_Ref_List where AD_Reference_ID=135 and value<>'--'");
const iProcAct = +sql(DB, "select count(*) from ad_process where isactive='Y'");
const iProcAll = +sql(DB, 'select count(*) from ad_process');
if (!iTables || !iActions || !iProcAct) inc('EV1', `empty independent population tables=${iTables} actions=${iActions} procs=${iProcAct}`);
else {
  const good = J.tables.length === iTables && J.actions.length === iActions && J.procActive === iProcAct && J.procInactive === iProcAll - iProcAct && J.N === iTables * iActions + iProcAct;
  ok('EV1', good, `SQL tables=${iTables} actions=${iActions} active procs=${iProcAct} (inactive ${iProcAll - iProcAct}) → N=${iTables * iActions + iProcAct}; generator tables=${J.tables.length} actions=${J.actions.length} procs=${J.procActive} N=${J.N}`);
}
// ── EV2: independent line grep of registration sites ──
const SKIP = /\/(lib|node_modules|archive|tests|\.git|docs)(\/|$)|\.min\./;
const grepK = [], grepP = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (SKIP.test(p + (e.isDirectory() ? '/' : ''))) continue;
    if (e.isDirectory()) { walk(p); continue; }
    if (!/\.(js|mjs|html)$/.test(e.name)) continue;
    const rp = path.relative(ROOT, p);
    fs.readFileSync(p, 'utf8').split('\n').forEach((l, i) => {
      if (/^\s*(\/\/|\*)/.test(l)) return;
      const code = l.replace(/\/\/.*$/, '');
      if (/\b(?:K|Kernel|ERPKernel)\.register\(/.test(code)) grepK.push(rp + ':' + (i + 1));
      if (/\/ad_process\.js$|\/plugins\//.test('/' + rp)) { const m = /registerHandler\('([^']+)'/.exec(code); if (m) grepP.push(m[1]); }
    });
  }
})(path.join(ROOT, 'erp'));
const genK = J.handlerSites.slice().sort(), gk = grepK.slice().sort();
const genP = J.procLits.map(x => x[0]).sort(), gp = [...new Set(grepP)].sort();
const kOk = genK.join() === gk.join() && grepK.length > 0, pOk = genP.join() === gp.join() && gp.length > 0;
if (!grepK.length || !gp.length) inc('EV2', `empty grep population K=${grepK.length} P=${gp.length}`);
else ok('EV2', kOk && pOk && J.unresolved.length === 0, `K.register sites grep ${grepK.length} generator ${genK.length}; registerHandler classnames grep ${gp.length} generator ${genP.length}; unresolved ${J.unresolved.length}` +
  (kOk ? '' : ` grep-only=[${gk.filter(x => !genK.includes(x)).join(' ')}] gen-only=[${genK.filter(x => !gk.includes(x)).join(' ')}]`) + (pOk ? '' : ` grep-only=[${gp.filter(x => !genP.includes(x)).join(' ')}] gen-only=[${genP.filter(x => !gp.includes(x)).join(' ')}]`));
// ── EV3: committed file current, twice ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-'));
const o1 = path.join(tmp, 'a.md'), o2 = path.join(tmp, 'b.md');
gen(['--out', o1]); gen(['--out', o2]);
const committed = fs.existsSync(IDX) ? fs.readFileSync(IDX, 'utf8') : '';
const f1 = fs.readFileSync(o1, 'utf8'), f2 = fs.readFileSync(o2, 'utf8');
ok('EV3', f1 === f2 && f1 === committed, `two runs identical=${f1 === f2}, committed internal/ERP_VERBS.md current=${f1 === committed}` + (f1 === committed ? '' : ' (run node scripts/gen_erp_verbs.js)'));
// ── EV4: empty dictionary → INCONCLUSIVE, exit 2, never PASS ──
const edb = path.join(tmp, 'empty.db');
const mk = spawnSync('sqlite3', [edb, 'create table AD_Ref_List(value, name, AD_Reference_ID); create table AD_Column(columnname, AD_Table_ID); create table AD_Table(AD_Table_ID, tablename); create table ad_process(ad_process_id, value, name, classname, isreport, isactive);'], { encoding: 'utf8' });
if (mk.status !== 0) inc('EV4', 'could not build the empty dictionary');
else {
  // the generator needs a real SQLite header; an empty-schema DB file has none until a table exists, which it now does
  const r = gen(['--db', edb, '--out', path.join(tmp, 'e.md')]);
  ok('EV4', r.status === 2 && /INCONCLUSIVE|VACUOUS/.test(r.stdout) && !/ PASS/.test(r.stdout), `empty dictionary → exit ${r.status}, output "${r.stdout.trim().slice(0, 90)}"`);
}
// ── EV5: falsifier ──
if (process.env.EV_BREAK !== '1') {
  const B = genJson({ EV_BREAK: '1' });
  ok('EV5', !(B.actions.length === iActions && B.N === iTables * iActions + iProcAct), `EV_BREAK=1 generator lists ${B.actions.length} DocActions (SQL ${iActions}), N=${B.N} (SQL ${iTables * iActions + iProcAct}) → EV1 would ${B.actions.length === iActions ? 'PASS (witness blind)' : 'FAIL (caught)'}`);
}
// ── EV6: X ──
const av = path.join(ROOT, 'erp/actor_verbs.json');
ok('EV6', fs.existsSync(av) ? J.X > 0 : J.X === 0, `erp/actor_verbs.json ${fs.existsSync(av) ? 'exists' : 'absent'}; X=${J.X}`);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(J.summary);
const verdict = fail ? 'FAIL' : inconclusive ? 'INCONCLUSIVE' : 'PASS';
console.log(`§W-ERP-VERBS verdict=${verdict} fail=${fail} inconclusive=${inconclusive}`);
process.exit(fail || inconclusive ? 1 : 0);
