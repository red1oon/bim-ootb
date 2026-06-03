# ⚠ DO NOT REMOVE — Scope guard
# WHO THIS IS FOR: the FRONT-END lane, now running in COMBINED MODE — it owns host-conformance AND
#   engine consumption AND the data-acquisition toolset (INSTALL + the third-party-ERP MIGRATE icon).
#   The backend/engine lane is CLOSED: its deliverables are FROZEN and CONSUMED via the seam, not rebuilt.
#   This single prompt CONSOLIDATES the former BACKEND_LANE_S2 + BACKEND_LANE_SESSION + the migrate
#   toolset into one handoff. The old lane firewall is DISSOLVED (combined mode); the ONLY coupling that
#   remains is the engine↔UI seam (docs/ENGINE_CONTRACT.md §1) — consume `window.ERP`, never reach past it.
# NON-NEGOTIABLE (carry every turn): spec-first; witness-led (each test NAMES the issue it proves);
#   §-log first (READ the log before any conclusion); deterministic / NON-INVENT (real rows; absent →
#   reported via source/coverage, never synthesized); EXPLICIT GO before any deploy.
# CANONICAL vs CONSUMER: engine code is canonical in `bim-compiler/scripts/`; the browser copies live in
#   `bim-ootb/erp/` (erp_kernel.js / erp_seam.js / erp_postings.js — re-copy from bim-compiler, do not fork).

---

# Combined ERP lane — consume the frozen engine seam; surface INSTALL + MIGRATE; wire the live write path

## 1. What is DONE and FROZEN (consume — do NOT rebuild)

### Engine seam (C0) — the five calls, browser-loadable
- `bim-compiler/scripts/erp_seam.js` `makeSeam({projDb, adQ, factQ, wfmc, newDb})` → `{read, dispatch,
  manifest, verbs, verify}`. THIN over proven fns (`erp_kernel` apply/dispatch/replay, the D2 manifest,
  the handler registry) — **no new engine logic**. Spec `docs/ENGINE_CONTRACT.md §1`+`§6.1`.
- `dispatch(intent, ctx)` → `{ok, op_uuid, before, after}` | `{rejected, why}`. Gates engine-side:
  role-capability (`ctx.role.actions`) + owner-gate (op-log single-writer). `ctx{actor, pubKey, roleId,
  role:{id,actions}, allowOrgs, isshowacct}`.
- `verify(ctx)` → `{chainOk, len, tip}` (replay-hash). Witness `scripts/poc_seam.js` **ALL PASS** —
  `§SEAM surface=read,dispatch,manifest,verbs,verify`, `§SEAM dispatch …rebuildA==rebuildB agree=Y`,
  owner-gate + role-no-grant rejected, reads scoped to `allowOrgs`. (bim-compiler `fad5b096`, branch `full`.)

### readPostings (§13.7) — the role-gated Accts-Posted read-fold
- `bim-compiler/scripts/erp_postings.js` `readPostings(recordRef, ctx, dbs)` → exact shape
  `{visible, posted, lines[], balanced, source, coverage, note, reason}`,
  `source∈{fact_acct,oplog,none}`, `coverage∈{complete,partial,absent}`. Gate `isshowacct` from `ad_role`
  (Admin 102=Y, User 103=N) — non-acct/out-of-scope → `visible:false`, zero rows. Witness
  `scripts/poc_postings.js` **ALL PASS** (`§POSTED-READ/GATE/COVERAGE`). Spec `docs/PLUGIN_ARCHITECTURE.md
  §13.7`+`§13.7a`.
- ⚠ `complete` needs record-keyed `Fact_Acct`; the bundled extract is TOTALS (`factHasRecordKey=N`) → real
  records fold `partial`/`absent` until the §13.6 re-extract (NOT speculative). The INSTALL icon's payload
  is what lights it to `complete`.

### Browser-loadable engine + the LIVE write path (spike, proven)
- UMD tails make `erp_kernel/erp_seam/erp_postings` load in-browser as `window.ERPKernel/ERPSeam/ERPPostings`
  (already sql.js-compatible — no fork). `bim-ootb/erp/erp_signer.js` now exposes `pubKeyHex` for ctx.
- `bim-ootb/erp/spike_writepath.html` publishes **`window.ERP = {dispatch, read, readPostings, verify}`**
  over the seam, with the real W-SIGN edge signer, a writable projection, a board that **re-folds after each
  live dispatch**, and a "fire ×N" meter. Driven headless (`tests/drive_spike.js`, puppeteer) — live writes
  commit, the **signed** chain verifies (`chainOk=Y signed=Y`), the gate zero-leaks. (bim-ootb `09773e1`,
  branch `idmp-host-conformance`, LOCAL — not pushed/deployed.) This is the REFERENCE for wiring real chrome.

