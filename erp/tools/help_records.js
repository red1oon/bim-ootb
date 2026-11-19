// ⚠ DO NOT REMOVE — erp/tools/help_records.js: the ERP ADAPTER of the help query core (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.2 Step 2, §19.3 Step 3; design prompts/HELP_QUERY_CORE_DESIGN.md §2 D1, §4).
// READ THE LOG of W-HQ-SELF / W-HQ-COST / W-HQ-BOX after a build (common/help/tests/logs/). An exit code is not evidence.
// §19.3: the records are made by ONE pure function, erp/help_records_core.js build(), the same one the run time (erp/help_search.js indexFrom) calls. This file only reads the packs and the seed from disk.
// text(i) = pack.texts[i] for i < pack.texts.length, then the how-to texts, then the action descriptions; resolver(en, pack) rebuilds that list at run time (erp/erp_i18n.js loadHelp), so index.json holds no second copy.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ERP = path.join(__dirname, '..'), HELP = path.join(ERP, 'i18n', 'help');
const SEED = process.env.ERP_SEED_DB || path.join(ERP, 'ad_seed.db');
const CORE = require(path.join(ERP, 'help_records_core.js')), KINDS = CORE.kinds;
const LANGS = ['en_US'].concat(Object.keys(JSON.parse(fs.readFileSync(path.join(ERP, 'tools', 'i18n_sources.json'), 'utf8')).sources));   // §19.11 step 1: the one list
const q = (sql) => { const r = cp.spawnSync('sqlite3', ['-readonly', '-json', SEED, sql], { encoding: 'utf8', maxBuffer: 1 << 29 }); if (r.status !== 0) throw new Error(r.stderr); return JSON.parse(r.stdout || '[]'); };
const readPack = (lang) => JSON.parse(fs.readFileSync(path.join(HELP, lang, 'help.json'), 'utf8'));
// §19.16 C4: the how-to rows are legacy's context help, read by the ONE reader (erp/ctx_help.js) over the page's DB view (help_db.js: seed + hashed patches + the context-help overlay),
//   never from help.json; the other records keep reading the raw seed (q above)
const CH = require(path.join(ERP, 'ctx_help.js')), HDB = require('./help_db.js');
const packs = (lang) => { const en = Object.assign(readPack('en_US'), { howto: CH.howto(HDB.q, 'en_US') }), pk = lang === 'en_US' ? null : Object.assign(readPack(lang), { howto: CH.howto(HDB.q, lang) }); return { en, pk }; };
const load = (lang) => { const P = packs(lang); return CORE.build({ q, en: P.en, pack: P.pk }); };
// §19.10: the page rebuilds the records from the live dictionary (erp/help_search.js indexFrom) and reads only the header of index.json, so the file ships the header only (runtimeRecords).
module.exports = { app: 'erp', runtimeRecords: true, kinds: KINDS, langs: LANGS, load, packs, resolver: CORE.resolver, extraTexts: CORE.extraTexts, outFile: (lang) => path.join(HELP, lang, 'index.json') };
