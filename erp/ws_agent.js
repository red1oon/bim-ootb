#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// ws_agent.js - give an AI (or any integration) its OWN, least-privilege identity on the Kernel ERP web service (bim-compiler prompts/ERP_WS_API.md S5, docs/ERP_AI_ADVISORY.md).
//   Uses only legacy's own mechanisms - nothing AI-specific is added to the engine: a dedicated AD_User, a role of type WS (MRole ROLE_TYPES_WEBSERVICE, AbstractService.java:71) limited to ONE
//   organisation, and WS_WebServiceTypeAccess rows for exactly the service types you list. No row, no access: legacy answers "Login role does not have access to the service type".
//   The SQL it writes is the tenant's own config (like any extra SQL the host loads; a host started with --agents <dir> applies new files while running). Revoke = the user is deactivated.
// usage:  node erp/ws_agent.js create  --dir <agentsDir> --name <agent> --client 11 --org 11 --types QueryBPartner,ReadBPartner [--write]
//         ... create also takes  --read TABLE:Col,Col   a NEW query type for that table with exactly those output columns (and the same columns as filter inputs)
//                                --create TABLE:Col,Col a NEW create type whose input columns are exactly those (needs --write)
//                                --docaction TABLE:PR   a NEW doc-action type with the action FIXED (legacy's constant parameter; the AI cannot choose another). Prepare ('PR') needs --write;
//                                                       Complete/Close/Void/Reverse/ReActivate (CO CL VO RC RA RE) are refused unless --allow-final is given on purpose
//         node erp/ws_agent.js revoke  --dir <agentsDir> --name <agent>
//         node erp/ws_agent.js audit   --journal <file.jsonl>
// --write is REQUIRED to grant any create/update/delete/set_docaction/run_process type: a read-only request that lists a write type is refused (no silent privilege).
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const Kernel = require('./ws_kernel.js');
const METHOD_KIND = { 50027: 'read', 50028: 'read', 50023: 'read', 50024: 'write', 50025: 'write', 50026: 'write', 50021: 'write', 50022: 'write' };
function args(argv) { const o = { _: [] }; for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a.startsWith('--')) { const k = a.slice(2), v = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true; o[k] = (o[k] !== undefined && /^(read|create|docaction)$/.test(k)) ? [].concat(o[k], v) : v; } else o._.push(a); } return o; }
const lit = (v) => v == null ? 'NULL' : typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'";
function nextN(dir) { try { return fs.readdirSync(dir).filter(f => /^agent-.*\.sql$/.test(f) && !/revoke/.test(f)).length; } catch (e) { return 0; } }
async function create(o) {
  const dir = o.dir, name = o.name, client = Number(o.client || 11), org = Number(o.org || 11), types = String(o.types || '').split(',').map(s => s.trim()).filter(Boolean), write = !!o.write;
  const mk = [];   // NEW service types generated from --read / --create / --docaction
  const spec = (v) => { const [t, cs] = String(v).split(':'); return { table: t, cols: (cs || '').split(',').map(x => x.trim()).filter(Boolean) }; };
  [].concat(o.read || []).forEach(v => { const x = spec(v); mk.push({ kind: 'read', method: 50028, table: x.table, cols: x.cols, value: 'AI_Query_' + x.table }); });
  [].concat(o.create || []).forEach(v => { const x = spec(v); mk.push({ kind: 'create', method: 50024, table: x.table, cols: x.cols, value: 'AI_Create_' + x.table }); });
  [].concat(o.docaction || []).forEach(v => { const x = spec(v), act = x.cols[0]; if (!act) throw new Error('--docaction needs TABLE:ACTION'); if (/^(CO|CL|VO|RC|RA|RE)$/.test(act) && !o['allow-final']) throw new Error('refused: --docaction ' + x.table + ':' + act + ' completes, closes, voids or reverses a document; add --allow-final to grant that on purpose'); mk.push({ kind: 'docaction', method: 50021, table: x.table, cols: [], act: act, value: 'AI_DocAction_' + x.table + '_' + act }); });
  if (!dir || !name || (!types.length && !mk.length)) throw new Error('create needs --dir, --name and at least one of --types / --read / --create / --docaction (there is no "all")');
  fs.mkdirSync(dir, { recursive: true });
  const K = await Kernel.load([]);   // reads the tenant dictionary to resolve the types and refuse what was not asked for
  const rows = types.map(t => K.one("SELECT ws_webservicetype_id AS id, value, ws_webservicemethod_id AS m FROM ws_webservicetype WHERE value=? AND isactive='Y' AND ad_client_id IN (0,?) ORDER BY ad_client_id DESC", [t, client]));
  types.forEach((t, i) => { if (!rows[i]) throw new Error('service type not found: ' + t); });
  const writes = rows.filter(r => METHOD_KIND[r.m] === 'write').concat(mk.filter(m => m.kind !== 'read').map(m => ({ value: m.value })));
  if (writes.length && !write) throw new Error('refused: ' + writes.map(r => r.value).join(', ') + ' can change data; add --write to grant them on purpose');
  const wh = K.one('SELECT m_warehouse_id AS id FROM m_warehouse WHERE ad_org_id=? AND isactive=? ORDER BY m_warehouse_id', [org, 'Y']);
  mk.forEach(m => { const t = K.one('SELECT ad_table_id AS id FROM ad_table WHERE lower(tablename)=lower(?)', [m.table]); if (!t) throw new Error('table not found: ' + m.table); m.tableId = t.id; m.cols.forEach(c => { if (!K.one('SELECT 1 AS x FROM ad_column WHERE ad_table_id=? AND lower(columnname)=lower(?)', [t.id, c])) throw new Error('column not found: ' + m.table + '.' + c); }); });
  const n = nextN(dir), uid = 1700000 + n, rid = 1700000 + n, pass = crypto.randomBytes(18).toString('base64url');
  const sql = [
    '-- ws_agent.js create ' + name + ' (' + new Date().toISOString() + '): ONE identity, ONE organisation, ' + rows.length + ' service types' + (write ? ' (WRITE granted on purpose)' : ' (read only)'),
    `INSERT INTO ad_role (ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, name, description, userlevel, roletype, isaccessallorgs, ismanual) VALUES (${rid}, ${client}, 0, 'Y', datetime('now'), 100, datetime('now'), 100, ${lit('WS agent ' + name)}, 'least-privilege web-service role (ws_agent.js)', ' CO', 'WS', 'N', 'Y');`,
    `INSERT INTO ad_role_orgaccess (ad_role_id, ad_org_id, ad_client_id, isactive, created, createdby, updated, updatedby) VALUES (${rid}, ${org}, ${client}, 'Y', datetime('now'), 100, datetime('now'), 100);`,
    `INSERT INTO ad_user (ad_user_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, name, password, description) VALUES (${uid}, ${client}, 0, 'Y', datetime('now'), 100, datetime('now'), 100, ${lit(name)}, ${lit(pass)}, 'web-service identity (ws_agent.js)');`,
    `INSERT INTO ad_user_roles (ad_user_id, ad_role_id, ad_client_id, isactive, created, createdby, updated, updatedby) VALUES (${uid}, ${rid}, ${client}, 'Y', datetime('now'), 100, datetime('now'), 100);`]
    .concat(rows.map(r => `INSERT INTO ws_webservicetypeaccess (ad_client_id, ad_org_id, ad_role_id, createdby, updatedby, ws_webservicetype_id, isactive, isreadwrite, ws_webservicetypeaccess_uu) VALUES (${client}, 0, ${rid}, 100, 100, ${r.id}, 'Y', ${lit(METHOD_KIND[r.m] === 'write' ? 'Y' : 'N')}, ${lit(crypto.randomUUID())});`));
  mk.forEach((m, i) => {   // the rows an admin would key in the Web Service Security window (WS_WebServiceType + Para + FieldInput + FieldOutput), then granted to THIS role only
    const tid = 1710000 + n * 1000 + i * 100, now = "datetime('now')";
    sql.push(`INSERT INTO ws_webservicetype (ad_client_id, ad_org_id, ad_table_id, isactive, name, value, ws_webservice_id, ws_webservicemethod_id, ws_webservicetype_id, ws_webservicetype_uu, created, createdby, updated, updatedby) VALUES (${client}, 0, ${m.tableId}, 'Y', ${lit(m.value)}, ${lit(m.value)}, 50001, ${m.method}, ${tid}, ${lit(crypto.randomUUID())}, ${now}, 100, ${now}, 100);`);
    const para = (nm, ty, v, k) => `INSERT INTO ws_webservice_para (isactive, ad_client_id, ad_org_id, constantvalue, parametername, parametertype, ws_webservice_para_id, ws_webservicetype_id, ws_webservice_para_uu, createdby, updatedby) VALUES ('Y', ${client}, 0, ${lit(v)}, ${lit(nm)}, ${lit(ty)}, ${tid + 1 + k}, ${tid}, ${lit(crypto.randomUUID())}, 100, 100);`;
    if (m.kind === 'docaction') { sql.push(para('tableName', 'C', m.table, 0), para('recordID', 'F', '', 1), para('docAction', 'C', m.act, 2)); }
    else { sql.push(para('TableName', 'C', m.table, 0), para('RecordID', 'F', '', 1), para('Action', 'C', m.kind === 'read' ? 'Read' : 'Create', 2)); if (m.kind === 'read') sql.push(para('Filter', 'F', '', 3)); }
    const col = (c) => `(SELECT ad_column_id FROM ad_column WHERE ad_table_id=${m.tableId} AND lower(columnname)=lower(${lit(c)}))`;
    if (m.kind !== 'docaction') m.cols.forEach((c, j) => { sql.push(`INSERT INTO ws_webservicefieldinput (isactive, ad_client_id, ad_org_id, ad_column_id, ws_webservicetype_id, ws_webservicefieldinput_id, ws_webservicefieldinput_uu, createdby, updatedby) VALUES ('Y', ${client}, 0, ${col(c)}, ${tid}, ${tid + 20 + j}, ${lit(crypto.randomUUID())}, 100, 100);`);
      if (m.kind === 'read') sql.push(`INSERT INTO ws_webservicefieldoutput (isactive, ad_client_id, ad_org_id, ad_column_id, ws_webservicetype_id, ws_webservicefieldoutput_id, ws_webservicefieldoutput_uu, createdby, updatedby) VALUES ('Y', ${client}, 0, ${col(c)}, ${tid}, ${tid + 20 + j}, ${lit(crypto.randomUUID())}, 100, 100);`); });
    sql.push(`INSERT INTO ws_webservicetypeaccess (ad_client_id, ad_org_id, ad_role_id, createdby, updatedby, ws_webservicetype_id, isactive, isreadwrite, ws_webservicetypeaccess_uu) VALUES (${client}, 0, ${rid}, 100, 100, ${tid}, 'Y', ${lit(m.kind === 'read' ? 'N' : 'Y')}, ${lit(crypto.randomUUID())});`);
  });
  const file = path.join(dir, 'agent-' + String(n).padStart(3, '0') + '-' + name.replace(/\W+/g, '_') + '.sql'); fs.writeFileSync(file, sql.join('\n') + '\n');
  fs.writeFileSync(path.join(dir, '.agent-' + name.replace(/\W+/g, '_') + '.json'), JSON.stringify({ name, userId: uid, roleId: rid, client, org }));
  const creds = { user: name, pass, clientId: client, roleId: rid, orgId: org, warehouseId: wh ? wh.id : 0, serviceTypes: rows.map(r => r.value).concat(mk.map(m => m.value)), canWrite: writes.length > 0 };
  return { file, creds };
}
function revoke(o) {
  const meta = JSON.parse(fs.readFileSync(path.join(o.dir, '.agent-' + String(o.name).replace(/\W+/g, '_') + '.json'), 'utf8'));
  const file = path.join(o.dir, 'zz-revoke-' + Date.now() + '-' + String(o.name).replace(/\W+/g, '_') + '.sql');
  fs.writeFileSync(file, `-- ws_agent.js revoke ${o.name}: the identity stops logging in (legacy: AD_User inactive -> "Error login - User invalid")\nUPDATE ad_user SET isactive='N' WHERE ad_user_id=${meta.userId};\nUPDATE ad_role SET isactive='N' WHERE ad_role_id=${meta.roleId};\n`);
  return { file };
}
module.exports = { create, revoke, args };
if (require.main === module) {
  const o = args(process.argv.slice(2)), cmd = o._[0];
  (async () => {
    if (cmd === 'create') { const r = await create(o); console.log('§WS-AGENT created ' + r.file); console.log(JSON.stringify(r.creds, null, 2)); console.log('Store the password now as a secret; it is not shown again.'); }
    else if (cmd === 'revoke') { const r = revoke(o); console.log('§WS-AGENT revoke written ' + r.file); }
    else if (cmd === 'audit') { const v = Kernel.verifyJournal(fs.readFileSync(o.journal, 'utf8')); console.log('§WS-AUDIT ' + JSON.stringify(v)); process.exit(v.ok ? 0 : 1); }
    else { console.log('usage: ws_agent.js create|revoke|audit (see the header of this file)'); process.exit(2); }
  })().catch(e => { console.log('§WS-AGENT ERROR ' + e.message); process.exit(1); });
}
