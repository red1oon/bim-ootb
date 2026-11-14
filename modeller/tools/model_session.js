#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — model_session.js (bim-compiler prompts/FILM_COMMAND_LINE_ERP.md CH 1; spec: prompts/MODEL_SESSION_LINES.md). READ THE LOG; an exit code is not evidence.
// ONE Modeller page kept open between lines, driven headless on the CPU (no GPU), so a person types model.open, model.2d.convert, model.addbay one after the other and each line acts on what the last one left.
// The page does the work (its own import, Convert and add-a-bay); this file only presses what a person presses and reads the page's own answers. Nothing is invented, nothing is saved: closing the session drops the model.
//   node model_session.js open sheets=<folder of .dxf | a.dxf,b.dxf> [type="Farming Shed"]   start the session (a local port + a one-time token in ./.model_session.json) and open the 2D sheets
//   node model_session.js convert                       the page's Convert (ONE gesture)
//   node model_session.js addbay end=high|low           the page's "Add a bay" at that end of the repeating-bay building
//   node model_session.js undo | redo                   the page's Ctrl+Z / Ctrl+Y
//   node model_session.js status                        what the page holds now
//   node model_session.js shot out=<file.png> [w=1920 h=537]   the canvas as a picture
//   node model_session.js close                         stop the session
// stdout: JSON only. Exit 0 ok · 3 refused (a rule said no) · 1 failed. The port binds 127.0.0.1 only and every request carries the token.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), cp = require('child_process'), crypto = require('crypto'), os = require('os');
const BRK = process.env.MODELSES_BREAK || '';   // W-MODEL-SESSION falsifiers: notype | stale | nounder
const STATE = path.resolve(process.cwd(), '.model_session.json'), ROOT = path.join(__dirname, '..', '..');
const kv = {}; const argv = process.argv.slice(2), cmd = argv[0]; argv.slice(1).forEach(a => { const m = /^([A-Za-z_]\w*)=([\s\S]*)$/.exec(a); if (m) kv[m[1]] = m[2]; });
const out = (o, code) => { process.stdout.write(JSON.stringify(o) + '\n'); process.exit(code || 0); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function puppeteer() { const tries = [() => require('puppeteer'), () => require(path.join(os.homedir(), 'bim-compiler', 'node_modules', 'puppeteer'))]; for (const t of tries) { try { return t(); } catch (e) { /* next */ } } out({ ok: false, error: 'puppeteer not found (npm install puppeteer@24)' }, 1); }
class Refused extends Error {}
const refuse = (m) => { throw new Refused(m); };

// ── the daemon: one page, one command at a time ───────────────────────────────────────────────────────────
async function daemon() {
  const P = puppeteer(), MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.db': 'application/octet-stream' };
  const site = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(z => site.listen(0, '127.0.0.1', z));
  const br = await P.launch({ headless: 'new', protocolTimeout: 1800000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1920, height: 537 }); const errs = [], bay = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 200))); pg.on('console', m => { const t = m.text(); if (/^§DXF-BAY/.test(t)) bay.push(t); });
  await pg.goto('http://127.0.0.1:' + site.address().port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.Bonsai', { timeout: 120000 });
  await pg.evaluate(() => { window.DxfImportUI.state.arrangeOnOpen = false; });
  const S = { opened: false, converted: false, type: null, sheets: 0 }, count = () => pg.evaluate(() => window.Bonsai.oplog._geomOps().filter(o => o.op_type === 'GEOM_INSERT').length);   // the elements: the insert ops of the page's op-log (what Convert and a bay's copies add)
  const gateInfo = () => pg.evaluate(() => { const g = window.DxfImportUI.state.gate; return g ? { ok: !!g.ok, bodies: g.structure ? g.structure.bodies : null, left_out: g.structure ? g.structure.left_out : null } : null; });
  const H = {
    async open(a) {
      if (S.opened) refuse('a model is open already; close the session first (nothing is saved)');
      if (!a.sheets) refuse('sheets= is required: a folder of .dxf sheets or a comma list of files');
      const p = path.resolve(a.sheets), files = fs.existsSync(p) && fs.statSync(p).isDirectory() ? fs.readdirSync(p).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(p, f)) : String(a.sheets).split(',').map(f => path.resolve(f.trim()));
      if (!files.length || files.some(f => !fs.existsSync(f))) refuse('no .dxf sheets found at ' + a.sheets);
      await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
      const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
      await pg.waitForFunction('window.DxfImportUI.state.gate && window.DxfMetaEditor && !window.DxfMetaEditor.state.busy', { timeout: 300000 }); await sleep(800);
      if (a.type && BRK !== 'notype') {
        const how = await pg.evaluate(async t => { const sh = document.querySelector('#dm-panel [data-act="sec"][data-sec="edefaults"]'); if (!sh) return 'no Element defaults section';
          if (!window.DxfMetaEditor.state.sec.edefaults) { sh.click(); await new Promise(r => setTimeout(r, 400)); }
          const row = document.querySelector('#dm-panel [data-edef="building.type"]'); if (!row) return 'no building.type row'; const sel = row.querySelector('select'); if (!sel) return 'no select';
          if (![...sel.options].some(o => o.value === t)) return 'the type "' + t + '" is not offered (' + [...sel.options].map(o => o.value).join(', ') + ')';
          sel.value = t; sel.dispatchEvent(new Event('change', { bubbles: true })); const set = row.querySelector('[data-act="edefset"]'); if (!set) return 'no Set button'; set.click(); return 'set'; }, a.type);
        if (how !== 'set') refuse('building type: ' + how);
        await sleep(1500); await pg.waitForFunction('window.DxfImportUI.state.gate && window.DxfMetaEditor && !window.DxfMetaEditor.state.busy', { timeout: 300000 }); await sleep(800); S.type = a.type;
      }
      await pg.waitForFunction('window.DxfImportUI.state.gate && window.DxfImportUI.state.gate.ok', { timeout: 60000 }).catch(() => {});
      const g = await gateInfo(); S.opened = true; S.sheets = files.length;
      return { sheets: files.length, gate: g, type: S.type, summary: files.length + ' sheets open' + (g && g.ok ? ', ' + g.bodies + ' bodies read (' + g.left_out + ' left out), the gate is open' : ', the gate is CLOSED (' + JSON.stringify(g) + '): Convert is not available') };
    },
    async convert() {
      if (!S.opened) refuse('nothing is open: model.open first');
      if (S.converted) refuse('already converted: model.undo to take it back');
      if (!await pg.evaluate(() => !!(window.DxfImportUI.state.gate && window.DxfImportUI.state.gate.ok))) refuse('the gate is closed: the sheets are not ready to convert (their markings are incomplete)');
      await pg.click('#dxf-convert'); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 300000 }); await sleep(2500); S.converted = true;
      const r = await pg.evaluate(() => { const b = window.DxfImportUI.bayRule(); return { inserts: window.DxfImportUI.state.last.nInserts, bayOffered: !!document.getElementById('dxf-bay-row'), type: b && b.type, rule: !!(b && b.rule) }; });
      return Object.assign(r, { elements: await count(), summary: r.inserts + ' elements made' + (r.bayOffered ? '; add-a-bay is offered for ' + r.type : '; add-a-bay is NOT offered (the building type declares no bay rule)') });
    },
    async addbay(a) {
      if (!S.converted) refuse('nothing is converted: model.convert first');
      const end = String(a.end || '').toLowerCase(); if (['high', 'low'].indexOf(end) < 0) refuse('end= is high or low (the end of the building to lengthen)');
      const before = await count(); bay.length = 0;
      const R = await pg.evaluate(async e => { try { const r = await window.DxfImportUI.addBay(e); return { r: r && { ok: r.ok, why: r.why || (r.plan && r.plan.why) || null } }; } catch (x) { return { err: x.message }; } }, end === 'high' ? 'max' : 'min'); await sleep(2500);
      const plan = bay.filter(l => /§DXF-BAY plan/.test(l)).pop() || '', com = bay.filter(l => /§DXF-BAY committed/.test(l)).pop() || '', det = bay.filter(l => /§DXF-BAY detail/.test(l)).pop() || '', ref = bay.filter(l => /refus|not offered|no rule|cannot/i.test(l)).pop();
      if (!com) refuse((R.r && R.r.why) || R.err || ref || 'the page did not add a bay (' + (plan || 'no plan') + ')');
      const m = /hinge=(\S+) pitch=([\d.]+) identical=(\d+) copies=(\d+) (\{[^}]*\})/.exec(plan) || [], c = /gate=(.+?) cost added=(\d+) changed=(\d+) total=(\d+) cur=(\S+)/.exec(com) || [], d = /copied="([^"]*)" stretched="([^"]*)".*pack=(\S+)/.exec(det) || [], after = await count();
      return { end, commit_line: com, hinge: m[1], pitch_m: Number(m[2]), identical_bays: Number(m[3]), copies: Number(m[4]), copies_by_class: m[5] ? JSON.parse(m[5]) : null, gate: c[1], cost: { added: Number(c[2]), changed: Number(c[3]), total: Number(c[4]), currency: c[5], pack: d[3] }, copied: d[1], stretched: d[2], elements_before: before, elements_after: BRK === 'stale' ? before : after,
        summary: 'one bay added at the ' + end + ' end (' + m[4] + ' copies, pitch ' + m[2] + ' m), the gate is ' + c[1] + ', cost ' + c[4] + ' ' + c[5] + ' (' + c[2] + ' added, ' + c[3] + ' changed)' };
    },
    async undo() { if (!S.opened) refuse('nothing is open'); const b = await count(); if (BRK === 'nounder') return { elements_before: b, elements_after: b, summary: 'undone: ' + b + ' -> ' + b + ' elements' }; await pg.evaluate(async () => { await window.Bonsai.oplog.undo(); }); await sleep(2000); const a = await count(); if (a < b && S.converted && a <= 0) S.converted = false; return { elements_before: b, elements_after: a, summary: 'undone: ' + b + ' -> ' + a + ' elements' }; },
    async redo() { if (!S.opened) refuse('nothing is open'); const b = await count(); await pg.evaluate(async () => { await window.Bonsai.oplog.redo(); }); await sleep(2000); const a = await count(); return { elements_before: b, elements_after: a, summary: 'redone: ' + b + ' -> ' + a + ' elements' }; },
    async status() { return { open: S.opened, converted: S.converted, type: S.type, sheets: S.sheets, elements: S.opened ? await count() : 0, gate: S.opened ? await gateInfo() : null, page_errors: errs.length }; },
    async shot(a) { if (!a.out) refuse('out= is required (a .png path)'); const w = Number(a.w || 1920), h = Number(a.h || 537); await pg.setViewport({ width: w, height: h }); await sleep(600); const f = path.resolve(a.out); await pg.screenshot({ path: f }); return { file: f, width: w, height: h, bytes: fs.statSync(f).size }; }
  };
  const token = crypto.randomBytes(16).toString('hex'); let busy = Promise.resolve();
  const api = http.createServer((q, s) => {
    let body = ''; q.on('data', d => { body += d; }); q.on('end', () => {
      const reply = (code, o) => { s.writeHead(code, { 'Content-Type': 'application/json' }); s.end(JSON.stringify(o)); };
      if (q.headers['x-token'] !== token) return reply(403, { ok: false, error: 'bad token' });
      let r; try { r = JSON.parse(body); } catch (e) { return reply(400, { ok: false, error: 'bad request' }); }
      if (r.cmd === 'close') { try { fs.unlinkSync(STATE); } catch (e) { /* gone */ } reply(200, { ok: true, closed: true }); setTimeout(async () => { try { await br.close(); } catch (e) { /* gone */ } try { fs.unlinkSync(STATE); } catch (e) { /* gone */ } process.exit(0); }, 100); return; }
      busy = busy.then(async () => { const t0 = Date.now(); try { if (!H[r.cmd]) return reply(400, { ok: false, error: 'unknown command ' + r.cmd }); const a = await H[r.cmd](r.args || {}); reply(200, Object.assign({ ok: true }, a, { page_errors: errs.length, ms: Date.now() - t0 })); } catch (e) { reply(e instanceof Refused ? 409 : 500, { ok: false, refused: e instanceof Refused, error: String(e.message || e).slice(0, 400), ms: Date.now() - t0 }); } });
    }); });
  await new Promise(z => api.listen(0, '127.0.0.1', z));
  fs.writeFileSync(STATE, JSON.stringify({ port: api.address().port, token, pid: process.pid, started: new Date().toISOString() }));
  process.stdout.write('ready\n');
}

