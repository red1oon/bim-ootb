// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — migrate/template_loader.mjs: reads a migration template (erp/migrate/templates/<name>.json — DATA the user copies and edits) next to this module, in the browser
//   (fetch, precached by erp/sw.js so it works offline) or in node (the file). Implementing bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §ENGINE-D-SPEC — Witness: W-MIGRATE-ENGINE.
export async function loadTemplate(name) {
  const u = new URL('./templates/' + name + '.json', import.meta.url);
  if (u.protocol === 'file:') { const fs = await import('node:fs'); return JSON.parse(fs.readFileSync(u, 'utf8')); }
  const r = await fetch(u); if (!r.ok) throw new Error('migration template ' + name + ' could not be read (HTTP ' + r.status + ')');
  return r.json();
}
