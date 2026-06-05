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

Override any default with an environment variable:

```bash
ODOO_HOST=10.0.0.5 ODOO_PORT=8069 ODOO_DB=mydb \
ODOO_LOGIN=admin ODOO_PASSWORD=secret ODOO_SO=S00042 \
node agent.js
```

| Variable        | Default       | Meaning                          |
| --------------- | ------------- | -------------------------------- |
| `ODOO_HOST`     | `localhost`   | Odoo host                        |
| `ODOO_PORT`     | `8069`        | Odoo JSON-RPC port               |
| `ODOO_DB`       | `odoodemo`    | Odoo database name               |
| `ODOO_LOGIN`    | `admin`       | Odoo login                       |
| `ODOO_PASSWORD` | `admin`       | Odoo password                    |
| `ODOO_SO`       | `S00023`      | Sale order to migrate            |

## What's in the bundle

| File              | Role                                                     |
| ----------------- | ------------------------------------------------------- |
| `agent.js`        | the extractor + self-verifier (entry point)             |
| `erp_kernel.js`   | the ERP fold engine (6 closed verbs, op-log)            |
| `odoo_adapter.js` | the Odoo → kernel dictionary (pure mapping, no I/O)     |
| `package.json`    | declares the one dependency (`sql.js`)                  |

NON-INVENT: every value written is a recorded Odoo row. Nothing is fabricated.
SPDX-License-Identifier: MIT — Copyright (c) 2025-2026 Redhuan D. Oon.
