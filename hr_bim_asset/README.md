<!-- Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX: MIT -->
# HR_BIM_ASSET — the building's operate phase (alpha)

> **⚠ DEMONSTRATOR — NOT OFFICIAL.** Every screen/record carries the `CONTOH — TIDAK RASMI` /
> `SAMPLE — NOT OFFICIAL` watermark. Demo values only; any real statutory rate/fee is behind the
> §RESEARCH GATE in `prompts/RESUME_HR_BIM_ASSET.md`. Minimal by design — expand per a big user request.

The fusion of **HR** (parties: employees/tenants/owners) + **BIM** (the model: units/spaces/assets) +
**Asset** (equipment/IoT/maintenance) = the 7D operate phase, on one signed op-log and one model.

## The keystone: ONE generic periodic RUN
`(period × parties × element-rules) → signed lines → GL`, direction-agnostic. Payroll is just profile #1.

| Profile | Parties | Cash dir | Statement |
|---|---|---|---|
| `payroll` | employees | OUT | payslip |
| `tenancy` | active leases | IN (AR) | rent invoice |
| `strata` | owners/parcels | IN (AR) | fee notice |
| `maintenance` | assets | COST | work order |

## AD-defined models (singular demo records, alpha)
`Tenancy` (HR_Lease) · `Property Management` (PM_Property) · `Strata Title/Ownership` (PM_Strata_Parcel) ·
`Asset/Equipment` (PM_Asset — links **`bim_guid` ↔ `iot_device`** + operator/vendor/personnel + schedule →
the **7D Viewer overlay** seam).

## Guarantees (witnessed — `node hr_bim_asset/tests/witness_run.js`, W-HBA-ALPHA 18/18)
- **Glass-box** — every statement line cites a rule + recomputes exactly.
- **Deterministic** — two runs → bit-identical fingerprint; replay-from-signed-log == live.
- **Tamper-evident** — amending a signed op breaks `verifyChain`.
- **Balanced GL** — every profile posts a balanced journal.

## Coupling
`connectors.js` is the ONLY coupling seam (STUB → REAL: `erp_kernel.js` sealChain · sql.js 5-table ·
`doc_poster.js` GL · `C_BPartner.isEmployee`). The module boots & runs standalone with the stubs;
swap stub bodies to go live — engine + witness never change.

## Spatial view (Viewer slice — alpha)
Two Find lenses as flaticon toggles (`users`=Tenancy, `cpu`=IoT; word on hover, active=blue band) on the
existing search→results→zoom→popup rails. High level = storey **population-density dots**; drill = click→zoom→
**human dummy**→IFC-style popup. Zero-impact: only the `MeshPort`/`ScenePort` seams; toggle-off restores fully.
Witnessed — `node hr_bim_asset/tests/witness_view.js` (W-HBA-VIEW). HBA is a **spine across 3 apps** (Viewer
spatial · ERP agreement/product/AR · HR details/attendance/access) — see `prompts/RESUME_HR_BIM_ASSET.md §CROSS-APP`.

## Real-guid binding (NON-INVENT gate)
`binding.js` is the `resolveGuid` JOIN: a record lights a unit ONLY when its guid resolves to a REAL mesh in
the loaded building (`APP.guidMap`, keyed meshId→guid). A non-matching guid is honestly **un-linked**, never
tinted. The demo lease/parcel bind to real HHS rooms (`RM_Level_1_1/2`, extracted into `fixtures/hhs_rooms.json`).
Witnessed — `tests/witness_bind.js` (W-HBA-BIND 9/9).

## Viewer wire (live)
`viewer/hba_lens.js` (additive, host-injected) binds the witnessed overlay engine to the scene through a real
**MeshPort over `APP.guidMap`**, and data-gates two pill icons in `viewer/panels.js` — they appear ONLY when a
lens detects a real binding (the whwalk `pill:false` precedent). The HBA engine files load browser-style (self.Hba*
globals) before `hba_lens.js` in `viewer/viewer.html`. Witnessed — `tests/witness_wire.js` (W-HBA-WIRE 9/9).
Remaining: live 3D Playwright/deploy smoke. *Known v1 limits:* emissive tint (no ghost-the-rest yet; shared
materials); instanced-mesh `_N` slots use the same `A.guidMap[obj.id]` lookup as `viewer/nlp.js`.

## Files
`connectors.js` · `rules.js` · `watermark.js` · `models.js` · `binding.js` · `engine.js` · `overlay.js` ·
`lens.js` · `index.js` · `fixtures/build_hhs_rooms.js` (+ `hhs_rooms.json`) · `tests/witness_{run,view,bind,wire}.js`
· (viewer wire) `../viewer/hba_lens.js`
