import { createHmac } from 'node:crypto';
import { env } from './env';

/** Key the timelapse worker presents to the headless render page. */
export function renderKeyFor(worldId: string) {
  return createHmac('sha256', env().SESSION_SECRET).update(`timelapse:${worldId}`).digest('base64url');
}
