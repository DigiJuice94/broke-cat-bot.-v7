import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bs58 from 'bs58';
import {Keypair,VersionedTransaction} from '@solana/web3.js';
import {config,SOL_MINT,liveConfigStatus} from './config.mjs';

const BASE='https://api.jup.ag/swap/v2';
const LAMPORTS_PER_SOL=1_000_000_000;
const statePath=path.resolve(config.dataDir,'broke-cat-live-state.json');
fs.mkdirSync(config.dataDir,{recursive:true});
const today=()=>new Date().toISOString().slice(0,10);
const rawRatio=(a,b)=>{a=BigInt(a);b=BigInt(b);if(b===0n)return 0;return Number((a*1000000n)/b)/1000000};

export function parseKey(raw){
  const value=String(raw||'').trim();
  if(!value)throw new Error('BS58_PRIVATE_KEY is empty');

  const makeKeypair=(bytes,format)=>{
    if(bytes.length===64)return {keypair:Keypair.fromSecretKey(Uint8Array.from(bytes)),format};
    if(bytes.length===32)return {keypair:Keypair.fromSeed(Uint8Array.from(bytes)),format};
    throw new Error(`Decoded ${format} private key is ${bytes.length} bytes; expected a 32-byte seed or 64-byte Solana secret key`);
  };

  // JSON byte array: [12,34,...]
  if(value.startsWith('[')){
    let arr;
    try{arr=JSON.parse(value)}catch{throw new Error('Private key looks like a JSON byte array but could not be parsed')}
    if(!Array.isArray(arr)||!arr.every(n=>Number.isInteger(n)&&n>=0&&n<=255))throw new Error('Private-key JSON array must contain only byte values 0-255');
    return makeKeypair(Uint8Array.from(arr),'json-array');
  }

  // Hex, with or without 0x.
  const hex=value.startsWith('0x')?value.slice(2):value;
  if(/^[0-9a-fA-F]+$/.test(hex)&&hex.length%2===0){
    const bytes=Uint8Array.from(Buffer.from(hex,'hex'));
    if(bytes.length===32||bytes.length===64)return makeKeypair(bytes,'hex');
  }

  // PEM PKCS#8 Ed25519 private key.
  const fromPkcs8=(der,format)=>{
    try{
      const obj=crypto.createPrivateKey({key:Buffer.from(der),format:'der',type:'pkcs8'});
      const jwk=obj.export({format:'jwk'});
      if(jwk?.kty!=='OKP'||jwk?.crv!=='Ed25519'||!jwk?.d)throw new Error('not an Ed25519 PKCS#8 key');
      const seed=Buffer.from(jwk.d.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-jwk.d.length%4)%4),'base64');
      if(seed.length!==32)throw new Error(`PKCS#8 Ed25519 seed is ${seed.length} bytes, expected 32`);
      return makeKeypair(seed,format);
    }catch{return null}
  };
  if(value.includes('BEGIN PRIVATE KEY')){
    try{
      const obj=crypto.createPrivateKey(value);
      const jwk=obj.export({format:'jwk'});
      if(jwk?.kty==='OKP'&&jwk?.crv==='Ed25519'&&jwk?.d){
        const d=jwk.d; const seed=Buffer.from(d.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-d.length%4)%4),'base64');
        return makeKeypair(seed,'pem-pkcs8');
      }
    }catch{}
  }

  // Standard/base64url. Trust Wallet exports may contain +, / and =.
  // Besides raw 32/64-byte keys, accept an Ed25519 PKCS#8 DER container.
  const looksBase64=/^[A-Za-z0-9+/_-]+={0,2}$/.test(value) && (/[+/=_-]/.test(value) || value.length%4===0);
  if(looksBase64){
    try{
      const normalized=value.replace(/-/g,'+').replace(/_/g,'/');
      const padded=normalized+'='.repeat((4-normalized.length%4)%4);
      const bytes=Uint8Array.from(Buffer.from(padded,'base64'));
      if(bytes.length===32||bytes.length===64)return makeKeypair(bytes,'base64');
      const pkcs8=fromPkcs8(bytes,'base64-pkcs8');
      if(pkcs8)return pkcs8;
      throw new Error(`base64 decoded to ${bytes.length} bytes, not a raw 32/64-byte key or Ed25519 PKCS#8 container`);
    }catch{}
  }

  // Base58 remains the normal Solana CLI/export format.
  try{
    const bytes=bs58.decode(value);
    return makeKeypair(bytes,'base58');
  }catch(err){
    throw new Error(`Unsupported Solana private-key format. V9 accepts base58, raw/base64url, hex, JSON byte arrays, and Ed25519 PKCS#8/PEM keys. ${err?.message||''}`.trim());
  }
}
function wallet(){
  const status=liveConfigStatus();
  if(!status.ready)throw new Error(`Live mode not armed: missing ${status.missing.join(', ')}`);
  return parseKey(config.bs58PrivateKey).keypair;
}
function rpcUrl(){return `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(config.heliusApiKey)}`}
const SOLANA_PUBLIC_RPC='https://api.mainnet-beta.solana.com';
async function rpcAt(url,label,method,params=[]){
  const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
  if(!r.ok)throw new Error(`${label} RPC ${r.status}: ${await r.text()}`);
  const j=await r.json();if(j.error)throw new Error(`${label} RPC ${method}: ${j.error.message||JSON.stringify(j.error)}`);return j.result;
}
async function rpc(method,params=[]){return rpcAt(rpcUrl(),'Helius',method,params)}
async function solBalanceCrossCheck(address){
  const params=[address,{commitment:'confirmed'}];
  const [helius,publicRpc]=await Promise.allSettled([rpcAt(rpcUrl(),'Helius','getBalance',params),rpcAt(SOLANA_PUBLIC_RPC,'Solana public','getBalance',params)]);
  const h=helius.status==='fulfilled'?Number(helius.value?.value||0):null;
  const p=publicRpc.status==='fulfilled'?Number(publicRpc.value?.value||0):null;
  const candidates=[['helius',h],['solana-public',p]].filter(([,v])=>Number.isFinite(v));
  if(!candidates.length)throw new Error(`Could not read SOL balance from Helius or Solana public RPC. Helius: ${helius.reason?.message||'failed'} | Public: ${publicRpc.reason?.message||'failed'}`);
  candidates.sort((a,b)=>b[1]-a[1]);
  return {lamports:candidates[0][1],source:candidates[0][0],heliusLamports:h,publicLamports:p};
}

