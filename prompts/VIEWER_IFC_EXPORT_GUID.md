# ⚠ DO NOT REMOVE
SCOPE: the Viewer's **Save as IFC** (`viewer/ifc_export_worker.js`, called from `viewer/import.js`) — ONLY how each exported element gets its IFC GlobalId. Not the schema, materials, property sets or layers (separate, known gaps, listed at the end). Read the log after every run (`§IFC_EXPORT_GUID`, `§W-IFC-GUID`); the exit code is not evidence.

## Issue (found 2026-11-17 while making a delta IFC for a reviewer; measured on origin/main 6322071d)
`toIfcGuid()` keeps a 22-character id as is, and for any other id walks its characters, keeps only those that parse as hex, and emits two output characters per hex digit until 22 are written. So:
1. Only the first 11 hex digits of an id count. Two UUIDs that agree in their first 11 hex digits get the SAME GlobalId.
2. Letters that are not hex (`G`..`Z`, `-`, `_`) are dropped. Generated part ids such as `GEN-CR-0001-PL`, `GEN-CR-0002-PL` share their hex characters and get the same GlobalId (4 of 4 tested gave `EZCO1EFn5j3W9E9FFx0PEy`).
3. The first character can be any of the 64, but a GlobalId is 128 bits in 22 base-64 digits, so the first digit carries only 2 bits and must be `0`-`3`. `newGuid()` (random, for elements with no id and for project/site/building/relations) has the same fault.
4. Two elements with the same source id (a duplicate row) get the same GlobalId.
An IFC file whose products share a GlobalId is invalid: a receiving tool merges, drops or refuses them.

## Rule (the fix)
- A 32-hex-digit id (with or without the UUID hyphens) is compressed exactly as IFC defines it (the same algorithm as `ifcopenshell.guid.compress`), so a UUID keeps its identity.
- Any other id that is not a valid 22-character GlobalId (first digit `0`-`3`, alphabet `0-9A-Za-z_$`) becomes a deterministic 128-bit hash of the WHOLE id, compressed the same way: different ids give different GlobalIds, the same id gives the same GlobalId on every export.
- Within one export no two elements share a GlobalId: a repeat (duplicate source id) is re-derived from `id#n` and counted.
- `newGuid()` emits a first digit `0`-`3`.
- One log line per export: `§IFC_EXPORT_GUID elements=N unique=N passthrough=a uuid=b hashed=c random=d rederived=e`.

## Witness W-IFC-GUID (`viewer/tests/witness_ifc_export_guid.js`; issue: *"Save as IFC gives different elements the same GlobalId, or an invalid one"*)
Runs the real worker's `buildIFC` in a node `vm` on a fixture of 14 elements: 4 `GEN-…` part ids, 3 UUIDs sharing their first 11 hex digits, 2 bare 32-hex ids differing only at the end, 1 valid 22-char id, 1 element with no id, 2 elements with the same id, 1 id of non-hex letters only.
- G1 UNIQUE: 14 products written, 14 distinct GlobalIds.
- G2 VALID: every GlobalId in the file is 22 characters of the alphabet with a first digit `0`-`3`; and (independent) `ifcopenshell.guid.expand` then `compress` returns it unchanged (SKIP this half if python ifcopenshell is absent).
- G3 UUID-FAITHFUL: each UUID's GlobalId equals `ifcopenshell.guid.compress` of its hex (independent; SKIP if absent).
- G4 STABLE: two exports give the same GlobalIds for every element that has an id.
- G5 PASSTHROUGH: the valid 22-char id is written unchanged.
- G6 LOGGED: the `§IFC_EXPORT_GUID` line counts match the fixture (passthrough 1, uuid 5, hashed 7, random 1, rederived 1).
- Break switch `IFC_GUID_BREAK=1` swaps in the pre-fix `toIfcGuid` and no uniqueness guard: G1 must FAIL. 0 products judged = INCONCLUSIVE.

## Known gaps, NOT in this fix (for a later spec)
IFC4 only (no IFC2X3 for Revit-era receivers); one triangulated body per element (layer parts merge back into the host); no materials as IfcMaterial, no property sets; no IfcMechanicalFastener/IfcFastener mapping; project/site/building GlobalIds stay random per export.

## RESULT 2026-11-18
- W-IFC-GUID **6/0** (`§W-IFC-GUID VERDICT PASS pass=6 fail=0 skip=0`; ifcopenshell 0.8.4 halves ran). `IFC_GUID_BREAK=1`: **FAIL 2/4** — G1 `products=14 distinct=10`, G2 8 bad first digits (e.g. `EZCO0708091HCDEFGHIJKL`), G3 the 3 UUIDs collapse to one GlobalId, G6 no log line.
- Real data, local only (a private set's 150 generated connection parts with ids like `GEN-CR-<host GlobalId>-<end>-<part>`, through this worker in node): pre-fix **150 parts → 10 distinct GlobalIds**, ifcopenshell.validate 150 GlobalId errors; fixed **150 → 150 distinct**, `§IFC_EXPORT_GUID elements=150 unique=150 hashed=150 rederived=0`, 0 GlobalId errors.
- Still flagged by ifcopenshell.validate on that run, NOT this fix: products are written with 8 attributes where IFC4 has `PredefinedType` (150 of 150: IfcPlate, and IfcMechanicalFastener/IfcFastener which fall back to IfcBuildingElementProxy).
- `viewer/import.js` loads the worker as `?v=2` (was `?v=1`); `sw.js` CACHE_VERSION bumped; `tests/audit_sw_precache.js` 295 found, 0 missing.
- **Earlier unmerged work on the same file:** branch `fix/ifc-export-schema` (05b1ac4f, 2026-10-02, no PR) fixed the first-digit fault and the schema validity (incl. a source timestamp), but gives a non-UUID id a per-export COUNTER id, so the same part gets a different GlobalId when the element order changes. This fix keeps identity (hash of the whole id). That branch needs a rebase onto this one, taking this `toIfcGuid`; its schema half (PredefinedType etc.) is still worth landing.