// ── the client: one line = one request ────────────────────────────────────────────────────────────────────
function request(st, c, args) {
  return new Promise((res) => { const body = JSON.stringify({ cmd: c, args }), r = http.request({ host: '127.0.0.1', port: st.port, method: 'POST', headers: { 'x-token': st.token, 'content-length': Buffer.byteLength(body) }, timeout: 1800000 }, (x) => { let b = ''; x.on('data', d => { b += d; }); x.on('end', () => { try { res({ code: x.statusCode, j: JSON.parse(b) }); } catch (e) { res({ code: 500, j: { ok: false, error: 'bad answer' } }); } }); });
    r.on('error', e => res({ code: 0, j: { ok: false, error: 'no session (' + e.code + '): model.open first' } })); r.end(body); });
}
(async () => {
  if (cmd === '__daemon') return daemon();
  if (!cmd || ['open', 'convert', 'addbay', 'undo', 'redo', 'status', 'shot', 'close'].indexOf(cmd) < 0) out({ ok: false, error: 'usage: model_session.js open|convert|addbay|undo|redo|status|shot|close [key=value ...]' }, 2);
  let st = null; try { st = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { /* none */ }
  if (cmd === 'open') {
    if (st) { const ping = await request(st, 'status', {}); if (ping.code === 200) out({ ok: false, refused: true, error: 'a session is open already in this folder; model.close first' }, 3); try { fs.unlinkSync(STATE); } catch (e) { /* stale */ } }
    const log = fs.openSync(path.resolve(process.cwd(), '.model_session.log'), 'w'), ch = cp.spawn(process.execPath, [__filename, '__daemon'], { detached: true, stdio: ['ignore', log, log], cwd: process.cwd() }); ch.unref();
    for (let i = 0; i < 240 && !fs.existsSync(STATE); i++) await sleep(500);
    if (!fs.existsSync(STATE)) out({ ok: false, error: 'the session did not start (see .model_session.log)' }, 1);
    st = JSON.parse(fs.readFileSync(STATE, 'utf8'));
  }
  if (!st) out({ ok: false, refused: true, error: 'no session in this folder: model.open first' }, 3);
  const r = await request(st, cmd, kv);
  if (r.code === 0) { try { fs.unlinkSync(STATE); } catch (e) { /* gone */ } out({ ok: false, refused: true, error: 'no session in this folder (it was closed or died): model.open first' }, 3); }
  out(r.j, r.code === 200 ? 0 : (r.code === 409 ? 3 : 1));
})();
