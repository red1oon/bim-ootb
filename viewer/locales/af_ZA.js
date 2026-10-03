// af_ZA.js — Afrikaans (South Africa)
// ISO 3166-1: ZA — Flag: 🇿🇦
// To create your project locale: copy this file → MyProject_TRL.js → edit what differs
//

// S226 §R2 (2026-10-03): the LABEL strings moved out of this file into iDempiere-format XML —
// viewer/i18n/AD_Message_Trl_af_ZA.xml (base English: viewer/i18n/ad_message_base.csv). This file keeps the
// COST data only: currency, rate-book attribution, rates. Loaded by locale_loader.js beside i18n/af_ZA.json.

var _TRL_LOCALE = {

  // ── Identity ──
  iso: 'ZA',            // ISO 3166-1 alpha-2 (drives flag emoji)
  lang: 'af',           // ISO 639-1 language
  locale: 'af_ZA',      // combined

  // ── Currency ──
  cur: 'R',
  cur2: 'USD',
  cur_rate: 16.45,         // 1 USD = 18.5 ZAR (2024)
  cur_name: 'Suid-Afrikaanse Rand',
  cur2_name: 'VSA Dollar',

  // ── Rate source attribution ──
  rate_source:       'ASAQS / RICS Southern Africa — Construction Cost Data 2024',
  rate_year:         '2024',
  rate_mat_source:   'Stats SA — Konstruksiemateriaalprysindeks 2024',
  rate_mat_ref:      'ASAQS Tender Price Indices Q4 2024 (+5% invoer aanpassing)',
  rate_mat_includes: 'Lewering ingesluit, vermorsingstoelaag (5-8% per materiaal)',
  rate_lab_source:   'MEIBC — Bounywerheid Loonskedule 2024',
  rate_lab_basis:    'Basiese loon + 35% (UIF, vakansiebetaling, oortyd toelaag)',
  rate_lab_prod:     'ASAQS — Standaard produksienorme vir bouwerk',
  rate_lab_crew:     'Vakman + assistent samestellings per skedule',
  rate_eq_source:    'SAICE — Toerusting Huurtariewe 2024',
  rate_eq_alloc:     'Toekenning gebaseer op werktipe en duur',
  rate_eq_basis:     'Per dag (8 uur), operator ingesluit waar aangedui',

  // ── Material Rates (ASAQS / RICS Southern Africa 2024) ──
  rates: {
    IfcDuct:{rate:1800,unit:'M',desc:'Gegaliseerde staal kanaal (gem 400mm)'},
    IfcDuctSegment:{rate:1800,unit:'M',desc:'Kanaal segment'},
    IfcDuctFitting:{rate:4200,unit:'EA',desc:'Kanaal passing (elmboog, T-stuk)'},
    IfcPipe:{rate:520,unit:'M',desc:'PVC/HDPE pyp (gem 100mm)'},
    IfcPipeSegment:{rate:520,unit:'M',desc:'Pyp segment'},
    IfcPipeFitting:{rate:1100,unit:'EA',desc:'Pyp passing'},
    IfcCableCarrier:{rate:780,unit:'M',desc:'Kabelkoker (300mm)'},
    IfcCableCarrierSegment:{rate:780,unit:'M',desc:'Kabelkoker segment'},
    IfcBeam:{rate:6500,unit:'M',desc:'Strukturele staal I-balk'},
    IfcColumn:{rate:11500,unit:'M',desc:'Strukturele staal kolom'},
    IfcSlab:{rate:1650,unit:'M2',desc:'GV slab 250mm'},
    IfcWall:{rate:1350,unit:'M2',desc:'Baksteen/blok muur 150mm'},
    IfcWallStandardCase:{rate:1350,unit:'M2',desc:'Standaard muur'},
    IfcCurtainWall:{rate:8500,unit:'M2',desc:'Gordynmuur'},
    IfcCovering:{rate:1100,unit:'M2',desc:'Vloer/plafon afwerking'},
    IfcRoof:{rate:2200,unit:'M2',desc:'Metaaldak'},
    IfcLightFixture:{rate:2800,unit:'EA',desc:'LED beligting'},
    IfcOutlet:{rate:680,unit:'EA',desc:'Kragpunt'},
    IfcDoor:{rate:12000,unit:'EA',desc:'Deur stel'},
    IfcWindow:{rate:7500,unit:'EA',desc:'Venster'},
    IfcBuildingElementProxy:{rate:5200,unit:'EA',desc:'Diverse element'},
    IfcFlowTerminal:{rate:18000,unit:'EA',desc:'HVAC eindpunt'},
    IfcFurnishingElement:{rate:7800,unit:'EA',desc:'Meubileringselement'},
    IfcFurniture:{rate:9500,unit:'EA',desc:'Meubels'},
    IfcPlate:{rate:1150,unit:'M2',desc:'Staalplaat'},
    IfcMember:{rate:3800,unit:'M',desc:'Staalprofiel'},
    IfcRailing:{rate:3200,unit:'M',desc:'Reling'},
    IfcStair:{rate:28000,unit:'EA',desc:'Trap'},
    IfcStairFlight:{rate:14000,unit:'EA',desc:'Trapvlug'},
    IfcFooting:{rate:4500,unit:'EA',desc:'Voetstuk fondament'},
    IfcPile:{rate:9500,unit:'EA',desc:'Paal'},
    IfcReinforcingBar:{rate:22,unit:'KG',desc:'Wapeningsstaal'},
    IfcFlowSegment:{rate:1400,unit:'M',desc:'Vloeisegment'},
    IfcFlowFitting:{rate:2200,unit:'EA',desc:'Vloei passing'},
    IfcFlowController:{rate:5200,unit:'EA',desc:'Vloei beheerder'},
    IfcEnergyConversionDevice:{rate:42000,unit:'EA',desc:'Energie omsettingstoestel'},
    IfcFlowTreatmentDevice:{rate:16000,unit:'EA',desc:'Behandelingstoestel'},
    IfcFlowMovingDevice:{rate:22000,unit:'EA',desc:'Vloeistofbeweging toestel'},
    IfcFlowStorageDevice:{rate:32000,unit:'EA',desc:'Vloeistof stoor toestel'},
    IfcElectricAppliance:{rate:3500,unit:'EA',desc:'Elektriese toestel'},
  },
  rates_default: {rate:4500,unit:'EA',desc:'Diverse element'},

  // ── Labor Rates ──
  labor_rates: {
    HVAC_TECH:     {rate_per_day:1650, crew_size:2, trade:'HVAC Tegnikus (geskool)',
                    productivity:{IfcDuct:16,IfcDuctSegment:16,IfcDuctFitting:10}},
    PLUMBER:       {rate_per_day:1450, crew_size:2, trade:'Loodgieter (geskool)',
                    productivity:{IfcPipe:23,IfcPipeSegment:23,IfcPipeFitting:13}},
    ELECTRICIAN:   {rate_per_day:1550, crew_size:2, trade:'Elektrisiën (geskool)',
                    productivity:{IfcCableCarrier:27,IfcCableCarrierSegment:27,IfcLightFixture:18,IfcOutlet:22}},
    STEEL_ERECTOR: {rate_per_day:1750, crew_size:4, trade:'Staaloprigter (geskool)',
                    productivity:{IfcBeam:7,IfcColumn:5}},
    CONCRETE_GANG: {rate_per_day:1100, crew_size:6, trade:'Betonstortspan',
                    productivity:{IfcSlab:32}},
    MASON:         {rate_per_day:1350, crew_size:3, trade:'Messelaar (geskool) + arbeiders',
                    productivity:{IfcWall:11,IfcWallStandardCase:11}},
    LABORER:       {rate_per_day:750,  crew_size:1, trade:'Algemene arbeider',
                    productivity:{}},
  },

  // ── Equipment Rates ──
  equipment_rates: {
    MOBILE_CRANE_20T: {rate_per_day:15000, desc:'Mobiele kraan 20 ton'},
    TOWER_CRANE:      {rate_per_day:22000, desc:'Toringkraan'},
    CONCRETE_PUMP:    {rate_per_day:8500,  desc:'Betonpomp vragmotor'},
    SCISSOR_LIFT_8M:  {rate_per_day:2800,  desc:'Skaarbeenhyser 8m'},
    WELDING_MACHINE:  {rate_per_day:620,   desc:'Sweismasjien 300A'},
    GENERATOR_5KVA:   {rate_per_day:950,   desc:'Kragopwekker 5KVA'},
  },
  equipment_allocation: {
    IfcBeam:         {equipment:'MOBILE_CRANE_20T', duration_factor:0.5},
    IfcColumn:       {equipment:'MOBILE_CRANE_20T', duration_factor:0.5},
    IfcSlab:         {equipment:'CONCRETE_PUMP',    duration_factor:0.3},
    IfcDuct:         {equipment:'SCISSOR_LIFT_8M',  duration_factor:0.4},
    IfcCableCarrier: {equipment:'SCISSOR_LIFT_8M',  duration_factor:0.3},
  },
};
