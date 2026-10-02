/**
 * A short fingerprint of a value, to tell whether a device already has the
 * current snapshot without sending it again. Not cryptographic: cyrb53, a
 * fast 53-bit string hash (public domain, by bryc), which runs the same in
 * the browser, in Node and in Apps Script.
 */
import { stableStringify } from '../domain/values.ts';

export function cyrb53(input: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Fingerprint of any JSON value; equal content gives an equal fingerprint. */
export const fingerprint = (value: unknown): string => cyrb53(stableStringify(value)).toString(36);
