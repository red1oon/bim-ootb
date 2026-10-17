// ⚠ DO NOT REMOVE — IFC -> model DB extraction core (Node schema). Spec: bim-ootb prompts/DXF2BIM_MODELLER_LANE.md §L5.6 S5.
// Moved out of scripts/extractIFC2DB.js (now a thin CLI over this) so the Modeller can run the SAME extractor in the browser (web-ifc-api-iife +
// sql.js). One schema, one extractor. Regression: tests/dxf2bim/witness_extract_core.js (every table row-for-row vs the pre-move script).
/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.IfcExtractCore = factory(); })(this, function () {
'use strict';
// ── Discipline map (same as import_worker.js) ──
const DISC_MAP = {
  IfcWall:'ARC', IfcWallStandardCase:'ARC', IfcSlab:'ARC', IfcDoor:'ARC',
  IfcWindow:'ARC', IfcRoof:'ARC', IfcStair:'ARC', IfcStairFlight:'ARC',
  IfcRailing:'ARC', IfcCovering:'ARC', IfcCurtainWall:'ARC', IfcPlate:'ARC',
  IfcFurnishingElement:'ARC', IfcBuildingElementProxy:'ARC', IfcSpace:'ARC',
  IfcFurniture:'ARC', IfcSystemFurnitureElement:'ARC', IfcBuildingElementPart:'ARC',
  IfcRamp:'ARC', IfcRampFlight:'ARC', IfcTransportElement:'ARC',
  IfcBeam:'STR', IfcColumn:'STR', IfcFooting:'STR', IfcPile:'STR',
  IfcMember:'STR', IfcReinforcingBar:'STR', IfcReinforcingMesh:'STR',
  IfcTendon:'STR', IfcTendonAnchor:'STR',
  IfcCableSegment:'ELEC', IfcCableCarrierSegment:'ELEC', IfcCableCarrierFitting:'ELEC',
  IfcElectricAppliance:'ELEC', IfcLightFixture:'ELEC', IfcOutlet:'ELEC',
  IfcJunctionBox:'ELEC', IfcSwitchingDevice:'ELEC', IfcElectricDistributionBoard:'ELEC',
  IfcPipeSegment:'PLB', IfcPipeFitting:'PLB', IfcSanitaryTerminal:'PLB',
  IfcValve:'PLB', IfcWasteTerminal:'PLB', IfcStackTerminal:'PLB',
  IfcDuctSegment:'ACMV', IfcDuctFitting:'ACMV', IfcAirTerminal:'ACMV',
  IfcAirTerminalBox:'ACMV', IfcUnitaryEquipment:'ACMV', IfcCoil:'ACMV',
  IfcFan:'ACMV', IfcCompressor:'ACMV', IfcChiller:'ACMV',
  IfcFireSuppressionTerminal:'FP', IfcAlarm:'FP',
  IfcFlowSegment:'MEP', IfcFlowTerminal:'MEP', IfcFlowFitting:'MEP',
  IfcFlowController:'MEP', IfcFlowMovingDevice:'MEP', IfcFlowStorageDevice:'MEP',
  IfcFlowTreatmentDevice:'MEP', IfcEnergyConversionDevice:'MEP',
  IfcDistributionElement:'MEP', IfcDistributionFlowElement:'MEP',
  IfcDistributionControlElement:'MEP',
};

const CLASS_NAME_MAP = {};
for (const k of Object.keys(DISC_MAP)) CLASS_NAME_MAP[k.toUpperCase()] = k;
CLASS_NAME_MAP['IFCOPENINGELEMENT'] = 'IfcOpeningElement';
CLASS_NAME_MAP['IFCSITE'] = 'IfcSite';
CLASS_NAME_MAP['IFCGEOGRAPHICELEMENT'] = 'IfcGeographicElement';

function properClassName(typeCode) {
  const upper = typeCode.toUpperCase();
  return CLASS_NAME_MAP[upper] || ('Ifc' + typeCode.substring(3).charAt(0).toUpperCase() + typeCode.substring(4).toLowerCase());
}

// §FLOWTERM-REFINE: IfcFlowTerminal is the abstract supertype generic/IFC2x3 exporters emit for
// sprinklers, lights, diffusers AND sanitary fixtures — the flat "IfcFlowTerminal → MEP" rule buries
// them all in MEP (sprinklers never show under FP). Disambiguate the catch-all by element-name
// keyword to the discipline the specific subtype would carry. Deterministic; unmatched → MEP.
const FLOWTERM_NAME_DISC = [
  [['sprinkler','fire suppression','fire protection','firefight'], 'FP'],
  [['light','luminaire','lamp','downlight','spotlight'], 'ELEC'],
  [['receptacle','socket','outlet','switch','panelboard','panel board'], 'ELEC'],
  [['diffuser','grille','register','air terminal','supply air','return air','exhaust'], 'ACMV'],
  [['lavatory','water closet','urinal','sink','basin','shower','toilet','wc','sanitary','bidet','faucet','tap'], 'PLB'],
];
function classifyDisc(ifcClass, name) {
  if (ifcClass === 'IfcFlowTerminal' && name) {
    const low = String(name).toLowerCase();
    for (const [keys, disc] of FLOWTERM_NAME_DISC) if (keys.some(k => low.includes(k))) return disc;
  }
  return DISC_MAP[ifcClass] || 'ARC';
}

// ── FNV-1a hash (same as import_worker.js) ──
function fnvHash(buf) {
  let h = 0x811c9dc5;
  for (let i = 0; i < buf.length; i++) { h ^= buf[i]; h = Math.imul(h, 0x01000193); }
  let h2 = 0x6c62272e;
  for (let i = buf.length - 1; i >= 0; i--) { h2 ^= buf[i]; h2 = Math.imul(h2, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8,'0') + (h2 >>> 0).toString(16).padStart(8,'0');
}

// ── Resolve material color from IFC material reference ──
function resolveMaterialColor(ifcApi, modelID, matExpressID) {
  try {
    const mat = ifcApi.GetLine(modelID, matExpressID);
    if (!mat) return null;

    // Direct IfcMaterial → check HasRepresentation
    if (mat.HasRepresentation) {
      for (let i = 0; i < mat.HasRepresentation.length; i++) {
        const c = extractColorFromRepresentation(ifcApi, modelID, mat.HasRepresentation[i].value);
        if (c) return c;
      }
    }

    // IfcMaterialLayerSetUsage → IfcMaterialLayerSet → layers
    if (mat.ForLayerSet) {
      return resolveMaterialColor(ifcApi, modelID, mat.ForLayerSet.value);
    }
    if (mat.MaterialLayers) {
      for (let i = 0; i < mat.MaterialLayers.length; i++) {
        try {
          const layer = ifcApi.GetLine(modelID, mat.MaterialLayers[i].value);
          if (layer.Material) {
            const c = resolveMaterialColor(ifcApi, modelID, layer.Material.value);
            if (c) return c;
          }
        } catch(e) {}
      }
    }

    // IfcMaterialConstituentSet → constituents
    if (mat.MaterialConstituents) {
      for (let i = 0; i < mat.MaterialConstituents.length; i++) {
        try {
          const constituent = ifcApi.GetLine(modelID, mat.MaterialConstituents[i].value);
          if (constituent.Material) {
            const c = resolveMaterialColor(ifcApi, modelID, constituent.Material.value);
            if (c) return c;
          }
        } catch(e) {}
      }
    }

    // IfcMaterialList → Materials
    if (mat.Materials) {
      for (let i = 0; i < mat.Materials.length; i++) {
        const c = resolveMaterialColor(ifcApi, modelID, mat.Materials[i].value);
        if (c) return c;
      }
    }
  } catch(e) {}
  return null;
}

function extractColorFromRepresentation(ifcApi, modelID, repExpressID) {
  try {
    const rep = ifcApi.GetLine(modelID, repExpressID);
    if (!rep || !rep.Representations) return null;
    for (let i = 0; i < rep.Representations.length; i++) {
      const styledRep = ifcApi.GetLine(modelID, rep.Representations[i].value);
      if (!styledRep || !styledRep.Items) continue;
      for (let j = 0; j < styledRep.Items.length; j++) {
        const styledItem = ifcApi.GetLine(modelID, styledRep.Items[j].value);
        if (!styledItem || !styledItem.Styles) continue;
        for (let k = 0; k < styledItem.Styles.length; k++) {
          const style = ifcApi.GetLine(modelID, styledItem.Styles[k].value);
          if (!style || !style.Styles) continue;
          for (let l = 0; l < style.Styles.length; l++) {
            const rendering = ifcApi.GetLine(modelID, style.Styles[l].value);
            if (rendering && rendering.SurfaceColour) {
              const rgb = ifcApi.GetLine(modelID, rendering.SurfaceColour.value);
              if (rgb && rgb.Red !== undefined) {
                const r = rgb.Red.value !== undefined ? rgb.Red.value : rgb.Red;
                const g = rgb.Green.value !== undefined ? rgb.Green.value : rgb.Green;
                const b = rgb.Blue.value !== undefined ? rgb.Blue.value : rgb.Blue;
                // Skip near-white (>0.95 all channels)
                if (r > 0.95 && g > 0.95 && b > 0.95) return null;
                return `${r.toFixed(3)},${g.toFixed(3)},${b.toFixed(3)},1.000`;
              }
            }
          }
        }
      }
    }
  } catch(e) {}
  return null;
}

// ── Main ──

// ctx: { WebIFC, ifcApi (initialised), ifcData (Uint8Array), buildingName, sourceName, discOverride, db, Buf, log, progress }
// Buf: { from(arrayBuffer) -> bytes, concat([bytes...]) -> bytes } (Node: Buffer; browser: Uint8Array shim)
async function extractToDb(ctx) {
  const WebIFC = ctx.WebIFC, Buf = ctx.Buf, log = ctx.log || function () {}, progress = ctx.progress || function () {};
  const ifcPath = ctx.sourceName;
  log(`§EXTRACT_START ifc=${ifcPath}`);
  const ifcData = ctx.ifcData;
  log(`§IFC_SIZE ${(ifcData.byteLength / 1024 / 1024).toFixed(1)}MB`);

  const ifcApi = ctx.ifcApi;   // initialised by the caller (Node: require('web-ifc'); browser: web-ifc-api-iife + wasm)
  log('§WASM_READY');

  const modelID = ifcApi.OpenModel(ifcData, {
    COORDINATE_TO_ORIGIN: false,
    USE_FAST_BOOLS: true,
    OPTIMIZE_PROFILES: true,
  });
  if (modelID < 0) { throw new Error('§PARSE_FAIL'); }
  log(`§PARSE_OK modelID=${modelID}`);

  // ── Project name ──
  const buildingName = ctx.buildingName;
  let projectName = buildingName;
  const projIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCPROJECT);
  if (projIds.size() > 0) {
    try {
      const proj = ifcApi.GetLine(modelID, projIds.get(0));
      if (proj.Name && proj.Name.value) projectName = proj.Name.value;
    } catch(e) {}
  }

  // ── Storeys ──
  // §S18 (2026-08-17, prompts/4D_GANTT_TM_REFACTOR.md): storeyGuid/storeyElevation added alongside
  // the existing name map — both are plain IfcBuildingStorey attributes (GlobalId, Elevation),
  // EXTRACTED not inferred. Elevation was never read anywhere in this extractor before; without it
  // spatial_structure had no real per-storey height signal at all (only elements_meta.storey names).
  const storeyMap = {};
  const storeyGuid = {};
  const storeyElevation = {};
  const storeyElevationRaw = {};
  const storeyIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCBUILDINGSTOREY);
  for (let i = 0; i < storeyIds.size(); i++) {
    try {
      const s = ifcApi.GetLine(modelID, storeyIds.get(i));
      storeyMap[storeyIds.get(i)] = s.Name ? s.Name.value : 'Level ' + i;
      storeyGuid[storeyIds.get(i)] = s.GlobalId ? s.GlobalId.value : null;
      storeyElevation[storeyIds.get(i)] = (s.Elevation && s.Elevation.value != null) ? s.Elevation.value : null;
      storeyElevationRaw[storeyIds.get(i)] = storeyElevation[storeyIds.get(i)];   // §L1.6: unscaled copy (file units)
    } catch(e) {}
  }

  // ── Buildings ──
  // §S18: IfcBuilding rows, read the same way storeys are — GlobalId + Name off the plain IFC
  // entity. Used below to resolve each storey's REAL parent building via IfcRelAggregates (not a
  // guess, not "buildings[0]" — see §PATHS NOT TO TAKE #7 in the spec: no z-proximity inference).
  const buildingMap = {};
  const buildingIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCBUILDING);
  for (let i = 0; i < buildingIds.size(); i++) {
    try {
      const b = ifcApi.GetLine(modelID, buildingIds.get(i));
      buildingMap[buildingIds.get(i)] = {
        guid: b.GlobalId ? b.GlobalId.value : null,
        name: b.Name ? b.Name.value : null
      };
    } catch(e) {}
  }

  // ── Containment (element → storey) ──
  const elementToStorey = {};
  const relIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);
  for (let i = 0; i < relIds.size(); i++) {
    try {
      const rel = ifcApi.GetLine(modelID, relIds.get(i));
      const storeyId = rel.RelatingStructure ? rel.RelatingStructure.value : null;
      const storeyName = storeyMap[storeyId] || 'Unknown';
      if (rel.RelatedElements) {
        for (let j = 0; j < rel.RelatedElements.length; j++) {
          elementToStorey[rel.RelatedElements[j].value] = storeyName;
        }
      }
    } catch(e) {}
  }

  // ── Aggregation (storey → IfcSpace via IfcRelAggregates/Decomposes) ──
  // §SPACE-SCOPED (2026-07-10): IfcRelContainedInSpatialStructure never relates an IfcSpace to its
  // storey — a space DECOMPOSES a storey via IfcRelAggregates instead. Verified against Clinic's real
  // IFC: CENTRAL WAITING (#85) is a RelatedObject of IFCRELAGGREGATES whose RelatingObject (#3954) is
  // IFCBUILDINGSTOREY 'First Floor' — never appears in any IFCRELCONTAINEDINSPATIALSTRUCTURE at all.
  // Without this pass every IfcSpace row falls to storey='Unknown' (measured: all 269 Clinic spaces,
  // before this fix). Reuses the same storeyMap; never overrides an entry the containment pass above
  // already set (spaces and physical elements don't collide on the same expressID).
  // §S18: same IFCRELAGGREGATES pass now also resolves each storey's REAL parent IfcBuilding
  // (storeyParentBuildingGuid) when RelatingObject is a building rather than a storey — the exact
  // relation LTU_AHouse's extraction already captures correctly for its own 9/38/751 shape. Purely
  // additive: the pre-existing storey->space branch below is untouched (same condition, same effect).
  const storeyParentBuildingGuid = {};
  const aggIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELAGGREGATES);
  for (let i = 0; i < aggIds.size(); i++) {
    try {
      const rel = ifcApi.GetLine(modelID, aggIds.get(i));
      const parentId = rel.RelatingObject ? rel.RelatingObject.value : null;
      if (parentId != null && parentId in buildingMap && rel.RelatedObjects) {
        for (let j = 0; j < rel.RelatedObjects.length; j++) {
          const relId = rel.RelatedObjects[j].value;
          if (relId in storeyGuid) storeyParentBuildingGuid[relId] = buildingMap[parentId].guid;
        }
      }
      if (!(parentId in storeyMap)) continue;
      const storeyName = storeyMap[parentId];
      if (rel.RelatedObjects) {
        for (let j = 0; j < rel.RelatedObjects.length; j++) {
          const relId = rel.RelatedObjects[j].value;
          if (!(relId in elementToStorey)) elementToStorey[relId] = storeyName;
        }
      }
    } catch(e) {}
  }

  // ── Collect elements ──
  const PRODUCT_TYPES = [
    WebIFC.IFCWALL, WebIFC.IFCWALLSTANDARDCASE, WebIFC.IFCSLAB, WebIFC.IFCDOOR,
    WebIFC.IFCWINDOW, WebIFC.IFCROOF, WebIFC.IFCSTAIR, WebIFC.IFCSTAIRFLIGHT,
    WebIFC.IFCRAILING, WebIFC.IFCCOVERING, WebIFC.IFCCURTAINWALL, WebIFC.IFCPLATE,
    WebIFC.IFCFURNISHINGELEMENT, WebIFC.IFCBUILDINGELEMENTPROXY,
    WebIFC.IFCFURNITURE, WebIFC.IFCSYSTEMFURNITUREELEMENT,
    WebIFC.IFCBUILDINGELEMENTPART, WebIFC.IFCRAMP, WebIFC.IFCRAMPFLIGHT,
    WebIFC.IFCTRANSPORTELEMENT,
    WebIFC.IFCBEAM, WebIFC.IFCCOLUMN, WebIFC.IFCFOOTING, WebIFC.IFCMEMBER,
    WebIFC.IFCPILE, WebIFC.IFCREINFORCINGBAR, WebIFC.IFCREINFORCINGMESH,
    WebIFC.IFCTENDON, WebIFC.IFCTENDONANCHOR,
    WebIFC.IFCFLOWSEGMENT, WebIFC.IFCFLOWTERMINAL, WebIFC.IFCFLOWFITTING,
    WebIFC.IFCFLOWCONTROLLER, WebIFC.IFCFLOWMOVINGDEVICE, WebIFC.IFCFLOWSTORAGEDEVICE,
    WebIFC.IFCFLOWTREATMENTDEVICE, WebIFC.IFCENERGYCONVERSIONDEVICE,
    WebIFC.IFCPIPESEGMENT, WebIFC.IFCPIPEFITTING,
    WebIFC.IFCDUCTSEGMENT, WebIFC.IFCDUCTFITTING,
    WebIFC.IFCCABLESEGMENT, WebIFC.IFCCABLECARRIERSEGMENT, WebIFC.IFCCABLECARRIERFITTING,
    WebIFC.IFCLIGHTFIXTURE, WebIFC.IFCOUTLET, WebIFC.IFCJUNCTIONBOX,
    WebIFC.IFCSWITCHINGDEVICE, WebIFC.IFCELECTRICDISTRIBUTIONBOARD,
    WebIFC.IFCELECTRICAPPLIANCE, WebIFC.IFCCONTROLLER,
    WebIFC.IFCSANITARYTERMINAL, WebIFC.IFCUNITARYEQUIPMENT,
    WebIFC.IFCVALVE, WebIFC.IFCWASTETERMINAL, WebIFC.IFCSTACKTERMINAL,
    WebIFC.IFCAIRTERMINAL, WebIFC.IFCAIRTERMINALBOX,
    WebIFC.IFCCOIL, WebIFC.IFCFAN, WebIFC.IFCCOMPRESSOR, WebIFC.IFCCHILLER,
    WebIFC.IFCFIRESUPPRESSIONTERMINAL, WebIFC.IFCALARM,
    WebIFC.IFCDISTRIBUTIONFLOWELEMENT, WebIFC.IFCDISTRIBUTIONCONTROLELEMENT,
    WebIFC.IFCDISTRIBUTIONELEMENT,
    WebIFC.IFCGEOGRAPHICELEMENT,
    WebIFC.IFCSPACE,   // §SPACE-SCOPED (2026-07-10): DISC_MAP already carries IfcSpace:'ARC' (line 50) but
                        // this type was never queried — dead intent, not a working-then-broken path. Adding
                        // it here reuses the SAME per-element try/catch (line ~339-434), the SAME allVerts.length
                        // gate (skips transform row on no/empty representation, honest absence not a crash),
                        // and the SAME vertex-derived bbox fallback (lines ~406-416) every other class already
                        // gets — no new code path, no invented geometry. Verified: 0 regression across all 6
                        // buildings this script builds (SampleHouse/Duplex/HHS/Clinic/Garage/Hospital), a
                        // synthetic no-representation IfcSpace skips cleanly (meta row, no transform row, no
                        // crash) — see RESUME_DISC_WALKER_ENVELOPE_BOUND.md's 2026-07-10 entry for the full proof.
    WebIFC.IFCOPENINGELEMENT,  // §OPENINGS-BACKFILL (2026-08-02): CLASS_NAME_MAP['IFCOPENINGELEMENT'] (line 74)
                        // already existed but the type was never queried — dead intent, the EXACT §SPACE-SCOPED
                        // pattern above. Missing openings are why voidMode/pierce were inert outside LTU
                        // (fleet DBs had 0 IfcOpeningElement rows vs LTU's 3,368). Reuses the SAME per-element
                        // try/catch, the SAME allVerts.length no-representation skip, and the SAME bbox fallback
                        // as every other class — no new code path. Viewer render queries already EXCLUDE
                        // IfcOpeningElement (city.js:739, streaming.js:80) so backfilled rows never render as
                        // solids. See RESUME_FLEET_OPENINGS_BACKFILL.md §0 for the full evidence chain.
  ].filter(t => t !== undefined);

  const elements = [];
  const elementIds = new Set();
  for (const typeId of PRODUCT_TYPES) {
    const ids = ifcApi.GetLineIDsWithType(modelID, typeId);
    for (let i = 0; i < ids.size(); i++) {
      const id = ids.get(i);
      if (elementIds.has(id)) continue;
      elementIds.add(id);
      try {
        const el = ifcApi.GetLine(modelID, id);
        const typeName = ifcApi.GetNameFromTypeCode(typeId) || 'IFCBUILDINGELEMENT';
        const ifcClass = properClassName(typeName);
        elements.push({
          expressID: id,
          guid: el.GlobalId ? el.GlobalId.value : 'GUID_' + id,
          ifcClass,
          // §SPACE-SCOPED blind-spot-2 (2026-07-10): IfcSpace's `Name` is the terse room CODE
          // (e.g. '1AC1'); the human-readable name (e.g. 'CENTRAL WAITING') is `LongName` — verified
          // directly against Clinic_Architectural_IFC2x3.ifc. Prefer LongName for IfcSpace only,
          // falling back to Name if LongName is empty. Every other class keeps reading Name unchanged.
          name: (ifcClass === 'IfcSpace' && el.LongName && el.LongName.value)
            ? el.LongName.value
            : (el.Name ? el.Name.value : ifcClass + '_' + id),
          storey: elementToStorey[id] || 'Unknown',
          discipline: ctx.discOverride || classifyDisc(ifcClass, el.Name ? el.Name.value : ''),  // §FLOWTERM-REFINE
          material: '',
          _bboxX: null, _bboxY: null, _bboxZ: null,
        });
      } catch(e) {}
    }
  }
  log(`§ELEMENTS count=${elements.length} storeys=${Object.keys(storeyMap).length}`);

  // ── Resolve real material colors from IFC (override white defaults) ──
  // Chain: IfcRelAssociatesMaterial → IfcMaterial(LayerSet|ConstituentSet) →
  //        IfcMaterialDefinitionRepresentation → IfcStyledItem → IfcSurfaceStyle →
  //        IfcSurfaceStyleRendering → SurfaceColour
  const elementMaterialColor = {}; // expressID → "r,g,b,a"
  try {
    const relMatIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELASSOCIATESMATERIAL);
    for (let i = 0; i < relMatIds.size(); i++) {
      try {
        const rel = ifcApi.GetLine(modelID, relMatIds.get(i));
        if (!rel.RelatedObjects || !rel.RelatingMaterial) continue;
        const matRef = rel.RelatingMaterial.value;
        const color = resolveMaterialColor(ifcApi, modelID, matRef);
        if (!color) continue;
        for (let j = 0; j < rel.RelatedObjects.length; j++) {
          elementMaterialColor[rel.RelatedObjects[j].value] = color;
        }
      } catch(e) {}
    }
  } catch(e) {}
  log(`§MATERIALS resolved=${Object.keys(elementMaterialColor).length} elements with IFC material color`);

  // ── Tessellate geometry (same logic as import_worker.js) ──
  const geometries = []; // { guid, geomHash, vertices: Buffer, indices: Buffer }
  const transforms = []; // { guid, cx, cy, cz, rx, ry, rz, bx, by, bz }
  const worldBbox = [];
  const geomEmpty = {};  // §L1.6: ifcClass -> elements web-ifc tessellated to no triangles (no transform/bbox/mesh row)  // §L1.6 P0: { guid, b: [minX,maxX,minY,maxY,minZ,maxZ] } (world, metres after autoScale)
  let matCount = 0;

  for (let ei = 0; ei < elements.length; ei++) {
    const el = elements[ei];
    try {
      const flatMesh = ifcApi.GetFlatMesh(modelID, el.expressID);
      const allVerts = [], allIdx = [];
      let vertOffset = 0, bestColor = null;
      const geoCount = flatMesh.geometries.size();

      for (let gi = 0; gi < geoCount; gi++) {
        const geo = flatMesh.geometries.get(gi);
        const meshData = ifcApi.GetGeometry(modelID, geo.geometryExpressID);
        const vSize = meshData.GetVertexDataSize();
        const iSize = meshData.GetIndexDataSize();
        if (vSize === 0 || iSize === 0) continue;
        const verts = ifcApi.GetVertexArray(meshData.GetVertexData(), vSize);
        const idx = ifcApi.GetIndexArray(meshData.GetIndexData(), iSize);

        // Detect IfcBoundingBox (8 verts, 36 indices) — extract dims, skip from body
        if (verts.length / 6 === 8 && idx.length === 36) {
          const bxs = [], bys = [], bzs = [];
          for (let bvi = 0; bvi < 8; bvi++) {
            bxs.push(verts[bvi * 6]); bys.push(verts[bvi * 6 + 1]); bzs.push(verts[bvi * 6 + 2]);
          }
          el._bboxX = Math.max(...bxs) - Math.min(...bxs);
          el._bboxY = Math.max(...bys) - Math.min(...bys);
          el._bboxZ = Math.max(...bzs) - Math.min(...bzs);
          if (geoCount > 1) continue; // skip box, keep body
        }

        // Apply 4x4 transform, Y-up → Z-up
        const m = geo.flatTransformation;
        const vc = verts.length / 6;
        for (let vi = 0; vi < vc; vi++) {
          const lx = verts[vi*6], ly = verts[vi*6+1], lz = verts[vi*6+2];
          const wx = m[0]*lx + m[4]*ly + m[8]*lz + m[12];
          const wy = m[1]*lx + m[5]*ly + m[9]*lz + m[13];
          const wz = m[2]*lx + m[6]*ly + m[10]*lz + m[14];
          allVerts.push(wx, -wz, wy);
        }
        for (let ii = 0; ii < idx.length; ii++) allIdx.push(idx[ii] + vertOffset);
        vertOffset += vc;
        if (!bestColor && geo.color && geo.color.x !== undefined) bestColor = geo.color;
      }

      if (allVerts.length < 9) geomEmpty[el.ifcClass] = (geomEmpty[el.ifcClass] || 0) + 1;   // §L1.6: counted, not hidden
      if (allVerts.length >= 9) {
        const vertCount = allVerts.length / 3;
        let sumX = 0, sumY = 0, sumZ = 0;
        for (let vi = 0; vi < vertCount; vi++) {
          sumX += allVerts[vi*3]; sumY += allVerts[vi*3+1]; sumZ += allVerts[vi*3+2];
        }
        const cx = sumX / vertCount, cy = sumY / vertCount, cz = sumZ / vertCount;

        // Re-center at origin
        const positions = new Float32Array(allVerts.length);
        for (let vi = 0; vi < vertCount; vi++) {
          positions[vi*3]   = allVerts[vi*3]   - cx;
          positions[vi*3+1] = allVerts[vi*3+1] - cy;
          positions[vi*3+2] = allVerts[vi*3+2] - cz;
        }

        // FNV-1a content hash (same as browser)
        const idxBuf = Buf.from(new Int32Array(allIdx).buffer);
        const hashSrc = Buf.concat([Buf.from(positions.buffer), idxBuf]);
        const geomHash = fnvHash(hashSrc);

        // §OPENINGS-GHOST (2026-08-03 user directive, RESUME_FLEET_OPENINGS_BACKFILL.md §5): openings
        // are GHOSTS — elements_meta + element_transforms ONLY. No element_instances row, no geometry
        // hash, no blob: opening GUIDs in element_instances corrupted the mesh-library pipeline in the
        // S185 Duplex investigation (prompts/done/S185_duplex_investigation.md). The tessellation above
        // still runs so centroid/bbox (the transform row) stay measured, not invented; skipping the
        // push keeps instances AND component_geometries opening-free (both are written from this list
        // alone), while a non-opening element sharing the same hash still writes its own blob.
        if (el.ifcClass !== 'IfcOpeningElement') {
          geometries.push({ guid: el.guid, geomHash, vertices: Buf.from(positions.buffer), indices: idxBuf });
        }

        // Bbox fallback: compute from vertices if no IFC bbox
        if (!el._bboxX) {
          let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;
          for (let vi = 0; vi < vertCount; vi++) {
            const x=positions[vi*3],y=positions[vi*3+1],z=positions[vi*3+2];
            if(x<minX)minX=x;if(x>maxX)maxX=x;
            if(y<minY)minY=y;if(y>maxY)maxY=y;
            if(z<minZ)minZ=z;if(z>maxZ)maxZ=z;
          }
          el._bboxX = maxX-minX; el._bboxY = maxY-minY; el._bboxZ = maxZ-minZ;
        }

        transforms.push({ guid: el.guid, cx, cy, cz, rx:0, ry:0, rz:0,
          bx: el._bboxX, by: el._bboxY, bz: el._bboxZ });

        // §WORLD_BBOX (bim-ootb DXF2BIM lane §L1.6 P0): world AABB of the same world vertices (before re-centring)
        let wx0=Infinity,wx1=-Infinity,wy0=Infinity,wy1=-Infinity,wz0=Infinity,wz1=-Infinity;
        for (let vi = 0; vi < vertCount; vi++) {
          const x=allVerts[vi*3],y=allVerts[vi*3+1],z=allVerts[vi*3+2];
          if(x<wx0)wx0=x;if(x>wx1)wx1=x;if(y<wy0)wy0=y;if(y>wy1)wy1=y;if(z<wz0)wz0=z;if(z>wz1)wz1=z;
        }
        worldBbox.push({ guid: el.guid, b: [wx0, wx1, wy0, wy1, wz0, wz1] });

        // Material: prefer IFC-resolved color, fall back to geometry color
        if (elementMaterialColor[el.expressID]) {
          el.material = elementMaterialColor[el.expressID];
          matCount++;
        } else if (bestColor) {
          let r = bestColor.x, g = bestColor.y, b = bestColor.z;
          if (r > 0.95 && g > 0.95 && b > 0.95) { r = 0.92; g = 0.90; b = 0.85; }
          el.material = `${r.toFixed(3)},${g.toFixed(3)},${b.toFixed(3)},${bestColor.w.toFixed(3)}`;
          matCount++;
        }
      }
    } catch(e) {
      // skip
    }
    if ((ei+1) % 1000 === 0) progress(`tessellating ${ei+1}/${elements.length}`);
  }
  log(`\n§GEOM_EMPTY ${JSON.stringify(geomEmpty)}`);
  log(`§GEOM_DONE elements=${elements.length} geometries=${geometries.length} uniqueHashes=${new Set(geometries.map(g=>g.geomHash)).size} materials=${matCount}`);

  // ── Auto-scale heuristic (mm → m if coords > 500) ──
  let autoScale = 1.0;
  if (transforms.length > 0) {
    // Auto-scale heuristic: if element SPREAD > 500m, assume mm → /1000
    // (Don't use absolute coords — buildings can be at large grid offsets in metres)
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for (const t of transforms) {
      if(t.cx<minX)minX=t.cx;if(t.cx>maxX)maxX=t.cx;
      if(t.cy<minY)minY=t.cy;if(t.cy>maxY)maxY=t.cy;
      if(t.cz<minZ)minZ=t.cz;if(t.cz>maxZ)maxZ=t.cz;
    }
    const spread = Math.max(maxX-minX, maxY-minY, maxZ-minZ);
    if (spread > 500) {
      autoScale = 0.001;
      for (const t of transforms) {
        t.cx *= 0.001; t.cy *= 0.001; t.cz *= 0.001;
        if (t.bx) { t.bx *= 0.001; t.by *= 0.001; t.bz *= 0.001; }
      }
      for (const g of geometries) {
        const vBuf = new Float32Array(g.vertices.buffer, g.vertices.byteOffset, g.vertices.byteLength / 4);
        for (let i = 0; i < vBuf.length; i++) vBuf[i] *= 0.001;
      }
      for (const w of worldBbox) w.b = w.b.map(v => v * 0.001);
    }
  }
  log(`§UNITS autoScale=${autoScale}`);
  // §S18: IfcBuildingStorey.Elevation is read straight off the IFC attribute (no conversion applied
  // at read time), so it is in whatever length unit that FILE declared — same raw-units situation
  // element_transforms was in before the autoScale heuristic above. Measured need: Clinic's federated
  // discipline files mix units (Structural's file reads Elevation in mm — 4570/9250/-1000 — while
  // Architectural/Electrical/HVAC read the same physical floors in m — 4.57/9.25/-1). Applying the
  // SAME per-file autoScale factor already derived from this file's own element spread keeps Elevation
  // comparable across files without a second, separately-tuned heuristic.
  if (autoScale !== 1.0) {
    for (const sid in storeyElevation) {
      if (storeyElevation[sid] != null) storeyElevation[sid] *= autoScale;
    }
  }

  // ── 4D extraction (if present) ──
  const schedules = [], tasks = [], taskSequences = [], taskElements = [];
  try {
    const schedIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCWORKSCHEDULE);
    for (let i = 0; i < schedIds.size(); i++) {
      const s = ifcApi.GetLine(modelID, schedIds.get(i));
      schedules.push({
        id: s.GlobalId ? s.GlobalId.value : 'SCHED_' + i,
        name: s.Name ? s.Name.value : 'Schedule ' + i,
        status: s.Status ? s.Status.value : null,
        created: s.CreationDate ? s.CreationDate.value : null,
      });
    }
  } catch(e) {}

  try {
    const taskIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCTASK);
    for (let i = 0; i < taskIds.size(); i++) {
      try {
        const t = ifcApi.GetLine(modelID, taskIds.get(i));
        const taskTime = t.TaskTime ? ifcApi.GetLine(modelID, t.TaskTime.value) : null;
        tasks.push({
          id: t.GlobalId ? t.GlobalId.value : 'TASK_' + i,
          name: t.Name ? t.Name.value : 'Task ' + i,
          start: taskTime && taskTime.ScheduleStart ? taskTime.ScheduleStart.value : null,
          finish: taskTime && taskTime.ScheduleFinish ? taskTime.ScheduleFinish.value : null,
          duration: taskTime && taskTime.ScheduleDuration ? parseFloat(taskTime.ScheduleDuration.value) || null : null,
          status: t.Status ? t.Status.value : null,
        });
      } catch(e) {}
    }
  } catch(e) {}

  try {
    const seqIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELSEQUENCE);
    for (let i = 0; i < seqIds.size(); i++) {
      try {
        const s = ifcApi.GetLine(modelID, seqIds.get(i));
        const pred = s.RelatingProcess ? ifcApi.GetLine(modelID, s.RelatingProcess.value) : null;
        const succ = s.RelatedProcess ? ifcApi.GetLine(modelID, s.RelatedProcess.value) : null;
        if (pred && succ) {
          taskSequences.push({
            predId: pred.GlobalId ? pred.GlobalId.value : null,
            succId: succ.GlobalId ? succ.GlobalId.value : null,
            type: s.SequenceType ? s.SequenceType.value : 'FINISH_START',
            lag: s.TimeLag ? parseFloat(s.TimeLag.value) || 0 : 0,
          });
        }
      } catch(e) {}
    }
  } catch(e) {}

  try {
    const assignIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELASSIGNSTOPROCESS);
    for (let i = 0; i < assignIds.size(); i++) {
      try {
        const a = ifcApi.GetLine(modelID, assignIds.get(i));
        const process = a.RelatingProcess ? ifcApi.GetLine(modelID, a.RelatingProcess.value) : null;
        if (process && process.GlobalId && a.RelatedObjects) {
          const taskId = process.GlobalId.value;
          for (let j = 0; j < a.RelatedObjects.length; j++) {
            try {
              const obj = ifcApi.GetLine(modelID, a.RelatedObjects[j].value);
              if (obj.GlobalId) taskElements.push({ taskId, guid: obj.GlobalId.value });
            } catch(e) {}
          }
        }
      } catch(e) {}
    }
  } catch(e) {}

  if (schedules.length || tasks.length) {
    log(`§4D_FOUND schedules=${schedules.length} tasks=${tasks.length} sequences=${taskSequences.length} taskElements=${taskElements.length}`);
  } else {
    log(`§4D_NONE no scheduling data in this IFC`);
  }

  // ── §DOOR_OP (2026-10-16, bim-ootb prompts/DXF2BIM_MODELLER_LANE.md §L1.2 D1): door handing ──
  // EXTRACTED, not inferred: OperationType from the door's type object (IFC2X3 IfcDoorStyle /
  // IFC4 IfcDoorType, via IfcRelDefinesByType) or, only when no type value exists, the IFC4
  // occurrence IfcDoor.OperationType (IFC4 IfcDoor: "OperationType shall only be used if no type
  // object IfcDoorType is assigned"). Axes/origin = the door's ObjectPlacement chain resolved to
  // world (IFC Z-up = DB frame). Origin in metres via IfcProject.UnitsInContext. New table only.
  const doorOps = [];
  const storeyElevRows = [];   // §L1.6: { guid, name, attr, z } metres
  const doorOpCount = { style: 0, type: 0, occurrence: 0, none: 0, noPlacement: 0 };
  try {
    const ref = v => (v && typeof v === 'object' && 'value' in v) ? v.value : v;
    const num = v => (v && typeof v === 'object') ? Number(v.value) : Number(v);
    const SI_PREFIX = { EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 1e2, DECA: 1e1,
      DECI: 1e-1, CENTI: 1e-2, MILLI: 1e-3, MICRO: 1e-6, NANO: 1e-9, PICO: 1e-12, FEMTO: 1e-15, ATTO: 1e-18 };
    // length unit -> metres (null = not resolvable; origin then written null, never assumed)
    const siScale = u => (u.Name && ref(u.Name) === 'METRE') ? (u.Prefix ? (SI_PREFIX[ref(u.Prefix)] || null) : 1) : null;
    let lengthScale = null;
    const pids = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCPROJECT);
    if (pids.size() > 0) {
      const pr = ifcApi.GetLine(modelID, pids.get(0));
      const ua = pr.UnitsInContext ? ifcApi.GetLine(modelID, ref(pr.UnitsInContext)) : null;
      for (const uh of (ua && ua.Units) || []) {
        const u = ifcApi.GetLine(modelID, ref(uh));
        if (!u || !u.UnitType || ref(u.UnitType) !== 'LENGTHUNIT') continue;
        if (u.type === WebIFC.IFCSIUNIT) lengthScale = siScale(u);
        else if (u.type === WebIFC.IFCCONVERSIONBASEDUNIT && u.ConversionFactor) {
          const mwu = ifcApi.GetLine(modelID, ref(u.ConversionFactor));
          const base = mwu.UnitComponent ? ifcApi.GetLine(modelID, ref(mwu.UnitComponent)) : null;
          const bs = base && base.type === WebIFC.IFCSIUNIT ? siScale(base) : null;
          lengthScale = (bs != null && mwu.ValueComponent) ? num(mwu.ValueComponent) * bs : null;
        }
        break;
      }
    }
    const norm = a => { const l = Math.hypot(a[0], a[1], a[2]); return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : null; };
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const dirOf = h => { const d = ifcApi.GetLine(modelID, ref(h)); const r = d.DirectionRatios.map(num); while (r.length < 3) r.push(0); return r; };
    // IfcAxis2Placement3D/2D -> {o, x, y, z} in file units
    const axis2 = id => {
      const p = ifcApi.GetLine(modelID, id);
      const loc = ifcApi.GetLine(modelID, ref(p.Location)).Coordinates.map(num);
      while (loc.length < 3) loc.push(0);
      let z = [0, 0, 1], xr = [1, 0, 0];
      if (p.type === WebIFC.IFCAXIS2PLACEMENT3D) {
        if (p.Axis) z = norm(dirOf(p.Axis));
        if (p.RefDirection) xr = dirOf(p.RefDirection);
      } else if (p.type === WebIFC.IFCAXIS2PLACEMENT2D) {
        if (p.RefDirection) xr = dirOf(p.RefDirection);
      } else return null;
      const k = dot(xr, z);
      const x = norm([xr[0] - k * z[0], xr[1] - k * z[1], xr[2] - k * z[2]]);
      if (!z || !x) return null;
      return { o: loc, x, y: cross(z, x), z };
    };
    const compose = (P, L) => ({   // world = P.o + P.[x y z] * L
      o: [0, 1, 2].map(i => P.o[i] + P.x[i] * L.o[0] + P.y[i] * L.o[1] + P.z[i] * L.o[2]),
      x: [0, 1, 2].map(i => P.x[i] * L.x[0] + P.y[i] * L.x[1] + P.z[i] * L.x[2]),
      y: [0, 1, 2].map(i => P.x[i] * L.y[0] + P.y[i] * L.y[1] + P.z[i] * L.y[2]),
      z: [0, 1, 2].map(i => P.x[i] * L.z[0] + P.y[i] * L.z[1] + P.z[i] * L.z[2]) });
    const placement = (id, depth) => {
      if (depth > 64) return null;
      const lp = ifcApi.GetLine(modelID, id);
      if (!lp || lp.type !== WebIFC.IFCLOCALPLACEMENT) return null;
      const L = axis2(ref(lp.RelativePlacement));
      if (!L) return null;
      if (!lp.PlacementRelTo) return L;
      const P = placement(ref(lp.PlacementRelTo), depth + 1);
      return P ? compose(P, L) : null;
    };
    // door -> type object (IfcRelDefinesByType; IFC2X3 and IFC4)
    const doorType = {};
    const dbt = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELDEFINESBYTYPE);
    for (let i = 0; i < dbt.size(); i++) {
      const rel = ifcApi.GetLine(modelID, dbt.get(i));
      if (!rel.RelatingType || !rel.RelatedObjects) continue;
      for (const o of rel.RelatedObjects) doorType[ref(o)] = ref(rel.RelatingType);
    }
    for (const el of elements) {
      if (el.ifcClass !== 'IfcDoor') continue;
      const d = ifcApi.GetLine(modelID, el.expressID);
      let op = null, source = null;
      const tid = doorType[el.expressID];
      if (tid != null) {
        const t = ifcApi.GetLine(modelID, tid);
        if (t && t.OperationType && ref(t.OperationType)) {
          if (t.type === WebIFC.IFCDOORSTYLE) { op = ref(t.OperationType); source = 'style'; }
          else if (t.type === WebIFC.IFCDOORTYPE) { op = ref(t.OperationType); source = 'type'; }
        }
      }
      if (!op && d.OperationType && ref(d.OperationType)) { op = ref(d.OperationType); source = 'occurrence'; }
      if (!op) { doorOpCount.none++; continue; }
      doorOpCount[source]++;
      const pl = d.ObjectPlacement ? placement(ref(d.ObjectPlacement), 0) : null;
      if (!pl) doorOpCount.noPlacement++;
      const S = lengthScale;
      const v3 = a => a ? JSON.stringify(a) : null;
      const row = { guid: el.guid, op, source,
        x: pl ? v3(pl.x) : null, y: pl ? v3(pl.y) : null, z: pl ? v3(pl.z) : null,
        o: (pl && S != null) ? v3(pl.o.map(c => c * S)) : null,
        w: (d.OverallWidth != null && S != null) ? num(d.OverallWidth) * S : null,
        h: (d.OverallHeight != null && S != null) ? num(d.OverallHeight) * S : null };
      doorOps.push(row);
      log(`§DOOR_OP guid=${row.guid} op=${op} source=${source} x=${row.x} y=${row.y} origin=${row.o}`);
    }
    // §STOREY_ELEVATION (§L1.6 R1'): each storey's ObjectPlacement origin z resolved to world (the frame the geometry is
    // in), and its Elevation attribute, both in metres (file length unit; never assumed: null when the unit is unresolved)
    for (const sid in storeyGuid) {
      if (!storeyGuid[sid]) continue;
      const st = ifcApi.GetLine(modelID, Number(sid));
      const pl = st && st.ObjectPlacement ? placement(ref(st.ObjectPlacement), 0) : null;
      const raw = storeyElevationRaw[sid];
      storeyElevRows.push({ guid: storeyGuid[sid], name: storeyMap[sid],
        attr: (raw != null && lengthScale != null) ? raw * lengthScale : null,
        z: (pl && lengthScale != null) ? pl.o[2] * lengthScale : null });
    }
    log(`§DOOR_OPERATION rows=${doorOps.length} style=${doorOpCount.style} type=${doorOpCount.type} occurrence=${doorOpCount.occurrence} none=${doorOpCount.none} noPlacement=${doorOpCount.noPlacement} lengthScale=${lengthScale}`);
  } catch (e) {
    log(`§DOOR_OP_FAIL ${e.message}`);
  }

  // ── §REL_FILLS_HOST + §PSET_COMMON (bim-ootb DXF2BIM lane §L1.6 P0): authored relations, copied, nothing derived ──
  // §L5.6 S5: element type name of every door/window, for the door schedule + tags in the markings: the IfcRelDefinesByType type's Name
  // (IFC2X3 style or IFC4 type), else the occurrence's ObjectType attribute. Stated by the model, never inferred. Additive table `element_type`.
  const typeRows = [];
  try {
    const refOf = v => (v && v.value !== undefined ? v.value : v), typeOfId = {};
    const dbt2 = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELDEFINESBYTYPE);
    for (let i = 0; i < dbt2.size(); i++) {
      const rel = ifcApi.GetLine(modelID, dbt2.get(i));
      if (!rel.RelatingType || !rel.RelatedObjects) continue;
      for (const o of rel.RelatedObjects) typeOfId[refOf(o)] = refOf(rel.RelatingType);
    }
    for (const el of elements) {
      if (el.ifcClass !== 'IfcDoor' && el.ifcClass !== 'IfcWindow') continue;
      let name = null, source = null;
      const tid = typeOfId[el.expressID];
      if (tid != null) { const t = ifcApi.GetLine(modelID, tid); if (t && t.Name && t.Name.value) { name = t.Name.value; source = 'type'; } }
      if (!name) { const d = ifcApi.GetLine(modelID, el.expressID); if (d && d.ObjectType && d.ObjectType.value) { name = d.ObjectType.value; source = 'occurrence'; } }
      if (name) typeRows.push({ guid: el.guid, name, source });
    }
  } catch (e) { log(`§ELEMENT_TYPE_FAIL ${e.message}`); }
  log(`§ELEMENT_TYPE rows=${typeRows.length}`);
  const relFills = [];   // { opening, host, filling, hostClass, fillingClass }
  const psetRows = [];   // { guid, pset, name, value, source }
  {
    const ref = v => (v && typeof v === 'object' && 'value' in v) ? v.value : v;
    const info = {};     // expressID -> { guid, cls }
    const infoOf = id => {
      if (id == null) return null;
      if (!(id in info)) {
        try {
          const l = ifcApi.GetLine(modelID, id);
          info[id] = { guid: l && l.GlobalId ? l.GlobalId.value : null,   // entity name as the schema spells it (web-ifc class name), else upper-case fallback
            cls: (l && l.constructor && /^Ifc[A-Z]/.test(l.constructor.name)) ? l.constructor.name : properClassName(ifcApi.GetNameFromTypeCode(l.type) || '') };
        } catch (e) { info[id] = null; }
      }
      return info[id];
    };
    try {
      const hostOf = new Map(), fillOf = new Map();   // opening expressID -> host / filling expressID
      const vIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELVOIDSELEMENT);
      for (let i = 0; i < vIds.size(); i++) {
        const r = ifcApi.GetLine(modelID, vIds.get(i));
        if (r.RelatedOpeningElement && r.RelatingBuildingElement) hostOf.set(ref(r.RelatedOpeningElement), ref(r.RelatingBuildingElement));
      }
      const fIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELFILLSELEMENT);
      for (let i = 0; i < fIds.size(); i++) {
        const r = ifcApi.GetLine(modelID, fIds.get(i));
        if (r.RelatingOpeningElement && r.RelatedBuildingElement) fillOf.set(ref(r.RelatingOpeningElement), ref(r.RelatedBuildingElement));
      }
      for (const [op, host] of hostOf) {
        const o = infoOf(op), h = infoOf(host), f = fillOf.has(op) ? infoOf(fillOf.get(op)) : null;
        if (!o || !o.guid || !h || !h.guid) continue;
        relFills.push({ opening: o.guid, host: h.guid, filling: f ? f.guid : null, hostClass: h.cls, fillingClass: f ? f.cls : null });
      }
    } catch (e) { log(`§REL_FILLS_HOST_FAIL ${e.message}`); }
    try {
      const want = new Set(['IsExternal', 'LoadBearing']);
      const extracted = new Set(elements.map(e => e.expressID));
      const readPset = (psetId, guid, source, into) => {
        const ps = ifcApi.GetLine(modelID, psetId);
        if (!ps || ps.type !== WebIFC.IFCPROPERTYSET || !ps.Name || !/^Pset_.*Common$/.test(ps.Name.value)) return;
        for (const ph of ps.HasProperties || []) {
          const p = ifcApi.GetLine(modelID, ref(ph));
          if (!p || p.type !== WebIFC.IFCPROPERTYSINGLEVALUE || !p.Name || !want.has(p.Name.value) || !p.NominalValue) continue;
          let v = p.NominalValue.value;
          if (v === true || v === 'T' || v === '.T.') v = 'TRUE'; else if (v === false || v === 'F' || v === '.F.') v = 'FALSE'; else if (v === 'U' || v === '.U.') v = 'UNKNOWN';
          into.set(ps.Name.value + '|' + p.Name.value, { guid, pset: ps.Name.value, name: p.Name.value, value: String(v), source });
        }
      };
      const occ = new Map(), typ = new Map();   // expressID -> Map(key -> row)
      const dIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELDEFINESBYPROPERTIES);
      for (let i = 0; i < dIds.size(); i++) {
        const r = ifcApi.GetLine(modelID, dIds.get(i));
        if (!r.RelatingPropertyDefinition || !r.RelatedObjects) continue;
        for (const oh of r.RelatedObjects) {
          const id = ref(oh);
          if (!extracted.has(id)) continue;
          if (!occ.has(id)) occ.set(id, new Map());
          readPset(ref(r.RelatingPropertyDefinition), infoOf(id).guid, 'occurrence', occ.get(id));
        }
      }
      const tIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELDEFINESBYTYPE);
      for (let i = 0; i < tIds.size(); i++) {
        const r = ifcApi.GetLine(modelID, tIds.get(i));
        if (!r.RelatingType || !r.RelatedObjects) continue;
        const t = ifcApi.GetLine(modelID, ref(r.RelatingType));
        const hps = (t && t.HasPropertySets) || [];
        if (!hps.length) continue;
        for (const oh of r.RelatedObjects) {
          const id = ref(oh);
          if (!extracted.has(id)) continue;
          if (!typ.has(id)) typ.set(id, new Map());
          for (const h of hps) readPset(ref(h), infoOf(id).guid, 'type', typ.get(id));
        }
      }
      for (const el of elements) {
        const o = occ.get(el.expressID) || new Map(), t = typ.get(el.expressID) || new Map();
        for (const [k, row] of t) if (!o.has(k)) psetRows.push(row);   // occurrence overrides type
        for (const row of o.values()) psetRows.push(row);
      }
    } catch (e) { log(`§PSET_COMMON_FAIL ${e.message}`); }
  }
  log(`§REL_FILLS_HOST rows=${relFills.length} filled=${relFills.filter(r => r.filling).length} void_only=${relFills.filter(r => !r.filling).length}`);
  log(`§PSET_COMMON rows=${psetRows.length} occurrence=${psetRows.filter(r => r.source === 'occurrence').length} type=${psetRows.filter(r => r.source === 'type').length}`);

  ifcApi.CloseModel(modelID);

  // ── Write SQLite DB ──
  const db = ctx.db;   // better-sqlite3 or a sql.js adapter: exec(sql), prepare(sql).run(...args)

  db.exec(`CREATE TABLE project_metadata (key TEXT PRIMARY KEY, value TEXT)`);
  db.exec(`CREATE TABLE elements_meta (guid TEXT PRIMARY KEY, ifc_class TEXT, element_name TEXT, storey TEXT, discipline TEXT, material_name TEXT, material_rgba TEXT, building TEXT)`);
  db.exec(`CREATE TABLE element_transforms (guid TEXT PRIMARY KEY, center_x REAL, center_y REAL, center_z REAL, rotation_x REAL, rotation_y REAL, rotation_z REAL, bbox_x REAL, bbox_y REAL, bbox_z REAL)`);
  db.exec(`CREATE TABLE element_instances (guid TEXT PRIMARY KEY, geometry_hash TEXT)`);
  db.exec(`CREATE TABLE component_geometries (geometry_hash TEXT PRIMARY KEY, vertices BLOB, faces BLOB, building TEXT)`);

  // §S18 (2026-08-17, prompts/4D_GANTT_TM_REFACTOR.md §S18 Part B): real IfcBuilding + IfcBuildingStorey
  // rows, EXTRACTED not compiled — this extractor never wrote spatial_structure at all before (the only
  // source was scripts/compile_rooms.py's synthetic STC_/RM_ fallback, injected downstream with no
  // Elevation and no real parentage). Schema matches LTU_AHouse's reference shape (guid/type/name/
  // parent_guid/object_type/predefined_type) plus one new column, `elevation`, since no shipped schema
  // carried it anywhere in the fleet. compile_rooms.py ALTER-TABLE-ADD-COLUMNs its own bbox columns on
  // top of whatever exists (idempotent on name, see its own `_addcol` guard) — this table coexisting
  // with its later STC_*/RM_* rows is by design, not a collision (disjoint guid namespaces).
  db.exec(`CREATE TABLE spatial_structure (guid TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT, parent_guid TEXT, object_type TEXT, predefined_type TEXT, elevation REAL)`);
  db.exec(`CREATE TABLE rel_aggregates (parent_guid TEXT NOT NULL, child_guid TEXT NOT NULL, PRIMARY KEY (parent_guid, child_guid))`);

  // 4D tables (empty if no scheduling data)
  db.exec(`CREATE TABLE schedules (schedule_id TEXT PRIMARY KEY, name TEXT, status TEXT, created_date TEXT)`);
  db.exec(`CREATE TABLE tasks (task_id TEXT PRIMARY KEY, schedule_id TEXT, name TEXT, start_date TEXT, finish_date TEXT, duration_days REAL, status TEXT)`);
  db.exec(`CREATE TABLE task_sequences (predecessor_id TEXT, successor_id TEXT, sequence_type TEXT, lag_days REAL DEFAULT 0, PRIMARY KEY (predecessor_id, successor_id))`);
  db.exec(`CREATE TABLE task_elements (task_id TEXT, guid TEXT, PRIMARY KEY (task_id, guid))`);

  // §DOOR_OP (§L1.2 D1): new table; written after every pre-existing table so their outputs are unchanged
  db.exec(`CREATE TABLE door_operation (guid TEXT PRIMARY KEY, operation_type TEXT, source TEXT, x_axis TEXT, y_axis TEXT, z_axis TEXT, origin TEXT, overall_width REAL, overall_height REAL)`);

  // Insert metadata
  const metaStmt = db.prepare('INSERT INTO project_metadata VALUES (?,?)');
  metaStmt.run('project_name', projectName);
  metaStmt.run('import_date', new Date().toISOString());
  metaStmt.run('building_name', buildingName);
  metaStmt.run('source_file', ctx.sourceName);

  // Insert elements
  const elStmt = db.prepare('INSERT OR IGNORE INTO elements_meta VALUES (?,?,?,?,?,?,?,?)');
  for (const el of elements) {
    elStmt.run(el.guid, el.ifcClass, el.name, el.storey, el.discipline, null, el.material || null, buildingName);
  }

  // Insert spatial structure — §S18: real IfcBuilding + IfcBuildingStorey rows with EXTRACTED
  // Elevation + real IfcRelAggregates-derived building parentage (storeyParentBuildingGuid, built
  // above; null when the source IFC genuinely has no such relationship — never a guess/fallback).
  const ssStmt = db.prepare('INSERT OR IGNORE INTO spatial_structure (guid,type,name,parent_guid,object_type,predefined_type,elevation) VALUES (?,?,?,?,?,?,?)');
  for (const bid in buildingMap) {
    const b = buildingMap[bid];
    if (b.guid) ssStmt.run(b.guid, 'IfcBuilding', b.name, null, null, null, null);
  }
  for (const sid in storeyMap) {
    const g = storeyGuid[sid];
    if (!g) continue;
    ssStmt.run(g, 'IfcBuildingStorey', storeyMap[sid], storeyParentBuildingGuid[sid] || null, null, null, storeyElevation[sid]);
  }
  const raStmt = db.prepare('INSERT OR IGNORE INTO rel_aggregates (parent_guid, child_guid) VALUES (?,?)');
  for (const sid in storeyParentBuildingGuid) {
    const g = storeyGuid[sid];
    if (g) raStmt.run(storeyParentBuildingGuid[sid], g);
  }

  // Insert transforms
  const trStmt = db.prepare('INSERT OR IGNORE INTO element_transforms VALUES (?,?,?,?,?,?,?,?,?,?)');
  for (const t of transforms) {
    trStmt.run(t.guid, t.cx, t.cy, t.cz, t.rx, t.ry, t.rz, t.bx, t.by, t.bz);
  }

  // Insert instances + geometry BLOBs (deduped)
  const instStmt = db.prepare('INSERT OR IGNORE INTO element_instances VALUES (?,?)');
  const geoStmt = db.prepare('INSERT OR IGNORE INTO component_geometries VALUES (?,?,?,?)');
  const seenHashes = new Set();
  for (const g of geometries) {
    instStmt.run(g.guid, g.geomHash);
    if (!seenHashes.has(g.geomHash)) {
      geoStmt.run(g.geomHash, g.vertices, g.indices, buildingName);
      seenHashes.add(g.geomHash);
    }
  }

  // Insert 4D data
  const schedStmt = db.prepare('INSERT OR IGNORE INTO schedules VALUES (?,?,?,?)');
  for (const s of schedules) schedStmt.run(s.id, s.name, s.status, s.created);

  const taskStmt = db.prepare('INSERT OR IGNORE INTO tasks VALUES (?,?,?,?,?,?,?)');
  for (const t of tasks) taskStmt.run(t.id, schedules[0]?.id || null, t.name, t.start, t.finish, t.duration, t.status);

  const seqStmt = db.prepare('INSERT OR IGNORE INTO task_sequences VALUES (?,?,?,?)');
  for (const s of taskSequences) seqStmt.run(s.predId, s.succId, s.type, s.lag);

  const teStmt = db.prepare('INSERT OR IGNORE INTO task_elements VALUES (?,?)');
  for (const te of taskElements) teStmt.run(te.taskId, te.guid);

  const doStmt = db.prepare('INSERT OR IGNORE INTO door_operation VALUES (?,?,?,?,?,?,?,?,?)');
  for (const r of doorOps) doStmt.run(r.guid, r.op, r.source, r.x, r.y, r.z, r.o, r.w, r.h);

  // §L1.6 P0: new tables, written after every pre-existing table so their outputs are unchanged
  db.exec(`CREATE TABLE element_world_bbox (guid TEXT PRIMARY KEY, minX REAL, maxX REAL, minY REAL, maxY REAL, minZ REAL, maxZ REAL)`);
  db.exec(`CREATE TABLE rel_fills_host (opening_guid TEXT PRIMARY KEY, host_guid TEXT, filling_guid TEXT, host_class TEXT, filling_class TEXT, provenance TEXT DEFAULT 'ifc:recovered')`);
  db.exec(`CREATE TABLE storey_elevation (guid TEXT PRIMARY KEY, name TEXT, elevation_attr_m REAL, placement_z_m REAL)`);
  const seStmt = db.prepare('INSERT OR IGNORE INTO storey_elevation VALUES (?,?,?,?)');
  for (const r of storeyElevRows) seStmt.run(r.guid, r.name, r.attr, r.z);
  log(`§STOREY_ELEVATION ` + storeyElevRows.map(r => `${JSON.stringify(r.name)}:attr=${r.attr == null ? null : r.attr.toFixed(4)},z=${r.z == null ? null : r.z.toFixed(4)}`).join(' '));
  db.exec(`CREATE TABLE element_pset_common (guid TEXT, pset TEXT, name TEXT, value TEXT, source TEXT, PRIMARY KEY (guid, pset, name))`);
  const wbStmt = db.prepare('INSERT OR IGNORE INTO element_world_bbox VALUES (?,?,?,?,?,?,?)');
  for (const w of worldBbox) wbStmt.run(w.guid, ...w.b);
  const rfStmt = db.prepare("INSERT OR IGNORE INTO rel_fills_host VALUES (?,?,?,?,?,'ifc:recovered')");
  for (const r of relFills) rfStmt.run(r.opening, r.host, r.filling, r.hostClass, r.fillingClass);
  db.exec(`CREATE TABLE element_type (guid TEXT PRIMARY KEY, type_name TEXT, source TEXT)`);
  const etStmt = db.prepare('INSERT OR IGNORE INTO element_type VALUES (?,?,?)');
  for (const r of typeRows) etStmt.run(r.guid, r.name, r.source);
  const psStmt = db.prepare('INSERT OR IGNORE INTO element_pset_common VALUES (?,?,?,?,?)');
  for (const r of psetRows) psStmt.run(r.guid, r.pset, r.name, r.value, r.source);
  log(`§WORLD_BBOX rows=${worldBbox.length}`);


  log(`§SUMMARY elements=${elements.length} geometries=${geometries.length} uniqueHashes=${seenHashes.size} 4D_tasks=${tasks.length}`);
  log(`§S18_SPATIAL_STRUCTURE buildings=${Object.keys(buildingMap).length} storeys=${Object.keys(storeyMap).length} storeysWithElevation=${Object.values(storeyElevation).filter(v => v != null).length} storeysWithRealParent=${Object.keys(storeyParentBuildingGuid).length} relAggregates=${Object.keys(storeyParentBuildingGuid).length}`);
}

