# 📈 MELO — Funding-aware perps on dreamDEX

### Get paid for holding the right side.

**A perps terminal and autopilot for dreamDEX on the Somnia Tokyo testnet.** Melo reads funding on every perp market, opens the side that collects it, protects the position with take profit, stop loss and a liquidation shield, and shows every order with its transaction hash.

[![Network](https://img.shields.io/badge/Somnia-Tokyo_testnet-183d32?style=flat-square)](https://explorer.testnet.somnia.network/tokyo)
[![TypeScript](https://img.shields.io/badge/TypeScript-React_+_Bun-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/unit_tests-29_passing-2e7d4f?style=flat-square)](server/strategy.test.ts)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

**Real orders on testnet · Server-side autopilot · Proof page read from the indexer**

Built for the **dreamDEX Perps Builder Bounty, Track 2 (MVP)**

### ▶ [Live app](https://melo-trade.vercel.app) · [Proof page](https://melo-trade.vercel.app/proof) · [Source](https://github.com/iamsuperfly/Melo) · [dreamDEX perps docs](https://app.testnet.dreamdex.io/docs/developers/perps-testnet)

---

## Table of contents

- [The 60-second pitch](#-the-60-second-pitch)
- [Who it is for](#-who-it-is-for)
- [How it works](#-how-it-works)
- [The strategy](#-the-strategy)
- [Safety](#-safety)
- [Evidence of live orders](#-evidence-of-live-orders)
- [X posts](#-x-posts)
- [Network](#-network)
- [Tech stack](#-tech-stack)
- [Quick start](#-quick-start)
- [Environment variables](#-environment-variables)
- [Setting up the bot](#-setting-up-the-bot)
- [Deploying your own copy](#-deploying-your-own-copy)
- [Hackathon alignment](#-hackathon-alignment)
- [License](#-license)

---

## ⚡ The 60-second pitch

On a perpetual market, longs and shorts pay each other a funding rate every hour. When one side pays a lot, the other side earns just by holding. Most traders don't watch every market, and few have a rule for when to get out.

Melo does the watching and the exiting:

1. **Scan** — live mark price, funding per 8 hours and annualized funding for every tradeable perp
2. **Decide** — open the side that gets paid when the rate clears your entry line
3. **Check** — the signal says plainly: **Ready**, **Smaller size**, or **Cannot execute**, tested against your real margin
4. **Act** — place an immediate-or-cancel order, so nothing stray is ever left on the book
5. **Protect** — take profit, stop loss and a liquidation shield close or trim the position for you
6. **Prove** — every order shows its transaction hash, and a proof page re-reads fills from the exchange indexer

---

## 🎯 Who it is for

Traders and builders who want a simple, observable way to run a funding-harvest strategy with risk exits on dreamDEX testnet, and see real orders land. There is no AI in the trading loop. The logic is deterministic, so every order has a reason you can read.

---

## 🔄 How it works

| Step | What happens | Where |
|---|---|---|
| **Read** | Funding, mark price and your margin are read from the chain | Server |
| **Decide** | Shield first, then stop loss, then take profit, then the funding rules | Server |
| **Size** | Order size comes from your live margin limit, aligned to the market's lot grid | Server |
| **Place** | IOC order signed by the bot key | dreamDEX perp pool |
| **Log** | Every order is saved with its hash, reason and result | Supabase |
| **Prove** | Fills are re-read from the indexer and matched to Melo's orders | Proof page |

The server keeps running after you close the tab. The web app is only a window onto it.

---

## 🧠 The strategy

Funding harvest with risk exits. Every setting can be changed in the Autopilot card.

| Setting | Default | Meaning |
|---|---|---|
| Enter at funding | 5 bps per 8h | Open when funding is at least this |
| Exit below funding | 1 bps per 8h | Close when the edge fades under this |
| Position size | 100 USDso | Notional to open |
| Take profit | +2% | Net of funding, as a share of the position. 0 turns it off |
| Stop loss | -2% | Net of funding. 0 turns it off |
| Cool-down | 60 min | Wait after a take profit or stop loss before reopening that market |
| Shield trim | 1.5x health | Cut the position by half when margin health falls under this |
| Shield close | 1.2x health | Close the position when margin health falls under this |

Order of checks each cycle: **shield → stop loss → take profit → funding exit → funding entry.**
Autopilot watches one market at a time, the one you select.

---

## 🛡 Safety

- When the bot is linked to your own wallet, the bot key can place, cancel and reduce orders for that wallet but cannot withdraw or send funds.
- If you run it on its own wallet instead, that key controls that wallet's funds, so keep only test funds there.
- The key lives only in the server's environment. It is never sent to the browser.
- Anyone can view the terminal and proof page. Only the holder of the admin token can start, stop or change settings.
- Testnet only. This project does not touch mainnet.

---

## 🧾 Evidence of live orders

Real orders placed by Melo on the Somnia Tokyo testnet:

| When (UTC) | Order | Why | Transaction |
|---|---|---|---|
| 2026-11-11 17:14 | Sell 0.00134 BTC (opens a short) | Longs were paying shorts | [`0xe3f6…17c4`](https://explorer.testnet.somnia.network/tokyo/tx/0xe3f6ba1b74c2752ee36e5192c8004863ce8eaed8c4b1644bea8784e53c6917c4) |
| 2026-11-12 09:48 | Buy 95.3 XRP (opens a long) | Funding was -11.97 bps, shorts pay longs | [`0x9166…6e8b`](https://explorer.testnet.somnia.network/tokyo/tx/0x9166848f9770113ecf92c988caea9b3da307070bd5125119c267965e6bd16e8b) |
| 2026-11-15 08:32 | Sell 95.3 XRP (closes the long) | **Stop loss**: net -9.17% hit the -2% limit | [`0x80ea…a142`](https://explorer.testnet.somnia.network/tokyo/tx/0x80ea9a3887651ee48b08e7c1dab500d761649e320979020eaf225f195bd9a142) |
| 2026-11-15 08:33 | Buy 0.00134 BTC (closes the short) | **Take profit**: net +15.78% reached the +2% target | [`0x2f21…242d`](https://explorer.testnet.somnia.network/tokyo/tx/0x2f2162ba3471f5305bdb44c0ea15de33f1927b912a76a5559ac4f5c53c75242d) |
| 2026-11-15 08:42 | Buy 1.53 HYPE (opens a long) | **Autopilot**, funding -6.98 bps, shorts pay longs | [`0xb495…7320`](https://explorer.testnet.somnia.network/tokyo/tx/0xb495abe0cd82e0ad4cef9755269109b346c5dca39a5bcb71fb2a22251ad57320) |

The first order was placed before order logging was set up, so the proof page lists it without the Melo tag. The stop loss realized a loss, which is shown here as it happened.

The live proof page re-reads fills from the exchange indexer: [melo-trade.vercel.app/proof](https://melo-trade.vercel.app/proof).

---

## 🐦 X posts

Posts about Melo that tag [@DreamDEXSomnia](https://x.com/DreamDEXSomnia):

1. [Post 1](https://x.com/iamsuperflly/status/2121885472611774568)
2. <!-- add link -->
3. <!-- add link -->

---

## 🌐 Network

| | |
|---|---|
| **Network** | Somnia Tokyo testnet (Hideki), chain ID `50383` |
| **Collateral** | USDso, `0xed7993A74dAe1e6656B704A424DcD8711aAf4F72` |
| **MarginBank** | `0x478769E1177C0773c43A593DCCc4Ad15F15F1394` |
| **Explorer** | [explorer.testnet.somnia.network/tokyo](https://explorer.testnet.somnia.network/tokyo) |
| **Contracts** | None deployed by Melo. It trades through dreamDEX's own perp contracts |

---

## 🛠 Tech stack

- **Web app** — React 18, Vite, TypeScript, Tailwind CSS
- **Server** — Bun, plain `node:http`, viem
- **Trading** — official `@somnia-chain/markets-sdk`
- **Storage** — Supabase for settings and the order log (optional, local files without it)
- **Hosting** — web app on Vercel, server on Render, a cron job keeps the server awake
- **Tests** — 29 unit tests on every trading decision (`bun run test`)

---

## 🏃 Quick start

```bash
git clone https://github.com/iamsuperfly/Melo.git
cd Melo
bun install
bun run server   # terminal 1: the server on port 8787
bun run dev      # terminal 2: the web app
```

Open `http://localhost:5173`. Without a bot key the terminal runs in read-only mode.

---

## 🔑 Environment variables

Create a `.env` file (never commit it):

```env
# Server
BOT_PRIVATE_KEY=            # fresh key made just for Melo. Empty = read-only
OWNER_ADDRESS=              # optional: wallet you linked the bot to
ADMIN_TOKEN=                # long random secret that unlocks the controls
MELO_ALLOWED_ORIGIN=        # your web app URL, when it is on another site
MELO_PORT=8787              # optional (hosts set PORT for you)
MELO_LOOP_MS=30000          # optional, minimum 10000
SUPABASE_URL=               # optional: keeps data across redeploys
SUPABASE_SERVICE_KEY=       # optional, secret, server only

# Web app (public)
VITE_API_BASE=              # public URL of the Melo server, when deployed
```

Never put the bot key, admin token or Supabase key in a `VITE_` variable, because those are shipped to every visitor.

---

## 🤖 Setting up the bot

1. Create a new key for the bot (for example with `cast wallet new`) and set it as `BOT_PRIVATE_KEY`.
2. **Linked wallet (recommended):** in the dreamDEX testnet app, choose **Link a Bot**, paste the bot's public address, tick **Perps**, and set your wallet as `OWNER_ADDRESS`. The wallet needs USDso in its Perps account.
3. **Own wallet:** leave `OWNER_ADDRESS` empty. Give the bot STT for gas and USDso, then press **Deposit wallet USDso** in the terminal.
4. Restart the server, open the terminal, paste your `ADMIN_TOKEN`, and press **Start autopilot**.

---

## 🚀 Deploying your own copy

1. **Database (optional):** run `supabase/schema.sql` in the Supabase SQL editor. It creates two private tables.
2. **Server:** deploy the repo on a host that stays on (Render, Railway, Fly). Build `bun install`, start `bun run server`. Set the server variables above, with `MELO_ALLOWED_ORIGIN` as your web app URL.
3. **Web app:** deploy to Vercel or Netlify and set `VITE_API_BASE` to the server's public URL, then redeploy. `vercel.json` already handles page reloads.
4. **Keep it awake:** free hosts sleep when idle, which pauses autopilot. Use a pinger such as [cron-job.org](https://cron-job.org/en/) to call `GET <server URL>/api/health` every 5 minutes, or use a paid instance.

---

## 🏆 Hackathon alignment

| Requirement | Status |
|---|---|
| MVP places real perps orders on Tokyo testnet | ✅ Five confirmed orders, [see the table above](#-evidence-of-live-orders) |
| README: what it does, who it is for, how to run | ✅ Sections above |
| README: X posts section with 2 to 3 posts tagging @DreamDEXSomnia | See [X posts](#-x-posts) |
| Public GitHub repository | ✅ [iamsuperfly/Melo](https://github.com/iamsuperfly/Melo) |
| Evidence: transaction hashes, repo, demo | ✅ Hashes above, live app, live proof page |
| Official SDK and the Link a Bot flow | ✅ `@somnia-chain/markets-sdk`, linked-wallet mode supported |
| Deterministic risk logic, tested | ✅ 29 unit tests |
| Runs after the tab closes | ✅ Server-side autopilot, with a cron ping to keep the host awake |

Track 2 (MVP) of the **dreamDEX Perps Builder Bounty**.

---

## 📄 License

MIT. See [LICENSE](LICENSE).
