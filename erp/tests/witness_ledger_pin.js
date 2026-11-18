#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-LEDGER-PIN (bim-compiler prompts/CLI_ERP_IVR.md §58). READ THE §-LOG after every run; an exit code is not evidence.
 * ISSUE: the page trusted every key the ledger file named (`signed_by`): integrity, not provenance. Now only a PINNED key is a peer; an unknown key is reported with its fingerprint and its rows fail verifyChain
 *   until the owner clicks "Trust key ...", having compared the fingerprint with `node common/door/ledger_sign.js key`.
 *   P1 attach to a file with door rows: the page lists the door key (fp, rows) as unpinned, shows the Trust button, and verifyChain FAILS at the first door row as a signature (not silently ok)
 *   P2 the fingerprint the page shows equals what the door's `ledger_sign.js key` prints
 *   P3 a page op while the key is unpinned: observed (does the commit land, what does the chain say)
 *   P4 the Trust click: unpinned empty, the button gone, verifyChain ok over page + door rows
 *   P5 reload: the pin persists (no button, chain ok, no click)
 *   P6 a forged row (signed by a THIRD key, stamped signed_by = the door's) is rejected even though the door's key is pinned
 * Falsifier: LEDGER_PIN_BREAK=tofu (window.__LEDGER_BREAK='tofu': the old add-every-key rule) -> P1 FAIL.
 */
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm'), crypto = require('crypto'), cp = require('child_process');
const REPO = path.join(__dirname, '..', '..'), BREAK = process.env.LEDGER_PIN_BREAK || '';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.sql': 'text/plain' };
const server = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(REPO, p), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); }); });
let pass = 0, fail = 0, inc = 0; const say = (s) => console.log(s);
const judge = (id, ok, ev) => { if (ok === null) inc++; else if (ok) pass++; else fail++; say('  ' + (ok === null ? '⚪' : ok ? '✅' : '❌') + ' ' + id + '  ' + (ev || '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await new Promise((r) => server.listen(0, r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledgerpin_')), KF = path.join(dir, 'door_key.json'); process.env.RED1_DOOR_KEY = KF;
  const LS = require('../../common/door/ledger_sign.js'), DOORKID = LS.key().kid, DOORFILE = path.join(dir, 'door.jsonl');
  const op = (n) => ({ op_type: 'CRUD_UPDATE', table: 'c_order', id: 50000, changes: { description: { new: 'door-' + n } }, t: new Date().toISOString() });
  LS.append(DOORFILE, [op(1), op(2)]);
  const b = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] }), ctx = await b.newContext(), LOG = [], errs = [];
  await ctx.addInitScript((a) => { if (a.brk === 'tofu') window.__LEDGER_BREAK = 'tofu'; window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('UI1', { create: true }); }, { brk: BREAK });
  const page = await ctx.newPage(); page.on('console', (m) => LOG.push(m.text())); page.on('pageerror', (e) => errs.push(String(e)));
  const URL = 'http://localhost:' + server.address().port + '/erp/idempiere.html?login=GardenAdmin&window=146';
  const inject = () => page.evaluate(() => {
    window.__fi = window.__fi || 0;
    window.__edit = () => new Promise((resolve) => { let done = false; const v = 'W-LEDGER-PIN ' + Date.now() + '-' + (window.__fi++);
      const h = () => { if (done) return; done = true; window.removeEventListener('overlay:committed', h); resolve({ v }); }; window.addEventListener('overlay:committed', h);
      window.__crud.applyOp({ key: 'c_bpartner', table: 'C_BPartner', verb: 'update', ownerGated: false, op_type: 'CRUD_UPDATE', id: 112, changes: { Description: { old: window.__prev || null, new: v } }, actor: 100 }); window.__prev = v;
      setTimeout(() => { if (!done) { done = true; window.removeEventListener('overlay:committed', h); resolve({ v, timeout: true }); } }, 6000); });
    window.__read = async () => { try { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('UI1', { create: true }); return await (await (await d.getFileHandle('ad_seed.db.ops.jsonl')).getFile()).text(); } catch (e) { return ''; } };
    window.__write = async (t) => { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('UI1', { create: true }), w = await (await d.getFileHandle('ad_seed.db.ops.jsonl', { create: true })).createWritable(); await w.write(t); await w.close(); };
    window.__chain = async () => { const v = await window.KernelOps.verifyChain(window.__crud.kernelDb()); return { ok: v.ok, len: v.len, why: v.why, brokeAt: v.brokeAt }; };
  });
  const load = async () => { await page.goto(URL, { waitUntil: 'load' }); await page.waitForFunction(() => window.__crud && window.ErpSigner && window.ErpSigner.pubKeyHex && window.LedgerFile && window.LedgerUi && document.getElementById('erp-ledger-pill'), null, { timeout: 60000 }); await sleep(1500); await inject(); };
  const waitOn = async (ms) => { try { await page.waitForFunction(() => window.LedgerUi.state() === 'on', null, { timeout: ms || 15000 }); return true; } catch (e) { return false; } };
  const rows = async () => (await page.evaluate(() => window.__read())).split('\n').filter(Boolean).map(JSON.parse);
  const trustVisible = () => page.$eval('#erp-ledger-trust', (e) => e.style.display !== 'none').catch(() => false);
  try {
    await load();
    await page.evaluate((t) => window.__write(t), fs.readFileSync(DOORFILE, 'utf8'));   // the folder already holds the door's rows
    await page.click('#erp-ledger-pill'); const on = await waitOn(); await sleep(1500);
    const info1 = await page.evaluate(() => window.__crud.ledgerInfo()), ch1 = await page.evaluate(() => window.__chain()), tv1 = await trustVisible();
    judge('P1 door rows in the file, key not pinned: the page lists it (fp ' + (info1.unpinned[0] && info1.unpinned[0].fp) + ', ' + (info1.unpinned[0] && info1.unpinned[0].rows) + ' rows), shows the Trust button, and verifyChain FAILS at the first door row as a signature', on && info1.unpinned.length === 1 && info1.unpinned[0].kid === DOORKID && info1.unpinned[0].rows === 2 && /^[0-9a-f]{4}(-[0-9a-f]{4}){3}$/.test(info1.unpinned[0].fp) && tv1 && ch1.ok === false && ch1.why === 'signature' && ch1.brokeAt === 1, 'chain=' + JSON.stringify(ch1) + ' trustButton=' + tv1);
    // P2
    const fpDoor = cp.execFileSync(process.execPath, [path.join(REPO, 'common/door/ledger_sign.js'), 'key'], { env: process.env }).toString(), m2 = /fingerprint ([0-9a-f-]+)/.exec(fpDoor);
    judge('P2 the fingerprint the page shows equals what `ledger_sign.js key` prints', !!m2 && !!info1.unpinned[0] && m2[1] === info1.unpinned[0].fp, 'door=' + (m2 && m2[1]) + ' page=' + (info1.unpinned[0] && info1.unpinned[0].fp));
    // P3
    const n3 = (await rows()).length; await page.evaluate(() => window.__edit()); await sleep(1500); const r3 = await rows(), ch3 = await page.evaluate(() => window.__chain());
    judge('P3 a page op while the key is unpinned: observed', true, 'the commit ' + (r3.length > n3 ? 'LANDED' : 'did NOT land') + ' (' + n3 + ' -> ' + r3.length + ' rows); chain ' + JSON.stringify(ch3));
    // P4: the Trust click
    await page.click('#erp-ledger-trust'); await sleep(1500);
    const info4 = await page.evaluate(() => window.__crud.ledgerInfo()), ch4 = await page.evaluate(() => window.__chain()), tv4 = await trustVisible();
    judge('P4 the Trust click: unpinned empty, the button gone, verifyChain ok over page + door rows', info4.unpinned.length === 0 && tv4 === false && ch4.ok === true, JSON.stringify(ch4) + ' roster=' + info4.roster);
    // P5: reload
    await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.LedgerUi && document.getElementById('erp-ledger-pill'), null, { timeout: 60000 }); await inject();
    const on5 = await waitOn(25000); await sleep(1200); const info5 = await page.evaluate(() => window.__crud.ledgerInfo()), ch5 = on5 ? await page.evaluate(() => window.__chain()) : null;
    judge('P5 after a reload the pin persists: no Trust button, chain ok, no click', on5 && info5.unpinned.length === 0 && (await trustVisible()) === false && ch5.ok === true, JSON.stringify(ch5) + ' roster=' + info5.roster);
    // P6: a forged row
    const K = (() => { const sb = { window: {}, console: { log() {}, warn() {}, error() {} }, crypto: crypto.webcrypto, TextEncoder, TextDecoder, setTimeout, clearTimeout }; vm.runInNewContext(fs.readFileSync(path.join(REPO, 'erp/kernel_ops.js'), 'utf8'), sb); return sb.window.KernelOps; })();
    const text6 = await page.evaluate(() => window.__read()), rows6 = text6.split('\n').filter(Boolean).map(JSON.parse), last = rows6[rows6.length - 1], evil = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
    const forged = { id: last.id + 1, op_uuid: crypto.randomUUID(), timestamp: Date.now(), op_type: 'CRUD_UPDATE', parameters: JSON.stringify({ op_type: 'CRUD_UPDATE', table: 'c_order', id: 50000, changes: { description: { new: 'FORGED' } }, t: new Date().toISOString(), _sigv: 2, signed_by: DOORKID }), input_guids: null, output_guid: null, undone: 0, prev_hash: last.op_hash, op_hash: null, sig: null, gid: null, branch_id: null, user_tag: 'door' };
    forged.op_hash = sha(forged.prev_hash + '|' + K._canonical(forged)); forged.sig = crypto.sign('sha256', Buffer.from(sha('cs2|' + K._canonicalV2(forged)), 'utf8'), { key: evil.privateKey, dsaEncoding: 'ieee-p1363' }).toString('hex');
    await page.evaluate((t) => window.__write(t), text6 + JSON.stringify(forged) + '\n');
    await page.evaluate(() => window.__edit()); await sleep(1500);   // the commit re-hydrates the sidecar from the file, forged row included
    const ch6 = await page.evaluate(() => window.__chain());
    judge('P6 a forged row (signed by a third key, signed_by = the door\'s) is rejected although the door\'s key is pinned', ch6.ok === false && ch6.why === 'signature' && ch6.brokeAt === forged.id, JSON.stringify(ch6) + ' forged id=' + forged.id);
  } catch (e) { judge('harness', null, e.message.split('\n')[0]); }
  if (process.env.LA_LOG || fail) LOG.filter((l) => /§LEDGER|rror/i.test(l)).slice(-25).forEach((l) => say('    · ' + l.slice(0, 200)));
  judge('page-errors', errs.length === 0, 'n=' + errs.length + ' ' + errs.slice(0, 2).join(' | '));
  say('§WITNESS_LEDGER_PIN pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + ' verdict=' + (fail ? 'FAIL' : inc ? 'INCONCLUSIVE' : 'PASS'));
  await b.close(); server.close(); process.exit(fail || inc ? 1 : 0);
})();
