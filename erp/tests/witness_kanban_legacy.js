#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-KANBAN-LEGACY (bim-compiler prompts/CLI_ERP_IVR.md §38). READ THE §-LOG after every run; an exit code is not evidence.
// ISSUE: the Kanban board (idempiere.html's pill) did not move a card as legacy's Kanban does (org.red1.ninja MKanbanCard.changeStatus, kanban.jar):
//   D1 the action came from the first manifest.json wfmc edge (Completed -> In Progress picked RE, Re-activate) instead of legacy's target-status map (MKanbanBoard.java:100-113);
//   D2 the card moved on the state machine's word, BEFORE the engine ran; a refusal by the model (processIt false, e.g. @NoLines@) only toasted, the card stayed moved.
//   KL1 (node) for every status in legacy's map, resolveDrag returns legacy's action; CO -> IP gives PR, never RE
//   KL2 (page) a Drafted order WITH a line, dragged to Completed: the engine completes it; the card is in the CO column; the shared tip reads CO; the commit is logged
//   KL3 (page) a Drafted order with NO line, dragged to In Progress: the model refuses; the card is back in DR; the tip is not IP; legacy's message is shown
//   KL4 (page) a Completed order dragged to In Progress: the action tried is PR (legacy), it is refused, the card stays CO; never re-activated
// Falsifiers (each must make this witness FAIL): KANBAN_BREAK=wfmc (KL1) · KANBAN_BREAK=optimistic (KL3, the card moves on the state machine's word).
// Fixture: the door itself makes the two Drafted orders (common/door/erp_cli.js new), and its op-log image (seed + patch + ops, the twin engine's own rows) is served to the page as ?seed=.
//   Temp op-log, journal and snapshot folder; the owner's files are never touched.
// Run: node erp/tests/witness_kanban_legacy.js 2>&1 | tee /tmp/kanban_legacy.log
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), REPO = path.join(ROOT, '..');
let pass = 0, fail = 0, inc = 0;
const chk = (name, ok, info) => { if (ok) pass++; else fail++; console.log('  ' + (ok ? '✅' : '❌') + ' ' + name + (info ? '  ' + info : '')); };
const incon = (id, why) => { inc++; console.log('§W-KANBAN-LEGACY INCONCLUSIVE ' + id + ' — ' + why); };
const end = () => { const v = fail ? 'FAIL' : (inc ? 'INCONCLUSIVE' : 'PASS'); console.log('§WITNESS_KANBAN_LEGACY pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + ' verdict=' + v + (process.env.KANBAN_BREAK ? ' break=' + process.env.KANBAN_BREAK : '')); };

// ── KL1: legacy's map, typed here from MKanbanBoard.java:100-113 (NOT read from the lens: an independent oracle) ──
const LEGACY = { DR: 'DR', IN: 'IN', '??': 'XL', WC: 'WC', WP: 'WP', CO: 'CO', NA: 'RJ', VO: 'VO', AP: 'AP', RE: 'RC', CL: 'CL', IP: 'PR' };
const KL = require(path.join(ROOT, 'kanban_lens.js')), wfmc = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).wfmc;
const rows = [];
['DR', 'IP', 'CO'].forEach(from => Object.keys(LEGACY).forEach(to => { if (to === from) return; const r = KL.resolveDrag({ cards: [{ key: 'k', status: from, table: 'C_Order', id: 1 }] }, 'k', to, wfmc); rows.push([from, to, r.action, LEGACY[to]]); }));
const wrong = rows.filter(r => r[2] !== r[3]), coip = rows.find(r => r[0] === 'CO' && r[1] === 'IP');
chk('KL1 resolveDrag = legacy\'s target-status map for ' + rows.length + ' (from, to) pairs; CO -> IP gives PR (not RE)', rows.length > 0 && wrong.length === 0 && coip[2] === 'PR', 'wrong=' + wrong.length + (wrong.length ? ' e.g. ' + wrong.slice(0, 3).map(r => r[0] + '->' + r[1] + '=' + r[2]).join(',') : '') + ' CO->IP=' + coip[2]);

(async () => {
  // ── fixture: two Drafted orders made by the door's own engine ──
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban_legacy_')), env = Object.assign({}, process.env, { BIM_OBJECT_OPLOG: path.join(tmp, 'ops.jsonl'), BIM_DOOR_JOURNAL: path.join(tmp, 'j.jsonl'), ERP_SNAPSHOT_DIR: path.join(tmp, 'snap') });
  delete env.KANBAN_BREAK; fs.writeFileSync(env.BIM_OBJECT_OPLOG, '');
  const cli = (argv, extra) => { const r = spawnSync(process.execPath, [path.join(REPO, 'common/door/erp_cli.js')].concat(argv), { env: Object.assign({}, env, extra || {}), encoding: 'utf8' }); let j = null; try { j = JSON.parse(r.stdout); } catch (e) {} return { j, code: r.status, err: r.stderr }; };
  const ordArgs = ['new', '--kind', 'Order', '--where', 'issotrx=Y', '--where', 'C_DocTypeTarget_ID=132', '--where', 'C_BPartner_ID=112', '--where', 'SalesRep_ID=101'];
  const A = cli(ordArgs), B = cli(ordArgs);
  const L = A.j ? cli(['new', '--kind', 'C_OrderLine', '--where', 'order=' + A.j.number, '--where', 'm_product_id=137', '--where', 'qtyentered=2']) : { code: 1 };
  const img = cli(['sum', '--kind', 'Order', '--column', 'GrandTotal'], { ERP_OPIMAGE: 'on', ERP_OPIMAGE_MIN: '1' });
  const imgFile = fs.existsSync(env.ERP_SNAPSHOT_DIR) ? fs.readdirSync(env.ERP_SNAPSHOT_DIR).filter(f => /^opimg-.*\.db$/.test(f)).map(f => path.join(env.ERP_SNAPSHOT_DIR, f))[0] : null;
  console.log('§W-KANBAN-LEGACY fixture orderA=' + (A.j && A.j.id) + '/' + (A.j && A.j.number) + ' orderB=' + (B.j && B.j.id) + '/' + (B.j && B.j.number) + ' lineA=' + L.code + ' image=' + (imgFile ? path.basename(imgFile) + ' bytes=' + fs.statSync(imgFile).size : 'none'));
  if (!A.j || !B.j || L.code !== 0 || !imgFile) { incon('KL2-KL4', 'the door could not make the fixture orders/image'); return end(); }
  const SEED = 'kanban_legacy_fixture.db';
  const sq = (s) => (spawnSync('sqlite3', ['-readonly', imgFile, s], { encoding: 'utf8' }).stdout || '').trim();
  const coId = sq("SELECT c_order_id FROM c_order WHERE ad_client_id=11 AND issotrx='Y' AND docstatus='CO' ORDER BY c_order_id LIMIT 1");
  console.log('§W-KANBAN-LEGACY fixture rows: A=' + sq('SELECT docstatus||" lines="||(SELECT count(*) FROM c_orderline WHERE c_order_id=' + A.j.id + ') FROM c_order WHERE c_order_id=' + A.j.id) + ' B=' + sq('SELECT docstatus||" lines="||(SELECT count(*) FROM c_orderline WHERE c_order_id=' + B.j.id + ') FROM c_order WHERE c_order_id=' + B.j.id) + ' CO order=' + coId);

  // ── the page ──
  const { chromium } = require(process.env.PW || path.join(os.homedir(), 'bim-ootb/tests/node_modules/playwright'));
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.sql': 'text/plain' };
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);   // served from the REPO root: the page loads ../common/* (plugin_registry needs common/comm/semver_strict.js)
    const file = p === '/erp/' + SEED ? imgFile : path.join(REPO, p);
    fs.readFile(file, (e, buf) => { if (e) { res.writeHead(404); res.end('404 ' + p); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf); });
  });
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), page = await browser.newPage(), logs = [], errs = [];
  if (process.env.KANBAN_BREAK) await page.addInitScript((b) => { window.KANBAN_BREAK = b; }, process.env.KANBAN_BREAK);
  page.on('console', m => logs.push(m.text())); page.on('pageerror', e => errs.push(e.message));
  try {
    await page.goto('http://localhost:' + server.address().port + '/erp/idempiere.html?client=garden&window=143&seed=' + SEED, { waitUntil: 'networkidle' });
    await page.waitForSelector('#idmp-login-users .idmp-login-user:not(.disabled)', { timeout: 20000 });
    await page.click('#idmp-login-users .idmp-login-user:not(.disabled)'); await page.waitForSelector('#idmp-login-ok', { timeout: 5000 }); await page.click('#idmp-login-ok');
    await page.waitForSelector('[data-ad-table]', { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(1200);
    await page.waitForFunction(() => window.IdmpPillActions && typeof window.IdmpPillActions.kanban === 'function', { timeout: 20000 });
    await page.evaluate(() => { window.IdmpPillActions.kanban(); });   // the Kanban board (the Dashboard's Cards tab fans into the same openKanbanFor)
    await page.waitForFunction(() => window.__idmpKanban && window.__idmpKanban.board, { timeout: 20000 }).catch(() => {});
    const board = await page.evaluate(() => { const b = window.__idmpKanban && window.__idmpKanban.board; return b ? { cols: b.columns.map(c => c.status), cards: b.cards.map(c => c.key + ':' + c.status) } : null; });
    console.log('§W-KANBAN-LEGACY board ' + JSON.stringify(board).slice(0, 400));
    if (!board) { incon('KL2-KL4', 'the Kanban board did not mount'); return; }
    const drop = async (id, to) => {
      const n0 = logs.filter(l => /§KANBAN-CHROME settled/.test(l)).length;
      const key = await page.evaluate((a) => { const b = window.__idmpKanban.board, c = b.cards.find(x => String(x.id) === String(a.id)); if (!c) return null; window.__idmpKanban._onDrop(c.key, a.to); return c.key; }, { id, to });
      if (!key) return { key: null };
      for (let i = 0; i < 60 && logs.filter(l => /§KANBAN-CHROME settled/.test(l)).length === n0; i++) await page.waitForTimeout(250);
      await page.waitForTimeout(400);
      const st = await page.evaluate((a) => new Promise((res) => {
        const b = window.__idmpKanban.board, c = b.cards.find(x => x.key === a.key), el = document.querySelector('.kanban-card[data-key="' + a.key + '"]');
        const col = el && el.closest('.kanban-col-body'), out = { card: c && c.status, dom: col && col.dataset.status };
        const cr = window.__crud; if (!cr || !cr.readTip) { out.tip = 'no-crud'; return res(out); }
        const rd = () => { try { out.tip = cr.readTip('c_order', a.id); } catch (e) { out.tip = 'err'; } res(out); };
        if (typeof cr.withSidecar === 'function') cr.withSidecar(rd); else rd();
      }), { key, id });
      const settled = logs.filter(l => /§KANBAN-CHROME settled/.test(l)).slice(n0);
      const dropLog = logs.filter(l => /§KANBAN-CHROME drop key=/.test(l) && l.indexOf(key) >= 0).slice(-1)[0] || '';
      return Object.assign({ key, settled: settled.join(' | '), dropLog }, st);
    };
    const r2 = await drop(A.j.id, 'CO');
    console.log('§W-KANBAN-LEGACY KL2 ' + JSON.stringify(r2));
    const committed = logs.some(l => /§CRUD process committed/.test(l) && /to=CO/.test(l));
    chk('KL2 a Drafted order with a line, dragged to Completed: completed by the engine, card in the CO column, shared tip CO, commit logged', r2.key && /ok=true/.test(r2.settled) && r2.card === 'CO' && r2.dom === 'CO' && r2.tip === 'CO' && committed, 'card=' + r2.card + ' dom=' + r2.dom + ' tip=' + r2.tip + ' committed=' + committed);
    const r3 = await drop(B.j.id, 'IP');
    console.log('§W-KANBAN-LEGACY KL3 ' + JSON.stringify(r3));
    const refusedModel = logs.some(l => /REFUSED by the model/.test(l)), legacyMsg = logs.some(l => /§KANBAN-LEGACY refused/.test(l) && /This status transition is not allowed\./.test(l));
    chk('KL3 a Drafted order with NO line, dragged to In Progress: the model refuses, the card is back in DR, the tip is not IP, legacy\'s message shown', r3.key && /ok=false/.test(r3.settled) && r3.card === 'DR' && r3.dom === 'DR' && r3.tip !== 'IP' && refusedModel && legacyMsg, 'card=' + r3.card + ' dom=' + r3.dom + ' tip=' + r3.tip + ' modelRefused=' + refusedModel + ' legacyMsg=' + legacyMsg);
    const r4 = await drop(A.j.id, 'IP');   // order A is Completed by KL2 (the board lists the window's open records; the seed's CO orders are not on it)
    console.log('§W-KANBAN-LEGACY KL4 ' + JSON.stringify(r4));
    chk('KL4 a Completed order (A, after KL2) dragged to In Progress: the action tried is PR (legacy), refused, the card stays CO (never re-activated)', r4.key && /action=PR/.test(r4.dropLog) && /ok=false/.test(r4.settled) && r4.card === 'CO' && r4.tip !== 'IP', 'drop=' + String(r4.dropLog || '').replace(/^.*(action=\S+).*$/, '$1') + ' card=' + r4.card + ' tip=' + r4.tip);
    if (process.env.KL_DEBUG) logs.filter(l => /§FSM-CTX|§KANBAN|§CRUD process|§CRUD-HOSTPROCESS|settled/.test(l)).forEach(l => console.log('   page: ' + l.slice(0, 220)));
    console.log('§W-KANBAN-LEGACY pageErrors=' + (errs.length ? errs.slice(0, 3).join(' | ') : 0));
  } catch (e) { incon('KL2-KL4', 'page run failed: ' + e.message); }
  finally { await browser.close(); server.close(); end(); }
})();
