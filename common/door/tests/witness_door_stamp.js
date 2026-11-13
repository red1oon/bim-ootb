// ⚠ DO NOT REMOVE — W-DOOR-STAMP (bim-compiler prompts/CLI_ERP_IVR.md §20: a record made at the door carries its audit columns and its UU). READ THE LOG; an exit code is not evidence.
//   T1 ISSUE (a new record has no Created/CreatedBy/Updated/UpdatedBy and no UU) · T2 ISSUE (the stamp is made again on every start, so a record's Created and UU change)
//   T3 ISSUE (one path was fixed, the others not: every create op of a new order, its line and its completion) · T4 ISSUE (an edit loses Created or the UU, or Updated goes backwards)
//   T5 ISSUE (a value the caller gave is overwritten) · T6 ISSUE (the door stores the UTC day and time, so before 08:00 local a record is dated yesterday)
//   Falsifier: STAMP_BREAK=off must FAIL T1, T3. Each claim can say VACUOUS / INCONCLUSIVE.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { kit, tmp, ROOT, DOOR } = require('./_kit');
const k = kit('W-DOOR-STAMP');
(async () => {
  const dir = path.dirname(tmp('ds_')), env = Object.assign({ BIM_OBJECT_OPLOG: path.join(dir, 'ops.jsonl'), BIM_DOOR_JOURNAL: path.join(dir, 'j.jsonl') }, process.env.STAMP_BREAK ? { STAMP_BREAK: process.env.STAMP_BREAK } : {});
  const ops = () => { try { return fs.readFileSync(env.BIM_OBJECT_OPLOG, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch (e) { return []; } };
  const door = (line) => new Promise((res) => { let o = ''; const p = cp.spawn(process.execPath, [DOOR, '--actor', 'human', line], { cwd: dir, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'ignore'] }); p.stdout.on('data', d => { o += d; }); p.on('close', () => { let j = null; try { j = JSON.parse(o); } catch (e) { /* null */ } res(j || { status: 'unparseable', why: o.slice(0, 100) }); }); });
  const sq = (q) => JSON.parse(cp.spawnSync('sqlite3', ['-readonly', '-json', path.join(ROOT, 'erp/ad_seed.db'), q], { encoding: 'utf8' }).stdout || '[]');
  const ok = (j) => j && j.status === 'ok', TS = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, UU = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const pad = (n) => (n < 10 ? '0' : '') + n, loc = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  // T1
  const t0 = loc(new Date()), a = await door('mis.new kind=C_BPartner Value=ZSTAMP1 Name="Stamp One"'), b = await door('mis.new kind=C_BPartner Value=ZSTAMP2 Name="Stamp Two"'), t1 = loc(new Date());
  const ra = (a.answer || {}).record || {}, rb = (b.answer || {}).record || {};
  k.chk('T1 a record made by mis.new has created = updated in the form yyyy-MM-dd HH:mm:ss, createdby = updatedby = the session user (101), and a 36-character UU; a second record has another UU', ok(a) && ok(b) && TS.test(String(ra.created)) && ra.created === ra.updated && Number(ra.createdby) === 101 && Number(ra.updatedby) === 101 && UU.test(String(ra.c_bpartner_uu)) && UU.test(String(rb.c_bpartner_uu)) && ra.c_bpartner_uu !== rb.c_bpartner_uu, 'created=' + ra.created + ' updated=' + ra.updated + ' by=' + ra.createdby + '/' + ra.updatedby + ' uu=' + ra.c_bpartner_uu);
  // T6: the stored time is the machine's LOCAL time, between the two local readings this witness took (never the UTC text, unless the machine's zone is UTC)
  const off = new Date().getTimezoneOffset();
  if (!TS.test(String(ra.created))) k.incon('T6', 'no created value to judge');
  else k.chk('T6 the stored time is local: created lies between the witness\'s own local clock before and after the call' + (off === 0 ? ' (this machine is on UTC, so local and UTC cannot be told apart: scope-blind here)' : ' (zone offset ' + (-off) + ' min, so the UTC text would lie outside)'), ra.created >= t0 && ra.created <= t1, t0 + ' <= ' + ra.created + ' <= ' + t1);
  // T2: a later process reads the same values
  const again = await door('mis.read kind=C_BPartner id=' + (a.answer || {}).id), r2 = (again.answer || {}).record || {};
  k.chk('T2 replay: a later process reads the same created and the same UU for that record (they are in the op-log, not made again)', ok(again) && !!ra.created && r2.created === ra.created && r2.c_bpartner_uu === ra.c_bpartner_uu, r2.created + ' / ' + r2.c_bpartner_uu);
  // T4: an edit keeps created, createdby and the UU; updated does not go backwards
  const up = await door('mis.update kind=C_BPartner id=' + (a.answer || {}).id + ' description="edited"'), ru = (up.answer || {}).record || {};
  k.chk('T4 mis.update keeps created, createdby and the UU, and updated does not go backwards', ok(up) && !!ra.created && ru.created === ra.created && Number(ru.createdby) === 101 && ru.c_bpartner_uu === ra.c_bpartner_uu && TS.test(String(ru.updated)) && ru.updated >= ra.updated, 'created ' + ru.created + ' updated ' + ra.updated + ' -> ' + ru.updated);
  // T3: every create op of an order, its line and its completion
  const n0 = ops().length, o = await door('mis.new kind=Order issotrx=Y c_doctypetarget_id=132 c_bpartner_id=112 salesrep_id=101'), prod = (sq("SELECT m_product_id AS i FROM m_product WHERE ad_client_id=11 AND isactive='Y' AND issold='Y' ORDER BY 1 LIMIT 1")[0] || {}).i;
  const ln = o.answer ? await door('mis.new kind=C_OrderLine order=' + o.answer.number + ' m_product_id=' + prod + ' qtyentered=2') : {}, co = o.answer ? await door('erp.complete kind=Order id=' + o.answer.id) : {};
  const made = ops().slice(n0).filter(x => x.op_type === 'CRUD_CREATE'), cols = {}, colsOf = (t) => cols[t] || (cols[t] = sq("SELECT lower(name) AS n FROM pragma_table_info('" + t + "')").map(r => r.n));
  const judged = made.map(x => { const tc = colsOf(x.table), f = x.fields, need = ['created', 'createdby', 'updated', 'updatedby'].filter(c => tc.includes(c)), uu = tc.includes(x.table + '_uu'); return { t: x.table, need: need.length + (uu ? 1 : 0), ok: need.every(c => f[c] != null && f[c] !== '') && (!uu || UU.test(String(f[x.table + '_uu']))) }; }).filter(x => x.need > 0);
  const byT = {}; judged.forEach(x => { byT[x.t] = byT[x.t] || [0, 0]; byT[x.t][1]++; if (x.ok) byT[x.t][0]++; });
  k.L('T3 order=' + (o.answer && o.answer.number) + ' line=' + ln.status + ' complete=' + co.status + ' create ops=' + made.length + ' judged=' + judged.length + ' by table: ' + Object.keys(byT).map(t => t + ' ' + byT[t][0] + '/' + byT[t][1]).join(' · '));
  if (!ok(o) || !ok(ln) || !ok(co) || !judged.length) k.incon('T3', 'VACUOUS: the order chain did not run (' + [o.status, ln.status, co.status].join(',') + ' ' + String(o.why || ln.why || co.why || '').slice(0, 90) + ')');
  else k.chk('T3 the sweep: ' + judged.filter(x => x.ok).length + ' of ' + judged.length + ' create ops written by a new order, its line and its completion (' + Object.keys(byT).length + ' tables) carry every audit column and UU their table has', judged.every(x => x.ok) && Object.keys(byT).length >= 3, judged.filter(x => !x.ok).map(x => x.t).join(','));
  // T5: a value the caller gave is kept (the staged window's deterministic UUs), and those rows gain created
  fs.writeFileSync(path.join(dir, 'AST_Asset.csv'), 'Column,Type\nName,String\n');
  const n5 = ops().length, aw = await door('mis.add_window file=AST_Asset.csv'), dict = ops().slice(n5).filter(x => x.op_type === 'CRUD_CREATE' && x.table === 'ad_column'), V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-/;
  if (!ok(aw) || !dict.length) k.incon('T5', 'the window could not be staged: ' + aw.why);
  else k.chk('T5 a value the caller gave is kept: the ' + dict.length + ' staged AD_Column rows keep their version-5 UUs and gain created', dict.every(x => V5.test(String(x.fields.ad_column_uu)) && TS.test(String(x.fields.created))), 'v5=' + dict.filter(x => V5.test(String(x.fields.ad_column_uu))).length + '/' + dict.length + ' created=' + dict.filter(x => TS.test(String(x.fields.created))).length + '/' + dict.length);
  return k.end();
})().catch(e => { console.log('§W-DOOR-STAMP ERROR ' + e.stack); process.exit(2); });
