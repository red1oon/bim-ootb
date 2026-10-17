// ⚠ DO NOT REMOVE — W-WS-LIMITS (bim-compiler prompts/ERP_WS_API.md S7, docs/ERP_AI_ADVISORY.md). READ THE LOG (§WSL lines); exit code is not evidence.
// ISSUE it proves/disproves: the controls the expert guidance asks for (OWASP LLM06 / AI Agent Security cheat sheet, MCP security best practices, NSA/CISA agentic-AI guidance) are enforced by the
//   HOST, so a looping or manipulated model cannot talk its way past them:
//   L1 safe defaults: a write identity made WITHOUT flags is short-lived (7 days), call-limited (120/min) and write-limited (50/h)
//   L2 expiry: an identity past its time is DEACTIVATED by the host and refused as legacy refuses a bad user ("Error login - User invalid"), with a §WS-ALERT
//   L3 write limit: write number N+1 is refused, NOTHING is written, reads still work, alert raised
//   L4 call limit: call number N+1 within the minute is refused, alert raised
//   L5 staged approval: with --approve-writes a write is NOT run ("Pending approval ... NOTHING was written"); `pending` lists it with a digest
//   L6 approval is bound to the exact request: a wrong digest is refused and runs nothing; the right digest runs it ONCE as the agent (createdby = the agent), a second approval is refused
//   L7 reject: a rejected request never runs     L8 the journal names the agent and records who approved
//   Each claim that judged nothing prints INCONCLUSIVE. Run: node erp/tests/witness_ws_limits.js
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { execFile } = require('child_process');
const { start } = require('../ws_server.js'), Agent = require('../ws_agent.js'), Kernel = require('../ws_kernel.js');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const wsReq = (C, type, fields, tbl) => '<?xml version="1.0" encoding="UTF-8"?><ModelCRUDRequest xmlns="http://idempiere.org/ADInterface/1_0"><ModelCRUD><serviceType>' + type + '</serviceType><TableName>' + (tbl || 'C_BPartner') + '</TableName><RecordID>0</RecordID><Action>' + (fields ? 'Create' : 'Read') + '</Action>' + (fields ? '<DataRow>' + fields.map(f => '<field column="' + f[0] + '"><val>' + esc(f[1]) + '</val></field>').join('') + '</DataRow>' : '') + '</ModelCRUD><ADLoginRequest><user>' + C.user + '</user><pass>' + C.pass + '</pass><lang>en_US</lang><ClientID>' + C.clientId + '</ClientID><RoleID>' + C.roleId + '</RoleID><OrgID>' + C.orgId + '</OrgID><WarehouseID>' + C.warehouseId + '</WarehouseID><stage>0</stage></ADLoginRequest></ModelCRUDRequest>';
const post = async (B, m, x) => (await (await fetch(B + '/ADInterface/services/rest/model_adservice/' + m, { method: 'POST', headers: { 'Content-Type': 'application/xml' }, body: x })).text());
const err = (x) => ((/<(?:\w+:)?Error>([\s\S]*?)<\/(?:\w+:)?Error>/.exec(x) || [])[1] || '').replace(/&apos;/g, "'");
const cli = (args) => new Promise(res => execFile('node', [path.join(__dirname, '..', 'ws_agent.js')].concat(args), { env: Object.assign({}, process.env, { NODE_PATH: os.homedir() + '/bim-ootb/node_modules' }) }, (e, so) => res({ rc: e ? e.code : 0, out: String(so) })));
let fails = 0, judged = 0;
const v = (id, claim, ok, info, inc) => { if (inc) { fails++; console.log('§WSL ' + id + ' INCONCLUSIVE ' + claim); return; } judged++; if (!ok) fails++; console.log('§WSL ' + id + ' ' + (ok ? 'PASS' : 'FAIL') + ' ' + claim + (ok ? '' : ' ' + JSON.stringify(info))); };
const wait = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wslim-')), jr = path.join(dir, 'journal.jsonl'), CRT = ['C_BPartner:Value,Name,C_BP_Group_ID'];
  const server = await start(0, [], { agentsDir: dir, journal: jr, noPolicy: process.env.WSL_BREAK === 'nopolicy' }); const B = 'http://127.0.0.1:' + server.address().port, K = server.kernel, PL = server.policy;
  const mk = async (name, extra) => { const a = await Agent.create(Object.assign({ dir, name, client: 11, org: 11, write: true, read: ['C_BPartner:Value,Name'], create: CRT }, extra || {})); await wait(800); return a.creds; };
  const newBP = (C, val) => wsReq(C, C.typePrefix + 'Create_C_BPartner', [['Value', val], ['Name', 'n ' + val], ['C_BP_Group_ID', '104']]);
  const readBP = (C) => wsReq(C, C.typePrefix + 'Query_C_BPartner', null);
  // L1 defaults
  const d = await mk('l1-default'); const pol = K.one('SELECT * FROM ws_agent_policy WHERE ad_user_id=(SELECT ad_user_id FROM ad_user WHERE name=?)', ['l1-default']);
  const hrs = (Date.parse(pol.expires_at) - Date.now()) / 3600000;
  v('L1', 'defaults without any flag: expires in ' + hrs.toFixed(1) + 'h, ' + pol.max_calls_per_minute + ' calls/min, ' + pol.max_writes_per_hour + ' writes/h, approval=' + pol.approve_writes, hrs > 160 && hrs <= 168.1 && Number(pol.max_calls_per_minute) === 120 && Number(pol.max_writes_per_hour) === 50, pol);
  // L2 expiry
  const e = await mk('l2-expiring', { expires: 0.0004 }); const ok0 = await post(B, 'query_data', readBP(e)); await wait(2200);
  const e2 = await post(B, 'query_data', readBP(e)), still = K.one("SELECT isactive FROM ad_user WHERE name='l2-expiring'");
  v('L2', 'before expiry the read works (' + ((ok0.match(/<_0:DataRow>/g) || []).length) + ' rows); after it: "' + err(e2) + '", user isactive=' + still.isactive, /<_0:DataRow>/.test(ok0) && /Error login - User invalid/.test(err(e2)) && still.isactive === 'N' && PL.alerts.some(a => a.kind === 'expired'), { e2: err(e2), still });
  // L3 write limit
  const w = await mk('l3-writer', { 'max-writes-per-hour': 2 }); const r = [];
  for (let i = 1; i <= 3; i++) r.push(await post(B, 'create_data', newBP(w, 'WSL3-' + i)));
  const made = K.q("SELECT value FROM c_bpartner WHERE value LIKE 'WSL3-%' ORDER BY value").map(x => x.value), rd = await post(B, 'query_data', readBP(w));
  v('L3', 'limit 2/h: writes 1,2 ok, write 3 refused "' + err(r[2]) + '"; rows made=' + made.join(',') + '; a read still works', !err(r[0]) && !err(r[1]) && /write limit reached/.test(err(r[2])) && made.join() === 'WSL3-1,WSL3-2' && /<_0:DataRow>/.test(rd) && PL.alerts.some(a => a.kind === 'write-limit'), { r: r.map(err), made });
  // L4 call limit
  const c = await mk('l4-caller', { 'max-calls-per-minute': 3 }); const cr = []; for (let i = 0; i < 4; i++) cr.push(err(await post(B, 'query_data', readBP(c))));
  v('L4', 'limit 3 calls/min: answers = [' + cr.map(x => x || 'ok').join(' | ') + ']', !cr[0] && !cr[1] && !cr[2] && /call limit reached/.test(cr[3]) && PL.alerts.some(a => a.kind === 'call-limit'), cr);
  // L5/L6/L7 staged approval
  const ap = await mk('l5-staged', { 'approve-writes': true }); const staged = await post(B, 'create_data', newBP(ap, 'WSL5-A')), after = K.one("SELECT count(*) n FROM c_bpartner WHERE value='WSL5-A'").n;
  const pend = JSON.parse(fs.readFileSync(path.join(dir, 'pending.json'), 'utf8')), p1 = pend.find(x => x.state === 'PENDING');
  v('L5', 'staged: "' + err(staged).slice(0, 90) + '..." rows written=' + after + '; pending list has #' + (p1 && p1.id) + ' digest ' + (p1 && p1.digest), /Pending approval/.test(err(staged)) && after === 0 && !!p1 && p1.digest.length === 12, { staged: err(staged), after, pend });
  const bad = await cli(['approve', '--dir', dir, '--id', String(p1.id), '--digest', '000000000000', '--approver', 'witness']), n0 = K.one("SELECT count(*) n FROM c_bpartner WHERE value='WSL5-A'").n;
  const good = await cli(['approve', '--dir', dir, '--id', String(p1.id), '--digest', p1.digest, '--approver', 'witness']), row = K.one("SELECT c_bpartner_id id, createdby FROM c_bpartner WHERE value='WSL5-A'");
  const again = await cli(['approve', '--dir', dir, '--id', String(p1.id) + '', '--digest', p1.digest, '--approver', 'witness']), cnt = K.one("SELECT count(*) n FROM c_bpartner WHERE value='WSL5-A'").n;
  const agentUid = K.one("SELECT ad_user_id id FROM ad_user WHERE name='l5-staged'").id;
  v('L6', 'wrong digest -> ' + (/ok":false|"ok": false/.test(bad.out) ? 'refused' : bad.out.slice(0, 80)) + ' (rows=' + n0 + '); right digest -> ' + (/"ok": true/.test(good.out) ? 'ran' : good.out.slice(0, 80)) + ' (createdby=' + (row && row.createdby) + ' = agent ' + agentUid + '); a 2nd approval -> rows still ' + cnt,
    n0 === 0 && /"ok": false/.test(bad.out.replace(/\s+/g, ' ').replace(/"ok":\s*false/, '"ok": false')) && /"ok": true/.test(good.out) && row && Number(row.createdby) === Number(agentUid) && cnt === 1, { bad: bad.out, good: good.out, row, cnt });
  const st2 = await post(B, 'create_data', newBP(ap, 'WSL5-B')), p2 = JSON.parse(fs.readFileSync(path.join(dir, 'pending.json'), 'utf8')).find(x => x.state === 'PENDING');
  const rj = await cli(['reject', '--dir', dir, '--id', String(p2.id), '--approver', 'witness']), nB = K.one("SELECT count(*) n FROM c_bpartner WHERE value='WSL5-B'").n;
  const late = await cli(['approve', '--dir', dir, '--id', String(p2.id), '--digest', p2.digest, '--approver', 'witness']), nB2 = K.one("SELECT count(*) n FROM c_bpartner WHERE value='WSL5-B'").n;
  v('L7', 'rejected request #' + p2.id + ' never runs: rows=' + nB + ', and a later approval is refused (rows=' + nB2 + ')', /"ok": true/.test(rj.out) && nB === 0 && /already REJECTED|"ok": false/.test(late.out) && nB2 === 0, { rj: rj.out, late: late.out });
  // L8 journal
  const ver = Kernel.verifyJournal(fs.readFileSync(jr, 'utf8')), lines = fs.readFileSync(jr, 'utf8').split('\n').filter(Boolean).map(JSON.parse), appr = lines.find(x => x.meta && x.meta.approvedBy);
  v('L8', 'journal verifies (' + ver.entries + ' entries) and the approved write records who approved: ' + JSON.stringify(appr && appr.meta), ver.ok && !!appr && appr.meta.approvedBy === 'witness' && /l5-staged/.test(appr.actor), { ver, appr });
  console.log('§WSL alerts raised: ' + JSON.stringify(PL.alerts.reduce((o, a) => (o[a.kind] = (o[a.kind] || 0) + 1, o), {})));
  console.log('§WSL_VERDICT ' + (fails ? 'RED' : 'GREEN') + ' judged=' + judged + ' failed=' + fails);
  server.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('§WSL ERROR ' + e.stack); process.exit(2); });
