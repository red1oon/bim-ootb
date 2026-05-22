/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// rates.js — Rate template loader + fallback hardcoded CIDB 2024 data
// Implementing MEP_5D_QTO.md §1.1–1.2 — Witness: W-QTO_RATES
// Used by: boq_charts.html, variation_order.js, nlp.js
// Do NOT duplicate these constants — import this file instead.

// ============================================================================
// RATE TEMPLATE METADATA (populated after JSON load, null = hardcoded fallback)
// ============================================================================
var RATE_TEMPLATE_META = null;
var RATE_TEMPLATE_NAME = null;  // e.g. 'cidb2024_my'

// ============================================================================
// CIDB 2024 MATERIAL RATES — hardcoded fallback (from boq_export.py)
// ============================================================================
var RATES = {
  IfcDuct:{rate:165,unit:'M',desc:'Galvanized Steel Ductwork (avg 400mm)'},
  IfcDuctSegment:{rate:165,unit:'M',desc:'Ductwork Segment'},
  IfcDuctFitting:{rate:380,unit:'EA',desc:'Duct Fittings (elbows, tees)'},
  IfcPipe:{rate:48.5,unit:'M',desc:'PVC/HDPE Pipe (avg 100mm)'},
  IfcPipeSegment:{rate:48.5,unit:'M',desc:'Pipe Segment'},
  IfcPipeFitting:{rate:95,unit:'EA',desc:'Pipe Fittings'},
  IfcCableCarrier:{rate:78,unit:'M',desc:'Cable Tray System (300mm)'},
  IfcCableCarrierSegment:{rate:78,unit:'M',desc:'Cable Tray Segment'},
  IfcBeam:{rate:680,unit:'M',desc:'Structural Steel I-Beam'},
  IfcColumn:{rate:1250,unit:'M',desc:'Structural Steel Column'},
  IfcSlab:{rate:285,unit:'M2',desc:'RC Slab 250mm'},
  IfcWall:{rate:145,unit:'M2',desc:'Blockwork Wall 150mm'},
  IfcWallStandardCase:{rate:145,unit:'M2',desc:'Standard Wall'},
  IfcCurtainWall:{rate:750,unit:'M2',desc:'Curtain Wall'},
  IfcCovering:{rate:185,unit:'M2',desc:'Floor/Ceiling Finish'},
  IfcRoof:{rate:238,unit:'M2',desc:'Metal Roof'},
  IfcLightFixture:{rate:485,unit:'EA',desc:'LED Light Fixture'},
  IfcOutlet:{rate:125,unit:'EA',desc:'Power Outlet'},
  IfcDoor:{rate:2850,unit:'EA',desc:'Door Set'},
  IfcWindow:{rate:1580,unit:'EA',desc:'Window'},
  IfcBuildingElementProxy:{rate:850,unit:'EA',desc:'Misc Element'},
  IfcFlowTerminal:{rate:3500,unit:'EA',desc:'HVAC Terminal'},
  IfcFurnishingElement:{rate:1200,unit:'EA',desc:'Furniture'},
  IfcPlate:{rate:95,unit:'M2',desc:'Steel Plate'},
  IfcMember:{rate:320,unit:'M',desc:'Steel Member'},
  IfcRailing:{rate:280,unit:'M',desc:'Railing'},
  IfcStair:{rate:4500,unit:'EA',desc:'Staircase'},
  IfcStairFlight:{rate:2200,unit:'EA',desc:'Stair Flight'},
  IfcFooting:{rate:320,unit:'EA',desc:'Foundation Footing'},
  IfcPile:{rate:850,unit:'EA',desc:'Foundation Pile'},
  IfcReinforcingBar:{rate:45,unit:'KG',desc:'Reinforcing Steel'},
  IfcFlowSegment:{rate:120,unit:'M',desc:'Flow Segment'},
  IfcFlowFitting:{rate:200,unit:'EA',desc:'Flow Fitting'},
  IfcFlowController:{rate:450,unit:'EA',desc:'Flow Controller'},
  IfcEnergyConversionDevice:{rate:8500,unit:'EA',desc:'Energy Conversion Device'},
  IfcFlowTreatmentDevice:{rate:1200,unit:'EA',desc:'Flow Treatment Device'},
  IfcFlowMovingDevice:{rate:3500,unit:'EA',desc:'Flow Moving Device'},
  IfcFlowStorageDevice:{rate:5000,unit:'EA',desc:'Flow Storage Device'},
  IfcElectricAppliance:{rate:485,unit:'EA',desc:'Electric Appliance'},
  IfcFurniture:{rate:1500,unit:'EA',desc:'Furniture'},
  IfcOpeningElement:{rate:0,unit:'EA',desc:'Opening (void)'},
  IfcDistributionElement:{rate:500,unit:'EA',desc:'Distribution Element'},
  IfcFireSuppressionTerminal:{rate:450,unit:'EA',desc:'Fire Sprinkler Head'},
  IfcAirTerminal:{rate:380,unit:'EA',desc:'Air Diffuser/Grille'},
  IfcValve:{rate:280,unit:'EA',desc:'Pipe Valve'},
  IfcAlarm:{rate:350,unit:'EA',desc:'Fire Alarm Device'},
  IfcController:{rate:1200,unit:'EA',desc:'Building Controller'},
  IfcRamp:{rate:3200,unit:'EA',desc:'Ramp'},
  IfcRampFlight:{rate:3500,unit:'EA',desc:'Ramp Flight'},
  IfcBuildingElementPart:{rate:0,unit:'EA',desc:'Building Element Part'},
};
var RATES_DEFAULT = {rate:500,unit:'EA',desc:'Misc Element'};

