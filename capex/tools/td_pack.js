#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — capex/tools/td_pack.js (spec bim-ootb prompts/CAPEX_DASHBOARD.md §5.67). READ THE LOG: §TD_PACK_* lines; the exit code alone is not evidence.
// The film's 12 test projects (capex/tools/td_scenario.js, the ONE definition) as ONE 2Pack that a GardenWorld client admin packs in, on legacy iDempiere and on the twin alike.
// HOW (what a GardenWorld user would do): the rows are made by the twin's own model layer (capex/tools/twin_mockchain.js, noDocs: no orders / receipts / issues / invoices / payments, those are the
//   testers' hands-on exercise in the UAT Guide), then Packed Out as client 11 by the ONE Pack Out engine (erp/pipo_packout.js exportPackage, GenericPOElementHandler Data lines).
// Every row gets a STABLE UUID derived from its natural key, so a rebuilt pack updates the same rows instead of duplicating them. C_Project.C_Currency_ID is NOT packed: the project carries its
//   price list version and MProject.beforeSave (:413-419) sets the currency from that price list, on the client that packs it in. Dates are absolute for --today (the dashboard's spread holds near that day).
// File name = iDempiere's folder Pack In convention (PackInFolder.java:35-46): <yyyymmddHHMM>_GardenWorld_CAPEXTestData.zip → applied to the client whose Value is GardenWorld.
// Usage: NODE_PATH=<bim-ootb>/node_modules node capex/tools/td_pack.js [--today=YYYY-MM-DD] [--out=<dir>]
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto'), initSqlJs = require('sql.js');
const ROOT = path.join(__dirname, '..', '..'), PO = require(path.join(ROOT, 'erp/pipo_packout.js')), SC_ = require('./td_scenario.js'), log = console.log;
// Node 18's CompressionStream lacks 'deflate-raw' (the twin's Pack Out runs in the browser, where it exists): the SAME zip writer (pipo_packout.zip) gets it from zlib here, nothing else changes
try { new CompressionStream('deflate-raw'); } catch (e) { const zlib = require('zlib'), Native = globalThis.CompressionStream; globalThis.CompressionStream = function (fmt) { if (fmt !== 'deflate-raw') return new Native(fmt); const parts = []; return new TransformStream({ transform(c) { parts.push(Buffer.from(c)); }, flush(ctl) { ctl.enqueue(new Uint8Array(zlib.deflateRawSync(Buffer.concat(parts)))); } }); }; }
const arg = k => (process.argv.find(a => a.startsWith('--' + k + '=')) || '').slice(k.length + 3);
// a stable UUID from (table, natural key): md5, laid out as 8-4-4-4-12 with the RFC 4122 version/variant nibbles set (name-based, like v3)
function uu(table, key) { const h = crypto.createHash('md5').update('bimootb-capex-td|' + table + '|' + key).digest('hex').split(''); h[12] = '3'; h[16] = '89ab'[parseInt(h[16], 16) & 3]; const s = h.join(''); return s.slice(0, 8) + '-' + s.slice(8, 12) + '-' + s.slice(12, 16) + '-' + s.slice(16, 20) + '-' + s.slice(20, 32); }
async function pack(o) {
  o = o || {}; const TODAY = o.today || arg('today') || new Date().toISOString().slice(0, 10), OUTDIR = o.outDir || arg('out') || path.join(ROOT, 'capex/plugin/testdata_2pack');
  const tmp = path.join(os.tmpdir(), 'td_pack_' + process.pid + '.db'), { build } = require('./twin_mockchain.js');
  const _l = console.log, held = []; console.log = (...a) => held.push(a.join(' ')); let r; try { r = await build({ today: TODAY, out: tmp, noDocs: true, noCapexPack: true }); } finally { console.log = _l; }
  held.filter(l => /§TWIN_MOCK_BUILT|§TWIN_MOCK_ERROR|§PROJECT-CURRENCY/.test(l)).slice(0, 3).forEach(l => log(l.slice(0, 220)));
  if (!r || r.errs.length) throw new Error('scenario build failed: ' + JSON.stringify(r && r.errs));
  const SQL = await initSqlJs(), db = new SQL.Database(fs.readFileSync(tmp)); fs.unlinkSync(tmp);
  const q = (s, p) => { const st = db.prepare(s), out = []; try { if (p) st.bind(p); while (st.step()) { const x = st.getAsObject(), k = {}; Object.keys(x).forEach(c => { k[c.toLowerCase()] = x[c]; }); out.push(k); } } finally { st.free(); } return out; };
  const V = SC_.SC.map(s => "'" + s[0] + "'").join(','), PV = SC_.PRODUCTS.map(p => "'" + p[0] + "'").join(',');
  const PRJ = 'SELECT c_project_id FROM c_project WHERE ad_client_id=11 AND value IN (' + V + ')', PH = 'SELECT c_projectphase_id FROM c_projectphase WHERE c_project_id IN (' + PRJ + ')';
  // stable UUIDs (natural keys)
  const set = (t, id, key) => db.run('UPDATE ' + t + ' SET ' + t + '_uu=? WHERE ' + t + '_id=?', [uu(t, key), id]);
  q("SELECT m_product_category_id AS i, value AS v FROM m_product_category WHERE ad_client_id=11 AND value='TD Materials (test data)'").forEach(x => set('m_product_category', x.i, x.v));
  q('SELECT m_product_id AS i, value AS v FROM m_product WHERE ad_client_id=11 AND value IN (' + PV + ')').forEach(x => set('m_product', x.i, x.v));
  q('SELECT c_project_id AS i, value AS v FROM c_project WHERE c_project_id IN (' + PRJ + ')').forEach(x => set('c_project', x.i, x.v));
  q('SELECT ph.c_projectphase_id AS i, p.value AS v, ph.seqno AS s FROM c_projectphase ph JOIN c_project p ON p.c_project_id=ph.c_project_id WHERE ph.c_projectphase_id IN (' + PH + ')').forEach(x => set('c_projectphase', x.i, x.v + '|' + x.s));
  q('SELECT t.c_projecttask_id AS i, p.value AS v, ph.seqno AS s, t.seqno AS ts FROM c_projecttask t JOIN c_projectphase ph ON ph.c_projectphase_id=t.c_projectphase_id JOIN c_project p ON p.c_project_id=ph.c_project_id WHERE t.c_projectphase_id IN (' + PH + ')').forEach(x => set('c_projecttask', x.i, x.v + '|' + x.s + '|' + x.ts));
  q('SELECT l.c_projectline_id AS i, p.value AS v, ph.seqno AS s, m.value AS m FROM c_projectline l JOIN c_project p ON p.c_project_id=l.c_project_id JOIN c_projectphase ph ON ph.c_projectphase_id=l.c_projectphase_id JOIN m_product m ON m.m_product_id=l.m_product_id WHERE l.c_project_id IN (' + PRJ + ')').forEach(x => set('c_projectline', x.i, x.v + '|' + x.s + '|' + x.m));
  // Data lines: SELECT * except the columns the client must decide (IDEMPIERE-1563: a column the SQL does not select is excluded)
  const tid = t => q('SELECT ad_table_id AS i FROM ad_table WHERE lower(tablename)=?', [t])[0].i;
  const cols = (t, drop) => q('SELECT c.columnname AS n FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)=? AND c.isactive=\'Y\' AND (c.columnsql IS NULL OR c.columnsql=\'\')', [t]).map(x => x.n).filter(n => drop.indexOf(n.toLowerCase()) < 0);
  const lines = [
    ['m_product_category', "WHERE ad_client_id=11 AND value='TD Materials (test data)'", []],
    ['m_product', 'WHERE ad_client_id=11 AND value IN (' + PV + ')', []],
    ['c_project', 'WHERE c_project_id IN (' + PRJ + ')', ['c_currency_id']],
    ['c_projectphase', 'WHERE c_projectphase_id IN (' + PH + ')', []],
    ['c_projecttask', 'WHERE c_projectphase_id IN (' + PH + ')', []],
    ['c_projectline', 'WHERE c_project_id IN (' + PRJ + ')', []]
  ].map(([t, w, drop], i) => ({ type: 'D', line: (i + 1) * 10, ad_table_id: tid(t), sqlstatement: 'SELECT ' + cols(t, drop).join(',') + ' FROM ' + t + ' ' + w + ' ORDER BY ' + t + '_id' }));
  const counts = {}; lines.forEach(d => { const t = d.sqlstatement.slice(d.sqlstatement.indexOf(' FROM ') + 6).split(' ')[0], w = d.sqlstatement.slice(d.sqlstatement.indexOf(' FROM ' + t + ' ') + 7 + t.length).replace(/ ORDER BY [^)]*$/, ''); counts[t] = q('SELECT COUNT(*) AS n FROM ' + t + ' ' + w)[0].n; });
  const stamp = TODAY.replace(/-/g, '') + '1200', name = stamp + '_GardenWorld_CAPEXTestData';
  const header = { name: 'CAPEXTestData', pk_version: '1.0.0', releaseno: '13', version: TODAY, description: 'CAPEX dashboard test data: the 12 projects of the film (phases, tasks, lines, ticked phases), dates for ' + TODAY + '; documents are the UAT hands-on exercise (bim-ootb prompts/CAPEX_DASHBOARD.md §5.67)', username: 'bim-ootb', email: '', created: TODAY + ' 12:00:00', updated: TODAY + ' 12:00:00', isexportdictionaryentity: 'N', isincludeorganizationid: 'Y' };
  const res = PO.exportPackage(q, header, lines, { clientId: 11, say: m => log('  ' + m) }), bytes = await PO.packageZip(res);
  fs.mkdirSync(OUTDIR, { recursive: true }); const file = path.join(OUTDIR, name + '.zip'); fs.writeFileSync(file, Buffer.from(bytes));
  const curs = q('SELECT DISTINCT c_currency_id AS c FROM c_project WHERE c_project_id IN (' + PRJ + ')').map(x => x.c);
  log('§TD_PACK file=' + path.relative(ROOT, file) + ' bytes=' + bytes.length + ' today=' + TODAY + ' rows=' + JSON.stringify(counts) + ' builder_currency=' + curs.join(',') + ' (not packed: C_Currency_ID follows the price list on pack-in)' + ' stat=' + JSON.stringify(res.stat && { skipped: res.stat.skipped, dependencies: (res.stat.dependencies || []).length }));
  db.close(); return { file, xml: res.xml, counts, today: TODAY };
}
module.exports = { pack, uu };
if (require.main === module) pack().catch(e => { log('§TD_PACK_ERROR ' + (e && e.stack || e)); process.exit(1); });
