/**
 * The clock that stamps every edit. Ported from TSJ Filing
 * (docs/js/database.js, "RELOJ DE SINCRONIZACIÓN"), where it fixed two ways
 * of losing work that were seen in practice:
 *
 * 1. Device clocks disagree. If the phone runs three minutes behind the
 *    computer, an edit made LATER on the phone carries an EARLIER time and
 *    loses the merge against the older one: the user sees their last change
 *    undo itself. So the clock learns its offset from the server's time.
 *
 * 2. Clocks jump backwards. A system time correction can stamp two
 *    consecutive edits on the SAME device in reverse order. So this clock
 *    never goes back: at worst it stands still and moves one millisecond.
 */

export interface ClockStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export const CLOCK_KEYS = {
  offset: 'sync_clock_offset_ms',
  last: 'sync_clock_last_stamp_ms',
} as const;

/** A round trip of a couple of seconds is network latency, not a wrong clock. */
const NOISE_MS = 2_000;

const memoryStorage = (): ClockStorage => {
  const data = new Map<string, string>();
  return { get: (k) => data.get(k) ?? null, set: (k, v) => data.set(k, v) };
};

export class SyncClock {
  #offset: number;
  #last: number;
  readonly #storage: ClockStorage;
  readonly #now: () => number;

  constructor(storage: ClockStorage = memoryStorage(), now: () => number = Date.now) {
    this.#storage = storage;
    this.#now = now;
    this.#offset = Number.parseInt(safeGet(storage, CLOCK_KEYS.offset) ?? '', 10) || 0;
    // The last stamp survives reloads: otherwise a clock that jumped back
    // between sessions would stamp in the past again.
    this.#last = Number.parseInt(safeGet(storage, CLOCK_KEYS.last) ?? '', 10) || 0;
  }

  /** Learns the device's offset from the `serverNow` of a response. */
  adjust(serverNowIso: string): number {
    const server = Date.parse(serverNowIso);
    if (Number.isNaN(server)) return this.#offset;
    const offset = server - this.#now();
    if (Math.abs(offset - this.#offset) < NOISE_MS) return this.#offset;
    this.#offset = offset;
    safeSet(this.#storage, CLOCK_KEYS.offset, String(offset));
    return offset;
  }

  /** The time to stamp on an edit: corrected and monotonic. */
  stamp(): string {
    const t = Math.max(this.#now() + this.#offset, this.#last + 1);
    this.#last = t;
    safeSet(this.#storage, CLOCK_KEYS.last, String(t));
    return new Date(t).toISOString();
  }

  get offset(): number {
    return this.#offset;
  }
}

// Private browsing can make storage throw; the clock keeps working in memory.
function safeGet(storage: ClockStorage, key: string): string | null {
  try {
    return storage.get(key);
  } catch {
    return null;
  }
}

function safeSet(storage: ClockStorage, key: string, value: string): void {
  try {
    storage.set(key, value);
  } catch {
    /* private mode */
  }
}
