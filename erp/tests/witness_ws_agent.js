// ⚠ DO NOT REMOVE — W-WS-AGENT (bim-compiler prompts/ERP_WS_API.md S5, docs/ERP_AI_ADVISORY.md). READ THE LOG (§WSS lines); exit code is not evidence.
// ISSUE it proves/disproves: an AI (any integration) can be given its OWN least-privilege identity on the twin and CANNOT exceed it - and everything it does is attributable and stoppable:
//   S1 a read-only agent reads (rows came back)          S2 the same agent is REFUSED a write it was not granted (legacy text, no row changed)
//   S3 granting a write type without --write is refused AT CREATION (no silent privilege)
//   S4 a write agent writes, and the journal names THAT agent as actor     S5 a second organisation is out of reach (legacy refusal)
//   S6 revoke -> the next call is refused ("Error login - User invalid")   S7 the journal chain verifies; a tampered line breaks it (reported with its line number)
//   S8 FINDING, not a pass: stock iDempiere ships a 'WebService' user with the password 'WebService' and 16 service types - counted here so the advisory can say what to switch off.
// A claim that judged nothing prints INCONCLUSIVE. Run: node erp/tests/witness_ws_agent.js
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { start } = require('../ws_server.js'), Agent = require('../ws_agent.js'), Kernel = require('../ws_kernel.js');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const req = (c, L) => '<?xml version="1.0" encoding="UTF-8"?><ModelCRUDRequest xmlns="http://idempiere.org/ADInterface/1_0"><ModelCRUD><serviceType>' + c.type + '</serviceType><TableName>' + c.table + '</TableName><RecordID>' + (c.id || 0) + '</RecordID>' + (c.filter ? '<Filter>' + esc(c.filter) + '</Filter>' : '') + '<Action>' + (c.action || 'Read') + '</Action>' + (c.fields ? '<DataRow>' + c.fields.map(f => '<field column="' + f[0] + '"><val>' + esc(f[1]) + '</val></field>').join('') + '</DataRow>' : '') + '</ModelCRUD><ADLoginRequest><user>' + L.user + '</user><pass>' + L.pass + '</pass><lang>en_US</lang><ClientID>' + L.clientId + '</ClientID><RoleID>' + L.roleId + '</RoleID><OrgID>' + L.orgId + '</OrgID><WarehouseID>' + L.warehouseId + '</WarehouseID><stage>0</stage></ADLoginRequest></ModelCRUDRequest>';
const post = async (base, m, xml) => (await (await fetch(base + '/ADInterface/services/rest/model_adservice/' + m, { method: 'POST', headers: { 'Content-Type': 'application/xml', Accept: 'application/xml' }, body: xml })).text());
const err = (x) => ((/<(?:\w+:)?Error>([\s\S]*?)<\/(?:\w+:)?Error>/.exec(x) || [])[1] || '').replace(/&apos;/g, "'");
let fails = 0, judged = 0;
const v = (id, claim, ok, info, inc) => { if (inc) { fails++; console.log('§WSS ' + id + ' INCONCLUSIVE ' + claim); return; } judged++; if (!ok) fails++; console.log('§WSS ' + id + ' ' + (ok ? 'PASS' : 'FAIL') + ' ' + claim + (ok ? '' : ' ' + JSON.stringify(info))); };
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wsagents-')), jr = path.join(dir, 'journal.jsonl');
  const server = await start(0, [], { agentsDir: dir, journal: jr }); const B = 'http://localhost:' + server.address().port, K = server.kernel;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  // S1/S2
  const reader = await Agent.create({ dir, name: 'ai-reader', client: 11, org: 11, types: 'QueryBPartner,ReadBPartner' }); await wait(900);
  const RL = reader.creds;
  const q1 = await post(B, 'query_data', req({ type: 'QueryBPartner', table: 'C_BPartner', filter: "value='C&W'" }, RL)); const rows = (q1.match(/<_0:DataRow>/g) || []).length;
  v('S1', 'read-only agent reads: query_data returned ' + rows + ' row(s)', rows >= 1, err(q1) || q1.slice(0, 200), rows === 0 && !!err(q1) && false);
  const nBefore = K.one("SELECT count(*) n FROM c_bpartner WHERE value='WSAI1'").n;
  const w1 = await post(B, 'create_data', req({ type: 'CreateBPartner', table: 'C_BPartner', action: 'Create', fields: [['Value', 'WSAI1'], ['Name', 'AI wrote this'], ['C_BP_Group_ID', '104']] }, RL));
  const nAfter = K.one("SELECT count(*) n FROM c_bpartner WHERE value='WSAI1'").n;
  v('S2', 'read-only agent refused a write it was not granted, nothing written: "' + err(w1) + '"', /does not have access to the service type 'CreateBPartner'/.test(err(w1)) && nBefore === 0 && nAfter === 0, { e: err(w1), nBefore, nAfter });
  // S3
  let refused = null; try { await Agent.create({ dir, name: 'ai-sneaky', client: 11, org: 11, types: 'QueryBPartner,CreateBPartner' }); } catch (e) { refused = e.message; }
  v('S3', 'a write type without --write is refused at creation: "' + refused + '"', !!refused && /add --write/.test(refused), { refused });
  // S4
  const writer = await Agent.create({ dir, name: 'ai-writer', client: 11, org: 11, types: 'QueryBPartner,CreateBPartner,UpdateBPartner', write: true }); await wait(900);
  const WL = writer.creds, w2 = await post(B, 'create_data', req({ type: 'CreateBPartner', table: 'C_BPartner', action: 'Create', fields: [['Value', 'WSAI2'], ['Name', 'AI wrote this'], ['C_BP_Group_ID', '104']] }, WL));
  const made = K.one("SELECT c_bpartner_id AS id, createdby FROM c_bpartner WHERE value='WSAI2'"); const last = K.journal[K.journal.length - 1];
  v('S4', 'write agent wrote a partner (created by the agent user) and the journal names it: actor=' + (last && last.actor), !!made && last && /^ws:ai-writer\//.test(last.actor) && Number(made.createdby) === 1700001, { made, last, w2: err(w2) });
  // S5
  const otherOrg = K.one("SELECT ad_org_id AS id FROM ad_org WHERE ad_client_id=11 AND ad_org_id<>11 AND isactive='Y'");
  const o1 = otherOrg ? await post(B, 'query_data', req({ type: 'QueryBPartner', table: 'C_BPartner' }, Object.assign({}, RL, { orgId: otherOrg.id }))) : null;
  v('S5', 'a second organisation is out of reach: "' + (o1 && err(o1)) + '"', !!o1 && /org not allowed for this role/.test(err(o1)), { e: o1 && err(o1) }, !otherOrg);
  // S6
  Agent.revoke({ dir, name: 'ai-writer' }); await wait(900);
  const r1 = await post(B, 'create_data', req({ type: 'CreateBPartner', table: 'C_BPartner', action: 'Create', fields: [['Value', 'WSAI3'], ['Name', 'x'], ['C_BP_Group_ID', '104']] }, WL));
  v('S6', 'revoked agent is refused at login: "' + err(r1) + '" and no row was written', /Error login - User invalid/.test(err(r1)) && !K.one("SELECT 1 x FROM c_bpartner WHERE value='WSAI3'"), { e: err(r1) });
  // S7
  const text = fs.readFileSync(jr, 'utf8'), ver = Kernel.verifyJournal(text);
  v('S7a', 'journal chain verifies: ' + JSON.stringify(ver.actors) + ' entries=' + ver.entries, ver.ok && ver.entries >= 1, ver, ver.entries === 0);
  const lines = text.split('\n').filter(Boolean); const bad = lines.slice(); if (bad.length) { const e = JSON.parse(bad[0]); e.actor = 'ws:someone-else/client:11/role:1'; bad[0] = JSON.stringify(e); }
  const ver2 = Kernel.verifyJournal(bad.join('\n') + '\n');
  v('S7b', 'a tampered journal line breaks the chain at line ' + ver2.brokenAt + ' (' + ver2.why + ')', !ver2.ok && ver2.brokenAt === 1, ver2, !lines.length);
  // S8 finding
  const stock = K.one("SELECT (SELECT count(*) FROM ad_user u JOIN ad_user_roles ur ON ur.ad_user_id=u.ad_user_id WHERE ur.ad_role_id=50004 AND u.isactive='Y' AND u.password=u.name) AS defaultCredUsers, (SELECT count(*) FROM ws_webservicetypeaccess WHERE ad_role_id=50004 AND isactive='Y') AS types");
  console.log('§WSS S8 FINDING stock iDempiere (and so the twin seed) has ' + stock.defaultcredusers + ' active user(s) on the Web Service Execution role whose password equals the name, reaching ' + stock.types + ' service types: deactivate them before exposing a host (advisory §Before you connect)');
  console.log('§WSS_VERDICT ' + (fails ? 'RED' : 'GREEN') + ' judged=' + judged + ' failed=' + fails);
  server.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('§WSS ERROR ' + e.stack); process.exit(2); });
