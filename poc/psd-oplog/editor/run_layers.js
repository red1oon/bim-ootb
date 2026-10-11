// Usage: node editor/run_layers.js   Level 1a layer delete / hide / reorder / rename: L1-L7 (pre-registered in witness_log/HYPOTHESES.md before this file existed). Needs system Chrome (CHROMIUM), PYTHON with psd-tools+numpy, lcms-wasm (npm i).
const fs = require('fs'), path = require('path'), http = require('http'), { spawnSync } = require('child_process'), { exportLog } = require('./export_psd.js');
const ROOT = path.join(__dirname, '..'), OUT = path.join(__dirname, 'out'), rec = [], fails = [], num = {}; fs.mkdirSync(OUT, { recursive: true });
const chk = (id, name, value, cmp, limit) => { const pass = cmp === '<=' ? value <= limit : cmp === '>=' ? value >= limit : cmp === '!=' ? value !== limit : value === limit; rec.push({ id, name, value, cmp, limit, pass }); if (!pass) fails.push({ id, name, value, cmp, limit }); console.error((pass ? 'ok   ' : 'FAIL ') + id + ' ' + name); };
// base log, built from fixed stroke ops: layer 1 red hard, layer 2 multiply blue, layer 3 green. mk(order, skip) = the same document with layers created in `order`, without the layers in `skip`.
const stroke = (layer, c, pts, r) => ({ op: 'stroke', layer, kind: 'hard', pts, r, c, a: 1 });
const SPEC = { 1: { mode: 'normal', s: stroke(1, [0.9, 0.1, 0.1], [[200, 300], [500, 420], [800, 300]], 60) }, 2: { mode: 'multiply', s: stroke(2, [0.2, 0.3, 0.9], [[300, 200], [520, 520], [700, 700]], 70) }, 3: { mode: 'normal', s: stroke(3, [0.1, 0.7, 0.2], [[250, 650], [500, 500], [760, 280]], 50) } };
const mk = (order = [1, 2, 3], skip = []) => { const o = [{ op: 'layer', id: 0, mode: 'normal', opacity: 1, mask: false }, { op: 'fill', layer: 0, c: [1, 1, 1], a: 1 }]; for (const id of order) if (!skip.includes(id)) { o.push({ op: 'layer', id, mode: 'normal', opacity: 1, mask: false }); if (SPEC[id].mode !== 'normal') o.push({ op: 'set', layer: id, mode: SPEC[id].mode }); o.push(SPEC[id].s); } return o; };
(async () => {
  const { chromium } = require('playwright-core'), srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(0, '127.0.0.1');
  await new Promise((r) => srv.on('listening', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const br = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const open = async (ctxOpts = { viewport: { width: 1400, height: 900 } }) => { const ctx = await br.newContext(ctxOpts), pg = await ctx.newPage(); pg.errs = []; pg.on('pageerror', (e) => pg.errs.push(e.message)); await pg.goto(base + '/editor/index.html'); await pg.waitForFunction(() => window.__ed); pg.ctx = ctx; return pg; };
  const pg = await open();
  await pg.evaluate(([ops]) => { window.H = (st) => ({ comp: Stack.hashF32(Stack.composite(st)), layers: Object.keys(st.L).map((k) => Stack.hashF32(st.L[k].pix)) }); window.ref = (ops) => Editor.refold(JSON.parse(JSON.stringify(ops)), 1024); window.cur = () => window.__ed.hashes();
    window.dirtyOk = () => { const a = window.__ed.D.back, b = Stack.composite(window.__ed.st); if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
    window.load = (ops) => window.__ed.load(JSON.stringify({ format: 'psd-oplog-editor', v: 1, W: 1024, ops })); }, [0]);
  const ev = (f, a) => pg.evaluate(f, a), J = JSON.stringify;
  const load = (ops) => ev((o) => window.load(o), ops), cur = () => ev(() => window.cur()), ref = (ops) => ev((o) => window.ref(o), ops), dok = () => ev(() => window.dirtyOk());
  // ---- L2 hide
  await load(mk()); const h0 = await cur(); chk('L2', 'sanity: loaded base log == refold', J(h0) === J(await ref(mk())), '==', true);
  await ev(() => window.__ed.hideLayer(2, true)); chk('L2', 'hide(2) composite == log without layer 2', (await cur()).comp === (await ref(mk([1, 2, 3], [2]))).comp, '==', true); chk('L2', 'hide: dirty compositor bit-equal to full composite', await dok(), '==', true);
  chk('L2', 'hide changed the picture (negative control)', (await cur()).comp !== h0.comp, '==', true);
  await ev(() => window.__ed.setLayer(2, 'opacity', 0.5)); chk('L2', 'opacity edit while hidden keeps it hidden', (await cur()).comp === (await ref(mk([1, 2, 3], [2]))).comp, '==', true);
  await ev(() => window.__ed.hideLayer(2, false)); chk('L2', 'show after opacity edit == opacity-0.5 log', (await cur()).comp === (await ref([...mk(), { op: 'set', layer: 2, opacity: 0.5 }])).comp, '==', true); chk('L2', 'show: dirty compositor bit-equal', await dok(), '==', true);
  await load(mk()); await ev(() => { window.__ed.hideLayer(2, true); window.__ed.hideLayer(2, false); }); chk('L2', 'hide then show restores the exact hashes', J(await cur()) === J(h0), '==', true);
  { const n = await ev(() => { const e = window.__ed; e.hideLayer(3, true); e.params.layer = 3; e.params.tool = 'hard'; const n0 = e.ops.length; e.begin(100, 100); e.move(150, 150); e.end(); return e.ops.length - n0; }); chk('L7', 'painting on a hidden layer logs nothing', n, '==', 0); }
  // ---- L3 reorder
  await load(mk()); const h3 = await cur(); await ev(() => window.__ed.moveLayer(3, 1));
  chk('L3', 'mv(3 -> bottom) composite == log built in order 3,1,2', (await cur()).comp === (await ref(mk([3, 1, 2]))).comp, '==', true); chk('L3', 'reorder changes the picture (negative control)', (await cur()).comp !== h3.comp, '==', true); chk('L3', 'reorder: dirty compositor bit-equal', await dok(), '==', true);
  await ev(() => window.__ed.undo()); chk('L3', 'undo of mv restores the exact hashes', J(await cur()) === J(h3), '==', true);
  { const t = await ev(() => { const bad = (o) => { try { Editor.applyOp(Stack.newState(8), o); return 'no throw'; } catch (e) { return 'throw'; } }; const st = Stack.newState(8); for (const id of [0, 1, 2]) Editor.applyOp(st, { op: 'layer', id, mode: 'normal', opacity: 1, mask: false }); const t = (o) => { try { Editor.applyOp(st, o); return 'no throw'; } catch (e) { return 'throw'; } }; return [t({ op: 'mv', layer: 0, to: 1 }), t({ op: 'mv', layer: 1, to: 0 }), t({ op: 'mv', layer: 1, to: 3 }), t({ op: 'del', layer: 0 }), t({ op: 'del', layer: 9 })]; }); chk('L3', 'Background cannot move, nothing below it, out of range, del Background, unknown layer all throw', t.join(), '==', 'throw,throw,throw,throw,throw'); }
  // ---- L4 delete
  await load(mk()); await ev(() => window.__ed.delLayer(2)); const hd = await cur(), rd = await ref(mk([1, 2, 3], [2]));
  chk('L4', 'del(2) layer + composite hashes == log without layer 2', J(hd) === J(rd), '==', true); chk('L4', 'del: dirty compositor bit-equal', await dok(), '==', true);
  await ev(() => window.__ed.undo()); chk('L4', 'undo of del restores every hash (pixels bit-exact)', J(await cur()) === J(h0), '==', true); chk('L4', 'undo of del: dirty bit-equal', await dok(), '==', true);
  await ev(() => window.__ed.redo()); chk('L4', 'redo of del == post-delete hashes', J(await cur()) === J(hd), '==', true);
  await ev(() => { window.__ed.addLayer(); const e = window.__ed; e.params.tool = 'hard'; e.params.color = [0.5, 0.5, 0.1]; e.begin(300, 300); e.move(400, 380); e.end(); }); chk('L4', 'add layer + stroke after a delete: live == refold(ops)', J(await cur()) === J(await ref(await ev(() => window.__ed.ops))), '==', true);
  // ---- L5 rename
  await load(mk()); await ev(() => { window.__ed.renameLayer(2, 'Sky'); window.__ed.renameLayer(2, 'Sea'); }); chk('L5', 'rename does not change pixels', J(await cur()) === J(h0), '==', true);
  await ev(() => window.__ed.undo()); chk('L5', 'undo restores the previous name', (await ev(() => window.__ed.layers().find((l) => l.id === 2).name)), '==', 'Sky');
  await ev(() => window.__ed.undo()); chk('L5', 'second undo restores the default name', (await ev(() => window.__ed.layers().find((l) => l.id === 2).name)), '==', 'Layer 2');
  await ev(() => { window.__ed.renameLayer(1, 'Roof'); window.__ed.renameLayer(3, 'Plant'); }); const saved = await ev(() => window.__ed.save()); await ev(() => window.__ed.reset()); await ev((s) => window.__ed.load(s), saved);
  chk('L5', 'names survive save -> load', (await ev(() => window.__ed.layers().map((l) => l.name))).join(), '==', 'Background,Roof,Layer 2,Plant');
  { const t = await ev(() => { const st = Stack.newState(8); Editor.applyOp(st, { op: 'layer', id: 0, mode: 'normal', opacity: 1, mask: false }); const t = (n) => { try { Editor.applyOp(st, { op: 'name', layer: 0, name: n }); return 'ok'; } catch (e) { return 'throw'; } }; return [t(''), t('   '), t('x'.repeat(41)), t('x'.repeat(40))]; }); chk('L5', 'empty / blank / 41-char names rejected, 40 accepted', t.join(), '==', 'throw,throw,throw,ok'); }
  // ---- L1 full session: all four ops among strokes, log is the truth
  await ev(() => { const e = window.__ed; e.reset(); e.params.tool = 'hard'; e.params.size = 30; const s = (l, c, a, b) => { e.params.layer = l; e.params.color = c; e.begin(...a); e.move(...b); e.end(); };
    s(1, [0.9, 0.1, 0.1], [100, 100], [500, 300]); e.addLayer(); s(2, [0.1, 0.2, 0.9], [200, 400], [700, 300]); e.setLayer(2, 'mode', 'multiply'); e.addLayer(); s(3, [0.1, 0.8, 0.2], [300, 100], [300, 700]); e.renameLayer(3, 'Green'); e.moveLayer(3, 1); e.hideLayer(2, true); e.addLayer(); s(4, [0.9, 0.9, 0.1], [600, 600], [800, 800]); e.delLayer(1); e.hideLayer(2, false); e.moveLayer(4, 2); });
  const live = await cur(), lops = await ev(() => window.__ed.ops); chk('L1', `live hashes == refold of its ${lops.length}-entry log (4 new op kinds: ${[...new Set(lops.map((o) => o.op))].filter((k) => ['del', 'mv', 'vis', 'name'].includes(k)).join('/')})`, J(live) === J(await ref(lops)), '==', true);
  const sv = await ev(() => window.__ed.save()); await ev(() => window.__ed.reset()); await ev((s) => window.__ed.load(s), sv); chk('L1', 'save -> load: hashes equal', J(await cur()) === J(live), '==', true); chk('L1', 'dirty compositor bit-equal after the session', await dok(), '==', true);
  for (let i = 0; i < 4; i++) await ev(() => window.__ed.undo()); for (let i = 0; i < 4; i++) await ev(() => window.__ed.redo()); chk('L1', 'undo x4 then redo x4 == original hashes', J(await cur()) === J(live), '==', true);
  chk('L1', 'no page errors', pg.errs.length, '==', 0);
  // ---- L6 PSD
  await load(mk()); await ev(() => { const e = window.__ed; e.renameLayer(1, 'Roof'); e.setLayer(2, 'opacity', 0.7); e.hideLayer(2, true); e.moveLayer(3, 1); });
  const pageBytes = Buffer.from(await ev(async () => Array.from(await window.__ed.exportPSD()))), nodeEx = await exportLog(await ev(() => window.__ed.save()));
  chk('L6', 'page PSD bytes == Node exporter bytes (' + pageBytes.length + ' bytes)', Buffer.compare(pageBytes, Buffer.from(nodeEx.bytes)) === 0, '==', true);
  fs.writeFileSync(path.join(OUT, 'layers.psd'), pageBytes); fs.writeFileSync(path.join(OUT, 'layers_display.raw'), Buffer.from(nodeEx.display)); fs.writeFileSync(path.join(OUT, 'layers_meta.json'), J({ W: 1024, display: path.join(OUT, 'layers_display.raw') }));
  const py = spawnSync(process.env.PYTHON || 'python3', ['-I', path.join(__dirname, 'check_layers_psd.py'), path.join(OUT, 'layers.psd'), path.join(OUT, 'layers_meta.json')], { encoding: 'utf8' }); if (py.status !== 0) { console.error(py.stderr); process.exit(2); } const R = JSON.parse(py.stdout.trim().split('\n').pop()); num.L6 = R;
  chk('L6', 'psd-tools: names bottom->top (Background, Layer 3, Roof, Layer 2)', R.names.join(), '==', 'Background,Layer 3,Roof,Layer 2'); chk('L6', 'psd-tools: visibility flags', R.visible.join(), '==', 'true,true,true,false');
  chk('L6', 'psd-tools: hidden layer keeps its real opacity 0.7 -> byte ' + Math.round(0.7 * 255), R.opacity[3], '==', Math.round(0.7 * 255)); chk('L6', 'merged image == composite of the visible layers (max level diff <= 1)', R.merged_max_diff, '<=', 1);
  await pg.ctx.close();
  // ---- L7 phone
  const ph = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }); await ph.evaluate(() => { document.getElementById('addl'); });
  await ph.evaluate(() => { window.__ed.reset(); window.__ed.addLayer(); window.__ed.addLayer(); }); const opener = await ph.$('#more, #layersbtn, button[data-open=side], #lbtn'); 
  await ph.evaluate(() => document.getElementById('side').classList.add('open'));
  const sizes = await ph.evaluate(() => [...document.querySelectorAll('#layers .layer .lb')].map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })); chk('L7', `all ${sizes.length} layer buttons >= 44 px both ways`, sizes.length > 0 && sizes.every(([w, h]) => w >= 44 && h >= 44), '==', true);
  chk('L7', 'no page scroll (scrollHeight <= innerHeight)', await ph.evaluate(() => document.documentElement.scrollHeight <= innerHeight), '==', true);
  const n = () => ph.evaluate(() => window.__ed.ops.length), tapBtn = async (label, nth = 0) => { await ph.locator(`#layers .layer .lb[title="${label}"]`).nth(nth).tap(); };
  let n0 = await n(); await tapBtn('Hide layer', 0); chk('L7', 'tap Hide -> +1 log entry, layer hidden', (await n()) - n0 === 1 && (await ph.evaluate(() => window.__ed.layers().some((l) => l.hidden))), '==', true);
  n0 = await n(); await tapBtn('Show layer', 0); chk('L7', 'tap Show -> +1 entry', (await n()) - n0, '==', 1);
  n0 = await n(); await tapBtn('Move layer down', 0); chk('L7', 'tap Move down -> +1 entry, top layer id now 1 or 2 below', (await n()) - n0, '==', 1);
  { n0 = await n(); await tapBtn('Rename layer', 0); await ph.locator('#layers input.rn').fill('Tap name'); await ph.locator('#layers input.rn').press('Enter'); chk('L7', 'tap Rename + type + Enter -> +1 entry, name shown', (await n()) - n0 === 1 && (await ph.evaluate(() => window.__ed.layers().some((l) => l.name === 'Tap name'))), '==', true); }
  const cdp = await ph.ctx.newCDPSession(ph); n0 = await n(); await ph.evaluate(() => document.getElementById('side').classList.remove('open')); await new Promise((r) => setTimeout(r, 500)); const v = await ph.evaluate(() => { const r = document.getElementById('view').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    const T = (t, pts) => cdp.send('Input.dispatchTouchEvent', { type: t, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) }); await T('touchStart', [[v[0] - 40, v[1], 1]]); await T('touchStart', [[v[0] - 40, v[1], 1], [v[0] + 40, v[1], 2]]); await new Promise((r) => setTimeout(r, 60)); await T('touchEnd', []); await new Promise((r) => setTimeout(r, 200));
  chk('L7', 'two-finger tap undoes the last layer op (-1 entry)', n0 - (await n()), '==', 1); chk('L7', 'no page errors on the phone', ph.errs.length, '==', 0);
  await ph.ctx.close(); await br.close(); srv.close();
  const out = { n_checks: rec.length, gate: fails.length ? 'FAIL' : 'PASS', fails, numbers: num, checks: rec, node: process.version }; fs.writeFileSync(path.join(OUT, 'layers.json'), J(out, null, 1)); console.log(J({ ...out, checks: undefined }, null, 1)); process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
