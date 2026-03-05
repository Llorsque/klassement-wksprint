"use strict";
// ════════════════════════════════════════════════════════
// ISU World Sprint Championships 2026 — Heerenveen
// ════════════════════════════════════════════════════════
const EVENT_ID="2026_NED_0002";
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

// ── AUTO-DISCOVER COMPETITION IDS ──────────────────────
async function discoverCompIds(){
  console.log("[WK] Discovering competition IDs...");
  let comps=null;
  const url=`${API_BASE}/`;
  // Try direct
  try{const r=await fetch(url,{cache:"no-store"});if(r.ok)comps=await r.json()}catch(_){}
  // Try allorigins
  if(!comps)try{const r=await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);if(r.ok){const w=await r.json();if(w.contents)comps=JSON.parse(w.contents)}}catch(_){}
  // Try corsproxy
  if(!comps)try{const r=await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`);if(r.ok)comps=await r.json()}catch(_){}

  if(!comps){console.warn("[WK] Could not discover compIds, using fallback");return false}
  if(!Array.isArray(comps))comps=comps.competitions||comps.results||[];
  console.log("[WK] Found competitions:",comps.length,comps.map(c=>`${c.id}:${c.name||c.title||"?"}`));

  // Match competitions to our DISTANCES by name patterns
  const patterns={
    v:{
      d1_500:[/ladies.*1st.*500|women.*1st.*500|500.*women.*1|500.*ladies.*1|1st.*500.*ladies|1st.*500.*women/i,/ladies.*500.*sprint.*1|women.*500.*sprint.*1/i],
      d1_1000:[/ladies.*1st.*1000|women.*1st.*1000|1000.*women.*1|1000.*ladies.*1|1st.*1000.*ladies|1st.*1000.*women/i,/ladies.*1000.*sprint.*1|women.*1000.*sprint.*1/i],
      d2_500:[/ladies.*2nd.*500|women.*2nd.*500|500.*women.*2|500.*ladies.*2|2nd.*500.*ladies|2nd.*500.*women/i,/ladies.*500.*sprint.*2|women.*500.*sprint.*2/i],
      d2_1000:[/ladies.*2nd.*1000|women.*2nd.*1000|1000.*women.*2|1000.*ladies.*2|2nd.*1000.*ladies|2nd.*1000.*women/i,/ladies.*1000.*sprint.*2|women.*1000.*sprint.*2/i],
    },
    m:{
      d1_500:[/men.*1st.*500|500.*men.*1|1st.*500.*men/i,/men.*500.*sprint.*1/i],
      d1_1000:[/men.*1st.*1000|1000.*men.*1|1st.*1000.*men/i,/men.*1000.*sprint.*1/i],
      d2_500:[/men.*2nd.*500|500.*men.*2|2nd.*500.*men/i,/men.*500.*sprint.*2/i],
      d2_1000:[/men.*2nd.*1000|1000.*men.*2|2nd.*1000.*men/i,/men.*1000.*sprint.*2/i],
    }
  };

  // Also try simpler approach: sort by ID and assign in order
  // ISU typically orders: Ladies 500-1, Men 500-1, Ladies 1000-1, Men 1000-1, Ladies 500-2, Men 500-2, Ladies 1000-2, Men 1000-2
  let matched=0;
  for(const g of["v","m"]){
    for(const d of DISTANCES[g]){
      const pats=patterns[g][d.key];
      if(!pats)continue;
      for(const c of comps){
        const name=c.name||c.title||c.description||"";
        if(pats.some(p=>p.test(name))){
          d.compId=c.id;
          console.log(`[WK] ${g}/${d.key} → compId ${c.id} (${name})`);
          matched++;
          break;
        }
      }
    }
  }

  // Fallback: if no pattern matched, try order-based assignment
  if(matched===0&&comps.length>=8){
    console.log("[WK] Pattern matching failed, trying order-based assignment...");
    // Sort by id
    const sorted=[...comps].sort((a,b)=>(a.id||0)-(b.id||0));
    // Log all for debugging
    sorted.forEach((c,i)=>console.log(`  [${i}] id=${c.id} name="${c.name||c.title||"?"}"`));
    // Sprint order: typically alternating ladies/men per distance
    // Try to detect gender from name
    const ladies=sorted.filter(c=>/ladies|women|dames/i.test(c.name||c.title||""));
    const men=sorted.filter(c=>/\bmen\b|heren/i.test(c.name||c.title||""));
    if(ladies.length>=4&&men.length>=4){
      [DISTANCES.v[0],DISTANCES.v[1],DISTANCES.v[2],DISTANCES.v[3]].forEach((d,i)=>{if(ladies[i])d.compId=ladies[i].id});
      [DISTANCES.m[0],DISTANCES.m[1],DISTANCES.m[2],DISTANCES.m[3]].forEach((d,i)=>{if(men[i])d.compId=men[i].id});
      console.log("[WK] Assigned by gender groups");
    }else{
      // Last resort: just assign first 8 in order
      const ids=sorted.map(c=>c.id);
      const assign=[[0,"v",0],[1,"m",0],[2,"v",1],[3,"m",1],[4,"v",2],[5,"m",2],[6,"v",3],[7,"m",3]];
      assign.forEach(([idx,g,di])=>{if(ids[idx]!=null)DISTANCES[g][di].compId=ids[idx]});
      console.log("[WK] Assigned by order (fallback)");
    }
  }

  // Log final mapping
  for(const g of["v","m"])for(const d of DISTANCES[g])console.log(`[WK] Final: ${g}/${d.key} = compId ${d.compId}`);
  return DISTANCES.v.some(d=>d.compId!=null);
}

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
function recordBadge(rec){if(!rec)return"";if(rec==="TR")return'<span class="rec-badge rec-badge--tr">TR</span>';if(rec==="PB")return'<span class="rec-badge rec-badge--pb">PB</span>';return""}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}

// ── PB CACHE ─────────────────────────────────────────────
function storePB(g,distKey,name,pbStr){
  if(!pbStr||!name)return;
  const t=pbStr.replace(",",".");
  if(!parseTime(t))return; // invalid time
  if(!pbCache[g][distKey])pbCache[g][distKey]={};
  pbCache[g][distKey][name]=t;
}
function getPB(name,distKey){
  const g=state.gender;
  const t=pbCache[g]?.[distKey]?.[name];
  if(!t)return"";
  const sec=parseTime(t);
  return sec?fmtTime(sec):"";
}
function getPBraw(g,name,distKey){
  return pbCache[g]?.[distKey]?.[name]||"";
}

// ── STATE ───────────────────────────────────────────────
const state={gender:"v",view:"overview",selectedDist:"d1_500",pollDist:"all",tile3Mode:"startlist"};
const dataCache={v:{},m:{}};
const startListCache={v:{},m:{}};
const pbCache={v:{},m:{}}; // {gender: {distKey: {normalizedName: timeString}}}
const frozenStandings={v:null,m:null};
const inactive={v:new Set(),m:new Set()};
function loadInactive(){try{const d=JSON.parse(localStorage.getItem("wk_sprint_inactive")??"{}");if(d.v)inactive.v=new Set(d.v);if(d.m)inactive.m=new Set(d.m)}catch(_){}}
function saveInactive(){try{localStorage.setItem("wk_sprint_inactive",JSON.stringify({v:[...inactive.v],m:[...inactive.m]}))}catch(_){}}
function isActive(name){return!inactive[state.gender].has(name)}
let standings=null,dataSource="waiting";
const lastFetch={v:null,m:null};

function getDists(){return DISTANCES[state.gender]}
function getCompId(g,dKey){return DISTANCES[g].find(d=>d.key===dKey)?.compId}

// ── FETCH ───────────────────────────────────────────────
// Track which fetch method works
let globalBestProxy=null;
let directCORSFailed=false;// once direct fails on CORS, never try again

function fetchWithTimeout(url,opts,ms=3500){
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(),ms);
  return fetch(url,{...opts,signal:ctrl.signal}).finally(()=>clearTimeout(t));
}

async function tryParseJSON(r){
  if(!r||!r.ok)return null;
  const d=await r.json();
  const arr=Array.isArray(d)?d:(d?.results??d?.data??[]);
  return arr.length>0?arr:null;
}

async function fetchJSON(compId,type="results"){
  const cb=Date.now();
  const apiUrl=`${API_BASE}/${compId}/${type}/`;

  async function tryDirect(){
    if(directCORSFailed)return null;
    try{
      const r=await fetchWithTimeout(`${apiUrl}?_=${cb}`,{cache:"no-store"},3000);
      const arr=await tryParseJSON(r);
      if(arr){globalBestProxy="direct";console.log(`[WK] C${compId}/${type} direct ✅`);return arr}
    }catch(e){
      // CORS or network error → mark direct as dead
      directCORSFailed=true;console.log("[WK] Direct API CORS blocked, skipping from now on");
    }
    return null;
  }
  async function tryCorsproxy(){
    try{
      const r=await fetchWithTimeout(`https://corsproxy.io/?${encodeURIComponent(apiUrl)}`,{cache:"no-store"},4000);
      const arr=await tryParseJSON(r);
      if(arr){globalBestProxy="corsproxy";console.log(`[WK] C${compId}/${type} corsproxy ✅`);return arr}
    }catch(_){}
    return null;
  }
  async function tryAllorigins(){
    try{
      const r=await fetchWithTimeout(`https://api.allorigins.win/get?url=${encodeURIComponent(apiUrl)}&_=${cb}`,{cache:"no-store"},4000);
      if(!r?.ok)return null;
      const w=await r.json();if(!w.contents)return null;
      const d=JSON.parse(w.contents);const arr=Array.isArray(d)?d:(d?.results??d?.data??[]);
      if(arr.length>0){globalBestProxy="allorigins";console.log(`[WK] C${compId}/${type} allorigins ✅`);return arr}
    }catch(_){}
    return null;
  }
  async function tryJina(){
    try{
      const url=`${LIVE_BASE}/${compId}/${type}`;
      const r=await fetchWithTimeout(`${JINA}${url}?_=${cb}`,{cache:"no-store",headers:{"Accept":"text/plain"}},5000);
      if(r?.ok){const t=await r.text();if(t.length>200){console.log(`[WK] C${compId}/${type} jina ✅ (${t.length}c)`);return{_text:t}}}
    }catch(_){}
    return null;
  }

  // Order: known proxy first, then corsproxy (most reliable), allorigins, jina
  const all={direct:tryDirect,corsproxy:tryCorsproxy,allorigins:tryAllorigins,jina:tryJina};
  const order=globalBestProxy
    ?[globalBestProxy,...Object.keys(all).filter(m=>m!==globalBestProxy)]
    :Object.keys(all);

  for(const m of order){
    const r=await all[m]();if(r)return r;
  }
  return null;
}

