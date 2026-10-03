// ko_KR.js — Korean (South Korea)
// ISO 3166-1: KR — Flag: 🇰🇷
// To create your project locale: copy this file → MyProject_TRL.js → edit what differs
//

// S226 §R2 (2026-10-03): the LABEL strings moved out of this file into iDempiere-format XML —
// viewer/i18n/AD_Message_Trl_ko_KR.xml (base English: viewer/i18n/ad_message_base.csv). This file keeps the
// COST data only: currency, rate-book attribution, rates. Loaded by locale_loader.js beside i18n/ko_KR.json.

var _TRL_LOCALE = {

  // ── Identity ──
  iso: 'KR',            // ISO 3166-1 alpha-2 (drives flag emoji)
  lang: 'ko',           // ISO 639-1 language
  locale: 'ko_KR',      // combined

  // ── Currency ──
  cur: 'KRW',
  cur2: 'USD',
  cur_rate: 1464,         // 1 USD = 1350 KRW
  cur_name: '대한민국 원',
  cur2_name: '미국 달러',

  // ── Rate source attribution ──
  rate_source:       'KICT Standard Unit Price / Korea Institute of Construction Technology 2024',
  rate_year:         '2024',
  rate_mat_source:   '한국건설기술연구원 표준품셈 자재단가 2024',
  rate_mat_ref:      '조달청 나라장터 단가 2024 (+2.5% 물가상승 반영)',
  rate_mat_includes: '운반비, 할증률 포함 (자재별 5-10%)',
  rate_lab_source:   '대한건설협회 시중노임단가 2024',
  rate_lab_basis:    '기본노임 + 30% (국민연금, 건강보험, 퇴직급여 등)',
  rate_lab_prod:     '표준품셈 기준 생산성',
  rate_lab_crew:     '기능공 + 보통인부 (직종별 표준편성)',
  rate_eq_source:    '건설기계 임대가격표 / 한국건설기계산업협회 2024',
  rate_eq_alloc:     '공종 및 공기 기반 배분',
  rate_eq_basis:     '1일 기준 (8시간), 운전원 포함 여부 명시',

  // ── Material Rates (표준품셈 2024) ──
  rates: {
    IfcDuct:{rate:52000,unit:'M',desc:'아연도강판 덕트 (평균 400mm)'},
    IfcDuctSegment:{rate:52000,unit:'M',desc:'덕트 세그먼트'},
    IfcDuctFitting:{rate:115000,unit:'EA',desc:'덕트 이음쇠 (엘보, 티)'},
    IfcPipe:{rate:15500,unit:'M',desc:'배관 (SGP/PVC 평균 100mm)'},
    IfcPipeSegment:{rate:15500,unit:'M',desc:'배관 세그먼트'},
    IfcPipeFitting:{rate:32000,unit:'EA',desc:'배관 이음쇠'},
    IfcCableCarrier:{rate:26500,unit:'M',desc:'케이블 트레이 (300mm)'},
    IfcCableCarrierSegment:{rate:26500,unit:'M',desc:'케이블 트레이 세그먼트'},
    IfcBeam:{rate:215000,unit:'M',desc:'구조용 H형강 보'},
    IfcColumn:{rate:395000,unit:'M',desc:'구조용 강재 기둥'},
    IfcSlab:{rate:92000,unit:'M2',desc:'철근콘크리트 슬래브 250mm'},
    IfcWall:{rate:48000,unit:'M2',desc:'조적벽 150mm'},
    IfcWallStandardCase:{rate:48000,unit:'M2',desc:'표준벽'},
    IfcCurtainWall:{rate:250000,unit:'M2',desc:'커튼월'},
    IfcCovering:{rate:62000,unit:'M2',desc:'바닥/천장 마감재'},
    IfcRoof:{rate:78000,unit:'M2',desc:'금속 지붕'},
    IfcLightFixture:{rate:155000,unit:'EA',desc:'LED 조명기구'},
    IfcOutlet:{rate:42000,unit:'EA',desc:'전기 콘센트'},
    IfcDoor:{rate:920000,unit:'EA',desc:'문 세트'},
    IfcWindow:{rate:520000,unit:'EA',desc:'창호'},
    IfcBuildingElementProxy:{rate:280000,unit:'EA',desc:'기타 요소'},
    IfcFlowTerminal:{rate:1150000,unit:'EA',desc:'공조 단말기'},
    IfcFurnishingElement:{rate:385000,unit:'EA',desc:'가구'},
    IfcFurniture:{rate:495000,unit:'EA',desc:'가구'},
    IfcPlate:{rate:32000,unit:'M2',desc:'강판'},
    IfcMember:{rate:105000,unit:'M',desc:'강재 부재'},
    IfcRailing:{rate:95000,unit:'M',desc:'난간'},
    IfcStair:{rate:1450000,unit:'EA',desc:'계단'},
    IfcStairFlight:{rate:720000,unit:'EA',desc:'계단 플라이트'},
    IfcFooting:{rate:105000,unit:'EA',desc:'기초 푸팅'},
    IfcPile:{rate:285000,unit:'EA',desc:'기초 말뚝'},
    IfcReinforcingBar:{rate:1450,unit:'KG',desc:'철근'},
    IfcFlowSegment:{rate:42000,unit:'M',desc:'유체 세그먼트'},
    IfcFlowFitting:{rate:68000,unit:'EA',desc:'유체 이음쇠'},
    IfcFlowController:{rate:152000,unit:'EA',desc:'유량 제어기'},
    IfcEnergyConversionDevice:{rate:2850000,unit:'EA',desc:'에너지 변환 장치'},
    IfcFlowTreatmentDevice:{rate:395000,unit:'EA',desc:'유체 처리 장치'},
    IfcFlowMovingDevice:{rate:1150000,unit:'EA',desc:'유체 이송 장치'},
    IfcFlowStorageDevice:{rate:1650000,unit:'EA',desc:'유체 저장 장치'},
    IfcElectricAppliance:{rate:165000,unit:'EA',desc:'전기 기기'},
  },
  rates_default: {rate:165000,unit:'EA',desc:'기타 요소'},

  // ── Labor Rates ──
  labor_rates: {
    HVAC_TECH:     {rate_per_day:245000, crew_size:2, trade:'공조 기능공 (숙련)',
                    productivity:{IfcDuct:16,IfcDuctSegment:16,IfcDuctFitting:10}},
    PLUMBER:       {rate_per_day:225000, crew_size:2, trade:'배관공 (숙련)',
                    productivity:{IfcPipe:23,IfcPipeSegment:23,IfcPipeFitting:14}},
    ELECTRICIAN:   {rate_per_day:235000, crew_size:2, trade:'전기공 (숙련)',
                    productivity:{IfcCableCarrier:28,IfcCableCarrierSegment:28,IfcLightFixture:18,IfcOutlet:22}},
    STEEL_ERECTOR: {rate_per_day:265000, crew_size:4, trade:'철골공 (숙련)',
                    productivity:{IfcBeam:7,IfcColumn:5}},
    CONCRETE_GANG: {rate_per_day:195000, crew_size:6, trade:'콘크리트 타설반',
                    productivity:{IfcSlab:32}},
    MASON:         {rate_per_day:210000, crew_size:3, trade:'조적공 (숙련) + 보통인부',
                    productivity:{IfcWall:11,IfcWallStandardCase:11}},
    LABORER:       {rate_per_day:145000, crew_size:1, trade:'보통인부',
                    productivity:{}},
  },

  // ── Equipment Rates ──
  equipment_rates: {
    MOBILE_CRANE_20T: {rate_per_day:650000, desc:'이동식 크레인 20톤'},
    TOWER_CRANE:      {rate_per_day:920000, desc:'타워 크레인'},
    CONCRETE_PUMP:    {rate_per_day:480000, desc:'콘크리트 펌프카'},
    SCISSOR_LIFT_8M:  {rate_per_day:120000, desc:'시저 리프트 8m'},
    WELDING_MACHINE:  {rate_per_day:35000,  desc:'용접기 300A'},
    GENERATOR_5KVA:   {rate_per_day:48000,  desc:'발전기 5KVA'},
  },
  equipment_allocation: {
    IfcBeam:         {equipment:'MOBILE_CRANE_20T', duration_factor:0.5},
    IfcColumn:       {equipment:'MOBILE_CRANE_20T', duration_factor:0.5},
    IfcSlab:         {equipment:'CONCRETE_PUMP',    duration_factor:0.3},
    IfcDuct:         {equipment:'SCISSOR_LIFT_8M',  duration_factor:0.4},
    IfcCableCarrier: {equipment:'SCISSOR_LIFT_8M',  duration_factor:0.3},
  },
};
