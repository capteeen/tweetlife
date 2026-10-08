import { z } from 'zod';
import { prng, hashString } from '../world/seed';

// A player's look: body, skin, face, hair and clothes. Chosen in the avatar creator at sign-up and stored on
// Player.look. Anyone without a stored look (residents, players from before the creator) is seeded from a string,
// so they look the same on every device.

export const SKIN = ['#3B2219', '#4A2C1D', '#5C3A25', '#6F4530', '#8D5A3C', '#A66E4B', '#C08A63', '#D9A77F', '#E8BC94', '#F1CFB0'];
export const HAIR = ['#0E0B09', '#1A120D', '#2B1B12', '#3F2A1C', '#5A3B25', '#7A5230', '#A3703D', '#C99A5B', '#222222', '#444444', '#B8B8B8', '#8B2E2E', '#3A86FF', '#FF5D8F'];
export const SHIRT = ['#1D9BF0', '#F28C28', '#2EC4B6', '#E63946', '#8338EC', '#FFBE0B', '#06D6A0', '#FF5D8F', '#3A86FF', '#E9EDC9', '#F4F1DE', '#2D6A4F', '#0B0E14', '#FFFFFF'];
export const SHIRT_ALT = ['#FFFFFF', '#0B0E14', '#FFD089', '#E8DCC8', '#BFE3FF'];
export const PANTS = ['#2F4A74', '#1F2A44', '#0B0E14', '#4B5563', '#8B6F47', '#5C4033', '#2D2D2D', '#6B4EFF', '#1B4332', '#E8DCC8', '#E63946', '#FFFFFF', '#5B7DB1', '#7A8B5A', '#B9A27E'];
export const SHOES = ['#0B0E14', '#FFFFFF', '#5C4033', '#1D9BF0', '#E63946', '#FFBE0B', '#B07A4A', '#FF5D8F'];
/** Hats and backpacks: any colour offered for a top, an accent or a bottom. */
export const ACCENT = [...new Set([...SHIRT, ...SHIRT_ALT, ...PANTS])];

export const BODIES = ['male', 'female'] as const;
export const EYES = ['round', 'almond'] as const;
export const HAIR_STYLES = ['crop', 'buzz', 'afro', 'braids', 'locs', 'bun', 'ponytail', 'long', 'cap', 'bald'] as const;
export const PATTERNS = ['solid', 'stripes', 'yoke'] as const;
export const SLEEVES = ['long', 'short'] as const;
export const BOTTOMS = ['pants', 'jeans', 'joggers', 'cargo', 'shorts', 'skirt'] as const;
// Clothing styles. Each is its own shape on the figure and still takes the colours above.
export const TOPS = ['tee', 'hoodie', 'shirt', 'blazer', 'crop', 'jersey', 'tank', 'dress'] as const;
export const SHOE_STYLES = ['sneakers', 'boots', 'slides', 'heels'] as const;
export const HATS = ['none', 'cap', 'beanie'] as const;
export const EYEWEAR = ['none', 'glasses', 'shades'] as const;
export const EXTRAS = ['chain', 'watch', 'backpack'] as const;

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
  // Added with clothing styles. Looks saved before then have none of these and get the defaults in LookSchema,
  // which draw exactly the figure they had.
  top: (typeof TOPS)[number];
  shoeStyle: (typeof SHOE_STYLES)[number];
  hat: (typeof HATS)[number];
  eyewear: (typeof EYEWEAR)[number];
  extras: (typeof EXTRAS)[number][];
  /** hat and backpack colour */
  accent: string;
};

/** What a look wore before clothing styles: a plain tee, sneakers and no accessories. */
const UNSTYLED = { top: 'tee', shoeStyle: 'sneakers', hat: 'none', eyewear: 'none' } as const;

/**
 * The cap used to be a hairstyle. It is a hat now, worn over short hair in the colour it always had, so a look
 * that picked it draws the same and the hair list only holds hair.
 */