/** Clean Jina markdown artifacts from text */
function cleanJinaName(raw){
  let s=raw;
  // Remove markdown links: [text](url) → text
  s=s.replace(/\[([^\]]*)\]\([^)]*\)/g,"$1");
  // Remove leftover pipes, brackets, asterisks
  s=s.replace(/\|/g," ").replace(/\[/g,"").replace(/\]/g,"");
  // Remove competitor numbers like "122" at start
  s=s.replace(/^\s*\d{2,3}\s+/,"");
  // Remove record prefixes
  s=s.replace(/^\s*\*?\s*(WR|TR|PB|NR|SR)\s+/i,"");
  // Remove URLs
  s=s.replace(/https?:\/\/[^\s)]+/g,"");
  // Collapse whitespace
  s=s.replace(/\s+/g," ").trim();
  return s;
}

function parseAPIResults(raw,g,distKey){
  if(!raw||raw._text)return parseTextResults(raw?._text,g,distKey);
  if(!Array.isArray(raw))return[];
  if(raw.length>0)console.log("[WK] Results API sample:",JSON.stringify(raw[0]).substring(0,600));
  return raw.filter(r=>r.time&&r.competitor?.skater).map(r=>{
    const sk=r.competitor.skater;
    const name=`${sk.firstName} ${sk.lastName}`;
    // Record flags: ONLY from explicit API fields, never inferred
    let rec="";
    if(r.records){
      const recs=Array.isArray(r.records)?r.records:String(r.records).split(",");
      for(const x of recs){const u=String(x).trim().toUpperCase();if(u==="TR"||u.includes("TRACK"))rec="TR";if(u==="PB"||u.includes("PERSONAL"))rec=rec||"PB"}
    }
    if(!rec&&r.isTrackRecord===true)rec="TR";
    if(!rec&&r.isPersonalBest===true)rec="PB";
    return{name,country:sk.country||"",rank:r.rank,
      no:r.competitor.number||r.startNumber||0,
      time:r.time,seconds:trunc2(parseTime(r.time)),timeBehind:r.timeBehind||"",
      startLane:r.startLane||r.competitor?.startLane||"",record:rec,
      laps:r.laps||[]};
  }).filter(r=>r.seconds!=null&&r.seconds>0);
}

/** Deep-search object for PB time */
function findPB(obj,depth){
  if(!obj||depth>4)return"";
  if(typeof obj==="string"&&/^\d{1,2}:?\d{2}[\.,]\d{2,3}$/.test(obj))return obj;
  if(Array.isArray(obj)){for(const v of obj){const r=findPB(v,depth+1);if(r)return r}return""}
  if(typeof obj==="object"){
    // Priority keys first
    for(const key of["personalBest","pb","PB","personal_best","seasonBest","season_best","SB","bestTime","best_time","bestResult","personalRecord","pr","bestLapTime"]){
      const v=obj[key];
      if(v){
        if(typeof v==="string"&&/\d/.test(v))return v;
        if(typeof v==="number"&&v>10&&v<600){const m=Math.floor(v/60);const s=v-m*60;return m>0?(m+":"+s.toFixed(2).padStart(5,"0")):s.toFixed(2)}
        if(typeof v==="object"){
          for(const sub of["time","result","value","display","formatted"]){if(v[sub])return String(v[sub])}
          const r=findPB(v,depth+1);if(r)return r;
        }
      }
    }
    // Also search nested objects
    for(const key of["competitor","skater","athlete","person","entry"]){
      if(obj[key]){const r=findPB(obj[key],depth+1);if(r)return r}
    }
  }
  return"";
}

