// ⚠ DO NOT REMOVE — W-WS-VALIDATOR (bim-compiler prompts/ERP_WS_API.md S9). READ THE LOG (§WSY lines); exit code is not evidence.
// ISSUE it proves/disproves: IWSValidator - legacy's extension point on the web service (AbstractService.invokeWSValidator/invokeLoginValidator :615-665) - behaves as legacy defines it on the twin:
//   Y1 a validator at BEFORE_PARSE that throws refuses the request with ITS message and writes nothing            Y2 AFTER_PARSE may change the record: the change is what gets saved
//   Y3 AFTER_SAVE throwing rolls the whole save back (the row is not there)                                         Y4 a GLOBAL validator applies to every service type, and runs BEFORE the type's own
//   Y5 BEFORE_LOGIN refusing a user answers with the validator's text (no session)                                   Y6 ON_AUTHORIZATION refusing one service type leaves the others usable
//   Y7 with NO validator registered the same requests succeed (the validator, not the request, caused each refusal)  Y8 timings carry legacy's numbers (BEFORE_PARSE=1 ... ON_AUTHORIZATION=7)
// The pilot cannot run a twin JS validator (legacy validators are OSGi Java), so this is an own-property witness, not a diff. Each claim that judged nothing prints INCONCLUSIVE. Run: node erp/tests/witness_ws_validator.js
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { start } = require('../ws_server.js');
const { crud, post, norm, sqliteInsertsFromPilot } = require('./ws_diff_common.js');
const T = { BEFORE_PARSE: 1, AFTER_PARSE: 2, BEFORE_SAVE: 3, AFTER_SAVE: 4, BEFORE_LOGIN: 5, AFTER_LOGIN: 6, ON_AUTHORIZATION: 7 };
let fails = 0, judged = 0;
const v = (id, claim, ok, info) => { judged++; if (!ok) fails++; console.log('§WSY ' + id + ' ' + (ok ? 'PASS' : 'FAIL') + ' ' + claim + (ok ? '' : ' ' + JSON.stringify(info).slice(0, 300))); };
(async () => {
  const fx = sqliteInsertsFromPilot(920001, 920003), fxFile = path.join(os.tmpdir(), 'ws_val_fixture.sql'); fs.writeFileSync(fxFile, fx.sql);
  const order = [], calls = [];
  const VALS = [
    { type: 'GLOBAL', validate: (po, type, fields, timing) => { calls.push('G' + timing + ':' + type.value); order.push('global'); }, login: (req, type, timing) => { if (timing === T.BEFORE_LOGIN && req.user === 'Mallory') throw new Error('Mallory is not welcome here'); if (timing === T.ON_AUTHORIZATION && type.value === 'WsfUpdateBP') throw new Error('updates are closed today'); } },
    { type: 'WsfCreateBP', validate: (po, type, fields, timing) => {
      order.push('own');
      const tax = fields.filter(f => f.column === 'Name')[0];
      if (timing === T.BEFORE_PARSE && tax && tax.val === 'BLOCKME') throw new Error('Name BLOCKME is on the deny list');
      if (timing === T.AFTER_PARSE && tax && tax.val === 'REWRITE') po.name = 'REWRITTEN BY VALIDATOR';
      if (timing === T.AFTER_SAVE && tax && tax.val === 'ROLLBACK') throw new Error('post-save check failed');
    } },
  ];
  const run = async (validators) => {
    const server = await start(0, [fxFile], { validators }); const B = 'http://localhost:' + server.address().port, K = server.kernel;
    const mk = (val, name, login) => crud({ type: 'WsfCreateBP', table: 'C_BPartner', action: 'Create', fields: [['Value', val], ['Name', name], ['C_BP_Group_ID', '104'], ['SO_CreditLimit', '1']] }, login);
    const out = {};
    out.blocked = norm(await post(B, 'create_data', mk('WSY1', 'BLOCKME'))); out.blockedRows = K.one("SELECT count(*) n FROM c_bpartner WHERE value='WSY1'").n;
    out.rewrite = norm(await post(B, 'create_data', mk('WSY2', 'REWRITE'))); out.rewriteName = (K.one("SELECT name FROM c_bpartner WHERE value='WSY2'") || {}).name;
    out.rollback = norm(await post(B, 'create_data', mk('WSY3', 'ROLLBACK'))); out.rollbackRows = K.one("SELECT count(*) n FROM c_bpartner WHERE value='WSY3'").n;
    out.mallory = norm(await post(B, 'create_data', mk('WSY4', 'ok', { user: 'Mallory' })));
    out.update = norm(await post(B, 'update_data', crud({ type: 'WsfUpdateBP', table: 'C_BPartner', id: 118, action: 'Update', fields: [['Name', 'x']] })));
    out.create = norm(await post(B, 'create_data', mk('WSY5', 'fine')));
    server.close(); return out;
  };
  const withV = await run(VALS), cg = calls.slice(), ord = order.slice(0, 4);
  const without = await run([]);
  v('Y1', 'BEFORE_PARSE refusal -> "' + withV.blocked.err + '", rows=' + withV.blockedRows, withV.blocked.err === 'Name BLOCKME is on the deny list' && withV.blockedRows === 0, withV.blocked);
  v('Y2', 'AFTER_PARSE rewrite -> saved name "' + withV.rewriteName + '"', withV.rewrite.ok && withV.rewriteName === 'REWRITTEN BY VALIDATOR', { r: withV.rewrite, n: withV.rewriteName });
  v('Y3', 'AFTER_SAVE refusal -> "' + withV.rollback.err + '", rows=' + withV.rollbackRows, withV.rollback.err === 'post-save check failed' && withV.rollbackRows === 0, withV.rollback);
  v('Y4', 'GLOBAL runs for every type and before the type\'s own: ' + ord.join(','), ord[0] === 'global' && ord[1] === 'own' && cg.some(c => c === 'G1:WsfCreateBP') && cg.some(c => c === 'G4:WsfCreateBP'), { ord, cg: cg.slice(0, 6) });
  v('Y5', 'BEFORE_LOGIN refusal -> "' + withV.mallory.err + '"', withV.mallory.err === 'Mallory is not welcome here', withV.mallory);
  v('Y6', 'ON_AUTHORIZATION refuses WsfUpdateBP ("' + withV.update.err + '") while WsfCreateBP still works (' + (withV.create.ok ? 'ok' : withV.create.err) + ')', withV.update.err === 'updates are closed today' && withV.create.ok, { u: withV.update, c: withV.create });
  v('Y7', 'no validators: blocked name saves (' + (without.blocked.ok ? 'ok' : without.blocked.err) + '), rewrite keeps its name "' + without.rewriteName + '", update works (' + (without.update.ok ? 'ok' : without.update.err) + ')', without.blocked.ok && without.rewriteName === 'REWRITE' && without.rollback.ok && without.update.ok, without);
  v('Y8', 'timing numbers ' + JSON.stringify(T), T.BEFORE_PARSE === 1 && T.AFTER_SAVE === 4 && T.BEFORE_LOGIN === 5 && T.ON_AUTHORIZATION === 7, T);
  console.log('§WSY_VERDICT ' + (fails ? 'RED' : 'GREEN') + ' judged=' + judged + ' failed=' + fails);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('§WSY ERROR ' + e.stack); process.exit(2); });
