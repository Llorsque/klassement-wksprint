"use strict";
// ════════════════════════════════════════════════════════
// ISU World Sprint Championships 2026 — Heerenveen
// ════════════════════════════════════════════════════════
const EVENT_ID="2024_GER_0001";
const API_BASE=`https://api.isuresults.eu/events/${EVENT_ID}/competitions`;
const JINA="https://r.jina.ai/";
const LIVE_BASE=`https://live.isuresults.eu/events/${EVENT_ID}/competition`;
const POLL_MS=3000;

const DISTANCES={
  v:[
    {key:"d1_500",label:"1st 500m",meters:500,divisor:1,compId:1},
    {key:"d1_1000",label:"1st 1000m",meters:1000,divisor:2,compId:3},
    {key:"d2_500",label:"2nd 500m",meters:500,divisor:1,compId:5},
    {key:"d2_1000",label:"2nd 1000m",meters:1000,divisor:2,compId:7},
  ],
  m:[
    {key:"d1_500",label:"1st 500m",meters:500,divisor:1,compId:2},
    {key:"d1_1000",label:"1st 1000m",meters:1000,divisor:2,compId:4},
    {key:"d2_500",label:"2nd 500m",meters:500,divisor:1,compId:6},
    {key:"d2_1000",label:"2nd 1000m",meters:1000,divisor:2,compId:8},
  ],
};

// ── UTILS ───────────────────────────────────────────────
function esc(s){return String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}
function parseTime(raw){if(!raw||typeof raw!=="string")return null;const s=raw.trim().replace(",",".");const mc=s.match(/^(\d{1,2}):(\d{2}(?:\.\d{1,3})?)$/);if(mc)return parseFloat(mc[1])*60+parseFloat(mc[2]);const n=parseFloat(s);return Number.isFinite(n)&&n>0?n:null}
function fmtTime(sec){if(!Number.isFinite(sec)||sec<=0)return"—";const m=Math.floor(sec/60),s=sec-m*60;const str=s.toFixed(2).padStart(5,"0").replace(".",",");return m>0?`${m}:${str}`:`${str}`}
function fmtDelta(sec){if(!Number.isFinite(sec))return"—";const r=Math.round(sec*100)/100;const sign=r<0?"−":"+",abs=Math.abs(r);const m=Math.floor(abs/60);const s2=(abs-m*60).toFixed(2).replace(".",",");return m>0?`${sign}${m}:${s2.padStart(5,"0")}`:`${sign}${s2}`}
function fmtPts(p){return Number.isFinite(p)?p.toFixed(3):"—"}
function trunc3(n){return Math.floor(n*1000)/1000}
function trunc2(n){return Math.floor(n*100)/100}
function medal(r){return{1:"🥇",2:"🥈",3:"🥉"}[r]??""}
function podCls(r){return r>=1&&r<=3?` row--${["","gold","silver","bronze"][r]}`:"";}
function shortName(name){const p=(name??"").split(" ");return p.length>1?p[p.length-1]:name}
function flag(cc){if(!cc)return"";try{return String.fromCodePoint(...[...cc.toUpperCase()].map(c=>0x1F1E6+c.charCodeAt(0)-65))}catch(_){return cc}}
function laneDot(lane){return lane==="O"||lane==="Outer"?'<span class="lane-dot lane-dot--outer" title="Outer"></span>':lane==="I"||lane==="Inner"?'<span class="lane-dot lane-dot--inner" title="Inner"></span>':""}
function recordBadge(rec){if(!rec)return"";if(rec==="TR"||rec==="WR")return`<span class="rec-badge rec-badge--tr">${esc(rec)}</span>`;if(rec==="PB")return'<span class="rec-badge rec-badge--pb">PB</span>';return""}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}

// ── STATE ───────────────────────────────────────────────
const state={gender:"v",view:"overview",selectedDist:"d1_500",pollDist:"all"};
const dataCache={v:{},m:{}};
const startListCache={v:{},m:{}};
const frozenStandings={v:null,m:null};
let standings=null,dataSource="waiting";
const lastFetch={v:null,m:null};

function getDists(){return DISTANCES[state.gender]}
function getCompId(g,dKey){return DISTANCES[g].find(d=>d.key===dKey)?.compId}

