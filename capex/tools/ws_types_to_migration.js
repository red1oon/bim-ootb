#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — capex/tools/ws_types_to_migration.js. Spec bim-ootb prompts/CAPEX_DASHBOARD.md §5.29; witness W-WS-MIG (capex/tests/witness_ws_migration.js). READ THE LOG: §WS_MIG_GEN lines.
// Extracts the CAPEX web-service types from the local pilot's rows into iDempiere migration scripts: one plain INSERT per row, only non-null columns, as ZK's "Log Migration Script" writes them
//   (format measured in ~/idempiere-dev-setup/idempiere/migration/iD13/postgresql/202601130707_IDEMPIERE-6815.sql). Reads the pilot, writes files, changes nothing on the server.
// Usage: node capex/tools/ws_types_to_migration.js
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', 'legacy');
const SITE = 'ws/migration/iD13/postgresql', TEST = 'ws_testserver/migration/iD13/postgresql';
const ROLE = 102;   // GardenWorld Admin. The pilot's other access rows on these types belong to the bridge lane's tenant (role 1000000), which a clean server does not have (§5.29 point 4).
const SCRIPTS = [
  { dir: SITE, file: '202611042300_CAPEX-WS-READ.sql', types: ['QueryCProject', 'QueryADOrg', 'QueryCProjectPhase', 'QueryCProjectTask', 'QueryCProjectLine', 'QueryCPhase', 'QueryCCurrency', 'QueryADWFActivity'],
    why: 'the 8 read-only types the CAPEX dashboard reads (capex/adapters.js LEGACY_TYPES). The ONLY CAPEX web-service script a site installs. A Filter parameter is Constant 1=1 (IDEMPIERE-1784); lookups go by DataRow keys.' },
  { dir: TEST, file: '202611042301_CAPEX-WS-PUSH.sql', types: ['BridgeCreateCProject', 'BridgeCreateCProjectPhase', 'BridgeCreateCProjectTask', 'BridgeCreateCUOM', 'BridgeCreateCProjectLine', 'QueryCUOM', 'QueryMProduct', 'QueryMProductCategory'],
    why: 'TEST SERVER ONLY, write access. The create types and find-or-create reads capex/tools/shed_twin.js pushes a fold with. A site pushes through the plugin org.idempiere.bimootb instead.' },
  { dir: TEST, file: '202611042302_CAPEX-WS-PHASE.sql', types: ['BridgeUpdateCProjectPhase'],
    why: 'TEST SERVER ONLY, write access. Marks a project phase complete: input whitelist IsComplete only (MProjectPhase has no save rule on it).' },
  { dir: TEST, file: '202611042303_CAPEX-WS-PA.sql', types: ['BridgeCreatePAGoal', 'QueryPAGoal', 'BridgeUpdatePAGoal'],
    why: 'TEST SERVER ONLY, write access. Creates a PA goal, reads it back, saves a target: a model save with a changed target is what makes legacy run the measure SQL (MGoal.afterSave -> updateGoal(true)).' },
  { dir: TEST, file: '202611042304_CAPEX-WS-PROGRESS.sql', types: ['CapexUpdateCProject', 'CapexUpdateCProjectLine', 'CapexUpdateCInvoice', 'Capex_RunProcess_ProjectClose'],
    why: 'TEST SERVER ONLY, write access. Real activity through iDempiere (capex/tools/pilot_progress.js, §5.28): update whitelists of what a user types in the stock window + the stock Close Project (AD_Process 227). pilot_progress.js also borrows BridgeCreateInvoice, BridgeCreateInvoiceLine, BridgeCreateProjectIssue from the bridge lane; those are not here.' }
];
// [AD_Table name, key column], in FK order
const TABLES = [['WS_WebServiceType', 'WS_WebServiceType_ID'], ['WS_WebServiceTypeAccess', null], ['WS_WebService_Para', 'WS_WebService_Para_ID'], ['WS_WebServiceFieldInput', 'WS_WebServiceFieldInput_ID'], ['WS_WebServiceFieldOutput', 'WS_WebServiceFieldOutput_ID']];
const log = console.log;

