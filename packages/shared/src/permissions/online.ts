/**
 * Online actions that are not edits of a record through `sync.push`:
 * deciding a conflict, and the file of a document. Same rule as the rest
 * (write.ts): what the user cannot see is NOT_FOUND, never FORBIDDEN.
 */
import { isFirmRole } from '../domain/enums.ts';
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
  | 'NOT_UPLOADED';

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
