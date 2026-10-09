// kit.js — builds the downloadable toolkit zip: bim-cli.js + tool modules + one launcher per ticked tool + README + SHA256SUMS.
// Readable files only (plain JS / text), no network calls anywhere in them. Spec: prompts/BIM_UTILITY_KNIFE.md §ZIP security.
(function (g) {
  'use strict';
  const Z = g.BIM_ZIP || require('./zip.js'), T = g.BIM_TOOLS || require('./table.js');
  const enc = (s) => (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s) : Buffer.from(s, 'utf8'));
  // every file a launcher needs at runtime — paths relative to the toolkit root
  const FILES = ['bim-cli.js', 'bim/tools/step.js', 'bim/tools/table.js', 'bim/tools/upgrade_map.js', 'bim/tools/upgrade.js', 'bim/tools/extract.js', 'bim/tools/split.js', 'bim/tools/health.js'];
  function readme(tools, os) {
    const w = os === 'win';
    return ['BIM TOOLS — toolkit', '====================', '',
      'What this is: small single-job IFC tools. Everything is plain JavaScript you can read (bim-cli.js and bim/tools/*.js).',
      'It makes NO network connection and never uploads your file. Results are written next to the file you give it.', '',
      'You need: Node.js 18 or newer (https://nodejs.org).', '',
      'HOW TO USE', w ? '  Drag one or more .ifc files onto a BIM_*.bat file. Output appears beside each input.' : '  In a terminal:  ./BIM_<tool>' + (os === 'mac' ? '.command' : '.sh') + ' file1.ifc file2.ifc    (output appears beside each input)',
      '  Tools in this kit: ' + tools.map((t) => t.id).join(', '), '',
      'IF YOUR COMPUTER WARNS ABOUT THE DOWNLOAD (this is normal for any downloaded script)',
      w ? '  Windows: right-click the .zip -> Properties -> tick "Unblock" -> OK, THEN extract. If SmartScreen still shows "Windows protected your PC": More info -> Run anyway.'
        : os === 'mac' ? '  macOS: the first time, right-click the launcher -> Open -> Open. If that is not offered: System Settings -> Privacy & Security -> "Open Anyway".\n  (macOS cannot take a file dropped on a .command; use the terminal line above.)'
          : '  Linux: if a launcher does not run, make it executable:  chmod +x BIM_*.sh   (file managers may also ask you to "Allow launching").', '',
      'CHECK IT IS UNALTERED', '  SHA256SUMS.txt lists a SHA-256 for every file in this kit. Compare with:  ' + (w ? 'certutil -hashfile <file> SHA256' : 'sha256sum -c SHA256SUMS.txt'), '',
      'No code signing: these are unsigned scripts. Read them first if you want to be sure.', ''].join(os === 'win' ? '\r\n' : '\n');
  }
  // read(path) -> Promise<Uint8Array>; sha(bytes) -> Promise<hex>. opts: {tools:[ids], os:'win'|'mac'|'sh'}
  async function build(read, sha, opts) {
    const os = opts.os || 'sh', tools = T.filter((t) => !opts.tools || opts.tools.indexOf(t.id) >= 0);
    if (!tools.length) throw new Error('no tools selected');
    const entries = [];
    for (const p of FILES) entries.push({ name: p, data: await read(p), exec: false });
    for (const t of tools) { const s = g.BIM_STUB(t, os); entries.push({ name: s.name, data: enc(s.body), exec: os !== 'win' }); }
    entries.push({ name: 'README.txt', data: enc(readme(tools, os)), exec: false });
    const sums = []; for (const e of entries) sums.push((await sha(e.data)) + '  ' + e.name);
    entries.push({ name: 'SHA256SUMS.txt', data: enc(sums.join('\n') + '\n'), exec: false });
    return { bytes: Z.build(entries), names: entries.map((e) => e.name), tools: tools.map((t) => t.id) };
  }
  const api = { build, FILES, readme };
  g.BIM_KIT = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
