import { SOMNIA_HIDEKI_TESTNET_ADDRESSES, SomniaMarkets } from '@somnia-chain/markets-sdk'
import { hidekiTestnet } from '@somnia-chain/markets-sdk/chains'
import { createPublicClient, createWalletClient, http, parseAbi, parseUnits, zeroAddress, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { botKey, mode, ownerAddress, NETWORK } from './env'

/** Shared SDK instance. Holds the bot signer only when BOT_PRIVATE_KEY is set. */
export const markets = new SomniaMarkets({
  chain: hidekiTestnet,
  indexerUrl: NETWORK.indexerUrl,
  addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES,
  ...(botKey ? { privateKey: botKey } : {}),
})

export const client = markets.client

const publicClient = createPublicClient({ chain: hidekiTestnet, transport: http() })

const placeOrderForAbi = parseAbi([
  'function placeOrderFor(address owner, bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k) payable returns (bool success, uint128 orderId)',
])

/** The official docs send every perp order with a 10M gas ceiling. Gas is billed on use. */
const GAS = 10_000_000n
const ORDER_TYPE_MARKET_IOC = 2

export interface OrderRequest {
  pool: Address
  isBid: boolean
  /** Raw quote units per whole base. */
  price: bigint
  /** Raw base units. */
  quantity: bigint
}

export interface ExecResult {
  hash: Hex | null
  status: 'confirmed' | 'reverted' | 'skipped' | 'error'
  detail?: string
}

const short = (e: unknown): string => {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.replace(/\s+/g, ' ').slice(0, 280)
}

/** Place one IOC order. Never throws: failures come back as a result the caller records. */
export async function placeIoc(req: OrderRequest): Promise<ExecResult> {
  if (!botKey) return { hash: null, status: 'skipped', detail: 'No bot key configured' }
  try {
    if (mode === 'linked' && ownerAddress) return await placeLinked(req, ownerAddress)
    const res = await markets.trader.placePerpOrder({
      pool: req.pool,
      isBid: req.isBid,
      price: req.price,
      quantity: req.quantity,
      orderType: ORDER_TYPE_MARKET_IOC,
      gas: GAS,
    })
    return { hash: res.hash, status: res.receipt.status === 'success' ? 'confirmed' : 'reverted' }
  } catch (e) {
    return { hash: null, status: 'error', detail: short(e) }
  }
}

async function placeLinked(req: OrderRequest, owner: Address): Promise<ExecResult> {
  const account = privateKeyToAccount(botKey as Hex)
  const wallet = createWalletClient({ account, chain: hidekiTestnet, transport: http() })
  const expireNs = BigInt(Date.now()) * 1_000_000n + 50n * 365n * 24n * 3600n * 1_000_000_000n
  const args = [
    owner,
    req.isBid,
    0n,
    req.price,
    req.quantity,
    expireNs,
    ORDER_TYPE_MARKET_IOC,
    0,
    zeroAddress,
    0n,
  ] as const

  // Simulate first so an IOC that cannot fill never burns gas on a reverted transaction.
  try {
    await publicClient.simulateContract({
      account,
      address: req.pool,
      abi: placeOrderForAbi,
      functionName: 'placeOrderFor',
      args,
      gas: GAS,
    })
  } catch (e) {
    return { hash: null, status: 'skipped', detail: `Simulation refused: ${short(e)}` }
  }

  const hash = await wallet.writeContract({
    address: req.pool,
    abi: placeOrderForAbi,
    functionName: 'placeOrderFor',
    args,
    gas: GAS,
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 })
  return { hash, status: receipt.status === 'success' ? 'confirmed' : 'reverted' }
}

export async function claimVoucher(marginBank: Address): Promise<string> {
  if (mode !== 'direct') throw new Error('Voucher claims only apply when the bot trades its own account')
  const account = markets.walletAddress
  if (!account) throw new Error('No bot wallet')
  const elig = await client.getPerpVoucherEligibility(marginBank, account)
  if (!elig.eligible) throw new Error(`Not eligible: ${elig.reason}`)
  const res = await markets.trader.claimPerpVoucher({ marginBank })
  return res.hash
}

const erc20Abi = parseAbi(['function balanceOf(address) view returns (uint256)'])

/** Move USDso from the bot wallet into its perps margin. Approves the bank first if needed. */
export async function depositToMargin(marginBank: Address, amount?: number): Promise<{ hash: string; deposited: string }> {
  if (mode !== 'direct') throw new Error('Deposits only apply when the bot trades its own account')
  const account = markets.walletAddress
  if (!account) throw new Error('No bot wallet')
  const cfg = await client.getPerpSystemConfig(marginBank)
  const balance = await publicClient.readContract({
    address: cfg.collateralToken,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [account],
  })
  const want = amount === undefined ? balance : parseUnits(String(amount), 18)
  const value = want > balance ? balance : want
  if (value <= 0n) throw new Error('The bot wallet holds no USDso to deposit')
  const res = await markets.trader.depositMargin({ marginBank, amount: value, collateral: cfg.collateralToken, gas: GAS })
  return { hash: res.hash, deposited: (Number(value) / 1e18).toString() }
}
