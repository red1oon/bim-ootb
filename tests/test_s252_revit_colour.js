#!/usr/bin/env node
/**
 * S252 test: Verify colour extraction from Revit IFC4 files
 * Issue: web-ifc 0.0.77 returns white for IFC4 IFCINDEXEDCOLOURMAP elements
 * This test validates the fix extracts real colours.
 */
const WebIFC = require('web-ifc');
const fs = require('fs');
const path = require('path');

const IFC_PATH = path.resolve(__dirname, '../../../DAGCompiler/lib/input/IFC/UNMERGED/Ifc4_Revit_ARC.ifc');

async function testIndexedColourMap() {
  console.log('\n=== Test 2: IFCINDEXEDCOLOURMAP path ===');
  const ifcApi = new WebIFC.IfcAPI();
  await ifcApi.Init();
  const data = fs.readFileSync(IFC_PATH);
  const modelID = ifcApi.OpenModel(new Uint8Array(data), {
    COORDINATE_TO_ORIGIN: false, USE_FAST_BOOLS: true, OPTIMIZE_PROFILES: true,
  });

  // Check type constant
  console.log('[S252] IFCINDEXEDCOLOURMAP=' + WebIFC.IFCINDEXEDCOLOURMAP);
  console.log('[S252] IFCCOLOURRGBLIST=' + WebIFC.IFCCOLOURRGBLIST);
  console.log('[S252] IFCPOLYGONALFACESET=' + WebIFC.IFCPOLYGONALFACESET);
  console.log('[S252] IFCTRIANGULATEDFACESET=' + WebIFC.IFCTRIANGULATEDFACESET);
  console.log('[S252] IFCSHAPEREPRESENTATION=' + WebIFC.IFCSHAPEREPRESENTATION);
  console.log('[S252] IFCPRODUCTDEFINITIONSHAPE=' + WebIFC.IFCPRODUCTDEFINITIONSHAPE);

  // Try GetLineIDsWithType for IFCINDEXEDCOLOURMAP
  if (WebIFC.IFCINDEXEDCOLOURMAP) {
    const icmIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCINDEXEDCOLOURMAP);
    console.log('[S252] §ICM_COUNT ' + icmIds.size());
    // Dump first 3
    for (let i = 0; i < Math.min(3, icmIds.size()); i++) {
      const id = icmIds.get(i);
      try {
        const line = ifcApi.GetLine(modelID, id, true);
        console.log('[S252] §ICM id=' + id + ' keys=' + Object.keys(line).join(','));
        console.log('[S252] §ICM dump=' + JSON.stringify(line, null, 2).substring(0, 500));
      } catch(e) {
        console.log('[S252] §ICM_ERR id=' + id + ' ' + e.message);
        // Try without flat
        try {
          const line2 = ifcApi.GetLine(modelID, id);
          console.log('[S252] §ICM_NOFLAT id=' + id + ' keys=' + Object.keys(line2).join(','));
          console.log('[S252] §ICM_NOFLAT dump=' + JSON.stringify(line2, null, 2).substring(0, 500));
        } catch(e2) {
          console.log('[S252] §ICM_NOFLAT_ERR ' + e2.message);
        }
      }
    }
  }

  // Try IFCCOLOURRGBLIST
  if (WebIFC.IFCCOLOURRGBLIST) {
    const crlIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCCOLOURRGBLIST);
    console.log('[S252] §CRL_COUNT ' + crlIds.size());
    for (let i = 0; i < Math.min(3, crlIds.size()); i++) {
      const id = crlIds.get(i);
      try {
        const line = ifcApi.GetLine(modelID, id);
        console.log('[S252] §CRL id=' + id + ' keys=' + Object.keys(line).join(','));
        console.log('[S252] §CRL dump=' + JSON.stringify(line).substring(0, 300));
      } catch(e) {
        console.log('[S252] §CRL_ERR id=' + id + ' ' + e.message);
      }
    }
  }

  // Try IFCSHAPEREPRESENTATION to trace from face set to element
  if (WebIFC.IFCSHAPEREPRESENTATION) {
    const srIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCSHAPEREPRESENTATION);
    console.log('[S252] §SR_COUNT ' + srIds.size());
  }

  if (WebIFC.IFCPRODUCTDEFINITIONSHAPE) {
    const pdsIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCPRODUCTDEFINITIONSHAPE);
    console.log('[S252] §PDS_COUNT ' + pdsIds.size());
  }

  ifcApi.CloseModel(modelID);
}

