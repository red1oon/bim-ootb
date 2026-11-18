// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — lod_ifc.js: the "Add-on IFC" writer of the LOD Upgrade pill (P7). Read the §LODUP_IFC_* log after every export; the exit code is not evidence.
// Implementing prompts/MODELLER_LOD_UPGRADE_PILL.md §4 P7 ("P7 SPEC") — Witness: W-LODUP-IFC (modeller/tests/witness_lodup_ifc.js + witness_lodup_ifc_check.py).
// Issue proved/disproved: "the browser add-on IFC differs from the proven Python add-on IFC" (BIMCompiler scripts/lod/export_parts_ifc.py, spec prompts/LOD400_DEFAULT_RULES_SCOPE.md section 9 + its RESULT).
// A port of the Python oracle's frame rules: same GlobalIds (UUID5 of OUR element id in the oracle's fixed namespace, compressed to the 22-character IFC form), fixed timestamp, no clock, no random, every loop over
// sorted keys; only the generated parts are written (an add-on file, never the host model). Pure STEP text writer: no DOM, no DB, no web-ifc. Node + browser (window.LodIfc). Written as a generator (yield kit of
// lod_registry.js) so the browser never freezes on a 46 MB file; build() drains it with the same code and the same order.
// INPUT  elements [{guid, cls, name, storey, host, rule, detail, tris: Float64Array world xyz soup (9 per triangle)}]   opts {schema 'IFC2X3'|'IFC4', frame (the frame JSON or null), elev {storey name: metres} (the DB's own table,
//        used when the frame names none), gradeOf(hostGuid) -> {fy, src}|null, fileName, breakGuid (the red control: random GlobalIds)}
// FRAME JSON (all keys optional; without one the DB frame is written as is and the file description says so): {frame_name, project_name, shift_m:[dx,dy,dz] (added to the DB coordinates to give the frame coordinates),
//        site:{location_m:[x,y,z], ref_direction:[c,s], latitude:[d,m,s,ms], longitude:[d,m,s,ms], elevation_m}, storey_elevations_m:{"STOREY NAME": z}}. A storey with no elevation is refused: no invented elevation.
// CLASS MAP  IfcReinforcingBar (NominalDiameter, CrossSectionArea, BarLength, BarRole; a set of mixed diameters is split by diameter, as the oracle does) | IfcPlate, IfcMechanicalFastener, IfcFastener (grouped per joint in an
//        IfcElementAssembly when the id ends -PL / -BT / -WD) | IfcBuildingElementPart (the layer parts, material = the layer's) ; Pset BIMC_Upgrade {HostGlobalId, Rule, Detail, Status, GeneratedElementId, ...}.
// ANY ELEMENT (opts.anyElement, the Viewer's whole-building export; prompts/VIEWER_IFC_EXPORT_BY_DISCIPLINE.md "(b) SPEC"): an element NOT flagged part:true is written as a generic product through GENMAP (the full attribute list of the schema;
//        a class the schema lacks is GENERALISED to its nearest ancestor, source class kept in ObjectType; a class with no mapping is an IfcBuildingElementProxy, ObjectType = the source class; both COUNTED per source class, never dropped).
//        Extra element fields: {rgba 'r,g,b,a'}. A storey with no stated elevation is written with Elevation $ (no z invented); an element with no storey is contained in the IfcBuilding. Without anyElement nothing above changes.
// ANY ELEMENT, step (d) (prompts/VIEWER_IFC_EXPORT_BY_DISCIPLINE.md "(d) SPEC"): with anyElement an element flagged part:true still goes through the PARTS path below, exactly as the Modeller writes it (a rebar set with no stated diameter is written as a generic product and counted, not refused);
//        generic elements may carry {mat (IfcMaterial name), psets {pset: {name: string|number|boolean}}, keepGid (the DB guid is a valid unique GlobalId: written as is), parent {guid, gid, elementId} (an element_parts row)}. Written parent + child -> one IfcRelAggregates per parent
//        (the child is then not contained in a storey); a child without its parent carries Pset BIMC_Part. The Modeller never sets anyElement: its bytes do not move.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LodIfc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // The time slice comes from the caller (opts.kit = LodRegistry.kit, the yield kit of lod_registry.js): this file has no load-time dependency. Without a kit nothing ever yields.
  var NOKIT = { due: function () { return false; }, state: { prog: null } };
  function drain(gen) { var r = gen.next(); while (!r.done) r = gen.next(); return r.value; }
  var IFC64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
  var TSTAMP = '2026-11-18T00:00:00', TS = 1795046400, APP_VERSION = '2026-11-18';   // fixed (the oracle's), so two exports are byte-identical
  var NS_HEX = '6f6b7a10-2b4e-4b4e-9b1e-1c0de0bb1d17'.replace(/-/g, '');             // the oracle's (and the delta IFC's) fixed namespace: the same element id gives the same GlobalId in every add-on file
  var JOINT_CLS = { IfcPlate: 1, IfcMechanicalFastener: 1, IfcFastener: 1 }, SUFFIXES = ['-PL', '-BT', '-WD'], LIGATURE_WORDS = ['stirrup', 'tie', 'ligature'], SECTION_SIDES = 8;
  var GENMAP = {   // source class -> [IFC2X3, IFC4] -> [written class, the attributes after Tag]; built from the IFC schemas (ifcopenshell), see prompts/VIEWER_IFC_EXPORT_BY_DISCIPLINE.md (b) SPEC
    'IfcActuator': [['IfcDistributionControlElement',['$']], ['IfcActuator',['.NOTDEFINED.']]],
    'IfcAirTerminal': [['IfcFlowTerminal',[]], ['IfcAirTerminal',['.NOTDEFINED.']]],
    'IfcAlarm': [['IfcDistributionControlElement',['$']], ['IfcAlarm',['.NOTDEFINED.']]],
    'IfcAudioVisualAppliance': [['IfcFlowTerminal',[]], ['IfcAudioVisualAppliance',['.NOTDEFINED.']]],
    'IfcBeam': [['IfcBeam',[]], ['IfcBeam',['.NOTDEFINED.']]],
    'IfcBeamStandardCase': [['IfcBeam',[]], ['IfcBeam',['.NOTDEFINED.']]],
    'IfcBoiler': [['IfcEnergyConversionDevice',[]], ['IfcBoiler',['.NOTDEFINED.']]],
    'IfcBuildingElementPart': [['IfcBuildingElementPart',[]], ['IfcBuildingElementPart',['.NOTDEFINED.']]],
    'IfcBuildingElementProxy': [['IfcBuildingElementProxy',['$']], ['IfcBuildingElementProxy',['.NOTDEFINED.']]],
    'IfcCableCarrierFitting': [['IfcFlowFitting',[]], ['IfcCableCarrierFitting',['.NOTDEFINED.']]],
    'IfcCableCarrierSegment': [['IfcFlowSegment',[]], ['IfcCableCarrierSegment',['.NOTDEFINED.']]],
    'IfcCableSegment': [['IfcFlowSegment',[]], ['IfcCableSegment',['.NOTDEFINED.']]],
    'IfcChiller': [['IfcEnergyConversionDevice',[]], ['IfcChiller',['.NOTDEFINED.']]],
    'IfcCoil': [['IfcEnergyConversionDevice',[]], ['IfcCoil',['.NOTDEFINED.']]],
    'IfcColumn': [['IfcColumn',[]], ['IfcColumn',['.NOTDEFINED.']]],
    'IfcColumnStandardCase': [['IfcColumn',[]], ['IfcColumn',['.NOTDEFINED.']]],
    'IfcCommunicationsAppliance': [['IfcFlowTerminal',[]], ['IfcCommunicationsAppliance',['.NOTDEFINED.']]],
    'IfcCompressor': [['IfcFlowMovingDevice',[]], ['IfcCompressor',['.NOTDEFINED.']]],
    'IfcController': [['IfcDistributionControlElement',['$']], ['IfcController',['.NOTDEFINED.']]],
    'IfcCovering': [['IfcCovering',['$']], ['IfcCovering',['.NOTDEFINED.']]],
    'IfcCurtainWall': [['IfcCurtainWall',[]], ['IfcCurtainWall',['.NOTDEFINED.']]],
    'IfcDiscreteAccessory': [['IfcDiscreteAccessory',[]], ['IfcDiscreteAccessory',['.NOTDEFINED.']]],
    'IfcDistributionControlElement': [['IfcDistributionControlElement',['$']], ['IfcDistributionControlElement',[]]],
    'IfcDistributionElement': [['IfcDistributionElement',[]], ['IfcDistributionElement',[]]],
    'IfcDoor': [['IfcDoor',['$','$']], ['IfcDoor',['$','$','.NOTDEFINED.','$','$']]],
    'IfcDuctFitting': [['IfcFlowFitting',[]], ['IfcDuctFitting',['.NOTDEFINED.']]],
    'IfcDuctSegment': [['IfcFlowSegment',[]], ['IfcDuctSegment',['.NOTDEFINED.']]],
    'IfcElectricAppliance': [['IfcFlowTerminal',[]], ['IfcElectricAppliance',['.NOTDEFINED.']]],
    'IfcElectricDistributionBoard': [['IfcFlowController',[]], ['IfcElectricDistributionBoard',['.NOTDEFINED.']]],
    'IfcElementAssembly': [['IfcElementAssembly',['$','.NOTDEFINED.']], ['IfcElementAssembly',['$','.NOTDEFINED.']]],
    'IfcEnergyConversionDevice': [['IfcEnergyConversionDevice',[]], ['IfcEnergyConversionDevice',[]]],
    'IfcFan': [['IfcFlowMovingDevice',[]], ['IfcFan',['.NOTDEFINED.']]],
    'IfcFastener': [['IfcFastener',[]], ['IfcFastener',['.NOTDEFINED.']]],
    'IfcFilter': [['IfcFlowTreatmentDevice',[]], ['IfcFilter',['.NOTDEFINED.']]],
    'IfcFireSuppressionTerminal': [['IfcFlowTerminal',[]], ['IfcFireSuppressionTerminal',['.NOTDEFINED.']]],
    'IfcFlowController': [['IfcFlowController',[]], ['IfcFlowController',[]]],
    'IfcFlowFitting': [['IfcFlowFitting',[]], ['IfcFlowFitting',[]]],
    'IfcFlowMovingDevice': [['IfcFlowMovingDevice',[]], ['IfcFlowMovingDevice',[]]],
    'IfcFlowSegment': [['IfcFlowSegment',[]], ['IfcFlowSegment',[]]],
    'IfcFlowStorageDevice': [['IfcFlowStorageDevice',[]], ['IfcFlowStorageDevice',[]]],
    'IfcFlowTerminal': [['IfcFlowTerminal',[]], ['IfcFlowTerminal',[]]],
    'IfcFlowTreatmentDevice': [['IfcFlowTreatmentDevice',[]], ['IfcFlowTreatmentDevice',[]]],
    'IfcFooting': [['IfcFooting',['.NOTDEFINED.']], ['IfcFooting',['.NOTDEFINED.']]],
    'IfcFurnishingElement': [['IfcFurnishingElement',[]], ['IfcFurnishingElement',[]]],
    'IfcFurniture': [['IfcFurnishingElement',[]], ['IfcFurniture',['.NOTDEFINED.']]],
    'IfcJunctionBox': [['IfcFlowFitting',[]], ['IfcJunctionBox',['.NOTDEFINED.']]],
    'IfcLightFixture': [['IfcFlowTerminal',[]], ['IfcLightFixture',['.NOTDEFINED.']]],
    'IfcMechanicalFastener': [['IfcMechanicalFastener',['$','$']], ['IfcMechanicalFastener',['$','$','.NOTDEFINED.']]],
    'IfcMember': [['IfcMember',[]], ['IfcMember',['.NOTDEFINED.']]],
    'IfcMemberStandardCase': [['IfcMember',[]], ['IfcMember',['.NOTDEFINED.']]],
    'IfcOpeningElement': [['IfcOpeningElement',[]], ['IfcOpeningElement',['.NOTDEFINED.']]],
    'IfcOutlet': [['IfcFlowTerminal',[]], ['IfcOutlet',['.NOTDEFINED.']]],
    'IfcPile': [['IfcPile',['.NOTDEFINED.','$']], ['IfcPile',['.NOTDEFINED.','$']]],
    'IfcPipeFitting': [['IfcFlowFitting',[]], ['IfcPipeFitting',['.NOTDEFINED.']]],
    'IfcPipeSegment': [['IfcFlowSegment',[]], ['IfcPipeSegment',['.NOTDEFINED.']]],
    'IfcPlate': [['IfcPlate',[]], ['IfcPlate',['.NOTDEFINED.']]],
    'IfcPlateStandardCase': [['IfcPlate',[]], ['IfcPlate',['.NOTDEFINED.']]],
    'IfcProtectiveDevice': [['IfcFlowController',[]], ['IfcProtectiveDevice',['.NOTDEFINED.']]],
    'IfcPump': [['IfcFlowMovingDevice',[]], ['IfcPump',['.NOTDEFINED.']]],
    'IfcRailing': [['IfcRailing',['$']], ['IfcRailing',['.NOTDEFINED.']]],
    'IfcRamp': [['IfcRamp',['.NOTDEFINED.']], ['IfcRamp',['.NOTDEFINED.']]],
    'IfcRampFlight': [['IfcRampFlight',[]], ['IfcRampFlight',['.NOTDEFINED.']]],
    'IfcRoof': [['IfcRoof',['.NOTDEFINED.']], ['IfcRoof',['.NOTDEFINED.']]],
    'IfcSanitaryTerminal': [['IfcFlowTerminal',[]], ['IfcSanitaryTerminal',['.NOTDEFINED.']]],
    'IfcSensor': [['IfcDistributionControlElement',['$']], ['IfcSensor',['.NOTDEFINED.']]],
    'IfcSlab': [['IfcSlab',['$']], ['IfcSlab',['.NOTDEFINED.']]],
    'IfcSlabElementedCase': [['IfcSlab',['$']], ['IfcSlab',['.NOTDEFINED.']]],
    'IfcSlabStandardCase': [['IfcSlab',['$']], ['IfcSlab',['.NOTDEFINED.']]],
    'IfcStackTerminal': [['IfcFlowTerminal',[]], ['IfcStackTerminal',['.NOTDEFINED.']]],
    'IfcStair': [['IfcStair',['.NOTDEFINED.']], ['IfcStair',['.NOTDEFINED.']]],
    'IfcStairFlight': [['IfcStairFlight',['$','$','$','$']], ['IfcStairFlight',['$','$','$','$','.NOTDEFINED.']]],
    'IfcSwitchingDevice': [['IfcFlowController',[]], ['IfcSwitchingDevice',['.NOTDEFINED.']]],
    'IfcSystemFurnitureElement': [['IfcFurnishingElement',[]], ['IfcSystemFurnitureElement',['.NOTDEFINED.']]],
    'IfcTank': [['IfcFlowStorageDevice',[]], ['IfcTank',['.NOTDEFINED.']]],
    'IfcTransformer': [['IfcEnergyConversionDevice',[]], ['IfcTransformer',['.NOTDEFINED.']]],
    'IfcTransportElement': [['IfcTransportElement',['$','$','$']], ['IfcTransportElement',['.NOTDEFINED.']]],
    'IfcUnitaryEquipment': [['IfcEnergyConversionDevice',[]], ['IfcUnitaryEquipment',['.NOTDEFINED.']]],
    'IfcValve': [['IfcFlowController',[]], ['IfcValve',['.NOTDEFINED.']]],
    'IfcWall': [['IfcWall',[]], ['IfcWall',['.NOTDEFINED.']]],
    'IfcWallStandardCase': [['IfcWall',[]], ['IfcWall',['.NOTDEFINED.']]],
    'IfcWasteTerminal': [['IfcFlowTerminal',[]], ['IfcWasteTerminal',['.NOTDEFINED.']]],
    'IfcWindow': [['IfcWindow',['$','$']], ['IfcWindow',['$','$','.NOTDEFINED.','$','$']]]
  };
  var PROXY_TAIL = { IFC2X3: ['$'], IFC4: ['.NOTDEFINED.'] };   // IfcBuildingElementProxy: CompositionType (2X3) / PredefinedType (4), after Tag
  function genClass(src, schema, noPredefined) {   // -> {cls, tail, kind: 'mapped'|'generalised'|'proxy'}
    var m = GENMAP[src], pick = m ? m[schema === 'IFC4' ? 1 : 0] : null;
    if (!pick || src === 'IfcBuildingElementProxy') { var pt = PROXY_TAIL[schema]; if (noPredefined && schema === 'IFC4') pt = []; return { cls: 'IfcBuildingElementProxy', tail: pt, kind: src === 'IfcBuildingElementProxy' ? 'mapped' : 'proxy' }; }
    var tail = pick[1]; if (noPredefined && schema === 'IFC4') tail = tail.filter(function (t) { return t !== '.NOTDEFINED.'; });   // the red control: PredefinedType dropped, so the attribute list is short
    return { cls: pick[0], tail: tail, kind: pick[0] === src ? 'mapped' : 'generalised' };
  }

  // ---- SHA-1 (UUID5 needs it, and the browser has only the async one): bytes -> 20 bytes
  function sha1(bytes) {
    var n = bytes.length, words = [], i, j, h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;
    var total = (((n + 8) >>> 6) + 1) << 4; for (i = 0; i < total; i++) words[i] = 0;
    for (i = 0; i < n; i++) words[i >> 2] |= bytes[i] << (24 - 8 * (i & 3));
    words[n >> 2] |= 0x80 << (24 - 8 * (n & 3)); words[total - 1] = (n * 8) >>> 0; words[total - 2] = Math.floor(n / 0x20000000);
    var w = new Array(80), rol = function (x, c) { return (x << c) | (x >>> (32 - c)); };
    for (i = 0; i < total; i += 16) {
      for (j = 0; j < 16; j++) w[j] = words[i + j]; for (j = 16; j < 80; j++) w[j] = rol(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1);
      var a = h0, b = h1, c = h2, d = h3, e = h4;
      for (j = 0; j < 80; j++) {
        var f, k; if (j < 20) { f = (b & c) | (~b & d); k = 0x5A827999; } else if (j < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; } else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; } else { f = b ^ c ^ d; k = 0xCA62C1D6; }
        var t = (rol(a, 5) + f + e + k + w[j]) | 0; e = d; d = c; c = rol(b, 30); b = a; a = t;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
    }
    var out = new Uint8Array(20), H = [h0, h1, h2, h3, h4]; for (i = 0; i < 5; i++) for (j = 0; j < 4; j++) out[4 * i + j] = (H[i] >>> (24 - 8 * j)) & 255; return out;
  }
  function utf8(s) { if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s); var o = [], i, c; s = unescape(encodeURIComponent(s)); for (i = 0; i < s.length; i++) { c = s.charCodeAt(i); o.push(c); } return Uint8Array.from(o); }
  function hexBytes(h) { var o = new Uint8Array(h.length / 2), i; for (i = 0; i < o.length; i++) o[i] = parseInt(h.substr(2 * i, 2), 16); return o; }
  // uuid.uuid5(NS, name).hex : the 16 bytes of sha1(ns + name) with the version (5) and variant bits set
  function uuid5Bytes(name) {
    var ns = hexBytes(NS_HEX), nm = utf8(name), buf = new Uint8Array(ns.length + nm.length); buf.set(ns, 0); buf.set(nm, ns.length);
    var d = sha1(buf).slice(0, 16); d[6] = (d[6] & 0x0f) | 0x50; d[8] = (d[8] & 0x3f) | 0x80; return d;
  }
  // 16 bytes -> 22 characters, the IFC definition (ifcopenshell.guid.compress; the same function the Viewer's ifc_export_worker.js compressBytes implements, bound to it by the witness)
  function compress(bs) {
    function b64(v, l) { var o = ''; for (var i = l - 1; i >= 0; i--) o += IFC64[Math.floor(v / Math.pow(64, i)) % 64]; return o; }
    var out = b64(bs[0], 2); for (var i = 1; i < 16; i += 3) out += b64((bs[i] << 16) + (bs[i + 1] << 8) + bs[i + 2], 4); return out;
  }
  function gidOf(key) { return compress(uuid5Bytes(key)); }
  function randomGid() { var c = [IFC64[Math.floor(Math.random() * 4)]], i; for (i = 1; i < 22; i++) c.push(IFC64[Math.floor(Math.random() * 64)]); return c.join(''); }

  // ---- STEP text
  function str(s) {   // STEP string: quotes and backslashes doubled, anything above ASCII as \X2\ hex \X0\ (the form every IFC reader decodes)
    s = String(s).replace(/\\/g, '\\\\').replace(/'/g, "''"); var o = '', i, c;
    for (i = 0; i < s.length; i++) { c = s.charCodeAt(i); if (c > 126) { var h = ''; while (i < s.length && s.charCodeAt(i) > 126) { h += ('0000' + s.charCodeAt(i).toString(16).toUpperCase()).slice(-4); i++; } i--; o += '\\X2\\' + h + '\\X0\\'; } else o += s.charAt(i); }
    return "'" + o + "'";
  }
  function real(v) {
    v = Number(v); if (v === 0) return '0.'; var s = String(v); if (/e/i.test(s)) { var m = /^(-?)(\d+)(?:\.(\d+))?e([+-]?\d+)$/i.exec(s); return m[1] + m[2] + '.' + (m[3] || '') + 'E' + (m[4].charAt(0) === '+' ? m[4].slice(1) : m[4]); }
    return s.indexOf('.') < 0 ? s + '.' : s;
  }
  function pyFloat(v) { var s = String(v); return /^-?\d+$/.test(s) ? s + '.0' : s; }   // python repr of a float, for the description text only
  function fmtG(x) { return String(parseFloat(Number(x).toPrecision(6))); }                   // python {:g}
  function r6(x) { var y = Math.round(x * 1e6) / 1e6; return y === 0 ? 0 : y; }

  // ---- stated values read from the upgrade row text (the oracle's regexes, in the oracle's order)
  var DIA_RE = /T(\d+)|(\d+(?:\.\d+)?)\s*mm\s*dia|(\d+(?:\.\d+)?)\s*dia/g;
  function statedDias(detail) {
    var m = /stated "(.*?)" \(/.exec(detail || ''); if (!m) return []; var seen = {}, out = [], h; DIA_RE.lastIndex = 0;
    while ((h = DIA_RE.exec(m[1])) !== null) { var v = parseFloat(h[1] !== undefined ? h[1] : h[2] !== undefined ? h[2] : h[3]); if (!seen[v]) { seen[v] = 1; out.push(v); } }
    return out.sort(function (a, b) { return a - b; });
  }
  function statedCounts(detail) {
    var m = /stated "(.*?)" \(/.exec(detail || ''), pl = /(\d+) of (\d+) bars placed/.exec(detail || ''); if (!m || !pl || pl[1] !== pl[2]) return null;
    var c = {}, tot = 0, rx = /(\d+)T(\d+)/g, h; while ((h = rx.exec(m[1])) !== null) { c[parseFloat(h[2])] = (c[parseFloat(h[2])] || 0) + parseInt(h[1], 10); tot += parseInt(h[1], 10); }
    return tot === parseInt(pl[1], 10) ? c : null;
  }
  function statedLen(detail) {   // metres; [min, max] over the bars of the element, or null
    var m = /length (\d+(?:\.\d+)?)\.\.(\d+(?:\.\d+)?) mm/.exec(detail || ''); if (m) return [parseFloat(m[1]) / 1000, parseFloat(m[2]) / 1000];
    m = /each (\d+(?:\.\d+)?) mm/.exec(detail || ''); return m ? [parseFloat(m[1]) / 1000, parseFloat(m[1]) / 1000] : null;
  }
  function shortName(n) { return String(n).split(/ \[stated| \(rules/)[0]; }

  // ---- a frame JSON the person loaded: checked before it is used (a malformed file is refused with its reason, never half-read)
  function validateFrame(j) {
    if (!j || typeof j !== 'object' || Array.isArray(j)) return { ok: false, why: 'the file is not a JSON object' };
    var num3 = function (a) { return Array.isArray(a) && a.length === 3 && a.every(function (x) { return typeof x === 'number' && isFinite(x); }); };
    if (j.shift_m !== undefined && !num3(j.shift_m)) return { ok: false, why: 'shift_m must be three numbers [dx, dy, dz] in metres' };
    if (j.site !== undefined) {
      var s = j.site; if (!s || typeof s !== 'object') return { ok: false, why: 'site must be an object' };
      if (!num3(s.location_m)) return { ok: false, why: 'site.location_m must be three numbers in metres' };
      if (!(Array.isArray(s.ref_direction) && s.ref_direction.length === 2 && s.ref_direction.every(function (x) { return typeof x === 'number' && isFinite(x); }) && Math.hypot(s.ref_direction[0], s.ref_direction[1]) > 0)) return { ok: false, why: 'site.ref_direction must be two numbers [cos, sin], not both zero' };
      var ll = function (a) { return Array.isArray(a) && (a.length === 3 || a.length === 4) && a.every(function (x) { return Number.isInteger(x); }); };
      if ((s.latitude !== undefined || s.longitude !== undefined) && !(ll(s.latitude) && ll(s.longitude))) return { ok: false, why: 'site.latitude / longitude must be [degrees, minutes, seconds(, millionths)] integers' };
    }
    if (j.storey_elevations_m !== undefined) {
      var e = j.storey_elevations_m; if (!e || typeof e !== 'object' || Array.isArray(e)) return { ok: false, why: 'storey_elevations_m must be an object {"STOREY NAME": metres}' };
      var bad = Object.keys(e).filter(function (k) { return typeof e[k] !== 'number' || !isFinite(e[k]); }); if (bad.length) return { ok: false, why: 'storey_elevations_m: "' + bad[0] + '" is not a number' };
    }
    return { ok: true, summary: (j.frame_name || 'frame') + (j.storey_elevations_m ? ': ' + Object.keys(j.storey_elevations_m).length + ' storeys' : '') + (j.site ? ', site placement' : '') + (j.shift_m ? ', shift' : '') };
  }

  // ---- a part's mesh -> closed components, wound outward (the oracle's components(): triangles joined by a shared edge; a component is closed when every directed edge has exactly its one reverse)
  function* components(W, shift, stat, K) {
    var nT = W.length / 9, nC = W.length / 3, vid = new Int32Array(nC), map = new Map(), nV = 0, i, a, b;
    for (i = 0; i < nC; i++) {
      var key = W[3 * i] + ',' + W[3 * i + 1] + ',' + W[3 * i + 2], id = map.get(key); if (id === undefined) { id = nV++; map.set(key, id); } vid[i] = id;
      if ((i & 16383) === 0 && K.due()) yield K.state.prog;
    }
    map = null; var M = nV + 2, parent = new Int32Array(nT), first = new Map(), dcnt = new Map(), ucnt = new Map(), t, e;
    for (t = 0; t < nT; t++) parent[t] = t;
    var find = function (x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    for (t = 0; t < nT; t++) {
      for (e = 0; e < 3; e++) {
        a = vid[3 * t + e]; b = vid[3 * t + (e + 1) % 3]; var lo = a < b ? a : b, hi = a < b ? b : a, uk = lo * M + hi, o = first.get(uk);
        if (o === undefined) first.set(uk, t); else { var ra = find(t), rb = find(o); if (ra !== rb) parent[ra] = rb; }
        ucnt.set(uk, (ucnt.get(uk) || 0) + 1); var dk = a * M + b; dcnt.set(dk, (dcnt.get(dk) || 0) + 1);
      }
      if ((t & 8191) === 0 && K.due()) yield K.state.prog;
    }
    var bad = new Uint8Array(nT), two = new Uint8Array(nT);
    for (t = 0; t < nT; t++) {
      for (e = 0; e < 3; e++) {
        a = vid[3 * t + e]; b = vid[3 * t + (e + 1) % 3];
        if (dcnt.get(a * M + b) !== 1 || (dcnt.get(b * M + a) || 0) !== 1) bad[t] = 1;
        var lo2 = a < b ? a : b, hi2 = a < b ? b : a; if (ucnt.get(lo2 * M + hi2) !== 2) two[t] = 1;
      }
    }
    dcnt = null; ucnt = null; first = null;
    var lab = new Int32Array(nT), order = [], rootIdx = new Map(), comp;
    for (t = 0; t < nT; t++) { var r = find(t); comp = rootIdx.get(r); if (comp === undefined) { comp = order.length; rootIdx.set(r, comp); order.push({ tris: [], bad: 0, two: 1 }); } lab[t] = comp; order[comp].tris.push(t); if (bad[t]) order[comp].bad = 1; if (two[t]) order[comp].two = 0; }
    // world points (+ the frame shift) and their mean (the oracle's c0)
    var P = new Float64Array(W.length), sx = shift[0], sy = shift[1], sz = shift[2], c0 = [0, 0, 0];
    for (i = 0; i < nC; i++) { P[3 * i] = W[3 * i] + sx; P[3 * i + 1] = W[3 * i + 1] + sy; P[3 * i + 2] = W[3 * i + 2] + sz; c0[0] += P[3 * i]; c0[1] += P[3 * i + 1]; c0[2] += P[3 * i + 2]; }
    c0 = [c0[0] / nC, c0[1] / nC, c0[2] / nC]; var out = [];
    for (var ci = 0; ci < order.length; ci++) {
      var cm = order[ci], vol = 0, k, closed = !cm.bad;
      for (k = 0; k < cm.tris.length; k++) {
        t = cm.tris[k]; var o9 = 9 * t, ax = P[o9] - c0[0], ay = P[o9 + 1] - c0[1], az = P[o9 + 2] - c0[2], bx = P[o9 + 3] - c0[0], by = P[o9 + 4] - c0[1], bz = P[o9 + 5] - c0[2], cx = P[o9 + 6] - c0[0], cy = P[o9 + 7] - c0[1], cz = P[o9 + 8] - c0[2];
        vol += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
      }
      vol /= 6; var flip = closed && vol < 0; if (flip) { vol = -vol; stat.flipped++; }
      stat[closed ? 'closed' : 'open']++; if (!closed && cm.two) stat.openTwoSided++;
      var T = new Float64Array(cm.tris.length * 9);
      for (k = 0; k < cm.tris.length; k++) {
        var s9 = 9 * cm.tris[k], d9 = 9 * k;
        T[d9] = P[s9]; T[d9 + 1] = P[s9 + 1]; T[d9 + 2] = P[s9 + 2];
        if (flip) { T[d9 + 3] = P[s9 + 6]; T[d9 + 4] = P[s9 + 7]; T[d9 + 5] = P[s9 + 8]; T[d9 + 6] = P[s9 + 3]; T[d9 + 7] = P[s9 + 4]; T[d9 + 8] = P[s9 + 5]; }
        else { for (i = 3; i < 9; i++) T[d9 + i] = P[s9 + i]; }
      }
      out.push({ T: T, vol: vol, closed: closed });
      if ((ci & 63) === 0 && K.due()) yield K.state.prog;
    }
    for (t = 0; t < nT; t++) { var q = 9 * t, ux = P[q + 3] - P[q], uy = P[q + 4] - P[q + 1], uz = P[q + 5] - P[q + 2], vx = P[q + 6] - P[q], vy = P[q + 7] - P[q + 1], vz = P[q + 8] - P[q + 2], nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; if (Math.sqrt(nx * nx + ny * ny + nz * nz) < 1e-12) stat.degenerate++; }
    return { comps: out, c0: c0 };
  }
  // the bar's measured thickness: the smallest principal extent of the component's points (an n-gon section reads between cos(pi/n) d and d), by the symmetric 3x3 eigen decomposition (Jacobi)
  function thicknessMm(T) {
    var n = T.length / 3, m = [0, 0, 0], i, a, b, r; for (i = 0; i < n; i++) for (a = 0; a < 3; a++) m[a] += T[3 * i + a]; m = [m[0] / n, m[1] / n, m[2] / n];
    var C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (i = 0; i < n; i++) { var d = [T[3 * i] - m[0], T[3 * i + 1] - m[1], T[3 * i + 2] - m[2]]; for (a = 0; a < 3; a++) for (b = a; b < 3; b++) C[a][b] += d[a] * d[b]; }
    C[1][0] = C[0][1]; C[2][0] = C[0][2]; C[2][1] = C[1][2];
    var A = [C[0].slice(), C[1].slice(), C[2].slice()], V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], it, p, q;
    for (it = 0; it < 60; it++) {
      var off = Math.abs(A[0][1]) + Math.abs(A[0][2]) + Math.abs(A[1][2]); if (off < 1e-30) break;
      for (p = 0; p < 2; p++) for (q = p + 1; q < 3; q++) {
        if (Math.abs(A[p][q]) < 1e-300) continue;
        var th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (r = 0; r < 3; r++) { var a1 = A[r][p], a2 = A[r][q]; A[r][p] = c * a1 - s * a2; A[r][q] = s * a1 + c * a2; }
        for (r = 0; r < 3; r++) { var b1 = A[p][r], b2 = A[q][r]; A[p][r] = c * b1 - s * b2; A[q][r] = s * b1 + c * b2; }
        for (r = 0; r < 3; r++) { var v1 = V[r][p], v2 = V[r][q]; V[r][p] = c * v1 - s * v2; V[r][q] = s * v1 + c * v2; }
      }
    }
    var k = 0; for (i = 1; i < 3; i++) if (A[i][i] < A[k][k]) k = i; var w = [V[0][k], V[1][k], V[2][k]], lo = Infinity, hi = -Infinity;
    for (i = 0; i < n; i++) { var pr = (T[3 * i] - m[0]) * w[0] + (T[3 * i + 1] - m[1]) * w[1] + (T[3 * i + 2] - m[2]) * w[2]; if (pr < lo) lo = pr; if (pr > hi) hi = pr; }
    return (hi - lo) * 1000;
  }

  // ---- the file
  function* buildSteps(elements, opts) {
    opts = opts || {}; var K = opts.kit || NOKIT, SCHEMA = opts.schema === 'IFC4' ? 'IFC4' : 'IFC2X3', FR = opts.frame || {}, hasFrame = !!opts.frame, LOGF = opts.log || function () { };
    var gid = opts.breakGuid ? function () { return randomGid(); } : gidOf, SHIFT = FR.shift_m || [0, 0, 0], SITE = FR.site || null, name = opts.fileName || 'LOD400_addon.ifc', gradeOf = opts.gradeOf || function () { return null; };
    var ELEV = (FR.storey_elevations_m && Object.keys(FR.storey_elevations_m).length) ? FR.storey_elevations_m : (opts.elev || {});   // the frame's elevations; else the DB's own storey table
    var cs = 1, sn = 0, TSITE = [0, 0, 0]; if (SITE) { var nn = Math.hypot(SITE.ref_direction[0], SITE.ref_direction[1]); cs = SITE.ref_direction[0] / nn; sn = SITE.ref_direction[1] / nn; TSITE = SITE.location_m; }
    var els = elements.slice().sort(function (a, b) { return a.guid < b.guid ? -1 : a.guid > b.guid ? 1 : 0; }), supported = [], skipped = {};
    var ANY = !!opts.anyElement, noPre = !!opts.breakPredefined;
    els.forEach(function (e) { if (ANY && !e.part) supported.push(e); else if (e.cls === 'IfcReinforcingBar' || JOINT_CLS[e.cls] || e.cls === 'IfcBuildingElementPart') supported.push(e); else skipped[e.cls] = (skipped[e.cls] || 0) + 1; });
    var res = { ok: false, why: null, stats: { elements: supported.length, skipped: skipped } };
    if (!supported.length) { res.why = ANY ? 'No element with geometry to write.' : 'No generated part to write: run an upgrade first.'; return res; }
    var missing = {}; if (!ANY) supported.forEach(function (e) { if (!(e.storey in ELEV)) missing[e.storey] = 1; });
    if (Object.keys(missing).length) { res.why = 'Storey ' + Object.keys(missing).map(function (s) { return '"' + s + '"'; }).join(', ') + ' has no elevation: load a frame JSON that lists it under storey_elevations_m (no elevation is invented).'; res.stats.missingStoreys = Object.keys(missing); return res; }
    var classes = {}; supported.forEach(function (e) { if (!ANY || e.part) classes[e.cls] = (classes[e.cls] || 0) + 1; });
    var nid = 0, chunks = [], buf = [], bytes = 0, mesh = { closed: 0, open: 0, openTwoSided: 0, flipped: 0, degenerate: 0 };
    function ent(txt) { var n = ++nid; buf.push('#' + n + '=' + txt + ';'); if (buf.length >= 20000) flush(); return '#' + n; }
    function flush() { var t = buf.join('\n') + '\n'; chunks.push(t); bytes += t.length; buf = []; }
    var pt3 = function (x, y, z) { return ent('IFCCARTESIANPOINT((' + real(x) + ',' + real(y) + ',' + real(z) + '))'); };
    var frameTxt = hasFrame ? 'frame: ' + (FR.frame_name || 'given frame') + ' (shift_m=[' + SHIFT.map(pyFloat).join(', ') + '])' : 'frame: DB frame written as is (no frame file given)';
    var header = 'ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((' + str(SCHEMA === 'IFC2X3' ? 'ViewDefinition [CoordinationView_V2.0]' : 'ViewDefinition [ReferenceView_V1.2]') + ',' + str(ANY ? (opts.description || 'BIMCompiler Viewer export: the whole building') + '; ' + frameTxt : 'LOD 400 add-on: generated parts only; ' + frameTxt) + "),'2;1');\n" +
      'FILE_NAME(' + str(name) + ',' + str(TSTAMP) + ",(''),(''),'BIMCompiler Modeller','BIMCompiler LOD Upgrade','');\nFILE_SCHEMA((" + str(SCHEMA) + '));\nENDSEC;\nDATA;\n';
    // owner history, units, contexts, project, site, building
    var person = ent("IFCPERSON($," + str('BIMCompiler') + ',$,$,$,$,$,$)'), org = ent('IFCORGANIZATION($,' + str('BIMCompiler') + ',$,$,$)'), po = ent('IFCPERSONANDORGANIZATION(' + person + ',' + org + ',$)');
    var app = ent('IFCAPPLICATION(' + org + ',' + str(APP_VERSION) + ',' + str(ANY ? 'BIMCompiler Viewer IFC export' : 'BIMCompiler LOD 400 parts export') + ',' + str('BIMC') + ')'), oh = ent('IFCOWNERHISTORY(' + po + ',' + app + ',$,.ADDED.,$,$,$,' + TS + ')');
    var O = pt3(0, 0, 0), Zd = ent('IFCDIRECTION((0.,0.,1.))'), Xd = ent('IFCDIRECTION((1.,0.,0.))'), A0 = ent('IFCAXIS2PLACEMENT3D(' + O + ',' + Zd + ',' + Xd + ')');
    var ctx = ent("IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05," + A0 + ',$)'), body = ent("IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*," + ctx + ',$,.MODEL_VIEW.,$)');
    var units = ent('IFCUNITASSIGNMENT((' + [ent('IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)'), ent('IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)'), ent('IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)'), ent('IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)')].join(',') + '))');
    ent('IFCPROJECT(' + str(gid('project')) + ',' + oh + ',' + str(FR.project_name || (ANY ? (opts.projectName || 'Building') : 'LOD 400 add-on')) + ',$,$,$,$,(' + ctx + '),' + units + ')'); var projId = '#' + nid;
    var siteLoc = pt3(TSITE[0], TSITE[1], TSITE[2]), siteAx = ent('IFCAXIS2PLACEMENT3D(' + siteLoc + ',' + ent('IFCDIRECTION((0.,0.,1.))') + ',' + ent('IFCDIRECTION((' + real(cs) + ',' + real(sn) + ',0.))') + ')'), siteLp = ent('IFCLOCALPLACEMENT($,' + siteAx + ')');
    var ll = SITE && SITE.latitude ? '(' + SITE.latitude.join(',') + '),(' + SITE.longitude.join(',') + '),' + real(SITE.elevation_m || 0) : '$,$,$';
    var site = ent('IFCSITE(' + str(gid('site')) + ',' + oh + ',' + str('Site') + ',$,$,' + siteLp + ',$,$,.ELEMENT.,' + ll + ',$,$)');
    var bldLp = ent('IFCLOCALPLACEMENT(' + siteLp + ',' + A0 + ')'), bld = ent('IFCBUILDING(' + str(gid('building')) + ',' + oh + ',' + str(ANY ? (opts.buildingName || 'Building') : 'LOD 400 add-on') + ',$,$,' + bldLp + ',$,$,.ELEMENT.,$,$,$)');
    ent('IFCRELAGGREGATES(' + str(gid('agg-ps')) + ',' + oh + ',$,$,' + projId + ',(' + site + '))'); ent('IFCRELAGGREGATES(' + str(gid('agg-sb')) + ',' + oh + ',$,$,' + site + ',(' + bld + '))');
    var noElev = [], STOREYS = {}, STOREY_LP = {}, CONTAINED = {}, MATS = {}, GROUPS = {}, groupOrder = [], nParts = 0, split = {}, mixed = [];
    function storey(nm) {
      if (!STOREYS[nm]) { var z = ELEV[nm], known = z !== undefined, lp = ent('IFCLOCALPLACEMENT(' + bldLp + ',' + ent('IFCAXIS2PLACEMENT3D(' + pt3(0, 0, known ? z : 0) + ',$,$)') + ')'); STOREY_LP[nm] = lp; STOREYS[nm] = ent('IFCBUILDINGSTOREY(' + str(gid('storey:' + nm)) + ',' + oh + ',' + str(nm) + ',$,$,' + lp + ',$,$,.ELEMENT.,' + (known ? real(z) : '$') + ')'); if (!known) noElev.push(nm); }
      return STOREYS[nm];
    }
    function material(nm) { if (!MATS[nm]) MATS[nm] = { id: ent('IFCMATERIAL(' + str(nm) + (SCHEMA === 'IFC4' ? ',$,$' : '') + ')'), els: [] }; return MATS[nm]; }
    function pset(obj, psetName, props, key, plain) {
      var vals = []; Object.keys(props).forEach(function (kk) {
        var v = props[kk]; if (v === null || v === undefined) return; var nv;
        if (typeof v === 'boolean') nv = 'IFCBOOLEAN(' + (v ? '.T.' : '.F.') + ')'; else if (typeof v === 'number') nv = 'IFCREAL(' + real(v) + ')'; else if (!plain && (kk === 'Detail' || kk === 'Rule')) nv = 'IFCTEXT(' + str(v) + ')'; else nv = 'IFCLABEL(' + str(v) + ')';
        vals.push(ent('IFCPROPERTYSINGLEVALUE(' + str(kk) + ',$,' + nv + ',$)'));
      });
      var ps = ent('IFCPROPERTYSET(' + str(gid('pset:' + key + ':' + psetName)) + ',' + oh + ',' + str(psetName) + ',$,(' + vals.join(',') + '))');
      ent('IFCRELDEFINESBYPROPERTIES(' + str(gid('rel:' + key + ':' + psetName)) + ',' + oh + ',$,$,(' + obj + '),' + ps + ')');
    }
    var STYLES = {}, BLDCONT = [], gen = { written: 0, byClass: {}, proxied: {}, generalised: {}, noStorey: 0 }, PEND = [], WR = {}, dx = { partClasses: {}, assemblies: 0, noMaterial: 0, psets: 0, props: 0, aggregates: 0, orphanParts: 0, gidKept: 0, gidDerived: 0, partsAsGeneric: 0 };
    function styleOf(rgba) {   // one IfcPresentationStyleAssignment per distinct colour (ANY mode); null when the element states none
      if (!rgba) return null; var c = String(rgba).split(',').map(Number); if (c.length < 3 || c.some(function (x, i) { return i < 4 && c[i] !== c[i]; })) return null;
      var f = function (x) { x = x > 1 ? x / 255 : x; return Math.round(x * 1e4) / 1e4; }, a = c.length > 3 ? c[3] : 1; a = a > 1 ? a / 255 : a; var k = [f(c[0]), f(c[1]), f(c[2]), Math.round(a * 1e4) / 1e4].join(',');
      if (!STYLES[k]) { var col = ent('IFCCOLOURRGB($,' + real(f(c[0])) + ',' + real(f(c[1])) + ',' + real(f(c[2])) + ')'), rnd = ent('IFCSURFACESTYLERENDERING(' + col + ',' + real(Math.round((1 - a) * 1e4) / 1e4) + ',$,$,$,$,$,$,.FLAT.)'), ss = ent("IFCSURFACESTYLE('',.BOTH.,(" + rnd + '))'); STYLES[k] = ent('IFCPRESENTATIONSTYLEASSIGNMENT((' + ss + '))'); }
      return STYLES[k];
    }
    // the geometry of one set of components, in the storey's local frame (the site rotation), as IfcFacetedBrep (IFC2X3) / one IfcTriangulatedFaceSet (IFC4)
    function geometry(e, comps, c0) {
      var z = ELEV[e.storey] === undefined ? 0 : ELEV[e.storey], loc = function (x, y, zz) { var dx = x - c0[0], dy = y - c0[1], dz = zz - c0[2]; return [r6(cs * dx + sn * dy), r6(-sn * dx + cs * dy), r6(dz)]; }, rep, repItems, ci, t, q;
      if (SCHEMA === 'IFC2X3') {
        var items = [];
        for (ci = 0; ci < comps.length; ci++) {
          var T = comps[ci].T, key = {}, faces = [], ptOf = function (x, y, zz) { var l = loc(x, y, zz), kk = l[0] + ',' + l[1] + ',' + l[2]; if (!key[kk]) key[kk] = pt3(l[0], l[1], l[2]); return key[kk]; };
          for (t = 0; t < T.length; t += 9) { var pa = ptOf(T[t], T[t + 1], T[t + 2]), pb = ptOf(T[t + 3], T[t + 4], T[t + 5]), pc = ptOf(T[t + 6], T[t + 7], T[t + 8]); faces.push(ent('IFCFACE((' + ent('IFCFACEOUTERBOUND(' + ent('IFCPOLYLOOP((' + pa + ',' + pb + ',' + pc + '))') + ',.T.)') + '))')); }
          items.push(ent('IFCFACETEDBREP(' + ent('IFCCLOSEDSHELL((' + faces.join(',') + '))') + ')'));
        }
        rep = ent("IFCSHAPEREPRESENTATION(" + body + ",'Body','Brep',(" + items.join(',') + '))'); repItems = items;
      } else {
        var idx = {}, coords = [], tris = [], allClosed = true;
        for (ci = 0; ci < comps.length; ci++) {
          var T2 = comps[ci].T; if (!comps[ci].closed) allClosed = false;
          for (t = 0; t < T2.length; t += 9) { var row = []; for (q = 0; q < 9; q += 3) { var l = loc(T2[t + q], T2[t + q + 1], T2[t + q + 2]), kk = l[0] + ',' + l[1] + ',' + l[2]; if (idx[kk] === undefined) { idx[kk] = coords.length + 1; coords.push('(' + real(l[0]) + ',' + real(l[1]) + ',' + real(l[2]) + ')'); } row.push(idx[kk]); } tris.push('(' + row.join(',') + ')'); }
        }
        var fs = ent('IFCTRIANGULATEDFACESET(' + ent('IFCCARTESIANPOINTLIST3D((' + coords.join(',') + '))') + ',$,' + (allClosed ? '.T.' : '.F.') + ',(' + tris.join(',') + '),$)');
        rep = ent("IFCSHAPEREPRESENTATION(" + body + ",'Body','Tessellation',(" + fs + '))'); repItems = [fs];
      }
      var cx = c0[0] - TSITE[0], cy = c0[1] - TSITE[1];   // placement: (c0 - site) in the site frame, minus the storey elevation
      var lp = pt3(cs * cx + sn * cy, -sn * cx + cs * cy, c0[2] - TSITE[2] - z), lpl = ent('IFCLOCALPLACEMENT(' + (STOREY_LP[e.storey] || bldLp) + ',' + ent('IFCAXIS2PLACEMENT3D(' + lp + ',$,$)') + ')');
      return { shape: ent('IFCPRODUCTDEFINITIONSHAPE($,$,(' + rep + '))'), lp: lpl, locPoint: lp, items: repItems };
    }
    var sec = function (dd) { return SECTION_SIDES / 2 * Math.pow(dd / 2000.0, 2) * Math.sin(2 * Math.PI / SECTION_SIDES); };
    var fails = [], untraced = 0, n = supported.length, ei;
    // storeys first, in the order the parts need them (as the oracle creates them on first use)
    for (ei = 0; ei < n; ei++) {
      var e = supported[ei]; K.state.prog = { label: ANY ? 'IFC: element' : 'Add-on IFC: part', done: ei, total: n }; var partFb = ANY && !!e.part && e.cls === 'IfcReinforcingBar' && !statedDias(e.detail).length, isGen = ANY && (!e.part || partFb), hasSt = (!isGen && !ANY) || (!!e.storey && e.storey !== 'Unknown'); if (partFb) dx.partsAsGeneric++; if (hasSt) storey(e.storey);
      var cr = yield* components(e.tris, SHIFT, mesh, K), comps = cr.comps, c0 = cr.c0, cls = e.cls, sname = shortName(e.name), status = JOINT_CLS[cls] ? 'configuration only, capacity not checked' : 'ADDED (generated by rule, not authored)', gparts = [];
      if (e.detail === null || e.detail === undefined) untraced++;
      var groups = [[null, comps.map(function (_, i) { return i; })]], dias = [], asg = null;
      if (cls === 'IfcReinforcingBar' && !isGen) {
        dias = statedDias(e.detail); if (!dias.length) { fails.push('no stated diameter parsed for ' + e.guid); continue; }
        asg = comps.map(function (c) { if (dias.length === 1) return dias[0]; var th = thicknessMm(c.T); return dias.reduce(function (best, x) { return Math.abs(th / x - (1 + Math.cos(Math.PI / SECTION_SIDES)) / 2) < Math.abs(th / best - (1 + Math.cos(Math.PI / SECTION_SIDES)) / 2) ? x : best; }, dias[0]); });
        var byD = {}; asg.forEach(function (d, i) { (byD[d] = byD[d] || []).push(i); }); groups = Object.keys(byD).map(parseFloat).sort(function (a, b) { return a - b; }).map(function (d) { return [d, byD[d]]; });
        if (dias.length > 1) mixed.push({ guid: e.guid, dias: dias, per: groups.map(function (g) { return [g[0], g[1].length]; }), stated: statedCounts(e.detail) });
      }
      for (var gi = 0; gi < groups.length; gi++) {
        var key = groups[gi][0], sub = groups[gi][1].map(function (i) { return comps[i]; }), eid = groups.length === 1 ? e.guid : e.guid + '#T' + fmtG(key);
        if (gi > 0) split[cls] = (split[cls] || 0) + 1;
        if (isGen) {   // ANY ELEMENT: a generic product, the full attribute list of the schema (GENMAP); the source class stays in ObjectType when it was generalised or proxied
          var gc = genClass(cls, SCHEMA, noPre), gg = geometry(e, sub, c0), sty = styleOf(e.rgba), keep = !!e.keepGid && !opts.breakGuid, gattrs = [str(keep ? e.guid : gid(e.guid)), oh, str(e.name || ''), '$', gc.kind === 'mapped' ? '$' : str(cls), gg.lp, gg.shape, str(e.guid)];
          if (sty) gg.items.forEach(function (it) { ent('IFCSTYLEDITEM(' + it + ',(' + sty + '),$)'); });
          var gEnt = ent(gc.cls.toUpperCase() + '(' + gattrs.concat(gc.tail).join(',') + ')'); gen.written++; classes[gc.cls] = (classes[gc.cls] || 0) + 1;
          var bc = gen.byClass[cls] = gen.byClass[cls] || { cls: gc.cls, n: 0, kind: gc.kind }; bc.n++; if (gc.kind === 'proxy') gen.proxied[cls] = (gen.proxied[cls] || 0) + 1; else if (gc.kind === 'generalised') gen.generalised[cls] = (gen.generalised[cls] || 0) + 1;
          if (keep) dx.gidKept++; else dx.gidDerived++; (WR[e.guid] = WR[e.guid] || []).push(gEnt); if (!hasSt) gen.noStorey++;
          if (e.mat) material(String(e.mat)).els.push(gEnt); else dx.noMaterial++;
          if (e.psets) Object.keys(e.psets).sort().forEach(function (pn) { var pr = e.psets[pn], nms = Object.keys(pr).sort().filter(function (k) { return pr[k] !== null && pr[k] !== undefined; }), srt = {}; if (!nms.length) return; nms.forEach(function (k) { srt[k] = pr[k]; }); pset(gEnt, pn, srt, e.guid, true); dx.psets++; dx.props += nms.length; });
          PEND.push({ ent: gEnt, guid: e.guid, storey: hasSt ? e.storey : null, parent: e.parent || null, gen: !partFb });
          continue;
        }
        var geo = geometry(e, sub, c0), attrs = [str(gid(eid)), oh, str(sname + (groups.length > 1 ? ' (T' + fmtG(key) + ' bars)' : '')), str(e.name), '$', geo.lp, geo.shape, str(e.guid)], mname, extra = {}, tail = [];
        if (cls === 'IfcReinforcingBar') {
          var d = key, Ls = sub.filter(function (c) { return c.closed; }).map(function (c) { return c.vol / sec(d); }), sl = statedLen(e.detail), statedOne = sl && sl[0] === sl[1];
          var blen = (statedOne ? sl[1] : null) || (Ls.length ? Ls.reduce(function (a, b) { return a + b; }, 0) / Ls.length : null), lig = LIGATURE_WORDS.some(function (w) { return e.name.toLowerCase().indexOf(w) >= 0; }), gr = gradeOf(e.host);
          // IFC2X3 IfcReinforcingBar: SteelGrade, NominalDiameter, CrossSectionArea, BarLength, BarRole, BarSurface ; IFC4: SteelGrade, NominalDiameter, CrossSectionArea, BarLength, PredefinedType, BarSurface
          var grade = SCHEMA === 'IFC4' && gr ? str('fy ' + gr.fy + ' MPa (stated)') : '$';
          tail = [grade, real(d / 1000.0), real(Math.PI * Math.pow(d / 1000.0, 2) / 4), blen === null ? '$' : real(blen), '.' + (lig ? 'LIGATURE' : 'MAIN') + '.', '$'];
          extra = { DiametersStatedOnElement_mm: dias.length > 1 ? dias.map(fmtG).join('; ') : null, BarRole: lig ? 'LIGATURE' : 'MAIN', BarCount: sub.length, BarLengthSource: statedOne ? 'stated in the upgrade row' : 'measured: mesh volume / section area',
            BarLengthMin_mm: Ls.length ? Math.round(Math.min.apply(null, Ls) * 1e4) / 10 : null, BarLengthMax_mm: Ls.length ? Math.round(Math.max.apply(null, Ls) * 1e4) / 10 : null, SteelGradeStated: gr ? 'fy ' + gr.fy + ' MPa (' + gr.src + ')' : null };
          mname = gr ? 'Reinforcing steel, fy ' + gr.fy + ' MPa (stated)' : 'Reinforcing steel (grade not stated)';
        } else if (cls === 'IfcBuildingElementPart') {
          var lm = /^(.*) \d+(?:\.\d+)? mm \(layer /.exec(e.name); mname = lm ? lm[1] : 'Layer material (not stated)'; tail = SCHEMA === 'IFC4' ? ['.NOTDEFINED.'] : [];
        } else {
          mname = 'Steel (grade not stated)'; var mm = /\bM(\d+)\b/.exec(e.name);
          if (cls === 'IfcMechanicalFastener') tail = [mm ? real(parseInt(mm[1], 10) / 1000.0) : '$', '$'].concat(SCHEMA === 'IFC4' ? ['.BOLT.'] : []);
          else if (cls === 'IfcFastener') tail = SCHEMA === 'IFC4' ? ['.WELD.'] : [];
          else tail = SCHEMA === 'IFC4' ? ['.NOTDEFINED.'] : [];   // IfcPlate
        }
        var entId = ent(cls.toUpperCase() + '(' + attrs.concat(tail).join(',') + ')'); nParts++; material(mname).els.push(entId);
        if (ANY) { dx.partClasses[cls] = (dx.partClasses[cls] || 0) + 1; (WR[e.guid] = WR[e.guid] || []).push(entId); if (gi === 0) { var pbc = gen.byClass[cls] = gen.byClass[cls] || { cls: cls, n: 0, kind: 'part' }; pbc.n++; gen.written++; if (!hasSt) gen.noStorey++; } }
        var props = { HostGlobalId: e.host, Rule: e.rule, Detail: e.detail, Status: status, GeneratedElementId: e.guid }; Object.keys(extra).forEach(function (kk) { props[kk] = extra[kk]; });
        pset(entId, 'BIMC_Upgrade', props, eid);
        var base = null; for (var si = 0; si < SUFFIXES.length; si++) if (e.guid.length > SUFFIXES[si].length && e.guid.slice(-SUFFIXES[si].length) === SUFFIXES[si]) { base = e.guid.slice(0, -SUFFIXES[si].length); break; }
        if (base && JOINT_CLS[cls] && (!ANY || hasSt)) { var gk = base + '\u0000' + e.storey; if (!GROUPS[gk]) { GROUPS[gk] = { base: base, storey: e.storey, parts: [], first: geo.locPoint }; groupOrder.push(gk); } GROUPS[gk].parts.push(entId); }
        else if (ANY) PEND.push({ ent: entId, guid: e.guid, storey: hasSt ? e.storey : null, parent: e.parent || null, gen: false });
        else (CONTAINED[e.storey] = CONTAINED[e.storey] || []).push(entId);
      }
      if (K.due()) yield K.state.prog;
    }
    if (fails.length) { res.why = fails[0]; return res; }
    var AGG = {}, AGGO = [];
    if (ANY) {   // step (d): who is aggregated under a written parent (once), who is contained in a storey, who is a child without its parent (BIMC_Part)
      var PAR = {}; PEND.forEach(function (p) { if (p.parent) PAR[p.guid] = p.parent.guid; });
      var cyclic = function (child, par) { var g = par, hop = 0; while (g !== undefined && hop++ < 1000) { if (g === child) return true; g = PAR[g]; } return false; };
      PEND.forEach(function (p) {
        var par = p.parent, wr = par ? WR[par.guid] : null;
        if (par && par.guid !== p.guid && wr && wr.length === 1 && !cyclic(p.guid, par.guid)) { if (!AGG[par.guid]) { AGG[par.guid] = []; AGGO.push(par.guid); } AGG[par.guid].push(p); return; }
        if (par) { dx.orphanParts++; if (p.gen) pset(p.ent, 'BIMC_Part', { ParentGlobalId: par.gid || null, ParentElementId: par.elementId || par.guid }, p.guid, true); }
        if (p.storey !== null) (CONTAINED[p.storey] = CONTAINED[p.storey] || []).push(p.ent); else BLDCONT.push(p.ent);
      });
    }
    groupOrder.forEach(function (gk) {
      var g = GROUPS[gk], lp = ent('IFCLOCALPLACEMENT(' + STOREY_LP[g.storey] + ',' + ent('IFCAXIS2PLACEMENT3D(' + g.first + ',$,$)') + ')');
      var asm = ent('IFCELEMENTASSEMBLY(' + str(gid(g.base)) + ',' + oh + ',' + str('Connection assembly ' + g.base) + ',$,' + str('Steel connection (rule-based)') + ',' + lp + ',$,$,.NOTDEFINED.,.NOTDEFINED.)');
      ent('IFCRELAGGREGATES(' + str(gid('agg:' + g.base)) + ',' + oh + ',$,$,' + asm + ',(' + g.parts.join(',') + '))'); (CONTAINED[g.storey] = CONTAINED[g.storey] || []).push(asm); classes.IfcElementAssembly = (classes.IfcElementAssembly || 0) + 1;
    });
    AGGO.sort().forEach(function (pg) { var kids = AGG[pg].slice().sort(function (a, b) { return a.guid < b.guid ? -1 : a.guid > b.guid ? 1 : 0; }); ent('IFCRELAGGREGATES(' + str(gid('parts:' + pg)) + ',' + oh + ',$,$,' + WR[pg][0] + ',(' + kids.map(function (k) { return k.ent; }).join(',') + '))'); dx.aggregates++; });
    Object.keys(MATS).sort().forEach(function (nm) { if (MATS[nm].els.length) ent('IFCRELASSOCIATESMATERIAL(' + str(gid('mat:' + nm)) + ',' + oh + ',$,$,(' + MATS[nm].els.join(',') + '),' + MATS[nm].id + ')'); });
    Object.keys(CONTAINED).sort().forEach(function (nm) { ent('IFCRELCONTAINEDINSPATIALSTRUCTURE(' + str(gid('cont:' + nm)) + ',' + oh + ',$,$,(' + CONTAINED[nm].join(',') + '),' + STOREYS[nm] + ')'); });
    if (BLDCONT.length) ent('IFCRELCONTAINEDINSPATIALSTRUCTURE(' + str(gid('cont:building')) + ',' + oh + ',$,$,(' + BLDCONT.join(',') + '),' + bld + ')');
    ent('IFCRELAGGREGATES(' + str(gid('agg-bs')) + ',' + oh + ',$,$,' + bld + ',(' + Object.keys(STOREYS).sort().map(function (k) { return STOREYS[k]; }).join(',') + '))');
    flush();
    var parts = [header].concat(chunks, ['ENDSEC;\nEND-ISO-10303-21;\n']), total = 0; parts.forEach(function (p) { total += p.length; });
    res.ok = true; res.parts = parts; res.chars = total; res.schema = SCHEMA; res.stats = { elements: n, skipped: skipped, classes: classes, split: split, mixed: mixed, mesh: mesh, storeys: Object.keys(STOREYS).length, untraced: untraced, parts: nParts, frame: hasFrame ? 'given' : 'DB frame as is', entities: nid };
    if (ANY) { res.stats.byClass = gen.byClass; res.stats.proxied = gen.proxied; res.stats.generalised = gen.generalised; res.stats.noStorey = gen.noStorey; res.stats.storeysNoElevation = noElev.slice().sort(); res.stats.written = gen.written; res.stats.styles = Object.keys(STYLES).length;
      res.stats.partClasses = dx.partClasses; res.stats.assemblies = groupOrder.length; res.stats.materials = Object.keys(MATS).filter(function (k) { return MATS[k].els.length; }).length; res.stats.noMaterial = dx.noMaterial; res.stats.psets = dx.psets; res.stats.props = dx.props;
      res.stats.aggregates = dx.aggregates; res.stats.orphanParts = dx.orphanParts; res.stats.gidKept = dx.gidKept; res.stats.gidDerived = dx.gidDerived; res.stats.partsAsGeneric = dx.partsAsGeneric; }
    return res;
  }
  function build(elements, opts) { return drain(buildSteps(elements, opts)); }
  function textOf(res) { return res.parts.join(''); }

  return { buildSteps: buildSteps, build: build, textOf: textOf, validateFrame: validateFrame, gidOf: gidOf, compress: compress, sha1: sha1, uuid5Bytes: uuid5Bytes, statedDias: statedDias, statedLen: statedLen, statedCounts: statedCounts, fmtG: fmtG, thicknessMm: thicknessMm };
});
