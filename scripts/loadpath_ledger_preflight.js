#!/usr/bin/env node
// ⚠ DO NOT REMOVE — scripts/loadpath_ledger_preflight.js — §129.2 LEDGER TICKER preflight
// (bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §129.2, implementation notes §129.4 v8).
// SCOPE: seal + verify a DB COPY under node, so a bake never opens a DB whose kernel_ops chain is
// unsealed, or was sealed BEFORE the schedule capture rewrote every ELEMENT_PLACE op's timestamp/
// parameters (which silently voids every hash from that point on — timestamp IS part of _canonical,
// erp/kernel_ops.js:79). NEVER writes the source DB in place — always a NEW "<name>_sealed_silent.db"
// alongside it. Read the log after every run — exit code alone is not evidence.
//
// CONTRACT (a workflow fact this script cannot re-derive from data alone, disclosed not invented):
// run this AFTER the schedule has been captured/injected (injectGantt has already rewritten the
// ELEMENT_PLACE ops' timestamp+parameters) and BEFORE any bake opens the DB — never before capture,
// never after a bake has already read an unsealed copy.
//
// Usage:
//   node scripts/loadpath_ledger_preflight.js --db /path/to/Name_silent.db [--out /path/to/Name_sealed_silent.db]
//
// Node-only path per CLAUDE.md "check module deps before browser-only claims": erp/kernel_ops.js's
// sealFrom/verifyChain already run under plain node + sql.js with no vm sandbox and no DOM — the
// exact same pattern erp/tests/witness_content_sign.js already proves (global.window=global,
// global.crypto=require('crypto').webcrypto, require('erp/kernel_ops.js')).
'use strict';
var fs = require('fs');
var path = require('path');

if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
require(path.join(__dirname, '..', 'erp', 'kernel_ops.js'));
var K = global.window.KernelOps;

function arg(name, def) {
  var i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : def;
}
var SRC = arg('db', null);
if (!SRC) {
  console.error('usage: node loadpath_ledger_preflight.js --db /path/to/Name_silent.db [--out FILE]');
  process.exit(1);
}
SRC = path.resolve(SRC);
var OUT = path.resolve(arg('out', SRC.replace(/(_silent)?\.db$/, '') + '_sealed_silent.db'));
if (OUT === SRC) {
  console.error('§KRN_SEAL_FROM refuse: --out would overwrite the source DB (' + SRC + ') — a sealed copy ' +
    'is always a NEW file, per §129.2\'s own "never seal the ~/Downloads DBs in place" rule.');
  process.exit(1);
}
if (!fs.existsSync(SRC)) { console.error('§KRN_SEAL_FROM_ERR source not found: ' + SRC); process.exit(1); }

function reqSql() {
  var tries = [path.join(__dirname, '..', 'modeller', 'lib', 'sql-wasm.js'), 'sql.js'];
  for (var i = 0; i < tries.length; i++) { try { return require(tries[i]); } catch (e) {} }
  throw new Error('sql.js / modeller/lib/sql-wasm.js not resolvable');
}

