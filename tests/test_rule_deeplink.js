#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — prompts/STRUCTURAL_SANITY.md T6 witness (READ THE LOG after every run)
 * SCOPE: proves viewer/rule_checklist.js's pure `_buildRuleDeepLinkUrl` (exported as
 * `buildRuleDeepLinkUrl`) round-trips: build a URL from {origin, pathname, guid, checkId, rule}
 * (the browser-global-free extraction of A.buildRuleDeepLink's URL formula), parse it back with
 * Node's built-in `URL`, and assert the same guid/checkId/rule come back out. Also proves the
 * exact literal shape STRUCTURAL_SANITY.md T6 specifies:
 * `location.origin + location.pathname + '?guid=' + encodeURIComponent(guid) + '#' + checkId +
 * '=' + encodeURIComponent(rule)`.
 * RUN: node tests/test_rule_deeplink.js
 */
'use strict';
const { URL } = require('url');
const RC = require('../viewer/rule_checklist.js');

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

function parseRuleDeepLink(urlStr) {
  const u = new URL(urlStr);
  const guid = u.searchParams.get('guid');
  const hash = u.hash.replace(/^#/, '');
  const eq = hash.indexOf('=');
  const checkId = eq > 0 ? decodeURIComponent(hash.slice(0, eq)) : null;
  const rule = eq > 0 ? decodeURIComponent(hash.slice(eq + 1)) : null;
  return { guid, checkId, rule };
}

console.log('§W-RULE-DEEPLINK basic round-trip');
{
  const built = RC.buildRuleDeepLinkUrl({
    origin: 'https://example.com', pathname: '/viewer/viewer.html',
    guid: '2O2Fr$t4X7Zf8NOew3FLKA', checkId: 'sanity', rule: 'floating_member'
  });
  chk('exact URL shape matches spec formula', built === 'https://example.com/viewer/viewer.html?guid=' +
    encodeURIComponent('2O2Fr$t4X7Zf8NOew3FLKA') + '#sanity=floating_member', built);
  const parsed = parseRuleDeepLink(built);
  chk('round-trip guid matches', parsed.guid === '2O2Fr$t4X7Zf8NOew3FLKA', JSON.stringify(parsed));
  chk('round-trip checkId matches', parsed.checkId === 'sanity', JSON.stringify(parsed));
  chk('round-trip rule matches', parsed.rule === 'floating_member', JSON.stringify(parsed));
}

console.log('§W-RULE-DEEPLINK round-trip with a rule name needing encoding');
{
  const built = RC.buildRuleDeepLinkUrl({
    origin: 'https://red1.example', pathname: '/viewer.html',
    guid: 'abc-123', checkId: 'egress', rule: 'circulation_distance'
  });
  const parsed = parseRuleDeepLink(built);
  chk('egress checkId round-trips (generic, not hardcoded to sanity)', parsed.checkId === 'egress', JSON.stringify(parsed));
  chk('rule round-trips', parsed.rule === 'circulation_distance', JSON.stringify(parsed));
  chk('guid round-trips', parsed.guid === 'abc-123', JSON.stringify(parsed));
}

console.log('§W-RULE-DEEPLINK guid with characters requiring percent-encoding');
{
  const guid = 'weird guid/with?chars&stuff';
  const built = RC.buildRuleDeepLinkUrl({ origin: 'https://x.test', pathname: '/v.html', guid: guid, checkId: 'sanity', rule: 'column_continuity' });
  const parsed = parseRuleDeepLink(built);
  chk('guid with special chars round-trips exactly', parsed.guid === guid, 'got=' + parsed.guid);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
