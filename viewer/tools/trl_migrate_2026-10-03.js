#!/usr/bin/env node
// ⚠ ONE-SHOT MIGRATION (S226 §R2 SPEC R2.1) — the birth record of viewer/i18n/.
// Moves the Viewer's LABEL strings out of the 18 viewer/locales/<code>.js packs (where they sat beside
// currency + rate data) into iDempiere's own shape:
//   viewer/i18n/ad_message_base.csv           AD_Message base rows (id, value=the _TRL key, msgtext=the English, msgtype)
//   viewer/i18n/AD_Message_Trl_<lang>.xml ×17 org.compiere.install.Translation export format, one per non-base locale
// then STRIPS the label keys from viewer/locales/<code>.js (rates / currency / attribution stay — cost data, not language)
// and appends the 2026-10-03 machine batch (trl_batch_2026-10-03.js: new keys for the hardcoded screens + gap fills).
//
// EXTRACT, DON'T RETRANSLATE: the existing translations are read from the pre-migration packs at the pinned
// commit BIRTH (git show), never from the working tree — so a re-run reproduces the same XML byte for byte.
// GUARD: refuses to run when viewer/i18n/*.xml already exist (the XML is the hand-edited source from then on);
// pass --force only to re-create the birth state. Read the §TRL_MIGRATE lines after a run.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const T = require('./trl_common');
const BATCH = require('./trl_batch_2026-10-03.js');

const BIRTH = '4cd440ae';   // bim-ootb origin/main the morning of 2026-10-03 (#1830) — the last commit with labels in locales/*.js
const KEEP = /^(iso|lang|locale|cur|cur2|cur_rate|cur_name|cur2_name|rate_\w+|rates|rates_default|labor_rates|equipment_rates|equipment_allocation)$/;
// English that is the same in every language by rule (S226 Translation Rules) — a row equal to the English here is
// an affirmed translation (trl="Y"), not a gap.
const UNIVERSAL = new Set(['WBS', 'UOM', 'GPS', 'GUID', 'ERP', 'OK', 'CSV', 'X-Ray', '4D / 5D', 'BIM OOTB — Frictionless BIM']);   // the last = source_app, the brand (S226 Translation Rules)
const force = process.argv.includes('--force');

function log(s) { console.log('§TRL_MIGRATE ' + s); }
function birthPack(code) {
  const src = cp.execSync('git show ' + BIRTH + ':viewer/locales/' + code + '.js', { cwd: T.VIEWER, encoding: 'utf8', maxBuffer: 1 << 24 });
  return { src, data: new Function(src + ';return _TRL_LOCALE;')() };
}

