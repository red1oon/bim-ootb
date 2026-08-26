#!/usr/bin/env node
// probe_support_dag.js — Implementing bim-compiler prompts/BIMEYES_STRUCTURAL_ORACLE.md §S11.
//
// ⚠ DO NOT REMOVE — SCOPE: build the INJECTED SUPPORT DAG (compiled from geometry, the way
// room_walker compiles rooms IFC never carried — §S7 measured that IFC carries no "stands on"),
// then measure whether topologically ordering elements INSIDE their own bar fixes the intra-bar
// share §S10 measured at 69.3% on Terminal. Read the log after every run.
//
// NO ELECTION (§S9): every element keeps the FULL SET of its bearing-below supports. The judge is
// any-of — "at my start, is at least one thing I rest on already started?" — the same rule as
// eyeFloating() in probe_floating_guid_audit.js. Contact geometry is REQUIRED from support_sweep.js,
// never re-derived (§10.1 rule 1).
'use strict';
const fs=require('fs'),path=require('path'),os=require('os');
const ROOT=path.join(__dirname,'..');
const initSqlJs=require(path.join(ROOT,'modeller','lib','sql-wasm.js'));
const ScheduleGate=require(path.join(ROOT,'viewer','schedule_gate.js'));
const ScheduleAuthor=require(path.join(ROOT,'viewer','schedule_author.js'));
const CpmSchedule=require(path.join(ROOT,'viewer','cpm_schedule.js'));
const SupportSweep=require(path.join(ROOT,'viewer','support_sweep.js'));
global.ScheduleGate=ScheduleGate;
const DAY=86400000;

