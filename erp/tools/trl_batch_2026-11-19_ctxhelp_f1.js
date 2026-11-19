#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — MACHINE translation batch (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.17 F1/F3): the how-to messages of "The standard flow" §5-§8 in de_DE only
//   (owner 2026-11-19: "if to test translation shape then just one other language" - translations are frozen until the content shape matures; de_DE is that one language), into erp/i18n/machine/AD_CtxHelpMsg_Trl_<lang>.xml (legacy's Translation XML, lowest priority:
//   a published pack's translated row always wins, build_help_pack.js buildCtxTrl). Written by Claude (Anthropic) for this app, 2026-11-19; NOT reviewed by a native speaker.
//   Source = the English message of the same id (docs/ERPUserGuide.md, the build's AD_CtxHelpMsg); a window name is written as that language's pack names it and in bold, so the
//   build's linker links it. Existing rows are kept as they are; a row of this batch replaces only its own id. Read the § line after a run.
// Run: node erp/tools/trl_batch_2026-11-19_ctxhelp_f1.js   (then node erp/tools/build_help_pack.js)
'use strict';
const fs = require('fs'), path = require('path');
const B = require('./build_help_pack.js'), ERP = path.join(__dirname, '..');
const en = JSON.parse(fs.readFileSync(path.join(ERP, 'i18n', 'help', 'en_US', 'help.json'), 'utf8')).howto;
const P = (s) => '<p>' + B.md(s) + '</p>', UL = (items) => '<ul>' + items.map((s) => '<li>' + B.md(s) + '</li>').join('') + '</ul>';
const T = {
  de_DE: {
    5: ['5 · Nachbestellung', P('Der Verkauf hat den Lagerbestand gerade gesenkt. Statt bei jedem Verkauf nachzubestellen, ist die **Nachbestellung** der gestufte, prüfbare Schritt, der den Bestand jedes Produkts gegen seine Lagerregel beobachtet und vorschlägt, was zu bestellen ist — ausführlich beschrieben im Abschnitt POS unter **§P-4** (dieselbe Logik, dort über ein freundlicheres Panel erreichbar; hier nicht wiederholt).')],
    6: ['6 · Bestellung → Wareneingang → Lieferantenrechnung → Zuordnung', P('Einen Nachbestellungsvorschlag annehmen (oder eine Bestellung von Hand anlegen, ⌂ → Einkauf → **Bestellung**) und fertigstellen ist das Spiegelbild von Schritt 1 auf der Einkaufsseite. Es läuft genauso, nur umgekehrt:'),
      UL(['**Bestellung** — wird fertiggestellt; mit der Konfiguration dieser Daten (Obligo-Buchhaltung aus) bucht sie keinen Obligo- oder Reservierungseintrag — ein ehrliches, aus der Konfiguration folgendes ∅, keine Lücke.',
        '**Wareneingang** (`M_InOut`, eingehend) — die Ware kommt an, der Bestand steigt.',
        '**Rechnung (Lieferant)** — bucht Soll **Verrechnung Wareneingang** / Haben **Verbindlichkeiten**.',
        '**Zuordnung** (`M_MatchInv`) — gleicht das Paar Verrechnung Wareneingang / nicht fakturierte Eingänge aus, das Eingang und Rechnung jeweils eröffnet haben, einschließlich einer Preisabweichung der Rechnung, aufgeteilt gegen den Bestand zum Zeitpunkt der Zuordnung. Die eigene Buchung von `M_MatchPO` bleibt mit der Durchschnittskostenrechnung dieser Daten ein ehrliches ∅ (der Zweig für Abweichungsbuchungen greift nur bei Standardkosten) — eine Tatsache der Konfiguration, im Witness durch Umschalten bewiesen, nicht angenommen.'])],
    7: ['7 · Abschluss', P('Zwei weitere Buchungen schließen die Periode: ein **Journal** für alles, was kein Beleg ist (eine manuelle Abgrenzung, eine Übertragung zwischen Organisationen), und ein **Bankauszug**, der die Aufzeichnungen der Bank mit dem abgleicht, was das Hauptbuch erwartet. Sobald jeder Beleg der Periode gebucht ist, **ist** `fact_acct` der Periode das Hauptbuch — es gibt keinen eigenen Abschlussschritt, der etwas neu berechnet; die Rohbilanz ist eine laufende Auswertung derselben Zeilen und geht auf den Cent auf.')],
    8: ['8 · Finanzberichte', P('Ab hier ist alles nur lesende Auswertung: **Bilanz**, **Gewinn- und Verlustrechnung**, **Kapitalflussrechnung** und **Rohbilanz** sind alle gleichwertig zum echten Hauptbuch (§8 *Finanzberichte* weiter unten nennt die Zellenzahlen je Bericht), und dasselbe Hauptbuch bindet die Arbeitsmappen-Ansicht **NinjaExcel** (§8, „Excel Report“) in Ihr eigenes Tabellenlayout ein. Der **Finanzbericht** ist das Fenster dazu.')],
  },
};
const x = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'), a = (s) => x(s).replace(/"/g, '&quot;').replace(/\n/g, '&#10;').replace(/\r/g, '&#13;');
Object.keys(T).forEach((lang) => {
  const f = B.machineCtxFile(lang), old = B.readCtxTrl(f), rows = {};
  Object.keys(old).forEach((id) => { rows[id] = { id: Number(id), original: old[id].original, text: old[id].text }; });
  let added = 0, replaced = 0;
  Object.keys(T[lang]).forEach((sec) => {
    const k = Number(sec) - 1, e = en[k]; if (!e) throw new Error('no English how-to ' + sec);
    const id = 1000000 + k, [title, ...body] = T[lang][sec];
    if (rows[id]) replaced++; else added++;
    rows[id] = { id, original: B.titleP(e.name) + e.html, text: B.titleP(title) + body.join('') };
  });
  const comment = 'ERP how-to (AD_CtxHelpMsg, app-own ids 1000000+, VOCAB_MESSAGE_CATALOG §19.16 C2). ERP machine source (not a published language pack) - translated for this app by Claude (Anthropic): rows of 2026-11-16 (§12 H1b, moved by trl_move_ctxhelp_2026-11-19.js) and of 2026-11-19 (trl_batch_2026-11-19_ctxhelp_f1.js, §19.17 F1/F3); not reviewed by a native speaker.';
  const out = ['<?xml version="1.0" encoding="UTF-8" standalone="no"?>', '<!--' + comment.replace(/--/g, '- -') + '-->',
    '<!--<!DOCTYPE idempiereTrl PUBLIC "-//iDempiere//DTD iDempiere Translation 1.0//EN" "https://raw.githubusercontent.com/idempiere/idempiere/refs/heads/master/utils_dev/trl/idempiereTrl.dtd">-->',
    '<idempiereTrl language="' + lang + '" table="AD_CtxHelpMsg">'];
  Object.values(rows).sort((p, q) => p.id - q.id).forEach((r) => { out.push(' <row id="' + r.id + '" trl="Y">', '  <value column="MsgText" original="' + a(r.original) + '">' + x(r.text) + '</value>', ' </row>'); });
  out.push('</idempiereTrl>');
  fs.writeFileSync(f, out.join('\n') + '\n');
  const back = B.readCtxTrl(f), same = Object.values(rows).filter((r) => back[r.id] && back[r.id].text === r.text && back[r.id].original === r.original).length;
  console.log('§TRL_BATCH_CTXHELP_F1 ' + lang + ' rows=' + Object.keys(rows).length + ' added=' + added + ' replaced=' + replaced + ' read back equal=' + same + '/' + Object.keys(rows).length);
});
