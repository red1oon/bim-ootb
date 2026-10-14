# erp/lens/odoo/ — files that mimic or derive from Odoo

**Licence rule (owner decision, 2026-10-15).** `erp/` is GPL-2.0-only. Odoo Community is LGPL-3.0, which cannot be merged into a GPLv2-only file. So anything that mimics Odoo's code or copies Odoo's schema or demo data is **declared as such, kept in this folder, and listed below**. Each such file carries its own `SPDX-License-Identifier: LGPL-3.0-only` (plus the Odoo notice where it applies) and is loaded as a separate, optional lens at the user's discretion — the same arrangement as the Libero plugin on the GPL side.

**Behaviour-only code does not belong here.** Our own adapters, written from observed behaviour (diffing executed rows against a running Odoo), stay GPL-2.0-only in `erp/`. Odoo Enterprise is proprietary: nothing from it, ever.

## Files that must move here (not yet moved)
Moving them touches `erp/sw.js` precache and several loaders, and `sw.js` is the merge-conflict magnet, so the move waits until the open ERP PRs have merged.

| File | Why it belongs here |
|---|---|
| `erp/odoo_model.json` | Odoo 17 dictionary and demo records, extracted live from `odoodemo` |
| `erp/odoo_chain.json` | folded order-to-cash chain captured from the same Odoo |
| `erp/12-odoo.db` | SQLite built from Odoo's schema and demo data |
| `erp/odoo_agent.zip` | bundle of the agent below, shipped to users |

## Stays GPL-2.0-only (our own code)
`odoo_descriptor.js`, `odoo_agent/*.js` (JSON-RPC client and adapter), `tools/build_odoo_agent_zip.sh`, the `poc_*odoo*` tests. Re-check any of them the moment a line is copied from Odoo source instead of derived from behaviour.

## The same rule for ERPNext
ERPNext is GPL-3.0, which is also incompatible with GPLv2-only. If an ERPNext lens ever copies their code or schema it goes in `erp/lens/erpnext/` with `GPL-3.0-only`, listed in its own README.
