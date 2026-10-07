import { env } from '../env';
import { redis } from '../redis';
import type { Resident } from './residents';

// Talking to a named resident. Replies come from DeepSeek's chat completions API (OpenAI-compatible) with the
// resident's personality as the system prompt; the key never leaves the server. Every player is capped per
// minute and per day, and the whole deployment per day; past a cap, or with no key, or when DeepSeek fails,
// the resident answers from their canned lines so the game keeps working.

export const PER_MINUTE = 6;
export const PER_DAY = 150;
const MAX_TOKENS = 120;
const TIMEOUT_MS = 12000;

export type ChatMsg = { role: 'user' | 'assistant'; content: string };

export function cannedReply(r: Resident, said: string) {
  let h = 0;
  for (const c of said) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return r.canned[(h + Math.floor(Date.now() / 60000)) % r.canned.length];
}

/** Count one message against the caps. 'slow' = over the per-minute limit; 'capped' = a daily cap is spent. */
export async function takeQuota(playerId: string): Promise<'ok' | 'slow' | 'capped'> {
  const day = new Date().toISOString().slice(0, 10);
  const minute = Math.floor(Date.now() / 60000);
  const kMin = `npcchat:${playerId}:m:${minute}`;
  const kDay = `npcchat:${playerId}:d:${day}`;
  const kAll = `npcchat:all:${day}`;
  const res = await redis().multi().incr(kMin).expire(kMin, 90).incr(kDay).expire(kDay, 90000).exec();
  if (!res) throw new Error('redis');
  const perMin = Number(res[0][1]), perDay = Number(res[2][1]);
  if (perMin > PER_MINUTE) return 'slow';
  if (perDay > PER_DAY) return 'capped';
  const all = await redis().incr(kAll);
  if (all === 1) await redis().expire(kAll, 90000);
  if (all > env().RESIDENT_CHAT_DAILY_CAP) return 'capped';
  return 'ok';
}

/** A reply from DeepSeek, or null when there is no key or the call fails. */
export async function deepseekReply(system: string, history: ChatMsg[]): Promise<string | null> {
  const e = env();
  if (!e.DEEPSEEK_API_KEY) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${e.DEEPSEEK_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${e.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({
        model: e.DEEPSEEK_MODEL,
        messages: [{ role: 'system', content: system }, ...history],
        max_tokens: MAX_TOKENS,
        temperature: 1.1,
        stream: false,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.error('[residents] deepseek', res.status, (await res.text().catch(() => '')).slice(0, 200));
      return null;
    }
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = j.choices?.[0]?.message?.content?.trim();
    return text ? tidy(text) : null;
  } catch (err) {
    console.error('[residents] deepseek', (err as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Strip markdown and quotes the model sometimes adds, and keep it bubble-sized. */
function tidy(s: string) {
  let t = s.replace(/\*\*?|__|`/g, '').replace(/^["“]|["”]$/g, '').replace(/\s+/g, ' ').trim();
  if (t.length > 320) t = t.slice(0, 317).replace(/\s+\S*$/, '') + '…';
  return t;
}
