import { db } from '../db';
import { redis } from '../redis';
import { COUNTRIES, type CountryId } from '@/lib/world/countries';
import { GOVERNMENTS } from './government';
import { presidentOf, residentPrompt } from './residents';
import { deepseekReply } from './residentChat';
import { AGENDA, PER_DAY, MIN_LEN, topicOf, type SuggestionStatus, type SuggestionView, type TopicId } from './suggestions-shared';

// The suggestion box at each government house. A citizen files a suggestion with their own president; it is
// stored for good, the president answers it on the spot (in character, through DeepSeek when there is a key,
// otherwise from a line that names the topic), and it goes up on the country's suggestion board, where other
// citizens back it. At AGENDA backers it moves onto the cabinet's agenda, and the country's most-backed open
// suggestions are fed into the president's and ministers' prompts, so they bring them up when you talk to them.

export { TOPICS, topicOf, MIN_LEN, MAX_LEN, PER_DAY, AGENDA } from './suggestions-shared';
export type { TopicId, SuggestionStatus, SuggestionView } from './suggestions-shared';

type Row = {
  id: string;
  country: string;
  topic: string;
  text: string;
  status: string;
  reply: string | null;
  backers: number;
  playerId: string;
  createdAt: Date;
  player: { user: { handle: string } };
  backedBy: { playerId: string }[];
};

const view = (r: Row, me: string | null): SuggestionView => ({
  id: r.id,
  country: r.country as CountryId,
  topic: r.topic,
  text: r.text,
  status: r.status === 'agenda' ? 'agenda' : 'review',
  reply: r.reply,
  backers: r.backers,
  by: r.player.user.handle,
  mine: r.playerId === me,
  backed: r.backedBy.length > 0,
  createdAt: r.createdAt.toISOString(),
});

const include = (me: string | null) => ({
  player: { select: { user: { select: { handle: true } } } },
  backedBy: { where: { playerId: me ?? '' }, select: { playerId: true } },
});

/** The country's board (most backed first, then newest) and your own suggestions there. */
export async function board(country: CountryId, me: string | null) {
  const [top, mine, total, agenda] = await Promise.all([
    db.suggestion.findMany({ where: { country }, orderBy: [{ backers: 'desc' }, { createdAt: 'desc' }], take: 12, include: include(me) }),
    me ? db.suggestion.findMany({ where: { country, playerId: me }, orderBy: { createdAt: 'desc' }, take: 10, include: include(me) }) : Promise.resolve([]),
    db.suggestion.count({ where: { country } }),
    db.suggestion.count({ where: { country, status: 'agenda' } }),
  ]);
  return { top: top.map((r) => view(r, me)), mine: mine.map((r) => view(r, me)), total, agenda };
}

/** One line per most-backed suggestion, for the government's prompts. */
export async function talkingPoints(country: CountryId, take = 3): Promise<string[]> {
  const rows = await db.suggestion.findMany({ where: { country }, orderBy: [{ backers: 'desc' }, { createdAt: 'desc' }], take, select: { text: true, backers: true, status: true } });
  return rows.map((r) => `"${r.text.slice(0, 160)}" (${r.backers} backer${r.backers === 1 ? '' : 's'}${r.status === 'agenda' ? ', on the cabinet agenda' : ''})`);
}

/** Count one filing against today's cap: false once the player has filed PER_DAY with this president today. */
async function takeFiling(playerId: string, country: CountryId) {
  const key = `suggest:${playerId}:${country}:${new Date().toISOString().slice(0, 10)}`;
  const n = await redis().incr(key);
  if (n === 1) await redis().expire(key, 90000);
  return n <= PER_DAY;
}

