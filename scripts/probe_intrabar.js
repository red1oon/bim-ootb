// Can BAR ORDERING alone prevent midair? Measure where the physics actually lives:
// is an element's support inside its OWN bar (phase x storey), or in another one?
'use strict';
const fs=require('fs'),path=require('path'),os=require('os');
const ROOT=path.join(__dirname,'..');
const initSqlJs=require(path.join(ROOT,'modeller','lib','sql-wasm.js'));
const ScheduleGate=require(path.join(ROOT,'viewer','schedule_gate.js'));
const ScheduleAuthor=require(path.join(ROOT,'viewer','schedule_author.js'));
const SupportSweep=require(path.join(ROOT,'viewer','support_sweep.js'));
global.ScheduleGate=ScheduleGate;
(async()=>{
const SQL=await initSqlJs({wasmBinary:fs.readFileSync(path.join(ROOT,'modeller','lib','sql-wasm.wasm'))});
const rs=fs.readFileSync(path.join(ROOT,'viewer','rates.js'),'utf8');
const R=(new Function(rs+'\nreturn {SEQUENCE_RULES,SEQUENCE_DEFAULT,SEQUENCE_NAME_OVERRIDES,LABOR_RATES,RATES};'))();
for(const NAME of (process.env.ONLY||'Duplex,HHS_Office_Federated,Terminal').split(',')){
 const db=new SQL.Database(fs.readFileSync(path.join(os.homedir(),'bim-ootb','buildings',NAME+'_extracted.db')));
 const els=ScheduleAuthor._buildScheduleElements(db,R.SEQUENCE_RULES,{laborRates:R.LABOR_RATES,rates:R.RATES,nameOverrides:R.SEQUENCE_NAME_OVERRIDES,defaultRule:R.SEQUENCE_DEFAULT});
 db.close();
 const mc={};for(const r in R.LABOR_RATES)if(R.LABOR_RATES[r].max_crews)mc[r]=R.LABOR_RATES[r].max_crews;
 const raw=ScheduleGate.computeSchedule(els,0,1,mc,24);
 const items=[];els.forEach(e=>{const st=raw[e.guid];if(!st)return;
  items.push({guid:e.guid,s:st.start,e:st.end,bz:e.base_z,tz:e.top_z,x0:e.x0,x1:e.x1,y0:e.y0,y1:e.y1,cls:e.cls,seq:e.seq,phase:e.phase,storey:e.storey});});
 const G=SupportSweep.contactGraph(items);
 const EPS=ScheduleGate.EPS,GAP=ScheduleGate.GAP;
 const bar=i=>(items[i].phase||'_UNPHASED')+'||'+ScheduleGate.collapsePhase(items[i].storey);
 let intra=0,interB=0,interPhase=0,interStorey=0,none=0,tot=0;
 for(let i=0;i<items.length;i++){
  const T=items[i],list=G.contacts[i]||[];
  let has=false;
  for(const j of list){const S=items[j];
   if(!(S.bz<T.bz-EPS&&S.tz>=T.bz-GAP))continue;      // BEARING-BELOW only: real gravity
   has=true;tot++;
   if(bar(j)===bar(i))intra++;
   else{interB++;
    if((items[j].phase||'')!==(T.phase||''))interPhase++;
    if(ScheduleGate.collapsePhase(items[j].storey)!==ScheduleGate.collapsePhase(T.storey))interStorey++;}
  }
  if(!has)none++;
 }
 const pct=x=>tot?(100*x/tot).toFixed(1):'0.0';
 console.log(`§INTRABAR ${NAME} elements=${items.length} bearingPairs=${tot}`);
 console.log(`   SAME bar (phase x storey)      = ${intra} (${pct(intra)}%)  <- bar ordering CANNOT help these`);
 console.log(`   different bar                  = ${interB} (${pct(interB)}%)`);
 console.log(`     of which different PHASE     = ${interPhase} (${pct(interPhase)}%)  <- template order helps`);
 console.log(`     of which different STOREY    = ${interStorey} (${pct(interStorey)}%)  <- ladder helps`);
 console.log(`   elements with NO bearing-below = ${none}/${items.length} (${(100*none/items.length).toFixed(1)}%)`);
}})().catch(e=>{console.error(e);process.exit(1);});
