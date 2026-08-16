BROKE CAT BOT — V11.12 PUBLIC WEBSITE DATA UPDATE
===================================================

THIS IS A NORMAL GITHUB UPDATE FOLDER.

WHAT THIS UPDATE DOES
---------------------
Adds safe read-only endpoints to the existing Railway bot:

  /public-stats
  /public-trades
  /public-api

It lets the Lovable site display REAL:
- Total treasury
- Today's realized P&L
- All-time realized P&L
- Treasury growth
- Wins / losses / win rate
- Survival streak
- Bot status
- Number of open positions
- Completed/core-exited trades

PRIVACY / STRATEGY PROTECTION
-----------------------------
The public trade feed does NOT reveal:
- active token names
- hold time
- stops
- targets
- exact strategy logic
- active-position scores
- moon-bag size/percentage

Trades are only returned after the core trade is closed/detached.
Wins show: CAT GOT PAID 😼💰
Losses show: CAT GOT SCRATCHED 😿

HOW TO INSTALL — SAME AS OUR NORMAL UPDATES
-------------------------------------------
1. Unzip this folder.
2. Upload the files INSIDE the folder to the ROOT of your Broke Cat GitHub repo.
3. Replace railway.json when GitHub asks.
4. Keep public_api_hook.mjs in the root beside index.mjs/live.mjs/config.mjs.
5. Railway should automatically redeploy.

FILES TO UPLOAD
---------------
- public_api_hook.mjs       NEW
- railway.json              REPLACE
- LOVABLE-PROMPT.txt        Do NOT upload if you don't want to; this is the prompt for Lovable.
- README-FIRST.txt          Optional instructions.

NO EXISTING BOT SOURCE FILES ARE REPLACED.
index.mjs, live.mjs, scoring.mjs, etc. stay untouched.

AFTER RAILWAY DEPLOYS
---------------------
In the Railway logs you should see:

🐱 PUBLIC WEBSITE API LOADED | /public-stats + /public-trades | safe disclosure mode ON

Then test these on your Railway public domain:

/public-api
/public-stats
/public-trades

OPTIONAL RAILWAY VARIABLES
--------------------------
PUBLIC_STARTING_TREASURY_USD=1000
PUBLIC_API_CACHE_MS=15000
PUBLIC_TRADES_LIMIT=50

You do NOT need to add these unless you want different values.
The defaults are already:
- starting treasury: $1,000
- API cache: 15 seconds
- max public trades: 50

NEXT STEP
---------
After Railway is deployed, send ChatGPT:
1. a screenshot of the startup logs, and
2. your Railway public domain / public-stats result.

Then we can verify the API and use LOVABLE-PROMPT.txt to connect the website.