// ── FETCH ───────────────────────────────────────────────
async function fetchJSON(compId,type="results"){
  const cb=Date.now();
  // Try 1: Direct API
  try{
    const r=await fetch(`${API_BASE}/${compId}/${type}/?_=${cb}`,{cache:"no-store"});
    if(r.ok){const d=await r.json();const arr=Array.isArray(d)?d:(d?.results??[]);if(arr.length>0)return arr}
  }catch(_){}
  // Try 2: allorigins proxy
  try{
    const u=`${API_BASE}/${compId}/${type}/`;
    const r=await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(u)}&_=${cb}`,{cache:"no-store"});
    if(r.ok){const w=await r.json();const d=JSON.parse(w.contents);const arr=Array.isArray(d)?d:(d?.results??[]);if(arr.length>0)return arr}
  }catch(_){}
  // Try 3: Jina reader (text fallback)
  try{
    const url=`${LIVE_BASE}/${compId}/${type}`;
    const r=await fetch(`${JINA}${url}?_=${cb}`,{cache:"no-store"});
    if(r.ok){const t=await r.text();if(t.length>200)return{_text:t}}
  }catch(_){}
  return null;
}

function parseAPIResults(raw){
  if(!raw||raw._text)return parseTextResults(raw?._text);
  if(!Array.isArray(raw))return[];
  return raw.filter(r=>r.time&&r.competitor?.skater).map(r=>{
    const sk=r.competitor.skater;
    // Detect record: API may use records array, isTrackRecord, or flags
    let rec="";
    if(r.records){if(r.records.includes("TR")||r.records.includes("track"))rec="TR";else if(r.records.includes("PB")||r.records.includes("personal"))rec="PB"}
    if(!rec&&r.isTrackRecord)rec="TR";
    if(!rec&&r.isPersonalBest)rec="PB";
    return{name:`${sk.firstName} ${sk.lastName}`,country:sk.country||"",rank:r.rank,
      no:r.competitor.number||r.startNumber||0,
      time:r.time,seconds:trunc2(parseTime(r.time)),timeBehind:r.timeBehind||"",
      startLane:r.startLane||r.competitor?.startLane||"",record:rec,
      laps:r.laps||[]};
  }).filter(r=>r.seconds!=null&&r.seconds>0);
}

function parseAPIStartList(raw){
  if(!raw||raw._text)return parseTextStartList(raw?._text);
  if(!Array.isArray(raw))return[];
  // API start-list: items may have pairNumber or need to be inferred from startNumber pairs
  const items=raw.filter(r=>r.competitor?.skater).map(r=>{
    const sk=r.competitor.skater;
    const pb=r.personalBest||r.pb||r.seasonBest||"";
    return{name:`${sk.firstName} ${sk.lastName}`,country:sk.country||"",
      no:r.competitor.number||r.startNumber||0,
      startLane:r.startLane||r.lane||"",
      pairNumber:r.pairNumber||0,pb:typeof pb==="string"?pb:""};
  });
  // If pairNumber is 0 for all, infer pairs from order (2 per pair)
  if(items.length>0&&items.every(i=>i.pairNumber===0)){
    let pn=1;for(let i=0;i<items.length;i++){items[i].pairNumber=pn;if(i%2===1)pn++;}
    // Handle odd number (solo last pair)
    if(items.length%2===1)items[items.length-1].pairNumber=Math.ceil(items.length/2);
  }
  return items;
}

// Text fallback parsers (from Jina rendered HTML)
function norm(n){return String(n??"").trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu,"").replace(/[\u2018\u2019`\u00B4\u2032\u02BC\u02BB']/g,"'").replace(/\s+/g," ")}
function parseTextResults(text){
  if(!text)return[];
  const results=[],lines=text.split(/\n/);
  const timeRe=/(\d{1,2}:\d{2}[\.,]\d{2,3}|\d{2,3}[\.,]\d{2,3})/;
  for(const line of lines){
    const m=line.match(timeRe);
    if(!m)continue;
    const rawTime=m[1].replace(",",".");
    const sec=parseTime(rawTime);if(!sec)continue;
    const before=line.substring(0,m.index).trim();
    const after=line.substring(m.index+m[1].length);
    // Detect record badges
    let rec="";if(/\bTR\b/.test(after))rec="TR";else if(/\bWR\b/.test(after))rec="WR";else if(/\bPB\b/.test(after))rec="PB";
    // Extract NO and lane dot
    const noMatch=before.match(/(\d{1,3})\s*[●○🔴⚪]?\s*/);
    const no=noMatch?parseInt(noMatch[1]):0;
    const laneMatch=before.match(/[●🔴]/);
    const lane=laneMatch?"O":before.match(/[○⚪]/i)?"I":"";
    // Country code
    const ccMatch=before.match(/\b([A-Z]{3})\s*$/)||line.match(/\b([A-Z]{3})\b/);
    const cc=ccMatch?ccMatch[1]:"";
    // Name: strip rank number, NO, lane dots, country
    let nameStr=before.replace(/^\d+\s*/,"").replace(/\d{1,3}\s*[●○🔴⚪]?\s*/,"").replace(/\b[A-Z]{3}\s*$/,"").replace(/[●○🔴⚪⊞⊕]/g,"").trim();
    if(nameStr.length<2)continue;
    // Behind: look for +X.XX after time
    const behindMatch=after.match(/\+(\d{1,2}[:\.]?\d{2}[\.,]\d{2,3}|\d+[\.,]\d{2,3})/);
    const behind=behindMatch?behindMatch[0]:"";
    results.push({name:nameStr,country:cc,time:rawTime,seconds:trunc2(sec),rank:results.length+1,no,timeBehind:behind,startLane:lane,record:rec,laps:[]});
  }
  return results;
}
function parseTextStartList(text){
  if(!text)return[];
  const list=[],lines=text.split(/\n/);
  let pairNum=0;
  for(const line of lines){
    // Detect pair number: "1" at start of row, or "Pair: 1"
    const pm=line.match(/^[\s]*(\d{1,2})\s+[OI]\s/)||line.match(/(?:pair|rit)[:\s]*(\d+)/i);
    if(pm)pairNum=parseInt(pm[1]);
    // Detect lane
    const laneMatch=line.match(/\b([OI])\b/);
    const lane=laneMatch?laneMatch[1]:"";
    // Detect NO
    const noMatch=line.match(/\b(\d{2,3})\b/);
    // Detect name (First Last pattern)
    const nm=line.match(/([A-Z][a-zA-Z\u00C0-\u017F'-]+(?:\s+[A-Za-z\u00C0-\u017F'-]+)+)/);
    if(!nm)continue;
    const name=nm[1].trim();
    if(name.length<4||/^(Pair|Lane|Name|Time|Behind|Rank)/i.test(name))continue;
    const ccm=line.match(/\b([A-Z]{3})\b/g);
    const cc=ccm?ccm.find(c=>c!=="PB"&&c!=="NO"&&c!=="TR"&&c!=="WR")||"":"";
    // PB time
    const pbMatch=line.match(/(\d{1,2}:\d{2}[\.,]\d{2,3}|\d{2,3}[\.,]\d{2,3})\s*$/);
    const pb=pbMatch?pbMatch[1].replace(",","."):"";
    const no=noMatch?parseInt(noMatch[1]):0;
    list.push({name,country:cc,no,startLane:lane,pairNumber:pairNum||Math.ceil((list.length+1)/2),pb});
  }
  return list;
}

