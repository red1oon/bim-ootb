#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — capex/tools/site_migration.js. Spec bim-ootb prompts/CAPEX_DASHBOARD.md §5.30; witness W-SITE-MIG (capex/tests/witness_site_migration.js). READ THE LOG: §SITE_MIG lines.
// Renders a site's CAPEX migration scripts from the shipped ones, which stay the ONE source (capex/legacy/migration + capex/legacy/ws). It never connects to a site:
//   node capex/tools/site_migration.js --preflight <client>            prints a read-only SQL; the site's admin runs it (psql -qtA) and saves the one line of JSON it returns
//   node capex/tools/site_migration.js <preflight.json> --role <id> --out <dir> [--targets <file>]
//     targets file = {"budget":{"USD":1000},"activeProjects":2}; a goal with no number takes target 0 on the gray schema. Exit 2 = refused, reason in the log, no file written.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), MA = require('./migration_apply.js');
const LEGACY = path.join(__dirname, '..', 'legacy');
const PA_DIR = path.join(LEGACY, 'migration/iD13/postgresql'), WS_DIR = path.join(LEGACY, 'ws/migration/iD13/postgresql');
const PA_FILES = ['202611031900_CAPEX-R0.sql', '202611032000_CAPEX-G2.sql', '202611032100_CAPEX-G3.sql', '202611032200_CAPEX-G4.sql', '202611041000_CAPEX-G7.sql'], WS_FILE = '202611042300_CAPEX-WS-READ.sql';
const ID_TABLES = ['PA_MeasureCalc', 'PA_Measure', 'PA_Goal', 'PA_ColorSchema', 'WS_WebServiceType', 'WS_WebService_Para', 'WS_WebServiceFieldInput', 'WS_WebServiceFieldOutput'];
const HEAD_WS_TYPES = () => parseScript(fs.readFileSync(path.join(WS_DIR, WS_FILE), 'utf8')).filter(r => r.table === 'WS_WebServiceType').map(r => unq(r.get('Value')));

