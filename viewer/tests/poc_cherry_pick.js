// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-module §-witness for HISTORY_PARALLEL_TIMELINE.md PR #6 — the MODEL cherry-pick half of
//        cross-branch "bring into current ⤵" (the one piece that was WIRED but not live-witnessed).
//   PROVES (issue: "a signed model op on a sibling branch can be grafted onto the current branch via the
//            real kernel-op path, the chain still verifies, and BOTH universes stay intact — no 3-way merge"):
//     1. commit GRID_MOVE op0 (fork base) + A1 (the op to graft) → A1 is a tip.
//     2. fork: undo back to op0, commit B1 → a SECOND universe (A1 NOT wiped — fork-don't-wipe).
//     3. standing on B, combineFromId(A1.seq) → §HIST_COMBINE mode=cherry-pick ok=true → KernelOps.commitOp
//        replays A1's signed move onto B: kernel_ops gains exactly ONE row = A1's params, undone=0.
//     4. verifyChain ok=true AFTER the graft (the replay is freshly signed + chained — tamper-evident).
//     5. tips()==2 (A1 intact + the B-graft tip); the tree shows op0 forking into two universes.
//   §-log first — READ tests/poc_cherry_pick.log before any conclusion (exit code is NOT evidence).
// Run:  node viewer/tests/poc_cherry_pick.js 2>&1 | tee viewer/tests/poc_cherry_pick.log   (cwd = bim-ootb)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..', '..');   // bim-ootb root → ../lib + ../../common resolve
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.wasm':'application/wasm', '.css':'text/css' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const logs = [], errs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));

  await page.goto(`http://localhost:${port}/viewer/tests/cherry_harness.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.__ready);
  await page.waitForTimeout(300);

  const out = await page.evaluate(async () => {
    const UH = window.UniversalHistory, KO = window.KernelOps, db = window.A.db;
    const rows = () => { const r = db.exec("SELECT op_type, parameters, undone FROM kernel_ops ORDER BY id"); return r.length ? r[0].values : []; };
    UH.setEnabled(true); UH.setDepth('max');

    // 1. fork base op0 + A1 (the op we will graft)
    KO.commitOp(db, 'GRID_MOVE', { axis: 'X', label: '1', from: 0, to: 1000, cascade: [] });
    KO.commitOp(db, 'GRID_MOVE', { axis: 'X', label: '3', from: 1000, to: 3000, cascade: [] });
    const a1seq = UH.tips()[0].id;                  // linear so far → A1 is the only tip

    // 2. fork branch B: undo back to op0 (A1 must SURVIVE — fork-don't-wipe), then commit B1
    UH.undo();
    KO.commitOp(db, 'GRID_MOVE', { axis: 'Y', label: 'A', from: 0, to: 500, cascade: [] });
    const tipsAfterFork = UH.tips().length;         // expect 2: A1 + B1
    UH.dumpTree();

    // 3. standing on B, bring A1 into current → MODEL cherry-pick
    const rowsBefore = rows().length;
    const found = UH.combineFromId(a1seq);
    const after = rows();
    const rowsDelta = after.length - rowsBefore;
    const last = after[after.length - 1];           // [op_type, parameters, undone]
    let lastTo = null; try { lastTo = JSON.parse(last[1]).to; } catch (e) {}

    // 4. chain still verifies after the graft — seal THEN verify, exactly as the adapter's afterApply
    //    (_chainCheck) does: commitOp's sealChain is async + the fork-undo flipped `undone`, so re-seal first.
    await KO.sealChain(db);
    const chain = await KO.verifyChain(db);
    UH.dumpTree();
    const tipsAfterGraft = UH.tips().length;        // expect 2: A1 (intact) + B-graft tip

    return {
      a1seq: a1seq, found: found, tipsAfterFork: tipsAfterFork, tipsAfterGraft: tipsAfterGraft,
      rowsDelta: rowsDelta, lastType: last && last[0], lastTo: lastTo, lastUndone: last && last[2],
      chainOk: !!(chain && chain.ok), chainLen: chain && chain.len, totalRows: after.length
    };
  });

  const cherryLog = logs.filter(l => /§HIST_COMBINE mode=cherry-pick/.test(l)).join(' || ') || '(no cherry log)';
  const treeLogs = logs.filter(l => /§PROOF tree=/.test(l));
  console.log('§CHERRY combineLog=' + cherryLog);
  treeLogs.forEach(t => console.log('§CHERRY ' + t));
  console.log('§CHERRY-STATE ' + JSON.stringify(out));

  const cherryOk = /ok=true/.test(cherryLog);
  const graftLanded = out.rowsDelta === 1 && out.lastType === 'GRID_MOVE' && out.lastTo === 3000 && String(out.lastUndone) === '0';
  const branchesIntact = out.tipsAfterFork === 2 && out.tipsAfterGraft === 2;
  const forkedTree = treeLogs.some(t => /\|/.test(t));   // a '|' in the tree shape = a real fork (two universes)

  const pass = out.found && cherryOk && graftLanded && branchesIntact && out.chainOk && forkedTree && errs.length === 0;
  console.log('§CHERRY-RESULT ' + (pass ? 'PASS' : 'FAIL') +
    ' found=' + out.found + ' cherryOk=' + cherryOk + ' graftLanded=' + graftLanded +
    ' (rowsDelta=' + out.rowsDelta + ' lastTo=' + out.lastTo + ' undone=' + out.lastUndone + ')' +
    ' branchesIntact=' + branchesIntact + ' chainOk=' + out.chainOk + ' forkedTree=' + forkedTree +
    ' noErr=' + (errs.length ? errs.join('|') : true));

  await browser.close();
  server.close();
  process.exit(pass ? 0 : 1);
})();
