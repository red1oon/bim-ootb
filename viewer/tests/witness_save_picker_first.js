#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §SAVE_PICKER_FIRST (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md; user 2026-10-09: "it should let me choose where to save to. It seems to auto save now"). Read the log after every run.
// ISSUE PROVEN/DISPROVEN: Save must open the native Save-As picker WHILE the click's user activation is still live (before the slow export), else the browser throws
// SecurityError and the code silently downloads into ~/Downloads. A real Chrome picker cannot be driven headless, so showSaveFilePicker is STUBBED and records
// (a) navigator.userActivation.isActive at the moment it is called (real puppeteer click = real gesture), (b) whether the export had already started, (c) bytes written.
//  (1) picker called BEFORE _exportBuildingDb (order) and with userActivation.isActive == true;
//  (2) bytes written to the chosen handle == the exported bytes; NO <a download> fallback was clicked;
//  (3) user cancels (AbortError): export never runs, nothing downloaded;
//  (4) VACUOUS guard: picker never called -> INCONCLUSIVE.
// Env: ROOT (old checkout for the RED run) · BLD_DIR · NAME · PORT · LOG
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const DIR = process.env.BLD_DIR || path.join(os.homedir(), 'Downloads', 'JALAN JELAPANG IFC'), NAME = process.env.NAME || 'CivilWorksPath';
const PORT = +(process.env.PORT || 8630), LOG = process.env.LOG || '/tmp/witness_save_picker_first.log';
const out = []; const log = l => { out.push(l); console.log(l); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css' };
const srv = http.createServer((q, r) => { try { const u = decodeURIComponent(q.url.split('?')[0]); let fp = path.join(ROOT, u); if (u.startsWith('/buildings/')) fp = path.join(DIR, u.slice(11));
  if (!fs.existsSync(fp)) { const a = path.join('/home/red1/bim-ootb', u); if (fs.existsSync(a)) fp = a; else { r.writeHead(404); r.end(); return; } }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Content-Length': fs.statSync(fp).size }); fs.createReadStream(fp).pipe(r); } catch (e) { r.writeHead(500); r.end(); } });
const sl = ms => new Promise(r => setTimeout(r, ms));
(async () => { await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
  const b = await puppeteer.launch({ headless: true, userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'wsp-')), protocolTimeout: 1800000,
    env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }),
    args: ['--no-sandbox', '--js-flags=--max-old-space-size=8192', '--use-angle=gl-egl', '--ignore-gpu-blocklist'] });
  const fin = (c) => { fs.writeFileSync(LOG, out.join('\n') + '\n'); b.close().catch(() => {}); srv.close(); process.exit(c); };
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800 });
  p.on('console', m => { const t = m.text(); if (/§SAVE_|§VERT_WELD_SAVE|§MESH_SLIM_SAVE/.test(t)) log('  [con] ' + t.slice(0, 200)); });
  await p.goto(`http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${NAME}.db`, { waitUntil: 'domcontentloaded', timeout: 900000 });
  let ok = false; for (let i = 0; i < 1200 && !ok; i++) { await sl(500); try { ok = await p.evaluate(() => !!(window.APP && APP.db && APP.streaming === false && APP.scene && APP.collectMeshes(o => o.isMesh).length > 0)); } catch (e) {} }
  if (!ok) { log('§SAVE_PICKER_FIRST verdict=INCONCLUSIVE (model never ready)'); return fin(2); }
  await sl(3000);
  await p.evaluate(() => { const A = APP; window.__rec = { pickerAt: null, userActive: null, exportAt: null, written: 0, exported: 0, downloads: 0, mode: 'pick' };
    const oe = A._exportBuildingDb; A._exportBuildingDb = function () { __rec.exportAt = performance.now(); const r = oe.apply(this, arguments); __rec.exported = r ? r.byteLength : 0; return r; };
    window.showSaveFilePicker = async function (o) { __rec.pickerAt = performance.now(); __rec.userActive = navigator.userActivation.isActive; __rec.exportStartedBefore = __rec.exportAt != null;
      if (__rec.mode === 'cancel') { const e = new Error('cancel'); e.name = 'AbortError'; throw e; }
      return { name: o.suggestedName, createWritable: async () => ({ write: async (bl) => { __rec.written = bl.size; }, close: async () => {} }) }; };
    const oc = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) __rec.downloads++; return oc.apply(this, arguments); };
    const btn = document.createElement('button'); btn.id = '__savebtn'; btn.textContent = 'save'; btn.style.cssText = 'position:fixed;top:5px;left:5px;z-index:999999;width:80px;height:30px'; btn.onclick = () => { A.saveModelDb(); }; document.body.appendChild(btn); });
  await p.click('#__savebtn'); await sl(500);
  let R = null; for (let i = 0; i < 240; i++) { await sl(1000); R = await p.evaluate(() => JSON.parse(JSON.stringify(__rec))); if (R.written || R.downloads) break; }
  log('§SAVE_PICKER_FIRST pick-run ' + JSON.stringify(R));
  await p.evaluate(() => { window.__rec = { pickerAt: null, userActive: null, exportAt: null, written: 0, exported: 0, downloads: 0, mode: 'cancel' }; });
  await p.click('#__savebtn'); await sl(4000); const C = await p.evaluate(() => JSON.parse(JSON.stringify(__rec)));
  log('§SAVE_PICKER_FIRST cancel-run ' + JSON.stringify(C));
  if (R.pickerAt == null) { log('§SAVE_PICKER_FIRST verdict=INCONCLUSIVE (picker never called — VACUOUS)'); return fin(2); }
  const c1 = R.exportAt != null && R.pickerAt < R.exportAt && R.exportStartedBefore === false && R.userActive === true, c2 = R.written > 0 && R.written === R.exported && R.downloads === 0, c3 = C.exportAt == null && C.downloads === 0 && C.written === 0;
  log('§SAVE_PICKER_FIRST pickerBeforeExport+gestureLive=' + c1 + ' (pickerAt=' + (R.pickerAt | 0) + ' exportAt=' + (R.exportAt | 0) + ' userActive=' + R.userActive + ') writtenEqualsExported=' + c2 + ' (' + R.written + '/' + R.exported + ' downloads=' + R.downloads + ') cancelDoesNothing=' + c3);
  const pass = c1 && c2 && c3; log('§SAVE_PICKER_FIRST verdict=' + (pass ? 'PASS' : 'FAIL')); fin(pass ? 0 : 1); })();
