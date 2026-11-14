// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-TD-PRODUCTS (bim-ootb prompts/CAPEX_DASHBOARD.md §5.82). READ THE LOG after every run: the §WTPR lines carry the evidence, the exit code does not.
// THE ISSUE it proves/disproves: "the script does not create what the pack file states, or standard costing does not hold".
//   T1 the committed script == the generator's output on today's pack file (no hand edit)
//   T2 on the test instance's DB, in ONE transaction that is ROLLED BACK (nothing kept, no restart): the script applies with no error; 10 products in category Construction, each with its unit,
//      its price on the newest Purchase list version and its M_Cost standard price == pack rate / exchange_rate (read here independently from the JSON); the category costs by Standard on every schema
//   T3 a second apply in the same transaction adds 0 rows
// Break switch TDP_BREAK=1: the script is generated from a COPY of the pack with one rate changed; T1 and T2 MUST FAIL. 0 products judged = INCONCLUSIVE.
// Run: node capex/tests/witness_td_products.js > <log>
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const REPO = path.join(__dirname, '..', '..'), BREAK = process.env.TDP_BREAK === '1';
const RATES = path.join(REPO, 'viewer/rates/pwd2024_bd.json'), SCRIPT = path.join(REPO, 'capex/plugin/testdata_2pack/202611141500_CAPEX-TD-CONSTRUCTION-PRODUCTS.sql'), GEN = path.join(REPO, 'capex/tools/td_products_sql.js');
const DB = process.env.TDP_DB || 'idempiere_bimdoc';
let fails = 0, judged = 0; const say = s => console.log(s);
const verdict = (id, claim, cond, info) => { judged++; if (!cond) fails++; say(`§WTPR ${id} ${cond ? 'PASS' : 'FAIL'} ${claim} ${JSON.stringify(info).slice(0, 900)}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tdp-'));
// expected, independently from the pack file: distinct SoR items -> {rate, unit}
const pack = JSON.parse(fs.readFileSync(RATES, 'utf8')), FX = pack.meta.exchange_rate, exp = new Map();
for (const l of Object.values(pack.material_rates)) for (const r of l) exp.set('PWD-' + r.source.item, { rate: r.rate, unit: r.unit });
for (const l of Object.values(pack.material_adds)) for (const r of l) exp.set('PWD-' + r.source.item, { rate: r.rate, unit: r.unit });
let genRates = RATES;
if (BREAK) { const b = JSON.parse(fs.readFileSync(RATES, 'utf8')); b.material_rates.IfcWall[0].rate += 1; genRates = path.join(tmp, 'broken.json'); fs.writeFileSync(genRates, JSON.stringify(b)); say('§WTPR BREAK one rate +1 in a copy of the pack; T1 and T2 must FAIL'); }
const gen = execFileSync('node', [GEN, '--rates', genRates], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const committed = fs.readFileSync(SCRIPT, 'utf8');
verdict('T1', 'committed script == generator output on the pack file', gen === committed, { genBytes: gen.length, committedBytes: committed.length });
if (!exp.size) { say('§WTPR INCONCLUSIVE 0 products expected'); process.exit(2); }
const body = gen.split('\n').filter(l => !/register_migration_script/.test(l)).join('\n');
const Q = `select 'P|'||p.value||'|'||u.x12de355||'|'||pc.value||'|'||coalesce((select pp.pricestd::text from m_productprice pp where pp.m_product_id=p.m_product_id and pp.m_pricelist_version_id=(select v.m_pricelist_version_id from m_pricelist_version v join m_pricelist l using(m_pricelist_id) where v.ad_client_id=11 and l.name='Purchase' and l.issopricelist='N' order by v.validfrom desc limit 1)),'-')||'|'||coalesce((select string_agg(c.currentcostprice::text,',') from m_cost c join m_costelement ce using(m_costelement_id) join c_acctschema s using(c_acctschema_id) where c.m_product_id=p.m_product_id and ce.costingmethod='S' and ce.costelementtype='M' and s.c_currency_id=100),'-') from m_product p join c_uom u using(c_uom_id) join m_product_category pc using(m_product_category_id) where p.ad_client_id=11 and p.value like 'PWD-%' order by 1;
select 'A|'||c_acctschema_id||'|'||coalesce(costingmethod,'-') from m_product_category_acct where m_product_category_id=(select m_product_category_id from m_product_category where ad_client_id=11 and value='Construction') order by 1;
select 'N|'||(select count(*) from m_product where value like 'PWD-%')||'|'||(select count(*) from m_productprice pp join m_product p using(m_product_id) where p.value like 'PWD-%')||'|'||(select count(*) from m_cost c join m_product p using(m_product_id) where p.value like 'PWD-%')||'|'||(select count(*) from m_product_acct a join m_product p using(m_product_id) where p.value like 'PWD-%')||'|'||(select count(*) from c_uom where ad_client_id=11 and x12de355 in ('M3','M2'));`;
const sql = `set search_path=adempiere;\nBEGIN;\n${body}\nselect '--1';\n${Q}\n${body}\nselect '--2';\n${Q}\nROLLBACK;\n`;
let out; try { out = execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-U', 'adempiere', '-d', DB, '-At', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n'); }
catch (e) { verdict('T2', 'script applies with no error', false, { err: String(e.stderr || e.message).slice(0, 400) }); say(`§WTPR ${fails ? 'FAIL' : 'PASS'} judged=${judged} fails=${fails}`); process.exit(1); }
const i1 = out.indexOf('--1'), i2 = out.indexOf('--2'), r1 = out.slice(i1 + 1, i2), r2 = out.slice(i2 + 1);
const P = r1.filter(l => l.startsWith('P|')).map(l => l.split('|')), A = r1.filter(l => l.startsWith('A|')).map(l => l.split('|')), N1 = (r1.find(l => l.startsWith('N|')) || '').split('|').slice(1).map(Number), N2 = (r2.find(l => l.startsWith('N|')) || '').split('|').slice(1).map(Number);
const UNIT = { M3: 'M3', M2: 'M2', KG: 'Kg' }, bad = [];
for (const [code, e] of exp) { const row = P.find(r => r[1] === code), want = (Math.round(e.rate / FX * 10000) / 10000);
  if (!row) { bad.push(code + ' missing'); continue; }
  if (row[2] !== UNIT[e.unit]) bad.push(code + ' unit ' + row[2]); if (row[3] !== 'Construction') bad.push(code + ' category ' + row[3]);
  if (Math.abs(+row[4] - want) > 1e-9) bad.push(code + ' price ' + row[4] + ' != ' + want); if (Math.abs(+row[5] - want) > 1e-9) bad.push(code + ' cost ' + row[5] + ' != ' + want); }
verdict('T2a', 'every pack item has a product with its unit, category Construction, Purchase-list price and Standard M_Cost == rate/' + FX, !bad.length && P.length === exp.size, { expected: exp.size, found: P.length, bad: bad.slice(0, 6) });
verdict('T2b', 'category costs by Standard on every schema', A.length >= 1 && A.every(a => a[2] === 'S'), { schemas: A.map(a => a[1] + ':' + a[2]) });
verdict('T3', 'a second apply adds 0 rows (products, prices, costs, product accts, units)', N1.length === 5 && JSON.stringify(N1) === JSON.stringify(N2), { first: N1, second: N2 });
say(`§WTPR ${fails ? 'FAIL' : 'PASS'} judged=${judged} fails=${fails} break=${BREAK ? 1 : 0}`);
process.exit(fails ? 1 : 0);
