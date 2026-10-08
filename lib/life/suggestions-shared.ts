import type { CountryId } from '@/lib/world/countries';

// The suggestion box's topics, limits and shapes, shared by the server (lib/life/suggestions.ts) and the
// client (components/life/SuggestionBox.tsx).

export const TOPICS = [
  { id: 'economy', label: 'Economy', emoji: '💰' },
  { id: 'rules', label: 'Laws & rules', emoji: '📜' },
  { id: 'city', label: 'The city', emoji: '🏙️' },
  { id: 'fun', label: 'Fun & events', emoji: '🎉' },
  { id: 'other', label: 'Something else', emoji: '💡' },
] as const;
export type TopicId = (typeof TOPICS)[number]['id'];
export const topicOf = (id: string) => TOPICS.find((t) => t.id === id) ?? TOPICS[TOPICS.length - 1];

export const MIN_LEN = 12;
export const MAX_LEN = 500;
/** suggestions one player can file with one president per day */
export const PER_DAY = 3;
/** backers that put a suggestion on the cabinet's agenda */
export const AGENDA = 5;

export type SuggestionStatus = 'review' | 'agenda';
export type SuggestionView = {
  id: string;
  country: CountryId;
  topic: string;
  text: string;
  status: SuggestionStatus;
  reply: string | null;
  backers: number;
  by: string;
  mine: boolean;
  backed: boolean;
  createdAt: string;
};
