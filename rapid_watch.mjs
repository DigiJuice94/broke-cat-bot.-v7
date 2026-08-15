import {config} from './config.mjs';

const watch=new Map();
const suppressed=new Map();
const now=()=>Date.now();
const maxWatchMs=()=>Math.max(1,config.rapidWatchMaxMinutes)*60_000;
const pct=(cur,prev)=>Number(prev)>0?((Number(cur)-Number(prev))/Number(prev))*100:(Number(cur)>0?100:0);

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
function snapshot(s){
  return {
    score:Number(s?.score||0),marketCap:Number(s?.marketCap||0),liquidity:Number(s?.liquidityUsd||0),
    viral:Number(s?.hype?.bonus||0),cross:Number(s?.crossPlatform?.count||0),
    buys:Number(s?.buys5m||0),sells:Number(s?.sells5m||0),volume:Number(s?.volume5m||0),price5m:Number(s?.priceChange5m||0)
  };
}
function trajectory(prev,cur){
  if(!prev)return{trend:'NEW',strength:0,mcPct:0,liqPct:0,scoreDelta:0,viralDelta:0,crossDelta:0,buyerDelta:0,volumePct:0};
  const scoreDelta=cur.score-prev.score,mcPct=pct(cur.marketCap,prev.marketCap),liqPct=pct(cur.liquidity,prev.liquidity),viralDelta=cur.viral-prev.viral,crossDelta=cur.cross-prev.cross,buyerDelta=cur.buys-prev.buys,volumePct=pct(cur.volume,prev.volume);
  let strength=0;
  if(scoreDelta>=3)strength+=2; else if(scoreDelta<0)strength-=1;
  if(mcPct>=config.rapidWatchImprovingMcPct)strength+=2; else if(mcPct<=-20)strength-=1;
  if(prev.liquidity<=0&&cur.liquidity>0)strength+=4; else if(liqPct>=25)strength+=2; else if(liqPct<=-30&&prev.liquidity>0)strength-=2;
  if(viralDelta>0)strength+=2;if(crossDelta>0)strength+=2;if(buyerDelta>=3)strength+=2;if(volumePct>=30)strength+=1;
  if(cur.price5m>0)strength+=1;
  const trend=strength>=config.rapidWatchImprovingStrength?'IMPROVING':strength<=config.rapidWatchDeterioratingStrength?'DETERIORATING':'STALLED';
  return{trend,strength,mcPct,liqPct,scoreDelta,viralDelta,crossDelta,buyerDelta,volumePct};
}
function nextDelaySeconds(s,gate,traj){
  const gap=config.minScore-Number(s?.score||0);
  if(traj?.trend==='IMPROVING')return Math.max(5,config.rapidWatchHotRecheckSeconds);
  if(traj?.trend==='DETERIORATING')return Math.max(10,config.rapidWatchSlowRecheckSeconds);
  if(gap<=2)return Math.max(5,config.rapidWatchHotRecheckSeconds);
  if(gap<=config.rapidWatchScoreMargin)return Math.max(5,config.rapidWatchRecheckSeconds);
  if(isNewbornUnverified(s,gate))return Math.max(5,config.rapidWatchRecheckSeconds);
  return Math.max(10,config.rapidWatchSlowRecheckSeconds);
}
function suppress(address){suppressed.set(address,now()+Math.max(1,config.rapidWatchDropCooldownMinutes)*60_000)}
function prune(){
  const t=now();
  for(const [address,until] of suppressed){if(until<=t)suppressed.delete(address)}
  for(const [address,w] of watch){if(t-w.firstSeenAt>maxWatchMs()||w.ageMin>config.rapidWatchMaxAgeMinutes)watch.delete(address)}
  if(watch.size>config.rapidWatchMaxTokens){
    const rank=w=>((w.trend==='IMPROVING'?300:w.trend==='STALLED'?100:0)+w.bestScore+(w.last?.viral||0)+(w.last?.cross||0)*2);
    const sorted=[...watch.entries()].sort((a,b)=>rank(b[1])-rank(a[1])||a[1].nextCheckAt-b[1].nextCheckAt);
    for(const [address] of sorted.slice(config.rapidWatchMaxTokens))watch.delete(address);
  }
}
export function rapidWatchDueAddresses(){
  if(!config.rapidWatchEnabled)return[];
  prune();const t=now();
  const rank=w=>((w.trend==='IMPROVING'?300:w.trend==='STALLED'?100:0)+w.bestScore+(w.last?.viral||0)+(w.last?.cross||0)*2);
  return [...watch.entries()].filter(([,w])=>w.nextCheckAt<=t).sort((a,b)=>rank(b[1])-rank(a[1])||a[1].nextCheckAt-b[1].nextCheckAt).map(([address])=>address);
}
export function rapidWatchAllAddresses(){prune();return [...watch.keys()]}
export function rapidWatchStatus(){prune();const due=rapidWatchDueAddresses().length;const improving=[...watch.values()].filter(w=>w.trend==='IMPROVING').length;return{enabled:config.rapidWatchEnabled,count:watch.size,due,improving,max:config.rapidWatchMaxTokens}}
export function rapidWatchHasItems(){prune();return config.rapidWatchEnabled&&watch.size>0}
export function noteRapidWatch(s,gate){
  if(!config.rapidWatchEnabled||!s?.tokenAddress)return null;
  const address=s.tokenAddress,existing=watch.get(address),cur=snapshot(s);
  if(!existing&&Number(suppressed.get(address)||0)>now())return null;
  if(gate?.ok){if(existing){watch.delete(address);return{action:'qualified',symbol:s.symbol,score:s.score,previousScore:existing.lastScore,trend:existing.trend}}return null}
  if(isHardReject(s,gate)){
    if(existing){watch.delete(address);suppress(address)}
    return existing?{action:'dropped',symbol:s.symbol,score:s.score,why:`hard reject: ${gate.why}`,trend:'DETERIORATING'}:null;
  }
  const eligible=isClose(s)||isNewbornUnverified(s,gate);
  if(!eligible&&!existing)return null;
  const t=now();
  if(!existing){
    const delay=nextDelaySeconds(s,gate,null)*1000;
    const w={tokenAddress:address,symbol:s.symbol,firstSeenAt:t,lastCheckedAt:t,nextCheckAt:t+delay,lastScore:cur.score,bestScore:cur.score,checks:1,declines:0,stalledChecks:0,ageMin:s.ageMin,lastWhy:gate.why,last:cur,trend:'NEW',strength:0};
    watch.set(address,w);prune();
    return{action:'added',symbol:s.symbol,score:s.score,why:gate.why,nextSeconds:delay/1000,trend:'NEW'};
  }
  const previousScore=existing.lastScore,traj=trajectory(existing.last,cur),delta=cur.score-previousScore;
  const declines=delta<0?existing.declines+1:(traj.trend==='IMPROVING'?0:existing.declines);
  const stalledChecks=traj.trend==='STALLED'?existing.stalledChecks+1:0;
  const delay=nextDelaySeconds(s,gate,traj)*1000;
  Object.assign(existing,{symbol:s.symbol,lastCheckedAt:t,nextCheckAt:t+delay,lastScore:cur.score,bestScore:Math.max(existing.bestScore,cur.score),checks:existing.checks+1,declines,stalledChecks,ageMin:s.ageMin,lastWhy:gate.why,last:cur,trend:traj.trend,strength:traj.strength});
  if(t-existing.firstSeenAt>maxWatchMs()||s.ageMin>config.rapidWatchMaxAgeMinutes){watch.delete(address);suppress(address);return{action:'dropped',symbol:s.symbol,score:s.score,why:'watch window expired',trend:traj.trend}}
  if(declines>=config.rapidWatchMaxDeclines&&cur.score<config.minScore-config.rapidWatchScoreMargin){watch.delete(address);suppress(address);return{action:'dropped',symbol:s.symbol,score:s.score,why:'score deteriorated',trend:traj.trend}}
  const zeroLiquidity=cur.liquidity<=0;
  const oldEnough=Number(s.ageMin)>=config.rapidWatchZeroLiquidityDropAgeMinutes;
  const noGrowth=traj.mcPct<config.rapidWatchImprovingMcPct&&traj.viralDelta<=0&&traj.crossDelta<=0&&traj.buyerDelta<3&&traj.volumePct<30;
  if(zeroLiquidity&&oldEnough&&stalledChecks>=config.rapidWatchMaxStalledChecks&&noGrowth){watch.delete(address);suppress(address);return{action:'dropped',symbol:s.symbol,score:s.score,why:`stalled with $0 liquidity for ${stalledChecks} checks`,trend:'STALLED',trajectory:traj}}
  return{action:'updated',symbol:s.symbol,score:s.score,previousScore,delta,why:gate.why,nextSeconds:delay/1000,checks:existing.checks,trend:traj.trend,trajectory:traj};
}
