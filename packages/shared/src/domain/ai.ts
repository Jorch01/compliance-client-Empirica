/**
 * The AI's mode for a client (IA.md): the client's own (Clientes.modoIA),
 * else the firm's (Config.modoIA). OFF hides the helpers. FULL would send
 * the content of documents and needs a paid key and the client's express
 * consent; the portal has no helper that needs it, so it works as
 * METADATA_ONLY: only structured data, every name masked.
 */
import { MODOS_IA, type ModoIA } from './enums.ts';

const isMode = (value: unknown): value is ModoIA =>
  typeof value === 'string' && (MODOS_IA as readonly string[]).includes(value);

export function aiModeOf(firmMode: unknown, clientMode: unknown): ModoIA {
  if (isMode(clientMode)) return clientMode;
  return isMode(firmMode) ? firmMode : 'METADATA_ONLY';
}

/** A masked name in what the AI reads and writes: "[ASUNTO_3]". */
export const MASK_PATTERN = /\[([A-Z]+)_(\d+)\]/g;
