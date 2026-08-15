import fs from 'node:fs';
import path from 'node:path';
import bs58 from 'bs58';
import {Keypair,VersionedTransaction} from '@solana/web3.js';
import {config,USDC_MINT,liveConfigStatus} from './config.mjs';

const BASE='https://api.jup.ag/swap/v2';
const USDC_DECIMALS=6;
const statePath=path.resolve(config.dataDir,'broke-cat-live-state.json');
fs.mkdirSync(config.dataDir,{recursive:true});
const today=()=>new Date().toISOString().slice(0,10);

function parseKey(raw){
  const value=String(raw||'').trim();
  if(!value)throw new Error('BS58_PRIVATE_KEY is empty');
  let bytes;
  if(value.startsWith('[')){
    const arr=JSON.parse(value);
    bytes=Uint8Array.from(arr);
  }else bytes=bs58.decode(value);
  if(bytes.length===64)return Keypair.fromSecretKey(bytes);
  if(bytes.length===32)return Keypair.fromSeed(bytes);
  throw new Error(`Unsupported Solana private-key length ${bytes.length}; expected 32-byte seed or 64-byte secret key`);
}
function wallet(){
  const status=liveConfigStatus();
  if(!status.ready)throw new Error(`Live mode not armed: missing ${status.missing.join(', ')}`);
  return parseKey(config.bs58PrivateKey);
}
function rpcUrl(){return `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(config.heliusApiKey)}`}
async function rpc(method,params=[]){
  const r=await fetch(rpcUrl(),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
  if(!r.ok)throw new Error(`Helius RPC ${r.status}: ${await r.text()}`);
  const j=await r.json();if(j.error)throw new Error(`Helius RPC ${method}: ${j.error.message||JSON.stringify(j.error)}`);return j.result;
}
export function loadLiveState(){
  if(fs.existsSync(statePath)){
    const s=JSON.parse(fs.readFileSync(statePath,'utf8'));
    if(s.day!==today()){s.day=today();s.dailyPnl=0}
    return s;
  }
  return {day:today(),dailyPnl:0,realizedPnl:0,position:null,trades:[],lastXDailyReportDay:null};
}
export function saveLiveState(s){fs.writeFileSync(statePath,JSON.stringify(s,null,2))}
export function liveStateFilePath(){return statePath}
export function walletAddress(){try{return wallet().publicKey.toBase58()}catch{return null}}
export async function walletSnapshot(){
  const w=wallet().publicKey.toBase58();
  const lamports=await rpc('getBalance',[w,{commitment:'confirmed'}]);
  const tokenAccounts=await rpc('getTokenAccountsByOwner',[w,{mint:USDC_MINT},{encoding:'jsonParsed',commitment:'confirmed'}]);
  let usdc=0;
  for(const row of tokenAccounts?.value||[])usdc+=Number(row?.account?.data?.parsed?.info?.tokenAmount?.uiAmountString||0);
  return {address:w,usdc,sol:Number(lamports?.value||0)/1e9};
}
export async function assertLiveFunding(){
  const snap=await walletSnapshot();
  const needed=config.livePositionUsdc+config.minUsdcReserve;
  if(snap.usdc<needed)throw new Error(`Live wallet needs at least $${needed.toFixed(2)} USDC ($${config.livePositionUsdc.toFixed(2)} trade + $${config.minUsdcReserve.toFixed(2)} reserve). Found $${snap.usdc.toFixed(2)} USDC.`);
  if(snap.sol<config.minSolForFees)throw new Error(`Live wallet needs at least ${config.minSolForFees} SOL reserved for network fees. Found ${snap.sol.toFixed(4)} SOL.`);
  return snap;
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
export async function openLive(s,c){
  if(s.position)throw new Error('Live position already open');
  if(s.dailyPnl<=-config.maxDailyLoss)throw new Error('Daily loss limit reached');
  const snap=await assertLiveFunding();
  const spendable=Math.max(0,snap.usdc-config.minUsdcReserve);
  const size=Math.min(config.livePositionUsdc,spendable);
  if(size<0.50)throw new Error(`Not enough spendable USDC after reserve. Wallet has $${snap.usdc.toFixed(2)}`);
  const amountRaw=Math.floor(size*10**USDC_DECIMALS);
  const swap=await jupiterSwap(USDC_MINT,c.tokenAddress,amountRaw);
  const actualCost=Number(swap.inputRaw)/10**USDC_DECIMALS;
  s.position={pairAddress:c.pairAddress,tokenAddress:c.tokenAddress,symbol:c.symbol,entryPrice:c.priceUsd,highPrice:c.priceUsd,lastPrice:c.priceUsd,costUsdc:actualCost,tokenAmountRaw:swap.outputRaw,openedAt:new Date().toISOString(),buySignature:swap.signature,score:c.score};
  s.trades.push({type:'BUY',mode:'LIVE',symbol:c.symbol,tokenAddress:c.tokenAddress,costUsdc:actualCost,tokenAmountRaw:swap.outputRaw,price:c.priceUsd,score:c.score,signature:swap.signature,at:new Date().toISOString()});
  saveLiveState(s);
  return {message:`LIVE BUY $${actualCost.toFixed(2)} ${c.symbol} | tx ${swap.signature}`,signature:swap.signature};
}
export function exitReason(s,price){
  const p=s.position;if(!p||price<=0)return null;
  p.highPrice=Math.max(Number(p.highPrice)||p.entryPrice,price);p.lastPrice=price;
  const retPct=(price/p.entryPrice-1)*100;
  if(retPct<=-config.stopLossPct)return `STOP -${config.stopLossPct}%`;
  if(retPct>=config.takeProfitPct)return `TAKE PROFIT +${config.takeProfitPct}%`;
  if((p.highPrice/p.entryPrice-1)*100>=config.trailArmPct && (1-price/p.highPrice)*100>=config.trailDrawdownPct)return `TRAIL after +${config.trailArmPct}%`;
  saveLiveState(s);return null;
}
export async function closeLive(s,reason){
  const p=s.position;if(!p)throw new Error('No live position');
  const swap=await jupiterSwap(p.tokenAddress,USDC_MINT,p.tokenAmountRaw);
  const received=Number(swap.outputRaw)/10**USDC_DECIMALS;
  const pnl=received-p.costUsdc;
  s.realizedPnl+=pnl;s.dailyPnl+=pnl;
  s.trades.push({type:'SELL',mode:'LIVE',symbol:p.symbol,tokenAddress:p.tokenAddress,receivedUsdc:received,pnlUsd:pnl,reason,signature:swap.signature,at:new Date().toISOString()});
  s.position=null;saveLiveState(s);
  return {message:`LIVE SELL ${p.symbol}: ${reason} | received $${received.toFixed(2)} | P&L $${pnl.toFixed(2)} | tx ${swap.signature}`,pnlUsd:pnl,receivedUsdc:received,signature:swap.signature,symbol:p.symbol};
}
export function tradeStatsLive(s){const sells=s.trades.filter(t=>t.type==='SELL');return{totalTrades:sells.length,wins:sells.filter(t=>Number(t.pnlUsd)>0).length,losses:sells.filter(t=>Number(t.pnlUsd)<0).length}}