export async function solUsdPrice(){
  const r=await fetch(`https://api.dexscreener.com/token-pairs/v1/solana/${SOL_MINT}`,{headers:{accept:'application/json'}});
  if(!r.ok)throw new Error(`Could not fetch SOL/USD price: DEX Screener ${r.status}`);
  const rows=await r.json();
  const pairs=(Array.isArray(rows)?rows:[]).filter(p=>Number(p?.priceUsd)>0).sort((a,b)=>Number(b?.liquidity?.usd||0)-Number(a?.liquidity?.usd||0));
  const price=Number(pairs[0]?.priceUsd||0);
  if(!price)throw new Error('Could not determine SOL/USD price');
  return price;
}
export function loadLiveState(){
  if(fs.existsSync(statePath)){
    const s=JSON.parse(fs.readFileSync(statePath,'utf8'));
    if(s.day!==today()){s.day=today();s.dailyPnl=0}
    if(!Array.isArray(s.moonBags))s.moonBags=[];
    if(s.lastXIdlePostAt===undefined)s.lastXIdlePostAt=null;
    return s;
  }
  return {day:today(),dailyPnl:0,realizedPnl:0,position:null,moonBags:[],trades:[],lastXDailyReportDay:null,lastXIdlePostAt:null};
}
export function saveLiveState(s){fs.writeFileSync(statePath,JSON.stringify(s,null,2))}
export function liveStateFilePath(){return statePath}
export function walletAddress(){try{return wallet().publicKey.toBase58()}catch{return null}}
export async function walletSnapshot(){
  const w=wallet().publicKey.toBase58();
  if(config.expectedWalletAddress && w!==config.expectedWalletAddress){
    throw new Error(`WALLET ADDRESS MISMATCH: key derives ${w}, but EXPECTED_WALLET_ADDRESS is ${config.expectedWalletAddress}. Live trading blocked.`);
  }
  const bal=await solBalanceCrossCheck(w);
  const sol=Number(bal.lamports||0)/LAMPORTS_PER_SOL;
  const solUsd=await solUsdPrice();
  return {address:w,sol,solUsd,solValueUsd:sol*solUsd,balanceSource:bal.source,heliusLamports:bal.heliusLamports,publicLamports:bal.publicLamports};
}
export async function assertLiveFunding(){
  const snap=await walletSnapshot();
  console.log(`Wallet diagnostic | derived ${snap.address} | Helius ${snap.heliusLamports==null?'ERR':(snap.heliusLamports/LAMPORTS_PER_SOL).toFixed(6)} SOL | Public RPC ${snap.publicLamports==null?'ERR':(snap.publicLamports/LAMPORTS_PER_SOL).toFixed(6)} SOL | using ${snap.balanceSource}`);
  const startupPct=config.positionSizingMode==='dynamic'?Math.min(30,Math.max(0,config.dynamicMinPositionPct)):config.targetPositionPct;
  const startupTargetUsd=config.positionSizingMode==='dynamic'?snap.solValueUsd*(startupPct/100):config.positionSizingMode==='percent'?Math.min(config.maxPositionUsd,snap.solValueUsd*(config.targetPositionPct/100)):config.livePositionUsd;
  const tradeSol=startupTargetUsd/snap.solUsd;const needed=tradeSol+config.minSolReserve;
  if(snap.sol<needed)throw new Error(`Live wallet needs about ${needed.toFixed(6)} SOL (~$${startupTargetUsd.toFixed(2)} target trade + ${config.minSolReserve} SOL reserve). Found ${snap.sol.toFixed(6)} SOL (~$${snap.solValueUsd.toFixed(2)}).`);
  return {...snap,tradeSolRequired:tradeSol};
}
async function jupiterSwap(inputMint,outputMint,amountRaw){
  const signer=wallet();
  const params=new URLSearchParams({inputMint,outputMint,amount:String(amountRaw),taker:signer.publicKey.toBase58()});
  const orderRes=await fetch(`${BASE}/order?${params}`,{headers:{'x-api-key':config.jupiterApiKey}});
  if(!orderRes.ok)throw new Error(`Jupiter /order ${orderRes.status}: ${await orderRes.text()}`);
  const order=await orderRes.json();
  if(!order.transaction)throw new Error(`Jupiter could not build swap: ${order.errorMessage||order.errorCode||'no transaction'}`);
  const tx=VersionedTransaction.deserialize(Buffer.from(order.transaction,'base64'));
  tx.sign([signer]);
  const signedTransaction=Buffer.from(tx.serialize()).toString('base64');
  const execRes=await fetch(`${BASE}/execute`,{method:'POST',headers:{'content-type':'application/json','x-api-key':config.jupiterApiKey},body:JSON.stringify({signedTransaction,requestId:order.requestId})});
  if(!execRes.ok)throw new Error(`Jupiter /execute ${execRes.status}: ${await execRes.text()}`);
  const result=await execRes.json();
  if(result.status!=='Success')throw new Error(`Jupiter swap failed code ${result.code}: ${result.error||'unknown error'}${result.signature?` tx ${result.signature}`:''}`);
  return {order,result,inputRaw:String(result.inputAmountResult||amountRaw),outputRaw:String(result.outputAmountResult||order.outAmount),signature:result.signature};
}

