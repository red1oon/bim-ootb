// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — idempiere_migrate_form.mjs: HOT chunk of plugins/idempiere_migrate.mjs — the "Migrate from iDempiere (opening balances)" form descriptor for the ONE generic form engine.
// Implementing bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §WIRE-SPEC (+ §IDEMPIERE-OPEN-SPEC) — Witness: W-IDEMPIERE-OPEN (§IDO-* / §WIRE-*). READ THE LOG: §IDMP-FORM and §ODOO-FORM / §MIG-* lines.
// It owns ONE thing: refusing a file that is not idempiere_open.json. Everything else - the engine mapping (templates/idempiere-open.json), the summary, the dry run, Process, stage 2 and
//   the verifier - is the shared "Migrate from Odoo" plan / load and open_balances.mjs (imported, not copied).
import { DESC as ODOO, bindProcess } from './odoo_migrate_form.mjs';
import * as OS from './open_sources.mjs';
export const CLASSNAME = 'org.kernel.idempiere.MigrateFromIdempiere';
export const FORMAT = 'idempiere-open-json-v1';
function say(trx, line) { if (trx && trx.say) trx.say(line); console.log(line); }

// the picked files, or the one problem that stops the form (nothing picked / another source's file)
export function check(files) {
  const f = files || [], bad = OS.wrongFile(f, FORMAT, 'the file open_reader.js of the iDempiere agent wrote');
  if (bad) return bad;
  return f.some((x) => OS.formatOf(x.data) === FORMAT) ? '' : 'Pick idempiere_open.json, the file open_reader.js wrote on the machine that has your iDempiere (run it with --cutover YYYY-MM-DD).';
}

export const DESC = {
  title: 'Migrate from iDempiere (opening balances)',
  emptyText: 'Pick idempiere_open.json, the file open_reader.js wrote from your iDempiere (node open_reader.js --cutover YYYY-MM-DD).',
  params: [{ name: 'Files', label: 'Opening balances (idempiere_open.json)', type: 'file', multiple: false, accept: '.json', mandatory: true }],
  columns: ODOO.columns.map((c) => (c.key === 'odoo' ? Object.assign({}, c, { label: 'iDempiere rows' }) : c)),
  rows(trx, params, current) {
    const bad = check(params && params.Files);
    if (bad) { say(trx, '§IDMP-FORM summary problems=1'); return [{ key: 950, item: '⚠ ' + bad, selected: false, locked: true }]; }
    return ODOO.rows(trx, params, current);
  },
  after: ODOO.after,
  run(trx, params, rows) {
    const bad = check(params && params.Files);
    if (bad) throw new Error('Not migrated: ' + bad);
    return ODOO.run(trx, params, rows).replace(/^Migrated from Odoo/, 'Migrated from iDempiere');
  }
};

export function activate(ctx) {
  if (!ctx.form) throw new Error('idempiere-migrate: the host injected no form engine (ctx.form)');
  bindProcess(ctx.process);
  ctx.form.register(CLASSNAME, DESC);
  console.log('§IDMP-FORM descriptor registered class=' + CLASSNAME);
}
