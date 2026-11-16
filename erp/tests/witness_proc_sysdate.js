#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-PROC-SYSDATE (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md A3-CLOCK-1 SPEC; bim-ootb #3145).
// Read the log after every run: exit code is not evidence. Verdict line: §PROC_SYSDATE checks= failed= verdict=PASS|FAIL|INCONCLUSIVE.
// ISSUE THIS PROVES OR DISPROVES: "inside a Java process the twin's SYSDATE (getdate()) is the UTC wall clock, the page's SQL clock stays frozen at the
//   process's instant afterwards, and TimeUtil.getDay(null) / Env.getContextAsDate(empty) take the UTC day". Legacy: the server's LOCAL clock
//   (TimeUtil.java:61, Env.java:989, PostgreSQL now() in the session's zone).
// POPULATION: the seed company (client 11, ws_kernel K.load()), a REAL InventoryCountCreate run (process 105, QtyRange '=', its "null storage" INSERT with
//   getDate()/trunc(getdate()), InventoryCountCreate.js:44) on a new M_Inventory, at TZ=Asia/Kuala_Lumpur with the clock fixed at 2026-11-13 00:30 local
//   (16:30Z the day before: the only hour where the UTC defect shows as a different DAY).
// RED CONTROL: OOTB=<a main worktree> must FAIL S1, S2, S3 (the defect). UTC proves nothing (both trees agree there): run it at +08.
// INCONCLUSIVE when the process inserted 0 storage rows (nothing judged).
// Command: node erp/tests/witness_proc_sysdate.js            (OOTB=<tree> to judge another checkout's erp/)
'use strict';
process.env.TZ = process.env.TZ || 'Asia/Kuala_Lumpur';
const path = require('path');
const ROOT = process.env.OOTB ? path.resolve(process.env.OOTB) : path.join(__dirname, '..', '..'), ERP = path.join(ROOT, 'erp');
const say = s => process.stdout.write(s + '\n');

// a settable fixed clock, installed BEFORE any kernel code loads (as witness_replay_clock.js fixClock does)
const Real = Date; let NOW = new Real(2026, 10, 13, 0, 30, 0).getTime(), tick = 0;
class FixedDate extends Real { constructor(...a) { if (a.length === 0) super(NOW + (tick++)); else super(...a); } static now() { return NOW + (tick++); } }
global.Date = FixedDate;
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;

const checks = []; const check = (id, name, ok, detail) => { checks.push({ id, ok }); say('  ' + (ok ? '✅' : '❌') + ' ' + id + ' ' + name + (detail ? ' — ' + detail : '')); };
const SESSION = { clientId: 11, orgId: 11, userId: 100, roleId: 102, warehouseId: 0 };

