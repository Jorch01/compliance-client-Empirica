/**
 * The portal's bell (`Notificaciones`), written by the server: one row per
 * person told, which reaches only that person's devices. Nobody is told
 * about their own action, about a record they may not see, about a client
 * they no longer have, or while their access is off.
 */
import {
  buildUserContext,
  canRead,
  type NotificationKind,
  type Row,
  type TableName,
  type UserContext,
} from '@empirica/shared';
import type { Database } from './db/database.ts';
import type { Writer } from './db/writer.ts';

export interface NotificationDraft {
  usuarioId: string | null;
  tipo: NotificationKind;
  /** The record it is about: whoever may not see it is not told. */
  about: { table: TableName; row: Row } | null;
  /** The record's title, as typed (the interface words the rest). */
  mensaje: string;
  /** The page that opens it: "/tareas/<id>". */
  link: string | null;
  clienteId: string | null;
}

/** Writes the drafts that pass; returns how many. */
export function saveNotifications(
  db: Database,
  writer: Writer,
  drafts: readonly NotificationDraft[],
  actorId: string | null,
): number {
  if (!drafts.length) return 0;
  const users = new Map(db.rows('Usuarios').map((u) => [u.id, u]));
  const contexts = new Map<string, UserContext>();
  const contextOf = (user: Row): UserContext => {
    let ctx = contexts.get(user.id);
    if (!ctx) {
      ctx = buildUserContext({
        user,
        membresias: db.rows('Membresias'),
        entidades: db.rows('Entidades'),
        clientes: db.rows('Clientes'),
      });
      contexts.set(user.id, ctx);
    }
    return ctx;
  };
  const lookup = db.lookup();
  const seen = new Set<string>();
  const now = writer.meta.serverNow;
  let saved = 0;
  for (const d of drafts) {
    if (!d.usuarioId || d.usuarioId === actorId) continue;
    const user = users.get(d.usuarioId);
    if (!user || user.deleted || user.estado !== 'ACTIVO') continue;
    // One note per person, kind and record in a batch.
    const key = `${d.usuarioId}|${d.tipo}|${d.link ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const ctx = contextOf(user);
    if (d.clienteId && !ctx.clients.has(d.clienteId)) continue;
    if (d.about && !canRead(ctx, d.about.table, d.about.row, lookup)) continue;
    writer.save('Notificaciones', undefined, {
      id: db.env.uuid(),
      createdAt: now,
      createdBy: writer.meta.userId,
      updatedAt: now,
      updatedBy: writer.meta.userId,
      version: 1,
      deleted: null,
      fieldTimestamps: {},
      usuarioId: d.usuarioId,
      clienteId: d.clienteId,
      tipo: d.tipo,
      mensaje: d.mensaje.slice(0, 300),
      link: d.link,
      leida: false,
    });
    saved++;
  }
  return saved;
}
