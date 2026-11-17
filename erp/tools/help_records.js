// ⚠ DO NOT REMOVE — erp/tools/help_records.js: the ERP ADAPTER of the help query core (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.2 Step 2, §19.3 Step 3; design prompts/HELP_QUERY_CORE_DESIGN.md §2 D1, §4).
// READ THE LOG of W-HQ-SELF / W-HQ-COST / W-HQ-BOX after a build (common/help/tests/logs/). An exit code is not evidence.
// §19.3: the records are made by ONE pure function, erp/help_records_core.js build(), the same one the run time (erp/help_search.js indexFrom) calls. This file only reads the packs and the seed from disk.
// text(i) = pack.texts[i] for i < pack.texts.length, then the how-to texts, then the action descriptions; resolver(en, pack) rebuilds that list at run time (erp/erp_i18n.js loadHelp), so index.json holds no second copy.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ERP = path.join(__dirname, '..'), HELP = path.join(ERP, 'i18n', 'help');
const SEED = process.env.ERP_SEED_DB || path.join(ERP, 'ad_seed.db');
const CORE = require(path.join(ERP, 'help_records_core.js')), KINDS = CORE.kinds;
const LANGS = ['en_US', 'fr_FR', 'de_DE', 'ja_JP', 'zh_CN'];
const q = (sql) => { const r = cp.spawnSync('sqlite3', ['-readonly', '-json', SEED, sql], { encoding: 'utf8', maxBuffer: 1 << 29 }); if (r.status !== 0) throw new Error(r.stderr); return JSON.parse(r.stdout || '[]'); };
const readPack = (lang) => JSON.parse(fs.readFileSync(path.join(HELP, lang, 'help.json'), 'utf8'));
const load = (lang) => CORE.build({ q, en: readPack('en_US'), pack: lang === 'en_US' ? null : readPack(lang) });
module.exports = { app: 'erp', kinds: KINDS, langs: LANGS, load, resolver: CORE.resolver, extraTexts: CORE.extraTexts, outFile: (lang) => path.join(HELP, lang, 'index.json') };
