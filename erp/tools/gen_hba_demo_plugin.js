#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE - generates erp/plugins/hba_demo.mjs from the rows scripts/seed_hba_erp.js baked into erp/ad_seed.db (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §HBA-SEED-SPEC).
// EXTRACT, not invent: every row is copied byte-for-byte from the shipped seed (those with a 'hba-%' UU); nothing is authored here. Run: node erp/tools/gen_hba_demo_plugin.js [--check]
// --check exits 1 if the committed plugin differs from what the seed yields (the seed is the source while the rows are still in it; afterwards the plugin is the source and --check is skipped).
'use strict';
var cp = require('child_process'), fs = require('fs'), path = require('path');
var ERP = path.join(__dirname, '..'), SEED = path.join(ERP, 'ad_seed.db'), OUT = path.join(ERP, 'plugins', 'hba_demo.mjs');
// the HBA party cluster, PARENT FIRST (the order a plugin inserts; the boot overlay deletes it child first): table, id column
var CLUSTER = [['c_bpartner', 'c_bpartner_id'], ['ad_user', 'ad_user_id'], ['s_resource', 's_resource_id'], ['s_resourceassignment', 's_resourceassignment_id'],
  ['s_resourceunavailable', 's_resourceunavailable_id'], ['hr_employee', 'hr_employee_id'], ['hr_movement', 'hr_movement_id'], ['c_subscription', 'c_subscription_id']];
function q(sql) { var o = cp.execFileSync('sqlite3', ['-json', SEED, sql], { encoding: 'utf8', maxBuffer: 1 << 26 }).trim(); return o ? JSON.parse(o) : []; }
var dict = CLUSTER.map(function (c) {
  var uu = q("SELECT name FROM pragma_table_info('" + c[0] + "') WHERE lower(name) LIKE '%\\_uu' ESCAPE '\\'")[0].name;
  var rows = q('SELECT * FROM ' + c[0] + " WHERE " + uu + " LIKE 'hba-%' ORDER BY " + c[1]);
  return { table: c[0], idCol: c[1], rows: rows };
});
var n = dict.reduce(function (s, d) { return s + d.rows.length; }, 0);
if (!n) { console.log('§HBA-GEN no hba rows in the seed (already moved out): keeping the committed plugin'); process.exit(0); }
var src = '// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>\n// SPDX-License-Identifier: MIT\n'
  + '// ⚠ DO NOT REMOVE - hba_demo.mjs: the HBA demo party rows (employees EMP001/EMP002, tenancy parties BP-TEN-1/5/6 + BP-OWN-1, their users, resources, leave, payroll movements and\n'
  + '//   subscriptions) as a PLUGIN, not base seed. Legacy GardenWorld has 18 business partners; these 6 are the HBA demo\'s (viewer hr_bim_asset, PR #645), so the base seed must not carry them\n'
  + '//   (TWIN CARDINAL RULE; AD-LAYER LAW #6: extra modules arrive as plugins). Rows copied from ad_seed.db by erp/tools/gen_hba_demo_plugin.js (GENERATED - do not hand edit).\n'
  + '//   Installed, NOT started by default (plugin_overlay INSTALL_ONLY): Plugins & Releases -> Enable brings them in; Stop takes them out (refcounted dict.insert). No host code.\n'
  + '// Witness: erp/tests/witness_hba_seed_plugin.js (log /tmp/count_logs/hba_seed.log).\n'
  + 'export const manifest = {\n  id: \'org.kernel.hba.demo\', version: \'1.0.0\', engineVersion: \'>=0.9.0\', requires: {},\n  dictionary: ' + JSON.stringify(dict, null, 1).replace(/\n\s*/g, function (m) { return '\n'; }).replace(/^/, '') + '\n};\n'
  + 'export async function activate() { console.log(\'§HBA-DEMO active rows=' + n + '\'); }\nexport async function deactivate() {}\n';
if (process.argv.indexOf('--check') >= 0) { var cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : ''; console.log('§HBA-GEN check ' + (cur === src ? 'SAME' : 'DIFFERENT') + ' rows=' + n); process.exit(cur === src ? 0 : 1); }
fs.writeFileSync(OUT, src); console.log('§HBA-GEN wrote ' + OUT + ' rows=' + n + ' ' + dict.map(function (d) { return d.table + '=' + d.rows.length; }).join(' '));
