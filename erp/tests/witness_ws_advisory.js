// ⚠ DO NOT REMOVE — W-WS-ADVISORY (bim-compiler prompts/ERP_WS_API.md S6, docs/ERP_AI_ADVISORY.md). READ THE LOG (§WSV lines); exit code is not evidence.
// ISSUE it proves/disproves: the advisory a user follows to put an AI on the twin WORKS AS WRITTEN. The witness reads the page itself: it runs the page's own `ws_agent.js create ...` command, starts a
//   host with the plugin config ACTIVE, then sends every `<!-- ws-run ... -->` request block IN ORDER (placeholders filled from the identity just created) and checks the stated outcome:
//   expect="..." (the answer contains it), capture=NAME (RecordID kept for later blocks), assert-order-status=XX (the order row afterwards). It also checks the page's safety claims by reading the result:
//   the AI never completed the order (status IP, not CO), the journal verifies and names the agent for every write, revoke stops the next call. A page with no runnable block prints INCONCLUSIVE.
// Run: [ADVISORY_DOC=/path/ERP_AI_ADVISORY.md] node erp/tests/witness_ws_advisory.js
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { start } = require('../ws_server.js'), Agent = require('../ws_agent.js'), Kernel = require('../ws_kernel.js');
const DOC = process.env.ADVISORY_DOC || path.join(os.homedir(), 'bim-compiler', 'docs', 'ERP_AI_ADVISORY.md');
const md = fs.readFileSync(DOC, 'utf8');
let fails = 0, judged = 0;
const v = (id, claim, ok, info, inc) => { if (inc) { fails++; console.log('§WSV ' + id + ' INCONCLUSIVE ' + claim); return; } judged++; if (!ok) fails++; console.log('§WSV ' + id + ' ' + (ok ? 'PASS' : 'FAIL') + ' ' + claim + (ok ? '' : ' ' + JSON.stringify(info))); };
const un = (s) => s.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function tokens(line) { return line.match(/"[^"]*"|'[^']*'|\S+/g).map(t => t.replace(/^["']|["']$/g, '')); }
(async () => {
  // 1 the page's own agent command
  const blk = (md.match(/```bash\n([\s\S]*?)```/g) || []).map(b => b.replace(/```bash\n|```/g, '').replace(/\\\n/g, ' ')).find(b => /ws_agent\.js create/.test(b));
  v('A0', 'the page contains the agent-create command', !!blk, {}, !blk); if (!blk) process.exit(3);
  const argv = tokens(blk.trim().split('\n').find(l => /ws_agent\.js create/.test(l))).slice(3), o = Agent.args(argv);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wsadv-')); o.dir = dir;
  const agent = await Agent.create(o), C = agent.creds;
  v('A1', 'ws_agent.js create (the page\'s own command) -> ' + C.serviceTypes.join(', '), C.serviceTypes.length === 5 && C.canWrite, C);
  let refused = null; try { const o2 = Agent.args(argv.concat(['--docaction', 'C_Order:CO'])); o2.dir = dir; o2.name = 'x-final'; await Agent.create(o2); } catch (e) { refused = e.message; }
  v('A2', 'the page\'s claim "--docaction C_Order:CO would be refused without --allow-final" holds: "' + refused + '"', !!refused && /allow-final/.test(refused), { refused });
  // 2 the host, plugin ACTIVE
  const cfg = path.join(dir, 'ws_host.json'), jr = path.join(dir, 'ws_journal.jsonl'); fs.writeFileSync(cfg, JSON.stringify({ plugin: 'org.idempiere.webservices', state: 'ACTIVE' }));
  const server = await start(0, [], { config: cfg, agentsDir: dir, journal: jr }); const B = 'http://127.0.0.1:' + server.address().port, K = server.kernel;
  await new Promise(r => setTimeout(r, 900));
  const vars = { USER: C.user, PASS: C.pass, CLIENT: C.clientId, ROLE: C.roleId, ORG: C.orgId, WH: C.warehouseId };
  // 3 the runnable blocks, in page order
  const re = /<!-- ws-run ([^>]*?) -->\s*```(xml|json)\n([\s\S]*?)```/g; let m, ran = 0, writes = 0;
  while ((m = re.exec(md))) {
    const a = {}; (m[1].match(/(\w[\w-]*)=("[^"]*"|\S+)/g) || []).forEach(kv => { const i = kv.indexOf('='); a[kv.slice(0, i)] = kv.slice(i + 1).replace(/^"|"$/g, ''); });
    const body = m[3].replace(/\{\{(\w+)\}\}/g, (x, k) => (vars[k] != null ? vars[k] : x));
    const json = a.format === 'json' || m[2] === 'json';
    const r = await fetch(B + '/ADInterface/services/rest/model_adservice/' + a.method, { method: 'POST', headers: { 'Content-Type': json ? 'application/json' : 'application/xml' }, body });
    const text = await r.text(); ran++;
    if (a.capture) { const id = (/RecordID="?(\d+)/.exec(text) || [])[1] || (/"@RecordID":(\d+)/.exec(text) || [])[1]; if (id) vars[a.capture] = id; }
    let ok = text.includes(un(a.expect || '')) || text.includes(a.expect || '') || un(text).includes(un(a.expect || ''));
    let extra = '';
    if (a['assert-order-status']) { const row = K.one('SELECT docstatus FROM c_order WHERE c_order_id=?', [Number(vars.ORDER_ID)]); ok = ok && row && row.docstatus === a['assert-order-status']; extra = ' order status=' + (row && row.docstatus); }
    if (/^(create_data|set_docaction)$/.test(a.method) && ok && /RecordID=/.test(text)) writes++;
    v('R-' + a.id, a.method + (json ? ' (json)' : '') + ' expect "' + a.expect + '"' + extra, ok, { answer: text.slice(0, 260) });
  }
  v('A3', 'the page has runnable request blocks (ran ' + ran + ')', ran >= 8, { ran }, ran === 0);
  const order = K.one('SELECT docstatus, docaction, grandtotal, createdby FROM c_order WHERE c_order_id=?', [Number(vars.ORDER_ID)]);
  v('A4', 'the AI never completed the order: ' + JSON.stringify(order), !!order && order.docstatus !== 'CO' && order.docstatus !== 'CL' && Number(order.createdby) === 1700000, { order }, !order);
  // 4 audit + revoke, as the page describes
  const ver = Kernel.verifyJournal(fs.readFileSync(jr, 'utf8')), actor = 'ws:' + C.user + '/client:' + C.clientId + '/role:' + C.roleId;
  v('A5', 'journal verifies and names the agent for every write: ' + JSON.stringify(ver.actors), ver.ok && ver.entries >= 4 && Object.keys(ver.actors).length === 1 && ver.actors[actor] === ver.entries, ver, ver.entries === 0);
  Agent.revoke({ dir, name: C.user }); await new Promise(r => setTimeout(r, 900));
  const after = await (await fetch(B + '/ADInterface/services/rest/model_adservice/query_data', { method: 'POST', headers: { 'Content-Type': 'application/xml' }, body: md.match(/<!-- ws-run id=read-partner method[\s\S]*?```xml\n([\s\S]*?)```/)[1].replace(/\{\{(\w+)\}\}/g, (x, k) => vars[k]) })).text();
  v('A6', 'after revoke the page\'s first request is refused: ' + (/<_0:Error>([^<]*)/.exec(after) || [])[1], /Error login - User invalid/.test(after));
  fs.writeFileSync(cfg, JSON.stringify({ state: 'STOPPED' }));
  const dark = (await fetch(B + '/ADInterface/services/rest/model_adservice/query_data', { method: 'POST', body: '<x/>' })).status;
  v('A7', 'with the plugin STOPPED the host answers ' + dark, dark === 404);
  console.log('§WSV_VERDICT ' + (fails ? 'RED' : 'GREEN') + ' judged=' + judged + ' failed=' + fails);
  server.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('§WSV ERROR ' + e.stack); process.exit(2); });