function parseAPIStartList(raw){
  if(!raw||raw._text)return parseTextStartList(raw?._text);
  if(!Array.isArray(raw))return[];
  if(raw.length>0)console.log("[WK] SL API keys:",Object.keys(raw[0]),JSON.stringify(raw[0]).substring(0,500));
  const items=raw.filter(r=>r.competitor?.skater).map(r=>{
    const sk=r.competitor.skater;
    let pb=findPB(r,0)||findPB(r.competitor,0)||findPB(sk,0)||"";
    if(!pb){for(const[k,v]of Object.entries(r)){if(typeof v==="string"&&/^\d{1,2}:?\d{2}[\.,]\d{2}$/.test(v)&&!["time","result"].includes(k)){pb=v;break}}}
    if(pb)pb=pb.replace(",",".");
    return{name:`${sk.firstName} ${sk.lastName}`,country:sk.country||"",
      no:r.competitor.number||r.startNumber||0,
      startLane:r.startLane||r.lane||"",
      _rawPair:r.pairNumber??null,pairNumber:0,pb};
  });
  if(items.length>0)console.log("[WK] SL PB sample:",items[0].name,"pb=",items[0].pb||"(none)");
  return assignPairs(items);
}

/**
 * Assign correct pair numbers and lanes to a start-list.
 * Rules:
 *  - Items are in order: pair 1 first, pair 2 second, etc.
 *  - First rider of a pair has a pair number in _rawPair; second has null/0
 *  - Within a 2-rider pair: Inner (I/white) is ALWAYS listed first, Outer (O/red) second
 *  - A solo pair has just 1 rider
 *  - If _rawPair data is missing/unreliable, infer from lanes:
 *    seeing two consecutive riders = a pair, standalone = solo
 */
function assignPairs(items){
  if(!items.length)return items;
  // Step 1: Try pair assignment from _rawPair data
  // A new _rawPair value (>0 and different from current) starts a new pair
  // null/0/_rawPair same as current = same pair
  let hasPairData=items.some(it=>it._rawPair!=null&&it._rawPair>0);

  if(hasPairData){
    let cur=0;
    for(const it of items){
      if(it._rawPair!=null&&it._rawPair>0&&it._rawPair!==cur){
        cur=it._rawPair;
      }
      it.pairNumber=cur;
    }
  }else{
    // No pair data at all: infer from lane pattern
    // I then O = pair of 2; standalone = solo
    let pn=1;
    for(let i=0;i<items.length;i++){
      items[i].pairNumber=pn;
      // If this is I and next is O: they form a pair, skip next
      if(items[i].startLane==="I"&&i+1<items.length&&items[i+1].startLane==="O"){
        items[i+1].pairNumber=pn;
        i++;// skip next
      }
      pn++;
    }
    // Renumber sequentially
    let seen=new Map(),seq=1;
    for(const it of items){
      if(!seen.has(it.pairNumber))seen.set(it.pairNumber,seq++);
      it.pairNumber=seen.get(it.pairNumber);
    }
  }

  // Step 2: Fix lanes within each pair
  // Group by pair
  const pairs=new Map();
  for(const it of items){if(!pairs.has(it.pairNumber))pairs.set(it.pairNumber,[]);pairs.get(it.pairNumber).push(it)}
  for(const[_,group]of pairs){
    if(group.length===2){
      // 2 riders: first = Inner (white), second = Outer (red)
      group[0].startLane="I";
      group[1].startLane="O";
    }
    // Solo: keep whatever lane, or default to O if empty
    if(group.length===1&&!group[0].startLane){
      group[0].startLane="O";
    }
  }

  // Clean up temp field
  for(const it of items)delete it._rawPair;
  return items;
}

