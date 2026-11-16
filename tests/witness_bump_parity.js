#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-BUMP-PARITY (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md, "F-16 BUILD SPEC")
// ISSUE IT PROVES OR DISPROVES: "an ERP edit could be bumped (shipped to users) with no check that it still matches legacy
// iDempiere; after: scripts/bump.js --write on an erp/ target runs the parity bridge first and a NEW mismatch stops it, visibly."
// READ THE LOG AFTER EVERY RUN (exit code is not evidence). Every row runs on a TEMP COPY (--root, as W-BUMP does).
// A stub bridge (BUMP_PARITY_BRIDGE) prints chosen `§TAG_VERDICT WORD` lines and appends to a marker file, so "not run" is
// provable (marker empty), not assumed. Rows: P1 new FAIL blocks · P2 only known FAILs pass · P3 warn · P4 off · P5 non-ERP
// target never runs it · P6 --no-parity needs a reason / OVERRIDE · P7 0 verdicts = INCONCLUSIVE, blocked · P8 same tree =
// cached, changed tree = not · P9 the bridge judges the bumped tree · P10/P11 (§F.32) only the witnesses that read the tree run · T1-T5 (§F.33) the changed file's own witnesses, new failures only. R (opt-in BUMP_PARITY_REAL=1): the REAL bridge (BUMP_PARITY_BRIDGE, default /tmp/wt-bridge/...)
// with the repo's real config gives verdict=PASS. Prints §BUMP_PARITY_W <row> PASS|FAIL and §BUMP_PARITY_W_VERDICT;
// INCONCLUSIVE (never PASS) when nothing was judged.
// Usage: nice -n 19 ionice -c3 node tests/witness_bump_parity.js > log 2>&1
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const REPO = path.resolve(__dirname, '..');
const BUMP = path.join(REPO, 'scripts', 'bump.js');
const rd = f => fs.readFileSync(path.join(REPO, f), 'utf8');
const ehtml = rd('erp/idempiere.html');
const em = [...ehtml.matchAll(/src="([a-z0-9_]+\.js)\?v=(\d+)"/g)].find(x => fs.existsSync(path.join(REPO, 'erp', x[1])));
const vhtml = rd('viewer/viewer.html');
const vm = [...vhtml.matchAll(/src="([a-z0-9_]+\.js)\?v=(\d+)"/g)].find(x => fs.existsSync(path.join(REPO, 'viewer', x[1])));
if (!em || !vm) { console.log('§BUMP_PARITY_W_VERDICT INCONCLUSIVE no erp/ or viewer/ target with ?v= found'); process.exit(1); }
const ERP = 'erp/' + em[1], NON = 'viewer/' + vm[1];
const FILES = ['erp/idempiere.html', 'erp/sw.js', ERP, 'viewer/viewer.html', 'viewer/sw.js', NON];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'witness_bump_parity_'));
const root = path.join(tmp, 'root'), home = path.join(tmp, 'home'), stubDir = path.join(tmp, 'stub');
fs.mkdirSync(stubDir, { recursive: true });
const orig = {};
for (const f of FILES) { orig[f] = rd(f); fs.mkdirSync(path.join(root, path.dirname(f)), { recursive: true }); fs.writeFileSync(path.join(root, f), orig[f]); }
const CFG = { mode: 'block', applies_to: ['erp/'], bridge: '~/bim-compiler/scripts/bridge/run_all.sh', known: ['DD:FAIL', 'CTX:FAIL', 'DDS:HARNESS-FAIL'] };
fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
const writeCfg = c => fs.writeFileSync(path.join(root, 'scripts', 'bump_parity.json'), JSON.stringify(c));
writeCfg(CFG);
const LINES = path.join(stubDir, 'lines.txt'), MARK = path.join(stubDir, 'ran.txt'), STUB = path.join(stubDir, 'stub_bridge.sh');
const ENVREC = path.join(stubDir, 'env.txt');
fs.writeFileSync(STUB, '#!/bin/bash\necho run >> "$STUB_MARK"\necho "OOTB=$OOTB|BRIDGE_OOTB=$BRIDGE_OOTB|BRIDGE_UI_DB=$BRIDGE_UI_DB" > "' + ENVREC + '"\ncat "$STUB_LINES"\n');
const runs = () => fs.existsSync(MARK) ? fs.readFileSync(MARK, 'utf8').split('\n').filter(Boolean).length : 0;
const restore = () => { for (const f of FILES) fs.writeFileSync(path.join(root, f), orig[f]); fs.rmSync(MARK, { force: true }); fs.rmSync(path.join(home, 'bump_parity'), { recursive: true, force: true }); writeCfg(CFG); };
const snap = () => JSON.stringify(FILES.map(f => fs.readFileSync(path.join(root, f), 'utf8')));
const setLines = a => fs.writeFileSync(LINES, a.length ? a.join('\n') + '\n' : '');
const run = (args, env = {}, extra = {}) => {
  const r = cp.spawnSync('node', [BUMP, ...args, '--root', root], { encoding: 'utf8', env: { ...process.env, BUMP_PARITY: '', BUMP_PARITY_BRIDGE: STUB, BUMP_PARITY_HOME: home, STUB_LINES: LINES, STUB_MARK: MARK, ...env }, ...extra });
  return { code: r.status, out: r.stdout + r.stderr };
};
const par = out => (out.split('\n').find(l => l.startsWith('§BUMP_PARITY ')) || '');
const field = (out, k) => (new RegExp(k + '=(\\S+)').exec(par(out)) || [])[1];
const bumped = () => rd2('erp/idempiere.html') !== orig['erp/idempiere.html'] && rd2('erp/sw.js') !== orig['erp/sw.js'];
const rd2 = f => fs.readFileSync(path.join(root, f), 'utf8');
const pageHas = v => rd2('erp/idempiere.html').includes(`${em[1]}?v=${v}"`);
let fails = 0, judged = 0;
const check = (c, ok, info) => { judged++; if (!ok) fails++; console.log(`§BUMP_PARITY_W ${c} ${ok ? 'PASS' : 'FAIL'} ${info}`); };

