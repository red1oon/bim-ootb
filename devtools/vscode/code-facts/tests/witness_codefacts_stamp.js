#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-CODEFACTS-STAMP (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.25, bim-ootb #3091).
// Read the log after every run: exit code is not evidence.
// ISSUE THIS PROVES OR DISPROVES: "an installed Code Facts cannot tell that its source changed" (package.json says 0.1.0 for every
//   build). After: the .vsix carries extension/built.json = the hash of what was packed, and activate() of the PACKED code warns once,
//   only when devtools/vscode/code-facts in the open folder differs.
// POPULATION: the real code-facts folder, copied into a temp repo (its files are what pack.js packs). Empty → INCONCLUSIVE.
// RED CONTROLS: an edit of one packed file must turn 'same' into 'stale' (the judge must flip); a missing stamp or source folder must
//   give 'unknown', never 'same'. An edit under tests/ (not packed) must stay 'same' (no false alarm).
// Not proven here: how VS Code draws the warning (the stub is not VS Code).
// Command: node devtools/vscode/code-facts/tests/witness_codefacts_stamp.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const EXT = path.resolve(__dirname, '..');
const P = require(path.join(ROOT, 'devtools', 'vscode', 'pack.js'));
const B = require(path.join(EXT, 'lib', 'build_stamp.js'));

let fail = 0, judged = 0;
function check(label, cond) { judged++; console.log('  ' + (cond ? 'PASS ' : 'FAIL ') + label); if (!cond) fail++; }
function cp(src, dst) { fs.cpSync(src, dst, { recursive: true, filter: s => !/node_modules/.test(s) }); }

/** The entries of a zip that pack.js wrote (local headers in order, deflate). */
function unzip(buf) {
  const out = {};
  let o = 0;
  while (o + 30 <= buf.length && buf.readUInt32LE(o) === 0x04034b50) {
    const comp = buf.readUInt32LE(o + 18), nl = buf.readUInt16LE(o + 26), xl = buf.readUInt16LE(o + 28);
    const name = buf.slice(o + 30, o + 30 + nl).toString('utf8'), start = o + 30 + nl + xl;
    out[name] = zlib.inflateRawSync(buf.slice(start, start + comp));
    o = start + comp;
  }
  return out;
}
function installTo(vsix, dir) {
  const E = unzip(fs.readFileSync(vsix));
  for (const [name, data] of Object.entries(E)) {
    if (!name.startsWith('extension/')) continue;
    const f = path.join(dir, name.slice('extension/'.length));
    fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data);
  }
  return E;
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'code-facts-stamp-'));
const REPO = path.join(TMP, 'repo'), SRC = path.join(REPO, B.SOURCE), INST = path.join(TMP, 'installed');
cp(EXT, SRC);
fs.mkdirSync(path.join(REPO, 'internal'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'internal', 'APP_SURFACE.md'), path.join(REPO, 'internal', 'APP_SURFACE.md'));   // the marker findSourceRoot looks for

const packedFiles = B.listFiles(SRC, '', []);
if (!packedFiles.length) {
  console.log('§CODEFACTS_STAMP_W files=0 verdict=INCONCLUSIVE (nothing to pack)');
  process.exit(0);
}

