import {config} from './config.mjs';
import {analyzeRisk} from './risk.mjs';
import {runnerMetrics} from './dexscreener.mjs';

const clamp=x=>Math.max(0,Math.min(100,Math.round(x)));
const num=v=>Number(v??0)||0;

export function classifyLane(c){
  const age=c.pairCreatedAt?(Date.now()-c.pairCreatedAt)/60000:999999;
  if(age<=config.earlyMaxAgeMinutes&&c.marketCap<=config.earlyMaxMarketCap)return 'Early Cat';
  if(c.marketCap>=config.momentumMinMarketCap&&(c.volume5m>0||c.priceChange5m>0))return 'Momentum Cat';
  return 'Big Potential Cat';
}

// Early runners should be judged on velocity/quality of participation, not the same
// absolute 5m-volume bar used for established runners. This helper is exported so
// the profile can be regression-tested without touching network risk providers.
export function earlyRunnerMarketScore(c,runner={}){
  const buys=num(c.buys5m),sells=num(c.sells5m),trades=buys+sells;
  const buySell=sells>0?buys/sells:buys>0?99:0;
  const accel=num(c.volume1h)>0?num(c.volume5m)/(num(c.volume1h)/12):0;
  const avgTradeUsd=trades>0?num(c.volume5m)/trades:0;
  const volToLiq=num(c.liquidityUsd)>0?num(c.volume5m)/num(c.liquidityUsd):0;
  let score=0;const reasons=[];

  if(num(c.liquidityUsd)>=config.minLiquidity){score+=15;reasons.push('early liquidity +15')}

  // Age-aware absolute volume: useful, but deliberately lower weight than velocity.
  const v=num(c.volume5m);
  if(v>=config.earlyVolumeTopUsd){score+=10;reasons.push('early 5m volume +10')}
  else if(v>=config.earlyVolumeHighUsd){score+=8;reasons.push('early 5m volume +8')}
  else if(v>=config.earlyVolumeMidUsd){score+=6;reasons.push('early 5m volume +6')}
  else if(v>=config.earlyVolumeLowUsd){score+=3;reasons.push('early 5m volume +3')}

  // Acceleration matters more than the raw dollar level for a newborn market.
  if(accel>=config.earlyVolumeAccelStrong){score+=15;reasons.push(`early volume accel +15 (${accel.toFixed(1)}x)`)}
  else if(accel>=config.earlyVolumeAccelMin){score+=9;reasons.push(`early volume accel +9 (${accel.toFixed(1)}x)`)}

  if(buySell>=config.earlyBuySellStrong){score+=15;reasons.push(`early buy pressure +15 (${buySell.toFixed(1)}x)`)}
  else if(buySell>=config.earlyBuySellMin){score+=9;reasons.push(`early buy pressure +9 (${buySell.toFixed(1)}x)`)}

  // Participation quality proxy from available market data: require enough trades to
  // avoid a single-whale spike, then reward meaningful dollars per transaction.
  if(trades>=config.earlyParticipationMinTrades){
    if(avgTradeUsd>=config.earlyAvgTradeStrongUsd){score+=10;reasons.push(`participation quality +10 ($${avgTradeUsd.toFixed(0)}/trade)`)}
    else if(avgTradeUsd>=config.earlyAvgTradeMinUsd){score+=6;reasons.push(`participation quality +6 ($${avgTradeUsd.toFixed(0)}/trade)`)}
  }

  // Capital/liquidity velocity becomes available after a prior observation.
  const liqGrowth=num(runner?.liqGrowth);
  if(runner?.observed&&liqGrowth>=config.earlyLiquidityGrowthStrongPct){score+=15;reasons.push(`liquidity velocity +15 (${liqGrowth.toFixed(0)}%)`)}
  else if(runner?.observed&&liqGrowth>=config.earlyLiquidityGrowthMinPct){score+=8;reasons.push(`liquidity velocity +8 (${liqGrowth.toFixed(0)}%)`)}

  // Relative activity avoids treating $2k volume the same on $8k and $800k liquidity.
  if(volToLiq>=config.earlyVolLiqStrong&&volToLiq<=3){score+=10;reasons.push(`early vol/liq +10 (${volToLiq.toFixed(2)}x)`)}
  else if(volToLiq>=config.earlyVolLiqMin&&volToLiq<config.earlyVolLiqStrong){score+=6;reasons.push(`early vol/liq +6 (${volToLiq.toFixed(2)}x)`)}

  return{score,reasons,buySell,accel,trades,avgTradeUsd,volToLiq};
}

