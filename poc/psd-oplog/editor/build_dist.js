// Usage: node editor/build_dist.js [outdir]   Builds a self-contained copy of the editor (index.html + one app.js + the two licence notes) that works from file:// or any static host. Default outdir: editor/dist (generated, not committed).
const fs = require('fs'), path = require('path'); const E = __dirname, out = path.resolve(process.argv[2] || path.join(E, 'dist')); fs.mkdirSync(out, { recursive: true });
const html = fs.readFileSync(path.join(E, 'index.html'), 'utf8'), tags = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)], files = tags.map((m) => path.resolve(E, m[1]));
const app = files.map((f) => `/* ===== ${path.relative(path.join(E, '..'), f)} ===== */\n` + fs.readFileSync(f, 'utf8')).join('\n;\n'); fs.writeFileSync(path.join(out, 'app.js'), app);
let first = true; const page = html.replace(/<script src="[^"]+"><\/script>/g, () => { if (first) { first = false; return '<script src="app.js"></script>'; } return ''; }); fs.writeFileSync(path.join(out, 'index.html'), page);
fs.copyFileSync(path.join(E, 'vendor', 'ag-psd.LICENSE'), path.join(out, 'ag-psd.LICENSE')); fs.writeFileSync(path.join(out, 'NOTICE.txt'), 'OpLog Paint (psd-oplog POC). Contains ag-psd 31.0.3 (MIT), see ag-psd.LICENSE. Open index.html in a browser; nothing to install.\n');
console.log(`built ${out}: app.js ${app.length} bytes from ${files.length} scripts`);