async function main() {
  console.log('[S252] §TEST_START file=' + IFC_PATH);
  const ifcApi = new WebIFC.IfcAPI();
  await ifcApi.Init();

  const data = fs.readFileSync(IFC_PATH);
  const modelID = ifcApi.OpenModel(new Uint8Array(data), {
    COORDINATE_TO_ORIGIN: false,
    USE_FAST_BOOLS: true,
    OPTIMIZE_PROFILES: true,
  });
  console.log('[S252] §PARSE_OK modelID=' + modelID);

  // Step 1: Build matId → colour via IFCMATERIALDEFINITIONREPRESENTATION (forward lookup)
  const matIdToColour = {}; // material expressID → {r,g,b,a}
  const IFCMATERIALDEFINITIONREPRESENTATION = WebIFC.IFCMATERIALDEFINITIONREPRESENTATION;
  console.log('[S252] §TYPE_CHECK IFCMATERIALDEFINITIONREPRESENTATION=' + IFCMATERIALDEFINITIONREPRESENTATION);

  if (IFCMATERIALDEFINITIONREPRESENTATION) {
    const mdrIds = ifcApi.GetLineIDsWithType(modelID, IFCMATERIALDEFINITIONREPRESENTATION);
    console.log('[S252] §MDR_COUNT ' + mdrIds.size());
    for (let i = 0; i < mdrIds.size(); i++) {
      try {
        const mdr = ifcApi.GetLine(modelID, mdrIds.get(i), true);
        if (!mdr) continue;
        // RepresentedMaterial → the IfcMaterial this represents
        const matRef = mdr.RepresentedMaterial;
        if (!matRef) continue;
        const matId = matRef.value || matRef;
        // Representations[] → IfcStyledRepresentation
        const reps = mdr.Representations || [];
        for (let ri = 0; ri < reps.length; ri++) {
          const srId = reps[ri].value || reps[ri];
          const col = walkStyledRep(ifcApi, modelID, srId);
          if (col) {
            matIdToColour[matId] = col;
            break;
          }
        }
      } catch(e) { console.log('  MDR err: ' + e.message); }
    }
    console.log('[S252] §MAT_COLOURS found=' + Object.keys(matIdToColour).length);
    for (const [mid, c] of Object.entries(matIdToColour)) {
      console.log('  matId=' + mid + ' r=' + c.x.toFixed(3) + ' g=' + c.y.toFixed(3) + ' b=' + c.z.toFixed(3));
    }
  } else {
    console.log('[S252] §NO_MDR_TYPE — trying raw line scan');
  }

  // Step 2: Build element → colour via IFCRELASSOCIATESMATERIAL
  const elemToColour = {};
  const relIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELASSOCIATESMATERIAL);
  console.log('[S252] §MAT_REL_COUNT ' + relIds.size());
  for (let i = 0; i < relIds.size(); i++) {
    try {
      const rel = ifcApi.GetLine(modelID, relIds.get(i));
      if (!rel || !rel.RelatingMaterial || !rel.RelatedObjects) continue;
      const matId = rel.RelatingMaterial.value || rel.RelatingMaterial;
      // Walk material hierarchy to find a coloured material
      const col = resolveMatColour(ifcApi, modelID, matId, matIdToColour, 0);
      if (col) {
        for (let j = 0; j < rel.RelatedObjects.length; j++) {
          const eid = rel.RelatedObjects[j].value || rel.RelatedObjects[j];
          elemToColour[eid] = col;
        }
      }
    } catch(e) {}
  }
  console.log('[S252] §ELEM_COLOURS mapped=' + Object.keys(elemToColour).length);

  // Step 3: Check how many elements get non-white colour vs geo.color
  const IFCWALL = WebIFC.IFCWALL;
  const wallIds = ifcApi.GetLineIDsWithType(modelID, IFCWALL);
  let whiteGeo = 0, colGeo = 0, fixedByMap = 0;
  for (let i = 0; i < wallIds.size(); i++) {
    const wid = wallIds.get(i);
    try {
      const fm = ifcApi.GetFlatMesh(modelID, wid);
      let geoCol = null;
      for (let gi = 0; gi < fm.geometries.size(); gi++) {
        const g = fm.geometries.get(gi);
        if (g.color && g.color.x !== undefined) { geoCol = g.color; break; }
      }
      const isWhite = geoCol && geoCol.x > 0.95 && geoCol.y > 0.95 && geoCol.z > 0.95;
      if (!geoCol || isWhite) whiteGeo++;
      else colGeo++;
      if (isWhite && elemToColour[wid]) fixedByMap++;
    } catch(e) {}
  }
  console.log('[S252] §WALL_TEST walls=' + wallIds.size() + ' white_geo=' + whiteGeo + ' coloured_geo=' + colGeo + ' fixed_by_map=' + fixedByMap);

  // Verdict
  const totalMapped = Object.keys(elemToColour).length;
  if (totalMapped > 0) {
    console.log('[S252] §PASS colour map works — ' + totalMapped + ' elements mapped');
  } else {
    console.log('[S252] §FAIL no elements mapped — fix needed');
  }

  ifcApi.CloseModel(modelID);
}

