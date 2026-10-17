// ⚠ DO NOT REMOVE — W-WS-DIFF-PROCESS (bim-compiler prompts/ERP_WS_API.md S3). READ THE LOG (§WSP lines); exit code is not evidence.
// ISSUE it proves/disproves: run_process answers like REAL iDempiere - the same RunProcessResponse (Error/Summary/LogInfo, IsError) and the same effect on the data - for a process that has a
//   VERBATIM twin port (org.compiere.process.BOMVerify, AD_Process 53229). A process WITHOUT a port must answer like legacy would for a missing class, never a faked success (case: unported_process).
// Fixture: type 920004 (WsfRunBOMVerify, pilot_ws_write_types.sql) COPIED from the pilot to the twin. Verdict INCONCLUSIVE if no successful run was compared.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { start } = require('../ws_server.js');
const { PILOT, LOGIN, esc, pg, post, sqliteInsertsFromPilot } = require('./ws_diff_common.js');
function runXml(type, pid, fields, login) { const L = Object.assign({}, LOGIN, login || {});
  return '<?xml version="1.0" encoding="UTF-8"?><ModelRunProcessRequest xmlns="http://idempiere.org/ADInterface/1_0"><ModelRunProcess AD_Process_ID="' + pid + '" AD_Menu_ID="0" AD_Record_ID="0"><serviceType>' + esc(type) + '</serviceType><ParamValues>' +
    fields.map(f => '<field column="' + esc(f[0]) + '"><val>' + esc(f[1]) + '</val></field>').join('') + '</ParamValues></ModelRunProcess><ADLoginRequest><user>' + L.user + '</user><pass>' + L.pass + '</pass><lang>en_US</lang><ClientID>' + L.clientId + '</ClientID><RoleID>' + L.roleId + '</RoleID><OrgID>' + L.orgId + '</OrgID><WarehouseID>' + L.warehouseId + '</WarehouseID><stage>0</stage></ADLoginRequest></ModelRunProcessRequest>'; }
const un = (v) => String(v == null ? '' : v).replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function nrm(r) { if (r.status !== 200) return { http: r.status }; const g = (n) => (n === 'LogInfo' ? ((new RegExp('<(?:\\w+:)?LogInfo(?:/>|>([\\s\\S]*?)</(?:\\w+:)?LogInfo>)').exec(r.text) || [])[1] || '') : un((new RegExp('<(?:\\w+:)?' + n + '(?:/>|>([\\s\\S]*?)</(?:\\w+:)?' + n + '>)').exec(r.text) || [])[1])); return { isError: (/IsError="(\w+)"/.exec(r.text) || [])[1], error: g('Error'), summary: g('Summary'), log: g('LogInfo') }; }
(async () => {
  const fx = sqliteInsertsFromPilot(920004, 920004); const fxFile = path.join(os.tmpdir(), 'ws_process_fixture.sql'); fs.writeFileSync(fxFile, fx.sql);
  console.log('§WSP fixture rows copied from the pilot=' + fx.n);
  const server = await start(0, [fxFile]); const TWIN = 'http://localhost:' + server.address().port, K = server.kernel;
  const verified = (side, id) => side === 'pilot' ? (pg('select isverified from m_product where m_product_id=' + id)[0] || ['?'])[0] : ((K.one('select isverified from m_product where m_product_id=?', [id]) || {}).isverified || '?');
  const C = [
    { n: 'bom_product_chair', f: [['M_Product_ID', '133'], ['IsReValidate', 'N']], prod: 133 },
    { n: 'non_bom_product', f: [['M_Product_ID', '137'], ['IsReValidate', 'N']], prod: 137 },
    { n: 'bom_product_revalidate', f: [['M_Product_ID', '50007'], ['IsReValidate', 'Y']], prod: 50007 },
    { n: 'unknown_product', f: [['M_Product_ID', '999999'], ['IsReValidate', 'N']] },
    { n: 'unknown_parameter', f: [['M_Product_ID', '133'], ['Foo', 'x']] },
    { n: 'type_not_configured', t: 'NoSuchType', f: [] },
    { n: 'role_without_access', f: [['M_Product_ID', '133']], login: { roleId: 103 } },
  ];
  let judged = 0, failed = 0, ran = 0;
  for (const c of C) {
    const res = {};
    if (c.prod) { for (const t of ['pp_product_bom', 'pp_product_bomline']) {   // the same BOM rows on both sides (seed drift is not the engine under test)
        const cols = pg("select column_name from information_schema.columns where table_schema='adempiere' and table_name='" + t + "' order by ordinal_position").map(r => r[0]);
        const have = K.q('PRAGMA table_info(' + t + ')').map(x => x.name.toLowerCase()); const use = cols.filter(x => have.indexOf(x) >= 0);
        const key = t === 'pp_product_bom' ? 'm_product_id=' + c.prod : 'pp_product_bom_id in (select pp_product_bom_id from pp_product_bom where m_product_id=' + c.prod + ')';
        const rows = pg('select ' + use.join(',') + ' from ' + t + ' where ' + key); K.db.run('DELETE FROM ' + t + ' WHERE ' + key.replace(/m_product_id=/, 'm_product_id='));
        rows.forEach(r => K.db.run('INSERT INTO ' + t + ' (' + use.join(',') + ') VALUES (' + use.map(() => '?').join(',') + ')', r.map(v => v === '' ? null : v))); console.log('§WSP-SYNC ' + t + ' product ' + c.prod + ' rows=' + rows.length + ' copied from the pilot'); } }
    if (c.prod) { const pv = verified('pilot', c.prod); K.db.run('UPDATE m_product SET isverified=? WHERE m_product_id=?', [pv, c.prod]); console.log('§WSP-SYNC m_product ' + c.prod + ' isverified=' + pv + ' copied from the pilot'); }
    for (const side of ['pilot', 'twin']) { const r = await post(side === 'pilot' ? PILOT : TWIN, 'run_process', runXml(c.t || 'WsfRunBOMVerify', 53229, c.f, c.login)); res[side] = { n: nrm(r), v: c.prod ? verified(side, c.prod) : null }; }
    const same = JSON.stringify(res.pilot) === JSON.stringify(res.twin); judged++; if (!same) failed++; if (same && res.pilot.n.isError === 'false') ran++;
    console.log('§WSP ' + c.n + ' ' + (same ? 'MATCH ' + JSON.stringify(res.pilot) : 'DIFF\n   legacy=' + JSON.stringify(res.pilot) + '\n   twin  =' + JSON.stringify(res.twin)));
  }
  const verdict = ran === 0 ? 'INCONCLUSIVE' : failed ? 'RED' : 'GREEN';
  console.log('§WSP_VERDICT ' + verdict + ' judged=' + judged + ' failed=' + failed + ' successfulRunsCompared=' + ran + ' journalEntries=' + K.journal.length);
  server.close(); process.exit(verdict === 'GREEN' ? 0 : 1);
})().catch(e => { console.log('§WSP ERROR ' + e.stack); process.exit(2); });
