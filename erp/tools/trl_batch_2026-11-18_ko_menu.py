#!/usr/bin/env python3
# trl_batch_2026-11-18_ko_menu.py — T5c (bim-compiler prompts/TRL_TRILOGY_STANDARD.md), Korean screen names, table AD_Menu. Same terms and provenance as trl_batch_2026-11-18_ko_window.py
# (MACHINE translations by Claude (Anthropic), 2026-11-18, no human review). Menu names equal to a window name reuse that window's Korean (ko_apply.py: Viewer first, then another ERP table, then this batch).
# Applied ONCE, then `python3 erp/tools/build_i18n.py`; after that erp/i18n/machine/AD_Menu_Trl_ko_KR.xml is the source.
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ko_apply
KO = {
 '1099 Extract': '1099 추출', 'Accounting Fact Daily': '회계 사실 일별', 'Accounting Fact Period': '회계 사실 기간', 'Accounting Fact Reconciliation (manual)': '회계 사실 대사(수동)', 'Accounting Rules': '회계 규칙',
 'Accounting Setup': '회계 설정', 'Add Authorization Account': '인증 계정 추가', 'Aging': '연령 분석', 'Allocation': '배정', 'Application Dictionary': '애플리케이션 사전', 'Application Packaging': '애플리케이션 패키징',
 'Apply Pack In from Folder': '폴더에서 패키지 가져오기 적용', 'Archive Viewer': '보관 문서 뷰어', 'Asset Delivery Details': '자산 인도 상세', 'Asset Delivery Month': '자산 인도 월별', 'Asset Transactions': '자산 트랜잭션',
 'Assets': '자산', 'Auto Allocation': '자동 배정', 'Automatic account reconciliation': '계정 자동 대사', 'BOM Drop': 'BOM 투입', 'BOM Viewer': 'BOM 뷰어', 'Bank Register Report': '은행 장부 보고서',
 'Bank/Cash Transfer Process': '은행/현금 이체 프로세스', 'Business Partner Detail': '비즈니스 파트너 상세', 'Business Partner Open': '비즈니스 파트너 미결', 'Business Partner Organization': '비즈니스 파트너 조직',
 'Business Partner Rules': '비즈니스 파트너 규칙', 'Business Partner Setup': '비즈니스 파트너 설정', 'C_Invoice Calculate Tax': 'C_Invoice 세금 계산', 'Cache Reset': '캐시 초기화', 'Cash Flow Report': '현금 흐름 보고서',
 'Change Base Language': '기본 언어 변경', 'Clean Orphan Cascade Records': '고아 연쇄 레코드 정리', 'Collaboration': '협업', 'Commission Run Detail': '수수료 실행 상세', 'Complete MFA Registration': 'MFA 등록 완료',
 'Convert passwords to hashes': '비밀번호를 해시로 변환', 'Copy Role': '역할 복사', 'Copy Tenant': '테넌트 복사', 'Costing': '원가 계산', 'Create AP Expense Invoices': '매입 경비 청구서 생성',
 'Create Asset from Project': '프로젝트에서 자산 생성', 'Create Costing Records': '원가 레코드 생성', 'Create Foreign Key': '외래 키 생성', 'Create PO from Requisition': '구매 요청에서 구매 주문 생성',
 'Create Sales Orders from Expense': '경비에서 판매 주문 생성', 'Create Table Index': '테이블 인덱스 생성', 'Create/Complete Table': '테이블 생성/완료', 'Create/Update Table Partition': '테이블 파티션 생성/갱신',
 'Customer Assets': '고객 자산', 'Customer Service': '고객 서비스', 'Daily Invoice': '일별 청구서', 'Data': '데이터', 'Data Import': '데이터 가져오기', 'Database export': '데이터베이스 내보내기',
 'Database transfer': '데이터베이스 전송', 'Delete Import': '가져오기 삭제', 'Delete Trace Logs': '추적 로그 삭제', 'Deliver Assets': '자산 인도', 'Depreciation Expense Entry': '감가상각비 입력',
 'Depreciation Processing': '감가상각 처리', 'Depreciation Setup': '감가상각 설정', 'EDI': 'EDI', 'Enable Native Sequence': '네이티브 시퀀스 사용', 'Export Format Generator': '내보내기 형식 생성기',
 'External Authorization': '외부 인증', 'Financial Reporting': '재무 보고', 'General Rules': '일반 규칙', 'Generate Charges': '비용 항목 생성', 'Generate Invoices': '청구서 생성', 'Generate Invoices (manual)': '청구서 생성(수동)',
 'Generate Model': '모델 생성', 'Generate PO from Project': '프로젝트에서 구매 주문 생성', 'Generate PO from Sales Order': '판매 주문에서 구매 주문 생성', 'Generate Production from Project': '프로젝트에서 생산 생성',
 'Generate Shipments': '출하 생성', 'Generate Shipments (manual)': '출하 생성(수동)', 'HBA Attendance': 'HBA 출근', 'HouseKeeping': '하우스키핑', 'Import CSV Process': 'CSV 가져오기 프로세스',
 'Import File Loader': '가져오기 파일 로더', 'Indented Bill of Material': '들여쓰기 자재 명세서', 'Initial Tenant Setup': '초기 테넌트 설정', 'Initial Tenant Setup Review': '초기 테넌트 설정 검토',
 'Inventory Valuation Report': '재고 평가 보고서', 'Invoice Detail and Margin': '청구서 상세 및 마진', 'Invoice Inquiry': '청구서 조회', 'Invoice Not Realized Gain/Loss': '청구서 미실현 손익',
 'Invoice Requests': '청구서 요청', 'Invoice Tax': '청구서 세금', 'Invoice Transactions (Acct)': '청구서 트랜잭션(회계)', 'Invoice Transactions (Doc)': '청구서 트랜잭션(문서)', 'Issue to Project': '프로젝트로 출고',
 'Java Version': 'Java 버전', 'Language Setup': '언어 설정', 'Load Bank Statement': '은행 명세서 불러오기', 'Maintenance': '유지보수', 'Manufacturing': '제조', 'Matching PO-Receipt-Invoice': '구매 주문-입고-청구서 대응',
 'Material Management Rules': '자재 관리 규칙', 'Material Management and Pricing': '자재 관리 및 가격', 'Material Receipt Details': '자재 입고 상세', 'Material Reference': '자재 참조', 'Material Transactions': '자재 트랜잭션',
 'Merge Entities': '엔티티 병합', 'Migrate ID': 'ID 마이그레이션', 'Migrate Storage Provider': '저장소 제공자 마이그레이션', 'Monthly Invoice': '월별 청구서', 'Monthly Invoice Prod Cat': '월별 청구서 제품 분류',
 'Monthly Invoice Product': '월별 청구서 제품', 'Monthly Invoice Vendor': '월별 청구서 공급업체', 'Multi Factor Authentication': '다중 인증', 'Office': '사무실', 'Open Confirmation Details': '미결 확인 상세',
 'Open Confirmations': '미결 확인', 'Open Items (Aging)': '미결 항목(연령)', 'Open Items (Financial Movements and Aging)': '미결 항목(재무 변동 및 연령)', 'Open Orders': '미결 주문', 'Open Requisitions': '미결 구매 요청',
 'Order Batch Process': '주문 배치 프로세스', 'Order Detail': '주문 상세', 'Order Transactions': '주문 트랜잭션', 'Organization Rules': '조직 규칙', 'POS Key Generate': 'POS 키 생성', 'Partner Relations': '파트너 관계',
 'Payment Allocation': '결제 배정', 'Payment Details': '결제 상세', 'Payment Print/Export': '결제 인쇄/내보내기', 'Payment Selection (manual)': '결제 선택(수동)', 'Performance Analysis and Accounting': '성과 분석 및 회계',
 'Performance Indicators': '성과 지표', 'Performance Measurement': '성과 측정', 'Performance Measurement Setup': '성과 측정 설정', 'Period Control Management': '기간 통제 관리', 'Plugin Manager': '플러그인 관리자',
 'Price List Setup': '가격표 설정', 'Print Dunning Letters': '독촉장 인쇄', 'Print Format Detail': '인쇄 형식 상세', 'Print Invoices': '청구서 인쇄', 'Printing': '인쇄', 'Product Attribute Grid': '제품 속성 그리드',
 'Product Attributes': '제품 속성', 'Product Cost': '제품 원가', 'Product Cost Detail': '제품 원가 상세', 'Product Cost Summary': '제품 원가 요약', 'Product Organization': '제품 조직', 'Product Setup': '제품 설정',
 'Product Transaction Summary': '제품 트랜잭션 요약', 'Product Transaction Value': '제품 트랜잭션 금액', 'Product/Component Where Used': '제품/구성품 사용처', 'Prognosis (Forecast)': '전망(예측)',
 'Prognosis Approval': '전망 승인', 'Project Cycle Report': '프로젝트 주기 보고서', 'Project Detail Accounting Report': '프로젝트 상세 회계 보고서', 'Project Lines not Issued': '출고되지 않은 프로젝트 행',
 'Project Management': '프로젝트 관리', 'Project Margin (Work Order)': '프로젝트 마진(작업 지시)', 'Project POs not Issued': '발행되지 않은 프로젝트 구매 주문', 'Project Setup and Use': '프로젝트 설정 및 사용',
 'Quarter Invoice Product': '분기 청구서 제품', 'Quarterly Invoice Customer by Product': '분기 청구서 고객별 제품', 'Quarterly Invoice Customer by Vendor': '분기 청구서 고객별 공급업체', 'Quote convert': '견적 변환',
 'Quote-to-Invoice (Sales)': '견적-청구서(판매)', 'RePrice Order/Invoice': '주문/청구서 재가격', 'Recalculate Cube': '큐브 재계산', 'Receivables Write-Off': '매출채권 대손 처리', 'Recompile DB Objects': 'DB 객체 재컴파일',
 'Recreate Storage Reservation': '저장 예약 재생성', 'Recurring Run': '반복 실행', 'Register MFA': 'MFA 등록', 'Reopen Order': '주문 다시 열기', 'Reopen Request': '요청 다시 열기', 'Replenish Report': '보충 보고서',
 'Replication Data': '복제 데이터', 'Reporting': '보고', 'Request EMail Processor': '요청 이메일 처리기', 'Request OT': 'OT 요청', 'Request Setup': '요청 설정', 'Requests Approval': '요청 승인',
 'Requisition-to-Invoice (Purchasing)': '구매 요청-청구서(구매)', 'Reset Accounting': '회계 초기화', 'Reset Allocation': '배정 초기화', 'Reset Password': '비밀번호 재설정', 'Resubmit Posting': '전기 재제출',
 'Returns': '반품', 'Revenue Recognition Run': '수익 인식 실행', 'Revoke MFA Trusted Device': 'MFA 신뢰 장치 해제', 'RfQ Unanswered': '미응답 견적 요청', 'Role Access Update': '역할 접근 갱신',
 'Rollup BOM Cost': 'BOM 원가 롤업', 'SQL Process': 'SQL 프로세스', 'SQL Query': 'SQL 쿼리', 'Sales Invoices': '판매 청구서', 'Sales Management': '판매 관리', 'Sales Orders': '판매 주문', 'Sales Setup': '판매 설정',
 'Sales and Marketing': '영업 및 마케팅', 'Security': '보안', 'Send Mail Text': '메일 문구 보내기', 'Sequence Check': '순번 점검', 'Server': '서버', 'Service': '서비스', 'Setup': '설정', 'Setup Replication': '복제 설정',
 'Setup Wizard': '설정 마법사', 'Shipment Details': '출하 상세', 'Shipments': '출하', 'Simple Fact View': '간단 회계 사실 보기', 'Standard Cost Update': '표준 원가 갱신', 'Standard Job': '표준 직무',
 'Statement of Accounts': '계정 명세서', 'Storage Cleanup': '저장소 정리', 'Storage Detail': '저장소 상세', 'Storage per Product': '제품별 저장소', 'Support Users vs Roles': '지원 사용자 대 역할',
 'Synchronize Doc Translation': '문서 번역 동기화', 'Synchronize Print Format based on Report View': '보고서 보기 기반 인쇄 형식 동기화', 'Synchronize Terminology': '용어 동기화', 'System Admin': '시스템 관리',
 'System Rules': '시스템 규칙', 'Tax Setup': '세금 설정', 'Tenant Accounting Processor': '테넌트 회계 처리기', 'Tenant Rules': '테넌트 규칙', 'Test Export Model': '내보내기 모델 테스트', 'Test Import Model': '가져오기 모델 테스트',
 'Transaction Detail': '트랜잭션 상세', 'Translation Import/Export': '번역 가져오기/내보내기', 'Tree Maintenance': '트리 관리', 'Trial Balance': '시산표', 'UUID Generator': 'UUID 생성기', 'UnAllocated Invoices': '미배정 청구서',
 'UnAllocated Payments': '미배정 결제', 'UnLink Business Partner Org': '비즈니스 파트너 조직 연결 해제', 'UnReconciled Payments': '미대사 결제', 'Universal substitution': '범용 대체', 'Unlock Account': '계정 잠금 해제',
 'Unreconciled accounting facts': '미대사 회계 사실', 'Unregister MFA Mechanism': 'MFA 방식 등록 해제', 'Utility': '유틸리티', 'Validate BOM Flags': 'BOM 플래그 검증', 'Validate Business Partner': '비즈니스 파트너 검증',
 'Vendor Selection': '공급업체 선택', 'Verify BOM Structure': 'BOM 구조 확인', 'Verify Document Types': '문서 유형 확인', 'Verify Language Configuration': '언어 구성 확인', 'Verify Migration Process': '마이그레이션 프로세스 확인',
 'Warehouse Organization': '창고 조직', 'Weekly Invoice': '주별 청구서', 'Weekly Invoice Prod Cat': '주별 청구서 제품 분류', 'Work Order (OT)': '작업 지시(OT)', 'Work Shop': '작업장', 'Workflow Activities': '워크플로 활동',
 'Workflow Editor': '워크플로 편집기', 'Workflow to Tenant': '테넌트별 워크플로',
}
if __name__ == '__main__':
    miss = ko_apply.apply('AD_Menu', KO, 'erp/tools/trl_batch_2026-11-18_ko_menu.py')
    if miss: print('§TRL_KO uncovered:', miss[:20])
