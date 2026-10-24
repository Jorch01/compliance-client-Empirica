/**
 * Ids that every device derives alike from what a record is (a client's
 * report of a month, the charge of a fee's period): two devices that write
 * the same thing offline write the same record, never two.
 */

/** A version 8 UUID from `key`; the same key always gives the same id. */
export function stableUuid(key: string): string {
  const words = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b].map((seed) => {
    let h = seed >>> 0;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
      h ^= h >>> 13;
    }
    return h >>> 0;
  });
  const hex = words.map((w) => w.toString(16).padStart(8, '0')).join('');
  const variant = ((parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
