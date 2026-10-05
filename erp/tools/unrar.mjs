// tools/unrar.mjs — unpack a .rar with node-unrar-js (pure JS). Used by fetch_i18n_packs.sh for the 2008 Arabic pack.
// Needs: npm i node-unrar-js@2 (resolved from NODE_PATH or a node_modules beside it). Usage: node unrar.mjs <file.rar> <outdir>
import { createExtractorFromData } from 'node-unrar-js';
import fs from 'fs'; import path from 'path';
const buf = fs.readFileSync(process.argv[2]); const out=process.argv[3];
const ex = await createExtractorFromData({ data: Uint8Array.from(buf).buffer });
const { files } = ex.extract();
for (const f of files) { if (f.fileHeader.flags.directory) continue; const p=path.join(out,f.fileHeader.name.replace(/\\/g,'/')); fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p, f.extraction); console.log(p); }