// Helper: get rate value for an IFC class
function getRate(ifcClass) {
  var r = RATES[ifcClass];
  return r ? r.rate : RATES_DEFAULT.rate;
}

// Helper: get SMM section for an IFC class (populated from JSON template)
function getSMMSection(ifcClass) {
  var r = RATES[ifcClass];
  return r && r.smm_section ? r.smm_section : '';
}

// ============================================================================
// LABOR RATES — hardcoded fallback (from boq_export.py)
// ============================================================================
var LABOR_RATES = {
  HVAC_TECH: {
    rate_per_day: 185, crew_size: 2, trade: 'HVAC Technician (Skilled)',
    productivity: {IfcDuct:18,IfcDuctSegment:18,IfcDuctFitting:12,IfcFlowMovingDevice:4,IfcEnergyConversionDevice:3,IfcFlowTerminal:12,IfcAirTerminal:20}
  },
  PLUMBER: {
    rate_per_day: 165, crew_size: 2, trade: 'Pipefitter (Skilled)',
    productivity: {IfcPipe:25,IfcPipeSegment:25,IfcPipeFitting:15,IfcFlowSegment:20,IfcFlowFitting:15,IfcFlowStorageDevice:4,IfcFlowTreatmentDevice:4,IfcDistributionElement:8,IfcValve:20,IfcFireSuppressionTerminal:25}
  },
  ELECTRICIAN: {
    rate_per_day: 175, crew_size: 2, trade: 'Electrician (Skilled)',
    productivity: {IfcCableCarrier:30,IfcCableCarrierSegment:30,IfcLightFixture:20,IfcOutlet:25,IfcElectricAppliance:15,IfcFlowController:10,IfcAlarm:25,IfcController:10}
  },
  STEEL_ERECTOR: {
    rate_per_day: 195, crew_size: 4, trade: 'Steel Erector (Skilled)',
    productivity: {IfcBeam:8,IfcColumn:6,IfcPlate:12,IfcMember:10}
  },
  CONCRETE_GANG: {
    rate_per_day: 145, crew_size: 6, trade: 'Concrete Gang (Mixed)',
    productivity: {IfcSlab:35,IfcFooting:6,IfcPile:4,IfcReinforcingBar:50,IfcRamp:3,IfcRampFlight:3}
  },
  MASON: {
    rate_per_day: 155, crew_size: 3, trade: 'Mason (Skilled) + Laborers',
    productivity: {IfcWall:12,IfcWallStandardCase:12,IfcOpeningElement:20,IfcBuildingElementPart:15}
  },
  CARPENTER: {
    rate_per_day: 165, crew_size: 2, trade: 'Carpenter (Skilled)',
    productivity: {IfcDoor:6,IfcWindow:6,IfcStair:2,IfcStairFlight:3,IfcRailing:15,IfcCurtainWall:8}
  },
  ROOFER: {
    rate_per_day: 175, crew_size: 3, trade: 'Roofer (Skilled)',
    productivity: {IfcRoof:25}
  },
  FINISHER: {
    rate_per_day: 135, crew_size: 2, trade: 'Finisher (Skilled)',
    productivity: {IfcCovering:20,IfcFurniture:8,IfcFurnishingElement:8}
  },
  LABORER: {
    rate_per_day: 95, crew_size: 1, trade: 'General Laborer',
    productivity: {}
  },
};

