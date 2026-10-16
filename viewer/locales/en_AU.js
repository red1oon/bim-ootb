// en_AU.js — English (Australia) — AUD locale
// ISO 3166-1: AU — Flag: 🇦🇺
// To create your project locale: copy this file → MyProject_TRL.js → edit what differs
//

// S226 §R2 (2026-10-03): the LABEL strings moved out of this file into iDempiere-format XML —
// viewer/i18n/AD_Message_Trl_en_AU.xml (base English: viewer/i18n/ad_message_base.csv). This file keeps the
// COST data only: currency, rate-book attribution, rates. Loaded by locale_loader.js beside i18n/en_AU.json.

var _TRL_LOCALE = {

  // ── Identity ──
  iso: 'AU',            // ISO 3166-1 alpha-2 (drives flag emoji)
  lang: 'en',           // ISO 639-1 language
  locale: 'en_AU',      // combined

  // ── Currency ──
  cur: 'A$',
  cur2: 'USD',
  cur_rate: 1.39,         // 1 USD = 1.54 AUD
  cur_name: 'Australian Dollar',
  cur2_name: 'US Dollar',

  // ── Rate source attribution ──
  rate_source:       'Rawlinsons Australian Construction Handbook 2024',
  rate_year:         '2024',
  rate_mat_source:   'Rawlinsons Australian Construction Handbook 2024',
  rate_mat_ref:      'Rawlinsons 2024 Edition 32 (current year)',
  rate_mat_includes: 'Delivery, wastage allowance (5-10% by material type)',
  rate_lab_source:   'Fair Work Australia — Building & Construction General On-site Award 2024',
  rate_lab_basis:    'Base rate + 40% (superannuation 11.5%, leave loading, allowances, insurance)',
  rate_lab_prod:     'Rawlinsons productivity standards by trade',
  rate_lab_crew:     'Tradespersons + labourers as per trade standards',
  rate_eq_source:    'Rawlinsons Plant & Equipment Hire Rates 2024',
  rate_eq_alloc:     'Based on work type and duration requirements',
  rate_eq_basis:     'Per day (8 hours), operator cost included where stated',

  // ── Material Rates (Rawlinsons 2024, AUD) ──
  rates: {
    IfcDuct:{rate:285,unit:'M',desc:'Galvanised Steel Ductwork (avg 400mm)'},
    IfcDuctSegment:{rate:285,unit:'M',desc:'Ductwork Segment'},
    IfcDuctFitting:{rate:650,unit:'EA',desc:'Duct Fittings (elbows, tees)'},
    IfcPipe:{rate:82,unit:'M',desc:'PVC/HDPE Pipe (avg 100mm)'},
    IfcPipeSegment:{rate:82,unit:'M',desc:'Pipe Segment'},
    IfcPipeFitting:{rate:165,unit:'EA',desc:'Pipe Fittings'},
    IfcCableCarrier:{rate:135,unit:'M',desc:'Cable Tray System (300mm)'},
    IfcCableCarrierSegment:{rate:135,unit:'M',desc:'Cable Tray Segment'},
    IfcBeam:{rate:1150,unit:'M',desc:'Structural Steel I-Beam'},
    IfcColumn:{rate:2100,unit:'M',desc:'Structural Steel Column'},
    IfcSlab:{rate:485,unit:'M2',desc:'RC Slab 250mm'},
    IfcWall:{rate:245,unit:'M2',desc:'Blockwork Wall 150mm'},
    IfcWallStandardCase:{rate:245,unit:'M2',desc:'Standard Wall'},
    IfcCurtainWall:{rate:1280,unit:'M2',desc:'Curtain Wall'},
    IfcCovering:{rate:315,unit:'M2',desc:'Floor/Ceiling Finish'},
    IfcRoof:{rate:395,unit:'M2',desc:'Metal Roof'},
    IfcLightFixture:{rate:820,unit:'EA',desc:'LED Light Fixture'},
    IfcOutlet:{rate:215,unit:'EA',desc:'Power Outlet'},
    IfcDoor:{rate:4850,unit:'EA',desc:'Door Set'},
    IfcWindow:{rate:2650,unit:'EA',desc:'Window'},
    IfcBuildingElementProxy:{rate:1450,unit:'EA',desc:'Misc Element'},
    IfcFlowTerminal:{rate:5800,unit:'EA',desc:'HVAC Terminal'},
    IfcFurnishingElement:{rate:2050,unit:'EA',desc:'Furniture'},
    IfcFurniture:{rate:2500,unit:'EA',desc:'Furniture'},
    IfcPlate:{rate:165,unit:'M2',desc:'Steel Plate'},
    IfcMember:{rate:540,unit:'M',desc:'Steel Member'},
    IfcRailing:{rate:480,unit:'M',desc:'Railing'},
    IfcStair:{rate:7500,unit:'EA',desc:'Staircase'},
    IfcStairFlight:{rate:3650,unit:'EA',desc:'Stair Flight'},
    IfcFooting:{rate:540,unit:'EA',desc:'Foundation Footing'},
    IfcPile:{rate:1450,unit:'EA',desc:'Foundation Pile'},
    IfcReinforcingBar:{rate:75,unit:'KG',desc:'Reinforcing Steel'},
    IfcFlowSegment:{rate:205,unit:'M',desc:'Flow Segment'},
    IfcFlowFitting:{rate:340,unit:'EA',desc:'Flow Fitting'},
    IfcFlowController:{rate:760,unit:'EA',desc:'Flow Controller'},
    IfcEnergyConversionDevice:{rate:14500,unit:'EA',desc:'Energy Conversion Device'},
    IfcFlowTreatmentDevice:{rate:2050,unit:'EA',desc:'Flow Treatment Device'},
    IfcFlowMovingDevice:{rate:5800,unit:'EA',desc:'Flow Moving Device'},
    IfcFlowStorageDevice:{rate:8500,unit:'EA',desc:'Flow Storage Device'},
    IfcElectricAppliance:{rate:820,unit:'EA',desc:'Electric Appliance'},
  },
  rates_default: {rate:850,unit:'EA',desc:'Misc Element'},

  // ── Labor Rates (Fair Work Award rates, AUD) ──
  labor_rates: {
    HVAC_TECH:     {rate_per_day:520, crew_size:2, trade:'HVAC Technician (CW/ECW 4)',
                    productivity:{IfcDuct:16,IfcDuctSegment:16,IfcDuctFitting:10}},
    PLUMBER:       {rate_per_day:485, crew_size:2, trade:'Plumber (Licensed)',
                    productivity:{IfcPipe:22,IfcPipeSegment:22,IfcPipeFitting:14}},
    ELECTRICIAN:   {rate_per_day:495, crew_size:2, trade:'Electrician (Licensed A-Grade)',
                    productivity:{IfcCableCarrier:28,IfcCableCarrierSegment:28,IfcLightFixture:18,IfcOutlet:22}},
    STEEL_ERECTOR: {rate_per_day:540, crew_size:4, trade:'Steel Erector (CW 4)',
                    productivity:{IfcBeam:7,IfcColumn:5}},
    CONCRETE_GANG: {rate_per_day:420, crew_size:6, trade:'Concrete Gang (Mixed)',
                    productivity:{IfcSlab:32}},
    MASON:         {rate_per_day:450, crew_size:3, trade:'Bricklayer (CW 4) + Labourers',
                    productivity:{IfcWall:10,IfcWallStandardCase:10}},
    LABORER:       {rate_per_day:320, crew_size:1, trade:'General Labourer (CW 1)',
                    productivity:{}},
  },

  // ── Equipment Rates (Rawlinsons hire rates, AUD) ──
  equipment_rates: {
    MOBILE_CRANE_20T: {rate_per_day:2850, desc:'Mobile Crane 20 Tonne'},
    TOWER_CRANE:      {rate_per_day:3500, desc:'Tower Crane'},
    CONCRETE_PUMP:    {rate_per_day:1650, desc:'Concrete Pump Truck'},
    SCISSOR_LIFT_8M:  {rate_per_day:450,  desc:'Scissor Lift 8m'},
    WELDING_MACHINE:  {rate_per_day:110,  desc:'Welding Machine 300A'},
    GENERATOR_5KVA:   {rate_per_day:165,  desc:'Generator 5KVA'},
  },
  equipment_allocation: {
    IfcBeam:         {equipment:'MOBILE_CRANE_20T', duration_factor:0.5},
    IfcColumn:       {equipment:'MOBILE_CRANE_20T', duration_factor:0.5},
    IfcSlab:         {equipment:'CONCRETE_PUMP',    duration_factor:0.3},
    IfcDuct:         {equipment:'SCISSOR_LIFT_8M',  duration_factor:0.4},
    IfcCableCarrier: {equipment:'SCISSOR_LIFT_8M',  duration_factor:0.3},
  },
};