### Data half (already on `full`): D2 shards + D3 rekey + R2 fact_acct
- 15 closed T2 shards + deterministic `manifest.json` (`§SHARD-MANIFEST tables=660`); `--rekey-client 11 12`;
  real `fact_acct` extract (`§EXTRACT Dr=Cr=46574.97`). (bim-compiler `a541a873`,`30a1e1a6`.)

### The MIGRATE toolset (third-party ERP fold) — engine backing PROVEN
- `bim-compiler/scripts/odoo_adapter.js` — PURE Odoo→iDempiere map (SCHEMA_MAP + STATE_MAP), C_/M_ as the
  lingua franca. `scripts/poc_odoo_fold*.js` drive Odoo's executed O2C chain through the EXISTING kernel
  verbs: **`§ODOO-FOLD PASS newVerbs=[]`** — every foreign hop maps to a verb the kernel already has, so a
  third-party ERP migrates by DISPATCHING the folded ops (`window.ERP.dispatch`), no engine change.
  Clean-room (learn from executed rows, never source). Spec `prompts/ODOO_FOLD_POC.md`, `docs/HolyGrail.md`
  (migration solvent), `docs/ERPMaker.md`. A needed-but-absent capability is a NAMED finding, never a copy.

## 2. The data-acquisition model — TWO icons, ONE op-log

Both affordances land rows in the SAME op-log via `window.ERP.dispatch`; the renderer only reflects coverage.

| Icon | Means | Engine backing | Lights coverage to |
|---|---|---|---|
| **INSTALL** | install local GardenWorld data (the resident bundle / shards) | D2 shards + manifest + R2 fact_acct | `partial`→`complete` (real Fact_Acct) |
| **MIGRATE** | import a third-party ERP (Odoo first) | `odoo_adapter` fold → `dispatch` per hop (`newVerbs=[]`) | the migrated docs become resident + postable |

The Accts-Posted panel (`readPostings`) degrades honestly between them: `absent` ("install local first" /
"migrate an ERP") → `partial` (op-log only, note) → `complete` (real Fact_Acct). Never an error, never a
fabricated total.

## 3. Combined-mode TODO (front-end owns all of this now)
1. **Wire `window.ERP` into real chrome** — promote the `spike_writepath.html` publish into the live host(s)
   (`kanban_lens.html` drag→dispatch, `idempiere.html` record panel, `chat_lens` send). The lenses already
   call `opts.dispatch`/`window.ERP.dispatch`; supply ctx via `buildCtx()` (augment `idmp_session` with
   `actor/pubKey/roleId/allowOrgs/isshowacct` — pattern in the spike).
2. **Surface the two icons** — INSTALL (existing) + the new MIGRATE icon. MIGRATE runs the `odoo_adapter`
   fold and dispatches the ops; show progress + the resulting coverage lift. Honest first-mile.
3. **Accts-Posted panel** — Report verb, role-gated by `readPostings`; render `source/coverage` verbatim.
4. **Re-fold seam** — after a successful `dispatch`, re-derive the affected view (the spike does a full
   re-query; see KNOWN ISSUES for why that needs an incremental answer before scale).
5. **DataSource** (optional, `IDEMPIERE_DATA_STREAMING_SPEC §3`) — serve the D2 shards behind `read` when
   windows open. SWAP behind the same `read`; zero overlay change.

## 4. KNOWN ISSUES — the perf/bloat backlog (from the live spike, read off §-lines, non-invent)
Measured in real headless Chromium, N=300 signed writes (`bim-ootb/erp/spike_writepath_browser.log`):
- **[I-1] `dispatch` is O(projection)/write** — `erp_kernel.dispatch` runs `projectionHash()` TWICE per
  write (violation guard). dispatch p50 1.5ms, drift **1.57×** over the run. → incremental hash.
- **[I-2] seal+verify re-hash the WHOLE log per persist** — O(n)/persist → O(n²). SIGNED `verify` climbs
  **4.6→26.6ms (50→300 ops)** — the dominant clock cost at scale. → rolling/incremental seal.
- **[I-3] projection bloat** — `db.export()` 52KB→336KB for 600 ops (~570 B/op rich payload), whole blob
  re-serialized + re-persisted to IndexedDB every write (idbPut 2–5ms). → compact()/prune payload; persist deltas.
- **[I-4] SCHEMA MISMATCH (integration)** — the live op-log (`erp_kernel` `kernel_ops`: `op_uuid` PK) ≠ the
  W-CHAIN/W-SIGN sealed schema (`kernel_ops.js`: `id`/`prev_hash`/`op_hash`/`sig`). Signing does NOT yet
  cover the live write log — **reconcile to ONE op-log schema before relying on signed tamper-evidence.**
