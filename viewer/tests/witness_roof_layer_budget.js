// ⚠ DO NOT REMOVE — WITNESS §ROOF_LAYER_BUDGET (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §LOAD). Read the log, not the exit code.
// ISSUE: §SURFACE_ROOF_LAYER took 16.1 s on a 2 km road (13.4M 1 m cells). PROVES the bucket path gives IDENTICAL roof
// membership for every envelope-class element (the only reader, A._surfRowOf) — diff must be 0 — and reports VACUOUS
// when a DB has no envelope flats. Run: node viewer/tests/witness_roof_layer_budget.js <db...>
// Equivalence + timing: shipped _surfBuildRoof (1 m string grid over ALL flats) vs proposed (judge only envelope
// classes, covers via 16 m bucket index). Claim: identical roof membership for every envelope-class element.
const Database=require('/home/red1/bim-compiler/node_modules/better-sqlite3');
const ENV={IfcSlab:1,IfcPlate:1,IfcRoof:1,IfcCovering:1};
function load(f){const db=new Database(f,{readonly:true});return db.prepare('SELECT m.guid, m.ifc_class, m.material_name, t.center_x, t.center_y, t.center_z, t.bbox_x, t.bbox_y, t.bbox_z FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid').raw().all();}
function flats(rows){const flat=[];for(const r of rows){const bx=+r[6]||0,by=+r[7]||0,bz=+r[8]||0;if(!(bz<Math.min(bx,by)&&Math.max(bx,by)>=0.1))continue;
 flat.push({g:r[0],c:r[1],id:(r[1]||'')+'|'+(r[2]||''),x0:Math.floor(r[3]-bx/2),x1:Math.floor(r[3]+bx/2),y0:Math.floor(r[4]-by/2),y1:Math.floor(r[4]+by/2),zb:r[5]-bz/2,zt:r[5]+bz/2});}return flat;}
function oldAlg(flat){const roof=new Set(),grid=new Map();
 flat.forEach((e,k)=>{for(let x=e.x0;x<=e.x1;x++)for(let y=e.y0;y<=e.y1;y++){const c=x+','+y;let l=grid.get(c);if(!l)grid.set(c,l=[]);l.push(k);}});
 flat.forEach((e,k)=>{let cells=0,covered=0;for(let x=e.x0;x<=e.x1;x++)for(let y=e.y0;y<=e.y1;y++){cells++;const l=grid.get(x+','+y);
  for(let j=0;j<l.length;j++){const o=flat[l[j]];if(l[j]!==k&&o.id!==e.id&&o.zb>=e.zt-0.02){covered++;break;}}}if(covered<0.5*cells)roof.add(e.g);});return roof;}
function newAlg(flat){const B=16,roof=new Set(),bk=new Map(),key=(i,j)=>i*1048576+j;
 flat.forEach((o,k)=>{for(let i=Math.floor(o.x0/B);i<=Math.floor(o.x1/B);i++)for(let j=Math.floor(o.y0/B);j<=Math.floor(o.y1/B);j++){const c=key(i,j);let l=bk.get(c);if(!l)bk.set(c,l=[]);l.push(k);}});
 flat.forEach((e,k)=>{if(!ENV[e.c])return;let cells=0,covered=0;for(let x=e.x0;x<=e.x1;x++)for(let y=e.y0;y<=e.y1;y++){cells++;const l=bk.get(key(Math.floor(x/B),Math.floor(y/B)));
  for(let j=0;j<l.length;j++){const o=flat[l[j]];if(l[j]!==k&&o.id!==e.id&&o.zb>=e.zt-0.02&&o.x0<=x&&x<=o.x1&&o.y0<=y&&y<=o.y1){covered++;break;}}}if(covered<0.5*cells)roof.add(e.g);});return roof;}
for(const f of process.argv.slice(2)){const rows=load(f),flat=flats(rows);
 let t=Date.now();const a=oldAlg(flat);const tOld=Date.now()-t;t=Date.now();const b=newAlg(flat);const tNew=Date.now()-t;
 const envA=[...a].filter(g=>ENV[(flat.find(e=>e.g===g)||{}).c]);let diff=0;for(const g of envA)if(!b.has(g))diff++;for(const g of b)if(!a.has(g))diff++;
 const nEnv=flat.filter(e=>ENV[e.c]).length;
 console.log(f.split('/').pop()+' flat='+flat.length+' envelopeFlat='+nEnv+' oldRoof='+a.size+' oldRoofEnvelope='+envA.length+' newRoof='+b.size+' diff='+diff+' oldMs='+tOld+' newMs='+tNew+(nEnv===0?' VACUOUS(no envelope flats)':''));}
