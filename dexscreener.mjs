import {config} from './config.mjs';
import {observeRunnerEvidence} from './runner_evidence.mjs';
import {platformTrendFor} from './runner_feeds.mjs';
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
  for(let i=0;i<clean.length;i+=size){
    const slice=clean.slice(i,i+size);
    const rows=await json(`${API}/tokens/v1/solana/${slice.join(',')}`).catch(()=>[]);
    for(const [address,p] of bestPairsByToken(rows))best.set(address,p);
  }
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
  for(const address of all){const p=pairMap.get(address);if(!p)continue;const trend=platformTrendFor(address);const meta={prioritySource:prioritySet.has(address),runnerSource:runnerSet.has(address),platformTrending:trend.isTrending,platformTrendSources:trend.sources,platformTrendPlatforms:trend.platforms};const rm=observeRunnerEvidence(p);const withRunner={...p,...meta,runnerRadar:rm};enriched.push({...withRunner,discoveryRank:preRank(withRunner,meta)});}
  return enriched.sort((a,b)=>b.discoveryRank-a.discoveryRank||(b.volume5m||0)-(a.volume5m||0)).slice(0,Math.max(40,config.discoveryMaxAddresses||150));
}
export async function refreshPair(pairAddress){const data=await json(`${API}/latest/dex/pairs/solana/${pairAddress}`);const p=Array.isArray(data?.pairs)?data.pairs[0]:null;return p?normalizePair(p):null}
