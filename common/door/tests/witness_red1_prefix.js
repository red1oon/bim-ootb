// ⚠ DO NOT REMOVE — W-RED1-PREFIX (bim-compiler prompts/CLI_ERP_IVR.md §41, the BUILD SPEC under it). READ THE LOG; an exit code is not evidence.
//   `#<text>` at the red1 prompt = legacy's Document Search (`/text` in the Global Search box, AbstractDocumentSearch.openDocumentsByDocumentNo) over the dictionary's AD_SearchDefinition
//   (the boot overlay erp/ad_search_overlay.js), in the login's client, only windows the role may open; `@` is reserved. Every expected value is an independent SQL on the RAW seed
//   (erp/ad_seed.db, which has no AD_SearchDefinition: the expected rows are the pilot's Order Search, C_Order.DocumentNo LIKE '<text>%' split on IsSOTrx), else INCONCLUSIVE.
//   P1 ISSUE (`#<number>` does not open the document): `#80001` at the top runs erp.search text=80001 and enters the ONE order the SQL finds (pwd shows its id)
//   P2 ISSUE (several hits are guessed between, or the client is ignored): `#80000` lists every hit the SQL finds in client 11 (sales window 1, purchase window 3), each with its line, and enters nothing
//   P3 ISSUE (`#` means something else in a kind, or fails on a number two tenants carry): inside `cd Order` (no role), `#80001` still enters order 101; inside record 100, `#80002` enters 102
//   P4 ISSUE (a miss is silent): `#99999999` is refused naming 99999999 and the definition searched
//   P5 ISSUE (`@` runs something, `#` alone does nothing): `@x` is refused as reserved; `#` alone prints its use
//   P6 ISSUE (transaction codes are not legacy's): `#O 80001` = P1; `#BP Joe` enters the business partner the BP definition's query finds through its user's name (SQL)
//   P7 ISSUE (the login's client is not the searched one, or `#` passes the login gate): role 1300102 (client 13): `#80001` before the login is held by the gate; after `login GardenAdmin` it enters
//      the client-13 order the SQL finds
//   P8 ISSUE (a role sees a window it is not granted): role 50004 (no AD_Window_Access to the order windows) finds nothing, and the refusal names the windows
//   Falsifiers: WORDS_BREAK=nohash (# is a door line: P1 must FAIL) · ERP_BREAK=noclient (the client is not filtered: P2 must FAIL) · ERP_BREAK=nosearchdef (no overlay: P1 and P6 must FAIL)
//   Run: node common/door/tests/witness_red1_prefix.js > common/door/tests/logs/red1_prefix.log 2>&1
'use strict';
const path = require('path'), cp = require('child_process'), fs = require('fs'), os = require('os');
const { kit, ROOT } = require('./_kit');
const k = kit('W-RED1-PREFIX'), RED1 = path.join(ROOT, 'common/door/red1.js');
const fresh = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'r1pfx_')); return { BIM_OBJECT_OPLOG: path.join(d, 'ops.jsonl'), BIM_DOOR_JOURNAL: path.join(d, 'j.jsonl'), RED1_HISTORY: path.join(d, 'h'), RED1_WARM: 'off' }; };
const session = (lines, env) => { const r = cp.spawnSync(process.execPath, [RED1], { input: lines.join('\n') + '\n', encoding: 'utf8', env: Object.assign({}, process.env, env), timeout: 280000 }); return { out: r.stdout || '', err: r.stderr || '' }; };
const wheres = (err) => (err.match(/^§RED1 typed n=\d+ where=.*$/mg) || []).map(l => JSON.parse(l.replace(/^.*where=/, '')));
const arrows = (out) => (out.match(/^→ .*$/mg) || []).map(l => l.slice(2));
const sq = (q) => JSON.parse(cp.spawnSync('sqlite3', ['-readonly', '-json', path.join(ROOT, 'erp/ad_seed.db'), q], { encoding: 'utf8' }).stdout || '[]');
const orders = (pfx, client) => sq("SELECT c_order_id AS id, documentno AS n, issotrx AS so FROM c_order WHERE upper(documentno) LIKE upper('" + pfx + "%') AND ad_client_id=" + client + ' ORDER BY c_order_id');
const pwdId = (out) => { const m = /^kind=\S+ id=(\d+)/m.exec(out); return m ? Number(m[1]) : null; };

