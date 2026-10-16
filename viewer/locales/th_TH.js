// th_TH.js — Thai (Thailand) — BIM OOTB locale
// ISO 3166-1: TH — Flag: 🇹🇭
// To create your project locale: copy this file → MyProject_TRL.js → edit what differs
//

// S226 §R2 (2026-10-03): the LABEL strings moved out of this file into iDempiere-format XML —
// viewer/i18n/AD_Message_Trl_th_TH.xml (base English: viewer/i18n/ad_message_base.csv). This file keeps the
// COST data only: currency, rate-book attribution, rates. Loaded by locale_loader.js beside i18n/th_TH.json.

var _TRL_LOCALE = {

  // ── Identity ──
  iso: 'TH',            // ISO 3166-1 alpha-2 (drives flag emoji)
  lang: 'th',           // ISO 639-1 language
  locale: 'th_TH',      // combined

  // ── Currency ──
  cur: 'THB',
  cur2: 'USD',
  cur_rate: 32.28,         // 1 USD = 35.5 THB
  cur_name: 'Thai Baht',
  cur2_name: 'US Dollar',

  // ── Rate source attribution ──
  rate_source:       'BOQ Thailand Standard / Department of Public Works and Town & Country Planning 2024',
  rate_year:         '2024',
  rate_mat_source:   'Department of Public Works and Town & Country Planning — Construction Material Price Index 2024',
  rate_mat_ref:      'DPT Standard Cost Estimation 2024 (inflated +3%)',
  rate_mat_includes: 'Delivery, wastage allowance (5-10% by material type)',
  rate_lab_source:   'Ministry of Labour — Minimum Wage + Skilled Trade Premium 2024',
  rate_lab_basis:    'Basic wage + 25% (Social Security 5%, compensation fund 1%, benefits 19%)',
  rate_lab_prod:     'DPT productivity standards by trade',
  rate_lab_crew:     'Skilled workers + helpers as per trade standards',
  rate_eq_source:    'DPT Machinery Hire Rates 2024',
  rate_eq_alloc:     'Based on work type and duration requirements',
  rate_eq_basis:     'Per day (8 hours), operator cost included where stated',

  // ── Material Rates (DPT 2024, THB) ──
  rates: {
    IfcDuct:{rate:1350,unit:'M',desc:'ท่อลมเหล็กชุบสังกะสี (เฉลี่ย 400มม.)'},
    IfcDuctSegment:{rate:1350,unit:'M',desc:'ท่อลมส่วนตรง'},
    IfcDuctFitting:{rate:3100,unit:'EA',desc:'อุปกรณ์ข้อต่อท่อลม (ข้องอ, ทีส์)'},
    IfcPipe:{rate:395,unit:'M',desc:'ท่อ PVC/HDPE (เฉลี่ย 100มม.)'},
    IfcPipeSegment:{rate:395,unit:'M',desc:'ท่อส่วนตรง'},
    IfcPipeFitting:{rate:780,unit:'EA',desc:'อุปกรณ์ข้อต่อท่อ'},
    IfcCableCarrier:{rate:640,unit:'M',desc:'รางเคเบิลเทรย์ (300มม.)'},
    IfcCableCarrierSegment:{rate:640,unit:'M',desc:'รางเคเบิลเทรย์ส่วนตรง'},
    IfcBeam:{rate:5600,unit:'M',desc:'คานเหล็กรูปพรรณ I-Beam'},
    IfcColumn:{rate:10200,unit:'M',desc:'เสาเหล็กรูปพรรณ'},
    IfcSlab:{rate:2350,unit:'M2',desc:'พื้น ค.ส.ล. หนา 250มม.'},
    IfcWall:{rate:1180,unit:'M2',desc:'ผนังก่ออิฐบล็อก 150มม.'},
    IfcWallStandardCase:{rate:1180,unit:'M2',desc:'ผนังมาตรฐาน'},
    IfcCurtainWall:{rate:6200,unit:'M2',desc:'ผนังกระจก'},
    IfcCovering:{rate:1520,unit:'M2',desc:'วัสดุปูพื้น/ฝ้าเพดาน'},
    IfcRoof:{rate:1950,unit:'M2',desc:'หลังคาเหล็ก'},
    IfcLightFixture:{rate:3950,unit:'EA',desc:'โคมไฟ LED'},
    IfcOutlet:{rate:1020,unit:'EA',desc:'เต้ารับไฟฟ้า'},
    IfcDoor:{rate:23500,unit:'EA',desc:'ชุดประตู'},
    IfcWindow:{rate:12800,unit:'EA',desc:'หน้าต่าง'},
    IfcBuildingElementProxy:{rate:6950,unit:'EA',desc:'องค์ประกอบอื่นๆ'},
    IfcFlowTerminal:{rate:28500,unit:'EA',desc:'ปลายทางระบบปรับอากาศ'},
    IfcFurnishingElement:{rate:9800,unit:'EA',desc:'เครื่องเรือน'},
    IfcFurniture:{rate:12200,unit:'EA',desc:'เฟอร์นิเจอร์'},
    IfcPlate:{rate:780,unit:'M2',desc:'แผ่นเหล็ก'},
    IfcMember:{rate:2600,unit:'M',desc:'ชิ้นส่วนเหล็ก'},
    IfcRailing:{rate:2300,unit:'M',desc:'ราวกันตก'},
    IfcStair:{rate:36800,unit:'EA',desc:'บันได'},
    IfcStairFlight:{rate:18000,unit:'EA',desc:'ช่วงบันได'},
    IfcFooting:{rate:2600,unit:'EA',desc:'ฐานรากแผ่'},
    IfcPile:{rate:6950,unit:'EA',desc:'เสาเข็ม'},
    IfcReinforcingBar:{rate:370,unit:'KG',desc:'เหล็กเสริม'},
    IfcFlowSegment:{rate:980,unit:'M',desc:'ท่อส่งระบบ'},
    IfcFlowFitting:{rate:1650,unit:'EA',desc:'ข้อต่อระบบท่อ'},
    IfcFlowController:{rate:3680,unit:'EA',desc:'อุปกรณ์ควบคุมการไหล'},
    IfcEnergyConversionDevice:{rate:69500,unit:'EA',desc:'อุปกรณ์แปลงพลังงาน'},
    IfcFlowTreatmentDevice:{rate:9800,unit:'EA',desc:'อุปกรณ์บำบัด'},
    IfcFlowMovingDevice:{rate:28500,unit:'EA',desc:'อุปกรณ์ขับเคลื่อนของไหล'},
    IfcFlowStorageDevice:{rate:41000,unit:'EA',desc:'อุปกรณ์เก็บกักของไหล'},
    IfcElectricAppliance:{rate:3950,unit:'EA',desc:'เครื่องใช้ไฟฟ้า'},
  },
  rates_default: {rate:4100,unit:'EA',desc:'องค์ประกอบอื่นๆ'},

  // ── Labor Rates (Ministry of Labour 2024, THB) ──
  labor_rates: {
    HVAC_TECH:     {rate_per_day:1500, crew_size:2, trade:'ช่างเทคนิคระบบปรับอากาศ (ฝีมือ)',
                    productivity:{IfcDuct:18,IfcDuctSegment:18,IfcDuctFitting:12}},
    PLUMBER:       {rate_per_day:1350, crew_size:2, trade:'ช่างประปา (ฝีมือ)',
                    productivity:{IfcPipe:25,IfcPipeSegment:25,IfcPipeFitting:15}},
    ELECTRICIAN:   {rate_per_day:1450, crew_size:2, trade:'ช่างไฟฟ้า (ฝีมือ)',
                    productivity:{IfcCableCarrier:30,IfcCableCarrierSegment:30,IfcLightFixture:20,IfcOutlet:25}},
    STEEL_ERECTOR: {rate_per_day:1600, crew_size:4, trade:'ช่างเหล็ก (ฝีมือ)',
                    productivity:{IfcBeam:8,IfcColumn:6}},
    CONCRETE_GANG: {rate_per_day:1200, crew_size:6, trade:'ทีมงานคอนกรีต (ผสม)',
                    productivity:{IfcSlab:35}},
    MASON:         {rate_per_day:1280, crew_size:3, trade:'ช่างก่อ (ฝีมือ) + กรรมกร',
                    productivity:{IfcWall:12,IfcWallStandardCase:12}},
    LABORER:       {rate_per_day:770,  crew_size:1, trade:'กรรมกรทั่วไป',
                    productivity:{}},
  },

  // ── Equipment Rates (DPT 2024, THB) ──
  equipment_rates: {
    MOBILE_CRANE_20T: {rate_per_day:15200, desc:'เครน 20 ตัน'},
    TOWER_CRANE:      {rate_per_day:18000, desc:'ทาวเวอร์เครน'},
    CONCRETE_PUMP:    {rate_per_day:7800,  desc:'รถปั๊มคอนกรีต'},
    SCISSOR_LIFT_8M:  {rate_per_day:2350,  desc:'กระเช้าไฮดรอลิก 8ม.'},
    WELDING_MACHINE:  {rate_per_day:530,   desc:'เครื่องเชื่อม 300A'},
    GENERATOR_5KVA:   {rate_per_day:780,   desc:'เครื่องปั่นไฟ 5KVA'},
  },
  equipment_allocation: {
    IfcBeam:         {equipment:'MOBILE_CRANE_20T', duration_factor:0.5},
    IfcColumn:       {equipment:'MOBILE_CRANE_20T', duration_factor:0.5},
    IfcSlab:         {equipment:'CONCRETE_PUMP',    duration_factor:0.3},
    IfcDuct:         {equipment:'SCISSOR_LIFT_8M',  duration_factor:0.4},
    IfcCableCarrier: {equipment:'SCISSOR_LIFT_8M',  duration_factor:0.3},
  },
};
