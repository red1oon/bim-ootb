#!/usr/bin/env node
/**
 * S252: Simulate the import_worker.js colour logic in Node
 * Tests the exact same code path the browser worker uses.
 */
const WebIFC = require('web-ifc');
const fs = require('fs');
const path = require('path');

const IFC_PATH = path.resolve(__dirname, '../../../DAGCompiler/lib/input/IFC/UNMERGED/Ifc4_Revit_ARC.ifc');

async function main() {
  console.log('[S252] §SIM_START file=' + path.basename(IFC_PATH));
  const ifcApi = new WebIFC.IfcAPI();
  await ifcApi.Init();
  const data = fs.readFileSync(IFC_PATH);
  const modelID = ifcApi.OpenModel(new Uint8Array(data), {
    COORDINATE_TO_ORIGIN: false, USE_FAST_BOOLS: true, OPTIMIZE_PROFILES: true,
  });

  // === Exact copy of import_worker.js S252 logic ===
  const _colorMap = {};
  try {
    if (WebIFC.IFCINDEXEDCOLOURMAP) {
      var faceSetColour = {};
      var icmIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCINDEXEDCOLOURMAP);
      for (var i = 0; i < icmIds.size(); i++) {
        try {
          var icm = ifcApi.GetLine(modelID, icmIds.get(i));
          var fsId = icm.MappedTo.value;
          var colId = icm.Colours.value;
          var opacity = 1.0;
          if (icm.Opacity && typeof icm.Opacity === 'object' && icm.Opacity.value !== undefined)
            opacity = icm.Opacity.value;
          else if (typeof icm.Opacity === 'number') opacity = icm.Opacity;
          var crl = ifcApi.GetLine(modelID, colId);
          if (crl && crl.ColourList && crl.ColourList.length > 0) {
            var rgb = crl.ColourList[0];
            var r = typeof rgb[0] === 'object' ? rgb[0]._representationValue : rgb[0];
            var g = typeof rgb[1] === 'object' ? rgb[1]._representationValue : rgb[1];
            var b = typeof rgb[2] === 'object' ? rgb[2]._representationValue : rgb[2];
            faceSetColour[fsId] = { x: r, y: g, z: b, w: opacity };
          }
        } catch(e) { console.log('  ICM err: ' + e.message); }
      }
      console.log('[S252] §ICM faceSet_colours=' + Object.keys(faceSetColour).length);

      if (Object.keys(faceSetColour).length > 0) {
        var shapeRepColour = {};
        var srIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCSHAPEREPRESENTATION);
        for (var si = 0; si < srIds.size(); si++) {
          try {
            var sr = ifcApi.GetLine(modelID, srIds.get(si));
            if (!sr.Items) continue;
            for (var ji = 0; ji < sr.Items.length; ji++) {
              var itemId = sr.Items[ji].value;
              if (faceSetColour[itemId]) {
                shapeRepColour[sr.expressID] = faceSetColour[itemId];
                break;
              }
            }
          } catch(e) {}
        }

        var prodDefColour = {};
        var pdsIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCPRODUCTDEFINITIONSHAPE);
        for (var pi = 0; pi < pdsIds.size(); pi++) {
          try {
            var pds = ifcApi.GetLine(modelID, pdsIds.get(pi));
            if (!pds.Representations) continue;
            for (var ri = 0; ri < pds.Representations.length; ri++) {
              var repId = pds.Representations[ri].value;
              if (shapeRepColour[repId]) {
                prodDefColour[pds.expressID] = shapeRepColour[repId];
                break;
              }
            }
          } catch(e) {}
        }

        console.log('[S252] §CHAIN shapeReps=' + Object.keys(shapeRepColour).length +
          ' prodDefs=' + Object.keys(prodDefColour).length);
      }
    }
  } catch(colErr) {
    console.log('[S252] §ICM_ERR ' + (colErr.message || colErr));
  }
  var _prodDefColour = (typeof prodDefColour !== 'undefined') ? prodDefColour : {};

  // === Simulate element loop ===
  const PRODUCT_TYPES = [
    WebIFC.IFCWALL, WebIFC.IFCWALLSTANDARDCASE, WebIFC.IFCSLAB, WebIFC.IFCDOOR,
    WebIFC.IFCWINDOW, WebIFC.IFCROOF, WebIFC.IFCSTAIR, WebIFC.IFCSTAIRFLIGHT,
    WebIFC.IFCRAILING, WebIFC.IFCCOVERING, WebIFC.IFCCURTAINWALL, WebIFC.IFCPLATE,
    WebIFC.IFCFURNISHINGELEMENT, WebIFC.IFCBUILDINGELEMENTPROXY,
    WebIFC.IFCBEAM, WebIFC.IFCCOLUMN, WebIFC.IFCFOOTING, WebIFC.IFCMEMBER,
  ].filter(t => t !== undefined);

  let elemCount = 0, icmMapped = 0;
  for (const typeId of PRODUCT_TYPES) {
    const ids = ifcApi.GetLineIDsWithType(modelID, typeId);
    for (let i = 0; i < ids.size(); i++) {
      const id = ids.get(i);
      try {
        const el = ifcApi.GetLine(modelID, id);
        var _repId = el.Representation ? (el.Representation.value || el.Representation) : null;
        var _icmCol = _repId && _prodDefColour[_repId] ? _prodDefColour[_repId] : null;
        if (_icmCol) {
          _colorMap[id] = _icmCol;
          icmMapped++;
        }
        elemCount++;
      } catch(e) {}
    }
  }
  console.log('[S252] §ELEM_COLORS icm_mapped=' + icmMapped + '/' + elemCount);

  // === Simulate tessellation with colour fallback ===
  let whiteFromGeo = 0, fixedByIcm = 0, alreadyColoured = 0;
  const wallIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCWALL);
  for (let wi = 0; wi < wallIds.size(); wi++) {
    const wid = wallIds.get(wi);
    try {
      const fm = ifcApi.GetFlatMesh(modelID, wid);
      var bestColor = null;
      for (let gi = 0; gi < fm.geometries.size(); gi++) {
        var geo = fm.geometries.get(gi);
        if (!bestColor && geo.color && geo.color.x !== undefined) bestColor = geo.color;
      }
      // S252 fallback
      if ((!bestColor || (bestColor.x > 0.95 && bestColor.y > 0.95 && bestColor.z > 0.95)) && _colorMap[wid]) {
        bestColor = _colorMap[wid];
        fixedByIcm++;
      } else if (bestColor && !(bestColor.x > 0.95 && bestColor.y > 0.95 && bestColor.z > 0.95)) {
        alreadyColoured++;
      } else {
        whiteFromGeo++;
      }
      if (bestColor) {
        var matStr = bestColor.x.toFixed(3) + ',' + bestColor.y.toFixed(3) + ',' + bestColor.z.toFixed(3) + ',' + bestColor.w.toFixed(3);
        if (wi < 5) console.log('  wall ' + wid + ' colour=' + matStr + (fixedByIcm === wi + 1 - alreadyColoured - whiteFromGeo ? ' (ICM)' : ''));
      }
    } catch(e) {}
  }
  console.log('[S252] §WALL_VERDICT walls=' + wallIds.size() +
    ' already_coloured=' + alreadyColoured +
    ' fixed_by_icm=' + fixedByIcm +
    ' still_white=' + whiteFromGeo);

  const total = Object.keys(_colorMap).length;
  console.log(total > 0 ? '[S252] §PASS ' + total + ' elements with colour' : '[S252] §FAIL');

  ifcApi.CloseModel(modelID);
}

main().catch(err => { console.error('[S252] §FATAL ' + err.message); process.exit(1); });
