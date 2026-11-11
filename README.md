# Melo

Melo is a funding-aware perps terminal for dreamDEX on the Somnia Tokyo testnet. It watches funding rates, opens a position on the paying side, guards it against liquidation, and shows every order it places with its transaction hash.

Built with [Arc Studio](https://studio.arc.io)

Submitted to the dreamDEX Perps Builder Bounty, Track 2 (MVP).

## What it does

- Shows live mark price, funding rate and annualized funding for every tradeable perp market, sorted by the biggest funding edge.
- Autopilot opens a position on the side that collects funding when the rate is above your entry line, and closes it when the edge fades or flips.
- A liquidation shield trims the position, then closes it, before the exchange would liquidate it. You set both lines.
- Tells you plainly whether the next order is Ready, a Smaller size, or Cannot execute, checked against your live margin.
- Keeps running on the server after you close the tab.
- A proof page re-reads your fills from the exchange indexer and marks the ones Melo placed, each with a link to its transaction.

## Who it is for

Traders who want a simple, observable way to run a funding-harvest strategy with a risk guard on dreamDEX testnet, and see real orders land.

## Safety

- The bot key can place, cancel and reduce orders for a linked wallet. It cannot withdraw or send funds.
- The key lives only in the server's `.env`. It is never sent to the browser.
- Autopilot controls need an admin token. Anyone can view the terminal and proof page, only the token holder can start, stop or change settings.
- This is testnet only. Funding harvesting carries real market risk on mainnet and this project does not touch mainnet.

## Tech stack

- React 18, Vite, TypeScript, Tailwind CSS
- A small Node-compatible server run with Bun
- `@somnia-chain/markets-sdk` for market data and order placement
- viem

## Development

Prerequisites: Bun.

```bash
bun install
```

Environment variables, set in `.env` (never commit it):

| Name | Purpose |
| --- | --- |
| `BOT_PRIVATE_KEY` | Key the bot signs with. Make a fresh one just for Melo. Leave empty for read-only mode. |
| `OWNER_ADDRESS` | Optional. The wallet you linked the bot to in the dreamDEX app. If empty, the bot trades its own account. |
| `ADMIN_TOKEN` | Secret that unlocks the autopilot controls in the browser. |
| `PORT` / `MELO_PORT` | Optional. Server port, default 8787. Hosting platforms set `PORT` for you. |
| `MELO_ALLOWED_ORIGIN` | Server, when the web app is on another site. Your web app URL, for example your Vercel address. Comma separate several. |
| `SUPABASE_URL` | Optional. Your Supabase project URL. Keeps autopilot settings and the order log across redeploys. |
| `SUPABASE_SERVICE_KEY` | Optional, secret. The Supabase service role key. Server only, never put it in a `VITE_` variable. |
| `VITE_API_BASE` | Web app, when deployed. The public URL of the Melo server. Leave empty for local development. |
| `MELO_LOOP_MS` | Optional. Time between autopilot cycles in milliseconds, default 30000, minimum 10000. |

Run the server and the web app in two terminals:

```bash
bun run server
bun run dev
```

Other commands:

```bash
bun run test        # strategy unit tests
bun run typecheck   # type check
bun run lint        # lint
```

### Setting up the bot

1. Create a new key for the bot (for example with `cast wallet new`) and put it in `BOT_PRIVATE_KEY`.
2. In the dreamDEX testnet app, choose Link a Bot, paste the bot's public address, tick Perps, and leave "Send it ... for gas" on. Put your wallet address in `OWNER_ADDRESS`.
3. Make sure that wallet has USDso in its Perps account (the Perps Arena credit works).
4. Restart the server, open the terminal, paste your `ADMIN_TOKEN`, and press Start autopilot.

Without `OWNER_ADDRESS`, the bot trades its own account. Fund it with gas, then use Claim paper USDso in the terminal.

## Deploying

Melo has two parts. The web app is static and fits on Vercel or Netlify. The server must run somewhere that stays on (Railway, Render, Fly), because autopilot is a loop that keeps running.

1. Deploy the server from this repo. Build command `bun install`, start command `bun run server`. Set `BOT_PRIVATE_KEY`, `OWNER_ADDRESS`, `ADMIN_TOKEN` and `MELO_ALLOWED_ORIGIN` (your web app URL). Attach a persistent volume if you want the order log to survive redeploys.
2. In the web app host, set `VITE_API_BASE` to the server's public URL and redeploy.

### Keeping data across redeploys (Supabase)

Free hosts wipe local files on every redeploy. To keep autopilot settings and the order log, create a Supabase project, run this in its SQL editor, then set `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` on the server:

```sql
create table if not exists melo_state (
  id text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);
create table if not exists melo_receipts (
  id text primary key,
  ts bigint not null,
  data jsonb not null
);
alter table melo_state enable row level security;
alter table melo_receipts enable row level security;
```

The same SQL is in `supabase/schema.sql`. Row level security stays on with no public policies, so only the server's service key can read or write these tables.

## X posts

Add 2 to 3 links to posts about Melo that tag [@DreamDEXSomnia](https://x.com/DreamDEXSomnia):

1. 
2. 
3. 

## Live order evidence

Add transaction hashes of real orders Melo placed on the Tokyo testnet:

- 