function walkStyledRep(api, mid, srId) {
  try {
    const sr = api.GetLine(mid, srId, true);
    if (!sr || !sr.Items) return null;
    for (let j = 0; j < sr.Items.length; j++) {
      const itemId = sr.Items[j].value || sr.Items[j];
      const col = walkStyledItem(api, mid, itemId);
      if (col) return col;
    }
  } catch(e) {}
  return null;
}

function walkStyledItem(api, mid, itemId) {
  try {
    const si = api.GetLine(mid, itemId, true);
    if (!si) return null;
    const styles = si.Styles || [];
    for (let s = 0; s < styles.length; s++) {
      const ssId = styles[s].value || styles[s];
      const col = walkSurfaceStyle(api, mid, ssId);
      if (col) return col;
    }
  } catch(e) {}
  return null;
}

function walkSurfaceStyle(api, mid, ssId) {
  try {
    const ss = api.GetLine(mid, ssId, true);
    if (!ss || !ss.Styles) return null;
    for (let k = 0; k < ss.Styles.length; k++) {
      const rId = ss.Styles[k].value || ss.Styles[k];
      try {
        const ssr = api.GetLine(mid, rId, true);
        if (!ssr || !ssr.SurfaceColour) continue;
        const scId = ssr.SurfaceColour.value || ssr.SurfaceColour;
        const rgb = api.GetLine(mid, scId);
        if (rgb && rgb.Red !== undefined) {
          var r = rgb.Red.value !== undefined ? rgb.Red.value : rgb.Red;
          var g = rgb.Green.value !== undefined ? rgb.Green.value : rgb.Green;
          var b = rgb.Blue.value !== undefined ? rgb.Blue.value : rgb.Blue;
          var tr = ssr.Transparency;
          var a = 1.0;
          if (tr !== null && tr !== undefined) {
            var tv = tr.value !== undefined ? tr.value : tr;
            if (typeof tv === 'number') a = 1.0 - tv;
          }
          return {x:r, y:g, z:b, w:a};
        }
      } catch(e) {}
    }
  } catch(e) {}
  return null;
}

// Walk material hierarchy to resolve to a leaf IfcMaterial with colour
function resolveMatColour(api, mid, matId, matColourMap, depth) {
  if (depth > 8) return null;
  // Direct hit?
  if (matColourMap[matId]) return matColourMap[matId];
  try {
    var m = api.GetLine(mid, matId, true);
    if (!m) return null;
    // IfcMaterialLayerSetUsage → ForLayerSet
    if (m.ForLayerSet) return resolveMatColour(api, mid, m.ForLayerSet.value || m.ForLayerSet, matColourMap, depth+1);
    // IfcMaterialLayerSet → MaterialLayers[0]
    if (m.MaterialLayers && m.MaterialLayers.length) {
      var lid = m.MaterialLayers[0].value || m.MaterialLayers[0];
      return resolveMatColour(api, mid, lid, matColourMap, depth+1);
    }
    // IfcMaterialLayer → Material
    if (m.Material) return resolveMatColour(api, mid, m.Material.value || m.Material, matColourMap, depth+1);
    // IfcMaterialConstituentSet → MaterialConstituents[0]
    if (m.MaterialConstituents && m.MaterialConstituents.length) {
      return resolveMatColour(api, mid, m.MaterialConstituents[0].value || m.MaterialConstituents[0], matColourMap, depth+1);
    }
    // IfcMaterialProfileSetUsage → ForProfileSet
    if (m.ForProfileSet) return resolveMatColour(api, mid, m.ForProfileSet.value || m.ForProfileSet, matColourMap, depth+1);
    // IfcMaterialProfileSet → MaterialProfiles[0]
    if (m.MaterialProfiles && m.MaterialProfiles.length) {
      return resolveMatColour(api, mid, m.MaterialProfiles[0].value || m.MaterialProfiles[0], matColourMap, depth+1);
    }
    // IfcMaterialList → Materials[0]
    if (m.Materials && m.Materials.length) return resolveMatColour(api, mid, m.Materials[0].value || m.Materials[0], matColourMap, depth+1);
  } catch(e) {}
  return null;
}

main().then(() => testIndexedColourMap()).catch(err => {
  console.error('[S252] §FATAL ' + err.message);
  process.exit(1);
});