export function withCapAsHat(l: Look): Look {
  if (l.hairStyle !== 'cap') return l;
  return { ...l, hairStyle: 'crop', hat: 'cap', accent: l.shirtAlt === '#FFFFFF' ? l.pants : l.shirtAlt };
}

/**
 * The seeded look. The draws and their order are unchanged from before the creator existed, so a player who has
 * not picked a look keeps the exact figure they had; the new fields take the values that figure already had.
 */
export function lookFor(seed: string): Look {
  const r = prng(hashString('look|' + seed.toLowerCase()));
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const styles: Look['hairStyle'][] = ['crop', 'crop', 'afro', 'braids', 'bun', 'bald', 'cap', 'long'];
  return withCapAsHat({
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
    ...UNSTYLED,
    extras: [],
    accent: '#0B0E14',
  });
}

/**
 * Residents (the city's own people) get the full range: either body, both eye shapes, every hairstyle and bottom,
 * and a seeded outfit. The outfit draws from its own stream so the rest of each resident's look is unchanged.
 */
export function residentLook(seed: string): Look {
  const base = lookFor(seed);
  const r = prng(hashString('resident|' + seed.toLowerCase()));
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const body = pick(BODIES);
  const look: Look = {
    ...base,
    body,
    eyes: pick(EYES),
    hairStyle: pick(HAIR_STYLES),
    bottom: body === 'female' ? pick(['pants', 'shorts', 'skirt'] as Look['bottom'][]) : pick(['pants', 'pants', 'shorts'] as Look['bottom'][]),
  };
  return { ...withCapAsHat(look), ...outfitFor(seed, look) };
}

/** A seeded outfit: a top, a matching bottom, shoes and sometimes an accessory or two. */
function outfitFor(seed: string, look: Look): Pick<Look, 'top' | 'bottom' | 'shoeStyle' | 'hat' | 'eyewear' | 'extras' | 'accent'> {
  const r = prng(hashString('outfit|' + seed.toLowerCase()));
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const fem = look.body === 'female';
  const top = pick<Look['top']>(fem ? ['tee', 'hoodie', 'shirt', 'blazer', 'crop', 'jersey', 'tank', 'dress', 'dress'] : ['tee', 'tee', 'hoodie', 'shirt', 'blazer', 'jersey', 'tank']);
  // keep the resident's length (trousers, shorts or skirt) and pick a style of it
  const bottom = look.bottom === 'pants' ? pick<Look['bottom']>(['pants', 'jeans', 'jeans', 'joggers', 'cargo']) : look.bottom;
  const shoeStyle = pick<Look['shoeStyle']>(top === 'blazer' || top === 'dress' ? (fem ? ['heels', 'boots', 'sneakers'] : ['boots', 'sneakers']) : ['sneakers', 'sneakers', 'boots', 'slides']);
  const hat = look.hairStyle === 'cap' ? 'cap' : r() < 0.2 ? pick<Look['hat']>(['cap', 'beanie']) : 'none';
  const eyewear = r() < 0.25 ? pick<Look['eyewear']>(['glasses', 'shades']) : 'none';
  const extras = EXTRAS.filter((_, i) => r() < [0.2, 0.3, 0.15][i]);
  const accent = look.hairStyle === 'cap' ? (look.shirtAlt === '#FFFFFF' ? look.pants : look.shirtAlt) : pick(ACCENT);
  return { top, bottom, shoeStyle, hat, eyewear, extras, accent };
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
  top: z.enum(TOPS).default('tee'),
  shoeStyle: z.enum(SHOE_STYLES).default('sneakers'),
  hat: z.enum(HATS).default('none'),
  eyewear: z.enum(EYEWEAR).default('none'),
  extras: z
    .array(z.enum(EXTRAS))
    .max(EXTRAS.length)
    .default([])
    .transform((a) => [...new Set(a)]),
  accent: hex(ACCENT).default('#0B0E14'),
});

/** A stored look, or null when the row holds nothing valid (then the seeded look is used). */
export function parseLook(v: unknown): Look | null {
  const p = LookSchema.safeParse(v);
  return p.success ? withCapAsHat(p.data) : null;
}
