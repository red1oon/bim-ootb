#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-PATCH-GATE scope (READ THE LOG after every run)
 * SCOPE: OCCUPANT_PATHFINDER.md §PATCH-PROVENANCE-GATE — the mechanical gate for any patch destined
 * for the OCI bucket. Turns the manual discipline "verify against the served bytes, from a fresh
 * origin/main worktree" into a check that RUNS, because the manual version has already failed
 * silently twice in one week:
 *   1. a raster built from a 156-room compilation was used to judge a 224-room graph, and produced
 *      a published (wrong) conclusion that the atrium was correctly unreachable  [wrong DATA snapshot]
 *   2. a provenance check itself ran against a stale main checkout (73d3676, pre-#997) and printed
 *      a different split for the same 156 rooms                                  [wrong ENGINE snapshot]
 * Same failure class, two axes. This gate records BOTH and refuses the upload if either is unproven.
 *
 * NOT the same thing as §ROOM_WALKER_VERSION_STAMP (ROOM_INJECTOR_NEEDLE.md §228-266). That is a
 * CLIENT-side self-heal — a browser distrusting its own stale compiled-rooms table, write-back local
 * to IndexedDB, and its own point 5 says it "never touches OCI or a canonical DB file." It answers
 * "is this browser trusting a stale compile forever." This answers "is the artifact I am about to
 * upload verified against production's CURRENT bytes by the CURRENT engine." Different layers; do
 * not treat either as covering the other.
 *
 * RUN (gate only, writes <patch>.manifest.json, exit 0 = safe to upload):
 *   node scripts/oci_patch_gate.js --patch buildings/patches/X.db.sql --bucket bim-ootb \
 *        --object buildings/patches/X.db.sql --db-object buildings/X.db [--verify '<cmd>']
 * RUN (gate then upload + fetch-back verify):  ... --upload
 *
 * `--verify` is any command that must exit 0 (e.g. the raster provenance check whose invariant is
 * "a raster built from its own DB is 100% own-footprint walkable for every room"). It is run AFTER
 * the snapshot facts are collected, and its stdout tail is recorded in the manifest as evidence.
 */
'use strict';
const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return dflt;
  const v = process.argv[i + 1];
  return (v === undefined || v.startsWith('--')) ? true : v;
}
const log = (...a) => console.log(...a);
const fail = [];

const patch = arg('patch'), bucket = arg('bucket'), object = arg('object');
const dbObject = arg('db-object'), verifyCmd = arg('verify'), doUpload = arg('upload', false);
const contentType = arg('content-type', 'application/sql');
if (!patch || !bucket || !object || !dbObject) {
  console.error('usage: oci_patch_gate.js --patch <file> --bucket <b> --object <name> --db-object <name> [--verify <cmd>] [--upload]');
  process.exit(2);
}

// ── 1. ENGINE SNAPSHOT — which code ran the verification, and is it current? ──────────────────────
// The stale-checkout failure was invisible precisely because the numbers looked plausible. A commit
// SHA alone is not enough: a checkout can sit on a valid SHA that is behind origin/main, or carry a
// local merge that will never fast-forward (which is exactly what /home/red1/bim-ootb does today).
const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const git = (...a) => execFileSync('git', ['-C', repoRoot, ...a], { encoding: 'utf8' }).trim();
let engine = {};
try {
  git('fetch', 'origin', '--quiet');
  const sha = git('rev-parse', 'HEAD');
  const dirty = git('status', '--porcelain');
  const behind = parseInt(git('rev-list', '--count', 'HEAD..origin/main') || '0', 10);
  const ahead = parseInt(git('rev-list', '--count', 'origin/main..HEAD') || '0', 10);
  engine = { worktree: repoRoot, sha, behind_origin_main: behind, ahead_origin_main: ahead,
             clean: dirty === '', dirty_paths: dirty ? dirty.split('\n') : [] };
  if (behind > 0) fail.push(`engine is ${behind} commit(s) BEHIND origin/main — the stale-checkout failure. Measure from a fresh origin/main worktree.`);
  if (dirty !== '') fail.push('engine worktree is DIRTY — the verification is not reproducible from any commit.');
  // `ahead` is allowed (a feature branch under review) but is recorded, never silently accepted.
} catch (e) { fail.push('engine snapshot unavailable: ' + e.message); }
log('§GATE_ENGINE ' + JSON.stringify(engine));

// ── 2. TARGET-DB SNAPSHOT — the bytes production is serving RIGHT NOW, from the bucket itself ─────
// Fetched live, never inferred from a local file: a local copy with the same name is exactly the
// assumption that produced failure (1). etag identifies the object version; content-md5 is present
// for some objects and absent for others (large/multipart), so record both and require at least one.
function ociHead(bkt, name) {
  const out = execFileSync('oci', ['os', 'object', 'head', '-bn', bkt, '--name', name],
    { encoding: 'utf8', timeout: 180000 });
  return JSON.parse(out);
}
let served = {};
try {
  const h = ociHead(bucket, dbObject);
  served = { object: dbObject, etag: h.etag, 'content-md5': h['content-md5'] || null,
             size: h['content-length'], 'last-modified': h['last-modified'],
             'content-encoding': h['content-encoding'] || null };
  if (!served.etag && !served['content-md5']) fail.push('served DB has neither etag nor content-md5 — identity unprovable.');
} catch (e) { fail.push('could not head the served DB ' + dbObject + ': ' + e.message); }
log('§GATE_SERVED_DB ' + JSON.stringify(served));
// Served objects may be gzipped (Hospital_meta/_geo are); a verifier reading a downloaded copy must
// gunzip first or sqlite reports "file is not a database". Recorded so the manifest explains itself.