async function fetchGender(g,onlyDist){
  const ds=DISTANCES[g];
  const toFetch=onlyDist?ds.filter(d=>d.key===onlyDist):ds;
  for(const d of toFetch){
    // Fetch results
    const raw=await fetchJSON(d.compId,"results");
    const results=parseAPIResults(raw);
    if(results.length>0)dataCache[g][d.key]=results;
    // Fetch start-list (only on full fetch, not single-distance polls)
    if(!onlyDist){
      const slRaw=await fetchJSON(d.compId,"start-list");
      const sl=parseAPIStartList(slRaw);
      if(sl.length>0)startListCache[g][d.key]=sl;
    }
    if(!onlyDist)await sleep(300);
  }
  lastFetch[g]=new Date();
}

// ── COMPUTE ─────────────────────────────────────────────
function buildParticipants(g){
  const ds=DISTANCES[g],seen=new Map();
  // Collect from results + start-lists
  for(const d of ds){
    for(const r of(dataCache[g][d.key]??[]))if(!seen.has(r.name))seen.set(r.name,{name:r.name,country:r.country});
    for(const s of(startListCache[g][d.key]??[]))if(!seen.has(s.name))seen.set(s.name,{name:s.name,country:s.country});
  }
  return[...seen.values()];
}

function computeStandings(){
  const ds=getDists(),g=state.gender;
  const parts=buildParticipants(g);
  const athletes=parts.map(p=>{
    const a={name:p.name,country:p.country,times:{},seconds:{},points:{},distRanks:{}};
    for(const d of ds){const r=(dataCache[g][d.key]??[]).find(x=>x.name===p.name);if(r){a.times[d.key]=r.time;a.seconds[d.key]=r.seconds;a.points[d.key]=trunc3(r.seconds/d.divisor)}}
    return a;
  });
  for(const d of ds){const s=athletes.filter(a=>Number.isFinite(a.seconds[d.key])).sort((x,y)=>x.seconds[d.key]-y.seconds[d.key]);s.forEach((a,i)=>a.distRanks[d.key]=i+1)}
  for(const a of athletes){let sum=0,cnt=0;for(const d of ds){const p=a.points[d.key];if(Number.isFinite(p)){sum+=p;cnt++}}a.completedCount=cnt;const clean=Math.round(sum*1e6)/1e6;a.totalPoints=cnt===ds.length?clean:null;a.partialPoints=cnt>0?clean:null;a.currentPoints=a.totalPoints??a.partialPoints}
  const ranked=athletes.filter(a=>a.completedCount>0).sort((a,b)=>{if(b.completedCount!==a.completedCount)return b.completedCount-a.completedCount;return(a.currentPoints??999)-(b.currentPoints??999)});
  ranked.forEach((a,i)=>a.rank=i+1);
  const leader=ranked[0],lPts=leader?.currentPoints??null;
  for(const a of ranked)a.delta=Number.isFinite(lPts)&&Number.isFinite(a.currentPoints)?a.currentPoints-lPts:null;
  standings={all:athletes,ranked,leader};
  dataSource=athletes.some(a=>a.completedCount>0)?"live":"waiting";
}

function neededTime(athlete,distKey,targetPts){
  if(!Number.isFinite(targetPts))return null;
  const ds=getDists(),dist=ds.find(d=>d.key===distKey);if(!dist)return null;
  let other=0,oc=0;
  for(const d of ds){if(d.key===distKey)continue;const p=athlete.points[d.key];if(Number.isFinite(p)){other+=p;oc++}}
  if(oc<ds.length-1)return null;
  const need=targetPts-other;
  if(need<=0)return 0.01;
  return need*dist.divisor;
}

function standingsHash(s){if(!s?.ranked)return"";return s.ranked.map(a=>`${a.name}:${a.currentPoints}:${a.completedCount}`).join("|")}
function freezeStandings(){frozenStandings[state.gender]=JSON.parse(JSON.stringify(standings))}

