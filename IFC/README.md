# IFC/ — ARC-only source files, the Modeller's default Open location

One `.ifc` file per building, containing ONLY that building's architectural (ARC) discipline —
never a multi-discipline merged file. This is the convention, not a style choice: the Modeller
edits ARC exclusively (every other discipline is a *walker* that fills the space from measured
rules — see `docs/WalkerDoctrine.md` / VISION-LOCK). Opening a non-ARC-only IFC here is filtered
down to ARC automatically on import (`str_walker_outliner.js#_openIfcFile`) — the invariant is
enforced by the Modeller's Open path, not just by convention of what gets committed here.

## Naming
`<Building>_ARC.ifc` — one file per resident.

## Status (2026-07-04)
- `SampleHouse_ARC.ifc`, `Duplex_ARC.ifc` — populated. Verified genuinely ARC-only (grepped for
  IfcColumn/IfcBeam/IfcFlowSegment/IfcFlowTerminal/IfcPipeSegment/IfcDuctSegment/
  IfcCableCarrierSegment — zero hits in SampleHouse's source; Duplex's source is `bim-compiler`'s
  own confirmed pre-federation ARC deliverable).
- `SampleCastle_ARC.ifc` — NOT YET populated. SampleCastle's only known source
  (`Ifc2x3_SampleCastle.ifc` / Schependomlaan, 49MB) is genuinely multi-discipline — producing an
  ARC-only `.ifc` needs a real IFC-level extraction (not a copy). `SampleCastle_ARC_extracted.db`
  already exists as a resident (proves the ARC-only *data* is known), but not as a standalone `.ifc`.
- `Hospital_ARC.ifc`, `Clinic_ARC.ifc`, `LTU_ARC.ifc`, `Terminal_ARC.ifc` — NOT YET populated.
  Sources exist in `bim-compiler/internal/UNMERGED/` (80–181MB each) but need Git LFS in this repo
  before committing — a deliberate, separate step (repo footprint), not done as part of this change.

## BimDB/ — the SAVE side, not the open side
`IFC/BimDB/` is where the Modeller's Export ▸ Native .db writes to (browser download today —
see `modeller/modeller.html`'s `doDbExport`/`exportDb`). Re-opens via Open ▸ local .db, same as
before. `.db` content is gitignored — this folder is a user's own save destination, not a
committed artifact.
