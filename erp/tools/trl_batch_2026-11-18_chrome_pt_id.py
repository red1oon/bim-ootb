#!/usr/bin/env python3
# trl_batch_2026-11-18_chrome_pt_id.py — T5b (bim-compiler prompts/TRL_TRILOGY_STANDARD.md): the 46 app strings (chrome keys that had machine text for the first 8 languages only)
# for pt_BR and id_ID. Applied ONCE by `python3 erp/tools/trl_batch_2026-11-18_chrome_pt_id.py`, then `python3 erp/tools/build_i18n.py`; after that the XML is the source.
# PROVENANCE: MACHINE translations written by Claude (Anthropic) in this session, 2026-11-18, for this app. NOT from a published language pack; no human review. A key whose English has a published
# pack row (ref msg:/el:) keeps the pack text first at run time (src=pack); these rows are the fallback and the text of the keys the packs do not carry. Kept as written in the English:
# the markup of login.sub, the {0} slot of help.doc.none, the "Kernel-ERP — {}" / "{} ›" wrappers (fmt, in chrome_base.csv) around login.title / login.ok, and the names PoC, ad_seed.db.
import csv, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import trl_xml
ERP = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); I18N = os.path.join(ERP, 'i18n'); MACH = os.path.join(I18N, 'machine')
KEYS = ['login.title', 'login.sub', 'login.language', 'login.selectTenant', 'login.selectUser', 'login.tenantsBack', 'login.role', 'login.client', 'login.org', 'login.back', 'login.ok', 'login.user1', 'login.userN',
        'login.noRoles', 'login.demoReady', 'login.demoPoc', 'hdr.search', 'hdr.filter', 'hdr.logout', 'hdr.menu', 'main.placeholder', 'tb.new', 'tb.copy', 'tb.save', 'tb.saveNew', 'tb.delete', 'tb.ignore', 'tb.refresh',
        'tb.process', 'tb.print', 'tb.zoom', 'tb.first', 'tb.prev', 'tb.next', 'tb.last', 'tb.record', 'tb.of', 'tb.records', 'tb.grid', 'tb.form', 'inline.unsaved', 'help.dym', 'help.doc.usage', 'help.doc.none', 'help.doc.more', 'help.reserved']
T = {
 'pt_BR': ['Entrar', 'Demonstração offline · <b>seleção</b> de identidade e contexto (sem senha) — carregada de <b>ad_seed.db</b>', 'Idioma', 'Selecione uma empresa', 'Selecione um usuário', '‹ Empresas', 'Perfil', 'Empresa', 'Organização', '‹ Voltar', 'Entrar',
           'usuário', 'usuários', '(sem perfis)', 'demo · pronta', 'demo · PoC', 'Pesquisar no menu…', 'Filtrar menu…', 'Sair', 'Menu', 'Selecione um item do menu para abrir uma janela.', 'Novo', 'Copiar', 'Salvar', 'Salvar e novo', 'Excluir',
           'Desfazer alterações', 'Atualizar', 'Processar', 'Imprimir', 'Zoom cruzado', 'Primeiro registro', 'Registro anterior', 'Próximo registro', 'Último registro', 'Registro', 'de', 'registros', 'Grade', 'Formulário', '● não salvo',
           'Você quis dizer', 'Digite # e um número de documento', 'Nenhum documento #{0}', 'mais', '@ é reservado e ainda não faz nada'],
 'id_ID': ['Masuk', 'Demo offline · <b>pemilihan</b> identitas dan konteks (tanpa kata sandi) — diambil dari <b>ad_seed.db</b>', 'Bahasa', 'Pilih sebuah tenant', 'Pilih seorang pengguna', '‹ Tenant', 'Peran', 'Klien', 'Organisasi', '‹ Kembali', 'Masuk',
           'pengguna', 'pengguna', '(tanpa peran)', 'demo · siap', 'demo · PoC', 'Cari di menu…', 'Saring menu…', 'Keluar', 'Menu', 'Pilih item menu untuk membuka jendela.', 'Baru', 'Salin', 'Simpan', 'Simpan & baru', 'Hapus',
           'Batalkan perubahan', 'Segarkan', 'Proses', 'Cetak', 'Zoom silang', 'Rekaman pertama', 'Rekaman sebelumnya', 'Rekaman berikutnya', 'Rekaman terakhir', 'Rekaman', 'dari', 'rekaman', 'Tabel', 'Formulir', '● belum disimpan',
           'Maksud Anda', 'Ketik # lalu nomor dokumen', 'Tidak ada dokumen #{0}', 'lainnya', '@ dicadangkan dan belum melakukan apa pun'],
}
assert all(len(v) == len(KEYS) for v in T.values()), 'one text per key, per language'
base = {}
with open(os.path.join(I18N, 'chrome_base.csv'), newline='', encoding='utf-8') as f:
    for r in csv.DictReader(f): base[r['value']] = (int(r['ad_message_id']), r['msgtext'])
LABEL = 'ERP chrome (AD_Message, app-own ids). MACHINE translation by Claude (Anthropic), 2026-11-18, trl_batch_2026-11-18_chrome_pt_id.py (TRL_TRILOGY_STANDARD.md T5b) — NOT from a published iDempiere language pack; no human review.'
for lang, texts in T.items():
    fn = os.path.join(MACH, 'AD_Message_Trl_%s.xml' % lang)
    rows = {rid: (trl, o, t) for rid, (trl, o, t) in trl_xml.read(fn).items()}; added = 0
    for k, text in zip(KEYS, texts):
        rid, en = base[k]
        if rid in rows: continue                      # idempotent: a row already there is never overwritten
        rows[rid] = ('Y', en, text); added += 1
    trl_xml.write(fn, lang, 'AD_Message', LABEL, [(i, a, b, c) for i, (a, b, c) in rows.items()])
    print('§TRL_BATCH lang=%s added=%d rows=%d file=%s' % (lang, added, len(rows), os.path.basename(fn)))
