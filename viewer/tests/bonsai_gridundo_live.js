// W-GRIDMOVE-UNDO — grid-undo correctness witness (M1; MODELLER_DIRECT_MANIPULATION.md §0-RESULTS TIER 2).
// CLAIM: the authoring gridline position is now a FOLD of the op-log (defined base + the delta of every ACTIVE
// GEOM_GRID_MOVE) — so committing a grid drag advances the line, UNDO reverts it, REDO re-applies it, and SCRUB to
// before the move shows the base line, with snap() always targeting the correct (current) gridline. Previously
// bonsai_gridmove.commit mutated grid.xs imperatively and undo never reverted it → the next snap used a stale line.
const http = require('http'), fs = require('fs'), path = require('path');
const VIEWER = path.join('/tmp/wt-gridundo', 'viewer');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.map': 'application/json' };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller.html';
  fs.readFile(path.join(VIEWER, p), (e, b) => {
    if (e) { r.writeHead(404); r.end('404 ' + p); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b);
  });
});
(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage();
  pg.on('console', m => { const t = m.text(); if (/^§(OPLOG|MODELLER|GRIDMOVE|GRID|BONSAI)/.test(t)) console.log('  ' + t); });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 300)));
  await pg.goto(`http://localhost:${port}/modeller.html?gridundo=demo`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__gridundoDone === true', { timeout: 120000 })
    .catch(() => console.log('  ✗ timeout waiting for __gridundoDone'));

  const x = await pg.evaluate(() => window.__gridundoResult || {}).catch(e => ({ error: String(e) }));
  await br.close(); server.close();

  console.log('  §GRIDUNDO base.x1=' + x.baseX1 + ' afterMove.x1=' + x.afterMoveX1 + ' gridMoveOps=' + x.gridMoveOps +
    ' snapMovedAfterMove=' + x.snapMovedAfterMove + ' verifyAfterMove=' + x.verifyAfterMove);
  console.log('  §GRIDUNDO scrubBack.x1=' + x.scrubBackX1 + ' snapBaseAfterScrub=' + x.snapBaseAfterScrub +
    ' scrubFwd.x1=' + x.scrubFwdX1);
  console.log('  §GRIDUNDO undoId=' + x.undoId + ' afterUndo.x1=' + x.afterUndoX1 + ' gridMoveOpsAfterUndo=' +
    x.gridMoveOpsAfterUndo + ' snapBaseAfterUndo=' + x.snapBaseAfterUndo + ' snapMovedAfterUndo=' + x.snapMovedAfterUndo +
    ' verifyAfterUndo=' + x.verifyAfterUndo);
  console.log('  §GRIDUNDO redoId=' + x.redoId + ' afterRedo.x1=' + x.afterRedoX1 + ' snapMovedAfterRedo=' +
    x.snapMovedAfterRedo + (x.error ? '  ERROR=' + x.error : ''));

  const moved = x.baseX1 === 2 && x.afterMoveX1 === 3 && x.gridMoveOps === 1 && x.snapMovedAfterMove === 3 && x.verifyAfterMove === true;
  const scrubReverts = x.scrubBackX1 === 2 && x.snapBaseAfterScrub === 2 && x.scrubFwdX1 === 3;        // grid follows the scrub both ways
  const undoReverts = x.undoId != null && x.afterUndoX1 === 2 && x.gridMoveOpsAfterUndo === 0 &&
    x.snapBaseAfterUndo === 2 && x.snapMovedAfterUndo !== 3 && x.verifyAfterUndo === true;             // THE FIX: line + snap revert
  const redoReapplies = x.redoId != null && x.afterRedoX1 === 3 && x.snapMovedAfterRedo === 3;

  const pass = moved && scrubReverts && undoReverts && redoReapplies;
  console.log('  §GRIDUNDO VERDICT ' + (pass ? 'PASS' : 'FAIL') +
    ' — moved=' + moved + ' scrubReverts=' + scrubReverts + ' undoReverts=' + undoReverts + ' redoReapplies=' + redoReapplies);
  console.log('── W-GRIDMOVE-UNDO ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
