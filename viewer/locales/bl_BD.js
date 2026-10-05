// bl_BD.js — Banglish (Romanized Bengali, Bangladesh)
// ISO 3166-1: BD — Flag: 🇧🇩 (badge: BL)
// Banglish = Bengali written in Roman script — common in SMS, chat, and informal tech use.
// Same currency and rate data as bn_BD; labels are transliterated Bengali (no script).
// To create your project locale: copy this file → MyProject_TRL.js → edit what differs
//

// S226 §R2 (2026-10-03): the LABEL strings moved out of this file into iDempiere-format XML —
// viewer/i18n/AD_Message_Trl_bl_BD.xml (base English: viewer/i18n/ad_message_base.csv). This file keeps the
// COST data only: currency, rate-book attribution, rates. Loaded by locale_loader.js beside i18n/bl_BD.json.

var _TRL_LOCALE = {

  // ── Identity ──
  iso: 'BD',            // ISO 3166-1 alpha-2 (drives flag emoji)
  lang: 'bl',           // custom lang tag for Banglish
  locale: 'bl_BD',      // combined

  // ── Currency ──
  cur: '৳',
  cur2: 'USD',
  cur_rate: 120,          // 1 USD = 110 BDT (2024)
  cur_name: 'Bangladeshi Taka',
  cur2_name: 'US Dollar',

  // ── Rate source attribution ──
  rate_source:       'PWD Schedule of Rates Bangladesh 2024',
  rate_year:         '2024',
  rate_mat_source:   'PWD — Gono Purto Bibhag Upokoron Mulyo 2024',
  rate_mat_ref:      'PWD Catalogue (+6% mulyosfiti samonwoy)',
  rate_mat_includes: 'Poribohon khorch, opochio bhata (5-8%)',
  rate_lab_source:   'Srom O Kormosonstan Montronaloy — Nirman Mojuri Suchi 2024',
  rate_lab_basis:    'Mul mojuri + 20% (PF, utshob bonus)',
  rate_lab_prod:     'PWD — Doinik utpadon man',
  rate_lab_crew:     'Dolneta + sahakari sonkha man onujayi',
  rate_eq_source:    'ICSB — Soronjam bhara har 2024',
  rate_eq_alloc:     'Kajer dhoron o meiad onujayi boraddo',
  rate_eq_basis:     'Protidin (8 ghonta), proyojyo khetre operator soho',

  // ── Material Rates (PWD Bangladesh 2024, same values as bn_BD) ──
  rates: {
    IfcDuct:{rate:2200,unit:'M',desc:'Galvanized steel duct (goro 400mm)'},
    IfcDuctSegment:{rate:2200,unit:'M',desc:'Duct segment'},
    IfcDuctFitting:{rate:5500,unit:'EA',desc:'Duct fitting (elbow, tee)'},
    IfcPipe:{rate:650,unit:'M',desc:'PVC/HDPE pipe (goro 100mm)'},
    IfcPipeSegment:{rate:650,unit:'M',desc:'Pipe segment'},
    IfcPipeFitting:{rate:1400,unit:'EA',desc:'Pipe fitting'},
    IfcCableCarrier:{rate:950,unit:'M',desc:'Cable tray (300mm)'},
    IfcCableCarrierSegment:{rate:950,unit:'M',desc:'Cable tray segment'},
    IfcBeam:{rate:9500,unit:'M',desc:'Structural steel I-beam'},
    IfcColumn:{rate:16000,unit:'M',desc:'Structural steel column'},
    IfcSlab:{rate:4200,unit:'M2',desc:'RC slab 250mm'},
    IfcWall:{rate:2200,unit:'M2',desc:'Brick/block deyal 150mm'},
    IfcWallStandardCase:{rate:2200,unit:'M2',desc:'Adarsha deyal'},
    IfcCurtainWall:{rate:18000,unit:'M2',desc:'Curtain wall'},
    IfcCovering:{rate:2800,unit:'M2',desc:'Floor/ceiling finishing'},
    IfcRoof:{rate:5500,unit:'M2',desc:'Metal roof sheet'},
    IfcLightFixture:{rate:6500,unit:'EA',desc:'LED alo'},
    IfcOutlet:{rate:1800,unit:'EA',desc:'Electric socket'},
    IfcDoor:{rate:35000,unit:'EA',desc:'Dorja set'},
    IfcWindow:{rate:22000,unit:'EA',desc:'Janala'},
    IfcBuildingElementProxy:{rate:12000,unit:'EA',desc:'Bibidho upodan'},
    IfcFlowTerminal:{rate:45000,unit:'EA',desc:'HVAC terminal'},
    IfcFurnishingElement:{rate:18000,unit:'EA',desc:'Asbabotra upodan'},
    IfcFurniture:{rate:22000,unit:'EA',desc:'Asbabotra'},
    IfcPlate:{rate:1400,unit:'M2',desc:'Steel plate'},
    IfcMember:{rate:4800,unit:'M',desc:'Steel profile'},
    IfcRailing:{rate:4200,unit:'M',desc:'Railing'},
    IfcStair:{rate:65000,unit:'EA',desc:'Shiri'},
    IfcStairFlight:{rate:32000,unit:'EA',desc:'Shiri flight'},
    IfcFooting:{rate:5500,unit:'EA',desc:'Footing vitti'},
    IfcPile:{rate:12000,unit:'EA',desc:'Pile'},
    IfcReinforcingBar:{rate:85,unit:'KG',desc:'Rod (rebar)'},
    IfcFlowSegment:{rate:1800,unit:'M',desc:'Flow segment'},
    IfcFlowFitting:{rate:2900,unit:'EA',desc:'Flow fitting'},
    IfcFlowController:{rate:6500,unit:'EA',desc:'Flow controller'},
    IfcEnergyConversionDevice:{rate:120000,unit:'EA',desc:'Energy conversion jontropotro'},
    IfcFlowTreatmentDevice:{rate:18000,unit:'EA',desc:'Treatment jontropotro'},
    IfcFlowMovingDevice:{rate:48000,unit:'EA',desc:'Fluid moving jontropotro'},
    IfcFlowStorageDevice:{rate:72000,unit:'EA',desc:'Fluid storage jontropotro'},
    IfcElectricAppliance:{rate:7500,unit:'EA',desc:'Electric jontropotro'},
  },
  rates_default: {rate:8000,unit:'EA',desc:'Bibidho upodan'},

  // ── Labor Rates ──
  labor_rates: {
    HVAC_TECH:     {rate_per_day:1100, crew_size:2, trade:'HVAC Technician (dokho)',
                    productivity:{IfcDuct:16,IfcDuctSegment:16,IfcDuctFitting:10}},
    PLUMBER:       {rate_per_day:850,  crew_size:2, trade:'Pipe mistri (dokho)',
                    productivity:{IfcPipe:23,IfcPipeSegment:23,IfcPipeFitting:13}},
    ELECTRICIAN:   {rate_per_day:900,  crew_size:2, trade:'Electrician (dokho)',
                    productivity:{IfcCableCarrier:27,IfcCableCarrierSegment:27,IfcLightFixture:18,IfcOutlet:22}},
    STEEL_ERECTOR: {rate_per_day:1100, crew_size:4, trade:'Rod bandhai mistri (dokho)',
                    productivity:{IfcBeam:7,IfcColumn:5}},
    CONCRETE_GANG: {rate_per_day:650,  crew_size:6, trade:'Concrete dhalai dol',
                    productivity:{IfcSlab:32}},
    MASON:         {rate_per_day:900,  crew_size:3, trade:'Rajmistri (dokho) + sahakari',
                    productivity:{IfcWall:11,IfcWallStandardCase:11}},
    LABORER:       {rate_per_day:500,  crew_size:1, trade:'Sadharon sromik',
                    productivity:{}},
  },

  // ── Equipment Rates ──
  equipment_rates: {
    MOBILE_CRANE_20T: {rate_per_day:25000, desc:'Mobile crane 20 ton'},
    TOWER_CRANE:      {rate_per_day:35000, desc:'Tower crane'},
    CONCRETE_PUMP:    {rate_per_day:15000, desc:'Concrete pump truck'},
    SCISSOR_LIFT_8M:  {rate_per_day:4500,  desc:'Scissor lift 8m'},
    WELDING_MACHINE:  {rate_per_day:950,   desc:'Welding machine 300A'},
    GENERATOR_5KVA:   {rate_per_day:1400,  desc:'Genset 5KVA'},
  },
  equipment_allocation: {
    IfcBeam:         {equipment:'MOBILE_CRANE_20T', duration_factor:0.5},
    IfcColumn:       {equipment:'MOBILE_CRANE_20T', duration_factor:0.5},
    IfcSlab:         {equipment:'CONCRETE_PUMP',    duration_factor:0.3},
    IfcDuct:         {equipment:'SCISSOR_LIFT_8M',  duration_factor:0.4},
    IfcCableCarrier: {equipment:'SCISSOR_LIFT_8M',  duration_factor:0.3},
  },
};
