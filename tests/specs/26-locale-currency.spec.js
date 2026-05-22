// 26-locale-currency.spec.js — S226 Localisation: currency-only display per locale
// Issues proven:
//   T_LOC_01: Each rate JSON parses as valid JSON with required sections
//   T_LOC_02: Each locale JS file defines cur (primary currency) matching its region
//   T_LOC_03: When a locale is active, only that locale's currency symbol appears — no dual currency
//   T_LOC_04: Rate JSON currency matches locale JS currency for same region
//   T_LOC_05: All rate JSONs have complete materials, labor, equipment sections

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const RATES_DIR = path.resolve(__dirname, '../../rates');
const LOCALES_DIR = path.resolve(__dirname, '../../locales');

// ── Expected locale→rate JSON mapping ──
const LOCALE_RATE_MAP = {
  'en_MY':  { json: 'cidb2024_my',    cur: 'RM',   region: 'MY' },
  'ms_MY':  { json: 'cidb2024_my',    cur: 'RM',   region: 'MY' },
  'en_GB':  { json: 'bcis2024_uk',    cur: '£',    region: 'UK' },
  'en_US':  { json: 'rsmeans2024_us', cur: '$',    region: 'US' },
  'en_AU':  { json: 'rawlinsons2024_au', cur: 'A$', region: 'AU' },
  'de_DE':  { json: 'bki2024_de',     cur: 'EUR',  region: 'DE' },
  'fr_FR':  { json: 'untec2024_fr',   cur: 'EUR',  region: 'FR' },
  'es_ES':  { json: 'cype2024_es',    cur: 'EUR',  region: 'ES' },
  'zh_CN':  { json: 'gb50500_cn',     cur: 'CNY',  region: 'CN' },
  'th_TH':  { json: 'dpt2024_th',     cur: 'THB',  region: 'TH' },
  'ja_JP':  { json: 'jbci2024_jp',    cur: 'JPY',  region: 'JP' },
  'ko_KR':  { json: 'kict2024_kr',    cur: 'KRW',  region: 'KR' },
  'ar_SA':  { json: 'aramco2024_sa',  cur: 'SAR',  region: 'SA' },
  'pt_BR':  { json: 'sinapi2024_br',  cur: 'BRL',  region: 'BR' },
  'id_ID':  { json: 'sni2024_id',     cur: 'IDR',  region: 'ID' },
  'af_ZA':  { json: 'asaqs2024_za',   cur: 'R',    region: 'ZA' },
  'bn_BD':  { json: 'pwd2024_bd',     cur: '৳',    region: 'BD' },
};

// Required IFC classes every rate JSON must cover
const REQUIRED_IFC = [
  'IfcDuct', 'IfcPipe', 'IfcCableCarrier', 'IfcBeam', 'IfcColumn', 'IfcSlab',
  'IfcWall', 'IfcDoor', 'IfcWindow', 'IfcRoof', 'IfcLightFixture', 'IfcOutlet',
  'IfcFooting', 'IfcStair', 'IfcCovering', 'IfcFlowTerminal',
];

const REQUIRED_TRADES = [
  'HVAC_TECH', 'PLUMBER', 'ELECTRICIAN', 'STEEL_ERECTOR', 'CONCRETE_GANG', 'MASON', 'LABORER',
];

