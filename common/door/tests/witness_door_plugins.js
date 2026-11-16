// ⚠ DO NOT REMOVE — W-DOOR-PLUGINS (bim-compiler prompts/CLI_ERP_IVR.md §29.6 P3a: the door starts the core plugins, headless). READ THE LOG (§DOOR_PLUGIN lines on stderr, §W-DOOR-PLUGINS here); an exit code is not evidence.
//   D1 ISSUE (a window the page has does not exist at the prompt): `mis.describe kind=BIM_Document` answers ok with its AD_Table, and `mis.menu` holds the menu leaf 9541001 "BIM Document" (it did neither on main)
//   D2 ISSUE (two lists drift apart): the bundles the door started == erp/plugins/builtins.json `builtin` (every one ACTIVE or named with its reason), and plugin_overlay.js holds no literal list any more (the page reads the same file)
//   D3 ISSUE (a plugin process is a dictionary row nobody can run): `erp.process` finds ALL THREE BIM Document processes (9541001 Open, 9541002 Export Register, 9541003 Fold from BIM) by name and reaches their classes (refused by the CLASS, "no-document", never "no process")
//   D4 ISSUE (the staged dictionary leaks): after every boot of this witness the op-log file does not exist, and erp/ad_seed.db is byte-equal to its sha256 before (the dictionary is in memory only)
//   D5 ISSUE (the cached start differs from the full start): a cold boot (ERP_SNAPSHOT=off, a full start) and a warm boot (the cache of seed + patch + bundles) give the same `mis.describe`, the same rows for the plugin in AD_Table/AD_Column/AD_Process/AD_Menu/*_Access (counts), and the menu leaf for role 102
//   D6 (measured, not a pass bar) boot cost: wall ms of one door line with the plugins off and on, cold and warm → §DOOR_PLUGIN_COST
//   Falsifiers: PLUG_BREAK=off runs every door call with DOOR_PLUGINS=off (the door as it was on main): D1, D2, D3 must FAIL · PLUG_BREAK=noaccess starts the bundles without the host's role-access pass: D5 must FAIL.
//   Run: node common/door/tests/witness_door_plugins.js > common/door/tests/logs/door_plugins.log 2>&1
'use strict';
const path = require('path'), cp = require('child_process'), fs = require('fs'), os = require('os'), crypto = require('crypto');
const { kit, ROOT, DOOR } = require('./_kit');
// D6 falsifier: VIRTUAL_BREAK=keep (virtual columns written: must FAIL D6)
const k = kit('W-DOOR-PLUGINS'), BREAK = process.env.PLUG_BREAK || '';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dplug_')), oplog = path.join(dir, 'ops.jsonl');
const env0 = Object.assign({}, process.env, { BIM_OBJECT_OPLOG: oplog, BIM_DOOR_JOURNAL: path.join(dir, 'j.jsonl'), RED1_WARM: 'off' }, BREAK === 'off' || BREAK === 'noaccess' ? { DOOR_PLUGINS: BREAK } : {});
const door = (line, extra) => { const t = Date.now(), r = cp.spawnSync(process.execPath, [DOOR, line], { encoding: 'utf8', env: Object.assign({}, env0, extra || {}), timeout: 300000 }); const l = (r.stdout || '').split('\n').filter(x => x.charAt(0) === '{').pop(); let j = null; try { j = JSON.parse(l); } catch (e) { /* none */ } return { j, err: r.stderr || '', ms: Date.now() - t }; };
// the CLI itself (its § lines are on its stderr; door.js keeps them from the person): D2 and D5 read them
const cli = (args, extra) => { const t = Date.now(), r = cp.spawnSync(process.execPath, [path.join(ROOT, 'common/door/erp_cli.js')].concat(args, ['--oplog', oplog]), { encoding: 'utf8', env: Object.assign({}, env0, extra || {}), timeout: 300000 }); const l = (r.stdout || '').split('\n').filter(x => x.charAt(0) === '{').pop(); let j = null; try { j = JSON.parse(l); } catch (e) { /* none */ } return { j, err: r.stderr || '', ms: Date.now() - t }; };
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const seedSha = sha(path.join(ROOT, 'erp/ad_seed.db'));
const walk = (n, f) => { if (!n) return null; if (f(n)) return n; for (const c of (n.children || [])) { const r = walk(c, f); if (r) return r; } return null; };
(async () => {
  const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'erp/plugins/builtins.json'), 'utf8')).builtin;
  // D1
  const d1 = door('mis.describe kind=BIM_Document'), m1 = door('mis.menu find=BIM'), leaf = m1.j && m1.j.answer && (m1.j.answer.tree || []).map(n => walk(n, x => x.id === 9541001)).filter(Boolean)[0];
  k.L('D1 describe=' + (d1.j && d1.j.status) + ' table=' + (d1.j && d1.j.answer && d1.j.answer.table) + ' properties=' + (d1.j && d1.j.answer && d1.j.answer.properties && d1.j.answer.properties.length) + ' menu-leaf=' + JSON.stringify(leaf && { id: leaf.id, name: leaf.name, windowId: leaf.windowId }) + ' ' + (d1.j && d1.j.why || ''));
  k.chk('D1 `mis.describe kind=BIM_Document` answers ok with AD_Table BIM_Document, and `mis.menu` holds the leaf 9541001 "BIM Document" opening a window', !!d1.j && d1.j.status === 'ok' && d1.j.answer.table === 'BIM_Document' && d1.j.answer.properties.length > 20 && !!leaf && leaf.name === 'BIM Document' && !!leaf.windowId, 'status=' + (d1.j && d1.j.status) + ' ' + (d1.j && d1.j.why || ''));
  // D2
  const c1 = cli(['describe', '--kind', 'BIM_Document']);
  const started = (c1.err.match(/^§DOOR_PLUGIN (started|not-started) id=\S+ file=(\S+)/gm) || []).map(l => /file=(\S+)/.exec(l)[1]), named = (c1.err.match(/^§DOOR_PLUGIN not-started .* reason=.+$/gm) || []).length, act = (c1.err.match(/^§DOOR_PLUGIN started /gm) || []).length;
  const ovl = fs.readFileSync(path.join(ROOT, 'erp/plugin_overlay.js'), 'utf8'), literal = list.filter(f => ovl.indexOf("'" + f + "'") >= 0);
  k.L('D2 list=' + JSON.stringify(list) + ' door-handled=' + JSON.stringify(started) + ' active=' + act + ' not-started-named=' + named + ' literals-left-in-plugin_overlay=' + JSON.stringify(literal));
  if (!list.length) k.incon('D2', 'builtins.json lists nothing');
  else k.chk('D2 the door handled exactly the ' + list.length + ' bundles of builtins.json (' + act + ' started, ' + named + ' named as not startable headless), and plugin_overlay.js holds none of their paths as a literal', JSON.stringify(started) === JSON.stringify(list) && act + named === list.length && act >= 1 && literal.length === 0 && /builtins\.json/.test(ovl), 'handled=' + started.length + ' active=' + act + ' literals=' + literal.length);
  // D3
  const p1 = door('erp.process name="Open in Modeller / Viewer"'), p2 = door('erp.process name="Export Register (JSON)"'), p3 = door('erp.process name=9541002'), p4 = door('erp.process name="Fold from BIM"');
  const byClass = (p, re) => !!p.j && p.j.status === 'refused' && re.test(p.j.why || '') && !/no process/.test(p.j.why || '');
  k.L('D3 open=' + (p1.j && p1.j.why) + ' | export=' + (p2.j && p2.j.why) + ' | by-id 9541002=' + (p3.j && p3.j.why));
  k.L('D3 fold (no Building)=' + (p4.j && p4.j.why));
  k.chk('D3 `erp.process` finds all three plugin processes (by name, and by id 9541002) and reaches their classes: refused by the class ("no-document"; Fold from BIM by its mandatory parameter), not by the dictionary ("no process")', byClass(p1, /Open: no-document/) && byClass(p2, /Export Register: no document/) && byClass(p3, /Export Register: no document/) && !!p4.j && p4.j.status === 'refused' && /missing parameter: Building/.test(p4.j.why || ''), 'open=' + (p1.j && p1.j.why) + ' export=' + (p2.j && p2.j.why) + ' fold=' + (p4.j && p4.j.why));
  // D5 cold vs warm
  const cold = cli(['describe', '--kind', 'BIM_Document'], { ERP_SNAPSHOT: 'off' }), warm = cli(['describe', '--kind', 'BIM_Document']), warm2 = cli(['describe', '--kind', 'BIM_Document']);
  const norm = (r) => r.j ? JSON.stringify(r.j) : 'none';
  // counts through the door's own raw reader: erp_cli list over the dictionary tables is windowed, so count with the db the door booted (the engine's own sql.js, same boot path)
  const EC = require(path.join(ROOT, 'common/door/erp_cli.js'));
  const counts = async (extra) => { const saved = {}; Object.keys(extra || {}).forEach(x => { saved[x] = process.env[x]; process.env[x] = extra[x]; }); Object.keys(env0).forEach(x => { if (!(x in (extra || {}))) { saved[x] = process.env[x]; process.env[x] = env0[x]; } });
    const logE = console.error, wr = process.stderr.write; process.stderr.write = () => true;
    try { const O = await EC.boot({ oplog: path.join(dir, 'c_' + Math.random().toString(36).slice(2) + '.jsonl') }), n = (s) => Number(O.rows(s)[0].n), o = {
      ad_table: n("SELECT count(*) AS n FROM ad_table WHERE tablename='BIM_Document'"), ad_column: n('SELECT count(*) AS n FROM ad_column WHERE ad_table_id=9541001'), ad_process: n('SELECT count(*) AS n FROM ad_process WHERE ad_process_id BETWEEN 9541001 AND 9541999'),
      ad_menu: n('SELECT count(*) AS n FROM ad_menu WHERE ad_menu_id=9541001'), ad_window_access: n('SELECT count(*) AS n FROM ad_window_access WHERE ad_window_id=9541001'), ad_process_access: n('SELECT count(*) AS n FROM ad_process_access WHERE ad_process_id BETWEEN 9541001 AND 9541999'),
      ad_doc_action_access: n('SELECT count(*) AS n FROM ad_document_action_access WHERE c_doctype_id BETWEEN 9541500 AND 9541999'), bim_document: n("SELECT count(*) AS n FROM sqlite_master WHERE name='bim_document'") }; return o; }
    finally { process.stderr.write = wr; void logE; Object.keys(saved).forEach(x => { if (saved[x] === undefined) delete process.env[x]; else process.env[x] = saved[x]; }); } };
  const cC = await counts({ ERP_SNAPSHOT: 'off' }), cW = await counts({});
  const warmHit = /snapshot=(hit|image) /.test(warm2.err) && /staged=true/.test(warm2.err), coldFull = /staged=false/.test(cold.err);
  k.L('D5 cold-counts=' + JSON.stringify(cC) + ' warm-counts=' + JSON.stringify(cW) + ' cold-full-start=' + coldFull + ' warm-staged=' + warmHit + ' describe equal=' + (norm(cold) === norm(warm2)));
  if (!coldFull || !warmHit) k.incon('D5', 'cold was not a full start or warm was not the cache (coldFull=' + coldFull + ' warmStaged=' + warmHit + ')');
  else k.chk('D5 the cache of seed + patch + bundles equals a full start: same `mis.describe`, same rows (' + Object.keys(cC).map(x => x + '=' + cC[x]).join(', ') + ')', norm(cold) !== 'none' && norm(cold) === norm(warm2) && JSON.stringify(cC) === JSON.stringify(cW) && cC.ad_process === 3 && cC.ad_window_access > 0 && cC.ad_process_access > 0, 'cold ' + JSON.stringify(cC) + ' warm ' + JSON.stringify(cW));
  // D4
  const leaked = fs.existsSync(oplog) ? fs.statSync(oplog).size : 0, nowSha = sha(path.join(ROOT, 'erp/ad_seed.db'));
  k.L('D4 op-log bytes=' + leaked + ' seed sha before=' + seedSha.slice(0, 12) + ' after=' + nowSha.slice(0, 12));
  k.chk('D4 after every boot the op-log does not exist (0 bytes) and erp/ad_seed.db is byte-equal to before', leaked === 0 && nowSha === seedSha, 'oplog=' + leaked + ' seed-equal=' + (nowSha === seedSha));
  // D6 cost
  const t = (extra) => { const a = []; for (let i = 0; i < 3; i++) a.push(cli(['describe', '--kind', 'Business Partner'], extra).ms); return Math.min.apply(null, a); };
  const off = t({ DOOR_PLUGINS: 'off' }), on = t({}), coldMs = cli(['describe', '--kind', 'Business Partner'], { ERP_SNAPSHOT: 'off' }).ms;
  const pl = /§ERP plugins ms=(\d+)/.exec(warm2.err), plc = /§ERP plugins ms=(\d+)/.exec(cold.err);
  k.L('§DOOR_PLUGIN_COST one CLI call wall ms (best of 3, process start included): plugins off=' + off + ' on(warm cache)=' + on + ' delta=' + (on - off) + ' cold-no-cache=' + coldMs + ' | start inside boot: warm=' + (pl && pl[1]) + ' ms, cold full start=' + (plc && plc[1]) + ' ms');
  // D6 (Fast Script ERP film rc2): a started plugin's VIRTUAL columns (ColumnSQL on C_ProjectPhase) are never written: mis.new on Project Phase saves and reads back
  { const d6 = door('mis.new kind="Project Phase" C_Project_ID=101 Name=D6Phase SeqNo=10', process.env.VIRTUAL_BREAK ? { VIRTUAL_BREAK: process.env.VIRTUAL_BREAK } : {}).j, back = d6 && d6.status === 'ok' ? door('mis.list kind="Project Phase" C_Project_ID=101 Name=D6Phase columns=Name').j : null;
    k.L('D6 new=' + (d6 && d6.status) + ' why=' + (d6 && d6.why) + ' back=' + (back && back.answer && back.answer.rows && back.answer.rows.length));
    k.chk('D6 with the plugins started, mis.new on Project Phase saves (the BIM Document plugin\'s virtual columns are left out, as legacy POInfo does) and reads back', !!d6 && d6.status === 'ok' && !!back && back.answer.rows.length === 1, d6 && (d6.status + ' ' + (d6.why || ''))); }
  k.end();
  process.exit(k.fail ? 1 : (k.inc ? 3 : 0));
})();
