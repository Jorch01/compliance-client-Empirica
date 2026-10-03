/**
 * The API contract (PLAN.md § 7): one POST endpoint, `text/plain` body with
 * an envelope, HTTP 200 always, the outcome in the body. The browser and the
 * server import these same definitions.
 */
import * as z from 'zod/mini';
import type { Rol } from '../domain/enums.ts';
import { PUSHABLE_TABLES, type TableName } from '../domain/tables.ts';
import type { FieldIssue } from '../domain/validate.ts';
import type { Row } from '../domain/values.ts';
import type { Alcance } from '../permissions/context.ts';
import type { Snapshot } from '../permissions/snapshot.ts';
import type { DenialReason } from '../permissions/write.ts';

export const API_VERSION = 1;

export const ACTIONS = ['ping', 'session.bootstrap', 'sync.pull', 'sync.push'] as const;
export type Action = (typeof ACTIONS)[number];

/** Actions that do not need a signed-in user. */
export const PUBLIC_ACTIONS: readonly Action[] = ['ping'];

export const ERROR_CODES = [
  'UNAUTHENTICATED',
  'EMAIL_NOT_VERIFIED',
  'NOT_WHITELISTED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION',
  'CONFLICT',
  'RATE_LIMITED',
  'CLIENT_TOO_OLD',
  'QUOTA_EXHAUSTED',
  'NOT_IMPLEMENTED',
  'BUSY',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Default wording (es-MX); the interface translates by code. */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHENTICATED: 'Tu sesión expiró o no es válida. Vuelve a iniciar sesión.',
  EMAIL_NOT_VERIFIED: 'Confirma tu correo con el enlace que te enviamos y vuelve a entrar.',
  NOT_WHITELISTED: 'Solicita acceso a tu abogado de Empírica.',
  FORBIDDEN: 'No tienes permiso para esta acción.',
  NOT_FOUND: 'No encontramos lo que buscas.',
  VALIDATION: 'Revisa los datos: hay campos con errores.',
  CONFLICT: 'Alguien más cambió este registro; revisa la versión vigente.',
  RATE_LIMITED: 'Demasiadas solicitudes seguidas. Espera un momento.',
  CLIENT_TOO_OLD: 'Hay una versión nueva del portal. Recarga la página para actualizar.',
  QUOTA_EXHAUSTED: 'Se agotó la cuota diaria de este servicio. Vuelve a intentarlo mañana.',
  NOT_IMPLEMENTED: 'Esta función todavía no está disponible.',
  BUSY: 'El servidor está ocupado. Se reintentará en unos segundos.',
  INTERNAL: 'Algo falló en el servidor. Ya quedó registrado.',
};

export const MAX_OPS_PER_PUSH = 200;
export const DEFAULT_PULL_LIMIT = 500;
export const MAX_PULL_LIMIT = 2_000;

const datetime = z.iso.datetime({ offset: true });
const shortText = (max: number) => z.string().check(z.maxLength(max));
const nonNegativeInt = z.int().check(z.minimum(0));

export const RequestSchema = z.object({
  v: z.literal(API_VERSION),
  action: shortText(64),
  payload: z.optional(z.unknown()),
  idToken: z.optional(shortText(8_192)),
  clientId: z.optional(shortText(64)),
  requestId: z.optional(shortText(64)),
  appVersion: z.optional(shortText(32)),
  userAgent: z.optional(shortText(400)),
});
export type ApiRequest = z.infer<typeof RequestSchema>;

export const PullPayloadSchema = z.object({
  cursor: nonNegativeInt,
  epochs: z.optional(z.record(shortText(64), nonNegativeInt)),
  snapshotHash: z.optional(shortText(64)),
  limit: z.optional(z.int().check(z.minimum(1), z.maximum(MAX_PULL_LIMIT))),
});
export type PullPayload = z.infer<typeof PullPayloadSchema>;

export const OP_TYPES = ['create', 'update', 'delete', 'restore'] as const;

export const OpSchema = z.object({
  opId: z.uuid(),
  table: z.enum(PUSHABLE_TABLES as [TableName, ...TableName[]]),
  id: z.uuid(),
  type: z.enum(OP_TYPES),
  /** When the user made the change (SyncClock). */
  at: datetime,
  fields: z.optional(z.record(shortText(64), z.unknown())),
  /** Per-field times when the queue merged several edits of the record. */
  stamps: z.optional(z.record(shortText(64), datetime)),
  /** Values the device started from, for the sensitive fields it changes. */
  base: z.optional(z.record(shortText(64), z.unknown())),
  baseVersion: z.optional(nonNegativeInt),
});
export type Op = z.infer<typeof OpSchema>;

/**
 * Each operation is validated on its own: one malformed operation is
 * rejected without blocking the rest of the device's queue.
 */
export const PushPayloadSchema = z.object({
  ops: z.array(z.unknown()).check(z.maxLength(MAX_OPS_PER_PUSH)),
});
export interface PushPayload {
  ops: Op[];
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  serverNow: string;
  requestId?: string;
}

export interface ApiFailure {
  ok: false;
  error: { code: ErrorCode; message: string; details?: Record<string, unknown> };
  serverNow: string;
  requestId?: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface ClientSummary {
  id: string;
  razonSocial: string;
  nombreComercial: string | null;
  rol: Rol;
  alcance: Alcance | null;
}

export interface BootstrapData {
  user: Row;
  clients: ClientSummary[];
  config: Row[];
  minAppVersion: string;
}

export interface PullChange {
  t: TableName;
  row: Row;
}

/** A record the device must drop: deleted, or no longer visible to the user. */
export interface PullRemoval {
  t: TableName;
  id: string;
  /** Present for deletions (the tombstone's date). */
  deleted?: string;
}

export interface PullData {
  changes: PullChange[];
  removed: PullRemoval[];
  cursor: number;
  more: boolean;
  /** Clients the user may see now; the device drops everything else. */
  authorizedClients: string[];
  epochs: Record<string, number>;
  /** Clients the device must wipe before applying this page (access changed). */
  resetClients: string[];
  /** Users, memberships and settings, when they differ from `snapshotHash`. */
  snapshot?: Snapshot & { hash: string };
}

export type OpStatus = 'applied' | 'duplicate' | 'rejected' | 'conflict';

export interface OpResult {
  opId: string;
  status: OpStatus;
  /** Why it was rejected. */
  code?: 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT';
  reason?: DenialReason | 'EDITED_AFTER_DELETION' | 'INVALID_FIELDS' | 'INVALID_OP' | 'OP_ID_TAKEN';
  field?: string;
  issues?: FieldIssue[];
  /** The record as it stands now, as this user may see it. */
  row?: Row;
  /** The record is no longer visible to this user: the device drops it. */
  removed?: boolean;
  /** Fields where someone else's more recent edit was kept. */
  superseded?: string[];
  /** Sensitive fields left for a lawyer to decide. */
  conflicts?: string[];
}

export interface PushData {
  results: OpResult[];
}

/** Compares dotted versions ("1.2.10" > "1.2.9"). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}