/** The president's answer when DeepSeek isn't available: it names the topic and promises a review. */
function cannedAnswer(country: CountryId, topic: TopicId, handle: string) {
  const c = COUNTRIES[country];
  const g = GOVERNMENTS[country];
  const lines: Record<TopicId, string> = {
    economy: `Noted, @${handle}. Money matters go straight to my treasury minister; your idea is on the board at the ${g.house} for review.`,
    rules: `A citizen proposing laws, I like it @${handle}. It's logged and the cabinet will review it. Get other ${c.demonym}s to back it.`,
    city: `Good eye for ${c.capital}, @${handle}. I've put it on the board; if ${c.demonym}s back it, it goes on the cabinet agenda.`,
    fun: `Now we're talking, @${handle}. Logged for review. Get it backed and we'll put it on the agenda.`,
    other: `Received and logged, @${handle}. Every suggestion gets reviewed at the ${g.house}. Rally some backers.`,
  };
  return lines[topic];
}

/**
 * File a suggestion with the president of `country`. Only that country's citizens can, PER_DAY a day, and not
 * the same text twice. Returns the stored suggestion with the president's answer, or an error message.
 */
export async function file(p: { id: string; handle: string; bags: number; gas: number; vibes: number; clout: number }, country: CountryId, topic: TopicId, text: string): Promise<{ ok: true; suggestion: SuggestionView } | { ok: false; error: string; status: number }> {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length < MIN_LEN) return { ok: false, error: 'Say a bit more so the cabinet knows what to do.', status: 400 };
  const dupe = await db.suggestion.findFirst({ where: { playerId: p.id, country, text: { equals: clean, mode: 'insensitive' } }, select: { id: true } });
  if (dupe) return { ok: false, error: 'You already filed that one. It\'s on the board.', status: 409 };
  if (!(await takeFiling(p.id, country))) return { ok: false, error: `That's ${PER_DAY} suggestions today. The cabinet needs time to read them; come back tomorrow.`, status: 429 };

  const pres = presidentOf(country);
  let reply: string | null = null;
  if (pres) {
    const system = residentPrompt(pres, { handle: p.handle, doing: 'at your desk in the government house, reading the suggestion box', bags: p.bags, gas: p.gas, vibes: p.vibes, clout: p.clout });
    reply = await deepseekReply(
      `${system}\n\nA citizen has just filed a formal suggestion with you (topic: ${topicOf(topic).label}). Take it seriously: answer it specifically in 1 or 2 sentences, say honestly what you like or worry about, and tell them it is logged on the suggestion board for cabinet review and that other citizens can back it. Do not promise it is already done.`,
      [{ role: 'user', content: clean }],
    );
  }
  const row = await db.suggestion.create({
    data: { playerId: p.id, country, topic, text: clean, reply: reply ?? cannedAnswer(country, topic, p.handle) },
    include: include(p.id),
  });
  return { ok: true, suggestion: view(row, p.id) };
}

/** Back someone else's suggestion, once, if you are a citizen of its country. At AGENDA backers it goes on the agenda. */
export async function back(playerId: string, citizen: CountryId, id: string): Promise<{ ok: true; backers: number; status: SuggestionStatus } | { ok: false; error: string; status: number }> {
  const s = await db.suggestion.findUnique({ where: { id }, select: { playerId: true, country: true } });
  if (!s) return { ok: false, error: 'That suggestion is gone.', status: 404 };
  if (s.country !== citizen) return { ok: false, error: `Only ${COUNTRIES[s.country as CountryId]?.demonym ?? 'citizen'}s can back this one.`, status: 403 };
  if (s.playerId === playerId) return { ok: false, error: 'You can\'t back your own suggestion. Get your people to.', status: 400 };
  const done = await db.suggestionBacker.findUnique({ where: { suggestionId_playerId: { suggestionId: id, playerId } } });
  if (done) return { ok: false, error: 'You already backed this.', status: 409 };
  const [, row] = await db.$transaction([
    db.suggestionBacker.create({ data: { suggestionId: id, playerId } }),
    db.suggestion.update({ where: { id }, data: { backers: { increment: 1 } }, select: { backers: true, status: true } }),
  ]);
  if (row.backers >= AGENDA && row.status !== 'agenda') await db.suggestion.update({ where: { id }, data: { status: 'agenda' } });
  return { ok: true, backers: row.backers, status: row.backers >= AGENDA ? 'agenda' : 'review' };
}

