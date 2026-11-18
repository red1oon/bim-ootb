#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-LEDGER-FILE (bim-compiler prompts/CLI_ERP_IVR.md §54, ledger step 3 option A). READ THE §-LOG after every run; an exit code is not evidence.
 * ISSUE: the page and the door keep two ledgers (§48). Option A: one JSONL of kernel_ops rows both write. The browser can only REPLACE a file (createWritable swaps the whole file on close),
 *   so a door line appended while the page's writable is open is lost unless the page takes the door's lock. erp/ledger_file.js is the page's reader/appender; here it runs in Node against a
 *   fake directory handle with the SAME swap-on-close behaviour, backed by a real folder, so the REAL door process races it.
 *   F1 the page module reads a door-written log: the same rows, the page's own verifyChain ok
 *   F2 the page appends rows made the page's way (KernelOps commit + seal, content signing, erp_signer.makeSigner with its OWN key): MIXED chain verifies (door key + page key)
 *   F3 the door appends after the page: the chain continues, mixed verify ok, both keys present in signed_by
 *   F4 compare: the door appends after the page read the tip -> the page's append is REFUSED ('tip moved'), the file byte-equal to before
 *   F5a the fake is faithful: WITHOUT any lock, a door line appended inside an open writable is LOST at close (the hazard exists)
 *   F5b WITH the lock: a door started while the page holds it WAITS, then both lines are in the file
 *   F6 the race: the real door appends 20 ops while the page code appends 20 rows (retry on 'tip moved'): 40 rows past the base, every op_uuid present, one chain
 * Falsifiers: LEDGER_FILE_BREAK=nolock -> F5b / F6 FAIL (lost rows, or a forked chain) or INCONCLUSIVE; LEDGER_FILE_BREAK=nocompare -> F4 FAIL.
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm'), crypto = require('crypto'), { spawn } = require('child_process');
const { kit, run, DOOR, ROOT } = require('./_kit');
const k = kit('W-LEDGER-FILE');
const BREAK = process.env.LEDGER_FILE_BREAK || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// ── a directory handle with the browser's File System Access semantics, over a real folder ──
function fakeDir(folder) {
  const nf = (n) => { const e = new Error('A requested file or directory could not be found: ' + n); e.name = 'NotFoundError'; return e; };
  const fh = (n) => ({
    getFile: async () => { const p = path.join(folder, n), st = fs.statSync(p), txt = fs.readFileSync(p, 'utf8'); return { size: st.size, lastModified: st.mtimeMs, text: async () => txt }; },
    createWritable: async (o) => { const p = path.join(folder, n); let buf = (o && o.keepExistingData && fs.existsSync(p)) ? fs.readFileSync(p) : Buffer.alloc(0), at = buf.length;   // a SWAP COPY taken now ...
      return { seek: async (x) => { at = x; }, write: async (d) => { const b = Buffer.from(String(d)); buf = Buffer.concat([buf.subarray(0, at), b, buf.subarray(at + b.length)]); at += b.length; }, close: async () => { fs.writeFileSync(p, buf); } }; } });   // ... that REPLACES the file at close
  return { getFileHandle: async (n, o) => { const p = path.join(folder, n); if (!fs.existsSync(p)) { if (o && o.create) fs.writeFileSync(p, ''); else throw nf(n); } return fh(n); },
           removeEntry: async (n) => { const p = path.join(folder, n); if (!fs.existsSync(p)) throw nf(n); fs.unlinkSync(p); } };
}
const loadVm = (file) => { const sb = { window: {}, console: { log() {}, warn() {}, error() {} }, crypto: crypto.webcrypto, TextEncoder, TextDecoder, setTimeout, clearTimeout }; vm.runInNewContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sb, { filename: file }); return sb.window; };
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledgerfile_')), NAME = 'ops.jsonl', OPS = path.join(dir, NAME), J = path.join(dir, 'journal.jsonl'), KF = path.join(dir, 'door_key.json');
  const env = { BIM_OBJECT_OPLOG: OPS, BIM_DOOR_JOURNAL: J, RED1_DOOR_KEY: KF }; Object.assign(process.env, env);
  if (BREAK) process.env.LEDGER_FILE_BREAK = BREAK;
  const LS = require('../ledger_sign.js'), LF = require('../../../erp/ledger_file.js'), FD = fakeDir(dir), K = loadVm('erp/kernel_ops.js').KernelOps, SG = loadVm('erp/erp_signer.js').ErpSigner;
  const quiet = async (fn) => { const e = process.stderr.write.bind(process.stderr); process.stderr.write = () => true; try { return await fn(); } finally { process.stderr.write = e; } };
  const SQL = await require(path.join(ROOT, 'common/lib/sql-wasm.js'))({ wasmBinary: fs.readFileSync(path.join(ROOT, 'common/lib/sql-wasm.wasm')) });
  // the door makes the base log
  let seq = 0; const door = async (line) => { const r = await run(DOOR, ['--actor', 'human', '--request', 'of-' + (++seq), '--journal', J, line], env); let j = null; try { j = JSON.parse(r.out.trim()); } catch (e) {} return j; };
  const h = await door('erp.new kind=Order issotrx=Y c_doctypetarget_id=132 c_bpartner_id=112 salesrep_id=101'), no = h && h.answer && h.answer.number;
  if (!no) { k.incon('F1-F6', 'the door did not create the order: ' + JSON.stringify(h).slice(0, 200)); return k.end(); }
  await door('erp.new kind=C_OrderLine order=' + no + ' m_product_id=137 qtyentered=2'); await door('erp.complete kind=Order number=' + no);
  // the page's key + verifier (mixed: either key)
  const kp = await crypto.webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']), pageSigner = SG.makeSigner(kp), pageKid = Buffer.from(await crypto.webcrypto.subtle.exportKey('spki', kp.publicKey)).toString('hex');
  const doorKid = LS.key().kid, doorPub = LS.key().pub;
  const mixedVerify = { sign: async () => null, verify: async (hex, sig) => { if (!sig) return false; try { if (crypto.verify('sha256', Buffer.from(hex, 'utf8'), { key: doorPub, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'hex'))) return true; } catch (e) {} return pageSigner.verify(hex, sig); } };
  const COLS = ['id', 'op_uuid', 'timestamp', 'op_type', 'parameters', 'input_guids', 'output_guid', 'undone', 'prev_hash', 'op_hash', 'sig', 'gid', 'branch_id', 'user_tag'];
  const verifyRows = async (rows) => { try { return await verifyRows0(rows); } catch (e) { return { ok: false, why: 'chain not loadable: ' + e.message }; } };   // a forked chain (nolock / nocompare) repeats an id
  const verifyRows0 = async (rows) => { const db = new SQL.Database(); K.ensureTable(db); rows.forEach((r) => db.run('INSERT INTO kernel_ops (' + COLS.join(',') + ') VALUES (' + COLS.map(() => '?').join(',') + ')', COLS.map((c) => r[c] !== undefined ? r[c] : null))); K.setSigner(mixedVerify); return K.verifyChain(db); };
  // the page's way of making rows: kernel_ops table holding the file's rows, commitOp + sealFrom with the page's signer and content signing on
  const pageRows = async (have, n, tag) => { const db = new SQL.Database(); K.ensureTable(db); K.replayRowsInto(db, have); K.setSigner(pageSigner, pageKid); K.setContentSigning(true);
    const before = have.length ? have[have.length - 1].id : 0, ids = []; for (let i = 0; i < n; i++) ids.push(K.commitOp(db, 'CRUD_UPDATE', { op_type: 'CRUD_UPDATE', table: 'c_order', id: 50000, changes: { description: { new: tag + i } }, t: new Date().toISOString() }, null, null, null, Date.now() + i));
    await K.sealFrom(db); return K.rowsByIds(db, ids.filter((x) => x > before)); };
  // F1
  const base = await LF.readRows(FD, NAME), vb = await verifyRows(base);
  k.chk('F1 the page module reads the door-written log: ' + base.length + ' rows, the page\'s verifyChain ok', base.length >= 5 && JSON.stringify(base) === JSON.stringify(fs.readFileSync(OPS, 'utf8').split('\n').filter(Boolean).map(JSON.parse)) && vb.ok === true, JSON.stringify(vb));
  // F2
  let tip = base[base.length - 1].op_hash; const p1 = await pageRows(base, 3, 'F2-'), r2 = await LF.appendRows(FD, NAME, p1, { tip }); tip = r2.tip;
  const v2 = await verifyRows(await LF.readRows(FD, NAME));
  k.chk('F2 the page appends 3 rows made its own way: a MIXED chain (door key + page key) verifies', r2.ok === true && v2.ok === true && v2.len === base.length + 3 && p1.every((r) => JSON.parse(r.parameters).signed_by === pageKid), JSON.stringify(r2).slice(0, 80) + ' ' + JSON.stringify(v2));
  // F3
  LS.append(OPS, [{ op_type: 'CRUD_UPDATE', table: 'c_order', id: 50000, changes: { description: { new: 'F3-door' } }, t: new Date().toISOString() }]);
  const rows3 = await LF.readRows(FD, NAME), v3 = await verifyRows(rows3), kids = new Set(rows3.map((r) => JSON.parse(r.parameters).signed_by));
  k.chk('F3 the door appends after the page: the chain continues (mixed verify ok), both keys present', v3.ok === true && v3.len === base.length + 4 && kids.has(doorKid) && kids.has(pageKid), JSON.stringify(v3) + ' keys=' + kids.size);
  tip = rows3[rows3.length - 1].op_hash;
  // F4: the door moves the tip after the page read it
  { const stale = tip, pend = await pageRows(rows3, 1, 'F4-'); LS.append(OPS, [{ op_type: 'CRUD_UPDATE', table: 'c_order', id: 50000, changes: { description: { new: 'F4-door' } }, t: new Date().toISOString() }]);
    const before = fs.readFileSync(OPS), r4 = await LF.appendRows(FD, NAME, pend, { tip: stale });
    k.chk('F4 the page appends on a tip the door has moved: REFUSED, the file byte-equal to before', r4.ok === false && r4.why === 'tip moved' && Buffer.compare(fs.readFileSync(OPS), before) === 0, JSON.stringify(r4)); }
  // F5a: the swap hazard, with no lock at all (the fake, driven by hand)
  { const cur = await LF.readRows(FD, NAME), fh = await FD.getFileHandle(NAME), text = fs.readFileSync(OPS, 'utf8'), w = await fh.createWritable({ keepExistingData: true });
    LS.append(OPS, [{ op_type: 'CRUD_UPDATE', table: 'c_order', id: 50000, changes: { description: { new: 'F5a-door' } }, t: new Date().toISOString() }]);   // the door writes while the page's writable is open
    const mid = (await LF.readRows(FD, NAME)).length; await w.seek(text.length); await w.write(''); await w.close();
    const end = (await LF.readRows(FD, NAME)).length;
    k.chk('F5a the fake is faithful: a door line appended inside an open writable is LOST at close (rows ' + cur.length + ' -> ' + mid + ' with the door -> ' + end + ' after the page closes)', mid === cur.length + 1 && end === cur.length, 'the hazard the lock exists for'); }
  // F5b: with the lock, a door started while the page holds it waits
  { const have = await LF.readRows(FD, NAME), n0 = have.length, lk = await LF.lockAcquire(FD, NAME);
    const child = new Promise((res) => { let e = ''; const p = spawn(process.execPath, ['-e', "require(" + JSON.stringify(path.join(ROOT, 'common/door/ledger_sign.js')) + ").append(" + JSON.stringify(OPS) + ",[{op_type:'CRUD_UPDATE',table:'c_order',id:50000,changes:{description:{new:'F5b-door'}},t:new Date().toISOString()}])"], { env: Object.assign({}, process.env) }); p.stderr.on('data', (d) => { e += d; }); p.on('close', () => res(e)); });
    await sleep(400); const during = (await LF.readRows(FD, NAME)).length;   // the door is waiting: nothing added yet
    const fh = await FD.getFileHandle(NAME), text = fs.readFileSync(OPS, 'utf8'), pend = await pageRows(have, 1, 'F5b-'), w = await fh.createWritable({ keepExistingData: true }); await w.seek(text.length); await w.write(pend.map((r) => JSON.stringify(r) + '\n').join('')); await w.close(); await lk.release();
    const err = await child, after = await LF.readRows(FD, NAME), va = await verifyRows(after), waited = /lock waited=/.test(err);
    if (!waited && BREAK !== 'nolock') k.incon('F5b', 'the door did not wait on the page\'s lock (no overlap): ' + err.slice(0, 120));
    else k.chk('F5b with the lock held the door WAITS (file stays at ' + n0 + ' rows while held), then both lines are in: ' + after.length + ' rows, one chain', during === n0 && after.length === n0 + 2 && va.ok === true, 'during=' + during + ' after=' + after.length + ' waited=' + waited + ' ' + JSON.stringify(va)); }
  // F6: the race
  { const have = await LF.readRows(FD, NAME), n0 = have.length, DOORN = 20, PAGEN = 20;
    const child = new Promise((res) => { let e = ''; const p = spawn(process.execPath, ['-e', "const LS=require(" + JSON.stringify(path.join(ROOT, 'common/door/ledger_sign.js')) + ");for(let i=0;i<" + DOORN + ";i++)LS.append(" + JSON.stringify(OPS) + ",[{op_type:'CRUD_UPDATE',table:'c_order',id:50000,changes:{description:{new:'F6-door'+i}},t:new Date().toISOString()}]),Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,25)"], { env: Object.assign({}, process.env) }); p.stderr.on('data', (d) => { e += d; }); p.on('close', () => res(e)); });
    let retries = 0, lost = 0; for (let i = 0; i < PAGEN; i++) { for (let tries = 0; tries < 50; tries++) { const cur = await LF.readRows(FD, NAME), rows = await pageRows(cur, 1, 'F6-' + i + '-'), r = await LF.appendRows(FD, NAME, rows, { tip: cur.length ? cur[cur.length - 1].op_hash : LF.GENESIS }); if (r.ok) break; if (r.why === 'tip moved') retries++; else lost++; } }
    const err = await child, after = await LF.readRows(FD, NAME), ids = new Set(after.map((r) => r.op_uuid)), dw = (err.match(/lock waited=/g) || []).length, va = await verifyRows(after).catch((e) => ({ ok: false, why: 'verify threw: ' + e.message }));
    const drow = after.filter((r) => /F6-door/.test(r.parameters)).length, prow = after.filter((r) => /"F6-\d+-/.test(r.parameters) || /F6-\d+-0/.test(r.parameters)).length;
    if (!dw && !retries && BREAK !== 'nolock') k.incon('F6', 'the door never waited on the page and the page never retried: no overlap');
    else k.chk('F6 the real door (20 ops) races the page code (20 rows): ' + (after.length - n0) + ' rows past the base, door rows ' + drow + '/' + DOORN + ', page rows ' + prow + '/' + PAGEN + ', no op_uuid twice, one chain (door waits ' + dw + ', page retries ' + retries + ')', after.length === n0 + DOORN + PAGEN && drow === DOORN && prow === PAGEN && ids.size === after.length && va.ok === true, 'rows ' + after.length + ' lost=' + lost + ' ' + JSON.stringify(va)); }
  k.end();
})().catch((e) => { console.log('§W-LEDGER-FILE error ' + (e && e.stack || e)); process.exit(1); });