// ── parse: one statement into its columns and raw value tokens (a TO_TIMESTAMP(…) or a (SELECT …) stays one token) ──
function tokens(s) {
  const out = []; let cur = '', q = false, d = 0;
  for (const c of s) {
    if (c === "'") q = !q;
    if (!q && c === '(') d++;
    if (!q && c === ')') d--;
    if (!q && !d && c === ',') { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const unq = t => t.replace(/^'|'$/g, '').replace(/''/g, "'");
const lit = s => "'" + String(s).replace(/'/g, "''") + "'";
function parseScript(text) {
  const out = [];
  MA.split(text).forEach(st => {
    if (/^SELECT\s+register_migration_script/i.test(st)) return;
    const ins = /^INSERT\s+INTO\s+(\w+)\s*\(([^)]*)\)\s*VALUES\s*\(([\s\S]*)\)$/i.exec(st);
    if (ins) {
      const cols = ins[2].split(',').map(c => c.trim()), vals = tokens(ins[3]);
      if (cols.length !== vals.length) throw new Error('parse: ' + cols.length + ' columns, ' + vals.length + ' values: ' + st.slice(0, 120));
      out.push(row(ins[1], cols, vals));
      return;
    }
    const upd = /^UPDATE\s+PA_Goal\s+SET\s+([\s\S]*)\s+WHERE\s+PA_Goal_ID\s+IN\s*\(([^)]*)\)$/i.exec(st);
    if (!upd) throw new Error('a statement this tool does not know: ' + st.slice(0, 120));
    const set = {}; tokens(upd[1]).forEach(a => { const m = /^(\w+)\s*=\s*([\s\S]*)$/.exec(a); set[m[1]] = m[2].trim(); });
    out.push({ update: true, target: Number(set.MeasureTarget), schema: Number(set.PA_ColorSchema_ID), ids: upd[2].split(',').map(Number) });
  });
  return out;
}
function row(table, cols, vals) {
  const r = { table, cols, vals };
  r.get = c => { const i = cols.findIndex(x => x.toLowerCase() === c.toLowerCase()); return i < 0 ? undefined : vals[i]; };
  r.set = (c, v) => { const i = cols.findIndex(x => x.toLowerCase() === c.toLowerCase()); if (i < 0) { cols.push(c); vals.push(v); } else vals[i] = v; };
  r.clone = () => row(table, cols.slice(), vals.slice());
  return r;
}
const uuOf = (client, shipped, iso) => {
  const h = crypto.createHash('sha1').update(client + '|' + shipped + '|' + (iso || '')).digest('hex');
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-5' + h.slice(13, 16) + '-' + '89ab'[parseInt(h[16], 16) % 4] + h.slice(17, 20) + '-' + h.slice(20, 32);
};

// ── preflight: read-only; one line of JSON ──
function preflightSql(client) {
  const c = Number(client);
  if (!Number.isInteger(c) || c <= 0) throw new Error('--preflight needs the numeric AD_Client_ID');
  const next = ID_TABLES.map(t => "'" + t + "', GREATEST(1000000, (SELECT COALESCE(MAX(" + t + '_ID),0)+1 FROM ' + t + "), (SELECT COALESCE(MAX(CurrentNext),0) FROM AD_Sequence WHERE lower(Name)=lower('" + t + "') AND IsTableID='Y'))").join(', ');
  return '-- CAPEX site preflight (prompts/CAPEX_DASHBOARD.md §5.30): SELECT only, changes nothing. Run with psql -qtA and save the line it prints.\n' +
    'SET search_path=adempiere;\nSELECT json_build_object(' +
    "'client', " + c + ", 'clientValue', (SELECT Value FROM AD_Client WHERE AD_Client_ID=" + c + '), ' +
    "'takenAt', to_char(now(),'YYYYMMDDHH24MI'), " +
    "'roles', (SELECT COALESCE(json_agg(json_build_object('id',AD_Role_ID,'name',Name) ORDER BY AD_Role_ID),'[]') FROM AD_Role WHERE AD_Client_ID=" + c + " AND IsActive='Y'), " +
    "'currencies', (SELECT COALESCE(json_agg(json_build_object('iso',x.ISO_Code,'id',x.C_Currency_ID) ORDER BY x.C_Currency_ID),'[]') FROM (SELECT DISTINCT cu.ISO_Code, cu.C_Currency_ID FROM C_Project p JOIN C_Currency cu ON cu.C_Currency_ID=p.C_Currency_ID WHERE p.AD_Client_ID=" + c + ") x), " +
    "'nextIds', json_build_object(" + next + '), ' +
    "'existingTypes', (SELECT COALESCE(json_agg(json_build_object('value',Value,'client',AD_Client_ID)),'[]') FROM WS_WebServiceType WHERE Value IN (" + HEAD_WS_TYPES().map(lit).join(',') + ')), ' +
    "'existingGoals', (SELECT COUNT(*) FROM PA_Goal WHERE AD_Client_ID=" + c + " AND Name LIKE 'CAPEX %')" +
    ');\n';
}

// ── render ──
function refuse(msg) { const e = new Error(msg); e.refusal = true; throw e; }
// site = {client, role, currencies:[{iso,id}], nextIds:{table:n}, stamp, targets:{budget:{iso:n},activeProjects:n}}
function render(site) {
  if (site.role == null) refuse('no role given: --role, one of the preflight\'s roles');
  if (!site.currencies || !site.currencies.length) refuse('the site\'s C_Project rows hold no currency: nothing to take one from');
  const ids = Object.assign({}, site.nextIds), maps = {}; ID_TABLES.forEach(t => { maps[t] = {}; });
  const take = (t, oldId, iso) => { if (ids[t] == null) throw new Error('preflight has no next id for ' + t); const n = ids[t]++; maps[t][oldId + '|' + (iso || '')] = n; return n; };
  const mapped = (t, oldId, iso) => { const n = maps[t][oldId + '|' + (iso || '')]; if (n == null) throw new Error('no ' + t + ' for shipped id ' + oldId + ' ' + (iso || '')); return n; };

  // shipped PA rows + G7's groups
  const all = PA_FILES.flatMap(f => parseScript(fs.readFileSync(path.join(PA_DIR, f), 'utf8')));
  const inserts = all.filter(r => !r.update), updates = all.filter(r => r.update);
  const nameOf = r => unq(r.get('Name'));
  const familyOf = r => (/\((USD|BDT)\)$/.exec(nameOf(r)) || [])[1] || '';
  inserts.forEach(r => {
    if (familyOf(r)) return;
    const txt = r.vals.join(' ');
    if (/C_Currency_ID\s*=|\bUSD\b|\bBDT\b/.test(txt)) refuse('a shipped row outside the currency families names a currency: ' + r.table + ' ' + nameOf(r));
  });
  const groupOf = {}; updates.forEach(u => u.ids.forEach(id => { groupOf[id] = u; }));
  // G7's stock schema says which group a goal is in: 101 = cost against the budget (a target per currency), 100 = a share of the active projects. Its numbers are the pilot's and are never read.
  const budgetSchema = 101, shareSchema = 100;
  const expanded = [];
  inserts.forEach(r => {
    const f = familyOf(r);
    if (f === 'BDT') return;
    if (f === 'USD') site.currencies.forEach(c => expanded.push({ r, iso: c.iso, ccy: c.id }));
    else expanded.push({ r, iso: '', ccy: null });
  });
  const targets = site.targets || {}, budget = targets.budget || {};
  let seq = 0;
  const pa = expanded.map(({ r, iso, ccy }) => {
    const o = r.clone(), t = r.table, oldId = Number(r.get(t + '_ID'));
    o.set(t + '_ID', String(take(t, oldId, iso)));
    o.set('AD_Client_ID', String(site.client));
    if (r.get('Created')) { const ts = "TO_TIMESTAMP('" + stampTs(site.stamp) + "','YYYY-MM-DD HH24:MI:SS')"; o.set('Created', ts); o.set('Updated', ts); }
    o.set(t + '_UU', lit(uuOf(site.client, unq(r.get(t + '_UU')), iso)));
    if (iso) ['Name', 'Description', 'WhereClause', 'SelectClause'].forEach(c => {
      const v = o.get(c); if (v === undefined || v === 'NULL') return;
      o.set(c, lit(unq(v).replace(/\bUSD\b/g, iso).replace(/C_Currency_ID\s*=\s*100\b/g, 'C_Currency_ID=' + ccy)));
    });
    if (t === 'PA_Measure') o.set('PA_MeasureCalc_ID', String(mapped('PA_MeasureCalc', Number(r.get('PA_MeasureCalc_ID')), iso)));
    if (t === 'PA_Goal') {
      o.set('PA_Measure_ID', String(mapped('PA_Measure', Number(r.get('PA_Measure_ID')), iso)));
      o.set('SeqNo', String(seq += 10));
      const g = groupOf[oldId];
      if (!g) refuse('G7 does not place the goal ' + nameOf(r));
      let target = 0, schema = null;
      if (g.schema === budgetSchema && budget[iso] != null) { target = Number(budget[iso]); schema = budgetSchema; }
      if (g.schema === shareSchema && targets.activeProjects != null) { target = Number(targets.activeProjects); schema = shareSchema; }
      o.set('MeasureTarget', String(target));
      o.set('PA_ColorSchema_ID', schema === null ? '@GRAY@' : String(schema));
    }
    return o;
  });
  // goals point at the gray schema that G7 ships; it renders with its own new id
  const grayRow = pa.find(o => o.table === 'PA_ColorSchema');
  if (!grayRow) throw new Error('G7 ships no gray schema');
  pa.filter(o => o.table === 'PA_Goal' && o.get('PA_ColorSchema_ID') === '@GRAY@').forEach(o => o.set('PA_ColorSchema_ID', grayRow.get('PA_ColorSchema_ID')));
  // calc, measure, schema before goal: FK order
  const order = ['PA_MeasureCalc', 'PA_Measure', 'PA_ColorSchema', 'PA_Goal'];
  pa.sort((a, b) => order.indexOf(a.table) - order.indexOf(b.table));

  // the read types: every row to the site's client, the access row to the site's role
  const ws = parseScript(fs.readFileSync(path.join(WS_DIR, WS_FILE), 'utf8')).map(r => {
    const o = r.clone(), t = r.table;
    if (t === 'WS_WebServiceType') o.set(t + '_ID', String(take(t, Number(r.get(t + '_ID')))));
    else if (t !== 'WS_WebServiceTypeAccess') { o.set('WS_WebServiceType_ID', String(mapped('WS_WebServiceType', Number(r.get('WS_WebServiceType_ID'))))); o.set(t + '_ID', String(take(t, Number(r.get(t + '_ID'))))); }
    else { o.set('WS_WebServiceType_ID', String(mapped('WS_WebServiceType', Number(r.get('WS_WebServiceType_ID'))))); o.set('AD_Role_ID', String(site.role)); }
    o.set('AD_Client_ID', String(site.client));
    const ts = "TO_TIMESTAMP('" + stampTs(site.stamp) + "','YYYY-MM-DD HH24:MI:SS')"; o.set('Created', ts); o.set('Updated', ts);
    o.set(t + '_UU', lit(uuOf(site.client, unq(r.get(t + '_UU')))));
    return o;
  });
  return { pa, ws, grayId: Number(grayRow.get('PA_ColorSchema_ID')) };
}
const stampTs = s => s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8) + ' ' + s.slice(8, 10) + ':' + s.slice(10, 12) + ':00';
const stampNext = s => { const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12) + 1)); const p = n => String(n).padStart(2, '0'); return '' + d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + p(d.getUTCHours()) + p(d.getUTCMinutes()); };
const insertOf = r => 'INSERT INTO ' + r.table + ' (' + r.cols.join(',') + ') VALUES (' + r.vals.join(',') + ')\n;\n';
function idList(rows, t) { return rows.filter(r => r.table === t).map(r => r.get(t + '_ID')).join(','); }
function scriptText(file, what, restore, rows, site) {
  return '-- ' + file.replace(/^\d+_|\.sql$/g, '') + ' (bim-ootb prompts/CAPEX_DASHBOARD.md §5.30, LEGACY CONVENTION): ' + what + '\n' +
    '-- Rendered by capex/tools/site_migration.js from the shipped scripts for client ' + site.client + ', role ' + site.role + ', currencies ' + site.currencies.map(c => c.iso).join(' + ') + '. Do not edit: re-render. Run update_sequences() after applying, then restart the server: WS types and access are cached.\n' +
    '-- Restore: ' + restore + '\n' +
    "SELECT register_migration_script('" + file + "') FROM dual;\n\n" + rows.map(insertOf).join('');
}
function write(site, out) {
  const r = render(site);
  fs.mkdirSync(out, { recursive: true });
  const wsFile = site.stamp + '_CAPEX-SITE-' + site.client + '-WS-READ.sql', paFile = stampNext(site.stamp) + '_CAPEX-SITE-' + site.client + '-PA.sql';
  const typeIds = idList(r.ws, 'WS_WebServiceType');
  fs.writeFileSync(path.join(out, wsFile), scriptText(wsFile, 'the 8 read-only types the CAPEX dashboard reads.', 'DELETE FROM WS_WebServiceFieldOutput, WS_WebServiceFieldInput, WS_WebService_Para, WS_WebServiceTypeAccess, then WS_WebServiceType WHERE WS_WebServiceType_ID IN (' + typeIds + '); restart.', r.ws, site));
  fs.writeFileSync(path.join(out, paFile), scriptText(paFile, 'the CAPEX dashboard as Performance Analysis rows. A goal with no target stated is on the gray schema: enter a plan in the Performance Goal window.', 'DELETE FROM PA_Goal WHERE PA_Goal_ID IN (' + idList(r.pa, 'PA_Goal') + '); PA_ColorSchema ' + r.grayId + '; PA_Measure WHERE PA_Measure_ID IN (' + idList(r.pa, 'PA_Measure') + '); PA_MeasureCalc WHERE PA_MeasureCalc_ID IN (' + idList(r.pa, 'PA_MeasureCalc') + ').', r.pa, site));
  const gray = r.pa.filter(x => x.table === 'PA_Goal' && Number(x.get('PA_ColorSchema_ID')) === r.grayId).length, goals = r.pa.filter(x => x.table === 'PA_Goal').length;
  console.log('§SITE_MIG rendered client=' + site.client + ' role=' + site.role + ' currencies=' + site.currencies.map(c => c.iso + ':' + c.id).join(',') + ' goals=' + goals + ' gray=' + gray + ' withTarget=' + (goals - gray) + ' wsRows=' + r.ws.length + ' paRows=' + r.pa.length + ' -> ' + out);
  return { wsFile, paFile };
}
// preflight JSON + the operator's choices → site, with every refusal the spec names
function siteFrom(pre, role, targets) {
  if (role == null) refuse('no role given: --role, one of: ' + (pre.roles || []).map(x => x.id + ' ' + x.name).join(', '));
  if (!(pre.roles || []).some(x => Number(x.id) === Number(role))) refuse('role ' + role + ' is not a role of client ' + pre.client);
  if ((pre.existingTypes || []).length) refuse('already on the site: ' + pre.existingTypes.map(t => t.value + ' (client ' + t.client + ')').join(', '));
  if (Number(pre.existingGoals)) refuse(pre.existingGoals + ' CAPEX goals already in client ' + pre.client);
  return { client: pre.client, role: Number(role), currencies: pre.currencies, nextIds: pre.nextIds, stamp: pre.takenAt, targets };
}
module.exports = { render, write, siteFrom, preflightSql, parseScript, PA_DIR, WS_DIR, PA_FILES, WS_FILE, ID_TABLES };

if (require.main === module) {
  const a = process.argv.slice(2), opt = k => { const i = a.indexOf(k); return i < 0 ? undefined : a[i + 1]; };
  try {
    if (a[0] === '--preflight') { process.stdout.write(preflightSql(a[1])); process.exit(0); }
    if (!a[0] || !opt('--out')) { console.error('usage: site_migration.js --preflight <client> | <preflight.json> --role <id> --out <dir> [--targets <file>]'); process.exit(2); }
    const pre = JSON.parse(fs.readFileSync(a[0], 'utf8')), targets = opt('--targets') ? JSON.parse(fs.readFileSync(opt('--targets'), 'utf8')) : null;
    write(siteFrom(pre, opt('--role'), targets), opt('--out'));
  } catch (e) {
    if (e.refusal) { console.log('§SITE_MIG refused: ' + e.message); process.exit(2); }
    throw e;
  }
}
