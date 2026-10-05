/**
 * Masking for the AI (IA.md, METADATA_ONLY): every name the portal knows
 * (the client, its units, people, matters, tasks, obligations, filings,
 * counterparties, authorities) becomes a marker such as "[ASUNTO_3]"
 * before anything leaves for Google, and the marker becomes the name again
 * in what comes back. Google reads structure (dates, states, areas, counts)
 * and markers, never a name.
 *
 * What a person types (a question) is masked with every name the portal
 * knows; a name the portal does not know cannot be masked, which is why the
 * screen asks not to type confidential data (IA.md, "Límite honesto").
 */
import { MASK_PATTERN } from '@empirica/shared';

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class Masker {
  readonly #token = new Map<string, string>();
  readonly #value = new Map<string, string>();
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

  /** Every known name in free text replaced by its marker, longest names first. */
  maskText(text: string): string {
    const names = [...this.#value.entries()]
      .filter(([, name]) => name.length >= 3)
      .sort((a, b) => b[1].length - a[1].length);
    let out = text;
    for (const [token, name] of names) {
      out = out.replace(new RegExp(escapeRegExp(name), 'gi'), token);
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
