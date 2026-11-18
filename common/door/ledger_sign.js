#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — the DOOR SIGNS ITS OPS (bim-compiler prompts/CLI_ERP_IVR.md §52, the §48 one-ledger step 2; witness W-DOOR-SIGN). Read the §LEDGER lines after every run; an exit code is not evidence.
// WHAT IT IS: every op the door appends to its op-log is written as ONE erp/kernel_ops.js row (id, op_uuid, timestamp ms, op_type, parameters, prev_hash, op_hash, sig, user_tag), chained to
//   the line before it and signed by the door's own ECDSA P-256 key, so a door op can sit in the same chain as a page op (§48 BLOCKER 2). The page's verifier (KernelOps.verifyChain +
//   erp_signer.makeSigner) accepts it unchanged: this file takes the FORMULAS from kernel_ops.js (loaded in an isolated vm: no `window` leaks into the door) and only the two PRIMITIVES
//   (sha256, ECDSA) from Node's SYNC crypto, because the door's writers are synchronous. It writes no canonical form of its own.
//   parseOps(text)        the ops of a log: a bare legacy line, or a signed row (its op = JSON.parse(parameters) minus the _sigv / signed_by stamps)
//   append(opfile, ops)   take <opfile>.lock, seal any bare line once (copy kept as <opfile>.pre-seal), chain + sign + append the ops, release. The ONLY writer of a door op-log.
//   verify(opfile, key?)  the page's own KernelOps.verifyChain over the log
//   Key: ~/.config/red1/door_key.json (JWK, dir 0700, file 0600; $RED1_DOOR_KEY names another). A file on disk is not a non-extractable key; that is the cost of a CLI.
// Run: node common/door/ledger_sign.js verify <opfile> [keyfile]   |   node common/door/ledger_sign.js key   (the door key's fingerprint, to pin it in the page: §58)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..');
const GENESIS = '0'.repeat(64), USER = 'door';
const BREAK = () => process.env.DOOR_SIGN_BREAK || '';   // nosign | nolock (W-DOOR-SIGN falsifiers)
const say = (s) => process.stderr.write('§LEDGER ' + s + '\n');

let KO = null;   // the page's kernel_ops.js, in its own context (it expects a `window`)
function kernel() {
  if (KO) return KO;
  const sb = { window: {}, console: { log() {}, warn() {}, error() {} }, crypto: crypto.webcrypto, TextEncoder, TextDecoder, setTimeout, clearTimeout };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'erp', 'kernel_ops.js'), 'utf8'), sb, { filename: 'erp/kernel_ops.js' });
  KO = sb.window.KernelOps; return KO;
}
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

// ── the door's key ──
function keyFile() { return process.env.RED1_DOOR_KEY || path.join(os.homedir(), '.config', 'red1', 'door_key.json'); }
let KEY = null;
function key() {
  if (KEY) return KEY;
  const f = keyFile();
  let jwk = null; try { jwk = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { /* mint below */ }
  if (!jwk) {
    const kp = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    jwk = kp.privateKey.export({ format: 'jwk' });
    fs.mkdirSync(path.dirname(f), { recursive: true, mode: 0o700 });
    const tmp = f + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(jwk), { mode: 0o600 }); fs.renameSync(tmp, f);   // rename: two first-time doors never leave a half-written key
    jwk = JSON.parse(fs.readFileSync(f, 'utf8'));
    say('key minted ' + f + ' alg=ECDSA-P256');
  }
  const priv = crypto.createPrivateKey({ key: jwk, format: 'jwk' }), pub = crypto.createPublicKey(priv);
  KEY = { priv, pub, kid: pub.export({ type: 'spki', format: 'der' }).toString('hex') };   // kid = the SPKI hex: the identity string erp_signer.js stamps as signed_by
  return KEY;
}
const sign = (hex) => crypto.sign('sha256', Buffer.from(hex, 'utf8'), { key: key().priv, dsaEncoding: 'ieee-p1363' }).toString('hex');   // = WebCrypto ECDSA over the hex string's bytes

