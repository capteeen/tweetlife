'use client';
import { useEffect } from 'react';
import { useWorld } from '@/components/world/store';
import type { Crowd, CrowdNotice } from '@/lib/life/crowd';

// Client side of follower crowds (lib/life/crowd.ts): keep the crowds of you and the visitors around you in the
// store, look for your new post when you walk in and now and then while you play, and right after you come back
// from posting on X.

const POLL_MS = 20_000;
const AUTO_CHECK_MS = 10 * 60_000;
const AUTO_KEY = 'tl_crowd_check';

let pulling = false;
let posting = false;
let retry: ReturnType<typeof setTimeout> | null = null;

/** Fetch live crowds (and notices) for you and the visitors here. */
export async function pullCrowds(world: string) {
  if (pulling) return;
  pulling = true;
  try {
    const s = useWorld.getState();
    const peers = Object.values(s.peers)
      .filter((p) => Date.now() - p.at < 15000)
      .map((p) => p.handle);
    const q = new URLSearchParams({ world, peers: peers.join(',') });
    const res = await fetch(`/api/life/crowd?${q}`, { cache: 'no-store' });
    if (!res.ok) return;
    const j = (await res.json()) as { crowds: Crowd[]; notices: CrowdNotice[]; now: number };
    // server clock -> this device's clock
    const skew = Date.now() - j.now;
    const crowds = j.crowds.map((c) => ({ ...c, at: c.at + skew, until: c.until + skew }));
    const st = useWorld.getState();
    const known = new Set(st.crowds.map((c) => c.postId));
    for (const c of crowds) {
      if (known.has(c.postId)) continue;
      const mine = c.ownerId === st.me?.id;
      const n = c.followers.length;
      if (mine) {
        if (n) st.pushToast(`📣 Your post landed. ${n} of your followers are pulling up!`, 'crowd');
        else st.pushToast('📣 Your post landed, but X did not share your follower list just now. They will come next time.', 'crowd');
      } else if (n) st.pushToast(`📣 @${c.owner} just posted. Their followers are pulling up.`, 'crowd');
    }
    st.setCrowds(crowds);
    if (j.notices.length) st.pushCrowdNotices(j.notices);
  } catch {
    // offline: keep what we have
  } finally {
    pulling = false;
  }
}

/** Ask the server to look for your new post. `auto` checks stand down when the X budget is getting low. */
export async function checkMyPost(world: string, auto: boolean) {
  const res = await fetch('/api/life/crowd', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ auto }) }).catch(() => null);
  const j = (await res?.json().catch(() => null)) as { state: string; retryIn?: number } | null;
  if (j?.state === 'found') await pullCrowds(world);
  return j;
}

export function useCrowds(world: string, enabled: boolean, signedIn: boolean) {
  useEffect(() => {
    if (!enabled) return;
    pullCrowds(world);
    const poll = setInterval(() => !document.hidden && pullCrowds(world), POLL_MS);
    if (!signedIn) return () => clearInterval(poll);

    const auto = () => {
      let last = 0;
      try {
        last = Number(localStorage.getItem(AUTO_KEY) ?? 0);
      } catch {}
      if (Date.now() - last < AUTO_CHECK_MS) return;
      try {
        localStorage.setItem(AUTO_KEY, String(Date.now()));
      } catch {}
      checkMyPost(world, true);
    };
    auto();
    const t = setInterval(() => !document.hidden && auto(), 60_000);

    // back from the X composer: look for the post (X can take a moment to list it)
    const onVisible = () => {
      if (document.hidden || !posting) return;
      posting = false;
      setTimeout(() => lookForPost(world, 0), 4000);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(poll);
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [world, enabled, signedIn]);
}

async function lookForPost(world: string, tries: number) {
  if (retry) clearTimeout(retry);
  const j = await checkMyPost(world, false);
  const s = useWorld.getState();
  if (!j) return;
  if (j.state === 'found') return;
  if (tries >= 2) return;
  if (j.state === 'none' || j.state === 'wait') {
    const wait = j.state === 'wait' ? (j.retryIn ?? 120) : 120;
    s.pushToast(`📣 Your post isn't on X yet. Looking again in ${wait < 90 ? `${wait}s` : `${Math.round(wait / 60)} min`}.`, 'crowd');
    retry = setTimeout(() => lookForPost(world, tries + 1), wait * 1000 + 1000);
  } else if (j.state === 'budget') s.pushToast('📣 X checks are paused for now. Your next sync will still bring your crowd.', 'crowd');
}

/** Open the X composer with a link back to your world; when you come back, the game looks for the post. */
export function postOnX(handle: string) {
  const url = `${location.origin}/w/${encodeURIComponent(handle)}`;
  const text = `Out here in Tweetlife 🏙️ pull up: ${url}`;
  posting = true;
  window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
}
