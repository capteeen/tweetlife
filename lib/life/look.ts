import { z } from 'zod';
import { prng, hashString } from '../world/seed';

// A player's look: body, skin, face, hair and clothes. Chosen in the avatar creator at sign-up and stored on
// Player.look. Anyone without a stored look (residents, players from before the creator) is seeded from a string,
// so they look the same on every device.

export const SKIN = ['#3B2219', '#4A2C1D', '#5C3A25', '#6F4530', '#8D5A3C', '#A66E4B', '#C08A63', '#D9A77F', '#E8BC94', '#F1CFB0'];
export const HAIR = ['#0E0B09', '#1A120D', '#2B1B12', '#3F2A1C', '#5A3B25', '#7A5230', '#A3703D', '#C99A5B', '#222222', '#444444', '#B8B8B8', '#8B2E2E', '#3A86FF', '#FF5D8F'];
export const SHIRT = ['#1D9BF0', '#F28C28', '#2EC4B6', '#E63946', '#8338EC', '#FFBE0B', '#06D6A0', '#FF5D8F', '#3A86FF', '#E9EDC9', '#F4F1DE', '#2D6A4F', '#0B0E14', '#FFFFFF'];
export const SHIRT_ALT = ['#FFFFFF', '#0B0E14', '#FFD089', '#E8DCC8', '#BFE3FF'];
export const PANTS = ['#2F4A74', '#1F2A44', '#0B0E14', '#4B5563', '#8B6F47', '#5C4033', '#2D2D2D', '#6B4EFF', '#1B4332', '#E8DCC8', '#E63946', '#FFFFFF'];
export const SHOES = ['#0B0E14', '#FFFFFF', '#5C4033', '#1D9BF0', '#E63946', '#FFBE0B'];

export const BODIES = ['male', 'female'] as const;
export const EYES = ['round', 'almond'] as const;
export const HAIR_STYLES = ['crop', 'buzz', 'afro', 'braids', 'locs', 'bun', 'ponytail', 'long', 'cap', 'bald'] as const;
export const PATTERNS = ['solid', 'stripes', 'yoke'] as const;
export const SLEEVES = ['long', 'short'] as const;
export const BOTTOMS = ['pants', 'shorts', 'skirt'] as const;

export type Look = {
  body: (typeof BODIES)[number];
  skin: string;
  eyes: (typeof EYES)[number];
  hair: string;
  hairStyle: (typeof HAIR_STYLES)[number];
  shirt: string;
  shirtAlt: string;
  pattern: (typeof PATTERNS)[number];
  sleeves: (typeof SLEEVES)[number];
  bottom: (typeof BOTTOMS)[number];
  pants: string;
  shoes: string;
  height: number; // 0.92 .. 1.08
  build: number; // 0.9 .. 1.1
};

/**
 * The seeded look. The draws and their order are unchanged from before the creator existed, so a player who has
 * not picked a look keeps the exact figure they had; the new fields take the values that figure already had.
 */
export function lookFor(seed: string): Look {
  const r = prng(hashString('look|' + seed.toLowerCase()));
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const styles: Look['hairStyle'][] = ['crop', 'crop', 'afro', 'braids', 'bun', 'bald', 'cap', 'long'];
  return {
    body: 'male',
    skin: pick(SKIN),
    eyes: 'round',
    hair: pick(HAIR.slice(0, 10)),
    hairStyle: pick(styles),
    shirt: pick(SHIRT.slice(0, 12)),
    shirtAlt: pick(SHIRT_ALT),
    pattern: pick(['solid', 'solid', 'stripes', 'yoke'] as Look['pattern'][]),
    sleeves: r() < 0.5 ? 'long' : 'short',
    bottom: 'pants',
    pants: pick(PANTS.slice(0, 9)),
    shoes: pick(SHOES.slice(0, 5)),
    height: 0.92 + r() * 0.16,
    build: 0.9 + r() * 0.2,
  };
}

/** Residents (the city's own people) get the full range: either body, both eye shapes, every hairstyle and bottom. */
export function residentLook(seed: string): Look {
  const base = lookFor(seed);
  const r = prng(hashString('resident|' + seed.toLowerCase()));
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const body = pick(BODIES);
  return {
    ...base,
    body,
    eyes: pick(EYES),
    hairStyle: pick(HAIR_STYLES),
    bottom: body === 'female' ? pick(BOTTOMS) : pick(['pants', 'pants', 'shorts'] as Look['bottom'][]),
  };
}

/** A random look for the creator's shuffle button. */
export function randomLook(): Look {
  return residentLook(Math.random().toString(36));
}

const hex = (list: string[]) => z.string().refine((v) => list.includes(v.toUpperCase()) || list.includes(v), 'not an offered colour');

export const LookSchema = z.object({
  body: z.enum(BODIES),
  skin: hex(SKIN),
  eyes: z.enum(EYES),
  hair: hex(HAIR),
  hairStyle: z.enum(HAIR_STYLES),
  shirt: hex(SHIRT),
  shirtAlt: hex(SHIRT_ALT),
  pattern: z.enum(PATTERNS),
  sleeves: z.enum(SLEEVES),
  bottom: z.enum(BOTTOMS),
  pants: hex(PANTS),
  shoes: hex(SHOES),
  height: z.number().min(0.92).max(1.08),
  build: z.number().min(0.9).max(1.1),
});

/** A stored look, or null when the row holds nothing valid (then the seeded look is used). */
export function parseLook(v: unknown): Look | null {
  const p = LookSchema.safeParse(v);
  return p.success ? p.data : null;
}
