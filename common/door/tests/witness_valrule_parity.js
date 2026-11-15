// ⚠ DO NOT REMOVE — W-VALRULE-PARITY (bim-compiler prompts/ERP_MIS_WINDOW_FROM_CSV.md §12.16: a validation rule and a foreign key on a door line, against legacy's web service). READ THE LOG; an exit code is not evidence.
//   V2 ISSUE (the door refuses, or changes, an explicit value outside its validation rule; legacy's save keeps it: the rule is what the window OFFERS)
//   V3 ISSUE (the door saves a foreign key that names no record; legacy's web service refuses it, PO.validForeignKeysEx) · V3b the same on an update · V3c a record of another tenant
//   V4 ISSUE (the door's answers differ from legacy's recorded answers: fixtures/valrule_legacy_2026-11-15.json)
//   Falsifier: FK_BREAK=nofk (must FAIL V3, V3b, V3c, V4). A claim with nothing to judge says INCONCLUSIVE, never PASS.
//   Run: node common/door/tests/witness_valrule_parity.js > common/door/tests/logs/valrule_parity.log 2>&1
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { kit, tmp, ROOT, DOOR } = require('./_kit');
const k = kit('W-VALRULE-PARITY');
(async () => {
  const dir = path.dirname(tmp('vr_')), env = { BIM_OBJECT_OPLOG: path.join(dir, 'v.ops.jsonl'), BIM_DOOR_JOURNAL: path.join(dir, 'v.j.jsonl') };
  const door = (line) => new Promise((res) => { let o = ''; const p = cp.spawn(process.execPath, [DOOR, '--actor', 'human', line], { cwd: dir, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'ignore'] }); p.stdout.on('data', d => { o += d; });
    p.on('close', () => { let j = null; try { j = JSON.parse(o.split('\n').filter(l => l.charAt(0) === '{').pop()); } catch (x) { /* null */ } res(j || { status: 'unparseable', why: o.slice(-300) }); }); });
  const nops = () => { try { return fs.readFileSync(env.BIM_OBJECT_OPLOG, 'utf8').split('\n').filter(Boolean).length; } catch (x) { return 0; } };
  const sq = (q) => JSON.parse(cp.spawnSync('sqlite3', ['-readonly', '-json', path.join(ROOT, 'erp/ad_seed.db'), q], { encoding: 'utf8' }).stdout || '[]');
  const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/valrule_legacy_2026-11-15.json'), 'utf8'));
  const rule = sq("SELECT v.code AS code FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id JOIN ad_val_rule v ON v.ad_val_rule_id=c.ad_val_rule_id WHERE t.tablename='C_Order' AND c.columnname='C_DocTypeTarget_ID'")[0];
  const dt126 = sq('SELECT docbasetype AS b, issotrx AS s FROM c_doctype WHERE c_doctype_id=126')[0];
  if (!rule || !dt126 || !/IsSOTrx='@IsSOTrx@'/.test(rule.code) || dt126.s !== 'N') { k.incon('V2-V4', 'the seed no longer has the case: C_DocTypeTarget_ID ruled by IsSOTrx and doc type 126 a purchase type'); return k.end(); }
  const line = (f) => 'mis.new kind=Order ' + Object.keys(f).map(c => c + '=' + f[c]).join(' ') + (f.C_BPartner_ID === 999999 ? ' C_BPartner_Location_ID=109 SalesRep_ID=101' : '');
  const got = {}; for (const c of FX.cases) { const n0 = nops(); got[c.id] = await door(line(c.fields)); got[c.id].opsAdded = nops() - n0; }
  const rec = (j) => (j.answer && j.answer.record) || {};
  k.chk('V2 an explicit doc type outside its rule (126, a purchase type, on IsSOTrx=Y) is saved as given, as legacy saves it: the rule ' + JSON.stringify(rule.code.slice(0, 60)) + ' is what the window offers, not a refusal',
    got.V2.status === 'ok' && String(rec(got.V2).c_doctypetarget_id) === '126' && rec(got.V2).issotrx === 'Y', got.V2.status + ' dtt=' + rec(got.V2).c_doctypetarget_id + ' sotrx=' + rec(got.V2).issotrx);
  k.chk('V3 a business partner that is no record (999999) is refused with legacy\'s words, and nothing is written (given the location and sales rep, so the foreign key is the only fault)',
    got.V3.status === 'refused' && String(got.V3.why).indexOf(FX.cases[2].legacy.error) === 0 && got.V3.opsAdded === 0, got.V3.status + ' ' + String(got.V3.why).slice(0, 110) + ' ops+' + got.V3.opsAdded);
  const id0 = rec(got.V0).c_order_id, up = id0 ? await door('mis.update kind=Order id=' + id0 + ' C_BPartner_ID=999999') : { status: 'none' };
  k.chk('V3b an update that points C_BPartner_ID at no record is refused the same way (legacy checks a changed foreign key, is_ValueChanged)',
    !!id0 && up.status === 'refused' && /Foreign ID 999999 not found in C_BPartner_ID/.test(up.why), 'order ' + id0 + ' -> ' + up.status + ' ' + String(up.why).slice(0, 100));
  const other = sq("SELECT c_bpartner_id AS id FROM c_bpartner WHERE ad_client_id NOT IN (0, 11) ORDER BY c_bpartner_id LIMIT 1")[0];
  if (!other) k.incon('V3c', 'the seed holds no business partner of another tenant');
  else { const x = await door('mis.new kind=Order IsSOTrx=Y AD_Org_ID=11 C_BPartner_ID=' + other.id + ' C_DocTypeTarget_ID=132 C_BPartner_Location_ID=109 SalesRep_ID=101');
    k.chk('V3c a business partner of another tenant (' + other.id + ') is refused as legacy refuses it: Cross tenant ID … not allowed in C_BPartner_ID', x.status === 'refused' && new RegExp('Cross tenant ID ' + other.id + ' not allowed in C_BPartner_ID').test(x.why), x.status + ' ' + String(x.why).slice(0, 100)); }
  const same = FX.cases.map(c => { const g = got[c.id], L = c.legacy; if (L.status !== g.status) return c.id + ':status ' + g.status + '≠' + L.status; if (L.stored) { const r = rec(g); const bad = Object.keys(L.stored).filter(f => String(r[f]) !== String(L.stored[f])); return bad.length ? c.id + ':' + bad.join(',') : null; } return String(g.why).indexOf(L.error) === 0 ? null : c.id + ':message'; }).filter(Boolean);
  k.chk('V4 the three lines give legacy\'s recorded answers (status, and the stored doc type, IsSOTrx and status; or the refusal\'s words): ' + FX.cases.map(c => c.id).join(', '), same.length === 0, same.join(' ') || 'all equal');
  k.end();
})().catch(e => { console.log('§W-VALRULE-PARITY ERROR ' + e.stack); process.exit(2); });