(function main() {
  const existing = fs.existsSync(T.I18N) ? fs.readdirSync(T.I18N).filter(f => /^AD_Message_Trl_.*\.xml$/.test(f)) : [];
  if (existing.length && !force) { log('REFUSED — ' + existing.length + ' AD_Message_Trl_*.xml already exist; the XML is the source now. --force re-creates the birth state.'); process.exit(2); }
  fs.mkdirSync(T.I18N, { recursive: true });

  // 1. the base: en_MY labels in declaration order → ids from MAX_OFFICIAL_ID+1
  const base = birthPack(T.BASE).data;
  const labelKeys = Object.keys(base).filter(k => typeof base[k] === 'string' && !KEEP.test(k));
  const rows = labelKeys.map((k, i) => ({ id: T.MAX_OFFICIAL_ID + 1 + i, value: k, msgtext: base[k], msgtype: 'I' }));
  const fromJs = rows.length;
  // 2. the batch's NEW keys appended (never renumbering an existing id)
  const have = new Set(labelKeys);
  Object.keys(BATCH.NEW).forEach(k => {
    if (have.has(k)) { if (BATCH.NEW[k].en !== base[k]) throw new Error('batch NEW ' + k + ' collides with an existing key whose English differs'); return; }
    rows.push({ id: T.MAX_OFFICIAL_ID + 1 + rows.length, value: k, msgtext: BATCH.NEW[k].en, msgtype: BATCH.NEW[k].type || 'I' });
    have.add(k);
  });
  const ids = new Set(rows.map(r => r.id)); if (ids.size !== rows.length) throw new Error('duplicate ids');
  fs.writeFileSync(T.CSV, T.writeCsv(rows));
  log('base rows=' + rows.length + ' fromLocalesJs=' + fromJs + ' newBatch=' + (rows.length - fromJs) + ' ids=' + rows[0].id + '-' + rows[rows.length - 1].id + ' → ' + path.relative(T.VIEWER, T.CSV));

  // 3. one XML per non-base locale
  const batchKeys = new Set(Object.keys(BATCH.NEW));
  T.LOCALES.filter(l => l !== T.BASE).forEach(lang => {
    const pack = birthPack(lang).data;
    const tr = BATCH.TRL[lang] || {};
    let y = 0, n = 0, fromBatch = 0, fromPack = 0;
    const out = rows.map(r => {
      let text, trl;
      if (Object.prototype.hasOwnProperty.call(tr, r.value)) { text = tr[r.value]; trl = 'Y'; fromBatch++; }
      else if (!batchKeys.has(r.value) && typeof pack[r.value] === 'string') {
        text = pack[r.value];
        trl = (text !== r.msgtext || UNIVERSAL.has(r.msgtext)) ? 'Y' : 'N';
        if (trl === 'Y') fromPack++;
      } else { text = r.msgtext; trl = UNIVERSAL.has(r.msgtext) ? 'Y' : 'N'; }
      if (trl === 'N') text = r.msgtext;   // an untranslated row carries the English, honestly
      trl === 'Y' ? y++ : n++;
      return { id: r.id, trl, original: r.msgtext, text };
    });
    const comment = 'BIM OOTB Viewer — AD_Message_Trl ' + lang + ' — format: org.compiere.install.Translation export (iDempiere). ' +
      'Rows ' + rows[0].id + '-' + (T.MAX_OFFICIAL_ID + fromJs) + ' source=viewer/locales/' + lang + '.js @' + BIRTH + ' (S225/S226 sessions, machine translation, extracted 2026-10-03, not retranslated); ' +
      'rows ' + (T.MAX_OFFICIAL_ID + fromJs + 1) + '-' + rows[rows.length - 1].id + ' and every row listed in viewer/tools/trl_batch_2026-10-03*.js source=machine (Claude, Anthropic, 2026-10-03) — ' +
      'NOT from a published iDempiere language pack. trl="N" = not translated (English kept, counted apart). ' +
      'Base rows: viewer/i18n/ad_message_base.csv. Edit THIS file, then run: node viewer/tools/build_trl.js';
    fs.writeFileSync(T.xmlFile(lang), T.writeTrlXml(lang, comment, out));
    log('xml lang=' + lang + ' rows=' + out.length + ' trlY=' + y + ' trlN=' + n + ' fromPack=' + fromPack + ' fromBatch=' + fromBatch);
  });

  // 4. strip the label keys from the working-tree locales/*.js (keep identity + currency + rate attribution + rate objects)
  T.LOCALES.forEach(lang => {
    const file = path.join(T.VIEWER, 'locales', lang + '.js');
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    const first = lines.findIndex(l => /^\s{2}(h_|t_|s_|ui_|not_started|tagline|landing_|mep_)\w*\s*:/.test(l));
    if (first < 0) { log('strip lang=' + lang + ' already stripped'); return; }
    const head = lines.slice(0, first).filter(l => !/^\s{2}source_app\s*:/.test(l) && !/^\/\/ (_TRL_LOCALE overrides _TRL_DEFAULTS at runtime\.|Every key is shown here so you can see and edit the full set\.)/.test(l));
    while (head.length && (head[head.length - 1].trim() === '' || /^\s*\/\/ ──/.test(head[head.length - 1]))) head.pop();   // drop the dangling label-section comment
    const hdrNote = '// S226 §R2 (2026-10-03): the LABEL strings moved out of this file into iDempiere-format XML —';
    if (!head.some(l => l.startsWith(hdrNote))) {
      const at = head.findIndex(l => /^var _TRL_LOCALE/.test(l));
      const where = lang === T.BASE ? 'viewer/i18n/ad_message_base.csv (the base language has no _Trl file, as in iDempiere). This file keeps the'
        : 'viewer/i18n/AD_Message_Trl_' + lang + '.xml (base English: viewer/i18n/ad_message_base.csv). This file keeps the';
      head.splice(at, 0, hdrNote, '// ' + where, '// COST data only: currency, rate-book attribution, rates. Loaded by locale_loader.js beside i18n/' + lang + '.json.', '');
    }
    const src = head.join('\n') + '\n};\n';
    const data = new Function(src + ';return _TRL_LOCALE;')();
    const bad = Object.keys(data).filter(k => !KEEP.test(k));
    if (bad.length) throw new Error('strip ' + lang + ': non-cost keys would remain: ' + bad.join(','));
    fs.writeFileSync(file, src);
    log('strip lang=' + lang + ' kept=' + Object.keys(data).length + ' keys, removed=' + (lines.length - first) + ' lines');
  });
  log('DONE — now: node viewer/tools/build_trl.js');
})();
