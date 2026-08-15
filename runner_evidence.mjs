import fs from 'node:fs';
import path from 'node:path';
import {config} from './config.mjs';

const statePath=path.resolve(config.dataDir,'broke-cat-runner-evidence.json');
let state={tokens:{}};
try{const x=JSON.parse(fs.readFileSync(statePath,'utf8'));if(x&&x.tokens)state=x}catch{}
const num=v=>Number(v??0)||0;
const pct=(now,old)=>old>0?(now-old)/old*100:0;
const cap=(x,a,b)=>Math.max(a,Math.min(b,x));
function save(){try{fs.writeFileSync(statePath,JSON.stringify(state,null,2))}catch{}}
function prune(){const cutoff=Date.now()-Math.max(30,config.runnerSnapshotRetentionMinutes)*60_000;for(const [k,v] of Object.entries(state.tokens))if(num(v?.at)<cutoff)delete state.tokens[k]}

// Evidence score intentionally uses several independent signals rather than one magic threshold.
// It is a ranking heuristic, not a claim that any one value predicts future returns.
export function observeRunnerEvidence(c){
  const now=Date.now(),key=c.tokenAddress,prev=state.tokens[key]||null;
  const elapsedSec=prev?(now-num(prev.at))/1000:0;
  const buys=num(c.buys5m),sells=num(c.sells5m),trades=buys+sells;
  const buyShare=trades?buys/trades:0;
  const buySell=sells>0?buys/sells:buys>0?99:0;
  const baselineAccel=num(c.volume1h)>0?num(c.volume5m)/(num(c.volume1h)/12):0;
  const liqGrowth=prev&&elapsedSec>=config.runnerMinObservationSeconds?pct(num(c.liquidityUsd),num(prev.liquidityUsd)):0;
  const mcGrowth=prev&&elapsedSec>=config.runnerMinObservationSeconds?pct(num(c.marketCap),num(prev.marketCap)):0;
  const volGrowth=prev&&elapsedSec>=config.runnerMinObservationSeconds?pct(num(c.volume5m),num(prev.volume5m)):0;
  const tradeGrowth=prev&&elapsedSec>=config.runnerMinObservationSeconds?pct(trades,num(prev.trades)):0;
  const ageMin=c.pairCreatedAt?(now-c.pairCreatedAt)/60000:Infinity;
  const volToLiq=num(c.liquidityUsd)>0?num(c.volume5m)/num(c.liquidityUsd):0;

  let score=0;const signals=[];const warnings=[];
  // Capital/activity accumulation: strongest weight.
  if(liqGrowth>=10){score+=18;signals.push(`liq +${liqGrowth.toFixed(0)}%`)} else if(liqGrowth>=3){score+=10;signals.push(`liq +${liqGrowth.toFixed(0)}%`)} else if(liqGrowth<=-15){score-=14;warnings.push(`liq ${liqGrowth.toFixed(0)}%`)}
  if(mcGrowth>=20){score+=15;signals.push(`MC +${mcGrowth.toFixed(0)}%`)} else if(mcGrowth>=7){score+=8;signals.push(`MC +${mcGrowth.toFixed(0)}%`)} else if(mcGrowth<=-20){score-=10;warnings.push(`MC ${mcGrowth.toFixed(0)}%`)}
  if(volGrowth>=50){score+=14;signals.push(`5m vol +${volGrowth.toFixed(0)}%`)} else if(volGrowth>=15){score+=8;signals.push(`5m vol +${volGrowth.toFixed(0)}%`)}
  if(baselineAccel>=2.5){score+=15;signals.push(`vol accel ${baselineAccel.toFixed(1)}x`)} else if(baselineAccel>=1.5){score+=9;signals.push(`vol accel ${baselineAccel.toFixed(1)}x`)}

  // Participation breadth proxy available from DexScreener: many trades + balanced but buyer-led flow.
  if(trades>=150){score+=15;signals.push(`${trades} trades/5m`)} else if(trades>=80){score+=12;signals.push(`${trades} trades/5m`)} else if(trades>=config.runnerMinTrades5m){score+=7;signals.push(`${trades} trades/5m`)}
  if(buyShare>=0.62&&trades>=config.runnerMinTrades5m){score+=12;signals.push(`${(buyShare*100).toFixed(0)}% buys`)} else if(buyShare>=0.55&&trades>=config.runnerMinTrades5m){score+=7;signals.push(`${(buyShare*100).toFixed(0)}% buys`)}
  if(tradeGrowth>=40){score+=7;signals.push(`trades +${tradeGrowth.toFixed(0)}%`)}

  // Continuation/momentum, deliberately lower weight than accumulation/participation.
  if(num(c.priceChange1h)>=100){score+=18;signals.push(`1h +${num(c.priceChange1h).toFixed(0)}%`)} else if(num(c.priceChange1h)>=50){score+=12;signals.push(`1h +${num(c.priceChange1h).toFixed(0)}%`)} else if(num(c.priceChange1h)>=20){score+=8;signals.push(`1h +${num(c.priceChange1h).toFixed(0)}%`)}
  if(num(c.priceChange5m)>=8&&num(c.priceChange5m)<=60){score+=6;signals.push(`5m +${num(c.priceChange5m).toFixed(0)}%`)}
  if(volToLiq>=0.25&&volToLiq<=3){score+=8;signals.push(`5m vol/liq ${volToLiq.toFixed(2)}x`)} else if(volToLiq>=0.10&&volToLiq<0.25){score+=5;signals.push(`5m vol/liq ${volToLiq.toFixed(2)}x`)}

  // Fake/fragile momentum warnings. These reduce ranking but do not replace hard on-chain gates.
  if(trades<8&&num(c.priceChange5m)>20){score-=18;warnings.push('price spike on few trades')}
  if(buySell>8&&trades<25){score-=10;warnings.push('one-sided low-count flow')}
  if(volToLiq>5){score-=12;warnings.push(`5m vol/liquidity ${volToLiq.toFixed(1)}x`)}
  if(num(c.liquidityUsd)<config.runnerRadarMinLiquidity){score-=20;warnings.push('thin liquidity')}

  const eligible=config.runnerRadarEnabled&&ageMin<=config.runnerRadarMaxAgeMinutes&&num(c.marketCap)>=config.runnerRadarMinMarketCap&&num(c.marketCap)<=config.runnerRadarMaxMarketCap&&num(c.liquidityUsd)>=config.runnerRadarMinLiquidity&&num(c.volume5m)>=config.runnerRadarMin5mVolume;
  score=cap(Math.round(score),0,100);
  const observed=Boolean(prev&&elapsedSec>=config.runnerMinObservationSeconds);
  const isRunner=Boolean(eligible&&score>=config.runnerEvidenceThreshold);
  const strength=score>=config.runnerStrongEvidenceThreshold?'STRONG':score>=config.runnerEvidenceThreshold?'RUNNER':score>=40?'WATCH':'WEAK';
  state.tokens[key]={at:now,liquidityUsd:num(c.liquidityUsd),marketCap:num(c.marketCap),volume5m:num(c.volume5m),trades,priceUsd:num(c.priceUsd)};prune();save();
  return{isRunner,eligible,evidenceScore:score,strength,observed,elapsedSec,ageMin,buySell,buyShare,baselineAccel,liqGrowth,mcGrowth,volGrowth,tradeGrowth,trades,signals,warnings,triggers:signals};
}