(async () => {
  // S1 + S2: the stamp is in the .vsix and equals the hash of what was packed; the same input gives the same bytes.
  const r1 = P.pack(SRC, path.join(TMP, 'dist1')), r2 = P.pack(SRC, path.join(TMP, 'dist2'));
  const E = installTo(r1.file, INST);
  const stampText = E['extension/' + B.STAMP] ? E['extension/' + B.STAMP].toString('utf8') : '';
  let stamped = null; try { stamped = JSON.parse(stampText).sourceHash; } catch (e) { stamped = null; }
  const hash = B.sourceHash(SRC);
  check('S1 the .vsix carries extension/' + B.STAMP + ' and it equals the source hash (' + String(stamped).slice(0, 12) + ' = ' + hash.slice(0, 12) + ')', !!stamped && stamped === hash && r1.sourceHash === hash);
  check('S1 every listed file is packed once (files=' + packedFiles.length + ')', packedFiles.every(f => E['extension/' + f]) && !packedFiles.includes(B.STAMP));
  const deterministic = fs.readFileSync(r1.file).equals(fs.readFileSync(r2.file));
  check('S2 two packs of the same input give the same bytes', deterministic);

  // S3: same → stale when a packed file changes; a tests/ edit stays same.
  const same = B.compare(INST, REPO);
  check('S3 unchanged source → same (state=' + same.state + ')', same.state === 'same');
  fs.writeFileSync(path.join(SRC, 'tests', 'codefacts_stamp_probe.js'), '// not packed\n');
  const testsOnly = B.compare(INST, REPO);
  check('S3 an edit under tests/ stays same (state=' + testsOnly.state + ')', testsOnly.state === 'same');
  const extFile = path.join(SRC, 'extension.js'), orig = fs.readFileSync(extFile);
  fs.appendFileSync(extFile, '\n// edited after the pack\n');
  const stale = B.compare(INST, REPO);
  check('S3 RED: an edit of a packed file → stale (state=' + stale.state + ')', stale.state === 'stale' && stale.built === hash && stale.source !== hash);

  // S4: no stamp, or no source, is unknown — never same.
  const NOSTAMP = path.join(TMP, 'nostamp'); cp(INST, NOSTAMP); fs.rmSync(path.join(NOSTAMP, B.STAMP), { force: true });
  const u1 = B.compare(NOSTAMP, REPO), u2 = B.compare(INST, null), u3 = B.compare(INST, TMP);
  check('S4 RED: no ' + B.STAMP + ' → unknown (' + u1.state + ': ' + u1.reason + ')', u1.state === 'unknown' && !!u1.reason);
  check('S4 RED: no open folder / no source folder → unknown (' + u2.state + ', ' + u3.state + ')', u2.state === 'unknown' && u3.state === 'unknown');

  // S5: the PACKED extension.js, activated through the shared stub, warns only when stale.
  const { reg, restore } = require('./vscode_stub').install(REPO);
  const ext = require(path.join(INST, 'extension.js'));
  function activateOnce(label) {
    reg.warnings.length = 0; reg.lines.length = 0;
    const ctx = { subscriptions: [], extensionPath: INST, storageUri: { fsPath: fs.mkdtempSync(path.join(TMP, 'store-')) } };
    ext.activate(ctx);
    const line = reg.lines.find(l => l.startsWith('§CODEFACTS_STAMP')) || '(no §CODEFACTS_STAMP line)';
    console.log('    ' + label + ': ' + line + ' warnings=' + reg.warnings.length);
    ctx.subscriptions.forEach(d => { try { d.dispose(); } catch (e) { /* stub */ } });
    return { line, warnings: reg.warnings.slice() };
  }
  const aStale = activateOnce('edited source');
  check('S5 RED: activate with a stale copy shows ONE warning that names pack.js (' + aStale.warnings.length + ')', aStale.warnings.length === 1 && /pack\.js --install/.test(aStale.warnings[0]) && /state=stale/.test(aStale.line));
  fs.writeFileSync(extFile, orig);
  const aSame = activateOnce('restored source');
  check('S5 activate with a matching copy shows no warning (' + aSame.warnings.length + ')', aSame.warnings.length === 0 && /state=same/.test(aSame.line));
  restore();

  fs.rmSync(TMP, { recursive: true, force: true });
  const verdict = judged === 0 ? 'INCONCLUSIVE' : (fail === 0 ? 'PASS' : 'FAIL');
  console.log('§CODEFACTS_STAMP_W files=' + packedFiles.length + ' stamp=' + hash.slice(0, 12) + ' deterministic=' + (deterministic ? 'Y' : 'N')
    + ' checks=' + judged + ' failed=' + fail + ' verdict=' + verdict);
  if (verdict !== 'PASS') process.exitCode = 1;
})().catch(e => { fs.rmSync(TMP, { recursive: true, force: true }); console.log('  FAIL ' + (e && e.stack || e)); console.log('§CODEFACTS_STAMP_W verdict=FAIL'); process.exitCode = 1; });
