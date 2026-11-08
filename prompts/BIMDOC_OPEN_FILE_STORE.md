# ⚠ DO NOT REMOVE
SCOPE: the APP side of the BIM Document's "Open in Modeller / Viewer": ONE shared browser file store (`common/file_store.js`, OPFS `bim_files/<sha256>`) and the `?open=store:<sha256>&name=<file>` reader in the Viewer and the Modeller, which hands the bytes to each app's EXISTING open route. Owner ruling (bim-compiler `prompts/ERP_IDEMPIERE_UX_PARITY.md` §BIMDOC-OPEN, 2026-11-09): *"Shared file store, Modeller session"*; layout agreed with the design lane the same day. The ERP side (attachment bytes into the store) is built separately and uses this module. **Read the log after every run: exit code is not evidence. A verdict prints INCONCLUSIVE, never PASS, when nothing was judged.**
Witness: `common/tests/witness_file_store.js` (W-FILESTORE).

## §1 Problem
No app accepts a file from another page today. `viewer.html ?db=import://` takes a converted DB, `?find=` a scope, `postMessage bim:highlight` a selection; the Modeller has only demo switches. A BIM Document's attachment (IFC, DXF) must open in the app that handles its kind, with no new transport and no second copy of a 300 MB file.

## §2 The store: `common/file_store.js` (one owner, browser global `FileStore`)
- **Layout:** OPFS directory `bim_files`, one file per entry, named by the lowercase hex sha256 of its bytes. Name, size and kind stay on the caller's row (`ad_attachment`); the store holds bytes only.
- **`put(blob)`** → `{sha256, size, dedup}`:
  - The hash is `crypto.subtle.digest('SHA-256', await blob.arrayBuffer())`. That is ONE ArrayBuffer copy: the native digest cannot hash a stream, so "hash once" is one copy, never two.
  - If an entry with that name and size exists, nothing is written (`dedup=1`). Otherwise the bytes are written STREAMED from the Blob (`createWritable()` + `write(blob)` + `close()`), with no second ArrayBuffer.
  - Log: `§FILESTORE-PUT sha=<12> size=<bytes> ms=<n> heapMB=<n|na> dedup=<0|1>`.
