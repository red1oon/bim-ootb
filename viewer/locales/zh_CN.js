// zh_CN.js — Simplified Chinese (China)
// ISO 3166-1: CN — Flag: 🇨🇳
// Based on en_MY.js structure — rates reflect Tier 1 city construction costs
//

// S226 §R2 (2026-10-03): the LABEL strings moved out of this file into iDempiere-format XML —
// viewer/i18n/AD_Message_Trl_zh_CN.xml (base English: viewer/i18n/ad_message_base.csv). This file keeps the
// COST data only: currency, rate-book attribution, rates. Loaded by locale_loader.js beside i18n/zh_CN.json.

var _TRL_LOCALE = {

  // ── Identity ──
  iso: 'CN',            // ISO 3166-1 alpha-2 (drives flag emoji)
  lang: 'zh',           // ISO 639-1 language
  locale: 'zh_CN',      // combined

  // ── Currency ──
  cur: 'CNY',
  cur2: 'USD',
  cur_rate: 6.81,         // 1 USD = 7.24 CNY
  cur_name: 'Chinese Yuan',
  cur2_name: '美元',

  // ── Rate source attribution ──
  rate_source:       'GB/T 50500-2013 / China Engineering Cost Information Network 2024',
  rate_year:         '2024',
  rate_mat_source:   '中国工程造价信息网 2024',
  rate_mat_ref:      '住建部工程造价指导价 2022-2024（上浮 +3%）',
  rate_mat_includes: '含运输费、损耗（按材料类型5-10%）',
  rate_lab_source:   '住建部建筑业人工费指导价 2024',
  rate_lab_basis:    '基本工资 + 30%（社保18%、公积金12%）',
  rate_lab_prod:     '按各工种定额标准',
  rate_lab_crew:     '技术工 + 普工按工种标准配置',
  rate_eq_source:    '住建部施工机械台班费用定额 2024',
  rate_eq_alloc:     '按工程类型及工期需求配置',
  rate_eq_basis:     '每台班（8小时），含操作人员费用（注明处）',

  // ── Material Rates (GB/T 50500 2024, CNY, Tier 1 city) ──
  rates: {
    IfcDuct:{rate:268,unit:'M',desc:'镀锌钢板风管（平均400mm）'},
    IfcDuctSegment:{rate:268,unit:'M',desc:'风管段'},
    IfcDuctFitting:{rate:620,unit:'EA',desc:'风管配件（弯头、三通）'},
    IfcPipe:{rate:78,unit:'M',desc:'PVC/HDPE管道（平均100mm）'},
    IfcPipeSegment:{rate:78,unit:'M',desc:'管道段'},
    IfcPipeFitting:{rate:155,unit:'EA',desc:'管道配件'},
    IfcCableCarrier:{rate:126,unit:'M',desc:'电缆桥架（300mm）'},
    IfcCableCarrierSegment:{rate:126,unit:'M',desc:'电缆桥架段'},
    IfcBeam:{rate:1105,unit:'M',desc:'结构钢工字梁'},
    IfcColumn:{rate:2030,unit:'M',desc:'结构钢柱'},
    IfcSlab:{rate:462,unit:'M2',desc:'钢筋混凝土楼板 250mm'},
    IfcWall:{rate:235,unit:'M2',desc:'砌块墙 150mm'},
    IfcWallStandardCase:{rate:235,unit:'M2',desc:'标准墙体'},
    IfcCurtainWall:{rate:1220,unit:'M2',desc:'幕墙'},
    IfcCovering:{rate:300,unit:'M2',desc:'地面/天棚饰面'},
    IfcRoof:{rate:386,unit:'M2',desc:'金属屋面'},
    IfcLightFixture:{rate:788,unit:'EA',desc:'LED灯具'},
    IfcOutlet:{rate:203,unit:'EA',desc:'电源插座'},
    IfcDoor:{rate:4630,unit:'EA',desc:'门套装'},
    IfcWindow:{rate:2565,unit:'EA',desc:'窗户'},
    IfcBuildingElementProxy:{rate:1380,unit:'EA',desc:'其他构件'},
    IfcFlowTerminal:{rate:5685,unit:'EA',desc:'暖通末端设备'},
    IfcFurnishingElement:{rate:1950,unit:'EA',desc:'家具'},
    IfcFurniture:{rate:2436,unit:'EA',desc:'家具'},
    IfcPlate:{rate:154,unit:'M2',desc:'钢板'},
    IfcMember:{rate:520,unit:'M',desc:'钢构件'},
    IfcRailing:{rate:455,unit:'M',desc:'栏杆'},
    IfcStair:{rate:7308,unit:'EA',desc:'楼梯'},
    IfcStairFlight:{rate:3572,unit:'EA',desc:'楼梯梯段'},
    IfcFooting:{rate:520,unit:'EA',desc:'基础'},
    IfcPile:{rate:1380,unit:'EA',desc:'桩基'},
    IfcReinforcingBar:{rate:73,unit:'KG',desc:'钢筋'},
    IfcFlowSegment:{rate:195,unit:'M',desc:'流体管段'},
    IfcFlowFitting:{rate:325,unit:'EA',desc:'流体配件'},
    IfcFlowController:{rate:731,unit:'EA',desc:'流体控制设备'},
    IfcEnergyConversionDevice:{rate:13804,unit:'EA',desc:'能量转换设备'},
    IfcFlowTreatmentDevice:{rate:1950,unit:'EA',desc:'流体处理设备'},
    IfcFlowMovingDevice:{rate:5685,unit:'EA',desc:'流体输送设备'},
    IfcFlowStorageDevice:{rate:8120,unit:'EA',desc:'流体储存设备'},
    IfcElectricAppliance:{rate:788,unit:'EA',desc:'电气设备'},
  },
  rates_default: {rate:812,unit:'EA',desc:'其他构件'},

  // ── Labor Rates (CNY, Tier 1 city daily rates) ──
  labor_rates: {
    HVAC_TECH:     {rate_per_day:450, crew_size:2, trade:'暖通技工（高级）',
                    productivity:{IfcDuct:18,IfcDuctSegment:18,IfcDuctFitting:12}},
    PLUMBER:       {rate_per_day:400, crew_size:2, trade:'管道工（高级）',
                    productivity:{IfcPipe:25,IfcPipeSegment:25,IfcPipeFitting:15}},
    ELECTRICIAN:   {rate_per_day:420, crew_size:2, trade:'电工（高级）',
                    productivity:{IfcCableCarrier:30,IfcCableCarrierSegment:30,IfcLightFixture:20,IfcOutlet:25}},
    STEEL_ERECTOR: {rate_per_day:480, crew_size:4, trade:'钢结构安装工（高级）',
                    productivity:{IfcBeam:8,IfcColumn:6}},
    CONCRETE_GANG: {rate_per_day:350, crew_size:6, trade:'混凝土施工班组',
                    productivity:{IfcSlab:35}},
    MASON:         {rate_per_day:380, crew_size:3, trade:'砌筑工（高级）+ 普工',
                    productivity:{IfcWall:12,IfcWallStandardCase:12}},
    LABORER:       {rate_per_day:250, crew_size:1, trade:'普通工',
                    productivity:{}},
  },

  // ── Equipment Rates (CNY per day) ──
  equipment_rates: {
    MOBILE_CRANE_20T: {rate_per_day:3200, desc:'汽车起重机 20吨'},
    TOWER_CRANE:      {rate_per_day:3800, desc:'塔式起重机'},
    CONCRETE_PUMP:    {rate_per_day:1650, desc:'混凝土泵车'},
    SCISSOR_LIFT_8M:  {rate_per_day:500,  desc:'剪叉式升降平台 8m'},
    WELDING_MACHINE:  {rate_per_day:120,  desc:'电焊机 300A'},
    GENERATOR_5KVA:   {rate_per_day:180,  desc:'发电机 5KVA'},
  },
  equipment_allocation: {
    IfcBeam:         {equipment:'MOBILE_CRANE_20T', duration_factor:0.5},
    IfcColumn:       {equipment:'MOBILE_CRANE_20T', duration_factor:0.5},
    IfcSlab:         {equipment:'CONCRETE_PUMP',    duration_factor:0.3},
    IfcDuct:         {equipment:'SCISSOR_LIFT_8M',  duration_factor:0.4},
    IfcCableCarrier: {equipment:'SCISSOR_LIFT_8M',  duration_factor:0.3},
  },
};