// ============================================================================
// EQUIPMENT RATES & ALLOCATION — hardcoded fallback (from boq_export.py)
// ============================================================================
var EQUIPMENT_RATES = {
  MOBILE_CRANE_20T: {rate_per_day:1850, desc:'Mobile Crane 20 Tonne'},
  TOWER_CRANE: {rate_per_day:2200, desc:'Tower Crane'},
  CONCRETE_PUMP: {rate_per_day:950, desc:'Concrete Pump Truck'},
  SCISSOR_LIFT_8M: {rate_per_day:285, desc:'Scissor Lift 8m'},
  WELDING_MACHINE: {rate_per_day:65, desc:'Welding Machine 300A'},
  GENERATOR_5KVA: {rate_per_day:95, desc:'Generator 5KVA'},
};
var EQUIPMENT_ALLOCATION = {
  IfcBeam: {equipment:'MOBILE_CRANE_20T', duration_factor:0.5},
  IfcColumn: {equipment:'MOBILE_CRANE_20T', duration_factor:0.5},
  IfcSlab: {equipment:'CONCRETE_PUMP', duration_factor:0.3},
  IfcDuct: {equipment:'SCISSOR_LIFT_8M', duration_factor:0.4},
  IfcCableCarrier: {equipment:'SCISSOR_LIFT_8M', duration_factor:0.3},
};