export function quickScore(c){
  const age=c.pairCreatedAt?(Date.now()-c.pairCreatedAt)/60000:Infinity;
  const lane=classifyLane(c);
  const bs=c.sells5m>0?c.buys5m/c.sells5m:c.buys5m>0?10:0;
  const accel=c.volume1h>0?c.volume5m/(c.volume1h/12):0;
  const runner=runnerMetrics(c);
  let q=0;
  if(age<=30)q+=15;else if(age<=240)q+=8;
  if(c.marketCap>=3000&&c.marketCap<=150000)q+=15;
  if(c.liquidityUsd>=config.minLiquidity)q+=15;
  if(lane==='Early Cat'&&age<=config.earlyRunnerProfileMaxAgeMinutes){
    const early=earlyRunnerMarketScore(c,runner);
    // Cheap discovery ranking uses the profile but caps its contribution so it
    // cannot crowd out established runners before full scoring/safety analysis.
    q+=Math.min(35,Math.round(early.score*0.45));
  }else{
    if(c.volume5m>=config.min5mVolume)q+=15;
    if(accel>=1.5)q+=15;
    if(bs>=1.5)q+=15;
  }
  if(c.priceChange5m>0)q+=10;
  if(c.priceChange1h>=config.runnerRadarMin1hChange)q+=15;
  if(runner.isRunner)q+=25;
  return clamp(q);
}

export async function scoreCandidate(c,hype={bonus:0},cross={bonus:0,sources:[]}){
  let score=0;const reasons=[];
  const lane=classifyLane(c);
  const ageMin=c.pairCreatedAt?(Date.now()-c.pairCreatedAt)/60000:Infinity;
  const buySell=c.sells5m>0?c.buys5m/c.sells5m:c.buys5m>0?99:0;
  const accel=c.volume1h>0?c.volume5m/(c.volume1h/12):0;
  const runner=c?.runnerRadar||runnerMetrics(c);
  const earlyProfile=lane==='Early Cat'&&ageMin<=config.earlyRunnerProfileMaxAgeMinutes;
  let earlyMarketScore=0;

  // Preserve the original core freshness/MC/momentum values.
  if(ageMin<=config.maxTokenAgeMinutes){score+=10;reasons.push(`fresh +10 (${ageMin.toFixed(1)}m)`)}
  if(c.marketCap>=config.minMarketCap&&c.marketCap<=config.maxMarketCap){score+=10;reasons.push('MC range +10')}
  if(c.priceChange5m>0&&c.priceChange5m<=35){score+=10;reasons.push('momentum +10')}

  if(earlyProfile){
    // Dedicated <=15m profile. Raw volume is a smaller signal; acceleration,
    // capital velocity and participation quality can make up the difference.
    const early=earlyRunnerMarketScore(c,runner);
    earlyMarketScore=early.score;
    score+=early.score;reasons.push(`EARLY RUNNER PROFILE <=${config.earlyRunnerProfileMaxAgeMinutes}m`,...early.reasons);
    if(ageMin<=10){score+=8;reasons.push('early-window age +8')}
    if(c.marketCap<=50000){score+=8;reasons.push('early-window MC +8')}
  }else{
    // Established profile keeps the stronger v7-style core values.
    if(c.liquidityUsd>=config.minLiquidity){score+=15;reasons.push('liquidity +15')}
    if(c.volume5m>=config.min5mVolume){score+=15;reasons.push('5m volume +15')}
    if(accel>=1.5){score+=15;reasons.push(`volume accel +15 (${accel.toFixed(1)}x)`)}
    if(buySell>=1.5){score+=15;reasons.push(`buy/sell +15 (${buySell.toFixed(1)}x)`)}
    if(c.volume5m>0&&c.liquidityUsd>0&&c.volume5m/c.liquidityUsd<=3){score+=10;reasons.push('volume/liquidity +10')}
    if(lane==='Early Cat'){
      if(ageMin<=10){score+=8;reasons.push('early-window age +8')}
      if(c.marketCap<=50000){score+=8;reasons.push('early-window MC +8')}
    }
  }

  score+=Number(hype?.bonus||0);if(hype?.bonus)reasons.push(`viral +${hype.bonus}`);
  score+=Number(cross?.bonus||0);if(cross?.bonus)reasons.push(`cross-platform +${cross.bonus} (${(cross.sources||[]).join(', ')})`);

  if(runner.isRunner){score+=Math.min(18,8+Math.round((runner.evidenceScore-60)/5));reasons.push(`runner evidence ${runner.evidenceScore}/100 (${runner.signals.slice(0,4).join(', ')})`)}
  else if(runner.evidenceScore>=40){score+=4;reasons.push(`runner watch ${runner.evidenceScore}/100`)}

  const preRiskScore=score;
  const deepSafety=preRiskScore>=config.deepSafetyMinScore||Boolean(c.platformTrending)||Boolean(runner.isRunner);
  const risk=await analyzeRisk(c,{deepSafety});
  // If Axiom-style bundle % is available, normalize the displayed/scored bundle class
  // to the explicit user policy: <5 low, 5–13 medium, >13 high. Keep the provider
  // heuristic for diagnostics, but do not let it silently override the numeric rule.
  if(Number.isFinite(Number(risk.bundlePct))){risk.bundleRiskHeuristic=risk.bundleRisk;const bp=Number(risk.bundlePct);risk.bundleRisk=bp>config.bundleSupplyHighPct?'high':bp>=config.bundleSupplyMediumPct?'medium':'low';}
  // v11.2 BALANCED ENTRY: safety data should inform the opportunity score,
  // not make ordinary meme-coin imperfections impossible to overcome.
  // Only explicit hard-stop conditions are enforced in entryAllowed below.
  if(risk.bundleRisk==='low'){score+=10;reasons.push('clean bundle/launch profile +10')}
  if(risk.bundleRisk==='medium'){score-=3;reasons.push('medium bundle risk -3')}
  // HIGH bundle is a hard stop (> configured threshold, default 13%), so do not
  // also destroy the opportunity score with a -40 double punishment.
  if(risk.bundleRisk==='high')reasons.push('HIGH bundle risk = hard safety stop (no score double-penalty)');

  if(risk.devRisk==='low'){score+=3;reasons.push('clean dev profile +3')}
  if(risk.devRisk==='medium'){score-=3;reasons.push('medium dev risk -3')}
  if(risk.devRisk==='high')reasons.push('HIGH dev risk = hard safety stop (no score double-penalty)');

  if(risk.holderRisk==='low'){score+=4;reasons.push('healthy holder distribution +4')}
  if(risk.holderRisk==='medium'){score-=2;reasons.push('medium holder concentration -2')}
  if(risk.holderRisk==='high'){score-=8;reasons.push('high holder concentration -8 (soft, not a veto)')}

  if(Number(risk.holderCount||0)>=100){score+=4;reasons.push(`${risk.holderCount} holders +4`)}
  // Axiom-style fields are primarily confirmation signals. Reward clean readings,
  // while suspicious readings remain visible without multiplying hard rules.
  if(Number.isFinite(risk.snipersPct)&&risk.snipersPct<=10){score+=2;reasons.push(`low snipers ${risk.snipersPct.toFixed(1)}% +2`)}
  if(Number.isFinite(risk.insidersPct)&&risk.insidersPct<=10){score+=2;reasons.push(`low insiders ${risk.insidersPct.toFixed(1)}% +2`)}

  return{...c,lane,ageMin,scoringProfile:earlyProfile?'EARLY_RUNNER':'ESTABLISHED',earlyMarketScore,score:clamp(score),risk,reasons,hype,crossPlatform:cross,runnerRadar:runner};
}

