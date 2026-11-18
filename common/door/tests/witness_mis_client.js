// ⚠ DO NOT REMOVE — W-MIS-CLIENT (bim-compiler prompts/CLI_ERP_IVR.md §31: a new record is made in the session's client, as legacy's login sets #AD_Client_ID). READ THE LOG; an exit code is not evidence.
//   C1 ISSUE (under a client-13 role a new record is made in client 11, and the role's own canUpdate refuses it) · C2 ISSUE (the fix moves a record made with no role or a client-11 role)
//   C3 ISSUE (the organisation is not the one legacy's login picks: Login.getOrgs by Name, the standing 11 when offered, else the first) · C4 ISSUE (a value given by name resolves in another client)
//   Every expected value is re-derived here by SQL on the seed, independent of erp_cli.js loginOf. The kind is M_Product_Category: client 13 of the seed holds no C_BP_Group, so a partner cannot be made there.
//   Falsifier: CLIENT_BREAK=fixed (every record in client 11, the defect) must FAIL C1, C3 and C4. Each claim can say VACUOUS.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { kit, tmp, run, ROOT, DOOR } = require('./_kit');
const k = kit('W-MIS-CLIENT');
(async () => {
  const dir = path.dirname(tmp('mc_')), SEED = path.join(ROOT, 'erp/ad_seed.db');
  const env = { BIM_OBJECT_OPLOG: path.join(dir, 'ops.jsonl'), BIM_DOOR_JOURNAL: path.join(dir, 'j.jsonl') };
  if (process.env.CLIENT_BREAK) env.CLIENT_BREAK = process.env.CLIENT_BREAK;
  const sq = (q) => JSON.parse(cp.spawnSync('sqlite3', ['-readonly', '-json', SEED, q], { encoding: 'utf8' }).stdout || '[]');
  const door = (line) => run(DOOR, ['--actor', 'human', line], env).then(r => { try { return JSON.parse(r.out); } catch (x) { return { status: 'unparseable', why: String(r.out).slice(0, 160) }; } });
  // the op the door wrote for a value, read back from the op-log (the record as replayed, not the answer's own word)
  const opOf = (value) => { let rows = []; try { rows = require('../ledger_sign.js').parseOps(fs.readFileSync(env.BIM_OBJECT_OPLOG, 'utf8')); } catch (e) { return null; }
    return rows.filter(o => o.op_type === 'CRUD_CREATE' && o.table === 'm_product_category' && o.fields && o.fields.value === value)[0] || null; };
  // legacy's login pick, re-derived: Login.getOrgs (client 0 + the role's client, all orgs or AD_Role_OrgAccess, by Name, summaries dropped with no org tree), 11 kept when offered, else the first
  const pick = (role) => { const r = sq('SELECT ad_client_id AS c, isaccessallorgs AS a FROM ad_role WHERE ad_role_id=' + role)[0];
    const orgs = sq("SELECT ad_org_id AS o FROM ad_org WHERE isactive='Y' AND issummary<>'Y' AND ad_client_id IN (0," + r.c + ')' + (r.a === 'Y' ? '' : " AND ad_org_id IN (SELECT ad_org_id FROM ad_role_orgaccess WHERE isactive='Y' AND ad_role_id=" + role + ')') + ' ORDER BY name').map(x => x.o);
    return { client: r.c, org: orgs.indexOf(11) >= 0 ? 11 : orgs[0], orgs }; };
  const mk = async (tag, role, parent) => { const v = 'WMC' + tag + process.pid, j = await door('mis.new kind=M_Product_Category Value=' + v + ' Name="W-MIS-CLIENT ' + tag + '" PlannedMargin=0' + (parent ? ' M_Product_Category_Parent_ID=' + parent : '') + (role ? ' role=' + role : ''));
    const op = opOf(v); k.L(tag + ' role=' + (role || '-') + ' status=' + j.status + (j.why ? ' why=' + JSON.stringify(String(j.why).slice(0, 140)) : '') + ' op client=' + (op && op.fields.ad_client_id) + ' org=' + (op && op.fields.ad_org_id) + ' parent=' + (op && op.fields.m_product_category_parent_id));
    return { j, op }; };
  const at = (x, c, o) => !!x.op && x.j.status === 'ok' && Number(x.op.fields.ad_client_id) === c && Number(x.op.fields.ad_org_id) === o;

  // ── C1: role 1300102 (client 13)
  const p13 = pick(1300102); k.L('C1 independent pick role 1300102: client=' + p13.client + ' org=' + p13.org + ' offered=' + p13.orgs.join(','));
  if (p13.client === 11 || !p13.orgs.length) k.incon('C1', 'VACUOUS: role 1300102 is not of another client, or is offered no organisation');
  else { const x = await mk('C1', 1300102); k.chk('C1 under role 1300102 a new Product Category is made, and the op-log row is in the role\'s client ' + p13.client + ', organisation ' + p13.org + ' (legacy\'s login pick)', at(x, p13.client, p13.org), 'status=' + x.j.status); }
  // ── C2: no role, role 102: unchanged (client 11, organisation 11)
  const a = await mk('C2a', null), b = await mk('C2b', 102), p102 = pick(102);
  k.chk('C2 with no role and with role 102 the record stays in client 11, organisation 11 (the door\'s standing login; role 102\'s independent pick is ' + p102.client + '/' + p102.org + ')', at(a, 11, 11) && at(b, 11, 11) && p102.client === 11 && p102.org === 11, 'no role=' + a.j.status + ' 102=' + b.j.status);
  // ── C3: role 1300103 (user level O, no organisation 0): its first organisation by name
  const p3 = pick(1300103); k.L('C3 independent pick role 1300103: client=' + p3.client + ' org=' + p3.org + ' offered=' + p3.orgs.join(','));
  if (!p3.orgs.length || p3.org === 0 || p3.org === 11) k.incon('C3', 'VACUOUS: the pick does not tell the first-of-list rule from organisation 0 or 11');
  else { const x = await mk('C3', 1300103); k.chk('C3 under role 1300103 the record is in client ' + p3.client + ', organisation ' + p3.org + ' (the first Login.getOrgs offers by Name)', at(x, p3.client, p3.org), 'status=' + x.j.status); }
  // ── C4: a parent given by NAME that exists in both clients resolves in the session's client
  const t = sq("SELECT ad_client_id AS c, m_product_category_id AS i FROM m_product_category WHERE name='Tools' AND ad_client_id IN (11,13)"), t13 = (t.filter(r => r.c === 13)[0] || {}).i, t11 = (t.filter(r => r.c === 11)[0] || {}).i;
  if (t13 == null || t11 == null) k.incon('C4', 'VACUOUS: no category named Tools in both clients');
  else { const x = await mk('C4', 1300102, 'Tools'), y = await mk('C4b', null, 'Tools');
    k.chk('C4 the parent "Tools" resolves to ' + t13 + ' (client 13) under role 1300102 and to ' + t11 + ' (client 11) with no role', !!x.op && Number(x.op.fields.m_product_category_parent_id) === t13 && !!y.op && Number(y.op.fields.m_product_category_parent_id) === t11, 'got ' + (x.op && x.op.fields.m_product_category_parent_id) + ' / ' + (y.op && y.op.fields.m_product_category_parent_id)); }
  k.end();
})();
