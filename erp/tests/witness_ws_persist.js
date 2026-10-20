// ⚠ DO NOT REMOVE — W-WS-PERSIST (bim-compiler prompts/ERP_WS_API.md S9). READ THE LOG (§WSZ lines); exit code is not evidence.
// ISSUE it proves/disproves: what the web-service host writes SURVIVES a restart, and only if the journal is intact. The signed, hash-chained journal now carries each op group's payload
//   (ids, stamps, uuids exactly as written); a host started on the same journal replays it over the shipped seed.
//   Z1 create + update + delete + a composite whose 2nd operation fails: after a restart the rows are there with the SAME ids and uuids, the deleted one is gone, the rolled-back composite left nothing
//   Z2 the chain continues across the restart: the next write's prev-hash is the last replayed entry's hash, and verifyJournal accepts the whole file
//   Z3 a host WITHOUT --journal forgets (control: persistence is the journal's doing)
//   Z4 a changed payload (one value edited in the file) makes the host REFUSE to start ("does not match its digest")      Z5 a changed chain line (actor edited) is refused ("does not verify")
// Each claim that judged nothing prints INCONCLUSIVE. Run: node erp/tests/witness_ws_persist.js
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { start } = require('../ws_server.js'), Kernel = require('../ws_kernel.js');
const { crud, post, norm, esc, sqliteInsertsFromPilot } = require('./ws_diff_common.js');
let fails = 0, judged = 0;
const v = (id, claim, ok, info) => { judged++; if (!ok) fails++; console.log('§WSZ ' + id + ' ' + (ok ? 'PASS' : 'FAIL') + ' ' + claim + (ok ? '' : ' ' + JSON.stringify(info).slice(0, 300))); };
const LOGIN = '<ADLoginRequest><user>GardenAdmin</user><pass>GardenAdmin</pass><lang>en_US</lang><ClientID>11</ClientID><RoleID>102</RoleID><OrgID>11</OrgID><WarehouseID>103</WarehouseID><stage>0</stage></ADLoginRequest>';
const bpOp = (val, name) => '<operation><TargetPort>createData</TargetPort><ModelCRUD><serviceType>WsfCreateBP</serviceType><TableName>C_BPartner</TableName><RecordID>0</RecordID><Action>Create</Action><DataRow>' + [['Value', val], ['Name', name], ['C_BP_Group_ID', '104'], ['SO_CreditLimit', '1']].map(f => '<field column="' + f[0] + '"><val>' + esc(f[1]) + '</val></field>').join('') + '</DataRow></ModelCRUD></operation>';
const comp = (ops) => '<?xml version="1.0" encoding="UTF-8"?><CompositeRequest xmlns="http://idempiere.org/ADInterface/1_0">' + LOGIN + '<serviceType>WsfComposite</serviceType><operations>' + ops.join('') + '</operations></CompositeRequest>';
(async () => {
  const fx = sqliteInsertsFromPilot(920001, 920003), fx2 = sqliteInsertsFromPilot(920008, 920008);
  const fxFile = path.join(os.tmpdir(), 'ws_persist_fixture.sql'); fs.writeFileSync(fxFile, fx.sql + fx2.sql + "INSERT OR REPLACE INTO ws_webservicetypeaccess (ad_client_id,ad_org_id,ad_role_id,createdby,updatedby,ws_webservicetype_id,isactive,isreadwrite) VALUES (11,0,102,100,100,920008,'Y','Y');\n");
  const jr = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wspers-')), 'journal.jsonl');
  const mk = (val, name) => crud({ type: 'WsfCreateBP', table: 'C_BPartner', action: 'Create', fields: [['Value', val], ['Name', name], ['C_BP_Group_ID', '104'], ['SO_CreditLimit', '1']] });
  // ---- run A
  let A = await start(0, [fxFile], { journal: jr }); let B = 'http://localhost:' + A.address().port;
  const c1 = norm(await post(B, 'create_data', mk('WSZ1', 'Zed One'))), c2 = norm(await post(B, 'create_data', mk('WSZ2', 'Zed Two')));
  const id1 = Number(c1.out.filter(o => o[0] === 'C_BPartner_ID')[0][1]), id2 = Number(c2.out.filter(o => o[0] === 'C_BPartner_ID')[0][1]);
  const u1 = norm(await post(B, 'update_data', crud({ type: 'WsfUpdateBP', table: 'C_BPartner', id: id1, action: 'Update', fields: [['Name', 'Zed One Updated'], ['TaxID', 'T-Z']] })));
  const d2 = norm(await post(B, 'delete_data', crud({ type: 'WsfDeleteBP', table: 'C_BPartner', id: id2, action: 'Delete' })));
  const cp = await (await fetch(B + '/ADInterface/services/rest/composite_service/composite_operation', { method: 'POST', headers: { 'Content-Type': 'application/xml' }, body: comp([bpOp('WSZ3', 'Zed Three'), bpOp('WSZ1', 'dup')]) })).text();
  const rowA = A.kernel.one("SELECT c_bpartner_id id, name, taxid, c_bpartner_uu uu FROM c_bpartner WHERE value='WSZ1'"), nA = A.kernel.journal.length, lastHash = A.kernel.journal[nA - 1].hash;
  const accts = A.kernel.one("SELECT count(*) n FROM c_bp_customer_acct WHERE c_bpartner_id=?", [id1]).n;
  A.close(); await new Promise(r => setTimeout(r, 200));
  // ---- run B (same journal)
  const Bs = await start(0, [fxFile], { journal: jr }); const BB = 'http://localhost:' + Bs.address().port, KB = Bs.kernel;
  const rowB = KB.one("SELECT c_bpartner_id id, name, taxid, c_bpartner_uu uu FROM c_bpartner WHERE value='WSZ1'"), gone = KB.one("SELECT count(*) n FROM c_bpartner WHERE value IN ('WSZ2','WSZ3')").n, acctsB = KB.one("SELECT count(*) n FROM c_bp_customer_acct WHERE c_bpartner_id=?", [id1]).n;
  v('Z1', 'after restart WSZ1 id ' + (rowB && rowB.id) + '=' + id1 + ' name "' + (rowB && rowB.name) + '" taxid ' + (rowB && rowB.taxid) + ' same uuid ' + (rowB && rowB.uu === rowA.uu) + '; deleted/rolled-back rows left=' + gone + '; child accounting rows ' + acctsB + '=' + accts,
    c1.ok && c2.ok && u1.ok && d2.ok && /IsRolledBack="true"/.test(cp) && rowB && rowB.id === rowA.id && rowB.name === 'Zed One Updated' && rowB.taxid === 'T-Z' && rowB.uu === rowA.uu && gone === 0 && acctsB === accts && accts > 0, { c1, rowA, rowB, gone, accts, acctsB });
  const c3 = norm(await post(BB, 'create_data', mk('WSZ4', 'Zed Four')));
  const last = KB.journal[KB.journal.length - 1], text = fs.readFileSync(jr, 'utf8'), ver = Kernel.verifyJournal(text);
  v('Z2', 'journal ' + nA + ' entries before restart; next write is #' + last.seq + ' with prev ' + last.prev.slice(0, 8) + ' = last hash ' + lastHash.slice(0, 8) + '; file verifies=' + ver.ok + ' (' + ver.entries + ' lines)', c3.ok && last.seq === nA + 1 && last.prev === lastHash && ver.ok && ver.entries === nA + 1, { last, ver });
  Bs.close();
  // ---- control: no journal
  const N = await start(0, [fxFile], {}); const nRow = N.kernel.one("SELECT count(*) n FROM c_bpartner WHERE value='WSZ1'").n; N.close();
  v('Z3', 'a host without a journal knows WSZ1: ' + nRow + ' rows (must be 0)', nRow === 0, { nRow });
  // ---- tamper payload
  const lines = text.split('\n').filter(Boolean), tp = path.join(path.dirname(jr), 'tampered.jsonl');
  fs.writeFileSync(tp, lines.map((ln, i) => i === 0 ? ln.replace('Zed One', 'Zed HACKED') : ln).join('\n') + '\n');
  let e4 = null; try { const S = await start(0, [fxFile], { journal: tp }); S.close(); } catch (e) { e4 = e.message; }
  v('Z4', 'edited payload value -> host start refused: "' + e4 + '"', !!e4 && /does not match its digest/.test(e4), { e4 });
  const cp2 = path.join(path.dirname(jr), 'chain.jsonl'); fs.writeFileSync(cp2, lines.map((ln, i) => i === 1 ? ln.replace(/"actor":"[^"]*"/, '"actor":"ws:intruder"') : ln).join('\n') + '\n');
  let e5 = null; try { const S = await start(0, [fxFile], { journal: cp2 }); S.close(); } catch (e) { e5 = e.message; }
  v('Z5', 'edited chain line -> host start refused: "' + e5 + '"', !!e5 && /does not verify/.test(e5), { e5 });
  console.log('§WSZ_VERDICT ' + (fails ? 'RED' : 'GREEN') + ' judged=' + judged + ' failed=' + fails);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('§WSZ ERROR ' + e.stack); process.exit(2); });
