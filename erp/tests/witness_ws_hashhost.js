// ⚠ DO NOT REMOVE — W-WS-HASHHOST (bim-compiler prompts/ERP_WS_API.md S8, docs/ERP_AI_ADVISORY.md). READ THE LOG (§WSK lines); exit code is not evidence.
// ISSUE it proves/disproves: a host started with --hash-passwords (USER_PASSWORD_HASH=Y, iDempiere's system-wide switch) keeps NO plain password anywhere:
//   K1 every previously plain user is converted (GardenAdmin still logs in with its old password, its stored value is a salted hash, salt present)
//   K2 an agent created with --hash-password logs in with the printed password, a wrong one is refused with legacy's text, and its identity file holds only the hash (the password text is absent)
//   K3 the same agent created WITHOUT --hash-password cannot log in on a hashing host (MUser.get :276-277: a stored plain text never matches a hash) - the flag is not optional there
// The hash itself is proved against REAL iDempiere by W-WS-DIFF-PASSWORD. Each claim that judged nothing prints INCONCLUSIVE. Run: node erp/tests/witness_ws_hashhost.js
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { start } = require('../ws_server.js'), Agent = require('../ws_agent.js');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const req = (u, p, role, wh) => '<?xml version="1.0" encoding="UTF-8"?><ModelCRUDRequest xmlns="http://idempiere.org/ADInterface/1_0"><ModelCRUD><serviceType>QueryBPartner</serviceType><TableName>C_BPartner</TableName><RecordID>0</RecordID><Action>Read</Action></ModelCRUD><ADLoginRequest><user>' + esc(u) + '</user><pass>' + esc(p) + '</pass><lang>en_US</lang><ClientID>11</ClientID><RoleID>' + role + '</RoleID><OrgID>11</OrgID><WarehouseID>' + wh + '</WarehouseID><stage>0</stage></ADLoginRequest></ModelCRUDRequest>';
const call = async (B, x) => (await (await fetch(B + '/ADInterface/services/rest/model_adservice/query_data', { method: 'POST', headers: { 'Content-Type': 'application/xml' }, body: x })).text());
const err = (x) => ((/<(?:\w+:)?Error>([\s\S]*?)<\/(?:\w+:)?Error>/.exec(x) || [])[1] || '');
let fails = 0, judged = 0;
const v = (id, claim, ok, info) => { judged++; if (!ok) fails++; console.log('§WSK ' + id + ' ' + (ok ? 'PASS' : 'FAIL') + ' ' + claim + (ok ? '' : ' ' + JSON.stringify(info).slice(0, 300))); };
const wait = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wshh-'));
  const server = await start(0, [], { agentsDir: dir, hashPasswords: true }); const B = 'http://127.0.0.1:' + server.address().port, K = server.kernel;
  const ga = K.one("SELECT password, salt, passwordhashalgorithm FROM ad_user WHERE name='GardenAdmin'"), plainLeft = K.one("SELECT count(*) n FROM ad_user WHERE password IS NOT NULL AND salt IS NULL").n;
  const g1 = await call(B, req('GardenAdmin', 'GardenAdmin', 102, 103)), g2 = await call(B, req('GardenAdmin', 'wrong', 102, 103));
  v('K1', 'GardenAdmin logs in with its old password (' + (err(g1) || 'ok') + '); stored value is a ' + (ga.password || '').length + '-hex hash, salt ' + (ga.salt || '').length + ' hex, algorithm ' + ga.passwordhashalgorithm + '; plain users left=' + plainLeft + '; wrong password -> "' + err(g2) + '"',
    !/Error login/.test(err(g1)) && ga.password !== 'GardenAdmin' && /^[0-9a-f]{128}$/.test(ga.password) && /^[0-9a-f]{32}$/.test(ga.salt) && plainLeft === 0 && /Error login - User invalid/.test(err(g2)), { ga, plainLeft });
  const H = (await Agent.create({ dir, name: 'hh-hashed', client: 11, org: 11, read: ['C_BPartner:Value,Name'], 'hash-password': true })).creds; await wait(900);
  const h1 = await call(B, req(H.user, H.pass, H.roleId, H.warehouseId).replace('QueryBPartner', H.typePrefix + 'Query_C_BPartner')), h2 = await call(B, req(H.user, H.pass + 'x', H.roleId, H.warehouseId).replace('QueryBPartner', H.typePrefix + 'Query_C_BPartner'));
  const files = fs.readdirSync(dir).filter(f => /^agent-.*hh_hashed\.sql$/.test(f)).map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('');
  v('K2', 'hashed agent: right password -> ' + (/<_0:DataRow>/.test(h1) ? 'rows' : 'NO rows: ' + err(h1)) + '; wrong -> "' + err(h2) + '"; identity file contains the password text: ' + files.includes(H.pass), /<_0:DataRow>/.test(h1) && !err(h1) && /Error login - User invalid/.test(err(h2)) && files.length > 0 && !files.includes(H.pass), { h1: err(h1), h2: err(h2) });
  const P = (await Agent.create({ dir, name: 'hh-plain', client: 11, org: 11, read: ['C_BPartner:Value,Name'] })).creds; await wait(900);
  const p1 = await call(B, req(P.user, P.pass, P.roleId, P.warehouseId).replace('QueryBPartner', P.typePrefix + 'Query_C_BPartner'));
  v('K3', 'plain-stored agent on a hashing host -> "' + err(p1) + '"', /Error login - User invalid/.test(err(p1)), { p1: err(p1) });
  console.log('§WSK_VERDICT ' + (fails ? 'RED' : 'GREEN') + ' judged=' + judged + ' failed=' + fails);
  server.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('§WSK ERROR ' + e.stack); process.exit(2); });
