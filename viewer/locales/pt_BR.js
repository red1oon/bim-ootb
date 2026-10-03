// pt_BR.js — Portuguese (Brazil)
// ISO 3166-1: BR — Flag: 🇧🇷
// To create your project locale: copy this file → MyProject_TRL.js → edit what differs
//

// S226 §R2 (2026-10-03): the LABEL strings moved out of this file into iDempiere-format XML —
// viewer/i18n/AD_Message_Trl_pt_BR.xml (base English: viewer/i18n/ad_message_base.csv). This file keeps the
// COST data only: currency, rate-book attribution, rates. Loaded by locale_loader.js beside i18n/pt_BR.json.

var _TRL_LOCALE = {

  // ── Identity ──
  iso: 'BR',            // ISO 3166-1 alpha-2 (drives flag emoji)
  lang: 'pt',           // ISO 639-1 language
  locale: 'pt_BR',      // combined

  // ── Currency ──
  cur: 'BRL',
  cur2: 'USD',
  cur_rate: 4.94,         // 1 USD = 5.05 BRL
  cur_name: 'Real Brasileiro',
  cur2_name: 'Dólar Americano',

  // ── Rate source attribution ──
  rate_source:       'SINAPI / TCPO Tabela 2024',
  rate_year:         '2024',
  rate_mat_source:   'SINAPI — Sistema Nacional de Pesquisa de Custos e Índices 2024',
  rate_mat_ref:      'SINAPI Caixa/IBGE — Preços de insumos 2024 (+3% INCC)',
  rate_mat_includes: 'Frete, perdas e desperdícios (5-10% por tipo de material)',
  rate_lab_source:   'SINAPI — Composições de custo mão de obra 2024',
  rate_lab_basis:    'Salário base + 80% (encargos sociais: INSS, FGTS, férias, 13º)',
  rate_lab_prod:     'TCPO — Tabelas de Composições de Preços para Orçamentos',
  rate_lab_crew:     'Oficiais + serventes conforme composição padrão',
  rate_eq_source:    'SINAPI — Equipamentos e máquinas 2024',
  rate_eq_alloc:     'Alocação conforme tipo de serviço e duração',
  rate_eq_basis:     'Por dia (8 horas), operador incluso quando indicado',

  // ── Material Rates (SINAPI 2024) ──
  rates: {
    IfcDuct:{rate:195,unit:'M',desc:'Duto em chapa galvanizada (média 400mm)'},
    IfcDuctSegment:{rate:195,unit:'M',desc:'Segmento de duto'},
    IfcDuctFitting:{rate:450,unit:'EA',desc:'Conexões de duto (curvas, tês)'},
    IfcPipe:{rate:58,unit:'M',desc:'Tubo PVC/PEAD (média 100mm)'},
    IfcPipeSegment:{rate:58,unit:'M',desc:'Segmento de tubo'},
    IfcPipeFitting:{rate:115,unit:'EA',desc:'Conexões de tubulação'},
    IfcCableCarrier:{rate:92,unit:'M',desc:'Eletrocalha (300mm)'},
    IfcCableCarrierSegment:{rate:92,unit:'M',desc:'Segmento de eletrocalha'},
    IfcBeam:{rate:810,unit:'M',desc:'Viga metálica perfil I'},
    IfcColumn:{rate:1480,unit:'M',desc:'Pilar metálico'},
    IfcSlab:{rate:340,unit:'M2',desc:'Laje de concreto armado 250mm'},
    IfcWall:{rate:175,unit:'M2',desc:'Alvenaria de bloco 150mm'},
    IfcWallStandardCase:{rate:175,unit:'M2',desc:'Parede padrão'},
    IfcCurtainWall:{rate:890,unit:'M2',desc:'Pele de vidro'},
    IfcCovering:{rate:220,unit:'M2',desc:'Revestimento piso/teto'},
    IfcRoof:{rate:285,unit:'M2',desc:'Cobertura metálica'},
    IfcLightFixture:{rate:580,unit:'EA',desc:'Luminária LED'},
    IfcOutlet:{rate:148,unit:'EA',desc:'Tomada elétrica'},
    IfcDoor:{rate:3400,unit:'EA',desc:'Conjunto de porta'},
    IfcWindow:{rate:1880,unit:'EA',desc:'Janela'},
    IfcBuildingElementProxy:{rate:1020,unit:'EA',desc:'Elemento diverso'},
    IfcFlowTerminal:{rate:4150,unit:'EA',desc:'Terminal HVAC'},
    IfcFurnishingElement:{rate:1450,unit:'EA',desc:'Mobiliário'},
    IfcFurniture:{rate:1780,unit:'EA',desc:'Mobiliário'},
    IfcPlate:{rate:115,unit:'M2',desc:'Chapa de aço'},
    IfcMember:{rate:385,unit:'M',desc:'Perfil metálico'},
    IfcRailing:{rate:335,unit:'M',desc:'Guarda-corpo'},
    IfcStair:{rate:5350,unit:'EA',desc:'Escada'},
    IfcStairFlight:{rate:2650,unit:'EA',desc:'Lance de escada'},
    IfcFooting:{rate:385,unit:'EA',desc:'Sapata de fundação'},
    IfcPile:{rate:1020,unit:'EA',desc:'Estaca de fundação'},
    IfcReinforcingBar:{rate:52,unit:'KG',desc:'Aço para armadura'},
    IfcFlowSegment:{rate:145,unit:'M',desc:'Segmento de fluxo'},
    IfcFlowFitting:{rate:240,unit:'EA',desc:'Conexão de fluxo'},
    IfcFlowController:{rate:535,unit:'EA',desc:'Controlador de fluxo'},
    IfcEnergyConversionDevice:{rate:10200,unit:'EA',desc:'Equipamento de conversão de energia'},
    IfcFlowTreatmentDevice:{rate:1450,unit:'EA',desc:'Equipamento de tratamento'},
    IfcFlowMovingDevice:{rate:4150,unit:'EA',desc:'Equipamento de movimentação'},
    IfcFlowStorageDevice:{rate:5950,unit:'EA',desc:'Equipamento de armazenamento'},
    IfcElectricAppliance:{rate:580,unit:'EA',desc:'Aparelho elétrico'},
  },
  rates_default: {rate:600,unit:'EA',desc:'Elemento diverso'},

  // ── Labor Rates ──
  labor_rates: {
    HVAC_TECH:     {rate_per_day:225, crew_size:2, trade:'Mecânico de refrigeração (oficial)',
                    productivity:{IfcDuct:17,IfcDuctSegment:17,IfcDuctFitting:11}},
    PLUMBER:       {rate_per_day:198, crew_size:2, trade:'Encanador (oficial)',
                    productivity:{IfcPipe:24,IfcPipeSegment:24,IfcPipeFitting:14}},
    ELECTRICIAN:   {rate_per_day:210, crew_size:2, trade:'Eletricista (oficial)',
                    productivity:{IfcCableCarrier:28,IfcCableCarrierSegment:28,IfcLightFixture:19,IfcOutlet:24}},
    STEEL_ERECTOR: {rate_per_day:235, crew_size:4, trade:'Montador de estrutura metálica (oficial)',
                    productivity:{IfcBeam:7,IfcColumn:5}},
    CONCRETE_GANG: {rate_per_day:175, crew_size:6, trade:'Equipe de concretagem',
                    productivity:{IfcSlab:33}},
    MASON:         {rate_per_day:185, crew_size:3, trade:'Pedreiro (oficial) + serventes',
                    productivity:{IfcWall:11,IfcWallStandardCase:11}},
    LABORER:       {rate_per_day:115, crew_size:1, trade:'Servente',
                    productivity:{}},
  },

  // ── Equipment Rates ──
  equipment_rates: {
    MOBILE_CRANE_20T: {rate_per_day:2200, desc:'Guindaste móvel 20 toneladas'},
    TOWER_CRANE:      {rate_per_day:2650, desc:'Grua torre'},
    CONCRETE_PUMP:    {rate_per_day:1150, desc:'Bomba de concreto'},
    SCISSOR_LIFT_8M:  {rate_per_day:340,  desc:'Plataforma elevatória 8m'},
    WELDING_MACHINE:  {rate_per_day:78,   desc:'Máquina de solda 300A'},
    GENERATOR_5KVA:   {rate_per_day:115,  desc:'Gerador 5KVA'},
  },
  equipment_allocation: {
    IfcBeam:         {equipment:'MOBILE_CRANE_20T', duration_factor:0.5},
    IfcColumn:       {equipment:'MOBILE_CRANE_20T', duration_factor:0.5},
    IfcSlab:         {equipment:'CONCRETE_PUMP',    duration_factor:0.3},
    IfcDuct:         {equipment:'SCISSOR_LIFT_8M',  duration_factor:0.4},
    IfcCableCarrier: {equipment:'SCISSOR_LIFT_8M',  duration_factor:0.3},
  },
};
