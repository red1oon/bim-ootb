// es_ES.js — Español (España) — Locale BIM OOTB
// ISO 3166-1: ES — Flag: 🇪🇸
// Fuente de precios: Base de Precios CYPE / ITeC 2024
//

// S226 §R2 (2026-10-03): the LABEL strings moved out of this file into iDempiere-format XML —
// viewer/i18n/AD_Message_Trl_es_ES.xml (base English: viewer/i18n/ad_message_base.csv). This file keeps the
// COST data only: currency, rate-book attribution, rates. Loaded by locale_loader.js beside i18n/es_ES.json.

var _TRL_LOCALE = {

  // ── Identity ──
  iso: 'ES',            // ISO 3166-1 alpha-2 (drives flag emoji)
  lang: 'es',           // ISO 639-1 language
  locale: 'es_ES',      // combined

  // ── Currency ──
  cur: 'EUR',
  cur2: 'USD',
  cur_rate: 0.85,         // 1 USD = 0.93 EUR
  cur_name: 'Euro',
  cur2_name: 'Dolar estadounidense',

  // ── Rate source attribution ──
  rate_source:       'Base de Precios CYPE / ITeC 2024',
  rate_year:         '2024',
  rate_mat_source:   'Base de Precios de la Construccion CYPE / ITeC 2024',
  rate_mat_ref:      'Precios unitarios CYPE 2024 (incluye IPC construccion)',
  rate_mat_includes: 'Entrega en obra, mermas (5-10% segun tipo de material)',
  rate_lab_source:   'Convenio Colectivo General del Sector de la Construccion 2024',
  rate_lab_basis:    'Salario base + 35% (Seg. Social 30%, complementos 5%)',
  rate_lab_prod:     'Rendimientos segun Base de Precios CYPE / ITeC',
  rate_lab_crew:     'Oficial + peon segun unidad de obra',
  rate_eq_source:    'Tarifas SEOPAN / CYPE Maquinaria 2024',
  rate_eq_alloc:     'Segun tipo de trabajo y duracion prevista',
  rate_eq_basis:     'Por jornada (8 horas), operador incluido donde se indica',

  // ── Material Rates (CYPE/ITeC 2024, EUR) ──
  rates: {
    IfcDuct:{rate:38,unit:'M',desc:'Conducto de chapa galvanizada (400mm medio)'},
    IfcDuctSegment:{rate:38,unit:'M',desc:'Tramo de conducto'},
    IfcDuctFitting:{rate:85,unit:'EA',desc:'Accesorios de conducto (codos, tes)'},
    IfcPipe:{rate:12,unit:'M',desc:'Tuberia PVC/HDPE (100mm medio)'},
    IfcPipeSegment:{rate:12,unit:'M',desc:'Tramo de tuberia'},
    IfcPipeFitting:{rate:22,unit:'EA',desc:'Accesorios de tuberia'},
    IfcCableCarrier:{rate:18,unit:'M',desc:'Bandeja portacables (300mm)'},
    IfcCableCarrierSegment:{rate:18,unit:'M',desc:'Tramo de bandeja portacables'},
    IfcBeam:{rate:155,unit:'M',desc:'Viga de acero laminado IPE/HEB'},
    IfcColumn:{rate:285,unit:'M',desc:'Pilar de acero laminado HEB'},
    IfcSlab:{rate:65,unit:'M2',desc:'Forjado HA-25 canto 25+5 cm'},
    IfcWall:{rate:34,unit:'M2',desc:'Tabique ladrillo hueco doble 15cm'},
    IfcWallStandardCase:{rate:34,unit:'M2',desc:'Tabique estandar'},
    IfcCurtainWall:{rate:175,unit:'M2',desc:'Muro cortina aluminio-vidrio'},
    IfcCovering:{rate:42,unit:'M2',desc:'Revestimiento suelo/techo'},
    IfcRoof:{rate:55,unit:'M2',desc:'Cubierta metalica'},
    IfcLightFixture:{rate:110,unit:'EA',desc:'Luminaria LED'},
    IfcOutlet:{rate:28,unit:'EA',desc:'Toma de corriente'},
    IfcDoor:{rate:650,unit:'EA',desc:'Puerta interior completa'},
    IfcWindow:{rate:360,unit:'EA',desc:'Ventana aluminio RPT'},
    IfcBuildingElementProxy:{rate:195,unit:'EA',desc:'Elemento generico'},
    IfcFlowTerminal:{rate:800,unit:'EA',desc:'Terminal climatizacion'},
    IfcFurnishingElement:{rate:275,unit:'EA',desc:'Mobiliario'},
    IfcFurniture:{rate:340,unit:'EA',desc:'Mobiliario'},
    IfcPlate:{rate:22,unit:'M2',desc:'Chapa de acero'},
    IfcMember:{rate:73,unit:'M',desc:'Perfil de acero'},
    IfcRailing:{rate:65,unit:'M',desc:'Barandilla'},
    IfcStair:{rate:1025,unit:'EA',desc:'Escalera completa'},
    IfcStairFlight:{rate:500,unit:'EA',desc:'Tramo de escalera'},
    IfcFooting:{rate:73,unit:'EA',desc:'Zapata de cimentacion'},
    IfcPile:{rate:195,unit:'EA',desc:'Pilote de cimentacion'},
    IfcReinforcingBar:{rate:1.05,unit:'KG',desc:'Acero corrugado B500S'},
    IfcFlowSegment:{rate:28,unit:'M',desc:'Tramo de instalacion'},
    IfcFlowFitting:{rate:46,unit:'EA',desc:'Accesorio de instalacion'},
    IfcFlowController:{rate:105,unit:'EA',desc:'Valvula/controlador de flujo'},
    IfcEnergyConversionDevice:{rate:1950,unit:'EA',desc:'Equipo de conversion energetica'},
    IfcFlowTreatmentDevice:{rate:275,unit:'EA',desc:'Equipo de tratamiento'},
    IfcFlowMovingDevice:{rate:800,unit:'EA',desc:'Bomba/ventilador'},
    IfcFlowStorageDevice:{rate:1150,unit:'EA',desc:'Deposito/acumulador'},
    IfcElectricAppliance:{rate:110,unit:'EA',desc:'Aparato electrico'},
  },
  rates_default: {rate:115,unit:'EA',desc:'Elemento generico'},

  // ── Labor Rates (Convenio Colectivo Construccion 2024, EUR) ──
  labor_rates: {
    HVAC_TECH:     {rate_per_day:52, crew_size:2, trade:'Instalador climatizacion (Oficial 1a)',
                    productivity:{IfcDuct:16,IfcDuctSegment:16,IfcDuctFitting:10}},
    PLUMBER:       {rate_per_day:48, crew_size:2, trade:'Fontanero (Oficial 1a)',
                    productivity:{IfcPipe:22,IfcPipeSegment:22,IfcPipeFitting:14}},
    ELECTRICIAN:   {rate_per_day:50, crew_size:2, trade:'Electricista (Oficial 1a)',
                    productivity:{IfcCableCarrier:28,IfcCableCarrierSegment:28,IfcLightFixture:18,IfcOutlet:22}},
    STEEL_ERECTOR: {rate_per_day:55, crew_size:4, trade:'Montador estructura metalica (Oficial 1a)',
                    productivity:{IfcBeam:7,IfcColumn:5}},
    CONCRETE_GANG: {rate_per_day:42, crew_size:6, trade:'Cuadrilla de hormigon (Oficial + peones)',
                    productivity:{IfcSlab:30}},
    MASON:         {rate_per_day:45, crew_size:3, trade:'Albanil (Oficial 1a) + peones',
                    productivity:{IfcWall:10,IfcWallStandardCase:10}},
    LABORER:       {rate_per_day:32, crew_size:1, trade:'Peon ordinario',
                    productivity:{}},
  },

  // ── Equipment Rates (SEOPAN / CYPE 2024, EUR) ──
  equipment_rates: {
    MOBILE_CRANE_20T: {rate_per_day:420, desc:'Grua movil autopropulsada 20t'},
    TOWER_CRANE:      {rate_per_day:500, desc:'Grua torre'},
    CONCRETE_PUMP:    {rate_per_day:215, desc:'Bomba de hormigon sobre camion'},
    SCISSOR_LIFT_8M:  {rate_per_day:65,  desc:'Plataforma elevadora de tijera 8m'},
    WELDING_MACHINE:  {rate_per_day:15,  desc:'Equipo de soldadura 300A'},
    GENERATOR_5KVA:   {rate_per_day:22,  desc:'Grupo electrogeno 5KVA'},
  },
  equipment_allocation: {
    IfcBeam:         {equipment:'MOBILE_CRANE_20T', duration_factor:0.5},
    IfcColumn:       {equipment:'MOBILE_CRANE_20T', duration_factor:0.5},
    IfcSlab:         {equipment:'CONCRETE_PUMP',    duration_factor:0.3},
    IfcDuct:         {equipment:'SCISSOR_LIFT_8M',  duration_factor:0.4},
    IfcCableCarrier: {equipment:'SCISSOR_LIFT_8M',  duration_factor:0.3},
  },
};