(async function () {
  say('§PROC_SYSDATE_RUN tree=' + ROOT + ' tz=' + process.env.TZ + ' clock=' + new Real(NOW).toString());
  const quiet = console.log; console.log = function () {};
  const K = require(path.join(ERP, 'ws_kernel.js')), k = await K.load(), AP = require(path.join(ERP, 'ad_process.js')), A = require(path.join(ERP, 'ad_callout.js'));
  A.bind(function (sql, p) { return k.q(sql, p); });          // the page's own binding (crud_overlay.js:428 binds this way: no clock of its own)
  console.log = quiet;
  const q = k.q, ML = k.ML;

  // S1: a REAL process. A warehouse whose default locator lacks storage for some stocked item product, so the "null storage" INSERT has rows to write.
  const wh = q("SELECT l.m_warehouse_id AS id, COUNT(*) AS n FROM m_locator l JOIN m_product p ON p.ad_client_id=l.ad_client_id WHERE l.ad_client_id=11 AND l.isdefault='Y' AND p.isactive='Y' AND p.isstocked='Y' AND p.producttype='I' " +
    "AND NOT EXISTS (SELECT 1 FROM m_storageonhand s JOIN m_locator sl ON sl.m_locator_id=s.m_locator_id WHERE sl.m_warehouse_id=l.m_warehouse_id AND s.m_product_id=p.m_product_id) GROUP BY l.m_warehouse_id ORDER BY n DESC")[0];
  const dt = q("SELECT c_doctype_id AS id FROM c_doctype WHERE ad_client_id=11 AND docbasetype='MMI' AND isactive='Y' ORDER BY c_doctype_id")[0];
  const before = q('SELECT COALESCE(MAX(rowid),0) AS r FROM m_storageonhand')[0].r;
  let run = { ok: false, error: 'no warehouse with missing storage' };
  if (wh && dt) {
    // the header is committed first: inside its own trx the new row's id is still a pending '#new:n' the process cannot read
    const H = k.inTrx(SESSION, { ws: 'a3:inventory' }, trx => {
      const sv = ML.save(trx, 'm_inventory', null, ML.newPO(trx, 'm_inventory', { ad_org_id: 11, m_warehouse_id: wh.id, c_doctype_id: dt.id, movementdate: '2026-11-13 00:00:00' }));
      return { ok: !!sv.ok, error: sv.ok ? null : 'save m_inventory: ' + sv.error };
    });
    const inv = H.ok ? q('SELECT m_inventory_id AS id FROM m_inventory WHERE ad_client_id=11 AND m_warehouse_id=? ORDER BY rowid DESC LIMIT 1', [wh.id])[0] : null;
    run = !inv ? { ok: false, error: H.error || 'header not found' } : k.inTrx(SESSION, { ws: 'a3:inventorycount' }, trx => {
      const r = AP.runInTrx(trx, 105, { recordId: inv.id, tableId: 321, params: { QtyRange: '=' } });
      return { ok: !!(r && r.ok), error: r && r.ok ? null : (r && (r.summary || r.msg || r.error)) };
    });
  }
  const rows = q('SELECT ad_client_id, isactive, m_locator_id, m_product_id, qtyonhand, m_storageonhand_uu, created, updated, datematerialpolicy FROM m_storageonhand WHERE rowid > ? ORDER BY rowid', [before]);
  say('§PROC_SYSDATE_S1 wh=' + (wh && wh.id) + ' missing=' + (wh && wh.n) + ' run=' + JSON.stringify({ ok: run.ok, error: run.error || null }) + ' inserted=' + rows.length + ' first=' + JSON.stringify(rows[0] || null));
  const inconclusive = rows.length === 0;
  const bad = rows.filter(r => !/^2026-11-13 00:3\d:\d\d/.test(String(r.created)) || !/^2026-11-13 00:3\d:\d\d/.test(String(r.updated)) || String(r.datematerialpolicy).slice(0, 10) !== '2026-11-13');
  // S0 (#3146): the columns are the SELECT's, by POSITION (legacy runs it in PostgreSQL): judged against the warehouse's default locators and the stocked item products, read independently
  if (!inconclusive) {
    const locs = new Set(q("SELECT m_locator_id AS id FROM m_locator WHERE m_warehouse_id=? AND isdefault='Y'", [wh.id]).map(r => r.id));
    const prods = new Set(q("SELECT m_product_id AS id FROM m_product WHERE ad_client_id=11 AND isactive='Y' AND isstocked='Y' AND producttype='I'").map(r => r.id));
    const v7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const off = rows.filter(r => !(Number(r.ad_client_id) === 11 && r.isactive === 'Y' && locs.has(Number(r.m_locator_id)) && prods.has(Number(r.m_product_id)) && Number(r.qtyonhand) === 0 && v7.test(String(r.m_storageonhand_uu))));
    check('S0', 'every inserted row holds the SELECT\'s values in the SELECT\'s column order (client 11, active, a default locator, a stocked item product, qty 0, a v7 uuid)', off.length === 0, 'rows=' + rows.length + ' off=' + off.length + (off[0] ? ' e.g. ' + JSON.stringify(off[0]) : ''));
  }
  if (!inconclusive) check('S1', 'every row a real InventoryCountCreate has Created/Updated = getDate() and DateMaterialPolicy = trunc(getdate()) in LOCAL time (2026-11-13 00:30 / 2026-11-13, not 2026-11-12 16:30 UTC)', bad.length === 0, 'rows=' + rows.length + ' bad=' + bad.length + (bad[0] ? ' e.g. ' + JSON.stringify(bad[0]) : ''));

  // S2: after a stand-alone process (the page's dispatch path: runJava with no caller trx), the page's SQL clock is the live clock again, not frozen at the run.
  const T = () => String(new A.Timestamp(A.RUNTIME.now()));
  const pageBefore = T();
  try { AP.runJava(function (sql, p) { return k.q(sql, p); }, { client: 11, org: 11, user: 100, role: 102, date: '2026-11-13 00:00:00', now: '2026-11-13 00:30:00', nowMillis: NOW, uuid: () => 'x' }, { className: 'org.compiere.process.InventoryCountCreate', AD_Process_ID: 105, Record_ID: 0, params: {} }); } catch (e) { /* the run itself may fail (no record); the binding it leaves is what is judged */ }
  NOW += 3600000;                                              // one hour later on the wall clock
  const pageAfter = T();
  say('§PROC_SYSDATE_S2 page_before=' + pageBefore + ' page_after_1h=' + pageAfter);
  check('S2', 'one hour after a stand-alone process, the page\'s SQL clock reads 01:30 local (the live clock), not the process\'s frozen instant', /^2026-11-13 01:30:\d\d$/.test(pageAfter), pageAfter);

  // S3: the two "today" fallbacks take the LOCAL day (legacy: currentTimeMillis in the JVM's zone).
  NOW = new Real(2026, 10, 13, 0, 30, 0).getTime();
  const day = String(A.TimeUtil.getDay(null)), cad = String(A.Env.getContextAsDate(new A.Ctx({}), '#Date'));
  say('§PROC_SYSDATE_S3 getDay_null=' + day + ' getContextAsDate_empty=' + cad);
  check('S3', 'TimeUtil.getDay(null) is the local day 2026-11-13 and getContextAsDate on an empty context is 2026-11-13 00:30 local', day.slice(0, 10) === '2026-11-13' && /^2026-11-13 00:3\d:\d\d$/.test(cad), 'getDay=' + day + ' ctxDate=' + cad);

  const failed = checks.filter(c => !c.ok).length;
  const verdict = inconclusive ? 'INCONCLUSIVE' : failed ? 'FAIL' : 'PASS';
  say('§PROC_SYSDATE checks=' + checks.length + ' failed=' + failed + ' inserted=' + rows.length + ' verdict=' + verdict);
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(e => { say('§PROC_SYSDATE checks=0 failed=1 verdict=FAIL error=' + (e && e.stack || e)); process.exit(1); });
