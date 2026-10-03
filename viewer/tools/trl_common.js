// trl_common.js — the one CSV/XML read+write vocabulary shared by trl_migrate_2026-10-03.js and build_trl.js.
// Spec: bim-compiler prompts/S226_localisation.md §R2 SPEC R2.1.
// XML format = org.compiere.install.Translation export, copied from a real pack
// (~/.cache/erp_trl/gq/es_CO/AD_Message_Trl_es_CO.xml): declaration, comments, <idempiereTrl language table>,
// <row id trl>, <value column="MsgText" original>text</value>, <value column="MsgTip" original=""/>.
'use strict';
const fs = require('fs');
const path = require('path');

const VIEWER = path.resolve(__dirname, '..');
const I18N = path.join(VIEWER, 'i18n');
const CSV = path.join(I18N, 'ad_message_base.csv');
const MAX_OFFICIAL_ID = 999999;   // MTable.MAX_OFFICIAL_ID — app-own rows sit above it
const BASE = 'en_MY';             // the base language: its text IS the AD_Message row (no _Trl file, as in iDempiere)
const LOCALES = ['en_MY', 'en_US', 'en_GB', 'en_AU', 'ms_MY', 'de_DE', 'fr_FR', 'es_ES', 'zh_CN', 'th_TH', 'ja_JP', 'ko_KR',
  'ar_SA', 'pt_BR', 'id_ID', 'bn_BD', 'bl_BD', 'af_ZA'];
const DTD_LINE = '<!--<!DOCTYPE idempiereTrl PUBLIC "-//iDempiere//DTD iDempiere Translation 1.0//EN" ' +
  '"https://raw.githubusercontent.com/idempiere/idempiere/refs/heads/master/utils_dev/trl/idempiereTrl.dtd">-->';

// ── CSV (RFC 4180: quote fields holding , " or newline) ──────────────────────────────────────────────
function csvField(s) {
  s = String(s == null ? '' : s);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function writeCsv(rows) {   // rows: [{id, value, msgtext, msgtype}] in id order
  const out = ['ad_message_id,value,msgtext,msgtype'];
  rows.forEach(r => out.push([r.id, r.value, r.msgtext, r.msgtype].map(csvField).join(',')));
  return out.join('\n') + '\n';
}
function parseCsv(text) {
  const rows = []; let field = '', row = [], q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const hdr = rows.shift();
  if (!hdr || hdr.join(',') !== 'ad_message_id,value,msgtext,msgtype') throw new Error('ad_message_base.csv: unexpected header ' + (hdr || []).join(','));
  return rows.filter(r => r.length === 4).map(r => ({ id: Number(r[0]), value: r[1], msgtext: r[2], msgtype: r[3] }));
}
function readBase() { return parseCsv(fs.readFileSync(CSV, 'utf8')); }

// ── XML ──────────────────────────────────────────────────────────────────────────────────────────────
function xText(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function xAttr(s) { return xText(s).replace(/"/g, '&quot;').replace(/\n/g, '&#10;').replace(/\r/g, '&#13;'); }
function unx(s) {
  return String(s).replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d))).replace(/&#x([0-9a-fA-F]+);/g, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function xmlFile(lang) { return path.join(I18N, 'AD_Message_Trl_' + lang + '.xml'); }

/** writeTrlXml(lang, comment, rows) — rows: [{id, trl:'Y'|'N', original, text}] in id order. */
function writeTrlXml(lang, comment, rows) {
  const out = ['<?xml version="1.0" encoding="UTF-8" standalone="no"?>', '<!--' + comment.replace(/--/g, '- -') + '-->', DTD_LINE,
    '<idempiereTrl language="' + lang + '" table="AD_Message">'];
  rows.forEach(r => {
    out.push(' <row id="' + r.id + '" trl="' + r.trl + '">');
    out.push('  <value column="MsgText" original="' + xAttr(r.original) + '">' + xText(r.text) + '</value>');
    out.push('  <value column="MsgTip" original=""/>');
    out.push(' </row>');
  });
  out.push('</idempiereTrl>');
  return out.join('\n') + '\n';
}

/** parseTrlXml(text) — strict reader of the export format above. Throws on anything off-format. */
function parseTrlXml(text) {
  const root = text.match(/<idempiereTrl\s+language="([^"]+)"\s+table="([^"]+)">/);
  if (!root) throw new Error('no <idempiereTrl language table> root');
  if (root[2] !== 'AD_Message') throw new Error('table=' + root[2] + ', expected AD_Message');
  if (!/<\/idempiereTrl>\s*$/.test(text)) throw new Error('root not closed');
  const rows = []; const re = /<row id="(\d+)" trl="([YN])">\s*<value column="MsgText" original="([^"]*)">([\s\S]*?)<\/value>\s*<value column="MsgTip" original="([^"]*)"(?:\/>|>([\s\S]*?)<\/value>)\s*<\/row>/g;
  let m; while ((m = re.exec(text))) rows.push({ id: Number(m[1]), trl: m[2], original: unx(m[3]), text: unx(m[4]), tipOriginal: unx(m[5]), tip: m[6] == null ? '' : unx(m[6]) });
  const nRowTags = (text.match(/<row /g) || []).length;
  if (nRowTags !== rows.length) throw new Error(nRowTags + ' <row> tags but ' + rows.length + ' parsed in full — a row is off-format');
  return { language: root[1], table: root[2], rows };
}

module.exports = { VIEWER, I18N, CSV, MAX_OFFICIAL_ID, BASE, LOCALES, writeCsv, parseCsv, readBase, writeTrlXml, parseTrlXml, xmlFile, unx };
