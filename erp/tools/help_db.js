// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — the help tools' view of the DB the PAGE runs (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.16 C4). READ THE § line on stderr after a run.
// THE ISSUE: the node help tools (help_records.js, the witnesses' _hq.js) read the RAW seed through the sqlite3 CLI, but since §19.16 C2 the how-to lives in the context-help
//   BOOT OVERLAY (ad_ctxhelp_overlay.js), which only the page's DB has. So: one cached SQLite file = the seed + the hashed patches (as erp_cli.js patchFiles, the page's
//   seed_patch.js) + the context-help overlay rows (the same files the page loads). Keyed on the content of every input, so it cannot be stale. Only the HOW-TO is read from it;
//   the other help records keep reading the raw seed as before (no ripple). The other boot overlays are not applied: they do not touch the context-help tables.
// q(sql) -> rows, like the tools' raw-seed q. Env: ERP_SEED_DB (the seed), HELP_DB_CACHE (the cache folder).
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const ERP = path.join(__dirname, '..'), SEED = process.env.ERP_SEED_DB || path.join(ERP, 'ad_seed.db');
const CACHE = process.env.HELP_DB_CACHE || path.join(os.homedir(), '.cache', 'erp_help_db');
const PATCHES = [path.basename(SEED) + '.sql', 'mfg.sql'].map((f) => path.join(ERP, 'patches', f)).filter((f) => fs.existsSync(f));
const ROWS = ['ad_ctxhelp_rows.js', 'ad_ctxhelp_app_rows.js'].map((f) => path.join(ERP, f)).filter((f) => fs.existsSync(f));
let file = null;
function build() {
  const h = crypto.createHash('sha256'), st = fs.statSync(SEED); h.update(SEED + '|' + st.size + '|' + st.mtimeMs);
  PATCHES.concat(ROWS, [path.join(ERP, 'ad_ctxhelp_overlay.js')]).forEach((f) => h.update(fs.readFileSync(f)));
  const key = h.digest('hex').slice(0, 16), f = path.join(CACHE, 'help_' + key + '.db');
  if (fs.existsSync(f)) return f;
  fs.mkdirSync(CACHE, { recursive: true }); const tmp = f + '.' + process.pid + '.tmp'; fs.copyFileSync(SEED, tmp);
  const t0 = Date.now(), run = (sql) => cp.spawnSync('sqlite3', [tmp], { input: sql, encoding: 'utf8', maxBuffer: 1 << 29 });
  PATCHES.forEach((p) => run(fs.readFileSync(p, 'utf8')));   // sqlite3 continues past a failing statement, as the page's patch loop does
  const D = require(ROWS[0]), A = ROWS[1] ? require(ROWS[1]) : { rows: [] };
  const r = run('BEGIN;\n' + D.tables.map((T) => T.ddl + ';').join('\n') + '\n' + D.rows.concat(A.rows).map((x) => x + ';').join('\n') + '\nCOMMIT;\n');
  fs.renameSync(tmp, f);
  process.stderr.write('§HELP_DB built ' + path.basename(f) + ' patches=' + PATCHES.length + ' rows=' + (D.rows.length + A.rows.length) + ' ms=' + (Date.now() - t0) + (r.stderr ? ' errors=' + r.stderr.split('\n').filter(Boolean).length : '') + '\n');
  return f;
}
function q(sql) {
  if (!file) file = build();
  const r = cp.spawnSync('sqlite3', ['-readonly', '-json', file, sql], { encoding: 'utf8', maxBuffer: 1 << 29 }); if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout || '[]');
}
module.exports = { q, file: () => (file = file || build()) };
