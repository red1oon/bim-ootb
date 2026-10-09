// W-KIT-1..4 (prompts/BIM_UTILITY_KNIFE.md §Installers): the zip BUILT IN THE PAGE (browser classic scripts, fetch) is valid, complete,
// checksummed, keeps exec bits, runs; and equals the zip the CLI builds for the same input (deterministic). Python zipfile = independent reader.
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os'), http = require('http'), crypto = require('crypto');
const puppeteer = require(process.env.PUPPETEER || '/home/red1/bim-compiler/node_modules/puppeteer');
const root = path.join(__dirname, '..', '..'), sample = process.argv[2];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bimkit-'));
let fails = 0; const ok = (id, c, m) => { console.log((c ? '§WITNESS PASS ' : '§WITNESS FAIL ') + id + ' ' + m); if (!c) fails++; };
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const f = path.join(root, u === '/' ? 'bim.html' : u); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'application/javascript' }[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
srv.listen(0, '127.0.0.1', async () => {
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] }), pg = await br.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('http://127.0.0.1:' + srv.address().port + '/bim.html', { waitUntil: 'load' });
  const b64 = await pg.evaluate(async () => { const sha = async (b) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b))).map((x) => x.toString(16).padStart(2, '0')).join(''); const r = await BIM_KIT.build(async (p) => new Uint8Array(await (await fetch(p)).arrayBuffer()), sha, { tools: ['upgrade', 'health'], os: 'sh' }); let s = ''; r.bytes.forEach((x) => (s += String.fromCharCode(x))); return btoa(s); });
  const pageZip = Buffer.from(b64, 'base64'); const zp = path.join(tmp, 'page.zip'); fs.writeFileSync(zp, pageZip);
  const cz = path.join(tmp, 'cli.zip'); cp.execFileSync('node', [path.join(root, 'bim-cli.js'), 'kit', 'upgrade', 'health', '--os', 'sh', '-o', cz]);
  ok('W-KIT-1', sha(pageZip) === sha(fs.readFileSync(cz)), 'page-built zip sha=' + sha(pageZip).slice(0, 16) + ' cli-built sha=' + sha(fs.readFileSync(cz)).slice(0, 16) + ' bytes=' + pageZip.length);
  const py = cp.spawnSync('python3', ['-c', "import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);print(z.testzip());print('\\n'.join('%o %s'%(i.external_attr>>16,i.filename) for i in z.infolist()))", zp], { encoding: 'utf8' });
  const lines = py.stdout.trim().split('\n'); ok('W-KIT-2', lines[0] === 'None', 'python zipfile.testzip=' + lines[0]);
  const exec = lines.slice(1).filter((l) => /BIM_.*\.sh$/.test(l)).every((l) => l.startsWith('100755')), plain = lines.slice(1).filter((l) => /\.js$/.test(l)).every((l) => l.startsWith('100644'));
  ok('W-KIT-3', exec && plain && lines.some((l) => /README\.txt/.test(l)) && lines.some((l) => /SHA256SUMS\.txt/.test(l)), 'launchers 0755, sources 0644, README+SHA256SUMS present; entries=' + (lines.length - 1));
  const d = path.join(tmp, 'x'); fs.mkdirSync(d); cp.execSync('unzip -q "' + zp + '" -d "' + d + '"');
  const chk = cp.spawnSync('sha256sum', ['-c', 'SHA256SUMS.txt'], { cwd: d, encoding: 'utf8' }); ok('W-KIT-4a', chk.status === 0, 'sha256sum -c: ' + chk.stdout.trim().split('\n').length + ' files, exit=' + chk.status);
  if (sample) { fs.copyFileSync(sample, path.join(d, 'a b.ifc')); const r = cp.spawnSync(path.join(d, 'BIM_upgrade.sh'), [path.join(d, 'a b.ifc')], { encoding: 'utf8' }); ok('W-KIT-4b', r.status === 0 && fs.existsSync(path.join(d, 'a b_ifc43.ifc')), 'extracted kit launcher ran exit=' + r.status); }
  ok('W-PAGE-ERRORS', errs.length === 0, 'pageerrors=' + errs.length);
  console.log('§WITNESS INCONCLUSIVE W-KIT-5 Windows Unblock/SmartScreen + macOS Gatekeeper behaviour are OS-side; the README states the steps, owner checks once per OS');
  await br.close(); srv.close(); process.exit(fails ? 1 : 0);
});
