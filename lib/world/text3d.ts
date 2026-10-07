/** Text for 3D labels: the self-hosted Inter has no emoji or symbols, and the text engine would fetch fallback
 *  font data from a CDN for them. Strip those so 3D text never leaves our origin. */
export function plain3d(text: string) {
  return text
    .replace(/[\u{1F000}-\u{1FFFF}\u{2190}-\u{2BFF}\u{FE00}-\u{FEFF}\u{E000}-\u{F8FF}\u{200D}]/gu, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}
