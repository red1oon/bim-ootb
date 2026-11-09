# SAP Business One Migrate Agent — ALPHA (proof of concept)

🔒 **The browser cannot reach your SAP Business One.** So **you** run this small agent on a machine
that can reach your **Service Layer**. It reads your master data and writes one file,
`sap_export.json`, which you drop on **Migrate from SAP Business One (alpha)** in the browser.
Your password never leaves this machine; the browser never connects to SAP.

**Read only.** It logs in, reads, and logs out. Every call is listed in `sap_export.json`
(`manifest.calls`) and `manifest.read_only` says `true` when nothing but reads was sent.

**Released early, on purpose.** It has never run against a real Business One here — only against a
local stand-in that answers the way SAP's guide *Working with SAP Business One Service Layer*
describes. Please send back the `§SAP` lines it prints: they hold counts and field names, no data.
Improvements welcome.

## Run it

Needs **Node 18 or newer**. No `npm install` (no dependencies).

```bash
cd sap_agent
node agent.js --url https://<your-server>:50000 --company <CompanyDB> --user <user> --insecure
```

- `--url` your Service Layer address (the agent adds `/b1s/v1`).
- `--company` the company database name you log in to (for example `SBODEMOUS`).
- `--insecure` only if your Service Layer uses Business One's self-signed certificate.
- The password is asked for (hidden), or set `SAP_PASSWORD`. It is never a flag.

## What it reads

Units of measure, payment terms, item groups, chart of accounts, business partners (with addresses
and contact persons), items (with prices and stock per warehouse), price lists, warehouses, bin
locations. **Before asking for any field it checks your server's own `$metadata`**; a field your
server does not have is listed as missing, never guessed.

## Known limits (alpha)

- Balance-sheet accounts: the Service Layer's account record does not say asset, liability or
  equity, so they get the ERP default type. (That class lives in the company database's account
  table, and reading it is the next step.)
- Stock is the stock **now** (the Service Layer gives no stock at a date).
- One sale price list (the lowest number, or the one you name on the form).
- No open documents, balances or history yet.
