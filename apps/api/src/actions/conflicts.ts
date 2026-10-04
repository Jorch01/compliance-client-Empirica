/**
 * Deciding a conflict on a legally sensitive field (PLAN.md § 5,
 * "Conflictos"): keep the value that stayed, or apply the one that was
 * proposed. Online only, by the SOCIO_ADMIN or a lawyer of the client
 * (PERMISOS.md); the notices about it are marked read for everyone.
 */
import {
  TABLES,
  authorizeConflictResolution,
  canRead,
  projectRow,
  text,
  validateFields,
  type ConflictDecision,
  type ConflictResolveData,
  type TableName,
  type Value,
} from '@empirica/shared';
import type { Session } from '../auth.ts';
import type { Env } from '../env.ts';
import { ApiError } from '../errors.ts';
import { changed, freshContext, underLock } from './locked.ts';

/** The stored text of a value (push.ts writes it with JSON.stringify). */
function storedValue(value: Value | undefined): Value {
  if (typeof value !== 'string') return value ?? null;
  try {
    return JSON.parse(value) as Value;
  } catch {
    return value;
  }
}

export function conflictLink(conflictoId: string): string {
  return `#/conflictos/${conflictoId}`;
}

export function resolveConflict(
  env: Env,
  session: Session,
  input: { conflictoId: string; decision: ConflictDecision },
): ConflictResolveData {
  return underLock(env, session.user.id, (r) => {
    const ctx = freshContext(r.db, session.user.id);
    const conflicto = r.db.table('Conflictos').get(input.conflictoId);
    const verdict = authorizeConflictResolution(ctx, conflicto, r.db.lookup());
    if (!verdict.ok) throw new ApiError(verdict.code, undefined, { reason: verdict.reason });
    if (!conflicto) throw new ApiError('NOT_FOUND');

    const table = text(conflicto, 'entidad') as TableName;
    const recordId = text(conflicto, 'entidadId') ?? '';
    const field = text(conflicto, 'campo') ?? '';
    let record = r.db.table(table).get(recordId);
    if (!record || !TABLES[table].sensitive.includes(field)) throw new ApiError('NOT_FOUND');

    if (input.decision === 'APLICAR') {
      const check = validateFields(TABLES[table], {
        [field]: storedValue(conflicto.valorPropuesto),
      });
      if (!check.ok) throw new ApiError('VALIDATION', undefined, { issues: check.issues });
      const before = record;
      const after = changed(r, before, { [field]: check.fields[field] ?? null });
      if (after !== before) {
        record = r.writer.save(table, before, after);
        r.writer.audit(
          'RESOLVER',
          table,
          recordId,
          verdict.clienteId,
          { [field]: before[field] ?? null },
          { [field]: record[field] ?? null },
        );
      }
    }

    const resolved = r.writer.save(
      'Conflictos',
      conflicto,
      changed(r, conflicto, {
        estado: 'RESUELTO',
        resueltoPor: ctx.userId,
        decision: input.decision,
      }),
    );
    r.writer.audit(
      'RESOLVER',
      'Conflictos',
      conflicto.id,
      verdict.clienteId,
      { estado: 'PENDIENTE' },
      { estado: 'RESUELTO', decision: input.decision },
    );

    // Nobody else has to act on it any more.
    const link = conflictLink(conflicto.id);
    for (const n of r.db.rows('Notificaciones')) {
      if (n.deleted || n.leida === true || text(n, 'link') !== link) continue;
      r.writer.save('Notificaciones', n, changed(r, n, { leida: true }));
    }

    const lookup = r.db.lookup();
    return {
      conflicto: projectRow(ctx, 'Conflictos', resolved),
      record: canRead(ctx, table, record, lookup) ? projectRow(ctx, table, record) : null,
    };
  });
}
