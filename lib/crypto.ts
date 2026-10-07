import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { env } from './env';

// AES-256-GCM for X tokens at rest. Format: base64(iv) . base64(ciphertext) . base64(tag)

function key(): Buffer {
  const raw = env().TOKEN_ENCRYPTION_KEY;
  const buf = Buffer.from(raw, 'base64');
  // Accept any string: derive a 32-byte key by hashing if it is not already 32 raw bytes.
  return buf.length === 32 ? buf : createHash('sha256').update(raw).digest();
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, ct, tag].map((b) => b.toString('base64')).join('.');
}

export function decrypt(payload: string): string {
  const [ivB, ctB, tagB] = payload.split('.');
  if (!ivB || !ctB || !tagB) throw new Error('Malformed encrypted payload');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB, 'base64')), decipher.final()]).toString('utf8');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256base64url(input: string): string {
  return createHash('sha256').update(input).digest('base64url');
}
