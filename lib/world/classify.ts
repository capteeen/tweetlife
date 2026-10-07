import type { StructureKind } from '@prisma/client';
import type { XMedia, XTweet } from '../x/types';

// Post shape -> structure kind. Pure; the only inputs are real tweet fields.

export type Classified = {
  kind: StructureKind;
  conversationId: string | null;
  referencedId: string | null;
  mediaUrl: string | null;
  mediaKind: string | null;
};

export function classifyTweet(t: XTweet, ownerId: string, media: Map<string, XMedia>): Classified {
  const refs = t.referenced_tweets ?? [];
  const retweet = refs.find((r) => r.type === 'retweeted');
  const reply = refs.find((r) => r.type === 'replied_to');
  const conversationId = t.conversation_id ?? null;

  if (retweet) {
    return { kind: 'lantern', conversationId, referencedId: retweet.id, mediaUrl: null, mediaKind: null };
  }

  const firstMedia = (t.attachments?.media_keys ?? []).map((k) => media.get(k)).find(Boolean) ?? null;
  const mediaUrl = firstMedia ? (firstMedia.type === 'photo' ? firstMedia.url : firstMedia.preview_image_url) ?? null : null;
  const mediaKind = firstMedia?.type ?? null;

  // Reply to someone else: in_reply_to_user_id is another account.
  const replyToOther = !!reply && !!t.in_reply_to_user_id && t.in_reply_to_user_id !== ownerId;
  if (replyToOther) {
    return { kind: 'outbuilding', conversationId, referencedId: reply.id, mediaUrl, mediaKind };
  }

  if (firstMedia) {
    const kind: StructureKind = firstMedia.type === 'photo' ? 'monolith' : 'obelisk';
    return { kind, conversationId, referencedId: reply?.id ?? null, mediaUrl, mediaKind };
  }

  // A self-reply (thread continuation) is a spire segment. The thread root is upgraded to spire
  // at read time when other segments share its conversation_id (see layout.ts).
  if (reply && t.in_reply_to_user_id === ownerId) {
    return { kind: 'spire', conversationId, referencedId: reply.id, mediaUrl: null, mediaKind: null };
  }

  return { kind: 'pillar', conversationId, referencedId: null, mediaUrl: null, mediaKind: null };
}
