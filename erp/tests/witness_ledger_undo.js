#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-LEDGER-UNDO (bim-compiler prompts/CLI_ERP_IVR.md §61). READ THE §-LOG after every run; an exit code is not evidence.
 * ISSUE: with a ledger folder attached, History fold-back (undo) and fold-forward (redo) did nothing but log "§LEDGER unsupported": undo flipped a flag on an EXISTING row and re-appended that id,
 *   which the shared, chained, append-only file cannot take. Now an undo/redo is ONE new signed row (UNDO/REDO, targets = op_uuids), read by ONE rule (KernelOps.foldMarkers) on the page AND the door.
 *   Observable: C_BPartner 112's Description in the page's tip fold, and the same record read by the REAL door process (door.js mis.read) over a copy of the same file.
 *   U1 two edits, fold-back: the fold shows the first; +1 row, op_type UNDO, target = the second edit's op_uuid; no id repeats; the page's verifyChain and the door's ledger_sign.verify ok
 *   U2 fold-back again: the seed's value (the marker is not a gesture); +1 UNDO row · U3 fold-forward: the first edit back (the EARLIEST undone gesture), +1 REDO row
 *   U4 reload: the file re-read gives the same fold · U5 the door reads the same Description as the page · U6 an UNDO signed by a third key (stamped as the page's) is not applied
 *   U7 redo cannot resurrect an untrusted row: an unpinned door row (ReferenceNo door-x) stays out of the fold through an undo and redos until nothing is left; the last redo writes no row
 *   U5 also proves the page -> door direction for a page EDIT's value (no witness did before: W-LEDGER-REAL R6 checked ids and hashes only)
 * Falsifiers: LEDGER_UNDO_BREAK=nomarker (the page's hydrate ignores markers) -> U4 FAIL; LEDGER_UNDO_BREAK=doornomarker (the door ignores them) -> U5 FAIL.
 */
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm'), crypto = require('crypto'), cp = require('child_process');
const REPO = path.join(__dirname, '..', '..'), BREAK = process.env.LEDGER_UNDO_BREAK || '';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.sql': 'text/plain' };
const server = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(REPO, p), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); }); });
let pass = 0, fail = 0, inc = 0; const say = (s) => console.log(s);
const judge = (id, ok, ev) => { if (ok === null) inc++; else if (ok) pass++; else fail++; say('  ' + (ok === null ? '⚪' : ok ? '✅' : '❌') + ' ' + id + '  ' + (ev || '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await new Promise((r) => server.listen(0, r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledgerundo_')); process.env.RED1_DOOR_KEY = path.join(dir, 'door_key.json');
  const LS = require('../../common/door/ledger_sign.js'), DOORFILE = path.join(dir, 'door.jsonl');
  LS.append(DOORFILE, [{ op_type: 'CRUD_UPDATE', table: 'c_bpartner', id: 112, changes: { referenceno: { new: 'door-x' } }, t: new Date().toISOString() }]);   // an UNPINNED door row: excluded by §59, never pinned here
  const K = (() => { const sb = { window: {}, console: { log() {}, warn() {}, error() {} }, crypto: crypto.webcrypto, TextEncoder, TextDecoder, setTimeout, clearTimeout }; vm.runInNewContext(fs.readFileSync(path.join(REPO, 'erp/kernel_ops.js'), 'utf8'), sb); return sb.window.KernelOps; })();
  const evil = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }), sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
  const b = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] }), ctx = await b.newContext(), LOG = [], errs = [];
  await ctx.addInitScript((a) => { if (a.brk === 'nomarker') window.__LEDGER_BREAK = 'nomarker'; window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('UN1', { create: true }); }, { brk: BREAK });
  const page = await ctx.newPage(); page.on('console', (m) => LOG.push(m.text())); page.on('pageerror', (e) => errs.push(String(e)));
  const URL = 'http://localhost:' + server.address().port + '/erp/idempiere.html?login=GardenAdmin&window=146';
  const inject = () => page.evaluate(() => {
    window.__edit = (v) => new Promise((resolve) => { let done = false;
      const h = () => { if (done) return; done = true; window.removeEventListener('overlay:committed', h); resolve({ v }); }; window.addEventListener('overlay:committed', h);
      window.__crud.applyOp({ key: 'c_bpartner', table: 'C_BPartner', verb: 'update', ownerGated: false, op_type: 'CRUD_UPDATE', id: 112, changes: { Description: { old: null, new: v } }, actor: 100 });
      setTimeout(() => { if (!done) { done = true; window.removeEventListener('overlay:committed', h); resolve({ v, timeout: true }); } }, 6000); });
    window.__read = async () => { try { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('UN1', { create: true }); return await (await (await d.getFileHandle('ad_seed.db.ops.jsonl')).getFile()).text(); } catch (e) { return ''; } };
    window.__write = async (t) => { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('UN1', { create: true }), w = await (await d.getFileHandle('ad_seed.db.ops.jsonl', { create: true })).createWritable(); await w.write(t); await w.close(); };
    window.__fold = () => { const r = window.__crud.withTipQuery((q) => q('SELECT referenceno, description FROM c_bpartner WHERE c_bpartner_id = 112')); return r && r[0] ? { ref: r[0].referenceno, desc: r[0].description } : null; };
    window.__verify = () => new Promise((res) => window.__crud.withSidecar ? window.__crud.withSidecar((db) => Promise.resolve(window.KernelOps.verifyChain(db)).then((v) => res(v && v.ok), () => res(false))) : res(null));
  });
  const load = async () => { await page.goto(URL, { waitUntil: 'load' }); await page.waitForFunction(() => window.__crud && window.ErpSigner && window.ErpSigner.pubKeyHex && window.LedgerFile && window.LedgerUi && document.getElementById('erp-ledger-pill'), null, { timeout: 60000 }); await sleep(1500); await inject(); };
  const waitOn = async (ms) => { try { await page.waitForFunction(() => window.LedgerUi.state() === 'on', null, { timeout: ms || 15000 }); return true; } catch (e) { return false; } };
  const info = () => page.evaluate(() => window.__crud.ledgerInfo()), fold = () => page.evaluate(() => window.__fold()), read = () => page.evaluate(() => window.__read());
  const rowsOf = (t) => t.split('\n').filter(Boolean).map(JSON.parse);
  const back = async () => { await page.evaluate(() => window.crudFoldBack('c_bpartner', 'DR', 'CO')); await sleep(1800); };
  const fwd = async () => { await page.evaluate(() => window.crudFoldForward('c_bpartner', 'CO')); await sleep(1800); };
  const uniqIds = (rows) => new Set(rows.map((r) => r.id)).size === rows.length;
  const doorRead = (text) => { const f = path.join(dir, 'copy.jsonl'); fs.writeFileSync(f, text);
    const r = cp.spawnSync(process.execPath, [path.join(REPO, 'common/door/door.js'), '--actor', 'human', 'mis.read kind=C_BPartner id=112'], { encoding: 'utf8', env: Object.assign({}, process.env, { BIM_OBJECT_OPLOG: f, BIM_DOOR_JOURNAL: path.join(dir, 'journal.jsonl') }) });
    let j = null; try { j = JSON.parse(r.stdout.split('\n').filter((l) => l.trim().startsWith('{')).pop()); } catch (e) {}
    return { desc: j && j.answer && j.answer.record ? j.answer.record.description : undefined, ref: j && j.answer && j.answer.record ? j.answer.record.referenceno : undefined, err: (r.stderr || '').split('\n').filter((l) => /§LEDGER/.test(l)).join(' | ') }; };
  try {
    await load(); await page.evaluate((t) => window.__write(t), fs.readFileSync(DOORFILE, 'utf8'));
    await page.click('#erp-ledger-pill'); const on = await waitOn(); await sleep(1500);
    const seed = await fold(), i0 = await info();
    say('§W-LEDGER-UNDO attached=' + on + ' seed=' + JSON.stringify(seed) + ' excluded=' + JSON.stringify(i0.excluded && i0.excluded.ids));
    const tag = 'W-LEDGER-UNDO ' + Date.now(), v1 = tag + ' u-1', v2 = tag + ' u-2';
    const e1 = await page.evaluate((v) => window.__edit(v), v1); await sleep(1200); const e2 = await page.evaluate((v) => window.__edit(v), v2); await sleep(1500);
    let t0 = await read(), r0 = rowsOf(t0), f0 = await fold();
    if (!on || e1.timeout || e2.timeout || !f0 || f0.desc !== v2) { judge('harness: two page edits reached the file and the fold', null, JSON.stringify({ on, e1: !e1.timeout, e2: !e2.timeout, f0 })); throw new Error('no edits'); }
    const u2row = r0[r0.length - 1], u1row = r0[r0.length - 2];
    // U1
    await back(); let t1 = await read(), r1 = rowsOf(t1), f1 = await fold(), m1 = r1[r1.length - 1], p1 = JSON.parse(m1.parameters || '{}');
    // the chain, checked independently in Node: every row's op_hash = sha256(prev | canonical(row)) and links to the row before (the full verifyChain cannot pass here: the unpinned door row is in the file, §58)
    const links = r1.every((r, i) => r.prev_hash === (i ? r1[i - 1].op_hash : LS.GENESIS) && r.op_hash === sha(r.prev_hash + '|' + K._canonical(r)));
    const sigOk = await page.evaluate((m) => window.KernelOps._contentHash(m).then((h) => window.ErpSigner.verify(h, m.sig)), m1);
    const vPage = links && sigOk;
    judge('U1 fold-back after two edits: the fold shows the first (' + JSON.stringify(f1 && f1.desc && f1.desc.slice(-3)) + '); +' + (r1.length - r0.length) + ' row, op_type ' + m1.op_type + ', target = the second edit\'s op_uuid; ids unique; chain links ' + links + ', the UNDO row verifies under the page\'s key ' + sigOk,
      f1 && f1.desc === v1 && r1.length === r0.length + 1 && m1.op_type === 'UNDO' && JSON.stringify(p1.targets) === JSON.stringify([u2row.op_uuid]) && uniqIds(r1) && t1.startsWith(t0) && vPage === true, 'targets=' + JSON.stringify(p1.targets));
    // U2
    await back(); const r2 = rowsOf(await read()), f2 = await fold(), m2 = r2[r2.length - 1], p2 = JSON.parse(m2.parameters || '{}');
    judge('U2 fold-back again: the seed\'s Description (' + JSON.stringify(f2 && f2.desc) + '), the marker is not a gesture: +1 UNDO row, target = the first edit', f2 && f2.desc === seed.desc && r2.length === r1.length + 1 && m2.op_type === 'UNDO' && JSON.stringify(p2.targets) === JSON.stringify([u1row.op_uuid]), 'targets=' + JSON.stringify(p2.targets));
    // U3
    await fwd(); const t3 = await read(), r3 = rowsOf(t3), f3 = await fold(), m3 = r3[r3.length - 1], p3 = JSON.parse(m3.parameters || '{}');
    judge('U3 fold-forward: the EARLIEST undone gesture comes back (the first edit), +1 REDO row', f3 && f3.desc === v1 && r3.length === r2.length + 1 && m3.op_type === 'REDO' && JSON.stringify(p3.targets) === JSON.stringify([u1row.op_uuid]), JSON.stringify(f3 && f3.desc && f3.desc.slice(-3)) + ' targets=' + JSON.stringify(p3.targets));
    // U5 (before the reload; the file as it is now)
    // §62: the door admits only keys it trusts, so U5 first trusts this browser's key at the door, as the owner would (ledger_sign.js trust <fp>)
    const pkid = await page.evaluate(() => window.ErpSigner.pubKeyHex), pfp = crypto.createHash('sha256').update(Buffer.from(pkid, 'hex')).digest('hex').slice(0, 16).replace(/(.{4})(?=.)/g, '$1-');
    const cf = path.join(dir, 'copy.jsonl'); fs.writeFileSync(cf, t3); const tr = cp.spawnSync(process.execPath, [path.join(REPO, 'common/door/ledger_sign.js'), 'trust', pfp, cf], { encoding: 'utf8', env: Object.assign({}, process.env, { RED1_LEDGER_ROSTER: path.join(dir, 'roster.json') }) });
    process.env.RED1_LEDGER_ROSTER = path.join(dir, 'roster.json');
    const d5 = doorRead(t3);
    judge('U5 the REAL door (door.js mis.read), with this browser\'s key trusted at the door (§62), over the same file reads the same Description as the page (' + JSON.stringify(d5.desc && String(d5.desc).slice(-3)) + ')', tr.status === 0 && d5.desc === v1, (tr.stdout || '').trim() + ' ' + d5.err);
    // U4
    await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.LedgerUi && document.getElementById('erp-ledger-pill'), null, { timeout: 60000 }); await inject();
    const on4 = await waitOn(25000); await sleep(1500); const f4 = await fold();
    judge('U4 reload: the re-read file gives the same fold (' + JSON.stringify(f4 && f4.desc && String(f4.desc).slice(-3)) + ')', on4 && f4 && f4.desc === v1, (LOG.filter((l) => /§LEDGER markers/.test(l)).pop() || 'no §LEDGER markers line'));
    // U6: an UNDO from a third key, stamped as the page's own, targeting the first edit
    const t6 = await read(), r6 = rowsOf(t6), last = r6[r6.length - 1], pageKid = await page.evaluate(() => window.ErpSigner.pubKeyHex);
    const fake = { id: last.id + 1, op_uuid: crypto.randomUUID(), timestamp: Date.now(), op_type: 'UNDO', parameters: JSON.stringify({ op_type: 'UNDO', targets: [u1row.op_uuid], _sigv: 2, signed_by: pageKid }), input_guids: null, output_guid: null, undone: 0, prev_hash: last.op_hash, op_hash: null, sig: null, gid: null, branch_id: null, user_tag: null };
    fake.op_hash = sha(last.op_hash + '|' + K._canonical(fake)); fake.sig = crypto.sign('sha256', Buffer.from(sha('cs2|' + K._canonicalV2(fake)), 'utf8'), { key: evil.privateKey, dsaEncoding: 'ieee-p1363' }).toString('hex');
    await page.evaluate((t) => window.__write(t), t6 + JSON.stringify(fake) + '\n');
    await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.LedgerUi && document.getElementById('erp-ledger-pill'), null, { timeout: 60000 }); await inject();
    await waitOn(25000); await sleep(1500); const f6 = await fold(), i6 = await info();
    judge('U6 an UNDO signed by a third key (stamped as the page\'s) is not applied: the fold keeps the first edit; the row is excluded (id ' + fake.id + ')', f6 && f6.desc === v1 && i6.excluded.ids.indexOf(fake.id) >= 0, 'excluded=' + JSON.stringify(i6.excluded.ids));
    // U7: undo, then two redos; the unpinned door row (door-x) never enters the fold
    await back(); const n7a = rowsOf(await read()).length; await fwd(); await fwd(); const n7b = rowsOf(await read()).length; await fwd(); const n7c = rowsOf(await read()).length;   // undo u-1; redo u-1; redo u-2 (undone since U1); a third redo has nothing left
    const f7 = await fold(), i7 = await info(), doorRow = rowsOf(await read()).find((r) => { try { return JSON.parse(r.parameters).changes.referenceno; } catch (e) { return false; } });
    judge('U7 redo cannot resurrect an untrusted row: after undo + 2 redos the fold is the second edit, ReferenceNo ' + JSON.stringify(f7 && f7.ref) + ' (door-x is unpinned, still excluded); a 3rd redo wrote ' + (n7c - n7b) + ' rows',
      f7 && f7.ref !== 'door-x' && f7.desc === v2 && !!doorRow && i7.excluded.ids.indexOf(doorRow.id) >= 0 && n7b === n7a + 2 && n7c === n7b, 'rows ' + n7a + '->' + n7b + '->' + n7c + ' ' + (LOG.filter((l) => /nothing to redo/.test(l)).length ? 'nothing-to-redo logged' : ''));
  } catch (e) { if (e.message !== 'no edits') judge('harness', null, e.message.split('\n')[0]); }
  if (process.env.LA_LOG || fail) LOG.filter((l) => /§LEDGER|§FOLD|rror/i.test(l)).slice(-25).forEach((l) => say('    · ' + l.slice(0, 220)));
  judge('page-errors', errs.length === 0, 'n=' + errs.length + ' ' + errs.slice(0, 2).join(' | '));
  say('§WITNESS_LEDGER_UNDO pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + ' verdict=' + (fail ? 'FAIL' : inc ? 'INCONCLUSIVE' : 'PASS'));
  await b.close(); server.close(); process.exit(fail || inc ? 1 : 0);
})();