// ── DOM ─────────────────────────────────────────────────
const el={};
function cacheEls(){for(const id of["statusBadge","statusText","genderTabs","navButtons","contentArea","overlay","menuBtn","sidebar","mobileMenu","mobileNav","pollSelect"])el[id]=document.getElementById(id)}
function setStatus(){if(!el.statusBadge)return;el.statusBadge.className=`badge badge--${dataSource}`;el.statusText.textContent=dataSource==="live"?"Live":"Loading…"}

// ── RENDER ──────────────────────────────────────────────
function render(){
  computeStandings();setStatus();
  const ds=getDists();
  const views=[{key:"overview",icon:"📊",label:"Overview"}];
  views.push({key:"_sep1",sep:true});
  for(const d of ds)views.push({key:`dist_${d.key}`,icon:"⏱",label:d.label});
  views.push({key:"_sep2",sep:true});
  views.push({key:"klassement",icon:"🏆",label:"Standings"});
  const navHtml=views.map(v=>v.sep?'<div class="nav-sep"></div>':`<button class="nav-btn ${state.view===v.key?'active':''}" data-view="${v.key}"><span class="nav-btn__icon">${v.icon}</span>${esc(v.label)}</button>`).join("");
  el.navButtons.innerHTML=navHtml;el.mobileNav.innerHTML=navHtml;
  el.genderTabs.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.gender===state.gender));
  if(state.view==="overview")return renderOverview();
  if(state.view.startsWith("dist_")){return renderDistance(state.view.replace("dist_",""))}
  if(state.view==="klassement")return renderKlassement();
  renderOverview();
}

// ── OVERVIEW (4 tiles) ──────────────────────────────────
function renderOverview(){
  const ds=getDists();
  const distOpts=ds.map(d=>`<option value="${d.key}"${d.key===state.selectedDist?" selected":""}>${esc(d.label)}</option>`).join("");
  const selDist=ds.find(d=>d.key===state.selectedDist)??ds[0];
  // Next unridden distance for tile 4
  let nextDist=null;
  for(const d of ds){if(!standings?.all?.some(a=>Number.isFinite(a.seconds[d.key]))){nextDist=d;break}}
  if(!nextDist)nextDist=ds[ds.length-1];

  el.contentArea.innerHTML=`
    <div class="overview-header">
      <h2>${state.gender==="v"?"Women":"Men"} — Sprint Championship</h2>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:11px;color:var(--text-dim)">Distance:</span>
        <select id="distSel" class="sel">${distOpts}</select>
      </div>
    </div>
    <div class="overview-grid">
      <div class="overview-tile" id="tile1">
        <div class="tile-header"><span class="tile-header__title">① Live Results — ${esc(selDist.label)}</span></div>
        <div class="tile-body" id="tile1Body"></div>
      </div>
      <div class="overview-tile" id="tile2">
        <div class="tile-header"><span class="tile-header__title">② Live Standings</span><span class="tile-header__badge" style="background:var(--isu-blue-dim);color:var(--isu-blue)">${standings?.ranked?.length??0} skaters</span></div>
        <div class="tile-body" id="tile2Body"></div>
      </div>
      <div class="overview-tile" id="tile3">
        <div class="tile-header"><span class="tile-header__title">③ Start List — ${esc(selDist.label)}</span><span class="tile-header__badge" style="background:rgba(246,173,85,.1);color:var(--orange)">Target for P1</span></div>
        <div class="tile-body" id="tile3Body"></div>
      </div>
      <div class="overview-tile" id="tile4">
        <div class="tile-header">
          <span class="tile-header__title">④ Frozen Standings</span>
          <span id="tile4Update"></span>
        </div>
        <div class="tile-body" id="tile4Body"></div>
      </div>
    </div>`;
  document.getElementById("distSel")?.addEventListener("change",e=>{state.selectedDist=e.target.value;render()});
  fillTile1(selDist);fillTile2();fillTile3(selDist);fillTile4(nextDist);
}

