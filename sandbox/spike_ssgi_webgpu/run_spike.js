// Headless driver for the SSGI/WebGPU spike — no npm deps (uses the repo's cdp.js CDP client).
// Serves the worktree root; /buildings/* is read from the main checkout (the DBs are not in git).
// Usage: node run_spike.js [--db Clinic] [--view interior|exterior] [--traa] [--no-velocity] [--core185] [--out dir]
// Chrome flags: the bake's real-GPU WebGL flags (--use-angle=gl-egl) PLUS WebGPU on; probe 2026-09-21 on this box:
//   --enable-unsafe-webgpu --enable-features=Vulkan alone → SwiftShader adapter; adding --use-angle=gl-egl or
//   --use-angle=vulkan → nvidia/lovelace adapter. (WebGL headless '--use-angle=vulkan' = NO-CONTEXT per cli_silent_bake.)
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const cdp = require(path.join(__dirname, '..', '..', 'cdp.js'));
const ROOT = path.resolve(__dirname, '..', '..');
const MAIN_BUILDINGS = '/home/red1/bim-ootb/buildings';
const argv = process.argv.slice(2);
function opt(name, dflt) { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; }
const DBN = opt('--db', 'Clinic'), VIEW = opt('--view', 'interior'), OUT = opt('--out', path.join(__dirname, 'out'));
const q = new URLSearchParams({ db: DBN, view: VIEW });
if (argv.includes('--traa')) q.set('traa', '1');
if (argv.includes('--no-velocity')) q.set('velocity', '0');
if (argv.includes('--core185')) q.set('core', '185');
if (argv.includes('--present')) q.set('present', '1');
if (argv.includes('--nogi')) q.set('nogi', '1');
// --dbfile <name.db>: exact filename under /buildings/ (spike.js honours ?dbfile=). Needed for
// HHS_Office_Federated_silent.db — the only db carrying the authored cinema_path table.
if (opt('--dbfile')) q.set('dbfile', opt('--dbfile'));
if (opt('--w')) q.set('w', opt('--w')); if (opt('--h')) q.set('h', opt('--h'));
if (opt('--frames')) q.set('frames', opt('--frames'));
if (opt('--eye3')) q.set('eye3', opt('--eye3')); if (opt('--look3')) q.set('look3', opt('--look3'));
// SEQ mode: --posesFile <path relative to the worktree root> — a JSON array of {x,y,z,tx,ty,tz} poses.
// Frames get POSTed back to this same driver's server (see the POST handler below) into --seqOut.
const POSES_FILE = opt('--posesFile');
if (POSES_FILE) q.set('posesFile', '/' + POSES_FILE.replace(/^\/+/, ''));
if (argv.includes('--seqRaw')) q.set('seqRaw', '1');
if (argv.includes('--seqSimple')) q.set('seqSimple', '1');
if (argv.includes('--seqDelay')) q.set('seqDelay', '1');
if (argv.includes('--seqProbeRaw')) q.set('seqProbeRaw', '1');
const SEQ_OUT = opt('--seqOut', path.join(OUT, 'frames'));
if (POSES_FILE) fs.mkdirSync(SEQ_OUT, { recursive: true });
const ANGLE = opt('--angle', 'gl-egl');   // gl-egl (bake's WebGL path) | vulkan
const HEADFUL = argv.includes('--headful');
const LABEL = opt('--label');   // free-form tag suffix, needed when --eye3/--look3 poses would otherwise collide
const TAG = [DBN, VIEW, q.get('traa') ? 'traa' : 'notraa', q.get('velocity') === '0' ? 'novel' : 'vel', q.get('core') === '185' ? 'r185' : 'r186', q.get('nogi') === '1' ? 'noGI' : 'GI', ANGLE, (q.get('w') || 1280) + 'x' + (q.get('h') || 720), HEADFUL ? 'headful' : 'headless'].concat(LABEL ? [LABEL] : []).join('_');
const PORT = 8800 + Math.floor(Math.random() * 100), DBG = 9400 + Math.floor(Math.random() * 100);
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.json': 'application/json' };
fs.mkdirSync(OUT, { recursive: true });

