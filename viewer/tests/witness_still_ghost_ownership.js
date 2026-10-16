// ⚠ DO NOT REMOVE — witness for §STILL_GHOST_OWNERSHIP (bim-compiler PHOTOREAL_STILL_RENDER.md). Read the log.
// Issue: on red1's URL (OCI Hospital + &ghost=1) the deferred ghost-shell build fired MID-Alt+S (set off by §STILL_ROOMS'
// lazy navigate load): the still rendered 41 meshes of ghost boxes. Proves: during the still visible meshes ~ full and no
// §SHELL_GHOST_AUTO / §SHELL_GHOST_BBOX before exit; after Esc the held build runs. Also arm 2: ghost already shown before
// the press -> suspended for the still, restored after. Real GPU, clean profile. Usage: node ... <port>
/* global Buffer */
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms)); const T0 = Date.now(); const say = s => console.log('+' + ((Date.now() - T0) / 1000).toFixed(1) + 's ' + s);
const PORT = +(process.argv[2] || 8600);
(async () => { const b = await puppeteer.launch({ headless: true, protocolTimeout: 900000, env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }), args: ['--no-sandbox', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] });
  const p = await b.newPage(); await p.setViewport({ width: 1666, height: 864 }); let errs = 0; const L = [];
  p.on('console', m => { const t = m.text(); L.push(t); if (/§STILL_GHOST|§SHELL_GHOST|§GHOST_XRAY|§STILL_LOCK|§STILL_REFINE (done|cancelled)|§GI_STILL result|Uncaught|Shader Error/.test(t)) say('[page] ' + t.slice(0, 170)); });
  p.on('pageerror', e => { errs++; say('PAGEERROR ' + e.message); });
  const OCI = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb/o/buildings/Hospital_extracted.db';
  await p.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=' + encodeURIComponent(OCI) + '&ghost=1', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.APP && window.APP.guidMap, { timeout: 240000 });
  let n = -1, st = 0; for (let i = 0; i < 200 && st < 3; i++) { await sleep(2000); const s = await p.evaluate(() => ({ n: Object.keys(window.APP.guidMap).length, s: !!window.APP.streaming })); if (!s.s && s.n > 0 && s.n === n) st++; else st = 0; n = s.n; }
  const vis = () => p.evaluate(() => { let v = 0; window.APP.scene.traverse(o => { if ((o.isMesh || o.isInstancedMesh || o.isBatchedMesh) && o.visible) v++; }); return v; });
  say('loaded ' + n + ' visibleMeshes=' + await vis() + ' ghostOn=' + await p.evaluate(() => !!(window.ghostXrayOn && window.ghostXrayOn())));
  // ARM 1: first Alt+S (this is what lazy-loads navigate and would arm the auto-ghost)
  const b1 = L.length; await p.keyboard.down('Alt'); await p.keyboard.press('s'); await p.keyboard.up('Alt');
  for (let i = 0; i < 300 && !L.slice(b1).some(t => /§GI_STILL result|§GI_STILL_OFF/.test(t)); i++) await sleep(1000);
  await sleep(4000);
  const during = await vis(); const ghostDuring = L.slice(b1).some(t => /§SHELL_GHOST_(AUTO|BBOX)/.test(t));
  say('ARM1 during still: visibleMeshes=' + during + ' shellGhostFiredDuringStill=' + ghostDuring);
  await p.keyboard.press('Escape'); for (let i = 0; i < 30 && !L.some(t => /§SHELL_GHOST_BBOX/.test(t)); i++) await sleep(1000);
  say('ARM1 after Esc: shellGhostBuilt=' + L.some(t => /§SHELL_GHOST_BBOX/.test(t)) + ' ghostOn=' + await p.evaluate(() => !!(window.ghostXrayOn && window.ghostXrayOn())) + ' visibleMeshes=' + await vis());
  // ARM 2: ghost shown before the press -> suspended during, restored after
  await sleep(2000); const b2 = L.length; await p.keyboard.down('Alt'); await p.keyboard.press('s'); await p.keyboard.up('Alt');
  for (let i = 0; i < 300 && !L.slice(b2).some(t => /§GI_STILL result|§GI_STILL_OFF/.test(t)); i++) await sleep(1000);
  await sleep(2000);
  say('ARM2 during still: visibleMeshes=' + await vis() + ' ghostOn=' + await p.evaluate(() => !!(window.ghostXrayOn && window.ghostXrayOn())));
  await p.keyboard.press('Escape'); await sleep(2500);
  say('ARM2 after Esc: ghostOn=' + await p.evaluate(() => !!(window.ghostXrayOn && window.ghostXrayOn())) + ' pageErrors=' + errs);
  await b.close(); })().catch(e => { say('FATAL ' + e); process.exit(1); });
