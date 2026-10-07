// Turn what the Solana RPC, the faucet or Jupiter threw into one line a player can act on. The raw text is
// logged for us; players never see "403 Forbidden: Host not in allowlist" or a JSON-RPC dump.

const RULES: [RegExp, string][] = [
  [/allowlist|forbidden|\b403\b|\b401\b|unauthori[sz]ed/i, 'The Solana network is not taking requests from the game right now. Try again later.'],
  [/\b429\b|too many requests|rate.?limit/i, 'Solana is busy. Wait a minute and try again.'],
  [/airdrop request failed|airdrop.*limit|faucet.*(limit|dry|empty)/i, 'The devnet faucet is dry right now. Try again in a few hours.'],
  [/insufficient (funds|lamports)|0x1\b|not enough/i, 'Not enough SOL for that, counting the small network fee.'],
  [/slippage|0x1771|price impact/i, 'The price moved before your swap went through. Try again, or try a smaller amount.'],
  [/blockhash|timed? ?out|timeout|expired|not confirmed/i, 'The network took too long to answer. Check your history before trying again, in case it went through.'],
  [/fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|network|socket|\b5\d\d\b/i, 'Could not reach the Solana network. Try again in a bit.'],
];

/** Our own messages (short, plain sentences) pass through; anything that looks raw becomes a friendly line. */
export function friendlySolanaError(e: unknown, fallback = 'Something went wrong on the Solana network. Try again in a bit.'): string {
  const raw = e instanceof Error ? e.message : String(e ?? '');
  for (const [re, line] of RULES) if (re.test(raw)) {
    console.error('[solana]', raw.slice(0, 300));
    return line;
  }
  if (raw && raw.length <= 120 && !/[{}[\]<>]|https?:|\bat \w+\(/.test(raw)) return raw;
  console.error('[solana]', raw.slice(0, 300));
  return fallback;
}
