import {config} from './config.mjs';

const watch=new Map();
const now=()=>Date.now();
const maxWatchMs=()=>Math.max(1,config.rapidWatchMaxMinutes)*60_000;

function isHardReject(s,gate){
  if(!s?.risk)return false;
  if(['high'].includes(String(s.risk.bundleRisk).toLowerCase()))return true;
  if(['high'].includes(String(s.risk.devRisk).toLowerCase()))return true;
  if(['high'].includes(String(s.risk.holderRisk).toLowerCase()))return true;
  return String(gate?.why||'').includes('market cap outside bounds');
}
function isNewbornUnverified(s,gate){
  if(!Number.isFinite(s?.ageMin)||s.ageMin>config.rapidWatchNewbornMaxAgeMinutes)return false;
  const why=String(gate?.why||'');
  return why.includes('liquidity below floor')||why.includes('bundle/launch risk unverified');
}
function isClose(s){return Number(s?.score||0)>=Math.max(55,config.minScore-config.rapidWatchScoreMargin)}
function nextDelaySeconds(s,gate){
  const gap=config.minScore-Number(s?.score||0);
  if(gap<=2)return Math.max(5,config.rapidWatchHotRecheckSeconds);
  if(gap<=config.rapidWatchScoreMargin)return Math.max(5,config.rapidWatchRecheckSeconds);
  if(isNewbornUnverified(s,gate))return Math.max(5,config.rapidWatchRecheckSeconds);
  return Math.max(10,config.rapidWatchSlowRecheckSeconds);
}
function prune(){
  const t=now();
  for(const [address,w] of watch){
    if(t-w.firstSeenAt>maxWatchMs()||w.ageMin>config.rapidWatchMaxAgeMinutes)watch.delete(address);
  }
  if(watch.size>config.rapidWatchMaxTokens){
    const sorted=[...watch.entries()].sort((a,b)=>(b[1].bestScore-a[1].bestScore)||(a[1].nextCheckAt-b[1].nextCheckAt));
    for(const [address] of sorted.slice(config.rapidWatchMaxTokens))watch.delete(address);
  }
}
export function rapidWatchDueAddresses(){
  if(!config.rapidWatchEnabled)return[];
  prune();const t=now();
  return [...watch.entries()].filter(([,w])=>w.nextCheckAt<=t).sort((a,b)=>b[1].bestScore-a[1].bestScore||a[1].nextCheckAt-b[1].nextCheckAt).map(([address])=>address);
}
export function rapidWatchAllAddresses(){prune();return [...watch.keys()]}
export function rapidWatchStatus(){prune();const due=rapidWatchDueAddresses().length;return{enabled:config.rapidWatchEnabled,count:watch.size,due,max:config.rapidWatchMaxTokens}}
export function rapidWatchHasItems(){prune();return config.rapidWatchEnabled&&watch.size>0}
export function noteRapidWatch(s,gate){
  if(!config.rapidWatchEnabled||!s?.tokenAddress)return null;
  const address=s.tokenAddress,existing=watch.get(address);
  if(gate?.ok){if(existing){watch.delete(address);return{action:'qualified',symbol:s.symbol,score:s.score,previousScore:existing.lastScore}}return null}
  if(isHardReject(s,gate)){
    if(existing)watch.delete(address);
    return existing?{action:'dropped',symbol:s.symbol,score:s.score,why:`hard reject: ${gate.why}`} : null;
  }
  const eligible=isClose(s)||isNewbornUnverified(s,gate);
  if(!eligible){
    if(!existing)return null;
    const decline=Number(s.score)<Number(existing.lastScore);
    const declines=decline?(existing.declines+1):0;
    if(declines>=config.rapidWatchMaxDeclines&&Number(s.score)<config.minScore-config.rapidWatchScoreMargin){watch.delete(address);return{action:'dropped',symbol:s.symbol,score:s.score,why:'score deteriorated'}}
  }
  const t=now(),delay=nextDelaySeconds(s,gate)*1000;
  if(!existing){
    const w={tokenAddress:address,symbol:s.symbol,firstSeenAt:t,lastCheckedAt:t,nextCheckAt:t+delay,lastScore:Number(s.score),bestScore:Number(s.score),checks:1,declines:0,ageMin:s.ageMin,lastWhy:gate.why,lastLiquidity:Number(s.liquidityUsd||0),lastMarketCap:Number(s.marketCap||0)};
    watch.set(address,w);prune();
    return{action:'added',symbol:s.symbol,score:s.score,why:gate.why,nextSeconds:delay/1000};
  }
  const previousScore=existing.lastScore,delta=Number(s.score)-Number(previousScore),declines=delta<0?existing.declines+1:0;
  Object.assign(existing,{symbol:s.symbol,lastCheckedAt:t,nextCheckAt:t+delay,lastScore:Number(s.score),bestScore:Math.max(existing.bestScore,Number(s.score)),checks:existing.checks+1,declines,ageMin:s.ageMin,lastWhy:gate.why,lastLiquidity:Number(s.liquidityUsd||0),lastMarketCap:Number(s.marketCap||0)});
  if(t-existing.firstSeenAt>maxWatchMs()||s.ageMin>config.rapidWatchMaxAgeMinutes){watch.delete(address);return{action:'dropped',symbol:s.symbol,score:s.score,why:'watch window expired'}}
  if(declines>=config.rapidWatchMaxDeclines&&Number(s.score)<config.minScore-config.rapidWatchScoreMargin){watch.delete(address);return{action:'dropped',symbol:s.symbol,score:s.score,why:'score deteriorated'}}
  return{action:'updated',symbol:s.symbol,score:s.score,previousScore,delta,why:gate.why,nextSeconds:delay/1000,checks:existing.checks};
}
