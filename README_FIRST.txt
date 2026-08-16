BROKE CAT BOT V11.15 — CLEAN CONSOLIDATED BUILD

This build was made directly from the uploaded V11.13 source.

FIXED:
- Multiple simultaneous LIVE positions (default 3).
- 30% hard max allocation per position remains enforced.
- 60% combined active-position + moon-bag exposure cap (default).
- MIN_TRADE_USD=5 is now the real primary minimum-buy variable.
- Legacy EXECUTION_MIN_USD is accepted only as a fallback.
- Existing V11.13 single live position migrates into positions[] on startup.
- Each live position keeps independent stop, TP tiers, liquidity guard, risk rechecks, and moon-bag handling.
- Duplicate buys of a token already held are blocked.
- Railway: RAILPACK + npm start + /health + restart ALWAYS.

OPTIONAL RAILWAY VARIABLES (defaults already built in):
MAX_ACTIVE_POSITIONS=3
MAX_TOTAL_EXPOSURE_PCT=60
MIN_TRADE_USD=5

Do not replace or re-enter wallet/API secrets for this code update.
