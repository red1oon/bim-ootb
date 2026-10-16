// W-INST-1..3: the kit's own INSTALL script, run from an UNZIPPED kit, copies the tools to a permanent folder, creates one icon per tool, and the INSTALLED launcher then runs on a file whose path has spaces.
// Every target is redirected by BIM_DEST / BIM_DESKTOP / BIM_SENDTO so the test never touches the real Desktop. Works on the host OS (cmd/PowerShell on Windows, sh elsewhere).
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const root = path.join(__dirname, '..', '..'), sample = process.argv[2], win = process.platform === 'win32', mac = process.platform === 'darwin';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bim inst ')), osName = win ? 'win' : mac ? 'mac' : 'sh';
let fails = 0; const ok = (id, c, m) => { console.log((c ? '§WITNESS PASS ' : '§WITNESS FAIL ') + id + ' ' + m); if (!c) fails++; };
const zip = path.join(tmp, 'kit.zip'); cp.execFileSync('node', [path.join(root, 'bim-cli.js'), 'kit', 'upgrade', 'health', '--os', osName, '-o', zip]);
const kit = path.join(tmp, 'unzipped kit'); fs.mkdirSync(kit);
cp.execFileSync(win ? 'python' : 'python3', ['-c', 'import zipfile,sys,os;z=zipfile.ZipFile(sys.argv[1]);z.extractall(sys.argv[2]);\nfor i in z.infolist():\n  m=i.external_attr>>16\n  if m: os.chmod(os.path.join(sys.argv[2],i.filename), m & 0o777)', zip, kit]);
const dest = path.join(tmp, 'installed here'), desk = path.join(tmp, 'Desktop'), sendto = path.join(tmp, 'SendTo');
const env = Object.assign({}, process.env, { BIM_DEST: dest, BIM_DESKTOP: desk, BIM_SENDTO: sendto });
const inst = path.join(kit, win ? 'INSTALL.bat' : 'install.sh');
ok('W-INST-0', fs.existsSync(inst), 'kit contains ' + path.basename(inst));
const r = win ? cp.spawnSync('cmd.exe', ['/d', '/s', '/c', '"' + '"' + inst + '" < NUL"'], { env, encoding: 'utf8', windowsVerbatimArguments: true }) : cp.spawnSync(inst, [], { env, encoding: 'utf8' });
if (r.status !== 0) console.log('§INSTALL_RAW status=' + r.status + ' err=' + (r.error && r.error.message) + '\n' + (r.stdout || '') + '\n' + (r.stderr || ''));
ok('W-INST-1a', r.status === 0, 'installer exit=' + r.status);
const ext = win ? '.bat' : mac ? '.command' : '.sh';
const tools = ['upgrade', 'health'];
ok('W-INST-1b', fs.existsSync(path.join(dest, 'bim-cli.js')) && tools.every((t) => fs.existsSync(path.join(dest, 'BIM_' + t + ext))), 'copied to "' + dest + '": ' + (fs.existsSync(dest) ? fs.readdirSync(dest).join(',') : 'missing'));
if (!mac) {
  const icons = fs.existsSync(desk) ? fs.readdirSync(desk) : [], want = win ? tools.map((t) => 'BIM_' + t + '.lnk') : tools.map((t) => 'BIM_' + t + '.desktop');
  ok('W-INST-2', want.every((w) => icons.includes(w)), 'desktop icons ' + JSON.stringify(icons) + ' want ' + JSON.stringify(want));
  const st = fs.existsSync(sendto) ? fs.readdirSync(sendto) : []; ok('W-INST-2b', tools.every((t) => st.some((n) => n.indexOf('BIM_' + t) === 0)), (win ? 'Send-to' : 'file-manager scripts') + ' ' + JSON.stringify(st));
} else console.log('§WITNESS INCONCLUSIVE W-INST-2 macOS: no Desktop icons are generated (macOS cannot take a dropped file on a launcher); installer prints the terminal lines instead');
if (sample) {   // the INSTALLED launcher on a path with spaces
  const d = path.join(tmp, 'my models'); fs.mkdirSync(d); const f = path.join(d, 'a model (1).IFC'); fs.copyFileSync(sample, f);
  const l = path.join(dest, 'BIM_upgrade' + ext);
  const rr = win ? cp.spawnSync('cmd.exe', ['/d', '/s', '/c', '"' + '"' + l + '" "' + f + '"' + '"'], { encoding: 'utf8', windowsVerbatimArguments: true }) : cp.spawnSync(l, [f], { encoding: 'utf8' });
  const out = path.join(d, 'a model (1)_ifc43.ifc');
  ok('W-INST-3', rr.status === 0 && fs.existsSync(out) && fs.statSync(out).size > 1000, 'installed launcher exit=' + rr.status + ' output=' + (fs.existsSync(out) ? fs.statSync(out).size + ' bytes' : 'missing'));
}
console.log('§WITNESS ' + (win ? 'RAN-ON-WINDOWS' : 'INCONCLUSIVE-FOR-WINDOWS (ran on ' + process.platform + ')') + ' — real Desktop/Send-to placement is only redirected here, not exercised');
process.exit(fails ? 1 : 0);
