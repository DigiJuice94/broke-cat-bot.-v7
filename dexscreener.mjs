import {config} from './config.mjs';
import {observeRunnerEvidence} from './runner_evidence.mjs';
import {platformTrendFor,discoverySourceFor,marketDataFor} from './runner_feeds.mjs';
const API='https://api.dexscreener.com';
async function json(url){const r=await fetch(url,{headers:{Accept:'application/json'}});if(!r.ok)throw new Error(`DEX Screener ${r.status}`);return r.json()}
const num=v=>Number(v??0)||0;
function normalizePair(p){if(p.chainId!=='solana'||!p.baseToken?.address)return null;return{chainId:p.chainId,tokenAddress:p.baseToken.address,pairAddress:p.pairAddress,symbol:p.baseToken.symbol||'?',name:p.baseToken.name||'Unknown',dexId:p.dexId||'unknown',url:p.url,priceUsd:num(p.priceUsd),liquidityUsd:num(p.liquidity?.usd),marketCap:num(p.marketCap||p.fdv),pairCreatedAt:p.pairCreatedAt?Number(p.pairCreatedAt):undefined,volume5m:num(p.volume?.m5),volume1h:num(p.volume?.h1),volume24h:num(p.volume?.h24),buys5m:num(p.txns?.m5?.buys),sells5m:num(p.txns?.m5?.sells),priceChange5m:num(p.priceChange?.m5),priceChange1h:num(p.priceChange?.h1),priceChange6h:num(p.priceChange?.h6),priceChange24h:num(p.priceChange?.h24),info:p.info||null};}
export async function tokenPairs(address){const pairs=await json(`${API}/token-pairs/v1/solana/${address}`).catch(()=>[]);return(Array.isArray(pairs)?pairs:[]).map(normalizePair).filter(Boolean).sort((a,b)=>b.liquidityUsd-a.liquidityUsd)}
export async function pairForToken(address){return (await tokenPairs(address))[0]||null}

