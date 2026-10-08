/**
 * Online actions that are not edits of a record through `sync.push`:
 * deciding a conflict, the file of a document, and seeing a portal calendar
 * in one's own Google Calendar. Same rule as the rest (write.ts): what the
 * user cannot see is NOT_FOUND, never FORBIDDEN.
 */
import { CLIENT_ROLES, isFirmRole } from '../domain/enums.ts';
import { TABLES, isTableName } from '../domain/tables.ts';
import { text, type Row } from '../domain/values.ts';
import type { UserContext } from './context.ts';
import { POLICIES } from './policies.ts';
import { canRead, clientIdOf, type Lookup } from './read.ts';

export type OnlineDenialReason =
  | 'NOT_FOUND'
  | 'ROLE'
  | 'NOT_OWNER'
  | 'ALREADY_RESOLVED'
  | 'RECORD_DELETED'
  | 'ALREADY_UPLOADED'
  | 'NOT_UPLOADED'
  | 'ALREADY_SENT';

export type OnlineDecision =
  | { ok: true; clienteId: string }
  | { ok: false; code: 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT'; reason: OnlineDenialReason };

const deny = (
  code: 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT',
  reason: OnlineDenialReason,
): OnlineDecision => ({ ok: false, code, reason });

/**
 * Who decides a conflict on a sensitive field (PERMISOS.md, "Avisos de
 * conflicto"): the SOCIO_ADMIN, or a lawyer of that client. An assistant
 * sees conflicts but does not decide them.
 */
export function authorizeConflictResolution(
  ctx: UserContext,
  conflicto: Row | undefined,
  lookup: Lookup,
): OnlineDecision {
  if (!conflicto || conflicto.deleted || !canRead(ctx, 'Conflictos', conflicto, lookup)) {
    return deny('NOT_FOUND', 'NOT_FOUND');
  }
  const clienteId = text(conflicto, 'clienteId');
  const rol = clienteId ? ctx.clients.get(clienteId)?.rol : undefined;
  if (!clienteId || (rol !== 'SOCIO_ADMIN' && rol !== 'ABOGADO')) return deny('FORBIDDEN', 'ROLE');
  if (conflicto.estado !== 'PENDIENTE') return deny('CONFLICT', 'ALREADY_RESOLVED');
  const table = text(conflicto, 'entidad');
  const recordId = text(conflicto, 'entidadId');
  const record = table && recordId && isTableName(table) ? lookup.get(table, recordId) : undefined;
  if (!table || !isTableName(table) || !record || !canRead(ctx, table, record, lookup)) {
    return deny('NOT_FOUND', 'NOT_FOUND');
  }
  if (record.deleted) return deny('CONFLICT', 'RECORD_DELETED');
  return { ok: true, clienteId };
}

/**
 * Who sends the file of a document. The firm, whenever it may edit the
 * document (a new file is a new version). A client user, only the first
 * file of a document they created: what they upload is never replaced
 * from their side.
 */
export function authorizeUpload(
  ctx: UserContext,
  documento: Row | undefined,
  lookup: Lookup,
): OnlineDecision {
  if (!documento || documento.deleted || !canRead(ctx, 'Documentos', documento, lookup)) {
    return deny('NOT_FOUND', 'NOT_FOUND');
  }
  const clienteId = clientIdOf(TABLES.Documentos, documento);
  const rol = clienteId ? ctx.clients.get(clienteId)?.rol : undefined;
  if (!clienteId || !rol) return deny('NOT_FOUND', 'NOT_FOUND');
  if (isFirmRole(rol)) {
    return POLICIES.Documentos[rol].update === false
      ? deny('FORBIDDEN', 'ROLE')
      : { ok: true, clienteId };
  }
  if (POLICIES.Documentos[rol].create === false) return deny('FORBIDDEN', 'ROLE');
  if (documento.subidoPor !== ctx.userId) return deny('FORBIDDEN', 'NOT_OWNER');
  if (text(documento, 'driveFileId')) return deny('CONFLICT', 'ALREADY_UPLOADED');
  return { ok: true, clienteId };
}

/** Who downloads a document's file: whoever sees the document, once it has one. */
export function authorizeDownload(
  ctx: UserContext,
  documento: Row | undefined,
  lookup: Lookup,
): OnlineDecision {
  if (!documento || !canRead(ctx, 'Documentos', documento, lookup)) {
    return deny('NOT_FOUND', 'NOT_FOUND');
  }
  const clienteId = clientIdOf(TABLES.Documentos, documento);
  if (!clienteId) return deny('NOT_FOUND', 'NOT_FOUND');
  if (!text(documento, 'driveFileId')) return deny('NOT_FOUND', 'NOT_UPLOADED');
  return { ok: true, clienteId };
}

export type GoogleCalendarRole = 'writer' | 'reader';

/**
 * Who may see the firm's Google calendar in their own Google Calendar
 * (D49, PERMISOS.md note 11). It holds every client, internal records too,
 * so only the partners who administer the portal, as writers: an
 * appointment they move there comes back to the portal. A lawyer or an
 * assistant sees only their clients: their personal feed shows that.
 */
export function firmCalendarRole(user: {
  lado: unknown;
  rolBase: unknown;
}): GoogleCalendarRole | null {
  return user.lado === 'EMPIRICA' && user.rolBase === 'SOCIO_ADMIN' ? 'writer' : null;
}

/**
 * Who may see a client's Google calendar (D49): it holds what the client
 * sees, so its users whose access covers the whole client, as readers. A
 * user of some units (or some matters) has the personal feed instead, which
 * shows exactly their part; the firm sees the client in the firm calendar.
 */
export function clientCalendarRole(
  access: { rol: unknown; alcance: unknown } | undefined,
): GoogleCalendarRole | null {
  return seesWholeClient(access) ? 'reader' : null;
}

/**
 * Whether a client user's access covers the whole client (no units, no
 * matters): who receives what goes to the client as a whole, its Google
 * calendar and its monthly report.
 */
export function seesWholeClient(access: { rol: unknown; alcance: unknown } | undefined): boolean {
  if (!access || !CLIENT_ROLES.some((r) => r === access.rol)) return false;
  return access.alcance === null || access.alcance === undefined;
}

/**
 * Who sends a client's monthly report (F6, PERMISOS.md): the SOCIO_ADMIN and
 * the lawyers of that client. An assistant prepares the draft but does not
 * send it, and a report goes out once.
 */
export function authorizeReportSend(
  ctx: UserContext,
  reporte: Row | undefined,
  lookup: Lookup,
): OnlineDecision {
  if (!reporte || reporte.deleted || !canRead(ctx, 'Reportes', reporte, lookup)) {
    return deny('NOT_FOUND', 'NOT_FOUND');
  }
  const clienteId = clientIdOf(TABLES.Reportes, reporte);
  const rol = clienteId ? ctx.clients.get(clienteId)?.rol : undefined;
  if (!clienteId || (rol !== 'SOCIO_ADMIN' && rol !== 'ABOGADO')) return deny('FORBIDDEN', 'ROLE');
  if (reporte.estado === 'ENVIADO') return deny('CONFLICT', 'ALREADY_SENT');
  return { ok: true, clienteId };
}

export type AiHelper = 'summary' | 'reminder' | 'ask' | 'draft';

/**
 * Who uses each AI helper for a client (IA.md): drafting the report's
 * summary or a reminder is the firm's; asking "what is pending" is for
 * anyone with access, about what they see. Creating records with the AI
 * (F8, D73) is for the client's lawyers only: the SOCIO_ADMIN and its
 * ABOGADO, not assistants and nobody of the client.
 */
export function mayUseAi(ctx: UserContext, helper: AiHelper, clienteId: string): boolean {
  const access = ctx.clients.get(clienteId);
  if (!access) return false;
  if (helper === 'ask') return true;
  if (helper === 'draft') return access.rol === 'SOCIO_ADMIN' || access.rol === 'ABOGADO';
  return isFirmRole(access.rol);
}
