# trl_xml.py — read/write the legacy Translation XML (org.compiere.install.Translation export) for the ERP's own `machine/` source.
# Same shape the Viewer's viewer/tools/trl_common.js writes (TRL_TRILOGY_STANDARD.md S-1): one file per table and language,
# <idempiereTrl language= table=>, <row id= trl=>, <value column=X original="English">translated</value>. Rows are matched by ID.
# AD_Message rows carry MsgText + MsgTip; every other table here carries Name only (T5c: screen names, not Description / Help).
import os, re, xml.etree.ElementTree as ET

DTD = ('<!--<!DOCTYPE idempiereTrl PUBLIC "-//iDempiere//DTD iDempiere Translation 1.0//EN" '
       '"https://raw.githubusercontent.com/idempiere/idempiere/refs/heads/master/utils_dev/trl/idempiereTrl.dtd">-->')

def _x(s): return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
def _a(s): return _x(s).replace('"', '&quot;').replace('\n', '&#10;').replace('\r', '&#13;')

def write(path, lang, table, comment, rows):
    """rows: [(id:int, trl:'Y'|'N', original:str, text:str)] — written in id order."""
    out = ['<?xml version="1.0" encoding="UTF-8" standalone="no"?>', '<!--' + comment.replace('--', '- -') + '-->', DTD,
           '<idempiereTrl language="%s" table="%s">' % (lang, table)]
    for rid, trl, orig, text in sorted(rows, key=lambda r: r[0]):
        out.append(' <row id="%d" trl="%s">' % (rid, trl))
        if table == 'AD_Message':
            out.append('  <value column="MsgText" original="%s">%s</value>' % (_a(orig), _x(text)))
            out.append('  <value column="MsgTip" original=""/>')
        else:
            out.append('  <value column="Name" original="%s">%s</value>' % (_a(orig), _x(text)))
        out.append(' </row>')
    out.append('</idempiereTrl>')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f: f.write('\n'.join(out) + '\n')

def read(path):
    """-> {id:int: (trl, original, text)}; {} when the file is absent. Strict: a row without its text column is an error."""
    if not os.path.exists(path): return {}
    root = ET.parse(path).getroot(); rows = {}
    for r in root.iter('row'):
        col = 'MsgText' if root.get('table') == 'AD_Message' else 'Name'
        v = next((x for x in r.iter('value') if x.get('column') == col), None)
        if v is None: raise ValueError('%s: row %s has no %s' % (path, r.get('id'), col))
        rows[int(r.get('id'))] = (r.get('trl'), v.get('original') or '', v.text or '')
    return rows
