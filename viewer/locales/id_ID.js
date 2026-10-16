// id_ID.js — Indonesian (Indonesia)
// ISO 3166-1: ID — Flag: 🇮🇩
// To create your project locale: copy this file → MyProject_TRL.js → edit what differs
//

// S226 §R2 (2026-10-03): the LABEL strings moved out of this file into iDempiere-format XML —
// viewer/i18n/AD_Message_Trl_id_ID.xml (base English: viewer/i18n/ad_message_base.csv). This file keeps the
// COST data only: currency, rate-book attribution, rates. Loaded by locale_loader.js beside i18n/id_ID.json.

var _TRL_LOCALE = {

  // ── Identity ──
  iso: 'ID',            // ISO 3166-1 alpha-2 (drives flag emoji)
  lang: 'id',           // ISO 639-1 language
  locale: 'id_ID',      // combined

  // ── Currency ──
  cur: 'IDR',
  cur2: 'USD',
  cur_rate: 17331,        // 1 USD = 15700 IDR
  cur_name: 'Rupiah Indonesia',
  cur2_name: 'Dolar Amerika',

  // ── Rate source attribution ──
  rate_source:       'SNI BOQ Standard / Harga Satuan Pekerjaan 2024',
  rate_year:         '2024',
  rate_mat_source:   'SNI — Standar Nasional Indonesia Harga Bahan 2024',
  rate_mat_ref:      'Jurnal Harga Satuan Bahan Bangunan 2024 (+4% inflasi)',
  rate_mat_includes: 'Ongkos kirim, toleransi waste (5-10% per jenis material)',
  rate_lab_source:   'Permenaker — Upah Minimum Konstruksi 2024',
  rate_lab_basis:    'Upah dasar + 30% (BPJS Ketenagakerjaan, BPJS Kesehatan, THR)',
  rate_lab_prod:     'SNI — Analisa harga satuan pekerjaan',
  rate_lab_crew:     'Tukang + pekerja sesuai standar komposisi',
  rate_eq_source:    'Kementerian PUPR — Harga Sewa Alat 2024',
  rate_eq_alloc:     'Alokasi berdasarkan jenis pekerjaan dan durasi',
  rate_eq_basis:     'Per hari (8 jam), operator termasuk bila disebutkan',

  // ── Material Rates (SNI 2024) ──
  rates: {
    IfcDuct:{rate:580000,unit:'M',desc:'Ducting plat baja galvanis (rata-rata 400mm)'},
    IfcDuctSegment:{rate:580000,unit:'M',desc:'Segmen ducting'},
    IfcDuctFitting:{rate:1350000,unit:'EA',desc:'Fitting ducting (elbow, tee)'},
    IfcPipe:{rate:172000,unit:'M',desc:'Pipa PVC/HDPE (rata-rata 100mm)'},
    IfcPipeSegment:{rate:172000,unit:'M',desc:'Segmen pipa'},
    IfcPipeFitting:{rate:340000,unit:'EA',desc:'Fitting pipa'},
    IfcCableCarrier:{rate:275000,unit:'M',desc:'Cable tray (300mm)'},
    IfcCableCarrierSegment:{rate:275000,unit:'M',desc:'Segmen cable tray'},
    IfcBeam:{rate:2450000,unit:'M',desc:'Balok baja profil I'},
    IfcColumn:{rate:4500000,unit:'M',desc:'Kolom baja struktural'},
    IfcSlab:{rate:1020000,unit:'M2',desc:'Pelat beton bertulang 250mm'},
    IfcWall:{rate:520000,unit:'M2',desc:'Dinding bata ringan 150mm'},
    IfcWallStandardCase:{rate:520000,unit:'M2',desc:'Dinding standar'},
    IfcCurtainWall:{rate:2700000,unit:'M2',desc:'Curtain wall'},
    IfcCovering:{rate:665000,unit:'M2',desc:'Finishing lantai/plafon'},
    IfcRoof:{rate:860000,unit:'M2',desc:'Atap metal'},
    IfcLightFixture:{rate:1750000,unit:'EA',desc:'Lampu LED'},
    IfcOutlet:{rate:450000,unit:'EA',desc:'Stop kontak'},
    IfcDoor:{rate:10250000,unit:'EA',desc:'Set pintu'},
    IfcWindow:{rate:5700000,unit:'EA',desc:'Jendela'},
    IfcBuildingElementProxy:{rate:3050000,unit:'EA',desc:'Elemen lain-lain'},
    IfcFlowTerminal:{rate:12600000,unit:'EA',desc:'Terminal HVAC'},
    IfcFurnishingElement:{rate:4300000,unit:'EA',desc:'Furnitur'},
    IfcFurniture:{rate:5400000,unit:'EA',desc:'Furnitur'},
    IfcPlate:{rate:340000,unit:'M2',desc:'Plat baja'},
    IfcMember:{rate:1150000,unit:'M',desc:'Profil baja'},
    IfcRailing:{rate:1020000,unit:'M',desc:'Railing'},
    IfcStair:{rate:16200000,unit:'EA',desc:'Tangga'},
    IfcStairFlight:{rate:7900000,unit:'EA',desc:'Anak tangga'},
    IfcFooting:{rate:1150000,unit:'EA',desc:'Pondasi tapak'},
    IfcPile:{rate:3050000,unit:'EA',desc:'Tiang pancang'},
    IfcReinforcingBar:{rate:16200,unit:'KG',desc:'Besi tulangan'},
    IfcFlowSegment:{rate:430000,unit:'M',desc:'Segmen aliran'},
    IfcFlowFitting:{rate:720000,unit:'EA',desc:'Fitting aliran'},
    IfcFlowController:{rate:1620000,unit:'EA',desc:'Pengontrol aliran'},
    IfcEnergyConversionDevice:{rate:30600000,unit:'EA',desc:'Peralatan konversi energi'},
    IfcFlowTreatmentDevice:{rate:4300000,unit:'EA',desc:'Peralatan pengolahan'},
    IfcFlowMovingDevice:{rate:12600000,unit:'EA',desc:'Peralatan pemindah fluida'},
    IfcFlowStorageDevice:{rate:18000000,unit:'EA',desc:'Peralatan penyimpanan fluida'},
    IfcElectricAppliance:{rate:1750000,unit:'EA',desc:'Peralatan listrik'},
  },
  rates_default: {rate:1800000,unit:'EA',desc:'Elemen lain-lain'},

  // ── Labor Rates ──
  labor_rates: {
    HVAC_TECH:     {rate_per_day:520000, crew_size:2, trade:'Teknisi HVAC (terampil)',
                    productivity:{IfcDuct:16,IfcDuctSegment:16,IfcDuctFitting:10}},
    PLUMBER:       {rate_per_day:450000, crew_size:2, trade:'Tukang pipa (terampil)',
                    productivity:{IfcPipe:23,IfcPipeSegment:23,IfcPipeFitting:13}},
    ELECTRICIAN:   {rate_per_day:480000, crew_size:2, trade:'Tukang listrik (terampil)',
                    productivity:{IfcCableCarrier:27,IfcCableCarrierSegment:27,IfcLightFixture:18,IfcOutlet:22}},
    STEEL_ERECTOR: {rate_per_day:550000, crew_size:4, trade:'Tukang baja (terampil)',
                    productivity:{IfcBeam:7,IfcColumn:5}},
    CONCRETE_GANG: {rate_per_day:380000, crew_size:6, trade:'Regu pengecoran',
                    productivity:{IfcSlab:32}},
    MASON:         {rate_per_day:420000, crew_size:3, trade:'Tukang batu (terampil) + pekerja',
                    productivity:{IfcWall:11,IfcWallStandardCase:11}},
    LABORER:       {rate_per_day:250000, crew_size:1, trade:'Pekerja umum',
                    productivity:{}},
  },

  // ── Equipment Rates ──
  equipment_rates: {
    MOBILE_CRANE_20T: {rate_per_day:6500000, desc:'Mobile crane 20 ton'},
    TOWER_CRANE:      {rate_per_day:8500000, desc:'Tower crane'},
    CONCRETE_PUMP:    {rate_per_day:3400000, desc:'Concrete pump truck'},
    SCISSOR_LIFT_8M:  {rate_per_day:1020000, desc:'Scissor lift 8m'},
    WELDING_MACHINE:  {rate_per_day:230000,  desc:'Mesin las 300A'},
    GENERATOR_5KVA:   {rate_per_day:340000,  desc:'Genset 5KVA'},
  },
  equipment_allocation: {
    IfcBeam:         {equipment:'MOBILE_CRANE_20T', duration_factor:0.5},
    IfcColumn:       {equipment:'MOBILE_CRANE_20T', duration_factor:0.5},
    IfcSlab:         {equipment:'CONCRETE_PUMP',    duration_factor:0.3},
    IfcDuct:         {equipment:'SCISSOR_LIFT_8M',  duration_factor:0.4},
    IfcCableCarrier: {equipment:'SCISSOR_LIFT_8M',  duration_factor:0.3},
  },
};