// ── 3. PATCH IDENTITY ─────────────────────────────────────────────────────────────────────────────
let artifact = {};
try {
  const buf = fs.readFileSync(patch);
  artifact = { file: path.relative(repoRoot, patch), bytes: buf.length,
               md5: crypto.createHash('md5').update(buf).digest('hex'),
               md5_b64: crypto.createHash('md5').update(buf).digest('base64'),
               object, content_type: contentType };
} catch (e) { fail.push('patch unreadable: ' + e.message); }
log('§GATE_ARTIFACT ' + JSON.stringify(artifact));

// ── 4. TARGET COLLISION — additive vs overwrite, stated explicitly (OCI_UPLOAD.md §RULES 1) ───────
let target = { exists: false };
try { const h = ociHead(bucket, object); target = { exists: true, etag: h.etag, size: h['content-length'], 'last-modified': h['last-modified'] }; }
catch (e) { target = { exists: false }; }
log('§GATE_TARGET ' + JSON.stringify(target) + (target.exists ? '  (OVERWRITE — diff it before proceeding)' : '  (ADD)'));

// ── 5. VERIFIER — the domain invariant, run against bytes THIS GATE fetched ───────────────────────
// The verifier is never handed a path the caller chose. Letting a caller point the check at a local
// file with the right NAME is precisely failure (1): a 156-room raster was judged against a
// 224-room DB that happened to be called Hospital.db. So the gate downloads the served object
// itself, gunzips when the bucket says gzip, applies the patch to a throwaway copy, and exposes it
// to the verify command as $GATE_DB. What was verified is then the same thing whose etag/md5 is
// recorded above, by construction rather than by convention.
let gateDb = null;
if (verifyCmd && typeof verifyCmd === 'string') {
  try {
    const tmp = fs.mkdtempSync('/tmp/patch-gate-');
    const raw = path.join(tmp, 'served.raw');
    execFileSync('oci', ['os', 'object', 'get', '-bn', bucket, '--name', dbObject, '--file', raw],
      { encoding: 'utf8', timeout: 1800000 });
    let dbFile = path.join(tmp, 'served.db');
    const magic = fs.readFileSync(raw, { start: 0, end: 2 });
    if (magic[0] === 0x1f && magic[1] === 0x8b) {
      execSync(`gunzip -c ${JSON.stringify(raw)} > ${JSON.stringify(dbFile)}`);
      log('§GATE_FETCH gunzipped (bucket serves this object gzipped)');
    } else { fs.copyFileSync(raw, dbFile); }
    const fetchedMd5 = crypto.createHash('md5').update(fs.readFileSync(raw)).digest('base64');
    if (served['content-md5'] && fetchedMd5 !== served['content-md5'])
      fail.push('fetched DB md5 does not match the bucket head — the object changed mid-gate.');
    execSync(`sqlite3 ${JSON.stringify(dbFile)} < ${JSON.stringify(patch)}`);
    gateDb = dbFile;
    log('§GATE_FETCH served DB downloaded + patch applied -> $GATE_DB=' + dbFile);
  } catch (e) { fail.push('could not materialise the served DB for verification: ' + e.message); }
}
let verification = null;
if (verifyCmd && typeof verifyCmd === 'string' && gateDb) {
  try {
    const out = execSync(verifyCmd, { encoding: 'utf8', timeout: 1800000, cwd: repoRoot,
      env: Object.assign({}, process.env, { GATE_DB: gateDb }) });
    verification = { cmd: verifyCmd, exit: 0, tail: out.trim().split('\n').slice(-6) };
  } catch (e) {
    verification = { cmd: verifyCmd, exit: e.status == null ? -1 : e.status,
                     tail: String(e.stdout || e.message).trim().split('\n').slice(-6) };
    fail.push('verifier exited ' + verification.exit + ' — the artifact is NOT proven against the served bytes.');
  }
  log('§GATE_VERIFY ' + JSON.stringify(verification));
} else if (verifyCmd) {
  log('§GATE_VERIFY skipped — served DB could not be materialised (see failures).');
} else {
  log('§GATE_VERIFY none supplied — manifest records provenance only, NOT correctness.');
}

// ── 6. MANIFEST + VERDICT ─────────────────────────────────────────────────────────────────────────
const manifest = { schema: 'oci-patch-provenance/1', generated_at: new Date().toISOString(),
                   bucket, engine, served_db: served, artifact, target, verification,
                   verdict: fail.length ? 'FAIL' : 'PASS', failures: fail };
const manifestPath = patch + '.manifest.json';
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
log('§GATE_MANIFEST wrote ' + manifestPath);

if (fail.length) {
  log('§GATE_VERDICT FAIL — upload refused');
  fail.forEach(f => log('  ✗ ' + f));
  process.exit(1);
}
log('§GATE_VERDICT PASS');

// ── 7. UPLOAD + FETCH-BACK (only past a PASS) ─────────────────────────────────────────────────────
if (doUpload) {
  execFileSync('oci', ['os', 'object', 'put', '-bn', bucket, '--name', object, '--file', patch,
    '--content-type', contentType, '--force'], { encoding: 'utf8', timeout: 600000 });
  const h = ociHead(bucket, object);
  const okMd5 = !h['content-md5'] || h['content-md5'] === artifact.md5_b64;
  const okType = h['content-type'] === contentType;
  const okSize = String(h['content-length']) === String(artifact.bytes);
  log('§GATE_UPLOADED size=' + h['content-length'] + ' type=' + h['content-type'] + ' md5=' + h['content-md5']);
  if (!okMd5 || !okType || !okSize) { log('§GATE_VERDICT UPLOAD_MISMATCH'); process.exit(1); }
  manifest.uploaded = { at: new Date().toISOString(), etag: h.etag, verified: true };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  log('§GATE_VERDICT UPLOAD_VERIFIED');
}
