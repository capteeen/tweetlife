import { Footer, Header } from '@/components/ui/Chrome';
import { getSession } from '@/lib/session';

// The growth rules in full. Every rule here is implemented in lib/world/geometry.ts and lib/world/classify.ts.
export default async function How() {
  const user = await getSession();
  return (
    <div className="min-h-screen">
      <Header user={user} />
      <main className="prose-invert mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-semibold">How a world grows</h1>
        <p className="mt-2 text-white/70">
          A world is a deterministic function of the account&apos;s real data. Nothing is invented: if a field is missing from X, the rule that
          depends on it uses its minimum, and the post card says so.
        </p>

        <Section title="Each post becomes one building">
          <Rule k="Standalone text" v="a building on its own lot, facing the street." />
          <Rule k="Thread" v="posts sharing a conversation_id and authored by the owner stack into one tower, one storey-block per post." />
          <Rule k="Photo" v="a building with the real image as a billboard on its facade, loaded only when you are near it." />
          <Rule k="Video / GIF" v="a building with a dark screen across its front." />
          <Rule k="Reply to someone else" v="a small shed beside the building posted within the same hour (it takes no lot of its own)." />
          <Rule k="Repost" v="a street lamp on the sidewalk in front of the previous building: light, no mass." />
        </Section>

        <Section title="Engagement becomes geometry (log scaled)">
          <Rule k="like_count" v="height = base + 2.4 · log10(1 + likes). Ten likes add about a storey; a million adds ~14 units." />
          <Rule k="retweet_count" v="footprint width = base + 0.6 · log10(1 + reposts), capped by the lot." />
          <Rule k="reply_count" v="lit windows on the facade = min(40, round(2.5 · log2(1 + replies)))." />
          <Rule k="impression_count" v="glow = min(1, log10(1 + impressions) / 7). Ten million impressions is full glow." />
          <Rule k="Missing metrics" v="minimum scale, no windows, no glow. The card reads “metrics not available”." />
        </Section>

        <Section title="Posting cadence becomes the map">
          <p className="text-sm text-white/70">
            The city is a road grid of blocks, eight lots each. Blocks fill chronologically from the centre block outward in rings, so
            walking outward walks forward through the account&apos;s history. Each block is coloured by the gaps between the posts on it:
          </p>
          <Rule k="≤ 7 days between posts" v="lush: green blocks with sidewalk trees." />
          <Rule k="7–30 days" v="dry: yellowed blocks, few trees." />
          <Rule k="30+ days" v="sand: bare blocks, no trees." />
          <Rule k="Silence" v="every 3 days of quiet beyond a week leaves one vacant lot (up to 24), so a long silence is a stretch of empty lots you walk past." />
          <Rule k="Beyond the newest block" v="the countryside around the city takes the class of the gap from the last post to today." />
        </Section>

        <Section title="The account itself">
          <Rule k="followers_count" v="boundary radius = max(city + margin, 60 + 30 · log10(1 + followers)), the number of residents walking the streets, and the cars in traffic." />
          <Rule k="Account created_at" v="sky phase: new accounts at dawn, ~3 years at noon, ~8 at gold evening, 14+ at night." />
          <Rule k="Highest-engagement post" v="the landmark: a light column always on the horizon, text readable at its door. Owners can pin a different one." />
          <Rule k="Determinism" v="roof colours, tree placement, resident routes and traffic are seeded from the handle, so the city is identical on every device." />
        </Section>

        <Section title="Access and what visitors can do">
          <Rule k="Followers only (default)" v="we check that the signed-in visitor follows the owner, on the visitor's own token. Verified follows are cached 24h, non-follows 1h." />
          <Rule k="If the check fails" v="you stay outside. We never fake an admit." />
          <Rule k="Outside" v="the real skyline and landmark, no walking, and a Follow button." />
          <Rule k="Inside" v="walk, read the real post behind any structure, light a lantern (an on-world like), leave one glowing stone in the guestbook." />
          <Rule k="Visitors cannot build" v="a world is authored by the owner's posting only. That is what keeps it a profile instead of a sandbox." />
        </Section>

        <Section title="Life in the city">
          <Rule k="Bags" v="the Bank's in-game money, never real. Everyone starts with 10,000. They cannot be bought or cashed out." />
          <Rule k="Two wallets" v="the Bank holds bags (in-game money: Market, venues, gifts). The Solana app is a real wallet generated for you at sign-in — fund it, ape memecoins in the Trenches through on-chain swaps, send SOL to any player. Real money, on Solana mainnet." />
          <Rule k="The Trenches" v="a live Solana memecoin board (DexScreener top boosts, real prices). Trades are real SOL from your Solana wallet; holdings are read from the chain." />
          <Rule k="Venues" v="a ring just outside the post blocks, never mixed with posts: Degen Lounge, Suya Spot, gym, barber, clinic, Hustle Hub (work a shift for bags), bank, club, dealership, marina, airstrip, the Trenches. Actions cost bags or gas, move your stats, and have cooldowns." />
          <Rule k="Vibes · Clout · Gas" v="your three stats, 0–100. They drift down over time and move with what you do; their average is your mood: Rekt, Coping, Comfy, Mooning." />
          <Rule k="People" v="tap any visitor: say GM, gist, shill your bag, ape together, send 100 bags, compliment their fit, dance. Both of you feel it; they get a toast if they are inside a world." />
          <Rule k="Market" v="keke to private jet, priced in bags. Cars are faster, boats can leave the shore onto the water, the jet flies over everything." />
          <Rule k="Hustle" v="daily quests paid in bags, counted from real activity (lanterns lit, stones left, worlds visited, GMs said, coins aped)." />
        </Section>

        <Section title="Freshness">
          <Rule k="First build" v="reads your newest posts until your block is full, writing structures page by page so the world is walkable while it builds." />
          <Rule k="Then" v="while you play, an incremental sync every 6 hours fetches only new posts (since_id)." />
          <Rule k="Nightly" v="while you play, metrics are re-read for your posts from the last 7 days; older posts' metrics are effectively frozen." />
          <Rule k="When X is down" v="worlds keep serving from our database with a banner giving the last sync time." />
        </Section>
      </main>
      <Footer />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card mt-6">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

function Rule({ k, v }: { k: string; v: string }) {
  return (
    <p className="text-sm">
      <span className="font-medium text-white/90">{k}</span> <span className="text-white/65">— {v}</span>
    </p>
  );
}
