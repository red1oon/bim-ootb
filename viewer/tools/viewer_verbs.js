#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — Viewer verbs 8 and 9 (W-VIEWER-VERBS). Spec: bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §19.4. Read the log after every run.
// SCOPE: READ ONLY. Two verbs that open a building in the Viewer (headless, SwiftShader/CPU via viewer_driver.js) and run the Viewer's OWN Find-panel
// "Ask" answer for it (viewer/find_ask.js, A.askRun): the answer returned is the one the Viewer shows a person, with the Viewer's own
// `§ASK_ANSWER` console line carried beside it as the evidence. Nothing is re-derived here. No DB write, no bake, no GPU.
//   viewer_counts(building, by)            = Find ▸ Ask ▸ "Find element count by discipline|storey"      (find_ask.js runCounts)
//   viewer_clashes(building, discA, discB) = Find ▸ Ask ▸ "Find clashes between A and B"                 (find_ask.js runClash)
// Run: node viewer/tools/viewer_verbs.js counts --building Duplex [--by storey]
//      node viewer/tools/viewer_verbs.js clashes --building Clinic --a ARC --b MEP
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const VD = require('./viewer_driver');

const NAME = /^[A-Za-z0-9_-]{1,64}$/, DISC = /^[A-Za-z0-9_]{1,16}$/;
const say = (s) => process.stderr.write('§VIEWER_VERB ' + s + '\n');

// building name -> the DB the Viewer opens. Dirs: $VIEWER_BLD_DIR, this checkout's buildings/, the primary checkout's (read only).
function resolveDb(building) {
  if (typeof building !== 'string' || !NAME.test(building)) throw new Error('building must be a name such as "Duplex" (letters, digits, _ and - only)');
  const dirs = [process.env.VIEWER_BLD_DIR, path.join(VD.ROOT, 'buildings'), path.join(os.homedir(), 'bim-ootb', 'buildings')].filter(Boolean);
  for (const d of dirs) for (const f of [building + '_extracted.db', building + '.db']) {
    const p = path.join(d, f); if (fs.existsSync(p) && fs.statSync(p).size > 100000) return p;
  }
  throw new Error('unknown building "' + building + '": no ' + building + '_extracted.db in ' + dirs.join(', '));
}

