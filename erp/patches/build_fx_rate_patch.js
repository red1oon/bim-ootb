#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — erp/patches/build_fx_rate_patch.js. Spec bim-ootb prompts/CAPEX_DASHBOARD.md "2026-11-25 SPEC" claim 1-2. READ THE LOG: §FX_RATE_PATCH lines.
// Appends to erp/patches/ad_seed.db.sql (called by build_ad_seed_patch.sh; also runnable alone, it refuses to append twice) the GardenWorld conversion rate of a rate pack's currency to
// the accounting currency, as iDempiere's own data entry leaves it: the forward row and the reverse row MConversionRate.afterSave makes (:488-, reciprocal.setDivideRate(getMultiplyRate())).
// EXTRACT-only, no new number: the figure is the pack's meta.exchange_rate (units of the pack's currency per 1 USD, viewer/rates/<pack>.json); the currency ids, the client, the default conversion type
// and the validity window are READ from the `idempiere` Postgres DB (the oracle): the currency by ISO code, the accounting currency = C_AcctSchema of AD_ClientInfo.C_AcctSchema1_ID of client 11,
// the type = IsDefault='Y', the window = that client's own active base pair's (USD<->EUR 135/136: 2000-01-01 .. 2056-01-29). Rows are INSERT OR IGNORE on the key (idempotent, the self-heal
// loader erp/seed_patch.js applies them at every load). Stable UUIDs from the natural key (the same rule as capex/tools/td_pack.js uu()) so the test-data 2Pack and the twin name the same row.
// Usage: node erp/patches/build_fx_rate_patch.js [path/to/ad_seed.db.sql]   (append, once) · node erp/patches/build_fx_rate_patch.js --stdout   (what build_ad_seed_patch.sh calls inside its output group)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { execFileSync } = require('child_process');
const STDOUT = process.argv[2] === '--stdout', OUT = STDOUT ? '' : (process.argv[2] || path.join(__dirname, 'ad_seed.db.sql')), PACKS = ['pwd2024_bd'];   // the owner's ruling 2026-11-25: the Bangladesh pack; another pack = one more name here
const MARK = '-- §FX_RATE_PATCH', ID0 = 990002;                                                      // 990000/990001 = the MYR pair (scripts/seed_fin_currency.js); the high band the seed keeps for its own rows
const psql = sql => execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-U', 'adempiere', '-d', 'idempiere', '-qtA'], { input: 'SET search_path=adempiere;\n' + sql }).toString().replace(/^SET\n/, '').trim();
const uu = key => { const h = crypto.createHash('md5').update('bimootb-capex-td|c_conversion_rate|' + key).digest('hex').split(''); h[12] = '3'; h[16] = '89ab'[parseInt(h[16], 16) & 3]; const s = h.join(''); return s.slice(0, 8) + '-' + s.slice(8, 12) + '-' + s.slice(12, 16) + '-' + s.slice(16, 20) + '-' + s.slice(20, 32); };
if (!STDOUT && fs.readFileSync(OUT, 'utf8').includes(MARK)) { console.log('§FX_RATE_PATCH SKIP already in ' + OUT); process.exit(0); }
const acct = psql("select c_currency_id from c_acctschema where c_acctschema_id=(select c_acctschema1_id from ad_clientinfo where ad_client_id=11)");
const type = psql("select c_conversiontype_id from c_conversiontype where isactive='Y' and ad_client_id in (0,11) order by isdefault desc, ad_client_id desc limit 1");
const win = psql("select to_char(min(validfrom),'YYYY-MM-DD HH24:MI:SS')||'|'||to_char(min(validto),'YYYY-MM-DD HH24:MI:SS') from c_conversion_rate where ad_client_id=11 and isactive='Y'").split('|');
let out = MARK + ' (bim-ootb prompts/CAPEX_DASHBOARD.md 2026-11-25 SPEC): GardenWorld rate of a rate pack\'s currency to the accounting currency (' + PACKS.join(',') + '), forward + reverse as iDempiere data entry leaves them\n', id = ID0;
const q = v => typeof v === 'number' ? String(v) : "'" + v + "'";
PACKS.forEach(p => {
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'viewer', 'rates', p + '.json'), 'utf8')).meta, iso = m.currency, perUsd = Number(m.exchange_rate);
  if (!(perUsd > 0)) throw new Error(p + ' has no usable meta.exchange_rate');
  const cid = psql("select c_currency_id from c_currency where iso_code='" + iso.replace(/'/g, '') + "'"); if (!cid) throw new Error(iso + ' is not a C_Currency of the oracle');
  const mult = 1 / perUsd, add = (from, to, multiply, divide, key) => {   // JS number text == Java's Double.toString for these values (MConversionRate.setDivideRate: multiply = 1/divide as a double)
    out += 'INSERT OR IGNORE INTO c_conversion_rate ("c_conversion_rate_id", "ad_client_id", "ad_org_id", "isactive", "created", "createdby", "updated", "updatedby", "c_currency_id", "c_currency_id_to", "validfrom", "validto", "multiplyrate", "dividerate", "c_conversiontype_id", "c_conversion_rate_uu") VALUES (' +
      [id++, 11, 0, 'Y', '2026-11-25 00:00:00', 100, '2026-11-25 00:00:00', 100, +from, +to, win[0], win[1], multiply, divide, +type, uu(key)].map(q).join(', ') + ');\n';
  };
  add(cid, acct, mult, perUsd, iso + '>acct');          // entered as DivideRate = perUsd: Multiply = 1/Divide
  add(acct, cid, perUsd, mult, 'acct>' + iso);          // afterSave: reciprocal.Divide = forward.Multiply, reciprocal.Multiply = forward.Divide
  (STDOUT ? console.error : console.log)('§FX_RATE_PATCH pack=' + p + ' cur=' + iso + '(' + cid + ') acct=' + acct + ' type=' + type + ' window=' + win.join('..') + ' multiply=' + mult + ' divide=' + perUsd);
});
if (STDOUT) { process.stdout.write(out); console.error('§FX_RATE_PATCH emitted ' + (id - ID0) + ' rows'); }
else { fs.appendFileSync(OUT, '\n' + out); console.log('§FX_RATE_PATCH appended ' + (id - ID0) + ' rows to ' + OUT); }
