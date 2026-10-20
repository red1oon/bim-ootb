// ⚠ DO NOT REMOVE — W-WS-DIFF-PASSWORD (bim-compiler prompts/ERP_WS_API.md S8). READ THE LOG (§WSH lines); exit code is not evidence.
// ISSUE it proves/disproves: with USER_PASSWORD_HASH=Y the web-service login accepts a password exactly when REAL iDempiere does - for each stored-hash algorithm (NULL = SHA-512 x1000,
//   'SHA-512' = x310000, 'PBKDF2' = 600000 it.) the right password logs in and a wrong one is refused with the same text, on the pilot and on the twin (raw XML compared).
//   The hashes are made by erp/ws_password.js and written to the PILOT's ad_user rows: if the pilot logs the user in, the JS hash equals the Java hash (that is the proof, not a unit test).
// SIDE EFFECT (declared): flips the PILOT's sysconfig USER_PASSWORD_HASH to Y and RESTARTS the pilot server (the value is cached), then flips it back to N and restarts again in `finally`.
//   If this process is killed in between, restore by hand:  docker exec postgres psql -U postgres -d idempiere_pilot -c "update adempiere.ad_sysconfig set value='N' where name='USER_PASSWORD_HASH'"; ~/idempiere-pilot/stop.sh; ~/idempiere-pilot/start.sh
// Verdict INCONCLUSIVE (never PASS) if no successful login was compared. Argon2 is not ported (named). Run: node erp/tests/witness_ws_diff_password.js
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto'), { execSync } = require('child_process');
const { start } = require('../ws_server.js');
const { PILOT, LOGIN, esc, pg, post } = require('./ws_diff_common.js');
const { passwordHash } = require('../ws_password.js');
const glXml = (user, pass) => '<?xml version="1.0" encoding="UTF-8"?><ModelGetListRequest xmlns="http://idempiere.org/ADInterface/1_0"><ModelGetList><serviceType>WsfGetListRef</serviceType><AD_Reference_ID>135</AD_Reference_ID><Filter>Value LIKE \'C%\'</Filter></ModelGetList><ADLoginRequest><user>' + esc(user) + '</user><pass>' + esc(pass) + '</pass><lang>en_US</lang><ClientID>11</ClientID><RoleID>920100</RoleID><OrgID>11</OrgID><WarehouseID>103</WarehouseID><stage>0</stage></ADLoginRequest></ModelGetListRequest>';
const squash = (t) => t.replace(/\s+/g, ' ').replace(/<\?xml[^>]*\?>/, '').trim();
const restartPilot = async () => {
  try { execSync(os.homedir() + '/idempiere-pilot/stop.sh', { stdio: 'ignore' }); } catch (e) { /* already down */ }
  await new Promise(r => setTimeout(r, 4000)); execSync(os.homedir() + '/idempiere-pilot/start.sh', { stdio: 'ignore' });
  for (let i = 0; i < 90; i++) {   // up = a well-formed answer to a real web-service call
    await new Promise(r => setTimeout(r, 4000));
    try { const r = await post(PILOT, 'get_list', glXml('nobody', 'x')); if (/Error login - User invalid/.test(r.text)) return true; } catch (e) { /* not yet */ }
  }
  return false;
};
const USERS = [['WsfHashNull', null], ['WsfHash512', 'SHA-512'], ['WsfHashPbk', 'PBKDF2']];
(async () => {
  let judged = 0, failed = 0, okLogins = 0;
  const pw = 'Pw-' + crypto.randomBytes(6).toString('hex'), rows = USERS.map(([n, alg]) => { const salt = crypto.randomBytes(16).toString('hex'); return { n, alg, salt, hash: passwordHash(alg, pw, salt) }; });
  const cleanSql = "delete from ad_user_roles where ad_user_id in (select ad_user_id from ad_user where name like 'WsfHash%'); delete from ad_user where name like 'WsfHash%'";
  const insertSql = rows.map((r, i) => "insert into ad_user (ad_user_id,ad_client_id,ad_org_id,isactive,created,createdby,updated,updatedby,name,password,salt,passwordhashalgorithm,saltalgorithm,ad_user_uu) values (" + (920300 + i) + ",11,0,'Y',now(),100,now(),100,'" + r.n + "','" + r.hash + "','" + r.salt + "'," + (r.alg ? "'" + r.alg + "'" : 'NULL') + ",'DRBG',gen_random_uuid()); insert into ad_user_roles (ad_client_id,ad_org_id,ad_role_id,ad_user_id,created,createdby,updated,updatedby,isactive,ad_user_roles_uu) values (11,0,920100," + (920300 + i) + ",now(),100,now(),100,'Y',gen_random_uuid())").join('; ');
  let server;
  try {
    pg(cleanSql); pg(insertSql); pg("update ad_sysconfig set value='Y' where name='USER_PASSWORD_HASH'");
    console.log('§WSH pilot: USER_PASSWORD_HASH=Y, 3 hashed users written; restarting the pilot to drop its sysconfig cache');
    if (!(await restartPilot())) { console.log('§WSH ERROR pilot did not come back'); process.exitCode = 2; return; }
    // twin: the same rows + the switch (from the pilot's rows, no hand-copy)
    const tw = rows.map((r, i) => "INSERT OR REPLACE INTO ad_user (ad_user_id,ad_client_id,ad_org_id,isactive,name,password,salt,passwordhashalgorithm,saltalgorithm) VALUES (" + (920300 + i) + ",11,0,'Y','" + r.n + "','" + r.hash + "','" + r.salt + "'," + (r.alg ? "'" + r.alg + "'" : 'NULL') + ",'DRBG');\nINSERT INTO ad_user_roles (ad_client_id,ad_org_id,ad_role_id,ad_user_id,isactive) VALUES (11,0,920100," + (920300 + i) + ",'Y')").join(';\n');
    const fxRole = pg("select ad_role_id from ad_role where ad_role_id=920100").length;
    const rolesql = fs.existsSync(path.join(os.tmpdir(), 'ws_misc_fixture.sql')) ? fs.readFileSync(path.join(os.tmpdir(), 'ws_misc_fixture.sql'), 'utf8') : '';
    if (!fxRole || !rolesql) { console.log('§WSH ERROR run witness_ws_diff_misc.js first (it writes the role-inclusion fixture the twin needs)'); process.exitCode = 2; return; }
    const fxFile = path.join(os.tmpdir(), 'ws_pw_fixture.sql'); fs.writeFileSync(fxFile, rolesql + '\n' + tw + ";\nUPDATE ad_sysconfig SET value='Y' WHERE name='USER_PASSWORD_HASH';\n");
    server = await start(0, [fxFile]); const TWIN = 'http://localhost:' + server.address().port;
    const CASES = [];
    rows.forEach(r => { CASES.push([r.n + '_right_password', r.n, pw, 1]); CASES.push([r.n + '_wrong_password', r.n, pw + 'x', 0]); });
    CASES.push(['plain_user_not_hashed_is_refused', 'GardenAdmin', 'GardenAdmin', 0]);   // hash mode: a plain-stored password never matches (MUser.get :276-277)
    CASES.push(['unknown_user', 'NoSuchUserHere', pw, 0]);
    for (const [name, user, pass, expectOk] of CASES) {
      const a = squash((await post(PILOT, 'get_list', glXml(user, pass))).text), b = squash((await post(TWIN, 'get_list', glXml(user, pass))).text);
      const same = a === b, success = /<_0:Success>true/.test(a); judged++; if (!same) failed++; if (same && success) okLogins++;
      if (success !== !!expectOk) { failed++; console.log('§WSH ' + name + ' UNEXPECTED legacy ' + (success ? 'accepted' : 'refused')); }
      console.log('§WSH ' + name + ' ' + (same ? 'MATCH ' + (success ? 'logged in' : a.replace(/.*<_0:Error>([^<]*).*/, '$1')) : 'DIFF\n   legacy=' + a.slice(0, 300) + '\n   twin  =' + b.slice(0, 300)));
    }
  } finally {
    try { pg("update ad_sysconfig set value='N' where name='USER_PASSWORD_HASH'"); pg(cleanSql); } catch (e) { console.log('§WSH CLEANUP FAILED ' + e.message.split('\n')[0]); }
    if (server) server.close();
    await restartPilot(); console.log('§WSH pilot restored: USER_PASSWORD_HASH=N, users removed, restarted');
  }
  const verdict = okLogins === 0 ? 'INCONCLUSIVE' : failed ? 'RED' : 'GREEN';
  console.log('§WSH_VERDICT ' + verdict + ' judged=' + judged + ' failed=' + failed + ' successfulLoginsCompared=' + okLogins);
  process.exit(verdict === 'GREEN' ? 0 : 1);
})().catch(e => { console.log('§WSH ERROR ' + e.stack); process.exit(2); });
