#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DOOR-SIGN (bim-compiler prompts/CLI_ERP_IVR.md §52, the ERP one-ledger step 2). READ THE §-LOG after every run; an exit code is not evidence.
 * ISSUE: the page's ops carry op_uuid, a ms timestamp, prev_hash, op_hash and an ECDSA sig; the door's op-log lines carried none (§48 BLOCKER 2), so a door op could not join the page's chain.
 * Model: the ERP seed through the door (erp.new order + 2 lines, erp.complete) plus one object_cli.persist (the third writer), op-log + journal + key in a temp folder.
 *   G1 every line is a kernel_ops row: uuid, ms timestamp, prev_hash, op_hash, sig, ids 1..N with no gap
 *   G2 the PAGE'S OWN verifier (KernelOps.verifyChain) accepts the whole log with the door's public key
 *   G3 the PAGE'S OWN signer module (erp_signer.makeSigner), given only the door's public key, accepts every sig over the content hash
 *   G4 the fold is unchanged: the door's database after replaying the signed log equals the one from the same ops as bare lines (every column of every created row)
 *   G5 tamper: one value inside line k's parameters -> verify FAILS at k; one hex digit of line j's sig -> FAILS at j as 'signature'
 *   G6 two processes appending 20 ops each at once: 40 rows, chain verifies, no repeated prev_hash (INCONCLUSIVE when the two never overlapped)
 *   G7 a legacy bare log: the verifier says 'unsealed'; the first append seals it once (kept as .pre-seal, byte-equal), the ops read back equal, a boot writes nothing
 *   G8 the key file is 0600 in a 0700 folder and the next process signs as the same key
 * Falsifiers: DOOR_SIGN_BREAK=nosign -> G1, G2, G3 FAIL; DOOR_SIGN_BREAK=nolock -> G6 FAILS (or INCONCLUSIVE), never PASS.
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm'), crypto = require('crypto'), { spawn } = require('child_process');
const { kit, run, DOOR, ROOT } = require('./_kit');
const k = kit('W-DOOR-SIGN');
const BREAK = process.env.DOOR_SIGN_BREAK || '';
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doorsign_')), OPS = path.join(dir, 'ops.jsonl'), J = path.join(dir, 'journal.jsonl'), KF = path.join(dir, 'cfg', 'door_key.json');
  const env = { BIM_OBJECT_OPLOG: OPS, BIM_DOOR_JOURNAL: J, RED1_DOOR_KEY: KF }; if (BREAK) env.DOOR_SIGN_BREAK = BREAK;
  Object.assign(process.env, env);   // the in-process calls below sign with the same key and the same break
  const LS = require('../ledger_sign.js'), OC = require('../object_cli.js'), ERP = require('../erp_cli.js');
  const quiet = async (fn) => { const e = process.stderr.write.bind(process.stderr), l = console.log; process.stderr.write = () => true; console.log = () => {}; try { return await fn(); } finally { process.stderr.write = e; console.log = l; } };
  const loadVm = (file) => { const sb = { window: {}, console: { log() {}, warn() {}, error() {} }, crypto: crypto.webcrypto, TextEncoder, TextDecoder, setTimeout, clearTimeout }; vm.runInNewContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sb, { filename: file }); return sb.window; };
  let seq = 0;
  const door = async (line) => { const r = await run(DOOR, ['--actor', 'human', '--request', 'of-' + (++seq), '--journal', J, line], env); let j = null; try { j = JSON.parse(r.out.trim()); } catch (e) {} return j; };
  const h = await door('erp.new kind=Order issotrx=Y c_doctypetarget_id=132 c_bpartner_id=112 salesrep_id=101'), no = h && h.answer && h.answer.number;
  if (!no) { k.incon('G1-G8', 'the door did not create the order: ' + JSON.stringify(h).slice(0, 200)); return k.end(); }
  await door('erp.new kind=C_OrderLine order=' + no + ' m_product_id=137 qtyentered=2');
  await door('erp.new kind=C_OrderLine order=' + no + ' m_product_id=137 qtyentered=3');
  await door('erp.complete kind=Order number=' + no);
  const SQL = await require(path.join(ROOT, 'common/lib/sql-wasm.js'))({ wasmBinary: fs.readFileSync(path.join(ROOT, 'common/lib/sql-wasm.wasm')) });
  { const P = new SQL.Database(fs.readFileSync(path.join(ROOT, 'erp', 'ad_seed.db'))), rowsOf = (sql, p) => { const st = P.prepare(sql); if (p) st.bind(p); const out = []; while (st.step()) out.push(st.getAsObject()); st.free(); return out; };
    await quiet(() => OC.persist({ db: P, rows: rowsOf, opfile: OPS, ops: [] }, [{ op_type: 'CRUD_CREATE', key: 'ad_attachment', table: 'ad_attachment', verb: 'create', fields: { ad_client_id: 11, ad_org_id: 11, isactive: 'Y', ad_table_id: 259, record_id: 990001, title: 'W-DOOR-SIGN', ad_attachment_uu: 'w-door-sign-1' } }])); }
  const lines = fs.readFileSync(OPS, 'utf8').split('\n').filter(Boolean), rows = lines.map(JSON.parse), N = rows.length;
  k.L('door order=' + no + ' log lines=' + N + ' key=' + KF);
  // G1
  const bad1 = rows.filter((r, i) => !(LS.isRow(r) && r.id === i + 1 && typeof r.op_uuid === 'string' && r.op_uuid.length >= 32 && Number.isInteger(r.timestamp) && r.timestamp > 1e12 && /^[0-9a-f]{64}$/.test(r.prev_hash || '') && /^[0-9a-f]{64}$/.test(r.op_hash || '') && /^[0-9a-f]{128}$/.test(r.sig || '')));
  k.chk('G1 every line is a signed kernel_ops row with ids 1..N (' + N + ' lines; writers: erp_cli group, object_cli persist)', N >= 8 && bad1.length === 0, bad1.length ? 'first bad id=' + (rows.indexOf(bad1[0]) + 1) + ' ' + JSON.stringify(bad1[0]).slice(0, 160) : 'ids 1..' + N);
  // G2
  const v = await quiet(() => LS.verify(OPS));
  k.chk('G2 KernelOps.verifyChain (the page\'s verifier) accepts the door\'s log', v.ok === true && v.len === N, JSON.stringify(v).slice(0, 160));
  // G3: the page's own signer module with only the PUBLIC key
  { const W = loadVm('erp/erp_signer.js'), K = loadVm('erp/kernel_ops.js').KernelOps, jwk = LS.key().pub.export({ format: 'jwk' });
    const pub = await crypto.webcrypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']), S = W.ErpSigner.makeSigner({ publicKey: pub, privateKey: null });
    let okN = 0, first = null; for (const r of rows) { const good = r.sig ? await S.verify(await K._contentHash(r), r.sig) : false; if (good) okN++; else if (!first) first = r.id; }
    k.chk('G3 erp_signer.makeSigner (page code), given only the door\'s public key, accepts every sig', okN === N, okN + '/' + N + (first ? ' first rejected id=' + first : '') + ' kid=' + LS.key().kid.slice(0, 16) + '…'); }
  // G4: the fold is the same signed vs bare
  { const bare = path.join(dir, 'bare.jsonl'); fs.writeFileSync(bare, LS.parseOps(lines.join('\n')).map(o => JSON.stringify(o)).join('\n') + '\n');
    const A = await quiet(() => ERP.boot({ oplog: OPS })), B = await quiet(() => ERP.boot({ oplog: bare }));
    const tabs = [...new Set(LS.parseOps(lines.join('\n')).filter(o => o.op_type === 'CRUD_CREATE' && !o.keyless).map(o => o.table))], diff = []; let cells = 0;
    tabs.forEach(t => { const ic = A.rows('PRAGMA table_info(' + t + ')').map(c => c.name); if (!ic.length) return; const idc = (LS.parseOps(lines.join('\n')).find(o => o.table === t) || {}).idCol || t + '_id', q = 'SELECT * FROM ' + t + (ic.map(String).indexOf(idc) >= 0 ? ' ORDER BY ' + idc : '');
      const ra = A.rows(q), rb = B.rows(q); cells += ra.length * ic.length; if (JSON.stringify(ra) !== JSON.stringify(rb)) diff.push(t); });
    k.chk('G4 the door\'s database after replay is identical from the signed log and from the same ops as bare lines', tabs.length >= 4 && diff.length === 0, tabs.length + ' tables, ' + cells + ' cells' + (diff.length ? ' DIFFER ' + diff.join(',') : '')); }
  // G5
  { const mid = Math.floor(N / 2), T1 = path.join(dir, 't1.jsonl'), T2 = path.join(dir, 't2.jsonl'), a = rows.map(r => Object.assign({}, r)), b = rows.map(r => Object.assign({}, r));
    const p = JSON.parse(a[mid].parameters); p.t = '2000-01-01T00:00:00.000Z'; a[mid].parameters = JSON.stringify(p);
    const j = N - 2; const sg = b[j].sig || '0'.repeat(128); b[j].sig = (sg[0] === 'a' ? 'b' : 'a') + sg.slice(1);
    fs.writeFileSync(T1, a.map(r => JSON.stringify(r)).join('\n') + '\n'); fs.writeFileSync(T2, b.map(r => JSON.stringify(r)).join('\n') + '\n');
    const v1 = await quiet(() => LS.verify(T1)), v2 = await quiet(() => LS.verify(T2));
    k.chk('G5a a value changed inside line ' + a[mid].id + ' -> verify fails at that line', v1.ok === false && v1.brokeAt === a[mid].id, JSON.stringify(v1));
    k.chk('G5b one hex digit of line ' + b[j].id + '\'s sig -> verify fails there as a signature', v2.ok === false && v2.brokeAt === b[j].id && v2.why === 'signature', JSON.stringify(v2)); }
  // G6: two processes at once
  { const L6 = path.join(dir, 'two.jsonl'), GO = path.join(dir, 'go'), child = (tag) => new Promise((res) => { let e = '';
      const p = spawn(process.execPath, ['-e', "const LS=require(" + JSON.stringify(path.join(ROOT, 'common/door/ledger_sign.js')) + ");const fs=require('fs');while(!fs.existsSync(" + JSON.stringify(GO) + "));for(let i=0;i<20;i++)LS.append(" + JSON.stringify(L6) + ",[{op_type:'CRUD_UPDATE',table:'t',id:i,changes:{a:{new:'" + tag + "'+i}},t:new Date().toISOString()}]);"], { env: Object.assign({}, process.env) });
      p.stderr.on('data', d => { e += d; }); p.on('close', () => res(e)); });
    const pa = child('A'), pb = child('B'); await new Promise(r => setTimeout(r, 600)); fs.writeFileSync(GO, '1'); const errs = await Promise.all([pa, pb]);
    const waited = errs.join('').split('\n').filter(l => /lock waited=/.test(l)).length, r6 = fs.readFileSync(L6, 'utf8').split('\n').filter(Boolean).map(JSON.parse), prevs = new Set(r6.map(r => r.prev_hash)), v6 = await quiet(() => LS.verify(L6)).catch(e => ({ ok: false, why: 'verify threw: ' + e.message }));   // a forked chain (nolock) can repeat an id
    if (!waited && BREAK !== 'nolock') k.incon('G6', 'the two processes never waited on the lock (no overlap): the race was not exercised');
    else k.chk('G6 two processes x 20 appends: 40 rows, one chain, no repeated prev_hash (lock waits seen: ' + waited + ')', r6.length === 40 && prevs.size === 40 && v6.ok === true, 'rows=' + r6.length + ' distinct prev=' + prevs.size + ' ' + JSON.stringify(v6)); }
  // G7: a legacy bare log
  { const L7 = path.join(dir, 'legacy.jsonl'), ops = LS.parseOps(lines.join('\n')).slice(0, 21); fs.writeFileSync(L7, ops.map(o => JSON.stringify(o)).join('\n') + '\n'); const before = fs.readFileSync(L7);
    const v0 = await quiet(() => LS.verify(L7)); LS.append(L7, [{ op_type: 'CRUD_UPDATE', table: 'c_order', id: 1, changes: { description: { new: 'x' } }, t: new Date().toISOString() }]);
    const after = fs.readFileSync(L7, 'utf8').split('\n').filter(Boolean), back = LS.parseOps(after.join('\n')), v1 = await quiet(() => LS.verify(L7)), sz = fs.statSync(L7).size;
    await quiet(() => ERP.boot({ oplog: L7 }));
    k.chk('G7a an unsealed log is reported, not passed (verify: unsealed)', v0.ok === false && v0.why === 'unsealed' && v0.brokeAt === 1, JSON.stringify(v0));
    k.chk('G7b the first append seals the 21 bare lines once: ' + after.length + ' rows, .pre-seal byte-equal, ops read back equal, chain verifies', after.length === 22 && fs.existsSync(L7 + '.pre-seal') && Buffer.compare(fs.readFileSync(L7 + '.pre-seal'), before) === 0 && JSON.stringify(back.slice(0, 21)) === JSON.stringify(ops) && v1.ok === true, JSON.stringify(v1));
    k.chk('G7c a boot over the sealed log writes nothing', fs.statSync(L7).size === sz && fs.readFileSync(L7, 'utf8').split('\n').filter(Boolean).length === 22, 'size ' + sz); }
  // G8
  { const m = (f) => (fs.statSync(f).mode & 0o777).toString(8), kid = await new Promise((res) => { let o = ''; const p = spawn(process.execPath, ['-e', "process.stdout.write(require(" + JSON.stringify(path.join(ROOT, 'common/door/ledger_sign.js')) + ").key().kid)"], { env: Object.assign({}, process.env) }); p.stdout.on('data', d => { o += d; }); p.on('close', () => res(o)); });
    k.chk('G8 key file 0600 in a 0700 folder; the next process signs as the same key', m(KF) === '600' && m(path.dirname(KF)) === '700' && kid === LS.key().kid && rows.every(r => JSON.parse(r.parameters).signed_by === kid), 'file ' + m(KF) + ' dir ' + m(path.dirname(KF)) + ' same kid=' + (kid === LS.key().kid)); }
  k.end();
})().catch((e) => { console.log('§W-DOOR-SIGN error ' + (e && e.stack || e)); process.exit(1); });
