# 🐱 Broke Cat Bot V7 — Fomo Wallet + Live Trading + X

One flat-folder deployment for Railway. V7 combines the scanner, Helius launch/bundle-risk analysis, holder/dev filters, $11 bankroll controls, Jupiter live swaps, Fomo wallet signing, X posts, Telegram alerts, persistent state, and `/health` monitoring.

## Default risk profile

- Starting experiment bankroll: about **$11**
- Max live position: **$2 USDC**
- Max open positions: **1**
- Daily realized-loss kill switch: **-$1**
- Minimum Broke Cat score: **90/100**
- Stop: **-15%**
- Take profit: **+50%**
- Trailing exit arms after **+25%**, exits after a **12%** pullback from the high
- Unknown/low-confidence bundle analysis: blocked by default
- Keeps **$1 USDC reserve** plus **0.003 SOL** for fees

## Important wallet requirement

V7's Solana live executor spends **USDC** and needs a small **SOL fee reserve**. If your Fomo wallet shows about $11 but it is all SOL or another token, first leave at least 0.003 SOL for fees and hold the amount you want Broke Cat to trade as USDC.

Fomo says its Trading Wallet is non-custodial and the private key can be exported. Never commit that key to GitHub and never send it in chat. Put it only in Railway Variables.

## Railway Variables — paper mode

```env
TRADING_MODE=paper
PAPER_BANKROLL_USD=11
MAX_POSITION_USD=2
MAX_DAILY_LOSS_USD=1
MIN_SCORE=90
POLL_SECONDS=30
DATA_DIR=/data
HELIUS_API_KEY=...
```

## Railway Variables — LIVE mode

Only change to LIVE when you intentionally want real orders:

```env
TRADING_MODE=live
LIVE_TRADING_ACK=I_UNDERSTAND_REAL_FUNDS_ARE_AT_RISK
HELIUS_API_KEY=...
JUPITER_API_KEY=...
BS58_PRIVATE_KEY=...
DATA_DIR=/data
LIVE_POSITION_USDC=2
MIN_USDC_RESERVE=1
MIN_SOL_FOR_FEES=0.003
MAX_DAILY_LOSS_USD=1
MIN_SCORE=90
STOP_LOSS_PCT=15
TAKE_PROFIT_PCT=50
TRAIL_ARM_PCT=25
TRAIL_DRAWDOWN_PCT=12
POLL_SECONDS=30
```

The bot refuses to arm live if Helius, Jupiter, the wallet key, or the exact acknowledgement string is missing. It also refuses to start live if the wallet does not have enough USDC for one position plus the reserve, or enough SOL for fees.

### Emergency kill switch

Set this in Railway and redeploy:

```env
TRADING_MODE=paper
```

That prevents new real trades. If a real position is open, manage it manually in Fomo before switching modes so you are not leaving it unmanaged.

## X posting (optional)

Create an X developer app with write access and add these to Railway Variables:

```env
X_POSTING_ENABLED=true
X_API_KEY=...
X_API_SECRET=...
X_ACCESS_TOKEN=...
X_ACCESS_TOKEN_SECRET=...
```

V7 posts LIVE/PAPER labels correctly for entries, exits, P&L and daily summaries.

## Persistent Railway volume

Attach a Railway Volume mounted at:

```text
/data
```

The bot stores state there so deploys/restarts do not wipe the position/trade history.

## Health check

Set Railway Healthcheck Path to:

```text
/health
```

The endpoint reports mode, wallet address (live), balances, position status, P&L, X status and last scan/error.

## Commands

```bash
npm install
npm run selftest
npm start
```

Do not use `wallet:create` if you are using the existing Fomo wallet.
