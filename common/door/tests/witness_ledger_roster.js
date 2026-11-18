#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-LEDGER-ROSTER (bim-compiler prompts/CLI_ERP_IVR.md §62). READ THE §-LOG after every run; an exit code is not evidence.
 * ISSUE: the page admits a ledger row only if a trusted key signed it (§59); the DOOR replayed every row, by any key or none, and every UNDO marker (§61 limit 5): a forged row changed what red1> shows
 *   while the page ignored it. And a key once trusted could not be untrusted, on either end. Now the door has its own roster (ledger_sign.js keys / trust / untrust) and admits by the page's rule;
 *   the page's Keys panel shows its own fingerprint and takes trust back. Observable: C_BPartner 112 (page rows set Description, door rows set ReferenceNo) read by the REAL door process.
 *   R1 page-key rows are not applied at the door until trusted; the unpinned fp is named · R2 `keys` lists the door (this door) and the page key (unknown) with row counts = an independent count
 *   R3 `trust <fp>`: the page's Description now shows · R4 a forged row and a torn group stay out · R5 an UNDO by a third key is not applied; the page key's own UNDO/REDO are
 *   R6 `untrust <fp>`: the page rows are out again, `keys` says revoked, the door's own rows still apply · R7 the op-log image (erp_cli) is not reused when trust changed which rows count
 *   P1 the page's Keys panel shows its own fingerprint = sha256(SPKI) computed here · P2 Trust then Untrust in the panel: the door's value leaves the fold, and stays out after a reload
 * Falsifiers: DOOR_ROSTER_BREAK=noadmit -> R1 + R4 FAIL · ERP_BREAK=stalekept -> R7 FAIL · LEDGER_UI_BREAK=nounpin -> P2 FAIL.
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm'), crypto = require('crypto'), cp = require('child_process'), http = require('http');
const ROOT = path.join(__dirname, '..', '..', '..');
let pass = 0, fail = 0, inc = 0; const say = (s) => console.log(s);
const judge = (id, ok, ev) => { if (ok === null) inc++; else if (ok) pass++; else fail++; say('  ' + (ok === null ? '⚪' : ok ? '✅' : '❌') + ' ' + id + '  ' + (ev || '')); };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledgerroster_'));
Object.assign(process.env, { RED1_DOOR_KEY: path.join(dir, 'door_key.json'), RED1_LEDGER_ROSTER: path.join(dir, 'roster.json'), BIM_DOOR_JOURNAL: path.join(dir, 'journal.jsonl') });
const LS = require('../ledger_sign.js'), F = path.join(dir, 'ad_seed.db.ops.jsonl');
const K = (() => { const sb = { window: {}, console: { log() {}, warn() {}, error() {} }, crypto: crypto.webcrypto, TextEncoder, TextDecoder, setTimeout, clearTimeout }; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'erp/kernel_ops.js'), 'utf8'), sb); return sb.window.KernelOps; })();
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const mk = () => { const kp = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }); return { priv: kp.privateKey, kid: kp.publicKey.export({ type: 'spki', format: 'der' }).toString('hex') }; };
const fpOf = (kid) => sha256hex(Buffer.from(kid, 'hex')).slice(0, 16).replace(/(.{4})(?=.)/g, '$1-'), sha256hex = (b) => crypto.createHash('sha256').update(b).digest('hex');
const PAGE = mk(), EVIL = mk();
const rowsOf = () => fs.readFileSync(F, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
// a row made the way the PAGE makes it: op_type on the row, parameters without it, v2 content-signed, signed_by = the SPKI hex (erp_signer.js); `signer` signs, `by` is what it claims
function pageRow(params, opType, signer, by, gid) {
  const all = rowsOf(), last = all[all.length - 1];
  const r = { id: last.id + 1, op_uuid: crypto.randomUUID(), timestamp: Date.now(), op_type: opType, parameters: JSON.stringify(Object.assign({}, params, { _sigv: 2, signed_by: by || signer.kid })), input_guids: null, output_guid: null, undone: 0, prev_hash: last.op_hash, op_hash: null, sig: null, gid: gid || null, branch_id: null, user_tag: 'page' };
  r.op_hash = sha(r.prev_hash + '|' + K._canonical(r)); r.sig = crypto.sign('sha256', Buffer.from(sha('cs2|' + K._canonicalV2(r)), 'utf8'), { key: signer.priv, dsaEncoding: 'ieee-p1363' }).toString('hex');
  fs.appendFileSync(F, JSON.stringify(r) + '\n'); return r;
}
const desc = (v) => ({ table: 'C_BPartner', id: 112, changes: { Description: { old: null, new: v } } });
function doorRead(extraEnv) {
  const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'common/door/door.js'), '--actor', 'human', 'mis.read kind=C_BPartner id=112'], { encoding: 'utf8', env: Object.assign({}, process.env, { BIM_OBJECT_OPLOG: F }, extraEnv || {}) });
  let j = null; try { j = JSON.parse(r.stdout.split('\n').filter((l) => l.trim().startsWith('{')).pop()); } catch (e) {}
  const rec = j && j.answer && j.answer.record; return { desc: rec ? rec.description : undefined, ref: rec ? rec.referenceno : undefined, err: (r.stderr || '').split('\n').filter((l) => /§LEDGER/.test(l)) };
}
const cli = (args) => { const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'common/door/ledger_sign.js')].concat(args), { encoding: 'utf8', env: Object.assign({}, process.env, { BIM_OBJECT_OPLOG: F }) }); return { code: r.status, out: r.stdout || '', err: r.stderr || '' }; };
(async () => {
  const seedDesc = JSON.parse(cp.spawnSync('sqlite3', ['-readonly', '-json', path.join(ROOT, 'erp/ad_seed.db'), 'SELECT description AS d FROM c_bpartner WHERE c_bpartner_id=112'], { encoding: 'utf8' }).stdout || '[{}]')[0].d;
  LS.append(F, [{ op_type: 'CRUD_UPDATE', table: 'c_bpartner', id: 112, changes: { referenceno: { new: 'door-1' } }, t: new Date().toISOString() }]);
  const p1 = pageRow(desc('page-1'), 'CRUD_UPDATE', PAGE);
  // R1
  const t0 = Date.now(); LS.replayOps(fs.readFileSync(F, 'utf8')); const ms = Date.now() - t0;
  const r1 = doorRead(), pfp = fpOf(PAGE.kid);
  judge('R1 a page-key row is NOT applied at the door until trusted (Description ' + JSON.stringify(r1.desc) + ' = the seed\'s), the door\'s own row is (ReferenceNo ' + JSON.stringify(r1.ref) + '); the unpinned fp is named',
    r1.desc === seedDesc && r1.ref === 'door-1' && r1.err.some((l) => l.indexOf('unpinned key fp=' + pfp + ' rows=1') >= 0), r1.err.join(' | ') + ' · replayOps ' + rowsOf().length + ' rows in ' + ms + ' ms');
  // R2
  const k2 = cli(['keys']), nPage = rowsOf().filter((r) => { try { return JSON.parse(r.parameters).signed_by === PAGE.kid; } catch (e) { return false; } }).length, nDoor = rowsOf().filter((r) => { try { return JSON.parse(r.parameters).signed_by === LS.key().kid; } catch (e) { return false; } }).length;
  judge('R2 `keys` lists this door (rows ' + nDoor + ') and the page key as unknown (rows ' + nPage + ', counted independently)', k2.code === 0 && k2.out.indexOf(fpOf(LS.key().kid) + '  this door  rows=' + nDoor) >= 0 && k2.out.indexOf(pfp + '  unknown  rows=' + nPage) >= 0, JSON.stringify(k2.out.trim()));
  // R3
  const t3 = cli(['trust', pfp]), ros = JSON.parse(fs.readFileSync(process.env.RED1_LEDGER_ROSTER, 'utf8')), r3 = doorRead();
  judge('R3 `trust <page fp>`: the roster holds it (mode ' + (fs.statSync(process.env.RED1_LEDGER_ROSTER).mode & 0o777).toString(8) + '), the door now shows the page\'s Description', t3.code === 0 && ros.trusted.some((t) => t.kid === PAGE.kid) && r3.desc === 'page-1', JSON.stringify(r3.desc) + ' ' + t3.out.trim());
  // R4
  pageRow(desc('FORGED'), 'CRUD_UPDATE', EVIL, PAGE.kid); const g = 'torn-' + Date.now(); pageRow(desc('T1'), 'CRUD_UPDATE', PAGE, null, g); pageRow(desc('T2'), 'CRUD_UPDATE', EVIL, PAGE.kid, g);
  const r4 = doorRead();
  judge('R4 a forged row (third key, signed_by = the trusted page key) and a torn group (page + forged sharing a gid): all out at the door (Description ' + JSON.stringify(r4.desc) + ')', r4.desc === 'page-1' && r4.err.some((l) => /excluded rows=3 /.test(l)), r4.err.join(' | '));
  // R5
  pageRow({ op_type: 'UNDO', targets: [p1.op_uuid] }, 'UNDO', EVIL, PAGE.kid); const r5a = doorRead();
  pageRow({ op_type: 'UNDO', targets: [p1.op_uuid] }, 'UNDO', PAGE); const r5b = doorRead();
  pageRow({ op_type: 'REDO', targets: [p1.op_uuid] }, 'REDO', PAGE); const r5c = doorRead();
  judge('R5 an UNDO by a third key is not applied at the door (' + JSON.stringify(r5a.desc) + '); the trusted page key\'s UNDO is (' + JSON.stringify(r5b.desc) + ') and its REDO (' + JSON.stringify(r5c.desc) + ')', r5a.desc === 'page-1' && r5b.desc === seedDesc && r5c.desc === 'page-1', '');
  // R7 (image) then R6 (untrust) through the ERP CLI directly, with the op-log image ON for this temp log
  const snap = path.join(dir, 'snap'), imgEnv = { ERP_OPIMAGE: 'on', ERP_OPIMAGE_MIN: '1', ERP_SNAPSHOT_DIR: snap, BIM_OBJECT_OPLOG: F };
  const ecli = () => { const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'common/door/erp_cli.js'), 'read', '--kind', 'C_BPartner', '--id', '112'], { encoding: 'utf8', env: Object.assign({}, process.env, imgEnv) }); let j = null; try { j = JSON.parse(r.stdout); } catch (e) {} return { desc: j && j.record ? j.record.description : undefined, ref: j && j.record ? j.record.referenceno : undefined, err: r.stderr || '' }; };
  const w = ecli(), wrote = /opimage=written/.test(w.err);
  const u6 = cli(['untrust', pfp]), r7 = ecli(), stale = /opimage=stale-kept/.test(r7.err);
  if (!wrote) judge('R7 the op-log image', null, 'no image was written (' + (w.err.match(/opimage=[^\n]*/) || ['no opimage line'])[0] + ')');
  else judge('R7 the image written while the page key was trusted is NOT reused after `untrust` (stale-kept) and the read is right (' + JSON.stringify(r7.desc) + ')', stale && r7.desc === seedDesc, (r7.err.match(/opimage=[^\n]*|snapshot=[^\n]*/g) || []).join(' · '));
  const k6 = cli(['keys']), r6 = doorRead();
  judge('R6 `untrust <page fp>`: the page rows are out again (Description ' + JSON.stringify(r6.desc) + '), `keys` says revoked, the door\'s own row still applies (' + JSON.stringify(r6.ref) + ')', u6.code === 0 && r6.desc === seedDesc && r6.ref === 'door-1' && k6.out.indexOf(pfp + '  revoked') >= 0 && r6.err.some((l) => /revoked key fp=/.test(l)), r6.err.join(' | '));
  // P: the page (headless Chromium, OPFS folder; the door's rows are the file the page attaches)
  let chromium = null; try { ({ chromium } = require(process.env.PW || (os.homedir() + '/bim-ootb/tests/node_modules/playwright'))); } catch (e) { judge('P harness', null, 'playwright not found'); }
  if (chromium) {
    const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.sql': 'text/plain' };
    const server = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); }); });
    await new Promise((r) => server.listen(0, r));
    const DOORF = path.join(dir, 'door_only.jsonl'); LS.append(DOORF, [{ op_type: 'CRUD_UPDATE', table: 'c_bpartner', id: 112, changes: { referenceno: { new: 'door-p' } }, t: new Date().toISOString() }]);
    const b = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] }), ctx = await b.newContext(), LOG = [], errs = [];
    await ctx.addInitScript((a) => { if (a.brk) window.__LEDGER_UI_BREAK = a.brk; window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('RS1', { create: true }); }, { brk: process.env.LEDGER_UI_BREAK || '' });
    const page = await ctx.newPage(); page.on('console', (m) => LOG.push(m.text())); page.on('pageerror', (e) => errs.push(String(e)));
    const URL = 'http://localhost:' + server.address().port + '/erp/idempiere.html?login=GardenAdmin&window=146', sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const ready = async () => { await page.waitForFunction(() => window.__crud && window.ErpSigner && window.ErpSigner.pubKeyHex && window.LedgerUi && document.getElementById('erp-ledger-pill'), null, { timeout: 60000 }); await sleep(1500); };
    const on = async () => { try { await page.waitForFunction(() => window.LedgerUi.state() === 'on', null, { timeout: 25000 }); return true; } catch (e) { return false; } };
    const fold = () => page.evaluate(() => { const r = window.__crud.withTipQuery((q) => q('SELECT referenceno FROM c_bpartner WHERE c_bpartner_id = 112')); return r && r[0] ? r[0].referenceno : null; });
    try {
      await page.goto(URL, { waitUntil: 'load' }); await ready();
      await page.evaluate(async (t) => { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('RS1', { create: true }), w = await (await d.getFileHandle('ad_seed.db.ops.jsonl', { create: true })).createWritable(); await w.write(t); await w.close(); }, fs.readFileSync(DOORF, 'utf8'));
      await page.click('#erp-ledger-pill'); await on(); await sleep(1200);
      await page.click('#erp-ledger-keys'); await sleep(800);
      const own = await page.evaluate(() => (document.getElementById('erp-ledger-ownfp') || {}).textContent || ''), kid = await page.evaluate(() => window.ErpSigner.pubKeyHex);
      judge('P1 the Keys panel shows this browser\'s fingerprint = sha256(SPKI) computed here (' + fpOf(kid) + ')', own === 'This browser: ' + fpOf(kid), JSON.stringify(own));
      await page.click('#erp-ledger-trust'); await sleep(1800); const a = await fold();
      await page.click('#erp-ledger-keys'); await sleep(300); await page.click('#erp-ledger-keys'); await sleep(800);   // close + reopen: the panel lists the key just trusted
      const listed = await page.evaluate(() => Array.prototype.map.call(document.querySelectorAll('.erp-ledger-untrust'), (x) => x.getAttribute('data-fp')));
      if (listed.length) await page.click('.erp-ledger-untrust'); await sleep(1800); const bVal = await fold();
      await page.reload({ waitUntil: 'load' }); await ready(); await on(); await sleep(1500); const c = await fold(), inf = await page.evaluate(() => window.__crud.ledgerInfo());
      const dfp = fpOf(LS.key().kid);
      judge('P2 Trust shows the door\'s value (' + JSON.stringify(a) + '), Untrust in the panel (' + JSON.stringify(listed) + ') takes it out (' + JSON.stringify(bVal) + '), and a reload keeps it out (' + JSON.stringify(c) + ', unpinned ' + inf.unpinned.length + ')',
        a === 'door-p' && listed.indexOf(dfp) >= 0 && bVal !== 'door-p' && c !== 'door-p' && inf.unpinned.length === 1, LOG.filter((l) => /§LEDGER(UI)? (untrusted|trusted|keys)/.test(l)).slice(-4).join(' | '));
    } catch (e) { judge('P harness', null, e.message.split('\n')[0]); }
    judge('page-errors', errs.length === 0, 'n=' + errs.length + ' ' + errs.slice(0, 2).join(' | '));
    await b.close(); server.close();
  }
  say('§WITNESS_LEDGER_ROSTER pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + ' verdict=' + (fail ? 'FAIL' : inc ? 'INCONCLUSIVE' : 'PASS'));
  process.exit(fail || inc ? 1 : 0);
})().catch((e) => { console.log('§WITNESS_LEDGER_ROSTER CRASH ' + (e && e.stack || e)); process.exit(3); });