async function jupiterExitQuote(tokenMint,amountRaw){
  const signer=wallet();
  const params=new URLSearchParams({inputMint:tokenMint,outputMint:SOL_MINT,amount:String(amountRaw),taker:signer.publicKey.toBase58()});
  const r=await fetch(`${BASE}/order?${params}`,{headers:{'x-api-key':config.jupiterApiKey}});
  if(!r.ok)throw new Error(`Jupiter exit check ${r.status}: ${await r.text()}`);
  const order=await r.json();
  const outRaw=Number(order?.outAmount||0);
  if(!Number.isFinite(outRaw)||outRaw<=0)throw new Error(order?.errorMessage||order?.errorCode||'no executable output');
  return {outRaw,order};
}

export function classifyLiquidityGuard({dropPct,confirmations,exitEfficiencyPct,retPct,buySellRatio,currentLiquidityUsd}){
  const warn=config.liquidityWarningDropPct,danger=config.liquidityDangerDropPct,critical=config.liquidityCriticalDropPct;
  if(dropPct<warn)return{level:'normal',exit:false,reason:null};
  if(dropPct<danger)return{level:'warning',exit:false,reason:null};
  const sellPressure=Number.isFinite(buySellRatio)&&buySellRatio<config.liquidityMinBuySellRatio;
  const priceWeak=retPct<=config.liquidityConfirmPriceDropPct;
  const quoteWeak=Number.isFinite(exitEfficiencyPct)&&exitEfficiencyPct<config.liquidityMinExitEfficiencyPct;
  const quoteBad=Number.isFinite(exitEfficiencyPct)&&exitEfficiencyPct<config.liquidityCriticalExitEfficiencyPct;
  const veryThin=currentLiquidityUsd>0&&currentLiquidityUsd<config.minLiquidity;
  if(dropPct<critical){
    const confirmed=confirmations>=config.liquidityConfirmationsRequired;
    return{level:'danger',exit:confirmed&&(quoteWeak||priceWeak||sellPressure),reason:confirmed&&(quoteWeak||priceWeak||sellPressure)?`CONFIRMED LIQUIDITY DANGER -${dropPct.toFixed(0)}%`:null};
  }
  const confirmed=confirmations>=Math.max(2,config.liquidityCriticalConfirmationsRequired);
  return{level:'critical',exit:confirmed&&(quoteBad||priceWeak||sellPressure||veryThin),reason:confirmed&&(quoteBad||priceWeak||sellPressure||veryThin)?`CONFIRMED LIQUIDITY CRITICAL -${dropPct.toFixed(0)}%`:null};
}
function dynamicAllocationDecision(candidate){
  // Dynamic sizing deliberately separates eligibility from allocation. Hard safety gates
  // still decide whether a token may be traded; this only decides how much of the wallet
  // an already-approved candidate may receive.
  const score=Number(candidate?.score||0),risk=candidate?.risk||{},hype=Number(candidate?.hype?.bonus||0),liq=Number(candidate?.liquidityUsd||0);
  let pct=5;
  if(score>=88)pct=8;
  if(score>=91)pct=12;
  if(score>=94)pct=18;
  if(score>=97)pct=24;
  if(score>=99)pct=28;
  if(hype>=10&&score>=90)pct+=2;
  if(candidate?.lane==='Pre-Launch Priority'&&hype>=8)pct+=2;

  // Risk caps: medium launch/holder risk or thin liquidity can only reduce allocation.
  let riskLevel='LOW';
  const caps=[];
  if(risk.bundleRisk==='medium'){caps.push(10);riskLevel='HIGH'}
  if(risk.holderRisk==='medium'){caps.push(12);riskLevel=riskLevel==='HIGH'?'HIGH':'MEDIUM'}
  const linked=Number(risk.estimatedLinkedSupplyPct);
  if(Number.isFinite(linked)){if(linked>=8){caps.push(7);riskLevel='HIGH'}else if(linked>=5){caps.push(12);riskLevel='MEDIUM'}else if(linked>=2){caps.push(20);if(riskLevel==='LOW')riskLevel='MEDIUM'}}
  if(liq>0){if(liq<10000){caps.push(5);riskLevel='HIGH'}else if(liq<25000){caps.push(10);if(riskLevel==='LOW')riskLevel='MEDIUM'}else if(liq<50000)caps.push(15);else if(liq<100000)caps.push(20)}
  if(caps.length)pct=Math.min(pct,...caps);

  const configuredMax=Math.min(30,Math.max(1,Number(config.dynamicMaxPositionPct||30)));
  const configuredMin=Math.min(configuredMax,Math.max(0.5,Number(config.dynamicMinPositionPct||5)));
  pct=Math.max(configuredMin,Math.min(configuredMax,pct));
  return {pct,riskLevel,score,hype,liquidityUsd:liq};
}
export async function positionSizeUsd(candidate,snap){
  let target=config.livePositionUsd,decision={pct:null,riskLevel:'FIXED'};
  if(config.positionSizingMode==='dynamic'){
    decision=dynamicAllocationDecision(candidate);
    // Size against the current wallet value every entry. No fixed-dollar ceiling is
    // applied unless DYNAMIC_MAX_POSITION_USD is explicitly set above zero.
    target=snap.solValueUsd*(decision.pct/100);
    if(config.dynamicMaxPositionUsd>0)target=Math.min(target,config.dynamicMaxPositionUsd);
  }else if(config.positionSizingMode==='percent'){
    target=snap.solValueUsd*(config.targetPositionPct/100);
    target=Math.min(target,config.maxPositionUsd);
  }else target=Math.min(target,config.maxPositionUsd);
  if(candidate?.liquidityUsd>0)target=Math.min(target,candidate.liquidityUsd*(config.maxPositionToLiquidityPct/100));
  const spendableUsd=Math.max(0,(snap.sol-config.minSolReserve)*snap.solUsd);
  return {usd:Math.max(0,Math.min(target,spendableUsd)),decision};
}
export function dynamicRiskDecision(candidate){return dynamicAllocationDecision(candidate)}
export async function openLive(s,c){
  if(s.position)throw new Error('Live position already open');
  if(s.dailyPnl<=-config.maxDailyLoss)throw new Error('Daily loss limit reached');
  const snap=await walletSnapshot();
  const sizing=await positionSizeUsd(c,snap);const sizeUsd=sizing.usd;
  if(sizeUsd<0.50)throw new Error(`Not enough spendable SOL after reserve. Wallet has ${snap.sol.toFixed(6)} SOL (~$${snap.solValueUsd.toFixed(2)})`);
  const sizeSol=sizeUsd/snap.solUsd,amountRaw=Math.floor(sizeSol*LAMPORTS_PER_SOL);
  const swap=await jupiterSwap(SOL_MINT,c.tokenAddress,amountRaw);
  const actualCostSol=Number(swap.inputRaw)/LAMPORTS_PER_SOL,actualCostUsd=actualCostSol*snap.solUsd;
  const original=String(swap.outputRaw);
  s.position={pairAddress:c.pairAddress,tokenAddress:c.tokenAddress,symbol:c.symbol,lane:c.lane,entryPrice:c.priceUsd,entryLiquidityUsd:c.liquidityUsd,highPrice:c.priceUsd,lastPrice:c.priceUsd,costSol:actualCostSol,costUsd:actualCostUsd,entrySolUsd:snap.solUsd,originalTokenAmountRaw:original,tokenAmountRaw:original,openedAt:new Date().toISOString(),buySignature:swap.signature,score:c.score,hype:c.hype||{},allocationPct:sizing.decision?.pct??null,riskLevel:sizing.decision?.riskLevel||'FIXED',tiersDone:[],realizedFromPositionUsd:0,lastRiskCheckAt:0,lastLiquidityCheckAt:0,liquidityGuard:{confirmations:0,lastDropPct:0,lastLevel:'normal',lastCheckedAt:null,lastExitEfficiencyPct:null,bestPairAddress:c.pairAddress}};
  s.trades.push({type:'BUY',mode:'LIVE',symbol:c.symbol,lane:c.lane,tokenAddress:c.tokenAddress,costSol:actualCostSol,costUsd:actualCostUsd,allocationPct:sizing.decision?.pct??null,riskLevel:sizing.decision?.riskLevel||'FIXED',tokenAmountRaw:original,price:c.priceUsd,score:c.score,hype:c.hype||{},signature:swap.signature,at:new Date().toISOString()});
  saveLiveState(s);return{message:`LIVE BUY ~${actualCostSol.toFixed(6)} SOL (~$${actualCostUsd.toFixed(2)}) ${c.symbol} | ${c.lane}${sizing.decision?.pct?` | ${sizing.decision.pct.toFixed(1)}% wallet | risk ${sizing.decision.riskLevel}`:''} | tx ${swap.signature}`,signature:swap.signature,allocationPct:sizing.decision?.pct??null,riskLevel:sizing.decision?.riskLevel||'FIXED'};
}
function pctMove(p,price){return(price/p.entryPrice-1)*100}
export function positionAction(s,price){
  const p=s.position;if(!p||price<=0)return null;p.highPrice=Math.max(Number(p.highPrice)||p.entryPrice,price);p.lastPrice=price;const ret=pctMove(p,price);
  if(ret<=-config.hardStopPct)return{type:'full',reason:`HARD STOP -${config.hardStopPct}%`};
  for(let i=0;i<config.profitTiers.length;i++){const t=config.profitTiers[i];if(ret>=t.gain&&!p.tiersDone.includes(i))return{type:'partial',tier:i,sellPct:t.sell,reason:`TP${i+1} +${t.gain}%`};}
  saveLiveState(s);return null;
}
async function sellRawInChunks(p,rawAmount,estimatedUsd){
  let remaining=BigInt(rawAmount),receivedRaw=0n,lastSig=null;const chunks=Math.max(1,Math.ceil(Math.max(0,estimatedUsd)/Math.max(1,config.maxExitChunkUsd)));
  for(let i=0;i<chunks&&remaining>0n;i++){const left=BigInt(chunks-i);const chunk=remaining/left;const swap=await jupiterSwap(p.tokenAddress,SOL_MINT,chunk.toString());remaining-=chunk;receivedRaw+=BigInt(swap.outputRaw);lastSig=swap.signature;if(chunks>1)await new Promise(r=>setTimeout(r,1200));}
  return{outputRaw:receivedRaw.toString(),signature:lastSig};
}
export async function partialTakeProfit(s,action){
  const p=s.position;if(!p)throw new Error('No live position');const original=BigInt(p.originalTokenAmountRaw),remaining=BigInt(p.tokenAmountRaw);let raw=original*BigInt(Math.round(action.sellPct*100))/10000n;if(raw>remaining)raw=remaining;if(raw<=0n)throw new Error('Partial sell amount is zero');
  const estimatedUsd=p.costUsd*(Number(action.sellPct)/100)*(p.lastPrice/p.entryPrice);const swap=await sellRawInChunks(p,raw.toString(),estimatedUsd);const receivedSol=Number(swap.outputRaw)/LAMPORTS_PER_SOL,currentSolUsd=await solUsdPrice(),receivedUsd=receivedSol*currentSolUsd;const costBasis=p.costUsd*rawRatio(raw,original);const pnlUsd=receivedUsd-costBasis;
  p.tokenAmountRaw=(remaining-raw).toString();p.tiersDone.push(action.tier);p.realizedFromPositionUsd=Number(p.realizedFromPositionUsd||0)+pnlUsd;s.realizedPnl+=pnlUsd;s.dailyPnl+=pnlUsd;
  const remainingPct=rawRatio(p.tokenAmountRaw,original)*100;
  let moonBagDetached=false;
  // After the final scheduled profit tier, detach the remaining moon bag from the
  // active trading slot so Broke Cat can keep scanning and open a new opportunity.
  if(action.tier===config.profitTiers.length-1&&remainingPct<=config.moonBagPct+1){
    s.moonBags=s.moonBags||[];
    s.moonBags.push({symbol:p.symbol,tokenAddress:p.tokenAddress,pairAddress:p.pairAddress,lane:p.lane,entryPrice:p.entryPrice,lastPrice:p.lastPrice,costUsd:p.costUsd,originalTokenAmountRaw:p.originalTokenAmountRaw,tokenAmountRaw:p.tokenAmountRaw,buySignature:p.buySignature,createdAt:new Date().toISOString(),lastUpdatedAt:new Date().toISOString()});
    s.position=null;moonBagDetached=true;
  }
  s.trades.push({type:'PARTIAL_SELL',mode:'LIVE',symbol:p.symbol,lane:p.lane,sellPct:action.sellPct,reason:action.reason,receivedSol,receivedUsd,pnlUsd,signature:swap.signature,remainingTokenAmountRaw:p.tokenAmountRaw,moonBagDetached,at:new Date().toISOString()});saveLiveState(s);
  return{message:`LIVE TAKE PROFIT ${p.symbol}: ${action.reason} | sold ${action.sellPct}% original | received ${receivedSol.toFixed(6)} SOL (~$${receivedUsd.toFixed(2)}) | realized ${pnlUsd>=0?'+':''}$${pnlUsd.toFixed(2)}${moonBagDetached?' | moon bag detached 🌙':''}`,symbol:p.symbol,pnlUsd,receivedUsd,sellPct:action.sellPct,remainingPct,moonBagDetached,signature:swap.signature};
}
export async function emergencyRiskReason(s,pair,analyzeRiskFn){
  const p=s.position;if(!p)return null;
  const now=Date.now();
  const best=pair;

  // index.mjs resolves the token's current highest-liquidity pool every loop. If the
  // best pool changes, follow it instead of treating the old pool as a rug by itself.
  if(best?.pairAddress&&best.pairAddress!==p.pairAddress){
    console.log(`🐱 LIQUIDITY MIGRATION ${p.symbol} | ${p.pairAddress} -> ${best.pairAddress} | best liq $${Number(best.liquidityUsd||0).toFixed(0)}`);
    p.pairAddress=best.pairAddress;
  }
  if(best?.priceUsd>0){p.lastPrice=best.priceUsd;p.highPrice=Math.max(Number(p.highPrice)||p.entryPrice,best.priceUsd)}

  // Expensive on-chain risk is rechecked on its own slower clock. These hard safety
  // changes stay independent from the new liquidity confirmation logic.
  if(now-Number(p.lastRiskCheckAt||0)>=config.positionRiskRecheckSeconds*1000){
    p.lastRiskCheckAt=now;
    try{
      const risk=await analyzeRiskFn({...best,tokenAddress:p.tokenAddress});
      if(risk.bundleRisk==='high')return'BUNDLE/LINKED-WALLET RISK TURNED HIGH';
      if(risk.devRisk==='high')return'DEV/MINT RISK TURNED HIGH';
      if(risk.holderRisk==='high')return'HOLDER CONCENTRATION TURNED HIGH';
    }catch{}
  }

  // Liquidity is checked much faster than the full Helius risk scan so a true rug is
  // not forced to wait several minutes for confirmation.
  if(now-Number(p.lastLiquidityCheckAt||0)<config.liquidityRecheckSeconds*1000){saveLiveState(s);return null}
  p.lastLiquidityCheckAt=now;
  const entryLiq=Number(p.entryLiquidityUsd||0),currentLiq=Number(best?.liquidityUsd||0);
  if(entryLiq<=0||currentLiq<=0){saveLiveState(s);return null}
  const dropPct=Math.max(0,(1-currentLiq/entryLiq)*100);
  p.liquidityGuard=p.liquidityGuard||{confirmations:0,lastDropPct:0,lastLevel:'normal'};
  const g=p.liquidityGuard;
  if(dropPct<config.liquidityWarningDropPct){g.confirmations=0;g.lastLevel='normal';g.lastDropPct=dropPct;g.lastCheckedAt=new Date().toISOString();saveLiveState(s);return null}
  g.confirmations=Number(g.confirmations||0)+1;g.lastDropPct=dropPct;g.lastCheckedAt=new Date().toISOString();g.bestPairAddress=best?.pairAddress||p.pairAddress;

  // Ask Jupiter what the entire remaining position could receive WITHOUT signing or
  // executing. A healthy quote can veto a false liquidity panic.
  let exitEfficiencyPct=NaN;
  try{
    const q=await jupiterExitQuote(p.tokenAddress,p.tokenAmountRaw);
    const solUsd=await solUsdPrice();
    const quotedUsd=(q.outRaw/LAMPORTS_PER_SOL)*solUsd;
    const markedUsd=p.costUsd*rawRatio(p.tokenAmountRaw,p.originalTokenAmountRaw)*(Number(best?.priceUsd||p.lastPrice||p.entryPrice)/p.entryPrice);
    if(markedUsd>0)exitEfficiencyPct=quotedUsd/markedUsd*100;
    g.lastExitEfficiencyPct=Number.isFinite(exitEfficiencyPct)?exitEfficiencyPct:null;
    g.lastQuoteError=null;
  }catch(err){g.lastQuoteError=String(err?.message||err).slice(0,180)}

  const buys=Number(best?.buys5m||0),sells=Number(best?.sells5m||0);const buySellRatio=sells>0?buys/sells:(buys>0?99:1);
  const retPct=pctMove(p,Number(best?.priceUsd||p.lastPrice||p.entryPrice));
  const decision=classifyLiquidityGuard({dropPct,confirmations:g.confirmations,exitEfficiencyPct,retPct,buySellRatio,currentLiquidityUsd:currentLiq});
  g.lastLevel=decision.level;
  console.log(`🐱 LIQUIDITY ${decision.level.toUpperCase()} ${p.symbol} | drop ${dropPct.toFixed(1)}% | best liq $${currentLiq.toFixed(0)} | checks ${g.confirmations} | exit efficiency ${Number.isFinite(exitEfficiencyPct)?exitEfficiencyPct.toFixed(1)+'%':'n/a'} | return ${retPct.toFixed(1)}% | buys/sells ${buys}/${sells} | ${decision.exit?'EXIT':'HOLD'}`);
  saveLiveState(s);
  return decision.exit?decision.reason:null;
}
export async function closeLive(s,reason){
  const p=s.position;if(!p)throw new Error('No live position');const remaining=BigInt(p.tokenAmountRaw);if(remaining<=0n)throw new Error('No live tokens remaining');const estimatedUsd=p.costUsd*rawRatio(remaining,p.originalTokenAmountRaw)*(p.lastPrice/p.entryPrice);const swap=await sellRawInChunks(p,remaining.toString(),estimatedUsd);const receivedSol=Number(swap.outputRaw)/LAMPORTS_PER_SOL,currentSolUsd=await solUsdPrice(),receivedUsd=receivedSol*currentSolUsd;const remainingCostBasis=p.costUsd*rawRatio(remaining,p.originalTokenAmountRaw);const pnlUsd=receivedUsd-remainingCostBasis,pnlSol=receivedSol-p.costSol*rawRatio(remaining,p.originalTokenAmountRaw);
  s.realizedPnl+=pnlUsd;s.dailyPnl+=pnlUsd;s.trades.push({type:'SELL',mode:'LIVE',symbol:p.symbol,lane:p.lane,tokenAddress:p.tokenAddress,receivedSol,receivedUsd,pnlUsd,pnlSol,reason,signature:swap.signature,at:new Date().toISOString()});s.position=null;saveLiveState(s);return{message:`LIVE SELL ${p.symbol}: ${reason} | received ${receivedSol.toFixed(6)} SOL (~$${receivedUsd.toFixed(2)}) | P&L ${pnlUsd>=0?'+':''}$${pnlUsd.toFixed(2)}`,pnlUsd,pnlSol,receivedSol,receivedUsd,signature:swap.signature,symbol:p.symbol};
}
export function tradeStatsLive(s){const sells=s.trades.filter(t=>t.type==='SELL'||t.type==='PARTIAL_SELL');return{totalTrades:sells.length,wins:sells.filter(t=>Number(t.pnlUsd)>0).length,losses:sells.filter(t=>Number(t.pnlUsd)<0).length}}
export async function walletEquitySnapshot(s,currentPrice=null){const snap=await walletSnapshot();let openPositionUsd=0;if(s?.position){const p=s.position;const px=Number(currentPrice||p.lastPrice||p.entryPrice);const ratio=rawRatio(p.tokenAmountRaw,p.originalTokenAmountRaw);openPositionUsd=Math.max(0,p.costUsd*ratio*(px/p.entryPrice));}let moonBagUsd=0;for(const m of (s?.moonBags||[])){const px=Number(m.lastPrice||m.entryPrice),ratio=rawRatio(m.tokenAmountRaw,m.originalTokenAmountRaw);moonBagUsd+=Math.max(0,Number(m.costUsd||0)*ratio*(px/Number(m.entryPrice||px||1)));}return{...snap,openPositionUsd,moonBagUsd,totalWalletUsd:snap.solValueUsd+openPositionUsd+moonBagUsd};}