const E = fresh();
// P1 P2 P4 P5 P6: one session at the top
const o1 = orders('80001', 11), o0 = orders('80000', 11), so0 = o0.filter(r => r.so === 'Y'), po0 = o0.filter(r => r.so === 'N');
const bp = sq("SELECT DISTINCT b.c_bpartner_id AS id FROM c_bpartner b JOIN ad_user u ON u.c_bpartner_id=b.c_bpartner_id WHERE (upper(b.name) LIKE 'JOE%' OR upper(u.name) LIKE 'JOE%') AND b.ad_client_id=11");
k.L('SQL #80001 client 11 ' + JSON.stringify(o1) + ' · #80000 ' + JSON.stringify(o0) + ' · BP Joe ' + JSON.stringify(bp));
const S = session(['#80001', 'pwd', 'cd', '#80000', 'pwd', '#99999999', '@x', '#', '#O 80001', 'pwd', 'cd', '#BP Joe', 'pwd'], E), A = arrows(S.out), W = wheres(S.err);
k.L('lines ' + JSON.stringify(A)); k.L('places ' + JSON.stringify(W)); k.L('screen\n' + S.out.split('\n').map(l => '    | ' + l).join('\n'));
const pwds = (S.out.match(/^kind=.*$|^\(nowhere.*$/mg) || []);
k.L('pwd lines ' + JSON.stringify(pwds));
if (o1.length !== 1) k.incon('P1', 'the seed does not hold exactly one client-11 order starting 80001: ' + JSON.stringify(o1));
else k.chk('P1 `#80001` runs erp.search text=80001 and enters the one order the SQL finds (id ' + o1[0].id + ')', A[0] === 'erp.search text=80001' && A.indexOf('mis.read kind=Order id=' + o1[0].id) >= 0 && pwds[0] === 'kind=Order id=' + o1[0].id, A[0] + ' · ' + pwds[0]);
if (!so0.length || !po0.length) k.incon('P2', 'the seed lacks a sales AND a purchase hit for 80000: ' + JSON.stringify(o0));
else {
  const listed = (S.out.match(/^ {4}Order (\S+) {2}→ {2}cd Order (\d+)$/mg) || []).map(l => Number(/cd Order (\d+)$/.exec(l)[1]));
  const head = new RegExp('^#80000: ' + o0.length + ' documents in 2 window\\(s\\)', 'm').test(S.out), sw = /^ {2}Sales Order window/m.test(S.out), pw = /^ {2}Purchase Order window/m.test(S.out);
  k.chk('P2 `#80000` lists the ' + o0.length + ' client-11 hits of the SQL (sales ' + so0.length + ', purchase ' + po0.length + ') each with its line, in two windows, and enters nothing',
    head && sw && pw && JSON.stringify(listed.slice().sort()) === JSON.stringify(o0.map(r => r.id).sort()) && pwds[1] === '(nowhere: cd <building> or cd <ERP kind>)', 'listed ' + JSON.stringify(listed) + ' head=' + head + ' windows=' + sw + '/' + pw + ' pwd ' + pwds[1]);
}
k.chk('P4 `#99999999` is refused naming 99999999 and the definition searched (Order Search)', /^#99999999: no document found for "99999999" \(Order Search/m.test(S.out), (S.out.match(/^#99999999.*$/m) || ['(none)'])[0]);
k.chk('P5 `@x` is refused as reserved, nothing runs for it; `#` alone prints its use', /^@x: @ is reserved/m.test(S.out) && !A.some(l => /@x/.test(l)) && /^#<text> is legacy's Document Search/m.test(S.out), (S.out.match(/^@x.*$/m) || ['(none)'])[0]);
if (bp.length !== 1 || o1.length !== 1) k.incon('P6', 'the SQL does not give one order / one partner: ' + JSON.stringify({ o1, bp }));
else k.chk('P6 `#O 80001` = P1 (order ' + o1[0].id + '); `#BP Joe` enters business partner ' + bp[0].id + ' (the BP query through its user)',
  A.indexOf('erp.search text="O 80001"') >= 0 && pwds[2] === 'kind=Order id=' + o1[0].id && A.indexOf('erp.search text="BP Joe"') >= 0 && pwds[3] === 'kind="Business Partner" id=' + bp[0].id, JSON.stringify(pwds.slice(2)));
// P3: in a kind and in a record (no role: two tenants carry the numbers)
const two = sq("SELECT count(*) AS n FROM c_order WHERE documentno='80001'")[0].n, o2 = orders('80002', 11);
const S3 = session(['cd Order', '#80001', 'pwd', 'cd ..', 'cd Order 100', '#80002', 'pwd'], fresh()), P3 = (S3.out.match(/^kind=.*$/mg) || []);
k.L('P3 lines ' + JSON.stringify(arrows(S3.out)) + ' pwd ' + JSON.stringify(P3) + ' (orders numbered 80001 across clients: ' + two + ')');
if (two < 2 || o2.length !== 1) k.incon('P3', 'the precondition (80001 carried by two tenants, one client-11 80002) does not hold');
else k.chk('P3 inside `cd Order`, `#80001` still enters order ' + o1[0].id + ' (the login\'s client; ' + two + ' tenants carry 80001); inside record 100, `#80002` enters ' + o2[0].id,
  P3[0] === 'kind=Order id=' + o1[0].id && P3[1] === 'kind=Order id=' + o2[0].id, JSON.stringify(P3));
// P7: the client filter and the login gate
const o13 = orders('80001', 13);
const S7 = session(['role 1300102', '#80001', 'login GardenAdmin', '#80001', 'pwd'], fresh()), A7 = arrows(S7.out), P7 = (S7.out.match(/^kind=.*$/mg) || []);
k.L('P7 lines ' + JSON.stringify(A7) + ' pwd ' + JSON.stringify(P7) + ' SQL client 13 ' + JSON.stringify(o13));
if (o13.length !== 1) k.incon('P7', 'the seed does not hold one client-13 order starting 80001');
else {
  const gated = A7.filter(l => /^erp\.search/.test(l)).length === 1 && /login first: client 13/.test(S7.out.split('GardenAdmin')[0] || S7.out);
  k.chk('P7 role 1300102: `#80001` before the login is held by the gate (no erp.search); after the login it enters the client-13 order ' + o13[0].id,
    gated && A7.indexOf('erp.search text=80001 role=1300102') >= 0 && P7[0] === 'kind=Order id=' + o13[0].id + ' role=1300102', 'searches=' + A7.filter(l => /^erp\.search/.test(l)).length + ' · ' + P7[0]);
}
// P8: a role with no window to open
const acc = sq("SELECT count(*) AS n FROM ad_window_access WHERE ad_role_id=50004 AND ad_window_id IN (143,181) AND isactive='Y'")[0].n;
const S8 = session(['role 50004', '#80001', 'pwd'], fresh()), P8 = (S8.out.match(/^kind=.*$|^role=.*$/mg) || []);
k.L('P8 screen ' + JSON.stringify((S8.out.match(/^#80001.*$/m) || [''])[0]) + ' pwd ' + JSON.stringify(P8) + ' (role 50004 grants on 143/181: ' + acc + ')');
if (acc !== 0) k.incon('P8', 'role 50004 is granted an order window');
else k.chk('P8 role 50004 (no order window granted) finds nothing, and the refusal names the windows', /^#80001: no document found for "80001" that role 50004 may open: its windows Sales Order are not granted/m.test(S8.out) && P8[0] === 'role=50004', (S8.out.match(/^#80001.*$/m) || ['(none)'])[0]);
k.end();