// Opens the building, waits for it as the Viewer's own load does, mounts Find (A.loadNavigate), then runs one Ask template. Returns the Viewer's answer
// and the Viewer's own §ASK_ANSWER line from the page console (the same line a person's console shows).
// LIVE MODE (NEURO §0.15; viewer_driver.isLive: a plain download, or VIEWER_LIVE=1): the building is the one the live bucket serves under that name. A name it does not serve is an error
// before any browser starts.
async function resolveLive(building) {
  if (typeof building !== 'string' || !NAME.test(building)) throw new Error('building must be a name such as "Duplex" (letters, digits, _ and - only)');
  const other = process.env.VIEWER_DL_BREAK;   // W-VIEWER-DOWNLOAD falsifier: open another building than the one asked
  const base = await VD.liveBase(), url = base + 'buildings/' + (other || building) + '_extracted.db', h = await VD.fetchLive(url, 'HEAD');
  if (h.status !== 200) throw new Error('unknown building "' + building + '": the live site serves no ' + building + '_extracted.db (HTTP ' + h.status + ')');
  return url;
}
const target = async (building) => (VD.isLive() ? { dbUrl: await resolveLive(building) } : { db: resolveDb(building) });
// one page, opened and ready for Ask (the Viewer's own load, then Find mounted)
async function openPage(building) {
  const tg = await target(building), db = tg.db || tg.dbUrl, pageLog = [];
  const d = await VD.start(Object.assign({ pageLog }, tg));
  say('page=' + d.pageUrl + ' mode=' + (d.live ? 'live' : 'checkout'));
  await d.open(); await d.waitLoaded();
  await d.page.evaluate(() => window.APP.loadNavigate());
  await d.page.waitForFunction(() => typeof window.APP.askRun === 'function', { timeout: 120000 });
  return { d, db, pageLog };
}
async function askOn(P, building, tpl, slots, text) {
  const from = P.pageLog.length, e0 = P.d.pageErrors.length;
  const ans = await P.d.page.evaluate((tpl, slots, text) => window.APP.askRun({ tpl, slots, text }).then(a => JSON.parse(JSON.stringify(a))), tpl, slots, text);
  if (process.env.VIEWER_WARM_BREAK === 'lie' && process.env.__VIEWER_SERVING === '1' && ans.value && typeof ans.value.meshClashes === 'number') ans.value.meshClashes += 1;   // W-RED1-WARM falsifier: the warm page answers another number (must FAIL W1)
  const log = P.pageLog.slice(from), line = log.filter(l => l.indexOf('§ASK_ANSWER id=' + tpl + ' ') === 0).pop() || null;
  const lines = log.filter(l => /^§(ASK_|CLASH_QUERY|CLASH_NARROW)/.test(l)).map(l => l.slice(0, 300));
  return { ans, line, lines, pageErrors: P.d.pageErrors.slice(e0), db: P.db, page: P.d.live ? 'live' : 'checkout' };
}
// THE WARM PAGE (bim-compiler prompts/CLI_ERP_IVR.md §22.8, step R7): the red1 shell keeps ONE page per building open and names its state file in $VIEWER_SESSION
// ({building, port, token, pid, ready}). A verb asks that page when it holds the same building; otherwise, or when the page is gone, it opens a fresh page as before.
// The answer is the page's own (the same askRun); only the wait for the load is saved.
function warmOf(building) {
  const f = process.env.VIEWER_SESSION; if (!f || VD.isLive()) return null;
  let st = null; try { st = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; }
  return st && st.building === building ? st : null;
}
async function askWarm(st, f, building, tpl, slots, text) {
  for (let i = 0; i < 600 && st && !st.ready; i++) { await new Promise(r => setTimeout(r, 500)); try { st = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } if (st.building !== building) return null; }
  if (!st || !st.ready) return null;
  return new Promise((res) => { const body = JSON.stringify({ tpl, slots, text }); const rq = require('http').request({ host: '127.0.0.1', port: st.port, method: 'POST', headers: { 'x-token': st.token, 'content-length': Buffer.byteLength(body) }, timeout: 1800000 },
    (x) => { let b = ''; x.on('data', d => { b += d; }); x.on('end', () => { try { const j = JSON.parse(b); res(x.statusCode === 200 ? j : null); } catch (e) { res(null); } }); });
    rq.on('error', () => res(null)); rq.end(body); });
}
async function ask(building, tpl, slots, text) {
  const t0 = Date.now(), st = warmOf(building);
  if (st) { const r = await askWarm(st, process.env.VIEWER_SESSION, building, tpl, slots, text); if (r) { say(tpl + ' building=' + building + ' verdict=' + r.ans.verdict + ' ms=' + (Date.now() - t0) + ' page=warm'); return r; } say('warm page not reachable; a fresh page'); }
  const P = await openPage(building);
  try { const r = await askOn(P, building, tpl, slots, text); say(tpl + ' building=' + building + ' verdict=' + r.ans.verdict + ' ms=' + (Date.now() - t0) + ' page=fresh'); return r; }
  finally { await P.d.close(); }
}
// the daemon: node viewer_verbs.js __serve --building B --state FILE (started by red1; stopped by a POST {close:true} or by killing it)
async function serve(building, file) {
  process.env.__VIEWER_SERVING = '1';
  const t0 = Date.now(), P = await openPage(building), token = require('crypto').randomBytes(16).toString('hex'); let busy = Promise.resolve();
  const srv = require('http').createServer((q, s) => { let body = ''; q.on('data', d => { body += d; }); q.on('end', () => {
    const reply = (c, o) => { s.writeHead(c, { 'Content-Type': 'application/json' }); s.end(JSON.stringify(o)); };
    if (q.headers['x-token'] !== token) return reply(403, { error: 'bad token' });
    let r; try { r = JSON.parse(body); } catch (e) { return reply(400, { error: 'bad request' }); }
    if (r.close) { reply(200, { closed: true }); setTimeout(async () => { await P.d.close(); try { const st = JSON.parse(fs.readFileSync(file, 'utf8')); if (st.pid === process.pid) fs.unlinkSync(file); } catch (e) { /* gone */ } process.exit(0); }, 50); return; }
    busy = busy.then(async () => { const t1 = Date.now(); try { const a = await askOn(P, building, r.tpl, r.slots, r.text); say('serve ' + r.tpl + ' ms=' + (Date.now() - t1)); reply(200, a); } catch (e) { reply(500, { error: String(e.message || e) }); } });
  }); });
  await new Promise(z => srv.listen(0, '127.0.0.1', z));
  // it never outlives the shell that started it: SIGTERM, or the parent gone (checked every 2 s), closes the page and exits
  const stop = async () => { try { await P.d.close(); } catch (e) { /* gone */ } try { const st = JSON.parse(fs.readFileSync(file, 'utf8')); if (st.pid === process.pid) fs.unlinkSync(file); } catch (e) { /* gone */ } process.exit(0); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  const parent = Number(process.env.__VIEWER_PARENT || 0); if (parent) setInterval(() => { try { process.kill(parent, 0); } catch (e) { say('serve parent ' + parent + ' gone; closing'); stop(); } }, 2000).unref();
  fs.writeFileSync(file, JSON.stringify({ building, port: srv.address().port, token, pid: process.pid, ready: true, load_ms: Date.now() - t0 }));
  say('serve ready building=' + building + ' load_ms=' + (Date.now() - t0));
}

// VOLATILE inputs are checked before any browser starts.
async function viewerCounts(a) {
  const by = a.by === undefined ? 'discipline' : a.by;
  if (by !== 'discipline' && by !== 'storey') throw new Error('by must be "discipline" or "storey"');
  const r = await ask(a.building, 'counts', { by }, 'Find element count by ' + by);
  if (r.ans.verdict !== 'OK') throw new Error('the Viewer says ' + r.ans.verdict + ': ' + r.ans.summary);
  return pack('viewer_counts', a.building, r, 0);
}
async function viewerClashes(a) {
  for (const k of ['discA', 'discB']) if (typeof a[k] !== 'string' || !DISC.test(a[k])) throw new Error(k + ' must be a discipline code such as "ARC" or "MEP"');
  await target(a.building);   // unknown building: error before the browser starts
  const r = await ask(a.building, 'clash_pair', { a: a.discA, b: a.discB }, 'Find clashes between ' + a.discA + ' and ' + a.discB);
  if (r.ans.verdict !== 'OK') throw new Error('the Viewer says ' + r.ans.verdict + ': ' + r.ans.summary);
  // rows: how many detail rows come back (bim-compiler prompts/CLI_ERP_IVR.md §22.6): a whole number, or "all"; 20 when not given (as before)
  const cap = a.rows == null ? 20 : (String(a.rows).toLowerCase() === 'all' ? 0 : (/^[1-9]\d{0,5}$/.test(String(a.rows)) ? Number(a.rows) : NaN));
  if (Number.isNaN(cap)) throw new Error('rows must be a whole number or "all", got "' + a.rows + '"');
  return pack('viewer_clashes', a.building, r, cap);
}
function pack(verb, building, r, rowCap) {
  const a = r.ans, value = JSON.parse(JSON.stringify(a.value));
  if (process.env.VIEWER_VERB_BREAK === '1') {   // the witness's falsifier: the verb lies about the Viewer's number
    if (typeof value.total === 'number') value.total -= 1; else if (typeof value.bboxOverlaps === 'number') value.bboxOverlaps += 1;
  }
  if (process.env.VIEWER_VERB_OLDSUM === '1' && typeof value.meshClashes === 'number') {   // falsifier: restore the old double count (meshTrue + contained)
    value.meshClashes += value.contained || 0; value.cleared = value.bboxOverlaps - value.meshClashes - value.unknown;
  }
  const out = { verb, building, verdict: a.verdict, question: a.question, summary: a.summary, value, viewerLine: r.line, viewerLog: r.lines, source: a.sources, page: r.page };   // page: 'live' (the live Viewer page, a plain download) or 'checkout' (this tree's page)
  if (a.cols) { out.cols = a.cols; out.rowsTotal = (a.rows || []).length; out.rows = rowCap ? (a.rows || []).slice(0, rowCap) : a.rows; }
  if (r.pageErrors.length) out.pageErrors = r.pageErrors;
  return out;
}

module.exports = { viewerCounts, viewerClashes, resolveDb };

if (require.main === module) {
  const argv = process.argv.slice(2), verb = argv[0], arg = (k) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : undefined; };
  const f = verb === 'counts' ? () => viewerCounts({ building: arg('building'), by: arg('by') })
    : verb === 'clashes' ? () => viewerClashes({ building: arg('building'), discA: arg('a'), discB: arg('b'), rows: arg('rows') }) : null;
  if (verb === '__serve') serve(arg('building'), arg('state')).catch(e => { console.error('§VIEWER_VERB FAIL ' + (e && e.message || e)); process.exit(1); });   // the warm page (red1, §22.8): it stays up
  else if (!f) { console.error('usage: node viewer/tools/viewer_verbs.js counts --building B [--by discipline|storey] | clashes --building B --a ARC --b MEP [--rows N|all]'); process.exit(2); }
  else f().then(r => { console.log(JSON.stringify(r)); process.exit(0); }).catch(e => { console.error('§VIEWER_VERB FAIL ' + (e && e.message || e)); process.exit(1); });
}
