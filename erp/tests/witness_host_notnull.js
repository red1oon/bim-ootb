#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HOST-NOTNULL (bim-ootb prompts/CAPEX_DASHBOARD.md §5.74, G2b). READ THE LOG after every run: every verdict is a §-line, the exit code is not evidence.
// THE ISSUE it proves/disproves: a window Save wrote a row legacy's DATABASE refuses (NOT NULL), because the host's commit seam never asked the rule (§5.73 put it in ModelLayer.save only).
//   Driven in the REAL idempiere.html (GardenWorld admin) through CrudOverlay's commit funnel (__crud.applyOp), the path every form / grid Save takes.
//   ORACLE = PostgreSQL itself: the same blank INSERT on the reference database in a rolled-back transaction; the expected column is the one Postgres names.
// Cases: H1 X of N tab tables, blank CREATE · H2 UPDATE to null · H3 the columns the form's own IsMandatory check cannot protect.
// Break (must FAIL): HOSTNN_BREAK=nogate HOSTNN_LIMIT=40 - the page is served crud_overlay.js with the gate call removed (LIMIT: every blank row is then committed, which is slow).
// Needs the `postgres` container (database `idempiere`) and playwright; without Postgres the verdict is INCONCLUSIVE, never PASS.
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..'), BREAK = process.env.HOSTNN_BREAK || '', PGDB = process.env.NOTNULL_PGDB || 'idempiere';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png' };
const log = m => console.log(m);
let judged = 0, fails = 0, inconc = 0;
const ck = (n, ok, i) => { judged++; if (!ok) fails++; log('  §HOST_NOTNULL ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (i !== undefined ? ' ' + JSON.stringify(i).slice(0, 900) : '')); };
const inc = (n, why) => { inconc++; log('  §HOST_NOTNULL ' + n + ' INCONCLUSIVE ' + why); };
const NNRE = /null value in column "([^"]+)" of relation "([^"]+)" violates not-null constraint/;
const GATE = "_hostNotNull(op, function (nn) { if (nn) { cb([], nn); return; } _modelAfterSaveGated(op, db, cb); });";
const srv = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]), f = path.join(ROOT, p);
  fs.stat(f, (e, s) => { if (e || s.isDirectory()) { r.writeHead(404); r.end(); return; }
    if (BREAK === 'nogate' && /\/crud_overlay\.js$/.test(p)) { const src = fs.readFileSync(f, 'utf8'); if (src.indexOf(GATE) < 0) { r.writeHead(500); r.end(); return; } const b = Buffer.from(src.replace(GATE, '_modelAfterSaveGated(op, db, cb);')); r.writeHead(200, { 'Content-Type': 'text/javascript', 'Content-Length': b.length }); r.end(b); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Content-Length': s.size }); fs.createReadStream(f).pipe(r); }); });
const psqlErr = sql => cp.spawnSync('bash', ['-c', 'docker exec -i postgres psql -U postgres -d ' + PGDB + ' -tA 2>&1 >/dev/null'], { input: sql, encoding: 'utf8', maxBuffer: 1 << 28 }).stdout;
const psqlOut = sql => cp.spawnSync('docker', ['exec', '-i', 'postgres', 'psql', '-U', 'postgres', '-d', PGDB, '-tA', '-F', '|'], { input: sql, encoding: 'utf8', maxBuffer: 1 << 28 });

(async () => {
  const live = psqlOut("select c.table_name, c.column_name from information_schema.columns c join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name where c.table_schema='adempiere' and t.table_type='BASE TABLE' order by 1, c.ordinal_position");
  const PG = live.status === 0 && live.stdout.trim().length > 0, pgCols = {};
  if (PG) live.stdout.trim().split('\n').forEach(l => { const p = l.split('|'); (pgCols[p[0]] = pgCols[p[0]] || []).push(p[1]); });
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const pg = await (await browser.newContext({ viewport: { width: 1440, height: 810 } })).newPage();
  const errs = [], hostLines = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { const t = m.text(); if (/§HOST-NOTNULL/.test(t)) hostLines.push(t); });
  await pg.goto('http://localhost:' + srv.address().port + '/erp/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
  await pg.waitForFunction(() => !!window.__idmpDb, null, { timeout: 30000 });
  await pg.waitForFunction(() => document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0);
  await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await pg.waitForSelector('#idmp-login-step1:visible');
  await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await pg.waitForSelector('#idmp-login-step2:visible'); await pg.click('#idmp-login-ok');
  await pg.waitForFunction(() => document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0);
  const seed = sql => pg.evaluate(s => { const r = window.__idmpDb.exec(s); return r.length ? r[0].values : []; }, sql);
  const listLoaded = await pg.evaluate(() => !!window.AD_DDL_NOTNULL && typeof window.ModelLayer.notNullError === 'function' && !!(window.__crud && window.__crud.applyOp));
  const tabs = (await seed("SELECT DISTINCT lower(t.TableName) FROM AD_Tab b JOIN AD_Window w ON w.AD_Window_ID=b.AD_Window_ID AND w.IsActive='Y' JOIN AD_Table t ON t.AD_Table_ID=b.AD_Table_ID WHERE b.IsActive='Y' AND t.IsView='N' ORDER BY 1")).map(r => r[0]);
  const phys = {}; (await seed("SELECT lower(name) FROM sqlite_master WHERE type='table'")).forEach(r => { phys[r[0]] = 1; });
  let pop = tabs.filter(t => phys[t] && pgCols[t]);
  if (process.env.HOSTNN_LIMIT) pop = pop.slice(0, Number(process.env.HOSTNN_LIMIT));   // the break run: with the gate removed every blank row is COMMITTED (slow); a slice is enough to fail
  log('§HOST_NOTNULL_DATA postgres=' + (PG ? PGDB : 'ABSENT') + ' list_and_gate_loaded=' + listLoaded + ' tab_tables=' + tabs.length + ' physical_here=' + tabs.filter(t => phys[t]).length + ' population=' + pop.length + (BREAK ? ' (HOSTNN_BREAK=' + BREAK + ': not PASS expected)' : ''));
  const opsCount = async () => pg.evaluate(() => new Promise(res => { try { window.__crud.withTipQuery ? res(null) : res(null); } catch (e) { res(null); } }));
  void opsCount;
  // the commit funnel, one op at a time; answers { ok, error } or { timeout }
  const apply = op => pg.evaluate(o => new Promise(res => { const t = setTimeout(() => res({ timeout: true }), 15000); o._onDone = r => { clearTimeout(t); res(r || {}); }; window.__crud.applyOp(o, null); }), op);
  const std = await pg.evaluate(() => ({ actor: window.APP.actor, clientId: window.APP.clientId, orgId: window.APP.orgId != null ? window.APP.orgId : 0 }));

  const isKey = {}; (await seed("SELECT lower(t.TableName), lower(c.ColumnName) FROM AD_Column c JOIN AD_Table t ON t.AD_Table_ID=c.AD_Table_ID WHERE c.IsKey='Y' AND c.IsActive='Y'")).forEach(r => { if (/_id$/.test(r[1])) isKey[r[0] + '.' + r[1]] = 1; });
  // H1 — X of N tab tables: a blank CREATE; the host's answer == the column Postgres names
  if (!PG) inc('H1', 'postgres container not reachable');
  else if (!pop.length) inc('H1', 'empty population');
  else {
    let sql = '';
    pop.forEach(t => { const numbered = !/^(m_attributeinstance|ad_tableattribute|ad_sysconfig)$|^t_/.test(t), cols = [], vals = [];
      pgCols[t].forEach(c => {
        if (c === t + '_uu') { cols.push(c); vals.push("'a0000000-0000-4000-8000-0000000000ab'"); }
        else if (isKey[t + '.' + c]) { cols.push(c); vals.push('999999991'); }   // PO assigns the key only for an IsKey column ending _ID (PO.java:3523-3528)
        else if (c === 'created' || c === 'updated') { cols.push(c); vals.push('now()'); }
        else if (c === 'createdby' || c === 'updatedby') { cols.push(c); vals.push('100'); }
        else if (c === 'ad_client_id' || c === 'ad_org_id') { cols.push(c); vals.push('11'); }
        else if (c === 'isactive') { cols.push(c); vals.push("'Y'"); }
        else if ((c === 'value' && numbered) || c === 'documentno') { cols.push(c); vals.push("'W-HNN-1'"); }   // PO.saveNew numbers them (PO.java:3563-3605)
      });
      sql += '\\warn §T ' + t + '\nBEGIN;\nINSERT INTO adempiere.' + t + (cols.length ? ' (' + cols.map(c => '"' + c + '"').join(',') + ') VALUES (' + vals.join(',') + ')' : ' DEFAULT VALUES') + ';\nROLLBACK;\n'; });
    const want = {}; let cur = null; psqlErr(sql).split('\n').forEach(l => { const m = /^§T (\S+)/.exec(l); if (m) { cur = m[1]; want[cur] = { col: null, other: null }; return; } if (!cur) return; const n = NNRE.exec(l); if (n) want[cur].col = n[1]; else if (/^ERROR:/.test(l) && !want[cur].other) want[cur].other = l.slice(0, 100); });
    let X = 0, N = 0, bothAccept = 0, refusedSame = 0; const bad = [], refusedCols = {};
    for (const t of pop) {
      const r = await apply({ op_type: 'CRUD_CREATE', key: t, table: t, verb: 'create', id: null, fields: {}, cas: null, op_uuid: null, stdDefaults: std });
      const got = r.timeout ? '(no answer)' : r.ok ? null : ((NNRE.exec(String(r.error || '')) || [])[1] || '(other: ' + String(r.error).slice(0, 80) + ')'), w = want[t];
      N++; if (!w) { bad.push({ t, pg: 'no answer' }); continue; }
      if (got === w.col) { X++; if (got == null) bothAccept++; else { refusedSame++; refusedCols[t + '.' + got] = 1; } } else bad.push({ t, host: got, pg: w.col, pgOther: w.other });
    }
    log('§HOST_NOTNULL_H1 tables=' + N + ' equal=' + X + ' both_refuse_same_column=' + refusedSame + ' both_accept=' + bothAccept + ' host_refusal_lines=' + hostLines.filter(l => /refused:/.test(l)).length);
    if (!refusedSame && !bad.length) inc('H1', 'no table refused on either side: nothing judged');
    else ck('H1 blank new record through the commit funnel: the host names the column Postgres names, ' + X + ' of ' + N + ' tab tables', X === N, { bad: bad.length, first: bad.slice(0, 8) });

    // H3 — the columns the form's own mandatory check cannot protect (NOT NULL in the DB, no default, AD_Column.IsMandatory<>'Y')
    const L = await pg.evaluate(() => window.AD_DDL_NOTNULL || {}), notMand = {};
    (await seed("SELECT lower(t.TableName), lower(c.ColumnName) FROM AD_Column c JOIN AD_Table t ON t.AD_Table_ID=c.AD_Table_ID WHERE c.IsActive='Y' AND c.IsMandatory<>'Y' AND c.ColumnSQL IS NULL")).forEach(r => { notMand[r[0] + '.' + r[1]] = 1; });
    const unprot = []; pop.forEach(t => String(L[t] || '').split(',').forEach(c => { if (c && !/\*$/.test(c) && notMand[t + '.' + c]) unprot.push(t + '.' + c); }));
    // each target: a CREATE that fills every other enforceable NOT NULL column, so the target is the first one left null (refused: nothing is sealed)
    const targets = unprot.filter(k => { const [t, c] = k.split('.'); return !isKey[k] && c !== t + '_uu' && c !== 'value' && c !== 'documentno'; });
    let hx = 0; const hbad = [];
    for (const k of targets) { const [t, c] = k.split('.');
      const fields = await pg.evaluate(a => { const ML = window.ModelLayer, out = {}; String(window.AD_DDL_NOTNULL[a.t] || '').split(',').forEach(x => { x = x.replace(/\*$/, ''); if (x && x !== a.c) out[x] = /^(is|processed|posted)/.test(x) ? 'N' : /date|created|updated|valid/.test(x) ? '2026-01-01 00:00:00' : 1; }); void ML; return out; }, { t, c });
      const r = await apply({ op_type: 'CRUD_CREATE', key: t, table: t, verb: 'create', id: null, fields: fields, cas: null, op_uuid: null, stdDefaults: std });
      const got = r.timeout ? '(no answer)' : r.ok ? null : ((NNRE.exec(String(r.error || '')) || [])[1] || String(r.error).slice(0, 80));
      if (got === c) hx++; else hbad.push({ k, got }); }
    log('§HOST_NOTNULL_H3 form_unprotected_columns=' + unprot.length + ' targets=' + targets.length + ' refused_naming_the_target=' + hx + ' all=' + JSON.stringify(unprot));
    if (!targets.length) inc('H3', 'no column NOT NULL in the DB that the form\'s IsMandatory check leaves unmarked'); else ck('H3 a NOT NULL column the form\'s IsMandatory check does not mark is refused at the commit, ' + hx + ' of ' + targets.length + ' columns', hx === targets.length, { bad: hbad });
  }

  // H2 — UPDATE: a stored row's NOT NULL column set to null is refused; a nullable column is not
  const bp = (await seed("SELECT C_BPartner_ID, Name FROM C_BPartner WHERE AD_Client_ID=11 AND IsActive='Y' ORDER BY C_BPartner_ID LIMIT 1"))[0];
  if (!bp) inc('H2', 'no business partner row');
  else {
    const u1 = await apply({ op_type: 'CRUD_UPDATE', key: 'c_bpartner', table: 'c_bpartner', verb: 'update', id: bp[0], changes: { name: { old: bp[1], new: null } }, op_uuid: null });
    const u2 = await apply({ op_type: 'CRUD_UPDATE', key: 'c_bpartner', table: 'c_bpartner', verb: 'update', id: bp[0], changes: { description: { old: null, new: 'W-HOST-NOTNULL' } }, op_uuid: null });
    ck('H2 UPDATE C_BPartner.Name to null is refused with the DB text; updating Description is not', u1.ok === false && /null value in column "name" of relation "c_bpartner"/.test(String(u1.error)) && u2.ok === true, { u1: u1, u2: u2 });
  }
  if (errs.length) ck('no page error', false, errs.slice(0, 3));
  await browser.close(); srv.close();
  const v = fails ? 'FAIL' : inconc ? 'INCONCLUSIVE' : 'PASS';
  log('§HOST_NOTNULL_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails + ' inconclusive=' + inconc + (BREAK ? ' (HOSTNN_BREAK=' + BREAK + ': not PASS expected)' : ''));
  process.exit(v === 'PASS' ? 0 : v === 'FAIL' ? 1 : 2);
})().catch(e => { log('§HOST_NOTNULL_VERDICT FAIL harness ' + (e && e.stack || e)); process.exit(1); });
