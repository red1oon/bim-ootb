'use strict';
const path=require('path'),http=require('http'),fs=require('fs');
function pw(){for(const c of [path.join(__dirname,'../../tests/node_modules/playwright'),'/home/red1/bim-ootb/tests/node_modules/playwright']){try{return require(c)}catch(e){}}throw new Error('no pw')}
const ROOT=path.join(__dirname,'..');
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.db':'application/octet-stream','.wasm':'application/wasm','.css':'text/css'};
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/pivot_lens.html';fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){res.writeHead(404);res.end('404');return}res.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});res.end(b)})});
(async()=>{const {chromium}=pw();await new Promise(r=>server.listen(0,r));const port=server.address().port;
const logs=[],errs=[];const b=await chromium.launch();const page=await b.newPage();page.on('console',m=>logs.push(m.text()));page.on('pageerror',e=>errs.push(e.message));
await page.goto(`http://localhost:${port}/pivot_lens.html?db=ad_seed.db`,{waitUntil:'networkidle'});
await page.waitForFunction(()=>document.querySelector('.pv-table'),{timeout:15000}).catch(()=>{});
// pick c_invoice, row=C_BPartner_ID
await page.selectOption('#pv-tbl','c_invoice').catch(()=>{});
await page.waitForTimeout(300);
const opts=await page.evaluate(()=>[].slice.call(document.querySelectorAll('#pv-row option')).map(o=>({v:o.value,t:o.textContent})));
const bp=opts.find(o=>/bpartner_id$/i.test(o.v));
if(bp){await page.selectOption('#pv-row',bp.v);await page.waitForTimeout(300);}
const rowLabels=await page.evaluate(()=>[].slice.call(document.querySelectorAll('.pv-table tr td:first-child')).map(td=>td.textContent).filter(x=>x&&x!=='Total'));
const allNumeric=rowLabels.every(x=>/^\d+$/.test(x));
const someNamed=rowLabels.some(x=>/[A-Za-z]/.test(x));
console.log('§PV-OPT bpartner option text="'+(bp?bp.t:'?')+'" (value='+(bp?bp.v:'?')+')');
console.log('§PV-ROWS '+JSON.stringify(rowLabels.slice(0,6)));
console.log('§PV-LOOKUP-LOG '+(logs.find(l=>/§PIVOT_HTML lookup/.test(l))||'(none)'));
const pass=errs.length===0 && rowLabels.length>0 && !allNumeric && someNamed && bp && /[A-Za-z]/.test(bp.t);
console.log('§PIVOT-LOOKUP-RESULT '+(pass?'PASS':'FAIL')+' rows='+rowLabels.length+' allNumeric='+allNumeric+' someNamed='+someNamed+' errs='+(errs.length?errs.slice(0,2).join('|'):0));
await b.close();server.close();process.exit(pass?0:1)})().catch(e=>{console.error('PV-ERR',e);server.close();process.exit(2)})
