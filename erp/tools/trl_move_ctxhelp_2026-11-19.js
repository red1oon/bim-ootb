#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — one-time move (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.16 C3): the how-to translations erp/tools/help_howto_<lang>.json (de_DE, zh_CN; the build
//   session's own translation, §12 H1b, not reviewed by a native speaker) -> erp/i18n/machine/AD_CtxHelpMsg_Trl_<lang>.xml, legacy's Translation XML (the project's one format,
//   §19.13), the shape trl_xml.py writes. Row id = the English message (AD_CtxHelpMsg 1000000+k, §19.16 C2), original = the English MsgText, text = the translator's HTML before
//   linking: the title paragraph <p><strong>…</strong></p> then one <p> per sentence. Nothing is translated here: every text is copied from the JSON. Read the § line after a run.
// Run once: node erp/tools/trl_move_ctxhelp_2026-11-19.js   (then the JSON files are deleted; build_help_pack.js reads the XML)
'use strict';
const fs = require('fs'), path = require('path');
const B = require('./build_help_pack.js'), ERP = path.join(__dirname, '..');
const en = JSON.parse(fs.readFileSync(path.join(ERP, 'i18n', 'help', 'en_US', 'help.json'), 'utf8')).howto;
const x = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'), a = (s) => x(s).replace(/"/g, '&quot;').replace(/\n/g, '&#10;').replace(/\r/g, '&#13;');
['de_DE', 'zh_CN'].forEach((lang) => {
  const f = path.join(__dirname, 'help_howto_' + lang + '.json'), src = JSON.parse(fs.readFileSync(f, 'utf8')), rows = [];
  src.rows.forEach((r) => {
    const k = en.findIndex((e) => e.ad_window_id === r.window); if (k < 0) throw new Error(lang + ': no English how-to for window ' + r.window);
    rows.push({ id: 1000000 + k, original: B.titleP(en[k].name) + en[k].html, text: B.titleP(r.name) + r.sentences.map((p) => '<p>' + B.md(p) + '</p>').join('') });
  });
  const comment = 'ERP how-to (AD_CtxHelpMsg, app-own ids 1000000+, VOCAB_MESSAGE_CATALOG §19.16 C2). ERP machine source (not a published language pack) - translated for this app by the build session (Claude, Anthropic), 2026-11-16 (§12 H1b), moved from erp/tools/help_howto_' + lang + '.json by erp/tools/trl_move_ctxhelp_2026-11-19.js (§19.16 C3); not reviewed by a native speaker.';
  const out = ['<?xml version="1.0" encoding="UTF-8" standalone="no"?>', '<!--' + comment.replace(/--/g, '- -') + '-->',
    '<!--<!DOCTYPE idempiereTrl PUBLIC "-//iDempiere//DTD iDempiere Translation 1.0//EN" "https://raw.githubusercontent.com/idempiere/idempiere/refs/heads/master/utils_dev/trl/idempiereTrl.dtd">-->',
    '<idempiereTrl language="' + lang + '" table="AD_CtxHelpMsg">'];
  rows.sort((p, q) => p.id - q.id).forEach((r) => { out.push(' <row id="' + r.id + '" trl="Y">', '  <value column="MsgText" original="' + a(r.original) + '">' + x(r.text) + '</value>', ' </row>'); });
  out.push('</idempiereTrl>');
  fs.writeFileSync(B.machineCtxFile(lang), out.join('\n') + '\n');
  const back = B.readCtxTrl(B.machineCtxFile(lang)), same = rows.filter((r) => back[r.id] && back[r.id].text === r.text && back[r.id].original === r.original).length;
  console.log('§TRL_MOVE_CTXHELP ' + lang + ' rows=' + rows.length + ' read back equal=' + same + '/' + rows.length + ' file=' + path.relative(ERP, B.machineCtxFile(lang)));
});
