// pilot_hosts.js — host write/fetch for W-PILOT-GROUP-RELAY. ONLY the existing documented static-host paths
// (prompts/BACKEND_SUBSTRATE_LANE.md §MULTIHOST_WITNESS; scripts/witness_multihost_sync.js:192-214):
//   OCI dev bucket bim-ootb-dev, prefix sandbox/erp/  (NEVER bim-ootb-live)   — NEW object names only, no --force
//   GH repo red1oon/BIMCompiler branch mock/relay-snapshot (Contents API)     — NEW file paths only
'use strict';
const cp = require('child_process'), crypto = require('crypto'), fs = require('fs');
const OCI_NS = 'ax3cp6tzwuy2', OCI_BUCKET = 'bim-ootb-dev', OCI_PREFIX = 'sandbox/erp';
const OCI_URL = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/' + OCI_NS + '/b/' + OCI_BUCKET + '/o/';
const GH_REPO = 'red1oon/BIMCompiler', GH_BRANCH = 'mock/relay-snapshot';
const md5 = s => crypto.createHash('md5').update(s).digest('hex');
const PUT = [];   // every object/file written, listed in the run log
async function getText(url) { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url); return r.text(); }
async function ociPut(name, file) {
  const key = OCI_PREFIX + '/' + name;
  const pre = await fetch(OCI_URL + key, { cache: 'no-store' });          // OCI_UPLOAD rule 1: GET the target first — must be absent
  if (pre.status !== 404) throw new Error('OCI target already exists (' + pre.status + ') ' + key + ' — refusing to overwrite');
  cp.execFileSync('oci', ['os', 'object', 'put', '--namespace', OCI_NS, '-bn', OCI_BUCKET, '--name', key, '--file', file,
    '--content-type', 'application/json'], { encoding: 'utf8', timeout: 120000 });
  PUT.push('OCI ' + OCI_BUCKET + '/' + key);
  const url = OCI_URL + key, back = await getText(url);
  return { url, backMd5: md5(back), body: back };
}
async function ghPut(pathInRepo, file) {
  const body = JSON.stringify({ message: 'pilot phase A station log ' + pathInRepo, branch: GH_BRANCH,
    content: fs.readFileSync(file).toString('base64') });
  const resp = JSON.parse(cp.execFileSync('gh', ['api', '-X', 'PUT', 'repos/' + GH_REPO + '/contents/' + pathInRepo, '--input', '-'],
    { encoding: 'utf8', input: body, timeout: 90000 }));
  const sha = resp.commit.sha; PUT.push('GH ' + GH_REPO + '@' + GH_BRANCH + ':' + pathInRepo + ' commit=' + sha.slice(0, 10));
  const url = 'https://raw.githubusercontent.com/' + GH_REPO + '/' + sha + '/' + pathInRepo;   // commit URL: no CDN lag
  const back = await getText(url);
  return { url, backMd5: md5(back), body: back };
}
module.exports = { ociPut, ghPut, getText, md5, PUT };
