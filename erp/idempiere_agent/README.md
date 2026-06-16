# iDempiere Migrate Agent

🔒 **The browser cannot reach your Postgres.** A web page can't open a connection to your
iDempiere / Postgres / Docker. So **you** run this small agent *natively* on the machine that
has iDempiere. It reads your database locally and writes one file — `ad_masters.db` — that you
then load back in the browser. Your credentials never leave your machine; the browser never
connects to Postgres. (This is the "delegate-to-install" doctrine.)

This bundle is **self-contained**: it carries everything it needs except one npm package
(`better-sqlite3`), which `npm install` fetches. It reads the running Postgres through the
`docker` CLI, so Docker must be on your PATH.

## Run it (3 steps)

```bash
# 1. unzip the bundle and enter it
cd idempiere_agent

# 2. install the one dependency
npm install

# 3. migrate the master/metadata tables → ./ad_masters.db
node migrate_agent.js --masters
```

It connects to the running `postgres` container (db `idempiere`, user `adempiere`, schema
`adempiere`), migrates the master/metadata tables RAW (no column strip), and writes
**`ad_masters.db`** into the current directory.

Then go back to the browser → **Help ▸ Run it yourself (DIY) ▸ iDempiere ▸ step ③** and load
that `ad_masters.db`.

## Point it at your own iDempiere

Override any default with an environment variable:

| Variable | Default | Meaning |
|---|---|---|
| `ERP_PG_CONTAINER` | `postgres` | the Docker container running Postgres |
| `ERP_PG_DB` | `idempiere` | the database name |
| `ERP_PG_USER` | `adempiere` | the Postgres user |
| `ERP_PG_SCHEMA` | `adempiere` | the schema to read |
| `ERP_OUT` | `./ad_masters.db` | the output file path |
| `ERP_TABLES` | (all) | comma-separated subset, e.g. `ad_rule,c_doctype` |

```bash
ERP_PG_CONTAINER=my-pg ERP_PG_DB=idempiere ERP_PG_USER=adempiere \
node migrate_agent.js --masters
```

## Other modes

```bash
# enumerate the AD_Client tenants as JSON (pick which one to migrate)
node migrate_agent.js --list-clients

# migrate a full instance (omit --masters) — documents + transactions too
node migrate_agent.js
```

Sequences are dropped and Postgres functions/triggers are skipped (that logic lives in the
kernel's rules, not the data) — and it says so in the log. Every value written is a recorded
iDempiere row; nothing is invented.

---
© 2026 Redhuan D. Oon · MIT License