(async()=>{
const SQL=await initSqlJs({wasmBinary:fs.readFileSync(path.join(ROOT,'modeller','lib','sql-wasm.wasm'))});
const rs=fs.readFileSync(path.join(ROOT,'viewer','rates.js'),'utf8');
const R=(new Function(rs+'\nreturn {SEQUENCE_RULES,SEQUENCE_DEFAULT,SEQUENCE_NAME_OVERRIDES,LABOR_RATES,RATES};'))();

for(const NAME of (process.env.ONLY||'Duplex,HHS_Office_Federated,Terminal').split(',')){
 const db=new SQL.Database(fs.readFileSync(path.join(os.homedir(),'bim-ootb','buildings',NAME+'_extracted.db')));
 const els=ScheduleAuthor._buildScheduleElements(db,R.SEQUENCE_RULES,{laborRates:R.LABOR_RATES,rates:R.RATES,nameOverrides:R.SEQUENCE_NAME_OVERRIDES,defaultRule:R.SEQUENCE_DEFAULT});
 db.close();
 const mc={},dmc={};
 for(const r in R.LABOR_RATES){if(R.LABOR_RATES[r].max_crews)mc[r]=R.LABOR_RATES[r].max_crews;
  dmc[r]=R.LABOR_RATES[r].max_crews_fixed!=null?R.LABOR_RATES[r].max_crews_fixed:(R.LABOR_RATES[r].max_crews||1);}
 const raw=ScheduleGate.computeSchedule(els,0,1,mc,24);
 const items=[];els.forEach(e=>{const st=raw[e.guid];if(!st)return;
  items.push({guid:e.guid,s:st.start,e:st.end,bz:e.base_z,tz:e.top_z,x0:e.x0,x1:e.x1,y0:e.y0,y1:e.y1,
              cls:e.cls,seq:e.seq,phase:e.phase,storey:e.storey,resource:e.resource,work:e.installSecs||120});});
 const n=items.length;
 // BASE ordering = the live display timeline (CpmSchedule.run), same as the shipped path.
 const cr=CpmSchedule.run(items,{maxCrews:dmc});
 const baseS=new Float64Array(n);
 for(let i=0;i<n;i++) baseS[i]=cr&&cr.ok?cr.solution.times[i].s:items[i].s;

 // ── INJECT: the support DAG. Full set, bearing-below only, from the shipped contact graph ──
 const G=SupportSweep.contactGraph(items);
 const EPS=ScheduleGate.EPS,GAP=ScheduleGate.GAP;
 const groundZ=Math.min.apply(null,items.map(it=>it.bz));
 const sup=new Array(n);            // sup[i] = [j,...]  things i RESTS ON
 let edges=0,rootN=0;
 for(let i=0;i<n;i++){
   const T=items[i],list=G.contacts[i]||[],out=[];
   for(const j of list){const S=items[j];
     if(S.bz<T.bz-EPS&&S.tz>=T.bz-GAP) out.push(j);}
   sup[i]=out; edges+=out.length;
   if(T.bz<=groundZ+GAP) rootN++;
 }
 const barOf=i=>(items[i].phase||'_UNPHASED')+'||'+ScheduleGate.collapsePhase(items[i].storey);
 console.log(`§SDAG_INJECT ${NAME} elements=${n} supportEdges=${edges} groundRoots=${rootN} groundZ=${groundZ.toFixed(2)}`);

 // ── bars, and the intra-bar subgraph ──
 const bars={};
 for(let i=0;i<n;i++){const b=barOf(i);(bars[b]||(bars[b]=[])).push(i);}
 // bar window from the BASE solve — the envelope stays exactly what the template/CPM produced
 const win={};
 for(const b in bars){let lo=Infinity,hi=-Infinity;
   for(const i of bars[b]){if(baseS[i]<lo)lo=baseS[i];const e=baseS[i]+(items[i].e-items[i].s);if(e>hi)hi=e;}
   win[b]={lo,hi:Math.max(hi,lo+1)};}

 // ── topological LAYERING inside each bar over intra-bar support edges ──
 const layer=new Int32Array(n).fill(-1);
 let cyclicBars=0,cyclicNodes=0,maxLayer=0;
 for(const b in bars){
   const idx=bars[b],inSet={}; idx.forEach(i=>inSet[i]=1);
   const indeg={},adj={};
   idx.forEach(i=>{indeg[i]=0;adj[i]=[];});
   idx.forEach(i=>{for(const j of sup[i]) if(inSet[j]){adj[j].push(i);indeg[i]++;}});
   const q=idx.filter(i=>indeg[i]===0); let placed=0,L=0;
   const lay={}; q.forEach(i=>lay[i]=0);
   const queue=q.slice();
   while(queue.length){const u=queue.shift();placed++;if(lay[u]>L)L=lay[u];
     for(const v of adj[u]){if(--indeg[v]===0){lay[v]=lay[u]+1;queue.push(v);}}}
   if(placed<idx.length){cyclicBars++;cyclicNodes+=idx.length-placed;
     idx.forEach(i=>{if(lay[i]===undefined)lay[i]=L+1;});}     // §5.1: name them, do not reorder around
   idx.forEach(i=>layer[i]=lay[i]||0);
   if(L>maxLayer)maxLayer=L;
   bars[b].L=L;
 }
 // ── DAG ordering: spread layers across the bar's OWN window (envelope unchanged) ──
 const dagS=new Float64Array(n);
 for(const b in bars){const idx=bars[b],L=bars[b].L||0,w=win[b];
   const span=Math.max(1,w.hi-w.lo);
   idx.forEach(i=>{dagS[i]=L===0?w.lo:w.lo+(layer[i]/(L+1))*span;});}

 // ── THE JUDGE (any-of, no election): at my start, is >=1 thing I rest on already started? ──
 function judge(S){
   let floatIntra=0,floatCross=0,floating=0,noSup=0,grounded=0;
   for(let i=0;i<n;i++){
     if(items[i].bz<=groundZ+GAP){grounded++;continue;}
     const list=sup[i];
     if(!list.length){noSup++;continue;}
     let ok=false,anyIntra=false;
     for(const j of list){if(S[j]<=S[i]+1){ok=true;break;}}
     if(ok)continue;
     floating++;
     for(const j of list){if(barOf(j)===barOf(i)){anyIntra=true;break;}}
     if(anyIntra)floatIntra++;else floatCross++;
   }
   return{floating,floatIntra,floatCross,noSup,grounded};
 }
 // ── VARIANT C: ONE GLOBAL pass over the FULL support set (any-of), bar window as a LOWER BOUND ──
 // Not a per-bar redistribution: a Dijkstra-style relaxation from the ground roots. An element
 // becomes placeable as soon as ONE thing it rests on has finished (§S9 any-of, no election).
 const barLo={}; for(const b in bars) barLo[b]=win[b].lo;
 const dur=new Float64Array(n); for(let i=0;i<n;i++) dur[i]=Math.max(1,items[i].e-items[i].s);
 const gloS=new Float64Array(n).fill(Infinity);
 const dependents=new Array(n); for(let i=0;i<n;i++) dependents[i]=[];
 for(let i=0;i<n;i++) for(const j of sup[i]) dependents[j].push(i);
 // seed: ground elements and elements with no support start at their own bar's floor
 const heap=[];
 for(let i=0;i<n;i++){
   if(items[i].bz<=groundZ+GAP || !sup[i].length){ gloS[i]=barLo[barOf(i)]; heap.push(i); }
 }
 heap.sort((a,b)=>gloS[a]-gloS[b]);
 let guard=0;
 while(heap.length && guard++ < 20*n){
   heap.sort((a,b)=>gloS[a]-gloS[b]);
   const u=heap.shift(); const fin=gloS[u]+dur[u];
   for(const v of dependents[u]){
     const cand=Math.max(barLo[barOf(v)],fin);
     if(cand<gloS[v]){ gloS[v]=cand; heap.push(v); }
   }
 }
 let unreached=0; for(let i=0;i<n;i++) if(!isFinite(gloS[i])){ gloS[i]=barLo[barOf(i)]; unreached++; }
 // ── VARIANT E: the same global pass, WITH CREW CAPS. List-scheduling over the support set. ──
 // A crew of the element's trade must be free. maxCrews from LABOR_RATES, same source the shipped
 // solver uses. Ready(i) = max(bar floor, finish of the EARLIEST support that has been placed).
 const crewS=new Float64Array(n).fill(Infinity);
 {
   const CAP=t=>Math.max(1,(R.LABOR_RATES[t]&&(R.LABOR_RATES[t].max_crews_fixed!=null?R.LABOR_RATES[t].max_crews_fixed:R.LABOR_RATES[t].max_crews))||1);
   const slots={};                                   // trade -> array of next-free times
   const ready=new Float64Array(n).fill(Infinity);
   const placedN=new Uint8Array(n);
   const remaining=[];
   for(let i=0;i<n;i++){
     if(items[i].bz<=groundZ+GAP || !sup[i].length) ready[i]=barLo[barOf(i)];
     remaining.push(i);
   }
   let done=0,guard2=0;
   while(done<n && guard2++ < n+5){
     // take every element whose ready is finite, earliest first
     const avail=remaining.filter(i=>!placedN[i]&&isFinite(ready[i]));
     if(!avail.length){ for(const i of remaining) if(!placedN[i]&&!isFinite(ready[i])) ready[i]=barLo[barOf(i)]; continue; }
     avail.sort((a,b)=>ready[a]-ready[b]);
     for(const i of avail){
       if(placedN[i]) continue;
       const tr=items[i].resource||'_DEFAULT', cap=CAP(tr);
       const arr=slots[tr]||(slots[tr]=new Float64Array(cap).fill(-Infinity));
       let bi=0; for(let k=1;k<arr.length;k++) if(arr[k]<arr[bi]) bi=k;
       const st=Math.max(ready[i],arr[bi]===-Infinity?ready[i]:arr[bi]);
       crewS[i]=st; arr[bi]=st+dur[i]; placedN[i]=1; done++;
       for(const v of dependents[i]){
         const cand=Math.max(barLo[barOf(v)],st+dur[i]);
         if(cand<ready[v]) ready[v]=cand;
       }
     }
   }
   for(let i=0;i<n;i++) if(!isFinite(crewS[i])) crewS[i]=barLo[barOf(i)];
 }
 const B=judge(baseS),D=judge(dagS),C=judge(gloS),E=judge(crewS);
 const pct=(a,b)=>b?((100*a/b).toFixed(1)+'%'):'-';
 console.log(`§SDAG_CYCLES bars=${Object.keys(bars).length} cyclicBars=${cyclicBars} nodesInCycles=${cyclicNodes} maxLayerDepth=${maxLayer}`);
 console.log(`§SDAG_BASE  floating=${B.floating} (intra=${B.floatIntra} cross=${B.floatCross}) noSupportAnywhere=${B.noSup} onGround=${B.grounded}`);
 console.log(`§SDAG_INJ   floating=${D.floating} (intra=${D.floatIntra} cross=${D.floatCross}) noSupportAnywhere=${D.noSup} onGround=${D.grounded}`);
 // COST of the global pass: makespan, and containment (does it still fit its own bar?)
 const mk=S=>{let lo=Infinity,hi=-Infinity;for(let i=0;i<n;i++){if(S[i]<lo)lo=S[i];const e=S[i]+dur[i];if(e>hi)hi=e;}return (hi-lo)/DAY;};
 let outWin=0,lateDays=0;
 for(let i=0;i<n;i++){const w=win[barOf(i)];if(gloS[i]+dur[i]>w.hi+1){outWin++;lateDays=Math.max(lateDays,(gloS[i]+dur[i]-w.hi)/DAY);}}
 let outWinE=0; for(let i=0;i<n;i++){const w=win[barOf(i)];if(crewS[i]+dur[i]>w.hi+1)outWinE++;}
 console.log(`§SDAG_COST makespanDays base=${mk(baseS).toFixed(1)} globalDAG=${mk(gloS).toFixed(1)} globalDAG+CREWS=${mk(crewS).toFixed(1)} | outsideOwnBar base-n/a global=${outWin} crews=${outWinE} worstOverrunDays=${lateDays.toFixed(1)}`);
 console.log(`§SDAG_CREW floating=${E.floating} (intra=${E.floatIntra} cross=${E.floatCross}) — the global DAG WITH crew caps`);
 console.log(`§SDAG_GLOBAL floating=${C.floating} (intra=${C.floatIntra} cross=${C.floatCross}) unreachedFromGround=${unreached}`);
 console.log(`§SDAG_DELTA base=${B.floating} perBarDAG=${D.floating} GLOBAL_DAG=${C.floating}  | intra ${B.floatIntra}/${D.floatIntra}/${C.floatIntra}  cross ${B.floatCross}/${D.floatCross}/${C.floatCross}`);
}
})().catch(e=>{console.error(e);process.exit(1);});
