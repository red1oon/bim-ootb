// bn_BD.js — Bengali (Bangladesh)
// ISO 3166-1: BD — Flag: 🇧🇩
// To create your project locale: copy this file → MyProject_TRL.js → edit what differs
//

// S226 §R2 (2026-10-03): the LABEL strings moved out of this file into iDempiere-format XML —
// viewer/i18n/AD_Message_Trl_bn_BD.xml (base English: viewer/i18n/ad_message_base.csv). This file keeps the
// COST data only: currency, rate-book attribution, rates. Loaded by locale_loader.js beside i18n/bn_BD.json.

var _TRL_LOCALE = {

  // ── Identity ──
  iso: 'BD',            // ISO 3166-1 alpha-2 (drives flag emoji)
  lang: 'bn',           // ISO 639-1 language
  locale: 'bn_BD',      // combined

  // ── Currency ──
  cur: '৳',
  cur2: 'USD',
  cur_rate: 120,          // 1 USD = 110 BDT (2024)
  cur_name: 'বাংলাদেশি টাকা',
  cur2_name: 'মার্কিন ডলার',

  // ── Rate source attribution ──
  rate_source:       'PWD Schedule of Rates Bangladesh 2024',
  rate_year:         '2024',
  rate_mat_source:   'PWD — গণপূর্ত বিভাগ উপকরণ মূল্যতালিকা 2024',
  rate_mat_ref:      'PWD ক্যাটালগ (+৬% মূল্যস্ফীতি সমন্বয়)',
  rate_mat_includes: 'পরিবহন ব্যয়, অপচয় ভাতা (৫-৮%)',
  rate_lab_source:   'শ্রম ও কর্মসংস্থান মন্ত্রণালয় — নির্মাণ মজুরি সূচক 2024',
  rate_lab_basis:    'মূল মজুরি + ২০% (প্রভিডেন্ট ফান্ড, উৎসব বোনাস)',
  rate_lab_prod:     'PWD — দৈনিক উৎপাদন মান',
  rate_lab_crew:     'দলনেতা + সহকারী সংখ্যা মান অনুযায়ী',
  rate_eq_source:    'ICSB — সরঞ্জাম ভাড়া হার 2024',
  rate_eq_alloc:     'কাজের ধরন ও মেয়াদ অনুযায়ী বরাদ্দ',
  rate_eq_basis:     'প্রতিদিন (৮ ঘণ্টা), প্রযোজ্য ক্ষেত্রে অপারেটরসহ',

  // ── Material Rates (PWD Bangladesh 2024) ──
  rates: {
    IfcDuct:{rate:2200,unit:'M',desc:'গ্যালভানাইজড স্টিল ডাক্ট (গড় ৪০০মিমি)'},
    IfcDuctSegment:{rate:2200,unit:'M',desc:'ডাক্ট সেগমেন্ট'},
    IfcDuctFitting:{rate:5500,unit:'EA',desc:'ডাক্ট ফিটিং (এলবো, টি)'},
    IfcPipe:{rate:650,unit:'M',desc:'PVC/HDPE পাইপ (গড় ১০০মিমি)'},
    IfcPipeSegment:{rate:650,unit:'M',desc:'পাইপ সেগমেন্ট'},
    IfcPipeFitting:{rate:1400,unit:'EA',desc:'পাইপ ফিটিং'},
    IfcCableCarrier:{rate:950,unit:'M',desc:'কেবল ট্রে (৩০০মিমি)'},
    IfcCableCarrierSegment:{rate:950,unit:'M',desc:'কেবল ট্রে সেগমেন্ট'},
    IfcBeam:{rate:9500,unit:'M',desc:'স্ট্রাকচারাল স্টিল আই-বিম'},
    IfcColumn:{rate:16000,unit:'M',desc:'স্ট্রাকচারাল স্টিল কলাম'},
    IfcSlab:{rate:4200,unit:'M2',desc:'আরসি স্ল্যাব ২৫০মিমি'},
    IfcWall:{rate:2200,unit:'M2',desc:'ব্রিক/ব্লক দেওয়াল ১৫০মিমি'},
    IfcWallStandardCase:{rate:2200,unit:'M2',desc:'আদর্শ দেওয়াল'},
    IfcCurtainWall:{rate:18000,unit:'M2',desc:'কার্টেন ওয়াল'},
    IfcCovering:{rate:2800,unit:'M2',desc:'ফ্লোর/সিলিং ফিনিশিং'},
    IfcRoof:{rate:5500,unit:'M2',desc:'মেটাল রুফ শিট'},
    IfcLightFixture:{rate:6500,unit:'EA',desc:'LED আলো'},
    IfcOutlet:{rate:1800,unit:'EA',desc:'বৈদ্যুতিক সকেট'},
    IfcDoor:{rate:35000,unit:'EA',desc:'দরজা সেট'},
    IfcWindow:{rate:22000,unit:'EA',desc:'জানালা'},
    IfcBuildingElementProxy:{rate:12000,unit:'EA',desc:'বিবিধ উপাদান'},
    IfcFlowTerminal:{rate:45000,unit:'EA',desc:'HVAC টার্মিনাল'},
    IfcFurnishingElement:{rate:18000,unit:'EA',desc:'আসবাবপত্র উপাদান'},
    IfcFurniture:{rate:22000,unit:'EA',desc:'আসবাবপত্র'},
    IfcPlate:{rate:1400,unit:'M2',desc:'স্টিল প্লেট'},
    IfcMember:{rate:4800,unit:'M',desc:'স্টিল প্রোফাইল'},
    IfcRailing:{rate:4200,unit:'M',desc:'রেলিং'},
    IfcStair:{rate:65000,unit:'EA',desc:'সিঁড়ি'},
    IfcStairFlight:{rate:32000,unit:'EA',desc:'সিঁড়ির ফ্লাইট'},
    IfcFooting:{rate:5500,unit:'EA',desc:'ফুটিং ভিত্তি'},
    IfcPile:{rate:12000,unit:'EA',desc:'পাইল'},
    IfcReinforcingBar:{rate:85,unit:'KG',desc:'রড (রিবার)'},
    IfcFlowSegment:{rate:1800,unit:'M',desc:'ফ্লো সেগমেন্ট'},
    IfcFlowFitting:{rate:2900,unit:'EA',desc:'ফ্লো ফিটিং'},
    IfcFlowController:{rate:6500,unit:'EA',desc:'ফ্লো কন্ট্রোলার'},
    IfcEnergyConversionDevice:{rate:120000,unit:'EA',desc:'শক্তি রূপান্তর সরঞ্জাম'},
    IfcFlowTreatmentDevice:{rate:18000,unit:'EA',desc:'ট্রিটমেন্ট সরঞ্জাম'},
    IfcFlowMovingDevice:{rate:48000,unit:'EA',desc:'ফ্লুইড মুভিং সরঞ্জাম'},
    IfcFlowStorageDevice:{rate:72000,unit:'EA',desc:'ফ্লুইড স্টোরেজ সরঞ্জাম'},
    IfcElectricAppliance:{rate:7500,unit:'EA',desc:'বৈদ্যুতিক সরঞ্জাম'},
  },
  rates_default: {rate:8000,unit:'EA',desc:'বিবিধ উপাদান'},

  // ── Labor Rates ──
  labor_rates: {
    HVAC_TECH:     {rate_per_day:1100, crew_size:2, trade:'HVAC টেকনিশিয়ান (দক্ষ)',
                    productivity:{IfcDuct:16,IfcDuctSegment:16,IfcDuctFitting:10}},
    PLUMBER:       {rate_per_day:850,  crew_size:2, trade:'পাইপ মিস্ত্রি (দক্ষ)',
                    productivity:{IfcPipe:23,IfcPipeSegment:23,IfcPipeFitting:13}},
    ELECTRICIAN:   {rate_per_day:900,  crew_size:2, trade:'ইলেকট্রিশিয়ান (দক্ষ)',
                    productivity:{IfcCableCarrier:27,IfcCableCarrierSegment:27,IfcLightFixture:18,IfcOutlet:22}},
    STEEL_ERECTOR: {rate_per_day:1100, crew_size:4, trade:'রড বাঁধাই মিস্ত্রি (দক্ষ)',
                    productivity:{IfcBeam:7,IfcColumn:5}},
    CONCRETE_GANG: {rate_per_day:650,  crew_size:6, trade:'কংক্রিট ঢালাই দল',
                    productivity:{IfcSlab:32}},
    MASON:         {rate_per_day:900,  crew_size:3, trade:'রাজমিস্ত্রি (দক্ষ) + সহকারী',
                    productivity:{IfcWall:11,IfcWallStandardCase:11}},
    LABORER:       {rate_per_day:500,  crew_size:1, trade:'সাধারণ শ্রমিক',
                    productivity:{}},
  },

  // ── Equipment Rates ──
  equipment_rates: {
    MOBILE_CRANE_20T: {rate_per_day:25000, desc:'মোবাইল ক্রেন ২০ টন'},
    TOWER_CRANE:      {rate_per_day:35000, desc:'টাওয়ার ক্রেন'},
    CONCRETE_PUMP:    {rate_per_day:15000, desc:'কংক্রিট পাম্প ট্রাক'},
    SCISSOR_LIFT_8M:  {rate_per_day:4500,  desc:'সিজার লিফট ৮মি'},
    WELDING_MACHINE:  {rate_per_day:950,   desc:'ওয়েল্ডিং মেশিন ৩০০A'},
    GENERATOR_5KVA:   {rate_per_day:1400,  desc:'জেনসেট ৫KVA'},
  },
  equipment_allocation: {
    IfcBeam:         {equipment:'MOBILE_CRANE_20T', duration_factor:0.5},
    IfcColumn:       {equipment:'MOBILE_CRANE_20T', duration_factor:0.5},
    IfcSlab:         {equipment:'CONCRETE_PUMP',    duration_factor:0.3},
    IfcDuct:         {equipment:'SCISSOR_LIFT_8M',  duration_factor:0.4},
    IfcCableCarrier: {equipment:'SCISSOR_LIFT_8M',  duration_factor:0.3},
  },
};
