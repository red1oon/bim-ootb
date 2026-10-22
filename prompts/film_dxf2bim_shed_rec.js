#!/usr/bin/env node
// ⚠ DO NOT REMOVE — Scope: prompts/FILM_DXF2BIM_BRICSCAD.md (v3, 2026-10-18: the WHOLE shed, five chapters; lane §L26). LIVE recorder: the real Modeller + Viewer driven with real clicks/typing on the REAL raw sheets (local material, never in the repo),
// recorded with puppeteer's screencast; writes §ERP_FILM_BEAT id=<id> t=<s> per beat (for film_narration_poly.py) and every figure the narration uses as a §FILM_FACT line of THIS run.
// NEUTRAL NAMING: the sheets' title blocks carry a client name; the sheets are never drawn on screen here (panels + 3D bodies only) and every frame is checked after the take.
// v2 (2026-10-18, user: "I see no BricsCAD 2D drawings at all"; "use the Chapter cards which others been using"): the REAL sheets are shown (rendered from the DXF by film_dxf2bim_render_sheets.py with the client's title-block TEXT filtered out), and the film is cut into FOUR chapters with the
// established chapter cards (BIMCompiler film_title_cards.py FILM_SET=bricscad): the recorder logs `§FILM_CHAPTER n=.. key=.. t=..` + `§FILM_BEAT id=.. t=..` and saves one backdrop still per chapter (bd<n>.png + backdrops.txt).
// usage: SHED_SHEETS=<dir> SHEETS_PNG=<dir of floor_plan.png foundation_plan.png south_elevation.png> BEAT_MIN=<json id->min seconds> node film_dxf2bim_bricscad_rec.js <outDir>
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const SH = process.env.SHED_SHEETS || path.join(process.env.HOME, 'Projects/SYSNOVA/DXF2BIM/ShedDrawing/sheets/');
const OUT = path.resolve(process.argv[2] || '.'); fs.mkdirSync(OUT, { recursive: true });
const BEAT_MIN = JSON.parse(fs.readFileSync(process.env.BEAT_MIN, 'utf8')), TOUR_SEC = Number(process.env.TOUR_SEC || 0);   // TOUR_SEC: the length of the spliced Viewer tour (§L31)
const PNG = process.env.SHEETS_PNG || path.join(process.env.HOME, 'Videos/dxf2bim_film_work/shed/sheets_png');
const BCR = process.env.BC_REPO || '/tmp/wt-bc-r2', NM = path.join(process.env.HOME, 'bim-compiler', 'node_modules');   // the extractor with the §L26 metadata + better-sqlite3
const img = n => 'data:image/png;base64,' + fs.readFileSync(path.join(PNG, n + '.png')).toString('base64');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.png': 'image/png', '.svg': 'image/svg+xml', '.bin': 'application/octet-stream', '.webmanifest': 'application/json' };
const DBNAME = 'ShedFilm3_extracted.db', VDB = path.join(ROOT, 'viewer', 'buildings', DBNAME), DBF = path.join(OUT, DBNAME);
const srv = http.createServer((q, s) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html'; const f = path.join(ROOT, p);
  fs.readFile(f, (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port, base = 'http://127.0.0.1:' + port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1920,1080'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  pg.on('console', m => { const t = m.text(); if (/^§|§PROJ_PUSH/.test(t)) console.log(t.slice(0, 300)); });
  pg.on('pageerror', e => console.log('§PAGEERR ' + String(e).slice(0, 300)));
  await pg.goto(base + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.A && window.A.scene', { timeout: 120000 });
  // Frames come from CDP screencast WITH their own timestamps (puppeteer's page.screencast re-times to a fixed fps and drifted 24% from the wall clock): the video is rebuilt from those timestamps, and the beat cues are
  // wall-clock epoch seconds converted to video time against the FIRST frame's timestamp (same epoch base, checked in §FILM_SYNC).
  const FR = path.join(OUT, 'frames'); fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR, { recursive: true });
  const cdp = await pg.createCDPSession(), frames = []; let nf = 0;
  cdp.on('Page.screencastFrame', async ev => { const f = path.join(FR, String(nf++).padStart(6, '0') + '.jpg'); fs.writeFileSync(f, Buffer.from(ev.data, 'base64')); frames.push({ f, ts: ev.metadata.timestamp }); try { await cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }); } catch (e) {} });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  const T0 = Date.now(); const now = () => (Date.now() - T0) / 1000; const beatLog = [], chapLog = [];
  let beatStart = 0, beatId = null;
  const hold = async () => { if (beatId) { const need = (BEAT_MIN[beatId] || 6) + 0.8 - (now() - beatStart); if (need > 0) await sleep(need * 1000); } };
  const beat = async (id) => { await hold(); beatId = id; beatStart = now(); beatLog.push([id, Date.now() / 1000]); };
  // a chapter starts WITH a beat: its backdrop still (dimmed under the card by film_title_cards.py) is taken at that moment, or is a rendered sheet
  const chapter = async (n, key, still) => { chapLog.push([n, key, Date.now() / 1000]); const f = path.join(OUT, 'bd' + n + '.png'); if (still) fs.copyFileSync(path.join(PNG, still + '.png'), f); else await pg.screenshot({ path: f }); };
  const sheetView = (name, cap) => card('<img src="' + img(name) + '" style="max-width:96vw;max-height:88vh;border:1px solid #2c303a"><div style="margin-top:14px;font-size:22px;color:#9aa3b2;letter-spacing:3px">' + cap + '</div>');
  const fact = (k, v) => console.log('§FILM_FACT ' + k + ' ' + (typeof v === 'string' ? v : JSON.stringify(v)));
  const card = async (html) => { await pg.evaluate((h) => { let c = document.getElementById('film-card'); if (!c) { c = document.createElement('div'); c.id = 'film-card'; c.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#14161c;color:#F3EEE8;display:flex;flex-direction:column;align-items:center;justify-content:center;font:28px/1.5 DejaVu Sans,sans-serif;text-align:center;padding:30px'; document.body.appendChild(c); } c.innerHTML = h; c.style.display = 'flex'; }, html); };
  const uncard = () => pg.evaluate(() => { const c = document.getElementById('film-card'); if (c) c.style.display = 'none'; });
  const idle = async () => { await pg.waitForFunction('!window.DxfMetaEditor.state.busy', { timeout: 180000 }); await sleep(900); };
  const acceptAll = async () => { for (let g = 0; g < 3; g++) { const b = await pg.$('#dm-yellows [data-act="acceptall"],#dm-yellows [data-act^="accept"]'); if (!b) break; await b.click(); await idle(); } /* D36: Accept all, or the split pair (stated + read, inferred) */ };
  const typeIn = async (sel, v) => { await pg.click(sel, { clickCount: 3 }); await pg.type(sel, String(v), { delay: 70 }); await pg.keyboard.press('Tab'); await sleep(500); };

  // ---- the settings sheets: the product CLI writes the same marked DXFs the page saves (layers typed, datums, ranges) ----
  const SHEETS8 = ['0_FLOOR_PLAN', '1S_ELEV_SOUTH', '1N_ELEV_NORTH', '2_ELEV_WEST', '7_ELEV_EAST', '3_BEAM_LAYOUT', '4_FOUNDATION_LAYOUT', '8_SECTION_AA_TRUSS', '5_DETAILS'].map(x => SH + x + '.dxf');   // v5 (§L29/§L30): the details sheet joins the set (notes + schedules read, below-grade section from its column schedule, no --default)
  const cliOut = path.join(OUT, 'cli'); fs.rmSync(cliOut, { recursive: true, force: true });
  const cr = cp.spawnSync('node', [path.join(ROOT, 'modeller', 'dxf2bim_cli.js'), '--sheets'].concat(SHEETS8, ['--out', cliOut, '--complete', '--ifc', '--accept-suggestions', '--set', 'SHED', '--level', '0',
    '--datum', '1S_ELEV:0.6096@-4446.6', '--datum', '1N_ELEV:0.6096@-3895.2', '--datum', '2_ELEV:0.6096@-4515.7264', '--datum', '7_ELEV:0.6096@-3766.442', '--datum', '8_SECTION:0.6096@-3726.416',
    '--layer', 'plan:Col=column', '--layer', 'elev:0=column@1S_ELEV', '--layer', 'plan:Fo=footing', '--layer', 'plan:Dim=beam@3_BEAM', '--layer', 'elev:Wall=panel', '--layer', 'elev:Rod=fan', '--layer', 'elev:Dim=net', '--layer', 'plan:Rod=doorswing@0_FLOOR', '--layer', 'section:Fo=bar', '--layer', 'elev:Win=elevdoor',
    '--bodyz', 'footing=-1.4478,-1.143', '--exclude', '3_BEAM:-20880,-5600,-20845,-4950', '--bodyz', 'beam=3.098794,3.352794']), { encoding: 'utf8' });
  fact('cli', ((cr.stdout || '').match(/§CLI result .*/) || [''])[0].replace(/ out=\S+/, ''));
  const marked = fs.readdirSync(path.join(cliOut, 'marked')).sort().map(f => path.join(cliOut, 'marked', f));
  const openFiles = async (files) => { await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
    const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
    await pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict', { timeout: 240000 }); await sleep(1500); };
  const per = (ms, n) => Math.max(1500, Math.floor(ms / n));
  // ---- c1 title ----
  await beat('c1'); await chapter(1, 'open', 'floor_plan');
  await sheetView('floor_plan', '0_FLOOR_PLAN.dxf  ·  rendered from the DXF');
  // ---- d01: the sheets as drawn, then two raw ones into the Modeller ----
  await beat('d01'); const dsl = [['south_elevation', '1S_ELEV_SOUTH.dxf'], ['west_elevation', '2_ELEV_WEST.dxf'], ['beam_layout', '3_BEAM_LAYOUT.dxf'], ['truss_section', '8_SECTION_AA_TRUSS.dxf']];
  for (const [n, f] of dsl) { await sheetView(n, f + '  ·  rendered from the DXF'); await sleep(per(5200, dsl.length)); }
  await uncard(); await sleep(400);
  await openFiles(['0_FLOOR_PLAN.dxf', '1S_ELEV_SOUTH.dxf'].map(n => SH + n));
  await pg.evaluate(() => { if (window.DxfImportUI.setLines) window.DxfImportUI.setLines(false); });
  fact('raw', await pg.evaluate(() => window.DxfMetaEditor.state.sheets.map(s => s.name + ' marks=' + s.marks.length)));
  // ---- o01: only suggestions, yellow ----
  await beat('o01'); await chapter(2, 'meaning');
  fact('suggestions', await pg.evaluate(() => window.DxfMetaEditor.state.sheets.map(s => s.prop.list.map(p => p.rule).join(','))));
  await pg.evaluate(() => { const b = document.getElementById('dm-body'); if (b) b.scrollTop = 0; }); await sleep(800);
  // ---- a01: accept all ----
  await beat('a01'); await sleep(1500); await acceptAll();
  fact('grid+datum', await pg.evaluate(() => { const S = window.DxfMetaEditor.state.sheets; return { elevGridMarks: S[1].marks.filter(x => x.key === 'GRIDH').length, planGridMarks: S[0].marks.filter(x => x.key === 'GRIDX' || x.key === 'GRIDY').length, z: S[1].marks.filter(x => x.key === 'Z').map(x => x.value + '@y' + x.y) }; }));
  await pg.evaluate(() => { const e = [...document.querySelectorAll('#dm-panel .dm-sub')].find(x => /GRID/i.test(x.textContent)); if (e) e.scrollIntoView(); }); await sleep(1200);
  // ---- f01: the facts ----
  await beat('f01');
  for (let i = 0; i < 2; i++) await typeIn('#dm-f-' + i + '-SET', 'SHED');
  await idle(); await typeIn('#dm-f-0-LEVEL', '0'); await idle(); await acceptAll();
  if (!(await pg.evaluate(() => (document.getElementById('dm-f-1-HAXIS') || {}).value))) { await pg.select('#dm-f-1-HAXIS', '+X'); await idle(); }
  await pg.evaluate(() => { const e = document.getElementById('dm-av-1-Z'); if (e) e.scrollIntoView({ block: 'center' }); }); await sleep(600);
  await pg.type('#dm-av-1-Z', '0.6096', { delay: 90 }); await pg.type('#dm-ap-1-Z', '-4446.6', { delay: 90 });
  await pg.click('#dm-panel [data-act="add"][data-group="Z"][data-sheet="1"]'); await idle();
  fact('roles', await pg.evaluate(() => window.DxfImportUI.state.sheets.map(s => s.name + ':' + (s.role || 'NONE'))));
  // ---- l01: the eight settings sheets reopened; the layers ----
  await beat('l01'); await chapter(3, 'bodies');
  await openFiles(marked); await pg.evaluate(() => { if (window.DxfImportUI.setLines) window.DxfImportUI.setLines(false); });
  fact('structure-8', await pg.evaluate(() => window.DxfImportUI.state.gate.structure));
  await pg.evaluate(() => { const s = window.DxfMetaEditor.state; if (!s.sec.layers) document.querySelector('#dm-panel .dm-sh[data-sec="layers"]').click(); }); await sleep(900);
  await pg.evaluate(() => { const e = document.querySelector('#dm-panel [data-layer-row="plan|Col"]'); if (e) e.scrollIntoView({ block: 'start' }); }); await sleep(3500);
  await pg.evaluate(() => { const b = document.getElementById('dm-body'); if (b) b.scrollBy(0, 260); }); await sleep(3000);
  // ---- s01: Complete ----
  await beat('s01');
  await pg.evaluate(() => { const c = document.getElementById('dxf-complete'); if (c && !c.checked) c.click(); }); await sleep(2500);
  fact('complete', await pg.evaluate(() => ({ structure: window.DxfImportUI.state.gate.structure, synth: (window.DxfImportUI.state.defaults || []).map(d => d.key).filter(k => /^synth\./.test(k)) })));
  await pg.evaluate(() => { const e = document.getElementById('dm-yellows') || document.getElementById('dm-body'); if (e) e.scrollIntoView(); }); await sleep(2500);
  // ---- c02: Convert ----
  await beat('c02');
  await pg.click('#dxf-convert'); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 240000 }); await sleep(2500);
  fact('converted', await pg.evaluate(() => ({ n: window.DxfImportUI.state.last.nInserts, counts: window.DxfImportUI.state.last.counts })));
  await pg.evaluate(() => { ['dxf-panel', 'dm-panel'].forEach(i => { const e = document.getElementById(i); if (e) e.style.display = 'none'; }); }); const fit = await pg.$('#b-fit'); if (fit) await fit.click(); await sleep(2500);
  // §L26.4: one full orbit of the Modeller camera about the converted shed (Z up)
  const orb = await pg.evaluate(async () => { const A = window.A, c = A.controls, t = c.target, p0 = A.camera.position.clone(), r = Math.hypot(p0.x - t.x, p0.y - t.y), a0 = Math.atan2(p0.y - t.y, p0.x - t.x), N = 36;
    for (let i = 1; i <= N; i++) { const a = a0 + 2 * Math.PI * i / N; A.camera.position.set(t.x + r * Math.cos(a), t.y + r * Math.sin(a), p0.z); c.update(); if (A.markDirty) A.markDirty(); await new Promise(r => setTimeout(r, 110)); }
    return { steps: N, azimuth0: +a0.toFixed(3), radius: +r.toFixed(2), moved: +A.camera.position.distanceTo(p0).toFixed(3) }; });
  fact('modeller-orbit', orb); await sleep(800);
  fact('colours', await pg.evaluate(() => { const o = window.Bonsai.oplog._geomOps().filter(x => x.op_type === 'GEOM_INSERT').slice(-448), m = {}; o.forEach(x => { const P = x.parameters || x.params || {}, k = (P.provenance && P.provenance.ifc && P.provenance.ifc.material) || 'none'; m[k] = '0x' + (P.color || 0).toString(16); }); return m; }));
  const ifc = await pg.evaluate(async () => { const r = await window.Bonsai.ifc.build(); let s = ''; const b = r.bytes; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768)); return { text: s, seeded: r.seeded, typed: r.seedTyped, coloured: r.seedColoured, psets: r.seedPsets }; });
  fs.writeFileSync(path.join(OUT, 'shed.ifc'), Buffer.from(ifc.text, 'latin1')); fact('ifc', { seeded: ifc.seeded, typed: ifc.typed, coloured: ifc.coloured, psets: ifc.psets });
  try { fs.unlinkSync(DBF); } catch (e) {}
  const ex = cp.spawnSync('node', [path.join(BCR, 'scripts', 'extractIFC2DB.js'), '--ifc', path.join(OUT, 'shed.ifc'), '-o', DBF], { encoding: 'utf8', timeout: 280000, env: Object.assign({}, process.env, { NODE_PATH: NM }) });
  const sum = (ex.stdout || '').split('\n').filter(l => /SUMMARY|DB_WRITTEN|DXF2BIM_PSET/.test(l)).map(l => l.replace(/\/tmp\/[^ ]*\//, '').replace(/\/home\/[^ ]*\//, ''));
  const Database = require(path.join(NM, 'better-sqlite3')), dbq = new Database(DBF, { readonly: true });
  const q1 = s => dbq.prepare(s).get(), mat = q1('select count(distinct material_name) n from elements_meta').n, col = q1('select count(distinct material_rgba) n from elements_meta').n, prv = q1("select count(*) n from element_dxf2bim where name='Provenance'").n, nel = q1('select count(*) n from elements_meta').n;
  fact('extract', sum); fact('db', { elements: nel, materials: mat, colours: col, provenance_rows: prv }); fs.copyFileSync(DBF, VDB);
  // ---- i01: IFC + the usual extractor (work done inside the c02 window; this beat shows the result) ----
  await beat('i01'); await chapter(4, 'model');
  await card('<div style="font-family:DejaVu Sans Mono,monospace;font-size:24px;text-align:left;color:#9be0b4" id="term">$ node scripts/extractIFC2DB.js --ifc shed.ifc -o ' + DBNAME + '</div>');
  await sleep(1800);
  await pg.evaluate((lines) => { document.getElementById('term').innerHTML = '$ node scripts/extractIFC2DB.js --ifc shed.ifc -o ShedFilm3_extracted.db<br>' + lines.map(l => l.replace(/</g, '&lt;')).join('<br>'); }, sum.concat(['', 'elements_meta: ' + nel + ' elements, ' + mat + ' materials, ' + col + ' colours', 'element_dxf2bim: ' + prv + ' provenance rows (sheet + handle per mesh)'])); await sleep(1500);
  // ---- v01: chapter 5 opens with the owner's own Viewer tour (film v5, §L31): the laggy headless 3D beats (orbit, night, fly, Alt+G, Find) are gone. This take only HOLDS a card for the tour's length; the assembler lays the tour clips (video + their own sound) over exactly this window ----
  await hold();
  await card('<div style="font-size:60px;font-weight:bold;letter-spacing:4px;color:#F3EEE8">THE VIEWER</div><div style="font-size:30px;color:#FF6B78;margin-top:18px">(the tour is spliced here)</div>');
  await beat('v01'); await chapter(5, 'viewer'); fact('tour_window', { start_beat: 'v01', seconds: TOUR_SEC });
  await sleep(TOUR_SEC * 1000 + 600); await uncard();
  // ---- v03: the 5D page ----
  await hold(); await pg.goto(base + '/viewer/boq_charts.html?db=buildings/' + DBNAME, { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction('document.body.innerText.indexOf("Elements") >= 0 && document.body.innerText.indexOf("$") >= 0', { timeout: 120000 }); await sleep(2500);
  await beat('v03'); fact('5d', await pg.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 200)));
  // ---- v04: the 4D page ----
  await beat('v04');   // the page shows 5D and 4D charts together (its 5D / 4D buttons EXPORT Excel): scroll to the 4D charts, never click
  await pg.evaluate(() => { const h = [...document.querySelectorAll('h1,h2,h3,div,span,canvas')].find(x => /4D — (Phase Duration|Gantt)/.test(x.textContent || '') && (x.textContent || '').length < 80); if (h) h.scrollIntoView({ block: 'start', behavior: 'smooth' }); else window.scrollTo({ top: 700, behavior: 'smooth' }); }); await sleep(3500);
  await pg.evaluate(() => window.scrollBy({ top: 520, behavior: 'smooth' })); await sleep(3500);
  fact('4d', await pg.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 260)));
  // ---- n01: limits ----
  await beat('n01');
  await card('<div style="font-size:44px;font-weight:bold;letter-spacing:4px;color:#FF6B78;margin-bottom:28px">STILL OPEN, STATED</div><div style="text-align:left;font-size:26px;line-height:1.7;max-width:1250px">· truss spacing is not drawn: the repeated trusses are assumed<br>· the evaporative pads have no stated length: not built<br>· cost is a rate-based estimate, not a tender<br>· the schedule is the Viewer\'s generated default<br>· every figure on screen came from this run</div>');
  await beat('end');
  await card('<div style="font-size:84px;font-weight:bold;color:#F3EEE8">FROM A DRAWING</div><div style="font-size:84px;font-weight:bold;color:#FF6B78">TO A MODEL</div>');
  await hold(); await sleep(1500);
  await sleep(1200); await cdp.send('Page.stopScreencast'); await br.close(); srv.close(); try { fs.unlinkSync(VDB); } catch (e) {}
  // build the video: each frame is shown from its timestamp to the next one's; 25 fps constant output
  const t0 = frames[0].ts, lines = [];
  frames.forEach((fr, i) => { const d = i + 1 < frames.length ? Math.max(0.001, frames[i + 1].ts - fr.ts) : 1.0; lines.push("file '" + fr.f + "'", 'duration ' + d.toFixed(4)); });
  lines.push("file '" + frames[frames.length - 1].f + "'");
  fs.writeFileSync(path.join(OUT, 'frames.txt'), lines.join('\n'));
  const mk = cp.spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(OUT, 'frames.txt'), '-vf', 'fps=25,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', path.join(OUT, 'film.mp4')], { encoding: 'utf8' });
  console.log('§FILM_SYNC firstFrame=' + t0.toFixed(3) + ' firstBeat=' + beatLog[0][1].toFixed(3) + ' lastFrame=' + frames[frames.length - 1].ts.toFixed(3) + ' frames=' + frames.length + ' ffmpeg_rc=' + mk.status);
  beatLog.forEach(([id, ep]) => console.log('§FILM_BEAT id=' + id + ' t=' + Math.max(0, ep - t0).toFixed(3)));
  chapLog.forEach(([n, key, ep]) => console.log('§FILM_CHAPTER n=' + n + ' key=' + key + ' t=' + Math.max(0, ep - t0).toFixed(3)));
  fs.writeFileSync(path.join(OUT, 'backdrops.txt'), chapLog.map(([n]) => 'c' + n + ' ' + path.join(OUT, 'bd' + n + '.png')).join('\n') + '\n');
  fs.rmSync(FR, { recursive: true, force: true });
  console.log('§FILM_REC sec=' + (frames[frames.length - 1].ts - t0 + 1).toFixed(1) + ' out=' + path.join(OUT, 'film.mp4'));
})().catch(e => { console.log('§FILM_REC_ERROR ' + (e && e.stack || e)); try { fs.unlinkSync(VDB); } catch (x) {} process.exit(1); });