function bestPairsByToken(rows){
  const best=new Map();
  for(const raw of Array.isArray(rows)?rows:[]){const p=normalizePair(raw);if(!p)continue;const old=best.get(p.tokenAddress);if(!old||p.liquidityUsd>old.liquidityUsd)best.set(p.tokenAddress,p)}
  return best;
}
async function batchPairs(addresses){
  const clean=[...new Set(addresses)].filter(Boolean);const best=new Map();const size=Math.max(1,Math.min(30,config.discoveryBatchSize||30));
  const load=async list=>{for(let i=0;i<list.length;i+=size){const slice=list.slice(i,i+size);const rows=await json(`${API}/tokens/v1/solana/${slice.join(',')}`).catch(()=>[]);for(const [address,p] of bestPairsByToken(rows)){const old=best.get(address);if(!old||p.liquidityUsd>old.liquidityUsd)best.set(address,p)}}};
  await load(clean);
  // Very new Solana pools can briefly return market/volume data before DexScreener's
  // liquidity field is populated. Retry only those addresses once instead of treating
  // a temporary missing value as confirmed $0 liquidity.
  const pending=clean.filter(address=>{const p=best.get(address);return p&&p.liquidityUsd<=0&&(p.marketCap>0||p.volume5m>0||p.volume1h>0)});
  if(pending.length){await new Promise(r=>setTimeout(r,500));await load(pending)}
  return best;
}
export function runnerMetrics(c){return c?.runnerRadar||observeRunnerEvidence(c)}
function preRank(c,{priority=false,runnerSource=false,platformTrending=false}={}){
  const r=runnerMetrics(c);let n=0;
  if(priority)n+=10000;if(r.isRunner)n+=5000+config.runnerRadarPriorityBoost;if(platformTrending)n+=config.platformTrendPriorityBoost;if(runnerSource)n+=1000;
  n+=Math.min(1000,Math.max(0,c.volume5m)/100)+Math.min(800,Math.max(0,c.liquidityUsd)/1000);
  n+=Math.max(-200,Math.min(1000,c.priceChange1h*5))+Math.max(-100,Math.min(500,c.priceChange5m*5));
  return n;
}
export async function discoverCandidates(priorityAddresses=[],runnerAddresses=[]){
  const [profiles,boosts,topBoosts,ads,ctos]=await Promise.all([
    json(`${API}/token-profiles/latest/v1`).catch(()=>[]),json(`${API}/token-boosts/latest/v1`).catch(()=>[]),json(`${API}/token-boosts/top/v1`).catch(()=>[]),json(`${API}/ads/latest/v1`).catch(()=>[]),json(`${API}/community-takeovers/latest/v1`).catch(()=>[])
  ]);
  const prioritySet=new Set(priorityAddresses),runnerSet=new Set(runnerAddresses),addresses=new Set([...priorityAddresses,...runnerAddresses]);
  for(const row of [...(Array.isArray(profiles)?profiles:[]),...(Array.isArray(boosts)?boosts:[]),...(Array.isArray(topBoosts)?topBoosts:[]),...(Array.isArray(ads)?ads:[]),...(Array.isArray(ctos)?ctos:[])])if(row?.chainId==='solana'&&row?.tokenAddress)addresses.add(row.tokenAddress);
  // Never truncate before market data is loaded. Batch endpoint handles up to 30 addresses/request,
  // letting us cheaply rank the whole discovery universe first and only then cap processing.
  const all=[...addresses];const pairMap=await batchPairs(all);const enriched=[];
  for(const address of all){let p=pairMap.get(address);if(!p)continue;const trend=platformTrendFor(address);const feed=discoverySourceFor(address);const fallback=marketDataFor(address);const meta={prioritySource:prioritySet.has(address),runnerSource:runnerSet.has(address),newLaunchSource:feed.isNewLaunch,platformTrending:trend.isTrending,platformTrendSources:trend.sources,platformTrendPlatforms:trend.platforms,discoverySources:feed.sources};
    // Revisit/watch addresses deserve one direct token-pairs fallback because the batch
    // endpoint can lag behind a newly created pool's liquidity update.
    if(p.liquidityUsd<=0&&prioritySet.has(address)&&(p.marketCap>0||p.volume5m>0||p.volume1h>0)){const direct=await pairForToken(address).catch(()=>null);if(direct&&direct.liquidityUsd>p.liquidityUsd)p=direct}
    // DexScreener can lag on newborn pools. Mobula/Axiom-style and GeckoTerminal already
    // carry usable pool liquidity, so use that value when Dex has market activity but no
    // liquidity yet. Never overwrite a positive DexScreener liquidity reading.
    let liquiditySource=p.liquidityUsd>0?'dexscreener':null;
    if(p.liquidityUsd<=0&&Number(fallback?.liquidityUsd||0)>0){p={...p,liquidityUsd:Number(fallback.liquidityUsd)};liquiditySource=fallback.liquiditySource||'feed-fallback'}
    if(p.marketCap<=0&&Number(fallback?.marketCapUsd||0)>0)p={...p,marketCap:Number(fallback.marketCapUsd)};
    if(p.volume5m<=0&&Number(fallback?.volume5m||0)>0)p={...p,volume5m:Number(fallback.volume5m)};
    if(p.volume1h<=0&&Number(fallback?.volume1h||0)>0)p={...p,volume1h:Number(fallback.volume1h)};
    if((!p.name||p.name==='Unknown')&&fallback?.name)p={...p,name:fallback.name};if((!p.symbol||p.symbol==='?')&&fallback?.symbol)p={...p,symbol:fallback.symbol};
    const liquidityPending=p.liquidityUsd<=0&&(p.marketCap>0||p.volume5m>0||p.volume1h>0);const rm=observeRunnerEvidence(p);const withRunner={...p,...meta,liquiditySource:liquiditySource||'pending',liquidityPending,runnerRadar:rm};enriched.push({...withRunner,discoveryRank:preRank(withRunner,meta)});}
  const ranked=enriched.sort((a,b)=>b.discoveryRank-a.discoveryRank||(b.volume5m||0)-(a.volume5m||0));
  const max=Math.max(40,config.discoveryMaxAddresses||150);
  const selected=[];const used=new Set();
  const ageMin=c=>c.pairCreatedAt?(Date.now()-c.pairCreatedAt)/60000:Infinity;
  const isEarly=c=>Boolean(c.newLaunchSource)||(ageMin(c)<=config.earlyMaxAgeMinutes&&c.marketCap<=config.earlyMaxMarketCap);
  const take=(filter,limit,lane)=>{for(const c of ranked){if(selected.length>=max||limit<=0)break;if(used.has(c.tokenAddress)||!filter(c))continue;selected.push({...c,discoveryLane:lane});used.add(c.tokenAddress);limit--}};
  // Explicit/watch/revisit addresses are never crowded out. Then reserve scan capacity
  // for Early Cats, platform trends, and Runner Radar independently. Unused capacity
  // automatically flows to the strongest remaining candidates.
  take(c=>c.prioritySource,max,'priority');
  take(isEarly,Math.min(max-selected.length,Math.max(0,config.discoveryEarlyReserve||50)),'early');
  take(c=>c.platformTrending,Math.min(max-selected.length,Math.max(0,config.discoveryTrendReserve||45)),'platform');
  take(c=>Boolean(c.runnerRadar?.isRunner),Math.min(max-selected.length,Math.max(0,config.discoveryRunnerReserve||35)),'runner');
  take(()=>true,max-selected.length,'general');
  return selected;
}
export async function refreshPair(pairAddress){const data=await json(`${API}/latest/dex/pairs/solana/${pairAddress}`);const p=Array.isArray(data?.pairs)?data.pairs[0]:null;return p?normalizePair(p):null}
