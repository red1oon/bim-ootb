#!/usr/bin/env python3
# trl_batch_2026-11-18_ko_form.py — T5c (bim-compiler prompts/TRL_TRILOGY_STANDARD.md), Korean screen names, table AD_Form. MACHINE translations by Claude (Anthropic), 2026-11-18, no human review; same terms as
# trl_batch_2026-11-18_ko_window.py. Applied ONCE, then build_i18n.py; erp/i18n/machine/AD_Form_Trl_ko_KR.xml is the source.
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ko_apply
KO = {
 'Account Info': '계정 정보', 'Add Authorization Mail Account': '인증 메일 계정 추가', 'Apache Felix Web Console': 'Apache Felix 웹 콘솔', 'BOM and Formula Info': 'BOM 및 배합 정보',
 'Bank Statement Create From Batch': '배치에서 은행 명세서 생성', 'CRP Info': 'CRP 정보', 'Captured Process Parameter': '캡처된 프로세스 매개변수', 'Compare Context Help Suggestion': '상황별 도움말 제안 비교',
 'Compare Field Suggestion': '필드 제안 비교', 'Customize Grid View': '그리드 보기 사용자 정의', 'Generate Movement Manual': '이동 생성(수동)', 'Generate Work Order': '작업 지시 생성', 'MRP Info': 'MRP 정보',
 'Manufacturing Workflow Editor': '제조 워크플로 편집기', 'Material Receipt Distribution Order': '자재 입고 배분 오더', 'Order Receipt and Issue': '주문 입고 및 출고', 'POS': 'POS', 'Payroll Action Notice': '급여 조치 통지',
 'Planned Order Approval': '계획 오더 승인', 'Product Configuration BOM': '제품 구성 BOM', 'Report Wizard': '보고서 마법사', 'Resource Load View': '자원 부하 보기', 'Submit Maintenance Request': '유지보수 요청 제출',
 'Tab Editor': '탭 편집기', 'idempiereMonitor': 'iDempiere 모니터',
}
if __name__ == '__main__':
    miss = ko_apply.apply('AD_Form', KO, 'erp/tools/trl_batch_2026-11-18_ko_form.py')
    if miss: print('§TRL_KO uncovered:', miss[:20])
