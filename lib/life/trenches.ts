import { redis } from '../redis';

// The Trenches: a live memecoin board. Tokens and prices come from DexScreener's public API (no key),
// cached for 60s. Nothing here is invented: if the feed is down, the board says so.

const BOOSTS_URL = 'https://api.dexscreener.com/token-boosts/top/v1';
const TOKENS_URL = 'https://api.dexscreener.com/latest/dex/tokens/';
const PAIRS_URL = 'https://api.dexscreener.com/latest/dex/pairs/';
const CACHE_TTL = 60;

export type Token = {
  chain: string;
  address: string;
  symbol: string;
  name: string;
  priceUsd: number;
  change24h: number | null;
  change1h: number | null;
  volume24h: number | null;
  liquidityUsd: number | null;
  marketCap: number | null;
  icon: string | null;
  url: string;
  pairAddress: string;
};

type Boost = { chainId: string; tokenAddress: string; icon?: string; url?: string };
type Pair = {
  chainId: string;
  pairAddress: string;
  url: string;
  baseToken: { address: string; name: string; symbol: string };
  priceUsd?: string;
  priceChange?: { h1?: number; h24?: number };
  volume?: { h24?: number };
  liquidity?: { usd?: number };
  marketCap?: number;
  fdv?: number;
  info?: { imageUrl?: string };
};

async function getJson<T>(url: string, timeoutMs = 8000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' }, cache: 'no-store' });
    if (!res.ok) throw new Error(`${res.status} from dexscreener`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

function bestPair(pairs: Pair[]): Pair | null {
  return pairs.filter((p) => p.priceUsd).sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0] ?? null;
}

function toToken(p: Pair, icon?: string): Token {
  return {
    chain: p.chainId,
    address: p.baseToken.address,
    symbol: p.baseToken.symbol,
    name: p.baseToken.name,
    priceUsd: Number(p.priceUsd),
    change24h: p.priceChange?.h24 ?? null,
    change1h: p.priceChange?.h1 ?? null,
    volume24h: p.volume?.h24 ?? null,
    liquidityUsd: p.liquidity?.usd ?? null,
    marketCap: p.marketCap ?? p.fdv ?? null,
    icon: icon ?? p.info?.imageUrl ?? null,
    url: p.url,
    pairAddress: p.pairAddress,
  };
}

/** The board: top boosted tokens right now, with live prices. */
export async function trenchesBoard(): Promise<{ tokens: Token[]; at: string; error?: string }> {
  const key = 'trenches:board';
  const cached = await redis().get(key).catch(() => null);
  if (cached) return JSON.parse(cached);
  try {
    const boosts = await getJson<Boost[]>(BOOSTS_URL);
    const byChain = new Map<string, Boost[]>();
    for (const b of boosts.slice(0, 40)) byChain.get(b.chainId)?.push(b) ?? byChain.set(b.chainId, [b]);
    const tokens: Token[] = [];
    for (const [chain, list] of byChain) {
      // the tokens endpoint accepts up to 30 addresses
      for (let i = 0; i < list.length; i += 30) {
        const chunk = list.slice(i, i + 30);
        const r = await getJson<{ pairs: Pair[] | null }>(TOKENS_URL + chunk.map((b) => b.tokenAddress).join(','));
        const pairsByToken = new Map<string, Pair[]>();
        for (const p of r.pairs ?? []) {
          if (p.chainId !== chain) continue;
          const k = p.baseToken.address.toLowerCase();
          pairsByToken.get(k)?.push(p) ?? pairsByToken.set(k, [p]);
        }
        for (const b of chunk) {
          const best = bestPair(pairsByToken.get(b.tokenAddress.toLowerCase()) ?? []);
          if (best) tokens.push(toToken(best, b.icon));
        }
      }
    }
    const out = { tokens: tokens.slice(0, 30), at: new Date().toISOString() };
    await redis().set(key, JSON.stringify(out), 'EX', CACHE_TTL).catch(() => {});
    return out;
  } catch (e) {
    return { tokens: [], at: new Date().toISOString(), error: `Trenches feed unavailable: ${(e as Error).message}` };
  }
}

/** Live quotes for specific tokens (holdings). */
export async function quotes(items: { chain: string; address: string }[]): Promise<Map<string, Token>> {
  const out = new Map<string, Token>();
  const byChain = new Map<string, string[]>();
  for (const it of items) byChain.get(it.chain)?.push(it.address) ?? byChain.set(it.chain, [it.address]);
  for (const [chain, addrs] of byChain) {
    for (let i = 0; i < addrs.length; i += 30) {
      const chunk = addrs.slice(i, i + 30);
      const key = `trenches:q:${chain}:${chunk.map((a) => a.toLowerCase()).sort().join(',')}`;
      let data: Token[] | null = null;
      const cached = await redis().get(key).catch(() => null);
      if (cached) data = JSON.parse(cached);
      else {
        try {
          const r = await getJson<{ pairs: Pair[] | null }>(TOKENS_URL + chunk.join(','));
          const grouped = new Map<string, Pair[]>();
          for (const p of r.pairs ?? []) {
            if (p.chainId !== chain) continue;
            const k = p.baseToken.address.toLowerCase();
            grouped.get(k)?.push(p) ?? grouped.set(k, [p]);
          }
          data = [...grouped.values()].map((ps) => bestPair(ps)).filter((p): p is Pair => !!p).map((p) => toToken(p));
          await redis().set(key, JSON.stringify(data), 'EX', CACHE_TTL).catch(() => {});
        } catch {
          data = null;
        }
      }
      for (const t of data ?? []) out.set(`${t.chain}:${t.address.toLowerCase()}`, t);
    }
  }
  return out;
}

/** One token by chain+address (for trades), via its best pair. */
export async function quoteOne(chain: string, address: string): Promise<Token | null> {
  const q = await quotes([{ chain, address }]);
  return q.get(`${chain}:${address.toLowerCase()}`) ?? null;
}

void PAIRS_URL;
