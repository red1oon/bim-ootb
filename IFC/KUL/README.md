# IFC/KUL/ — private large-project IFC benchmark stress-test set

**Not a shipped resident.** Three raw `.ifc` files from an external private project
(`KUL070-SWC-01-XX-3D-E-0001*`), staged here 2026-07-28 to stress-test the Modeller/Viewer's
IFC-open code path against real files far larger than anything the pipeline has been fitted or
tested against. **Gitignored** (`.gitignore` `IFC/KUL/*` + `!IFC/KUL/README.md`) — the `.ifc`
sources are multi-GB and never git/LFS; only this README is tracked.

Full analysis, code-path read, and the perf/sizing investigation task: **`prompts/IFC_LARGE_PRIVATE_STRESS_TEST.md`** (bim-compiler repo).

## Files (not present in git — local only)
| file | size | STEP entities | elements (PRODUCT_TYPES) | discipline breakdown |
|---|---|---|---|---|
| `... - CONTAINMENT.ifc` | 56.7 MB | 774,041 | 21,009 | MEP=21,009 |
| `... - EQUIPMENT.ifc` | 1,394.2 MB | 26,103,308 | 292 | ARC=292 (dense mesh geometry — ~23,500 raw faces/element avg) |
| `...-OVERALL.ifc` | 2,045.2 MB | 37,716,099 | 66,214 | ARC=39,254, MEP=26,960 |

Counts produced by `../ifc_preflight_stats.sh` (grep+awk, no browser/wasm parse — see that script's
header for exactly which classification table it mirrors and its known parity gaps vs the real
in-browser parser).

## Why EQUIPMENT.ifc is the interesting one
292 "elements" but 6.88M `IFCPOLYLOOP` / 6.78M `IFCFACE` / 5.37M `IFCCARTESIANPOINT` — this file is
almost entirely dense tessellated B-rep mesh geometry on a handful of equipment items, not many
simple parametric elements. That shape (few elements, huge per-element mesh) stresses a different
part of the pipeline than element *count* does — see `prompts/IFC_LARGE_PRIVATE_STRESS_TEST.md`
§RISK FINDINGS.

## Regenerating these numbers
```
../ifc_preflight_stats.sh "KUL070-SWC-01-XX-3D-E-0001 - CONTAINMENT.ifc"
```