export function entryAllowed(s){
  // Keep only the safety rules that protect against obvious non-executable / rug-prone
  // entries. The rich Axiom-style fields otherwise influence score instead of creating
  // a growing list of vetoes.
  if(s.liquidityUsd<config.minLiquidity)return{ok:false,why:'liquidity below floor'};
  const bundlePct=Number(s.risk.bundlePct);const hasBundlePct=Number.isFinite(bundlePct);
  if(!hasBundlePct&&s.risk.bundleRisk==='unknown')return{ok:false,why:'bundle/launch risk unverified'};
  if(hasBundlePct&&bundlePct>config.bundleSupplyHighPct)return{ok:false,why:`bundle ${bundlePct.toFixed(1)}% > ${config.bundleSupplyHighPct}% hard limit`};
  // When Axiom-style numeric bundle data exists, use the user's explicit 13% rule as
  // source of truth rather than allowing a secondary heuristic to veto a <=13% token.
  if(!hasBundlePct&&s.risk.bundleRisk==='high')return{ok:false,why:'high bundle/launch risk'};
  if(s.risk.devRisk==='high')return{ok:false,why:'high dev risk'};

  // MICRO-CAP EARLY ENTRY: execution uses the same percentage-based wallet sizing. It still must be a
  // genuinely active <=15m market: earlyMarketScore excludes the safety bonuses, so a
  // dead token cannot qualify simply because bundle/dev readings are clean.
  const micro=config.microCapEntryEnabled
    &&s.scoringProfile==='EARLY_RUNNER'
    &&Number.isFinite(s.ageMin)&&s.ageMin<=config.microCapMaxAgeMinutes
    &&s.marketCap>=config.microCapMinMarketCap&&s.marketCap<=config.microCapMaxMarketCap
    &&s.score>=config.microCapMinScore
    &&Number(s.earlyMarketScore||0)>=config.microCapMinEarlyMarketScore;
  if(micro)return{ok:true,why:`micro-cap early entry ${s.score} >= ${config.microCapMinScore}`,entryMode:'MICRO'};

  if(s.score<config.minScore)return{ok:false,why:`score ${s.score} < ${config.minScore}`};
  return{ok:true,why:'confirmed entry',entryMode:'NORMAL'};
}
