/**
 * The API contract (PLAN.md § 7): one POST endpoint, `text/plain` body with
 * an envelope, HTTP 200 always, the outcome in the body. The browser and the
 * server import these same definitions.
 */
import * as z from 'zod/mini';
import {
  ESTADOS_INVITACION,
  FIRM_ROLES,
  LADOS,
  ROLES,
  type Lado,
  type Rol,
} from '../domain/enums.ts';
import { PUSHABLE_TABLES, type TableName } from '../domain/tables.ts';
import type { FieldIssue } from '../domain/validate.ts';
import type { Row } from '../domain/values.ts';
import type { Alcance } from '../permissions/context.ts';
import type { Snapshot } from '../permissions/snapshot.ts';
import type { DenialReason } from '../permissions/write.ts';

export const API_VERSION = 1;

export const ACTIONS = [
  'ping',
  'session.bootstrap',
  'sync.pull',
  'sync.push',
  // Online only (PLAN.md § 7): they change who may see what.
  'invitations.list',
  'invitations.create',
  'invitations.decide',
  'invitations.resend',
  'invitations.revoke',
  'invitations.accept',
  'admin.users.update',
  'admin.memberships.save',
  'profile.update',
  'conflicts.resolve',
  'files.upload',
  'files.download',
  'calendar.subscribe',
  'calendar.share',
  // F6: the monthly report and the AI helpers (Gemini, from the server only).
  'reports.send',
  'reports.download',
  'ai.status',
  'ai.summary',
  'ai.ask',
  'ai.reminder',
] as const;
export type Action = (typeof ACTIONS)[number];

/** Actions that do not need a signed-in user. */
export const PUBLIC_ACTIONS: readonly Action[] = ['ping'];

/**
 * Actions for a signed-in account that has no access yet: accepting the
 * invitation is what gives it access.
 */
export const PRE_ACCESS_ACTIONS: readonly Action[] = ['invitations.accept'];

/** Days an invitation link stays valid. */
export const INVITATION_DAYS = 7;

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

const id = z.uuid();
const name = z.string().check(z.minLength(1), z.maxLength(120));
const AlcanceSchema = z.nullable(
  z.object({
    entidades: z.array(id).check(z.maxLength(200)),
    asuntos: z.array(id).check(z.maxLength(500)),
  }),
);

export const InvitationsListSchema = z.object({ clienteId: z.optional(id) });

/**
 * A new invitation. Firm users (`lado` EMPIRICA) are invited only by the
 * SOCIO_ADMIN; with `clienteId`, a lawyer or assistant is also assigned to
 * that client. Client users need `clienteId`.
 */
export const InvitationCreateSchema = z.object({
  email: z.email().check(z.maxLength(254)),
  nombre: name,
  lado: z.enum(LADOS),
  rol: z.enum(ROLES),
  clienteId: z.optional(id),
  alcance: z.optional(AlcanceSchema),
  puesto: z.optional(z.nullable(z.string().check(z.maxLength(120)))),
  idioma: z.optional(z.enum(['es', 'en'])),
  /** Sends the link by email from the portal (F5); it is returned either way. */
  enviarCorreo: z.optional(z.boolean()),
});
export type InvitationCreate = z.infer<typeof InvitationCreateSchema>;

export const InvitationDecideSchema = z.object({
  invitacionId: id,
  approve: z.boolean(),
  /** On an approval: email the new link too. */
  enviarCorreo: z.optional(z.boolean()),
});
export const InvitationRefSchema = z.object({
  invitacionId: id,
  /** On a resend or an approval: send the new link by email too. */
  enviarCorreo: z.optional(z.boolean()),
});
/** The secret part of the link: two random UUIDs without dashes. */
export const InvitationAcceptSchema = z.object({
  token: z.string().check(z.regex(/^[0-9a-f]{64}$/)),
});

export const UserUpdateSchema = z.object({
  usuarioId: id,
  nombre: z.optional(name),
  estado: z.optional(z.enum(['ACTIVO', 'INACTIVO'])),
  /** Firm users only. */
  rolBase: z.optional(z.enum(FIRM_ROLES)),
  /** Unbinds the Firebase account, so the person can sign in with a new one. */
  resetAccount: z.optional(z.boolean()),
});

/** Creates the membership of a user in a client, or changes it if it exists. */
export const MembershipSaveSchema = z.object({
  usuarioId: id,
  clienteId: id,
  rol: z.enum(ROLES),
  alcance: z.optional(AlcanceSchema),
  puesto: z.optional(z.nullable(z.string().check(z.maxLength(120)))),
  estado: z.optional(z.enum(['ACTIVA', 'REVOCADA'])),
});

export const ProfileUpdateSchema = z.object({
  nombre: z.optional(name),
  idioma: z.optional(z.enum(['es', 'en'])),
  /** The daily summary by email (D14); on unless the person turns it off. */
  resumenDiario: z.optional(z.boolean()),
});

/**
 * The personal calendar feed (ICS): a new secret replaces the old one, which
 * stops working; `revoke` only takes it away. The server keeps its hash.
 */
export const CalendarSubscribeSchema = z.object({ revoke: z.optional(z.boolean()) });

export interface CalendarSubscribeData {
  /** Shown once: the feed is `<API URL>?action=ics&token=<token>`. Null once revoked. */
  token: string | null;
}

