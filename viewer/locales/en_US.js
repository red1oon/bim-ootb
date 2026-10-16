// en_US.js — English (United States) — US locale
// ISO 3166-1: US
// To create your project locale: copy this file → MyProject_TRL.js → edit what differs
//

// S226 §R2 (2026-10-03): the LABEL strings moved out of this file into iDempiere-format XML —
// viewer/i18n/AD_Message_Trl_en_US.xml (base English: viewer/i18n/ad_message_base.csv). This file keeps the
// COST data only: currency, rate-book attribution, rates. Loaded by locale_loader.js beside i18n/en_US.json.

var _TRL_LOCALE = {

  // ── Identity ──
  iso: 'US',            // ISO 3166-1 alpha-2 (drives flag emoji)
  lang: 'en',           // ISO 639-1 language
  locale: 'en_US',      // combined

  // ── Currency ──
  cur: '$',
  cur2: 'RM',
  cur_rate: 0.26,         // 1 RM = 0.22 USD
  cur_name: 'US Dollar',
  cur2_name: 'Malaysian Ringgit',

  // ── Rate source attribution ──
  rate_source:       'RS Means 2024 / Construction Cost Data',
  rate_year:         '2024',
  rate_mat_source:   'RS Means Building Construction Cost Data 2024',
  rate_mat_ref:      'RS Means Square Foot / Assemblies 2024',
  rate_mat_includes: 'Delivery, wastage allowance (5-10% by material type)',
  rate_lab_source:   'Bureau of Labor Statistics / RS Means 2024',
  rate_lab_basis:    'Base wage + 65% (FICA 7.65%, insurance 20%, benefits 37%)',
  rate_lab_prod:     'RS Means productivity standards by trade',
  rate_lab_crew:     'Journeymen + apprentices as per trade standards',
  rate_eq_source:    'RS Means Equipment Cost Data 2024',
  rate_eq_alloc:     'Based on work type and duration requirements',
  rate_eq_basis:     'Per day (8 hours), operator cost included where stated',

  // ── Material Rates (RS Means 2024) ──
  rates: {
    IfcDuct:{rate:52,unit:'M',desc:'Galvanized Steel Ductwork (avg 400mm)'},
    IfcDuctSegment:{rate:52,unit:'M',desc:'Ductwork Segment'},
    IfcDuctFitting:{rate:115,unit:'EA',desc:'Duct Fittings (elbows, tees)'},
    IfcPipe:{rate:18,unit:'M',desc:'PVC/HDPE Pipe (avg 100mm)'},
    IfcPipeSegment:{rate:18,unit:'M',desc:'Pipe Segment'},
    IfcPipeFitting:{rate:32,unit:'EA',desc:'Pipe Fittings'},
    IfcCableCarrier:{rate:28,unit:'M',desc:'Cable Tray System (300mm)'},
    IfcCableCarrierSegment:{rate:28,unit:'M',desc:'Cable Tray Segment'},
    IfcBeam:{rate:285,unit:'M',desc:'Structural Steel I-Beam'},
    IfcColumn:{rate:520,unit:'M',desc:'Structural Steel Column'},
    IfcSlab:{rate:86,unit:'M2',desc:'RC Slab 250mm'},
    IfcWall:{rate:48,unit:'M2',desc:'CMU Wall 150mm'},
    IfcWallStandardCase:{rate:48,unit:'M2',desc:'Standard Wall'},
    IfcCurtainWall:{rate:540,unit:'M2',desc:'Curtain Wall'},
    IfcCovering:{rate:65,unit:'M2',desc:'Floor/Ceiling Finish'},
    IfcRoof:{rate:75,unit:'M2',desc:'Metal Roof'},
    IfcLightFixture:{rate:185,unit:'EA',desc:'LED Light Fixture'},
    IfcOutlet:{rate:42,unit:'EA',desc:'Power Outlet'},
    IfcDoor:{rate:1250,unit:'EA',desc:'Door Set'},
    IfcWindow:{rate:650,unit:'EA',desc:'Window'},
    IfcBuildingElementProxy:{rate:280,unit:'EA',desc:'Misc Element'},
    IfcFlowTerminal:{rate:1350,unit:'EA',desc:'HVAC Terminal'},
    IfcFurnishingElement:{rate:480,unit:'EA',desc:'Furniture'},
    IfcFurniture:{rate:620,unit:'EA',desc:'Furniture'},
    IfcPlate:{rate:38,unit:'M2',desc:'Steel Plate'},
    IfcMember:{rate:125,unit:'M',desc:'Steel Member'},
    IfcRailing:{rate:95,unit:'M',desc:'Railing'},
    IfcStair:{rate:3800,unit:'EA',desc:'Staircase'},
    IfcStairFlight:{rate:1850,unit:'EA',desc:'Stair Flight'},
    IfcFooting:{rate:240,unit:'EA',desc:'Foundation Footing'},
    IfcPile:{rate:650,unit:'EA',desc:'Foundation Pile'},
    IfcReinforcingBar:{rate:3.20,unit:'KG',desc:'Reinforcing Steel'},
    IfcFlowSegment:{rate:42,unit:'M',desc:'Flow Segment'},
    IfcFlowFitting:{rate:68,unit:'EA',desc:'Flow Fitting'},
    IfcFlowController:{rate:185,unit:'EA',desc:'Flow Controller'},
    IfcEnergyConversionDevice:{rate:4200,unit:'EA',desc:'Energy Conversion Device'},
    IfcFlowTreatmentDevice:{rate:520,unit:'EA',desc:'Flow Treatment Device'},
    IfcFlowMovingDevice:{rate:1450,unit:'EA',desc:'Flow Moving Device'},
    IfcFlowStorageDevice:{rate:2200,unit:'EA',desc:'Flow Storage Device'},
    IfcElectricAppliance:{rate:195,unit:'EA',desc:'Electric Appliance'},
  },
  rates_default: {rate:180,unit:'EA',desc:'Misc Element'},

  // ── Labor Rates ──
  labor_rates: {
    HVAC_TECH:     {rate_per_day:520, crew_size:2, trade:'HVAC Technician (Journeyman)',
                    productivity:{IfcDuct:15,IfcDuctSegment:15,IfcDuctFitting:10}},
    PLUMBER:       {rate_per_day:480, crew_size:2, trade:'Pipefitter (Journeyman)',
                    productivity:{IfcPipe:22,IfcPipeSegment:22,IfcPipeFitting:12}},
    ELECTRICIAN:   {rate_per_day:500, crew_size:2, trade:'Electrician (Journeyman)',
                    productivity:{IfcCableCarrier:28,IfcCableCarrierSegment:28,IfcLightFixture:18,IfcOutlet:22}},
    STEEL_ERECTOR: {rate_per_day:560, crew_size:4, trade:'Ironworker (Journeyman)',
                    productivity:{IfcBeam:6,IfcColumn:5}},
    CONCRETE_GANG: {rate_per_day:420, crew_size:6, trade:'Concrete Gang (Mixed)',
                    productivity:{IfcSlab:30}},
    MASON:         {rate_per_day:450, crew_size:3, trade:'Mason (Journeyman) + Laborers',
                    productivity:{IfcWall:10,IfcWallStandardCase:10}},
    LABORER:       {rate_per_day:280, crew_size:1, trade:'General Laborer',
                    productivity:{}},
  },

  // ── Equipment Rates ──
  equipment_rates: {
    MOBILE_CRANE_20T: {rate_per_day:3200, desc:'Mobile Crane 20 Ton'},
    TOWER_CRANE:      {rate_per_day:4500, desc:'Tower Crane'},
    CONCRETE_PUMP:    {rate_per_day:2400, desc:'Concrete Pump Truck'},
    SCISSOR_LIFT_8M:  {rate_per_day:450,  desc:'Scissor Lift 26ft'},
    WELDING_MACHINE:  {rate_per_day:120,  desc:'Welding Machine 300A'},
    GENERATOR_5KVA:   {rate_per_day:185,  desc:'Generator 5KVA'},
  },
  equipment_allocation: {
    IfcBeam:         {equipment:'MOBILE_CRANE_20T', duration_factor:0.5},
    IfcColumn:       {equipment:'MOBILE_CRANE_20T', duration_factor:0.5},
    IfcSlab:         {equipment:'CONCRETE_PUMP',    duration_factor:0.3},
    IfcDuct:         {equipment:'SCISSOR_LIFT_8M',  duration_factor:0.4},
    IfcCableCarrier: {equipment:'SCISSOR_LIFT_8M',  duration_factor:0.3},
  },
};