// ── one row ──
function seal(prev, id, op, opts) {   // op: the door's op object -> a kernel_ops row chained to `prev`
  const K = kernel(), o = Object.assign({}, op);
  const ms = Date.parse(o.t); const ts = Number.isFinite(ms) ? ms : Date.now();
  const params = JSON.stringify(Object.assign({}, JSON.parse(JSON.stringify(o, opts && opts.replacer)), { _sigv: 2, signed_by: key().kid }));   // _sigv:2 + signed_by: the page's content-signing stamps (kernel_ops.js _stampSigv)
  const row = { id, op_uuid: crypto.randomUUID(), timestamp: ts, op_type: o.op_type, parameters: params, input_guids: null, output_guid: null, undone: 0, prev_hash: prev, op_hash: null, sig: null, gid: null, branch_id: null, user_tag: USER };
  row.op_hash = sha(prev + '|' + K._canonical(row));
  row.sig = BREAK() === 'nosign' ? null : sign(sha('cs2|' + K._canonicalV2(row)));   // v2: the sig attests the content hash (no id, no prev_hash), as the page's does
  return row;
}
const isRow = (j) => j && j.parameters !== undefined && j.op_hash !== undefined;
function opOf(j) { if (!isRow(j)) return j; const p = JSON.parse(j.parameters); delete p._sigv; delete p.signed_by; if (p.op_type == null) p.op_type = j.op_type; return p; }   // a PAGE row keeps its op_type on the row, not in parameters (§61 U5: without this the door skipped every page edit)
// the door's replay of the file. §61 (bim-compiler prompts/CLI_ERP_IVR.md): an UNDO/REDO row is read by the page's own rule (KernelOps.foldMarkers), so a row the page undid is
//   not replayed here either; the marker rows themselves are not ops. Stated limit: the door does not judge signatures yet, so it applies every marker in the file.
//   LEDGER_UNDO_BREAK=doornomarker skips it (witness falsifier).
function parseOps(text) {
  const js = String(text).split('\n').filter(Boolean).map((l) => JSON.parse(l));
  if (!js.some((j) => isRow(j) && (j.op_type === 'UNDO' || j.op_type === 'REDO')) || process.env.LEDGER_UNDO_BREAK === 'doornomarker') return js.filter((j) => !(isRow(j) && (j.op_type === 'UNDO' || j.op_type === 'REDO'))).map(opOf);
  const m = kernel().foldMarkers(js.filter(isRow)), out = new Set(m.undone);
  say('markers=' + m.markers + ' undone=' + m.undone.length);
  return js.filter((j) => !(isRow(j) && (j.op_type === 'UNDO' || j.op_type === 'REDO' || out.has(j.op_uuid)))).map(opOf);
}

// ── the lock ──
const nap = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function lock(f) {
  if (BREAK() === 'nolock') return () => {};
  const lf = f + '.lock'; let waited = 0; const t0 = Date.now();
  for (;;) {
    try { const fd = fs.openSync(lf, 'wx'); fs.writeSync(fd, 'pid:' + process.pid); fs.closeSync(fd); break; }   // the token: the page's lock (erp/ledger_file.js) reads it to tell a door's lock from its own
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try { if (Date.now() - fs.statSync(lf).mtimeMs > 10000) { fs.unlinkSync(lf); continue; } } catch (x) { /* gone */ }
      if (Date.now() - t0 > 15000) throw new Error('ledger lock held for 15 s: ' + lf);
      waited++; nap(15);
    }
  }
  if (waited) say('lock waited=' + waited + ' ms=' + (Date.now() - t0));
  return () => { try { fs.unlinkSync(lf); } catch (e) { /* gone */ } };
}