/**
 * Sees a Google calendar of the portal in the person's own Google Calendar:
 * the firm's (firm users) or a client's (whole-client users). `remove`
 * takes the access away.
 */
export const CalendarShareSchema = z.object({
  clienteId: z.optional(id),
  remove: z.optional(z.boolean()),
});

export interface CalendarShareData {
  calendarId: string | null;
  /** Opens Google Calendar with the calendar ready to add. */
  addUrl: string | null;
}

/**
 * A lawyer's decision on a conflict (PLAN.md § 5, "Conflictos"): keep the
 * value that stayed, or apply the one that was proposed.
 */
export const CONFLICT_DECISIONS = ['CONSERVAR', 'APLICAR'] as const;
export type ConflictDecision = (typeof CONFLICT_DECISIONS)[number];

export const ConflictResolveSchema = z.object({
  conflictoId: id,
  decision: z.enum(CONFLICT_DECISIONS),
});

export interface ConflictResolveData {
  /** The conflict, now resolved. */
  conflicto: Row;
  /** The record it was about, as the user may see it now. */
  record: Row | null;
}

/**
 * The file of a document whose record already exists (created with
 * `sync.push`, perhaps offline). `uploadId` makes a retry harmless; the
 * type comes from the document's name, the size limit from
 * `Config.mbMaxArchivo`.
 */
export const FileUploadSchema = z.object({
  documentoId: id,
  uploadId: id,
  base64: z.string().check(z.regex(/^[A-Za-z0-9+/]*={0,2}$/)),
});

export interface FileUploadData {
  row: Row;
}

export const FileDownloadSchema = z.object({ documentoId: id });

export interface FileDownloadData {
  nombre: string;
  mimeType: string;
  base64: string;
}

/**
 * Sends a monthly report (F6): the PDF the lawyer's browser made from the
 * draft they reviewed. The server keeps it in the client's Drive folder,
 * marks the report ENVIADO (it cannot change any more) and emails it to the
 * client's users who see the whole company.
 */
export const ReportSendSchema = z.object({
  reporteId: id,
  /** The PDF, base64; the request body's 2 MB limit applies. */
  pdf: z.string().check(z.regex(/^[A-Za-z0-9+/]*={0,2}$/)),
});

export interface ReportSendData {
  row: Row;
  /** Who received it by email. */
  enviadoA: string[];
  /** Why the email did not go (QUOTA, NO_PERMISSION or Google's words); the report is sent anyway. */
  emailError?: string;
}

export const ReportDownloadSchema = z.object({ reporteId: id });

/** The AI as the portal offers it now (IA.md). */
export interface AiStatusData {
  /** The firm's mode (Config.modoIA); a client may have its own (Clientes.modoIA). */
  modo: 'OFF' | 'METADATA_ONLY' | 'FULL';
  /** Whether the server has a key to call Gemini with. */
  configurada: boolean;
  usadasHoy: number;
  /** The daily limit the partner wrote in Config.limiteDiarioIA, if any. */
  limiteDiario: number | null;
  /** Google said today's quota ran out: back after midnight in California. */
  agotada: boolean;
}

export const AiSummarySchema = z.object({
  clienteId: id,
  periodo: z.string().check(z.regex(/^\d{4}-(0[1-9]|1[0-2])$/)),
  idioma: z.optional(z.enum(['es', 'en'])),
});

export interface AiTextData {
  texto: string;
}

export const AiAskSchema = z.object({
  pregunta: z.string().check(z.trim(), z.minLength(3), z.maxLength(500)),
  /** The client in view; none: all of the user's clients. */
  clienteId: z.optional(id),
});

export interface AiAnswerData {
  respuesta: string;
  /** The records the answer names, to open them. */
  enlaces: { titulo: string; ruta: string }[];
}

export const AiReminderSchema = z.object({ tareaId: id });

export type EstadoInvitacion = (typeof ESTADOS_INVITACION)[number];

/** An invitation as the firm (or the client admin who sent it) sees it. */
export interface InvitationView {
  id: string;
  email: string;
  nombre: string | null;
  lado: Lado;
  clienteId: string | null;
  rol: Rol;
  alcance: Alcance | null;
  puesto: string | null;
  /** VENCIDA as soon as the link expires, even before anyone marks it. */
  estado: EstadoInvitacion;
  venceEn: string | null;
  invitadoPor: string | null;
  aprobadoPor: string | null;
  createdAt: string;
}

export interface InvitationOutcome {
  invitation: InvitationView;
  /**
   * The secret of a new link, returned once to whoever may share it. The
   * link is `<portal>#/invitacion/<token>`; the server keeps only its hash.
   */
  token?: string;
  /** The person already had an account: the new client simply appears for them. */
  alreadyActive?: boolean;
  /** The portal emailed the link to this address. */
  emailedTo?: string;
  /** Why it could not email it (the day's quota, a rejected address): share the link instead. */
  emailError?: string;
}

export interface InvitationsListData {
  invitations: InvitationView[];
}

export interface AcceptData {
  clienteId: string | null;
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

/**
 * The oldest app this backend serves. Raise it with a release that changes
 * what the app must know (a new tab, a new field in the contract): older
 * apps are asked to reload instead of failing to sync. `Config.minAppVersion`
 * can only raise it further.
 */
export const MIN_APP_VERSION = '0.2.1';

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
