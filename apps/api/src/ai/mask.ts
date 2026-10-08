/**
 * Masking for the AI (IA.md, METADATA_ONLY): every name the portal knows
 * (the client, its units, people, matters, tasks, obligations, filings,
 * counterparties, authorities) becomes a marker such as "[ASUNTO_3]"
 * before anything leaves for Google, and the marker becomes the name again
 * in what comes back. Google reads structure (dates, states, areas, counts)
 * and markers, never a name.
 *
 * What a person types (a question, a request) is masked with every name the
 * portal knows, and first loses what looks like an e-mail, a long number
 * (a phone, an account), an RFC, a CURP or an amount (`scrub`); a name the
 * portal does not know cannot be masked, which is why the screen asks not
 * to type confidential data (IA.md, "Límite honesto").
 */
import { MASK_PATTERN } from '@empirica/shared';

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class Masker {
  readonly #token = new Map<string, string>();
  readonly #value = new Map<string, string>();
  /** Other names of an already masked record: [marker, name]. */
  readonly #aliases: [string, string][] = [];
  readonly #count = new Map<string, number>();

  /** The marker of a name (the same name, the same marker); null for nothing. */
  mask(kind: string, value: string | null | undefined): string | null {
    const name = (value ?? '').trim();
    if (!name) return null;
    const key = `${kind}:${name.toLowerCase()}`;
    const known = this.#token.get(key);
    if (known) return known;
    const n = (this.#count.get(kind) ?? 0) + 1;
    this.#count.set(kind, n);
    const token = `[${kind}_${String(n)}]`;
    this.#token.set(key, token);
    this.#value.set(token, name);
    return token;
  }

  /**
   * The marker of a record known by several names (a client's trade name,
   * its legal name and its RFC): any of them, in a text, becomes the same
   * marker, which comes back as the first.
   */
  maskAll(kind: string, values: readonly (string | null | undefined)[]): string | null {
    const names = values.map((v) => (v ?? '').trim()).filter(Boolean);
    const [first, ...others] = names;
    const token = this.mask(kind, first);
    if (!token) return null;
    for (const other of others) {
      const key = `${kind}:${other.toLowerCase()}`;
      if (this.#token.has(key)) continue;
      this.#token.set(key, token);
      this.#aliases.push([token, other]);
    }
    return token;
  }

  /** Every known name in free text replaced by its marker, longest names first. */
  maskText(text: string): string {
    const names = [...this.#value.entries(), ...this.#aliases]
      .filter(([, name]) => name.length >= 3)
      .sort((a, b) => b[1].length - a[1].length);
    let out = text;
    for (const [token, name] of names) {
      // A short name only as a word of its own: "Ana" is not in "semana".
      const pattern =
        name.length < 5
          ? `(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`
          : escapeRegExp(name);
      out = out.replace(new RegExp(pattern, 'giu'), token);
    }
    return out;
  }

  /** The names back in place of their markers; an unknown marker is left out. */
  unmask(text: string): string {
    return text.replace(MASK_PATTERN, (token) => this.#value.get(token) ?? '');
  }

  /** The name behind a marker, if this masker gave it. */
  valueOf(token: string): string | null {
    return this.#value.get(token) ?? null;
  }
}

const EMAIL = /[^\s@<>()[\],;:]+@[^\s@<>()[\],;:]+\.[A-Za-z]{2,}/g;
const CURP = /\b[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z\d]\d\b/gi;
const RFC = /\b[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}\b/gi;
const CURRENCY = String.raw`(?:pesos|d[óo]lares|mxn|usd|mdp|m\.n\.)`;
const AMOUNT = new RegExp(
  String.raw`(?:us\$|\$|\b(?:mxn|usd)\b)\s?\d[\d,.]*(?:\s?(?:mil|millones?|k)\b)?(?:\s?${CURRENCY})?` +
    String.raw`|\b\d[\d,.]*\s?(?:mil\s+|millones?\s+(?:de\s+)?)?${CURRENCY}`,
  'gi',
);
/** Digits with the separators of a phone or an account number. */
const DIGITS = /\+?\(?\d[\d\s().-]{7,}\d/g;

/**
 * A typed text without what looks like an e-mail, a phone or account number
 * (ten digits or more, unless it is a date), an RFC, a CURP or an amount:
 * markers say what was there ("[CORREO]"), never what it was.
 */
export function scrub(text: string): string {
  return text
    .replace(EMAIL, '[CORREO]')
    .replace(CURP, '[CURP]')
    .replace(RFC, '[RFC]')
    .replace(AMOUNT, '[MONTO]')
    .replace(DIGITS, (match) => {
      if (/\d{4}-\d{2}-\d{2}/.test(match)) return match;
      return (match.match(/\d/g) ?? []).length >= 10 ? '[NUMERO]' : match;
    });
}