// ── append ──
function append(opfile, ops, opts) {
  if (!ops.length) return;
  fs.mkdirSync(path.dirname(opfile), { recursive: true });
  const unlock = lock(opfile);
  try {
    let lines = []; try { lines = fs.readFileSync(opfile, 'utf8').split('\n').filter(Boolean); } catch (e) { /* new log */ }
    if (lines.some((l) => !isRow(JSON.parse(l)))) {   // a log from before the door signed: seal it once, in place; the old file is kept
      fs.copyFileSync(opfile, opfile + '.pre-seal');
      let prev = GENESIS, n = 0, sealed = 0;
      const out = lines.map((l) => { const j = JSON.parse(l); n++; if (isRow(j)) { prev = j.op_hash; return l; } const r = seal(prev, n, j); prev = r.op_hash; sealed++; return JSON.stringify(r); });
      const tmp = opfile + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, out.join('\n') + '\n'); fs.renameSync(tmp, opfile);
      lines = out; say('sealed legacy log ' + path.basename(opfile) + ' lines=' + sealed + ' kept=' + opfile + '.pre-seal');
    }
    let prev = GENESIS, id = lines.length;
    if (lines.length) { const last = JSON.parse(lines[lines.length - 1]); prev = last.op_hash; id = last.id; }
    const rows = ops.map((o) => { const r = seal(prev, ++id, o, opts); prev = r.op_hash; return r; });
    fs.appendFileSync(opfile, rows.map((r) => JSON.stringify(r) + '\n').join(''));
    say('append ops=' + rows.length + ' id=' + rows[0].id + '..' + rows[rows.length - 1].id + ' tip=' + prev.slice(0, 12));
  } finally { unlock(); }
}

// ── verify: the page's own verifier over the log ──
async function verify(opfile, keyfile) {
  const K = kernel(), SQL = await require(path.join(ROOT, 'common', 'lib', 'sql-wasm.js'))({ wasmBinary: fs.readFileSync(path.join(ROOT, 'common', 'lib', 'sql-wasm.wasm')) });
  const rows = fs.readFileSync(opfile, 'utf8').split('\n').filter(Boolean).map(JSON.parse).map((j, i) => isRow(j) ? j : { id: i + 1, timestamp: Date.parse(j.t) || 0, op_type: j.op_type, parameters: JSON.stringify(j), op_hash: null });   // a bare legacy line has no chain: the verifier reports it 'unsealed'
  const db = new SQL.Database(); K.ensureTable(db);
  const cols = ['id', 'op_uuid', 'timestamp', 'op_type', 'parameters', 'input_guids', 'output_guid', 'undone', 'prev_hash', 'op_hash', 'sig', 'gid', 'branch_id', 'user_tag'];
  rows.forEach((r) => db.run('INSERT INTO kernel_ops (' + cols.join(',') + ') VALUES (' + cols.map(() => '?').join(',') + ')', cols.map((c) => r[c] !== undefined ? r[c] : null)));
  let pub = key().pub; if (keyfile) { const j = JSON.parse(fs.readFileSync(keyfile, 'utf8')); pub = j.d ? crypto.createPublicKey(crypto.createPrivateKey({ key: j, format: 'jwk' })) : crypto.createPublicKey({ key: j, format: 'jwk' }); }   // a private JWK (the door's own) or a public one (the page's: ErpSigner.pubKeyJwk)
  K.setSigner({ sign: async () => null, verify: async (hex, sig) => { try { return sig ? crypto.verify('sha256', Buffer.from(hex, 'utf8'), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'hex')) : false; } catch (e) { return false; } } });
  const v = await K.verifyChain(db);
  say(v.ok ? 'verify OK len=' + v.len + ' tip=' + v.tip.slice(0, 12) : 'verify FAIL brokeAt=' + v.brokeAt + ' why=' + v.why);
  return v;
}

module.exports = { parseOps, append, verify, key, keyFile, seal, isRow, GENESIS };
if (require.main === module) {
  const [cmd, f, kf] = process.argv.slice(2);
  if (cmd === 'key') { const k = key(), fp = crypto.createHash('sha256').update(k.pub.export({ type: 'spki', format: 'der' })).digest('hex').slice(0, 16).replace(/(.{4})(?=.)/g, '$1-'); console.log('door key fingerprint ' + fp + '  file ' + keyFile()); process.exit(0); }   // the owner compares this with the fingerprint the page shows before pinning (bim-compiler prompts/CLI_ERP_IVR.md §58)
  if (cmd !== 'verify' || !f) { console.error('usage: node common/door/ledger_sign.js verify <opfile> [keyfile] | key'); process.exit(2); }
  verify(f, kf).then((v) => process.exit(v.ok ? 0 : 3), (e) => { console.error('§LEDGER error ' + e.message); process.exit(1); });
}
