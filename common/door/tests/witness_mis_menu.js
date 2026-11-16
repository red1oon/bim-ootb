// ⚠ DO NOT REMOVE — W-MIS-MENU (bim-compiler prompts/CLI_ERP_IVR.md §21: mis.menu and the terminal menu /M). READ THE LOG; an exit code is not evidence.
//   U1 ISSUE (the menu at the door is not the page's menu: entries, windows or order differ) · U2 ISSUE (a role sees an entry its grant rows do not allow, or misses one they allow)
//   U3 ISSUE (find keeps a non-matching entry or loses its folder path) · U4 ISSUE (the screen opens a window on another kind than its first tab, runs a line that is not a door line, or Esc does not come back)
//   U5 ISSUE (an unknown role is answered with a menu) · U6 ISSUE (the vocabulary entry is not generated)
//   Oracles: U1/U2 plain SQL over erp/ad_seed.db + the built-in bundles' staged dictionary (the page's menu; AD_Menu + AD_TreeNodeMM tree 10; AD_Window/Process/Form_Access), independent of the two functions the verb calls; U1's order is the page's own getMenuTree.
//   Falsifiers: MENU_BREAK=noscope (must FAIL U2) · wrongtab (must FAIL U4) · noplugins (the door starts no plugin: must FAIL U1, the page's menu holds BIM Document). A claim with nothing to judge says INCONCLUSIVE, never PASS.
//   Run: node common/door/tests/witness_mis_menu.js > common/door/tests/logs/mis_menu.log 2>&1
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { kit, tmp, ROOT, DOOR } = require('./_kit');
const k = kit('W-MIS-MENU');
(async () => {
  const dir = path.dirname(tmp('mm_')), env = { BIM_OBJECT_OPLOG: path.join(dir, 'm.ops.jsonl'), BIM_DOOR_JOURNAL: path.join(dir, 'm.j.jsonl') };
  Object.assign(process.env, env); if (process.env.MENU_BREAK === 'noplugins') process.env.DOOR_PLUGINS = 'off';   // falsifier: the door without its plugins (must FAIL U1)
  const door = (line) => new Promise((res) => { let o = ''; const p = cp.spawn(process.execPath, [DOOR, '--actor', 'human', line], { cwd: dir, env: process.env, stdio: ['ignore', 'pipe', 'ignore'] }); p.stdout.on('data', d => { o += d; });
    p.on('close', () => { let j = null; try { j = JSON.parse(o.split('\n').filter(l => l.charAt(0) === '{').pop()); } catch (x) { /* null */ } res(j || { status: 'unparseable', why: o.slice(-300) }); }); });
  // the oracle's database = the page's menu source: the seed WITH its built-in bundles' dictionary staged by the page's own registry (the BIM Document window is one; the door starts them too, §29.6 P3a).
  // Plain SQL over it stays independent of the two functions the verb calls. DOOR_PLUGINS=off in the door's env (the door as it was) must then FAIL U1: the page lists a window the door does not.
  const SQL = await require(path.join(ROOT, 'common', 'lib', 'sql-wasm.js'))({ wasmBinary: fs.readFileSync(path.join(ROOT, 'common', 'lib', 'sql-wasm.wasm')) }), db = new SQL.Database(fs.readFileSync(path.join(ROOT, 'erp/ad_seed.db')));
  { const REG = require(path.join(ROOT, 'erp/plugin_registry.js')), wdb = { run: (q, p) => { db.run(q, p || []); }, query: (q, p) => { const st = db.prepare(q); st.bind(p || []); const o = []; while (st.step()) o.push(st.getAsObject()); st.free(); return o; } };
    const reg = REG.create({ db: wdb }), lg = console.log; console.log = () => {};
    try { for (const f of JSON.parse(fs.readFileSync(path.join(ROOT, 'erp/plugins/builtins.json'), 'utf8')).builtin) { const mod = await import(require('url').pathToFileURL(path.join(ROOT, 'erp', f)).href); reg.stageManifestDictionary(mod.manifest); } } finally { console.log = lg; } }
  const sq = (q) => { const r = db.exec(q); return r.length ? r[0].values.map(v => { const o = {}; r[0].columns.forEach((c, i) => { o[c] = v[i]; }); return o; }) : []; };
  const leavesOf = (tree) => { const out = []; const w = (n) => { if (n.children && n.children.length) n.children.forEach(w); else if (!n.isSummary) out.push(n); }; (tree || []).forEach(w); return out; };   // the page's nodes carry children: [] on a leaf too
  const MENU = "FROM ad_menu m JOIN ad_treenodemm n ON n.node_id=m.ad_menu_id AND n.ad_tree_id=10 AND n.isactive='Y' WHERE m.isactive='Y' AND m.issummary='N'";
  // U1
  const all = await door('mis.menu'), L = leavesOf(all.answer && all.answer.tree), sqlLeaves = sq('SELECT count(DISTINCT m.ad_menu_id) AS n ' + MENU)[0].n, sqlWin = sq("SELECT DISTINCT m.ad_window_id AS w " + MENU + " AND m.action='W'").map(r => r.w).sort((a, b) => a - b);
  const ADP = (() => { const log = console.log; console.log = () => {}; try { return require(path.join(ROOT, 'erp/ad_parser.js')); } finally { console.log = log; } })();
  const pageOrder = (() => { const log = console.log; console.log = () => {}; try { return leavesOf(ADP.getMenuTree(db)).map(n => n.id); } finally { console.log = log; } })();
  const doorWin = Array.from(new Set(L.filter(n => n.action === 'W').map(n => n.windowId))).sort((a, b) => a - b);
  k.chk('U1 mis.menu (no role) is the page\'s menu: ' + sqlLeaves + ' entries and the window set by plain SQL over AD_Menu + AD_TreeNodeMM (tree 10), in the order the page\'s getMenuTree gives',
    all.status === 'ok' && L.length === sqlLeaves && JSON.stringify(doorWin) === JSON.stringify(sqlWin) && JSON.stringify(L.map(n => n.id)) === JSON.stringify(pageOrder),
    'door entries=' + L.length + ' sql=' + sqlLeaves + ' · windows door=' + doorWin.length + ' sql=' + sqlWin.length + ' same=' + (JSON.stringify(doorWin) === JSON.stringify(sqlWin)) + ' · order same=' + (JSON.stringify(L.map(n => n.id)) === JSON.stringify(pageOrder)));
  // U2: the grant rows, by SQL
  const want = (r) => { const W = new Set(sq("SELECT ad_window_id AS x FROM ad_window_access WHERE ad_role_id=" + r + " AND isactive='Y'").map(x => x.x)), P = new Set(sq("SELECT ad_process_id AS x FROM ad_process_access WHERE ad_role_id=" + r + " AND isactive='Y'").map(x => x.x)), F = new Set(sq("SELECT ad_form_id AS x FROM ad_form_access WHERE ad_role_id=" + r + " AND isactive='Y'").map(x => x.x));
    return L.filter(n => n.action === 'W' ? W.has(n.windowId) : (n.action === 'P' || n.action === 'R') ? P.has(n.processId) : n.action === 'X' ? F.has(n.formId) : true).map(n => n.id).sort((a, b) => a - b); };
  const got = {}; for (const r of [102, 103]) { const j = await door('mis.menu role=' + r); got[r] = { st: j.status, ids: leavesOf(j.answer && j.answer.tree).map(n => n.id).sort((a, b) => a - b), want: want(r) }; }
  const eq = (r) => JSON.stringify(got[r].ids) === JSON.stringify(got[r].want);
  k.chk('U2 with role=, the entries are exactly those the role\'s grant rows allow (windows by AD_Window_Access, processes and reports by AD_Process_Access, forms by AD_Form_Access, read by SQL), and role 103 sees fewer than 102',
    got[102].st === 'ok' && eq(102) && eq(103) && got[103].ids.length < got[102].ids.length, 'role 102: ' + got[102].ids.length + ' (want ' + got[102].want.length + ') · role 103: ' + got[103].ids.length + ' (want ' + got[103].want.length + ')');
  // U3
  const f = await door('mis.menu role=102 find=partner'), items = (f.answer && f.answer.items) || [], all102 = leavesOf((await door('mis.menu role=102')).answer.tree).filter(n => /partner/i.test(n.name)).length;
  k.chk('U3 find=partner keeps exactly the role\'s entries whose name contains "partner" (any case), each with its folder path', f.status === 'ok' && items.length > 0 && items.length === all102 && items.every(i => /partner/i.test(i.name) && i.path && i.path.indexOf(' > ') > 0),
    'items=' + items.length + ' (want ' + all102 + ') e.g. ' + (items[0] ? items[0].path + ' > ' + items[0].name : '-'));
  // U4: the screen, with scripted keys, through the real door
  const MIS = require(path.join(ROOT, 'common/door/mis.js')), { createDoor } = require(path.join(ROOT, 'common/door/door.js'));
  const tabsOf = (w) => sq("SELECT count(*) AS n FROM ad_tab WHERE ad_window_id=" + Number(w) + " AND isactive='Y'")[0].n;   // a window with several tabs, so opening the wrong one would show
  const pick = items.slice(0, 9).filter(i => i.action === 'W' && i.kind && tabsOf(i.windowId) > 1)[0], idx = items.indexOf(pick);
  if (!pick) k.incon('U4', 'no window entry with several tabs among the first nine "partner" matches to open');
  else {
    const first = sq("SELECT tb.tablename AS t FROM ad_tab t JOIN ad_table tb ON tb.ad_table_id=t.ad_table_id WHERE t.ad_window_id=" + pick.windowId + " AND t.isactive='Y' ORDER BY t.tablevel, t.seqno LIMIT 1")[0].t;
    const keys = ['/', { text: 'partner' }, 'Enter', String(idx + 1), 'Esc', 'Esc', 'q'], screens = [];
    const r = await MIS.menuSession({ menu: true, role: '102', limit: 5 }, () => Promise.resolve(keys.length ? keys.shift() : null), (s) => screens.push(s), createDoor({ journal: env.BIM_DOOR_JOURNAL }));
    const lines = r.lines, vocab = JSON.parse(fs.readFileSync(path.join(ROOT, 'common/door/verbs.json'), 'utf8')).verbs.map(v => v.verb);
    const allDoor = lines.every(l => vocab.indexOf(l.split(' ')[0]) >= 0), opensRight = r.opened.length === 1 && r.opened[0] === first && lines.some(l => l.indexOf('mis.list kind=' + first + ' ') === 0);
    const back = screens.slice(-3).some(s => /^Menu /.test(s));
    k.chk('U4 the screen: find, then the entry\'s number opens the list screen on ' + first + ' (the first tab of window ' + pick.windowId + ', by SQL); every line it ran is a door verb; Esc twice comes back to the menu, q quits',
      opensRight && allDoor && back && r.state.phase === 'quit', 'opened=' + JSON.stringify(r.opened) + ' want ' + first + ' · lines=' + lines.map(l => l.split(' ').slice(0, 2).join(' ')).join(' | ') + ' · back to menu=' + back + ' phase=' + r.state.phase);
  }
  // U5, U6
  const bad = await door('mis.menu role=999999');
  k.chk('U5 an unknown role is refused naming it (no menu answered)', bad.status !== 'ok' && /unknown role 999999/.test(String(bad.why)), bad.status + ' ' + String(bad.why).slice(0, 80));
  const V = JSON.parse(fs.readFileSync(path.join(ROOT, 'common/door/verbs.json'), 'utf8')).verbs.filter(v => v.verb === 'mis.menu')[0];
  k.chk('U6 the vocabulary entry mis.menu is generated, harm read, and names this witness', !!V && V.harm === 'read' && /witness_mis_menu/.test(V.witness), JSON.stringify(V && { harm: V.harm, witness: V.witness }));
  k.end();
})().catch(e => { console.log('§W-MIS-MENU ERROR ' + e.stack); process.exit(2); });
