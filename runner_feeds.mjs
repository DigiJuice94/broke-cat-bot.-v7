import {config} from './config.mjs';
import {mobulaTrending} from './mobula_intel.mjs';

const GT='https://api.geckoterminal.com/api/v2';
const cache={at:0,addresses:new Map(),selectedAddresses:[],laneMix:{early:0,trending:0,total:0},statuses:{}};
const add=(map,address,source,meta={})=>{if(!address||typeof address!=='string'||address.length<25)return;const old=map.get(address)||{address,sources:new Set(),meta:{}};old.sources.add(source);old.meta={...old.meta,[source]:meta};map.set(address,old)};
async function getJson(url,opts={}){const r=await fetch(url,opts);if(!r.ok)throw new Error(`${new URL(url).hostname} ${r.status}`);return r.json()}
function includedTokenMap(j){const m=new Map();for(const x of j?.included||[])if(x?.type==='token'){const a=x?.attributes||{};if(a.address)m.set(x.id,{address:a.address,name:a.name,symbol:a.symbol})}return m}
async function gecko(map){
  if(!config.geckoTerminalEnabled)return{enabled:false,why:'disabled'};
  const jobs=[];
  for(let page=1;page<=Math.max(1,config.geckoTrendingPages);page++)jobs.push({kind:'gecko-trending',url:`${GT}/networks/solana/trending_pools?include=base_token&page=${page}`});
  for(let page=1;page<=Math.max(1,config.geckoNewPages);page++)jobs.push({kind:'gecko-new',url:`${GT}/networks/new_pools?include=base_token&page=${page}`});
  let n=0;
  for(const job of jobs){const j=await getJson(job.url,{headers:{accept:'application/json'}});const toks=includedTokenMap(j);for(const pool of j?.data||[]){const rel=pool?.relationships?.base_token?.data?.id;const tok=toks.get(rel);if(tok?.address){add(map,tok.address,job.kind,{pool:pool?.attributes?.address,name:tok.name,symbol:tok.symbol});n++}}}
  return{enabled:true,count:n,pages:jobs.length};
}
async function mobula(map){
  const result=await mobulaTrending();
  if(!result.enabled)return result;
  let n=0;for(const x of result.rows||[]){if(!x.address)continue;add(map,x.address,'mobula-axiom-trending',{platform:'axiom-style',symbol:x.symbol,name:x.name,marketCapUsd:x.marketCap,liquidityUsd:x.liquidity,volume5m:x.volume5m,volume1h:x.volume1h,change5m:x.priceChange5m,change1h:x.priceChange1h,bundlersPct:x.bundlersPct,devPct:x.devPct,top10Pct:x.top10Pct,insidersPct:x.insidersPct,snipersPct:x.snipersPct,holdersCount:x.holdersCount});n++}
  return{enabled:true,count:n};
}
export function confirmationFor(candidate){
  const row=cache.addresses.get(candidate.tokenAddress);const sources=row?[...row.sources]:[];const unique=[...new Set(sources)];
  const independent=Math.max(0,unique.length-1);const bonus=config.crossPlatformEnabled?Math.min(config.crossPlatformBonusMax,independent*2):0;
  return{sources:unique,count:unique.length,bonus,community:null,meta:row?.meta||{}};
}
export async function refreshRunnerFeeds(force=false){
  if(!config.crossPlatformEnabled)return{addresses:[],statuses:{disabled:true}};
  const ttl=Math.max(15,config.runnerFeedPollSeconds)*1000;if(!force&&Date.now()-cache.at<ttl)return{addresses:[...(cache.selectedAddresses||[])],statuses:cache.statuses,laneMix:cache.laneMix};
  const map=new Map();const statuses={};
  for(const [name,fn] of [['mobula-axiom',mobula],['geckoterminal',gecko]]){try{statuses[name]=await fn(map)}catch(e){statuses[name]={enabled:true,error:e?.message||String(e)}}}
  cache.at=Date.now();cache.addresses=map;cache.statuses=statuses;
  const max=Math.max(20,config.runnerFeedMaxAddresses||120);const rows=[...map.values()];
  const isEarly=r=>[...r.sources].some(x=>x==='gecko-new');
  const isTrend=r=>[...r.sources].some(x=>x==='gecko-trending'||x==='mobula-axiom-trending');
  const chosen=[];const used=new Set();const take=(filter,limit)=>{for(const r of rows){if(chosen.length>=max||limit<=0)break;if(used.has(r.address)||!filter(r))continue;chosen.push(r.address);used.add(r.address);limit--}};
  take(isEarly,Math.min(max,Math.max(0,config.runnerFeedEarlyReserve||40)));
  take(isTrend,Math.min(max-chosen.length,Math.max(0,config.runnerFeedTrendReserve||50)));
  take(()=>true,max-chosen.length);
  const laneMix={early:chosen.filter(a=>isEarly(map.get(a))).length,trending:chosen.filter(a=>isTrend(map.get(a))).length,total:chosen.length};
  cache.selectedAddresses=[...chosen];cache.laneMix=laneMix;return{addresses:chosen,statuses,laneMix};
}
export function discoverySourceFor(address){const row=cache.addresses.get(address);if(!row)return{isNewLaunch:false,isTrending:false,sources:[]};const sources=[...row.sources];return{isNewLaunch:sources.includes('gecko-new'),isTrending:sources.some(x=>x==='gecko-trending'||x==='mobula-axiom-trending'),sources};}
export function platformTrendFor(address){const row=cache.addresses.get(address);if(!row)return{isTrending:false,sources:[],platforms:[]};const sources=[...row.sources].filter(x=>x==='gecko-trending'||x==='mobula-axiom-trending');const platforms=[...new Set(sources.map(x=>x==='mobula-axiom-trending'?'axiom-style':'geckoterminal'))];return{isTrending:sources.length>0,sources,platforms};}
export function runnerFeedStatus(){return{lastRefresh:cache.at?new Date(cache.at).toISOString():null,addresses:cache.addresses.size,statuses:cache.statuses}}
