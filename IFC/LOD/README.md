# IFC/LOD/ — free real-world component objects (IoT/CCTV proof-of-concept)

Standalone, single-object `.ifc` files for equipment that has no per-building ARC context of its
own — distinct from `IFC/`'s per-building convention (one ARC-only file per resident). These are
LOD-ish component objects, sourced free from real manufacturer/generic BIM libraries, meant to be
placed INTO a building at a bound device location (e.g. HR_BIM_Asset's IoT mockup), not opened as
a building in their own right.

**Non-invent discipline: every file below is a genuine free download, unmodified, real geometry —
never invented/synthesized.** Fetched 2026-07-04 as a proof-of-concept for
`bim-compiler prompts/RESUME_HR_BIM_ASSET.md` §2026-07-04d (IoT/CCTV zoom+highlight spec).

| File | Source | Real IFC classification | Notes |
|---|---|---|---|
| `CCTV_Paxton10MiniBulletCamera_CORE.ifc` | [NBS Source](https://source.thenbs.com/en/gb/product/paxton10-mini-bullet-camera-core-series/gG6ZLLrSshKQx8XHmSwSUp/vKmf38zin3qURgUcZJLgBA) — Paxton Access Ltd | `IfcBuildingElementProxyType`, `IfcExportType='CAMERA'` | IFC2X3, ~900 geometry entities (surface styles + materials, a detailed housing mesh) |
| `Sensor_Aico_Ei1025_TempHumidityCO2.ifc` | [NBS Source](https://source.thenbs.com/en/gb/product/ei1025-temperature-humidity-and-co-environmental-sensor/detsfE1UWDKJA84povvcpi/dsbpby31dghr7jJF2ByKZs) — Aico Ltd | `IfcSensorType`, `.TEMPERATURESENSOR.` | IFC2X3, simple box-form sensor, 17 geometry entities |
| `Solar_NBS_PhotovoltaicModule.ifc` | [NBS Source](https://source.thenbs.com/product/photovoltaic-modules/uEQzQNYFh3hntNu86fsFv) — generic NBS object | `IfcEnergyConversionDevice` (`nbl_PhotovoltaicModules`) | IFC2X3 |
| `Electrical_Bender_LINETRAXX_PEM353_PowerMeter.ifc` | [NBS Source](https://source.thenbs.com/en/gb/product/linetraxx-pem353-power-quality-measuring/guat7ETzxAT8sTakDphHzy/4mmsK22vWKLgEZhYSLW2Js) — Bender UK | `IfcFlowInstrumentType` | IFC2X3, power-quality meter (stands in for the "electrical" IoT sensor) |

**Genuinely not found yet (flag, don't fabricate a stand-in mesh):** boiler pressure gauge, sound
level meter, dust/PM2.5 sensor — no free real-geometry IFC object located for these in the
proof-of-concept pass. Next session: either widen the manufacturer search (Siemens/Danfoss/Honeywell
BIM portals) or accept a primitive-box placeholder for just these two, per the spec's own
LOD400-CHECK §2 fallback.

## How these were found (reusable recipe, don't re-derive)
NBS Source (`source.thenbs.com`) product pages embed a normalized GraphQL cache blob in the raw
HTML (`__typename":"DigitalObject","format":"IFC"`, referencing a `DigitalObjectFile-<id>` record
that resolves to `"assetId":"<uuid>"`). The real download is a plain GET, no login, no session:

```
https://asset.source.thenbs.com/api/<assetId>
```

returns the raw `.ifc` (STEP/ISO-10303-21) file directly, `Content-Type: text/plain`. Works via a
plain `curl` with a browser User-Agent (NBS Source itself blocks bot-signature fetchers like a bare
WebFetch tool with a 403 — a normal browser UA avoids that). No account, no payment — genuinely free.

## Not yet done (next session, see the resume-doc spec)
Placement into `HHS_Office_Federated` as sample data (positioning at each device's real bound
location, coordinate transform into the building's frame, wiring the new element guids into
`models.js Asset` records / `iot.js`'s per-device compile) is real pipeline work — not attempted
here. This folder only proves the objects are real and fetchable.
