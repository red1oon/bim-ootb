// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// webservices.mjs - the ADInterface web service as a plugin bundle (bim-compiler prompts/ERP_WS_API.md S6, docs/ERP_AI_ADVISORY.md).
//   DEFAULT OFF. Legacy iDempiere carries the org.idempiere.webservices bundle in its server stack and nothing is reachable until a web-service type is granted to a role; the twin follows that
//   by installing this bundle STOPPED. Start contributes ONE pill, "Web Services", whose panel states the host status, lists the dictionary's service types and roles, and exports the
//   host config (ws_host.json) that tells the headless host (erp/ws_server.js) the bundle is ACTIVE. Without that file the host serves nothing (404, as a stopped bundle would).
//   Stop removes the pill; re-export a STOPPED config (or delete the file) and the host goes dark again. No dictionary rows are added or removed by Start/Stop.
export const manifest = {
  id: 'org.idempiere.webservices',
  name: 'Web Services (ADInterface)',
  version: '1.0.0',
  engineVersion: '>=0.9.0',
  requires: {},
  budget: { kb: 3, note: 'pill + status panel + config export only; the engine is ws_adinterface.js/ws_kernel.js/ws_json.js (Node host)' }
};
const q = (sql) => { try { const r = globalThis.__idmpDb.exec(sql); return r.length ? r[0].values : []; } catch (e) { return []; } };
function panel() {
  const old = document.getElementById('idmp-ws-panel'); if (old) { old.remove(); return; }
  const types = q("SELECT count(*) FROM ws_webservicetype WHERE isactive='Y'")[0], access = q("SELECT count(*) FROM ws_webservicetypeaccess WHERE isactive='Y'")[0];
  const wsRole = q("SELECT r.name, (SELECT count(*) FROM ws_webservicetypeaccess a WHERE a.ad_role_id=r.ad_role_id AND a.isactive='Y') FROM ad_role r WHERE r.roletype='WS' AND r.isactive='Y' ORDER BY r.name");
  const defCred = q("SELECT count(*) FROM ad_user u JOIN ad_user_roles ur ON ur.ad_user_id=u.ad_user_id JOIN ad_role r ON r.ad_role_id=ur.ad_role_id WHERE r.roletype='WS' AND u.isactive='Y' AND u.password=u.name")[0];
  const d = document.createElement('div'); d.id = 'idmp-ws-panel';
  d.style.cssText = 'position:fixed;right:24px;top:70px;z-index:10000;width:460px;max-height:80vh;overflow:auto;background:#fff;color:#222;border:1px solid #9aa4b2;border-radius:6px;box-shadow:0 6px 24px rgba(0,0,0,.3);font:13px/1.45 system-ui,sans-serif;padding:14px 16px';
  d.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:15px">Web Services</b><button data-ws="close" title="Close" style="border:none;background:none;font-size:18px;cursor:pointer">×</button></div>' +
    '<div data-ws="state" style="margin:8px 0;padding:6px 10px;border-radius:4px;background:#e8f5e9;color:#1b5e20"><b>Plugin ACTIVE</b> - the host serves the web service only when it is started with the exported config.</div>' +
    '<div>Service types in the dictionary: <b data-ws="types">' + types + '</b> · role grants: <b data-ws="access">' + access + '</b></div>' +
    '<div style="margin-top:6px">Web-service roles: ' + (wsRole.length ? wsRole.map((r) => '<span data-ws="role">' + r[0] + ' (' + r[1] + ' types)</span>').join(', ') : 'none') + '</div>' +
    (Number(defCred) ? '<div data-ws="warn" style="margin-top:8px;padding:6px 10px;border-radius:4px;background:#fff3e0;color:#8a4b00"><b>' + defCred + ' stock user(s)</b> on a web-service role still use their name as password (iDempiere ships this). Deactivate them before exposing a host.</div>' : '') +
    '<ol style="margin:10px 0 6px 18px;padding:0"><li>Click <b>Export host config</b> and save <code>ws_host.json</code>.</li><li>Give your AI its own identity: <code>node erp/ws_agent.js create --dir agents --name my-ai --types QueryBPartner</code></li>' +
    '<li>Start the host: <code>node erp/ws_server.js 8089 --config ws_host.json --agents agents --journal ws_journal.jsonl</code></li></ol>' +
    '<button data-ws="export" style="padding:6px 12px;cursor:pointer">Export host config</button> <span data-ws="msg" style="color:#555"></span>';
  document.body.appendChild(d);
  d.querySelector('[data-ws="close"]').onclick = () => d.remove();
  d.querySelector('[data-ws="export"]').onclick = () => {
    const cfg = { plugin: manifest.id, version: manifest.version, state: 'ACTIVE', exportedAt: new Date().toISOString() };
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' })); a.download = 'ws_host.json'; document.body.appendChild(a); a.click(); a.remove();
    d.querySelector('[data-ws="msg"]').textContent = 'ws_host.json exported'; console.log('§WS-PLUGIN export state=ACTIVE');
  };
  console.log('§WS-PLUGIN panel types=' + types + ' access=' + access + ' wsRoles=' + wsRole.length + ' defaultCredUsers=' + defCred);
}
export async function activate(ctx) {
  if (!ctx.pill) throw new Error('host has no pill extension point');
  ctx.pill.register('webservices', { name: 'Web Services', title: 'Web Services (ADInterface) - status, config export', icon: 'link', order: 4.9, action: panel });
  console.log('§WS-PLUGIN start state=ACTIVE');
}
export async function deactivate() { const p = document.getElementById('idmp-ws-panel'); if (p) p.remove(); console.log('§WS-PLUGIN stop state=STOPPED'); }
