#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-ENV-VIEWS (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md Part A, step A1; bim-ootb #3006).
// Read the log after every run: exit code is not evidence.
// ISSUE THIS PROVES OR DISPROVES: "Env.modelEnv (the login context's one clock) gives the LOCAL calendar day at 00:30 in a +08 zone, obeys the session
//   #Date when one exists, and refuses to fall back when it has no date (A-3) — while the headless kernel's env() still gives the UTC day (#2996)".
// POPULATION: one child process per time zone (TZ=UTC and Asia/Kuala_Lumpur), the clock fixed at 2026-11-13 00:30 LOCAL before any code loads; the
//   REAL ad_callout.js Env and the REAL ws_kernel.js env(session). The expected day is the literal local date the clock was set to, not a re-computation.
// RED CONTROL: the same population with the day cut from toISOString() (the #2996 defect) must FAIL the local-day invariant at +08.
// A2 (bim-ootb #2996, fixed): ws_kernel env() now takes the local day too (legacy CompiereService.java:281-283); a regression to the UTC day prints same=N and FAILS the kernel invariant.
// INCONCLUSIVE if fewer than 2 producers were compared in a zone, or a child could not run.
// Command: node erp/tests/witness_env_views.js
'use strict';
const path = require('path'), cp = require('child_process');
const ERP = path.join(__dirname, '..'), say = s => process.stdout.write(s + '\n');
const LOCAL = '2026-11-13T00:30:00', EXPECT_DAY = '2026-11-13', EXPECT_NOW = '2026-11-13 00:30:00';

async function child() {
  const Real = Date, base = new Real(LOCAL).getTime(); 
  global.Date = class extends Real { constructor(...a) { if (a.length === 0) super(base); else super(...a); } static now() { return base; } };
  if (!global.window) global.window = {};
  if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
  const quiet = console.log, logs = []; console.log = s => logs.push(String(s));
  const A = require(path.join(ERP, 'ad_callout.js')), K = require(path.join(ERP, 'ws_kernel.js')), k = await K.load();
  console.log = quiet;
  const edge = { nowMs: () => Date.now(), uuid: () => 'u', perfMs: () => 5 }, E = A.Env;
  const ctx = new A.Ctx({ '#AD_Client_ID': 11, '#AD_Org_ID': 11, '#AD_User_ID': 100, '#AD_Role_ID': 102 });
  const fromEdge = E.modelEnv(ctx, edge);
  const ctx2 = new A.Ctx({ '#AD_Client_ID': 11, '#Date': '2026-11-10 00:00:00.0' });
  const fromCtx = E.modelEnv(ctx2, edge);
  let threw = false; const before = logs.length; console.log = s => logs.push(String(s));
  try { E.modelEnv(new A.Ctx({}), {}); } catch (e) { threw = true; }
  console.log = quiet;
  const noDateLogged = logs.slice(before).some(l => l.indexOf('§ENV_NO_DATE') === 0 || l.indexOf('§ENV_NO_DATE') >= 0);
  const kd = String(k.env({ clientId: 11, orgId: 11, userId: 100, roleId: 102, warehouseId: 103 }).date).slice(0, 10);
  say('EV_RESULT ' + JSON.stringify({ tz: process.env.TZ, edgeDay: fromEdge.date.slice(0, 10), edgeNow: fromEdge.now, edgeIds: [fromEdge.client, fromEdge.org, fromEdge.user, fromEdge.role],
    ctxDay: fromCtx.date.slice(0, 10), threw, noDateLogged, elapsed: fromEdge.elapsed(2), kernelDay: kd, utcDay: new Real(base).toISOString().slice(0, 10) }));
}

function run(tz) {
  const r = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { EV_MODE: 'child', TZ: tz }), encoding: 'utf8', timeout: 120000 });
  const m = /EV_RESULT (.*)/.exec(r.stdout || '');
  if (!m) { say('§ENV_VIEWS_VERDICT INCONCLUSIVE tz=' + tz + ' child failed: ' + String(r.stderr).slice(0, 300)); process.exit(2); }
  return JSON.parse(m[1]);
}

if (process.env.EV_MODE === 'child') child().catch(e => { console.error(e); process.exit(1); });
else {
  const { Witness } = require(path.join(__dirname, '..', '..', 'witness_kit', 'contract.js'));
  const rows = ['UTC', 'Asia/Kuala_Lumpur'].map(tz => {
    const R = run(tz);
    const row = { tz, localDay: R.edgeDay, expectDay: EXPECT_DAY, nowOk: R.edgeNow === EXPECT_NOW, ids: R.edgeIds.join(','), kernelLocal: R.kernelDay === EXPECT_DAY, ctxDateWins: R.ctxDay === '2026-11-10', refusesNoDate: R.threw && R.noDateLogged, elapsedOk: R.elapsed === 3, producers: 2 };
    say('  §ENV_VIEWS tz=' + tz + ' producer=Env.modelEnv date=' + R.edgeDay + ' expect=' + EXPECT_DAY + ' same=' + (R.edgeDay === EXPECT_DAY ? 'Y' : 'N') + ' now=' + R.edgeNow + ' ctxDate=' + R.ctxDay + ' noDate=' + (row.refusesNoDate ? 'throws+§ENV_NO_DATE' : 'FALLS BACK'));
    const same = R.kernelDay === EXPECT_DAY;
    say('  §ENV_VIEWS tz=' + tz + ' producer=ws_kernel.date date=' + R.kernelDay + ' expect=' + EXPECT_DAY + ' same=' + (same ? 'Y' : 'N') + (same ? '' : ' REGRESSION #2996 (UTC day ' + R.utcDay + ')'));
    return row;
  });
  Witness('ENV_VIEWS')
    .population(() => rows)
    .schema({ type: 'object', required: ['tz', 'localDay', 'expectDay', 'producers'], properties: { producers: { type: 'integer', minimum: 2 } } })
    .invariant('Env.modelEnv gives the local calendar day and the local wall-clock string in every time zone', rs => rs.length === 2 && rs.every(r => r.localDay === r.expectDay && r.nowOk))
    .invariant('the login context #Date wins when present, a missing date throws with §ENV_NO_DATE (A-3), elapsed reads the injected timer (A-4)', rs => rs.every(r => r.ctxDateWins && r.refusesNoDate && r.elapsedOk))
    .invariant('the headless kernel session date is the local day too (#2996, legacy CompiereService.java:281-283)', rs => rs.every(r => r.kernelLocal))
    .invariant('the login ids come from the context unchanged', rs => rs.every(r => r.ids === '11,11,100,102'))
    .redControl(rs => rs.map(r => Object.assign({}, r, { localDay: r.tz === 'UTC' ? r.localDay : '2026-11-12' })))   // the #2996 shape: the UTC day at +08 00:30
    .run();
}