let framesSaved = 0;
const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/__saveFrame/')) {
    const idx = req.url.slice('/__saveFrame/'.length);
    const chunks = [];
    req.on('data', d => chunks.push(d));
    req.on('end', () => {
      fs.writeFileSync(path.join(SEQ_OUT, `frame_${idx}.png`), Buffer.concat(chunks));
      framesSaved++;
      res.writeHead(200); res.end();
    });
    return;
  }
  const u = decodeURIComponent(req.url.split('?')[0]);
  let p = path.join(ROOT, u);
  if (u.startsWith('/buildings/') && !fs.existsSync(p)) p = path.join(MAIN_BUILDINGS, u.slice('/buildings/'.length));
  fs.stat(p, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
    fs.createReadStream(p).pipe(res);
  });
});

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const url = `http://127.0.0.1:${PORT}/sandbox/spike_ssgi_webgpu/index.html?${q}`;
  const args = [...(HEADFUL ? [] : ['--headless=new']), '--no-sandbox', '--hide-crash-restore-bubble', `--remote-debugging-port=${DBG}`,
    `--user-data-dir=/tmp/claude-1000/-home-red1/e12d8776-72b0-49b4-9662-b2fe92709ede/scratchpad/udd-spike-${DBG}`,
    '--window-size=1300,760', '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--ignore-gpu-blocklist', '--use-angle=' + ANGLE, url];
  const spawnEnv = HEADFUL ? Object.assign({}, process.env, { DISPLAY: process.env.DISPLAY || ':0' }) : process.env;
  const chrome = spawn('/usr/bin/google-chrome', args, { stdio: ['ignore', 'ignore', 'pipe'], env: spawnEnv });
  let stderr = ''; chrome.stderr.on('data', d => { stderr += d; });
  let page = null;
  for (let i = 0; i < 80 && !page; i++) { await new Promise(r => setTimeout(r, 250)); try { const t = await cdp.httpJson(DBG, '/json'); page = t.find(x => x.type === 'page' && x.url.includes('spike_ssgi_webgpu')); } catch (e) {} }
  if (!page) { console.log('§SPIKE_DRIVER no page target; chrome stderr tail:\n' + stderr.slice(-1500)); chrome.kill('SIGKILL'); server.close(); process.exit(2); }
  const c = await cdp.connect(page.webSocketDebuggerUrl);
  const consoleLines = [];
  c.on(msg => {
    if (msg.method === 'Runtime.consoleAPICalled') {
      const txt = msg.params.args.map(a => a.value !== undefined ? String(a.value) : (a.description || a.type)).join(' ');
      consoleLines.push(`[${msg.params.type}] ${txt}`);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails; consoleLines.push(`[EXCEPTION] ${d.text} ${(d.exception && d.exception.description) || ''}`);
    } else if (msg.method === 'Log.entryAdded') {
      consoleLines.push(`[log.${msg.params.entry.level}] ${msg.params.entry.text}`);
    }
  });
  await c.send('Runtime.enable', {}); await c.send('Log.enable', {}); await c.send('Page.enable', {});
  const t0 = Date.now(); let val = null;
  const DEADLINE = +(opt('--timeout', '240')) * 1000;
  while (Date.now() - t0 < DEADLINE) {
    const r = await c.send('Runtime.evaluate', { expression: 'window.__spike || null', returnByValue: true });
    val = r.result && r.result.result && r.result.result.value; if (val) break;
    await new Promise(r => setTimeout(r, 500));
  }
  let shot = null;
  // prefer the exact tone-mapped canvas pixels (window.__spikeShotPNG, a data: URL) over Page.captureScreenshot —
  // the latter photographs page compositing (log-div/canvas stacking order), not guaranteed to show the canvas.
  try {
    const r2 = await c.send('Runtime.evaluate', { expression: 'window.__spikeShotPNG || null', returnByValue: true });
    const durl = r2.result && r2.result.result && r2.result.result.value;
    if (durl) { shot = path.join(OUT, `shot_${TAG}.png`); fs.writeFileSync(shot, Buffer.from(durl.split(',')[1], 'base64')); }
  } catch (e) {}
  if (!shot) { try { const s = await c.send('Page.captureScreenshot', { format: 'png' }); if (s.result && s.result.data) { shot = path.join(OUT, `shot_${TAG}.png`); fs.writeFileSync(shot, Buffer.from(s.result.data, 'base64')); } } catch (e) {} }
  const logPath = path.join(OUT, `console_${TAG}.log`);
  fs.writeFileSync(logPath, consoleLines.join('\n') + '\n--- chrome stderr (gpu lines) ---\n' + stderr.split('\n').filter(l => /gpu|vulkan|dawn|webgpu|angle/i.test(l)).join('\n'));
  if (val) fs.writeFileSync(path.join(OUT, `result_${TAG}.json`), val);
  console.log(`§SPIKE_DRIVER tag=${TAG} elapsed=${((Date.now() - t0) / 1000).toFixed(1)}s consoleLines=${consoleLines.length} log=${logPath} shot=${shot} framesSaved=${framesSaved}`);
  console.log(val ? val : '§SPIKE_DRIVER TIMEOUT — no window.__spike');
  const bad = consoleLines.filter(l => /\[(error|warning|EXCEPTION|log\.error|log\.warning)\]/.test(l));
  if (bad.length) console.log('§SPIKE_DRIVER console errors/warnings (' + bad.length + '):\n' + bad.slice(0, 25).join('\n'));
  c.close(); chrome.kill('SIGKILL'); server.close(); process.exit(val ? 0 : 1);
})();