// ============================================================================
// SEQUENCE RULES — hardcoded fallback (from schedule_generator.py — for 4D)
// ============================================================================
var SEQUENCE_RULES = {
  // Substructure
  IfcFooting:{phase:'Substructure',sequence:1,resource:'CONCRETE_GANG'},
  IfcReinforcingBar:{phase:'Substructure',sequence:1,resource:'CONCRETE_GANG'},
  // Superstructure
  IfcColumn:{phase:'Superstructure',sequence:2,resource:'STEEL_ERECTOR'},
  IfcBeam:{phase:'Superstructure',sequence:3,resource:'STEEL_ERECTOR'},
  IfcSlab:{phase:'Superstructure',sequence:4,resource:'CONCRETE_GANG'},
  IfcPlate:{phase:'Superstructure',sequence:4,resource:'STEEL_ERECTOR'},
  IfcMember:{phase:'Superstructure',sequence:3,resource:'STEEL_ERECTOR'},
  // MEP Rough-in
  IfcDuct:{phase:'MEP Rough-in',sequence:5,resource:'HVAC_TECH'},
  IfcDuctSegment:{phase:'MEP Rough-in',sequence:5,resource:'HVAC_TECH'},
  IfcDuctFitting:{phase:'MEP Rough-in',sequence:5,resource:'HVAC_TECH'},
  IfcPipe:{phase:'MEP Rough-in',sequence:5,resource:'PLUMBER'},
  IfcPipeSegment:{phase:'MEP Rough-in',sequence:5,resource:'PLUMBER'},
  IfcPipeFitting:{phase:'MEP Rough-in',sequence:5,resource:'PLUMBER'},
  IfcCableCarrier:{phase:'MEP Rough-in',sequence:5,resource:'ELECTRICIAN'},
  IfcCableCarrierSegment:{phase:'MEP Rough-in',sequence:5,resource:'ELECTRICIAN'},
  IfcFlowSegment:{phase:'MEP Rough-in',sequence:5,resource:'PLUMBER'},
  IfcFlowFitting:{phase:'MEP Rough-in',sequence:5,resource:'PLUMBER'},
  IfcFlowController:{phase:'MEP Rough-in',sequence:5,resource:'ELECTRICIAN'},
  IfcFlowMovingDevice:{phase:'MEP Rough-in',sequence:5,resource:'HVAC_TECH'},
  IfcFlowStorageDevice:{phase:'MEP Rough-in',sequence:5,resource:'PLUMBER'},
  IfcFlowTreatmentDevice:{phase:'MEP Rough-in',sequence:5,resource:'PLUMBER'},
  IfcEnergyConversionDevice:{phase:'MEP Rough-in',sequence:5,resource:'HVAC_TECH'},
  IfcDistributionElement:{phase:'MEP Rough-in',sequence:5,resource:'PLUMBER'},
  IfcValve:{phase:'MEP Rough-in',sequence:5,resource:'PLUMBER'},
  // MEP Final
  IfcFireSuppressionTerminal:{phase:'MEP Final',sequence:9,resource:'PLUMBER'},
  IfcAirTerminal:{phase:'MEP Final',sequence:9,resource:'HVAC_TECH'},
  IfcAlarm:{phase:'MEP Final',sequence:9,resource:'ELECTRICIAN'},
  IfcController:{phase:'MEP Final',sequence:9,resource:'ELECTRICIAN'},
  // Architecture
  IfcWall:{phase:'Architecture',sequence:6,resource:'MASON'},
  IfcWallStandardCase:{phase:'Architecture',sequence:6,resource:'MASON'},
  IfcOpeningElement:{phase:'Architecture',sequence:6,resource:'MASON'},
  IfcBuildingElementPart:{phase:'Architecture',sequence:6,resource:'MASON'},
  IfcDoor:{phase:'Architecture',sequence:7,resource:'CARPENTER'},
  IfcWindow:{phase:'Architecture',sequence:7,resource:'CARPENTER'},
  IfcStair:{phase:'Architecture',sequence:7,resource:'CARPENTER'},
  IfcStairFlight:{phase:'Architecture',sequence:7,resource:'CARPENTER'},
  IfcRailing:{phase:'Architecture',sequence:7,resource:'CARPENTER'},
  IfcRamp:{phase:'Architecture',sequence:7,resource:'CONCRETE_GANG'},
  IfcRampFlight:{phase:'Architecture',sequence:7,resource:'CONCRETE_GANG'},
  IfcRoof:{phase:'Architecture',sequence:8,resource:'ROOFER'},
  IfcBuildingElementProxy:{phase:'Architecture',sequence:6,resource:null},
  IfcCurtainWall:{phase:'Architecture',sequence:7,resource:'CARPENTER'},
  // MEP Final
  IfcLightFixture:{phase:'MEP Final',sequence:9,resource:'ELECTRICIAN'},
  IfcOutlet:{phase:'MEP Final',sequence:9,resource:'ELECTRICIAN'},
  IfcElectricAppliance:{phase:'MEP Final',sequence:9,resource:'ELECTRICIAN'},
  IfcFlowTerminal:{phase:'MEP Final',sequence:9,resource:'HVAC_TECH'},
  // Finishes
  IfcCovering:{phase:'Finishes',sequence:10,resource:'FINISHER'},
  IfcFurniture:{phase:'Finishes',sequence:11,resource:'FINISHER'},
  IfcFurnishingElement:{phase:'Finishes',sequence:11,resource:'FINISHER'},
};
var SEQUENCE_DEFAULT = {phase:'Architecture',sequence:6,resource:null};

// Helper: get phase for an IFC class
function getPhase(ifcClass) {
  var r = SEQUENCE_RULES[ifcClass];
  return r ? r.phase : SEQUENCE_DEFAULT.phase;
}

// Helper: get productivity (elements/day) for an IFC class
function getProductivity(ifcClass) {
  // Derive from LABOR_RATES productivity maps
  for (var key in LABOR_RATES) {
    var lr = LABOR_RATES[key];
    if (lr.productivity && lr.productivity[ifcClass] !== undefined) {
      return lr.productivity[ifcClass];
    }
  }
  return 10; // default
}

