#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-PROJECT-CURRENCY (spec bim-ootb prompts/CAPEX_DASHBOARD.md §5.67). READ THE LOG: verdict = §PROJECT_CURRENCY_VERDICT; the exit code alone is not evidence.
// THE ISSUE it proves/disproves: "the twin does not set a project's currency from its price list version, where legacy MProject.beforeSave (MProject.java:413-419) does" — so a project that arrives
//   with only its price list version (the §5.67 test-data 2Pack leaves C_Currency_ID out on purpose) would land without a currency on the twin and with one on legacy.
// Twin only (dd_common boot, the model layer). GardenWorld's price list versions: 105 'Export' (C_Currency_ID 102) and 103 'Purchase' (100), read from the seed, not assumed.
// P1 a new project with only PLV 105 gets the Export list's currency · P2 a new project with PLV 103 gets 100 · P3 changing P1's PLV to 103 moves its currency to 100 · P4 an update that does not change the
//   PLV leaves a currency set by hand alone (legacy runs the rule only on is_ValueChanged). Break: PROJECT_CURRENCY_BREAK=1 removes the c_project model class → P1-P3 MUST FAIL.
'use strict';
const path = require('path'), C = require(path.join(__dirname, 'dd_common.js')), BREAK = process.env.PROJECT_CURRENCY_BREAK === '1', log = console.log;
let judged = 0, fails = 0; const ck = (n, ok, i) => { judged++; if (!ok) fails++; log('  §PROJECT_CURRENCY ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (i !== undefined ? ' ' + JSON.stringify(i) : '')); };
(async () => {
  const H = await C.boot(); require(path.join(H.ERP, 'model_project.js'));
  if (BREAK) H.ML.unregisterModel('c_project', 'core');
  const plCur = v => { const r = H.one('SELECT l.c_currency_id AS c FROM m_pricelist_version v JOIN m_pricelist l ON l.m_pricelist_id=v.m_pricelist_id WHERE v.m_pricelist_version_id=?', [v]); return r ? Number(r.c) : null; };
  const cE = plCur(105), cP = plCur(103);
  log('§PROJECT_CURRENCY_DATA plv105_currency=' + cE + ' plv103_currency=' + cP + (BREAK ? ' (PROJECT_CURRENCY_BREAK=1: FAIL expected)' : ''));
  if (cE == null || cP == null || cE === cP) { log('§PROJECT_CURRENCY_VERDICT INCONCLUSIVE the seed lacks two price lists of different currencies'); process.exit(2); }
  const mk = (v, plv) => { const r = H.save('C_Project', { ad_client_id: 11, ad_org_id: 11, value: v, name: v, m_pricelist_version_id: plv, issummary: 'N' }); return r && r.ok !== false ? H.lastId('c_project') : null; };
  const cur = id => { const r = id && H.one('SELECT c_currency_id AS c FROM c_project WHERE c_project_id=?', [id]); return r && r.c != null ? Number(r.c) : null; };
  const a = mk('W_PCUR_A', 105), b = mk('W_PCUR_B', 103);
  ck('P1 a new project with only price list version 105 gets that list\'s currency', cur(a) === cE, { got: cur(a), want: cE });
  ck('P2 a new project with only price list version 103 gets that list\'s currency', cur(b) === cP, { got: cur(b), want: cP });
  if (a) H.update('C_Project', a, { m_pricelist_version_id: 103 });
  ck('P3 changing the price list version moves the currency', cur(a) === cP, { got: cur(a), want: cP });
  if (b) { H.update('C_Project', b, { c_currency_id: cE }); H.update('C_Project', b, { name: 'W_PCUR_B renamed' }); }
  ck('P4 an update that leaves the price list version unchanged keeps a hand-set currency', cur(b) === cE, { got: cur(b), want: cE });
  const v = fails ? 'FAIL' : 'PASS';
  log('§PROJECT_CURRENCY_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails + (BREAK ? ' (PROJECT_CURRENCY_BREAK=1: FAIL expected)' : ''));
  process.exit(v === 'PASS' ? 0 : 1);
})().catch(e => { log('§PROJECT_CURRENCY_VERDICT FAIL harness ' + (e && e.stack || e)); process.exit(1); });
