# Odoo Migrate Agent

🔒 **The browser cannot reach your Odoo.** A web page can't open a connection to your
Odoo / Postgres / Docker. So **you** run this small agent *natively* on the machine that
has Odoo. It reads your data locally and writes one file — `odoo_chain.json` — that you
then load back in the browser. Your credentials never leave your machine; the browser
never connects to Odoo. (This is the "delegate-to-install" doctrine.)

This bundle is **self-contained**: it carries everything it needs except one npm package
(`sql.js`), which `npm install` fetches.

## Run it (3 steps)

```bash
# 1. unzip the bundle and enter it
cd odoo_agent

# 2. install the one dependency
npm install

# 3. extract + fold your Odoo order-to-cash chain → ./odoo_chain.json
node agent.js
```

It connects to a running Odoo (default `odoodemo` on `localhost:8069`, login `admin/admin`),
re-pulls sale order **S00023**'s order→delivery→invoice chain, folds it through the ERP
kernel verbs, self-verifies (every hop commits, GL debits == credits), and writes
**`odoo_chain.json`** into the current directory.

Then go back to the browser → **Migrate ▸ Odoo ▸ step ③** and load that `odoo_chain.json`.

## Point it at your own Odoo

Add flags — they work in every shell (Windows `cmd`, PowerShell, bash):

```bash
node agent.js  --host 10.0.0.5 --port 8069 --db mydb --login me
node export.js --host 10.0.0.5 --port 8069 --db mydb --login me --cutover 2026-12-31
```

- **Your password is asked in the terminal** (hidden as you type). It is never a flag (that would stay in your shell
  history) and never typed into the browser. For an unattended run, set `ODOO_PASSWORD` in the environment instead.
- **The login needs read rights on accounting and stock** (an administrator, or a user in *Invoicing/Billing
  Administrator*). If it lacks them, the export stops, names what it could not read, and writes nothing.
- `agent.js` checks one sales order to the cent. On your own Odoo it picks your most recent order that has a posted
  customer invoice (`--so latest`), or the one you name: `--so S00042`.
- With no flags at all, both use the demo Odoo (`odoodemo` on `localhost:8069`, login `admin`).
- The older environment variables still work (`ODOO_HOST ODOO_PORT ODOO_DB ODOO_LOGIN ODOO_PASSWORD ODOO_SO CUTOVER`); a flag wins.

## What's in the bundle

| File              | Role                                                     |
| ----------------- | ------------------------------------------------------- |
| `agent.js`        | the extractor + self-verifier (entry point)             |
| `erp_kernel.js`   | the ERP fold engine (6 closed verbs, op-log)            |
| `odoo_adapter.js` | the Odoo → kernel dictionary (pure mapping, no I/O)     |
| `package.json`    | declares the one dependency (`sql.js`)                  |

NON-INVENT: every value written is a recorded Odoo row. Nothing is fabricated.
SPDX-License-Identifier: MIT — Copyright (c) 2025-2026 Redhuan D. Oon.

## Export your master data (`export.js`, no `npm install` needed)

```bash
node export.js                      # → ./odoo_export/odoo_export.json
CUTOVER=2026-12-31 node export.js   # the date your opening stock is counted at (default: today)
```

Same `ODOO_HOST / ODOO_PORT / ODOO_DB / ODOO_LOGIN / ODOO_PASSWORD` variables as above. It reads (never writes)
your units of measure, payment terms, product categories, chart of accounts, partners + contacts + addresses, products
+ vendor prices, warehouses, locations and on-hand stock, and your OPEN BALANCES at the cut-over date (the trial balance
per account, every open receivable / payable line), and writes ONE file: `odoo_export.json` — the rows exactly as Odoo
returned them, plus how many rows Odoo has of each (so the ERP can prove nothing was dropped or made up). Nothing is
converted here: the mapping to the ERP's tables happens in the browser. In "Migrate from Odoo" you pick that one file.
(An export made by an older agent — a workbook + `manifest.json` — still loads.)

### Real Odoo data — what the export does for you (§HARDEN-SPEC)

- **Odoo.sh, Odoo Online or any server on https:** `node export.js --url https://mycompany.odoo.com --db mycompany --login me@mycompany.com`.
  If your Odoo asks for a 2-step code at login, create an **API key** (Odoo: your profile → Account Security → New API Key) and type it when the
  password is asked. (`agent.js`, the one-order check, still speaks plain http only.)
- **Several companies:** the export moves ONE Odoo company — the one your login opens on. It ends by naming the others with the exact command
  for each (`--company <id>`); each one becomes its own ERP company.
- **Archived records come along INACTIVE** (Odoo's archive = the ERP's Active unticked): an archived customer keeps its contacts, an archived
  product keeps its stock and vendor prices.
- **Addresses** are matched by a fixed id made from the Odoo record (the ERP's `C_Location_UU`), so a customer with no street, or two customers
  on the same street, are fine. An address with no country gets your Odoo company's country (listed in the migration summary).
- **Codes the ERP needs unique** (customer reference, product internal reference): if two Odoo records share one, the older keeps it and the
  other becomes `<code>-<odoo id>`; a code longer than the ERP field is cut and keeps `~<odoo id>`. The browser lists every one on the summary screen. Other text longer than the ERP field is cut the way iDempiere cuts it (listed on the summary screen).
- **Your Odoo version:** the export reads Odoo 17's field names and checks they exist BEFORE reading anything. On another version it stops,
  names the missing field, and writes nothing.
- Needs **Node.js 16 or newer**.
