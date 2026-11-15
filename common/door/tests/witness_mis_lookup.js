// ⚠ DO NOT REMOVE — W-MIS-LOOKUP (bim-compiler prompts/CLI_ERP_IVR.md §27: mis.lookup, the legal values of a column or a process parameter; §1d TA2). READ THE LOG; an exit code is not evidence.
//   L1 ISSUE (a lookup offers values its validation rule forbids): Generate PO from Project's C_ProjectPhase_ID with C_Project_ID=990000 == an independent SQL of that project's phases; project 101 gives a different list
//   L2 ISSUE (an unresolved @token@ shows the whole table): with no C_Project_ID the answer has NO rows and names the token (Env.java:1641-1645, MLookup.java:1128-1140)
//   L3 ISSUE (a List column's values or order differ from the dictionary): Project.ProjectCategory == AD_Ref_List of its reference, in the reference's order (IsOrderByValue)
//   L4 ISSUE (red1 run's pick list is not the filtered lookup): a session `run "Generate PO from Project"` picking Hospital is offered exactly L1's phases (+ "(leave it out)")
//   L5 ISSUE (a role is offered rows its access forbids, §1d TA5): Order.AD_Org_ID with role 103 == an independent SQL of the role's org access (and fewer than role 102's)
//   Falsifiers: LOOKUP_BREAK=norule (must FAIL L1) · LOOKUP_BREAK=unfiltered (must FAIL L2) · LOOKUP_BREAK=norole (must FAIL L5).
//   Run: node common/door/tests/witness_mis_lookup.js > common/door/tests/logs/mis_lookup.log 2>&1
'use strict';
const path = require('path'), cp = require('child_process'), fs = require('fs'), os = require('os');
const { kit, ROOT, DOOR } = require('./_kit');
const k = kit('W-MIS-LOOKUP'), RED1 = path.join(ROOT, 'common/door/red1.js');
const env = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mlk_')); return { BIM_OBJECT_OPLOG: path.join(d, 'o.jsonl'), BIM_DOOR_JOURNAL: path.join(d, 'j.jsonl'), RED1_WARM: 'off' }; };
const run = (argv, input) => { const r = cp.spawnSync(process.execPath, argv, { input: input || '', encoding: 'utf8', env: Object.assign({}, process.env, env()), timeout: 300000 }); return r.stdout || ''; };
const last = (o) => o.split('\n').filter(l => l.charAt(0) === '{').map(l => JSON.parse(l)).pop();
(async () => {
  const SQL = await require('sql.js')(), db = new SQL.Database(fs.readFileSync(path.join(ROOT, 'erp/ad_seed.db'))), q = (s) => { const r = db.exec(s); return r.length ? r[0].values : []; };
  // L1
  const want = (p) => q("SELECT c_projectphase_id FROM c_projectphase WHERE c_project_id=" + p + " AND isactive='Y'").map(r => r[0]).sort((a, b) => a - b);
  const got = (p) => { const e = last(run([DOOR, 'mis.lookup process="Generate PO from Project" column=C_ProjectPhase_ID C_Project_ID=' + p])); return { e, ids: e && e.answer ? e.answer.rows.map(r => r.value).sort((a, b) => a - b) : null }; };
  const a = got(990000), b = got(101), wa = want(990000), wb = want(101);
  k.L('L1 990000 lookup=' + JSON.stringify(a.ids) + ' sql=' + JSON.stringify(wa) + ' · 101 lookup=' + JSON.stringify(b.ids) + ' sql=' + JSON.stringify(wb) + ' rule=' + (a.e && a.e.answer && JSON.stringify(a.e.answer.valRule)));
  if (!wa.length) k.incon('L1', 'project 990000 has no phase in the seed');
  else k.chk('L1 the phases offered for project 990000 (' + wa.length + ') == an independent SQL, and project 101 gives its own list (' + wb.length + ')', JSON.stringify(a.ids) === JSON.stringify(wa) && JSON.stringify(b.ids) === JSON.stringify(wb) && JSON.stringify(wa) !== JSON.stringify(wb), 'got ' + (a.ids || []).length + '/' + (b.ids || []).length);
  // L2
  const u = last(run([DOOR, 'mis.lookup process="Generate PO from Project" column=C_ProjectPhase_ID']));
  k.chk('L2 with no C_Project_ID the lookup answers NO rows and names @C_Project_ID@', !!u && u.answer && u.answer.rows.length === 0 && /C_Project_ID/.test((u.answer.unresolved || []).join(',')), u && u.answer && ('rows=' + u.answer.rows.length + ' unresolved=' + u.answer.unresolved + ' why=' + u.answer.why));
  // L3
  const refv = q("SELECT c.ad_reference_value_id, r.isorderbyvalue FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id JOIN ad_reference r ON r.ad_reference_id=c.ad_reference_value_id WHERE lower(t.tablename)='c_project' AND lower(c.columnname)='projectcategory'")[0];
  const wl = refv ? q("SELECT value FROM ad_ref_list WHERE ad_reference_id=" + refv[0] + " AND isactive='Y' ORDER BY " + (refv[1] === 'Y' ? 'value' : 'name')).map(r => r[0]) : [];
  const l3 = last(run([DOOR, 'mis.lookup kind=Project column=ProjectCategory'])), gl = l3 && l3.answer ? l3.answer.rows.map(r => r.value) : null;
  k.chk('L3 Project.ProjectCategory offers the AD_Ref_List values in the reference\'s order (' + wl.join(',') + ')', wl.length > 0 && JSON.stringify(gl) === JSON.stringify(wl), JSON.stringify(gl));
  // L4
  const s4 = run([RED1], 'cd Project\nrun "Generate PO from Project"\n1\nq\n');
  const block = s4.split('run: pick Project Phase')[1] || '', offered = (block.split('Up/Down')[0].match(/· (\d+)\s*$/mg) || []).map(x => Number(x.replace(/\D/g, ''))).sort((x, y) => x - y);
  k.L('L4 offered=' + JSON.stringify(offered) + ' leave-out=' + /\(leave it out\)/.test(block));
  k.chk('L4 red1 `run` picking Hospital offers exactly L1\'s phases (and "(leave it out)", the parameter being optional)', JSON.stringify(offered) === JSON.stringify(wa) && /\(leave it out\)/.test(block), 'offered ' + offered.length + ' of ' + wa.length);
  // L5 the role's access (independent SQL: AD_Role_OrgAccess, the val rule's own condition)
  const lr = (r) => { const e = last(run([DOOR, 'mis.lookup kind=Order column=AD_Org_ID id=104 role=' + r])); return e && e.answer ? e.answer.rows.map(x => x.value).sort((x, y) => x - y) : null; };
  const g103 = lr(103), g102 = lr(102);
  const w103 = q("SELECT o.ad_org_id FROM ad_org o WHERE o.isactive='Y' AND o.ad_org_id<>0 AND o.issummary='N' AND o.ad_client_id IN (0,11) AND o.ad_org_id IN (SELECT ad_org_id FROM ad_role_orgaccess WHERE ad_role_id=103 AND isactive='Y')").map(r => r[0]).sort((x, y) => x - y);
  k.L('L5 role 103 lookup=' + JSON.stringify(g103) + ' sql=' + JSON.stringify(w103) + ' · role 102 lookup=' + JSON.stringify(g102));
  if (!w103.length) k.incon('L5', 'role 103 has no org access in the seed');
  else k.chk('L5 Order.AD_Org_ID for role 103 offers exactly its org access (' + w103.length + ', an independent SQL), fewer than role 102 (' + (g102 || []).length + ')', JSON.stringify(g103) === JSON.stringify(w103) && !!g102 && g102.length > g103.length, 'got ' + JSON.stringify(g103));
  k.end();
})().catch(e => { console.log('§W-MIS-LOOKUP FAIL ' + (e && e.stack || e)); process.exit(1); });
