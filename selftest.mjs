import assert from 'node:assert/strict';
import { classifyHolderRisk } from './risk.mjs';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { dynamicRiskDecision, parseKey } from './live.mjs';
import { runnerMetrics } from './dexscreener.mjs';
import { earlyRunnerMarketScore } from './scoring.mjs';

const low=classifyHolderRisk({totalSupply:1000,holders:[100,70,60,50,40,30,20,20,20,20].map((amount,i)=>({owner:`w${i}`,amount}))});
assert.equal(low.holderRisk,'medium');
assert.equal(low.top1Pct,10);
const high=classifyHolderRisk({totalSupply:1000,holders:[250,100,80,60,50,20].map((amount,i)=>({owner:`h${i}`,amount}))});
assert.equal(high.holderRisk,'high');
const kp=Keypair.generate();
const secret=Buffer.from(kp.secretKey);
const cases=[
  ['base58',bs58.encode(secret)],
  ['base64',secret.toString('base64')],
  ['hex',secret.toString('hex')],
  ['json',JSON.stringify([...secret])]
];
for(const [name,encoded] of cases){
  const parsed=parseKey(encoded);
  assert.equal(parsed.keypair.publicKey.toBase58(),kp.publicKey.toBase58(),`${name} key parser mismatch`);
}
const maxed=dynamicRiskDecision({score:100,liquidityUsd:500000,lane:'Momentum Cat',hype:{bonus:15},risk:{bundleRisk:'low',holderRisk:'low',devRisk:'low',estimatedLinkedSupplyPct:0}});
assert.ok(maxed.pct<=30,'dynamic sizing must never exceed 30%');
const risky=dynamicRiskDecision({score:99,liquidityUsd:8000,lane:'Early Cat',hype:{bonus:15},risk:{bundleRisk:'medium',holderRisk:'medium',devRisk:'low',estimatedLinkedSupplyPct:8}});
assert.ok(risky.pct<=7,'risk/liquidity caps should shrink allocation');
const runner=runnerMetrics({pairCreatedAt:Date.now()-90*60000,marketCap:1600000,liquidityUsd:61700,volume5m:10000,volume1h:100000,buys5m:40,sells5m:20,priceChange5m:-8,priceChange1h:120});
assert.equal(runner.isRunner,true,'established 1h runner must be detected even after a 5m pullback');
const earlyProfile=earlyRunnerMarketScore({liquidityUsd:10000,volume5m:1800,volume1h:7200,buys5m:30,sells5m:15},{observed:true,liqGrowth:12});
assert.ok(earlyProfile.score>=60,'early accelerating runner should earn strong market points without mature raw volume');
const flatEarly=earlyRunnerMarketScore({liquidityUsd:10000,volume5m:250,volume1h:3000,buys5m:6,sells5m:6},{observed:false,liqGrowth:0});
assert.ok(flatEarly.score<earlyProfile.score,'flat early activity must not score like an accelerating runner');
console.log('Broke Cat V11.15 self-test passed');
