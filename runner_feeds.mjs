import {config} from './config.mjs';
import {mobulaTrending} from './mobula_intel.mjs';

const cache={at:0,addresses:new Map(),selectedAddresses:[],laneMix:{early:0,trending:0,total:0},statuses:{}};
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
const add=(map,address,source,meta={})=>{if(!address||typeof address!=='string'||address.length<25)return;const old=map.get(address)||{address,sources:new Set(),meta:{}};old.sources.add(source);old.meta={...old.meta,[source]:meta};map.set(address,old)};
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
  if(!config.crossPlatformEnabled)return{addresses:[],statuses:{disabled:true},laneMix:{early:0,trending:0,total:0}};
  const ttl=Math.max(15,config.runnerFeedPollSeconds)*1000;if(!force&&Date.now()-cache.at<ttl)return{addresses:[...(cache.selectedAddresses||[])],statuses:cache.statuses,laneMix:cache.laneMix};
  const map=new Map();const statuses={};
  try{statuses['mobula-axiom']=await mobula(map)}catch(e){statuses['mobula-axiom']={enabled:true,error:e?.message||String(e)}}
  cache.at=Date.now();cache.addresses=map;cache.statuses=statuses;
  const max=Math.max(20,config.runnerFeedMaxAddresses||120);const rows=[...map.values()];
  const isTrend=r=>[...r.sources].some(x=>x==='mobula-axiom-trending');
  const chosen=[];const used=new Set();const take=(filter,limit)=>{for(const r of rows){if(chosen.length>=max||limit<=0)break;if(used.has(r.address)||!filter(r))continue;chosen.push(r.address);used.add(r.address);limit--}};
  take(isTrend,Math.min(max,Math.max(0,config.runnerFeedTrendReserve||50)));take(()=>true,max-chosen.length);
  const laneMix={early:0,trending:chosen.filter(a=>isTrend(map.get(a))).length,total:chosen.length};
  cache.selectedAddresses=[...chosen];cache.laneMix=laneMix;return{addresses:chosen,statuses,laneMix};
}
export function discoverySourceFor(address){const row=cache.addresses.get(address);if(!row)return{isNewLaunch:false,isTrending:false,sources:[]};const sources=[...row.sources];return{isNewLaunch:false,isTrending:sources.includes('mobula-axiom-trending'),sources};}
export function platformTrendFor(address){const row=cache.addresses.get(address);if(!row)return{isTrending:false,sources:[],platforms:[]};const sources=[...row.sources].filter(x=>x==='mobula-axiom-trending');return{isTrending:sources.length>0,sources,platforms:sources.length?['axiom-style']:[]};}
export function runnerFeedStatus(){return{lastRefresh:cache.at?new Date(cache.at).toISOString():null,addresses:cache.addresses.size,statuses:cache.statuses}}
export function marketDataFor(address){
  const row=cache.addresses.get(address);if(!row)return null;const metas=Object.entries(row.meta||{}).map(([source,meta])=>({source,meta:meta||{}}));
  const liquid=metas.filter(x=>num(x.meta.liquidityUsd)>0).sort((a,b)=>num(b.meta.liquidityUsd)-num(a.meta.liquidityUsd))[0];
  const first=key=>{for(const x of metas){const v=num(x.meta[key]);if(v>0)return v}return 0};const text=key=>{for(const x of metas){const v=x.meta[key];if(v)return v}return null};
  return{liquidityUsd:liquid?num(liquid.meta.liquidityUsd):0,liquiditySource:liquid?.source||null,marketCapUsd:first('marketCapUsd'),volume5m:first('volume5m'),volume1h:first('volume1h'),change5m:first('change5m'),change1h:first('change1h'),name:text('name'),symbol:text('symbol')};
}
