// W-WIN-2 / W-OS: the GENERATED launcher stub, run from a kit folder whose path contains spaces, on files whose names contain spaces,
// several files at once, produces name_<tool>.ifc beside each input. Runs the real stub with the host OS shell (cmd on Windows, sh elsewhere).
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const T = require('../tools/table.js');
const src = process.argv.slice(2); if (!src.length) { console.error('usage: files'); process.exit(2); }
const root = path.join(__dirname, '..', '..'), win = process.platform === 'win32';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bim kit '));
const kit = path.join(tmp, 'my tool kit'); fs.mkdirSync(path.join(kit, 'bim', 'tools'), { recursive: true });
fs.copyFileSync(path.join(root, 'bim-cli.js'), path.join(kit, 'bim-cli.js'));
for (const f of fs.readdirSync(path.join(root, 'bim', 'tools'))) fs.copyFileSync(path.join(root, 'bim', 'tools', f), path.join(kit, 'bim', 'tools', f));
let fails = 0; const ok = (id, c, m) => { console.log((c ? '§WITNESS PASS ' : '§WITNESS FAIL ') + id + ' ' + m); if (!c) fails++; };
const tool = T.find((t) => t.id === 'upgrade'), st = global.BIM_STUB || (require('../tools/table.js'), global.BIM_STUB);
const s = st(tool, win ? 'win' : 'sh'); const sp = path.join(kit, s.name); fs.writeFileSync(sp, s.body); if (!win) fs.chmodSync(sp, 0o755);
ok('W-WIN-2a', !win || /\r\n/.test(s.body) && !/[^\r]\n/.test(s.body), 'stub=' + s.name + ' lineEndings=' + (/\r\n/.test(s.body) ? 'CRLF' : 'LF') + ' (.bat must be CRLF)');
const data = path.join(tmp, 'my models'); fs.mkdirSync(data); const ins = [];
src.forEach((f, i) => { const d = path.join(data, 'Model ' + (i + 1) + ' (copy).IFC'); fs.copyFileSync(f, d); ins.push(d); });   // upper-case .IFC on purpose
// Windows: cmd /s /c "<whole command line in one more pair of quotes>" is the only form that survives spaces in BOTH the .bat path and its arguments.
const r = win ? cp.spawnSync('cmd.exe', ['/d', '/s', '/c', '"' + '"' + sp + '" ' + ins.map((p) => '"' + p + '"').join(' ') + '"'], { encoding: 'utf8', windowsVerbatimArguments: true }) : cp.spawnSync(sp, ins, { encoding: 'utf8' });
if (r.status !== 0) console.log('§LAUNCHER_RAW status=' + r.status + ' error=' + (r.error && r.error.message) + '\n--stdout--\n' + (r.stdout || '') + '\n--stderr--\n' + (r.stderr || '') + '\n--bat--\n' + s.body);
console.log(((r.stdout || '') + (r.stderr || '')).split('\n').filter((l) => /§UPGRADE |error|Error/.test(l)).join('\n').slice(0, 900));
ok('W-WIN-2b', r.status === 0, 'launcher exit=' + r.status);
ins.forEach((p) => { const o = path.join(path.dirname(p), path.basename(p).replace(/\.ifc$/i, '') + '_ifc43.ifc'); ok('W-WIN-2c', fs.existsSync(o) && fs.statSync(o).size > 1000 && /IFC4X3_ADD2/.test(fs.readFileSync(o, 'utf8').slice(0, 800)), 'output beside input: ' + path.basename(o) + ' bytes=' + (fs.existsSync(o) ? fs.statSync(o).size : 0)); });
console.log('§WITNESS ' + (win ? 'RAN-ON-WINDOWS' : 'INCONCLUSIVE-FOR-WINDOWS (ran on ' + process.platform + '; the .bat path is only proven by the windows-latest CI job)'));
process.exit(fails ? 1 : 0);
