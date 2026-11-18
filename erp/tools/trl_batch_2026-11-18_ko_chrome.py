#!/usr/bin/env python3
# trl_batch_2026-11-18_ko_chrome.py — T5c (bim-compiler prompts/TRL_TRILOGY_STANDARD.md): the 58 ERP chrome keys in Korean (AD_Message, app-own ids 1000000+) into
# erp/i18n/machine/AD_Message_Trl_ko_KR.xml. MACHINE translations by Claude (Anthropic), 2026-11-18, no human review. Where the BIM Viewer already has a Korean text for the SAME English
# (viewer/i18n/machine/AD_Message_Trl_ko_KR.xml) it is used, so the two apps agree (counted in the §TRL_BATCH line). Kept as in the English: <b> markup, the {0} {1} {2} slots, PoC, ad_seed.db.
import csv, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import trl_xml, ko_apply
ERP = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); I18N = os.path.join(ERP, 'i18n')
KO = {
 'login.title': '로그인', 'login.sub': '오프라인 데모 · 신원 및 컨텍스트 <b>선택</b>(비밀번호 없음) — <b>ad_seed.db</b>에서 불러옴', 'login.language': '언어', 'login.selectTenant': '테넌트를 선택하세요',
 'login.selectUser': '사용자를 선택하세요', 'login.tenantsBack': '‹ 테넌트', 'login.role': '역할', 'login.client': '테넌트', 'login.org': '조직', 'login.back': '‹ 뒤로', 'login.ok': '로그인',
 'login.user1': '사용자', 'login.userN': '사용자', 'login.noRoles': '(역할 없음)', 'login.demoReady': '데모 · 준비됨', 'login.demoPoc': '데모 · PoC', 'hdr.search': '메뉴 검색…', 'hdr.filter': '메뉴 필터…',
 'hdr.logout': '로그아웃', 'hdr.menu': '메뉴', 'main.placeholder': '창을 열려면 메뉴 항목을 선택하세요.', 'tb.new': '새로 만들기', 'tb.copy': '복사', 'tb.save': '저장', 'tb.saveNew': '저장 후 새로 만들기',
 'tb.delete': '삭제', 'tb.ignore': '변경 취소', 'tb.refresh': '새로 고침', 'tb.process': '처리', 'tb.print': '인쇄', 'tb.zoom': '교차 확대', 'tb.first': '첫 레코드', 'tb.prev': '이전 레코드',
 'tb.next': '다음 레코드', 'tb.last': '마지막 레코드', 'tb.record': '레코드', 'tb.of': '/', 'tb.records': '레코드', 'tb.grid': '그리드', 'tb.form': '양식', 'inline.unsaved': '● 저장 안 됨',
 'help.dym': '혹시 이것을 찾으셨나요', 'help.doc.usage': '# 다음에 문서 번호를 입력하세요', 'help.doc.none': '문서 #{0} 없음', 'help.doc.more': '더 보기', 'help.reserved': '@는 예약되어 있으며 아직 아무 동작도 하지 않습니다',
 'help.ask': '질문: 판매 주문은 어떻게 마감하나요?', 'help.window': '창', 'help.action': '동작', 'help.process': '프로세스', 'help.report': '보고서', 'help.allowed': '문서가 다음 상태일 때 허용됨',
 'help.also': '함께', 'help.guide': '가이드', 'help.none': '사전과 사용법 항목에서 일치하는 것이 없습니다.', 'help.english': '(영어)', 'help.translated': '빌드 세션에서 번역했으며 원어민 검수를 받지 않았습니다',
 'help.cliNote': '{0}은(는) {1}에서만 제공되며 {2}에서는 제공되지 않습니다',
}
base = {}
with open(os.path.join(I18N, 'chrome_base.csv'), newline='', encoding='utf-8') as f:
    for r in csv.DictReader(f): base[r['value']] = (int(r['ad_message_id']), r['msgtext'])
assert set(KO) <= set(base), sorted(set(KO) - set(base))
V = ko_apply.viewer_ko(); rows = []; reused = 0
for k, (rid, en) in base.items():
    if k not in KO: continue
    text = V[en] if en in V else KO[k]; reused += en in V
    rows.append((rid, 'Y', en, text))
trl_xml.write(os.path.join(I18N, 'machine', 'AD_Message_Trl_ko_KR.xml'), 'ko_KR', 'AD_Message', 'ERP chrome (AD_Message, app-own ids 1000000+). ERP machine source (not a published language pack) — Korean written for this app by Claude (Anthropic), 2026-11-18, erp/tools/trl_batch_2026-11-18_ko_chrome.py (TRL_TRILOGY_STANDARD.md T5c); no human review; Viewer Korean reused where the English is the same.', rows)
print('§TRL_BATCH lang=ko_KR chrome rows=%d of %d keys, reused from the Viewer=%d' % (len(rows), len(base), reused))