// §L5.8: a second IFC (e.g. the structural model of a federated set) contributes ONLY the listed classes (default IfcColumn) to the main DB: the column axes are
// the building grid evidence the architect model does not state. Rows are copied as stored (same schema, same frame: both extracted with COORDINATE_TO_ORIGIN false),
// guids already in the main DB are never overwritten. q = (sql) -> [row objects] over the extra DB; main = exec/prepare surface. Returns the number of elements merged.
function mergeElements(main, qMain, qExtra, classes, log) {
  log = log || function () {}; classes = classes || ['IfcColumn'];
  const inList = classes.map(c => "'" + c + "'").join(',');
  const have = new Set(qMain('SELECT guid FROM elements_meta').map(r => r.guid));
  const rows = qExtra(`SELECT guid FROM elements_meta WHERE ifc_class IN (${inList}) ORDER BY guid`).map(r => r.guid).filter(g => !have.has(g));
  if (!rows.length) { log('§MERGE classes=' + classes.join(',') + ' merged=0'); return 0; }
  const guidSet = rows.map(g => "'" + g.replace(/'/g, "''") + "'").join(',');
  const copy = (table, sql) => {
    const data = qExtra(sql); if (!data.length) return 0;
    const cols = Object.keys(data[0]), st = main.prepare(`INSERT OR IGNORE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
    data.forEach(r => st.run(...cols.map(c => r[c]))); return data.length;
  };
  const n = {};
  n.meta = copy('elements_meta', `SELECT * FROM elements_meta WHERE guid IN (${guidSet})`);
  n.transforms = copy('element_transforms', `SELECT * FROM element_transforms WHERE guid IN (${guidSet})`);
  n.instances = copy('element_instances', `SELECT * FROM element_instances WHERE guid IN (${guidSet})`);
  n.geometries = copy('component_geometries', `SELECT * FROM component_geometries WHERE geometry_hash IN (SELECT geometry_hash FROM element_instances WHERE guid IN (${guidSet}))`);
  n.bbox = copy('element_world_bbox', `SELECT * FROM element_world_bbox WHERE guid IN (${guidSet})`);
  n.psets = copy('element_pset_common', `SELECT * FROM element_pset_common WHERE guid IN (${guidSet})`);
  log('§MERGE classes=' + classes.join(',') + ' merged=' + rows.length + ' ' + JSON.stringify(n));
  return rows.length;
}

// Browser helpers: Uint8Array stand-in for Node's Buffer (from/concat only), and a sql.js Database wrapped to the exec/prepare().run() surface the core writes through.
const browserBuf = {
  from: ab => new Uint8Array(ab.slice ? ab.slice(0) : ab),
  concat: parts => { const n = parts.reduce((a, p) => a + p.length, 0), o = new Uint8Array(n); let k = 0; parts.forEach(p => { o.set(p, k); k += p.length; }); return o; }
};
function sqljsDb(sqlDb) {
  return { exec: sql => { sqlDb.run(sql); }, prepare: sql => { const st = sqlDb.prepare(sql); return { run: (...a) => { st.run(a); } }; }, close: () => {} };
}
return { extractToDb, mergeElements, classifyDisc, DISC_MAP, browserBuf, sqljsDb };
});
