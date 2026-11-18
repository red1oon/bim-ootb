#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-LEDGER-ENFORCE (bim-compiler prompts/CLI_ERP_IVR.md §59). READ THE §-LOG after every run; an exit code is not evidence.
 * ISSUE: §58 pinned the door's key, but an unpinned or forged row still reached the page's tip fold (W-LEDGER-PIN P3): an alarm, not a lock. Now every row is ADMITTED by signature (this key or a pinned
 *   one), a group whole; rows not admitted are marked undone in the in-memory sidecar only, so every window's fold ignores them. The observable here is C_BPartner 112's ReferenceNo in the page's tip fold.
 *   E1 unpinned door rows (ReferenceNo door-2): the fold does NOT show door-2; excluded.rows = 2 · E2 the Trust click: the fold shows door-2, excluded 0
 *   E3 a forged row (third key, signed_by = the pinned door's) setting FORGED: excluded as forged, the fold keeps door-2 · E4 a torn group (one door-signed + one forged row sharing a gid): both excluded
 *   E5 a page op still commits and shows; the file keeps the excluded rows byte for byte · E6 fold-forward (redo) in file mode never re-admits an excluded row (CLI_ERP_IVR §61: redo is allowed now, it reads undone=1 only) · E7 reload: pin persists, forged rows stay excluded, door rows admitted
 * Falsifier: LEDGER_ENFORCE_BREAK=noenforce (window.__LEDGER_BREAK) -> E1 FAIL and E3 FAIL.
 */
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm'), crypto = require('crypto');
const REPO = path.join(__dirname, '..', '..'), BREAK = process.env.LEDGER_ENFORCE_BREAK || '';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.sql': 'text/plain' };
const server = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(REPO, p), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); }); });
let pass = 0, fail = 0, inc = 0; const say = (s) => console.log(s);
const judge = (id, ok, ev) => { if (ok === null) inc++; else if (ok) pass++; else fail++; say('  ' + (ok === null ? '⚪' : ok ? '✅' : '❌') + ' ' + id + '  ' + (ev || '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await new Promise((r) => server.listen(0, r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledgerenf_')); process.env.RED1_DOOR_KEY = path.join(dir, 'door_key.json');
  const LS = require('../../common/door/ledger_sign.js'), DOORKID = LS.key().kid, DOORFILE = path.join(dir, 'door.jsonl');
  const bp = (v, extra) => Object.assign({ op_type: 'CRUD_UPDATE', table: 'c_bpartner', id: 112, changes: { referenceno: { new: v } }, t: new Date().toISOString() }, extra || {});
  LS.append(DOORFILE, [bp('door-1'), bp('door-2')]);
  const K = (() => { const sb = { window: {}, console: { log() {}, warn() {}, error() {} }, crypto: crypto.webcrypto, TextEncoder, TextDecoder, setTimeout, clearTimeout }; vm.runInNewContext(fs.readFileSync(path.join(REPO, 'erp/kernel_ops.js'), 'utf8'), sb); return sb.window.KernelOps; })();
  const evil = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }), sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
  const forge = (prev, id, v, gid) => { const r = { id, op_uuid: crypto.randomUUID(), timestamp: Date.now(), op_type: 'CRUD_UPDATE', parameters: JSON.stringify(Object.assign(bp(v), { _sigv: 2, signed_by: DOORKID })), input_guids: null, output_guid: null, undone: 0, prev_hash: prev, op_hash: null, sig: null, gid: gid || null, branch_id: null, user_tag: 'door' };
    r.op_hash = sha(prev + '|' + K._canonical(r)); r.sig = crypto.sign('sha256', Buffer.from(sha('cs2|' + K._canonicalV2(r)), 'utf8'), { key: evil.privateKey, dsaEncoding: 'ieee-p1363' }).toString('hex'); return r; };
  const b = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] }), ctx = await b.newContext(), LOG = [], errs = [];
  await ctx.addInitScript((a) => { if (a.brk === 'noenforce') window.__LEDGER_BREAK = 'noenforce'; window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('UI1', { create: true }); }, { brk: BREAK });
  const page = await ctx.newPage(); page.on('console', (m) => LOG.push(m.text())); page.on('pageerror', (e) => errs.push(String(e)));
  const URL = 'http://localhost:' + server.address().port + '/erp/idempiere.html?login=GardenAdmin&window=146';
  const inject = () => page.evaluate(() => {
    window.__fi = window.__fi || 0;
    window.__edit = () => new Promise((resolve) => { let done = false; const v = 'W-LEDGER-ENFORCE ' + Date.now() + '-' + (window.__fi++);
      const h = () => { if (done) return; done = true; window.removeEventListener('overlay:committed', h); resolve({ v }); }; window.addEventListener('overlay:committed', h);
      window.__crud.applyOp({ key: 'c_bpartner', table: 'C_BPartner', verb: 'update', ownerGated: false, op_type: 'CRUD_UPDATE', id: 112, changes: { Description: { old: window.__prev || null, new: v } }, actor: 100 }); window.__prev = v;
      setTimeout(() => { if (!done) { done = true; window.removeEventListener('overlay:committed', h); resolve({ v, timeout: true }); } }, 6000); });
    window.__read = async () => { try { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('UI1', { create: true }); return await (await (await d.getFileHandle('ad_seed.db.ops.jsonl')).getFile()).text(); } catch (e) { return ''; } };
    window.__write = async (t) => { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('UI1', { create: true }), w = await (await d.getFileHandle('ad_seed.db.ops.jsonl', { create: true })).createWritable(); await w.write(t); await w.close(); };
    window.__fold = () => { const r = window.__crud.withTipQuery((q) => q('SELECT referenceno, description FROM c_bpartner WHERE c_bpartner_id = 112')); return r && r[0] ? { ref: r[0].referenceno, desc: r[0].description } : null; };
  });
  const load = async () => { await page.goto(URL, { waitUntil: 'load' }); await page.waitForFunction(() => window.__crud && window.ErpSigner && window.ErpSigner.pubKeyHex && window.LedgerFile && window.LedgerUi && document.getElementById('erp-ledger-pill'), null, { timeout: 60000 }); await sleep(1500); await inject(); };
  const waitOn = async (ms) => { try { await page.waitForFunction(() => window.LedgerUi.state() === 'on', null, { timeout: ms || 15000 }); return true; } catch (e) { return false; } };
  const info = () => page.evaluate(() => window.__crud.ledgerInfo()), fold = () => page.evaluate(() => window.__fold()), read = () => page.evaluate(() => window.__read());
  const rowsOf = (t) => t.split('\n').filter(Boolean).map(JSON.parse);
  try {
    await load(); await page.evaluate((t) => window.__write(t), fs.readFileSync(DOORFILE, 'utf8'));
    await page.click('#erp-ledger-pill'); const on = await waitOn(); await sleep(1500);
    const i1 = await info(), f1 = await fold();
    judge('E1 unpinned door rows (ReferenceNo door-2): the page\'s tip fold does NOT show them (ref=' + JSON.stringify(f1 && f1.ref) + '), excluded.rows=' + i1.excluded.rows + ', the key is listed as unpinned', on && !!f1 && f1.ref !== 'door-2' && i1.excluded.rows === 2 && i1.unpinned.length === 1, JSON.stringify(i1.excluded) + ' pill=' + (await page.$eval('#erp-ledger-pill', (e) => e.textContent)));
    await page.click('#erp-ledger-trust'); await sleep(1800);
    const i2 = await info(), f2 = await fold();
    judge('E2 the Trust click re-admits them at once: the fold shows door-2, excluded 0', f2 && f2.ref === 'door-2' && i2.excluded.rows === 0 && i2.unpinned.length === 0, JSON.stringify(f2) + ' ' + JSON.stringify(i2.excluded));
    // E3: forged
    let text = await read(), rows = rowsOf(text), last = rows[rows.length - 1], f3row = forge(last.op_hash, last.id + 1, 'FORGED');
    await page.evaluate((t) => window.__write(t), text + JSON.stringify(f3row) + '\n'); await page.evaluate(() => window.__edit()); await sleep(1500);
    const i3 = await info(), f3 = await fold();
    judge('E3 a forged row (third key, signed_by = the pinned door\'s) setting FORGED: excluded (id ' + f3row.id + '), the fold keeps door-2', f3 && f3.ref === 'door-2' && i3.excluded.ids.indexOf(f3row.id) >= 0, JSON.stringify(f3) + ' excluded=' + JSON.stringify(i3.excluded.ids) + ' ' + (LOG.filter((l) => /§LEDGER excluded/.test(l)).pop() || ''));
    // E4: a torn group
    text = await read(); rows = rowsOf(text); last = rows[rows.length - 1];
    const g = 'torn-' + Date.now(), good = LS.seal(last.op_hash, last.id + 1, bp('T1')); good.gid = g; const bad = forge(good.op_hash, last.id + 2, 'T2', g);
    await page.evaluate((t) => window.__write(t), text + JSON.stringify(good) + '\n' + JSON.stringify(bad) + '\n'); await page.evaluate(() => window.__edit()); await sleep(1500);
    const i4 = await info(), f4 = await fold();
    judge('E4 a torn group (one door-signed + one forged row sharing a gid): BOTH excluded (ids ' + good.id + ',' + bad.id + '), the fold keeps door-2', f4 && f4.ref === 'door-2' && i4.excluded.ids.indexOf(good.id) >= 0 && i4.excluded.ids.indexOf(bad.id) >= 0, JSON.stringify(f4) + ' excluded=' + JSON.stringify(i4.excluded.ids));
    // E5: the page still works; the file keeps the excluded rows byte for byte
    const before = await read(); const e5 = await page.evaluate(() => window.__edit()); await sleep(1500); const after = await read(), f5 = await fold();
    judge('E5 a page op still commits and shows (description ' + JSON.stringify(f5 && f5.desc) + '); the file keeps every excluded row byte for byte', !e5.timeout && after.startsWith(before) && after.length > before.length && f5 && f5.desc === e5.v, 'bytes ' + before.length + ' -> ' + after.length);
    // E6
    await page.evaluate(() => window.crudFoldForward && window.crudFoldForward('x', 'y')); await sleep(1800);
    const i6 = await info(), f6 = await fold();
    judge('E6 fold-forward (redo) in file mode (allowed since §61) never re-admits an excluded row: the forged and torn rows stay excluded, the fold never shows FORGED/T2', i6.excluded.ids.indexOf(f3row.id) >= 0 && i6.excluded.ids.indexOf(bad.id) >= 0 && f6 && f6.ref !== 'FORGED' && f6.ref !== 'T2', JSON.stringify(f6) + ' excluded=' + JSON.stringify(i6.excluded.ids));
    // E7: reload
    const exBefore = (await info()).excluded.ids.length;
    await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.LedgerUi && document.getElementById('erp-ledger-pill'), null, { timeout: 60000 }); await inject();
    const on7 = await waitOn(25000); await sleep(1500); const i7 = await info(), f7 = await fold();
    judge('E7 after a reload: the pin persists (unpinned 0), the forged rows stay excluded (' + i7.excluded.ids.length + ' = ' + exBefore + '), the door\'s rows stay admitted (ReferenceNo ' + JSON.stringify(f7 && f7.ref) + ')', on7 && i7.unpinned.length === 0 && i7.excluded.ids.length === exBefore && f7 && f7.ref === 'door-2', JSON.stringify(i7.excluded.ids));
  } catch (e) { judge('harness', null, e.message.split('\n')[0]); }
  if (process.env.LA_LOG || fail) LOG.filter((l) => /§LEDGER|rror/i.test(l)).slice(-25).forEach((l) => say('    · ' + l.slice(0, 220)));
  judge('page-errors', errs.length === 0, 'n=' + errs.length + ' ' + errs.slice(0, 2).join(' | '));
  say('§WITNESS_LEDGER_ENFORCE pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + ' verdict=' + (fail ? 'FAIL' : inc ? 'INCONCLUSIVE' : 'PASS'));
  await b.close(); server.close(); process.exit(fail || inc ? 1 : 0);
})();
