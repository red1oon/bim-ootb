#!/usr/bin/env node
/**
 * S252 test: IFCINDEXEDCOLOURMAP → element colour extraction
 * Proves the working chain for Revit IFC4 files.
 */
const WebIFC = require('web-ifc');
const fs = require('fs');
const path = require('path');

const IFC_PATH = path.resolve(__dirname, '../../../DAGCompiler/lib/input/IFC/UNMERGED/Ifc4_Revit_ARC.ifc');

async function main() {
  console.log('[S252] §TEST file=' + path.basename(IFC_PATH));
  const api = new WebIFC.IfcAPI();
  await api.Init();
  const data = fs.readFileSync(IFC_PATH);
  const mid = api.OpenModel(new Uint8Array(data), {
    COORDINATE_TO_ORIGIN: false, USE_FAST_BOOLS: true, OPTIMIZE_PROFILES: true,
  });

  // Step 1: IFCINDEXEDCOLOURMAP → faceSetId → colour
  const faceSetColour = {}; // faceSetExpressID → {x,y,z,w}
  const icmIds = api.GetLineIDsWithType(mid, WebIFC.IFCINDEXEDCOLOURMAP);
  for (let i = 0; i < icmIds.size(); i++) {
    try {
      const icm = api.GetLine(mid, icmIds.get(i));
      const fsId = icm.MappedTo.value;
      const colId = icm.Colours.value;
      var opacity = 1.0;
      if (icm.Opacity && typeof icm.Opacity === 'object' && icm.Opacity.value !== undefined)
        opacity = icm.Opacity.value;
      else if (typeof icm.Opacity === 'number') opacity = icm.Opacity;

      const crl = api.GetLine(mid, colId);
      if (crl && crl.ColourList && crl.ColourList.length > 0) {
        const rgb = crl.ColourList[0]; // first colour tuple
        var r = typeof rgb[0] === 'object' ? rgb[0]._representationValue : rgb[0];
        var g = typeof rgb[1] === 'object' ? rgb[1]._representationValue : rgb[1];
        var b = typeof rgb[2] === 'object' ? rgb[2]._representationValue : rgb[2];
        faceSetColour[fsId] = { x: r, y: g, z: b, w: opacity };
      }
    } catch(e) {}
  }
  console.log('[S252] §STEP1 faceSet→colour: ' + Object.keys(faceSetColour).length);

  // Step 2: IFCSHAPEREPRESENTATION → find items that match coloured face sets
  const shapeRepColour = {}; // shapeRepExpressID → colour
  const srIds = api.GetLineIDsWithType(mid, WebIFC.IFCSHAPEREPRESENTATION);
  for (let i = 0; i < srIds.size(); i++) {
    try {
      const sr = api.GetLine(mid, srIds.get(i));
      if (!sr.Items) continue;
      for (let j = 0; j < sr.Items.length; j++) {
        const itemId = sr.Items[j].value;
        if (faceSetColour[itemId]) {
          shapeRepColour[sr.expressID] = faceSetColour[itemId];
          break;
        }
      }
    } catch(e) {}
  }
  console.log('[S252] §STEP2 shapeRep→colour: ' + Object.keys(shapeRepColour).length);

  // Step 3: IFCPRODUCTDEFINITIONSHAPE → find representations that have colour
  const prodDefColour = {}; // prodDefExpressID → colour
  const pdsIds = api.GetLineIDsWithType(mid, WebIFC.IFCPRODUCTDEFINITIONSHAPE);
  for (let i = 0; i < pdsIds.size(); i++) {
    try {
      const pds = api.GetLine(mid, pdsIds.get(i));
      if (!pds.Representations) continue;
      for (let j = 0; j < pds.Representations.length; j++) {
        const repId = pds.Representations[j].value;
        if (shapeRepColour[repId]) {
          prodDefColour[pds.expressID] = shapeRepColour[repId];
          break;
        }
      }
    } catch(e) {}
  }
  console.log('[S252] §STEP3 prodDef→colour: ' + Object.keys(prodDefColour).length);

  // Step 4: Elements → Representation → prodDefShape → colour
  const elemColour = {};
  // Check walls
  for (const typeConst of [WebIFC.IFCWALL, WebIFC.IFCWALLSTANDARDCASE, WebIFC.IFCSLAB,
    WebIFC.IFCCOLUMN, WebIFC.IFCBEAM, WebIFC.IFCROOF, WebIFC.IFCDOOR, WebIFC.IFCWINDOW,
    WebIFC.IFCSTAIR, WebIFC.IFCRAILING, WebIFC.IFCPLATE, WebIFC.IFCCOVERING,
    WebIFC.IFCFURNISHINGELEMENT, WebIFC.IFCBUILDINGELEMENTPROXY,
    WebIFC.IFCFOOTING, WebIFC.IFCMEMBER, WebIFC.IFCPIPESEGMENT, WebIFC.IFCDUCTSEGMENT,
    WebIFC.IFCFLOWSEGMENT, WebIFC.IFCFLOWTERMINAL]) {
    if (!typeConst) continue;
    const ids = api.GetLineIDsWithType(mid, typeConst);
    for (let i = 0; i < ids.size(); i++) {
      try {
        const el = api.GetLine(mid, ids.get(i));
        if (!el.Representation) continue;
        const repId = el.Representation.value;
        if (prodDefColour[repId]) {
          elemColour[el.expressID] = prodDefColour[repId];
        }
      } catch(e) {}
    }
  }
  console.log('[S252] §STEP4 elements→colour: ' + Object.keys(elemColour).length);

  // Show colour distribution
  const colourDist = {};
  for (const c of Object.values(elemColour)) {
    const key = c.x.toFixed(2) + ',' + c.y.toFixed(2) + ',' + c.z.toFixed(2);
    colourDist[key] = (colourDist[key] || 0) + 1;
  }
  console.log('[S252] §COLOURS:');
  for (const [k, v] of Object.entries(colourDist).sort((a,b) => b[1]-a[1])) {
    console.log('  ' + k + ' × ' + v);
  }

  // Compare: how many walls are white from geo.color?
  const wallIds = api.GetLineIDsWithType(mid, WebIFC.IFCWALL);
  let whiteGeo = 0, fixed = 0;
  for (let i = 0; i < wallIds.size(); i++) {
    const wid = wallIds.get(i);
    try {
      const fm = api.GetFlatMesh(mid, wid);
      let gc = null;
      for (let gi = 0; gi < fm.geometries.size(); gi++) {
        gc = fm.geometries.get(gi).color; break;
      }
      const isWhite = gc && gc.x > 0.95 && gc.y > 0.95 && gc.z > 0.95;
      if (isWhite) whiteGeo++;
      if (isWhite && elemColour[wid]) fixed++;
    } catch(e) {}
  }
  console.log('[S252] §VERDICT walls=' + wallIds.size() + ' white=' + whiteGeo + ' fixed=' + fixed);
  console.log(Object.keys(elemColour).length > 0 ? '[S252] §PASS' : '[S252] §FAIL');

  api.CloseModel(mid);
}

main().catch(err => { console.error('[S252] §FATAL ' + err.message); process.exit(1); });
