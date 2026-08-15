import assert from 'node:assert/strict';
import { classifyHolderRisk } from './risk.mjs';

const low=classifyHolderRisk({totalSupply:1000,holders:[100,70,60,50,40,30,20,20,20,20].map((amount,i)=>({owner:`w${i}`,amount}))});
assert.equal(low.holderRisk,'medium');
assert.equal(low.top1Pct,10);
const high=classifyHolderRisk({totalSupply:1000,holders:[250,100,80,60,50,20].map((amount,i)=>({owner:`h${i}`,amount}))});
assert.equal(high.holderRisk,'high');
console.log('Broke Cat V8 self-test passed');