function fillTile1(dist){
  const body=document.getElementById("tile1Body");if(!body||!standings)return;
  const results=(dataCache[state.gender][dist.key]??[]).sort((a,b)=>a.seconds-b.seconds);
  if(!results.length){body.innerHTML=`<div style="padding:20px;text-align:center;color:var(--text-muted)">No results yet</div>`;return}
  const fastest=results[0]?.seconds;
  const rows=results.map((r,i)=>{
    const rk=i+1;const diff=r.seconds-fastest;
    const dStr=diff===0?"":`<span class="delta">${fmtDelta(diff)}</span>`;
    const badge=recordBadge(r.record);
    return`<tr class="${podCls(rk)}"><td><strong>${rk}</strong></td><td><span class="athlete" data-name="${esc(r.name)}">${esc(r.name)}</span> <span class="country">${esc(r.country)}</span></td><td class="mono">${fmtTime(r.seconds)} ${badge}</td><td>${dStr}</td></tr>`;
  }).join("");
  body.innerHTML=`<table class="tbl tbl--compact"><thead><tr><th>#</th><th>Name</th><th>Time</th><th>+</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function fillTile2(){
  const body=document.getElementById("tile2Body");if(!body||!standings)return;
  const ranked=standings.ranked;
  if(!ranked.length){body.innerHTML=`<div style="padding:20px;text-align:center;color:var(--text-muted)">No standings yet</div>`;return}
  const ds=getDists();const cc=ds.filter(d=>standings.all.some(a=>Number.isFinite(a.seconds[d.key]))).length;
  const rows=ranked.map(a=>{
    const dStr=a.rank===1?'<span class="delta delta--leader">L</span>':Number.isFinite(a.delta)?`<span class="delta">${fmtDelta(a.delta)}</span>`:"";
    return`<tr class="${podCls(a.rank)}"><td><strong>${a.rank}</strong></td><td><span class="athlete" data-name="${esc(a.name)}">${esc(a.name)}</span><span class="country">${esc(a.country)}</span></td><td class="mono"><strong>${fmtPts(a.currentPoints)}</strong></td><td>${a.completedCount}/${ds.length}</td><td>${dStr}</td></tr>`;
  }).join("");
  body.innerHTML=`<table class="tbl tbl--compact"><thead><tr><th>#</th><th>Name</th><th>Points</th><th>Dist</th><th>Δ</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function fillTile3(dist){
  const body=document.getElementById("tile3Body");if(!body)return;
  const sl=startListCache[state.gender][dist.key]??[];
  const lPts=standings?.leader?.currentPoints;
  if(!sl.length){
    body.innerHTML=`<div style="padding:20px;text-align:center;color:var(--text-muted)">Start list not yet available</div>`;return;
  }
  // Group by pair
  const pairs=new Map();
  for(const s of sl){const pn=s.pairNumber||0;if(!pairs.has(pn))pairs.set(pn,[]);pairs.get(pn).push(s)}
  let rows="";let first=true;
  for(const[pn,skaters]of pairs){
    for(let si=0;si<skaters.length;si++){
      const s=skaters[si];
      const ath=standings?.all?.find(a=>a.name===s.name);
      const nt=ath?neededTime(ath,dist.key,lPts):null;
      const ntStr=Number.isFinite(nt)&&nt>0?`<span class="target-time">${fmtTime(nt)}</span>`:Number.isFinite(nt)?`<span class="needed-time">✓</span>`:"";
      const pairCell=si===0?`<span class="pair-link" data-pair="${pn}" data-dist="${dist.key}">${pn}</span>`:"";
      rows+=`<tr><td>${pairCell}</td><td>${laneDot(s.startLane)}</td><td><span class="athlete" data-name="${esc(s.name)}">${esc(s.name)}</span> <span class="country">${esc(s.country)}</span></td><td>${ntStr}</td></tr>`;
    }
  }
  body.innerHTML=`<table class="tbl tbl--compact"><thead><tr><th>Rit</th><th></th><th>Name</th><th>Target P1</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function fillTile4(nextDist){
  const body=document.getElementById("tile4Body"),upd=document.getElementById("tile4Update");
  if(!body||!standings)return;
  if(!frozenStandings[state.gender])freezeStandings();
  const fs=frozenStandings[state.gender];
  const hasUpdate=standingsHash(standings)!==standingsHash(fs);
  if(upd)upd.innerHTML=hasUpdate?`<button class="btn--update" id="updateFrozen">🔄 Update</button>`:`<span style="font-size:10px;color:var(--text-muted)">Up to date</span>`;
  document.getElementById("updateFrozen")?.addEventListener("click",()=>{freezeStandings();render()});

  const show=fs;if(!show?.ranked?.length){body.innerHTML=`<div style="padding:20px;text-align:center;color:var(--text-muted)">No standings yet</div>`;return}
  const ds=getDists();const cc=ds.filter(d=>show.all.some(a=>Number.isFinite(a.seconds[d.key]))).length;
  const lPts=standings?.leader?.currentPoints;
  const rows=show.ranked.map(a=>{
    const nt=neededTime(a,nextDist.key,lPts);
    const ntStr=Number.isFinite(nt)&&nt>0?`<span class="target-time">${fmtTime(nt)}</span>`:Number.isFinite(nt)?`<span class="needed-time">✓</span>`:"";
    return`<tr class="${podCls(a.rank)}"><td><strong>${a.rank}</strong></td><td><span class="athlete" data-name="${esc(a.name)}">${esc(a.name)}</span><span class="country">${esc(a.country??"")}</span></td><td class="mono"><strong>${fmtPts(a.currentPoints)}</strong></td><td>${ntStr}</td></tr>`;
  }).join("");
  body.innerHTML=`<div style="padding:4px 10px;font-size:10px;color:var(--text-muted)">After ${cc}/${ds.length} distances · Next: ${esc(nextDist.label)}</div>
    <table class="tbl tbl--compact"><thead><tr><th>#</th><th>Name</th><th>Points</th><th>Need ${esc(nextDist.label)}</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ── DISTANCE DETAIL ─────────────────────────────────────
function renderDistance(dKey){
  const ds=getDists(),dist=ds.find(d=>d.key===dKey)??ds[0];
  if(!dist||!standings)return;
  const results=(dataCache[state.gender][dist.key]??[]).sort((a,b)=>a.seconds-b.seconds);
  const fastest=results[0]?.seconds??null;

  const mainR=results.map((r,i)=>{
    const rk=i+1;const diff=Number.isFinite(fastest)?r.seconds-fastest:null;
    const dStr=diff===0?"":Number.isFinite(diff)?`<span class="delta">${fmtDelta(diff)}</span>`:"";
    const badge=recordBadge(r.record);
    return`<tr class="${podCls(rk)}"><td><strong>${rk}</strong> ${medal(rk)}</td><td><span class="athlete" data-name="${esc(r.name)}">${esc(r.name)}</span> <span class="country">${esc(r.country)}</span></td><td class="mono">${fmtTime(r.seconds)} ${badge}</td><td class="mono">${fmtPts(trunc3(r.seconds/dist.divisor))}</td><td>${dStr}</td></tr>`;
  }).join("");

  // Sidebar standings
  const lPts=standings.leader?.currentPoints;
  let nextDist=null;for(const d of ds){if(!standings.all.some(a=>Number.isFinite(a.seconds[d.key]))){nextDist=d;break}}
  if(!nextDist)nextDist=dist;
  const sideR=standings.ranked.map(a=>{
    const nt=neededTime(a,nextDist.key,lPts);
    const ntStr=(a.rank>1&&Number.isFinite(nt)&&nt>0)?`<span class="target-time">${fmtTime(nt)}</span>`:"";
    const dStr=a.rank===1?'<span class="delta delta--leader">L</span>':Number.isFinite(a.delta)?`<span class="delta" style="font-size:10px">${fmtDelta(a.delta*nextDist.divisor)}</span>`:"";
    return`<tr><td style="font-weight:700;font-size:11px;color:var(--text-dim)">${a.rank}</td><td><span class="athlete" data-name="${esc(a.name)}">${esc(a.name)}</span></td><td class="mono">${fmtPts(a.currentPoints)}</td><td>${dStr}</td><td>${ntStr}</td></tr>`;
  }).join("");
  const cc=ds.filter(d=>standings.all.some(a=>Number.isFinite(a.seconds[d.key]))).length;

  el.contentArea.innerHTML=`
    <h2 style="font-size:17px;font-weight:800;margin-bottom:12px">${esc(dist.label)} — ${state.gender==="v"?"Women":"Men"}</h2>
    <div style="display:grid;grid-template-columns:1fr 380px;gap:16px;align-items:start">
      <div class="table-wrap"><table class="tbl"><thead><tr><th>#</th><th>Name</th><th>Time</th><th>Points</th><th>Gap</th></tr></thead><tbody>${mainR}</tbody></table></div>
      <div>
        <div style="font-size:12px;font-weight:700;color:var(--isu-blue);margin-bottom:4px">Live Standings <span style="color:var(--text-dim);font-weight:400">(${cc}/${ds.length})</span></div>
        ${nextDist?`<div style="font-size:10px;color:var(--text-dim);margin-bottom:6px">Target on ${esc(nextDist.label)} for P1</div>`:""}
        <div class="table-wrap"><table class="tbl tbl--compact"><thead><tr><th>#</th><th>Name</th><th>Pts</th><th>Δ</th><th>Target</th></tr></thead><tbody>${sideR}</tbody></table></div>
      </div>
    </div>`;
}

// ── KLASSEMENT FULL ─────────────────────────────────────
function renderKlassement(){
  const ds=getDists();if(!standings)return;
  const ranked=standings.ranked;
  const hdr=ds.map(d=>`<th>${esc(d.label)}</th>`).join("");
  const rows=ranked.map(a=>{
    const cells=ds.map(d=>{const t=a.seconds[d.key],dr=a.distRanks[d.key];const m=dr?`<span class="dist-medal">${medal(dr)}</span>`:"";return Number.isFinite(t)?`<td class="mono">${fmtTime(t)}${m}</td>`:`<td class="mono" style="color:var(--text-muted)">—</td>`}).join("");
    const dStr=a.rank===1?'<span class="delta delta--leader">Leader</span>':Number.isFinite(a.delta)?`<span class="delta">${fmtDelta(a.delta)}</span>`:"";
    return`<tr class="${podCls(a.rank)}"><td><strong>${a.rank}</strong></td><td><span class="athlete" data-name="${esc(a.name)}">${esc(a.name)}</span><span class="country">${esc(a.country)}</span></td>${cells}<td class="mono"><strong>${fmtPts(a.currentPoints)}</strong></td><td>${dStr}</td></tr>`;
  }).join("");
  const cc=ds.filter(d=>standings.all.some(a=>Number.isFinite(a.seconds[d.key]))).length;
  el.contentArea.innerHTML=`
    <h2 style="font-size:17px;font-weight:800;margin-bottom:2px">Sprint Championship Standings — ${state.gender==="v"?"Women":"Men"}</h2>
    <div style="font-size:11px;color:var(--text-dim);margin-bottom:12px">After ${cc}/${ds.length} distances${lastFetch[state.gender]?` · Updated ${lastFetch[state.gender].toLocaleTimeString("nl-NL")}`:""}</div>
    <div class="table-wrap"><table class="tbl"><thead><tr><th>#</th><th>Name</th>${hdr}<th>Points</th><th>Δ</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="info-box"><strong>Sorting:</strong> most distances completed → lowest points. Points = time(s) ÷ distance factor (500m=1, 1000m=2), truncated to 3 decimals.</div>`;
}

// ── POPUP: Athlete ──────────────────────────────────────
function openPopup(name){
  if(!standings)return;const a=standings.all.find(x=>x.name===name);if(!a)return;const ds=getDists();const g=state.gender;
  const rowed=ds.filter(d=>a.times[d.key]);
  // Collect records and PB per distance
  const records={},pbs={};
  for(const d of ds){
    const res=(dataCache[g][d.key]??[]).find(r=>r.name===name);
    if(res?.record)records[d.key]=res.record;
    const sl=(startListCache[g][d.key]??[]).find(s=>s.name===name);
    if(sl?.pb)pbs[d.key]=sl.pb;
  }
  let h=`<div class="panel"><div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:14px"><div><h3>${esc(name)}</h3><div style="font-size:12px;color:var(--text-dim)">${flag(a.country)} ${esc(a.country)}</div></div><button class="close-btn" id="closePopup">✕</button></div>
    <div class="stat-grid">
      <div class="stat-box"><div class="stat-box__label">Rank</div><div class="stat-box__value">#${a.rank??"—"}</div></div>
      <div class="stat-box"><div class="stat-box__label">Points</div><div class="stat-box__value">${fmtPts(a.currentPoints)}</div></div>
      <div class="stat-box"><div class="stat-box__label">Distances</div><div class="stat-box__value">${a.completedCount}/${ds.length}</div></div>
    </div>`;
  if(rowed.length)h+=`<div class="table-wrap"><table class="tbl"><thead><tr><th>Distance</th><th>Time</th><th>Pos</th><th>Points</th><th>PB</th></tr></thead><tbody>${rowed.map(d=>{const dr=a.distRanks[d.key];const badge=recordBadge(records[d.key]);const pb=pbs[d.key]?fmtTime(parseTime(pbs[d.key])):"";return`<tr class="${podCls(dr)}"><td>${esc(d.label)}</td><td class="mono">${fmtTime(a.seconds[d.key])} ${badge}</td><td>${dr?`${dr} ${medal(dr)}`:"—"}</td><td class="mono">${fmtPts(a.points[d.key])}</td><td class="mono" style="color:var(--text-dim)">${pb}</td></tr>`}).join("")}</tbody></table></div>`;
  h+=`</div>`;el.overlay.innerHTML=h;el.overlay.hidden=false;
  document.getElementById("closePopup")?.addEventListener("click",()=>{el.overlay.hidden=true});
}

// ── POPUP: Pair comparison ──────────────────────────────
function openPairPopup(pairNum,distKey){
  if(!standings)return;
  const g=state.gender;
  const sl=startListCache[g][distKey]??[];
  const pair=sl.filter(s=>s.pairNumber===parseInt(pairNum));
  if(pair.length<1)return;
  const ds=getDists(),dist=ds.find(d=>d.key===distKey);if(!dist)return;
  const rA=standings.all.find(a=>a.name===pair[0].name);
  const rB=pair.length>1?standings.all.find(a=>a.name===pair[1].name):null;
  if(!rA)return;

  // Solo pair
  if(!rB){openPopup(rA.name);return}

  const nameA=shortName(rA.name),nameB=shortName(rB.name);
  const pA=rA.currentPoints,pB=rB.currentPoints;
  const ptsDiff=Number.isFinite(pA)&&Number.isFinite(pB)?pA-pB:null;
  const ptsDiffStr=Number.isFinite(ptsDiff)?`${Math.abs(ptsDiff)<0.001?"Even":ptsDiff<0?`${nameA} +${fmtPts(Math.abs(ptsDiff))}`:`${nameB} +${fmtPts(ptsDiff)}`}`:"—";
  const timeDiff=Number.isFinite(ptsDiff)?ptsDiff*dist.divisor:null;
  const timeDiffStr=Number.isFinite(timeDiff)?fmtDelta(timeDiff):"—";

  // PB per skater for this distance
  const pbA=pair[0].pb?fmtTime(parseTime(pair[0].pb)):"";
  const pbB=pair[1].pb?fmtTime(parseTime(pair[1].pb)):"";

  const rows=ds.map(d=>{
    const sA=rA.seconds[d.key],sB=rB.seconds[d.key];
    const tA=Number.isFinite(sA)?fmtTime(sA):"—",tB=Number.isFinite(sB)?fmtTime(sB):"—";
    // Record badges
    const recA=(dataCache[g][d.key]??[]).find(r=>r.name===rA.name)?.record;
    const recB=(dataCache[g][d.key]??[]).find(r=>r.name===rB.name)?.record;
    let diff="";
    if(Number.isFinite(sA)&&Number.isFinite(sB)){const dd=sA-sB;diff=Math.abs(dd)<0.005?'<span style="color:var(--text-dim)">—</span>':dd<0?`<span style="color:var(--green)">${fmtDelta(dd)}</span>`:`<span style="color:var(--red)">${fmtDelta(dd)}</span>`}
    return`<tr><td class="mono" style="text-align:right">${tA} ${recordBadge(recA)}</td><td style="text-align:center;font-weight:600;color:var(--text-dim);font-size:11px">${esc(d.label)}</td><td class="mono">${tB} ${recordBadge(recB)}</td><td style="text-align:center">${diff}</td></tr>`;
  }).join("");

  let h=`<div class="panel"><div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:14px"><div><h3>Rit ${pairNum} — ${esc(dist.label)}</h3><div style="font-size:12px;color:var(--text-dim)">${laneDot("I")} ${esc(rA.name)} ${esc(rA.country)} vs ${laneDot("O")} ${esc(rB.name)} ${esc(rB.country)}</div></div><button class="close-btn" id="closePopup">✕</button></div>
    <div class="table-wrap" style="margin-bottom:14px"><table class="tbl">
      <thead><tr><th style="text-align:right">${laneDot(pair[0].startLane)} ${esc(rA.name)}<br><span style="font-weight:400;text-transform:none">#${rA.rank??"—"} · ${fmtPts(pA)} pts${pbA?` · PB ${pbA}`:""}</span></th><th style="text-align:center">Distance</th><th>${laneDot(pair[1].startLane)} ${esc(rB.name)}<br><span style="font-weight:400;text-transform:none">#${rB.rank??"—"} · ${fmtPts(pB)} pts${pbB?` · PB ${pbB}`:""}</span></th><th style="text-align:center">Δ</th></tr></thead>
      <tbody>${rows}
        <tr style="border-top:2px solid var(--border);font-weight:700"><td class="mono" style="text-align:right">${fmtPts(pA)}</td><td style="text-align:center;color:var(--text-dim);font-size:11px">Points</td><td class="mono">${fmtPts(pB)}</td><td style="text-align:center;font-size:11px">${ptsDiffStr}</td></tr>
      </tbody>
    </table></div>
    <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius);padding:12px;font-size:12px">
      <div style="font-weight:700;color:var(--isu-blue);margin-bottom:4px">Points difference on ${esc(dist.label)}</div>
      <div>Difference: <strong>${ptsDiffStr}</strong> = <strong class="mono">${timeDiffStr}</strong> on ${esc(dist.label)}</div>
    </div>
  </div>`;
  el.overlay.innerHTML=h;el.overlay.hidden=false;
  document.getElementById("closePopup")?.addEventListener("click",()=>{el.overlay.hidden=true});
}

// ── EVENTS ──────────────────────────────────────────────
function bindEvents(){
  function fillPollSelect(){
    if(!el.pollSelect)return;
    const ds=getDists();
    el.pollSelect.innerHTML=`<option value="all">All</option>`+ds.map(d=>`<option value="${d.key}"${state.pollDist===d.key?" selected":""}>${d.label}</option>`).join("");
  }
  fillPollSelect();
  el.pollSelect?.addEventListener("change",e=>{state.pollDist=e.target.value});

  el.genderTabs?.addEventListener("click",async e=>{
    const b=e.target.closest(".tab");if(!b?.dataset.gender)return;
    state.gender=b.dataset.gender;fillPollSelect();render();
    if(!Object.keys(dataCache[state.gender]).length){await fetchGender(state.gender);render()}
  });

  function navClick(e){const b=e.target.closest(".nav-btn");if(!b?.dataset.view)return;state.view=b.dataset.view;if(state.view.startsWith("dist_"))state.selectedDist=state.view.replace("dist_","");el.mobileMenu.hidden=true;render()}
  el.navButtons?.addEventListener("click",navClick);
  el.mobileNav?.addEventListener("click",navClick);
  el.menuBtn?.addEventListener("click",()=>{el.mobileMenu.hidden=!el.mobileMenu.hidden});
  document.addEventListener("click",e=>{if(!el.mobileMenu?.hidden&&!e.target.closest(".mobile-menu")&&!e.target.closest("#menuBtn"))el.mobileMenu.hidden=true});

  // Athlete click
  document.addEventListener("click",e=>{const a=e.target.closest(".athlete");if(a?.dataset.name)openPopup(a.dataset.name)});
  // Pair click
  document.addEventListener("click",e=>{const p=e.target.closest(".pair-link");if(p)openPairPopup(p.dataset.pair,p.dataset.dist)});
  // Overlay close
  el.overlay?.addEventListener("click",e=>{if(e.target===el.overlay)el.overlay.hidden=true});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"){el.overlay.hidden=true;el.mobileMenu.hidden=true}});
}

// ── POLL ────────────────────────────────────────────────
let pollT=null,lastDataHash="";
function dataHash(){try{return JSON.stringify(dataCache[state.gender]??"").length.toString()}catch(_){return""}}
function startPoll(){if(pollT)clearInterval(pollT);pollT=setInterval(async()=>{try{
  lastDataHash=dataHash();
  const dk=state.pollDist==="all"?undefined:state.pollDist;
  await fetchGender(state.gender,dk);
  if(dataHash()!==lastDataHash){
    // Always re-render overview and distance views; skip frozen klassement view
    if(state.view!=="klassement")render();
  }
}catch(e){console.warn("[WK] poll:",e)}},POLL_MS)}

// ── BOOT ────────────────────────────────────────────────
async function boot(){
  try{
    cacheEls();bindEvents();render();
    await fetchGender(state.gender);render();
    console.log("[WK Sprint] Live ✅");startPoll();
  }catch(e){
    console.error("[WK Sprint] Boot:",e);
    if(el.contentArea)el.contentArea.innerHTML=`<div style="color:var(--red);padding:20px"><pre>${e.message}\n${e.stack}</pre></div>`;
  }
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