// Text fallback parsers (from Jina rendered HTML)
function norm(n){return String(n??"").trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu,"").replace(/[\u2018\u2019`\u00B4\u2032\u02BC\u02BB']/g,"'").replace(/\s+/g," ")}
function parseTextResults(text,g,distKey){
  if(!text)return[];
  const results=[],lines=text.split(/\n/);
  const timeRe=/(\d{1,2}:\d{2}[\.,]\d{2,3}|\d{2,3}[\.,]\d{2,3})/;
  const junk=/^(ISU|URL|Markdown|Source|Content|Title|Speed Skating|World Championships|Start List|Lap Times|Results|Live|Competition|Event|Schedule|http|www\.|\.com|\.eu|Referee|Starter|Assistant|Judge|Doctor|Announcer|©)/i;
  const recLine=/^\s*\*?\s*(WR|TR|NR|SR)\s+/i;
  for(const line of lines){
    if(junk.test(line.trim()))continue;
    if(recLine.test(line.trim()))continue;
    if(/\d{4}-\d{2}-\d{2}/.test(line))continue;
    if(/\b(Referee|Starter|Assistant|Judge|Doctor|Announcer)\b/i.test(line))continue;
    const m=line.match(timeRe);
    if(!m)continue;
    const rawTime=m[1].replace(",",".");
    const sec=parseTime(rawTime);if(!sec)continue;
    const before=line.substring(0,m.index);
    const after=line.substring(m.index+m[1].length);
    // Detect record badges ONLY after the time
    let rec="";if(/\bTR\b/.test(after))rec="TR";else if(/\bPB\b/.test(after))rec="PB";
    const cleanLine=cleanJinaName(before);
    if(junk.test(cleanLine.trim()))continue;
    const ccMatch=cleanLine.match(/\b([A-Z]{3})\s*$/)||cleanLine.match(/\b([A-Z]{3})\b/);
    let cc=ccMatch?ccMatch[1]:"";
    if(["WR","TR","PB","NR","SR","DNS","DNF","DSQ","OMS","ISU","URL","THE","AND","FOR"].includes(cc))cc="";
    let nameStr=cleanLine.replace(/^\d+\s*/,"").replace(/\s*[A-Z]{3}\s*$/,"").replace(/^\s*\*?\s*(WR|TR|PB|NR|SR)\s*/i,"").trim();
    if(nameStr.length<3)continue;
    if(/^(rank|name|time|behind|lane|pair|no\b|ISU|URL|Markdown|Source|Content|Speed|Skating|World|Championship|Start|List|Lap|Result|Live|Competition)/i.test(nameStr))continue;
    const words=nameStr.split(/\s+/);
    if(words.length>4)continue;
    const behindMatch=after.match(/\+(\d{1,2}[:\.]?\d{2}[\.,]\d{2,3}|\d+[\.,]\d{2,3})/);
    const behind=behindMatch?behindMatch[0]:"";
    results.push({name:nameStr,country:cc,time:rawTime,seconds:trunc2(sec),rank:results.length+1,no:0,timeBehind:behind,startLane:"",record:rec,laps:[]});
  }
  const seen=new Set(),deduped=[];
  for(const r of results){const k=r.name+"|"+r.seconds;if(!seen.has(k)){seen.add(k);deduped.push(r)}}
  return deduped;
}
function parseTextStartList(text){
  if(!text)return[];
  const list=[],lines=text.split(/\n/);
  if(lines.length>5)console.log("[WK] SL text sample lines:",lines.slice(3,8));
  // Jina garbage patterns to skip
  const junk=/^(ISU|URL|Markdown|Source|Content|Title|Speed Skating|World Championships|Start List|Lap Times|Results|Live|Competition|Event|Schedule|http|www\.|\.com|\.eu|Referee|Starter|Assistant|Judge|Doctor|Announcer|Timer|Photo|Media|Press|©|\d{4}-\d{2}-\d{2}|🕐|⏱|Mar\s|Feb\s|Jan\s|Apr\s|May\s|Jun\s|Jul\s|Aug\s|Sep\s|Oct\s|Nov\s|Dec\s|\d{1,2}:\d{2}\s*-\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))/i;
  // WR/TR record holder lines (e.g. "WR Femke Kok 36.09 2025-11-16")
  const recLine=/^\s*\*?\s*(WR|TR|NR|SR)\s+/i;
  for(const line of lines){
    const clean=cleanJinaName(line);
    if(!clean||clean.length<3)continue;
    if(junk.test(clean.trim()))continue;
    if(recLine.test(line.trim()))continue;
    // Skip lines with dates like "2025-11-16" or "Mar 5, 2026"
    if(/\d{4}-\d{2}-\d{2}/.test(line))continue;
    if(/^(pair|lane|name|time|behind|rank|no\b)/i.test(clean.trim()))continue;
    // Must look like a person name: at least 2 words, first word capitalized, no special keywords
    const nm=clean.match(/([A-Z][a-zA-Z\u00C0-\u017F\'-]+(?:\s+[A-Za-z\u00C0-\u017F\'-]+)+)/);
    if(!nm)continue;
    const name=nm[1].trim();
    if(name.length<4)continue;
    // Reject common non-name patterns
    if(/^(Pair|Lane|Name|Time|Behind|Rank|Speed|Skating|World|Championship|Start|List|Lap|Result|Live|Competition|Event|Schedule|Markdown|Content|Source|URL|ISU|Referee|Starter|Assistant|Judge|Doctor|Announcer|Timer|Photo|Media|Press)/i.test(name))continue;
    // Reject if original line contains a role prefix (Referee: Name, Starter: Name)
    if(/\b(Referee|Starter|Assistant|Judge|Doctor|Announcer)\b/i.test(line))continue;
    // Reject if name contains too many lowercase-starting words (likely a sentence)
    const words=name.split(/\s+/);
    if(words.length>4)continue;
    // Detect pair number
    let pairNum=null;
    const pairMatch=clean.match(/^\s*(\d{1,2})\s/);
    if(pairMatch)pairNum=parseInt(pairMatch[1]);
    const pm=clean.match(/(?:pair|rit)[:\s]*(\d+)/i);
    if(pm)pairNum=parseInt(pm[1]);
    // Lane
    const laneMatch=clean.match(/\b([OI])\b/);
    const lane=laneMatch?laneMatch[1]:"";
    // Country
    const ccm=clean.match(/\b([A-Z]{3})\b/g);
    let cc=ccm?ccm.find(c=>!["PB","NO","TR","WR","NR","SR","DNS","DNF","DSQ","ISU","URL","THE","AND","FOR"].includes(c))||"":"";
    // PB
    let pb="";
    const origTimes=[...line.matchAll(/(\d{1,2}:\d{2}[\.,]\d{2,3}|\d{2,3}[\.,]\d{2,3})/g)].map(m=>m[1]);
    if(origTimes.length>0)pb=origTimes[origTimes.length-1].replace(",",".");
    if(!pb){const pbM=clean.match(/(\d{1,2}:\d{2}[\.,]\d{2,3}|\d{2,3}[\.,]\d{2,3})\s*$/);if(pbM)pb=pbM[1].replace(",",".")}
    const noMatch=clean.match(/\b(\d{2,3})\b/);
    const no=noMatch?parseInt(noMatch[1]):0;
    list.push({name,country:cc,no,startLane:lane,_rawPair:pairNum,pairNumber:0,pb});
  }
  return assignPairs(list);
}

async function fetchGender(g,onlyDist){
  const ds=DISTANCES[g];
  const toFetch=(onlyDist?ds.filter(d=>d.key===onlyDist):ds).filter(d=>d.compId!=null);
  if(!toFetch.length){console.warn(`[WK] No compIds for ${g}, skipping fetch`);return}

  if(onlyDist){
    const d=toFetch[0];
    const raw=await fetchJSON(d.compId,"results");
    const results=parseAPIResults(raw,g,d.key);
    if(results.length>0)dataCache[g][d.key]=results;
    if(!startListCache[g][d.key]?.length){
      const slRaw=await fetchJSON(d.compId,"start-list");
      const sl=parseAPIStartList(slRaw);
      if(sl.length>0){startListCache[g][d.key]=sl;for(const s of sl)if(s.pb)storePB(g,d.key,s.name,s.pb)}
    }
  }else{
    // Sequential per distance to avoid 429 rate limits on proxies
    // Fast because globalBestProxy skips dead methods
    for(const d of toFetch){
      const raw=await fetchJSON(d.compId,"results");
      const results=parseAPIResults(raw,g,d.key);
      if(results.length>0)dataCache[g][d.key]=results;
      computeStandings();render();// Progressive: show each distance as it arrives
    }
    // Start-lists after all results (lower priority)
    for(const d of toFetch){
      const slRaw=await fetchJSON(d.compId,"start-list");
      const sl=parseAPIStartList(slRaw);
      if(sl.length>0){startListCache[g][d.key]=sl;for(const s of sl)if(s.pb)storePB(g,d.key,s.name,s.pb)}
    }
  }
  const pbCount=Object.values(pbCache[g]).reduce((sum,d)=>sum+Object.keys(d).length,0);
  if(pbCount>0)console.log(`[WK] PB cache ${g}: ${pbCount} entries`);
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
    const a={name:p.name,country:p.country,active:isActive(p.name),times:{},seconds:{},points:{},distRanks:{}};
    for(const d of ds){const r=(dataCache[g][d.key]??[]).find(x=>x.name===p.name);if(r){a.times[d.key]=r.time;a.seconds[d.key]=r.seconds;a.points[d.key]=trunc3(r.seconds/d.divisor)}}
    return a;
  });
  for(const d of ds){const s=athletes.filter(a=>Number.isFinite(a.seconds[d.key])).sort((x,y)=>x.seconds[d.key]-y.seconds[d.key]);s.forEach((a,i)=>a.distRanks[d.key]=i+1)}
  for(const a of athletes){let sum=0,cnt=0;for(const d of ds){const p=a.points[d.key];if(Number.isFinite(p)){sum+=p;cnt++}}a.completedCount=cnt;const clean=Math.round(sum*1e6)/1e6;a.totalPoints=cnt===ds.length?clean:null;a.partialPoints=cnt>0?clean:null;a.currentPoints=a.totalPoints??a.partialPoints}
  const ranked=athletes.filter(a=>a.active&&a.completedCount>0).sort((a,b)=>{if(b.completedCount!==a.completedCount)return b.completedCount-a.completedCount;return(a.currentPoints??999)-(b.currentPoints??999)});
  ranked.forEach((a,i)=>a.rank=i+1);
  const leader=ranked[0],lPts=leader?.currentPoints??null;
  for(const a of ranked)a.delta=Number.isFinite(lPts)&&Number.isFinite(a.currentPoints)?a.currentPoints-lPts:null;
  for(const a of athletes)if(!a.active)a.rank=null;
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
  views.push({key:"deelnemers",icon:"👥",label:"Deelnemers"});
  const navHtml=views.map(v=>v.sep?'<div class="nav-sep"></div>':`<button class="nav-btn ${state.view===v.key?'active':''}" data-view="${v.key}"><span class="nav-btn__icon">${v.icon}</span>${esc(v.label)}</button>`).join("");
  el.navButtons.innerHTML=navHtml;el.mobileNav.innerHTML=navHtml;
  el.genderTabs.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.gender===state.gender));
  if(state.view==="overview")return renderOverview();
  if(state.view.startsWith("dist_")){return renderDistance(state.view.replace("dist_",""))}
  if(state.view==="klassement")return renderKlassement();
  if(state.view==="deelnemers")return renderDeelnemers();
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
        <span style="font-size:0.78rem;color:var(--text-dim)">Distance:</span>
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
        <div class="tile-header">
          <span class="tile-header__title">③ <span id="tile3Title">${state.tile3Mode==="startlist"?"Start List":"Next Pair"} — ${esc(selDist.label)}</span></span>
          <span style="display:flex;gap:4px">
            <button class="tile-tab${state.tile3Mode==="startlist"?" tile-tab--active":""}" data-t3mode="startlist">Start List</button>
            <button class="tile-tab${state.tile3Mode==="nextpair"?" tile-tab--active":""}" data-t3mode="nextpair">Next Pair</button>
          </span>
        </div>
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
  document.querySelectorAll("[data-t3mode]").forEach(b=>b.addEventListener("click",e=>{state.tile3Mode=e.target.dataset.t3mode;render()}));
  fillTile1(selDist);fillTile2();
  if(state.tile3Mode==="nextpair")fillTile3NextPair(selDist);else fillTile3(selDist);
  fillTile4(nextDist);
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
    const pb=getPB(r.name,dist.key);
    const pbStr=pb?`<span style="color:var(--orange);font-size:0.7rem">${pb}</span>`:"";
    return`<tr class="${podCls(rk)}"><td><strong>${rk}</strong></td><td><span class="athlete" data-name="${esc(r.name)}">${esc(r.name)}</span> <span class="country">${esc(r.country)}</span></td><td class="mono">${fmtTime(r.seconds)} ${badge}</td><td>${pbStr}</td><td>${dStr}</td></tr>`;
  }).join("");
  body.innerHTML=`<table class="tbl tbl--compact"><thead><tr><th>#</th><th>Name</th><th>Time</th><th style="color:var(--orange)">PB</th><th>+</th></tr></thead><tbody>${rows}</tbody></table>`;
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
      const pb=getPB(s.name,dist.key);
      const pbStr=pb?`<span style="color:var(--orange);font-size:0.7rem">${pb}</span>`:"";
      const pairCell=si===0?`<span class="pair-link" data-pair="${pn}" data-dist="${dist.key}">${pn}</span>`:"";
      rows+=`<tr><td>${pairCell}</td><td>${laneDot(s.startLane)}</td><td><span class="athlete" data-name="${esc(s.name)}">${esc(s.name)}</span> <span class="country">${esc(s.country)}</span></td><td>${pbStr}</td><td>${ntStr}</td></tr>`;
    }
  }
  body.innerHTML=`<table class="tbl tbl--compact"><thead><tr><th>Rit</th><th></th><th>Name</th><th style="color:var(--orange)">PB</th><th>Target P1</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/** Find the first pair on this distance where not all riders have results yet */
function getNextPair(dist){
  const g=state.gender;
  const sl=startListCache[g][dist.key]??[];
  const results=dataCache[g][dist.key]??[];
  const resultNames=new Set(results.map(r=>r.name));
  // Group by pair
  const pairs=new Map();
  for(const s of sl){const pn=s.pairNumber||0;if(!pairs.has(pn))pairs.set(pn,[]);pairs.get(pn).push(s)}
  // Find first pair where at least one rider has no result
  for(const[pn,skaters]of pairs){
    const allDone=skaters.every(s=>resultNames.has(s.name));
    if(!allDone)return{pairNum:pn,skaters};
  }
  // All done: return last pair
  if(pairs.size>0){const last=[...pairs.entries()].pop();return{pairNum:last[0],skaters:last[1],allDone:true}}
  return null;
}

function fillTile3NextPair(dist){
  const body=document.getElementById("tile3Body");if(!body)return;
  const g=state.gender;
  const next=getNextPair(dist);
  if(!next||!next.skaters.length){
    body.innerHTML=`<div style="padding:20px;text-align:center;color:var(--text-muted)">No start list available</div>`;return;
  }
  const{pairNum,skaters,allDone}=next;
  const ds=getDists();

  // Solo pair
  if(skaters.length===1){
    const s=skaters[0];
    const a=standings?.all?.find(x=>x.name===s.name);
    const lPts=standings?.leader?.currentPoints;
    const nt=a?neededTime(a,dist.key,lPts):null;
    const ntStr=Number.isFinite(nt)&&nt>0?fmtTime(nt):"";
    body.innerHTML=`<div style="padding:16px">
      <div style="font-size:1rem;font-weight:700;margin-bottom:8px">Rit ${pairNum} — Solo${allDone?' <span style="color:var(--green)">✓ Finished</span>':""}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">${laneDot(s.startLane)} <span class="athlete" data-name="${esc(s.name)}" style="font-size:1rem;font-weight:600">${esc(s.name)}</span> <span class="country">${esc(s.country)}</span></div>
      ${a?`<div class="stat-grid" style="margin-bottom:8px">
        <div class="stat-box"><div class="stat-box__label">Rank</div><div class="stat-box__value">#${a.rank??"—"}</div></div>
        <div class="stat-box"><div class="stat-box__label">Points</div><div class="stat-box__value">${fmtPts(a.currentPoints)}</div></div>
        <div class="stat-box"><div class="stat-box__label">Target P1</div><div class="stat-box__value">${ntStr||"—"}</div></div>
      </div>`:""}
    </div>`;
    return;
  }

  // Two riders: H2H comparison
  const sA=skaters[0],sB=skaters[1];
  const rA=standings?.all?.find(x=>x.name===sA.name);
  const rB=standings?.all?.find(x=>x.name===sB.name);
  if(!rA||!rB){body.innerHTML=`<div style="padding:20px;text-align:center;color:var(--text-muted)">Standings not yet available</div>`;return}

  const pA=rA.currentPoints,pB=rB.currentPoints;
  const nameA=shortName(rA.name),nameB=shortName(rB.name);
  const lPts=standings?.leader?.currentPoints;
  const leaderName=standings?.leader?shortName(standings.leader.name):"P1";

  // Time-to-lead for each rider
  const ttlA=neededTime(rA,dist.key,lPts);
  const ttlB=neededTime(rB,dist.key,lPts);

  // Mutual difference in points → time on this distance
  const ptsDiff=Number.isFinite(pA)&&Number.isFinite(pB)?pA-pB:null;
  const mutualTimeDiff=Number.isFinite(ptsDiff)?ptsDiff*dist.divisor:null;
  // A has fewer pts = A is ahead: mutual shows B needs to ride X faster than A
  // mutualTimeDiff > 0 means A has more points (slower) = B leads
  // mutualTimeDiff < 0 means A has fewer points (faster) = A leads

  // PB for this distance
  const pbA=getPB(rA.name,dist.key);
  const pbB=getPB(rB.name,dist.key);
  // Rows per distance
  const rows=ds.map(d=>{
    const secA=rA.seconds[d.key],secB=rB.seconds[d.key];
    const tA=Number.isFinite(secA)?fmtTime(secA):"",tB=Number.isFinite(secB)?fmtTime(secB):"";
    const recA=(dataCache[g][d.key]??[]).find(r=>r.name===rA.name)?.record;
    const recB=(dataCache[g][d.key]??[]).find(r=>r.name===rB.name)?.record;
    let diff="";
    if(Number.isFinite(secA)&&Number.isFinite(secB)){const dd=secA-secB;diff=Math.abs(dd)<0.005?'—':dd<0?`<span style="color:var(--green)">${fmtDelta(dd)}</span>`:`<span style="color:var(--red)">${fmtDelta(dd)}</span>`}
    const hl=d.key===dist.key?' style="background:rgba(0,153,229,.1)"':"";
    return`<tr${hl}><td class="mono r">${tA}${recordBadge(recA)}</td><td class="c dim">${esc(d.label)}</td><td class="mono">${tB}${recordBadge(recB)}</td><td class="c">${diff}</td></tr>`;
  }).join("");

  // Format mutual: returns {cls, text} for the card
  function mutualCard(forA){
    if(!Number.isFinite(mutualTimeDiff))return{cls:"np-card--neutral",text:"—"};
    const adv=forA?-mutualTimeDiff:mutualTimeDiff;
    if(Math.abs(adv)<0.005)return{cls:"np-card--neutral",text:"Even"};
    if(adv<0)return{cls:"np-card--green",text:`−${fmtTime(Math.abs(adv))}`};
    return{cls:"np-card--red",text:`+${fmtTime(adv)}`};
  }
  const mA=mutualCard(true),mB=mutualCard(false);

  body.innerHTML=`<div class="np-wrap">
    <div class="np-header">
      <span style="font-size:0.92rem;font-weight:700">Rit ${pairNum}${allDone?' <span style="color:var(--green);font-size:0.78rem">✓ All done</span>':""}</span>
    </div>
    <div class="np-names">
      <div class="np-namebox np-namebox--left"><span class="lane-dot lane-dot--inner" title="Inner"></span><span class="np-namebox__name athlete" data-name="${esc(rA.name)}">${esc(nameA)}</span><span class="np-namebox__rank">#${rA.rank??"—"}</span></div>
      <div class="np-namebox"><span class="lane-dot lane-dot--outer" title="Outer"></span><span class="np-namebox__name athlete" data-name="${esc(rB.name)}">${esc(nameB)}</span><span class="np-namebox__rank">#${rB.rank??"—"}</span></div>
    </div>
    <table class="tbl tbl--compact np-tbl" style="table-layout:fixed;width:100%">
      <colgroup><col style="width:43%"><col style="width:14%"><col style="width:30%"><col style="width:13%"></colgroup>
      <tbody>${rows}
        <tr class="np-pts"><td class="mono r">${fmtPts(pA)}</td><td class="c dim">Pts</td><td class="mono">${fmtPts(pB)}</td><td></td></tr>
      </tbody>
    </table>
    <div class="np-cards">
      <div class="np-cards__section">
        <div class="np-cards__label">🎯 Time to lead</div>
        <div class="np-cards__pair">
          <div class="np-card np-card--ttl"><div class="np-card__time">${Number.isFinite(ttlA)&&ttlA>0?fmtTime(ttlA):(ttlA<=0?'<span style="color:var(--green)">Leader</span>':"—")}</div></div>
          <div class="np-card np-card--ttl"><div class="np-card__time">${Number.isFinite(ttlB)&&ttlB>0?fmtTime(ttlB):(ttlB<=0?'<span style="color:var(--green)">Leader</span>':"—")}</div></div>
        </div>
      </div>
      <div class="np-cards__section">
        <div class="np-cards__label">⚔ Onderling op ${esc(dist.label)}</div>
        <div class="np-cards__pair">
          <div class="np-card ${mA.cls}"><div class="np-card__time">${mA.text}</div></div>
          <div class="np-card ${mB.cls}"><div class="np-card__time">${mB.text}</div></div>
        </div>
      </div>
    </div>
  </div>`;
}

function fillTile4(nextDist){
  const body=document.getElementById("tile4Body"),upd=document.getElementById("tile4Update");
  if(!body||!standings)return;
  if(!frozenStandings[state.gender])freezeStandings();
  const fs=frozenStandings[state.gender];
  const hasUpdate=standingsHash(standings)!==standingsHash(fs);
  if(upd)upd.innerHTML=hasUpdate?`<button class="btn--update" id="updateFrozen">🔄 Update</button>`:`<span style="font-size:0.7rem;color:var(--text-muted)">Up to date</span>`;
  document.getElementById("updateFrozen")?.addEventListener("click",()=>{freezeStandings();render()});

  const show=fs;if(!show?.ranked?.length){body.innerHTML=`<div style="padding:20px;text-align:center;color:var(--text-muted)">No standings yet</div>`;return}
  const ds=getDists();const cc=ds.filter(d=>show.all.some(a=>Number.isFinite(a.seconds[d.key]))).length;
  const allDone=cc>=ds.length;
  const lPts=standings?.leader?.currentPoints;
  const rows=show.ranked.map(a=>{
    let lastCol="";
    if(allDone){
      // All distances done: show points difference to leader
      if(a.rank===1)lastCol='<span class="delta delta--leader">L</span>';
      else if(Number.isFinite(a.delta))lastCol=`<span class="delta">+${fmtPts(a.delta)}</span>`;
    }else{
      // Still racing: show needed time on next distance
      const nt=neededTime(a,nextDist.key,lPts);
      lastCol=Number.isFinite(nt)&&nt>0?`<span class="target-time">${fmtTime(nt)}</span>`:Number.isFinite(nt)?`<span class="needed-time">✓</span>`:"";
    }
    return`<tr class="${podCls(a.rank)}"><td><strong>${a.rank}</strong></td><td><span class="athlete" data-name="${esc(a.name)}">${esc(a.name)}</span><span class="country">${esc(a.country??"")}</span></td><td class="mono"><strong>${fmtPts(a.currentPoints)}</strong></td><td>${lastCol}</td></tr>`;
  }).join("");
  const headerCol=allDone?"Δ Points":`Need ${esc(nextDist.label)}`;
  const subline=allDone?`Final standings · ${cc}/${ds.length} distances`:`After ${cc}/${ds.length} distances · Next: ${esc(nextDist.label)}`;
  body.innerHTML=`<div style="padding:4px 10px;font-size:0.7rem;color:var(--text-muted)">${subline}</div>
    <table class="tbl tbl--compact"><thead><tr><th>#</th><th>Name</th><th>Points</th><th>${headerCol}</th></tr></thead><tbody>${rows}</tbody></table>`;
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
    const pb=getPB(r.name,dist.key);
    const pbStr=pb?`<span style="color:var(--orange)">${pb}</span>`:"";
    return`<tr class="${podCls(rk)}"><td><strong>${rk}</strong> ${medal(rk)}</td><td><span class="athlete" data-name="${esc(r.name)}">${esc(r.name)}</span> <span class="country">${esc(r.country)}</span></td><td class="mono">${fmtTime(r.seconds)} ${badge}</td><td class="mono" style="color:var(--orange)">${pbStr}</td><td class="mono">${fmtPts(trunc3(r.seconds/dist.divisor))}</td><td>${dStr}</td></tr>`;
  }).join("");

  // Sidebar standings
  const lPts=standings.leader?.currentPoints;
  let nextDist=null;for(const d of ds){if(!standings.all.some(a=>Number.isFinite(a.seconds[d.key]))){nextDist=d;break}}
  if(!nextDist)nextDist=dist;
  const sideR=standings.ranked.map(a=>{
    const nt=neededTime(a,nextDist.key,lPts);
    const ntStr=(a.rank>1&&Number.isFinite(nt)&&nt>0)?`<span class="target-time">${fmtTime(nt)}</span>`:"";
    const dStr=a.rank===1?'<span class="delta delta--leader">L</span>':Number.isFinite(a.delta)?`<span class="delta" style="font-size:0.7rem">${fmtDelta(a.delta*nextDist.divisor)}</span>`:"";
    return`<tr><td style="font-weight:700;font-size:0.78rem;color:var(--text-dim)">${a.rank}</td><td><span class="athlete" data-name="${esc(a.name)}">${esc(a.name)}</span></td><td class="mono">${fmtPts(a.currentPoints)}</td><td>${dStr}</td><td>${ntStr}</td></tr>`;
  }).join("");
  const cc=ds.filter(d=>standings.all.some(a=>Number.isFinite(a.seconds[d.key]))).length;

  el.contentArea.innerHTML=`
    <h2 style="font-size:1.2rem;font-weight:800;margin-bottom:12px">${esc(dist.label)} — ${state.gender==="v"?"Women":"Men"}</h2>
    <div style="display:grid;grid-template-columns:1fr clamp(280px,25vw,450px);gap:var(--gap);align-items:start">
      <div class="table-wrap"><table class="tbl"><thead><tr><th>#</th><th>Name</th><th>Time</th><th style="color:var(--orange)">PB</th><th>Points</th><th>Gap</th></tr></thead><tbody>${mainR}</tbody></table></div>
      <div>
        <div style="font-size:0.85rem;font-weight:700;color:var(--isu-blue);margin-bottom:4px">Live Standings <span style="color:var(--text-dim);font-weight:400">(${cc}/${ds.length})</span></div>
        ${nextDist?`<div style="font-size:0.7rem;color:var(--text-dim);margin-bottom:6px">Target on ${esc(nextDist.label)} for P1</div>`:""}
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
    <h2 style="font-size:1.2rem;font-weight:800;margin-bottom:2px">Sprint Championship Standings — ${state.gender==="v"?"Women":"Men"}</h2>
    <div style="font-size:0.78rem;color:var(--text-dim);margin-bottom:12px">After ${cc}/${ds.length} distances${lastFetch[state.gender]?` · Updated ${lastFetch[state.gender].toLocaleTimeString("nl-NL")}`:""}</div>
    <div class="table-wrap"><table class="tbl"><thead><tr><th>#</th><th>Name</th>${hdr}<th>Points</th><th>Δ</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="info-box"><strong>Sorting:</strong> most distances completed → lowest points. Points = time(s) ÷ distance factor (500m=1, 1000m=2), truncated to 3 decimals.</div>`;
}

