#!/usr/bin/env node
// probe_grail_criteria.js — the USER'S acceptance bar, 2026-08-26, in their own words:
// "usability and editable correct start of ARCH, not stack issue and no MEP dangling before ARCH
// completes". Measured on CpmSchedule's real output. SUPPORT_SET=1 / SUPPORT_FS=1 switch the E1
// edge set (see cpm_schedule.js §SDAG_WIRED). Read the log after every run.
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
const MEP=/^Ifc(Flow|Distribution|Pipe|Duct|Cable|Air|Valve|Pump|Fan|Sanitary|Junction|Protective|Controller|Actuator|Alarm|Light|Outlet|Switch|Electric|Energy)/;
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
   cls:e.cls,seq:e.seq,phase:e.phase,storey:e.storey,resource:e.resource});});
 const n=items.length;
 const cr=CpmSchedule.run(items,{maxCrews:dmc});
 if(!cr||!cr.ok){console.log('§GRAIL '+NAME+' CPM FAILED');continue;}
 const S=new Float64Array(n),E=new Float64Array(n);
 for(let i=0;i<n;i++){S[i]=cr.solution.times[i].s;E[i]=cr.solution.times[i].e;}
 const G=SupportSweep.contactGraph(items);
 const EPS=ScheduleGate.EPS,GAP=ScheduleGate.GAP;
 const groundZ=Math.min.apply(null,items.map(x=>x.bz));
 const sup=new Array(n);
 for(let i=0;i<n;i++){const T=items[i],o=[];for(const j of (G.contacts[i]||[])){const Z=items[j];
   if(Z.bz<T.bz-EPS&&Z.tz>=T.bz-GAP)o.push(j);}sup[i]=o;}
 // ── 1. MIDAIR, any-of judge (at my start, is >=1 support started?) ──
 let mid=0,noSup=0;
 for(let i=0;i<n;i++){if(items[i].bz<=groundZ+GAP)continue;if(!sup[i].length){noSup++;continue;}
   let ok=false;for(const j of sup[i])if(S[j]<=S[i]+1){ok=true;break;} if(!ok)mid++;}
 // ── 2. ARCH START: an Architecture element starting before a structural support FINISHES ──
 const isArch=i=>/Architect/i.test(items[i].phase||'');
 const isStr=i=>/(Substructure|Superstructure)/i.test(items[i].phase||'');
 let archEarly=0,archTot=0;
 for(let i=0;i<n;i++){if(!isArch(i))continue;archTot++;
   for(const j of sup[i]) if(isStr(j)&&E[j]>S[i]+1){archEarly++;break;}}
 // ── 3. MEP DANGLING: MEP starting before the thing it rests on has FINISHED ──
 let mepEarly=0,mepTot=0,mepBeforeArchDone=0;
 let archDone=-Infinity;for(let i=0;i<n;i++)if(isArch(i)&&E[i]>archDone)archDone=E[i];
 for(let i=0;i<n;i++){const isM=MEP.test(items[i].cls)||/MEP/i.test(items[i].phase||'');
   if(!isM)continue;mepTot++;
   for(const j of sup[i]) if(E[j]>S[i]+1){mepEarly++;break;}
   if(S[i]<archDone-1)mepBeforeArchDone++;}
 // ── 4. STACKING: how many share one instant ──
 const at={};for(let i=0;i<n;i++){const k=Math.round(S[i]/60000);at[k]=(at[k]||0)+1;}
 const piles=Object.values(at);const maxPile=Math.max.apply(null,piles);
 const inBigPiles=piles.filter(v=>v>=20).reduce((a,b)=>a+b,0);
 // ── 5. BAND INVERSIONS — witness_bar_schedule.js's own rule (trade x bandRank, raw labels) ──
 const br=(ScheduleGate.deriveBandRanks?ScheduleGate.deriveBandRanks(els,null).bandRank:{})||{};
 const m={};
 for(let i=0;i<n;i++){const lab=ScheduleGate.collapsePhase(items[i].storey);const rk=br[lab];
   if(rk==null)continue;const k=(items[i].resource||'_DEFAULT')+'|'+rk;
   const x=m[k]||(m[k]={max:-Infinity,starts:[]});if(E[i]>x.max)x.max=E[i];x.starts.push(S[i]);}
 let inv=0;
 Object.keys(m).forEach(k=>{const [tr,rk]=k.split('|');const prev=m[tr+'|'+(Number(rk)-1)];
   if(!prev)return;m[k].starts.forEach(st=>{if(st<prev.max-1)inv++;});});
 const mk=(()=>{let lo=Infinity,hi=-Infinity;for(let i=0;i<n;i++){if(S[i]<lo)lo=S[i];if(E[i]>hi)hi=E[i];}return(hi-lo)/DAY;})();
 const mode=process.env.SUPPORT_SET?(process.env.SUPPORT_FS?'SET_FS':'SET_SS'):'BASE_elected';
 console.log(`§GRAIL ${NAME} mode=${mode} n=${n} makespanD=${mk.toFixed(1)}`);
 console.log(`   midair(any-of)=${mid}  noSupportAnywhere=${noSup}`);
 console.log(`   ARCH_early (starts before a structural support finishes) = ${archEarly}/${archTot}`);
 console.log(`   MEP_early  (starts before what it rests on finishes)     = ${mepEarly}/${mepTot}`);
 console.log(`   MEP_before_ARCH_complete                                 = ${mepBeforeArchDone}/${mepTot}`);
 console.log(`   STACK maxAtOneMinute=${maxPile} elementsInPiles>=20=${inBigPiles}`);
 console.log(`   BAND_INVERSIONS=${inv}`);
}})().catch(e=>{console.error(e);process.exit(1);});