// ============================================================================
// WORK PACKAGES — IFC class → construction phase mapping
// ============================================================================
var WORK_PACKAGES = [
  { id: 'PACKAGE 1', name: 'SUBSTRUCTURE', color: '8E44AD',
    classes: ['IfcFooting','IfcPile','IfcReinforcingBar'] },
  { id: 'PACKAGE 2', name: 'SUPERSTRUCTURE', color: '2980B9',
    classes: ['IfcColumn','IfcBeam','IfcSlab','IfcPlate','IfcMember'] },
  { id: 'PACKAGE 3', name: 'MEP ROUGH-IN', color: 'D35400',
    classes: ['IfcDuct','IfcDuctSegment','IfcDuctFitting','IfcPipe','IfcPipeSegment','IfcPipeFitting','IfcCableCarrier','IfcCableCarrierSegment','IfcFlowSegment','IfcFlowFitting','IfcFlowController','IfcFlowMovingDevice','IfcFlowStorageDevice','IfcFlowTreatmentDevice','IfcEnergyConversionDevice','IfcDistributionElement','IfcValve'] },
  { id: 'PACKAGE 4', name: 'ARCHITECTURE', color: 'ED7D31',
    classes: ['IfcWall','IfcWallStandardCase','IfcCurtainWall','IfcDoor','IfcWindow','IfcStair','IfcStairFlight','IfcRailing','IfcRoof','IfcRamp','IfcRampFlight'] },
  { id: 'PACKAGE 5', name: 'FINISHES', color: '27AE60',
    classes: ['IfcCovering','IfcFurniture','IfcFurnishingElement'] },
  { id: 'PACKAGE 6', name: 'MEP FINAL FIX', color: 'C0392B',
    classes: ['IfcFlowTerminal','IfcLightFixture','IfcOutlet','IfcElectricAppliance','IfcFireSuppressionTerminal','IfcAirTerminal','IfcAlarm','IfcController'] },
];

// ============================================================================
// DISCIPLINE + PHASE COLORS
// ============================================================================
var DISC_COLORS = {
  ARC:'#4488ff',STR:'#44cccc',MEP:'#44cc44',ELEC:'#cccc44',FP:'#cc8844',
  ACMV:'#cc4444',PLB:'#8844cc',HVAC:'#44aacc',SAN:'#aa44aa',VENT:'#88ccaa',
};
var PHASE_COLORS = {
  'Substructure':'#A5A5A5','Superstructure':'#4472C4','MEP Rough-in':'#70AD47',
  'Architecture':'#ED7D31','MEP Final':'#5B9BD5','Finishes':'#FFC000',
  'Commissioning':'#C55A11','Unknown':'#888888',
};

// ============================================================================
// COST CALCULATION FUNCTIONS
// ============================================================================
function calcLabor(ifcClass, qty) {
  for (var key in LABOR_RATES) {
    var lr = LABOR_RATES[key];
    if (lr.productivity && lr.productivity[ifcClass] !== undefined) {
      var prod = lr.productivity[ifcClass];
      var days = qty / prod;
      var cost = days * lr.crew_size * lr.rate_per_day;
      return {cost: Math.round(cost), days: days, crew: lr.crew_size, trade: lr.trade, tradeKey: key, prod: prod};
    }
  }
  return {cost: 0, days: 0, crew: 0, trade: '', tradeKey: null, prod: 10};
}

function calcEquipment(ifcClass, laborDays) {
  var alloc = EQUIPMENT_ALLOCATION[ifcClass];
  if (!alloc) return {cost: 0, desc: '', days: 0};
  var er = EQUIPMENT_RATES[alloc.equipment];
  var days = laborDays * alloc.duration_factor;
  return {cost: Math.round(days * er.rate_per_day), desc: er.desc, days: days};
}

// ============================================================================
// §1.2 JSON RATE TEMPLATE LOADER
// URL param: ?rates=cidb2024_my → fetches rates/cidb2024_my.json
// Default: cidb2024_my if no param
// Backward compatible: if JSON fetch fails, hardcoded objects above remain
// ============================================================================

/**
 * Load a rate template from JSON. Overwrites global RATES, LABOR_RATES, etc.
 * @param {string} templateName - e.g. 'cidb2024_my'
 * @returns {Promise<boolean>} true if loaded, false if fell back to hardcoded
 */