// the verdict lines the real bridge printed on 2026-11-15 (shapes copied from its log)
const KNOWN_FAILS = ['§DD_VERDICT FAIL tables=3', '§CTX_VERDICT FAIL ctx=2', '§DDS_VERDICT HARNESS-FAIL selftest'];
const OTHERS = ['§M1_VERDICT PASS-with-INCONCLUSIVE rows=9', '§ATTACH_PARITY_VERDICT W-ATTACH-PARITY NOT-RUN (set env)', '§PRODUCT_ICONS_VERDICT W-ICON-PARITY NOT-RUN (set BRIDGE_OOTB)', '§SODA_VERDICT PASS'];
const V = +em[2];

try {
  // P1 — a NEW failure blocks: nothing written, exit 3, ?v= and sw unchanged; and a FAIL is never cached (second run blocks again)
  restore(); setLines([...KNOWN_FAILS, '§ATTACH_VERDICT FAIL doc=7', ...OTHERS]);
  const s1 = snap(), r1 = run([ERP, '--write']);
  check('P1-new-fail-blocks', r1.code === 3 && snap() === s1 && field(r1.out, 'verdict') === 'BLOCKED' && /new=\[ATTACH:FAIL\]/.test(par(r1.out)) && runs() === 1 && pageHas(V),
    `exit=${r1.code} unchanged=${snap() === s1} ?v=${V} kept=${pageHas(V)} ${par(r1.out).replace('§BUMP_PARITY ', '')}`);
  const r1b = run([ERP, '--write']);
  check('P1b-fail-not-cached', r1b.code === 3 && runs() === 2 && field(r1b.out, 'cached') === 'N', `exit=${r1b.code} bridge_runs=${runs()} (want 2)`);
  // P1c — a verdict line carrying a witness id before the word is still read (`§X_VERDICT W-X FAIL`)
  restore(); setLines([...KNOWN_FAILS, '§SPLIT_VERDICT W-SPLIT-PARITY FAIL'].concat(OTHERS));
  const r1c = run([ERP, '--write']);
  check('P1c-witness-id-before-word', r1c.code === 3 && /new=\[SPLIT:FAIL\]/.test(par(r1c.out)) && snap() === JSON.stringify(FILES.map(f => orig[f])), `exit=${r1c.code} ${par(r1c.out).replace('§BUMP_PARITY ', '')}`);

  // P2 — only the known non-passing set (plus NOT-RUN / PASS-with-INCONCLUSIVE): PASS, written (page ?v=+1, sw +1)
  restore(); setLines([...KNOWN_FAILS, ...OTHERS]);
  const r2 = run([ERP, '--write']);
  const swv = s => +(/CACHE_VERSION\s*=\s*'v(\d+)'/.exec(s) || [])[1];
  check('P2-known-fails-pass', r2.code === 0 && field(r2.out, 'verdict') === 'PASS' && field(r2.out, 'verdicts') === '7' && /known=\[DD:FAIL,CTX:FAIL,DDS:HARNESS-FAIL\]/.test(par(r2.out)) && pageHas(V + 1) && swv(rd2('erp/sw.js')) === swv(orig['erp/sw.js']) + 1,
    `exit=${r2.code} ?v=${V}->${V + 1} written=${pageHas(V + 1)} sw v${swv(orig['erp/sw.js'])}->v${swv(rd2('erp/sw.js'))} ${par(r2.out).replace('§BUMP_PARITY ', '')}`);

  // P3 — warn (env overrides config block): written, the line says WARN
  restore(); setLines([...KNOWN_FAILS, '§ATTACH_VERDICT FAIL doc=7']);
  const r3 = run([ERP, '--write'], { BUMP_PARITY: 'warn' });
  check('P3-warn-writes', r3.code === 0 && field(r3.out, 'verdict') === 'WARN' && field(r3.out, 'mode') === 'warn' && pageHas(V + 1) && runs() === 1, `exit=${r3.code} written=${pageHas(V + 1)} ${par(r3.out).replace('§BUMP_PARITY ', '')}`);

  // P4 — off: bridge NOT run (marker empty), written
  restore(); setLines(['§ATTACH_VERDICT FAIL doc=7']);
  const r4 = run([ERP, '--write'], { BUMP_PARITY: 'off' });
  check('P4-off-not-run', r4.code === 0 && field(r4.out, 'verdict') === 'OFF' && runs() === 0 && pageHas(V + 1), `exit=${r4.code} bridge_runs=${runs()} written=${pageHas(V + 1)}`);
  // P4b — config mode "off" (no env) behaves the same
  restore(); writeCfg({ ...CFG, mode: 'off' });
  const r4b = run([ERP, '--write']);
  check('P4b-config-off', r4b.code === 0 && field(r4b.out, 'verdict') === 'OFF' && runs() === 0, `exit=${r4b.code} bridge_runs=${runs()}`);

  // P5 — a non-ERP target: not run (marker empty, no §BUMP_PARITY line) even though the stub would FAIL it; and a DRY run of an ERP target does not run it either
  restore(); setLines(['§ATTACH_VERDICT FAIL doc=7']);
  const r5 = run([NON, '--write']), vw = rd2('viewer/viewer.html') !== orig['viewer/viewer.html'];
  const r5b = run([ERP]);
  check('P5-non-erp-and-dry-run-not-run', r5.code === 0 && runs() === 0 && !par(r5.out) && vw && r5b.code === 0 && !par(r5b.out) && /mode=dry-run/.test(r5b.out), `non_erp_exit=${r5.code} written=${vw} parity_line=${!!par(r5.out)} dry_run_parity_line=${!!par(r5b.out)} bridge_runs=${runs()}`);

  // P6 — --no-parity needs a reason; with one: OVERRIDE, written, bridge not run
  restore(); setLines(['§ATTACH_VERDICT FAIL doc=7']);
  const s6 = snap();
  const r6a = run([ERP, '--write', '--no-parity']);
  const r6b = run(['--no-parity', ERP, '--write']);   // the target must not be eaten as the reason
  check('P6a-no-parity-without-reason-refused', r6a.code === 1 && r6b.code === 1 && /no_parity_needs_reason/.test(r6a.out + r6b.out) && snap() === s6 && runs() === 0, `exit=${r6a.code}/${r6b.code} unchanged=${snap() === s6}`);
  const r6c = run([ERP, '--write', '--no-parity', 'legacy DD mismatch is the known PO window gap']);
  check('P6b-no-parity-with-reason-overrides', r6c.code === 0 && field(r6c.out, 'verdict') === 'OVERRIDE' && /reason="legacy DD mismatch is the known PO window gap"/.test(par(r6c.out)) && runs() === 0 && pageHas(V + 1), `exit=${r6c.code} written=${pageHas(V + 1)} bridge_runs=${runs()} ${par(r6c.out).slice(0, 120)}`);

  // P7 — 0 verdicts (pilot down): INCONCLUSIVE, blocked in block mode, the line says how to start the pilot
  restore(); setLines([]);
  const s7 = snap(), r7 = run([ERP, '--write']);
  check('P7-zero-verdicts-inconclusive-blocks', r7.code === 3 && field(r7.out, 'verdict') === 'INCONCLUSIVE' && field(r7.out, 'verdicts') === '0' && /docker postgres/.test(r7.out) && snap() === s7 && runs() === 1, `exit=${r7.code} unchanged=${snap() === s7} ${par(r7.out).replace('§BUMP_PARITY ', '').slice(0, 160)}`);
  // P7b — a missing bridge is the same: INCONCLUSIVE, not a pass
  const r7b = run([ERP, '--write'], { BUMP_PARITY_BRIDGE: path.join(stubDir, 'nope.sh') });
  check('P7b-missing-bridge-inconclusive', r7b.code === 3 && field(r7b.out, 'verdict') === 'INCONCLUSIVE' && /bridge_missing/.test(r7b.out) && snap() === s7, `exit=${r7b.code}`);

  // P8 — same tree twice: the second is cached=Y and the bridge is not run again; a changed tree runs it again
  restore(); setLines([...KNOWN_FAILS, ...OTHERS]);
  const r8a = run([ERP, '--write']);
  for (const f of FILES) fs.writeFileSync(path.join(root, f), orig[f]);   // same tree again (as after a revert)
  const r8b = run([ERP, '--write']);
  const n8 = runs();
  for (const f of FILES) fs.writeFileSync(path.join(root, f), orig[f]);
  fs.appendFileSync(path.join(root, 'erp/sw.js'), '\n// tree changed\n');
  const r8c = run([ERP, '--write']);
  check('P8-same-tree-cached', r8a.code === 0 && field(r8a.out, 'cached') === 'N' && r8b.code === 0 && field(r8b.out, 'cached') === 'Y' && field(r8b.out, 'verdict') === 'PASS' && n8 === 1 && field(r8c.out, 'cached') === 'N' && runs() === 2,
    `first cached=${field(r8a.out, 'cached')} second cached=${field(r8b.out, 'cached')} bridge_runs_after_2nd=${n8} (want 1) changed_tree cached=${field(r8c.out, 'cached')} runs=${runs()} (want 2)`);

  // P9 (§F.30, #3111) — the bridge is told WHICH tree it judges: the bumped root, not the shared ~/bim-ootb (scope-blind before)
  restore(); setLines([...KNOWN_FAILS, ...OTHERS]); fs.rmSync(ENVREC, { force: true });
  const r9 = run([ERP, '--write'], { OOTB: '', BRIDGE_OOTB: '', BRIDGE_UI_DB: '' });
  const rec = fs.existsSync(ENVREC) ? fs.readFileSync(ENVREC, 'utf8').trim() : '';
  const want = 'OOTB=' + root + '|BRIDGE_OOTB=' + root + '|BRIDGE_UI_DB=' + path.join(root, 'erp', 'ad_seed.db');
  check('P9-bridge-judges-the-bumped-tree', r9.code === 0 && rec === want && field(r9.out, 'tree') === root && field(r9.out, 'scoped') === 'script',
    `bridge saw "${rec || '(nothing)'}" (want the bumped root) · § line tree=${field(r9.out, 'tree')} scoped=${field(r9.out, 'scoped')}`);

  // P10/P11 (§F.32) — a bridge script that NAMES witnesses: the gate runs only those that read a tree setting (here witness_sa, through a local require),
  //   never the others (witness_sb). Main's gate ran the whole script, so P11 (SB fails, SA passes) was BLOCKED there: the red control.
  const wdir = path.join(tmp, 'wbridge'); fs.mkdirSync(wdir, { recursive: true });
  const WRA = path.join(wdir, 'run_all.sh'), WMARK = path.join(wdir, 'ran.txt');
  fs.writeFileSync(WRA, '#!/bin/sh\ncd "$(dirname "$0")"\nfor w in witness_sa witness_sb; do echo "=== $w"; node "$w.js"; done\n');
  fs.writeFileSync(path.join(wdir, 'tree_cfg.js'), "module.exports = () => process.env.BRIDGE_OOTB || '';\n");
  fs.writeFileSync(path.join(wdir, 'witness_sa.js'), "require('fs').appendFileSync(" + JSON.stringify(WMARK) + ", 'sa\\n'); require('./tree_cfg')(); console.log(process.env.SA_LINE);\n");
  fs.writeFileSync(path.join(wdir, 'witness_sb.js'), "require('fs').appendFileSync(" + JSON.stringify(WMARK) + ", 'sb\\n'); console.log(process.env.SB_LINE);\n");
  const ran = () => fs.existsSync(WMARK) ? fs.readFileSync(WMARK, 'utf8').split('\n').filter(Boolean) : [];
  restore(); fs.rmSync(WMARK, { force: true });
  const r10 = run([ERP, '--write'], { BUMP_PARITY_BRIDGE: WRA, SA_LINE: '§SA_VERDICT FAIL x=1', SB_LINE: '§SB_VERDICT FAIL y=1' });
  check('P10-runs-only-tree-witnesses-and-blocks-on-them', r10.code === 3 && /new=\[SA:FAIL\]/.test(par(r10.out)) && ran().join(',') === 'sa' && field(r10.out, 'scoped') === 'tree' && /witnesses=1 skipped=1/.test(par(r10.out)) && /§BUMP_PARITY_RUN w=witness_sa /.test(r10.out),
    `exit=${r10.code} ran=[${ran().join(',')}] (want sa) ${par(r10.out).replace('§BUMP_PARITY ', '')}`);
  restore(); fs.rmSync(WMARK, { force: true });
  const r11 = run([ERP, '--write'], { BUMP_PARITY_BRIDGE: WRA, SA_LINE: '§SA_VERDICT PASS x=1', SB_LINE: '§SB_VERDICT FAIL y=1' });
  check('P11-a-witness-that-cannot-judge-the-tree-never-blocks', r11.code === 0 && field(r11.out, 'verdict') === 'PASS' && ran().join(',') === 'sa' && pageHas(V + 1),
    `exit=${r11.code} ran=[${ran().join(',')}] written=${pageHas(V + 1)} ${par(r11.out).replace('§BUMP_PARITY ', '')}`);

  // T1-T4 (§F.33, decision F-23) — the CHANGED file's own witnesses: stub witnesses in the bumped tree's erp/tests/ (each spells a require of the changed
  //   file, never executed) and a stub BASE tree (BUMP_TOUCH_BASE). Main's bump.js prints no §BUMP_TOUCH line at all: the red control.
  const base = path.join(tmp, 'base'), TM = path.join(tmp, 'touch_ran.txt'), FLK = path.join(tmp, 'flaky.txt');
  const req = `if (false) require('../${em[1]}');\n`, mark = n => `require('fs').appendFileSync(${JSON.stringify(TM)}, '${n}\\n');\n`;
  const put = (tree, n, body) => { fs.mkdirSync(path.join(tree, 'erp', 'tests'), { recursive: true }); fs.writeFileSync(path.join(tree, 'erp', 'tests', n + '.js'), body); };
  const touchClear = () => { fs.rmSync(path.join(root, 'erp', 'tests'), { recursive: true, force: true }); fs.rmSync(base, { recursive: true, force: true }); fs.rmSync(TM, { force: true }); fs.rmSync(FLK, { force: true }); };
  const tran = () => fs.existsSync(TM) ? fs.readFileSync(TM, 'utf8').split('\n').filter(Boolean) : [];
  const touch = out => (out.split('\n').find(l => l.startsWith('§BUMP_TOUCH ')) || '');
  restore(); touchClear(); setLines([...KNOWN_FAILS, ...OTHERS]);
  put(root, 'witness_t1', req + mark('t1:change') + "console.log('§T1_VERDICT FAIL'); process.exit(1);\n");
  put(base, 'witness_t1', req + mark('t1:base') + "console.log('§T1_VERDICT PASS');\n");
  put(root, 'witness_t3', mark('t3') + "process.exit(1);\n");   // does not load the changed file
  const t1 = run([ERP, '--write'], { BUMP_TOUCH_BASE: base });
  check('T1-new-fail-on-the-changed-files-witness-blocks', t1.code === 3 && /new_fail=\[witness_t1\]/.test(touch(t1.out)) && /verdict=BLOCKED/.test(touch(t1.out)) && tran().join(',') === 't1:change,t1:base,t1:change' && pageHas(V),
    `exit=${t1.code} ran=[${tran().join(',')}] (want change, base, change re-run; t3 never) ${touch(t1.out).replace('§BUMP_TOUCH ', '')}`);
  restore(); touchClear(); setLines([...KNOWN_FAILS, ...OTHERS]);
  put(root, 'witness_t2', req + mark('t2:change') + "process.exit(1);\n"); put(base, 'witness_t2', req + mark('t2:base') + "process.exit(1);\n");
  const t2 = run([ERP, '--write'], { BUMP_TOUCH_BASE: base });
  check('T2-a-failure-that-main-already-has-does-not-block', t2.code === 0 && /pre_fail=\[witness_t2\]/.test(touch(t2.out)) && /new_fail=\[\]/.test(touch(t2.out)) && /verdict=PASS/.test(touch(t2.out)) && pageHas(V + 1) && tran().join(',') === 't2:change,t2:base',
    `exit=${t2.code} ran=[${tran().join(',')}] (want no re-run: main already fails it) ${touch(t2.out).replace('§BUMP_TOUCH ', '')}`);
  restore(); touchClear(); setLines([...KNOWN_FAILS, ...OTHERS]);
  put(root, 'witness_t4', req + mark('t4') + `const f = ${JSON.stringify(FLK)}, fs2 = require('fs'); if (!fs2.existsSync(f)) { fs2.writeFileSync(f, '1'); process.exit(1); }\n`);
  put(base, 'witness_t4', req + mark('t4:base') + "process.exit(0);\n");
  const t4 = run([ERP, '--write'], { BUMP_TOUCH_BASE: base });
  check('T4-a-flake-is-not-a-new-fail', t4.code === 0 && /new_fail=\[\]/.test(touch(t4.out)) && /change=0\(flake\)/.test(t4.out) && tran().join(',') === 't4,t4:base,t4',
    `exit=${t4.code} ran=[${tran().join(',')}] ${touch(t4.out).replace('§BUMP_TOUCH ', '')}`);
  restore(); touchClear(); setLines([...KNOWN_FAILS, ...OTHERS]);
  put(root, 'witness_t5', req + "process.exit(1);\n");
  const t5 = run([ERP, '--write'], { BUMP_TOUCH_BASE: '' });   // no base: the temp tree is not a git checkout
  check('T5-a-failure-with-no-base-is-inconclusive-not-a-pass', t5.code === 3 && /unjudged=\[witness_t5\]/.test(touch(t5.out)) && /verdict=INCONCLUSIVE/.test(touch(t5.out)) && pageHas(V),
    `exit=${t5.code} ${touch(t5.out).replace('§BUMP_TOUCH ', '')}`);
  // T6 (F-23b) — the budget: two witnesses, the one recorded as slow comes last and is NOT started once the budget is spent; it is named, not failed
  restore(); touchClear(); setLines([...KNOWN_FAILS, ...OTHERS]); fs.rmSync(path.join(home, 'touch_durations.json'), { force: true });
  put(root, 'witness_t6a', req + mark('t6a') + "const e = Date.now() + 1500; while (Date.now() < e) {}\n");
  put(root, 'witness_t6b', req + mark('t6b') + "process.exit(0);\n");
  fs.mkdirSync(home, { recursive: true }); fs.writeFileSync(path.join(home, 'touch_durations.json'), JSON.stringify({ 'erp/tests/witness_t6a.js': 1, 'erp/tests/witness_t6b.js': 999 }));
  const t6 = run([ERP, '--write'], { BUMP_TOUCH_BASE: base, BUMP_TOUCH_BUDGET_S: '1' });
  check('T6-budget-runs-fastest-first-and-names-the-unrun', t6.code === 0 && tran().join(',') === 't6a' && /unrun=\[witness_t6b\]/.test(touch(t6.out)) && /budget_s=1 /.test(touch(t6.out)) && /verdict=PASS/.test(touch(t6.out)),
    `exit=${t6.code} ran=[${tran().join(',')}] (want t6a only) ${touch(t6.out).replace('§BUMP_TOUCH ', '')}`);
  fs.rmSync(path.join(home, 'touch_durations.json'), { force: true });
  touchClear();

  // R — REAL bridge (opt-in; ~70 s; writes throwaway clients to the local pilot)
  if (process.env.BUMP_PARITY_REAL === '1') {
    // §F.32: the real witnesses READ the tree they judge (erp/tests/dd_common.js, the models, ...), so this row bumps an OVERLAY of the repo: the edited
    //   files are copies, everything else is a link to the real file (a 6-file copy made them crash in 0 s: "Cannot find module .../erp/tests/dd_common.js").
    const rootR = path.join(tmp, 'rootR'), keep = new Set(FILES.concat(['scripts/bump_parity.json']));
    const overlay = (rel) => {
      const src = path.join(REPO, rel), dst = path.join(rootR, rel); fs.mkdirSync(dst, { recursive: true });
      for (const e of fs.readdirSync(src)) {
        if (e === '.git') continue;
        const r = rel ? rel + '/' + e : e;
        if (keep.has(r)) fs.copyFileSync(path.join(REPO, r), path.join(rootR, r));
        else if ([...keep].some(k => k.startsWith(r + '/'))) overlay(r);
        else fs.symlinkSync(path.join(src, e), path.join(dst, e));
      }
    };
    overlay('');
    const real = process.env.BUMP_PARITY_BRIDGE || '/tmp/wt-bridge/scripts/bridge/run_all.sh';
    const rr = cp.spawnSync('node', [BUMP, ERP, '--write', '--root', rootR], { encoding: 'utf8', timeout: 20 * 60 * 1000,
      env: { ...process.env, BUMP_PARITY: '', BUMP_PARITY_BRIDGE: real, BUMP_PARITY_HOME: path.join(tmp, 'real_home'), BUMP_TOUCH_BASE: REPO } });   // the repo as base: this row judges the bridge
    rr.out = rr.stdout + rr.stderr; rr.code = rr.status;
    const pageHasR = v => fs.readFileSync(path.join(rootR, 'erp/idempiere.html'), 'utf8').includes(`${em[1]}?v=${v}"`);
    const nv = +field(rr.out, 'verdicts');
    check('R-real-bridge-passes-with-todays-known', rr.code === 0 && field(rr.out, 'verdict') === 'PASS' && nv > 0 && field(rr.out, 'cached') === 'N' && pageHasR(V + 1) && field(rr.out, 'scoped') === 'tree',
      `bridge=${real} exit=${rr.code} ${par(rr.out).replace('§BUMP_PARITY ', '')}`);
    rr.out.split('\n').filter(l => l.startsWith('§BUMP_PARITY_RUN ')).forEach(l => console.log(l));
    if (rr.code !== 0) console.log(rr.out.split('\n').slice(0, 20).join('\n'));
  } else console.log('§BUMP_PARITY_W R-real-bridge SKIPPED (opt-in: BUMP_PARITY_REAL=1; ~70 s, writes throwaway clients to the pilot)');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
const verdict = !judged ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS';
console.log(`§BUMP_PARITY_W_VERDICT ${verdict} judged=${judged} failed=${fails} real_row=${process.env.BUMP_PARITY_REAL === '1' ? 'run' : 'skipped'}`);
process.exit(verdict === 'PASS' ? 0 : 1);
