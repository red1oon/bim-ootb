// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser WIRING §-witness for FRONTEND_LANE_MASTER.md §OUTSTANDING item 0 (BLUE FUTURE) browser
//   legs. VALUE correctness of the ENGINE is headless (scripts/poc_blue_future.js 9/9). This proves the LIVE
//   idempiere.html page wires the SKIN over it:
//   (1) blue_future.js loaded → window.BlueFuture.{enter,acceptUpTo,discardAll,readBranch,groupMeta} present;
//   (2) SEAMS: groupMeta()/readBranch() return {} / null official, {branch_id} / branch in blue mode;
//   (3) LEG 4 SAFETY: a blue op is INVISIBLE to the official read-sites (listTip/readTip/tipValues no-branch)
//       but VISIBLE to the blue VIEW (same calls WITH the branch) — proving the raw-SELECT leak is closed;
//   (4) LEG 2 treatment: enter → body.blue-future + #blue-banner shown + blue rim CSS rule + #blue-rail shows;
//       the @media print UNOFFICIAL watermark rule exists; stampExport prefixes UNOFFICIAL only while blue;
//   (5) LEG 1 gestures: enter via the controller → blue commit appears as a group dot → acceptUpTo turns it
//       official (now visible to official reads) and remaining=0 exits blue; discardAll(true) folds blue away;
//   (6) LEG 3 zoom: a blue CREATE_DOCUMENT child resolves via BlueFuture.zoomChildren(source);
//   (7) 0 pageerrors.
//   §-log first — READ tests/poc_blue_future_live.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_blue_future_live.js   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/idempiere.html';
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));

  await page.goto(`http://localhost:${port}/idempiere.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  let pass = 0, fail = 0;
  const ok = (label, cond, extra) => { console.log('   ' + (cond ? '🟢' : '🔴') + ' ' + label + (extra ? ' — ' + extra : '')); cond ? pass++ : fail++; };

  // (1) controller loaded
  const api = await page.evaluate(() => ({
    bf: !!window.BlueFuture,
    enter: !!(window.BlueFuture && typeof window.BlueFuture.enter === 'function'),
    accept: !!(window.BlueFuture && typeof window.BlueFuture.acceptUpTo === 'function'),
    discard: !!(window.BlueFuture && typeof window.BlueFuture.discardAll === 'function'),
    seams: !!(window.BlueFuture && typeof window.BlueFuture.readBranch === 'function' && typeof window.BlueFuture.groupMeta === 'function')
  }));
  ok('blue_future.js loaded: BlueFuture.enter/acceptUpTo/discardAll + seams present', api.bf && api.enter && api.accept && api.discard && api.seams, JSON.stringify(api));

  // (2) seams official default
  const seam0 = await page.evaluate(() => ({ rb: window.BlueFuture.readBranch(), gm: window.BlueFuture.groupMeta(), blue: window.BlueFuture.isBlue() }));
  ok('SEAMS official default: readBranch()=null, groupMeta()={}, isBlue()=false',
     seam0.rb === null && JSON.stringify(seam0.gm) === '{}' && seam0.blue === false, JSON.stringify(seam0));

  // (3) LEG 4 SAFETY — blue op invisible to official read-sites, visible to the blue VIEW.
  const leg4 = await page.evaluate(async () => {
    function side() { return new Promise(res => window.__crud.withSidecar(d => res(d))); }
    const db = await side(); if (!db) return { err: 'no sidecar' };
    const K = window.KernelOps, C = window.__crud.core;
    // BLUE ops only (branch 'probe-branch'): a create (new row id=2) + an update + a SET_STATUS on id=1.
    // Empty baseline → official reads must surface NONE of these; the blue VIEW must surface all.
    await K.commitGroup(db, [{ op_type: 'CRUD_CREATE', params: { table: 'bf_demo', key: 'bf_demo',
      fields: { Bf_Demo_ID: 2, Name: 'blue' } } }], { gid: 'bf-blue', baseTs: 1700000001000, branch_id: 'probe-branch' });
    await K.commitGroup(db, [{ op_type: 'CRUD_UPDATE', params: { table: 'bf_demo', id: 1,
      changes: { Name: { old: 'official', 'new': 'blue-edit' } }, actor: 'a' } }], { gid: 'bf-blue-u', baseTs: 1700000002000, branch_id: 'probe-branch' });
    await K.commitGroup(db, [{ op_type: 'SET_STATUS', params: { table: 'bf_demo', id: 1, to: 'CO' } }],
      { gid: 'bf-blue-s', baseTs: 1700000003000, branch_id: 'probe-branch' });

    const offList = C.listTip(db, 'bf_demo', 'Bf_Demo_ID', []);                       // no branch → official
    const blueList = C.listTip(db, 'bf_demo', 'Bf_Demo_ID', [], 'probe-branch');      // blue VIEW
    const offTip = C.tipValues(db, 'bf_demo', 1);                 // official field tip (should NOT see blue-edit)
    const blueTip = C.tipValues(db, 'bf_demo', 1, 'probe-branch');
    const offStatus = C.readTip(db, 'bf_demo', 1);               // official docstatus (should be null — blue CO hidden)
    const blueStatus = C.readTip(db, 'bf_demo', 1, 'probe-branch');
    return {
      offRows: offList.rows.length, offHasBlue: offList.rows.some(r => r.Name === 'blue'),
      blueRows: blueList.rows.length, blueHasBlue: blueList.rows.some(r => r.Name === 'blue'),
      offName: offTip.Name || null, blueName: blueTip.Name || null,
      offStatus: offStatus, blueStatus: blueStatus
    };
  });
  ok('LEG 4 listTip: official EXCLUDES blue create (0 rows), blue VIEW INCLUDES it (1 row)',
     leg4 && leg4.offRows === 0 && !leg4.offHasBlue && leg4.blueRows === 1 && leg4.blueHasBlue, JSON.stringify(leg4));
  ok('LEG 4 tipValues: official field unchanged, blue VIEW sees the blue edit',
     leg4 && leg4.offName == null && leg4.blueName === 'blue-edit', 'off=' + (leg4 && leg4.offName) + ' blue=' + (leg4 && leg4.blueName));
  ok('LEG 4 readTip: official docstatus NULL (blue CO hidden), blue VIEW = CO',
     leg4 && leg4.offStatus == null && leg4.blueStatus === 'CO', 'off=' + (leg4 && leg4.offStatus) + ' blue=' + (leg4 && leg4.blueStatus));

  // (4) LEG 2 treatment — enter blue, assert the UNOFFICIAL skin mounts.
  const treat = await page.evaluate(() => {
    window.BlueFuture.enter();
    const banner = document.getElementById('blue-banner');
    const rail = document.getElementById('blue-rail');
    const styleTxt = (document.getElementById('blue-future-style') || {}).textContent || '';
    return {
      bodyClass: document.body.classList.contains('blue-future'),
      bannerShown: !!(banner && banner.style.display !== 'none' && /UNOFFICIAL/.test(banner.textContent)),
      railShown: !!(rail && rail.classList.contains('blue')),
      rimRule: /box-shadow:\s*inset 0 0 0 3px rgba\(108,159,255/.test(styleTxt),
      printWatermark: /@media print[\s\S]*UNOFFICIAL/.test(styleTxt),
      stampBlue: window.BlueFuture.stampExport('invoice.xlsx'),
      seamBlue: { rb: window.BlueFuture.readBranch(), gm: window.BlueFuture.groupMeta() }
    };
  });
  ok('LEG 2: enter → body.blue-future + UNOFFICIAL banner shown + blue rail',
     treat.bodyClass && treat.bannerShown && treat.railShown, JSON.stringify({bodyClass:treat.bodyClass,banner:treat.bannerShown,rail:treat.railShown}));
  ok('LEG 2: pervasive blue rim CSS rule present + @media print UNOFFICIAL watermark rule present',
     treat.rimRule && treat.printWatermark, 'rim=' + treat.rimRule + ' print=' + treat.printWatermark);
  ok('LEG 2/5: stampExport prefixes UNOFFICIAL- while blue', treat.stampBlue === 'UNOFFICIAL-invoice.xlsx', treat.stampBlue);
  ok('SEAMS in blue: readBranch()=branch, groupMeta()={branch_id}',
     treat.seamBlue.rb && treat.seamBlue.gm && treat.seamBlue.gm.branch_id === treat.seamBlue.rb, JSON.stringify(treat.seamBlue));

  // (5) LEG 1 — a blue commit (via the live seam groupMeta) becomes a group dot; acceptUpTo turns it official.
  const leg1 = await page.evaluate(async () => {
    const db = window.__crud.kernelDb(), K = window.KernelOps, C = window.__crud.core;
    const branch = window.BlueFuture.readBranch();
    // commit a NEW blue create on this session branch using the WRITE seam (groupMeta()).
    await K.commitGroup(db, [{ op_type: 'CRUD_CREATE', params: { table: 'bf_live', key: 'bf_live',
      fields: { Bf_Live_ID: 9, Name: 'spec' } } }], Object.assign({ gid: 'bf-live-1', baseTs: 1700000010000 }, window.BlueFuture.groupMeta()));
    const groupsBefore = window.BlueFuture.groups().length;
    const offBefore = C.listTip(db, 'bf_live', 'Bf_Live_ID', []).rows.length;          // official: should be 0
    const maxId = window.BlueFuture.groups().slice(-1)[0].maxId;
    const acc = await window.BlueFuture.acceptUpTo(maxId);
    const offAfter = C.listTip(db, 'bf_live', 'Bf_Live_ID', []).rows.length;           // official: now 1 (accepted)
    return { branch: branch, groupsBefore: groupsBefore, offBefore: offBefore,
             accepted: acc && acc.accepted, remaining: acc && acc.remaining, chainOk: acc && acc.chain && acc.chain.ok,
             offAfter: offAfter, blueAfterAccept: window.BlueFuture.isBlue() };
  });
  ok('LEG 1 blue commit invisible to official (0 rows) but is a group dot',
     leg1 && leg1.groupsBefore >= 1 && leg1.offBefore === 0, JSON.stringify({groups:leg1.groupsBefore, offBefore:leg1.offBefore}));
  ok('LEG 1 acceptUpTo → op turns official (1 row), chain OK, remaining=0 → exits blue',
     leg1 && leg1.accepted === 1 && leg1.offAfter === 1 && leg1.chainOk && leg1.remaining === 0 && leg1.blueAfterAccept === false, JSON.stringify(leg1));

  // (6) LEG 3 zoom + discardAll — re-enter, commit a blue CREATE_DOCUMENT child, zoom it, then discard.
  const leg3 = await page.evaluate(async () => {
    const db = window.__crud.kernelDb(), K = window.KernelOps;
    window.BlueFuture.enter();
    await K.commitGroup(db, [{ op_type: 'CREATE_DOCUMENT', params: { table: 'M_InOut', source_id: 7001, id: 555 } }],
      Object.assign({ gid: 'bf-ship', baseTs: 1700000020000 }, window.BlueFuture.groupMeta()));
    const kids = window.BlueFuture.zoomChildren(null, 7001).map(k => k.table);
    const branchOpsBefore = window.KernelOps.branchOps(db, window.BlueFuture.branchId()).length;
    const dis = window.BlueFuture.discardAll(true);   // skip confirm
    const branchOpsAfter = window.KernelOps.branchOps(db, window.BlueFuture.branchId ? window.BlueFuture.branchId() : null);
    return { kids: kids, branchOpsBefore: branchOpsBefore, discarded: dis && dis.discarded,
             blueAfter: window.BlueFuture.isBlue() };
  });
  ok('LEG 3 zoom resolves the blue child (M_InOut) of the source record',
     leg3 && leg3.kids.indexOf('M_InOut') >= 0, JSON.stringify(leg3.kids));
  ok('LEG 1 discardAll folds blue away (≥1 discarded) and exits blue',
     leg3 && leg3.discarded >= 1 && leg3.blueAfter === false, JSON.stringify({discarded:leg3.discarded, blue:leg3.blueAfter}));

  // (7) no page errors
  ok('0 pageerrors', errs.length === 0, errs.length ? errs.join(' | ') : '');

  const bfLoaded = logs.some(l => /§BLUE_FUTURE_LOADED v1/.test(l));
  ok('§BLUE_FUTURE_LOADED v1 logged at boot', bfLoaded);

  console.log('\n' + (fail === 0 ? '✅' : '❌') + ' W-BLUE-FUTURE-LIVE: ' + pass + '/' + (pass + fail) + ' PASS (' + fail + ' FAIL)');
  await browser.close(); server.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); server.close(); process.exit(1); });