(async function main() {
  var initSqlJs = reqSql();
  var wasmPath = path.join(__dirname, '..', 'modeller', 'lib', 'sql-wasm.wasm');
  var SQL = fs.existsSync(wasmPath)
    ? await initSqlJs({ wasmBinary: fs.readFileSync(wasmPath) })
    : await initSqlJs();

  var db = new SQL.Database(new Uint8Array(fs.readFileSync(SRC)));

  var tableR = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='kernel_ops'");
  if (!tableR.length || !tableR[0].values.length) {
    console.log('§KRN_SEAL_FROM_PRE db=' + path.basename(SRC) + ' reason=no-kernel-ops-table');
    console.log('§LEDGER_TICKER INCONCLUSIVE reason=no-kernel-ops-table');
    process.exit(0);
  }
  var totalR = db.exec('SELECT COUNT(*) FROM kernel_ops');
  var total = (totalR.length && totalR[0].values.length) ? totalR[0].values[0][0] : 0;
  var sealedBeforeR = db.exec('SELECT COUNT(*) FROM kernel_ops WHERE op_hash IS NOT NULL');
  var sealedBefore = (sealedBeforeR.length && sealedBeforeR[0].values.length) ? sealedBeforeR[0].values[0][0] : 0;
  console.log('§KRN_SEAL_FROM_PRE db=' + path.basename(SRC) + ' total=' + total + ' sealedBefore=' + sealedBefore);

  if (!total) {
    console.log('§LEDGER_TICKER INCONCLUSIVE reason=no-kernel-ops (table empty)');
    process.exit(0);
  }

  // §KERNEL_OPS_SCHED_VERSION cross-check (2026-09-15, added after a real HHS bake proved an
  // out-of-band seal from THIS script is VOID the moment a later bake's own Time Machine activation
  // finds the persisted schedule's _genVersion stale against the CURRENT generator
  // (time_machine.js's own _GANTT_CACHE_VERSION) — it DELETEs and re-INSERTs every ELEMENT_PLACE op
  // fresh, unsealed, with no seal step of its own (see viewer/cpe_ledger_ticker.js's own v3 note,
  // which is the actual FIX: sealing in-page, in bake-owned mode, after that re-injection). This
  // script cannot fix that — it can only WARN. Reads time_machine.js's own constant as TEXT (regex,
  // never require() — that file is browser-only: canvas/DOM/THREE.js throughout, exactly the "check
  // module deps before assuming a browser is needed" case) and compares it against one real
  // ELEMENT_PLACE op's own stamped `_genVersion` — a real, disclosed comparison, never a guess.
  function currentGenVersion() {
    try {
      var src = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'time_machine.js'), 'utf8');
      var m = src.match(/_GANTT_CACHE_VERSION\s*=\s*(\d+)/);
      return m ? Number(m[1]) : null;
    } catch (e) { return null; }
  }
  var genR = db.exec("SELECT parameters FROM kernel_ops WHERE op_type='ELEMENT_PLACE' ORDER BY id LIMIT 1");
  var dbGenVersion = null;
  if (genR.length && genR[0].values.length) {
    try { dbGenVersion = JSON.parse(genR[0].values[0][0])._genVersion; } catch (eParse) {}
  }
  var genNow = currentGenVersion();
  if (dbGenVersion != null && genNow != null) {
    var stale = dbGenVersion !== genNow;
    console.log('§KRN_SEAL_FROM_GENVERSION dbGenVersion=' + dbGenVersion + ' currentGenVersion=' + genNow +
      (stale
        ? ' => STALE — a bake opening this DB will DELETE and re-inject every ELEMENT_PLACE op fresh, ' +
          'UNSEALED, voiding the seal this script is about to write; that bake must seal the LIVE db ' +
          'itself in-page (viewer/cpe_ledger_ticker.js, bake-owned mode) — re-running this script ' +
          'afterward, on ITS OWN db copy, is the only way to get a preflight-sealed copy that survives'
        : ' => current (a bake opening this DB should NOT re-inject on version grounds alone)'));
  } else {
    console.log('§KRN_SEAL_FROM_GENVERSION INCONCLUSIVE reason=' +
      (dbGenVersion == null ? 'no-ELEMENT_PLACE-op-or-no-genVersion-stamp' : 'time_machine.js-const-not-found'));
  }

  await K.sealFrom(db);              // prints its own §KRN_SEAL_FROM line
  var verify = await K.verifyChain(db);   // prints its own §KRN_CHAIN line

  var sealedAfterR = db.exec('SELECT COUNT(*) FROM kernel_ops WHERE op_hash IS NOT NULL');
  var sealedAfter = (sealedAfterR.length && sealedAfterR[0].values.length) ? sealedAfterR[0].values[0][0] : 0;

  // sealedAfterCapture=true: see the CONTRACT note at the top of this file — a workflow guarantee
  // this script's caller owns (run it on the already-schedule-captured "<Name>_silent.db"), not a
  // fact re-derivable from the DB's bytes alone.
  // `tip` read straight from the DB (last row's own op_hash), never off `verify.tip` — that field is
  // absent on verifyChain's own FAILURE return, which used to print the literal string "tip=?" here
  // too (the same bug class the browser-side ticker had — fixed there in §129.4 v9.1, fixed here too
  // for the same reason: this script can also legitimately fail if sealFrom just sealed a chain that
  // was ALREADY broken before it ran).
  var verifiedN = verify.ok ? verify.len : Math.max(0, (verify.brokeAt || 1) - 1);
  var lastTipR = db.exec('SELECT op_hash FROM kernel_ops ORDER BY id DESC LIMIT 1');
  var lastTip = (lastTipR.length && lastTipR[0].values.length) ? lastTipR[0].values[0][0] : null;
  console.log('§KRN_CHAIN verified=' + verifiedN + '/' + total +
    ' tip=' + (lastTip ? String(lastTip).slice(0, 12) + '…' : 'n/a') +
    ' sealedAfterCapture=true' + (verify.ok ? '' : ' brokenAt=' + verify.brokeAt + ' why=' + verify.why) +
    ' => ' + (verify.ok ? 'PASS' : 'FAIL'));

  var outBuf = Buffer.from(db.export());
  fs.writeFileSync(OUT, outBuf);
  console.log('§KRN_SEAL_FROM wrote out=' + OUT + ' bytes=' + outBuf.length +
    ' sealedBefore=' + sealedBefore + ' sealedAfter=' + sealedAfter + ' sourceUntouched=' + SRC);
})().catch(function (e) {
  console.error('§KRN_SEAL_FROM_ERR ' + (e && e.stack || e));
  process.exit(1);
});
