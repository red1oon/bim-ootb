#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC (W-X0-INSTALL), bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.10, bim-ootb #2938
// Packs one extension folder into a standard .vsix so it installs with VS Code's own command:
//     node devtools/vscode/pack.js                 → writes devtools/vscode/dist/x0-navigator-<version>.vsix
//     code --install-extension devtools/vscode/dist/x0-navigator-<version>.vsix
// Why not a symlink into ~/.vscode/extensions: VS Code ignores a folder that its extensions.json does not list
// (measured, VS Code 1.146.0). Why not `vsce`: it is an npm package; this file needs only node.
// A .vsix is a zip with the extension under extension/, a manifest and a content-types file. tests/ are left out.
// Usage: node devtools/vscode/pack.js [<extension folder>] [--out <dir>] [--install]
//   --install  also runs `code --install-extension` (the developer's own VS Code). Never run by a witness on a real profile.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const cp = require('child_process');

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

/** A zip file (deflate) from [{name, data: Buffer}]. Fixed timestamp: the same input gives the same bytes. */
function zip(entries) {
  const parts = [], central = [];
  let offset = 0;
  const DOS_TIME = 0, DOS_DATE = (2026 - 1980) << 9 | 1 << 5 | 1;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8'), comp = zlib.deflateRawSync(e.data, { level: 9 }), crc = crc32(e.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(DOS_TIME, 10); local.writeUInt16LE(DOS_DATE, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(e.data.length, 22); local.writeUInt16LE(name.length, 26);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(8, 10);
    cen.writeUInt16LE(DOS_TIME, 12); cen.writeUInt16LE(DOS_DATE, 14); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(comp.length, 20);
    cen.writeUInt32LE(e.data.length, 24); cen.writeUInt16LE(name.length, 28); cen.writeUInt32LE(offset, 42);
    parts.push(local, name, comp); central.push(cen, name);
    offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat(parts.concat([cd, end]));
}

const xml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function listFiles(dir, base, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) { if (e.name !== 'tests' && e.name !== 'node_modules' && !e.name.startsWith('.')) listFiles(path.join(dir, e.name), rel, out); } else if (e.isFile()) out.push(rel);
  }
  return out;
}

/** Pack `extDir`. Returns { file, files, bytes, id, version }. */
function pack(extDir, outDir) {
  const pkg = JSON.parse(fs.readFileSync(path.join(extDir, 'package.json'), 'utf8'));
  const files = listFiles(extDir, '', []);
  const manifest = '<?xml version="1.0" encoding="utf-8"?>\n'
    + '<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">\n <Metadata>\n'
    + '  <Identity Language="en-US" Id="' + xml(pkg.name) + '" Version="' + xml(pkg.version) + '" Publisher="' + xml(pkg.publisher) + '"/>\n'
    + '  <DisplayName>' + xml(pkg.displayName || pkg.name) + '</DisplayName>\n  <Description xml:space="preserve">' + xml(pkg.description || '') + '</Description>\n'
    + '  <Categories>' + xml((pkg.categories || ['Other']).join(',')) + '</Categories>\n'
    + '  <Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="' + xml(pkg.engines.vscode) + '"/></Properties>\n </Metadata>\n'
    + ' <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation>\n <Dependencies/>\n'
    + ' <Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets>\n</PackageManifest>\n';
  const exts = Array.from(new Set(files.map(f => path.extname(f).slice(1).toLowerCase()).filter(Boolean))).sort();
  const types = { json: 'application/json', js: 'application/javascript', md: 'text/markdown', vsixmanifest: 'text/xml' };
  const ct = '<?xml version="1.0" encoding="utf-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + exts.concat(['vsixmanifest']).map(x => '<Default Extension="' + x + '" ContentType="' + (types[x] || 'application/octet-stream') + '"/>').join('') + '</Types>\n';
  const entries = [{ name: 'extension.vsixmanifest', data: Buffer.from(manifest) }, { name: '[Content_Types].xml', data: Buffer.from(ct) }]
    .concat(files.map(f => ({ name: 'extension/' + f, data: fs.readFileSync(path.join(extDir, f)) })));
  const buf = zip(entries);
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, pkg.name + '-' + pkg.version + '.vsix');
  fs.writeFileSync(file, buf);
  return { file, files, bytes: buf.length, id: pkg.publisher + '.' + pkg.name, version: pkg.version };
}

module.exports = { pack, zip, crc32 };
if (require.main === module) {
  const a = process.argv.slice(2);
  const oi = a.indexOf('--out');
  const outDir = oi >= 0 ? path.resolve(a[oi + 1]) : path.join(__dirname, 'dist');
  const extDir = path.resolve(a.find((x, i) => !x.startsWith('--') && (oi < 0 || i !== oi + 1)) || path.join(__dirname, 'x0-navigator'));
  const r = pack(extDir, outDir);
  console.log('§X0_PACK id=' + r.id + ' version=' + r.version + ' files=' + r.files.length + ' bytes=' + r.bytes + ' file=' + r.file);
  if (a.includes('--install')) {
    const i = cp.spawnSync('code', ['--install-extension', r.file, '--force'], { stdio: 'inherit' });
    console.log('§X0_PACK_INSTALL exit=' + i.status + (i.status === 0 ? '  → reload VS Code (Developer: Reload Window)' : '  → is `code` on your PATH? Otherwise: Extensions view ▸ … ▸ Install from VSIX'));
    process.exitCode = i.status || 0;
  } else console.log('install:  code --install-extension ' + path.relative(process.cwd(), r.file) + '      (or: Extensions view ▸ … ▸ Install from VSIX)');
}
