# Melo

Project memory for future agents.

## What This App Does

Melo is a funding-aware perps terminal for dreamDEX on Somnia Tokyo testnet (Hideki, chain ID 50383), built for the dreamDEX Perps Builder Bounty Track 2. It harvests funding, guards against liquidation, and shows live order evidence.

No Solidity is written: Melo uses dreamDEX's deployed perp contracts through `@somnia-chain/markets-sdk`.

## Architecture

- `server/` runs under Bun with `node:http`. It holds the bot key, runs the autopilot loop, and serves `/api/*`.
  - `strategy.ts` pure decisions, sizing and config validation (unit tested in `strategy.test.ts`)
  - `engine.ts` reads chain state, builds the snapshot and signal, executes orders, runs the loop
  - `chain.ts` SDK instance and order placement (direct via the SDK, linked via `placeOrderFor`)
  - `store.ts` persists state and the order log to `data/` (gitignored)
  - `env.ts` reads `BOT_PRIVATE_KEY`, `OWNER_ADDRESS`, `ADMIN_TOKEN`
- `src/` is the React terminal. Vite proxies `/api` to port 8787.
- Modes: `linked` (bot key + OWNER_ADDRESS), `direct` (bot key only), `readonly` (no key).
- Orders are IOC only (no resting orders), so no cancel flow is needed.
- Control routes need `Authorization: Bearer ADMIN_TOKEN`.

## Facts checked against the live chain

- Network: RPC, indexer and market reads work from the sandbox through the SDK.
- Perp pool factory is read from `getPerpSystemConfig`, not hardcoded.
- Order placement has NOT been run with a funded key yet.
- Transaction links assume the explorer serves `/tx/<hash>` under the Tokyo explorer base. Confirm once with a real hash.

## Run

```bash
bun install
bun run server
bun run dev
bun run test
```

## Share links

- `src/lib/share.ts` ships `getShareBase`, `buildShareLink` and `installShareSync`. Import them, do not rewrite them.
- Keep shareable state in the URL path or query, never in the `#fragment`.
- Never put a secret in the URL path or query.
- Build every link a user copies or sends with `buildShareLink()`.
- Keep the `installShareSync()` call in `src/main.tsx`.