function psql(sql) { return execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-U', 'adempiere', '-d', 'idempiere_pilot', '-v', 'ON_ERROR_STOP=1', '-qtA'], { input: 'SET search_path=adempiere;\n' + sql, maxBuffer: 256 << 20 }).toString().trim(); }
const rowsOf = sql => JSON.parse(psql('SELECT COALESCE(json_agg(x),\'[]\') FROM (' + sql + ') x;') || '[]');

// The column spelling the dictionary holds, as the ZK log writes it (a column missing from AD_Column keeps the catalog spelling).
const SPELLING = {};
rowsOf("SELECT c.columnname FROM ad_column c JOIN ad_table t USING (ad_table_id) WHERE t.tablename IN ('" + TABLES.map(t => t[0]).join("','") + "')").forEach(r => { SPELLING[r.columnname.toLowerCase()] = r.columnname; });
const q = s => "'" + String(s).replace(/'/g, "''") + "'";
const ts = s => "TO_TIMESTAMP('" + String(s).slice(0, 19).replace('T', ' ') + "','YYYY-MM-DD HH24:MI:SS')";
function insert(table, row) {
  const cols = Object.keys(row).filter(k => row[k] !== null);
  const vals = cols.map(k => (k === 'created' || k === 'updated') ? ts(row[k]) : typeof row[k] === 'number' ? String(row[k]) : q(row[k]));
  return 'INSERT INTO ' + table + ' (' + cols.map(k => SPELLING[k] || k).join(',') + ') VALUES (' + vals.join(',') + ')\n;\n';
}

const written = [];
SCRIPTS.forEach(s => {
  const types = rowsOf("SELECT * FROM ws_webservicetype WHERE value IN ('" + s.types.join("','") + "') ORDER BY ws_webservicetype_id");
  const missing = s.types.filter(v => !types.some(t => t.value === v));
  if (missing.length) { log('§WS_MIG_GEN FAIL ' + s.file + ' missing on the pilot: ' + missing.join(',')); process.exit(1); }
  const ids = types.map(t => t.ws_webservicetype_id);
  const custom = psql('SELECT COUNT(*) FROM (SELECT ad_column_id FROM ws_webservicefieldinput WHERE ws_webservicetype_id IN (' + ids + ') UNION ALL SELECT ad_column_id FROM ws_webservicefieldoutput WHERE ws_webservicetype_id IN (' + ids + ')) u WHERE ad_column_id >= 1000000;');
  if (custom !== '0') { log('§WS_MIG_GEN FAIL ' + s.file + ' uses ' + custom + ' custom columns: a clean server does not have them'); process.exit(1); }
  const head = '-- ' + s.file.replace(/^\d+_|\.sql$/g, '') + ' (bim-ootb prompts/CAPEX_DASHBOARD.md §5.29, LEGACY CONVENTION): ' + s.why + '\n' +
    '-- Rows extracted from the local pilot by capex/tools/ws_types_to_migration.js. Hard-coded for now: client 11, role ' + ROLE + ' (GardenWorld Admin), these ids. Run update_sequences() after applying, then restart the server: WS types and access are cached.\n' +
    '-- Restore: DELETE FROM WS_WebServiceFieldOutput, WS_WebServiceFieldInput, WS_WebService_Para, WS_WebServiceTypeAccess, then WS_WebServiceType WHERE WS_WebServiceType_ID IN (' + ids.join(',') + '); restart.\n' +
    "SELECT register_migration_script('" + s.file + "') FROM dual;\n";
  let body = '', counts = {};
  types.forEach(t => {
    body += '\n-- Nov 4, 2026 — ' + t.value + '\n';
    TABLES.forEach(([table, key]) => {
      const rows = rowsOf('SELECT * FROM ' + table.toLowerCase() + ' WHERE ws_webservicetype_id=' + t.ws_webservicetype_id + (table === 'WS_WebServiceTypeAccess' ? ' AND ad_role_id=' + ROLE : '') + (key ? ' ORDER BY ' + key.toLowerCase() : ''));
      rows.forEach(r => {
        // §5.29 point 3: the one row that differs from the pilot. The pilot keeps its Free Filter: the bridge lane reads QueryADOrg with a filter.
        if (table === 'WS_WebService_Para' && r.parametername === 'Filter') { r.parametertype = 'C'; r.constantvalue = '1=1'; }
        body += insert(table, r);
      });
      counts[table] = (counts[table] || 0) + rows.length;
    });
  });
  const out = path.join(ROOT, s.dir, s.file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, head + body);
  written.push(s.file);
  log('§WS_MIG_GEN file=' + s.dir + '/' + s.file + ' types=' + types.length + ' ' + Object.keys(counts).map(k => k + '=' + counts[k]).join(' '));
});
log('§WS_MIG_GEN done scripts=' + written.length);