- **[I-5] re-fold = full GROUP BY re-query/write** — cheap now (O(docs)); watch at 10k+.
Verdict: comfortably fast at hundreds of ops (~500 op/s); the signed-verify + double-hash + full-export
curves are what to fix before thousands. Run `bim-compiler/scripts/spike_writepath.js [N]` to re-measure.

## 5. Read first (the seam + the proofs)
- `docs/ENGINE_CONTRACT.md §1`(five calls)/`§2`(ctx)/`§6.1`(C0 built) · `docs/PLUGIN_ARCHITECTURE.md §13.7`/`§13.7a`(readPostings)
- `bim-compiler/scripts/`: `erp_seam.js`, `erp_postings.js`, `erp_kernel.js`, `poc_seam.js`, `poc_postings.js`, `spike_writepath.js`
- `bim-ootb/erp/`: `spike_writepath.html` (the live-wiring reference), `tests/drive_spike.js`, `erp_signer.js` (pubKeyHex)
- MIGRATE: `scripts/odoo_adapter.js` + `scripts/poc_odoo_fold*.js` · `prompts/ODOO_FOLD_POC.md` · `docs/HolyGrail.md` · `docs/ERPMaker.md`
- DATA: `docs/ERP_SHARD_GENERATOR.md §8a/§8b` · `prompts/ORDER_OF_PLAY.md` (S1 migrate / S2 engine DONE / S3 render)
- Memory: [[project_repo_split_lanes]] · [[project_holygrail_poc]] · [[project_erpmaker]] · [[project_lens_family]]

## 6. Advice from the engine lane (earned this session — read before you wire)
- **Don't fork the engine.** The browser files are UMD COPIES of `bim-compiler/scripts/` — re-copy, never
  reimplement a verb. "One engine, N renderers" dies the moment a renderer owns a verb. If a fold/feature
  needs a verb the kernel lacks, that is a NAMED finding back to the (frozen) engine, not a front-end hack.
- **Column casing WILL bite you (it bit me twice).** sql.js & better-sqlite3 return columns in their
  DECLARED case. In `ad_seed`/glassbowl: `c_elementvalue.Value/Name` and `c_invoice.GrandTotal` are
  TitleCase — `row.value`/`row.grandtotal` come back `undefined`, then coerce to `NaN`→`0`, then a POST
  silently unbalances. **Alias every read column** (`SELECT grandtotal AS grandtotal`, `value AS value`).
  Org scoping must match `ad_org_id`/`AD_Org_ID` case-insensitively (the seam's `read` already does).
- **Resolve the schema mismatch [I-4] BEFORE wiring signing into the live path.** Pick ONE op-log schema:
  either teach `erp_kernel`'s `kernel_ops` the seal columns (`id/prev_hash/op_hash/sig`) or route live
  commits through `kernel_ops.js`. Shipping "signed" while the signer covers a DIFFERENT table is worse
  than shipping unsigned — it looks trustworthy and isn't. This is the first decision, not a cleanup.
- **Sequence it like the spike did:** (1) ctx + `readPostings` Accts-Posted — decision-free, ships now,
  degrades to `absent` honestly; (2) live `dispatch`; (3) the MIGRATE icon. Each is independently witnessable.
- **MIGRATE is just dispatch.** Each folded Odoo hop = one `window.ERP.dispatch`. `newVerbs=[]` is the
  contract — if a fold needs a new verb, STOP and name it; don't special-case it in the UI.
- **Keep the meters in while you wire.** `§METER`/`§BLOAT` are cheap and they're the only honest read on
  whether I-1/I-2/I-3 have bitten. Don't let users fire hundreds of writes before incremental-hash [I-1]
  and rolling-seal [I-2] land — the signed-verify curve (4.6→26.6ms by 300 ops) is the one that hurts.
- **readPostings honesty is engine-enforced — keep it that way.** Never gate the Posted tab in the panel;
  the engine returns `visible:false`. Render `source`/`coverage` verbatim; INSTALL/MIGRATE are what lift it.
- **Determinism is load-bearing.** No `Date.now`/`Math.random` in engine/op paths — it breaks replay
  (identity is an edge-minted INPUT, re-read not recomputed). Meters may use `performance.now()` (they
  measure, they don't compute state). `crypto.subtle` exists in the browser; a node harness needs
  `global.crypto = require('crypto').webcrypto`.
- **§-log first, always.** Exit code is not evidence — the unbalanced-POST and the casing bugs above only
  showed in the log lines, not the exit status. Read the log before any conclusion.

## 7. Open question handed to you (the front-end's call now)
The user weighed in: with combined mode + the MIGRATE icon, decide whether the live op-log persists per-write
(simple, the spike's path, O(n²) seal) or batches/compacts (needs the [I-4] schema decision first). The spike
gives you the numbers to choose; it does not choose for you.
```

EXPLICIT GO before any deploy. Consume the seam; do not edit the engine. Then STOP at one bounded task.
```
