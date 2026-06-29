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

## Files
`connectors.js` · `rules.js` · `watermark.js` · `models.js` · `engine.js` · `index.js` · `tests/witness_run.js`