function loadRateTemplate(templateName) {
  var url = 'rates/' + templateName + '.json';
  return fetch(url).then(function(resp) {
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return resp.json();
  }).then(function(tpl) {
    // Apply materials → RATES (merge: JSON wins, keep hardcoded keys not in JSON)
    if (tpl.materials && Object.keys(tpl.materials).length > 0) {
      for (var cls in tpl.materials) {
        RATES[cls] = tpl.materials[cls];
      }
    }
    // Apply labor → LABOR_RATES
    if (tpl.labor && Object.keys(tpl.labor).length > 0) {
      for (var lk in tpl.labor) {
        LABOR_RATES[lk] = tpl.labor[lk];
      }
    }
    // Apply equipment → EQUIPMENT_RATES
    if (tpl.equipment && Object.keys(tpl.equipment).length > 0) {
      for (var ek in tpl.equipment) {
        EQUIPMENT_RATES[ek] = tpl.equipment[ek];
      }
    }
    // Apply equipment_allocation → EQUIPMENT_ALLOCATION
    if (tpl.equipment_allocation && Object.keys(tpl.equipment_allocation).length > 0) {
      for (var ak in tpl.equipment_allocation) {
        EQUIPMENT_ALLOCATION[ak] = tpl.equipment_allocation[ak];
      }
    }
    // Apply sequence → SEQUENCE_RULES (only if non-empty — UK placeholder has empty)
    if (tpl.sequence && Object.keys(tpl.sequence).length > 0) {
      for (var sk in tpl.sequence) {
        SEQUENCE_RULES[sk] = tpl.sequence[sk];
      }
    }
    // Apply work_packages → WORK_PACKAGES (only if non-empty)
    if (tpl.work_packages && tpl.work_packages.length > 0) {
      WORK_PACKAGES = tpl.work_packages;
    }
    // Store metadata + provisions
    RATE_TEMPLATE_META = tpl.meta || null;
    if (RATE_TEMPLATE_META && tpl.provisions) {
      RATE_TEMPLATE_META.provisions = tpl.provisions;
    }
    if (RATE_TEMPLATE_META && tpl.smm_sections) {
      RATE_TEMPLATE_META.smm_sections = tpl.smm_sections;
    }
    RATE_TEMPLATE_NAME = templateName;

    // Sync _TRL currency from rate template — authoritative source for currency
    // Covers the case where locale file didn't load but rate JSON did
    if (typeof _TRL !== 'undefined' && tpl.meta) {
      if (tpl.meta.currency) _TRL.cur = tpl.meta.currency;
      if (tpl.meta.currency2) _TRL.cur2 = tpl.meta.currency2;
      if (tpl.meta.exchange_rate) _TRL.cur_rate = tpl.meta.exchange_rate;
    }

    var classCount = Object.keys(RATES).length;
    console.log('§QTO_RATES_LOADED template=' + templateName + ' classes=' + classCount
      + ' cur=' + (tpl.meta ? tpl.meta.currency : '?')
      + ' source=' + (tpl.meta ? tpl.meta.source : 'unknown'));
    return true;
  }).catch(function(err) {
    console.warn('§QTO_RATES_FALLBACK template=' + templateName + ' error=' + err.message
      + ' — using hardcoded CIDB 2024 rates');
    RATE_TEMPLATE_NAME = 'hardcoded_cidb2024';
    return false;
  });
}

// Locale → rate template mapping (locale code → JSON file name without .json)
var LOCALE_RATE_MAP = {
  'en_MY': 'cidb2024_my', 'ms_MY': 'cidb2024_my',
  'en_GB': 'bcis2024_uk', 'en_US': 'rsmeans2024_us', 'en_AU': 'rawlinsons2024_au',
  'de_DE': 'bki2024_de', 'fr_FR': 'untec2024_fr', 'es_ES': 'cype2024_es',
  'zh_CN': 'gb50500_cn', 'th_TH': 'dpt2024_th', 'ja_JP': 'jbci2024_jp',
  'ko_KR': 'kict2024_kr', 'ar_SA': 'aramco2024_sa', 'pt_BR': 'sinapi2024_br',
  'id_ID': 'sni2024_id', 'af_ZA': 'asaqs2024_za', 'bn_BD': 'pwd2024_bd',
  'bl_BD': 'pwd2024_bd'
};

/**
 * Auto-load rate template from URL param or active locale.
 * Priority: ?rates= param > locale-based mapping > cidb2024_my fallback
 * @returns {Promise<boolean>}
 */
function initRateTemplate() {
  var p = new URLSearchParams(window.location.search);
  var name = p.get('rates');
  if (!name) {
    // Derive from active locale (same detection as locale_loader)
    var locale = p.get('lang');
    if (!locale) {
      try { var cfg = JSON.parse(localStorage.getItem('bim_ootb_config')); if (cfg && cfg.locale) locale = cfg.locale; } catch(e) {}
    }
    if (locale && LOCALE_RATE_MAP[locale]) {
      name = LOCALE_RATE_MAP[locale];
    } else {
      name = 'cidb2024_my';
    }
  }
  console.log('§RATE_LOCALE_MAP locale=' + (locale||'default') + ' template=' + name);
  return loadRateTemplate(name);
}
