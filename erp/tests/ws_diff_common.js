// ws_diff_common.js - shared request builders / normaliser / pilot fixture sync for the W-WS-DIFF-* witnesses (bim-compiler prompts/ERP_WS_API.md). Not a witness itself.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const PILOT = process.argv[2] || process.env.PILOT_WS_BASE || 'http://localhost:8088';
const LOGIN = { user: 'GardenAdmin', pass: 'GardenAdmin', clientId: 11, roleId: 102, orgId: 11, warehouseId: 103 };
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pg = (sql) => execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'idempiere_pilot', '-tA', '-F', '\u0001', '-c', 'set search_path=adempiere;' + sql], { encoding: 'utf8' }).split('\n').filter(l => l && l !== 'SET').map(l => l.split('\u0001'));
function crud(c, login) { const L = Object.assign({}, LOGIN, login || {});
  const f = (c.fields || []).map(x => '<field column="' + esc(x[0]) + '"' + (x[2] != null ? ' lval="' + esc(x[2]) + '"' : '') + '><val>' + esc(x[1]) + '</val></field>').join('');   // lval is an ATTRIBUTE of DataField (idempiere-schema.xsd :36-47)
  return '<?xml version="1.0" encoding="UTF-8"?><ModelCRUDRequest xmlns="http://idempiere.org/ADInterface/1_0"><ModelCRUD><serviceType>' + esc(c.type) + '</serviceType><TableName>' + esc(c.table) + '</TableName><RecordID>' + (c.id || 0) + '</RecordID><Action>' + c.action + '</Action><DataRow>' + f + '</DataRow></ModelCRUD>' +
    '<ADLoginRequest><user>' + L.user + '</user><pass>' + L.pass + '</pass><lang>en_US</lang><ClientID>' + L.clientId + '</ClientID><RoleID>' + L.roleId + '</RoleID><OrgID>' + L.orgId + '</OrgID><WarehouseID>' + L.warehouseId + '</WarehouseID><stage>0</stage></ADLoginRequest></ModelCRUDRequest>'; }
async function post(base, method, xml) { const r = await fetch(base + '/ADInterface/services/rest/model_adservice/' + method, { method: 'POST', headers: { 'Content-Type': 'application/xml', Accept: 'application/xml' }, body: xml }); return { status: r.status, text: await r.text() }; }
function norm(r) {   // -> { http } | { err } | { ok, id, out:[[col,value,text]] }
  if (r.status !== 200) return { http: r.status, body: r.text.trim() ? 'html' : 'empty' };
  const x = r.text, a = (n) => (new RegExp(n + '="([^"]*)"').exec(x.replace(/<_0:outputFields[\s\S]*$/, '')) || [])[1];
  const un = (v) => String(v == null ? v : v).replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  if (a('IsError') === 'true') { let e = un((/<(?:\w+:)?Error>([\s\S]*?)<\/(?:\w+:)?Error>/.exec(x) || [])[1]); e = e.replace(/\n\s*Detail:[\s\S]*$/, ''); return { err: e, id: a('RecordID') != null ? '#' : null }; }
  const out = []; const re = /<(?:\w+:)?outputField column="([^"]*)"(?: value="([^"]*)")?(?: Text="([^"]*)")?\/>/g; let m;
  while ((m = re.exec(x))) out.push([m[1], m[2] == null ? null : un(m[2]), m[3] == null ? null : un(m[3])]);
  return { ok: true, id: a('RecordID') != null ? '#' : null, out };
}
function sqliteInsertsFromPilot(lo, hi) {   // the twin gets EXACTLY the pilot's type rows
  const lines = ['DELETE FROM ws_webservicetypeaccess WHERE ws_webservicetype_id BETWEEN ' + lo + ' AND ' + hi + ';', 'DELETE FROM ws_webservicefieldoutput WHERE ws_webservicetype_id BETWEEN ' + lo + ' AND ' + hi + ';', 'DELETE FROM ws_webservicefieldinput WHERE ws_webservicetype_id BETWEEN ' + lo + ' AND ' + hi + ';',
    'DELETE FROM ws_webservice_para WHERE ws_webservicetype_id BETWEEN ' + lo + ' AND ' + hi + ';', 'DELETE FROM ws_webservicetype WHERE ws_webservicetype_id BETWEEN ' + lo + ' AND ' + hi + ';'];
  let n = 0;
  for (const t of ['ws_webservicetype', 'ws_webservice_para', 'ws_webservicefieldinput', 'ws_webservicefieldoutput', 'ws_webservicetypeaccess']) {
    const cols = pg("select column_name from information_schema.columns where table_schema='adempiere' and table_name='" + t + "' order by ordinal_position").map(r => r[0]);
    const rows = pg('select ' + cols.join(',') + ' from ' + t + ' where ws_webservicetype_id between ' + lo + ' and ' + hi);
    for (const r of rows) { lines.push('INSERT OR REPLACE INTO ' + t + ' (' + cols.join(',') + ") VALUES (" + r.map(v => v === '' ? 'NULL' : "'" + v.replace(/'/g, "''") + "'").join(',') + ');'); n++; }
  }
  return { sql: lines.join(';\n') + ';\n', n };
}
function docActionXml(d, login) { const L = Object.assign({}, LOGIN, login || {});
  return '<?xml version="1.0" encoding="UTF-8"?><ModelSetDocActionRequest xmlns="http://idempiere.org/ADInterface/1_0"><ModelSetDocAction><serviceType>' + esc(d.type) + '</serviceType><tableName>' + esc(d.table) + '</tableName><recordID>' + (d.id || 0) + '</recordID><docAction>' + esc(d.action) + '</docAction></ModelSetDocAction>' +
    '<ADLoginRequest><user>' + L.user + '</user><pass>' + L.pass + '</pass><lang>en_US</lang><ClientID>' + L.clientId + '</ClientID><RoleID>' + L.roleId + '</RoleID><OrgID>' + L.orgId + '</OrgID><WarehouseID>' + L.warehouseId + '</WarehouseID><stage>0</stage></ADLoginRequest></ModelSetDocActionRequest>'; }
module.exports = { PILOT, LOGIN, esc, pg, crud, docActionXml, post, norm, sqliteInsertsFromPilot };
