// pilot_report.js — §PILOT-GROUP-REPORT-RAW: group stock + P&L folded from the admin's folded op log.
// UNVERIFIED: not compared with real iDempiere (Phase B, after the model layer lands). Raw numbers only.
// Run: node erp/tests/pilot_report.js [run-dir]  — joins header+line by gid (local ids collide across stations).
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const dir = process.argv[2] || (() => { const b = path.join(__dirname, 'pilot_out'); return path.join(b, fs.readdirSync(b).sort().pop()); })();
const rows = JSON.parse(fs.readFileSync(path.join(dir, 'admin_rows.json'), 'utf8'));
const seed = path.join(__dirname, '..', 'ad_seed.db');
const sql = s => cp.execFileSync('sqlite3', [seed, s], { encoding: 'utf8', input: '' }).trim().split('\n').filter(Boolean).map(l => l.split('|'));
const out = []; const say = s => { out.push(s); console.log(s); };
const P = rows.map(r => { let p = {}; try { p = JSON.parse(r.parameters); } catch (e) {} return { r, p }; });
const create = (k) => P.filter(x => x.p.key === k && x.p.verb === 'create');
// ── stock: shipments (movementtype C- = out) by gid → warehouse; lines by gid ──
const whOfGid = {}; create('m_inout').forEach(x => whOfGid[x.r.gid] = { wh: x.p.fields.m_warehouse_id, org: x.p.fields.ad_org_id, sign: String(x.p.fields.movementtype).endsWith('-') ? -1 : 1 });
const mv = {};
create('m_inoutline').forEach(x => { const h = whOfGid[x.r.gid]; if (!h) { say('§PILOT-GROUP-REPORT-RAW kind=stock WARN line without header gid=' + x.r.gid); return; }
  const k = h.wh + ':' + x.p.fields.m_product_id; mv[k] = (mv[k] || 0) + h.sign * Number(x.p.fields.movementqty); });
const names = {}; sql("select c_elementvalue_id,value,name from c_elementvalue").forEach(a => names[a[0]] = a[1] + ' ' + a[2]);
say('§PILOT-GROUP-REPORT-RAW kind=header UNVERIFIED run=' + path.basename(dir) + ' source=admin folded op log (' + rows.length + ' ops), joined by gid');
Object.keys(mv).sort().forEach(k => { const [wh, pid] = k.split(':');
  const base = sql('select coalesce(sum(s.qtyonhand),0) from m_storageonhand s join m_locator l on l.m_locator_id=s.m_locator_id where s.m_product_id=' + pid + ' and l.m_warehouse_id=' + wh)[0][0];
  say('§PILOT-GROUP-REPORT-RAW kind=stock warehouse=' + wh + ' product=' + pid + ' seed_onhand=' + base + ' shipped_net=' + mv[k] + ' onhand=' + (Number(base) + mv[k]) + ' UNVERIFIED'); });
// ── P&L from fact_acct ops: per org, per account; revenue/expense = account value 4xxxx-9xxxx ──
const per = {};
create('fact_acct').forEach(x => { const f = x.p.fields, o = f.ad_org_id, a = f.account_id; per[o] = per[o] || {};
  const c = per[o][a] = per[o][a] || { dr: 0, cr: 0 }; c.dr += Math.round(Number(f.amtacctdr) * 100); c.cr += Math.round(Number(f.amtacctcr) * 100); });
const all = {};
Object.keys(per).sort().forEach(o => Object.keys(per[o]).forEach(a => { const c = per[o][a]; const net = c.dr - c.cr; all[a] = (all[a] || 0) + net;
  say('§PILOT-GROUP-REPORT-RAW kind=pl org=' + o + ' account="' + (names[a] || a) + '" dr_cents=' + c.dr + ' cr_cents=' + c.cr + ' net_dr_cents=' + net + ' UNVERIFIED'); }));
const isPL = a => /^[4-9]/.test((names[a] || '').trim());
let tot = 0; Object.keys(all).forEach(a => { say('§PILOT-GROUP-REPORT-RAW kind=pl org=ALL account="' + (names[a] || a) + '" net_dr_cents=' + all[a] + ' UNVERIFIED'); if (isPL(a)) tot += all[a]; });
say('§PILOT-GROUP-REPORT-RAW kind=pl org=ALL profit_cents=' + (-tot) + ' (revenue+cogs accounts value 4-9xxxx, cr-positive) balanced_all_accounts=' + (Object.values(all).reduce((a, b) => a + b, 0) === 0) + ' UNVERIFIED');
fs.writeFileSync(path.join(dir, 'report.log'), out.join('\n') + '\n');
