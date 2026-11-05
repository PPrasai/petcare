import { createHash, randomBytes } from 'node:crypto';

/** Crockford base32: no I, L, O or U. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_LENGTH = 10;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const sha256 = (data: Buffer | string): Buffer => createHash('sha256').update(data).digest();

/** 32 random bytes, base64url (43 characters). Shown once; only its hash is stored. */
export function newLinkToken(): string {
  return randomBytes(32).toString('base64url');
}

/** 10 characters (about 50 bits) from a CSPRNG, e.g. "7KQ2M-9XD4T" when displayed. */
export function newInviteCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  return Array.from(bytes, (b) => ALPHABET[b % 32]).join('');
}

export const displayCode = (code: string): string => `${code.slice(0, 5)}-${code.slice(5)}`;

/** Case-insensitive, hyphen optional, I/L read as 1 and O as 0. Null if it cannot be a code. */
export function normalizeCode(input: string): string | null {
  const cleaned = input
    .toUpperCase()
    .replaceAll('-', '')
    .replaceAll(/\s/g, '')
    .replaceAll(/[IL]/g, '1')
    .replaceAll('O', '0');
  if (cleaned.length !== CODE_LENGTH) return null;
  return [...cleaned].every((c) => ALPHABET.includes(c)) ? cleaned : null;
}

export const isLinkToken = (input: string): boolean => TOKEN_PATTERN.test(input);

/** The hash stored for a link token (hash of the 32 raw bytes). */
export const hashToken = (token: string): Buffer => sha256(Buffer.from(token, 'base64url'));
export const hashCode = (normalizedCode: string): Buffer => sha256(normalizedCode);
