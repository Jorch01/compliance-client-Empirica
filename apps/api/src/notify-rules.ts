/**
 * Who hears what, as changes arrive by sync (F5). Each rule names the
 * person and the record; `saveNotifications` then drops whoever acted, whoever
 * may not see the record, and whoever is not active.
 *
 * - A task given to someone: that person.
 * - A task a client sends to review: whoever runs its matter at the firm,
 *   else the client's lawyer.
 * - Evidence a client sends: the client's lawyer. Evidence validated or
 *   turned down: whoever sent it.
 * - A request from a client: the client's lawyer.
 * - An answer to a suggestion or report: its author.
 */
import { text, type Row, type TableName, type UserContext } from '@empirica/shared';
import type { Database } from './db/database.ts';
import type { NotificationDraft } from './notify.ts';

const titleOf = (row: Row | undefined): string =>
  row
    ? (text(row, 'titulo') ??
      text(row, 'nombre') ??
      text(row, 'contraparte') ??
      text(row, 'razonSocial') ??
      '')
    : '';

/** A firm user's id, or null for anyone else. */
function firmUser(db: Database, id: string | null): string | null {
  const u = id ? db.table('Usuarios').get(id) : undefined;
  return u?.lado === 'EMPIRICA' ? u.id : null;
}

function lawyerOf(db: Database, clienteId: string | null): string | null {
  const client = clienteId ? db.table('Clientes').get(clienteId) : undefined;
  return client ? firmUser(db, text(client, 'abogadoResponsableId')) : null;
}

export function draftsFor(
  db: Database,
  actor: UserContext,
  table: TableName,
  before: Row | undefined,
  after: Row,
  clienteId: string | null,
): NotificationDraft[] {
  if (after.deleted) return [];
  const fromClient = actor.lado === 'CLIENTE';
  const about = { table, row: after };
  const out: NotificationDraft[] = [];

  if (table === 'Tareas') {
    const link = `/tareas/${after.id}`;
    const responsable = text(after, 'responsableId');
    if (responsable && (!before || text(before, 'responsableId') !== responsable)) {
      out.push({
        usuarioId: responsable,
        tipo: 'TAREA_ASIGNADA',
        about,
        mensaje: titleOf(after),
        link,
        clienteId,
      });
    }
    if (fromClient && after.estado === 'EN_REVISION' && before?.estado !== 'EN_REVISION') {
      const asuntoId = text(after, 'asuntoId');
      const asunto = asuntoId ? db.table('Asuntos').get(asuntoId) : undefined;
      out.push({
        usuarioId:
          firmUser(db, asunto ? text(asunto, 'responsableId') : null) ?? lawyerOf(db, clienteId),
        tipo: 'TAREA_EN_REVISION',
        about,
        mensaje: titleOf(after),
        link,
        clienteId,
      });
    }
  }

  if (table === 'CumplimientosHistorial') {
    const obligacionId = text(after, 'obligacionId');
    const obligacion = obligacionId ? db.table('Obligaciones').get(obligacionId) : undefined;
    const link = obligacionId ? `/compliance/${obligacionId}` : null;
    if (!before && fromClient && after.estado === 'EN_REVISION') {
      out.push({
        usuarioId: lawyerOf(db, clienteId),
        tipo: 'EVIDENCIA_ENVIADA',
        about,
        mensaje: titleOf(obligacion),
        link,
        clienteId,
      });
    }
    if (
      before &&
      before.estado !== after.estado &&
      (after.estado === 'VALIDADO' || after.estado === 'RECHAZADO')
    ) {
      out.push({
        usuarioId: text(after, 'createdBy'),
        tipo: after.estado === 'VALIDADO' ? 'EVIDENCIA_VALIDADA' : 'EVIDENCIA_RECHAZADA',
        about,
        mensaje: titleOf(obligacion),
        link,
        clienteId,
      });
    }
  }

  if (table === 'Solicitudes' && !before && fromClient) {
    out.push({
      usuarioId: lawyerOf(db, clienteId),
      tipo: 'SOLICITUD_NUEVA',
      about,
      mensaje: titleOf(after),
      link: `/solicitudes/${after.id}`,
      clienteId,
    });
  }

  if (
    table === 'Sugerencias' &&
    before &&
    text(after, 'respuesta') &&
    text(after, 'respuesta') !== text(before, 'respuesta')
  ) {
    out.push({
      usuarioId: text(after, 'usuarioId'),
      tipo: 'SUGERENCIA_RESPONDIDA',
      about,
      mensaje: (text(after, 'mensaje') ?? '').slice(0, 120),
      link: '/sugerencias',
      clienteId: null,
    });
  }
  return out;
}