- **`get(sha256)`** → a `File` (`{name}` given by the caller) or a refusal:
  - It re-hashes what it read and refuses on `absent` (no entry, or the store API is missing) or `mismatch` (the bytes' hash ≠ the name).
  - Logs: `§FILESTORE-GET sha=<12> size=<n> ok` / `§FILESTORE-GET REFUSED sha=<12> reason=absent|mismatch|bad-sha|no-opfs`.
- **Shared by hash = shared across rows and across clients in one browser.** Deleting a row never deletes bytes. `sweep(referenced)` takes the Set of sha256 still referenced by ANY row (the caller reads its own rows) and removes only entries outside it. Log: `§FILESTORE-SWEEP entries=<n> kept=<n> removed=<n>`. The legacy file-system provider deletes the file with its entry; that behaviour is kept per ROW, not per byte-blob.
- **`persist()`** (once per page): `navigator.storage.persist()`. Log: `§FILESTORE-PERSIST granted=<true|false|unsupported>`. When it is not granted, the browser may evict the store under pressure; `get` then refuses `absent`, which is the right answer.
- **Known limit, logged, not silent:** OPFS is per ORIGIN. Every app is served from one origin today; an app on another origin sees an empty store. The first call logs `§FILESTORE-ORIGIN origin=<origin> (same-origin only: another origin sees an empty store)`.
- `has(sha256)`, `list()` (names) for callers and the witness. No other API.

## §3 The reader: `FileStore.openFromUrl(routes)`
- Reads `open=store:<sha256>` and `name=` from `location.search`. It does nothing (and logs nothing) when `open` is absent. It refuses a missing `name` or a sha256 that is not 64 hex characters (`bad-sha`).
- Then `get` → `File(name)` → the route for the name's extension, lowercased. `routes` is `{ifc: fn(file), dxf: fn(file), db: fn(file)}`, supplied by the app. An extension with no route is refused (`reason=no-route kind=<ext>`), with a status line naming the app that does open it.
- Log: `§FILESTORE-OPEN sha=<12> name=<name> kind=<ext> route=<ifc|dxf|db> size=<n>`, then the route's own existing log (`§OPEN_IFC`, `§MODELLER-OPEN`, `§DXF-IMPORT sheet=…`).
- A refusal is also written to the app's status text: *"Could not open the attachment: <reason>"*. No route runs.
- **Viewer** (`viewer/main.js`, after the scene is ready and `A._openIfcFiles` exists): `ifc → A._openIfcFiles([file])`. There is no dxf route (the Viewer does not read DXF): the refusal says "DXF opens in the Modeller".
- **Modeller** (`modeller/modeller.html`, after `__sceneReady` and the outliner `SW` exist): `ifc → SW._openIfcFile(file)`, `db → SW._openStrDb(file)`, `dxf → DxfImportUI.openFiles([file], {chooser:true})`, which are the same calls the Open panel and the DXF chooser already make.
- Nothing new beyond the store read; the existing routes do the rest.

## §4 Witness W-FILESTORE (real OPFS, headless Chrome, software GL, one origin)
- **S1 dedup:** the same bytes put twice → one entry, the second `dedup=1`.
- **S2 get:** the hash read back = the put hash.
- **S3 RED altered:** overwrite an entry's bytes, then get → refused `mismatch`.
- **S4 RED absent:** an unknown sha → refused `absent`.
- **S5 sweep:** two rows reference A and one references B. Drop B's row → sweep removes B and keeps A. Drop one of A's two rows → A stays. Drop A's last → sweep removes A.
- **O1 Viewer:** `?open=store:<sha>&name=Duplex_ARC.ifc` (public `IFC/Duplex_ARC.ifc` put first) → `§FILESTORE-OPEN … route=ifc` and `§OPEN_IFC files=1 names=Duplex_ARC.ifc`, and the logged sha = the put sha. **O1 RED:** the same URL after S3-style alteration → refused, and no `§OPEN_IFC`.
- **O2 Modeller IFC:** the same IFC → `§FILESTORE-OPEN … route=ifc` and the Modeller's own IFC open log.
- **O3 Modeller DXF:** a written public DXF (one LINE) → `route=dxf` and `§DXF-IMPORT sheet=<name>` whose `sha` prefix = the store's (both are sha256 of the same bytes).
- **O4 RED:** a missing entry on the Modeller → refused, and no route log.
- **O5:** no `open` param → no `§FILESTORE` line at all (the page is unchanged).

## §5 RESULT (2026-11-09)
Log (session scratchpad `wfs/run2.log`): **`§W-FILESTORE PASS pass=16 fail=0 inconclusive=0`**, 0 Modeller page errors.
- **Store:**
  - S1 dedup: 2 puts → 1 entry, second `dedup=1`.
  - S1b the entry name = Node's sha256 of the same file.
  - S2 get round trip.
  - S3 RED altered → `mismatch`; S4 RED absent → `absent`.
  - S5 sweep: B removed while A (2 rows) stays; one A row dropped → A stays; the last dropped → removed.
  - S6 one `§FILESTORE-ORIGIN` line.
- **Opens:**
  - O5: a plain Viewer page prints no `§FILESTORE` line.
  - O1p: `§FILESTORE-PERSIST granted=false`.
  - O1 Viewer: `§FILESTORE-OPEN sha=b347a2c8aa8f name=Duplex_ARC.ifc kind=ifc route=ifc size=2380763` then `§OPEN_IFC files=1 names=Duplex_ARC.ifc`. O1 RED: the altered entry is refused `mismatch` and no `§OPEN_IFC` follows.
  - O2 Modeller IFC → `§MODELLER-OPEN store pick local=Duplex_ARC.ifc`.
  - O3 Modeller DXF → `§DXF-IMPORT sheet=WFS_PLAN.dxf … sha=4faf12b1cfa5`, the store's hash (same bytes).
  - O4 RED: a missing entry is refused `absent` and no open runs.
- **Found:** headless Chrome answers `persist()` with `granted=false`. The store works, but the browser may evict it under pressure; `get` then refuses `absent`, as specified. A real browser's answer depends on the site's engagement; read the log line there.
- **Found (witness only):** a page with no charset decodes a lazily added script as windows-1252, so `§` arrives as `Â§`. Viewer and Modeller declare UTF-8, so their `§FILESTORE` lines are exact. The witness's blank page now declares UTF-8.
- Deletion budget: no previous transport existed to delete (§1: measured, none). Added: `common/file_store.js`, the Viewer and Modeller readers (about 20 lines each), the witness.
- Precache: Viewer sw v1705, Modeller sw v256. ESLint clean.
- **For the ERP side:** call `FileStore.put(blob)` and keep `{sha256, size}` on the `ad_attachment` row. On delete, call `FileStore.sweep(<all sha256 still on any row>)`. Open with `?open=store:<sha256>&name=<file name>`.