// ── DEELNEMERS ──────────────────────────────────────────
function renderDeelnemers(){
  const g=state.gender;
  const parts=buildParticipants(g);
  if(!parts.length){el.contentArea.innerHTML=`<h2 style="font-size:1.2rem;font-weight:800;margin-bottom:12px">Deelnemers — ${g==="v"?"Women":"Men"}</h2><div class="info-box">No participants loaded yet. Data will appear once results or start lists are fetched.</div>`;return}
  const ac=parts.filter(p=>isActive(p.name)).length;
  const rows=parts.map(p=>{
    const act=isActive(p.name);
    const a=standings?.all?.find(x=>x.name===p.name);
    const cc=a?.completedCount??0;
    const pts=a?.currentPoints;
    return`<tr${!act?' style="opacity:.4"':""}>
      <td><span class="athlete" data-name="${esc(p.name)}">${esc(p.name)}</span> <span class="country">${esc(p.country)}</span></td>
      <td class="mono">${cc>0?fmtPts(pts):"—"}</td>
      <td>${a?.rank??"—"}</td>
      <td><button class="btn ${act?"btn--ghost":"btn--inactive"}" data-toggle="${esc(p.name)}" style="font-size:0.78rem;padding:3px 10px">${act?"Actief":"Inactief"}</button></td>
    </tr>`;
  }).join("");
  el.contentArea.innerHTML=`
    <h2 style="font-size:1.2rem;font-weight:800;margin-bottom:2px">Deelnemers — ${g==="v"?"Women":"Men"}</h2>
    <div style="font-size:0.78rem;color:var(--text-dim);margin-bottom:12px">${ac}/${parts.length} actief</div>
    <div class="table-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Points</th><th>Rank</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="info-box">Klik <strong>Actief/Inactief</strong> om rijders uit het klassement te halen (bijv. bij opgave of diskwalificatie).</div>`;
  el.contentArea.addEventListener("click",e=>{
    const b=e.target.closest("[data-toggle]");if(!b)return;
    const n=b.dataset.toggle;
    inactive[g].has(n)?inactive[g].delete(n):inactive[g].add(n);
    saveInactive();render();
  });
}

