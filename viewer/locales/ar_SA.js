// ar_SA.js — Arabic (Saudi Arabia)
// ISO 3166-1: SA — Flag: 🇸🇦
// To create your project locale: copy this file → MyProject_TRL.js → edit what differs
//

// S226 §R2 (2026-10-03): the LABEL strings moved out of this file into iDempiere-format XML —
// viewer/i18n/AD_Message_Trl_ar_SA.xml (base English: viewer/i18n/ad_message_base.csv). This file keeps the
// COST data only: currency, rate-book attribution, rates. Loaded by locale_loader.js beside i18n/ar_SA.json.

var _TRL_LOCALE = {

  // ── Identity ──
  iso: 'SA',            // ISO 3166-1 alpha-2 (drives flag emoji)
  lang: 'ar',           // ISO 639-1 language
  locale: 'ar_SA',      // combined

  // ── Currency ──
  cur: 'SAR',
  cur2: 'USD',
  cur_rate: 3.75,         // 1 USD = 3.75 SAR
  cur_name: 'ريال سعودي',
  cur2_name: 'دولار أمريكي',

  // ── Rate source attribution ──
  rate_source:       'Saudi Aramco Rate Schedule / Royal Commission Rates 2024',
  rate_year:         '2024',
  rate_mat_source:   'جدول أسعار أرامكو السعودية / أسعار المواد 2024',
  rate_mat_ref:      'هيئة المواصفات والمقاييس — أسعار السوق 2024 (+3% تعديل)',
  rate_mat_includes: 'التوصيل، نسبة الهالك (5-10% حسب نوع المادة)',
  rate_lab_source:   'وزارة الموارد البشرية — معدلات أجور البناء 2024',
  rate_lab_basis:    'الأجر الأساسي + 30% (تأمينات اجتماعية، سكن، مواصلات)',
  rate_lab_prod:     'معايير الإنتاجية — الهيئة السعودية للمقاولين',
  rate_lab_crew:     'عمال مهرة + مساعدون حسب التخصص',
  rate_eq_source:    'أسعار تأجير المعدات — الهيئة الملكية 2024',
  rate_eq_alloc:     'توزيع حسب نوع العمل ومدة المشروع',
  rate_eq_basis:     'لكل يوم (8 ساعات)، تكلفة المشغل مشمولة حيث ذُكر',

  // ── Material Rates (أرامكو 2024) ──
  rates: {
    IfcDuct:{rate:145,unit:'M',desc:'مجاري هواء صاج مجلفن (متوسط 400مم)'},
    IfcDuctSegment:{rate:145,unit:'M',desc:'قطعة مجرى هواء'},
    IfcDuctFitting:{rate:320,unit:'EA',desc:'وصلات مجاري الهواء (كوع، تي)'},
    IfcPipe:{rate:42,unit:'M',desc:'أنابيب PVC/HDPE (متوسط 100مم)'},
    IfcPipeSegment:{rate:42,unit:'M',desc:'قطعة أنبوب'},
    IfcPipeFitting:{rate:85,unit:'EA',desc:'وصلات أنابيب'},
    IfcCableCarrier:{rate:68,unit:'M',desc:'حامل كابلات (300مم)'},
    IfcCableCarrierSegment:{rate:68,unit:'M',desc:'قطعة حامل كابلات'},
    IfcBeam:{rate:580,unit:'M',desc:'كمرة حديد هيكلي I'},
    IfcColumn:{rate:1050,unit:'M',desc:'عمود حديد هيكلي'},
    IfcSlab:{rate:245,unit:'M2',desc:'بلاطة خرسانة مسلحة 250مم'},
    IfcWall:{rate:125,unit:'M2',desc:'جدار بلوك 150مم'},
    IfcWallStandardCase:{rate:125,unit:'M2',desc:'جدار قياسي'},
    IfcCurtainWall:{rate:650,unit:'M2',desc:'جدار ستائري'},
    IfcCovering:{rate:165,unit:'M2',desc:'تشطيب أرضيات/أسقف'},
    IfcRoof:{rate:210,unit:'M2',desc:'سقف معدني'},
    IfcLightFixture:{rate:420,unit:'EA',desc:'وحدة إضاءة LED'},
    IfcOutlet:{rate:110,unit:'EA',desc:'مأخذ كهربائي'},
    IfcDoor:{rate:2400,unit:'EA',desc:'طقم باب'},
    IfcWindow:{rate:1350,unit:'EA',desc:'نافذة'},
    IfcBuildingElementProxy:{rate:720,unit:'EA',desc:'عنصر متنوع'},
    IfcFlowTerminal:{rate:2950,unit:'EA',desc:'طرفية تكييف'},
    IfcFurnishingElement:{rate:1050,unit:'EA',desc:'أثاث'},
    IfcFurniture:{rate:1280,unit:'EA',desc:'أثاث'},
    IfcPlate:{rate:82,unit:'M2',desc:'لوح صلب'},
    IfcMember:{rate:275,unit:'M',desc:'عنصر فولاذي'},
    IfcRailing:{rate:240,unit:'M',desc:'درابزين'},
    IfcStair:{rate:3800,unit:'EA',desc:'سلم'},
    IfcStairFlight:{rate:1850,unit:'EA',desc:'مسار سلم'},
    IfcFooting:{rate:275,unit:'EA',desc:'قاعدة أساس'},
    IfcPile:{rate:720,unit:'EA',desc:'خازوق أساس'},
    IfcReinforcingBar:{rate:38,unit:'KG',desc:'حديد تسليح'},
    IfcFlowSegment:{rate:105,unit:'M',desc:'قطعة تدفق'},
    IfcFlowFitting:{rate:175,unit:'EA',desc:'وصلة تدفق'},
    IfcFlowController:{rate:385,unit:'EA',desc:'متحكم تدفق'},
    IfcEnergyConversionDevice:{rate:7200,unit:'EA',desc:'جهاز تحويل طاقة'},
    IfcFlowTreatmentDevice:{rate:1020,unit:'EA',desc:'جهاز معالجة'},
    IfcFlowMovingDevice:{rate:2950,unit:'EA',desc:'جهاز نقل سوائل'},
    IfcFlowStorageDevice:{rate:4250,unit:'EA',desc:'جهاز تخزين سوائل'},
    IfcElectricAppliance:{rate:420,unit:'EA',desc:'جهاز كهربائي'},
  },
  rates_default: {rate:420,unit:'EA',desc:'عنصر متنوع'},

  // ── Labor Rates ──
  labor_rates: {
    HVAC_TECH:     {rate_per_day:165, crew_size:2, trade:'فني تكييف (ماهر)',
                    productivity:{IfcDuct:17,IfcDuctSegment:17,IfcDuctFitting:11}},
    PLUMBER:       {rate_per_day:145, crew_size:2, trade:'سباك (ماهر)',
                    productivity:{IfcPipe:24,IfcPipeSegment:24,IfcPipeFitting:14}},
    ELECTRICIAN:   {rate_per_day:155, crew_size:2, trade:'كهربائي (ماهر)',
                    productivity:{IfcCableCarrier:28,IfcCableCarrierSegment:28,IfcLightFixture:18,IfcOutlet:24}},
    STEEL_ERECTOR: {rate_per_day:175, crew_size:4, trade:'عامل حديد هيكلي (ماهر)',
                    productivity:{IfcBeam:7,IfcColumn:5}},
    CONCRETE_GANG: {rate_per_day:125, crew_size:6, trade:'فريق صب خرسانة',
                    productivity:{IfcSlab:33}},
    MASON:         {rate_per_day:135, crew_size:3, trade:'بنّاء (ماهر) + عمال',
                    productivity:{IfcWall:11,IfcWallStandardCase:11}},
    LABORER:       {rate_per_day:85,  crew_size:1, trade:'عامل عام',
                    productivity:{}},
  },

  // ── Equipment Rates ──
  equipment_rates: {
    MOBILE_CRANE_20T: {rate_per_day:1650, desc:'رافعة متنقلة 20 طن'},
    TOWER_CRANE:      {rate_per_day:1950, desc:'رافعة برجية'},
    CONCRETE_PUMP:    {rate_per_day:850,  desc:'مضخة خرسانة'},
    SCISSOR_LIFT_8M:  {rate_per_day:250,  desc:'رافعة مقصية 8م'},
    WELDING_MACHINE:  {rate_per_day:55,   desc:'ماكينة لحام 300A'},
    GENERATOR_5KVA:   {rate_per_day:82,   desc:'مولد كهرباء 5KVA'},
  },
  equipment_allocation: {
    IfcBeam:         {equipment:'MOBILE_CRANE_20T', duration_factor:0.5},
    IfcColumn:       {equipment:'MOBILE_CRANE_20T', duration_factor:0.5},
    IfcSlab:         {equipment:'CONCRETE_PUMP',    duration_factor:0.3},
    IfcDuct:         {equipment:'SCISSOR_LIFT_8M',  duration_factor:0.4},
    IfcCableCarrier: {equipment:'SCISSOR_LIFT_8M',  duration_factor:0.3},
  },
};
