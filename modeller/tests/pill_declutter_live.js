// W-PILL-DECLUTTER — DAGeVu modeller: the redundant Undo/Redo + Wall/Opening pill buttons are removed (the history
// scrubber is the visible retreat; Sketch+Insert are the real authoring paths). Undo/Redo survive as Ctrl+Z / Ctrl+⇧Z
// keyboard verbs and a ? help-panel row. Wiring check (DOM presence + functional keyboard undo + help content).
const http = require('http'), fs = require('fs'), path = require('path');
const VIEWER = path.join(__dirname, '..');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm',
  '.json': 'application/json', '.css': 'text/css', '.map': 'application/json' };
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
  let pageErr = null; pg.on('pageerror', e => { pageErr = String(e).slice(0, 160); console.log('  ERR ' + pageErr); });
  await pg.goto(`http://localhost:${port}/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction("window.Bonsai && window.Bonsai.library && window.Bonsai.library.ready && window.Bonsai.oplog", { timeout: 30000 }).catch(() => {});
  await pg.evaluate(() => window.Bonsai.library.ready());

  const r = await pg.evaluate(async () => {
    const out = {}; const O = window.Bonsai.oplog, L = window.Bonsai.library;
    const has = id => !!document.getElementById(id);
    out.removed = { wall: has('b-wall'), open: has('b-open'), undo: has('b-undo'), redo: has('b-redo') };  // all should be false
    out.survivors = { del: has('b-del'), insert: has('b-insert'), clear: has('b-clear'), ifc: has('b-ifc') };  // all true
    // functional Ctrl+Z: commit one insert via the real path, then fire the keyboard verb → active length drops
    O.clear();
    const hash = L.catalog().find(c => c.ifc_class === 'IfcDoor').hash;
    await O.commit({ op_type: 'GEOM_INSERT', parameters: { hash, placement: { x: 1, y: 1, z: 0, rot: 0 }, lod: '200' } });
    out.afterCommit = O.length;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    for (let i = 0; i < 40 && O.length === out.afterCommit; i++) await new Promise(r => setTimeout(r, 25));
    out.afterUndo = O.length;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true }));  // redo
    for (let i = 0; i < 40 && O.length === out.afterUndo; i++) await new Promise(r => setTimeout(r, 25));
    out.afterRedo = O.length;
    // help panel lists Undo/Redo with their shortcut
    const help = document.getElementById('m-help'); if (help) help.click();
    const hp = document.getElementById('m-help-panel');
    const htext = hp ? hp.innerHTML : '';
    out.helpHasUndo = /Undo/.test(htext) && /Ctrl\+Z/.test(htext);
    out.helpHasRedo = /Redo/.test(htext) && /Ctrl\+⇧Z/.test(htext);
    out.helpNoWallOpening = !/>Wall<|>Opening</.test(htext);
    return out;
  });

  await br.close(); server.close();
  console.log('  §PILL ' + JSON.stringify(r));
  const checks = {
    noPageError:   pageErr === null,
    wallGone:      r.removed.wall === false,
    openGone:      r.removed.open === false,
    undoBtnGone:   r.removed.undo === false,
    redoBtnGone:   r.removed.redo === false,
    delKept:       r.survivors.del === true,
    insertKept:    r.survivors.insert === true,
    committed:     r.afterCommit === 1,
    ctrlZUndoes:   r.afterUndo === 0,              // keyboard undo still works with no button
    ctrlShiftZRedoes: r.afterRedo === 1,           // keyboard redo still works
    helpListsUndo: r.helpHasUndo === true,
    helpListsRedo: r.helpHasRedo === true,
    helpClean:     r.helpNoWallOpening === true
  };
  const pass = Object.values(checks).every(Boolean);
  console.log('  §PILL VERDICT ' + (pass ? 'PASS' : 'FAIL') + ' — ' +
    Object.entries(checks).map(([k, v]) => k + '=' + v).join(' '));
  process.exit(pass ? 0 : 1);
})().catch(e => { console.log('FATAL ' + e); process.exit(1); });
