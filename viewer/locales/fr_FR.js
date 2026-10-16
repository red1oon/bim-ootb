// fr_FR.js — Français (France) — Locale BIM OOTB
// ISO 3166-1: FR — Flag: 🇫🇷
// Rates: Bordereau UNTEC / Batiprix 2024
// Labour: Convention collective BTP 2024
//

// S226 §R2 (2026-10-03): the LABEL strings moved out of this file into iDempiere-format XML —
// viewer/i18n/AD_Message_Trl_fr_FR.xml (base English: viewer/i18n/ad_message_base.csv). This file keeps the
// COST data only: currency, rate-book attribution, rates. Loaded by locale_loader.js beside i18n/fr_FR.json.

var _TRL_LOCALE = {

  // ── Identity ──
  iso: 'FR',            // ISO 3166-1 alpha-2 (drives flag emoji)
  lang: 'fr',           // ISO 639-1 language
  locale: 'fr_FR',      // combined

  // ── Currency ──
  cur: 'EUR',
  cur2: 'USD',
  cur_rate: 0.85,         // 1 USD = 0.93 EUR
  cur_name: 'Euro',
  cur2_name: 'Dollar US',

  // ── Rate source attribution ──
  rate_source:       'Bordereau UNTEC / Batiprix 2024',
  rate_year:         '2024',
  rate_mat_source:   'Batiprix 2024 — Base de prix travaux',
  rate_mat_ref:      'Batiprix 2024 (prix moyens nationaux)',
  rate_mat_includes: 'Livraison, perte estimee (5-10% selon materiau)',
  rate_lab_source:   'Convention collective BTP — Grille salariale 2024',
  rate_lab_basis:    'Salaire brut + 45% charges (SS 22%, retraite 10%, conges 13%)',
  rate_lab_prod:     'Rendements Batiprix par corps de metier',
  rate_lab_crew:     'Compagnons qualifies + aides selon le lot',
  rate_eq_source:    'Batiprix 2024 — Location materiel BTP',
  rate_eq_alloc:     'Selon type de travaux et duree du chantier',
  rate_eq_basis:     'Par jour (8 heures), conducteur inclus si indique',

  // ── Material Rates (Batiprix 2024, EUR) ──
  rates: {
    IfcDuct:{rate:38,unit:'M',desc:'Gaine acier galvanise (moy. 400mm)'},
    IfcDuctSegment:{rate:38,unit:'M',desc:'Troncon de gaine'},
    IfcDuctFitting:{rate:85,unit:'EA',desc:'Raccords de gaine (coudes, tes)'},
    IfcPipe:{rate:12,unit:'M',desc:'Tube PVC/PEHD (moy. 100mm)'},
    IfcPipeSegment:{rate:12,unit:'M',desc:'Troncon de tuyauterie'},
    IfcPipeFitting:{rate:22,unit:'EA',desc:'Raccords de tuyauterie'},
    IfcCableCarrier:{rate:18,unit:'M',desc:'Chemin de cables (300mm)'},
    IfcCableCarrierSegment:{rate:18,unit:'M',desc:'Troncon chemin de cables'},
    IfcBeam:{rate:155,unit:'M',desc:'Poutre acier IPE'},
    IfcColumn:{rate:285,unit:'M',desc:'Poteau acier HEA'},
    IfcSlab:{rate:65,unit:'M2',desc:'Dalle BA 250mm'},
    IfcWall:{rate:55,unit:'M2',desc:'Mur en parpaing 150mm'},
    IfcWallStandardCase:{rate:55,unit:'M2',desc:'Mur standard'},
    IfcCurtainWall:{rate:420,unit:'M2',desc:'Mur rideau'},
    IfcCovering:{rate:45,unit:'M2',desc:'Revetement sol/plafond'},
    IfcRoof:{rate:58,unit:'M2',desc:'Couverture metallique'},
    IfcLightFixture:{rate:110,unit:'EA',desc:'Luminaire LED'},
    IfcOutlet:{rate:28,unit:'EA',desc:'Prise de courant'},
    IfcDoor:{rate:650,unit:'EA',desc:'Bloc-porte'},
    IfcWindow:{rate:360,unit:'EA',desc:'Fenetre'},
    IfcBuildingElementProxy:{rate:195,unit:'EA',desc:'Element divers'},
    IfcFlowTerminal:{rate:800,unit:'EA',desc:'Terminal CVC'},
    IfcFurnishingElement:{rate:275,unit:'EA',desc:'Mobilier'},
    IfcFurniture:{rate:340,unit:'EA',desc:'Mobilier'},
    IfcPlate:{rate:22,unit:'M2',desc:'Tole acier'},
    IfcMember:{rate:72,unit:'M',desc:'Element acier'},
    IfcRailing:{rate:65,unit:'M',desc:'Garde-corps'},
    IfcStair:{rate:1050,unit:'EA',desc:'Escalier'},
    IfcStairFlight:{rate:520,unit:'EA',desc:'Volee d\'escalier'},
    IfcFooting:{rate:75,unit:'EA',desc:'Semelle de fondation'},
    IfcPile:{rate:195,unit:'EA',desc:'Pieu de fondation'},
    IfcReinforcingBar:{rate:1.8,unit:'KG',desc:'Acier de ferraillage'},
    IfcFlowSegment:{rate:28,unit:'M',desc:'Troncon de flux'},
    IfcFlowFitting:{rate:45,unit:'EA',desc:'Raccord de flux'},
    IfcFlowController:{rate:105,unit:'EA',desc:'Organe de regulation'},
    IfcEnergyConversionDevice:{rate:1950,unit:'EA',desc:'Equipement de conversion energetique'},
    IfcFlowTreatmentDevice:{rate:275,unit:'EA',desc:'Equipement de traitement'},
    IfcFlowMovingDevice:{rate:800,unit:'EA',desc:'Equipement de circulation'},
    IfcFlowStorageDevice:{rate:1150,unit:'EA',desc:'Equipement de stockage'},
    IfcElectricAppliance:{rate:110,unit:'EA',desc:'Appareil electrique'},
  },
  rates_default: {rate:115,unit:'EA',desc:'Element divers'},

  // ── Labor Rates (Convention collective BTP 2024, EUR) ──
  labor_rates: {
    HVAC_TECH:     {rate_per_day:320, crew_size:2, trade:'Technicien CVC (Qualifie)',
                    productivity:{IfcDuct:15,IfcDuctSegment:15,IfcDuctFitting:10}},
    PLUMBER:       {rate_per_day:290, crew_size:2, trade:'Plombier-Chauffagiste (Qualifie)',
                    productivity:{IfcPipe:22,IfcPipeSegment:22,IfcPipeFitting:12}},
    ELECTRICIAN:   {rate_per_day:300, crew_size:2, trade:'Electricien (Qualifie)',
                    productivity:{IfcCableCarrier:28,IfcCableCarrierSegment:28,IfcLightFixture:18,IfcOutlet:22}},
    STEEL_ERECTOR: {rate_per_day:340, crew_size:4, trade:'Monteur en charpente metallique (Qualifie)',
                    productivity:{IfcBeam:7,IfcColumn:5}},
    CONCRETE_GANG: {rate_per_day:260, crew_size:6, trade:'Equipe beton (Mixte)',
                    productivity:{IfcSlab:30}},
    MASON:         {rate_per_day:280, crew_size:3, trade:'Macon (Qualifie) + Aides',
                    productivity:{IfcWall:10,IfcWallStandardCase:10}},
    LABORER:       {rate_per_day:160, crew_size:1, trade:'Manoeuvre',
                    productivity:{}},
  },

  // ── Equipment Rates (Location materiel BTP, EUR/jour) ──
  equipment_rates: {
    MOBILE_CRANE_20T: {rate_per_day:650, desc:'Grue mobile 20 tonnes'},
    TOWER_CRANE:      {rate_per_day:800, desc:'Grue a tour'},
    CONCRETE_PUMP:    {rate_per_day:450, desc:'Camion pompe a beton'},
    SCISSOR_LIFT_8M:  {rate_per_day:120, desc:'Nacelle ciseaux 8m'},
    WELDING_MACHINE:  {rate_per_day:35,  desc:'Poste a souder 300A'},
    GENERATOR_5KVA:   {rate_per_day:45,  desc:'Groupe electrogene 5KVA'},
  },
  equipment_allocation: {
    IfcBeam:         {equipment:'MOBILE_CRANE_20T', duration_factor:0.5},
    IfcColumn:       {equipment:'MOBILE_CRANE_20T', duration_factor:0.5},
    IfcSlab:         {equipment:'CONCRETE_PUMP',    duration_factor:0.3},
    IfcDuct:         {equipment:'SCISSOR_LIFT_8M',  duration_factor:0.4},
    IfcCableCarrier: {equipment:'SCISSOR_LIFT_8M',  duration_factor:0.3},
  },
};
