// ⚠ DO NOT REMOVE — W-WS-PRINCIPAL (bim-compiler prompts/ERP_WS_API.md §12 "still open": the journal named the agent but not the PERSON who asked it). READ THE LOG (§WSP2 lines); exit code is not evidence.
// ISSUE it proves/disproves: an agent's write can be traced to the person who stood behind it, and that name cannot be forged by the agent (MCP confused-deputy / OWASP "user's context"):
//   P1 a request signed by a registered person (HMAC-SHA256 over sha256(body), key issued to that person at create time) runs and the journal entry records onBehalfOf=<person>
//   P2 a wrong signature is refused, NOTHING written, alert raised          P3 a name that is not registered for this identity is refused (a stated name is never trusted)
//   P4 one person's key cannot sign for another person (cross-key forgery refused)       P5 a signature is bound to the exact request: replayed on a different body it is refused
//   P6 with --require-principal an unsigned call is refused, nothing written, alert       P7 without it an unsigned call still runs and audit counts it as "(unsigned)"
//   P8 a staged (--approve-writes) request keeps the asking person AND the approver in the journal       P9 the agent's own credentials contain no person key (creds.principals is for the person)
// Each claim that judged nothing prints INCONCLUSIVE. Run: node erp/tests/witness_ws_principal.js
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto'), { execFile } = require('child_process');
const { start } = require('../ws_server.js'), Agent = require('../ws_agent.js'), Kernel = require('../ws_kernel.js');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const req = (C, type, val) => '<?xml version="1.0" encoding="UTF-8"?><ModelCRUDRequest xmlns="http://idempiere.org/ADInterface/1_0"><ModelCRUD><serviceType>' + type + '</serviceType><TableName>C_BPartner</TableName><RecordID>0</RecordID><Action>Create</Action><DataRow>' + [['Value', val], ['Name', 'n ' + val], ['C_BP_Group_ID', '104']].map(f => '<field column="' + f[0] + '"><val>' + esc(f[1]) + '</val></field>').join('') + '</DataRow></ModelCRUD><ADLoginRequest><user>' + C.user + '</user><pass>' + C.pass + '</pass><lang>en_US</lang><ClientID>' + C.clientId + '</ClientID><RoleID>' + C.roleId + '</RoleID><OrgID>' + C.orgId + '</OrgID><WarehouseID>' + C.warehouseId + '</WarehouseID><stage>0</stage></ADLoginRequest></ModelCRUDRequest>';
const sign = (key, body) => crypto.createHmac('sha256', key).update(crypto.createHash('sha256').update(body).digest('hex')).digest('hex');
const post = async (B, body, who, sig) => { const h = { 'Content-Type': 'application/xml' }; if (who) { h['X-On-Behalf-Of'] = who; h['X-On-Behalf-Sig'] = sig || ''; } return await (await fetch(B + '/ADInterface/services/rest/model_adservice/create_data', { method: 'POST', headers: h, body })).text(); };
const err = (x) => ((/<(?:\w+:)?Error>([\s\S]*?)<\/(?:\w+:)?Error>/.exec(x) || [])[1] || '').replace(/&apos;/g, "'");
const cli = (args) => new Promise(res => execFile('node', [path.join(__dirname, '..', 'ws_agent.js')].concat(args), { env: Object.assign({}, process.env, { NODE_PATH: os.homedir() + '/bim-ootb/node_modules' }) }, (e, so) => res({ rc: e ? e.code : 0, out: String(so) })));
const wait = (ms) => new Promise(r => setTimeout(r, ms));
let fails = 0, judged = 0;
const v = (id, claim, ok, info, inc) => { if (inc) { fails++; console.log('§WSP2 ' + id + ' INCONCLUSIVE ' + claim); return; } judged++; if (!ok) fails++; console.log('§WSP2 ' + id + ' ' + (ok ? 'PASS' : 'FAIL') + ' ' + claim + (ok ? '' : ' ' + JSON.stringify(info).slice(0, 400))); };
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wsprin-')), jr = path.join(dir, 'journal.jsonl'), CRT = ['C_BPartner:Value,Name,C_BP_Group_ID'];
  const server = await start(0, [], { agentsDir: dir, journal: jr }); const B = 'http://127.0.0.1:' + server.address().port, K = server.kernel, PL = server.policy;
  const mk = async (name, extra) => { const a = await Agent.create(Object.assign({ dir, name, client: 11, org: 11, write: true, create: CRT }, extra || {})); await wait(800); return a.creds; };
  const rows = (like) => K.one("SELECT count(*) n FROM c_bpartner WHERE value LIKE ?", [like]).n;
  const lastMeta = () => { const l = fs.readFileSync(jr, 'utf8').split('\n').filter(Boolean).map(JSON.parse); return l[l.length - 1]; };
  const C = await mk('prin-req', { principals: 'alice,bob', 'require-principal': true }), key = Object.fromEntries(C.principals.map(p => [p.name, p.key]));
  const T = C.typePrefix + 'Create_C_BPartner';
  // P1
  const b1 = req(C, T, 'WSP-1'), r1 = await post(B, b1, 'alice', sign(key.alice, b1)), e1 = lastMeta();
  v('P1', 'alice signs -> "' + (err(r1) || 'ok') + '", rows=' + rows('WSP-1') + ', journal meta=' + JSON.stringify(e1.meta) + ' actor=' + e1.actor, !err(r1) && rows('WSP-1') === 1 && e1.meta && e1.meta.onBehalfOf === 'alice' && /prin-req/.test(e1.actor), { r1: err(r1), e1 });
  // P2
  const b2 = req(C, T, 'WSP-2'), r2 = await post(B, b2, 'alice', 'deadbeef');
  v('P2', 'wrong signature -> "' + err(r2) + '", rows=' + rows('WSP-2'), /on-behalf-of signature invalid/.test(err(r2)) && rows('WSP-2') === 0 && PL.alerts.some(a => a.kind === 'principal-mismatch'), { r2: err(r2) });
  // P3
  const b3 = req(C, T, 'WSP-3'), r3 = await post(B, b3, 'mallory', sign(crypto.randomBytes(32).toString('hex'), b3));
  v('P3', 'unregistered person "mallory" -> "' + err(r3) + '", rows=' + rows('WSP-3'), /signature invalid/.test(err(r3)) && rows('WSP-3') === 0, { r3: err(r3) });
  // P4
  const b4 = req(C, T, 'WSP-4'), r4 = await post(B, b4, 'alice', sign(key.bob, b4));
  v('P4', "bob's key claiming to be alice -> \"" + err(r4) + '", rows=' + rows('WSP-4'), /signature invalid/.test(err(r4)) && rows('WSP-4') === 0, { r4: err(r4) });
  // P5
  const b5 = req(C, T, 'WSP-5'), b5x = req(C, T, 'WSP-5X'), r5 = await post(B, b5x, 'alice', sign(key.alice, b5));
  v('P5', 'signature of request A replayed on request B -> "' + err(r5) + '", rows=' + rows('WSP-5%'), /signature invalid/.test(err(r5)) && rows('WSP-5%') === 0, { r5: err(r5) });
  // P6
  const r6 = await post(B, req(C, T, 'WSP-6'));
  v('P6', 'unsigned with --require-principal -> "' + err(r6) + '", rows=' + rows('WSP-6'), /must name, and sign for, the person/.test(err(r6)) && rows('WSP-6') === 0 && PL.alerts.some(a => a.kind === 'principal-missing'), { r6: err(r6) });
  // P7
  const U = await mk('prin-open', { principals: 'carol' }), r7 = await post(B, req(U, U.typePrefix + 'Create_C_BPartner', 'WSP-7')), e7 = lastMeta();
  v('P7', 'unsigned, no --require-principal -> "' + (err(r7) || 'ok') + '", rows=' + rows('WSP-7') + ', journal onBehalfOf=' + JSON.stringify(e7.meta && e7.meta.onBehalfOf), !err(r7) && rows('WSP-7') === 1 && !(e7.meta && e7.meta.onBehalfOf), { r7: err(r7), e7 });
  // P8
  const S = await mk('prin-staged', { principals: 'dave', 'approve-writes': true }), key8 = S.principals[0].key, b8 = req(S, S.typePrefix + 'Create_C_BPartner', 'WSP-8'), r8 = await post(B, b8, 'dave', sign(key8, b8));
  const p8 = JSON.parse(fs.readFileSync(path.join(dir, 'pending.json'), 'utf8')).find(x => x.state === 'PENDING' && x.actor && /prin-staged/.test(x.actor)), n8a = rows('WSP-8');
  const ap = p8 ? await cli(['approve', '--dir', dir, '--id', String(p8.id), '--digest', p8.digest, '--approver', 'erin']) : { out: 'no pending' }, e8 = lastMeta();
  v('P8', 'staged for dave (rows before approval=' + n8a + '), erin approves -> rows=' + rows('WSP-8') + ', journal meta=' + JSON.stringify(e8.meta), /Pending approval/.test(err(r8)) && n8a === 0 && rows('WSP-8') === 1 && e8.meta && e8.meta.onBehalfOf === 'dave' && e8.meta.approvedBy === 'erin', { r8: err(r8), ap: ap.out, e8 });
  // P9 + audit
  const ver = Kernel.verifyJournal(fs.readFileSync(jr, 'utf8')), agentSql = fs.readdirSync(dir).filter(f => /prin_req\.sql$/.test(f)).map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('');
  v('P9', 'journal verifies (' + ver.entries + ' entries), audit counts people ' + JSON.stringify(ver.principals) + '; the agent password is not the person key', ver.ok && ver.principals.alice === 1 && ver.principals.dave === 1 && ver.principals['(unsigned)'] >= 1 && C.pass !== key.alice && agentSql.indexOf(key.alice) > 0, { ver });
  console.log('§WSP2 alerts raised: ' + JSON.stringify(PL.alerts.reduce((o, a) => (o[a.kind] = (o[a.kind] || 0) + 1, o), {})));
  console.log('§WSP2_VERDICT ' + (fails ? 'RED' : 'GREEN') + ' judged=' + judged + ' failed=' + fails);
  server.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('§WSP2 ERROR ' + e.stack); process.exit(2); });
