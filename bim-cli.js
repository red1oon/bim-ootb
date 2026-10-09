#!/usr/bin/env node
// bim-cli.js — Node shell over bim/tools/*.js (prompts/BIM_UTILITY_KNIFE.md §3b). No dependencies.
//   node bim-cli.js <tool> in.ifc [more.ifc …] [--json] [--notify] [--out-dir DIR] [--class C] [--guid G] [--name TXT] [--storey NAME] [--fillings]
//   node bim-cli.js open in.ifc        interactive: serve bim.html on 127.0.0.1 and open the browser with the model
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), cp = require('child_process');
const D = path.join(__dirname, 'bim', 'tools');
const TABLE = require(path.join(D, 'table.js'));
const LIBS = { BIM_UPGRADE: require(path.join(D, 'upgrade.js')), BIM_EXTRACT: require(path.join(D, 'extract.js')), BIM_SPLIT: require(path.join(D, 'split.js')), BIM_HEALTH: require(path.join(D, 'health.js')) };

function parseArgs(av) {
  const o = { files: [], classes: [], guids: [] };
  for (let i = 0; i < av.length; i++) {
    const a = av[i];
    if (a === '--json') o.json = true; else if (a === '--notify') o.notify = true; else if (a === '--fillings') o.fillings = true;
    else if (a === '--out-dir') o.outDir = av[++i]; else if (a === '--class') o.classes.push(av[++i]); else if (a === '--guid') o.guids.push(av[++i]);
    else if (a === '--name') o.nameContains = av[++i]; else if (a === '--storey') o.storey = av[++i];
    else o.files.push(a);
  }
  return o;
}
function notify(title, msg) {
  try {
    if (process.platform === 'win32') cp.spawn('powershell', ['-NoProfile', '-Command', `Add-Type -AssemblyName System.Windows.Forms;$n=New-Object System.Windows.Forms.NotifyIcon;$n.Icon=[System.Drawing.SystemIcons]::Information;$n.Visible=$true;$n.ShowBalloonTip(5000,'${title}','${msg.replace(/'/g, '')}',0);Start-Sleep 5;$n.Dispose()`], { stdio: 'ignore', detached: true }).unref();
    else if (process.platform === 'darwin') cp.spawn('osascript', ['-e', `display notification "${msg.replace(/"/g, '')}" with title "${title}"`], { stdio: 'ignore', detached: true }).unref();
    else cp.spawn('notify-send', [title, msg], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  } catch (e) { /* notification is best-effort */ }
}
const outPath = (inFile, o, suffix, ext) => path.join(o.outDir || path.dirname(inFile), path.basename(inFile).replace(/\.ifc$/i, '') + '_' + suffix + (ext || '.ifc'));

function runTool(tool, file, o) {
  const bytes = fs.readFileSync(file), lib = LIBS[tool.lib];
  const t0 = Date.now(), res = lib.run(bytes, o), written = [];
  if (tool.id === 'split') {
    for (const p of res.parts) if (!p.empty) { const f = outPath(file, o, p.name.replace(/[^\w.-]+/g, '_')); fs.writeFileSync(f, p.bytes); written.push(f); }
  } else if (tool.id === 'health') {
    const f = outPath(file, o, 'health', '.json'); fs.writeFileSync(f, JSON.stringify(res.report, null, 2)); written.push(f);
  } else if (res.bytes) { const f = outPath(file, o, tool.suffix); fs.writeFileSync(f, res.bytes); written.push(f); }
  const rep = res.report;
  console.log(`§${tool.id.toUpperCase()} file=${path.basename(file)} verdict=${rep.verdict} ms=${Date.now() - t0} out=${written.map((w) => path.basename(w)).join(',') || '-'}`);
  console.log(`§${tool.id.toUpperCase()}_REPORT ${JSON.stringify(rep)}`);
  return { file, written, report: rep };
}

function openInteractive(file) {
  const root = __dirname, abs = path.resolve(file), name = path.basename(abs);
  const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
  let lastPing = Date.now(), seen = false;
  const srv = http.createServer((req, res) => {
    let u; try { u = decodeURIComponent(req.url.split('?')[0]); } catch (e) { res.writeHead(400); res.end('bad url'); return; }
    if (u === '/__ping') { lastPing = Date.now(); seen = true; res.end('ok'); return; }
    if (u === '/__file') { res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'X-Name': encodeURIComponent(name) }); fs.createReadStream(abs).pipe(res); return; }
    if (u === '/__save') { // page posts the exported IFC; saved beside the input
      const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => { const f = outPath(abs, {}, 'extract'); fs.writeFileSync(f, Buffer.concat(chunks)); console.log('§SAVE ' + f); res.end(f); }); return;
    }
    const f = path.normalize(path.join(root, u === '/' ? 'bim.html' : u));
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  srv.listen(0, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${srv.address().port}/bim.html?tool=extract&served=1`;
    console.log('§OPEN ' + url);
    const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    cp.spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).on('error', () => console.log('open this URL in a browser: ' + url)).unref();
  });
  // a closed terminal sends SIGHUP; this server idle-exits by itself, so do not die with the terminal. Log WHY we exit, never silently.
  process.on('SIGHUP', () => console.log('§OPEN SIGHUP ignored'));
  process.on('SIGTERM', () => { console.log('§OPEN_EXIT SIGTERM'); process.exit(0); });
  process.on('uncaughtException', (e) => console.log('§OPEN_ERROR ' + (e && e.stack || e)));
  setInterval(() => { if (Date.now() - lastPing > (seen ? 20000 : 120000)) { console.log('§OPEN_EXIT idle'); process.exit(0); } }, 5000);
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === '--help') { console.log('tools: ' + TABLE.map((t) => t.id + ' (' + t.mode + ')').join(', ') + ', open'); return; }
  const o = parseArgs(rest);
  if (cmd === 'open') { if (!o.files[0]) { console.error('usage: open <file.ifc>'); process.exit(2); } openInteractive(o.files[0]); return; }
  if (cmd === 'kit') {
    const KIT = require(path.join(D, 'kit.js'));   // only the kit BUILDER needs zip/kit; the shipped kit does not   // node bim-cli.js kit [tool …] [--os win|mac|sh] [-o out.zip]
    const ids = o.files.filter((x) => TABLE.some((t) => t.id === x)), osArg = rest.indexOf('--os') >= 0 ? rest[rest.indexOf('--os') + 1] : (process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'sh');
    const outZip = rest.indexOf('-o') >= 0 ? rest[rest.indexOf('-o') + 1] : 'bim-tools-kit.zip', crypto = require('crypto');
    KIT.build((p) => Promise.resolve(fs.readFileSync(path.join(__dirname, p))), (b) => Promise.resolve(crypto.createHash('sha256').update(b).digest('hex')), { tools: ids.length ? ids : null, os: osArg })
      .then((r) => { fs.writeFileSync(outZip, r.bytes); console.log('§KIT out=' + outZip + ' os=' + osArg + ' tools=' + r.tools.join(',') + ' files=' + r.names.length + ' bytes=' + r.bytes.length + ' sha256=' + crypto.createHash('sha256').update(r.bytes).digest('hex')); })
      .catch((e) => { console.error(e.message); process.exit(1); });
    return;
  }
  const tool = TABLE.find((t) => t.id === cmd);
  if (!tool) { console.error('unknown tool: ' + cmd); process.exit(2); }
  if (!o.files.length) { console.error('no input file'); process.exit(2); }
  let bad = 0; const all = [];
  for (const f of o.files) {
    try { const r = runTool(tool, f, o); all.push(r); if (r.report.verdict === 'FAIL') bad++; }
    catch (e) { bad++; console.log(`§${tool.id.toUpperCase()} file=${path.basename(f)} verdict=ERROR msg=${e.message}`); }
  }
  if (o.json) console.log(JSON.stringify(all));
  if (o.notify) notify('BIM tools', `${tool.name}: ${all.length - bad}/${o.files.length} done`);
  process.exit(bad ? 1 : 0);
}
main();