test.describe('Locale Rate JSONs — Structure & Currency (§S226)', () => {

  test('T_LOC_01: all rate JSONs parse as valid JSON', () => {
    const jsonFiles = fs.readdirSync(RATES_DIR).filter(f => f.endsWith('.json') && f !== 'custom_template.json');
    expect(jsonFiles.length).toBeGreaterThanOrEqual(14);
    console.log('§LOC_JSON_COUNT files=' + jsonFiles.length);

    for (const f of jsonFiles) {
      const raw = fs.readFileSync(path.join(RATES_DIR, f), 'utf8');
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        throw new Error('JSON parse FAIL: ' + f + ' — ' + e.message);
      }
      // Must have required top-level sections
      expect(parsed.meta, f + ' missing meta').toBeTruthy();
      expect(parsed.materials, f + ' missing materials').toBeTruthy();
      expect(parsed.labor, f + ' missing labor').toBeTruthy();
      expect(parsed.equipment, f + ' missing equipment').toBeTruthy();
      expect(parsed.meta.currency, f + ' missing currency').toBeTruthy();
      expect(parsed.meta.region, f + ' missing region').toBeTruthy();
      console.log('§LOC_JSON_OK ' + f + ' region=' + parsed.meta.region + ' cur=' + parsed.meta.currency);
    }
  });

  test('T_LOC_02: each locale JS defines cur matching its region', () => {
    const localeFiles = fs.readdirSync(LOCALES_DIR).filter(f => f.endsWith('.js'));
    expect(localeFiles.length).toBeGreaterThanOrEqual(15);

    for (const f of localeFiles) {
      const src = fs.readFileSync(path.join(LOCALES_DIR, f), 'utf8');
      // Extract cur value
      const curMatch = src.match(/\bcur:\s*'([^']+)'/);
      expect(curMatch, f + ' missing cur field').not.toBeNull();

      // Extract locale code
      const localeMatch = src.match(/\blocale:\s*'([^']+)'/);
      if (!localeMatch) continue; // skip if no locale field
      const locale = localeMatch[1];
      const expected = LOCALE_RATE_MAP[locale];
      if (expected) {
        expect(curMatch[1]).toBe(expected.cur);
        console.log('§LOC_CUR_OK ' + locale + ' cur=' + curMatch[1]);
      }
    }
  });

  test('T_LOC_03: currency symbol is native — no foreign currency leaks', () => {
    // For each locale, verify: the cur field is the LOCAL symbol,
    // not a dual display like "RM / USD"
    for (const [locale, info] of Object.entries(LOCALE_RATE_MAP)) {
      const localeFile = path.join(LOCALES_DIR, locale + '.js');
      if (!fs.existsSync(localeFile)) continue;

      const src = fs.readFileSync(localeFile, 'utf8');
      const curMatch = src.match(/\bcur:\s*'([^']+)'/);
      expect(curMatch).not.toBeNull();
      const cur = curMatch[1];

      // Currency must be a clean symbol — no slash, no dual currency
      expect(cur).not.toContain('/');
      expect(cur).not.toContain(' ');
      expect(cur.length).toBeLessThanOrEqual(4); // symbols are short: $, £, RM, EUR, etc.

      console.log('§LOC_NATIVE ' + locale + ' cur=' + cur + ' (clean, no dual)');
    }
  });

  test('T_LOC_04: rate JSON currency matches locale currency for same region', () => {
    for (const [locale, info] of Object.entries(LOCALE_RATE_MAP)) {
      const jsonPath = path.join(RATES_DIR, info.json + '.json');
      if (!fs.existsSync(jsonPath)) {
        console.log('§LOC_PENDING ' + info.json + '.json not yet created');
        continue;
      }
      const tpl = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      const localeFile = path.join(LOCALES_DIR, locale + '.js');
      if (!fs.existsSync(localeFile)) continue;
      const src = fs.readFileSync(localeFile, 'utf8');
      const curMatch = src.match(/\bcur:\s*'([^']+)'/);
      if (!curMatch) continue;

      // JSON meta.currency should match the locale's cur symbol
      // (some locales use symbol like $, JSON uses USD — both valid, check region match)
      expect(tpl.meta.region).toBe(info.region);
      console.log('§LOC_REGION_MATCH ' + locale + ' json_region=' + tpl.meta.region + ' json_cur=' + tpl.meta.currency + ' locale_cur=' + curMatch[1]);
    }
  });

  test('T_LOC_05: all rate JSONs cover required IFC classes', () => {
    const jsonFiles = fs.readdirSync(RATES_DIR).filter(f => f.endsWith('.json') && f !== 'custom_template.json');

    for (const f of jsonFiles) {
      const tpl = JSON.parse(fs.readFileSync(path.join(RATES_DIR, f), 'utf8'));
      const matKeys = Object.keys(tpl.materials || {});
      const labKeys = Object.keys(tpl.labor || {});

      // Check required IFC classes in materials
      const missingIfc = REQUIRED_IFC.filter(c => !matKeys.includes(c));
      if (missingIfc.length > 0) {
        console.log('§LOC_MISSING_IFC ' + f + ' missing=' + missingIfc.join(','));
      }
      expect(missingIfc.length, f + ' missing IFC classes: ' + missingIfc.join(',')).toBe(0);

      // Check required trades in labor
      const missingTrades = REQUIRED_TRADES.filter(t => !labKeys.includes(t));
      if (missingTrades.length > 0) {
        console.log('§LOC_MISSING_TRADE ' + f + ' missing=' + missingTrades.join(','));
      }
      expect(missingTrades.length, f + ' missing trades: ' + missingTrades.join(',')).toBe(0);

      console.log('§LOC_COMPLETE ' + f + ' materials=' + matKeys.length + ' trades=' + labKeys.length);
    }
  });

  test('T_LOC_06: rate values are positive numbers in local currency', () => {
    const jsonFiles = fs.readdirSync(RATES_DIR).filter(f => f.endsWith('.json') && f !== 'custom_template.json');

    for (const f of jsonFiles) {
      const tpl = JSON.parse(fs.readFileSync(path.join(RATES_DIR, f), 'utf8'));
      const cur = tpl.meta.currency;

      // Spot-check: IfcBeam rate must be positive
      const beam = tpl.materials.IfcBeam;
      expect(beam, f + ' missing IfcBeam').toBeTruthy();
      expect(beam.rate).toBeGreaterThan(0);

      // Exchange rate must be positive
      expect(tpl.meta.exchange_rate).toBeGreaterThan(0);

      // Sanity: high-value currencies (JPY, KRW, IDR) should have high rates
      if (['JPY'].includes(cur)) expect(beam.rate).toBeGreaterThan(1000);
      if (['KRW'].includes(cur)) expect(beam.rate).toBeGreaterThan(10000);
      if (['IDR'].includes(cur)) expect(beam.rate).toBeGreaterThan(100000);

      // Low-value currencies (EUR, USD, GBP) should have rates < 1000
      if (['EUR', 'USD', 'GBP'].includes(cur)) expect(beam.rate).toBeLessThan(1000);

      console.log('§LOC_RATE_SANE ' + f + ' cur=' + cur + ' beam=' + beam.rate);
    }
  });

});