// ── POPUP: Athlete ──────────────────────────────────────
function openPopup(name){
  if(!standings)return;const a=standings.all.find(x=>x.name===name);if(!a)return;const ds=getDists();const g=state.gender;
  const rowed=ds.filter(d=>a.times[d.key]);
  // Collect records per distance
  const records={};
  for(const d of ds){
    const res=(dataCache[g][d.key]??[]).find(r=>r.name===name);
    if(res?.record)records[d.key]=res.record;
  }
  // All distances with PB from central cache
  const allDists=ds.map(d=>{
    const hasResult=Number.isFinite(a.seconds[d.key]);
    const pb=getPB(name,d.key);
    return{d,hasResult,pb};
  });

  let h=`<div class="panel"><div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:14px"><div><h3>${esc(name)}</h3><div style="font-size:0.92rem;color:var(--text-dim)">${flag(a.country)} ${esc(a.country)}</div></div><button class="close-btn" id="closePopup">✕</button></div>
    <div class="stat-grid">
      <div class="stat-box"><div class="stat-box__label">Rank</div><div class="stat-box__value">#${a.rank??"—"}</div></div>
      <div class="stat-box"><div class="stat-box__label">Points</div><div class="stat-box__value">${fmtPts(a.currentPoints)}</div></div>
      <div class="stat-box"><div class="stat-box__label">Distances</div><div class="stat-box__value">${a.completedCount}/${ds.length}</div></div>
    </div>`;
  // Full distance table: show ALL distances, not just rowed
  h+=`<div class="table-wrap"><table class="tbl"><thead><tr><th>Distance</th><th>Time</th><th>Pos</th><th>Points</th><th>PB</th></tr></thead><tbody>`;
  for(const{d,hasResult,pb}of allDists){
    const dr=a.distRanks[d.key];const badge=recordBadge(records[d.key]);
    if(hasResult){
      h+=`<tr class="${podCls(dr)}"><td>${esc(d.label)}</td><td class="mono">${fmtTime(a.seconds[d.key])} ${badge}</td><td>${dr?`${dr} ${medal(dr)}`:"—"}</td><td class="mono">${fmtPts(a.points[d.key])}</td><td class="mono" style="color:var(--orange)">${pb}</td></tr>`;
    }else{
      h+=`<tr style="opacity:.5"><td>${esc(d.label)}</td><td class="mono" style="color:var(--text-muted)">—</td><td>—</td><td class="mono">—</td><td class="mono" style="color:var(--orange)">${pb}</td></tr>`;
    }
  }
  h+=`</tbody></table></div>`;
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

  // PB from central cache
  const pbA=getPB(rA.name,distKey);
  const pbB=getPB(rB.name,distKey);

  const rows=ds.map(d=>{
    const sA=rA.seconds[d.key],sB=rB.seconds[d.key];
    const tA=Number.isFinite(sA)?fmtTime(sA):"—",tB=Number.isFinite(sB)?fmtTime(sB):"—";
    const recA=(dataCache[g][d.key]??[]).find(r=>r.name===rA.name)?.record;
    const recB=(dataCache[g][d.key]??[]).find(r=>r.name===rB.name)?.record;
    const pA_pb=getPB(rA.name,d.key);
    const pB_pb=getPB(rB.name,d.key);
    const pA_pbH=pA_pb?`<div style="color:var(--orange);font-size:0.7rem">PB ${pA_pb}</div>`:"";
    const pB_pbH=pB_pb?`<div style="color:var(--orange);font-size:0.7rem">PB ${pB_pb}</div>`:"";
    let diff="";
    if(Number.isFinite(sA)&&Number.isFinite(sB)){const dd=sA-sB;diff=Math.abs(dd)<0.005?'<span style="color:var(--text-dim)">—</span>':dd<0?`<span style="color:var(--green)">${fmtDelta(dd)}</span>`:`<span style="color:var(--red)">${fmtDelta(dd)}</span>`}
    return`<tr><td class="mono" style="text-align:right">${tA} ${recordBadge(recA)}${pA_pbH}</td><td style="text-align:center;font-weight:600;color:var(--text-dim);font-size:0.78rem">${esc(d.label)}</td><td class="mono">${tB} ${recordBadge(recB)}${pB_pbH}</td><td style="text-align:center">${diff}</td></tr>`;
  }).join("");

  let h=`<div class="panel"><div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:14px"><div><h3>Rit ${pairNum} — ${esc(dist.label)}</h3><div style="font-size:0.92rem;color:var(--text-dim)">${laneDot("I")} ${esc(rA.name)} ${esc(rA.country)} vs ${laneDot("O")} ${esc(rB.name)} ${esc(rB.country)}</div></div><button class="close-btn" id="closePopup">✕</button></div>
    <div class="table-wrap" style="margin-bottom:14px"><table class="tbl">
      <thead><tr><th style="text-align:right">${laneDot(pair[0].startLane)} ${esc(rA.name)}<br><span style="font-weight:400;text-transform:none">#${rA.rank??"—"} · ${fmtPts(pA)} pts${pbA?` · <span style="color:var(--orange)">PB ${pbA}</span>`:""}</span></th><th style="text-align:center">Distance</th><th>${laneDot(pair[1].startLane)} ${esc(rB.name)}<br><span style="font-weight:400;text-transform:none">#${rB.rank??"—"} · ${fmtPts(pB)} pts${pbB?` · <span style="color:var(--orange)">PB ${pbB}</span>`:""}</span></th><th style="text-align:center">Δ</th></tr></thead>
      <tbody>${rows}
        <tr style="border-top:2px solid var(--border);font-weight:700"><td class="mono" style="text-align:right">${fmtPts(pA)}</td><td style="text-align:center;color:var(--text-dim);font-size:0.78rem">Points</td><td class="mono">${fmtPts(pB)}</td><td style="text-align:center;font-size:0.78rem">${ptsDiffStr}</td></tr>
      </tbody>
    </table></div>
    <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius);padding:12px;font-size:0.85rem">
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
    cacheEls();loadInactive();render();
    // Step 1: discover correct competition IDs for this event
    const found=await discoverCompIds();
    if(!found)console.warn("[WK] No compIds discovered — will retry on poll");
    bindEvents();render();
    // Step 2: fetch data
    await fetchGender(state.gender);
    render();
    console.log("[WK] Boot complete ✅");startPoll();
  }catch(e){
    console.error("[WK] Boot:",e);
    render();startPoll();
  }
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
